// [v26 world] The big forest's look (which trees grow where) and the hand-made
// shells of the Deepest Zone: the stone house in the grotto behind the falls
// (exterior only), the Broadwater's rope bridge, the Fallen Giant across the top
// of Heron Steps, and the ropes down the cliff. Opening a barrier is just a
// call to setBarrier() (game/ext/expedition.js decides when).
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';
import { hash2 } from '../core/rng.js';
import { BIOME, BARRIERS, DEEP_HOUSE, WATERFALL } from './worldgen.js';
import { cutVoxelMaterial } from './cutaway.js';

// ------------------------------------------------------------------ trees
// procedural tree for a forest tile of the new biomes: { name, sc, sway }
export function bigForestTree(bio, r, x, z, k, ground) {
  const h7 = hash2(x + k, z, 708), au = hash2(x >> 3, z >> 3, 709);
  if (bio === BIOME.OLDWOOD) {
    // tall old spruce and pine, a few birches in the light, maples where autumn caught a stand
    if (au > 0.8 && r < 0.45) return { name: ['maple_red', 'maple_orange', 'maple_scarlet'][Math.floor(h7 * 3)], sc: 1.25 };
    if (r < 0.48) return { name: ['spruce_0', 'spruce_1', 'spruce_2'][Math.floor(h7 * 3)], sc: 1.3 + h7 * 0.35 };
    if (r < 0.8) return { name: r < 0.64 ? 'pine_0' : 'pine_1', sc: 1.3 + h7 * 0.3 };
    if (r < 0.9) return { name: h7 < 0.5 ? 'birch_0' : 'aspen_0', sc: 1.1 };
    if (r < 0.95) return { name: 'snag', sc: 1.3, sway: 0 };
    return { name: 'deadtree_0', sc: 1.1, sway: 0.1 };
  }
  if (bio === BIOME.DEEP) {
    // the hollow: huge dark spruces, cypress by the water, glowing shrooms underneath
    if (r < 0.42) return { name: ['spruce_1', 'spruce_2', 'spruce_0'][Math.floor(h7 * 3)], sc: 1.5 + h7 * 0.4 };
    if (r < 0.58) return { name: h7 < 0.5 ? 'cypress_0' : 'cypress_1', sc: 1.25 };
    if (r < 0.74) return { name: ['giantshroom_glow_0', 'giantshroom_glow_1', 'giantshroom_brown_0'][Math.floor(h7 * 3)], sc: 0.95, sway: 0.1 };
    if (r < 0.9) return { name: r < 0.82 ? 'pine_1' : 'birch_1', sc: 1.35 };
    return { name: 'shroomcluster_' + Math.floor(h7 * 3), sc: 1, sway: 0.1 };
  }
  if (bio === BIOME.HIGHLAND) {
    if (ground > 7) return { name: h7 < 0.6 ? 'spruce_snow_0' : 'spruce_2', sc: 1.1 + h7 * 0.25 };
    if (r < 0.55) return { name: ['spruce_0', 'spruce_1', 'spruce_2'][Math.floor(h7 * 3)], sc: 1.2 + h7 * 0.3 };
    if (r < 0.85) return { name: r < 0.7 ? 'pine_0' : 'pine_1', sc: 1.2 };
    return { name: 'birch_0', sc: 1 };
  }
  // the massif's foothills
  return { name: ground > 4 ? (h7 < 0.5 ? 'spruce_snow_0' : 'spruce_snow_1') : ['spruce_0', 'spruce_2', 'pine_0'][Math.floor(h7 * 3)], sc: 0.95 + h7 * 0.3 };
}

// sprites on a barrier tile (pushed into world.buildDecos' item list)
export function deepBarrierSprites(world, i, x, z, items) {
  const g = world.grid;
  const B = BARRIERS[g.barrier[i] - 1];
  if (!B) return;
  const put = (name, px, pz, o) => {
    const f = world.frame(name);
    if (f) items.push({ tile: i, f, x: px, y: g.surfaceAtVisual(px, pz), z: pz, o: { texels: 24, ...o } });
  };
  if (B.kind === 'thorns') {
    // a wall of brambles: thorny canes, wild roses, dead sticks, a few low snags
    const n = 3;
    for (let k = 0; k < n; k++) {
      const r = hash2(x * 3 + k, z, 1201), r2 = hash2(x, z * 3 + k, 1203);
      const px = x + 0.15 + hash2(x, z, 1210 + k) * 0.7, pz = z + 0.15 + hash2(x, z, 1220 + k) * 0.7;
      const name = r < 0.4 ? 'raspberry_picked' : r < 0.6 ? 'rose' : r < 0.8 ? 'sumac' : r < 0.9 ? 'deadtree_1' : 'bush_1';
      const dk = 0.55 + r2 * 0.15;
      put(world.frame(name) ? name : 'bush_1', px, pz, { scale: 1.1 + r2 * 0.45, sway: 0.3, phase: r * 6, flip: r2 > 0.5, tint: [dk * 1.12, dk * 0.82, dk * 0.86] });
    }
  } else if (B.kind === 'cliff') {
    if (hash2(x, z, 1231) < 0.35) put(hash2(x, z, 1233) < 0.5 ? 'rock_1' : 'tallgrass_1', x + 0.5, z + 0.4, { scale: 0.8, sway: 0.5 });
  }
  // the log: its own mesh (DeepZone)
}

// ------------------------------------------------------------------ voxel kit
const C = {
  stone: [0x7c8278, 0x8a9088, 0x6c7268, 0x9aa096, 0x737a70], mortar: 0x4a4e48, moss: [0x4f7a32, 0x5f8c3a, 0x3f6a2a],
  door: 0x7a4a26, doorD: 0x5a341a, brass: 0xd8b04a, frame: 0xb0a890, shell: [0x5a7a3a, 0x6a8a44, 0x4a6a32], scute: 0x2e3a1e, shellHi: 0x8aa858,
  wood: 0x8a5a30, woodD: 0x6a4224, rope: 0xc8a870, plank: [0x9a6a3a, 0x8a5c30, 0xa8784a],
  bark: [0x4a3424, 0x3e2c1e, 0x56402c], barkHi: 0x6a5038, heart: 0xc89a5a, root: 0x5a3e28, dirt: 0x6a5038, shelf: [0xe0904a, 0xf0c070],
};
const pick = (arr, x, y, z, s = 1) => arr[Math.floor(hash2(x * 7 + y * 13, z * 3 + y, s) * arr.length)];

// the turtle's house: river-stone walls, a round door, round windows and a
// roof like a mossy turtle shell. Origin: front-centre of the floor (voxels).
function houseModel() {
  const v = new VoxelModel(), glow = new VoxelModel();
  const W = 23, D = 18, Hw = 22;
  // walls (z = -D .. 0, the front at z = 0)
  v.box(-W, 0, -D, W, Hw, 0, (x, y, z) => {
    const inner = x > -W && x < W && z > -D && z < 0 && y > 0;
    if (inner) return null;
    const row = Math.floor(y / 3), off = (row % 2) * 3;
    const sx = Math.floor((x + 40 + off + (z === 0 || z === -D ? 0 : z)) / 5);
    if (y % 3 === 0 || (x + 40 + off) % 5 === 0) return C.mortar;
    let c = pick(C.stone, sx, row, 1, 11);
    if ((y < 4 && hash2(x, z, 13) < 0.55) || (y > Hw - 3 && hash2(x, z, 17) < 0.4)) c = pick(C.moss, x, y, z, 19);
    return c;
  });
  // the round door with a stone arch
  for (let y = 1; y <= 13; y++)
    for (let x = -5; x <= 5; x++) {
      const inArch = y <= 8 || Math.hypot(x, y - 8) <= 5.2;
      const ring = !inArch && (y <= 8 ? Math.abs(x) === 6 : Math.hypot(x, y - 8) <= 6.6);
      if (inArch) { v.set(x, y, 0, null); v.set(x, y, -1, (x + 10) % 3 === 0 ? C.doorD : C.door); }
      if (ring) v.set(x, y, 1, C.frame);
    }
  for (let x = -6; x <= 6; x++) v.set(x, 14, 1, C.frame).set(x, 0, 1, 0x6a6a60);
  v.set(3, 6, 0, C.brass).set(3, 7, 0, C.brass);
  // round windows, warm inside
  for (const wx of [-14, 14])
    for (let y = 8; y <= 16; y++)
      for (let x = wx - 4; x <= wx + 4; x++) {
        const d = Math.hypot(x - wx, y - 12);
        if (d <= 3.2) { v.set(x, y, 0, null); glow.set(x, y, -1, (x === wx || y === 12) ? 0x8a5a2a : 0xffc860); }
        else if (d <= 4.4) v.set(x, y, 1, C.wood);
      }
  // flower boxes under the windows
  for (const wx of [-14, 14]) { v.box(wx - 4, 6, 1, wx + 4, 7, 2, C.woodD); for (let x = wx - 3; x <= wx + 3; x += 2) v.set(x, 8, 2, hash2(x, 3, 5) < 0.5 ? 0xe85a8a : 0xf0d040); }
  // the shell roof: a dome of hexagonal scutes, mossy
  const cx = 0, cy = Hw, cz = -D / 2;
  const RX = W + 4, RY = 13, RZ = D / 2 + 4;
  for (let x = -RX - 1; x <= RX + 1; x++)
    for (let z = Math.floor(cz - RZ - 1); z <= Math.ceil(cz + RZ + 1); z++)
      for (let y = cy; y <= cy + RY + 1; y++) {
        const dx = (x - cx) / RX, dy = (y - cy) / RY, dz = (z - cz) / RZ;
        const d = dx * dx + dy * dy + dz * dz;
        if (d > 1 || d < 0.72) continue;
        // hex scutes in the dome's x / z
        const s3 = Math.sqrt(3), hs = 6.5;
        const qx = x / hs, qz = (z - cz) / hs + y * 0.05;
        const row = Math.round(qz / (s3 / 2)), colx = qx - (row & 1) * 0.5;
        const ccx = Math.round(colx);
        const ex = Math.abs(colx - ccx), ez = Math.abs(qz - row * (s3 / 2));
        const edge = ex > 0.4 || ez > 0.36;
        let c = edge ? C.scute : pick(C.shell, ccx, row, 3, 23);
        if (!edge && ex < 0.14 && ez < 0.12) c = C.shellHi;
        if (!edge && y > cy + RY - 3 && hash2(x, z, 29) < 0.35) c = pick(C.moss, x, y, z, 31);
        v.set(x, y, z, c);
      }
  // a rim of shell overhang over the walls
  for (let x = -RX; x <= RX; x++) for (const z of [Math.floor(cz - RZ), Math.ceil(cz + RZ)]) if (Math.abs(x) < RX - 1) v.set(x, cy, z, C.scute);
  // the chimney (river stones) on the right
  v.box(14, Hw + 4, -12, 18, Hw + 16, -8, (x, y, z) => (y % 3 === 0 ? C.mortar : pick(C.stone, x, y, z, 37)));
  v.box(13, Hw + 16, -13, 19, Hw + 17, -7, 0x5a5e58);
  // lanterns either side of the door
  for (const lx of [-8, 8]) {
    v.box(lx, 0, 2, lx, 9, 2, C.woodD).set(lx, 10, 2, C.woodD);
    v.box(lx - 1, 10, 3, lx + 1, 12, 3, 0x3a3a30);
    glow.set(lx, 11, 4, 0xffd070);
  }
  // stepping stones out to the walkway
  for (let k = 0; k < 3; k++) v.box(-2, 0, 3 + k * 4, 2, 0, 5 + k * 4, pick(C.stone, k, 0, 9, 41));
  return { body: v, glow, smoke: [[1.6, Hw / 10 + 1.8, -1.0]] };
}

// the rope bridge over the Broadwater, along +z. len in voxels, deck sagging.
function bridgeModel(len, wide) {
  const v = new VoxelModel();
  const half = Math.floor(wide / 2);
  const sag = (z) => Math.round(-Math.sin((z / len) * Math.PI) * 3);
  for (let z = 0; z <= len; z++) {
    const y = sag(z);
    if (z % 3 !== 2) for (let x = -half; x <= half; x++) v.set(x, y, z, pick(C.plank, Math.floor(z / 3), 0, 1, 43));
    // rope rails
    v.set(-half - 1, y + 7, z, C.rope).set(half + 1, y + 7, z, C.rope);
    if (z % 6 === 0) for (let k = 0; k <= 7; k++) { v.set(-half - 1, y + k, z, k < 7 ? C.rope : C.rope); v.set(half + 1, y + k, z, C.rope); }
  }
  // posts at both ends
  for (const z of [0, len]) for (const x of [-half - 2, half + 2]) v.box(x, -4, z - 1, x + (x < 0 ? 1 : -1), 10, z, C.woodD);
  return v;
}

// the broken bridge posts (before the bridge is built): a stub of rope, a lean
function stubModel() {
  const v = new VoxelModel();
  for (const x of [-15, 14]) { v.box(x, -3, 0, x + 1, 8, 1, C.woodD); v.line(x, 7, 1, x + 1, 1, 6, C.rope); }
  return v;
}

// the Fallen Giant: a vast trunk on its side along +x, roots at the far end
function giantLogModel(len) {
  const v = new VoxelModel();
  const R = 8;
  for (let x = 0; x <= len; x++) {
    const r = R + (x > len - 6 ? (x - (len - 6)) * 0.4 : 0) - (x < 4 ? (4 - x) * 0.6 : 0);
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++)
      for (let z = -Math.ceil(r); z <= Math.ceil(r); z++) {
        const d = Math.hypot(y, z);
        if (d > r) continue;
        let c;
        if (x === 0 || x === len) c = d < r - 1.5 ? (Math.floor(d) % 3 === 0 ? 0xa87a44 : C.heart) : C.bark[0]; // the cut / broken ends
        else if (d < r - 1.2) continue; // hollow inside (faces cull anyway)
        else {
          c = (Math.floor(x / 2) + Math.round(Math.atan2(y, z) * 4)) % 5 === 0 ? C.barkHi : pick(C.bark, x, y, z, 47);
          if (y > r * 0.55 && hash2(x, z, 49) < 0.7) c = pick(C.moss, x, y, z, 51); // moss on top
          if (Math.abs(z) > r * 0.8 && y > -2 && y < 2 && hash2(x, y, 53) < 0.12) c = pick(C.shelf, x, y, z, 55); // shelf fungus
        }
        v.set(x, y + R, z, c);
      }
  }
  // the root plate: a big ragged disc of roots and earth standing up at the end
  for (let y = -14; y <= 16; y++)
    for (let z = -16; z <= 16; z++) {
      const d = Math.hypot(y * 1.05, z);
      if (d > 15 + hash2(y, z, 57) * 3) continue;
      const c = d < 9 ? C.dirt : hash2(y, z, 59) < 0.5 ? C.root : C.dirt;
      v.set(len + 1, y + R, z, c);
      if (d < 12) v.set(len + 2, y + R, z, C.root);
    }
  for (let k = 0; k < 9; k++) {
    const a = k * 0.7, rr = 13 + hash2(k, 1, 61) * 6;
    v.line(len + 2, R, 0, len + 4 + (k % 3), Math.round(R + Math.sin(a) * rr), Math.round(Math.cos(a) * rr), C.root, 0);
  }
  // a couple of snapped branches
  v.line(Math.floor(len * 0.35), R + 7, 2, Math.floor(len * 0.3), R + 16, 8, C.bark[1], 1);
  v.line(Math.floor(len * 0.6), R + 6, -3, Math.floor(len * 0.66), R + 13, -10, C.bark[2], 1);
  return v;
}

// --------------------------------------------------------------- the shells
export class DeepZone {
  constructor(world) {
    this.world = world;
    const g = world.grid;
    this.group = new THREE.Group();
    this.group.name = 'deepZone';
    world.scene.add(this.group);
    const mat = cutVoxelMaterial();
    const glowMat = world.glowMat || new THREE.MeshBasicMaterial({ vertexColors: true });
    this.parts = {};
    const mesh = (model, o) => { const m = new THREE.Mesh(model.build({ scale: 0.1, ...o }), mat); m.castShadow = true; m.receiveShadow = true; return m; };
    // the house
    try {
      const H = houseModel();
      const grp = new THREE.Group();
      grp.add(mesh(H.body, { pivot: [0, 0, 0] }));
      grp.add(new THREE.Mesh(H.glow.build({ scale: 0.1, ao: false }), glowMat));
      const hx = (DEEP_HOUSE.x0 + DEEP_HOUSE.x1 + 1) / 2, hz = DEEP_HOUSE.z1 + 0.95;
      grp.position.set(hx, DEEP_HOUSE.y, hz);
      grp.userData.house = true;
      this.group.add(grp);
      this.house = grp;
      (world.smokePoints ||= []).push(...H.smoke.map(([x, y, z]) => [hx + x, DEEP_HOUSE.y + y, hz + z]));
    } catch (e) { console.warn('deep house', e); }
    // the barriers
    for (const B of BARRIERS) {
      try {
        if (B.kind === 'bridge') {
          const len = (B.far[1] - B.near[1]) * 10;
          const grp = new THREE.Group();
          const m = mesh(bridgeModel(len, (B.x1 - B.x0 + 1) * 10 - 6));
          grp.add(m);
          grp.position.set((B.x0 + B.x1 + 1) / 2, 0.62, B.near[1] + 0.5);
          this.group.add(grp);
          const stubs = new THREE.Group();
          for (const z of [B.near[1] + 0.6, B.far[1] + 0.4]) { const s = mesh(stubModel()); s.position.set((B.x0 + B.x1 + 1) / 2, g.surfaceAtVisual(B.x0 + 1.5, z) + 0.3, z); stubs.add(s); }
          this.group.add(stubs);
          this.parts.bridge = { open: grp, closed: stubs };
        } else if (B.kind === 'log') {
          const len = (B.x1 - B.x0 + 1) * 10 - 10;
          const m = mesh(giantLogModel(len));
          m.position.set(B.x0 + 0.5, g.height[B.z * g.w + B.x0], B.z + 0.5);
          this.group.add(m);
          this.parts.log = { closed: m, open: null };
        } else if (B.kind === 'cliff' && B.tiles?.length) {
          // a rope rail and pitons down the steps (once you have the ropes)
          const v = new VoxelModel();
          const P = B.tiles, base = P[0];
          const y0 = g.height[base[1] * g.w + base[0]];
          for (let k = 0; k < P.length - 1; k++) {
            const [ax, az] = P[k], [bx, bz] = P[k + 1];
            const ay = g.height[az * g.w + ax] - y0, by = g.height[bz * g.w + bx] - y0;
            const X = (q) => Math.round((q - base[0]) * 10), Z = (q) => Math.round((q - base[1]) * 10);
            v.line(X(ax + 0.5), Math.round(ay * 10) + 6, Z(az + 0.15), X(bx + 0.5), Math.round(by * 10) + 6, Z(bz + 0.15), C.rope);
            if (k % 3 === 0) v.box(X(ax + 0.5), Math.round(ay * 10), Z(az + 0.15), X(ax + 0.5), Math.round(ay * 10) + 6, Z(az + 0.15), 0x9a9aa0);
          }
          const m = mesh(v);
          m.position.set(base[0], y0, base[1]);
          this.group.add(m);
          this.parts.cliff = { open: m, closed: null };
        }
      } catch (e) { console.warn('deep barrier', B.id, e); }
    }
    for (const id of Object.keys(this.parts)) this.setBarrier(id, false);
  }

  // open = the bridge stands / the log is gone / the ropes are up
  setBarrier(id, open) {
    const p = this.parts[id];
    if (!p) return;
    if (p.open) p.open.visible = !!open;
    if (p.closed) p.closed.visible = !open;
  }

  // where things are (for effects when a barrier opens)
  spot(id) {
    const B = BARRIERS.find((b) => b.id === id);
    if (!B) return null;
    if (B.kind === 'log') return { x: (B.x0 + B.x1 + 1) / 2, y: this.world.grid.height[B.z * this.world.grid.w + B.x0] + 0.8, z: B.z + 0.5 };
    if (B.kind === 'bridge') return { x: (B.x0 + B.x1 + 1) / 2, y: 0.5, z: (B.near[1] + B.far[1]) / 2 };
    const t = B.tiles?.[0] || [0, 0];
    return { x: t[0] + 0.5, y: this.world.grid.height[t[1] * this.world.grid.w + t[0]] + 0.5, z: t[1] + 0.5 };
  }
}

export { WATERFALL };
