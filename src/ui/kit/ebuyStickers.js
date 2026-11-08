// [v33 kit] e-Buy stickers: hand-made pixel-art stickers in the old shop's palette, painted in code at art
// resolution and shown at the shop's own chunky scale (STK_S = 2 CSS px per art px).
//
//   stk(id)            -> { url, w, h, n }   the sticker's frame strip (art px), built lazily and cached
//   stkHTML(id, o)     -> HTML               <i class="eb-stk" data-stk=id> with its strip as the background
//   STK                                      every sticker: its art, die-cut, tilt, peel corner, holo, gag
//   BEZEL / BEZEL_PH                          where the laptop's sticker bomb goes (desktop / phone)
//
// A strip is [flat, corner peeled up, ...animation frames] (holo shimmer sweep, googly eyes...). Every frame
// is hard pixels only: shading ramps, rim light, 1 px glints, a die-cut white border with a 1 px cut line and
// a 1 px hard shadow. Crooked stickers are rotated in art space (RotSprite: EPX x8, nearest, back down), so a
// tilted sticker still sits on the pixel grid and never gets a blurry CSS rotate.
import { PixelBuffer, hex, pxDraw, pxMeasure } from '../kinetic/pxfont.js';

export const STK_S = 2;

// ------------------------------------------------------------ colour
const rgb = (r, g, b, a = 255) => ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
const cr = (c) => c & 255, cg = (c) => (c >>> 8) & 255, cb = (c) => (c >>> 16) & 255, ca = (c) => c >>> 24;
const mix = (a, b, t) => rgb(Math.round(cr(a) + (cr(b) - cr(a)) * t), Math.round(cg(a) + (cg(b) - cg(a)) * t), Math.round(cb(a) + (cb(b) - cb(a)) * t), ca(a));
const lum = (c) => 0.3 * cr(c) + 0.59 * cg(c) + 0.11 * cb(c);
const H = (h) => hex(h);
const INK = H('#2a1a14');
const CUT = H('#3a281c'); // the die-cut edge line
const BACK = H('#fffdf4'); // sticker vinyl white
const BACKLO = H('#e4dac6'); // its thickness on the lower edge
const FLAP = [H('#fffef9'), H('#f3ecdd'), H('#ddd2bb')]; // the peeled-up back: crease, middle, tip
const SHADOW = hex('#2a1a14', 96);
const WHITE = H('#ffffff');

// shading ramps: [rim light, base, shade]
const RAMPS = {
  red: ['#ff8a80', '#f0505a', '#b8323c'],
  dred: ['#e0585a', '#c03038', '#841c24'],
  orange: ['#ffc070', '#ff9a3a', '#d06a1a'],
  blue: ['#8ab8ff', '#3a7ae0', '#2050a8'],
  navy: ['#5a8ad8', '#2a5ab8', '#183a80'],
  yellow: ['#fff2a0', '#ffc22e', '#d08a10'],
  gold: ['#fff4b0', '#f2b92a', '#b8780e'],
  green: ['#b0e880', '#6cc04a', '#3a8a2a'],
  lime: ['#e4ff9a', '#a8e04a', '#5aa02a'],
  bear: ['#d89a68', '#a8683c', '#74401e'],
  tan: ['#fbe4c0', '#e8c090', '#c0905c'],
  fox: ['#ffb070', '#ee7a2c', '#b44a14'],
  beaver: ['#c89060', '#8e5a30', '#5e3818'],
  cream: ['#ffffff', '#fff4dc', '#e8d8b8'],
  silver: ['#ffffff', '#dfe6f4', '#9aa8c8'],
  pink: ['#ffc0dc', '#ff7ab0', '#d04880'],
  purple: ['#c8a8ff', '#8a5ae0', '#5a34a8'],
  grey: ['#ffffff', '#e8e4dc', '#b8b0a4'],
  paper: ['#fffbb8', '#fff27a', '#e8c84a'],
  tape: ['#fbf4dc', '#efe4c0', '#d6c89c'],
};
const RAMPI = Object.fromEntries(Object.entries(RAMPS).map(([k, v]) => [k, v.map(H)]));

// ------------------------------------------------------------ a layer: a pixel buffer plus "which ramp" per pixel
class Layer {
  constructor(w, h) { this.b = new PixelBuffer(w, h); this.r = new Array(w * h).fill(null); this.w = w; this.h = h; this.texts = []; }
  set(x, y, c, ramp = null) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.b.set(x, y, c); this.r[y * this.w + x] = ramp; }
  get(x, y) { return this.b.get(x, y); }
  ramp(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.r[y * this.w + x]; }
}
// rows of chars -> layer. pal: char -> '#hex' (flat) or a ramp name (shaded later)
function paint(rows, pal, L = null, ox = 0, oy = 0) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  L ||= new Layer(w, h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const p = pal[row[x]];
      if (!p) continue;
      if (RAMPI[p]) L.set(ox + x, oy + y, RAMPI[p][1], p);
      else L.set(ox + x, oy + y, H(p), null);
    }
  });
  return L;
}
// a bigger canvas around a layer
function pad(L, l, t = l, r = l, b = t) {
  const o = new Layer(L.w + l + r, L.h + t + b);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) { const c = L.get(x, y); if (c) o.set(x + l, y + t, c, L.ramp(x, y)); }
  o.texts = (L.texts || []).map((q) => ({ ...q, x: q.x + l, y: q.y + t }));
  return o;
}
function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = src.get(x, y); if (c) dst.set(x + ox, y + oy, c, src.ramp ? src.ramp(x, y) : null); }
  if (src.texts?.length && dst.texts) for (const q of src.texts) dst.texts.push({ ...q, x: q.x + ox, y: q.y + oy });
}
// form shading: rim light where the surface turns to the top/left edge, shade toward the bottom edge,
// a second shade step on wide bottoms, and a 1 px glint at the top-left of each ramp region
function shade(L, { glint = true } = {}) {
  const out = L.b.clone();
  const edge = (x, y, rp) => { const r2 = L.ramp(x, y); return r2 !== rp && (!L.get(x, y) || lum(L.get(x, y)) < 70 || r2 === null); };
  const seen = new Set(), glints = [];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const rp = L.ramp(x, y);
    if (!rp) continue;
    const [hi, base, lo] = RAMPI[rp];
    let c = base;
    const up = edge(x, y - 1, rp), dn = edge(x, y + 1, rp), lf = edge(x - 1, y, rp), rt = edge(x + 1, y, rp);
    if (dn || (rt && !up)) c = lo;
    else if (up || lf) c = hi;
    else if (edge(x, y + 2, rp) && edge(x + 1, y + 1, rp)) c = mix(base, lo, 0.5);
    out.set(x, y, c);
    if (glint && !seen.has(rp) && up && lf && !edge(x + 1, y + 1, rp)) { seen.add(rp); glints.push([x + 1, y + 1]); }
  }
  for (const [x, y] of glints) out.set(x, y, WHITE);
  L.b = out;
  return L;
}
// 1 px outline in the empty pixels around a shape (8-neighbour = bold, 4 = rounder)
function outline(L, c = INK, diag = true) {
  const src = L.b.clone();
  const N = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    if (src.get(x, y)) continue;
    if (N.some(([dx, dy]) => src.get(x + dx, y + dy))) L.set(x, y, c, null);
  }
  return L;
}
// text (pixel fonts from kinetic/pxfont.js: 'tiny' 3x5 caps, 'body', 'bold'). It is a sized, empty layer that
// carries the text as a spec: the letters are drawn last, after the sticker is tilted, glyph by glyph on a
// staircase that follows the slope, so tiny letters never get mangled by the rotation.
function text(str, font = 'tiny', color = '#2a1a14', ol = null) {
  const w = pxMeasure(str, font) + 6, h = 18;
  const t = new PixelBuffer(w, h);
  pxDraw(t, str, 2, 2, { font, color: H(color), bounce: false });
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (t.get(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const k = ol ? 1 : 0;
  const L = new Layer(Math.max(1, x1 - x0 + 1) + k * 2, Math.max(1, y1 - y0 + 1) + k * 2);
  L.texts.push({ str, font, color, ol, x: 2 - x0 + k, y: 2 - y0 + k });
  return L;
}
function drawText(b, q, X, Y, slope = 0) {
  const t = new PixelBuffer(b.w, b.h);
  const chars = [...q.str];
  chars.forEach((ch, i) => {
    const cx = i ? pxMeasure(chars.slice(0, i).join(''), q.font) + 1 : 0;
    pxDraw(t, ch, X + cx, Y + Math.round((cx + 1) * slope), { font: q.font, color: H(q.color), bounce: false });
  });
  if (q.ol) {
    const oc = H(q.ol);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (t.get(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (t.get(x + dx, y + dy) && ca(t.get(x + dx, y + dy)) === 255 && t.get(x + dx, y + dy) !== oc) { b.set(x, y, oc); break; }
    }
  }
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const c = t.get(x, y); if (c) b.set(x, y, c); }
}
// a filled shape from a test function (a rough base only: everything on it is hand-detailed after)
function shape(w, h, test, ramp) {
  const L = new Layer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) L.set(x, y, RAMPI[ramp][1], ramp);
  return L;
}
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
// a starburst / rosette edge: radius wobbles with n points
const burst = (cx, cy, r0, r1, n, rot = 0) => (x, y) => {
  const a = Math.atan2(y - cy, x - cx) + rot, d = Math.hypot(x - cx, y - cy);
  const t = Math.abs(((a / (Math.PI * 2)) * n % 1 + 1) % 1 - 0.5) * 2; // 1 at a tip, 0 between
  return d <= r0 + (r1 - r0) * t;
};
const scallop = (cx, cy, r, amp, n) => (x, y) => {
  const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy);
  return d <= r + amp * Math.cos(a * n);
};

// ------------------------------------------------------------ die-cut, shadow, rotation, peel, holo
function dilate(m, w, h, diag) {
  const o = m.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (m[y * w + x]) continue;
    const hit = (dx, dy) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]; };
    if (hit(1, 0) || hit(-1, 0) || hit(0, 1) || hit(0, -1) || (diag && (hit(1, 1) || hit(-1, -1) || hit(1, -1) || hit(-1, 1)))) o[y * w + x] = 1;
  }
  return o;
}
// the white vinyl border around the art, its 1 px thickness and the cut line
function dieCut(L, r = 2, back = BACK) {
  const m = r + 1;
  const o = pad(L, m);
  let mask = new Uint8Array(o.w * o.h);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.get(x, y)) mask[y * o.w + x] = 1;
  for (let i = 0; i < r; i++) mask = dilate(mask, o.w, o.h, i % 2 === 0);
  const out = new Layer(o.w, o.h);
  const inM = (x, y) => x >= 0 && y >= 0 && x < o.w && y < o.h && mask[y * o.w + x];
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    if (inM(x, y)) out.set(x, y, !inM(x, y + 1) || !inM(x + 1, y + 1) ? BACKLO : !inM(x, y - 1) || !inM(x - 1, y) ? WHITE : back, null);
    else if (inM(x + 1, y) || inM(x - 1, y) || inM(x, y + 1) || inM(x, y - 1)) out.set(x, y, CUT, null);
  }
  blit(out, o, 0, 0);
  return out;
}
const isShadow = (c) => c && ca(c) < 200;
function addShadow(b) {
  const o = new PixelBuffer(b.w + 1, b.h + 1);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.get(x, y) && !isShadow(b.get(x, y))) o.set(x + 1, y + 1, SHADOW);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const c = b.get(x, y); if (c) o.set(x, y, c); }
  return o;
}
// EPX / Scale2x: doubles without blur or new colours, keeps diagonals clean
function scale2x(s) {
  const d = new PixelBuffer(s.w * 2, s.h * 2);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const P = s.get(x, y), A = s.get(x, y - 1), B = s.get(x + 1, y), C = s.get(x - 1, y), D = s.get(x, y + 1);
    d.set(x * 2, y * 2, C === A && C !== D && A !== B ? A : P);
    d.set(x * 2 + 1, y * 2, A === B && A !== C && B !== D ? B : P);
    d.set(x * 2, y * 2 + 1, D === C && D !== B && C !== A ? C : P);
    d.set(x * 2 + 1, y * 2 + 1, B === D && B !== A && D !== C ? D : P);
  }
  return d;
}
// RotSprite: x8 with EPX, rotate by nearest neighbour, sample back down at the block centres
function rotate(b, deg) {
  return rotateM(b, deg).b;
}
function rotateM(b, deg) {
  if (!deg) return { b, map: (x, y) => [x, y] };
  let s = b;
  for (let i = 0; i < 3; i++) s = scale2x(s);
  const a = (deg * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
  const W = Math.ceil(b.w * Math.abs(co) + b.h * Math.abs(si)) + 2, Hh = Math.ceil(b.w * Math.abs(si) + b.h * Math.abs(co)) + 2;
  const o = new PixelBuffer(W, Hh);
  const cx = s.w / 2, cy = s.h / 2, ox = (W * 8) / 2, oy = (Hh * 8) / 2;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const X = x * 8 + 4 - ox, Y = y * 8 + 4 - oy;
    const sx = Math.floor(X * co + Y * si + cx), sy = Math.floor(-X * si + Y * co + cy);
    const c = s.get(sx, sy);
    if (c) o.set(x, y, c);
  }
  const { b: cb2, x0, y0 } = cropXY(o);
  // where an art pixel lands after the turn (for the letters drawn on top)
  const map = (ax, ay) => {
    const dx = (ax + 0.5) * 8 - cx, dy = (ay + 0.5) * 8 - cy;
    const X = dx * co - dy * si, Y = dx * si + dy * co;
    return [Math.floor((X + ox) / 8) - x0, Math.floor((Y + oy) / 8) - y0];
  };
  return { b: cb2, map };
}
function cropXY(b) {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.get(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return { b, x0: 0, y0: 0 };
  const o = new PixelBuffer(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.set(x - x0, y - y0, b.get(x, y));
  return { b: o, x0, y0 };
}
function crop(b) {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.get(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return b;
  const o = new PixelBuffer(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.set(x - x0, y - y0, b.get(x, y));
  return o;
}
// the corner lifts: the corner triangle comes off, folds back over the fold line and shows the white back,
// with a crease highlight, a darker tip, a 1 px edge and a shadow on the sticker under the flap
function peel(src, corner = 'tr', k = 5) {
  const b = src.clone(), W = b.w, Hh = b.h;
  const fx = corner[1] === 'r', fy = corner[0] === 'b';
  const U = (x) => (fx ? W - 1 - x : x), V = (y) => (fy ? Hh - 1 - y : y);
  const X = (u) => (fx ? W - 1 - u : u), Y = (v) => (fy ? Hh - 1 - v : v);
  let d0 = 1e9;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (src.get(x, y)) d0 = Math.min(d0, U(x) + V(y));
  const c = d0 + k;
  const flap = new Map();
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (!src.get(x, y)) continue;
    const u = U(x), v = V(y);
    if (u + v >= c) continue;
    b.set(x, y, 0);
    const x2 = X(c - v), y2 = Y(c - u);
    if (x2 >= 0 && y2 >= 0 && x2 < W && y2 < Hh) flap.set(y2 * W + x2, c - (u + v)); // distance from the fold
  }
  // shadow of the flap on the sticker (one step further out from the fold)
  for (const [i] of flap) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[fx ? -1 : 1, 0], [0, fy ? -1 : 1], [fx ? -1 : 1, fy ? -1 : 1]]) {
      const j = (y + dy) * W + x + dx;
      if (flap.has(j)) continue;
      const cc = b.get(x + dx, y + dy);
      if (cc && !isShadow(cc)) b.set(x + dx, y + dy, mix(cc, INK, 0.35));
    }
  }
  const far = Math.max(1, ...flap.values());
  for (const [i, d] of flap) {
    const x = i % W, y = (i / W) | 0;
    const edgePx = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !flap.has((y + dy) * W + x + dx) && U(x + dx) + V(y + dy) > c);
    b.set(x, y, edgePx ? CUT : d <= 1 ? FLAP[0] : d >= far - 1 ? FLAP[2] : FLAP[1]);
  }
  return b;
}
const RAINBOW = ['#ffb0d8', '#fff0a0', '#b0f4ff', '#d0b8ff', '#b8ffc0'].map(H);
const isInkish = (c) => lum(c) < 75;
function holoTint(b, amt = 0.3) {
  const o = b.clone();
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const c = b.get(x, y);
    if (!c || isShadow(c) || isInkish(c) || c === BACK || c === BACKLO || c === WHITE) continue;
    o.set(x, y, mix(c, RAINBOW[(((x + y * 2) >> 2) % RAINBOW.length + RAINBOW.length) % RAINBOW.length], amt));
  }
  return o;
}
function holoSweep(b, p, wide = 2) {
  const o = b.clone();
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const c = b.get(x, y);
    if (!c || isShadow(c) || isInkish(c)) continue;
    const d = x + y - p;
    if (d >= 0 && d < wide) o.set(x, y, mix(c, WHITE, 0.8));
    else if (d === -1 || d === wide) o.set(x, y, mix(c, RAINBOW[(x + p) % RAINBOW.length], 0.6));
  }
  return o;
}
// a 4-point twinkle drawn on top
function twinkle(b, x, y, big) {
  const o = b.clone();
  const S = big ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of S) o.set(x + dx, y + dy, dx || dy ? H('#fff6b0') : WHITE);
  return o;
}

// ------------------------------------------------------------ the art (hand-placed, then shaded and die-cut)
const LETTERS = {
  e: ['.eee.', 'ee.ee', 'eeeee', 'ee...', 'ee.ee', '.eee.'],
  '-': ['---', '---'],
  B: ['BBBB.', 'BB.BB', 'BB.BB', 'BBBB.', 'BB.BB', 'BB.BB', 'BB.BB', 'BBBB.'],
  u: ['uu.uu', 'uu.uu', 'uu.uu', 'uu.uu', 'uu.uu', '.uuuu'],
  y: ['yy.yy', 'yy.yy', 'yy.yy', 'yy.yy', '.yyyy', '...yy', 'yy.yy', '.yyy.'],
};
function artLogo() {
  const L = new Layer(28, 12);
  const pal = { e: 'red', '-': 'orange', B: 'blue', u: 'yellow', y: 'green', a: 'bear' };
  paint(LETTERS.e, pal, L, 0, 4);
  paint(LETTERS['-'], pal, L, 6, 6);
  paint(LETTERS.B, pal, L, 10, 2);
  paint(LETTERS.u, pal, L, 16, 4);
  paint(LETTERS.y, pal, L, 22, 4);
  paint(['a.a.a', '.aaa.', '..a..'], pal, L, 22, 0); // the antler on the y
  shade(L, { glint: false });
  // a glint on each letter
  for (const [x, y] of [[1, 5], [11, 3], [17, 5], [23, 5]]) L.set(x, y, WHITE);
  return outline(pad(L, 1), INK, true);
}
function artFish() {
  const rows = [
    '.......ddddd..........',
    '......dddddd..........',
    '.....bbbbbbbbb.....ff.',
    '...bbbbbbbbbbbb...fff.',
    '..bbwwbbbkbbbbbb.ffff.',
    '.bbbwkkbbbkbbbbbbffff.',
    'kbbbwkkbbbkbbbbbbbff..',
    '.mbbbbbbbkbbbbbbbbff..',
    '..yyyyybbkbpbbbbbfff..',
    '...yyyyyyyppbbbb.ffff.',
    '....yyyyyyypp.....fff.',
    '......yyyyy........ff.',
  ];
  const L = paint(rows, { b: 'blue', y: 'yellow', f: 'orange', d: 'orange', p: 'orange', w: '#ffffff', k: '#2a1a14', m: '#b8323c' });
  shade(L);
  L.set(4, 4, WHITE);
  // scales: little darker ticks on the back, a light scale row under the fin
  for (const [x, y] of [[12, 3], [14, 4], [12, 5], [14, 6], [13, 7], [15, 8]]) L.set(x, y, RAMPI.blue[2]);
  for (const [x, y] of [[6, 3], [7, 3], [8, 3]]) L.set(x, y, RAMPI.blue[0]);
  // fin rays
  for (const [x, y] of [[8, 0], [10, 0], [9, 1], [19, 3], [19, 5], [20, 9], [19, 10]]) L.set(x, y, RAMPI.orange[2]);
  return outline(pad(L, 1), INK, true);
}
function artBear() {
  const face = [
    '.bb..........bb.',
    'bmmb........bmmb',
    'bmbbbbbbbbbbbbmb',
    '.bbbbbbbbbbbbbb.',
    'bbbbbbbbbbbbbbbb',
    'bbbkkbbbbbbkkbbb',
    'bbbkwbbbbbbkwbbb',
    'bbbbbbttttbbbbbb',
    'bbbbbttkkttbbbbb',
    '.bbbbtttttttbbb.',
    '.bbbbtkrrrktbbb.',
    '..bbbbtkkktbbb..',
    '....bbbbbbbb....',
  ];
  const L = paint(face, { b: 'bear', m: 'tan', t: 'tan', k: '#2a1a14', w: '#ffffff', r: '#f0505a' });
  shade(L);
  const O = outline(pad(L, 1, 1, 1, 6), INK, true);
  // the FEED ME banner across the chin
  const t = text('FEED ME', 'tiny', '#fffdf4');
  const bw = t.w + 6, bh = t.h + 4;
  const ban = new Layer(bw, bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) ban.set(x, y, RAMPI.red[1], 'red');
  shade(ban, { glint: false });
  blit(ban, t, 3, 2);
  const banO = outline(pad(ban, 1), INK, false);
  const W = Math.max(O.w, banO.w);
  const out = new Layer(W, O.h + 2);
  blit(out, O, Math.round((W - O.w) / 2), 0);
  blit(out, banO, Math.round((W - banO.w) / 2), O.h - banO.h + 2);
  return out;
}
const HEART = ['.rr.rr.', 'rhrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
function artMoose() {
  const top = text('MOOSE', 'bold', '#2a5ab8');
  const bot = text('EXPRESS', 'tiny', '#c03038');
  const iT = text('I', 'bold', '#2a1a14');
  const heart = shade(paint(HEART, { r: 'red', h: '#ffffff' }), { glint: false });
  const w = Math.max(iT.w + 2 + heart.w + 2 + top.w, bot.w + 10) + 8, h = top.h + bot.h + 9;
  const L = new Layer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    if (!corner) L.set(x, y, RAMPI.yellow[1], 'yellow');
  }
  shade(L, { glint: false });
  // a racing stripe and the bike icon in the corner
  for (let x = 2; x < w - 2; x++) L.set(x, top.h + 5, RAMPI.yellow[2]);
  let x = 4;
  blit(L, iT, x, 3); x += iT.w + 2;
  blit(L, heart, x, 3); x += heart.w + 2;
  blit(L, top, x, 3);
  blit(L, bot, Math.round((w - bot.w) / 2), top.h + 7);
  // speed lines
  for (const [lx, ly] of [[2, 4], [2, 6], [w - 3, h - 4], [w - 3, h - 6]]) L.set(lx, ly, RAMPI.yellow[2]);
  return outline(pad(L, 1), INK, false);
}
const STAR = [
  '.........s.........',
  '........sss........',
  '........sss........',
  '.......sssss.......',
  '.......sssss.......',
  '......sssssss......',
  'sssssssssssssssssss',
  '.sssssssssssssssss.',
  '..sssssssssssssss..',
  '...sssssssssssss...',
  '....sssssssssss....',
  '....sssssssssss....',
  '...sssssssssssss...',
  '...ssssss.ssssss...',
  '..sssss.....sssss..',
  '..ssss.......ssss..',
  '.sss...........sss.',
  '.s...............s.',
];
function artStar() {
  const L = paint(STAR, { s: 'silver' });
  shade(L);
  // bevelled facets: each arm lit on its upper-left face, shaded on the lower-right one
  for (const [x, y] of [[9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [8, 7], [7, 7], [6, 7], [5, 7], [4, 7], [3, 7], [8, 9], [7, 10], [6, 11], [5, 12], [4, 13]]) L.set(x, y, RAMPI.silver[0]);
  for (const [x, y] of [[10, 7], [11, 7], [12, 7], [13, 7], [14, 7], [15, 7], [10, 9], [11, 10], [12, 11], [13, 12], [14, 13], [15, 14], [9, 8], [9, 9]]) L.set(x, y, RAMPI.silver[2]);
  // a little smile, because it's a sticker
  for (const [x, y] of [[7, 9], [11, 9]]) L.set(x, y, INK);
  for (const [x, y] of [[8, 11], [9, 11], [10, 11]]) L.set(x, y, INK);
  L.set(6, 10, H('#ff9ab8')); L.set(12, 10, H('#ff9ab8'));
  return outline(pad(L, 1), INK, true);
}
const FOX = [
  'o.........o',
  'oo.......oo',
  'odo.....odo',
  'ooooooooooo',
  'ooooooooooo',
  'okkoooookko',
  'oowoooooowo',
  '.wwwwkwwww.',
  '..wwwwwww..',
  '...wwwww...',
];
function artFoxFace() {
  const L = paint(FOX, { o: 'fox', d: '#b44a14', k: '#2a1a14', w: 'cream' });
  return shade(L, { glint: false });
}
function artSeal(withBanner = true, small = false) {
  const R = small ? 7.2 : 9.2;
  const S = Math.ceil(R * 2 + 2);
  const c = S / 2;
  const L = shape(S, S, scallop(c, c, R - 0.6, 0.9, 12), 'gold');
  shade(L, { glint: false });
  // an inner ring of darker dots (the embossed rim)
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2, rr = R - (small ? 2.6 : 3);
    if (a % 2) L.set(Math.floor(c + Math.cos(t) * rr), Math.floor(c + Math.sin(t) * rr), RAMPI.gold[2]);
  }
  const fox = artFoxFace();
  blit(L, fox, Math.round(c - fox.w / 2), Math.round(c - fox.h / 2));
  let O = outline(pad(L, 1, 1, 1, withBanner ? 5 : 1), INK, true);
  if (!withBanner) return O;
  const t = text(withBanner === true ? 'APPROVED' : withBanner, 'tiny', '#fffdf4');
  const bw = t.w + 8, bh = t.h + 4;
  const ban = new Layer(bw, bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (!((x === 0 || x === bw - 1) && (y === Math.floor(bh / 2)))) ban.set(x, y, RAMPI.red[1], 'red');
  shade(ban, { glint: false });
  blit(ban, t, 4, 2);
  const banO = outline(pad(ban, 1), INK, false);
  const W = Math.max(O.w, banO.w);
  const out = new Layer(W, O.h + 5);
  // ribbon tails hanging under the banner (forked ends)
  const tx = Math.round(W / 2);
  const tails = shade(paint(['rrr...rrr', 'rrr...rrr', 'rrr...rrr', 'rr.....rr', 'r.......r'], { r: 'dred' }), { glint: false });
  blit(out, outline(pad(tails, 1), INK, false), tx - 6, O.h - 2);
  blit(out, O, Math.round((W - O.w) / 2), 0);
  blit(out, banO, Math.round((W - banO.w) / 2), O.h - banO.h + 1);
  return out;
}
function artY2K() {
  const big = text('Y2K', 'bold', '#fffdf4');
  const sm = text('READY!', 'tiny', '#ffe478');
  const w = Math.max(big.w, sm.w) + 8, h = big.h + sm.h + 7;
  const L = new Layer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L.set(x, y, RAMPI.blue[1], 'blue');
  shade(L, { glint: false });
  // a little checkerboard 1999 border
  for (let x = 1; x < w - 1; x++) if (x % 2) { L.set(x, 1, RAMPI.navy[1]); L.set(x, h - 2, RAMPI.navy[1]); }
  blit(L, big, Math.round((w - big.w) / 2), 3);
  blit(L, sm, Math.round((w - sm.w) / 2), big.h + 4);
  return outline(pad(L, 1), INK, false);
}
// googly eyes: pupils at (px,py) offsets
function artGoogly(px = 0, py = 1) {
  const eye = (ox) => {
    const E = shape(10, 10, disc(5, 5, 4.6), 'grey');
    shade(E, { glint: false });
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) E.set(4 + px + x - 1 + ox * 0, 4 + py + y - 1, INK);
    E.set(3 + px, 3 + py, WHITE); // a highlight dot on the pupil
    E.set(2, 2, WHITE); E.set(3, 2, WHITE); // the dome's shine
    return outline(pad(E, 1), INK, false);
  };
  const a = eye(0), b = eye(1);
  const L = new Layer(a.w + b.w - 1, a.h);
  blit(L, a, 0, 0);
  blit(L, b, a.w - 1, 1 > 0 ? 0 : 0);
  return L;
}
function artBeaver() {
  const head = [
    '....hhhhhh....',
    '...hhhhhhhh...',
    '..hhhhhhhhhh..',
    '.hhhhhhhhhhhh.',
    'HHHHHHHHHHHHHH',
    '.bb.bbbbbb.bb.',
    '.bbbbbbbbbbbb.',
    '.bbkbbbbbbkbb.',
    '.bbbbbbbbbbbb.',
    '.bbbmmmmmmbbb.',
    '..bmmmkkmmmb..',
    '..bbmmwwmmbb..',
    '...bbbwwbbb...',
    '....bbbbbb....',
  ];
  const L = paint(head, { h: 'yellow', H: 'gold', b: 'beaver', m: 'tan', k: '#2a1a14', w: '#fffdf4' });
  shade(L);
  L.set(7, 11, H('#d8d0c0')); // the gap between the teeth
  const t = text('UNION', 'tiny', '#fffdf4');
  const t2 = text('LOCAL', 'tiny', '#ffe478');
  const w = Math.max(L.w + 4, t.w + 6), h = L.h + t.h + t2.h + 9;
  const B = new Layer(w, h);
  // a shield: flat top, pointed bottom
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inset = y > h - 6 ? (y - (h - 6)) * 2 : 0;
    if (x >= inset && x < w - inset) B.set(x, y, y < L.h + 2 ? RAMPI.cream[1] : RAMPI.navy[1], y < L.h + 2 ? 'cream' : 'navy');
  }
  shade(B, { glint: false });
  blit(B, L, Math.round((w - L.w) / 2), 1);
  blit(B, t, Math.round((w - t.w) / 2), L.h + 4);
  blit(B, t2, Math.round((w - t2.w) / 2), L.h + t.h + 6);
  return outline(pad(B, 1), INK, false);
}
const MAPLE = [
  '........r........',
  '.......rrr.......',
  '...r..rrrrr..r...',
  '...rr.rrrrr.rr...',
  '...rrrrrrrrrrr...',
  'r...rrrrrrrrr...r',
  'rr..rrrrrrrrr..rr',
  '.rrrrrrrrrrrrrrr.',
  '..rrrrrrrrrrrrr..',
  '.rrrrrrrrrrrrrrr.',
  'rrrrrrrrrrrrrrrrr',
  '...rrrrrrrrrrr...',
  '.....rrr.rrr.....',
  '........s........',
  '........s........',
];
function artMaple() {
  const L = paint(MAPLE, { r: 'red', s: 'dred' });
  shade(L);
  // veins
  for (const [x, y] of [[8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [8, 10], [8, 11], [7, 8], [6, 7], [5, 6], [9, 8], [10, 7], [11, 6], [7, 10], [6, 10], [9, 10], [10, 10]]) L.set(x, y, RAMPI.red[2]);
  return outline(pad(L, 1), INK, true);
}
function artScam() {
  const t1 = text('NOT A', 'tiny', '#c03038');
  const t2 = text('SCAM!', 'tiny', '#2a1a14');
  const S = 30, c = S / 2;
  const L = shape(S, S - 2, burst(c, c - 1, 11, 14.4, 16, 0.2), 'yellow');
  shade(L, { glint: false });
  blit(L, t1, Math.round(c - t1.w / 2) - 1, 8);
  blit(L, t2, Math.round(c - t2.w / 2), 14);
  return outline(pad(L, 1), INK, true);
}
function artSmiley(wink = false) {
  const L = shape(11, 11, disc(5.5, 5.5, 5.4), 'yellow');
  shade(L);
  paint(wink ? ['.....', '.k.kk', '.k...', '.....', 'k...k', '.kkk.'] : ['.....', '.k.k.', '.k.k.', '.....', 'k...k', '.kkk.'], { k: '#2a1a14' }, L, 3, 2);
  L.set(2, 6, H('#ff8a80')); L.set(8, 6, H('#ff8a80')); // cheeks
  return outline(pad(L, 1), INK, false);
}
function artSmileyS(wink = false) {
  const L = paint(['..yyy..', '.yyyyy.', 'yykykyy', 'yyyyyyy', 'ykyyyky', '.ykkky.', '..yyy..'], { y: 'yellow', k: '#2a1a14' });
  shade(L, { glint: false });
  if (wink) { L.set(4, 2, RAMPI.yellow[1]); L.set(4, 3, INK); L.set(5, 3, INK); }
  L.set(1, 1, WHITE);
  return outline(pad(L, 1), INK, false);
}
function artBanner(l1, l2, ramp = 'red', ink = '#fff4b0') {
  const a = text(l1, 'tiny', ink), b = l2 ? text(l2, 'tiny', ink) : null;
  const w = Math.max(a.w, b?.w || 0) + 8, h = a.h + (b ? b.h + 1 : 0) + 4;
  const L = new Layer(w + 6, h);
  // forked tails
  paint(['dd.', 'ddd', 'dd.'], { d: ramp === 'red' ? 'dred' : 'navy' }, L, 0, h - 4);
  paint(['.dd', 'ddd', '.dd'], { d: ramp === 'red' ? 'dred' : 'navy' }, L, w + 3, h - 4);
  for (let y = 0; y < h; y++) for (let x = 3; x < w + 3; x++) L.set(x, y, RAMPI[ramp][1], ramp);
  shade(L, { glint: false });
  blit(L, a, 3 + Math.round((w - a.w) / 2), 2);
  if (b) blit(L, b, 3 + Math.round((w - b.w) / 2), a.h + 3);
  return outline(pad(L, 1), INK, false);
}
function artFresh() {
  const t = text('FRESH!', 'tiny', '#ffffff', '#2f6a14');
  const w = t.w + 6, h = t.h + 4;
  const L = shape(w, h, (x, y) => ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2 <= 1.08, 'lime');
  shade(L, { glint: false });
  // a leaf on top
  const leaf = shade(paint(['..gg', '.ggg', 'gg..'], { g: 'green' }), { glint: false });
  const O = new Layer(w, h + 2);
  blit(O, L, 0, 2);
  blit(O, leaf, w - 7, 0);
  blit(O, t, Math.round((w - t.w) / 2), 2 + Math.round((h - t.h) / 2));
  return outline(pad(O, 1), INK, false);
}
function artClub() {
  const t1 = text('CLUB', 'tiny', '#fffdf4'), t2 = text('MEMBER', 'tiny', '#ffe478');
  const star = shade(paint(['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'], { y: 'gold' }), { glint: false });
  const w = Math.max(t1.w, t2.w) + star.w + 9, h = t1.h + t2.h + 6;
  const L = new Layer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!((x === 0 || x === w - 1) && (y === 0 || y === h - 1))) L.set(x, y, RAMPI.purple[1], 'purple');
  shade(L, { glint: false });
  blit(L, outline(pad(star, 1), INK, false), 1, Math.round((h - star.h - 2) / 2));
  blit(L, t1, star.w + 5, 2);
  blit(L, t2, star.w + 5, t1.h + 4);
  return outline(pad(L, 1), INK, false);
}
// a strip of masking tape with torn ends and a little grain
function artTape(w = 22, h = 7, seed = 1) {
  const L = new Layer(w, h);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const tornL = Array.from({ length: h }, () => (rnd() * 2) | 0), tornR = Array.from({ length: h }, () => (rnd() * 2) | 0);
  for (let y = 0; y < h; y++) for (let x = tornL[y]; x < w - tornR[y]; x++) L.set(x, y, RAMPI.tape[1], 'tape');
  shade(L, { glint: false });
  for (let i = 0; i < w * h * 0.12; i++) { const x = (rnd() * w) | 0, y = 1 + ((rnd() * (h - 2)) | 0); if (L.get(x, y)) L.set(x, y, RAMPI.tape[2]); }
  return L; // tape is translucent-looking paper: no die-cut, no outline
}
// the sticky note with the password, in the pixel hand
function artNote() {
  const w = 44, h = 34;
  const L = new Layer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const curl = x + y > w + h - 9; // the bottom-right corner curls up
    if (!curl) L.set(x, y, RAMPI.paper[1], 'paper');
  }
  shade(L, { glint: false });
  for (let y = 9; y < h - 2; y += 6) for (let x = 2; x < w - 2; x++) if (x + y <= w + h - 10) L.set(x, y, H('#e8d860'));
  // the curl: the back of the paper, lighter, with a shadow under it
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = x + y - (w + h - 9);
    if (d >= 0 && d < 5 && x < w && y < h && (w - 1 - x) + (h - 1 - y) >= 2) L.set(x - 3, y - 3, d === 0 ? H('#c8b040') : H('#fffbd0'));
  }
  const t1 = text('pw: money', 'body', '#3a3a8a'), t2 = text('money123', 'body', '#3a3a8a');
  blit(L, t1, 3, 5);
  blit(L, t2, 3, 15);
  // a doodled underline
  for (let x = 3; x < 3 + t2.w; x++) L.set(x, 15 + t2.h + 2 + (x % 5 === 0 ? -1 : 0), H('#d9453b'));
  const O = outline(pad(L, 1, 4, 1, 1), H('#8a7a30'), false);
  const tape = artTape(18, 6, 3);
  blit(O, tape, 13, 0);
  return O;
}

// ------------------------------------------------------------ the catalogue
// art: () => Layer; cut: die-cut border (0 = none); tilt: degrees (RotSprite); corner: the corner that peels;
// holo: shimmer frames; anim: extra frames (function returning Layers); gag: what a click does
export const STK = {
  logo: { art: artLogo, cut: 2, tilt: -5, corner: 'tl', gag: { sfx: 'ebuy_tok', say: 'e-Buy! the pond\'s #1*' } },
  fish: { art: artFish, cut: 2, tilt: 8, corner: 'tr', gag: { sfx: 'fish_flop', say: 'flop!', flip: true } },
  bear: { art: artBear, cut: 2, tilt: -5, corner: 'tl', gag: { sfx: 'growl', say: 'FEED ME.' } },
  moose: { art: artMoose, cut: 2, tilt: 4, corner: 'br', gag: { sfx: 'honk', say: 'HONK HONK' } },
  star: { art: artStar, cut: 2, tilt: 12, corner: 'tr', holo: true, gag: { sfx: 'star_pop', say: 'so shiny', sparks: true } },
  seal: { art: () => artSeal(true), cut: 2, tilt: -4, corner: 'tr', holo: 'gold', gag: { sfx: 'fox_laugh', say: 'Reynard approves (of your wallet)' } },
  y2k: { art: artY2K, cut: 2, tilt: -9, corner: 'tl', peeled: true, gag: { sfx: 'paper', say: 'Y2K READY! (probably)' } },
  googly: { art: () => artGoogly(0, 1), cut: 1, tilt: 0, corner: 'tr', googly: true, gag: { sfx: 'pop_in', say: 'boing', spin: true } },
  beaver: { art: artBeaver, cut: 2, tilt: 5, corner: 'tr', gag: { sfx: 'hammer', say: 'ON BREAK. union rules.' } },
  maple: { art: artMaple, cut: 2, tilt: -14, corner: 'tl', gag: { sfx: 'sticker', say: 'sorry, eh' } },
  scam: { art: artScam, cut: 2, tilt: 9, corner: 'bl', gag: { sfx: 'fox_laugh', say: '100% legit. -Reynard' } },
  smiley: { art: () => artSmiley(false), cut: 1, tilt: -12, corner: 'tr', wink: () => artSmiley(true), gag: { sfx: 'pop_in', say: ':)' } },
  smileyS: { art: () => artSmileyS(false), cut: 1, tilt: -12, corner: 'tr', wink: () => artSmileyS(true), gag: { sfx: 'pop_in', say: 'have a nice day!' } },
  fresh: { art: artFresh, cut: 1, tilt: -8, corner: 'tr', gag: { sfx: 'egg_wobble', say: 'laid this morning!' } },
  best: { art: () => artBanner('BEST', 'SELLER', 'red'), cut: 1, tilt: -7, corner: 'tr', gag: { sfx: 'bell', say: 'everyone bought one' } },
  picked: { art: () => artSeal(false, true), cut: 1, tilt: 10, corner: 'tr', holo: 'gold', gag: { sfx: 'fox_laugh', say: 'hand-picked by Reynard' } },
  pickedBig: { art: () => artSeal('HAND-PICKED', false), cut: 2, tilt: 7, corner: 'tr', holo: 'gold', gag: { sfx: 'fox_laugh', say: 'hand-picked by Reynard (with his paws)' } },
  club: { art: artClub, cut: 1, tilt: 6, corner: 'tr', holo: true, gag: { sfx: 'stamp', say: 'VIP (very important pond)' } },
  tapeA: { art: () => artTape(22, 7, 1), cut: 0, tilt: -8, tape: true },
  tapeB: { art: () => artTape(20, 7, 2), cut: 0, tilt: 11, tape: true },
  tapeC: { art: () => artTape(16, 6, 5), cut: 0, tilt: -3, tape: true },
  note: { art: artNote, cut: 0, tilt: 0, corner: 'br', gag: { sfx: 'paper', say: 'pw: money123 (shh)' } },
};

// ------------------------------------------------------------ building a strip
const cache = new Map();
function frameSet(id) {
  const D = STK[id];
  const art = D.art();
  const cutL = D.cut ? dieCut(art, D.cut) : art;
  const off = D.cut ? D.cut + 1 : 0;
  const R = rotateM(cutL.b, D.tilt || 0);
  let base = R.b;
  const slope = Math.tan(((D.tilt || 0) * Math.PI) / 180);
  for (const q of art.texts || []) { const [X, Y] = R.map(q.x + off, q.y + off); drawText(base, q, X, Y, slope); }
  if (D.holo) base = holoTint(base, D.holo === 'gold' ? 0.18 : 0.32);
  const mk = (b) => addShadow(b);
  const k = Math.max(3, Math.min(7, Math.round(Math.min(base.w, base.h) * 0.22)));
  const frames = [];
  if (D.tape) {
    frames.push(base, base);
  } else if (D.peeled) {
    frames.push(peel(base, D.corner, k), peel(base, D.corner, k + 3)); // always a little lifted; hover: more
  } else {
    frames.push(base, peel(base, D.corner, k));
  }
  if (D.holo) {
    const n = 8, span = base.w + base.h + 4;
    for (let i = 0; i < n; i++) {
      let f = holoSweep(base, Math.round(-3 + (i / (n - 1)) * span), 3);
      if (i === n - 1 || i === n - 2) f = twinkle(f, Math.round(base.w * 0.72), Math.round(base.h * 0.3), i === n - 2);
      frames.push(f);
    }
  }
  if (D.googly) {
    for (const [x, y] of [[-1, 1], [1, 1], [0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const L = artGoogly(x, y);
      frames.push(rotate(dieCut(L, D.cut).b, D.tilt || 0));
    }
  }
  if (D.wink) frames.push(rotate(dieCut(D.wink(), D.cut).b, D.tilt || 0));
  // one size for every frame (+1 for the shadow)
  const W = Math.max(...frames.map((f) => f.w)), Hh = Math.max(...frames.map((f) => f.h));
  return frames.map((f) => {
    const o = new PixelBuffer(W, Hh);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = f.get(x, y); if (c) o.set(x, y, c); }
    return D.tape ? o : mk(o);
  });
}
export function stk(id) {
  if (cache.has(id)) return cache.get(id);
  if (!STK[id] || typeof document === 'undefined') return null;
  const fr = frameSet(id);
  const w = fr[0].w, h = fr[0].h;
  const c = document.createElement('canvas');
  c.width = w * fr.length; c.height = h;
  const g = c.getContext('2d');
  fr.forEach((f, i) => g.putImageData(new ImageData(new Uint8ClampedArray(f.bytes), f.w, f.h), i * w, 0));
  const out = { url: c.toDataURL(), w, h, n: fr.length };
  cache.set(id, out);
  return out;
}
// <i class="eb-stk"> with its strip; o: { cls, style, title, s (scale) }
export function stkHTML(id, o = {}) {
  const S = stk(id);
  if (!S) return '';
  const D = STK[id];
  const s = o.s || STK_S;
  const kind = [D.holo && 'holo', D.googly && 'googly', D.wink && 'wink', D.tape && 'tape', D.peeled && 'peeled'].filter(Boolean).map((k) => 'stk-' + k).join(' ');
  return `<i class="eb-stk stk-${id} ${kind} ${o.cls || ''}" data-stk="${id}"${o.title ? ` title="${o.title}"` : ''} style="--w:${S.w * s}px;--h:${S.h * s}px;width:${S.w * s}px;height:${S.h * s}px;background-image:url(${S.url});background-size:${S.w * s * S.n}px ${S.h * s}px;${o.style || ''}" aria-hidden="true"></i>`;
}

// ------------------------------------------------------------ the laptop's sticker bomb
// placed in CSS px from the bezel's edges (l/r/t/b), z for stacking (stickers on top of stickers)
// (the bezel is 20 px on top, 22 px at the sides and a 30 px chin on desktop; outward the world shows)
// wide: hangs out more than 40 px, hidden on narrower laptops
export const BEZEL = [
  { id: 'y2k', l: -44, t: -10, z: 2, wide: true },
  { id: 'fish', l: -40, t: 70, z: 2 },
  { id: 'maple', l: -30, t: 106, z: 3 },
  { id: 'bear', l: -56, t: 214, z: 2, wide: true },
  { id: 'googly', l: -41, t: 204, z: 4, wide: true },
  { id: 'picked', l: -32, t: 330, z: 2 },
  { id: 'logo', r: -40, t: -10, z: 3 },
  { id: 'star', r: -34, t: 58, z: 2 },
  { id: 'beaver', r: -34, t: 146, z: 2 },
  { id: 'scam', r: -46, t: 228, z: 3, wide: true },
  { id: 'seal', r: -58, t: 380, z: 2, wide: true },
  { id: 'moose', l: 70, b: -28, z: 2 },
  { id: 'smiley', r: 124, b: -6, z: 2 },
];
