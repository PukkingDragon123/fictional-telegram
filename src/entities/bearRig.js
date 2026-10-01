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
import { BearFace, FACE_REGIONS, FACE_QUADS, FACE_W, FACE_H, FACE_INFO, FACE_EXPRESSIONS } from './bearFace.js';

export { FACE_EXPRESSIONS };
export const VS = 0.625; // world units per model unit (voxel = 0.0625 world units)
export const BEAR_POSES = ['idle', 'walk', 'run', 'swim', 'cannonball', 'lunge', 'grab', 'eat', 'yummy', 'toss', 'pay',
  'angry_stomp', 'smash', 'search', 'cheer', 'talk', 'sad', 'wave', 'sit'];
// default durations of the one-shot poses (seconds) when no t01 is passed
export const POSE_DURATION = { cannonball: 0.7, lunge: 0.34, grab: 0.36, eat: 1.4, yummy: 0.9, toss: 0.5, pay: 1.5, smash: 0.9 };
const ONE_SHOT = new Set(Object.keys(POSE_DURATION));
const FADE = { cannonball: 0.1, lunge: 0.08, grab: 0.1, eat: 0.14, toss: 0.12, smash: 0.12, run: 0.18, walk: 0.18, sit: 0.3, swim: 0.2 };

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
const lumOf = (c) => (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;

// ------------------------------------------------------------------ look
function lookOf(d) {
  const L = { d };
  L.cub = d.scale < 0.7;
  L.outfit = d.straps ? 'coveralls' : d.vest ? 'hivis' : d.flannel ? 'flannel' : d.hawaiian ? 'hawaiian'
    : d.suit === d.shirt ? (d.tie ? 'shirt' : 'tshirt') : d.monocle ? 'tux' : 'jacket';
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
  L.pants = d.hawaiian ? 0xcdb58a : d.flannel ? 0x2c3d5e : d.vest ? 0x3a4c6c : d.straps ? d.suit
    : L.outfit === 'shirt' ? 0x3e4660 : L.outfit === 'tshirt' ? d.suitDark : d.suitDark;
  L.shorts = d.hawaiian || L.cub;
  L.boots = d.vest || d.flannel;
  L.barefoot = L.cub;
  L.sandals = d.hawaiian;
  L.shoe = L.boots ? 0x6a4424 : SHOE;
  L.sleeve = d.flannel ? d.suit : d.vest ? d.shirt : d.straps ? mix(d.suit, 0xe8eef4, 0.45) : d.suit;
  L.shortSleeve = L.outfit === 'shirt' || L.outfit === 'tshirt' || d.hawaiian || d.vest;
  L.rolled = d.flannel || d.straps;
  L.cuff = L.outfit === 'jacket' || L.outfit === 'tux';
  L.gold = 0xe8c040;
  L.belly = L.cub ? 1.04 : d.item === 'cane' ? 1.1 : d.cigar ? 1.12 : L.outfit === 'shirt' ? 0.92 : 1;
  L.headScale = L.cub ? 1.14 : 1;
  return L;
}

// Colour of the torso/belly at a voxel (applies to the whole body union)
function outfitColor(L, x, y, z) {
  const d = L.d;
  const front = z >= 2;
  const ax = Math.abs(x);
  switch (L.outfit) {
    case 'jacket':
    case 'tux': {
      let c = d.suit;
      if (d.pinstripe && ((x + 30) % 3 === 0)) c = d.pinstripe;
      const vw = (y - 10.4) * 0.52;
      if (front && y >= 11 && ax <= vw) return d.shirt;
      if (front && y >= 11 && ax <= vw + 1.6 && y <= 17.5) return L.lapel;
      if (y <= 8) c = shade(c, 0.9);
      return c;
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

function inTorso(x, y, z) {
  const t = TORSO;
  const rx = t.rx - Math.max(0, y + 0.5 - 14.6) * 0.42;
  return se(x, y + 0.5, z, t.cx, t.cy, t.cz, rx, t.ry, t.rz, t.p) <= 1;
}
function bellyD(x, y, z) {
  const b = BELLY;
  return se(x, y + 0.5, z, b.cx, b.cy, b.cz, b.rx, b.ry, b.rz, b.p);
}

// Torso + belly union, painted, then split so the belly can jiggle.
function buildBody(L) {
  const d = L.d;
  const v = new VoxelModel();
  for (let x = -9; x <= 9; x++)
    for (let y = 7; y <= 19; y++)
      for (let z = -7; z <= 9; z++)
        if (inTorso(x, y, z) || bellyD(x, y, z) <= 1) v.set(x, y, z, 1);
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
      if (L.outfit === 'tux') {
        // shirt studs + gold watch chain across the belly
        surf(0, 13, 0x101010); surf(0, 15, 0x101010);
        for (const [x, y] of [[1, 10], [2, 10], [3, 11], [4, 11], [5, 12]]) surf(x, y, L.gold);
      }
      // breast pocket + pocket square
      for (let x = 3; x <= 5; x++) surf(x, 14, shade(d.suitDark, 0.85));
      const sq = d.pinstripe ? 0xd83040 : L.outfit === 'tux' ? 0xffffff : d.scarf ? 0xe0c040 : 0xffffff;
      surf(4, 15, sq, 1); surf(3, 15, sq, 1); surf(4, 16, sq, 1);
      // shirt collar points under the chin
      for (const sx of [-1, 1]) { surf(sx * 1, 17, 0xffffff, 1); surf(sx * 2, 17, 0xffffff, 1); surf(sx * 2, 16, 0xffffff); }
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
    const zs = frontZ(v, 0, 17);
    if (zs != null) {
      const z = zs + 1;
      put(0, 17, z, btk);
      for (const sx of [-1, 1]) { put(sx, 17, z, bt); put(sx * 2, 17, z, bt); put(sx * 2, 18, z - 1, bt); put(sx * 2, 16, z - 1, bt); put(sx * 3, 17, z - 1, shade(bt, 0.88)); }
    }
  }
  if (d.scarf) {
    // thick scarf around the neck
    for (let x = -8; x <= 8; x++)
      for (let z = -8; z <= 9; z++)
        for (let y = 16; y <= 18; y++) {
          if (!v.has(x, y, z)) continue;
          const out = !v.has(x + 1, y, z) || !v.has(x - 1, y, z) || !v.has(x, y, z + 1) || !v.has(x, y, z - 1);
          if (out) v.set(x, y, z, (x + z + y) % 3 === 0 ? shade(d.scarf, 0.85) : d.scarf);
        }
    for (let x = -5; x <= 5; x++) { const z = frontZ(v, x, 17); if (z != null) put(x, 17, z + 1, x % 2 ? d.scarf : shade(d.scarf, 0.88)); }
  }

  // split: belly = front bulge (jiggles), torso = the rest
  const torso = new VoxelModel(), belly = new VoxelModel();
  for (const [k, c] of v.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    const isDec = dec.has(`${x},${y},${z}`);
    const inB = bellyD(x, y, z) <= 1 && z >= 1 && !(y >= 16 && !isDec && inTorso(x, y, z));
    const decB = isDec && bellyD(x, y, z - 1) <= 1.08 && y <= 15;
    (inB || decB ? belly : torso).set(x, y, z, c);
  }
  return { torso, belly };
}

function buildPelvis(L) {
  const d = L.d;
  const v = new VoxelModel();
  const pants = L.pants;
  fillSE(v, 0, 8.6, -0.2, 6.4, 2.9, 4.9, 2.6, (x, y) => (y <= 6 ? shade(pants, 0.92) : pants));
  const noJacket = L.outfit !== 'jacket' && L.outfit !== 'tux';
  if (noJacket && L.outfit !== 'coveralls') {
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
  fillSE(v, cx, 5.2, 0, 2.35, 4.2, 2.3, 3, (x, y) => {
    if (L.shorts && y <= 4) return fur;
    if (y === 2) return shade(pants, 0.85);
    return pants;
  }, (x, y) => y >= 2);
  // foot / shoe with a rounded toe
  const shoe = L.barefoot || L.sandals ? fur : L.shoe;
  for (let x = cx - 2; x <= cx + 2; x++)
    for (let y = 0; y <= 2; y++)
      for (let z = -2; z <= 4; z++) {
        const edgeX = x === cx - 2 || x === cx + 2;
        if (z === 4 && (edgeX || y === 2)) continue;
        if (z === -2 && edgeX && y === 2) continue;
        if (y === 2 && z >= 3) continue;
        let c = shoe;
        if (y === 0) c = L.barefoot || L.sandals ? (L.sandals ? 0x8a5a2a : L.pad) : 0x2a2224;
        if (L.boots && y === 2) c = shade(L.shoe, 0.8);
        v.set(x, y, z, c);
      }
  if (!L.barefoot && !L.sandals && !L.boots) {
    v.set(cx - 1, 1, 4, 0x70707a); v.set(cx, 1, 4, 0x55555e); // shoe shine
  }
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
  const sleeveEnd = L.shortSleeve ? 13 : L.rolled ? 11 : 10;
  fillSE(v, cx, 12.6, cz, 2.2, 5.3, 2.25, 2.4, (x, y, z) => {
    if (y <= 9) return fur; // paw
    if (y < sleeveEnd) return fur; // forearm fur (short / rolled sleeves)
    if (L.cuff && y === 10) return 0xffffff;
    if (L.rolled && y === 11) return d.flannel ? d.suitDark : shade(L.sleeve, 0.85);
    let c = L.sleeve;
    if (d.flannel) {
      const zs = Math.floor((z + 40) / 2) % 2, ys = Math.floor((y + 40) / 2) % 2;
      c = zs && ys ? d.suitDark : zs || ys ? shade(d.suit, 0.62) : d.suit;
    }
    if (d.hawaiian) c = outfitColor(L, x, y, z);
    if (d.pinstripe && ((z + 30) % 3 === 0)) c = d.pinstripe;
    if (L.shortSleeve && y === sleeveEnd) c = shade(c, 0.88);
    return c;
  });
  // paw pad on the palm (inner-front) + little claws
  const ix = side > 0 ? Math.floor(cx - 1) : Math.ceil(cx + 1);
  v.set(ix, 8, 2, L.pad); v.set(ix, 9, 2, L.pad); v.set(Math.round(cx), 8, 3, L.pad);
  if (L.cuff) {
    // cufflink on the outside of the cuff
    const ox = side > 0 ? Math.ceil(cx + 2) : Math.floor(cx - 2);
    v.set(ox, 10, 1, L.gold);
  }
  if (L.cub) { v.set(Math.round(cx), 7, 1, L.furLight); }
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
  if (!d.hat) {
    // cowlick
    v.set(0, 30, 1, L.furTuft); v.set(1, 31, 1, L.furTuft); v.set(-1, 30, 2, fur); v.set(1, 30, 0, fur);
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
        v.set(x, y, z, inner ? L.innerEar : L.fur);
      }
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
      for (let y = 31; y <= 38; y++) disk(y, 3.5, 3.3, y <= 32 ? 0xa01e2a : y === 38 ? shade(hc, 1.3) : hc);
      top = 39;
      break;
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
  if (d.tie) {
    const tc = d.tie, td = shade(d.tie, 0.78);
    for (let y = 9; y <= 17; y++) {
      const z0 = surfZ(0, y);
      if (z0 == null) continue;
      const z = z0 + 1;
      const w = y >= 16 ? 1 : y <= 9 ? 0 : 1;
      for (let x = -w; x <= w; x++) {
        let c = ((y + x) % 3 === 0) ? td : tc;
        if (y >= 16) c = y === 17 ? td : tc; // knot
        v.set(x, y, z, c);
      }
      if (y === 10) { v.set(-1, y, z, null); v.set(1, y, z, null); v.set(0, y, z, tc); }
    }
    // tie clip
    const zc = surfZ(0, 13);
    if (zc != null) for (let x = -1; x <= 1; x++) v.set(x, 13, zc + 1, x === 1 ? 0xf0f0f0 : L.gold);
  }
  if (d.lanyard) {
    for (let y = 13; y <= 17; y++) {
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

function meshPart(vox, out, bone, { hide = null, aoSolid = null, deepAO = true } = {}) {
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
        const vi = out.pos.length / 3;
        for (let ci = 0; ci < 4; ci++) {
          const c = F.c[ci];
          const p = [ox + c[0], oy + c[1], oz + c[2]];
          p[UV.ua] = [ox, oy, oz][UV.ua] + c[UV.ua] * w;
          p[UV.va] = [ox, oy, oz][UV.va] + c[UV.va] * h;
          out.pos.push((p[0] - 0.5) * 0.1, p[1] * 0.1, (p[2] - 0.5) * 0.1);
          out.nor.push(F.n[0], F.n[1], F.n[2]);
          const br = AO_CURVE[(pat >> (ci * 2)) & 3] * tint;
          b[ci] = br;
          out.col.push(rgb[0] * br, rgb[1] * br, rgb[2] * br);
          out.si.push(bone);
        }
        if (b[0] + b[2] > b[1] + b[3]) out.idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
        else out.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
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

function mergeSkinned(parts) {
  const byName = new Map(parts.filter((p) => p.name).map((p) => [p.name, p.model.vox]));
  const out = { pos: [], nor: [], col: [], si: [], idx: [] };
  const counts = {};
  for (const p of parts) {
    if (!p.model || !p.model.vox.size) continue;
    const vox = p.model.vox;
    const occ = (OCCLUDERS[p.name] || []).map(([n, m]) => [byName.get(n), m]).filter((o) => o[0] && o[0].size);
    const hide = occ.length ? (x, y, z, n) => {
      for (const [ov, m] of occ) {
        let all = true;
        for (let k = 0; k < m; k++) if (!ov.has(KEY(x + n[0] * k, y + n[1] * k, z + n[2] * k))) { all = false; break; }
        if (all) return true;
      }
      return false;
    } : null;
    const aoFrom = (AO_FROM[p.name] || []).map((n) => byName.get(n)).filter(Boolean);
    const aoSolid = aoFrom.length ? (k) => vox.has(k) || aoFrom.some((m) => m.has(k)) : null;
    const t0 = out.idx.length;
    meshPart(vox, out, p.bone, { hide, aoSolid });
    counts[p.name || p.bone] = (out.idx.length - t0) / 3;
  }
  const nv = out.pos.length / 3;
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { si[i * 4] = out.si[i]; sw[i * 4] = 1; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(out.idx, 1) : new THREE.Uint16BufferAttribute(out.idx, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.partTris = counts;
  return geo;
}

// ------------------------------------------------------------------ geometry
const geoCache = new Map();

function faceGeometry() {
  // eyes on the head plate, upper lip on the muzzle, lower lip on the jaw
  const quads = [
    { r: FACE_REGIONS.eyes, ...FACE_QUADS.eyes, bone: B.head },
    { r: FACE_REGIONS.upper, ...FACE_QUADS.upper, bone: B.head },
    { r: FACE_REGIONS.lower, ...FACE_QUADS.lower, bone: B.jaw },
  ];
  const pos = [], nor = [], uv = [], si = [], sw = [], idx = [];
  const eps = 0.07;
  quads.forEach((q, i) => {
    const u0 = q.r.x / FACE_W, u1 = (q.r.x + q.r.w) / FACE_W;
    const v1 = 1 - q.r.y / FACE_H, v0 = 1 - (q.r.y + q.r.h) / FACE_H;
    const z = (q.z + eps) * 0.1;
    pos.push(q.x0 * 0.1, q.y0 * 0.1, z, q.x1 * 0.1, q.y0 * 0.1, z, q.x1 * 0.1, q.y1 * 0.1, z, q.x0 * 0.1, q.y1 * 0.1, z);
    for (let k = 0; k < 4; k++) { nor.push(0, 0, 1); si.push(q.bone, 0, 0, 0); sw.push(1, 0, 0, 0); }
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
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

export function bearRigGeometry(typeId, def) {
  let g = geoCache.get(typeId);
  if (g) return g;
  const L = lookOf(def);
  const body = buildBody(L);
  const hatInfo = buildHat(L);
  const item = def.item ? buildItem(L, def.item) : null;
  const parts = [
    { name: 'pelvis', bone: B.hips, model: buildPelvis(L) },
    { name: 'torso', bone: B.spine, model: body.torso },
    { name: 'belly', bone: B.belly, model: body.belly },
    { name: 'tie', bone: B.tie, model: buildTie(L, body) },
    { name: 'head', bone: B.head, model: buildHead(L) },
    { name: 'jaw', bone: B.jaw, model: buildJaw(L) },
    { name: 'earL', bone: B.earL, model: buildEar(L, -1) },
    { name: 'earR', bone: B.earR, model: buildEar(L, 1) },
    { name: 'hat', bone: B.hat, model: hatInfo.hat },
    { name: 'armL', bone: B.armL, model: buildArm(L, -1) },
    { name: 'armR', bone: B.armR, model: buildArm(L, 1) },
    { name: 'legL', bone: B.legL, model: buildLeg(L, -1) },
    { name: 'legR', bone: B.legR, model: buildLeg(L, 1) },
    { name: 'tail', bone: B.tail, model: buildTail(L) },
    { name: 'wallet', bone: B.wallet, model: buildWallet(L) },
  ];
  if (def.hat === 'propeller') parts.push({ name: 'prop', bone: B.prop, model: buildProp() });
  if (item) {
    parts.push({ name: 'item', bone: B.item, model: item.v });
    if (item.lid) parts.push({ name: 'lid', bone: B.lid, model: item.lid });
  }
  coinSpots().forEach((c, i) => parts.push({ bone: B.coin0 + i, model: buildCoin(c) }));
  [B.steam0, B.steam1, B.steam2].forEach((b) => parts.push({ bone: b, model: buildPuff(BIND[b]) }));
  const geo = mergeSkinned(parts);
  g = { geo, look: L, hatTop: hatInfo.top, itemMode: item ? item.mode : 'none', tris: geo.index.count / 3 };
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
let _types = null;
export function registerBearTypes(types) { _types = types; }

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

// ------------------------------------------------------------------ pose frame
const CH = 9; // rx ry rz px py pz sx sy sz
const EX = NB * CH; // extras
const X_HOLD = EX, X_JAW = EX + 3, X_LOOKX = EX + 4, X_LOOKY = EX + 5, X_ITEMRIGID = EX + 6, X_PROPSPIN = EX + 7;
const NCH = EX + 8;

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
    const o = b * CH, a = this.a, bp = BIND[b];
    let dx = tx - (bp.x + a[o + 3]), dy = ty - (bp.y + a[o + 4]), dz = tz - (bp.z + a[o + 5]);
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    a[o] = Math.atan2(-dz, -dy);
    a[o + 1] = 0;
    a[o + 2] = Math.asin(clamp(dx, -1, 1));
    if (stretch) {
      const s = clamp(1 + (l / len - 1) * stretch, 0.82, 1.32);
      const k = 1 / Math.sqrt(s);
      a[o + 6] = k; a[o + 7] = s; a[o + 8] = k;
    }
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
        F.aim(B.armL, -3.2, 11.5 + pat * 1.2, 8.3, 0.5);
        F.aim(B.armR, 3.2, 11.5 + (1 - pat) * 1.2, 8.3, 0.5);
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
    const hx = 0, hy = lerp(11, 18.3, clutch), hz = lerp(14, 9.9, clutch);
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
    const raise = smooth(0, 0.18, t);
    // hold the fish right under the mouth; it hops up into each bite
    const hy = lerp(15.5, 18.3, raise) + nod * 0.5 + squash * 0.8;
    F.hold(0, hy, 9.9 + squash * 0.3);
    F.ap(B.armL, 1.5, 0.6, 2.6); F.ap(B.armR, -1.5, 0.6, 2.6);
    F.aim(B.armL, -3.1, hy - 0.3, 9.4, 0.9);
    F.aim(B.armR, 3.1, hy - 0.3, 9.4, 0.9);
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
    F.aim(B.armR, 2.2 + Math.cos(a) * 1.8, 12.2 + Math.sin(a) * 1.8, 8.6, 0.7);
    F.aim(B.armL, -2.2 - Math.cos(a + 1.2) * 1.6, 12.2 + Math.sin(a + 1.2) * 1.6, 8.6, 0.7);
    F.mulS(B.belly, 1 + 0.035 * Math.sin(a * 2), 1 - 0.025 * Math.sin(a * 2), 1 + 0.04 * Math.sin(a * 2));
    F.r(B.tail, 0, 0, Math.sin(t * 30) * 0.6);
    F.r(B.earL, 0, 0, 0.12 * wig); F.r(B.earR, 0, 0, 0.12 * wig);
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
    F.aim(B.armL, -3.8, 11 + pat * 1.4, 8.8, 0.6);
    F.aim(B.armR, 3.8, 11 + pat2 * 1.4, 8.8, 0.6);
    F.ar(B.head, 0.04 + 0.03 * br, 0, 0.08 * Math.sin(t * 0.8));
    F.r(B.tail, 0, 0, 0);
    F.s(B.tail, 1, 0.6, 1);
    const sleepy = (t % 7) > 3.5;
    c.face = sleepy ? 'sleepy' : 'happy';
  },
};

// ------------------------------------------------------------------ rig
const _wp = new THREE.Vector3();

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
    for (let i = 0; i < NB; i++) {
      const b = new THREE.Bone();
      b.name = BONE_DEFS[i][0];
      const p = PARENT[i];
      const bp = BIND[i], pp = p >= 0 ? BIND[p] : _v1.set(0, 0, 0);
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
    this.body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.8, 0.2), 3.1);
    this.body.boundingBox = new THREE.Box3(new THREE.Vector3(-1.4, -0.2, -1.2), new THREE.Vector3(1.4, 4.1, 1.6));

    // face
    this.face = new BearFace({ fur: def.fur, furLight: def.furLight, cub: G.look.cub, glasses: def.glasses, shades: def.shades, monocle: def.monocle });
    this.faceMat = new THREE.MeshLambertMaterial({ map: this.face.texture, transparent: true, alphaTest: 0.5 });
    if (!sharedFaceGeo) sharedFaceGeo = faceGeometry();
    this.faceMesh = new THREE.SkinnedMesh(sharedFaceGeo, this.faceMat);
    this.faceMesh.name = 'bearFace';
    this.faceMesh.bind(this.skeleton, this.body.bindMatrix);
    this.faceMesh.boundingSphere = this.body.boundingSphere;
    this.faceMesh.boundingBox = this.body.boundingBox;
    this.faceMesh.castShadow = false;
    this.scaler.add(this.body, this.faceMesh);

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

    this.meshes = [this.body];
    this.shadows = true;
    this.matState = 'normal';
    this.ownMat = null;
    this.held = null;
    this.chomps = 0;
    this.events = [];
    this.onEvent = null;

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
    this._lastT01 = 0;
    this._eventsFired = new Set();
    this.ctx = { rig: this, t: 0, t01: 0, speed: 0, moveAmp: 0, phase: 0, swimT: 0, inWater: false, time: 0, params: {}, P: this.P, face: 'neutral', restArms: [new Float32Array(9), new Float32Array(9)] };
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
    if (kind === 'angry') { fc.setRGB(1.4, 0.7, 0.65); fe.setRGB(0, 0, 0); } else if (kind === 'flash') { fc.setRGB(2.2, 2.2, 2.2); fe.setRGB(0.25, 0.25, 0.25); } else { fc.setRGB(1, 1, 1); fe.setRGB(0, 0, 0); }
  }

  // slight per-bear tint / size / personality so a wave isn't a clone army
  personalize(seed) {
    const r = mulberry32(Math.floor(Math.abs(seed) * 9973 + 0.5) ^ 0x5bd1e995);
    const k = 0.92 + r() * 0.16;
    const warm = (r() - 0.5) * 0.09;
    if (!this.ownMat) this.ownMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.ownMat.color.setRGB(k * (1 + warm), k, k * (1 - warm));
    const P = this.P;
    P.size = 0.955 + r() * 0.09;
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
    if (name !== this.cur) {
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
    }
    this.time += dt;
    // gait phase follows distance travelled
    const speed = params.speed ?? 0;
    const sc = this.def.scale * this.P.size;
    const stride = (name === 'run' ? 2.3 : name === 'sad' ? 1.3 : 1.35) * sc;
    let cad = speed / stride;
    if (name === 'run') cad = clamp(cad, 1.25, 2.3);
    else if (speed > 0.02) cad = clamp(cad, 0.55, 1.75);
    const moveAmp = clamp(speed / (0.9 * sc), 0, 1);
    c.moveAmp = name === 'run' ? Math.max(0.5, moveAmp) : moveAmp;
    const prevPhase = this.phase;
    if (name === 'run' || c.moveAmp > 0.02) this.phase += dt * cad * Math.PI * 2;
    this.swimT += dt * (4.2 + Math.min(1, speed / 2) * 3.2);
    // footfall events
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI) && (name === 'walk' || name === 'run' || name === 'angry_stomp' || name === 'sad' || name === 'search')) {
      this._event(name === 'angry_stomp' ? 'stomp' : 'step', true);
      if (name === 'run') this.sp.squash.kick(-0.5 * this.P.bounce);
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
    POSES[name](F, c);
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
    // face timers are part of the pose tick unless update() already ran this frame
    if (this._tickedByUpdate) this._tickedByUpdate = false;
    else { this._tickFace(dt); this._tickedByPose = true; }
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
    if (name === 'slam') { this.sp.squash.kick(-2.2); this.sp.hatY.kick(9); }
    if (this.onEvent) this.onEvent(name, this);
  }

  _setChomps(n) {
    if (n > this.chomps) {
      this.chomps = n;
      this._event('chomp', true);
      this.sp.squash.kick(-1.1 - (n === 3 ? 0.8 : 0));
      this.sp.bellyS.kick(3);
      this.sp.hatY.kick(n === 3 ? 7 : 3);
      this.sp.earLz.kick(-3); this.sp.earRz.kick(3);
      if (this.held) this.held.userData.bitten = n;
    }
  }

  _land() {
    this.sp.squash.kick(-5.2);
    this.sp.hatY.kick(16);
    this.sp.earLz.kick(9); this.sp.earRz.kick(-9);
    this.sp.bellyS.kick(-6);
    this._event('land', true);
  }

  _applyScale() {
    const s = VS * this.def.scale * this.P.size;
    this.scaler.scale.set(s, s, s);
    this.restScale[B.belly] = this.look.belly * this.P.chub;
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
    if (this.held || this.itemMode === 'none') bones[B.item].scale.setScalar(HIDE);
    if (this._legsHidden) { bones[B.legL].scale.setScalar(HIDE); bones[B.legR].scale.setScalar(HIDE); }
    // hold anchor
    const sp = BIND[B.spine];
    this.holdAnchor.position.set((a[X_HOLD] - sp.x) * 0.1, (a[X_HOLD + 1] - sp.y) * 0.1, (a[X_HOLD + 2] - sp.z) * 0.1);
    // toss: the prop rides in the right paw
    if (this.held) {
      const want = name === 'toss' ? this.handAnchorR : this.holdAnchor;
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
    const aH = this._measure('head', bones[B.head], dt, rq, inv);
    const aB = this._measure('belly', bones[B.belly], dt, rq, inv);
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
    const Lp = mode === 'hang' ? 0.32 : 0.5;
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
        X.k = 60; X.c = 9; Z.k = 60; Z.c = 9;
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
