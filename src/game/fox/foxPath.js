// [v30 reynard] Reynard's path finder: A* on the tile grid (8-neighbour, no corner
// cutting), round water, trees, rocks, buildings and fog, then string-pulled to a
// handful of waypoints. All buffers are typed arrays reused between searches; the
// passability map is rebuilt lazily when the land changes.
//
//   const P = new FoxPath(game);
//   const n = P.find(x0, z0, x1, z1)   // -> waypoint count (0 = no path), points in P.pts[2*i], P.pts[2*i+1]
//   P.clearLine(x0, z0, x1, z1)        // straight walk possible?
//   P.free(x, z)                       // tile walkable?
//   P.nearestFree(x, z, r)             // -> { x, z } centre of the closest walkable tile (shared object) or null
import { FloatHeap } from '../../world/grid.js';
import { KIND } from '../../world/grid.js';
import { HUT } from '../../world/worldgen.js';

// structures you can walk over / through (flat or low stuff)
const FLAT = new Set(['flowers', 'fern', 'tallgrass', 'glowmeadow', 'duckweed', 'lilypad', 'seaweed', 'stones', 'platform', 'dam', 'gate', 'stringlights', 'butterflybush']);
const MAX_PTS = 48;
const N8X = [1, -1, 0, 0, 1, 1, -1, -1], N8Z = [0, 0, 1, -1, 1, -1, 1, -1];

export class FoxPath {
  constructor(game) {
    this.game = game;
    const g = game.grid;
    const n = g.w * g.h;
    this.w = g.w; this.h = g.h;
    this.pass = new Uint8Array(n);
    this.gs = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n); // generation stamps (no fills between searches)
    this.shut = new Uint32Array(n);
    this.gen = 0;
    this.heap = new FloatHeap(1024);
    this.raw = new Int32Array(4096);
    this.pts = new Float32Array(MAX_PTS * 2);
    this.n = 0;
    this._sig = '';
    this._t = -99;
    this._near = { x: 0, z: 0 };
  }

  // land, structures, fog: rebuild the walkable map when any of them changed (cheap, on demand only)
  refresh(force = false) {
    const game = this.game, g = game.grid;
    const sig = g.version + ':' + (game.structures?.list?.length || 0) + ':' + (game.world?.landVersion || 0) + ':' + (game.state?.zones?.length || 0);
    const now = game.time || 0;
    if (!force && sig === this._sig && now - this._t < 6) return;
    this._sig = sig; this._t = now;
    const P = this.pass, W = g.w, H = g.h;
    const zones = game.zones;
    for (let z = 0; z < H; z++)
      for (let x = 0; x < W; x++) {
        const i = z * W + x;
        let ok = 1;
        const k = g.kind[i];
        if (g.deco[i] >= 0 || g.deco[i] === -3) ok = 0;
        else if (k === KIND.ROCK || k === KIND.SNOW) ok = 0;
        else if (g.occ[i] === -2) ok = 0; // the hut
        else {
          const id = g.occ[i];
          if (id >= 0) {
            const s = g.getStruct(id);
            if (s && !s.removed && !FLAT.has(s.type)) ok = 0;
            else if (k === KIND.WATER && !(s && (s.type === 'platform' || s.type === 'dam'))) ok = 0;
          } else if (k === KIND.WATER) ok = 0;
        }
        P[i] = ok;
      }
    // fog banks (cheap: only the meadow surroundings matter, but fogAt is a lookup)
    if (zones?.fogAt) {
      for (let z = 0; z < H; z++)
        for (let x = 0; x < W; x++) {
          const i = z * W + x;
          if (P[i] && !g.meadow[i] && (zones.fogAt(x, z) || 0) > 0.5) P[i] = 0;
        }
    }
    // the porch (in front of the door) is walkable
    P[(HUT.z + 2) * W + HUT.x + 1] = 1;
  }

  free(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    return x >= 0 && z >= 0 && x < this.w && z < this.h && this.pass[z * this.w + x] === 1;
  }

  nearestFree(x, z, r = 4) {
    const fx = Math.floor(x), fz = Math.floor(z);
    if (this.free(fx, fz)) { this._near.x = x; this._near.z = z; return this._near; }
    let best = -1, bd = 1e9;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const tx = fx + dx, tz = fz + dz;
        if (!this.free(tx, tz)) continue;
        const d = (tx + 0.5 - x) ** 2 + (tz + 0.5 - z) ** 2;
        if (d < bd) { bd = d; best = tz * this.w + tx; }
      }
    if (best < 0) return null;
    this._near.x = (best % this.w) + 0.5; this._near.z = Math.floor(best / this.w) + 0.5;
    return this._near;
  }

  // walkable straight segment? (samples every 0.2 tiles, with a little body width)
  clearLine(x0, z0, x1, z1, rad = 0.18) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(d / 0.2));
    const nx = d > 0 ? -dz / d * rad : 0, nz = d > 0 ? dx / d * rad : 0;
    for (let k = 1; k <= n; k++) {
      const x = x0 + (dx * k) / n, z = z0 + (dz * k) / n;
      if (!this.free(x, z) || !this.free(x + nx, z + nz) || !this.free(x - nx, z - nz)) {
        // the last stretch into a blocked goal tile (the door, a nest) is fine
        if (k === n || Math.hypot(x1 - x, z1 - z) < 0.6) continue;
        return false;
      }
    }
    return true;
  }

  // A* from (x0,z0) to (x1,z1). Fills this.pts with waypoints (the last one is the goal itself).
  find(x0, z0, x1, z1, maxNodes = 9000) {
    this.refresh();
    this.n = 0;
    const W = this.w, H = this.h;
    // start: the tile under the fox, or the nearest free one (he may stand on a porch edge)
    let s = this.nearestFree(x0, z0, 2);
    if (!s) return 0;
    const sx = Math.floor(s.x), sz = Math.floor(s.z);
    let e = this.nearestFree(x1, z1, 4);
    if (!e) return 0;
    const ex = Math.floor(e.x), ez = Math.floor(e.z);
    const goalBlocked = !this.free(x1, z1);
    const si = sz * W + sx, ei = ez * W + ex;
    // a straight line will do?
    if (this.clearLine(x0, z0, x1, z1)) { this.pts[0] = x1; this.pts[1] = z1; this.n = 1; return 1; }
    // bounding box keeps the search small
    const pad = 14;
    const bx0 = Math.max(0, Math.min(sx, ex) - pad), bx1 = Math.min(W - 1, Math.max(sx, ex) + pad);
    const bz0 = Math.max(0, Math.min(sz, ez) - pad), bz1 = Math.min(H - 1, Math.max(sz, ez) + pad);
    const gen = ++this.gen;
    if (gen > 4e9) { this.seen.fill(0); this.shut.fill(0); this.gen = 1; }
    const G = this.gs, F = this.from, seen = this.seen, shut = this.shut, P = this.pass, hp = this.heap;
    hp.clear();
    seen[si] = this.gen; G[si] = 0; F[si] = -1;
    const hfn = (x, z) => { const ax = Math.abs(x - ex), az = Math.abs(z - ez); return (ax > az ? ax : az) + 0.414 * (ax < az ? ax : az); };
    hp.push(si, hfn(sx, sz));
    let found = false, count = 0;
    while (hp.size) {
      const c = hp.pop();
      if (shut[c] === this.gen) continue;
      shut[c] = this.gen;
      if (c === ei) { found = true; break; }
      if (++count > maxNodes) break;
      const cx = c % W, cz = (c - cx) / W;
      for (let k = 0; k < 8; k++) {
        const nx = cx + N8X[k], nz = cz + N8Z[k];
        if (nx < bx0 || nz < bz0 || nx > bx1 || nz > bz1) continue;
        const ni = nz * W + nx;
        if (!P[ni] || shut[ni] === this.gen) continue;
        const diag = k >= 4;
        if (diag && (!P[cz * W + nx] || !P[nz * W + cx])) continue;
        const ng = G[c] + (diag ? 1.414 : 1);
        if (seen[ni] !== this.gen || ng < G[ni]) {
          seen[ni] = this.gen; G[ni] = ng; F[ni] = c;
          hp.push(ni, ng + hfn(nx, nz));
        }
      }
    }
    if (!found) return 0;
    // walk back
    const R = this.raw;
    let m = 0;
    for (let c = ei; c >= 0 && m < R.length; c = F[c]) R[m++] = c;
    // string pulling: from the current point, jump to the furthest tile centre in sight
    let px = x0, pz = z0, i = m - 1, out = 0;
    while (i > 0 && out < MAX_PTS - 1) {
      let j = i - 1; // the next tile is always reachable
      for (let k = 0; k < i - 1; k++) { // furthest first
        const t = R[k];
        if (this.clearLine(px, pz, (t % W) + 0.5, Math.floor(t / W) + 0.5)) { j = k; break; }
      }
      const t = R[j];
      px = (t % W) + 0.5; pz = Math.floor(t / W) + 0.5;
      this.pts[out * 2] = px; this.pts[out * 2 + 1] = pz; out++;
      i = j;
      if (j === 0) break;
    }
    // the exact goal (inside a blocked tile only when it's close to the last free one)
    if (!goalBlocked || Math.hypot(x1 - px, z1 - pz) < 1.6) {
      if (out > 0 && this.clearLine(out > 1 ? this.pts[out * 2 - 4] : x0, out > 1 ? this.pts[out * 2 - 3] : z0, x1, z1)) out--; // replace the last tile centre
      this.pts[out * 2] = x1; this.pts[out * 2 + 1] = z1; out++;
    }
    this.n = out;
    return out;
  }
}
