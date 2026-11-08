// [v33 title] Voxel props for the noon title cinematic (src/game/title/HeistScene.js):
// Reynard's makeshift bank by the pond. An upturned fruit crate with a green felt
// counting pad, a heap of gold and silver coins, coin stacks that grow as he counts,
// banded bundles of bills, loose bills that flutter, and a burlap money sack
// (slumped open on the grass, or stuffed and tied for running away with).
//
// Everything is placed voxel by voxel: wood grain runs along each slat with gaps,
// nail heads and a stencilled fish; coins have bright rims on their lit side and
// dark rims on the shade side; bills carry a portrait oval and corner numbers.
// Geometry is built once and cached (the title runs for a long time).
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';

// fine voxels for money, coarser ones for the crate and sack
export const MONEY_V = 0.022;
export const CRATE_V = 0.04;

const C = {
  gold: 0xf2be3a, goldL: 0xffe27a, goldH: 0xfff6c8, goldD: 0xb8801e, goldDD: 0x8a5a14,
  silver: 0xd6dce6, silverL: 0xf4f8ff, silverD: 0x8e98aa,
  bill: 0xd2ecb4, billL: 0xf0fadc, billD: 0x86c06a, billDD: 0x4a8a3e, ink: 0x2e6a32, // pale mint paper: reads on the grass band: 0xf2ead0, bandD: 0xc8b890, bandR: 0xc8483a,
  wood: 0xc28a50, woodL: 0xdcaa6a, woodD: 0x956236, woodDD: 0x5e3a1e, gap: 0x3a2414, nail: 0x6a6670, nailL: 0xaaa6b0,
  felt: 0x2f8a52, feltL: 0x46a868, feltD: 0x1f6a3c, trim: 0xe0b040,
  paint: 0x2c4a7a, paintL: 0x46689a,
  sack: 0xc8a06a, sackL: 0xe0bc84, sackD: 0x9a7444, sackDD: 0x6e5030, rope: 0x8a5a2a, ropeL: 0xb07a3a, dollar: 0x2f6a3a,
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

// ------------------------------------------------------------------ coins
// a coin lying flat: radius ~2.5 voxels, one voxel thick. Lit from the upper left:
// a bright rim arc on the far-left side, a dark rim arc on the near-right side.
function coinDisc(v, cx, cy, cz, { r = 2.6, silver = false, seed = 0, dim = false } = {}) {
  const P = silver ? [C.silver, C.silverL, C.silverD, C.silverD] : [C.gold, C.goldL, C.goldD, C.goldDD];
  const R = Math.ceil(r);
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      const d = Math.hypot(x, z);
      if (d > r) continue;
      let c = P[0];
      if (d > r - 1) c = dim ? (x + z < -0.5 ? P[0] : P[3]) : x + z < -0.5 ? P[1] : x + z > 1.5 ? P[3] : P[2]; // (dim: the milled edge between stacked coins)
      else if (Math.abs(x) + Math.abs(z) <= 1 && h3(x, z, cy, seed) < 0.5) c = P[1]; // the embossed face catches light
      v.set(cx + x, cy, cz + z, c);
    }
}

/** A heap of coins: irregular, with a few coins standing on edge and some silver ones. */
export function coinHeapGeometry(seed = 3) {
  return cached('heap' + seed, () => {
    const v = new VoxelModel();
    const rnd = rng(seed * 977 + 13);
    const layers = [[7.2, 9], [6, 8], [4.8, 6], [3.4, 4], [2, 2]];
    layers.forEach(([rad, n], y) => {
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
        coinDisc(v, Math.round(Math.cos(a) * d), y, Math.round(Math.sin(a) * d * 0.8), { r: 2.2 + rnd() * 0.6, silver: rnd() < 0.18, seed: i + y * 31 });
      }
    });
    // coins standing on edge, leaning out of the heap
    for (const [x, z, y] of [[-3, 1, 2], [2, -2, 3], [4, 2, 1], [-1, -3, 2]]) {
      for (let k = -2; k <= 2; k++) for (let j = 0; j <= 4; j++) {
        const d = Math.hypot(k, j - 2);
        if (d > 2.5) continue;
        v.set(x + k, y + j, z, d > 1.6 ? C.goldD : k < 0 ? C.goldL : C.gold);
      }
    }
    // a top crown and glints
    v.set(0, 5, 0, C.goldH); v.set(-1, 5, 0, C.goldL); v.set(0, 5, -1, C.goldL);
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

/** A neat stack of n coins (one voxel each), slightly staggered. */
export function coinStackGeometry(n, silver = false) {
  return cached('stack' + n + silver, () => {
    const v = new VoxelModel();
    for (let i = 0; i < n; i++) {
      const o = [0, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1][i % 12];
      coinDisc(v, o * (i % 3 === 2 ? 1 : 0), i, (i % 5 === 3 ? 1 : 0), { r: 2.6, silver, seed: i, dim: i % 2 === 1 && i < n - 1 });
    }
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

/** One coin (for the dropped coin on the grass, pours, the stack's newest coin). */
export function coinGeometry() {
  return cached('coin', () => {
    const v = new VoxelModel();
    coinDisc(v, 0, 0, 0, { r: 2.6 });
    v.set(0, 1, 0, C.goldL); v.set(-1, 1, 0, C.gold); // the embossed fox head
    return v.build({ pivot: [0, -0.5, 0], scale: MONEY_V });
  });
}

// ------------------------------------------------------------------ bills
function billFace(v, x0, y, z0, { top = true, seed = 0 } = {}) {
  // 9 x 4 voxels: border, a portrait oval, corner numbers
  for (let x = 0; x < 9; x++)
    for (let z = 0; z < 4; z++) {
      const edge = x === 0 || x === 8 || z === 0 || z === 3;
      let c = edge ? C.billD : C.bill;
      if (top && !edge) {
        if ((x === 4 || x === 5) && (z === 1 || z === 2)) c = (x + z) % 2 ? C.billDD : C.ink; // portrait
        else if (x === 3 && z === 1) c = C.billL;
        else if ((x === 1 && z === 1) || (x === 7 && z === 2)) c = C.ink; // numerals
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

// ------------------------------------------------------------------ the crate desk
/**
 * An upturned fruit crate (16 x 9 x 11 voxels at CRATE_V): slatted sides with dark gaps,
 * corner posts, a top of three planks with nail heads, a stencilled fish on the front,
 * and a green felt counting pad with a gold trim edge on top. Origin: centre of the
 * footprint on the ground. Returns { group, top } (top = height of the felt).
 */
export function makeCrateDesk() {
  const geo = cached('crate', () => {
    const v = new VoxelModel();
    const W = 8, D = 5, H = 9; // half width, half depth, height (voxels)
    const grain = (x, y, z, k) => {
      const n = h3(x, y, z, k);
      return n < 0.14 ? C.woodD : n > 0.9 ? C.woodL : C.wood;
    };
    for (let x = -W; x <= W - 1; x++)
      for (let z = -D; z <= D - 1; z++)
        for (let y = 0; y < H; y++) {
          const sideX = x === -W || x === W - 1, sideZ = z === -D || z === D - 1;
          const post = sideX && sideZ;
          if (!sideX && !sideZ && y < H - 1) continue; // hollow
          let c;
          if (post) c = y === H - 1 ? C.woodL : (x + z + y) % 3 ? C.woodD : C.woodDD;
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
    // a stencilled fish on the front (z = D - 1 faces the camera), slightly worn
    const fish = ['..pp....', '.pppp.p.', 'ppqppppp', '.pppp.p.', '..pp....'];
    fish.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.' && h3(i, j, 9) > 0.12) v.set(-4 + i, 7 - j, D, row[i] === 'q' ? C.paintL : C.paint); });
    // the felt pad (one voxel on top) with a gold trim
    for (let x = -W + 1; x <= W - 2; x++)
      for (let z = -D + 1; z <= D - 2; z++) {
        const edge = x === -W + 1 || x === W - 2 || z === -D + 1 || z === D - 2;
        v.set(x, H, z, edge ? (((x + z) & 1) ? C.trim : 0xc89a30) : h3(x, z, 2) < 0.12 ? C.feltL : h3(x, z, 3) < 0.1 ? C.feltD : C.felt);
      }
    return v.build({ pivot: [0, 0, 0], scale: CRATE_V });
  });
  const g = new THREE.Group();
  g.name = 'heistCrate';
  g.add(mesh(geo));
  return { group: g, top: 10 * CRATE_V };
}

// ------------------------------------------------------------------ the money sack
/**
 * Burlap money sack. kind 'open': slumped on the grass, mouth rolled open and full
 * of gold. kind 'full': stuffed fat, the neck tied with rope, a coin poking out of the
 * knot, a big painted dollar sign. Origin: bottom centre.
 */
export function sackGeometry(kind = 'full') {
  return cached('sack' + kind, () => {
    const v = new VoxelModel();
    const full = kind === 'full';
    const H = full ? 11 : 8;
    const weave = (x, y, z) => {
      const n = h3(x, y, z, 21);
      if ((x + y * 2) % 4 === 0 && n < 0.5) return C.sackD;
      return n < 0.1 ? C.sackDD : n > 0.86 ? C.sackL : C.sack;
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
      // the painted dollar sign on the front (z+), a little crooked
      const S = ['.kk.', 'k...', '.kk.', '...k', '.kk.'];
      const fz = (y) => { for (let z = 6; z >= 0; z--) if (v.has(0, y, z)) return z + 1; return 5; };
      S.forEach((row, j) => { const y = 7 - j; const z = fz(y); for (let i = 0; i < 4; i++) if (row[i] === 'k') v.set(i - 2, y, z, C.dollar); });
      for (const y of [8, 2]) v.set(0, y, fz(y), C.dollar);
    } else {
      // the rolled rim and a mound of gold in the mouth
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
        const d = Math.hypot(x / 4.8, z / 4);
        if (d > 0.72 && d <= 1.05) v.set(x, H, z, (x + z) & 1 ? C.sackL : C.sack);
        if (d <= 0.72) { v.set(x, H - 2, z, (x * 7 + z * 3) % 5 === 0 ? C.goldL : (x + z) % 3 === 0 ? C.goldD : C.gold); if (d < 0.4) v.set(x, H - 1, z, (x + z) & 1 ? C.goldL : C.gold); }
      }
      v.set(0, H, 0, C.goldH); v.set(1, H, -1, C.silver);
      // the loose drawstring draped over the rim and down the front
      for (const [x, y, z] of [[-2, H, 4], [-2, H - 1, 5], [-3, H - 2, 5], [-3, H - 3, 6], [-2, H - 4, 6], [-2, H - 5, 6]]) v.set(x, y, z, (y & 1) ? C.rope : C.ropeL);
      // a painted dollar on the front, under the drawstring
      const S2 = ['.kk', 'k..', '.k.', '..k', 'kk.'];
      S2.forEach((row, j) => { for (let i = 0; i < 3; i++) if (row[i] === 'k') { const y = 5 - j, x = i - 1; for (let z = 7; z > 0; z--) if (v.has(x, y, z)) { v.set(x, y, z, C.dollar); break; } } });
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
 * The money on the felt: the coin heap (left of centre), three coin stacks (right) and
 * two bundles of bills (front left / back right). setStacks(a, b, c) swaps stack
 * heights; setCount(k) shows k of the stacks' coins in order (counting); visible flags
 * per part let the scoop / pour beats empty and refill the desk.
 */
export function makeDeskMoney() {
  const g = new THREE.Group();
  g.name = 'heistMoney';
  const heap = mesh(coinHeapGeometry(3));
  heap.position.set(-0.08, 0, 0.0);
  heap.rotation.y = 0.3;
  const stacks = [0, 1, 2].map((i) => {
    const m = mesh(coinStackGeometry(4, i === 1));
    m.position.set(0.12 + i * 0.075, 0, -0.03 + (i % 2) * 0.05);
    m.n = 4;
    return m;
  });
  const bundles = [0, 1].map((i) => {
    const m = mesh(billBundleGeometry(i ? 4 : 3));
    m.position.set(i ? 0.16 : -0.19, 0, i ? -0.11 : 0.1);
    m.rotation.y = i ? -0.35 : 0.5;
    return m;
  });
  g.add(heap, ...stacks, ...bundles);
  const api = {
    group: g, heap, stacks, bundles,
    setStack(i, n) { const m = stacks[i]; n = Math.max(1, Math.min(12, n | 0)); if (m.n !== n) { m.n = n; m.geometry = coinStackGeometry(n, i === 1); } },
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
  constructor(parent, { max = 14, groundAt = () => 0 } = {}) {
    this.groundAt = groundAt;
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
    b.m.scale.setScalar(1);
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
        m.scale.setScalar(k);
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
