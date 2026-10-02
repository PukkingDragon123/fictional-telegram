// Detailed, bouncy voxel bears in suits.
//
// Every bear type is modelled from its look in BEAR_TYPES as a set of voxel
// parts (hips, torso, belly, head, jaw, ears, arms, legs, tail, hat, tie,
// held item, wallet, coins, steam puffs). The parts are meshed separately
// (greedy + AO, see core/voxel.js) and merged into ONE rigidly skinned
// geometry per type, so a whole bear is a single draw call (+1 for the face).
// Poses are procedural: each pose writes bone channels, poses crossfade, and
// damped springs add follow-through to ears, belly, tie, hat, tail and the
// swinging held item. The face is a tiny animated CanvasTexture (bearFace.js).
//
// Units: 1 voxel = 0.1 model units; the model is scaled by VS (0.625), so a
// voxel is 0.0625 world units and a regular bear is ~2 world units tall.
import * as THREE from 'three';
import { VoxelModel, addGrain, shade, mix, linearRGB } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';
import { BEAR_TYPES } from '../data/bears.js';
import { BearFace, FACE_REGIONS, FACE_QUADS, FACE_W, FACE_H, FACE_INFO, FACE_EXPRESSIONS } from './bearFace.js';

export { FACE_EXPRESSIONS };
export const VS = 0.625; // world units per model unit (voxel = 0.0625 world units)
export const BEAR_POSES = ['idle', 'walk', 'run', 'swim', 'cannonball', 'lunge', 'grab', 'eat', 'yummy', 'toss', 'pay',
  'angry_stomp', 'smash', 'search', 'cheer', 'talk', 'sad', 'wave', 'sit',
  'roar', 'slam', 'charge', 'stagger', 'calm', 'boss_intro',
  // eating styles (driven by src/game/BearEat.js; 'eat' is the classic 3-chomp)
  'eat_gulp', 'eat_rip', 'eat_slurp', 'eat_toss', 'eat_fancy', 'eat_shake', 'eat_crunch'];
// default durations of the one-shot poses (seconds) when no t01 is passed
export const POSE_DURATION = { cannonball: 0.7, lunge: 0.34, grab: 0.36, eat: 1.4, yummy: 0.9, toss: 0.5, pay: 1.5, smash: 0.9,
  roar: 1.5, slam: 1.15, stagger: 0.9, boss_intro: 2.6,
  eat_gulp: 3.0, eat_rip: 3.6, eat_slurp: 2.8, eat_toss: 2.9, eat_fancy: 3.9, eat_shake: 2.5, eat_crunch: 2.6 };
const ONE_SHOT = new Set(Object.keys(POSE_DURATION));
const FADE = { cannonball: 0.1, lunge: 0.08, grab: 0.1, eat: 0.14, toss: 0.12, smash: 0.12, run: 0.18, walk: 0.18, sit: 0.3, swim: 0.2,
  roar: 0.12, slam: 0.1, charge: 0.14, stagger: 0.04, calm: 0.4, boss_intro: 0.08,
  eat_gulp: 0.14, eat_rip: 0.14, eat_slurp: 0.14, eat_toss: 0.12, eat_fancy: 0.16, eat_shake: 0.12, eat_crunch: 0.14 };
// Key moments of the eating poses (seconds into the pose at speed 1) for anything that has to
// sync with them from outside (BearEat flies the tossed snack from 'toss' to 'catch').
export const EAT_CUES = {
  eat_gulp: { drop: 1.36, gulp: 1.56, swallow: 2.05, done: 2.92 },
  eat_rip: { rip: 1.08, bites: [1.86, 2.42, 2.98], done: 3.5 },
  eat_slurp: { start: 0.62, shloop: 2.12, done: 2.72 },
  eat_toss: { toss: 0.4, catch: 1.56, gulp: 1.8, done: 2.82 },
  eat_fancy: { cutlery: 0.46, bites: [1.5, 2.55], done: 3.82 },
  eat_shake: { gulp: 1.9, done: 2.42 },
  eat_crunch: { start: 0.42, ding: 1.86, done: 2.52 },
};

const BLACK = 0x1a1410;
const SHOE = 0x1e1a1e;

// ------------------------------------------------------------------ skeleton
// name, parent, bind position in voxel coordinates (x right, y up, z forward)
const BONE_DEFS = [
  ['base', -1, 0, 0, 0],
  ['hips', 'base', 0, 8, 0],
  ['spine', 'hips', 0, 10, 0],
  ['belly', 'spine', 0, 12.3, 2.3],
  ['head', 'spine', 0, 17.6, 0.3],
  ['jaw', 'head', 0, 20, 4.8],
  ['earL', 'head', -6.9, 28, -0.7],
  ['earR', 'head', 6.9, 28, -0.7],
  ['hat', 'head', 0, 29.8, 0.3],
  ['prop', 'hat', 0, 34.5, 0.3],
  ['armL', 'spine', -8.3, 16.4, 0.8],
  ['armR', 'spine', 8.3, 16.4, 0.8],
  ['item', 'armR', 8.3, 8.7, 1.0],
  ['lid', 'item', 8.5, 1.2, 1.0],
  ['wallet', 'armL', -8.3, 8.4, 2.6],
  ['legL', 'hips', -3, 7.4, 0],
  ['legR', 'hips', 3, 7.4, 0],
  ['tail', 'hips', 0, 10, -5],
  ['tie', 'belly', 0, 16.8, 4.9],
  ['coin0', 'spine', 0, 13, 9],
  ['coin1', 'spine', 0, 13, 9],
  ['coin2', 'spine', 0, 13, 9],
  ['steam0', 'head', -5, 31, 0],
  ['steam1', 'head', 5, 31, 0],
  ['steam2', 'head', 0, 32, -1],
];
const B = {};
BONE_DEFS.forEach((d, i) => { B[d[0]] = i; });
const NB = BONE_DEFS.length;
const BIND = BONE_DEFS.map((d) => new THREE.Vector3(d[2], d[3], d[4]));
const PARENT = BONE_DEFS.map((d) => (d[1] === -1 ? -1 : B[d[1]]));
const ARM_LEN = 7.7; // shoulder joint -> paw centre (voxels)
const HIDE = 1e-4;
const HIDDEN_BONES = [B.wallet, B.coin0, B.coin1, B.coin2, B.steam0, B.steam1, B.steam2];

// ------------------------------------------------------------------ helpers
const se = (x, y, z, cx, cy, cz, rx, ry, rz, p) =>
  Math.pow(Math.abs(x - cx) / rx, p) + Math.pow(Math.abs(y - cy) / ry, p) + Math.pow(Math.abs(z - cz) / rz, p);

// Superellipsoid fill, sampled at voxel centres (x, y + 0.5, z).
function fillSE(v, cx, cy, cz, rx, ry, rz, p, color, test) {
  for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++) {
        const d = se(x, y + 0.5, z, cx, cy, cz, rx, ry, rz, p);
        if (d > 1 || (test && !test(x, y, z, d))) continue;
        v.set(x, y, z, typeof color === 'function' ? color(x, y, z, d) : color);
      }
  return v;
}

function frontZ(v, x, y, from = 30, to = -30) {
  for (let z = from; z >= to; z--) if (v.has(x, y, z)) return z;
  return null;
}

function hash3(x, y, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const wrapA = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
// keyframes [[t, v, ease?], ...] (same as critterKit.K): the ease shapes the segment that ends at a key
const EASE = {
  io: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  lin: (x) => x,
  back: (x) => { const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; },
  el: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-9 * x) * Math.sin((x * 10 - 0.75) * (Math.PI * 2 / 3)) + 1),
};
function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k[0]) {
      const p = keys[i - 1];
      const u = k[0] > p[0] ? (t - p[0]) / (k[0] - p[0]) : 1;
      return p[1] + (k[1] - p[1]) * EASE[k[2] || 'io'](u);
    }
  }
  return keys[keys.length - 1][1];
}
// 0 -> 1 between a and a+ra, back to 0 between b and b+rb
const win = (t, a, b, ra = 0.1, rb = 0.1) => smooth(a, a + ra, t) * (1 - smooth(b, b + rb, t));
// a single bump of length d starting at a
const bump = (t, a, d) => (t >= a && t < a + d ? Math.sin(((t - a) / d) * Math.PI) : 0);
const lumOf = (c) => (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;

// ------------------------------------------------------------------ look
function lookOf(d) {
  const L = { d };
  L.cub = d.scale < 0.7;
  L.boss = !!(d.boss && d.hp);
  L.outfit = d.outfit || (d.straps ? 'coveralls' : d.vest ? 'hivis' : d.flannel ? 'flannel' : d.hawaiian ? 'hawaiian'
    : d.suit === d.shirt ? (d.tie ? 'shirt' : 'tshirt') : d.monocle ? 'tux' : 'jacket');
  // proportions (voxels); defaults are the classic office bear
  const SH = d.shape || {};
  L.T = { cx: 0, cy: 13.6, cz: 0, rx: 7.1, ry: 5.2, rz: 5.1, p: 2.4, taper: 0.42, taperY: 14.6, ...SH.torso };
  L.BL = { cx: 0, cy: 12.3, cz: 2.3, rx: 6.2, ry: 4.4, rz: 5.3, p: 2.2, ...SH.belly };
  L.hump = SH.hump || null;
  L.arm = { rx: 2.2, ry: 5.3, rz: 2.25, cy: 12.6, ...SH.arm };
  L.leg = { rx: 2.35, rz: 2.3, ...SH.leg };
  L.off = { ...(SH.off || {}) };
  L.neckY = Math.round(L.T.cy + L.T.ry - 1.6 - 0.2);
  L.bz = L.BL.cz + L.BL.rz - 7.6; // how far the belly front sticks out past the classic one
  L.fur = d.fur;
  L.furLight = d.furLight;
  L.furDark = lumOf(d.fur) > 0.8 ? 0xd4d4cc : shade(d.fur, 0.78);
  L.furTuft = lumOf(d.fur) > 0.8 ? 0xffffff : mix(d.fur, d.furLight, 0.35);
  L.innerEar = lumOf(d.fur) > 0.8 ? 0xf2b8c0 : mix(d.furLight, 0xf09aa0, 0.45);
  L.pad = lumOf(d.fur) > 0.8 ? 0xf2a8b4 : mix(d.furLight, 0xe88a98, 0.5);
  L.nose = lumOf(d.fur) > 0.8 ? 0x1c1418 : 0x24160f;
  L.suit = d.suit;
  L.suitDark = d.suitDark;
  L.shirt = d.shirt;
  L.lapel = d.monocle ? 0x2e2e36 : shade(d.suitDark, 0.92);
  L.pants = d.hawaiian ? 0xcdb58a : d.flannel ? (d.beard ? 0x24304a : 0x2c3d5e) : d.vest ? 0x3a4c6c : d.straps ? d.suit
    : L.outfit === 'shirt' ? 0x3e4660 : L.outfit === 'tshirt' ? d.suitDark
    : L.outfit === 'threepiece' || L.outfit === 'tracksuit' ? d.suit : L.outfit === 'trench' ? 0x34343e
    : L.outfit === 'cardigan' ? (d.skirt ?? d.suitDark) : L.outfit === 'fur' ? d.fur : d.suitDark;
  L.shorts = d.hawaiian || L.cub || L.outfit === 'cardigan';
  L.boots = d.vest || d.flannel;
  L.barefoot = L.cub || L.outfit === 'fur';
  L.sandals = d.hawaiian;
  L.shoe = d.sneakers ?? (L.boots ? (d.beard ? 0x8a5a30 : 0x6a4424) : L.outfit === 'cardigan' ? 0x5a2a34 : SHOE);
  L.sleeve = d.flannel ? d.suit : d.vest ? d.shirt : d.straps ? mix(d.suit, 0xe8eef4, 0.45) : L.outfit === 'fur' ? d.fur : d.suit;
  L.shortSleeve = L.outfit === 'shirt' || L.outfit === 'tshirt' || d.hawaiian || d.vest;
  L.rolled = d.flannel || d.straps;
  L.cuff = L.outfit === 'jacket' || L.outfit === 'tux' || L.outfit === 'threepiece';
  L.gold = 0xe8c040;
  L.belly = SH.bellyScale ?? (L.boss ? 1 : L.cub ? 1.04 : d.item === 'cane' ? 1.1 : d.cigar ? 1.12 : L.outfit === 'shirt' ? 0.92 : 1);
  L.headScale = SH.headScale ?? (L.cub ? 1.14 : 1);
  // emissive voxels (meshed into a separate unlit mesh)
  L.glow = new Set();
  L.aurora = [0x5ff0a0, 0x48e8c8, 0x52d8ff, 0x7aa0ff, 0xb07aff, 0xff7ad8];
  if (d.aurora) for (const c of L.aurora) L.glow.add(c);
  if (d.markings) { L.glow.add(d.markings); L.glow.add(shade(d.markings, 0.8)); }
  if (L.boss && d.cigar) L.glow.add(0xff6a20);
  // per-bear tint channels: 1 = fur, 2 = accessory (see personalize())
  const furSet = new Map();
  for (const c of [L.fur, L.furLight, L.furDark, L.furTuft, d.grizzle, d.grizzle != null ? mix(d.fur, d.grizzle, 0.5) : null]) if (c != null) furSet.set(c, 1);
  const acc = [d.tie, d.bowtie, d.scarf, d.lanyard, d.accent, d.itemColor, d.hat && d.hat !== 'hardhat' && d.hat !== 'tophat' ? d.hatColor : null];
  if (L.outfit === 'cardigan' || L.outfit === 'tracksuit') acc.push(d.suit, d.suitDark);
  if (d.flannel && d.beard) acc.push(d.suit);
  const accs = L.boss ? [] : acc.filter((c) => c != null && lumOf(c) > 0.06);
  // "is this hex a shade of one of the accessory colours?" (cached)
  const isShadeOf = (h, c) => {
    const hr = (h >> 16) & 255, hg = (h >> 8) & 255, hb = h & 255, cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
    const f = (hr + hg + hb) / Math.max(1, cr + cg + cb);
    if (f < 0.55 || f > 1.4) return false;
    return Math.abs(hr - cr * f) <= 4 && Math.abs(hg - cg * f) <= 4 && Math.abs(hb - cb * f) <= 4;
  };
  const cache = new Map();
  L.chan = {
    get(h) {
      let v = cache.get(h);
      if (v === undefined) { v = furSet.get(h) || (accs.some((c) => isShadeOf(h, c)) ? 2 : 0); cache.set(h, v); }
      return v;
    },
    has(h) { return this.get(h) > 0; },
  };
  return L;
}

// per-type bind pose: the classic skeleton plus shape offsets (voxels)
function bindOf(L, abs = {}) {
  const out = [];
  for (let i = 0; i < NB; i++) {
    const nm = BONE_DEFS[i][0], p = PARENT[i];
    if (abs[nm]) { out.push(abs[nm].clone()); continue; }
    const o = L.off[nm];
    const v = BIND[i].clone();
    if (p >= 0) v.sub(BIND[p]).add(out[p]);
    if (o) v.x += o[0], v.y += o[1], v.z += o[2];
    out.push(v);
  }
  return out;
}

// Colour of the torso/belly at a voxel (applies to the whole body union)
function outfitColor(L, x, y, z) {
  const d = L.d;
  const front = z >= 2;
  const ax = Math.abs(x);
  switch (L.outfit) {
    case 'jacket':
    case 'tux': {
      const n = L.neckY - 17;
      let c = d.suit;
      if (d.pinstripe && ((x + 30) % 3 === 0)) c = d.pinstripe;
      const vw = (y - 10.4 - n) * 0.52;
      if (front && y >= 11 + n && ax <= vw) return d.shirt;
      if (front && y >= 11 + n && ax <= vw + 1.6 && y <= 17.5 + n) return L.lapel;
      if (y <= 8) c = shade(c, 0.9);
      return c;
    }
    case 'threepiece': {
      // open jacket (gold pinstripes) over a waistcoat over a shirt
      const N = L.neckY;
      let c = d.suit;
      if (d.pinstripe && ((x + z + 60) % 4 === 0)) c = d.pinstripe;
      const wv = 3.4 + (y - 8) * 0.24;
      if (front && y >= 7 && ax <= wv) {
        if (y >= N - 3 && ax <= (y - (N - 3.6)) * 0.75) return d.shirt;
        if (y <= 7 && ax >= 1) return c; // waistcoat points
        return ax > wv - 0.9 ? shade(d.waistcoat, 0.8) : d.waistcoat;
      }
      if (front && y >= N - 6 && ax <= wv + 1.8) return L.lapel;
      if (y <= 8) c = shade(c, 0.9);
      return c;
    }
    case 'trench': {
      const N = L.neckY;
      if (y === 11 || y === 12) return y === 12 ? shade(d.suit, 0.66) : shade(d.suit, 0.6); // belt
      if (front && y >= N - 3 && ax <= (y - (N - 3.6)) * 0.62) return d.shirt;
      if (front && y >= N - 7 && ax <= (y - (N - 7.4)) * 0.6 + 1.7) return shade(d.suit, 0.8);
      if (front && x === 2 && y < N - 6) return shade(d.suit, 0.72); // double-breasted flap edge
      return y <= 9 ? shade(d.suit, 0.94) : d.suit;
    }
    case 'tracksuit': {
      const N = L.neckY;
      if (y >= N) return d.suitDark; // collar
      if (y <= 8) return d.suitDark; // hem band
      if (ax >= 5 && (z === 0 || z === -1)) return d.stripe; // side stripes
      if (front && x === 0) return shade(d.suit, 1.3); // zipper
      return d.suit;
    }
    case 'cardigan': {
      if (front && ax <= 1 && y >= 9) return d.shirt; // blouse in the gap
      if (y <= 8) return shade(d.suit, 0.85); // ribbed hem
      return (x + 40) % 2 === 0 ? d.suit : shade(d.suit, 0.92);
    }
    case 'fur': {
      const N = L.neckY;
      if (y >= N && y <= N + 1 && ax <= 5 && z >= -4) return d.shirt; // just a collar...
      if (front && y >= 12 && y < N && ax <= (N - y) * 0.9 + 1) return L.furLight; // chest blaze
      return L.fur;
    }
    case 'shirt':
      return d.shirt;
    case 'tshirt':
      return d.suit;
    case 'coveralls': {
      const bib = front && y <= 15 && ax <= 4.5;
      const strap = (ax >= 3 && ax <= 4.2) && y > 14;
      if (y <= 11) return d.suit;
      if (bib) return d.suit;
      if (strap) return d.straps;
      return L.sleeve;
    }
    case 'hivis': {
      const stripeH = y === 11 || y === 12;
      const stripeV = front && ax >= 2 && ax <= 3 && y > 12;
      const stripeB = !front && z < -1 && ax >= 2 && ax <= 3 && y > 12;
      if (stripeH || stripeV || stripeB) return y === 12 || stripeV || stripeB ? d.vest : shade(d.vest, 0.9);
      if (y >= 17 && ax <= 3) return d.shirt;
      return d.suit;
    }
    case 'flannel': {
      const xs = Math.floor((x + 40) / 2) % 2, ys = Math.floor((y + 40) / 2) % 2, zs = Math.floor((z + 40) / 2) % 2;
      const k = ax > 5.5 ? zs : xs;
      if (k && ys) return d.suitDark;
      if (k || ys) return shade(d.suit, 0.62);
      return d.suit;
    }
    case 'hawaiian': {
      const h = hash3(Math.floor((x + 40) / 3), Math.floor((y + 40) / 3), Math.floor((z + 40) / 3), 7);
      const lx = ((x + 40) % 3), ly = ((y + 40) % 3);
      if (h < 0.3) {
        // hibiscus: plus-shaped petals with a yellow heart
        if (lx === 1 && ly === 1) return 0xffe060;
        if (lx === 1 || ly === 1) return h < 0.15 ? 0xff6aa0 : 0xffffff;
      } else if (h < 0.42 && (lx + ly) % 2 === 0) return 0x2a8a4a;
      return d.suit;
    }
  }
  return d.suit;
}

// ------------------------------------------------------------------ parts
const TORSO = { cx: 0, cy: 13.6, cz: 0, rx: 7.1, ry: 5.2, rz: 5.1, p: 2.4 };
const BELLY = { cx: 0, cy: 12.3, cz: 2.3, rx: 6.2, ry: 4.4, rz: 5.3, p: 2.2 };

function inTorso(x, y, z, L) {
  const t = L ? L.T : TORSO;
  const rx = t.rx - Math.max(0, y + 0.5 - (t.taperY ?? 14.6)) * (t.taper ?? 0.42);
  if (se(x, y + 0.5, z, t.cx, t.cy, t.cz, rx, t.ry, t.rz, t.p) <= 1) return true;
  const h = L && L.hump;
  return !!h && se(x, y + 0.5, z, 0, h.cy, h.cz, h.rx, h.ry, h.rz, 2.2) <= 1;
}
function bellyD(x, y, z, L) {
  const b = L ? L.BL : BELLY;
  return se(x, y + 0.5, z, b.cx, b.cy, b.cz, b.rx, b.ry, b.rz, b.p);
}

// Torso + belly union, painted, then split so the belly can jiggle.
function buildBody(L) {
  const d = L.d;
  const v = new VoxelModel();
  for (let x = -14; x <= 14; x++)
    for (let y = 4; y <= 25; y++)
      for (let z = -12; z <= 14; z++)
        if (inTorso(x, y, z, L) || bellyD(x, y, z, L) <= 1) v.set(x, y, z, 1);
  const N = L.neckY, n = N - 17;
  v.paint((x, y, z) => outfitColor(L, x, y, z));
  const dec = new Map(); // "x,y,z" -> colour for protruding details
  const put = (x, y, z, c) => { v.set(x, y, z, c); dec.set(`${x},${y},${z}`, c); };
  const surf = (x, y, c, dz = 0) => { const z = frontZ(v, x, y); if (z != null) { if (dz) put(x, y, z + dz, c); else v.set(x, y, z, c); } return z; };
  const backZ = (x, y) => { for (let z = -12; z <= 12; z++) if (v.has(x, y, z)) return z; return null; };
  const surfBack = (x, y, c) => { const z = backZ(x, y); if (z != null) v.set(x, y, z, c); };

  switch (L.outfit) {
    case 'jacket':
    case 'tux': {
      // buttons below the V, a pocket square, collar points
      const btn = L.outfit === 'tux' ? 0x0c0c0e : shade(d.suitDark, 0.7);
      surf(0, 10, btn); surf(0, 8, btn);
      if (n > 0) surf(0, 12, btn);
      if (L.outfit === 'tux') {
        // shirt studs + gold watch chain across the belly
        surf(0, 13, 0x101010); surf(0, 15, 0x101010);
        for (const [x, y] of [[1, 10], [2, 10], [3, 11], [4, 11], [5, 12]]) surf(x, y, L.gold);
      }
      // breast pocket + pocket square
      for (let x = 3; x <= 5; x++) surf(x + (n > 1 ? 1 : 0), 14 + n, shade(d.suitDark, 0.85));
      const sq = d.pinstripe ? 0xd83040 : L.outfit === 'tux' ? 0xffffff : d.scarf ? 0xe0c040 : 0xffffff;
      const px = n > 1 ? 1 : 0;
      surf(4 + px, 15 + n, sq, 1); surf(3 + px, 15 + n, sq, 1); surf(4 + px, 16 + n, sq, 1);
      // shirt collar points under the chin
      for (const sx of [-1, 1]) { surf(sx * 1, 17 + n, 0xffffff, 1); surf(sx * 2, 17 + n, 0xffffff, 1); surf(sx * 2, 16 + n, 0xffffff); }
      if (d.armband) {
        // a lapel pin and a radio clip for the security detail
        surf(-4 - px, 15 + n, 0xd8dce4, 1); surf(-4 - px, 14 + n, 0x2a2a30, 1);
      }
      if (L.outfit === 'tux') {
        // coat tails are on the hips; darker hem at the back
        for (let x = -5; x <= 5; x++) surfBack(x, 9, d.suitDark);
      }
      break;
    }
    case 'shirt': {
      // shirt buttons, breast pocket with pens, collar
      for (let y = 9; y <= 15; y += 2) surf(0, y, 0xc8ccd8);
      for (let x = 2; x <= 5; x++) surf(x, 13, 0xd8dce4);
      surf(3, 14, 0x2a5ad0, 1); surf(4, 14, 0xd83a3a, 1); surf(3, 15, 0x2a5ad0, 1);
      for (const sx of [-1, 1]) { surf(sx * 1, 17, 0xffffff, 1); surf(sx * 2, 17, 0xffffff, 1); }
      break;
    }
    case 'tshirt': {
      // a big yellow star on the tummy
      const star = ['..Y..', '.YYY.', 'YYYYY', '.YYY.', '.Y.Y.'];
      star.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === 'Y') surf(i - 2, 14 - j, 0xffd84a); });
      for (let x = -2; x <= 2; x++) surf(x, 17, shade(d.suit, 0.85));
      break;
    }
    case 'coveralls': {
      // bib pocket with a pen, silver strap buttons, name patch
      for (let x = -2; x <= 2; x++) { surf(x, 12, shade(d.suit, 0.85)); }
      surf(-1, 13, 0xd0d0d0, 1); surf(-1, 14, 0xd0d0d0, 1); surf(-1, 15, 0x2a2a2a, 1);
      surf(-4, 15, 0xd8d8d8); surf(4, 15, 0xd8d8d8);
      surf(2, 14, 0xffffff); surf(3, 14, 0xffffff); surf(2, 13, 0xffffff); surf(3, 13, 0xd83a3a);
      break;
    }
    case 'hivis': {
      // zipper + a little radio clipped on the vest
      for (let y = 9; y <= 16; y++) surf(0, y, shade(d.suit, 0.8));
      surf(-4, 14, 0x2a2a2a, 1); surf(-4, 15, 0x2a2a2a, 1); surf(-4, 16, 0x3a3a3a, 1); surf(-4, 17, 0x2a2a2a, 1);
      surf(-4, 15, 0x6ac050);
      break;
    }
    case 'flannel': {
      // buttons + chest pocket flaps + cream undershirt at the neck
      for (let y = 9; y <= 15; y += 2) surf(0, y, 0xe8d8b0);
      for (const sx of [-1, 1]) for (let i = 2; i <= 4; i++) surf(sx * i, 15, d.suitDark);
      for (let x = -1; x <= 1; x++) { surf(x, 17, 0xe8e0d0); surf(x, 16, x === 0 ? 0xe8e0d0 : null ?? 0xe8e0d0); }
      break;
    }
    case 'threepiece': {
      // gold buttons down the waistcoat, gold watch chain, fob watch, pocket square
      for (let y = 8; y <= N - 4; y += 2) surf(0, y, L.gold, 1);
      const chain = d.watch ?? L.gold;
      for (const [x, y] of [[1, 11], [2, 10], [3, 10], [4, 10], [5, 11], [-1, 11], [-2, 10], [-3, 10]]) surf(x, y, chain, 1);
      const zw = frontZ(v, 5, 9);
      if (zw != null) { put(5, 9, zw + 1, chain); put(6, 9, zw + 1, 0xfff4c0); put(5, 8, zw + 1, chain); put(6, 8, zw + 1, chain); put(6, 10, zw, chain); }
      for (let x = 5; x <= 7; x++) surf(x, 15 + n, shade(d.suitDark, 0.8));
      surf(6, 16 + n, 0xd83040, 1); surf(5, 16 + n, 0xd83040, 1); surf(6, 17 + n, 0xe86070, 1);
      for (const sx of [-1, 1]) { surf(sx, N, 0xffffff, 1); surf(sx * 2, N, 0xffffff, 1); surf(sx * 2, N - 1, 0xffffff); }
      // lapel flower
      surf(-6, 15 + n, 0xf0f0f0, 1); surf(-6, 16 + n, 0xf0f0f0, 1); surf(-7, 16 + n, 0xfff0a0, 1);
      break;
    }
    case 'trench': {
      // two columns of buttons, belt buckle, epaulettes, popped collar
      for (const bx of [-3, 2]) for (let y = 13; y <= N - 7; y += 3) surf(bx, y, 0x2a2a30, 1);
      for (const x of [-1, 0, 1]) surf(x, 11, 0x9a9aa4, 1);
      surf(-1, 12, 0x9a9aa4, 1); surf(1, 12, 0x9a9aa4, 1); surf(0, 12, shade(d.suit, 0.6), 1);
      for (const sx of [-1, 1]) for (let x = 3; x <= 6; x++) {
        let top = null;
        for (let y = 26; y >= 10; y--) if (v.has(sx * x, y, 0)) { top = y; break; }
        if (top != null) { put(sx * x, top + 1, 0, shade(d.suit, 0.78)); put(sx * x, top + 1, 1, shade(d.suit, 0.78)); if (x === 4) put(sx * x, top + 2, 0, 0x2a2a30); }
      }
      for (let x = -6; x <= 6; x++)
        for (let z = -5; z <= 3; z++) {
          const q = (x / 6.4) ** 2 + ((z + 0.8) / 4.6) ** 2;
          if (q > 1 || q < 0.55) continue;
          if (z > 1 && Math.abs(x) <= 3) continue;
          for (let y = N; y <= N + 2 + (z < -2 ? 1 : 0); y++) put(x, y, z, y === N ? shade(d.suit, 0.85) : d.suit);
        }
      break;
    }
    case 'tracksuit': {
      // zip pull, little logo, white piping over the shoulders
      surf(0, N - 1, 0xe0e0e8, 1); surf(0, N - 2, 0xc0c0c8, 1);
      surf(3, 15, d.stripe); surf(4, 15, d.accent ?? d.stripe); surf(3, 14, d.accent ?? d.stripe);
      break;
    }
    case 'cardigan': {
      // buttons on the cardigan edge, blouse collar, pearls
      for (let y = 9; y <= 15; y += 2) surf(2, y, 0xf4ecd8, 1);
      for (const sx of [-1, 1]) { surf(sx, N, 0xffffff, 1); surf(sx * 2, N, 0xffffff, 1); }
      for (let x = -4; x <= 4; x++) {
        const y = N - 2 - Math.round((1 - (x / 4.6) ** 2) * 2.2);
        const z = frontZ(v, x, y);
        if (z != null) put(x, y, z + 1, x % 2 ? (d.pearls ?? 0xf8f4ec) : shade(d.pearls ?? 0xf8f4ec, 0.92));
      }
      // a brooch
      surf(-3, 14, 0xd84a6a, 1); surf(-3, 15, 0xe8c040);
      break;
    }
    case 'fur': {
      // glowing spirit markings: ovoid formlines on the chest, a chevron down the belly
      const mk = d.markings ?? 0x5ff8ff, mk2 = shade(mk, 0.8);
      for (const sx of [-1, 1])
        for (let x = 1; x <= 7; x++)
          for (let y = 12; y <= N; y++) {
            const q = ((x - 4) / 2.9) ** 2 + ((y - (N - 3.6)) / 2.1) ** 2;
            if (q > 1 || q < 0.45) continue;
            surf(sx * x, y, mk);
          }
      for (const sx of [-1, 1]) { surf(sx * 4, N - 4, mk2); surf(sx * 4, N - 3, mk); }
      for (let y = 7; y <= 11; y++) { const w = (11 - y) * 0.5; surf(-Math.round(w), y, mk2); surf(Math.round(w), y, mk2); }
      break;
    }
    case 'hawaiian': {
      // open collar showing chest fluff
      for (let y = 14; y <= 18; y++) {
        const w = Math.max(0, (y - 13) * 0.6);
        for (let x = -Math.floor(w); x <= Math.floor(w); x++) surf(x, y, L.furLight);
      }
      for (let y = 9; y <= 13; y += 2) surf(0, y, 0xf0f0f0);
      break;
    }
  }
  if (d.bowtie) {
    const bt = d.bowtie, btk = shade(bt, 0.75);
    const zs = frontZ(v, 0, N);
    if (zs != null) {
      const z = zs + 1;
      put(0, N, z, btk);
      for (const sx of [-1, 1]) { put(sx, N, z, bt); put(sx * 2, N, z, bt); put(sx * 2, N + 1, z - 1, bt); put(sx * 2, N - 1, z - 1, bt); put(sx * 3, N, z - 1, shade(bt, 0.88)); }
    }
  }
  if (d.scarf) {
    // thick scarf around the neck
    for (let x = -8; x <= 8; x++)
      for (let z = -8; z <= 9; z++)
        for (let y = N - 1; y <= N + 1; y++) {
          if (!v.has(x, y, z)) continue;
          const out = !v.has(x + 1, y, z) || !v.has(x - 1, y, z) || !v.has(x, y, z + 1) || !v.has(x, y, z - 1);
          if (out) v.set(x, y, z, (x + z + y) % 3 === 0 ? shade(d.scarf, 0.85) : d.scarf);
        }
    for (let x = -5; x <= 5; x++) { const z = frontZ(v, x, N); if (z != null) put(x, N, z + 1, x % 2 ? d.scarf : shade(d.scarf, 0.88)); }
  }

  // split: belly = front bulge (jiggles), torso = the rest
  const torso = new VoxelModel(), belly = new VoxelModel();
  for (const [k, c] of v.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    const isDec = dec.has(`${x},${y},${z}`);
    const inB = bellyD(x, y, z, L) <= 1 && z >= 1 && !(y >= N - 1 && !isDec && inTorso(x, y, z, L));
    const decB = isDec && bellyD(x, y, z - 1, L) <= 1.08 && y <= N - 2;
    (inB || decB ? belly : torso).set(x, y, z, c);
  }
  return { torso, belly };
}

function buildPelvis(L) {
  const d = L.d;
  const v = new VoxelModel();
  const pants = L.pants;
  const prx = 6.4 * Math.max(1, L.T.rx / 7.1), prz = 4.9 * Math.max(1, L.T.rz / 5.1);
  fillSE(v, 0, 8.6, -0.2, prx, 2.9, prz, 2.6, (x, y, z) => {
    let c = y <= 6 ? shade(pants, 0.92) : pants;
    if (L.outfit === 'threepiece' && d.pinstripe && (x + z + 60) % 4 === 0) c = d.pinstripe;
    if (L.outfit === 'tracksuit' && Math.abs(x) >= prx - 1.2) c = d.stripe;
    return c;
  });
  const belted = ['shirt', 'tshirt', 'hivis', 'flannel', 'hawaiian'].includes(L.outfit);
  if (L.outfit === 'trench' || L.outfit === 'cardigan') {
    // long coat skirt / A-line skirt, flaring out
    const coat = L.outfit === 'trench';
    const c0 = coat ? d.suit : L.pants;
    const yb = coat ? 2 : 4;
    for (let y = yb; y <= 10; y++) {
      const k = (10 - y) / (10 - yb);
      const rx = prx + 0.2 + k * (coat ? 1.6 : 1.2), rz = prz + 0.4 + k * (coat ? 1.4 : 1.0);
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++)
        for (let z = -Math.ceil(rz) - 1; z <= Math.ceil(rz); z++) {
          const q = (x / rx) ** 2 + ((z + 0.2) / rz) ** 2;
          if (q > 1) continue;
          if (coat && y <= 7 && x === 0 && z > 0) continue; // front slit
          if (coat && y <= 5 && x === 0 && z < 0) continue; // back vent
          let c = y === yb ? shade(c0, 0.8) : c0;
          if (coat && x === 2 && z > 0 && y > yb) c = shade(c0, 0.72);
          if (!coat && y === yb + 1) c = shade(c0, 1.25); // a lighter trim band
          v.set(x, y, z, c);
        }
    }
  }
  if (belted) {
    // belt with a buckle
    const belt = d.flannel ? 0x4a2a14 : d.vest ? 0x5a3a1a : 0x2a1e1a;
    v.paint((x, y, z, c) => (y === 10 ? belt : c));
    const z = frontZ(v, 0, 10);
    if (z != null) { v.set(0, 10, z + 1, d.flannel ? 0xd8b040 : 0xc8c8c8); v.set(-1, 10, z + 1, d.flannel ? 0xd8b040 : 0xa8a8a8); v.set(1, 10, z + 1, d.flannel ? 0xd8b040 : 0xa8a8a8); }
    if (d.vest) {
      // tool belt: a hammer and a tape measure
      for (let y = 5; y <= 10; y++) v.set(6, y, 1, 0x8a5a2a);
      v.set(6, 10, 2, 0x5a5a60); v.set(6, 10, 0, 0x5a5a60); v.set(6, 10, 3, 0x5a5a60);
      v.box(-7, 8, -1, -6, 9, 1, 0xf2c230); v.set(-7, 9, 0, 0x2a2a2a);
    }
  }
  if (L.outfit === 'tux') {
    // coat tails hanging down the back
    for (const sx of [-1, 1])
      for (let y = 3; y <= 9; y++)
        for (let i = 1; i <= 4; i++) {
          if (y <= 4 && i >= 3) continue;
          v.set(sx * i, y, -5 - (y < 6 ? 1 : 0), y === 3 ? 0x0a0a0c : d.suit);
        }
  }
  if (L.outfit === 'coveralls') {
    // back pocket rag
    v.set(3, 8, -6, 0xd84a4a); v.set(3, 7, -6, 0xd84a4a); v.set(4, 7, -6, 0xe86a6a);
  }
  return v;
}

function buildLeg(L, side) {
  const d = L.d;
  const v = new VoxelModel();
  const cx = side * 3;
  const pants = L.pants;
  const fur = L.fur;
  const lrx = L.leg.rx, lrz = L.leg.rz;
  fillSE(v, cx, 5.2, 0, lrx, 4.2, lrz, 3, (x, y, z) => {
    if (L.shorts && y <= 4) return fur;
    if (y === 2) return shade(pants, 0.85);
    if (L.outfit === 'threepiece' && d.pinstripe && (x + z + 60) % 4 === 0) return d.pinstripe;
    if (L.outfit === 'tracksuit' && side * (x - cx) >= lrx - 0.9 && (z === 0 || z === -1)) return d.stripe;
    return pants;
  }, (x, y) => y >= 2);
  // foot / shoe with a rounded toe
  const shoe = L.barefoot || L.sandals ? fur : L.shoe;
  const fw = lrx > 2.6 ? 3 : 2, ft = lrz > 2.6 ? 5 : 4;
  for (let x = cx - fw; x <= cx + fw; x++)
    for (let y = 0; y <= 2; y++)
      for (let z = -2; z <= ft; z++) {
        const edgeX = x === cx - fw || x === cx + fw;
        if (z === ft && (edgeX || y === 2)) continue;
        if (z === -2 && edgeX && y === 2) continue;
        if (y === 2 && z >= ft - 1) continue;
        let c = shoe;
        if (y === 0) c = L.barefoot || L.sandals ? (L.sandals ? 0x8a5a2a : L.pad) : d.sneakers ? (z % 2 ? 0xf0f0f0 : d.accent ?? 0xd0d0d0) : 0x2a2224;
        if (L.boots && y === 2) c = shade(L.shoe, 0.8);
        v.set(x, y, z, c);
      }
  if (d.sneakers) {
    // laces + a swoosh-ish accent
    v.set(cx, 2, 1, 0xffffff); v.set(cx, 2, 2, d.accent ?? 0xd0d0d0);
    v.set(cx + side * fw, 1, 1, d.accent ?? 0x3a8ad0); v.set(cx + side * fw, 1, 2, d.accent ?? 0x3a8ad0);
  } else if (!L.barefoot && !L.sandals && !L.boots) {
    v.set(cx - 1, 1, ft, 0x70707a); v.set(cx, 1, ft, 0x55555e); // shoe shine
  }
  if (L.barefoot && L.boss) for (let x = cx - fw + 1; x <= cx + fw - 1; x += 2) v.set(x, 0, ft + 1, 0xe8e4dc); // claws
  if (L.boots) { v.set(cx - 1, 1, 4, 0x8a5a30); v.set(cx, 1, 4, 0x8a5a30); v.set(cx + 1, 1, 4, 0x8a5a30); v.set(cx, 2, 2, 0xe8c070); v.set(cx, 2, 1, 0xe8c070); }
  if (L.sandals) { v.set(cx - 1, 1, 2, 0x8a5a2a); v.set(cx, 1, 3, 0x8a5a2a); v.set(cx + 1, 1, 2, 0x8a5a2a); v.set(cx, 1, 2, 0x8a5a2a); }
  if (L.barefoot) {
    // toe beans on the sole-front
    v.set(cx - 1, 0, 3, 0xf2a0ac); v.set(cx + 1, 0, 3, 0xf2a0ac); v.set(cx, 0, 4 - 1, 0xf2a0ac);
    v.set(cx - 1, 1, 4, 0xe8b0a0); v.set(cx + 1, 1, 4, 0xe8b0a0);
  }
  if (d.monocle) for (let y = 3; y <= 8; y++) { const z = 0; v.set(cx + side * 2, y, z, 0x34343c); } // satin stripe
  return v;
}

function buildArm(L, side) {
  const d = L.d;
  const v = new VoxelModel();
  const cx = side * 8.3, cz = 0.8;
  const fur = L.fur;
  const A = L.arm;
  const pt = Math.round(A.cy - A.ry + 2.7), pd = pt - 10; // paw top (classic: 10)
  const sleeveEnd = (L.shortSleeve ? 13 : L.rolled ? 11 : 10) + pd;
  const mk = d.markings;
  fillSE(v, cx, A.cy, cz, A.rx, A.ry, A.rz, 2.4, (x, y, z) => {
    if (y < pt) return fur; // paw
    if (y < sleeveEnd) return fur; // forearm fur (short / rolled sleeves)
    if (L.outfit === 'fur') return mk && (y === pt + 1 || y === pt + 3 || (y === pt + 6 && side * (x - cx) > 0)) ? (y === pt + 3 ? shade(mk, 0.8) : mk) : fur;
    if (L.cuff && y === pt) return 0xffffff;
    if (L.rolled && y === pt + 1) return d.flannel ? d.suitDark : shade(L.sleeve, 0.85);
    if ((L.outfit === 'tracksuit' || L.outfit === 'cardigan') && y === pt) return shade(d.suit, 0.8);
    if (L.outfit === 'trench' && y === pt + 1) return shade(d.suit, 0.66);
    let c = L.sleeve;
    if (L.outfit === 'tracksuit' && side * (x - cx) >= A.rx - 0.7) c = d.stripe;
    if (L.outfit === 'cardigan' && (y + 40) % 2 === 0) c = shade(d.suit, 0.92);
    if (d.flannel) {
      const zs = Math.floor((z + 40) / 2) % 2, ys = Math.floor((y + 40) / 2) % 2;
      c = zs && ys ? d.suitDark : zs || ys ? shade(d.suit, 0.62) : d.suit;
    }
    if (d.hawaiian) c = outfitColor(L, x, y, z);
    if (d.pinstripe && (L.outfit === 'threepiece' ? (x + z + 60) % 4 === 0 : (z + 30) % 3 === 0)) c = d.pinstripe;
    if (L.shortSleeve && y === sleeveEnd) c = shade(c, 0.88);
    return c;
  });
  // paw pad on the palm (inner-front) + little claws
  const ix = side > 0 ? Math.floor(cx - 1) : Math.ceil(cx + 1);
  const pz = Math.round(cz + A.rz - 0.25);
  v.set(ix, pt - 2, pz - 1, L.pad); v.set(ix, pt - 1, pz - 1, L.pad); v.set(Math.round(cx), pt - 2, pz, L.pad);
  if (L.cuff) {
    // cufflink on the outside of the cuff
    const ox = side > 0 ? Math.ceil(cx + A.rx - 0.2) : Math.floor(cx - A.rx + 0.2);
    v.set(ox, pt, 1, L.gold);
  }
  if (L.outfit === 'trench') v.set(side > 0 ? Math.ceil(cx + A.rx - 0.2) : Math.floor(cx - A.rx + 0.2), pt + 1, 1, 0x9a9aa4);
  if (L.cub) { v.set(Math.round(cx), 7, 1, L.furLight); }
  if (L.boss) {
    // big claws peeking out of the paw
    const yb = Math.round(A.cy - A.ry) + 1;
    for (const dx of [-1, 0, 1]) v.set(Math.round(cx) + dx, yb, pz + 1, 0xece6da);
  }
  if (d.armband && side < 0) {
    // square security armband (text decal goes on it, see faceGeometry)
    const x0 = Math.round(cx - A.rx), x1 = Math.round(cx + A.rx), z0 = Math.round(cz - A.rz), z1 = Math.round(cz + A.rz);
    const y0 = pt + 4, y1 = pt + 6;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) v.set(x, y, z, y === y0 || y === y1 ? shade(d.armband, 0.85) : d.armband);
    L.band = { x0: x0 - 0.5, x1: x1 + 0.5, z0: z0 - 0.5, z1: z1 + 0.5, y0, y1: y1 + 1 };
  }
  return v;
}

function buildHead(L) {
  const d = L.d;
  const v = new VoxelModel();
  const fur = L.fur, light = L.furLight;
  fillSE(v, 0, 23.5, 0.3, 8.4, 6.5, 6.8, 2.5, fur);
  // flat face plate for the eye decal (rounded squircle patch)
  for (let x = -6; x <= 6; x++)
    for (let y = 22; y <= 28; y++) {
      const q = Math.pow((Math.abs(x) + 0.5) / 6.9, 4) + Math.pow(Math.abs(y + 0.5 - 25.3) / 4.0, 4);
      if (q > 1) continue;
      for (let z = 0; z <= 7; z++) v.set(x, y, z, fur);
    }
  // fuzzy cheeks
  for (const sx of [-1, 1]) {
    v.set(sx * 8, 19, 3, L.furTuft); v.set(sx * 9, 20, 2, L.furTuft); v.set(sx * 9, 21, 1, fur); v.set(sx * 8, 18, 2, L.furTuft);
  }
  // light upper muzzle
  fillSE(v, 0, 21.5, 7.4, 3.9, 1.9, 2.3, 2.6, light, (x, y, z) => y >= 20 && z >= 5);
  for (let x = -3; x <= 3; x++) for (let y = 20; y <= 22; y++) {
    if (Math.abs(x) === 3 && y !== 21) continue;
    v.set(x, y, 9, light); v.set(x, y, 8, light);
  }
  for (let x = -2; x <= 2; x++) v.set(x, 23, 8, light); // bridge blends into the face
  // nose: little inverted triangle with a shine
  for (let x = -1; x <= 1; x++) v.set(x, 22, 10, L.nose);
  v.set(0, 21, 10, L.nose);
  v.set(-1, 22, 10, mix(L.nose, 0xffffff, 0.3));
  // mouth roof (dark, only seen when the jaw drops) + little fangs
  for (let x = -2; x <= 2; x++) for (let z = 4; z <= 8; z++) v.set(x, 20, z, 0x5a1422);
  // jaw cavity: carve out where the jaw sits, dark back wall
  for (let x = -2; x <= 2; x++)
    for (let y = 17; y <= 19; y++) {
      for (let z = 5; z <= 11; z++) v.set(x, y, z, null);
      if (y >= 18) v.set(x, y, 4, 0x4a1018);
    }
  // eyewear / smoking / stationery voxels
  const temple = d.glasses || d.shades;
  if (temple) {
    for (const sx of [-1, 1]) { for (let z = -1; z <= 5; z++) v.set(sx * 9, 25, z, temple); v.set(sx * 8, 25, 6, temple); v.set(sx * 7, 25, 7, temple); }
  }
  if (d.monocle) {
    for (const [x, y, z] of [[5, 23, 8], [6, 22, 8], [6, 21, 8], [7, 20, 7], [7, 19, 6], [8, 18, 5]]) v.set(x, y, z, d.monocle);
  }
  if (d.cigar) {
    for (let z = 9; z <= 12; z++) v.set(3, 20, z, z === 12 ? 0x9a9a9a : 0x7a4a22);
    v.set(3, 20, 13, 0xff6a20); v.set(3, 20, 10, 0xc8a040);
  }
  if (d.scarf) {
    // pencil tucked behind the ear
    for (let z = -2; z <= 4; z++) v.set(9, 26, z, z === 4 ? 0x2a2a2a : z === 3 ? 0xe8c890 : z === -2 ? 0xf08a9a : 0xf2c230);
  }
  if (d.halfmoon) {
    for (const sx of [-1, 1]) { v.set(sx * 8, 24, 5, d.halfmoon); v.set(sx * 8, 24, 6, d.halfmoon); v.set(sx * 7, 24, 7, d.halfmoon); }
    // little chain hanging from one temple
    for (const [x, y, z] of [[8, 23, 4], [9, 22, 4], [9, 21, 3], [9, 20, 3]]) v.set(x, y, z, shade(d.halfmoon, 0.8));
  }
  if (L.boss && d.cigar) {
    // heavy jowls
    for (const sx of [-1, 1]) fillSE(v, sx * 6.6, 20.2, 3.6, 2.6, 2.3, 2.6, 2.2, (x, y) => (y <= 19 ? L.furTuft : fur));
    // a thicker cigar
    for (let z = 9; z <= 13; z++) { v.set(4, 20, z, z === 13 ? 0x9a9a9a : 0x7a4a22); v.set(4, 21, z, z === 13 ? 0xb0b0b0 : 0x6a3e1c); }
    v.set(4, 20, 14, 0xff6a20); v.set(4, 21, 14, 0xff6a20); v.set(4, 20, 11, 0xc8a040); v.set(4, 21, 11, 0xc8a040);
  }
  if (d.beard) {
    // hipster beard on the cheeks and under the muzzle
    for (const [k, c] of [...v.vox]) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      if (c === fur && y <= 21 && z >= 1 && Math.abs(x) >= 3) v.vox.set(k, (x + y + z) % 3 ? d.beard : shade(d.beard, 1.2));
    }
    for (const sx of [-1, 1]) { v.set(sx * 4, 18, 8, d.beard); v.set(sx * 3, 17, 8, d.beard); v.set(sx * 4, 17, 7, d.beard); v.set(sx * 3, 18, 9, d.beard); }
    for (let x = -2; x <= 2; x++) v.set(x, 21, 10, shade(d.beard, 1.15)); // moustache
    v.set(-3, 21, 9, d.beard); v.set(3, 21, 9, d.beard); v.set(-3, 20, 9, d.beard); v.set(3, 20, 9, d.beard);
  }
  if (d.buzzcut) {
    // flat-top
    for (const [k, c] of [...v.vox]) {
      const y = ((k >> 10) & 1023) - 512;
      if (y >= 29) v.vox.delete(k);
      else if (y === 28 && c === fur) v.vox.set(k, L.furDark);
    }
  }
  if (d.earpiece) {
    // coiled security earpiece wire down to the collar
    for (const [x, y, z] of [[9, 25, 1], [9, 24, 0], [10, 23, 0], [9, 22, -1], [10, 21, -1], [9, 20, -2], [10, 19, -2], [9, 18, -2], [8, 17, -2]]) v.set(x, y, z, d.earpiece);
    v.set(9, 26, 1, 0x2a2a30); v.set(8, 26, 2, 0x2a2a30);
  }
  if (!d.hat && !d.buzzcut) {
    // cowlick
    v.set(0, 30, 1, L.furTuft); v.set(1, 31, 1, L.furTuft); v.set(-1, 30, 2, fur); v.set(1, 30, 0, fur);
    if (d.markings) { v.set(0, 29, 6, d.markings); v.set(0, 30, 5, d.markings); v.set(-1, 29, 6, shade(d.markings, 0.8)); v.set(1, 29, 6, shade(d.markings, 0.8)); }
  }
  return v;
}

function buildJaw(L) {
  const v = new VoxelModel();
  const light = L.furLight;
  for (let x = -2; x <= 2; x++)
    for (let y = 18; y <= 19; y++)
      for (let z = 5; z <= 9; z++) {
        const ax = Math.abs(x);
        if (ax === 2 && z === 9 && y === 18) continue;
        let c = light;
        if (y === 19 && ax <= 1 && z <= 8) c = z >= 6 ? 0xf25f7e : 0x5a1422; // tongue + back of the mouth
        v.set(x, y, z, c);
      }
  // chin fluff
  v.set(0, 17, 8, light); v.set(-1, 17, 7, light); v.set(1, 17, 7, light);
  const d = L.d;
  if (d.beard) {
    for (let x = -3; x <= 3; x++) for (let y = 15; y <= 17; y++) for (let z = 5; z <= 9; z++) {
      if (Math.abs(x) === 3 && y === 15) continue;
      if (y === 15 && z >= 9) continue;
      v.set(x, y, z, (x + y + z) % 3 ? d.beard : shade(d.beard, 1.2));
    }
  }
  if (L.boss) {
    // lower fangs
    v.set(-2, 20, 8, 0xfffaf0); v.set(2, 20, 8, 0xfffaf0);
  }
  return v;
}

function buildEar(L, side) {
  const v = new VoxelModel();
  const cx = side * 6.9, cy = 29.4, cz = -0.7;
  const tilt = side * 0.32;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  for (let x = Math.floor(cx - 4); x <= Math.ceil(cx + 4); x++)
    for (let y = Math.floor(cy - 4); y <= Math.ceil(cy + 4); y++)
      for (let z = -3; z <= 2; z++) {
        const dx = x - cx, dy = y + 0.5 - cy;
        const lx = dx * c - dy * s, ly = dx * s + dy * c; // rotate into ear space (tilted outward)
        const dd = Math.pow(Math.abs(lx) / 2.75, 2.2) + Math.pow(Math.abs(ly) / 2.65, 2.2) + Math.pow(Math.abs(z - cz) / 1.55, 2.2);
        if (dd > 1) continue;
        const inner = z >= cz + 0.6 && Math.abs(lx) <= 1.4 && ly <= 1.2 && ly >= -1.9;
        v.set(x, y, z, inner ? L.d.markings ?? L.innerEar : L.fur);
      }
  if (L.d.scar && side < 0) { v.set(Math.round(cx - 1), 32, 0, null); v.set(Math.round(cx - 1), 32, -1, null); v.set(Math.round(cx - 1), 31, 0, null); } // torn ear
  // fuzzy tuft on the rim
  v.set(Math.round(cx - side * 0.2), 32, 0, L.furTuft);
  v.set(Math.round(cx - side * 1.3), 32, -1, L.furTuft);
  v.set(Math.round(cx + side * 1.0), 32, -1, L.fur);
  return v;
}

function buildTail(L) {
  const v = new VoxelModel();
  fillSE(v, 0, 10.4, -5.9, 2.1, 2.0, 1.7, 2.2, (x, y, z) => (z <= -7 || y >= 11 ? L.furTuft : L.fur));
  v.set(0, 12, -6, L.furTuft); v.set(1, 11, -7, L.furTuft);
  return v;
}

function buildHat(L) {
  const d = L.d;
  const v = new VoxelModel();
  const hc = d.hatColor ?? 0x2a2a2e;
  let top = 32.2;
  const disk = (y, rx, rz, c, cx = 0, cz = 0.3) => {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
      for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++) {
        const q = ((x - cx) / (rx + 0.35)) ** 2 + ((z - cz) / (rz + 0.35)) ** 2;
        if (q > 1) continue;
        v.set(x, y, z, typeof c === 'function' ? c(x, z, q) : c);
      }
  };
  switch (d.hat) {
    case 'fedora':
      disk(30, 5.6, 5.4, (x, z, q) => (q > 0.72 ? shade(hc, 1.18) : hc));
      for (const sx of [-1, 1]) for (let z = -3; z <= 3; z++) v.set(sx * 6, 31, z, hc); // curled brim sides
      for (let y = 31; y <= 33; y++) disk(y, 3.6, 3.4, y === 31 ? 0x101012 : hc);
      for (let z = -2; z <= 2; z++) v.set(0, 33, z, null); // crease
      v.set(-1, 33, 3, null); v.set(1, 33, 3, null);
      if (d.cigar) { v.set(3, 32, 3, 0xd83040); v.set(4, 32, 2, 0xd83040); v.set(4, 33, 2, 0xe86050); v.set(5, 34, 2, 0xe86050); } // feather
      top = 34;
      break;
    case 'tophat':
      disk(30, 5.4, 4.9, (x, z, q) => (q > 0.7 ? shade(hc, 1.25) : hc));
      for (const sx of [-1, 1]) for (let z = -2; z <= 2; z++) v.set(sx * 6, 31, z, hc);
      for (let y = 31; y <= 38; y++) disk(y, 3.5, 3.3, y <= 32 ? (d.hatBand ?? 0xa01e2a) : y === 38 ? shade(hc, 1.3) : hc);
      if (d.hatBand) { v.set(3, 32, 3, 0xfff0a0); v.set(4, 32, 2, d.hatBand); v.set(4, 31, 2, shade(d.hatBand, 0.8)); } // gold buckle
      top = 39;
      break;
    case 'headband': {
      // sweatband just above the brows (ring hugging the head)
      for (let y = 28; y <= 29; y++)
        for (let x = -10; x <= 10; x++)
          for (let z = -9; z <= 10; z++) {
            const q = se(x, y + 0.5, z, 0, 23.5, 0.3, 8.4, 6.5, 6.8, 2.5);
            const plate = Math.abs(x) <= 6 && z >= 0 && z <= 8 && y <= 28;
            if (q <= 1 && !plate) continue;
            if (plate && z !== 8) continue;
            if (!plate && q > 1.22) continue;
            v.set(x, y, z, y === 29 && Math.abs(x) <= 2 && z > 4 ? 0xffffff : hc);
          }
      top = 32.4;
      break;
    }
    case 'beanie':
      // slouchy beanie, ribbed cuff, slumped back
      fillSE(v, 0, 28.6, -0.2, 8.8, 4.8, 7.4, 2.4, (x, y) => (y <= 28 ? ((x + 40) % 2 ? shade(hc, 0.82) : shade(hc, 0.9)) : (x + y) % 2 ? hc : shade(hc, 0.95)), (x, y) => y >= 27);
      fillSE(v, 0, 32.4, -3.6, 5.6, 3.0, 4.4, 2.2, (x, y) => ((x + y) % 2 ? hc : shade(hc, 0.95)));
      v.set(5, 28, 7, 0x2a2a2a); v.set(6, 28, 6, 0x2a2a2a); v.set(5, 27, 7, 0xf0f0f0); // tiny label
      top = 35;
      break;
    case 'bun': {
      // curly grey hair-do with a bun on top
      fillSE(v, 0, 28.2, 0.0, 8.0, 4.0, 6.9, 2.3, (x, y, z) => ((x + z + 40) % 4 === 0 && y >= 30 ? shade(hc, 0.86) : hc), (x, y, z) => y >= 28 && !(z >= 5 && y <= 29 && Math.abs(x) <= 5));
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2;
        v.set(Math.round(Math.cos(a) * 7.6), 28 + (i % 2), Math.round(Math.sin(a) * 6.4), shade(hc, i % 2 ? 1.05 : 0.9));
      }
      fillSE(v, 0, 33.6, -0.6, 2.8, 2.4, 2.8, 2.1, (x, y, z) => (hash3(x, y, z, 5) < 0.4 ? shade(hc, 0.86) : hc));
      v.set(2, 34, 2, 0xe86a8a); v.set(3, 34, 1, 0xe86a8a); v.set(2, 35, 1, 0xf08aa8); // flower pin
      top = 36;
      break;
    }
    case 'hardhat':
      fillSE(v, 0, 29.4, 0.5, 7.4, 4.3, 7.1, 2.2, (x, y, z) => ((x === 0 && y >= 32) ? shade(hc, 0.86) : hc), (x, y) => y >= 29);
      for (let x = -6; x <= 6; x++) for (let z = 6; z <= 9; z++) { if (Math.abs(x) >= 5 && z >= 8) continue; v.set(x, 29, z, shade(hc, 0.92)); }
      v.set(-1, 31, 7, 0x3a6ad0); v.set(0, 31, 7, 0x3a6ad0); v.set(1, 31, 7, 0xf0f0f0); v.set(0, 32, 7, 0xf0f0f0);
      top = 34;
      break;
    case 'cap':
      fillSE(v, 0, 29.2, 0.2, 7.2, 3.0, 6.9, 2.3, (x, y) => (y === 29 ? shade(hc, 0.85) : hc), (x, y) => y >= 29);
      for (let x = -4; x <= 4; x++) for (let z = 6; z <= 10; z++) { if (Math.abs(x) === 4 && z >= 9) continue; v.set(x, 29, z, shade(hc, 0.78)); }
      v.set(0, 32, 0, shade(hc, 0.7));
      v.set(-1, 30, 7, 0xf0f0f0); v.set(0, 30, 7, 0x3a6ad0); v.set(1, 30, 7, 0xf0f0f0);
      top = 33;
      break;
    case 'toque':
      fillSE(v, 0, 28.2, 0.3, 8.9, 4.9, 7.5, 2.4, (x, y) => {
        if (y <= 28) return y === 27 ? 0xe8e8ee : 0xffffff; // folded cuff band
        if (y === 30 || y === 31) return 0xffffff; // stripe
        return hc;
      }, (x, y) => y >= 27);
      fillSE(v, 0, 34.4, 0.3, 2.2, 2.0, 2.2, 2, (x, y, z) => ((x + y + z) % 2 ? 0xffffff : 0xe8e8f0));
      top = 36.5;
      break;
    case 'beret':
      for (let y = 30; y <= 31; y++) disk(y, y === 30 ? 5.4 : 4.6, y === 30 ? 5.0 : 4.2, hc, -1.2, 0.3);
      v.set(0, 32, 0, hc); v.set(0, 33, 0, shade(hc, 0.8));
      top = 33.5;
      break;
    case 'propeller':
      fillSE(v, 0, 29.4, 0.3, 5.6, 2.8, 5.4, 2.2, (x, y, z) => (x >= 0 ? (z >= 0 ? 0xe8403a : 0xf2c230) : z >= 0 ? 0x3a8ae8 : 0x3ac860), (x, y) => y >= 29);
      v.set(0, 32, 0, 0x9a9a9a); v.set(0, 33, 0, 0x9a9a9a);
      top = 35;
      break;
    default:
      top = 32.4;
  }
  return { hat: v, top };
}

function buildProp() {
  const v = new VoxelModel();
  for (let x = -4; x <= 4; x++) if (x !== 0) v.set(x, 34, 0, x > 0 ? 0xe8403a : 0xf2c230);
  v.set(0, 34, 0, 0xf2f2f2);
  v.set(3, 34, 1, 0xe8403a); v.set(-3, 34, -1, 0xf2c230);
  return v;
}

// tie / lanyard / scarf end: the dangly bit on the chest (tie bone)
function buildTie(L, body) {
  const d = L.d;
  const v = new VoxelModel();
  const surfZ = (x, y) => {
    let z = frontZ(body.belly, x, y);
    const z2 = frontZ(body.torso, x, y);
    if (z == null || (z2 != null && z2 > z)) z = z2;
    return z;
  };
  const n = L.neckY - 17;
  if (d.tie && d.aurora) {
    // long flowing tie in northern-lights colours
    const A = L.aurora;
    for (let y = n + 4; y <= 17 + n; y++) {
      const z0 = surfZ(0, Math.max(y, n + 7));
      if (z0 == null) continue;
      const z = z0 + 1 + (y < n + 7 ? 1 : 0);
      const w = y >= 16 + n ? 1 : y <= n + 5 ? 0 : y <= n + 7 ? 1 : 1;
      const ci = Math.min(A.length - 1, Math.floor((17 + n - y) / 2.3));
      for (let x = -w; x <= w; x++) v.set(x, y, z, y >= 16 + n ? A[0] : (x + y) % 4 === 0 ? A[Math.min(A.length - 1, ci + 1)] : A[ci]);
      if (y === n + 4) { v.set(-1, y, z, null); v.set(1, y, z, null); }
    }
  } else if (d.tie) {
    const tc = d.tie, td = shade(d.tie, 0.78);
    const yLo = L.outfit === 'threepiece' ? 13 + n : L.outfit === 'trench' ? 14 + n : 9 + n;
    for (let y = yLo; y <= 17 + n; y++) {
      const z0 = surfZ(0, y);
      if (z0 == null) continue;
      const z = z0 + 1;
      const w = y >= 16 + n ? 1 : y <= 9 + n ? 0 : 1;
      for (let x = -w; x <= w; x++) {
        let c = ((y + x) % 3 === 0) ? td : tc;
        if (y >= 16 + n) c = y === 17 + n ? td : tc; // knot
        v.set(x, y, z, c);
      }
      if (y === 10 + n) { v.set(-1, y, z, null); v.set(1, y, z, null); v.set(0, y, z, tc); }
    }
    // tie clip
    const zc = surfZ(0, 13 + n);
    if (zc != null && yLo <= 13 + n) for (let x = -1; x <= 1; x++) v.set(x, 13 + n, zc + 1, x === 1 ? 0xf0f0f0 : L.gold);
    if (L.outfit === 'threepiece') { const zp = surfZ(0, 15 + n); if (zp != null) v.set(0, 15 + n, zp + 1, 0xfff0a0); } // diamond tie pin
  }
  if (d.lanyard) {
    for (let y = 13 + n; y <= 17 + n; y++) {
      for (const sx of [-1, 1]) {
        const x = sx * (y >= 16 ? 3 : 2);
        const z = surfZ(x, y);
        if (z != null) v.set(x, y, z + 1, d.lanyard);
      }
    }
    const zb = surfZ(-2, 11);
    if (zb != null) {
      const z = zb + 1;
      for (let x = -3; x <= -1; x++) for (let y = 10; y <= 12; y++) v.set(x, y, z, 0xffffff);
      v.set(-3, 12, z, 0x8a5a30); v.set(-3, 11, z, 0x8a5a30); v.set(-1, 11, z, 0x3a6ad0); v.set(-1, 10, z, 0x3a6ad0); v.set(-2, 12, z, d.lanyard);
    }
  }
  if (d.scarf) {
    // hanging scarf end with fringe, off to one side
    for (let y = 9; y <= 17; y++) {
      const x0 = -3;
      const z = surfZ(x0, y);
      if (z == null) continue;
      for (let x = x0 - 1; x <= x0 + 1; x++) v.set(x, y, z + 1, y <= 10 ? ((x & 1) ? d.scarf : null) : (y % 3 === 0 ? shade(d.scarf, 0.85) : d.scarf));
    }
  }
  return v;
}

// held items, modelled around the right paw; returns { v, mode, lid? }
function buildItem(L, item) {
  const v = new VoxelModel();
  const lid = new VoxelModel();
  const x0 = 8; // paw column
  let mode = 'rigid';
  switch (item) {
    case 'briefcase': {
      mode = 'hang';
      const lea = 0x6a3a1a, dk = 0x4a2610, tr = 0x7e4a24;
      // handle in the fist
      for (let z = -1; z <= 3; z++) v.set(x0, 8, z, 0x2a1a10);
      v.set(x0, 7, -1, 0x2a1a10); v.set(x0, 7, 3, 0x2a1a10);
      for (let y = 1; y <= 6; y++)
        for (let z = -4; z <= 6; z++) {
          const edge = y === 1 || y === 6 || z === -4 || z === 6;
          v.set(x0 - 1, y, z, edge ? dk : lea); // back shell
          v.set(x0, y, z, edge ? dk : (y >= 2 && y <= 5 && z >= -3 && z <= 5 ? 0xe8b830 : lea)); // coins inside!
          lid.set(x0 + 1, y, z, edge ? dk : lea);
        }
      for (const z of [0, 2]) { lid.set(x0 + 1, 6, z, 0xe8c040); lid.set(x0 + 2, 6, z, 0xe8c040); }
      lid.set(x0 + 2, 3, -4, dk); lid.set(x0 + 2, 3, 6, dk);
      break;
    }
    case 'coffee': {
      mode = 'level';
      for (let y = 6; y <= 11; y++)
        for (let x = x0 - 1; x <= x0 + 1; x++)
          for (let z = 3; z <= 5; z++) {
            if (Math.abs(x - x0) === 1 && (z === 3 || z === 5)) continue;
            v.set(x, y, z, y === 11 ? 0x5a2a0a : y === 10 ? 0xf2f2ec : y >= 7 && y <= 8 ? 0xb07a48 : 0xffffff);
          }
      v.set(x0, 12, 4, 0xf2f2ec); v.set(x0, 12, 5, 0x3a1a08);
      break;
    }
    case 'mop': {
      mode = 'level';
      for (let y = 3; y <= 21; y++) v.set(x0 + 1, y, 2, y % 5 === 0 ? 0x8a6038 : 0xb0845a);
      v.box(x0, 2, 1, x0 + 2, 3, 3, 0xb8b8c0);
      for (let x = x0 - 2; x <= x0 + 4; x++)
        for (let z = -1; z <= 5; z++)
          for (let y = 0; y <= 1; y++) {
            if ((x - x0 - 1) ** 2 + (z - 2) ** 2 > 11) continue;
            if (y === 1 && (x - x0 - 1) ** 2 + (z - 2) ** 2 > 5) continue;
            v.set(x, y, z, (x + z + y) % 3 === 0 ? 0xc8c8b8 : 0xe0e0d4);
          }
      break;
    }
    case 'lunchbox': {
      mode = 'hang';
      for (let z = 0; z <= 2; z++) v.set(x0, 8, z, 0x3a3a3a);
      v.set(x0, 7, 0, 0x3a3a3a); v.set(x0, 7, 2, 0x3a3a3a);
      v.box(x0 - 1, 2, -2, x0 + 1, 6, 4, (x, y, z) => (y === 6 ? 0xa82020 : y === 4 && x === x0 + 1 ? 0xf0f0f0 : 0xd83a2a));
      v.set(x0 + 2, 5, 1, 0x2a2a2a);
      break;
    }
    case 'thermos': {
      mode = 'level';
      for (let y = 4; y <= 12; y++)
        for (let x = x0 - 1; x <= x0 + 1; x++)
          for (let z = 2; z <= 4; z++) {
            if (Math.abs(x - x0) === 1 && (z === 2 || z === 4)) continue;
            v.set(x, y, z, y >= 11 ? 0xb8b8c0 : y === 5 ? 0x1f5030 : 0x2a6a3a);
          }
      v.set(x0, 13, 3, 0x9a9aa4);
      break;
    }
    case 'calculator': {
      v.box(x0 - 1, 7, 2, x0 + 1, 8, 7, 0x505860);
      for (let z = 5; z <= 6; z++) v.set(x0, 9, z, 0x9ad09a);
      for (const [x, z] of [[x0 - 1, 3], [x0 + 1, 3], [x0, 3], [x0 - 1, 4], [x0 + 1, 4]]) v.set(x, 9, z, (x + z) % 2 ? 0xe8e8e8 : 0xf08a3a);
      break;
    }
    case 'notepad': {
      v.box(x0 - 1, 7, 2, x0 + 1, 7, 7, 0xffffff);
      for (let z = 3; z <= 6; z += 1) v.set(x0, 8, z, z % 2 ? 0x9ab8e8 : 0xffffff);
      for (let x = x0 - 1; x <= x0 + 1; x++) v.set(x, 8, 7, 0x9a9aa0);
      v.set(x0 - 1, 8, 2, 0xe86a6a);
      break;
    }
    case 'cane': {
      mode = 'level';
      for (let y = 0; y <= 8; y++) v.set(x0, y, 3, y === 0 ? 0xc8c8c8 : 0x121214);
      v.set(x0, 9, 3, L.gold); v.set(x0, 9, 2, L.gold); v.set(x0, 10, 2, 0xf0d070); v.set(x0, 9, 1, L.gold);
      break;
    }
    case 'moneybag': {
      // fat burlap sack of coins with a gold $
      mode = 'hang';
      const sack = 0xc8a46a, sk = 0xa8844a;
      for (let z = 0; z <= 2; z++) v.set(x0, 8, z, 0x7a5a30);
      fillSE(v, x0, 3.2, 1, 3.2, 3.4, 3.4, 2.2, (x, y, z) => (hash3(x, y, z, 9) < 0.25 ? sk : sack));
      v.box(x0 - 1, 6, 0, x0 + 1, 7, 2, 0x8a6a3a);
      for (const [dx, dy] of [[0, 5], [0, 1], [-1, 4], [0, 4], [1, 3], [0, 3], [-1, 2], [0, 2], [1, 2], [-1, 3]]) {
        if ((dx === -1 && dy === 2) || (dx === 1 && dy === 4)) continue;
        v.set(x0 + 3 + 1, dy, 1 + dx, L.gold);
      }
      v.set(x0 - 1, 7, 3, L.gold); v.set(x0, 8, 3, 0xf8e070); // a coin peeking out
      break;
    }
    case 'clipboard': {
      // auditor's clipboard: board, paper, steel clip, red ticks
      for (let y = 6; y <= 14; y++)
        for (let z = 2; z <= 8; z++) {
          v.set(x0 - 1, y, z, 0x8a5a30);
          if (y <= 13 && z >= 3 && z <= 7) v.set(x0, y, z, (y === 11 || y === 9 || y === 7) && z >= 4 && z <= 6 ? 0x9ab0d0 : 0xffffff);
        }
      v.set(x0, 12, 6, 0xd83a3a); v.set(x0, 10, 4, 0xd83a3a); v.set(x0, 8, 5, 0xd83a3a);
      for (let z = 4; z <= 6; z++) { v.set(x0, 14, z, 0xb8bcc4); v.set(x0, 15, z, 0x8a8e96); }
      break;
    }
    case 'bottle': {
      // sports water bottle
      mode = 'level';
      for (let y = 5; y <= 12; y++)
        for (let x = x0 - 1; x <= x0 + 1; x++)
          for (let z = 2; z <= 4; z++) {
            if (Math.abs(x - x0) === 1 && (z === 2 || z === 4)) continue;
            v.set(x, y, z, y >= 11 ? 0xf0f0f0 : y === 8 || y === 7 ? L.d.accent ?? 0x3ad0c0 : 0x7ac8f0);
          }
      v.set(x0, 13, 3, 0x3a3a3a); v.set(x0, 14, 3, 0x3a3a3a);
      break;
    }
    case 'handbag': {
      mode = 'hang';
      const hb = L.d.itemColor ?? 0x8a2a3a, hk = shade(hb, 0.75);
      for (let y = 4; y <= 8; y++) { v.set(x0, y, -1, 0x3a1a1a); v.set(x0, y, 3, 0x3a1a1a); }
      for (let z = -1; z <= 3; z++) v.set(x0, 8, z, 0x3a1a1a);
      for (let y = 0; y <= 4; y++)
        for (let z = -3; z <= 5; z++)
          for (let x = x0 - 1; x <= x0 + 1; x++) {
            if (y === 4 && (z === -3 || z === 5)) continue;
            v.set(x, y, z, y === 4 ? hk : y === 0 ? hk : hb);
          }
      v.set(x0 + 2, 3, 1, L.gold); v.set(x0 + 2, 3, 2, L.gold); v.set(x0 + 2, 2, 1, 0xfff0a0);
      break;
    }
    case 'blueprint': {
      // rolled-up blueprint tube under the arm
      mode = 'level';
      for (let z = -3; z <= 6; z++)
        for (const [dx, dy] of [[0, 8], [-1, 8], [1, 8], [0, 9], [0, 7]]) v.set(x0 + dx, dy, z, z === -3 || z === 6 ? 0xdce8f8 : (z + 40) % 3 === 0 ? 0x2a5aa8 : 0x3a6ac0);
      v.set(x0, 8, 7, 0xf0f0f0);
      break;
    }
    case 'camera': {
      mode = 'hang';
      for (let y = 6; y <= 8; y++) v.set(x0, y, 1, 0x3a2a2a);
      v.box(x0 - 1, 2, -1, x0 + 1, 5, 3, (x, y) => (y === 5 ? 0x3a3a3a : 0x202024));
      for (let y = 3; y <= 4; y++) for (let x = x0 - 1; x <= x0 + 1; x++) v.set(x, y, 4, (x === x0 && y === 4) ? 0x9ad0f0 : 0x5a6a80);
      v.set(x0, 3, 5, 0x3a4a60); v.set(x0, 4, 5, 0x6a9ac0);
      v.set(x0 + 1, 6, 0, 0xf0f0f0); v.set(x0 - 1, 5, 2, 0xd83a3a);
      break;
    }
  }
  return { v, mode, lid: lid.vox.size ? lid : null };
}

function buildWallet(L) {
  const v = new VoxelModel();
  const x0 = -8;
  for (let x = x0 - 1; x <= x0 + 1; x++)
    for (let y = 7; y <= 9; y++) v.set(x, y, 3, y === 9 ? 0x5a3418 : 0x7a4a24);
  v.set(x0, 10, 3, L.gold); v.set(x0 + 1, 10, 3, 0x3aa050); v.set(x0 - 1, 9, 4, 0x5a3418);
  return v;
}

function buildCoin(c) {
  const v = new VoxelModel();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) v.set(c.x + x, c.y + y, c.z, 0xf0c030);
  return v;
}

function buildPuff(c) {
  const v = new VoxelModel();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) v.set(c.x + x, c.y + y - 1, c.z + z, 0xf4f8fa);
  return v;
}

// ------------------------------------------------------------------ mesher
// Like VoxelModel.build(), plus: faces buried inside a neighbouring part are
// culled (with a safety margin so small relative motion never opens holes),
// neighbouring parts can contribute contact AO, and greedy merging also joins
// runs of faces that share the same AO gradient (not only uniform AO), which
// roughly halves the triangle count on rounded shapes.
const KEY = (x, y, z) => (x + 512) | ((y + 512) << 10) | ((z + 512) << 20);
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO_CURVE = [0.56, 0.72, 0.86, 1.0];
const FACE_TINT = [0.96, 0.96, 1.0, 0.78, 0.98, 0.98];
// per face: u/v axes and each corner's (u, v) in {0,1}
const FACE_UV = FACES.map((F, f) => {
  const axis = f >> 1, ua = axis === 0 ? 1 : 0, va = axis === 2 ? 1 : 2;
  return { ua, va, cu: F.c.map((c) => c[ua]), cv: F.c.map((c) => c[va]) };
});

function meshPart(vox, out, bone, { hide = null, aoSolid = null, deepAO = true, shift = null, glow = null, outG = null, chan = null } = {}) {
  const sx0 = shift ? shift[0] : 0, sy0 = shift ? shift[1] : 0, sz0 = shift ? shift[2] : 0;
  const deep = deepAO ? 1 : 0;
  const solid = aoSolid || ((k) => vox.has(k));
  const groups = new Map();
  const d = [0, 0, 0], e = [0, 0, 0];
  for (const [k, hex] of vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      if (vox.has(KEY(nx, ny, nz))) continue;
      if (hide && hide(nx, ny, nz, F.n)) continue;
      let pat = 0;
      for (let ci = 0; ci < 4; ci++) {
        const c = F.c[ci];
        d[0] = d[1] = d[2] = 0; e[0] = e[1] = e[2] = 0;
        let first = true;
        for (let a = 0; a < 3; a++) {
          if (F.n[a] !== 0) continue;
          const dir = c[a] === 1 ? 1 : -1;
          if (first) { d[a] = dir; first = false; } else e[a] = dir;
        }
        // "deep" AO: an occluder only counts if it is at least 2 voxels tall,
        // so single stair steps on round shapes stay clean (and merge)
        const n0 = F.n[0] * deep, n1 = F.n[1] * deep, n2 = F.n[2] * deep;
        const s1 = solid(KEY(nx + d[0], ny + d[1], nz + d[2])) && (!deep || solid(KEY(nx + d[0] + n0, ny + d[1] + n1, nz + d[2] + n2))) ? 1 : 0;
        const s2 = solid(KEY(nx + e[0], ny + e[1], nz + e[2])) && (!deep || solid(KEY(nx + e[0] + n0, ny + e[1] + n1, nz + e[2] + n2))) ? 1 : 0;
        const cx = nx + d[0] + e[0], cy = ny + d[1] + e[1], cz = nz + d[2] + e[2];
        const cc = solid(KEY(cx, cy, cz)) && (!deep || solid(KEY(cx + n0, cy + n1, cz + n2))) ? 1 : 0;
        const occ = s1 && s2 ? 3 : s1 + s2 + cc;
        pat |= (3 - occ) << (ci * 2);
      }
      const axis = f >> 1;
      const layer = axis === 0 ? x : axis === 1 ? y : z;
      const u = axis === 0 ? y : x, v = axis === 2 ? y : z;
      const gk = f * 4096 + layer + 512;
      let g = groups.get(gk);
      if (!g) groups.set(gk, (g = []));
      g.push(u, v, hex, pat);
    }
  }
  const b = [1, 1, 1, 1];
  for (const [gk, arr] of groups) {
    const f = Math.floor(gk / 4096), layer = (gk % 4096) - 512;
    const F = FACES[f], UV = FACE_UV[f], axis = f >> 1;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < arr.length; i += 4) {
      if (arr[i] < u0) u0 = arr[i]; if (arr[i] > u1) u1 = arr[i];
      if (arr[i + 1] < v0) v0 = arr[i + 1]; if (arr[i + 1] > v1) v1 = arr[i + 1];
    }
    const W = u1 - u0 + 1, H = v1 - v0 + 1;
    const gridC = new Float64Array(W * H).fill(-1), gridP = new Int16Array(W * H);
    for (let i = 0; i < arr.length; i += 4) { const gi = (arr[i + 1] - v0) * W + (arr[i] - u0); gridC[gi] = arr[i + 2]; gridP[gi] = arr[i + 3]; }
    for (let vv = 0; vv < H; vv++)
      for (let uu = 0; uu < W; uu++) {
        const gi = vv * W + uu;
        const hex = gridC[gi];
        if (hex < 0) continue;
        const pat = gridP[gi];
        // corner AO by (u,v) position
        const ao = [0, 0, 0, 0];
        for (let ci = 0; ci < 4; ci++) ao[UV.cu[ci] + UV.cv[ci] * 2] = (pat >> (ci * 2)) & 3;
        const canU = ao[0] === ao[1] && ao[2] === ao[3];
        const canV = ao[0] === ao[2] && ao[1] === ao[3];
        let w = 1;
        if (canU) while (uu + w < W && gridC[gi + w] === hex && gridP[gi + w] === pat) w++;
        let h = 1;
        if (canV) {
          outer: while (vv + h < H) {
            for (let i = 0; i < w; i++) { const gj = (vv + h) * W + uu + i; if (gridC[gj] !== hex || gridP[gj] !== pat) break outer; }
            h++;
          }
        }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gridC[(vv + j) * W + uu + i] = -1;
        // emit
        const uc = u0 + uu, vc = v0 + vv;
        const ox = axis === 0 ? layer : uc;
        const oy = axis === 1 ? layer : axis === 0 ? uc : vc;
        const oz = axis === 2 ? layer : vc;
        const rgb = linearRGB(hex), tint = FACE_TINT[f];
        const O = glow && outG && glow.has(hex) ? outG : out;
        const ch = chan ? chan.get(hex) || 0 : 0;
        const vi = O.pos.length / 3;
        for (let ci = 0; ci < 4; ci++) {
          const c = F.c[ci];
          const p = [ox + c[0], oy + c[1], oz + c[2]];
          p[UV.ua] = [ox, oy, oz][UV.ua] + c[UV.ua] * w;
          p[UV.va] = [ox, oy, oz][UV.va] + c[UV.va] * h;
          O.pos.push((p[0] - 0.5 + sx0) * 0.1, (p[1] + sy0) * 0.1, (p[2] - 0.5 + sz0) * 0.1);
          O.nor.push(F.n[0], F.n[1], F.n[2]);
          const br = O === out ? AO_CURVE[(pat >> (ci * 2)) & 3] * tint : 0.82 + 0.18 * AO_CURVE[(pat >> (ci * 2)) & 3];
          b[ci] = br;
          O.col.push(rgb[0] * br, rgb[1] * br, rgb[2] * br);
          O.si.push(bone);
          O.tint.push(ch);
        }
        if (b[0] + b[2] > b[1] + b[3]) O.idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
        else O.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      }
  }
}

// which parts may hide faces of which (margin = voxels of cover needed), and
// which neighbours darken a part's AO
const OCCLUDERS = {
  torso: [['belly', 2], ['head', 3]],
  belly: [['torso', 2]],
  pelvis: [['torso', 3], ['belly', 3]],
  legL: [['pelvis', 2]],
  legR: [['pelvis', 2]],
  tail: [['pelvis', 2], ['torso', 2]],
  head: [['hat', 3], ['torso', 3]],
  earL: [['hat', 3]],
  earR: [['hat', 3]],
  tie: [],
};
const AO_FROM = { torso: ['belly', 'head'], belly: ['torso'], head: ['hat'], pelvis: ['torso', 'belly'], hat: ['head'] };

const KOFF = (d) => d[0] + d[1] * 1024 + d[2] * 1048576; // key offset (fields never carry)

function toGeometry(out) {
  const nv = out.pos.length / 3;
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { si[i * 4] = out.si[i]; sw[i * 4] = 1; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute('tint', new THREE.Float32BufferAttribute(out.tint, 1));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(out.idx, 1) : new THREE.Uint16BufferAttribute(out.idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// parts: { name, bone, model, shift? (voxels, float) }; L (optional) adds glow + tint channels
function mergeSkinned(parts, L = null) {
  const byName = new Map(parts.filter((p) => p.name).map((p) => [p.name, p]));
  const out = { pos: [], nor: [], col: [], si: [], idx: [], tint: [] };
  const outG = { pos: [], nor: [], col: [], si: [], idx: [], tint: [] };
  const counts = {};
  const rs = (p) => (p.shift ? p.shift.map(Math.round) : [0, 0, 0]);
  for (const p of parts) {
    if (!p.model || !p.model.vox.size) continue;
    const vox = p.model.vox;
    const me = rs(p);
    const rel = (o) => { const r = rs(o); return [me[0] - r[0], me[1] - r[1], me[2] - r[2]]; };
    const occ = (OCCLUDERS[p.name] || []).map(([n, m]) => [byName.get(n), m]).filter((o) => o[0] && o[0].model.vox.size)
      .map(([o, m]) => [o.model.vox, m, rel(o)]);
    const hide = occ.length ? (x, y, z, n) => {
      for (const [ov, m, d] of occ) {
        let all = true;
        for (let k = 0; k < m; k++) if (!ov.has(KEY(x + n[0] * k + d[0], y + n[1] * k + d[1], z + n[2] * k + d[2]))) { all = false; break; }
        if (all) return true;
      }
      return false;
    } : null;
    const aoFrom = (AO_FROM[p.name] || []).map((n) => byName.get(n)).filter(Boolean).map((o) => [o.model.vox, KOFF(rel(o))]);
    const aoSolid = aoFrom.length ? (k) => vox.has(k) || aoFrom.some(([m, ko]) => m.has(k + ko)) : null;
    const t0 = out.idx.length + outG.idx.length;
    meshPart(vox, out, p.bone, { hide, aoSolid, shift: p.shift, glow: L && L.glow.size ? L.glow : null, outG, chan: L ? L.chan : null });
    counts[p.name || p.bone] = (out.idx.length + outG.idx.length - t0) / 3;
  }
  const geo = toGeometry(out);
  geo.userData.partTris = counts;
  geo.userData.glow = outG.idx.length ? toGeometry(outG) : null;
  return geo;
}

// ------------------------------------------------------------------ geometry
const geoCache = new Map();

function faceGeometry(L = null, bind = null) {
  // eyes on the head plate, upper lip on the muzzle, lower lip on the jaw
  const dh = bind ? [bind[B.head].x - BIND[B.head].x, bind[B.head].y - BIND[B.head].y, bind[B.head].z - BIND[B.head].z] : [0, 0, 0];
  const quads = [
    { r: FACE_REGIONS.eyes, ...FACE_QUADS.eyes, bone: B.head },
    { r: FACE_REGIONS.upper, ...FACE_QUADS.upper, bone: B.head },
    { r: FACE_REGIONS.lower, ...FACE_QUADS.lower, bone: B.jaw },
  ];
  const pos = [], nor = [], uv = [], si = [], sw = [], idx = [];
  const eps = 0.07;
  const quad = (corners, n, u0, u1, v0, v1, bone) => {
    const b = pos.length / 3;
    for (const c of corners) pos.push(c[0] * 0.1, c[1] * 0.1, c[2] * 0.1);
    for (let k = 0; k < 4; k++) { nor.push(n[0], n[1], n[2]); si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0); }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quads.forEach((q) => {
    const u0 = q.r.x / FACE_W, u1 = (q.r.x + q.r.w) / FACE_W;
    const v1 = 1 - q.r.y / FACE_H, v0 = 1 - (q.r.y + q.r.h) / FACE_H;
    const z = q.z + eps + dh[2];
    const x0 = q.x0 + dh[0], x1 = q.x1 + dh[0], y0 = q.y0 + dh[1], y1 = q.y1 + dh[1];
    quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], u0, u1, v0, v1, q.bone);
  });
  if (L && L.band && bind) {
    // armband text wraps around the back, outside and front of the left arm
    const r = FACE_REGIONS.band, bd = L.band;
    const da = [bind[B.armL].x - BIND[B.armL].x, bind[B.armL].y - BIND[B.armL].y, bind[B.armL].z - BIND[B.armL].z];
    const X0 = bd.x0 + da[0] - eps, X1 = bd.x1 + da[0], Z0 = bd.z0 + da[2] - eps, Z1 = bd.z1 + da[2] + eps;
    const Y0 = bd.y0 + da[1] + 0.12, Y1 = bd.y1 + da[1] - 0.12;
    const wB = X1 - X0, wO = Z1 - Z0, wF = X1 - X0, tot = wB + wO + wF;
    const U = (k) => (r.x + r.w * k) / FACE_W;
    const v1 = 1 - r.y / FACE_H, v0 = 1 - (r.y + r.h) / FACE_H;
    const k1 = wB / tot, k2 = (wB + wO) / tot;
    quad([[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]], [0, 0, -1], U(0), U(k1), v0, v1, B.armL);
    quad([[X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]], [-1, 0, 0], U(k1), U(k2), v0, v1, B.armL);
    quad([[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]], [0, 0, 1], U(k2), U(1), v0, v1, B.armL);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
let sharedFaceGeo = null;

function coinSpots() {
  return [BIND[B.coin0], BIND[B.coin1], BIND[B.coin2]];
}

// grizzled fur: sprinkle lighter guard-hair tips over the fur voxels
function grizzle(model, L, seed) {
  const g = L.d.grizzle;
  if (!g || !model) return model;
  const gc = mix(L.fur, g, 0.5);
  model.paint((x, y, z, c) => (c === L.fur && hash3(x, y, z, seed) < 0.11 ? gc : c));
  return model;
}

export function bearRigGeometry(typeId, def) {
  let g = geoCache.get(typeId);
  if (g) return g;
  const L = lookOf(def);
  const shaped = !!def.shape;
  const A = L.arm;
  const pawDy = Math.round(A.cy - A.ry - 7.3);
  if (pawDy) { L.off.item = [0, pawDy, 0]; L.off.wallet = [0, pawDy, 0]; }
  const body = buildBody(L);
  const tieV = buildTie(L, body);
  const abs = {};
  if (shaped) {
    abs.belly = new THREE.Vector3(L.BL.cx, L.BL.cy, L.BL.cz);
    let zt = 4.9;
    for (let z = 20; z >= -5; z--) if (body.torso.has(0, L.neckY, z) || body.belly.has(0, L.neckY, z)) { zt = z + 0.9; break; }
    abs.tie = new THREE.Vector3(0, L.neckY - 0.2, zt);
  }
  const bind = bindOf(L, abs);
  const sh = (b) => [bind[b].x - BIND[b].x, bind[b].y - BIND[b].y, bind[b].z - BIND[b].z];
  const hatInfo = buildHat(L);
  const item = def.item ? buildItem(L, def.item) : null;
  const gz = (m, i) => grizzle(m, L, i);
  const parts = [
    { name: 'pelvis', bone: B.hips, model: gz(buildPelvis(L), 1) },
    { name: 'torso', bone: B.spine, model: gz(body.torso, 2) },
    { name: 'belly', bone: B.belly, model: gz(body.belly, 3) },
    { name: 'tie', bone: B.tie, model: tieV },
    { name: 'head', bone: B.head, model: gz(buildHead(L), 4), shift: sh(B.head) },
    { name: 'jaw', bone: B.jaw, model: buildJaw(L), shift: sh(B.jaw) },
    { name: 'earL', bone: B.earL, model: gz(buildEar(L, -1), 5), shift: sh(B.earL) },
    { name: 'earR', bone: B.earR, model: gz(buildEar(L, 1), 6), shift: sh(B.earR) },
    { name: 'hat', bone: B.hat, model: hatInfo.hat, shift: sh(B.hat) },
    { name: 'armL', bone: B.armL, model: gz(buildArm(L, -1), 7), shift: sh(B.armL) },
    { name: 'armR', bone: B.armR, model: gz(buildArm(L, 1), 8), shift: sh(B.armR) },
    { name: 'legL', bone: B.legL, model: gz(buildLeg(L, -1), 9), shift: sh(B.legL) },
    { name: 'legR', bone: B.legR, model: gz(buildLeg(L, 1), 10), shift: sh(B.legR) },
    { name: 'tail', bone: B.tail, model: gz(buildTail(L), 11), shift: sh(B.tail) },
    { name: 'wallet', bone: B.wallet, model: buildWallet(L), shift: sh(B.wallet) },
  ];
  if (def.hat === 'propeller') parts.push({ name: 'prop', bone: B.prop, model: buildProp(), shift: sh(B.prop) });
  if (item) {
    parts.push({ name: 'item', bone: B.item, model: item.v, shift: sh(B.item) });
    if (item.lid) parts.push({ name: 'lid', bone: B.lid, model: item.lid, shift: sh(B.lid) });
  }
  coinSpots().forEach((c, i) => parts.push({ bone: B.coin0 + i, model: buildCoin(c) }));
  [B.steam0, B.steam1, B.steam2].forEach((b) => parts.push({ bone: b, model: buildPuff(BIND[b]), shift: sh(b) }));
  const geo = mergeSkinned(parts, L);
  const glowGeo = geo.userData.glow;
  // generous culling bounds (spins, raised arms, props) around the real extent
  const bb = geo.boundingBox.clone();
  bb.min.x -= 0.6; bb.max.x += 0.6; bb.min.z -= 0.6; bb.max.z += 0.8; bb.max.y += 1.0; bb.min.y -= 0.2;
  const bs = bb.getBoundingSphere(new THREE.Sphere());
  const shapedFace = shaped && (sh(B.head).some((v) => v !== 0) || L.band);
  g = {
    geo, glowGeo, look: L, bind, hatTop: hatInfo.top, itemMode: item ? item.mode : 'none',
    tris: geo.index.count / 3 + (glowGeo ? glowGeo.index.count / 3 : 0),
    faceGeo: shapedFace ? faceGeometry(L, bind) : null,
    bounds: { box: bb, sphere: bs },
  };
  geoCache.set(typeId, g);
  return g;
}

export function preloadBearGeometries(types) {
  const list = types || _types;
  if (!list) return 0;
  let n = 0;
  for (const id of Object.keys(list)) { bearRigGeometry(id, list[id]); n++; }
  return n;
}
let _types = BEAR_TYPES;
export function registerBearTypes(types) { _types = types; }

// ------------------------------------------------------------------ eat kit
// Extra pieces for the eating styles, meshed lazily per bear type the first
// time a bear needs them (most bears never do): an unhinged MAW (wide palate
// with fangs, a stretchy throat and a lower jaw that drops way down), a
// slurping "O" pucker, ballooned cheeks, a swallow lump that slides down the
// chest, and fine-dining props (napkin bib, fork with a raised pinky, knife).
// Model units (0.1 / voxel) around each piece's own pivot, see BearRig._kit().
export const MAW_DROP = 10; // lower-jaw drop at full gape (voxels)
const MAW_TOP = 18.6; // head-space y of the palate line under the muzzle
const PUCKER_AT = [0, 19.2, 9.6];
const CHEEK_AT = [7.0, 20.4, 5.0];
const kitCache = new Map();

function bodyFrontZ(L, x, y) {
  for (let z = 20; z >= -12; z--) if (inTorso(x, y, z, L) || bellyD(x, y, z, L) <= 1) return z;
  return null;
}

function eatKitGeometry(typeId, L) {
  let G = kitCache.get(typeId);
  if (G) return G;
  const d = L.d;
  const fur = L.fur, light = L.furLight;
  const geo = (v, px = 0, py = 0, pz = 0) => v.build({ pivot: [px + 0.5, py, pz + 0.5], scale: 0.1 });
  const TEETH = 0xfffaf0, TEETH_D = 0xe2d6c4, GUM = 0x9a2a3e, DARK = 0x4a0e1a, DEEP = 0x2a0610, THROAT = 0x14030a;
  const TONGUE = 0xf25f7e, TONGUE_D = 0xc83a58, LIP = mix(light, 0xb8485a, 0.22);
  // The maw outline is a rounded "D" in x/z (flat-ish back, round front). The throat
  // slants forward as it goes down so a fat chest never pokes into the mouth.
  const inOut = (x, z, cz, rx, rz) => (x / rx) ** 2 + ((z - cz) / rz) ** 2 * (z < cz ? 0.35 : 1);
  // --- upper maw (head child, y relative to MAW_TOP): palate, rolled lip, a fence of teeth + two big fangs
  const top = new VoxelModel();
  for (let x = -7; x <= 7; x++)
    for (let z = 4; z <= 13; z++) {
      const q = inOut(x, z, 8.6, 6.9, 3.9);
      if (q > 1) continue;
      const rim = q > 0.62 && z >= 7;
      top.set(x, 0, z, rim ? LIP : q > 0.55 ? GUM : DARK);
      if (rim) top.set(x, 1, z, light);
      if (q > 0.38 && q <= 0.62 && z >= 8) {
        const fang = Math.abs(x) === 3 || Math.abs(x) === 4 && z < 10;
        top.set(x, -1, z, (x + z) % 3 ? TEETH : TEETH_D);
        if (fang) { top.set(x, -2, z, TEETH); top.set(x, -3, z, TEETH_D); }
      }
    }
  // --- throat interior (head child, scaled in y by the gape): dark walls, a deep throat, a wobbly uvula
  const inner = new VoxelModel();
  for (let y = -MAW_DROP; y <= -1; y++) {
    const v = -y / MAW_DROP; // 0 at the palate .. 1 at the jaw
    const cz = 8.6 + 1.2 * v;
    for (let x = -7; x <= 7; x++)
      for (let z = 4; z <= 13; z++) {
        const q = inOut(x, z, cz, 6.9, 3.9);
        if (q > 1 || q < 0.6) continue; // a hollow tube
        if (z > cz + 1 && Math.abs(x) < 6) continue; // open at the front
        const back = z <= cz;
        const th = back && Math.abs(x) <= 2 && v > 0.25 && v < 0.85;
        inner.set(x, y, z, th ? THROAT : back && Math.abs(x) <= 4 ? DEEP : z > cz + 1 ? GUM : DARK);
      }
  }
  inner.set(0, -1, 5, 0xe8607a); inner.set(0, -2, 5, 0xf27a90); inner.set(0, -3, 6, 0xd84a66); // uvula
  // --- lower jaw (head child, drops by gape * MAW_DROP): tongue, a lower fence of teeth, lip, chin fluff
  const bot = new VoxelModel();
  for (let x = -7; x <= 7; x++)
    for (let z = 4; z <= 14; z++) {
      const q = inOut(x, z, 9.8, 6.9, 3.9);
      if (q > 1) continue;
      const rim = q > 0.62 && z >= 8;
      bot.set(x, -2, z, Math.abs(x) >= 6 ? fur : light);
      bot.set(x, -1, z, rim ? LIP : GUM);
      if (q <= 0.45) bot.set(x, 0, z, x === 0 && z >= 7 ? TONGUE_D : TONGUE);
      if (q > 0.45 && q <= 0.62 && z >= 9) {
        bot.set(x, 0, z, (x + z) % 3 ? TEETH : TEETH_D);
        if (Math.abs(x) === 4 || Math.abs(x) === 5 && z < 11) { bot.set(x, 1, z, TEETH); bot.set(x, 2, z, TEETH_D); }
      }
    }
  bot.set(-1, 1, 9, TONGUE); bot.set(1, 1, 8, TONGUE); // a lolling tongue tip
  for (let x = -2; x <= 2; x++) bot.set(x, -3, 12, x % 2 ? L.furTuft : light);
  bot.set(0, -3, 13, L.furTuft);
  // --- slurp pucker (head child at PUCKER_AT): a lippy ring pushed forward with a dark hole
  const puck = new VoxelModel();
  for (let x = -3; x <= 3; x++)
    for (let y = -3; y <= 3; y++) {
      const q = (x / 3.1) ** 2 + (y / 2.7) ** 2;
      if (q > 1) continue;
      const hole = (x / 1.5) ** 2 + (y / 1.25) ** 2 < 1;
      if (hole) { puck.set(x, y, 0, THROAT); continue; }
      puck.set(x, y, 0, LIP);
      puck.set(x, y, 1, q > 0.62 ? LIP : mix(LIP, 0xc04a60, 0.5));
      if (q > 0.55) puck.set(x, y, 2, y > 0 ? mix(LIP, 0xffffff, 0.2) : LIP);
    }
  // --- cheek balloon (head child, one per side)
  const cheek = new VoxelModel();
  fillSE(cheek, 0, -0.5, 0, 3.3, 3.0, 3.3, 2.2, (x, y, z) => (y <= -2 || z >= 2 ? light : (x + y + z) % 5 === 0 ? L.furTuft : fur));
  cheek.set(0, 0, 3, L.pad); cheek.set(1, 0, 3, L.pad); cheek.set(0, -1, 3, mix(L.pad, light, 0.4));
  // --- swallow lump (spine child): outfit-coloured bulge that slides down the chest front
  const shirtFront = ['jacket', 'tux', 'threepiece', 'trench', 'shirt', 'cardigan'].includes(L.outfit);
  const lc = L.outfit === 'fur' ? L.furLight : shirtFront ? d.shirt : d.suit;
  const lump = new VoxelModel();
  fillSE(lump, 0, -0.5, 0, 2.8, 2.4, 1.9, 2.2, (x, y) => (y <= -2 ? shade(lc, 0.86) : y >= 1 ? mix(lc, 0xffffff, 0.12) : lc));
  const path = [];
  for (let y = 18; y >= 10; y--) path.push([y, (bodyFrontZ(L, 0, y) ?? 6) + 1.2]);
  // --- napkin bib (spine child, body coords): tucked into the collar, draped over the belly
  const nap = new VoxelModel();
  const N = L.neckY;
  const W = 0xfbfbf4, Wd = 0xe0e0d8, Wb = 0x8aa4c8;
  for (let y = 8; y <= N; y++) {
    const k = (N - y) / Math.max(1, N - 8);
    const hw = y > N - 1 ? 2.6 : k < 0.62 ? 2.6 + k * 5.2 : (1 - k) / 0.38 * 5.8; // widens, then a point
    let zr = -99;
    for (let x = -Math.ceil(hw) - 1; x <= Math.ceil(hw) + 1; x++) { const z = bodyFrontZ(L, x, y); if (z != null) zr = Math.max(zr, z); }
    if (zr < -50) continue;
    for (let x = -Math.round(hw); x <= Math.round(hw); x++) {
      const edge = Math.abs(x) >= Math.round(hw) || y === 8;
      nap.set(x, y, zr + 2, edge ? Wb : (y + (x > 0 ? 1 : 0)) % 3 === 0 ? Wd : W);
    }
  }
  const zc = (bodyFrontZ(L, 0, N) ?? 5) + 2;
  for (const sx of [-1, 1]) { nap.set(sx * 2, N + 1, zc, W); nap.set(sx * 3, N + 1, zc, Wd); nap.set(sx * 3, N + 2, zc - 1, W); } // tucked corners
  nap.set(0, N + 1, zc, Wd);
  // --- fork with a raised pinky (left arm) and knife (right arm), arm-space bind coords
  const pawY = 8.4 + Math.round(L.arm.cy - L.arm.ry - 7.3);
  const S = 0xe8ecf4, Sd = 0xa4acba, Sw = 0xffffff, WOOD = 0x6a4022;
  const fork = new VoxelModel();
  const fx = -8, fz = 2;
  for (let z = fz - 1; z <= fz + 5; z++) fork.set(fx, pawY, z, z <= fz + 1 ? Sd : S);
  for (let x = fx - 1; x <= fx + 1; x++) fork.set(x, pawY, fz + 6, S);
  for (const x of [fx - 1, fx, fx + 1]) for (let z = fz + 7; z <= fz + 8; z++) fork.set(x, pawY, z, z === fz + 8 ? Sw : x === fx ? Sd : S);
  for (let z = fz; z <= fz + 2; z++) fork.set(fx - 3, pawY + 1, z, z === fz + 2 ? L.pad : fur); // the pinky, raised just so
  const knife = new VoxelModel();
  const kx = 8, kz = 2;
  for (let z = kz - 1; z <= kz + 2; z++) knife.set(kx, pawY, z, WOOD);
  knife.set(kx, pawY, kz + 3, Sd);
  for (let z = kz + 4; z <= kz + 9; z++) { knife.set(kx, pawY, z, S); knife.set(kx + 1, pawY, z, z >= kz + 8 ? Sw : mix(S, Sw, 0.4)); }
  knife.set(kx + 1, pawY, kz + 9, null);
  G = {
    top: geo(top), inner: geo(inner), bot: geo(bot), pucker: geo(puck), cheek: geo(cheek), lump: geo(lump),
    napkin: geo(nap), fork: geo(fork), knife: geo(knife),
    path, pawY, forkTip: [fx, pawY, fz + 9.6],
  };
  kitCache.set(typeId, G);
  return G;
}

// ------------------------------------------------------------------ materials
let mats = null;
function sharedMats() {
  if (!mats) {
    mats = {
      normal: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true })),
      angry: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(1.45, 0.62, 0.55) })),
      flash: addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(2.3, 2.3, 2.3), emissive: new THREE.Color(0.25, 0.25, 0.25) })),
    };
  }
  return mats;
}

// Per-bear tint on top of the grain: fur tone (channel 1) and accessory hue (channel 2),
// read from the 'tint' vertex attribute baked by the mesher.
function addTint(mat) {
  const prev = mat.onBeforeCompile;
  const U = (mat.userData.tint = { uFur: { value: new THREE.Color(1, 1, 1) }, uHue: { value: 0 } });
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uFur = U.uFur;
    shader.uniforms.uHue = U.uHue;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tint;\nvarying float vTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = tint;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFur;\nuniform float uHue;\nvarying float vTint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vTint > 0.5 && vTint < 1.5) diffuseColor.rgb *= uFur;
else if (vTint > 1.5 && uHue != 0.0) {
  const vec3 hk = vec3(0.57735);
  float hc = cos(uHue), hs = sin(uHue);
  vec3 col = diffuseColor.rgb;
  diffuseColor.rgb = max(vec3(0.0), col * hc + cross(hk, col) * hs + hk * dot(hk, col) * (1.0 - hc));
}`);
  };
  mat.customProgramCacheKey = () => 'grain-tint';
  return mat;
}

// ------------------------------------------------------------------ aura
// Spirit-bear aura: rising glowing wisps + two waving northern-lights curtains.
// Lives in the rig's scaler (model units: 0.1 = 1 voxel).
const _m4 = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _sa = new THREE.Vector3(), _pa = new THREE.Vector3();
class Aura {
  constructor(L, seed = 1) {
    this.group = new THREE.Group();
    this.group.name = 'bearAura';
    const cols = L.aurora;
    const n = 30;
    const r = mulberry32(seed * 7919 + 13);
    const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.wmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.wisps = new THREE.InstancedMesh(box, this.wmat, n);
    this.wisps.frustumCulled = false;
    this.p = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.p.push({ a: r() * Math.PI * 2, rad: 0.95 + r() * 0.55, y: r() * 3.8, sp: 0.35 + r() * 0.5, w: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), s: 0.9 + r() * 0.9 });
      this.wisps.setColorAt(i, c.setHex(cols[i % cols.length]));
    }
    this.group.add(this.wisps);
    // northern-lights curtains made of separate vertical rays (one quad each)
    this.seg = 16;
    this.ribbons = [];
    this.rmat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let k = 0; k < 2; k++) {
      const g = new THREE.BufferGeometry();
      const nq = this.seg;
      const pos = new Float32Array(nq * 4 * 3), col = new Float32Array(nq * 4 * 3), idx = [];
      for (let i = 0; i < nq; i++) {
        const u = i / (nq - 1);
        const lo = c.setHex(cols[(i + k * 2) % 3]).convertSRGBToLinear();
        const hi = new THREE.Color(k ? 0x5a2ad8 : 0x8a3ad8).convertSRGBToLinear().multiplyScalar(0.18);
        for (const [j, cc] of [[0, lo], [1, lo], [2, hi], [3, hi]]) col.set([cc.r, cc.g, cc.b], (i * 4 + j) * 3);
        const a = i * 4;
        idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
        void u;
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, this.rmat);
      m.frustumCulled = false;
      m.renderOrder = 6;
      this.group.add(m);
      this.ribbons.push(m);
    }
    this.t = r() * 10;
    this.update(0);
  }

  update(dt, energy = 1) {
    this.t += dt;
    const t = this.t;
    for (let i = 0; i < this.p.length; i++) {
      const q = this.p[i];
      q.y += dt * q.sp * (0.6 + energy * 0.6);
      q.a += dt * q.w;
      if (q.y > 3.9) { q.y = 0; q.rad = 0.95 + ((i * 0.37 + t) % 0.55); }
      const life = q.y / 3.9;
      const sc = Math.sin(life * Math.PI) * q.s * (0.8 + 0.4 * energy);
      const rr = q.rad * (1 - life * 0.35);
      _pa.set(Math.cos(q.a) * rr, q.y + 0.1, Math.sin(q.a) * rr * 0.85 - 0.1);
      _sa.setScalar(Math.max(1e-3, sc));
      _m4.compose(_pa, _qa.identity(), _sa);
      this.wisps.setMatrixAt(i, _m4);
    }
    this.wisps.instanceMatrix.needsUpdate = true;
    this.ribbons.forEach((m, k) => {
      const pos = m.geometry.attributes.position;
      const nq = this.seg, span = 3.0 + k * 0.8, w = span / nq * 0.55;
      for (let i = 0; i < nq; i++) {
        const u = i / (nq - 1);
        const x = (u - 0.5) * span;
        const wav = Math.sin(t * (1.1 + k * 0.3) + u * 6 + k * 2);
        const y0 = 1.55 + k * 0.3 + Math.sin(u * Math.PI) * 0.55 + wav * 0.12;
        const z = -0.8 - k * 0.32 - Math.sin(u * Math.PI) * 0.4 + Math.cos(t * 0.8 + u * 5) * 0.12;
        const h = (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.1 + i * 1.7 + k))) * (0.75 + 0.45 * energy) * (0.6 + 0.4 * Math.sin(u * Math.PI));
        const sl = 0.12 * wav; // rays lean with the wave
        const a = i * 4;
        pos.setXYZ(a, x - w, y0, z); pos.setXYZ(a + 1, x + w, y0, z);
        pos.setXYZ(a + 2, x + w + sl, y0 + h, z - 0.2); pos.setXYZ(a + 3, x - w + sl, y0 + h, z - 0.2);
      }
      pos.needsUpdate = true;
    });
    this.rmat.opacity = 0.42 + 0.14 * Math.sin(t * 1.7) + 0.15 * (energy - 1);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.wisps.geometry.dispose(); this.wmat.dispose(); this.rmat.dispose();
    for (const m of this.ribbons) m.geometry.dispose();
  }
}

// ------------------------------------------------------------------ pose frame
const CH = 9; // rx ry rz px py pz sx sy sz
const EX = NB * CH; // extras
const X_HOLD = EX, X_JAW = EX + 3, X_LOOKX = EX + 4, X_LOOKY = EX + 5, X_ITEMRIGID = EX + 6, X_PROPSPIN = EX + 7;
// eat kit: unhinged maw (0..1+), slurp pucker, puffed cheeks, swallow lump (0..1 down the chest, 0 = off),
// napkin bib, cutlery (fork + knife + raised pinky)
const X_GAPE = EX + 8, X_PUCKER = EX + 9, X_CHEEK = EX + 10, X_THROAT = EX + 11, X_NAPKIN = EX + 12, X_CUTLERY = EX + 13;
const NCH = EX + 14;

class Frame {
  constructor() { this.a = new Float32Array(NCH); this.reset(); }
  reset() {
    const a = this.a;
    for (let i = 0; i < NB; i++) {
      const o = i * CH;
      a[o] = a[o + 1] = a[o + 2] = a[o + 3] = a[o + 4] = a[o + 5] = 0;
      a[o + 6] = a[o + 7] = a[o + 8] = 1;
    }
    a[X_HOLD] = 0; a[X_HOLD + 1] = 16.6; a[X_HOLD + 2] = 9.5;
    a[X_JAW] = -1; a[X_LOOKX] = 0; a[X_LOOKY] = 0; a[X_ITEMRIGID] = 0; a[X_PROPSPIN] = 0;
    a[X_GAPE] = a[X_PUCKER] = a[X_CHEEK] = a[X_THROAT] = a[X_NAPKIN] = a[X_CUTLERY] = 0;
    // resting arms hang a little outwards around the belly
    a[B.armL * CH + 2] = -0.13; a[B.armR * CH + 2] = 0.13;
    return this;
  }
  copy(f) { this.a.set(f.a); return this; }
  r(b, x, y, z) { const o = b * CH; this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; }
  ar(b, x, y, z) { const o = b * CH; this.a[o] += x; this.a[o + 1] += y; this.a[o + 2] += z; }
  p(b, x, y, z) { const o = b * CH + 3; this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; }
  ap(b, x, y, z) { const o = b * CH + 3; this.a[o] += x; this.a[o + 1] += y; this.a[o + 2] += z; }
  s(b, x, y, z) { const o = b * CH + 6; this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; }
  // volume preserving squash (s < 1) / stretch (s > 1) along Y
  sq(b, s) { const k = 1 / Math.sqrt(s); this.s(b, k, s, k); }
  mulS(b, x, y, z) { const o = b * CH + 6; this.a[o] *= x; this.a[o + 1] *= y; this.a[o + 2] *= z; }
  hold(x, y, z) { this.a[X_HOLD] = x; this.a[X_HOLD + 1] = y; this.a[X_HOLD + 2] = z; }
  jaw(v) { this.a[X_JAW] = v; }
  look(x, y) { this.a[X_LOOKX] = x; this.a[X_LOOKY] = y; }
  // Point a limb (arm) at a target in bind-space voxels; stretch scales the arm.
  aim(b, tx, ty, tz, stretch = 1, len = ARM_LEN) {
    const o = b * CH, a = this.a, bp = (this.bind || BIND)[b];
    let dx = tx - (bp.x + a[o + 3]), dy = ty - (bp.y + a[o + 4]), dz = tz - (bp.z + a[o + 5]);
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    a[o] = Math.atan2(-dz, -dy);
    a[o + 1] = 0;
    a[o + 2] = Math.asin(clamp(dx, -1, 1));
    let s = a[o + 7];
    if (stretch) {
      s = clamp(1 + (l / len - 1) * stretch, 0.82, 1.32);
      const k = 1 / Math.sqrt(s);
      a[o + 6] = k; a[o + 7] = s; a[o + 8] = k;
    }
    // where the paw actually ends up (bind voxels): eating poses put the snack right there
    const e = (this.end ||= {})[b] || (this.end[b] = new THREE.Vector3());
    e.set(bp.x + a[o + 3] + dx * len * s, bp.y + a[o + 4] + dy * len * s, bp.z + a[o + 5] + dz * len * s);
    return e;
  }
  // rotate the base about a pivot (voxels) so spins happen around the body centre
  spinAbout(px, py, pz, rx, ry, rz) {
    const o = B.base * CH;
    this.r(B.base, rx, ry, rz);
    _e.set(rx, ry, rz, 'YXZ');
    _v1.set(px, py, pz).applyEuler(_e);
    this.a[o + 3] += px - _v1.x; this.a[o + 4] += py - _v1.y; this.a[o + 5] += pz - _v1.z;
  }
}
const _e = new THREE.Euler();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();

// damped spring helper (value, velocity)
class Spring {
  constructor(k = 120, c = 9) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(dt, drive = 0, target = 0) {
    const a = -this.k * (this.x - target) - this.c * this.v + drive;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v) { this.v += v; }
  reset() { this.x = 0; this.v = 0; }
}

// ------------------------------------------------------------------ poses
// Each pose writes into F (already reset to the rest pose). c = context.
function gaitLegs(F, c, amp, lift = 0) {
  const s = Math.sin(c.phase);
  F.r(B.legL, -amp * s, 0, 0);
  F.r(B.legR, amp * s, 0, 0);
  if (lift) {
    F.ap(B.legL, 0, Math.max(0, Math.cos(c.phase)) * lift, 0);
    F.ap(B.legR, 0, Math.max(0, -Math.cos(c.phase)) * lift, 0);
  }
}

function idleBreath(F, c, k = 1) {
  const t = c.time;
  const br = Math.sin(t * 2.25 + c.P.phase);
  F.mulS(B.spine, 1 - 0.008 * br * k, 1 + 0.016 * br * k, 1 - 0.008 * br * k);
  F.mulS(B.belly, 1 + 0.02 * br * k, 1 + 0.012 * br * k, 1 + 0.028 * br * k);
  F.ap(B.armL, 0, 0.18 * br * k, 0); F.ap(B.armR, 0, 0.18 * br * k, 0);
}

function treadWater(F, c, strength = 1) {
  const t = c.time * 5.2 + c.P.phase;
  const bob = Math.sin(t * 0.5) * 0.55;
  F.ap(B.base, 0, bob, 0);
  F.ar(B.spine, 0.12, 0, Math.sin(t * 0.25) * 0.04);
  F.ar(B.head, -0.12, 0, 0);
  for (const [b, sx, ph] of [[B.armL, -1, 0], [B.armR, 1, Math.PI]]) {
    const a = t + ph;
    F.aim(b, sx * 6.2, 13.5 + Math.sin(a) * 1.8 * strength, 7 + Math.cos(a) * 2.2 * strength, 0.4);
  }
  F.r(B.legL, Math.sin(t * 0.8) * 0.45, 0, -0.1);
  F.r(B.legR, -Math.sin(t * 0.8) * 0.45, 0, 0.1);
}

const POSES = {
  idle(F, c) {
    if (c.inWater) { treadWater(F, c, 0.5); c.face = 'happy'; return; }
    const t = c.time + c.P.phase;
    idleBreath(F, c);
    const sway = Math.sin(t * 1.7);
    F.ap(B.hips, sway * 0.25, 0, 0);
    F.ar(B.hips, 0, 0, sway * 0.025);
    F.ar(B.spine, 0, 0, -sway * 0.035);
    F.ar(B.head, 0, 0, Math.sin(t * 1.7 + 0.8) * 0.045);
    // looking around
    const la = c.rig._look;
    F.ar(B.head, la.y * 0.5, la.x, 0);
    F.look(la.x * 2.2, la.y * 2);
    // fidgets every few seconds
    const fid = c.rig._fidget;
    if (fid.w > 0) {
      const w = fid.w;
      if (fid.kind === 'watch') {
        // check the wrist watch: it's almost 5 PM!
        F.aim(B.armL, -3.5, 15.5, 8.5, 0.2);
        F.ar(B.head, 0.35 * w, -0.35 * w, 0.1 * w);
        F.look(-1 * w, 1 * w);
        c.face = w > 0.6 ? 'smug' : c.face;
      } else if (fid.kind === 'pat') {
        const pat = Math.abs(Math.sin(c.time * 9));
        F.aim(B.armL, -3.2, 11.5 + pat * 1.2, 8.3 + c.bz, 0.5);
        F.aim(B.armR, 3.2, 11.5 + (1 - pat) * 1.2, 8.3 + c.bz, 0.5);
        F.mulS(B.belly, 1 + 0.03 * pat, 1 - 0.02 * pat, 1 + 0.03 * pat);
        c.face = 'happy';
      } else if (fid.kind === 'stretch') {
        F.aim(B.armL, -5, 30, 1, 0.3); F.aim(B.armR, 5, 30, 1, 0.3);
        F.sq(B.base, 1 + 0.06 * w);
        F.ar(B.head, -0.2 * w, 0, 0);
        c.face = 'sleepy';
      }
      // blend back to the idle arms when the fidget fades
      if (w < 1) {
        const o = c.restArms;
        for (const b of [B.armL, B.armR]) {
          const oo = b * CH;
          for (let k = 0; k < 9; k++) F.a[oo + k] = lerp(o[b === B.armL ? 0 : 1][k], F.a[oo + k], w);
        }
      }
    }
  },

  walk(F, c) {
    if (c.inWater) return POSES.swim(F, c);
    const amp = c.moveAmp;
    const s = Math.sin(c.phase), co = Math.cos(c.phase);
    gaitLegs(F, c, 0.62 * amp, 0.6 * amp);
    F.ar(B.armL, 0.5 * amp * s, 0, 0);
    F.ar(B.armR, -0.34 * amp * s, 0, 0);
    const bob = (1 - Math.abs(s)) * 0.9 * amp * c.P.bounce;
    F.ap(B.base, 0, bob, 0);
    F.sq(B.base, 1 + (bob - 0.45 * amp) * 0.035);
    F.ar(B.hips, 0, 0.1 * s * amp, 0.05 * s * amp);
    F.ar(B.spine, 0.06 * amp, -0.13 * s * amp, -0.04 * s * amp);
    F.ar(B.head, 0.04 * Math.cos(2 * c.phase - 0.6) * amp, 0.06 * s * amp, 0.05 * co * amp);
    F.r(B.tail, 0, 0, 0.3 * s * amp);
    idleBreath(F, c, 1 - amp);
    c.face = c.P.happyWalk ? 'happy' : 'neutral';
  },

  run(F, c) {
    if (c.inWater) return POSES.swim(F, c);
    const amp = Math.max(0.35, c.moveAmp);
    const s = Math.sin(c.phase), co = Math.cos(c.phase);
    const air = Math.abs(s); // 0 at contact, 1 mid-flight
    gaitLegs(F, c, 1.0 * amp, 1.8 * amp);
    // arms pump hard (opposite to legs), slightly out
    F.r(B.armL, 1.05 * amp * s - 0.25, 0, -0.26);
    F.r(B.armR, -1.05 * amp * s - 0.25, 0, 0.26);
    F.ap(B.armL, 0, 0.3 * air, 0.3); F.ap(B.armR, 0, 0.3 * air, 0.3);
    const hop = air * 2.6 * amp * c.P.bounce;
    F.ap(B.base, 0, hop, 0);
    // squash on contact, stretch in the air
    const contact = Math.pow(1 - air, 6);
    F.sq(B.base, 1 + 0.07 * air * amp - 0.13 * contact * amp);
    F.ar(B.hips, 0.12, 0.16 * s * amp, 0.05 * s * amp);
    F.ar(B.spine, 0.2 * amp, -0.2 * s * amp, -0.04 * s * amp);
    F.ar(B.head, -0.2 * amp + 0.07 * Math.cos(2 * c.phase - 0.9), 0.1 * s * amp, 0.06 * co * amp);
    F.r(B.tail, 0.3, 0, 0.5 * s);
    F.a[X_PROPSPIN] = 22;
    c.face = c.P.runFace;
  },

  swim(F, c) {
    // dog paddle: only the top half pokes out of the water
    const pace = 0.6 + Math.min(1, c.speed / 2.2) * 0.8;
    const t = c.swimT;
    const bob = Math.sin(t * 2) * 0.6;
    F.ap(B.base, 0, bob, 0);
    F.ar(B.spine, 0.18, 0, Math.sin(t) * 0.05);
    F.ar(B.hips, 0.1, 0, 0);
    F.ar(B.head, -0.2 + Math.sin(t * 2 + 0.6) * 0.05, Math.sin(t) * 0.06, -Math.sin(t) * 0.05);
    for (const [b, sx, ph] of [[B.armL, -1, 0], [B.armR, 1, Math.PI]]) {
      const a = t * 1.0 + ph;
      F.aim(b, sx * 5.4, 14.2 + Math.sin(a) * 2.4, 7.8 + Math.cos(a) * 3.2, 0.5);
    }
    F.r(B.legL, Math.sin(t * 1.3) * 0.7 - 0.3, 0, -0.1);
    F.r(B.legR, -Math.sin(t * 1.3) * 0.7 - 0.3, 0, 0.1);
    F.r(B.tail, 0, 0, Math.sin(t * 2) * 0.4);
    c.face = c.P.swimFace;
    void pace;
  },

  cannonball(F, c) {
    const t = c.t01;
    // 0..0.14 launch stretch, then tucked ball + spin, stays tucked into the splash
    const tuck = smooth(0.08, 0.26, t);
    const launch = 1 - smooth(0.0, 0.2, t);
    F.sq(B.base, lerp(1.16, 0.92, tuck) * (1 - 0.0 * launch));
    // arms: up for the leap, then hug the knees
    const upL = [-5, 30, 2], upR = [5, 30, 2];
    const hugL = [-3, 9.5, 8], hugR = [3, 9.5, 8];
    F.aim(B.armL, lerp(upL[0], hugL[0], tuck), lerp(upL[1], hugL[1], tuck), lerp(upL[2], hugL[2], tuck), 0.3);
    F.aim(B.armR, lerp(upR[0], hugR[0], tuck), lerp(upR[1], hugR[1], tuck), lerp(upR[2], hugR[2], tuck), 0.3);
    F.r(B.legL, -1.75 * tuck, 0, -0.1 * tuck);
    F.r(B.legR, -1.75 * tuck, 0, 0.1 * tuck);
    F.ap(B.legL, 0, 1.2 * tuck, 1.5 * tuck); F.ap(B.legR, 0, 1.2 * tuck, 1.5 * tuck);
    F.ap(B.hips, 0, 1.6 * tuck, 0);
    F.ar(B.spine, 0.45 * tuck, 0, 0);
    F.ar(B.head, 0.35 * tuck - 0.25 * launch, 0, 0);
    F.ap(B.head, 0, -0.8 * tuck, 0.6 * tuck);
    F.r(B.tail, 0.6 * tuck, 0, 0);
    const spinK = smooth(0.14, 0.9, t);
    const style = c.params.flip ?? c.P.flip;
    if (style === 'flip' || style === true) F.spinAbout(0, 12, 1, spinK * Math.PI * 2, 0, 0);
    else if (style === 'twirl') F.spinAbout(0, 12, 1, 0.35 * tuck, spinK * Math.PI * 2, 0);
    else F.spinAbout(0, 12, 1, 0.5 * tuck + Math.sin(t * 20) * 0.08 * tuck, 0, Math.sin(t * 14) * 0.18 * tuck);
    c.face = t < 0.16 ? 'cheer' : 'chomp_closed';
  },

  lunge(F, c) {
    const t = c.t01;
    const k = Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5);
    const back = smooth(0.75, 1, t);
    const e = k * (1 - back * 0.6);
    F.r(B.base, 0, 0, 0);
    F.ap(B.base, 0, Math.sin(Math.min(1, t) * Math.PI) * 2.2, 2.5 * e);
    F.s(B.base, 1 / Math.sqrt(1 + 0.12 * e), 1 - 0.04 * e, 1 + 0.16 * e);
    F.ar(B.hips, 0.3 * e, 0, 0);
    F.ar(B.spine, 0.5 * e, 0, 0);
    F.ar(B.head, -0.45 * e, 0, 0);
    F.aim(B.armL, -3.5, 16, 15, 0.8 * e);
    F.aim(B.armR, 3.5, 16, 15, 0.8 * e);
    F.r(B.legL, 0.7 * e, 0, 0); F.r(B.legR, 0.95 * e, 0, 0);
    F.r(B.tail, 0.5 * e, 0, 0);
    c.face = t < 0.2 ? 'hungry' : 'chomp_open';
    F.jaw(0.3 + 0.7 * e);
  },

  grab(F, c) {
    const t = c.t01;
    const reach = smooth(0, 0.35, t) * (1 - smooth(0.35, 0.6, t));
    const clutch = smooth(0.4, 0.62, t);
    F.ar(B.spine, 0.35 * reach - 0.06 * clutch, 0, 0);
    F.ar(B.head, 0.12 * reach - 0.06 * clutch, 0, 0);
    // reach forward & down, then clutch to the chest (where eat holds it)
    const hx = 0, hy = lerp(11, 18.3 + c.hy, clutch), hz = lerp(14 + c.bz, 9.9 + c.bz + c.hz, clutch);
    F.hold(hx, hy, hz);
    F.ap(B.armL, 1.4 * clutch, 0.5 * clutch, 2.4 * clutch); F.ap(B.armR, -1.4 * clutch, 0.5 * clutch, 2.4 * clutch);
    const spread = lerp(4.2, 3.1, clutch);
    F.aim(B.armL, hx - spread, hy - 0.3, hz - 0.4, 0.8);
    F.aim(B.armR, hx + spread, hy - 0.3, hz - 0.4, 0.8);
    const pop = smooth(0.42, 0.55, t) * (1 - smooth(0.55, 0.85, t));
    F.sq(B.base, 1 - 0.1 * pop);
    F.r(B.legL, 0.2 * reach, 0, 0); F.r(B.legR, -0.1 * reach, 0, 0);
    c.face = t < 0.45 ? 'excited' : 'hungry';
    F.look(0, 1);
  },

  eat(F, c) {
    const D = POSE_DURATION.eat;
    const t = c.t01 * D;
    const bites = [0.42, 0.8, 1.2];
    const wind = [0.22, 0.2, 0.28];
    let open = 0, nod = 0, squash = 0, chew = 0, n = 0;
    for (let i = 0; i < 3; i++) {
      const tb = bites[i], w0 = tb - wind[i];
      if (t >= tb) n = i + 1;
      if (t >= w0 && t < tb) {
        const k = (t - w0) / wind[i];
        open = Math.max(open, easeOut(k));
        nod = Math.min(nod, -easeOut(k) * (i === 2 ? 1.3 : 1));
      } else if (t >= tb && t < tb + 0.2) {
        const k = (t - tb) / 0.2;
        const snap = 1 - smooth(0, 1, k);
        nod = Math.max(nod, Math.sin(Math.min(1, k * 2.2) * Math.PI) * (i === 2 ? 1.4 : 1) * (1 - k * 0.5));
        squash = Math.max(squash, snap * (i === 2 ? 1.35 : 1));
        chew = 1;
      } else if (t >= tb + 0.2) chew = Math.max(chew, 0.6);
    }
    c.rig._setChomps(n);
    c.rig.prey.eat = Math.min(0.66, n * 0.22); c.rig.prey.wiggle = 1.4 - n * 0.4;
    const raise = smooth(0, 0.18, t);
    // hold the fish right under the mouth; it hops up into each bite
    const hy = lerp(15.5, 18.3 + c.hy, raise) + nod * 0.5 + squash * 0.8;
    const hz = 9.9 + squash * 0.3 + c.bz + c.hz;
    F.hold(0, hy, hz);
    F.ap(B.armL, 1.5, 0.6, 2.6); F.ap(B.armR, -1.5, 0.6, 2.6);
    F.aim(B.armL, -3.1, hy - 0.3, hz - 0.5, 0.9);
    F.aim(B.armR, 3.1, hy - 0.3, hz - 0.5, 0.9);
    // head: lean back to open, then CHOMP down onto the fish
    F.ar(B.head, 0.1 - 0.22 * -nod * (nod < 0 ? 1 : 0) + 0.3 * Math.max(0, nod), 0, 0);
    if (nod < 0) F.ar(B.head, 0.22 * nod, 0, 0);
    const wob = chew * Math.sin(t * 38) * 0.07 * (1 - smooth(1.3, 1.4, t));
    F.ar(B.head, 0, wob, wob * 0.6);
    F.mulS(B.head, 1 - 0.05 * open + 0.04 * squash, 1 + 0.08 * open - 0.1 * squash, 1 - 0.03 * open + 0.03 * squash);
    F.sq(B.base, 1 + 0.05 * open - 0.12 * squash);
    F.ar(B.spine, 0.04 - 0.06 * open + 0.1 * squash, 0, 0);
    F.ar(B.hips, 0, 0, Math.sin(t * 12) * 0.02);
    // ears perk up on the windup
    F.r(B.earL, -0.2 * open, 0, 0.15 * open); F.r(B.earR, -0.2 * open, 0, -0.15 * open);
    // a happy tippy-toe on the big last bite
    if (t > 1.0 && t < 1.32) F.ap(B.base, 0, Math.sin((t - 1.0) / 0.32 * Math.PI) * 1.2, 0);
    F.r(B.tail, 0, 0, Math.sin(t * 16) * 0.35);
    F.jaw(open * 1.0);
    const inWind = open > 0.05;
    c.face = t < bites[0] - wind[0] ? 'hungry' : inWind ? 'chomp_open' : 'chomp_closed';
    F.look(0, 1);
  },

  yummy(F, c) {
    const t = c.t01 * POSE_DURATION.yummy;
    const w = 2 * Math.PI * 2.4;
    const hop = Math.max(0, Math.sin(Math.min(1, t / 0.32) * Math.PI));
    F.ap(B.base, 0, hop * 1.6, 0);
    F.sq(B.base, 1 + 0.08 * hop - 0.1 * (t < 0.06 ? 1 - t / 0.06 : 0));
    const wig = Math.sin(t * w * 0.5);
    F.ar(B.hips, 0, 0.1 * wig, 0.1 * wig);
    F.ar(B.spine, -0.08, -0.08 * wig, -0.09 * wig);
    F.ar(B.head, -0.1, 0.1 * wig, 0.2 * Math.sin(t * w * 0.5 + 0.7));
    // rub the tummy in circles with both paws
    const a = t * w;
    F.aim(B.armR, 2.2 + Math.cos(a) * 1.8, 12.2 + Math.sin(a) * 1.8, 8.6 + c.bz, 0.7);
    F.aim(B.armL, -2.2 - Math.cos(a + 1.2) * 1.6, 12.2 + Math.sin(a + 1.2) * 1.6, 8.6 + c.bz, 0.7);
    F.mulS(B.belly, 1 + 0.035 * Math.sin(a * 2), 1 - 0.025 * Math.sin(a * 2), 1 + 0.04 * Math.sin(a * 2));
    F.r(B.tail, 0, 0, Math.sin(t * 30) * 0.6);
    F.r(B.earL, 0, 0, 0.12 * wig); F.r(B.earR, 0, 0, 0.12 * wig);
    c.rig.prey.eat = 0.66; c.rig.prey.wiggle = 0;
    c.face = 'yummy';
  },

  toss(F, c) {
    const t = c.t01;
    // wind up in front, flick over the right shoulder, release at ~0.5
    const k1 = smooth(0, 0.42, t), k2 = smooth(0.42, 0.62, t), k3 = smooth(0.7, 1, t);
    const ax = lerp(lerp(4, 7, k1), 5, k2), ay = lerp(lerp(14, 25, k1), 27, k2), az = lerp(lerp(9, 6, k1), -6, k2);
    F.aim(B.armR, lerp(ax, 9, k3), lerp(ay, 8.5, k3), lerp(az, 1, k3), 0.6);
    F.aim(B.armL, -6, 14 + 2 * k1 * (1 - k3), 7 * (1 - k3), 0.3);
    F.ar(B.spine, -0.12 * k1 + 0.18 * k2 * (1 - k3), 0.25 * k1 - 0.45 * k2 * (1 - k3), 0);
    F.ar(B.head, -0.05, -0.35 * (k1 + k2) * (1 - k3), 0.12 * k2 * (1 - k3));
    F.sq(B.base, 1 + 0.05 * k1 - 0.08 * k2 * (1 - k3));
    F.look(-1.5 * (1 - k3), 0);
    c.face = 'smug';
    if (t >= 0.5) c.rig._event('release');
  },

  pay(F, c) {
    const t = c.t01;
    const brief = c.rig.itemName === 'briefcase';
    const out = smooth(0.0, 0.18, t) * (1 - smooth(0.8, 0.95, t));
    if (brief) {
      // briefcase up in front, pop it open, coins fly out
      F.a[X_ITEMRIGID] = 1;
      F.aim(B.armR, 2.8, 14.5, 9.2, 0.8);
      F.aim(B.armL, -3.2, 14.5, 9.2, 0.8);
      if (out < 1) {
        const o = c.restArms;
        for (const [b, i] of [[B.armL, 0], [B.armR, 1]]) {
          const oo = b * CH;
          for (let k = 0; k < 9; k++) F.a[oo + k] = lerp(o[i][k], F.a[oo + k], out);
        }
      }
      F.r(B.item, 0, -Math.PI / 2 * out, 0.6 * out);
      F.r(B.lid, 0, 0, -1.9 * smooth(0.16, 0.24, t) * (1 - smooth(0.62, 0.7, t)));
      if (t >= 0.2) c.rig._event('coins');
    } else {
      // wallet from the back pocket, flick coins with the other paw
      const k1 = smooth(0, 0.14, t), k2 = smooth(0.14, 0.28, t), k3 = smooth(0.72, 0.9, t);
      F.aim(B.armL, lerp(lerp(-8.6, -6, k1), -3, k2 * (1 - k3)), lerp(lerp(8.5, 9, k1), 14.5, k2 * (1 - k3)), lerp(lerp(1, -5, k1), 9, k2 * (1 - k3)), 0.8);
      const fl = smooth(0.3, 0.36, t) * (1 - smooth(0.42, 0.55, t));
      F.aim(B.armR, 2, lerp(13, 20, fl), lerp(9, 8, fl), 0.7 * k2 * (1 - k3));
      if (t < 0.28 || t > 0.9) {
        const o = c.restArms;
        const w = t < 0.28 ? k2 : 1 - k3;
        const oo = B.armR * CH;
        for (let k = 0; k < 9; k++) F.a[oo + k] = lerp(o[1][k], F.a[oo + k], w);
      }
      const show = t > 0.1 && t < 0.86 ? 1 : 0;
      F.s(B.wallet, show, show, show);
      if (t >= 0.3) c.rig._event('coins');
    }
    // coins pop up in little arcs
    for (let i = 0; i < 3; i++) {
      const t0 = (brief ? 0.2 : 0.32) + i * 0.07;
      const k = (t - t0) / 0.4;
      const b = B.coin0 + i;
      if (k <= 0 || k >= 1) { F.s(b, HIDE, HIDE, HIDE); continue; }
      const sx = (i - 1) * 3.2;
      F.p(b, sx * k + (brief ? 0 : -3), 13 * k - 16 * k * k + (brief ? 2 : 1.5), 2 * k);
      F.r(b, 0, k * 18 + i, 0);
      F.s(b, 1, 1, 1);
    }
    F.ar(B.head, 0.12 * out, 0, 0.06 * Math.sin(t * 20) * out);
    F.sq(B.base, 1 - 0.06 * smooth(0.18, 0.24, t) * (1 - smooth(0.24, 0.4, t)));
    F.look(0, 1);
    c.face = t > 0.2 && t < 0.7 ? 'happy' : t >= 0.7 ? 'smug' : 'happy';
  },

  angry_stomp(F, c) {
    const t = c.time;
    const moving = c.moveAmp > 0.1;
    const ph = moving ? c.phase : t * Math.PI * 2 * 1.7;
    const s = Math.sin(ph);
    const liftL = Math.max(0, s), liftR = Math.max(0, -s);
    F.r(B.legL, -0.95 * liftL, 0, -0.08); F.r(B.legR, -0.95 * liftR, 0, 0.08);
    F.ap(B.legL, 0, 1.2 * liftL, 0); F.ap(B.legR, 0, 1.2 * liftR, 0);
    const up = Math.max(liftL, liftR);
    F.ap(B.base, 0, up * 1.3, 0);
    F.sq(B.base, 1 + 0.05 * up - 0.12 * Math.pow(1 - up, 8));
    F.ar(B.hips, 0, 0, 0.08 * s);
    F.ar(B.spine, 0.14, 0, -0.06 * s);
    // fists up and shaking
    const shake = Math.sin(t * 34);
    F.aim(B.armL, -8, 21 + Math.sin(t * 13) * 1.4, 7, 0.4);
    F.aim(B.armR, 8, 21 - Math.sin(t * 13) * 1.4, 7, 0.4);
    F.ar(B.armL, 0, 0, shake * 0.05); F.ar(B.armR, 0, 0, -shake * 0.05);
    F.ar(B.head, 0.1, Math.sin(t * 17) * 0.09, 0);
    F.ap(B.head, 0, 0, 0.6);
    // steam puffs out of the ears
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.6 + i / 3) % 1;
      const b = B.steam0 + i;
      const side = i === 0 ? -1 : i === 1 ? 1 : 0;
      F.p(b, side * (1 + k * 2.5), k * 6, 0);
      const sc = Math.sin(k * Math.PI) * (1.1 - k * 0.3);
      F.s(b, sc, sc, sc);
    }
    F.r(B.earL, 0.15, 0, -0.1); F.r(B.earR, 0.15, 0, 0.1);
    c.face = 'furious';
  },

  smash(F, c) {
    const t = c.t01;
    const wind = smooth(0, 0.42, t) * (1 - smooth(0.42, 0.5, t));
    const hit = smooth(0.42, 0.5, t) * (1 - smooth(0.72, 1, t));
    const shakeK = t > 0.5 && t < 0.75 ? Math.sin(t * 90) * 0.03 : 0;
    // fists together overhead, then SLAM
    const ux = 1.6, uy = 31, uz = -3.5, dx = 1.6, dy = 4, dz = 13;
    const k = hit / Math.max(1e-3, hit + wind);
    const ax = lerp(ux, dx, k), ay = lerp(uy, dy, k), az = lerp(uz, dz, k);
    const any = Math.max(wind, hit);
    F.aim(B.armL, -ax, ay, az, 0.8 * any);
    F.aim(B.armR, ax, ay, az, 0.8 * any);
    if (any < 1) {
      const o = c.restArms;
      for (const [b, i] of [[B.armL, 0], [B.armR, 1]]) {
        const oo = b * CH;
        for (let j = 0; j < 9; j++) F.a[oo + j] = lerp(o[i][j], F.a[oo + j], any);
      }
    }
    F.ar(B.spine, -0.3 * wind + 0.55 * hit, 0, shakeK);
    F.ar(B.hips, -0.08 * wind + 0.2 * hit, 0, 0);
    F.ar(B.head, -0.25 * wind + 0.2 * hit, 0, 0);
    F.sq(B.base, 1 + 0.12 * wind - 0.2 * hit);
    F.r(B.legL, 0.2 * hit, 0, -0.18 * hit); F.r(B.legR, -0.1 * hit, 0, 0.18 * hit);
    c.face = t < 0.46 ? 'angry' : 'furious';
    if (t >= 0.5) c.rig._event('slam');
  },

  search(F, c) {
    const moving = c.moveAmp > 0.05;
    if (moving) {
      gaitLegs(F, c, 0.45 * c.moveAmp, 0.4 * c.moveAmp);
      F.ap(B.base, 0, (1 - Math.abs(Math.sin(c.phase))) * 0.6 * c.moveAmp, 0);
    } else idleBreath(F, c);
    const T = 2.6;
    const cyc = (c.t / T) % 2;
    const scratch = smooth(0.85, 1.05, cyc) * (1 - smooth(1.85, 2.0, cyc));
    const shade = 1 - scratch;
    // A: paw at the brow, looking left and right
    const look = Math.sin(c.t / T * Math.PI * 2);
    const la = [8.5, 26.5, 6.2];
    const sh = [...c.restArms[1]];
    F.aim(B.armR, la[0], la[1], la[2], 0.6);
    const oo = B.armR * CH;
    for (let k = 0; k < 9; k++) F.a[oo + k] = lerp(sh[k], F.a[oo + k], shade);
    F.ar(B.head, -0.08 * shade, 0.55 * look * shade, 0.08 * look * shade);
    F.ar(B.spine, 0.06, 0.18 * look * shade, 0);
    // B: puzzled head scratch
    if (scratch > 0) {
      const scr = Math.sin(c.t * 28) * 0.9;
      const ol = [...F.a.slice(B.armL * CH, B.armL * CH + 9)];
      F.aim(B.armL, -9.2, 26.6 + scr, 1.5, 0.6);
      const oL = B.armL * CH;
      for (let k = 0; k < 9; k++) F.a[oL + k] = lerp(ol[k], F.a[oL + k], scratch);
      F.ar(B.head, -0.05 * scratch, -0.15 * scratch, -0.2 * scratch);
    }
    F.look(look * 2 * shade + 0.8 * scratch, -0.8 * scratch);
    c.face = scratch > 0.5 ? 'sad' : 'neutral';
  },

  cheer(F, c) {
    const t = c.t + c.P.phase * 0.1;
    const f = 2.3;
    const hopS = Math.abs(Math.sin(t * Math.PI * f));
    F.ap(B.base, 0, hopS * 3.6 * c.P.bounce, 0);
    const contact = Math.pow(1 - hopS, 6);
    F.sq(B.base, 1 + 0.08 * hopS - 0.16 * contact);
    const wav = Math.sin(t * Math.PI * f * 2);
    F.aim(B.armL, -10.5 + wav, 27, 2.5, 0.4);
    F.aim(B.armR, 10.5 - wav, 27, 2.5, 0.4);
    F.ar(B.head, -0.15, 0, Math.sin(t * Math.PI * f) * 0.1);
    F.r(B.legL, -0.3 * hopS, 0, -0.12 * hopS); F.r(B.legR, -0.3 * hopS, 0, 0.12 * hopS);
    F.r(B.tail, 0, 0, Math.sin(t * 25) * 0.5);
    F.a[X_PROPSPIN] = 14;
    c.face = 'cheer';
  },

  talk(F, c) {
    const t = c.t;
    idleBreath(F, c);
    const g = t * 3.2;
    F.aim(B.armR, 9.5 + Math.sin(g) * 1.8, 14.5 + Math.cos(g * 1.3) * 2.2, 7.5, 0.5);
    const g2 = Math.max(0, Math.sin(t * 1.3));
    F.aim(B.armL, -9 - g2 * 1.5, 11 + g2 * 5, 3 + g2 * 4, 0.3);
    F.ar(B.head, 0.07 * Math.sin(t * 13.5), 0.12 * Math.sin(t * 1.1), 0.08 * Math.sin(t * 1.7));
    F.ar(B.spine, 0, 0.06 * Math.sin(t * 1.1), 0.04 * Math.sin(t * 1.7));
    F.jaw(0.5 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 2.3)));
    c.face = 'happy';
  },

  sad(F, c) {
    const moving = c.moveAmp > 0.05;
    const amp = c.moveAmp * 0.6;
    if (moving) {
      gaitLegs(F, c, 0.4 * amp, 0.2 * amp);
      F.ar(B.armL, 0.2 * amp * Math.sin(c.phase), 0, 0.08);
      F.ar(B.armR, -0.2 * amp * Math.sin(c.phase), 0, -0.08);
      F.ap(B.base, 0, (1 - Math.abs(Math.sin(c.phase))) * 0.35 * amp, 0);
    }
    const sigh = Math.pow(Math.max(0, Math.sin(c.t * 1.9)), 8);
    F.ar(B.spine, 0.3 - 0.1 * sigh, 0, 0);
    F.ar(B.head, 0.38 - 0.12 * sigh, 0, 0.06 * Math.sin(c.t * 0.9));
    F.ap(B.armL, 0, -0.9, 0); F.ap(B.armR, 0, -0.9, 0);
    F.r(B.earL, -0.3, 0, 0.55); F.r(B.earR, -0.3, 0, -0.55);
    F.r(B.tail, -0.4, 0, 0);
    F.sq(B.base, 0.97 + 0.03 * sigh);
    F.look(0, 1);
    c.face = 'sad';
  },

  wave(F, c) {
    const t = c.t;
    idleBreath(F, c);
    const w = Math.sin(t * Math.PI * 2 * 1.9);
    F.aim(B.armL, -11 - w * 2.2, 25, 3.5, 0.5);
    F.ar(B.armL, 0, 0, -0.1 * w);
    F.ar(B.spine, 0, 0, 0.06);
    F.ar(B.head, -0.05, -0.15, -0.14 + 0.05 * w);
    const bounce = Math.abs(Math.sin(t * Math.PI * 1.9));
    F.ap(B.base, 0, bounce * 0.6, 0);
    F.r(B.tail, 0, 0, Math.sin(t * 20) * 0.4);
    c.face = 'happy';
  },

  sit(F, c) {
    const t = c.t;
    F.ap(B.base, 0, -4.9, 0.8);
    F.r(B.legL, -1.5, 0.12, -0.14); F.r(B.legR, -1.5, -0.12, 0.14);
    F.ap(B.legL, 0, 0.6, 0.5); F.ap(B.legR, 0, 0.6, 0.5);
    F.ar(B.hips, -0.12, 0, 0);
    F.ar(B.spine, -0.12, 0, 0.03 * Math.sin(t * 0.9));
    const br = Math.sin(t * 1.8);
    F.mulS(B.belly, 1.07 + 0.03 * br, 1.05 + 0.02 * br, 1.1 + 0.04 * br);
    const pat = Math.max(0, Math.sin(t * 5.5));
    const pat2 = Math.max(0, Math.sin(t * 5.5 + 2.2));
    F.aim(B.armL, -3.8, 11 + pat * 1.4, 8.8 + c.bz, 0.6);
    F.aim(B.armR, 3.8, 11 + pat2 * 1.4, 8.8 + c.bz, 0.6);
    F.ar(B.head, 0.04 + 0.03 * br, 0, 0.08 * Math.sin(t * 0.8));
    F.r(B.tail, 0, 0, 0);
    F.s(B.tail, 1, 0.6, 1);
    const sleepy = (t % 7) > 3.5;
    c.face = sleepy ? 'sleepy' : 'happy';
  },
};


// ------------------------------------------------------------------ boss poses
// (usable by every bear, tuned for the big ones)
function blendRest(F, c, w, which = 3) {
  if (w >= 1) return;
  for (const [b, i] of [[B.armL, 0], [B.armR, 1]]) {
    if (!(which & (i + 1))) continue;
    const oo = b * CH, o = c.restArms[i];
    for (let k = 0; k < 9; k++) F.a[oo + k] = lerp(o[k], F.a[oo + k], w);
  }
}

// rear back, chest out, arms flung wide, head forward, jaw HUGE (k = 0..1)
function roarBody(F, c, k, t) {
  if (k <= 0) return;
  const tr = Math.sin(t * 47) * 0.022 * k, tr2 = Math.sin(t * 31 + 1) * 0.028 * k;
  F.ar(B.spine, -0.4 * k + tr, tr2, 0);
  F.ar(B.hips, -0.12 * k, 0, 0);
  F.mulS(B.spine, 1 + 0.05 * k, 1 + 0.03 * k, 1 + 0.1 * k);
  F.mulS(B.belly, 1 + 0.04 * k, 1, 1 + 0.07 * k);
  F.ar(B.head, 0.12 * k + Math.sin(t * 23) * 0.05 * k, Math.sin(t * 6.5) * 0.14 * k, Math.sin(t * 17) * 0.05 * k);
  F.ap(B.head, 0, 0.2 * k, 1.1 * k);
  const big = c.rig.isBoss ? 1.6 : 1;
  F.mulS(B.jaw, 1 + 0.18 * k * big, 1 + 0.25 * k * big, 1 + 0.22 * k * big);
  F.mulS(B.head, 1 + 0.03 * k, 1 + 0.05 * k, 1);
  const sh = Math.sin(t * 13) * 0.8 * k;
  F.aim(B.armL, -15, 21.5 + sh, 6.5, 0.5);
  F.aim(B.armR, 15, 21.5 - sh, 6.5, 0.5);
  blendRest(F, c, k);
  F.r(B.earL, 0.55 * k, 0, 0.35 * k); F.r(B.earR, 0.55 * k, 0, -0.35 * k);
  F.ap(B.base, 0, 0.5 * k, -0.6 * k);
  F.r(B.tail, 0.5 * k, 0, Math.sin(t * 30) * 0.3 * k);
  F.jaw(1.3 * k);
}

Object.assign(POSES, {
  roar(F, c) {
    const t = c.t01 * POSE_DURATION.roar;
    idleBreath(F, c, 0.5);
    // anticipation: hunch in, head down, fists in
    const a = smooth(0, 0.32, t) * (1 - smooth(0.34, 0.48, t));
    F.ar(B.spine, 0.28 * a, 0, 0);
    F.ar(B.head, 0.3 * a, 0, 0);
    F.sq(B.base, 1 - 0.08 * a);
    F.aim(B.armL, -4.5, 12, 8 + c.bz, 0.6); F.aim(B.armR, 4.5, 12, 8 + c.bz, 0.6);
    blendRest(F, c, a);
    const k = smooth(0.32, 0.46, t) * (1 - smooth(1.18, 1.5, t));
    if (k > 0) roarBody(F, c, easeOutBack(Math.min(1, k)), c.time);
    c.face = t < 0.38 ? 'angry' : t < 1.3 ? 'roar' : 'angry';
    if (t >= 0.42) c.rig._event('roar');
  },

  slam(F, c) {
    const t = c.t01 * POSE_DURATION.slam;
    const up = smooth(0, 0.42, t), down = smooth(0.42, 0.52, t), rec = smooth(0.8, 1.15, t);
    const hi = up * (1 - down), lo = down * (1 - rec);
    // both paws overhead, then down into the dirt in front
    const ux = 3.2, uy = 32.5, uz = -2.5, dx = 4.8, dy = 0.5, dz = 12.5 + c.bz;
    F.aim(B.armL, -lerp(ux, dx, down), lerp(uy, dy, down), lerp(uz, dz, down), 0.9);
    F.aim(B.armR, lerp(ux, dx, down), lerp(uy, dy, down), lerp(uz, dz, down), 0.9);
    blendRest(F, c, up * (1 - rec));
    const shake = t > 0.52 && t < 0.82 ? Math.sin(t * 95) * 0.035 * (1 - (t - 0.52) / 0.3) : 0;
    F.ar(B.spine, -0.36 * hi + 0.62 * lo + shake, 0, shake);
    F.ar(B.hips, -0.06 * hi + 0.16 * lo, 0, 0);
    F.ar(B.head, -0.3 * hi - 0.42 * lo, 0, 0);
    F.ap(B.base, 0, 1.6 * hi - 1.8 * lo, 1.0 * lo);
    F.sq(B.base, 1 + 0.1 * hi - 0.12 * lo);
    F.r(B.legL, 0.55 * lo, 0, -0.3 * lo); F.r(B.legR, 0.55 * lo, 0, 0.3 * lo);
    F.ap(B.legL, 0, 0.4 * hi, 0); F.ap(B.legR, 0, 0.4 * hi, 0);
    F.r(B.earL, 0.4 * lo, 0, 0.2 * lo); F.r(B.earR, 0.4 * lo, 0, -0.2 * lo);
    F.jaw(0.2 * hi + 0.9 * lo);
    c.face = t < 0.44 ? 'angry' : t < 0.85 ? 'furious' : 'angry';
    if (t >= 0.5) c.rig._event('slam');
  },

  charge(F, c) {
    const amp = Math.max(0.5, c.moveAmp);
    const s = Math.sin(c.phase), co = Math.cos(c.phase);
    const air = Math.abs(s);
    gaitLegs(F, c, 1.15 * amp, 2.1 * amp);
    // big forward lean, arms pumping low like a galloping bear
    F.r(B.armL, 1.3 * amp * s - 0.75, 0, -0.34);
    F.r(B.armR, -1.3 * amp * s - 0.75, 0, 0.34);
    F.ap(B.armL, 0, 0.3 * air, 0.6); F.ap(B.armR, 0, 0.3 * air, 0.6);
    const hop = air * 2.3 * amp * c.P.bounce;
    F.ap(B.base, 0, hop - 0.6, 0.9 * Math.sin(2 * c.phase) * amp);
    const contact = Math.pow(1 - air, 6);
    F.sq(B.base, 1 + 0.06 * air * amp - 0.17 * contact * amp);
    F.ar(B.hips, 0.22 * amp, 0.15 * s * amp, 0.05 * s * amp);
    F.ar(B.spine, 0.5 * amp, -0.18 * s * amp, -0.05 * s * amp);
    F.ar(B.head, -0.38 * amp + 0.08 * Math.cos(2 * c.phase - 0.9), 0.08 * s * amp, 0.06 * co * amp);
    F.ap(B.head, 0, -0.3, 0.6);
    F.r(B.earL, 0.45, 0, 0.25); F.r(B.earR, 0.45, 0, -0.25);
    F.r(B.tail, 0.4, 0, 0.5 * s);
    F.jaw(0.55 + 0.25 * air);
    F.a[X_PROPSPIN] = 30;
    c.face = 'furious';
  },

  stagger(F, c) {
    const t = c.t01 * POSE_DURATION.stagger;
    const hk = smooth(0, 0.05, t) * (1 - smooth(0.08, 0.55, t));
    const wob = Math.exp(-3.6 * t) * Math.sin(t * 15);
    F.ar(B.spine, -0.45 * hk + 0.06 * wob, 0.12 * wob, 0.16 * wob);
    F.ar(B.hips, -0.1 * hk, 0, -0.06 * wob);
    F.ar(B.head, -0.45 * hk, 0.3 * wob, -0.24 * wob);
    F.ap(B.base, 0.6 * wob, 0, -2.2 * hk - 0.5 * (1 - smooth(0.4, 0.9, t)));
    F.ar(B.base, 0, 0, 0.1 * wob);
    const w = smooth(0, 0.06, t) * (1 - smooth(0.55, 0.9, t));
    F.aim(B.armL, -12, 20 + 4 * Math.sin(t * 21), 4.5, 0.5);
    F.aim(B.armR, 12, 18 - 4 * Math.sin(t * 21 + 1), 5.5, 0.5);
    blendRest(F, c, w);
    F.r(B.legL, 0.5 * hk - 0.15 * wob, 0, -0.1); F.r(B.legR, -0.35 * hk + 0.15 * wob, 0, 0.1);
    F.sq(B.base, 1 - 0.1 * hk);
    F.r(B.earL, -0.2, 0, 0.5 * wob); F.r(B.earR, -0.2, 0, 0.5 * wob);
    F.look(2 * Math.sin(t * 9), 0);
    c.face = t < 0.22 ? 'shocked' : 'dizzy';
  },

  calm(F, c) {
    // satisfied: plop down, lean back, pat the full belly
    const t = c.t;
    const plop = smooth(0.15, 0.32, t) * (1 - smooth(0.32, 0.6, t));
    F.ap(B.base, 0, -4.9, 0.8);
    F.sq(B.base, 1 - 0.1 * plop);
    F.r(B.legL, -1.45, 0.3, -0.24); F.r(B.legR, -1.45, -0.3, 0.24);
    F.ap(B.legL, 0, 0.6, 0.5); F.ap(B.legR, 0, 0.6, 0.5);
    const sighT = (t + c.P.phase) % 5.2, sigh = Math.sin(clamp(sighT / 1.6, 0, 1) * Math.PI);
    const sway = Math.sin(t * 0.9);
    F.ar(B.hips, -0.16, 0, 0);
    F.ar(B.spine, -0.2 - 0.08 * sigh, 0, 0.05 * sway);
    const br = Math.sin(t * 1.6);
    F.mulS(B.belly, 1.1 + 0.03 * br + 0.06 * sigh, 1.06 + 0.02 * br, 1.12 + 0.04 * br + 0.07 * sigh);
    const pL = Math.max(0, Math.sin(t * 4.4)), pR = Math.max(0, Math.sin(t * 4.4 + Math.PI));
    const patting = 1 - sigh * 0.8;
    F.aim(B.armL, -3.6, 11.4 + pL * 1.8 * patting, 9 + c.bz, 0.6);
    F.aim(B.armR, 3.6, 11.4 + pR * 1.8 * patting, 9 + c.bz, 0.6);
    F.ar(B.head, -0.06 - 0.18 * sigh, 0, 0.12 * Math.sin(t * 0.7));
    F.r(B.tail, 0, 0, 0); F.s(B.tail, 1, 0.6, 1);
    F.r(B.earL, 0, 0, 0.15 * sway); F.r(B.earR, 0, 0, 0.15 * sway);
    if (pL > 0.95 || pR > 0.95) c.rig._event('pat', true);
    c.face = 'content';
  },

  boss_intro(F, c) {
    const t = c.t01 * POSE_DURATION.boss_intro;
    idleBreath(F, c);
    // A: hunched low...
    const low = 1 - smooth(0.3, 0.62, t);
    F.ar(B.spine, 0.5 * low, 0, 0);
    F.ar(B.head, 0.45 * low, 0, 0);
    F.ap(B.base, 0, -1.4 * low, 0);
    F.sq(B.base, 1 - 0.08 * low + 0.1 * smooth(0.4, 0.55, t) * (1 - smooth(0.55, 0.75, t)));
    // C: double-biceps flex with pumps
    const w1 = smooth(0.5, 0.72, t) * (1 - smooth(1.25, 1.4, t));
    const pump = Math.max(0, Math.sin((t - 0.72) * Math.PI * 2 * 2.2)) * w1;
    // D: "most muscular" crunch
    const w2 = smooth(1.3, 1.45, t) * (1 - smooth(1.68, 1.82, t));
    const mw = w2 / Math.max(1e-3, w1 + w2);
    const ax = lerp(15.5, 4.6, mw), ay = lerp(19.5 + pump * 1.5, 9.5, mw), az = lerp(2.5, 9.5 + c.bz, mw);
    F.aim(B.armL, -ax, ay, az, 0.5);
    F.aim(B.armR, ax, ay, az, 0.5);
    const wa = Math.max(w1, w2);
    // E/F: stomp + roar
    const k = smooth(1.92, 2.04, t) * (1 - smooth(2.38, 2.6, t));
    blendRest(F, c, wa);
    for (const b of [B.armL, B.armR]) F.mulS(b, 1 + 0.32 * pump + 0.12 * w2, 1 - 0.08 * pump, 1 + 0.32 * pump + 0.12 * w2);
    if (w1 > 0) { F.ar(B.armL, 0, 0, 0.35 * w1 * (1 - mw)); F.ar(B.armR, 0, 0, -0.35 * w1 * (1 - mw)); } // fists curl up
    F.mulS(B.spine, 1 + 0.05 * w1 + 0.1 * w2, 1, 1 + 0.07 * w1);
    F.ar(B.spine, -0.12 * w1 + 0.28 * w2, 0, 0);
    F.ar(B.head, -0.12 * w1 + 0.15 * w2, (t < 1.0 ? -0.35 : 0.35) * w1, 0);
    const trem = w2 * Math.sin(t * 60) * 0.03;
    F.ar(B.spine, trem, 0, trem);
    const lift = smooth(1.72, 1.86, t) * (1 - smooth(1.86, 1.93, t));
    F.r(B.legR, -1.0 * lift, 0, 0.1 * lift);
    F.ap(B.legR, 0, 1.6 * lift, 0);
    F.ap(B.base, 0, 0.5 * lift, 0);
    F.ar(B.hips, 0, 0, -0.08 * lift);
    if (t >= 1.92) c.rig._event('stomp');
    roarBody(F, c, k > 0 ? easeOutBack(Math.min(1, k)) : 0, c.time);
    if (t >= 2.0) c.rig._event('roar');
    c.face = t < 0.6 ? 'smug' : t < 1.3 ? 'angry' : t < 1.94 ? 'furious' : t < 2.45 ? 'roar' : 'angry';
  },
});

// ------------------------------------------------------------------ eating styles
// One-shot poses for src/game/BearEat.js. Besides the bones they write the eat
// kit channels (maw, pucker, cheeks, swallow lump, napkin, cutlery) and
// rig.prey: where the held snack sits and what it does (preyFx.js renders it).
// params: { t01, preyLen (snack length in this bear's voxels) }.
const _e0 = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _e3 = new THREE.Vector3();
const PI = Math.PI;
// hold-space points on the head (call after the head channels are set)
const mouthPt = (F, c, out = _e0, dy = 0, dz = 0) => c.rig._headPt(F, 0, 19.4 + dy, 10.6 + dz, out);
const mawPt = (F, c, g, out = _e1) => c.rig._headPt(F, 0, MAW_TOP - 0.4 - g * MAW_DROP * 0.5, 10.6 + g, out);
// both paws on a held snack at p (spread = half the grip width), returns the paw midpoint
function pawsOn(F, p, spread, st = 0.8, out = _e2) {
  const l = F.aim(B.armL, p.x - spread, p.y - 0.3, p.z - 0.4, st);
  const r = F.aim(B.armR, p.x + spread, p.y - 0.3, p.z - 0.4, st);
  return out.set((l.x + r.x) / 2, (l.y + r.y) / 2 + 0.4, (l.z + r.z) / 2 + 0.7);
}
// lerp two vectors into out
const mixV = (out, a, b, t) => out.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
// both paws pat the full belly (alternating), returns the pat phase
function patBelly(F, c, t, rate = 7, k = 1) {
  const pL = Math.max(0, Math.sin(t * rate)), pR = Math.max(0, Math.sin(t * rate + PI));
  F.aim(B.armL, -3.6, 11.6 + pL * 1.9 * k, 9.4 + c.bz, 0.6);
  F.aim(B.armR, 3.6, 11.6 + pR * 1.9 * k, 9.4 + c.bz, 0.6);
  F.mulS(B.belly, 1 + 0.03 * (pL + pR) * k, 1 - 0.02 * (pL + pR) * k, 1 + 0.03 * (pL + pR) * k);
  return pL + pR;
}
// slow, happy chewing: jaw + a little head bob
function chew(F, t, k = 1, rate = 9) {
  F.jaw(0.2 * Math.abs(Math.sin(t * rate)) * k);
  F.ar(B.head, 0.03 * Math.sin(t * rate * 2) * k, 0, 0.07 * Math.sin(t * rate * 0.5) * k);
}

Object.assign(POSES, {
  // GULP: the jaw unhinges into a massive maw, the snack is flicked up and dropped in,
  // GULP, cheeks balloon, a lump slides down the throat, the belly swells, pat pat.
  eat_gulp(F, c) {
    const t = c.t01 * POSE_DURATION.eat_gulp, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.4);
    const gape = K(t, [[0.3, 0], [0.38, 0.36, 'back'], [0.5, 0.36], [0.56, 0.68, 'back'], [0.66, 0.68], [0.8, 1.08, 'back'], [0.95, 1], [1.5, 1], [1.56, 1.1], [1.63, 0, 'in']]);
    const big = K(t, [[0.3, 0], [0.84, 1, 'back'], [1.56, 1], [1.68, -0.14, 'out'], [1.84, 0.05], [2.0, 0]]);
    const tilt = K(t, [[0, 0.14], [0.28, 0.2], [0.42, -0.08], [0.6, -0.16], [0.84, -0.3, 'back'], [1.5, -0.26], [1.6, 0.34, 'out'], [1.78, 0.04], [2.1, 0.12], [2.45, -0.06]]);
    const tremble = win(t, 0.82, 1.5, 0.05, 0.06);
    F.ar(B.head, tilt + Math.sin(t * 47) * 0.025 * tremble, Math.sin(t * 31) * 0.03 * tremble, 0);
    F.mulS(B.head, 1 + 0.2 * big, 1 + 0.24 * big, 1 + 0.18 * big);
    F.ap(B.head, 0, 0.6 * big, 2.6 * big + c.bz * 0.6 * big);
    F.a[X_GAPE] = Math.max(0, gape);
    if (t >= 0.36) R._cue('unhinge1', 'unhinge');
    if (t >= 0.54) R._cue('unhinge2', 'unhinge');
    if (t >= 0.78) R._cue('unhinge3', 'unhinge');
    // body: crouch, rise into the gape, the GULP squash, then lean back for the pats
    const crouch = win(t, 0.12, 0.28, 0.12, 0.14);
    const gulpSq = bump(t, 1.56, 0.26);
    F.sq(B.base, 1 - 0.06 * crouch + 0.05 * win(t, 0.4, 1.4, 0.3, 0.1) - 0.12 * gulpSq);
    F.ar(B.spine, 0.08 * crouch - 0.08 * win(t, 0.5, 1.5, 0.3, 0.1) + 0.12 * gulpSq - 0.1 * smooth(2.1, 2.4, t), 0, Math.sin(t * 39) * 0.02 * tremble);
    F.r(B.earL, 0.5 * Math.min(1, gape), 0, 0.35 * Math.min(1, gape)); F.r(B.earR, 0.5 * Math.min(1, gape), 0, -0.35 * Math.min(1, gape));
    F.r(B.tail, 0, 0, Math.sin(t * 16) * 0.35);
    // snack: held at the chest while the jaw unhinges, flicked up, then dropped into the maw
    const lip = mawPt(F, c, Math.max(0, Math.min(1, gape)), _e1);
    const chest = _e3.set(9.5, 13 + c.hy * 0.3, 9.5 + c.bz);
    const flick = K(t, [[0.86, 0], [1.08, 1, 'out']]), fall = K(t, [[1.12, 0], [1.44, 1, 'in']]);
    const apexY = lip.y + len * 1.3 + 4;
    if (t < 0.98) {
      const paw = pawsOn(F, chest, Math.max(2.6, len * 0.3));
      const up = _e2.set(paw.x, lerp(paw.y, apexY - 4, flick), lerp(paw.z, lip.z, flick));
      F.hold(up.x, up.y, up.z);
      P.anchor = lerp(0.5, 0, flick); P.angle = -PI / 2 * flick; P.wiggle = 1.8;
    } else {
      // the snack is free: tail up top, head pointing into the maw, swallowed at the lip
      const y = lerp(apexY, lip.y - 1, fall) + (t < 1.12 ? (1.12 - t) * 10 : 0);
      F.hold(lip.x, y, lip.z);
      P.anchor = 0; P.feed = true; P.lip = lip; P.wiggle = 2.4;
      if (t >= 1.36) R._cue('drop');
      if (t > 1.46) P.show = 0;
    }
    // arms: holding low, the flick, "voila!" spread, then belly pats
    if (t >= 0.98 && t < 2.2) {
      const v = smooth(0.98, 1.14, t) * (1 - smooth(1.6, 1.9, t));
      F.aim(B.armL, -11, 25, 4, 0.5 * v); F.aim(B.armR, 11, 25, 4, 0.5 * v);
      blendRest(F, c, v);
    } else if (t >= 2.2) {
      const p = patBelly(F, c, t - 2.2, 10.5, smooth(2.2, 2.32, t) * (1 - smooth(2.86, 2.98, t)));
      if (p > 0.97) R._cue(t < 2.5 ? 'pat1' : t < 2.75 ? 'pat2' : 'pat3', 'pat');
      blendRest(F, c, smooth(2.2, 2.32, t) * (1 - smooth(2.9, 3.0, t)));
    }
    if (t >= 1.56) R._cue('gulp');
    // cheeks balloon, the lump slides down, the belly swells
    F.a[X_CHEEK] = K(t, [[1.56, 0], [1.64, 1.2, 'out'], [1.78, 1], [2.0, 0.55], [2.14, 0]]);
    F.a[X_THROAT] = t > 1.66 && t < 2.06 ? K(t, [[1.66, 0.001], [2.06, 0.999, 'in']]) : 0;
    if (t >= 2.05) R._cue('swallow');
    const fat = K(t, [[2.02, 0], [2.12, 1.25, 'out'], [2.3, 1], [3.0, 0.7]]);
    F.mulS(B.belly, 1 + 0.16 * fat, 1 + 0.1 * fat, 1 + 0.22 * fat);
    F.jaw(0);
    if (t >= 2.92) R._cue('done');
    c.face = t < 0.3 ? 'hungry' : t < 1.56 ? 'gape' : t < 2.12 ? 'stuffed' : 'content';
    F.look(0, t > 0.86 && t < 1.5 ? -1 : 1);
  },

  // RIP: both paws, a tug-of-war, the head RIPS off and is flung away, then slow,
  // savoured bites with eyes closed in bliss.
  eat_rip(F, c) {
    const t = c.t01 * POSE_DURATION.eat_rip, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.5);
    const tug = win(t, 0.28, 1.04, 0.14, 0.04);
    const pull = tug * (0.5 - 0.5 * Math.cos((t - 0.28) * PI * 2 * 3.9)) * (0.55 + 0.45 * smooth(0.3, 0.95, t));
    const recoil = bump(t, 1.06, 0.42);
    const savor = smooth(1.3, 1.62, t) * (1 - smooth(3.28, 3.52, t));
    const shake = Math.sin(t * 61) * 0.5 * tug;
    // body: lean back on each pull, stagger on the rip
    F.ar(B.spine, -0.14 * pull - 0.06 * tug - 0.16 * recoil + 0.1 * savor, 0, shake * 0.03);
    F.ap(B.base, 0, 0, -1.4 * recoil);
    F.sq(B.base, 1 - 0.05 * pull + 0.06 * bump(t, 1.06, 0.2) - 0.06 * bump(t, 1.26, 0.2));
    F.ar(B.head, 0.16 * tug - 0.25 * recoil + 0.12 * savor, 0, shake * 0.04);
    if (t < 1.06) {
      // the tug of war: paws on both ends, the fish stretching like taffy
      const stretch = 1 + 0.07 * tug + 0.16 * pull;
      const H = _e3.set(0, 15.6 + c.hy * 0.4, 11 + c.bz);
      const hw = len * stretch * 0.5;
      F.aim(B.armL, H.x - hw + shake, H.y - 0.4, H.z - 0.5, 0.9);
      const r = F.aim(B.armR, H.x + hw - shake, H.y - 0.4 + 0.6 * pull, H.z - 0.5, 0.9);
      const l = F.end[B.armL];
      F.hold((l.x + r.x) / 2, (l.y + r.y) / 2 + 0.4, (l.z + r.z) / 2 + 0.7);
      P.stretch = stretch; P.wiggle = 1.2 + 2 * pull; P.angle = 0.06 * pull;
    } else {
      P.headOff = true;
      if (t < 1.3) {
        // RIP! the right paw flings the head away; the left paw keeps the body
        const fl = smooth(1.06, 1.16, t);
        F.aim(B.armR, lerp(9, 15, fl), lerp(15, 24, fl), lerp(10, 3, fl), 0.6);
        const l = F.aim(B.armL, -4 - 2 * recoil, 14.5, 10.5 + c.bz, 0.8);
        F.hold(l.x + 1, l.y + 0.5, l.z + 0.6);
        P.anchor = 0.75; P.wiggle = 0.6;
      } else {
        // savour: the torn end up to the mouth, three slow bites, chewing with eyes closed
        const m = mouthPt(F, c, _e0, -0.6, -0.4);
        const rem = len * 0.68 * (1 - P.eat);
        const lift = savor;
        const base = _e3.set(-3, 14.6, 10.5 + c.bz);
        const at = mixV(_e2, base, m, lift);
        F.hold(at.x, at.y, at.z);
        P.anchor = lerp(0.75, 1, lift);
        F.aim(B.armL, at.x - Math.max(3, rem * 0.85), at.y - 0.6, at.z - 0.6, 0.8);
        F.aim(B.armR, at.x - Math.max(1.5, rem * 0.35), at.y - 1.2, at.z - 0.2, 0.7 * lift);
        blendRest(F, c, Math.max(0.15, lift), 2);
      }
    }
    // bites: lean in, CHOMP, then slow chewing
    const bites = EAT_CUES.eat_rip.bites;
    let open = 0;
    for (let i = 0; i < bites.length; i++) {
      const b = bites[i];
      open = Math.max(open, smooth(b - 0.2, b - 0.04, t) * (1 - smooth(b - 0.03, b + 0.02, t)));
      if (t >= b) R._bite(i + 1);
      F.ar(B.head, 0.12 * bump(t, b - 0.18, 0.3), 0, 0);
    }
    P.eat = Math.min(0.78, bites.reduce((s, b) => s + 0.26 * smooth(b - 0.02, b + 0.05, t), 0));
    if (t >= 1.08) R._cue('rip');
    if (t > 1.6 && t < 3.3) chew(F, t, 1 - open, 7);
    if (open > 0) F.jaw(open * 0.9);
    F.r(B.earL, -0.25 * tug, 0, 0.2 * tug); F.r(B.earR, -0.25 * tug, 0, -0.2 * tug);
    F.r(B.tail, 0, 0, Math.sin(t * 12) * 0.3);
    if (t >= 3.5) R._cue('done');
    c.face = t < 0.28 ? 'hungry' : t < 1.06 ? 'strain' : t < 1.24 ? 'shocked' : t < 1.62 ? 'excited' : open > 0.3 ? 'chomp_open' : t < 3.3 ? 'bliss' : 'yummy';
    F.look(0, 1);
  },

  // SLURP: up to the lips, pucker, and the whole fish goes in like a noodle... SHLOOP!
  eat_slurp(F, c) {
    const t = c.t01 * POSE_DURATION.eat_slurp, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.5);
    const s = K(t, [[0.62, 0], [1.15, 0.22], [1.65, 0.56], [2.12, 1, 'in']]);
    const pulses = [0.72, 1.0, 1.26, 1.48, 1.67, 1.83, 1.96, 2.06];
    let bob = 0;
    pulses.forEach((p, i) => { bob += bump(t, p, 0.12); if (t >= p) R._cue('slurp' + i, 'slurp'); });
    const whip = K(t, [[2.1, 0], [2.18, -0.34, 'out'], [2.36, 0.1], [2.55, 0]]);
    F.ar(B.head, -0.1 * win(t, 0.3, 2.1, 0.2, 0.1) - 0.07 * bob + whip, 0, 0.05 * Math.sin(t * 7) * win(t, 0.6, 2.1));
    F.mulS(B.head, 1 - 0.07 * win(t, 0.4, 2.12, 0.12, 0.05), 1 + 0.04 * win(t, 0.4, 2.12), 1); // cheeks sucked in
    F.a[X_PUCKER] = K(t, [[0.3, 0], [0.46, 1.25, 'out'], [0.6, 1], [2.08, 1], [2.14, 1.45, 'out'], [2.24, 0, 'in']]) + 0.15 * bob;
    F.a[X_CHEEK] = K(t, [[2.12, 0], [2.18, 0.7, 'out'], [2.34, 0]]);
    F.sq(B.base, 1 + 0.03 * bob - 0.08 * bump(t, 2.12, 0.2));
    F.ar(B.spine, -0.04 * win(t, 0.5, 2.1), 0, 0);
    // the fish hangs from the lips, head up, and is sucked in
    const m = mouthPt(F, c, _e0, -0.8, 0.6);
    const lift = smooth(0, 0.34, t);
    const chest = _e3.set(0, 14.6 + c.hy * 0.4, 10.8 + c.bz);
    const at = mixV(_e2, chest, m, lift);
    F.hold(at.x, at.y, at.z);
    const ang = lerp(0, PI / 2 - 0.38, lift) + 0.25 * Math.sin(t * 13) * s;
    P.angle = ang; P.anchor = lerp(0.5, 1, lift); P.eat = s; P.wave = 0.25 + 1.1 * s; P.wiggle = 1 + 2.2 * s;
    if (t >= 2.12) { R._cue('shloop'); P.show = 0; }
    // left paw pinches the tail end until the noodle gets going, then both paws up in delight
    const rem = len * (1 - s);
    const tx = at.x - Math.cos(ang) * rem * 0.92, ty = at.y - Math.sin(ang) * rem * 0.92;
    const hold = 1 - smooth(1.1, 1.3, t);
    if (hold > 0.01) { F.aim(B.armL, tx, ty, at.z - 0.6, 0.8); F.aim(B.armR, at.x + 2.5, at.y - 4, at.z - 1.5, 0.5); }
    const joy = smooth(1.15, 1.4, t) * (1 - smooth(2.4, 2.7, t));
    if (joy > 0.01) {
      const wv = Math.sin(t * 12);
      F.aim(B.armL, -10 - wv, 23, 4, 0.5); F.aim(B.armR, 10 - wv, 23, 4, 0.5);
    }
    blendRest(F, c, Math.max(hold, joy));
    // happy lip-lick wiggle at the end
    const wig = smooth(2.25, 2.4, t);
    F.ar(B.hips, 0, 0.1 * Math.sin(t * 15) * wig, 0.07 * Math.sin(t * 15) * wig);
    F.r(B.tail, 0, 0, Math.sin(t * 22) * 0.4);
    F.jaw(0);
    if (t >= 2.72) R._cue('done');
    c.face = t < 0.3 ? 'hungry' : t < 2.12 ? 'slurp' : t < 2.3 ? 'stuffed' : 'yummy';
  },

  // TOSS: flip it high, track it, catch it in the open mouth (CHOMP), a proud bounce.
  eat_toss(F, c) {
    const t = c.t01 * POSE_DURATION.eat_toss, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.5);
    const crouch = win(t, 0.05, 0.32, 0.18, 0.06);
    const swing = smooth(0.28, 0.42, t);
    const track = K(t, [[0.36, -0.05], [0.7, -0.5], [1.0, -0.62], [1.3, -0.48], [1.54, -0.3], [1.6, 0.26, 'out'], [1.8, 0.04], [2.0, -0.08]]);
    F.ar(B.head, track, 0, 0);
    F.ap(B.head, 0, 0, 1.6 * win(t, 0.95, 1.56, 0.25, 0.08));
    F.a[X_GAPE] = K(t, [[0.9, 0], [1.26, 0.66, 'back'], [1.5, 0.6], [1.555, 0.72], [1.61, 0, 'in']]);
    // shuffle under it
    const shuffle = K(t, [[0.6, 0], [0.8, 1.7], [1.02, 1.7], [1.22, -0.5], [1.42, 0]]);
    F.ap(B.base, shuffle, 0, 0);
    const stepL = bump(t, 0.6, 0.2), stepR = bump(t, 1.02, 0.2);
    F.r(B.legL, -0.5 * stepL, 0, 0); F.ap(B.legL, 0, 1.1 * stepL, 0);
    F.r(B.legR, -0.5 * stepR, 0, 0); F.ap(B.legR, 0, 1.1 * stepR, 0);
    if (t < 0.4) {
      // wind up low on the right, then flick it skywards
      const tgt = _e3.set(lerp(7, 5, swing), lerp(10.5, 27, swing), lerp(9.5 + c.bz, 6, swing));
      const r = F.aim(B.armR, tgt.x, tgt.y, tgt.z, 0.8);
      F.hold(r.x, r.y + 0.6, r.z + 0.8);
      P.angle = 0.3 * swing; P.wiggle = 1.6;
      F.aim(B.armL, -9.5, 13, 5, 0.4);
      blendRest(F, c, 0.6, 1);
    } else if (t < 1.56) {
      P.at = 'free';
      const out = smooth(0.4, 0.6, t);
      F.aim(B.armL, -12, 18.5 + Math.sin(t * 9) * 0.8, 5, 0.5 * out);
      F.aim(B.armR, 12, 18.5 - Math.sin(t * 9) * 0.8, 5, 0.5 * out);
      blendRest(F, c, out);
    } else {
      // caught! the tail flaps out of the mouth for a beat, then GULP
      P.at = 'mouth'; P.anchor = 1; P.angle = -PI / 2 + 0.25 * Math.sin(t * 30);
      P.eat = K(t, [[1.56, 0.45], [1.74, 0.58], [1.82, 1, 'in']]); P.wiggle = 2.6;
      if (t > 1.83) P.show = 0;
    }
    if (t >= 0.4) R._cue('toss');
    if (t >= 1.56) R._cue('catch');
    if (t >= 1.8) R._cue('gulp');
    F.a[X_CHEEK] = K(t, [[1.8, 0], [1.86, 0.75, 'out'], [2.02, 0]]);
    // proud bounce + twirl
    const hop = K(t, [[1.9, 0], [2.0, -0.7], [2.2, 3.3, 'out'], [2.42, 0, 'in'], [2.5, -0.9], [2.64, 0]]);
    const air = Math.max(0, hop) / 3.3;
    F.ap(B.base, 0, Math.max(0, hop), 0);
    F.sq(B.base, 1 - 0.1 * crouch + 0.07 * swing * (1 - smooth(0.42, 0.6, t)) + 0.06 * air - 0.05 * Math.max(0, -hop) - 0.1 * bump(t, 1.56, 0.2));
    const tw = K(t, [[2.0, 0], [2.42, 1, 'io']]);
    if (tw > 0 && tw < 1) F.spinAbout(0, 12, 1, 0, tw * PI * 2, 0);
    const v = smooth(1.9, 2.04, t) * (1 - smooth(2.5, 2.75, t));
    if (v > 0.01) { F.aim(B.armL, -12, 28, 3, 0.4 * v); F.aim(B.armR, 12, 28, 3, 0.4 * v); blendRest(F, c, v); }
    F.r(B.legL, -0.35 * air, 0, -0.1 * air); F.r(B.legR, -0.35 * air, 0, 0.1 * air);
    if (t >= 2.2) R._cue('tada');
    F.r(B.tail, 0, 0, Math.sin(t * 20) * 0.4);
    F.jaw(t > 0.9 && t < 1.56 ? 0 : 0);
    if (t >= 2.82) R._cue('done');
    c.face = t < 0.4 ? 'smug' : t < 1.56 ? 'aim' : t < 1.86 ? 'stuffed' : 'cheer';
    F.look(0, t > 0.4 && t < 1.56 ? -1 : 0);
    void len;
  },

  // FANCY: napkin tucked in, a tiny knife & fork, dainty bites with the pinky up, dab dab.
  eat_fancy(F, c) {
    const t = c.t01 * POSE_DURATION.eat_fancy, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.6);
    F.a[X_NAPKIN] = K(t, [[0.14, 0], [0.26, 1.25, 'out'], [0.36, 1], [3.3, 1], [3.36, 1.2], [3.46, 0, 'in']]);
    F.a[X_CUTLERY] = K(t, [[0.4, 0], [0.5, 1.3, 'out'], [0.6, 1], [3.26, 1], [3.32, 1.25], [3.42, 0, 'in']]);
    if (t >= 0.2) R._cue('napkin');
    if (t >= 0.46) R._cue('cutlery');
    if (t >= 3.3) R._cue('poof');
    // snooty posture: chin up, a little prim sway
    const sway = Math.sin(t * 3.2);
    F.ar(B.head, -0.1 + 0.04 * sway, 0.06 * sway, 0.05 * sway);
    F.ar(B.spine, -0.04, 0, 0.02 * sway);
    const bites = EAT_CUES.eat_fancy.bites;
    const m = mouthPt(F, c, _e0, -1, 0.5);
    // the fork arm: in front of the chest, or up at the mouth for a dainty bite (pinky out!)
    let up = 0;
    for (const b of bites) up = Math.max(up, smooth(b - 0.3, b - 0.06, t) * (1 - smooth(b + 0.06, b + 0.24, t)));
    const lean = up;
    F.ar(B.head, 0.14 * lean, 0, 0);
    // the snack rides on the fork paw: low in front of the chest for cutting, up at the lips to bite
    const low = _e3.set(-2.6, 13.2, 12.2 + c.bz);
    const hi = _e2.set(m.x - 0.6, m.y - 0.4, m.z + 0.8);
    const at = mixV(_e3, low, hi, up);
    if (t < 0.46) {
      const l = F.aim(B.armL, -4, 14, 10 + c.bz, 0.7);
      F.hold(l.x + 1, l.y + 0.4, l.z + 0.8);
    } else {
      F.hold(at.x, at.y, at.z);
      F.aim(B.armL, at.x - 2.2, at.y - 2.6, at.z - 1.2, 0.7);
    }
    // the knife arm: tuck the napkin, saw away, dab the lips
    const tuck = win(t, 0.02, 0.42, 0.1, 0.1);
    const saw = win(t, 0.62, 1.12, 0.06, 0.06) + win(t, 1.72, 2.22, 0.06, 0.06);
    const dab = win(t, 2.72, 3.22, 0.1, 0.1);
    if (tuck > 0.01) F.aim(B.armR, 1.4, 17.6 + Math.sin(t * 40) * 0.5, 8 + c.bz, 0.7);
    else if (dab > 0.01) {
      const d = Math.max(bump(t, 2.8, 0.14), bump(t, 3.0, 0.14));
      F.aim(B.armR, 3, m.y - 6.5 + d * 1.2, m.z + 1.5 - d, 0);
    } else F.aim(B.armR, 2.6 + Math.sin((t - 0.62) * PI * 2 * 3) * 1.6 * saw, 13.4, 12.6 + c.bz, 0);
    blendRest(F, c, Math.max(tuck, dab, t > 0.46 && t < 3.3 ? 1 : 0), 2);
    if (t < 0.46 || t > 3.36) blendRest(F, c, t < 0.46 ? 1 : 1 - smooth(3.36, 3.6, t), 1);
    [0.72, 0.88, 1.04, 1.82, 1.98, 2.14].forEach((ct, i) => { if (t >= ct) R._cue('cut' + i, 'cut'); });
    if (t >= 2.82) R._cue('dab1', 'dab');
    if (t >= 3.02) R._cue('dab2', 'dab');
    bites.forEach((b, i) => { if (t >= b) R._bite(i + 1); });
    P.eat = Math.min(0.72, bites.reduce((s, b) => s + 0.36 * smooth(b - 0.02, b + 0.04, t), 0));
    P.wiggle = 0.6;
    // dainty chewing between bites
    const chewW = win(t, bites[0] + 0.05, bites[0] + 0.6) + win(t, bites[1] + 0.05, bites[1] + 0.6);
    if (chewW > 0.01) chew(F, t, 0.6 * chewW, 14);
    else F.jaw(0.04 + 0.3 * up);
    if (t >= 3.82) R._cue('done');
    c.face = up > 0.3 || chewW > 0.5 ? (chewW > 0.5 ? 'bliss' : 'dainty') : dab > 0.3 ? 'smug' : 'dainty';
    void len;
  },

  // SHAKE: clamp it in the jaws and shake it like a dog with a toy, then gulp (a bit dizzy).
  eat_shake(F, c) {
    const t = c.t01 * POSE_DURATION.eat_shake, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.5);
    const up = smooth(0, 0.28, t);
    const sh = win(t, 0.34, 1.62, 0.12, 0.1);
    const ph = (t - 0.34) * PI * 2 * 4.6;
    const whip = Math.sin(ph) * sh;
    F.ar(B.head, 0.08 * up - 0.45 * smooth(1.66, 1.82, t) * (1 - smooth(1.94, 2.1, t)), 0.62 * whip, 0.12 * whip);
    F.ar(B.spine, 0.05 * sh, 0.22 * whip, 0.05 * whip);
    F.ar(B.hips, 0, -0.12 * whip, 0);
    F.ap(B.base, 0.6 * whip, 0, 0);
    if (t < 0.3) {
      const m = mouthPt(F, c, _e0, -0.5, 0);
      const at = mixV(_e2, _e3.set(0, 14.6, 10.8 + c.bz), m, up);
      F.hold(at.x, at.y, at.z);
      pawsOn(F, at, Math.max(2.6, len * 0.32), 0.8, _e3);
    } else {
      P.at = 'mouth'; P.anchor = 0.5;
      P.angle = -0.5 * whip + 0.15 * Math.sin(ph * 2) * sh; P.wiggle = 0.6 + 2.6 * sh;
      P.eat = K(t, [[0.95, 0], [1.0, 0.16], [1.45, 0.16], [1.5, 0.32], [1.8, 0.32], [1.92, 1, 'in']]);
      if (t > 1.93) P.show = 0;
      const out = smooth(0.3, 0.45, t) * (1 - smooth(2.0, 2.3, t));
      F.aim(B.armL, -11, 17 - 3 * whip, 6, 0.5 * out); F.aim(B.armR, 11, 17 + 3 * whip, 6, 0.5 * out);
      blendRest(F, c, out);
    }
    if (t >= 0.3) R._bite(1);
    if (t >= 0.98) R._bite(2);
    if (t >= 1.48) R._bite(3);
    if (sh > 0.3) { const k = Math.floor(ph / PI); R._cue('shake' + k, 'shake'); }
    if (t >= 1.9) R._cue('gulp');
    F.a[X_CHEEK] = K(t, [[1.9, 0], [1.96, 0.7, 'out'], [2.12, 0]]);
    const dizzy = win(t, 2.0, 2.45, 0.08, 0.1);
    F.ar(B.base, 0, 0, 0.06 * Math.sin(t * 9) * dizzy);
    F.ar(B.head, 0, 0, 0.12 * Math.sin(t * 9 + 1) * dizzy);
    F.jaw(t < 0.24 ? 0.6 * up : 0.05);
    F.r(B.earL, 0, 0, 0.5 * whip); F.r(B.earR, 0, 0, 0.5 * whip);
    F.r(B.tail, 0, 0, -0.6 * whip);
    if (t >= 2.42) R._cue('done');
    c.face = t < 0.3 ? 'hungry' : t < 1.65 ? 'strain' : t < 1.98 ? 'stuffed' : t < 2.4 ? 'dizzy' : 'yummy';
  },

  // CRUNCH: corn-cob style, chomping along the fish like a typewriter... DING! A clean skeleton.
  eat_crunch(F, c) {
    const t = c.t01 * POSE_DURATION.eat_crunch, R = c.rig, P = R.prey;
    const len = c.params.preyLen ?? 16;
    idleBreath(F, c, 0.5);
    const N = 10, t0 = 0.46, dtb = 0.135;
    const up = smooth(0, 0.36, t) * (1 - smooth(1.9, 2.2, t));
    let open = 0;
    for (let i = 0; i < N; i++) {
      const b = t0 + i * dtb;
      open = Math.max(open, bump(t, b - 0.07, 0.09));
      if (t >= b) R._bite(i + 1);
    }
    // bites step from just behind the head down to the tail fin; each one leaves bare bone
    const steps = Math.min(N, Math.floor(clamp((t - t0) / dtb + 1, 0, N)));
    P.eat = steps / N; P.bone = true; P.wiggle = 0.25;
    const m = mouthPt(F, c, _e0, -0.8, 0.2);
    const chest = _e3.set(0, 14, 10.6 + c.bz);
    const at = mixV(_e2, chest, m, up);
    // typewriter: the fish slides across the mouth one bite at a time, DING, carriage return
    const bite = 0.76 - 0.58 * smooth(0, 1, clamp((t - t0 + 0.06) / (N * dtb), 0, 1));
    const ret = smooth(1.86, 2.1, t);
    P.anchor = lerp(lerp(0.5, bite, smooth(0.2, 0.42, t)), 0.5, ret);
    F.hold(at.x, at.y, at.z);
    F.ar(B.head, 0.06 * open + 0.03 * Math.sin(t * 30) * win(t, t0, t0 + N * dtb), 0.1 * (P.anchor - 0.5), 0);
    const tail = (P.anchor) * len, head = (1 - P.anchor) * len;
    F.aim(B.armL, at.x - Math.max(2.4, tail - 1), at.y - 0.6, at.z - 0.6, 0.8);
    F.aim(B.armR, at.x + Math.max(2.4, head - 1.5), at.y - 0.6, at.z - 0.6, 0.8);
    blendRest(F, c, Math.max(0.2, up));
    if (t >= 1.86) R._cue('ding');
    F.jaw(open * 0.85);
    F.sq(B.base, 1 - 0.03 * open);
    F.r(B.tail, 0, 0, Math.sin(t * 18) * 0.3);
    if (t >= 2.52) R._cue('done');
    c.face = t < 0.4 ? 'hungry' : t < t0 + N * dtb ? (open > 0.3 ? 'chomp_open' : 'chomp_closed') : t < 2.2 ? 'smug' : 'content';
    F.look(0, 1);
  },
});

// ------------------------------------------------------------------ rig
const _wp = new THREE.Vector3();
const _aH = new THREE.Vector3(), _aB = new THREE.Vector3();

export class BearRig {
  constructor(typeId, def) {
    this.typeId = typeId;
    this.def = def;
    const G = bearRigGeometry(typeId, def);
    this.look = G.look;
    this.tris = G.tris;
    this.itemName = def.item || null;
    this.itemMode = G.itemMode;
    this.root = new THREE.Group();
    this.root.name = 'bear:' + typeId;
    this.scaler = new THREE.Group();
    this.root.add(this.scaler);

    // skeleton
    const bones = (this.bones = []);
    const BB = (this.bind = G.bind || BIND);
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.name = BONE_DEFS[i][0];
      const p = PARENT[i];
      const bp = BB[i], pp = p >= 0 ? BB[p] : _v1.set(0, 0, 0);
      b.position.set((bp.x - pp.x) * 0.1, (bp.y - pp.y) * 0.1, (bp.z - pp.z) * 0.1);
      const nm = b.name;
      b.rotation.order = nm.startsWith('arm') || nm.startsWith('leg') ? 'XZY' : 'YXZ';
      bones.push(b);
      if (p >= 0) bones[p].add(b);
    }
    this.restPos = bones.map((b) => b.position.clone());
    this.restScale = new Float32Array(NB).fill(1);
    this.restScale[B.head] = G.look.headScale;
    this.restScale[B.belly] = G.look.belly;

    const mat = sharedMats().normal;
    this.body = new THREE.SkinnedMesh(G.geo, mat);
    this.body.name = 'bearBody';
    this.body.castShadow = true;
    this.body.receiveShadow = false;
    this.body.add(bones[0]);
    this.skeleton = new THREE.Skeleton(bones);
    this.body.bind(this.skeleton);
    // generous culling bounds (spins, raised arms, props)
    if (def.shape) {
      this.body.boundingSphere = G.bounds.sphere.clone();
      this.body.boundingBox = G.bounds.box.clone();
    } else {
      this.body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.8, 0.2), 3.1);
      this.body.boundingBox = new THREE.Box3(new THREE.Vector3(-1.4, -0.2, -1.2), new THREE.Vector3(1.4, 4.1, 1.6));
    }

    // face
    const boss = G.look.boss;
    this.isBoss = boss;
    this.face = new BearFace({
      fur: def.fur, furLight: def.furLight, cub: G.look.cub, glasses: def.glasses, shades: def.shades, monocle: def.monocle,
      boss, glow: boss ? def.glow ?? 0xff3030 : null, scar: def.scar, halfmoon: def.halfmoon, icy: def.icy, markings: def.markings,
      band: def.armband ? 'SECURITY' : null, goldTooth: boss && !!def.cigar,
    });
    this.faceMat = new THREE.MeshLambertMaterial({ map: this.face.texture, transparent: true, alphaTest: 0.5 });
    if (this.face.glowTexture) { this.faceMat.emissiveMap = this.face.glowTexture; this.faceMat.emissive.setRGB(1, 1, 1); }
    this._faceGlow = this.face.glowTexture ? 1 : 0;
    if (!sharedFaceGeo) sharedFaceGeo = faceGeometry();
    this.faceMesh = new THREE.SkinnedMesh(G.faceGeo || sharedFaceGeo, this.faceMat);
    this.faceMesh.name = 'bearFace';
    this.faceMesh.bind(this.skeleton, this.body.bindMatrix);
    this.faceMesh.boundingSphere = this.body.boundingSphere;
    this.faceMesh.boundingBox = this.body.boundingBox;
    this.faceMesh.castShadow = false;
    this.scaler.add(this.body, this.faceMesh);
    // emissive voxels (spirit markings, aurora tie, cigar ember)
    this.glowMesh = null;
    if (G.glowGeo) {
      this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.glowMesh = new THREE.SkinnedMesh(G.glowGeo, this.glowMat);
      this.glowMesh.name = 'bearGlow';
      this.glowMesh.bind(this.skeleton, this.body.bindMatrix);
      this.glowMesh.boundingSphere = this.body.boundingSphere;
      this.glowMesh.boundingBox = this.body.boundingBox;
      this.glowMesh.castShadow = true;
      this.scaler.add(this.glowMesh);
    }
    this.aura = null;
    if (def.aurora) {
      this.aura = new Aura(G.look, (typeId.length * 31) | 0);
      this.scaler.add(this.aura.group);
    }

    // anchors (children of bones); scale undoes VS so props are in world units x bear scale
    const anchor = (bone, x, y, z) => {
      const o = new THREE.Object3D();
      const bp = BIND[bone];
      o.position.set((x - bp.x) * 0.1, (y - bp.y) * 0.1, (z - bp.z) * 0.1);
      o.scale.setScalar(1 / VS);
      bones[bone].add(o);
      return o;
    };
    this.holdAnchor = anchor(B.spine, 0, 16.6, 9.5);
    this.handAnchorR = anchor(B.armR, 8.3, 8.4, 1.6);
    this.handAnchorL = anchor(B.armL, -8.3, 8.4, 1.6);
    this.mouthAnchor = anchor(B.head, 0, 19.8, 9.9);
    this.topAnchor = anchor(B.hat, 0, G.hatTop + 1.2, 0.3);
    // centre of the (possibly unhinged) mouth opening: moves down with the gape
    this.mawAnchor = anchor(B.head, 0, MAW_TOP - 0.4, 9.6);
    this._mawRest = this.mawAnchor.position.clone();
    this._anchor = anchor;

    this.meshes = [this.body];
    if (this.glowMesh) this.meshes.push(this.glowMesh);
    this._shadows = true;
    this.matState = 'normal';
    this.ownMat = null;
    this.held = null;
    this.chomps = 0;
    this.biteN = 0; // index of the latest 'bite' event of the current eating pose
    this.events = [];
    this.onEvent = null;
    this.afterPose = null; // (rig, dt) => void, called at the end of every pose() (BearEat syncs the prey here)
    // What the eating poses want the held snack to do this frame (read by src/entities/preyFx.js):
    //   at      'hold' (hold anchor) | 'fork' (fork tip) | 'mouth' (maw anchor) | 'free' (flying, BearEat moves it)
    //   angle   direction of the snack's head in the bear's front plane: 0 = towards its right paw, PI/2 = up
    //   anchor  point of the remaining snack that sits on the anchor: 0 = tail end .. 1 = head (or bitten) end
    //   eat     0..1 eaten from the head end; stretch / thick: length / girth scale; wiggle: flailing;
    //   wave    noodle wave (slurp); spin: extra roll; show: 0 = gone inside the bear
    //   feed    the tail sits on the anchor and the head points at `lip` (hold space); whatever crosses
    //           the lip on screen is inside the mouth. headOff: the head has been ripped off.
    //   bone    eaten parts turn into a clean skeleton instead of vanishing (corn-cob style)
    this.prey = { at: 'hold', angle: 0, anchor: 0.5, eat: 0, stretch: 1, thick: 1, wiggle: 1, wave: 0, spin: 0, show: 1,
      feed: false, lip: null, lipV: new THREE.Vector3(), headOff: false, bone: false };
    this._eatKit = null;

    // personality defaults (personalize() randomises)
    this.P = { size: 1, chub: 1, bounce: 1, flip: 'flip', phase: 0, blink: 1, happyWalk: false, runFace: 'excited', swimFace: 'happy', fidget: 'watch', earFlop: 0 };

    // pose state
    this.cur = null;
    this.t = 0;
    this.time = Math.random() * 10;
    this.phase = 0;
    this.swimT = 0;
    this.fadeT = 1;
    this.fadeDur = 0.15;
    this.F = new Frame();
    this.Ffrom = new Frame();
    this.Fout = new Frame();
    this.Frest = new Frame();
    for (const f of [this.F, this.Ffrom, this.Fout, this.Frest]) f.bind = this.bind;
    this._lastT01 = 0;
    this._eventsFired = new Set();
    this.ctx = { rig: this, t: 0, t01: 0, speed: 0, moveAmp: 0, phase: 0, swimT: 0, inWater: false, time: 0, params: {}, P: this.P, face: 'neutral', restArms: [new Float32Array(9), new Float32Array(9)],
      // shape offsets (voxels) so hold / pat targets follow fat bellies and raised heads
      bz: Math.max(0, G.look.bz), hy: this.bind[B.head].y - BIND[B.head].y, hz: Math.max(0, this.bind[B.head].z - BIND[B.head].z) * 0.6 };
    this.Frest.reset();
    for (let k = 0; k < 9; k++) { this.ctx.restArms[0][k] = this.Frest.a[B.armL * CH + k]; this.ctx.restArms[1][k] = this.Frest.a[B.armR * CH + k]; }
    this._look = { x: 0, y: 0, tx: 0, ty: 0, t: 1 + Math.random() * 2 };
    this._fidget = { kind: 'watch', w: 0, t: 4 + Math.random() * 5, dur: 0 };

    // secondary motion springs
    this.sp = {
      earLx: new Spring(160, 10), earLz: new Spring(160, 10), earRx: new Spring(160, 10), earRz: new Spring(160, 10),
      hatX: new Spring(90, 8), hatZ: new Spring(90, 8), hatY: new Spring(260, 14),
      tieX: new Spring(70, 5), tieZ: new Spring(70, 5),
      bellyS: new Spring(220, 9), bellyZ: new Spring(180, 10),
      tailX: new Spring(140, 8), tailZ: new Spring(140, 8),
      headX: new Spring(200, 16), headZ: new Spring(200, 16),
      squash: new Spring(260, 13),
      itemX: new Spring(0, 2.2), itemZ: new Spring(0, 2.2),
    };
    for (const k in this.sp) { this.sp[k].k0 = this.sp[k].k; this.sp[k].c0 = this.sp[k].c; }
    this._springF = 1;
    this._acc = {
      head: { p: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), ok: false },
      belly: { p: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), ok: false },
      hand: { p: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), ok: false },
    };
    this.propAngle = 0;
    this.jawOpen = 0;

    // face state
    this.faceBase = 'neutral';
    this.faceOverride = null;
    this.faceHold = 0;
    this.faceNow = 'neutral';
    this.blinkT = 1 + Math.random() * 3;
    this.blinking = 0;
    this.faceClock = Math.random() * 10;
    this._tickedByPose = false;
    this._tickedByUpdate = false;
    this.lookX = 0; this.lookY = 0;

    this._applyScale();
    this.pose('idle', 0);
  }

  // ---------------------------------------------------------------- public
  setMaterial(kind) {
    if (this.matState === kind) return;
    this.matState = kind;
    const m = sharedMats();
    this.body.material = kind === 'normal' ? this.ownMat || m.normal : m[kind] || m.normal;
    const fc = this.faceMat.color, fe = this.faceMat.emissive;
    const g = this._faceGlow;
    if (kind === 'angry') { fc.setRGB(1.4, 0.7, 0.65); fe.setRGB(g, g, g); } else if (kind === 'flash') { fc.setRGB(2.2, 2.2, 2.2); fe.setScalar(Math.max(g, 0.25)); } else { fc.setRGB(1, 1, 1); fe.setRGB(g, g, g); }
  }

  // slight per-bear tint / size / personality so a wave isn't a clone army
  personalize(seed) {
    const r = mulberry32(Math.floor(Math.abs(seed) * 9973 + 0.5) ^ 0x5bd1e995);
    const boss = this.isBoss;
    const k = 0.95 + r() * 0.1;
    const warm = (r() - 0.5) * 0.06;
    if (!this.ownMat) this.ownMat = addTint(addGrain(new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.ownMat.color.setRGB(k * (1 + warm), k, k * (1 - warm));
    // fur tone (lighter / darker, warmer / cooler) and a new accessory colour (hue spin)
    const tone = boss ? 0.97 + r() * 0.06 : 0.86 + r() * 0.24, fw = (r() - 0.5) * (boss ? 0.04 : 0.16);
    this.ownMat.userData.tint.uFur.value.setRGB(tone * (1 + fw), tone * (1 + fw * 0.2), tone * (1 - fw * 1.2));
    const hr = r();
    this.ownMat.userData.tint.uHue.value = boss || hr < 0.25 ? 0 : (hr - 0.25) / 0.75 * Math.PI * 2;
    const P = this.P;
    P.size = boss ? 0.97 + r() * 0.06 : 0.92 + r() * 0.16;
    P.chub = 0.93 + r() * 0.17;
    P.bounce = 0.8 + r() * 0.4;
    P.flip = ['flip', 'flip', 'twirl', 'tuck'][Math.floor(r() * 4)];
    P.phase = r() * 20;
    P.blink = 0.75 + r() * 0.6;
    P.happyWalk = r() < 0.55;
    P.runFace = ['excited', 'happy', 'hungry', 'excited'][Math.floor(r() * 4)];
    P.swimFace = r() < 0.6 ? 'happy' : 'excited';
    P.fidget = ['watch', 'pat', 'stretch'][Math.floor(r() * 3)];
    P.earFlop = (r() - 0.5) * 0.3;
    this._applyScale();
    const was = this.matState;
    this.matState = null;
    this.setMaterial(was || 'normal');
  }

  // Let go of the held object WITHOUT disposing it (the caller re-parents it, e.g. a tossed snack).
  release() {
    const h = this.held;
    this.held = null;
    return h;
  }

  // World position of the centre of the mouth opening (follows the unhinged maw).
  mawPos(out = new THREE.Vector3()) {
    this.mawAnchor.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.mawAnchor.matrixWorld);
  }

  hold(obj) {
    if (this.held) {
      this.held.parent?.remove(this.held);
      this.held.userData?.dispose?.();
      this.held = null;
    }
    if (!obj) return;
    let m = obj;
    if (obj.isBufferGeometry) {
      m = new THREE.Mesh(obj, sharedMats().normal);
      m.rotation.set(0, 0, 0.15);
      m.scale.setScalar(0.8 * VS);
    }
    m.castShadow = this.shadows;
    this.holdAnchor.add(m);
    this.held = m;
  }

  setFace(expr, { hold = 0 } = {}) {
    if (!expr || expr === 'auto') { this.faceOverride = null; this.faceHold = 0; return; }
    this.faceOverride = expr;
    this.faceHold = hold > 0 ? hold : -1; // -1: until the pose changes
  }

  mouthPos(out = new THREE.Vector3()) {
    this.mouthAnchor.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.mouthAnchor.matrixWorld);
  }

  headTop(out = new THREE.Vector3()) {
    this.topAnchor.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.topAnchor.matrixWorld);
  }

  handPos(side = 'R', out = new THREE.Vector3()) {
    const a = side === 'L' ? this.handAnchorL : this.handAnchorR;
    a.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(a.matrixWorld);
  }

  get shadows() { return this._shadows; }
  set shadows(on) {
    on = !!on;
    if (on === this._shadows) return;
    this._shadows = on;
    for (const m of this.meshes) m.castShadow = on;
    if (this.held) this.held.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  }

  // extra squash impulse (e.g. a hit): positive = squash down
  squash(amount = 1) { this.sp.squash.kick(-amount * 3.2); }

  setLegsVisible(on) { this._legsHidden = !on; }

  update(dt) {
    if (this._tickedByPose) { this._tickedByPose = false; return; }
    this._tickFace(dt);
    this._tickedByUpdate = true;
  }

  dispose() {
    this.hold(null);
    this.root.parent?.remove(this.root);
    this.faceMat.dispose();
    this.face.texture.dispose();
    this.face.glowTexture?.dispose();
    this.glowMat?.dispose();
    this.aura?.dispose();
    this.ownMat?.dispose();
    this.skeleton.dispose();
  }

  // ---------------------------------------------------------------- pose
  pose(name, dt, params = {}) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    if (!POSES[name]) name = 'idle';
    this.events.length = 0;
    const c = this.ctx;
    const oneShot = ONE_SHOT.has(name);
    let restart = false;
    const switched = name !== this.cur;
    if (switched) {
      const prev = this.cur;
      this.Ffrom.copy(this.Fout);
      this.fadeT = 0;
      this.fadeDur = prev == null ? 0 : FADE[name] ?? 0.15;
      this.cur = name;
      this.t = 0;
      restart = true;
      if (this.faceHold === -1) { this.faceOverride = null; this.faceHold = 0; }
      if (prev === 'cannonball') this._land();
      if (name === 'lunge' || name === 'grab') this.sp.squash.kick(1.2);
      if (name === 'stagger') this._hit();
    } else this.t += dt;
    let t01 = params.t01;
    if (oneShot) {
      if (t01 == null) t01 = Math.min(1, this.t / POSE_DURATION[name]);
      if (t01 < this._lastT01 - 0.3) restart = true;
      this._lastT01 = t01;
    } else t01 = 0;
    if (restart) {
      this._eventsFired.clear();
      if (name === 'eat') this.chomps = 0;
      this.biteN = 0;
      if (name === 'stagger' && !switched) this._hit();
    }
    this.time += dt;
    // gait phase follows distance travelled
    const speed = params.speed ?? 0;
    const sc = this.def.scale * this.P.size;
    const fast = name === 'run' || name === 'charge';
    const stride = (name === 'run' ? 2.3 : name === 'charge' ? 2.6 : name === 'sad' ? 1.3 : 1.35) * sc;
    let cad = speed / stride;
    if (name === 'run') cad = clamp(cad, 1.25, 2.3);
    else if (name === 'charge') cad = clamp(cad, 1.1, 2.2);
    else if (speed > 0.02) cad = clamp(cad, 0.55, 1.75);
    const moveAmp = clamp(speed / (0.9 * sc), 0, 1);
    c.moveAmp = fast ? Math.max(0.5, moveAmp) : moveAmp;
    const prevPhase = this.phase;
    if (fast || c.moveAmp > 0.02) this.phase += dt * cad * Math.PI * 2;
    this.swimT += dt * (4.2 + Math.min(1, speed / 2) * 3.2);
    // footfall events
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI) && (name === 'walk' || fast || name === 'angry_stomp' || name === 'sad' || name === 'search')) {
      this._event(name === 'angry_stomp' || name === 'charge' ? 'stomp' : 'step', true);
      if (name === 'run') this.sp.squash.kick(-0.5 * this.P.bounce);
      if (name === 'charge') { this.sp.squash.kick(-0.9); this.sp.bellyS.kick(-2.5); }
      if (name === 'angry_stomp') this.sp.squash.kick(-1.2);
    }
    if (name === 'angry_stomp' && c.moveAmp <= 0.1) {
      const ph = this.time * Math.PI * 2 * 1.7;
      if (Math.floor((ph - dt * Math.PI * 2 * 1.7) / Math.PI) !== Math.floor(ph / Math.PI)) { this._event('stomp', true); this.sp.squash.kick(-1.4); }
    }
    c.t = this.t; c.t01 = t01; c.speed = speed; c.phase = this.phase; c.swimT = this.swimT;
    c.inWater = !!params.inWater; c.time = this.time; c.params = params;
    c.face = 'neutral';
    this._updateLook(dt, name);
    this._updateFidget(dt, name);

    const F = this.F.reset();
    const P = this.prey;
    P.at = 'hold'; P.angle = 0; P.anchor = 0.5; P.eat = 0; P.stretch = 1; P.thick = 1; P.wiggle = 1; P.wave = 0; P.spin = 0; P.show = 1;
    P.feed = false; P.lip = null; P.headOff = false; P.bone = false;
    POSES[name](F, c);
    if (P.lip && P.lip !== P.lipV) P.lip = P.lipV.copy(P.lip);
    this.faceBase = c.face;

    // crossfade
    let out = F;
    if (this.fadeT < this.fadeDur) {
      this.fadeT += dt;
      const w = smooth(0, 1, this.fadeT / this.fadeDur);
      const a = this.Fout.a, fa = this.Ffrom.a, ta = F.a;
      for (let i = 0; i < NCH; i++) {
        const rot = i < EX && (i % CH) < 3;
        let from = fa[i];
        if (rot) from = ta[i] + wrapA(from - ta[i]);
        a[i] = i === X_JAW ? (w < 0.5 ? fa[i] : ta[i]) : from + (ta[i] - from) * w;
      }
      out = this.Fout;
    } else this.Fout.copy(F);
    out = this.Fout;

    this._applyFrame(out, dt, name);
    if (this.aura) this.aura.update(dt, name === 'roar' || name === 'boss_intro' || name === 'slam' || name === 'charge' ? 1.6 : name === 'calm' ? 0.7 : 1);
    if (this.glowMat) this.glowMat.color.setScalar(0.92 + 0.12 * Math.sin(this.time * 2.6 + this.P.phase));
    // face timers are part of the pose tick unless update() already ran this frame
    if (this._tickedByUpdate) this._tickedByUpdate = false;
    else { this._tickFace(dt); this._tickedByPose = true; }
    if (this.afterPose) this.afterPose(this, dt);
    return this;
  }

  // ---------------------------------------------------------------- internals
  _event(name, repeatable = false) {
    if (!repeatable) {
      if (this._eventsFired.has(name)) return;
      this._eventsFired.add(name);
    }
    this.events.push(name);
    if (name === 'release' && this.held) this.held.visible = false;
    if (name === 'slam') { this.sp.squash.kick(-2.2); this.sp.hatY.kick(9); this.sp.bellyS.kick(-5); this.sp.earLz.kick(5); this.sp.earRz.kick(-5); }
    if (name === 'roar') { this.sp.hatY.kick(11); this.sp.hatX.kick(-4); this.sp.bellyS.kick(3); this.sp.earLx.kick(5); this.sp.earRx.kick(5); this.sp.tieX.kick(-6); }
    if (name === 'stomp' && (this.cur === 'boss_intro')) { this.sp.squash.kick(-2.6); this.sp.hatY.kick(8); this.sp.bellyS.kick(-5); }
    // eating beats: a little follow-through on the hat, ears and belly
    if (name === 'bite' || name === 'catch') { this.sp.squash.kick(-0.9); this.sp.hatY.kick(4); this.sp.earLz.kick(-2.5); this.sp.earRz.kick(2.5); }
    else if (name === 'gulp') { this.sp.squash.kick(-1.6); this.sp.hatY.kick(7); this.sp.bellyS.kick(2); }
    else if (name === 'swallow') { this.sp.bellyS.kick(-6); this.sp.bellyZ.kick(3); this.sp.tieX.kick(-5); }
    else if (name === 'rip') { this.sp.hatY.kick(10); this.sp.hatX.kick(-5); this.sp.earLz.kick(5); this.sp.earRz.kick(-5); this.sp.squash.kick(1.4); }
    else if (name === 'shloop') { this.sp.hatY.kick(9); this.sp.hatX.kick(4); this.sp.earLx.kick(-4); this.sp.earRx.kick(-4); }
    else if (name === 'unhinge') { this.sp.hatY.kick(5); this.sp.earLz.kick(3); this.sp.earRz.kick(-3); }
    else if (name === 'tada') { this.sp.hatY.kick(8); this.sp.tieX.kick(-4); }
    if (this.onEvent) this.onEvent(name, this);
  }

  // fire `name` once per pose run (key = a unique beat, e.g. 'bite2')
  _cue(key, name = key) {
    if (this._eventsFired.has(key)) return false;
    this._eventsFired.add(key);
    this._event(name, true);
    return true;
  }

  // numbered bite beat (sets biteN before the 'bite' event so listeners can read it)
  _bite(n) {
    if (this._eventsFired.has('bite#' + n)) return;
    this._eventsFired.add('bite#' + n);
    this.biteN = n;
    this._event('bite', true);
  }

  // Spine-space ("hold space") voxel position of a point given in classic head bind
  // coordinates, following the head's current rotation / scale in F (+ last frame's springs).
  _headPt(F, x, y, z, out) {
    const a = F.a, o = B.head * CH, rs = this.restScale[B.head];
    const hb = BIND[B.head];
    _e.set(a[o] + clamp(this.sp.headX.x, -0.15, 0.15), a[o + 1], a[o + 2] + clamp(this.sp.headZ.x, -0.15, 0.15), 'YXZ');
    _v3.set((x - hb.x) * rs * a[o + 6], (y - hb.y) * rs * a[o + 7], (z - hb.z) * rs * a[o + 8]).applyEuler(_e);
    const sp = BIND[B.spine], bh = this.bind[B.head], bs = this.bind[B.spine];
    return out.set(sp.x + bh.x - bs.x + a[o + 3] + _v3.x, sp.y + bh.y - bs.y + a[o + 4] + _v3.y, sp.z + bh.z - bs.z + a[o + 5] + _v3.z);
  }

  // lazily build this bear's eat-kit meshes (shared geometry per type, the bear's own material)
  _kit() {
    if (this._eatKit) return this._eatKit;
    const G = eatKitGeometry(this.typeId, this.look);
    const bones = this.bones;
    const mk = (geo, bone, x, y, z, ref = BIND) => {
      const m = new THREE.Mesh(geo, this.body.material);
      const bp = ref[bone];
      m.position.set((x - bp.x) * 0.1, (y - bp.y) * 0.1, (z - bp.z) * 0.1);
      m.visible = false;
      m.castShadow = this._shadows;
      bones[bone].add(m);
      this.meshes.push(m);
      return m;
    };
    const k = {
      G,
      top: mk(G.top, B.head, 0, MAW_TOP, 0), inner: mk(G.inner, B.head, 0, MAW_TOP, 0), bot: mk(G.bot, B.head, 0, MAW_TOP, 0),
      pucker: mk(G.pucker, B.head, ...PUCKER_AT),
      cheekL: mk(G.cheek, B.head, -CHEEK_AT[0], CHEEK_AT[1], CHEEK_AT[2]), cheekR: mk(G.cheek, B.head, CHEEK_AT[0], CHEEK_AT[1], CHEEK_AT[2]),
      lump: mk(G.lump, B.spine, 0, 0, 0, this.bind),
      napkin: mk(G.napkin, B.spine, 0, 0, 0, this.bind),
      fork: mk(G.fork, B.armL, 0, 0, 0), knife: mk(G.knife, B.armR, 0, 0, 0),
    };
    k.botY = k.bot.position.y;
    k.forkTip = this._anchor(B.armL, ...G.forkTip);
    this._eatKit = k;
    return k;
  }

  // show / shape the eat-kit pieces from the frame's kit channels
  _applyKit(k, a, dt) {
    const gape = Math.max(0, a[X_GAPE]);
    const big = gape > 0.12;
    const mat = this.body.material;
    for (const m of [k.top, k.inner, k.bot]) { m.visible = big; m.material = mat; }
    if (big) {
      const wide = 1 + 0.14 * Math.min(1.3, gape);
      k.top.scale.set(wide, 1, 1);
      k.inner.scale.set(wide, Math.max(0.05, gape), 1);
      k.bot.scale.set(wide * (1 + 0.04 * gape), 1, 1 + 0.08 * gape);
      k.bot.position.y = k.botY - gape * MAW_DROP * 0.1;
      k.bot.rotation.x = 0.16 * gape;
      this.bones[B.jaw].scale.setScalar(HIDE); // the real jaw hides inside the maw
    }
    // opening centre: half way down the drop, a voxel forward
    this.mawAnchor.position.set(this._mawRest.x, this._mawRest.y - gape * MAW_DROP * 0.05, this._mawRest.z + gape * 0.1);
    const pk = Math.max(0, a[X_PUCKER]);
    k.pucker.visible = pk > 0.03;
    if (k.pucker.visible) { k.pucker.material = mat; k.pucker.scale.set(pk, pk, pk * (0.7 + 0.5 * pk)); }
    const ch = Math.max(0, a[X_CHEEK]);
    for (const m of [k.cheekL, k.cheekR]) {
      m.visible = ch > 0.03;
      if (m.visible) { m.material = mat; m.scale.setScalar(ch); }
    }
    const th = a[X_THROAT];
    k.lump.visible = th > 0.001 && th < 0.999;
    if (k.lump.visible) {
      const P = k.G.path, f = th * (P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), u = f - i;
      const y = lerp(P[i][0], P[i + 1][0], u), z = lerp(P[i][1], P[i + 1][1], u);
      const bs = this.bind[B.spine];
      k.lump.position.set((0 - bs.x) * 0.1, (y - bs.y) * 0.1, (z - bs.z) * 0.1);
      const s = 0.75 + 0.45 * Math.sin(th * Math.PI);
      k.lump.scale.set(s, s * (1 + 0.15 * Math.sin(th * 18)), s);
      k.lump.material = mat;
    }
    const nap = Math.max(0, a[X_NAPKIN]);
    k.napkin.visible = nap > 0.05;
    if (k.napkin.visible) { k.napkin.material = mat; k.napkin.scale.set(Math.min(1.25, nap), Math.min(1.25, nap), 1); }
    const cut = Math.max(0, a[X_CUTLERY]);
    for (const m of [k.fork, k.knife]) {
      m.visible = cut > 0.05;
      if (m.visible) { m.material = mat; m.scale.setScalar(Math.min(1.3, cut) * 1.2); }
    }
    void dt;
  }

  _setChomps(n) {
    if (n > this.chomps) {
      this.chomps = n;
      this.biteN = n;
      this._event('chomp', true);
      this._event('bite', true);
      this.sp.squash.kick(-1.1 - (n === 3 ? 0.8 : 0));
      this.sp.bellyS.kick(3);
      this.sp.hatY.kick(n === 3 ? 7 : 3);
      this.sp.earLz.kick(-3); this.sp.earRz.kick(3);
      if (this.held) this.held.userData.bitten = n;
    }
  }

  // a hit reaction impulse (stagger)
  _hit() {
    this._lastHitT = this.time;
    this.sp.squash.kick(2.2);
    this.sp.hatY.kick(13); this.sp.hatX.kick(6);
    this.sp.earLz.kick(-7); this.sp.earRz.kick(7);
    this.sp.bellyS.kick(5); this.sp.tieX.kick(-7);
  }

  _land() {
    this.sp.squash.kick(-5.2);
    this.sp.hatY.kick(16);
    this.sp.earLz.kick(9); this.sp.earRz.kick(-9);
    this.sp.bellyS.kick(-6);
    this._event('land', true);
  }

  _applyScale() {
    const sc = this.def.scale * this.P.size;
    const s = VS * sc;
    this.scaler.scale.set(s, s, s);
    this.restScale[B.belly] = this.look.belly * this.P.chub;
    // big bears wobble slower (and keep the same wobble size): k ~ 1/size, damping ratio kept
    const f = Math.pow(Math.max(1, sc), 0.9);
    this._springF = f;
    for (const k in this.sp) { const S = this.sp[k]; S.k = S.k0 / f; S.c = S.c0 / Math.sqrt(f); }
  }

  _updateLook(dt, name) {
    const L = this._look;
    L.t -= dt;
    if (L.t <= 0) {
      L.t = 1.2 + Math.random() * 2.6;
      const r = Math.random();
      L.tx = r < 0.35 ? 0 : (Math.random() - 0.5) * 1.1;
      L.ty = (Math.random() - 0.5) * 0.3;
    }
    const k = 1 - Math.exp(-dt * 7);
    L.x += (L.tx - L.x) * k;
    L.y += (L.ty - L.y) * k;
    void name;
  }

  _updateFidget(dt, name) {
    const f = this._fidget;
    if (name !== 'idle' || this.ctx.inWater) { f.w = Math.max(0, f.w - dt * 4); f.t = Math.max(f.t, 2); return; }
    if (f.dur > 0) {
      f.dur -= dt;
      f.w = Math.min(1, f.w + dt * 4);
      if (f.dur <= 0) f.t = 4 + Math.random() * 6;
    } else {
      f.w = Math.max(0, f.w - dt * 3.5);
      f.t -= dt;
      if (f.t <= 0) { f.kind = this.P.fidget; f.dur = f.kind === 'watch' ? 1.6 : f.kind === 'stretch' ? 1.4 : 1.8; }
    }
  }

  _measure(key, obj, dt, rootQ, invScale) {
    const m = this._acc[key];
    obj.getWorldPosition(_wp);
    if (!m.ok || dt <= 0) { m.p.copy(_wp); m.v.set(0, 0, 0); m.a.set(0, 0, 0); m.ok = dt > 0; return m.a; }
    _v2.copy(_wp).sub(m.p).divideScalar(dt);
    if (_v2.lengthSq() > 400) { m.p.copy(_wp); m.v.set(0, 0, 0); m.a.set(0, 0, 0); return m.a; } // teleport
    _v3.copy(_v2).sub(m.v).divideScalar(dt);
    m.v.copy(_v2); m.p.copy(_wp);
    // into the bear's facing frame, normalised by size
    _q1.copy(rootQ).invert();
    _v3.applyQuaternion(_q1).multiplyScalar(invScale);
    const L = _v3.length();
    if (L > 90) _v3.multiplyScalar(90 / L);
    m.a.lerp(_v3, 0.6);
    return m.a;
  }

  _applyFrame(Fr, dt, name) {
    const a = Fr.a;
    const bones = this.bones;
    for (let i = 0; i < NB; i++) {
      const o = i * CH, b = bones[i], rp = this.restPos[i], rs = this.restScale[i];
      b.rotation.set(a[o], a[o + 1], a[o + 2]);
      b.position.set(rp.x + a[o + 3] * 0.1, rp.y + a[o + 4] * 0.1, rp.z + a[o + 5] * 0.1);
      b.scale.set(rs * a[o + 6], rs * a[o + 7], rs * a[o + 8]);
    }
    // hidden-by-default bones
    for (const hb of HIDDEN_BONES) {
      const o = hb * CH;
      if (a[o + 6] === 1 && a[o + 7] === 1 && a[o + 8] === 1 && a[o + 3] === 0 && a[o + 4] === 0) bones[hb].scale.setScalar(HIDE);
    }
    if (this.held || this.itemMode === 'none' || (name.startsWith('eat_') && this.prey.at === 'free')) bones[B.item].scale.setScalar(HIDE);
    if (this._legsHidden) { bones[B.legL].scale.setScalar(HIDE); bones[B.legR].scale.setScalar(HIDE); }
    // hold anchor
    const sp = BIND[B.spine];
    this.holdAnchor.position.set((a[X_HOLD] - sp.x) * 0.1, (a[X_HOLD + 1] - sp.y) * 0.1, (a[X_HOLD + 2] - sp.z) * 0.1);
    // eat kit (built the first time a pose asks for one of its pieces)
    let kit = this._eatKit;
    if (!kit && (a[X_GAPE] > 0.12 || a[X_PUCKER] > 0.03 || a[X_CHEEK] > 0.03 || a[X_THROAT] > 0.001 || a[X_NAPKIN] > 0.05 || a[X_CUTLERY] > 0.05)) kit = this._kit();
    if (kit) this._applyKit(kit, a, dt);
    // toss: the prop rides in the right paw; eating poses can park the snack on the fork / in the mouth
    if (this.held) {
      const at = this.prey.at;
      const want = name === 'toss' ? this.handAnchorR : at === 'fork' && kit ? kit.forkTip : at === 'mouth' ? this.mawAnchor : this.holdAnchor;
      if (this.held.parent !== want) want.add(this.held);
      if (name !== 'toss' && !this.held.visible && this.cur !== 'toss') this.held.visible = true;
    }
    // jaw: pose override or the face's default
    const faceExpr = this.faceOverride || this.faceBase;
    const jawT = a[X_JAW] >= 0 && !this.faceOverride ? a[X_JAW] : (FACE_INFO[faceExpr]?.jaw ?? 0);
    this.jawOpen += (jawT - this.jawOpen) * (1 - Math.exp(-dt * 38));
    if (dt === 0) this.jawOpen = jawT;
    bones[B.jaw].rotation.x = this.jawOpen * 0.62;
    this.lookX = a[X_LOOKX]; this.lookY = a[X_LOOKY];
    // propeller
    this.propAngle += dt * (4 + a[X_PROPSPIN]);
    bones[B.prop].rotation.y = this.propAngle;

    // ---- secondary motion
    this.root.updateMatrixWorld(true);
    const rq = this.root.quaternion;
    const inv = 1 / Math.max(0.3, this.def.scale * this.P.size);
    const sub = dt > 0 ? Math.max(1, Math.ceil(dt / (1 / 120))) : 0;
    const h = sub ? dt / sub : 0;
    const kf = 1 / this._springF;
    const aH = _aH.copy(this._measure('head', bones[B.head], dt, rq, inv)).multiplyScalar(kf);
    const aB = _aB.copy(this._measure('belly', bones[B.belly], dt, rq, inv)).multiplyScalar(kf);
    const aI = this._measure('hand', bones[B.item], dt, rq, inv);
    const S = this.sp;
    for (let i = 0; i < sub; i++) {
      S.earLx.step(h, -aH.z * 0.9 - aH.y * 0.15); S.earRx.step(h, -aH.z * 0.9 - aH.y * 0.15);
      S.earLz.step(h, aH.x * 0.8 + aH.y * 0.9); S.earRz.step(h, aH.x * 0.8 - aH.y * 0.9);
      S.hatX.step(h, -aH.z * 0.35); S.hatZ.step(h, aH.x * 0.35); S.hatY.step(h, -aH.y * 0.08);
      S.headX.step(h, -aH.z * 0.12); S.headZ.step(h, aH.x * 0.12);
      S.tieX.step(h, -aB.z * 0.5 + aB.y * 0.35); S.tieZ.step(h, aB.x * 0.6);
      S.bellyS.step(h, -aB.y * 0.35); S.bellyZ.step(h, -aB.z * 0.25);
      S.tailX.step(h, aB.z * 0.6 - aB.y * 0.3); S.tailZ.step(h, aB.x * 0.8);
      S.squash.step(h);
    }
    const cl = (v, m) => clamp(v, -m, m);
    const earK = this.cur === 'sad' ? 0.6 : 1;
    const eL = bones[B.earL], eR = bones[B.earR];
    eL.rotation.x += cl(S.earLx.x, 0.7) * earK; eL.rotation.z += cl(S.earLz.x, 0.8) * earK + this.P.earFlop;
    eR.rotation.x += cl(S.earRx.x, 0.7) * earK; eR.rotation.z += cl(S.earRz.x, 0.8) * earK;
    const hat = bones[B.hat];
    hat.rotation.x += cl(S.hatX.x, 0.35); hat.rotation.z += cl(S.hatZ.x, 0.35); hat.position.y += cl(S.hatY.x, 0.4) * 0.1 + Math.max(0, S.hatY.x) * 0.05;
    const hd = bones[B.head];
    hd.rotation.x += cl(S.headX.x, 0.15); hd.rotation.z += cl(S.headZ.x, 0.15);
    const tie = bones[B.tie];
    let tieX = cl(S.tieX.x, 1.2);
    if (name === 'run') tieX -= 0.35 + 0.18 * Math.sin(this.time * 23) + 0.1 * Math.sin(this.time * 37);
    tie.rotation.x += Math.min(0, tieX) + Math.max(0, tieX) * 0.15; // it can lift off the belly, not sink in
    tie.rotation.z += cl(S.tieZ.x, 0.6) + (name === 'run' ? Math.sin(this.time * 19) * 0.12 : 0);
    const bel = bones[B.belly];
    const js = cl(S.bellyS.x, 0.18);
    bel.scale.x *= 1 - js * 0.5; bel.scale.y *= 1 + js; bel.scale.z *= 1 - js * 0.3;
    bel.position.z += cl(S.bellyZ.x, 0.4) * 0.1;
    const tl = bones[B.tail];
    tl.rotation.x += cl(S.tailX.x, 0.8); tl.rotation.z += cl(S.tailZ.x, 0.8);
    const sq = clamp(S.squash.x, -0.42, 0.3);
    if (sq !== 0) {
      const base = bones[B.base];
      const k = 1 + sq, kk = 1 / Math.sqrt(k);
      base.scale.x *= kk; base.scale.y *= k; base.scale.z *= kk;
    }
    // held item: pendulum / keep level / rigid in the paw
    this._itemDynamics(aI, dt, sub, h, a[X_ITEMRIGID] > 0.5);
    this.root.updateMatrixWorld(true);
  }

  _itemDynamics(acc, dt, sub, h, rigid) {
    const mode = this.itemMode;
    const ib = this.bones[B.item];
    if (mode === 'none' || mode === 'rigid' || rigid || this.held) {
      this.sp.itemX.reset(); this.sp.itemZ.reset();
      return;
    }
    // world "down" as seen from the arm, pendulum angles in the bear frame
    const arm = this.bones[B.armR];
    arm.getWorldQuaternion(_q2);
    _q1.copy(this.root.quaternion).invert().multiply(_q2); // arm orientation in bear space
    const g = 9.8;
    const Lp = (mode === 'hang' ? 0.32 : 0.5) * this._springF;
    const X = this.sp.itemX, Z = this.sp.itemZ;
    for (let i = 0; i < sub; i++) {
      if (mode === 'hang') {
        // pendulum from the paw: angles about X (fore/aft) and Z (sideways)
        const ax = (-(g + acc.y) * Math.sin(X.x) - acc.z * Math.cos(X.x)) / Lp;
        const az = (-(g + acc.y) * Math.sin(Z.x) + acc.x * Math.cos(Z.x)) / Lp;
        X.v += (ax - 5.5 * X.v) * h; X.x += X.v * h;
        Z.v += (az - 5.5 * Z.v) * h; Z.x += Z.v * h;
      } else {
        // stay upright with a little lag
        X.step(h, -acc.z * 0.05); Z.step(h, acc.x * 0.05);
        X.k = 60 / this._springF; X.c = 9 / Math.sqrt(this._springF); Z.k = X.k; Z.c = X.c;
      }
    }
    X.x = clamp(X.x, -1.3, 1.3); Z.x = clamp(Z.x, -1.0, 1.0);
    // desired "down" of the item in bear space
    _v1.set(Math.sin(Z.x), -Math.cos(Z.x) * Math.cos(X.x), -Math.cos(Z.x) * Math.sin(X.x)).normalize();
    // current down of the item if it followed the arm rigidly
    _v2.set(0, -1, 0).applyQuaternion(_q1);
    _q3.setFromUnitVectors(_v2, _v1);
    // local = inv(armBear) * fix * armBear
    _q2.copy(_q1).invert().multiply(_q3).multiply(_q1);
    ib.quaternion.copy(_q2);
    void dt;
  }

  _tickFace(dt) {
    this.faceClock += dt;
    if (this.faceHold > 0) {
      this.faceHold -= dt;
      if (this.faceHold <= 0) { this.faceHold = 0; this.faceOverride = null; }
    }
    const expr = this.faceOverride || this.faceBase || 'neutral';
    if (expr !== this.faceNow) {
      if (expr === 'shocked') { this.sp.hatY.kick(14); this.sp.earLz.kick(-6); this.sp.earRz.kick(6); }
      if (expr === 'furious' || expr === 'angry') { this.sp.earLx.kick(4); this.sp.earRx.kick(4); }
      this.faceNow = expr;
    }
    // blinking
    this.blinkT -= dt;
    if (this.blinking > 0) this.blinking -= dt;
    if (this.blinkT <= 0) {
      this.blinking = 0.11;
      this.blinkT = (Math.random() < 0.18 ? 0.22 : 1.6 + Math.random() * 3.2) * this.P.blink;
      if (expr === 'sleepy') { this.blinking = 0.5; this.blinkT += 0.8; }
    }
    const lx = Math.abs(this.lookX) < 0.5 ? 0 : Math.sign(this.lookX);
    const ly = Math.abs(this.lookY) < 0.5 ? 0 : Math.sign(this.lookY);
    this.face.draw({ expr, blink: this.blinking > 0, frame: Math.floor(this.faceClock * 8), lookX: lx, lookY: ly });
  }
}
