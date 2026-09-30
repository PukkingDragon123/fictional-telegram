// Tile grid: terrain kind, height, static decorations and structure occupancy.
// Also provides BFS helpers for fish regions and bear navigation.

export const KIND = {
  GRASS: 0,
  SAND: 1,
  DIRT: 2,
  WATER: 3,
  ROCK: 4,
  SNOW: 5,
  FOREST: 6,
  TRAIL: 7,
};

export const WATER_Y = -0.1; // water surface height
export const FLOOR_DEEP = -1.05;
export const FLOOR_SHALLOW = -0.78;
export const FISH_Y = -0.46; // typical swimming depth

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.kind = new Uint8Array(n);
    this.height = new Float32Array(n);
    this.deco = new Int16Array(n).fill(-1); // index into decorations list, blocks tile
    this.occ = new Int32Array(n).fill(-1); // structure id
    this.meadow = new Uint8Array(n); // 1 = inside buildable clearing
    this.region = new Int32Array(n).fill(-1); // fish region id per water tile
    this.bearDist = new Float32Array(n); // distance field from bear entry
    this.version = 0; // bump when topology changes
    this.regionSizes = [];
    this.getStruct = () => null; // set by game: id -> structure
  }

  idx(x, z) { return z * this.w + x; }
  inb(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.h; }
  tileOf(wx) { return Math.floor(wx); }

  isWater(x, z) {
    return this.inb(x, z) && this.kind[z * this.w + x] === KIND.WATER;
  }

  structAt(x, z) {
    if (!this.inb(x, z)) return null;
    const id = this.occ[z * this.w + x];
    return id >= 0 ? this.getStruct(id) : null;
  }

  // Fish can swim here: water without a closed dam/gate.
  fishPassable(x, z) {
    if (!this.isWater(x, z)) return false;
    const s = this.structAt(x, z);
    if (s && s.built && s.def.blocksFish && !(s.def.gate && s.open)) return false;
    return true;
  }

  // Bears can walk / wade here.
  bearPassable(x, z) {
    if (!this.inb(x, z)) return false;
    const i = z * this.w + x;
    if (this.deco[i] >= 0 || this.deco[i] === -3) return false;
    const k = this.kind[i];
    if (k === KIND.ROCK || k === KIND.SNOW || k === KIND.FOREST) return false;
    if (!this.meadow[i] && k !== KIND.TRAIL) return false;
    if (this.occ[i] === -2) return false; // the fox's hut
    const s = this.structAt(x, z);
    if (s && s.built && s.def.blocksBear && !(s.def.gate && s.open && this.kind[i] === KIND.WATER)) return false;
    return true;
  }

  surfaceY(x, z) {
    if (!this.inb(x, z)) return 0;
    return this.height[z * this.w + x];
  }

  // Bilinear-ish ground height at world position (floor for water tiles)
  groundAt(wx, wz) {
    const x = Math.floor(wx), z = Math.floor(wz);
    return this.surfaceY(x, z);
  }

  hasWaterNeighbor(x, z, diag = false) {
    for (const [dx, dz] of diag ? N8 : N4) if (this.isWater(x + dx, z + dz)) return true;
    return false;
  }

  hasLandNeighbor(x, z) {
    for (const [dx, dz] of N4) {
      const nx = x + dx, nz = z + dz;
      if (this.inb(nx, nz) && !this.isWater(nx, nz)) return true;
    }
    return false;
  }

  // Recompute connected fish regions (4-neighbour flood fill).
  computeRegions() {
    const { w, h } = this;
    this.region.fill(-1);
    this.regionSizes = [];
    let rid = 0;
    const stack = [];
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        if (this.region[i] >= 0 || !this.fishPassable(x, z)) continue;
        let size = 0;
        stack.push(i);
        this.region[i] = rid;
        while (stack.length) {
          const c = stack.pop();
          size++;
          const cx = c % w, cz = (c / w) | 0;
          for (const [dx, dz] of N4) {
            const nx = cx + dx, nz = cz + dz;
            if (!this.inb(nx, nz)) continue;
            const ni = nz * w + nx;
            if (this.region[ni] >= 0 || !this.fishPassable(nx, nz)) continue;
            this.region[ni] = rid;
            stack.push(ni);
          }
        }
        this.regionSizes.push(size);
        rid++;
      }
    return rid;
  }

  regionAt(wx, wz) {
    const x = Math.floor(wx), z = Math.floor(wz);
    if (!this.inb(x, z)) return -1;
    return this.region[z * this.w + x];
  }

  // Dijkstra (8-neighbour, no corner cutting) from a set of start tiles over
  // bear-passable tiles. Water costs more. Returns Float32Array of distances.
  bearField(starts, out) {
    const { w, h } = this;
    const n = w * h;
    const dist = out || new Float32Array(n);
    dist.fill(Infinity);
    // simple bucketed queue (costs are small multiples of 1 / 1.4 / 1.6)
    const heap = new MinHeap();
    for (const i of starts) {
      dist[i] = 0;
      heap.push(i, 0);
    }
    while (heap.size) {
      const [c, cd] = heap.pop();
      if (cd > dist[c]) continue;
      const cx = c % w, cz = (c / w) | 0;
      for (let k = 0; k < 8; k++) {
        const dx = N8[k][0], dz = N8[k][1];
        const nx = cx + dx, nz = cz + dz;
        if (!this.bearPassable(nx, nz)) continue;
        if (dx !== 0 && dz !== 0 && (!this.bearPassable(cx + dx, cz) || !this.bearPassable(cx, cz + dz))) continue;
        const ni = nz * w + nx;
        let cost = dx !== 0 && dz !== 0 ? 1.414 : 1;
        if (this.kind[ni] === KIND.WATER) cost *= 1.5;
        const nd = cd + cost;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          heap.push(ni, nd);
        }
      }
    }
    return dist;
  }

  // Step downhill on a distance field from tile (x,z). Returns [nx,nz] or null.
  descend(field, x, z) {
    const { w } = this;
    let best = field[z * w + x], bx = -1, bz = -1;
    for (let k = 0; k < 8; k++) {
      const dx = N8[k][0], dz = N8[k][1];
      const nx = x + dx, nz = z + dz;
      if (!this.inb(nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (!this.bearPassable(x + dx, z) || !this.bearPassable(x, z + dz))) continue;
      const d = field[nz * w + nx];
      if (d < best - 1e-4) { best = d; bx = nx; bz = nz; }
    }
    return bx >= 0 ? [bx, bz] : null;
  }

  forEachNeighbor4(x, z, fn) {
    for (const [dx, dz] of N4) {
      const nx = x + dx, nz = z + dz;
      if (this.inb(nx, nz)) fn(nx, nz);
    }
  }

  countWater() {
    let c = 0;
    for (let i = 0; i < this.kind.length; i++) if (this.kind[i] === KIND.WATER) c++;
    return c;
  }
}

export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= val) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const rk = k[0], rv = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mv = lv;
        if (l < n && v[l] < mv) { m = l; mv = v[l]; }
        if (r < n && v[r] < mv) { m = r; mv = v[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m];
        i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return [rk, rv];
  }
}

export { N4, N8 };
