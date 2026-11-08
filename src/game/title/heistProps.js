// [v33 title] Voxel props for the noon title cinematic (src/game/title/HeistScene.js):
// Reynard's makeshift bank by the pond, built in the game's own prop style. The coins
// and coin stacks are Reynard's own coin / stack voxel models (src/entities/foxRig.js:
// coinModel, stackModel, the same palette, at the same fine voxel size), piled up; the
// burlap sack is his money sack (same burlap tones, rope and blue fish logo), just
// bigger; the crate is a plank crate like the storage and delivery crates, with a
// stencilled fish; the bills are printed in the game's money green (the fx '$').
// Geometry is built once and cached (the title runs for a long time).
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';

// Reynard's prop voxels (foxRig FV 0.025 inside his 0.9 scale) for the money; the crate and sack in plank voxels
export const MONEY_V = 0.0225;
export const CRATE_V = 0.04;

const C = {
  // Reynard's gold (foxRig.js palette: his coin, coin stack, monocle chain)
  gold: 0xffdc4a, goldD: 0xf0b030, goldDD: 0xb87a1c, goldL: 0xfff6c4,
  // the fx '$' green (fxAtlas 'dollar') on cream paper (his shirt cream), a red band
  bill: 0xa6ec8c, billL: 0xd8fac4, billD: 0x5cb048, ink: 0x1a4a10, band: 0xf8eedc, bandD: 0xd9c2a2, bandR: 0xdc3a30,
  // plank crate (storageModels PLANK / PLANK_D)
  wood: 0xb48452, woodL: 0xc0905a, woodM: 0xa8784a, woodD: 0x7a5230, gap: 0x4a3020, nail: 0x6a6670, nailL: 0xaaa6b0,
  // his money sack (foxRig.js: sack, sackD, sackL, rope, the blue fish logo)
  sack: 0xd8b27a, sackD: 0xb08850, sackL: 0xecd09c, sackDD: 0x8a6a40, rope: 0x8a5a2a, ropeL: 0xa8743a, fish: 0x3c88d8,
};

// tiny deterministic hash (stable art between builds)
function h3(x, y, z, s = 0) {
  let n = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

const geoCache = new Map();
function cached(key, fn) {
  let g = geoCache.get(key);
  if (!g) { g = fn(); geoCache.set(key, g); }
  return g;
}
const mesh = (geo, { shadow = true } = {}) => {
  const m = new THREE.Mesh(geo, voxelMaterial());
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
};

// ------------------------------------------------------------------ coins (Reynard's coin)
// foxRig coinModel: a 6 x 6 disc (|d| <= 3.1 round -0.5), a goldD rim, a goldL lit half.
// edge: the stackModel look (a stacked coin seen edge-on: all goldD on odd layers).
function coinDisc(v, cx, cy, cz, { edge = false } = {}) {
  for (let x = -3; x <= 2; x++)
    for (let z = -3; z <= 2; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 3.1) continue;
      v.set(cx + x, cy, cz + z, edge ? C.goldD : d > 2.2 ? C.goldD : x + z < -1 ? C.goldL : C.gold);
    }
}
const emboss = (v, cx, cy, cz) => { v.set(cx - 1, cy + 1, cz - 1, C.goldD); v.set(cx, cy + 1, cz, C.goldD); v.set(cx - 1, cy + 1, cz, C.gold); };

/** A heap of Reynard's coins: an irregular mound with a few coins standing on edge. */
export function coinHeapGeometry(seed = 3) {
  return cached('heap' + seed, () => {
    const v = new VoxelModel();
    const rnd = rng(seed * 977 + 13);
    const layers = [[7.2, 9], [6, 8], [4.8, 6], [3.4, 4], [1.8, 2]];
    layers.forEach(([rad, n], y) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
        const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d * 0.8);
        coinDisc(v, x, y, z, { edge: rnd() < 0.2 });
        if (rnd() < 0.3) emboss(v, x, y, z);
      }
    });
    // coins standing on edge, leaning out of the heap
    for (const [x, z, y] of [[-3, 1, 2], [2, -2, 3], [4, 2, 1], [-1, -3, 2]]) {
      for (let k = -3; k <= 2; k++) for (let j = 0; j <= 5; j++) {
        const d = Math.hypot(k + 0.5, j - 2.5);
        if (d > 3.1) continue;
        v.set(x + k, y + j, z, d > 2.2 ? C.goldD : k + (2.5 - j) < -1 ? C.goldL : C.gold);
      }
    }
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

/** A stack of n of his coins: foxRig stackModel (staggered 0,1,0,-1,0,1; odd layers goldD), the top one face up. */
export function coinStackGeometry(n) {
  return cached('stack' + n, () => {
    const v = new VoxelModel();
    for (let i = 0; i < n; i++) {
      const o = [0, 1, 0, -1, 0, 1][i % 6];
      if (i === n - 1) { coinDisc(v, o, i, 0); emboss(v, o, i, 0); continue; }
      for (let x = -3; x <= 2; x++)
        for (let z = -3; z <= 2; z++) {
          const d = Math.hypot(x + 0.5, z + 0.5);
          if (d > 3.1) continue;
          v.set(x + o, i, z, i % 2 ? C.goldD : d > 2.4 ? C.goldD : C.gold);
        }
    }
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

/** One coin: exactly his coinModel (the dropped coin, the coin that lands on the stack). */
export function coinGeometry() {
  return cached('coin', () => {
    const v = new VoxelModel();
    coinDisc(v, 0, 0, 0);
    emboss(v, 0, 0, 0);
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

// ------------------------------------------------------------------ bills
function billFace(v, x0, y, z0, { top = true, seed = 0 } = {}) {
  // 9 x 4 voxels in the money green: an ink border, a gold coin seal, corner marks
  for (let x = 0; x < 9; x++)
    for (let z = 0; z < 4; z++) {
      const edge = x === 0 || x === 8 || z === 0 || z === 3;
      let c = edge ? C.billD : C.bill;
      if (top && !edge) {
        if ((x === 4 || x === 5) && (z === 1 || z === 2)) c = x + z === 5 ? C.goldL : C.gold; // the coin seal
        else if ((x === 1 && z === 1) || (x === 7 && z === 2)) c = C.ink;
        else if (h3(x, z, seed, 7) < 0.18) c = C.billL;
      }
      v.set(x0 + x, y, z0 + z, c);
    }
}

/** A banded bundle of bills (h layers). */
export function billBundleGeometry(h = 3) {
  return cached('bundle' + h, () => {
    const v = new VoxelModel();
    for (let y = 0; y < h; y++) billFace(v, -4, y, -2, { top: y === h - 1, seed: y });
    // edges of the stack: paper layers
    for (let y = 0; y < h - 1; y++) for (let x = -4; x <= 4; x++) { v.set(x, y, 1, y % 2 ? C.billL : C.billD); }
    // the paper band round the middle
    for (let y = 0; y < h; y++) for (const z of [-2, -1, 0, 1]) { v.set(-1, y, z, C.band); v.set(0, y, z, y === h - 1 && z === 0 ? C.bandR : C.band); }
    for (const z of [-2, -1, 0, 1]) v.set(-1, h, z, C.bandD);
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

/** A single loose bill (the fluttering ones): 9 x 4, one voxel thin, centred. */
export function billGeometry() {
  return cached('bill', () => {
    const v = new VoxelModel();
    billFace(v, -4, 0, -2, { top: true, seed: 5 });
    return v.build({ pivot: [0.5, 0.5, 0], scale: MONEY_V, ao: false });
  });
}

// the blue fish logo of Reynard's money sack (foxRig sackModel), k voxels per logo voxel,
// facing +z at depth z, centred on (cx, cy)
const FISH = [[-1, 0], [0, 0], [1, 0], [0, 1], [0, -1], [2, 1], [2, -1]];
function fishLogo(v, cx, cy, z, k = 1, keep = () => true) {
  for (const [fx, fy] of FISH)
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (keep(fx * k + i, fy * k + j)) v.set(cx + fx * k + i, cy + fy * k + j, z, C.fish);
}

// ------------------------------------------------------------------ the crate desk
/**
 * An upturned plank crate (16 x 9 x 10 voxels at CRATE_V) in the game's crate planks:
 * slatted sides with gaps, darker corner posts, a top of three planks with nail heads,
 * and the blue fish logo stencilled on the front (the one on his money sack). Origin:
 * centre of the footprint on the ground. Returns { group, top } (top = the plank top).
 */
export function makeCrateDesk() {
  const geo = cached('crate', () => {
    const v = new VoxelModel();
    const W = 8, D = 5, H = 9; // half width, half depth, height (voxels)
    const grain = (x, y, z, k) => {
      const n = h3(x, y, z, k);
      return n < 0.14 ? C.woodD : n > 0.86 ? C.woodL : n > 0.6 ? C.woodM : C.wood;
    };
    for (let x = -W; x <= W - 1; x++)
      for (let z = -D; z <= D - 1; z++)
        for (let y = 0; y < H; y++) {
          const sideX = x === -W || x === W - 1, sideZ = z === -D || z === D - 1;
          const post = sideX && sideZ;
          if (!sideX && !sideZ && y < H - 1) continue; // hollow
          let c;
          if (post) c = C.woodD;
          else if (y === H - 1) {
            // the top: three planks across with gaps between them, grain along x
            const plank = Math.floor((z + D) / (2 * D / 3));
            const gapZ = z === -2 || z === 1;
            c = gapZ ? C.gap : grain(Math.floor(x / 3), plank, 0, 11);
            if ((x === -W + 1 || x === W - 2) && (z === -4 || z === 3 || z === 0)) c = C.nail; // nail heads
          } else {
            // slatted sides: 3 slats with gaps (grain runs along the slat)
            const gapY = y === 2 || y === 5;
            if (gapY) c = C.gap;
            else c = grain(sideZ ? Math.floor(x / 4) : Math.floor(z / 4), Math.floor(y / 3), sideZ ? z : x, 3);
            if (!gapY && (y === 0 || y === 3 || y === 6) && (x === -W + 1 || x === W - 2 || z === -D + 1 || z === D - 2) && !post) c = y === 3 ? C.nailL : C.nail;
          }
          v.set(x, y, z, c);
        }
    // the fish logo stencilled on the front slats (z = D - 1 faces the camera), a little worn
    fishLogo(v, -1, 4, D, 2, (i, j) => h3(i, j, 9) > 0.12);
    return v.build({ pivot: [0, 0, 0], scale: CRATE_V });
  });
  const g = new THREE.Group();
  g.name = 'heistCrate';
  g.add(mesh(geo));
  return { group: g, top: 9 * CRATE_V };
}

// ------------------------------------------------------------------ the money sack
/**
 * Burlap money sack. kind 'open': slumped on the grass, mouth rolled open and full
 * of gold. kind 'full': stuffed fat, the neck tied with rope, a coin poking out of the
 * knot, his blue fish logo on the front. Origin: bottom centre.
 */
export function sackGeometry(kind = 'full') {
  return cached('sack' + kind, () => {
    const v = new VoxelModel();
    const full = kind === 'full';
    const H = full ? 11 : 8;
    const weave = (x, y, z) => { // his sack's burlap speckle (foxRig tone(): sack / sackD / sackL)
      const n = h3(x, y, z, 21);
      return n < 0.1 ? C.sackD : n > 0.91 ? C.sackL : C.sack;
    };
    for (let y = 0; y < H; y++) {
      // bulging profile, flat-ish bottom
      const u = y / (H - 1);
      // full: a fat round belly; open: slumped, wide at the bottom, pinched waist, a flared cuff
      const rx = full ? 5.6 * Math.sin(Math.PI * (0.22 + u * 0.66)) + 0.6 : u < 0.75 ? 6.1 - u * 2.2 + Math.sin(u * 9) * 0.25 : 4.5 + (u - 0.75) * 5;
      const rz = rx * 0.82;
      for (let x = -7; x <= 7; x++)
        for (let z = -6; z <= 6; z++) {
          const a = Math.atan2(z, x);
          const fold = full ? 0 : Math.sin(a * 5 + y * 0.35) * 0.07; // soft folds down the sides
          const d = Math.hypot(x / rx, z / rz) + fold;
          if (d > 1) continue;
          if (!full && y >= H - 2 && d < 0.72) continue; // open mouth
          let c = weave(x, y, z);
          if (x - z < -rx * 0.6) c = c === C.sack ? C.sackL : c; // lit side
          if (x + z > rx * 0.9) c = c === C.sack ? C.sackD : c;
          if (!full && fold < -0.05 && d > 0.8) c = C.sackD; // the creases
          if (!full && y >= H - 2 && d > 0.85) c = (x + y) & 1 ? C.sackL : C.sack; // the folded-over cuff
          v.set(x, y, z, c);
        }
    }
    if (full) {
      // the neck, the rope tie, the floppy ears of burlap, a coin in the knot
      for (let y = H; y < H + 3; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.set(x, y, z, weave(x, y, z));
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) === 2 || Math.abs(z) === 2) v.set(x, H, z, (x + z) & 1 ? C.rope : C.ropeL);
      for (const [x, z] of [[-2, 0], [2, 1], [0, -2], [1, 2]]) { v.set(x, H + 3, z, C.sackL); v.set(x * 1.5, H + 4, z * 1.5, C.sack); }
      v.set(0, H + 3, 0, C.gold); v.set(1, H + 3, 0, C.goldL); v.set(0, H + 4, 0, C.goldL);
      // the rope's loose end
      v.set(3, H - 1, 0, C.rope); v.set(3, H - 2, 1, C.ropeL); v.set(4, H - 3, 1, C.rope);
      // his sack's blue fish logo on the front (z+), painted on the burlap
      for (const [fx, fy] of FISH) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const x = fx * 2 + i - 1, y = 5 + fy * 2 + j;
        for (let z = 7; z > 0; z--) if (v.has(x, y, z)) { v.set(x, y, z, C.fish); break; }
      }
    } else {
      // the rolled rim and a mound of gold in the mouth
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        const d = Math.hypot(x / 4.8, z / 4);
        if (d > 0.72 && d <= 1.05) v.set(x, H, z, (x + z) & 1 ? C.sackL : C.sack);
        if (d <= 0.72) { v.set(x, H - 2, z, (x * 7 + z * 3) % 5 === 0 ? C.goldL : (x + z) % 3 === 0 ? C.goldD : C.gold); if (d < 0.4) v.set(x, H - 1, z, (x + z) & 1 ? C.goldL : C.gold); }
      }
      v.set(0, H, 0, C.goldL); v.set(1, H, -1, C.goldD);
      // the loose drawstring draped over the rim and down the front
      for (const [x, y, z] of [[-2, H, 4], [-2, H - 1, 5], [-3, H - 2, 5], [-3, H - 3, 6], [-2, H - 4, 6], [-2, H - 5, 6]]) v.set(x, y, z, (y & 1) ? C.rope : C.ropeL);
      // the fish logo on the front, under the drawstring
      for (const [fx, fy] of FISH) { const x = fx, y = 3 + fy; for (let z = 7; z > 0; z--) if (v.has(x, y, z)) { v.set(x, y, z, C.fish); break; } }
    }
    return v.build({ pivot: [0, 0, 0], scale: CRATE_V });
  });
}

export function makeSack() {
  const m = mesh(sackGeometry('open'));
  m.name = 'heistSack';
  m.setKind = (k) => { m.geometry = sackGeometry(k); m.kind = k; };
  m.kind = 'open';
  return m;
}

// ------------------------------------------------------------------ the money on the desk
/**
 * The money on the crate: the coin heap (left of centre), three coin stacks (right) and
 * two bundles of bills (front left / back right). setStacks(a, b, c) swaps stack
 * heights; setCount(k) shows k of the stacks' coins in order (counting); visible flags
 * per part let the scoop / pour beats empty and refill the desk.
 */
export function makeDeskMoney() {
  const g = new THREE.Group();
  g.name = 'heistMoney';
  const heap = mesh(coinHeapGeometry(3));
  heap.position.set(-0.12, 0, 0.0);
  heap.rotation.y = 0.3;
  const stacks = [0, 1, 2].map((i) => {
    const m = mesh(coinStackGeometry(4));
    m.position.set(0.075 + i * 0.095, 0, [-0.05, 0.05, -0.04][i]);
    m.n = 4;
    return m;
  });
  const bundles = [0, 1].map((i) => {
    const m = mesh(billBundleGeometry(i ? 4 : 3));
    m.position.set(i ? 0.19 : -0.2, 0, i ? -0.15 : 0.12);
    m.rotation.y = i ? -0.15 : 0.45;
    return m;
  });
  g.add(heap, ...stacks, ...bundles);
  const api = {
    group: g, heap, stacks, bundles,
    setStack(i, n) { const m = stacks[i]; n = Math.max(1, Math.min(12, n | 0)); if (m.n !== n) { m.n = n; m.geometry = coinStackGeometry(n); } },
    stackTop(i, out = new THREE.Vector3()) { const m = stacks[i]; m.updateWorldMatrix(true, false); return m.localToWorld(out.set(0, (m.n + 0.5) * MONEY_V, 0)); },
    show(on) { heap.visible = on; for (const m of stacks) m.visible = on; for (const m of bundles) m.visible = on; },
    reset() { [5, 3, 4].forEach((n, i) => api.setStack(i, n)); api.show(true); heap.scale.setScalar(1); },
  };
  api.reset();
  return api;
}

// ------------------------------------------------------------------ fluttering bills
/**
 * A small pool of loose bills with paper physics: flung out of the sack, they tumble,
 * flutter side to side as they fall, and settle flat on the grass (or the crate).
 *   const B = new BillFlurry(parent, { groundAt: (x, z) => y })
 *   B.fling(x, y, z, vx, vy, vz)   B.update(dt)   B.clear()
 */
export class BillFlurry {
  constructor(parent, { max = 14, groundAt = () => 0, size = 1 } = {}) {
    this.groundAt = groundAt;
    this.size = size; // comic exaggeration: the loose bills read from a wide shot
    this.list = [];
    const geo = billGeometry();
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, voxelMaterial());
      m.castShadow = true;
      m.visible = false;
      parent.add(m);
      this.list.push({ m, on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, t: 0, seed: i * 1.7, landed: false, life: 0 });
    }
    this.next = 0;
  }
  fling(x, y, z, vx, vy, vz, { life = 14 } = {}) {
    let b = this.list.find((q) => !q.on);
    if (!b) { b = this.list[this.next]; this.next = (this.next + 1) % this.list.length; }
    b.on = true; b.landed = false; b.t = 0; b.life = life;
    b.p.set(x, y, z); b.v.set(vx, vy, vz);
    b.rx = Math.random() * 6; b.ry = Math.random() * 6; b.rz = Math.random() * 6;
    b.wx = (Math.random() - 0.5) * 14; b.wy = (Math.random() - 0.5) * 6; b.wz = (Math.random() - 0.5) * 14;
    b.m.visible = true;
    b.m.scale.setScalar(this.size);
    return b;
  }
  update(dt) {
    for (const b of this.list) {
      if (!b.on) continue;
      b.t += dt;
      const m = b.m;
      if (!b.landed) {
        // paper: heavy drag, a gentle fall, swinging side to side as it rocks
        const sw = Math.sin(b.t * 5.2 + b.seed);
        b.v.x *= Math.exp(-dt * 2.4); b.v.z *= Math.exp(-dt * 2.4);
        b.v.y = Math.max(b.v.y - dt * 3.2, -0.55 - Math.abs(sw) * 0.25);
        b.p.x += (b.v.x + sw * 0.35) * dt;
        b.p.y += b.v.y * dt;
        b.p.z += (b.v.z + Math.cos(b.t * 4.1 + b.seed) * 0.2) * dt;
        b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
        b.wx *= Math.exp(-dt * 0.8); b.wz *= Math.exp(-dt * 0.8);
        // settle towards flat as it slows down
        const flat = Math.min(1, b.t * 0.6);
        m.rotation.set(b.rx * (1 - flat) + sw * 0.5 * flat, b.ry, b.rz * (1 - flat) + Math.cos(b.t * 5.2 + b.seed) * 0.35 * flat);
        const gy = this.groundAt(b.p.x, b.p.z);
        if (b.p.y <= gy + 0.012 && b.v.y <= 0) {
          b.landed = true;
          b.p.y = gy + 0.012;
          m.rotation.set(0, b.ry, 0);
        }
      } else if (b.t > b.life) {
        const k = Math.max(0, 1 - (b.t - b.life) / 0.6);
        m.scale.setScalar(k * this.size);
        if (k <= 0) { b.on = false; m.visible = false; }
      }
      m.position.copy(b.p);
    }
  }
  clear() { for (const b of this.list) { b.on = false; b.m.visible = false; } }
  /** let every bill shrink away now (a loop reset while the camera may still see them) */
  fadeAll() { for (const b of this.list) if (b.on) { b.landed = true; b.life = Math.min(b.life, b.t); } }
  dispose() { for (const b of this.list) b.m.removeFromParent(); this.list.length = 0; }
}

export function disposeHeistProps() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
