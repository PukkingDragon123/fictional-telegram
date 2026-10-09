// [v26 feast] Special guests: critics, birthdays, phones in the pond, influencers,
// proposals, inspectors, lost cubs, raccoons, dine-and-dashers. Format: ./README.md
import { disguise, plainBear, price, chance, spotNear, headingTo, toss, glide, nearestWater, shoreNear, pick } from '../feast/kit.js';
import { SPECIES_BY_ID } from '../../data/species.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
async function crewTo(ctx, b, { carry = null, r = 0.95, speed = 4 } = {}) {
  const c = await ctx.crew({ near: b });
  if (carry) c.carry(carry);
  const p = spotNear(ctx.game, b, r, headingTo(b, c));
  await c.go(p.x, p.z, { speed });
  c.face(b);
  return c;
}
// the most valuable fish in the pond (the critic's dinner)
function bestFish(game) {
  let best = null, bv = -1;
  for (const f of game.fish.list) { if (!f.adult || f.tagged || f.tank || f.held) continue; const v = game.fish.coinValue(f); if (v > bv) { bv = v; best = f; } }
  return best;
}

export const EVENTS = [
  // ------------------------------------------------------------ the incognito critic
  {
    id: 'critic', name: 'A Critic in Disguise', icon: 'fe_critic', kind: 'customer', weight: 8, ttl: 26, minDay: 4,
    text: (ctx) => `That "${ctx.bear.name}" has a monocle, a notepad and a very fake moustache. A food critic, incognito. Every bite goes in the notes.`,
    pick: (game, f) => f.pickBear(plainBear, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      disguise(ctx, b);
      ctx.data.pad = ctx.attach(ctx.prop('notepad'), b, 'hand');
      ctx.pose(b, 'talk', { face: 'dainty' });
      ctx.anim((dt, t) => { if (ctx.data.done) return false; if (Math.floor(t / 2.2) !== ctx.data.k) { ctx.data.k = Math.floor(t / 2.2); ctx.sfx('pen', { volume: 0.2 }); } return true; });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.faceCam(b);
      ctx.cam(b, { zoom: 0.012, dy: 0.3 });
      await ctx.say(b, 'Hmm. Hmm hmm. *scribble*', { mood: 'whisper' });
      ctx.cam(ctx.data.pad, { zoom: 0.0105 });
      ctx.word('SCRIBBLE', ctx.data.pad, { color: 'white', size: 2 });
      ctx.sfx('pen', { volume: 0.5 });
      await ctx.wait(1.3);
      ctx.cam(b, { zoom: 0.014 });
      await ctx.say(b, 'I am just a regular bear. Who ADORES fish.', { mood: 'normal' });
    },
    choices(ctx) {
      const f = (ctx.data.best = bestFish(ctx.game));
      return [
        { id: 'best', label: f ? `Serve your best ${f.sp.name}` : 'Serve the chef\'s special', cost: f ? { fish: 1 } : { coins: 30 }, tone: 'good', hint: 'Big rating swing' },
        { id: 'normal', label: 'Treat him like anyone', cost: { text: 'roll the dice' }, tone: 'neutral' },
        { id: 'bribe', label: 'Slip him some coins', cost: { coins: 25, text: 'risky' }, tone: 'bad', hint: 'Very Reynard. Very risky.' },
      ];
    },
    expire: 'normal',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game;
      ctx.data.done = true;
      const W = 4;
      if (ch === 'best') {
        const f = ctx.data.best && !ctx.data.best.dead ? ctx.data.best : null;
        if (f) { game.fish.remove(f); game.stats.fishEaten++; } else if (!ctx.pay(30, b)) { ctx.release(b); return; }
        const gold = f && (f.g?.morph === 'golden' || f.g?.morph === 'rainbow');
        const c = await crewTo(ctx, b, { carry: ctx.prop('plate', { fish: gold ? 'gold' : 'plain' }) });
        c.drop();
        ctx.drop(ctx.data.pad);
        ctx.data.plate = ctx.attach(ctx.prop('plate', { fish: gold ? 'gold' : 'plain' }), b, 'hold');
        c.play('wave');
        await ctx.say(c, f ? `One ${f.sp.name}, monsieur.` : 'The special, monsieur.', { voice: 'beaver' });
        ctx.pose(b, 'eat_fancy', { face: 'dainty', restart: true });
        ctx.sfx('cutlery', { volume: 0.5 });
        await ctx.wait(3.2);
        ctx.drop(ctx.data.plate);
        b.eaten += 1.2;
        ctx.pose(b, 'cheer', { face: 'bliss' });
        ctx.word('MAGNIFIQUE!', b, { color: 'gold', size: 3 });
        await ctx.say(b, 'Exquisite. I must confess: I am the critic!', { mood: 'happy' });
        ctx.review(b, 5, `${f ? f.sp.name : 'The special'} at Reynard's: tender, fresh, unforgettable. Five stars.`, { weight: W });
        ctx.sfx('feast_good');
        c.leave();
      } else if (ch === 'normal') {
        ctx.pose(b, 'talk', { face: 'dainty' });
        ctx.sfx('pen', { volume: 0.4 });
        await ctx.wait(1.2);
        const stars = 2 + Math.floor(Math.random() * 3);
        ctx.pose(b, stars >= 4 ? 'yummy' : 'idle', { face: stars >= 4 ? 'happy' : 'disgusted' });
        await ctx.say(b, stars >= 4 ? 'Hm! Not bad at all.' : 'Pedestrian. Utterly pedestrian.', { mood: 'normal' });
        ctx.review(b, stars, stars >= 4 ? 'An honest pond with honest fish. Recommended.' : 'Fishy in the wrong way. The fox hovers.', { weight: W });
        ctx.sfx(stars >= 4 ? 'feast_good' : 'feast_meh');
      } else {
        ctx.pay(25, b);
        ctx.pose(b, 'grab', { restart: true, face: 'shocked' });
        await ctx.wait(0.8);
        if (chance(0.5)) {
          ctx.pose(b, 'idle', { face: 'smug' });
          await ctx.say(b, 'I see. The fish is... suddenly excellent.', { mood: 'whisper' });
          ctx.review(b, 5, 'Remarkable value. The owner is most generous.', { weight: W });
          ctx.sfx('feast_good');
        } else {
          ctx.pose(b, 'angry_stomp', { face: 'furious' });
          await ctx.say(b, 'A BRIBE?! This is going on the FRONT PAGE!', { mood: 'shout' });
          ctx.review(b, 0, 'The fox tried to BRIBE me. Avoid this pond at all costs.', { weight: W });
          ctx.sfx('feast_bad');
          ctx.release(b, 'leave');
          return;
        }
      }
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ birthday
  {
    id: 'birthday', name: 'Birthday Bear', icon: 'fe_cake', kind: 'customer', weight: 8, ttl: 26, minDay: 2,
    text: (ctx) => `It's ${ctx.bear.name}'s birthday. Nobody at the office remembered. The party hat is self-bought.`,
    pick: (game, f) => f.pickBear(plainBear, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      ctx.data.hat = ctx.attach(ctx.prop('party_hat', { keep: true }), b, 'head');
      ctx.pose(b, 'sad', { face: 'sad' });
      ctx.say(b, 'Happy birthday... to me...', { mood: 'whisper', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.faceCam(b);
      ctx.cam(b, { zoom: 0.014 });
      await ctx.say(b, 'I\'m forty today. FORTY. Not even a card from accounting.', { mood: 'normal' });
      ctx.pose(b, 'idle', { face: 'sad' });
      await ctx.wait(0.5);
    },
    choices: (ctx) => [
      { id: 'cake', label: 'Bring out a cake!', cost: { coins: (ctx.data.fee ||= price(ctx.game, 18, 1)) }, tone: 'good', hint: 'Party time. Tips!' },
      { id: 'sing', label: 'Get the crowd singing', cost: { text: 'free' }, tone: 'neutral' },
      { id: 'ignore', label: 'Back to the fish', cost: { rating: -0.15 }, tone: 'bad' },
    ],
    expire: 'ignore',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game;
      const crowd = ctx.feast.nearBears(b.x, b.z, 8, (x) => x !== b && !x.script).slice(0, 3);
      const sing = async () => {
        const notes = ctx.place(ctx.prop('notes'), b.x, b.y + 2.4, b.z);
        for (const c of crowd) game.bears.say(c, `Happy birthday, dear ${b.name}!`, 'emo_music', null, 3);
        ctx.sfx('bear_cheer', { volume: 0.4 });
        await ctx.wait(2.2);
        ctx.drop(notes);
      };
      if (ch === 'cake') {
        ctx.pay(ctx.data.fee, b);
        const cake = ctx.prop('cake');
        const c = await crewTo(ctx, b, { carry: cake, r: 1 });
        c.drop();
        const p = spotNear(game, b, 0.75, b.heading);
        ctx.place(cake, p.x, game.grid.surfaceY(Math.floor(p.x), Math.floor(p.z)), p.z);
        ctx.turn(b, cake);
        ctx.cam(cake, { zoom: 0.013, dy: 0.5 });
        ctx.pose(b, 'idle', { face: 'excited' });
        await sing();
        ctx.pose(b, 'roar', { face: 'slurp', restart: true });
        ctx.word('FWOOO', cake, { color: 'white', size: 2 });
        cake.blowOut();
        ctx.fx.puff(p.x, ctx.at(cake, 0).y, p.z, 8, 0.25);
        await ctx.wait(0.5);
        ctx.sfx('feast_party', { volume: 0.6 });
        const hp = ctx.at(b, 0.3);
        ctx.fx.confetti(hp.x, hp.y, hp.z, 60);
        ctx.pose(b, 'cheer', { face: 'cheer' });
        c.play('cheer');
        await ctx.say(b, 'Best. Birthday. EVER!', { mood: 'happy' });
        ctx.earn(price(game, 10, 0.6), b);
        for (const x of crowd) ctx.earn(price(game, 3, 0.2), x);
        ctx.review(b, 5, 'They surprised me with a CAKE on my birthday. I cried into my trout.');
        ctx.sfx('feast_good');
        c.leave();
        await ctx.wait(0.8);
      } else if (ch === 'sing') {
        ctx.track(b, { zoom: 0.017 });
        await sing();
        ctx.pose(b, 'cheer', { face: 'happy' });
        await ctx.say(b, 'Aww, you guys!', { mood: 'happy' });
        ctx.earn(price(game, 3, 0.3), b);
        ctx.review(b, 4, 'A whole pond sang me happy birthday. Sweet.');
        ctx.sfx('feast_good');
      } else {
        ctx.pose(b, 'sad', { face: 'sad' });
        await ctx.say(b, 'Right. Fish. Of course.', { mood: 'whisper' });
        ctx.review(b, 2, 'Spent my birthday alone at a pond. The fish didn\'t sing either.');
        ctx.sfx('feast_meh');
      }
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ phone in the pond
  {
    id: 'phone', name: 'Phone in the Pond', icon: 'fe_phone', kind: 'customer', weight: 8, ttl: 24, minDay: 2,
    text: (ctx) => `${ctx.bear.name} was texting and wading. The phone is now on the bottom of the pond.`,
    when: (game) => game.fish.count > 0,
    pick(game, f) { return f.pickBear((b) => !!nearestWater(game, b.x, b.z, 3)); },
    setup(ctx) {
      const b = ctx.bear, game = ctx.game;
      const w = (ctx.data.w = nearestWater(game, b.x, b.z, 3));
      const ph = ctx.attach(ctx.prop('phone'), b, 'hand');
      ctx.pose(b, 'talk', { face: 'happy' });
      ctx.wait(0.7).then(async () => {
        ctx.drop(ph);
        const p2 = ctx.prop('phone');
        const hp = ctx.at(b, -1);
        ctx.pose(b, 'stagger', { face: 'shocked', restart: true });
        ctx.word('PLOP', w, { color: 'blue', size: 2 });
        await toss(ctx, p2, hp, { x: w.x, y: -0.1, z: w.z }, { dur: 0.6, height: 0.7 });
        ctx.drop(p2);
        game.particles.splash(w.x, w.z, 10, 0.6);
        ctx.sfx('plop', { volume: 0.6 });
        ctx.anim((dt) => { if (ctx.data.got) return false; if (Math.random() < dt * 3) game.particles.bubbles(w.x, -0.6, w.z, 2); return true; });
        ctx.turn(b, w);
        ctx.pose(b, 'sad', { face: 'sad' });
        ctx.say(b, 'MY PHONE!', { mood: 'shout', wait: false });
      });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.cam(ctx.data.w, { zoom: 0.014, dy: 0.2 });
      ctx.word('BLUB BLUB', ctx.data.w, { color: 'blue', size: 2 });
      await ctx.wait(1.4);
      ctx.cam(b, { zoom: 0.014 });
      await ctx.say(b, 'All my photos! My fish pics! My BOSS\'S NUMBER!', { mood: 'scared' });
    },
    choices: (ctx) => [
      { id: 'dive', label: 'Send a beaver diver', cost: { coins: (ctx.data.fee ||= price(ctx.game, 8, 0.5)) }, tone: 'good' },
      { id: 'rice', label: 'Offer a bag of rice', cost: { coins: 2, text: 'for later' }, tone: 'neutral', hint: 'Sympathy, mostly' },
      { id: 'luck', label: 'Tough luck', cost: { rating: -0.15 }, tone: 'bad' },
    ],
    expire: 'luck',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game, w = ctx.data.w;
      if (ch === 'dive') {
        ctx.pay(ctx.data.fee, b);
        const c = await ctx.crew({ near: b });
        ctx.track(c, { zoom: 0.018 });
        await c.go(w.x, w.z, { speed: 4 });
        ctx.word('SPLASH!', c, { color: 'blue' });
        game.particles.splash(w.x, w.z, 18, 1);
        ctx.sfx('splash', { volume: 0.6 });
        c.rig.root.visible = false;
        await ctx.wait(1.4);
        ctx.data.got = true;
        c.rig.root.visible = true;
        game.particles.splash(w.x, w.z, 12, 0.8);
        const ph = c.hand(ctx.prop('phone'));
        void ph;
        c.play('cheer');
        await ctx.wait(0.6);
        const p = spotNear(game, b, 0.9, headingTo(b, c));
        await c.go(p.x, p.z, { speed: 3 });
        c.face(b);
        ctx.cam(b, { zoom: 0.014 });
        c.drop();
        c.rig.gripR.clear();
        ctx.attach(ctx.prop('phone'), b, 'hand');
        ctx.pose(b, 'cheer', { face: 'cheer' });
        await ctx.say(b, 'It still WORKS! You\'re a hero, little guy!', { mood: 'happy' });
        ctx.earn(price(game, 6, 0.5), b);
        ctx.review(b, 5, 'Dropped my phone in the pond, a beaver dove for it. Unreal service.');
        ctx.sfx('feast_good');
        c.leave();
      } else if (ch === 'rice') {
        ctx.pay(2, b);
        ctx.pose(b, 'idle', { face: 'sad' });
        await ctx.say(b, 'Rice. For a phone that is IN a pond. Thanks, I guess.', { mood: 'normal' });
        ctx.review(b, 3, 'Lost my phone. They gave me rice. It was the thought that counted.');
        ctx.sfx('feast_meh');
      } else {
        ctx.pose(b, 'sad', { face: 'sad' });
        await ctx.say(b, 'Goodbye, phone. You were a good phone.', { mood: 'whisper' });
        ctx.review(b, 2, 'The pond ate my phone and nobody cared.');
        ctx.sfx('feast_meh');
      }
      ctx.data.got = true;
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ the influencer
  {
    id: 'influencer', name: 'Live From the Pond', icon: 'fe_selfie', kind: 'customer', weight: 7, ttl: 24, minDay: 3,
    text: (ctx) => `${ctx.bear.name} is streaming live to 40,000 followers. Right in the middle of the path.`,
    pick: (game, f) => f.pickBear(plainBear, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      ctx.data.stick = ctx.attach(ctx.prop('selfie_stick'), b, 'hand');
      ctx.data.stick.obj.rotation.set(-0.5, 0, 0.3);
      ctx.pose(b, 'wave', { face: 'excited' });
      ctx.anim((dt, t) => { if (ctx.data.done) return false; if (Math.floor(t / 1.7) !== ctx.data.k) { ctx.data.k = Math.floor(t / 1.7); ctx.sfx('feast_shutter', { volume: 0.25 }); const p = ctx.at(b, 0.2); ctx.fx.sparkle(p.x, p.y, p.z, 3, 0xffffff); ctx.pose(b, ctx.data.k % 2 ? 'cheer' : 'wave', { face: 'excited' }); } return true; });
      ctx.say(b, 'Hey besties! LIVE from the pond!', { mood: 'happy', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.cam(b, { zoom: 0.013, dy: 0.5 });
      ctx.faceCam(b);
      await ctx.say(b, 'Smash that like button if you love FISH!', { mood: 'excited' });
      for (const n of ctx.feast.nearBears(b.x, b.z, 4, (x) => x !== b && !x.script).slice(0, 1)) ctx.game.bears.say(n, 'Excuse me, can I get past?', 'emo_sweat', null, 2.2);
      await ctx.wait(1.4);
    },
    choices: () => [
      { id: 'film', label: 'Let her film', cost: { text: '+2 bears tomorrow' }, tone: 'good', hint: 'But she blocks the path' },
      { id: 'sponsor', label: 'Sponsored post', cost: { coins: 25, text: '+4 bears tomorrow' }, tone: 'neutral', hint: '"Link in bio!"' },
      { id: 'move', label: 'Move her along', cost: { rating: -0.1 }, tone: 'bad' },
    ],
    expire: 'film',
    async resolve(ctx, ch) {
      const b = ctx.bear, st = ctx.feast.st;
      ctx.data.done = true;
      if (ch === 'film' || ch === 'sponsor') {
        if (ch === 'sponsor' && !ctx.pay(25, b)) { ctx.release(b); return; }
        const n = ch === 'sponsor' ? 4 : 2;
        st.bonusBears = (st.bonusBears || 0) + n;
        ctx.pose(b, 'cheer', { face: 'cheer' });
        ctx.sfx('feast_shutter', { volume: 0.5 });
        if (ch === 'sponsor') { ctx.word('#AD', b, { color: 'pink' }); await ctx.say(b, 'This stream is brought to you by REYNARD\'S POND! Link in bio!', { mood: 'excited' }); }
        else await ctx.say(b, 'Chat says this place is a VIBE!', { mood: 'happy' });
        ctx.word(`+${n} FANS`, b, { color: 'pink', size: 2 });
        for (const x of ctx.feast.nearBears(b.x, b.z, 4, (y) => y !== b)) ctx.patience(x, -0.12);
        ctx.review(b, 5, ch === 'sponsor' ? '#ad Reynard\'s Pond is EVERYTHING. Go go go!' : 'Streamed my whole dinner here. Chat loved the pond!');
        ctx.sfx('feast_good');
      } else {
        const c = await crewTo(ctx, b, { r: 1 });
        c.play('wave');
        await ctx.say(c, 'Ma\'am, the path is for walking.', { voice: 'beaver' });
        ctx.pose(b, 'angry_stomp', { face: 'angry' });
        await ctx.say(b, 'Ugh. Unfollowing. Bye.', { mood: 'angry' });
        ctx.review(b, 3, 'Got told off for filming. Fish were fine I guess.');
        ctx.sfx('feast_meh');
        c.leave();
      }
      ctx.drop(ctx.data.stick);
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ the proposal
  {
    id: 'proposal', name: 'A Proposal at the Pond', icon: 'fe_ring', kind: 'customer', weight: 6, ttl: 26, minDay: 4,
    text: (ctx) => `${ctx.bear.name} is down on one knee in front of ${ctx.data.b2?.name || 'their sweetheart'}. With a RING.`,
    pick(game, f) { const a = f.pickBear(null, { land: true }); return a && f.pickBear((x) => x !== a && dist(x, a) < 8, { land: true }) ? a : null; },
    setup(ctx) {
      const a = ctx.bear;
      const b2 = (ctx.data.b2 = ctx.feast.pickBear((x) => x !== a && dist(x, a) < 8, { land: true }));
      ctx.hold(a);
      if (!b2) return;
      ctx.hold(b2);
      const h = headingTo(a, b2);
      ctx.walk(a, b2.x - Math.cos(h) * 1.1, b2.z - Math.sin(h) * 1.1, { speed: 1.4 }).then(() => {
        ctx.turn(a, b2); ctx.turn(b2, a);
        ctx.pose(a, 'sit', { face: 'love' });
        ctx.pose(b2, 'idle', { face: 'shocked' });
        ctx.data.ring = ctx.attach(ctx.prop('ring_box'), a, 'hand');
        ctx.anim((dt) => { if (ctx.data.done) return false; if (Math.random() < dt * 2) { const p = ctx.at(a, -0.3); ctx.fx.hearts(p.x, p.y, p.z, 1); } return true; });
      });
      ctx.say(a, 'Darling... I have something to ask...', { mood: 'whisper', wait: false });
    },
    async scene(ctx) {
      const a = ctx.bear, b2 = ctx.data.b2;
      ctx.cam(a, { zoom: 0.014, dx: b2 ? (b2.x - a.x) / 2 : 0, dz: b2 ? (b2.z - a.z) / 2 : 0 });
      await ctx.say(a, 'Will you... share every fish dinner with me... forever?', { mood: 'whisper' });
      if (ctx.data.ring) { ctx.cam(ctx.data.ring, { zoom: 0.0105 }); ctx.word('SPARKLE', ctx.data.ring, { color: 'white', size: 2 }); await ctx.wait(1.3); }
      ctx.cam(a, { zoom: 0.015, dx: b2 ? (b2.x - a.x) / 2 : 0, dz: b2 ? (b2.z - a.z) / 2 : 0 });
      if (b2) await ctx.say(b2, 'Oh my...', { mood: 'scared' });
    },
    choices: (ctx) => [
      { id: 'mood', label: 'Set the mood: lanterns!', cost: { coins: (ctx.data.fee ||= price(ctx.game, 25, 1)) }, tone: 'good', hint: 'Makes a YES likely' },
      { id: 'quiet', label: 'Give them a moment', cost: { text: 'free' }, tone: 'neutral' },
      { id: 'ignore', label: 'Ring up the bill', cost: { text: 'awkward' }, tone: 'bad' },
    ],
    expire: 'quiet',
    async resolve(ctx, ch) {
      const a = ctx.bear, b2 = ctx.data.b2, game = ctx.game;
      if (!b2) { ctx.release(a); return; }
      let p = ch === 'mood' ? 0.95 : ch === 'quiet' ? 0.7 : 0.4;
      if (ch === 'mood') {
        ctx.pay(ctx.data.fee, a);
        const w = nearestWater(game, a.x, a.z, 8);
        const c0 = w || { x: a.x, z: a.z };
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2;
          const L = ctx.place(ctx.prop('lantern'), c0.x + Math.cos(ang) * 1.6, -0.6, c0.z + Math.sin(ang) * 1.6);
          glide(ctx, L, { x: L.obj.position.x, y: w ? -0.05 : 1.2, z: L.obj.position.z }, { dur: 1 + i * 0.25 });
        }
        ctx.sfx('reveal_rare', { volume: 0.4 });
        await ctx.wait(1.6);
      } else if (ch === 'ignore') {
        const c = await crewTo(ctx, a, { r: 1.2 });
        await ctx.say(c, 'Will that be one check or two?', { voice: 'beaver' });
        c.leave();
      }
      ctx.sfx('feast_drumroll', { volume: 0.5 });
      await ctx.wait(1.1);
      ctx.data.done = true;
      if (Math.random() < p) {
        ctx.pose(b2, 'cheer', { face: 'love' });
        ctx.word('YES!', b2, { color: 'pink', size: 4 });
        ctx.pose(a, 'cheer', { face: 'cheer' });
        const hp = ctx.at(b2, 0.2);
        ctx.fx.confetti(hp.x, hp.y, hp.z, 70);
        ctx.fx.hearts(hp.x, hp.y, hp.z, 8);
        ctx.sfx('fanfare', { volume: 0.4 });
        for (const x of ctx.feast.nearBears(a.x, a.z, 9, (y) => y !== a && y !== b2 && !y.script).slice(0, 4)) { game.bears.say(x, pick(['AWWW!', 'Congrats!', 'Kiss! Kiss!']), 'emo_heart', null, 2.2); ctx.earn(price(game, 3, 0.2), x); }
        await ctx.say(b2, 'YES! A thousand times YES!', { mood: 'happy' });
        ctx.review(a, 5, 'I proposed at Reynard\'s Pond and she said YES!');
        ctx.review(b2, 5, 'Engaged by the pond! Booking the wedding here.');
        ctx.sfx('feast_good');
      } else {
        ctx.pose(b2, 'idle', { face: 'sad' });
        await ctx.say(b2, 'I... need to think about it. Over dessert.', { mood: 'whisper' });
        ctx.pose(a, 'sad', { face: 'sad' });
        ctx.review(a, 2, 'Proposed. She said "maybe". The fox sent us the bill. Mid-proposal.');
        ctx.sfx('feast_bad');
      }
      ctx.drop(ctx.data.ring);
      await ctx.wait(0.6);
      ctx.release(a); ctx.release(b2);
    },
  },

  // ------------------------------------------------------------ the health inspector
  {
    id: 'inspector', name: 'Surprise Inspection', icon: 'fe_clipboard', kind: 'customer', weight: 6, ttl: 26, minDay: 5,
    text: (ctx) => `${ctx.bear.name} is from the Valley Health Board. Clipboard out. Looking under things.`,
    pick: (game, f) => f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear;
      b.name = 'Inspector ' + b.name;
      ctx.data.board = ctx.attach(ctx.prop('clipboard'), b, 'hand');
      ctx.sfx('whistle', { volume: 0.4 });
      ctx.pose(b, 'search', { face: 'dainty' });
      ctx.say(b, 'Health inspection! Nobody touch anything.', { mood: 'shout', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear, game = ctx.game;
      ctx.track(b, { zoom: 0.016 });
      const bones = game.fish.bones?.length || 0;
      const p = spotNear(game, b, 1.6);
      await ctx.walk(b, p.x, p.z, { speed: 1.2 });
      ctx.pose(b, 'search', { face: 'disgusted' });
      await ctx.say(b, bones > 3 ? `Fish bones. ${bones} of them. On the GROUND.` : 'Is that... a raccoon footprint?', { mood: 'normal' });
      ctx.pose(b, 'talk', { face: 'dainty' });
      ctx.sfx('pen', { volume: 0.5 });
      await ctx.say(b, 'Hmm. Hmm hmm. *tick tick tick*', { mood: 'whisper' });
    },
    choices: () => [
      { id: 'clean', label: 'Quick clean-up crew', cost: { coins: 15 }, tone: 'good', hint: 'Pass with flying colours' },
      { id: 'fine', label: 'Pay the fine', cost: { coins: 35 }, tone: 'neutral' },
      { id: 'trout', label: 'Slip him a trout', cost: { text: 'a coin flip' }, tone: 'bad', hint: 'Free... if it works' },
    ],
    expire: 'fail',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game;
      if (ch === 'clean') {
        ctx.pay(15, b);
        const cs = [await ctx.crew({ near: b }), await ctx.crew({ near: b })];
        ctx.cam(b, { zoom: 0.02 });
        await Promise.all(cs.map((c, i) => { const p = spotNear(game, b, 1.4 + i * 0.6); return c.go(p.x, p.z, { speed: 4.5 }); }));
        for (const c of cs) c.play('plow');
        await ctx.anim((dt, t) => { if (Math.random() < dt * 8) { const c = pick(cs); ctx.fx.buildCloud(c.x, c.y, c.z, 0.8); } return t < 2; });
        if (game.fish.bones) game.fish.bones.length = Math.min(game.fish.bones.length, 1);
        for (const c of cs) { c.play('cheer'); const p = ctx.at(c, 0); ctx.fx.sparkle(p.x, p.y, p.z, 6); }
        ctx.sfx('reveal_common', { volume: 0.4 });
        ctx.pose(b, 'idle', { face: 'happy' });
        await ctx.say(b, 'Spotless. A-plus. Carry on.', { mood: 'happy' });
        ctx.word('PASS!', b, { color: 'green', size: 3 });
        ctx.rating(0.15);
        ctx.sfx('feast_good');
        for (const c of cs) c.leave();
      } else if (ch === 'fine') {
        ctx.pay(35, b);
        ctx.pose(b, 'grab', { face: 'smug', restart: true });
        await ctx.say(b, 'Paid in full. See you next quarter.', { mood: 'normal' });
        ctx.sfx('feast_meh');
      } else if (ch === 'trout' && chance(0.5)) {
        ctx.pose(b, 'eat_gulp', { face: 'gape', restart: true });
        ctx.sfx('gulp', { volume: 0.5 });
        await ctx.wait(1.5);
        ctx.pose(b, 'idle', { face: 'smug' });
        await ctx.say(b, 'I see no violations. None. *burp*', { mood: 'whisper' });
        ctx.sfx('feast_good');
      } else {
        // failed (or the trout made it worse)
        ctx.pose(b, 'angry_stomp', { face: 'furious' });
        ctx.word('FAIL!', b, { color: 'red', size: 3 });
        await ctx.say(b, ch === 'trout' ? 'A BRIBE?! Double violation!' : 'Violations everywhere! FAILED!', { mood: 'shout' });
        const fine = Math.min(game.state.coins, ch === 'trout' ? 40 : 20);
        if (fine > 0) ctx.pay(fine, b);
        ctx.rating(ch === 'trout' ? -0.35 : -0.25);
        ctx.sfx('feast_bad');
      }
      ctx.drop(ctx.data.board);
      ctx.release(b, 'leave');
    },
  },

  // ------------------------------------------------------------ the lost cub
  {
    id: 'lost_cub', name: 'Lost Intern Cub', icon: 'fe_tear', kind: 'customer', weight: 7, ttl: 28, minDay: 3,
    text: (ctx) => `A little intern cub lost track of ${ctx.data.boss ? ctx.data.boss.name + ' from ' + ctx.data.boss.dept : 'their boss'} and is crying by the shore.`,
    pick(game, f) {
      const cub = f.pickBear((b) => b.def.scale < 0.7, { land: true });
      if (cub) return cub;
      const boss = f.pickBear((b) => b.def.scale >= 0.9, { land: true });
      if (!boss) return null;
      const s = shoreNear(game, boss.x, boss.z, 10);
      if (!s) return null;
      // spawn one: the boss "forgot" this cub at the shore
      const c = game.bears.spawnBear({ type: 'cub', wants: [], prefer: null, delay: 0 });
      c.state = 'search'; c.searchT = 2;
      c.x = s.x; c.z = s.z; c.y = game.grid.surfaceY(Math.floor(s.x), Math.floor(s.z));
      c.dept = boss.dept;
      c.feastBoss = boss;
      game.bears.show(c);
      game.particles.puff(c.x, c.y + 0.2, c.z, 6, 0.3);
      return c;
    },
    setup(ctx) {
      const c = ctx.bear;
      ctx.data.boss = c.feastBoss && c.feastBoss.visible ? c.feastBoss : ctx.feast.pickBear((b) => b !== c && b.def.scale >= 0.9);
      ctx.pose(c, 'sad', { face: 'sad' });
      ctx.anim((dt) => { if (ctx.data.found) return false; if (Math.random() < dt * 3) { const p = ctx.at(c, -0.5); ctx.fx.fx.spawn('drop', p.x + (Math.random() - 0.5) * 0.3, p.y, p.z, { vy: 0.5, grav: 6, life: 0.8, size: 0.06, flags: 2, bright: true }); } return true; });
      ctx.say(c, 'Waaaah! Where\'s my boss?!', { mood: 'scared', wait: false });
    },
    async scene(ctx) {
      const c = ctx.bear;
      ctx.faceCam(c);
      ctx.cam(c, { zoom: 0.011 });
      await ctx.say(c, 'I was getting coffee and then everybody was GONE!', { mood: 'scared' });
      if (ctx.data.boss) { ctx.cam(ctx.data.boss, { zoom: 0.02 }); await ctx.say(ctx.data.boss, 'Mmm, trout. What intern?', { mood: 'normal' }); }
    },
    choices: () => [
      { id: 'reunite', label: 'Reunite him with his boss', cost: { text: 'free' }, tone: 'good' },
      { id: 'mascot', label: 'Make him tonight\'s mascot', cost: { coins: 5 }, tone: 'neutral', hint: 'Everyone is happier for a while' },
      { id: 'ignore', label: 'He\'ll find his way', cost: { rating: -0.15 }, tone: 'bad' },
    ],
    expire: 'ignore',
    async resolve(ctx, ch) {
      const c = ctx.bear, boss = ctx.data.boss, game = ctx.game;
      c.noReview = c.noReview || !!c.feastBoss;
      if (ch === 'mascot') {
        ctx.pay(5, c);
        ctx.attach(ctx.prop('party_hat', { keep: true }), c, 'head');
        ctx.pose(c, 'cheer', { face: 'cheer' });
        ctx.sfx('feast_party', { volume: 0.5 });
        await ctx.say(c, 'I\'m the MASCOT! Fish fish hooray!', { mood: 'happy' });
        for (const x of ctx.feast.customers()) if (x !== c) ctx.patience(x, 0.15);
        ctx.word('HOORAY!', c, { color: 'gold' });
        const hp = ctx.at(c, 0);
        ctx.fx.confetti(hp.x, hp.y, hp.z, 30);
        await ctx.wait(1.2);
      }
      if (ch !== 'ignore' && boss?.visible) {
        ctx.data.found = true;
        ctx.track(c, { zoom: 0.018 });
        const p = spotNear(game, boss, 0.9, headingTo(boss, c));
        await ctx.walk(c, p.x, p.z, { speed: 2.4, pose: 'run' });
        ctx.hold(boss);
        ctx.turn(boss, c); ctx.turn(c, boss);
        ctx.pose(boss, 'cheer', { face: 'happy' }); ctx.pose(c, 'cheer', { face: 'cheer' });
        const hp = ctx.at(c, 0);
        ctx.fx.hearts(hp.x, hp.y, hp.z, 5);
        await ctx.say(boss, 'THERE you are! Who wants a fish stick?', { mood: 'happy' });
        ctx.earn(price(game, 7, 0.5), boss);
        ctx.review(boss, 5, ch === 'mascot' ? 'They made my intern the mascot. He wants to work here now.' : 'Staff found my lost intern. Above and beyond.');
        ctx.sfx('feast_good');
        ctx.release(boss);
      } else {
        await ctx.wait(3);
        ctx.data.found = true;
        if (boss?.visible) { ctx.review(boss, 2, 'Your pond LOST my intern for twenty minutes.'); await ctx.say(boss, 'Kevin?! Why are you crying?', { mood: 'scared' }); }
        ctx.sfx('feast_meh');
      }
      ctx.release(c, c.feastBoss ? 'leave' : 'decide');
    },
  },

  // ------------------------------------------------------------ the raccoon
  {
    id: 'raccoon', name: 'Lunchbox Bandit', icon: 'fe_raccoon', kind: 'customer', weight: 7, ttl: 22, minDay: 2,
    text: (ctx) => `A raccoon swiped ${ctx.bear.name}'s lunchbox and is taunting from a safe distance.`,
    pick: (game, f) => f.pickBear(null, { land: true }),
    setup(ctx) {
      const b = ctx.bear, game = ctx.game;
      const p = spotNear(game, b, 0.8, b.heading + 1.4);
      const box = (ctx.data.box = ctx.place(ctx.prop('lunchbox'), p.x, game.grid.surfaceY(Math.floor(p.x), Math.floor(p.z)), p.z));
      const r = (ctx.data.coon = ctx.prop('raccoon'));
      const from = spotNear(game, b, 6);
      const hide = (ctx.data.hide = spotNear(game, b, 3.4, headingTo(b, from)));
      ctx.place(r, from.x, 0, from.z);
      ctx.pose(b, 'idle', { face: 'happy' });
      r.run = 1;
      ctx.anim((dt, t) => {
        const o = r.obj.position;
        const gy = (x, z) => game.grid.surfaceY(Math.floor(x), Math.floor(z));
        if (!ctx.data.stole) {
          const u = Math.min(1, t / 1.6);
          o.set(from.x + (p.x - from.x) * u, gy(o.x, o.z), from.z + (p.z - from.z) * u);
          r.obj.rotation.y = Math.atan2(p.x - from.x, p.z - from.z);
          if (u >= 1) { ctx.data.stole = t; box.obj.position.set(0, 0, 0); r.carry.add(box.obj); ctx.word('SNATCH!', r, { color: 'red', size: 2 }); ctx.pose(b, 'angry_stomp', { face: 'furious' }); ctx.turn(b, r.obj); ctx.say(b, 'HEY! My LUNCH!', { mood: 'shout', wait: false }); }
          return true;
        }
        if (ctx.data.chase) return false;
        const u = Math.min(1, (t - ctx.data.stole) / 1.2);
        o.set(p.x + (hide.x - p.x) * u, gy(o.x, o.z), p.z + (hide.z - p.z) * u);
        r.obj.rotation.y = u < 1 ? Math.atan2(hide.x - p.x, hide.z - p.z) : Math.atan2(b.x - hide.x, b.z - hide.z);
        r.run = u < 1 ? 1 : 0.35;
        return true;
      });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.cam(ctx.data.coon, { zoom: 0.012 });
      ctx.word('HEH HEH', ctx.data.coon, { color: 'white', size: 2 });
      ctx.sfx('fox_laugh', { volume: 0.3, pitch: 1.6 });
      await ctx.wait(1.4);
      ctx.cam(b, { zoom: 0.015 });
      await ctx.say(b, 'That was a TUNA SANDWICH, you little bandit!', { mood: 'angry' });
    },
    choices: (ctx) => [
      { id: 'chase', label: 'Chase that raccoon!', cost: { text: 'free, maybe' }, tone: 'good' },
      { id: 'pay', label: 'Pay for a new lunch', cost: { coins: (ctx.data.fee ||= price(ctx.game, 8, 0.4)) }, tone: 'neutral' },
      { id: 'shrug', label: 'Raccoons gotta eat', cost: { rating: -0.15 }, tone: 'bad' },
    ],
    expire: 'shrug',
    async resolve(ctx, ch) {
      const b = ctx.bear, r = ctx.data.coon, game = ctx.game;
      const away = async () => { ctx.data.chase = true; r.run = 1; const o = r.obj.position.clone(); const far = spotNear(game, { x: o.x, z: o.z }, 9, headingTo(b, o)); r.obj.rotation.y = Math.atan2(far.x - o.x, far.z - o.z); await glide(ctx, r, { x: far.x, y: 0, z: far.z }, { dur: 1.6 }); ctx.drop(r); };
      if (ch === 'chase') {
        const c = await ctx.crew({ near: r.obj });
        ctx.data.chase = true;
        ctx.track(c, { zoom: 0.02 });
        const o = r.obj.position;
        const center = { x: o.x, z: o.z };
        r.run = 1;
        // round and round the tree
        await ctx.anim((dt, t) => {
          const a = t * 2.6;
          o.set(center.x + Math.cos(a) * 1.1, game.grid.surfaceY(Math.floor(o.x), Math.floor(o.z)), center.z + Math.sin(a) * 1.1);
          r.obj.rotation.y = -a;
          c.target = { x: center.x + Math.cos(a - 1.1) * 1.1, z: center.z + Math.sin(a - 1.1) * 1.1, speed: 5, stopAt: 0.05, resolve() {} };
          if (Math.random() < dt * 5) ctx.fx.dust(o.x, o.y, o.z, 1);
          return t < 2.6;
        });
        c.target = null;
        if (chance(0.6)) {
          ctx.word('GOTCHA!', c, { color: 'green' });
          const box = ctx.data.box;
          r.carry.remove(box.obj);
          c.carry(box);
          await away();
          const p = spotNear(game, b, 0.9, headingTo(b, c));
          ctx.cam(b, { zoom: 0.016 });
          await c.go(p.x, p.z, { speed: 4 });
          c.face(b); c.drop();
          ctx.attach(ctx.prop('lunchbox'), b, 'hold');
          ctx.pose(b, 'cheer', { face: 'cheer' });
          await ctx.say(b, 'My sandwich! Thank you!', { mood: 'happy' });
          ctx.review(b, 4, 'A raccoon stole my lunch, a beaver got it back. Action-packed dinner.');
          ctx.sfx('feast_good');
        } else {
          await away();
          ctx.cam(b, { zoom: 0.016 });
          c.play('idle');
          ctx.pose(b, 'sad', { face: 'sad' });
          await ctx.say(b, 'He got away. With my SANDWICH.', { mood: 'angry' });
          ctx.review(b, 3, 'Raccoon 1, Staff 0. Fish were good though.');
          ctx.sfx('feast_meh');
        }
        c.leave();
      } else {
        await away();
        if (ch === 'pay') {
          ctx.pay(ctx.data.fee, b);
          ctx.pose(b, 'idle', { face: 'happy' });
          await ctx.say(b, 'New sandwich money? You\'re all right, fox.', { mood: 'happy' });
          ctx.review(b, 4, 'Lunch stolen by a raccoon. The owner paid me back. Decent.');
          ctx.sfx('feast_good');
        } else {
          ctx.pose(b, 'sad', { face: 'sad' });
          await ctx.say(b, 'He\'s eating it. Right there. Looking at me.', { mood: 'angry' });
          ctx.review(b, 2, 'A raccoon ate my lunch in front of me. Management shrugged.');
          ctx.sfx('feast_meh');
        }
      }
      ctx.release(b);
    },
  },

  // ------------------------------------------------------------ dine and dash
  {
    id: 'dash', name: 'Dine and Dash', icon: 'fe_dash', kind: 'customer', weight: 7, ttl: 16, minDay: 3,
    text: (ctx) => `${ctx.bear.name} ate ${Math.max(1, Math.round(ctx.bear.eaten))} fish and is tiptoeing towards the trail. Whistling. Innocently.`,
    pick: (game, f) => f.pickBear((b) => b.eaten >= 1, { land: true }),
    setup(ctx) {
      const b = ctx.bear, game = ctx.game;
      const end = game.bears.trail[game.bears.trail.length - 1];
      ctx.data.end = { x: end[0], z: end[2] };
      ctx.walk(b, end[0], end[2], { speed: 0.55, pose: 'walk' });
      ctx.face(b, 'smug');
      ctx.say(b, '*whistles innocently*', { mood: 'whisper', wait: false });
    },
    async scene(ctx) {
      const b = ctx.bear;
      ctx.track(b, { zoom: 0.015 });
      ctx.word('TIPTOE', b, { color: 'white', size: 2, dy: -1.6 });
      await ctx.say(b, 'Lovely evening. Just stretching my legs. Far away.', { mood: 'whisper' });
    },
    choices: (ctx) => [
      { id: 'bouncer', label: 'Send the beaver bouncer', cost: { gain: Math.round(ctx.data.bill ||= price(ctx.game, 12, 1)) }, tone: 'good', hint: 'He pays. Sheepishly.' },
      { id: 'shame', label: 'Shout "DINE AND DASHER!"', cost: { gain: Math.round(ctx.data.bill * 0.6), rating: -0.1 }, tone: 'neutral', hint: 'Everybody stares' },
      { id: 'let', label: 'Let him go', cost: { text: 'no bill' }, tone: 'bad' },
    ],
    expire: 'let',
    async resolve(ctx, ch) {
      const b = ctx.bear, game = ctx.game, bill = Math.round(ctx.data.bill || price(game, 12, 1));
      if (ch === 'bouncer') {
        const c = await ctx.crew({ near: b });
        const ahead = { x: b.x + Math.cos(b.heading) * 1, z: b.z + Math.sin(b.heading) * 1 };
        ctx.track(c, { zoom: 0.018 });
        await c.go(ahead.x, ahead.z, { speed: 5.5 });
        ctx.puppets.get(b)?.walk?.resolve?.();
        ctx.hold(b).walk = null;
        c.face(b);
        c.play('wave');
        ctx.cam(b, { zoom: 0.014 });
        ctx.pose(b, 'stagger', { face: 'shocked', restart: true });
        await ctx.say(c, 'Forgetting something, pal?', { voice: 'beaver', mood: 'angry' });
        ctx.pose(b, 'pay', { face: 'sad', restart: true });
        await ctx.say(b, 'Ha ha! My WALLET! Silly me!', { mood: 'scared' });
        ctx.earn(bill, b);
        b.coins = 0; b.snackCoins = 0; b.tips = 0;
        ctx.review(b, 3, 'Caught by a beaver on the way out. Fair cop.');
        ctx.sfx('feast_good');
        c.leave();
        ctx.release(b, 'leave');
      } else if (ch === 'shame') {
        ctx.hold(b).walk = null;
        ctx.word('DINE AND DASHER!', b, { color: 'red', size: 3, life: 1.8 });
        ctx.sfx('whistle', { volume: 0.5 });
        for (const x of ctx.feast.nearBears(b.x, b.z, 10, (y) => y !== b && !y.script).slice(0, 4)) game.bears.say(x, pick(['GASP!', 'Shame!', 'SHAME!', 'Pay up, Doug!']), 'emo_exclaim', null, 2.2);
        ctx.pose(b, 'sad', { face: 'sad' });
        await ctx.wait(1.2);
        ctx.earn(Math.round(bill * 0.6), b);
        b.coins = 0; b.snackCoins = 0; b.tips = 0;
        await ctx.say(b, 'FINE. Here. Keep the change.', { mood: 'angry' });
        ctx.review(b, 1, 'Publicly SHAMED over a tiny misunderstanding.');
        ctx.sfx('feast_meh');
        ctx.release(b, 'leave');
      } else {
        b.coins = 0; b.snackCoins = 0; b.tips = 0;
        b.noReview = true;
        b.review = { stars: 3, text: '', skip: true };
        ctx.sfx('feast_bad');
        ctx.release(b, 'leave');
        await ctx.wait(0.5);
      }
    },
  },
];
void SPECIES_BY_ID;
