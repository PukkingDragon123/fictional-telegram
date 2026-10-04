// FrogGranny: "Granny Ribbit", the swamp's bug expert. A round green frog
// grandma: big kind eyes behind round gold spectacles, a lilac knitted shawl,
// a straw sunhat with a daisy, a rose polka-dot dress, an apron with a bug jar
// in the pocket and a wooden cane that stays planted on the ground.
//
//   const g = new FrogGranny();  scene.add(g.root);
//   const chair = makeRockingChair();  chair.position.copy(g.root.position);  chair.rotation.y = g.root.rotation.y;
//   g.useChair(chair);  g.play('sit_knit');       // rocks the chair with her (same root transform)
//   g.play('tongue_catch');                        // zaps a fly, gulp, pats her tummy
//   g.onEvent = (name) => {};   // 'step' | 'hop' | 'land' | 'click' (needles) | 'zap' | 'gulp' | 'pat' | 'tap' (cane) | 'ribbit'
//
// Anims: idle wave talk laugh walk hop_walk happy sit_knit tongue_catch (+ stand: chair -> idle)
// Expressions: neutral happy talk surprised sleepy smug laugh knit (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.42 units/s, 'hop_walk' ~0.75 units/s (move the root; the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.18 tall to the eye bulges, ~1.24 with the hat.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, plantStick, rockChair, ROCKING_CHAIR_SEAT, ROCKING_CHAIR_R, NOTE_ROWS } from './npcProps.js';

const C = {
  skin: 0x6cb850, skinD: 0x58a040, skinL: 0x8ccc66, skinDD: 0x3e7a2e, spot: 0x4e9238,
  belly: 0xe8eaaa, bellyD: 0xd2d48e,
  dress: 0xe0828c, dressD: 0xc8667a, dressL: 0xf0a2aa, dot: 0xfff2ea,
  shawl: 0xb89ad8, shawlD: 0x9a7cc0, shawlL: 0xd0b8ee, fringe: 0xa486cc,
  apron: 0xfaf4e6, apronD: 0xe4dcc8, lace: 0xffffff,
  straw: 0xf0d27a, strawD: 0xd4ae52, strawL: 0xfae6a0, ribbon: 0xa070c8, ribbonD: 0x80509e,
  petal: 0xffffff, daisy: 0xffc020,
  gold: 0xe8c050, goldD: 0xb89030,
  cane: 0x8a5a30, caneD: 0x6a4020, caneL: 0xa8743e, tip: 0x3a2a26,
  glass: 0xc8ecf0, glassL: 0xf2feff, cork: 0xc89060, glow: 0xfff27a,
  tymp: 0x5aa444, tympD: 0x3e7a2e,
  needle: 0xe8c890, needleD: 0xc8a060, bead: 0xe04a7a, yarn: 0xb89ad8, yarnD: 0x9a7cc0, yarnL: 0xd8c4f4, knit: 0xf6c4d8, knitD: 0xe0a0bc,
  tongue: 0xff7a92, tongueD: 0xdc5270, tongueL: 0xffa8b8,
  fly: 0x2e3a30, flyL: 0x4a6450, flyEye: 0xd8403a, wing: 0xe8f4ff,
};

const D = {
  CHIBI: { body: 0.8, head: 1.25 }, // [v20 npc rigs] small body, big head (BipedRig)
  HIP_Y: 6, WAIST: 1, NECK: 6.9, NECK_Z: 0.4, SH: [5.0, 6.2, 0], L_UP: 3.2, L_FORE: 3.0, L_HAND: 2.0,
  THIGH: 3.2, SHIN: 3.2, LEG_X: 2.4, EAR: [6.4, 2.9, -1.2], TAIL: [1.6, -5.6],
};
const CANE_L = 15 * FV; // grip -> tip (world units)
const HAT_TILT = -0.2;

// ------------------------------------------------------------------ models
const dressCol = (x, y, z) => ((x * 3 + y * 5 + z * 7) % 19 === 0 ? C.dot : tone(x, y, z, C.dress, C.dressD, C.dressL, 0.12, 0.08));
const knitCol = (x, y, z) => ((x + y + 40) % 2 === 0 ? (y % 2 ? C.shawl : C.shawlL) : tone(x, y, z, C.shawl, C.shawlD, C.shawl, 0.3, 0));
const skinCol = (x, y, z) => tone(x, y, z, C.skin, C.skinD, C.skinL);

function surfZ(v, x, y, front) {
  if (front) { for (let z = 12; z >= -12; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -12; z <= 12; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  // flared skirt, hem lace
  for (let y = -4; y <= 1; y++) {
    const r = lerp(6.7, 5.4, (y + 4) / 5), rz = r * 0.92;
    for (let x = -7; x <= 6; x++)
      for (let z = -7; z <= 6; z++) {
        const dx = (x + 0.5) / r, dz = (z + 0.5 + 0.2) / rz;
        if (dx * dx + dz * dz > 1) continue;
        v.set(x, y, z, y === -4 ? ((x + z) % 2 ? C.lace : C.dressD) : dressCol(x, y, z));
      }
  }
  // apron skirt: front panel, frilly hem, pocket with the bug jar
  for (let x = -4; x <= 3; x++)
    for (let y = -4; y <= 1; y++) {
      const z = surfZ(v, x, y, true);
      if (z === null) continue;
      v.set(x, y, z + 1, y === -4 ? ((x + 4) % 2 ? C.lace : C.apronD) : tone(x, y, z, C.apron, C.apronD, C.apron, 0.1, 0));
    }
  for (let x = 0; x <= 3; x++) for (let y = -3; y <= -1; y++) { const z = surfZ(v, x, y, true); v.set(x, y, z + 1, y === -1 || x === 0 || x === 3 ? C.apronD : C.apron); }
  // bug jar peeking out of the pocket (glass, cork, a glowing firefly)
  for (let x = 1; x <= 2; x++)
    for (let y = -1; y <= 1; y++) {
      const z = surfZ(v, x, -2, true);
      v.set(x, y, z, x === 1 && y === 0 ? C.glassL : C.glass);
      if (y === 0 && x === 2) v.set(x, y, z, C.glow);
    }
  { const z = surfZ(v, 1, 1, true); v.set(1, 2, z - 1, C.cork); v.set(2, 2, z - 1, C.cork); }
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  ell(v, 0, 2.4, -0.2, 6.1, 5.6, 5.1, (x, y, z) => (y < -1 ? null : dressCol(x, y, z)));
  // shawl: a thicker knitted layer over the shoulders, a point down the back, a V + knot in front
  const inShawl = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z < -1) return y >= 0.6 + fx * 0.95;
    return y >= 6.4 - (5.6 - min(fx, 5.6)) * 0.36;
  };
  ell(v, 0, 2.4, -0.2, 6.8, 6.2, 5.8, (x, y, z) => (y >= -1 && inShawl(x, y, z) ? knitCol(x, y, z) : null));
  // apron bib (front, under the shawl) + apron strings around the waist
  for (let x = -3; x <= 2; x++)
    for (let y = 0; y <= 4; y++) {
      const z = surfZ(v, x, y, true);
      if (z !== null && !inShawl(x, y, z)) v.set(x, y, z, x === -3 || x === 2 ? C.apronD : C.apron);
    }
  for (let x = -7; x <= 6; x++) {
    const zf = surfZ(v, x, 0, true), zb = surfZ(v, x, 0, false);
    if (zf !== null) v.set(x, 0, zf, C.apronD);
    if (zb !== null) v.set(x, 0, zb, C.apron);
  }
  // shawl knot + tails + fringe
  for (const [x, y] of [[-1, 4], [0, 4], [-1, 5], [0, 5]]) { const z = surfZ(v, x, y, true); v.set(x, y, z + 1, (x + y) % 2 ? C.shawlD : C.shawl); }
  for (let y = 1; y <= 3; y++) {
    const zl = surfZ(v, -2, y, true), zr = surfZ(v, 1, y, true);
    v.set(-2 - (y < 2 ? 1 : 0), y, zl + 1, knitCol(-2, y, 0)); v.set(1 + (y < 2 ? 1 : 0), y, zr + 1, knitCol(1, y, 1));
  }
  for (const x of [-3, -2, 1, 2]) { const z = surfZ(v, x, 1, true); v.set(x, 0, z, C.fringe); }
  for (let x = -6; x <= 5; x += 2) {
    const yb = Math.ceil(0.6 + abs(x + 0.5) * 0.95) - 1;
    const z = surfZ(v, x, yb + 1, false);
    if (z !== null && yb >= -1) { v.set(x, yb, z, C.fringe); v.set(x, yb - 1, z, C.shawlD); }
  }
  // neck (fills the gap under the chin)
  rbox(v, -3, 2, 6, 9, -2, 2, 1.2, (x, y, z) => (z >= 1 ? C.belly : C.skin));
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (y <= 2 && z >= 0) return tone(x, y, z, C.belly, C.bellyD, C.belly, 0.08, 0);
    if (y >= 5 && z <= -1 && (x * 7 + y * 3 + z * 5) % 9 === 0) return C.spot;
    return skinCol(x, y, z);
  };
  rbox(v, -7, 6, 0, 5, -5, 4, 3.2, col);
  ell(v, 0, 1.6, 1.2, 6.2, 2.4, 4.4, col); // round jowls
  // eye bulges
  for (const s of [-1, 1]) ell(v, s * 3.6, 5.5, 2.2, 3.0, 3.0, 2.8, (x, y, z) => (y >= 7 && z <= 3 ? C.skinL : skinCol(x, y, z)));
  // nostrils
  v.set(-2, 4, 5, C.skinDD); v.set(1, 4, 5, C.skinDD);
  // spectacle temples running back to the ears
  for (const x of [-8, 7]) for (let z = -1; z <= 2; z++) v.set(x, 5, z, z === 2 ? C.gold : C.goldD);
  return v;
}
function tympModel() {
  const v = new VoxelModel();
  for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (abs(y) + abs(z) < 2) v.set(0, y, z, y === 0 && z === 0 ? C.tymp : C.tympD);
  return v;
}
function throatModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.7, 1.8, 2.3, (x, y, z) => tone(x, y, z, C.belly, C.bellyD, 0xf8f8c8, 0.1, 0.15));
  return v;
}
function hatModel() {
  const v = new VoxelModel();
  // wavy straw brim
  for (let x = -7; x <= 6; x++)
    for (let z = -7; z <= 6; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5), a = Math.atan2(z + 0.5, x + 0.5);
      if (r > 6.9) continue;
      const droop = r > 5.2 && sin(a * 4) > 0.3 ? -1 : 0;
      v.set(x, droop, z, r > 6 ? C.strawD : (x + z) % 2 ? C.straw : C.strawL);
    }
  // crown (reaches down below the brim to sit on the head)
  for (let y = -3; y <= 3; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = y === 3 ? 2.9 : y < 0 ? 3.2 : 3.6;
        if (r > R || (y === 0 && r < R - 1)) continue;
        v.set(x, y, z, y === 1 ? (r > R - 1 ? C.ribbon : C.straw) : y < 0 ? C.strawD : (x + y) % 2 ? C.straw : C.strawL);
      }
  // ribbon bow tails at the back + daisy on the front-left of the band
  v.set(0, 1, -5, C.ribbonD); v.set(-1, 1, -5, C.ribbon); v.set(0, 0, -6, C.ribbon); v.set(-1, -1, -6, C.ribbonD);
  const dx = 2, dz = 3;
  for (const [a, b] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) v.set(dx + a, 1 + b, dz + 1, C.petal);
  v.set(dx, 1, dz + 1, C.daisy); v.set(dx, 1, dz + 2, C.daisy);
  v.set(dx + 1, 1, dz, C.ribbonD);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => tone(x, y, z, C.skin, C.skinD, C.skinL));
  ell(v, 0.5, -0.6, 0.5, 2.0, 1.5, 2.0, (x, y, z) => (y >= 0 ? knitCol(x, y, z) : y === -2 ? C.dressD : dressCol(x, y, z)));
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => tone(x, y, z, C.skin, C.skinD, C.skinL));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, skinCol);
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 1, 0, -1, 1, 1.1, skinCol);
  // big webbed feet with three round toe pads
  const y = -D.SHIN;
  for (let x = -2; x <= 2; x++) for (let z = -1; z <= 3; z++) v.set(x, y, z, z === 3 && (x === -1 || x === 1) ? null : tone(x, y, z, C.skinD, C.skinDD, C.skin, 0.15, 0.1));
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.set(x, y + 1, z, C.skinD);
  for (const x of [-2, 0, 2]) { v.set(x, y, 4, C.skinL); v.set(x, y + 1, 4, C.skinL); v.set(x, y, 3, C.skinD); }
  return v;
}
function bowModel() {
  // apron bow at the back (the "tail" joint)
  const v = new VoxelModel();
  for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) { v.set(s * k - (s < 0 ? 1 : 0), 0, 0, C.apron); v.set(s * k - (s < 0 ? 1 : 0), 1, 0, k === 2 ? C.apronD : C.apron); }
  v.set(-1, 0, 0, C.apronD); v.set(0, 0, 0, C.apronD);
  for (let y = -1; y >= -3; y--) { v.set(-1, y, 0, C.apron); v.set(0, y - (y < -2 ? 0 : 1), 0, C.apronD); }
  return v;
}
function caneModel() {
  const v = new VoxelModel();
  const L = 15;
  for (let y = -L; y <= 1; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y <= -L + 1 ? C.tip : tone(x, y, z, C.cane, C.caneD, C.caneL, 0.15, 0.15));
  // crook curling forward over the fist
  for (let x = -1; x <= 0; x++) {
    for (let z = -1; z <= 3; z++) v.set(x, 2, z, z === 3 ? C.caneD : C.caneL);
    for (let z = -1; z <= 2; z++) v.set(x, 3, z, C.cane);
    v.set(x, 1, 3, C.cane); v.set(x, 0, 3, C.caneD); v.set(x, 1, 4, C.caneD);
  }
  return v;
}
function needleModel() {
  const v = new VoxelModel();
  for (let y = -2; y <= 9; y++) v.set(0, y, 0, y > 7 ? C.needleD : C.needle);
  v.set(0, -3, 0, C.bead); v.set(-1, -3, 0, C.bead); v.set(0, -3, -1, C.bead); v.set(-1, -3, -1, C.bead);
  return v;
}
function swatchModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 3; x++) for (let y = -7; y <= 0; y++) v.set(x, y, 0, y === 0 ? C.knitD : (floor2(y) % 2 ? C.knit : C.yarn));
  v.set(-3, -8, 0, C.knitD); v.set(0, -8, 0, C.knitD); v.set(3, -8, 0, C.knitD);
  return v;
}
const floor2 = (y) => Math.floor((y + 20) / 2);
function yarnModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 3.2, 3.0, 3.2, (x, y, z) => ((x + y * 2 + z) % 4 === 0 ? C.yarnD : (x - y + z) % 5 === 0 ? C.yarnL : C.yarn));
  return v;
}
function tongueModel() {
  const v = new VoxelModel();
  v.set(-1, 0, 0, C.tongue); v.set(0, 0, 0, C.tongueD);
  return v;
}
function tongueTipModel() {
  const v = new VoxelModel();
  ell(v, 0, 0.5, 0, 1.7, 1.4, 1.7, (x, y, z) => (y > 0 && x < 0 ? C.tongueL : C.tongue));
  return v;
}
function flyBodyModel() {
  const v = new VoxelModel();
  for (let z = -2; z <= 1; z++) for (let x = -1; x <= 0; x++) for (let y = 0; y <= 1; y++) v.set(x, y, z, z === 1 ? C.flyEye : (y === 1 && x === -1 ? C.flyL : C.fly));
  v.set(-1, 1, 1, C.flyEye); v.set(0, 1, 1, C.flyEye); v.set(-1, 0, 1, C.fly); v.set(0, 0, 1, C.fly);
  return v;
}
function flyWingModel() {
  const v = new VoxelModel();
  for (let x = 0; x <= 2; x++) for (let z = -2; z <= 0; z++) if (!(x === 2 && z === 0)) v.set(x, 0, z, C.wing);
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(tympModel()), earR: buildGeo(mirrorX(tympModel())), hat: buildGeo(hatModel()), throat: buildGeo(throatModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(bowModel(), [0, 0, 0]),
    cane: buildGeo(caneModel(), [0, 0, 0], FV), needle: buildGeo(needleModel(), [0.5, 0, 0.5], FV), swatch: buildGeo(swatchModel(), [0.5, 0, 0.5], FV),
    yarn: buildGeo(yarnModel(), [0, 0, 0], FV), tongue: buildGeo(tongueModel(), [0, 0.5, 0], FV), tongueTip: buildGeo(tongueTipModel(), [0, 0.5, 0], FV),
    flyBody: buildGeo(flyBodyModel(), [0, 0.5, 0.5], FV), flyWing: buildGeo(flyWingModel(), [0, 0.5, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.skin, C.skinDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.skin, C.skinDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 64, h: 26, eyes: [{ x: 17.5, y: 12 }, { x: 46.5, y: 12 }], rx: 4.8, ry: 5.4, style: 'bead', lash: true,
  blush: [{ x: 12, y: 21 }, { x: 52, y: 21 }], blushW: 3,
  mw: 48, mh: 12, mx: 24, my: 2, mstyle: 'frog', mHalf: 8,
  pal: { b: '#2e6a2a', i: '#4a3a1a', I: '#b09030', o: '#f0c850', O: '#b88a28', g: '#ffffff', G: '#d8f4ff' },
};
/** Round gold spectacles + glints, drawn over the eyes canvas. */
function drawSpecs(P, st, cfg) {
  const R = 6.4, Ry = 6.6;
  for (const e of cfg.eyes) {
    for (let y = Math.floor(e.y - Ry - 1); y <= e.y + Ry + 1; y++)
      for (let x = Math.floor(e.x - R - 1); x <= e.x + R + 1; x++) {
        const d = ((x + 0.5 - e.x) / R) ** 2 + ((y + 0.5 - e.y) / Ry) ** 2;
        if (d <= 1 && d > 0.72) P.set(x, y, y > e.y + 2 ? 'O' : 'o');
      }
    P.set(e.x - 4.4, e.y - 3.2, 'g'); P.set(e.x - 3.4, e.y - 4.2, 'g'); P.set(e.x - 4.4, e.y - 2.2, 'G');
  }
  const [a, b] = cfg.eyes;
  const mid = (a.x + b.x) / 2;
  for (let x = Math.ceil(a.x + R - 1); x <= b.x - R + 1; x++) P.set(x, a.y - 2 - (abs(x + 0.5 - mid) < 3 ? 1 : 0), 'o');
  for (let x = 0; x <= a.x - R + 0.5; x++) P.set(x, a.y - 1, 'o');
  for (let x = Math.ceil(b.x + R - 0.5); x < cfg.w; x++) P.set(x, b.y - 1, 'o');
}
/** No teeth on a frog: turn the default teeth row into mouth. */
function frogMouth(P) {
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) if (P.is(x, y, 'e')) P.set(x, y, 'M');
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
  knit: { eyes: 'half', brows: null, mouth: 'smile', blush: 1, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
export class FrogGranny extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('FrogGranny', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    // hat (tilted back on an inner group so the spring jiggle stays about the joint)
    this.joint('hat', this.head, 0, 7.6, -1.0);
    const hatTilt = new THREE.Group(); hatTilt.rotation.x = HAT_TILT; this.hat.add(hatTilt);
    this.mesh(G.hat, hatTilt);
    this.joint('throat', this.head, 0, 0.9, 2.6);
    this.throatMesh = this.mesh(G.throat, this.throat, { shadow: false });
    // face
    this.face = new NpcFace(FACE, { eyes: drawSpecs, mouth: frogMouth });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 8.5 - FACE.h / 8, 5.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 3.1 - FACE.mh / 8, 5.0);
    // cane (right hand), knitting (both hands), yarn ball (lap)
    this.cane = this.mesh(G.cane, this.gripR);
    this._caneRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0));
    this.needles = [this.mesh(G.needle, this.gripL), this.mesh(G.needle, this.gripR)];
    this.swatch = this.mesh(G.swatch, this.needles[0], { y: 7 * FV, z: 0.004 });
    this.yarn = this.mesh(G.yarn, this.hips, { x: 2.0 * VS, y: 1.6 * VS, z: 5.9 * VS });
    // tongue + fly
    this.tongue = new THREE.Group(); this.tongue.position.set(0, 2.6 * VS, 4.2 * VS); this.head.add(this.tongue);
    this.tongueMesh = this.mesh(G.tongue, this.tongue, { shadow: false });
    this.tongueTip = new THREE.Group(); this.tongue.add(this.tongueTip);
    this.mesh(G.tongueTip, this.tongueTip, { shadow: false });
    this.tongue.visible = false;
    this.fly = new THREE.Group(); this.space.add(this.fly); this.fly.visible = false;
    this.mesh(G.flyBody, this.fly, { shadow: false });
    this.wings = [1, -1].map((s) => { const m = this.mesh(G.flyWing, this.fly, { y: 2 * FV, shadow: false }); m.scale.x = s; return m; });
    this._flyP = new THREE.Vector3(0.6, 1, 0.4); this._flyCaught = false; this._tongueLen = 0.3;
    // sprites
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.space));
    // chair
    this.chair = null;
    this.seated = false;
    this.scalar('cane', 1); // 1 = planted, 0 = rigid in the hand
    this.scalar('caneLift', 0);
    this.scalar('caneLean', 0.35);
    this.scalar('caneSide', 0.25);
    this.scalar('croak', 0);
    this.scalar('rock', 0);
    this.scalar('zap', 0);
    this.scalar('notes', 0);
    this.scalar('spark', 0);
    this.scalar('hearts', 0);
    this.jiggle('hat', 'rx', { k: 200, c: 9, az: -0.014, ay: 0.008, max: 0.35, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 200, c: 9, ax: 0.014, max: 0.3, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.003, max: 0.07, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.003, max: 0.08, probe: 'chest' });
    this.jiggle('tail', 'rx', { k: 140, c: 6, ay: 0.03, az: -0.02, max: 0.6, probe: 'hips' });
    this.jiggle('tail', 'rz', { k: 140, c: 6, ax: 0.03, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  /** Let 'sit_knit' rock this makeRockingChair() (place it at the root, same yaw). null to detach. */
  useChair(chair) {
    if (this.chair && this.chair !== chair) rockChair(this.chair, 0);
    this.chair = chair || null;
    return this;
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k;
    // props
    this.cane.visible = !p.vis.knit;
    for (const n of this.needles) n.visible = !!p.vis.knit;
    this.swatch.visible = this.yarn.visible = !!p.vis.knit;
    if (this.cane.visible) {
      const side = -k.caneSide;
      plantStick(this.cane, this.space, CANE_L, [side, k.caneLean], clamp(k.cane, 0, 1), this._caneRest, k.caneLift);
    }
    if (p.vis.knit) {
      // needles cross in front of the chest, tips up and inward
      this._needle(this.needles[0], 1, this.time);
      this._needle(this.needles[1], -1, this.time);
    }
    this.throat.scale.setScalar(0.82 + k.croak * 0.75);
    if (this.chair) rockChair(this.chair, k.rock);
    this._postTongue(p);
    // sprites
    const tz = this.time;
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 4 * VS, 4 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w.x + 0.12 + u * 0.12 + sin(u * 8 + i) * 0.03, _w.y + 0.05 + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(cos(a) * 0.32, _w.y + 0.12 + sin(a * 1.3) * 0.12, sin(a) * 0.1 + 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i * 0.5) % 1;
      s.visible = k.hearts > 0.5;
      s.position.set((i ? 0.16 : -0.14) + sin(u * 6 + i) * 0.03, _w.y + 0.2 + u * 0.28, _w.z - 0.05);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 5));
    });
  }
  _needle(n, side, t) {
    // aim each needle up + across (root space), wobbling with the stitch
    const q = n.parent;
    q.updateWorldMatrix(true, false);
    _w.set(-side * 0.75, 0.75 + sin(t * 9 + side) * 0.1, 0.55).normalize();
    _w.applyQuaternion(this.root.getWorldQuaternion(_q1));
    _q2.setFromUnitVectors(_up, _w);
    q.getWorldQuaternion(_q1).invert();
    n.quaternion.copy(_q2.premultiply(_q1));
  }
  _postTongue(p) {
    const fly = this.fly, k = this.k;
    fly.visible = !!p.vis.fly;
    const zap = k.zap;
    this.tongue.visible = zap > 0.02;
    if (fly.visible) {
      const flap = sin(this.time * 70) * 0.7;
      this.wings[0].rotation.z = 0.5 + flap; this.wings[1].rotation.z = -0.5 - flap;
      if (!this._flyCaught) { fly.position.copy(this._flyP); fly.rotation.y = this._flyYaw || 0; }
    }
    if (!this.tongue.visible && !this._flyCaught) return;
    this.headFx.updateWorldMatrix(true, false);
    if (!this._flyCaught) {
      // aim at the fly (head space)
      this.space.updateWorldMatrix(true, false);
      _w.copy(this._flyP); this.space.localToWorld(_w); this.headFx.worldToLocal(_w);
      _w2.subVectors(_w, this.tongue.position);
      this._tongueLen = _w2.length();
      this.tongue.rotation.set(Math.atan2(-_w2.y, Math.hypot(_w2.x, _w2.z)), Math.atan2(_w2.x, _w2.z), 0, 'YXZ');
    }
    const len = max(0.001, zap * this._tongueLen);
    this.tongueMesh.scale.set(1, 1, len / FV);
    this.tongueTip.position.set(0, 0, len);
    if (this._flyCaught && fly.visible) {
      this.tongueTip.updateWorldMatrix(true, false);
      _w.setFromMatrixPosition(this.tongueTip.matrixWorld); this.space.worldToLocal(_w);
      fly.position.copy(_w);
    }
  }
}
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const SEAT_HIP = ROCKING_CHAIR_SEAT / VS / D.CHIBI.body + 2.0 - D.HIP_Y; // hips offset seated (voxels)

/** Standing granny: slight hunch, soft knees, feet planted. */
function stand(p, rig, t, { crouch = 0.35, amt = 1, zL = 0.6, zR = 0.4 } = {}) {
  rig.life(t, p, amt);
  p.chest.rx += 0.1; p.head.rx -= 0.12;
  rig.stance(p, crouch, zL, zR, 0.1);
}
/** Seated in the rocking chair: w = 0 standing .. 1 seated; legs dangle. */
function seat(p, rig, w, t = 0, kick = 0) {
  p.hips.y += SEAT_HIP * w;
  p.hips.z += -1.2 * w;
  p.hips.rx += -0.3 * w;
  p.chest.rx += 0.06 * w;
  p.head.rx += 0.18 * w;
  const sw = sin(t * 2.2) * kick;
  const yL = lerp(-p.mover.y, 2.3 + max(0, sw) * 0.7, w), zL = lerp(0.6, 3.0 + sw * 0.9, w);
  const yR = lerp(-p.mover.y, 2.3 + max(0, -sw) * 0.7, w), zR = lerp(0.4, 3.0 - sw * 0.9, w);
  rig.legTo(p, 1, yL, zL); rig.legTo(p, -1, yR, zR);
  p.thighL.rz = lerp(0.1, 0.16, w); p.thighR.rz = lerp(-0.1, -0.16, w);
}
/** Rock the mover like the chair (rolling on its rockers). */
function rock(p, a) {
  const R = ROCKING_CHAIR_R / VS;
  p.k.rock = a;
  p.mover.rx += a;
  p.mover.y += R - R * cos(a);
  p.mover.z += R * a - R * sin(a);
}
/** Right hand on the cane (planted). */
function caneHand(p, rig, dx = 0, dy = 0, dz = 0) {
  rig.reach(p, -1, 6.2 + dx, 2.4 + dy, 3.0 + dz, [0.7, -0.5, -1]);
  p.wristR.rx = 0.3;
  p.handR = 'fist';
}
/** Left paw resting on the tummy. */
function tummyHand(p, rig, dz = 0) {
  rig.reach(p, 1, 2.6, 1.6, 5.4 + dz, [0.9, -0.4, -0.6]);
  p.wristL.rx = 0.5; p.wristL.rz = 0.2;
  p.handL = 'relax';
}
const nextIdle = (rig) => (rig.seated ? 'sit_knit' : 'idle');
const ff = (t, d) => (t > d ? t % d : t); // one-shots that also loop cleanly with { loop: true }

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.8);
    p.hips.x = sway * 0.3; p.hips.rz = sway * 0.025; p.chest.rz = -sway * 0.035;
    p.head.rz = sin(t * 0.8 + 0.7) * 0.06;
    caneHand(p, rig);
    tummyHand(p, rig);
    // glance around
    const T = t % 11;
    p.head.ry = K(T, [[0, 0], [2.4, 0], [2.8, 0.42], [4.2, 0.42], [4.6, -0.3], [5.6, -0.3], [6, 0]]);
    f.look = [p.head.ry * 1.8, 0];
    // push the spectacles up with a finger
    const g = win(T, 7.4, 8.4, 0.25, 0.3);
    if (g > 0) {
      const m = rig.headPoint(p, 6.2, 5.6, _hp);
      rig.reach(p, 1, lerp(2.6, 1.3, g), lerp(1.6, m[0] - 1.8, g), lerp(5.4, m[1] + 1.2, g), [1, -0.6, -0.2]);
      p.handL = g > 0.5 ? 'point' : 'relax';
      p.wristL.rx = lerp(0.5, -0.9, g);
      p.head.rx -= pulse(T, 7.7, 0.5) * 0.08;
      if (T > 7.7 && T < 8.1) f.eyes = 'happy';
    }
    // a little hum, throat fluttering
    const hum = win(T, 8.8, 10.6, 0.2, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.k.croak = 0.12 * hum * (0.6 + 0.4 * sin(t * 12)) + max(0, sin(t * 2.2)) * 0.06;
    p.head.rz += hum * sin(t * 4) * 0.06;
    if (hum > 0.2) { f.mouth = 'chew1'; f.eyes = 'happy'; }
    // cane tap
    if (beat(s, 'tap', t, 5.5, 1.2)) rig._emit('tap');
    p.k.caneLift = pulse(t % 5.5, 1.05, 0.2) * 0.02;
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    const ph = (t / 0.8) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.42);
    p.hips.y = -0.6 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.07; p.chest.rz = -cs * 0.05; p.hips.ry = -sn * 0.06;
    p.chest.rx = 0.16; p.head.rx = -0.16; p.head.rz = cs * 0.04;
    // cane moves with the right foot
    caneHand(p, rig, 0, sn * 0.3, 0.4 + sn * 0.8);
    p.k.caneLift = max(0, -sn) * 0.03; p.k.caneLean = 0.3 + sn * 0.6;
    // left paw swings a little
    p.armL.rx = sn * 0.35; p.armL.rz = 0.15; p.foreL.rx = -0.5 - max(0, -sn) * 0.3; p.handL = 'relax';
    p.tail.rx += abs(cs) * 0.2;
    stepEvents(s, ph, rig);
  },
});

def('hop_walk', {
  loop: true, expr: 'happy',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    const T = 0.7, u = (t % T) / T;
    // crouch, spring, fly (legs kick back), land + squash
    const air = K(u, [[0, 0], [0.28, 0], [0.5, 1, 'out'], [0.78, 0, 'in'], [1, 0]]);
    const squash = K(u, [[0, 0.3], [0.22, 1, 'io'], [0.3, -0.4, 'out'], [0.5, 0], [0.78, 0], [0.86, 0.8, 'out'], [1, 0.3, 'io']]);
    p.mover.y = air * 3.4;
    p.hips.s = 1 - squash * 0.06 + air * 0.03; p.chest.s = 1 - squash * 0.04;
    p.chest.rx = 0.2 + squash * 0.15 - air * 0.12; p.head.rx = -0.18 - air * 0.1;
    if (air > 0.05) {
      const tuck = sin(air * PI * 0.5);
      p.thighL.rx = p.thighR.rx = 0.4 * tuck - 0.5 * (1 - tuck); p.shinL.rx = p.shinR.rx = 0.9 * tuck;
      p.thighL.rz = 0.3; p.thighR.rz = -0.3;
      p.hips.y -= max(0, squash) * 1.4;
    } else rig.stance(p, max(0, squash) * 1.6, 0.6, 0.6, 0.12);
    // arms: cane held up ahead, left paw flails a little
    rig.reach(p, -1, 5.6, 4 + air * 2, 4.4, [0.8, -0.4, -1]); p.handR = 'fist'; p.wristR.rx = 0.4;
    p.k.cane = 0;
    p.armL.rz = 0.4 + air * 0.9; p.armL.rx = -0.2; p.foreL.rx = -0.6; p.handL = 'open';
    p.hat.y = air * 0.5;
    p.k.croak = air * 0.2;
    f.mouth = air > 0.3 ? 'open' : 'grin';
    if (beat(s, 'hop', t, T, 0.29 * T)) rig._emit('hop');
    if (beat(s, 'land', t, T, 0.78 * T)) rig._emit('land');
  },
});

def('wave', {
  loop: true, expr: 'happy',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    stand(p, rig, t, { amt: 0.6 });
    caneHand(p, rig);
    const wv = sin(t * 8);
    rig.reach(p, 1, 8.8 + wv * 0.7, 10.6, 3.2, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.4 - 0.2; p.wristL.rx = -0.2;
    p.handL = 'open';
    p.chest.rz += 0.06; p.head.rz += -0.12 + sin(t * 4) * 0.05;
    p.hips.x = sin(t * 4) * 0.2;
    p.k.croak = 0.1;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    stand(p, rig, t, { amt: 0.7 });
    caneHand(p, rig);
    const on = talkMouth(t, f, { rate: 6.5 });
    // gestures: open palm offer -> finger wag ("now listen, dearie") -> hand to heart
    const T = t % 6.2;
    const offer = win(T, 0.2, 2.0, 0.3, 0.3), wag = win(T, 2.3, 3.9, 0.25, 0.25), heart = win(T, 4.3, 5.8, 0.3, 0.3);
    const base = [2.6, 1.6, 5.4];
    let tx = base[0], ty = base[1], tz = base[2];
    tx = lerp(tx, 7.4, offer); ty = lerp(ty, 3.4 + sin(t * 5) * 0.3, offer); tz = lerp(tz, 6.0, offer);
    tx = lerp(tx, 7.8, wag); ty = lerp(ty, 9.6, wag); tz = lerp(tz, 4.8, wag);
    tx = lerp(tx, 2.4, heart); ty = lerp(ty, 3.6, heart); tz = lerp(tz, 6.0, heart);
    rig.reach(p, 1, tx, ty, tz, [1, -0.5, -0.3]);
    p.wristL.rz = wag * sin(t * 13) * 0.45 + offer * 0.4;
    p.wristL.rx = lerp(0.5, -0.4, offer) - wag * 0.3;
    p.handL = wag > 0.5 ? 'point' : offer > 0.5 ? 'open' : 'relax';
    p.head.rx += (on ? sin(t * 6.5) * 0.04 : 0) - wag * 0.06;
    p.head.rz += sin(t * 1.3) * 0.08 - heart * 0.08;
    p.chest.ry = offer * 0.12 - wag * 0.06;
    p.k.croak = on * 0.06 * abs(sin(t * 7));
    if (heart > 0.5) f.eyes = 'happy';
    if (wag > 0.5) f.brows = 'flat';
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    const ha = sin(t * 13);
    stand(p, rig, t, { amt: 0.4, crouch: 0.35 + abs(ha) * 0.3 });
    caneHand(p, rig);
    // "ohoho": paw politely at the cheek, shoulders shaking, throat puffing
    const m = rig.headPoint(p, 2.4, 5.4, _hp);
    rig.reach(p, 1, 6.2, m[0] - 3.6, m[1] + 0.4, [1, -0.8, 0.2]);
    p.wristL.rx = -0.4; p.wristL.rz = -0.5; p.handL = 'open';
    p.chest.rx += -0.1 + ha * 0.05; p.head.rx += -0.2 + ha * 0.07;
    p.chest.s = 1 + ha * 0.03; p.mover.y += abs(ha) * 0.2;
    p.head.rz = sin(t * 2.4) * 0.12;
    p.k.croak = 0.25 + abs(ha) * 0.35;
    f.mouth = ha > -0.3 ? 'laugh' : 'grin';
    if (beat(s, 'r', t, 1.6, 0.3)) rig._emit('ribbit');
  },
});

const HAPPY_DUR = 1.9;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: nextIdle,
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // little crouch -> hop with both arms (and the cane) thrown up -> bounce, bounce
    const jump = K(t, [[0, 0], [0.22, -1, 'out'], [0.34, 0], [0.56, 3.6, 'out'], [0.8, 0, 'in'], [0.9, -0.8, 'out'], [1.02, 0], [1.16, 1.2, 'out'], [1.3, 0, 'in'], [1.4, -0.4], [1.6, 0]]);
    const up = win(t, 0.25, 1.45, 0.12, 0.35);
    p.mover.y = max(0, jump);
    p.hips.s = 1 + (jump < 0 ? jump * 0.07 : 0.02);
    rig.life(t, p, 0.4);
    p.chest.rx = 0.1 - up * 0.12; p.head.rx = -0.12 - up * 0.15;
    if (jump > 0.2) {
      p.thighL.rx = p.thighR.rx = -0.25; p.shinL.rx = p.shinR.rx = 0.6;
      p.thighL.rz = 0.35; p.thighR.rz = -0.35;
    } else rig.stance(p, max(0, -jump) * 1.4 + 0.3, 0.6, 0.4, 0.1);
    const flap = sin(t * 18) * 0.5 * up;
    rig.reach(p, 1, lerp(2.6, 6.4, up), lerp(1.6, 9.8, up) + flap, lerp(5.4, 2.4, up), [1, -0.6, -0.4]);
    rig.reach(p, -1, lerp(6.2, 6.6, up), lerp(2.4, 10.2, up) - flap, lerp(3.0, 2.6, up), [1, -0.6, -0.4]);
    p.handL = up > 0.4 ? 'open' : 'relax'; p.handR = 'fist';
    p.wristR.rx = lerp(0.3, -0.4, up);
    p.k.cane = 1 - smooth(up * 2.5);
    p.k.croak = 0.1 + up * 0.35;
    p.k.spark = clamp((t - 0.4) / 1.2, 0, 1) * (t < 1.6 ? 1 : 0);
    p.hat.y = max(0, jump) * 0.3;
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (beat(s, 'l1', t, 99, 0.8) || beat(s, 'l2', t, 99, 1.3)) rig._emit('land');
  },
});

def('sit_knit', {
  loop: true, expr: 'knit',
  enter(s, rig) { s.from = rig.seated ? 1 : 0; rig.seated = true; },
  fn(t, p, f, s, rig) {
    // backs into the chair first if she was standing
    const w = s.from ? 1 : K(t, [[0, 0], [1.0, 1, 'io']]);
    const tt = s.from ? t : max(0, t - 1.0);
    rig.life(tt, p, 0.6);
    rock(p, sin(tt * 1.6) * 0.075 * w);
    seat(p, rig, w, tt, 0.6 * w);
    p.chest.rx += 0.08 * w; p.head.rx += 0.12 * w;
    // knitting: hands bob alternately in front of the tummy, needles click
    const st = sin(tt * 4.5), st2 = sin(tt * 4.5 + PI * 0.6);
    const look = win(tt % 12, 8, 10.5, 0.4, 0.4); // holds the work up to admire it
    const hy = lerp(2.8, 5.6, look), hz = lerp(5.2, 6.4, look);
    rig.reach(p, 1, lerp(2.2, 2.6, look) + st * 0.3 * (1 - look), hy + st * 0.4 * (1 - look), hz + max(0, st) * 0.4, [1, -0.5, -0.6]);
    rig.reach(p, -1, lerp(2.2, 2.6, look) + st2 * 0.3 * (1 - look), hy + st2 * 0.4 * (1 - look), hz + max(0, st2) * 0.4, [1, -0.5, -0.6]);
    p.wristL.rx = p.wristR.rx = -0.3;
    p.handL = p.handR = 'fist';
    p.vis.knit = w > 0.6;
    if (w < 0.6) { caneHand(p, rig); tummyHand(p, rig); p.vis.knit = false; }
    p.head.ry = sin(tt * 0.4) * 0.08;
    p.head.rx += look * -0.2;
    f.look = [0, look ? -0.5 : 1];
    if (look > 0.5) { f.eyes = 'happy'; f.mouth = 'grin'; p.k.hearts = 1; }
    else if (w >= 1 && (tt % 12) > 4 && (tt % 12) < 6.5) { f.mouth = 'chew1'; p.k.notes = 1; }
    if (w < 1) f.expr = 'neutral';
    p.k.croak = max(0, sin(tt * 2.2)) * 0.06;
    if (w >= 1 && look < 0.2 && beat(s, 'click', tt, (TAU / 4.5) / 2, 0.2)) rig._emit('click');
  },
});

def('stand', {
  dur: 1.2, expr: 'neutral', next: 'idle',
  enter(s, rig) { s.from = rig.seated ? 1 : 0; },
  exit(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    const w = s.from * K(t, [[0, 1], [0.2, 1], [0.95, 0, 'io']]);
    const push = pulse(t, 0.1, 0.85);
    seat(p, rig, w, 0, 0);
    p.chest.rx += push * 0.5; p.head.rx -= push * 0.25;
    caneHand(p, rig); tummyHand(p, rig);
    rig.seated = false;
    if (t > 0.85) p.mover.y += pulse(t, 0.85, 0.3) * 0.3;
    f.mouth = push > 0.5 ? 'flat' : 'smile';
  },
});

const TC = { dur: 4.4, notice: 0.4, zap: 1.78, hit: 1.86, back: 2.02, gulp: 2.12 };
/** The fly's buzzing path (root space). */
function flyPath(t, out) {
  const a = t * 5.6, conv = smooth((t - 0.9) / (TC.zap - 0.9));
  const enter = 1 - smooth(t / 0.7);
  const bx = 0.26 * cos(a) + 0.9 * enter, by = 1.04 + 0.08 * sin(a * 1.7) + 0.2 * enter, bz = 0.42 + 0.16 * sin(a);
  const ex = 0.08, ey = 0.94, ez = 0.72;
  out.set(lerp(bx, ex, conv) + sin(t * 31) * 0.01, lerp(by, ey, conv) + sin(t * 23) * 0.012, lerp(bz, ez, conv));
  return out;
}
def('tongue_catch', {
  dur: TC.dur, expr: 'neutral', next: nextIdle,
  enter(s, rig) { rig.seated = false; rig._flyCaught = false; },
  exit(s, rig) { rig._flyCaught = false; },
  fn(t, p, f, s, rig) {
    stand(p, rig, t, { amt: 0.5 });
    caneHand(p, rig);
    tummyHand(p, rig);
    const fp = flyPath(min(t, TC.hit), rig._flyP);
    rig._flyYaw = Math.atan2(-sin(t * 5.6), -cos(t * 5.6));
    // track it with the head + eyes
    const hy = 0.92, dz = max(0.15, fp.z - 0.05);
    const yaw = clamp(Math.atan2(fp.x, dz), -0.7, 0.7) * smooth((t - 0.2) / 0.4) * (t < TC.back ? 1 : 1 - smooth((t - TC.back) / 0.4));
    const pitch = clamp(Math.atan2(fp.y - hy, dz), -0.3, 0.6);
    p.head.ry += yaw * 0.8; p.head.rx -= pitch * 0.5 * (t < TC.back ? 1 : 0);
    f.look = [yaw * 2.4, -pitch * 2];
    if (t > TC.notice && t < TC.zap) { f.expr = t > 1.3 ? 'focused' : 'surprised'; }
    // crouch + lean in before the zap
    const coil = win(t, 1.2, TC.zap, 0.4, 0.06);
    p.chest.rx += coil * 0.12; p.hips.y -= coil * 0.4;
    // ZAP
    p.k.zap = K(t, [[TC.zap, 0], [TC.hit, 1, 'out'], [TC.hit + 0.04, 1], [TC.back, 0, 'in']]);
    if (t >= TC.hit) rig._flyCaught = true;
    p.vis.fly = t < TC.gulp;
    if (t > TC.zap - 0.02 && t < TC.back + 0.04) { f.mouth = 'open'; f.eyes = 'focused'; }
    p.head.z += pulse(t, TC.zap, 0.2) * 0.6;
    // gulp
    const g = pulse(t, TC.gulp, 0.3);
    p.head.s = 1 - g * 0.12; p.head.y -= g * 0.4; p.k.croak = g * 0.7;
    if (t > TC.gulp) { f.expr = 'happy'; f.mouth = t < TC.gulp + 0.5 ? 'chew2' : 'smile'; }
    // satisfied tummy pats
    const pat = win(t, 2.5, 3.8, 0.2, 0.3);
    if (pat > 0) {
      const tap = max(0, sin((t - 2.5) * 12)) * pat;
      rig.reach(p, 1, 2.2, 1.0 + tap * 0.6, lerp(5.4, 6.4, pat) - tap * 0.8, [0.9, -0.4, -0.6], 1);
      p.handL = 'open'; p.wristL.rx = 0.9;
      p.chest.s += pulse((t - 2.5) % (TAU / 12), 0.15, 0.2) * 0.03;
      p.k.hearts = t > 2.8 && t < 3.9 ? 1 : 0;
    }
    beat(s, 'z', t, 99, TC.zap) && rig._emit('zap');
    beat(s, 'g', t, 99, TC.gulp + 0.05) && rig._emit('gulp');
    if (beat(s, 'p1', t, 99, 2.66) || beat(s, 'p2', t, 99, 3.18)) rig._emit('pat');
  },
});
const _hp = [0, 0];

export { ANIMS as FROG_ANIMS };
