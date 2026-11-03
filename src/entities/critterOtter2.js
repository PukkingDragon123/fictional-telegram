// [v32 dive] NoodlesOtter: "Noodles" (Wendell), the catfish noodler of Loon Lake. A big,
// round, slow-talking river otter: dark chocolate fur gone grey round the muzzle and
// brows, one notched ear, a crushed khaki bucket hat full of flies, a red-and-black
// buffalo plaid shirt with the sleeves rolled up over beefy forearms (the left one
// bandaged: Old Whiskers), olive chest waders on suspenders with brass buckles and a
// reed toothpick that wanders from one corner of his mouth to the other.
//
//   const n = new NoodlesOtter();  scene.add(n.root);
//   n.play('noodle');       // kneels, plunges his arm in, feels about... BITE! wrestles, yanks up a catfish clamped on his paw
//   n.play('tall_tale');    // "it was THIS big"... "no, THIS big"... "THIS BIG"
//   n.play('toothpick');    // rolls the toothpick across his mouth, smug squint
//   n.play('stretch_arms'); // laces his paws, pushes them out, cracks the knuckles, rolls the shoulders
//   n.onEvent = (name) => {};  // 'step' | 'splash' | 'bite' | 'yank' | 'flop' | 'crack' | 'chuckle'
//
// Anims: idle wave talk laugh walk happy noodle tall_tale toothpick stretch_arms
// Expressions: neutral happy talk surprised sleepy smug laugh focused content proud (+ BASE_EXPRS)
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.3 tall to the head top, ~1.45 to the hat.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, BANG_ROWS, DROPLET_ROWS } from './npcProps.js';
import { spriteMatPal, RIPPLE_PAL, RIPPLE_ROWS } from './npcProps2.js';

const C = {
  fur: 0x5c3a24, furD: 0x462c1a, furL: 0x76503a, furDD: 0x2e1c10,
  grey: 0xc8bcaa, greyD: 0xa49886, greyL: 0xe4dccc, nose: 0x241614, noseL: 0x5a4238, paw: 0x3e281a, pawD: 0x281810,
  red: 0xc8352c, redD: 0x8e2226, blk: 0x241a1e, blkL: 0x3a2a2e,
  wad: 0x5e6e34, wadD: 0x46542a, wadL: 0x7a8a46, wadS: 0x36421e, boot: 0x2a2e22, bootL: 0x3e4432,
  strap: 0x3a3a22, brass: 0xe0b040, brassD: 0xa87a20,
  hat: 0xb6a676, hatD: 0x92825a, hatL: 0xd2c496, band: 0x5a4a32, fly1: 0xe0403a, fly2: 0xffd23a, fly3: 0x3a8ad8, white: 0xfaf6ee,
  band2: 0xf2ece0, band2D: 0xd2c8b8, aid: 0xe8b08a,
  reed: 0xd8c48a, reedD: 0xb09a5a, reedTip: 0x8a6a3a,
  cat: 0x5e7084, catD: 0x3e4c5c, catL: 0x9aaab8, catB: 0xeef0ec, catS: 0x1e242c, catW: 0x2a2a30, mouth: 0x8a2a3a,
};

const D = {
  CHIBI: { body: 0.84, head: 1.22, tail: 1.3 }, // chunky body, big head (BipedRig)
  HIP_Y: 7, WAIST: 1, NECK: 8.2, NECK_Z: 0.6, SH: [5.2, 6.8, 0.2], L_UP: 3.4, L_FORE: 3.4, L_HAND: 2.0,
  THIGH: 3.5, SHIN: 3.5, LEG_X: 2.5, EAR: [4.9, 6.3, -0.6], TAIL: [0.6, -3.6],
};
const MOUTH_Y = 2.2, MOUTH_Z = 5.6; // toothpick root (head space, voxels)

// ------------------------------------------------------------------ models
const furCol = (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL, 0.12, 0.1);
const greyCol = (x, y, z) => tone(x, y, z, C.grey, C.greyD, C.greyL, 0.14, 0.1);
const wadCol = (x, y, z) => tone(x, y, z, C.wad, C.wadD, C.wadL, 0.1, 0.08);
/** Buffalo plaid: 2x2 red and black checks, the crossings darker. */
const plaid = (x, y) => {
  const a = (Math.floor((x + 40) / 2) & 1), b = (Math.floor((y + 40) / 2) & 1);
  return a && b ? C.blk : a || b ? ((x + y) & 3) === 0 ? C.redD : C.red : C.blkL;
};
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 16; z >= -16; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -16; z <= 16; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  // wader trousers: rubber, a seam down each side, a knee patch
  rbox(v, -5, 4, -3, 1, -3, 3, 1.7, (x, y, z) => (abs(x + 0.5) > 4.2 && (y & 1) ? C.wadS : wadCol(x, y, z)));
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // a round belly in plaid; the wader bib covers the front up to y 4
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (y <= 4 && z >= -0.5 && fx < 3.8) return wadCol(x, y, z);
    if (y <= 0) return wadCol(x, y, z);
    return plaid(x, y);
  };
  rbox(v, -5, 4, -1, 8, -3, 2, 2.3, col);
  ell(v, 0, 2.0, 0.6, 5.4, 4.4, 4.2, (x, y, z) => (y < -1 ? null : col(x, y, z))); // the belly
  // bib edge + a chest pocket with a reel peeking out
  for (let x = -4; x <= 3; x++) { const z = surfZ(v, x, 4); if (z !== null) v.set(x, 4, z, C.wadS); }
  for (let x = -2; x <= 1; x++) for (let y = 1; y <= 3; y++) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, y === 3 ? C.wadS : C.wadL); }
  { const z = surfZ(v, 1, 3); if (z !== null) { v.set(1, 4, z, C.brass); v.set(0, 4, z, C.brassD); } }
  // suspenders: from the bib corners up over the shoulders, crossing at the back
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 3 : -4;
    for (let y = 4; y <= 9; y++) {
      const x = x0 - s * Math.round((y - 4) * 0.25);
      const zf = surfZ(v, x, y);
      if (zf !== null) v.set(x, y, zf + 1, y === 4 ? C.brass : C.strap);
      const zb = surfZ(v, x - s * Math.round((9 - y) * 0.45), y, false);
      if (zb !== null) v.set(x - s * Math.round((9 - y) * 0.45), y, zb - 1, C.strap);
    }
  }
  // collar: open plaid, grey-flecked fur throat
  rbox(v, -3, 2, 7, 10, -2, 2, 1.2, (x, y, z) => (z >= 1 ? ((x + y) % 3 === 0 ? C.greyD : C.grey) : C.fur));
  for (const x of [-3, 2]) v.set(x, 8, 2, C.redD);
  v.set(-2, 8, 3, C.red); v.set(1, 8, 3, C.red);
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z >= 1 && y <= 3.8 - fx * 0.2) return greyCol(x, y, z); // grizzled muzzle + cheeks
    if (z >= 2 && y >= 6 && y <= 7 && fx > 1 && fx < 4.4 && hash(x, y, z) < 0.55) return C.greyL; // bushy grey brows
    if (z >= 2 && Math.hypot(fx - 2.5, y + 0.5 - 5.6) < 2.1) return tone(x, y, z, C.furL, C.fur, 0x8a6044, 0.1, 0.14);
    if (y >= 6 && z <= -1 && (x * 5 + y * 3 + z * 7) % 9 === 0) return C.greyD; // a few grey hairs on top
    return furCol(x, y, z);
  };
  rbox(v, -6, 5, 0, 8, -4, 3, 3.2, col);
  ell(v, 0, 2.5, 0.2, 6.4, 3.0, 4.0, col); // broad jowls
  for (const s of [-1, 1]) ell(v, s * 1.3, 1.9, 4.1, 2.1, 1.6, 1.8, (x, y, z) => (y >= 2 && z >= 5 ? C.greyL : greyCol(x, y, z)));
  for (let x = -1; x <= 0; x++) for (let z = 4; z <= 5; z++) v.set(x, 3, z, x === -1 && z === 5 ? C.noseL : C.nose);
  v.set(-1, 0, 4, C.greyD); v.set(0, 0, 4, C.greyD);
  return v;
}
const hash = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function earModel(notch) {
  const v = new VoxelModel();
  for (let y = 0; y <= 1; y++) for (let z = -1; z <= 0; z++) v.set(0, y, z, y === 1 ? C.furD : C.fur);
  v.set(0, 0, 1, C.furDD); v.set(1, 0, 0, C.furD); v.set(1, 1, -1, C.furD); v.set(1, 0, -1, C.fur);
  if (notch) v.set(0, 1, 0, null); // the notch (Old Whiskers again)
  return v;
}
function hatModel() {
  const v = new VoxelModel();
  // crushed bucket hat: a slightly tapered crown with a dent, a soft brim drooping all round
  for (let x = -8; x <= 7; x++)
    for (let z = -8; z <= 7; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 7.4 || r < 4.8) continue;
      const droop = -Math.round(max(0, r - 5.2) * (0.55 + (x > 2 ? 0.25 : 0)));
      const c = r > 6.8 ? C.hatD : (x + z * 3) % 7 === 0 ? C.hatL : C.hat;
      v.set(x, droop, z, c);
      if (r > 6.6 && (x + z) % 2 === 0) v.set(x, droop - 1, z, C.hatD); // stitched rim
    }
  for (let y = 0; y <= 4; y++) {
    const R = 5.0 - y * 0.25;
    for (let x = -6; x <= 5; x++)
      for (let z = -6; z <= 5; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > R) continue;
        if (y === 4 && abs(x + 0.5) < 1.6) continue; // the dent on top
        const top = y === 4 || (y === 3 && abs(x + 0.5) < 1.6);
        v.set(x, y, z, y <= 1 ? (r > R - 1 ? C.band : null) : r > R - 1 || top ? (top && x < 0 ? C.hatL : (x * 3 + y + z) % 5 === 0 ? C.hatD : C.hat) : null);
      }
  }
  // flies hooked in the band (front-left and side)
  const put = (x, y, z, c) => v.set(x, y, z, c);
  put(-3, 1, 5, C.fly1); put(-3, 2, 5, C.fly2); put(-4, 1, 5, C.white);
  put(2, 1, 5, C.fly3); put(3, 1, 5, C.fly2); put(2, 2, 5, C.white);
  put(5, 1, 1, C.fly1); put(5, 2, 1, C.fly3);
  return v;
}
function upperModel() {
  // rolled plaid sleeve, the roll a lighter cuff at the elbow
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => (y <= -D.L_UP + 1 ? ((x + z) & 1 ? C.red : C.redD) : plaid(x * 2, y)));
  ell(v, 0.5, -0.4, 0.5, 2.2, 1.6, 2.2, (x, y, z) => (y < -1 ? null : plaid(x * 2 + 1, y)));
  return v;
}
function foreModel() {
  // big furry noodling forearm, broad at the wrist
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.0, (x, y, z) => furCol(x, y, z));
  ell(v, 0.5, -D.L_FORE * 0.55, 0.5, 2.1, 1.9, 2.1, (x, y, z) => furCol(x, y, z));
  return v;
}
function bandageModel() {
  // a white wrap round the left forearm, two crossed sticking plasters on top
  const v = new VoxelModel();
  for (let y = -3; y <= -1; y++)
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        const r = Math.hypot(x, z);
        if (r < 1.6 || r > 2.5) continue;
        v.set(x, y, z, (y + x + z) & 1 ? C.band2 : C.band2D);
      }
  v.set(0, -2, 3, C.aid); v.set(-1, -3, 3, C.aid); v.set(1, -1, 3, C.aid); v.set(1, -3, 3, C.aid); v.set(-1, -1, 3, C.aid);
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, wadCol);
  return v;
}
function shinModel() {
  // wader boots: rubber up to the knee, a thick tread sole
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.SHIN + 1, 0, -2, 1, 0.9, (x, y, z) => (y === 0 ? C.wadS : y > -D.SHIN + 2 ? wadCol(x, y, z) : C.boot));
  const y = -D.SHIN;
  rbox(v, -2, 1, y, y + 1, -2, 3, 0.7, (x, yy, z) => (yy === y ? C.boot : z === 3 ? C.bootL : C.boot));
  for (let z = -2; z <= 3; z += 2) v.set(-2, y, z, C.bootL);
  return v;
}
function tailSegModel(r0, r1, len, tip) {
  const v = new VoxelModel();
  for (let z = 0; z >= -len; z--) {
    const u = -z / len, r = lerp(r0, r1, u);
    for (let x = -3; x <= 2; x++)
      for (let y = -3; y <= 2; y++) {
        if (Math.hypot(x + 0.5, y + 0.5) > r) continue;
        v.set(x, y, z, y >= 1 ? (tip && u > 0.7 ? C.furDD : C.furD) : y <= -2 ? C.furL : furCol(x, y, z));
      }
  }
  return v;
}
function reedModel() {
  // the toothpick: a chewed reed stalk with a seed tuft (fine voxels, along +Z from the root)
  const v = new VoxelModel();
  for (let z = 0; z <= 9; z++) v.set(0, Math.round(z * 0.15), z, z < 2 ? C.reedD : C.reed);
  v.set(0, 2, 10, C.reedTip); v.set(1, 2, 10, C.reedTip); v.set(0, 3, 10, C.reedTip); v.set(-1, 2, 11, C.reedD);
  return v;
}
function catfishModel() {
  // a channel catfish, head at -X, mouth wide open (it clamps the paw), whiskers sweeping back
  const v = new VoxelModel();
  for (let x = -11; x <= 12; x++) {
    const u = (x + 11) / 23;
    const h = u < 0.2 ? 3.4 : u < 0.6 ? 3.6 - (u - 0.2) * 1.5 : 3.0 * (1 - (u - 0.6) / 0.48);
    const w = u < 0.3 ? 3.6 : h * 0.8;
    for (let y = -4; y <= 4; y++)
      for (let z = -4; z <= 3; z++) {
        const dy = (y + 0.5) / max(0.6, h), dz = (z + 0.5) / max(0.6, w);
        if (dy * dy + dz * dz > 1) continue;
        if (u < 0.08 && abs(y + 0.5) < 1.2) continue; // the open mouth
        let c = y >= 1 ? C.catD : y <= -2 ? C.catB : C.cat;
        if (y >= 0 && y <= 1 && hash(x, y, z) < 0.12) c = C.catS; // freckles
        if (y >= 1 && (x * 7 + z * 3) % 11 === 0) c = C.catL;
        v.set(x, y, z, c);
      }
  }
  for (let y = -1; y <= 0; y++) for (let z = -2; z <= 1; z++) v.set(-11, y, z, C.mouth);
  // forked tail, dorsal spine, adipose fin, eyes
  for (let y = -5; y <= 5; y++) { const span = abs(y); if (span < 1) continue; for (let x = 12; x <= 12 + Math.round(span * 0.6) + 1; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, span > 3 ? C.catS : C.catD); }
  for (let y = 4; y <= 7; y++) v.set(-3 + (y - 4), y, -1, C.catS);
  v.set(6, 4, -1, C.catD); v.set(7, 4, -1, C.catD);
  for (const z of [-4, 3]) v.set(-8, 1, z, C.catW);
  // whiskers (barbels): long from the lips, short from the chin and nose
  for (let k = 0; k < 7; k++) { v.set(-11 + k, -1 - Math.round(k * 0.4), 4 + Math.round(k * 0.3), C.catW); v.set(-11 + k, -1 - Math.round(k * 0.4), -5 - Math.round(k * 0.3), C.catW); }
  for (let k = 0; k < 3; k++) { v.set(-9 + k, -4 - k, 1, C.catW); v.set(-9 + k, -4 - k, -2, C.catW); v.set(-10, 2 + k, 1 - k, C.catW); }
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel(false)), earR: buildGeo(mirrorX(earModel(true))), hat: buildGeo(hatModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]), bandage: buildGeo(bandageModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0, 0, 0]),
    tail: buildGeo(tailSegModel(2.8, 2.5, 3, false), [0, 0, 0]), tail2: buildGeo(tailSegModel(2.5, 2.0, 3, false), [0, 0, 0]), tail3: buildGeo(tailSegModel(2.0, 1.0, 4, true), [0, 0, 0]),
    reed: buildGeo(reedModel(), [0, 0, 0], FV), cat: buildGeo(catfishModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.paw, C.pawD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.paw, C.pawD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 18, eyes: [{ x: 10.4, y: 8.8 }, { x: 29.6, y: 8.8 }], rx: 4.0, ry: 4.3, style: 'bead', lash: false,
  blush: [{ x: 4, y: 16 }, { x: 36, y: 16 }], blushW: 3,
  mw: 46, mh: 12, mx: 23, my: 1, mstyle: 'deer', mHalf: 4,
  pal: { i: '#2a1810', I: '#6a4428', b: '#e4dccc', q: '#f2ece2', Q: '#c8bcaa' },
};
/** Grey whiskers, longer and droopier than Otis's. */
function whiskers(P, st, cfg) {
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++)
      for (let i = 0; i <= 13; i++) {
        const x = cfg.mx + s * (7 + i) - (s < 0 ? 1 : 0), y = 2 + k * 1.8 + (k * 0.5 + 0.2) * i * 0.32;
        P.set(x, y, i > 10 ? 'Q' : 'q');
      }
}
/** Bushy grey brows that read the mood (drawn over the eyes). */
function brows(P, st, cfg) {
  const b = st.ownBrows;
  cfg.eyes.forEach((e, i) => {
    const s = i === 0 ? -1 : 1;
    const lift = b === 'raised' ? -2 : b === 'up' ? -1 : 0;
    const tilt = b === 'angry' ? 1 : b === 'worried' ? -1 : b === 'flat' ? 0.4 : 0;
    for (let k = -4; k <= 4; k++) {
      const x = e.x + k, y = e.y - 5 + lift + Math.round((k * s) * tilt * 0.35) + (abs(k) === 4 ? 1 : 0);
      P.set(x, y, 'b'); P.set(x, y - 1, (k + 10) % 3 ? 'b' : null);
      if (abs(k) < 3 && (k & 1)) P.set(x, y - 2, 'b');
    }
  });
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'half', brows: null, mouth: 'cheeky', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'half', brows: 'up', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: 'flat', mouth: 'smile', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 1, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  content: { eyes: 'happy', brows: null, mouth: 'cheeky', blush: 1, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
export class NoodlesOtter extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('NoodlesOtter', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('tail2', this.tail, 0, 0, -3); this.mesh(G.tail2, this.tail2);
    this.joint('tail3', this.tail2, 0, 0, -3); this.mesh(G.tail3, this.tail3);
    this.joint('hat', this.head, 0.3, 7.7, -0.6);
    const hatTilt = new THREE.Group(); hatTilt.rotation.set(-0.16, 0.2, -0.08); this.hat.add(hatTilt);
    this.mesh(G.hat, hatTilt);
    this.mesh(G.bandage, this.foreL, { y: -0.6 * VS });
    this.face = new NpcFace(FACE, { mouth: whiskers, eyes: brows, ownBrows: true });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 8.4 - FACE.h / 8, 4.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 3.0 - FACE.mh / 8, 5.8);
    // the reed toothpick: a joint at the mouth that slides between the corners
    this.joint('pick', this.head, -1.2, MOUTH_Y, MOUTH_Z);
    this.reed = this.mesh(G.reed, this.pick, { shadow: false });
    this.reed.rotation.set(0.1, -0.5, 0);
    // the catfish (clamped on the left paw in 'noodle')
    this.cat = this.mesh(G.cat, this.gripL);
    this.cat.visible = false;
    // sprites
    this.ripples = [0, 1].map(() => { const s = new THREE.Sprite(spriteMatPal(RIPPLE_ROWS, RIPPLE_PAL)); s.visible = false; this.space.add(s); return s; });
    this.drops = [0, 1, 2, 3].map(() => this.sprite(DROPLET_ROWS, 0.045, this.space));
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.bang = this.sprite(BANG_ROWS, 0.09, this.space);
    for (const n of ['pickX', 'cat', 'flop', 'ripple', 'splash', 'notes', 'spark', 'bang']) this.scalar(n, 0);
    this.scalar('pickX', -1.2);
    this.jiggle('hat', 'rx', { k: 190, c: 9, az: -0.6, ay: 0.25, max: 0.3, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 190, c: 9, ax: 0.6, max: 0.25, probe: 'head' });
    this.jiggle('earL', 'rz', { k: 200, c: 9, ay: -0.5, max: 0.4, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 200, c: 9, ay: 0.5, max: 0.4, probe: 'head' });
    this.jiggle('chest', 's', { k: 200, c: 8, ay: 0.06, max: 0.08, probe: 'hips' }); // belly wobble
    this.jiggle('tail', 'ry', { k: 70, c: 5, ax: 1.2, yaw: 0.08, max: 0.6, probe: 'hips' });
    this.jiggle('tail2', 'ry', { k: 60, c: 4.5, ax: 1.2, yaw: 0.08, max: 0.6, probe: 'tail' });
    this.jiggle('tail3', 'ry', { k: 50, c: 4, ax: 1.2, max: 0.6, probe: 'tail2' });
    this.jiggle('pick', 'rx', { k: 160, c: 6, ay: 0.4, az: 0.3, max: 0.5, probe: 'head' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  /** Mouth corner in root space (for bubbles / splashes). */
  mouthPos(out = new THREE.Vector3()) {
    this.headFx.updateWorldMatrix(true, false);
    out.set(0, MOUTH_Y * VS, (MOUTH_Z + 1) * VS); this.headFx.localToWorld(out);
    return this.space.worldToLocal(out);
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    this.pick.position.x = k.pickX * VS;
    this.reed.rotation.y = -0.5 * Math.sign(k.pickX || -1) - 0.1;
    // the catfish: clamped on the paw, flopping
    this.cat.visible = k.cat > 0.5;
    if (this.cat.visible) {
      const fl = k.flop * sin(tz * 22);
      orientIn(this.cat, this.chest, [0, -1, 0.15], [1, 0, 0.2 * fl], 1);
      this.cat.rotateZ(PI / 2 + fl * 0.3);
      this.cat.position.set(0.02, -0.02, 0.14);
    }
    // where his paw goes in (root space): just in front of his knee
    this.handFx = this.handFx || new THREE.Vector3();
    _w.set(0, 0, 0); this.gripL.localToWorld(_w); this.space.worldToLocal(_w);
    const wx = _w.x, wz = _w.z;
    const rp = k.ripple;
    this.ripples.forEach((s, i) => {
      const u = (tz * 0.9 + i * 0.5) % 1;
      s.visible = rp > 0.5;
      s.position.set(wx, 0.02, wz);
      s.scale.set(0.1 + u * 0.2, (0.1 + u * 0.2) * 0.55, 1);
    });
    const sp = clamp(k.splash, 0, 1);
    this.drops.forEach((s, i) => {
      s.visible = sp > 0.02 && sp < 0.98;
      const a = i * 1.7 + 0.4;
      s.position.set(wx + cos(a) * sp * 0.2, 0.05 + sin(sp * PI) * 0.26 * (1 + (i & 1) * 0.4), wz + sin(a) * sp * 0.12);
    });
    this.headFx.updateWorldMatrix(true, false);
    _w2.set(0, 5 * VS, 4 * VS); this.headFx.localToWorld(_w2); this.space.worldToLocal(_w2);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w2.x + 0.16 + u * 0.12 + sin(u * 8 + i) * 0.03, _w2.y + 0.1 + u * 0.3, _w2.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const spk = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = spk > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w2.x + cos(a) * 0.38, _w2.y + 0.14 + sin(a * 1.3) * 0.12, _w2.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(spk, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.bang.visible = k.bang > 0.05;
    this.bang.position.set(_w2.x + 0.08, _w2.y + 0.4 + k.bang * 0.05, _w2.z - 0.05);
    this.bang.scale.setScalar(0.1 * clamp(k.bang * 1.4, 0, 1));
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Heavy, easy stance: belly out, weight back, tail flat on the ground behind. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.45, 0.6, 0.4, 0.1);
  p.chest.rx -= 0.06; p.head.rx += 0.04;
  tailPose(p, t, amt);
}
function tailPose(p, t, amt = 1) {
  const sw = sin(t * 1.1);
  p.tail.rx = -0.8; p.tail2.rx = 0.5; p.tail3.rx = 0.3;
  p.tail.ry = -0.4 + sw * 0.1 * amt; p.tail2.ry = -0.45 + sin(t * 1.1 - 0.7) * 0.18 * amt; p.tail3.ry = -0.35 + sin(t * 1.1 - 1.4) * 0.28 * amt;
}
/** Thumbs hooked under the suspenders. */
function thumbs(p, rig, side, w = 1) {
  rig.reach(p, side, 3.3, 5.0, 4.6, [1, 0, -0.6], w);
  if (w > 0.5) {
    if (side > 0) { p.handL = 'thumb'; p.wristL.rx = 1.1; p.wristL.rz = 0.3; } else { p.handR = 'thumb'; p.wristR.rx = 1.1; p.wristR.rz = 0.3; }
  }
}
function pickTo(p, x) { p.k.pickX = x; }

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.7);
    p.hips.x += sway * 0.25; p.head.rz = sin(t * 0.7 + 0.6) * 0.05;
    const T = t % 14;
    thumbs(p, rig, 1); thumbs(p, rig, -1);
    pickTo(p, -1.2 + pulse(T, 4.0, 1.4) * 2.4);
    // squints out over the water
    const look = win(T, 1.5, 3.8, 0.6, 0.6);
    p.head.ry += look * 0.35; p.head.rx -= look * 0.06;
    if (look > 0.5) { f.eyes = 'sleepy'; f.look = [0.6, 0]; }
    // scratches his belly through the bib, slow
    const scr = win(T, 6.4, 8.4, 0.35, 0.35);
    if (scr > 0) {
      rig.reach(p, 1, lerp(3.3, 2.0, scr), lerp(5.0, 2.0 + sin(t * 9) * 0.6, scr), lerp(4.6, 6.0, scr), [1, -0.3, -0.6], scr);
      p.handL = 'relax'; f.eyes = scr > 0.5 ? 'happy' : null;
    }
    // a low hum, belly bobbing
    const hum = win(T, 10.0, 12.6, 0.3, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.chest.y += hum * abs(sin(t * 3)) * 0.3;
    p.tail3.ry += hum * sin(t * 5) * 0.4;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = 'chew1'; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a heavy, rolling amble
    const P = 0.95, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.42);
    p.hips.y = -0.6 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.1; p.chest.rz = -cs * 0.08; p.hips.ry = -sn * 0.12;
    p.chest.rx = 0.06; p.head.rx = -0.06; p.head.rz = cs * 0.05;
    p.armL.rx = sn * 0.5; p.armR.rx = -sn * 0.5; p.armL.rz = 0.22; p.armR.rz = -0.22;
    p.foreL.rx = p.foreR.rx = -0.5; p.handL = p.handR = 'relax';
    tailPose(p, t, 0.4);
    p.tail.ry += -sn * 0.25; p.tail2.ry += -sin(ph - 0.8) * 0.3; p.tail3.ry += -sin(ph - 1.6) * 0.35;
    pickTo(p, -1.2);
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, dur: 2.4, expr: 'content',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    thumbs(p, rig, -1);
    // a lazy two-finger salute off the hat brim, then a slow wave
    const T = t % 2.4;
    const sal = win(T, 0.05, 0.9, 0.2, 0.25);
    const wv = sin(t * 5);
    const hb = rig.headPoint(p, 7.4, 4.0, _c);
    rig.reach(p, 1, lerp(7.6, 3.8, sal), lerp(9.6 + wv * 0.6, hb[0], sal), lerp(2.6, hb[1], sal), [1, -0.6, 0.2]);
    p.handL = sal > 0.5 ? 'point' : 'open'; p.wristL.rz = sal > 0.5 ? 0.2 : wv * 0.4 - 0.2; p.wristL.rx = -0.3;
    p.head.rz += -0.08; p.chest.rz += 0.05;
    f.mouth = 'grin';
    pickTo(p, 1.2);
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 5.2, open: 'open', mid: 'cheeky', shut: 'cheeky', o: 'grin', phrase: 3.6, pause: 0.7 });
    thumbs(p, rig, -1);
    // slow, story-teller gestures: a flat paw "easy now", a point out at the lake, a shrug
    const T = t % 7.5;
    const easy = win(T, 0.3, 2.2, 0.4, 0.4), point = win(T, 2.8, 4.6, 0.3, 0.4), shrug = win(T, 5.2, 7.0, 0.3, 0.4);
    let x = 3.3, y = 5.0, z = 4.6;
    x = lerp(x, 5.2, easy); y = lerp(y, 3.2 + sin(t * 2.5) * 0.4, easy); z = lerp(z, 7.2, easy);
    x = lerp(x, 9.0, point); y = lerp(y, 6.6, point); z = lerp(z, 4.8, point);
    x = lerp(x, 7.6, shrug); y = lerp(y, 3.6, shrug); z = lerp(z, 4.4, shrug);
    rig.reach(p, 1, x, y, z, [1, -0.5, -0.3]);
    p.handL = point > 0.5 ? 'point' : easy > 0.4 || shrug > 0.4 ? 'open' : 'thumb';
    p.wristL.rx = easy * 0.9 - shrug * 0.4; p.wristL.rz = shrug * 0.6;
    p.chest.ry = point * 0.18; p.head.ry = point * 0.3;
    p.chest.y += shrug * 0.5; p.head.rz += shrug * 0.12;
    p.head.rx += on ? sin(t * 5.2) * 0.04 : 0;
    if (point > 0.5) f.look = [0.8, 0];
    pickTo(p, on ? 1.4 : -1.2);
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // a slow, deep "huh-huh-huh": both paws on the belly, the belly bouncing
    const ha = sin(t * 9);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.45 + abs(ha) * 0.35, 0.6, 0.4, 0.1);
    rig.reach(p, 1, 2.6, 2.0 + ha * 0.3, 6.6, [0.9, -0.4, -0.6]);
    rig.reach(p, -1, 2.6, 2.0 - ha * 0.3, 6.6, [0.9, -0.4, -0.6]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.7;
    p.chest.rx += -0.18 + ha * 0.04; p.head.rx += -0.26 + ha * 0.05;
    p.chest.s = 1 + abs(ha) * 0.05; p.mover.y += abs(ha) * 0.2;
    p.tail.rx += max(0, sin(t * 4.5)) * 0.3;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
    pickTo(p, 1.2);
    if (beat(s, 'c', t, 1.4, 0.2)) rig._emit('chuckle');
  },
});

const HAPPY = 2.0;
def('happy', {
  dur: HAPPY, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY);
    // a heavy little hop and a fist pump
    const jump = K(t, [[0, 0], [0.25, -1.2, 'out'], [0.38, 0], [0.62, 2.8, 'out'], [0.88, 0, 'in'], [1.0, -0.9, 'out'], [1.2, 0]]);
    const up = win(t, 0.3, 1.6, 0.12, 0.35);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.3; p.shinL.rx = p.shinR.rx = 0.6; }
    else rig.stance(p, max(0, -jump) * 1.3 + 0.45, 0.6, 0.4, 0.1);
    p.hips.s = 1 + (jump < 0 ? jump * 0.07 : 0.02);
    const pump = sin(t * 14) * 0.6 * up;
    rig.reach(p, 1, lerp(3.3, 5.6, up), lerp(5.0, 10.6, up) + pump, lerp(4.6, 2.8, up), [1, -0.6, -0.4]);
    p.handL = 'fist';
    thumbs(p, rig, -1);
    p.chest.rx -= up * 0.1; p.head.rx -= up * 0.12;
    p.tail3.ry += sin(t * 12) * 0.5 * up;
    p.k.spark = clamp((t - 0.5) / 1.2, 0, 1) * (t < 1.75 ? 1 : 0);
    f.mouth = up > 0.3 ? 'open' : 'grin';
    pickTo(p, 1.2);
  },
});

// THE NOODLE: kneel at the edge, arm in, feel around, BITE!, wrestle, yank up the catfish
const NO = { dur: 7.2, kneel: 0.7, in: 1.5, bite: 3.5, yank: 4.6, show: 5.0, toss: 6.4 };
def('noodle', {
  dur: NO.dur, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, NO.dur);
    rig.life(t, p, 0.4);
    tailPose(p, t, 0.6);
    const kneel = K(t, [[0.1, 0], [NO.kneel, 1, 'io'], [NO.yank, 1], [NO.show, 0.25, 'out'], [NO.dur - 0.5, 0.25], [NO.dur, 0, 'io']]);
    const lean = K(t, [[0.4, 0], [NO.in, 1, 'io'], [NO.bite, 1], [NO.bite + 0.15, 0.7, 'out'], [NO.yank - 0.1, 0.95], [NO.yank + 0.2, -0.2, 'out'], [NO.show + 0.4, 0, 'io']]);
    // body: down on the right knee, the left knee up, leaning out over the water
    p.hips.y -= kneel * 3.4;
    p.hips.rx += lean * 0.5;
    p.chest.rx += lean * 0.55;
    p.head.rx -= lean * 0.45;
    if (kneel > 0.05) {
      rig.legTo(p, 1, -p.mover.y, 3.2 * kneel + 0.6);
      rig.legTo(p, -1, -p.mover.y, -1.6 * kneel + 0.4);
      p.shinR.rx += kneel * 0.6;
    } else rig.stance(p, 0.45, 0.6, 0.4, 0.1);
    // the struggle: everything shakes between the bite and the yank
    const fight = win(t, NO.bite, NO.yank, 0.05, 0.1);
    const shake = sin(t * 31) * fight;
    p.chest.rz += shake * 0.12; p.hips.x += shake * 0.4; p.head.rz -= shake * 0.1;
    p.mover.z -= fight * (0.5 + sin(t * 7) * 0.4);
    // left arm: down into the water (below the dock edge) feeling about, then up with the fish
    const arm = win(t, NO.in - 0.6, NO.yank, 0.5, 0.05);
    const feel = sin(t * 3.4) * 0.8 * win(t, NO.in, NO.bite, 0.2, 0.05);
    const show = win(t, NO.yank, NO.toss, 0.05, 0.3);
    const c = rig.toChest(p, -3.0, 6.0, _c);
    let x = 3.3, y = 5.0, z = 4.6;
    x = lerp(x, 3.0 + feel, arm); y = lerp(y, c[0] + abs(feel) * 0.4 + fight * sin(t * 25) * 0.8, arm); z = lerp(z, c[1] + feel * 0.6, arm);
    x = lerp(x, 6.0, show); y = lerp(y, 11.2 + sin(t * 4) * 0.3, show); z = lerp(z, 3.4, show);
    rig.reach(p, 1, x, y, z, [1, -0.4, -0.6]);
    p.handL = arm > 0.5 && t < NO.bite ? 'open' : 'fist';
    // right paw: braced on his knee, then a proud thumbs-up
    const thumb = win(t, NO.show + 0.2, NO.toss, 0.2, 0.3);
    rig.reach(p, -1, lerp(4.4, 7.4, thumb), lerp(0.4 + kneel * 1.0, 6.0, thumb), lerp(4.8, 3.8, thumb), [1, 0.1, -0.8]);
    p.handR = thumb > 0.4 ? 'thumb' : 'open'; p.wristR.rx = 0.6 * (1 - thumb);
    // the catfish rides the paw from the yank until he tosses it back
    p.k.cat = t > NO.yank - 0.05 && t < NO.toss + 0.25 ? 1 : 0;
    p.k.flop = t > NO.yank && t < NO.toss ? 0.6 + 0.4 * max(0, sin(t * 4)) : 0;
    p.k.ripple = t > NO.in - 0.2 && t < NO.yank + 0.6 ? 1 : 0;
    p.k.splash = max(K(t, [[NO.in - 0.3, 0], [NO.in + 0.35, 1, 'out']]) * (t < NO.in + 0.4 ? 1 : 0), K(t, [[NO.yank - 0.05, 0], [NO.yank + 0.5, 1, 'out']]) * (t > NO.yank - 0.05 && t < NO.yank + 0.55 ? 1 : 0));
    p.k.bang = t > NO.bite && t < NO.bite + 0.7 ? 1 - smooth((t - NO.bite - 0.45) / 0.25) : 0;
    p.k.spark = show > 0.5 ? clamp((t - NO.show) / 1.2, 0, 1) : 0;
    // face: concentration, the bite, the grin
    pickTo(p, t < NO.bite ? -1.2 : 1.2);
    f.look = [0, 0.9 * arm * (1 - show)];
    if (t > NO.in && t < NO.bite) { f.expr = 'focused'; f.mouth = 'flat'; }
    if (t >= NO.bite && t < NO.bite + 0.6) { f.expr = 'surprised'; }
    if (t >= NO.bite + 0.6 && t < NO.yank) { f.expr = 'focused'; f.mouth = 'yell'; }
    if (show > 0.4) { f.expr = 'proud'; f.mouth = sin(t * 5) > 0 ? 'open' : 'grin'; f.look = [0.6, -0.6]; }
    if (beat(s, 'sp', t, 99, NO.in)) rig._emit('splash');
    if (beat(s, 'bi', t, 99, NO.bite)) rig._emit('bite');
    if (beat(s, 'ya', t, 99, NO.yank)) rig._emit('yank');
    if (p.k.flop > 0.5 && beat(s, 'fl', t, 0.45, 0.1)) rig._emit('flop');
  },
});

const TT = 6.0;
def('tall_tale', {
  dur: TT, expr: 'talk', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, TT);
    stand(p, rig, t, 0.5);
    talkMouth(t, f, { rate: 5.5, open: 'open', mid: 'grin', shut: 'cheeky' });
    // "this big"... "no, THIS big"... "THIS BIG": the paws go wider each time, he leans back
    const w = K(t, [[0.3, 0], [0.9, 1, 'out'], [2.0, 1], [2.4, 1.6, 'out'], [3.4, 1.6], [3.8, 2.4, 'back'], [5.2, 2.4], [5.8, 0, 'io']]);
    const span = 3.3 + w * 2.6;
    for (const side of [1, -1]) rig.reach(p, side, span, 5.0 + w * 1.2, 4.6 - w * 0.4, [1, -0.5, -0.4]);
    p.handL = p.handR = w > 0.3 ? 'open' : 'thumb';
    p.wristL.rz = p.wristR.rz = -0.4 * smooth(w);
    p.chest.rx -= w * 0.08; p.head.rx -= w * 0.1;
    p.mover.y += w > 2 ? abs(sin(t * 8)) * 0.3 : 0;
    if (w > 2) { f.eyes = 'wide'; f.brows = 'raised'; }
    pickTo(p, 1.4);
  },
});

const TP = 3.6;
def('toothpick', {
  dur: TP, expr: 'smug', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, TP);
    stand(p, rig, t, 0.5);
    thumbs(p, rig, 1); thumbs(p, rig, -1);
    // the reed rolls slowly from one corner to the other and back with a flick
    pickTo(p, K(t, [[0.2, -1.2], [1.2, 1.4, 'io'], [2.2, 1.4], [2.5, -1.2, 'out']]));
    p.head.rz += K(t, [[0, 0], [1.2, 0.12, 'io'], [2.2, 0.12], [2.6, -0.04, 'out'], [3.4, 0]]);
    p.head.rx -= 0.05;
    f.eyes = 'half'; f.brows = 'flat';
    f.look = [K(t, [[0.2, -0.5], [1.2, 0.6, 'io']]), 0.2];
    if (t > 2.2 && t < 2.8) f.mouth = 'grin';
  },
});

const SA = 4.2;
def('stretch_arms', {
  dur: SA, expr: 'content', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SA);
    stand(p, rig, t, 0.4);
    // paws laced out in front, a big push, knuckles crack, a shoulder roll each side
    const push = win(t, 0.3, 2.0, 0.4, 0.3);
    const roll = win(t, 2.2, 3.8, 0.2, 0.3);
    for (const side of [1, -1]) rig.reach(p, side, lerp(3.3, 0.8, push), lerp(5.0, 5.4, push), lerp(4.6, 10.6, push), [1, -0.2, -0.6]);
    p.handL = p.handR = push > 0.5 ? 'fist' : 'thumb';
    if (push < 0.5) { thumbs(p, rig, 1); thumbs(p, rig, -1); }
    p.chest.rx += push * 0.12; p.head.rx -= push * 0.05;
    const r = sin((t - 2.2) * 6) * roll;
    p.chest.rz += r * 0.15; p.armL.rz += max(0, r) * 0.4; p.armR.rz -= max(0, -r) * 0.4; p.chest.y += abs(r) * 0.4;
    if (push > 0.8) { f.eyes = 'shut'; f.mouth = 'o'; }
    if (beat(s, 'cr', t, 99, 1.4)) rig._emit('crack');
    pickTo(p, -1.2);
  },
});

export { ANIMS as NOODLES_ANIMS };
