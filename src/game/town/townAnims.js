// [v33 town] Small procedural everyday animations for the neighbours' rigs
// (any BipedRig): stretch, yawn, sit on the ground, sit on a bench, nap,
// read a little book, sweep with a broom. They are added to the rig class's
// animation table under `town_*` names (the rig's own idle / walk / specials
// stay untouched), and the two hand props (a straw broom, a pocket book) are
// voxel models built once and hung on the rig on first use.
//
//   installTownAnims(rig)          -> true when the rig can do them (BipedRig with legTo/reach)
//   rig._townSeat = 0 | 1 | 2      standing / on the ground / on a bench (read + nap follow it)
import * as THREE from 'three';
import { VoxelModel, VS, FV, buildGeo, matFor, sin, cos, abs, max, lerp, K, win, pulse, tone } from '../../entities/critterKit.js';

const TOWN = {};
const def = (name, o) => { TOWN[name] = o; };

// ------------------------------------------------------------------ props (hand-placed voxels)
let G = null;
function propGeo() {
  if (G) return G;
  // a straw broom: knotty birch handle, a red twine band, a splayed bristle fan
  const b = new VoxelModel();
  const wood = 0xb88a52, woodD = 0x8a6236, woodL = 0xd4a86a;
  for (let y = -17; y <= 0; y++) b.set(0, y, 0, y % 5 === 0 ? woodD : (y * 7) % 3 === 0 ? woodL : wood);
  b.set(0, 1, 0, woodD); b.set(1, -6, 0, woodD); // the knot + a cap
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x || z) { b.set(x, -17, z, 0xc8402a); b.set(x, -18, z, 0x9a2a1e); }
  const straw = [0xe8c060, 0xd8a840, 0xf2d47a, 0xc89838];
  for (let y = -19; y >= -25; y--) {
    const r = Math.min(4, 1 + ((-19 - y) * 0.6) | 0);
    for (let x = -r; x <= r; x++) for (let z = -1; z <= 1; z++) {
      if (abs(x) === r && y > -22) continue;
      if (y === -25 && (x * 5 + z * 3) % 3 === 0) continue; // ragged tips
      b.set(x, y, z, straw[(x * 3 + y * 5 + z * 7 + 40) % 4]);
    }
  }
  // a pocket book: leaf-green cloth cover, cream pages with ink lines, a ribbon
  const k = new VoxelModel();
  const cov = 0x4a8a4a, covD = 0x346a36, page = 0xfaf2dc, ink = 0x6a6a7a;
  for (let x = -6; x <= 6; x++) for (let y = 0; y <= 8; y++) {
    k.set(x, y, 0, x === 0 ? covD : tone(x, y, 0, cov, covD, 0x5aa05a, 0.12, 0.08));
    if (abs(x) <= 5 && y >= 1 && y <= 7 && x !== 0) k.set(x, y, 1, (y % 2 === 0 && abs(x) >= 2 && abs(x) <= 4 && (x * y) % 5 !== 0) ? ink : page);
  }
  k.set(1, -1, 1, 0xc8402a); k.set(1, -2, 1, 0xc8402a); // ribbon bookmark
  G = { broom: buildGeo(b, [0.5, 0.5, 0.5], FV), book: buildGeo(k, [0.5, 4, 0], FV) };
  return G;
}

function props(rig) {
  if (rig._townProps) return rig._townProps;
  const g = propGeo();
  const broom = new THREE.Group();
  const bm = new THREE.Mesh(g.broom, matFor(g.broom));
  bm.castShadow = true;
  broom.add(bm);
  broom.visible = false;
  rig.mover.add(broom);
  const book = new THREE.Group();
  const km = new THREE.Mesh(g.book, matFor(g.book));
  km.castShadow = true;
  book.add(km);
  book.visible = false;
  rig.chest.add(book);
  rig._townProps = { broom, book };
  return rig._townProps;
}
const hideProps = (s, rig) => { const P = rig._townProps; if (P) { P.broom.visible = false; P.book.visible = false; } };

// ------------------------------------------------------------------ pose helpers
const _c = [0, 0];
/** stand with the rig's own idle underneath (keeps each character's quirks) */
function base(t, p, f, s, rig, dt) {
  const idle = rig._ANIMS.idle;
  if (idle && idle !== TOWN.idle) idle.fn(t, p, f, s, rig, dt);
  else { rig.life(t, p); rig.armsDown(p); rig.stance(p, 0.3); }
}
/** seated: mode 1 = on the ground, legs out; mode 2 = on a bench, legs dangling. w blends in. */
function seat(p, rig, mode, w, t) {
  const D = rig.D;
  rig.life(t, p, 0.6);
  const hipH = 2.3;
  p.hips.y += (-D.HIP_Y + hipH) * w;
  p.hips.rx += -0.18 * w;
  p.chest.rx += -0.06 * w + 0.05 * w * sin(t * 0.7);
  const L = D.THIGH + D.SHIN;
  if (mode === 2) {
    // legs over the edge, swinging a little
    const sw = sin(t * 2.1) * 0.6;
    rig.legTo(p, 1, lerp(-p.mover.y, hipH - D.SHIN - 0.6 + sw * 0.3, w), lerp(0.3, D.THIGH * 0.95 + sw, w));
    rig.legTo(p, -1, lerp(-p.mover.y, hipH - D.SHIN - 0.6 - sw * 0.3, w), lerp(0.3, D.THIGH * 0.95 - sw, w));
  } else {
    rig.legTo(p, 1, lerp(-p.mover.y, 0.5, w), lerp(0.3, L * 0.9, w));
    rig.legTo(p, -1, lerp(-p.mover.y, 0.4, w), lerp(0.3, L * 0.86, w));
  }
  p.thighL.rz = 0.12 * w; p.thighR.rz = -0.12 * w;
}
/** paws resting on the lap / knees */
function lap(p, rig, w = 1) {
  for (const side of [1, -1]) {
    const c = rig.toChest(p, 2.8, 3.4, _c);
    rig.reach(p, side, 2.2, c[0], c[1], [0.9, -0.3, -0.8], w);
  }
  p.handL = p.handR = 'relax';
}

// ------------------------------------------------------------------ the animations
def('town_stretch', {
  dur: 2.8, expr: 'neutral',
  fn(t, p, f, s, rig, dt) {
    base(t, p, f, s, rig, dt);
    const w = K(t, [[0, 0], [0.55, 1, 'out'], [1.9, 1], [2.6, 0, 'io']]);
    const top = rig.headPoint(p, 13, 0.5, _c);
    for (const side of [1, -1]) rig.reach(p, side, lerp(4, 1.6, w), lerp(2, top[0], w), lerp(2, top[1], w), [1, 0.3, -0.2], w);
    p.handL = p.handR = w > 0.6 ? 'open' : 'relax';
    p.chest.rx -= 0.2 * w; p.head.rx -= 0.28 * w;
    p.chest.rz += sin(t * 3) * 0.08 * w;
    p.mover.y += 0.5 * w * (1 + sin(t * 6) * 0.2);
    if (w > 0.5) { f.eyes = 'shut'; f.mouth = 'o'; }
  },
});

def('town_yawn', {
  dur: 2.4, expr: 'neutral',
  fn(t, p, f, s, rig, dt) {
    base(t, p, f, s, rig, dt);
    const w = K(t, [[0, 0], [0.5, 1, 'out'], [1.7, 1], [2.3, 0, 'io']]);
    const m = rig.headPoint(p, 2.2, 6.5, _c);
    rig.reach(p, -1, 0.8, m[0], m[1], [1, 0.4, -0.4], w);
    p.handR = 'open';
    p.armL.rz += 0.55 * w; p.foreL.rx -= 0.5 * w;
    p.head.rx -= 0.32 * w; p.chest.rx -= 0.08 * w;
    p.head.rz += sin(t * 2) * 0.06 * w;
    if (w > 0.3) { f.eyes = 'shut'; f.mouth = 'open'; }
    if (t > 2.0) f.eyes = 'sleepy';
  },
});

def('town_sit', {
  loop: true, expr: 'neutral',
  enter(s, rig) { s.from = rig._townSat ? 1 : 0; rig._townSat = true; },
  exit(s, rig, next) { if (!String(next).startsWith('town_')) rig._townSat = false; hideProps(s, rig); },
  fn(t, p, f, s, rig) {
    const w = s.from ? 1 : K(t, [[0, 0], [0.7, 1, 'io']]);
    const mode = rig._townSeat || 1;
    seat(p, rig, mode, w, t);
    lap(p, rig, w);
    // looks about, swings the feet, hums now and then
    const T = t % 12;
    p.head.ry += K(T, [[0, 0], [3, 0], [3.6, 0.5], [5.4, 0.5], [6, -0.3], [7.6, -0.3], [8.2, 0]]);
    p.head.rz += win(T, 9, 11.4, 0.4, 0.4) * sin(t * 3.6) * 0.08;
    if (win(T, 9, 11.4) > 0.5) { f.eyes = 'happy'; f.mouth = 'smile'; }
  },
});

def('town_nap', {
  loop: true, expr: 'neutral',
  enter(s, rig) { s.from = rig._townSat ? 1 : 0; rig._townSat = true; },
  exit(s, rig, next) { if (!String(next).startsWith('town_')) rig._townSat = false; hideProps(s, rig); },
  fn(t, p, f, s, rig) {
    const mode = rig._townSeat || 0;
    const w = s.from ? 1 : K(t, [[0, 0], [0.8, 1, 'io']]);
    if (mode) { seat(p, rig, mode, w, t); lap(p, rig, w); } else { rig.life(t, p, 0.4); rig.armsDown(p, 0.08); rig.stance(p, 0.5); }
    const br = sin(t * 1.3);
    p.head.rx += (0.42 + br * 0.04) * w; p.head.rz += 0.12 * w;
    p.chest.rx += (0.12 + br * 0.03) * w; p.chest.s = 1 + br * 0.03;
    // a little nod-off jerk every so often
    const nod = pulse(t % 9, 6.5, 0.5);
    p.head.rx -= nod * 0.35;
    f.eyes = nod > 0.3 ? 'half' : 'sleep'; f.mouth = 'flat'; f.blink = false;
  },
});

def('town_read', {
  loop: true, expr: 'neutral',
  enter(s, rig) { s.from = rig._townSat ? 1 : 0; },
  exit(s, rig, next) { if (!String(next).startsWith('town_')) rig._townSat = false; hideProps(s, rig); },
  fn(t, p, f, s, rig, dt) {
    const P = props(rig);
    const mode = rig._townSeat || 0;
    if (mode) seat(p, rig, mode, s.from ? 1 : K(t, [[0, 0], [0.7, 1, 'io']]), t);
    else base(t, p, f, s, rig, dt);
    const w = K(t, [[0, 0], [0.4, 1, 'out']]);
    P.book.visible = w > 0.3;
    const by = 1.2, bz = 5.6;
    P.book.position.set(0, by * VS, bz * VS);
    P.book.rotation.set(-1.05, 0, 0);
    P.book.scale.setScalar(Math.max(0.01, w));
    for (const side of [1, -1]) rig.reach(p, side, 2.6, by + 0.6, bz - 0.4, [0.9, -0.6, -0.4], w);
    p.handL = p.handR = 'open';
    // reads down the page, flips it every few seconds
    const T = t % 5;
    p.head.rx += (0.3 + T * 0.025) * w;
    p.head.ry += sin(t * 0.9) * 0.05 * w;
    const flip = pulse(T, 4.3, 0.5);
    p.wristL.rz += flip * 0.9; p.armL.rx -= flip * 0.25;
    f.eyes = 'half'; f.look = [0, 1];
    if (flip > 0.3) f.mouth = 'o';
  },
});

def('town_sweep', {
  loop: true, expr: 'neutral',
  exit: hideProps,
  fn(t, p, f, s, rig) {
    const P = props(rig);
    rig.life(t, p, 0.7);
    const ph = t * 3.4;
    const swing = sin(ph);
    rig.stance(p, 0.7, 0.6, -0.4, 0.08);
    p.hips.ry += swing * 0.12; p.chest.ry += swing * 0.18; p.chest.rx += 0.16;
    p.head.rx += 0.22; p.head.ry -= swing * 0.1;
    // the broom hangs from the right hand at chest height and swishes side to side
    const D = rig.D;
    const topY = D.HIP_Y + D.WAIST + D.SH[1] - 1.6, topX = -1.4, topZ = 3.4;
    const rx = -0.42, rz = swing * 0.42;
    P.broom.visible = true;
    P.broom.position.set(topX * VS, topY * VS, topZ * VS);
    P.broom.rotation.set(rx, 0, rz);
    // a point `d` broom voxels down the handle (Euler XYZ: Z first, then X), in rig voxels
    const L = FV / VS;
    const along = (d) => { const a = d * L; return [topX + a * sin(rz), topY - a * cos(rz) * cos(rx), topZ - a * cos(rz) * sin(rx)]; };
    const a = along(1.5), b = along(9);
    const ca = rig.toChest(p, a[1], a[2], [0, 0]), cb = rig.toChest(p, b[1], b[2], [0, 0]);
    rig.reach(p, -1, -a[0], ca[0], ca[1], [0.8, -0.2, -1]);
    rig.reach(p, 1, b[0], cb[0], cb[1], [0.8, -0.6, -0.8]);
    p.handL = p.handR = 'fist';
    if (abs(swing) > 0.97 && t % 2 < 1) f.mouth = 'smile';
  },
});

/** Add the town_* animations to a rig (shared per rig class). False when the rig can't. */
export function installTownAnims(rig) {
  if (!rig || !rig._ANIMS || typeof rig.legTo !== 'function' || typeof rig.reach !== 'function' || !rig.D) return false;
  if (rig._townOK) return true;
  for (const [k, d] of Object.entries(TOWN)) if (!rig._ANIMS[k]) rig._ANIMS[k] = d;
  const A = rig.anims;
  if (Array.isArray(A)) for (const k of Object.keys(TOWN)) if (!A.includes(k)) A.push(k);
  rig._townOK = true;
  return true;
}

export const TOWN_ANIMS = Object.keys(TOWN);
export { max };
