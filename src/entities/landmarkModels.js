// Voxel models for map landmarks (multi-tile set pieces).
//
// Conventions follow decorModels.js: 1 tile = 10 voxels, y = 0 is the first
// voxel layer above the ground. A model with footprint { w, d } (tiles) is
// centred on its footprint: x runs -5w .. 5w-1 and z runs -5d .. 5d-1
// (so a 1x1 model is the usual -5..4, a 2x2 is -10..9, a 3x3 is -15..14).
// +z is the "front" (faces the default camera), -z is the back.
// Place the model's group at the world-space centre of the footprint.
//
// landmarkModel(type, { seed }) -> {
//   body, glow?, parts?   exactly as decorModel (build with { pivot: [0.5, 0, 0.5], scale: 0.1 },
//                         parts mounted at ((pivot[0]-0.5)*0.1, pivot[1]*0.1, (pivot[2]-0.5)*0.1))
//   footprint: { w, d }   in tiles (w along x, d along z)
//   smoke?: [[x, y, z]]   chimney tops in world units relative to the model origin
// }
// riverbridge and dock have pilings that go below y = 0 (down to y = -8) so
// they reach into the river / pond; everything else is clipped at y = 0.
import { VoxelModel, shade, mix } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';

export const LANDMARK_TYPES = ['firetower', 'lumberhut', 'willowshrine', 'mushhut', 'swampshack', 'riverbridge', 'dock'];

const FOOTPRINTS = {
  firetower: { w: 2, d: 2 }, lumberhut: { w: 3, d: 3 }, willowshrine: { w: 2, d: 2 }, mushhut: { w: 2, d: 2 },
  swampshack: { w: 3, d: 2 }, riverbridge: { w: 1, d: 3 }, dock: { w: 1, d: 3 },
};
const BELOW_GROUND = new Set(['riverbridge', 'dock']);

// ---------------------------------------------------------------- palette
const WOOD = [0xa8784a, 0x9a6a40, 0xb48452];
const WOOD_D = 0x6a4424;
const BARK = [0x7a4e2a, 0x8a5a30, 0x6a4424];
const LOG = [0xb07a44, 0xa06c3c, 0xbc8650];
const LOG_END = 0xd0a066, LOG_RING = 0xa87a48;
const TIMBER = [0x8a6038, 0x7e5632, 0x946a40];
const GREY_WOOD = [0x8a8270, 0x7a7462, 0x969080, 0x6e6a5a];
const STONE = [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72];
const MOSS = [0x6a9a3a, 0x5a8a34, 0x7aa848];
const LEAF = [0x3f8a3a, 0x4f9c44, 0x2f7034, 0x5aa84a];
const GRASS = [0x6aa040, 0x5a9038, 0x7ab04a];
const DIRT = [0x8a6a48, 0x7a5c3e, 0x9a7a54];
const RED = 0xd23a2e, RED_D = 0xa82a22, RED_L = 0xe85a46;
const WHITE = 0xf6f2ea, CREAM = 0xf0e6cc;
const METAL = 0x9aa4ac, METAL_D = 0x6a747c, IRON = 0x3a3a40;
const BRASS = 0xd8a840;
const ROPE = 0xd8c090, ROPE_D = 0xb89a68;
const GLASS = 0x9ad0e8, GLASS_L = 0xd8f0ff;
const WARM = 0xffd070, WARM2 = 0xffb050, FLAME = [0xffe070, 0xffb030, 0xff7a20];
const FLOWERS = [0xffffff, 0xf2c230, 0xd9529b, 0x9a86ea, 0xf07a4a];

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const spanOf = (fp) => ({ x0: -5 * fp.w, x1: 5 * fp.w - 1, z0: -5 * fp.d, z1: 5 * fp.d - 1 });

function tufts(v, rnd, n, fp, avoid = () => false) {
  const s = spanOf(fp);
  for (let i = 0; i < n; i++) {
    const x = s.x0 + Math.floor(rnd() * (s.x1 - s.x0 + 1)), z = s.z0 + Math.floor(rnd() * (s.z1 - s.z0 + 1));
    if (avoid(x, z) || v.has(x, 0, z) || v.has(x, 1, z)) continue;
    const h = 1 + Math.floor(rnd() * 2);
    for (let y = 0; y < h; y++) v.set(x, y, z, pick(rnd, GRASS));
    if (rnd() < 0.3) v.set(x, h, z, pick(rnd, FLOWERS));
  }
}

// a little flame (for candles / torches); base voxel at (x, y, z)
function smallFlame(m, x, y, z, big = false) {
  m.set(x, y, z, FLAME[1]);
  m.set(x, y + 1, z, FLAME[0]);
  if (big) { m.set(x, y + 2, z, 0xfff4b0); m.set(x + 1, y, z, FLAME[2]); m.set(x - 1, y, z, FLAME[2]); }
}

// hanging lantern: frame (lit) + glow core; top hook at (x, y, z), hangs down 4
function lantern(frame, glow, x, y, z) {
  frame.set(x, y, z, IRON);
  frame.box(x - 1, y - 1, z - 1, x + 1, y - 1, z + 1, IRON);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) frame.box(x + dx, y - 3, z + dz, x + dx, y - 2, z + dz, IRON);
  frame.box(x - 1, y - 4, z - 1, x + 1, y - 4, z + 1, IRON);
  glow.box(x, y - 3, z - 1, x, y - 2, z + 1, WARM);
  glow.box(x - 1, y - 3, z, x + 1, y - 2, z, WARM);
  glow.set(x, y - 3, z, 0xfff0b0);
}

// ================================================================ FIRE TOWER (2x2)
function firetower(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const H = 78; // top of the lattice legs
  const leg = (y, s) => (s < 0 ? Math.round(-9 + (4 * y) / H) : Math.round(7 - (4 * y) / H));
  const T = (y) => (y % 13 === 0 ? TIMBER[1] : TIMBER[(y >> 2) % 2 ? 0 : 2]);
  // gravel pad + concrete footings
  for (let x = -10; x <= 9; x++)
    for (let z = -10; z <= 9; z++) if (rnd() < 0.35 && Math.hypot(x + 0.5, z + 0.5) < 10) body.set(x, 0, z, pick(rnd, [0xa8a294, 0x9a9486, 0xb8b2a2]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x0 = leg(0, sx), z0 = leg(0, sz);
    body.box(x0 - 1, 0, z0 - 1, x0 + 2, 1, z0 + 2, (x, y) => (y === 1 ? 0xc8c4b6 : 0xb0ac9e));
  }
  // the four legs (2x2 timbers leaning inwards) with bolt plates
  for (let y = 2; y <= H; y++)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x0 = leg(y, sx), z0 = leg(y, sz);
      body.box(x0, y, z0, x0 + 1, y, z0 + 1, y % 13 === 0 ? METAL_D : T(y));
    }
  // sides: plane coordinate + span along the side
  const sides = [
    { ax: 'z', p: (y) => leg(y, 1) + 1 }, { ax: 'z', p: (y) => leg(y, -1) },
    { ax: 'x', p: (y) => leg(y, -1) }, { ax: 'x', p: (y) => leg(y, 1) + 1 },
  ];
  const a0 = (y) => leg(y, -1), a1 = (y) => leg(y, 1) + 1;
  const put = (sd, a, y, c) => (sd.ax === 'z' ? body.set(a, y, sd.p(y), c) : body.set(sd.p(y), y, a, c));
  const LEVELS = [13, 26, 39, 52, 65, H];
  for (const sd of sides) {
    for (const y of LEVELS) for (let a = a0(y); a <= a1(y); a++) put(sd, a, y, TIMBER[1]);
    // X braces between levels
    let prev = 2;
    for (const yb of LEVELS) {
      const ya = prev;
      for (let y = ya; y <= yb; y++) {
        const t = (y - ya) / (yb - ya);
        const l = a0(y), r = a1(y);
        put(sd, Math.round(l + (r - l) * t), y, TIMBER[2]);
        put(sd, Math.round(r - (r - l) * t), y, TIMBER[2]);
      }
      prev = yb;
    }
  }
  // ladder up the front face with a safety cage
  const front = sides[0];
  for (let y = 2; y <= H + 1; y++) {
    const z = front.p(Math.min(y, H)) + 1;
    body.set(-2, y, z, WOOD_D); body.set(1, y, z, WOOD_D);
    if (y % 3 === 0) { body.set(-1, y, z, WOOD[2]); body.set(0, y, z, WOOD[2]); }
    if (y > 24 && y % 7 === 0 && z + 3 <= 9) {
      body.set(-3, y, z + 1, METAL); body.set(2, y, z + 1, METAL);
      body.set(-3, y, z + 2, METAL); body.set(2, y, z + 2, METAL);
      body.box(-2, y, z + 3, 1, y, z + 3, METAL);
    }
  }
  // catwalk deck + joists
  const D = H + 1;
  body.box(-9, D, -9, 8, D, 8, (x, y, z) => (x === -9 || x === 8 || z === -9 || z === 8 ? WOOD_D : WOOD[(x + 30) % 3]));
  for (const z of [-9, -4, 3, 8]) body.box(-9, H, z, 8, H, z, WOOD_D);
  body.set(-1, D, 6, null); body.set(0, D, 6, null); // ladder hatch
  // railing
  for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) {
    if (!(x === -9 || x === 8 || z === -9 || z === 8)) continue;
    const post = (x + z) % 4 === 0 || (Math.abs(x + 0.5) > 8 && Math.abs(z + 0.5) > 8);
    if (post) body.box(x, D + 1, z, x, D + 4, z, WOOD_D);
    body.set(x, D + 4, z, WOOD[0]);
    body.set(x, D + 2, z, WOOD[1]);
  }
  // cabin: siding, window band (front + right open so we can peek in), siding band
  const C0 = D + 1, W0 = C0 + 4, W1 = C0 + 8, C1 = C0 + 10;
  for (let x = -6; x <= 5; x++)
    for (let z = -6; z <= 5; z++) {
      const edge = x === -6 || x === 5 || z === -6 || z === 5;
      if (!edge) continue;
      const corner = (x === -6 || x === 5) && (z === -6 || z === 5);
      for (let y = C0; y <= C1; y++) {
        let c = y % 2 ? CREAM : 0xe4d8bc;
        if (corner) c = 0x3a6a4a;
        else if (y >= W0 && y <= W1) {
          const along = z === -6 || z === 5 ? x : z;
          const mull = (along + 6) % 4 === 0 || y === W0 + 2;
          const openSide = z === 5 || x === 5;
          if (mull) c = WHITE;
          else if (openSide && y > W0) c = null;
          else c = (along + y) % 5 === 0 ? GLASS_L : GLASS;
        } else if (y === W0 - 1 || y === W1 + 1) c = 0x3a6a4a; // green trim
        body.set(x, y, z, c);
      }
    }
  // door (front, left of the ladder hatch)
  body.box(-5, C0, 5, -4, W1 - 1, 5, (x, y) => (y === W1 - 1 ? 0x2a5a3a : 0x3a6a4a));
  body.set(-4, C0 + 4, 6, BRASS);
  // interior: Osborne fire-finder table, stool, map on the back wall
  body.box(-1, C0, -1, 0, C0 + 3, 0, WOOD_D);
  body.cylinder(-0.5, C0 + 4, -0.5, 2.2, 1, (x, z) => WOOD[1]);
  body.cylinder(-0.5, C0 + 5, -0.5, 1.6, 1, BRASS);
  body.set(-1, C0 + 6, -1, 0x6a5a40); body.set(0, C0 + 6, 0, 0x6a5a40); // sight
  body.box(-5, C0 + 4, -5, -2, C0 + 7, -5, (x, y) => ((x + y) % 3 ? 0xe8dcb0 : 0x7aa860)); // map
  body.set(-3, C0 + 6, -5, RED);
  body.box(3, C0, 2, 3, C0 + 2, 2, WOOD_D); body.set(3, C0 + 3, 2, RED_D); // stool
  body.box(2, C0 + 4, -4, 3, C0 + 4, -4, IRON); // binoculars on a shelf
  body.box(1, C0 + 3, -5, 4, C0 + 3, -5, WOOD[0]);
  // ceiling lamp
  body.box(-3, W1, 2, -3, C1, 2, IRON);
  glow.set(-3, W1 - 1, 2, WARM); glow.set(-3, W1 - 2, 2, 0xfff0b0); glow.set(-2, W1 - 1, 2, WARM2); glow.set(-4, W1 - 1, 2, WARM2);
  // shallow hip roof with an overhang, darker hip ridges and shingle rows
  const R0 = C1 + 1;
  const RL = [[-8, 7], [-7, 6], [-5, 4], [-3, 2], [-1, 0]];
  RL.forEach(([a, b], i) =>
    body.box(a, R0 + i, a, b, R0 + i, b, (x, y, z) => {
      const e = x === a || x === b || z === a || z === b;
      if (!e) return RED_D;
      const hip = (x === a || x === b) && (z === a || z === b);
      if (hip || Math.abs(x + 0.5) === Math.abs(z + 0.5)) return 0x8a2018;
      if (i === 0) return 0x8a2a20; // eave fascia
      return (x + z) % 2 ? RED : RED_L;
    }));
  for (let i = 1; i < RL.length; i++) {
    const [a, b] = RL[i - 1];
    for (let k = a + 1; k < b; k += 1) {
      // shingle row on the step below each layer
      for (const [x, z] of [[k, a], [k, b], [a, k], [b, k]]) if (!body.has(x, R0 + i, z)) body.set(x, R0 + i - 1, z, (k + i) % 2 ? RED : 0xc83226);
    }
  }
  body.set(-1, R0 + 5, -1, BRASS);
  // anemometer mast + beacon; cups spin as a part
  const M = R0 + 5;
  body.box(-1, M, -1, -1, M + 5, -1, METAL_D);
  glow.set(-1, M + 6, -1, 0xff3a2a);
  const cups = new VoxelModel();
  const cy = M + 4;
  cups.set(-1, cy, -1, METAL);
  for (const [dx, dz, ox, oz] of [[1, 0, 0, 1], [-1, 0, 0, -1], [0, 1, -1, 0], [0, -1, 1, 0]]) {
    for (let k = 1; k <= 3; k++) cups.set(-1 + dx * k, cy, -1 + dz * k, METAL);
    cups.set(-1 + dx * 3 + ox, cy, -1 + dz * 3 + oz, RED);
    cups.set(-1 + dx * 4 + ox, cy, -1 + dz * 4 + oz, WHITE);
  }
  // Canadian flag on a pole at the back-right corner of the catwalk
  for (let y = D + 1; y <= R0 + 9; y++) body.set(7, y, -9, y % 5 ? 0xe0e0e0 : 0xc0c0c0);
  body.set(7, R0 + 10, -9, BRASS);
  const flag = new VoxelModel();
  const FY = R0 + 5;
  for (let i = 1; i <= 10; i++)
    for (let j = 0; j < 6; j++) {
      const x = 7 - i;
      let c = i <= 2 || i >= 9 ? RED : WHITE;
      const lx = i - 5.5, ly = j - 2.5;
      // tiny maple leaf
      if (c === WHITE && ((Math.abs(lx) < 1 && ly > -2 && ly < 2) || (Math.abs(lx) < 2 && Math.abs(ly) < 0.6) || (Math.abs(lx) < 1.6 && ly > 0.4 && ly < 1.6))) c = RED;
      flag.set(x, FY + j, -9, c);
    }
  // fire danger sign under the tower
  body.box(2, 0, 4, 2, 6, 4, WOOD_D); body.box(6, 0, 4, 6, 6, 4, WOOD_D);
  const DANGER = [0x4aa04a, 0x3a7ad0, 0xf0d040, 0xf09030, 0xd83a2a];
  body.box(1, 4, 5, 7, 8, 5, (x, y) => (y === 8 || x === 1 || x === 7 ? WOOD[0] : y === 7 ? CREAM : DANGER[Math.min(4, Math.floor((x - 2) / 1))]));
  body.set(5, 4, 6, IRON); body.set(5, 5, 6, IRON); body.set(5, 6, 6, IRON); // arrow pointing at HIGH
  // water barrel + supply crate
  body.cylinder(-6, 0, -6, 1.6, 4, (x, y) => (y === 1 || y === 3 ? METAL_D : 0x3a6a8a));
  body.box(-6, 4, -6, -6, 4, -6, 0x5a9ad0);
  body.box(-7, 0, 2, -5, 2, 4, (x, y, z) => (x === -6 && y === 1 ? 0xd8c070 : WOOD[1]));
  tufts(body, rnd, 26, FOOTPRINTS.firetower, (x, z) => body.has(x, 0, z) || body.has(x, 2, z));
  return {
    body, glow,
    parts: [
      { model: cups, pivot: [-0.5, cy + 0.5, -0.5], anim: 'rotateY', axis: 'y', speed: 5 },
      { model: flag, pivot: [7.5, FY + 3, -8.5], anim: 'wave', axis: 'y', speed: 3 },
    ],
  };
}

// ================================================================ LUMBERJACK HUT (3x3)
function lumberhut(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const X0 = -10, X1 = 5, Z0 = -9, Z1 = 2, TOP = 14;
  const rowCol = [];
  for (let r = 0; r < 8; r++) rowCol.push(pick(rnd, LOG));
  const logC = (y, along) => {
    const r = (y - 1) >> 1;
    const base = rowCol[r % rowCol.length];
    const c = (y - 1) % 2 === 0 ? shade(base, 0.82) : base;
    return (along * 7 + y * 3) % 11 === 0 ? shade(c, 0.92) : c;
  };
  // stone foundation
  body.box(X0 - 1, 0, Z0 - 1, X1 + 1, 0, Z1 + 1, () => pick(rnd, STONE));
  // log walls with notched, protruding corners
  for (let y = 1; y <= TOP; y++) {
    const r = (y - 1) >> 1, fbRow = r % 2 === 0;
    for (let x = X0; x <= X1; x++) { body.set(x, y, Z0, logC(y, x)); body.set(x, y, Z1, logC(y, x)); }
    for (let z = Z0; z <= Z1; z++) { body.set(X0, y, z, logC(y, z)); body.set(X1, y, z, logC(y, z)); }
    if (fbRow) for (const z of [Z0, Z1]) { body.set(X0 - 1, y, z, LOG_END); body.set(X1 + 1, y, z, LOG_END); }
    else for (const x of [X0, X1]) { body.set(x, y, Z0 - 1, LOG_END); body.set(x, y, Z1 + 1, LOG_END); }
  }
  // interior floor (seen through the door)
  body.box(X0 + 1, 1, Z0 + 1, X1 - 1, 1, Z1 - 1, WOOD[1]);
  // door
  body.box(-3, 2, Z1, -1, 10, Z1, (x, y) => (x === -2 ? 0x6a3e20 : y === 4 || y === 8 ? 0x5a3418 : 0x7a4a28));
  body.box(-4, 11, Z1 + 1, 0, 11, Z1 + 1, WOOD_D);
  body.box(-4, 2, Z1 + 1, -4, 10, Z1 + 1, WOOD_D); body.box(0, 2, Z1 + 1, 0, 10, Z1 + 1, WOOD_D);
  body.set(-1, 6, Z1 + 1, BRASS);
  body.box(-3, 2, Z1 + 2, -1, 2, Z1 + 3, (x) => (x % 2 ? 0x9a3a2a : 0x7a6a40)); // welcome mat
  // windows with red plaid curtains + flower boxes
  const plaid = (x, y) => (x % 2 === 0 && y % 2 === 0 ? 0x3a1a1a : x % 2 === 0 || y % 2 === 0 ? RED_D : RED);
  for (const wx of [-8, 2]) {
    const xa = wx, xb = wx + 3, ya = 5, yb = 9;
    for (let x = xa - 1; x <= xb + 1; x++) for (let y = ya - 1; y <= yb + 1; y++) {
      if (x === xa - 1 || x === xb + 1 || y === ya - 1 || y === yb + 1) body.set(x, y, Z1 + 1, WOOD_D);
    }
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
      let c;
      if (x === xa || x === xb || y === yb) c = plaid(x, y);
      else if (y === 7) c = WOOD_D;
      else { body.set(x, y, Z1, null); glow.set(x, y, Z1, (x + y) % 3 === 0 ? 0xffe8b0 : WARM); continue; } // warm lit interior
      body.set(x, y, Z1, c);
    }
    for (let x = xa; x <= xb; x++) body.set(x, ya - 1, Z1 + 1, WOOD_D);
    body.box(xa - 1, ya - 2, Z1 + 2, xb + 1, ya - 2, Z1 + 2, WOOD[0]);
    for (let x = xa - 1; x <= xb + 1; x++) { body.set(x, ya - 1, Z1 + 2, pick(rnd, LEAF)); if (x % 2) body.set(x, ya, Z1 + 2, pick(rnd, FLOWERS)); }
  }
  // gable ends face front/back (vertical boards), ridge runs along z over x = -3..-2
  const roofY = (x) => (x <= -3 ? 13 + (x + 12) : 13 + (7 - x));
  for (let y = TOP + 1; y <= 22; y++)
    for (let x = X0; x <= X1; x++) {
      if (roofY(x) <= y) continue;
      for (const z of [Z0, Z1]) body.set(x, y, z, x % 2 ? WOOD[0] : WOOD[2]);
    }
  body.box(X0, TOP + 1, Z1 + 1, X1, TOP + 1, Z1 + 1, WOOD_D); // trim board under the gable
  // round attic window in the front gable
  for (const [x, y] of [[-3, 17], [-2, 17], [-3, 18], [-2, 18]]) { body.set(x, y, Z1, null); glow.set(x, y, Z1, (x + y) % 2 ? WARM : WARM2); }
  for (const [x, y] of [[-4, 17], [-4, 18], [-1, 17], [-1, 18], [-3, 16], [-2, 16], [-3, 19], [-2, 19]]) body.set(x, y, Z1 + 1, WOOD_D);
  body.set(-2, 21, Z1 + 1, RED); body.set(-3, 21, Z1 + 1, RED); // little painted heart over the gable
  body.set(-2, 20, Z1 + 1, RED_D);
  // roof: cedar shakes in rows, a bit of moss, dark ridge cap
  const SH = [0xa85a3a, 0x8e4a30, 0xb86a44];
  for (let x = X0 - 2; x <= X1 + 2; x++) {
    const y = roofY(x);
    for (let z = Z0 - 2; z <= Z1 + 2; z++) {
      const c = (z + (y % 2) * 2) % 4 === 0 ? SH[1] : y % 2 ? SH[0] : SH[2];
      body.set(x, y, z, z === Z1 + 2 || z === Z0 - 2 ? 0x5a3020 : rnd() < 0.05 ? pick(rnd, MOSS) : c);
      body.set(x, y - 1, z, SH[1]);
    }
  }
  body.box(-3, 23, Z0 - 2, -2, 23, Z1 + 2, 0x5a3020);
  // stone chimney on the -x side
  for (let y = 0; y <= 25; y++)
    for (let x = -13; x <= -11; x++)
      for (let z = -6; z <= -3; z++) {
        body.set(x, y, z, (y + x + z) % 4 === 0 ? 0x6a665e : pick(rnd, STONE));
      }
  body.box(-14, 24, -7, -10, 24, -2, STONE[3]);
  body.box(-13, 25, -6, -11, 25, -3, (x, y, z) => (x === -12 && (z === -5 || z === -4) ? 0x2a2420 : STONE[1]));
  // porch deck + step + rocking chair with a plaid blanket
  body.box(X0, 1, Z1 + 1, X1, 1, Z1 + 5, (x, y, z) => (z === Z1 + 5 ? WOOD_D : WOOD[(x + 20) % 3]));
  body.box(X0, 0, Z1 + 1, X1, 0, Z1 + 5, WOOD_D);
  body.box(-4, 0, Z1 + 6, 0, 0, Z1 + 6, WOOD[2]);
  body.box(2, 2, 5, 4, 2, 6, WOOD[0]); body.box(2, 3, 5, 4, 4, 5, WOOD[0]);
  body.box(2, 5, 5, 4, 7, 5, (x, y) => plaid(x, y));
  body.set(2, 2, 7, WOOD_D); body.set(4, 2, 7, WOOD_D); body.set(2, 2, 4, WOOD_D); body.set(4, 2, 4, WOOD_D);
  body.box(2, 3, 6, 3, 3, 6, plaid);
  body.set(-6, 2, 4, 0x4a7ab0); body.set(-6, 3, 4, 0x4a7ab0); // mug + boots by the door
  body.box(-8, 2, 3, -8, 3, 3, 0x3a2a1a); body.box(-7, 2, 3, -7, 3, 3, 0x3a2a1a);
  // lantern by the door (flickers)
  body.box(-5, 9, Z1 + 1, -5, 9, Z1 + 2, IRON);
  const lf = new VoxelModel(), lg = new VoxelModel();
  lantern(lf, lg, -5, 9, Z1 + 3);
  parts.push({ model: lf, glow: lg, pivot: [-4.5, 9, Z1 + 3.5], anim: 'sway', axis: 'x', speed: 1.6 });
  // woodpile: split logs stacked ends-out behind a little roof
  const pileLog = (x, y) => {
    body.box(x, y, -10, x + 1, y + 1, -4, (xx, yy, zz) => (zz === -4 ? ((xx + yy) % 2 ? LOG_END : LOG_RING) : pick(rnd, BARK)));
  };
  for (const [x, y] of [[7, 0], [9, 0], [11, 0], [13, 0], [8, 2], [10, 2], [12, 2], [9, 4], [11, 4], [10, 6]]) pileLog(x, y);
  body.box(6, 0, -11, 6, 9, -11, WOOD_D); body.box(14, 0, -11, 14, 9, -11, WOOD_D);
  body.box(6, 10, -12, 14, 10, -3, (x, y, z) => (z % 2 ? SH[0] : SH[2]));
  // chopping stump with the axe stuck in it, wood chips
  body.cylinder(10, 0, 2, 2.2, 4, (x, y, z) => (y === 3 ? (Math.hypot(x - 10, z - 2) < 1 ? LOG_RING : LOG_END) : pick(rnd, BARK)));
  body.box(9, 4, 2, 10, 5, 2, METAL); body.set(11, 4, 2, METAL_D); body.set(9, 5, 2, 0xd8dee4);
  body.line(10, 6, 2, 13, 11, 3, 0x9a6a3a);
  body.set(13, 11, 3, RED); // painted handle end
  for (let i = 0; i < 10; i++) body.set(7 + Math.floor(rnd() * 7), 0, -1 + Math.floor(rnd() * 6), pick(rnd, [LOG_END, 0xe0b880, 0xc89a60]));
  // sawhorse with a log + bucksaw (front right)
  for (const x of [7, 12]) { body.line(x, 0, 8, x, 5, 10, WOOD_D); body.line(x, 0, 12, x, 5, 10, WOOD_D); }
  body.box(6, 6, 9, 14, 7, 10, (x, y, z) => (x === 6 || x === 14 ? LOG_END : pick(rnd, BARK)));
  body.line(9, 8, 10, 9, 11, 11, 0xd04a2a); body.line(9, 11, 11, 12, 11, 11, 0xd04a2a); body.line(12, 11, 11, 12, 8, 10, 0xd04a2a);
  body.box(9, 8, 10, 12, 8, 10, METAL);
  // lamp post with a hanging lantern on the front left
  body.box(-12, 0, 8, -12, 13, 8, WOOD_D); body.box(-12, 13, 8, -10, 13, 8, WOOD_D);
  const pf = new VoxelModel(), pg = new VoxelModel();
  lantern(pf, pg, -10, 12, 8);
  parts.push({ model: pf, glow: pg, pivot: [-9.5, 12, 8.5], anim: 'sway', axis: 'x', speed: 1.3, phase: 1.1 });
  // canoe paddle leaning on the wall, stepping stones, mushrooms
  body.line(-11, 0, 3, -11, 9, 2, WOOD[2]); body.box(-11, 0, 4, -11, 2, 4, WOOD[0]);
  for (const [x, z] of [[-2, 9], [-1, 11], [-3, 13], [-1, 14]]) body.box(x, 0, z, x + 1, 0, z, pick(rnd, STONE));
  for (const [x, z] of [[-14, 1], [-13, 3], [13, -13]]) { body.set(x, 0, z, CREAM); body.set(x, 1, z, RED); }
  tufts(body, rnd, 40, FOOTPRINTS.lumberhut, (x, z) => body.has(x, 0, z));
  return { body, glow, parts, smoke: [[-1.2, 2.65, -0.45]] };
}

// ================================================================ WILLOW SHRINE (2x2)
function willowshrine(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const S = () => (rnd() < 0.28 ? pick(rnd, MOSS) : pick(rnd, STONE));
  // flagstone plaza
  for (let x = -10; x <= 9; x++)
    for (let z = -10; z <= 9; z++) {
      const r = Math.hypot((x + 0.5) / 1.0, (z + 0.5) / 0.95);
      if (r < 9.4 && (x + z * 3) % 7 !== 0) body.set(x, 0, z, r > 8 && rnd() < 0.5 ? pick(rnd, MOSS) : S());
    }
  // stepped platform
  body.box(-7, 1, -8, 6, 1, 3, S);
  body.box(-6, 2, -8, 5, 2, 1, S);
  body.box(-3, 1, 4, 2, 1, 4, S); // front step
  // the little shrine house
  body.box(-4, 3, -7, 3, 11, -3, (x, y, z) => ((y + x) % 4 === 0 ? 0x8a867e : S()));
  // niche
  body.box(-2, 4, -4, 1, 9, -3, null);
  body.box(-2, 4, -5, 1, 9, -5, 0x5a5650);
  body.box(-2, 3, -4, 1, 3, -3, STONE[2]);
  // carved little bear figure in the niche
  body.box(-1, 4, -4, 0, 5, -4, 0xb8b0a0); body.box(-1, 6, -4, 0, 7, -4, 0xc8c0b0);
  body.set(-2, 8, -4, 0xb8b0a0); body.set(1, 8, -4, 0xb8b0a0); body.set(-1, 7, -3, 0x9a9488);
  // roof: stone slab + mossy thatch overhang
  body.box(-6, 12, -9, 5, 12, -1, (x, y, z) => (z === -1 || x === -6 || x === 5 ? 0x6a665e : STONE[1]));
  body.box(-5, 13, -8, 4, 13, -2, () => pick(rnd, MOSS));
  body.box(-3, 14, -7, 2, 14, -3, () => pick(rnd, MOSS));
  body.box(-1, 15, -6, 0, 15, -4, MOSS[2]);
  body.set(-1, 16, -5, 0xe86a8a); body.set(0, 16, -5, 0xf2c230); // flowers growing on top
  for (const x of [-6, -3, 1, 4, 5]) for (let k = 1; k <= 1 + Math.floor(rnd() * 3); k++) body.set(x, 12 - k, -1, k % 2 ? MOSS[0] : LEAF[2]);
  // offerings on the step: berries bowl, a fish on a leaf, honey pot, wildflowers, coins
  body.box(-6, 3, 0, -5, 3, 1, 0xb8a080); body.set(-6, 4, 0, 0x4a5ad0); body.set(-5, 4, 1, 0xd8304a); body.set(-5, 4, 0, 0x5a4ac0);
  body.box(2, 3, 0, 4, 3, 1, LEAF[1]); body.box(2, 4, 0, 4, 4, 0, 0x9ab8c8); body.set(4, 4, 0, 0x7a98a8); body.set(1, 4, 0, 0x7a98a8);
  body.box(-2, 3, 1, -1, 4, 1, 0xd89a30); body.set(-2, 5, 1, 0xe8b040); body.set(-1, 5, 1, WOOD[0]); // honey pot
  body.set(0, 3, 0, BRASS); body.set(1, 3, 1, 0xe8c050); body.set(-3, 3, -1, BRASS);
  for (const [x, z, c] of [[-4, 3, 0xffffff], [3, 3, 0xd9529b], [-7, 2, 0x9a86ea], [6, 2, 0xf2c230]]) {
    body.set(x, 2, z, LEAF[0]); body.set(x, 3, z, c);
  }
  // candles (wax body) + flickering flames
  const cand = [[-5, 3, -1, 3], [-4, 3, 1, 2], [4, 3, -1, 2], [3, 3, 1, 1], [-1, 3, 0, 1], [5, 3, 1, 1]];
  cand.forEach(([x, y, z, h], i) => {
    body.box(x, y, z, x, y + h - 1, z, i % 2 ? 0xf6efe0 : 0xf0e0c0);
    const f = new VoxelModel();
    smallFlame(f, x, y + h, z);
    parts.push({ glow: f, pivot: [x + 0.5, y + h, z + 0.5], anim: 'flicker', speed: 8 + i, phase: i * 1.3 });
  });
  // two little stone lanterns
  for (const x of [-9, 7]) {
    body.box(x, 1, -2, x + 1, 1, -1, S); body.box(x, 2, -2, x, 4, -2, S);
    body.box(x - 1, 5, -3, x + 1, 5, -1, STONE[1]);
    body.box(x - 1, 6, -3, x + 1, 7, -1, (xx, yy, zz) => (xx === x && zz === -2 ? null : (xx === x || zz === -2) ? null : STONE[0]));
    glow.box(x, 6, -3, x, 7, -1, WARM); glow.box(x - 1, 6, -2, x + 1, 7, -2, WARM2);
    body.box(x - 1, 8, -3, x + 1, 8, -1, MOSS[1]); body.set(x, 9, -2, STONE[2]);
  }
  // rope with paper streamers on two posts in front
  for (const x of [-7, 6]) { body.box(x, 0, 6, x, 9, 6, WOOD_D); body.set(x, 10, 6, LOG_END); }
  for (let x = -6; x <= 5; x++) {
    const t = (x + 6) / 11;
    const y = 9 - Math.round(Math.sin(t * Math.PI) * 2);
    body.set(x, y, 6, ROPE);
    if (x % 3 === 0) { body.set(x, y - 1, 6, WHITE); body.set(x, y - 2, 6, 0xe8e4dc); }
    if (x === -1) { body.set(x, y - 1, 6, RED); }
  }
  // ferns
  for (const [x, z] of [[-9, 4], [8, 5], [-8, -8], [7, -8], [8, 1]]) {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) body.set(x + dx, dx || dz ? 1 : 2, z + dz, pick(rnd, LEAF));
  }
  tufts(body, rnd, 20, FOOTPRINTS.willowshrine, (x, z) => body.has(x, 1, z));
  return { body, glow, parts };
}

// ================================================================ MUSHROOM HUT (2x2)
function mushhut(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const CX = -0.5, CZ = -1.5;
  const STEM = [0xf0e2c8, 0xe8d8bc, 0xf6ead4];
  // stem: slightly bulging, with speckles
  for (let y = 0; y <= 16; y++) {
    const r = 5.2 + (y < 3 ? (3 - y) * 0.35 : 0) + Math.sin(y * 0.5) * 0.25;
    body.cylinder(CX, y, CZ, r, 1, () => (rnd() < 0.08 ? 0xd8c4a0 : pick(rnd, STEM)));
  }
  // carve front surface helpers
  const frontZ = (x, y) => { for (let z = 9; z >= -10; z--) if (body.has(x, y, z)) return z; return null; };
  // round-top door
  for (let x = -2; x <= 1; x++)
    for (let y = 0; y <= 7; y++) {
      if (y === 7 && (x === -2 || x === 1)) continue;
      const z = frontZ(x, y);
      if (z == null) continue;
      const frame = x === -2 || x === 1 || y === 7 || (y === 6 && (x === -2 || x === 1));
      body.set(x, y, z, frame ? 0x7a4a28 : x === -1 || x === 0 ? (y % 3 ? 0xa86a3a : 0x8a5430) : 0x8a5430);
      body.set(x, y, z + 1, null);
    }
  body.set(0, 3, frontZ(0, 3) + 1, BRASS);
  body.box(-2, 0, frontZ(-1, 0) + 1, 1, 0, frontZ(-1, 0) + 2, (x) => (x % 2 ? 0xc85a3a : 0xe8b040)); // mat
  // round glowing window (right of the door) with a cross mullion and frame ring
  const wx = 3, wy = 5;
  for (let x = wx - 2; x <= wx + 2; x++)
    for (let y = wy - 2; y <= wy + 2; y++) {
      const d = Math.hypot(x - wx, y - wy);
      if (d > 2.4) continue;
      const z = frontZ(x, y);
      if (z == null) continue;
      if (d > 1.5) { body.set(x, y, z + 1, 0x7a4a28); continue; }
      body.set(x, y, z, null);
      if (x === wx || y === wy) body.set(x, y, z, 0x7a4a28);
      else glow.set(x, y, z, (x + y) % 2 ? WARM : 0xffe8a0);
    }
  // little window on the left side + flower box
  for (const [x, y] of [[-5, 8], [-5, 9], [-4, 8], [-4, 9]]) { const z = frontZ(x, y); if (z != null) { body.set(x, y, z, null); glow.set(x, y, z, WARM2); } }
  // cap: dome with white spots and pink gills underneath
  const cap = { y: 15, rx: 8.4, ry: 6.2 };
  const spots = [];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, e = 0.25 + rnd() * 1.1;
    spots.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]);
  }
  spots.push([0, 1, 0]);
  body.ellipsoid(CX, cap.y, CZ, cap.rx, cap.ry, cap.rx, (x, y, z, d) => {
    if (y < cap.y) return null;
    const nx = (x - CX) / cap.rx, ny = (y - cap.y) / cap.ry, nz = (z - CZ) / cap.rx;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const s of spots) if ((nx * s[0] + ny * s[1] + nz * s[2]) / l > 0.982) return (x + y) % 3 ? WHITE : 0xfff8f0;
    if (y === cap.y) return 0xf0b8a8;
    return d > 0.8 ? ((x + z) % 5 === 0 ? 0xc83a2e : 0xd8422e) : 0xb83226;
  });
  // gills ring + droopy rim
  for (let a = 0; a < 360; a += 6) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(CX + Math.cos(t) * 8.2), z = Math.round(CZ + Math.sin(t) * 8.2);
    body.set(x, cap.y - 1, z, 0xc83a2e);
    body.set(Math.round(CX + Math.cos(t) * 6.6), cap.y - 1, Math.round(CZ + Math.sin(t) * 6.6), 0xe8a898);
  }
  // stovepipe chimney poking out of the cap
  body.box(4, 18, -5, 5, 23, -4, (x, y) => (y % 3 === 0 ? METAL_D : METAL));
  body.box(3, 24, -6, 6, 24, -3, IRON);
  // lantern on a curly stick by the path
  body.box(-6, 0, 6, -6, 9, 6, WOOD_D); body.set(-5, 10, 6, WOOD_D); body.set(-4, 10, 6, WOOD_D);
  const lf = new VoxelModel(), lg = new VoxelModel();
  lantern(lf, lg, -4, 9, 6);
  parts.push({ model: lf, glow: lg, pivot: [-3.5, 9, 6.5], anim: 'sway', axis: 'x', speed: 1.5 });
  // stepping-stone path, tiny mushrooms, a snail
  for (const [x, z] of [[-1, 6], [0, 7], [-1, 8], [0, 9]]) body.set(x, 0, z, pick(rnd, STONE));
  for (const [x, z, c] of [[5, 5, 0xd8422e], [7, 2, 0xc89048], [-8, 3, 0xd8422e], [-7, -7, 0xc89048], [7, -6, 0xd8422e]]) {
    body.set(x, 0, z, CREAM); body.set(x, 1, z, CREAM);
    body.box(x - 1, 2, z, x + 1, 2, z, c); body.set(x, 2, z - 1, c); body.set(x, 2, z + 1, c); body.set(x, 3, z, c === 0xd8422e ? WHITE : c);
  }
  body.set(4, 0, 7, 0xc8b080); body.set(5, 0, 7, 0xc8b080); body.set(4, 1, 7, 0xb87a4a); body.set(6, 1, 7, 0x8a8070);
  // flower box under the side window
  tufts(body, rnd, 30, FOOTPRINTS.mushhut, (x, z) => body.has(x, 0, z));
  return { body, glow, parts, smoke: [[0.45, 2.5, -0.45]] };
}

// ================================================================ SWAMP SHACK (3x2)
function swampshack(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const DY = 8; // deck height
  const GW = () => pick(rnd, GREY_WOOD);
  // muddy ground, lily pads, cattails
  for (let x = -15; x <= 14; x++) for (let z = -10; z <= 9; z++) if (rnd() < 0.25) body.set(x, 0, z, pick(rnd, [0x5a6a3a, 0x4a5a34, 0x6a5a3a]));
  // stilts with moss and cross braces
  for (const x of [-12, -4, 3]) for (const z of [-8, -1, 6]) {
    for (let y = 0; y < DY; y++) body.set(x, y, z, y < 2 && rnd() < 0.7 ? pick(rnd, MOSS) : 0x5a4a3a);
  }
  for (const z of [-8, -1, 6]) { body.line(-12, 1, z, -4, 6, z, GREY_WOOD[3]); body.line(-4, 1, z, 3, 6, z, GREY_WOOD[3]); }
  // deck
  body.box(-13, DY, -9, 4, DY, 7, (x, y, z) => (z === 7 || x === -13 || x === 4 ? 0x5a4e3e : GREY_WOOD[(x * 3 + 40) % 4]));
  // shack walls: weathered vertical boards with a blue patch
  const SX0 = -12, SX1 = 2, SZ0 = -8, SZ1 = -1, SY1 = DY + 10;
  const boardC = [];
  for (let i = 0; i < 40; i++) boardC.push(GW());
  for (let y = DY + 1; y <= SY1; y++) {
    for (let x = SX0; x <= SX1; x++) { body.set(x, y, SZ0, boardC[(x + 20) % 40]); body.set(x, y, SZ1, boardC[(x + 21) % 40]); }
    for (let z = SZ0; z <= SZ1; z++) { body.set(SX0, y, z, boardC[(z + 30) % 40]); body.set(SX1, y, z, boardC[(z + 31) % 40]); }
  }
  body.box(-2, DY + 3, SZ1, 0, DY + 6, SZ1, 0x4a7a9a); // patch
  body.set(-2, DY + 6, SZ1 + 1, METAL); body.set(0, DY + 3, SZ1 + 1, METAL);
  // door
  body.box(-7, DY + 1, SZ1, -5, DY + 8, SZ1, (x, y) => (y === DY + 4 ? 0x4a3a2a : 0x6a5038));
  body.set(-5, DY + 5, SZ1 + 1, BRASS);
  // window with a crooked shutter, glowing inside
  for (let x = -11; x <= -9; x++) for (let y = DY + 4; y <= DY + 7; y++) { body.set(x, y, SZ1, null); glow.set(x, y, SZ1, (x + y) % 2 ? WARM : WARM2); }
  body.box(-11, DY + 6, SZ1, -9, DY + 6, SZ1, 0x3a2a1a);
  body.box(-12, DY + 4, SZ1 + 1, -12, DY + 7, SZ1 + 1, 0x6a8a5a);
  body.line(-8, DY + 3, SZ1 + 1, -7, DY + 7, SZ1 + 1, 0x6a8a5a);
  // fishing net hanging on the wall
  for (let x = 0; x <= 2; x++) for (let y = DY + 2; y <= DY + 6; y++) if ((x + y) % 2 === 0) body.set(x, y, SZ1 + 1, ROPE_D);
  body.set(1, DY + 4, SZ1 + 2, 0xe8e0c8); // float
  // corrugated tin shed roof, rusty
  for (let x = SX0 - 2; x <= SX1 + 2; x++)
    for (let z = SZ0 - 2; z <= SZ1 + 3; z++) {
      const y = Math.round(SY1 + 1 + (z - (SZ0 - 2)) * 0.4);
      const rust = rnd() < 0.18;
      const c = rust ? pick(rnd, [0xb86a3a, 0xa85a2a]) : x % 2 ? 0x9aa0a0 : 0x7a8282;
      body.set(x, y, z, c); body.set(x, y - 1, z, 0x6a7070);
    }
  // fill the gap between walls and roof
  for (let x = SX0; x <= SX1; x++) for (let z = SZ0; z <= SZ1; z++) {
    const yr = Math.round(SY1 + 1 + (z - (SZ0 - 2)) * 0.4);
    for (let y = SY1 + 1; y < yr - 1; y++) if (x === SX0 || x === SX1 || z === SZ0 || z === SZ1) body.set(x, y, z, GREY_WOOD[1]);
  }
  // spanish moss hanging off the roof edge
  for (let x = SX0 - 2; x <= SX1 + 2; x += 2) {
    const yE = Math.round(SY1 + 1 + (SZ1 + 3 - (SZ0 - 2)) * 0.4);
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 1; k <= n; k++) body.set(x, yE - 1 - k, SZ1 + 3, k % 2 ? 0x8aa070 : 0x9ab080);
  }
  // stovepipe
  body.box(-9, SY1 + 3, -6, -9, SY1 + 9, -6, METAL_D);
  body.box(-10, SY1 + 10, -7, -8, SY1 + 10, -5, IRON);
  // porch railing (gap at the stairs)
  for (let x = -13; x <= 4; x++) {
    if (x >= 3) continue;
    if (x % 3 === 0 || x === -13) body.box(x, DY + 1, 7, x, DY + 4, 7, 0x5a4e3e);
    body.set(x, DY + 4, 7, GREY_WOOD[2]); body.set(x, DY + 2, 7, GREY_WOOD[0]);
  }
  for (let z = -1; z <= 7; z++) { body.set(-13, DY + 4, z, GREY_WOOD[2]); if (z % 3 === 0) body.box(-13, DY + 1, z, -13, DY + 4, z, 0x5a4e3e); }
  // stairs down the right side
  for (let i = 0; i < DY; i++) body.box(5 + Math.floor(i / 2), DY - 1 - i, 3, 5 + Math.floor(i / 2), DY - 1 - i, 6, GREY_WOOD[i % 4]);
  // porch clutter: rocking chair, moonshine jug, bucket, rope coil, a frog
  body.box(-11, DY + 1, 2, -9, DY + 1, 3, 0x6a5038); body.box(-11, DY + 2, 2, -9, DY + 2, 3, 0x7a6040);
  body.box(-11, DY + 3, 1, -9, DY + 6, 1, (x, y) => (y === DY + 6 ? 0x5a4030 : 0x7a6040));
  body.box(-11, DY + 1, 4, -11, DY + 1, 4, 0x5a4030); body.box(-9, DY + 1, 4, -9, DY + 1, 4, 0x5a4030);
  body.box(-7, DY + 1, 4, -6, DY + 3, 4, 0xc8b080); body.set(-7, DY + 4, 4, 0x8a6a40); body.set(-6, DY + 2, 5, 0x2a2a2a);
  body.cylinder(-3, DY + 1, 4, 1.2, 3, (x, y) => (y === DY + 3 ? METAL : METAL_D));
  for (let a = 0; a < 360; a += 30) { const t = (a * Math.PI) / 180; body.set(Math.round(0 + Math.cos(t) * 1.6), DY + 1, Math.round(4 + Math.sin(t) * 1.6), a % 60 ? ROPE : ROPE_D); }
  body.set(0, DY + 2, 4, ROPE);
  body.set(-4, DY + 5, 7, 0x5aa040); body.set(-4, DY + 6, 7, 0x6ab84a); body.set(-5, DY + 5, 7, 0x4a9030); // frog on the rail
  body.set(-4, DY + 6, 8, 0x1a1a1a);
  // hanging lantern on a bracket off the front-left post (sways)
  body.box(-13, DY + 5, 7, -13, DY + 13, 7, 0x5a4e3e);
  body.box(-12, DY + 13, 7, -10, DY + 13, 7, IRON);
  const lf = new VoxelModel(), lg = new VoxelModel();
  lantern(lf, lg, -10, DY + 12, 7);
  parts.push({ model: lf, glow: lg, pivot: [-9.5, DY + 12, 7.5], anim: 'sway', axis: 'x', speed: 1.4 });
  // canoe tied to the front-right stilt
  const CAN = 0xd8603a, CAN_D = 0xa84428;
  for (let x = 6; x <= 14; x++) {
    const taper = x <= 7 || x >= 13 ? 0 : 1;
    const y0 = x === 6 || x === 14 ? 2 : 0;
    for (let z = 7 - taper; z <= 8 + taper; z++) {
      body.set(x, y0, z, CAN_D);
      if (z === 7 - taper || z === 8 + taper || x === 6 || x === 14) body.set(x, y0 + 1, z, CAN);
      if (y0 === 0 && (z === 7 - taper || z === 8 + taper)) body.set(x, y0 + 2, z, x % 3 ? CAN : 0xf0e0c0);
    }
  }
  body.box(10, 1, 7, 10, 1, 8, WOOD[0]); // thwart
  body.line(8, 1, 7, 12, 3, 8, WOOD[2]); // paddle
  body.line(3, 6, 6, 6, 3, 7, ROPE);
  body.set(3, 6, 7, ROPE_D);
  // cattails
  for (const [x, z] of [[-15, 8], [-14, 3], [12, -4], [13, -8], [-15, -6], [9, 3]]) {
    const h = 3 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) body.set(x, y, z, LEAF[(y + x) % 4]);
    body.set(x, h, z, 0x6a4024); body.set(x, h + 1, z, 0x6a4024); body.set(x, h + 2, z, LEAF[0]);
  }
  for (const [x, z] of [[9, -2], [11, 1], [-14, -2]]) body.box(x, 0, z, x + 1, 0, z + 1, (xx, yy, zz) => (xx === x + 1 && zz === z ? null : 0x4a9a3a));
  return { body, glow, parts, smoke: [[-0.9, (SY1 + 11) * 0.1, -0.6]] };
}

// ================================================================ RIVER BRIDGE (1x3, spans z)
function riverbridge(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const deck = (z) => 1 + Math.round(4 * Math.sin((Math.PI * (z + 15.5)) / 30));
  // stone abutments on both banks
  for (const [za, zb] of [[-15, -11], [10, 14]])
    for (let z = za; z <= zb; z++) for (let x = -5; x <= 4; x++) {
      const top = Math.max(0, deck(z) - 2);
      for (let y = -2; y <= top; y++) body.set(x, y, z, rnd() < 0.25 ? pick(rnd, MOSS) : pick(rnd, STONE));
    }
  // stringers + planks
  for (let z = -15; z <= 14; z++) {
    const y = deck(z);
    body.set(-4, y - 1, z, WOOD_D); body.set(3, y - 1, z, WOOD_D);
    const c = pick(rnd, WOOD);
    const l = rnd() < 0.2 ? -3 : -4, r = rnd() < 0.2 ? 2 : 3;
    for (let x = l; x <= r; x++) body.set(x, y, z, x === l || x === r ? shade(c, 0.88) : c);
    if (z % 4 === 0) { body.set(-3, y, z, IRON); body.set(2, y, z, IRON); } // nail heads
  }
  // pilings into the river with cross braces
  for (const z of [-6, 5]) {
    for (const x of [-4, 3]) for (let y = -8; y < deck(z) - 1; y++) body.set(x, y, z, y % 4 === 0 ? BARK[2] : BARK[0]);
    body.line(-4, -6, z, 3, deck(z) - 2, z, BARK[1]);
  }
  // rail posts + sagging rope rails
  const posts = [-14, -5, 4, 13];
  for (const z of posts) for (const x of [-5, 4]) {
    const y0 = deck(z);
    body.box(x, y0 - 1, z, x, y0 + 6, z, WOOD_D);
    body.set(x, y0 + 7, z, LOG_END);
    body.set(x, y0 + 5, z, ROPE_D);
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const za = posts[i], zb = posts[i + 1];
    for (let z = za + 1; z < zb; z++) {
      const t = (z - za) / (zb - za);
      const yTop = deck(za) + (deck(zb) - deck(za)) * t + 5 - Math.sin(t * Math.PI) * 1.6;
      for (const x of [-5, 4]) {
        body.set(x, Math.round(yTop), z, ROPE);
        body.set(x, Math.round(yTop - 3), z, ROPE_D);
      }
    }
  }
  // little lanterns on the end posts
  for (const z of [-14, 13]) for (const x of [-5, 4]) {
    const y = deck(z) + 8;
    body.set(x, y, z, IRON); glow.set(x, y + 1, z, WARM); body.set(x, y + 2, z, IRON);
  }
  return { body, glow };
}

// ================================================================ DOCK (1x3, shore at -z, water at +z)
function dock(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const DY = 1;
  // pilings (down into the water) with rope wraps
  for (const z of [-9, -1, 6, 11]) for (const x of [-5, 4]) {
    for (let y = -8; y <= DY + 3; y++) body.set(x, y, z, y === DY + 3 ? LOG_END : y < -1 && rnd() < 0.5 ? pick(rnd, MOSS) : pick(rnd, BARK));
    body.set(x, DY + 1, z, ROPE);
  }
  // deck planks (across x), shore step
  for (let z = -15; z <= 11; z++) {
    const c = pick(rnd, WOOD);
    for (let x = -4; x <= 3; x++) body.set(x, DY, z, (x === -4 || x === 3) ? shade(c, 0.85) : c);
    if (rnd() < 0.15) body.set(-4 + Math.floor(rnd() * 8), DY, z, shade(c, 1.12));
    body.set(-4, DY - 1, z, WOOD_D); body.set(3, DY - 1, z, WOOD_D);
  }
  body.box(-3, 0, -15, 2, 0, -14, () => pick(rnd, STONE));
  // cleat + coiled rope
  body.box(2, DY + 1, -4, 2, DY + 1, -2, METAL_D); body.set(2, DY + 2, -4, METAL_D); body.set(2, DY + 2, -2, METAL_D);
  for (let a = 0; a < 360; a += 30) { const t = (a * Math.PI) / 180; body.set(Math.round(-2 + Math.cos(t) * 1.5), DY + 1, Math.round(-6 + Math.sin(t) * 1.5), a % 60 ? ROPE : ROPE_D); }
  // tackle box, bucket of fish, crate
  body.box(1, DY + 1, 2, 3, DY + 2, 3, 0x3a8a5a); body.box(1, DY + 3, 2, 3, DY + 3, 3, 0x4a9a6a); body.set(2, DY + 4, 2, IRON);
  body.cylinder(-2, DY + 1, 4, 1.3, 3, (x, y) => (y === DY + 3 ? METAL : METAL_D));
  body.set(-2, DY + 4, 4, 0x9ab8c8); body.set(-3, DY + 4, 4, 0x7a98a8); body.set(-2, DY + 5, 4, 0xa8c8d8);
  body.box(-4, DY + 1, -12, -2, DY + 3, -10, (x, y, z) => (y === DY + 2 && z === -10 ? WOOD_D : WOOD[1]));
  // fishing rod in a holder at the end, line + bobbing bobber off the end
  body.box(1, DY + 1, 10, 1, DY + 3, 10, IRON);
  body.line(1, DY + 3, 10, 1, DY + 10, 14, 0x3a2a1a);
  body.set(1, DY + 4, 10, RED);
  for (let y = DY + 9; y >= -1; y--) body.set(1, y, 14, y % 2 ? 0xe8e8e8 : null);
  const bob = new VoxelModel();
  bob.set(1, -1, 14, RED); bob.set(1, 0, 14, WHITE);
  parts.push({ model: bob, pivot: [1.5, -1, 14.5], anim: 'bob', speed: 2.2 });
  // life ring lying on the deck
  for (let x = -3; x <= -1; x++) for (let z = 7; z <= 9; z++) if (!(x === -2 && z === 8)) body.set(x, DY + 1, z, (x + z) % 2 ? RED : WHITE);
  // lantern post at the end
  body.box(-4, DY + 1, 11, -4, DY + 10, 11, WOOD_D);
  body.box(-3, DY + 10, 11, -2, DY + 10, 11, IRON);
  const lf = new VoxelModel(), lg = new VoxelModel();
  lantern(lf, lg, -2, DY + 9, 11);
  parts.push({ model: lf, glow: lg, pivot: [-1.5, DY + 9, 11.5], anim: 'sway', axis: 'z', speed: 1.5 });
  // shore grass + reeds on the land tile only
  for (let i = 0; i < 16; i++) {
    const x = rnd() < 0.5 ? -5 : 4, z = -15 + Math.floor(rnd() * 9);
    if (body.has(x, 0, z)) continue;
    const h = 1 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) body.set(x, y, z, pick(rnd, GRASS));
    if (rnd() < 0.35) body.set(x, h, z, pick(rnd, FLOWERS));
  }
  return { body, glow, parts };
}

// ---------------------------------------------------------------- public API
const BUILDERS = { firetower, lumberhut, willowshrine, mushhut, swampshack, riverbridge, dock };

/**
 * Build the voxel model(s) for a landmark.
 * @param {string} type one of LANDMARK_TYPES
 * @param {{ seed?: number }} [o]
 * @returns {{ body, glow?, parts?, footprint: { w: number, d: number }, smoke?: number[][] } | null}
 */
export function landmarkModel(type, { seed = 1 } = {}) {
  const fn = BUILDERS[type];
  if (!fn) return null;
  const rnd = mulberry32((seed * 7919 + type.length * 131 + type.charCodeAt(0) * 17) >>> 0);
  const out = fn(rnd);
  const minY = BELOW_GROUND.has(type) ? -8 : 0;
  const clip = (m) => m && m.paint((x, y, z, c) => (y < minY ? null : c));
  clip(out.body); clip(out.glow);
  // glow + animated voxels win over body voxels in the same cell (no z-fighting / poking through)
  for (const o of [out.glow, ...(out.parts || []).flatMap((p) => [p.model, p.glow])]) if (o) for (const k of o.vox.keys()) out.body.vox.delete(k);
  if (out.glow && out.glow.vox.size === 0) delete out.glow;
  out.footprint = { ...FOOTPRINTS[type] };
  return out;
}

export function landmarkFootprint(type) {
  return FOOTPRINTS[type] ? { ...FOOTPRINTS[type] } : null;
}
