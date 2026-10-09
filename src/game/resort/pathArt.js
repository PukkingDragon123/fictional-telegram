// [v26 resort] Ground textures for the Path tool's gravel and stone-slab paths
// (the dirt path uses the terrain atlas 'trail' tile, so it matches the mountain
// trail). Same format as src/art/paintArt.js: 48x48 texels per texture (2x2 world
// tiles at 24 texels per unit), seamless in both directions, gentle contrast
// because the engine lights the ground.
//
// buildPathAtlas() renders once and caches: a 96x48 canvas, PATH_TEX order.
export const PATH_TEX = ['gravel', 'stone'];
const T = 48;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (v) => ((v % T) + T) % T;
function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const hx = (s) => parseInt(s.replace('#', ''), 16);
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mixc = (a, b, t) => { const A = rgb(a), B = rgb(b); return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function vnoise(x, y, cells, seed) {
  const f = cells / T, gx = x * f, gy = y * f, x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i, j) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx, b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

class Tex {
  constructor() { this.c = new Int32Array(T * T); }
  get(x, y) { return this.c[wrap(y) * T + wrap(x)]; }
  set(x, y, c) { this.c[wrap(Math.floor(y)) * T + wrap(Math.floor(x))] = c; }
}

// fine gravel: a dithered pale base, then hundreds of 2-3 px pebbles with a lit
// top-left texel and a shadow texel at the bottom right
function gravel() {
  const t = new Tex();
  const BASE = ['#9a8e7e', '#aa9e8c', '#b8ad9a', '#c6bba8'].map(hx);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = vnoise(x, y, 6, 11) * 0.6 + vnoise(x, y, 12, 12) * 0.4 + bayer(x, y) * 0.35;
    t.set(x, y, BASE[clamp(Math.floor(n * BASE.length), 0, BASE.length - 1)]);
  }
  const PEB = ['#d8d0c0', '#c8bca8', '#a89a88', '#8e8478', '#b8a890', '#e0d8c8', '#9c9488', '#c0b098'].map(hx);
  let s = 1;
  for (let k = 0; k < 230; k++) {
    const x = Math.floor(hash(k, 1, 31) * T), y = Math.floor(hash(k, 2, 31) * T);
    const col = PEB[Math.floor(hash(k, 3, 31) * PEB.length)];
    const big = hash(k, 4, 31) < 0.35;
    const cells = big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : hash(k, 5, 31) < 0.5 ? [[0, 0], [1, 0]] : [[0, 0], [0, 1]];
    for (const [dx, dy] of cells) t.set(x + dx, y + dy, col);
    t.set(x, y, mixc(col, 0xffffff, 0.22));
    const [ex, ey] = cells[cells.length - 1];
    t.set(x + ex + 1, y + ey + 1, mixc(col, 0x3a3028, 0.45));
    s++;
  }
  // a few blades of grass sneaking through
  for (let k = 0; k < 9; k++) {
    const x = Math.floor(hash(k, 7, 41) * T), y = Math.floor(hash(k, 8, 41) * T);
    t.set(x, y, 0x6a9a3a); t.set(x, y - 1, 0x7aaa44);
  }
  return t;
}

// flagstones: a wrapped Voronoi of irregular slabs (8 per texture side-ish), dark
// grassy joints, each slab its own tone, worn lighter on the top-left edge
function stone() {
  const t = new Tex();
  const N = 11;
  const pts = [];
  for (let k = 0; k < N; k++) pts.push([hash(k, 1, 77) * T, hash(k, 2, 77) * T, k]);
  // add a jittered grid so slabs are evenly sized
  for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) pts.push([(gx + 0.25 + hash(gx, gy, 78) * 0.5) * 16, (gy + 0.25 + hash(gx, gy, 79) * 0.5) * 16, 100 + gy * 3 + gx]);
  const SL = ['#a8a296', '#b4ae9e', '#9c968c', '#bcb4a2', '#a49c8e', '#aeaa9c'].map(hx);
  const JOINT = [0x5a6a3a, 0x4a5a32, 0x6a5a42];
  const near = (x, y) => {
    let d1 = 1e9, d2 = 1e9, id = 0;
    for (const [px, py, k] of pts) {
      for (let oy = -T; oy <= T; oy += T) for (let ox = -T; ox <= T; ox += T) {
        const dx = (x + 0.5) - (px + ox), dy = (y + 0.5) - (py + oy);
        const d = Math.abs(dx) * 1.0 + Math.abs(dy) * 1.15 + Math.hypot(dx, dy) * 0.4; // squarish cells
        if (d < d1) { d2 = d1; d1 = d; id = k; } else if (d < d2) d2 = d;
      }
    }
    return { d: d2 - d1, id };
  };
  const ids = new Int32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const { d, id } = near(x, y);
    ids[y * T + x] = id;
    if (d < 1.6) { t.set(x, y, JOINT[Math.floor(hash(x, y, 5) * JOINT.length)]); continue; }
    const base = SL[id % SL.length];
    const n = vnoise(x, y, 12, 90 + id) * 0.5 + bayer(x, y) * 0.3;
    let c = mixc(base, n > 0.4 ? 0xd8d0c0 : 0x7a746a, Math.abs(n - 0.4) * 0.35);
    if (hash(x, y, id) < 0.04) c = mixc(c, 0x5a544a, 0.4); // pits
    t.set(x, y, c);
  }
  // lit top-left rims, shaded bottom-right rims
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const id = ids[wrap(y) * T + wrap(x)];
    if (JOINT.includes(t.get(x, y))) continue;
    const up = ids[wrap(y - 1) * T + wrap(x)], lf = ids[wrap(y) * T + wrap(x - 1)];
    const dn = ids[wrap(y + 1) * T + wrap(x)], rt = ids[wrap(y) * T + wrap(x + 1)];
    if (JOINT.includes(t.get(x, y - 1)) || JOINT.includes(t.get(x - 1, y)) || up !== id || lf !== id) t.set(x, y, mixc(t.get(x, y), 0xf0e8d8, 0.3));
    else if (JOINT.includes(t.get(x, y + 1)) || JOINT.includes(t.get(x + 1, y)) || dn !== id || rt !== id) t.set(x, y, mixc(t.get(x, y), 0x3a362e, 0.25));
  }
  return t;
}

let cache = null;
export function buildPathAtlas() {
  if (cache) return cache;
  const cv = document.createElement('canvas');
  cv.width = T * PATH_TEX.length; cv.height = T;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  const texs = [gravel(), stone()];
  texs.forEach((tx, k) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const c = tx.c[y * T + x], o = (y * cv.width + k * T + x) * 4;
      img.data[o] = (c >> 16) & 255; img.data[o + 1] = (c >> 8) & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
    }
  });
  ctx.putImageData(img, 0, 0);
  const tiles = {};
  PATH_TEX.forEach((n, k) => { tiles[n] = { x: k * T, y: 0, w: T, h: T }; });
  cache = { canvas: cv, tiles };
  return cache;
}

// small swatch for the Path tool panel: boardwalk planks over water
export function boardSwatch() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 24;
  const c = cv.getContext('2d');
  c.fillStyle = '#3a8cbc'; c.fillRect(0, 0, 24, 24);
  c.fillStyle = '#62b4d8'; for (let k = 0; k < 6; k++) c.fillRect((k * 7) % 22, 2 + k * 4, 3, 1);
  for (let k = 0; k < 4; k++) {
    const y = 3 + k * 5;
    c.fillStyle = k % 2 ? '#c28a4c' : '#dcaa6a'; c.fillRect(2, y, 20, 4);
    c.fillStyle = '#7c4c26'; c.fillRect(2, y + 3, 20, 1); c.fillRect(5, y + 1, 1, 1); c.fillRect(17, y + 1, 1, 1);
  }
  c.fillStyle = '#55331a'; c.fillRect(2, 0, 2, 24); c.fillRect(20, 0, 2, 24);
  return cv;
}
