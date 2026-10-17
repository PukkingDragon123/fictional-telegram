// Shots for the promo video: the villagers present the game in their own speech
// bubbles (Pip first), real gameplay staged in the live game. Driven by director.js;
// rendered by render.mjs; cut together by tools/video/build.py (edit list: edl_promo.json).
import * as THREE from 'three';
import * as C3 from '../../src/entities/critters3d.js';
import { FoxRig } from '../../src/entities/foxRig.js';
import { FILL_GOLD, FILL_HOT, FILL_ICE, FILL_PINK, FILL_GREEN } from './overlay.js';
import { keepUI } from './director.js';

export const SHOTS = {};

// ------------------------------------------------------------------ helpers (shared with shots_trailer.js)
export function clearDecos(g, x0, z0, x1, z1, { forest = true } = {}) {
  // forest tiles grow procedural trees + bushes: clear them the way the beavers do
  if (forest && g.beavers?.clearInstant) for (let z = Math.ceil(z0); z <= z1; z++) for (let x = Math.ceil(x0); x <= x1; x++) { try { g.beavers.clearInstant(x, z); } catch { /* not clearable */ } }
  for (const d of g.world.decos) if (!d.removed && d.x >= x0 && d.x <= x1 && d.z >= z0 && d.z <= z1) d.removed = true;
  for (const c of g.world.clutter || []) if (!c.removed && c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1) c.removed = true;
  try { g.world.buildDecos(); g.world.buildClutter(); } catch (e) { console.warn('[dir] decos', e); }
}
export function stockPond(g, n = 22, species = ['bluegill', 'perch', 'brook', 'sockeye', 'aurora', 'rainbow', 'tiger', 'mapleKoi']) {
  for (let i = 0; i < n; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn(species[i % species.length], p.x, p.z, { adult: true }); }
}
// common staging: no HUD, no quest/notification chatter, no random feast events, the real fox parked
export function prep(c, { hour = 10, fox = false, phase = null } = {}) {
  const g = c.g;
  c.noUI(); c.quietVillagers(); c.bubbles(3);
  if (g.ui) { g.ui.notify = () => null; g.ui.toast = () => null; }
  g.notify = () => null;
  g.state.paused = false;
  g.state.hour = hour;
  if (g.feast) g.feast.nextT = 1e9;
  if (!fox) { g.fox.rig.root.visible = false; }
  // hold the clock (the day must not roll on into the evening / bedtime mid-shot)
  // (late hours: a quiet 'night' phase, so the day loop does not start a rush / the bedtime by itself)
  c.phase = phase || (hour >= 16.9 ? 'night' : null);
  if (c.phase) g.state.phase = c.phase;
  c.every(() => {
    if (g.state.phase === 'rush' || c.freeClock) return;
    g.state.hour = c.hour ?? hour;
    if (c.phase) g.state.phase = c.phase;
  });
  c.hour = hour;
}
// a villager rig standing in the world (our own copy): plays `anim` looped, updated every frame
export function addRig(c, cls, x, z, { ry = 0, scale = 1, anim = 'idle', y = null } = {}) {
  const rig = new C3[cls]({ shadows: true });
  rig.root.position.set(x, y ?? c.ground(x, z), z);
  rig.root.rotation.y = ry;
  rig.root.scale.multiplyScalar(scale);
  c.g.scene.add(rig.root);
  rig.play(anim, { fade: 0, loop: true });
  rig.update(0.5);
  c.every((t, dt) => rig.update(dt));
  c.actors.push(rig);
  return rig;
}
// Reynard (our own copy, the in-game scale)
export function addFox(c, x, z, { ry = 0, scale = 0.85, anim = 'idle', y = null, outfit = null } = {}) {
  const fox = new FoxRig({ shadows: true });
  fox.root.scale.setScalar(scale);
  fox.root.position.set(x, y ?? c.ground(x, z), z);
  fox.root.rotation.y = ry;
  if (outfit) fox.setOutfit(outfit);
  c.g.scene.add(fox.root);
  fox.play(anim, { fade: 0 });
  fox.update(0.5);
  c.every((t, dt) => fox.update(dt));
  c.actors.push(fox);
  return fox;
}
export function once(rig, name, back = 'idle', o = {}) { rig.play(name, { fade: 0.15, loop: false, restart: true, onDone: () => rig.play(back, { fade: 0.2, loop: true }), ...o }); }
// a line of dialogue: bubble + talking anim (+ fox mouth)
export function line(c, rig, text, { h = 1.6, mood = 'happy', voice = 'cub', dur = null, anim = 'talk', back = 'idle', size = 'm', expr = null } = {}) {
  const d = dur ?? Math.max(1.6, 0.9 + text.length * 0.065);
  if (anim) rig.play(anim, { fade: 0.15, loop: true, restart: false });
  if (rig.talk) rig.talk(text.replace(/\*/g, ''));
  if (expr && rig.setExpression) rig.setExpression(expr, { hold: d });
  c.say(c.above(rig, h), text, { voice, mood, dur: d, size });
  if (anim && back) c.at(c.t + d, () => rig.play(back, { fade: 0.25, loop: true }));
}
// world point on the shot clock's screen
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// spawn a customer bear at (x, z) doing nothing in particular (own AI)
export function bearAt(g, x, z, type = 'office', state = 'search') {
  const b = g.bears.spawnBear({ type, wants: [], prefer: null, delay: 0 });
  b.state = state; b.x = x; b.z = z; b.y = 0;
  g.bears.show(b);
  g.bears.initDone = true;
  return b;
}
// a bear frozen in a pose (scripted: its AI is skipped), facing yaw
export function holdBear(b, { pose = 'idle', heading = null } = {}) {
  b.script = { update: () => true, pose };
  if (heading != null) b.heading = heading;
  return b;
}
// title-card shorthands
const CARD = { y: 0.2, size: 104.17, outline: 5, outer: 4 };
function card(c, lines, o) {
  // every card lands with a swish (slams with a boom)
  c.at(Math.max(0, (o.t0 ?? 0) - 0.02), () => c.sfx(o.anim === 'slam' ? 'dramatic_boom' : 'swish', { vol: o.anim === 'slam' ? 0.7 : 0.8 }));
  return c.ov.card(lines, { ...CARD, ...o });
}

// ------------------------------------------------------------------ the cast's spots
const SHORE_S = { x: 67.4, z: 38.7 }; // the sand south of the pond

// ================================================================== PART A (Fluffing a Duck, take 1)
// 1. Pip says hi
SHOTS.pip_intro = {
  dur: 6.3,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 9.4 });
    stockPond(g, 28);
    clearDecos(g, 56, 38, 80, 56);
    const pip = (c.pip = addRig(c, 'ChipmunkTrader', SHORE_S.x, SHORE_S.z, { ry: 0.1 }));
    c.presim(2.5);
    c.path([
      { t: 0, x: SHORE_S.x + 0.55, z: SHORE_S.z - 0.5, y: 0.7, yaw: -0.22, pitch: 30, wupp: 0.0102 },
      { t: 6.3, x: SHORE_S.x + 0.4, z: SHORE_S.z - 0.35, y: 0.74, yaw: -0.1, pitch: 28, wupp: 0.0084 },
    ]);
    c.at(0.15, () => { once(pip, 'wave', 'talk'); c.say(c.above(pip, 1.6), 'Hi! I\'m *Pip*!', { voice: 'cub', mood: 'excited', dur: 2.3 }); });
    c.at(2.75, () => line(c, pip, 'Welcome to Reynard\'s pond!', { dur: 3.2, back: 'happy' }));
  },
  update(c, t) { c.g.state.hour = 9.4 + t * 0.01; },
};

// 2. breed fish (over Pip's shoulder: two fish fall in love, eggs, fry)
SHOTS.breed = {
  dur: 6.2,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 10.5 });
    stockPond(g, 34, ['bluegill', 'perch', 'brook', 'sockeye', 'aurora', 'tiger', 'mapleKoi', 'rainbow']);
    clearDecos(g, 56, 38, 80, 56);
    const pip = addRig(c, 'ChipmunkTrader', 65.3, 37.55, { ry: Math.PI - 0.7 });
    c.presim(2);
    c.path([
      { t: 0, x: 67.0, z: 34.9, y: 0, yaw: 0.12, pitch: 44, wupp: 0.0135 },
      { t: 6.2, x: 67.2, z: 34.6, y: 0, yaw: 0.05, pitch: 45, wupp: 0.0122 },
    ]);
    // the couples: adult fish near the middle of the frame, swimming to a meeting point
    const near = (x, z) => g.fish.list.filter((f) => f.adult && !f.dead).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const pairs = [];
    const take = (x, z) => { const L = near(x, z).filter((f) => !pairs.flat().includes(f)); const a = L[0], b = L.find((f) => f !== a && f.sp.id === a.sp.id) || L[1]; pairs.push([a, b]); a.x = x - 0.25; a.z = z; b.x = x + 0.25; b.z = z; return [a, b]; };
    const P1 = take(66.4, 33.2), P2 = take(68.9, 34.4);
    const eggs = [];
    const love = ([a, b]) => { const n = g.fish.eggs.length; try { g.fish.mate(a, b); } catch (e) { console.warn('[dir] mate', e); } if (g.fish.eggs.length > n) eggs.push(g.fish.eggs[g.fish.eggs.length - 1]); };
    c.at(0.2, () => { pip.play('talk', { loop: true }); c.say(c.above(pip, 1.6), 'Step one: *breed fish*!', { voice: 'cub', mood: 'excited', dur: 2.6 }); });
    c.at(1.0, () => love(P1));
    c.at(1.9, () => love(P2));
    c.at(2.9, () => pip.play('happy', { loop: true }));
    c.at(3.5, () => { for (const e of eggs.splice(0, 1)) g.fish.hatchNow(e); });
    c.at(4.0, () => { for (const e of eggs.splice(0, 1)) g.fish.hatchNow(e); });
    c.at(3.7, () => c.say(c.above(pip, 1.6), 'Babies!', { voice: 'cub', mood: 'excited', dur: 2.0 }));
    card(c, ['BREED FISH'], { t0: 0.55, t1: 5.7, anim: 'pop', y: 0.17, fill: FILL_GOLD, wobble: 0.6 });
  },
};

// 3. Reynard, the boss
SHOTS.reynard = {
  dur: 5.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 12.2 });
    stockPond(g, 16);
    clearDecos(g, 60, 39, 90, 56);
    // in front of his hut
    const fox = addFox(c, 78.6, 45.4, { ry: 0.05, anim: 'idle' });
    const pip = addRig(c, 'ChipmunkTrader', 76.4, 46.1, { ry: 0.75 });
    c.presim(1.5);
    c.path([
      { t: 0, x: 77.7, z: 45.2, y: 0.85, yaw: -0.1, pitch: 22, wupp: 0.0128 },
      { t: 5.9, x: 77.9, z: 45.3, y: 0.85, yaw: 0.02, pitch: 21, wupp: 0.0112 },
    ]);
    c.at(0.15, () => line(c, pip, 'That\'s *Reynard*. The boss.', { dur: 2.2, anim: 'talk', back: 'idle' }));
    c.at(0.5, () => { fox.play('polish_monocle', { fade: 0.2 }); fox.setExpression('smug', { hold: 2 }); });
    c.at(2.5, () => { fox.play('greedy', { fade: 0.15 }); fox.setExpression('greedy', { hold: 4 }); line(c, fox, 'Every fish is MONEY!', { voice: 'fox', h: 1.85, mood: 'excited', anim: null, dur: 3.2, expr: 'greedy' }); });
    c.at(3.0, () => g.particles.coins(78.6, 1.6, 45.4, 10));
    c.at(4.3, () => fox.play('count_coins', { fade: 0.2 }));
  },
};

// 4. five o'clock: the big vintage clock rings, Pip gets nervous
SHOTS.clock5 = {
  dur: 5.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 16.86 });
    stockPond(g, 24);
    clearDecos(g, 56, 38, 80, 56);
    const pip = addRig(c, 'ChipmunkTrader', 67.0, 38.7, { ry: 0.15 });
    c.presim(0.5);
    // the HUD clock, big in the middle-right
    c.clock = keepUI('.bigclock-host', { position: 'fixed', left: '72%', top: '46%', right: 'auto', bottom: 'auto', margin: '0', transition: 'none', transform: 'translate(-50%,-50%) scale(2.7)', transformOrigin: '50% 50%', zIndex: 60 });
    c.path([
      { t: 0, x: 67.2, z: 37.0, y: 0.6, yaw: -0.05, pitch: 30, wupp: 0.0135 },
      { t: 5.9, x: 67.2, z: 37.2, y: 0.6, yaw: 0.02, pitch: 30, wupp: 0.0118 },
    ]);
    c.at(0.2, () => line(c, pip, 'Every day at *5 PM*...', { dur: 2.6, mood: 'scared' }));
    c.at(1.95, () => { g.state.hour = 16.99; });
    c.at(2.0, () => { try { g.startRush(); } catch (e) { console.warn('[dir] rush', e); } c.sfx('bell_ring', { vol: 0.7 }); });
    c.at(3.0, () => { pip.play('stuff_cheeks', { fade: 0.1 }); c.say(c.above(pip, 1.6), 'Uh oh...', { voice: 'cub', mood: 'scared', dur: 2.4 }); });
    card(c, ['5 PM'], { t0: 2.0, t1: 5.6, anim: 'slam', x: 0.3, y: 0.22, size: 145.83, fill: FILL_HOT, wobble: 0.8 });
  },
  update(c, t) { if (t < 1.95) c.g.state.hour = 16.86 + t * 0.06; },
};

// 5. the bears march in down the trail (the camera frames the herd wherever it is)
export function herdShot(c, { day = 5, minZ = 14.5 } = {}) {
  const g = c.g;
  g.state.day = day; g.wave = g.bears.planWave(day);
  g.state.hour = 16.95; g.startRush();
  for (const b of g.bears.list) b.t = Math.min(b.t ?? 0, 0.3 + Math.random() * 2.2);
  // the walking herd: visible bears between the cliff path and the pond
  const herd = () => g.bears.list.filter((b) => b.visible && b.state !== 'queued' && b.z > 12 && b.z < 31);
  for (let k = 0; k < 90; k++) {
    c.presim(0.3);
    const H = herd();
    if (H.length >= 3 && H.reduce((s, b) => s + b.z, 0) / H.length > minZ) break;
  }
  const H = herd().length ? herd() : g.bears.list.filter((b) => b.visible);
  const cx = H.reduce((s, b) => s + b.x, 0) / Math.max(1, H.length), cz = H.reduce((s, b) => s + b.z, 0) / Math.max(1, H.length);
  console.log('[dir] herd', H.length, cx.toFixed(1), cz.toFixed(1), H.map((b) => b.x.toFixed(1) + ',' + b.z.toFixed(1)).join(' '));
  return { cx, cz, H };
}
// a scripted parade: n bears in a loose wedge walking from (x, z0) towards +z (the camera at yaw 0)
export function bearParade(c, { x = 71, z0 = 16.5, speed = 1.15, types = ['office', 'hipster', 'construction', 'intern', 'jogger', 'tourist', 'lumberjack', 'grandma', 'accountant'], n = 8 } = {}) {
  const g = c.g, B = g.bears;
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor((i + 1) / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
    const bx = x + side * (1.05 * row + 0.25 * Math.sin(i * 2.1)), bz = z0 - row * 1.25 - 0.3 * Math.cos(i * 1.7);
    const b = bearAt(g, bx, bz, types[i % types.length]);
    b.y = c.ground(bx, bz);
    const sp = speed * (0.92 + 0.16 * Math.sin(i * 3.3));
    b.heading = Math.PI / 2; // (bear headings: x = cos, z = sin; pi/2 walks towards +z)
    b.script = {
      update: (bb, dt) => { bb.z += sp * dt; bb.x += Math.sin(c.t * 1.3 + i) * 0.05 * dt; bb.moving = true; bb.heading = Math.PI / 2; try { B.ground(bb, dt, true); } catch { bb.y = c.ground(bb.x, bb.z); } return true; },
    };
    out.push(b);
  }
  return out;
}
SHOTS.bears_come = {
  dur: 7.9,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 16.95 });
    stockPond(g, 30);
    clearDecos(g, 58, 12, 86, 34);
    g.state.day = 5; g.wave = g.bears.planWave(5);
    const bs = bearParade(c, { x: 71, z0: 20.6 });
    c.presim(0.5);
    const pip = addRig(c, 'ChipmunkTrader', 73.4, 26.4, { ry: -0.35 });
    c.path([
      { t: 0, x: 71.6, z: 21.4, y: 0.5, yaw: 0.12, pitch: 28, wupp: 0.0165 },
      { t: 7.9, x: 71.4, z: 24.2, y: 0.5, yaw: 0.05, pitch: 26, wupp: 0.0152 },
    ]);
    c.at(0.4, () => { pip.play('happy', { loop: true }); c.say(c.above(pip, 1.6), '...the *BEARS* come to eat!', { voice: 'cub', mood: 'shout', dur: 3.4, size: 'm' }); });
    c.at(2.2, () => c.say(c.above(bs[0].rig.root, 2.2), 'Dinner time!', { voice: 'bear', mood: 'happy', dur: 2.0, size: 's' }));
    c.at(3.4, () => c.say(c.above(bs[3].rig.root, 2.0), 'I smell FISH.', { voice: 'bear', mood: 'excited', dur: 2.0, size: 's' }));
    c.at(4.3, () => c.say(c.above(bs[2].rig.root, 2.2), 'Table for eight!', { voice: 'bear', mood: 'normal', dur: 1.8, size: 's' }));
    card(c, ['FEED THE', 'BEARS!'], { t0: 5.85, t1: 7.8, anim: 'slam', y: 0.25, size: 104.17, gap: -8, fill: FILL_HOT });
  },
};

// ================================================================== PART B (take 2: the chaos montage)
// 6. bears eat, Reynard cashes in
SHOTS.cash = {
  dur: 4.3,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 17.3 });
    stockPond(g, 34);
    clearDecos(g, 56, 38, 80, 56);
    g.state.day = 5; g.wave = g.bears.planWave(5);
    g.state.hour = 16.95; g.startRush();
    for (const b of g.bears.list) b.t = Math.min(b.t ?? 0, 0.2 + Math.random());
    c.presim(1.6);
    for (const b of g.bears.list) if (b.state === 'commute') b.trailD = Math.max(b.trailD, g.bears.trailTotal - 2);
    c.presim(8);
    const fox = addFox(c, 70.4, 39.3, { ry: -0.25, anim: 'greedy' });
    fox.setExpression('greedy', { hold: 9 });
    const coins = document.querySelector('#ui .hud') || null;
    c.path([
      { t: 0, x: 68.6, z: 36.3, y: 0.5, yaw: 0, pitch: 36, wupp: 0.0175 },
      { t: 4.3, x: 68.9, z: 36.8, y: 0.5, yaw: -0.05, pitch: 36, wupp: 0.0158 },
    ]);
    const vis = () => g.bears.list.filter((b) => b.visible && Math.abs(b.x - 68.5) < 5 && Math.abs(b.z - 34) < 4);
    c.at(0.3, () => { const b = vis()[0] || g.bears.list[0]; if (b) g.earn(18, b); });
    c.at(0.4, () => line(c, fox, 'Pay up, big guy!', { voice: 'fox', h: 1.85, mood: 'excited', anim: null, dur: 1.9, expr: 'greedy' }));
    c.at(1.2, () => { const b = vis()[1] || g.bears.list[1]; if (b) g.earn(24, b); });
    c.at(2.0, () => { const b = vis()[2] || g.bears.list[2]; if (b) g.earn(31, b); fox.play('cheer', { fade: 0.1 }); });
    c.at(2.45, () => { line(c, fox, 'KA-CHING!', { voice: 'fox', h: 1.85, mood: 'shout', anim: null, dur: 1.8, size: 'l', expr: 'excited' }); c.sfx('coins_jingle', { vol: 0.9 }); });
    c.at(2.8, () => { const b = vis()[3] || g.bears.list[3]; if (b) g.earn(40, b); });
    card(c, ['GET RICH'], { t0: 0.25, t1: 4.0, anim: 'stamp', y: 0.83, x: 0.27, fill: FILL_GOLD, rot: -4 });
  },
};

// 7. Chip builds: structures pop in around the pond
SHOTS.build = {
  dur: 4.3,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 11 });
    stockPond(g, 20);
    clearDecos(g, 56, 36, 84, 56);
    const chip = addRig(c, 'WoodpeckerCarpenter', 68.2, 40.6, { ry: 0.1, anim: 'idle' });
    c.presim(1);
    c.path([
      { t: 0, x: 68.2, z: 39.3, y: 0.4, yaw: 0, pitch: 36, wupp: 0.0172 },
      { t: 4.3, x: 68.2, z: 39.5, y: 0.4, yaw: 0.06, pitch: 36, wupp: 0.0158 },
    ]);
    const builds = [
      [0.35, 'picnic', 64, 39], [0.65, 'rs_umbrella', 71, 39], [0.95, 'lantern', 66, 39], [1.2, 'rs_icecream', 72, 41],
      [1.45, 'flowers', 63, 41], [1.7, 'rs_campfire', 65, 41], [1.95, 'lantern', 70, 40], [2.2, 'rs_bench', 73, 38],
      [2.45, 'rs_photo', 62, 39], [2.7, 'flowers', 67, 42], [2.95, 'picnic', 69, 42], [3.2, 'flag', 74, 41],
    ];
    for (const [t, type, x, z] of builds) {
      c.at(t, () => {
        let s = null;
        try { s = g.structures.place(type, x, z, { instant: true, free: true }); } catch (e) { console.warn('[dir] place', type, e); }
        if (!s) { console.log('[dir] place failed', type, x, z); return; }
        const y = c.ground(x + 0.5, z + 0.5);
        g.particles.popIn?.(x + 0.5, y + 0.2, z + 0.5, 1);
        g.particles.puff(x + 0.5, y + 0.3, z + 0.5, 10, 0.4);
        g.audio.play('place', { volume: 0.5, pitch: 0.9 + Math.random() * 0.3 });
      });
    }
    c.at(0.1, () => { chip.play('hammer', { loop: true }); c.say(c.above(chip, 1.8), 'Then *build*, build, BUILD!', { voice: 'cub', mood: 'excited', dur: 3.6 }); });
    card(c, ['BUILD!'], { t0: 0.3, t1: 4.0, anim: 'pop', y: 0.16, fill: FILL_GREEN, rot: 3, wobble: 0.8 });
  },
};

// 8. Karen wants a refund (the real feast event)
SHOTS.karen = {
  dur: 11.5,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 17.2 });
    stockPond(g, 30);
    clearDecos(g, 56, 36, 84, 56);
    g.state.day = 4; g.wave = g.bears.planWave(4);
    g.state.hour = 16.95; g.startRush();
    for (const b of g.bears.list) b.t = Math.min(b.t ?? 0, 0.2 + Math.random());
    c.presim(1.6);
    for (const b of g.bears.list) if (b.state === 'commute') b.trailD = Math.max(b.trailD, g.bears.trailTotal - 2);
    c.presim(6);
    g.state.coins = Math.max(g.state.coins, 500);
    for (const b of g.bears.list) b.patience = b.maxPatience;
    try { if (!g.feast.free) g.feast.handOver(); } catch (e) { console.warn('[dir] handOver', e); }
    let inst = null;
    for (let k = 0; k < 20 && !inst; k++) { inst = g.feast.raise('karen'); if (!inst) c.presim(0.5); }
    for (let k = 0; k < 80 && inst && !inst.ready; k++) c.presim(0.1);
    c.inst = inst;
    console.log('[dir] karen', !!inst, inst?.ready, g.feast.free);
    if (!inst) console.warn('[dir] karen did not start');
    // the meme beat: MANAGER lands (the line starts ~6.8 s in, types out by ~8.6 s)
    c.at(8.55, () => { c.sfx('dramatic_boom', { vol: 0.9 }); g.rig.shake = 0.5; });
    c.at(8.7, () => c.sfx('crowd_gasp', { vol: 0.55 }));
    // click the icon as soon as it can be clicked
    c.every(() => { if (!c.focused && inst) { try { c.focused = g.feast.focus(inst); if (c.focused) console.log('[dir] karen focus at', c.t.toFixed(2)); } catch (e) { console.warn('[dir] focus', e); c.focused = true; } } });
  },
};

// 9. rampage: a bear goes berserk, the hot tub goes flying
SHOTS.rampage = {
  dur: 4.6,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 15.6 });
    clearDecos(g, 60, 20, 84, 32);
    const tub = g.structures.place('rs_hottub', 72, 24, { instant: true, free: true });
    const booth = g.structures.place('rs_ticket', 68, 24, { instant: true, free: true });
    g.structures.place('lodge', 76, 27, { instant: true, free: true });
    g.structures.place('picnic', 70, 27, { instant: true, free: true });
    c.presim(2);
    const b = bearAt(g, 70.2, 26.4, 'office');
    for (const bv of g.beavers.list) { bv.x = 71 + Math.random() * 2; bv.z = 26.5 + Math.random(); }
    c.presim(0.3);
    const fox = addFox(c, 75.0, 28.6, { ry: -0.5, anim: 'idle' });
    c.path([
      { t: 0, x: 71.6, z: 26.0, y: 0.4, yaw: 0, pitch: 36, wupp: 0.0165 },
      { t: 4.6, x: 71.9, z: 25.9, y: 0.4, yaw: 0.04, pitch: 36, wupp: 0.0152 },
    ]);
    c.at(0.15, () => { try { g.bears.startRampage(b); } catch (e) { console.warn('[dir] rampage', e); } });
    c.at(1.25, () => { try { g.structures.damage(tub, 2); } catch (e) { console.warn('[dir] dmg', e); } g.rig.shake = 0.6; });
    c.at(1.55, () => { try { g.structures.damage(tub, 99); } catch (e) { console.warn('[dir] dmg', e); } g.rig.shake = 1.0; c.sfx('air_horn', { vol: 0.7 }); });
    c.at(1.75, () => { fox.play('horror', { fade: 0.1 }); fox.setExpression('horror', { hold: 3 }); });
    c.at(1.95, () => line(c, fox, 'MY HOT TUB!!', { voice: 'fox', h: 1.85, mood: 'shout', anim: null, dur: 2.4, size: 'l' }));
    c.at(2.9, () => c.sfx('sad_trombone', { vol: 0.8 }));
    card(c, ['UH OH.'], { t0: 0.35, t1: 4.3, anim: 'slam', y: 0.16, fill: FILL_PINK, rot: -3 });
  },
};

// 10. beavers chop the forest (Dale cheers them on)
export function beaverWork(c, { presim = 7 } = {}) {
  const g = c.g;
  g.structures.place('lodge', 73, 33, { instant: true, free: true });
  g.beavers.refreshCounts?.();
  for (const [x, z] of [[77, 28], [77, 25], [75, 24], [78, 24], [74, 22], [76, 22], [75, 21], [76, 21]]) { try { g.beavers.queueClear(x, z); } catch { /* skip */ } }
  c.presim(presim);
  console.log('[dir] beavers', g.beavers.list.map((b) => (b.state || b.job?.kind || '?') + '@' + b.x.toFixed(1) + ',' + b.z.toFixed(1)).join(' '));
}
SHOTS.beavers = {
  dur: 4.3,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 13.5 });
    beaverWork(c);
    const dale = addRig(c, 'DeerGuy', 73.6, 29.6, { ry: 0.5, anim: 'idle' });
    c.path([
      { t: 0, x: 75.6, z: 27.4, y: 0.5, yaw: -0.15, pitch: 36, wupp: 0.0175 },
      { t: 4.3, x: 75.8, z: 27.2, y: 0.5, yaw: -0.05, pitch: 36, wupp: 0.016 },
    ]);
    c.at(0.15, () => { dale.play('cheers', { loop: true }); c.say(c.above(dale, 1.9), 'Hire *beavers*, bud! They work for berries!', { voice: 'fox', mood: 'happy', dur: 3.8 }); });
    c.at(0.9, () => c.sfx('slide_whistle', { vol: 0.5 }));
    card(c, ['HIRE BEAVERS'], { t0: 0.35, t1: 4.0, anim: 'pop', y: 0.15, size: 83.33, fill: FILL_GOLD, rot: 2 });
  },
};

// 11. winter: snow, shivering bears round the campfire, the hot tub steams (Hoot narrates)
export function winterScene(c) {
  const g = c.g;
  clearDecos(g, 58, 36, 84, 50);
  try { g.seasons.set('winter', 'snow'); } catch (e) { console.warn('[dir] seasons', e); }
  const tub = g.structures.place('rs_hottub', 69, 39, { instant: true, free: true });
  g.structures.place('rs_campfire', 65, 40, { instant: true, free: true });
  c.presim(3);
  const bs = [bearAt(g, 64.6, 42.3, 'office'), bearAt(g, 67.1, 42.5, 'intern'), bearAt(g, 69.6, 40.6, 'hipster'), bearAt(g, 63.9, 39.9, 'jogger')];
  for (const b of bs) b.cold = 1;
  try { g.resort?.visit?.(bs[2], tub); } catch (e) { console.warn('[dir] visit', e); }
  // the others huddle round the campfire, shivering (scripted: they stay put)
  for (const b of [bs[0], bs[1], bs[3]]) holdBear(b, { pose: 'idle', heading: Math.atan2(41 - b.z, 66 - b.x) });
  c.presim(0.4);
  c.every(() => { for (const b of bs) b.cold = Math.max(b.cold || 0, 0.92); });
  return { tub, bs };
}
SHOTS.winter = {
  dur: 4.3,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 13 });
    winterScene(c);
    const hoot = addRig(c, 'OwlRanger', 71.6, 42.6, { ry: -0.45, anim: 'idle' });
    c.path([
      { t: 0, x: 67.4, z: 40.6, y: 0.5, yaw: 0.05, pitch: 30, wupp: 0.0158 },
      { t: 4.3, x: 67.6, z: 40.8, y: 0.5, yaw: -0.03, pitch: 30, wupp: 0.0146 },
    ]);
    c.at(0.15, () => { hoot.play('talk', { loop: true }); c.say(c.above(hoot, 1.7), 'Hoo-brrr! Keep your bears *warm*!', { voice: 'bear', mood: 'scared', dur: 3.8 }); });
    card(c, ['4 SEASONS'], { t0: 0.35, t1: 4.0, anim: 'pop', y: 0.15, fill: FILL_ICE, outlineColor: '#10203a', rot: -2 });
  },
};

// 12. the resort: spa, tub, towels, cucumbers (Reynard: luxury, for a price)
SHOTS.resort = {
  dur: 4.3,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 15.2 });
    clearDecos(g, 58, 20, 86, 34);
    const put = (t, x, z) => g.structures.place(t, x, z, { instant: true, free: true });
    const S = { spa: put('rs_spa', 65, 24), tub: put('rs_hottub', 74, 25), towels: put('rs_towels', 78, 25), bench: put('rs_bench', 61, 27), umb: put('rs_umbrella', 69, 22), sauna: put('rs_sauna', 70, 24) };
    put('flowers', 63, 27); put('lantern', 68, 27); put('lantern', 72, 27);
    try {
      if (g.staff?.hire) { const sg = await import('../../src/data/staffGen.js'); for (let k = 0; k < 2; k++) { const r = g.staff.hire(sg.rollBeaver({ quality: 0.7 }), { x: 66, z: 26.5 }); g.staff.assign(r.id, S.spa); } }
    } catch (e) { console.warn('[dir] staff', e); }
    c.presim(4);
    const bs = [bearAt(g, 65.5, 27.5), bearAt(g, 66.5, 27.6, 'intern'), bearAt(g, 75, 28.2, 'hipster'), bearAt(g, 78.5, 27.5, 'jogger'), bearAt(g, 62, 29, 'office')];
    try {
      g.resort.visit(bs[0], S.spa); g.resort.visit(bs[1], S.spa); g.resort.visit(bs[2], S.tub);
      bs[3].rs = null; g.resort.initBear(bs[3]).wet = 1; g.resort.visit(bs[3], S.towels);
      g.resort.visit(bs[4], S.bench);
    } catch (e) { console.warn('[dir] visits', e); }
    c.presim(5);
    const fox = addFox(c, 70.4, 29.6, { ry: 0.0, anim: 'idle' });
    c.path([
      { t: 0, x: 69.4, z: 26.6, y: 0.5, yaw: 0, pitch: 36, wupp: 0.0215 },
      { t: 4.3, x: 70.0, z: 26.8, y: 0.5, yaw: 0.05, pitch: 36, wupp: 0.0195 },
    ]);
    c.at(0.2, () => { fox.play('bow_fancy', { fade: 0.15 }); fox.setExpression('smug', { hold: 4 }); line(c, fox, 'Luxury... for a price.', { voice: 'fox', h: 1.85, mood: 'happy', anim: null, dur: 3.6 }); });
    card(c, ['BUILD A RESORT'], { t0: 0.35, t1: 4.0, anim: 'pop', y: 0.15, size: 83.33, fill: FILL_GOLD, rot: -2 });
  },
};

// 13. end card: golden hour over the pond, the title, Pip's goodbye
SHOTS.endcard = {
  dur: 7.0,
  async setup(c) {
    const g = c.g;
    prep(c, { hour: 18.0 });
    stockPond(g, 30);
    clearDecos(g, 56, 36, 84, 56);
    const pip = addRig(c, 'ChipmunkTrader', 68.8, 39.2, { ry: 0.0 });
    const fox = addFox(c, 70.2, 39.6, { ry: -0.2, anim: 'idle' });
    const chip = addRig(c, 'WoodpeckerCarpenter', 66.9, 39.8, { ry: 0.3 });
    c.presim(2);
    c.path([
      { t: 0, x: 68.6, z: 35.5, y: 0.5, yaw: 0.05, pitch: 28, wupp: 0.0185 },
      { t: 7.0, x: 68.6, z: 35.9, y: 0.5, yaw: -0.02, pitch: 26, wupp: 0.0172 },
    ]);
    c.at(0.05, () => { pip.play('wave', { loop: true }); chip.play('wave', { loop: true }); fox.play('wave_hello', { fade: 0.1 }); });
    c.at(1.15, () => c.say(c.above(pip, 1.6), 'See ya at *5 PM*!', { voice: 'cub', mood: 'excited', dur: 4.0, size: 's' }));
    card(c, ['THE BEAR', 'MUST EAT'], { t0: 0.0, t1: 99, anim: 'slam', y: 0.25, size: 125, sizes: [104.17, 145.83], gap: -14, fill: FILL_GOLD, rot: -3 });
    c.ov.text('Music: "Fluffing a Duck" by Kevin MacLeod (incompetech.com), CC BY 4.0', { t0: 0.8, t1: 99, x: 0.5, y: 0.955, size: 20.83, anim: 'fade', color: '#fff3dc', outline: 2 });
  },
};
