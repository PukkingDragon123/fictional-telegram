// [v26 staff] BeaverChibi: the procedural staff beaver. A Reynard-style voxel
// chibi (big head, drawn pixel face with expressive eyes + buck teeth, chubby
// cheeks, little paws, a flat crosshatched paddle tail) with a seeded look and
// clothes for the job.
//
//   const b = new BeaverChibi({ look, outfit: 'apron', seed });  scene.add(b.root);
//   b.play('serve'); b.update(dt); b.setOutfit('hivis'); b.setLook(look, seed); b.dispose();
//   b.onEvent = (name) => {};  // 'step' | 'chop_hit' | 'hammer_hit' | 'thump' | 'munch' | 'splash' | 'snore'
//
// Cheap enough for dozens on screen: the whole body (+ clothes + face) is ONE
// skinned mesh (one draw call), its geometry shared by every beaver with the same
// outfit / shape and coloured by a per-beaver palette uniform (32 slots: fur,
// belly, cloth...). Props (mallet, broom, tray, towels...) are a second skinned
// mesh shared by all rigs, hidden unless an anim shows one. The face is a small
// 64x32 canvas per beaver, redrawn only when the expression changes.
//
// Look (src/data/staffGen.js rollLook): fur, belly, bellyShape, blush, brow, tuft,
// freckles, eye, gap, teeth, acc, accCol, cloth, chubby, ear, size.
// Outfits: overalls hardhat apron robe chef labcoat hivis toolbelt bandana medic tie
// Anims: idle walk run carry carry_idle carry_log chop hammer plow eat_berry swim cheer
//   sleep wave type sweep fold serve weld sit stretch hurt dizzy lie_stretcher
//   carry_stretcher stretcher_idle celebrate limp pickup nervous tap_foot talk
// Units: 1 voxel = 0.05 inside `space` (scaled 0.8). Root at the feet, facing +Z.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, hash3, mirrorX, CritterRig, K, pulse, beat,
  sin, cos, abs, max, min, PI, TAU, clamp, smooth, ZZZ_ROWS, HEART_ROWS, SPARK_ROWS, pixTex,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { FURS, BELLIES, CLOTH } from '../data/staffGen.js';

const SPACE = 0.8; // body scale (keeps the beaver ~0.72 tall)

// ------------------------------------------------------------------ palette slots
export const SL = {
  FUR: 0, FUR_D: 1, FUR_L: 2, BELLY: 3, MUZ: 4, NOSE: 5, EARIN: 6, PAW: 7, TAIL: 8, TAIL_D: 9, TOOTH: 10,
  C1: 11, C1_D: 12, C2: 13, C2_D: 14, TRIM: 15, WHITE: 16, WHITE_D: 17, DENIM: 18, DENIM_D: 19, HAT: 20, HAT_D: 21,
  RED: 22, HIVIS: 23, HIVIS_D: 24, SILVER: 25, LEATHER: 26, LEATHER_D: 27, ACC: 28, ACC_D: 29, GOLD: 30, WOOD: 31,
  WOOD_D: 32, STEEL: 33, STEEL_D: 34, INK: 35, BERRY: 36, LEAF: 37, PAPER: 38, GLASS: 39, TUFT: 40, PENCIL: 41, PINK: 42,
  BURLAP: 43, BURLAP_D: 44, SKIN: 45, FACE: 47,
};
const NSLOT = 48;
const TONES = [1, 0.86, 1.12, 0.72];
// encoded voxel value: slot + tone (built with VoxelModel's mesher, decoded afterwards)
const V = (slot, tone = 0) => (slot << 16) | (tone << 8) | 0xff;
const tn = (x, y, z, pd = 0.12, pl = 0.1, s = 0) => { const h = hash3(x + s * 17, y - s * 5, z + s * 3); return h < pd ? 1 : h > 1 - pl ? 2 : 0; };
const vt = (slot, x, y, z, pd, pl) => V(slot, tn(x, y, z, pd, pl, slot));

// ------------------------------------------------------------------ colour helpers
const _c = new THREE.Color();
function hsl(hex) { _c.setHex(hex); const o = {}; _c.getHSL(o, THREE.SRGBColorSpace); return o; }
function fromHsl(h, s, l) { _c.setHSL(((h % 1) + 1) % 1, clamp(s, 0, 1), clamp(l, 0, 1), THREE.SRGBColorSpace); return _c.getHex(THREE.SRGBColorSpace); }
const darker = (hex, k = 0.14, hue = 0.01) => { const o = hsl(hex); return fromHsl(o.h + hue, o.s * 1.05, o.l * (1 - k * 1.6)); };
const lighter = (hex, k = 0.12) => { const o = hsl(hex); return fromHsl(o.h - 0.01, o.s * 0.95, o.l + (1 - o.l) * k * 1.6); };
const mixHex = (a, b, t) => { const A = new THREE.Color(a), B = new THREE.Color(b); return A.lerp(B, t).getHex(); };

// outfit colour schemes (C1 main, C2 accent) picked by look.cloth / accCol
const OUTFIT_COL = {
  overalls: (L) => [CLOTH[L.cloth % CLOTH.length], 0xe0a01e],
  hardhat: (L) => [CLOTH[L.cloth % CLOTH.length], 0x6a4428],
  apron: (L) => [[0xd8453b, 0x3c88d8, 0x46963c, 0xf08aa8, 0x6a5ab8, 0x30ad9c][L.cloth % 6], 0x2a1a14],
  robe: (L) => [[0xf4c6d4, 0xb8e0f0, 0xd8f0c8, 0xf6e2b0][L.cloth % 4], 0xffffff],
  chef: () => [0xd8453b, 0xffffff],
  labcoat: (L) => [[0x3c88d8, 0x46963c, 0x8a5a3a, 0x6a5ab8][L.cloth % 4], 0xd8453b],
  hivis: (L) => [[0x3a3e4a, 0x2a4a8a, 0x5a4a3a][L.cloth % 3], 0xff8a1a],
  toolbelt: (L) => [CLOTH[L.accCol % CLOTH.length], 0x6a4428],
  bandana: (L) => [[0xc83c34, 0x2f6f4a, 0x2c60b2, 0x8a2a6a][L.cloth % 4], CLOTH[(L.accCol + 2) % CLOTH.length]],
  medic: () => [0x9ad4f0, 0xd8302a],
  tie: (L) => [CLOTH[L.accCol % CLOTH.length], 0xf6f2ea],
};
const HAT_COL = { overalls: 0xffbf1a, hardhat: 0xffbf1a, hivis: 0xf6f2ea, medic: 0xf6f2ea };

/** Linear-RGB palette (Float32Array NSLOT * 3) for a look + outfit. */
export function buildPalette(look = {}, outfit = 'overalls', out = new Float32Array(NSLOT * 3)) {
  const L = { fur: 0, belly: 0, cloth: 0, accCol: 0, ...look };
  const fur = FURS[L.fur % FURS.length]?.c ?? 0x8c5530;
  const belly = BELLIES[L.belly % BELLIES.length] ?? 0xe8c592;
  const fl = hsl(fur).l;
  const [c1, c2] = (OUTFIT_COL[outfit] || OUTFIT_COL.overalls)(L);
  const acc = CLOTH[L.accCol % CLOTH.length];
  const set = (slot, hex) => { _c.setHex(hex); out[slot * 3] = _c.r; out[slot * 3 + 1] = _c.g; out[slot * 3 + 2] = _c.b; };
  set(SL.FUR, fur); set(SL.FUR_D, darker(fur, 0.16)); set(SL.FUR_L, lighter(fur, 0.12));
  set(SL.BELLY, belly); set(SL.MUZ, mixHex(belly, fur, fl > 0.6 ? 0.15 : 0.32));
  set(SL.NOSE, fl > 0.55 ? 0x5a2e2a : 0x2e1a1c); set(SL.EARIN, 0xe8968a);
  set(SL.PAW, darker(fur, fl > 0.6 ? 0.2 : 0.3)); set(SL.TAIL, mixHex(darker(fur, 0.32), 0x4a3a36, 0.5)); set(SL.TAIL_D, mixHex(darker(fur, 0.45), 0x30242a, 0.5));
  set(SL.TOOTH, 0xfff8ec);
  set(SL.C1, c1); set(SL.C1_D, darker(c1, 0.14)); set(SL.C2, c2); set(SL.C2_D, darker(c2, 0.14));
  set(SL.TRIM, 0xe8c050); set(SL.WHITE, 0xf6f2ea); set(SL.WHITE_D, 0xd8d0c8);
  set(SL.DENIM, 0x4866a2); set(SL.DENIM_D, 0x344c80);
  const hat = HAT_COL[outfit] ?? 0xffbf1a;
  set(SL.HAT, hat); set(SL.HAT_D, darker(hat, 0.12));
  set(SL.RED, 0xd8302a); set(SL.HIVIS, 0xff8a1a); set(SL.HIVIS_D, 0xd86a10); set(SL.SILVER, 0xe8eef4);
  set(SL.LEATHER, 0x7a4a24); set(SL.LEATHER_D, 0x5a3418);
  set(SL.ACC, acc); set(SL.ACC_D, darker(acc, 0.16)); set(SL.GOLD, 0xffcc34);
  set(SL.WOOD, 0xb07840); set(SL.WOOD_D, 0x8a5a2c); set(SL.STEEL, 0xb8c0cc); set(SL.STEEL_D, 0x7e8696);
  set(SL.INK, 0x2a1a20); set(SL.BERRY, 0xe8304a); set(SL.LEAF, 0x4caa3c); set(SL.PAPER, 0xf6ecd0); set(SL.GLASS, 0x8ad8ff);
  set(SL.TUFT, L.tuft === 4 ? mixHex(darker(fur, 0.25), 0xd8453b, 0.25) : darker(fur, 0.22));
  set(SL.PENCIL, 0xf2c230); set(SL.PINK, 0xf08aa8); set(SL.BURLAP, 0xc8a46a); set(SL.BURLAP_D, 0xa08050); set(SL.SKIN, 0xf0c0a8);
  set(SL.FACE, 0xffffff);
  return out;
}

// ------------------------------------------------------------------ skeleton (voxels, body space)
const D = {
  HIP_Y: 2.4, CHEST: 2.0, NECK: [0, 3.3, 0.2], SH: [2.9, 2.5, 0.3], UP: 1.8, FORE: 1.8,
  LEG: [1.6, -0.4, 0.3], TAIL0: [0, 0.3, -2.6], TAIL: [0, -0.5, -1.3], EAR: [4.6, 8.6, -1.2], HAT: [0, 9.6, -0.3],
};
// bone order (shared by every rig + geometry)
const BONES = [
  ['mover', null, 0, 0, 0], ['hips', 'mover', 0, D.HIP_Y, 0], ['chest', 'hips', 0, D.CHEST, 0], ['head', 'chest', ...D.NECK],
  ['earL', 'head', D.EAR[0], D.EAR[1], D.EAR[2]], ['earR', 'head', -D.EAR[0], D.EAR[1], D.EAR[2]], ['hatG', 'head', ...D.HAT],
  ['armL', 'chest', D.SH[0], D.SH[1], D.SH[2]], ['foreL', 'armL', 0, -D.UP, 0], ['gripL', 'foreL', 0, -2.4, 0.3],
  ['armR', 'chest', -D.SH[0], D.SH[1], D.SH[2]], ['foreR', 'armR', 0, -D.UP, 0], ['gripR', 'foreR', 0, -2.4, 0.3],
  ['legL', 'hips', D.LEG[0], D.LEG[1], D.LEG[2]], ['legR', 'hips', -D.LEG[0], D.LEG[1], D.LEG[2]],
  ['tail0', 'hips', ...D.TAIL0], ['tail', 'tail0', ...D.TAIL],
  ['logJ', 'mover', 0, 19.6, 0.2], ['carryJ', 'chest', 0, 0.6, 3.6], ['hat', 'head', ...D.HAT],
  // props (scaled to ~0 when hidden)
  ['p_mallet', 'gripR', 0, 0, 0], ['p_broom', 'gripR', 0, 0, 0], ['p_torch', 'gripR', 0, 0, 0], ['p_pick', 'gripR', 0, 0, 0],
  ['p_tray', 'gripL', 0, 0.2, 0.4], ['p_towels', 'chest', 0, 0.2, 3.2], ['p_box', 'carryJ', 0, 0, 0], ['p_type', null, 0, 0, 5.4],
  ['p_mask', 'head', 0, 6.6, 5.2], ['p_bandage', 'head', 0, 0, 0], ['p_berry', 'head', 0, 1.2, 8.2], ['p_log', 'logJ', 0, 0, 0],
  ['p_sack', 'logJ', 0, 0, 0], ['p_barrow', 'mover', 0, 0, 10.5], ['p_wheel', 'p_barrow', 0, 1.6, 0], ['p_hammer2', 'gripL', 0, 0, 0],
];
const PROPS = ['mallet', 'broom', 'torch', 'pick', 'tray', 'towels', 'box', 'type', 'mask', 'bandage', 'berry', 'log', 'sack', 'barrow'];

// ------------------------------------------------------------------ voxel parts
const HAS_HAT = { overalls: 'hard', hardhat: 'hard', hivis: 'hard', chef: 'chef', bandana: 'band', medic: 'cap', robe: 'turban' };
function furV(x, y, z) { return vt(SL.FUR, x, y, z, 0.14, 0.1); }

// belly patch test (x, y in the part's front plane)
function bellyIn(shape, x, y, cy, rx, ry) {
  if (shape === 3) return false;
  const fx = (x + 0.5) / rx, fy = (y + 0.5 - cy) / ry;
  if (shape === 1) return fx * fx * 1.6 + fy * fy * 0.75 <= 1;
  if (shape === 2) { // heart
    const ax = Math.abs(fx), yy = -fy;
    return (ax * ax + (yy - Math.sqrt(ax) * 0.7) ** 2) <= 0.7;
  }
  return fx * fx + fy * fy <= 1;
}

function pelvisModel(o) {
  const v = new VoxelModel();
  const ch = o.chubby ? 0.7 : 0;
  const rx = 3.3 + ch, rz = 3.0 + ch * 0.6;
  const pants = o.outfit === 'overalls' || o.outfit === 'bandana' ? 'denim' : o.outfit === 'medic' ? 'scrub' : o.outfit === 'robe' ? 'robe' : o.outfit === 'labcoat' ? 'coat' : o.outfit === 'chef' ? 'chef' : null;
  ell(v, 0, 0.5, 0.0, rx, 2.5, rz, (x, y, z) => {
    if (pants === 'denim') return y === 2 ? V(SL.DENIM_D) : vt(SL.DENIM, x, y, z, 0.12, 0.06);
    if (pants === 'scrub') return vt(SL.C1, x, y, z, 0.1, 0.06);
    if (pants === 'robe' || pants === 'coat' || pants === 'chef') return vt(SL.WHITE, x, y, z, 0.16, 0.1);
    if (z >= 1 && bellyIn(o.bellyShape, x, y, 1.8, 2.6 + ch * 0.6, 2.6)) return vt(SL.BELLY, x, y, z, 0.1, 0.08);
    return furV(x, y, z);
  });
  // apron / tool belt / robe belt round the waist
  const belt = o.outfit === 'hardhat' || o.outfit === 'toolbelt';
  for (const [k, c] of v.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    const out = !v.has(x + 1, y, z) || !v.has(x - 1, y, z) || !v.has(x, y, z + 1) || !v.has(x, y, z - 1);
    if (!out) continue;
    if (belt && y === 2) v.vox.set(k, (x + z) % 3 === 0 ? V(SL.LEATHER_D) : V(SL.LEATHER));
    if (o.outfit === 'robe' && y === 2) v.vox.set(k, V(SL.C1));
    if (o.outfit === 'apron' && z >= 1 && Math.abs(x + 0.5) <= 2.6 && y <= 2) v.vox.set(k, y === -1 ? V(SL.C1_D) : vt(SL.C1, x, y, z, 0.08, 0.05));
    void c;
  }
  if (belt) {
    // buckle + pouches + a hammer handle
    const zf = Math.ceil(rz) - 1;
    v.set(-1, 2, zf + 1, V(SL.TRIM)); v.set(0, 2, zf + 1, V(SL.TRIM));
    for (const [x, z] of [[-4 - (ch ? 1 : 0), 1], [3 + (ch ? 1 : 0), 0]]) { v.set(x, 2, z, V(SL.LEATHER_D)); v.set(x, 1, z, V(SL.LEATHER)); v.set(x, 0, z, V(SL.LEATHER_D)); }
    v.set(3 + (ch ? 1 : 0), 3, -1, V(SL.WOOD)); v.set(3 + (ch ? 1 : 0), 4, -1, V(SL.STEEL));
  }
  if (o.outfit === 'apron') { for (const x of [-3, 2]) v.set(x, 2, 2, V(SL.C1_D)); }
  if (o.outfit === 'labcoat') {
    // the coat tails flare a little at the back + a pocket
    for (let x = -3; x <= 2; x++) v.set(x, -2, -3, V(SL.WHITE_D));
    v.set(2, 1, 3, V(SL.WHITE_D)); v.set(3, 1, 2, V(SL.WHITE_D));
  }
  return v;
}

function chestModel(o) {
  const v = new VoxelModel();
  const ch = o.chubby ? 0.5 : 0;
  const rx = 2.9 + ch, rz = 2.6 + ch * 0.5;
  const O = o.outfit;
  const shirt = { overalls: 'c1', hardhat: 'c1', apron: 'white', robe: 'robe', chef: 'white', labcoat: 'coat', hivis: 'c1', toolbelt: null, bandana: 'plaid', medic: 'c1', tie: 'white' }[O];
  ell(v, 0, 1.3, 0.1, rx, 2.4, rz, (x, y, z) => {
    if (shirt === 'c1') return vt(SL.C1, x, y, z, 0.1, 0.06);
    if (shirt === 'white' || shirt === 'robe' || shirt === 'coat') return vt(SL.WHITE, x, y, z, shirt === 'robe' ? 0.22 : 0.1, 0.1);
    if (shirt === 'plaid') return ((x + 20) % 3 === 0 || (y + 20) % 3 === 0) ? V(SL.C1_D, ((x + 20) % 3 === 0 && (y + 20) % 3 === 0) ? 3 : 0) : vt(SL.C1, x, y, z, 0.06, 0.06);
    if (z >= 1 && bellyIn(o.bellyShape, x, y, -0.4, 2.3 + ch * 0.5, 2.8)) return vt(SL.BELLY, x, y, z, 0.1, 0.08);
    return furV(x, y, z);
  });
  const front = (x, y) => { for (let z = 8; z >= -8; z--) if (v.has(x, y, z)) return z; return null; };
  const back = (x, y) => { for (let z = -8; z <= 8; z++) if (v.has(x, y, z)) return z; return null; };
  const paint = (x, y, c, dz = 0) => { const z = front(x, y); if (z !== null) v.set(x, y, z + dz, c); };
  if (O === 'overalls') {
    // bib + straps + brass buttons
    for (let x = -2; x <= 1; x++) for (let y = -1; y <= 2; y++) paint(x, y, y === 2 || x === -2 || x === 1 ? V(SL.DENIM_D) : vt(SL.DENIM, x, y, 0, 0.1, 0.05), 1);
    for (const x of [-2, 1]) for (let y = 2; y <= 3; y++) { paint(x, y, V(SL.DENIM_D), 1); const zb = back(x, y); if (zb !== null) v.set(x, y, zb - 1, V(SL.DENIM_D)); }
    for (const x of [-2, 1]) paint(x, 2, V(SL.TRIM), 2);
    paint(-1, 0, V(SL.DENIM_D), 2); paint(0, 0, V(SL.DENIM_D), 2); // bib pocket
  } else if (O === 'apron') {
    for (let x = -2; x <= 1; x++) for (let y = -1; y <= 2; y++) paint(x, y, vt(SL.C1, x, y, 0, 0.06, 0.05), 1);
    for (const x of [-2, 1]) paint(x, 3, V(SL.C1_D), 1);
    paint(-1, 3, V(SL.C1_D), 1); paint(0, 3, V(SL.C1_D), 1);
    // bow tie
    paint(-1, 3, V(SL.C2), 2); paint(0, 3, V(SL.C2), 2); paint(-2, 3, V(SL.C2_D), 2); paint(1, 3, V(SL.C2_D), 2);
  } else if (O === 'robe') {
    // lapels crossing + belt + fluffy collar
    for (let y = 0; y <= 3; y++) { paint(-1 + Math.floor((3 - y) / 2), y, V(SL.WHITE_D), 1); }
    for (let x = -3; x <= 2; x++) { const z = front(x, -1); if (z !== null) v.set(x, -1, z, V(SL.C1)); }
    for (let x = -3; x <= 2; x++) for (let z = -2; z <= 2; z++) if (v.has(x, 3, z) && !v.has(x, 4, z)) v.set(x, 4, z, vt(SL.WHITE, x, 4, z, 0.3, 0.1));
  } else if (O === 'chef') {
    for (const x of [-2, 1]) for (const y of [0, 1, 2]) paint(x, y, V(SL.WHITE_D), 1);
    for (let x = -2; x <= 1; x++) paint(x, 3, V(SL.C1), 1);
    paint(-1, 2, V(SL.C1), 1); paint(0, 2, V(SL.C1_D), 1);
  } else if (O === 'labcoat') {
    // open coat: shirt + tie down the middle, lapels, a pocket with pens
    for (let y = -1; y <= 3; y++) { paint(-1, y, V(SL.C1), 0); paint(0, y, V(SL.C1), 0); }
    for (let y = -1; y <= 3; y++) paint(y % 2 ? 0 : -1, y, V(SL.C2), 1);
    for (const x of [-2, 1]) for (let y = 1; y <= 3; y++) paint(x, y, V(SL.WHITE_D), 1);
    paint(2, 1, V(SL.WHITE_D), 1); paint(2, 2, V(SL.BERRY), 2); paint(2, 3, V(SL.DENIM), 2);
  } else if (O === 'hivis') {
    for (let x = -4; x <= 3; x++) for (let y = -1; y <= 3; y++) {
      if (Math.abs(x + 0.5) < 1 && y > 0) continue;
      const z = front(x, y); if (z === null) continue;
      v.set(x, y, z, y === 0 ? V(SL.SILVER) : vt(SL.HIVIS, x, y, z, 0.08, 0.05));
      const zb = back(x, y); if (zb !== null) v.set(x, y, zb, y === 0 || y === 2 ? V(SL.SILVER) : V(SL.HIVIS));
    }
  } else if (O === 'medic') {
    // a white tabard with a red cross
    for (let x = -2; x <= 1; x++) for (let y = -1; y <= 2; y++) paint(x, y, V(SL.WHITE), 1);
    paint(-1, 1, V(SL.RED), 2); paint(0, 1, V(SL.RED), 2); paint(-1, 0, V(SL.RED), 2); paint(0, 0, V(SL.RED), 2); paint(-2, 1, V(SL.RED), 2); paint(1, 1, V(SL.RED), 2); paint(-1, 2, V(SL.RED), 2); paint(0, 2, V(SL.RED), 2);
  } else if (O === 'tie') {
    for (let y = -1; y <= 3; y++) paint(y === 3 ? -1 : (y % 2 ? 0 : -1), y, V(SL.C1, y === -1 ? 1 : 0), 1);
    paint(0, 3, V(SL.C1), 1);
    for (const x of [-2, 1]) paint(x, 3, V(SL.WHITE_D), 1);
  } else if (O === 'toolbelt') {
    // a neckerchief
    for (let x = -3; x <= 2; x++) for (let z = -2; z <= 2; z++) if (v.has(x, 3, z) && !v.has(x, 4, z)) v.set(x, 3, z, V(SL.C1));
    paint(-1, 2, V(SL.C1), 1); paint(0, 2, V(SL.C1_D), 1); paint(-1, 1, V(SL.C1_D), 1);
  } else if (O === 'bandana') {
    for (let x = -1; x <= 0; x++) paint(x, 3, V(SL.WHITE_D), 0);
  }
  // accessories round the neck
  if (o.acc === 'scarf') {
    for (let x = -4; x <= 3; x++) for (let z = -3; z <= 3; z++) if (v.has(x, 3, z)) { const out = !v.has(x + 1, 3, z) || !v.has(x - 1, 3, z) || !v.has(x, 3, z + 1) || !v.has(x, 3, z - 1); if (out) v.set(x, 3, z, (x + z) % 2 ? V(SL.ACC_D) : V(SL.ACC)); }
    for (let y = 0; y <= 2; y++) paint(2, y, y % 2 ? V(SL.ACC_D) : V(SL.ACC), 1);
  }
  return v;
}

function headModel(o) {
  const v = new VoxelModel();
  const hatK = HAS_HAT[o.outfit];
  const col = (x, y, z) => {
    if (y >= 8 && z <= -2) return vt(SL.FUR_D, x, y, z, 0.1, 0.1);
    if (z >= 2 && y <= 3 && Math.abs(x + 0.5) <= 4.6) return vt(SL.MUZ, x, y, z, 0.1, 0.06);
    return furV(x, y, z);
  };
  rbox(v, -6, 5, 0, 9, -5, 4, 3.3, col);
  ell(v, 0, 5.2, -0.4, 6.2, 5.0, 5.0, (x, y, z) => (z > 4 ? null : col(x, y, z)));
  // chubby cheek pouches
  for (const s of [-1, 1]) ell(v, s * 4.6, 2.8, 2.6, 2.0, 1.8, 1.7, (x, y, z) => vt(SL.MUZ, x, y, z, 0.12, 0.06));
  // muzzle + nose
  rbox(v, -2, 1, 0, 3, 4, 6, 0.9, (x, y, z) => vt(SL.MUZ, x, y, z, 0.1, 0.12));
  v.set(-1, 3, 7, V(SL.NOSE)); v.set(0, 3, 7, V(SL.NOSE, 2));
  // buck teeth peeking under the muzzle
  v.set(-1, -1, 6, V(SL.TOOTH)); v.set(0, -1, 6, V(SL.TOOTH));
  if (o.teeth) { v.set(-1, -1, 5, V(SL.TOOTH, 1)); v.set(0, -1, 5, V(SL.TOOTH, 1)); }
  // hair tuft (hidden under hats)
  if (!hatK || hatK === 'band') {
    const T = (x, y, z) => v.set(x, y, z, vt(SL.TUFT, x, y, z, 0.15, 0.15));
    if (o.tuft === 1) { T(-1, 10, 1); T(-1, 11, 1); T(0, 12, 1); T(1, 12, 0); T(1, 11, 0); }
    else if (o.tuft === 2) { for (const [x, z, h] of [[-2, 1, 2], [0, 0, 3], [2, -1, 2]]) for (let y = 10; y < 10 + h; y++) T(x, y, z); T(-1, 10, 0); T(1, 10, 0); }
    else if (o.tuft === 3) { for (let x = -4; x <= 1; x++) T(x, 10, 2 - Math.floor((x + 4) / 3)); T(-4, 9, 4); T(-3, 9, 4); T(-5, 9, 3); T(2, 10, 0); }
    else if (o.tuft === 4) { for (let z = -3; z <= 3; z++) { T(-1, 10, z); T(0, 10, z); if (z > -2 && z < 3) { T(-1, 11, z); T(0, 11, z); } } }
  }
  // accessories on the head
  if (o.acc === 'bow' && hatK !== 'chef' && hatK !== 'turban') {
    const bx = 3, by = 9, bz = 1;
    for (const [dx, dy] of [[0, 0], [1, 1], [1, -1], [2, 1], [2, 0], [2, -1], [-1, 1], [-1, -1], [-2, 1], [-2, 0], [-2, -1]]) v.set(bx + dx, by + dy, bz, dx === 0 ? V(SL.ACC_D) : V(SL.ACC));
  }
  if (o.acc === 'pencil') { for (let z = -2; z <= 2; z++) v.set(-6, 7, z, z === 2 ? V(SL.WOOD) : V(SL.PENCIL)); v.set(-6, 7, -3, V(SL.PINK)); v.set(-6, 7, 3, V(SL.INK)); }
  if (o.outfit === 'labcoat') {
    // goggles pushed up on the forehead
    for (let x = -5; x <= 4; x++) { const z = (() => { for (let zz = 6; zz >= -6; zz--) if (v.has(x, 8, zz)) return zz; return 3; })(); v.set(x, 8, z + 1, Math.abs(x + 0.5) > 1 && Math.abs(x + 0.5) < 4 ? V(SL.GLASS) : V(SL.INK)); }
  }
  return v;
}

function earModel(o, side) {
  const v = new VoxelModel();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) {
    if (Math.abs(x) + Math.abs(y) > 1 && y < 0) continue;
    if (o.ear && x === side && y === 1) continue; // a nibbled notch
    v.set(x, y, 0, vt(SL.FUR_D, x, y, 0, 0.1, 0.1));
    if (y <= 0 && Math.abs(x) <= 0) v.set(x, y, 1, V(SL.EARIN));
  }
  v.set(0, 0, -1, V(SL.FUR_D));
  if (o.acc === 'earring' && side > 0) v.set(0, -2, 0, V(SL.GOLD));
  return v;
}

function hatModel(o) {
  const v = new VoxelModel();
  const k = HAS_HAT[o.outfit];
  if (k === 'hard') {
    for (let x = -7; x <= 6; x++) for (let z = -7; z <= 7; z++) {
      const dx = (x + 0.5) / 6.6, dz = (z + 0.5) / (z > 0 ? 7.6 : 6.4);
      if (dx * dx + dz * dz > 1) continue;
      v.set(x, -1, z, dx * dx + dz * dz > 0.72 ? V(SL.HAT_D) : V(SL.HAT));
    }
    ell(v, 0, -0.6, 0, 5.5, 3.9, 5.6, (x, y, z) => (y < 0 ? null : vt(SL.HAT, x, y, z, 0.04, 0.1)));
    for (let z = -4; z <= 4; z++) v.set(-1, 3, z, V(SL.HAT, 2));
    v.set(2, 1, 5, V(SL.WHITE)); v.set(3, 1, 5, V(SL.RED));
  } else if (k === 'chef') {
    ell(v, 0, -0.4, 0, 5.2, 1.6, 5.2, (x, y, z) => (y < -1 ? null : V(SL.WHITE, 1)));
    for (let y = 1; y <= 6; y++) ell(v, 0, y, 0, 4.2 + (y > 3 ? 1.2 : 0), 1, 4.2 + (y > 3 ? 1.2 : 0), (x, yy, z) => vt(SL.WHITE, x, yy, z, 0.18, 0.12));
    ell(v, 0, 7.2, 0, 5.2, 1.6, 5.2, (x, y, z) => vt(SL.WHITE, x, y, z, 0.2, 0.14));
  } else if (k === 'band') {
    ell(v, 0, -0.6, -0.4, 5.6, 2.6, 5.4, (x, y, z) => (y < -1 ? null : ((x + y + z) % 4 === 0 ? V(SL.WHITE) : vt(SL.C2, x, y, z, 0.1, 0.06))));
    for (const [x, y, z] of [[0, -1, -6], [-1, -1, -6], [0, -2, -7], [1, -2, -7], [-1, -3, -7]]) v.set(x, y, z, V(SL.C2_D));
  } else if (k === 'cap') {
    ell(v, 0, -0.6, 0, 5.4, 3.2, 5.4, (x, y, z) => (y < 0 ? null : vt(SL.WHITE, x, y, z, 0.06, 0.08)));
    for (let x = -4; x <= 3; x++) for (let z = 5; z <= 8; z++) if (Math.abs(x + 0.5) < 4.6 - (z - 5) * 0.6) v.set(x, 0, z, V(SL.WHITE_D));
    for (const [x, y] of [[-1, 1], [0, 1], [-1, 2], [0, 2], [-2, 2], [1, 2], [-1, 3], [0, 3]]) v.set(x, y, 5, V(SL.RED));
  } else if (k === 'turban') {
    ell(v, 0, 0.6, -0.4, 5.8, 3.8, 5.8, (x, y, z) => (y < -1 ? null : ((y + Math.round(x * 0.5) + 30) % 3 === 0 ? V(SL.C1_D) : vt(SL.C1, x, y, z, 0.18, 0.12))));
    ell(v, 1.5, 4.4, 1.5, 2.2, 1.6, 2.2, (x, y, z) => vt(SL.C1, x, y, z, 0.2, 0.1));
  }
  return v;
}

function upperModel(o) {
  const v = new VoxelModel();
  const O = o.outfit;
  const sleeve = { overalls: SL.C1, hardhat: SL.C1, apron: SL.WHITE, robe: SL.WHITE, chef: SL.WHITE, labcoat: SL.WHITE, hivis: SL.C1, bandana: SL.C1, medic: SL.C1, tie: SL.WHITE }[O];
  rbox(v, -1, 0, -2, -1, -1, 0, 0.6, (x, y, z) => (sleeve != null ? vt(sleeve, x, y, z, O === 'robe' ? 0.25 : 0.08, 0.08) : furV(x, y, z)));
  // a round chubby shoulder
  ell(v, -0.0, -0.2, -0.0, 1.5, 1.3, 1.5, (x, y, z) => (y < -1 ? null : sleeve != null ? (O === 'bandana' && (x + y) % 2 ? V(SL.C1_D) : V(sleeve)) : furV(x, y, z)));
  if (O === 'medic') for (const [x, z] of [[-1, 0], [0, 0], [-1, -1], [0, -1]]) v.set(x, -2, z, V(SL.RED));
  return v;
}
function foreModel(o) {
  const v = new VoxelModel();
  const O = o.outfit;
  const longSleeve = O === 'robe' || O === 'chef' || O === 'labcoat' || O === 'tie';
  rbox(v, -1, 0, -2, -1, -1, 0, 0.6, (x, y, z) => (longSleeve ? vt(SL.WHITE, x, y, z, 0.1, 0.08) : furV(x, y, z)));
  if (longSleeve) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, -2, z, V(SL.WHITE_D));
  // little paw
  rbox(v, -1, 0, -4, -3, -1, 1, 0.7, (x, y, z) => vt(SL.PAW, x, y, z, 0.1, 0.06));
  v.set(-1, -4, 1, V(SL.PAW, 1)); v.set(0, -4, 1, V(SL.PAW, 1));
  return v;
}
function legModel(o) {
  const v = new VoxelModel();
  const pants = o.outfit === 'overalls' || o.outfit === 'bandana' ? SL.DENIM : o.outfit === 'medic' ? SL.C1 : null;
  rbox(v, -1, 0, -1, 0, -1, 0, 0.5, (x, y, z) => (pants != null ? V(pants, y === -1 ? 1 : 0) : furV(x, y, z)));
  // big webbed back feet
  for (let x = -2; x <= 1; x++) for (let z = -1; z <= 2; z++) {
    if ((x === -2 || x === 1) && z === -1) continue;
    v.set(x, -2, z, z === 2 && (x + 2) % 2 === 0 ? V(SL.PAW, 2) : V(SL.PAW));
  }
  return v;
}
function tail0Model() {
  const v = new VoxelModel();
  rbox(v, -1, 0, -1, 0, -2, -1, 0.6, (x, y, z) => vt(SL.FUR_D, x, y, z, 0.1, 0.1));
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++) for (let z = -9; z <= 0; z++) {
    const dx = (x + 0.5) / 3.3, dz = (z + 4.6) / 5;
    if (dx * dx + dz * dz > 1) continue;
    const hatch = (x + z + 40) % 2 === 0;
    v.set(x, 0, z, hatch ? V(SL.TAIL, 2) : V(SL.TAIL, (x * 3 + z) % 5 === 0 ? 1 : 0));
    if (dx * dx + dz * dz < 0.6) v.set(x, -1, z, V(SL.TAIL_D));
  }
  return v;
}

// props (fine voxels) ----------------------------------------------
function malletModel() {
  const v = new VoxelModel();
  for (let y = -2; y <= 9; y++) for (const [x, z] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) v.set(x, y, z, y < 0 ? V(SL.WOOD_D) : V(SL.WOOD, (x + z + y) % 3 === 0 ? 1 : 0));
  rbox(v, -4, 3, 9, 14, -3, 2, 1.2, (x, y, z) => (x === -4 || x === 3 ? V(SL.WOOD_D) : vt(SL.WOOD, x, y, z, 0.1, 0.2)));
  for (let y = 10; y <= 13; y++) for (let z = -2; z <= 1; z++) { v.set(-5, y, z, V(SL.STEEL)); v.set(4, y, z, V(SL.STEEL)); }
  return v;
}
function broomModel() {
  const v = new VoxelModel();
  for (let y = -10; y <= 22; y++) { v.set(0, y, 0, V(SL.WOOD)); v.set(-1, y, 0, V(SL.WOOD_D)); }
  for (let y = -17; y <= -11; y++) for (let x = -4 - Math.floor((-11 - y) / 2); x <= 3 + Math.floor((-11 - y) / 2); x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === -11 ? V(SL.RED) : V(SL.BURLAP, (x + y) % 3 === 0 ? 1 : 0));
  return v;
}
function torchModel() {
  const v = new VoxelModel();
  for (let y = -2; y <= 4; y++) for (const [x, z] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) v.set(x, y, z, V(SL.INK));
  for (let z = 0; z <= 8; z++) { v.set(0, 4, z, V(SL.STEEL)); v.set(-1, 4, z, V(SL.STEEL_D)); }
  v.set(0, 3, 8, V(SL.GOLD)); v.set(-1, 3, 8, V(SL.GOLD));
  for (let y = -6; y <= -3; y++) v.set(0, y, -1, V(SL.RED));
  return v;
}
function pickModel() {
  const v = new VoxelModel();
  for (let y = -3; y <= 16; y++) { v.set(0, y, 0, V(SL.WOOD)); v.set(-1, y, 0, V(SL.WOOD_D)); }
  for (let z = -8; z <= 7; z++) { const t = Math.abs(z + 0.5) / 7.5; const y0 = 15 - Math.round(t * t * 2); for (let y = y0; y < y0 + (t < 0.8 ? 2 : 1); y++) { v.set(0, y, z, V(SL.STEEL)); v.set(-1, y, z, V(SL.STEEL_D)); } }
  return v;
}
function trayModel() {
  const v = new VoxelModel();
  for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) { const r = Math.hypot(x + 0.5, z + 0.5); if (r > 7) continue; v.set(x, 0, z, r > 6 ? V(SL.STEEL_D) : V(SL.STEEL)); if (r > 6) v.set(x, 1, z, V(SL.STEEL)); }
  // a cup of tea + a little fish snack
  for (let y = 1; y <= 4; y++) for (let x = -4; x <= -1; x++) for (let z = -2; z <= 1; z++) { const e = x === -4 || x === -1 || z === -2 || z === 1; if (e || y === 1) v.set(x, y, z, y === 4 ? V(SL.WHITE_D) : V(SL.WHITE)); else if (y === 3) v.set(x, y, z, V(SL.WOOD)); }
  v.set(0, 2, 0, V(SL.WHITE)); v.set(0, 3, 0, V(SL.WHITE));
  for (let x = 1; x <= 5; x++) v.set(x, 1, -3, V(x === 5 ? SL.C2 : SL.GLASS)); v.set(4, 2, -3, V(SL.GLASS)); v.set(4, 1, -2, V(SL.GLASS));
  return v;
}
function towelsModel() {
  const v = new VoxelModel();
  for (let k = 0; k < 3; k++) for (let x = -5; x <= 4; x++) for (let z = -4; z <= 3; z++) for (let y = k * 3; y <= k * 3 + 2; y++) {
    if (y === k * 3 + 2 && (x === -5 || x === 4)) continue;
    v.set(x, y, z, k === 1 ? V(SL.C2, y % 3 === 1 ? 1 : 0) : V(SL.C1, y % 3 === 1 ? 1 : 0));
  }
  return v;
}
function boxModel() {
  const v = new VoxelModel();
  rbox(v, -5, 4, 0, 7, -4, 3, 0.4, (x, y, z) => (x === -5 || x === 4 || y === 0 || y === 7 || z === -4 || z === 3 ? (((x + y + z) & 3) === 0 ? V(SL.WOOD_D) : V(SL.WOOD_D, 2)) : V(SL.WOOD)));
  for (let x = -4; x <= 3; x++) v.set(x, 4, 4, V(SL.WOOD_D));
  return v;
}
function typewriterModel() {
  const v = new VoxelModel();
  // a stump with a typewriter on it
  for (let y = 0; y <= 8; y++) for (let x = -7; x <= 6; x++) for (let z = -6; z <= 5; z++) { const r = Math.hypot(x + 0.5, z + 0.5); if (r > 6.4) continue; v.set(x, y, z, y === 8 ? (Math.floor(r) % 2 ? V(SL.WOOD) : V(SL.WOOD, 2)) : r > 5.4 ? V(SL.WOOD_D, (x + y) % 3 ? 0 : 1) : V(SL.WOOD)); }
  rbox(v, -6, 5, 9, 12, -4, 3, 0.8, (x, y, z) => (y === 12 && z < 0 ? V(SL.INK, 2) : z >= 2 && y <= 10 ? ((x + 20) % 2 ? V(SL.WHITE) : V(SL.INK)) : V(SL.C2, 1)));
  for (let x = -3; x <= 2; x++) for (let y = 13; y <= 17; y++) v.set(x, y, -2, y === 17 ? V(SL.PAPER, 1) : V(SL.PAPER));
  for (let x = -7; x <= 6; x++) v.set(x, 13, -3, x === -7 || x === 6 ? V(SL.STEEL) : V(SL.INK));
  return v;
}
function maskModel() {
  const v = new VoxelModel();
  rbox(v, -10, 9, -7, 6, 0, 2, 2.2, (x, y, z) => (z === 2 && y >= -2 && y <= 1 && Math.abs(x + 0.5) < 7 ? V(SL.GLASS, 3) : V(SL.INK, (x + y) % 5 === 0 ? 2 : 0)));
  return v;
}
function bandageModel() {
  const v = new VoxelModel();
  // wraps round the head at forehead height (head-space fine voxels: head is x -12..11, y 0..19, z -10..9)
  for (let x = -13; x <= 12; x++) for (let z = -11; z <= 10; z++) {
    const inside = x > -13 && x < 12 && z > -11 && z < 10;
    if (inside && x > -12 && x < 11 && z > -10 && z < 9) continue;
    for (let y = 14; y <= 16; y++) v.set(x, y, z, V(SL.WHITE, (x + z + y) % 4 === 0 ? 1 : 0));
  }
  for (const [x, y] of [[6, 17], [7, 17], [6, 18], [7, 18], [5, 18], [8, 18]]) v.set(x, y, 10, V(SL.SKIN));
  v.set(6, 19, 10, V(SL.SKIN)); v.set(7, 19, 10, V(SL.SKIN));
  return v;
}
function berryModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.6, 2.8, 2.6, (x, y, z) => ((x + y + z) % 2 === 0 ? V(SL.BERRY, y > 0 && x < 0 ? 2 : 0) : V(SL.BERRY, 1)));
  v.set(0, 3, 0, V(SL.LEAF, 1)); v.set(-1, 3, 0, V(SL.LEAF)); v.set(1, 3, 0, V(SL.LEAF));
  return v;
}
function logModel() {
  const v = new VoxelModel();
  for (let x = -11; x <= 10; x++) for (let y = -4; y <= 3; y++) for (let z = -4; z <= 3; z++) {
    const r = Math.hypot(y + 0.5, z + 0.5);
    if (r > 4.1) continue;
    let c = V(SL.WOOD_D, (x * 7 + y * 3 + z) % 4 === 0 ? 3 : 0);
    if (x === -11 || x === 10) c = r > 3.2 ? V(SL.WOOD_D) : Math.round(r) % 2 ? V(SL.WOOD) : V(SL.WOOD, 2);
    v.set(x, y, z, c);
  }
  v.set(2, 4, 0, V(SL.WOOD_D)); v.set(2, 5, 0, V(SL.WOOD_D)); v.set(3, 6, 0, V(SL.LEAF)); v.set(2, 6, 0, V(SL.LEAF, 1));
  return v;
}
function sackModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 6, 4.5, 4.4, (x, y, z) => vt(SL.BURLAP, x, y, z, 0.2, 0.1));
  for (let x = -1; x <= 0; x++) { v.set(x, 5, 0, V(SL.BURLAP_D)); v.set(x, 6, 0, V(SL.BURLAP)); }
  return v;
}
function barrowModel() {
  const v = new VoxelModel();
  for (let x = -6; x <= 5; x++) for (let z = -16; z <= -2; z++) for (let y = 2; y <= 9; y++) {
    const inset = (9 - y) * 0.45;
    if (Math.abs(x + 0.5) > 6 - inset * 0.6 || z < -16 + inset * 0.5 || z > -2 - inset) continue;
    const wall = Math.abs(x + 0.5) > 5 - inset * 0.6 || z < -15 + inset * 0.5 || z > -3 - inset || y === 2;
    if (!wall && y > 2) continue;
    v.set(x, y, z, y === 9 ? V(SL.C2, 2) : V(SL.C2, (x + y) % 4 === 0 ? 1 : 0));
  }
  for (let x = -4; x <= 3; x++) for (let z = -14; z <= -5; z++) if ((x * 7 + z * 3) % 5 !== 0) v.set(x, 7, z, V(SL.WOOD_D, (x + z) % 2 ? 1 : 0));
  for (const s of [-1, 1]) {
    const x = s < 0 ? -5 : 4;
    for (let z = -26; z <= -4; z++) v.set(x, 3 + Math.round((z + 4) * -0.12), z, z < -22 ? V(SL.INK) : V(SL.WOOD_D));
    for (let y = 0; y <= 2; y++) v.set(x, y, -13, V(SL.WOOD_D));
  }
  return v;
}
function wheelModel() {
  const v = new VoxelModel();
  for (let y = -4; y <= 3; y++) for (let z = -4; z <= 3; z++) {
    const r = Math.hypot(y + 0.5, z + 0.5);
    if (r > 4.2) continue;
    const c = r > 3 ? V(SL.INK) : r < 1.3 ? V(SL.STEEL) : (y === 0 || z === 0 || y === -1 || z === -1) ? V(SL.STEEL) : V(SL.C2_D);
    for (let x = -1; x <= 0; x++) v.set(x, y, z, c);
  }
  return v;
}

// ------------------------------------------------------------------ geometry (merged + skinned)
const lin2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
/** Mesh a part with the shared voxel mesher (AO + greedy), then re-encode its colours: r = slot / 64, g = brightness. */
function partGeo(model, scale = VS, pivot = [0, 0, 0]) {
  const g = model.build({ pivot, scale });
  const col = g.getAttribute('color');
  const a = col.array;
  for (let i = 0; i < a.length; i += 3) {
    const k = a[i + 2] || 1e-6; // blue channel = the baked AO * face tint
    const slot = Math.round(255 * lin2s(Math.min(1, a[i] / k)));
    const tone = Math.round(255 * lin2s(Math.min(1, a[i + 1] / k)));
    a[i] = (slot + 0.25) / 64;
    a[i + 1] = (TONES[tone] ?? 1) * k;
    a[i + 2] = 0;
  }
  return g;
}

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _n3 = new THREE.Matrix3();
/** Merge parts [{ geo, bone (index), mat (bone bind matrix in mesh space) }] into one skinned geometry. */
function mergeSkinned(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geo.getAttribute('position').count; ni += p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const P = p.geo.getAttribute('position'), N = p.geo.getAttribute('normal'), C = p.geo.getAttribute('color'), U = p.geo.getAttribute('uv');
    _n3.getNormalMatrix(p.mat);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(p.mat);
      pos[(vo + i) * 3] = _p.x; pos[(vo + i) * 3 + 1] = _p.y; pos[(vo + i) * 3 + 2] = _p.z;
      _n.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      nor[(vo + i) * 3] = _n.x; nor[(vo + i) * 3 + 1] = _n.y; nor[(vo + i) * 3 + 2] = _n.z;
      col[(vo + i) * 3] = C.getX(i); col[(vo + i) * 3 + 1] = C.getY(i); col[(vo + i) * 3 + 2] = C.getZ(i);
      if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
      si[(vo + i) * 4] = p.bone; sw[(vo + i) * 4] = 1;
    }
    if (p.geo.index) { const I = p.geo.index.array; for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo; io += I.length; }
    else { for (let k = 0; k < P.count; k++) idx[io + k] = vo + k; io += P.count; }
    vo += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 9, 0), 22 * VS * 2);
  return g;
}

// face planes: eyes 48 x 22 texels at (0, 0), mouth 16 x 12 at (48, 0) of a 64 x 32 canvas; 4 texels per voxel
const FACE_W = 64, FACE_H = 32;
const EYES = { w: 48, h: 22, x0: -6, y1: 8.6, z: 5.02 };
const MOUTH = { w: 16, h: 12, x0: -2, y1: 3.9, z: 7.02 };
function faceQuad(R, cz) {
  const w = R.w / 4, h = R.h / 4;
  const x0 = R.x0, x1 = R.x0 + w, y1 = R.y1, y0 = R.y1 - h, z = R.z;
  const u0 = R.u / FACE_W, u1 = (R.u + R.w) / FACE_W, v1 = 1 - 0 / FACE_H, v0 = 1 - R.h / FACE_H;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z].map((v) => v * VS), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const c = [(SL.FACE + 0.25) / 64, 1, 1];
  g.setAttribute('color', new THREE.Float32BufferAttribute([...c, ...c, ...c, ...c], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  void cz;
  return g;
}

// bind matrices of every bone in mesh (space) coordinates, rest pose
let BIND = null;
function bindMats() {
  if (BIND) return BIND;
  const root = new THREE.Group();
  const by = {};
  for (const [name, parent, x, y, z] of BONES) {
    const b = new THREE.Object3D();
    b.position.set(x * VS, y * VS, z * VS);
    (parent ? by[parent] : root).add(b);
    by[name] = b;
  }
  root.updateMatrixWorld(true);
  BIND = BONES.map(([name]) => by[name].matrixWorld.clone());
  return BIND;
}
const BI = Object.fromEntries(BONES.map(([n], i) => [n, i]));
const geoCache = new Map(); // key -> { geo, refs }
function bodyKey(o) { return [o.outfit, o.chubby ? 1 : 0, o.tuft | 0, o.ear ? 1 : 0, o.bellyShape | 0, o.acc || 'none', o.teeth ? 1 : 0].join('|'); }
function bodyGeo(o) {
  const key = bodyKey(o);
  let e = geoCache.get(key);
  if (!e) {
    const M = bindMats();
    const parts = [];
    const add = (model, bone, scale = VS, pivot = [0, 0, 0]) => { if (model.vox.size) parts.push({ geo: partGeo(model, scale, pivot), bone: BI[bone], mat: M[BI[bone]] }); };
    add(pelvisModel(o), 'hips'); add(chestModel(o), 'chest'); add(headModel(o), 'head');
    add(earModel(o, 1), 'earL'); add(mirrorX(earModel(o, -1)), 'earR');
    add(hatModel(o), 'hatG');
    const up = upperModel(o), fo = foreModel(o), lg = legModel(o);
    add(up, 'armL'); add(mirrorX(up), 'armR'); add(fo, 'foreL'); add(mirrorX(fo), 'foreR'); add(lg, 'legL'); add(mirrorX(lg), 'legR');
    add(tail0Model(), 'tail0'); add(tailModel(), 'tail');
    parts.push({ geo: faceQuad({ ...EYES, u: 0 }), bone: BI.head, mat: M[BI.head] });
    parts.push({ geo: faceQuad({ ...MOUTH, u: 48 }), bone: BI.head, mat: M[BI.head] });
    const geo = mergeSkinned(parts);
    for (const p of parts) p.geo.dispose();
    e = { geo, refs: 0 };
    geoCache.set(key, e);
  }
  e.refs++;
  return { key, geo: e.geo };
}
function releaseBody(key) {
  const e = geoCache.get(key);
  if (!e) return;
  if (--e.refs <= 0) { e.geo.dispose(); geoCache.delete(key); }
}
let PROP_GEO = null;
function propGeo() {
  if (PROP_GEO) return PROP_GEO;
  const M = bindMats();
  const parts = [];
  const add = (model, bone, pivot = [0, 0, 0], rot = null) => {
    const geo = partGeo(model, FV, pivot);
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
    parts.push({ geo, bone: BI[bone], mat: M[BI[bone]] });
  };
  add(malletModel(), 'p_mallet', [0, 0, 0], [PI / 2, 0, 0]);
  add(broomModel(), 'p_broom', [0, 0, 0], [0.25, 0, 0]);
  add(torchModel(), 'p_torch', [0, 0, 0], [PI / 2, 0, 0]);
  add(pickModel(), 'p_pick', [0, 0, 0], [PI / 2, 0, 0]);
  add(trayModel(), 'p_tray');
  add(towelsModel(), 'p_towels');
  add(boxModel(), 'p_box');
  add(typewriterModel(), 'p_type');
  add(maskModel(), 'p_mask');
  add(bandageModel(), 'p_bandage', [0, 0, 0]);
  add(berryModel(), 'p_berry');
  add(logModel(), 'p_log');
  add(sackModel(), 'p_sack');
  add(barrowModel(), 'p_barrow');
  add(wheelModel(), 'p_wheel');
  PROP_GEO = mergeSkinned(parts);
  for (const p of parts) p.geo.dispose();
  PROP_GEO.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 9 * VS, 4 * VS), 30 * VS);
  return PROP_GEO;
}

// ------------------------------------------------------------------ material (palette + face)
function makeMaterial(pal, faceTex) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = { uPal: { value: pal }, uFace: { value: faceTex } };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPal = U.uPal; sh.uniforms.uFace = U.uFace;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uPal[${NSLOT}];
varying float vFace;
varying vec2 vFaceUv;`)
      .replace('#include <color_vertex>', `vColor = uPal[int(color.r * 64.0)] * color.g;
vFace = color.b;
vFaceUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uFace;
varying float vFace;
varying vec2 vFaceUv;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vFace > 0.5) {
  vec4 ft = texture2D(uFace, vFaceUv);
  if (ft.a < 0.5) discard;
  diffuseColor.rgb = ft.rgb;
  totalEmissiveRadiance += ft.rgb * 0.16;
}`);
  };
  m.customProgramCacheKey = () => 'beaverChibi1';
  return m;
}

// ------------------------------------------------------------------ the face (eyes + mouth canvas)
const FPAL = {
  k: '#2a1520', K: '#5a2e2a', w: '#fffaf0', W: '#e2d6dc', p: '#1e1018', i: '#6a3a24', I: '#9a5a34', h: '#ffffff',
  m: '#8a2434', M: '#4a0f22', t: '#ff8a9c', T: '#dc5270', e: '#ffffff', E: '#e6dccc', r: '#ff7a92', R: '#ffb3c2',
  s: '#8fd8ff', S: '#e8f9ff', d: '#3a8ad8', H: '#ff4468', L: '#ffb0c0', D: '#b01c3c', f: '#8a5a32', F: '#6a4024',
  b: '#4a2a1a', c: '#a8603a', g: '#3a2a2a', G: '#bfe6ff', y: '#ffd23a', Y: '#fff6b0', z: '#5a3a8a',
};
class Pix {
  constructor(w, h, pal) {
    this.w = w; this.h = h; this.d = new Uint8Array(w * h);
    this.keys = Object.keys(pal); this.idx = {}; this.keys.forEach((k, i) => (this.idx[k] = i + 1));
    this.css = [null, ...this.keys.map((k) => pal[k])];
  }
  setPal(k, css) { const i = this.idx[k]; if (i) this.css[i] = css; }
  clear() { this.d.fill(0); }
  set(x, y, ch) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = ch ? this.idx[ch] : 0; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  is(x, y, ch) { return this.get(x, y) === this.idx[ch]; }
  rows(rows, x0, y0, flip = false) {
    for (let j = 0; j < rows.length; j++) { const r = rows[j]; for (let i = 0; i < r.length; i++) { const ch = r[flip ? r.length - 1 - i : i]; if (ch === '.' || ch === ' ') continue; this.set(x0 + i, y0 + j, ch === '_' ? null : ch); } }
  }
  line(x0, y0, x1, y1, ch) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.set(x0, y0, ch); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  oval(cx, cy, rx, ry, fill, edge, clip) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        if (clip && !clip(x, y)) continue;
        const ein = edge && (((x + 1.5 - cx) / rx) ** 2 + dy * dy > 1 || ((x - 0.5 - cx) / rx) ** 2 + dy * dy > 1 || dx * dx + ((y + 1.5 - cy) / ry) ** 2 > 1 || dx * dx + ((y - 0.5 - cy) / ry) ** 2 > 1);
        this.set(x, y, ein ? edge : typeof fill === 'function' ? fill(x, y, dx, dy) : fill);
      }
  }
  paint(ctx, ox = 0, oy = 0) {
    ctx.clearRect(ox, oy, this.w, this.h);
    const d = this.d, w = this.w;
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < w) {
        const c = d[y * w + x];
        if (!c) { x++; continue; }
        let x1 = x + 1;
        while (x1 < w && d[y * w + x1] === c) x1++;
        ctx.fillStyle = this.css[c];
        ctx.fillRect(ox + x, oy + y, x1 - x, 1);
        x = x1;
      }
    }
  }
}
const HEART = ['.kk.kk.', 'kHLkHHk', 'kHHHHHk', 'kHHHHDk', '.kHHDk.', '..kDk..', '...k...'];
const SPIRAL = ['.kkkk.', 'k....k', 'k.kk.k', 'k.k..k', 'k.kkkk', '.k....'];
const EYE_X = [15.5, 32.5], EYE_Y = 11;
const EYE_STYLE = [
  { kind: 'bead', rx: 3.0, ry: 3.6 }, { kind: 'dot', rx: 1.9, ry: 2.3 }, { kind: 'toon', rx: 3.3, ry: 3.7 },
  { kind: 'bead', rx: 3.0, ry: 3.6, lash: true }, { kind: 'bead', rx: 3.0, ry: 3.4, lid: 0.25 },
];

export class BeaverFace {
  constructor(look = {}) {
    this.cv = document.createElement('canvas');
    this.cv.width = FACE_W; this.cv.height = FACE_H;
    this.ctx = this.cv.getContext('2d');
    this.tex = pixTex(this.cv);
    this.eyes = new Pix(48, 22, FPAL);
    this.mouth = new Pix(16, 12, FPAL);
    this.ek = ''; this.mk = '';
    this.setLook(look);
  }
  setLook(L) {
    this.L = { eye: 0, brow: 1, blush: 1, freckles: 0, gap: 0, teeth: 0, acc: 'none', fur: 0, ...L };
    const fur = FURS[this.L.fur % FURS.length]?.c ?? 0x8c5530;
    const f = '#' + new THREE.Color(darker(fur, 0.05)).getHexString(), F = '#' + new THREE.Color(darker(fur, 0.3)).getHexString();
    for (const P of [this.eyes, this.mouth]) { P.setPal('f', f); P.setPal('F', F); P.setPal('b', '#' + new THREE.Color(darker(fur, 0.55)).getHexString()); }
    this.ek = this.mk = '';
  }
  drawEye(P, cx, cy, side, kind, st) {
    const E = EYE_STYLE[this.L.eye % EYE_STYLE.length];
    const rx = E.rx, ry = E.ry;
    const lx = Math.round((st.lookX || 0) * 1.2), ly = Math.round((st.lookY || 0) * 1.1);
    if (st.blink && (kind === 'open' || kind === 'half' || kind === 'wide' || kind === 'focused' || kind === 'shiny')) kind = 'closed';
    const shut = (fn, th = 2) => { for (let x = -rx; x <= rx; x += 0.5) { const y = fn(x); for (let k = 0; k < th; k++) P.set(cx + x, cy + y + k, 'k'); } };
    switch (kind) {
      case 'happy': return shut((x) => -1 + (x * x) / (rx * rx) * 2.6 - 1.3);
      case 'closed': return shut((x) => 1 + (x * x) / (rx * rx) * -1.2);
      case 'sleep': return shut((x) => 0.5 + (1 - (x * x) / (rx * rx)) * 1.6);
      case 'shut': P.line(cx - side * rx * 0.9, cy - ry * 0.55, cx + side * rx * 0.5, cy, 'k'); P.line(cx + side * rx * 0.5, cy, cx - side * rx * 0.9, cy + ry * 0.55, 'k');
        P.line(cx - side * rx * 0.9, cy - ry * 0.55 + 1, cx + side * rx * 0.5, cy + 1, 'k'); return;
      case 'heart': P.rows(HEART, cx - 3.5, cy - 4); return;
      case 'dizzy': P.rows(SPIRAL, cx - 3, cy - 3, side > 0); return;
      default: break;
    }
    const lidK = kind === 'half' ? -0.1 : kind === 'sleepy' ? 0.25 : kind === 'focused' ? -0.35 : E.lid != null ? -0.55 + E.lid * 2 : -99;
    const lid = lidK < -50 ? -99 : cy + ry * lidK;
    const clip = (x, y) => (lid < -50 ? true : y >= lid + (kind === 'focused' ? -(x + 0.5 - cx) * side * 0.45 : 0));
    if (E.kind === 'toon' || kind === 'wide') {
      const Rx = rx * (kind === 'wide' ? 1.15 : 1), Ry = ry * (kind === 'wide' ? 1.15 : 1);
      P.oval(cx, cy, Rx, Ry, (x, y, dx, dy) => (dy > 0.55 ? 'W' : 'w'), 'k', clip);
      const px = cx + lx * 1.3 - side * 0.3, py = cy + ly + 0.3;
      P.oval(px, py, kind === 'wide' ? 1.1 : 1.7, kind === 'wide' ? 1.5 : 2.2, 'p', null, clip);
      if (clip(px - 1, py - 1.5)) P.set(px - 1, py - 1.5, 'h');
    } else if (E.kind === 'dot') {
      P.oval(cx + lx * 0.6, cy + ly * 0.5, rx, ry, 'p', null, clip);
      P.set(cx + lx * 0.6 - 1, cy + ly * 0.5 - 1, 'h');
      if (kind === 'shiny') P.set(cx + lx * 0.6, cy + ly * 0.5 + 1, 'h');
    } else {
      const ox = cx + lx * 0.6, oy = cy + ly * 0.5;
      P.oval(ox, oy, rx, ry, (x, y, dx, dy) => (dy > 0.62 && Math.abs(dx) < 0.55 ? 'I' : dy > 0.28 ? 'i' : 'p'), 'k', clip);
      const hl = (x, y) => { if (clip(x, y) && P.get(x, y) && !P.is(x, y, 'k')) P.set(x, y, 'h'); };
      const hx = Math.floor(ox - rx * 0.5), hy = Math.floor(oy - ry * 0.6);
      const big = kind === 'shiny' ? 2 : 1;
      for (let a = 0; a <= big; a++) for (let b = 0; b <= big; b++) hl(hx + a, hy + b);
      hl(Math.floor(ox + rx * 0.35), Math.floor(oy + ry * 0.25));
    }
    if (lid > -50) for (let x = Math.floor(cx - rx - 1); x <= cx + rx; x++) {
      const y = Math.floor(lid + (kind === 'focused' ? -(x + 0.5 - cx) * side * 0.45 : 0));
      if (Math.abs((x + 0.5 - cx) / (rx + 0.6)) <= 1) P.set(x, y, 'k');
    }
    if (E.lash && kind !== 'sleepy') { const ex = cx + side * (rx + 0.2), ey = lid > -50 ? lid : cy - ry * 0.55; P.set(ex, ey, 'k'); P.set(ex + side, ey - 1, 'k'); P.set(ex + side, ey + 1, 'k'); }
  }
  drawBrow(P, cx, cy, side, kind) {
    const style = this.L.brow % 6;
    if (!style && !kind) return;
    const ry = EYE_STYLE[this.L.eye % EYE_STYLE.length].ry;
    const y0 = cy - ry - 2.4 - (style === 4 ? 1 : 0);
    const w = style === 3 ? 3.4 : style === 1 ? 2.2 : 2.8;
    const th = style === 2 || style === 3 ? 2 : 1;
    const fn = { angry: (x, xo) => xo * 0.42 + 0.6, worried: (x, xo) => -xo * 0.42, raised: (x) => -1.4 + x * x * 0.04, up: (x) => -0.6 - x * x * 0.03 }[kind] || ((x) => (style === 4 ? -x * x * 0.06 : 0));
    for (let x = -w; x <= w; x += 0.5) {
      const xo = x * side;
      const y = y0 + fn(x, xo);
      for (let k = 0; k < th; k++) P.set(cx + x, y + k, 'b');
      if (style === 3 && Math.abs(x) > w - 1) P.set(cx + x + side, y - 1, 'b');
    }
    if (style === 5 && side > 0) for (let x = EYE_X[0] + w; x <= EYE_X[1] - w; x++) P.set(x, y0 + 0.5, 'b');
  }
  update(st) {
    const L = this.L;
    const lx = Math.round((st.lookX || 0) * 2) / 2, ly = Math.round((st.lookY || 0) * 2) / 2;
    const ft = st.tear >= 2 ? Math.floor((st.t || 0) * 10) : 0;
    const ek = `${st.eyes}|${st.brows}|${st.blush}|${st.tear}|${lx}|${ly}|${st.blink ? 1 : 0}|${ft}`;
    let dirty = false;
    if (ek !== this.ek) {
      this.ek = ek; dirty = true;
      const P = this.eyes;
      P.clear();
      const s2 = { ...st, lookX: lx, lookY: ly };
      EYE_X.forEach((x, i) => {
        const side = i === 0 ? -1 : 1;
        this.drawEye(P, x, EYE_Y, side, st.eyes || 'open', s2);
        if (st.eyes !== 'heart' && st.eyes !== 'dizzy') this.drawBrow(P, x, EYE_Y, side, st.brows);
      });
      // cheeks: blush + freckles
      const blush = Math.max(st.blush || 0, L.blush > 0 ? 1 : 0) + (L.blush > 1 ? 1 : 0);
      for (const bx of [7, 41]) {
        if (blush) for (let x = -3; x <= 3; x++) for (let y = -1; y <= 1; y++) { if (Math.abs(x) === 3 && y) continue; if (!P.get(bx + x, 17 + y)) P.set(bx + x, 17 + y, (x + y) % 3 === 0 && blush > 1 ? 'R' : 'r'); }
        if (L.freckles) for (const [dx, dy] of [[-2, -2], [0, -3], [2, -2], [1, 0]]) P.set(bx + dx + (bx > 24 ? -1 : 1), 17 + dy + 1, 'c');
      }
      if (L.acc === 'glasses' && st.eyes !== 'dizzy') {
        for (const x of EYE_X) { const ry = EYE_STYLE[L.eye % EYE_STYLE.length].ry + 2; P.oval(x, EYE_Y, ry + 0.4, ry, null, 'g', (xx, yy) => true); P.set(x - 2, EYE_Y - ry + 1.5, 'G'); }
        for (let x = EYE_X[0] + 5.6; x <= EYE_X[1] - 5.6; x++) P.set(x, EYE_Y - 1, 'g');
      }
      if (st.tear) {
        for (const [i, x] of EYE_X.entries()) {
          const side = i === 0 ? -1 : 1, ex = x + side * 2, ey = EYE_Y + 2;
          if (st.tear >= 2) for (let k = 0; k < 6; k++) { const ph = (k + ft) % 6; P.set(ex + side * (1 + ph * 0.8), ey + ph * 0.9, ph % 3 ? 's' : 'S'); }
          else { P.set(ex, ey, 's'); P.set(ex, ey + 1, 's'); P.set(ex, ey + 2, 'd'); }
        }
      }
    }
    const mk = `${st.mouth}`;
    if (mk !== this.mk) { this.mk = mk; dirty = true; this.drawMouth(st.mouth || 'smile'); }
    if (dirty) {
      this.eyes.paint(this.ctx, 0, 0);
      this.mouth.paint(this.ctx, 48, 0);
      this.tex.needsUpdate = true;
    }
  }
  drawMouth(kind) {
    const P = this.mouth, L = this.L;
    P.clear();
    const cx = 8, cy = 2, hw = 4;
    const gap = L.gap ? 1 : 0, tw = L.teeth ? 3 : 2;
    const teeth = (th = 4) => {
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? cx - tw - gap / 2 - 0.5 : cx + gap / 2 + 0.5;
        for (let y = cy; y < cy + th; y++) for (let x = x0; x < x0 + tw; x++) P.set(x, y, y === cy + th - 1 ? 'E' : 'e');
        for (let y = cy; y <= cy + th; y++) P.set(s < 0 ? x0 - 1 : x0 + tw, y, 'k');
        for (let x = x0 - 1; x <= x0 + tw; x++) P.set(x, cy + th, 'k');
      }
      if (!gap) P.line(cx, cy, cx, cy + th, 'k'); else for (let y = cy; y <= cy + th; y++) { P.set(cx - 1, y, 'k'); P.set(cx, y, 'k'); }
    };
    const wline = (amp = 1.6, w = hw) => { for (const s of [-1, 1]) for (let x = 0; x <= w; x += 0.5) P.set(cx + s * x - (s < 0 ? 1 : 0), cy + Math.sin((x / w) * PI) * amp - 1, 'k'); };
    const openD = (w, h, tongue = true) => {
      for (let y = 0; y <= h; y++) for (let x = -w; x <= w; x++) {
        const u = x / (w + 0.5), v = y / (h + 0.5);
        if (u * u + v * v > 1) continue;
        const edge = (x - 1) ** 2 / (w + 0.5) ** 2 + v * v > 1 || (x + 1) ** 2 / (w + 0.5) ** 2 + v * v > 1 || u * u + ((y + 1) / (h + 0.5)) ** 2 > 1;
        let c = edge ? 'k' : y < 2 ? 'M' : 'm';
        if (!edge && tongue && y >= h - 2 && Math.abs(x) <= w * 0.6) c = y === h - 2 ? 'T' : 't';
        P.set(cx + x - 0.5, cy + y, c);
      }
    };
    const ov = (rx, ry, oy = 1) => P.oval(cx, cy + oy + ry, rx, ry, (x, y, dx, dy) => (dy > 0.3 ? 'm' : 'M'), 'k');
    switch (kind) {
      case 'grin': openD(hw, 4); teeth(3); return;
      case 'open': case 'laugh': openD(hw + 1, kind === 'laugh' ? 6 : 5); teeth(3); return;
      case 'yell': ov(3, 3.5, 0); teeth(2); return;
      case 'o': ov(1.8, 2.4, 1); return;
      case 'sip': ov(1, 1.2, 1); return;
      case 'flat': P.line(cx - 3, cy - 1, cx + 2, cy - 1, 'k'); teeth(3); return;
      case 'frown': for (let x = -3; x <= 3; x += 0.5) P.set(cx + x - 0.5, cy + 6 - 1.8 * (1 - (x * x) / 9), 'k'); teeth(3); return;
      case 'wobble': for (let x = -3; x <= 3; x++) P.set(cx + x - 0.5, cy + 5 + (x % 2 ? 1 : 0), 'k'); teeth(3); return;
      case 'chew1': wline(1, 2.4); teeth(3); return;
      case 'chew2': ov(1.4, 1.4, 0); teeth(2); return;
      case 'blep': wline(1.4); teeth(4); P.set(cx + 3, cy + 4, 't'); P.set(cx + 3, cy + 5, 'T'); P.set(cx + 4, cy + 4, 'k'); return;
      case 'cheeky': wline(2.2); teeth(4); return;
      default: wline(1.6); teeth(4);
    }
  }
  dispose() { this.tex.dispose(); }
}

const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 1, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  munch: { eyes: 'happy', brows: null, mouth: 'chew1', blush: 1, tear: 0 },
  dizzy: { eyes: 'dizzy', brows: null, mouth: 'wobble', blush: 0, tear: 0 },
  hurt: { eyes: 'shut', brows: 'worried', mouth: 'yell', blush: 0, tear: 1 },
  shy: { eyes: 'half', brows: 'worried', mouth: 'smile', blush: 2, tear: 0 },
  grumpy: { eyes: 'half', brows: 'angry', mouth: 'frown', blush: 0, tear: 0 },
  nervous: { eyes: 'open', brows: 'worried', mouth: 'wobble', blush: 0, tear: 0 },
  talk: { eyes: 'open', brows: null, mouth: 'open', blush: 0, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
};

// ------------------------------------------------------------------ the rig
const _ws = new THREE.Vector3();
export class BeaverChibi extends CritterRig {
  constructor({ look = {}, outfit = 'overalls', seed = 1, shadows = true } = {}) {
    super('BeaverChibi', { shadows });
    this.isChibi = true;
    this.space = new THREE.Group();
    this.space.name = 'body';
    this.space.scale.setScalar(SPACE);
    this.root.add(this.space);
    // bones (fixed order: the shared geometry's skinIndex refers to it)
    this.bones = [];
    for (const [name, parent, x, y, z] of BONES) this.joint(name, parent ? this[parent] : this.space, x, y, z);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.look = { ...look };
    this.outfit = outfit;
    this.lookSeed = seed;
    this.pal = buildPalette(this.look, outfit);
    this.face = new BeaverFace(this.look);
    this.mat = makeMaterial(this.pal, this.face.tex);
    this._owned.push(this.mat);
    const bg = bodyGeo({ ...this.look, outfit });
    this.bodyKey = bg.key;
    this.body = new THREE.SkinnedMesh(bg.geo, this.mat);
    this.props = {};
    this.propMesh = new THREE.SkinnedMesh(propGeo(), this.mat);
    for (const m of [this.body, this.propMesh]) {
      m.castShadow = shadows; m.receiveShadow = false;
      m.frustumCulled = true;
      this.space.add(m);
    }
    this.body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 9 * VS, 0), 22 * VS);
    this.propMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 9 * VS, 4 * VS), 30 * VS);
    this.root.updateMatrixWorld(true);
    this.skeleton.calculateInverses();
    this.body.bind(this.skeleton, this.body.matrixWorld);
    this.propMesh.bind(this.skeleton, this.propMesh.matrixWorld);
    // prop visibility (Mining / BeaverSystem toggle .visible on these)
    this._propVis = {};
    for (const n of PROPS) {
      const bone = this['p_' + n], self = this;
      this.props[n] = { get visible() { return !!self._propVis[n]; }, set visible(v) { self._propVis[n] = !!v; self._applyProp(n); }, bone };
    }
    const self2 = this;
    this.hatMesh = { get visible() { return !self2._hatOff; }, set visible(v) { self2._hatOff = !v; } };
    // sprites: dizzy stars, Zzz, hearts, sparks
    this.stars = [0, 1, 2].map(() => this.sprite(STAR_ROWS, 0.07, this.root));
    this.zzz = [0, 1, 2].map(() => this.sprite(ZZZ_ROWS, 0.07, this.root));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.root));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.06, this.root));
    this.scalar('stars', 0); this.scalar('zzz', 0); this.scalar('hearts', 0); this.scalar('spark', 0); this.scalar('wheel', 0); this.scalar('berryS', 1);
    this._wheelA = 0;
    // secondary motion
    this.jiggle('earL', 'rz', { k: 200, c: 9, ax: 0.03, ay: -0.02, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 200, c: 9, ax: 0.03, ay: 0.02, probe: 'head' });
    this.jiggle('hatG', 'rx', { k: 260, c: 12, az: -0.012, ay: 0.006, max: 0.3, probe: 'head' });
    this.jiggle('hatG', 'y', { k: 320, c: 14, ay: 0.012, max: 0.5, probe: 'head' });
    this.jiggle('head', 's', { k: 300, c: 11, ay: 0.004, max: 0.1, probe: 'hips' });
    this.jiggle('chest', 's', { k: 260, c: 10, ay: 0.005, max: 0.08, probe: 'hips' });
    this.jiggle('tail', 'rx', { k: 120, c: 7, ay: 0.03, az: -0.01, max: 0.6, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 110, c: 7, ax: 0.03, yaw: 0.02, max: 0.6, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }

  joint(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Bone();
    g.name = name;
    g.position.set(x * VS, y * VS, z * VS);
    parent.add(g);
    this._joints.push({ name, g, rest: g.position.clone() });
    this.bones.push(g);
    this[name] = g;
    return g;
  }

  /** Change clothes (rebuilds nothing: shared geometry per outfit + a palette update). */
  setOutfit(outfit) {
    if (!outfit || outfit === this.outfit) return this;
    this.outfit = outfit;
    this._rebuildBody();
    return this;
  }
  setLook(look, seed = this.lookSeed) {
    this.look = { ...look };
    this.lookSeed = seed;
    this.face.setLook(this.look);
    this._rebuildBody();
    return this;
  }
  _rebuildBody() {
    buildPalette(this.look, this.outfit, this.pal);
    const key = bodyKey({ ...this.look, outfit: this.outfit });
    if (key !== this.bodyKey) {
      const bg = bodyGeo({ ...this.look, outfit: this.outfit });
      releaseBody(this.bodyKey);
      this.bodyKey = bg.key;
      this.body.geometry = bg.geo;
    }
    this.mat.userData.U.uPal.value = this.pal;
    this.mat.uniformsNeedUpdate = true;
  }

  _applyProp(n) {
    const b = this.props[n]?.bone;
    if (!b) return;
    if (!this._propVis[n]) b.scale.setScalar(1e-4);
  }

  _post(p, dt) {
    // props: shown by the anim (p.vis) unless someone outside switched them off this frame
    let any = false;
    for (const n of PROPS) {
      const on = !!p.vis[n] && !(n === 'box' && this.carrying);
      this._propVis[n] = on;
      if (!on) this['p_' + n].scale.setScalar(1e-4);
      else any = true;
    }
    // a bandage while hurt / just after
    const st = this.staff;
    if (st && (st.bandage > 0 || (st.hurt && st.hurt.state !== 'recover'))) { this._propVis.bandage = true; this.p_bandage.scale.setScalar(1); any = true; }
    // crew mining: a pickaxe instead of the mallet; an ore sack instead of a log
    const ag = this.agent;
    if (ag && !ag.ctl) {
      if (ag.state === 'work' && ag.job?.kind === 'mine' && this._propVis.mallet) { this._propVis.mallet = false; this.p_mallet.scale.setScalar(1e-4); this._propVis.pick = true; this.p_pick.scale.setScalar(1); }
      if (ag.carry?.ore && this._propVis.log) { this._propVis.log = false; this.p_log.scale.setScalar(1e-4); this._propVis.sack = true; this.p_sack.scale.setScalar(1); }
    }
    if (this._hatOff) this.hatG.scale.setScalar(1e-4);
    this.propMesh.visible = any || Object.values(this._propVis).some(Boolean);
    this._wheelA += (this.k.wheel || 0) * dt;
    this.p_wheel.rotation.x = this._wheelA;
    this.p_berry.scale.multiplyScalar(this.k.berryS ?? 1);
    // sprites (root space)
    const T = this.time, K = this.k;
    const hy = (19.5 * VS) * SPACE;
    this.stars.forEach((s, i) => {
      s.visible = K.stars > 0.5;
      if (!s.visible) return;
      const a = T * 4 + (i * TAU) / 3;
      const lie = this._lyingY;
      s.position.set(Math.cos(a) * 0.17 + (lie ? lie.x : 0), (lie ? lie.y : hy) + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.17 + (lie ? lie.z : 0));
      s.scale.setScalar(0.06 + 0.012 * Math.sin(a * 3));
    });
    this.zzz.forEach((s, i) => {
      const u = (T * 0.45 + i / 3) % 1;
      s.visible = K.zzz > 0.5;
      if (!s.visible) return;
      s.position.set(0.12 + u * 0.12 + sin(u * 9) * 0.02, 0.3 + u * 0.35, 0.1);
      s.scale.setScalar((0.04 + u * 0.05) * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    this.hearts.forEach((s, i) => {
      const u = (T * 0.6 + i / 2) % 1;
      s.visible = K.hearts > 0.5;
      if (!s.visible) return;
      s.position.set((i - 0.5) * 0.18 + sin(u * 7 + i) * 0.03, 0.6 + u * 0.28, 0.12);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2));
    });
    const sp = K.spark || 0;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      if (!s.visible) return;
      const a = T * 23 + i * 2.1;
      s.position.set(Math.sin(a) * 0.06 - 0.04, 0.28 + Math.abs(Math.cos(a * 1.3)) * 0.08, 0.32 + Math.cos(a) * 0.04);
      s.scale.setScalar(0.035 + 0.025 * Math.abs(Math.sin(a * 2.7)));
    });
  }

  /** Root-space height of the top of the head (for speech bubbles / pop-ups). */
  get headTop() { return 21 * VS * SPACE; }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    releaseBody(this.bodyKey);
    this.mat.dispose();
    this.face.dispose();
    this.skeleton.dispose?.();
  }
}

// little star sprite (dizzy)
const STAR_ROWS = ['...k...', '..kyk..', 'kkyYykk', 'kyYYYyk', '.kyyyk.', 'kyk.kyk', 'kk...kk'];

// ------------------------------------------------------------------ animation helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
function arm(p, side, fwd, out = 0, el = 0, tw = 0) {
  const u = p[side > 0 ? 'armL' : 'armR'], f = p[side > 0 ? 'foreL' : 'foreR'];
  u.rx = -fwd; u.rz = out * side; u.ry = tw * side; f.rx = -el;
}
function life(t, p, amt = 1) {
  const br = sin(t * 2.4);
  p.chest.s = 1 + br * 0.018 * amt;
  p.head.rx += -br * 0.02 * amt;
  p.armL.rz += sin(t * 2.4 + 0.5) * 0.04 * amt; p.armR.rz -= sin(t * 2.4 + 0.5) * 0.04 * amt;
  p.earL.rz += sin(t * 1.3) * 0.06 * amt; p.earR.rz -= sin(t * 1.3 + 0.7) * 0.06 * amt;
  p.tail.ry += sin(t * 1.1) * 0.12 * amt;
}
function restArms(p) { arm(p, 1, 0.3, 0.28, 0.85); arm(p, -1, 0.3, 0.28, 0.85); }
function tailRest(p) { p.tail0.rx = -0.4; p.tail.rx = -0.2; }
function steps(s, ph, rig) { const k = Math.floor(ph / PI + 0.5); if (s.step !== undefined && k !== s.step) rig._emit('step'); s.step = k; }
function walkLegs(p, ph, amp = 0.7, lift = 0.6) {
  const sn = sin(ph);
  p.legL.rx = -sn * amp; p.legR.rx = sn * amp;
  p.legL.y = max(0, cos(ph)) * lift; p.legR.y = max(0, -cos(ph)) * lift;
}
function talk(t, f) {
  const k = Math.floor(t * 8), h = hash3(k, 11, 3);
  f.mouth = (t % 3) > 2.5 ? 'smile' : h < 0.35 ? 'open' : h < 0.65 ? 'grin' : h < 0.8 ? 'o' : 'smile';
}

// ------------------------------------------------------------------ anims
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    life(t, p); restArms(p); tailRest(p);
    p.hips.rz = sin(t * 0.9) * 0.03; p.head.rz = sin(t * 0.9 + 0.6) * 0.06;
    p.head.ry = K(t % 7, [[0, 0], [2.2, 0], [2.6, 0.45], [3.8, 0.45], [4.2, -0.35], [5.3, -0.35], [5.8, 0]]);
    f.look = [p.head.ry * 1.6, 0];
    const u = t % 3.1;
    const lift = K(u, [[0, 0], [2.0, 0], [2.3, 1, 'out'], [2.42, -0.25, 'in'], [2.7, 0, 'out']]);
    p.tail0.rx += lift * 0.9; p.tail.rx += lift * 0.4;
    if (beat(s, 'th', t, 3.1, 2.4)) rig._emit('thump');
    const sq = pulse(u, 2.4, 0.22);
    p.mover.y += sq * 0.4; p.chest.s -= sq * 0.04;
  },
});
def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f) {
    life(t, p, 1.2); restArms(p); tailRest(p);
    const g = sin(t * 2.2);
    arm(p, 1, 0.5 + max(0, g) * 0.6, 0.35, 1.1 + g * 0.3);
    p.head.rz = sin(t * 1.7) * 0.08; p.head.rx = -0.06 + sin(t * 3.1) * 0.04;
    p.hips.ry = sin(t * 1.1) * 0.08;
    talk(t, f);
  },
});
def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.4) * TAU, cs = cos(ph), sn = sin(ph);
    walkLegs(p, ph, 0.75, 0.6);
    p.mover.y = abs(cs) * 0.6;
    p.hips.rz = cs * 0.1; p.chest.rz = -cs * 0.05; p.head.rz = -cs * 0.05;
    p.hips.ry = sn * 0.08;
    arm(p, 1, 0.1 - sn * 0.5, 0.25, 0.6); arm(p, -1, 0.1 + sn * 0.5, 0.25, 0.6);
    tailRest(p); p.tail.ry = sn * 0.3; p.tail.rx += abs(cs) * 0.15;
    steps(s, ph, rig);
  },
});
def('run', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.26) * TAU, sn = sin(ph), cs = cos(ph);
    const bob = abs(cs);
    walkLegs(p, ph, 1.05, 0.8);
    p.mover.y = bob * 1.3;
    p.hips.rx = 0.22; p.head.rx = -0.18 + bob * 0.06;
    p.chest.s = 1 + (bob - 0.5) * 0.06;
    p.hips.rz = cs * 0.08; p.head.rz = -cs * 0.07;
    arm(p, 1, -0.3 + sn * 0.9, 0.2, 1.3); arm(p, -1, -0.3 - sn * 0.9, 0.2, 1.3);
    p.tail0.rx = 0.05 + bob * 0.25; p.tail.rx = 0.2 + cs * 0.3; p.tail.ry = sn * 0.25;
    p.earL.rx = p.earR.rx = -bob * 0.4;
    f.mouth = 'grin';
    steps(s, ph, rig);
  },
});
def('limp', {
  loop: true, expr: 'hurt',
  fn(t, p, f, s, rig) {
    const T = 1.1, u = (t % T) / T;
    const step = K(u, [[0, 0], [0.3, 1, 'out'], [0.5, 0], [1, 0]]);
    p.legL.rx = -step * 0.6; p.legR.rx = step * 0.2 - 0.1;
    p.mover.y = step * 0.5 - (u > 0.5 ? 0.5 : 0);
    p.hips.rz = 0.12 + step * 0.06; p.chest.rx = 0.18; p.head.rx = 0.2; p.head.rz = -0.12;
    arm(p, 1, 0.5, 0.2, 1.2); arm(p, -1, 0.1, 0.5, 0.4);
    tailRest(p); p.tail.rx -= 0.2;
    f.eyes = 'half'; f.mouth = 'wobble'; f.brows = 'worried';
    if (beat(s, 'st', t, T, 0.3)) rig._emit('step');
  },
});
def('carry', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.42) * TAU, cs = cos(ph);
    walkLegs(p, ph, 0.6, 0.5);
    p.mover.y = abs(cs) * 0.5;
    p.hips.rz = cs * 0.06; p.chest.rx = -0.12; p.head.rx = -0.1;
    arm(p, 1, 1.25, -0.05, 0.75); arm(p, -1, 1.25, -0.05, 0.75);
    p.vis.box = true;
    p.carryJ.y = -abs(cs) * 0.25;
    tailRest(p); p.tail.ry = sin(ph) * 0.2;
    f.mouth = 'flat';
    steps(s, ph, rig);
  },
});
def('carry_idle', {
  loop: true, expr: 'neutral',
  fn(t, p) {
    life(t, p, 0.6);
    arm(p, 1, 1.25, -0.05, 0.75); arm(p, -1, 1.25, -0.05, 0.75);
    p.chest.rx = -0.1; p.vis.box = true; tailRest(p);
  },
});
def('carry_log', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.42) * TAU, sn = sin(ph), cs = cos(ph);
    const bob = abs(cs);
    walkLegs(p, ph, 0.6, 0.5);
    p.mover.y = bob * 0.6; p.chest.s = 1 - bob * 0.05;
    p.hips.rz = cs * 0.05; p.head.rz = cs * 0.03; p.head.rx = 0.06;
    arm(p, 1, 2.75, 0.35, 0.2 + sn * 0.1); arm(p, -1, 2.75, 0.35, 0.2 - sn * 0.1);
    p.vis.log = true;
    p.logJ.y = -bob * 0.5; p.logJ.rz = cs * 0.08;
    tailRest(p); p.tail.rx += bob * 0.2;
    f.mouth = 'grin';
    f.eyes = (t % 3) > 2.6 ? 'happy' : 'focused'; f.brows = null;
    steps(s, ph, rig);
  },
});
def('pickup', {
  loop: true, expr: 'focused',
  fn(t, p) {
    const u = smooth(min(1, t / 0.3));
    p.hips.y = -u * 0.8; p.chest.rx = 0.5 * u; p.head.rx = -0.3 * u;
    p.legL.rx = p.legR.rx = 0.4 * u;
    arm(p, 1, 1.5 * u, 0.1, 0.4); arm(p, -1, 1.5 * u, 0.1, 0.4);
    tailRest(p);
  },
});
def('chop', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.32) * TAU, g = sin(ph);
    p.chest.rx = 0.22; p.mover.z = 0.6;
    p.head.rx = 0.05 + g * 0.16; p.head.z = 0.6 + max(0, g) * 0.7; p.head.ry = sin(t * 1.3) * 0.2;
    p.head.s = 1 - max(0, g) * 0.06;
    arm(p, 1, 1.45, -0.05, 0.4); arm(p, -1, 1.45, -0.05, 0.4);
    p.armL.rx += g * 0.06; p.armR.rx -= g * 0.06;
    p.legL.rx = 0.2; p.legR.rx = 0.2;
    p.tail0.rx = -0.6; p.tail.rx = -0.05; p.tail.ry = sin(t * 9) * 0.06;
    f.mouth = g > 0.2 ? 'grin' : 'chew2';
    if (beat(s, 'hit', t, 0.32, 0.08)) rig._emit('chop_hit');
  },
});
def('hammer', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const T = 0.7, u = (t % T) / T;
    const sw = K(u, [[0, 0.2], [0.45, -0.9, 'out'], [0.62, 1.15, 'in'], [0.7, 1.05, 'out'], [1, 0.2]]);
    const hit = pulse(u, 0.6, 0.18);
    p.chest.rx = 0.12 + sw * 0.1; p.head.rx = 0.25 + hit * 0.1;
    p.mover.y = -hit * 0.4; p.chest.s = 1 - hit * 0.06;
    p.legL.rx = -0.2; p.legR.rx = 0.25;
    arm(p, -1, 0.9 - sw * 1.4 + 1.2, 0.15, 0.5 + max(0, -sw) * 0.4);
    arm(p, 1, 1.0, 0.1, 0.9);
    p.vis.mallet = true;
    tailRest(p); p.tail0.rx += hit * 0.4;
    f.mouth = hit > 0.3 ? 'grin' : 'smile'; f.look = [0, 1];
    if (beat(s, 'hit', t, T, T * 0.61)) rig._emit('hammer_hit');
    p.k.spark = hit;
  },
});
def('weld', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    p.hips.y = -0.6; p.legL.rx = 0.5; p.legR.rx = -0.2; p.chest.rx = 0.25; p.head.rx = 0.25;
    const j = sin(t * 31) * 0.03 + sin(t * 17) * 0.02;
    arm(p, -1, 1.25 + j, 0.05, 0.6); arm(p, 1, 1.05, 0.2, 1.1);
    p.vis.torch = true; p.vis.mask = true;
    tailRest(p);
    p.k.spark = (t % 2.4) < 1.9 ? 1 : 0;
    f.eyes = 'focused';
    if (beat(s, 'w', t, 0.5, 0)) rig._emit('weld');
  },
});
def('type', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    // sitting on the ground at a typewriter on a stump
    p.mover.y = -1.6; p.hips.rx = -0.15; p.legL.rx = p.legR.rx = -1.3; p.legL.rz = 0.25; p.legR.rz = -0.25;
    p.chest.rx = 0.12; p.head.rx = 0.2;
    const a = sin(t * 19), b = sin(t * 23 + 1);
    arm(p, 1, 1.15 + max(0, a) * 0.12, -0.12, 0.5); arm(p, -1, 1.15 + max(0, b) * 0.12, -0.12, 0.5);
    p.vis.type = true;
    p.tail0.rx = -0.2; p.tail.rx = 0;
    const ding = (t % 3.2) > 2.9;
    f.mouth = ding ? 'o' : 'flat'; f.look = [0, 1.2];
    if (beat(s, 'd', t, 3.2, 2.9)) rig._emit('ding');
    if (beat(s, 'k', t, 0.16, 0)) rig._emit('key');
    p.head.ry = ding ? 0.2 : 0;
  },
});
def('sweep', {
  loop: true, expr: 'happy',
  fn(t, p, f) {
    const g = sin(t * 4.2);
    p.hips.ry = g * 0.25; p.chest.ry = g * 0.15; p.chest.rx = 0.15;
    arm(p, -1, 0.9 + g * 0.3, 0.2, 0.5, 0.2); arm(p, 1, 1.2 + g * 0.3, -0.1, 0.9);
    p.vis.broom = true;
    p.legL.rx = 0.15; p.legR.rx = -0.15;
    p.mover.y = abs(sin(t * 4.2)) * 0.2;
    tailRest(p); p.tail.ry = -g * 0.4;
    f.mouth = (t % 4) > 3 ? 'o' : 'smile';
  },
});
def('fold', {
  loop: true, expr: 'neutral',
  fn(t, p, f) {
    const T = 1.6, u = (t % T) / T;
    const fl = K(u, [[0, 0], [0.3, 1, 'out'], [0.55, 1], [0.8, 0, 'io'], [1, 0]]);
    arm(p, 1, 1.0 + fl * 0.6, 0.6 - fl * 0.5, 0.8 - fl * 0.4); arm(p, -1, 1.0 + fl * 0.6, 0.6 - fl * 0.5, 0.8 - fl * 0.4);
    p.vis.towels = true;
    p.p_towels.y = fl * 0.6; p.p_towels.rx = fl * 0.2;
    p.chest.rx = 0.1; p.head.rx = 0.18; f.look = [0, 1];
    life(t, p, 0.5); tailRest(p);
    f.mouth = fl > 0.5 ? 'smile' : 'flat';
  },
});
def('serve', {
  loop: true, expr: 'happy',
  fn(t, p, f) {
    life(t, p, 0.7);
    const T = 3.0, u = (t % T) / T;
    const offer = K(u, [[0, 0], [0.25, 1, 'out'], [0.6, 1], [0.8, 0], [1, 0]]);
    arm(p, 1, 1.6 + offer * 0.4, 0.5, 1.7 - offer * 0.6);
    arm(p, -1, 0.35, 0.3, 0.9 + offer * 0.4);
    p.vis.tray = true;
    p.chest.rx = -0.05 - offer * 0.1; p.head.rz = 0.12 * offer;
    p.mover.y = offer * 0.3;
    tailRest(p); p.tail.ry = sin(t * 5) * 0.25 * offer;
    f.mouth = offer > 0.5 ? 'grin' : 'smile'; f.blush = offer > 0.5 ? 1 : 0;
  },
});
def('plow', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.34) * TAU, sn = sin(ph), cs = cos(ph);
    walkLegs(p, ph, 0.9, 0.5);
    p.mover.y = abs(cs) * 0.5;
    p.chest.rx = 0.4; p.head.rx = -0.3; p.hips.rz = cs * 0.04;
    arm(p, 1, 1.1 + sn * 0.04, 0.12, 0.1); arm(p, -1, 1.1 - sn * 0.04, 0.12, 0.1);
    p.vis.barrow = true;
    p.p_barrow.y = abs(cs) * 0.25; p.p_barrow.rx = -0.04 + sn * 0.02;
    p.k.wheel = 9;
    tailRest(p); p.tail.ry = sn * 0.2;
    f.brows = 'angry';
    steps(s, ph, rig);
  },
});
def('eat_berry', {
  loop: true, expr: 'munch',
  fn(t, p, f, s, rig) {
    p.mover.y = -1.6; p.hips.rx = -0.18;
    p.legL.rx = p.legR.rx = -1.25; p.legL.rz = 0.15; p.legR.rz = -0.15;
    const ch = sin(t * 13);
    p.head.rx = 0.12 + ch * 0.05; p.head.s = 1 + ch * 0.03; p.head.rz = sin(t * 1.4) * 0.08;
    arm(p, 1, 1.6, -0.42, 1.0); arm(p, -1, 1.6, -0.42, 1.0);
    p.armL.rx += ch * 0.04; p.armR.rx += ch * 0.04;
    p.tail0.rx = -0.2; p.tail.rx = -0.05; p.tail.ry = sin(t * 3) * 0.3;
    p.vis.berry = true;
    p.p_berry.y = -0.3 + ch * 0.25;
    p.k.berryS = 1 - (Math.floor(t / 1.2) % 4) * 0.18;
    f.mouth = ch > 0 ? 'chew1' : 'chew2';
    p.k.hearts = (t % 4.8) > 3.6 ? 1 : 0;
    if (beat(s, 'm', t, 0.6, 0)) rig._emit('munch');
  },
});
def('swim', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.55) * TAU, sn = sin(ph), cs = cos(ph);
    p.mover.rx = 1.2; p.mover.y = -3.6 + sin(t * 3) * 0.25; p.mover.z = -2;
    p.head.rx = -1.1 + sn * 0.03; p.head.rz = sin(t * 1.2) * 0.08;
    p.legL.rx = 0.8 + sn * 0.7; p.legR.rx = 0.8 - sn * 0.7;
    arm(p, 1, 0.9 + cs * 0.6, 0.5, 0.6); arm(p, -1, 0.9 - cs * 0.6, 0.5, 0.6);
    p.tail0.rx = -1.1 + sn * 0.2; p.tail.rx = sn * 0.45;
    p.mover.rz = cs * 0.04;
    if (beat(s, 'spl', t, 1.1, 0.3)) rig._emit('splash');
  },
});
def('cheer', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const T = 0.62, u = (t % T) / T;
    const jump = K(u, [[0, 0], [0.12, -0.6, 'out'], [0.25, 0], [0.5, 4.2, 'out'], [0.78, 0, 'in'], [0.88, -0.7, 'out'], [1, 0]]);
    p.mover.y = max(0, jump);
    p.chest.s = 1 + (jump < 0 ? jump * 0.1 : min(0.08, jump * 0.03));
    const up = smooth(u * 3) * (1 - smooth((u - 0.85) * 7));
    arm(p, 1, 2.6 * up + 0.4, 0.6 + sin(t * 20) * 0.1, 0.3); arm(p, -1, 2.6 * up + 0.4, 0.6 - sin(t * 20) * 0.1, 0.3);
    p.legL.rx = p.legR.rx = jump > 0.5 ? -0.4 : 0;
    p.head.rx = -0.18;
    p.tail0.rx = 0.2; p.tail.rx = 0.3 + sin(t * 16) * 0.3; p.tail.ry = sin(t * 12) * 0.4;
    f.mouth = 'open';
    p.k.spark = 0;
    if (beat(s, 'land', t, T, T * 0.8)) rig._emit('step');
  },
});
def('celebrate', {
  loop: true, expr: 'proud',
  fn(t, p, f, s, rig) {
    const T = 1.2, u = (t % T) / T;
    const jump = K(u, [[0, 0], [0.15, -0.8, 'out'], [0.3, 0], [0.55, 6, 'out'], [0.85, 0, 'in'], [1, 0]]);
    p.mover.y = max(0, jump);
    p.mover.ry = u > 0.3 && u < 0.85 ? smooth((u - 0.3) / 0.55) * TAU : 0;
    arm(p, 1, 2.9, 0.4, 0.2); arm(p, -1, 2.9, 0.4, 0.2);
    p.legL.rx = jump > 1 ? -0.6 : 0; p.legR.rx = jump > 1 ? 0.3 : 0;
    p.tail.rx = 0.4; p.tail.ry = sin(t * 14) * 0.5;
    f.mouth = 'laugh'; f.eyes = 'happy';
    p.k.hearts = 1;
    if (beat(s, 'land', t, T, T * 0.88)) rig._emit('step');
  },
});
def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f) {
    life(t, p, 0.6); restArms(p);
    const w = sin(t * 10);
    arm(p, -1, 0.35, 2.0 + w * 0.2, 0.5 + w * 0.45);
    p.armR.ry = 0.5;
    p.hips.rz = -0.06 + sin(t * 5) * 0.03; p.head.rz = 0.14 + sin(t * 5) * 0.06;
    p.mover.y = abs(sin(t * 5)) * 0.4;
    p.tail0.rx = 0.05; p.tail.rx = 0.2; p.tail.ry = sin(t * 9) * 0.45;
    f.mouth = 'open';
  },
});
def('sit', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    p.mover.y = -1.6; p.hips.rx = -0.25;
    p.legL.rx = p.legR.rx = -1.3; p.legL.rz = 0.3; p.legR.rz = -0.3;
    p.chest.rx = -0.05;
    life(t, p, 0.8);
    arm(p, 1, 0.5, 0.4, 0.9); arm(p, -1, 0.5, 0.4, 0.9);
    p.head.ry = sin(t * 0.4) * 0.35; f.look = [p.head.ry * 1.4, -0.3];
    p.tail0.rx = 0.1; p.tail.rx = 0.05; p.tail.ry = 0.5 + sin(t * 0.8) * 0.15;
    f.eyes = (t % 9) > 7 ? 'half' : 'open';
    f.mouth = (t % 9) > 7 ? 'o' : 'smile';
    if (beat(s, 'th', t, 4.2, 1)) rig._emit('thump');
  },
});
def('stretch', {
  loop: true, expr: 'sleepy',
  fn(t, p, f) {
    const T = 2.4, u = (t % T) / T;
    const up = K(u, [[0, 0], [0.35, 1, 'out'], [0.7, 1], [1, 0]]);
    arm(p, 1, 2.9 * up + 0.2, 0.3 + up * 0.2, 0.2); arm(p, -1, 2.9 * up + 0.2, 0.3 + up * 0.2, 0.2);
    p.chest.rx = -0.25 * up; p.head.rx = -0.3 * up;
    p.mover.y = up * 0.6; p.chest.s = 1 + up * 0.06;
    p.tail.rx = up * 0.5;
    f.mouth = up > 0.5 ? 'o' : 'smile'; f.eyes = up > 0.4 ? 'closed' : 'sleepy';
  },
});
def('sleep', {
  loop: true, expr: 'asleep',
  fn(t, p, f, s, rig) {
    const br = sin(t * 1.5);
    p.mover.rx = 1.42; p.mover.y = 2.6; p.mover.z = -2.8;
    p.chest.s = 1 + br * 0.03;
    p.head.rx = -1.2 + br * 0.03; p.head.z = 0.3; p.head.rz = 0.15;
    arm(p, 1, 1.4, -0.55, 1.6); arm(p, -1, 1.4, -0.55, 1.6);
    p.legL.rx = p.legR.rx = 1.2;
    p.tail0.rx = 0.9; p.tail.rx = 0.9; p.tail.ry = 0.2 + br * 0.05;
    p.k.zzz = 1;
    f.mouth = br > 0.4 ? 'chew2' : 'smile'; f.blink = false;
    if (beat(s, 'snore', t, TAU / 1.5, 1.0)) rig._emit('snore');
  },
});
def('hurt', {
  loop: false, dur: 0.6, next: 'dizzy', nextFade: 0.2, expr: 'hurt',
  fn(t, p, f) {
    const u = smooth(t / 0.45);
    p.mover.rx = -1.45 * u; p.mover.y = 1.4 * u; p.mover.z = -2 * u;
    arm(p, 1, 2.4 * (1 - u) + 0.6, 1.2, 0.3); arm(p, -1, 2.4 * (1 - u) + 0.6, 1.2, 0.3);
    p.legL.rx = -1 * u; p.legR.rx = -0.6 * u;
    p.head.rx = 0.3;
    p.k.stars = u > 0.6 ? 1 : 0;
  },
});
// lying on the back, stars circling the head (root space centre of the head while lying)
def('dizzy', {
  loop: true, expr: 'dizzy',
  enter(s, rig) { rig._lyingY = { x: 0, y: 0.18, z: -0.62 }; },
  exit(s, rig) { rig._lyingY = null; },
  fn(t, p, f) {
    p.mover.rx = -1.48; p.mover.y = 1.4; p.mover.z = -2;
    const w = sin(t * 2.2);
    p.head.rz = w * 0.18; p.head.rx = 0.25;
    arm(p, 1, 0.8, 1.5 + sin(t * 3) * 0.1, 0.5); arm(p, -1, 0.6, 1.4 - sin(t * 3.4) * 0.1, 0.4);
    p.legL.rx = -0.9 + sin(t * 1.7) * 0.15; p.legR.rx = -0.5;
    p.legL.rz = 0.3; p.legR.rz = -0.3;
    p.tail0.rx = 0.4; p.tail.ry = sin(t * 2) * 0.2;
    p.k.stars = 1;
    f.blink = false;
  },
});
def('lie_stretcher', {
  loop: true, expr: 'dizzy',
  enter(s, rig) { rig._lyingY = { x: 0, y: 0.16, z: -0.6 }; },
  exit(s, rig) { rig._lyingY = null; },
  fn(t, p, f) {
    p.mover.rx = -1.52; p.mover.y = 1.0; p.mover.z = -1.6;
    arm(p, 1, 1.1, -0.35, 1.5); arm(p, -1, 1.1, -0.35, 1.5);
    p.legL.rx = -0.15; p.legR.rx = -0.15;
    p.head.rz = sin(t * 1.6) * 0.12; p.head.rx = 0.2;
    p.tail0.rx = 0.9; p.tail.rx = 0.1;
    p.k.stars = 1;
    f.eyes = (t % 5) > 3.5 ? 'half' : 'dizzy'; f.mouth = 'wobble';
  },
});
// a medic holding one end of the stretcher (poles at hip height, in front for the back one)
def('carry_stretcher', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.3) * TAU, cs = cos(ph);
    walkLegs(p, ph, 0.95, 0.7);
    p.mover.y = abs(cs) * 0.9;
    p.chest.rx = 0.12; p.head.rx = -0.12;
    arm(p, 1, 0.35, 0.55, 0.15); arm(p, -1, 0.35, 0.55, 0.15);
    tailRest(p); p.tail.ry = sin(ph) * 0.3;
    f.mouth = 'grin'; f.brows = 'angry';
    steps(s, ph, rig);
  },
});
def('stretcher_idle', {
  loop: true, expr: 'focused',
  fn(t, p) {
    life(t, p, 0.6);
    arm(p, 1, 0.35, 0.55, 0.15); arm(p, -1, 0.35, 0.55, 0.15);
    p.hips.y = -0.4; tailRest(p);
  },
});
def('nervous', {
  loop: true, expr: 'nervous',
  fn(t, p, f) {
    const j = sin(t * 9);
    arm(p, 1, 0.9 + j * 0.08, -0.25, 1.4); arm(p, -1, 0.9 - j * 0.08, -0.25, 1.4);
    p.head.ry = K(t % 2.6, [[0, 0], [0.4, 0.5], [0.9, 0.5], [1.2, -0.5], [1.8, -0.5], [2.2, 0]]);
    f.look = [p.head.ry * 1.8, 0];
    p.mover.y = abs(sin(t * 4.5)) * 0.25;
    p.legL.rx = sin(t * 9) * 0.1; p.legR.rx = -sin(t * 9) * 0.1;
    p.tail.ry = sin(t * 11) * 0.3; p.tail0.rx = -0.5;
    f.blush = 1;
  },
});
def('tap_foot', {
  loop: true, expr: 'grumpy',
  fn(t, p, f, s, rig) {
    life(t, p, 0.5);
    arm(p, 1, 0.55, -0.45, 1.75); arm(p, -1, 0.55, -0.45, 1.75); // arms crossed
    const tap = abs(sin(t * 6));
    p.legL.rx = -0.25 * tap; p.legL.y = tap * 0.3;
    p.head.rz = 0.1; p.head.rx = -0.05;
    tailRest(p); p.tail.rx += tap * 0.2;
    f.look = [0.6, -0.4];
    if (beat(s, 'tp', t, PI / 6, 0)) rig._emit('step');
  },
});

export { ANIMS as BEAVER_CHIBI_ANIMS, EXPRS as BEAVER_CHIBI_EXPRS };
