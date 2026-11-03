// [v31 guide] The day-1 tour's cutscenes, played by game.director (src/game/cine/Director.js) in
// place of the old full-screen classroom lessons. Real world, real camera, letterbox, the kinetic
// pixel text, bears as rigged actors.
//
//   opening    after Reynard walks out of his hut: a crane over the valley at morning, the title
//              in Alagard, down the bears' trail to his (empty) pond
//   pondlife   feeding, the love meter, dates, eggs, hatching (shot over the water)
//   builder    the forest edge: beavers build, but only for snacks
//   customers  "Meanwhile, up the mountain...": bears at Bear St. Holdings hear about the pond,
//              the CEO calls the feast; back at the pond, what happy and hungry bears do
//   tomorrow   the day-1 close: TOMORROW 5:00 PM, a growl from the mountain
import { MEADOW } from '../../world/worldgen.js';

/** the middle of the pond (the water tiles of your meadow) */
function pondMid(game) {
  const g = game.grid;
  let sx = 0, sz = 0, n = 0;
  for (let z = MEADOW.z0; z <= MEADOW.z1; z++) for (let x = MEADOW.x0; x <= MEADOW.x1; x++) {
    if (g.inb?.(x, z) && g.isWater(x, z)) { sx += x + 0.5; sz += z + 0.5; n++; }
  }
  return n ? { x: sx / n, z: sz / n } : { x: (MEADOW.x0 + MEADOW.x1) / 2, z: (MEADOW.z0 + MEADOW.z1) / 2 };
}
/** a forest tile just outside your land, nearest the hut */
function forestNear(game) {
  const f = game.fox;
  const B = game.beavers;
  let best = null, bd = Infinity;
  for (let z = MEADOW.z0 - 3; z <= MEADOW.z1 + 3; z++) for (let x = MEADOW.x0 - 3; x <= MEADOW.x1 + 3; x++) {
    let k = null;
    try { k = B.canClear(x, z).ok ? B.clearKind(x, z) : null; } catch { k = null; }
    if (k !== 'forest' && k !== 'tree') continue;
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
  }
  return best || { x: MEADOW.x0 - 1, z: (MEADOW.z0 + MEADOW.z1) / 2 };
}

export const TUT_SCENES = {
  async opening(c) {
    const g = c.game, O = c.office, f = g.fox;
    const P = pondMid(g);
    const home = { x: f.x, z: f.z };
    // the mountain and the tower first, the title over the valley
    await c.shot([O.x, O.z + 4], { zoom: 0.046, cut: true, lift: O.h - 1 });
    c.sfx('day_start', { volume: 0.4 });
    c.title({ kicker: 'REYNARD\'S FISH CO.', title: 'The Bear Must Eat', sub: 'Day 1. One pond. No fish. Big plans.', style: 'gold', y: 0.15, ms: 3600 });
    await c.shot([O.x, O.z + 6], { zoom: 0.04, dur: 2.6, lift: O.h - 3, ease: 'linear' });
    // down the trail the bears will run tomorrow, out over the pond
    c.caption('Every weekday at 5 PM, the office empties...', { ms: 2600 });
    await c.shot([P.x, P.z - 4], { zoom: 0.034, dur: 2.6 });
    await c.shot([P.x, P.z], { zoom: 0.026, dur: 1.4 });
    // and onto Reynard by the water
    await c.shot([home.x - 0.6, home.z], { zoom: 0.02, dur: 1.4 });
    c.fox.lookAt(P.x, P.z);
    c.center(home.x, home.z);
    await c.say(c.fox, 'Behold! My pond! My empire! My...', { style: 'excited', anim: 'run_point' });
    c.push(0.86, 1.4);
    await c.say(c.fox, '...my completely EMPTY pond.', { style: 'sad', anim: 'shrug' });
    await c.say(c.fox, 'Fish first. Then customers. Then the MONEY.', { style: 'laugh', anim: 'laugh_evil' });
  },

  async pondlife(c) {
    const g = c.game;
    const P = pondMid(g);
    await c.dip(true);
    await c.shot([P.x, P.z], { zoom: 0.017, cut: true });
    await c.dip(false);
    c.fx('bubbles', P.x, 0.2, P.z, 5);
    await c.say(c.spot(P.x, 1.6, P.z, 'Reynard', '#ff9a3c', 'fox'), 'Pond life, the short version.', { style: 'say' });
    c.fx('hearts', P.x - 0.6, 0.5, P.z, 4);
    await c.say(c.spot(P.x, 1.6, P.z, 'Reynard', '#ff9a3c', 'fox'), 'Every fish has a belly and a *♥ meter*. Food fills it.', { style: 'happy' });
    c.push(0.85, 2);
    c.fx('hearts', P.x + 0.5, 0.6, P.z + 0.3, 6);
    await c.say(c.spot(P.x, 1.6, P.z, 'Reynard', '#ff9a3c', 'fox'), 'A full boy ♂ and a full girl ♀ go on a <b>date</b>...', { style: 'whisper' });
    c.fx('sparkle', P.x, 0.5, P.z, 10);
    await c.say(c.spot(P.x, 1.6, P.z, 'Reynard', '#ff9a3c', 'fox'), '...eggs! Dad fertilizes them, and YOU tap to <b>hatch</b>!', { style: 'excited' });
    await c.card({ title: 'Feed, Date, Hatch!', style: 'happy', y: 0.2, ms: 2000 });
  },

  async builder(c) {
    const g = c.game, f = g.fox;
    const E = forestNear(g);
    await c.dip(true);
    await c.shot([E.x, E.z], { zoom: 0.024, cut: true });
    await c.dip(false);
    const voice = c.spot(E.x, 2.4, E.z, 'Reynard', '#ff9a3c', 'fox');
    await c.say(voice, 'Big things need builders. Busy, toothy builders.', { style: 'whisper' });
    c.shake(0.3);
    c.sfx('chip', { volume: 0.5 });
    c.fx('debris', E.x, 0.6, E.z, 16);
    await c.say(voice, 'BEAVERS!', { style: 'shout' });
    await c.say(voice, 'They chop trees, haul logs and build the big stuff...', { style: 'happy' });
    await c.shot([f.x - 0.4, f.z], { zoom: 0.02, dur: 1.2 });
    await c.say(c.fox, '...but only when PAID. In snacks. Beavers are not dumb.', { style: 'say', anim: 'count_coins' });
    await c.card({ title: 'Research, Build, Feed!', style: 'happy', y: 0.2, ms: 2000 });
  },

  async customers(c) {
    const g = c.game, O = c.office, f = g.fox;
    await c.dip(true);
    // up the mountain, on the lobby steps where the bears' trail starts
    const T0 = g.world?.trail?.[0] || [O.x, O.h, O.z + 3.7];
    const dx = T0[0], dz = T0[2], dy = T0[1];
    await c.shot([dx + 0.2, dz + 0.5], { zoom: 0.018, cut: true, lift: dy + 0.8 });
    const gary = c.bear('office', { at: [dx - 1.1, dz + 0.1], heading: 0, name: 'Gary' });
    const kev = c.bear('intern', { at: [dx + 1.3, dz + 0.2], heading: Math.PI, name: 'Kevin' });
    const doug = c.bear('accountant', { at: [dx + 0.2, dz + 1.1], heading: -Math.PI / 2, name: 'Doug' });
    gary.lookAt(kev.x, kev.z); kev.lookAt(gary.x, gary.z); doug.lookAt(gary.x, gary.z);
    await c.dip(false);
    c.caption('Meanwhile, up the mountain...', { ms: 2400 });
    c.center(dx + 0.2, dz + 0.5);
    await c.beat(1.2);
    await c.say(gary, 'Psst. Did you hear? A FOX opened a fish pond. Down the hill.', { style: 'whisper' });
    await c.say(kev, 'All you can eat?!', { style: 'excited', face: 'excited' });
    await c.say(doug, 'Says here... five PM. Tomorrow. Bring coins.', { style: 'say' });
    const tower = c.spot(O.x, O.h + 6, O.z, 'The CEO', '#bfe6ff', 'ceo');
    c.sfx('alarm', { volume: 0.2, pitch: 1.6 });
    await c.say(tower, 'Attention, everyone. Tomorrow at five...', { style: 'radio' });
    c.push(0.82, 1.2);
    await c.say(tower, '...we FEAST.', { style: 'radio' });
    gary.act('roar', 1.6); kev.act('cheer', 1.6); doug.act('cheer', 1.6);
    c.sfx('roar', { volume: 0.5, pitch: 0.85 });
    c.shake(0.6);
    await c.card({ title: 'FEAST! FEAST! FEAST!', style: 'shout', y: 0.18, ms: 1800 });
    // back down at the pond
    await c.dip(true);
    await c.shot([f.x - 0.5, f.z], { zoom: 0.02, cut: true });
    c.center(f.x, f.z);
    await c.dip(false);
    await c.say(c.fox, 'Bears eat at 5. Happy bears <b>pay</b>, <b>tip</b> and leave <b>5 stars</b>.', { style: 'happy', anim: 'count_coins' });
    await c.say(c.fox, 'Hungry bears... <b>RAMPAGE</b>.', { style: 'scared', anim: 'horror' });
    await c.say(c.fox, 'So: lots of fish. And tag your best ones <b>DO NOT EAT</b>.', { style: 'say', anim: 'point' });
  },

  async tomorrow(c) {
    const g = c.game, O = c.office, f = g.fox;
    await c.dip(true);
    await c.shot([O.x, O.z + 4], { zoom: 0.03, cut: true, lift: O.h + 2 });
    await c.dip(false);
    c.sfx('growl', { volume: 0.5 });
    c.shake(0.35);
    await c.card({ kicker: 'TOMORROW', title: '5:00 PM', sub: 'Four hundred empty stomachs.', style: 'shout', y: 0.2, ms: 2600 });
    await c.say(c.spot(O.x, O.h + 5, O.z + 2, 'A hungry voice', '#c89a6a', 'bear'), '...Is it five yet?', { style: 'whisper' });
    await c.dip(true);
    await c.shot([f.x - 0.4, f.z], { zoom: 0.02, cut: true });
    c.center(f.x, f.z);
    await c.dip(false);
    await c.say(c.fox, 'One day to get ready. Let\'s make some money.', { style: 'laugh', anim: 'laugh_evil' });
  },
};
