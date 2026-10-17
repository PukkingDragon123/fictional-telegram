// [v27 book] MenuBook: the in-game menu is Reynard's HANDBOOK.
//
// HUD: the old square "three lines" button becomes a chunky little leather-bound
// book (oxblood leather, brass corners, a gold fox crest, a cream index plate
// with three inked lines, a green ribbon bookmark). Hover: the cover lifts and
// the ribbon wiggles.
// Tap: the book flies to the middle of the screen, grows, and the cover swings
// open (CSS 3D rotateY, page rustle). Left page: "Paused", the day, golden tails,
// the volume sliders and the pixel size. Right page: the chapters, hand-inked on
// ledger rules, each with a cloth index tab. "How to play" turns a page.
// Close (Resume / Esc / tap outside): the cover shuts and the book flies home.
//
//   decorateMenuButton(btn)   draws the book into #b-menu (keeps its id + .menubtn)
//   const mb = createMenuBook(ui)
//   mb.open({ quick })        mb.close(instant)        mb.isOpen
//   mb.showHelp()             open straight on the "How to play" spread
//
// Pixel art: texel buffers drawn at whole DEVICE pixels per texel (crispPx), then
// shown at their CSS size, so no browser (iPad Safari included) ever resamples them.
import './fonts.css';
import './menubook.css';
import { crispPx, dpr, viewSize } from './uiScale.js';
import { spriteImg } from './sprites.js';
import { FACE3D } from './faceHook.js';

// the knobs helper's pixel sliders (src/ui/pxSlider.js). A glob, not import('./pxSlider.js'):
// Vite refuses a module that names a missing file, a glob is just {} until the file exists.
const PX_SLIDER = import.meta.glob('./pxSlider.js');
function upgradeSliders(root) {
  const load = PX_SLIDER['./pxSlider.js'];
  if (!load || !root) return;
  load().then((m) => m.upgradeSliders?.(root)).catch(() => {});
}

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const eOut3 = (t) => 1 - (1 - t) ** 3;
const eIn2 = (t) => t * t;
const eIO2 = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const eBack = (t) => { const c = 1.5; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// ===========================================================================
// texel art
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
function rnd(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Px {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = (y * this.w + x) * 4, k = typeof c === 'string' ? hexc(c) : c;
    this.d[i] = k[0]; this.d[i + 1] = k[1]; this.d[i + 2] = k[2]; this.d[i + 3] = a;
    return this;
  }
  // paint over what is there (alpha 0..1), keeps the texel opaque
  mix(x, y, c, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = (y * this.w + x) * 4, k = typeof c === 'string' ? hexc(c) : c;
    if (!this.d[i + 3]) return this;
    for (let j = 0; j < 3; j++) this.d[i + j] = Math.round(this.d[i + j] + (k[j] - this.d[i + j]) * a);
    return this;
  }
  a(x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
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
  ell(cx, cy, rx, ry, c, a0 = 0, a1 = TAU, wob = 0, seed = 1) {
    const n = Math.max(8, Math.ceil((rx + ry) * 3)), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + (a1 - a0) * (i / n), w = wob ? 1 + (vn(i / n * 5, 0, seed) - 0.5) * wob : 1;
      pts.push([cx + Math.cos(t) * rx * w, cy + Math.sin(t) * ry * w]);
    }
    return this.path(pts, c);
  }
  fill(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (this.a(x, y)) return this;
    const st = [[x, y]], seen = new Uint8Array(this.w * this.h);
    while (st.length) {
      const [i, j] = st.pop();
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = j * this.w + i;
      if (seen[k] || this.d[k * 4 + 3]) continue;
      seen[k] = 1;
      this.set(i, j, c);
      st.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
    }
    return this;
  }
  outline(c) {
    const o = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[(y * this.w + x) * 4 + 3]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.a(x + dx, y + dy) > 128) { o[y * this.w + x] = 1; break; }
    }
    for (let i = 0; i < o.length; i++) if (o[i]) this.set(i % this.w, (i / this.w) | 0, c);
    return this;
  }
  // nearest-neighbour blow-up to s device px per texel (exact: no smoothing anywhere)
  canvas(s = 1) {
    const W = this.w * s, H = this.h * s;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const src = new Uint32Array(this.d.buffer), out = new Uint32Array(W * H);
    for (let y = 0; y < this.h; y++) {
      const o = y * s * W;
      for (let x = 0; x < this.w; x++) out.fill(src[y * this.w + x], o + x * s, o + x * s + s);
      for (let k = 1; k < s; k++) out.copyWithin(o + k * W, o, o + W);
    }
    cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out.buffer), W, H), 0, 0);
    return cv;
  }
}

// caches: painted texel buffers, blown-up canvases, data URLs
const BUFS = new Map(), CANV = new Map(), URLS = new Map();
const trim = (m, n) => { while (m.size > n) m.delete(m.keys().next().value); };
function buf(key, paint) { let p = BUFS.get(key); if (!p) { p = paint(); BUFS.set(key, p); trim(BUFS, 60); } return p; }
function artCanvas(key, s, paint) { const k = `${key}@${s}`; let c = CANV.get(k); if (!c) { c = buf(key, paint).canvas(s); CANV.set(k, c); trim(CANV, 10); } return c; }
function artURL(key, s, paint) { const k = `${key}@${s}`; let u = URLS.get(k); if (!u) { const p = buf(key, paint); u = { url: p.canvas(s).toDataURL(), w: p.w, h: p.h }; URLS.set(k, u); trim(URLS, 120); } return u; }
// <img> of an art entry at T CSS px per texel
function artImg(key, T, paint, cls = '', style = '') {
  const s = Math.round(T * dpr()), a = artURL(key, s, paint), k = s / dpr();
  return `<img class="mbk-px ${cls}" src="${a.url}" alt="" draggable="false" style="width:${a.w * k}px;height:${a.h * k}px;${style}">`;
}
// a fresh canvas showing (part of) a cached art canvas, sized in CSS px
function canvasEl(src, T, sx = 0, sy = 0, sw = src.width, sh = src.height, cls = 'mbk-tex') {
  const s = Math.round(T * dpr()), cv = document.createElement('canvas');
  cv.width = sw; cv.height = sh;
  cv.className = cls;
  cv.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  cv.style.width = `${(sw / s) * T}px`; cv.style.height = `${(sh / s) * T}px`;
  return cv;
}

// ---------------------------------------------------------------- palette
const LEA = ['#1a080a', '#3a1014', '#55171a', '#6e2020', '#882c26', '#a03c2e', '#b8523a', '#d0704a'];
const BRASS = ['#3e2408', '#6e4410', '#a26a1a', '#cf9a2c', '#efc650', '#fff0a8'];
const PAPER = ['#9c8460', '#c2ad86', '#dccba6', '#eadcbc', '#f4ead2', '#fbf5e6'];
const RIB = ['#0e2a1c', '#1a4a2e', '#28683e', '#3c8a50', '#64b06a'];
const INK = '#3b2414', INK_L = '#7a5a3c', RED = '#a8302a', GOLD_INK = '#8a5a10', RULE = '#9fb4d4', MARGIN = '#d98c84';
const TABS = {
  green: ['#10301c', '#1e5a32', '#2e7a46', '#58a865'],
  blue: ['#141e40', '#24407a', '#3462a8', '#6a92d0'],
  purple: ['#1e1030', '#41225e', '#6c3b90', '#9a6ac0'],
  ochre: ['#3a2408', '#7a4e14', '#b07a22', '#dcae4a'],
  gold: ['#3e2408', '#a26a1a', '#e0aa30', '#ffe07a'],
  red: ['#3a0c10', '#7a1a20', '#b0302e', '#e0645a'],
};

// leather value (ramp index, float) at a texel
function leatherV(x, y, seed) {
  let v = 3.6 + (vn(x / 7, y / 7, seed) - 0.5) * 0.9 + (vn(x / 2.3, y / 2.3, seed + 3) - 0.5) * 0.7;
  const g = h2(x, y, seed + 7);
  if (g < 0.05) v -= 0.9; else if (g > 0.97) v += 0.8; // pebbled grain
  return v;
}
// brass triangle corner cap: (cx, cy) the corner texel, (dx, dy) pointing into the board, leg n
function brassCorner(p, cx, cy, dx, dy, n) {
  for (let j = 0; j < n; j++) for (let k = 0; k < n - j; k++) {
    const x = cx + dx * k, y = cy + dy * j, d = j + k;
    let c = d === n - 1 ? BRASS[0] : (j === 0 || k === 0) ? BRASS[5] : d < n * 0.45 ? BRASS[4] : BRASS[3];
    if (d < n - 1 && d > n * 0.62 && bay(x, y) < 0.35) c = BRASS[2];
    if ((j === 0 || k === 0) && d > n - 3) c = BRASS[1];
    p.set(x, y, c);
  }
  // corner tip rounded off, rivets
  p.set(cx, cy, BRASS[2]);
  const r = Math.max(1, Math.round(n * 0.28));
  if (n >= 5) { p.set(cx + dx * r, cy + dy * r, BRASS[1]); if (n >= 9) p.set(cx + dx * r - dx, cy + dy * r - dy, BRASS[5]); }
}

// ---------------------------------------------------------------- the HUD book (24 x 30 texels)
const HW = 24, HH = 30, HCW = 20, HCH = 25;
const HUD_FOX = ['#.....#', '##...##', '#######', '#o###o#', '.#####.', '..###..', '...n...'];
function hudCover() {
  const p = new Px(HW, HH);
  for (let y = 0; y < HCH; y++) for (let x = 0; x < HCW; x++) {
    const rx = HCW - 1 - x, ry = HCH - 1 - y;
    let v = leatherV(x, y, 5) + 0.4 - (x / HCW + y / HCH) * 0.5;
    if (x <= 3) v -= 0.8; // the spine wrap
    let c = LEA[clamp(Math.floor(v + bay(x, y)), 1, 6)];
    if (x === 4) c = LEA[1]; else if (x === 5) c = LEA[5]; // hinge groove + its lit edge
    if (x === 0 || y === 0 || rx === 0 || ry === 0) c = LEA[0];
    else if (y === 1) c = x <= 3 ? LEA[4] : LEA[6];
    else if (ry === 1 || rx === 1) c = LEA[2];
    else if (x === 1) c = LEA[4];
    p.set(x, y, c);
  }
  // raised bands across the spine
  for (const by of [4, 19]) for (let x = 1; x <= 3; x++) { p.set(x, by, BRASS[4]); p.set(x, by + 1, BRASS[2]); p.set(x, by + 2, LEA[1]); }
  // gold fox crest, stamped (debossed shadow first)
  const fx = 9, fy = 2;
  HUD_FOX.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && HUD_FOX[j + 1]?.[i + 1] !== '#') p.set(fx + i + 1, fy + j + 1, LEA[1]); }));
  HUD_FOX.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    const c = ch === 'o' ? LEA[1] : ch === 'n' ? BRASS[1] : j === 0 || (j === 2 && (i === 0 || i === 6)) ? BRASS[5] : i >= 5 || j >= 5 ? BRASS[2] : BRASS[4];
    p.set(fx + i, fy + j, c);
  }));
  p.set(fx + 3, fy + 2, BRASS[5]);
  // the index plate: three inked lines (the old menu icon, now an index card)
  const px0 = 7, py0 = 11, pw = 11, ph = 9;
  for (let x = px0 + 1; x < px0 + pw + 1; x++) p.set(x, py0 + ph, LEA[1]); // plate shadow
  for (let y = py0 + 1; y <= py0 + ph; y++) p.set(px0 + pw, y, LEA[1]);
  for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) {
    const lx = x - px0, ly = y - py0, rx = pw - 1 - lx, ry = ph - 1 - ly;
    if ((lx === 0 || rx === 0) && (ly === 0 || ry === 0)) continue;
    let c = ly < 4 || bay(x, y) < 0.6 ? PAPER[5] : PAPER[4];
    if (ly === 0) c = BRASS[4]; else if (ry === 0) c = BRASS[1]; else if (lx === 0) c = BRASS[3]; else if (rx === 0) c = BRASS[2];
    else if (ry === 1) c = PAPER[3];
    p.set(x, y, c);
  }
  for (const ly of [2, 4, 6]) { p.set(px0 + 2, py0 + ly, RED); for (let x = px0 + 4; x <= px0 + 8; x++) p.set(x, py0 + ly, x === px0 + 8 && ly === 4 ? PAPER[4] : INK); }
  // brass corner caps on the fore edge
  brassCorner(p, HCW - 1, 0, -1, 1, 5);
  brassCorner(p, HCW - 1, HCH - 1, -1, -1, 5);
  return p;
}
function hudBase() {
  const p = new Px(HW, HH);
  // back board, offset (3, 3)
  for (let y = 3; y < HCH + 3; y++) for (let x = 3; x < HCW + 3; x++) {
    const e = x === HCW + 2 || y === HCH + 2 || x === 3 || y === 3;
    p.set(x, y, e ? LEA[0] : LEA[clamp(Math.floor(leatherV(x, y, 9) - 1.2 + bay(x, y)), 1, 3)]);
  }
  p.set(HCW + 2, HCH + 2, LEA[1]);
  // page block (offsets 1 and 2): the fore edge and the tail show
  for (let y = 1; y < HCH + 2; y++) for (let x = 1; x < HCW + 2; x++) {
    let c = PAPER[4];
    if (x >= HCW) c = x === HCW ? PAPER[4] : y % 2 ? PAPER[3] : PAPER[2];
    if (y >= HCH) c = y === HCH ? PAPER[4] : x % 3 === 0 ? PAPER[1] : PAPER[2];
    if (x === HCW + 1 && y >= HCH) c = PAPER[1];
    p.set(x, y, c);
  }
  // page one under the cover (seen when it lifts): ledger rules + a red margin + a scribble
  for (let y = 1; y < HCH - 1; y++) for (let x = 1; x < HCW - 1; x++) p.set(x, y, x < 3 ? PAPER[3] : bay(x, y) < 0.15 ? PAPER[4] : PAPER[5]);
  for (let y = 7; y < HCH - 2; y += 3) for (let x = 3; x < HCW - 2; x++) p.set(x, y, '#c4cfe0');
  for (let y = 1; y < HCH - 1; y++) p.set(5, y, MARGIN);
  p.path([[7, 4], [8, 3], [9, 5], [10, 3], [11, 4], [13, 4]], RED);
  p.path([[7, 9], [11, 9]], INK); p.path([[7, 12], [13, 12]], INK); p.path([[7, 15], [10, 15]], INK);
  return p;
}
const HUD_RIB = [6, 25, 3, 5]; // x, y, w, h
function hudRibbon() {
  const [, , w, h] = HUD_RIB, p = new Px(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y === h - 1 && x === 1) continue; // swallowtail
    p.set(x, y, y === 0 ? RIB[1] : x === 0 ? RIB[4] : x === 1 ? RIB[3] : RIB[1]);
  }
  return p;
}

// ---------------------------------------------------------------- the big book
// board (cover leather) behind one page. side: 'L' (outer edge left), 'R' (outer edge right), 'S' (single: both)
function paintBoard(p, w, h, side, seed) {
  const outL = side !== 'R', outR = side !== 'L';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const rx = w - 1 - x, ry = h - 1 - y;
    const eL = outL ? x : 99, eR = outR ? rx : 99;
    // rounded outer corners (r 2)
    const cx = Math.min(eL, eR), cy = Math.min(y, ry);
    if (cx < 2 && cy < 2 && Math.hypot(2 - cx, 2 - cy) > 2.3) continue;
    let v = leatherV(x + (side === 'R' ? 400 : 0), y, seed) + 0.2 - (y / h) * 0.5;
    let c = LEA[clamp(Math.floor(v + bay(x, y)), 1, 6)];
    if (Math.min(eL, eR, y, ry) === 0) c = LEA[0];
    else if (y === 1) c = LEA[6];
    else if (ry === 1) c = LEA[2];
    else if (eL === 1) c = LEA[5];
    else if (eR === 1) c = LEA[2];
    p.set(x, y, c);
  }
  // the spine: a dark crease where the boards meet
  if (side === 'L') for (let y = 1; y < h - 1; y++) { p.set(w - 1, y, LEA[1]); p.set(w - 2, y, LEA[2]); }
  if (side === 'R') for (let y = 1; y < h - 1; y++) { p.set(0, y, LEA[1]); p.set(1, y, LEA[3]); }
  const n = 8;
  if (outL) { brassCorner(p, 0, 0, 1, 1, n); brassCorner(p, 0, h - 1, 1, -1, n); }
  if (outR) { brassCorner(p, w - 1, 0, -1, 1, n); brassCorner(p, w - 1, h - 1, -1, -1, n); }
}
// stacked page edges peeking out under the top page (outer side + tail)
function paintStack(p, x0, y0, pw, ph, dir) {
  for (let i = 3; i >= 1; i--) {
    const ox = x0 + dir * i, oy = y0 + i;
    for (let y = oy; y < oy + ph; y++) for (let x = ox; x < ox + pw; x++) {
      const edge = (dir < 0 ? x === ox : x === ox + pw - 1) || y === oy + ph - 1;
      p.set(x, y, edge ? (i === 3 ? PAPER[0] : PAPER[1]) : PAPER[i === 1 ? 3 : 2]);
    }
  }
}
// headband (stitched cloth band) at the head + tail of the spine
function paintHeadband(p, x0, y0, w) {
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + 2; y++) p.set(x, y, (x + y) % 2 ? '#c8303a' : '#f0dca0');
}
// a page of paper. side 'L' | 'R' (gutter on the other side) | 'S'. deco 'frame' | 'rules'
function paintPage(p, x0, y0, w, h, side, seed, deco, rules) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = side === 'L' ? w - 1 - x : x; // texels from the spine
    const o = side === 'L' ? x : w - 1 - x;
    let v = 3.7 + (vn((x0 + x) / 11, (y0 + y) / 11, seed) - 0.5) * 0.5 + (vn((x0 + x) / 3.5, (y0 + y) / 3.5, seed + 2) - 0.5) * 0.3;
    v += (1 - y / h) * 0.3 - 0.12;
    const gw = side === 'S' ? 8 : 20;
    if (g < gw) v -= ((gw - g) / gw) ** 2 * (side === 'S' ? 1.2 : 2.3); // the paper curves into the gutter
    if (o < 5) v -= (5 - o) * 0.1;
    let c = PAPER[clamp(Math.floor(v + bay(x0 + x, y0 + y)), 1, 5)];
    if (g === 0 && side !== 'S') c = PAPER[0];
    else if (o === 0 || y === 0 || y === h - 1) c = PAPER[2];
    p.set(x0 + x, y0 + y, c);
  }
  // fibres
  const R = rnd(seed * 7 + 3);
  for (let i = 0; i < (w * h) / 180; i++) {
    const fx = x0 + 3 + Math.floor(R() * (w - 6)), fy = y0 + 3 + Math.floor(R() * (h - 6)), len = 1 + Math.floor(R() * 3), hz = R() < 0.6;
    for (let k = 0; k < len; k++) p.mix(fx + (hz ? k : 0), fy + (hz ? 0 : k), PAPER[1], 0.35);
  }
  const gx = (k) => (side === 'L' ? x0 + w - 1 - k : x0 + k); // x at k texels from the spine
  if (deco === 'frame') {
    // a printed double rule with little corner knots
    const a = 6, b = 8;
    const box = (ins, al) => {
      for (let x = x0 + ins; x < x0 + w - ins; x++) { p.mix(x, y0 + ins, PAPER[0], al); p.mix(x, y0 + h - 1 - ins, PAPER[0], al); }
      for (let y = y0 + ins; y < y0 + h - ins; y++) { p.mix(x0 + ins, y, PAPER[0], al); p.mix(x0 + w - 1 - ins, y, PAPER[0], al); }
    };
    box(a, 0.55); box(b, 0.35);
    for (const [cx, cy] of [[x0 + a, y0 + a], [x0 + w - 1 - a, y0 + a], [x0 + a, y0 + h - 1 - a], [x0 + w - 1 - a, y0 + h - 1 - a]]) {
      for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) p.mix(cx + dx, cy + dy, RED, 0.75);
    }
  } else if (deco === 'rules' && rules) {
    const { r0, R: step } = rules;
    for (let y = y0 + r0; y < y0 + h - 4; y += step) for (let x = x0 + 3; x < x0 + w - 3; x++) p.mix(x, y, RULE, h2(x, y, 4) < 0.06 ? 0.3 : 0.62);
    for (let y = y0 + 1; y < y0 + h - 1; y++) { p.mix(gx(22), y, MARGIN, 0.8); p.mix(gx(24), y, MARGIN, 0.55); }
  }
}
// one half of the open book: board + page stack + page
function halfArt(side, pw, ph, B, rules, single) {
  const w = single ? pw + 2 * B : pw + B, h = ph + 2 * B;
  const p = new Px(w, h);
  paintBoard(p, w, h, single ? 'S' : side, side === 'L' ? 21 : 33);
  const px = single ? B : side === 'L' ? B : 0, py = B;
  paintStack(p, px, py, pw, ph, side === 'L' ? -1 : 1);
  paintPage(p, px, py, pw, ph, single ? 'S' : side, side === 'L' ? 5 : 8, single || side === 'L' ? 'frame' : 'rules', rules);
  if (!single) { paintHeadband(p, side === 'L' ? w - 3 : 0, B - 2, 3); paintHeadband(p, side === 'L' ? w - 3 : 0, B + ph, 3); }
  return p;
}
// the front cover (shut): leather, gold tooling, brass corners, a fox medallion, a title plate
const FOXHEAD = [[-0.92, -0.98], [-0.5, -0.42], [-0.22, -0.5], [0.22, -0.5], [0.5, -0.42], [0.92, -0.98], [0.86, -0.2], [1.02, 0.18], [0.66, 0.34], [0.2, 0.86], [0, 0.96], [-0.2, 0.86], [-0.66, 0.34], [-1.02, 0.18], [-0.86, -0.2]];
const EARL = [[-0.8, -0.8], [-0.5, -0.46], [-0.74, -0.3]];
function inPoly(V, x, y) {
  let o = false;
  for (let i = 0, j = V.length - 1; i < V.length; j = i++) {
    const [xi, yi] = V[i], [xj, yj] = V[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o;
  }
  return o;
}
function coverGeo(cw, ch) {
  const cx = Math.round((6 + cw) / 2), r = Math.round(clamp(Math.min((cw - 16) * 0.34, ch * 0.2), 10, 44));
  const cy = Math.round(ch * 0.43);
  const plW = Math.round((cw - 10) * 0.66), plH = Math.round(clamp(r * 0.62, 12, 28));
  return { cx, cy, r, pl: { x: cx - Math.round(plW / 2), y: cy + r + Math.round(r * 0.35) + 3, w: plW, h: plH }, title: cy - r - Math.round(r * 0.35) - 3 };
}
function coverArt(cw, ch) {
  const p = new Px(cw, ch);
  paintBoard(p, cw, ch, 'R', 47);
  // hinge groove along the spine
  for (let y = 1; y < ch - 1; y++) { p.set(4, y, LEA[1]); p.set(5, y, LEA[5]); for (let x = 1; x < 4; x++) p.mix(x, y, LEA[0], 0.35); }
  const G = coverGeo(cw, ch);
  // gold tooling: a double frame, dotted inner line, corner diamonds
  const a = 10, x0 = 6 + a - 2, x1 = cw - 1 - a, y0 = a, y1 = ch - 1 - a;
  for (let x = x0; x <= x1; x++) { p.set(x, y0, (x % 6) ? BRASS[3] : BRASS[5]); p.set(x, y1, BRASS[2]); if (x % 2) { p.set(x, y0 + 3, BRASS[2]); p.set(x, y1 - 3, BRASS[2]); } }
  for (let y = y0; y <= y1; y++) { p.set(x0, y, (y % 6) ? BRASS[3] : BRASS[5]); p.set(x1, y, BRASS[2]); if (y % 2) { p.set(x0 + 3, y, BRASS[2]); p.set(x1 - 3, y, BRASS[2]); } }
  for (const [qx, qy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) p.set(qx + dx, qy + dy, Math.abs(dx) + Math.abs(dy) === 2 ? BRASS[4] : BRASS[5]);
  // medallion
  const { cx, cy, r } = G, rf = r - 4;
  for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 0.5) continue;
    if (d > r - 3.2) {
      const lit = -((x - cx) + (y - cy)) / r;
      p.set(x, y, d > r - 0.6 ? BRASS[0] : BRASS[clamp(Math.floor(3 + lit * 1.2 + bay(x, y) - (d > r - 1.6 ? 0 : 0.6)), 1, 5)]);
    } else {
      const nx = (x - cx) / rf, ny = (y - cy) / rf + 0.04;
      if (inPoly(FOXHEAD, nx, ny)) {
        const lit = 3.1 + (-nx - ny) * 0.75;
        let c = BRASS[clamp(Math.floor(lit + bay(x, y)), 1, 5)];
        if (inPoly(EARL, nx, ny) || inPoly(EARL.map(([u, w]) => [-u, w]), nx, ny)) c = BRASS[1];
        if (ny > 0.32 && Math.abs(nx) < 0.48 - (ny - 0.32) * 0.5) c = BRASS[bay(x, y) < 0.5 ? 5 : 4]; // the white muzzle
        const ex = Math.abs(nx) - 0.38, ey = ny - 0.02 + (Math.abs(nx) - 0.38) * 0.5;
        if ((ex / 0.13) ** 2 + (ey / 0.07) ** 2 <= 1) c = LEA[0]; // sly eyes
        if (Math.hypot(nx / 1.6, ny - 0.84) < 0.075) c = LEA[0]; // nose
        p.set(x, y, c);
      } else p.set(x, y, LEA[clamp(Math.floor(2.1 + (vn(x / 3, y / 3, 3) - 0.5) + bay(x, y)), 1, 3)]);
    }
  }
  // fox outline
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.hypot(x - cx, y - cy) > r - 3.5) continue;
    const ins = (X, Y) => inPoly(FOXHEAD, (X - cx) / rf, (Y - cy) / rf + 0.04);
    if (ins(x, y) && (!ins(x + 1, y) || !ins(x - 1, y) || !ins(x, y + 1) || !ins(x, y - 1))) p.set(x, y, BRASS[0]);
  }
  // title plate
  const { pl } = G;
  for (let x = pl.x + 1; x <= pl.x + pl.w; x++) p.set(x, pl.y + pl.h, LEA[0]);
  for (let y = pl.y + 1; y <= pl.y + pl.h; y++) p.set(pl.x + pl.w, y, LEA[0]);
  for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) {
    const lx = x - pl.x, ly = y - pl.y, rx = pl.w - 1 - lx, ry = pl.h - 1 - ly, e = Math.min(lx, ly, rx, ry);
    if (e === 0 && (lx === 0 || rx === 0) && (ly === 0 || ry === 0)) continue;
    let c = (ly / pl.h < 0.5 || bay(x, y) < 0.55) ? PAPER[5] : PAPER[4];
    if (e === 0) c = BRASS[0];
    else if (e === 1) c = ly === 1 ? BRASS[5] : ry === 1 ? BRASS[1] : lx === 1 ? BRASS[4] : BRASS[2];
    else if (e === 2) c = ry === 2 ? PAPER[2] : PAPER[3];
    p.set(x, y, c);
  }
  for (const [sx, sy] of [[pl.x + 3, pl.y + 3], [pl.x + pl.w - 4, pl.y + 3], [pl.x + 3, pl.y + pl.h - 4], [pl.x + pl.w - 4, pl.y + pl.h - 4]]) { p.set(sx, sy, BRASS[2]); p.set(sx - 1, sy - 1, BRASS[4]); }
  return p;
}
// inside of the front cover (single page mode): leather turn-ins + marbled endpaper
function innerCoverArt(cw, ch) {
  const p = new Px(cw, ch);
  paintBoard(p, cw, ch, 'L', 61);
  const m = 6;
  for (let y = m; y < ch - m; y++) for (let x = m; x < cw - m; x++) {
    const t = vn(x / 9 + Math.sin(y / 7) * 0.8, y / 5, 9);
    p.set(x, y, t > 0.62 ? '#3c6a8a' : t > 0.48 ? '#e8d8b0' : t > 0.3 ? '#a8302a' : '#2a3c5c');
  }
  return p;
}
// the ribbon: a strip lying on the page (top) and the tail hanging out of the book (swings)
function ribbonLay(h) {
  const p = new Px(6, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 5; x++) p.set(x, y, x === 0 ? RIB[4] : x === 4 ? RIB[1] : y % 7 === 3 && x === 2 ? RIB[2] : RIB[3]);
    if (y > 2) p.set(5, y, '#000000', 40); // shadow on the paper
  }
  return p;
}
function ribbonTail(len) {
  const p = new Px(5, len);
  for (let y = 0; y < len; y++) for (let x = 0; x < 5; x++) {
    if (y >= len - 3 && Math.abs(x - 2) < 3 - (len - 1 - y)) continue; // swallowtail notch
    p.set(x, y, x === 0 ? RIB[4] : x === 4 ? RIB[1] : y === 0 ? RIB[1] : y % 7 === 4 && x === 2 ? RIB[2] : RIB[3]);
  }
  return p;
}
// cloth index tab (sticks out of the right page): w texels, h tall, tuck texels on the page
function tabArt(col, w, h, tuck) {
  const R4 = TABS[col] || TABS.green, p = new Px(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const rx = w - 1 - x, ry = h - 1 - y;
    if (rx === 0 && (y === 0 || ry === 0)) continue;
    let c = R4[2];
    if (rx === 0 || y === 0 || ry === 0) c = R4[0];
    else if (y === 1) c = R4[3];
    else if (ry === 1 || rx === 1) c = R4[1];
    else if (bay(x, y) < 0.18 && x > tuck + 2) c = R4[1];
    if (x < tuck) { if (y === 0 || ry === 0) c = R4[0]; p.set(x, y, c, 190); continue; }
    if (x === tuck) c = R4[0]; // the page edge it is glued round
    p.set(x, y, c);
  }
  // stitch dashes
  for (let y = 3; y < h - 3; y += 2) p.set(w - 4, y, R4[3]);
  return p;
}
const dotsArt = () => { const p = new Px(4, 1); p.set(0, 0, INK_L); return p; };
// ink doodles for the chapters (11 x 11): pen lines + a highlighter fill
const DOOD = {
  play: (p) => { p.path([[2, 1], [9, 5], [2, 10], [2, 1]], INK); p.fill(4, 5, '#9ad07a'); p.set(3, 3, '#d4f0b8'); },
  cog: (p) => {
    for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; p.line(5.5 + Math.cos(a) * 3.4, 5.5 + Math.sin(a) * 3.4, 5.5 + Math.cos(a) * 5, 5.5 + Math.sin(a) * 5, INK); }
    p.ell(5.5, 5.5, 3.3, 3.3, INK); p.fill(5, 3, '#c8cadc'); p.fill(5, 8, '#c8cadc'); p.ell(5.5, 5.5, 1.2, 1.2, INK);
  },
  help: (p) => {
    p.ell(5.5, 5.5, 5, 5, INK, -0.4, TAU - 0.2, 0.1, 3); p.fill(5, 5, '#a8c8f0');
    p.path([[4, 4], [4, 3], [5, 2], [7, 2], [8, 3], [8, 4], [6, 6], [6, 7]], INK); p.set(6, 9, INK);
  },
  save: (p) => {
    p.path([[1, 1], [8, 1], [10, 3], [10, 10], [1, 10], [1, 1]], INK); p.fill(5, 7, '#7aa0d8');
    p.rect(3, 2, 5, 3, '#fbf5e6'); p.set(6, 3, INK); p.rect(3, 6, 6, 4, '#fbf5e6'); p.line(4, 7, 7, 7, '#c4cfe0'); p.line(4, 8, 7, 8, '#c4cfe0');
  },
  trophy: (p) => {
    p.path([[2, 1], [9, 1], [9, 4], [7, 6], [4, 6], [2, 4], [2, 1]], INK); p.fill(5, 3, '#ffd75a');
    p.path([[2, 2], [0, 2], [0, 3], [2, 5]], INK); p.path([[9, 2], [11, 2], [11, 3], [9, 5]], INK);
    p.line(5, 7, 6, 7, INK); p.line(5, 8, 6, 8, INK); p.path([[3, 10], [8, 10], [8, 9], [3, 9], [3, 10]], INK); p.set(4, 2, '#fff1a8');
  },
  egg: (p) => {
    p.ell(5.5, 6, 4, 4.6, INK, -0.2, TAU - 0.05, 0.06, 2); p.fill(5, 6, '#fff0d0');
    p.path([[2, 6], [4, 5], [5, 7], [7, 5], [9, 6]], RED); p.set(4, 3, '#ffffff');
  },
};
const doodleArt = (name) => () => { const p = new Px(12, 12); (DOOD[name] || DOOD.play)(p); return p; };
// a red pen circle round a word (w x h texels), a pen swash, a golden tail
function circleArt(w, h) { const p = new Px(w, h); p.ell(w / 2 - 0.5, h / 2 - 0.3, w / 2 - 1, h / 2 - 1.2, RED, -0.5, TAU + 0.35, 0.07, w); return p; }
function swashArt(w) {
  const p = new Px(w, 6);
  for (let x = 0; x < w - 4; x++) {
    const y = 3 + Math.sin((x / w) * 5.2) * 0.9;
    p.set(x, y, RED); if (x > 3 && x < w - 12) p.set(x, y + 1, RED);
  }
  p.path([[w - 5, 3], [w - 3, 1], [w - 1, 0]], RED);
  return p;
}
function tailArt() {
  const p = new Px(15, 9);
  for (let x = 0; x < 14; x++) {
    const t = x / 13, cy = 5 - Math.sin(t * 3.2) * 2.2, r = 0.6 + Math.sin(t * Math.PI) * 2.6 * (1 - t * 0.25);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) if (Math.abs(y - cy) <= r) p.set(x, y, x > 10 ? '#fff6d8' : y < cy - r * 0.3 ? BRASS[4] : BRASS[3]);
  }
  p.outline(BRASS[0]);
  return p;
}

// ===========================================================================
// HUD button
// ===========================================================================
export function decorateMenuButton(btn) {
  if (!btn) return;
  const draw = () => {
    const T = crispPx(2), s = Math.round(T * dpr());
    btn.dataset.mbkS = String(s);
    btn.classList.add('mbk-hud');
    btn.setAttribute('aria-label', 'Menu');
    btn.style.setProperty('--hw', `${HW * T}px`);
    btn.style.setProperty('--hh', `${HH * T}px`);
    btn.innerHTML = `<span class="mbk-hb" aria-hidden="true">${artImg('hud:base', T, hudBase, 'mbk-h0')}${artImg('hud:rib', T, hudRibbon, 'mbk-hr', `left:${HUD_RIB[0] * T}px;top:${HUD_RIB[1] * T}px`)}<span class="mbk-hc">${artImg('hud:cover', T, hudCover)}</span></span>`;
  };
  draw();
  if (!btn.dataset.mbkBound) {
    btn.dataset.mbkBound = '1';
    addEventListener('resize', () => { if (String(Math.round(crispPx(2) * dpr())) !== btn.dataset.mbkS) draw(); });
  }
}

// ===========================================================================
// tween helper (rAF + a timer so it always settles)
// ===========================================================================
function tween(ms, fn, ease = (t) => t) {
  return new Promise((res) => {
    let done = false;
    const end = () => { if (done) return; done = true; try { fn(1, 1); } catch { /* detached */ } res(); };
    if (ms <= 0) { end(); return; }
    const t0 = performance.now();
    const step = (now) => {
      if (done) return;
      const t = Math.min(1, (now - t0) / ms);
      if (t >= 1) { end(); return; }
      try { fn(ease(t), t); } catch { /* detached */ }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(end, ms + 500);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// safe-area insets in CSS px (iPhone notch / home bar)
function safeInsets(host) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  (host || document.body).appendChild(d);
  const cs = getComputedStyle(d), o = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  d.remove();
  return o;
}

// ===========================================================================
// the book
// ===========================================================================
export function createMenuBook(ui) { return new MenuBook(ui); }

class MenuBook {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.isOpen = false;
    this.busy = false;
    this.gen = 0;
    this.view = 'menu';
    this.quickNext = false;
  }

  sfx(n, o) { try { this.game.audio?.play(n, o); } catch { /* optional */ } }

  get btn() { return document.getElementById('b-menu'); }

  // ------------------------------------------------------------ layout
  layout(nRows) {
    const { w: VW, h: VH } = viewSize();
    const sf = safeInsets(this.ui.root);
    const T = crispPx(2), s = Math.round(T * dpr());
    const B = 6, TAB = 5, TAIL = 12;
    const AW = VW - sf.l - sf.r - 20, AH = VH - sf.t - sf.b - 14;
    const aw = AW / T, ah = AH / T;
    const single = AW < 600;
    let pw, ph;
    if (!single) {
      ph = Math.floor(Math.min(272, ah - 2 * B - TAIL));
      pw = Math.floor(Math.min(216, (aw - 2 * B - TAB - 2) / 2, ph * 1.04));
    } else {
      pw = Math.floor(Math.min(210, aw - 2 * B - TAB - 2));
      ph = Math.floor(Math.min(340, ah - 2 * B - TAIL));
    }
    const R = single ? 13 : clamp(Math.floor((ph - 12) / (2 * nRows + 2.8)), 9, 14);
    const r0 = Math.round(R * 1.7) + 3;
    const W = single ? pw + 2 * B : 2 * (pw + B), H = ph + 2 * B;
    const snap = (v) => Math.round(v * dpr()) / dpr();
    const x = snap(sf.l + 10 + (AW - (W + TAB) * T) / 2), y = snap(sf.t + 7 + (AH - (H + TAIL) * T) / 2);
    const compact = ph * T < 470;
    return { T, s, B, TAB, TAIL, pw, ph, R, r0, W, H, x, y, single, compact, spine: single ? 0 : pw + B };
  }

  // ------------------------------------------------------------ build
  build() {
    const game = this.game, ui = this.ui;
    this.canRetire = !!(game.state?.research?.includes?.('r_franchise') || game.structures?.countBuilt?.('franchise') > 0);
    const rows = this.chapters().length;
    const L = (this.L = this.layout(rows));
    const { T, s, B, pw, ph, single } = L;
    const st = document.createElement('div');
    st.className = `mbk-stage${single ? ' mbk-single' : ''}${L.compact ? ' mbk-compact' : ''}`;
    st.style.setProperty('--T', `${T}px`);
    st.style.setProperty('--R', `${L.R * T}px`);
    st.style.setProperty('--fsC', `${Math.round(clamp(L.R * T * 0.98, 19, 28))}px`);
    st.style.setProperty('--fsH', `${Math.round(clamp(L.R * T * 0.66, 14, 19))}px`);
    st.setAttribute('role', 'dialog');
    st.setAttribute('aria-modal', 'true');
    st.setAttribute('aria-label', 'Menu');
    st.innerHTML = `<div class="mbk-dim"></div><div class="mbk-book" style="left:${L.x}px;top:${L.y}px;width:${L.W * T}px;height:${L.H * T}px"></div>`;
    const book = st.querySelector('.mbk-book');
    const rules = { r0: L.r0, R: L.R };
    const key = `${pw}x${ph}:${B}:${L.r0}:${L.R}:${single ? 1 : 0}`;
    const mk = (cls, x, w) => {
      const d = document.createElement('div');
      d.className = `mbk-half ${cls}`;
      Object.assign(d.style, { left: `${x * T}px`, width: `${w * T}px`, height: `${L.H * T}px` });
      book.appendChild(d);
      return d;
    };
    const page = (half, x) => {
      const pg = document.createElement('div');
      pg.className = 'mbk-page';
      Object.assign(pg.style, { left: `${x * T}px`, top: `${B * T}px`, width: `${pw * T}px`, height: `${ph * T}px` });
      half.appendChild(pg);
      return pg;
    };
    this.texL = single ? null : artCanvas(`half:L:${key}`, s, () => halfArt('L', pw, ph, B, rules, false));
    this.texR = artCanvas(`half:R:${key}`, s, () => halfArt('R', pw, ph, B, rules, single));
    if (!single) {
      this.halfL = mk('mbk-hl', 0, pw + B);
      this.halfL.appendChild(canvasEl(this.texL, T));
      this.pageL = page(this.halfL, B);
    } else { this.halfL = null; this.pageL = null; }
    this.halfR = mk('mbk-hrr', L.spine, single ? pw + 2 * B : pw + B);
    this.halfR.appendChild(canvasEl(this.texR, T));
    const ribX = single ? B + 3 : 4;
    this.halfR.insertAdjacentHTML('beforeend', artImg(`rib:lay:${ph + B + 3}`, T, () => ribbonLay(ph + B + 3), 'mbk-rib', `left:${ribX * T}px;top:${(B - 3) * T}px`));
    this.halfR.insertAdjacentHTML('beforeend', `<span class="mbk-tailw" style="left:${ribX * T}px;top:${(L.H - 1) * T}px">${artImg(`rib:tail:${L.TAIL}`, T, () => ribbonTail(L.TAIL))}</span>`);
    this.pageR = page(this.halfR, single ? B : 0);
    // the front cover (two faces) over the right half
    const cw = single ? pw + 2 * B : pw + B, ch = L.H;
    const cov = (this.cover = document.createElement('div'));
    cov.className = 'mbk-cover';
    Object.assign(cov.style, { left: `${L.spine * T}px`, width: `${cw * T}px`, height: `${ch * T}px` });
    const cf = (this.cf = document.createElement('div'));
    cf.className = 'mbk-face mbk-cf';
    cf.appendChild(canvasEl(artCanvas(`cover:${cw}x${ch}`, s, () => coverArt(cw, ch)), T));
    const G = coverGeo(cw, ch);
    cf.insertAdjacentHTML('beforeend', `<b class="mbk-ct1" style="top:${(G.title - 6) * T}px;left:${6 * T}px;right:0;font-size:${Math.round(clamp(G.r * T * 0.32, 13, 26))}px">REYNARD'S</b><b class="mbk-ct2" style="left:${G.pl.x * T}px;top:${G.pl.y * T}px;width:${G.pl.w * T}px;height:${G.pl.h * T}px;font-size:${Math.round(G.pl.h * T * 0.6)}px">Handbook</b><i class="mbk-shade"></i>`);
    const cb = (this.cb = document.createElement('div'));
    cb.className = 'mbk-face mbk-cb';
    if (!single) {
      cb.appendChild(canvasEl(this.texL, T));
      const pg = (this.cbPage = document.createElement('div'));
      pg.className = 'mbk-page';
      Object.assign(pg.style, { left: `${B * T}px`, top: `${B * T}px`, width: `${pw * T}px`, height: `${ph * T}px` });
      cb.appendChild(pg);
    } else {
      cb.appendChild(canvasEl(artCanvas(`inner:${cw}x${ch}`, s, () => innerCoverArt(cw, ch)), T));
      this.cbPage = null;
    }
    cb.insertAdjacentHTML('beforeend', '<i class="mbk-shade"></i>');
    cov.append(cf, cb);
    book.appendChild(cov);
    this.stage = st;
    this.book = book;
    this.dim = st.querySelector('.mbk-dim');
    // contents
    this.menuL = this.buildSettings();
    this.menuR = this.buildChapters();
    this.helpL = this.helpR = null;
    if (single) this.pageR.append(this.menuL, this.menuR);
    else this.pageR.appendChild(this.menuR);
    ui.root.appendChild(st);
    this.bindStage();
  }

  chapters() {
    const list = [
      { id: 'm-ok', act: 'resume', t: 'Resume', d: 'play', tab: 'green' },
      { id: 'm-settings', act: 'settings', t: 'Settings', d: 'cog', tab: 'blue' },
      { id: 'm-help', act: 'help', t: 'How to play', d: 'help', tab: 'purple' },
      { id: 'm-save', act: 'save', t: 'Save', d: 'save', tab: 'ochre' },
    ];
    if (this.canRetire) list.push({ id: 'm-retire', act: 'retire', t: 'Retire (prestige)', d: 'trophy', tab: 'gold', cls: 'mbk-gold' });
    list.push({ id: 'm-reset', act: 'reset', t: 'New game', d: 'egg', tab: 'red', cls: 'mbk-red' });
    return list;
  }

  // left page: Paused, the day, golden tails, volumes, pixel size
  buildSettings() {
    const game = this.game, L = this.L, T = L.T;
    const v = game.audio?.getVolumes?.() || { music: 0.5, sfx: 0.8, ambience: 0.6 };
    const day = game.state?.day || 1;
    const wd = (() => { try { return game.weekday?.() || ''; } catch { return ''; } })();
    const season = game.seasons?.season ? String(game.seasons.season) : '';
    const tails = game.legacy?.tails || 0, best = game.legacy?.best || 0;
    const fox = FACE3D.img?.({ sticker: true, who: 'fox', expr: 'sleepy', frame: 'bust' }, (L.compact ? 22 : 32) * T, (L.compact ? 25 : 36) * T, 'mbk-px mbk-fox') || '';
    const el = document.createElement('div');
    el.className = 'mbk-pc mbk-set';
    el.innerHTML = `
      ${fox}
      <h2 class="mbk-h">Paused</h2>
      ${artImg('swash:64', T, () => swashArt(64), 'mbk-swash')}
      <div class="mbk-date">${esc(wd)}${wd ? ' · ' : ''}Day ${day}${season ? ` <i>(${esc(season)})</i>` : ''}</div>
      <div class="mbk-tails">${artImg('tail', T, tailArt, 'mbk-taili')}<span>Golden tails: ${tails} (+${tails * 10}% coins) · Best: day ${best}</span></div>
      <div class="mbk-sec"><span>Volume</span></div>
      <div class="mbk-vol">
        <label for="v-music">Music</label><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" id="v-music">
        <label for="v-sfx">Sound effects</label><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" id="v-sfx">
        <label for="v-amb">Ambience</label><input type="range" min="0" max="100" value="${Math.round(v.ambience * 100)}" id="v-amb">
      </div>
      <div class="mbk-sec"><span>Pixel size</span></div>
      <div class="mbk-pxs" role="radiogroup" aria-label="Pixel size">
        <button type="button" role="radio" data-px="0.7">Chunky</button><button type="button" role="radio" data-px="1">Normal</button><button type="button" role="radio" data-px="1.4">Fine</button>
      </div>`;
    const setV = () => game.audio?.setVolumes?.({ music: el.querySelector('#v-music').value / 100, sfx: el.querySelector('#v-sfx').value / 100, ambience: el.querySelector('#v-amb').value / 100 });
    for (const id of ['#v-music', '#v-sfx', '#v-amb']) el.querySelector(id).oninput = setV;
    const cur = String(game.renderer?.pixelDensity ?? 1);
    const pick = (val, first) => {
      for (const b of el.querySelectorAll('[data-px]')) {
        const on = b.dataset.px === val;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.querySelector('.mbk-circ')?.remove();
        if (on) this.circle(b, first);
      }
    };
    for (const b of el.querySelectorAll('[data-px]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.classList.contains('on')) return;
        this.sfx('pen', { volume: 0.5 });
        pick(b.dataset.px);
        try { game.renderer.pixelDensity = +b.dataset.px; game.resize?.(); localStorage.setItem('tbme.px', b.dataset.px); } catch { /* ignore */ }
      });
    }
    el._pick = () => pick(['0.7', '1', '1.4'].includes(cur) ? cur : '1', true);
    return el;
  }

  // a red pen circle round the chosen pixel size (drawn to the word's size once it is laid out)
  circle(b, instant) {
    const T = this.L.T;
    const w = b.offsetWidth, h = b.offsetHeight;
    if (!w) { requestAnimationFrame(() => { if (b.classList.contains('on') && !b.querySelector('.mbk-circ')) this.circle(b, instant); }); return; }
    const tw = Math.ceil(w / T) + 4, th = Math.ceil(h / T) + 2;
    b.insertAdjacentHTML('beforeend', artImg(`circ:${tw}x${th}`, T, () => circleArt(tw, th), `mbk-circ${instant ? '' : ' mbk-draw'}`, `left:${-2 * T}px;top:${-1 * T}px`));
  }

  // right page: the chapters on ledger rules, each with an index tab
  buildChapters() {
    const L = this.L, T = L.T, R = L.R, list = this.chapters();
    const el = document.createElement('div');
    el.className = 'mbk-pc mbk-toc';
    const rowH = 2 * R * T, tabH = 2 * R - 5, tabW = L.B + L.TAB + 4;
    let h = `<div class="mbk-toch" style="top:${(L.r0 - R) * T}px;height:${R * T}px"><span>Contents</span></div>`;
    list.forEach((c, i) => {
      const top = (L.r0 + 2 * i * R) * T; // the row spans rules r0 + 2iR .. r0 + 2(i+1)R, the words sit on the lower one
      h += `<button type="button" class="mbk-ch ${c.cls || ''}" id="${c.id}" data-act="${c.act}" style="top:${top}px;height:${rowH}px;--i:${i}">
        <span class="mbk-num">${ROMAN[i]}.</span><span class="mbk-cht">${esc(c.t)}</span><span class="mbk-dots"></span>${artImg(`dood:${c.d}`, T, doodleArt(c.d), 'mbk-dood')}
        ${L.single ? '' : `<span class="mbk-tab" style="right:${-(tabW - 4) * T}px;top:${3 * T}px">${artImg(`tab:${c.tab}:${tabW}x${tabH}`, T, () => tabArt(c.tab, tabW, tabH, 4))}</span>`}
      </button>`;
    });
    const noteTop = (L.r0 + 2 * list.length * R + R) * T;
    if (!L.single && noteTop + R * T < L.ph * T) h += `<p class="mbk-note" style="top:${noteTop - R * T}px;height:${R * T}px"><span>Property of R. Fox. Paws off!</span></p>`;
    el.innerHTML = h;
    if (L.single) el.style.height = `${(L.r0 + 2 * list.length * R + 4) * T}px`;
    // leader dots tile at device px
    const dots = artURL('dots', L.s, dotsArt);
    el.style.setProperty('--dots', `url(${dots.url})`);
    return el;
  }

  // ------------------------------------------------------------ "How to play" pages
  buildHelp() {
    const ico = (n) => spriteImg(n, 1, 'mbk-hi');
    const paras = [
      `${ico('fox')} You are <b>Reynard</b>, a greedy fox who runs a fish-pond buffet in the Canadian wilds.`,
      `${ico('food')} <b>Tap the water</b> to toss food. Fed adult fish (a ♂ and a ♀) fall in love, lay eggs and the fry grow up.`,
      `${ico('egg')} Buy <b>eggs</b> on e-Buy. They hatch in your egg tray with random <b>genes</b>: size, colour morphs, traits and stars.`,
      `${ico('alarm')} At <b>5 PM</b> the bears get off work and cannonball into your pond. They eat fish and side dishes, pay, and leave a review.`,
      `${ico('tag')} <b>Tag</b> precious fish "DO NOT EAT", <b>carry</b> fish into safe nurseries, and <b>pet</b> fish for better genes.`,
      `${ico('bolt')} Hungry bears <b>rampage</b>: they smash your stuff and post 0-star reviews. Below a <b>1.0</b> rating you're closed.`,
      `${ico('dam')} Hire <b>beavers</b> (Lab) to build <b>dams</b>, <b>fences</b>, gates and <b>platforms</b>. Fish hide under platforms and lily pads.`,
      `${ico('beauty')} <b>Decor</b> adds beauty: more customers and bigger bills.`,
      `${ico('info')} <b>Controls:</b> drag to pan, scroll/pinch to zoom, <b>Q/E</b> rotate, <b>WASD</b> move, <b>1-9</b> tools, <b>Space</b> pause, <b>B</b> open early, <b>Esc</b> cancel.`,
    ];
    const L = this.L, T = L.T;
    const hl = document.createElement('div');
    hl.className = 'mbk-pc mbk-help mbk-helpL';
    hl.innerHTML = `<h2 class="mbk-h">How to play</h2>${artImg('swash:64', T, () => swashArt(64), 'mbk-swash')}<div class="mbk-hp">${paras.map((p) => `<p>${p}</p>`).join('')}</div>`;
    const hr = document.createElement('div');
    hr.className = 'mbk-pc mbk-help mbk-helpR';
    // first text line sits on the first ledger rule under the header band
    hr.style.setProperty('--hTop', `${(L.r0 - L.R) * T}px`);
    hr.innerHTML = '<div class="mbk-hp"></div><button type="button" class="mbk-back" data-act="back">◀ Back to the contents</button>';
    return [hl, hr];
  }
  // move paragraphs that do not fit on the left page over to the right page (hl must be laid out)
  flowHelp(hl, hr) {
    const src = hl.querySelector('.mbk-hp'), dst = hr.querySelector('.mbk-hp');
    let guard = 20;
    while (guard-- > 0 && hl.scrollHeight > hl.clientHeight + 1 && src.children.length > 1) dst.prepend(src.lastElementChild);
  }

  // ------------------------------------------------------------ events
  bindStage() {
    const st = this.stage;
    this.dim.addEventListener('click', () => { if (!this.busy) this.close(); });
    st.addEventListener('click', (e) => {
      if (e.target === st) { if (!this.busy) this.close(); return; }
      const b = e.target.closest('[data-act]');
      if (!b || !st.contains(b)) return;
      e.stopPropagation();
      if (this.busy) return;
      this.act(b.dataset.act, b);
    });
    // keys: Esc closes; the game does not see keys while the book is open
    this.onKey = (e) => {
      if (!this.isOpen) return;
      if (document.querySelector('.pp-ov:not(.closing)')) return; // a paper (confirm) is on top
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!this.busy) this.close(); else this.pending = 'close'; return; }
      if (st.contains(e.target)) return; // focused controls keep their keys (sliders, buttons)
      if (e.key === ' ' || /^[0-9a-z+\-=_]$/i.test(e.key) || e.key.startsWith('Page')) e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', this.onKey, true);
    st.addEventListener('keydown', (e) => { if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation(); });
    st.addEventListener('wheel', (e) => { if (!e.target.closest('.mbk-help, .mbk-single .mbk-page')) e.preventDefault(); }, { passive: false });
    this.onResize = () => { clearTimeout(this.rsT); this.rsT = setTimeout(() => this.relayout(), 160); };
    addEventListener('resize', this.onResize);
  }
  unbind() {
    if (this.onKey) window.removeEventListener('keydown', this.onKey, true);
    if (this.onResize) removeEventListener('resize', this.onResize);
    clearTimeout(this.rsT);
    this.onKey = this.onResize = null;
  }

  act(a, b) {
    const ui = this.ui, game = this.game;
    if (a === 'resume') { ui.click(); this.close(); return; }
    if (a === 'help') { ui.click(); this.turn('help'); return; }
    if (a === 'back') { ui.click(); this.turn('menu'); return; }
    if (a === 'settings') {
      ui.click();
      this.close(true);
      this.quickNext = true;
      import('./SettingsScreen.js').then((m) => m.openSettings({ inGame: true, sfx: (n, o) => game.audio.play(n, { volume: 0.4, ...(o || {}) }), onClose: () => ui.showMenu() }));
      return;
    }
    if (a === 'save') {
      game.save();
      ui.toast('Saved!', 'good');
      this.sfx('stamp', { volume: 0.5 });
      b.querySelector('.mbk-stamp')?.remove();
      b.insertAdjacentHTML('beforeend', '<span class="mbk-stamp">Saved!</span>');
      return;
    }
    if (a === 'retire') { this.close(true); game.retire(); return; }
    if (a === 'reset') {
      ui.confirmBox('Start a brand new pond? Your current progress will be lost.', () => {
        this.close(true);
        game.newGame();
        ui.startTutorialIfNew();
      }, { yes: 'Start over' });
    }
  }

  // ------------------------------------------------------------ open / close
  open(o = {}) {
    if (this.isOpen) return;
    const quick = !!(o.quick || this.quickNext);
    this.quickNext = false;
    this.isOpen = true;
    this.view = 'menu';
    const st = this.game.state;
    this.wasPaused = !!st?.paused;
    if (st) st.paused = true;
    const gen = ++this.gen;
    try { this.build(); } catch (e) { console.warn('menu book', e); this.isOpen = false; if (st) st.paused = this.wasPaused; this.stage?.remove(); return false; }
    this.btn?.classList.add('mbk-out');
    upgradeSliders(this.stage);
    if (o.help) this.view = 'help';
    if (REDUCED() || quick) this.settleOpen(gen, quick);
    else this.animateOpen(gen);
    return true;
  }

  showHelp() {
    if (!this.isOpen) { this.open({ help: true }); return; }
    if (this.view !== 'help') this.turn('help');
  }

  // where the HUD book's cover sits, as a transform of the big book
  btnPose() {
    const L = this.L, b = this.btn?.querySelector('.mbk-hc');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (!r.width) return null;
    const Th = r.width / HW; // HUD texel size
    const cw = (L.single ? L.pw + 2 * L.B : L.pw + L.B) * L.T, ch = L.H * L.T;
    const kx = (HCW * Th) / cw, ky = (HCH * Th) / ch;
    return { kx, ky, tx: r.left - L.x - L.spine * L.T * kx, ty: r.top - L.y };
  }
  setBookPose(P, t, arc = 0, rot = 0) {
    if (!P) { this.book.style.transform = ''; return; }
    const kx = lerp(P.kx, 1, t), ky = lerp(P.ky, 1, t), tx = lerp(P.tx, 0, t), ty = lerp(P.ty, 0, t) - Math.sin(t * Math.PI) * arc;
    this.book.style.transform = t >= 1 ? '' : `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${kx.toFixed(4)}, ${ky.toFixed(4)}) rotate(${(rot * (1 - t)).toFixed(2)}deg)`;
  }
  setCover(a) {
    const L = this.L, P = Math.round(L.W * L.T * 1.6);
    const back = a < -90;
    this.cover.style.transform = a === 0 ? '' : `perspective(${P}px) rotateY(${a.toFixed(2)}deg)`;
    this.cf.style.visibility = back ? 'hidden' : 'visible';
    this.cb.style.visibility = back ? 'visible' : 'hidden';
    const sh = Math.sin((Math.abs(a) * Math.PI) / 180) * 0.45;
    for (const s of this.cover.querySelectorAll('.mbk-shade')) s.style.opacity = sh.toFixed(3);
    if (L.single) this.cover.style.opacity = a < -100 ? String(clamp(1 - (-a - 100) / 50, 0, 1)) : '';
  }
  // the cover's inside carries the left page's contents while it swings
  leftToCover(on) {
    if (this.L.single || !this.cbPage) return;
    const node = on ? this.pageL.firstElementChild : this.cbPage.firstElementChild;
    if (on) { if (node) this.cbPage.appendChild(node); this.halfL.style.visibility = 'hidden'; }
    else { if (node) this.pageL.appendChild(node); this.halfL.style.visibility = ''; }
  }

  async animateOpen(gen) {
    this.busy = true;
    const L = this.L;
    if (!L.single) { this.cbPage.appendChild(this.menuL); this.halfL.style.visibility = 'hidden'; }
    this.setCover(0);
    const P = this.btnPose();
    this.setBookPose(P, 0);
    this.stage.classList.add('mbk-on', 'mbk-flying');
    this.sfx('whoosh', { volume: 0.3, pitch: 1.25 });
    const fade = tween(300, (e) => { this.dim.style.opacity = String(e); });
    await tween(P ? 440 : 0, (e) => this.setBookPose(P, e, 46 * L.T / 2, -10), eOut3);
    if (gen !== this.gen) return;
    this.stage.classList.remove('mbk-flying');
    this.book.classList.add('mbk-thud');
    this.sfx('book_open', { volume: 0.6 });
    await fade;
    let rustled = false;
    await tween(620, (e) => {
      this.setCover(-180 * e);
      if (!rustled && e > 0.42) { rustled = true; this.sfx('page', { volume: 0.55 }); }
    }, eIO2);
    if (gen !== this.gen) return;
    this.settleOpen(gen, false);
  }
  settleOpen(gen, quick) {
    const L = this.L;
    this.stage.classList.add('mbk-on');
    this.stage.classList.remove('mbk-flying');
    this.dim.style.opacity = '1';
    this.book.style.transform = '';
    this.cover.style.display = 'none';
    if (!L.single) { this.pageL.appendChild(this.menuL); this.halfL.style.visibility = ''; }
    this.menuL._pick?.();
    if (quick) { this.stage.classList.add('mbk-quick'); this.sfx('page', { volume: 0.4 }); }
    this.stage.classList.add('mbk-open');
    this.busy = false;
    const p = this.pending;
    this.pending = null;
    if (p === 'close') this.close();
    else if (p === 'help' || this.view === 'help') { this.view = 'menu'; this.turn('help'); }
  }

  async close(instant = false) {
    if (!this.isOpen) return;
    if (this.busy && !instant) { this.pending = 'close'; return; }
    const gen = ++this.gen;
    if (instant || REDUCED() || !this.stage) { this.finishClose(); return; }
    this.busy = true;
    const L = this.L;
    this.stage.classList.remove('mbk-open', 'mbk-quick');
    this.sfx('page', { volume: 0.4, pitch: 0.9 });
    // the left pages (and whatever is on them) swing over with the cover
    this.cover.style.display = '';
    this.leftToCover(true);
    this.setCover(-180);
    await wait(90);
    if (gen !== this.gen) return;
    await tween(460, (e) => this.setCover(-180 * (1 - e)), eIO2);
    if (gen !== this.gen) return;
    this.sfx('book_close', { volume: 0.6 });
    const P = this.btnPose();
    this.stage.classList.add('mbk-flying');
    await tween(P ? 360 : 200, (e) => {
      this.setBookPose(P, 1 - e, 30 * L.T / 2, 8);
      this.dim.style.opacity = String(1 - e);
      if (!P) this.book.style.opacity = String(1 - e);
    }, eIn2);
    if (gen !== this.gen) return;
    this.finishClose(true);
  }
  finishClose(land = false) {
    this.gen++;
    this.isOpen = false;
    this.busy = false;
    this.pending = null;
    this.unbind();
    this.stage?.remove();
    this.stage = this.book = null;
    const st = this.game.state;
    if (st) st.paused = !!this.wasPaused;
    const b = this.btn;
    if (b) {
      b.classList.remove('mbk-out', 'mbk-land');
      if (land) { void b.offsetWidth; b.classList.add('mbk-land'); setTimeout(() => b.classList.remove('mbk-land'), 500); }
    }
  }

  // rebuild at the new size (rotation, window resize), same spread
  relayout() {
    if (!this.isOpen || this.busy || !this.stage) return;
    const view = this.view;
    this.unbind();
    this.stage.remove();
    this.build();
    this.view = 'menu';
    upgradeSliders(this.stage);
    this.settleOpen(this.gen, false);
    this.stage.classList.add('mbk-quick');
    if (view === 'help') this.showSpread('help');
  }

  // ------------------------------------------------------------ page turning
  helpNodes() {
    if (!this.helpL) [this.helpL, this.helpR] = this.buildHelp();
    return [this.helpL, this.helpR];
  }
  // no animation (relayout)
  showSpread(view) {
    const L = this.L;
    if (view === 'help') {
      const [hl, hr] = this.helpNodes();
      if (L.single) { this.pageR.replaceChildren(hl, hr); hl.classList.add('mbk-one'); }
      else { this.pageL.replaceChildren(hl); this.pageR.replaceChildren(hr); this.flowHelp(hl, hr); }
    } else if (L.single) this.pageR.replaceChildren(this.menuL, this.menuR);
    else { this.pageL.replaceChildren(this.menuL); this.pageR.replaceChildren(this.menuR); }
    this.view = view;
  }
  makeLeaf() {
    const L = this.L, T = L.T, s = L.s;
    const leaf = document.createElement('div');
    leaf.className = 'mbk-leaf';
    const px = L.single ? L.B : 0;
    Object.assign(leaf.style, { left: `${(L.spine + px) * T}px`, top: `${L.B * T}px`, width: `${L.pw * T}px`, height: `${L.ph * T}px` });
    const front = document.createElement('div'), back = document.createElement('div');
    front.className = 'mbk-face mbk-lf'; back.className = 'mbk-face mbk-lb';
    front.appendChild(canvasEl(this.texR, T, px * s, L.B * s, L.pw * s, L.ph * s));
    if (L.single) back.appendChild(canvasEl(this.texR, T, px * s, L.B * s, L.pw * s, L.ph * s));
    else back.appendChild(canvasEl(this.texL, T, L.B * s, L.B * s, L.pw * s, L.ph * s));
    const fs = document.createElement('div'), bs = document.createElement('div');
    fs.className = bs.className = 'mbk-slot';
    front.appendChild(fs); back.appendChild(bs);
    front.insertAdjacentHTML('beforeend', '<i class="mbk-shade"></i>');
    back.insertAdjacentHTML('beforeend', '<i class="mbk-shade"></i>');
    leaf.append(front, back);
    this.book.appendChild(leaf);
    return { leaf, front, back, fs, bs };
  }
  setLeaf(F, a) {
    const L = this.L, P = Math.round(L.W * L.T * 1.6);
    F.leaf.style.transform = `perspective(${P}px) rotateY(${a.toFixed(2)}deg)`;
    const back = a < -90;
    F.front.style.visibility = back ? 'hidden' : 'visible';
    F.back.style.visibility = back ? 'visible' : 'hidden';
    const sh = Math.sin((Math.abs(a) * Math.PI) / 180) * 0.3;
    for (const s of F.leaf.querySelectorAll('.mbk-shade')) s.style.opacity = sh.toFixed(3);
    if (L.single) F.leaf.style.opacity = a < -95 ? String(clamp(1 - (-a - 95) / 40, 0, 1)) : '';
  }
  async turn(view) {
    if (!this.isOpen || this.busy || view === this.view || !this.stage) return;
    const gen = this.gen, L = this.L;
    this.busy = true;
    const fwd = view === 'help';
    let newL, newR;
    if (fwd) [newL, newR] = this.helpNodes();
    else { newL = this.menuL; newR = this.menuR; }
    const F = this.makeLeaf();
    this.sfx('page_flip', { volume: 0.55 });
    this.stage.classList.add('mbk-turning');
    if (L.single) {
      // one page: the old page lifts away, the new one is underneath
      F.fs.append(...this.pageR.children);
      if (fwd) { newL.classList.add('mbk-one'); this.pageR.replaceChildren(newL, newR); }
      else this.pageR.replaceChildren(newL, newR);
      this.setLeaf(F, 0);
      await tween(560, (e) => this.setLeaf(F, -180 * e), eIO2);
    } else if (fwd) {
      F.fs.appendChild(this.pageR.firstElementChild);
      F.bs.appendChild(newL);
      this.flowHelp(newL, newR);
      this.pageR.replaceChildren(newR);
      this.setLeaf(F, 0);
      let r = false;
      await tween(600, (e) => { this.setLeaf(F, -180 * e); if (!r && e > 0.5) { r = true; this.sfx('page', { volume: 0.4 }); } }, eIO2);
      if (gen === this.gen) this.pageL.replaceChildren(newL);
    } else {
      F.bs.appendChild(this.pageL.firstElementChild);
      F.fs.appendChild(newR);
      this.pageL.replaceChildren(newL);
      this.setLeaf(F, -180);
      let r = false;
      await tween(600, (e) => { this.setLeaf(F, -180 * (1 - e)); if (!r && e > 0.5) { r = true; this.sfx('page', { volume: 0.4 }); } }, eIO2);
      if (gen === this.gen) this.pageR.replaceChildren(newR);
    }
    F.leaf.remove();
    if (gen !== this.gen) return;
    this.stage.classList.remove('mbk-turning');
    this.view = view;
    this.busy = false;
    if (this.pending === 'close') { this.pending = null; this.close(); }
  }
}
