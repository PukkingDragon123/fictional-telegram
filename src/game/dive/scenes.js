// [v32 dive] THE DIVE's cutscenes, run by game.director (src/game/cine/Director.js).
// The lake scenes stage Reynard at Loon Lake (he's teleported there behind a dip to black
// and sent home the same way); Noodles and Chief Buff act through their villager rigs
// (npcActor below). No quizzes: c.ask is only used where Reynard really answers somebody.
import { LAKE, CATCH_BY_ID, GEAR } from '../../data/dive.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import * as THREE from 'three';
import { diveGeo, litterModel } from '../../entities/diveModels.js';
import { matFor, FV } from '../../entities/critterKit.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const hasAnim = (r, n) => !!r?.anims?.includes?.(n);
// Noodles' noodling spot: the water's edge just east of his camp (the lake is east and south)
const EDGE = { x: 83.55, z: 155.3 };
// Director talk anims (bear poses) -> our rigs' anims
const ANIM_MAP = { roar: 'talk', cheer: 'happy', sad: 'talk', talk: 'talk' };

/** a villager as a Director actor: c.say / c.shot / walkTo / lookAt */
export function npcActor(game, v) {
  const r = () => v.rig;
  const H = v.cast.height || 1.5;
  const A = {
    kind: 'npc', name: v.name, color: v.zone.npc.color, voice: v.cast.voice,
    get x() { return v.x; }, get z() { return v.z; }, get y() { return v.y; }, get headY() { return v.y + H + 0.3; },
    getWorldPos: (p) => p.set(v.x, v.y + H + 0.3, v.z),
    portrait: () => ({ who: 'npc', npc: v.id }),
    act(anim, secs) {
      const rig = r(); if (!rig) return;
      const n = hasAnim(rig, anim) ? anim : ANIM_MAP[anim] && hasAnim(rig, ANIM_MAP[anim]) ? ANIM_MAP[anim] : null;
      if (!n) return;
      const loop = !(secs && secs < 90) && n === 'talk';
      rig.play(n, { loop, restart: !loop, onDone: () => { if (!A.walking) game.villagers?.idle(v); } });
    },
    hold(anim) { const rig = r(); if (rig && anim && hasAnim(rig, anim)) rig.play(anim, { loop: true }); else if (rig && !anim) game.villagers?.idle(v); },
    face(expr, hold = 2) { try { r()?.setExpression?.(expr, { hold }); } catch { /* */ } },
    lookAt(x, z) { const rig = r(); if (rig) rig.root.rotation.y = Math.atan2(x - v.x, z - v.z); },
    place(x, z) { v.x = x; v.z = z; v.y = game.grid.groundAt(x, z); r()?.root.position.set(v.x, v.y, v.z); },
    walkTo(x, z, speed = 0.9) {
      A.walking = true;
      const rig = r();
      rig?.play?.('walk', { loop: true });
      A.lookAt(x, z);
      return new Promise((res) => {
        let last = performance.now();
        const step = () => {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          const dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz);
          if (d < 0.04 || game.director?.skipped) { A.place(x, z); A.walking = false; game.villagers?.idle(v); res(); return; }
          const s = Math.min(d, speed * dt);
          A.place(v.x + (dx / d) * s, v.z + (dz / d) * s);
          rig?.update?.(0); // keep the anim ticking even if the villager loop skips it
          requestAnimationFrame(step);
        };
        step();
      });
    },
  };
  return A;
}

/** dip to black, put Reynard at the lake, frame the shot */
async function atLake(c, { at = LAKE.view, fox = null, zoom = 0.02, focus = null } = {}) {
  const g = c.game;
  await c.dip(true);
  const F = fox || { x: at.x - 1.2, z: at.z };
  c.fox.place(F.x, F.z, Math.PI);
  // the frame's centre sits a little in front of the actors (toward the camera), like NpcScenes.stage:
  // they stand above centre, and the see-through cutaway never opens a window through them
  const f0 = focus || at, f = { x: f0.x, z: f0.z + 1.0 };
  c.center(f.x, f.z);
  await c.shot([f.x, f.z], { zoom, cut: true, yaw: 0 });
  g.rig.target.copy(g.rig.goal);
  await wait(0.15);
  await c.dip(false);
}
async function homeAgain(c) {
  const f = c.game.fox;
  await c.dip(true);
  c.fox.place(f.home.x, f.home.z, Math.PI / 2);
  await c.dip(false);
}
/** stop the villager's own idle life (chatter, specials) during a scene */
function hush(v) { const t = v.t; v.t = 1e9; return () => { v.t = Math.max(3, Math.min(t, 10)); }; }

export const DIVE_SCENES = {
  // ================================================================ a message in a bottle (at the pond)
  async bottle_in(c, sys) {
    const g = c.game, f = g.fox;
    await c.dip(true);
    // the bottle bobs in on the pond near the hut
    const p = g.fish?.randomWaterPoint?.() || { x: f.home.x + 2, z: f.home.z + 3 };
    const geo = diveGeo('lake_bottle', () => litterModel('bottle'), { scale: FV * 1.6 });
    const bottle = new THREE.Mesh(geo, matFor(geo));
    bottle.position.set(p.x, -0.12, p.z);
    bottle.rotation.set(0, 0.6, 0.35);
    g.scene.add(bottle);
    let alive = true;
    const bob = () => { if (!alive) return; bottle.position.y = -0.14 + Math.sin(performance.now() / 300) * 0.03; bottle.rotation.x = Math.sin(performance.now() / 420) * 0.15; requestAnimationFrame(bob); };
    bob();
    c.fox.place(p.x - 1.2, p.z - 0.4, 0);
    c.fox.lookAt(p.x, p.z);
    c.center(p.x - 0.6, p.z);
    await c.shot([p.x - 0.6, p.z], { zoom: 0.017, cut: true, yaw: 0 });
    await c.dip(false);
    try {
      c.sfx('plop', { volume: 0.4 });
      await c.say(c.fox, 'Hm? Something\'s floating in my pond.', { style: 'think' });
      await c.say(c.fox, 'A bottle. Litterbugs. In MY pond.', { style: 'angry' });
      c.fx('splash', p.x, p.z, 8, 0.6);
      bottle.visible = false;
      c.fox.act('throw', 1.2);
      await c.say(c.fox, '...There\'s a note inside.', { style: 'whisper' });
      await c.card({ kicker: 'A NOTE IN A BOTTLE', title: 'LOON LAKE', sub: '"Biggest catfish in Canada lives here. Come see. - N."', style: 'gold', y: 0.2, ms: 3000 });
      await c.say(c.fox, 'Biggest catfish in Canada.', { style: 'think' });
      await c.say(c.fox, 'Biggest catfish... means biggest PROFITS.', { style: 'excited', anim: 'greedy' });
      await c.say(c.fox, 'Loon Lake is way down south, past the Old Wood. I need a trail. To the lab!', { anim: 'point' });
    } finally {
      alive = false;
      bottle.removeFromParent();
    }
    g.quests?.start?.('dv_bottle');
  },

  // ================================================================ Noodles at Loon Lake
  async noodles_in(c, sys) {
    const g = c.game, v = g.villagers?.get('noodles');
    if (!v?.rig) return;
    const N = npcActor(g, v), un = hush(v);
    const home = { x: v.x, z: v.z };
    try {
      N.place(EDGE.x, EDGE.z);
      await atLake(c, { fox: { x: EDGE.x - 1.8, z: EDGE.z - 0.2 }, focus: { x: EDGE.x - 0.8, z: EDGE.z }, zoom: 0.017 });
      c.fox.lookAt(EDGE.x, EDGE.z);
      N.lookAt(EDGE.x + 1, EDGE.z + 0.6);
      v.rig.play('noodle', { restart: true, onDone: () => g.villagers.idle(v) });
      c.sfx('splash', { volume: 0.4 });
      await c.beat(2.0);
      await c.say(c.fox, 'Excuse me. Did you write a note, put it in a bottle and throw it in a river?', { anim: 'polish_monocle' });
      c.shake(0.25);
      await c.beat(1.2);
      c.sfx('fish_flop', { volume: 0.5 });
      await c.beat(1.4);
      N.lookAt(g.fox.x, g.fox.z);
      await c.say(N, 'Mm-hm. Yessir. Biggest catfish in Canada.', { style: 'happy' });
      await c.say(N, '...This ain\'t him. This is his nephew. Kevin.', { style: 'say' });
      await c.say(c.fox, 'You caught that with your ARM.', { style: 'scared', anim: 'horror' });
      await c.say(N, 'Name\'s Noodles. I noodle. Reach in the hole, fish bites, you pull.', { style: 'say' });
      await c.say(N, 'Rods are for folks who like waiting, slick.', { style: 'say' });
      v.rig.play('tall_tale', { restart: true, onDone: () => g.villagers.idle(v) });
      await c.say(N, 'Lake\'s full of fish. Walleye, perch, cats THIS big. Bigger.', { style: 'excited' });
      const a = typeof c.ask === 'function'
        ? await c.ask(c.fox, 'Tell me, Mister Noodles...', [{ label: 'Could you catch fish for MY pond?', value: 'hire' }, { label: 'What\'s in it for you?', value: 'cut' }])
        : 'hire';
      if (a === 'cut') await c.say(N, 'Coins, slick. Otters gotta eat too. Mostly fish. Which I catch. Hm.', { style: 'say' });
      await c.say(N, 'I\'ll catch you a bucket any day. Send it up the river with the moose.', { style: 'happy' });
      await c.say(N, 'Wild fish, good blood. Your breeders\'ll thank me.', { style: 'say' });
      await c.say(c.fox, 'Wild fish. In MY pond. At a fair price. I like this otter.', { anim: 'count_coins' });
      c.caption('Tap Noodles to hire a catch: one a day', { ms: 2600 });
      await c.beat(1.2);
    } finally { un(); N.place(home.x, home.z); }
    await homeAgain(c);
    g.quests?.start?.('dv_catch');
  },

  // ================================================================ the catch (a hired service)
  async catch(c, sys, opts = {}) {
    const g = c.game, v = g.villagers?.get('noodles');
    const T = CATCH_BY_ID[opts.tier] || CATCH_BY_ID.bucket;
    const fish = opts.fish || [];
    if (!v?.rig) return;
    const N = npcActor(g, v), un = hush(v);
    const home = { x: v.x, z: v.z };
    try {
      N.place(EDGE.x, EDGE.z);
      await atLake(c, { fox: { x: EDGE.x - 1.8, z: EDGE.z - 0.2 }, focus: { x: EDGE.x - 0.8, z: EDGE.z }, zoom: 0.016 });
      c.fox.lookAt(EDGE.x, EDGE.z);
      N.lookAt(g.fox.x, g.fox.z + 1.5);
      await c.say(N, T.id === 'noodle' ? 'The Big Noodle. Deep Hole. Hold my hat, slick.' : T.id === 'creel' ? 'A full creel? Mm-hm. Gimme a minute.' : 'A bucket o\' bites, coming up.', { style: T.id === 'noodle' ? 'excited' : 'say' });
      N.lookAt(EDGE.x + 1, EDGE.z + 0.6);
      for (let i = 0; i < Math.min(fish.length, T.id === 'noodle' ? 2 : 1); i++) {
        v.rig.play('noodle', { restart: true, onDone: () => g.villagers.idle(v) });
        await c.beat(1.5);
        c.sfx('splash', { volume: 0.4 });
        c.fx('splash', EDGE.x + 0.7, EDGE.z + 0.3, 10, 0.7);
        await c.beat(2.0);
        c.sfx('chomp', { volume: 0.5 });
        c.shake(0.3);
        await c.beat(1.1);
        c.sfx('bigsplash', { volume: 0.4 });
        c.fx('splash', EDGE.x + 0.7, EDGE.z + 0.3, 16, 1);
        await c.beat(2.6);
      }
      const names = fish.map((f) => (f.whiskers ? 'OLD WHISKERS' : (f.golden ? 'Golden ' : '') + (SPECIES_BY_ID[f.species]?.name || f.species)));
      c.sfx(fish.some((f) => f.whiskers) ? 'reveal_legendary' : fish.some((f) => f.rare) ? 'reveal_rare' : 'reveal_common', { volume: 0.45 });
      await c.card({ kicker: 'CATCH OF THE DAY', title: fish.some((f) => f.whiskers) ? 'OLD WHISKERS!' : T.name.toUpperCase(), sub: names.join(' · '), style: 'gold', y: 0.18, ms: 3200 });
      if (fish.some((f) => f.whiskers)) {
        await c.say(N, '...Slick. That\'s HIM. That\'s Old Whiskers.', { style: 'whisper' });
        await c.say(N, 'He let me borrow him. Treat him right.', { style: 'sad' });
        await c.say(c.fox, 'A GOLDEN catfish. I\'m going to cry. Into my money.', { style: 'excited', anim: 'dance' });
      } else {
        await c.say(N, pickLine(['Fresh off the bottom. Moose\'ll bring \'em up the river.', 'Good fish. Mean little fellas. Your bears\'ll love \'em.', 'There ya go, slick. Box is on the way.']), { style: 'happy' });
      }
    } finally { un(); N.place(home.x, home.z); }
    await homeAgain(c);
  },

  // ================================================================ Chief Buff moves in
  async buff_in(c, sys) {
    const g = c.game;
    const Z = sys.zoneDef('diveschool');
    if (Z && !g.zones.isOpen('diveschool')) g.zones.reveal(Z, { x: Z.cx, z: Z.cz }, { quiet: true });
    await wait(0.1);
    g.villagers.revealed(Z);
    const v = g.villagers?.get('buff'), n = g.villagers?.get('noodles');
    if (!v?.rig) return;
    const B = npcActor(g, v), un = hush(v);
    const home = { x: v.x, z: v.z };
    try {
      B.place(home.x - 0.6, home.z - 1.0); // in the shack doorway
      await atLake(c, { fox: { x: home.x - 1.9, z: home.z + 0.7 }, focus: { x: home.x - 0.8, z: home.z + 0.2 }, zoom: 0.018 });
      c.fox.lookAt(home.x, home.z);
      v.rig.play('whistle', { restart: true });
      c.sfx('dv_tweet', { volume: 0.5 });
      await c.beat(1.0);
      await c.say(c.fox, 'GAH! My ears!', { style: 'scared', anim: 'cower' });
      await B.walkTo(home.x, home.z + 0.2, 1.1);
      B.lookAt(g.fox.x, g.fox.z);
      await c.say(B, 'ATTEN-SHUN!', { style: 'shout' });
      await c.say(B, 'Chief Petty Officer Buffington Bufflehead. Navy diver, retired. Twenty years under the ice.', { style: 'say' });
      await c.say(B, 'The otter says a fox wants fish from my lake.', { style: 'say' });
      const a = typeof c.ask === 'function'
        ? await c.ask(c.fox, 'The duck is looking at me.', [{ label: 'Reynard. Mister Reynard.', value: 'name' }, { label: 'Who\'s asking?', value: 'sass' }])
        : 'name';
      if (a === 'sass') { await c.say(B, 'CHIEF is asking, recruit. Chief ALWAYS asks.', { style: 'shout' }); await c.say(c.fox, '...Reynard. Sir.', { style: 'whisper' }); }
      else await c.say(B, 'Mister Reynard. We\'ll see about the Mister.', { style: 'say' });
      await c.say(B, 'Down there is the best water in the valley. Good sand. No bears.', { style: 'say' });
      await c.say(B, 'You could farm fish down there, recruit. Pens on the bottom. Safe as a bank vault.', { style: 'say' });
      await c.say(c.fox, 'Fish. That the bears CAN\'T reach. ...Chief, I\'m listening.', { anim: 'greedy' });
      await c.say(B, 'Nobody goes down without training. Step one:', { style: 'say' });
      v.rig.play('clipboard', { restart: true });
      c.sfx('pop_in', { volume: 0.4 });
      await c.card({ kicker: 'NEW DIVE GEAR', title: 'SNORKEL MASK', sub: GEAR.snorkel.desc, style: 'gold', y: 0.2, ms: 2600 });
      await c.say(c.fox, 'It will not fit over my hat.', { style: 'think' });
      await c.say(B, 'Then the hat goes ON TOP. Improvise, recruit!', { style: 'shout' });
      await c.say(B, 'Lesson one. Tap the dive flag off my dock. MOVE MOVE MOVE!', { style: 'shout' });
      if (n?.rig) { const N = npcActor(g, n); n.rig.play('laugh', { restart: true }); await c.say(N, 'He does this to everybody, slick. Welcome to the lake.', { style: 'whisper' }); }
    } finally { un(); B.place(home.x, home.z); }
    sys.giveGear('snorkel');
    await homeAgain(c);
    g.quests?.start?.('dv_lesson1');
  },

  // ================================================================ lesson 2: flippers
  async flippers(c, sys) {
    const g = c.game, v = g.villagers?.get('buff');
    if (!v?.rig) return;
    const B = npcActor(g, v), un = hush(v);
    try {
      await atLake(c, { fox: { x: v.x - 1.9, z: v.z + 0.7 }, focus: { x: v.x - 0.8, z: v.z + 0.3 }, zoom: 0.018 });
      c.fox.lookAt(v.x, v.z); B.lookAt(g.fox.x, g.fox.z);
      v.rig.play('salute', { restart: true });
      await c.say(B, 'Recruit! You found my whistle. You came up on time.', { style: 'say' });
      await c.say(B, 'That was... adequate.', { style: 'say' });
      await c.say(c.fox, 'Adequate! I was MAGNIFICENT.', { style: 'angry', anim: 'angry_stomp' });
      await c.say(B, 'You swim like a sofa, recruit. You need these.', { style: 'say' });
      c.sfx('pop_in', { volume: 0.4 });
      await c.card({ kicker: 'NEW DIVE GEAR', title: 'FLIPPERS', sub: GEAR.flippers.desc, style: 'gold', y: 0.2, ms: 2600 });
      v.rig.play('pushups', { restart: true });
      await c.say(B, 'Lesson two: three hoops. And somebody\'s been littering on my lake.', { style: 'say' });
      await c.say(B, 'Leave it cleaner than you found it. KICK, recruit, KICK!', { style: 'shout' });
    } finally { un(); }
    sys.giveGear('flippers');
    await homeAgain(c);
    g.quests?.start?.('dv_lesson2');
  },

  // ================================================================ the farm lesson
  async farm_talk(c, sys) {
    const g = c.game, v = g.villagers?.get('buff'), n = g.villagers?.get('noodles');
    if (!v?.rig) return;
    const B = npcActor(g, v), un = hush(v);
    const N = n?.rig ? npcActor(g, n) : null, un2 = n ? hush(n) : () => {};
    const nHome = n ? { x: n.x, z: n.z } : null;
    try {
      if (N) N.place(v.x - 1.3, v.z + 0.1);
      await atLake(c, { fox: { x: v.x - 2.6, z: v.z + 0.6 }, focus: { x: v.x - 1.3, z: v.z + 0.3 }, zoom: 0.019 });
      c.fox.lookAt(v.x, v.z); B.lookAt(g.fox.x, g.fox.z); N?.lookAt(g.fox.x, g.fox.z);
      await c.say(B, 'Recruit. You can swim. Now you\'re going to WORK.', { style: 'say' });
      await c.say(B, 'A net pen on the bottom. Cedar posts, rope net, cork floats.', { style: 'say' });
      if (N) await c.say(N, 'Stock it with little ones. They grow up big down there, slick. No bears, no herons.', { style: 'say' });
      await c.say(c.fox, 'And then?', { anim: 'think' });
      if (N) await c.say(N, 'Then you haul \'em up for your pond. Or sell \'em. Your call.', { style: 'happy' });
      await c.say(B, 'Kelp around a pen makes the fish calm. Calm fish grow FASTER. Feeders even faster.', { style: 'say' });
      await c.say(c.fox, 'A farm. Under a lake. That makes money while I sleep.', { style: 'whisper', anim: 'greedy' });
      await c.say(c.fox, 'Chief, I think I love diving.', { style: 'happy', anim: 'dance' });
      v.rig.play('clipboard', { restart: true });
      await c.say(B, 'Research Net Pens in your lab. Then build one on the farm sands. DISMISSED!', { style: 'shout' });
    } finally { un(); un2(); if (N && nHome) N.place(nHome.x, nHome.z); }
    await homeAgain(c);
    g.quests?.start?.('dv_farm');
  },

  // ================================================================ the brass hat
  async helmet_talk(c, sys) {
    const g = c.game, v = g.villagers?.get('buff');
    if (!v?.rig) return;
    const B = npcActor(g, v), un = hush(v);
    try {
      await atLake(c, { fox: { x: v.x - 1.9, z: v.z + 0.7 }, focus: { x: v.x - 1.1, z: v.z + 0.2 }, zoom: 0.017 });
      c.fox.lookAt(v.x, v.z); B.lookAt(v.x - 1, v.z + 0.6);
      await c.say(B, 'See that helmet on the post, recruit? Navy pattern. Twelve bolts.', { style: 'say' });
      await c.say(B, 'Wore it under the ice for twenty years. Never leaked once.', { style: 'say' });
      B.lookAt(g.fox.x, g.fox.z);
      await c.say(B, 'With one of those, you can go down into the Deep Hole. There\'s an old barge down there.', { style: 'say' });
      await c.say(c.fox, 'A sunken barge. Is there treasure?', { anim: 'greedy' });
      await c.say(B, 'There\'s PLANKS. Good ones. And the darkest, stillest water in the lake.', { style: 'say' });
      await c.say(B, 'Rare fish lay their eggs in water like that. Fix her up and you\'ve got a hatchery.', { style: 'say' });
      await c.say(B, 'Research the brass helmet in your lab. Then go and find her.', { style: 'shout' });
    } finally { un(); }
    await homeAgain(c);
    g.quests?.start?.('dv_helmet');
  },

  // ================================================================ graduation
  async graduation(c, sys) {
    const g = c.game, v = g.villagers?.get('buff'), n = g.villagers?.get('noodles');
    if (!v?.rig) return;
    const B = npcActor(g, v), un = hush(v);
    const N = n?.rig ? npcActor(g, n) : null, un2 = n ? hush(n) : () => {};
    const nHome = n ? { x: n.x, z: n.z } : null;
    try {
      if (N) N.place(v.x - 1.3, v.z + 0.1);
      await atLake(c, { fox: { x: v.x - 2.6, z: v.z + 0.6 }, focus: { x: v.x - 1.3, z: v.z + 0.3 }, zoom: 0.018 });
      c.fox.lookAt(v.x, v.z); B.lookAt(g.fox.x, g.fox.z); N?.lookAt(g.fox.x, g.fox.z);
      v.rig.play('salute', { restart: true });
      c.sfx('fanfare', { volume: 0.4 });
      await c.say(B, 'Recruit Reynard. Front and centre.', { style: 'shout' });
      await c.say(B, 'You found the barge. You went down to the Deep Hole and you came back up.', { style: 'say' });
      await c.card({ kicker: 'CHIEF BUFF\'S DIVE SCHOOL', title: 'DIVER, FIRST CLASS', sub: 'Reynard. Fox. Top hat. Surprisingly buoyant.', style: 'gold', y: 0.18, ms: 3000 });
      v.rig.play('cry', { restart: true });
      await c.say(B, 'I am NOT crying. That is lake water.', { style: 'sad' });
      await c.say(c.fox, 'We\'re standing on land, Chief.', { anim: 'shrug' });
      await c.say(B, 'LAKE. WATER.', { style: 'shout' });
      if (N) {
        await c.say(N, 'Slick. Now that you can go deep...', { style: 'whisper' });
        n.rig.play('tall_tale', { restart: true });
        await c.say(N, 'Old Whiskers lives in the Deep Hole. Golden as a sunrise. Big as a canoe.', { style: 'say' });
        await c.say(N, 'Go take a look at him. Then maybe, MAYBE, I can borrow him for you.', { style: 'whisper' });
      }
      await c.say(c.fox, 'A golden catfish the size of a canoe. Say no more.', { anim: 'greedy' });
    } finally { un(); un2(); if (N && nHome) N.place(nHome.x, nHome.z); }
    await homeAgain(c);
    g.quests?.start?.('dv_whiskers');
  },

  // ================================================================ the legend, done
  async whiskers_out(c, sys) {
    const g = c.game, v = g.villagers?.get('noodles');
    if (!v?.rig) return;
    const N = npcActor(g, v), un = hush(v);
    try {
      await atLake(c, { fox: { x: v.x - 1.8, z: v.z + 0.8 }, focus: { x: v.x - 0.6, z: v.z + 0.5 }, zoom: 0.018 });
      c.fox.lookAt(v.x, v.z); N.lookAt(g.fox.x, g.fox.z);
      v.rig.play('toothpick', { restart: true });
      await c.say(N, 'You saw him. Down there, circling his barge.', { style: 'whisper' });
      await c.say(N, 'Forty summers I\'ve been after that cat, slick.', { style: 'say' });
      await c.say(N, 'Big Noodle\'s open any morning. Maybe he says yes one day. Maybe.', { style: 'happy' });
      await c.say(c.fox, 'Maybe is my favourite number. It has so many zeros.', { anim: 'count_coins' });
    } finally { un(); }
    await homeAgain(c);
  },
};
function pickLine(a) { return a[Math.floor(Math.random() * a.length)]; }
