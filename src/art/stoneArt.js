// [v20 map] Detailed pixel stone textures for mountains: granite boulders,
// layered slate, mossy rock, cracked rock, scree gravel and snow-capped rock.
// Shared by the valley ranges (world/cubeMountains.js) and the in-map
// mountain cliffs (world/terrain.js).
//
// [v31 mountains] Repainted as hand-shaded cliff rock instead of round
// cobbles: every tile is 96x96 texels (4x4 world units at 24 texels per unit,
// seamless) built from angular facets. Each facet is a flat plane with its own
// tilt, lit from the top-left and quantised to a hue-shifted ramp (cool violet
// shade up to warm, sunny tan), with dark crack lines between facets, a 1 px
// lit rim along the edges that face the light, hairline fractures with a
// highlight under them, mineral specks, moss on the upward ledges and snow
// settled on the upper facets. Slate is long layered slabs, dark rock is
// columnar basalt, scree is a heap of small angular stones.
//
// GLSL: stoneTex(variant, p) with p in world units (u along the surface, v
// DOWN the surface: callers pass -y on walls). Two layers of the tile, offset
// and mirrored, are switched along an irregular noise contour, so there is no
// visible repeat and no square seam. Zoomed far out (more than ~2 texels per
// screen pixel) it reads a crisp quarter-size copy of each tile instead (4x4
// texel blocks averaged, a touch more contrast): a pixel-art "mip" that keeps
// far cliffs calm instead of a shimmer of single texels.
import * as THREE from 'three';

export const STONE = { GRANITE: 0, SLATE: 1, MOSSY: 2, CRACKED: 3, SCREE: 4, SNOWROCK: 5, DARK: 6 };
export const STONE_N = 7;
const S = 96; // texels per tile side (4 world units)
const LOD = 4, SL = S / LOD; // the far copy: 24 texels per tile (6 per unit)
const AH = S + SL; // atlas height: the tiles, then their far copies underneath

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
function fbm(x, y, s) { return vnoise(x, y, 32, s) * 0.5 + vnoise(x, y, 16, s + 1) * 0.3 + vnoise(x, y, 8, s + 2) * 0.2; }

// anisotropic tileable value noise (cells cx by cy texels; both divide S)
function vnoiseA(x, y, cx, cy, s) {
  const nx = S / cx, ny = S / cy;
  const gx = x / cx, gy = y / cy;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const wx = (a) => ((a % nx) + nx) % nx, wy = (a) => ((a % ny) + ny) % ny;
  const a = h2(wx(ix), wy(iy), s), b = h2(wx(ix + 1), wy(iy), s), c = h2(wx(ix), wy(iy + 1), s), d = h2(wx(ix + 1), wy(iy + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// tileable Voronoi (G x Gy cells across the tile): nearest / second distance + both cell ids
function voronoi(x, y, G, Gy, s, out) {
  const cw = S / G, ch = S / Gy;
  const cx = Math.floor(x / cw), cy = Math.floor(y / ch);
  let f1 = 1e9, f2 = 1e9, id = 0, id2 = 0, px1 = 0, py1 = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const gx = cx + dx, gy = cy + dy;
      const wx = ((gx % G) + G) % G, wy = ((gy % Gy) + Gy) % Gy;
      const px = (gx + 0.1 + h2(wx, wy, s) * 0.8) * cw, py = (gy + 0.1 + h2(wx, wy, s + 9) * 0.8) * ch;
      const d = Math.hypot((x - px) / cw, (y - py) / ch) * Math.min(cw, ch);
      const cid = wy * G + wx;
      if (d < f1) { f2 = f1; id2 = id; f1 = d; id = cid; px1 = px; py1 = py; } else if (d < f2) { f2 = d; id2 = cid; }
    }
  out.f1 = f1; out.f2 = f2; out.id = id; out.id2 = id2; out.px = px1; out.py = py1;
  return out;
}

const hex = (a) => a.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
// hue-shifted ramps: shade leans cool violet, light leans warm
const PAL = {
  granite: hex([0x1e1824, 0x2e2632, 0x433844, 0x5a4c52, 0x766458, 0x927e68, 0xae9a7e, 0xcab896]),
  slate: hex([0x181c2a, 0x252c3c, 0x353f50, 0x485466, 0x5e6a7a, 0x78848e, 0x949ea2, 0xb2b8b6]),
  dark: hex([0x141018, 0x201a26, 0x2e2632, 0x3c3440, 0x4e4450, 0x625662, 0x7a6e76]),
  moss: hex([0x18281c, 0x223a22, 0x2e4e28, 0x3e6630, 0x548038, 0x6e9a44]),
  scree: hex([0x241e26, 0x382e34, 0x4e4244, 0x665854, 0x806e64, 0x9a8876, 0xb6a48c, 0xd0c2a8]),
  snow: hex([0x6a7aa4, 0x8c9ec4, 0xb2c2de, 0xd6e2f2, 0xf0f6fc, 0xffffff]),
};
const pick = (pal, t) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(t * pal.length)))];

const LX = -0.55, LY = -0.62, LZ = 0.56; // light from the top-left, a bit in front
const LL = Math.hypot(LX, LY, LZ);
const _v = {}, _w = {};

// a facet's plane: tilt from the cell id, lit from the top-left
function facet(id, s) {
  const nx = (h2(id, 1, s) - 0.5) * 1.7, ny = (h2(id, 2, s) - 0.5) * 1.4 - 0.12;
  const l = Math.hypot(nx, ny, 1);
  return { lam: (nx * LX + ny * LY + LZ) / l / LL, up: -ny / l, tone: h2(id, 3, s) };
}

function rockTexel(kind, x, y) {
  const s = 41 + kind * 13;
  // domain warp: irregular, hand-cut facet edges
  const wx = x + (vnoise(x, y, 16, s + 401) - 0.5) * 12, wy = y + (vnoise(x, y, 16, s + 409) - 0.5) * 12;
  let G = 4, Gy = 3; // big cliff faces, taller than wide
  if (kind === STONE.DARK) { G = 8; Gy = 2; } // columnar basalt: tall narrow columns
  if (kind === STONE.CRACKED) { G = 6; Gy = 4; }
  if (kind === STONE.SNOWROCK || kind === STONE.MOSSY) { G = 4; Gy = 4; }
  const v = voronoi(wx, wy, G, Gy, s, _v);
  const e = v.f2 - v.f1; // distance to the edge between facets
  const v2 = voronoi(wx - 1.2, wy - 1.2, G, Gy, s, _w);
  const toLight = v2.id !== v.id; // this texel sits on the facet's top-left (lit) edge
  const F = facet(v.id, s);
  const grain = h2(x, y, 77 + kind) - 0.5;
  const n = fbm(x, y, 3 + kind * 17);
  // the facet plane: flat tone from its tilt, a slight ramp across it
  let t = 0.16 + F.lam * 0.66 + F.tone * 0.12 + (n - 0.5) * 0.12 + grain * 0.05;
  t += ((wx - v.px) * LX + (wy - v.py) * LY) * -0.0035;
  // vertical water stains down the face
  const st = vnoiseA(x, y, 4, 48, s + 77);
  if (st > 0.74) t -= 0.09; else if (st < 0.16) t += 0.05;
  // edges: a deep crack (dark line, shade under it) or a ridge where two planes meet (lit line)
  const crack = h2(Math.min(v.id, v.id2), Math.max(v.id, v.id2), s + 5) < (kind === STONE.CRACKED ? 0.75 : 0.5);
  if (crack) {
    if (e < 1.2) t = 0.02 + n * 0.05;
    else if (e < 2.3 && toLight) t = Math.max(t, 0.8 + grain * 0.1);
    else if (e < 2.6 && !toLight) t -= 0.14;
  } else if (e < 1.1 && toLight) t = Math.max(t + 0.18, 0.62);
  // hairline fractures with a highlight right under them
  const ck = Math.abs(fbm(x * 2, y * 0.8, 91 + kind) - 0.5);
  const lim = kind === STONE.CRACKED ? 0.024 : 0.011;
  if (e > 2.6 && ck < lim) t = 0.06;
  else if (e > 2.6 && Math.abs(fbm(x * 2, (y - 1) * 0.8, 91 + kind) - 0.5) < lim) t += 0.15;
  t = Math.max(0, Math.min(0.999, t));
  const pal = kind === STONE.DARK ? PAL.dark : PAL.granite;
  let c = pick(pal, t);
  const above = wy - v.py; // < 0: the upper part of the facet
  if (kind === STONE.MOSSY) {
    // moss cushions on the upper part of ledge facets and in damp clumps: lit tips, dark roots
    const m = F.up * 0.5 + h2(v.id, 4, s) * 0.3 + fbm(x, y, 55) * 0.5 - above * 0.02 + vnoise(x, y, 8, 57) * 0.16;
    if (m > 0.62 && !(crack && e < 1.2)) c = pick(PAL.moss, (m - 0.62) * 2.4 + F.lam * 0.3 + grain * 0.3 + (e < 2.3 && toLight ? 0.25 : 0));
    else if (m > 0.58 && h2(x, y, 58) > 0.55) c = pick(PAL.moss, 0.1);
  }
  if (kind === STONE.SNOWROCK) {
    // snow sits on the upper part of each facet (a drift on every ledge), whole facets in the lee
    const cap = h2(v.id, 6, s);
    const sn = F.up * 0.55 + cap * 0.45 + fbm(x, y, 66) * 0.35 - above * 0.03;
    if (sn > 0.62) {
      let q = 0.3 + (sn - 0.62) * 1.2 + F.lam * 0.45 + grain * 0.1;
      if (e < 2.3 && toLight) q = 0.99;
      if (crack && e < 1.2) q = 0.1; // a blue seam, never a black one through the snow
      c = pick(PAL.snow, q);
      if (h2(x, y, 67) > 0.993) c = [255, 255, 255];
    }
  }
  // mineral specks
  if (kind === STONE.GRANITE && e > 2.6) {
    const sp = h2(x, y, 303);
    if (sp > 0.997) c = h2(x, y, 304) > 0.5 ? [236, 206, 120] : [150, 214, 220];
    else if (sp < 0.008) c = pick(pal, t + 0.22);
  }
  return c;
}

function slateTexel(x, y) {
  // layered strata: wavy bands of varying thickness, long flat slabs, the odd joint
  const off = Math.floor(vnoiseA(x, 0, 48, 96, 5) * 14 + vnoiseA(x, 0, 12, 96, 6) * 3);
  // bands of 5..14 rows stacked down the tile (periodic: the row wraps)
  const r = (((y + off) % S) + S) % S;
  let band = 0, acc = 0, th = 8;
  for (let k = 0; k < 40; k++) { th = 5 + Math.floor(h2(k, 0, 11) * 10); if (acc + th > r) { band = k; break; } acc += th; }
  if (acc + th > S) th = S - acc; // the last band ends at the tile edge
  const yy = r - acc; // row inside the band
  const bh = h2(band, 0, 13);
  const slabW = 22 + Math.floor(bh * 30);
  const shift = Math.floor(bh * 96);
  const sx = (((x + shift) % slabW) + slabW) % slabW;
  const slab = Math.floor((x + shift) / slabW);
  const n = fbm(x, y, 7);
  const grain = h2(x, y, 78) - 0.5;
  const out = h2(band, 1, 13); // protruding (lit) or recessed (shaded) layer
  let t = 0.22 + out * 0.34 + n * 0.18 + grain * 0.07 + (h2(slab, band, 3) - 0.5) * 0.12;
  // each layer: lit top lip, a shadowed seam underneath (deeper under protruding layers)
  if (yy === 0) t = 0.8 + out * 0.15 + grain * 0.08;
  else if (yy === 1 && out > 0.4) t += 0.1;
  if (yy >= th - 1) t = 0.03;
  else if (yy === th - 2 && out > 0.55) t = 0.1;
  if (sx === 0 && yy < th - 1 && h2(slab, band, 8) > 0.6) t = 0.06; // a vertical joint
  else if (sx === 1 && yy < th - 1 && h2(slab, band, 8) > 0.6) t += 0.14;
  const st = vnoiseA(x, y, 4, 48, 97);
  if (st > 0.76) t -= 0.08;
  if (h2(x, band, 14) > 0.985) t = 0.05; // chips
  return pick(PAL.slate, Math.max(0, Math.min(0.999, t)));
}

function screeTexel(x, y) {
  // a heap of small angular stones, each a lit / shaded facet, dark gaps
  const wx = x + (vnoise(x, y, 8, 21) - 0.5) * 4, wy = y + (vnoise(x, y, 8, 23) - 0.5) * 4;
  const v = voronoi(wx, wy, 16, 16, 21, _v);
  const e = v.f2 - v.f1;
  const v2 = voronoi(wx - 1, wy - 1, 16, 16, 21, _w);
  const F = facet(v.id, 21);
  const grain = h2(x, y, 79) - 0.5;
  let t = 0.26 + F.lam * 0.5 + F.tone * 0.16 + grain * 0.08;
  if (e < 0.9) t = 0.03 + fbm(x, y, 22) * 0.06;
  else if (e < 1.8 && v2.id !== v.id) t = Math.max(t, 0.85);
  else if (e < 1.9) t -= 0.12;
  return pick(PAL.scree, Math.max(0, Math.min(0.999, t)));
}

function tile(kind, ox, data, W) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const c = kind === STONE.SLATE ? slateTexel(x, y) : kind === STONE.SCREE ? screeTexel(x, y) : rockTexel(kind, x, y);
      const o = (y * W + ox + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
}

let tex = null;
export function stoneTexture() {
  if (tex) return tex;
  const W = S * STONE_N;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = AH;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, AH);
  for (let k = 0; k < STONE_N; k++) tile(k, k * S, img.data, W);
  // far copies: 4x4 blocks averaged, contrast pushed back up a little
  const d = img.data;
  for (let k = 0; k < STONE_N; k++)
    for (let y = 0; y < SL; y++)
      for (let x = 0; x < SL; x++) {
        let r = 0, g = 0, b = 0;
        for (let j = 0; j < LOD; j++) for (let i = 0; i < LOD; i++) { const o = ((y * LOD + j) * W + k * S + x * LOD + i) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; }
        const n = LOD * LOD;
        r /= n; g /= n; b /= n;
        const l = (r + g + b) / 3;
        const o = ((S + y) * W + k * S + x) * 4;
        d[o] = Math.max(0, Math.min(255, l + (r - l) * 1.15 + (l - 110) * 0.25));
        d[o + 1] = Math.max(0, Math.min(255, l + (g - l) * 1.15 + (l - 110) * 0.25));
        d[o + 2] = Math.max(0, Math.min(255, l + (b - l) * 1.15 + (l - 110) * 0.25));
        d[o + 3] = 255;
      }
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

// GLSL: stoneTex(variant, p) with p in world units (24 texels per unit, one tile = 4x4 units)
export const STONE_GLSL = /* glsl */ `
uniform sampler2D uStone;
float stH(vec2 p) { p = fract(p * vec2(213.17, 371.91)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
float stVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(stH(i), stH(i + vec2(1.0, 0.0)), f.x), mix(stH(i + vec2(0.0, 1.0)), stH(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 stoneRaw(float v, vec2 tx) {
  vec2 t = (mod(floor(tx), ${S}.0) + 0.5) / ${S}.0;
  return texture2D(uStone, vec2((v + t.x) / ${STONE_N}.0, t.y * ${S}.0 / ${AH}.0)).rgb;
}
vec3 stoneRawFar(float v, vec2 tx) {
  vec2 t = (mod(floor(tx), ${SL}.0) + 0.5) / ${SL}.0;
  return texture2D(uStone, vec2((v + t.x * ${SL / S}) / ${STONE_N}.0, (${S}.0 + t.y * ${SL}.0) / ${AH}.0)).rgb;
}
vec3 stoneTex(float v, vec2 p) {
  vec2 dd = fwidth(p) * 24.0;
  float fw = max(dd.x, dd.y); // texels per screen pixel
  // two offset / mirrored layers, switched along an irregular contour
  float m = stVN(p * 0.21 + 3.7) * 0.7 + stVN(p * 0.57 + 9.1) * 0.3;
  vec2 q = m > 0.5 ? vec2(-p.x + 1.5, p.y + 2.5) : p;
  if (fw > 2.2) return stoneRawFar(v, floor(q * ${24 / LOD}.0));
  return stoneRaw(v, floor(q * 24.0));
}
`;
