// [F&S mining] Voxel models for the mining layer (same kit + conventions as
// facilityModels.js: chunky 0.1 bodies, 0.05 fine details, glow layers, parts
// that animate; root at the ground centre, front faces +Z, 1 tile = 1 unit).
//
//   STRUCTURE_MODELS.oreshed({ variant, seed })   the Ore Shed (2x2, beaver-built build)
//     root.userData.setStock(n)   ore piles in the bins grow with the stockpile
//     root.userData.dropPoint     { x, z } local: where beavers drop the sacks
//   makeVein(kind, seed)          a glittering ore outcrop. userData.setLeft(0..1) shrinks the
//                                 ore (0 = picked clean: rubble), userData.update(dt, t)
//   makeOreSack(kind)             a burlap sack of ore (on the ground, on a beaver's shoulder)
//   makeMineEntrance()            timber portal into the rock, BEAR MINE sign, lantern
//   makeMineScaffold()            the mine under construction
//   makeCanteen()                 tin-roofed picnic table, lunch bell, coffee urn.
//                                 userData.setMeals(n) shows up to 8 lunch pails on the table
//   makeOreBin()                  wooden hopper. userData.setFill(0..1)
//   makeRail(len)                 straight track along +Z, `len` tiles
//   makeMineCart()                userData.setLoad(kind | null), userData.spin(rad)
//   makeOreDrill()                steam drill tower (bit spins, piston pumps)
//   makeExcavator()               steam shovel on tracks. userData.dig(k 0..1) poses the boom
//   makeFlintShack()              Flint's shack (userData.door: local door point for HomeMode)
//   makePailLine(len)             the lunch pail pulley post + a pail. userData.setPail(t 0..1)
//   beaverPickGeo() / beaverHelmetGeo()   beaver kit (critter voxel units, see Mining.js)
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';
import { mulberry32 } from '../../core/rng.js';
import { P, VC, VF, defineModels, tufts, text, textW, pick, toneOf, tone, ball, log, sparkle, fw, glowMaterial } from './facilityModels.js';

const { WOOD, WOOD_D, WOOD_M, WOOD_L, STONE, METAL, METAL_D, METAL_L, IRON, IRON_L, BRASS, BRASS_D, BRASS_L, RED, RED_D, WARM, PAPER, CREAM, ROPE } = P;
const PI = Math.PI;

// ore colours (coarse rock flecks + fine nuggets), per resource id
export const ORE_COL = {
  stone: { a: [0xa8a29a, 0x969088, 0xbab4aa], hi: 0xdcd6cc, glint: 0xffffff },
  coal: { a: [0x2a2830, 0x34323c, 0x22202a], hi: 0x6a6878, glint: 0xc8d0ff },
  copper: { a: [0xd0763e, 0xb8602e, 0x4ab08a], hi: 0xf0a868, glint: 0xffe0b0 },
  iron: { a: [0xa85a3a, 0x8a4a30, 0xc07850], hi: 0xd8a088, glint: 0xffe8d8 },
  gold: { a: [0xffcc34, 0xe8a820, 0xfff09a], hi: 0xffffff, glint: 0xffffc0 },
  crystal: { a: [0xa080e8, 0x7a5ac8, 0xd0c0ff], hi: 0xf0e8ff, glint: 0xffffff },
};
const ROCK = [0x8e8690, 0x7e7680, 0x9e96a0, 0x6e6870];
const DIRT = [0x8a6a48, 0x7a5a3a, 0x9a7a52];
const TIN = [0x9aa4ae, 0x8a949e, 0xb0bac4];

const mat = () => voxelMaterial();
const GEO = new Map();
const memo = (key, make) => { let g = GEO.get(key); if (!g) { g = make(); GEO.set(key, g); } return g; };
const cachedMesh = (key, make, scale = VC, glow = false) => {
  const geo = memo(key, () => make().build({ pivot: [0, 0, 0], scale, ao: !glow }));
  const m = new THREE.Mesh(geo, glow ? glowMaterial() : mat());
  m.castShadow = !glow; m.receiveShadow = !glow;
  m.userData.tintable = !glow;
  if (glow) m.userData.glow = true;
  return m;
};

// a lumpy rock: overlapping balls, top-lit tones
function rockLump(v, cx, cy, cz, r, rnd, cols = ROCK) {
  ball(v, cx, cy, cz, r, (x, y, z) => (y > cy + r * 0.4 ? cols[2] : toneOf(cols, x, y, z, 7)));
  for (let i = 0; i < 3; i++) ball(v, cx + (rnd() - 0.5) * r, cy + rnd() * r * 0.3, cz + (rnd() - 0.5) * r, r * (0.45 + rnd() * 0.3), (x, y, z) => toneOf(cols, x, y, z, 3));
}

// ================================================================= the Ore Shed (2x2)
function oreshed(d, rnd, variant) {
  const { c, f } = d;
  const ROOF = [TIN, [0xb05a3a, 0x9a4a2e, 0xc06a48], [0x5a7a6a, 0x4a6a5a, 0x6a8a7a]][variant];
  const X0 = -9, X1 = 8, Z0 = -9, Z1 = 6;
  // packed gravel yard
  c.box(X0 - 1, 0, Z0, X1 + 1, 0, Z1 + 2, (x, y, z) => toneOf([0x9a948a, 0x8a847a, 0xa8a296], x, 0, z, 4));
  // fieldstone back wall, plank side walls
  for (let x = X0; x <= X1; x++) for (let y = 1; y <= 14; y++) c.set(x, y, Z0, (x + (y >> 1) * 2 + 40) % 5 === 0 ? 0x5e5860 : toneOf(ROCK, x, y, Z0, 2));
  for (let z = Z0 + 1; z <= -2; z++) for (let y = 1; y <= 13 - Math.floor((z - Z0) / 3); y++) for (const x of [X0, X1]) c.set(x, y, z, (z + 40) % 3 ? toneOf(WOOD, x, y, z, 1) : WOOD_D);
  // corner posts out front
  for (const x of [X0, X1]) for (let y = 1; y <= 10; y++) c.set(x, y, Z1 - 1, WOOD_D);
  // corrugated tin roof sloping to the front
  for (let z = Z0 - 1; z <= Z1 + 1; z++) {
    const y = 15 - Math.round(((z - Z0 + 1) / (Z1 - Z0 + 2)) * 5);
    for (let x = X0 - 1; x <= X1 + 1; x++) c.set(x, y, z, (x + 40) % 2 ? ROOF[0] : ROOF[1]);
  }
  // three bins: low plank walls across the front half
  for (const bx of [-8, -2, 4]) {
    for (let z = -4; z <= 4; z++) for (let y = 1; y <= 3; y++) { c.set(bx, y, z, WOOD_M); c.set(bx + 5, y, z, WOOD_M); }
    for (let x = bx; x <= bx + 5; x++) for (let y = 1; y <= 3; y++) c.set(x, y, 4, y === 3 ? WOOD_L : toneOf(WOOD, x, y, 4, 2));
  }
  // the ORE sign on the roof
  const tw = textW('ORE SHED');
  const sx0 = -Math.ceil(tw / 2) - 2;
  f.box(sx0, 26, -15, sx0 + tw + 3, 34, -15, (x, y) => (x === sx0 || x === sx0 + tw + 3 || y === 26 || y === 34 ? WOOD_D : PAPER));
  text(f, 'ORE SHED', sx0 + 2, 32, -14, RED_D);
  for (const x of [sx0 + 3, sx0 + tw]) f.box(x, 22, -16, x, 26, -16, WOOD_D);
  // a pickaxe and a shovel hung on the back wall, a lantern on the left post
  f.line(-12, 8, -16, -6, 20, -16, WOOD_L); f.box(-9, 19, -16, -4, 20, -16, METAL);
  f.line(10, 6, -16, 10, 22, -16, WOOD_L); f.box(9, 4, -16, 11, 7, -16, METAL);
  f.box(-19, 15, 10, -17, 18, 11, (x, y) => (y === 15 || y === 18 ? IRON : 0xffe6a0));
  d.gf.set(-18, 16, 11, WARM); d.gf.set(-18, 17, 11, 0xfff0b0);
  sparkle(d, -18, 19, 11, { period: 3.2 });
  tufts(c, rnd, 8, { w: 2, d: 2 }, (x, z) => x >= X0 - 1 && x <= X1 + 1 && z >= Z0 - 1 && z <= Z1 + 2);
}

// the ore heaps in the three bins (shown as the stockpile grows)
const BIN_KINDS = [['coal', -5.5], ['copper', 0.5], ['iron', 6.5]];
function heapGeo(kind, lvl) {
  return memo(`heap:${kind}:${lvl}`, () => {
    const v = new VoxelModel();
    const C = ORE_COL[kind];
    const r = 1.6 + lvl * 0.7;
    const rnd = mulberry32(lvl * 31 + kind.length);
    ball(v, 0, 0, 0, r, (x, y, z) => (y < 0 ? null : rnd() < 0.18 ? C.hi : toneOf(C.a, x, y, z, 5)));
    return v.build({ pivot: [0, 0, 0], scale: VC });
  });
}

const BASE = defineModels({ oreshed }, { oreshed: { w: 2, d: 2 } });
function oreshedModel(opts = {}) {
  const root = BASE.oreshed(opts);
  root.userData.dropPoint = { x: 0, z: 1.0 };
  const heaps = BIN_KINDS.map(([kind, x]) => {
    const g = new THREE.Group();
    g.position.set(x * VC + 0.05, 0.1, 0);
    root.add(g);
    const lv = [0, 1, 2].map((l) => { const m = new THREE.Mesh(heapGeo(kind, l), mat()); m.castShadow = m.receiveShadow = true; m.userData.tintable = true; m.visible = false; g.add(m); return m; });
    return lv;
  });
  let shown = -1;
  root.userData.setStock = (n) => {
    const lvl = n <= 0 ? -1 : n < 15 ? 0 : n < 60 ? 1 : 2;
    if (lvl === shown) return;
    shown = lvl;
    for (const lv of heaps) lv.forEach((m, i) => { m.visible = i === lvl; });
  };
  return root;
}

export const STRUCTURE_MODELS = { oreshed: oreshedModel };

// ================================================================= veins
function veinBase(kind, seed) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed * 977 + 13);
  rockLump(v, 0, 1.5, -0.5, 3.6, rnd);
  rockLump(v, 2.5, 1, 1, 2.2, rnd);
  rockLump(v, -2.6, 0.8, 1.2, 1.9, rnd);
  v.paint((x, y, z, col) => (y < 0 ? null : col));
  return v;
}
// ore chunks: three groups (big / mid / small) so a vein visibly empties
function veinOre(kind, seed, part) {
  const C = ORE_COL[kind];
  const v = new VoxelModel();
  const rnd = mulberry32(seed * 131 + part * 17 + kind.length);
  const spots = [[[-1, 4, 2], [1.5, 3, 3]], [[3, 2.5, 2.4], [-3, 2, 2.6]], [[0.5, 5.5, -0.5], [-2, 4.2, -1.5]]][part];
  for (const [x, y, z] of spots) {
    if (kind === 'crystal') {
      // prisms poking out of the rock
      const h = 3 + Math.floor(rnd() * 3);
      for (let k = 0; k < h; k++) for (let i = -1; i <= 0; i++) for (let j = -1; j <= 0; j++) if (k < h - 1 || (i === 0 && j === 0)) v.set(Math.round(x + i + k * 0.3), Math.round(y + k), Math.round(z + j), k === h - 1 ? C.hi : toneOf(C.a, i, k, j, 2));
    } else if (kind === 'gold') {
      ball(v, x, y, z, 1.3, (xx, yy, zz) => (yy > y + 0.3 ? C.hi : toneOf(C.a, xx, yy, zz, 1)));
    } else if (kind === 'stone') {
      ball(v, x, y, z, 1.4, (xx, yy, zz) => toneOf([0xc0b8ae, 0xaaa298, 0xd0c8be], xx, yy, zz, 1));
    } else {
      ball(v, x, y, z, 1.25, (xx, yy, zz) => (rnd() < 0.2 ? C.hi : toneOf(C.a, xx, yy, zz, 1)));
      v.set(Math.round(x + 1), Math.round(y - 1), Math.round(z + 1), C.a[0]);
    }
  }
  return v;
}
function rubbleGeo(seed) {
  return memo('rubble:' + (seed % 4), () => {
    const v = new VoxelModel();
    const rnd = mulberry32(seed * 71 + 5);
    for (let i = 0; i < 7; i++) ball(v, (rnd() - 0.5) * 6, 0.3, (rnd() - 0.5) * 5, 0.8 + rnd() * 0.9, (x, y, z) => (y < 0 ? null : toneOf(ROCK, x, y, z, i)));
    return v.build({ pivot: [0, 0, 0], scale: VC });
  });
}
export function makeVein(kind = 'copper', seed = 1) {
  const root = new THREE.Group();
  root.name = 'vein:' + kind;
  const base = new THREE.Mesh(memo(`vb:${seed % 6}`, () => veinBase(kind, seed % 6).build({ pivot: [0, 0, 0], scale: VC })), mat());
  base.castShadow = base.receiveShadow = true;
  root.add(base);
  const ore = [0, 1, 2].map((p) => {
    const m = new THREE.Mesh(memo(`vo:${kind}:${seed % 6}:${p}`, () => veinOre(kind, seed % 6, p).build({ pivot: [0, 0, 0], scale: VC })), mat());
    m.castShadow = true;
    root.add(m);
    return m;
  });
  const rubble = new THREE.Mesh(rubbleGeo(seed), mat());
  rubble.castShadow = rubble.receiveShadow = true; rubble.visible = false;
  root.add(rubble);
  // twinkles (unlit crosses) that pop on and off
  const glints = [];
  const gm = new THREE.MeshBasicMaterial({ color: ORE_COL[kind].glint });
  const gg = memo('glint', () => { const v = new VoxelModel(); v.set(0, 0, 0, 0xffffff); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) v.set(a, b, 0, 0xffffff); return v.build({ pivot: [0.5, 0.5, 0.5], scale: 0.035, ao: false }); });
  const spots = [[-0.12, 0.5, 0.22], [0.28, 0.32, 0.26], [0.04, 0.62, -0.02]];
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(gg, gm); m.position.set(...spots[i]); m.visible = false; root.add(m); glints.push(m); }
  let left = 1;
  root.userData.setLeft = (k) => {
    left = Math.max(0, Math.min(1, k));
    ore[0].visible = left > 0.66; ore[1].visible = left > 0.33; ore[2].visible = left > 0.001;
    base.visible = left > 0.001; rubble.visible = left <= 0.001;
  };
  const off = (seed * 0.37) % 7;
  root.userData.update = (dt, t) => {
    for (let i = 0; i < glints.length; i++) {
      const u = ((t * (kind === 'gold' || kind === 'crystal' ? 0.7 : 0.45) + off + i * 0.37) % 1.6);
      const s = u < 0.4 && left > 0.001 ? Math.sin((u / 0.4) * PI) : 0;
      glints[i].visible = s > 0.05;
      glints[i].scale.setScalar(0.4 + s);
      glints[i].quaternion.copy(root.userData.camQ || glints[i].quaternion);
    }
  };
  root.userData.setLeft(1);
  return root;
}

export function makeOreSack(kind = 'coal') {
  return cachedMesh('sack:' + kind, () => {
    const v = new VoxelModel();
    const C = ORE_COL[kind] || ORE_COL.stone;
    ball(v, 0, 3, 0, 3.4, (x, y, z) => (y < 0 ? null : toneOf([0xc8a870, 0xb89860, 0xd8b880], x, y, z, 3)));
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (x * x + z * z <= 5) v.set(x, 6, z, toneOf(C.a, x, 6, z, 1));
    v.set(0, 7, 0, C.hi); v.set(-1, 7, 1, C.a[0]);
    for (let a = 0; a < 12; a++) v.set(Math.round(Math.cos(a / 12 * PI * 2) * 3), 5, Math.round(Math.sin(a / 12 * PI * 2) * 3), ROPE);
    return v;
  }, VF);
}

// ================================================================= the mine site
export function makeMineEntrance() {
  const root = new THREE.Group();
  root.name = 'mineEntrance';
  root.add(cachedMesh('mine:body', () => {
    const v = new VoxelModel();
    const rnd = mulberry32(77);
    // the rock face it is cut into
    for (let i = 0; i < 9; i++) rockLump(v, -12 + i * 3 + (rnd() - 0.5) * 2, 6 + rnd() * 6, -9 + rnd() * 3, 5 + rnd() * 2.5, rnd);
    rockLump(v, -14, 3, -2, 4, rnd); rockLump(v, 14, 3, -2, 4.4, rnd);
    v.paint((x, y, z, col) => (y < 0 ? null : col));
    // carve the tunnel mouth
    for (let x = -5; x <= 5; x++) for (let y = 0; y <= 13; y++) for (let z = -8; z <= 8; z++) {
      const arch = y <= 9 || Math.hypot(x, (y - 9) * 1.2) <= 5.5;
      if (arch && Math.abs(x) <= 5) v.set(x, y, z, null);
    }
    // timber frame: posts, cap beam, braces
    for (const x of [-6, 5]) for (let y = 0; y <= 13; y++) for (const z of [0, 1]) v.set(x, y, z, (y % 4) ? WOOD_M : WOOD_D);
    for (let x = -7; x <= 6; x++) for (const y of [13, 14]) for (const z of [0, 1]) v.set(x, y, z, y === 14 ? WOOD_D : toneOf(WOOD, x, y, z, 2));
    for (let k = 0; k < 3; k++) { v.set(-5 + k, 12 - k, 1, WOOD_D); v.set(4 - k, 12 - k, 1, WOOD_D); }
    // gravel apron
    for (let x = -9; x <= 8; x++) for (let z = 0; z <= 6; z++) if (!v.has(x, 0, z)) v.set(x, 0, z, toneOf(DIRT, x, 0, z, 3));
    return v;
  }));
  // the dark inside (unlit, so it reads as a hole)
  root.add(cachedMesh('mine:dark', () => { const v = new VoxelModel(); for (let x = -5; x <= 4; x++) for (let y = 1; y <= 12; y++) if (y <= 9 || Math.hypot(x + 0.5, (y - 9) * 1.2) <= 5.2) v.set(x, y, -6, y < 3 ? 0x1a1418 : 0x0e0a10); return v; }, VC, true));
  // sign: BEAR MINE on a plank over the door
  root.add(cachedMesh('mine:sign', () => {
    const v = new VoxelModel();
    const s = 'BEAR MINE', tw = textW(s), x0 = -Math.ceil(tw / 2) - 2;
    v.box(x0, 30, 3, x0 + tw + 3, 38, 3, (x, y) => (x === x0 || x === x0 + tw + 3 || y === 30 || y === 38 ? WOOD_D : 0xf0d8a0));
    text(v, s, x0 + 2, 36, 4, RED_D);
    for (const x of [x0 + 2, x0 + tw + 1]) v.set(x, 37, 4, IRON_L);
    // rails coming out of the tunnel
    for (let z = -12; z <= 30; z++) { for (const x of [-5, 4]) v.set(x, 1, z, METAL_D); if ((z + 40) % 4 === 0) v.box(-7, 0, z, 6, 0, z, WOOD_D); }
    return v;
  }, VF));
  // a hanging lantern that flickers
  const lantern = new THREE.Group();
  lantern.position.set(0.62, 1.32, 0.18);
  lantern.add(cachedMesh('mine:lantern', () => { const v = new VoxelModel(); v.box(-1, 0, -1, 1, 0, 1, IRON); v.box(-1, 4, -1, 1, 4, 1, IRON); v.set(0, 5, 0, IRON); v.set(0, 6, 0, IRON); return v; }, VF));
  const flame = cachedMesh('mine:flame', () => { const v = new VoxelModel(); v.box(-1, 1, -1, 1, 3, 1, 0xffd070); v.set(0, 2, 0, 0xffffff); return v; }, VF, true);
  lantern.add(flame);
  root.add(lantern);
  root.userData.update = (dt, t) => {
    lantern.rotation.z = Math.sin(t * 1.3) * 0.08;
    const n = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 17.3) * 0.3;
    flame.scale.set(1 - n * 0.08, 1 + n * 0.16, 1 - n * 0.08);
  };
  root.userData.door = new THREE.Vector3(0, 0, 0.6);
  return root;
}

// the old boarded-up seam where the Bear Mine will go (before you dig it)
export function makeOldAdit() {
  const root = new THREE.Group();
  root.name = 'oldAdit';
  root.add(cachedMesh('adit:body', () => {
    const v = new VoxelModel();
    const rnd = mulberry32(31);
    for (let i = 0; i < 7; i++) rockLump(v, -10 + i * 3.4 + (rnd() - 0.5) * 2, 5 + rnd() * 5, -9 + rnd() * 2, 4.5 + rnd() * 2.5, rnd);
    v.paint((x, y, z, col) => (y < 0 ? null : col));
    for (let x = -4; x <= 4; x++) for (let y = 0; y <= 8; y++) for (let z = -7; z <= 6; z++) if (y <= 6 || Math.hypot(x, (y - 6) * 1.3) <= 4.5) v.set(x, y, z, null);
    // old planks nailed across the hole, a crooked post
    for (let x = -5; x <= 5; x++) { v.set(x, 3 + Math.round(x * 0.15), 0, (x + 40) % 3 ? WOOD_M : WOOD_D); v.set(x, 7 - Math.round(x * 0.2), 0, (x + 40) % 4 ? 0x8a6a48 : WOOD_D); }
    for (const x of [-5, 4]) for (let y = 0; y <= 9; y++) v.set(x, y, 0, 0x6a5038);
    for (let x = -9; x <= 8; x++) for (let z = 0; z <= 5; z++) if (!v.has(x, 0, z)) v.set(x, 0, z, toneOf(DIRT, x, 0, z, 2));
    // rusty rails poking out of the rubble
    for (let z = 1; z <= 5; z++) { v.set(-2, 1, z, 0x8a5a3a); v.set(1, 1, z, 0x8a5a3a); }
    return v;
  }));
  root.add(cachedMesh('adit:dark', () => { const v = new VoxelModel(); for (let x = -4; x <= 3; x++) for (let y = 1; y <= 9; y++) if (y <= 6 || Math.hypot(x + 0.5, (y - 6) * 1.3) <= 4.2) v.set(x, y, -6, 0x0e0a10); return v; }, VC, true));
  root.add(cachedMesh('adit:sign', () => {
    const v = new VoxelModel();
    const s = 'KEEP OUT', tw = textW(s), x0 = -Math.ceil(tw / 2) - 2;
    v.box(x0, 14, 4, x0 + tw + 3, 21, 4, (x, y) => (x === x0 || x === x0 + tw + 3 || y === 14 || y === 21 ? WOOD_D : 0xe8d8b0));
    text(v, s, x0 + 2, 19, 5, RED_D);
    return v;
  }, VF));
  return root;
}

export function makeMineScaffold() {
  return cachedMesh('mine:scaffold', () => {
    const v = new VoxelModel();
    const rnd = mulberry32(5);
    for (let i = 0; i < 7; i++) rockLump(v, -11 + i * 3.5, 5 + rnd() * 4, -9, 5 + rnd() * 2, rnd);
    v.paint((x, y, z, col) => (y < 0 ? null : col));
    for (const x of [-7, -2, 3, 7]) for (let y = 0; y <= 16; y++) v.set(x, y, 2, WOOD_L);
    for (const y of [5, 10, 15]) for (let x = -8; x <= 8; x++) v.set(x, y, 2, (x + y) % 3 ? WOOD_M : WOOD_D);
    for (let k = 0; k < 10; k++) { v.set(-7 + k, k + 5, 3, WOOD_D); v.set(7 - k, k + 5, 3, WOOD_D); }
    // caution stripes
    for (let x = -8; x <= 8; x++) v.set(x, 1, 4, (x + 40) % 4 < 2 ? 0xffd23a : 0x2a2230);
    for (let x = -9; x <= 9; x++) for (let z = 0; z <= 6; z++) if (!v.has(x, 0, z)) v.set(x, 0, z, toneOf(DIRT, x, 0, z, 3));
    return v;
  });
}

export function makeCanteen() {
  const root = new THREE.Group();
  root.name = 'canteen';
  root.add(cachedMesh('canteen:body', () => {
    const v = new VoxelModel();
    // tin awning on four posts
    for (const x of [-9, 8]) for (const z of [-5, 4]) for (let y = 0; y <= 13; y++) v.set(x, y, z, WOOD_D);
    for (let x = -10; x <= 9; x++) for (let z = -6; z <= 5; z++) v.set(x, 14 + (z < 0 ? 1 : 0), z, (x + 40) % 2 ? TIN[0] : TIN[1]);
    for (let x = -10; x <= 9; x++) v.set(x, 14, 5, RED);
    // the picnic table + two benches
    for (let x = -6; x <= 5; x++) for (let z = -2; z <= 1; z++) v.set(x, 6, z, toneOf(WOOD, x, 6, z, 2));
    for (const x of [-5, 4]) for (let y = 0; y <= 5; y++) { v.set(x, y, -1, WOOD_D); v.set(x, y, 0, WOOD_D); }
    for (const z of [-4, 3]) { for (let x = -6; x <= 5; x++) v.set(x, 3, z, WOOD_L); for (const x of [-5, 4]) for (let y = 0; y <= 2; y++) v.set(x, y, z, WOOD_D); }
    // red-check tablecloth runner
    for (let x = -6; x <= 5; x++) v.set(x, 7, 0, (x + 40) % 2 ? RED : 0xf6f0e6);
    // gravel floor
    for (let x = -10; x <= 9; x++) for (let z = -6; z <= 5; z++) if (!v.has(x, 0, z)) v.set(x, 0, z, toneOf(DIRT, x, 0, z, 6));
    return v;
  }));
  root.add(cachedMesh('canteen:fine', () => {
    const v = new VoxelModel();
    // LUNCH chalkboard on the back posts
    const tw = textW('LUNCH');
    v.box(-tw / 2 - 3, 18, -11, tw / 2 + 3, 25, -11, (x, y) => (y === 18 || y === 25 || x <= -tw / 2 - 2 || x >= tw / 2 + 2 ? WOOD_D : 0x2a3430));
    text(v, 'LUNCH', -Math.ceil(tw / 2), 23, -10, 0xf6f2ea);
    // coffee urn with a tap
    v.box(14, 14, -6, 17, 22, -3, (x, y) => (y === 22 ? METAL_D : y % 3 === 0 ? METAL_L : METAL));
    v.set(15, 16, -2, IRON); v.set(15, 15, -2, IRON);
    // dinner triangle hanging from the front-right post
    v.line(17, 24, 9, 17, 18, 9, IRON); v.line(17, 18, 9, 21, 18, 9, METAL_L); v.line(17, 24, 9, 21, 18, 9, METAL_L);
    return v;
  }, VF));
  // lunch pails on the table (setMeals shows up to 8)
  const pails = [];
  for (let i = 0; i < 8; i++) {
    const m = cachedMesh('canteen:pail' + (i % 3), () => {
      const v = new VoxelModel();
      const col = [0xd23a2e, 0x3a7ad0, 0x4aa04a][i % 3];
      v.box(-2, 0, -1, 1, 2, 1, col); v.box(-2, 3, -1, 1, 3, 1, 0x2a2a34);
      v.set(-1, 4, 0, METAL_L); v.set(0, 4, 0, METAL_L); v.set(-2, 4, 0, METAL_L); v.set(1, 4, 0, METAL_L);
      return v;
    }, VF);
    m.position.set(-0.5 + (i % 4) * 0.32, 0.75, i < 4 ? -0.08 : 0.12);
    m.visible = false;
    root.add(m);
    pails.push(m);
  }
  root.userData.setMeals = (n) => { pails.forEach((m, i) => { m.visible = i < Math.min(8, Math.ceil(n)); }); };
  root.userData.steam = new THREE.Vector3(0.78, 1.15, -0.22);
  root.userData.bell = new THREE.Vector3(0.95, 1.1, 0.48);
  root.userData.seats = [[-0.4, -0.4], [0.2, -0.4], [-0.4, 0.33], [0.2, 0.33], [-0.1, -0.4], [-0.1, 0.33]];
  return root;
}

export function makeOreBin() {
  const root = new THREE.Group();
  root.add(cachedMesh('bin:body', () => {
    const v = new VoxelModel();
    // a timber hopper on legs, a chute down the front
    for (const x of [-4, 3]) for (const z of [-3, 2]) for (let y = 0; y <= 4; y++) v.set(x, y, z, WOOD_D);
    for (let y = 5; y <= 9; y++) for (let x = -5 - (y - 5) * 0.3; x <= 4 + (y - 5) * 0.3; x++) for (const z of [-4, 3]) v.set(Math.round(x), y, z, (y + 40) % 2 ? WOOD_M : toneOf(WOOD, x, y, z, 1));
    for (let y = 5; y <= 9; y++) for (let z = -4; z <= 3; z++) for (const s of [-1, 1]) v.set(Math.round(s < 0 ? -5 - (y - 5) * 0.3 : 4 + (y - 5) * 0.3), y, z, WOOD_M);
    for (let x = -4; x <= 3; x++) for (let z = -3; z <= 2; z++) v.set(x, 5, z, WOOD_D);
    for (let k = 0; k < 4; k++) for (let x = -1; x <= 0; x++) v.set(x, 4 - k, 3 + k, METAL_D);
    return v;
  }));
  const fill = [0, 1, 2].map((l) => {
    const m = cachedMesh('bin:fill' + l, () => {
      const v = new VoxelModel();
      const rnd = mulberry32(l + 9);
      const cols = [ORE_COL.coal, ORE_COL.copper, ORE_COL.iron, ORE_COL.stone, ORE_COL.gold];
      ball(v, 0, 0, 0, 3.4 + l * 0.8, (x, y, z) => (y < 0 ? null : toneOf(cols[Math.floor(rnd() * (l > 1 ? 5 : 4))].a, x, y, z, 1)));
      return v;
    });
    m.position.set(-0.05, 0.6 + l * 0.08, -0.05);
    m.visible = false;
    root.add(m);
    return m;
  });
  root.userData.setFill = (k) => { const lvl = k <= 0.02 ? -1 : k < 0.35 ? 0 : k < 0.7 ? 1 : 2; fill.forEach((m, i) => { m.visible = i === lvl; }); };
  root.userData.dump = new THREE.Vector3(0, 1.0, 0);
  return root;
}

export function makeRail(len = 4) {
  const n = Math.max(1, Math.round(len * 10));
  return cachedMesh('rail:' + n, () => {
    const v = new VoxelModel();
    for (let z = 0; z < n * 2; z++) { for (const x of [-5, 4]) v.set(x, 1, z, METAL_D); if (z % 4 === 1) v.box(-7, 0, z, 6, 0, z, WOOD_D); }
    return v;
  }, VF);
}

export function makeMineCart() {
  const root = new THREE.Group();
  root.name = 'mineCart';
  const body = new THREE.Group(); root.add(body);
  body.add(cachedMesh('cart:body', () => {
    const v = new VoxelModel();
    for (let x = -5; x <= 4; x++) for (let z = -6; z <= 5; z++) for (let y = 3; y <= 9; y++) {
      const wall = x === -5 || x === 4 || z === -6 || z === 5;
      const t = (y - 3) / 6;
      if (Math.abs(x + 0.5) > 4.5 + t * 0.5 || Math.abs(z + 0.5) > 5.5 + t * 0.5) continue;
      if (wall || y === 3) v.set(x, y, z, y === 9 ? IRON_L : (y === 5 || y === 7) && wall ? 0x6a5a4a : toneOf([0x5a5a64, 0x4a4a54, 0x6a6a74], x, y, z, 1));
    }
    for (const z of [-6, 5]) v.set(-1, 7, z, BRASS); // rivets
    return v;
  }, VF));
  const load = {};
  for (const k of Object.keys(ORE_COL)) {
    const m = cachedMesh('cart:load:' + k, () => { const v = new VoxelModel(); const C = ORE_COL[k]; ball(v, -0.5, 8, -0.5, 4.4, (x, y, z) => (y < 8 ? null : y > 10 ? C.hi : toneOf(C.a, x, y, z, 2))); return v; }, VF);
    m.visible = false; body.add(m); load[k] = m;
  }
  const wheels = [];
  for (const [x, z] of [[-0.24, -0.18], [0.22, -0.18], [-0.24, 0.16], [0.22, 0.16]]) {
    const w = cachedMesh('cart:wheel', () => { const v = new VoxelModel(); for (let y = -2; y <= 1; y++) for (let z = -2; z <= 1; z++) if (Math.hypot(y + 0.5, z + 0.5) <= 2.2) v.set(0, y, z, Math.abs(y + 0.5) < 1 && Math.abs(z + 0.5) < 1 ? IRON_L : IRON); return v; }, VF);
    const g = new THREE.Group(); g.position.set(x, 0.1, z); g.add(w); root.add(g); wheels.push(g);
  }
  root.userData.setLoad = (k) => { for (const [id, m] of Object.entries(load)) m.visible = id === k; };
  root.userData.spin = (a) => { for (const g of wheels) g.rotation.x = a; };
  root.userData.body = body;
  return root;
}

export function makeOreDrill() {
  const root = new THREE.Group();
  root.name = 'oreDrill';
  root.add(cachedMesh('drill:frame', () => {
    const v = new VoxelModel();
    // steel derrick on a plank pad, boiler at the side
    for (let x = -6; x <= 5; x++) for (let z = -5; z <= 4; z++) v.set(x, 0, z, toneOf(WOOD, x, 0, z, 3));
    for (const [x, z] of [[-4, -3], [3, -3], [-4, 2], [3, 2]]) for (let y = 1; y <= 22; y++) v.set(x + Math.round((y / 22) * (x < 0 ? 2 : -2)), y, z + Math.round((y / 22) * (z < 0 ? 2 : -2)), (y % 5) ? IRON_L : IRON);
    for (const y of [8, 15, 22]) for (let x = -3; x <= 2; x++) { v.set(x, y, -2, IRON); v.set(x, y, 1, IRON); }
    // boiler
    for (let y = 1; y <= 9; y++) for (let x = 6; x <= 10; x++) for (let z = -2; z <= 2; z++) if (Math.hypot(x - 8, z) <= 2.3) v.set(x, y, z, y === 5 ? BRASS : y > 8 ? IRON : 0x8a4a3a);
    for (let y = 10; y <= 17; y++) v.set(8, y, 0, IRON);
    // warning stripes on the pad edge
    for (let x = -6; x <= 5; x++) v.set(x, 1, 4, (x + 40) % 4 < 2 ? 0xffd23a : 0x2a2230);
    return v;
  }));
  // the spinning drill bit + its shaft (part)
  const bit = new THREE.Group(); bit.position.set(-0.05, 0, -0.05); root.add(bit);
  bit.add(cachedMesh('drill:bit', () => {
    const v = new VoxelModel();
    for (let y = 2; y <= 36; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y < 10 ? METAL_L : METAL);
    for (let y = 2; y <= 10; y++) { const a = y * 0.9; v.set(Math.round(Math.cos(a) * 2), y, Math.round(Math.sin(a) * 2), METAL_D); }
    v.box(-3, 36, -3, 2, 38, 2, 0xd8302a);
    return v;
  }, VF));
  // piston head that pumps
  const piston = new THREE.Group(); root.add(piston);
  piston.add(cachedMesh('drill:piston', () => { const v = new VoxelModel(); v.box(-4, 0, -4, 3, 3, 3, BRASS); v.box(-1, 4, -1, 0, 10, 0, METAL_L); return v; }, VF));
  piston.position.set(-0.05, 1.85, -0.05);
  root.userData.update = (dt, t, on = true) => {
    if (!on) return;
    bit.rotation.y = t * 9;
    bit.position.y = Math.abs(Math.sin(t * 2.2)) * -0.05;
    piston.position.y = 1.85 + Math.sin(t * 4.4) * 0.06;
  };
  root.userData.chimney = new THREE.Vector3(0.82, 1.8, 0);
  return root;
}

export function makeExcavator() {
  const root = new THREE.Group();
  root.name = 'excavator';
  const body = new THREE.Group(); root.add(body);
  body.add(cachedMesh('exc:base', () => {
    const v = new VoxelModel();
    // caterpillar tracks
    for (const x of [-8, 5]) for (let z = -8; z <= 7; z++) for (let y = 0; y <= 3; y++) for (let dx = 0; dx <= 2; dx++) {
      if ((z === -8 || z === 7) && (y === 0 || y === 3)) continue;
      v.set(x + dx, y, z, (z + y + 40) % 2 && (y === 0 || y === 3) ? 0x3a3a42 : 0x2a2a32);
    }
    for (const x of [-8, 5]) for (const z of [-6, -2, 2, 6]) v.set(x + 1, 2, z, 0x8a8a94);
    // turntable deck + cab with a boiler, a tall chimney
    v.box(-7, 4, -7, 6, 5, 6, IRON);
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 2; z++) for (let y = 6; y <= 13; y++) {
      const win = (z === 2 || x === 5) && y >= 9 && y <= 11 && (x + z) % 4 !== 0;
      v.set(x, y, z, win ? 0x9ad0e8 : y === 13 ? 0x2a2a32 : (y === 8 ? 0xd8a020 : toneOf([0xf2b82a, 0xe0a420, 0xfacc4a], x, y, z, 2)));
    }
    for (let x = -7; x <= 6; x++) for (let z = -7; z <= 3; z++) v.set(x, 14, z, 0x3a3a42);
    for (let y = 15; y <= 24; y++) for (let x = -5; x <= -4; x++) for (let z = -5; z <= -4; z++) v.set(x, y, z, y === 24 ? 0x6a6a74 : 0x2e2e36);
    // big BM letters on the cab side
    return v;
  }));
  body.add(cachedMesh('exc:fine', () => { const v = new VoxelModel(); text(v, 'BM', 11, 22, 6, 0x2a2a32); v.box(-8, 10, 6, -5, 13, 6, 0xffffff); return v; }, VF));
  // boom + stick + bucket (one part that pivots at the deck front)
  const boom = new THREE.Group(); boom.position.set(0.1, 0.65, 0.3); body.add(boom);
  boom.add(cachedMesh('exc:boom', () => {
    const v = new VoxelModel();
    for (let k = 0; k <= 14; k++) for (let dx = -1; dx <= 0; dx++) for (let t = 0; t <= 1; t++) v.set(dx, Math.round(k * 0.7) + t, k, 0xf2b82a);
    for (let k = 0; k <= 9; k++) for (let dx = -1; dx <= 0; dx++) v.set(dx, 10 - k, 14 + Math.round(k * 0.3), 0xe0a420);
    // the bucket with teeth
    for (let x = -3; x <= 2; x++) for (let y = -1; y <= 2; y++) for (let z = 15; z <= 18; z++) if (!(y >= 1 && z >= 16 && z <= 17 && x > -3 && x < 2)) v.set(x, y, z, 0x5a5a64);
    for (let x = -3; x <= 2; x += 1) v.set(x, -2, 18, METAL_L);
    return v;
  }));
  const ore = cachedMesh('exc:ore', () => { const v = new VoxelModel(); ball(v, -0.5, 2, 16.5, 2.2, (x, y, z) => (y < 2 ? null : toneOf(ORE_COL.iron.a, x, y, z, 1))); return v; });
  boom.add(ore);
  root.userData.dig = (k, full = false) => { boom.rotation.x = 0.35 - k * 0.75; ore.visible = full; };
  root.userData.body = body;
  root.userData.chimney = new THREE.Vector3(-0.45, 2.5, -0.45);
  root.userData.dig(0.2);
  return root;
}

export function makeFlintShack() {
  const root = new THREE.Group();
  root.name = 'flintShack';
  root.add(cachedMesh('shack:body', () => {
    const v = new VoxelModel();
    const rnd = mulberry32(42);
    // a lean-to of grey planks against a boulder, tin roof, a stove pipe
    rockLump(v, -3, 5, -9, 7, rnd); rockLump(v, 7, 4, -8, 5, rnd);
    v.paint((x, y, z, col) => (y < 0 ? null : col));
    for (let x = -7; x <= 7; x++) for (let y = 0; y <= 11 - Math.floor(Math.abs(x) / 4); y++) for (let z = -5; z <= 3; z++) {
      const wall = x === -7 || x === 7 || z === 3 || z === -5;
      if (!wall) { v.set(x, y, z, null); continue; }
      v.set(x, y, z, (x + 40) % 3 === 0 && z === 3 ? 0x6a6058 : toneOf([0x9a8e80, 0x8a7e70, 0xaa9e90], x, y, z, 2));
    }
    // door (dark planks) + a window with a warm glow
    for (let x = -2; x <= 1; x++) for (let y = 0; y <= 7; y++) v.set(x, y, 3, y === 7 || x === -2 || x === 1 ? WOOD_D : (x + y) % 3 ? WOOD_M : WOOD_D);
    v.set(1, 4, 4, BRASS);
    for (let x = 3; x <= 5; x++) for (let y = 5; y <= 7; y++) v.set(x, y, 3, x === 4 || y === 6 ? WOOD_D : 0xffd890);
    for (let x = -8; x <= 8; x++) for (let z = -6; z <= 5; z++) v.set(x, 12 - Math.floor(Math.abs(x) / 4) + (z < -1 ? 0 : 0), z, (x + 40) % 2 ? TIN[0] : TIN[2]);
    for (let y = 12; y <= 17; y++) v.set(5, y, -3, IRON);
    // porch: a crate of ore and a stump
    v.box(-7, 0, 5, -5, 2, 7, (x, y) => (y === 2 ? 0x2a2830 : WOOD_M));
    v.set(-6, 3, 6, ORE_COL.gold.a[0]); v.set(-5, 3, 5, ORE_COL.copper.a[0]);
    for (let x = -9; x <= 9; x++) for (let z = 4; z <= 8; z++) if (!v.has(x, 0, z)) v.set(x, 0, z, toneOf(DIRT, x, 0, z, 9));
    return v;
  }));
  root.add(cachedMesh('shack:fine', () => {
    const v = new VoxelModel();
    const s = 'FLINT', tw = textW(s), x0 = -Math.ceil(tw / 2) - 2;
    v.box(x0, 18, 8, x0 + tw + 3, 25, 8, (x, y) => (x === x0 || x === x0 + tw + 3 || y === 18 || y === 25 ? WOOD_D : 0xe8d8b0));
    text(v, s, x0 + 2, 23, 9, 0x3a2a1a);
    // crossed pickaxes over the sign
    v.line(-8, 26, 8, 8, 32, 8, WOOD_L); v.line(8, 26, 8, -8, 32, 8, WOOD_L);
    v.box(-10, 31, 8, -6, 32, 8, METAL); v.box(6, 31, 8, 10, 32, 8, METAL);
    return v;
  }, VF));
  root.add(cachedMesh('shack:glow', () => { const v = new VoxelModel(); v.set(4, 6, 4, 0xffe6a0); v.set(3, 5, 4, 0xffd070); return v; }, VC, true));
  root.userData.door = new THREE.Vector3(-0.05, 0, 0.5);
  root.userData.chimney = new THREE.Vector3(0.55, 1.8, -0.25);
  return root;
}

export function makePailLine() {
  const root = new THREE.Group();
  root.add(cachedMesh('pail:post', () => {
    const v = new VoxelModel();
    for (let y = 0; y <= 26; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 0, (y % 6) ? WOOD_M : WOOD_D);
    v.box(-3, 26, -1, 2, 27, 0, WOOD_D);
    return v;
  }, VF));
  const wheel = new THREE.Group(); wheel.position.set(0, 1.42, 0.03); root.add(wheel);
  wheel.add(cachedMesh('pail:wheel', () => { const v = new VoxelModel(); for (let x = -3; x <= 2; x++) for (let y = -3; y <= 2; y++) { const r = Math.hypot(x + 0.5, y + 0.5); if (r <= 3 && (r > 2 || Math.abs(x + 0.5) < 0.6 || Math.abs(y + 0.5) < 0.6)) v.set(x, y, 0, r > 2 ? BRASS : IRON); } return v; }, VF));
  const pail = cachedMesh('pail:pail', () => { const v = new VoxelModel(); v.box(-2, 0, -2, 1, 3, 1, 0xd23a2e); v.box(-2, 4, -2, 1, 4, 1, 0x2a2a34); v.line(-2, 5, 0, 1, 5, 0, METAL_L); v.set(0, 6, 0, METAL_L); v.set(0, 7, 0, IRON); return v; }, VF);
  pail.visible = false; root.add(pail);
  root.userData.wheel = wheel;
  root.userData.pail = pail;
  return root;
}

// beaver kit: built in the beaver rig's voxel units (critterKit VS = 0.05; fine = 0.025)
export function beaverPickGeo() {
  return memo('bv:pick', () => {
    const v = new VoxelModel();
    for (let y = -2; y <= 13; y++) v.set(0, y, 0, y === -2 ? WOOD_D : (y % 4) ? 0xb07c46 : 0x86582c);
    for (let z = -6; z <= 5; z++) { const t = Math.abs(z + 0.5) / 5.5; v.set(0, 13 - Math.round(t * t * 2), z, t > 0.8 ? 0x7e8696 : 0xc8d0dc); v.set(0, 14 - Math.round(t * t * 2), z, t > 0.85 ? 0x7e8696 : 0xeef2f8); }
    return v.build({ pivot: [0.5, 0, 0.5], scale: 0.025 });
  });
}
export function beaverHelmetGeo() {
  return memo('bv:helmet', () => {
    const v = new VoxelModel();
    // a slightly bigger hard hat than theirs, with a little drill on top + a lamp
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 5; z++) if (Math.hypot(x + 0.5, z) <= 5.2) v.set(x, 0, z, 0xe8961a);
    for (let x = -5; x <= 4; x++) for (let y = 1; y <= 4; y++) for (let z = -5; z <= 4; z++) if (Math.hypot((x + 0.5) / 4.5, (y - 0.5) / 4, (z + 0.5) / 4.5) <= 1) v.set(x, y, z, y === 1 ? 0x3a3a42 : 0xffbf1a);
    for (let y = 5; y <= 10; y++) { const r = Math.max(0, 1.4 - (y - 5) * 0.25); for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) if (Math.hypot(x + 0.5, z + 0.5) <= r + 0.5) v.set(x, y, z, y % 2 ? 0xc8d0dc : 0x7e8696); }
    v.set(-1, 2, 5, 0xfff6c0); v.set(0, 2, 5, 0xfff6c0); v.set(-1, 3, 5, 0xe8c050); v.set(0, 3, 5, 0xe8c050);
    return v.build({ pivot: [0, 0, 0], scale: 0.05 });
  });
}
export const MINING_MAT = mat;
void pick; void log; void fw; void tone; void STONE; void BRASS_D; void BRASS_L; void CREAM; void WOOD_L; void METAL_L;
