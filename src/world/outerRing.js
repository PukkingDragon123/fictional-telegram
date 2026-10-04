// [v20 map] The valley around the playable map: a ring of thick, empty forest
// (no zones, no NPCs; pixel tree sprites like the forest inside the map, rocky
// clearings, a few deer and birds), rising into layered low-poly mountain
// ranges with snow caps and a waterfall. Everything lives OUTSIDE the grid
// (x < 0, x > w, z < 0, z > h), so tiles, saves and gameplay don't change.
//
// - one merged, flat-shaded heightfield mesh (tensor lattice: 1-tile cells by
//   the map, 2 further out, 4 for the far ranges; no T-junction cracks)
// - one SpriteBatch for ~20k trees / rocks (one draw call), one tiny batch for
//   deer + birds (rewritten each frame, a handful of sprites)
// - atmospheric haze towards the sky's horizon colour with distance from the
//   map (follows day / night / aurora / blood moon), and ranges on the
//   camera's side of the map sink down so they never block the view
import * as THREE from 'three';
import { fbm2, hash2, clamp } from '../core/rng.js';
import { KIND, WATER_Y } from './grid.js';
import { SpriteBatch, pixelTexture } from '../core/spriteBatch.js';
import { terrainAtlasUniforms } from './terrain.js';

const E = 100; // how far the valley reaches past the map edge (tiles)
const TREE_D = 24; // the thick sprite forest band
const SLOPE_D = 60; // sparse trees on the lower slopes out to here
const SMOOTH_D = 7; // tiles past the map edge that stay smooth slopes (like the map's own forest hills)
const CHUNK = 36; // culling chunk size (tiles)
const chunkKey = (x, z) => Math.floor((x + 400) / CHUNK) * 1000 + Math.floor((z + 400) / CHUNK);
const FLAT_D0 = 3, FLAT_D1 = 20; // camera-side ranges (and their trees) sink from here out

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// GLSL shared by the ground mesh and the sprite batch
// [v20 water] exported: the valley rivers (world/water.js) sink and haze the same way
export const HAZE_PARS = /* glsl */ `
uniform vec3 uHaze;
uniform vec4 uRect;
uniform vec2 uRingCam;
uniform float uHazeK;
float ringDist(vec2 p) { vec2 d = max(max(uRect.xy - p, p - uRect.zw), 0.0); return length(d); }
float ringHaze(vec3 p) {
  float d = ringDist(p.xz);
  // thin mist right at the edge, thicker over the far ranges; peaks poke out a bit
  float h = smoothstep(2.0, 14.0, d) * 0.05 + smoothstep(22.0, 110.0, d) * 0.5;
  h *= 1.0 - smoothstep(18.0, 60.0, p.y) * 0.25;
  return clamp(h * uHazeK, 0.0, 0.85);
}
// 0..1: how far a point of the outer ranges sinks (it sits between the camera and the map)
float flatK(vec3 p) {
  vec2 c = clamp(p.xz, uRect.xy, uRect.zw);
  float d = length(p.xz - c);
  vec2 outDir = d > 0.01 ? (p.xz - c) / d : vec2(0.0);
  return smoothstep(0.15, 0.75, dot(outDir, uRingCam)) * smoothstep(${FLAT_D0.toFixed(1)}, ${FLAT_D1.toFixed(1)}, d);
}
`;

export class OuterRing {
  constructor(world) {
    this.world = world;
    this.grid = world.grid;
    this.scene = world.scene;
    const g = this.grid;
    this.W = g.w; this.H = g.h;
    this.uniforms = {
      uHaze: { value: new THREE.Color(0xc8d8e8) },
      uRect: { value: new THREE.Vector4(0, 0, g.w, g.h) },
      uRingCam: { value: new THREE.Vector2(0, 1) },
      uHazeK: { value: 1 },
      uTime: { value: 0 },
    };
    this.group = new THREE.Group();
    this.group.name = 'outerRing';
    this.scene.add(this.group);
    this.buildSeam();
    this.buildRivers();
    this.buildLattice();
    this.buildGround();
    this.buildWaterfall();
    this.buildTrees();
    this.buildCritters();
  }

  // ------------------------------------------------------------------ shape
  // heights along the map border, so the valley meets the map without a gap
  buildSeam() {
    const g = this.grid, { w, h } = g;
    const CW = w + 1;
    const tileTop = (x, z) => {
      const i = z * w + x;
      if (g.kind[i] === KIND.WATER) return WATER_Y - 0.05;
      return Math.max(0, g.height[i]);
    };
    const corner = (cx, cz) => {
      if (g.slopeH && cx >= 0 && cz >= 0 && cx <= w && cz <= h) {
        // match the map terrain's own vertex there: the smoothed slope height if a
        // slope tile touches this corner, else the (lowest) flat tile top
        let any = false, mn = 99, slope = false;
        for (const [tx, tz] of [[cx - 1, cz - 1], [cx, cz - 1], [cx - 1, cz], [cx, cz]]) {
          if (!g.inb(tx, tz)) continue;
          if (g.isSlope?.(tx, tz) && g.height[tz * w + tx] > 0.01) slope = true;
          else mn = Math.min(mn, tileTop(tx, tz));
          any = true;
        }
        if (slope) return g.slopeH[cz * CW + cx];
        if (any) return mn;
      }
      return 0;
    };
    this.seamN = new Float32Array(w + 1); this.seamS = new Float32Array(w + 1);
    this.seamW = new Float32Array(h + 1); this.seamE = new Float32Array(h + 1);
    for (let x = 0; x <= w; x++) { this.seamN[x] = corner(x, 0); this.seamS[x] = corner(x, h); }
    for (let z = 0; z <= h; z++) { this.seamW[z] = corner(0, z); this.seamE[z] = corner(w, z); }
  }

  // the grid's edge height nearest to (x, z)
  edgeH(x, z) {
    const { W, H } = this;
    const px = clamp(x, 0, W), pz = clamp(z, 0, H);
    const at = (arr, t) => { const i = Math.floor(t), f = t - i; const a = arr[clamp(i, 0, arr.length - 1)], b = arr[clamp(i + 1, 0, arr.length - 1)]; return a + (b - a) * f; };
    // signed distance past each side (on the border itself: the side we sit on)
    const sides = [[-z, 0], [z - H, 1], [-x, 2], [x - W, 3]];
    let best = sides[0];
    for (const sd of sides) if (sd[0] > best[0]) best = sd;
    switch (best[1]) {
      case 0: return at(this.seamN, px);
      case 1: return at(this.seamS, px);
      case 2: return at(this.seamW, pz);
      default: return at(this.seamE, pz);
    }
  }

  dist(x, z) {
    const dx = Math.max(-x, x - this.W, 0), dz = Math.max(-z, z - this.H, 0);
    return Math.hypot(dx, dz);
  }

  // rivers leaving the map keep going out into the valley
  buildRivers() {
    const g = this.grid, { w, h } = g;
    this.rivers = [];
    const scan = (n, at, out) => {
      let run = null;
      for (let i = 0; i <= n; i++) {
        const wet = i < n && at(i);
        if (wet && !run) run = [i, i];
        else if (wet) run[1] = i;
        else if (run) { out(run[0], run[1] + 1); run = null; }
      }
    };
    const add = (sx, sz, nx, nz, width) => {
      const pts = [[sx, sz]];
      const tx = -nz, tz = nx; // tangent for the meander
      for (let k = 1; k <= 9; k++) {
        const s = k * 13;
        const m = Math.sin(k * 1.3 + sx * 0.1) * Math.min(1, k * 0.5) * 6;
        pts.push([sx + nx * s + tx * m, sz + nz * s + tz * m]);
      }
      this.rivers.push({ pts, width: Math.max(1.4, width * 0.5 + 0.4) });
    };
    const isW = (x, z) => g.kind[z * w + x] === KIND.WATER;
    scan(w, (x) => isW(x, h - 1), (a, b) => add((a + b) / 2, h, 0, 1, b - a));
    scan(w, (x) => isW(x, 0), (a, b) => add((a + b) / 2, 0, 0, -1, b - a));
    scan(h, (z) => isW(0, z), (a, b) => add(0, (a + b) / 2, -1, 0, b - a));
    scan(h, (z) => isW(w - 1, z), (a, b) => add(w, (a + b) / 2, 1, 0, b - a));
  }

  riverDist(x, z) {
    let best = 1e9, wid = 1;
    for (const r of this.rivers) {
      const P = r.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1];
        const vx = bx - ax, vz = bz - az;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
        const dd = Math.hypot(x - (ax + vx * t), z - (az + vz * t)) / r.width;
        if (dd < best) { best = dd; wid = r.width; }
      }
    }
    return { d: best, wid };
  }

  // valley height at (x, z); also reports what grows there
  sample(x, z) {
    const W = this.W, H = this.H;
    const d = this.dist(x, z);
    const e = this.edgeH(x, z);
    // which way is "out": north gets the big range (behind the office
    // mountain), the other sides lower, rounder ranges
    const north = z < 0 ? smooth(-0.2, 0.6, -z / (d + 1e-3)) : 0;
    const south = z > H ? smooth(-0.2, 0.6, (z - H) / (d + 1e-3)) : 0;
    const hill = Math.max(0, fbm2(x * 0.07, z * 0.07, 3) - 0.42) * 7;
    // north: the office mountain's back slope keeps climbing into the big range
    let base = e + (Math.min(3.5, hill) - e) * smooth(0, 9, d) * (1 - north * 0.8);
    // ridged noise for the ranges
    const n1 = fbm2(x * 0.028 + 40, z * 0.028 + 40, 601, 5);
    const ridge = 1 - Math.abs(n1 * 2 - 1);
    const n2 = fbm2(x * 0.07, z * 0.07, 613, 3);
    // the camera only sees ~30-60 tiles past the map, so the ranges rise inside that:
    // behind the office mountain a taller, snowier wall of peaks right away
    const amp = 30 + 24 * north - 6 * south;
    const start = 9 - 9 * north;
    let mount = smooth(start, start + 36 - 10 * north, d) * amp * (0.35 + 0.8 * ridge * ridge + 0.25 * n2);
    // a second, farther wall of peaks so the horizon is never flat
    mount += smooth(55, 90, d) * (16 + 14 * north) * fbm2(x * 0.05, z * 0.05, 631, 3);
    // rivers cut a valley out to the horizon
    const rv = this.rivers.length ? this.riverDist(x, z) : { d: 99 };
    const valley = smooth(1.5, 9, rv.d);
    mount *= 0.15 + 0.85 * valley;
    base *= valley;
    let y = base + mount;
    let water = false;
    if (rv.d < 1) { y = WATER_Y - 0.05; water = true; }
    else if (rv.d < 1.6) y = Math.min(y, 0.15);
    // far ranges: terraced, like the stepped mountain inside the map
    return { y, d, water };
  }

  // ---------------------------------------------------------------- lattice
  buildLattice() {
    const axis = (n) => {
      const out = [];
      // -E .. -30 step 4, -30 .. -8 step 2, -8 .. 0 step 1, map step 1, mirrored
      for (let v = -E; v < -30; v += 4) out.push(v);
      for (let v = -30; v < -8; v += 2) out.push(v);
      for (let v = -8; v <= n + 8; v++) out.push(v);
      for (let v = n + 10; v <= n + 30; v += 2) out.push(v);
      for (let v = n + 34; v <= n + E; v += 4) out.push(v);
      return out;
    };
    this.xs = axis(this.W);
    this.zs = axis(this.H);
    const nx = this.xs.length, nz = this.zs.length;
    this.hy = new Float32Array(nx * nz);
    this.wet = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = this.xs[i], z = this.zs[j];
        const inside = x > 0 && x < this.W && z > 0 && z < this.H;
        if (inside) { this.hy[j * nx + i] = 0; continue; }
        const s = this.sample(x, z);
        this.hy[j * nx + i] = s.y;
        this.wet[j * nx + i] = s.water ? 1 : 0;
      }
  }

  // [v20 map] blocky (Minecraft-style) columns: one per lattice cell, its top
  // quantized to whole blocks (0.5 by the map, 1 further out, 1.5 for the far ranges)
  buildCells() {
    const { xs, zs, hy, wet, W, H } = this;
    const nx = xs.length, cx = nx - 1, cz = zs.length - 1;
    this.cTop = new Float32Array(cx * cz);
    this.cWet = new Uint8Array(cx * cz);
    this.cSmooth = new Uint8Array(cx * cz); // right by the map: smooth slope (meets the map's own slopes), no steps
    for (let j = 0; j < cz; j++)
      for (let i = 0; i < cx; i++) {
        const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
        const k = j * cx + i;
        if (x0 >= 0 && x1 <= W && z0 >= 0 && z1 <= H) { this.cTop[k] = NaN; continue; } // the map itself
        const k00 = j * nx + i, k10 = k00 + 1, k01 = k00 + nx, k11 = k01 + 1;
        const nw = wet[k00] + wet[k10] + wet[k01] + wet[k11];
        if (nw >= 3) { this.cTop[k] = WATER_Y - 0.05; this.cWet[k] = 1; continue; }
        const y = (hy[k00] + hy[k10] + hy[k01] + hy[k11]) / 4;
        const d = this.dist((x0 + x1) / 2, (z0 + z1) / 2);
        // ragged boundary between the smooth rim and the blocks: never one straight line
        const sd = SMOOTH_D + (fbm2((x0 + x1) * 0.13, (z0 + z1) * 0.13, 907) - 0.5) * 9;
        if (d < sd) { this.cTop[k] = y; this.cSmooth[k] = 1; continue; }
        const st = d < 12 ? 0.5 : d > 50 ? 1.5 : 1;
        // blocks round down near the rim, so their steps face away from the map
        this.cTop[k] = Math.max(0, (d < 16 ? Math.floor(y / st) : Math.round(y / st)) * st);
      }
  }

  // ground height (top of the block column) at (x, z)
  heightAt(x, z) {
    const find = (arr, v) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; } return lo; };
    const xs = this.xs, zs = this.zs, nx = xs.length;
    const i = find(xs, x), j = find(zs, z);
    const k = j * (nx - 1) + i;
    const t = this.cTop[k];
    if (Number.isNaN(t)) return 0;
    if (!this.cSmooth[k]) return t;
    const fx = clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1), fz = clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1);
    const H = this.hy;
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], dd = H[(j + 1) * nx + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + dd * fx) * fz;
  }

  // ----------------------------------------------------------------- ground
  buildGround() {
    this.buildCells();
    const { xs, zs, cTop, cWet } = this;
    const cx = xs.length - 1, cz = zs.length - 1;
    // chunked (CHUNK x CHUNK tiles) so whatever is off screen gets culled
    const chunks = new Map();
    const partOf = (x, z) => { const k = chunkKey(x, z); let c = chunks.get(k); if (!c) chunks.set(k, (c = { pos: [], nor: [], col: [], sid: [], idx: [], n: 0 })); return c; };
    // surface ids of the in-map terrain atlas (terrain.js SURF): the valley
    // uses the very same pixel textures as the map's own mountain and cliffs
    const S = { GRASS: 0, AUTUMN: 1, DIRT: 2, POND: 4, ROCK: 5, SNOW: 6, FOREST: 8, CLIFF: 9 };
    // what a column is made of: top surface, tint and band (0 soil, 1 stone, 2 snow, 3 water)
    const topOf = (x, z, y, d, wetC) => {
      const r = hash2(Math.floor(x * 2), Math.floor(z * 2), 711);
      if (wetC) return [S.POND, [0.55, 0.8, 0.95], 3];
      const n = fbm2(x * 0.09, z * 0.09, 717);
      const snowLine = 24 + (n - 0.5) * 8 - (z < 0 ? 6 : 0);
      const stoneLine = 15 + (n - 0.5) * 7;
      const v = 0.94 + r * 0.1;
      if (y > snowLine) return [S.SNOW, [v, v, v], 2];
      if (y > stoneLine) return [S.ROCK, [v, v, v], 1];
      if (this.clearing(x, z)) return [S.GRASS, [v * 0.9, v * 0.92, v * 0.88], 0];
      const au = fbm2(x * 0.05, z * 0.05, 91);
      if (au > 0.62 && r < 0.5) return [S.AUTUMN, [v, v, v], 0];
      if (y > stoneLine - 3 && n > 0.5) return [S.GRASS, [v, v, v], 0];
      return [S.FOREST, [v * 0.9, v * 0.95, v * 0.9], 0];
    };
    const quad = (P, a, b, c, d, nrm, rgb, id) => {
      const v = P.n;
      for (const q of [a, b, c, d]) { P.pos.push(q[0], q[1], q[2]); P.nor.push(nrm[0], nrm[1], nrm[2]); P.col.push(rgb[0], rgb[1], rgb[2]); P.sid.push(id); }
      P.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      P.n += 4;
    };
    const k3 = (k) => [k, k, k];
    // neighbour column top (inside the map: the map's edge height there)
    const nbTop = (i, j, mx, mz) => {
      if (i < 0 || j < 0 || i >= cx || j >= cz) return -4;
      const t = cTop[j * cx + i];
      return Number.isNaN(t) ? this.edgeH(mx, mz) : t;
    };
    const { W, H } = this;
    const onEdge = (vx, vz) => ((vx === 0 || vx === W) && vz >= 0 && vz <= H) || ((vz === 0 || vz === H) && vx >= 0 && vx <= W);
    for (let j = 0; j < cz; j++)
      for (let i = 0; i < cx; i++) {
        const y = cTop[j * cx + i];
        if (Number.isNaN(y)) continue;
        const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        const d = this.dist(mx, mz);
        const [topId, tint, band] = topOf(mx, mz, y, d, cWet[j * cx + i]);
        const P = partOf(mx, mz);
        // corners on the map's edge take the map's own edge height: the top meets the
        // map terrain exactly (no seam line when the camera is rotated)
        const smoothC = this.cSmooth[j * cx + i];
        const nxL = xs.length, HY = this.hy;
        const vy = (vx, vz) => {
          if (onEdge(vx, vz)) return this.edgeH(vx, vz);
          if (!smoothC) return y;
          const ii = vx === x0 ? i : i + 1, jj = vz === z0 ? j : j + 1;
          return HY[jj * nxL + ii];
        };
        const y00 = vy(x0, z0), y01 = vy(x0, z1), y11 = vy(x1, z1), y10 = vy(x1, z0);
        let tn = [0, 1, 0];
        if (smoothC || y00 !== y || y11 !== y) {
          const dx = ((y10 + y11) - (y00 + y01)) / (2 * (x1 - x0)), dz = ((y01 + y11) - (y00 + y10)) / (2 * (z1 - z0));
          const l = Math.hypot(dx, 1, dz); tn = [-dx / l, 1 / l, -dz / l];
        }
        quad(P, [x0, y00, z0], [x0, y01, z1], [x1, y11, z1], [x1, y10, z0], tn, tint, topId);
        // cliff faces down to each lower neighbour, in 1-block layers (strata)
        const sides = [
          [i + 1, j, x1, mz, [1, 0, 0], (lo, hi) => [[x1, lo, z1], [x1, lo, z0], [x1, hi, z0], [x1, hi, z1]], 0.86],
          [i - 1, j, x0, mz, [-1, 0, 0], (lo, hi) => [[x0, lo, z0], [x0, lo, z1], [x0, hi, z1], [x0, hi, z0]], 0.86],
          [i, j + 1, mx, z1, [0, 0, 1], (lo, hi) => [[x0, lo, z1], [x1, lo, z1], [x1, hi, z1], [x0, hi, z1]], 0.74],
          [i, j - 1, mx, z0, [0, 0, -1], (lo, hi) => [[x1, lo, z0], [x0, lo, z0], [x0, hi, z0], [x1, hi, z0]], 0.74],
        ];
        // the map side gets a wall all the way down: no cracks where the two meshes meet
        const touchesMap = (ni, nj) => ni >= 0 && nj >= 0 && ni < cx && nj < cz && Number.isNaN(cTop[nj * cx + ni]);
        for (const [ni, nj, ex, ez, nrm, face, shadeK] of sides) {
          // towards the map: a skirt wall down under the map's edge, so no crack of sky
          // shows between the two meshes from any camera angle
          if (touchesMap(ni, nj)) {
            // one skirt face whose top follows the shared edge corners exactly
            const f = face(-4, 0);
            f[2][1] = vy(f[2][0], f[2][2]); f[3][1] = vy(f[3][0], f[3][2]);
            quad(P, ...f, nrm, k3(shadeK * 0.8), S.DIRT);
            continue;
          }
          let ny = nbTop(ni, nj, ex, ez);
          const nSmooth = ni >= 0 && nj >= 0 && ni < cx && nj < cz && this.cSmooth[nj * cx + ni];
          if (smoothC && nSmooth) continue; // smooth slopes share their vertices: no wall
          const fq = face(0, 0);
          const ea = vy(fq[2][0], fq[2][2]), eb = vy(fq[3][0], fq[3][2]);
          if (nSmooth) ny = Math.min(ny, ea, eb); // down to the smooth neighbour's shared edge
          const yHi = smoothC ? Math.max(ea, eb) : y;
          if (ny >= yHi - 0.01) continue;
          const lo0 = Math.max(ny, -4);
          // soil / snow layers on top, then stone strata (alternating tints) down to the neighbour
          const soil = band === 0 ? 2 : band === 2 ? 2 : band === 3 ? 1 : 0;
          const soilId = band === 2 ? S.SNOW : S.DIRT;
          let hi = yHi, layer = 0;
          const big = x1 - x0 > 2 || yHi - lo0 > 16;
          while (hi > lo0 + 0.001) {
            const lo = layer < soil ? Math.max(lo0, Math.ceil(hi - 1.001)) : big ? lo0 : Math.max(lo0, Math.ceil(hi - 2.001));
            const id = layer < soil ? soilId : S.CLIFF;
            const strata = layer < soil ? 1 : 0.84 + hash2(Math.floor(lo), 3, 77) * 0.22;
            quad(P, ...face(lo, hi), nrm, k3(shadeK * strata), id);
            hi = lo; layer++;
          }
        }
      }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const U = this.uniforms;
    const TA = terrainAtlasUniforms();
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U, TA);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + HAZE_PARS + '\nattribute float aSurf;\nvarying float vRingHaze;\nvarying float vSurf;\nvarying vec3 vRPos;\nvarying vec3 vRNor;\nvarying float vFlat;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfloat ringFlat = flatK(position);\nvRNor = objectNormal;\nvFlat = ringFlat;')
        // ranges on the camera's side of the map sink so they never block the view
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRPos = position;\ntransformed.y = mix(transformed.y, 2.0 + (transformed.y - 2.0) * 0.35, ringFlat);\nvSurf = aSurf;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRingHaze = ringHaze((modelMatrix * vec4(transformed, 1.0)).xyz);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uHaze;
uniform sampler2D uAtlas;
uniform vec4 uRects[10];
varying float vRingHaze;
varying float vSurf;
varying vec3 vRPos;
varying vec3 vRNor;
varying float vFlat;
vec3 ringTex(int id, vec2 p) {
  vec4 r = uRects[id];
  vec2 t = fract(p / 2.0);
  t = (floor(t * 48.0) + 0.5) / 48.0;
  return texture2D(uAtlas, r.xy + t * r.zw).rgb;
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  int id = int(vSurf + 0.5);
  vec2 p;
  if (abs(vRNor.y) > 0.5) {
    p = vRPos.xz;
    // sunk ranges on the camera's side read as forested hills, not bare rock / snow
    if (vFlat > 0.45 && (id == 5 || id == 6)) id = 8;
  } else {
    p = abs(vRNor.x) > 0.5 ? vec2(vRPos.z, vRPos.y) : vec2(vRPos.x, vRPos.y);
    if (vFlat > 0.45 && id == 6) id = 2;
  }
  diffuseColor.rgb *= ringTex(id, p) * 1.12;
}`)
        .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uHaze, vRingHaze);\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => 'outerRingGround';
    this.ground = [];
    for (const { pos, nor, col, sid, idx } of chunks.values()) {
      if (!pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setIndex(idx);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(sid, 1));
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 4;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = 'outerRingGround';
      this.ground.push(mesh);
      this.group.add(mesh);
    }
  }

  clearing(x, z) {
    return fbm2(x * 0.11, z * 0.11, 501) > 0.64;
  }

  // ------------------------------------------------------------------ trees
  buildTrees() {
    const world = this.world;
    const { tex } = world.natureFrames();
    const fr = (n) => world.frame(n);
    const pickF = (names, r) => { for (let k = 0; k < names.length; k++) { const n = names[(Math.floor(r * names.length) + k) % names.length]; if (fr(n)) return fr(n); } return fr('pine_0'); };
    const items = [];
    const { W, H } = this;
    const put = (f, x, z, o) => { if (f) items.push({ f, x, y: this.heightAt(x, z) - 0.12, z, o }); };
    for (let z = -SLOPE_D; z < H + SLOPE_D; z++)
      for (let x = -SLOPE_D; x < W + SLOPE_D; x++) {
        if (x >= 0 && x < W && z >= 0 && z < H) continue;
        const cx = x + 0.5, cz = z + 0.5;
        const d = this.dist(cx, cz);
        if (d > SLOPE_D) continue;
        const y = this.heightAt(cx, cz);
        if (this.fallPts && this.fallPts.some((q) => Math.abs(q[0] - cx) < 2.2 && Math.abs(q[2] - cz) < 1.2)) continue; // keep the waterfall in view
        // tree line = where the ground turns to bare stone (same bands as buildGround)
        const nTL = fbm2(cx * 0.09, cz * 0.09, 717);
        const treeLine = 15 + (nTL - 0.5) * 7;
        const snowLine = 24 + (nTL - 0.5) * 8 - (cz < 0 ? 6 : 0);
        if (d > TREE_D + hash2(x, z, 801) * 2) {
          // the mountain sides: dense forest climbing to the tree line, thinning near it,
          // then scattered rocks and snowy spruces up on the stone
          if (this.rivers.length && this.riverDist(cx, cz).d < 1.8) continue;
          const rr = hash2(x, z, 851), r3 = hash2(x, z, 861);
          const dk = Math.max(0.5, 0.64 - d * 0.0025) * (0.9 + hash2(x, z, 853) * 0.1);
          const tint = [dk * 0.95, dk, dk * 1.06];
          const jx = x + 0.2 + hash2(x, z, 855) * 0.6, jz = z + 0.2 + hash2(x, z, 857) * 0.6;
          if (y > treeLine) {
            if (y < snowLine && rr < 0.08) put(pickF(['spruce_snow_0', 'spruce_snow_1'], r3), jx, jz, { texels: 24, scale: 0.9 + r3 * 0.3, sway: 0.2, phase: rr * 6.28, flip: rr > 0.04, tint });
            else if (rr > 0.93) put(pickF(['rock_0', 'rock_1', 'rock_2', 'boulder_0', 'boulder_1'], r3), jx, jz, { texels: 24, scale: 1 + r3 * 0.5, tint });
            continue;
          }
          if (this.clearing(cx, cz)) {
            if (rr < 0.12) put(pickF(['bush_0', 'bush_1', 'rock_0', 'mossrock', 'sapling'], r3), jx, jz, { texels: 24, scale: 0.95, sway: 0.4, phase: rr * 6, tint });
            continue;
          }
          const dens = 0.95 * (1 - smooth(treeLine - 7, treeLine + 0.5, y));
          if (rr > dens) { if (rr < dens + 0.06) put(pickF(['bush_0', 'bush_1', 'rock_1', 'mossrock'], r3), jx, jz, { texels: 24, scale: 0.9, sway: 0.4, phase: rr * 6, tint }); continue; }
          const au = fbm2(cx * 0.16, cz * 0.16, 91);
          let f;
          if (au > 0.62 && y < treeLine - 5 && r3 < 0.6) f = pickF(['maple_red', 'maple_orange', 'maple_scarlet', 'birch_0'], hash2(x, z, 7));
          else if (y > treeLine - 4) f = pickF(['spruce_snow_0', 'spruce_0', 'spruce_snow_1', 'spruce_2'], r3);
          else if (r3 < 0.55) f = pickF(['spruce_0', 'spruce_1', 'spruce_2'], hash2(x, z, 8));
          else if (r3 < 0.9) f = pickF(['pine_0', 'pine_1'], r3);
          else f = pickF(['birch_0', 'aspen_0'], r3);
          put(f, jx, jz, { texels: 24, scale: 1 + hash2(x, z, 859) * 0.45, sway: 0.25, phase: rr * 6.28, flip: r3 > 0.5, tint });
          continue;
        }
        if (y < 0.05 && this.rivers.length && this.riverDist(cx, cz).d < 1.8) continue;
        const r = hash2(x, z, 803), r2 = hash2(x, z, 805);
        // as dark as the deep forest inside the map, a touch darker further out
        const dk = Math.max(0.5, 0.66 - d * 0.004) * (0.9 + r2 * 0.1);
        const tint = [dk * 0.95, dk, dk * 1.06];
        const steepRock = y > treeLine;
        if (this.clearing(cx, cz)) {
          // clearings: grass, a few rocks, bushes, the odd snag or fallen log
          if (r < 0.1) put(pickF(['rock_0', 'rock_1', 'rock_2', 'mossrock', 'boulder_0'], r2), cx + (r2 - 0.5) * 0.6, cz, { texels: 24, scale: 0.9 + r2 * 0.4, tint });
          else if (r < 0.2) put(pickF(['bush_0', 'bush_1', 'sapling', 'sumac'], r2), cx, cz + (r2 - 0.5) * 0.6, { texels: 24, scale: 0.9, sway: 0.5, phase: r * 6, tint });
          else if (r < 0.225) put(pickF(['snag', 'log_0', 'log_1', 'stump'], r2), cx, cz, { texels: 24, scale: 1, tint });
          continue;
        }
        if (steepRock) {
          if (r < (y > 16 ? 0.04 : 0.12)) put(pickF(['spruce_snow_0', 'spruce_snow_1', 'rock_1'], r2), cx, cz, { texels: 24, scale: 0.9 + r2 * 0.3, tint });
          continue;
        }
        // thick forest: 1-2 trees a tile near the map, thinning a little further out
        const n = d < 10 ? (r < 0.35 ? 2 : 1) : r < 0.85 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const rr = hash2(x * 3 + k, z, 811);
          const au = fbm2(cx * 0.16, cz * 0.16, 91);
          let f;
          if (au > 0.62 && rr < 0.55) f = pickF(['maple_red', 'maple_orange', 'maple_scarlet'], hash2(x, z + k, 7));
          else if (y > 6) f = pickF(['spruce_snow_0', 'spruce_0', 'spruce_snow_1', 'spruce_2'], rr);
          else if (rr < 0.48) f = pickF(['spruce_0', 'spruce_1', 'spruce_2'], hash2(x + k, z, 8));
          else if (rr < 0.86) f = pickF(['pine_0', 'pine_1'], rr);
          else f = pickF(['birch_0', 'aspen_0', 'deadtree_0'], rr);
          const tx = x + 0.2 + hash2(x, z, 820 + k) * 0.6, tz = z + 0.2 + hash2(x, z, 830 + k) * 0.6;
          put(f, tx, tz, { texels: 24, scale: 0.9 + hash2(x, z, 840 + k) * 0.35, sway: 0.35, phase: rr * 6.28, flip: rr > 0.5, tint });
        }
      }
    // far, back to front so dithered edges sort nicely
    items.sort((a, b) => a.z - b.z);
    // one batch per chunk, each culled on its own
    const buckets = new Map();
    for (const it of items) { const k = chunkKey(it.x, it.z); let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(it); }
    this.trees = [];
    for (const list of buckets.values()) {
      if (!list.length) continue;
      const B = new SpriteBatch(tex, { max: list.length, lit: true, castShadow: false, receiveShadow: true, name: 'outerRingTrees' });
      this.patchHaze(B.mesh.material, 'spriteRingL');
      const box = new THREE.Box3();
      for (const it of list) { B.push(it.f, it.x, it.y, it.z, it.o); box.expandByPoint(new THREE.Vector3(it.x, it.y, it.z)); }
      box.max.y += 6; box.expandByScalar(3);
      B.commit();
      B.geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      B.mesh.frustumCulled = true;
      this.trees.push(B);
      this.group.add(B.mesh);
    }
  }

  // haze on a sprite material (per-sprite, from its anchor)
  patchHaze(mat, key) {
    const prev = mat.onBeforeCompile;
    const U = this.uniforms;
    mat.onBeforeCompile = (shader, r) => {
      prev.call(mat, shader, r);
      Object.assign(shader.uniforms, { uHaze: U.uHaze, uRect: U.uRect, uRingCam: U.uRingCam, uHazeK: U.uHazeK });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + HAZE_PARS + '\nvarying float vRingHaze;')
        .replace('vec3 transformed = sprW;', 'vec3 transformed = sprW;\ntransformed.y += (2.0 + (aPos.y - 2.0) * 0.35 - aPos.y) * flatK(aPos);')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRingHaze = ringHaze(aPos);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHaze;\nvarying float vRingHaze;')
        .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uHaze, vRingHaze);\n#include <opaque_fragment>');
    };
    mat.customProgramCacheKey = () => key;
    mat.needsUpdate = true;
  }

  // -------------------------------------------------------------- waterfall
  // a ribbon of white water down a face of the big northern range
  buildWaterfall() {
    // the longest steep, south-facing run down the east or west range (faces the
    // default camera), not too far out to be seen
    let best = null;
    for (const side of [-1, 1])
      for (let dd = 16; dd <= 34; dd += 2)
        for (let z = 10; z < this.H - 34; z += 2) {
          const x = side < 0 ? -dd : this.W + dd;
          const run = [];
          let pz = z, prev = this.heightAt(x, pz);
          for (let k = 0; k < 30; k++) {
            run.push([x + Math.sin(k * 0.7) * 0.2, prev + 0.3, pz]);
            const ny = this.heightAt(x, pz + 0.8);
            if (ny > prev + 0.01 || ny < 0.5) break; // terraces: flat steps are fine, climbing isn't
            prev = ny; pz += 0.8;
          }
          const drop = run.length > 6 ? run[0][1] - run[run.length - 1][1] : 0;
          if (drop > 6 && (!best || drop > best.drop)) best = { drop, run };
        }
    if (!best) return;
    const pts = best.run;
    if (pts.length < 4) return;
    const pos = [], uv = [], idx = [];
    const wdt = 1.4;
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const [qx, qy, qz] = pts[i];
      if (i) len += Math.hypot(qx - pts[i - 1][0], qy - pts[i - 1][1], qz - pts[i - 1][2]);
      const ww = wdt * (0.7 + 0.5 * (i / pts.length));
      pos.push(qx - ww / 2, qy, qz, qx + ww / 2, qy, qz);
      uv.push(0, len, 1, len);
      if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const U = this.uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uHaze: U.uHaze, uLight: { value: new THREE.Color(1, 1, 1) }, uHazeK: U.uHazeK, uRect: U.uRect, uRingCam: U.uRingCam },
      vertexShader: /* glsl */ `
${HAZE_PARS}
varying vec2 vUv;
varying float vFlat;
void main() {
  vUv = uv;
  vec3 p = position;
  vFlat = flatK(p);
  p.y = mix(p.y, 2.0 + (p.y - 2.0) * 0.35, vFlat);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`,
      fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uHaze;
uniform vec3 uLight;
uniform float uHazeK;
varying vec2 vUv;
varying float vFlat;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  float col = floor(vUv.x * 6.0);
  float s = fract(vUv.y * 0.55 - uTime * (1.1 + h21(vec2(col, 1.0)) * 0.6) + h21(vec2(col, 7.0)));
  float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  vec3 c = mix(vec3(0.55, 0.75, 0.88), vec3(0.95, 0.98, 1.0), step(0.55, s));
  c *= uLight;
  c = mix(c, uHaze, 0.45 * uHazeK);
  if (edge < 0.35 || vFlat > 0.3) discard;
  gl_FragColor = vec4(c, 1.0);
}`,
    });
    this.fallLight = mat.uniforms.uLight;
    const m = new THREE.Mesh(geo, mat);
    m.name = 'outerRingWaterfall';
    this.group.add(m);
    this.waterfall = m;
    this.waterfallAt = pts[pts.length - 1];
    this.fallPts = pts;
  }

  // ---------------------------------------------------------------- critters
  // a few deer grazing in the clearings and birds wheeling over the treetops
  buildCritters() {
    const { canvas, frames } = deerAtlas();
    const tex = pixelTexture(canvas);
    const D = (this.deerBatch = new SpriteBatch(tex, { max: 16, lit: true, castShadow: false, receiveShadow: true, name: 'outerRingDeer' }));
    this.patchHaze(D.mesh.material, 'spriteRingDeer');
    this.deerFrames = frames;
    this.deer = [];
    // clearings near the map edge, all four sides
    const spots = [];
    for (let k = 0; k < 400 && spots.length < 9; k++) {
      const side = k % 4;
      const t = hash2(k, 3, 901), off = 3 + hash2(k, 5, 903) * 12;
      const x = side === 0 ? t * this.W : side === 1 ? this.W + off : side === 2 ? t * this.W : -off;
      const z = side === 0 ? -off - 6 : side === 1 ? t * this.H : side === 2 ? this.H + off : t * this.H;
      if (!this.clearing(x, z) || this.heightAt(x, z) > 6) continue;
      if (this.rivers.length && this.riverDist(x, z).d < 3) continue;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 12)) continue;
      spots.push([x, z]);
    }
    for (const [x, z] of spots) {
      const n = 1 + Math.floor(hash2(x, z, 911) * 2.4);
      for (let i = 0; i < n; i++) {
        const dx = (hash2(x, z, 920 + i) - 0.5) * 2.4, dz = (hash2(x, z, 930 + i) - 0.5) * 1.6;
        this.deer.push({ x: x + dx, z: z + dz, y: this.heightAt(x + dx, z + dz), buck: i === 0 && hash2(x, z, 940) > 0.4, flip: hash2(x, z, 950 + i) > 0.5, t: hash2(x, z, 960 + i) * 9, graze: hash2(x, z, 970 + i) > 0.5 });
      }
    }
    this.group.add(D.mesh);

    const { tex: ntex } = this.world.natureFrames();
    const Bd = (this.birdBatch = new SpriteBatch(ntex, { max: 24, lit: true, castShadow: false, receiveShadow: false, name: 'outerRingBirds' }));
    this.patchHaze(Bd.mesh.material, 'spriteRingBirds');
    this.birdFrames = (this.world.natureFrames().frames.crow_fly || []).filter(Boolean);
    this.birds = [];
    const flocks = [[-14, 40], [this.W + 16, 70], [60, -30], [100, this.H + 14], [-20, this.H + 18]];
    for (const [fx, fz] of flocks)
      for (let i = 0; i < 3; i++) this.birds.push({ cx: fx, cz: fz, r: 6 + i * 1.6 + hash2(fx, i, 1) * 3, a: hash2(fx, fz, i) * 6.28, sp: 0.22 + hash2(fz, i, 2) * 0.1, y: 9 + i * 0.8 + this.heightAt(fx, fz) * 0.6, ph: i * 1.7 });
    this.group.add(Bd.mesh);
  }

  updateCritters(time) {
    const D = this.deerBatch;
    if (D && this.deer.length) {
      D.clear();
      for (const d of this.deer) {
        // graze for a while, look up, graze again; now and then step forward
        const cyc = (time * 0.25 + d.t) % 6;
        const up = cyc > 4.2;
        const f = this.deerFrames[(d.buck ? 2 : 0) + (up || !d.graze ? 0 : 1)];
        D.push(f, d.x, d.y - 0.05, d.z, { texels: 16, scale: 1, flip: d.flip, tint: [0.9, 0.9, 0.92] });
      }
      D.commit();
    }
    const Bb = this.birdBatch;
    if (Bb && this.birdFrames.length) {
      Bb.clear();
      for (const b of this.birds) {
        const a = b.a + time * b.sp;
        const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r * 0.7;
        const y = b.y + Math.sin(time * 0.7 + b.ph) * 0.6;
        const f = this.birdFrames[Math.floor(time * 6 + b.ph * 3) % this.birdFrames.length];
        Bb.push(f, x, y, z, { texels: 24, scale: 0.85, flip: Math.sin(a) > 0, mode: 0 });
      }
      Bb.commit();
    }
  }

  // ----------------------------------------------------------------- update
  update(time, sky, rig) {
    const U = this.uniforms;
    U.uTime.value = time;
    // haze = the sky right at the horizon, toned to the light
    const su = sky.uniforms;
    const hz = U.uHaze.value;
    hz.copy(su.uBottom.value).lerp(su.uTop.value, 0.18);
    const night = sky.state.night || 0;
    U.uHazeK.value = 1 - night * 0.35;
    if (rig) U.uRingCam.value.set(Math.sin(rig.yaw), Math.cos(rig.yaw));
    if (this.fallLight) {
      const l = sky.hemi.intensity * 0.45 + sky.sun.intensity * 0.25;
      this.fallLight.value.copy(sky.hemi.color).multiplyScalar(l).lerp(sky.sun.color, 0.25);
    }
    this.updateCritters(time);
    this.updateEdgeMist(rig, night);
  }

  // pushing the camera past the edge: a soft mist creeps in on that side of the screen
  updateEdgeMist(rig, night) {
    const ep = rig?.edgePush;
    let k = ep ? ep.k : 0;
    this.mistK = (this.mistK || 0) + (k - (this.mistK || 0)) * 0.25;
    k = this.mistK;
    if (k < 0.01 && !this.mistEl) return;
    if (!this.mistEl) {
      if (typeof document === 'undefined') return;
      const cv = document.getElementById('game');
      if (!cv || !cv.parentNode) return;
      const el = document.createElement('div');
      el.className = 'edge-mist';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;';
      cv.parentNode.insertBefore(el, cv.nextSibling);
      this.mistEl = el;
    }
    const el = this.mistEl;
    if (k < 0.01) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
    // world push direction -> screen direction (right = +x, forward = up)
    const cy = Math.cos(rig.yaw), sy = Math.sin(rig.yaw);
    const r = cy * ep.x - sy * ep.z, f = -sy * ep.x - cy * ep.z;
    const l = Math.hypot(r, f) || 1;
    const sx = 50 + (r / l) * 62, syy = 50 - (f / l) * 62;
    const c = night > 0.5 ? '40,52,80' : '232,240,244';
    const bg = `radial-gradient(ellipse 70% 70% at ${sx.toFixed(1)}% ${syy.toFixed(1)}%, rgba(${c},0.85) 0%, rgba(${c},0.35) 45%, rgba(${c},0) 75%)`;
    if (this._mistBg !== bg) { el.style.background = bg; this._mistBg = bg; }
    el.style.opacity = (Math.min(1, k) * 0.75).toFixed(3);
  }
}

// --------------------------------------------------------------- deer art
// tiny pixel deer: doe standing / grazing, buck standing / grazing
function deerAtlas() {
  const FW = 18, FH = 16;
  const c = document.createElement('canvas');
  c.width = FW * 4; c.height = FH;
  const x2 = c.getContext('2d');
  const P = { b: '#8a5a34', d: '#6a4226', l: '#b07a4c', w: '#efe6d6', k: '#2a1a12', a: '#d8c4a0' };
  // rows drawn facing right; '.' = clear
  const body = [
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '.w.........ll.....',
    'wbbbbbbbbbbbll....',
    '.bbbbbbbbbbbb.....',
    '.dbbbbbbbbbbd.....',
    '..ddllllllldd.....',
    '..d.d.....d.d.....',
    '..d.d.....d.d.....',
    '..d.d.....d.d.....',
    '..k.k.....k.k.....',
    '..................',
  ];
  const headUp = [[12, 2, 'l'], [13, 2, 'l'], [12, 3, 'b'], [13, 3, 'b'], [12, 4, 'b'], [13, 4, 'b'], [14, 4, 'b'], [12, 5, 'b'], [13, 5, 'b'], [14, 5, 'b'], [15, 5, 'b'], [16, 5, 'd'], [15, 4, 'k'], [11, 1, 'b'], [14, 1, 'b'], [12, 6, 'b']];
  const headDown = [[12, 9, 'b'], [13, 10, 'b'], [14, 11, 'b'], [15, 12, 'b'], [16, 12, 'b'], [15, 13, 'b'], [16, 13, 'd'], [14, 11, 'b'], [15, 11, 'k'], [13, 8, 'b'], [14, 9, 'l']];
  const antlerUp = [[11, 0, 'a'], [12, 0, 'a'], [14, 0, 'a'], [15, 0, 'a'], [12, 1, 'a'], [14, 1, 'a'], [10, 1, 'a'], [16, 1, 'a']];
  const antlerDown = [[15, 9, 'a'], [16, 9, 'a'], [17, 10, 'a'], [14, 8, 'a']];
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const ox = f * FW;
    const px = (x, y, k) => { x2.fillStyle = P[k]; x2.fillRect(ox + x, y, 1, 1); };
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const ch = body[y][x]; if (ch !== '.') px(x, y, ch); }
    const down = f % 2 === 1;
    if (down) { for (const [x, y] of [[11, 6], [12, 6]]) x2.clearRect(ox + x, y, 1, 1); }
    for (const [x, y, k] of down ? headDown : headUp) px(x, y, k);
    if (f >= 2) for (const [x, y, k] of down ? antlerDown : antlerUp) px(x, y, k);
    frames.push({ x: ox, y: 0, w: FW, h: FH, ax: FW / 2, ay: FH - 1 });
  }
  return { canvas: c, frames };
}
