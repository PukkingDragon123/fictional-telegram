// BunnyGardener: "Clover", the meadow's gardener and usually the first friend
// a new pond owner meets. A plump cream rabbit with brown Dutch markings and
// big floppy ears (springy two-part ears, the left tip flops over), a straw
// sun hat with a pink cosmos, a pink gingham shirt with a peter-pan collar,
// green overalls with a bib pocket (a carrot peeks out), a cotton tail and a
// red-handled trowel tucked in her hip pocket.
//
//   const b = new BunnyGardener();  scene.add(b.root);
//   b.play('water_plants');   // mint watering can from behind her back, a sprout pops up
//   b.play('dig');            // kneels, digs with the trowel, pulls up a carrot -> pocket
//   b.play('sniff');          // ears perk, nose wiggles, "ooh, something smells nice"
//   b.onEvent = (name) => {};  // 'step' | 'hop' | 'land' | 'pour' | 'scoop' | 'pop' (carrot / sprout) | 'sniff' | 'giggle'
//
// Anims: idle wave talk laugh walk happy water_plants dig sniff
// Expressions: neutral happy talk surprised sleepy smug laugh sniff proud (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.5 units/s (a bouncy skip; move the root, the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.22 tall to the head, ~1.36 to the hat, ~1.55 to the ear tips.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, DROPLET_ROWS } from './npcProps.js';
import { spriteMatPal, DIRT_PAL, DIRT_ROWS, DIRT2_ROWS } from './npcProps2.js';

const C = {
  fur: 0xf6ead4, furD: 0xe2d0b2, furL: 0xfff8ec, furDD: 0xc8b090,
  brown: 0xa8744a, brownD: 0x86583a, brownL: 0xc08e5e, brownDD: 0x5e3a24,
  pink: 0xf4a6b6, pinkD: 0xdc8098, nose: 0xf07a96, noseD: 0xc8506e, whisk: 0x8a6a54,
  ging: 0xf0a0b4, gingD: 0xd87896, gingW: 0xfff4f4, collar: 0xffffff, collarD: 0xe8e0e0,
  ov: 0x5aa24a, ovD: 0x44843a, ovL: 0x7abe5e, stitch: 0xf6d878, brass: 0xe8c050, brassD: 0xb88e2a,
  straw: 0xf0d27a, strawD: 0xd4ae52, strawL: 0xfae6a0, band: 0xf08aa8, bandD: 0xc8607e,
  petal: 0xff8ab0, petalL: 0xffc4d8, petalD: 0xe0608a, bud: 0xffd23a, leaf: 0x5aae3c, leafD: 0x3e8a2c, leafL: 0x86d05a,
  iron: 0xb8c0cc, ironD: 0x8a92a0, ironL: 0xe4eaf2, handle: 0xd8403a, handleD: 0xa82a28,
  can: 0x6ac8b8, canD: 0x46a494, canL: 0xa0e8dc, rose: 0xe8c050, roseD: 0xb88e2a,
  carrot: 0xf08a2a, carrotD: 0xc8641a, carrotL: 0xffb05a,
  soil: 0x6a4228, soilD: 0x4e2e1a, soilL: 0x8a5a36, seed: 0xf6e0a0,
  pad: 0xf0b0b8,
};

const D = {
  CHIBI: { body: 0.8, head: 1.18, tail: 1.4 }, // [v20 npc rigs] small body, big head (BipedRig)
  HIP_Y: 6, WAIST: 1, NECK: 7.4, NECK_Z: 0.4, SH: [5.4, 6.2, 0.4], L_UP: 3.4, L_FORE: 3.4, L_HAND: 2.0,
  THIGH: 3.2, SHIN: 3.2, LEG_X: 2.5, EAR: [2.8, 8.2, -1.6], TAIL: [0.4, -5.6],
};
const EAR_L = 8; // base segment length (voxels); the tip hangs off its end

// ------------------------------------------------------------------ models
const furCol = (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL, 0.1, 0.08);
const brownCol = (x, y, z) => tone(x, y, z, C.brown, C.brownD, C.brownL, 0.14, 0.1);
const ovCol = (x, y, z) => tone(x, y, z, C.ov, C.ovD, C.ovL, 0.12, 0.08);
/** Pink gingham: 1-voxel checks in three tones. */
const gingCol = (x, y) => {
  const a = (x + 40) % 2, b = (y + 40) % 2;
  return a && b ? C.gingD : a || b ? C.ging : C.gingW;
};
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -14; z <= 14; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  // overall shorts, yellow stitching down the sides, trowel pocket on the right hip
  rbox(v, -5, 4, -3, 1, -4, 3, 1.8, (x, y, z) => ((x === -5 || x === 4) && (y + 40) % 2 === 0 ? C.stitch : ovCol(x, y, z)));
  for (let y = -2; y <= 0; y++) for (let z = -2; z <= 1; z++) v.set(-6, y, z, y === 0 ? C.ovD : z === -2 || z === 1 ? C.ovD : C.ov);
  for (let z = -2; z <= 1; z++) v.set(-6, 1, z, C.stitch);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // plump gingham body
  ell(v, 0, 2.6, -0.2, 6.2, 5.8, 5.4, (x, y, z) => (y < -1 ? null : gingCol(x, y, z)));
  // overall bib on the front + strap ends
  for (let x = -4; x <= 3; x++)
    for (let y = -1; y <= 5; y++) {
      const z = surfZ(v, x, y);
      if (z === null) continue;
      const edge = x === -4 || x === 3 || y === 5;
      v.set(x, y, z + 1, edge ? C.ovD : ovCol(x, y, z));
      if (y < 5) v.set(x, y, z, ovCol(x, y, z));
    }
  // waistband all round
  for (let x = -7; x <= 6; x++) { const zf = surfZ(v, x, -1), zb = surfZ(v, x, -1, false); if (zf !== null) v.set(x, -1, zf, C.ovD); if (zb !== null) v.set(x, -1, zb, C.ov); }
  // bib pocket (stitched) with a carrot top + seed packet peeking out
  for (let x = -3; x <= 1; x++) for (let y = 0; y <= 3; y++) { const z = surfZ(v, x, y); v.set(x, y, z + 1, y === 3 ? C.ovL : x === -3 || x === 1 || y === 0 ? C.stitch : C.ov); }
  { const z = surfZ(v, 0, 2); v.set(0, 4, z - 1, C.carrot); v.set(-1, 4, z - 1, C.carrotD); v.set(0, 5, z - 1, C.leaf); v.set(-1, 6, z - 1, C.leafL); v.set(1, 6, z - 1, C.leaf); v.set(0, 6, z - 2, C.leafD); }
  { const z = surfZ(v, -2, 2); v.set(-2, 4, z - 1, C.seed); v.set(-3, 4, z - 1, C.petal); }
  // straps: bib corners -> over the shoulders -> cross at the back, brass buttons
  for (const x of [-4, 3]) {
    for (let y = 5; y <= 8; y++) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, C.ov); }
    const z = surfZ(v, x, 5); v.set(x, 5, z + 1, C.brass);
  }
  for (let y = 0; y <= 8; y++) {
    const xa = Math.round(-4 + (y / 8) * 7), xb = Math.round(3 - (y / 8) * 7);
    for (const x of [xa, xb]) { const z = surfZ(v, x, y, false); if (z !== null) v.set(x, y, z - 1, y === 4 ? C.ovL : C.ov); }
  }
  for (const x of [-4, 3]) for (let z = -4; z <= 3; z++) if (v.has(x, 8, z) && !v.has(x, 9, z)) v.set(x, 9, z, C.ov);
  // fluffy neck + a white peter-pan collar with round tips
  rbox(v, -3, 2, 7, 10, -2, 2, 1.2, (x, y, z) => (z >= 1 ? C.furL : C.fur));
  for (let x = -4; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const r = Math.hypot((x + 0.5) / 4.2, (z + 0.2) / 3.4);
    if (r <= 1 && r > 0.55) v.set(x, 8, z, z >= 2 ? C.collarD : C.collar);
  }
  for (const s of [-1, 1]) { const x = s > 0 ? 1 : -2; v.set(x, 7, 3, C.collar); v.set(x + s, 7, 3, C.collar); v.set(x, 6, 3, C.collarD); }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    // Dutch markings: brown cap and back, cream blaze down the middle, cream cheeks + muzzle
    const brownish = y - 6.6 + max(0, -z) * 0.75 - (z >= 2 ? 0.8 : 0) > 0 && !(fx < 1.6 && z >= -1);
    return brownish ? brownCol(x, y, z) : furCol(x, y, z);
  };
  rbox(v, -6, 5, 0, 9, -5, 4, 3.4, col);
  ell(v, 0, 2.6, 0.6, 6.6, 2.9, 4.6, col); // chubby cheeks
  // muzzle: two puffy whisker pads + a little chin
  for (const s of [-1, 1]) ell(v, s * 1.15, 2.7, 4.4, 1.8, 1.5, 1.6, (x, y, z) => (y >= 3 && z >= 5 ? C.furL : furCol(x, y, z)));
  rbox(v, -1, 0, 0, 1, 3, 4, 0.6, C.furD);
  return v;
}
function noseModel() {
  // pink nose + whiskers (fine voxels), wiggles as one piece
  const v = new VoxelModel();
  for (let x = -2; x <= 1; x++) v.set(x, 0, 0, C.nose);
  v.set(-1, -1, 0, C.noseD); v.set(0, -1, 0, C.noseD); v.set(-1, 1, -1, C.nose); v.set(0, 1, -1, C.nose);
  v.set(-1, 0, 1, 0xffc0d0);
  return v;
}
function earModel() {
  // base segment: brown outside, pink inner (front face), symmetric so L/R share it
  const v = new VoxelModel();
  rbox(v, -2, 1, 0, EAR_L, -1, 0, 0.9, (x, y, z) => (z === 0 && abs(x + 0.5) < 1.1 && y >= 1 ? (y % 3 === 0 ? C.pinkD : C.pink) : brownCol(x, y, z)));
  return v;
}
function earTipModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -1, 5, -1, 0, 1.7, (x, y, z) => (z === 0 && abs(x + 0.5) < 1.1 && y <= 3 ? C.pink : y >= 4 ? C.brownD : brownCol(x, y, z)));
  return v;
}
function hatModel() {
  const v = new VoxelModel();
  // wide floppy straw brim with a woven checker + a dark rim
  for (let x = -9; x <= 8; x++)
    for (let z = -9; z <= 8; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5), a = Math.atan2(z + 0.5, x + 0.5);
      if (r > 8.4) continue;
      const droop = r > 6.4 ? (sin(a * 3 + 0.6) > 0.2 ? -1 : 0) + (r > 7.6 && sin(a * 3 + 0.6) > 0.7 ? -1 : 0) : 0;
      v.set(x, droop, z, r > 7.6 ? C.strawD : (x + z) % 2 ? C.straw : C.strawL);
    }
  // crown (the ears poke through it) + pink band
  for (let y = -3; y <= 3; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = y === 3 ? 2.9 : y < 0 ? 3.3 : 3.7;
        if (r > R || (y === 0 && r < R - 1)) continue;
        v.set(x, y, z, y === 1 ? (r > R - 1 ? C.band : C.straw) : y < 0 ? C.strawD : (x + y) % 2 ? C.straw : C.strawL);
      }
  // big pink cosmos with a yellow middle + two leaves, on the front right of the band
  const fx = -3, fz = 3, fy = 2;
  for (const [a, b] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, -1], [1, 1], [-1, -1], [-2, 0], [2, 0], [0, 2], [0, -2]])
    v.set(fx + a, fy + b, fz + 1, abs(a) + abs(b) === 2 && a && b ? C.petalD : abs(a) === 2 || abs(b) === 2 ? C.petal : C.petalL);
  v.set(fx, fy, fz + 2, C.bud); v.set(fx, fy, fz + 1, C.bud);
  v.set(fx + 2, fy - 1, fz + 1, C.leaf); v.set(fx + 3, fy - 1, fz, C.leafL); v.set(fx - 2, fy - 2, fz + 1, C.leafD);
  // ribbon tails at the back
  v.set(0, 1, -5, C.bandD); v.set(-1, 1, -5, C.band); v.set(0, 0, -6, C.band); v.set(-1, -1, -6, C.bandD); v.set(0, -2, -6, C.band);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, furCol);
  ell(v, 0.5, -0.9, 0.5, 2.3, 1.9, 2.3, (x, y, z) => (y === -2 ? C.gingD : gingCol(x, y + z, z))); // puff sleeve
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, furCol);
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.THIGH, 1, -2, 1, 1.2, (x, y, z) => (y === -D.THIGH ? C.ovL : ovCol(x, y, z)));
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (abs(x + 0.5) > 1 || abs(z + 0.5) > 1) v.set(x, -D.THIGH, z, (x + z) % 2 ? C.ovL : C.stitch); // rolled cuff
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 1, 0, -1, 1, 1.1, furCol);
  // long bunny feet: fluffy top, pink toe pads peeking at the front
  const y = -D.SHIN;
  rbox(v, -2, 1, y, y + 1, -2, 4, 0.8, (x, yy, z) => (z === 4 && yy === y ? C.pad : yy === y + 1 && z >= 2 ? C.furL : furCol(x, yy, z)));
  for (const x of [-2, 0]) v.set(x, y + 1, 4, C.furD);
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  ell(v, 0, 0.4, -1.4, 2.4, 2.3, 2.1, (x, y, z) => tone(x, y, z, C.furL, C.fur, 0xffffff, 0.2, 0.2));
  return v;
}
function trowelModel() {
  // red handle along +Y from the grip, scoop blade along -Y (fine voxels)
  const v = new VoxelModel();
  for (let y = -1; y <= 5; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === 5 ? C.handleD : x === -1 && z === 0 ? 0xff6a5a : C.handle);
  v.set(-1, -2, -1, C.ironD); v.set(0, -2, 0, C.ironD); v.set(-1, -2, 0, C.ironD); v.set(0, -2, -1, C.ironD);
  for (let y = -10; y <= -3; y++) {
    const w = y < -8 ? 1 : 2;
    for (let x = -w - 1; x <= w; x++) {
      v.set(x, y, 0, abs(x + 0.5) > w - 0.5 ? C.ironD : x === -1 ? C.ironL : C.iron);
      if (abs(x + 0.5) > w - 0.5 && y > -9) v.set(x, y, 1, C.ironD); // scoop curl
    }
  }
  return v;
}
function canModel() {
  // mint watering can, held by the top handle (origin), spout to +Z
  const v = new VoxelModel();
  const Y0 = -12;
  for (let y = Y0; y <= Y0 + 7; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > 3.9) continue;
        let c = x <= -2 && z >= 0 ? C.canL : C.can;
        if (y === Y0 || y === Y0 + 7) c = C.canD;
        if ((y === Y0 + 2 || y === Y0 + 5) && r > 3.2) c = C.canD;
        v.set(x, y, z, c);
      }
  // little painted daisy on the side
  v.set(4, Y0 + 3, 0, 0xffffff); v.set(4, Y0 + 4, -1, 0xffffff); v.set(4, Y0 + 4, 1, 0xffffff); v.set(4, Y0 + 5, 0, 0xffffff); v.set(4, Y0 + 4, 0, C.bud);
  // spout + rose
  for (let k = 0; k <= 6; k++) { v.set(-1, Y0 + 2 + k, 4 + k, C.can); v.set(0, Y0 + 2 + k, 4 + k, C.canD); }
  for (let x = -2; x <= 1; x++) for (let y = Y0 + 8; y <= Y0 + 10; y++) v.set(x, y, 11, (x + y) % 2 ? C.rose : C.roseD);
  // arched handle up to the grip
  for (let z = -3; z <= 2; z++) v.set(-1, 0, z, C.canD);
  for (let y = Y0 + 8; y <= -1; y++) { v.set(-1, y, -3, C.canD); v.set(-1, y, 2, C.canD); }
  return v;
}
/** Spout tip of canModel (fine voxels, can space). */
const CAN_SPOUT = [-0.5, -1.5, 12];
function carrotModel() {
  // held by the leaves (origin at the shoulder of the root), root hangs along -Y
  const v = new VoxelModel();
  for (let y = -11; y <= 0; y++) {
    const r = y > -3 ? 2.4 : y > -7 ? 1.9 : y > -9 ? 1.3 : 0.7;
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
      if (Math.hypot(x + 0.5, z + 0.5) > r) continue;
      v.set(x, y, z, (y + 40) % 3 === 0 && Math.hypot(x + 0.5, z + 0.5) > r - 0.8 ? C.carrotD : x <= -1 && z >= 0 ? C.carrotL : C.carrot);
    }
  }
  const fr = [[0, 1, 0], [-1, 2, 0], [1, 2, 0], [0, 2, 1], [-2, 3, 0], [2, 3, 0], [0, 3, -1], [-1, 4, 1], [1, 4, -1], [-3, 4, 0], [3, 4, 1], [0, 5, 0], [-2, 5, 1], [2, 5, -1], [0, 6, 1]];
  for (const [x, y, z] of fr) v.set(x - 1, y, z, y >= 5 ? C.leafL : (x + y) % 2 ? C.leaf : C.leafD);
  return v;
}
function moundModel() {
  // little pile of dug soil + the hole (sits on the ground)
  const v = new VoxelModel();
  for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) {
    const r = Math.hypot((x + 0.5) / 6, (z + 0.5) / 4);
    if (r > 1) continue;
    v.set(x, 0, z, r < 0.45 ? C.soilD : (x * 7 + z * 3) % 5 === 0 ? C.soilL : C.soil);
  }
  ell(v, 6.5, 0, -1.5, 4, 2.6, 3.2, (x, y, z) => (y < 0 ? null : (x + y * 3 + z) % 4 === 0 ? C.soilL : (x + z) % 3 === 0 ? C.soilD : C.soil));
  v.set(3, 1, 3, C.soil); v.set(8, 1, 2, C.soilL); v.set(-6, 1, -2, C.soil);
  return v;
}
function sproutModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 5; y++) v.set(0, y, 0, y < 4 ? C.leafD : C.leaf);
  for (const [x, y] of [[-1, 5], [-2, 6], [-3, 6], [-2, 7], [1, 4], [2, 5], [3, 5], [2, 6]]) v.set(x, y, 0, y >= 6 ? C.leafL : C.leaf);
  v.set(0, 6, 0, C.petalL); v.set(0, 7, 0, C.petal); v.set(-1, 7, 0, C.petalL); v.set(1, 7, 0, C.petalL); v.set(0, 8, 0, C.petalL); v.set(0, 7, 1, C.bud);
  return v;
}

const cache = geoCache(() => {
  const ear = buildGeo(earModel(), [0, 0, 0]);
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: ear, earR: ear, earTip: buildGeo(earTipModel(), [0, 0, 0]), hat: buildGeo(hatModel()), nose: buildGeo(noseModel(), [-0.5, 0, 0], FV),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0, 0, 0]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    trowel: buildGeo(trowelModel(), [0, 0, 0], FV), can: buildGeo(canModel(), [0, 0, 0], FV), carrot: buildGeo(carrotModel(), [0, 0, 0], FV),
    mound: buildGeo(moundModel(), [0, 0, 0], FV), sprout: buildGeo(sproutModel(), [0.5, 0, 0.5], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.fur, C.furDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.fur, C.furDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 48, h: 24, eyes: [{ x: 13.6, y: 12 }, { x: 34.4, y: 12 }], rx: 4.6, ry: 5.4, style: 'bead', lash: true,
  blush: [{ x: 6, y: 20 }, { x: 42, y: 20 }], blushW: 3,
  mw: 44, mh: 14, mx: 22, my: 1, mstyle: 'deer', mHalf: 4,
  pal: { i: '#4a2a1a', I: '#a8683a', b: '#7a4a2a', e: '#ffffff', E: '#e6dccc', q: '#9a7a62', Q: '#c8ae96' },
};
/** Whiskers (thin 1-texel lines out over the cheeks) + two little buck teeth under the ":3". */
function buckTeeth(P, st, cfg) {
  const m = st.mouth || 'smile';
  const wig = st.whisk || 0;
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const y0 = 3 + k * 2 + wig;
      for (let i = 0; i <= 11; i++) {
        const x = cfg.mx + s * (8 + i) - (s < 0 ? 1 : 0), y = y0 + (k - 1) * i * 0.28 - (i > 8 ? 0.5 : 0);
        P.set(x, y, i > 8 ? 'Q' : 'q');
      }
    }
  if (m === 'open' || m === 'laugh' || m === 'o' || m === 'yell' || m === 'sip' || m === 'chew2' || m === 'frown') return;
  const y0 = m === 'grin' ? 4 : 2, cx = cfg.mx;
  for (let x = cx - 2; x <= cx + 1; x++) for (let y = y0; y <= y0 + 2; y++) {
    const edge = x === cx - 2 || x === cx + 1 || y === y0 + 2;
    if (P.get(x, y) && !P.is(x, y, 'k') && m === 'grin') continue;
    P.set(x, y, edge ? 'k' : 'e');
  }
  P.set(cx - 1, y0 + 2, 'k'); P.set(cx, y0 + 2, 'k'); P.set(cx - 1, y0, 'e'); P.set(cx, y0, 'e');
  P.set(cx, y0, 'k'); // the split between the two teeth
  P.set(cx, y0 + 1, 'k');
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 2, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'open', blush: 1, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 1, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 1, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 2, tear: 0 },
  sniff: { eyes: 'closed', brows: 'up', mouth: 'chew1', blush: 1, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 2, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
export class BunnyGardener extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('BunnyGardener', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    // two-part floppy ears
    this.joint('earL2', this.earL, 0, EAR_L, 0); this.mesh(G.earTip, this.earL2);
    this.joint('earR2', this.earR, 0, EAR_L, 0); this.mesh(G.earTip, this.earR2);
    // hat (tilt on an inner group so the jiggle stays about the joint)
    this.joint('hat', this.head, 0, 9.3, -0.6);
    const hatTilt = new THREE.Group(); hatTilt.rotation.set(-0.3, 0, -0.06); this.hat.add(hatTilt);
    this.mesh(G.hat, hatTilt);
    this.joint('nose', this.head, 0, 3.9, 5.9);
    this.mesh(G.nose, this.nose, { shadow: false });
    // face
    this.face = new NpcFace(FACE, { mouth: buckTeeth });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 8.4 - FACE.h / 8, 5.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 3.6 - FACE.mh / 8, 6.05);
    // trowel: right hand or tucked in the hip pocket; can + carrot: in hand
    this.trowel = this.mesh(G.trowel, this.gripR);
    this.trowelTuck = this.mesh(G.trowel, this.hips, { x: -6.4 * VS, y: 0.4 * VS, z: -0.2 * VS });
    this.trowelTuck.rotation.set(0.25, 0, 0.12);
    this.can = this.mesh(G.can, this.gripR);
    this.carrot = this.mesh(G.carrot, this.gripL);
    this._rest = new THREE.Quaternion();
    // ground bits (root space)
    this.mound = this.mesh(G.mound, this.space, { x: -0.04, z: 0.5 });
    this.sprout = this.mesh(G.sprout, this.space, { x: -0.43, z: 0.56 });
    // sprites
    this.drops = [0, 1, 2, 3, 4].map(() => this.sprite(DROPLET_ROWS, 0.05, this.space));
    const dm = spriteMatPal(DIRT_ROWS, DIRT_PAL), dm2 = spriteMatPal(DIRT2_ROWS, DIRT_PAL);
    this.clods = [0, 1, 2, 3].map((i) => { const s = new THREE.Sprite(i % 2 ? dm2 : dm); s.visible = false; this.space.add(s); return s; });
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.space));
    this.scalar('sniff', 0); // nose wiggle amount
    this.scalar('canTip', 0);
    this.scalar('water', 0);
    this.scalar('sprout', 0);
    this.scalar('mound', 0);
    this.scalar('clods', 0);
    this.scalar('notes', 0);
    this.scalar('spark', 0);
    this.scalar('hearts', 0);
    this.scalar('trowelAim', 0); // 1 = blade down to the ground (dig), 0 = rigid in the fist
    // springy ears: the base sways, the tips flop and bounce on every hop
    for (const [n, s] of [['earL', 1], ['earR', -1]]) {
      this.jiggle(n, 'rx', { k: 110, c: 6, az: 2.4, ay: 0.6, max: 0.5, probe: 'head' });
      this.jiggle(n, 'rz', { k: 110, c: 6, ax: 2.4, yaw: s * 0.04, max: 0.5, probe: 'head' });
      this.jiggle(n + '2', 'rz', { k: 80, c: 4.5, ay: s * 1.6, ax: 1.0, yaw: s * 0.05, max: 0.9, probe: n });
      this.jiggle(n + '2', 'rx', { k: 80, c: 4.5, az: 1.2, ay: -0.4, max: 0.7, probe: n });
    }
    this.jiggle('hat', 'rx', { k: 200, c: 9, az: -0.7, ay: 0.3, max: 0.3, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 200, c: 9, ax: 0.7, max: 0.25, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.05, max: 0.07, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this.jiggle('tail', 's', { k: 160, c: 6, ay: 0.4, max: 0.25, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // nose wiggle (always a little twitch, a lot when sniffing)
    const sn = k.sniff;
    this.nose.rotation.x += sin(tz * 31) * 0.12 * sn;
    this.nose.position.y += sin(tz * 31) * 0.12 * VS * (0.2 + sn);
    this.nose.scale.setScalar(1 + abs(sin(tz * 15.5)) * 0.18 * sn);
    // props
    this.trowel.visible = !!p.vis.trowel;
    this.trowelTuck.visible = !p.vis.trowel;
    if (this.trowel.visible) {
      const a = k.trowelAim;
      orientIn(this.trowel, this.chest, [0, lerp(1, 0.55, a), lerp(0.2, -0.85, a)], [0, 0.3, 1], 1);
    }
    this.can.visible = !!p.vis.can;
    if (this.can.visible) {
      const a = k.canTip;
      orientIn(this.can, this.chest, [0.05, cos(a), sin(a)], [0.15, -sin(a), cos(a)], 1);
    }
    this.carrot.visible = !!p.vis.carrot;
    if (this.carrot.visible) orientIn(this.carrot, this.chest, [0.1, 1, 0.1], [0, 0, 1], 1);
    this.mound.visible = k.mound > 0.02;
    this.mound.scale.set(k.mound, k.mound, k.mound);
    this.sprout.visible = k.sprout > 0.02;
    this.sprout.scale.set(min(1, k.sprout * 1.3), k.sprout, min(1, k.sprout * 1.3));
    this.sprout.rotation.z = sin(tz * 3) * 0.08;
    // watering: drops fall from the spout in little arcs
    const wat = k.water > 0.3 && this.can.visible;
    if (wat) { this.can.updateWorldMatrix(true, false); _w2.set(CAN_SPOUT[0] * FV, CAN_SPOUT[1] * FV, CAN_SPOUT[2] * FV); this.can.localToWorld(_w2); this.space.worldToLocal(_w2); }
    this.drops.forEach((s, i) => {
      const u = (tz * 2.2 + i / 5) % 1;
      const y = wat ? _w2.y + 0.04 * u - 1.6 * u * u * 0.7 : 0;
      s.visible = wat && y > 0.02;
      if (!s.visible) return;
      s.position.set(_w2.x + sin(i * 2.3) * 0.03, y, _w2.z + 0.12 * u);
      s.scale.setScalar(0.045 * min(1, u * 5));
    });
    // dirt clods fly up and back off the trowel
    this.clods.forEach((s, i) => {
      const u = (tz * 1.7 + i / 4) % 1;
      s.visible = k.clods > 0.5;
      s.position.set(-0.08 + (i - 1.5) * 0.08 + sin(i * 5) * 0.04, 0.05 + u * 0.38 - u * u * 0.4, 0.5 - u * 0.12);
      s.scale.setScalar((i % 2 ? 0.035 : 0.05) * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    // face sprites
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 5 * VS, 4 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w.x + 0.14 + u * 0.12 + sin(u * 8 + i) * 0.03, _w.y + 0.08 + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w.x + cos(a) * 0.34, _w.y + 0.16 + sin(a * 1.3) * 0.12, _w.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i * 0.5) % 1;
      s.visible = k.hearts > 0.5;
      s.position.set(_w.x + (i ? 0.17 : -0.15) + sin(u * 6 + i) * 0.03, _w.y + 0.22 + u * 0.28, _w.z - 0.05);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 5));
    });
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Floppy ears: perk = 0 relaxed (left tip folded over), 1 = both straight up and alert. */
function ears(p, t, perk = 0, amt = 1) {
  const sw = sin(t * 1.3) * amt;
  p.earL.rz += -0.2 + perk * 0.14 + sw * 0.04; p.earR.rz += 0.16 - perk * 0.1 - sw * 0.04;
  p.earL.rx += -0.2 + perk * 0.12; p.earR.rx += -0.16 + perk * 0.1;
  p.earL2.rz += -lerp(1.0, 0.06, perk) + sin(t * 1.9) * 0.06 * amt;
  p.earL2.rx += lerp(0.55, 0.05, perk) + sin(t * 1.4) * 0.05 * amt;
  p.earR2.rz += lerp(0.22, 0.03, perk) - sin(t * 1.7 + 1) * 0.05 * amt;
  p.earR2.rx += lerp(0.18, 0.02, perk);
}
/** Standing bunny: plump, feet planted, ears relaxed, a tiny nose twitch. */
function stand(p, rig, t, { amt = 1, crouch = 0.4, perk = 0 } = {}) {
  rig.life(t, p, amt);
  rig.stance(p, crouch, 0.9, 0.7, 0.1);
  p.chest.rx += 0.04; p.head.rx -= 0.06;
  ears(p, t, perk, amt);
  p.k.sniff = 0.15 + (sin(t * 0.7) > 0.85 ? 0.5 : 0);
}
/** Both paws clasped in front of the tummy. */
function pawsFront(p, rig, w = 1) {
  rig.reach(p, 1, 3.0, 1.8, 5.8, [0.9, -0.4, -0.6], w);
  rig.reach(p, -1, 3.0, 1.8, 5.8, [0.9, -0.4, -0.6], w);
  if (w > 0.5) { p.wristL.rx = p.wristR.rx = 0.5; p.wristL.rz = 0.3; p.wristR.rz = -0.3; p.handL = p.handR = 'relax'; }
}
/** A paw on the hip. side +1 = left. */
function onHip(p, rig, side) {
  rig.reach(p, side, 6.4, 0.0, 1.6, [0.9, 0.2, -1]);
  const n = side > 0 ? 'L' : 'R';
  p['wrist' + n].rx = 0.4; p['wrist' + n].rz = side * 0.5; p['hand' + n] = 'fist';
}
/** Ground point (mover-space voxels y, z) to a chest-space reach target. */
function ground(p, rig, side, x, y, z, pole, w = 1) {
  const c = rig.toChest(p, y, z, _c);
  rig.reach(p, side, x, c[0], c[1], pole, w);
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.85);
    p.hips.x = sway * 0.35; p.hips.rz = sway * 0.03; p.chest.rz = -sway * 0.04;
    p.head.rz = sin(t * 0.85 + 0.6) * 0.07;
    const T = t % 11;
    pawsFront(p, rig);
    // ear twitch (right ear flicks back), then a peek down at the garden with the ears up
    const tw = pulse(T, 1.4, 0.25);
    p.earR.rx -= tw * 0.5; p.earR2.rz += tw * 0.5;
    const peek = win(T, 3.0, 5.0, 0.35, 0.35);
    p.head.ry += peek * 0.45; p.head.rx += peek * 0.22; p.chest.ry += peek * 0.1;
    ears(p, t, peek * 0.6, 0); // extra perk on top of the stand pose
    f.look = [peek * 1.2, peek * 1.2];
    if (peek > 0.5) { p.k.sniff = 0.6; f.mouth = 'chew1'; }
    // straightens her sun hat with one paw, a happy little hum
    const hat = win(T, 6.2, 7.6, 0.3, 0.3);
    if (hat > 0) {
      const m = rig.headPoint(p, 9.0, 3.2, _c);
      rig.reach(p, -1, lerp(3.0, 5.0, hat), lerp(1.8, m[0] - 2.2, hat), lerp(5.8, m[1] + 2.4, hat), [1, -0.6, -0.1], hat);
      p.handR = hat > 0.5 ? 'fist' : 'relax'; p.wristR.rx = lerp(0.5, -0.6, hat);
      const tug = pulse(T, 6.7, 0.6);
      p.hat.rz = tug * sin(t * 18) * 0.06 - tug * 0.06; p.hat.rx = -tug * 0.05;
      p.head.rz -= hat * 0.06;
    }
    const hum = win(T, 8.2, 10.4, 0.25, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.head.rz += hum * sin(t * 4) * 0.07;
    p.hips.x += hum * sin(t * 4) * 0.25;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = 'chew1'; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a bouncy skip: little hop on every step, ears flopping along
    const P = 0.72, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.5);
    p.mover.y = abs(sin(ph)) * 1.2;
    p.hips.y = -0.6 + abs(cs) * 0.3;
    p.hips.rz = cs * 0.06; p.chest.rz = -cs * 0.05; p.hips.ry = -sn * 0.08;
    p.chest.rx = 0.08; p.head.rx = -0.06 + abs(sn) * 0.04; p.head.rz = cs * 0.05;
    p.armL.rx = sn * 0.55; p.armR.rx = -sn * 0.55; p.armL.rz = 0.25; p.armR.rz = -0.25;
    p.foreL.rx = p.foreR.rx = -0.7; p.handL = p.handR = 'relax';
    ears(p, t, 0.15, 0.5);
    p.k.sniff = 0.2;
    f.mouth = 'smile';
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, { amt: 0.6, perk: 0.5 });
    // whole-arm wave high over the hat, little bounces on her toes
    const wv = sin(t * 8);
    rig.reach(p, 1, 8.4 + wv * 0.8, 11.0, 2.6, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.45 - 0.2; p.wristL.rx = -0.2; p.handL = 'open';
    onHip(p, rig, -1);
    p.mover.y += abs(sin(t * 4)) * 0.5;
    p.chest.rz += 0.07; p.head.rz += -0.12 + sin(t * 4) * 0.06;
    p.earL2.rz += sin(t * 8 + 1) * 0.15;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, { amt: 0.7, perk: 0.2 });
    const on = talkMouth(t, f, { rate: 7, open: 'open', mid: 'grin', shut: 'smile' });
    // chatty: paw offer -> "and THEN" finger up -> both paws to the cheeks (so excited!)
    const T = t % 6.4;
    const offer = win(T, 0.2, 1.9, 0.3, 0.3), up = win(T, 2.2, 3.6, 0.25, 0.25), cheeks = win(T, 4.0, 5.9, 0.3, 0.3);
    const rest = 1 - max(offer, up, cheeks);
    pawsFront(p, rig, rest);
    if (offer > 0) {
      rig.reach(p, 1, 7.6, 3.6 + sin(t * 5) * 0.3, 6.0, [1, -0.5, -0.3], offer);
      p.handL = 'open'; p.wristL.rz = 0.4 * offer; p.wristL.rx = -0.3;
      p.chest.ry += offer * 0.12;
    }
    if (up > 0) {
      rig.reach(p, -1, 6.6, 9.8, 4.4, [1, -0.5, -0.3], up);
      p.handR = 'point'; p.wristR.rz = sin(t * 12) * 0.25 * up;
      p.head.rx -= up * 0.08; p.chest.ry -= up * 0.08;
      f.brows = 'raised';
    }
    if (cheeks > 0) {
      for (const sd of [1, -1]) {
        const m = rig.headPoint(p, 3.2, 3.6, _c);
        rig.reach(p, sd, 4.6, m[0] - 1.6, m[1] + 1.0, [1, -0.8, 0.2], cheeks);
      }
      p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = -0.6;
      p.head.rz += sin(t * 6) * 0.1 * cheeks; p.mover.y += abs(sin(t * 6)) * 0.4 * cheeks;
      ears(p, t, cheeks * 0.8, 0);
      if (cheeks > 0.5) f.eyes = 'happy';
    }
    p.head.rx += on ? sin(t * 7) * 0.04 : 0;
    p.head.rz += sin(t * 1.3) * 0.08;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // giggles behind both paws, shoulders bouncing, ears flapping; then a big tummy laugh
    const T = t % 4.2, big = win(T, 2.2, 3.9, 0.2, 0.3);
    const ha = sin(t * 14);
    stand(p, rig, t, { amt: 0.3, crouch: 0.4 + abs(ha) * 0.3 });
    const m = rig.headPoint(p, 2.4, 6.2, _c);
    for (const sd of [1, -1]) rig.reach(p, sd, lerp(1.8, 4.6, big), lerp(m[0] - 2.6, 1.0, big), lerp(m[1] + 0.6, 6.0, big), [1, -0.6, -0.2]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = lerp(-0.6, 0.6, big);
    p.chest.rx += lerp(0.12, -0.18, big) + ha * 0.05; p.head.rx += lerp(0.1, -0.3, big) + ha * 0.06;
    p.mover.y += abs(ha) * 0.3;
    p.earL2.rz += ha * 0.2; p.earR2.rz -= ha * 0.2;
    p.head.rz = sin(t * 2.6) * 0.1;
    f.mouth = big > 0.4 ? (ha > -0.3 ? 'laugh' : 'open') : 'cheeky';
    if (big < 0.4) f.eyes = 'happy';
    if (beat(s, 'g', t, 0.8, 0.1)) rig._emit('giggle');
  },
});

const HAPPY_DUR = 2.0;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // a bunny "binky": crouch, leap, twist + kick mid-air, land, little bounce
    const jump = K(t, [[0, 0], [0.22, -1.2, 'out'], [0.34, 0], [0.62, 5.0, 'out'], [0.92, 0, 'in'], [1.02, -1.0, 'out'], [1.14, 0], [1.3, 1.4, 'out'], [1.44, 0, 'in'], [1.54, -0.5], [1.75, 0]]);
    const air = smooth(jump / 3);
    const tw = sin(clamp((t - 0.36) / 0.56, 0, 1) * PI);
    stand(p, rig, t, { amt: 0.4, perk: 0.6 });
    p.mover.y += max(0, jump);
    p.mover.ry = tw * 0.5; p.hips.rz += tw * 0.25; p.chest.rz -= tw * 0.3;
    if (jump > 0.2) {
      // kick the feet out to the side
      p.thighL.rx = -0.3 + tw * 0.5; p.thighR.rx = -0.3 + tw * 0.5;
      p.shinL.rx = p.shinR.rx = 0.7; p.thighL.rz = 0.3 + tw * 0.5; p.thighR.rz = -0.3 + tw * 0.2;
    } else rig.stance(p, max(0, -jump) * 1.6 + 0.4, 0.9, 0.7, 0.1);
    p.hips.s = 1 + (jump < 0 ? jump * 0.07 : 0.02 + air * 0.03);
    const up = win(t, 0.3, 1.5, 0.12, 0.35);
    const fl = sin(t * 16) * 0.5 * up;
    rig.reach(p, 1, lerp(3.0, 7.0, up), lerp(1.8, 10.0, up) + fl, lerp(5.8, 2.6, up), [1, -0.6, -0.4]);
    rig.reach(p, -1, lerp(3.0, 7.0, up), lerp(1.8, 10.0, up) - fl, lerp(5.8, 2.6, up), [1, -0.6, -0.4]);
    p.handL = p.handR = up > 0.4 ? 'open' : 'relax';
    p.chest.rx -= up * 0.12; p.head.rx -= up * 0.15;
    p.k.spark = clamp((t - 0.45) / 1.2, 0, 1) * (t < 1.7 ? 1 : 0);
    p.k.hearts = t > 0.9 && t < 1.9 ? 1 : 0;
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (beat(s, 'h', t, 99, 0.34)) rig._emit('hop');
    if (beat(s, 'l1', t, 99, 0.92) || beat(s, 'l2', t, 99, 1.44)) rig._emit('land');
  },
});

const WP = 5.2;
def('water_plants', {
  dur: WP, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, WP);
    stand(p, rig, t, { amt: 0.5 });
    // right paw fetches the can from behind her back, tips it over the spot in front, a sprout pops up
    const fetch = K(t, [[0, 0], [0.45, 1, 'io'], [4.5, 1], [4.95, 0, 'io']]);
    const lift = win(t, 0.55, 4.3, 0.35, 0.35);
    const tip = win(t, 1.0, 3.7, 0.3, 0.35);
    const behind = 1 - smooth(abs(t - 0.45) / 0.3) * (t < 1 ? 1 : 0);
    const bx = 3.6, by = 1.6, bz = -4.6; // behind the back
    let x = lerp(5.4, bx, fetch), y = lerp(0.6, by, fetch), z = lerp(2.0, bz, fetch);
    x = lerp(x, 8.4, lift); y = lerp(y, 6.6 + sin(t * 3) * 0.2 * tip, lift); z = lerp(z, 4.0, lift);
    rig.reach(p, -1, x, y, z, [1, -0.4, -0.4]);
    p.handR = 'fist'; p.wristR.rx = 0.2;
    p.vis.can = t > 0.45 && t < 4.95;
    p.k.canTip = tip * 0.7 + sin(t * 5) * 0.06 * tip;
    p.k.water = tip > 0.6 ? 1 : 0;
    void behind;
    // left paw on the knee, leaning to look
    rig.reach(p, 1, 4.0, 0.8, 4.8, [0.9, -0.3, -0.6]); p.handL = 'relax'; p.wristL.rx = 0.4;
    p.chest.rx += lift * 0.1; p.chest.ry -= lift * 0.12; p.head.rx += lift * 0.2; p.head.ry -= lift * 0.35;
    f.look = [-lift * 1.2, lift * 1.4];
    // the sprout grows under the drips, then a happy wiggle + hearts
    p.k.sprout = K(t, [[1.8, 0], [3.0, 0.5, 'io'], [3.4, 1.12, 'out'], [3.6, 1], [4.85, 1], [5.15, 0, 'in']]);
    const yay = win(t, 3.4, 4.6, 0.15, 0.3);
    if (yay > 0) { f.expr = 'happy'; p.k.hearts = yay > 0.5 ? 1 : 0; p.mover.y += abs(sin(t * 9)) * 0.5 * yay; ears(p, t, yay * 0.5, 0); }
    else if (tip > 0.5) { f.mouth = 'chew1'; p.k.notes = 1; }
    if (tip > 0.6 && beat(s, 'pour', t, 99, 1.4)) rig._emit('pour');
    if (beat(s, 'pop', t, 99, 3.3)) rig._emit('pop');
  },
});

const DG = 5.6;
def('dig', {
  dur: DG, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, DG);
    // kneel -> trowel out of the hip pocket -> scoop x3 (dirt flies) -> yank out a carrot -> ta-da -> into the bib pocket
    const kneel = K(t, [[0, 0], [0.5, 1, 'io'], [4.3, 1], [4.85, 0, 'io']]);
    rig.life(t, p, 0.4);
    p.hips.y -= kneel * 2.6; p.hips.z -= kneel * 0.8;
    p.chest.rx += kneel * 0.45; p.head.rx -= kneel * 0.15;
    rig.legTo(p, 1, -p.mover.y + kneel * 0.2, lerp(0.9, 2.4, kneel));
    rig.legTo(p, -1, -p.mover.y + kneel * 0.4, lerp(0.7, -3.0, kneel));
    p.thighL.rz = 0.15; p.thighR.rz = -0.15;
    ears(p, t, 0.2, 0.5);
    // trowel hand: hip pocket -> scoops in front
    const grab = K(t, [[0, 0], [0.35, 1, 'io']]);
    const work = win(t, 0.6, 2.95, 0.25, 0.25);
    const sc = (t - 0.75) / 0.72, ph = sc - Math.floor(sc);
    const stab = work * (sc >= 0 && sc < 3 ? K(ph, [[0, 0], [0.35, 1, 'in'], [0.5, 0.9], [0.8, -0.4, 'out'], [1, 0]]) : 0);
    const hipX = 6.6, hipY = 0.2, hipZ = 0.4;
    let x = lerp(5.4, hipX, grab), y = lerp(0.6, hipY, grab), z = lerp(2, hipZ, grab);
    if (work > 0) {
      const c = rig.toChest(p, 2.6 - stab * 2.0, 8.6 - stab * 0.6, _c);
      x = lerp(x, 2.4, work); y = lerp(y, c[0], work); z = lerp(z, c[1], work);
    }
    const back = K(t, [[4.4, 0], [4.75, 1, 'io'], [5.2, 0, 'io']]);
    x = lerp(x, hipX, back); y = lerp(y, hipY, back); z = lerp(z, hipZ, back);
    rig.reach(p, -1, x, y, z, [1, -0.3, -0.6]);
    p.handR = 'fist';
    p.vis.trowel = (t > 0.3 && t < 4.75);
    p.k.trowelAim = work * (0.7 + stab * 0.3);
    p.k.mound = K(t, [[0.8, 0], [1.2, 0.5, 'out'], [2.0, 0.8, 'out'], [2.8, 1, 'out'], [5.0, 1], [5.5, 0, 'in']]);
    p.k.clods = work > 0.5 && ph > 0.45 && ph < 0.95 && sc < 3 ? 1 : 0;
    p.chest.rx += stab * 0.08; p.mover.y += stab < 0 ? -stab * 0.15 : 0;
    // carrot: left paw grabs the leaves, tugs (ears strain), pops it out and holds it high
    const reachC = win(t, 3.0, 4.6, 0.25, 0.25);
    const tug = K(t, [[3.25, 0], [3.4, 1, 'out'], [3.5, 0.7], [3.6, 1], [3.75, 0, 'out']]);
    const show = win(t, 3.75, 4.55, 0.12, 0.25);
    const tuck = K(t, [[4.5, 0], [4.85, 1, 'io'], [5.1, 0, 'io']]);
    let lx = 4.4, ly = 0.4, lz = 4.6;
    if (reachC > 0) {
      const c = rig.toChest(p, 3.0 + tug * 1.2, 7.8, _c);
      lx = lerp(lx, 1.6, reachC); ly = lerp(ly, c[0], reachC); lz = lerp(lz, c[1], reachC);
    }
    lx = lerp(lx, 6.6, show); ly = lerp(ly, 10.4, show); lz = lerp(lz, 3.4, show);
    lx = lerp(lx, 1.2, tuck); ly = lerp(ly, 4.2, tuck); lz = lerp(lz, 7.4, tuck);
    rig.reach(p, 1, lx, ly, lz, [1, -0.4, -0.4]);
    p.handL = reachC > 0.4 || show > 0.2 ? 'fist' : 'relax';
    p.vis.carrot = t > 3.62 && t < 4.95;
    p.chest.rx -= tug * 0.15 + show * 0.25; p.head.rx -= show * 0.2;
    p.earL.rx += tug * 0.4; p.earR.rx += tug * 0.4;
    if (tug > 0.3) { f.eyes = 'shut'; f.mouth = 'flat'; }
    if (show > 0.3) { f.expr = 'proud'; p.k.spark = show; }
    else if (t > 4.6) f.expr = 'happy';
    else if (work > 0.3) f.look = [0, 1.4];
    f.blink = work < 0.3;
    for (let i = 0; i < 3; i++) if (beat(s, 'sc' + i, t, 99, 0.75 + 0.72 * (i + 0.35))) rig._emit('scoop');
    if (beat(s, 'pop', t, 99, 3.65)) rig._emit('pop');
  },
});

const SN = 3.6;
def('sniff', {
  dur: SN, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SN);
    // ears shoot up, lean in, sniff-sniff left and right, then "mmm!" and a happy ear flop
    const alert = K(t, [[0, 0], [0.25, 1, 'out'], [2.5, 1], [2.9, 0, 'io']]);
    stand(p, rig, t, { amt: 0.5, perk: alert });
    const lean = win(t, 0.3, 2.6, 0.35, 0.4);
    p.chest.rx += lean * 0.2; p.head.rx += lean * -0.05; p.head.z += lean * 0.8;
    p.hips.z -= lean * 0.4;
    const look = K(t, [[0.4, 0], [0.9, 0.35], [1.5, 0.35], [1.9, -0.3], [2.4, -0.3], [2.7, 0]]);
    p.head.ry += look; p.chest.ry += look * 0.2;
    p.k.sniff = lean > 0.1 ? 1 : 0.2;
    const puff = abs(sin(t * 15.5));
    p.head.y += puff * 0.15 * lean;
    rig.reach(p, 1, 3.4, 3.6, 6.4, [0.9, -0.4, -0.5]);
    rig.reach(p, -1, 3.4, 3.6, 6.4, [0.9, -0.4, -0.5]);
    p.handL = p.handR = 'relax'; p.wristL.rx = p.wristR.rx = 1.0;
    if (lean > 0.3) { f.expr = 'sniff'; }
    const mm = win(t, 2.6, 3.5, 0.15, 0.2);
    if (mm > 0.1) { f.expr = 'happy'; p.k.hearts = 1; p.earL2.rz -= mm * 0.3; p.mover.y += abs(sin(t * 10)) * 0.4 * mm; }
    if (lean > 0.3 && beat(s, 'sn', t, 0.6, 0.45)) rig._emit('sniff');
  },
});

export { ANIMS as BUNNY_ANIMS };
