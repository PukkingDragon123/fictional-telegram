// [v26 world] The valley ranges round the map, built from true cubes. The ring
// is sampled on square cells whose size grows with the distance from the map
// (1 tile near it, 2, then 4 out on the far ranges); every cell is a column of
// equal cubes (0.5 / 1 / 2 units: one block size per band, so blocks are always
// cubes) - flat tops, walls a whole number of blocks tall, each face with its
// own block of pixel texture (no stretching, no smearing).
//
// [v26 mountains] The ranges are never cut or sunk (that read as the mountain
// vanishing when you turned): they are solid from every side, and near the map
// each column is kept under the lowest line of sight that crosses it from any
// spot the camera may look at, in any of the 8 directions (viewGuard.js
// ringEnvelope), so they rise as foothills and never hide what you look at.
//
// [v30 world] Voxel + sculpted: the near band (1-tile cells) mixes chunky cube
// cliffs and ledges with smooth, faceted slopes (forest hills, scree fans,
// sculpted rock and snowfields). A sloped cell only ever sinks its corners
// towards lower neighbours (never rises), so `heightAt` (collision, view guard,
// eye guard) stays an upper bound of what is drawn. Walls follow the corners
// exactly (watertight between cubes, slopes and the map). Every massif has its
// own rock colour, walls carry strata bands and a dark foot, ledges grow turf
// and moss, and chunky voxel boulders sit on the rock (only where they stay
// under the camera's lowest line of sight). `ring.visualAt` = the drawn ground.
import * as THREE from 'three';
import { fbm2, hash2, clamp } from '../core/rng.js';
import { WATER_Y } from './grid.js';
import { STONE, STONE_GLSL, stoneUniforms } from '../art/stoneArt.js';
import { terrainAtlasUniforms } from './terrain.js';
import { HAZE_PARS } from './outerRing.js';
import { ringEnvelope } from './viewGuard.js'; // [v26 mountains]

const E = 100;
const CHUNK = 36;
const chunkKey = (x, z) => Math.floor((x + 400) / CHUNK) * 1000 + Math.floor((z + 400) / CHUNK);
const B1 = 26, B2 = 58; // band edges (distance from the map, tiles)

// [v26 mountains] nothing is cut any more (the ranges looked like they vanished
// as you turned): kept for the sprite shaders that still include it
const CAP_GLSL = /* glsl */ `
float capAt(vec2 c, float bs) { return 999.0; }
`;

// [v30 world] the colour of a massif's rock (big patches): warm sandstone, cool slate, rosy granite, ochre
function rockTint(x, z) {
  const a = fbm2(x * 0.03 + 11, z * 0.03 - 7, 991, 3), b = fbm2(x * 0.06, z * 0.06, 993, 2);
  const warm = clamp((a - 0.45) * 3, -1, 1), rose = clamp((b - 0.55) * 3, 0, 1);
  return [1 + warm * 0.07 + rose * 0.05, 1 + warm * 0.015 - rose * 0.02, 1 - warm * 0.08 - rose * 0.03];
}

export function buildCubeGround(ring) {
  const { W, H } = ring;
  const NX = W + 2 * E, NZ = H + 2 * E;
  const fine = new Float32Array(NX * NZ).fill(NaN);
  const top = new Uint8Array(NX * NZ); // surface id (atlas < 20, stone 20+)
  const bsz = new Float32Array(NX * NZ); // block size of the cell owning this unit
  const cellC = new Float32Array(NX * NZ * 2); // owning cell's centre
  const smU = new Uint8Array(NX * NZ); // [v30 world] 1 = the unit's cell is a smooth (sloped) cell
  const cellOf = new Int32Array(NX * NZ).fill(-1); // [v30 world] index into `cells`
  const fi = (x, z) => (z + E) * NX + (x + E);
  ring.fine = fine;
  ring.fineBs = bsz;
  const S = { GRASS: 0, AUTUMN: 1, DIRT: 2, POND: 4, SNOW: 6, FOREST: 8 };
  const ST = (v) => 20 + v;
  const rockOf = (x, z) => { const m = fbm2(x * 0.045, z * 0.045, 741); return m > 0.58 ? STONE.SLATE : m < 0.4 ? STONE.CRACKED : STONE.GRANITE; };
  const lines = (x, z) => {
    const n = fbm2(x * 0.09, z * 0.09, 717);
    return { snowLine: 31 + (n - 0.5) * 8 - (z < 0 ? 5 : 0), stoneLine: 10 + (n - 0.5) * 6 };
  };
  const topOf = (x, z, y, wet) => {
    if (wet) return S.POND;
    const r = hash2(Math.floor(x * 2), Math.floor(z * 2), 711);
    const { snowLine, stoneLine } = lines(x, z);
    if (y > snowLine) return S.SNOW;
    if (y > snowLine - 7) return r < 0.55 ? ST(STONE.SNOWROCK) : ST(STONE.GRANITE);
    if (y > stoneLine) {
      if (y < stoneLine + 2.5) return ST(fbm2(x * 0.2, z * 0.2, 733) > 0.5 ? STONE.SCREE : STONE.MOSSY);
      // [v30 world] ledges up in the rock: turf and moss on some of them
      const g = fbm2(x * 0.25, z * 0.25, 761);
      if (y < stoneLine + 9 && g > 0.6) return r < 0.6 ? S.GRASS : ST(STONE.MOSSY);
      return ST(rockOf(x, z));
    }
    if (ring.clearing(x, z)) return S.GRASS;
    if (fbm2(x * 0.05, z * 0.05, 91) > 0.62 && r < 0.5) return S.AUTUMN;
    return S.FOREST;
  };
  // ---- sample every cell (square, aligned to its size)
  const cells = [];
  const env = ringEnvelope(ring.grid, E); // [v26 mountains] the lowest line of sight over each column
  for (let z = -E; z < H + E; z++)
    for (let x = -E; x < W + E; x++) {
      if (x >= 0 && x < W && z >= 0 && z < H) continue;
      if (!Number.isNaN(fine[fi(x, z)])) continue;
      const d0 = ring.dist(x + 0.5, z + 0.5);
      const cs = d0 < B1 ? 1 : d0 < B2 ? 2 : 4;
      const x0 = Math.floor((x + E) / cs) * cs - E, z0 = Math.floor((z + E) / cs) * cs - E;
      const cx = x0 + cs / 2, cz = z0 + cs / 2;
      const s = ring.sample(cx, cz);
      const bs = cs === 1 ? 0.5 : cs === 2 ? 1 : 2;
      let y = s.water ? WATER_Y - 0.05 : Math.max(0, Math.round(s.y / bs) * bs);
      let em = 1e9;
      if (!s.water) { // [v26 mountains] foothills: under every line of sight that crosses this column
        for (let zz = z0; zz < z0 + cs; zz++) for (let xx = x0; xx < x0 + cs; xx++) em = Math.min(em, env.at(xx, zz));
        if (em < 1e8) y = Math.min(y, Math.max(0, Math.floor((em - 0.05) / bs) * bs));
      }
      // the first row by the map: never below the map's own edge there (no crack)
      const dd = ring.dist(cx, cz);
      if (!s.water && dd < 1.01) y = Math.max(y, Math.ceil(ring.edgeH(cx, cz) / bs - 0.02) * bs);
      const id = topOf(cx, cz, y, s.water);
      // [v30 world] smooth (sloped) or cube? near band only, never right on the seam or in water
      let sm = 0;
      if (cs === 1 && !s.water && dd > 1.6) {
        if (id < 20 && id !== S.SNOW) sm = 1; // forest / meadow hills: soft slopes
        else if (id === ST(STONE.SCREE)) sm = 1; // scree fans
        else if (id === S.SNOW) sm = fbm2(cx * 0.08, cz * 0.08, 981) > 0.38 ? 1 : 0; // snowfields
        else sm = fbm2(cx * 0.06, cz * 0.06, 977) > 0.52 ? 1 : 0; // sculpted rock
      }
      const c = { x0, z0, cs, bs, y, id, cx, cz, wet: s.water, sm, em, maxD: id < 20 ? 1.5 : 1.0 };
      const ci = cells.length;
      cells.push(c);
      for (let zz = z0; zz < z0 + cs; zz++)
        for (let xx = x0; xx < x0 + cs; xx++) {
          if (xx < -E || zz < -E || xx >= W + E || zz >= H + E) continue;
          if (xx >= 0 && xx < W && zz >= 0 && zz < H) continue;
          const k = fi(xx, zz);
          fine[k] = y; top[k] = id; bsz[k] = bs; cellC[k * 2] = cx; cellC[k * 2 + 1] = cz; smU[k] = sm; cellOf[k] = ci;
        }
    }
  ring.heightAt = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix >= 0 && ix < W && iz >= 0 && iz < H) return 0;
    if (ix < -E || iz < -E || ix >= W + E || iz >= H + E) return 0;
    const v = fine[fi(ix, iz)];
    return Number.isNaN(v) ? 0 : Math.max(0, v);
  };
  // the map side of a unit edge: the map's edge height there
  const mapH = (x, z) => Math.max(0, ring.edgeH(x + 0.5, z + 0.5));
  const inMapU = (x, z) => x >= 0 && x < W && z >= 0 && z < H;
  const unitH = (x, z) => {
    if (inMapU(x, z)) return mapH(x, z);
    if (x < -E || z < -E || x >= W + E || z >= H + E) return NaN;
    return fine[fi(x, z)];
  };
  // [v30 world] lowest ground round a lattice point
  const hcMin = (px, pz) => {
    let m = 1e9;
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) { const v = unitH(px + dx, pz + dz); if (!Number.isNaN(v) && v < m) m = v; }
    return m;
  };
  // the top of cell c at lattice point (px, pz): flat cubes keep their top, sloped cells sink towards lower ground
  const cornerOf = (c, px, pz) => (c.sm ? Math.max(c.y - c.maxD, Math.min(c.y, hcMin(px, pz))) : c.y);
  // [v30 world] the drawn ground (bilinear over a sloped unit), for sprites standing on it
  ring.visualAt = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix < -E || iz < -E || ix >= W + E || iz >= H + E || inMapU(ix, iz)) return ring.heightAt(x, z);
    const k = fi(ix, iz);
    if (!smU[k]) return ring.heightAt(x, z);
    const c = cells[cellOf[k]];
    const u = x - ix, v = z - iz;
    const a = cornerOf(c, ix, iz), b = cornerOf(c, ix + 1, iz), d = cornerOf(c, ix, iz + 1), e = cornerOf(c, ix + 1, iz + 1);
    return Math.max(0, (a * (1 - u) + b * u) * (1 - v) + (d * (1 - u) + e * u) * v);
  };
  // ---- geometry
  const chunks = new Map();
  const partOf = (x, z) => { const k = chunkKey(x, z); let c = chunks.get(k); if (!c) chunks.set(k, (c = { pos: [], nor: [], col: [], surf: [], blk: [], idx: [], n: 0 })); return c; };
  // v4: 4 corners; rgb: 4 [r,g,b]; tops: per-vertex top line of the column (wall texturing)
  const quad = (P, v4, nrm, rgb, topId, wallId, bs, tops) => {
    const v = P.n;
    for (let k = 0; k < 4; k++) {
      const q = v4[k], cc = rgb[k];
      P.pos.push(q[0], q[1], q[2]); P.nor.push(nrm[0], nrm[1], nrm[2]); P.col.push(cc[0], cc[1], cc[2]);
      P.surf.push(topId, wallId); P.blk.push(bs, tops[k]);
    }
    P.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    P.n += 4;
  };
  const wallStone = (x, z, lo) => {
    const hb = hash2(Math.floor(lo / 3), 0, 77);
    const rk = rockOf(x, z);
    if (lo > 26 && hb < 0.5) return ST(STONE.SNOWROCK);
    if (lo < 6 && hb < 0.4) return ST(STONE.MOSSY);
    if (hb > 0.82) return ST(STONE.DARK);
    if (hb > 0.62) return ST(rk === STONE.SLATE ? STONE.GRANITE : STONE.SLATE);
    return ST(rk);
  };
  const tintOf = (id, x, z) => {
    if (id >= 20 || id === S.SNOW) return rockTint(x, z);
    if (id === S.POND) return [1, 1, 1];
    const g = fbm2(x * 0.07, z * 0.07, 995);
    return [0.97 + g * 0.06, 1, 0.95 + g * 0.04];
  };
  const mul = (t, k) => [t[0] * k, t[1] * k, t[2] * k];
  const nbAtU = (x, z) => {
    if (inMapU(x, z)) return mapH(x, z);
    if (x < -E || z < -E || x >= W + E || z >= H + E) return -4;
    return fine[fi(x, z)];
  };
  // the neighbour's top along the edge at lattice point (px, pz): -4 under the map's edge (a skirt) / outside
  const nbCorner = (nx, nz, px, pz) => {
    if (inMapU(nx, nz)) return -4;
    if (nx < -E || nz < -E || nx >= W + E || nz >= H + E) return -4;
    const k = fi(nx, nz);
    const ci = cellOf[k];
    if (ci < 0) return -4;
    return cornerOf(cells[ci], px, pz);
  };
  const boulders = [];
  for (const c of cells) {
    const { x0, z0, cs, bs, y, id, cx, cz } = c;
    const P = partOf(cx, cz);
    const x1 = x0 + cs, z1 = z0 + cs;
    const tint = tintOf(id, cx, cz);
    const wTint = rockTint(cx, cz);
    // ---- top
    if (!c.sm) {
      // fake AO: corners next to taller neighbours darker
      const ao = (sx, sz) => { const up = (nbAtU(sx < 0 ? x0 - 1 : x1, sz < 0 ? z0 : z1 - 1) > y + 0.3) + (nbAtU(sx < 0 ? x0 : x1 - 1, sz < 0 ? z0 - 1 : z1) > y + 0.3); return 1 - up * 0.14; };
      quad(P, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], [mul(tint, ao(-1, -1)), mul(tint, ao(-1, 1)), mul(tint, ao(1, 1)), mul(tint, ao(1, -1))], id, wallStone(cx, cz, y - bs), bs, [y, y, y, y]);
    } else {
      // [v30 world] a faceted slope: corners sink towards lower ground
      const a = cornerOf(c, x0, z0), b = cornerOf(c, x0, z1), d = cornerOf(c, x1, z1), e = cornerOf(c, x1, z0);
      // normal of the quad (cross of the diagonals)
      const ux = x1 - x0, uy = d - a, uz = z1 - z0, vx = x0 - x1, vy = b - e, vz = z1 - z0;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      // steeper facets of rock read as scree / bare rock, flat ones keep the column's surface
      let tid = id;
      if (ny < 0.8 && id < 20 && id !== S.POND) tid = id === S.GRASS || id === S.AUTUMN || id === S.FOREST ? (ny < 0.66 ? ST(STONE.MOSSY) : S.FOREST) : tid;
      // lit crest, darker hollows
      const k4 = [a, b, d, e].map((h) => 0.9 + clamp((h - (a + b + d + e) / 4) * 0.25, -0.12, 0.12));
      quad(P, [[x0, a, z0], [x0, b, z1], [x1, d, z1], [x1, e, z0]], [nx, ny, nz], [mul(tint, k4[0]), mul(tint, k4[1]), mul(tint, k4[2]), mul(tint, k4[3])], tid, wallStone(cx, cz, y - bs), bs, [a, b, d, e]);
    }
    // ---- walls: per unit edge, down to whatever is lower on the other side (follows both tops exactly)
    const sides = [
      { n: [1, 0, 0], at: (k) => [x1, z0 + k], p: (k) => [[x1, z0 + k + 1], [x1, z0 + k]] },
      { n: [-1, 0, 0], at: (k) => [x0 - 1, z0 + k], p: (k) => [[x0, z0 + k], [x0, z0 + k + 1]] },
      { n: [0, 0, 1], at: (k) => [x0 + k, z1], p: (k) => [[x0 + k, z1], [x0 + k + 1, z1]] },
      { n: [0, 0, -1], at: (k) => [x0 + k, z0 - 1], p: (k) => [[x0 + k + 1, z0], [x0 + k, z0]] },
    ];
    for (const sd of sides) {
      const sh = sd.n[0] !== 0 ? 0.86 : 0.76;
      let k = 0;
      while (k < cs) {
        const [nx, nz] = sd.at(k);
        const [pa, pb] = sd.p(k);
        const ta = cornerOf(c, pa[0], pa[1]), tb = cornerOf(c, pb[0], pb[1]);
        let na = nbCorner(nx, nz, pa[0], pa[1]), nb = nbCorner(nx, nz, pb[0], pb[1]);
        if (Number.isNaN(na)) na = -4;
        if (Number.isNaN(nb)) nb = -4;
        if (na >= ta - 0.01 && nb >= tb - 0.01) { k++; continue; }
        // flat on both sides and the same neighbour cell: merge the run
        let L = 1, pEnd = pb;
        const nIdx = !inMapU(nx, nz) && nx >= -E && nz >= -E && nx < W + E && nz < H + E ? cellOf[fi(nx, nz)] : -1;
        const nFlat = nIdx < 0 || !cells[nIdx].sm;
        if (!c.sm && nFlat) {
          while (k + L < cs) {
            const [mx, mz] = sd.at(k + L);
            const mIdx = !inMapU(mx, mz) && mx >= -E && mz >= -E && mx < W + E && mz < H + E ? cellOf[fi(mx, mz)] : -1;
            if (mIdx !== nIdx || (nIdx < 0 && inMapU(mx, mz) !== inMapU(nx, nz))) break;
            L++;
          }
          if (L > 1) { const q = sd.p(k + L - 1); pEnd = sd.n[0] > 0 || sd.n[2] < 0 ? q[0] : q[1]; }
        }
        // corners in face order: bottom a, bottom b, top b, top a (a / b along the face)
        let A = pa, B = pb;
        if (L > 1) { if (sd.n[0] > 0 || sd.n[2] < 0) A = pEnd; else B = pEnd; }
        const tA = cornerOf(c, A[0], A[1]), tB = cornerOf(c, B[0], B[1]);
        const bA = Math.min(tA, na), bB = Math.min(tB, nb);
        const lo = Math.max(Math.min(bA, bB), -4);
        const wid = wallStone(cx + k, cz, lo);
        // strata wall: darker foot (crevice) on tall walls, lit lip on top
        const hA = tA - bA, hB = tB - bB;
        const foot = (hh) => Math.max(0.58, 1 - hh * 0.035);
        const cBA = mul(wTint, sh * foot(hA) * 0.82), cBB = mul(wTint, sh * foot(hB) * 0.82);
        const cTA = mul(wTint, sh * Math.min(1.1, foot(hA) + 0.2)), cTB = mul(wTint, sh * Math.min(1.1, foot(hB) + 0.2));
        quad(P, [[A[0], Math.max(bA, -4), A[1]], [B[0], Math.max(bB, -4), B[1]], [B[0], tB, B[1]], [A[0], tA, A[1]]], sd.n, [cBA, cBB, cTB, cTA], id, wid, bs, [tA, tB, tB, tA]);
        k += L;
      }
    }
    // ---- [v30 world] chunky voxel boulders on the rock (never above the lowest line of sight)
    if (!c.wet && cs <= 2 && (id >= 20 || id === S.SNOW || (id === S.GRASS && y > 8))) {
      const r = hash2(Math.floor(cx * 3), Math.floor(cz * 3), 1201);
      const want = id === ST(STONE.SCREE) ? 0.3 : cs === 1 ? 0.14 : 0.1;
      if (r < want) {
        const s = cs === 1 ? (r < want * 0.4 ? 0.5 : 0.25) * (1 + Math.floor(hash2(cx, cz, 1203) * 2)) : 0.5 * (1 + Math.floor(hash2(cx, cz, 1203) * 2));
        const ox = x0 + 0.1 + hash2(cx, cz, 1205) * Math.max(0, cs - s - 0.2), oz = z0 + 0.1 + hash2(cx, cz, 1207) * Math.max(0, cs - s - 0.2);
        let gy = y;
        if (c.sm) gy = Math.min(cornerOf(c, x0, z0), cornerOf(c, x1, z0), cornerOf(c, x0, z1), cornerOf(c, x1, z1));
        if (gy + s * 1.6 < c.em - 0.4) boulders.push({ P, x: ox, z: oz, y: gy - 0.05, s, id: id === S.SNOW ? ST(STONE.SNOWROCK) : ST(rockOf(cx, cz) === STONE.SLATE ? STONE.SLATE : STONE.GRANITE), t: wTint, r: hash2(cx, cz, 1209) });
      }
    }
  }
  // boulders: a big block with a smaller one leaning on it, all cubes
  const box = (P, x0, y0, z0, s, hgt, id, t) => {
    const x1 = x0 + s, z1 = z0 + s, y1 = y0 + hgt;
    const top = [mul(t, 1.08), mul(t, 1.08), mul(t, 1.08), mul(t, 1.08)];
    quad(P, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], top, id, id, s, [y1, y1, y1, y1]);
    const lo = mul(t, 0.62), hiX = mul(t, 0.9), hiZ = mul(t, 0.8);
    quad(P, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [lo, lo, hiX, hiX], id, id, s, [y1, y1, y1, y1]);
    quad(P, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [lo, lo, hiX, hiX], id, id, s, [y1, y1, y1, y1]);
    quad(P, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [lo, lo, hiZ, hiZ], id, id, s, [y1, y1, y1, y1]);
    quad(P, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [lo, lo, hiZ, hiZ], id, id, s, [y1, y1, y1, y1]);
  };
  for (const b of boulders) {
    box(b.P, b.x, b.y, b.z, b.s, b.s, b.id, b.t);
    const s2 = b.s * 0.5;
    if (b.r < 0.7) box(b.P, b.x + (b.r < 0.35 ? -s2 * 0.6 : b.s - s2 * 0.4), b.y, b.z + s2 * 0.5, s2, s2, b.id, mul(b.t, 0.95));
    if (b.r > 0.5 && b.s >= 0.5) box(b.P, b.x + s2 * 0.5, b.y + b.s, b.z + s2 * 0.3, s2, s2 * 0.5, b.id, mul(b.t, 1.02));
  }
  // ---- material: the block shader + haze
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = ring.uniforms;
  const TA = terrainAtlasUniforms();
  const SU = stoneUniforms();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TA, SU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${HAZE_PARS}
attribute vec2 aSurf;
attribute vec2 aBlk; // block size, top line of the column here
varying vec2 vSurf;
varying vec2 vBlk;
varying float vRingHaze;
varying vec3 vRPos;
varying vec3 vRNor;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvRNor = objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRPos = transformed;
vSurf = aSurf;
vBlk = aBlk;`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRingHaze = ringHaze((modelMatrix * vec4(transformed, 1.0)).xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHaze;
uniform sampler2D uAtlas;
uniform vec4 uRects[10];
varying vec2 vSurf;
varying vec2 vBlk;
varying float vRingHaze;
varying vec3 vRPos;
varying vec3 vRNor;
${STONE_GLSL}
float rbH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec3 ringWin(int id, vec2 win, vec2 lu) {
  vec2 t = (win * 12.0 + floor(lu * 12.0) + 0.5) / 48.0;
  if (id >= 20) return texture2D(uStone, vec2((float(id - 20) + t.x) / 7.0, t.y)).rgb * 1.1;
  vec4 r = uRects[id];
  return texture2D(uAtlas, r.xy + t * r.zw).rgb;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float bs = vBlk.x;
  int topId = int(vSurf.x + 0.5), wallId = int(vSurf.y + 0.5);
  vec3 an = abs(vRNor);
  vec2 lu, bp; vec3 c;
  float ly;
  if (an.y > 0.5) {
    bp = floor(vRPos.xz / bs + 0.001); lu = fract(vRPos.xz / bs + 0.001);
    float hb = rbH(bp + floor(vRPos.y) * 0.31);
    vec2 win = floor(vec2(hb, rbH(bp + 1.3)) * 4.0);
    c = ringWin(topId, win, lu);
    c *= 0.93 + hb * 0.14;
    ly = 1.0 - lu.y;
    // sloped facets: a touch of shade on the steep side
    c *= mix(0.86, 1.0, smoothstep(0.55, 0.95, an.y));
  } else {
    float u = (an.x > 0.5 ? vRPos.z : vRPos.x) / bs, v = vRPos.y / bs;
    bp = vec2(floor(u + 0.001), floor(v + 0.001)); lu = vec2(fract(u + 0.001), fract(v + 0.001));
    float hb = rbH(bp);
    vec2 win = floor(vec2(hb, rbH(bp + 5.9)) * 4.0);
    float depthB = (vBlk.y - vRPos.y) / bs;
    bool soil = (topId == 8 || topId == 0 || topId == 1) && depthB < 1.0;
    c = soil ? ringWin(2, win, lu) * 0.95 : ringWin(topId == 6 && depthB < 1.0 ? 25 : wallId, win, lu);
    float lipT = floor((vBlk.y - vRPos.y) / bs * 12.0);
    if (depthB < 1.0 && lipT < 2.0 + step(0.5, rbH(vec2(floor(lu.x * 12.0), bp.x)))) {
      if (topId == 6) c = vec3(0.93, 0.96, 1.0);
      else if (soil) c = ringWin(topId, win, vec2(lu.x, 0.95)) * 0.95;
    }
    c *= 0.9 + hb * 0.14;
    // strata: broad warm / cool bands through the whole range
    float sb = floor(vRPos.y / 1.5 + rbH(vec2(floor(vRPos.x * 0.125), floor(vRPos.z * 0.125))) * 0.6);
    float sk = rbH(vec2(sb, 7.7));
    if (wallId >= 20 && !soil) c *= mix(vec3(1.06, 0.98, 0.9), vec3(0.92, 0.97, 1.05), sk) * (0.94 + 0.1 * rbH(vec2(sb, 3.1)));
    ly = lu.y;
  }
  float px = 1.0 / 12.0;
  if (lu.x < px || ly > 1.0 - px) c *= 1.12;
  if (lu.x > 1.0 - px || ly < px) c *= 0.74;
  diffuseColor.rgb *= c * 1.08;
}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uHaze, vRingHaze);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'outerRingCubes30';
  ring.ground = [];
  for (const P of chunks.values()) {
    if (!P.n) continue;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(P.n > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(P.surf, 2));
    geo.setAttribute('aBlk', new THREE.Float32BufferAttribute(P.blk, 2));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 4;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'outerRingGround';
    ring.ground.push(mesh);
    ring.group.add(mesh);
  }
  ring.cells = cells; // [v30 world] (waterfalls, trees)
}

// sprites on the ranges follow the cap (and fade where the ground was cut away)
export const SPRITE_CAP = /* glsl */ `
${CAP_GLSL}
`;
export { clamp };
