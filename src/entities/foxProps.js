// Reynard's outfits and hand props: voxel model builders used by foxRig.js
// (setOutfit / holdProp / holdBoth). Body parts use the rig's 0.05 voxels so
// they share its chunky look; small props use 0.025 fine voxels. Geometry is
// built lazily on first use and shared by every rig (disposeFoxProps frees it).
//
//   outfitParts('teacher') -> { hat, torso, upperL, upperR, foreL, foreR, extras }   (also 'chef', 'pajamas', 'scientist')
//   propParts('pointer')   -> { geo, tip: Vector3, axis: Vector3, len }
//   makeGoldCup()          -> THREE.Group (placeholder trophy, origin at the base)
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';

const VS = 0.05; // rig voxels
const FV = 0.025; // fine voxels

export const FOX_OUTFITS = ['default', 'teacher', 'chef', 'pajamas', 'scientist'];
export const FOX_PROPS = ['pointer', 'chalk', 'ladle', 'toothbrush', 'magnifier', 'pencil', 'clipboard'];

// ------------------------------------------------------------------ palette
const P = {
  fur: 0xe0662a, furD: 0xd35c25, furL: 0xea7431,
  cream: 0xf8eedc, creamD: 0xecdcc4,
  sock: 0x302634, sockD: 0x241c28, sockL: 0x46394e,
  hat: 0x221c2a, hatD: 0x17131d, hatL: 0x3b3348, hatLL: 0x5e5270,
  gold: 0xffdc4a, goldD: 0xf0b030, goldDD: 0xb87a1c, goldL: 0xfff6c4,
  // teacher: heather tweed with rust / moss / oat flecks, suede patches, navy polka-dot bow tie
  tweed: 0x8c7552, tweedD: 0x7a6446, tweedDD: 0x54442f, tweedL: 0x9c8460, tweedR: 0x9a6040, tweedG: 0x7a7c4c, tweedC: 0xb4a07a,
  patch: 0x5e3f2a, patchD: 0x46301f, patchL: 0x7c5738,
  shirt: 0xf8f4ea, shirtD: 0xdcd5c6,
  tie: 0x2f4290, tieD: 0x1f2c66, tieL: 0x4a64b4, dot: 0xf4f2fa,
  btn: 0x704428, btnL: 0x98623a,
  pen: 0xe0402e, penD: 0xa82a22,
  // chef: crisp whites, charcoal knot buttons, red neckerchief
  white: 0xf6f4ee, whiteD: 0xe2ded4, whiteDD: 0xc8c2b4, whiteL: 0xffffff,
  cbtn: 0x3c3646, cbtnL: 0x625a70,
  scarf: 0xe03a32, scarfD: 0xaa2229, scarfL: 0xff6650,
  // props
  wood: 0xb47c40, woodD: 0x86582a, woodL: 0xd29c5c, rub: 0xa8242a, rubL: 0xd0443e,
  brass: 0xe0b040, brassD: 0xa87c24,
  glove: 0xfdfcf8, gloveD: 0xdedbe4, gloveDD: 0xbcb6c8,
  chalk: 0xfbfbf4, chalkD: 0xe4e4da, chalkDD: 0xcfcfc4,
  steel: 0xc8ced8, steelD: 0x949caa, steelDD: 0x6c7484, steelL: 0xf0f4fa,
  soup: 0xf2cf7a, soupD: 0xd8a84a, carrot: 0xf07a2a, herb: 0x5aa83c,
  plinth: 0x5a3a24, plinthD: 0x40281a, plinthL: 0x7a5232,
  // pajamas: soft blue flannel with cream stripes, navy piping, a cosy red nightcap
  pj: 0x86b4e4, pjD: 0x6a98cc, pjL: 0x9ec6f0, pjS: 0xf6eedc, pjSD: 0xe2d6bc, pjP: 0x34508e, pjB: 0xfdf8ec,
  cap: 0xd8463e, capD: 0xb03432, capL: 0xec6a58, capS: 0xf6eedc, pom: 0xfdfaf0, pomD: 0xe6dccc,
  brush: 0x4aa8e8, brushD: 0x2f7ab8, brushL: 0x8ad0ff, bristle: 0xf8fcff, bristleT: 0x9ad8ff, foam: 0xffffff, foamD: 0xe4eef8,
  // scientist: starched lab coat over a pale blue shirt, purple bow tie (still Reynard), brass goggles
  coat: 0xf4f6f4, coatD: 0xdde2e2, coatDD: 0xbcc4c8, coatL: 0xffffff,
  sky: 0xbfe0f4, skyD: 0x9cc8e6, bow: 0x7a3ea8, bowD: 0x56287c, bowL: 0x9c62c8,
  strap: 0x3a2c3c, strapD: 0x281e2a, strapL: 0x54425a,
  rim: 0xd09a44, rimD: 0x9a6a28, rimL: 0xf4cc74,
  glass: 0x6ee0f4, glassD: 0x3ab0d4, glassL: 0xd4fbff,
  badge: 0x4ad0e0, badgeD: 0x2a8aa8, ink: 0x2e4a7a, pen2: 0x3a6ad0,
  board: 0xb0773e, boardD: 0x8a5a2c, boardL: 0xcc9358, paper: 0xfbf8ee, paperD: 0xe8e2d0, line: 0x9cb8d4, doodle: 0xf08a3a,
  pencil: 0xf4c430, pencilD: 0xd09a18, pencilL: 0xffe070, eraser: 0xf08aa0, eraserD: 0xc85a74, lead: 0x3a3440, shav: 0xf0d0a0,
};

// ------------------------------------------------------------------ voxel helpers
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const tone = (x, y, z, base, dark, light, pd = 0.1, pl = 0.09) => {
  const h = hash3(x, y, z);
  return h < pd ? dark : h > 1 - pl ? light : base;
};
// Rounded box over voxel indices x0..x1 etc. (inclusive), edge radius r.
function rbox(v, x0, x1, y0, y1, z0, z1, r, col) {
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  const hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2, hz = (z1 - z0 + 1) / 2;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const qx = Math.abs(x + 0.5 - cx) - (hx - r), qy = Math.abs(y + 0.5 - cy) - (hy - r), qz = Math.abs(z + 0.5 - cz) - (hz - r);
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
        if (d <= 0.02) v.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
}
const fur = (x, y, z) => tone(x, y, z, P.fur, P.furD, P.furL);
const creamT = (x, y, z) => tone(x, y, z, P.cream, P.creamD, P.cream);
const ruff = (x, y, z) => (z >= 1 ? creamT(x, y, z) : fur(x, y, z));
// heather tweed: base tones plus sparse coloured flecks
const tweed = (x, y, z) => {
  const h = hash3(x * 3 + 11, y * 5 + 7, z * 7 + 3);
  if (h < 0.04) return P.tweedR;
  if (h < 0.07) return P.tweedG;
  if (h < 0.1) return P.tweedC;
  // herringbone-ish diagonal weave
  return (x + y * 2 + z) % 4 === 0 ? P.tweedD : tone(x, y, z, P.tweed, P.tweedD, P.tweedL, 0.1, 0.12);
};
const whiteT = (x, y, z) => tone(x, y, z, P.white, P.whiteD, P.whiteL, 0.12, 0.1);

// Same silhouette as the waistcoat torso in foxRig.js (pivot at the waist).
function torsoShell(v, col) {
  rbox(v, -5, 4, -2, 5, -4, 3, 1.7, col);
  rbox(v, -4, 3, -2, 3, 0, 4, 2.1, col); // belly
  rbox(v, -4, 3, 5, 8, -3, 3, 1.4, ruff); // neck ruff (fills gaps when the head tilts)
}

// ------------------------------------------------------------------ teacher
// Tweed cardigan over a white shirt, navy polka-dot bow tie, leather buttons,
// a red pen in the breast pocket.
function cardiganModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = x + 0.5;
    if (z >= 1 && y >= 1) {
      const w = (y - 0.2) * 0.8;
      if (Math.abs(fx) <= w - 0.6) return tone(x, y, z, P.shirt, P.shirtD, P.shirt, 0.1, 0);
      if (Math.abs(fx) <= w + 0.5) return y >= 4 ? P.tweedD : P.tweedDD; // knit placket
    }
    if (z >= 2 && y < 1 && Math.abs(fx) <= 0.6) return (y & 1) ? P.tweedDD : P.tweedD; // button band
    if (y === -2) return (x + z) & 1 ? P.tweedD : P.tweedDD; // ribbed hem
    return tweed(x, y, z);
  };
  torsoShell(v, col);
  // leather buttons down the band
  for (const y of [0, -1]) { v.set(-1, y, 4, y ? P.btn : P.btnL); v.set(0, y, 4, P.btn); }
  // patch pockets with a darker welt
  for (const x of [-4, -3, 2, 3]) v.set(x, -1, 4, P.tweedDD);
  for (const x of [-4, -3, 2, 3]) v.set(x, -1, 3, P.tweedDD);
  // breast pocket + red pen peeking out (Reynard's left)
  for (const x of [1, 2, 3]) v.set(x, 2, 4, P.tweedDD);
  v.set(3, 3, 4, P.pen); v.set(3, 4, 4, P.penD); v.set(3, 4, 5, P.gold);
  // shirt collar points
  v.set(-3, 6, 4, P.shirt); v.set(-2, 6, 4, P.shirtD); v.set(1, 6, 4, P.shirtD); v.set(2, 6, 4, P.shirt);
  v.set(-2, 5, 4, P.shirt); v.set(1, 5, 4, P.shirt);
  // bow tie (a touch smaller than the waistcoat one), navy with white dots
  for (let y = 4; y <= 5; y++) {
    for (const x of [-4, -3, -2, 1, 2, 3]) v.set(x, y, 5, (x === -4 || x === 3) && y === 5 ? P.tieD : P.tie);
    v.set(-1, y, 5, P.tieD); v.set(0, y, 5, P.tieD);
    v.set(-1, y, 6, P.tie); v.set(0, y, 6, P.tieL);
  }
  v.set(-3, 6, 5, P.tieL); v.set(2, 6, 5, P.tie); v.set(-3, 3, 5, P.tieD); v.set(2, 3, 5, P.tieD);
  v.set(-4, 4, 5, P.dot); v.set(-2, 5, 5, P.dot); v.set(1, 4, 5, P.dot); v.set(3, 5, 5, P.dot);
  // elbow-patch tweed back: a darker centre seam
  for (let y = -1; y <= 4; y++) { v.set(-1, y, -5, P.tweedD); }
  return v;
}

// Sleeves: upper arm (pivot at the shoulder, hangs down 4), forearm (pivot at the elbow).
function upperSleeve(kind) {
  const v = new VoxelModel();
  rbox(v, -1, 1, -4, 1, -1, 1, 0.9, (x, y, z) => {
    if (kind === 'teacher') {
      // suede elbow patch on the back of the elbow (the arm bends toward +z)
      if (z === -1 && (y === -4 || (y === -3 && x === 0))) return tone(x, y, z, P.patch, P.patchD, P.patchL, 0.2, 0.2);
      return tweed(x, y, z);
    }
    if (y === 1 || (y === 0 && x !== 0)) return P.whiteD; // shoulder seam
    return whiteT(x, y, z);
  });
  return v;
}
function foreSleeve(kind) {
  const v = new VoxelModel();
  rbox(v, -1, 1, -3, 0, -1, 1, 0.8, (x, y, z) => {
    if (kind === 'teacher') {
      if (y === -3) return (x + z) & 1 ? P.tweedD : P.tweedDD; // ribbed cuff
      if (z === -1 && (y === 0 || (y === -1 && x === 0))) return tone(x, y, z, P.patch, P.patchD, P.patchL, 0.2, 0.2);
      return tweed(x, y, z);
    }
    if (y <= -2) return y === -2 ? P.whiteL : P.whiteD; // rolled cuff
    return whiteT(x, y, z);
  });
  return v;
}

// Mortarboard: skull cap + flat board, pivot at the hat seat (head top centre).
function mortarboardModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, 0, 2, -4, 3, 1.3, (x, y, z) => (y === 0 ? P.hatD : tone(x, y, z, P.hat, P.hatD, P.hatL, 0.1, 0.1)));
  for (let x = -7; x <= 6; x++)
    for (let z = -7; z <= 6; z++) {
      const edge = x === -7 || x === 6 || z === -7 || z === 6;
      let c = edge ? (x === -7 || z === 6 ? P.hatL : P.hatD) : tone(x, 3, z, P.hat, P.hatD, P.hat, 0.12, 0);
      if (!edge && (x + z) % 5 === 0 && hash3(x, 3, z) < 0.5) c = P.hatL; // cloth weave sheen
      v.set(x, 3, z, c);
    }
  // gold button
  v.set(-1, 4, -1, P.goldD); v.set(0, 4, -1, P.gold); v.set(-1, 4, 0, P.gold); v.set(0, 4, 0, P.goldL);
  return v;
}
// Tassel cord lying on the board, from the button to the front-right corner (fine voxels, hat space x2).
function tasselCordModel() {
  const v = new VoxelModel();
  const A = [0, 0], B = [12, 12];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = Math.round(A[0] + (B[0] - A[0]) * u), z = Math.round(A[1] + (B[1] - A[1]) * u);
    v.set(x, 0, z, i % 3 === 0 ? P.goldD : P.gold);
  }
  return v;
}
// Hanging part: pivot at the board corner, hangs down -y.
function tasselModel() {
  const v = new VoxelModel();
  v.set(0, 0, 0, P.goldD); v.set(0, -1, 0, P.gold); v.set(0, -2, 0, P.goldD);
  // knot bead
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) v.set(x, -3, z, x === -1 || z === 1 ? P.goldL : P.gold);
  // fringe bundle, flaring a little toward the bottom
  for (let y = -4; y >= -9; y--) {
    const r = y < -6 ? 1 : 1;
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        if (y > -6 && Math.abs(x) + Math.abs(z) > 1) continue;
        if (y === -9 && (x + z) & 1) continue; // ragged ends
        const c = x < 0 || z > 0 ? (y > -6 ? P.goldL : P.gold) : (y < -7 ? P.goldDD : P.goldD);
        v.set(x, y, z, c);
      }
  }
  return v;
}

// ------------------------------------------------------------------ chef
// White double-breasted jacket, charcoal knot buttons, red neckerchief.
function chefJacketModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (y === -2) return P.whiteD; // hem
    if (z >= 2 && x === 1 && y <= 4) return P.whiteDD; // double-breasted flap edge
    if (z >= 2 && x === 2 && y <= 4) return P.whiteD; // its shadow
    if (z <= -3 && x === -1 && y >= -1) return P.whiteD; // back seam
    return whiteT(x, y, z);
  };
  torsoShell(v, col);
  // stand-up collar (front half of the neck ruff) + neckerchief tied above it
  rbox(v, -4, 3, 5, 5, -3, 3, 1.4, (x, y, z) => (z >= 0 ? whiteT(x, y, z) : P.whiteD));
  rbox(v, -4, 3, 6, 6, -3, 3, 1.4, (x, y, z) => (z >= 2 ? P.scarf : P.scarfD));
  // knot + a little triangle tail on the chest (slightly off centre, jaunty)
  v.set(-2, 6, 4, P.scarfL); v.set(-1, 6, 4, P.scarf); v.set(-2, 5, 4, P.scarf); v.set(-1, 5, 4, P.scarfD);
  v.set(-2, 6, 5, P.scarf); v.set(-1, 6, 5, P.scarfL);
  v.set(-3, 4, 4, P.scarf); v.set(-2, 4, 4, P.scarfD); v.set(-1, 4, 4, P.scarf); v.set(-2, 3, 4, P.scarfD); v.set(-2, 4, 5, P.scarfL);
  // two rows of knot buttons
  for (const y of [3, 1, -1]) {
    const z = y >= 3 ? 4 : 5;
    for (const x of [-3, 2]) { v.set(x, y, z, P.cbtn); }
    v.set(-3, y, z + 1, P.cbtnL);
  }
  // lower jacket skirt, a touch longer than the waistcoat
  rbox(v, -5, 4, -3, -3, -4, 3, 1.4, (x, y, z) => (z >= 2 && x === 1 ? P.whiteDD : P.whiteD));
  // breast pocket with a thermometer (Reynard's left)
  v.set(2, 2, 5, P.whiteDD); v.set(3, 2, 4, P.whiteDD);
  return v;
}

// Tall pleated toque: narrow band between the ears, pleated body, puffy crown.
function toqueModel() {
  const v = new VoxelModel();
  const pleat = (x, z, n = 14) => {
    const a = Math.atan2(z + 0.5, x + 0.5);
    return Math.floor(((a / (Math.PI * 2)) + 1) * n) % 2;
  };
  // band
  for (let y = 0; y <= 1; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const dx = x + 0.5, dz = z + 0.5;
        if (dx * dx + dz * dz > 3.5 * 3.5) continue;
        v.set(x, y, z, y === 0 ? P.whiteD : tone(x, y, z, P.white, P.whiteD, P.whiteL, 0.05, 0.1));
      }
  // pleated body, flaring a little
  for (let y = 2; y <= 8; y++) {
    const r = 3.4 + (y - 2) * 0.14;
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const dx = x + 0.5, dz = z + 0.5, d = Math.hypot(dx, dz);
        if (d > r) continue;
        let c = pleat(x, z) ? P.white : P.whiteD;
        if (d < r - 1.2) c = P.whiteD;
        if (dx < -1.5 && pleat(x, z)) c = P.whiteL; // lit side
        v.set(x, y, z, c);
      }
  }
  // puffy crown (squashed sphere), pleat creases fanning toward the top dimple
  const cy = 10.6, R = 5.4, RY = 3.4;
  for (let y = 8; y <= 14; y++)
    for (let x = -6; x <= 5; x++)
      for (let z = -6; z <= 5; z++) {
        const dx = x + 0.5, dz = z + 0.5, dy = y + 0.5 - cy;
        const e = (dx * dx + dz * dz) / (R * R) + (dy * dy) / (RY * RY);
        if (e > 1) continue;
        let c = pleat(x, z, 10) ? P.white : P.whiteD;
        if (dy < -1.6) c = P.whiteDD; // underside of the puff
        else if (dy > 1.8 && dx < 0.5 && dz > -2) c = P.whiteL;
        if (Math.abs(dx) < 1 && Math.abs(dz) < 1 && y >= 13) c = P.whiteD; // top dimple
        v.set(x, y, z, c);
      }
  return v;
}

// ------------------------------------------------------------------ props (fine voxels)
// All along -y from the grip (the paw); tip = where the business end is.
// Teacher's pointer: rubber butt cap, wooden shaft, brass ferrule and a tiny white
// cartoon glove pointing its index finger.
function pointerModel() {
  const v = new VoxelModel();
  const sq = (y, c) => { for (const x of [-1, 0]) for (const z of [-1, 0]) v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  sq(4, P.rub); sq(3, (x) => (x < 0 ? P.rubL : P.rub));
  for (let y = 2; y >= -17; y--) sq(y, (x, yy, z) => (x < 0 && z === 0 ? P.woodL : (yy * 3 + x * 5 + z * 7) % 11 === 0 ? P.woodD : P.wood));
  sq(-18, (x) => (x < 0 ? P.brass : P.brassD));
  // tiny cartoon glove: rolled cuff, fist, index finger pointing on along the stick
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, -19, z, (x === -2 || z === 1) ? P.glove : P.gloveD);
  rbox(v, -2, 1, -22, -20, -2, 1, 0.9, (x, y, z) => (z < -1 || x > 0 ? P.gloveD : P.glove));
  for (const x of [-1, 0, 1]) v.set(x, -22, 2, x === 0 ? P.gloveD : P.glove); // curled fingers
  for (let y = -23; y >= -25; y--) for (const x of [-1, 0]) for (const z of [-1, 0]) {
    if (y === -25 && !(x === -1 && z === 0)) continue; // rounded tip
    v.set(x, y, z, x === 0 && z === -1 ? P.gloveD : P.glove);
  }
  v.set(-3, -21, 0, P.glove); v.set(-3, -20, 0, P.gloveD); // thumb
  return v;
}
function chalkModel() {
  const v = new VoxelModel();
  for (let y = 1; y >= -6; y--)
    for (const x of [-1, 0])
      for (const z of [-1, 0]) {
        if (y === -6 && !(x === -1 && z === 0)) continue; // worn tip
        v.set(x, y, z, x < 0 && z === 0 ? P.chalk : (y + x) & 1 ? P.chalkD : P.chalk);
      }
  v.set(0, 1, 0, P.chalkDD);
  return v;
}
// Soup ladle: hooked steel handle, bowl (opening up) with a little fish chowder in it.
function ladleModel() {
  const v = new VoxelModel();
  const sq = (y, zo, c) => { for (const x of [-1, 0]) for (const z of [-1, 0]) v.set(x, y, z + zo, x < 0 && z === 0 ? P.steelL : c); };
  // hook
  sq(7, -1, P.steelD); sq(7, -2, P.steel); sq(6, -3, P.steelD);
  for (let y = 6; y >= -11; y--) sq(y, 0, (y % 5 === 0) ? P.steelD : P.steel);
  sq(-12, 1, P.steel); sq(-13, 2, P.steelD);
  // bowl: hollow lower half-sphere centred at (0, -14, 5), opening up
  const C = [0, -14, 5], R = 4.2;
  for (let x = -5; x <= 4; x++)
    for (let y = -19; y <= -14; y++)
      for (let z = 0; z <= 10; z++) {
        const dx = x + 0.5 - C[0], dy = y + 0.5 - C[1], dz = z + 0.5 - C[2];
        const d = Math.hypot(dx, dy, dz);
        if (d > R || dy > 0.4) continue;
        if (d < R - 1.15) {
          if (y === -15) v.set(x, y, z, hash3(x, y, z) < 0.12 ? P.carrot : hash3(z, x, y) < 0.08 ? P.herb : (x + z) & 1 ? P.soup : P.soupD);
          continue;
        }
        v.set(x, y, z, dy > -1 ? P.steelL : dx < -1 ? P.steel : P.steelD);
      }
  return v;
}

// Placeholder trophy: wooden plinth, golden cup with two loop handles and a star.
function goldCupModel() {
  const v = new VoxelModel();
  rbox(v, -5, 4, 0, 1, -4, 3, 0.8, (x, y, z) => (y === 1 ? P.plinthL : tone(x, y, z, P.plinth, P.plinthD, P.plinth, 0.15, 0)));
  rbox(v, -3, 2, 2, 2, -3, 2, 0.6, P.goldD);
  for (let y = 3; y <= 5; y++) for (const x of [-1, 0]) for (const z of [-1, 0]) v.set(x, y, z, x < 0 ? P.gold : P.goldD);
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, 6, z, x === -2 || z === 1 ? P.goldL : P.gold);
  for (let y = 7; y <= 14; y++) {
    const r = 2.2 + Math.sqrt(Math.max(0, y - 6.5)) * 1.3;
    for (let x = -6; x <= 5; x++)
      for (let z = -6; z <= 5; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > r) continue;
        if (y >= 13 && d < r - 1.1) continue; // open top
        const lit = x + 0.5 < -0.5 * d;
        v.set(x, y, z, y === 14 ? P.goldL : lit ? (d > r - 1 && x < -2 ? P.goldL : P.gold) : P.goldD);
      }
  }
  // handles
  for (const s of [-1, 1]) {
    const X = (k) => (s < 0 ? -7 - k : 6 + k);
    for (let y = 9; y <= 13; y++) v.set(X(y === 9 || y === 13 ? 0 : 1), y, 0, y === 13 ? P.goldL : P.goldD);
    v.set(X(0), 9, 0, P.goldD); v.set(X(0), 13, 0, P.gold);
  }
  // star emblem
  const zf = 6;
  for (const [x, y] of [[0, 11], [-1, 10], [0, 10], [1, 10], [-2, 10], [-1, 9], [0, 9], [-1, 8], [1, 8], [0, 12]]) v.set(x, y, zf, P.goldL);
  return v;
}

// ------------------------------------------------------------------ pajamas
// Striped flannel: vertical cream stripes on soft blue, with a little flannel noise.
const flannel = (x, y, z, ax = x) => {
  if (((ax % 3) + 3) % 3 === 0) return hash3(x, y, z) < 0.15 ? P.pjSD : P.pjS;
  return tone(x, y, z, P.pj, P.pjD, P.pjL, 0.12, 0.1);
};
function pajamaTopModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = x + 0.5;
    if (z >= 1 && y >= 3 && Math.abs(fx) <= (y - 2.6) * 0.7) return creamT(x, y, z); // little V at the collar
    if (z >= 1 && y >= 3 && Math.abs(fx) <= (y - 2.6) * 0.7 + 1) return P.pjP; // piping
    if (y === -2) return P.pjP; // hem piping
    if (z >= 2 && x === 0 && y < 3) return P.pjP; // button placket
    return flannel(x, y, z, z <= -3 ? x : x);
  };
  torsoShell(v, col);
  for (const y of [2, 0]) v.set(0, y, 5, P.pjB);
  // breast pocket with a stitched fish
  for (const x of [-4, -3, -2]) v.set(x, 2, 4, P.pjP);
  v.set(-3, 3, 4, P.pjS);
  // rounded collar flaps
  v.set(-3, 5, 4, P.pjP); v.set(-2, 5, 4, P.pjL); v.set(1, 5, 4, P.pjL); v.set(2, 5, 4, P.pjP);
  return v;
}
function pjUpper() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -4, 1, -1, 1, 0.9, (x, y, z) => flannel(x, y, z, x + z));
  return v;
}
function pjFore() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -3, 0, -1, 1, 0.8, (x, y, z) => (y === -3 ? P.pjP : flannel(x, y, z, x + z)));
  return v;
}
// pajama trousers over the fox's legs (same silhouettes as foxRig thigh / shin, feet stay furry socks)
function pjThigh() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -3, 1, -2, 1, 1.2, (x, y, z) => flannel(x, y, z, x + z));
  return v;
}
function pjShin() {
  const v = new VoxelModel();
  const S = (x, y, z) => tone(x, y, z, P.sock, P.sockD, P.sockL);
  rbox(v, -2, 1, -2, 0, -2, 1, 1.0, (x, y, z) => (y === -2 ? P.pjP : flannel(x, y, z, x + z)));
  rbox(v, -2, 1, -3, -2, -2, 3, 0.8, (x, y, z) => (y === -2 && z <= 1 ? P.pjP : S(x, y, z)));
  for (const x of [-1, 0]) v.set(x, -2, 3, P.sockD);
  v.set(-2, -3, 3, P.sockL); v.set(1, -3, 3, P.sockL); v.set(-1, -3, 4, P.sock); v.set(0, -3, 4, P.sock);
  return v;
}
// Nightcap: fluffy cuff + the lower cone; the floppy tip with its pompom swings (capTipModel).
function nightcapModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 1; y++)
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > 4.6) continue;
        v.set(x, y, z, hash3(x, y, z) < 0.3 ? P.pomD : P.capS);
      }
  for (let y = 2; y <= 6; y++) {
    const r = 4.1 - (y - 2) * 0.62;
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const dx = x + 0.5, dz = z + 0.5 + (y - 2) * 0.25;
        if (Math.hypot(dx, dz) > r) continue;
        v.set(x, y, z, dx < -1.2 ? P.capL : dx > 1.6 ? P.capD : tone(x, y, z, P.cap, P.capD, P.capL, 0.12, 0.1));
      }
  }
  return v;
}
function capTipModel() {
  const v = new VoxelModel();
  for (let y = 0; y >= -6; y--) {
    const r = 1.5 - (-y) * 0.15;
    for (let x = -2; x <= 1; x++)
      for (let z = -2; z <= 1; z++) {
        if (Math.hypot(x + 0.5, z + 0.5) > r + 0.2) continue;
        v.set(x, y, z, x < 0 ? P.capL : tone(x, y, z, P.cap, P.capD, P.cap, 0.15, 0));
      }
  }
  rbox(v, -2, 1, -10, -7, -2, 1, 1.3, (x, y, z) => (hash3(x, y, z) < 0.3 || x > 0 ? P.pomD : P.pom));
  return v;
}
// Toothbrush: blue handle, white bristles facing +z with a blob of foamy paste.
function toothbrushModel() {
  const v = new VoxelModel();
  const sq = (y, c) => { for (const x of [-1, 0]) for (const z of [-1, 0]) v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  for (let y = 3; y >= -9; y--) sq(y, (x, yy, z) => (x < 0 && z === 0 ? P.brushL : yy % 4 === 0 ? P.bristle : P.brush));
  sq(-10, P.brushD);
  for (let y = -11; y >= -15; y--) sq(y, (x) => (x < 0 ? P.brushL : P.brush));
  for (let y = -11; y >= -15; y--) for (const x of [-1, 0]) { v.set(x, y, 1, P.bristle); v.set(x, y, 2, (x + y) & 1 ? P.bristleT : P.bristle); }
  // foam blob
  for (const [x, y, z] of [[-1, -12, 3], [0, -12, 3], [-1, -13, 3], [0, -13, 3], [-1, -14, 3], [0, -14, 3], [-1, -13, 4], [0, -12, 4], [-2, -13, 3], [1, -14, 3], [0, -15, 3]]) v.set(x, y, z, (x + y + z) & 1 ? P.foam : P.foamD);
  return v;
}

// ------------------------------------------------------------------ scientist
// Long starched lab coat with notch lapels over a pale blue shirt and Reynard's purple bow tie,
// a pocket protector full of pens, an ID badge and a back vent.
const coatT = (x, y, z) => tone(x, y, z, P.coat, P.coatD, P.coatL, 0.1, 0.12);
function labCoatModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = x + 0.5;
    if (z >= 1 && y >= 0) {
      const w = (y + 0.6) * 0.62; // open V down to the second button
      if (Math.abs(fx) <= w - 0.9) return tone(x, y, z, P.sky, P.skyD, P.sky, 0.12, 0);
      if (Math.abs(fx) <= w + 0.6) return y >= 3 ? P.coatL : P.coatD; // lapel edge
      if (Math.abs(fx) <= w + 1.4 && y >= 2) return P.coatDD; // lapel fold shadow
    }
    if (z >= 2 && y < 0 && fx > -0.2 && fx < 0.9) return P.coatDD; // closing edge
    if (y === -2) return P.coatD;
    if (z <= -3 && x === -1 && y >= -1) return P.coatD; // back seam
    return coatT(x, y, z);
  };
  torsoShell(v, col);
  // long skirt to mid thigh, flaring a little, open at the front, vent at the back
  for (let y = -3; y >= -6; y--) {
    const fl = (-3 - y) * 0.35;
    rbox(v, Math.floor(-5 - fl), Math.ceil(4 + fl), y, y, -4, 3 + Math.round(fl * 0.6), 1.4, (x, yy, z) => {
      if (z >= 2 && (x === -1 || x === 0)) return y <= -4 ? null : P.coatDD; // null = no voxel: open front
      if (z <= -3 && (x === -1 || x === 0) && y <= -4) return null;
      if (y === -6) return P.coatDD;
      return z >= 2 && x === 1 ? P.coatD : coatT(x, yy, z);
    });
  }
  // two coat buttons
  v.set(1, -1, 4, P.coatDD); v.set(1, -3, 4, P.coatDD);
  // shirt collar + purple bow tie
  v.set(-2, 6, 4, P.coatL); v.set(1, 6, 4, P.coatL);
  for (let y = 4; y <= 5; y++) {
    for (const x of [-3, -2, 1, 2]) v.set(x, y, 5, (x === -3 || x === 2) && y === 5 ? P.bowD : P.bow);
    v.set(-1, y, 5, P.bowD); v.set(0, y, 5, P.bowD);
    v.set(-1, y, 6, P.bow); v.set(0, y, 6, P.bowL);
  }
  v.set(-2, 6, 5, P.bowL); v.set(1, 6, 5, P.bow);
  // breast pocket (Reynard's left) with a pocket protector: red + blue pens and a pencil
  for (const x of [1, 2, 3]) { v.set(x, 1, 5, P.coatDD); v.set(x, 2, 5, P.coatD); }
  v.set(1, 3, 5, P.pen); v.set(1, 4, 5, P.penD);
  v.set(2, 3, 5, P.pen2); v.set(2, 4, 5, P.ink);
  v.set(3, 3, 5, P.pencil); v.set(3, 4, 5, P.eraser);
  // ID badge on his right: cyan card with a tiny fox head
  for (let y = 0; y <= 2; y++) for (const x of [-4, -3]) v.set(x, y, 5, y === 2 ? P.badgeD : P.badge);
  v.set(-4, 1, 6, P.fur); v.set(-3, 1, 6, P.coatL); v.set(-4, 3, 5, P.steelD);
  // hip pockets
  for (const x of [-4, -3, 2, 3]) { v.set(x, -3, 4, P.coatDD); }
  return v;
}
function labUpper() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -4, 1, -1, 1, 0.9, (x, y, z) => (y === 1 || (y === 0 && x !== 0) ? P.coatD : coatT(x, y, z)));
  return v;
}
function labFore() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -3, 0, -1, 1, 0.8, (x, y, z) => (y === -3 ? P.coatDD : y === -2 && z === 1 && x === 0 ? P.coatDD : coatT(x, y, z)));
  return v;
}
// Goggles pushed up on top of the head: two brass-rimmed cyan lenses tilted up and forward,
// on a dark strap that wraps around the back of the head. Pivot at the hat seat.
function gogglesModel() {
  const v = new VoxelModel();
  const n = new THREE.Vector3(0, 0.5, 0.87).normalize(); // lenses look up and forward
  const C = [[-3.6, 1.2, 4.2], [2.6, 1.2, 4.2]];
  const d = new THREE.Vector3();
  for (const c of C) {
    for (let x = -9; x <= 8; x++)
      for (let y = -4; y <= 6; y++)
        for (let z = -1; z <= 9; z++) {
          d.set(x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]);
          const ax = d.dot(n);
          if (ax < -1.2 || ax > 1.3) continue;
          const rad = Math.sqrt(Math.max(0, d.lengthSq() - ax * ax));
          if (rad > 3.3) continue;
          let col;
          if (rad > 2.2) col = ax > 0.2 ? (d.x + d.y * 0.5 < -1 ? P.rimL : d.x + d.y * 0.5 > 1.2 ? P.rimD : P.rim) : P.rimD;
          else if (ax > -0.2) col = (d.x < -0.3 && d.y > 0.2) || (d.x < -1 && d.y > -0.5) ? P.glassL : rad > 1.5 ? P.glassD : P.glass;
          else col = P.strapD;
          v.set(x, y, z, col);
        }
  }
  // bridge between the lenses
  for (const x of [-1, 0]) { v.set(x, 1, 5, P.rimD); v.set(x, 2, 5, P.rim); }
  // strap: hugs the sides and back of the head just under the crown
  for (let x = -9; x <= 8; x++)
    for (let z = -8; z <= 6; z++) {
      const dx = Math.max(Math.abs(x + 1) - 6.0, 0), dz = Math.max(Math.abs(z + 0.5) - 5.0, 0);
      const r = Math.hypot(dx, dz);
      if (r < 1.0 || r > 2.0) continue;
      if (z > 3) continue; // the front is the lenses
      for (const y of [-1, 0]) v.set(x, y, z, y === 0 ? (x < -2 ? P.strapL : P.strap) : P.strapD);
    }
  return v;
}

// Magnifying glass: dark grip, brass ferrule, brass ring with a cyan-tinted lens at the tip.
function magnifierModel() {
  const v = new VoxelModel();
  const sq = (y, c) => { for (const x of [-1, 0]) for (const z of [-1, 0]) v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  sq(3, P.strapD);
  for (let y = 2; y >= -5; y--) sq(y, (x, yy, z) => (x < 0 && z === 0 ? P.strapL : (yy & 1) ? P.strap : P.strapD));
  sq(-6, (x) => (x < 0 ? P.rimL : P.rim)); sq(-7, P.rimD);
  // ring + lens in the x-y plane, centred below the ferrule
  const cy = -12;
  for (let x = -6; x <= 5; x++)
    for (let y = cy - 6; y <= cy + 5; y++) {
      const r = Math.hypot(x + 0.5, y + 0.5 - cy);
      if (r > 5.2) continue;
      if (r > 4.0) { for (const z of [-1, 0]) v.set(x, y, z, x + (y - cy) < -2 ? P.rimL : x + (y - cy) > 3 ? P.rimD : P.rim); continue; }
      const glint = (x === -3 && y - cy === 2) || (x === -2 && y - cy === 3) || (x === -3 && y - cy === 3) || (x === 1 && y - cy === -2);
      v.set(x, y, 0, glint ? P.glassL : r > 2.9 ? P.glassD : P.glass);
    }
  return v;
}
// Yellow hex pencil: pink eraser up top, sharpened wood + graphite tip down -y.
function pencilModel() {
  const v = new VoxelModel();
  const sq = (y, c) => { for (const x of [-1, 0]) for (const z of [-1, 0]) v.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c); };
  sq(5, (x) => (x < 0 ? P.eraser : P.eraserD)); sq(4, (x) => (x < 0 ? P.eraser : P.eraserD));
  sq(3, P.steelD);
  for (let y = 2; y >= -7; y--) sq(y, (x, yy, z) => (x < 0 && z === 0 ? P.pencilL : x > -1 && z < 0 ? P.pencilD : P.pencil));
  sq(-8, P.shav); v.set(-1, -9, 0, P.shav); v.set(0, -9, -1, P.shav); v.set(-1, -9, -1, P.lead);
  v.set(-1, -10, -1, P.lead);
  return v;
}
// Clipboard: board in the x-y plane (paper on +z), steel clip at the top. Origin at the board centre.
function clipboardModel() {
  const v = new VoxelModel();
  for (let x = -7; x <= 6; x++)
    for (let y = -9; y <= 8; y++) {
      const edge = x === -7 || x === 6 || y === -9 || y === 8;
      v.set(x, y, 0, edge ? (x === -7 || y === 8 ? P.boardL : P.boardD) : tone(x, y, 0, P.board, P.boardD, P.boardL, 0.12, 0.08));
      if (x >= -6 && x <= 5 && y >= -8 && y <= 6) {
        let c = (y & 1) === 0 && y < 3 && x > -6 && x < 5 ? P.line : P.paper;
        if (y === 4 && x > -6 && x < 3) c = P.ink; // heading
        if (x === 5 || y === -8) c = P.paperD;
        v.set(x, y, 1, c);
      }
    }
  // tiny orange fish doodle + a green tick
  for (const [x, y] of [[-4, -5], [-3, -5], [-2, -5], [-3, -4], [-3, -6], [-1, -5], [0, -4], [0, -6]]) v.set(x, y, 1, P.doodle);
  for (const [x, y] of [[2, -6], [3, -7], [4, -6], [5, -5]]) v.set(x, y, 1, P.herb);
  // clip
  for (let x = -3; x <= 2; x++) for (let y = 6; y <= 9; y++) v.set(x, y, 1, y === 9 ? P.steelD : x === -3 ? P.steelL : P.steel);
  for (let x = -2; x <= 1; x++) v.set(x, 8, 2, P.steelD);
  v.set(-1, 10, 1, P.steelD); v.set(0, 10, 1, P.steelD);
  return v;
}

// ------------------------------------------------------------------ cached geometry
const GEO = new Map();
function geo(key, build, pivot, scale) {
  let g = GEO.get(key);
  if (!g) {
    g = build().build({ pivot, scale });
    GEO.set(key, g);
  }
  return g;
}

/**
 * Body-part geometry for an outfit (built on first use, shared by every rig).
 * 'default' returns null: the rig keeps its own waistcoat / top hat.
 * `extras.tassel` (teacher): { cord, hang, cordPos, pivot } meshes in fine voxels.
 */
export function outfitParts(name) {
  if (name === 'teacher') {
    const up = geo('t_up', () => upperSleeve('teacher'), [0.5, 0, 0.5], VS);
    const fo = geo('t_fo', () => foreSleeve('teacher'), [0.5, 0, 0.5], VS);
    return {
      hat: geo('t_hat', mortarboardModel, [0, 0, 0], VS),
      hatTop: 5.2, // voxels above the hat seat (headTop)
      hatTilt: [-0.06, 0, 0.1], // jaunty
      earSpread: 0.9, // ears tilt out sideways under the board
      torso: geo('t_torso', cardiganModel, [0, 0, 0], VS),
      upperL: up, upperR: up, foreL: fo, foreR: fo,
      tassel: {
        cord: geo('t_cord', tasselCordModel, [0, 0, 0], FV),
        hang: geo('t_hang', tasselModel, [0, 0, 0], FV),
        cordPos: [0.5 * FV, 4 * VS, 0.5 * FV], // hat space: on the board top, from the button
        pivot: [6.6 * VS, 4 * VS, 6.6 * VS], // board corner the tassel hangs from
      },
    };
  }
  if (name === 'chef') {
    const up = geo('c_up', () => upperSleeve('chef'), [0.5, 0, 0.5], VS);
    const fo = geo('c_fo', () => foreSleeve('chef'), [0.5, 0, 0.5], VS);
    return {
      hat: geo('c_hat', toqueModel, [0, 0, 0], VS),
      hatTop: 14.2,
      hatTilt: [0, 0, -0.04],
      earSpread: 0,
      torso: geo('c_torso', chefJacketModel, [0, 0, 0], VS),
      upperL: up, upperR: up, foreL: fo, foreR: fo,
      tassel: null,
    };
  }
  if (name === 'pajamas') {
    return {
      hat: geo('j_hat', nightcapModel, [0, 0, 0], VS),
      hatTop: 7.5,
      hatTilt: [-0.12, 0, 0.14],
      earSpread: 0.55, // ears tuck out under the cuff
      torso: geo('j_torso', pajamaTopModel, [0, 0, 0], VS),
      upperL: geo('j_up', pjUpper, [0.5, 0, 0.5], VS), upperR: geo('j_up', pjUpper, [0.5, 0, 0.5], VS),
      foreL: geo('j_fo', pjFore, [0.5, 0, 0.5], VS), foreR: geo('j_fo', pjFore, [0.5, 0, 0.5], VS),
      thigh: geo('j_th', pjThigh, [0, 0, 0], VS), shin: geo('j_sh', pjShin, [0, 0, 0], VS),
      noMonocle: true,
      tassel: null,
      // floppy tip of the cap: hangs from the cone's top on its own pendulum, flopped over to his left
      dangle: { geo: geo('j_tip', capTipModel, [0, 0, 0], VS), pivot: [0, 6.6 * VS, -1.0 * VS], tilt: 0.8 },
    };
  }
  if (name === 'scientist') {
    const up = geo('s_up', labUpper, [0.5, 0, 0.5], VS);
    const fo = geo('s_fo', labFore, [0.5, 0, 0.5], VS);
    return {
      hat: geo('s_hat', gogglesModel, [0, 0, 0], VS),
      hatTop: 3.2,
      hatTilt: [-0.05, 0, 0.04],
      earSpread: 0.12,
      torso: geo('s_torso', labCoatModel, [0, 0, 0], VS),
      upperL: up, upperR: up, foreL: fo, foreR: fo,
      tassel: null,
    };
  }
  return null;
}

const PROP_DEF = {
  // tip/axis in prop space (world units); the prop hangs along -y from the grip
  pointer: { build: pointerModel, pivot: [0, 0, 0], tip: [0, -25.4, 0], len: 25.4 },
  chalk: { build: chalkModel, pivot: [0, 0, 0], tip: [0, -6.2, 0], len: 6.2 },
  ladle: { build: ladleModel, pivot: [0, 0, 0], tip: [0, -14.5, 5], len: 15 },
  toothbrush: { build: toothbrushModel, pivot: [0, 0, 0], tip: [0, -13, 2], len: 13 },
  magnifier: { build: magnifierModel, pivot: [0, 0, 0], tip: [0, -12, 0], len: 12 },
  pencil: { build: pencilModel, pivot: [0, 0, 0], tip: [0, -10, 0], len: 10 },
  // not a paw prop: FishScope hangs it on the left grip itself (origin = board centre)
  clipboard: { build: clipboardModel, pivot: [0, 0, 0], tip: [0, 0, 1], len: 0.5 },
};

/** Geometry + metadata of a hand prop: { geo, tip (Vector3, prop space), axis (unit Vector3), len (world units) }. */
export function propParts(name) {
  const d = PROP_DEF[name];
  if (!d) return null;
  return {
    geo: geo('p_' + name, d.build, d.pivot, FV),
    tip: new THREE.Vector3(d.tip[0] * FV, d.tip[1] * FV, d.tip[2] * FV),
    axis: new THREE.Vector3(0, -1, 0),
    len: d.len * FV,
  };
}

let cupMat = null;
/** Placeholder gold trophy cup (origin at the base centre, front = +z), about 0.3 x 0.38 world units. */
export function makeGoldCup() {
  if (!cupMat) cupMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1c00 });
  const g = new THREE.Group();
  g.name = 'goldCup';
  const m = new THREE.Mesh(geo('cup', goldCupModel, [0, 0, 0], FV), cupMat);
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Free every cached outfit / prop geometry (the rig calls this when its last instance is disposed). */
export function disposeFoxProps() {
  for (const g of GEO.values()) g.dispose();
  GEO.clear();
}
