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
//   tomorrow   the day-1 close: TOMORROW 5:00 PM, a growl from the mountain, your quiz score
// [v32 cine] Interactive: Reynard asks you things and you answer with reply buttons (c.ask), with a
// pop quiz in three of the scenes, and the key words float up as 3D voxel letters (c.words3d).
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

/** a pop quiz: the player picks an answer, Reynard reacts, the score is kept for the end of the day */
async function quiz(c, who, at, question, answers, right, yes, no) {
  const v = await c.ask(who, question, answers.map((a) => ({ label: a, value: a })));
  const S = (c.game.state.tutQuiz ||= { right: 0, asked: 0 });
  S.asked++;
  if (v === right) {
    S.right++;
    c.sfx('grade_good', { volume: 0.5 });
    c.fx('confetti', at[0], 1.4, at[1], 40);
    c.words3d('CORRECT!', { at: [at[0] + 1.6, at[1] + 1.4], y: 1.1, pal: 'gold', ms: 1900 });
    c.push(0.88, 0.8);
    await c.say(who, yes, { style: 'excited', anim: 'cheer' });
  } else {
    c.sfx('grade_bad', { volume: 0.5 });
    c.shake(0.25);
    c.words3d('NOPE!', { at: [at[0] + 1.6, at[1] + 1.4], y: 1.1, pal: 'red', ms: 1700 });
    await c.say(who, no, { style: 'sad', anim: 'facepalm' });
  }
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
    c.words3d('EMPTY?!', { at: [P.x, P.z + 1], y: 1.0, pal: 'blue', ms: 2200 });
    c.push(0.86, 1.4);
    await c.say(c.fox, '...my completely EMPTY pond.', { style: 'sad', anim: 'shrug' });
    // he wants to know who he's talking to
    const who = await c.ask(c.fox, 'Before we start. Who are YOU, exactly?', [
      { label: 'Your new partner!', value: 'partner' },
      { label: 'A huge fish fan', value: 'fan' },
      { label: 'Here for the bears', value: 'bears' },
    ]);
    const reply = {
      partner: ['Partner?! I like the confidence.', 'Seventy-thirty. In my favour. Shake on it later.'],
      fan: ['A fish fan! Splendid.', 'Fish are the product. Love the product. Sell the product.'],
      bears: ['Ha! Keep that energy.', 'At five o\'clock tomorrow you\'ll need ALL of it.'],
    }[who] || ['Mysterious. I respect it.', 'Mysterious people pay in cash.'];
    await c.say(c.fox, reply[0], { style: 'laugh', anim: 'laugh_evil' });
    await c.say(c.fox, reply[1], { style: 'say', anim: 'talk' });
    await c.say(c.fox, 'Fish first. Then customers. Then the MONEY.', { style: 'excited', anim: 'greedy' });
  },

  async pondlife(c) {
    const g = c.game;
    const P = pondMid(g);
    const R = c.spot(P.x, 1.6, P.z, 'Reynard', '#ff9a3c', 'fox');
    await c.dip(true);
    await c.shot([P.x, P.z], { zoom: 0.017, cut: true });
    await c.dip(false);
    c.fx('bubbles', P.x, 0.2, P.z, 5);
    await c.say(R, 'Pond life, the short version. Eyes on the water.', { style: 'say' });
    c.fx('hearts', P.x - 0.6, 0.5, P.z, 4);
    let w = c.words3d('FEED', { at: [P.x, P.z + 1.4], y: 1.0, pal: 'green', hold: true });
    await c.say(R, 'Every fish has a belly and a *♥ meter*. Food fills it.', { style: 'happy' });
    c.push(0.88, 1.6);
    c.fx('hearts', P.x + 0.5, 0.6, P.z + 0.3, 6);
    w?.dismiss();
    w = c.words3d('DATE', { at: [P.x, P.z + 1.4], y: 1.0, pal: 'pink', hold: true });
    await c.say(R, 'A full boy ♂ and a full girl ♀ go on a <b>date</b>...', { style: 'whisper' });
    c.fx('sparkle', P.x, 0.5, P.z, 10);
    w?.dismiss();
    w = c.words3d('HATCH!', { at: [P.x, P.z + 1.4], y: 1.0, pal: 'gold', hold: true });
    await c.say(R, '...eggs! Dad fertilizes them, and YOU tap to <b>hatch</b>!', { style: 'excited' });
    w?.dismiss();
    await quiz(c, R, [P.x, P.z], 'POP QUIZ! What makes fish fall in love?', ['Full bellies', 'Loud music', 'A bear hug'], 'Full bellies',
      'Correct! Full bellies, full hearts. Gold star!', 'Nope! It\'s FULL BELLIES. Hungry fish don\'t date.');
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
    c.words3d('BEAVERS!', { at: [E.x, E.z + 1.4], y: 1.2, pal: 'amber', ms: 2600 });
    c.push(0.86, 1);
    await c.say(voice, 'BEAVERS!', { style: 'shout' });
    await c.say(voice, 'They chop trees, haul logs and build the big stuff...', { style: 'happy' });
    await c.shot([f.x - 0.4, f.z], { zoom: 0.02, dur: 1.2 });
    c.center(f.x, f.z);
    await c.say(c.fox, '...but only when PAID. In snacks. Beavers are not dumb.', { style: 'say', anim: 'count_coins' });
    await quiz(c, c.fox, [f.x, f.z], 'POP QUIZ! How do we pay the beavers?', ['Snacks', 'Coins', 'Compliments'], 'Snacks',
      'Correct! Snacks = jobs. You\'re a natural.', 'Ha! No. SNACKS. Always snacks.');
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
    c.words3d('FEAST!', { at: { x: dx + 0.2, y: dy + 3.2, z: dz + 0.3 }, pal: 'red', ms: 2200 });
    await c.beat(2.2);
    // back down at the pond
    await c.dip(true);
    await c.shot([f.x - 0.5, f.z], { zoom: 0.02, cut: true });
    c.center(f.x, f.z);
    await c.dip(false);
    await c.say(c.fox, 'Bears eat at 5. Happy bears <b>pay</b>, <b>tip</b> and leave <b>5 stars</b>.', { style: 'happy', anim: 'count_coins' });
    await c.say(c.fox, 'Hungry bears... <b>RAMPAGE</b>.', { style: 'scared', anim: 'horror' });
    await quiz(c, c.fox, [f.x, f.z], 'Last question! What does a HUNGRY bear do?', ['RAMPAGE', 'Goes home politely', 'Writes a poem'], 'RAMPAGE',
      'Correct! So we keep them FED.', '...Have you MET a bear? They RAMPAGE.');
    await c.say(c.fox, 'So: lots of fish. And tag your best ones <b>DO NOT EAT</b>.', { style: 'say', anim: 'point' });
  },

  async tomorrow(c) {
    const g = c.game, O = c.office, f = g.fox;
    await c.dip(true);
    await c.shot([O.x, O.z + 4], { zoom: 0.03, cut: true, lift: O.h + 2 });
    await c.dip(false);
    c.sfx('growl', { volume: 0.5 });
    c.shake(0.35);
    c.words3d('5:00 PM', { at: { x: O.x, y: O.h + 6.5, z: O.z + 4 }, pal: 'gold', ms: 3200, size: 0.09 });
    c.caption('Tomorrow. Four hundred empty stomachs.', { ms: 2800 });
    c.push(0.8, 2.6);
    await c.beat(2.6);
    await c.say(c.spot(O.x, O.h + 5, O.z + 2, 'A hungry voice', '#c89a6a', 'bear'), '...Is it five yet?', { style: 'whisper' });
    await c.dip(true);
    await c.shot([f.x - 0.4, f.z], { zoom: 0.02, cut: true });
    c.center(f.x, f.z);
    await c.dip(false);
    // the quiz score
    const S = g.state.tutQuiz || { right: 0, asked: 0 };
    if (S.asked) {
      c.words3d(`${S.right}/${S.asked}`, { at: [f.x, f.z], pal: S.right === S.asked ? 'gold' : S.right ? 'green' : 'red', ms: 2600 });
      const line = S.right === S.asked ? 'Top marks! I\'ll make a tycoon of you yet.' : S.right ? 'Not bad! The rest you\'ll learn the hard way. The FUN way.' : 'Zero?! Well. Experience is the best teacher. And bears are VERY experienced.';
      await c.say(c.fox, `You got ${S.right} of ${S.asked} right. ` + line, { style: S.right ? 'happy' : 'scared', anim: S.right ? 'cheer' : 'facepalm' });
    }
    await c.say(c.fox, 'One day to get ready. Let\'s make some money.', { style: 'laugh', anim: 'laugh_evil' });
  },
};
