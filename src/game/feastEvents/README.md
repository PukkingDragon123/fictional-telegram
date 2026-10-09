# Feast events (v26)

During the 5 PM feast (`game.feast.active`) the player has a free camera and the
event director (`src/game/ext/feast.js`) raises little incidents every 12-25 s.
Each one pops an animated icon above its actor; clicking it zooms the camera in,
slows time, plays the event's `scene`, shows a choice card, then plays the
consequence (`resolve`). Unanswered icons expire and resolve with `expire`.

Every `src/game/feastEvents/*.js` file (except this README) is globbed eagerly and
must export `EVENTS = [ ...defs ]`. Ids are global: prefix yours (`resort_`, `staff_`,
`season_`...). Test one by hand: `__game.feast.raise('karen')` (optionally with an actor),
then `__game.feast.focus()` (= click the newest icon) and `__game.feast.choose('refund')`.

## Event definition

```js
export const EVENTS = [{
  id: 'karen',                        // unique
  name: 'Karen Wants a Refund',       // card title + day log
  icon: 'fe_karen',                   // pop-up glyph: a UI sprite name (src/ui/icons/feastIcons.js has fe_*)
  kind: 'customer',                   // 'bear' | 'customer' | 'beaver' | 'facility' (badge colour)
  weight: 10,                         // relative odds (never-seen events get a bonus)
  ttl: 24,                            // optional: game seconds the icon waits before it expires (default 24)
  maxPerDay: 1,                       // optional (default 1)
  minDay: 2,                          // optional (default 2)
  boss: false,                        // optional: true = may also fire on boss days
  text: 'Karen says her berries are rotten.',  // or (ctx) => string: the card's situation line
  when(game) { return true; },        // can it happen now? (buildings, staff, weather... look things up lazily)
  pick(game, feast) { return feast.pickBear(); }, // the actor: bear | beaver | structure | { x, z, y? } | null
  setup(ctx) {},                      // optional: the icon just popped, show the problem in the world
  async scene(ctx) {},                // the close-up after the click (camera, lines, props)
  choices(ctx) { return [             // 2-3 choices, shown on the card after the scene
    { id: 'refund', label: 'Refund her', cost: { coins: 12 }, tone: 'good' },
    { id: 'refuse', label: 'No refunds', cost: { rating: -0.2 }, tone: 'bad' },
  ]; },
  async resolve(ctx, choiceId) {},    // the consequence; ALSO runs on expiry (ctx.expired = true, no camera)
  expire: 'refuse',                   // choice used when the icon times out (default: the last choice)
  cleanup(ctx) {},                    // optional, always runs at the end (props / held bears are released for you)
}];
```

`cost` keys shown on the card: `coins` (number), `rating` (stars, negative = a risk),
`fish` (fish from the pond), `text` (any short note, e.g. 'a beaver'). A choice with a
coin cost the player can't afford is disabled. Costs are NOT taken for you: take them in
`resolve` with `ctx.pay()`.

`feast.pickBear(filter?)` returns a random customer bear that is free to act: visible, at
the pond (not on the trail, not leaving), not hostile/boss, not already in an event and
`!b.script`. Also: `feast.pickBears(n, filter?)`, `feast.nearBears(x, z, r)`,
`feast.builtOf(types | (s) => bool)` (built structures), `feast.isBusy(actor)`.

## ctx (one per running event)

| field / call | what |
|---|---|
| `ctx.game`, `ctx.feast`, `ctx.def`, `ctx.data` | the game, the director, the definition, scratch space |
| `ctx.actor`, `ctx.bear`, `ctx.s` | the actor; `bear` if it is a bear, `s` if it is a structure |
| `ctx.expired`, `ctx.focused`, `ctx.choice` | flags / the picked choice id |
| `await ctx.wait(sec)` | real seconds in a close-up, game seconds otherwise |
| `ctx.at(who, dy?)` | world point {x, y, z} above a bear / structure / beaver / point |
| **camera** (no-ops when not focused) | |
| `ctx.cam(who, { zoom = 0.016, dy = 0, dx, dz })` | glide the camera onto something (zoom = world units per pixel; smaller = closer) |
| `ctx.track(who, opts)` | keep following it until the next `cam`/`track` |
| `ctx.shake(k = 0.4)` | camera shake |
| **bears** | |
| `ctx.hold(b)` | script the bear (`b.script`): its AI pauses until the event ends or `ctx.release` |
| `ctx.pose(b, name, { face, t01 })` | override its anim (bearRig poses: idle walk run swim sit talk cheer wave sad search angry_stomp smash pay yummy eat stagger calm roar...) ; `null` = back to auto |
| `ctx.face(b, expr, hold?)` | face (bearFace: happy angry furious sad shocked sleepy disgusted smug cheer dizzy love...) |
| `await ctx.walk(b, x, z, { speed = 1.6, pose = 'walk' })` | walk there (straight line, stays on the ground) |
| `ctx.turn(b, who)` / `ctx.faceCam(b)` | turn towards something / towards the camera |
| `ctx.release(b, then = 'decide')` | give it back to its AI: 'decide' / 'leave' / 'rampage' / 'pay' |
| **talk + fx** | |
| `await ctx.say(who, text, { mood, dur, voice })` | comic bubble; resolves when it closes (mood: normal angry shout scared happy think whisper) |
| `ctx.word(text, who, { color, size })` | big comic word pop ("ACHOO!", "PTOO!") |
| `ctx.float(text, who, color)` | small floating text |
| `ctx.sfx(name, opts)`, `ctx.fx` | `game.audio.play`, `game.particles` |
| `ctx.prop(name, opts)` | a voxel prop from `src/entities/feastProps.js` (added to the scene, removed at the end) |
| `ctx.attach(obj, b, slot)` | stick a prop to a bear: 'hand' (right paw), 'handL', 'hold' (in front of the belly), 'head' |
| `ctx.place(obj, x, y, z)` / `ctx.drop(obj)` | put a prop in the world / remove it now |
| `await ctx.crew({ from })` | a helper beaver runs in: `{ go(x, z), play(anim), carry(prop), say(text), leave() }` |
| **economy** (all logged in `game.feast.dayLog`) | |
| `ctx.canPay(n)`, `ctx.pay(n, who?)` | spend coins (coins fly from the feast strip to `who`); false if broke |
| `ctx.earn(n, who?)` | tips: coins fly from `who` into the feast strip |
| `ctx.review(b, stars, text, { weight })` | the bear writes a live review (bubble + rating) |
| `ctx.rating(delta)` | nudge the restaurant rating directly |

Outcomes are recorded for the end-of-day summary: `game.feast.dayLog = [{ id, name, choice, coins, rating }]`
(`choice` is the choice id, or `'expired'`). It resets every morning.

Rules: no emoji in text; short, specific, cozy-goofy copy (Reynard is a greedy, theatrical
fox). Things must happen physically in the world: a prop, an anim, a bubble.
