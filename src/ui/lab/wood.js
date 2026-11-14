// [v33 lab4] High-resolution pixel-art chrome for the research computer (src/ui/LabTree.js):
// carved walnut and oak with real grain, knots, bevels and worn edges, dark inlay grooves,
// brass corner plates, hinges and slotted screws, aged parchment, enamel wells and the
// app plaques. Painted at 1 art px per CSS px (the page scales by whole steps), with
// ordered dithering between the shades of each ramp: no smooth gradients, no blur.
// Everything is painted once into CPU canvases and cached by size.

const CACHE = new Map();
function cached(key, make) {
  let c = CACHE.get(key);
  if (c) return c;
  if (CACHE.size > 120) CACHE.clear();
  c = make();
  CACHE.set(key, c);
  return c;
}
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// ---------------------------------------------------------------- noise + dither
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function h2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const hex = (c) => { const n = parseInt(String(c).slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const H = (c) => (typeof c === 'string' ? hex(c) : c);
export function shadeOf(c, k) { const a = H(c); return k >= 0 ? a.map((v) => Math.round(v + (255 - v) * k)) : a.map((v) => Math.round(v * (1 + k))); }
export function rampOf(c, n = 6, lo = -0.55, hi = 0.35) { return Array.from({ length: n }, (_, i) => shadeOf(c, lo + ((hi - lo) * i) / (n - 1))); }
const grey = (a, k) => { const g = (a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11); return a.map((v) => Math.round(v + (g - v) * k)); };

// ---------------------------------------------------------------- palettes
export const WALNUT = ['#1e1008', '#2c170b', '#3a1f10', '#4a2914', '#5b331a', '#6d3f21', '#80502b', '#956236'].map(hex);
export const OAK = ['#3e2410', '#553218', '#6c4220', '#83532a', '#9a6534', '#b07840', '#c48c50', '#d8a366'].map(hex);
export const CEDAR = ['#3a1a10', '#52261a', '#6a3422', '#82432a', '#9a5434', '#b06640', '#c47a50', '#d89264'].map(hex);
export const ASH = ['#3c3428', '#524636', '#685a46', '#7e6e56', '#948468', '#aa9a7c', '#c0b092', '#d4c6aa'].map(hex);
export const BRASS = ['#3a2404', '#5e3c0a', '#875a14', '#b07c22', '#d4a036', '#ecc458', '#fde08a', '#fff4c8'].map(hex);
export const IRON = ['#16181c', '#24272d', '#33373f', '#444a54', '#59606b', '#717884', '#8c939e', '#aab0ba'].map(hex);
export const PAPER = ['#b89a6a', '#cdb184', '#dcc499', '#e8d4ad', '#f0e0bd', '#f6eacc', '#fbf2da'].map(hex);
export const INK = [26, 14, 6];

// ---------------------------------------------------------------- the pixel buffer
class Buf {
  constructor(w, h) { this.w = w; this.h = h; this.c = canvas(w, h); this.x = this.c.getContext('2d', { willReadFrequently: true }); this.img = this.x.createImageData(w, h); this.d = this.img.data; }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((y | 0) * this.w + (x | 0)) * 4, d = this.d;
    if (a >= 255) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; return; }
    const k = a / 255;
    d[i] = d[i] + (c[0] - d[i]) * k; d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * k; d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * k; d[i + 3] = Math.max(d[i + 3], a);
  }
  get(x, y) { const i = ((y | 0) * this.w + (x | 0)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  rect(x, y, w, h, c, a) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); }
  clear(x, y, w, h) { for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) { const k = (j * this.w + i) * 4; this.d[k + 3] = 0; } }
  // lighten / darken an existing pixel by a fraction (keeps the grain under bevels)
  tone(x, y, k) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((y | 0) * this.w + (x | 0)) * 4, d = this.d;
    if (!d[i + 3]) return;
    for (let q = 0; q < 3; q++) d[i + q] = k >= 0 ? d[i + q] + (255 - d[i + q]) * k : d[i + q] * (1 + k);
  }
  done() { this.x.putImageData(this.img, 0, 0); return this.c; }
}

// ---------------------------------------------------------------- wood grain
// u = along the grain, v = across it. Rings wander (warped sine), fine streaks and pores,
// a few knots with rings bending round them; shades picked from the ramp with a 4x4 dither.
function woodVal(u, v, s, knots) {
  const warp = vn(u * 0.012, v * 0.05, s) * 7 + vn(u * 0.045, v * 0.2, s + 7) * 1.6;
  let vv = v + warp * 3.2;
  let kk = 0;
  for (const k of knots) {
    const du = (u - k.u) / k.r, dv = (v - k.v) / (k.r * 0.55);
    const d = Math.sqrt(du * du + dv * dv);
    if (d < 4) { vv += (k.v > v ? -1 : 1) * Math.max(0, 4 - d) * k.r * 0.35; if (d < 1) kk = Math.max(kk, 1 - d); }
  }
  const ring = 0.5 + 0.5 * Math.sin(vv * 0.62);
  const late = Math.pow(ring, 3);
  const streak = vn(u * 0.25, v * 1.7, s + 3);
  const pore = h2(u | 0, v | 0, s) < 0.035 ? -0.18 : 0;
  let val = 0.62 - late * 0.32 + (streak - 0.5) * 0.22 + pore + (vn(u * 0.006, v * 0.02, s + 11) - 0.5) * 0.25;
  if (kk > 0) val = val * (1 - kk) + (0.12 + 0.15 * Math.sin(kk * 14)) * kk;
  return val;
}
function knotsFor(len, wid, s, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ u: h2(i, 1, s) * len, v: h2(i, 2, s) * wid, r: 2.2 + h2(i, 3, s) * 3.2 });
  return out;
}
// fill a rect with grain running horizontally (dir 'h') or vertically ('v')
function woodRect(B, x0, y0, w, h, ramp, s, dir = 'h', lift = 0) {
  const n = ramp.length;
  const knots = knotsFor(dir === 'h' ? w : h, dir === 'h' ? h : w, s, Math.max(0, Math.round((w * h) / 9000)));
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const u = dir === 'h' ? x - x0 : y - y0, v = dir === 'h' ? y - y0 : x - x0;
    let val = woodVal(u, v, s, knots) + lift;
    const i = Math.max(0, Math.min(n - 1, Math.floor(val * n + bay(x, y))));
    B.set(x, y, ramp[i]);
  }
}

// bevel a rect: light catches the top / left, shadow on the bottom / right (in px steps)
function bevel(B, x, y, w, h, depth = 2, k = 0.28) {
  for (let d = 0; d < depth; d++) {
    const a = k * (1 - d / depth);
    for (let i = x + d; i < x + w - d; i++) { B.tone(i, y + d, a); B.tone(i, y + h - 1 - d, -a * 1.1); }
    for (let j = y + d; j < y + h - d; j++) { B.tone(x + d, j, a * 0.8); B.tone(x + w - 1 - d, j, -a); }
  }
}
function outline(B, x, y, w, h, c = INK) {
  for (let i = x; i < x + w; i++) { B.set(i, y, c); B.set(i, y + h - 1, c); }
  for (let j = y; j < y + h; j++) { B.set(x, j, c); B.set(x + w - 1, j, c); }
}
// a carved groove (inlay line) around a rect: dark line, a light lip under it
function groove(B, x, y, w, h) {
  for (let i = x; i < x + w; i++) { B.tone(i, y, -0.5); B.tone(i, y + 1, 0.18); B.tone(i, y + h - 1, 0.18); B.tone(i, y + h - 2, -0.5); }
  for (let j = y; j < y + h; j++) { B.tone(x, j, -0.5); B.tone(x + 1, j, 0.15); B.tone(x + w - 1, j, 0.15); B.tone(x + w - 2, j, -0.5); }
}
// worn edges: a few lighter, scuffed pixels along a rect's rim
function wear(B, x, y, w, h, s, k = 0.06) {
  for (let i = x; i < x + w; i++) for (const j of [y + 1, y + h - 2]) if (h2(i, j, s) < k) B.tone(i, j, 0.3);
  for (let j = y; j < y + h; j++) for (const i of [x + 1, x + w - 2]) if (h2(i, j, s + 1) < k) B.tone(i, j, 0.3);
}

// ---------------------------------------------------------------- brass
// slotted screw head, 5x5
export function screw(B, x, y, s = 0) {
  const R = BRASS;
  const px = [[1, 0], [2, 0], [3, 0], [0, 1], [4, 1], [0, 2], [4, 2], [0, 3], [4, 3], [1, 4], [2, 4], [3, 4]];
  for (const [i, j] of px) B.set(x + i, y + j, INK);
  for (let j = 1; j < 4; j++) for (let i = 1; i < 4; i++) B.set(x + i, y + j, R[i + j < 4 ? 6 : i + j < 5 ? 5 : 3]);
  if (s & 1) { B.set(x + 1, y + 3, R[1]); B.set(x + 2, y + 2, R[1]); B.set(x + 3, y + 1, R[1]); }
  else { B.set(x + 1, y + 2, R[1]); B.set(x + 2, y + 2, R[1]); B.set(x + 3, y + 2, R[1]); }
  B.set(x + 1, y + 1, R[7]);
}
// an L-shaped brass corner plate with two screws; corner = 'tl' | 'tr' | 'bl' | 'br'
export function cornerPlate(B, x, y, corner, n = 15, t = 6) {
  const fx = corner[1] === 'r', fy = corner[0] === 'b';
  const P = (i, j, c) => B.set(fx ? x + n - 1 - i : x + i, fy ? y + n - 1 - j : y + j, c);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (i >= t && j >= t) continue;
    const edge = i === 0 || j === 0 || (i === n - 1 && j < t) || (j === n - 1 && i < t) || (i === t - 1 && j >= t) || (j === t - 1 && i >= t);
    if (edge) { P(i, j, INK); continue; }
    const lit = (fx ? n - i : i) + (fy ? n - j : j);
    const k = Math.max(0, Math.min(7, Math.floor(6.6 - lit * 0.22 + bay(i, j) * 1.2)));
    P(i, j, BRASS[k]);
  }
  // engraved line + screws
  for (let i = 2; i < n - 2; i++) P(i, t - 3, BRASS[2]);
  const sx = fx ? x + n - 6 : x + 1, sy = fy ? y + n - 6 : y + 1;
  screw(B, sx, sy, 1);
  screw(B, fx ? x + 1 + 0 : x + n - 6, fy ? y + n - 6 : y + 1, 0);
}
function hinge(B, x, y, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < 6; i++) {
    const e = i === 0 || i === 5 || j === 0 || j === h - 1;
    B.set(x + i, y + j, e ? INK : BRASS[i < 2 ? 6 : i < 4 ? 4 : 2]);
  }
  for (let j = 3; j < h - 3; j += 4) B.set(x + 2, y + j, BRASS[1]);
}

// ---------------------------------------------------------------- panels
// a framed wooden board (taskbar, title bars, plates): planks, bevel, groove, screws, wear
export function plank(w, h, { ramp = OAK, seed = 1, screws = true, grooveIn = 3 } = {}) {
  return cached(`plank|${w}x${h}|${seed}|${ramp[3]}|${screws}|${grooveIn}`, () => {
    const B = new Buf(w, h);
    woodRect(B, 0, 0, w, h, ramp, seed, 'h');
    // board seams every so often
    for (let x = 160 + (seed % 7) * 20; x < w - 20; x += 190 + (seed % 5) * 23) for (let y = 1; y < h - 1; y++) { B.tone(x, y, -0.55); B.tone(x + 1, y, 0.12); }
    bevel(B, 0, 0, w, h, 2, 0.3);
    if (grooveIn && h > 14) groove(B, grooveIn, grooveIn, w - grooveIn * 2, h - grooveIn * 2);
    wear(B, 0, 0, w, h, seed);
    outline(B, 0, 0, w, h);
    if (screws && h >= 14) { const sy = Math.round(h / 2) - 2; screw(B, 4, sy, seed); screw(B, w - 9, sy, seed + 1); }
    return B.done();
  });
}

// a picture-frame ring of wood around a hole (mitered corners), with a dark lip and brass
// bead inside, brass corner plates outside; the hole stays transparent
export function frame(w, h, { t = 14, ramp = WALNUT, seed = 3, plates = true, lip = true, top = 0 } = {}) {
  return cached(`frame|${w}x${h}|${t}|${ramp[3]}|${seed}|${plates}|${lip}|${top}`, () => {
    const B = new Buf(w, h);
    const T = t, TT = top || t; // the top rail can be taller (a title bar)
    // rails: top/bottom horizontal grain, sides vertical; miters on the diagonals
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inTop = y < TT, inBot = y >= h - T, inL = x < T, inR = x >= w - T;
      if (!(inTop || inBot || inL || inR)) continue;
      let side;
      if (inTop && inL) side = x * TT > y * T ? 't' : 'l';
      else if (inTop && inR) side = (w - 1 - x) * TT > y * T ? 't' : 'r';
      else if (inBot && inL) side = x > (h - 1 - y) ? 'b' : 'l';
      else if (inBot && inR) side = (w - 1 - x) > (h - 1 - y) ? 'b' : 'r';
      else side = inTop ? 't' : inBot ? 'b' : inL ? 'l' : 'r';
      const s = seed + { t: 0, b: 17, l: 31, r: 47 }[side];
      const hor = side === 't' || side === 'b';
      const u = hor ? x : y, v = hor ? (side === 't' ? y : h - 1 - y) : (side === 'l' ? x : w - 1 - x);
      const val = woodVal(u, v * 1.0 + s * 3, s, []) + (side === 't' || side === 'l' ? 0.06 : -0.06);
      const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(val * ramp.length + bay(x, y))));
      B.set(x, y, ramp[i]);
    }
    // miter seams
    for (let k = 0; k < Math.min(T, TT); k++) {
      const yk = Math.round((k * TT) / T);
      B.tone(k, yk, -0.45); B.tone(w - 1 - k, yk, -0.45); B.tone(k, h - 1 - k, -0.45); B.tone(w - 1 - k, h - 1 - k, -0.45);
    }
    // outer bevel + inner reverse bevel (light on the bottom/right of the opening)
    bevel(B, 0, 0, w, h, 3, 0.3);
    for (let d = 0; d < 2; d++) {
      const a = 0.3 * (1 - d / 2);
      for (let i = T - 1 - d; i <= w - T + d; i++) { B.tone(i, TT - 1 - d, -a); B.tone(i, h - T + d, a); }
      for (let j = TT - 1 - d; j <= h - T + d; j++) { B.tone(T - 1 - d, j, -a); B.tone(w - T + d, j, a * 0.8); }
    }
    if (T >= 10) groove(B, 4, 4, w - 8, h - 8);
    wear(B, 0, 0, w, h, seed, 0.05);
    outline(B, 0, 0, w, h);
    B.clear(T, TT, w - T * 2, h - TT - T);
    if (lip) { // a dark lip and a brass bead round the opening
      for (let i = T - 2; i < w - T + 2; i++) { B.set(i, TT - 1, INK); B.set(i, h - T, INK); }
      for (let j = TT - 1; j < h - T + 1; j++) { B.set(T - 1, j, INK); B.set(w - T, j, INK); }
      for (let i = T - 3; i < w - T + 3; i++) { B.set(i, TT - 2, BRASS[3]); B.set(i, h - T + 1, BRASS[5]); }
      for (let j = TT - 2; j < h - T + 2; j++) { B.set(T - 2, j, BRASS[3]); B.set(w - T + 1, j, BRASS[5]); }
    }
    if (plates && T >= 9) {
      const n = Math.min(17, T + 4);
      cornerPlate(B, 0, 0, 'tl', n, Math.max(5, Math.round(n * 0.4)));
      cornerPlate(B, w - n, 0, 'tr', n, Math.max(5, Math.round(n * 0.4)));
      cornerPlate(B, 0, h - n, 'bl', n, Math.max(5, Math.round(n * 0.4)));
      cornerPlate(B, w - n, h - n, 'br', n, Math.max(5, Math.round(n * 0.4)));
    }
    if (T >= 10 && h > 120) { hinge(B, 0, Math.round(h * 0.28), 22); hinge(B, 0, Math.round(h * 0.68), 22); }
    return B.done();
  });
}

// aged parchment: fibres, mottling, a darker dithered rim, a couple of tea stains
export function paper(w, h, seed = 5) {
  return cached(`paper|${w}x${h}|${seed}`, () => {
    const B = new Buf(w, h), n = PAPER.length;
    const stains = [0, 1].map((i) => ({ x: h2(i, 9, seed) * w, y: h2(i, 8, seed) * h, r: 12 + h2(i, 7, seed) * 18 }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      let v = 0.78 + (vn(x * 0.05, y * 0.05, seed) - 0.5) * 0.18 + (vn(x * 0.4, y * 0.08, seed + 2) - 0.5) * 0.12;
      if (edge < 7) v -= (7 - edge) * 0.045;
      for (const s of stains) { const d = Math.hypot(x - s.x, y - s.y) / s.r; if (d < 1) v -= d > 0.85 ? 0.12 : 0.04; }
      if (h2(x, y, seed + 5) < 0.012) v -= 0.15;
      B.set(x, y, PAPER[Math.max(0, Math.min(n - 1, Math.floor(v * n + bay(x, y))))]);
    }
    return B.done();
  });
}

// ---------------------------------------------------------------- app plaques (the desktop icons)
// S x S: an oak frame with mitered corners, a dark lip, an enamel well in the topic colour
// (a lit-from-top-left ramp, dithered), brass corner plates; the emblem is carved in:
// a dark recess under it, a light rim above, then the art itself.
export function plaque(S, color, emblem, { seed = 1, locked = false, ramp = OAK } = {}) {
  const key = `plaque|${S}|${color}|${locked}|${seed}|${emblem ? emblem.width + 'x' + emblem.height + (emblem._k || '') : 0}`;
  return cached(key, () => {
    const R = locked ? ramp.map((c) => grey(c, 0.35).map((v) => Math.round(v * 0.88))) : ramp;
    const fr = frame(S, S, { t: Math.round(S * 0.11), ramp: R, seed, plates: true, lip: true });
    const B = new Buf(S, S);
    const t = Math.round(S * 0.11);
    // enamel well
    const base = locked ? grey(H(color), 0.55).map((v) => Math.round(v * 0.62)) : H(color);
    const E = [-0.6, -0.45, -0.3, -0.15, 0, 0.18, 0.35].map((k) => shadeOf(base, k));
    const x0 = t, y0 = t, w = S - t * 2;
    for (let y = y0; y < y0 + w; y++) for (let x = x0; x < x0 + w; x++) {
      const dx = (x - x0) / w - 0.38, dy = (y - y0) / w - 0.3;
      let v = 0.86 - Math.sqrt(dx * dx + dy * dy) * 0.95 + (vn(x * 0.15, y * 0.15, seed + 4) - 0.5) * 0.08;
      if (x - x0 < 3 || y - y0 < 3) v -= (3 - Math.min(x - x0, y - y0)) * 0.12; // the lip's shadow
      B.set(x, y, E[Math.max(0, Math.min(E.length - 1, Math.floor(v * E.length + bay(x, y))))]);
    }
    // a fine engraved border inside the well
    const g = Math.round(S * 0.05);
    for (let i = x0 + g; i < x0 + w - g; i++) { B.tone(i, y0 + g, -0.35); B.tone(i, y0 + g + 1, 0.2); B.tone(i, y0 + w - g - 1, 0.2); B.tone(i, y0 + w - g - 2, -0.35); }
    for (let j = y0 + g; j < y0 + w - g; j++) { B.tone(x0 + g, j, -0.35); B.tone(x0 + g + 1, j, 0.2); B.tone(x0 + w - g - 1, j, 0.2); B.tone(x0 + w - g - 2, j, -0.35); }
    const c = B.done();
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = false;
    if (emblem) {
      const k = emblem._k || 1;
      const ew = emblem.width * k, eh = emblem.height * k;
      const ex = Math.round((S - ew) / 2), ey = Math.round((S - eh) / 2) - 1;
      const sil = (col, a) => { const s = canvas(ew, eh), sx = s.getContext('2d', { willReadFrequently: true }); sx.imageSmoothingEnabled = false; sx.drawImage(emblem, 0, 0, ew, eh); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = col; sx.globalAlpha = a; sx.fillRect(0, 0, ew, eh); return s; };
      const dark = `rgb(${E[0].join(',')})`, lite = `rgb(${E[6].join(',')})`;
      x.drawImage(sil(dark, 1), ex + 2, ey + 2);
      x.drawImage(sil(dark, 1), ex + 1, ey + 2);
      x.drawImage(sil(lite, 1), ex - 1, ey - 1);
      if (locked) { // the emblem stays, dulled: desaturated and dimmed under old varnish
        const d = canvas(ew, eh), dx = d.getContext('2d', { willReadFrequently: true });
        dx.imageSmoothingEnabled = false;
        dx.filter = 'grayscale(0.7) brightness(0.62)';
        dx.drawImage(emblem, 0, 0, ew, eh);
        x.drawImage(d, ex, ey);
      } else x.drawImage(emblem, ex, ey, ew, eh);
    }
    // a lacquer glint along the top-left of the well
    x.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < Math.round(w * 0.45); i++) if (i % 3 !== 2) x.fillRect(x0 + 3 + i, y0 + 3, 1, 1);
    for (let j = 0; j < Math.round(w * 0.3); j++) if (j % 3 !== 2) x.fillRect(x0 + 3, y0 + 3 + j, 1, 1);
    x.drawImage(fr, 0, 0);
    return c;
  });
}

// ---------------------------------------------------------------- project tiles (inside an app)
// 'frame': a small carved frame with a parchment well; 'port': a riveted brass porthole.
// The state is a little enamel jewel set in the top rail.
const JEWEL = { avail: '#4fcf6a', run: '#4aa8f0', done: '#f2c030', zone: '#f08a2a', locked: '#6a6662', sealed: '#6a6662' };
export function tile(S, shape, st, { ramp = OAK, seed = 2 } = {}) {
  return cached(`tile|${S}|${shape}|${st}|${ramp[3]}|${seed}`, () => {
    const dark = st === 'locked' || st === 'sealed';
    let c;
    if (shape === 'port') {
      const B = new Buf(S, S + 3), m = (S - 1) / 2, r0 = S / 2;
      const MET = dark ? IRON : BRASS;
      // shadow
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.hypot(x - m - 2, y - m - 3) < r0) B.set(x, y + 0, [26, 14, 6], 90);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - m, dy = y - m, d = Math.hypot(dx, dy);
        if (d >= r0) continue;
        if (d > r0 - 1.3) { B.set(x, y, INK); continue; }
        const ring = r0 * 0.22;
        if (d > r0 - ring) {
          const lit = (-dx - dy) / (r0 * 1.4) + 0.5 - (d - (r0 - ring)) / ring * 0.15;
          B.set(x, y, MET[Math.max(0, Math.min(7, Math.floor(lit * 7 + 1 + bay(x, y))))]);
          continue;
        }
        if (d > r0 - ring - 1.2) { B.set(x, y, INK); continue; }
        // the glass: see-through (portWater() paints the animated pond under it); an inner
        // shadow along the top-left of the opening keeps the ring reading as thick brass
        const inner = r0 - ring - 1.2;
        if (d > inner - 2 && (dx + dy) < 0) B.set(x, y, [10, 6, 2], 120);
      }
      // rivets round the ring
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.39, rx = Math.round(m + Math.cos(a) * (r0 - r0 * 0.11)), ry = Math.round(m + Math.sin(a) * (r0 - r0 * 0.11));
        B.set(rx, ry, INK); B.set(rx - 1, ry - 1, MET[7]); B.set(rx - 1, ry, MET[5]); B.set(rx, ry - 1, MET[5]);
      }
      if (!dark) { // glass glints
        const gx = Math.round(m - r0 * 0.36), gy = Math.round(m - r0 * 0.42);
        for (let i = 0; i < 5; i++) B.set(gx + i, gy, [255, 255, 255], 150);
        for (let j = 1; j < 3; j++) B.set(gx, gy + j, [255, 255, 255], 120);
      }
      c = B.done();
    } else {
      const R = dark ? ramp.map((q) => grey(q, 0.6).map((v) => Math.round(v * 0.82))) : ramp;
      const t = Math.max(5, Math.round(S * 0.12));
      const fr = frame(S, S, { t, ramp: R, seed, plates: false, lip: true });
      const B = new Buf(S, S + 3);
      // well: parchment (dusk when locked)
      const P = dark ? PAPER.map((q) => grey(q, 0.7).map((v) => Math.round(v * 0.55))) : PAPER;
      for (let y = t; y < S - t; y++) for (let x = t; x < S - t; x++) {
        let v = 0.82 + (vn(x * 0.2, y * 0.2, seed) - 0.5) * 0.15 - (Math.min(x, y) - t < 3 ? (3 - (Math.min(x, y) - t)) * 0.1 : 0);
        B.set(x, y, P[Math.max(0, Math.min(P.length - 1, Math.floor(v * P.length + bay(x, y))))]);
      }
      for (let y = 3; y < S + 3; y++) for (let x = 3; x < S + 2; x++) if (x >= S || y >= S) B.set(x, y, [26, 14, 6], 80);
      c = B.done();
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(fr, 0, 0);
      // nails
      const nb = new Buf(1, 1); void nb;
    }
    // jewel on the top rail
    const x = c.getContext('2d', { willReadFrequently: true });
    const J = shadeOf(JEWEL[st] || JEWEL.locked, 0), jx = Math.round(S / 2) - 4;
    const put = (i, j, col) => { x.fillStyle = `rgb(${col.join(',')})`; x.fillRect(jx + i, j, 1, 1); };
    for (let j = 0; j < 6; j++) for (let i = 0; i < 9; i++) {
      const e = (j === 0 || j === 5 || i === 0 || i === 8) && !((i === 0 || i === 8) && (j === 0 || j === 5));
      if ((i === 0 || i === 8) && (j === 0 || j === 5)) continue;
      if (e) { put(i, j, INK); continue; }
      put(i, j, (i < 4 && j < 3) ? shadeOf(J, 0.45) : (i > 5 || j > 3) ? shadeOf(J, -0.35) : J);
    }
    put(2, 1, [255, 255, 255]);
    return c;
  });
}

// ---------------------------------------------------------------- the monitor bezel
// carved walnut round the screen (a hole), with a brass name plate cartouche at the bottom,
// a power lamp and a little ventilation grille
export function bezel(w, h, t, b) {
  return cached(`bezel|${w}x${h}|${t}|${b}`, () => {
    const c = frame(w, h, { t, ramp: WALNUT, seed: 21, plates: true, lip: true });
    // a taller bottom rail is painted by the caller as a separate strip (the taskbar sits on it)
    void b;
    return c;
  });
}


// ---------------------------------------------------------------- the porthole's pond (animated)
// N stepped frames of pond water for the glass of a porthole tile: green-blue bands, caustic
// light, a ripple ring spreading from a drip, a lily pad at the rim, reeds at the bottom.
// 'murky' (locked) is one still, dark frame with floating specks.
export const PORT_FRAMES = 6;
export function portWater(S, mode, f) {
  const murky = mode === 'murky';
  if (murky) f = 0;
  return cached(`pw|${S}|${mode}|${f}`, () => {
    const B = new Buf(S, S + 3), m = (S - 1) / 2, r0 = S / 2, rg = r0 - r0 * 0.22 - 1;
    const W = murky ? ['#141e1a', '#18241e', '#1c2a22', '#203026', '#24362a'].map(hex) : ['#1e5a5e', '#24706e', '#2e867e', '#40a090', '#5cb8a0', '#88d0b4'].map(hex);
    const dropX = m + Math.cos(1.1) * rg * 0.25, dropY = m + Math.sin(1.1) * rg * 0.3;
    const ringR = (f / PORT_FRAMES) * rg * 1.15;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - m, dy = y - m, d = Math.hypot(dx, dy);
      if (d > rg + 0.6) continue;
      let v = 0.85 - (dy + rg) / (2 * rg) * 0.55 - (d / rg) * 0.2;
      if (!murky) {
        // caustics: a moving net of light, two steps
        const cz = Math.sin(x * 0.55 + f * 1.05) + Math.sin(y * 0.6 - f * 0.9) + Math.sin((x + y) * 0.35 + f * 0.7);
        if (cz > 2.15) v += 0.32; else if (cz > 1.75 && ((x + y) & 1)) v += 0.2;
        // the ripple ring from the drip
        const rr = Math.hypot(x - dropX, (y - dropY) * 1.25);
        if (Math.abs(rr - ringR) < 0.7 && f > 0) v += 0.28 * (1 - f / PORT_FRAMES);
      } else if (h2(x, y, 7) < 0.04) v += 0.25;
      B.set(x, y, W[Math.max(0, Math.min(W.length - 1, Math.floor(v * W.length + bay(x, y))))]);
    }
    // a lily pad cut by the rim (top right) and reeds rising from the bottom left
    const lx = Math.round(m + rg * 0.55), ly = Math.round(m - rg * 0.62);
    const pad = murky ? [[26, 40, 30], [34, 50, 38]] : [[46, 132, 62], [86, 184, 92]];
    for (let y = -5; y <= 5; y++) for (let x = -8; x <= 8; x++) {
      const e = (x * x) / 64 + (y * y) / 25;
      if (e > 1 || (x < 0 && Math.abs(y) < 1)) continue;
      const X = lx + x, Y = ly + y;
      if (Math.hypot(X - m, Y - m) > rg) continue;
      B.set(X, Y, e > 0.72 ? INK : (y < -1 ? pad[1] : pad[0]));
    }
    if (!murky) { B.set(lx + 2, ly - 2, [255, 210, 230]); B.set(lx + 3, ly - 2, [255, 160, 200]); B.set(lx + 3, ly - 3, [255, 240, 120]); }
    const reed = murky ? [30, 46, 34] : [40, 104, 52];
    for (const [rx, h, lean] of [[m - rg * 0.62, rg * 0.7, 0.18], [m - rg * 0.48, rg * 0.9, -0.1], [m - rg * 0.3, rg * 0.55, 0.12]]) {
      for (let k = 0; k < h; k++) {
        const X = Math.round(rx + k * lean + (murky ? 0 : Math.sin(f * 1.05 + k * 0.3) * 0.6)), Y = Math.round(m + rg - k);
        if (Math.hypot(X - m, Y - m) <= rg) { B.set(X, Y, reed); if (k > h - 3) B.set(X, Y, murky ? [60, 50, 30] : [140, 90, 40]); }
      }
    }
    return B.done();
  });
}
// a soft sparkle ring for ready tiles: four glints walking round the brass
export function portSpark(S, f) {
  return cached(`ps|${S}|${f}`, () => {
    const B = new Buf(S, S + 3), m = (S - 1) / 2, r = S / 2 - 2;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + (f / PORT_FRAMES) * (Math.PI / 2);
      const x = Math.round(m + Math.cos(a) * r), y = Math.round(m + Math.sin(a) * r);
      const on = (f + k) % 3 !== 2;
      if (!on) continue;
      B.set(x, y, [255, 255, 255]);
      B.set(x - 1, y, [255, 246, 190], 200); B.set(x + 1, y, [255, 246, 190], 200); B.set(x, y - 1, [255, 246, 190], 200); B.set(x, y + 1, [255, 246, 190], 200);
    }
    return B.done();
  });
}
