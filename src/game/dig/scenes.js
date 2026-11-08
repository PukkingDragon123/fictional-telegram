// [v32 dig] Professor Snapp's scenes, played by the Director (game.director):
//   arrival        the fog over Bonebed Bluff lifts: Snapp, back turned, brushing the
//                  strata... "DON'T. MOVE." Gerald the lure. A brush and a job (dg_grunt).
//   snapp_amber    after Grunt Work: amber (dg_amber)
//   snapp_maps     after the amber: "NOT the movie thing" ... "but fish" (dg_maps)
//   snapp_vial     after the maps: the Primordial Vial (dg_vial)
//   snapp_living   after the first prehistoric fish: Snapp walks to your pond (dg_living)
//   snapp_finale   after Living Fossils: the professor's own trowel
//   vialScene      feeding a vial to a fish: the drop, the glow, the roar, the new old fish
// Snapp is a villager rig (game.villagers 'snapp'); at the pond a stage copy of his rig.
import { BONEBED } from '../../data/digSites.js';
import { ancientName, ancientInfo, archetypeOf } from './ancientFish.js';
import { SPECIES_BY_ID } from '../../data/species.js';

const c3 = import.meta.glob('../../entities/critters3d.js', { eager: true });
const C3 = c3['../../entities/critters3d.js'] || {};
const hasAnim = (r, n) => !!r?.anims?.includes?.(n);
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const TALK = { roar: 'talk', cheer: 'happy', sad: 'talk', talk: 'talk', laugh_evil: 'laugh' };

/** Snapp as a Director actor (his villager rig, or a stage rig at the pond). */
export function snappActor(game, v) {
  const r = v.rig;
  const A = {
    kind: 'npc', name: 'Prof. Snapp', color: '#d8b46a', voice: 'turtle',
    get x() { return v.x; }, get z() { return v.z; }, get y() { return v.y; },
    getWorldPos(p) {
      if (r?.headFx) { r.root.updateMatrixWorld(true); r.headFx.getWorldPosition(p); p.y += 0.62; } else p.set(v.x, v.y + 1.9, v.z);
      return p;
    },
    act(anim) {
      if (!r) return;
      const a = TALK[anim] || anim;
      if (!hasAnim(r, a)) return;
      const loop = a === 'talk' || a === 'laugh' || a === 'wave';
      r.play(a, { loop, restart: !loop, onDone: loop ? undefined : () => r.play('talk', { loop: true }) });
      if (anim === 'roar') r.setExpression('angry', { hold: 2.2 });
    },
    face(e, s = 2) { try { r?.setExpression?.(e, { hold: s }); } catch { /* ignore */ } },
    hold() {}, lookAt(x, z) { if (r) r.root.rotation.y = Math.atan2(x - v.x, z - v.z); },
    set oneShot(_) { if (r && r.current === 'talk') r.play('idle', { loop: true }); },
  };
  return A;
}
async function turnTo(v, target, secs = 0.6) {
  const r = v.rig;
  if (!r) return;
  const a0 = r.root.rotation.y, t0 = performance.now();
  let d = target - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
  while (true) {
    const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
    r.root.rotation.y = a0 + d * (1 - (1 - k) ** 3);
    if (k >= 1) break;
    await wait(0.016);
  }
}
const ask = async (c, who, text, choices) => (typeof c.ask === 'function' ? c.ask(who, text, choices) : (await c.say(who, text), choices[0].value));

// ------------------------------------------------------------------ arrival
export async function arrival(c, sys, v) {
  const game = c.game, B = BONEBED, r = v.rig;
  const S = snappActor(game, v);
  c.fox.place(v.x + 2.3, v.z + 1.7, Math.PI);
  c.fox.lookAt(v.x, v.z);
  if (r) { r.root.rotation.y = Math.PI - 0.25; r.play('brush', { loop: false, restart: true }); }
  await c.shot([B.bluff.x, B.bluff.z + 3.6], { zoom: 0.036, dur: 0.1, cut: true });
  c.sfx('whoosh', { volume: 0.4 });
  await c.card({ kicker: 'THE DIG', title: 'Bonebed Bluff', sub: 'Four hundred million years in one wall', ms: 2600 });
  await c.shot([v.x + 0.7, v.z + 0.9], { zoom: 0.021, dur: 2.2 });
  c.center(v.x + 1.1, v.z + 0.9);
  if (r && hasAnim(r, 'brush')) r.play('brush', { loop: false, restart: true });
  c.sfx('dig_brush', { volume: 0.3 });
  await c.say(S, 'Hm. Hmm. Cretaceous... no. Jurassic. Obviously.', { style: 'think', anim: 'brush' });
  await c.say(c.fox, 'Um. Hello?', { style: 'say' });
  await turnTo(v, 0.35, 0.5);
  await c.say(S, 'DON\'T. MOVE.', { style: 'shout', anim: 'snap', shake: 0.35, sfx: 'dig_crack' });
  await c.say(c.fox, 'I wasn\'t-', { style: 'scared' });
  await c.say(S, 'You are standing on the Cretaceous.', { style: 'angry' });
  await c.say(S, '...It\'s fine. A T-rex stood there once. She was lighter.', { anim: 'grumble' });
  await c.say(S, 'Professor Ambrose Snapp. Paleontologist. A hundred and forty years old, and these bones are STILL older than me.', { anim: 'talk' });
  if (r && hasAnim(r, 'lure')) r.play('lure', { loop: false, restart: true });
  await c.beat(1.2);
  await c.say(c.fox, '...Is there a WORM in your mouth?', { style: 'scared' });
  await c.say(S, 'That is Gerald. He is a lure. Don\'t look at him. He gets ideas.', { anim: 'talk' });
  const a = await ask(c, S, 'You. Fox. Can you hold a brush?', [
    { label: 'Of course I can!', value: 'yes' },
    { label: 'What\'s in it for me?', value: 'money' },
    { label: 'Can I pet Gerald?', value: 'gerald' },
  ]);
  if (a === 'money') await c.say(S, 'Fossils sell. Rare ones sell for a LOT. ...There. Now you\'re listening.', { anim: 'tap_hammer' });
  else if (a === 'gerald') { await c.say(S, 'NO.', { style: 'shout', anim: 'snap' }); await c.say(S, '...He liked that you asked.', { style: 'whisper' }); }
  else await c.say(S, 'Good. Most people hold it like a spoon.', { anim: 'loupe' });
  await c.say(S, 'Three digs, right here on the Bluff. See the little orange flags? Brush near the bone, pick the hard stuff.', { anim: 'talk' });
  await c.shot([B.home[1].x, B.home[1].z], { zoom: 0.024, dur: 1.4 });
  await c.say(S, 'Then bring what you find to my bench. Crack anything and I will know. I will FEEL it.', { style: 'angry' });
  c.sfx('levelup', { volume: 0.35 });
  await c.card({ kicker: 'NEW', title: 'Fossil Digs', sub: 'Tap a flagged mound to dig · Snapp\'s bench cleans and identifies', ms: 2400 });
  if (r) r.play('idle', { loop: true });
}

// ------------------------------------------------------------------ the questline beats at the Bluff
async function atBluff(c, v, lines) {
  const S = snappActor(c.game, v);
  c.fox.place(v.x + 2.1, v.z + 1.6, Math.PI);
  c.fox.lookAt(v.x, v.z);
  // he half-turns to the fox, three-quarters to the camera
  if (v.rig) v.rig.root.rotation.y = 0.62;
  // [v32 cine] a wide establishing shot of the Bluff, a slow push, then cut in close for the talk
  await c.shot([v.x + 0.6, v.z - 0.4], { zoom: 0.026, dur: 0.1, cut: true });
  c.push(0.86, 1.4);
  await c.beat(1.1);
  c.center(v.x + 1.05, v.z + 0.85);
  await c.shot([v.x + 0.35, v.z + 0.35], { zoom: 0.0112, dur: 0.1, cut: true, lift: (v.y || 0) + 0.55 });
  await c.beat(0.3);
  // face the lens: most of the way to the camera, a little toward the fox
  const faceCam = () => {
    if (!v.rig) return;
    const yaw = c.game.rig?.yawGoal ?? 0, fa = Math.atan2(c.fox.x - v.x, c.fox.z - v.z);
    const d = Math.atan2(Math.sin(fa - yaw), Math.cos(fa - yaw));
    turnTo(v, yaw + d * 0.3, 0.5);
  };
  faceCam();
  for (const L of lines) {
    if (typeof L === 'function') { await L(c, S); continue; }
    if (!L.fox) faceCam();
    const who = L.fox ? c.fox : S;
    await c.say(who, L.t, { style: L.style || 'say', anim: L.anim, shake: L.shake, sfx: L.sfx, close: L.fox ? 0.0108 : 0.0094 });
  }
  // pull back out for the last beat
  await c.shot([v.x + 1, v.z + 0.9], { zoom: 0.02, dur: 0.9 });
  if (v.rig) v.rig.play('idle', { loop: true });
}

export const BEATS = {
  snapp_amber: (c, sys, v) => atBluff(c, v, [
    { t: 'Three finds. Not ONE dropped in the brook. I am almost impressed.', anim: 'loupe' },
    { t: 'I am not. But almost.', anim: 'grumble' },
    { t: 'Now. Amber. Tree sap, fossilised. Golden, sticky, full of secrets.', anim: 'talk' },
    { t: 'Secrets are worth money.', fox: true },
    { t: 'EVERYTHING is worth money to you. Research Amber Studies. Then dig me a piece.', style: 'angry', anim: 'tap_hammer' },
  ]),
  snapp_maps: (c, sys, v) => atBluff(c, v, [
    { t: 'Hold it up to the light. See the little bubbles? Air from forty million years ago.', anim: 'loupe' },
    { t: 'If there was a mosquito in there... could we make a DINOSAUR?', fox: true, style: 'excited' },
    { t: 'NO. Every film that starts like that ends in lawyers.', style: 'shout', anim: 'snap', shake: 0.25 },
    { t: '...But. Fish. Fish are older than dinosaurs. Much older.', style: 'think', anim: 'grumble' },
    async (c, S) => {
      const a = await ask(c, S, 'Do you want to see something nobody alive has ever seen?', [{ label: 'Yes!', value: 'yes' }, { label: 'Will it bite me?', value: 'bite' }]);
      if (a === 'bite') await c.say(S, 'Probably. Good things usually do.', { anim: 'lure' });
    },
    { t: 'I need samples. Lots. Take my old maps, dig all over the valley...', anim: 'talk' },
    { t: '...and put some on display, so the public stops asking me what a fossil is.', style: 'angry', anim: 'tap_hammer' },
  ]),
  snapp_vial: (c, sys, v) => atBluff(c, v, [
    { t: 'The museum is a hit. A cub licked the ammonite. Twice.', anim: 'grumble' },
    { t: 'Now. The real work.', anim: 'talk' },
    { t: 'Amber keeps things fresh. Bone dust remembers the shape. Mix them right...', style: 'whisper', anim: 'loupe' },
    { t: '...and you get a vial that wakes the OLD fish inside a new one.', style: 'excited', anim: 'happy' },
    { t: 'And you trust ME with this?', fox: true },
    { t: 'No. But my hands shake and yours don\'t. Research the Primordial Vial. Brew it at my bench. Feed it to an ADULT fish.', anim: 'talk' },
  ]),
  snapp_finale: (c, sys, v) => atBluff(c, v, [
    { t: 'Three kinds of living fossil in a fox\'s pond. And a bear ATE one.', anim: 'grumble' },
    { t: 'Five stars, it said. Barbarians. ...Correct, but barbarians.', style: 'angry', anim: 'tap_hammer' },
    { t: 'Here. My own trowel. Older than your pond. Don\'t lose it.', style: 'happy', anim: 'happy' },
    { t: 'Is it worth anything?', fox: true },
    { t: 'GERALD, NOT NOW.', style: 'shout', anim: 'snap', shake: 0.2 },
  ]),
};

// ------------------------------------------------------------------ Snapp at your pond
export async function snappLiving(c, sys, fish) {
  const game = c.game;
  if (!fish || fish.dead || !C3.SnapperProf) return;
  // a stage Snapp, on the bank near the fish
  const rig = new C3.SnapperProf();
  const spot = sys.bankNear(fish.x, fish.z) || { x: fish.x + 1.5, z: fish.z + 1.5 };
  const v = { x: spot.x, z: spot.z, y: game.grid.groundAt(spot.x, spot.z), rig };
  rig.root.position.set(v.x, v.y, v.z);
  rig.root.rotation.y = Math.atan2(fish.x - v.x, fish.z - v.z);
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(rig.root);
  let alive = true;
  const tick = () => { if (!alive) return; rig.update(1 / 60); requestAnimationFrame(tick); };
  tick();
  try {
    const S = snappActor(game, v);
    const fb = sys.bankNear(v.x - 1.2, v.z + 1) || { x: v.x - 1.4, z: v.z + 1.2 };
    c.fox.place(fb.x, fb.z);
    c.fox.lookAt(fish.x, fish.z);
    await c.shot([v.x, v.z + 0.6], { zoom: 0.02, dur: 0.1, cut: true });
    rig.play('walk', { loop: true });
    await c.say(S, 'I came as fast as I could. Which is not fast. I am a turtle.', { anim: 'grumble' });
    await c.shot([fish.x, fish.z], { zoom: 0.017, dur: 1.4 });
    rig.play('loupe', { loop: false, restart: true });
    await c.say(S, 'Look at it. LOOK at it.', { style: 'whisper' });
    await c.say(S, 'A hundred and forty years I dug up their bones... and there\'s one. Swimming. Being smug about it.', { style: 'sad' });
    await c.say(c.fox, 'Do you... need a minute?', { style: 'say' });
    await c.shot([v.x, v.z + 0.5], { zoom: 0.02, dur: 0.9 });
    await c.say(S, 'I need SEVERAL minutes.', { style: 'angry', anim: 'grumble' });
    await c.say(S, 'Make me more. One is a miracle. Three is a population.', { style: 'excited', anim: 'happy' });
  } finally {
    alive = false;
    rig.dispose?.();
    rig.root.removeFromParent();
  }
}

// ------------------------------------------------------------------ the vial
const FOX_WOW = {
  sabre: 'Those aren\'t teeth. Those are FURNITURE.',
  armour: 'It\'s wearing armour. My fish is wearing ARMOUR.',
  fossil: 'It looks like a rock that learned to swim. Expensive rock.',
  lobe: 'Its fins have... elbows? Why do its fins have elbows?',
  thorn: 'Ow. Just looking at it. Ow.',
};
function flash(color = '#fff8e0', ms = 260) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;z-index:72;pointer-events:none;background:${color};opacity:.9;transition:opacity ${ms}ms steps(4)`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; }));
  setTimeout(() => el.remove(), ms + 80);
}
export async function vialScene(c, sys, fish, onChange) {
  const game = c.game, P = game.particles;
  const sp = fish.sp, arch = archetypeOf(sp.id), A = ancientInfo(sp.id);
  const fy = () => (fish.y ?? -0.3) + 0.15;
  const bank = sys.bankNear(fish.x, fish.z) || { x: fish.x - 1.6, z: fish.z + 1.3 };
  c.fox.place(bank.x, bank.z);
  c.fox.lookAt(fish.x, fish.z);
  await c.shot([(fish.x * 2 + bank.x) / 3, (fish.z * 2 + bank.z) / 3], { zoom: 0.018, dur: 0.1, cut: true });
  await c.say(c.fox, 'One drop. Snapp said ONE drop.', { style: 'whisper' });
  c.push(0.8, 1.6);
  // the drop falls: a golden-green bead and a trail of sparkles
  c.sfx('dig_vial', { volume: 0.55 });
  for (let k = 0; k < 10; k++) { c.fx('sparkle', fish.x, fy() + 1.6 - k * 0.15, fish.z, 1, k % 2 ? 0xc8f070 : 0xffd060); await c.beat(0.05); }
  c.fx('splash', fish.x, fish.z, 6, 0.4);
  c.fx('bubbles', fish.x, fy(), fish.z, 8);
  await c.beat(0.5);
  // it starts: the water churns, an amber glow, the ground rumbles
  c.sfx('dig_rumble', { volume: 0.6 });
  for (let k = 0; k < 14; k++) {
    c.shake(0.08 + k * 0.025);
    c.fx('sparkle', fish.x + (Math.random() - 0.5) * 0.8, fy() + Math.random() * 0.4, fish.z + (Math.random() - 0.5) * 0.6, 2, k % 3 ? 0xffc040 : 0x9af06a);
    if (k % 3 === 0) c.fx('bubbles', fish.x, fy(), fish.z, 4);
    if (k % 4 === 0) c.fx('splash', fish.x, fish.z, 4, 0.5);
    await c.beat(0.11);
  }
  c.sfx('dig_roar', { volume: 0.7 });
  c.shake(0.7);
  flash('#fff6d0', 320);
  await c.beat(0.08);
  onChange?.();
  c.fx('confetti', fish.x, fy() + 0.6, fish.z, 30);
  c.fx('puff', fish.x, fy() + 0.3, fish.z, 10, 0.5);
  c.fx('bigSplash', fish.x, fish.z);
  await c.beat(0.6);
  await c.card({ kicker: 'PREHISTORIC FORM', title: ancientName(sp), sub: `${A.latin} · back from the ${A.era}`, ms: 2800 });
  await c.say(c.fox, FOX_WOW[arch] || FOX_WOW.thorn, { style: 'excited' });
  await c.say(c.fox, 'Worth about six times as much, too. Hello, gorgeous.', { style: 'happy' });
}

export { SPECIES_BY_ID };
