// Homestead props for the meadow villagers (Clover the bunny, Otis the otter,
// Hazel the hedgehog) plus a few sprite helpers their rigs share. Same
// conventions as npcProps.js: fine 0.025 voxels, Lambert + grain, geometry
// built lazily on first use and shared between copies (don't dispose it).
// Every maker returns a THREE.Group with shadows, origin at the bottom centre,
// front = +Z, sized for 1-unit tiles.
//
//   makeGardenPatch()  fenced veggie bed (carrots, cabbages, a radish), watering can, seed-packet stand.  ~1.1 x 0.75
//   makeFishingDock()  short plank jetty on posts + bucket of fish, tackle box, a little sign.  ~0.8 x 1.25 (jetty runs to -Z)
//   makeBakeryCart()   wheeled cart, striped awning, pies, a bread loaf, a steaming kettle. userData.steam (spout tip, local).  ~1.0 x 1.15
import * as THREE from 'three';
import {
  FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, matFor, grainMaterial, spriteTexture,
  sin, cos, abs, PI, floor,
} from './critterKit.js';

// ------------------------------------------------------------------ sprite helpers (rigs)
const spCache = new Map();
/** SpriteMaterial for pixel rows with a custom palette (cached per rows array). */
export function spriteMatPal(rows, pal) {
  let m = spCache.get(rows);
  if (!m) { m = new THREE.SpriteMaterial({ map: spriteTexture(rows, pal), alphaTest: 0.5 }); spCache.set(rows, m); }
  return m;
}
export const DIRT_PAL = { k: '#3a2214', d: '#7a4a2a', D: '#5a341c', l: '#a8703e' };
export const DIRT_ROWS = ['.kkk.', 'kdlDk', 'kldDk', 'kDDDk', '.kkk.'];
export const DIRT2_ROWS = ['.kk.', 'kldk', 'kdDk', '.kk.'];
export const FLOUR_PAL = { k: '#c8bca8', w: '#ffffff', W: '#f2ece0' };
export const FLOUR_ROWS = ['..kk...', '.kwwk..', 'kwwWwk.', 'kwWWwwk', '.kwwWk.', '..kkk..'];
export const STEAM_PAL = { k: '#b8c8d8', w: '#ffffff', W: '#e4eef6' };
export const STEAM_ROWS = ['...k..', '..kwk.', '.kwWk.', '.kwk..', 'kwWk..', 'kwk...', '.k....'];
export const RIPPLE_PAL = { k: '#3a78a8', w: '#e8f8ff', b: '#9ad4f0' };
export const RIPPLE_ROWS = ['..kkkkk..', '.kbwwwbk.', 'kbw...wbk', '.kbwwwbk.', '..kkkkk..'];
export const PEBBLE_PAL = { k: '#3a3a44', g: '#9a9aa8', G: '#c8c8d4', d: '#6a6a78' };
export const STAR_PAL = { k: '#6a3a10', y: '#ffd23a', Y: '#fff6b0' };
export const STAR_ROWS = ['...k...', '..kyk..', 'kkyYykk', 'kyYYYyk', '.kyyyk.', 'kyk.kyk', 'kk...kk'];

// ------------------------------------------------------------------ prop plumbing
const geoMemo = new Map();
function memoGeo(key, build, pivot = [0, 0, 0], scale = FV) {
  let g = geoMemo.get(key);
  if (!g) { g = buildGeo(build(), pivot, scale); geoMemo.set(key, g); }
  return g;
}
function meshOf(geo, { shadows = true, emissive = 0, amount = 0.08 } = {}) {
  const m = new THREE.Mesh(geo, emissive ? grainMaterial(geo.userData.scale, geo.userData.grain, amount, emissive) : matFor(geo, amount));
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}
function group(name, ...meshes) {
  const g = new THREE.Group();
  g.name = name;
  for (const m of meshes) g.add(m);
  return g;
}

const W = {
  wood: 0xa8743e, woodD: 0x86582c, woodL: 0xc48c52, woodDD: 0x5e3c1e,
  oak: 0xc89a5a, oakD: 0xa0763a, oakL: 0xdcb070,
  grey: 0x8a8a96, greyD: 0x6a6a78, greyL: 0xb4b4c0, iron: 0x3a3a42, ironL: 0x5a5a66,
  brass: 0xe0b040, brassD: 0xb08020, brassL: 0xffe080,
  white: 0xfaf6ea, whiteD: 0xe0dac8, cream: 0xf4e8c8, creamD: 0xdccca4,
  soil: 0x6a4228, soilD: 0x4e2e1a, soilL: 0x8a5a36,
  leaf: 0x5aae3c, leafD: 0x3e8a2c, leafL: 0x86d05a, cab: 0x9ad06a, cabD: 0x6aa84a, cabL: 0xc4ec94,
  carrot: 0xf08a2a, carrotD: 0xc8641a, carrotL: 0xffb05a, radish: 0xe8486a, radishD: 0xb82e4e,
  red: 0xd8403a, redD: 0xa82a28, pink: 0xf08aa8, pinkL: 0xffc0d0, yellow: 0xffd84a, blue: 0x3a7ad8, blueL: 0x8ab8f0,
  teal: 0x5ac0b0, tealD: 0x3a9a8c, tealL: 0x9ae6d8, green: 0x4caa3c, greenD: 0x2e7a2c,
  water: 0x4a9ad0, waterD: 0x2e74a8, waterL: 0x8acaf0,
  fish: 0x7ab8d8, fishD: 0x4a88b0, fishL: 0xc8e8f4, fishO: 0xf0a040, fishOD: 0xc87a28, eye: 0x1e1018,
  tackle: 0x3a8a4a, tackleD: 0x2a6a38, tackleL: 0x5aaa6a,
  awnA: 0xf0e0c0, awnB: 0xe86a7a, awnBD: 0xc84a5a, cart: 0x7ac0d8, cartD: 0x5a9ab8, cartL: 0xa8dcec,
  crust: 0xe8a858, crustD: 0xc07a34, crustL: 0xf8cc84, berry: 0x8a2a6a, berryL: 0xc04a8a, cherry: 0xd8303a, cherryL: 0xff6a6a,
  bread: 0xd8904a, breadD: 0xa8642a, breadL: 0xf0b874, kettle: 0x4a8ac8, kettleD: 0x2e64a0, kettleL: 0x8ac0f0,
};
const plank = (x, y, z) => tone(x, y, z, W.wood, W.woodD, W.woodL, 0.14, 0.1);
const oakc = (x, y, z) => tone(x, y, z, W.oak, W.oakD, W.oakL, 0.14, 0.1);
const soilc = (x, y, z) => tone(x, y, z, W.soil, W.soilD, W.soilL, 0.2, 0.12);

// ------------------------------------------------------------------ garden patch
function carrot(v, cx, cz, y0, lean = 0) {
  // orange shoulders peeking out of the soil + a frilly leaf top
  for (let x = cx - 1; x <= cx; x++) for (let z = cz - 1; z <= cz; z++) v.set(x, y0, z, (x + z) % 2 ? W.carrot : W.carrotL);
  v.set(cx - 1, y0 + 1, cz - 1, W.carrotD); v.set(cx, y0 + 1, cz, W.carrot);
  const fr = [[0, 2, 0], [0, 3, 0], [-1, 4, 0], [1, 4, 0], [-1, 5, -1], [1, 5, 1], [0, 5, 0], [-2, 6, 0], [2, 6, 0], [0, 6, 1], [lean, 7, 0]];
  for (const [dx, dy, dz] of fr) v.set(cx + dx, y0 + dy, cz + dz, dy > 5 ? W.leafL : (dx + dy) % 2 ? W.leaf : W.leafD);
}
function cabbage(v, cx, cz, y0) {
  ell(v, cx, y0 + 2.6, cz, 3.6, 2.8, 3.6, (x, y, z) => {
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (y > y0 + 3 && r < 1.8) return W.cabL;
    return (floor(Math.atan2(z + 0.5 - cz, x + 0.5 - cx) * 2.2) + y) % 3 === 0 ? W.cabD : W.cab;
  });
  // floppy outer leaves
  for (const [dx, dz] of [[-4, 0], [3, 0], [0, -4], [0, 3], [-3, 3], [3, -3]]) { v.set(cx + dx, y0 + 1, cz + dz, W.leafD); v.set(cx + dx + Math.sign(dx), y0 + 1, cz + dz + Math.sign(dz), W.cabD); }
}
function gardenModel() {
  const v = new VoxelModel();
  const X0 = -18, X1 = 17, Z0 = -12, Z1 = 11;
  // raised bed frame (planks) + soil with furrows
  for (let x = X0; x <= X1; x++)
    for (let z = Z0; z <= Z1; z++) {
      const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
      for (let y = 0; y <= 3; y++) {
        if (edge) v.set(x, y, z, y === 3 ? W.woodL : (x === X0 || x === X1) && (z === Z0 || z === Z1) ? W.woodDD : y === 0 ? W.woodD : plank(x, y, z));
        else if (y <= 2) v.set(x, y, z, y === 2 && (z + 40) % 6 === 0 ? W.soilD : soilc(x, y, z));
      }
      if (!edge && (z + 40) % 6 === 3) v.set(x, 3, z, soilc(x, 3, z)); // mounded rows
    }
  // carrots (back two rows), cabbages (front), a radish poking out
  for (const [x, z] of [[-14, -9], [-9, -9], [-4, -9], [1, -9], [6, -9], [-12, -3], [-7, -3]]) carrot(v, x, z, 4, (x & 1) ? 1 : -1);
  for (const [x, z] of [[-12, 6], [-4, 6], [4, 6]]) cabbage(v, x, z, 3);
  for (let x = 2; x <= 3; x++) for (let z = -4; z <= -3; z++) v.set(x, 4, z, (x + z) % 2 ? W.radish : W.radishD);
  v.set(2, 5, -4, W.leaf); v.set(3, 6, -3, W.leafL); v.set(2, 6, -3, W.leaf);
  // a little bare spot with a sprout (just planted)
  v.set(11, 4, -3, W.leafL); v.set(10, 5, -3, W.leaf); v.set(12, 5, -3, W.leafL); v.set(11, 4, 1, W.leaf); v.set(12, 5, 1, W.leafL);
  // picket fence along the back + the left side (rounded tops, white wash)
  const picket = (x, z) => { for (let y = 0; y <= 12; y++) v.set(x, y, z, y === 12 ? W.whiteD : y < 2 ? W.creamD : (x + y + z) % 7 === 0 ? W.creamD : W.white); };
  for (let x = X0; x <= X1; x += 3) picket(x, Z0 - 2);
  for (let z = Z0 + 1; z <= Z1; z += 3) picket(X0 - 2, z);
  for (let x = X0; x <= X1; x++) { v.set(x, 5, Z0 - 2, W.whiteD); v.set(x, 9, Z0 - 2, W.whiteD); }
  for (let z = Z0 - 2; z <= Z1; z++) { v.set(X0 - 2, 5, z, W.whiteD); v.set(X0 - 2, 9, z, W.whiteD); }
  // morning glory vine on the back fence
  for (let x = X0 + 1; x <= X0 + 14; x++) {
    const y = 7 + Math.round(sin(x * 0.7) * 1.6);
    v.set(x, y, Z0 - 1, (x & 1) ? W.leaf : W.leafD);
    if (x % 4 === 0) { v.set(x, y + 1, Z0 - 1, W.blueL); v.set(x + 1, y + 1, Z0 - 1, W.blue); v.set(x, y + 2, Z0 - 1, W.blueL); }
  }
  // a bird-scaring pinwheel on a stick in the corner
  for (let y = 4; y <= 20; y++) v.set(X1 - 2, y, Z0 + 2, W.woodD);
  for (const [dx, dy, c] of [[0, 1, W.red], [0, 2, W.red], [1, 0, W.yellow], [2, 0, W.yellow], [0, -1, W.blue], [0, -2, W.blue], [-1, 0, W.green], [-2, 0, W.green], [1, 1, W.red], [1, -1, W.yellow], [-1, -1, W.blue], [-1, 1, W.green]])
    v.set(X1 - 2 + dx, 21 + dy, Z0 + 3, c);
  v.set(X1 - 2, 21, Z0 + 4, W.white);
  return v;
}
function canModel() {
  // mint watering can (spout to +Z), sitting on the ground
  const v = new VoxelModel();
  for (let y = 0; y <= 7; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > 3.9) continue;
        v.set(x, y, z, y === 0 || y === 7 ? W.tealD : y === 2 || y === 5 ? (r > 3.2 ? W.tealD : W.teal) : x <= -2 && z >= 0 ? W.tealL : W.teal);
      }
  for (let k = 0; k <= 6; k++) { v.set(-1, 2 + k, 4 + k, W.teal); v.set(0, 2 + k, 4 + k, W.tealD); }
  for (let x = -2; x <= 1; x++) for (let y = 8; y <= 10; y++) v.set(x, y, 11, (x + y) % 2 ? W.brass : W.brassD);
  for (let z = -3; z <= 2; z++) v.set(-1, 11, z, W.tealD);
  v.set(-1, 9, -3, W.tealD); v.set(-1, 10, -3, W.tealD); v.set(-1, 9, 2, W.tealD); v.set(-1, 10, 2, W.tealD);
  return v;
}
function seedStandModel() {
  // little A-frame stand with seed packets clipped on (colourful), a chalk price tag
  const v = new VoxelModel();
  for (let y = 0; y <= 18; y++) for (const x of [-7, 6]) { v.set(x, y, Math.round(-y * 0.12) - 1, plank(x, y, 0)); v.set(x, y, Math.round(y * 0.12) + 3, W.woodD); }
  for (let x = -7; x <= 6; x++) for (let y = 4; y <= 18; y++) v.set(x, y, Math.round(-y * 0.12), (x === -7 || x === 6 || y === 4 || y === 18) ? W.woodD : oakc(x, y, 0));
  const packs = [[-5, 13, W.carrot, W.leaf], [-1, 13, W.radish, W.leafL], [3, 13, W.yellow, W.leafD], [-5, 6, W.pink, W.leaf], [-1, 6, W.blueL, W.leafL], [3, 6, W.cabL, W.leafD]];
  for (const [px, py, c, c2] of packs)
    for (let x = px; x <= px + 2; x++)
      for (let y = py; y <= py + 4; y++) {
        const z = Math.round(-y * 0.12) + 1;
        v.set(x, y, z, y === py + 4 ? W.white : y >= py + 1 && y <= py + 2 && x === px + 1 ? c2 : y === py + 3 && x === px + 1 ? c : y === py ? W.whiteD : (x === px + 1 && y === py + 1) ? c2 : c);
      }
  // little roof
  for (let x = -8; x <= 7; x++) { v.set(x, 19, -3, W.red); v.set(x, 19, -2, W.redD); v.set(x, 20, -2, W.red); }
  return v;
}
/** Clover's veggie bed: picket fence, carrots, cabbages, a pinwheel, a watering can and a seed-packet stand. */
export function makeGardenPatch() {
  const g = group('GardenPatch', meshOf(memoGeo('garden_bed', gardenModel)));
  const can = meshOf(memoGeo('garden_can', canModel));
  can.position.set(0.52, 0, 0.32); can.rotation.y = -0.7;
  const stand = meshOf(memoGeo('garden_seeds', seedStandModel));
  stand.position.set(-0.62, 0, 0.28); stand.rotation.y = 0.5;
  g.add(can, stand);
  return g;
}

// ------------------------------------------------------------------ fishing dock
function dockModel() {
  const v = new VoxelModel();
  const X0 = -11, X1 = 10, Z0 = -46, Z1 = 4, DY = 6;
  // posts with rope wraps, sunk into the ground / water
  for (const x of [X0, X1])
    for (const z of [Z0, Z0 + 16, Z0 + 32, Z1])
      for (let y = -6; y <= DY + 4; y++) for (let dx = 0; dx <= 1; dx++) v.set(x + (x < 0 ? -dx : dx), y, z, y === DY + 4 ? W.woodL : y === DY + 2 ? W.cream : y < 0 ? W.woodDD : plank(x, y, z));
  // deck planks across x, small gaps, a couple of odd planks
  for (let z = Z0; z <= Z1; z++) {
    if ((z + 60) % 4 === 3) continue;
    const odd = hash3(0, z >> 2, 5);
    for (let x = X0; x <= X1; x++) v.set(x, DY, z, (x + 60) % 9 === 0 ? W.woodD : odd < 0.2 ? oakc(x, DY, z) : odd > 0.85 ? W.woodL : plank(x, DY, z));
    v.set(X0, DY - 1, z, W.woodD); v.set(X1, DY - 1, z, W.woodD);
  }
  // nail heads
  for (let z = Z0; z <= Z1; z += 4) { v.set(X0 + 1, DY + 1, z, W.ironL); v.set(X1 - 1, DY + 1, z, W.ironL); }
  // steps down at the front
  for (let x = X0 + 2; x <= X1 - 2; x++) { v.set(x, 3, Z1 + 1, plank(x, 3, 0)); v.set(x, 3, Z1 + 2, W.woodL); v.set(x, 0, Z1 + 3, plank(x, 0, 1)); v.set(x, 0, Z1 + 4, W.woodL); }
  // a coil of rope + a life ring hanging on the far post
  for (let a = 0; a < 20; a++) { const x = Math.round(-6 + 2.4 * cos((a / 20) * PI * 2)), z = Math.round(-36 + 2.4 * sin((a / 20) * PI * 2)); v.set(x, DY + 1, z, W.cream); v.set(x, DY + 2, z, a % 3 ? W.creamD : W.cream); }
  for (let a = 0; a < 24; a++) {
    const yy = Math.round(DY + 1 + 4 * sin((a / 24) * PI * 2)), zz = Math.round(Z0 + 1 + 4 * cos((a / 24) * PI * 2));
    for (let w = 0; w <= 1; w++) v.set(X1 + 2, yy + 3, zz + 4 + w * 0, floor(a / 3) % 2 ? W.red : W.white);
  }
  // water under the far end (shallow pool so the jetty reads as a jetty when placed on grass)
  for (let x = X0 - 6; x <= X1 + 6; x++)
    for (let z = Z0 - 6; z <= Z0 + 20; z++) {
      const r = Math.hypot((x + 0.5) / 18, (z - Z0 - 6) / 16);
      if (r > 1) continue;
      v.set(x, 0, z, r > 0.9 ? W.waterD : (x * 3 + z * 7) % 13 === 0 ? W.waterL : W.water);
    }
  // lily pad + flower in the pool
  for (const [x, z] of [[13, -48], [14, -48], [13, -47], [14, -47], [15, -47], [13, -46], [14, -46]]) v.set(x, 1, z, W.leaf);
  v.set(14, 2, -47, W.pinkL); v.set(15, 2, -46, W.pink);
  return v;
}
function bucketModel() {
  // wooden bucket brimming with fish (tails up), iron hoops, rope handle
  const v = new VoxelModel();
  for (let y = 0; y <= 8; y++)
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = 4.2 + y * 0.08;
        if (r > R || (y > 0 && r < R - 1.1)) continue;
        v.set(x, y, z, y === 2 || y === 7 ? W.iron : (floor(Math.atan2(z + 0.5, x + 0.5) * 3) % 2) ? W.wood : W.woodL);
      }
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if (Math.hypot(x + 0.5, z + 0.5) < 3.6) v.set(x, 7, z, W.waterD);
  // fish heads/tails sticking out
  const fishUp = (x, z, c, cD, h) => {
    for (let y = 7; y <= 7 + h; y++) { v.set(x, y, z, y === 7 + h ? cD : c); v.set(x + 1, y, z, y > 7 + h - 2 ? c : W.fishL); }
    v.set(x - 1, 8 + h, z, cD); v.set(x + 2, 8 + h, z, cD);
  };
  fishUp(-2, -1, W.fish, W.fishD, 3); fishUp(1, 1, W.fishO, W.fishOD, 4); fishUp(-1, 2, W.fish, W.fishD, 2);
  v.set(0, 9, -2, W.fishL); v.set(1, 9, -2, W.eye); // one looking out
  for (let a = 0; a <= 10; a++) v.set(Math.round(-4.5 + a * 0.9), 9 + Math.round(sin((a / 10) * PI) * 4), -1, W.cream);
  return v;
}
function tackleModel() {
  // green tackle box, lid propped open with lure trays
  const v = new VoxelModel();
  rbox(v, -6, 5, 0, 4, -3, 2, 0.6, (x, y, z) => (y === 4 ? W.tackleL : y === 2 ? W.tackleD : tone(x, y, z, W.tackle, W.tackleD, W.tackleL, 0.1, 0.1)));
  v.set(-1, 3, 3, W.brass); v.set(0, 3, 3, W.brass);
  // open lid behind, tilted back
  for (let x = -6; x <= 5; x++) for (let k = 0; k <= 5; k++) v.set(x, 5 + k, -3 - Math.round(k * 0.4), k === 5 ? W.tackleD : W.tackle);
  // trays with colourful lures
  const lures = [W.red, W.yellow, W.white, W.blueL, W.carrot, W.pink];
  for (let x = -5; x <= 4; x++) { v.set(x, 5, -2, W.greyL); v.set(x, 5, 1, W.greyL); }
  for (let i = 0; i < 6; i++) { v.set(-5 + i * 2, 5, -1, lures[i]); v.set(-4 + i * 2, 5, 0, lures[(i + 2) % 6]); }
  return v;
}
function dockSignModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 16; y++) v.set(0, y, 0, plank(0, y, 0));
  // fish-shaped board
  for (let x = -6; x <= 7; x++)
    for (let y = 10; y <= 17; y++) {
      const dx = (x + 0.5) / 6, dy = (y - 13.5) / 3.6;
      const body = dx * dx + dy * dy <= 1 && x <= 5;
      const tail = x >= 5 && abs(y - 13.5) <= (x - 4) * 1.1;
      if (!body && !tail) continue;
      v.set(x, y, 1, (x === -4 && y === 15) ? W.eye : body && dx * dx + dy * dy > 0.7 ? W.woodD : oakc(x, y, 1));
    }
  // painted gills + bait text dots
  v.set(-2, 13, 2, W.woodDD); v.set(-2, 14, 2, W.woodDD); v.set(-2, 12, 2, W.woodDD);
  for (const x of [0, 2]) v.set(x, 13, 2, W.red);
  return v;
}
/** Otis's jetty: plank deck on posts over a little pool, rope coil, life ring, bucket of fish, tackle box and a fish sign. Walk-up end at +Z. */
export function makeFishingDock() {
  const g = group('FishingDock', meshOf(memoGeo('dock', dockModel)));
  const deck = 7 * FV;
  const b = meshOf(memoGeo('dock_bucket', bucketModel)); b.position.set(-0.13, deck, -0.25); b.rotation.y = 0.4;
  const t = meshOf(memoGeo('dock_tackle', tackleModel)); t.position.set(0.12, deck, -0.55); t.rotation.y = -0.5;
  const s = meshOf(memoGeo('dock_sign', dockSignModel)); s.position.set(0.36, 0, 0.18); s.rotation.y = -0.3;
  g.add(b, t, s);
  g.userData.deck = deck;
  g.userData.end = new THREE.Vector3(0, deck, -1.1); // far end of the jetty (cast spot)
  return g;
}

// ------------------------------------------------------------------ bakery cart
function cartModel() {
  const v = new VoxelModel();
  const X0 = -18, X1 = 17, Z0 = -9, Z1 = 8, B = 7, TOP = 19;
  // painted box body (sky blue panels, cream trim), counter on top
  for (let x = X0; x <= X1; x++)
    for (let y = B; y <= TOP; y++)
      for (let z = Z0; z <= Z1; z++) {
        const shell = x === X0 || x === X1 || z === Z0 || z === Z1 || y === B;
        if (!shell) continue;
        let c = tone(x, y, z, W.cart, W.cartD, W.cartL, 0.1, 0.08);
        if (y === B || y === TOP || (x === X0 || x === X1) && (z === Z0 || z === Z1)) c = W.cream;
        if (z === Z1 && (x - X0) % 9 === 0) c = W.creamD; // panel seams
        v.set(x, y, z, c);
      }
  for (let x = X0 - 1; x <= X1 + 1; x++) for (let z = Z0 - 1; z <= Z1 + 2; z++) v.set(x, TOP + 1, z, z >= Z1 + 1 || x === X0 - 1 || x === X1 + 1 ? W.woodL : oakc(x, TOP + 1, z));
  // painted pie emblem on the front + scalloped trim
  for (let x = -4; x <= 3; x++) for (let y = 10; y <= 16; y++) { const r = Math.hypot(x + 0.5, (y - 12.5) * 1.3); if (r < 4) v.set(x, y, Z1 + 1, y >= 13 ? (r > 3 ? W.crustD : (x + y) % 2 ? W.crust : W.crustL) : r > 3 ? W.woodD : W.cream); }
  v.set(-1, 15, Z1 + 2, W.cherry); v.set(0, 15, Z1 + 2, W.cherryL);
  for (let x = X0; x <= X1; x++) if ((x + 40) % 3 !== 0) v.set(x, TOP - 1, Z1 + 1, W.creamD);
  // big wheels with spokes (sides), a little front stand leg, push handle at the back
  for (const x of [X0 - 1, X1 + 1])
    for (let y = -1; y <= 13; y++)
      for (let z = -7; z <= 7; z++) {
        const r = Math.hypot(y - 6, z + 0.5);
        if (r > 6.9) continue;
        const sp = abs(y - 6) < 0.6 || abs(z + 0.5) < 0.6 || abs(abs(y - 6) - abs(z + 0.5)) < 0.7;
        if (r > 5.6) v.set(x, y, z, r > 6.3 ? W.iron : W.red);
        else if (sp || r < 1.5) v.set(x, y, z, r < 1.5 ? W.brass : W.white);
      }
  for (let y = 0; y < B; y++) { v.set(-1, y, Z1 - 1, W.woodD); v.set(0, y, Z1 - 1, W.woodD); }
  for (let x = X0 + 2; x <= X1 - 2; x++) v.set(x, 14, Z0 - 6, W.woodL);
  for (const x of [X0 + 2, X1 - 2]) for (let z = Z0 - 6; z < Z0; z++) v.set(x, 12 + Math.round((Z0 - z) * 0.3), z, W.woodD);
  // awning poles + striped scalloped awning sloping to the front
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) for (let y = TOP + 2; y <= 42; y++) v.set(x, y, z, (y % 4) ? W.white : W.cartD);
  for (let z = Z0 - 1; z <= Z1 + 5; z++) {
    const y = Math.round(44 - ((z - Z0) / (Z1 + 5 - Z0)) * 6);
    for (let x = X0 - 1; x <= X1 + 1; x++) {
      const st = floor((x - X0 + 1) / 4) % 2;
      v.set(x, y, z, st ? W.awnA : W.awnB);
      v.set(x, y + 1, z, st ? W.white : W.awnBD);
    }
  }
  for (let x = X0 - 1; x <= X1 + 1; x++) {
    const st = floor((x - X0 + 1) / 4) % 2, ph = (x - X0 + 1) % 4;
    for (let k = 1; k <= (ph === 1 || ph === 2 ? 3 : 2); k++) v.set(x, 38 - k, Z1 + 5, st ? W.awnA : W.awnB);
  }
  // roof sign board: a loaf silhouette
  for (let x = -7; x <= 6; x++) for (let y = 46; y <= 51; y++) v.set(x, y, Z0 + 3, x === -7 || x === 6 || y === 46 || y === 51 ? W.woodD : W.cream);
  for (let x = -4; x <= 3; x++) for (let y = 47; y <= 50; y++) if (Math.hypot((x + 0.5) / 4, (y - 47) / 3.4) < 1) v.set(x, y, Z0 + 4, (x + 40) % 3 === 0 && y > 48 ? W.breadL : W.bread);
  for (let y = 44; y <= 45; y++) { v.set(-5, y, Z0 + 3, W.woodD); v.set(4, y, Z0 + 3, W.woodD); }
  // bunting under the awning
  for (let x = X0; x <= X1; x++) { const y = 35 - Math.round(sin(((x - X0) / (X1 - X0)) * PI) * 2); v.set(x, y, Z1 + 3, W.cream); if ((x + 40) % 4 === 0) { v.set(x, y - 1, Z1 + 3, [W.awnB, W.yellow, W.cartL][((x + 40) / 4) % 3]); v.set(x, y - 2, Z1 + 3, [W.awnBD, W.yellow, W.cart][((x + 40) / 4) % 3]); } }
  return v;
}
function pieModel(fill, fillL) {
  // lattice-top pie in a tin (centre at origin, sits on y = 0)
  const v = new VoxelModel();
  for (let x = -4; x <= 3; x++)
    for (let z = -4; z <= 3; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 4.2) continue;
      v.set(x, 0, z, W.greyL);
      v.set(x, 1, z, r > 3.3 ? W.crustD : fill);
      if (r > 3.3) v.set(x, 2, z, (x + z) % 2 ? W.crust : W.crustL);
      else if ((x + 40) % 2 === 0 || (z + 40) % 2 === 0) v.set(x, 2, z, (x + 40) % 2 === 0 && (z + 40) % 2 === 0 ? W.crustL : W.crust);
      else v.set(x, 2, z, fillL);
    }
  return v;
}
function loafModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 7.4, 3.6, 3.6, (x, y, z) => (y < 0 ? null : y >= 2 && (x + 40) % 4 === 0 ? W.breadL : (x + 40) % 4 === 1 && y >= 2 ? W.breadD : tone(x, y, z, W.bread, W.breadD, W.breadL, 0.1, 0.1)));
  return v;
}
function kettleModel() {
  // blue enamel kettle on a little iron trivet; spout to +Z
  const v = new VoxelModel();
  for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) { v.set(x, 0, z, W.iron); v.set(x, 1, z, W.iron); }
  for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) v.set(x, 2, z, (x + z) % 2 ? W.iron : W.ironL);
  ell(v, 0, 6, 0, 4.2, 3.8, 4.2, (x, y, z) => (y < 3 ? null : y >= 8 && x <= -1 && z >= 0 ? W.kettleL : (x + y + z) % 7 === 0 ? W.white : y === 3 ? W.kettleD : W.kettle));
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) { v.set(x, 10, z, W.kettleD); v.set(x, 11, z, x === -1 && z === -1 ? W.white : W.iron); }
  for (let k = 0; k <= 4; k++) { v.set(-1, 5 + k, 4 + k, W.kettle); v.set(0, 5 + k, 4 + k, W.kettleD); }
  for (let k = -3; k <= 2; k++) v.set(k, 12, -0, W.iron);
  v.set(-3, 11, 0, W.iron); v.set(2, 11, 0, W.iron);
  return v;
}
function bunsModel() {
  // a basket of round buns + croissants
  const v = new VoxelModel();
  for (let x = -5; x <= 4; x++) for (let z = -3; z <= 2; z++) { v.set(x, 0, z, W.woodD); if (x === -5 || x === 4 || z === -3 || z === 2) v.set(x, 1, z, (x + z) % 2 ? W.oak : W.oakD); }
  for (const [cx, cz] of [[-3, -1], [0, 0], [2, -1]]) ell(v, cx, 2, cz, 1.8, 1.4, 1.8, (x, y, z) => (y >= 2 ? W.breadL : W.bread));
  for (let x = -2; x <= 2; x++) v.set(x, 3 + (abs(x) < 2 ? 1 : 0), 1, abs(x) === 2 ? W.crustD : W.crust);
  return v;
}
/** Hazel's bakery cart: sky-blue cart on big red wheels, pink-and-cream awning, bunting, pies, a loaf, buns, a steaming kettle. */
export function makeBakeryCart() {
  const g = group('BakeryCart', meshOf(memoGeo('bakery_cart', cartModel)));
  const top = 21 * FV;
  const p1 = meshOf(memoGeo('pie_cherry', () => pieModel(W.cherry, W.cherryL))); p1.position.set(-0.3, top, 0.06);
  const p2 = meshOf(memoGeo('pie_berry', () => pieModel(W.berry, W.berryL))); p2.position.set(-0.1, top, -0.08);
  const lf = meshOf(memoGeo('bread_loaf', loafModel)); lf.position.set(0.12, top, 0.1); lf.rotation.y = 0.4;
  const bn = meshOf(memoGeo('bread_buns', bunsModel)); bn.position.set(0.08, top, -0.12);
  const kt = meshOf(memoGeo('bakery_kettle', kettleModel)); kt.position.set(0.33, top, -0.02); kt.rotation.y = -0.6;
  g.add(p1, p2, lf, bn, kt);
  g.userData.steam = new THREE.Vector3(0.33 + sin(-0.6) * 9 * FV, top + 10 * FV, -0.02 + cos(-0.6) * 9 * FV);
  return g;
}
export { W as PROP_COLORS };
