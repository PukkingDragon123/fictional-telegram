// [v26 world] Which way the water runs. Per tile: a flow direction and speed
// (tiles per second-ish) for every river / creek tile (from the RIVERS
// polylines, downstream), the streams on high ground (STREAMS), the Deep pond
// (pushed out from under the falls, drifting to its outlet) and channels dug
// off a river (game/ext/waterworks.js writes those). Plus white water (rapids,
// the plunge pool, where creeks pour in) and the rocks that sit in the current.
// Pure data, no three.js. World.riverAt(x, z) reads it.
import { KIND } from './grid.js';
import { hash2, clamp } from '../core/rng.js';
import { RIVERS, STREAMS, BIOME, WATERFALL, DEEP_POND } from './worldgen.js';
import { polyDist, riverHalfWidth } from './forestBig.js';

export function buildFlow(g) {
  const { w, h } = g;
  const n = w * h;
  g.flowX = new Float32Array(n);
  g.flowZ = new Float32Array(n);
  g.flowS = new Float32Array(n);
  g.white = new Uint8Array(n);
  g.riverRocks = [];
  const pd = {};
  const outlet = RIVERS.find((r) => r.id === 'turtle')?.pts[0] || [DEEP_POND.cx + 8, DEEP_POND.cz + 3];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      if (g.stream?.[i]) {
        const S = STREAMS[g.stream[i] - 1];
        polyDist(cx, cz, S.pts, pd);
        g.flowX[i] = pd.tx; g.flowZ[i] = pd.tz; g.flowS[i] = S.speed;
        continue;
      }
      if (g.kind[i] !== KIND.WATER) continue;
      const b = g.biome ? g.biome[i] : 0;
      if (b === BIOME.RIVER) {
        let best = null;
        for (const R of RIVERS) {
          polyDist(cx, cz, R.pts, pd);
          const f = pd.len ? pd.s / pd.len : 0;
          const hw = riverHalfWidth(R, f, cx, cz);
          const k = pd.d / Math.max(0.5, hw);
          if (!best || k < best.k) best = { k, R, tx: pd.tx, tz: pd.tz, hw, d: pd.d, f };
        }
        if (!best) continue;
        const { R } = best;
        // narrow stretches run fast, the middle faster than the banks
        const base = R.w1 != null ? R.w + (R.w1 - R.w) * clamp((best.f - 0.55) / 0.45, 0, 1) : R.w;
        const narrow = clamp(base / Math.max(0.6, best.hw), 0.6, 1.8);
        const mid = 0.45 + 0.55 * (1 - clamp(best.k, 0, 1) ** 2);
        let s = R.speed * narrow * mid;
        // a spring pool turns slowly towards its creek
        if (R.spring && best.f < 0.08) s *= 0.4;
        g.flowX[i] = best.tx; g.flowZ[i] = best.tz; g.flowS[i] = s;
        if (s > 1.15) g.white[i] = Math.min(255, Math.round((s - 1.15) * 400));
        continue;
      }
      if (b === BIOME.DEEP) {
        // the falls push the water out; the rest drifts to the outlet
        const px = WATERFALL.x, pz = WATERFALL.land;
        const dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz) || 1;
        const ox = outlet[0] - cx, oz = outlet[1] - cz, od = Math.hypot(ox, oz) || 1;
        const k = clamp(1 - d / 5.5, 0, 1);
        const fx = (dx / d) * k * 1.3 + (ox / od) * (1 - k) * 0.22, fz = (dz / d) * k * 1.3 + (oz / od) * (1 - k) * 0.22;
        const s = Math.hypot(fx, fz);
        g.flowX[i] = fx / (s || 1); g.flowZ[i] = fz / (s || 1); g.flowS[i] = s * (od < 4 ? 1.8 : 1);
        if (d < 2.6) g.white[i] = Math.round(255 * clamp(1.15 - d / 2.6, 0, 1));
      }
    }
  // creeks pour into bigger water: a splash of white where they meet
  for (const R of RIVERS) {
    if (R.id === 'main' || R.id === 'wide') continue;
    const [mx, mz] = R.pts[R.pts.length - 1];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.floor(mx) + dx, z = Math.floor(mz) + dz;
      if (!g.inb(x, z)) continue;
      const i = z * w + x;
      if (g.kind[i] === KIND.WATER) g.white[i] = Math.max(g.white[i], Math.round(150 * clamp(1 - Math.hypot(dx, dz) / 2.6, 0, 1)));
    }
  }
  // rocks in the current (not at the bank, not in the slow wide water)
  for (let z = 1; z < h - 1; z++)
    for (let x = 1; x < w - 1; x++) {
      const i = z * w + x;
      if (g.kind[i] !== KIND.WATER || g.flowS[i] < 0.75 || g.biome[i] !== BIOME.RIVER) continue;
      if (!g.isWater(x + 1, z) || !g.isWater(x - 1, z) || !g.isWater(x, z + 1) || !g.isWater(x, z - 1)) continue;
      if (hash2(x, z, 3301) > 0.06) continue;
      if (g.riverRocks.some((r) => Math.abs(r[0] - x - 0.5) < 2.5 && Math.abs(r[1] - z - 0.5) < 2.5)) continue;
      g.riverRocks.push([x + 0.3 + hash2(x, z, 3303) * 0.4, z + 0.3 + hash2(x, z, 3305) * 0.4, 0.75 + hash2(x, z, 3307) * 0.5]);
    }
}

// flow at a world position: bilinear over the tile centres (water / stream tiles only)
export function flowAt(g, wx, wz, out = { dir: [0, 0], speed: 0 }) {
  if (!g.flowS) return null;
  const x = Math.floor(wx), z = Math.floor(wz);
  if (!g.inb(x, z)) return null;
  const i0 = z * g.w + x;
  if (g.flowS[i0] <= 0.02) return null;
  let fx = 0, fz = 0, s = 0, wsum = 0;
  const qx = wx - 0.5, qz = wz - 0.5, ax = Math.floor(qx), az = Math.floor(qz), ux = qx - ax, uz = qz - az;
  for (let dz = 0; dz <= 1; dz++)
    for (let dx = 0; dx <= 1; dx++) {
      const tx = ax + dx, tz = az + dz;
      if (!g.inb(tx, tz)) continue;
      const i = tz * g.w + tx;
      if (g.flowS[i] <= 0) continue;
      const k = (dx ? ux : 1 - ux) * (dz ? uz : 1 - uz);
      fx += g.flowX[i] * g.flowS[i] * k; fz += g.flowZ[i] * g.flowS[i] * k; s += g.flowS[i] * k; wsum += k;
    }
  if (wsum <= 0) return null;
  const L = Math.hypot(fx, fz) || 1;
  out.dir[0] = fx / L; out.dir[1] = fz / L;
  out.speed = s / wsum;
  return out;
}
