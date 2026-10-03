// The Wood Garage (2x2, beaver built): an open-fronted timber-frame shed with
// a "WOOD" sign on the gable and a log rack inside. The beavers stack the logs
// they haul from felled trees here; the pile on the rack grows with the stock.
// Same conventions and kit as facilityModels.js:
//
//   STRUCTURE_MODELS.woodgarage({ variant, seed, preview, stock, cap }) -> THREE.Group
//     root at the ground centre of the footprint, front (open side) faces +Z.
//     root.userData.setStock(n, cap = 40)  show n of cap logs on the rack (new
//                                          logs pop in, cheap to call every frame)
//     root.userData.stock                  what's shown right now
//     root.userData.update(dt, t)          runs the pop-in animation
//     root.userData.footprint              { w: 2, d: 2 }
//     root.userData.dropPoint              { x, z } local: where beavers drop logs
//
//   makeLogGeometry({ len, r, variant }) -> BufferGeometry (shared, cached): a
//     voxel log lying along local X, centred on the origin (used by TreeFall too).
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';
import { P, VF, defineModels, log, tufts, text, pick, toneOf } from './facilityModels.js';

const { WOOD, WOOD_D, WOOD_M, WOOD_L, BARK, STONE, LEAF, PAPER, IRON, IRON_L, METAL, METAL_D, BRASS, BRASS_D, WARM, INK, RED_D } = P;

export const GARAGE_CAP = 40;
// rack layout: alternating rows of 8 and 7 logs lying front-to-back (ends to the camera)
const ROWS = [8, 7, 8, 7, 8];
const LOG_R = 0.1, ROW_H = 0.172, PILE_X0 = -0.8, PILE_Y0 = 0.25;
const SLOTS = [];
for (let k = 0, n = 0; k < ROWS.length; k++)
  for (let i = 0; i < ROWS[k]; i++, n++) {
    const odd = ROWS[k] === 7;
    SLOTS.push({ x: PILE_X0 + LOG_R + i * 0.2 + (odd ? 0.1 : 0), y: PILE_Y0 + LOG_R + k * ROW_H, k, n });
  }

// ---------------------------------------------------------------- shared log geometry
const LOG_GEOS = new Map();
const BARKS = [BARK, [0x6e4626, 0x7e5230, 0x5e3c20], [0x8a5e36, 0x9a6a3c, 0x74502c]];
export function makeLogGeometry({ len = 1, r = 2.1, variant = 0 } = {}) {
  const key = `${len}:${r}:${variant}`;
  let geo = LOG_GEOS.get(key);
  if (geo) return geo;
  const v = new VoxelModel();
  const half = Math.round((len / VF) / 2);
  log(v, 'x', -half, half - 1, 0, 0, r, { bark: BARKS[variant % 3], s: variant });
  // a knot and a stubby twig so they don't read as pipes
  const R = Math.ceil(r);
  v.set(-half + 3 + variant, R - 1, 0, 0x553620);
  if (variant % 3 === 1) { v.set(Math.floor(half / 2), R, -1, 0x6a4424); v.set(Math.floor(half / 2) + 1, R + 1, -1, 0x6a4424); v.set(Math.floor(half / 2) + 2, R + 1, -1, LEAF[1]); }
  if (variant % 3 === 2) v.set(-2, -R, 1, 0x6a9a3a); // moss
  geo = v.build({ pivot: [0, 0, 0], scale: VF });
  LOG_GEOS.set(key, geo);
  return geo;
}

// ---------------------------------------------------------------- the shed body
function woodgarage(d, rnd, variant) {
  const { c, f } = d;
  const ROOF = [[0x8a5a3a, 0x7a4c30, 0x5e3a24], [0x4a7a52, 0x3e6a46, 0x2c4e34], [0xb0503a, 0x9a442e, 0x72301e]][variant];
  const X0 = -9, X1 = 8, Z0 = -9, Z1 = 5, ZR = -4; // frame (coarse, inclusive); the roof stops at ZR
  // lean-to roof over the back half, sloping down to the front: the log pile
  // in front of it stays in the sun and in view
  const rY = (z) => 19 - Math.round(((Math.min(ZR, Math.max(Z0, z)) - Z0) / (ZR - Z0)) * 4);
  const board = (x, y, z, u) => {
    const b = (u + 40) % 3;
    return y === 1 ? WOOD_M : (u + 40) % 4 === 3 && y % 5 === 2 ? WOOD_D : b === 0 ? toneOf(WOOD, u, 0, z, 3) : WOOD[b];
  };
  // floor: a plank deck under the rack, packed dirt round it
  c.box(X0, 0, Z0, X1, 0, Z1 + 1, (x, y, z) => (z <= Z1 && x > X0 && x < X1 ? ((x + 40) % 2 ? WOOD_M : 0x7a4e2c) : toneOf([0x8a6a48, 0x7a5a3a, 0x9a7a52], x, 0, z, 2)));
  // back wall + the covered part of the side walls (boards), corner posts
  for (let y = 1; y < rY(Z0); y++) for (let x = X0; x <= X1; x++) c.set(x, y, Z0, x === X0 || x === X1 ? WOOD_D : board(x, y, Z0, x));
  for (let z = Z0 + 1; z <= ZR; z++)
    for (let y = 1; y < rY(z); y++) { c.set(X0, y, z, z === ZR ? WOOD_D : board(X0, y, z, z)); c.set(X1, y, z, z === ZR ? WOOD_D : board(X1, y, z, z + 1)); }
  // a little four-pane window in the left wall
  for (let y = 9; y <= 12; y++) for (let z = -8; z <= -5; z++) c.set(X0, y, z, y === 9 || y === 12 || z === -8 || z === -5 ? WOOD_L : 0x9ad0e8);
  // the open front: low rail fence along the sides, stout posts at the corners
  for (let z = ZR + 1; z <= Z1; z++) for (const x of [X0, X1]) { c.set(x, 3, z, WOOD_M); c.set(x, 6, z, WOOD_M); }
  for (const x of [X0, X1]) for (let y = 0; y <= 8; y++) c.set(x, y, Z1, y === 0 ? pick(rnd, STONE) : y === 8 ? WOOD_M : WOOD_D);
  for (const x of [X0, X1]) for (let y = 1; y <= 6; y++) c.set(x, y, 0, WOOD_D);
  // roof: shingle rows stepping down to the front, overhanging, dark lip
  for (let z = Z0 - 1; z <= ZR + 2; z++)
    for (let x = X0 - 1; x <= X1 + 1; x++) {
      const y = rY(z) + 1;
      const edge = z === Z0 - 1 || z === ZR + 2 || x === X0 - 1 || x === X1 + 1;
      c.set(x, y, z, edge ? ROOF[2] : (x + (y % 2) * 2 + 40) % 4 === 0 ? ROOF[1] : ROOF[0]);
      if (rY(z - 1) > rY(z) && z > Z0) c.set(x, y + 1, z, edge ? ROOF[2] : ROOF[1]);
    }
  for (let x = X0; x <= X1; x++) c.set(x, rY(ZR), ZR, WOOD_D); // header beam under the roof's lip
  // sleepers for the rack (logs lie front-to-back on them)
  log(c, 'x', X0 + 1, X1 - 1, 1.5, -6.5, 0.9, { ends: false });
  log(c, 'x', X0 + 1, X1 - 1, 1.5, 1.5, 0.9, { ends: false });
  // ---- fine details
  // the big WOOD sign standing on the roof ridge at the back: cream board,
  // brown frame, chunky red letters (each glyph pixel 2x2) with a soft shadow
  const SZ = -15, SY0 = 42, SY1 = 54, SX0 = -19, SX1 = 18;
  for (const x of [SX0 + 4, SX1 - 4]) f.box(x, 38, SZ - 1, x + 1, SY0, SZ - 1, WOOD_D); // legs
  f.box(SX0, SY0, SZ, SX1, SY1, SZ, (x, y) => (x === SX0 || x === SX1 || y === SY0 || y === SY1 ? 0x8a5a32 : y === SY1 - 1 || x === SX0 + 1 ? 0xfff6e0 : PAPER));
  const LET = [
    ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
    ['.#.', '#.#', '#.#', '#.#', '.#.'],
    ['.#.', '#.#', '#.#', '#.#', '.#.'],
    ['##.', '#.#', '#.#', '#.#', '##.'],
  ];
  let lx = SX0 + 2;
  for (const rows of LET) {
    rows.forEach((row, r) => {
      for (let cI = 0; cI < row.length; cI++) {
        if (row[cI] !== '#') continue;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const fx = lx + cI * 2 + i, fy = SY1 - 2 - r * 2 - j;
          f.set(fx, fy, SZ + 1, RED_D);
          if (!f.has(fx + 1, fy - 1, SZ + 1)) f.set(fx + 1, fy - 1, SZ + 1, 0xc8a878);
        }
      }
    });
    lx += rows[0].length * 2 + 2;
  }
  // the shadow pass may have painted over earlier letters: repaint them
  lx = SX0 + 2;
  for (const rows of LET) {
    rows.forEach((row, r) => { for (let cI = 0; cI < row.length; cI++) if (row[cI] === '#') for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) f.set(lx + cI * 2 + i, SY1 - 2 - r * 2 - j, SZ + 1, RED_D); });
    lx += rows[0].length * 2 + 2;
  }
  for (const x of [SX0, SX1]) { f.set(x, SY1, SZ + 1, IRON_L); f.set(x, SY0, SZ + 1, IRON_L); }
  // lantern on a bracket off the front-right post (glows warm)
  f.box(13, 16, 11, 16, 16, 11, IRON);
  f.box(13, 12, 10, 15, 15, 12, (x, y) => (y === 12 || y === 15 ? IRON : 0xffe6a0));
  d.gf.set(14, 13, 12, WARM); d.gf.set(14, 14, 12, 0xfff0b0);
  // a two-man saw on the right wall inside, an axe stuck in a chopping stump out front
  f.box(15, 24, -16, 15, 24, -10, METAL); for (let z = -16; z <= -10; z += 2) f.set(15, 23, z, METAL_D);
  f.box(15, 23, -17, 15, 25, -17, WOOD_D); f.box(15, 23, -9, 15, 25, -9, WOOD_D);
  log(f, 'y', 0, 4, 12.5, 16.5, 3, { s: 2 });
  f.line(12, 5, 16, 9, 9, 16, WOOD_L); f.set(9, 10, 16, WOOD_D);
  f.box(12, 5, 15, 14, 6, 17, METAL); f.set(14, 6, 15, 0xe0e8f0);
  // wood chips + sawdust across the apron, a couple of stray split logs
  for (let i = 0; i < 26; i++) {
    const x = -18 + Math.floor(rnd() * 36), z = 13 + Math.floor(rnd() * 6);
    if (x >= 9 && x <= 16 && z >= 13) continue;
    f.set(x, 2, z, pick(rnd, [WOOD_L, 0xe0c090, 0xc8a06a, WOOD[0]]));
  }
  log(f, 'x', -18, -11, 2.5, 17.5, 2.2, { s: 5 });
  // brass tooth emblem on the front-left post (the beaver crew's mark)
  f.box(-18, 11, 12, -17, 13, 12, BRASS); f.set(-18, 11, 12, 0xffffff); f.set(-17, 11, 12, 0xffffff); f.set(-18, 13, 12, BRASS_D);
  tufts(c, rnd, 10, { w: 2, d: 2 }, (x, z) => x >= X0 - 1 && x <= X1 + 1 && z >= Z0 - 1 && z <= Z1 + 3);
  void INK;
}

// ---------------------------------------------------------------- export
const BASE = defineModels({ woodgarage }, { woodgarage: { w: 2, d: 2 } });

function garage(opts = {}) {
  const root = BASE.woodgarage(opts);
  root.userData.dropPoint = { x: 0, z: 1.05 };
  // the log pile: one mesh per rack slot, shown bottom-up as the stock grows
  const pile = new THREE.Group();
  pile.name = 'logPile';
  root.add(pile);
  const mat = voxelMaterial();
  const logs = SLOTS.map((s) => {
    const h = ((s.n * 2654435761) >>> 0) / 4294967296;
    const m = new THREE.Mesh(makeLogGeometry({ len: h < 0.5 ? 0.9 : 0.95, r: 2.1, variant: Math.floor(h * 3) }), mat);
    m.rotation.y = Math.PI / 2 + (h - 0.5) * 0.06;
    m.position.set(s.x, s.y, -0.15 + (h - 0.5) * 0.08);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.tintable = true;
    m.visible = false;
    pile.add(m);
    return { m, pop: 0, base: m.position.y };
  });
  let shown = 0;
  const setStock = (n, cap = GARAGE_CAP) => {
    const want = Math.max(0, Math.min(SLOTS.length, Math.round((Math.max(0, n) / Math.max(1, cap)) * SLOTS.length)));
    root.userData.stock = n;
    if (want === shown) return;
    for (let i = 0; i < logs.length; i++) {
      const L = logs[i];
      const vis = i < want;
      if (vis && !L.m.visible) L.pop = root.userData.live && !opts.preview ? 1e-4 : 0;
      L.m.visible = vis;
      if (!vis) L.pop = 0;
      if (!L.pop) { L.m.scale.setScalar(1); L.m.position.y = L.base; }
    }
    shown = want;
  };
  const baseUpdate = root.userData.update;
  root.userData.update = (dt, t) => {
    baseUpdate?.(dt, t);
    root.userData.live = true;
    const step = Math.min(0.1, dt || 0);
    for (const L of logs) {
      if (!L.pop) continue;
      L.pop += step / 0.38;
      const k = Math.min(1, L.pop);
      // drop in from above with a squashy overshoot
      const s = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k) : 1;
      L.m.scale.set(s, 2 - s, s);
      L.m.position.y = L.base + (1 - Math.min(1, k * 1.6)) ** 2 * 0.5;
      if (k >= 1) { L.pop = 0; L.m.scale.setScalar(1); L.m.position.y = L.base; }
    }
  };
  root.userData.setStock = setStock;
  root.userData.slots = SLOTS.length;
  setStock(opts.stock ?? (opts.preview ? 6 : 0), opts.cap ?? GARAGE_CAP);
  return root;
}

export const WOODGARAGE_FOOTPRINT = { w: 2, d: 2 };
export const STRUCTURE_MODELS = { woodgarage: garage };
