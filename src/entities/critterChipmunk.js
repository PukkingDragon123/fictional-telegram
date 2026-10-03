// ChipmunkTrader: "Pip", the travelling lumber trader. A small, bouncy
// orange chipmunk with cream-and-chocolate face stripes, big puffy cheeks
// (they really inflate), a striped bushy tail held high, a red buffalo-check
// flannel shirt with rolled sleeves, leather suspenders, jeans with rolled
// cuffs, little work boots, a tweed flat cap, a yellow pencil tucked behind
// his right ear, an orange tape measure clipped to his belt and an acorn
// peeking out of his breast pocket.
//
//   const p = new ChipmunkTrader();  scene.add(p.root);
//   p.play('count_logs');   // turns, taps an imaginary log pile with his pencil: 1, 2, 3... scribbles in his notepad
//   p.play('stuff_cheeks'); // acorns from the pocket, cheeks puff up HUGE, a proud muffled "mm-hm", gulp!
//   p.play('haggle');       // rubs his paws together, eyebrows waggle, points right at you, taps his nose
//   p.play('push_cart', { speed: worldSpeed / PIP_CART_SPEED });  // walks pushing his lumber cart (move the root!)
//   p.play('cart_rest');    // stands behind the parked cart, puffs, wipes his brow
//   p.attachCart(cart)      // use your own makeLumberCart() group as his cart (else he makes one); returns it
//   p.parkCart(parent?)     // leave a copy of the cart where it stands (world transform kept); returns the new group
//   p.onEvent = (name, rig, data) => {};  // 'step' 'tap' (data = count) 'scribble' 'stuff' 'gulp' 'rub' 'point' 'bell'
//                                         // 'hop' 'click' 'land' 'giggle' 'wipe' 'puff'
//
// Anims: idle wave talk laugh walk happy count_logs stuff_cheeks haggle push_cart cart_rest
// Expressions: neutral happy talk surprised sleepy smug sly focused laugh proud stuffed (+ BASE_EXPRS)
// Walk speed: 'walk' ~PIP_WALK_SPEED units/s, 'push_cart' ~PIP_CART_SPEED (the anims are in place: move the root;
// a play speed of s moves s times faster and the cart wheels roll to match).
// The cart (push_cart / cart_rest only) sits in front of him at z = PIP_CART_Z, push bar in his paws.
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~0.98 tall to the head top, ~1.05 to the cap, ~1.12 to the tail tip.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, handModel, Spring, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, COIN_ROWS, DROPLET_ROWS } from './npcProps.js';
import { spriteMatPal } from './npcProps2.js';
import { makeLumberCart } from './npcProps4.js';

export const PIP_WALK_SPEED = 0.7;
export const PIP_CART_SPEED = 0.55;
export const PIP_CART_Z = 1.08; // cart origin (axle) in front of him, root space
const CART_TILT = 0.06; // push bar lifted while pushing (the back legs clear the ground)
const BAR = [0.4375, -0.775]; // push bar (y, z) in cart space

const C = {
  fur: 0xd8874a, furD: 0xb86a32, furL: 0xeca468, furDD: 0x8a4a22,
  cream: 0xfaead2, creamD: 0xe8d0b0, creamL: 0xfff8ec,
  stripe: 0x4a2a1a, stripeL: 0x6a3e24,
  nose: 0x7a3a3a, noseL: 0xb86868, pink: 0xf0a0a8, pinkD: 0xd88090,
  red: 0xd8483e, redD: 0xa8303a, redL: 0xf06a50, blk: 0x3a2228,
  btn: 0xf4ecd8,
  denim: 0x4a6aa8, denimD: 0x3a5490, denimL: 0x6a8cc4, stitch: 0xf2c860,
  boot: 0x7a4a2a, bootD: 0x5a3420, bootL: 0x9a643a, sole: 0x3a2a24, lace: 0xe8d8b0,
  lea: 0x8a5232, leaD: 0x6a3a22, leaL: 0xa86a42,
  cap: 0x8a7a5a, capD: 0x6e6044, capL: 0xa8966e, capF: 0xc4b088,
  brass: 0xe8c050, brassD: 0xb88e2a,
  pen: 0xf6c834, penD: 0xd8a420, penL: 0xffe27a, penWood: 0xf2d0a0, lead: 0x3a3a42, eraser: 0xf08aa0, ferrule: 0xc0c4cc,
  tape: 0xf07a2a, tapeD: 0xc85a1a, tapeL: 0xffa860, tapeK: 0x2a2028, steel: 0xc8ccd4,
  acorn: 0xc8843a, acornD: 0xa0642a, acornL: 0xe0a45a, acap: 0x7a5232, acapD: 0x5c3c24, acapL: 0x956842,
  paper: 0xfaf6ea, line: 0x9ab8d8, cover: 0x3a7a5a, coverD: 0x2a5a42, ring: 0x9a9aa8,
};

const D = {
  HIP_Y: 4.4, WAIST: 1, NECK: 6.2, NECK_Z: 0.3, SH: [4.4, 5.0, 0.2], L_UP: 2.6, L_FORE: 2.6, L_HAND: 1.8,
  THIGH: 2.4, SHIN: 2.4, LEG_X: 2.0, EAR: [3.4, 6.0, -1.2], TAIL: [0.6, -3.4],
};
const EYE_Y = 4.9; // eye centre, head space (voxels)

// ------------------------------------------------------------------ models
const furCol = (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL, 0.12, 0.1);
const creamCol = (x, y, z) => tone(x, y, z, C.cream, C.creamD, C.creamL, 0.1, 0.08);
const denimCol = (x, y, z) => tone(x, y, z, C.denim, C.denimD, C.denimL, 0.12, 0.08);
/** Buffalo check: 2-voxel cells, red / dark red / near-black. */
const plaid = (x, y, z) => {
  const a = Math.floor((x + z + 80) / 2) % 2, b = Math.floor((y + 80) / 2) % 2;
  return a && b ? C.blk : a || b ? C.redD : (x + y) % 5 === 0 ? C.redL : C.red;
};
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 12; z >= -12; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -12; z <= 12; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -2, 1, -3, 2, 1.4, (x, y, z) => (y === 1 ? (x === -1 || x === 0) && z >= 1 ? C.brass : C.lea : denimCol(x, y, z)));
  // back pockets with yellow stitching
  for (const x0 of [-3, 1]) for (let x = x0; x <= x0 + 1; x++) for (let y = -1; y <= 0; y++) v.set(x, y, -4, y === 0 ? C.stitch : C.denimD);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  ell(v, 0, 2.5, -0.2, 4.6, 4.6, 4.0, (x, y, z) => (y < -1 ? null : plaid(x, y, z)));
  // button placket down the front
  for (let y = -1; y <= 6; y++) { const z = surfZ(v, -1, y); if (z !== null) { v.set(-1, y, z, y % 2 ? C.btn : C.blk); v.set(0, y, surfZ(v, 0, y), C.redD); } }
  // breast pocket (his left = +X) with an acorn cap peeking out
  for (let x = 1; x <= 3; x++) for (let y = 2; y <= 4; y++) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, y === 4 ? C.blk : plaid(x + 1, y, 0)); }
  { const z = surfZ(v, 2, 4); v.set(2, 5, z - 1, C.acap); v.set(1, 5, z - 1, C.acapL); v.set(2, 6, z - 1, C.acapD); }
  // suspenders: front straps (brass clips at the bottom), over the shoulders, an X across the back
  for (const x of [-4, 3]) {
    for (let y = -1; y <= 7; y++) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, y === -1 ? C.brass : (y + 40) % 3 === 0 ? C.leaL : C.lea); }
    for (let z = -4; z <= 3; z++) if (v.has(x, 7, z) && !v.has(x, 8, z)) v.set(x, 8, z, C.lea);
  }
  for (let y = -1; y <= 7; y++) {
    const xa = Math.round(-4 + ((y + 1) / 8) * 7), xb = Math.round(3 - ((y + 1) / 8) * 7);
    for (const x of [xa, xb]) { const z = surfZ(v, x, y, false); if (z !== null) v.set(x, y, z - 1, y === 3 ? C.leaL : C.lea); }
  }
  // furry neck (cream throat) + pointy shirt collar
  rbox(v, -3, 2, 6, 9, -2, 2, 1.2, (x, y, z) => (z >= 1 ? C.cream : C.fur));
  for (let x = -4; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const r = Math.hypot((x + 0.5) / 4.0, (z + 0.2) / 3.2);
    if (r <= 1 && r > 0.6) v.set(x, 7, z, z >= 2 ? C.redD : plaid(x, 7, z));
  }
  for (const s of [-1, 1]) { const x = s > 0 ? 1 : -2; v.set(x, 6, 3, C.red); v.set(x + s, 6, 3, C.blk); v.set(x, 5, 3, C.redD); }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const ax = abs(x + 0.5);
    if (ax < 1.2 && z < 1 && y >= 5) return y >= 6 || z < -1 ? C.stripe : C.stripeL; // dark dorsal stripe over the crown
    if (z >= -2 && ax >= 2.6) {
      // face stripes: cream brow line, chocolate eye stripe running back to the ear, cream below
      if (y === 6) return C.cream;
      if (y === 4 || y === 5) return z > 3 && ax < 3.6 ? C.fur : y === 5 ? C.stripe : C.stripeL;
      if (y === 3) return C.creamL;
    }
    if (y <= 2 && z >= 0) return creamCol(x, y, z);
    return furCol(x, y, z);
  };
  rbox(v, -5, 4, 0, 7, -4, 4, 3.0, col);
  // little muzzle + chin
  ell(v, 0, 2.3, 4.4, 2.3, 1.7, 1.7, (x, y, z) => (y >= 3 && z >= 5 ? C.creamL : creamCol(x, y, z)));
  return v;
}
function cheekModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.2, 1.9, 2.0, (x, y, z) => (y >= 1 && z < 1 ? furCol(x, y, z) : creamCol(x, y, z)));
  return v;
}
function noseModel() {
  const v = new VoxelModel();
  for (let x = -2; x <= 1; x++) v.set(x, 0, 0, C.nose);
  v.set(-1, -1, 0, C.nose); v.set(0, -1, 0, C.nose); v.set(-1, 1, -1, C.nose); v.set(0, 1, -1, C.nose);
  v.set(-1, 0, 1, C.noseL);
  return v;
}
function earModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, 0, 3, -1, 0, 1.0, (x, y, z) => (z === 0 && x === 0 && y >= 1 && y <= 2 ? C.pink : y === 3 ? C.furDD : furCol(x, y, z)));
  return v;
}
function capModel() {
  // tweed flat cap (fine voxels): low crown sloping down to a short brim at the front (+Z), a button on top
  const v = new VoxelModel();
  const tweed = (x, y, z) => ((x * 2 + (z >> 1) + 80) % 4 === 0 ? C.capD : (x + y * 3 + z * 7 + 99) % 11 === 0 ? C.capF : tone(x, y, z, C.cap, C.capD, C.capL, 0.1, 0.1));
  for (let x = -11; x <= 10; x++)
    for (let z = -11; z <= 11; z++) {
      const r = Math.hypot((x + 0.5) / 9.8, (z + 0.5) / 10.2);
      if (r > 1) continue;
      const h = Math.round(5.5 - max(0, z) * 0.3 - r * r * 2.2);
      for (let y = 0; y <= h; y++) v.set(x, y, z, y === 0 && r > 0.8 ? C.capD : tweed(x, y, z));
    }
  for (let z = 9; z <= 13; z++)
    for (let x = -8; x <= 7; x++) {
      if (abs(x + 0.5) > 8 - (z - 9) * 0.9) continue;
      v.set(x, Math.round(1 - (z - 9) * 0.2), z, z >= 12 ? C.capD : C.cap);
    }
  for (let x = -1; x <= 0; x++) for (let z = -2; z <= -1; z++) v.set(x, 6, z, C.capD);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, plaid);
  ell(v, 0.5, -0.8, 0.5, 2.1, 1.8, 2.1, plaid);
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.1, furCol);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (abs(x) === 2 || abs(z) === 2) { v.set(x, 0, z, (x + z) % 2 ? C.red : C.blk); v.set(x, -1, z, C.redD); } // rolled cuff
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.THIGH, 1, -2, 1, 1.2, denimCol);
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 2, 0, -1, 1, 1.0, denimCol);
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (abs(x + 0.5) > 1 || abs(z + 0.5) > 1) v.set(x, -D.SHIN + 2, z, (x + z) % 2 ? C.denimL : C.stitch); // cuff
  // little lace-up work boot, toe to the front
  const y = -D.SHIN;
  rbox(v, -2, 1, y, y + 1, -2, 3, 0.7, (x, yy, z) => (yy === y ? C.sole : z >= 2 ? C.bootL : tone(x, yy, z, C.boot, C.bootD, C.bootL, 0.1, 0.1)));
  for (let x = -1; x <= 0; x++) { v.set(x, y + 1, 1, C.lace); v.set(x, y + 1, 0, C.bootD); }
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  ell(v, 0, 2.8, 0, 1.8, 3.6, 1.7, (x, y, z) => (abs(x + 0.5) < 0.8 && z < 0 ? C.stripe : abs(x + 0.5) > 1.2 ? C.furL : furCol(x, y, z)));
  return v;
}
function tail2Model() {
  const v = new VoxelModel();
  const col = (x, y, z) => (abs(x + 0.5) < 0.9 && z < 0 ? C.stripe : abs(x + 0.5) > 1.6 ? (y % 2 ? C.cream : C.furL) : furCol(x, y, z));
  ell(v, 0, 3.2, 0, 2.6, 4.0, 2.2, col);
  ell(v, 0, 6.8, 1.2, 1.9, 1.7, 1.7, col);
  return v;
}
function pencilModel() {
  // yellow pencil along +Y (tip), pink eraser at -Y, origin in the middle
  const v = new VoxelModel();
  for (let y = -5; y <= 4; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y <= -5 ? C.eraser : y === -4 ? C.ferrule : x === -1 && z === 0 ? C.penL : z === -1 && x === 0 ? C.penD : C.pen);
  v.set(-1, 5, 0, C.penWood); v.set(0, 5, -1, C.penWood); v.set(-1, 5, -1, C.penWood); v.set(0, 5, 0, C.penWood);
  v.set(-1, 6, 0, C.lead); v.set(0, 6, -1, C.lead);
  return v;
}
const PEN_TIP = new THREE.Vector3(-0.5 * FV, 6.5 * FV, -0.5 * FV);
function tapeModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -3, 3, -3, 3, 1.6, (x, y, z) => {
    if (x === -2 || x === 1) { const r = Math.hypot(y, z); return r < 0.6 ? C.steel : r < 1.6 ? C.tape : r < 2.6 ? C.tapeK : C.tape; }
    return y >= 2 && z <= 0 ? C.tapeL : y <= -2 ? C.tapeD : C.tape;
  });
  v.set(-1, -2, 4, C.brass); v.set(0, -2, 4, C.brass); v.set(-1, -3, 4, C.brassD); v.set(0, -3, 4, C.brassD);
  return v;
}
function acornModel() {
  // held at the cap (origin), nut hangs along -Y
  const v = new VoxelModel();
  ell(v, 0, -3.2, 0, 2.3, 2.8, 2.3, (x, y, z) => (x < 0 && z > 0 && y > -4 ? C.acornL : y < -5 ? C.acornD : C.acorn));
  for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) for (let y = -1; y <= 0; y++) if (Math.hypot(x + 0.5, z + 0.5) < (y ? 2.4 : 2.9)) v.set(x, y, z, (x + z + y) % 2 ? C.acap : C.acapD);
  v.set(0, 1, 0, C.acapL); v.set(0, 2, 0, C.acapD);
  return v;
}
function padModel() {
  // little notepad: pages face +Z, spiral on top, held at the bottom centre (origin)
  const v = new VoxelModel();
  for (let x = -4; x <= 3; x++) for (let y = 0; y <= 9; y++) {
    v.set(x, y, -1, y === 9 ? C.coverD : C.cover);
    v.set(x, y, 0, x === -4 || x === 3 || y === 0 ? C.creamD : y % 2 === 0 && y < 8 && x > -4 ? C.line : C.paper);
  }
  for (const x of [-3, -1, 1, 3]) { v.set(x, 10, 0, C.ring); v.set(x, 10, -1, C.ring); }
  v.set(-2, 6, 1, C.lead); v.set(-1, 6, 1, C.lead); v.set(1, 4, 1, C.lead); v.set(-2, 4, 1, C.lead); // tallies
  return v;
}

const cache = geoCache(() => {
  const ear = buildGeo(earModel(), [0, 0, 0]);
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()), cheek: buildGeo(cheekModel(), [0, 0, 0]),
    earL: ear, earR: ear, nose: buildGeo(noseModel(), [-0.5, 0, 0], FV), cap: buildGeo(capModel(), [0, 0, 0], FV),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0, 0, 0]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]),
    tail: buildGeo(tailModel(), [0, 0, 0]), tail2: buildGeo(tail2Model(), [0, 0, 0]),
    pencil: buildGeo(pencilModel(), [0, 0, 0], FV), tape: buildGeo(tapeModel(), [0, 0, 0], FV),
    acorn: buildGeo(acornModel(), [0, 0, 0], FV), pad: buildGeo(padModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.furD, C.furDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.furD, C.furDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ sprites
const NUM_PAL = { k: '#3a2214', w: '#fffbe8', s: '#ffd23a' };
/** Chunky outlined digit (3x5 glyph, light top, gold bottom). */
function digitRows(d) {
  const F = ['###|#.#|#.#|#.#|###', '.#.|##.|.#.|.#.|###', '##.|..#|.#.|#..|###', '##.|..#|.#.|..#|##.', '#.#|#.#|###|..#|..#', '###|#..|##.|..#|##.', '.##|#..|###|#.#|###', '###|..#|.#.|.#.|.#.', '###|#.#|###|#.#|###', '###|#.#|###|..#|##.'];
  const g = F[d].split('|');
  const grid = [...Array(7)].map(() => Array(5).fill('.'));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (g[y][x] === '#') grid[y + 1][x + 1] = y < 2 ? 'w' : 's';
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    if (grid[y][x] !== '.') continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = grid[y + dy]?.[x + dx]; if (c === 'w' || c === 's') grid[y][x] = 'K'; }
  }
  return grid.map((r) => r.join('').replace(/K/g, 'k'));
}
const PUFF_PAL = { k: '#b89a6a', w: '#fff4dc', W: '#ecd8b0' };
const PUFF_ROWS = ['..kk..', '.kwWk.', 'kwwwWk', 'kWwwWk', '.kWWk.', '..kk..'];

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 20, eyes: [{ x: 12.5, y: 10 }, { x: 27.5, y: 10 }], rx: 4.0, ry: 4.6, style: 'bead', lash: false,
  blush: [{ x: 4, y: 17 }, { x: 36, y: 17 }], blushW: 3,
  mw: 28, mh: 10, mx: 14, my: 1, mstyle: 'deer', mHalf: 3,
  pal: { i: '#3a1e12', I: '#8a5432', b: '#4a2a1a', q: '#7a5a44', Q: '#a88a70', c: '#fff4e0' },
};
/** A cream ring round each eye so the bead eyes pop against the chocolate eye stripe. */
function eyeRings(P) {
  const ring = [];
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    if (P.get(x, y)) continue;
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (P.is(x + dx, y + dy, 'k') || P.is(x + dx, y + dy, 'p')) n++;
    if (n) ring.push(x, y);
  }
  for (let i = 0; i < ring.length; i += 2) P.set(ring[i], ring[i + 1], 'c');
}
/** Short whiskers + two little buck teeth under the ":3". */
function buckTeeth(P, st, cfg) {
  const m = st.mouth || 'smile';
  for (const s of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const y0 = 2 + k * 2;
      for (let i = 0; i <= 6; i++) P.set(cfg.mx + s * (7 + i) - (s < 0 ? 1 : 0), y0 + (k - 0.5) * i * 0.3, i > 4 ? 'Q' : 'q');
    }
  if (m === 'open' || m === 'laugh' || m === 'o' || m === 'yell' || m === 'sip' || m === 'chew2' || m === 'frown') return;
  const y0 = m === 'grin' ? 4 : 2, cx = cfg.mx;
  for (let x = cx - 2; x <= cx + 1; x++) for (let y = y0; y <= y0 + 2; y++) {
    if (m === 'grin' && P.get(x, y) && !P.is(x, y, 'k')) continue;
    P.set(x, y, x === cx - 2 || x === cx + 1 || y === y0 + 2 ? 'k' : 'e');
  }
  P.set(cx, y0, 'k'); P.set(cx, y0 + 1, 'k');
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 2, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'open', blush: 1, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 1, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 1, tear: 0 },
  sly: { eyes: 'half', brows: 'raised', mouth: 'cheeky', blush: 1, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 2, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 2, tear: 0 },
  stuffed: { eyes: 'happy', brows: 'up', mouth: 'chew1', blush: 2, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _q = new THREE.Quaternion();
export class ChipmunkTrader extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('ChipmunkTrader', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.earL.children[0].rotation.z = -0.15; this.earR.children[0].rotation.z = 0.15;
    // tail: base + springy tip
    this.joint('tail2', this.tail, 0, 5.6, 0); this.mesh(G.tail2, this.tail2);
    // puffy cheeks (meshes inflate in _post), nose, cap
    this.joint('cheekL', this.head, 2.7, 2.1, 3.3); this.cheekLM = this.mesh(G.cheek, this.cheekL);
    this.joint('cheekR', this.head, -2.7, 2.1, 3.3); this.cheekRM = this.mesh(G.cheek, this.cheekR);
    this._chS = [new Spring(150, 7), new Spring(150, 7)];
    this.joint('nose', this.head, 0, 3.6, 6.0); this.mesh(G.nose, this.nose, { shadow: false });
    this.joint('cap', this.head, 0, 7.5, 0.0);
    const capTilt = new THREE.Group(); capTilt.rotation.set(0.04, 0, -0.1); this.cap.add(capTilt);
    this.mesh(G.cap, capTilt);
    // face
    this.face = new NpcFace(FACE, { eyes: eyeRings, mouth: buckTeeth });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, EYE_Y + 2.5 - FACE.h / 8, 5.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 3.2 - FACE.mh / 8, 6.05);
    // pencil behind the right ear (or in the right paw), tape on the left hip, acorns + notepad in the paws
    this.pencilEar = this.mesh(G.pencil, this.head, { x: -4.6 * VS, y: 6.4 * VS, z: 0.6 * VS, shadow: false });
    this.pencilEar.rotation.set(1.35, 0, 0.35);
    this.pencil = this.mesh(G.pencil, this.gripR);
    this.tapeTuck = this.mesh(G.tape, this.hips, { x: 4.6 * VS, y: -0.2 * VS, z: 1.4 * VS });
    this.tapeTuck.rotation.set(0, 0.5, 0);
    this.acornL = this.mesh(G.acorn, this.gripL);
    this.acornR = this.mesh(G.acorn, this.gripR);
    this.pad = this.mesh(G.pad, this.gripL);
    // the lumber cart (push_cart / cart_rest)
    this.cart = null;
    this._cartDist = 0;
    this.attachCart(makeLumberCart());
    // sprites
    const spr = (m, n, sc = 0.06) => [...Array(n)].map(() => { const s = new THREE.Sprite(m); s.visible = false; s.scale.setScalar(sc); this.root.add(s); return s; });
    this.digits = [1, 2, 3, 4, 5, 6].map((d) => ({ s: spr(spriteMatPal(digitRows(d), NUM_PAL), 1)[0], age: 9, pos: new THREE.Vector3() }));
    this._cntSeen = 0;
    this.puffs = spr(spriteMatPal(PUFF_ROWS, PUFF_PAL), 4);
    this.coins = [0, 1, 2, 3, 4].map(() => this.sprite(COIN_ROWS, 0.06, this.root));
    this.drops = [0, 1].map(() => this.sprite(DROPLET_ROWS, 0.05, this.root));
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.root));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.root));
    for (const n of ['cheekL', 'cheekR', 'notes', 'spark', 'hearts', 'coins', 'sweat', 'puff', 'cnt', 'cartV', 'cartTilt', 'cartBob']) this.scalar(n, 0);
    this.scalar('penX', 0); this.scalar('penY', 1); this.scalar('penZ', 0.3);
    // springs: tail whips, cap and ears bounce, a little body squash
    this.jiggle('tail', 'rx', { k: 120, c: 6, az: 0.5, ay: 0.5, max: 0.5, probe: 'hips' });
    this.jiggle('tail', 'rz', { k: 120, c: 6, ax: -0.5, yaw: 0.04, max: 0.4, probe: 'hips' });
    this.jiggle('tail2', 'rx', { k: 85, c: 4.5, az: 0.6, ay: 0.6, max: 0.7, probe: 'tail' });
    this.jiggle('tail2', 'rz', { k: 85, c: 4.5, ax: -0.6, yaw: 0.05, max: 0.6, probe: 'tail' });
    this.jiggle('cap', 'rx', { k: 220, c: 10, az: -0.4, ay: 0.25, max: 0.2, probe: 'head' });
    for (const [n, s] of [['earL', 1], ['earR', -1]]) this.jiggle(n, 'rz', { k: 160, c: 7, ax: 1.2, ay: s * 0.6, max: 0.4, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.05, max: 0.07, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this._init(ANIMS, EXPRS, 'idle');
  }

  /** Use `cart` (a makeLumberCart() group) as his cart; it is re-parented under his root. Returns it. */
  attachCart(cart) {
    if (!cart) return null;
    if (this.cart && this.cart !== cart) this.cart.removeFromParent();
    this.cart = cart;
    cart.position.set(0, 0, PIP_CART_Z);
    cart.rotation.set(0, 0, 0);
    cart.visible = false;
    this.root.add(cart);
    return cart;
  }

  /** Leave a copy of the cart standing where his cart is now (level, his heading); adds it to `parent` and returns it. */
  parkCart(parent = this.root.parent) {
    const c = makeLumberCart();
    this.root.updateWorldMatrix(true, false);
    _w.set(0, 0, PIP_CART_Z); this.root.localToWorld(_w);
    this.root.getWorldQuaternion(_q);
    if (parent) {
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(_w);
      const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
      _q.premultiply(pq.invert());
      parent.add(c);
    }
    c.position.copy(_w); c.quaternion.copy(_q);
    for (let i = 0; i < 2; i++) c.userData.wheels[i].rotation.x = this.cart?.userData.wheels?.[i]?.rotation.x || 0;
    return c;
  }

  /** Pencil tip in root space (for particles). */
  pencilTip(out = new THREE.Vector3()) {
    const m = this.pencil.visible ? this.pencil : this.pencilEar;
    m.updateWorldMatrix(true, false);
    out.copy(PEN_TIP).applyMatrix4(m.matrixWorld);
    return this.root.worldToLocal(out);
  }

  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // --- held props
    const pen = !!p.vis.pencil;
    this.pencil.visible = pen; this.pencilEar.visible = !pen;
    if (pen) orientIn(this.pencil, this.chest, [k.penX, k.penY, k.penZ], [1, 0, 0], 1);
    this.acornL.visible = !!p.vis.acornL; this.acornR.visible = !!p.vis.acornR;
    if (this.acornL.visible) orientIn(this.acornL, this.chest, [0, 1, 0], [0, 0, 1], 1);
    if (this.acornR.visible) orientIn(this.acornR, this.chest, [0, 1, 0], [0, 0, 1], 1);
    this.pad.visible = !!p.vis.pad;
    if (this.pad.visible) orientIn(this.pad, this.chest, [0, 0.8, 0.6], [0, -0.5, 1], 1);
    // --- cheeks: springy inflation (overshoot + wobble)
    const ch = [k.cheekL, k.cheekR];
    [this.cheekLM, this.cheekRM].forEach((m, i) => {
      const x = this._chS[i].step(ch[i], 0, dt);
      const s = 1 + clamp(x, -0.25, 1.4) * 0.75 + sin(tz * 27 + i) * 0.025 * ch[i];
      m.scale.set(1 + (s - 1) * 1.1, 1 + (s - 1) * 0.85, 1 + (s - 1) * 0.35); // puffs out sideways, not over the eyes
      m.position.set((i ? -1 : 1) * max(0, x) * 1.6 * VS, -max(0, x) * 0.7 * VS, -max(0, x) * 0.4 * VS);
    });
    // --- cart
    const cart = this.cart;
    if (cart) {
      cart.visible = !!p.vis.cart;
      if (cart.visible) {
        const sp = this._cur ? this._cur.speed : 1;
        this._cartDist += k.cartV * sp * dt;
        cart.userData.wheels.forEach((w) => { w.rotation.x = this._cartDist / cart.userData.wheelR; });
        cart.position.set(0, k.cartBob, PIP_CART_Z);
        cart.rotation.set(k.cartTilt, 0, 0);
        cart.userData.update?.(dt);
      }
    }
    // --- counting numbers pop off the pencil tip, float up and fade
    const n = Math.round(k.cnt);
    if (n < this._cntSeen) this._cntSeen = n;
    while (n > this._cntSeen && this._cntSeen < 6) {
      const d = this.digits[this._cntSeen++];
      d.age = 0; this.pencilTip(d.pos); d.pos.y += 0.06;
    }
    for (const d of this.digits) {
      d.age += dt;
      d.s.visible = d.age < 1.3;
      if (!d.s.visible) continue;
      const u = d.age / 1.3;
      d.s.position.set(d.pos.x, d.pos.y + u * 0.22, d.pos.z);
      d.s.scale.setScalar(0.085 * min(1, d.age * 9) * (d.age < 0.12 ? 1.3 : 1) * (u > 0.75 ? (1 - u) * 4 : 1));
    }
    // --- feet dust (push / scurry), coins burst (happy), sweat drops (cart_rest)
    this.puffs.forEach((s, i) => {
      const u = (tz * 1.6 + i / 4) % 1;
      s.visible = k.puff > 0.5;
      s.position.set((i % 2 ? 0.12 : -0.12) + sin(i * 3) * 0.05, 0.03 + u * 0.12, -0.12 - u * 0.25);
      s.scale.setScalar(0.06 * (1 - u) + 0.02);
    });
    this.head.updateWorldMatrix(true, false);
    _w.set(0, 5 * VS, 4 * VS); this.head.localToWorld(_w); this.root.worldToLocal(_w);
    const cu = k.coins;
    this.coins.forEach((s, i) => {
      s.visible = cu > 0.02 && cu < 0.98;
      if (!s.visible) return;
      const a = (i / 5) * TAU + 0.4, r = 0.12 + cu * 0.3;
      s.position.set(_w.x + cos(a) * r, _w.y + 0.25 + cu * 0.45 - cu * cu * 0.5, _w.z + sin(a) * r * 0.5);
      s.scale.setScalar(0.06 * (cu < 0.8 ? 1 : (1 - cu) * 5) * (0.7 + 0.3 * abs(sin(tz * 12 + i))));
    });
    this.drops.forEach((s, i) => {
      const u = (tz * 1.3 + i * 0.5) % 1;
      s.visible = k.sweat > 0.5;
      s.position.set(_w.x + (i ? 0.2 : -0.2) + (i ? 1 : -1) * u * 0.1, _w.y + 0.2 + u * 0.08 - u * u * 0.25, _w.z);
      s.scale.setScalar(0.045 * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    this.notes.forEach((s, i) => {
      const u = (tz * 0.55 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w.x + 0.14 + u * 0.12 + sin(u * 8 + i) * 0.03, _w.y + 0.08 + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w.x + cos(a) * 0.3, _w.y + 0.16 + sin(a * 1.3) * 0.12, _w.z + sin(a) * 0.1);
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

/** Bushy tail held up behind him; lift 0..1 raises it, amt scales the sway. */
function tailUp(p, t, amt = 1, lift = 0) {
  p.tail.rx += -1.25 + lift * 0.25 + sin(t * 1.7) * 0.06 * amt;
  p.tail2.rx += 1.3 - lift * 0.2 + sin(t * 1.7 - 0.9) * 0.14 * amt;
  p.tail.rz += sin(t * 1.15) * 0.06 * amt; p.tail2.rz += sin(t * 1.15 - 0.7) * 0.1 * amt;
}
/** Bouncy little chipmunk stance. */
function stand(p, rig, t, amt = 1, crouch = 0.35) {
  rig.life(t, p, amt);
  rig.stance(p, crouch, 0.6, 0.3, 0.1);
  p.chest.rx += 0.03; p.head.rx -= 0.05;
  p.earL.rz += 0.8; p.earR.rz -= 0.8;
  tailUp(p, t, amt);
}
/** Both thumbs hooked under the suspenders (the trader's stance). */
function thumbs(p, rig, w = 1) {
  for (const s of [1, -1]) rig.reach(p, s, 2.6, 3.6, 4.3, [0.9, -0.2, -1], w);
  if (w > 0.5) { p.wristL.rx = p.wristR.rx = -0.2; p.wristL.rz = 0.3; p.wristR.rz = -0.3; p.handL = p.handR = 'fist'; }
}
function onHip(p, rig, side, w = 1) {
  rig.reach(p, side, 5.6, -0.2, 1.2, [0.9, 0.2, -1], w);
  const n = side > 0 ? 'L' : 'R';
  if (w > 0.5) { p['wrist' + n].rx = 0.4; p['wrist' + n].rz = side * 0.5; p['hand' + n] = 'fist'; }
}
/** Root-space point (world units) -> reach target. */
function reachRoot(p, rig, side, x, y, z, pole, w = 1) {
  const c = rig.toChest(p, y / VS, z / VS, _c);
  rig.reach(p, side, side * x / VS, c[0], c[1], pole, w);
}
/** Paws on the cart's push bar (cart tilt `tilt`, bob `bob`). */
function onBar(p, rig, tilt, bob, w = 1) {
  const y = BAR[0] * cos(tilt) - BAR[1] * sin(tilt) + bob, z = PIP_CART_Z + BAR[0] * sin(tilt) + BAR[1] * cos(tilt);
  for (const s of [1, -1]) reachRoot(p, rig, s, 0.17, y + 0.06, z - 0.03, [1, -0.6, -0.4], w);
  if (w > 0.5) { p.handL = p.handR = 'fist'; p.wristL.rx = p.wristR.rx = 0.6; }
}
function walkLegs(p, rig, ph, amp) {
  rig.walk(p, ph, amp);
  p.thighL.rz = 0.06; p.thighR.rz = -0.06;
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const T = t % 12;
    // rocks on his heels, thumbs in his suspenders
    const rock = sin(t * 2.4);
    p.hips.rx += rock * 0.035; p.chest.rx -= rock * 0.03; p.mover.y += max(0, rock) * 0.15;
    p.hips.x = sin(t * 0.9) * 0.25;
    thumbs(p, rig);
    // twitchy chipmunk head: quick jerks between still poses
    p.head.ry += K(T, [[0, 0], [0.7, 0], [0.76, 0.38, 'out'], [1.5, 0.38], [1.56, -0.3, 'out'], [2.2, -0.3], [2.26, 0, 'out']]);
    p.head.rx += K(T, [[1.5, 0], [1.56, -0.12, 'out'], [2.2, -0.12], [2.26, 0, 'out']]);
    f.look = [p.head.ry * 1.6, 0];
    // pencil from behind the ear: taps his chin, thinking... back it goes
    const think = win(T, 3.0, 5.4, 0.3, 0.3);
    if (think > 0) {
      const ear = rig.headPoint(p, 6.2, 0.6, _c);
      const e0 = ear[0], e1 = ear[1];
      const chin = rig.headPoint(p, 0.8, 5.4, _c);
      const atChin = win(T, 3.45, 4.9, 0.25, 0.25);
      const tap = abs(sin(T * 9)) * 0.5 * atChin;
      rig.reach(p, -1, lerp(lerp(2.6, 4.6, think), 1.8, atChin), lerp(lerp(3.6, e0 - 1.2, think), chin[0] - 1.2 + tap, atChin), lerp(lerp(4.3, e1, think), chin[1] + 0.6, atChin), [1, -0.6, -0.2], think);
      p.handR = 'fist'; p.wristR.rx = -0.5;
      p.vis.pencil = T > 3.3 && T < 5.1;
      p.k.penX = 0.3; p.k.penY = 0.9; p.k.penZ = 0.2;
      p.head.rx -= atChin * 0.12; p.head.rz += atChin * 0.1;
      if (atChin > 0.4) { f.look = [-0.6, -1.2]; f.brows = 'up'; f.mouth = 'flat'; }
    }
    // tail flick + a quick look round
    const fl = pulse(T, 6.3, 0.35);
    p.tail.rx -= fl * 0.3; p.tail2.rx += fl * 0.6;
    // a little nibble: cheeks pump, humming
    const hum = win(T, 8.0, 10.2, 0.25, 0.3);
    p.k.cheekL = p.k.cheekR = hum * (0.18 + abs(sin(t * 7)) * 0.1);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.head.rz += hum * sin(t * 4) * 0.08;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = sin(t * 14) > 0 ? 'chew1' : 'chew2'; }
    // tugs his cap brim
    const cap = win(T, 10.6, 11.7, 0.25, 0.25);
    if (cap > 0) {
      const m = rig.headPoint(p, 7.4, 6.0, _c);
      rig.reach(p, 1, lerp(2.6, 1.6, cap), lerp(3.6, m[0] - 1.0, cap), lerp(4.3, m[1] + 0.6, cap), [1, -0.6, -0.1], cap);
      p.handL = 'fist'; p.wristL.rx = -0.8;
      p.cap.rx += pulse(T, 10.9, 0.5) * 0.18;
      if (cap > 0.5) f.eyes = 'happy';
    }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a quick scurry: short steps, little hops, arms pumping, tail bobbing high
    const P = 0.5, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    walkLegs(p, rig, ph, 0.38);
    p.mover.y = abs(sn) * 0.7;
    p.hips.y = -0.5 + abs(cs) * 0.3;
    p.hips.rz = cs * 0.05; p.chest.rz = -cs * 0.05; p.hips.ry = -sn * 0.1;
    p.chest.rx = 0.12; p.head.rx = -0.1 + abs(sn) * 0.05; p.head.rz = cs * 0.04;
    p.armL.rx = sn * 0.7; p.armR.rx = -sn * 0.7; p.armL.rz = 0.2; p.armR.rz = -0.2;
    p.foreL.rx = p.foreR.rx = -1.1; p.handL = p.handR = 'fist';
    p.earL.rz += 0.8; p.earR.rz -= 0.8;
    tailUp(p, t * 2, 0.6, 0.2);
    p.tail2.rx += abs(sn) * 0.12;
    f.mouth = 'smile';
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    const wv = sin(t * 9);
    rig.reach(p, -1, 6.8 + wv * 0.8, 9.6, 2.0, [1, -0.6, 0.2]);
    p.wristR.rz = -wv * 0.45 + 0.2; p.wristR.rx = -0.2; p.handR = 'open';
    rig.reach(p, 1, 2.6, 3.6, 4.3, [0.9, -0.2, -1]); p.handL = 'fist'; p.wristL.rx = -0.2;
    p.mover.y += abs(sin(t * 4.5)) * 0.6;
    p.chest.rz -= 0.07; p.head.rz += 0.12 + sin(t * 4.5) * 0.06;
    p.tail.rz += sin(t * 9) * 0.15; p.tail2.rz += sin(t * 9 - 1) * 0.25;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 8, open: 'open', mid: 'grin', shut: 'smile' });
    // chatty salesman: open paw -> finger up "AND" -> arms wide "THIS many logs!"
    const T = t % 6.4;
    const offer = win(T, 0.2, 1.9, 0.25, 0.3), up = win(T, 2.2, 3.6, 0.2, 0.25), wide = win(T, 4.0, 5.9, 0.25, 0.3);
    const rest = 1 - max(offer, up, wide);
    thumbs(p, rig, rest);
    if (offer > 0) {
      rig.reach(p, 1, 6.6, 3.0 + sin(t * 5) * 0.3, 5.0, [1, -0.5, -0.3], offer);
      p.handL = 'open'; p.wristL.rz = 0.4 * offer; p.wristL.rx = -0.3;
      p.chest.ry += offer * 0.12;
    }
    if (up > 0) {
      rig.reach(p, -1, 5.6, 8.8, 3.6, [1, -0.5, -0.3], up);
      p.handR = 'point'; p.wristR.rz = sin(t * 12) * 0.25 * up;
      p.head.rx -= up * 0.08; p.chest.ry -= up * 0.08;
      f.brows = 'raised';
    }
    if (wide > 0) {
      const b = abs(sin(t * 6));
      for (const sd of [1, -1]) rig.reach(p, sd, 8.2 + b * 0.4, 5.6, 2.6, [1, -0.4, -0.2], wide);
      p.handL = p.handR = 'open'; p.wristL.rz = 0.5; p.wristR.rz = -0.5;
      p.mover.y += b * 0.4 * wide; p.chest.rx -= wide * 0.08;
      if (wide > 0.5) f.eyes = 'wide';
    }
    p.head.rx += on ? sin(t * 8) * 0.04 : 0;
    p.head.rz += sin(t * 1.3) * 0.08;
    p.tail2.rx += on ? sin(t * 8) * 0.06 : 0;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // clutches his tummy and rocks back, cheeks puffing with each "ha!", then slaps his knee
    const T = t % 3.6, slap = win(T, 2.2, 3.2, 0.15, 0.25);
    const ha = sin(t * 15);
    stand(p, rig, t, 0.3, 0.35 + abs(ha) * 0.3 + slap * 1.2);
    for (const sd of [1, -1]) rig.reach(p, sd, 2.4, 0.8, 4.6, [1, -0.6, -0.4], sd > 0 ? 1 : 1 - slap);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.8;
    if (slap > 0) {
      const hit = pulse(T, 2.55, 0.25);
      reachRoot(p, rig, -1, 0.14, 0.25 + 0.1 * (1 - hit), 0.12, [1, -0.6, -0.4], slap);
      p.handR = 'open';
    }
    p.chest.rx += lerp(-0.2, 0.3, slap) + ha * 0.05; p.head.rx += lerp(-0.25, 0.05, slap) + ha * 0.06;
    p.mover.y += abs(ha) * 0.3;
    p.k.cheekL = p.k.cheekR = 0.15 + abs(ha) * 0.12;
    p.head.rz = sin(t * 2.6) * 0.1;
    p.tail2.rx += ha * 0.15;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
    if (beat(s, 'g', t, 0.7, 0.1)) rig._emit('giggle');
    if (beat(s, 'sl', t, 3.6, 2.6)) rig._emit('slap');
  },
});

const HAPPY_DUR = 2.2;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // crouch, leap, CLICK his heels mid-air (the cap pops off and drops back on), land, a coin shower
    const jump = K(t, [[0, 0], [0.24, -1.4, 'out'], [0.34, 0], [0.64, 5.4, 'out'], [0.98, 0, 'in'], [1.08, -1.1, 'out'], [1.22, 0], [1.36, 1.0, 'out'], [1.5, 0, 'in'], [1.7, 0]]);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    const air = clamp((t - 0.36) / 0.6, 0, 1), click = sin(air * PI);
    if (jump > 0.3) {
      // both legs swing out to his right, heels meet with a click
      p.thighL.rx = -0.2; p.thighR.rx = -0.2; p.shinL.rx = p.shinR.rx = 0.5 + click * 0.5;
      p.thighL.rz = -0.2 - click * 0.55; p.thighR.rz = -0.2 - click * 0.75;
      p.mover.rz = click * 0.3; p.chest.rz -= click * 0.25;
    } else rig.stance(p, max(0, -jump) * 1.5 + 0.35, 0.6, 0.3, 0.1);
    p.hips.s = 1 + (jump < 0 ? jump * 0.07 : 0.03);
    const up = win(t, 0.3, 1.6, 0.12, 0.35);
    const fl = sin(t * 16) * 0.5 * up;
    for (const sd of [1, -1]) rig.reach(p, sd, lerp(2.6, 6.2, up), lerp(3.6, 9.4, up) + sd * fl, lerp(4.3, 2.0, up), [1, -0.6, -0.4]);
    p.handL = p.handR = up > 0.4 ? 'fist' : 'fist';
    p.cap.y += K(t, [[0.5, 0], [0.75, 3.2, 'out'], [1.0, 0, 'in']]);
    p.cap.ry += K(t, [[0.5, 0], [1.0, TAU, 'io']]) % TAU;
    tailUp(p, t, 0.4, up);
    p.k.spark = clamp((t - 0.5) / 1.3, 0, 1) * (t < 1.8 ? 1 : 0);
    p.k.coins = clamp((t - 0.62) / 1.2, 0, 1);
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (beat(s, 'h', t, 99, 0.34)) rig._emit('hop');
    if (beat(s, 'c', t, 99, 0.66)) rig._emit('click');
    if (beat(s, 'l1', t, 99, 0.98) || beat(s, 'l2', t, 99, 1.5)) rig._emit('land');
  },
});

// tap targets (chest space, right paw: x is mirrored) for the imaginary log pile in front-right of him
const TAPS = [[3.6, -0.6, 6.4], [1.4, -0.6, 6.6], [-0.8, -0.6, 6.4], [2.5, 2.2, 6.6], [0.3, 2.2, 6.6], [1.4, 4.8, 6.4]];
const TAP_T = [0.95, 1.5, 2.05, 2.75, 3.3, 4.0];
const CL = 6.4;
def('count_logs', {
  dur: CL, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, CL);
    // turns to the pile, pencil out from behind the ear, tap-tap-tap... six! scribbles it down, proud nod
    const turn = K(t, [[0, 0], [0.45, 1, 'io'], [5.6, 1], [6.1, 0, 'io']]);
    stand(p, rig, t, 0.5, 0.35 + turn * 0.4);
    p.mover.ry = -turn * 0.55;
    // which tap are we heading to?
    let i = 0;
    while (i < TAPS.length - 1 && t > TAP_T[i] + 0.12) i++;
    const prev = i > 0 ? TAPS[i - 1] : [2.6, 3.6, 4.3];
    const t0 = i > 0 ? TAP_T[i - 1] + 0.12 : 0.45, u = smooth((t - t0) / max(0.1, TAP_T[i] - 0.05 - t0));
    const cur = TAPS[i];
    const dip = pulse(t, TAP_T[i] - 0.05, 0.16);
    const work = win(t, 0.5, 4.3, 0.3, 0.3);
    const write = win(t, 4.5, 5.55, 0.25, 0.25);
    const ear = rig.headPoint(p, 6.2, 0.6, _c);
    let x = lerp(2.6, 4.6, win(t, 0.05, 0.45, 0.15, 0.1)), y = lerp(3.6, ear[0] - 1.2, win(t, 0.05, 0.45, 0.15, 0.1)), z = lerp(4.3, ear[1], win(t, 0.05, 0.45, 0.15, 0.1));
    x = lerp(x, lerp(prev[0], cur[0], u), work); y = lerp(y, lerp(prev[1], cur[1], u) + sin(u * PI) * 1.2 - dip * 0.6, work); z = lerp(z, lerp(prev[2], cur[2], u) + dip * 0.5, work);
    x = lerp(x, -0.4 + sin(t * 20) * 0.3, write); y = lerp(y, 3.4 + cos(t * 20) * 0.3, write); z = lerp(z, 5.6, write);
    const back = win(t, 5.6, 6.3, 0.15, 0.2);
    x = lerp(x, 4.6, back); y = lerp(y, ear[0] - 1.2, back); z = lerp(z, ear[1], back);
    rig.reach(p, -1, x, y, z, [1, -0.5, -0.4]);
    p.handR = 'fist'; p.wristR.rx = -0.2;
    p.vis.pencil = t > 0.32 && t < 6.0;
    p.k.penX = 0; p.k.penY = lerp(0.9, -0.7, max(work, write)); p.k.penZ = lerp(0.2, 1, max(work, write));
    // body follows the pile: bend down for the bottom row
    const low = work * (cur[1] < 1 ? 1 : cur[1] < 3 ? 0.5 : 0);
    p.chest.rx += low * 0.3; p.head.rx += 0.1 * work - low * 0.1;
    p.head.ry += work * (0.15 - cur[0] * 0.05);
    f.look = [work * (0.5 - cur[0] * 0.25), work * (1.2 - cur[1] * 0.2)];
    // left paw: on the hip, then holds the notepad up
    const pad = win(t, 4.2, 5.7, 0.3, 0.25);
    onHip(p, rig, 1, 1 - pad);
    if (pad > 0) { rig.reach(p, 1, 1.0, 2.4, 5.4, [1, -0.6, -0.4], pad); p.handL = 'fist'; p.wristL.rx = 0.3; }
    p.vis.pad = pad > 0.4;
    // counting mouth
    let n = 0; for (let k = 0; k < TAP_T.length; k++) if (t >= TAP_T[k]) n = k + 1;
    p.k.cnt = t < 6.2 ? n : 0;
    if (dip > 0.3) { f.mouth = 'o'; f.brows = 'up'; }
    if (write > 0.3) { f.look = [0.6, 1.6]; f.mouth = 'flat'; p.head.rx += 0.2; }
    const proud = win(t, 5.55, 6.4, 0.12, 0.2);
    if (proud > 0.2) { f.expr = 'proud'; p.head.rx -= pulse(t, 5.7, 0.4) * 0.25; p.k.spark = proud; }
    for (let k = 0; k < TAP_T.length; k++) if (beat(s, 't' + k, t, 99, TAP_T[k])) rig._emit('tap', k + 1);
    if (beat(s, 'w', t, 99, 4.7)) rig._emit('scribble');
  },
});

const SC = 5.2;
def('stuff_cheeks', {
  dur: SC, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SC);
    stand(p, rig, t, 0.5);
    // acorn trips: pocket -> mouth, three times; cheeks get bigger each time
    const pocket = [2.0, 4.6, 4.8], mouthP = rig.headPoint(p, 2.3, 6.6, _c), mouth = [0.6, mouthP[0] - 1.6, mouthP[1]];
    const trip = (a, side) => {
      // 0 rest, 1 pocket, 2 mouth
      const k1 = K(t, [[a, 0], [a + 0.32, 1, 'io'], [a + 0.36, 1], [a + 0.66, 2, 'io'], [a + 0.78, 2], [a + 1.0, 0, 'io']]);
      return k1;
    };
    const TL = [[0.1, 1], [1.05, -1], [2.0, 1]];
    let busyL = 0, busyR = 0;
    for (const [a, side] of TL) {
      const k1 = trip(a, side);
      if (k1 <= 0) continue;
      const restP = side > 0 ? [5.6, -0.2, 1.2] : [5.6, -0.2, 1.2];
      const pp = [side > 0 ? pocket[0] : -pocket[0], pocket[1], pocket[2]], mp = [side > 0 ? mouth[0] : -mouth[0], mouth[1], mouth[2]];
      const A = k1 <= 1 ? restP : pp, B = k1 <= 1 ? pp : mp, u = k1 <= 1 ? k1 : k1 - 1;
      rig.reach(p, side, lerp(A[0], B[0], u), lerp(A[1], B[1], u), lerp(A[2], B[2], u), [1, -0.5, -0.4]);
      const n = side > 0 ? 'L' : 'R';
      p['hand' + n] = 'fist'; p['wrist' + n].rx = -0.4;
      p.vis['acorn' + n] = (t > a + 0.34 && t < a + 0.7) || p.vis['acorn' + n];
      if (side > 0) busyL = 1; else busyR = 1;
    }
    if (!busyL) onHip(p, rig, 1);
    if (!busyR) onHip(p, rig, -1);
    // cheeks: L, then R, then both HUGE; wobble; gulp
    const gulp = K(t, [[3.85, 0], [4.0, 1, 'in']]);
    p.k.cheekL = (t > 0.7 ? 0.55 : 0) + (t > 2.62 ? 0.5 : 0);
    p.k.cheekR = (t > 1.65 ? 0.55 : 0) + (t > 2.62 ? 0.5 : 0);
    p.k.cheekL *= 1 - gulp; p.k.cheekR *= 1 - gulp;
    const proud = win(t, 2.75, 3.8, 0.15, 0.15);
    p.head.rx -= proud * 0.2; p.chest.rx -= proud * 0.08;
    p.head.rz += proud * sin(t * 7) * 0.12; p.mover.y += proud * abs(sin(t * 7)) * 0.4;
    p.k.notes = proud > 0.5 ? 1 : 0;
    if (t > 0.7 && t < 3.85) { f.expr = 'stuffed'; if (t > 2.62 && t < 2.9) f.eyes = 'shut'; }
    const gl = win(t, 3.9, 4.35, 0.05, 0.15);
    if (gl > 0.2) { f.expr = 'surprised'; p.head.rx -= gl * 0.2; p.cap.y += gl * 1.2; p.tail2.rx -= gl * 0.4; }
    const pat = win(t, 4.35, 5.1, 0.2, 0.2);
    if (pat > 0) {
      const b = abs(sin(t * 10)) * 0.5;
      for (const sd of [1, -1]) rig.reach(p, sd, 2.2, 0.6 + b, 4.6, [1, -0.6, -0.4], pat);
      p.handL = p.handR = 'open';
      f.expr = 'happy'; p.k.hearts = 1;
    }
    for (const [a] of TL) if (beat(s, 'st' + a, t, 99, a + 0.66)) rig._emit('stuff');
    if (beat(s, 'g', t, 99, 3.95)) rig._emit('gulp');
  },
});

const HG = 4.8;
def('haggle', {
  dur: HG, expr: 'sly', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HG);
    stand(p, rig, t, 0.5);
    // rubs his paws together, hunched and grinning...
    const rub = win(t, 0.1, 1.75, 0.2, 0.2);
    const r1 = sin(t * 24) * 0.6;
    if (rub > 0) {
      rig.reach(p, 1, 0.6, 3.0 + r1 * 0.3, 5.0 + r1, [1, -0.5, -0.6], rub);
      rig.reach(p, -1, 0.6, 3.0 - r1 * 0.3, 5.0 - r1, [1, -0.5, -0.6], rub);
      p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.2;
      p.chest.rx += rub * 0.14; p.head.rx += rub * 0.08; p.mover.y += abs(r1) * 0.1;
      f.look = [0, -0.6]; f.brows = (t % 0.5) < 0.25 ? 'raised' : 'up';
    }
    // ...winds up and points right at YOU, eyebrows waggling, little jabs
    const point = win(t, 2.0, 3.6, 0.15, 0.3), wind = win(t, 1.7, 2.05, 0.1, 0.05);
    const jab = pulse(t, 2.2, 0.2) + pulse(t, 2.6, 0.2) + pulse(t, 3.0, 0.2);
    if (wind > 0) { rig.reach(p, -1, 4.4, 5.2, 0.6, [1, -0.5, -0.4], wind); p.handR = 'point'; p.chest.rx -= wind * 0.1; }
    if (point > 0) {
      rig.reach(p, -1, 3.0, 6.6 + jab * 0.4, 5.2 + jab * 0.8, [1, -0.5, -0.4], point);
      p.handR = 'point'; p.wristR.rx = -0.7; p.wristR.rz = 0.3;
      onHip(p, rig, 1, point);
      p.chest.rx += point * 0.18 + jab * 0.05; p.head.rz += point * 0.15;
      f.brows = (t % 0.4) < 0.2 ? 'raised' : 'up';
      f.mouth = jab > 0.3 ? 'open' : 'cheeky';
    }
    // taps the side of his nose: "a deal's a deal"
    const nose = win(t, 3.65, 4.35, 0.2, 0.2);
    if (nose > 0) {
      const m = rig.headPoint(p, 3.6, 6.0, _c);
      rig.reach(p, -1, 1.4, m[0] - 1.6 + abs(sin(t * 14)) * 0.3, m[1] + 0.4, [1, -0.6, -0.2], nose);
      p.handR = 'point';
      if (nose > 0.5) f.eyes = 'happy';
    }
    const restW = 1 - max(rub, point, wind, nose);
    if (restW > 0.01) thumbs(p, rig, restW);
    if (beat(s, 'r', t, 0.5, 0.15) && rub > 0.5) rig._emit('rub');
    if (beat(s, 'pt', t, 99, 2.05)) rig._emit('point');
  },
});

def('push_cart', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    // leaning into the bar, short determined steps; wheels roll, the bell dings on the bumps
    const P = 0.56, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    p.vis.cart = true;
    p.k.cartV = PIP_CART_SPEED;
    p.k.cartTilt = CART_TILT + sin(t * 3.1) * 0.012;
    p.k.cartBob = abs(sin(t * 2.7)) * 0.006;
    p.mover.y = abs(sn) * 0.45;
    p.hips.z = -0.6; p.hips.rx = 0.12;
    walkLegs(p, rig, ph, 0.34);
    p.chest.rx = 0.2; p.head.rx = -0.22 + abs(sn) * 0.04; p.hips.rz = cs * 0.05; p.chest.rz = -cs * 0.04;
    onBar(p, rig, p.k.cartTilt, p.k.cartBob);
    p.earL.rz += 0.8; p.earR.rz -= 0.8;
    tailUp(p, t * 2, 0.5, 0.35);
    p.k.puff = 1;
    f.mouth = (t % 4) < 2 ? 'grin' : 'smile';
    stepEvents(s, ph, rig);
    if (beat(s, 'b', t, 3.2, 1.0)) { rig.cart?.userData.ring?.(); rig._emit('bell'); }
  },
});

def('cart_rest', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // behind the parked cart: puffing, wipes his brow with a sleeve, then a cheery look
    const T = t % 5;
    p.vis.cart = true;
    p.k.cartTilt = 0;
    const puff = win(T, 0, 2.0, 0.01, 0.3);
    stand(p, rig, t, 1 + puff * 1.5, 0.5);
    p.hips.z = -0.3; p.chest.rx += 0.1;
    onBar(p, rig, 0, 0);
    p.chest.s += puff * abs(sin(t * 5)) * 0.04;
    if (puff > 0.3) { f.mouth = sin(t * 5) > 0 ? 'open' : 'o'; f.eyes = 'happy'; }
    const wipe = win(T, 2.1, 3.3, 0.2, 0.25);
    if (wipe > 0) {
      const sw = K(T, [[2.3, -1], [3.0, 1.2]]);
      const m = rig.headPoint(p, 6.6, 4.4, _c);
      rig.reach(p, -1, sw * 2.0, m[0] - 1.6, m[1] + 0.8, [1, 0.4, -0.2], wipe);
      p.handR = 'relax'; p.wristR.rx = -0.4;
      p.head.rx -= wipe * 0.1;
      f.eyes = 'closed';
    }
    p.k.sweat = win(T, 0.3, 2.8, 0.1, 0.1) > 0.5 ? 1 : 0;
    if (T > 3.4) { f.expr = 'happy'; p.head.rz += sin(t * 3) * 0.06; }
    if (beat(s, 'w', t, 5, 2.4)) rig._emit('wipe');
    if (beat(s, 'p', t, 5, 0.2)) rig._emit('puff');
  },
});

export { ANIMS as CHIPMUNK_ANIMS };
