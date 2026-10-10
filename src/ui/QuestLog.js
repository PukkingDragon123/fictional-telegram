// QuestLog: Reynard's quest NOTEBOOK.
//
// HUD: a small spiral-bound notebook under the coin tag (purple doodled cover,
// "REYNARD'S QUESTS", red ribbon bookmark) with a count badge and a one-line
// "current step" slip tucked into it. It wiggles when a quest changes.
// Click it: Reynard (a 3D FoxRig in his own little canvas, like FoxNotifier)
// waddles in from the left, grunting, SHOVING a giant notebook to the middle
// of the screen. Thud, dust, the cover flips open (he ducks), he leans on it
// proudly and waddles off. Inside: lined paper, everything handwritten (per
// line jitter + pen reveal), checkbox steps with pen ticks, "-> 50 coins!"
// rewards, tally-mark progress, DONE! stamps + gold stars, a "Done" list on
// the left page. Click outside / X / Esc: the cover flips shut and the book
// flies back into the HUD notebook.
//
//   const ql = createQuestLog(root, { icon, sfx, onClick, autoUpdate })
//     icon(name, scale) -> '<img>' html     sfx(name, opts)     onClick(questId)
//   ql.set(quests)      [{ id, title, icon, steps: [{ text, done }], reward: string, progress?: [n, max] }]
//                       diffed by id: new quests get written in, newly done steps get a pen tick
//   ql.setDone(list)    [{ id, title }] finished quests, oldest first (left page "Done" list)
//   ql.complete(id)     open: DONE! stamp + gold star, then it is written into "Done".
//                       closed: the HUD notebook bounces, a "QUEST DONE!" stamp + thumbs-up pop out, confetti
//   ql.open() / ql.close()   play the reveal / put it away (Promises; resolve when settled)
//   ql.setVisible(on)   show / hide the HUD notebook (hiding also shuts the open notebook at once)
//   ql.collapse(on?)    hide / show the one-line "current step" slip (toggles without an argument)
//   ql.update(dt)       drive it by hand when created with { autoUpdate: false } (previews)
//   ql.isOpen           true while the big notebook is on screen
//   ql.destroy()
//
// Everything heavy (textures, the WebGL fox) is built lazily on first use.
import * as THREE from 'three';
import { FoxRig } from '../entities/foxRig.js';
import './fonts.css';
import './questlog.css';
import { paperTexture, injectPaperCSS, deco, stamp } from './paper.js';

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sat = (v) => clamp(v, 0, 1);
const eOut3 = (t) => 1 - (1 - t) ** 3;
const eIn2 = (t) => t * t;
const eIO3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const TAU = Math.PI * 2;
const MAX = 3;
const CONF = ['#e84a6e', '#ffc830', '#6cc04a', '#3c8ce0', '#a050e0', '#ff8a3a'];

// own copy of a quest so later in-place edits by the caller still diff
const snap = (q) => ({ ...q, steps: (q.steps || []).map((s) => ({ ...s })), progress: Array.isArray(q.progress) ? q.progress.slice() : q.progress });
// stable per-string seed (so a line keeps its wobble between renders)
function seedOf(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function rnd(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ===========================================================================
// pixel art (texel buffers -> data URLs, cached)
// ===========================================================================
const HEX = new Map();
function hexc(h) {
  let c = HEX.get(h);
  if (!c) { const n = parseInt(h.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; HEX.set(h, c); }
  return c;
}
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
function h2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

class Px {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = (y * this.w + x) * 4, k = typeof c === 'string' ? hexc(c) : c;
    this.d[i] = k[0]; this.d[i + 1] = k[1]; this.d[i + 2] = k[2]; this.d[i + 3] = a;
    return this;
  }
  a(x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? 255 : this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c, a) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); return this; }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  path(pts, c) { for (let i = 1; i < pts.length; i++) this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c); return this; }
  // hand-drawn ellipse: optional wobble, a gap/overlap where the pen started
  ell(cx, cy, rx, ry, c, a0 = 0, a1 = TAU, wob = 0, seed = 1) {
    const n = Math.max(8, Math.ceil((rx + ry) * 3)), pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n), w = wob ? 1 + (vn(i / n * 5, 0, seed) - 0.5) * wob : 1;
      pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
    }
    return this.path(pts, c);
  }
  // 4-neighbour flood fill of transparent texels
  fill(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (this.a(x, y)) return this;
    const st = [[x, y]], seen = new Uint8Array(this.w * this.h);
    while (st.length) {
      const [i, j] = st.pop();
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = j * this.w + i;
      if (seen[k] || this.d[k * 4 + 3]) continue;
      seen[k] = 1;
      this.set(i, j, c, a);
      st.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
    }
    return this;
  }
  // 1-texel outline around everything opaque
  outline(c) {
    const o = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[(y * this.w + x) * 4 + 3]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < this.w && Y < this.h && this.d[(Y * this.w + X) * 4 + 3] > 128) { o[y * this.w + x] = 1; break; }
      }
    }
    for (let i = 0; i < o.length; i++) if (o[i]) this.set(i % this.w, (i / this.w) | 0, c);
    return this;
  }
  canvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return cv;
  }
  url() { return this.canvas().toDataURL(); }
}
const ART = new Map();
const art = (key, fn) => {
  let v = ART.get(key);
  if (!v) { const p = fn(); v = { url: p.url(), w: p.w, h: p.h }; ART.set(key, v); }
  return v;
};
// <img> for an art entry at `s` CSS px per texel
const img = (a, s = 2, cls = '', style = '') => `<img class="qn-px ${cls}" src="${a.url}" width="${a.w * s}" height="${a.h * s}" alt="" draggable="false"${style ? ` style="${style}"` : ''}>`;

// ink + paint
const INK = '#2b3d8f', INK_D = '#1f2a66', RED = '#c3323e', GREEN = '#2e7a3a', PENCIL = '#77727e';
const GOLD = ['#7a4a0e', '#b87a1c', '#e8b030', '#ffd75a', '#fff1a8'];
const PURPLE = ['#1e1030', '#2e1846', '#41225e', '#552d76', '#6c3b90', '#8453aa', '#a074c4'];
const SILVER = ['#3a3c4c', '#6a6e84', '#a2a6bc', '#d4d8e6', '#f6f8ff'];

// --- ink doodles (1-texel pen lines + highlighter fills). d(p, x, y, ink, fills)
const DOODLE = {
  fish: [22, 13, (p, ink, f) => {
    p.ell(9, 6.5, 7.5, 4.6, ink, 0.25, TAU - 0.25, 0.12, 4);
    p.path([[16, 5], [21, 1], [20, 6], [21, 12], [16, 8]], ink);
    p.fill(9, 6, f[0]); p.fill(19, 6, f[0]);
    p.set(5, 5, ink); p.set(4, 5, ink); // eye
    p.path([[2, 8], [3, 9]], ink); // smile
    p.ell(10, 6.5, 2.4, 3, ink, -1.1, 1.1); p.ell(13, 6.5, 2, 2.6, ink, -1, 1);
    p.path([[8, 2], [10, 0], [12, 2]], ink); // fin
    p.set(1, 3, f[1] || ink); p.set(0, 1, f[1] || ink); // bubbles
  }],
  bear: [19, 22, (p, ink, f) => {
    p.ell(4, 3.5, 2.6, 2.6, ink); p.ell(14, 3.5, 2.6, 2.6, ink);
    p.fill(4, 3.5, f[0]); p.fill(14, 3.5, f[0]);
    p.ell(9, 9, 7, 6.2, ink, 0, TAU, 0.08, 9);
    p.fill(9, 6, f[0]);
    p.ell(9, 11, 2.8, 2, ink); p.fill(9, 11, f[1]);
    p.set(9, 10, ink); p.set(8, 10, ink);
    p.set(6, 7, ink); p.set(12, 7, ink);
    p.path([[8, 12], [9, 13], [10, 12]], ink);
    // business suit: collar + red tie
    p.path([[3, 17], [8, 15], [9, 16], [10, 15], [15, 17]], ink);
    p.path([[8, 16], [9, 17], [10, 16]], RED); p.path([[9, 17], [8, 20], [9, 21], [10, 20], [9, 17]], RED); p.fill(9, 19, '#e8606a');
  }],
  coins: [20, 17, (p, ink, f) => {
    // a little stack (drawn back to front so each coin hides the one under it) + one standing coin
    const k = p.k || 1, P = p.p || p;
    const coin = (cx, cy, rx, ry, th) => {
      cx *= k; cy *= k; rx *= k; ry *= k; th *= k;
      const inE = (x, y, oy) => ((x - cx) / rx) ** 2 + ((y - cy - oy) / ry) ** 2 <= 1;
      const inC = (x, y) => inE(x, y, 0) || inE(x, y, th) || (Math.abs(x - cx) <= rx && y >= cy && y <= cy + th);
      for (let y = Math.floor(cy - ry - 1); y <= cy + th + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (!inC(x, y)) continue;
        const edge = !inC(x + 1, y) || !inC(x - 1, y) || !inC(x, y + 1) || !inC(x, y - 1);
        const rim = inE(x, y, 0) && !inE(x, y + 1, 0) && y < cy + th; // front lip of the top face
        P.set(x, y, edge || rim ? ink : inE(x, y, 0) ? f[0] : '#e0a828');
      }
    };
    coin(7, 13, 6, 2, 2); coin(8, 10, 6, 2, 2); coin(7, 7, 6, 2, 2);
    p.ell(15, 5, 4.4, 4.4, ink, 0, TAU, 0.1, 3); p.fill(15, 5, f[0]);
    p.set(15, 6, '#a86a14'); p.set(14, 4, '#a86a14'); p.set(16, 4, '#a86a14');
    p.set(18, 0, f[1] || ink); p.set(19, 1, f[1] || ink); p.set(17, 1, f[1] || ink); p.set(18, 2, f[1] || ink); // twinkle
  }],
  star: [13, 13, (p, ink, f) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.6 : 6; pts.push([6 + Math.cos(a) * r, 6.6 + Math.sin(a) * r]); }
    p.path(pts, ink); p.fill(6, 6, f[0]);
  }],
  heart: [11, 10, (p, ink, f) => {
    p.path([[5, 2], [3, 0], [1, 0], [0, 2], [0, 4], [5, 9], [10, 4], [10, 2], [9, 0], [7, 0], [5, 2]], ink);
    p.fill(5, 4, f[0]);
  }],
  sparkle: [7, 7, (p, ink) => { p.line(3, 0, 3, 6, ink); p.line(0, 3, 6, 3, ink); p.set(1, 1, ink); p.set(5, 5, ink); p.set(5, 1, ink); p.set(1, 5, ink); }],
  fox: [18, 21, (p, ink, f) => {
    // Reynard: top hat, pointy ears, monocle (closed outlines so the fills stay inside at 2x)
    p.path([[5, 0], [12, 0], [12, 5], [15, 5], [15, 6], [2, 6], [2, 5], [5, 5], [5, 0]], ink);
    p.fill(8, 3, f[2] || '#3a3348');
    p.line(6, 4, 11, 4, RED);
    p.path([[3, 7], [1, 6], [2, 11], [2, 13], [8, 19], [9, 19], [15, 13], [15, 11], [16, 6], [14, 7], [3, 7]], ink);
    p.fill(8, 10, f[0]);
    p.path([[5, 14], [8, 17], [9, 17], [12, 14]], f[1]);
    p.set(8, 18, ink); p.set(9, 18, ink);
    p.set(5, 11, ink); p.ell(11, 11, 2, 2, GOLD[1]); p.set(11, 11, ink); p.line(13, 12, 14, 16, GOLD[1]);
    p.path([[6, 15], [8, 16]], ink);
  }],
  arrow: [16, 8, (p, ink) => { p.path([[0, 5], [4, 3], [9, 4], [14, 3]], ink); p.path([[11, 0], [15, 3], [11, 7]], ink); }],
  check: [12, 10, (p, ink) => { p.path([[0, 5], [3, 8], [4, 8], [11, 0]], ink); p.path([[1, 5], [3, 7], [4, 9], [11, 1]], ink); }],
  swirl: [11, 11, (p, ink) => { const pts = []; for (let i = 0; i < 40; i++) { const a = i * 0.42, r = 0.3 + i * 0.13; pts.push([5 + Math.cos(a) * r, 5 + Math.sin(a) * r]); } p.path(pts, ink); }],
  crown: [15, 11, (p, ink, f) => {
    p.path([[1, 9], [0, 2], [4, 6], [7, 0], [10, 6], [14, 2], [13, 9], [1, 9]], ink); p.fill(7, 6, f[0]);
    p.line(1, 10, 13, 10, ink); p.set(7, 6, RED);
  }],
  sun: [15, 15, (p, ink, f) => {
    p.ell(7, 7, 3.4, 3.4, ink); p.fill(7, 7, f[0]);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; p.line(7 + Math.cos(a) * 5, 7 + Math.sin(a) * 5, 7 + Math.cos(a) * 7, 7 + Math.sin(a) * 7, ink); }
    p.set(6, 6, ink); p.set(8, 6, ink); p.path([[6, 8], [7, 9], [8, 8]], ink);
  }],
};
// draws a doodle k times bigger while keeping 1-texel pen lines (dots become k x k blobs)
class Big {
  constructor(p, k) { this.p = p; this.k = k; this.o = (k - 1) / 2; }
  m(v) { return v * this.k + this.o; }
  set(x, y, c, a) { const k = this.k; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) this.p.set(x * k + i, y * k + j, c, a); return this; }
  rect(x, y, w, h, c, a) { this.p.rect(x * this.k, y * this.k, w * this.k, h * this.k, c, a); return this; }
  line(x0, y0, x1, y1, c) { this.p.line(this.m(x0), this.m(y0), this.m(x1), this.m(y1), c); return this; }
  path(pts, c) { this.p.path(pts.map(([x, y]) => [this.m(x), this.m(y)]), c); return this; }
  ell(cx, cy, rx, ry, c, a0, a1, wob, seed) { this.p.ell(this.m(cx), this.m(cy), rx * this.k, ry * this.k, c, a0, a1, wob, seed); return this; }
  fill(x, y, c, a) { this.p.fill(this.m(x), this.m(y), c, a); return this; }
}
// doodle art: (name, ink colour, highlighter fills, scale)
function doodle(name, ink = INK, fills = ['#fff07a'], k = 1) {
  const [w, h, fn] = DOODLE[name] || DOODLE.star;
  return art(`d:${name}:${ink}:${fills.join(',')}:${k}`, () => { const p = new Px(w * k + k, h * k + k); fn(k > 1 ? new Big(p, k) : p, ink, fills); return p; });
}

// hand-drawn checkbox: the pen overshoots where it starts and ends
const boxArt = () => art('box', () => {
  const p = new Px(11, 11);
  p.path([[2, 1], [9, 0], [10, 9], [1, 10], [0, 1], [3, 1]], INK);
  return p;
});
const tickArt = (col = INK) => art(`tick:${col}`, () => {
  const p = new Px(16, 14);
  p.path([[1, 7], [4, 11], [5, 12], [15, 0]], col);
  p.path([[2, 7], [4, 10], [5, 11], [14, 0]], col);
  return p;
});
// tileable wobbly pen line (repeat-x): underlines and strike-throughs
const lineArt = (col, period = 48, amp = 0.9, seed = 2, thick = 1) => art(`ln:${col}:${period}:${amp}:${seed}:${thick}`, () => {
  const p = new Px(period, 5);
  for (let x = 0; x < period; x++) {
    const y = 2 + Math.sin((x / period) * TAU) * amp + Math.sin((x / period) * TAU * 3 + seed) * amp * 0.35;
    p.set(x, y, col);
    if (thick > 1) p.set(x, y + 1, col);
    if (h2(x, 3, seed) < 0.18) p.set(x, y + (y % 1 > 0.5 ? -1 : 1), col); // the ball-point skips and doubles
  }
  return p;
});
// strike-through tile (repeat both ways: one wobbly stroke per 32px text line)
const strikeArt = (col, seed) => art(`sk:${col}:${seed}`, () => {
  const W = 40, p = new Px(W, 16);
  for (let x = 0; x < W; x++) {
    const y = 9 + Math.sin((x / W) * TAU + seed) * 0.8 + Math.sin((x / W) * TAU * 2 + seed * 3) * 0.3;
    p.set(x, y, col);
    if (h2(x, 7, seed) < 0.2) p.set(x, y + 1, col);
  }
  return p;
});
// tally marks: n inked, the rest pencilled in faint dots. Groups of five get the slash.
const tallyArt = (n, max) => art(`tally:${n}:${max}`, () => {
  const W = Math.max(6, max * 5 + 3), p = new Px(W, 15);
  let x = 2;
  for (let i = 0; i < max; i++) {
    const inked = i < n, g = i % 5;
    const top = 1 + Math.round(h2(i, 1, 5) * 1.6), bot = 13 - Math.round(h2(i, 2, 5) * 1.4), lean = h2(i, 3, 5) < 0.5 ? 0 : 1;
    if (g === 4) {
      // the slash across the four before it
      const x0 = x - 20, x1 = x;
      if (inked) { p.path([[x0, 10], [x1, 3]], RED); p.path([[x0, 11], [x1, 4]], RED); } else for (let k = 0; k <= 20; k += 2) p.set(lerp(x0, x1, k / 20), lerp(10, 3, k / 20), PENCIL, 170);
      x += 5;
      continue;
    }
    if (inked) { p.line(x + lean, top, x, bot, INK); p.line(x + lean + 1, top + 1, x + 1, bot - 1, INK); } else for (let y = top; y <= bot; y += 2) p.set(x, y, PENCIL, 190);
    x += 5;
  }
  return p;
});
// coin doodle for rewards (ink outline, highlighter fill)
const coinArt = () => art('coin', () => {
  const p = new Px(13, 13);
  p.ell(6, 6.5, 5.6, 5.6, '#8a5a10', 0, TAU, 0.08, 7);
  p.fill(6, 6, '#ffd84a');
  p.ell(6, 6.5, 3.6, 3.6, '#e0a028', 0.5, 3.6);
  p.set(3, 3, '#fff6c0'); p.set(4, 2, '#fff6c0'); p.set(2, 4, '#fff6c0');
  // paw print, like the real coins
  p.rect(5, 7, 3, 2, '#a86a14'); p.set(4, 5, '#a86a14'); p.set(6, 4, '#a86a14'); p.set(8, 5, '#a86a14');
  return p;
});
// gold star sticker (die-cut white border + ink outline)
const goldStarArt = (r = 7) => art(`gstar:${r}`, () => {
  const N = r * 2 + 7, p = new Px(N, N), c = N / 2 - 0.5;
  // chubby five-point star polygon (inner radius 0.52)
  const V = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.52 : r; V.push([c + Math.cos(a) * rr, c + 0.6 + Math.sin(a) * rr]); }
  const inside = (x, y) => {
    let o = false;
    for (let i = 0, j = V.length - 1; i < V.length; j = i++) {
      const [xi, yi] = V[i], [xj, yj] = V[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o;
    }
    return o;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inside(x, y)) continue;
    const v = 2.6 + (-(x - c) - (y - c)) / r * 0.9;
    p.set(x, y, GOLD[clamp(Math.floor(v + bay(x, y)), 1, 4)]);
  }
  // shine + a little smile
  p.set(c - 2, c - 1, GOLD[4]); p.set(c - 1, c - 2, GOLD[4]); p.set(c - 2, c - 2, '#ffffff');
  if (r >= 8) { p.set(c - 2, c + 1, GOLD[0]); p.set(c + 2, c + 1, GOLD[0]); p.set(c - 1, c + 3, GOLD[0]); p.set(c, c + 3, GOLD[0]); p.set(c + 1, c + 3, GOLD[0]); }
  p.outline(GOLD[0]); p.outline('#ffffff'); p.outline('#ffffff');
  return p;
});
// dust puff (3-tone cloud)
const puffArt = (v) => art(`puff:${v}`, () => {
  const s = [7, 10, 13][v], p = new Px(s + 2, s + 2), c = (s + 2) / 2 - 0.5;
  const R = rnd(31 + v);
  const blobs = [[c, c + 1, s * 0.34], [c - s * 0.22, c + 1.5, s * 0.25], [c + s * 0.22, c + 1.4, s * 0.27], [c + 0.3, c - s * 0.16, s * 0.27]];
  for (let y = 0; y < s + 2; y++) for (let x = 0; x < s + 2; x++) {
    let inside = false, lit = 0;
    for (const [bx, by, br] of blobs) { const d = Math.hypot(x - bx, y - by); if (d < br) { inside = true; lit = Math.max(lit, (by - y + bx - x) / br); } }
    if (!inside) continue;
    p.set(x, y, lit > 0.45 ? '#fffaf0' : lit > -0.25 ? '#f0e4cc' : '#d8c6a4');
  }
  if (R() < 2) p.outline('#b49c78');
  return p;
});
// hand-drawn close "X" in a red pen circle
const xArt = () => art('x', () => {
  const p = new Px(17, 17);
  p.ell(8, 8.3, 7.3, 7, RED, -0.3, TAU + 0.15, 0.1, 5);
  p.fill(8, 8, '#fff8ee');
  p.path([[5, 4], [8, 8], [12, 12]], RED); p.path([[5, 5], [8, 9], [11, 12]], RED);
  p.path([[12, 4], [8, 8], [4, 12]], RED); p.path([[11, 4], [8, 9], [5, 12]], RED);
  return p;
});
// silver spiral ring (crosses the spine: holes on both sides)
const ringArt = () => art('ring', () => {
  const p = new Px(16, 7);
  // punched holes
  for (const hx of [2, 13]) { p.rect(hx - 1, 2, 3, 3, '#2a1a20'); p.set(hx, 1, '#2a1a20'); p.set(hx, 5, '#5a4a40'); }
  // the wire loop
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI; pts.push([7.5 + Math.cos(a) * 6, 3.4 + Math.sin(a) * 2.6]); }
  p.path(pts, SILVER[1]);
  for (let i = 4; i <= 20; i++) { const a = Math.PI + (i / 24) * Math.PI; p.set(7.5 + Math.cos(a) * 6, 2.6 + Math.sin(a) * 2.2, i < 12 ? SILVER[4] : SILVER[3]); }
  p.set(2, 3, SILVER[0]); p.set(13, 3, SILVER[0]);
  return p;
});
// sticky index tab (sticks out of the right page)
const tabArt = (col, dark) => art(`tab:${col}`, () => {
  const p = new Px(9, 16);
  p.rect(0, 0, 8, 16, col); p.rect(8, 1, 1, 14, col);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 9; x++) if (p.a(x, y) && bay(x, y) < 0.25 && x > 5) p.set(x, y, dark);
  p.rect(0, 0, 2, 16, dark);
  return p;
});
// ribbon bookmark tail (hangs out of the bottom of the book)
const ribbonArt = (len) => art(`rib:${len}`, () => {
  const p = new Px(7, len);
  for (let y = 0; y < len; y++) for (let x = 0; x < 7; x++) {
    if (y > len - 4 && Math.abs(x - 3) < 4 - (len - y)) continue; // swallowtail notch
    p.set(x, y, x === 0 || x === 6 ? '#6a1420' : x === 1 ? '#f0606a' : y % 9 === 4 && x > 1 ? '#a0202e' : '#c8303e');
  }
  return p;
});

// purple notebook cover board (dithered linen grain, bevel, outline)
function paintCover(p, x0, y0, w, h, seed = 3, r = 2) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0, rx = w - 1 - lx, ry = h - 1 - ly;
    // rounded corners on the free (right) side only, the spine side is square
    const cx = rx < r ? r - rx : 0, cy = ly < r ? r - ly : ry < r ? r - ry : 0;
    if (cx && cy && Math.hypot(cx, cy) > r + 0.3) continue;
    const e = Math.min(lx, ly, rx, ry);
    let v = 3.6 + (vn(x / 7, y / 7, seed) - 0.5) * 1.1 + (vn(x / 2.2, y / 2.2, seed + 1) - 0.5) * 0.6 - (lx / w + ly / h) * 0.5 + 0.3;
    if (x % 3 === 0) v -= 0.22; // linen weave
    if (y % 4 === 1) v += 0.12;
    if (h2(x, y, seed) < 0.015) v += 1.2; // scuff specks
    let c = PURPLE[clamp(Math.floor(v + bay(x, y)), 2, 5)];
    if (e === 0) c = PURPLE[0];
    else if (e === 1 && (ly === 1 || lx === 1)) c = PURPLE[6];
    else if (e === 1) c = PURPLE[1];
    else if (e < 4 && (rx < 4 || ry < 4) && bay(x, y) < 0.3) c = PURPLE[2];
    p.set(x, y, c);
  }
}
// cream sticker label with a red school-label border
function paintLabel(p, x0, y0, w, h, border = true) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const lx = x - x0, ly = y - y0, rx = w - 1 - lx, ry = h - 1 - ly, e = Math.min(lx, ly, rx, ry);
    if (e === 0 && (lx === 0 || rx === 0) && (ly === 0 || ry === 0)) continue;
    let c = (lx + ly) / (w + h) < 0.5 || bay(x, y) < 0.7 ? '#fbf4e2' : '#efe2c4';
    if (e === 0) c = '#2e1846';
    else if (e === 2 && border) c = '#d04450';
    else if (e === 1 && ry === 1) c = '#d8c8a4';
    p.set(x, y, c);
  }
}
// the small HUD notebook (3 CSS px per texel)
const HUD_W = 28, HUD_H = 33;
const hudArt = () => art('hud', () => {
  const p = new Px(HUD_W, HUD_H);
  // page block peeking out at the right and bottom
  p.rect(5, 2, 22, 28, '#e8dcbc'); p.rect(5, 2, 21, 27, '#fbf4e2');
  for (let y = 3; y < 29; y += 2) p.set(25, y, '#cdbd98');
  p.line(5, 30, 26, 30, '#8a7458'); p.line(27, 3, 27, 29, '#8a7458');
  paintCover(p, 3, 0, 23, 29, 7, 2);
  // label + doodles
  paintLabel(p, 5, 12, 20, 9, false);
  for (let x = 6; x < 24; x++) p.set(x, 13, '#e06070'); // red top rule of the label
  const star = [[2, 0], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [1, 4], [3, 4]];
  for (const [x, y] of star) p.set(19 + x, 22 + y, GOLD[3]);
  p.set(20, 23, GOLD[4]);
  const heart = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];
  for (const [x, y] of heart) p.set(7 + x, 23 + y, '#f07080');
  p.set(8, 24, '#ffb0b8');
  p.set(13, 24, GOLD[2]); p.set(15, 25, GOLD[2]); p.set(14, 23, GOLD[3]);
  p.set(22, 4, GOLD[3]); p.set(21, 5, GOLD[3]); p.set(23, 5, GOLD[3]); p.set(22, 6, GOLD[3]); p.set(22, 5, GOLD[4]);
  // gold corner caps
  for (const [x, y] of [[24, 1], [23, 1], [24, 2], [24, 26], [23, 27], [24, 27]]) p.set(x, y, GOLD[2]);
  // red ribbon hanging out of the bottom
  for (let y = 27; y < HUD_H; y++) for (let x = 15; x < 18; x++) {
    if (y === HUD_H - 1 && x === 16) continue;
    p.set(x, y, x === 15 ? '#f0606a' : x === 17 ? '#8a1a26' : '#c8303e');
  }
  // spiral rings over the spine
  for (let y = 2; y < 28; y += 4) {
    p.set(5, y + 1, '#1e1030'); p.set(5, y + 2, '#1e1030');
    p.set(1, y + 1, SILVER[2]); p.set(2, y, SILVER[4]); p.set(3, y, SILVER[3]); p.set(4, y, SILVER[2]); p.set(5, y, SILVER[1]);
    p.set(1, y + 2, SILVER[1]); p.set(2, y + 3, SILVER[1]); p.set(3, y + 3, SILVER[0]);
  }
  return p;
});

// big cover art at 2 CSS px / texel
function bigCoverArt(tw, th) {
  return art(`cover:${tw}x${th}`, () => {
    const p = new Px(tw, th);
    paintCover(p, 0, 0, tw, th, 11, 4);
    // gold corner protectors on the free side
    for (const yy of [0, th - 1]) for (let k = 0; k < 9; k++) for (let j = 0; j <= 8 - k; j++) {
      const x = tw - 1 - j, y = yy === 0 ? k : th - 1 - k;
      if (j + k > 8) continue;
      const edge = j + k === 8 || j === 0 || k === 0;
      if ((j === 0 || k === 0) && Math.hypot(j, k) < 2) continue;
      p.set(x, y, edge ? GOLD[0] : (j + k) < 4 ? GOLD[4] : GOLD[2 + ((j * 3 + k) % 2)]);
    }
    const L = { x: Math.round(tw * 0.13), y: Math.round(th * 0.15), w: Math.round(tw * 0.78), h: Math.round(th * 0.3) };
    paintLabel(p, L.x, L.y, L.w, L.h);
    // gold gel-pen doodles
    const put = (name, fx, fy, fill = GOLD[3], k = 1) => {
      const [w0, h0, fn] = DOODLE[name], w = w0 * k + k - 1, h = h0 * k + k - 1;
      const q = new Px(w, h); fn(k > 1 ? new Big(q, k) : q, GOLD[4], [fill, GOLD[4], PURPLE[1]]);
      const ox = Math.round(tw * fx - w / 2), oy = Math.round(th * fy - h / 2);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (q.d[i + 3]) p.set(ox + x, oy + y, [q.d[i], q.d[i + 1], q.d[i + 2]]); }
    };
    put('star', 0.2, 0.07); put('sparkle', 0.33, 0.06); put('crown', 0.8, 0.06, GOLD[2]);
    put('fish', 0.27, 0.6, PURPLE[5], 2); put('coins', 0.76, 0.62, GOLD[2]); put('heart', 0.5, 0.72, '#e05a6a', 2);
    put('swirl', 0.16, 0.8); put('star', 0.86, 0.83, GOLD[2]); put('sparkle', 0.7, 0.9); put('sparkle', 0.4, 0.88); put('sun', 0.52, 0.55, GOLD[2]); put('sparkle', 0.12, 0.5);
    return p;
  });
}

// soft dithered shade strip next to the spine (repeat-y)
const spineShade = (dir) => art(`spine:${dir}`, () => {
  const W = 14, p = new Px(W, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) {
    const d = dir < 0 ? x : W - 1 - x, t = 1 - d / W;
    if (bay(x, y) < t * t * 0.9) p.set(x, y, '#6a5434', 70 + Math.round(t * 60));
  }
  return p;
});

// ===========================================================================
// the fox actor: FoxRig in his own small transparent WebGL canvas
// ===========================================================================
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const POST_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 size;
uniform vec3 ink;
uniform float cNear;
uniform float cFar;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    gl_FragColor = n > 0.5 ? vec4(ink, 1.0) : vec4(0.0);
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > 0.09) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}
`;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AZ = new THREE.Vector3(0, 0, 1);
const FACE_R = Math.PI / 2 - 0.52; // facing screen-right, a bit toward us
const FACE_L = -Math.PI / 2 + 0.42;
const FACE_US = 0.3;

class StageFox {
  constructor(parent, sfx) {
    this.parent = parent; this.sfx = sfx;
    this.ok = false; this.failed = false; this.on = false;
    this.css = 0; this.pose = null; this.push = 0; this.lean = 0; this.duck = 0;
    this.fx = 0.5; this.fy = 0.8; this.reach = 0.3;
    // pose overrides (tuned in tools/notebook-preview ?foxlab)
    this.P = { sw: -1.2, swd: 0.06, ra: 0.12, el: 0.15, wr: -1.1, hRx: -0.4, lRoll: -0.22, lsw: -0.3, ltw: 0, lra: 2.3, lel: 1.0, rsw: -0.2, rtw: 0, rra: 0.9, rel: 1.9, lth: -0.28, rth: 0.05 };
  }

  build() {
    if (this.ok) return true;
    if (this.failed) return false;
    try {
      const wrap = (this.wrap = document.createElement('div'));
      wrap.className = 'qn-fox';
      const renderer = (this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }));
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      const cv = (this.canvas = renderer.domElement);
      cv.className = 'qn-foxcv';
      wrap.appendChild(cv);
      this.parent.appendChild(wrap);

      const scene = (this.scene = new THREE.Scene());
      scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.35));
      const key = new THREE.DirectionalLight(0xfff0d6, 2.3); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
      const fill = new THREE.DirectionalLight(0xffc6a0, 0.55); fill.position.set(2.5, 0.4, 2); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffd27a, 2.6); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
      const rim2 = new THREE.DirectionalLight(0xff9fd0, 1.4); rim2.position.set(-2.6, 1.2, -2.2); scene.add(rim2);

      const rig = (this.rig = new FoxRig({ shadows: false }));
      scene.add(rig.root);
      rig.root.rotation.y = FACE_R;
      rig.onEvent = (n) => {
        if (n === 'step') this._sfx('footsteps', { volume: 0.12, pitch: 1.3 + Math.random() * 0.2 });
        else if (n === 'land') this._sfx('jump', { volume: 0.2, pitch: 0.8 });
      };
      const cam = (this.camera = new THREE.PerspectiveCamera(22, 1, 0.5, 20));
      cam.position.set(0, 1.05, 7.6);
      cam.lookAt(0, 0.8, 0);
      cam.updateMatrixWorld();
      rig.lookAt(cam.position);

      this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.rt.depthTexture = new THREE.DepthTexture(2, 2);
      const mat = new THREE.ShaderMaterial({
        vertexShader: POST_VERT, fragmentShader: POST_FRAG,
        uniforms: {
          tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
          size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x150910) },
          cNear: { value: cam.near }, cFar: { value: cam.far },
        },
        depthTest: false, depthWrite: false,
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      this.post = new THREE.Mesh(g, mat);
      this.post.frustumCulled = false;
      this.postScene = new THREE.Scene(); this.postScene.add(this.post);
      this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      // where the feet land in the canvas (fractions)
      _v.set(0, 0, 0).project(cam);
      this.fx = _v.x * 0.5 + 0.5; this.fy = 0.5 - _v.y * 0.5;
      this.ok = true;
    } catch (e) {
      console.warn('QuestLog: fox stage failed', e);
      this.failed = true;
      this.wrap?.remove();
    }
    return this.ok;
  }

  _sfx(n, o) { try { this.sfx(n, o); } catch { /* optional */ } }

  resize(css) {
    if (!this.ok) return;
    css = Math.max(120, Math.round(css / 2) * 2);
    if (css === this.css) return;
    this.css = css;
    const n = css / 2;
    this.canvas.style.width = this.canvas.style.height = css + 'px';
    this.wrap.style.width = this.wrap.style.height = css + 'px';
    this.renderer.setSize(n, n, false);
    this.rt.setSize(n, n);
    this.post.material.uniforms.size.value.set(n, n);
  }

  show(on) {
    if (!this.ok) return;
    this.on = !!on;
    this.wrap.style.display = on ? 'block' : 'none';
  }

  // feet at (x, y) CSS px in the stage
  place(x, y) {
    if (!this.ok) return;
    this.wrap.style.transform = `translate(${Math.round(x - this.fx * this.css)}px, ${Math.round(y - this.fy * this.css)}px)`;
  }

  // switch the base animation (idempotent)
  play(name, o = {}) {
    if (!this.ok) return;
    if (this.pose === name && !o.restart) return;
    this.pose = name;
    this.rig.play(name, { fade: o.fade ?? 0.15, speed: o.speed ?? 1, restart: !!o.restart, loop: o.loop });
  }

  // horizontal distance (CSS px) from the feet to the paws, toward the facing side
  pawReach() {
    if (!this.ok) return 0;
    const r = this.rig;
    r.root.updateMatrixWorld(true);
    r.armL.wr.getWorldPosition(_v); r.armR.wr.getWorldPosition(_v2);
    _v.add(_v2).multiplyScalar(0.5).project(this.camera);
    return ((_v.x * 0.5 + 0.5) - this.fx) * this.css;
  }

  update(dt) {
    if (!this.ok || !this.on) return;
    const r = this.rig;
    r.update(dt);
    // PUSH: lean the whole body into the book, both paws out flat, chin up toward us
    const k = this.push, P = this.P;
    if (k > 0.001) {
      _q.setFromAxisAngle(AX, this.lean * k);
      r.mover.quaternion.multiply(_q);
      _e.set(P.hRx * k, 0, 0); _q.setFromEuler(_e); r.head.quaternion.multiply(_q);
      for (const A of [r.armL, r.armR]) {
        _e.set(P.sw + P.swd * A.side, 0, P.ra * A.side, 'ZXY'); _q.setFromEuler(_e); A.sh.quaternion.slerp(_q, k);
        _e.set(-P.el, 0, 0); _q.setFromEuler(_e); A.el.quaternion.slerp(_q, k);
        _e.set(P.wr, 0, 0); _q.setFromEuler(_e); A.wr.quaternion.slerp(_q, k);
        if (k > 0.5) r._setPaw?.(A, 'open');
      }
    }
    // LOUNGE: propped against the book's edge on his left, legs crossed, paw on the hip
    const L = this.lounge || 0;
    if (L > 0.001) {
      _q.setFromAxisAngle(AZ, P.lRoll * L); r.mover.quaternion.multiply(_q);
      let A = r.armL;
      _e.set(P.lsw, P.ltw, P.lra, 'ZXY'); _q.setFromEuler(_e); A.sh.quaternion.slerp(_q, L);
      _e.set(-P.lel, 0, 0); _q.setFromEuler(_e); A.el.quaternion.slerp(_q, L);
      A = r.armR;
      _e.set(P.rsw, -P.rtw, -P.rra, 'ZXY'); _q.setFromEuler(_e); A.sh.quaternion.slerp(_q, L);
      _e.set(-P.rel, 0, 0); _q.setFromEuler(_e); A.el.quaternion.slerp(_q, L);
      _e.set(0, 0, P.lth); _q.setFromEuler(_e); r.legL.th.quaternion.slerp(_q, L);
      _e.set(0, 0, P.rth); _q.setFromEuler(_e); r.legR.th.quaternion.slerp(_q, L);
      if (L > 0.5) { r._setPaw?.(r.armL, 'open'); r._setPaw?.(r.armR, 'fist'); }
    }
    this.render();
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt); r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }

  dispose() {
    if (!this.ok) return;
    this.rig.dispose();
    this.rt.dispose(); this.rt.depthTexture.dispose();
    this.post.material.dispose(); this.post.geometry.dispose();
    this.renderer.dispose();
    this.wrap.remove();
    this.ok = false;
  }
}

// ===========================================================================
// the quest notebook
// ===========================================================================
// timeline of the reveal (seconds)
const TL = { push0: 0.1, push1: 1.75, flip0: 2.1, flip1: 2.7, run0: 2.78, proud0: 3.3, exit0: 4.6, exit1: 5.5 };
const SHOVES = [0.38, 0.27, 0.21, 0.14];
const CLOSE_T = 0.78;
// ink colours a line can be written in (blue ball-point, mostly)
const INKS = ['#2b3d8f', '#2b3d8f', '#2f4499', '#26367f'];

export function createQuestLog(root, o = {}) {
  injectPaperCSS();
  const sfx = (n, x) => { try { o.sfx?.(n, x); } catch { /* optional */ } };
  const icon = (n, s = 1) => { try { return o.icon?.(n, s) || ''; } catch { return ''; } };
  const autoUpdate = o.autoUpdate !== false;

  // ------------------------------------------------------------- HUD
  const el = document.createElement('div');
  el.className = 'qn qn-hidden qn-empty';
  const H = hudArt();
  el.innerHTML = `
    <button type="button" class="qn-peek" aria-label="Current quest step"><span class="qn-peek-t"></span></button>
    <button type="button" class="qn-nb" aria-label="Open Reynard's quest notebook" aria-expanded="false">
      ${img(H, 3, 'qn-nb-art')}
      <span class="qn-nb-t1">REYNARD'S</span><span class="qn-nb-t2">QUESTS</span>
      <b class="qn-badge">0</b>
    </button>
    <div class="qn-hfx"></div>`;
  const nb = el.querySelector('.qn-nb'), badge = el.querySelector('.qn-badge'), peek = el.querySelector('.qn-peek'), peekT = el.querySelector('.qn-peek-t'), hfx = el.querySelector('.qn-hfx');
  root.appendChild(el);

  let quests = []; // snapshots, max 3
  let done = []; // [{ id, title }]
  let state = 'closed'; // closed | opening | open | closing
  let visible = true, collapsed = false, destroyed = false;
  let T = 0, CT = 0; // reveal / close timeline clocks
  let raf = 0, last = 0;
  let stage = null; // built on first open
  let L = null; // layout
  let fox = null;
  let waiters = { open: [], close: [] };
  const completing = new Set(); // ids stamped DONE! while open (waiting for set() to drop them)
  let lessons = [], onLesson = null, page = 'todo'; // [v26 tutorial] the Lessons page: [{ id, title, kind: 'class'|'lesson', fresh?, icon? }]

  // ------------------------------------------------------------- HUD behaviour
  function count() {
    const n = quests.filter((q) => !completing.has(String(q.id))).length;
    if (badge.textContent !== String(n)) {
      badge.textContent = n;
      anim(badge, [{ transform: 'scale(1.7)' }, { transform: 'scale(.85)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    }
    el.classList.toggle('qn-zero', n === 0);
    el.classList.toggle('qn-empty', n === 0 && !done.length && !lessons.length); // [v26 tutorial] + lessons
    // the slip: first unfinished step of the first quest
    const q = quests.find((x) => !completing.has(String(x.id)));
    const st = q ? (q.steps || []).find((s) => !s.done) : null;
    const text = q ? (st ? st.text : q.title) : '';
    if (peekT.textContent !== text) {
      peekT.textContent = text;
      if (text && !collapsed) anim(peek, [{ transform: 'translateX(-40px)', opacity: 0 }, { transform: 'translateX(4px)', offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,1.3,.5,1)' });
    }
    peek.classList.toggle('qn-peek-off', !text || collapsed);
  }
  function wiggle(big = false) {
    if (REDUCED()) return;
    anim(nb, big ? [
      { transform: 'none' }, { transform: 'translateY(4px) scale(1.12, .84)', offset: 0.14 },
      { transform: 'translateY(-26px) scale(.9, 1.12) rotate(-8deg)', offset: 0.4 }, { transform: 'translateY(0) scale(1.14, .86)', offset: 0.64 },
      { transform: 'translateY(-6px) rotate(3deg)', offset: 0.8 }, { transform: 'none' },
    ] : [
      { transform: 'none' }, { transform: 'rotate(-9deg) scale(1.08)', offset: 0.2 }, { transform: 'rotate(7deg)', offset: 0.45 },
      { transform: 'rotate(-4deg)', offset: 0.68 }, { transform: 'rotate(2deg)', offset: 0.85 }, { transform: 'none' },
    ], { duration: big ? 780 : 560, easing: 'ease-out' });
  }
  nb.addEventListener('click', (e) => { e.stopPropagation(); if (state === 'closed' || state === 'closing') api.open(); else api.close(); });
  peek.addEventListener('click', (e) => { e.stopPropagation(); api.open(); });

  // ------------------------------------------------------------- stage (big notebook)
  function buildStage() {
    if (stage) return;
    const s = document.createElement('div');
    s.className = 'qn-stage';
    s.innerHTML = `
      <div class="qn-dim"></div>
      <div class="qn-shake">
        <div class="qn-book">
          <div class="qn-shadow"></div>
          <div class="qn-boardL"></div>
          <div class="qn-board"></div>
          <div class="qn-tabs"></div>
          <div class="qn-pg qn-pl"><div class="qn-pc"></div></div>
          <div class="qn-pg qn-pr"><div class="qn-pc"></div></div>
          <div class="qn-flip">
            <div class="qn-cf"><div class="qn-cfl"></div></div>
            <div class="qn-cb"><div class="qn-cbp"></div></div>
            <div class="qn-cshade"></div>
          </div>
          <div class="qn-pencil"></div>
          <div class="qn-rings"></div>
          <div class="qn-rib"></div>
          <button type="button" class="qn-x" aria-label="Close the notebook"></button>
        </div>
      </div>
      <div class="qn-fx"></div>`;
    root.appendChild(s);
    stage = {
      el: s, dim: s.querySelector('.qn-dim'), shake: s.querySelector('.qn-shake'), book: s.querySelector('.qn-book'),
      pl: s.querySelector('.qn-pl'), pr: s.querySelector('.qn-pr'), plc: s.querySelector('.qn-pl .qn-pc'), prc: s.querySelector('.qn-pr .qn-pc'),
      boardL: s.querySelector('.qn-boardL'), board: s.querySelector('.qn-board'), shadow: s.querySelector('.qn-shadow'), tabs: s.querySelector('.qn-tabs'),
      flip: s.querySelector('.qn-flip'), cf: s.querySelector('.qn-cf'), cfl: s.querySelector('.qn-cfl'), cb: s.querySelector('.qn-cb'), cbp: s.querySelector('.qn-cbp'), cshade: s.querySelector('.qn-cshade'),
      rings: s.querySelector('.qn-rings'), pencil: s.querySelector('.qn-pencil'), rib: s.querySelector('.qn-rib'), x: s.querySelector('.qn-x'), fx: s.querySelector('.qn-fx'),
      puffs: [],
    };
    stage.x.innerHTML = img(xArt(), 2);
    // a click outside closes; during the reveal it only hurries the fox along
    stage.dim.addEventListener('click', () => { if (state === 'opening' && T < TL.flip1) skip(); else api.close(); });
    stage.x.addEventListener('click', (e) => { e.stopPropagation(); sfx('click'); api.close(); });
    stage.book.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state === 'opening' && T < TL.flip1) skip();
    });
    s.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    // tap a quest: the caller can point at the right tool
    stage.prc.addEventListener('click', (e) => {
      // [v26 tutorial] the Lessons page: flip to it / back, or replay a lesson
      const go = e.target.closest?.('.qn-lsn-link');
      if (go && state === 'open') { e.stopPropagation(); sfx('page', { volume: 0.5 }); page = go.dataset.go === 'lessons' ? 'lessons' : 'todo'; renderPages(); return; }
      const ls = e.target.closest?.('.qn-lsn');
      if (ls && state === 'open') { e.stopPropagation(); sfx('click'); try { onLesson?.(ls.dataset.lsn); } catch (err) { console.error(err); } return; }
      const q = e.target.closest?.('.qn-q');
      if (!q || state !== 'open') return;
      sfx('click');
      try { o.onClick?.(q.dataset.id); } catch (err) { console.error(err); }
    });
    fox = new StageFox(s, sfx);
  }

  // layout from the viewport: a two-page spread, or one page on narrow screens
  function layout() {
    const VW = window.innerWidth || 800, VH = window.innerHeight || 600;
    // big screens: zoom the whole stage 1.5x / 2x (2px texels -> 3px / 4px, still on the grid)
    const z = VW >= 2300 && VH >= 1400 ? 2 : VW >= 1500 && VH >= 960 ? 1.5 : 1;
    const vw = Math.floor(VW / z), vh = Math.floor(VH / z);
    const spread = vw >= 760 && vh >= 460;
    let pageW, pageH;
    if (spread) {
      pageW = Math.min(448, Math.floor((vw - 72) / 4) * 2);
      pageH = Math.min(584, Math.floor((vh - 84) / 2) * 2);
      pageW = Math.min(pageW, Math.round(pageH * 0.86 / 2) * 2);
    } else {
      pageW = Math.min(448, Math.floor((vw - 36) / 2) * 2);
      pageH = Math.min(600, Math.floor((vh - 100) / 2) * 2);
    }
    pageW = Math.max(240, pageW); pageH = Math.max(300, pageH);
    const bw = spread ? pageW * 2 : pageW;
    const cx = Math.round(vw / 2), top = Math.round((vh - pageH) / 2) - (spread ? 4 : 10);
    const left = cx - Math.round(bw / 2);
    const closedLeft = spread ? cx : left; // the spine
    return { z, vw, vh, spread, pageW, pageH, bw, left, top, cx, closedLeft, floor: top + pageH + 10, foxCss: clamp(Math.round(pageH * 0.62 / 2) * 2, 200, 360) };
  }

  function applyLayout() {
    L = layout();
    const S = stage, { pageW, pageH, spread } = L;
    S.el.style.zoom = L.z === 1 ? '' : String(L.z);
    S.el.classList.toggle('qn-single', !spread);
    Object.assign(S.book.style, { left: L.left + 'px', top: L.top + 'px', width: L.bw + 'px', height: pageH + 'px' });
    S.book.style.setProperty('--pw', pageW + 'px');
    S.book.style.setProperty('--ph', pageH + 'px');
    const rx = spread ? pageW : 0; // right page x inside the book
    // pages: lined paper (32px rules, 2px texels), red margin, shade by the spine
    const tex = (seed, coffee) => paperTexture('notebook', pageW, pageH, { px: 2, rules: 16, ruleTop: 40, margin: 30, edge: 0.16, edgeW: 5, seed, stains: coffee ? 1 : 0 });
    Object.assign(S.pr.style, { left: rx + 'px', width: pageW + 'px', height: pageH + 'px', backgroundImage: `url(${spineShade(-1).url}), url(${tex(41, false)})` });
    Object.assign(S.pl.style, { left: '0px', width: pageW + 'px', height: pageH + 'px', backgroundImage: `url(${spineShade(1).url}), url(${tex(57, true)})` });
    S.cbp.style.backgroundImage = `url(${spineShade(1).url}), url(${tex(57, true)})`;
    S.board.style.left = rx + 'px';
    S.boardL.style.left = '0px';
    // cover (a board margin B=8px bigger than the page on the free sides)
    const cw = pageW + 8, ch = pageH + 16;
    S.flip.style.left = rx + 'px';
    S.cf.style.backgroundImage = `url(${bigCoverArt(cw / 2, ch / 2).url})`;
    S.cfl.innerHTML = coverHTML(cw, ch);
    // spiral rings down the spine
    const R = ringArt(), n = Math.floor((pageH - 24) / 32);
    let rings = '';
    for (let i = 0; i < n; i++) rings += img(R, 2, 'qn-ring', `top:${20 + i * 32}px`);
    S.rings.innerHTML = rings;
    S.rings.style.left = (rx - 16) + 'px';
    S.rib.innerHTML = img(ribbonArt(30), 2);
    S.pencil.innerHTML = deco('pencil', { px: 2, len: 72 });
    S.pencil.style.left = (rx + pageW - 170) + 'px';
    S.rib.style.left = (rx + Math.round(pageW * 0.66)) + 'px';
    S.tabs.innerHTML = img(tabArt('#f4a6ba', '#d07890'), 2, 'qn-tab', 'top:110px') + img(tabArt('#94d8bc', '#5aa88a'), 2, 'qn-tab', 'top:182px') + img(tabArt('#f2d064', '#c8a030'), 2, 'qn-tab', 'top:254px');
    S.tabs.style.left = (rx + pageW + 2) + 'px';
    if (fox?.build()) fox.resize(L.foxCss);
  }

  // label text + stickers over the cover art (cw x ch CSS px, same maths as bigCoverArt)
  function coverHTML(cw, ch) {
    const tw = cw / 2, th = ch / 2;
    const lx = Math.round(tw * 0.13) * 2, ly = Math.round(th * 0.15) * 2, lw = Math.round(tw * 0.78) * 2, lh = Math.round(th * 0.3) * 2;
    return `
      <div class="qn-clab" style="left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px">
        <span class="qn-clab1">Reynard's</span>
        <span class="qn-clab2">QUESTS</span>
        <span class="qn-clab3">top secret!! keep out</span>
      </div>
      <span class="qn-cst" style="left:${Math.round(cw * 0.06)}px;top:${Math.round(ch * 0.84)}px;--r:-12deg">${icon('sticker_star', 3)}</span>
      <span class="qn-cst" style="left:${Math.round(cw * 0.64)}px;top:${Math.round(ch * 0.47)}px;--r:9deg">${icon('sticker_crown', 2)}</span>
      <span class="qn-cst" style="left:${Math.round(cw * 0.7)}px;top:${Math.round(ch * 0.75)}px;--r:-6deg">${icon('sticker_paw', 2)}</span>`;
  }

  // ------------------------------------------------------------- handwriting
  // one written line: seeded tilt + nudge, ink colour, pen reveal (delay ms)
  let wd = 0; // running reveal delay while a page is being written
  function hw(text, { cls = '', ink, delay, speed = 1 } = {}) {
    const R = rnd(seedOf(text));
    const n = Math.max(1, [...String(text)].length);
    const dur = Math.round(clamp(110 + n * 17, 150, 560) / speed);
    const d = delay ?? wd;
    if (delay == null) wd += Math.round(dur * 0.42) + 30;
    const col = ink || INKS[Math.floor(R() * INKS.length)];
    return `<span class="qn-w ${cls}" style="--wd:${d}ms;--wdur:${dur}ms;--wn:${Math.min(n, 24)};--ink:${col}">${esc(text)}</span>`;
  }
  const tilt = (s, a = 1) => { const R = rnd(seedOf(s) + 7); return `--tr:${((R() * 2 - 1) * 0.9 * a).toFixed(2)}deg;--tx:${Math.round((R() * 2 - 1) * 3 * a)}px;--ty:${Math.round(R() * 2 - 1)}px`; };

  function stepHTML(s, i, qid) {
    return `<div class="qn-ln qn-step${s.done ? ' qn-done' : ''}" data-i="${i}" style="${tilt(qid + s.text)};--sk:url(${strikeArt(INK, i + 3).url})">
      <span class="qn-box">${img(boxArt(), 2)}${img(tickArt(), 2, 'qn-tick')}</span>${hw(s.text)}
    </div>`;
  }
  function rewardHTML(q) {
    const tally = Array.isArray(q.progress) && q.progress[1] > 0 && q.progress[1] <= 20
      ? `<span class="qn-tally">${img(tallyArt(clamp(q.progress[0] | 0, 0, q.progress[1]), q.progress[1] | 0), 2)}<b>${q.progress[0] | 0}/${q.progress[1] | 0}</b></span>` : '';
    if (!q.reward && !tally) return '';
    const coin = /coin/i.test(q.reward || '') ? img(coinArt(), 2, 'qn-coin') : '';
    return `<div class="qn-ln qn-rw" style="${tilt(q.id + 'rw', 0.6)}">${q.reward ? `${img(doodle('arrow', GREEN), 2, 'qn-arrow')}${hw(`${q.reward}!`, { ink: GREEN })}${coin}` : ''}${tally}</div>`;
  }
  function questHTML(q) {
    const ic = icon(q.icon || 'star', 2);
    return `<div class="qn-q" data-id="${esc(q.id)}">
      <div class="qn-ln qn-qt" style="${tilt(q.id + 't', 0.7)}">${ic ? `<span class="qn-qi">${ic}</span>` : ''}<span class="qn-qtt">${hw(q.title, { cls: 'qn-big', ink: INK_D })}<i class="qn-ul" style="background-image:url(${lineArt(RED, 56, 1, 5).url})"></i></span></div>
      ${(q.steps || []).map((s, i) => stepHTML(s, i, q.id)).join('')}
      ${rewardHTML(q)}
    </div>`;
  }
  function doneHTML(d, i) {
    return `<div class="qn-ln qn-de" data-id="${esc(d.id)}" style="${tilt(d.id + 'd')};--sk:url(${strikeArt(RED, i + 11).url})">${img(goldStarArt(6), 2, 'qn-gstar', `--r:${(h2(i, 2, 9) * 30 - 15).toFixed(0)}deg`)}<span class="qn-dt">${hw(d.title, { ink: '#5a5f86' })}</span></div>`;
  }

  function rightHTML() {
    if (page === 'lessons' && lessons.length) return lessonsHTML(); // [v26 tutorial]
    let h = `<div class="qn-ln qn-hd" style="${tilt('todo', 0.5)}">${hw('To do:', { cls: 'qn-big', ink: RED })}${img(doodle('sparkle', RED), 2, 'qn-hsp')}</div>`;
    if (!quests.length) h += `<div class="qn-ln qn-none">${hw('nothing to do... yet!', { ink: PENCIL })}</div><div class="qn-ln qn-none2">${hw('(go make money)', { ink: PENCIL })}</div>`;
    else h += quests.map(questHTML).join('');
    if (lessons.length) h += `<div class="qn-ln qn-lsn-link" data-go="lessons" style="${tilt('lsnlink', 0.6)}">${hw(`My lessons (${lessons.length}) ->`, { ink: GREEN })}</div>`; // [v26 tutorial]
    return h;
  }
  // [v26 tutorial] the Lessons page: classes (chalkboard) and the lessons learned, tap one to replay
  function lessonsHTML() {
    const row = (l) => `<div class="qn-ln qn-lsn" data-lsn="${esc(l.id)}" style="${tilt(l.id, 0.6)}"><span class="qn-lsn-ic">${icon(l.kind === 'class' ? 'book' : (l.icon || 'star'), 2) || img(doodle('sparkle', INK), 2)}</span><span class="qn-lsn-tt">${hw(l.title, { ink: l.kind === 'class' ? INK_D : INK })}</span>${l.fresh ? '<b class="qn-lsn-new">NEW</b>' : ''}</div>`;
    const cls = lessons.filter((l) => l.kind === 'class'), les = lessons.filter((l) => l.kind !== 'class');
    let h = `<div class="qn-ln qn-hd" style="${tilt('lsnh', 0.5)}">${hw('Lessons', { cls: 'qn-big', ink: RED })}${img(doodle('sparkle', RED), 2, 'qn-hsp')}</div>`;
    h += `<div class="qn-ln qn-none2">${hw('(tap one to replay it)', { ink: PENCIL })}</div>`;
    if (cls.length) h += `<div class="qn-ln">${hw('Classes:', { ink: GREEN })}</div>` + cls.map(row).join('');
    if (les.length) h += `<div class="qn-ln">${hw('Quick lessons:', { ink: GREEN })}</div>` + les.map(row).join('');
    h += `<div class="qn-ln qn-lsn-link" data-go="todo" style="${tilt('lsnback', 0.6)}">${hw('<- back to my quests', { ink: GREEN })}</div>`;
    return h;
  }
  function doneListHTML() {
    let h = `<div class="qn-ln qn-dh" style="${tilt('doneh', 0.5)}">${hw('Done!', { cls: 'qn-big', ink: GREEN })}${img(doodle('check', GREEN), 2, 'qn-dck')}</div>`;
    const list = done.slice(-6);
    if (done.length > list.length) h += `<div class="qn-ln qn-more">${hw(`...and ${done.length - list.length} more!`, { ink: PENCIL })}</div>`;
    h += list.length ? list.map((d, i) => doneHTML(d, done.length - list.length + i)).join('') : `<div class="qn-ln qn-none">${hw('nothing yet...', { ink: PENCIL })}</div>`;
    return h;
  }
  function leftHTML() {
    return `
      <div class="qn-ln qn-own" style="${tilt('own', 0.4)}">${hw('this book belongs to:', { ink: PENCIL })}</div>
      <div class="qn-ln qn-name" style="${tilt('name', 0.6)}">${hw('REYNARD', { cls: 'qn-big', ink: RED })}${img(doodle('crown', RED, ['#ffd84a']), 2, 'qn-crown')}${hw('(genius)', { ink: PENCIL })}${img(doodle('fox', INK, ['#f6a060', '#fff1d8', '#3a3348'], 2), 2, 'qn-d qn-d-fox')}</div>
      <div class="qn-ln"></div>
      <div class="qn-dlist">${doneListHTML()}</div>
      <div class="qn-dd">
        ${deco('coffee', { px: 2, cls: 'qn-coffee', r: 15, seed: 5 })}
        ${img(doodle('fish', INK, ['#a8d8f0', '#7ab0e0'], 2), 2, 'qn-d qn-d-fish')}
        ${img(doodle('bear', INK, ['#d8a870', '#f0d0a8'], 2), 2, 'qn-d qn-d-bear')}
        ${img(doodle('coins', INK, ['#ffe066', GOLD[3]], 2), 2, 'qn-d qn-d-coins')}
        <span class="qn-mine">${hw('MINE!', { cls: 'qn-big', ink: RED, delay: 0 })}</span>
        ${img(doodle('heart', INK, ['#f08090'], 2), 2, 'qn-d qn-d-heart')}
        ${img(doodle('sparkle', INK), 2, 'qn-d qn-d-sp1')}${img(doodle('sparkle', INK), 2, 'qn-d qn-d-sp2')}
      </div>`;
  }
  // the done list lives on the left page, or under the quests on a single page
  const doneBox = () => (L.spread ? stage.plc : stage.prc).querySelector('.qn-dlist');
  function renderLeft() {
    if (L.spread) { stage.plc.innerHTML = leftHTML(); return; }
    const box = doneBox();
    if (box) box.innerHTML = doneListHTML();
  }
  function renderPages() {
    wd = 120;
    stage.prc.innerHTML = rightHTML() + (L.spread ? '' : `<div class="qn-ln"></div><div class="qn-dlist">${doneListHTML()}</div>`);
    wd = 60;
    stage.plc.innerHTML = L.spread ? leftHTML() : '';
    // DONE! stamps for quests finished while the book was open
    for (const id of completing) markDone(questEl(id), false);
  }

  // ------------------------------------------------------------- page updates while open
  function questEl(id) { return stage?.prc.querySelector(`.qn-q[data-id="${CSS.escape(String(id))}"]`); }
  function tickStep(li, k) {
    li.classList.add('qn-done', 'qn-pen');
    li.style.setProperty('--pd', `${k * 260}ms`);
    setTimeout(() => sfx('pen', { volume: 0.6 }), k * 260 + 60);
    setTimeout(() => li.classList.remove('qn-pen'), 1200 + k * 260);
  }
  function updateOpen(prev) {
    if (!stage || state === 'closed') return;
    const pids = new Map(prev.map((q) => [String(q.id), q]));
    const ids = new Set(quests.map((q) => String(q.id)));
    // gone: erase
    for (const d of stage.prc.querySelectorAll('.qn-q')) {
      const id = d.dataset.id;
      if (ids.has(id) || d.classList.contains('qn-leaving')) continue;
      d.classList.add('qn-leaving');
      completing.delete(id);
      const h = d.offsetHeight;
      const a = REDUCED() ? null : anim(d, [{ height: `${h}px`, opacity: 1 }, { height: `${h}px`, opacity: 0, transform: 'translateX(24px) rotate(2deg)', offset: 0.5 }, { height: '0px', opacity: 0 }], { duration: 560, easing: 'ease-in', fill: 'forwards' });
      const rm = () => d.remove();
      if (a) a.onfinish = rm; else rm();
    }
    wd = 80;
    for (const q of quests) {
      const id = String(q.id), old = pids.get(id), d = questEl(id);
      if (!old || !d) {
        // brand new quest: write it in at the bottom of the page
        const tmp = document.createElement('div');
        tmp.innerHTML = questHTML(q);
        const n = tmp.firstElementChild;
        stage.prc.querySelector('.qn-none')?.remove(); stage.prc.querySelector('.qn-none2')?.remove();
        stage.prc.appendChild(n);
        sfx('pen', { volume: 0.5 });
        continue;
      }
      const os = old.steps || [], ns = q.steps || [];
      if (old.title !== q.title || os.length !== ns.length || os.some((s, i) => s.text !== ns[i].text) || old.reward !== q.reward) {
        const tmp = document.createElement('div');
        tmp.innerHTML = questHTML(q);
        d.replaceWith(tmp.firstElementChild);
        continue;
      }
      let k = 0;
      ns.forEach((s, i) => {
        const li = d.querySelectorAll('.qn-step')[i];
        if (!li) return;
        if (s.done && !os[i].done) tickStep(li, k++);
        else if (!s.done && os[i].done) li.classList.remove('qn-done');
      });
      if (JSON.stringify(old.progress) !== JSON.stringify(q.progress)) {
        const rw = d.querySelector('.qn-rw');
        const tmp = document.createElement('div');
        tmp.innerHTML = rewardHTML(q);
        const n = tmp.firstElementChild;
        if (n) {
          n.querySelectorAll('.qn-w').forEach((w) => w.classList.add('qn-now'));
          if (rw) rw.replaceWith(n); else d.appendChild(n);
          anim(n.querySelector('.qn-tally img') || n, [{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 360, delay: k * 260, easing: 'cubic-bezier(.3,1.6,.5,1)' });
        }
      }
    }
  }
  // DONE! stamp + gold star on a quest section
  function markDone(d, fresh = true) {
    if (!d || d.querySelector('.qn-stamp')) return;
    d.classList.add('qn-complete');
    d.querySelectorAll('.qn-step:not(.qn-done)').forEach((li, k) => (fresh ? tickStep(li, k) : li.classList.add('qn-done')));
    const s = document.createElement('div');
    s.className = 'qn-stamp';
    s.innerHTML = stamp('DONE!', '#c8323c', -12, { delay: fresh ? 260 : 0, anim: fresh }) + `<span class="qn-star${fresh ? ' qn-star-in' : ''}">${icon('sticker_star', 3) || img(goldStarArt(9), 3)}</span>`;
    d.appendChild(s);
    if (fresh) {
      setTimeout(() => sfx('stamp'), 330);
      setTimeout(() => sfx('sticker'), 760);
      setTimeout(() => sfx('star_pop', { pitch: 1.1 }), 820);
      confetti(stage.fx, d.querySelector('.qn-stamp'), 34);
    }
  }
  function addDoneEntry(entry, fresh) {
    if (!stage || state === 'closed' || !entry) return;
    const box = doneBox();
    if (!box) return;
    box.querySelector('.qn-none')?.remove();
    const tmp = document.createElement('div');
    tmp.innerHTML = doneHTML(entry, done.findIndex((d) => d.id === entry.id));
    const n = tmp.firstElementChild;
    box.appendChild(n);
    if (fresh) {
      n.classList.add('qn-late');
      setTimeout(() => sfx('pen', { volume: 0.5 }), 100);
      setTimeout(() => sfx('sticker', { volume: 0.5 }), 900);
    }
  }

  // ------------------------------------------------------------- dust + confetti
  function puff(x, y, vx, vy, t0, size = 1, life = 0.7) {
    const e = document.createElement('i');
    e.className = 'qn-puff';
    const a = puffArt(size);
    e.innerHTML = img(a, 3);
    stage.fx.appendChild(e);
    stage.puffs.push({ e, x, y, vx, vy, t0, life, w: a.w * 3, h: a.h * 3, spin: (Math.random() * 2 - 1) * 90 });
  }
  function stepPuffs(now) {
    const P = stage.puffs;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i], u = (now - p.t0) / p.life;
      if (u >= 1 || u < -0.05) { if (u >= 1) { p.e.remove(); P.splice(i, 1); } continue; }
      const k = 1 - (1 - u) ** 2;
      const x = p.x + p.vx * k * p.life, y = p.y + p.vy * k * p.life - 10 * u;
      const s = u < 0.25 ? lerp(0.5, 1.1, u / 0.25) : lerp(1.1, 0.4, (u - 0.25) / 0.75);
      p.e.style.transform = `translate(${Math.round(x - p.w / 2)}px, ${Math.round(y - p.h / 2)}px) scale(${s.toFixed(2)}) rotate(${(p.spin * u).toFixed(0)}deg)`;
      p.e.style.opacity = u > 0.7 ? ((1 - u) / 0.3).toFixed(2) : '1';
    }
  }
  function clearPuffs() { if (!stage) return; for (const p of stage.puffs) p.e.remove(); stage.puffs.length = 0; }
  function confetti(layer, from, n) {
    if (REDUCED() || !from) return;
    const z = layer === hfx ? 1 : L?.z || 1;
    const r = from.getBoundingClientRect(), lr = layer.getBoundingClientRect();
    const ox = (r.left - lr.left + r.width / 2) / z, oy = (r.top - lr.top + r.height * 0.4) / z;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'qn-conf';
      const w = Math.random() < 0.5 ? 8 : 4, h = w === 8 ? 4 : 8;
      p.style.cssText = `left:${ox}px;top:${oy}px;width:${w}px;height:${h}px;background:${CONF[i % CONF.length]}`;
      layer.appendChild(p);
      const a = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.4, v = 80 + Math.random() * 120;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v, rot = (Math.random() * 2 - 1) * 720;
      const kf = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        kf.push({ transform: `translate(${(dx * t).toFixed(1)}px, ${(dy * t + 170 * t * t).toFixed(1)}px) rotate(${(rot * t).toFixed(0)}deg)`, opacity: t > 0.7 ? (1 - t) / 0.3 : 1 });
      }
      const an = anim(p, kf, { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      if (an) an.onfinish = () => p.remove(); else setTimeout(() => p.remove(), 1400);
    }
  }

  // ------------------------------------------------------------- the reveal timeline
  const ev = new Set(); // one-shot events already fired this run
  const once = (k, t, fn) => { if (T >= t && !ev.has(k)) { ev.add(k); fn(); } };
  function pushP(t) {
    const u = sat((t - TL.push0) / (TL.push1 - TL.push0)) * SHOVES.length;
    const i = Math.min(SHOVES.length - 1, Math.floor(u)), f = u - i;
    let P = 0;
    for (let k = 0; k < i; k++) P += SHOVES[k];
    const g = u >= SHOVES.length ? 1 : f < 0.7 ? eOut3(f / 0.7) : 1;
    return { P: P + SHOVES[i] * g, i, f: u >= SHOVES.length ? 1 : f, g };
  }
  function setBook(dx, dy, rot, sx = 1, sy = 1, origin = null) {
    const B = stage.book;
    if (!dx && !dy && !rot && sx === 1 && sy === 1) B.style.transform = 'none';
    else B.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    if (origin) B.style.transformOrigin = origin;
  }
  // cover angle 0 (shut) .. -180 (open, lying on the left)
  function setCover(a) {
    const S = stage;
    if (a >= -0.01) { S.flip.style.transform = 'none'; S.flip.style.visibility = 'visible'; }
    else S.flip.style.transform = `perspective(${Math.round(L.pageW * 3.2)}px) rotateY(${a.toFixed(2)}deg)`;
    const back = a < -90;
    S.cf.style.visibility = back ? 'hidden' : 'visible';
    S.cb.style.visibility = back && L.spread ? 'visible' : 'hidden';
    S.cshade.style.opacity = (Math.sin((-a / 180) * Math.PI) * 0.35).toFixed(2);
    // single page: the cover swings off the page and fades out
    S.flip.style.opacity = !L.spread && a < -100 ? sat(1 - (-a - 100) / 60).toFixed(2) : '1';
    const open = a <= -179.9;
    S.flip.style.visibility = open ? 'hidden' : 'visible';
    if (open) S.cf.style.visibility = S.cb.style.visibility = 'hidden';
    S.pl.style.visibility = S.boardL.style.visibility = open && L.spread ? 'visible' : 'hidden';
    S.x.style.visibility = a < -150 ? 'visible' : 'hidden';
  }

  function frameOpen(dt) {
    const S = stage, { pageW, closedLeft, floor } = L;
    const now = T;
    const D = closedLeft + pageW + (fox?.ok ? L.foxCss * 0.5 : 0) + 60; // off-screen start distance
    const pp = pushP(now);
    // dim
    S.dim.style.opacity = sat(now / 0.3).toFixed(2);
    // ---- push
    let dx = -D * (1 - pp.P), dy = 0, rot = 0, sx = 1, sy = 1;
    if (now < TL.push1) {
      const w = Math.sin(pp.f * Math.PI) * (pp.g < 1 ? 1 : 0.3);
      rot = (pp.i % 2 ? 0.8 : -1.1) * w; dy = -3 * w;
    }
    for (let i = 0; i < SHOVES.length; i++) {
      const ts = TL.push0 + (TL.push1 - TL.push0) * (i / SHOVES.length);
      once(`shove${i}`, ts, () => {
        sfx('fox_talk', { volume: 0.55, pitch: 0.62 - i * 0.03 });
        sfx('paper', { volume: 0.35, pitch: 0.45 });
        const bx = closedLeft - D * (1 - pp.P);
        puff(bx + 8, floor - 14, -60, -30, ts, 0, 0.55);
        puff(bx + pageW - 10, floor - 12, 90, -26, ts + 0.05, i % 2, 0.6);
        if (fox?.ok) puff(bx - Math.max(30, fox.css * 0.15) - 34, floor + 2, -70, -16, ts + 0.06, 0, 0.45); // kicked up by his heels
        if (fox?.ok) fox.rig._headSq && (fox.rig._headSq.v -= 1.2);
      });
    }
    // ---- thud
    const th = now - TL.push1;
    once('thud', TL.push1, () => {
      sfx('book_drop', { volume: 0.9 });
      sfx('stamp', { volume: 0.35, pitch: 0.6 });
      const l = closedLeft, r = closedLeft + pageW;
      for (let k = 0; k < 5; k++) {
        puff(l + 10 + k * 6, floor - 10, -70 - k * 30, -20 - k * 12, TL.push1 + k * 0.02, k % 3, 0.7);
        puff(r - 10 - k * 6, floor - 10, 70 + k * 30, -20 - k * 12, TL.push1 + k * 0.02, (k + 1) % 3, 0.7);
      }
      puff(l + pageW * 0.5, floor - 6, 0, -40, TL.push1 + 0.04, 2, 0.6);
      // comic sound word
      if (!REDUCED()) {
        const w = document.createElement('span');
        w.className = 'qn-thud';
        w.textContent = 'THUD!';
        w.style.left = Math.round(r - 40) + 'px'; w.style.top = Math.round(floor - 70) + 'px';
        S.fx.appendChild(w);
        const a = anim(w, [
          { transform: 'scale(.2) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1.25) rotate(-6deg)', opacity: 1, offset: 0.18 },
          { transform: 'scale(1) rotate(-8deg)', opacity: 1, offset: 0.3 }, { transform: 'translateY(-10px) scale(1) rotate(-8deg)', opacity: 1, offset: 0.75 },
          { transform: 'translateY(-16px) scale(.9) rotate(-8deg)', opacity: 0 },
        ], { duration: 900, easing: 'ease-out', fill: 'forwards' });
        if (a) a.onfinish = () => w.remove(); else setTimeout(() => w.remove(), 900);
      }
    });
    if (th >= 0 && th < 0.22) { const s = Math.sin((th / 0.22) * Math.PI); sy = 1 - 0.04 * s; sx = 1 + 0.025 * s; }
    let shx = 0, shy = 0;
    if (th >= 0 && th < 0.34) { const k = 1 - th / 0.34; shx = Math.sin(th * 71) * 6 * k; shy = Math.cos(th * 53) * 4 * k; }
    S.shake.style.transform = shx || shy ? `translate(${shx.toFixed(1)}px, ${shy.toFixed(1)}px)` : 'none';
    setBook(dx, dy, rot, sx, sy, `${L.spread ? 75 : 50}% 100%`);
    // ribbon sways with the shoves
    const sway = now < TL.push1 + 0.6 ? Math.sin(now * 9) * 14 * Math.exp(-Math.max(0, now - TL.push1) * 4) + (now < TL.push1 ? -10 : 0) : 0;
    S.rib.style.transform = sway ? `rotate(${sway.toFixed(1)}deg)` : 'none';
    // ---- cover
    const fu = sat((now - TL.flip0) / (TL.flip1 - TL.flip0));
    setCover(-180 * eIO3(fu));
    once('flip0', TL.flip0, () => { sfx('book_open', { volume: 0.7 }); renderPages(); S.el.classList.add('qn-writing'); });
    once('flipmid', lerp(TL.flip0, TL.flip1, 0.45), () => sfx('page_flip', { volume: 0.6 }));
    once('flip1', TL.flip1, () => {
      sfx('page', { volume: 0.4, pitch: 0.8 });
      if (L.spread) { const l = L.left; puff(l + 4, floor - 12, -80, -20, TL.flip1, 1, 0.6); puff(l + 4, L.top + 20, -70, -10, TL.flip1 + 0.03, 0, 0.5); }
    });
    once('interactive', TL.flip1, () => { state = 'open'; S.el.classList.add('qn-open'); const w = waiters.open; waiters.open = []; w.forEach((r) => r()); });
    // ---- the fox
    if (fox?.ok) stepFox(now, dt, dx);
    stepPuffs(now);
  }

  function stepFox(now, dt, dx) {
    const { closedLeft, floor } = L, F = fox, css = F.css;
    if (now >= TL.exit1) { if (F.on) F.show(false); return; }
    if (!F.on) F.show(true);
    const reach = Math.max(30, css * 0.15); // feet -> paws while pushing
    const spot = closedLeft - reach - 30; // where he stumbles to after the thud
    // the outer edge of the open book to lean on (room for him on the left?)
    const edge = L.spread ? L.left - 8 : closedLeft - 8;
    const lean = edge - css * 0.15;
    const canLean = lean > css * 0.22;
    let x, y = floor + 4, face = FACE_R;
    if (now < TL.push1) {
      // PUSH: heave, slide, heave
      const pp = pushP(now);
      F.play('walk', { speed: pp.g < 1 ? 1.7 : 2.4 });
      F.push = Math.min(1, F.push + dt * 8); F.lounge = 0;
      F.lean = 0.4 + (pp.g < 1 ? 0.1 * Math.sin(pp.f * Math.PI) : 0.06);
      F.rig.setExpression(pp.g < 1 ? 'determined' : 'angry');
      x = closedLeft + dx - reach;
    } else if (now < TL.flip0 - 0.04) {
      // stumbles back a step and turns to us: phew
      const u = sat((now - TL.push1) / 0.3);
      F.push = Math.max(0, F.push - dt * 6);
      F.play('idle', { fade: 0.2 });
      F.rig.setExpression('happy');
      face = FACE_US;
      x = lerp(closedLeft - reach, spot, eOut3(u)); y -= Math.sin(u * Math.PI) * 10;
    } else if (now < TL.run0) {
      // the cover swings over his head: duck!
      F.push = 0;
      F.play('cower', { fade: 0.1 });
      face = FACE_US;
      x = spot;
    } else if (now < TL.proud0) {
      // scurry over to the edge of the book
      const u = sat((now - TL.run0) / (TL.proud0 - TL.run0));
      const to = canLean ? lean : Math.max(spot, css * 0.3);
      if (Math.abs(to - spot) > 20) { F.play('run', { speed: 1.1, fade: 0.12 }); face = to < spot ? FACE_L : FACE_R; } else { F.play('idle', { fade: 0.2 }); face = FACE_US; }
      F.rig.setExpression('happy');
      x = lerp(spot, to, eIO3(u));
    } else if (now < TL.exit0) {
      // propped proudly against it (or a cheer when there is no room)
      const u = sat((now - TL.proud0) / 0.3);
      face = FACE_US;
      x = canLean ? lean : Math.max(spot, css * 0.3);
      if (canLean) {
        F.play('idle', { fade: 0.25 });
        F.lounge = eOut3(u);
        F.rig.setExpression(now - TL.proud0 < 0.7 ? 'proud' : 'smug');
      } else F.play('cheer', { fade: 0.15 });
      once('proud', TL.proud0 + 0.15, () => { sfx('fox_talk', { volume: 0.5, pitch: 1.15 }); setTimeout(() => sfx('fox_talk', { volume: 0.45, pitch: 1.3 }), 140); });
    } else {
      // waddles off to the left
      const u = sat((now - TL.exit0) / (TL.exit1 - TL.exit0));
      F.lounge = Math.max(0, F.lounge - dt * 6);
      F.play('walk', { speed: 1.6, fade: 0.2 });
      F.rig.setExpression('happy');
      face = FACE_L;
      const x0 = canLean ? lean : Math.max(spot, css * 0.3);
      x = lerp(x0, -css * 0.4, u);
    }
    // turn smoothly
    const ry = F.rig.root.rotation.y;
    F.rig.root.rotation.y = ry + (face - ry) * (1 - Math.exp(-dt * 12));
    F.place(x, y);
    F.update(dt);
  }

  function skip() {
    // jump straight to the thud (the fox just got there), or on to the cover flip
    if (T >= TL.flip0) return;
    for (let i = 0; i < SHOVES.length; i++) ev.add(`shove${i}`);
    T = T < TL.push1 ? TL.push1 : TL.flip0;
  }

  // where the book was when close() was called (it may still be on its way in)
  let from = { a: -180, dx: 0, dim: 1 };
  function coverAngle(t) { return -180 * eIO3(sat((t - TL.flip0) / (TL.flip1 - TL.flip0))); }
  function frameClose() {
    const S = stage, u = sat(CT / CLOSE_T);
    // cover flips shut, then the closed book flies back into the HUD notebook
    const fu = sat(CT / 0.3);
    setCover(L.spread || from.a > -100 ? from.a * (1 - eIO3(fu)) : (fu < 1 ? -150 * (1 - fu) : 0));
    const mu = sat((CT - 0.26) / (CLOSE_T - 0.26));
    const hr = nb.getBoundingClientRect(), z = L.z;
    const bx = L.closedLeft + L.pageW / 2, by = L.top + L.pageH / 2;
    const tx = (hr.left + hr.width / 2) / z - bx, ty = (hr.top + hr.height / 2) / z - by;
    const e = eIn2(mu), sc = lerp(1, Math.max(0.08, hr.width / z / L.pageW), e);
    setBook(lerp(from.dx, tx, e), ty * e - Math.sin(mu * Math.PI) * 60, -14 * e, sc, sc, `${L.spread ? 75 : 50}% 50%`);
    S.book.style.opacity = mu > 0.8 ? ((1 - mu) / 0.2).toFixed(2) : '1';
    S.dim.style.opacity = (from.dim * (1 - sat((CT - 0.15) / 0.5))).toFixed(2);
    S.shake.style.transform = 'none';
    S.rib.style.transform = mu > 0 ? `rotate(${(Math.sin(mu * 12) * 20 * (1 - mu)).toFixed(1)}deg)` : 'none';
    stepPuffs(T);
    if (u >= 1) finishClose();
  }

  function finishClose() {
    state = 'closed';
    stage.el.classList.remove('qn-on', 'qn-open', 'qn-writing');
    stage.book.style.opacity = '';
    clearPuffs();
    fox?.show(false);
    nb.setAttribute('aria-expanded', 'false');
    // drop the finished quests that were waiting on their stamp
    if (completing.size) { quests = quests.filter((q) => !completing.has(String(q.id))); completing.clear(); count(); }
    if (visible) { wiggle(true); sfx('paper', { volume: 0.4, pitch: 1.3 }); }
    const w = waiters.close; waiters.close = []; w.forEach((r) => r());
  }

  // ------------------------------------------------------------- loop
  function tick(dt) {
    if (destroyed || !stage) return;
    dt = clamp(dt, 0, 0.1);
    if (state === 'opening' || (state === 'open' && T < TL.exit1 + 0.1)) { T += dt; frameOpen(dt); } else if (state === 'open') stepPuffs(T);
    else if (state === 'closing') { CT += dt; T += dt; frameClose(); }
  }
  const busy = () => state === 'opening' || state === 'closing' || (state === 'open' && (T < TL.exit1 + 0.1 || stage.puffs.length));
  function loop(now) {
    raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    tick(dt);
    if (busy()) raf = requestAnimationFrame(loop);
  }
  function kick() {
    if (!autoUpdate || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  const onKey = (e) => { if (e.key === 'Escape' && (state === 'open' || state === 'opening')) { e.preventDefault(); e.stopPropagation(); api.close(); } };
  let rsT = 0;
  const onResize = () => {
    clearTimeout(rsT);
    rsT = setTimeout(() => {
      if (!stage || state === 'closed') return;
      applyLayout(); renderPages();
      stage.el.classList.remove('qn-writing');
      if (state === 'open') { setBook(0, 0, 0); setCover(-180); }
    }, 150);
  };

  // ------------------------------------------------------------- API
  const api = {
    el,
    // [v26 tutorial] the Lessons page (game.lessons keeps it up to date)
    setLessons(list, fn) {
      if (destroyed) return;
      lessons = (Array.isArray(list) ? list : []).filter((l) => l && l.id != null);
      if (fn) onLesson = fn;
      count();
      if (stage && state === 'open' && page === 'lessons') renderPages();
    },
    showLessons() { api._lsnOpen = true; page = 'lessons'; return api.open(); },
    get isOpen() { return state === 'open' || state === 'opening'; },
    set(qs) {
      if (destroyed) return;
      const prev = quests;
      const next = (Array.isArray(qs) ? qs : []).filter((q) => q && q.id != null).slice(0, MAX).map(snap);
      // something changed? (wiggle the HUD notebook)
      const sig = (L2) => JSON.stringify(L2.map((q) => [q.id, q.title, (q.steps || []).map((s) => s.done ? 1 : 0), q.progress]));
      const changed = sig(prev) !== sig(next);
      const added = next.some((q) => !prev.some((p) => String(p.id) === String(q.id)));
      // quests stamped DONE! while open stay on the page until it is closed
      const keep = state !== 'closed' ? prev.filter((q) => completing.has(String(q.id)) && !next.some((n) => String(n.id) === String(q.id))) : [];
      quests = [...next, ...keep].slice(0, MAX + keep.length);
      count();
      if (state !== 'closed') updateOpen(prev);
      else if (changed && prev.length + next.length) { wiggle(added); if (added) sfx('page', { volume: 0.4, pitch: 1.2 }); }
    },
    setDone(list) {
      if (destroyed) return;
      const next = (Array.isArray(list) ? list : []).filter((d) => d && d.id != null).map((d) => ({ id: String(d.id), title: String(d.title ?? d.id) }));
      const fresh = next.filter((d) => !done.some((x) => x.id === d.id));
      done = next;
      count();
      if (stage && state !== 'closed') {
        const box = doneBox();
        if (fresh.length && done.length <= 6) fresh.forEach((d) => { if (!box?.querySelector(`.qn-de[data-id="${CSS.escape(d.id)}"]`)) addDoneEntry(d, true); });
        else if (fresh.length) renderLeft();
      }
    },
    complete(id) {
      if (destroyed) return;
      id = String(id);
      const q = quests.find((x) => String(x.id) === id);
      if (!done.some((d) => d.id === id)) done.push({ id, title: q?.title || id });
      if (state === 'open' || state === 'opening') {
        if (completing.has(id)) return;
        completing.add(id);
        markDone(questEl(id), true);
        setTimeout(() => { if (state !== 'closed' && !doneBox()?.querySelector(`.qn-de[data-id="${CSS.escape(id)}"]`)) addDoneEntry(done.find((d) => d.id === id), true); }, 1300);
        count();
        return;
      }
      // closed: bounce, a stamp + a thumbs-up pop out of the HUD notebook, confetti
      quests = quests.filter((x) => String(x.id) !== id);
      count();
      if (!visible) return;
      wiggle(true);
      const s = document.createElement('div');
      s.className = 'qn-hstamp';
      s.innerHTML = `<span class="qn-hcard">${stamp('Quest done!', '#c8323c', -6, { delay: 140 })}</span><span class="qn-thumb">${icon('sticker_thumb', 2) || img(goldStarArt(7), 2)}</span>`;
      hfx.appendChild(s);
      setTimeout(() => sfx('stamp'), 200);
      setTimeout(() => sfx('sticker', { volume: 0.6 }), 520);
      setTimeout(() => sfx('star_pop', { pitch: 1.1 }), 380);
      confetti(hfx, nb, 30);
      const a = anim(s, [{ opacity: 1 }, { opacity: 1, offset: 0.82 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 2600, fill: 'forwards' });
      if (a) a.onfinish = () => s.remove(); else setTimeout(() => s.remove(), 2600);
    },
    open() {
      if (destroyed) return Promise.resolve();
      if (state === 'open') return Promise.resolve();
      if (state === 'closed' && !api._lsnOpen) page = 'todo'; // [v26 tutorial]
      api._lsnOpen = false;
      const p = new Promise((r) => waiters.open.push(r));
      if (state === 'opening') return p;
      if (state === 'closing') { waiters.close.push(() => api.open()); return p; }
      buildStage();
      applyLayout();
      state = 'opening';
      T = REDUCED() || !visible ? TL.exit1 + 0.2 : 0; // no fox show for reduced motion
      ev.clear();
      clearPuffs();
      if (T > 0) { for (const k of ['shove0', 'shove1', 'shove2', 'shove3', 'thud', 'flipmid', 'flip1', 'proud']) ev.add(k); renderPages(); ev.add('flip0'); stage.el.classList.add('qn-writing'); }
      stage.el.classList.add('qn-on');
      stage.book.style.opacity = '';
      if (fox?.ok) { fox.push = 0; fox.lounge = 0; fox.pose = null; fox.rig.root.rotation.y = FACE_R; fox.play('walk', { fade: 0 }); }
      nb.setAttribute('aria-expanded', 'true');
      sfx('whoosh', { volume: 0.3, pitch: 0.8 });
      frameOpen(0);
      kick();
      return p;
    },
    close() {
      if (destroyed || !stage) return Promise.resolve();
      if (state === 'closed') return Promise.resolve();
      const p = new Promise((r) => waiters.close.push(r));
      if (state === 'closing') return p;
      // start from wherever the reveal got to
      const D = L.closedLeft + L.pageW + (fox?.ok ? L.foxCss * 0.5 : 0) + 60;
      from = { a: coverAngle(T), dx: T < TL.push1 ? -D * (1 - pushP(T).P) : 0, dim: sat(T / 0.3) };
      if (state === 'opening' && T < TL.flip0) { ev.add('flip0'); ev.add('flip1'); }
      const w = waiters.open; waiters.open = []; w.forEach((r) => r());
      state = 'closing';
      CT = REDUCED() ? CLOSE_T : 0;
      stage.el.classList.remove('qn-open');
      if (fox?.on) { const r = fox.wrap.getBoundingClientRect(), z = L.z; puff((r.left + r.width / 2) / z, (r.top + r.height * 0.7) / z, 0, -30, T, 2, 0.5); fox.show(false); }
      sfx('book_close', { volume: 0.7 });
      setTimeout(() => sfx('whoosh', { volume: 0.35, pitch: 1.2 }), 260);
      frameClose();
      kick();
      return p;
    },
    setVisible(on) {
      on = !!on;
      if (on === visible) return;
      visible = on;
      el.classList.toggle('qn-off', !visible);
      if (!visible && state !== 'closed') { CT = CLOSE_T; state = 'closing'; frameClose(); }
    },
    collapse(on) {
      collapsed = on == null ? !collapsed : !!on;
      el.classList.toggle('qn-col', collapsed);
      count();
    },
    update(dt) { tick(dt); },
    get _fox() { return fox; }, // previews only
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf); raf = 0;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      fox?.dispose();
      stage?.el.remove();
      el.remove();
    },
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  requestAnimationFrame(() => el.classList.remove('qn-hidden'));
  count();
  return api;
}
