// [v33 town] Footpaths for the neighbours: A* over the tile grid, cheap and
// on demand (one search per outing). Cleared land and your painted paths are
// cheap, a few forest tiles are allowed (a short cut through the trees), water
// only on a boardwalk / dam / platform, buildings and the neighbours' own
// houses are walls. The tile path is then string-pulled into a few waypoints
// so they stroll in straight lines instead of zig-zagging tile by tile.
import { KIND } from '../../world/grid.js';

const INF = 1e9;
const SQ2 = Math.SQRT2;
const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
const DECK = new Set(['dam', 'gate', 'platform', 'bridge', 'dock', 'boardwalk']);

export class TownPaths {
  constructor(game) {
    this.game = game;
    this.blocked = new Set(); // extra walls: the neighbours' houses, mills, stalls...
    this._cost = null;
    this._costT = -1;
  }

  /** mark the tiles under a world-space box (x0..x1, z0..z1) as walls */
  blockBox(x0, z0, x1, z1) {
    const g = this.game.grid;
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) if (g.inb(x, z)) this.blocked.add(z * g.w + x);
    this._costT = -1;
  }

  /** cost of stepping onto tile i (INF = never) */
  tileCost(x, z) {
    const g = this.game.grid;
    if (!g.inb(x, z)) return INF;
    const i = z * g.w + x;
    if (this.blocked.has(i)) return INF;
    const k = g.kind[i];
    const P = this.game.paths;
    const s = g.occ[i] >= 0 ? g.structAt(x, z) : null;
    if (k === KIND.WATER) {
      if (P?.deckY?.(x, z) != null) return 1;
      if (s && s.built && DECK.has(s.type)) return 1.6;
      return INF;
    }
    if (g.occ[i] === -2) return INF; // the fox's hut, landmarks
    if (s && s.built && (s.def.blocksBear || (s.def.size && (s.def.size[0] > 1 || s.def.size[1] > 1)))) return INF;
    if (k === KIND.ROCK || k === KIND.SNOW) return 14;
    let c = k === KIND.FOREST ? 7 : k === KIND.TRAIL ? 0.8 : g.meadow[i] ? 1 : 2;
    if (g.deco[i] >= 0 || g.deco[i] === -3) c += k === KIND.FOREST ? 2 : 9; // a tree / boulder in the way
    if (s) c += 3; // small builds: go round if you can
    if (P?.isPath?.(x, z)) c = Math.min(c, 0.55);
    return c;
  }

  // the cost map is rebuilt lazily (a few ms) at most every few seconds
  costMap() {
    const game = this.game, g = game.grid;
    if (this._cost && game.time - this._costT < 6) return this._cost;
    const n = g.w * g.h;
    const C = this._cost && this._cost.length === n ? this._cost : new Float32Array(n);
    for (let z = 0; z < g.h; z++) for (let x = 0; x < g.w; x++) C[z * g.w + x] = this.tileCost(x, z);
    this._cost = C;
    this._costT = game.time;
    return C;
  }

  /** A* from world point a to b. Returns [{x, z}] waypoints (world) or null. maxForest: forest tiles allowed. */
  find(a, b, { maxForest = 10, maxNodes = 26000 } = {}) {
    const g = this.game.grid;
    const C = this.costMap();
    const W = g.w;
    const sx = Math.floor(a.x), sz = Math.floor(a.z), tx = Math.floor(b.x), tz = Math.floor(b.z);
    if (!g.inb(sx, sz) || !g.inb(tx, tz)) return null;
    const start = sz * W + sx, goal = tz * W + tx;
    if (C[goal] >= INF) return null;
    const n = W * g.h;
    const G = (this._g && this._g.length === n) ? this._g : (this._g = new Float32Array(n));
    const from = (this._from && this._from.length === n) ? this._from : (this._from = new Int32Array(n));
    const stamp = (this._stamp && this._stamp.length === n) ? this._stamp : (this._stamp = new Uint32Array(n));
    const run = (this._run = (this._run || 0) + 1);
    const heap = new MinHeap();
    G[start] = 0; from[start] = -1; stamp[start] = run;
    const h = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * 0.55; };
    heap.push(start, h(start));
    let seen = 0, found = false;
    while (heap.size) {
      const i = heap.pop();
      if (i === goal) { found = true; break; }
      if (++seen > maxNodes) break;
      const x = i % W, z = (i / W) | 0, gi = G[i];
      for (const [dx, dz, m] of N8) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= g.h) continue;
        const j = nz * W + nx;
        const c = C[j];
        if (c >= INF) continue;
        if (m > 1 && (C[z * W + nx] >= INF || C[nz * W + x] >= INF)) continue; // no corner cutting past walls
        const ng = gi + c * m;
        if (stamp[j] === run && ng >= G[j]) continue;
        stamp[j] = run; G[j] = ng; from[j] = i;
        heap.push(j, ng + h(j));
      }
    }
    if (!found) return null;
    const tiles = [];
    for (let i = goal; i !== -1; i = from[i]) tiles.push(i);
    tiles.reverse();
    let forest = 0;
    for (const i of tiles) if (g.kind[i] === KIND.FOREST) forest++;
    if (forest > maxForest) return null;
    return this.smooth(tiles, a, b);
  }

  // string-pulling: keep a waypoint only where a straight line would leave cheap ground
  smooth(tiles, a, b) {
    const g = this.game.grid, W = g.w, C = this._cost;
    const pts = tiles.map((i) => ({ x: (i % W) + 0.5, z: ((i / W) | 0) + 0.5, c: C[i] }));
    pts[0] = { x: a.x, z: a.z, c: pts[0].c };
    pts[pts.length - 1] = { x: b.x, z: b.z, c: pts[pts.length - 1].c };
    const clear = (p, q) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z), n = Math.ceil(d / 0.3);
      let worst = 0;
      for (let k = 1; k < n; k++) {
        const x = Math.floor(p.x + ((q.x - p.x) * k) / n), z = Math.floor(p.z + ((q.z - p.z) * k) / n);
        const c = C[z * W + x];
        if (c >= INF) return false;
        worst = Math.max(worst, c);
      }
      return worst <= Math.max(2.2, p.c, q.c);
    };
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 24);
      while (j > i + 1 && !clear(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out.map((p) => ({ x: p.x, z: p.z }));
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(id, pr) {
    const K = this.k, V = this.v;
    let i = K.length;
    K.push(id); V.push(pr);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (V[p] <= pr) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = id; V[i] = pr;
  }
  pop() {
    const K = this.k, V = this.v;
    const top = K[0];
    const lk = K.pop(), lv = V.pop();
    if (K.length) {
      let i = 0;
      const n = K.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && V[c + 1] < V[c]) c++;
        if (V[c] >= lv) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = lk; V[i] = lv;
    }
    return top;
  }
}
