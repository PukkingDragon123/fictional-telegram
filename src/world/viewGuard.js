// [v26 mountains] Mountains stay solid; the CAMERA keeps out of their way.
//
// The camera looks down at a fixed pitch from one of 8 directions. For each
// direction we know, per map tile, whether rock (map or valley ranges) stands
// between the camera and that tile: a "sight shadow" swept over the heightfield
// from the camera's side (S[p] = highest rock towards the camera, minus how much
// the line of sight has climbed by then). A tile is visible when its ground is
// above that (with a small tolerance: a bear standing there still shows).
//
// cameraRig.js asks this guard before it lets you rotate or pan (rotate: the
// spot slides out from behind the rock first, or the turn is refused with a
// bump; pan: you can't slide behind a mountain), and when something else
// (a look-at, a followed bear) puts the spot behind rock it turns the camera
// to a side that sees it.
//
// The valley ranges never hide a reachable spot either: when they are built,
// every range column is kept under the lowest line of sight that passes over
// it from any visible spot in the camera bounds, in any of the 8 directions
// (ringEnvelope). So the ranges rise from the map as foothills, never
// steeper than the camera looks down, and are the same from every side
// (nothing sinks or appears as you rotate).

export const VIEW_TAN = Math.tan((44 * Math.PI) / 180); // the camera's normal pitch (cameraRig.js)
export const VIEW_INSET = { x0: 5, x1: 5, z0: 9, z1: 4 }; // the camera bounds (Game.js setBounds)
export const SEE_TOL = 0.35; // rock this much above a spot's line of sight hides it (a bear there always shows)
const DIRS = [...Array(8)].map((_, i) => [Math.round(Math.sin((i * Math.PI) / 4)), Math.round(Math.cos((i * Math.PI) / 4))]);

export const yawIndex = (yaw) => ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8;

// S[p] = max over cells c towards the camera (direction (dx, dz)) of h(c) - tan * dist(p, c)
export function sightShadow(H, PW, PH, dx, dz, tanP, S) {
  S.fill(-1e9);
  const drop = tanP * Math.hypot(dx, dz), sd = tanP * 0.71, diag = dx !== 0 && dz !== 0;
  const xa = dx > 0 ? PW - 1 : 0, xb = dx > 0 ? -1 : PW, xs = dx > 0 ? -1 : 1;
  const za = dz > 0 ? PH - 1 : 0, zb = dz > 0 ? -1 : PH, zs = dz > 0 ? -1 : 1;
  for (let z = za; z !== zb; z += zs) {
    const nz = z + dz;
    if (nz < 0 || nz >= PH) continue;
    for (let x = xa; x !== xb; x += xs) {
      const nx = x + dx;
      if (nx < 0 || nx >= PW) continue;
      const n = nz * PW + nx;
      let s = (H[n] > S[n] ? H[n] : S[n]) - drop;
      if (diag) { const a = H[z * PW + nx] - sd, b = H[nz * PW + x] - sd; if (a > s) s = a; if (b > s) s = b; }
      S[z * PW + x] = s;
    }
  }
  return S;
}

// the lowest line of sight over each cell of the padded grid (map + E around it),
// from spots inside the camera bounds that the map itself doesn't hide
export function ringEnvelope(grid, E, tanP = VIEW_TAN) {
  const { w: W, h: Hh } = grid;
  const PW = W + 2 * E, PH = Hh + 2 * E;
  const H = new Float32Array(PW * PH);
  for (let z = 0; z < Hh; z++) for (let x = 0; x < W; x++) H[(z + E) * PW + x + E] = grid.height[z * W + x];
  const env = new Float32Array(PW * PH).fill(1e9);
  const S = new Float32Array(PW * PH), R = new Float32Array(PW * PH);
  const tx0 = VIEW_INSET.x0 + E, tx1 = W - VIEW_INSET.x1 + E, tz0 = VIEW_INSET.z0 + E, tz1 = Hh - VIEW_INSET.z1 + E;
  for (const [dx, dz] of DIRS) {
    sightShadow(H, PW, PH, dx, dz, tanP, S);
    const drop = tanP * Math.hypot(dx, dz), sd = tanP * 0.71, diag = dx !== 0 && dz !== 0;
    // R[p]: the lowest ray height at p from a spot at p or behind it (away from the camera)
    const xa = dx > 0 ? 0 : PW - 1, xb = dx > 0 ? PW : -1, xs = dx > 0 ? 1 : -1;
    const za = dz > 0 ? 0 : PH - 1, zb = dz > 0 ? PH : -1, zs = dz > 0 ? 1 : -1;
    for (let z = za; z !== zb; z += zs)
      for (let x = xa; x !== xb; x += xs) {
        const p = z * PW + x;
        const spot = x >= tx0 && x <= tx1 && z >= tz0 && z <= tz1 && S[p] <= H[p] + SEE_TOL;
        let r = spot ? H[p] + SEE_TOL : 1e9;
        const qx = x - dx, qz = z - dz;
        if (qx >= 0 && qz >= 0 && qx < PW && qz < PH) {
          let e = R[qz * PW + qx] + drop;
          if (diag) { const a = R[z * PW + qx] + sd, b = R[qz * PW + x] + sd; if (a < e) e = a; if (b < e) e = b; }
          if (e < env[p]) env[p] = e;
          if (R[qz * PW + qx] + drop < r) r = R[qz * PW + qx] + drop;
        }
        R[p] = r;
      }
  }
  return { env, PW, PH, E, at: (x, z) => { const ix = Math.floor(x) + E, iz = Math.floor(z) + E; return ix < 0 || iz < 0 || ix >= PW || iz >= PH ? 1e9 : env[iz * PW + ix]; } };
}

export class ViewGuard {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.cache = new Map();
    this.geo = null;
    this.H = null;
  }

  // only in the normal world view (not the title, rooms, the lab, scripted shots)
  active() {
    const g = this.game;
    if (!g || g.titleMode || g.overrideScene || g.classroom?.active || g.homes?.active || g.cutscene?.active) return false;
    if (g.cine?.active && g.cine.shot && g.cine.shot.kind !== 'free') return false;
    return true;
  }

  heights() {
    const W = this.world, G = W.grid, R = W.ring;
    const geo = W.terrain?.geometry || null;
    if (this.H && geo === this.geo) return this.H;
    this.geo = geo;
    this.cache.clear();
    this.soft = null;
    const E = 100, PW = G.w + 2 * E, PH = G.h + 2 * E;
    const H = new Float32Array(PW * PH);
    for (let z = 0; z < PH; z++)
      for (let x = 0; x < PW; x++) {
        const wx = x - E, wz = z - E;
        H[z * PW + x] = wx >= 0 && wz >= 0 && wx < G.w && wz < G.h ? G.height[wz * G.w + wx] : R?.heightAt ? R.heightAt(wx + 0.5, wz + 0.5) : 0;
      }
    this.H = { H, PW, PH, E };
    return this.H;
  }

  // the ground the camera looks at (the spot under the screen centre): tile heights
  // softened over 3x3 tiles, so panning over a cliff edge glides instead of jumping
  groundAt(x, z) {
    const W = this.world, G = W.grid;
    this.heights();
    if (!this.soft) {
      const s = new Float32Array(G.w * G.h);
      for (let iz = 0; iz < G.h; iz++)
        for (let ix = 0; ix < G.w; ix++) {
          let a = 0, n = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const tx = ix + dx, tz = iz + dz; if (!G.inb(tx, tz)) continue; const wgt = dx || dz ? 1 : 4; a += G.height[tz * G.w + tx] * wgt; n += wgt; }
          s[iz * G.w + ix] = Math.max(0, a / n);
        }
      this.soft = s;
    }
    const fx = Math.max(0, Math.min(G.w - 1.001, x - 0.5)), fz = Math.max(0, Math.min(G.h - 1.001, z - 0.5));
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, S = this.soft, w = G.w;
    const i1 = Math.min(ix + 1, G.w - 1), j1 = Math.min(iz + 1, G.h - 1);
    return (S[iz * w + ix] * (1 - u) + S[iz * w + i1] * u) * (1 - v) + (S[j1 * w + ix] * (1 - u) + S[j1 * w + i1] * u) * v;
  }

  grid(yi, pitch) {
    const P = this.heights();
    const key = yi * 1000 + Math.round(pitch * 50);
    let v = this.cache.get(key);
    if (v) return v;
    const G = this.world.grid, { H, PW, PH, E } = P;
    const [dx, dz] = DIRS[yi];
    const S = sightShadow(H, PW, PH, dx, dz, Math.tan(Math.max(0.2, Math.min(1.5, pitch))), new Float32Array(PW * PH));
    v = new Uint8Array(G.w * G.h);
    for (let z = 0; z < G.h; z++) for (let x = 0; x < G.w; x++) { const p = (z + E) * PW + x + E; v[z * G.w + x] = S[p] <= H[p] + SEE_TOL ? 1 : 0; }
    if (this.cache.size > 24) this.cache.clear();
    this.cache.set(key, v);
    return v;
  }

  visible(x, z, yaw, pitch) {
    const G = this.world.grid, ix = Math.floor(x), iz = Math.floor(z);
    if (!G.inb(ix, iz)) return true;
    return this.grid(yawIndex(yaw), pitch)[iz * G.w + ix] === 1;
  }

  // the closest visible tile centre within r tiles (inside bounds b, if given)
  nearest(x, z, yaw, pitch, r, b = null) {
    const G = this.world.grid, v = this.grid(yawIndex(yaw), pitch);
    const cx = Math.floor(x), cz = Math.floor(z);
    let best = null, bd = 1e9;
    for (let rr = 1; rr <= r; rr++) {
      for (let dz = -rr; dz <= rr; dz++)
        for (let dx = -rr; dx <= rr; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
          const tx = cx + dx, tz = cz + dz;
          if (!G.inb(tx, tz) || !v[tz * G.w + tx]) continue;
          const px = tx + 0.5, pz = tz + 0.5;
          if (b && (px < b.minX || px > b.maxX || pz < b.minZ || pz > b.maxZ)) continue;
          const d = Math.hypot(px - x, pz - z);
          if (d < bd) { bd = d; best = { x: px, z: pz }; }
        }
      if (best && bd <= rr) return best;
    }
    return best;
  }

  blocked() {
    try { this.game?.audio?.play?.('error', { volume: 0.3 }); } catch { /* no sound */ }
  }
}
