// Voxel props for the critters: Moose Express packages, Daisy Beer can and
// cooler, classic striped folding lawn chair. Fine 0.025 voxels, geometry is
// built lazily and shared (cached) between all copies: don't dispose it.
// Every maker returns a THREE.Group, origin at the bottom centre, front = +Z.
import * as THREE from 'three';
import { FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, matFor } from './critterKit.js';

const geoMemo = new Map();
function memoGeo(key, build, pivot = [0, 0, 0]) {
  let g = geoMemo.get(key);
  if (!g) { g = buildGeo(build(), pivot, FV); geoMemo.set(key, g); }
  return g;
}
function group(name, geo, { shadows = true } = {}) {
  const g = new THREE.Group();
  g.name = name;
  const m = new THREE.Mesh(geo, matFor(geo));
  m.castShadow = shadows;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

// ------------------------------------------------------------------ brand bits
const K = {
  kraft: 0xc8955a, kraftD: 0xa8763e, kraftL: 0xdcac70, tape: 0xe8c890, tapeL: 0xf6dcaa,
  label: 0xfaf6ea, blue: 0x2f62c8, blueL: 0x5a8ae8, red: 0xe0402e, ink: 0x2a2430,
  yellow: 0xffd22e, yellowD: 0xe6a81c, yellowL: 0xffe680, white: 0xfdfbf2, whiteD: 0xe2ded2, orange: 0xf08a1a,
  silver: 0xc8ccd6, silverD: 0x9aa0ae, silverL: 0xeef0f6,
  wood: 0xc89a5a, woodD: 0xa0763a, straw: 0xf0d070, strawD: 0xd0a840, egg: 0xf8eedc, eggD: 0xe8d8bc, speck: 0x9a6a3a,
  paper: 0xf4ead2, paperD: 0xdccfb2, wax: 0xc8202a, waxL: 0xf04a4a,
};
/** Draw a tiny daisy (white petals, golden centre) on the plane z = zf, centred at (cx, cy). */
function daisy(v, cx, cy, zf, big = false) {
  const P = big ? [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1], [-2, 1], [2, -1], [1, 2], [-1, -2]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dy] of P) v.set(cx + dx, cy + dy, zf, K.white);
  v.set(cx, cy, zf, K.orange);
  if (big) { v.set(cx - 1, cy, zf, K.white); v.set(cx + 1, cy, zf, K.white); v.set(cx, cy + 1, zf, K.white); v.set(cx, cy - 1, zf, K.white); }
}

// ------------------------------------------------------------------ packages
function boxModel() {
  const v = new VoxelModel();
  const W = 4, H = 7, D = 3; // half-extents-ish: x -4..3, y 0..6, z -3..2 (fine)
  for (let x = -W; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = -D; z < D; z++) {
        const edge = (x === -W || x === W - 1) + (y === 0 || y === H - 1) + (z === -D || z === D - 1) >= 2;
        let c = edge ? K.kraftD : tone(x, y, z, K.kraft, K.kraftD, K.kraftL, 0.12, 0.1);
        if ((x === -1 || x === 0) && (y === H - 1 || z === D - 1)) c = (x + y + z) % 3 === 0 ? K.tapeL : K.tape; // tape
        v.set(x, y, z, c);
      }
  // flaps seam
  for (let z = -D; z < D; z++) v.set(-1, H - 1, z, K.tapeL);
  // Moose Express label (front, right): blue stripe, red antler logo, address lines
  const zf = D - 1;
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 4; y++) v.set(x, y, zf + 0, K.label);
  for (let x = 1; x <= 3; x++) v.set(x, 4, zf, K.blue);
  v.set(2, 3, zf, K.red); v.set(1, 2, zf, K.ink); v.set(3, 2, zf, K.ink); v.set(2, 1, zf, K.ink);
  // a little "this way up" mark on the side
  v.set(-W, 4, 0, K.red); v.set(-W, 3, 0, K.red); v.set(-W, 4, -1, K.red); v.set(-W, 4, 1, K.red);
  return v;
}
function crateModel() {
  const v = new VoxelModel();
  const W = 5, H = 5, D = 4;
  for (let x = -W; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = -D; z < D; z++) {
        const wall = x === -W || x === W - 1 || z === -D || z === D - 1 || y === 0;
        if (!wall) continue;
        if (y === 2 && (z === -D || z === D - 1) && x > -W && x < W - 1) continue; // slat gap
        if (y === 2 && (x === -W || x === W - 1) && z > -D && z < D - 1) continue;
        const post = (x === -W || x === W - 1) && (z === -D || z === D - 1);
        v.set(x, y, z, post ? K.woodD : tone(x, y, z, K.wood, K.woodD, K.wood, 0.2, 0));
      }
  // stencilled ME label on the front slat
  v.set(-1, 3, D, K.red); v.set(0, 3, D, K.red); v.set(-2, 4, D - 1, K.blue); v.set(1, 4, D - 1, K.blue);
  // straw nest
  for (let x = -W + 1; x < W - 1; x++)
    for (let z = -D + 1; z < D - 1; z++) {
      const h = hash3(x, 9, z);
      v.set(x, 3 + (h > 0.7 ? 1 : 0), z, h < 0.4 ? K.strawD : K.straw);
      if (h > 0.85) v.set(x + (h > 0.92 ? 1 : 0), 5, z, K.straw);
    }
  for (const [x, z] of [[-W, -1], [W - 1, 1], [1, -D], [-2, D - 1]]) v.set(x, 5, z, K.straw);
  // speckled eggs
  for (const [ex, ez, tilt] of [[-2.5, -1.2, 0], [0.5, 1.1, 1], [2.4, -1.4, 0], [-0.4, -1.6, 1]]) {
    ell(v, ex, 5.6, ez, 1.35, 1.75, 1.35, (x, y, z) => (hash3(x * 3, y, z + tilt) < 0.16 ? K.speck : y > 6 && x < ex ? K.egg : hash3(x, y, z) < 0.3 ? K.eggD : K.egg));
  }
  return v;
}
function envelopeModel() {
  const v = new VoxelModel();
  for (let x = -4; x <= 3; x++)
    for (let z = -3; z <= 2; z++) {
      v.set(x, 0, z, K.paperD);
      // flap V on top
      const fx = Math.abs(x + 0.5), flap = z + 3 >= 3.5 - fx * 0.7;
      v.set(x, 1, z, flap ? K.paper : K.paperD === 0 ? 0 : tone(x, 1, z, K.paper, K.paperD, K.paper, 0.15, 0));
    }
  for (let x = -4; x <= 3; x++) { const z = 2 - Math.round(Math.abs(x + 0.5) * 0.75); v.set(x, 1, z, K.paperD); }
  // wax seal + stamp
  v.set(-1, 2, 0, K.wax); v.set(0, 2, 0, K.waxL); v.set(-1, 2, -1, K.wax); v.set(0, 2, -1, K.wax);
  v.set(2, 2, 1, K.blue); v.set(3, 2, 1, K.red); v.set(2, 2, 2, K.red); v.set(3, 2, 2, K.blue);
  return v;
}
/** Moose Express parcel: 'box' | 'egg_crate' | 'envelope'. Origin at the bottom centre. */
export function makePackage(kind = 'box') {
  const k = kind === 'egg_crate' || kind === 'envelope' ? kind : 'box';
  const geo = memoGeo('pkg_' + k, k === 'box' ? boxModel : k === 'egg_crate' ? crateModel : envelopeModel);
  const g = group('Package_' + k, geo);
  g.userData.kind = k;
  g.userData.size = k === 'box' ? [0.2, 0.175, 0.15] : k === 'egg_crate' ? [0.25, 0.15, 0.2] : [0.2, 0.05, 0.15];
  return g;
}

// ------------------------------------------------------------------ Daisy Beer
function canModel() {
  const v = new VoxelModel();
  const R = 2.3, H = 7;
  for (let y = 0; y < H; y++)
    for (let x = -3; x <= 2; x++)
      for (let z = -3; z <= 2; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > R + (y === 0 || y === H - 1 ? -0.4 : 0.2)) continue;
        let c = y === 0 || y === H - 1 ? K.silver : tone(x, y, z, K.yellow, K.yellowD, K.yellowL, 0.1, 0.1);
        if (y === 1 || y === H - 2) c = K.yellowD;
        if (x === -2 && z > -2 && y > 1 && y < H - 2) c = K.yellowL; // shine
        v.set(x, y, z, c);
      }
  daisy(v, 0, 3, 2);
  v.set(0, H, 0, K.silverD); v.set(-1, H, 0, K.silverL); // pull tab
  return v;
}
/** Yellow Daisy Beer can, origin at the can's centre (handy for a hand grip). userData.height = 0.175. */
export function makeDaisyBeerCan() {
  const geo = memoGeo('can', canModel, [-0.0, 3.5, -0.0]);
  const g = group('DaisyBeerCan', geo);
  g.userData.height = 7 * FV;
  return g;
}
function coolerModel() {
  const v = new VoxelModel();
  const W = 8, H = 10, D = 5;
  for (let x = -W; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = -D; z < D; z++) {
        const lid = y >= H - 3;
        const inset = lid ? 0 : 0;
        if (Math.abs(x + 0.5) > W - inset || Math.abs(z + 0.5) > D - inset) continue;
        const corner = (x === -W || x === W - 1) && (z === -D || z === D - 1);
        if (corner && (y === 0 || y === H - 1)) continue;
        let c = lid ? (y === H - 3 ? K.whiteD : tone(x, y, z, K.white, K.whiteD, K.white, 0.08, 0)) : tone(x, y, z, K.yellow, K.yellowD, K.yellowL, 0.1, 0.06);
        if (!lid && y === 0) c = K.yellowD;
        if (corner && !lid) c = K.yellowD;
        v.set(x, y, z, c);
      }
  // front label: white panel with a big daisy
  for (let x = -4; x <= 3; x++) for (let y = 2; y <= 6; y++) v.set(x, y, D, (x === -4 || x === 3 || y === 2 || y === 6) ? K.yellowD : K.white);
  daisy(v, -1, 4, D + 1, true);
  for (let x = 1; x <= 2; x++) { v.set(x, 5, D + 0, K.yellowD); v.set(x, 3, D, K.yellowD); }
  // handle + latch + side grips
  for (let x = -4; x <= 3; x++) v.set(x, H + 1, 0, K.whiteD);
  v.set(-4, H, 0, K.whiteD); v.set(3, H, 0, K.whiteD);
  v.set(-1, H - 3, D, K.silver); v.set(0, H - 3, D, K.silver);
  for (const x of [-W - 1, W]) for (let z = -2; z <= 1; z++) v.set(x, 6, z, K.whiteD);
  return v;
}
/** Daisy Beer cooler box (~0.4 x 0.27 x 0.25). */
export function makeCooler() {
  return group('DaisyBeerCooler', memoGeo('cooler', coolerModel));
}

// ------------------------------------------------------------------ lawn chair
/** Seat surface height of makeLawnChair (world units); DeerGuy's 'sit_chair' is posed for it. */
export const LAWN_CHAIR_SEAT = 0.3;
const CHAIR_COLORS = {
  green: [0x3aa84a, 0xf4f0e0, 0x2a8a3a], blue: [0x3a7ad8, 0xf4f0e0, 0x2a5aa8], red: [0xe0483a, 0xf4f0e0, 0xb03028],
  yellow: [0xffd22e, 0xf4f0e0, 0xe0a81c], orange: [0xff8a2a, 0xffe6a8, 0xd06a1a],
};
function chairModel(cols) {
  const v = new VoxelModel();
  const [A, B, Ad] = cols;
  const S = 12; // seat height (fine voxels) = 0.3
  const X0 = -10, X1 = 9, Z0 = -8, Z1 = 9;
  const tube = (x, y, z, c = K.silver) => v.set(x, y, z, c);
  // side frames: front legs, back legs, seat rails, armrests
  for (const x of [X0 - 1, X1 + 1]) {
    for (let y = 0; y <= S; y++) { tube(x, y, Z1 - Math.round(y * 0.15)); tube(x, y, Z0 + Math.round(y * 0.2)); }
    for (let z = Z0; z <= Z1; z++) tube(x, S, z);
    for (let z = Z0 + 1; z <= Z1 - 1; z++) tube(x, S + 7, z, z === Z1 - 1 ? K.silverD : K.silverL);
    for (let y = S; y <= S + 7; y++) tube(x, y, Z1 - 2);
    for (let z = Z0; z <= Z1; z++) tube(x, 0, z, K.silverD);
  }
  // seat webbing (strips running front-back, alternating colours, little gaps)
  for (let x = X0; x <= X1; x++)
    for (let z = Z0; z <= Z1; z++) {
      const band = Math.floor((x - X0) / 2) % 2;
      const sag = Math.round(1.2 * Math.sin(((z - Z0) / (Z1 - Z0)) * Math.PI) * Math.sin(((x - X0) / (X1 - X0)) * Math.PI));
      if ((z - Z0) % 4 === 3 && (x - X0) % 2 === 1) continue;
      v.set(x, S - sag, z, band ? B : (x + z) % 5 === 0 ? Ad : A);
    }
  // reclined back (tilted ~20 degrees) with horizontal straps
  for (let k = 0; k <= 20; k++) {
    const y = S + 1 + k, z = Z0 - Math.round(k * 0.36);
    for (const x of [X0 - 1, X1 + 1]) tube(x, y, z);
    if (k >= 1 && k <= 19)
      for (let x = X0; x <= X1; x++) {
        const band = Math.floor(k / 2) % 2;
        if (k % 4 === 3 && (x - X0) % 3 === 1) continue;
        v.set(x, y, z, band ? B : A);
      }
  }
  for (let x = X0 - 1; x <= X1 + 1; x++) tube(x, S + 21, Z0 - 7);
  return v;
}
/** Classic folding lawn chair with striped webbing. color: 'green' | 'blue' | 'red' | 'yellow' | 'orange' or [a, b, dark] hex. Faces +Z. */
export function makeLawnChair(color = 'green') {
  const cols = Array.isArray(color) ? color : CHAIR_COLORS[color] || CHAIR_COLORS.green;
  const key = 'chair_' + cols.join('_');
  return group('LawnChair', memoGeo(key, () => chairModel(cols)));
}
