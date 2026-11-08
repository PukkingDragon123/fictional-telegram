// [v33 paper] Tiny pixel-art toolkit for the physical UI objects (clipboard, sheets,
// stamps, pencils...). Everything is painted at ART resolution (1 canvas px = 1 art
// px) into a Pix buffer, then shown with image-rendering: pixelated at a whole number
// of CSS px per art px (artPx()), so edges stay hard at any size.
//
//   artPx()                     CSS px per art px for the physical UI (2, 3 on big screens)
//   new Pix(w, h)               .set .get .over .rect .line .outline .canvas(scale) .url()
//   hexc('#rrggbb') -> [r,g,b]  ramp(list) -> [[r,g,b]...]
//   bay(x, y)                   4x4 Bayer threshold in (0, 1)
//   noise(x, y, seed)           hash noise in [0, 1)
//   fbm(x, y, cell, seed)       smooth value noise in [0, 1)
//   rotNN(pix, deg)             nearest-neighbour rotation (pixel-art rotation, no blur)
//   showCanvas(pix, P, cls)     <canvas> of a Pix shown at P CSS px per art px
import { crispPx } from '../uiScale.js';

export function artPx() {
  const w = typeof innerWidth === 'number' ? innerWidth : 1280;
  const h = typeof innerHeight === 'number' ? innerHeight : 720;
  const k = Math.min(w / 1280, h / 720);
  return crispPx(k >= 1.45 ? 3 : 2);
}

export function hexc(h) {
  if (Array.isArray(h)) return h;
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const ramp = (list) => list.map(hexc);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
export function noise(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = noise(xi, yi, s), b = noise(xi + 1, yi, s), c = noise(xi, yi + 1, s), d = noise(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, cell = 16, s = 0) {
  return (vn(x / cell, y / cell, s) * 4 + vn((x * 2) / cell, (y * 2) / cell, s + 7) * 2 + vn((x * 4) / cell, (y * 4) / cell, s + 13)) / 7;
}
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Pix {
  constructor(w, h) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.d = new Uint8ClampedArray(this.w * this.h * 4);
  }
  i(x, y) { x |= 0; y |= 0; return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : (y * this.w + x) * 4; }
  set(x, y, c, a = 255) {
    const i = this.i(x, y);
    if (i < 0 || !c) return this;
    const d = this.d;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a;
    return this;
  }
  a(x, y) { const i = this.i(x, y); return i < 0 ? 0 : this.d[i + 3]; }
  get(x, y) { const i = this.i(x, y); return i < 0 ? null : [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  // source-over one pixel
  over(x, y, c, a) {
    const i = this.i(x, y);
    if (i < 0) return this;
    const d = this.d, da = d[i + 3] / 255, sa = a / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return this;
    for (let k = 0; k < 3; k++) d[i + k] = (c[k] * sa + d[i + k] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
    return this;
  }
  rect(x, y, w, h, c, a = 255) { for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) this.set(k, j, c, a); return this; }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  // 1px outline around every opaque pixel (4-neighbour; diag adds the 8 ring)
  outline(c, diag = false) {
    const src = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) src[y * this.w + x] = this.d[(y * this.w + x) * 4 + 3] > 0 ? 1 : 0;
    const on = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[y * this.w + x];
    const N = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      if (N.some(([dx, dy]) => on(x + dx, y + dy))) this.set(x, y, c);
    }
    return this;
  }
  blit(p, ox, oy) {
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4, a = p.d[i + 3];
      if (!a) continue;
      if (a === 255) this.set(ox + x, oy + y, [p.d[i], p.d[i + 1], p.d[i + 2]]);
      else this.over(ox + x, oy + y, [p.d[i], p.d[i + 1], p.d[i + 2]], a);
    }
    return this;
  }
  canvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    if (scale === 1) return c;
    const s = document.createElement('canvas');
    s.width = this.w * scale; s.height = this.h * scale;
    const g = s.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(c, 0, 0, s.width, s.height);
    return s;
  }
  url(scale = 1) { return this.canvas(scale).toDataURL(); }
}

// pixel-art rotation: every output pixel takes its nearest source pixel (no blending)
export function rotNN(p, deg) {
  if (!deg) return p;
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const W = Math.ceil(Math.abs(p.w * c) + Math.abs(p.h * s)) + 2, H = Math.ceil(Math.abs(p.w * s) + Math.abs(p.h * c)) + 2;
  const o = new Pix(W, H);
  const cx = p.w / 2, cy = p.h / 2, ox = W / 2, oy = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - ox, dy = y + 0.5 - oy;
    const sx = Math.floor(dx * c + dy * s + cx), sy = Math.floor(-dx * s + dy * c + cy);
    const i = p.i(sx, sy);
    if (i < 0 || !p.d[i + 3]) continue;
    const j = (y * W + x) * 4;
    o.d[j] = p.d[i]; o.d[j + 1] = p.d[i + 1]; o.d[j + 2] = p.d[i + 2]; o.d[j + 3] = p.d[i + 3];
  }
  return o;
}

// a canvas at art resolution, displayed at P CSS px per art px
export function showCanvas(p, P, cls = '') {
  const c = p.canvas(1);
  c.className = 'pc-px' + (cls ? ' ' + cls : '');
  c.style.width = p.w * P + 'px';
  c.style.height = p.h * P + 'px';
  return c;
}
