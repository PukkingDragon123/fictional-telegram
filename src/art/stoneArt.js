// [v20 map] Detailed pixel stone textures for mountains: granite boulders,
// layered slate, mossy rock, cracked rock, scree gravel and snow-capped rock.
// Each tile is 48x48 px, seamless (wraps), covers 2x2 world units (the same
// 24 texels per unit as the terrain atlas). Shared by the valley ranges
// (world/outerRing.js) and the in-map mountain cliffs (world/terrain.js).
import * as THREE from 'three';

export const STONE = { GRANITE: 0, SLATE: 1, MOSSY: 2, CRACKED: 3, SCREE: 4, SNOWROCK: 5, DARK: 6 };
export const STONE_N = 7;
const S = 48;

function h2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// tileable value noise (period = S)
function vnoise(x, y, cell, s) {
  const n = S / cell;
  const gx = x / cell, gy = y / cell;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (a) => ((a % n) + n) % n;
  const a = h2(w(ix), w(iy), s), b = h2(w(ix + 1), w(iy), s), c = h2(w(ix), w(iy + 1), s), d = h2(w(ix + 1), w(iy + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) { return vnoise(x, y, 16, s) * 0.5 + vnoise(x, y, 8, s + 1) * 0.3 + vnoise(x, y, 4, s + 2) * 0.2; }

// tileable Voronoi: returns { f1, f2, id }
function voronoi(x, y, G, s, squashY = 1) {
  const cs = S / G;
  const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const gx = cx + dx, gy = cy + dy;
      const wx = ((gx % G) + G) % G, wy = ((gy % G) + G) % G;
      const px = (gx + 0.15 + h2(wx, wy, s) * 0.7) * cs, py = (gy + 0.15 + h2(wx, wy, s + 9) * 0.7) * cs;
      const d = Math.hypot(x - px, (y - py) * squashY);
      if (d < f1) { f2 = f1; f1 = d; id = wy * G + wx; } else if (d < f2) f2 = d;
    }
  return { f1, f2, id };
}

const PAL = {
  granite: [0x2a2728, 0x3d3837, 0x514b48, 0x645d58, 0x787069, 0x8e857c, 0xa59b8f],
  slate: [0x232831, 0x343b46, 0x47505b, 0x5a6470, 0x6e7884, 0x8a939c, 0xa8b0b6],
  moss: [0x1f3a1c, 0x2f5126, 0x416a2e, 0x5a8638, 0x76a046],
  scree: [0x3a3430, 0x524a43, 0x6a6058, 0x837a70, 0x9c9388, 0xb8aea2],
  snow: [0xa8b8cc, 0xc8d4e2, 0xe2eaf2, 0xf6f9fc],
  dark: [0x1c1a1c, 0x2a2628, 0x3a3536, 0x4a4446, 0x5c5556, 0x6e6666],
};
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const pick = (pal, t) => rgb(pal[Math.max(0, Math.min(pal.length - 1, Math.floor(t * pal.length)))]);

// boulder field shading: each Voronoi cell is a rounded stone lit from the top-left
function boulders(x, y, G, s, squash = 1) {
  const v = voronoi(x, y, G, s, squash);
  const e = v.f2 - v.f1; // distance to the crevice
  const h = Math.min(1, e / (S / G * 0.32));
  const v2 = voronoi(x - 1, y - 1, G, s, squash);
  const h2v = Math.min(1, (v2.f2 - v2.f1) / (S / G * 0.32));
  const slope = h - h2v; // > 0: facing away from the light
  return { e, h, slope, id: v.id };
}

function tile(kind, ox, data, W) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let c;
      const n = fbm(x, y, 3 + kind * 17);
      const grain = h2(x, y, 77 + kind) - 0.5;
      if (kind === STONE.SLATE) {
        // layered strata: bands of varying thickness, each a row of long flat slabs
        const band = Math.floor((y + Math.floor(vnoise(x, 0, 16, 5) * 3)) / 6);
        const bh = h2(band, 0, 11);
        const yy = (y + Math.floor(vnoise(x, 0, 16, 5) * 3)) % 6;
        const slab = Math.floor((x + bh * 48) / (10 + Math.floor(bh * 10)));
        const sx = (x + bh * 48) % (10 + Math.floor(bh * 10));
        let t = 0.35 + bh * 0.25 + n * 0.25 + grain * 0.12 + (h2(slab, band, 3) - 0.5) * 0.15;
        if (yy === 0) t += 0.28; // lit top lip of each layer
        if (yy === 5) t = 0.06; // shadowed seam
        if (sx === 0 && yy < 5 && h2(slab, band, 8) > 0.6) t = 0.12; // the odd vertical joint
        if (h2(x, band, 13) > 0.985) t = 0.05; // chips
        c = pick(PAL.slate, t);
      } else if (kind === STONE.SCREE) {
        const b = boulders(x, y, 9, 21);
        let t = 0.3 + h2(b.id, 0, 4) * 0.4 + b.h * 0.25 - Math.max(0, b.slope) * 2.5 + Math.max(0, -b.slope) * 1.6 + grain * 0.1;
        if (b.e < 0.9) t = 0.04 + n * 0.08;
        c = pick(PAL.scree, t);
      } else {
        const G = kind === STONE.DARK ? 3 : 2; // big irregular rock faces, not cobbles
        const wx = x + (vnoise(x, y, 8, 401 + kind) - 0.5) * 9, wy = y + (vnoise(x, y, 8, 409 + kind) - 0.5) * 9;
        const b = boulders(wx, wy, G, 41 + kind * 3, kind === STONE.DARK ? 1.8 : 1.3);
        let t = 0.32 + h2(b.id, 1, 5) * 0.22 + b.h * 0.3 + n * 0.18 + grain * 0.14;
        t += Math.max(0, -b.slope) * 2.2 - Math.max(0, b.slope) * 2.6; // bevel: lit edge, shaded edge
        if (b.e < 1.1) t = 0.02 + n * 0.1; // dark crevice
        // horizontal bedding lines and fine cracks inside the stones
        if (kind !== STONE.DARK && Math.abs(((y + vnoise(x, 0, 16, 31) * 6) % 16) - 8) < 0.6 && h2(Math.floor(x / 6), Math.floor(y / 16), 33) > 0.35) t = Math.min(t, 0.14);
        // fine cracks inside the stones
        const ck = Math.abs(fbm(x * 2, y, 91 + kind) - 0.5);
        if (ck < (kind === STONE.CRACKED ? 0.03 : 0.015) && b.h > 0.25) t = Math.min(t, 0.12);
        let pal = kind === STONE.DARK ? PAL.dark : PAL.granite;
        c = pick(pal, t);
        if (kind === STONE.MOSSY) {
          // moss grows on the top of each stone and in damp patches
          const m = fbm(x, y, 55) + (1 - y / S) * 0.0 + (b.slope < 0 ? 0.12 : 0) - b.e * 0.004;
          if (m > 0.52 && b.e > 1.1) c = pick(PAL.moss, (m - 0.52) * 3 + grain * 0.3 + b.h * 0.3);
        }
        if (kind === STONE.SNOWROCK) {
          // snow settles on the upper, lit faces of each stone and in drifts
          const sn = b.h * 0.6 + (b.slope < 0 ? 0.35 : -0.2) + fbm(x, y, 66) * 0.5 - 0.15;
          if (sn > 0.5 && b.e > 1) c = pick(PAL.snow, (sn - 0.5) * 2.5 + grain * 0.2);
        }
        // the odd ore glint
        if (kind === STONE.GRANITE && h2(x, y, 303) > 0.9975 && b.e > 2) c = h2(x, y, 304) > 0.5 ? [232, 196, 92] : [120, 214, 220];
      }
      const o = (y * W + ox + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
}

let tex = null;
export function stoneTexture() {
  if (tex) return tex;
  const W = S * STONE_N;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, S);
  for (let k = 0; k < STONE_N; k++) tile(k, k * S, img.data, W);
  ctx.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
export const stoneUniform = { value: null };
export function stoneUniforms() { if (!stoneUniform.value && typeof document !== 'undefined') stoneUniform.value = stoneTexture(); return { uStone: stoneUniform }; }

// GLSL: stoneTex(variant, p) with p in world units (one tile = 2x2 units)
export const STONE_GLSL = /* glsl */ `
uniform sampler2D uStone;
vec3 stoneTex(float v, vec2 p) {
  // every 2x2 block picks its own offset / mirror of the tile: no visible repeat
  vec2 cell = floor(p / 2.0);
  vec2 rnd = fract(sin(vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)))) * 43758.5453);
  vec2 t = fract(p / 2.0 + floor(rnd * 4.0) / 4.0);
  if (rnd.x > 0.5) t.x = 1.0 - t.x;
  t = (floor(t * 48.0) + 0.5) / 48.0;
  return texture2D(uStone, vec2((v + t.x) / ${STONE_N}.0, t.y)).rgb;
}
`;
