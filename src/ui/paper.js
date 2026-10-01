// "Real paper" UI kit: procedural, low-res, dithered paper textures, desk
// props (tape, clips, stamps, seals...) and a modal system of physical papers.
//
//   injectPaperCSS()                     -> injects .paper / .paper--<kind> classes (idempotent)
//   paperTexture(kind, w, h, opts)       -> dataURL; w/h in CSS px (1 texel = opts.px || PX css px)
//   paperTile(kind)                      -> { url, w, h } tileable texture (texels)
//   openPaper({ kind, title, html|node, width, actions, onClose, dismissable, sfx, root })
//                                        -> { el, sheet, body, close(how) }
//   stamp(text, color, rot) / sticker(iconHtml, rot) / tape(variant, rot) / paperclip(rot)
//   handwriting(text, { delay, speed, color })  / deco(name, opts)  -> HTML strings
//   decoCanvas(name, opts)               -> fresh <canvas> (texel resolution)
//   setPaperSfx(fn)                      -> default sfx for openPaper: fn(name, { volume, pitch })
//
// Paper kinds: parchment, notebook, graph, kraft, postcard, book, spread, sticky,
//   receipt, cardboard, cork, wood, leather, board, cream.
// Deco names: coffee, tape, paperclip, staple, pushpin, postage, postmark, seal,
//   pencil, mug, ribbon, ring.
//
// Everything is built lazily on first use and cached. Importing this module
// never touches the DOM.
import './paper.css';
import { hasSprite, spriteCanvas } from './sprites.js';

export const PX = 3; // CSS px per texel

// ===========================================================================
// small utils
// ===========================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function hexc(h) {
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
function hash(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const dq = (v, x, y, n) => clamp(Math.floor(v + bayer(x, y)), 0, n - 1);
const md = (a, p) => ((a % p) + p) % p;
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = md(xi, px), x1 = md(xi + 1, px), y0 = md(yi, py), y1 = md(yi + 1, py);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// periodic fbm over a w x h texel area, in [0, 1]
function fbm(x, y, w, h, cell, oct, s) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const p = Math.max(1, cell / (1 << o));
    sum += amp * vnoise(x / p, y / p, Math.max(1, Math.round(w / p)), Math.max(1, Math.round(h / p)), s + o * 17);
    norm += amp; amp *= 0.5;
  }
  return sum / norm;
}

// RGBA texel buffer
class Buf {
  constructor(w, h, wrap = false) { this.w = w; this.h = h; this.wrap = wrap; this.d = new Uint8ClampedArray(w * h * 4); }
  i(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (this.wrap) { x = md(x, this.w); y = md(y, this.h); } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }
  set(x, y, c, a = 255) { const i = this.i(x, y); if (i < 0) return; const d = this.d; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; }
  // tint an opaque-ish pixel toward c
  mix(x, y, c, t) {
    const i = this.i(x, y); if (i < 0) return; const d = this.d;
    if (!d[i + 3]) return;
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
  }
  // source-over
  over(x, y, c, a) {
    const i = this.i(x, y); if (i < 0) return; const d = this.d;
    const da = d[i + 3] / 255, oa = a + da * (1 - a);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) d[i + k] = (c[k] * a + d[i + k] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
  }
  alpha(x, y, a) { const i = this.i(x, y); if (i >= 0) this.d[i + 3] = a; }
  getA(x, y) { const i = this.i(x, y); return i < 0 ? 0 : this.d[i + 3]; }
  canvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const x = c.getContext('2d');
    x.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return c;
  }
  url() { return this.canvas().toDataURL(); }
}

// ===========================================================================
// paper kinds
// ===========================================================================
const KINDS = {
  parchment: { ramp: ['#9c7646', '#bb945e', '#d4b078', '#e6c994', '#f1dcae', '#f8eaca'], base: 3.3, amp: 1.5, cell: 24, grain: 0.7, fibres: 0.02, fibLen: 6, specks: 0.004, tile: [96, 96] },
  cream: { ramp: ['#cbb88e', '#e0d0aa', '#ede1c2', '#f6eed8', '#fcf7ea'], base: 3.0, amp: 0.7, cell: 24, grain: 0.6, fibres: 0.012, fibLen: 4, specks: 0.002, tile: [96, 96] },
  notebook: { ramp: ['#cbb88e', '#e0d0aa', '#ede1c2', '#f6eed8', '#fcf7ea'], base: 3.0, amp: 0.6, cell: 24, grain: 0.55, fibres: 0.01, fibLen: 4, specks: 0.0015, tile: [96, 96], rules: 8 },
  graph: { ramp: ['#c9c9bc', '#dedfd2', '#eceee2', '#f5f7ee', '#fcfdf8'], base: 3.1, amp: 0.5, cell: 24, grain: 0.5, fibres: 0.008, fibLen: 3, specks: 0.001, tile: [96, 96], grid: 4 },
  kraft: { ramp: ['#6a4428', '#81573a', '#966948', '#a97b56', '#bb8e66', '#cba078'], base: 3.0, amp: 1.0, cell: 24, grain: 0.9, fibres: 0.05, fibLen: 7, specks: 0.01, tile: [96, 96] },
  postcard: { ramp: ['#cfc6b0', '#e2dbc8', '#eee8d8', '#f6f2e6', '#fcfaf2'], base: 3.0, amp: 0.55, cell: 24, grain: 0.6, fibres: 0.012, fibLen: 3, specks: 0.002, tile: [96, 96] },
  book: { ramp: ['#a58152', '#bf9b68', '#d4b47e', '#e3c896', '#eed8aa', '#f6e6c0'], base: 3.5, amp: 1.0, cell: 24, grain: 0.65, fibres: 0.015, fibLen: 4, specks: 0.004, tile: [96, 96] },
  sticky: { ramp: ['#d49e1c', '#e6b62a', '#f2c83c', '#f9d856', '#fde374', '#fff0a0'], base: 3.4, amp: 0.55, cell: 24, grain: 0.55, fibres: 0.006, fibLen: 3, specks: 0.001, tile: [96, 96] },
  receipt: { ramp: ['#c4c2bb', '#d9d7cf', '#e7e5de', '#f1f0ea', '#f9f8f4'], base: 3.1, amp: 0.4, cell: 24, grain: 0.5, fibres: 0.004, fibLen: 3, specks: 0.001, tile: [96, 96], streaks: 1 },
  cardboard: { ramp: ['#6a4526', '#7f5534', '#946642', '#a6764e', '#b8885c', '#c89a6c'], base: 3.0, amp: 0.9, cell: 24, grain: 0.7, fibres: 0.03, fibLen: 8, specks: 0.008, tile: [96, 96], flutes: 6 },
  cork: { ramp: ['#6c4620', '#87602f', '#a1773f', '#b68b4f', '#c89e62', '#d6b278'], base: 3.0, amp: 1.0, cell: 12, grain: 1.6, fibres: 0, specks: 0, tile: [96, 96], granules: 1 },
  wood: { ramp: ['#2c190d', '#3f2414', '#52301b', '#663d22', '#7a4b2b', '#8f5a35', '#a56b40'], tile: [128, 88], wood: 1 },
  leather: { ramp: ['#2e0f0c', '#481812', '#621f17', '#7c2a1e', '#953626', '#ad4632'], base: 3.0, amp: 1.0, cell: 12, grain: 1.2, fibres: 0, specks: 0.004, tile: [64, 64] },
  board: { ramp: ['#4e321b', '#634024', '#764e2d', '#895d36', '#9a6c41'], base: 2.6, amp: 0.7, cell: 24, grain: 0.8, fibres: 0.01, fibLen: 3, specks: 0.006, tile: [96, 96] },
};
KINDS.spread = { ...KINDS.book };
export const PAPER_KINDS = Object.keys(KINDS);

const INK_BLUE = hexc('#9dbde3'), INK_BLUE2 = hexc('#7ea6d8'), MARGIN_RED = hexc('#e48888');

function paintBase(b, K, seed) {
  const C = K.ramp.map(hexc), n = C.length, R = rng(seed);
  const { w, h } = b;
  if (K.wood) { paintWood(b, C, seed); return C; }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = K.base + (fbm(x, y, w, h, K.cell, 3, seed) - 0.5) * K.amp * 2 + (R() - 0.5) * K.grain;
      if (K.flutes) v += Math.sin((x / K.flutes) * Math.PI * 2) * 0.45;
      if (K.streaks) v += (fbm(x * 0.05, y, w * 0.05, h, 6, 1, seed + 5) - 0.5) * 0.8;
      if (K.granules) v += (hash(x >> 1, y >> 1, seed + 3) - 0.5) * 1.2;
      b.set(x, y, C[dq(v, x, y, n)]);
    }
  }
  // fibres: short light/dark strands
  const nf = Math.round(w * h * (K.fibres || 0));
  for (let k = 0; k < nf; k++) {
    const x0 = R() * w, y0 = R() * h, a = R() * Math.PI * 2, len = 2 + R() * (K.fibLen || 4);
    const col = R() < 0.55 ? C[n - 1] : C[Math.max(0, Math.round(K.base) - 2)];
    const t = 0.35 + R() * 0.35;
    let cx = Math.cos(a), cy = Math.sin(a) * 0.6;
    for (let s = 0; s < len; s++) { b.mix(x0 + cx * s, y0 + cy * s, col, t); if (R() < 0.3) { cy += (R() - 0.5) * 0.6; } }
  }
  const ns = Math.round(w * h * (K.specks || 0));
  for (let k = 0; k < ns; k++) b.mix(R() * w, R() * h, C[0], 0.35 + R() * 0.4);
  if (K.granules) {
    for (let k = 0; k < w * h * 0.05; k++) {
      const x = R() * w, y = R() * h, dark = R() < 0.6;
      const col = dark ? C[0] : C[n - 1];
      b.mix(x, y, col, 0.5); if (R() < 0.5) b.mix(x + 1, y, col, 0.35); if (R() < 0.3) b.mix(x, y + 1, col, 0.35);
    }
  }
  return C;
}

function paintWood(b, C, seed) {
  const { w, h } = b, n = C.length, R = rng(seed), PH = 22;
  const planks = Math.ceil(h / PH);
  const info = [];
  for (let p = 0; p < planks + 1; p++) info.push({ base: 3.1 + (hash(p, 1, seed) - 0.5) * 1.6, jx: Math.floor(hash(p, 2, seed) * w), ph: hash(p, 3, seed) * 10 });
  const knots = [];
  for (let k = 0; k < Math.max(1, Math.round(w * h / 4000)); k++) knots.push({ x: R() * w, y: R() * h, rx: 4 + R() * 4, ry: 1.6 + R() * 1.2 });
  for (let y = 0; y < h; y++) {
    const p = Math.floor(y / PH), yy = y - p * PH, I = info[p % info.length];
    for (let x = 0; x < w; x++) {
      const warp = fbm(x, y, w, h, 32, 3, seed + p) * 7;
      let v = I.base + Math.sin((y * 0.8 + warp + I.ph) * 1.25) * 0.55 + (fbm(x, y * 3, w, h * 3, 16, 2, seed + 9) - 0.5) * 1.2 + (R() - 0.5) * 0.35;
      for (const k of knots) {
        let dx = x - k.x; dx -= Math.round(dx / w) * w;
        let dy = y - k.y; dy -= Math.round(dy / h) * h;
        const d = Math.hypot(dx / k.rx, dy / k.ry);
        if (d < 2.2) v += (d < 1 ? -1.6 * (1 - d) : 0) + Math.sin(d * 4.5) * 0.5 * (2.2 - d) / 2.2;
      }
      let jd = x - I.jx; jd -= Math.round(jd / w) * w;
      if (yy === 0) v = 0.4;
      else if (yy === 1) v += 1.1;
      else if (yy === PH - 1) v -= 0.9;
      if (jd === 0 && yy > 0) v = 0.6;
      else if (jd === 1 && yy > 0) v += 0.8;
      if ((jd === 3 || jd === -3) && (yy === 4 || yy === PH - 5)) v = jd > 0 ? 0.3 : 0.5;
      b.set(x, y, C[dq(v, x, y, n)]);
    }
  }
}

// ---- finishing for sized (non tiling) sheets
function edgeDist(x, y, w, h) { return Math.min(x, y, w - 1 - x, h - 1 - y); }

function paintRules(b, C, o) {
  const { w, h } = b, R = rng(o.seed + 77);
  const step = o.rules || 8, top = o.ruleTop ?? step;
  for (let y = top - 1; y < h - 1; y += step) {
    for (let x = 0; x < w; x++) if (R() > 0.025) b.mix(x, y, INK_BLUE, 0.8);
  }
  if (o.margin != null) {
    for (let y = 0; y < h; y++) {
      if (R() > 0.03) b.mix(o.margin, y, MARGIN_RED, 0.85);
      if (R() > 0.06) b.mix(o.margin + 2, y, MARGIN_RED, 0.7);
    }
  }
}
function paintGrid(b, step) {
  const { w, h } = b;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const big = x % (step * 4) === 0 || y % (step * 4) === 0;
    if (big) b.mix(x, y, INK_BLUE2, 0.55);
    else if (x % step === 0 || y % step === 0) b.mix(x, y, INK_BLUE, 0.35);
  }
}
function coffeeRing(b, cx, cy, r, seed, strength = 1) {
  const R = rng(seed), col = hexc('#8a5428'), dark = hexc('#6a3c1a');
  const gap0 = R() * Math.PI * 2, gapW = 0.5 + R() * 0.9;
  for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const rr = r + Math.sin(a * 3 + seed) * 0.7;
    let ga = Math.abs(((a - gap0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const fade = ga < gapW ? ga / gapW : 1;
    if (d > rr - 1.4 && d < rr + 0.6) {
      if (bayer(x, y) < 0.85 * fade * strength) b.mix(x, y, d > rr - 0.4 ? dark : col, 0.32);
    } else if (d < rr - 1.4) {
      if (bayer(x, y) < 0.18 * strength && R() < 0.5) b.mix(x, y, col, 0.12);
    }
  }
  // a couple of drips
  for (let k = 0; k < 3; k++) {
    const a = R() * Math.PI * 2, d = r + 3 + R() * 4;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    b.mix(x, y, col, 0.35); if (R() < 0.5) b.mix(x + 1, y, col, 0.25);
  }
}
function crease(b, C, y0, seed, vertical = false) {
  const { w, h } = b, n = C.length;
  const len = vertical ? h : w;
  for (let s = 0; s < len; s++) {
    const off = Math.round((fbm(s, 0, len, 1, 24, 2, seed) - 0.5) * 2);
    if (hash(s, 9, seed) < 0.12) continue;
    if (vertical) { b.mix(y0 + off, s, C[n - 1], 0.55); b.mix(y0 + off + 1, s, C[0], 0.22); } else { b.mix(s, y0 + off, C[n - 1], 0.55); b.mix(s, y0 + off + 1, C[0], 0.22); }
  }
}
function dogEar(b, C, s) {
  const { w } = b, n = C.length;
  const back = C[Math.max(0, n - 3)], line = C[0];
  for (let v = 0; v <= s + 2; v++) for (let u = 0; u <= s + 2; u++) {
    const x = w - 1 - u, y = v;
    if (u + v < s) b.alpha(x, y, 0);
    else if (u <= s && v <= s) {
      // the folded flap: lit toward the fold line
      const t = (u + v - s) / s;
      b.set(x, y, t < 0.08 ? line : back);
      if (t > 0.08 && bayer(x, y) < (1 - t) * 0.5) b.mix(x, y, C[n - 1], 0.6);
      if (u === s || v === s) b.set(x, y, C[1]);
    } else if (u + v < s + 3 && (u > s || v > s)) {
      if (bayer(x, y) < 0.5) b.mix(x, y, C[0], 0.35); // soft cast shadow under the flap
    }
  }
}
function tornEdge(b, side, seed, amp = 3, period = 4) {
  const { w, h } = b;
  for (let x = 0; x < w; x++) {
    const p = x % period, tri = Math.abs(p - period / 2) / (period / 2);
    const j = Math.round(tri * amp + (hash(x, 1, seed) < 0.25 ? 1 : 0));
    for (let k = 0; k < j; k++) {
      if (side.includes('b')) b.alpha(x, h - 1 - k, 0);
      if (side.includes('t')) b.alpha(x, k, 0);
    }
  }
}
function deckle(b, seed) {
  const { w, h } = b;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeDist(x, y, w, h);
    if (d > 2) continue;
    const s = x === 0 || x === w - 1 ? y : x;
    if (d < Math.round(fbm(s, d * 7, w + h, 7, 4, 2, seed) * 3.2 - 0.6)) b.alpha(x, y, 0);
  }
}
function ageEdges(b, C, amount, E, seed) {
  const { w, h } = b, n = C.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeDist(x, y, w, h) + (fbm(x, y, w, h, 12, 2, seed) - 0.5) * E * 0.9;
    if (d >= E) continue;
    const t = (1 - d / E) * amount;
    if (bayer(x, y) < t) b.mix(x, y, C[0], 0.32);
    if (d < 1.2 && bayer(x, y) < amount) b.mix(x, y, C[0], 0.25);
  }
}
function spine(b, C, single) {
  const { w, h } = b, cx = single ? 0 : w / 2, W = single ? 10 : 14;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.abs(x - cx);
    if (d > W) continue;
    const t = 1 - d / W;
    if (bayer(x, y) < t * t * 1.1) b.mix(x, y, C[0], 0.38);
    if (!single && d < 0.6) b.mix(x, y, C[0], 0.6);
  }
  // page-block edges (stack of pages) at left/right borders
  for (let y = 0; y < h; y++) for (let k = 0; k < 2; k++) {
    if (!single) b.mix(k, y, C[(y + k) % 2 ? 1 : 0], 0.35);
    b.mix(w - 1 - k, y, C[(y + k) % 2 ? 1 : 0], 0.35);
  }
}
function stickyShade(b, C) {
  const { w, h } = b;
  for (let y = 0; y < Math.min(h, 7); y++) for (let x = 0; x < w; x++) if (bayer(x, y) < 0.5) b.mix(x, y, C[1], 0.3);
  // curl at the bottom-right corner
  for (let y = h - 12; y < h; y++) for (let x = w - 16; x < w; x++) {
    const u = (x - (w - 16)) / 16, v = (y - (h - 12)) / 12, t = u * v;
    if (bayer(x, y) < t * 1.3) b.mix(x, y, C[0], 0.35);
  }
}
function punchHoles(b, xs, step, top) {
  const { h } = b;
  for (let y = top; y < h - 4; y += step) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4.5) b.alpha(xs + dx, y + dy, 0);
  }
}
function leatherFinish(b, C) {
  const { w, h } = b;
  const g1 = hexc('#e5a320'), g2 = hexc('#ffd86a');
  const ins = 6;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = edgeDist(x, y, w, h);
    if (d < 4 && bayer(x, y) < (4 - d) / 5) b.mix(x, y, C[0], 0.5);
    if (d === ins) b.set(x, y, (x + y) % 5 === 0 ? g2 : g1);
    if (d === ins + 2 && (x + y) % 2 === 0) b.mix(x, y, g1, 0.7);
  }
}

const tileCache = new Map();
export function paperTile(kind) {
  if (tileCache.has(kind)) return tileCache.get(kind);
  const K = KINDS[kind] || KINDS.parchment;
  const [w, h] = K.tile;
  const b = new Buf(w, h, true);
  const seed = 11 + PAPER_KINDS.indexOf(kind) * 13;
  const C = paintBase(b, K, seed);
  if (K.rules) paintRules(b, C, { rules: K.rules, ruleTop: K.rules, seed });
  if (K.grid) paintGrid(b, K.grid);
  const out = { url: b.url(), w, h, base: K.ramp[Math.max(0, Math.round(K.base || 3))] };
  tileCache.set(kind, out);
  return out;
}

const texCache = new Map();
// w, h in CSS px. opts: { px, seed, edge, deckle, creases:[fractions], vcreases, stains, dogear, torn:'t'|'b'|'tb',
//   rules, ruleTop, margin, holes, spine, single, sticky, leather }
export function paperTexture(kind, w, h, opts = {}) {
  const px = opts.px || PX;
  const tw = Math.max(4, Math.round(w / px)), th = Math.max(4, Math.round(h / px));
  const key = `${kind}|${tw}x${th}|${JSON.stringify(opts)}`;
  if (texCache.has(key)) return texCache.get(key);
  const K = KINDS[kind] || KINDS.parchment;
  const seed = opts.seed ?? (7 + PAPER_KINDS.indexOf(kind) * 31);
  const b = new Buf(tw, th, false);
  const C = paintBase(b, K, seed);
  const R = rng(seed + 101);
  if (kind === 'notebook' || opts.rules) paintRules(b, C, { rules: opts.rules || K.rules || 8, ruleTop: opts.ruleTop, margin: opts.margin, seed });
  if (kind === 'graph') paintGrid(b, K.grid);
  if (kind === 'spread' || opts.spine) spine(b, C, !!opts.single);
  if (kind === 'sticky' || opts.sticky) stickyShade(b, C);
  if (kind === 'leather' || opts.leather) leatherFinish(b, C);
  for (const f of opts.creases || []) crease(b, C, Math.round(th * f), seed + Math.round(f * 100));
  for (const f of opts.vcreases || []) crease(b, C, Math.round(tw * f), seed + 7 + Math.round(f * 100), true);
  for (let k = 0; k < (opts.stains || 0); k++) {
    const r = 9 + R() * 5;
    coffeeRing(b, tw * (0.55 + R() * 0.35), th * (0.08 + R() * 0.3), r, seed + k, 0.8);
  }
  if (opts.edge) ageEdges(b, C, opts.edge, opts.edgeW || 10, seed);
  if (opts.holes) punchHoles(b, opts.holes, 16, 10);
  if (opts.torn) tornEdge(b, opts.torn, seed);
  if (opts.deckle) deckle(b, seed);
  if (opts.dogear) dogEar(b, C, opts.dogear === true ? 9 : opts.dogear);
  const url = b.url();
  if (texCache.size > 80) texCache.delete(texCache.keys().next().value);
  texCache.set(key, url);
  return url;
}

// border-image strip: paper with jagged/torn outer edge (slice = 4 texels)
const tornCache = new Map();
function tornURL(kind, sides = 'trbl') {
  const key = kind + sides;
  if (tornCache.has(key)) return tornCache.get(key);
  const K = KINDS[kind] || KINDS.parchment;
  const N = 24, b = new Buf(N, N, true);
  paintBase(b, K, 5);
  b.wrap = false;
  const jag = (s, side) => Math.round(hash(s, side, 3) * 2.2 + (hash(s >> 1, side, 4) * 1.4));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (sides.includes('t') && y < jag(x, 1)) b.alpha(x, y, 0);
    if (sides.includes('b') && N - 1 - y < jag(x, 2)) b.alpha(x, y, 0);
    if (sides.includes('l') && x < jag(y, 3)) b.alpha(x, y, 0);
    if (sides.includes('r') && N - 1 - x < jag(y, 4)) b.alpha(x, y, 0);
  }
  const url = b.url();
  tornCache.set(key, url);
  return url;
}
const zigCache = new Map();
function zigURL(kind) {
  if (zigCache.has(kind)) return zigCache.get(kind);
  const K = KINDS[kind] || KINDS.receipt;
  const W = 16, H = 16, b = new Buf(W, H, true);
  paintBase(b, K, 9);
  b.wrap = false;
  for (let x = 0; x < W; x++) {
    const p = x % 4, d = [0, 1, 2, 1][p];
    for (let k = 0; k <= d; k++) { b.alpha(x, k, 0); b.alpha(x, H - 1 - k, 0); }
  }
  const url = b.url();
  zigCache.set(kind, url);
  return url;
}

// ===========================================================================
// decorations (texel canvases)
// ===========================================================================
const SILVER = ['#4c5064', '#7a7e94', '#a8acc0', '#d0d4e2', '#f2f4fa'].map(hexc);
const OUTL = hexc('#2a1a14');
function fromRows(rows, pal) {
  const b = new Buf(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && pal[ch]) b.set(x, y, hexc(pal[ch])); }));
  return b;
}
function outlineBuf(b, col = OUTL) {
  const { w, h } = b, o = new Buf(w + 2, h + 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (b.getA(x, y)) continue;
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (b.getA(x + dx, y + dy) > 128) near = true;
    if (near) o.set(x + 1, y + 1, col);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = b.i(x, y); if (b.d[i + 3]) o.set(x + 1, y + 1, [b.d[i], b.d[i + 1], b.d[i + 2]], b.d[i + 3]); }
  // also outline the outer ring
  for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
    if (o.getA(x, y)) continue;
    const xi = x - 1, yi = y - 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (b.getA(xi + dx, yi + dy) > 128) { o.set(x, y, col); break; }
  }
  return o;
}

const DECO = {
  coffee({ seed = 3, r = 12 } = {}) {
    const N = r * 2 + 10, b = new Buf(N, N);
    // paint into a transparent buffer: use over() with a fake opaque base
    const tmp = new Buf(N, N); tmp.d.fill(255);
    coffeeRing(tmp, N / 2, N / 2, r, seed, 1);
    for (let i = 0; i < N * N; i++) {
      const k = i * 4;
      if (tmp.d[k] !== 255 || tmp.d[k + 1] !== 255) {
        const a = 1 - tmp.d[k + 2] / 255; // amount of tint
        b.d[k] = 138; b.d[k + 1] = 84; b.d[k + 2] = 40; b.d[k + 3] = clamp(a * 255 * 1.7, 0, 150);
      }
    }
    return b;
  },
  tape({ variant = 'pink', w = 30, h = 10, seed = 1 } = {}) {
    const V = {
      pink: ['#f4a6ba', '#fbd0dc', 'stripe'], mint: ['#94d8bc', '#d0f2e2', 'dots'], yellow: ['#f2d064', '#fff0a8', 'grid'],
      blue: ['#9cc0ec', '#d6e6fa', 'stripe'], plain: ['#e8dcc0', '#f6eedc', 'plain'], red: ['#e87a6a', '#fbc2b0', 'dots'],
    }[variant] || ['#f4a6ba', '#fbd0dc', 'stripe'];
    const c1 = hexc(V[0]), c2 = hexc(V[1]), pat = V[2], R = rng(seed);
    const b = new Buf(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let on = false;
      if (pat === 'stripe') on = md(x + y, 6) < 2;
      else if (pat === 'dots') on = x % 5 === 2 && y % 4 === 1 || x % 5 === 0 && y % 4 === 3;
      else if (pat === 'grid') on = x % 4 === 0 || y % 4 === 0;
      const c = on ? c1 : c2;
      b.set(x, y, c, 190 + (R() < 0.2 ? -25 : 0));
      if (y === 0) b.set(x, y, c2, 220);
      if (y === h - 1) b.set(x, y, c1, 200);
    }
    for (let y = 0; y < h; y++) {
      const j1 = (y % 3 === 1 ? 1 : 0) + (R() < 0.3 ? 1 : 0), j2 = (y % 3 === 0 ? 1 : 0) + (R() < 0.3 ? 1 : 0);
      for (let k = 0; k < j1; k++) b.alpha(k, y, 0);
      for (let k = 0; k < j2; k++) b.alpha(w - 1 - k, y, 0);
    }
    return b;
  },
  staple() {
    return fromRows([
      '.dbbbbbbbbbd.',
      'daaaaaaaaaaad',
      'c...........c',
    ], { a: '#d0d4e2', b: '#f2f4fa', c: '#4c5064', d: '#7a7e94' });
  },
  postage({ variant = 'red', seed = 2 } = {}) {
    const W = 22, H = 26, b = new Buf(W, H);
    const V = { red: ['#c8343a', '#f7e3c0', '#7a1a22'], blue: ['#2c5cb0', '#d8e8f8', '#1a3070'], green: ['#3f8f5f', '#e0f0d0', '#1f3f2c'] }[variant] || ['#c8343a', '#f7e3c0', '#7a1a22'];
    const frame = hexc(V[0]), bg = hexc(V[1]), dk = hexc(V[2]), white = hexc('#fbf7ee');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = edgeDist(x, y, W, H);
      let c = white;
      if (d >= 2) c = frame;
      if (d >= 3) c = bg;
      b.set(x, y, c);
      if (d === 0 && (((x === 0 || x === W - 1) ? y : x) % 3 === 1)) b.alpha(x, y, 0); // perforations
    }
    const R = rng(seed);
    if (variant === 'blue') {
      // mountains + sun
      for (let y = 4; y < H - 7; y++) for (let x = 4; x < W - 4; x++) {
        if (Math.hypot(x - 14, y - 8) < 2.6) b.set(x, y, hexc('#ffd23f'));
        const m1 = 16 - Math.abs(x - 8) * 1.1, m2 = 17 - Math.abs(x - 14) * 0.9;
        if (y > 22 - m1 * 0.55 || y > 23 - m2 * 0.6) b.set(x, y, (x + y) % 3 ? dk : frame);
        if (y > 22 - m1 * 0.55 && y < 24 - m1 * 0.55) b.set(x, y, white);
      }
    } else if (variant === 'green') {
      // fish
      const fish = ['...ggg....', '.gggggg.g.', 'gwkgggggg.', 'gggggggg..', '.gggggg.g.', '...ggg....'];
      fish.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') b.set(6 + xx, 8 + yy, ch === 'g' ? frame : ch === 'w' ? white : dk); }));
      for (let x = 4; x < W - 4; x++) if ((x + 1) % 3) b.set(x, 16, hexc('#7ec0e0'));
    } else {
      // maple leaf
      const leaf = [
        '....r....', '...rrr...', '.r.rrr.r.', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '.rrrrrrr.', 'rr..r..rr', '....r....', '....r....',
      ];
      leaf.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') b.set(6 + xx, 5 + yy, frame); }));
    }
    // value "5": 3x5 digits
    const five = ['###', '#..', '###', '..#', '##.'];
    five.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch === '#') b.set(W - 8 + xx, H - 9 + yy, dk); }));
    if (R() < 0) b.set(0, 0, dk);
    return b;
  },
  postmark({ color = '#2d3550', seed = 4 } = {}) {
    const W = 44, H = 24, b = new Buf(W, H), c = hexc(color), R = rng(seed);
    const cx = 11.5, cy = 11.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      let on = (d > 9.6 && d < 11) || (d > 6.4 && d < 7.4);
      if (!on && x > 22) {
        for (const ly of [5, 9, 13, 17]) if (Math.round(ly + Math.sin(x * 0.55 + ly) * 1.3) === y) on = true;
      }
      if (on && R() > 0.18) b.set(x, y, c, 200);
    }
    // tiny date ticks in the middle
    for (const [x, y] of [[8, 11], [9, 11], [11, 11], [12, 11], [14, 11], [15, 11], [10, 9], [11, 9], [12, 9], [13, 9], [10, 14], [11, 14], [12, 14]]) if (R() > 0.1) b.set(x, y, c, 200);
    return b;
  },
  seal({ color = 'red', letter = 'R' } = {}) {
    const ramp = (color === 'gold' ? ['#6a3c08', '#9a5e10', '#c88a1c', '#e8b030', '#ffd860'] : color === 'green' ? ['#12301e', '#1f4a2e', '#2f6a44', '#438a5a', '#64ac78'] : ['#4e1018', '#741a22', '#9e242c', '#c4343a', '#e05a52']).map(hexc);
    const N = 22, b = new Buf(N, N), c = 10.5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const r = 9.2 + Math.sin(a * 5 + 1) * 0.8 + Math.sin(a * 9) * 0.4;
      if (d > r) continue;
      let v = 2.4 + (-dx - dy) / r * 0.9;
      if (d > r - 1.2) v -= 0.8;
      if (d > 5.8 && d < 7) v -= 0.9; else if (d >= 7 && d < 7.8) v += 0.6;
      b.set(x, y, ramp[dq(v, x, y, ramp.length)]);
    }
    // embossed letter (5x7)
    const L = {
      R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
      F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
      B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    }[letter] || ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'];
    L.forEach((r, yy) => [...r].forEach((ch, xx) => {
      if (ch !== '#') return;
      b.set(8 + xx, 7 + yy, ramp[0]);
      if (!L[yy - 1] || L[yy - 1][xx] !== '#') b.set(8 + xx, 6 + yy, ramp[4]);
    }));
    return b;
  },
  pencil({ len = 64 } = {}) {
    const H = 7, b = new Buf(len, H);
    const pink = ['#a8485a', '#d06a7a', '#f0909c', '#ffb6be'].map(hexc);
    const met = SILVER, yel = ['#9a5a10', '#d08a18', '#f2b828', '#ffd85a', '#fff0a0'].map(hexc);
    const wood = ['#a0703c', '#d4a464', '#f0cc90'].map(hexc), lead = ['#22202a', '#4a4858'].map(hexc);
    const shade = [3, 4, 3, 2, 2, 1, 0];
    for (let x = 0; x < len; x++) for (let y = 0; y < H; y++) {
      let c = null;
      if (x < 6) c = pink[clamp([3, 3, 2, 2, 1, 1, 0][y], 0, 3)];
      else if (x < 11) c = met[clamp(shade[y] + ((x - 6) % 2 ? 0 : -1), 0, 4)];
      else if (x < len - 12) { c = yel[clamp(shade[y], 0, 4)]; if (y === 2 && x % 9 === 0) c = yel[1]; }
      else {
        const k = x - (len - 12), half = 3.5 * (1 - k / 12);
        if (Math.abs(y - 3) > half) continue;
        c = k > 8 ? lead[y < 3 ? 1 : 0] : wood[y < 3 ? 2 : y > 3 ? 0 : 1];
      }
      if (c) b.set(x, y, c);
    }
    return outlineBuf(b);
  },
  mug({ color = 'cream' } = {}) {
    const N = 34, b = new Buf(N + 8, N), c = N / 2 - 0.5;
    const cer = (color === 'red' ? ['#6a1a20', '#9e2a2c', '#c8423a', '#e06a5a', '#f8a088'] : ['#8a7a60', '#c4b494', '#e8dcc0', '#f6eedc', '#fffaf0']).map(hexc);
    const cof = ['#24120a', '#3a1e10', '#5a3018', '#8a5428', '#c08850'].map(hexc);
    // handle
    for (let y = 0; y < N; y++) for (let x = N - 4; x < N + 8; x++) {
      const dx = x - (N + 1), dy = y - c;
      const d = Math.hypot(dx / 1.2, dy);
      if (d > 3 && d < 6.6 && x > N - 4) b.set(x, y, cer[dq(2.2 - dy / 6, x, y, 5)]);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > 15.5) continue;
      if (d > 12.4) b.set(x, y, cer[dq(2.6 + (-dx - dy) / 15 * 1.4, x, y, 5)]);
      else if (d > 11.4) b.set(x, y, cer[1]);
      else {
        let v = 1.4 + (dx + dy) / 12 * 0.6;
        if (d > 9.8) v += 1.1; // crema ring
        if (Math.hypot(dx + 4, dy + 4) < 2.2) v = 4; // reflection
        else if (Math.hypot(dx + 4, dy + 4) < 3.2) v = 3.2;
        b.set(x, y, cof[dq(v, x, y, 5)]);
      }
    }
    return outlineBuf(b);
  },
  ribbon({ color = '#b0303a', len = 30 } = {}) {
    const b = new Buf(7, len), c = hexc(color), dk = hexc('#6a1a22'), lt = hexc('#e06a62');
    for (let y = 0; y < len; y++) for (let x = 0; x < 7; x++) {
      if (y > len - 4 && Math.abs(x - 3) < 4 - (len - y)) continue; // swallowtail notch
      b.set(x, y, x === 0 ? dk : x === 1 ? lt : x === 6 ? dk : c);
    }
    return b;
  },
  ring() { // notebook spiral ring
    return fromRows([
      '.bbbbbbbbb.',
      'baaaaaaaaab',
      'c.........c',
    ], { a: '#d0d4e2', b: '#7a7e94', c: '#4c5064' });
  },
  dust() {
    return fromRows(['.aa.', 'abba', 'abba', '.aa.'], { a: '#d8c8a8', b: '#f4ead4' });
  },
};
for (const s of ['paperclip', 'pushpin', 'pen']) {
  DECO[s] = () => {
    if (!hasSprite(s)) return DECO.staple();
    const src = spriteCanvas(s, 1), b = new Buf(src.width, src.height);
    const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    b.d.set(d);
    return b;
  };
}
export const DECO_NAMES = Object.keys(DECO);

const decoCache = new Map();
function decoBuf(name, opts = {}) {
  const key = name + JSON.stringify(opts);
  if (decoCache.has(key)) return decoCache.get(key);
  const f = DECO[name] || DECO.staple;
  const b = f(opts);
  const out = { url: b.url(), w: b.w, h: b.h, buf: b };
  decoCache.set(key, out);
  return out;
}
export function decoCanvas(name, opts = {}) {
  const { buf } = decoBuf(name, opts);
  return buf.canvas();
}
export function decoURL(name, opts = {}) { return decoBuf(name, opts).url; }
// <img> for a deco. opts: { x, y (css px, absolute), rot (deg), cls, px, style, ...painter opts }
export function deco(name, opts = {}) {
  const { x, y, rot = 0, cls = '', px = PX, style = '', right, bottom, ...po } = opts;
  const d = decoBuf(name, po);
  const pos = [
    x != null ? `left:${x}px` : '', y != null ? `top:${y}px` : '', right != null ? `right:${right}px` : '', bottom != null ? `bottom:${bottom}px` : '',
  ].filter(Boolean).join(';');
  const abs = pos ? 'pp-abs' : '';
  return `<img class="pp-px pp-deco pp-d-${name} ${abs} ${cls}" src="${d.url}" width="${d.w * px}" height="${d.h * px}" alt="" draggable="false" style="${pos};--r:${rot}deg;${style}">`;
}

// ===========================================================================
// little HTML helpers
// ===========================================================================
let speckURL = null;
function speckle() {
  if (speckURL) return speckURL;
  const N = 32, b = new Buf(N, N, true), R = rng(9);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = fbm(x, y, N, N, 8, 2, 4);
    b.set(x, y, [0, 0, 0], n < 0.34 || R() < 0.08 ? 60 : 255);
  }
  speckURL = b.url();
  return speckURL;
}
export function stamp(text, color = '#c0392b', rot = -8, opts = {}) {
  injectPaperCSS();
  const anim = opts.anim === false ? '' : 'pp-stamp--in';
  return `<span class="pp-stamp ${anim} ${opts.cls || ''}" style="--sc:${color};--sr:${rot}deg;--sd:${opts.delay || 0}ms">${esc(text)}</span>`;
}
export function sticker(iconHtml, rot = (Math.random() * 2 - 1) * 12, opts = {}) {
  injectPaperCSS();
  return `<span class="pp-sticker ${opts.anim === false ? '' : 'pp-sticker--in'} ${opts.cls || ''}" style="--r:${rot.toFixed(1)}deg;--sd:${opts.delay || 0}ms">${iconHtml}</span>`;
}
export function tape(variant = 'pink', rot = (Math.random() * 2 - 1) * 8, opts = {}) {
  return deco('tape', { variant, rot, cls: `pp-tape ${opts.cls || ''}`, w: opts.w || 30, seed: opts.seed || 1, ...(opts.pos || {}) });
}
export function paperclip(rot = 0, opts = {}) { return deco('paperclip', { rot, cls: `pp-clip ${opts.cls || ''}`, ...(opts.pos || {}) }); }
export function handwriting(text, opts = {}) {
  injectPaperCSS();
  const t = String(text ?? '');
  const n = Math.max(1, [...t].length);
  const speed = opts.speed || 1;
  const dur = Math.round(clamp(n * 45, 250, 2400) / speed);
  const col = opts.color ? `--hw-c:${opts.color};` : '';
  return `<span class="pp-hw ${opts.cls || ''}" style="--hn:${n};--hd:${opts.delay || 0}ms;--hdur:${dur}ms;${col}">${esc(t)}</span>`;
}
// pixel arrow (◀) as crisp svg
export function arrowSVG(dir = 'left', px = 3) {
  const rows = ['...#', '..##', '.###', '####', '.###', '..##', '...#'];
  let d = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${dir === 'left' ? x : 3 - x} ${y}h1v1h-1z`; }));
  return `<svg class="pp-arrow" width="${4 * px}" height="${7 * px}" viewBox="0 0 4 7" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}

// ===========================================================================
// CSS injection
// ===========================================================================
let injected = false;
export function injectPaperCSS() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const rules = [];
  for (const k of PAPER_KINDS) {
    const t = paperTile(k);
    rules.push(`.paper--${k}{--pp-tile:url(${t.url});background-color:${t.base};background-image:url(${t.url});background-size:${t.w * PX}px ${t.h * PX}px;}`);
    rules.push(`.paper--${k}.paper--torn{border:${4 * PX}px solid transparent;border-image:url(${tornURL(k)}) 4 / ${4 * PX}px round;background-clip:padding-box;}`);
  }
  // notebook: margin line on top of the tile; book spread: spine strip
  const margin = new Buf(4, 8, true);
  for (let y = 0; y < 8; y++) { margin.set(0, y, MARGIN_RED, y === 3 ? 160 : 230); margin.set(2, y, MARGIN_RED, y === 6 ? 140 : 200); }
  rules.push(`.paper--notebook{background-image:url(${margin.url()}),url(${paperTile('notebook').url});background-repeat:repeat-y,repeat;background-position:${12 * PX}px 0,0 0;background-size:${4 * PX}px ${8 * PX}px,${96 * PX}px ${96 * PX}px;}`);
  const sp = new Buf(32, 8, true), C = KINDS.book.ramp.map(hexc);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) {
    const d = Math.abs(x - 15.5), t = 1 - d / 16;
    if (bayer(x, y) < t * t * 1.1) sp.set(x, y, C[0], 95);
    if (d < 1) sp.set(x, y, C[0], 150);
  }
  rules.push(`.paper--spread{background-image:url(${sp.url()}),url(${paperTile('book').url});background-repeat:repeat-y,repeat;background-position:center 0,0 0;background-size:${32 * PX}px ${8 * PX}px,${96 * PX}px ${96 * PX}px;}`);
  rules.push(`.paper--receipt.paper--zig,.pp-sheet--receipt{border-top:${4 * PX}px solid transparent;border-bottom:${4 * PX}px solid transparent;border-image:url(${zigURL('receipt')}) 4 0 / ${4 * PX}px 0 round;background-clip:padding-box;}`);
  rules.push(`:root{--pp-speck:url(${speckle()});--pp-px:${PX}px;}`);
  const st = document.createElement('style');
  st.id = 'pp-tex';
  st.textContent = rules.join('\n');
  document.head.appendChild(st);
}

// ===========================================================================
// modal papers
// ===========================================================================
let sfxDefault = null;
export function setPaperSfx(fn) { sfxDefault = typeof fn === 'function' ? fn : null; }
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const MODAL = {
  letter: { tex: 'parchment', w: 420, ex: { edge: 0.65, deckle: 1, creases: [0.34, 0.67], stains: 1, dogear: 8 }, enter: 'slide', exit: 'slide' },
  mail: { tex: 'cream', w: 400, ex: { edge: 0.25, creases: [0.34, 0.67] }, enter: 'mail', exit: 'slide' },
  note: { tex: 'sticky', w: 280, ex: { sticky: 1 }, enter: 'slide', exit: 'crumple' },
  receipt: { tex: 'receipt', w: 260, ex: {}, enter: 'print', exit: 'crumple' },
  notebook: { tex: 'notebook', w: 440, ex: { rules: 8, ruleTop: 16, margin: 18, holes: 6, edge: 0.15 }, enter: 'slide', exit: 'slide' },
  postcard: { tex: 'postcard', w: 480, ex: { edge: 0.3, edgeW: 6, dogear: 6 }, enter: 'slide', exit: 'slide' },
  book: { tex: 'spread', w: 680, ex: { edge: 0.4, edgeW: 8 }, enter: 'book', exit: 'slide' },
};
const stack = [];
let keyBound = false;
function onKey(e) {
  if (e.key !== 'Escape' || !stack.length) return;
  const top = stack[stack.length - 1];
  if (!top.dismissable) return;
  e.preventDefault(); e.stopImmediatePropagation();
  top.close();
}

function tween(ms, fn, ease = (t) => t) {
  return new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      fn(ease(t), t);
      if (t >= 1) res(); else requestAnimationFrame(step);
    };
    if (ms <= 0) { fn(1, 1); res(); return; }
    requestAnimationFrame(step);
  });
}
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const fin = (a, ms) => (a ? Promise.race([a.finished.catch(() => {}), new Promise((r) => setTimeout(r, ms + 200))]) : Promise.resolve());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function openPaper(o = {}) {
  injectPaperCSS();
  const kind = MODAL[o.kind] ? o.kind : 'letter';
  const K = MODAL[kind];
  const sfx = (n, x) => { const f = typeof o.sfx === 'function' ? o.sfx : sfxDefault; if (f) { try { f(n, x); } catch { /* optional */ } } };
  const dismissable = o.dismissable !== false;
  const root = o.root || document.body;
  const R = Math.random;
  const rot = kind === 'book' ? 0 : (R() < 0.5 ? -1 : 1) * (0.5 + R() * 1.3);
  const narrow = innerWidth < 600;
  const single = kind === 'book' && narrow;
  const width = o.width || (single ? 360 : K.w);

  const ov = document.createElement('div');
  ov.className = `pp-ov pp-k-${kind}${single ? ' pp-single' : ''}`;
  ov.innerHTML = `
    <div class="pp-dim"></div>
    <div class="pp-stage">
      <div class="pp-sheet pp-sheet--${kind}" style="--w:${width}px;--rot:${rot.toFixed(2)}deg" role="dialog" aria-modal="true">
        <div class="pp-decor"></div>
        ${dismissable ? `<button type="button" class="pp-x" aria-label="Close">${arrowSVG('left', 3)}</button>` : ''}
        ${o.title ? `<h2 class="pp-title">${o.title}</h2>` : ''}
        <div class="pp-body"></div>
        ${o.actions && o.actions.length ? '<div class="pp-acts"></div>' : ''}
      </div>
    </div>`;
  const sheet = ov.querySelector('.pp-sheet'), body = ov.querySelector('.pp-body'), decor = ov.querySelector('.pp-decor');
  const stage = ov.querySelector('.pp-stage'), dim = ov.querySelector('.pp-dim');
  if (o.node) body.appendChild(o.node); else if (o.html != null) body.innerHTML = o.html;
  if (kind === 'book') { const t = sheet.querySelector('.pp-title'); if (t) body.prepend(t); }

  // per-kind props
  const props = {
    note: () => tape(['pink', 'mint', 'yellow', 'blue'][(R() * 4) | 0], (R() * 2 - 1) * 6, { cls: 'pp-note-tape' }),
    letter: () => deco('seal', { cls: 'pp-letter-seal', rot: (R() * 2 - 1) * 10 }),
    postcard: () => `${deco('postage', { variant: ['red', 'blue', 'green'][(R() * 3) | 0], cls: 'pp-pc-stamp', rot: 3 })}${deco('postmark', { cls: 'pp-pc-mark', rot: -8 })}<i class="pp-pc-line"></i>`,
    notebook: () => Array.from({ length: 30 }, (_, i) => deco('ring', { cls: 'pp-nb-ring', style: `top:${10 * PX + i * 16 * PX - 3}px` })).join(''),
    book: () => deco('ribbon', { cls: 'pp-book-ribbon', len: 34 }),
    mail: () => '',
    receipt: () => '',
  };
  decor.innerHTML = props[kind]();

  // actions
  const api = { el: ov, sheet, body, close: null, closed: false };
  const acts = ov.querySelector('.pp-acts');
  if (acts) {
    o.actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pp-btn${a.primary ? ' pp-btn--go' : ''}${a.cls ? ` ${a.cls}` : ''}`;
      b.style.setProperty('--r', `${((R() * 2 - 1) * 2.5).toFixed(1)}deg`);
      const ic = a.icon ? (hasSprite(a.icon) ? `<img class="pp-px" src="${spriteCanvas(a.icon, 2).toDataURL()}" alt="">` : a.icon) : '';
      b.innerHTML = `${ic}${a.label ? `<span>${esc(a.label)}</span>` : ''}`;
      if (a.title) b.title = a.title;
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        sfx('click');
        let keep = false;
        try { keep = (await a.onClick?.(api, e)) === false; } catch (err) { console.error(err); }
        if (!keep) api.close(a.primary ? 'slide' : undefined);
      });
      acts.appendChild(b);
    });
  }
  ov.querySelector('.pp-x')?.addEventListener('click', (e) => { e.stopPropagation(); sfx('click'); api.close(); });
  if (dismissable) dim.addEventListener('click', () => api.close());
  stage.addEventListener('click', (e) => { if (e.target === stage && dismissable) api.close(); });

  root.appendChild(ov);
  if (!keyBound) { window.addEventListener('keydown', onKey, true); keyBound = true; }
  const entry = { close: () => api.close(), dismissable };
  stack.push(entry);

  // texture sized to the sheet
  let tw = 0, th = 0;
  const texOpts = { ...K.ex, seed: (R() * 1000) | 0 };
  const retex = () => {
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    if (!w || !h || (Math.abs(w - tw) < PX * 2 && Math.abs(h - th) < PX * 2)) return;
    tw = w; th = h;
    const ex = { ...texOpts };
    if (kind === 'book') { ex.spine = 1; ex.single = single; }
    sheet.style.backgroundImage = `url(${paperTexture(K.tex, w, h, ex)})`;
  };
  retex();
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => retex()); ro.observe(sheet); }

  // ---------------------------------------------------------------- enter
  const enter = async () => {
    ov.classList.add('on');
    if (reduced()) { sheet.style.transform = `rotate(${rot}deg)`; return; }
    if (K.enter === 'mail') await enterMail(ov, sheet, stage, rot, sfx);
    else if (K.enter === 'book') await enterBook(ov, sheet, stage, single, sfx, o.title);
    else if (K.enter === 'print') {
      sfx('paper', { pitch: 1.3 });
      const a = anim(sheet, [
        { transform: 'translateY(-70vh) rotate(0deg)', clipPath: 'inset(0 0 0 0)' },
        { transform: `translateY(14px) rotate(${-rot}deg)`, offset: 0.6 },
        { transform: `translateY(-4px) rotate(${rot * 1.4}deg)`, offset: 0.8 },
        { transform: `rotate(${rot}deg)` },
      ], { duration: 620, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      await fin(a, 620);
    } else {
      sfx('paper', { pitch: 0.9 + R() * 0.3 });
      const side = R() < 0.5 ? -1 : 1;
      const a = anim(sheet, [
        { transform: `translate(${side * 30}vw, 100vh) rotate(${side * 22}deg)` },
        { transform: `translate(0, -12px) rotate(${-rot * 1.6}deg)`, offset: 0.58 },
        { transform: `translate(0, 3px) rotate(${rot * 2.2}deg)`, offset: 0.74 },
        { transform: `rotate(${rot * 0.5}deg)`, offset: 0.88 },
        { transform: `rotate(${rot}deg)` },
      ], { duration: 720, easing: 'cubic-bezier(.25,.9,.35,1)', fill: 'backwards' });
      await fin(a, 720);
    }
    sheet.style.transform = `rotate(${rot}deg)`;
  };
  api.ready = enter();

  // ---------------------------------------------------------------- close
  api.close = async (how) => {
    if (api.closed) return;
    api.closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    ov.classList.add('closing');
    how = how || K.exit;
    if (!reduced()) {
      await api.ready;
      ov.querySelectorAll('.pp-envb,.pp-envf,.pp-bookc,.pp-leaf').forEach((e) => e.remove());
      if (how === 'crumple') {
        sfx('paper', { pitch: 0.7 });
        const N = 14, pts0 = [], pts1 = [];
        for (let k = 0; k < N; k++) {
          const t = k / N, p = t * 4, s = Math.floor(p), f = p - s;
          const P = [[f, 0], [1, f], [1 - f, 1], [0, 1 - f]][s];
          pts0.push(`${(P[0] * 100).toFixed(1)}% ${(P[1] * 100).toFixed(1)}%`);
          const a = t * Math.PI * 2, rr = 14 + R() * 18;
          pts1.push(`${(50 + Math.cos(a) * rr).toFixed(1)}% ${(50 + Math.sin(a) * rr).toFixed(1)}%`);
        }
        const sx = R() < 0.5 ? -1 : 1;
        const a1 = anim(sheet, [
          { clipPath: `polygon(${pts0.join(',')})`, transform: `rotate(${rot}deg)`, filter: 'brightness(1)' },
          { clipPath: `polygon(${pts1.join(',')})`, transform: `rotate(${rot + sx * 40}deg) scale(.55)`, filter: 'brightness(.88)' },
        ], { duration: 260, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
        await fin(a1, 260);
        sfx('whoosh', { volume: 0.5 });
        const a2 = anim(sheet, [
          { clipPath: `polygon(${pts1.join(',')})`, transform: `rotate(${rot + sx * 40}deg) scale(.55)`, filter: 'brightness(.88)' },
          { clipPath: `polygon(${pts1.join(',')})`, transform: `translate(${sx * 26}vw, -14vh) rotate(${rot + sx * 260}deg) scale(.32)`, filter: 'brightness(.88)', offset: 0.45 },
          { clipPath: `polygon(${pts1.join(',')})`, transform: `translate(${sx * 44}vw, 90vh) rotate(${rot + sx * 520}deg) scale(.28)`, filter: 'brightness(.88)' },
        ], { duration: 480, easing: 'cubic-bezier(.3,.2,.7,1)', fill: 'forwards' });
        anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, fill: 'forwards' });
        await fin(a2, 480);
      } else {
        sfx('whoosh', { volume: 0.45 });
        const sx = R() < 0.5 ? -1 : 1;
        const a = anim(sheet, [
          { transform: `rotate(${rot}deg)` },
          { transform: `translate(${-sx * 10}px, -14px) rotate(${rot - sx * 2}deg)`, offset: 0.22 },
          { transform: `translate(${sx * 110}vw, 18vh) rotate(${rot + sx * 24}deg)` },
        ], { duration: 440, easing: 'cubic-bezier(.5,0,.85,.4)', fill: 'forwards' });
        anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 440, fill: 'forwards' });
        await fin(a, 440);
      }
    }
    if (ro) ro.disconnect();
    ov.remove();
    try { o.onClose?.(); } catch (e) { console.error(e); }
  };
  return api;
}

// ---- mail: envelope slides in, flap opens, letter slides up out of it
async function enterMail(ov, sheet, stage, rot, sfx) {
  const E = Math.min(340, innerWidth - 40), EH = Math.round(E * 0.62);
  const kraft = (w, h, ex = {}) => paperTexture('kraft', w, h, { edge: 0.35, edgeW: 5, seed: 41, ...ex });
  const flapH = Math.round(EH * 0.6);
  const back = document.createElement('div');
  back.className = 'pp-envb';
  back.style.cssText = `width:${E}px;height:${EH}px;`;
  back.innerHTML = `<div class="pp-env-in" style="background-image:url(${paperTexture('kraft', E, EH, { seed: 43, edge: 0.9, edgeW: 30 })})"></div>
    <div class="pp-flap-o" style="height:${flapH}px;background-image:url(${kraft(E, flapH, { seed: 44 })})"></div>`;
  const front = document.createElement('div');
  front.className = 'pp-envf';
  front.style.cssText = `width:${E}px;height:${EH}px;`;
  front.innerHTML = `<div class="pp-pocket" style="background-image:url(${kraft(E, EH)})"></div>
    <div class="pp-flap-sh" style="height:${flapH + 4}px"></div>
    <div class="pp-flap-c" style="height:${flapH}px;background-image:url(${kraft(E, flapH, { seed: 47 })})"></div>
    ${deco('seal', { cls: 'pp-env-seal' })}
    ${deco('postmark', { cls: 'pp-env-mark', rot: -12 })}`;
  stage.insertBefore(back, sheet);
  stage.appendChild(front);
  const sw = sheet.offsetWidth, sh = sheet.offsetHeight;
  const s = (E * 0.86) / sw;
  const envY = Math.min(innerHeight * 0.18, 140);
  // letter tucked inside the envelope
  const yIn = envY + EH * 0.12 + (sh * s) / 2 - EH / 2;
  const clipFor = (ty, sc) => {
    const letterBottom = ty + (sh * sc) / 2, envBottom = envY + EH / 2 - 6;
    return `inset(0 0 ${Math.max(0, (letterBottom - envBottom) / sc).toFixed(1)}px 0)`;
  };
  sheet.style.transform = `translateY(${yIn}px) scale(${s})`;
  sheet.style.clipPath = clipFor(yIn, s);
  sheet.style.visibility = 'hidden';
  sfx('whoosh', { volume: 0.5 });
  const slideKF = [
    { transform: `translate(-110vw, ${envY}px) rotate(-18deg)` },
    { transform: `translate(14px, ${envY}px) rotate(3deg)`, offset: 0.7 },
    { transform: `translate(-4px, ${envY}px) rotate(-1.2deg)`, offset: 0.86 },
    { transform: `translate(0, ${envY}px) rotate(0deg)` },
  ];
  const o1 = { duration: 620, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' };
  anim(back, slideKF, o1);
  await fin(anim(front, slideKF, o1), 620);
  // the seal pops, flap opens
  const seal = front.querySelector('.pp-env-seal');
  sfx('pop_in', { pitch: 0.9 });
  anim(seal, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-50%) translateY(-18px) scale(1.4) rotate(30deg)', opacity: 0 }], { duration: 260, fill: 'forwards', easing: 'ease-out' });
  await sleep(120);
  sfx('paper', { pitch: 1.2 });
  const fc = front.querySelector('.pp-flap-c'), fo = back.querySelector('.pp-flap-o');
  anim(front.querySelector('.pp-flap-sh'), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
  await fin(anim(fc, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }), 170);
  fo.style.visibility = 'visible';
  await fin(anim(fo, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.08)', offset: 0.7 }, { transform: 'scaleY(1)' }], { duration: 230, easing: 'ease-out', fill: 'forwards' }), 230);
  // letter slides up and out
  sheet.style.visibility = 'visible';
  sfx('page', { pitch: 1.1 });
  const yOut = envY - EH / 2 - (sh * s) / 2 + EH * 0.42;
  await tween(520, (e) => {
    const y = yIn + (yOut - yIn) * e;
    sheet.style.transform = `translateY(${y}px) scale(${s})`;
    sheet.style.clipPath = clipFor(y, s);
  }, easeOut);
  // envelope drops away while the letter comes to the front
  sheet.style.clipPath = '';
  sheet.style.zIndex = '5';
  const dropKF = [{ transform: `translate(0, ${envY}px) rotate(0deg)` }, { transform: `translate(0, ${envY - 16}px) rotate(-2deg)`, offset: 0.2 }, { transform: `translate(-8vw, 100vh) rotate(-14deg)` }];
  const o2 = { duration: 520, easing: 'cubic-bezier(.5,0,.85,.5)', fill: 'forwards' };
  anim(back, dropKF, o2); anim(front, dropKF, o2);
  sfx('whoosh', { volume: 0.35, pitch: 0.8 });
  await tween(560, (e, t) => {
    const y = yOut * (1 - e), sc = s + (1 - s) * e;
    const r = rot * e + Math.sin(t * Math.PI * 2) * (1 - t) * 2.5;
    sheet.style.transform = `translateY(${y}px) scale(${sc}) rotate(${r}deg)`;
  }, easeInOut);
  back.remove(); front.remove();
  sheet.style.zIndex = '';
}

// ---- book: drops onto the desk with a thud, cover opens, a page flips
async function enterBook(ov, sheet, stage, single, sfx, title) {
  const W = sheet.offsetWidth, H = sheet.offsetHeight;
  const CW = single ? W : W / 2;
  const cover = document.createElement('div');
  cover.className = 'pp-bookc';
  cover.style.cssText = `width:${CW}px;height:${H}px;`;
  const cx = `${single ? 0 : W / 4}px`;
  const lea = paperTexture('leather', CW, H, { seed: 61 });
  const inner = paperTexture('book', CW, H, { seed: 62, edge: 0.4, edgeW: 8, spine: 1, single: true });
  const ttl = title ? `<div class="pp-bookc-t">${title}</div>` : '';
  cover.innerHTML = `<div class="pp-bookc-f" style="background-image:url(${lea})">${ttl}<div class="pp-bookc-emb">${deco('seal', { color: 'gold', letter: 'R' })}</div></div><div class="pp-bookc-b" style="background-image:url(${inner})"></div>`;
  stage.appendChild(cover);
  const body = sheet.querySelector('.pp-body');
  sheet.style.visibility = 'hidden';
  if (!single) sheet.style.clipPath = 'inset(0 0 0 50%)';
  // fall
  sfx('whoosh', { volume: 0.4, pitch: 0.7 });
  const fall = anim(cover, [
    { transform: `translateX(${cx}) perspective(1800px) translateY(-70vh) scale(1.5) rotate(-14deg)`, filter: 'brightness(1.15)' },
    { transform: `translateX(${cx}) perspective(1800px) translateY(0) scale(1.06, .9) rotate(0deg)`, offset: 0.62, filter: 'brightness(1)' },
    { transform: `translateX(${cx}) perspective(1800px) translateY(-8px) scale(.98, 1.03)`, offset: 0.8 },
    { transform: `translateX(${cx}) perspective(1800px) translateY(0) scale(1)` },
  ], { duration: 640, easing: 'cubic-bezier(.55,0,.7,.4)', fill: 'both' });
  await sleep(640 * 0.62);
  sfx('drop', { pitch: 0.6, volume: 0.8 });
  anim(stage, [{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,4px)' }, { transform: 'translate(4px,-3px)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(0,0)' }], { duration: 260 });
  // dust puffs
  const cr = cover.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  for (let k = 0; k < 10; k++) {
    const d = document.createElement('div');
    d.className = 'pp-dust';
    d.innerHTML = deco('dust');
    const left = k < 5;
    const x = (left ? cr.left : cr.right) - sr.left, y = cr.bottom - sr.top - Math.random() * 30;
    d.style.left = `${x}px`; d.style.top = `${y}px`;
    stage.appendChild(d);
    const dx = (left ? -1 : 1) * (20 + Math.random() * 50), dy = -10 - Math.random() * 30;
    anim(d, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.4)`, opacity: 0 }], { duration: 500 + Math.random() * 300, easing: 'ease-out', fill: 'forwards' }).finished.then(() => d.remove(), () => d.remove());
  }
  await fin(fall, 300);
  await sleep(140);
  // cover opens
  sheet.style.visibility = 'visible';
  body.style.opacity = '0';
  sfx('page', { pitch: 0.8 });
  const open = anim(cover, [
    { transform: `translateX(${cx}) perspective(1800px) rotateY(0deg)` },
    { transform: `translateX(${cx}) perspective(1800px) rotateY(-180deg)` },
  ], { duration: 640, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' });
  if (!single) setTimeout(() => { sheet.style.clipPath = ''; }, 300);
  await fin(open, 640);
  cover.remove();
  // a page flip
  const leaf = document.createElement('div');
  leaf.className = 'pp-leaf';
  const pg = paperTexture('book', CW, H, { seed: 63, edge: 0.3, edgeW: 8 });
  leaf.style.cssText = `width:${CW}px;height:${H}px;`;
  leaf.innerHTML = `<div class="pp-leaf-f" style="background-image:url(${pg})"></div><div class="pp-leaf-b" style="background-image:url(${pg})"></div>`;
  stage.appendChild(leaf);
  sfx('page', { pitch: 1.2 });
  const flip = anim(leaf, [
    { transform: `translateX(${cx}) perspective(1800px) rotateY(0deg)` },
    { transform: `translateX(${cx}) perspective(1800px) rotateY(-180deg)` },
  ], { duration: 480, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' });
  anim(body, [{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: 520, fill: 'forwards' });
  await fin(flip, 480);
  if (single) await fin(anim(leaf, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }), 140);
  leaf.remove();
  body.style.opacity = '';
}
