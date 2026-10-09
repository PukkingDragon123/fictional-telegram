// [v26 world] The big forest. generateWorld() (worldgen.js) still builds the old
// 140 x 118 map exactly as before; extendWorld() copies it into a taller grid
// (same width: every saved tile index z * 140 + x stays valid, decos keep their
// indices) and grows the land south of the old edge:
//
//   z 118..158  the Old Wood: rolling hills of old-growth giants, ferns and
//               mossy logs, clearings with sunbeams, Fern Brook running west to
//               east into the Daisy River, Mossy Run and Cedar Creek feeding it
//   z 158..172  the Broadwater: the Daisy River turns west and spreads into a
//               wide slow river that leaves the map (barrier 1: a rope bridge)
//   z 172..192  the Highland: stepped block terraces of old forest climbing to a
//               cliff, the Bramblewall across it (barrier 2), Mistfall Run on top
//   cliff       true-cube cliffs; the Fallen Giant (barrier 3) blocks Heron
//               Steps, the only ledge path down (barrier 4)
//   z 194..228  Mistfall Hollow (DEEP_ZONE): the falls, the pond, the grotto
//               with the stone house, Turtle Run draining south off the map
//   east        the Bearback massif: block mountains, impassable, so the only
//               way south is over the Broadwater
//
// Pure data (no three.js): runs in Node too (tests, map dumps).
import { Grid, KIND, WATER_Y } from './grid.js';
import { fbm2, hash2, clamp } from '../core/rng.js';
import {
  WORLD_W, WORLD_H, LEGACY_H, BIOME, GLADE, MEADOW, RIVERS, STREAMS, BARRIERS, DEEP_ZONE, WATERFALL, DEEP_POND, DEEP_HOUSE,
  NEAR_PATHS, refreshWaterHeights, forageKindFor,
} from './worldgen.js';
import { buildFlow } from './flow.js';

const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const q05 = (v) => Math.round(v * 2) / 2;

// distance from (x, z) to a polyline; also the local tangent and arc position
export function polyDist(x, z, pts, out = {}) {
  let best = 1e9, bt = 0, tx = 0, tz = 1, acc = 0, at = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, L = Math.sqrt(L2) || 1;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (L2 || 1), 0, 1);
    const d = Math.hypot(x - (ax + vx * t), z - (az + vz * t));
    if (d < best) { best = d; bt = i + t; tx = vx / L; tz = vz / L; at = acc + t * L; }
    acc += L;
  }
  out.d = best; out.seg = bt; out.tx = tx; out.tz = tz; out.s = at; out.len = acc;
  return out;
}

// half width of a river at arc fraction f (0 source .. 1 mouth)
export function riverHalfWidth(R, f, x, z) {
  const w = R.w1 != null ? R.w + (R.w1 - R.w) * smoothstep(0.55, 1, f) : R.w;
  return w + (fbm2(x * 0.15, z * 0.15, 51) - 0.5) * Math.min(0.8, w * 0.35);
}

// ----------------------------------------------------------------- geography
// cliff edge row of the Highland (first cliff row) at column x (x < 74)
export function cliffEdge(x) {
  if (x >= 29 && x <= 39) return 192;
  if (x >= 48 && x <= 62) return 191; // Heron Steps and the Fallen Giant above them
  return 191 + Math.round(1.3 * Math.sin(x * 0.17) + 0.8 * Math.sin(x * 0.071 + 2));
}
const HIGH_X1 = 74; // the hollow's east wall starts here

// the main river's centreline x at row z (from its polyline), or null
function mainRiverX(z) {
  const P = RIVERS[0].pts;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    if ((z >= az && z <= bz) || (z >= bz && z <= az)) return ax + (bx - ax) * ((z - az) / ((bz - az) || 1));
  }
  return null;
}

// raw region of a tile in the new rows
function regionOf(x, z) {
  const cx = x + 0.5, cz = z + 0.5;
  const n = (fbm2(x * 0.13, z * 0.13, 907) - 0.5) * 5;
  // the Bearback massif: east of the river's lower course, south of the Broadwater's
  // east end, and the hollow's east wall
  const rx = mainRiverX(cz);
  if (cz >= 127 && rx != null && cx > rx + 4.5 + n * 0.5) return 'massif';
  if (cz >= 157.5 && cx > 104 + n) return 'massif';
  if (cz >= 173 && cx > 99 + n) return 'massif';
  if (cz >= 187 + n * 0.4 && cx >= HIGH_X1 + n * 0.6) return 'massif';
  if (cz > WORLD_H - 2.5) return x < HIGH_X1 ? 'deep' : 'massif';
  const wide = polyDist(cx, cz, RIVERS[1].pts);
  if (cz >= 165 && wide.d > 7.4) {
    if (x < HIGH_X1) {
      const e = cliffEdge(x);
      if (z < e) return 'high';
      if (z < e + 4) return 'cliff';
      return 'deep';
    }
    return 'high';
  }
  return 'wood';
}

// Heron Steps: the ledge path down the cliff (switchbacks), top first
function cliffPath() {
  const out = [];
  const pts = [[54, 191], [55, 191], [56, 191], [57, 191], [57, 192], [56, 192], [55, 192], [54, 192], [54, 193], [55, 193], [56, 193], [57, 193], [58, 193], [58, 194], [57, 194], [56, 194], [55, 194], [55, 195], [56, 195], [57, 195]];
  for (const [x, z] of pts) out.push([x, z]);
  return out;
}

// a stream's way down the old mountain: always closer to the target, lowest step first
// (the old map's heights stay as they are: saved mining veins depend on them)
function descentPath(g, [sx, sz], [tx, tz]) {
  let x = Math.floor(sx), z = Math.floor(sz);
  const pts = [[x + 0.5, z + 0.5]];
  const seen = new Set([z * g.w + x]);
  for (let k = 0; k < 160; k++) {
    const d0 = Math.hypot(x + 0.5 - tx, z + 0.5 - tz);
    if (d0 < 1.3) break;
    let best = null, bs = 1e9;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!g.inb(nx, nz) || seen.has(nz * g.w + nx)) continue;
      const d1 = Math.hypot(nx + 0.5 - tx, nz + 0.5 - tz);
      if (d1 > d0 - 0.35) continue;
      const i = nz * g.w + nx;
      if (g.kind[i] === KIND.TRAIL || g.occ[i] === -2 || g.meadow[i]) continue;
      const sc = g.height[i] + d1 * 0.3 + hash2(nx, nz, 77) * 0.4;
      if (sc < bs) { bs = sc; best = [nx, nz]; }
    }
    if (!best) break;
    [x, z] = best;
    seen.add(z * g.w + x);
    pts.push([x + 0.5, z + 0.5]);
  }
  pts.push([tx, tz]);
  // one round of corner cutting so the ribbon bends instead of zig-zagging
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------------- extend
export function extendWorld(gen) {
  const old = gen.grid;
  const W = WORLD_W, H = WORLD_H, H0 = LEGACY_H;
  const g = new Grid(W, H);
  // the old rows, exactly as generated
  g.kind.set(old.kind); g.height.set(old.height); g.deco.set(old.deco); g.occ.set(old.occ); g.meadow.set(old.meadow);
  g.biome = new Uint8Array(W * H); g.biome.set(old.biome);
  g.glade = new Uint8Array(W * H); if (old.glade) g.glade.set(old.glade);
  g.ruins = old.ruins || []; g.forage = old.forage || [];
  g.cube = new Uint8Array(W * H); // drawn as true cubes (terrain.js): mountains, cliffs, the Highland, the massif
  g.barrier = new Uint8Array(W * H); // BARRIERS index + 1
  g.stream = new Uint8Array(W * H); // a perched stream runs over this tile (STREAMS index + 1)
  const { decos, clutter } = gen;

  // the old north mountain and its foothills are cube terrain
  for (let z = 0; z < H0; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (g.meadow[i] || g.kind[i] === KIND.WATER) continue;
      if (z < 22 || g.biome[i] === BIOME.ALPINE) g.cube[i] = 1;
    }

  // ---- regions of the new rows
  const reg = new Array(W * H);
  for (let z = H0; z < H; z++) for (let x = 0; x < W; x++) reg[z * W + x] = regionOf(x, z);
  // distance into the massif (for its height)
  const md = new Float32Array(W * H).fill(0);
  {
    const q = [];
    for (let z = H0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if (reg[i] === 'massif') md[i] = 1e9; }
    for (let z = H0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (reg[i] !== 'massif') continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx >= 0 && nx < W && nz >= H0 && nz < H && reg[nz * W + nx] !== 'massif') { md[i] = 1; q.push(i); break; } }
    }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % W, cz = (c / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nx >= W || nz < H0 || nz >= H) continue;
        const ni = nz * W + nx;
        if (md[ni] > md[c] + 1) { md[ni] = md[c] + 1; q.push(ni); }
      }
    }
  }

  // ---- heights, kinds, biomes
  const pd = {};
  const nearestRiver = (cx, cz) => {
    let best = null;
    for (const R of RIVERS) {
      polyDist(cx, cz, R.pts, pd);
      const f = pd.len ? pd.s / pd.len : 0;
      const hw = riverHalfWidth(R, f, cx, cz);
      const k = pd.d - hw;
      if (!best || k < best.k) best = { k, R, d: pd.d, hw };
    }
    return best;
  };
  const deepPond = (cx, cz) => {
    const dx = (cx - DEEP_POND.cx) / DEEP_POND.rx, dz = (cz - DEEP_POND.cz) / DEEP_POND.rz;
    return dx * dx + dz * dz < 1 + (fbm2(cx * 0.35, cz * 0.35, 5) - 0.5) * 0.35;
  };
  for (let z = H0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x, cx = x + 0.5, cz = z + 0.5;
      const r = reg[i];
      const nr = nearestRiver(cx, cz);
      let h = 0, k = KIND.FOREST, b = BIOME.OLDWOOD;
      if (r === 'massif') {
        const d = md[i];
        // forested foothills, bare rock higher up, snow on the tallest crags
        const peaks = Math.max(0, fbm2(x * 0.055, z * 0.055, 933) - 0.42) * 26 * smoothstep(2, 12, d);
        h = clamp(0.5 + Math.min(d * 0.8, 8) + peaks + (fbm2(x * 0.08, z * 0.08, 931) - 0.5) * 4 + Math.max(0, fbm2(x * 0.17, z * 0.17, 937) - 0.6) * 10, 0.5, 22);
        h = q05(h);
        const sn = 15.5 + (fbm2(x * 0.2, z * 0.2, 939) - 0.5) * 4;
        k = h > sn ? KIND.SNOW : h > 5.5 + (hash2(x, z, 941) - 0.5) * 2 ? KIND.ROCK : KIND.FOREST;
        b = BIOME.MASSIF;
        g.cube[i] = 1;
      } else if (r === 'high') {
        // stepped terraces: 1-unit steps rising from the Broadwater's bank to the cliff,
        // higher towards the west (the far ranges)
        const e = x < HIGH_X1 ? cliffEdge(x) : 189;
        let raw = 0.5 + 8 * smoothstep(173, e - 3, z) + Math.max(0, 28 - x) * 0.16 + (fbm2(x * 0.11, z * 0.11, 811) - 0.5) * 1.8;
        if (x >= HIGH_X1 - 2) raw += (x - HIGH_X1 + 2) * 0.4;
        h = Math.max(0.5, Math.round(raw));
        if (z < 174) h = Math.min(h, z < 173 ? 0.5 : 1);
        b = BIOME.HIGHLAND;
        g.cube[i] = 1;
      } else if (r === 'cliff') {
        const e = cliffEdge(x), kk = z - e;
        const top = Math.max(7, Math.round(0.5 + 8 + Math.max(0, 28 - x) * 0.16));
        const prof = [0.86, 0.62, 0.36, 0.12][kk] ?? 0.1;
        h = Math.max(0.5, q05(top * prof + (hash2(x, z, 941) - 0.5) * 1.2));
        k = KIND.ROCK; b = BIOME.HIGHLAND;
        g.cube[i] = 1;
      } else if (r === 'deep') {
        h = Math.max(0, fbm2(x * 0.09, z * 0.09, 951) - 0.45) * 3.2;
        h *= clamp((Math.hypot((cx - DEEP_POND.cx) / DEEP_POND.rx, (cz - DEEP_POND.cz) / DEEP_POND.rz) - 1.15) * 1.5, 0, 1);
        h = q05(h);
        b = BIOME.DEEP;
      } else {
        // the Old Wood: the old forest hills, rounder and taller further in
        let hh = Math.max(0, fbm2(x * 0.07, z * 0.07, 3) - 0.42) * 7;
        hh += Math.max(0, fbm2(x * 0.045, z * 0.045, 801) - 0.48) * 7 * smoothstep(H0, H0 + 14, z);
        h = Math.min(hh, 4.5);
        b = BIOME.OLDWOOD;
      }
      // rivers flatten their banks (not on the block terrain)
      if (!g.cube[i] && nr) h *= clamp((nr.k - 1.5) / 5, 0, 1);
      if (!g.cube[i]) h = q05(h);
      g.height[i] = h; g.kind[i] = k; g.biome[i] = b;
      // water
      if (nr && nr.k < 0 && !(r === 'massif' && nr.R.id !== 'main') && r !== 'cliff' && r !== 'high') {
        g.kind[i] = KIND.WATER; g.biome[i] = BIOME.RIVER; g.cube[i] = 0;
      } else if (nr && nr.k < 1.1 && g.kind[i] === KIND.FOREST && !g.cube[i] && hash2(x, z, 52) < 0.55) g.kind[i] = KIND.SAND;
      if (r === 'deep' && deepPond(cx, cz)) { g.kind[i] = KIND.WATER; g.biome[i] = BIOME.DEEP; }
    }
  // springs: a little pool where a creek rises
  for (const R of RIVERS) {
    if (!R.spring) continue;
    const [sx, sz] = R.pts[0];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.floor(sx) + dx, z = Math.floor(sz) + dz;
      if (!g.inb(x, z) || z < H0 || dx * dx + dz * dz > 3) continue;
      const i = z * W + x;
      if (g.kind[i] === KIND.FOREST || g.kind[i] === KIND.SAND) { g.kind[i] = KIND.WATER; g.biome[i] = BIOME.RIVER; g.height[i] = 0; }
    }
  }

  // ---- the Deep: the waterfall notch, the grotto, the walkway, the shore
  {
    const e = 192;
    for (let x = 29; x <= 39; x++)
      for (let z = e - 4; z <= e + 4; z++) {
        const i = z * W + x;
        if (z < e) { g.height[i] = Math.max(9, g.height[i]); if (x >= 31 && x <= 37) g.height[i] = 9; continue; }
        if (z === e) { g.height[i] = 9; g.kind[i] = KIND.ROCK; g.cube[i] = 1; continue; } // the lip
        const inNotch = x >= 31 && x <= 37;
        if (z <= e + 2) {
          if (inNotch) { g.height[i] = 0.5; g.kind[i] = KIND.DIRT; g.cube[i] = 1; } // the grotto floor
          else { g.height[i] = 8; g.kind[i] = KIND.ROCK; g.cube[i] = 1; } // its side walls
        } else if (z === e + 3) {
          g.height[i] = 0.5; g.kind[i] = inNotch ? KIND.DIRT : KIND.ROCK; g.cube[i] = 1; if (!inNotch) g.height[i] = x === 30 || x === 38 ? 3 : 1.5;
        } else if (z === e + 4 && g.kind[i] !== KIND.WATER) { g.height[i] = 0.02; g.kind[i] = KIND.SAND; g.biome[i] = BIOME.DEEP; g.cube[i] = 0; }
      }
    for (let z = DEEP_HOUSE.z0; z <= DEEP_HOUSE.z1; z++) for (let x = DEEP_HOUSE.x0; x <= DEEP_HOUSE.x1; x++) g.occ[z * W + x] = -2; // the house
  }

  // ---- Mistfall Run: a channel down the Highland to the lip, never uphill
  for (const S of STREAMS) if (S.descend) S.pts = descentPath(g, S.pts[0], S.pts[S.pts.length - 1]);
  STREAMS.forEach((S, si) => {
    const P = S.pts;
    let last = 99;
    for (let s = 0; s < P.length - 1; s++) {
      const [ax, az] = P[s], [bx, bz] = P[s + 1];
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L * 3);
      for (let k = 0; k <= n; k++) {
        const px = ax + (bx - ax) * (k / n), pz = az + (bz - az) * (k / n);
        for (const [ox, oz] of [[0, 0], [S.w * 0.6, 0], [-S.w * 0.6, 0], [0, S.w * 0.6], [0, -S.w * 0.6]]) {
          const x = Math.floor(px + ox), z = Math.floor(pz + oz);
          if (!g.inb(x, z)) continue;
          const i = z * W + x;
          if (g.kind[i] === KIND.WATER || g.meadow[i]) continue;
          if (z >= H0) {
            const hh = Math.min(g.height[i], last);
            g.height[i] = hh;
            if (g.kind[i] === KIND.FOREST) g.kind[i] = KIND.SAND;
          }
          g.stream[i] = si + 1;
          if (g.deco[i] >= 0 && decos[g.deco[i]]) { decos[g.deco[i]].removed = true; g.deco[i] = -1; } // (old mountain: a tree on the stream)
        }
        const ci = Math.floor(pz) * W + Math.floor(px);
        if (g.inb(Math.floor(px), Math.floor(pz)) && Math.floor(pz) >= H0) last = Math.min(last, g.height[ci]);
      }
    }
  });

  // ---- barriers
  BARRIERS.forEach((B, bi) => {
    const mark = (x, z) => { if (g.inb(x, z)) g.barrier[z * W + x] = bi + 1; };
    B.tiles = [];
    if (B.kind === 'bridge') {
      for (let z = B.near[1] + 1; z < B.far[1]; z++) for (let x = B.x0; x <= B.x1; x++) { mark(x, z); B.tiles.push([x, z]); }
      // both bridgeheads are dry, flat ground
      for (const [bx, bz] of [B.near, B.far]) for (let x = B.x0 - 1; x <= B.x1 + 1; x++) {
        const i = bz * W + x;
        if (g.kind[i] === KIND.WATER) { g.kind[i] = KIND.SAND; }
        g.height[i] = Math.max(0.02, Math.min(g.height[i], 0.5));
        if (g.cube[i]) g.height[i] = 0.5;
        if (g.deco[i] >= 0) g.deco[i] = -1;
      }
    } else if (B.kind === 'thorns') {
      for (let z = B.z0; z <= B.z1; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x;
        if (reg[i] !== 'high' || g.kind[i] !== KIND.FOREST) continue;
        mark(x, z); B.tiles.push([x, z]);
      }
    } else if (B.kind === 'log') {
      for (let x = B.x0; x <= B.x1; x++) {
        const i = B.z * W + x;
        g.kind[i] = KIND.FOREST; g.height[i] = 9; g.cube[i] = 1;
        mark(x, B.z); B.tiles.push([x, B.z]);
      }
      // a clearing round it so the log reads
      for (let z = B.z - 2; z <= B.z; z++) for (let x = B.x0 - 1; x <= B.x1 + 1; x++) { const i = z * W + x; if (g.kind[i] === KIND.FOREST) { g.glade[i] = GLADE.GLADE; g.height[i] = 9; } }
    } else if (B.kind === 'cliff') {
      const path = cliffPath();
      let hh = 9;
      for (let k = 0; k < path.length; k++) {
        const [x, z] = path[k];
        const i = z * W + x;
        hh = Math.max(0.5, 9 - k * 0.45);
        g.height[i] = q05(hh); g.kind[i] = KIND.FOREST; g.cube[i] = 1; g.glade[i] = GLADE.GLADE; g.biome[i] = BIOME.HIGHLAND;
        mark(x, z); B.tiles.push([x, z]);
      }
      B.near = path[0]; B.far = path[path.length - 1];
      // the landing at the foot of the steps (outside the hollow's fog: clear into it to arrive)
      for (let z = 195; z <= 198; z++) for (let x = 52; x <= 60; x++) {
        const i = z * W + x;
        if (!g.inb(x, z) || g.kind[i] === KIND.WATER || g.barrier[i]) continue;
        g.biome[i] = BIOME.HIGHLAND; g.cube[i] = 0; g.height[i] = 0.5; g.kind[i] = KIND.FOREST; g.glade[i] = GLADE.OPEN;
      }
    }
  });

  // ---- glades for the new rows: old-growth stands with open floor, clearings, deer paths
  for (let z = H0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (g.kind[i] !== KIND.FOREST || g.barrier[i]) continue;
      const b = g.biome[i];
      const big = fbm2(x * 0.08, z * 0.08, 1131) + (hash2(x, z, 1133) - 0.5) * 0.06;
      const mid = fbm2(x * 0.19, z * 0.19, 1137);
      const path = Math.abs(fbm2(x * 0.06, z * 0.06, 1141) - 0.5) < 0.013;
      let v = GLADE.GROVE;
      if (b === BIOME.OLDWOOD || b === BIOME.DEEP) v = big > 0.62 || path ? GLADE.GLADE : mid > 0.46 || big > 0.52 ? GLADE.OPEN : GLADE.GROVE;
      else if (b === BIOME.HIGHLAND) v = big > 0.66 ? GLADE.GLADE : mid > 0.55 ? GLADE.OPEN : GLADE.GROVE;
      else if (b === BIOME.MASSIF) v = GLADE.OPEN;
      // the pond's meadow: open shores, and nothing tall between the camera and the falls
      if (b === BIOME.DEEP) {
        const pdx = (x + 0.5 - DEEP_POND.cx) / (DEEP_POND.rx + 3), pdz = (z + 0.5 - DEEP_POND.cz) / (DEEP_POND.rz + 3);
        if (pdx * pdx + pdz * pdz < 1 || (Math.abs(x + 0.5 - DEEP_POND.cx) < DEEP_POND.rx + 2 && z + 0.5 > DEEP_POND.cz && z + 0.5 < DEEP_POND.cz + DEEP_POND.rz + 9)) v = hash2(x, z, 1151) < 0.8 ? GLADE.GLADE : GLADE.OPEN;
      }
      if (!g.glade[i]) g.glade[i] = v;
    }

  // ---- the neighbours' deer paths (glade tiles: still forest, just open)
  for (const [[ax, az], [bx, bz]] of NEAR_PATHS) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L * 2);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const wob = Math.sin(t * Math.PI * 2.2 + ax) * 1.6 * Math.sin(t * Math.PI);
      const px = ax + (bx - ax) * t + (bz - az) / (L || 1) * wob, pz = az + (bz - az) * t - (bx - ax) / (L || 1) * wob;
      const x = Math.floor(px), z = Math.floor(pz);
      if (!g.inb(x, z)) continue;
      const i = z * W + x;
      if (g.kind[i] === KIND.FOREST && !g.meadow[i]) g.glade[i] = GLADE.GLADE;
    }
  }

  // ---- decorations for the new rows (appended: the old indices never move)
  const addDeco = (type, x, z, extra = {}) => {
    const i = z * W + x;
    if (g.deco[i] >= 0) return null;
    const d = { type, x, z, rot: Math.floor(hash2(x, z, 2001) * 4), scale: 0.85 + hash2(x, z, 2002) * 0.3, variant: Math.floor(hash2(x, z, 2003) * 3), ...extra };
    g.deco[i] = decos.length;
    decos.push(d);
    return d;
  };
  for (let z = H0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (g.occ[i] === -2 || g.barrier[i] || g.stream[i]) continue;
      const k = g.kind[i], r = hash2(x, z, 2099), b = g.biome[i];
      if (k === KIND.FOREST && b === BIOME.MASSIF) { if (r < 0.3) addDeco(hash2(x, z, 5) < 0.6 ? 'spruce' : 'pine', x, z, { far: true }); continue; }
      if (k === KIND.FOREST) {
        // old-growth giants (one tree a tile, huge) and mossy boulders
        const gl = g.glade[i];
        if (gl === GLADE.GLADE) { if (r < 0.012) addDeco('boulder', x, z, { far: true }); continue; }
        if (r < 0.03) addDeco('boulder', x, z, { far: true });
        else if ((b === BIOME.OLDWOOD || b === BIOME.DEEP) && r < (gl === GLADE.OPEN ? 0.085 : 0.06) && hash2(x >> 1, z >> 1, 2107) < 0.7) addDeco('giant', x, z, { scale: 1, variant: Math.floor(hash2(x, z, 2111) * 4) });
        continue;
      }
      if ((k === KIND.ROCK || k === KIND.SNOW) && r < 0.06) addDeco('boulder', x, z, { far: true });
    }

  // ---- ruins and forest finds in the new rows
  const newRuins = [];
  {
    const ok = (x, z) => {
      if (x < 3 || x > W - 4 || z < H0 + 2 || z > H - 4) return false;
      const y = g.height[z * W + x];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const i = (z + dz) * W + x + dx;
        if (g.kind[i] !== KIND.FOREST || g.deco[i] >= 0 || g.occ[i] === -2 || g.height[i] !== y || g.barrier[i] || g.cube[i]) return false;
        if (g.biome[i] !== BIOME.OLDWOOD) return false;
      }
      return true;
    };
    const cands = [];
    for (let z = H0 + 2; z < H - 3; z++) for (let x = 3; x < W - 3; x++) { const r = hash2(x, z, 2773); if (r < 0.02 && ok(x, z)) cands.push([r, x, z]); }
    cands.sort((a, b) => a[0] - b[0]);
    const TYPES = ['ruin_clock', 'ruin_cart', 'ruin_table', 'ruin_lamp', 'ruin_chair'];
    let k = 0;
    for (const [, x, z] of cands) {
      if (newRuins.length >= 7) break;
      if (newRuins.some((o) => Math.hypot(o.x - x, o.z - z) < 15)) continue;
      newRuins.push({ x, z, type: TYPES[k++ % TYPES.length] });
      for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) { const i = (z + dz) * W + x + dx; if (g.kind[i] === KIND.FOREST) g.glade[i] = GLADE.GLADE; }
    }
    g.ruins = [...g.ruins, ...newRuins];
  }
  {
    const skip = new Set();
    for (const r of newRuins) for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) skip.add((r.z + dz) * W + r.x + dx);
    const out = [];
    for (let z = H0; z < H - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        const i = z * W + x;
        if (g.kind[i] !== KIND.FOREST || g.deco[i] >= 0 || g.occ[i] === -2 || skip.has(i) || g.barrier[i] || g.biome[i] === BIOME.MASSIF) continue;
        const gv = g.glade[i];
        const dens = gv === GLADE.GLADE ? 0.06 : gv === GLADE.OPEN ? 0.05 : 0.03;
        if (hash2(x, z, 5101) >= dens) continue;
        if (out.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.z - z) <= 1)) continue;
        out.push({ i, x, z, kind: forageKindFor(gv, g.biome[i] === BIOME.DEEP ? BIOME.MUSHROOM : BIOME.FOREST, hash2(x, z, 5103)), h: hash2(x, z, 5105) });
      }
    g.forage = [...g.forage, ...out];
  }

  // ---- ground clutter for the new rows: ferns everywhere, moss, mushrooms, flowers in the glades
  const forageTile = new Set(g.forage.map((f) => f.i));
  for (let z = H0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      const k = g.kind[i];
      if ((k !== KIND.FOREST && k !== KIND.GRASS && k !== KIND.DIRT) || forageTile.has(i) || g.barrier[i]) continue;
      const gl = g.glade[i], b = g.biome[i];
      const patch = fbm2(x * 0.2, z * 0.2, 2141);
      const n = gl === GLADE.GLADE ? 2 : gl === GLADE.OPEN ? 2 : 1;
      for (let c = 0; c < n; c++) {
        const r = hash2(x * 5 + c, z, 2143);
        if (r > (b === BIOME.MASSIF ? 0.2 : gl === GLADE.GLADE ? 0.7 : 0.6)) continue;
        const t = hash2(x, z * 5 + c, 2147);
        let type;
        if (b === BIOME.DEEP) type = t < 0.45 ? 'fern' : t < 0.6 ? 'glowcap' : t < 0.72 ? 'mushroom' : t < 0.82 && gl === GLADE.GLADE ? (patch > 0.55 ? 'lupine' : 'daisy') : 'tuft';
        else if (b === BIOME.MASSIF) type = t < 0.5 ? 'tuft' : 'fern';
        else if (gl === GLADE.GLADE) type = t < 0.2 ? 'fern' : t < 0.55 ? (patch > 0.6 ? 'fireweed' : patch < 0.32 ? 'lupine' : 'daisy') : 'tuft';
        else type = t < 0.62 ? 'fern' : t < 0.7 && g.deco[i] < 0 ? 'mushroom' : 'tuft';
        clutter.push({ type, x: x + 0.15 + hash2(x, z, 2150 + c) * 0.7, z: z + 0.15 + hash2(x, z, 2160 + c) * 0.7, y: g.height[i], rot: hash2(x, z, 2170 + c) * Math.PI * 2 });
      }
    }

  // ---- low wild ground sits a hair up on the slope (see the old generator)
  for (let z = H0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x, k = g.kind[i];
      if (g.meadow[i] || g.cube[i] || k === KIND.WATER || k === KIND.TRAIL || g.occ[i] === -2) continue;
      if (g.height[i] >= 0.01 || g.hasWaterNeighbor(x, z, true)) continue;
      g.height[i] = 0.02;
    }

  refreshWaterHeights(g);
  // the falls dig a deep plunge pool
  for (let z = 196; z <= 200; z++) for (let x = 32; x <= 36; x++) { const i = z * W + x; if (g.kind[i] === KIND.WATER) g.height[i] = -1.25; }
  // the Broadwater runs deep in the middle
  for (let z = H0; z < H; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if (g.kind[i] === KIND.WATER && g.biome[i] === BIOME.RIVER && !g.hasLandNeighbor(x, z)) g.height[i] = Math.min(g.height[i], -1.1); }

  buildFlow(g);
  gen.grid = g;
  gen.deepZone = DEEP_ZONE;
  return gen;
}

export { WATERFALL, DEEP_HOUSE, MEADOW, WATER_Y };
