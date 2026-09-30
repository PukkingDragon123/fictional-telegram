// Voxel models for player structures. Coordinates: one tile = 10 voxels,
// origin at the tile's centre on its base surface (pivot applied at build).
import { VoxelModel } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';
import { seaweedModel, cattailModel, lilypadModel, willowModel, mapleModel } from '../world/models.js';

const LOG = [0x7a4e2a, 0x8a5a30, 0x6a4424];
const LOG_END = 0xc8955a;
const MUD = [0x4a3a28, 0x5a4630, 0x3e3020];
const WOOD = [0xa8784a, 0x9a6a40, 0xb48452];

// mask bits: 1 = +x, 2 = -x, 4 = +z, 8 = -z
const DIRS = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];

// Logs run along an axis; `h` = water depth in voxels (floor -> surface)
export function damModel(mask, depth = 10, seed = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const top = depth + 3;
  const ew = (mask & 3) !== 0, ns = (mask & 12) !== 0;
  const alongX = ew || !ns;
  const alongZ = ns;
  // mud core
  for (let y = 0; y < top - 1; y++) {
    const w = y < depth - 3 ? 3 : 2;
    if (alongX) v.box(mask & 2 || !ew ? -5 : -w - 1, y, -w, mask & 1 || !ew ? 4 : w, y, w - 1, () => MUD[Math.floor(rnd() * 3)]);
    if (alongZ) v.box(-w, y, mask & 8 ? -5 : -w - 1, w - 1, y, mask & 4 ? 4 : w, () => MUD[Math.floor(rnd() * 3)]);
  }
  // logs on top layers
  const logLayer = (y, axis, off) => {
    if (axis === 'x') {
      const x0 = mask & 2 || !ew ? -5 : -3, x1 = mask & 1 || !ew ? 4 : 2;
      v.box(x0, y, off, x1, y, off + 1, () => LOG[Math.floor(rnd() * 3)]);
      v.set(x0, y, off, LOG_END); v.set(x1, y, off + 1, LOG_END);
    } else {
      const z0 = mask & 8 ? -5 : -3, z1 = mask & 4 ? 4 : 2;
      v.box(off, y, z0, off + 1, y, z1, () => LOG[Math.floor(rnd() * 3)]);
      v.set(off, y, z0, LOG_END); v.set(off + 1, y, z1, LOG_END);
    }
  };
  for (let y = depth - 3; y < top; y++) {
    const o = (y % 2 === 0 ? -2 : 0);
    if (alongX) logLayer(y, 'x', o);
    if (alongZ) logLayer(y, 'z', o);
  }
  // sticks poking out
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd() * 8) - 4, z = Math.floor(rnd() * 3) - 1;
    const px = alongX ? x : z, pz = alongX ? z : x;
    v.line(px, top - 1, pz, px + (rnd() < 0.5 ? 2 : -2), top + 1, pz + (rnd() < 0.5 ? 1 : -1), 0x9a7040);
  }
  return v;
}

export function fenceModel(mask, seed = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const post = (x, z, h) => {
    for (let y = 0; y < h; y++) v.box(x, y, z, x + 1, y, z + 1, () => LOG[Math.floor(rnd() * 3)]);
    v.set(x, h, z, LOG_END); v.set(x + 1, h, z + 1, 0x6a4424);
  };
  post(-1, -1, 13);
  for (const [dx, dz, bit] of DIRS) {
    if (!(mask & bit)) continue;
    for (const k of [3, 5]) {
      const px = dx * k - (dx === 0 ? 1 : dx < 0 ? 1 : 0), pz = dz * k - (dz === 0 ? 1 : dz < 0 ? 1 : 0);
      post(px, pz, 11 + Math.floor(rnd() * 3));
    }
    // rails
    for (const ry of [4, 9]) {
      if (dx) v.box(dx > 0 ? 0 : -5, ry, 0, dx > 0 ? 4 : -1, ry, 0, 0x6a4424);
      else v.box(0, ry, dz > 0 ? 0 : -5, 0, ry, dz > 0 ? 4 : -1, 0x6a4424);
    }
  }
  return v;
}

export function gateModel(mask, depth = 10) {
  const body = damModel(mask, depth - 3, 5);
  const alongZ = (mask & 12) !== 0 && (mask & 3) === 0;
  // frame posts + beam
  const top = depth + 8;
  for (const o of [-4, 3]) {
    for (let y = 0; y < top; y++) {
      if (alongZ) body.box(-1, y, o, 0, y, o, 0x5a3a20);
      else body.box(o, y, -1, o, y, 0, 0x5a3a20);
    }
  }
  if (alongZ) body.box(-1, top, -4, 0, top, 3, 0x6a4424);
  else body.box(-4, top, -1, 3, top, 0, 0x6a4424);
  // crank wheel
  const wz = alongZ ? 0 : 1;
  for (const [a, b] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    if (alongZ) body.set(1 + wz, top + 2 + a, b, 0xb87333);
    else body.set(a, top + 2 + b, 1 + wz, 0xb87333);
  }
  // sliding board (separate so it can animate)
  const board = new VoxelModel();
  for (let y = 0; y < depth + 2; y++) {
    for (let k = -3; k <= 2; k++) {
      if (alongZ) board.set(0, y, k, y % 3 === 0 ? 0x7a5030 : 0x9a6a40);
      else board.set(k, y, 0, y % 3 === 0 ? 0x7a5030 : 0x9a6a40);
    }
  }
  return { body, board };
}

export function platformModel(mask, stilt = 6) {
  const v = new VoxelModel();
  const deckY = stilt;
  for (let x = -5; x <= 4; x++)
    for (let z = -5; z <= 4; z++) v.set(x, deckY, z, WOOD[(z + 5) % 3 === 0 ? 1 : (x + z) % 7 === 0 ? 2 : 0]);
  // under-beams
  v.box(-5, deckY - 1, -4, 4, deckY - 1, -4, 0x7a5030);
  v.box(-5, deckY - 1, 3, 4, deckY - 1, 3, 0x7a5030);
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) v.box(x, 0, z, x, deckY - 1, z, 0x6a4424);
  // railings on open sides
  const rail = (x0, z0, x1, z1) => {
    v.box(x0, deckY + 3, z0, x1, deckY + 3, z1, 0x8a5a30);
    v.set(x0, deckY + 1, z0, 0x7a4e2a); v.set(x0, deckY + 2, z0, 0x7a4e2a);
    v.set(x1, deckY + 1, z1, 0x7a4e2a); v.set(x1, deckY + 2, z1, 0x7a4e2a);
  };
  if (!(mask & 1)) rail(4, -5, 4, 4);
  if (!(mask & 2)) rail(-5, -5, -5, 4);
  if (!(mask & 4)) rail(-5, 4, 4, 4);
  if (!(mask & 8)) rail(-5, -5, 4, -5);
  return v;
}

export function lodgeModel(depth = 10) {
  const v = new VoxelModel();
  const rnd = mulberry32(77);
  const cols = [0x6a4424, 0x7a5030, 0x5a3a20, 0x8a6038, 0x4a3a28];
  v.ellipsoid(0, depth - 2, 0, 7, 9, 6.5, (x, y, z, d) => {
    if (y < 0) return null;
    if (d > 0.85 && rnd() < 0.35) return null;
    return cols[Math.floor(rnd() * cols.length)];
  });
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2, r = 5 + rnd() * 2;
    const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
    v.line(x, depth - 1 + Math.floor(rnd() * 4), z, Math.round(x * 1.35), depth + 3 + Math.floor(rnd() * 3), Math.round(z * 1.35), 0x9a7040);
  }
  return v;
}

export function skepModel() {
  const v = new VoxelModel();
  // stand
  v.box(-3, 0, -3, 2, 0, 2, 0x7a5030);
  v.box(-3, 1, -3, -3, 3, -3, 0x6a4424); v.box(2, 1, -3, 2, 3, -3, 0x6a4424);
  v.box(-3, 1, 2, -3, 3, 2, 0x6a4424); v.box(2, 1, 2, 2, 3, 2, 0x6a4424);
  v.box(-4, 4, -4, 3, 4, 3, 0x8a5a30);
  const radii = [4.2, 4.3, 4.1, 3.7, 3.1, 2.3, 1.2];
  radii.forEach((r, i) => {
    for (let x = -5; x <= 5; x++)
      for (let z = -5; z <= 5; z++) {
        if (Math.hypot(x + 0.5, z + 0.5) > r) continue;
        v.set(x, 5 + i, z, i % 2 ? 0xd8a840 : 0xc49030);
      }
  });
  v.box(-1, 5, 3, 0, 5, 4, null);
  v.set(-1, 5, 3, 0x2a1a0a); v.set(0, 5, 3, 0x2a1a0a);
  return v;
}

export function honeyDrips(v, n) {
  const spots = [[-3, 3], [3, 1], [1, -3], [-2, -3]];
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [x, z] = spots[i];
    v.set(x, 7, z, 0xf0a020); v.set(x, 6, z, 0xf0a020); v.set(x, 5, z, 0xffc040);
  }
}

export function flowerBedModel(seed = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  v.box(-4, 0, -4, 3, 1, 3, (x, y, z) => (x === -4 || x === 3 || z === -4 || z === 3 ? 0x8a5a30 : 0x4a3424));
  const petals = [0xd9529b, 0x7d63d8, 0xffffff, 0xf2c230, 0xe8643a];
  for (let x = -3; x <= 2; x++)
    for (let z = -3; z <= 2; z++) {
      if (rnd() < 0.35) continue;
      const h = 2 + Math.floor(rnd() * 3);
      for (let y = 2; y < 2 + h; y++) v.set(x, y, z, 0x5a8a36);
      v.set(x, 2 + h, z, petals[Math.floor(rnd() * petals.length)]);
    }
  return v;
}

export function berryBushModel(seed = 1, fill = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  v.ellipsoid(0, 4, 0, 4.5, 4, 4.5, (x, y, z, d) => (d > 0.8 && rnd() < 0.3 ? null : rnd() < 0.5 ? 0x2f6a34 : 0x3a7a3a));
  if (fill > 0) {
    for (const [k] of [...v.vox]) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      if (rnd() < 0.16 * fill) v.set(x, y, z, rnd() < 0.5 ? 0x3a4ad0 : 0x5a6ae8);
    }
  }
  return v;
}

export function sugarMapleModel() {
  const v = mapleModel({ h: 40, r: 12, seed: 9, variant: 0 });
  // tap + bucket on the trunk (front, +z)
  v.set(0, 10, 2, 0xb0b0b0);
  v.box(-1, 6, 3, 1, 9, 5, (x, y, z) => (y === 9 && x === 0 && z === 4 ? 0x7a4a1a : 0x9aa4ac));
  v.box(-1, 10, 4, 1, 10, 4, 0x6a747c);
  return v;
}

export function bugHotelModel() {
  const v = new VoxelModel();
  const rnd = mulberry32(3);
  v.box(-3, 0, -2, 2, 0, 1, 0x6a4424);
  v.box(-3, 1, -2, 2, 8, 1, (x, y, z) => {
    if (x === -3 || x === 2 || y === 1 || y === 8 || y === 5) return 0x8a5a30;
    if (z < 1) return 0x5a3a20;
    const r = rnd();
    return r < 0.3 ? 0x6a4424 : r < 0.55 ? 0xd8c890 : r < 0.75 ? 0x2a1a10 : 0x9a7a4a;
  });
  // roof
  v.box(-4, 9, -3, 3, 9, 2, 0x8c2f2a);
  v.box(-3, 10, -3, 2, 10, 2, 0x9e3a32);
  return v;
}

export function feederModel() {
  const body = new VoxelModel();
  body.box(-1, 0, -1, 0, 9, 0, 0x6a4424);
  body.box(-3, 10, -3, 2, 14, 2, (x, y, z) => (y === 14 ? 0x8a5a30 : x === -3 || x === 2 || z === -3 || z === 2 ? 0x9a6a40 : 0xb8742e));
  body.box(-2, 15, -2, 1, 15, 1, 0xb8742e);
  body.box(3, 11, -1, 5, 11, 0, 0xb87333); // chute
  body.box(-4, 12, -4, -4, 12, 3, 0xb87333);
  const arm = new VoxelModel();
  arm.box(0, 0, -3, 0, 0, 3, 0xd0a040);
  arm.box(-1, 0, 3, 1, 0, 4, 0xb87333);
  return { body, arm };
}

export function aeratorModel() {
  const v = new VoxelModel();
  v.cylinder(0, 0, 0, 2.3, 5, (x, y, z) => (y % 2 === 0 ? 0xd83a30 : 0xf0f0f0));
  v.box(0, 5, 0, 0, 8, 0, 0x9aa4ac);
  v.set(0, 9, 0, 0xffe060);
  return v;
}

export function lanternModel() {
  const body = new VoxelModel();
  body.box(0, 0, 0, 0, 10, 0, 0x3a3a40);
  body.box(0, 11, 0, 2, 11, 0, 0x3a3a40);
  body.box(1, 7, -1, 3, 7, 1, 0x2a2a2e);
  body.box(1, 10, -1, 3, 10, 1, 0x2a2a2e);
  const glow = new VoxelModel();
  glow.box(1, 8, -1, 3, 9, 1, 0xffd070);
  return { body, glow };
}

export function chairModel() {
  const v = new VoxelModel();
  const R = 0xc8322a, RD = 0xa02620;
  for (let x = -2; x <= 2; x++) { v.set(x, 3, -1, R); v.set(x, 3, 0, R); v.set(x, 3, 1, R); }
  for (let y = 0; y <= 2; y++) { v.set(-2, y, 1, RD); v.set(2, y, 1, RD); v.set(-2, y, -2, RD); v.set(2, y, -2, RD); }
  for (let y = 4; y <= 8; y++) for (let x = -2; x <= 2; x++) if ((x + 2) % 2 === 0 || y === 8) v.set(x, y, -2 - Math.floor((y - 4) / 3), R);
  v.box(-3, 5, -1, -3, 5, 2, RD); v.box(3, 5, -1, 3, 5, 2, RD);
  v.set(-3, 4, 2, RD); v.set(3, 4, 2, RD);
  return v;
}

export function picnicModel() {
  const v = new VoxelModel();
  const W = 0x9a6a40, WD = 0x7a5030;
  for (let x = -4; x <= 3; x++) for (let z = -2; z <= 1; z++) v.set(x, 4, z, (x + z) % 2 ? 0xd83a30 : 0xf6f2ea);
  for (const x of [-4, 3]) { v.box(x, 0, -2, x, 3, -2, WD); v.box(x, 0, 1, x, 3, 1, WD); }
  v.box(-4, 2, -4, 3, 2, -4, W); v.box(-4, 2, 3, 3, 2, 3, W);
  for (const x of [-3, 2]) { v.set(x, 1, -4, WD); v.set(x, 0, -4, WD); v.set(x, 1, 3, WD); v.set(x, 0, 3, WD); }
  v.set(-1, 5, 0, 0xffc83a); v.set(1, 5, -1, 0x8a5aa0);
  return v;
}

export function flagpoleModel() {
  const v = new VoxelModel();
  v.box(-1, 0, -1, 1, 0, 1, 0x8a847c);
  for (let y = 1; y <= 22; y++) v.set(0, y, 0, 0xd8d8d8);
  v.set(0, 23, 0, 0xe8c040);
  const RED = 0xd52b1e, WHITE = 0xf6f4f0;
  const leaf = ['..#..', '#####', '.###.', '#####', '..#..', '..#..'];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 12; x++) {
      let c = x < 3 || x > 8 ? RED : WHITE;
      if (x >= 3 && x <= 8) { const row = leaf[5 - y]; const li = x - 3; if (li < 5 && row[li] === '#') c = RED; }
      v.set(1 + x, 16 + y, 0, c);
    }
  return v;
}

export { seaweedModel, cattailModel, lilypadModel, willowModel };
