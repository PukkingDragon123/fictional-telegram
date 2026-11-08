// [v33 tut] Parts 1-6 of the day-1 tour: the hands-on fish course.
//
//   1 First Fish     coins + e-Buy slots, buy the pair, unbox, meet them (name them)
//   2 Feeding Time   the Food slot, Reynard holds up the pellet bag, a quiz, you feed them, the two meters
//   3 The Fish Scope Reynard shows the Scope, you tap a fish, then every stat one by one (tap it, he says
//                    what it means and why it matters, with this fish's own numbers)
//   4 Fish Care      the Pet slot (pet to full), happiness, the pond (room, seaweed, bugs, a quiz),
//                    the Tag slot (tag a favourite), bear-proofing, the Carry slot (drag a fish)
//   5 Love & Eggs    top up the bellies, the date, Reynard holds up an egg, a quiz, dad fertilizes,
//                    the eggs incubate, you hatch one, the fry
//   6 Genes & Money  (optional branch) genes, morphs, value, what bears like, secrets
//
// Every number Reynard says comes from the game's own rules (FishSystem.js, genes.js, data/species.js,
// data/foods.js, BearSystem.js); the comments next to the lines say where. Each wait the player has
// to finish has a fallback, so no step can stall the tour.
import { MORPHS, MUTATIONS, SPECIES_BY_ID } from '../../data/species.js';
import { sizeLabel } from '../genes.js';
import { openFishScope } from '../../ui/FishScope.js';
import { toolPicked } from './hudIntro.js';

const pct = (v) => Math.round(Math.max(0, Math.min(1, v || 0)) * 100);
const scopeNow = () => (typeof window !== 'undefined' ? window.__fishScope?.current || null : null);

/** the middle of the pond (the meadow's water tiles) */
export function pondMid(game) {
  const g = game.grid;
  let sx = 0, sz = 0, n = 0;
  for (let z = 21; z <= 55; z++) for (let x = 48; x <= 92; x++) if (g.inb?.(x, z) && g.isWater(x, z) && g.meadow?.[z * g.w + x]) { sx += x + 0.5; sz += z + 0.5; n++; }
  return n ? [sx / n, sz / n] : [70, 38];
}
const midOf = (a, b) => () => [(a.x + b.x) / 2, (a.z + b.z) / 2];
const live = (f) => f && !f.dead;

// ===================================================================== PART 1: FIRST FISH
export async function firstFish(T) {
  const game = T.game, G = T.guide;
  await T.part(1, 'First Fish');
  await T.hud('coins', { line: 'This is the <b>money</b>. Your money. Well... <b>our</b> money. Mostly <b>mine</b>.', mood: 'smug' });
  const pair = game.ebuyListings().find((l) => l.kind === 'fish' && !l.locked);
  game.quickEggs = true;
  T.force('ebuy', { ebuyFocus: pair?.id || null });
  const ordered = T.until('ordered', (o) => o.items.some((it) => it.kind === 'fish'));
  await T.hud('ebuy', {
    line: '<b>e-Buy</b>. Anything you want, delivered by a moose. Don\'t ask about the moose.', mood: 'excited',
    tryIt: () => ordered,
    tryLine: 'Buy our first <b>2 fish</b>: a boy ♂ and a girl ♀. One pair!',
    nagLine: 'Tap e-Buy and buy the fish pair!',
    timeout: 150,
    fallback: async () => {
      G.bark('Fine. I\'ll click it. Fox fingers.', { mood: 'scheming' });
      try { game.ui?.closeEBuy?.(); if (pair) game.ebuyBuy(pair, 1); } catch (e) { console.warn('[tut] auto order', e); }
    },
  });
  T.force(null);
  T.teach('Moose Express is on it. Four legs. Zero brakes.', { dur: 2.8, mood: 'happy' });
  await T.unboxStep((o) => o.items.some((it) => it.kind === 'fish'));
  const two = await T.firstPair();
  T.holdLove = true; // no romance before Part 5 (Tutorial.update keeps their love timers up)
  const [boy, girl] = two[0].g.sex === 'M' ? two : [two[1], two[0]];
  T.win('NEW FISH!', two[0]);
  // meet them: over his shoulder, down at the water
  await T.cine(async (c) => {
    const mid = midOf(boy, girl);
    await c.walkNear(mid());
    c.ots(mid(), { zoom: 0.0125 });
    await c.beat(0.7);
    const s1 = c.mark(boy, { label: '♂ BOY', color: 'blue' });
    const s2 = c.mark(girl, { label: '♀ GIRL', color: 'pink' });
    await c.say(c.fox, 'Our first *employees*. They work for pellets. Ha!', { style: 'laugh' });
    c.point(boy, { ring: false, arrow: false });
    await c.say(c.fox, 'Him: a *boy*. See the ♂ on his tag?', { style: 'say' });
    c.point(girl, { ring: false, arrow: false });
    await c.say(c.fox, 'Her: a *girl*. ♀. Boy plus girl equals... *BUSINESS*.', { style: 'excited' });
    c.unpoint();
    const v = await c.ask(c.fox, 'Name them! Fish with names sell better.', [
      { label: 'Bonnie & Clyde', value: 'bc' },
      { label: 'Salt & Pepper', value: 'sp' },
      { label: 'Fish & Chips', value: 'fc' },
    ]);
    const N = { bc: ['Clyde', 'Bonnie', 'Outlaws! My kind of fish.'], sp: ['Salt', 'Pepper', 'Seasoned professionals. Love it.'], fc: ['Fish', 'Chips', 'Dark. Delicious. I LOVE it.'] }[v] || ['Clyde', 'Bonnie', 'Classic.'];
    boy.name = N[0]; girl.name = N[1];
    s1(); s2();
    c.mark(boy, { label: N[0].toUpperCase(), color: 'blue', arrow: false });
    c.mark(girl, { label: N[1].toUpperCase(), color: 'pink', arrow: false });
    await c.say(c.fox, N[2], { style: 'laugh', close: 0.011 });
  }, { id: 'tut:meet' });
}

// ===================================================================== PART 2: FEEDING TIME
export async function feeding(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(2, 'Feeding Time');
  await T.hud('feed', { line: 'The <b>FOOD</b> bag. Pick a food, tap the water. Fish come running.', mood: 'happy' });
  await T.cine(async (c) => {
    await c.walkNear(midOf(two[0], two[1])());
    c.hold('pellets');
    c.fox.act('present_trophy', 1.7);
    c.low(c.fox, { zoom: 0.0105, pitch: 0.34, lift: game.fox.y + 1.05 });
    c.sfx('star_pop', { volume: 0.35 });
    await c.beat(1.3);
    await c.say(c.fox, '*Fish Pellets.* Crunchy. Nutritious. Legally food.', { style: 'excited' });
    const v = await c.ask(c.fox, 'Pop quiz! How much does a fish eat?', [
      { label: 'A few pellets', value: 'few' },
      { label: 'The whole bag!', value: 'bag' },
      { label: 'Nothing. It\'s a fish.', value: 'none' },
    ]);
    // FishSystem.feedFish + data/foods.js: a pellet adds 0.34 to the 0..1 well-fed meter; uneaten pellets sink and expire (FoodSystem: life 26 s)
    const R = {
      few: ['Correct! Three pellets and a fish is *WELL FED*. Gold star.', 'happy'],
      bag: ['Whoa, big spender. Pellets nobody eats sink and vanish. That\'s *money in the mud*.', 'scared'],
      none: ['Nothing?! Then nothing is what we sell. *Wrong.*', 'angry'],
    }[v] || ['Three pellets each. Easy.', 'say'];
    await c.say(c.fox, R[0], { style: R[1] });
    if (v !== 'few') await c.say(c.fox, 'About *three pellets* each fills the ♥ *well-fed* meter.', { style: 'say' });
    await c.say(c.fox, 'Your turn. *Tap the water* right by them.', { style: 'excited', close: 0.011 });
  }, { id: 'tut:pellets' });
  await feedPair(T, two, { first: true });
  T.win('FULL BELLIES!', two[1]);
  // what the two meters mean
  await T.cine(async (c) => {
    const f0 = live(two[0]) ? two[0] : two[1];
    c.low(f0, { zoom: 0.011, pitch: 0.46 });
    const m = c.mark(f0, { label: 'WELL FED ♥', color: 'pink' });
    await c.say(c.fox, 'Look at that belly. Now, *two meters* to know.', { style: 'happy' });
    // FishSystem: HUNGER_RATE = 1/150 per second
    await c.say(c.fox, '*HUNGER* creeps up all day. Full to starving: about *two and a half minutes*.', { style: 'say' });
    // FishSystem: the fed meter drains at 1/420 per s, 1/90 per s once hunger > 0.7
    await c.say(c.fox, 'The ♥ *WELL-FED* meter: full means ready for love. Starving fish burn it *5x faster*.', { style: 'say' });
    // FishSystem: hunger x0.3 at night
    await c.say(c.fox, 'Night trick: fish nap. Hunger runs *3x slower* in the dark.', { style: 'whisper' });
    m();
  }, { id: 'tut:meters' });
}

/** the hands-on feeding step (with the "watch the master" fallback) */
export async function feedPair(T, two, { first = false } = {}) {
  const game = T.game, G = T.guide;
  game.setTool({ kind: 'feed' });
  try { game.foodStore.select('pellets'); } catch { /* ignore */ }
  game.ui?.syncFoodPicker?.();
  T.force('feed');
  const stops = two.map((f, i) => G.mark(f, { color: i ? 'pink' : 'blue' }));
  T.teach(first ? '<b>Tap the water</b> near the fish! Watch their ♥ fill up.' : 'Feed them again: <b>tap the water</b> by them!', { target: () => T.fishScreen(two[0]), dur: 6 });
  T.nag(() => 'Tap the water near the fish to feed them!');
  const fed = () => two.every((f) => !live(f) || f.fed >= 0.9);
  try {
    if (!(await T.within(T.waitFor(fed), first ? 55 : 40))) {
      G.bark('Allow me. Watch the master.', { mood: 'scheming' });
      for (let k = 0; k < 4 && !fed(); k++) {
        for (const f of two) if (live(f) && f.fed < 0.9) { try { game.foodStore.throwAt(f.x, f.z); } catch { /* ignore */ } }
        await T.wait(2.4);
      }
      if (!fed()) for (const f of two) if (live(f)) { f.fed = Math.max(f.fed, 1); f.hunger = Math.min(f.hunger, 0.2); }
    }
  } finally {
    T.stopNag();
    stops.forEach((s) => s());
    T.force(null);
    T.clearChalk();
  }
}

// ===================================================================== PART 3: THE FISH SCOPE
export async function fishScope(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(3, 'The Fish Scope');
  await T.cine(async (c) => {
    c.hold('scope');
    c.fox.act('present_trophy', 1.6);
    c.low(c.fox, { zoom: 0.0105, pitch: 0.34, lift: game.fox.y + 1.05 });
    c.sfx('star_pop', { volume: 0.35 });
    await c.beat(1.3);
    await c.say(c.fox, 'Behold: the *Fish Scope*. My finest invention. Patent pending. Forever.', { style: 'excited' });
    await c.say(c.fox, 'Point it at a fish and it spills *everything*. Hunger. Mood. Genes. *Price.*', { style: 'laugh' });
    await c.say(c.fox, 'Go on. *Tap a fish.*', { style: 'say', close: 0.011 });
  }, { id: 'tut:scope' });
  game.setTool({ kind: 'feed' });
  T.force('feed');
  const ms = two.map((f, i) => G.mark(f, { color: i ? 'pink' : 'blue', label: 'TAP ME' }));
  T.teach('<b>Tap a fish</b> to scan it!', { target: () => T.fishScreen(two[1]), dur: 5, mood: 'excited' });
  T.nag(() => 'Tap one of the fish to open the Fish Scope!');
  let fish = null;
  try {
    if (!(await T.within(T.waitFor(() => !!scopeNow()), 40))) {
      fish = two.find(live);
      G.bark('Here, I\'ll aim it for you.', { mood: 'happy' });
      if (fish) openFishScope(game, fish);
    }
  } finally {
    T.stopNag();
    ms.forEach((s) => s());
    T.clearChalk();
  }
  await T.hideTeacher();
  await scopeTour(T);
  T.force(null);
}

async function scopeTour(T) {
  const game = T.game, G = T.guide;
  let S = scopeNow();
  if (!S) return;
  const fish = S.fish;
  // the scope closes if you tap outside it: it comes right back
  const reopen = async () => {
    S = scopeNow();
    if (!S && live(fish) && !fish.held) { S = openFishScope(game, fish); await T.wait(0.7); }
    if (S) S.tipKey = '__tut'; // [v33 tut] no idle chatter over the lesson
    return S;
  };
  const say = (text, expr = 'teacher') => { const s = scopeNow(); if (!s) return; try { s.tipKey = '__tut'; s.speak(text, expr); s.poseT = Math.max(s.poseT || 0, 5); } catch { /* ignore */ } };
  const read = (text) => {
    // auto-advance after reading time, or tap the speech line / press Enter
    const secs = Math.min(7, 2 + text.length * 0.045);
    return T.within(new Promise((res) => {
      const s = scopeNow();
      const el = s?.el?.querySelector('.fsc-say');
      const k = (e) => { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); off(); res(); } };
      const c = () => { off(); res(); };
      const off = () => { window.removeEventListener('keydown', k, true); el?.removeEventListener('click', c); };
      window.addEventListener('keydown', k, true);
      el?.addEventListener('click', c);
      setTimeout(off, secs * 1000 + 100);
    }), secs);
  };
  await reopen();
  if (!S) return;
  const g = fish.g;
  const mo = MORPHS[g.morph] || MORPHS.normal;
  const mu = g.mut ? MUTATIONS[g.mut] : null;
  const nm = fish.name || fish.sp?.name || 'This one';
  let worth = 0;
  try { worth = Math.round(game.fish.coinValue(fish) * 7 * (game.mods?.fishValueMult || 1) * (game.mods?.payMult || 1)); } catch { /* ignore */ }
  const hello = `${nm}, under the Scope! Let's read it. One stat at a time.`;
  say(hello, 'excited');
  await read(hello);
  const steps = [
    // FishSystem: 1/150 per s hunger; the scope's 4 pips = the well-fed meter (fed >= 0.9 = full)
    { k: 'hunger', label: 'HUNGER', why: () => `${pct(fish.hunger)}% hungry. The 4 pips are the WELL-FED meter: all 4 lit = ready for love.` },
    // Game.nurtureFish +0.2 a pet; FishSystem: love fades over 240 s; genes.breedGenes: nurtured parents x1.6 luck
    { k: 'mood', label: 'MOOD', why: () => `Happy ${pct(fish.love)}%. Petting fills it. Happy parents roll luckier babies.` },
    { k: 'sex', label: 'SEX', why: () => (g.sex === 'M' ? 'A boy. After a date, he swims over and fertilizes the eggs.' : 'A girl. After a date, she lays the eggs.') },
    // data/species.js MORPHS values
    { k: 'morph', label: 'COLOUR', why: () => `${mo.name}. Wild Type pays x1, Albino x1.6, Golden x5, Prismatic x8. I need a lie-down.` },
    // genes.valueMult / mealMult: value scales with size; breedGenes: babies average their parents
    { k: 'size', label: 'SIZE', why: () => `${sizeLabel(g.size)}, x${g.size.toFixed(2)}. Bigger feeds bears more and sells higher. Big parents, big babies.` },
    // genes.pickMutation: about 0.2 of fresh rolls get one; galaxy x8
    { k: 'mut', label: 'MUTATION', why: () => (mu ? `${mu.name}! Worth x${mu.value}. Mutants glow, burn or sparkle. Treasure it.` : 'No mutation. About 1 fresh egg in 5 rolls one. A Galaxy pays x8.') },
  ];
  for (const st of steps) {
    if (!(await reopen())) break;
    const sel = `.fsc-call[data-k="${st.k}"]`;
    const arrow = G.marks.ui(sel);
    say(`Tap ${st.label}.`, 'focused');
    await T.within(T.waitFor(() => { const s = scopeNow(); return !s || !!s.open?.[st.k]; }), 14);
    if (!(await reopen())) { arrow.stop(); break; }
    if (!S.open[st.k]) { try { S.toggle(st.k); } catch { /* ignore */ } }
    arrow.stop();
    const why = st.why();
    say(why, 'teacher');
    await read(why);
    const s = scopeNow();
    if (s?.open?.[st.k]) { s.open[st.k] = false; try { s.renderCalls(); } catch { /* ignore */ } }
  }
  // worth, the action buttons, closing
  const extra = [
    // FishScope worth = coinValue * 7; FishSystem.coinValue = meal * value * valueMult(size x morph x mutation)
    { sel: '.fsc-worth', text: `WORTH: ${worth} coins. That's what a bear pays to eat it. Size x colour x mutation.`, expr: 'greedy' },
    { sel: '.fsc-btns', text: 'Tag and Pet buttons live down here too. Handy.', expr: 'smug' },
  ];
  for (const x of extra) {
    if (!(await reopen())) break;
    const a = G.marks.ui(x.sel);
    say(x.text, x.expr);
    await read(x.text);
    a.stop();
  }
  if (scopeNow()) {
    const a = G.marks.ui('.fsc-x');
    say('That\'s the Scope. Tap the X to close it.', 'happy');
    if (!(await T.within(T.waitFor(() => !scopeNow()), 20))) { try { scopeNow()?.close(); } catch { /* ignore */ } }
    a.stop();
  }
  await T.wait(0.4);
}

// ===================================================================== PART 4: FISH CARE
export async function fishCare(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(4, 'Fish Care');
  // ---- petting
  const loved = () => two.some((f) => live(f) && f.love >= 0.99);
  let ms = [];
  await T.hud('pet', {
    line: '<b>PET</b>. Yes, we pet fish. Happy fish make <b>fancy</b> babies.', mood: 'happy',
    tryLine: 'Tap <b>PET</b>, then tap a fish again and again!',
    nagLine: 'Pet tool: tap a fish until its heart is full!',
    timeout: 70,
    tryIt: async () => {
      T.force('pet');
      if (!(await T.within(toolPicked(T, 'nurture'), 20))) game.setTool({ kind: 'nurture' });
      ms = two.map((f, i) => G.mark(f, { color: 'pink', label: i ? null : 'PET ME' }));
      T.teach('Now <b>tap a fish</b>, again and again, till its heart is full!', { target: () => T.fishScreen(two[0]), dur: 5, mood: 'happy' });
      await T.waitFor(loved);
    },
    fallback: async () => {
      G.bark('Like this. Gently. Pat pat.', { mood: 'happy' });
      const f = two.find(live);
      for (let i = 0; i < 6 && f && !loved(); i++) { game.nurtureFish(f); await T.wait(0.45); }
    },
  });
  ms.forEach((s) => s());
  T.force(null);
  game.setTool({ kind: 'feed' });
  await T.cine(async (c) => {
    const f = two.find((x) => live(x) && x.love >= 0.9) || two.find(live);
    c.low(f, { zoom: 0.011, pitch: 0.44 });
    const m = c.mark(f, { label: 'HAPPY', color: 'pink' });
    await c.say(c.fox, 'Look at that face. *Nurtured.*', { style: 'happy' });
    // FishSystem: love > 0.2 -> loveT ticks x1.5 and fry grow x(1 + nurtureMult) = x2
    await c.say(c.fox, 'Happy fish fall in love *1.5x sooner*. Happy babies grow up *twice as fast*.', { style: 'excited' });
    // genes.breedGenes: nurtured parents roll with x1.6 luck (morphs, traits, mutations)
    await c.say(c.fox, 'And happy parents roll *luckier* babies. Rarer colours. Better traits.', { style: 'laugh' });
    // FishSystem: love -= dt / 240
    await c.say(c.fox, 'It fades in about *four minutes*. Pet often. It\'s *free*. My favourite price.', { style: 'say' });
    m();
  }, { id: 'tut:happy' });

  // ---- the pond
  await T.cine(async (c) => {
    const P = pondMid(game);
    await c.walkNear(P);
    c.low(P, { zoom: 0.024, pitch: 0.62, lift: 0 });
    const cap = game.fish.capacity(), pop = game.fish.population();
    c.point(P, { label: `${pop} / ${cap} FISH`, r: 2.6, color: 'blue' });
    await c.say(c.fox, 'The pond. Our *factory floor*.', { style: 'excited' });
    // FishSystem.capacity: water tiles x 0.62
    await c.say(c.fox, `Room for about *${cap} fish*. More water, more fish.`, { style: 'say' });
    // FishSystem.update: canBreed only while population < capacity
    await c.say(c.fox, 'Full pond? Nobody dates. No eggs. No money. *Tragic.*', { style: 'sad' });
    c.unpoint();
    const weed = game.structures.list.filter((s) => s.type === 'seaweed' && s.built && !s.removed)
      .sort((a, b) => Math.hypot(a.x - P[0], a.z - P[1]) - Math.hypot(b.x - P[0], b.z - P[1]))[0];
    // FishSystem: hungry (> 0.4) fish graze seaweed; data/structures.js seaweed: shelterFry
    if (weed && Math.hypot(weed.x - P[0], weed.z - P[1]) < 16) {
      await c.walkNear(weed);
      c.low(weed, { zoom: 0.013, pitch: 0.42 });
      c.point(weed, { label: 'SEAWEED', color: 'green' });
      await c.say(c.fox, '*Seaweed.* Free salad. Hungry fish graze it, and fry hide in it from bears.', { style: 'happy' });
      c.unpoint();
    } else {
      await c.say(c.fox, 'Later: plant *seaweed*. Free salad, and fry hide in it from bears.', { style: 'happy' });
    }
    // FishSystem.startJump / updateJump: hungry adults leap for dipping bugs: -0.45 hunger, +0.3 fed, 30 s romance boost
    await c.say(c.fox, 'Bug skimming the water? Hungry fish *JUMP* for it. A snack *and* a romance boost.', { style: 'excited' });
    const v = await c.ask(c.fox, 'Pop quiz. The pond is FULL. We...', [
      { label: 'Make it bigger', value: 'big' },
      { label: 'Sell some to bears', value: 'sell' },
      { label: 'Cry', value: 'cry' },
    ]);
    const R = {
      big: ['Yes! More water, more room, more fish. *More money.*', 'excited'],
      sell: ['Ruthless. Correct. At five, the bears eat the extras. And they *pay*.', 'laugh'],
      cry: ['Crying adds water. Technically correct. Useless... but correct.', 'sad'],
    }[v] || ['Both work. Crying doesn\'t.', 'say'];
    await c.say(c.fox, R[0], { style: R[1], close: 0.011 });
  }, { id: 'tut:pond' });

  // ---- tags
  const girl = two.find((f) => live(f) && f.g.sex === 'F') || two.find(live);
  let tagMs = [];
  await T.hud('tag', {
    line: '<b>DO NOT EAT</b> tags. Bears can read. Mostly.', mood: 'scheming',
    tryLine: 'Tap <b>TAG</b>, then tap your favourite fish!',
    nagLine: 'Tag tool: tap a fish to tag it DO NOT EAT!',
    timeout: 60,
    tryIt: async () => {
      T.force('tag');
      const tagged = T.until('fishTagged');
      if (!(await T.within(toolPicked(T, 'tag'), 20))) game.setTool({ kind: 'tag' });
      tagMs = two.map((f) => G.mark(f, { color: 'red' }));
      T.teach('Now tap your <b>favourite</b> fish!', { target: () => T.fishScreen(girl), dur: 5, mood: 'happy' });
      await tagged;
    },
    fallback: async () => { G.bark('Her. She has that star quality.', { mood: 'happy' }); if (girl && !girl.tagged) game.tagFish(girl); },
  });
  tagMs.forEach((s) => s());
  T.force(null);
  game.setTool({ kind: 'feed' });
  await T.cine(async (c) => {
    const f = two.find((x) => live(x) && x.tagged) || girl;
    await c.walkNear(f);
    c.ots(f, { zoom: 0.012 });
    c.hold('tag');
    const m = c.mark(f, { label: 'DO NOT EAT', color: 'red' });
    // BearSystem / FishSystem.nearestFor: tagged fish are skipped
    await c.say(c.fox, 'Tagged! No bear will touch that fish. *Ever.*', { style: 'happy' });
    // Game.tagLimit = 1 + research
    const n = game.tagLimit();
    await c.say(c.fox, n <= 1 ? 'You get *ONE* tag. One. Choose your favourite child wisely.' : `You get *${n}* tags. Choose your favourites wisely.`, { style: 'laugh' });
    // StructureSystem.isSheltered (lily pads, platforms) + tanks: bears can't reach
    await c.say(c.fox, 'More bear-proofing later: *lily pads*, *stilt platforms*, *glass tanks*. Bears can\'t reach.', { style: 'scheming' });
    m();
  }, { id: 'tut:tag' });

  // ---- carry
  const heldAny = () => game.fish.list.some((f) => f.held);
  await T.hud('hand', {
    line: '<b>CARRY</b>. Grab a fish, drag it anywhere. Matchmaking, eviction... moving day.', mood: 'happy',
    tryLine: 'Tap <b>CARRY</b>, then press on a fish and drag it!',
    nagLine: 'Carry tool: press on a fish and drag it!',
    timeout: 45,
    tryIt: async () => {
      T.force('hand');
      if (!(await T.within(toolPicked(T, 'hand'), 20))) game.setTool({ kind: 'hand' });
      const m = two.map((f) => G.mark(f, { color: 'gold' }));
      try { await T.waitFor(heldAny); await T.waitFor(() => !heldAny()); } finally { m.forEach((s) => s()); }
    },
    fallback: async () => { G.bark('You\'ll get the hang of it. Moving on!', { mood: 'happy' }); },
  });
  T.force(null);
  game.setTool({ kind: 'feed' });
}

// ===================================================================== PART 5: LOVE & EGGS
export async function loveEggs(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(5, 'Love & Eggs');
  if (two.some((f) => live(f) && f.fed < 0.9)) {
    await T.cine(async (c) => {
      c.low(midOf(two[0], two[1])(), { zoom: 0.013, pitch: 0.46 });
      await c.say(c.fox, 'Hear that? Bellies rumbling. Love needs *full bellies*.', { style: 'say' });
      await c.say(c.fox, 'Feed them again. You know how.', { style: 'smug', close: 0.011 });
    }, { id: 'tut:refeed' });
    await feedPair(T, two);
  }
  T.holdLove = false;
  for (const f of two) if (live(f)) { f.loveT = Math.min(f.loveT, 1); f.fed = Math.max(f.fed, 1); f.hunger = Math.min(f.hunger, 0.3); }
  game.rig.lookAt(...midOf(two[0], two[1])());
  // listen for every stage up front: the pond doesn't wait for the talking
  const seen = { date: false, laid: false, fert: false, hatch: false };
  const dateP = T.until('fishDate').then(() => { seen.date = true; });
  const laidP = T.until('fishMated').then(() => { seen.laid = true; });
  const fertP = T.until('eggFertilized').then(() => { seen.fert = true; });
  const hatched = T.until('eggHatched').then(() => { seen.hatch = true; });
  T.watchPair = two;
  G.bark('Shh... watch them. Romance.', { mood: 'whisper', dur: 3 });
  if (!seen.date) await T.within(Promise.race([dateP, laidP, fertP, hatched]), 35);
  if (!seen.date && !seen.laid && !seen.fert && !seen.hatch) { T.forceDate(two); await T.within(dateP, 6); }
  if (seen.date && !seen.laid) G.bark('A *date*! Little loops. Hearts. Give them privacy.', { mood: 'excited', dur: 4 });
  if (!seen.laid && !seen.fert && !seen.hatch) await T.within(Promise.race([laidP, fertP, hatched]), 45);
  T.watchPair = null;
  // still nothing: a clutch appears the old-fashioned way (the tour can't wait forever)
  if (!seen.laid && !seen.fert && !seen.hatch && !game.fish.eggs.some((e) => !e.bought)) {
    const [a, b] = two;
    if (live(a) && live(b)) { a.dateT = b.dateT = 0; try { game.fish.mate(a, b); } catch (e) { console.warn('[tut] mate', e); } }
  }
  const clutch = () => game.fish.eggs.find((e) => !e.bought && !e.dead);
  // the eggs: Reynard holds one up and quizzes you
  if (!seen.hatch && clutch()) {
    await T.cine(async (c) => {
      const e = clutch();
      await c.walkNear(e);
      c.hold('egg');
      c.fox.act('present_trophy', 1.4);
      c.low(c.fox, { zoom: 0.0105, pitch: 0.34, lift: game.fox.y + 1.05 });
      await c.beat(1.2);
      await c.say(c.fox, 'EGGS! Little orange money beans.', { style: 'excited' });
      c.ots(e, { zoom: 0.012 });
      const m = c.mark(e, { label: 'EGGS', color: 'gold' });
      const v = await c.ask(c.fox, 'Mum laid them. Now who *fertilizes* the eggs?', [
        { label: 'Dad', value: 'dad' },
        { label: 'Mum', value: 'mum' },
        { label: 'The stork', value: 'stork' },
      ]);
      const R = {
        dad: ['Correct! Dad swims over and hovers on them. Very dignified.', 'happy'],
        mum: ['Mum did her bit. Dad swims over and does the rest.', 'say'],
        stork: ['The stork is a *con artist*. It\'s Dad. Dad does it.', 'angry'],
      }[v] || ['Dad does it.', 'say'];
      await c.say(c.fox, R[0], { style: R[1] });
      // FishSystem: SPOIL_TIME = 90 s for a laid, unfertilized clutch
      await c.say(c.fox, 'If Dad dawdles more than *90 seconds*, the eggs fizzle. Tick tock, Dad.', { style: 'scared' });
      m();
    }, { pause: true, id: 'tut:eggs' });
  }
  // dad does his job (nudge him if he wandered off)
  if (!seen.fert && !seen.hatch) {
    const ok = await T.within(Promise.race([fertP, hatched]), 25);
    if (!ok) { const e = game.fish.eggs.find((x) => x.stage === 'laid'); if (e) game.fish.fertilize(e, null); }
  }
  if (!seen.hatch) {
    // FishSystem.fertilize: incubation 150-210 s (the tour runs the express version)
    G.bark('Fertilized! Now they *incubate*. A few minutes. Today: express service.', { mood: 'happy', dur: 4 });
    const bred = game.fish.eggs.find((e) => !e.bought && e.stage !== 'laid');
    if (bred && !bred.ready) bred.t = Math.min(bred.t, 5);
    if (!game.fish.eggs.some((e) => e.ready)) await T.within(Promise.race([T.until('eggReady'), hatched]), 30);
    if (!seen.hatch) {
      const ready = game.fish.eggs.find((e) => e.ready) || game.fish.eggs.find((e) => !e.bought);
      if (ready && !ready.ready) { ready.t = 0; ready.ready = true; }
      if (ready) { game.ui?.stopTracking?.(); game.rig.lookAt(ready.x, ready.z); }
      game.quickEggs = false;
      await T.wait(0.6);
      const st = ready ? G.mark(ready, { label: 'TAP!', color: 'gold' }) : null;
      const stop = T.pointAt('sel:.eggtag.ready');
      // FishSystem.tickEgg: ready eggs wait for a tap
      T.teach('Ready eggs wait for <b>you</b>. No rush... but I\'m rushing. <b>Tap the egg!</b>', { target: 'sel:.eggtag.ready', dur: 5, mood: 'excited' });
      T.nag(() => 'Tap the glowing egg to hatch it!');
      if (!(await T.within(hatched, 50))) {
        G.bark('I\'ll do the honours.', { mood: 'happy' });
        const e = game.fish.eggs.find((x) => x.ready);
        if (e) { try { game.ui.tapPondEgg(e); } catch { /* ignore */ } }
        if (!(await T.within(hatched, 20))) { const e2 = game.fish.eggs.find((x) => x.ready); if (e2) { const born = game.fish.hatchNow(e2); game.emit('eggHatched', born[0] || null); } }
      }
      T.stopNag();
      stop?.();
      st?.();
    }
  }
  game.quickEggs = false;
  await T.wait(0.8);
  T.win('A BABY!');
  const baby = game.fish.list.filter((f) => !f.adult && !f.tank).sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  T.baby = baby || null;
  if (baby) {
    await T.cine(async (c) => {
      await c.walkNear(baby);
      c.ots(baby, { zoom: 0.0115 });
      const m = c.mark(baby, { label: 'FRY', color: 'green' });
      await c.say(c.fox, 'A *fry*! Our first baby. I\'m not crying. It\'s pond water.', { style: 'happy' });
      // FishSystem: GROW_TIME 70 / species growth (bluegill 1.2) when hunger < 0.7; x0.35 when hungry
      await c.say(c.fox, 'Fed fry grow up in about *a minute*. Hungry fry grow *3x slower*.', { style: 'say' });
      // FishSystem.coinValue: fry x0.35
      await c.say(c.fox, 'Bears pay only a *third* for a fry. Patience pays. Literally.', { style: 'scheming' });
      m();
    }, { id: 'tut:baby' });
  }
}

// ===================================================================== PART 6: GENES & MONEY
export async function genesMoney(T) {
  const game = T.game, two = T.pair;
  await T.part(6, 'Genes & Money');
  const [mum, dad] = two[0]?.g?.sex === 'F' ? two : [two[1], two[0]];
  const sp = (T.baby || mum || dad)?.sp || SPECIES_BY_ID.bluegill;
  await T.cine(async (c) => {
    c.low(c.fox, { zoom: 0.011, pitch: 0.36, lift: game.fox.y + 1.05 });
    c.expr('scheming', 3);
    const v = await c.ask(c.fox, 'Want the *secret* stuff? Genes. Money. Bear gossip.', [
      { label: 'Tell me everything', value: 'yes' },
      { label: 'Skip to building', value: 'no' },
    ], { style: 'whisper' });
    if (v === 'no') { await c.say(c.fox, 'Fine. Ignorance is cheaper. For now.', { style: 'smug' }); return; }
    await c.say(c.fox, 'Lean in. This is the stuff they *don\'t* tell you.', { style: 'whisper' });
    // ---- genes
    c.hold('fish', { species: sp.id });
    c.fox.act('present_trophy', 1.4);
    await c.beat(1.2);
    await c.say(c.fox, 'Every fish carries *genes*: size, colour, traits, mutations.', { style: 'say' });
    const a = mum?.g?.size ?? 1.04, b = dad?.g?.size ?? 0.96;
    const avg = (a + b) / 2;
    const q = await c.ask(c.fox, `Mum is x${a.toFixed(2)}. Dad is x${b.toFixed(2)}. Their baby is about...`, [
      { label: `x${(a + b).toFixed(2)}`, value: 'sum' },
      { label: `x${avg.toFixed(2)}`, value: 'avg' },
      { label: `x${Math.max(0.5, Math.min(a, b) - 0.3).toFixed(2)}`, value: 'small' },
    ]);
    const R = {
      avg: ['Bingo. The *average*, give or take a wiggle. Breed big, get big.', 'happy'],
      sum: ['They don\'t ADD UP. Fish aren\'t coins. Sadly. It\'s the *average*.', 'say'],
      small: ['Pessimist! It\'s the *average*, give or take a wiggle.', 'say'],
    }[q] || ['It\'s the average.', 'say'];
    // genes.breedGenes: size = parents' mean + (rand - 0.45) x 0.14 x luck: a tiny upward lean
    await c.say(c.fox, R[0], { style: R[1] });
    await c.say(c.fox, 'Secret #1: the wiggle leans *up*. Breed the biggest, every generation gets a hair bigger.', { style: 'whisper' });
    c.drop();
    c.hold('fish', { species: sp.id, golden: true });
    c.sfx('reveal_rare', { volume: 0.35 });
    // genes.breedGenes inheritMorph: 38% per parent with a rare morph
    await c.say(c.fox, 'Secret #2: colours run in families. A *Golden* parent passes it on about *4 times in 10*.', { style: 'excited' });
    // genes.pickTraits: inherited traits 45%; mutations: a parent's passes 30%
    await c.say(c.fox, 'Traits pass on almost *half* the time. Mutations, about *1 in 3*.', { style: 'say' });
    // data/species.js: hybrids (30% of cross-species clutches with a recipe)
    await c.say(c.fox, 'Secret #3: two *different* species can make a brand new one. A *hybrid*. Science! Or love.', { style: 'laugh' });
    // data/foods.js: clover / moonberry / royal jelly luck -> FishSystem.mate foodLuck
    await c.say(c.fox, 'Secret #4: fancy food like *Four-Leaf Clovers* makes the next babies luckier.', { style: 'whisper' });
    c.drop();
    const more2 = await c.ask(c.fox, 'Now... the *money* secrets?', [
      { label: 'Show me the money', value: 'yes' },
      { label: 'Enough. Let\'s build', value: 'no' },
    ], { style: 'whisper' });
    if (more2 === 'no') { await c.say(c.fox, 'A builder! I respect it. Money talk later.', { style: 'happy' }); return; }
    // ---- money
    c.hold('coins');
    c.fox.act('present_trophy', 1.4);
    c.sfx('coins', { volume: 0.4 });
    await c.beat(1.2);
    // genes.valueMult: size x morph x mutation, chonky x1.35
    await c.say(c.fox, 'A fish\'s price: *size* x *colour* x *mutation*. Chonky fish add *35%*.', { style: 'greedy' });
    // BearSystem.finishReview: golden / prismatic -> +1 star
    await c.say(c.fox, 'Secret #5: a bear who eats a *Golden* fish gives an extra *star*. Gold is the best seasoning.', { style: 'laugh' });
    // BearSystem.catchFish: lucky trait -> tips
    await c.say(c.fox, 'Secret #6: *Lucky* fish make bears *tip* extra. Lucky for *us*.', { style: 'excited' });
    // BearSystem: from day 5 some bears prefer a species; the wrong fish fills them 40% less and can cost a star
    await c.say(c.fox, 'Secret #7: from day 5, some bears crave *one species*. Serve the wrong one and they stay hungrier.', { style: 'say' });
    // BearSystem pay: 5 stars -> 25% tip, 4 stars -> 10%
    await c.say(c.fox, 'Secret #8: a *5-star* bear tips a quarter on top. Happy bears, fat wallets.', { style: 'greedy' });
    // FishSystem.nearestFor: bears go for adults first, fry last
    await c.say(c.fox, 'Last one: bears grab *grown-ups* before fry. Keep your babies growing... somewhere safe.', { style: 'scheming', close: 0.011 });
  }, { id: 'tut:genes' });
}
