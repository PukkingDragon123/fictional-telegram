// [v26 power] Voxel models for the storage builds (src/data/ext/power.js `depot`). The stock
// shows: src/game/ext/storage.js calls root.userData.setContents({ id: n }, cap) whenever
// it changes, and pallets / shelves / heaps fill up (ore sacks, ingot stacks, part crates).
//
//   st_warehouse  (2x2) plank barn + a pallet yard in front: 12 stack spots
//   st_partsrack  (1x1) steel shelving, 3 shelves x 2 spots: ingots and parts
//   st_coalbunker (1x1) concrete bin, a coal heap in 4 sizes
//   st_pile       (1x1) a tarp heap with crates and sacks around it
import * as THREE from 'three';
import { IND_KIT, IND_PAL } from './industryModels.js';
import { makeBeltItem } from './industryModels.js';
import { text, textW } from './facilityModels.js';
import { VoxelModel, voxelMaterial, shade } from '../../core/voxel.js';
import { RES_INFO } from '../../game/Resources.js';

const MM = Object.values(import.meta.glob('./miningModels.js', { eager: true }))[0] || null;
const { machine, cylY, slab, grassTufts, hv, pickT, VF } = IND_KIT;
const { STONE, CONC, IRON, IRON_L, IRON_D, STEEL, STEEL_L, STEEL_D, HAZ_Y, HAZ_K, RED, RED_D, WOOD, WOOD_D, COAL, WHITE, CREAM } = IND_PAL;
const PLANK = [0xb48452, 0xa8784a, 0xc0905a], PLANK_D = 0x7a5230;

// ---------------------------------------------------------------- stacks (what a spot shows)
const GEO = new Map();
const memo = (k, make) => { let g = GEO.get(k); if (!g) { g = make(); GEO.set(k, g); } return g; };
function mesh(geo) { const m = new THREE.Mesh(geo, voxelMaterial()); m.castShadow = true; m.receiveShadow = true; m.userData.tintable = true; return m; }
function crateGeo() {
  return memo('crate', () => {
    const v = new VoxelModel();
    for (let x = -3; x <= 2; x++) for (let y = 0; y <= 4; y++) for (let z = -3; z <= 2; z++) {
      const edge = (x === -3 || x === 2) + (y === 0 || y === 4) + (z === -3 || z === 2) >= 2;
      v.set(x, y, z, edge ? PLANK_D : PLANK[(x + y + z + 9) % 3]);
    }
    return v.build({ pivot: [-0.5, 0, -0.5], scale: VF * 1.4 });
  });
}
function palletGeo() {
  return memo('pallet', () => {
    const v = new VoxelModel();
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) v.set(x, 1, z, x % 3 === 0 ? PLANK_D : PLANK[1]);
    for (const z of [-4, 0, 3]) for (let x = -4; x <= 3; x++) v.set(x, 0, z, PLANK_D);
    return v.build({ pivot: [-0.5, 0, -0.5], scale: VF * 1.2 });
  });
}
// one stack spot showing `id` (k = how full this stack is, 0..1)
function stackFor(id, k = 1) {
  const g = new THREE.Group();
  const kind = RES_INFO[id]?.kind || 'part';
  if (kind === 'ore') {
    const n = k > 0.66 ? 3 : k > 0.33 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const m = MM?.makeOreSack ? MM.makeOreSack(id) : mesh(crateGeo());
      m.scale.setScalar(1.45);
      m.position.set(i === 2 ? 0 : (i ? 0.1 : -0.1), i === 2 ? 0.22 : 0, i === 2 ? 0 : (i ? -0.04 : 0.04));
      m.rotation.y = i * 1.3;
      g.add(m);
    }
  } else if (kind === 'ingot') {
    const n = Math.max(2, Math.round(2 + k * 4));
    for (let i = 0; i < n; i++) {
      const m = makeBeltItem(id);
      m.scale.setScalar(1.25);
      const layer = Math.floor(i / 2);
      m.position.set((i % 2 ? 0.07 : -0.07) * (layer % 2 ? 0 : 1), layer * 0.1, (i % 2 ? 0.07 : -0.07) * (layer % 2 ? 1 : 0));
      m.rotation.y = layer % 2 ? Math.PI / 2 : 0;
      g.add(m);
    }
  } else {
    const c = mesh(crateGeo());
    g.add(c);
    const n = k > 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const m = makeBeltItem(id);
      m.scale.setScalar(1.3);
      m.position.set(i ? 0.05 : -0.04, 0.36 + i * 0.05, i ? -0.03 : 0.03);
      m.rotation.y = 0.4 + i;
      g.add(m);
    }
  }
  return g;
}
// share the units among the spots: biggest kinds first, each spot one kind
function layout(contents, cap, spots) {
  const used = Object.values(contents).reduce((a, b) => a + b, 0);
  if (used <= 0) return [];
  const show = Math.max(1, Math.min(spots, Math.ceil((used / Math.max(1, cap)) * spots)));
  const kinds = Object.entries(contents).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const out = [];
  let left = show;
  kinds.forEach(([id, n], i) => {
    if (left <= 0) return;
    const share = i === kinds.length - 1 ? left : Math.max(1, Math.round((n / used) * show));
    const k = Math.min(left, share);
    for (let j = 0; j < k; j++) out.push({ id, k: Math.min(1, (n / k) / Math.max(1, cap / spots)) });
    left -= k;
  });
  return out;
}
// a spots holder: setContents rebuilds the stacks
function spotsHolder(root, spots, cap0) {
  const holder = new THREE.Group();
  root.add(holder);
  root.userData.setContents = (contents, cap = cap0) => {
    for (const ch of [...holder.children]) holder.remove(ch);
    const L = layout(contents || {}, cap, spots.length);
    L.forEach((it, i) => {
      const p = spots[i];
      const st = stackFor(it.id, it.k);
      st.position.set(p[0], p[1], p[2]);
      st.rotation.y = p[3] || 0;
      st.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      holder.add(st);
    });
  };
  root.userData.setStock = (n, cap) => root.userData.setContents({ stone: n }, cap);
  return holder;
}

// ================================================================ WAREHOUSE (2x2)
function buildWarehouse(R) {
  const f = R.f, g = R.g;
  slab(f, -19, 18, -19, 18, 0, CONC);
  // the barn (back half): plank walls, a big door, a red gambrel roof
  for (let x = -18; x <= 17; x++) for (let z = -18; z <= -3; z++) for (let y = 1; y <= 18; y++) {
    const shell = x === -18 || x === 17 || z === -18 || z === -3;
    if (!shell) continue;
    f.set(x, y, z, (x + 40) % 5 === 0 || (z + 40) % 5 === 0 ? PLANK_D : pickT(PLANK, x >> 1, y >> 2, z));
  }
  for (let x = -6; x <= 5; x++) for (let y = 1; y <= 14; y++) f.set(x, y, -3, x === -6 || x === 5 || y === 14 ? WOOD_D : (x + y) % 6 === 0 ? 0x5a3a20 : 0x7a4e2a);
  f.line(-5, 1, -2, 4, 13, -2, WOOD_D); f.line(4, 1, -2, -5, 13, -2, WOOD_D);
  for (let z = -20; z <= -1; z++) {
    const u = (z + 10.5) / 10;
    const h = Math.round(19 + (1 - Math.abs(u)) * 9 + (Math.abs(u) < 0.5 ? 3 * (1 - Math.abs(u) * 2) : 0));
    for (let x = -19; x <= 18; x++) f.set(x, h, z, (x + 40) % 3 ? RED : RED_D);
  }
  // the sign over the door
  const tw = textW('STORES');
  f.box(-Math.ceil(tw / 2) - 2, 15, -2, Math.floor(tw / 2) + 1, 21, -2, CREAM);
  text(f, 'STORES', -Math.ceil(tw / 2), 20, -1, RED_D);
  // the pallet yard: painted lines
  for (let x = -18; x <= 17; x++) { f.set(x, 0, 0, HAZ_Y); f.set(x, 0, 17, HAZ_Y); }
  // a hand truck + a lamp on the corner post
  f.box(14, 1, 1, 15, 9, 1, IRON_L); f.box(13, 1, 2, 16, 1, 4, IRON); cylY(f, 14.5, 4, 1.2, 1, 2, 0x2a2a30);
  f.box(-19, 1, -2, -18, 22, -1, WOOD_D); f.box(-20, 20, 0, -17, 21, 1, IRON); g.set(-19, 19, 1, 0xfff0b0); g.set(-18, 19, 1, 0xffd070);
}

// ================================================================ PARTS RACK (1x1)
function buildRack(R) {
  const f = R.f;
  slab(f, -9, 8, -9, 8, 0, CONC);
  for (const x of [-8, 7]) for (const z of [-6, 5]) f.box(x, 1, z, x, 24, z, STEEL_D);
  for (const y of [4, 11, 18]) f.box(-8, y, -6, 7, y, 5, (x, yy, z) => (z === 5 || z === -6 ? HAZ_Y : STEEL));
  f.box(-8, 25, -6, 7, 25, 5, STEEL_L);
  // a little label plate + a clipboard
  f.box(-3, 22, 6, 2, 24, 6, CREAM); f.set(-2, 23, 7, 0x2a2a30); f.set(0, 23, 7, 0x2a2a30);
  f.box(8, 8, -2, 8, 13, 2, 0xc8a070); f.box(8, 9, -1, 8, 12, 1, WHITE);
}

// ================================================================ COAL BUNKER (1x1)
function buildBunker(R) {
  const f = R.f;
  slab(f, -9, 8, -9, 8, 0, CONC);
  // three concrete walls (open front), hazard stripe on the lip
  for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) for (let y = 1; y <= 10; y++) {
    const wall = (x <= -8 || x >= 7 || z <= -8) && !(z >= 7 && y > 4);
    if (!wall) continue;
    f.set(x, y, z, y === 10 ? ((x + z) >> 1) & 1 ? HAZ_Y : HAZ_K : pickT(CONC, x >> 1, y >> 1, z));
  }
  for (let x = -7; x <= 6; x++) f.box(x, 1, 7, x, 3, 8, pickT(CONC, x, 1, 7));
  // a shovel leaning on the side
  f.line(9, 1, -3, 9, 14, 2, WOOD_D); f.box(9, 1, -5, 9, 3, -3, STEEL_L);
  text(f, 'COAL', -6, 8, 9, 0x2a2a30);
}
function heapGeo(lvl) {
  return memo('coalheap' + lvl, () => {
    const v = new VoxelModel();
    const r = 3.6 + lvl * 1.5, h = 1.6 + lvl * 1.9;
    for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
      const d = Math.hypot((x + 0.5) / r, (z + 0.5) / r);
      if (d > 1) continue;
      const top = Math.round(h * (1 - d * d) + hv(x, lvl, z) * 1.2);
      for (let y = 0; y <= top; y++) v.set(x, y, z, pickT(COAL, x, y, z));
      if (hv(x, 9, z) < 0.12) v.set(x, top + 1, z, 0x6a6878);
    }
    return v.build({ pivot: [0, 0, 0], scale: VF });
  });
}

// ================================================================ SUPPLY PILE (1x1)
function buildPile(R) {
  const f = R.f;
  // a tarp (olive) thrown over a lumpy heap, ropes, two stakes
  for (let x = -8; x <= 7; x++) for (let z = -8; z <= 3; z++) {
    const d = Math.hypot((x + 0.5) / 8, (z + 2.5) / 6);
    if (d > 1) continue;
    const top = Math.round(9 * (1 - d * d) + hv(x, 0, z) * 1.6);
    for (let y = 1; y <= top; y++) f.set(x, y, z, y === top ? ((x + z) & 1 ? 0x6a7a3a : 0x5a6a30) : 0x4a5a28);
  }
  f.line(-8, 1, -2, 0, 10, -2, 0xd8c090); f.line(7, 1, -2, 0, 10, -2, 0xd8c090);
  f.box(-9, 1, -2, -9, 4, -2, WOOD_D); f.box(8, 1, -2, 8, 4, -2, WOOD_D);
}

// ---------------------------------------------------------------- factories
const W_SPOTS = [];
for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) W_SPOTS.push([-0.62 + col * 0.62, 0.02, 0.25 + row * 0.45, (col + row) * 0.6]);
for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) W_SPOTS.push([-0.62 + col * 0.62, 0.3, 0.25 + row * 0.45, (col + row) * 0.6 + 0.3]);
const R_SPOTS = [];
for (const y of [0.25, 0.6, 0.95]) for (const x of [-0.2, 0.18]) R_SPOTS.push([x, y, 0, 0.3]);

export const STRUCTURE_MODELS = {
  st_warehouse: () => {
    const root = machine('st_warehouse', buildWarehouse, {});
    // pallets under the first layer of stacks
    for (let i = 0; i < 6; i++) { const p = mesh(palletGeo()); p.position.set(W_SPOTS[i][0], 0.01, W_SPOTS[i][2]); root.add(p); }
    for (const s of W_SPOTS) s[1] = s[1] < 0.1 ? 0.13 : 0.47;
    spotsHolder(root, W_SPOTS, 300);
    root.userData.plug = [0.8, 1.0, -0.2];
    return root;
  },
  st_partsrack: () => {
    const root = machine('st_partsrack', buildRack, {});
    spotsHolder(root, R_SPOTS, 80);
    return root;
  },
  st_coalbunker: () => {
    const root = machine('st_coalbunker', buildBunker, {});
    const heaps = [0, 1, 2, 3].map((l) => { const m = mesh(heapGeo(l)); m.position.set(0, 0.06, -0.05); m.visible = false; root.add(m); return m; });
    let shown = -2;
    root.userData.setContents = (contents, cap = 100) => {
      const n = Object.values(contents || {}).reduce((a, b) => a + b, 0);
      const k = n / Math.max(1, cap);
      const lvl = n <= 0 ? -1 : k < 0.25 ? 0 : k < 0.5 ? 1 : k < 0.8 ? 2 : 3;
      if (lvl === shown) return;
      shown = lvl;
      heaps.forEach((m, i) => { m.visible = i === lvl; });
    };
    return root;
  },
  st_pile: () => {
    const root = machine('st_pile', buildPile, {});
    spotsHolder(root, [[-0.25, 0.02, 0.28, 0.2], [0.22, 0.02, 0.3, -0.4], [0.05, 0.02, 0.38, 1], [-0.32, 0.05, -0.05, 0.6], [0.3, 0.05, -0.1, -0.2]], 60);
    return root;
  },
};
void IRON; void IRON_D; void STEEL_L; void STONE; void shade;
