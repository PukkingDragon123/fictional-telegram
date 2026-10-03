// Chip the woodpecker's WORKSHOP: a full-screen pixel-art place, not a menu.
// You stand in front of his bench in the tree house: plank wall, a pegboard of
// tools, a corkboard of blueprints, jars of forest finds on a shelf, a pile of
// broken antiques on the floor, a warm lamp with dust in its beam, and Chip
// himself behind the bench.
//
//   const ws = openWorkshop(root, {
//     wood, materials, recipes, jobs, slots: 3, chat,
//     art, icon, sfx, onCraft, onCollect, onClose,
//     chipEl?, onTalk?, now?,
//   });
//   ws.refresh({ wood, materials, recipes, jobs })   // any subset; cheap, call every second if you like
//   ws.say(text)            // Chip says something
//   ws.openPlan(recipeId)   // unroll a plan on the bench
//   ws.close()              // remove at once (does NOT call onClose)
//   ws.el / ws.chipEl       // overlay element / the box Chip stands in (mount a 3D rig canvas there)
//
// recipes: [{ id, name, icon, desc, cost: { wood, <materialId>: n, <ruinId>: 1 }, time (s), locked?: string,
//             kind: 'craft' | 'repair', ruin?: 'ruin_chair', ruinName?: 'Broken Armchair' }]
// jobs:    [{ id, recipeId, name, start, end (ms epoch), done }]
// materials: { id: { name, icon, have } }
// art(recipeId) -> HTMLCanvasElement | <img> | null   item picture for ids without built-in art (the 15 v14
//                    woodwork/antique ids + 5 ruins have built-in pixel art; artFirst: true makes art() win)
// icon(name, scale) -> html                      for material icons (built-in fallbacks when '' )
// sfx(name, opts)   names used (all exist in src/audio): saw hammer nail (work ambience), tock (wood knock),
//                   ding, paper, stamp, gate (lever), pop_in, whoosh, crate_drop, click, hover, error,
//                   chalk_tap, bird_chirp (Chip starts a line). opts: { volume, pitch }
// onCraft(recipeId) -> { ok, msg }   onCollect(jobId) -> { ok, msg }   (refresh() may be called inside them)
// onTalk(text)       optional: Chip started a line (drive a rig / babble voice)
// chipEl             optional element mounted in Chip's spot instead of the drawn portrait; the spot is
//                    84 x 110 art px (168 x 220 CSS px at 2x), bottom edge on the bench. A canvas rendered at
//                    84 x 110 with image-rendering: pixelated matches the scene's pixel size exactly.
// now()              optional clock (ms epoch), default Date.now
//
// Also exported: workshopArt(id) -> 48x48 pixel-art canvas for every v14 woodwork / antique / ruin id
// (WORKSHOP_ART_IDS), handy as build-tab icons; fmtTime(seconds) -> '25 min' / '1h 05m'.
//
// `root` should be a positioned element with a size; the workshop fills it.
// Everything is drawn at a low "art pixel" resolution and scaled by an integer
// (2x at 800x600 .. 1280x720), so pixels, fonts and textures stay crisp.
import './fonts.css';
import './workshop.css';
import { paperTile, rng } from './paper.js';
import { hasSprite, spriteCanvas } from './sprites.js';

// ===========================================================================
// small utils
// ===========================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function hexRGB(h) {
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [42, 26, 20];
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// "1h 05m" / "12m" / "45s" for plans; "1h05" / "12:34" / "0:09" for the chalk slate
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  if (m) return s && m < 10 ? `${m}m ${s}s` : `${m} min`;
  return `${s}s`;
}
function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ===========================================================================
// pixel kit: integer-pixel painting on a canvas
// ===========================================================================
function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}
class Pen {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.c = newCanvas(w, h);
    this.g = this.c.getContext('2d', { willReadFrequently: true });
    this.g.imageSmoothingEnabled = false;
  }
  r(x, y, w, h, c) {
    if (c == null || w <= 0 || h <= 0) return this;
    this.g.fillStyle = c;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return this;
  }
  p(x, y, c) { return this.r(x, y, 1, 1, c); }
  hl(x0, x1, y, c) { return this.r(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c); }
  vl(x, y0, y1, c) { return this.r(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c); }
  // bresenham line, t = square brush size
  ln(x0, y0, x1, y1, c, t = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, o = Math.floor((t - 1) / 2);
    for (;;) {
      this.r(x0 - o, y0 - o, t, t, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  // filled ellipse (pixel centres)
  el(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
      if (x1 > x0) this.r(x0, y, x1 - x0, 1, c);
    }
    return this;
  }
  // 1px ellipse ring
  ring(cx, cy, rx, ry, c) {
    const inside = (x, y, a, b) => { const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b; return dx * dx + dy * dy <= 1; };
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        if (inside(x, y, rx, ry) && !(inside(x - 1, y, rx, ry) && inside(x + 1, y, rx, ry) && inside(x, y - 1, rx, ry) && inside(x, y + 1, rx, ry))) this.p(x, y, c);
      }
    }
    return this;
  }
  // scanline polygon fill
  poly(pts, c) {
    let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.round(xs[i]), b = Math.round(xs[i + 1]);
        if (b > a) this.r(a, y, b - a, 1, c);
      }
    }
    return this;
  }
  // shaded box: light from the top-left (R = 7-tone ramp, dark -> light)
  box(x, y, w, h, R, o = {}) {
    const b = o.base ?? 3;
    this.r(x, y, w, h, R[b]);
    if (h > 1) { this.r(x, y, w, 1, R[Math.min(R.length - 1, b + 2)]); this.r(x + w - 1, y + 1, 1, h - 1, R[Math.max(0, b - 1)]); }
    if (w > 2) { this.r(x, y + 1, 1, h - 1, R[Math.min(R.length - 1, b + 1)]); this.r(x + 1, y + h - 1, w - 2, 1, R[Math.max(0, b - 1)]); }
    return this;
  }
  // wood grain streaks inside a rect
  grain(x, y, w, h, c, seed = 1, dens = 0.12, vertical = false) {
    const R = rng(seed);
    const n = Math.round(w * h * dens / 4);
    for (let i = 0; i < n; i++) {
      const gx = x + Math.floor(R() * w), gy = y + Math.floor(R() * h), len = 2 + Math.floor(R() * 4);
      if (vertical) this.r(gx, gy, 1, Math.min(len, y + h - gy), c); else this.r(gx, gy, Math.min(len, x + w - gx), 1, c);
    }
    return this;
  }
  rows(x, y, rows, pal) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (c) this.p(x + i, y + j, c); } });
    return this;
  }
  img(src, x, y) { if (src) this.g.drawImage(src, Math.round(x), Math.round(y)); return this; }
  // 1px outline darkened from the local colour (needs a transparent margin)
  outline(t = 0.7, ink = INK) {
    const { w, h } = this, im = this.g.getImageData(0, 0, w, h), d = im.data, s = new Uint8ClampedArray(d);
    const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : s[(y * w + x) * 4 + 3]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] > 127) continue;
      let n = 0, r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        if (A(x + dx, y + dy) > 127) { const j = ((y + dy) * w + x + dx) * 4; r += s[j]; g += s[j + 1]; b += s[j + 2]; n++; }
      }
      if (!n) continue;
      const c = mixRGB([r / n, g / n, b / n], ink, t);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    this.g.putImageData(im, 0, 0);
    return this;
  }
  // darken every opaque pixel by a dither mask (for cast shadows inside a shape)
  shade(x, y, w, h, c, amount = 0.5, alpha = 0.5) {
    const im = this.g.getImageData(x, y, w, h), d = im.data, col = hexRGB(c);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (d[k + 3] < 128 || bayer(x + i, y + j) > amount) continue;
      const m = mixRGB([d[k], d[k + 1], d[k + 2]], col, alpha);
      d[k] = m[0]; d[k + 1] = m[1]; d[k + 2] = m[2];
    }
    this.g.putImageData(im, x, y);
    return this;
  }
}

// crop a canvas to its opaque bounding box
function cropCanvas(src) {
  const w = src.width, h = src.height;
  let d;
  try { d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data; } catch { return src; }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return src;
  const c = newCanvas(x1 - x0 + 1, y1 - y0 + 1);
  c.getContext('2d', { willReadFrequently: true }).drawImage(src, -x0, -y0);
  return c;
}
// nearest-neighbour scale so the picture fits (mw x mh); small art is scaled UP by an integer
function fitCanvas(src, mw, mh, allowUp = true) {
  const c0 = cropCanvas(src);
  let s = Math.min(mw / c0.width, mh / c0.height);
  if (s >= 1) s = allowUp ? Math.max(1, Math.floor(s)) : 1;
  if (s === 1) return c0;
  const w = Math.max(1, Math.round(c0.width * s)), h = Math.max(1, Math.round(c0.height * s));
  const c = newCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = s < 1;
  if (s < 1) g.imageSmoothingQuality = 'high';
  g.drawImage(c0, 0, 0, w, h);
  if (s < 1) { // keep pixel-art alpha: fully opaque or fully transparent
    const im = g.getImageData(0, 0, w, h), d = im.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
    g.putImageData(im, 0, 0);
  }
  return c;
}
// nearest-neighbour rotation around (px, py) into a canvas of the same size
function rotNN(src, ang, px, py) {
  const w = src.width, h = src.height, s = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = new Pen(w, h), im = out.g.createImageData(w, h), d = im.data;
  const ca = Math.cos(-ang), sa = Math.sin(-ang);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - px, dy = y + 0.5 - py;
    const sx = Math.floor(px + dx * ca - dy * sa), sy = Math.floor(py + dx * sa + dy * ca);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const i = (sy * w + sx) * 4, o = (y * w + x) * 4;
    d[o] = s[i]; d[o + 1] = s[i + 1]; d[o + 2] = s[i + 2]; d[o + 3] = s[i + 3];
  }
  out.g.putImageData(im, 0, 0);
  return out.c;
}
const urlCache = new WeakMap();
function canvasURL(c) {
  let u = urlCache.get(c);
  if (!u) { try { u = c.toDataURL(); } catch { u = ''; } urlCache.set(c, u); }
  return u;
}
function cloneCanvas(src, cls = '') {
  const c = newCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  if (cls) c.className = cls;
  return c;
}

// ===========================================================================
// palette (7-tone ramps, dark -> light, hue shifted: cool shadows, warm lights)
// ===========================================================================
const RAMP = {
  pine: ['#4b2a14', '#6f411f', '#93592b', '#b5743a', '#d0914c', '#e6b067', '#f4cf8e'],
  oak: ['#3b2313', '#57341b', '#744625', '#8f5a30', '#aa6f3d', '#c3884f', '#d9a467'],
  walnut: ['#1f120b', '#311d12', '#45291a', '#5a3622', '#70452c', '#875838', '#a06d48'],
  bark: ['#21150e', '#352318', '#4b3324', '#614331', '#78553f', '#8f6a51', '#a5806a'],
  iron: ['#1d1f27', '#30333e', '#474b5b', '#646a7e', '#878ea3', '#b0b6c8', '#dde1ec'],
  brass: ['#4a2d0b', '#764c14', '#a2701f', '#c99434', '#e5b84f', '#f6d77c', '#fff2b8'],
  red: ['#3a0c12', '#5e141b', '#851f25', '#ab2e2f', '#cc463c', '#e66a52', '#f79b78'],
  green: ['#152c18', '#204420', '#2f6029', '#437f33', '#5f9e40', '#86bf55', '#b6de7a'],
  cream: ['#7c6a4e', '#a08b68', '#c2ad86', '#dccaa2', '#eee0bf', '#f9f1dc', '#fffcf2'],
  pink: ['#5a1834', '#8a2850', '#b83c6c', '#de5a8a', '#f282aa', '#fcb0c8', '#ffe0ea'],
  gold: ['#5a3a08', '#8a5e10', '#bc8a18', '#e2b42a', '#f6d24c', '#ffe888', '#fff8c8'],
  blue: ['#0f1e44', '#17306a', '#21448e', '#2e5cb0', '#4a7ccc', '#78a4e2', '#b4d0f4'],
  slate: ['#121619', '#192024', '#20292e', '#283338', '#313e44', '#3c4b52', '#4a5b63'],
  coal: ['#101015', '#18181f', '#21212a', '#2c2c37', '#393945', '#4a4a58', '#5e5e6e'],
  leather: ['#2e170c', '#472413', '#61331b', '#7c4424', '#96572f', '#ae6c3d', '#c4854f'],
  purple: ['#24123a', '#381c58', '#4f2a78', '#683c96', '#8556b4', '#a67ccc', '#cbaae4'],
  ivory: ['#5c5444', '#857b64', '#a89e84', '#c6bca2', '#ddd5bd', '#eee8d6', '#faf7ee'],
};

// ===========================================================================
// built-in item art (48x48, standing on y=45, centred on x=24)
// ===========================================================================
const ART = {};
// ---- woodwork
ART.wd_stool = (p) => {
  const B = RAMP.bark, P = RAMP.pine;
  p.ln(24, 31, 24, 41, B[1], 2);
  p.ln(16, 30, 12, 44, B[3], 3); p.ln(15, 31, 12, 41, B[5], 1);
  p.ln(32, 30, 36, 44, B[2], 3);
  p.ln(14, 37, 34, 37, B[2], 1); // a rung
  p.el(24, 28, 13, 4.5, B[2]);
  p.r(11, 22, 27, 6, B[3]);
  for (let x = 12; x < 37; x += 3) p.vl(x, 23 + (x % 2), 28, B[2]);
  p.vl(12, 22, 27, B[4]); p.vl(13, 23, 26, B[5]);
  p.el(24, 22, 13, 4.5, P[4]);
  p.ring(24, 22, 10, 3.3, P[3]);
  p.ring(24, 22, 6, 2, P[3]);
  p.r(23, 22, 2, 1, P[2]);
  p.hl(15, 26, 19, P[6]); p.hl(13, 16, 20, P[5]);
  p.ln(28, 21, 33, 24, P[2]); // a crack in the slice
};
ART.wd_table = (p) => {
  const P = RAMP.pine;
  p.box(13, 26, 3, 15, P, { base: 1 }); p.box(32, 26, 3, 15, P, { base: 1 });
  p.r(12, 36, 24, 2, P[1]);
  p.box(8, 26, 4, 19, P); p.box(36, 26, 4, 19, P);
  p.r(9, 26, 30, 3, P[2]);
  p.box(5, 19, 38, 4, P, { base: 4 });
  p.hl(6, 41, 21, P[4]);
  p.hl(6, 40, 20, P[6]);
  p.box(5, 23, 38, 3, P, { base: 3 });
  p.p(7, 24, RAMP.iron[4]); p.p(40, 24, RAMP.iron[4]);
  p.grain(10, 24, 30, 2, P[2], 3, 0.3);
};
ART.wd_bench = (p) => {
  const O = RAMP.oak;
  p.box(7, 13, 4, 32, O); p.box(37, 13, 4, 32, O);
  p.box(5, 14, 38, 4, O, { base: 4 });
  p.box(6, 21, 36, 4, O, { base: 3 });
  // a little paw carved in the backrest
  p.r(22, 15, 4, 2, O[1]); p.p(21, 14, O[1]); p.p(24, 14, O[1]); p.p(27, 15, O[1]);
  p.box(9, 32, 3, 13, O, { base: 1 }); p.box(36, 32, 3, 13, O, { base: 1 });
  p.box(4, 29, 40, 3, O, { base: 5 });
  p.box(4, 32, 40, 2, O, { base: 2 });
  p.r(10, 40, 28, 2, O[2]);
  p.grain(6, 22, 34, 2, O[2], 7, 0.3);
};
ART.wd_rocker = (p) => {
  const P = RAMP.oak;
  // runners
  for (let x = 6; x <= 42; x++) { const y = Math.round(42 - Math.pow((x - 24) / 18, 2) * 4); p.r(x, y, 1, 2, x < 24 ? P[4] : P[3]); }
  p.ln(14, 33, 13, 41, P[3], 2); p.ln(32, 33, 34, 41, P[2], 2);
  // back posts + spindles
  p.ln(14, 31, 11, 8, P[4], 3); p.ln(33, 31, 34, 8, P[2], 3);
  p.box(11, 6, 24, 4, P, { base: 4 });
  for (let i = 0; i < 4; i++) p.vl(16 + i * 4, 10, 27, i < 2 ? P[4] : P[3]);
  p.box(12, 26, 23, 2, P, { base: 3 });
  // seat + arms
  p.box(12, 29, 24, 4, P, { base: 4 });
  p.box(9, 21, 6, 2, P, { base: 4 }); p.box(32, 21, 6, 2, P, { base: 3 });
  p.vl(10, 23, 29, P[3]); p.vl(36, 23, 29, P[2]);
  // knitted cushion
  p.r(15, 27, 18, 2, RAMP.red[4]); p.hl(15, 32, 27, RAMP.red[5]);
};
ART.wd_shelf = (p) => {
  const P = RAMP.pine;
  p.r(12, 7, 24, 38, P[1]);
  p.grain(13, 8, 22, 36, P[0], 11, 0.25, true);
  p.box(9, 5, 4, 41, P); p.box(35, 5, 4, 41, P, { base: 2 });
  p.box(8, 4, 32, 3, P, { base: 4 });
  for (const y of [17, 29, 41]) p.box(12, y, 24, 2, P, { base: 4 });
  // stuff on the shelves
  p.box(14, 11, 3, 6, RAMP.red, { base: 3 }); p.box(17, 12, 3, 5, RAMP.blue, { base: 4 }); p.box(20, 10, 3, 7, RAMP.green, { base: 4 });
  p.el(30, 14.5, 3, 2.5, RAMP.gold[4]); p.r(28, 11, 4, 2, RAMP.gold[5]);
  p.el(18, 26, 4, 3, RAMP.cream[5]); p.r(16, 22, 4, 2, RAMP.iron[4]); p.ring(18, 26, 4, 3, RAMP.cream[3]);
  p.box(26, 21, 7, 8, RAMP.pine, { base: 5 });
  p.r(15, 37, 6, 4, RAMP.green[4]); p.r(16, 34, 2, 3, RAMP.green[5]); p.r(19, 33, 2, 4, RAMP.green[3]);
  p.box(26, 35, 6, 6, RAMP.purple, { base: 4 });
};
ART.wd_barrel = (p) => {
  const O = RAMP.oak, I = RAMP.iron;
  for (let y = 12; y <= 44; y++) {
    const t = (y - 28) / 16, half = Math.round(10 + 3 * (1 - t * t));
    for (let x = 24 - half; x < 24 + half; x++) {
      const u = (x - (24 - half)) / (2 * half);
      const k = u < 0.18 ? 4 : u < 0.45 ? 5 : u < 0.72 ? 3 : u < 0.88 ? 2 : 1;
      p.p(x, y, O[k]);
    }
  }
  for (let i = -8; i <= 8; i += 4) for (let y = 13; y <= 44; y++) { const t = (y - 28) / 16, k = Math.round(i * (1 + 0.28 * (1 - t * t))); p.p(24 + k, y, O[1]); }
  for (const y of [15, 27, 39]) {
    const t = (y - 28) / 16, half = Math.round(10 + 3 * (1 - t * t));
    p.r(24 - half, y, half * 2, 2, I[3]); p.r(24 - half, y, half, 1, I[5]); p.p(24 - half + 3, y + 1, I[6]);
  }
  p.el(24, 12, 10, 3, O[2]); p.ring(24, 12, 10, 3, O[4]); p.hl(18, 28, 11, O[3]);
  p.p(22, 21, O[6]); p.p(22, 22, O[6]); p.p(21, 33, O[6]);
};
ART.wd_crate = (p) => {
  const P = RAMP.pine;
  const crate = (x, y, w, h, s) => {
    p.box(x, y, w, h, P, { base: 3 });
    p.r(x + 2, y + 2, w - 4, h - 4, P[1]);
    for (let j = y + 3; j < y + h - 2; j += 4) p.box(x + 2, j, w - 4, 3, P, { base: 4 });
    p.ln(x + 2, y + h - 3, x + w - 3, y + 2, P[5], 2);
    p.box(x, y, 3, h, P, { base: 5 }); p.box(x + w - 3, y, 3, h, P, { base: 2 });
    p.p(x + 1, y + 1, RAMP.iron[4]); p.p(x + w - 2, y + 1, RAMP.iron[4]); p.p(x + 1, y + h - 2, RAMP.iron[3]);
    if (s) { p.r(x + w / 2 - 3, y + h / 2 - 1, 6, 3, P[1]); }
  };
  crate(5, 25, 24, 20, 1);
  crate(25, 29, 18, 16, 0);
  crate(14, 8, 20, 17, 0);
  p.r(17, 6, 4, 2, RAMP.green[4]); p.p(18, 5, RAMP.green[5]); // a sprig peeking out
};
ART.wd_planter = (p) => {
  const P = RAMP.pine, G = RAMP.green;
  // greens
  const leaf = (x, y, c, c2) => { p.r(x, y, 2, 4, c); p.p(x, y, c2); };
  for (let i = 0; i < 9; i++) leaf(8 + i * 3.6, 21 + (i % 3) * 2 - (i % 2) * 3, G[3 + (i % 3)], G[6]);
  for (let i = 0; i < 6; i++) leaf(10 + i * 5, 16 + (i % 2) * 3, G[4], G[6]);
  const fl = (x, y, R) => { p.r(x - 1, y, 3, 1, R[4]); p.r(x, y - 1, 1, 3, R[4]); p.p(x, y, RAMP.gold[5]); p.p(x - 1, y - 1, R[6]); };
  fl(12, 14, RAMP.pink); fl(21, 11, RAMP.gold); fl(29, 13, RAMP.pink); fl(36, 16, RAMP.purple); fl(17, 18, RAMP.red);
  p.r(7, 26, 34, 2, RAMP.bark[2]); // soil
  p.box(5, 27, 38, 18, P, { base: 3 });
  for (let y = 31; y < 44; y += 5) p.hl(6, 41, y, P[1]);
  p.box(4, 26, 40, 3, P, { base: 5 });
  p.box(5, 27, 3, 18, P, { base: 4 }); p.box(40, 27, 3, 18, P, { base: 2 });
};
ART.wd_birdhouse = (p) => {
  const P = RAMP.pine, R = RAMP.red;
  p.box(22, 22, 4, 23, RAMP.bark, { base: 3 });
  p.ln(18, 45, 22, 40, RAMP.bark[2], 2); p.ln(30, 45, 26, 40, RAMP.bark[2], 2);
  // side branch + small house
  p.r(26, 30, 8, 2, RAMP.bark[3]);
  p.box(31, 24, 10, 8, P, { base: 4 }); p.poly([[30, 25], [36, 19], [42, 25]], R[3]); p.hl(31, 41, 24, R[5]); p.r(35, 27, 2, 2, P[0]);
  // main house
  p.box(14, 12, 20, 12, P, { base: 4 });
  p.r(14, 12, 20, 1, P[5]);
  for (let x = 16; x < 34; x += 4) p.vl(x, 13, 22, P[3]);
  p.poly([[11, 14], [24, 3], [37, 14]], R[3]);
  p.ln(11, 14, 24, 3, R[5]); p.hl(12, 36, 14, R[2]);
  for (let i = 0; i < 4; i++) p.hl(16 + i * 2, 32 - i * 2, 12 - i * 2, R[4]);
  p.el(24, 18, 2.5, 2.5, P[0]); p.p(23, 17, RAMP.walnut[2]);
  p.r(23, 21, 2, 1, RAMP.bark[2]);
  p.p(24, 2, RAMP.gold[5]);
};
ART.wd_arch = (p) => {
  const B = RAMP.bark, G = RAMP.green;
  // two twig bundles bending into an arch
  for (let k = 0; k < 3; k++) {
    const r = 15 - k * 1.3, c = B[3 + (k % 2)];
    for (let a = 0; a <= Math.PI; a += 0.02) p.p(24 + Math.cos(a) * r, 23 - Math.sin(a) * (r + 2) + k * 0.4, c);
    p.vl(Math.round(24 - r), 23, 45, c); p.vl(Math.round(24 + r), 23, 45, k ? B[2] : B[3]);
  }
  for (let y = 24; y < 45; y += 3) { p.p(9, y, B[5]); p.p(38, y + 1, B[2]); }
  // leaves + flowers woven in
  const R = rng(5);
  for (let i = 0; i < 26; i++) {
    const a = (i / 25) * Math.PI, rr = 15 + (R() - 0.5) * 3;
    const x = 24 + Math.cos(a) * rr, y = 23 - Math.sin(a) * (rr + 2);
    p.r(x, y, 2, 2, G[3 + Math.floor(R() * 3)]); p.p(x, y, G[6]);
  }
  for (let i = 0; i < 7; i++) { const y = 26 + i * 3; p.r(i % 2 ? 7 : 39, y, 2, 2, G[4]); }
  const fl = (x, y, C) => { p.r(x - 1, y, 3, 1, C[4]); p.r(x, y - 1, 1, 3, C[4]); p.p(x, y, RAMP.gold[5]); };
  fl(14, 13, RAMP.pink); fl(24, 6, RAMP.gold); fl(33, 12, RAMP.purple); fl(8, 30, RAMP.pink); fl(40, 36, RAMP.gold);
};
// ---- antiques (restored)
ART.an_chair = (p) => {
  const W = RAMP.walnut, V = RAMP.red, Gd = RAMP.gold;
  // cabriole legs
  p.ln(13, 34, 11, 44, W[4], 2); p.p(10, 44, W[3]); p.ln(35, 34, 37, 44, W[3], 2); p.p(38, 44, W[2]);
  // back: carved frame + velvet
  p.el(24, 15, 12, 12, W[4]);
  p.el(24, 15, 9.5, 10, V[3]);
  p.el(22, 12, 5, 5, V[4]); p.p(20, 9, V[6]);
  for (const [x, y] of [[24, 9], [20, 14], [28, 14], [24, 19]]) p.p(x, y, V[1]); // tufted buttons
  p.r(22, 3, 4, 2, Gd[4]); p.p(23, 2, Gd[6]);
  // arms
  p.box(7, 22, 7, 12, V, { base: 3 }); p.box(34, 22, 7, 12, V, { base: 2 });
  p.box(6, 21, 9, 3, W, { base: 4 }); p.box(33, 21, 9, 3, W, { base: 3 });
  p.el(9, 22, 2, 2, Gd[4]); p.el(38, 22, 2, 2, Gd[3]);
  // seat cushion
  p.box(12, 27, 24, 6, V, { base: 4 }); p.hl(13, 34, 27, V[6]);
  p.box(10, 33, 28, 3, W, { base: 4 }); p.hl(11, 36, 34, Gd[4]);
};
ART.an_table = (p) => {
  const W = RAMP.walnut, Gd = RAMP.gold, L = RAMP.ivory;
  const leg = (x, d) => {
    p.box(x, 26, 4, 19, W, { base: 4 - d });
    p.el(x + 2, 31, 3, 2, W[5 - d]); p.el(x + 2, 38, 2.5, 2, W[4 - d]); p.r(x - 1, 43, 6, 2, W[2]);
  };
  leg(12, 2); leg(33, 2); leg(7, 0); leg(37, 0);
  p.box(4, 23, 40, 4, W, { base: 4 }); p.hl(5, 42, 25, Gd[4]);
  p.box(3, 19, 42, 4, W, { base: 5 });
  // lace runner
  p.r(16, 19, 16, 3, L[5]); for (let x = 16; x < 32; x += 2) { p.p(x, 22, L[4]); p.p(x + 1, 23, L[5]); }
  // candlestick
  p.r(23, 13, 2, 6, Gd[4]); p.r(21, 18, 6, 1, Gd[3]); p.r(23, 9, 2, 4, L[6]); p.p(23, 7, RAMP.gold[5]); p.p(24, 8, RAMP.red[5]);
};
ART.an_clock = (p) => {
  const W = RAMP.walnut, Gd = RAMP.gold, C = RAMP.cream;
  p.box(13, 41, 22, 4, W, { base: 3 });
  p.box(15, 18, 18, 23, W, { base: 4 });
  p.r(19, 23, 10, 15, W[1]);
  p.ring(24, 30.5, 5, 7.5, Gd[3]);
  p.r(19, 23, 10, 1, Gd[3]); p.r(19, 38, 10, 1, Gd[2]);
  p.vl(24, 24, 33, Gd[2]); p.el(24, 35, 2.5, 2.5, Gd[4]); p.p(23, 34, Gd[6]);
  p.r(20, 24, 1, 6, '#9fb6c8');
  p.box(12, 3, 24, 16, W, { base: 4 });
  p.el(24, 4, 10, 4, W[5]); p.r(21, 0, 6, 2, Gd[4]);
  p.el(24, 11, 6, 6, Gd[3]); p.el(24, 11, 5, 5, C[5]);
  for (const [x, y] of [[24, 7], [28, 11], [24, 15], [20, 11]]) p.p(x, y, W[1]);
  p.ln(24, 11, 24, 8, W[1]); p.ln(24, 11, 26, 12, W[1]); p.p(24, 11, RAMP.red[3]);
  p.p(21, 8, C[6]);
};
ART.an_lamp = (p) => {
  const Gd = RAMP.brass, I = RAMP.iron;
  p.ring(24, 6, 4, 4, Gd[3]); p.ring(24, 6, 3, 3, Gd[4]);
  p.poly([[16, 15], [24, 9], [32, 15]], Gd[3]); p.ln(16, 15, 24, 9, Gd[5]);
  p.box(15, 15, 18, 2, Gd, { base: 4 });
  p.r(17, 17, 14, 20, '#f8d870');
  p.el(24, 30, 4, 6, '#fff4c0'); p.el(24, 31, 2, 3, '#ffffff'); p.r(23, 32, 2, 5, '#ffb84a');
  for (const x of [16, 23, 31]) p.box(x, 17, 2, 20, Gd, { base: x < 24 ? 5 : 3 });
  p.r(19, 19, 1, 8, '#fffbe8');
  p.box(14, 37, 20, 3, Gd, { base: 4 });
  p.box(16, 40, 16, 4, Gd, { base: 3 });
  p.p(20, 41, I[6]);
};
ART.an_cart = (p) => {
  const P = RAMP.oak, Gd = RAMP.gold;
  // flowers
  const R = rng(9);
  const cols = [RAMP.pink, RAMP.gold, RAMP.purple, RAMP.red, RAMP.cream];
  for (let i = 0; i < 26; i++) {
    const x = 9 + R() * 28, y = 13 + R() * 8;
    if (R() < 0.4) { p.r(x, y + 2, 2, 3, RAMP.green[4]); continue; }
    const C = cols[Math.floor(R() * cols.length)];
    p.r(x - 1, y, 3, 2, C[4]); p.p(x, y - 1, C[5]); p.p(x, y, Gd[5]);
  }
  // cart box
  p.box(6, 21, 32, 12, P, { base: 4 });
  for (let x = 10; x < 36; x += 6) p.vl(x, 22, 31, P[2]);
  p.box(5, 20, 34, 2, P, { base: 5 });
  p.r(12, 24, 20, 5, RAMP.cream[5]); p.r(13, 25, 18, 3, RAMP.cream[4]);
  p.hl(14, 29, 26, RAMP.pink[3]);
  // handles
  p.ln(38, 23, 46, 19, P[3], 2);
  p.ln(7, 33, 6, 44, P[2], 2);
  // wheel
  p.el(29, 37, 7, 7, P[1]); p.ring(29, 37, 7, 7, P[4]); p.ring(29, 37, 6, 6, P[3]);
  for (let a = 0; a < 6; a++) p.ln(29, 37, 29 + Math.cos(a) * 5, 37 + Math.sin(a) * 5, P[4]);
  p.el(29, 37, 1.5, 1.5, Gd[4]);
};

// ---- ruins: an antique, aged, broken and tipped over (derived procedurally)
const RUIN_OF = { ruin_chair: 'an_chair', ruin_table: 'an_table', ruin_clock: 'an_clock', ruin_lamp: 'an_lamp', ruin_cart: 'an_cart' };
function ruinify(src, seed = 3) {
  const w = src.width, h = src.height;
  const p = new Pen(w + 8, h + 4);
  const g0 = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const R = rng(seed);
  const im = p.g.createImageData(p.w, p.h), d = im.data;
  const grime = [74, 66, 52];
  // shear (lean) + desaturate + grime
  const lean = (R() < 0.5 ? -1 : 1) * (0.1 + R() * 0.08);
  const holes = Array.from({ length: 3 }, () => ({ x: R() * w, y: R() * h * 0.7, r: 2 + R() * 3.5 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (g0[i + 3] < 128) continue;
    if (holes.some((o) => Math.hypot(x - o.x, y - o.y) < o.r)) continue;
    const nx = Math.round(x + 4 + (h - y) * lean * 0.5), ny = y + 2;
    if (nx < 0 || nx >= p.w) continue;
    const l = 0.3 * g0[i] + 0.55 * g0[i + 1] + 0.15 * g0[i + 2];
    let c = mixRGB([g0[i], g0[i + 1], g0[i + 2]], [l, l * 0.94, l * 0.82], 0.62);
    c = mixRGB(c, grime, 0.18 + (bayer(x, y) < 0.3 ? 0.12 : 0));
    const o = (ny * p.w + nx) * 4;
    d[o] = c[0] * 1.02; d[o + 1] = c[1] * 0.98; d[o + 2] = c[2] * 0.9; d[o + 3] = 255;
  }
  p.g.putImageData(im, 0, 0);
  // cracks
  for (let k = 0; k < 3; k++) {
    let x = 8 + R() * (w - 8), y = 6 + R() * (h - 14);
    for (let s = 0; s < 7; s++) {
      const nx = x + (R() - 0.5) * 4, ny = y + 1 + R() * 2;
      const a = p.g.getImageData(Math.round(nx), Math.round(ny), 1, 1).data[3];
      if (a > 128) p.ln(x, y, nx, ny, '#1d140e');
      x = nx; y = ny;
    }
  }
  // moss on top edges + a cobweb
  const top = p.g.getImageData(0, 0, p.w, p.h).data;
  for (let x = 0; x < p.w; x++) for (let y = 1; y < p.h; y++) {
    if (top[(y * p.w + x) * 4 + 3] > 128 && top[((y - 1) * p.w + x) * 4 + 3] < 128) {
      if (R() < 0.35) { p.p(x, y, R() < 0.5 ? '#5f8a3a' : '#7aa64a'); if (R() < 0.4) p.p(x, y - 1, '#4a7030'); }
    }
  }
  p.outline(0.72);
  return p.c;
}

const artCache = new Map();
export const WORKSHOP_ART_IDS = [...Object.keys(ART), ...Object.keys(RUIN_OF)];
// built-in picture for a woodwork / antique / ruin id (48x48-ish canvas) or null
export function workshopArt(id) {
  if (artCache.has(id)) return artCache.get(id);
  let c = null;
  if (ART[id]) {
    const p = new Pen(48, 48);
    try { ART[id](p); } catch (e) { console.error(e); }
    p.outline(0.72);
    c = p.c;
  } else if (RUIN_OF[id]) {
    const a = workshopArt(RUIN_OF[id]);
    if (a) c = ruinify(a, hashStr(id) % 97);
  }
  artCache.set(id, c);
  return c;
}

// ---- small material icons (16x16) used when the game has no sprite for them
const MAT_ART = {
  wood(p) {
    const P = RAMP.pine;
    p.box(1, 9, 14, 4, P, { base: 4 }); p.el(2.5, 11, 1.5, 2, P[6]); p.p(2, 11, P[3]);
    p.box(2, 5, 13, 4, P, { base: 3 }); p.el(3.5, 7, 1.5, 2, P[5]); p.p(3, 7, P[2]);
    p.box(1, 1, 12, 4, P, { base: 5 }); p.el(2.5, 3, 1.5, 2, P[6]); p.p(2, 3, P[4]);
  },
  fiddlehead(p) {
    const G = RAMP.green;
    p.ln(7, 15, 8, 7, G[3], 2);
    p.ring(8, 5, 4, 4, G[4]); p.ring(8, 5, 3, 3, G[5]); p.el(8.5, 5, 1.8, 1.8, G[6]); p.p(9, 5, G[3]);
    p.p(5, 11, G[5]); p.p(4, 10, G[4]); p.p(11, 12, G[5]); p.p(12, 11, G[4]);
  },
  ramps(p) {
    const G = RAMP.green;
    p.poly([[3, 1], [7, 8], [6, 10], [2, 4]], G[4]); p.poly([[13, 1], [9, 8], [10, 10], [14, 4]], G[3]); p.ln(4, 2, 6, 8, G[6]);
    p.r(7, 6, 2, 5, RAMP.pink[3]); p.p(7, 6, RAMP.pink[5]);
    p.el(8, 13, 3, 2.5, RAMP.ivory[5]); p.p(7, 12, '#ffffff'); p.vl(8, 15, 15, RAMP.ivory[2]);
  },
  morel(p) {
    const T = RAMP.oak;
    p.box(6, 10, 4, 5, RAMP.cream, { base: 4 });
    p.el(8, 6, 4.5, 6, T[4]);
    for (const [x, y] of [[6, 3], [9, 4], [7, 6], [10, 7], [5, 7], [8, 9], [6, 9]]) p.p(x, y, T[1]);
    p.p(6, 2, T[6]); p.p(5, 4, T[5]);
  },
  wildberry(p) {
    const C = RAMP.purple, Rr = RAMP.red;
    p.poly([[8, 1], [14, 3], [9, 5]], RAMP.green[4]);
    const b = (x, y, Q) => { p.el(x, y, 2.6, 2.6, Q[3]); p.p(Math.round(x) - 1, Math.round(y) - 1, Q[6]); };
    b(6, 7, C); b(10, 8, Rr); b(5, 11, Rr); b(9.5, 12, C); b(13, 11, C);
  },
  pinecone(p) {
    const B = RAMP.oak;
    p.el(8, 9, 4.5, 6.5, B[2]);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) { const x = 5 + i * 3 + (r % 2), y = 4 + r * 3; p.r(x, y, 2, 2, B[4]); p.p(x, y, B[6]); }
    p.r(7, 1, 2, 2, RAMP.bark[3]);
  },
  resin(p) {
    const A = RAMP.gold;
    p.poly([[8, 1], [12, 8], [12, 11], [9, 14], [6, 14], [4, 11], [4, 8]], A[3]);
    p.el(8, 10, 3, 3.5, A[4]); p.p(6, 8, A[6]); p.p(6, 9, A[6]); p.p(10, 12, A[2]);
  },
  clock(p) {
    p.el(8, 8, 7, 7, RAMP.oak[2]); p.el(8, 8, 5.5, 5.5, RAMP.cream[5]);
    p.vl(8, 4, 8, INK_HEX); p.hl(8, 11, 8, INK_HEX); p.p(6, 5, '#ffffff');
  },
};
const INK_HEX = '#2a1a14';
const matCache = new Map();
function matArt(name) {
  if (matCache.has(name)) return matCache.get(name);
  let c = null;
  if (MAT_ART[name]) { const p = new Pen(18, 18); p.g.translate(1, 1); MAT_ART[name](p); p.g.setTransform(1, 0, 0, 1, 0, 0); p.outline(0.7); c = p.c; }
  matCache.set(name, c);
  return c;
}

// blueprint line drawing of a picture: white edges + light hatching on blue
function blueprintify(src, bright = true) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const p = new Pen(w, h), im = p.g.createImageData(w, h), d = im.data;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : s[(y * w + x) * 4 + 3]);
  const L = (x, y) => { const i = (y * w + x) * 4; return 0.3 * s[i] + 0.59 * s[i + 1] + 0.11 * s[i + 2]; };
  const line = bright ? [236, 246, 255] : [150, 170, 196], hatch = bright ? [130, 172, 228] : [96, 120, 150];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) < 128) continue;
    const o = (y * w + x) * 4;
    let edge = A(x + 1, y) < 128 || A(x - 1, y) < 128 || A(x, y + 1) < 128 || A(x, y - 1) < 128;
    if (!edge && x + 1 < w && y + 1 < h) edge = Math.abs(L(x, y) - L(x + 1, y)) > 48 || Math.abs(L(x, y) - L(x, y + 1)) > 48;
    // outline pixels of the source art are the darkest ones: those are the "ink" lines
    if (!edge && L(x, y) < 52) edge = true;
    if (edge) { d[o] = line[0]; d[o + 1] = line[1]; d[o + 2] = line[2]; d[o + 3] = 255; } else if ((x + y) % 4 === 0) { d[o] = hatch[0]; d[o + 1] = hatch[1]; d[o + 2] = hatch[2]; d[o + 3] = 200; }
  }
  p.g.putImageData(im, 0, 0);
  return p.c;
}
// the unbuilt part of a job: a dithered raw-wood ghost with a pencil outline
function ghostify(src) {
  const w = src.width, h = src.height;
  const s = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const p = new Pen(w, h), im = p.g.createImageData(w, h), d = im.data;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : s[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) < 128) continue;
    const o = (y * w + x) * 4, edge = A(x + 1, y) < 128 || A(x - 1, y) < 128 || A(x, y + 1) < 128 || A(x, y - 1) < 128;
    if (edge) { if ((x + y) % 3 !== 0) { d[o] = 236; d[o + 1] = 214; d[o + 2] = 168; d[o + 3] = 255; } } else if ((x + y) % 2 === 0) { d[o] = 120; d[o + 1] = 82; d[o + 2] = 50; d[o + 3] = 150; }
  }
  p.g.putImageData(im, 0, 0);
  return p.c;
}

// ===========================================================================
// props: tools, Chip, lever, slate, ruler ...
// ===========================================================================
const PROPS = {};
const propCache = new Map();
const prop = (name) => { if (!propCache.has(name)) propCache.set(name, PROPS[name]()); return propCache.get(name); };
// a handsaw (pointing right), 22x9
PROPS.saw = () => {
  const p = new Pen(24, 11), I = RAMP.iron, P = RAMP.oak;
  p.poly([[8, 2], [22, 4], [22, 6], [8, 8]], I[4]); p.hl(8, 21, 3, I[6]); p.hl(9, 21, 4, I[5]);
  for (let x = 9; x < 22; x += 2) p.p(x, 8 - Math.round((x - 8) / 7), I[2]);
  p.box(1, 2, 8, 7, P, { base: 4 }); p.r(3, 4, 4, 3, P[1]);
  p.p(7, 3, I[5]); p.p(7, 7, I[5]);
  p.outline(0.7);
  return p.c;
};
PROPS.hammer = () => {
  const p = new Pen(14, 16), I = RAMP.iron, P = RAMP.pine;
  p.box(6, 5, 2, 10, P, { base: 4 });
  p.box(2, 1, 10, 4, I, { base: 4 }); p.r(2, 1, 3, 4, I[5]); p.p(11, 4, I[2]);
  p.outline(0.7);
  return p.c;
};

// ---- Chip the woodpecker: head + body layers (84 wide); faces right
const CHIP_W = 84, CHIP_HEAD_H = 64, CHIP_BODY_H = 56, CHIP_BODY_Y = 54, CHIP_H = CHIP_BODY_Y + CHIP_BODY_H;
function chipHead(blink, open) {
  const p = new Pen(CHIP_W, CHIP_HEAD_H);
  const K = RAMP.coal, Rr = RAMP.red, C = RAMP.cream, Bk = RAMP.ivory, Bs = RAMP.brass;
  // head ball (charcoal), lit from the top-left
  p.el(38, 38, 21, 19, K[3]);
  p.el(34, 34, 15, 12, K[4]);
  p.el(31, 31, 7, 5, K[5]);
  // cheek + throat: cream, with a soft shade line
  p.poly([[59, 37], [58, 47], [50, 55], [38, 58], [28, 56], [30, 50], [40, 46], [50, 42]], C[4]);
  p.poly([[59, 37], [57, 45], [50, 50], [42, 50], [50, 44]], C[5]);
  p.hl(31, 46, 57, C[2]);
  // red "moustache" stripe from the beak
  p.poly([[58, 42], [52, 47], [46, 48], [52, 44]], Rr[3]);
  // crest: a big swoopy red tuft
  p.poly([[57, 31], [56, 22], [50, 13], [41, 7], [29, 1], [33, 8], [18, 4], [24, 12], [8, 13], [19, 19], [14, 28], [22, 26], [31, 23], [41, 22], [50, 25]], Rr[3]);
  p.poly([[57, 31], [56, 22], [50, 13], [41, 7], [29, 1], [36, 9], [44, 14], [50, 22]], Rr[5]);
  p.ln(29, 1, 37, 6, Rr[6]); p.ln(18, 4, 25, 8, Rr[5]); p.ln(8, 13, 16, 13, Rr[5]);
  p.poly([[14, 28], [22, 26], [31, 23], [41, 22], [50, 25], [44, 25], [30, 26], [20, 28]], Rr[1]);
  // goggles pushed up on the crest + strap
  p.ln(16, 25, 40, 17, RAMP.leather[2], 2);
  p.el(45, 17, 6, 5.5, Bs[3]); p.ring(45, 17, 6, 5.5, Bs[5]);
  p.el(45, 17, 4, 3.5, '#5ab4dc'); p.el(44, 16, 2, 1.5, '#bdeaf8'); p.p(43, 15, '#ffffff');
  p.p(40, 21, Bs[1]); p.p(50, 21, Bs[1]);
  // brow + big shiny eye
  p.ln(45, 26, 55, 25, K[0], 1); p.p(45, 27, K[0]);
  if (blink) {
    p.ln(45, 33, 48, 31, K[0]); p.hl(48, 52, 31, K[0]); p.ln(52, 31, 55, 33, K[0]);
    p.hl(47, 53, 32, K[5]);
  } else {
    p.el(50, 33, 5.5, 6, '#fbf7ee'); p.ring(50, 33, 5.5, 6, '#c9c0ad');
    p.el(51.5, 34, 3.2, 4.4, '#140f1a'); p.p(53, 37, '#3a3050');
    p.r(51, 30, 2, 2, '#ffffff'); p.p(49, 36, '#ffffff');
  }
  // rosy cheek
  p.r(47, 42, 4, 1, RAMP.pink[4]); p.r(48, 43, 3, 1, RAMP.pink[3]);
  // beak: a stout chisel bill
  if (open) {
    p.poly([[57, 31], [78, 35], [57, 38]], Bk[4]); p.hl(58, 70, 33, Bk[6]); p.hl(58, 76, 35, Bk[2]);
    p.poly([[72, 34], [78, 35], [72, 37]], Bk[1]);
    p.poly([[57, 40], [72, 44], [57, 45]], Bk[2]); p.hl(58, 66, 44, Bk[1]);
    p.poly([[57, 38], [70, 40.5], [57, 41]], '#8a2a36'); p.r(58, 39, 4, 1, '#c84a5a');
  } else {
    p.poly([[57, 31], [78, 37], [57, 39]], Bk[4]); p.hl(58, 70, 33, Bk[6]); p.hl(58, 64, 32, Bk[5]);
    p.poly([[57, 39], [74, 38], [57, 43]], Bk[2]); p.hl(58, 74, 38, Bk[1]);
    p.poly([[72, 35], [78, 37], [72, 38]], Bk[1]);
  }
  p.p(60, 34, Bk[1]);
  p.outline(0.78);
  return p.c;
}
function chipBody() {
  const p = new Pen(CHIP_W, CHIP_BODY_H);
  const K = RAMP.coal, C = RAMP.cream, L = RAMP.leather, I = RAMP.iron;
  // back wing
  p.el(19, 30, 8, 17, K[2]); p.el(17, 26, 5, 9, K[3]);
  p.ln(14, 40, 20, 46, K[1]);
  // torso + belly
  p.el(40, 34, 23, 27, K[3]); p.el(33, 25, 14, 13, K[4]);
  p.el(45, 33, 14, 21, C[4]); p.el(44, 28, 10, 13, C[5]);
  // apron + straps
  p.ln(30, 1, 31, 19, L[2], 2); p.ln(52, 1, 54, 19, L[2], 2);
  p.poly([[29, 18], [56, 18], [61, 56], [24, 56]], L[3]);
  p.poly([[29, 18], [41, 18], [39, 56], [24, 56]], L[4]);
  p.hl(29, 55, 18, L[6]); p.hl(29, 55, 19, L[5]);
  for (let y = 22; y < 56; y += 3) { p.p(29 - Math.round((y - 19) * 0.13), y, L[6]); p.p(55 + Math.round((y - 19) * 0.13), y, L[1]); }
  // pocket: a ruler and a pencil
  p.r(36, 25, 3, 10, RAMP.gold[5]); for (let y = 26; y < 34; y += 2) p.p(36, y, RAMP.gold[2]);
  p.ln(45, 34, 48, 25, RAMP.red[4], 2); p.p(48, 24, RAMP.walnut[2]); p.p(49, 24, RAMP.pink[4]);
  p.box(33, 33, 18, 11, L, { base: 2 }); p.hl(34, 49, 33, L[5]);
  p.p(35, 35, I[5]); p.p(48, 35, I[5]);
  // front wing holding a hammer
  p.ln(66, 40, 78, 16, RAMP.pine[4], 3); p.ln(66, 39, 77, 17, RAMP.pine[6]);
  p.box(72, 9, 11, 7, I, { base: 4 }); p.r(72, 9, 3, 7, I[5]); p.hl(73, 82, 9, I[6]);
  p.el(64, 33, 8, 15, K[3]); p.el(63, 27, 6, 8, K[4]);
  p.el(68, 26, 4, 4, K[4]); p.p(67, 24, K[5]); // wing "hand" around the handle
  for (let y = 38; y < 47; y += 4) p.ln(58, y, 66, y + 3, K[1]);
  p.outline(0.78);
  return p.c;
}

// ===========================================================================
// scene textures (paper.js tiles, recoloured) - async because tiles are data URLs
// ===========================================================================
const WOOD_SRC = ['#2c190d', '#3f2414', '#52301b', '#663d22', '#7a4b2b', '#8f5a35', '#a56b40'];
const TONE = {
  wall: ['#22140c', '#2e1a10', '#3a2215', '#462a19', '#53321e', '#5f3a23', '#6b4228'],
  bench: ['#6d4421', '#87552a', '#a06833', '#b97c3e', '#cc904b', '#dea65c', '#ecbd75'],
  benchDk: ['#2a170c', '#3a2112', '#4a2b18', '#5a351e', '#6a4024', '#7a4b2a', '#8a5630'],
  shelf: ['#3e2414', '#52301a', '#663d21', '#7a4a28', '#8f5830', '#a46838', '#b87a44'],
  floor: ['#2a1a10', '#382316', '#462c1b', '#553521', '#633e27', '#72482d', '#805234'],
  frame: ['#5a3418', '#71431f', '#8a5427', '#a3662f', '#b97a3a', '#cd8f48', '#dfa65a'],
};
let texReady = null;
const TEX = {};
function loadImg(url) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
}
function remapTile(img, from, to, rotate = false) {
  const w = img.width, h = img.height;
  const src = newCanvas(w, h), g = src.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, w, h), d = im.data;
  const map = new Map(from.map((c, i) => [hexRGB(c).join(','), hexRGB(to[i])]));
  for (let i = 0; i < d.length; i += 4) {
    const m = map.get(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    if (m) { d[i] = m[0]; d[i + 1] = m[1]; d[i + 2] = m[2]; }
  }
  g.putImageData(im, 0, 0);
  if (!rotate) return src;
  const r = newCanvas(h, w), rg = r.getContext('2d');
  rg.translate(h, 0); rg.rotate(Math.PI / 2); rg.drawImage(src, 0, 0);
  return r;
}
function loadTextures() {
  if (texReady) return texReady;
  texReady = (async () => {
    const [wood, cork, kraft] = await Promise.all(['wood', 'cork', 'kraft'].map((k) => loadImg(paperTile(k).url)));
    if (wood) {
      TEX.wall = remapTile(wood, WOOD_SRC, TONE.wall, true);
      TEX.bench = remapTile(wood, WOOD_SRC, TONE.bench);
      TEX.benchDk = remapTile(wood, WOOD_SRC, TONE.benchDk);
      TEX.shelf = remapTile(wood, WOOD_SRC, TONE.shelf);
      TEX.floor = remapTile(wood, WOOD_SRC, TONE.floor);
      TEX.frame = remapTile(wood, WOOD_SRC, TONE.frame);
    }
    TEX.cork = cork; TEX.kraft = kraft;
  })();
  return texReady;
}
function tileFill(g, tex, x, y, w, h, ox = 0, oy = 0, fallback = '#3a2215') {
  if (w <= 0 || h <= 0) return;
  if (!tex) { g.fillStyle = fallback; g.fillRect(x, y, w, h); return; }
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const pat = g.createPattern(tex, 'repeat');
  g.translate(ox, oy);
  g.fillStyle = pat;
  g.fillRect(x - ox, y - oy, w, h);
  g.restore();
}

// ===========================================================================
// layout (art pixels)
// ===========================================================================
function computeLayout(W, H, n) {
  const L = { W, H };
  L.beam = 9;
  L.benchY = Math.round(H * 0.625);        // back edge of the bench top
  L.frontY = L.benchY + 12;                 // front edge of the top
  L.apronY = L.frontY + 5;                  // apron below the top
  L.underY = L.apronY + 13;
  L.floorY = Math.max(L.underY + 30, H - 54);
  L.leftW = clamp(Math.round(W * 0.235), 92, 160);
  L.rightW = clamp(Math.round(W * 0.26), 100, 176);
  L.rightX = W - L.rightW;
  // ---- corkboard of plans
  const bx0 = L.leftW + 4, bx1 = L.rightX - 6, by0 = L.beam + 22, by1 = L.benchY - 30;
  const nPlans = Math.max(1, n.craft);
  const SIZES = [[46, 56], [44, 52], [40, 48], [36, 44], [32, 40], [28, 36]];
  let pick = null;
  for (const [sw, sh] of SIZES) {
    const gx = 5, gy = 6, pad = 10;
    const cols = Math.max(1, Math.floor((bx1 - bx0 - pad * 2 + gx) / (sw + gx)));
    const rows = Math.ceil(nPlans / cols);
    const bw = Math.min(cols, nPlans) * (sw + gx) - gx + pad * 2, bh = rows * (sh + gy) - gy + pad * 2 + 4;
    if (bh <= by1 - by0 || sw === 28) { pick = { sw, sh, gx, gy, pad, cols: Math.min(cols, nPlans), rows, bw, bh }; break; }
  }
  // a balanced grid (4+4 rather than 5+3)
  pick.cols = Math.min(pick.cols, Math.ceil(nPlans / pick.rows));
  pick.bw = pick.cols * (pick.sw + pick.gx) - pick.gx + pick.pad * 2;
  pick.bw = Math.max(pick.bw, 120);
  L.board = { ...pick, x: Math.round((bx0 + bx1) / 2 - pick.bw / 2), y: by0 + Math.max(0, Math.round((by1 - by0 - pick.bh) * 0.35)), w: pick.bw, h: pick.bh };
  // the lamp hangs in front of the board's top edge, over the middle of the bench
  L.lamp = { x: Math.round(L.board.x + L.board.w / 2), top: L.beam, shadeY: L.board.y - 7 };
  L.bulb = { x: L.lamp.x, y: L.lamp.shadeY + 12 };
  // ---- right column: OPEN sign, jars of forest finds on shelves
  L.sign = { x: W - 56, y: L.beam - 1, w: 50, h: 34 };
  const jw = 26, jh = 30, jrow = jh + 17;
  let jcols = Math.max(1, Math.floor((L.rightW - 10) / jw));
  const jrows = Math.ceil(Math.max(1, n.mat) / jcols);
  jcols = Math.max(1, Math.ceil(Math.max(1, n.mat) / jrows)); // 3 + 3 rather than 4 + 2
  const top = L.sign.y + L.sign.h + 6;
  L.jars = { x: L.rightX + 6, y: top, jw, jh, cols: jcols, rows: jrows, rowH: jrow, w: L.rightW - 10 };
  L.jars.shelves = Array.from({ length: jrows }, (_, i) => top + i * jrow + jh);
  L.wood = { x: 4, y: H - 33, w: 66, h: 32 };
  // ---- left column: pegboard + Chip
  L.peg = { x: 7, y: L.beam + 7, w: L.leftW - 12, h: Math.round((L.benchY - L.beam) * 0.52) };
  L.chip = { x: Math.max(0, Math.round((L.leftW - CHIP_W) / 2) - 4), y: L.benchY - CHIP_H, w: CHIP_W, h: CHIP_H };
  // ---- bench: lever on the right, job slots in between
  L.lever = { px: W - 36, py: L.apronY + 6 };
  const sx0 = Math.max(L.chip.x + L.chip.w - 2, L.leftW - 8), sx1 = W - 66;
  const ns = Math.max(1, n.slots);
  const sw = (sx1 - sx0) / ns;
  L.slots = Array.from({ length: ns }, (_, i) => ({ cx: Math.round(sx0 + sw * (i + 0.5)), w: Math.round(sw) }));
  // ---- floor: repair pile (left), finished-goods crate (right)
  L.crate = { x: W - 66, y: H - 40, w: 62, h: 42 };
  L.repairs = { x: L.wood.x + L.wood.w + 6, y: L.floorY, n: n.repair };
  // ---- the unrolled plan sheet (on the bench, between Chip and the lever)
  const pw = clamp(W - L.leftW - 74, 230, 300), ph = clamp(H - (L.benchY - 74) - 14, 168, 200);
  L.plan = { x: Math.round(clamp((L.leftW + W - 66) / 2 - pw / 2, L.leftW - 18, W - 66 - pw)), y: Math.min(L.benchY - 74, H - ph - 8), w: pw, h: ph };
  return L;
}

// ===========================================================================
// scene painter: the static room behind everything
// ===========================================================================
function paintScene(L) {
  const { W, H } = L;
  const p = new Pen(W, H), g = p.g;
  const R = rng(17);
  // ---- back wall: vertical planks
  tileFill(g, TEX.wall, 0, 0, W, L.floorY + 4, 5, 0);
  for (let x = 0; x < W; x += 22) { // nails at the beam and near the floor
    p.p(x + 5, L.beam + 3, '#7a6a5a'); p.p(x + 16, L.beam + 3, '#7a6a5a');
  }
  // knot holes / old nails / a calendar tear
  for (let i = 0; i < 9; i++) { const x = Math.floor(R() * W), y = L.beam + 6 + Math.floor(R() * (L.benchY - L.beam - 10)); p.p(x, y, '#140b06'); p.p(x + 1, y, '#2a170c'); }
  // ---- ceiling beam
  p.r(0, 0, W, L.beam, '#3a2213');
  tileFill(g, TEX.benchDk, 0, 0, W, L.beam - 1, 3, 4);
  p.hl(0, W, L.beam - 1, '#1a0e07');
  for (let x = 0; x < W; x++) if (bayer(x, L.beam) < 0.6) p.p(x, L.beam, '#1a0e07');
  for (let x = 0; x < W; x++) if (bayer(x, L.beam + 1) < 0.3) p.p(x, L.beam + 1, '#1a0e07');
  for (let x = 30; x < W; x += 120) { p.r(x, 2, 2, 2, '#9a8a78'); p.p(x, 2, '#d0c4b4'); }
  // tree-trunk posts framing the room (it IS a tree house)
  const trunk = (x0, w) => {
    for (let y = 0; y < L.floorY + 6; y++) for (let x = x0; x < x0 + w; x++) {
      const u = (x - x0) / w, s = 0.5 + 0.5 * Math.sin((y * 0.35) + Math.sin(x * 1.7 + y * 0.05) * 2);
      const k = u < 0.25 ? 4 : u < 0.6 ? 3 : u < 0.85 ? 2 : 1;
      p.p(x, y, RAMP.bark[clamp(k + (s > 0.85 ? 1 : 0) - (s < 0.12 ? 1 : 0), 0, 6)]);
    }
  };
  trunk(-3, 7); trunk(W - 4, 7);
  // ---- pegboard + tools
  paintPegboard(p, L.peg);
  // ---- corkboard
  paintCorkboard(p, L.board);
  // ---- shelves for jars
  for (const y of L.jars.shelves) paintShelf(p, L.rightX + 2, y, L.rightW - 6);
  // under the jars: a little window into the forest (when there's room)
  const winY = L.jars.shelves[L.jars.shelves.length - 1] + 18, winH = L.benchY - 12 - winY;
  if (winH >= 34 && L.rightW >= 96) paintWindow(p, L.rightX + Math.round((L.rightW - 64) / 2), winY, 60, Math.min(winH, 54));
  // a garland of warm little bulbs along the beam
  stringLights(p, L);
  wallDecor(p, L);
  // cobweb in the top-right corner
  cobweb(p, W - 4, L.beam, 16);
  cobweb(p, 3, L.beam, -12);
  // ---- bench
  paintBench(p, L);
  // ---- floor
  tileFill(g, TEX.floor, 0, L.floorY, W, H - L.floorY, 0, L.floorY + 3);
  p.hl(0, W, L.floorY, '#140c07');
  for (let x = 0; x < W; x++) for (let y = L.floorY + 1; y < L.floorY + 5; y++) if (bayer(x, y) < 0.6 - (y - L.floorY) * 0.14) p.p(x, y, '#140c07');
  // bench legs + lower shelf in front of the floor line
  paintBenchLegs(p, L);
  benchProps(p, L);
  // a braided rag rug where the broken antiques wait
  if (L.repairs.n) paintRug(p, L.repairs.x + 8, H - 12, Math.min(W - L.repairs.x - 80, 52 + L.repairs.n * 40) / 2, 9);
  // sawdust drifts on the floor
  for (let i = 0; i < W / 3; i++) { const x = Math.floor(R() * W), y = L.floorY + 6 + Math.floor(R() * (H - L.floorY - 6)); p.p(x, y, R() < 0.5 ? '#c99a5c' : '#a8763e'); }
  // ---- lighting
  lightPass(p, L);
  return p.c;
}

function stringLights(p, L) {
  const { W } = L, y0 = L.beam + 1, sag = 7, seg = Math.round(W / Math.max(3, Math.round(W / 150)));
  const C = [['#ffd23f', '#fff6c0'], ['#ff7a4a', '#ffd0a0'], ['#7ad06a', '#d8ffc0'], ['#ff8ad0', '#ffe0f0'], ['#6ab8ff', '#d8f0ff']];
  let k = 0;
  for (let x0 = 0; x0 < W; x0 += seg) {
    const x1 = Math.min(W, x0 + seg);
    for (let x = x0; x < x1; x++) { const t = (x - x0) / (x1 - x0), y = Math.round(y0 + Math.sin(t * Math.PI) * sag); p.p(x, y, '#1a120c'); }
    for (let i = 1; i < 5; i++) {
      const t = i / 5, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + Math.sin(t * Math.PI) * sag);
      const [c, hi] = C[k++ % C.length];
      p.p(x, y + 1, '#3a2a1a');
      p.r(x - 1, y + 2, 3, 3, c); p.p(x - 1, y + 2, hi); p.p(x, y + 5, c);
      // halo
      for (const [dx, dy] of [[-2, 3], [2, 3], [0, 6], [-2, 5], [2, 5], [0, 1]]) if (bayer(x + dx, y + dy) < 0.5) p.p(x + dx, y + dy, rgbHex(mixRGB(hexRGB(c), [80, 50, 30], 0.45)));
    }
  }
}

function wallDecor(p, L) {
  const { W } = L;
  // right column, under the window (or the jars): a calendar and a round clock
  const top = L.jars.shelves[L.jars.shelves.length - 1] + 18;
  const winH = L.benchY - 12 - top;
  const winUsed = winH >= 34 && L.rightW >= 96 ? Math.min(winH, 54) + 6 : 0;
  const y0 = top + winUsed, room = L.benchY - 8 - y0;
  if (room >= 30) {
    const cx = L.rightX + Math.round(L.rightW * 0.3);
    // calendar: kraft sheet, red header, days crossed off
    const x = cx - 11, y = y0 + 2;
    p.r(x + 1, y + 2, 22, 28, 'rgba(10,5,2,0.5)');
    p.r(x, y, 22, 28, '#e8dcc0'); p.r(x, y, 22, 6, '#c0392b'); p.hl(x, x + 21, 6, '#8a2a20');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) {
      const dx = x + 2 + i * 4, dy = y + 9 + j * 4;
      p.r(dx, dy, 3, 3, '#cbbd9e');
      if (j * 5 + i < 13) { p.p(dx, dy, '#c0392b'); p.p(dx + 2, dy + 2, '#c0392b'); p.p(dx + 1, dy + 1, '#c0392b'); }
    }
    p.p(x + 11, y - 1, '#d8c8a8'); p.p(x + 11, y, '#3a2a1a');
    // clock
    const kx = L.rightX + Math.round(L.rightW * 0.72), ky = y0 + 14;
    p.el(kx + 1, ky + 2, 10, 10, 'rgba(10,5,2,0.5)');
    p.el(kx, ky, 10, 10, RAMP.oak[3]); p.ring(kx, ky, 10, 10, RAMP.oak[5]); p.el(kx, ky, 7.5, 7.5, RAMP.cream[5]);
    for (let a = 0; a < 12; a++) p.p(kx - 0.5 + Math.cos(a * Math.PI / 6) * 6, ky - 0.5 + Math.sin(a * Math.PI / 6) * 6, RAMP.walnut[3]);
    p.ln(kx, ky, kx, ky - 5, '#2a1a14'); p.ln(kx, ky, kx + 3, ky + 1, '#2a1a14'); p.p(kx, ky, '#c0392b');
  } else if (room >= 16) {
    const x = L.rightX + Math.round(L.rightW * 0.5) - 13, y = y0;
    p.r(x + 1, y + 2, 26, 12, 'rgba(10,5,2,0.5)'); p.r(x, y, 26, 12, '#f2e6c8'); p.hl(x + 3, x + 22, y + 4, '#9a8a6a'); p.hl(x + 3, x + 18, y + 7, '#9a8a6a'); p.p(x + 13, y + 1, '#c0392b');
  }
  // between the board and the right column: a saw blade on a nail
  const gap = L.rightX - (L.board.x + L.board.w);
  if (gap >= 40) {
    const cx = Math.round(L.board.x + L.board.w + gap / 2), cy = L.board.y + 26;
    p.el(cx + 1, cy + 2, 12, 12, 'rgba(10,5,2,0.45)');
    for (let a = 0; a < 24; a++) { const an = a * Math.PI / 12; p.p(cx + Math.cos(an) * 12.5, cy + Math.sin(an) * 12.5, RAMP.iron[3]); }
    p.el(cx, cy, 11.5, 11.5, RAMP.iron[4]); p.el(cx - 2, cy - 2, 7, 7, RAMP.iron[5]); p.el(cx, cy, 2.5, 2.5, RAMP.iron[1]); p.p(cx - 5, cy - 6, RAMP.iron[6]);
    p.p(cx, cy, '#d8c8a8');
    // a hanging coil of twine below it
    const ty = cy + 22;
    p.ring(cx, ty, 6, 7, '#c8a46a'); p.ring(cx, ty, 4, 5, '#a8844a'); p.ln(cx, ty + 7, cx + 2, ty + 14, '#c8a46a');
  }
}

// a mug and a pencil cup on the free stretch of bench beside Chip
function benchProps(p, L) {
  const x0 = L.chip.x + L.chip.w + 2, x1 = L.slots[0].cx - 34;
  if (x1 - x0 < 24) return;
  const y = L.benchY + 7; // standing on the bench top
  const mx = x0 + 2;
  // mug
  p.box(mx, y - 9, 9, 9, RAMP.cream, { base: 4 }); p.r(mx, y - 6, 9, 2, RAMP.red[3]);
  p.ring(mx + 10.5, y - 4.5, 2.5, 3, RAMP.cream[2]); p.r(mx + 1, y - 9, 7, 1, '#3a2010');
  p.r(mx - 1, y, 12, 1, 'rgba(10,5,2,0.35)');
  // pencil cup
  const cx = mx + 16;
  p.ln(cx + 1, y - 9, cx - 1, y - 16, RAMP.gold[4], 2); p.p(cx - 1, y - 17, RAMP.walnut[2]);
  p.ln(cx + 4, y - 9, cx + 6, y - 15, RAMP.red[4], 2); p.p(cx + 6, y - 16, RAMP.walnut[2]);
  p.ln(cx + 3, y - 9, cx + 3, y - 18, RAMP.blue[4], 1);
  p.box(cx, y - 9, 7, 9, RAMP.iron, { base: 4 }); p.hl(cx, cx + 6, y - 9, RAMP.iron[6]);
  p.r(cx - 1, y, 9, 1, 'rgba(10,5,2,0.35)');
  // a couple of curly shavings
  for (const [sx, sy] of [[cx + 11, y - 1], [cx + 15, y + 1]]) { p.hl(sx, sx + 2, sy, RAMP.pine[6]); p.p(sx + 3, sy - 1, RAMP.pine[5]); p.p(sx - 1, sy - 1, RAMP.pine[5]); }
}

function paintRug(p, cx, cy, rx, ry) {
  const C = ['#8a3a2a', '#c8a070', '#3a5a7a', '#b8584a', '#e0c890', '#5a7a4a'];
  cx += rx;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d > 1) continue;
    const ring = Math.floor(d * 6);
    let c = C[ring % C.length];
    if (((x + y * 2) % 4 === 0)) c = rgbHex(mixRGB(hexRGB(c), [20, 10, 6], 0.25)); // braid texture
    p.p(x, y, c);
  }
  for (let x = Math.floor(cx - rx); x <= cx + rx; x++) for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d > 1 && d < 1 + 1.6 / ry) p.p(x, y, '#2a160c');
  }
}

function cobweb(p, x0, y0, s) {
  const c = 'rgba(230,226,214,0.55)';
  const dir = Math.sign(s), n = Math.abs(s);
  for (let i = 0; i < n; i++) { p.p(x0 - dir * i, y0 + Math.round(i * 0.15), c); }
  for (let i = 0; i < n; i++) p.p(x0 - dir * Math.round(i * 0.15), y0 + i, c);
  for (let i = 0; i < n * 0.8; i++) p.p(x0 - dir * Math.round(i * 0.7), y0 + Math.round(i * 0.7), c);
  for (const r of [n * 0.35, n * 0.62, n * 0.85]) for (let a = 0; a <= Math.PI / 2; a += 0.6 / r) p.p(x0 - dir * Math.round(Math.cos(a) * r), y0 + Math.round(Math.sin(a) * r * 0.9 + 1), c);
}

function paintPegboard(p, B) {
  const { x, y, w, h } = B;
  // shadow
  p.r(x + 2, y + 2, w, h, 'rgba(10,5,2,0.45)');
  p.r(x, y, w, h, '#8a6a46');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (bayer(i * 3 + j, j * 7 + i) < 0.18) p.p(x + i, y + j, '#7d5f3e');
  for (let j = 3; j < h - 2; j += 4) for (let i = 3; i < w - 2; i += 4) { p.p(x + i, y + j, '#3a2616'); p.p(x + i, y + j + 1, '#9e7e58'); }
  p.r(x, y, w, 2, '#a8865e'); p.r(x, y + h - 2, w, 2, '#5e4228'); p.r(x, y, 2, h, '#9a7a52'); p.r(x + w - 2, y, 2, h, '#664a2e');
  // tools hang from pegs (each with a 1px drop shadow), packed in rows to fill the board
  const I = RAMP.iron, O = RAMP.oak, Pn = RAMP.pine;
  const TOOLS = [
    [36, 12, (q) => { q.poly([[10, 1], [34, 4], [34, 8], [10, 11]], I[4]); q.hl(11, 33, 3, I[6]); q.hl(11, 33, 4, I[5]); for (let i = 12; i < 34; i += 2) q.p(i, 10 - Math.round((i - 10) / 9), I[2]); q.box(0, 1, 11, 9, O, { base: 4 }); q.r(2, 4, 5, 3, O[1]); }],
    [10, 20, (q) => { q.box(3, 4, 3, 16, Pn, { base: 4 }); q.box(0, 0, 10, 5, I, { base: 4 }); q.r(0, 0, 3, 5, I[5]); }],
    [11, 20, (q) => { q.box(4, 6, 3, 14, Pn, { base: 4 }); q.box(0, 0, 11, 7, O, { base: 4 }); q.ring(5.5, 3.5, 5.5, 3.5, O[2]); }],
    [16, 20, (q) => { for (let k = 0; k < 3; k++) { q.box(k * 6, 0, 3, 8, RAMP.red, { base: 3 + (k % 2) }); q.box(k * 6 + 1, 8, 2, 7 + k * 2, I, { base: 4 }); } }],
    [16, 18, (q) => { q.r(0, 0, 3, 18, O[4]); q.r(0, 15, 16, 3, I[4]); q.hl(0, 15, 15, I[6]); for (let i = 3; i < 15; i += 2) q.p(i, 16, I[2]); q.vl(1, 0, 14, O[6]); }],
    [12, 14, (q) => { q.r(0, 2, 9, 2, I[3]); q.r(0, 2, 2, 12, I[3]); q.r(0, 12, 9, 2, I[3]); q.r(7, 0, 2, 6, I[5]); q.r(4, 0, 8, 1, I[4]); q.hl(0, 8, 2, I[5]); }],
    [13, 16, (q) => { q.ring(6, 6, 6, 6, '#c8a46a'); q.ring(6, 6, 4.5, 4.5, '#a8844a'); q.ring(6, 6, 3, 3, '#c8a46a'); q.vl(1, 10, 15, '#a8844a'); }],
    [9, 17, (q) => { q.ln(0, 0, 4, 9, RAMP.red[4], 2); q.ln(8, 0, 4, 9, RAMP.red[3], 2); q.r(3, 8, 3, 3, I[4]); q.ln(4, 11, 3, 16, I[3], 2); q.ln(5, 11, 6, 16, I[4], 1); }],
    [14, 11, (q) => { q.el(5, 5, 5, 5, RAMP.gold[4]); q.el(5, 5, 2.5, 2.5, RAMP.gold[2]); q.r(9, 7, 5, 2, RAMP.ivory[5]); q.p(4, 3, RAMP.gold[6]); }],
    [19, 10, (q) => { q.box(0, 4, 18, 5, O, { base: 4 }); q.box(4, 0, 4, 5, RAMP.red, { base: 3 }); q.box(12, 1, 4, 4, O, { base: 5 }); q.r(9, 2, 2, 3, I[5]); }],
    [6, 18, (q) => { q.box(0, 0, 6, 4, I, { base: 4 }); q.g.clearRect(2, 0, 2, 2); q.box(2, 4, 2, 14, I, { base: 3 }); q.p(1, 0, I[6]); }],
    [5, 18, (q) => { q.box(0, 0, 5, 8, RAMP.gold, { base: 3 }); q.box(2, 8, 1, 10, I, { base: 5 }); q.p(1, 1, RAMP.gold[6]); }],
    [8, 18, (q) => { q.box(2, 0, 4, 8, RAMP.pine, { base: 4 }); q.box(1, 8, 6, 3, I, { base: 4 }); q.box(0, 11, 8, 7, '#d8c8a8,#e8dcc0,#f4ead8,#c8b490,#b8a480,#a89470,#988460'.split(','), { base: 2 }); }],
    [14, 16, (q) => { q.ring(3.5, 3.5, 3, 3, RAMP.red[4]); q.ring(10.5, 3.5, 3, 3, RAMP.red[4]); q.ln(5, 6, 9, 15, I[4]); q.ln(9, 6, 5, 15, I[5]); q.p(7, 10, I[2]); }],
    [4, 18, (q) => { q.box(0, 0, 4, 6, RAMP.oak, { base: 4 }); q.box(1, 6, 2, 12, I, { base: 3 }); for (let y = 7; y < 18; y += 2) q.p(1, y, I[1]); }],
  ];
  const R = rng(w * 3 + h);
  let tx = 5, ty = 6, rowH = 0;
  const placed = [];
  for (let k = 0; k < TOOLS.length * 2 && ty < h - 12; k++) {
    const [tw, th, fn] = TOOLS[k % TOOLS.length];
    if (tx + tw > w - 4) { tx = 5 + Math.floor(R() * 4); ty += rowH + 5; rowH = 0; if (ty + 10 > h - 3) break; }
    if (ty + th > h - 3) { tx += tw + 4; continue; }
    placed.push([fn, tx, ty]);
    tx += tw + 4 + Math.floor(R() * 3); rowH = Math.max(rowH, th);
  }
  for (const [fn, px0, py0] of placed) {
    const q = new Pen(48, 30);
    q.g.translate(2, 2); fn(q); q.g.setTransform(1, 0, 0, 1, 0, 0);
    q.outline(0.72);
    const sh = new Pen(48, 30); sh.g.drawImage(q.c, 0, 0); sh.g.globalCompositeOperation = 'source-in'; sh.r(0, 0, 48, 30, 'rgba(30,16,8,0.55)');
    p.g.drawImage(sh.c, x + px0 - 2 + 1, y + py0 - 2 + 2);
    p.g.drawImage(q.c, x + px0 - 2, y + py0 - 2);
    p.p(x + px0 + 2, y + py0 - 2, '#d8c8a8'); // the peg
  }
}

function paintCorkboard(p, B) {
  const { x, y, w, h } = B;
  p.r(x + 3, y + 3, w, h, 'rgba(10,5,2,0.5)');
  tileFill(p.g, TEX.frame, x, y, w, h, 2, 1);
  p.r(x, y, w, 1, TONE.frame[6]); p.r(x, y, 1, h, TONE.frame[5]); p.r(x + w - 1, y, 1, h, TONE.frame[1]); p.r(x, y + h - 1, w, 1, TONE.frame[0]);
  const ix = x + 5, iy = y + 5, iw = w - 10, ih = h - 10;
  tileFill(p.g, TEX.cork, ix, iy, iw, ih, 0, 0, '#b68b4f');
  p.hl(ix, ix + iw - 1, iy, '#4a2c12'); p.vl(ix, iy, iy + ih - 1, '#5a3818');
  for (let i = 0; i < iw; i++) if (bayer(i, 1) < 0.5) p.p(ix + i, iy + 1, '#6c4620');
  p.hl(ix, ix + iw - 1, iy + ih, TONE.frame[6]);
  // corner nails
  for (const [cx, cy] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]) { p.p(cx, cy, '#e8e0d0'); p.p(cx + 1, cy + 1, '#3a2a1a'); }
  // old pin holes + a torn paper corner left on the cork
  const R = rng(w * 7 + h);
  for (let i = 0; i < w * h / 160; i++) p.p(ix + 2 + Math.floor(R() * (iw - 4)), iy + 2 + Math.floor(R() * (ih - 4)), '#4a2c12');
  p.poly([[ix + iw - 9, iy + ih - 1], [ix + iw - 1, iy + ih - 7], [ix + iw - 1, iy + ih - 1]], '#e8dcc0');
}

function paintShelf(p, x, y, w) {
  p.r(x + 1, y + 4, w, 3, 'rgba(10,5,2,0.5)');
  tileFill(p.g, TEX.shelf, x, y, w, 4, 0, y + 2);
  p.hl(x, x + w - 1, y, TONE.shelf[6]); p.hl(x, x + w - 1, y + 3, TONE.shelf[1]);
  // brackets
  for (const bx of [x + 6, x + w - 9]) { p.poly([[bx, y + 4], [bx + 3, y + 4], [bx + 3, y + 11]], '#1e1009'); p.r(bx, y + 4, 2, 6, TONE.shelf[2]); p.p(bx, y + 4, TONE.shelf[5]); }
}

function paintWindow(p, x, y, w, h) {
  // frame
  p.r(x + 2, y + 2, w, h, 'rgba(10,5,2,0.5)');
  p.box(x, y, w, h, TONE.frame, { base: 3 });
  const ix = x + 4, iy = y + 4, iw = w - 8, ih = h - 8;
  // forest outside: sky, sun, layered pines, a branch with leaves
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    const t = j / ih;
    const c = t < 0.33 ? (bayer(i, j) < (t / 0.33) ? '#ffe4a8' : '#ffd29a') : t < 0.55 ? (bayer(i, j) < ((t - 0.33) / 0.22) ? '#b8e0a0' : '#ffe4a8') : '#b8e0a0';
    p.p(ix + i, iy + j, c);
  }
  p.el(ix + iw * 0.7, iy + ih * 0.3, 5, 5, '#fff8d8');
  const pine = (cx, base, hh, c) => { for (let j = 0; j < hh; j++) { const half = Math.round((j / hh) * hh * 0.32) + ((j % 4) === 3 ? 1 : 0); p.hl(cx - half, cx + half, base - hh + j, c); } };
  const R = rng(4);
  for (let i = 0; i < 6; i++) pine(ix + 4 + i * (iw / 5), iy + ih, 16 + Math.floor(R() * 10), '#6fa86a');
  for (let i = 0; i < 5; i++) pine(ix + 8 + i * (iw / 4.5), iy + ih + 2, 14 + Math.floor(R() * 8), '#3f7a48');
  p.ln(ix - 1, iy + 6, ix + iw * 0.45, iy + 11, '#4b3324', 2);
  for (let i = 0; i < 6; i++) { const lx = ix + 2 + i * 4, ly = iy + 7 + Math.round(i * 0.7); p.r(lx, ly + (i % 2 ? 2 : -2), 3, 2, i % 2 ? '#5f9e40' : '#86bf55'); }
  // mullions + sill + a little plant pot
  p.r(ix + Math.floor(iw / 2) - 1, iy, 2, ih, TONE.frame[2]); p.r(ix, iy + Math.floor(ih / 2) - 1, iw, 2, TONE.frame[2]);
  p.hl(ix, ix + iw - 1, iy, TONE.frame[1]); p.vl(ix, iy, iy + ih - 1, TONE.frame[1]);
  p.box(x - 3, y + h - 2, w + 6, 4, TONE.frame, { base: 4 });
  p.box(x + w - 16, y + h - 9, 8, 7, RAMP.red, { base: 3 }); p.r(x + w - 15, y + h - 13, 2, 4, RAMP.green[4]); p.r(x + w - 12, y + h - 14, 2, 5, RAMP.green[5]); p.p(x + w - 14, y + h - 15, RAMP.pink[4]);
}

function paintBench(p, L) {
  const { W } = L, g = p.g;
  // shadow on the wall above the bench
  for (let x = 0; x < W; x++) for (let y = L.benchY - 3; y < L.benchY; y++) if (bayer(x, y) < (y - L.benchY + 4) / 4 * 0.7) p.p(x, y, '#140b06');
  // top surface (planks running left-right, seen from above)
  tileFill(g, TEX.bench, 0, L.benchY, W, L.frontY - L.benchY, 7, L.benchY + 4);
  p.hl(0, W, L.benchY, TONE.bench[1]);
  p.hl(0, W, L.benchY + 1, TONE.bench[2]);
  // tool marks, stains, a burnt ring
  const R = rng(31);
  for (let i = 0; i < W / 9; i++) { const x = Math.floor(R() * W), y = L.benchY + 2 + Math.floor(R() * (L.frontY - L.benchY - 3)); p.hl(x, x + 1 + Math.floor(R() * 3), y, TONE.bench[1]); }
  p.ring(Math.round(W * 0.18), L.benchY + 6, 5, 2, TONE.bench[1]);
  // thick front edge
  p.r(0, L.frontY, W, 5, TONE.bench[3]);
  p.hl(0, W, L.frontY, TONE.bench[6]); p.hl(0, W, L.frontY + 4, TONE.bench[1]);
  for (let x = 0; x < W; x += 41) p.vl(x + 13, L.frontY + 1, L.frontY + 3, TONE.bench[2]);
  // apron
  tileFill(g, TEX.benchDk, 0, L.apronY, W, L.underY - L.apronY, 0, L.apronY + 5);
  p.hl(0, W, L.apronY, '#150b06');
  p.hl(0, W, L.underY - 1, '#1a0e07');
  // dark space under the bench
  p.r(0, L.underY, W, L.floorY - L.underY + 4, '#1a100a');
  tileFill(g, TEX.wall, 0, L.underY, W, L.floorY - L.underY + 4, 5, 0);
  for (let y = L.underY; y < L.floorY + 4; y++) for (let x = 0; x < W; x++) if (bayer(x, y) < 0.72) p.p(x, y, '#150c07');
}

function paintBenchLegs(p, L) {
  const { W } = L;
  const leg = (x) => {
    tileFill(p.g, TEX.benchDk, x, L.underY, 8, L.floorY + 4 - L.underY, x, 0);
    p.vl(x, L.underY, L.floorY + 3, TONE.benchDk[6]); p.vl(x + 7, L.underY, L.floorY + 3, '#150b06');
    p.r(x - 1, L.floorY + 3, 10, 2, '#120a06');
  };
  leg(8); leg(W - 16); leg(Math.round(W / 2) - 4);
  // lower shelf with clutter
  const ly = L.floorY - 8;
  p.r(10, ly, W - 20, 3, TONE.benchDk[4]); p.hl(10, W - 11, ly, TONE.benchDk[6]); p.hl(10, W - 11, ly + 3, '#120a06');
  const R = rng(12);
  let x = 22, last = -1;
  while (x < W - 34) {
    let k = Math.floor(R() * 7);
    if (k === last) k = (k + 1) % 7;
    last = k;
    const c = [RAMP.red, RAMP.blue, RAMP.green, RAMP.gold][Math.floor(R() * 4)];
    if (k === 0) { p.box(x, ly - 8, 8, 8, c, { base: 2 }); p.r(x, ly - 9, 8, 1, RAMP.iron[3]); p.vl(x + 2, ly - 8, ly - 5, c[4]); x += 11; } // paint can with a drip
    else if (k === 1) { p.box(x, ly - 3, 22, 3, RAMP.pine, { base: 2 }); p.box(x + 3, ly - 6, 17, 3, RAMP.pine, { base: 3 }); p.box(x + 1, ly - 9, 12, 3, RAMP.pine, { base: 2 }); x += 25; } // lumber offcuts
    else if (k === 2) { p.el(x + 6, ly - 4, 6, 4, '#7a5a34'); p.el(x + 6, ly - 5, 5, 3, '#9a7a4a'); for (let i = 0; i < 4; i++) p.el(x + 3 + i * 2, ly - 8, 1.5, 1.5, RAMP.oak[3 + (i % 2)]); x += 14; } // basket of pinecones
    else if (k === 3) { p.box(x, ly - 7, 18, 7, RAMP.red, { base: 2 }); p.r(x + 6, ly - 9, 6, 2, RAMP.iron[3]); p.hl(x + 1, x + 16, ly - 5, RAMP.red[1]); x += 21; } // toolbox
    else if (k === 4) { for (let i = 0; i < 3; i++) p.el(x + 3 + i * 5, ly - 3, 2.5, 3, RAMP.brass[2 + i % 2]); x += 17; } // glass jars of nails
    else if (k === 5) { p.el(x + 7, ly - 4, 7, 4, '#d0b080'); p.el(x + 7, ly - 5, 5, 2, '#e8cc98'); x += 16; } // sawdust heap
    else x += 10;
  }
}

// warm lamp light, a soft vignette and a pool on the bench, quantised + dithered
function lightPass(p, L) {
  const { W, H } = L;
  const im = p.g.getImageData(0, 0, W, H), d = im.data;
  const bx = L.bulb.x, by = L.bulb.y;
  const tanA = Math.tan(0.58);
  const poolY = L.benchY + 6, poolRX = W * 0.36, poolRY = 9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let l = 0.68;
    const vx = (x / W - 0.5) * 2, vy = (y / H - 0.42) * 2;
    l -= 0.16 * (vx * vx * 0.8 + (vy < 0 ? vy * vy * 0.6 : vy * vy * 0.25));
    if (y > L.floorY) l += 0.08 * Math.max(0, 1 - Math.abs(vx) * 0.8);
    const dx = x - bx, dy = y - by;
    const dist = Math.hypot(dx, dy * 1.15);
    l += 0.55 * Math.pow(Math.max(0, 1 - dist / 64), 2);
    if (dy > 0 && y < L.underY) {
      const t = Math.abs(dx) / (dy * tanA + 8);
      if (t < 1) l += (t < 0.72 ? 1 : (1 - t) / 0.28) * 0.26 * Math.max(0, 1 - dy / (H * 0.95));
    }
    if (y >= L.benchY && y < L.apronY + 2) {
      const pd = Math.hypot((x - bx) / poolRX, (y - poolY) / poolRY);
      l += 0.22 * Math.max(0, 1 - pd);
    }
    const q = Math.floor(clamp(l, 0, 1.6) * 9 + bayer(x, y)) / 9;
    const warm = q > 0.75 ? (q - 0.75) : 0, cool = q < 0.62 ? (0.62 - q) : 0;
    d[i] = d[i] * q * (1 + warm * 0.35);
    d[i + 1] = d[i + 1] * q * (1 + warm * 0.12);
    d[i + 2] = d[i + 2] * q * (1 - warm * 0.4 + cool * 0.25);
  }
  p.g.putImageData(im, 0, 0);
}

// ---- dynamic props (canvases built per layout)
const LEVER_A0 = -0.32, LEVER_A1 = 1.92;
function propLever() {
  // handle drawn upright with the pivot at the centre (36, 36), then rotated into frames
  const base = new Pen(72, 72), I = RAMP.iron;
  base.box(35, 9, 4, 28, RAMP.pine, { base: 4 });
  base.vl(35, 11, 34, RAMP.pine[6]); base.vl(38, 11, 34, RAMP.pine[2]);
  base.el(37, 7, 6.5, 6.5, RAMP.red[2]); base.el(36.5, 6.5, 5.5, 5.5, RAMP.red[3]); base.el(35.5, 5.5, 3, 3, RAMP.red[5]); base.r(34, 3, 2, 2, RAMP.red[6]); base.p(34, 3, '#ffffff');
  base.r(34, 24, 6, 3, I[4]); base.hl(34, 39, 24, I[6]); base.hl(34, 39, 26, I[2]);
  base.outline(0.72);
  const frames = [];
  for (let k = 0; k < 10; k++) frames.push(rotNN(base.c, LEVER_A0 + (LEVER_A1 - LEVER_A0) * (k / 9), 36.5, 36.5));
  return frames;
}
function propLeverBase() {
  const p = new Pen(30, 28), I = RAMP.iron;
  p.box(2, 1, 26, 24, I, { base: 2 });
  p.r(4, 3, 22, 20, I[1]);
  p.el(15, 10, 8, 8, I[3]); p.el(15, 10, 6, 6, I[4]); p.el(13, 8, 2.5, 2.5, I[6]); p.el(15, 10, 2, 2, I[1]);
  for (const [x, y] of [[4, 3], [25, 3], [4, 22], [25, 22]]) { p.p(x, y, I[5]); }
  p.r(8, 19, 14, 2, RAMP.gold[3]); p.hl(8, 21, 19, RAMP.gold[5]);
  p.outline(0.72);
  return p.c;
}
function propSlate(w = 38, h = 22) {
  const p = new Pen(w + 2, h + 8), S = RAMP.slate, F = RAMP.oak;
  p.ln(w / 2 + 1, 1, 5, 8, '#c8b48a'); p.ln(w / 2 + 1, 1, w - 3, 8, '#c8b48a');
  p.p(w / 2 + 1, 0, RAMP.iron[5]);
  p.box(1, 7, w, h, F, { base: 4 });
  p.r(3, 9, w - 4, h - 4, S[3]);
  for (let j = 0; j < h - 4; j++) for (let i = 0; i < w - 4; i++) if (bayer(i * 2 + j, j + i) < 0.12) p.p(3 + i, 9 + j, S[4]);
  p.ln(5, h + 1, 12, h + 2, S[5]); // old chalk smudge
  p.hl(3, w, 9, S[1]);
  p.outline(0.6);
  return p.c;
}
function propRuler(w, frac, done) {
  const p = new Pen(w, 9), P = RAMP.gold;
  p.box(0, 0, w, 8, P, { base: 5 });
  p.hl(1, w - 2, 1, P[6]);
  const fx = Math.round((w - 2) * clamp(frac, 0, 1));
  if (fx > 0) {
    // the carved groove (burnt into the wood)
    p.r(1, 3, fx, 3, done ? '#6a8a2a' : RAMP.oak[2]);
    p.hl(1, fx, 3, done ? '#3f5a14' : RAMP.oak[0]); p.hl(1, fx, 5, done ? '#9ac04a' : RAMP.oak[4]);
  }
  for (let x = 2; x < w - 1; x += 2) {
    const big = (x - 2) % 10 === 0, mid = (x - 2) % 10 === 4;
    p.vl(x, 0, big ? 2 : mid ? 1 : 0, P[1]);
    p.vl(x, 7, big ? 5 : 7, P[1]);
  }
  if (!done && fx > 0 && fx < w - 2) { p.r(fx, 1, 2, 7, RAMP.red[4]); p.p(fx, 0, RAMP.red[6]); p.p(fx + 1, 8, '#2a1a14'); }
  p.hl(0, w - 1, 8, '#2a1a14');
  p.vl(0, 0, 8, P[2]); p.vl(w - 1, 0, 8, P[2]);
  return p.c;
}
function propMat(w) {
  // a little work board the job stands on, plus a vise at its left end
  const p = new Pen(w, 16), O = RAMP.oak, I = RAMP.iron;
  p.box(4, 8, w - 8, 3, O, { base: 4 });
  p.r(6, 11, w - 12, 2, O[1]);
  // vise
  p.box(0, 2, 5, 9, I, { base: 3 }); p.r(0, 2, 5, 1, I[5]); p.r(1, 11, 7, 3, I[2]);
  p.r(5, 5, 3, 2, I[4]); p.vl(8, 2, 9, I[5]); p.p(8, 1, I[3]); p.p(8, 10, I[3]);
  p.outline(0.7);
  return p.c;
}
function propCrate() {
  const p = new Pen(64, 44), P = RAMP.pine;
  // straw + things inside
  for (let i = 0; i < 40; i++) { const x = 8 + Math.floor(Math.random() * 46), y = 4 + Math.floor(Math.random() * 6); p.ln(x, y + 4, x + (i % 3) - 1, y, i % 2 ? '#e8c870' : '#c8a048'); }
  p.box(4, 10, 56, 34, P, { base: 3 });
  for (let y = 12; y < 44; y += 8) p.box(6, y, 52, 6, P, { base: y < 20 ? 5 : 4 });
  p.box(4, 10, 4, 34, P, { base: 4 }); p.box(56, 10, 4, 34, P, { base: 2 });
  p.ln(8, 42, 56, 13, P[2], 2); p.ln(8, 41, 56, 12, P[5]);
  for (const [x, y] of [[5, 11], [58, 11], [5, 41], [58, 41]]) p.p(x, y, RAMP.iron[5]);
  // a painted panel for the label
  p.r(14, 23, 36, 13, P[1]); p.r(15, 24, 34, 11, P[5]);
  p.outline(0.7);
  return p.c;
}
function propPlanks(nPl) {
  // a stack of planks on the floor (1 plank per ~5 wood, up to 7) with a log leaning on it
  const p = new Pen(66, 32), P = RAMP.pine, B = RAMP.bark;
  const n = clamp(nPl, 0, 7);
  if (!n) { for (let i = 0; i < 14; i++) p.p(8 + i * 3, 28 + (i % 2), i % 3 ? '#c99a5c' : '#a8763e'); p.outline(0.6); return p.c; }
  for (let i = 0; i < n; i++) {
    const y = 27 - i * 4, x = 3 + ((i * 5) % 7) - (i % 2 ? 2 : 0), w = 50 - (i % 3) * 3;
    p.box(x, y, w, 4, P, { base: 3 + (i % 2) });
    p.hl(x + 1, x + w - 2, y, P[6 - (i % 2)]);
    p.r(x + w - 3, y + 1, 3, 2, P[5]); p.p(x + w - 2, y + 1, P[2]); // end grain
    p.hl(x + 4 + i * 2, x + 9 + i * 2, y + 2, P[2]);
  }
  if (n >= 3) { p.ln(54, 30, 62, 30 - n * 3, B[3], 4); p.el(62, 29 - n * 3, 2.5, 2.5, P[5]); p.p(62, 29 - n * 3, P[3]); }
  p.outline(0.7);
  return p.c;
}
function propJar(jw, jh) {
  const p = new Pen(jw, jh), Gl = '#bfe4e8';
  // glass body
  p.r(3, 6, jw - 6, jh - 7, 'rgba(180,220,230,0.18)');
  p.vl(2, 7, jh - 3, Gl); p.vl(jw - 3, 7, jh - 3, '#7aa4ac'); p.hl(3, jw - 4, jh - 2, '#7aa4ac');
  p.p(2, 6, Gl); p.p(jw - 3, 6, '#7aa4ac');
  // lid (cloth + string)
  p.box(1, 1, jw - 2, 5, RAMP.red, { base: 3 });
  for (let i = 2; i < jw - 2; i += 3) p.p(i, 2, RAMP.red[6]);
  p.hl(1, jw - 2, 5, '#c8a46a'); p.p(jw - 3, 6, '#c8a46a'); p.p(jw - 3, 7, '#c8a46a');
  return p.c;
}
function propJarFront(jw, jh) {
  const p = new Pen(jw, jh);
  p.vl(4, 8, jh - 5, 'rgba(255,255,255,0.7)'); p.vl(5, 9, 12, 'rgba(255,255,255,0.45)');
  p.p(jw - 5, jh - 6, 'rgba(255,255,255,0.5)');
  return p.c;
}
// the hanging lamp: cord, green enamel shade, glowing bulb
function propLamp(cord) {
  const w = 40, h = cord + 18, p = new Pen(w, h), cx = 20;
  p.vl(cx, 0, cord, '#120a06'); p.vl(cx - 1, 0, cord, '#2a1a10');
  p.box(cx - 3, cord, 7, 3, RAMP.iron, { base: 3 });
  const sy = cord + 3;
  p.poly([[cx - 5, sy], [cx + 6, sy], [cx + 17, sy + 10], [cx - 16, sy + 10]], '#2f6a46');
  p.poly([[cx - 5, sy], [cx, sy], [cx - 7, sy + 10], [cx - 16, sy + 10]], '#4f9468');
  p.ln(cx - 4, sy + 1, cx - 13, sy + 9, '#7cc08e');
  p.hl(cx - 16, cx + 17, sy + 10, '#1e3e2a'); p.hl(cx - 15, cx + 16, sy + 11, '#ffe9a0');
  p.el(cx + 0.5, sy + 12, 5, 2.6, '#fff4c0'); p.el(cx + 0.5, sy + 11.5, 3, 1.4, '#ffffff');
  p.outline(0.7);
  return p.c;
}
// the beam of light under the lamp: 3 dithered bands, drawn per layout
function propLight(L) {
  const { W } = L, p = new Pen(W, L.H), bx = L.bulb.x + 0.5, by = L.bulb.y;
  const y1 = L.frontY + 2, tanA = Math.tan(0.5);
  const im = p.g.createImageData(W, L.H), d = im.data;
  for (let y = Math.floor(by); y < y1; y++) {
    const dy = y - by + 4, half = dy * tanA + 3;
    for (let x = Math.max(0, Math.floor(bx - half - 2)); x < Math.min(W, Math.ceil(bx + half + 2)); x++) {
      const t = Math.abs(x + 0.5 - bx) / half;
      if (t > 1) continue;
      const fall = 1 - Math.pow((y - by) / (y1 - by), 1.6) * 0.55;
      const v = (1 - t * t) * fall * 2.6 + 0.3;
      const lvl = Math.floor(v + bayer(x, y) - 0.5);
      if (lvl <= 0) continue;
      const o = (y * W + x) * 4;
      d[o] = 255; d[o + 1] = 210; d[o + 2] = 130; d[o + 3] = [0, 34, 60, 90][Math.min(3, lvl)];
    }
  }
  // bloom around the bulb
  for (let y = Math.floor(by - 16); y < by + 16; y++) for (let x = Math.floor(bx - 22); x < bx + 22; x++) {
    if (x < 0 || y < 0 || x >= W) continue;
    const r = Math.hypot((x + 0.5 - bx) / 22, (y + 0.5 - by) / 15);
    if (r > 1) continue;
    const lvl = Math.floor((1 - r) * 3.2 + bayer(x, y) - 0.3);
    if (lvl <= 0) continue;
    const o = (y * W + x) * 4;
    d[o] = 255; d[o + 1] = 226; d[o + 2] = 160; d[o + 3] = Math.max(d[o + 3], [0, 30, 56, 84][Math.min(3, lvl)]);
  }
  // the warm pool on the bench top
  for (let y = L.benchY; y < L.frontY + 4; y++) for (let x = 0; x < W; x++) {
    const pd = Math.hypot((x + 0.5 - bx) / (W * 0.3), (y + 0.5 - (L.benchY + 6)) / 9);
    if (pd < 1 && bayer(x, y) < (1 - pd) * 1.2) { const o = (y * W + x) * 4; d[o] = 255; d[o + 1] = 220; d[o + 2] = 150; d[o + 3] = Math.max(d[o + 3], 40); }
  }
  p.g.putImageData(im, 0, 0);
  return p.c;
}
// dithered golden halo behind a finished piece
let glowURL = '';
function propGlow() {
  if (glowURL) return glowURL;
  const p = new Pen(60, 60);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    const d = Math.hypot(x + 0.5 - 30, (y + 0.5 - 30) * 1.1) / 30;
    if (d > 1) continue;
    const b = bayer(x, y);
    if (b < (1 - d) * 0.55) p.p(x, y, d < 0.4 && b < (0.4 - d) * 1.4 ? '#fff6c0' : '#ffcf40');
  }
  // rays
  for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4 + 0.39; for (let r = 16; r < 29; r += 3) p.p(30 + Math.cos(an) * r, 30 + Math.sin(an) * r, '#fff2a0'); }
  glowURL = canvasURL(p.c);
  return glowURL;
}
let checkURL = '';
function propCheck() {
  if (checkURL) return checkURL;
  const p = new Pen(9, 9);
  p.el(4.5, 4.5, 4.5, 4.5, '#2f6a28'); p.el(4.5, 4.5, 3.5, 3.5, '#6cc04a');
  p.p(2, 4, '#ffffff'); p.p(3, 5, '#ffffff'); p.p(4, 6, '#ffffff'); p.p(5, 5, '#ffffff'); p.p(6, 4, '#ffffff'); p.p(7, 3, '#ffffff');
  checkURL = canvasURL(p.c);
  return checkURL;
}
function propSign() {
  const p = new Pen(52, 36), O = RAMP.oak;
  p.ln(26, 0, 6, 12, '#c8b48a'); p.ln(26, 0, 46, 12, '#c8b48a');
  p.p(26, 0, RAMP.iron[5]);
  p.box(2, 11, 48, 21, O, { base: 4 });
  p.grain(4, 13, 44, 17, O[2], 5, 0.3);
  p.r(4, 13, 44, 17, 'rgba(0,0,0,0)');
  p.p(6, 12, RAMP.iron[5]); p.p(45, 12, RAMP.iron[5]);
  p.outline(0.72);
  return p.c;
}
function blueprintPaper(w, h) {
  // the blueprint paper behind the unrolled plan: blue, grid, worn edges
  const p = new Pen(w, h), B = RAMP.blue;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = bayer(x * 3 + y, y * 5 + x);
    let c = n < 0.12 ? B[2] : B[3];
    if (x % 8 === 0 || y % 8 === 0) c = (x % 32 === 0 || y % 32 === 0) ? B[5] : B[4];
    p.p(x, y, c);
  }
  return p;
}

// ===========================================================================
// the view
// ===========================================================================
const DEFAULT_CHAT = ['Tok-tok! What are we building?', 'Measure twice, cut once!', 'Good things take time.'];

export function openWorkshop(root, opts = {}) {
  root = root || document.body;
  const o = opts;
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const sfx = (n, x) => { try { o.sfx?.(n, x); } catch { /* optional */ } };
  const S = {
    wood: +o.wood || 0,
    materials: o.materials || {},
    recipes: o.recipes || [],
    jobs: o.jobs || [],
    slots: Math.max(1, o.slots || 3),
    chat: (o.chat && o.chat.length ? o.chat : DEFAULT_CHAT).slice(),
  };
  const V = { ready: false, open: null, busy: false, closed: false, seen: new Set(), dinged: new Set(), collecting: new Set(), chatI: 0, lastTalk: 0, dirty: 0 };

  // ---------------------------------------------------------------- DOM
  const el = document.createElement('div');
  el.className = 'ws ws-loading';
  el.tabIndex = -1;
  el.innerHTML = '<div class="ws-stage"></div><div class="ws-dark"></div>';
  const stage = el.querySelector('.ws-stage');
  root.appendChild(el);
  const chipBox = document.createElement('div');
  chipBox.className = 'ws-chip';
  let L = null, u = 2;
  const E = {}; // element refs, rebuilt per layout
  const fx = []; // particles

  // ---------------------------------------------------------------- helpers
  const recipe = (id) => S.recipes.find((r) => r.id === id);
  const crafts = () => S.recipes.filter((r) => r.kind !== 'repair');
  const repairs = () => S.recipes.filter((r) => r.kind === 'repair');
  const haveOf = (k) => (k === 'wood' ? S.wood : S.materials[k]?.have ?? 0);
  const costRows = (r) => Object.entries(r.cost || {}).filter(([k]) => !(r.ruin && k === r.ruin) && !k.startsWith('ruin_')).sort(([a], [b]) => (a === 'wood' ? -1 : b === 'wood' ? 1 : 0));
  const canAfford = (r) => costRows(r).every(([k, n]) => haveOf(k) >= n);
  const freeSlots = () => S.slots - S.jobs.filter((j) => !V.collecting.has(j.id)).length;
  // material icons: the game's sprite when it has one, else a built-in one, else whatever icon() gives
  function iconHTML(name, scale = 1) {
    const own = () => { const c = matArt(name); return c ? `<img class="ws-ic" src="${canvasURL(c)}" width="${c.width * scale}" height="${c.height * scale}" alt="">` : ''; };
    if (MAT_ART[name] && (name === 'wood' || name === 'clock' || !hasSprite(name))) return own();
    let h = '';
    try { h = o.icon?.(name, scale) || ''; } catch { h = ''; }
    return h || own() || '<i class="ws-ic-x">?</i>';
  }
  // art() may hand back a canvas or an <img> (decoded later: redraw the plans when it arrives)
  function asCanvas(x, key) {
    if (!x) return null;
    if (x instanceof HTMLCanvasElement) return x;
    if (typeof HTMLImageElement !== 'undefined' && x instanceof HTMLImageElement) {
      if (x.complete && x.naturalWidth) {
        const c = newCanvas(x.naturalWidth, x.naturalHeight);
        c.getContext('2d', { willReadFrequently: true }).drawImage(x, 0, 0);
        return c;
      }
      x.addEventListener('load', () => {
        if (V.closed) return;
        picCache.delete(key);
        for (const k of [...sheetCache.keys()]) if (k.startsWith(key + '|')) sheetCache.delete(k);
        V.dirty = Math.max(V.dirty, 1);
        if (!V.busy) flushDirty();
      }, { once: true });
    }
    return null;
  }
  // the item picture as a canvas: built-in pixel art for the v14 ids (drawn for this room; artFirst flips it),
  // else art(id) -> recipe.icon() -> the icon sprite -> a crate
  const picCache = new Map(), sheetCache = new Map();
  function picture(id, r = recipe(id)) {
    if (picCache.has(id)) return picCache.get(id);
    const own = workshopArt(id);
    let c = own && !o.artFirst ? own : null;
    if (!c) { try { c = asCanvas(o.art?.(id), id); } catch { c = null; } }
    if (!c && r && typeof r.icon === 'function') { try { c = asCanvas(r.icon(), id); } catch { c = null; } }
    if (!c) c = own;
    if (!c && r && typeof r.icon === 'string' && hasSprite(r.icon)) c = spriteCanvas(r.icon, 1);
    if (!c) c = workshopArt('wd_crate');
    c = fitCanvas(c, 44, 44);
    picCache.set(id, c);
    return c;
  }
  function brokenPicture(r) {
    const key = '~ruin~' + r.id;
    if (picCache.has(key)) return picCache.get(key);
    let c = null;
    if (r.ruin) {
      const own = workshopArt(r.ruin);
      c = own && !o.artFirst ? own : null;
      if (!c) { try { c = asCanvas(o.art?.(r.ruin), key); } catch { c = null; } }
      if (!c) c = own;
    }
    if (!c) c = ruinify(picture(r.id, r), hashStr(r.id) % 97);
    c = fitCanvas(c, 44, 40);
    picCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- layout + build
  function measure() {
    const rw = el.clientWidth || root.clientWidth || innerWidth, rh = el.clientHeight || root.clientHeight || innerHeight;
    u = Math.max(1, Math.min(Math.floor(rw / 400), Math.floor(rh / 300)));
    const W = Math.floor(rw / u), H = Math.floor(rh / u);
    return { rw, rh, W, H };
  }
  function build() {
    const m = measure();
    L = computeLayout(m.W, m.H, { craft: crafts().length, repair: repairs().length, mat: Object.keys(S.materials).length, slots: S.slots });
    stage.style.width = `${L.W}px`; stage.style.height = `${L.H}px`;
    stage.style.transform = `translate(${Math.floor((m.rw - L.W * u) / 2)}px, ${Math.floor((m.rh - L.H * u) / 2)}px) scale(${u})`;
    el.style.setProperty('--u', u);
    stage.textContent = '';
    for (const k of Object.keys(E)) delete E[k];
    const bg = paintScene(L);
    bg.className = 'ws-bg';
    stage.appendChild(bg);
    E.bg = bg;
    buildBoard(); buildJars(); buildRepairs(); buildChip(); buildWood(); buildSlots(); buildLever(); buildCrate(); buildSign();
    // the lamp hangs in front of the board; its beam lights the board and the bench
    const light = propLight(L); light.className = 'ws-light'; stage.appendChild(light);
    const cord = L.lamp.shadeY - L.lamp.top;
    const lamp = propLamp(cord); lamp.className = 'ws-lamp';
    place(lamp, L.lamp.x - 20, L.lamp.top);
    stage.appendChild(lamp);
    // only the shade itself is clickable (the canvas box overlaps the plans)
    const hit = div('ws-lamp-hit', stage);
    place(hit, L.lamp.x - 16, L.lamp.shadeY + 3, 34, 12);
    hit.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', { volume: 0.4, pitch: 1.4 }); once(light, 'ws-flick'); });
    E.light = light;
    E.planLayer = div('ws-planlayer', stage);
    E.bubble = div('ws-bubble', stage);
    E.bubble.innerHTML = '<span class="ws-bubble-t"></span><i class="ws-bubble-tail"></i>';
    E.fx = newCanvas(L.W, L.H); E.fx.className = 'ws-fx'; stage.appendChild(E.fx);
    E.fxg = E.fx.getContext('2d');
    seedMotes();
    if (V.open) { const id = V.open; V.open = null; openPlan(id, { instant: true }); }
  }
  function div(cls, parent, html) {
    const d = document.createElement('div');
    d.className = cls;
    if (html != null) d.innerHTML = html;
    if (parent) parent.appendChild(d);
    return d;
  }
  function place(node, x, y, w, h) {
    node.style.left = `${Math.round(x)}px`; node.style.top = `${Math.round(y)}px`;
    if (w != null) node.style.width = `${Math.round(w)}px`;
    if (h != null) node.style.height = `${Math.round(h)}px`;
  }

  // ---------------------------------------------------------------- corkboard of plans
  function sheetCanvas(r, sw, sh) {
    const key = `${r.id}|${sw}x${sh}|${r.locked ? 1 : 0}`;
    if (sheetCache.has(key)) return sheetCache.get(key);
    const p = new Pen(sw, sh), B = RAMP.blue, seed = hashStr(r.id);
    const locked = !!r.locked;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let c = bayer(x * 3 + y, y * 5 + x) < 0.1 ? B[2] : B[3];
      if (x % 6 === 2 || y % 6 === 2) c = B[4];
      const e = Math.min(x, y, sw - 1 - x, sh - 1 - y);
      if (e < 2 && bayer(x, y) < 0.5) c = B[2];
      p.p(x, y, c);
    }
    // dog-eared corner + curl shadow
    const R = rng(seed);
    if (R() < 0.6) { const s = 5; for (let j = 0; j < s; j++) p.g.clearRect(sw - s + j, sh - 1 - j, s - j, 1); p.poly([[sw - s, sh], [sw, sh - s], [sw - s, sh - s]], B[5]); p.ln(sw - s, sh - 1, sw - 1, sh - s, B[1]); }
    p.g.clearRect(sw - 1, 0, 1, 1); p.g.clearRect(0, sh - 1, 1, 1);
    // the item, as a line drawing
    const inner = fitCanvas(picture(r.id, r), sw - 8, sh - 14, false);
    const line = blueprintify(inner, !locked);
    p.g.drawImage(line, Math.round((sw - line.width) / 2), Math.round(6 + (sh - 14 - line.height) / 2 + 1));
    // title strip: little "dimension" ticks at the bottom
    p.hl(4, sw - 5, sh - 5, B[5]); p.vl(4, sh - 7, sh - 3, B[5]); p.vl(sw - 5, sh - 7, sh - 3, B[5]);
    if (locked) {
      p.shade(0, 0, sw, sh, '#1a2440', 0.6, 0.55);
      const lx = Math.round(sw / 2) - 4, ly = Math.round(sh / 2) - 3;
      p.ring(lx + 4, ly - 1, 3, 3.5, RAMP.iron[5]); p.box(lx, ly, 9, 7, RAMP.brass, { base: 4 }); p.r(lx + 4, ly + 2, 1, 3, RAMP.brass[0]);
    }
    p.outline(0.6, [12, 20, 40]);
    sheetCache.set(key, p.c);
    return p.c;
  }
  function pinCanvas(col) {
    const p = new Pen(6, 7), C = RAMP[col] || RAMP.red;
    p.el(3, 3, 2.5, 2.5, C[3]); p.p(2, 2, C[6]); p.p(3, 2, C[5]); p.vl(3, 5, 6, RAMP.iron[4]);
    p.outline(0.7);
    return p.c;
  }
  function buildBoard() {
    const B = L.board;
    const box = div('ws-board', stage);
    place(box, B.x, B.y, B.w, B.h);
    E.board = box;
    // the "PLANS" plaque on the frame
    const plaque = div('ws-plaque', box, '<span>PLANS</span>');
    place(plaque, Math.max(6, Math.round(B.w * 0.2) - 26), -9, 52, 14);
    const list = crafts();
    const pins = ['red', 'gold', 'green', 'blue', 'pink'];
    E.plans = new Map();
    list.forEach((r, i) => {
      const col = i % B.cols, row = Math.floor(i / B.cols);
      const nInRow = Math.min(B.cols, list.length - row * B.cols);
      const rowOff = ((B.cols - nInRow) * (B.sw + B.gx)) / 2;
      const seed = hashStr(r.id);
      const x = B.pad + rowOff + col * (B.sw + B.gx) + ((seed % 3) - 1);
      const y = B.pad + 3 + row * (B.sh + B.gy) + ((seed >> 3) % 3) - 1;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ws-plan' + (r.locked ? ' ws-locked' : '') + (canAfford(r) && !r.locked ? ' ws-can' : '');
      b.dataset.id = r.id;
      b.setAttribute('aria-label', r.name + (r.locked ? ' (locked)' : ''));
      b.style.setProperty('--tilt', `${((seed % 7) - 3) * 0.6}deg`);
      b.style.setProperty('--d', `${i * 60}ms`);
      place(b, x, y, B.sw, B.sh);
      b.appendChild(cloneCanvas(sheetCanvas(r, B.sw, B.sh), 'ws-plan-c'));
      const pin = cloneCanvas(pinCanvas(pins[seed % pins.length]), 'ws-pin');
      b.appendChild(pin);
      const tag = div('ws-tag' + (row === 0 ? ' ws-tag-below' : ''), b, esc(r.name));
      tag.style.left = `${Math.round(B.sw / 2)}px`;
      if (canAfford(r) && !r.locked) okSticker(b);
      b.addEventListener('pointerenter', () => { if (!V.busy) sfx('hover', { volume: 0.3, pitch: 1.2 + (i % 4) * 0.08 }); });
      b.addEventListener('click', (e) => { e.stopPropagation(); onPlanClick(r.id, b); });
      box.appendChild(b);
      E.plans.set(r.id, b);
    });
  }
  function okSticker(b) { const d = div('ws-ok', b); d.style.backgroundImage = `url(${propCheck()})`; return d; }
  function wiggleBoard() {
    let i = 0;
    for (const b of E.plans?.values() || []) { const k = i++; setTimeout(() => once(b, 'ws-wig'), k * 50); }
  }

  // ---------------------------------------------------------------- jars of forest finds
  function buildJars() {
    const J = L.jars, box = div('ws-jars', stage);
    E.jars = new Map();
    const jar = propJar(J.jw, J.jh), front = propJarFront(J.jw, J.jh);
    Object.entries(S.materials).forEach(([id, m], i) => {
      const col = i % J.cols, row = Math.floor(i / J.cols);
      const cw = Math.min(J.jw + 8, Math.floor(J.w / J.cols)), x0 = J.x + Math.floor((J.w - cw * J.cols) / 2);
      const x = x0 + col * cw + Math.floor((cw - J.jw) / 2);
      const y = J.shelves[row] - J.jh;
      const d = div('ws-jar', box);
      d.title = m.name || id;
      place(d, x, y, J.jw, J.jh + 12);
      d.appendChild(cloneCanvas(jar, 'ws-jar-b'));
      div('ws-jar-i', d, iconHTML(m.icon || id, 1));
      d.appendChild(cloneCanvas(front, 'ws-jar-f'));
      const tag = div('ws-jar-n', d, `<span>${fmtN(m.have)}</span>`);
      tag.style.top = `${J.jh + 3}px`;
      tag.classList.toggle('ws-zero', !m.have);
      d.addEventListener('click', () => {
        const mm = S.materials[id] || m;
        sfx('click', { volume: 0.5, pitch: 1.3 }); bounce(d);
        say(`${mm.name || id}: ${fmtN(mm.have)}. ${mm.have ? 'Nice haul!' : 'Look around the forest!'}`);
      });
      E.jars.set(id, { d, n: tag.firstChild, have: m.have });
    });
  }
  const fmtN = (n) => { n = Math.floor(+n || 0); return n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n); };

  // ---------------------------------------------------------------- repair pile (floor, left)
  function buildRepairs() {
    const list = repairs();
    const RP = L.repairs, box = div('ws-repairs', stage);
    E.repairs = new Map();
    if (!list.length) return;
    const sign = div('ws-rsign', box, '<span>REPAIRS</span>');
    place(sign, RP.x, L.H - 44, 48, 40);
    list.forEach((r, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const locked = !!r.locked;
      b.className = 'ws-ruin' + (locked ? ' ws-locked' : '');
      b.setAttribute('aria-label', `Repair: ${r.ruinName || r.name}`);
      const x = RP.x + 46 + i * 40, y = L.H - 47 + ((i % 2) ? 1 : -1);
      place(b, x, y, 40, 44);
      const pic = brokenPicture(r);
      const c = cloneCanvas(pic, 'ws-ruin-c');
      c.style.left = `${Math.round((40 - pic.width) / 2)}px`;
      c.style.top = `${44 - pic.height - 2}px`;
      b.appendChild(c);
      if (locked) div('ws-ruin-q', b, '?');
      else div('ws-ruin-tag', b, '!');
      b.addEventListener('pointerenter', () => sfx('hover', { volume: 0.25, pitch: 0.8 }));
      b.addEventListener('click', (e) => { e.stopPropagation(); onPlanClick(r.id, b); });
      box.appendChild(b);
      E.repairs.set(r.id, b);
    });
  }

  // ---------------------------------------------------------------- Chip
  let chipFrames = null;
  function buildChip() {
    if (!chipFrames) chipFrames = { body: chipBody(), heads: [chipHead(false, false), chipHead(false, true), chipHead(true, false), chipHead(true, true)] };
    chipBox.textContent = '';
    chipBox.className = 'ws-chip';
    place(chipBox, L.chip.x, L.chip.y, L.chip.w, L.chip.h);
    stage.appendChild(chipBox);
    if (o.chipEl) {
      chipBox.classList.add('ws-chip-ext');
      chipBox.appendChild(o.chipEl);
    } else {
      const body = cloneCanvas(chipFrames.body, 'ws-chip-body');
      const head = cloneCanvas(chipFrames.heads[0], 'ws-chip-head');
      chipBox.append(body, head);
      E.chipHead = head;
    }
    chipBox.onclick = (e) => { e.stopPropagation(); talk(); };
    E.chip = chipBox;
  }
  let chipFace = { blink: false, open: false };
  function setChipFace(blink, open) {
    if (!E.chipHead || (chipFace.blink === blink && chipFace.open === open)) return;
    chipFace = { blink, open };
    E.chipHead.getContext('2d').clearRect(0, 0, CHIP_W, CHIP_HEAD_H);
    E.chipHead.getContext('2d').drawImage(chipFrames.heads[(blink ? 2 : 0) + (open ? 1 : 0)], 0, 0);
  }
  function peck(n = 3) {
    if (!E.chipHead) return;
    E.chipHead.style.setProperty('--n', n);
    once(E.chipHead, 'ws-peck');
    for (let i = 0; i < n; i++) setTimeout(() => { if (!V.closed) { sfx('tock', { volume: 0.5, pitch: 0.75 + Math.random() * 0.1 }); puff(L.chip.x + 82, L.chip.y + 40, 2, 'dust'); } }, 90 + i * 140);
  }
  function hop() { once(E.chip, 'ws-hop'); }

  // ---------------------------------------------------------------- speech bubble
  let typeT = null, hideT = null;
  function say(text, o2 = {}) {
    if (!text) return;
    if (!E.bubble) { V.pendingSay = text; return; }
    text = String(text);
    const t = E.bubble.querySelector('.ws-bubble-t');
    clearInterval(typeT); clearTimeout(hideT);
    const maxW = clamp(L.board.x - 8, 104, 190); // stay off the corkboard where possible
    E.bubble.style.maxWidth = `${maxW}px`;
    t.textContent = text;
    E.bubble.classList.remove('on'); void E.bubble.offsetWidth;
    E.bubble.style.left = '4px';
    E.bubble.style.bottom = `${L.H - L.chip.y - 6}px`;
    E.bubble.style.setProperty('--tail', `${clamp(L.chip.x + 44 - 4, 14, maxW - 20)}px`);
    E.bubble.classList.add('on');
    // type it out, beak flapping
    const chars = [...text];
    let k = 0;
    t.textContent = '';
    const ghost = document.createElement('span'); ghost.className = 'ws-bubble-ghost'; ghost.textContent = text;
    t.appendChild(document.createTextNode('')); t.appendChild(ghost);
    const step = () => {
      k = Math.min(chars.length, k + 2);
      t.firstChild.textContent = chars.slice(0, k).join('');
      ghost.textContent = chars.slice(k).join('');
      setChipFace(chipFace.blink, k < chars.length && (k >> 1) % 2 === 0);
      if (k >= chars.length) { clearInterval(typeT); setChipFace(false, false); }
    };
    typeT = setInterval(step, 30);
    V.lastTalk = performance.now();
    sfx('bird_chirp', { volume: 0.35, pitch: 1.1 + Math.random() * 0.3 });
    try { o.onTalk?.(text); } catch { /* optional */ }
    hideT = setTimeout(() => E.bubble?.classList.remove('on'), o2.dur || clamp(1800 + text.length * 70, 3200, 8000));
  }
  function talk() {
    hop();
    const line = S.chat[V.chatI % S.chat.length];
    V.chatI++;
    say(line);
    if (Math.random() < 0.5) setTimeout(() => peck(2), 500);
  }

  // ---------------------------------------------------------------- wood stack
  function buildWood() {
    const d = div('ws-wood', stage);
    place(d, L.wood.x, L.wood.y, L.wood.w, L.wood.h);
    d.title = 'Wood';
    d.appendChild(cloneCanvas(propPlanks(Math.ceil(S.wood / 6)), 'ws-wood-c'));
    const tag = div('ws-wood-n', d, `<span>${fmtN(S.wood)}</span>`);
    d.addEventListener('click', () => { sfx('tock', { volume: 0.5, pitch: 0.9 }); bounce(d); say(S.wood ? `${S.wood} wood. Chop trees and grab fallen logs for more!` : 'No wood! Chop trees and pick up fallen logs.'); });
    E.wood = { d, n: tag.firstChild, shown: S.wood, c: d.firstChild };
  }
  function updateWood() {
    if (!E.wood) return;
    const w = E.wood;
    if (w.shown === S.wood) return;
    const from = w.shown, to = S.wood;
    w.shown = to;
    const c = propPlanks(Math.ceil(to / 6));
    w.c.getContext('2d').clearRect(0, 0, w.c.width, w.c.height);
    w.c.getContext('2d').drawImage(c, 0, 0);
    // tick the number toward the new value
    const t0 = performance.now(), dur = 500;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      w.n.textContent = fmtN(Math.round(lerp(from, to, k)));
      if (k < 1 && !V.closed) requestAnimationFrame(tick);
    };
    tick();
    bounce(w.d);
  }
  // restart a one-shot CSS animation class, and drop it when done so idle loops resume
  function once(node, cls) {
    if (!node) return;
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    const off = (e) => { if (e.target === node) { node.classList.remove(cls); node.removeEventListener('animationend', off); } };
    node.addEventListener('animationend', off);
  }
  const bounce = (node) => once(node, 'ws-bounce');

  // ---------------------------------------------------------------- job slots
  E.slotEls = [];
  function buildSlots() {
    E.slotEls = [];
    const mats = new Map();
    L.slots.forEach((s, i) => {
      const box = div('ws-slot', stage);
      const w = Math.min(64, s.w - 4);
      place(box, s.cx - 32, L.benchY - 40, 64, 48);
      // work board + vise
      if (!mats.has(w)) mats.set(w, propMat(w));
      const mat = cloneCanvas(mats.get(w), 'ws-mat');
      mat.style.left = `${32 - Math.round(w / 2)}px`;
      box.appendChild(mat);
      const item = div('ws-item', box);
      const rw = Math.min(56, s.w - 8);
      const ruler = newCanvas(rw, 9); ruler.className = 'ws-ruler';
      place(ruler, s.cx - Math.round(rw / 2), L.frontY - 1);
      stage.appendChild(ruler);
      const slate = cloneCanvas(propSlate(), 'ws-slate');
      const sl = div('ws-slatebox', stage);
      place(sl, s.cx - 20, L.apronY + 4, 40, 30);
      sl.appendChild(slate);
      const txt = div('ws-chalk', sl, '');
      const ghost = div('ws-ghostbox', box);
      ghost.innerHTML = '<span>+</span>';
      box.addEventListener('click', (e) => { e.stopPropagation(); onSlotClick(i); });
      sl.addEventListener('click', (e) => { e.stopPropagation(); onSlotClick(i); });
      E.slotEls.push({ i, box, item, ruler, rw, sl, txt, ghost, job: null, frac: -1, text: '', state: '' });
    });
    if (!V.slotJob || V.slotJob.length !== L.slots.length) V.slotJob = new Array(L.slots.length).fill(null);
    syncSlots(true);
  }
  // keep each job in the slot it started in
  function assignSlots() {
    const live = S.jobs.filter((j) => !V.collecting.has(j.id));
    const ids = new Set(live.map((j) => j.id));
    const slots = V.slotJob || [];
    for (let i = 0; i < slots.length; i++) if (slots[i] != null && !ids.has(slots[i])) slots[i] = null;
    for (const j of live) {
      if (slots.includes(j.id)) continue;
      // a freshly crafted job goes to the bench its plan flew to
      const k = V.reserve != null && slots[V.reserve] == null ? V.reserve : slots.indexOf(null);
      V.reserve = null;
      if (k >= 0) slots[k] = j.id;
    }
    return slots;
  }
  function syncSlots(initial = false) {
    const slots = assignSlots();
    E.slotEls.forEach((s, i) => {
      const id = slots[i];
      const job = id != null ? S.jobs.find((j) => j.id === id) : null;
      if ((s.job?.id ?? null) === (job?.id ?? null)) { s.job = job; return; }
      s.job = job;
      s.frac = -1; s.text = ''; s.state = '';
      s.item.textContent = '';
      s.box.classList.remove('ws-run', 'ws-done', 'ws-empty');
      if (!job) { s.box.classList.add('ws-empty'); updateSlot(s); return; }
      const r = recipe(job.recipeId) || { id: job.recipeId, name: job.name };
      const pic = picture(job.recipeId, r);
      const ox = Math.round((64 - pic.width) / 2), oy = 40 - pic.height;
      const glow = div('ws-glow', s.item);
      glow.style.backgroundImage = `url(${propGlow()})`;
      glow.style.left = `${Math.round(32 - 30)}px`; glow.style.top = `${Math.round(oy + pic.height / 2 - 30)}px`;
      // the unbuilt part: a raw-wood ghost, or (for a repair) the broken antique being restored bottom-up
      const full = cloneCanvas(pic, 'ws-full');
      if (r.kind === 'repair' || job.kind === 'repair') {
        const bp = brokenPicture(r);
        const gh = cloneCanvas(bp, 'ws-ghost ws-ghost-ruin');
        gh.style.left = `${Math.round((64 - bp.width) / 2)}px`; gh.style.top = `${40 - bp.height}px`;
        s.item.appendChild(gh);
        s.ghost = gh; s.ghostTop = 40 - bp.height; s.ghostH = bp.height;
      } else {
        const gh = ghostify(pic); gh.className = 'ws-ghost';
        gh.style.left = `${ox}px`; gh.style.top = `${oy}px`;
        s.item.appendChild(gh);
        s.ghost = gh; s.ghostTop = oy; s.ghostH = pic.height;
      }
      full.style.left = `${ox}px`; full.style.top = `${oy}px`;
      s.item.appendChild(full);
      const tool = div('ws-tool', s.item);
      tool.appendChild(cloneCanvas(prop('saw'), 'ws-saw'));
      tool.appendChild(cloneCanvas(prop('hammer'), 'ws-hammer'));
      s.pic = pic; s.ox = ox; s.oy = oy; s.full = full; s.tool = tool;
      s.toolT = Math.random() * 4;
      const fresh = !initial && !V.seen.has(job.id);
      V.seen.add(job.id);
      if (fresh) {
        s.item.classList.add('ws-new');
        puff(L.slots[i].cx, L.benchY - 10, 14, 'dust');
        sfx('pop_in', { volume: 0.6 });
        setTimeout(() => s.item.classList.remove('ws-new'), 700);
      }
      updateSlot(s);
    });
  }
  function jobFrac(job) {
    const t = now();
    if (job.done || t >= job.end) return 1;
    return clamp((t - job.start) / Math.max(1, job.end - job.start), 0, 1);
  }
  function updateSlot(s) {
    const job = s.job;
    let state = 'empty', frac = 0, text = 'FREE';
    if (job) {
      frac = jobFrac(job);
      state = frac >= 1 ? 'done' : 'run';
      text = state === 'done' ? 'DONE!' : fmtClock((job.end - now()) / 1000);
    }
    if (state !== s.state) {
      const was = s.state;
      s.state = state;
      s.box.classList.toggle('ws-run', state === 'run');
      s.box.classList.toggle('ws-done', state === 'done');
      s.box.classList.toggle('ws-empty', state === 'empty');
      s.sl.classList.toggle('ws-slate-done', state === 'done');
      if (state === 'done' && job && !V.dinged.has(job.id)) {
        V.dinged.add(job.id);
        const delay = was === 'run' ? 0 : 500 + s.i * 260;
        setTimeout(() => ding(s), delay);
      }
    }
    if (text !== s.text) { s.text = text; s.txt.textContent = text; }
    const fy = job && s.pic ? Math.round(s.pic.height * (1 - frac)) : 0;
    if (job && fy !== s.fy) {
      s.fy = fy;
      s.full.style.clipPath = `inset(${fy}px 0 0 0)`;
      // the unbuilt layer only shows above the line
      if (s.ghost) s.ghost.style.clipPath = `inset(0 0 ${Math.max(0, s.ghostH - (s.oy + fy - s.ghostTop))}px 0)`;
      s.tool.style.top = `${s.oy + fy - 6}px`;
    }
    const rf = Math.round((s.rw - 2) * frac);
    if (rf !== s.frac) {
      s.frac = rf;
      const c = propRuler(s.rw, frac, state === 'done');
      const g = s.ruler.getContext('2d');
      g.clearRect(0, 0, s.rw, 9); g.drawImage(c, 0, 0);
    }
  }
  function ding(s) {
    if (V.closed || !s.job) return;
    sfx('ding', { volume: 0.7 });
    const cx = L.slots[s.i].cx, cy = L.benchY - 30;
    comic('DING!', cx, L.benchY - 52, 'ding');
    sparkle(cx, cy, 14);
    if (performance.now() - V.lastTalk > 2500) say(`Ding! Your ${s.job.name || recipe(s.job.recipeId)?.name || 'order'} is ready. Tap it!`);
  }
  function onSlotClick(i) {
    const s = E.slotEls[i];
    if (!s) return;
    if (!s.job) { sfx('chalk_tap', { volume: 0.5 }); say(V.open ? 'Pull the lever to build it!' : 'Free bench! Pick a plan off the board.'); wiggleBoard(); return; }
    if (s.state === 'done') { collect(s); return; }
    sfx('tock', { volume: 0.5, pitch: 1.1 });
    bounce(s.item);
    const left = (s.job.end - now()) / 1000;
    say(`${s.job.name || recipe(s.job.recipeId)?.name || 'It'}: ${fmtTime(left)} to go. Good things take time!`);
  }
  function collect(s) {
    const job = s.job;
    if (!job || V.collecting.has(job.id)) return;
    let res;
    try { res = o.onCollect?.(job.id); } catch (e) { console.error(e); res = { ok: false, msg: 'Oops!' }; }
    const ok = res == null ? true : !!res.ok;
    if (!ok) {
      sfx('error', { volume: 0.5 });
      once(s.item, 'ws-shake');
      if (res?.msg) say(res.msg);
      return;
    }
    V.collecting.add(job.id);
    // the piece hops off the bench and into the crate
    const flyer = cloneCanvas(s.pic, 'ws-flyer');
    const x0 = L.slots[s.i].cx - 32 + s.ox, y0 = L.benchY - 40 + s.oy;
    const x1 = L.crate.x + L.crate.w / 2 - s.pic.width / 2, y1 = L.crate.y + 6 - s.pic.height / 2;
    place(flyer, x0, y0);
    stage.appendChild(flyer);
    s.item.style.visibility = 'hidden';
    sfx('whoosh', { volume: 0.5, pitch: 1.2 });
    const peak = Math.min(y0, y1) - 50;
    const kf = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = lerp(x0, x1, t), y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * peak + t * t * y1;
      const sq = k === 0 ? 'scale(1.1, .85)' : k === 1 ? 'scale(.9, 1.15)' : `scale(${lerp(1, 0.7, t)})`;
      kf.push({ transform: `translate(${Math.round(x - x0)}px, ${Math.round(y - y0)}px) rotate(${Math.round(t * 2) * 90 * (x1 > x0 ? 1 : -1) * 0.25}deg) ${sq}`, offset: t });
    }
    const a = anim(flyer, kf, { duration: 680, easing: 'linear', fill: 'forwards' });
    const land = () => {
      flyer.remove();
      if (V.closed) return;
      sfx('crate_drop', { volume: 0.7 });
      setTimeout(() => sfx('ding', { volume: 0.5, pitch: 1.25 }), 80);
      bounce(E.crate);
      confetti(L.crate.x + L.crate.w / 2, L.crate.y + 4, 70);
      sparkle(L.crate.x + L.crate.w / 2, L.crate.y - 6, 10);
      comic('+1', L.crate.x + L.crate.w / 2, L.crate.y - 14, 'plus');
      V.collecting.delete(job.id);
      S.jobs = S.jobs.filter((j) => j.id !== job.id);
      s.item.style.visibility = '';
      syncSlots();
      if (res?.msg) say(res.msg); else say('All yours! Find it in the Woodwork tab.');
      hop();
    };
    if (a) a.finished.then(land, land); else land();
  }

  // ---------------------------------------------------------------- lever ("BUILD IT!")
  let leverFrames = null;
  function buildLever() {
    if (!leverFrames) leverFrames = propLever();
    const lv = div('ws-lever', stage);
    const P = L.lever;
    place(lv, P.px - 36, P.py - 36, 72, 72);
    const base = cloneCanvas(propLeverBase(), 'ws-lever-base');
    const bw = div('ws-leverbase', stage);
    place(bw, P.px - 15, P.py - 10, 30, 28);
    bw.appendChild(base);
    const handle = newCanvas(72, 72); handle.className = 'ws-lever-h';
    lv.appendChild(handle);
    const plaque = div('ws-lplaque', stage, '<span>BUILD IT!</span>');
    place(plaque, P.px - 29, P.py + 20, 58, 16);
    E.lever = { lv, handle, plaque, frame: -1, ang: 0 };
    setLever(0);
    let drag = null;
    const toFrame = (ev) => {
      const r = lv.getBoundingClientRect();
      const px = r.left + r.width / 2, py = r.top + r.height / 2;
      const a = Math.atan2(ev.clientX - px, -(ev.clientY - py));
      return clamp((a - LEVER_A0) / (LEVER_A1 - LEVER_A0), 0, 1);
    };
    lv.addEventListener('pointerdown', (ev) => {
      if (V.busy) return;
      ev.preventDefault();
      drag = { id: ev.pointerId, moved: false, t0: performance.now(), f: 0 };
      try { lv.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      sfx('click', { volume: 0.4, pitch: 0.7 });
    });
    lv.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const f = toFrame(ev);
      if (f > 0.08) drag.moved = true;
      drag.f = Math.max(drag.f * 0.6, f);
      setLever(drag.f);
    });
    const up = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.moved || d.f > 0.75) pullLever(d.moved ? d.f : 0);
      else springLever(d.f);
    };
    lv.addEventListener('pointerup', up);
    lv.addEventListener('pointercancel', (ev) => { if (drag && ev.pointerId === drag.id) { springLever(drag.f); drag = null; } });
    plaque.addEventListener('click', () => { if (!V.busy) pullLever(0); });
  }
  function setLever(f) {
    const k = Math.round(clamp(f, 0, 1) * 9);
    const lv = E.lever;
    if (!lv || k === lv.frame) return;
    lv.frame = k; lv.f = f;
    const g = lv.handle.getContext('2d');
    g.clearRect(0, 0, 72, 72); g.drawImage(leverFrames[k], 0, 0);
  }
  function tweenLever(from, to, ms, ease = (t) => t) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        setLever(lerp(from, to, ease(t)));
        if (t < 1 && !V.closed) requestAnimationFrame(step); else res();
      };
      step();
    });
  }
  async function springLever(f) {
    await tweenLever(f, -0.08, 160, (t) => 1 - (1 - t) * (1 - t));
    await tweenLever(-0.08, 0, 120);
    setLever(0);
  }
  async function pullLever(from = 0) {
    if (V.busy) return;
    const r = V.open ? recipe(V.open) : null;
    if (!r) {
      V.busy = true;
      await tweenLever(from, 0.35, 140);
      sfx('error', { volume: 0.4 });
      once(E.lever.lv, 'ws-shake');
      say('Pick a plan off the board first!');
      wiggleBoard();
      await springLever(0.35);
      V.busy = false;
      return;
    }
    V.busy = true;
    await tweenLever(from, 1, 220, (t) => t * t);
    sfx('gate', { volume: 0.35, pitch: 1.5 });
    shake(2);
    let res;
    try { res = o.onCraft?.(r.id); } catch (e) { console.error(e); res = { ok: false, msg: 'Oops!' }; }
    const ok = res == null ? true : !!res.ok;
    if (!ok) {
      sfx('error', { volume: 0.5 });
      once(E.planSheet, 'ws-shake');
      E.planSheet?.querySelectorAll('.ws-row.ws-short').forEach((n) => once(n, 'ws-flash'));
      say(res?.msg || 'Hmm, can\'t build that yet.');
      await springLever(1);
      V.busy = false;
      flushDirty();
      return;
    }
    // stamp it, roll it up, and fly it to a free bench
    const st = div('ws-stamp', E.planSheet, '<span>BUILD IT!</span>');
    st.style.left = `${Math.round(L.plan.w * 0.5)}px`; st.style.top = `${Math.round(L.plan.h * 0.52)}px`;
    sfx('stamp', { volume: 0.7 });
    springLever(1);
    await wait(520);
    // planks hop from the stack to the bench
    const target = V.slotJob ? V.slotJob.indexOf(null) : -1;
    const tx = target >= 0 ? L.slots[target].cx : L.slots[0].cx;
    V.reserve = target >= 0 ? target : null;
    for (let k = 0; k < Math.min(4, 1 + Math.floor((r.cost?.wood || 0) / 4)); k++) setTimeout(() => flyPlank(tx), k * 90);
    await rollUp(true);
    say(res?.msg && res.msg.length > 2 ? `${res.msg} ${r.time ? `Back in ${fmtTime(r.time)}.` : ''}` : `On it! Back in ${fmtTime(r.time || 0)}.`);
    peck(3);
    V.busy = false;
    flushDirty();
    syncSlots();
    renderBoardState();
  }
  function flyPlank(tx) {
    if (V.closed) return;
    const c = newCanvas(16, 4), g = c.getContext('2d');
    g.fillStyle = RAMP.pine[4]; g.fillRect(0, 0, 16, 3); g.fillStyle = RAMP.pine[6]; g.fillRect(0, 0, 16, 1); g.fillStyle = RAMP.pine[1]; g.fillRect(0, 3, 16, 1);
    c.className = 'ws-flyer';
    const x0 = L.wood.x + 20, y0 = L.wood.y + 6, x1 = tx - 8, y1 = L.benchY - 6;
    place(c, x0, y0);
    stage.appendChild(c);
    sfx('tock', { volume: 0.3, pitch: 1.2 + Math.random() * 0.3 });
    const peak = Math.min(y0, y1) - 34;
    const kf = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10, x = lerp(x0, x1, t), y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * peak + t * t * y1; kf.push({ transform: `translate(${Math.round(x - x0)}px, ${Math.round(y - y0)}px) rotate(${Math.round(t * 4) * 45}deg)`, offset: t }); }
    const a = anim(c, kf, { duration: 520, fill: 'forwards' });
    const end = () => { c.remove(); puff(x1 + 8, y1, 5, 'dust'); };
    if (a) a.finished.then(end, end); else end();
  }

  // ---------------------------------------------------------------- the unrolled plan
  function onPlanClick(id, node) {
    if (V.busy) return;
    const r = recipe(id);
    if (!r) return;
    if (r.locked) {
      sfx('error', { volume: 0.35, pitch: 1.2 });
      once(node, 'ws-wig');
      say(r.kind === 'repair' ? `${r.locked}. Then bring it here!` : `Not yet! ${r.locked}.`);
      return;
    }
    if (V.open === id) { rollUp(false); return; }
    openPlan(id, { from: node });
  }
  async function openPlan(id, x = {}) {
    const r = recipe(id);
    if (!r || V.closed) return;
    if (!L) { V.open = id; return; } // opens (without the unroll) on the first paint
    if (V.open && !x.instant) await rollUp(false, true);
    V.open = id;
    const P = L.plan, repair = r.kind === 'repair';
    const sheet = div('ws-sheet' + (repair ? ' ws-ticket' : ''), E.planLayer);
    place(sheet, P.x, P.y, P.w, P.h);
    sheet.appendChild(sheetBG(P.w, P.h, repair));
    sheet.insertAdjacentHTML('beforeend', planHTML(r));
    const art = sheet.querySelector('.ws-sh-art');
    const pic = picture(r.id, r);
    const sc = pic.width <= 46 && pic.height <= 46 && P.h >= 150 ? 2 : 1;
    const c = cloneCanvas(pic, 'ws-sh-pic');
    c.style.width = `${pic.width * sc}px`; c.style.height = `${pic.height * sc}px`;
    art.appendChild(c);
    if (repair) {
      // a "before" polaroid of the broken piece, taped to the ticket
      const ph = div('ws-polaroid', art);
      ph.appendChild(cloneCanvas(fitCanvas(brokenPicture(r), 40, 36, false), 'ws-pol-c'));
      div('ws-pol-t', ph, 'before');
      const sp = div('ws-sparkles', art);
      sp.style.width = `${pic.width * sc}px`; sp.style.height = `${pic.height * sc}px`;
    } else {
      const dim = div('ws-dim', art, `<span>${Math.max(1, Math.round(pic.width / 12))} ft</span>`);
      dim.style.width = `${pic.width * sc}px`;
    }
    sheet.querySelector('.ws-sh-x').addEventListener('click', (e) => { e.stopPropagation(); rollUp(false); });
    sheet.addEventListener('click', (e) => e.stopPropagation());
    E.planSheet = sheet;
    E.lever?.lv.classList.add('ws-armed');
    E.lever?.plaque.classList.add('ws-armed');
    E.lever?.lv.classList.toggle('ws-can', canAfford(r) && freeSlots() > 0);
    E.lever?.plaque.classList.toggle('ws-can', canAfford(r) && freeSlots() > 0);
    for (const [k, b] of [...(E.plans || []), ...(E.repairs || [])]) b.classList.toggle('ws-sel', k === id);
    if (x.instant || reduced()) { sheet.classList.add('ws-open'); return; }
    sfx('paper', { volume: 0.6 });
    // a rolled tube drops from the board, then unrolls downward
    const tube = div('ws-tube' + (repair ? ' ws-tube-k' : ''), E.planLayer);
    place(tube, P.x - 4, P.y - 3, P.w + 8, 9);
    if (x.from) {
      const fr = x.from.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      const fx0 = (fr.left - sr.left) / u + fr.width / u / 2, fy0 = (fr.top - sr.top) / u;
      anim(tube, [
        { transform: `translate(${Math.round(fx0 - (P.x + P.w / 2))}px, ${Math.round(fy0 - P.y)}px) scale(.18, 1)` },
        { transform: 'translate(0, -6px) scale(1.02, 1)', offset: 0.75 },
        { transform: 'none' },
      ], { duration: 260, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' });
    }
    await wait(x.from ? 240 : 0);
    sheet.classList.add('ws-open', 'ws-unroll');
    anim(tube, [{ transform: 'translateY(0)' }, { transform: `translateY(${P.h - 4}px)` }], { duration: 380, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' });
    await wait(380);
    tube.remove();
    sheet.classList.remove('ws-unroll');
    sfx('paper', { volume: 0.4, pitch: 1.3 });
    if (V.open === id && !x.quiet) {
      const short = costRows(r).filter(([k, n]) => haveOf(k) < n);
      if (freeSlots() <= 0) say('All my benches are busy! Collect something first.');
      else if (short.length) say(`Need more ${short.map(([k]) => (k === 'wood' ? 'wood' : S.materials[k]?.name || k)).join(' and ')} for this one.`);
      else say(repair ? `I can fix that! ${fmtTime(r.time || 0)} of careful work.` : `${r.name}! Pull the lever and I'll start.`);
    }
  }
  function planHTML(r) {
    const repair = r.kind === 'repair';
    const rows = costRows(r).map(([k, n]) => {
      const have = haveOf(k), ok = have >= n;
      const nm = k === 'wood' ? 'Wood' : S.materials[k]?.name || k;
      return `<div class="ws-row${ok ? '' : ' ws-short'}" title="${esc(nm)}"><span class="ws-row-i">${iconHTML(k === 'wood' ? 'wood' : S.materials[k]?.icon || k, 1)}</span><b>${n}</b><span class="ws-row-h">/${fmtN(have)}</span><i class="ws-row-ok">${ok ? '&#10003;' : '&#10007;'}</i></div>`;
    }).join('');
    return `
      <div class="ws-sh-in">
        <div class="ws-sh-h">${repair ? '<small>REPAIR:</small> ' : ''}${esc(r.name)}</div>
        <div class="ws-sh-art"></div>
        <div class="ws-sh-side">
          ${r.desc ? `<div class="ws-sh-d">${esc(r.desc)}</div>` : ''}
          <div class="ws-sh-need">${rows || '<div class="ws-row"><b>Free!</b></div>'}</div>
          <div class="ws-sh-t"><span class="ws-row-i">${iconHTML('clock', 1)}</span><b>${fmtTime(r.time || 0)}</b>${goHint(r)}</div>
        </div>
      </div>
      <button type="button" class="ws-sh-x" aria-label="Roll up"><span>&#10005;</span></button>`;
  }
  function goHint(r) {
    if (freeSlots() <= 0) return '<span class="ws-sh-go ws-no">BENCH FULL</span>';
    if (!canAfford(r)) return '<span class="ws-sh-go ws-no">NEED MORE</span>';
    return '<span class="ws-sh-go">PULL <i></i></span>';
  }
  function sheetBG(w, h, kraft) {
    const p = kraft ? null : blueprintPaper(w, h);
    let c;
    if (kraft) {
      const q = new Pen(w, h);
      tileFill(q.g, TEX.kraft, 0, 0, w, h, 0, 0, '#a97b56');
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e < 3 && bayer(x, y) < (3 - e) / 4) q.p(x, y, '#6a4428'); }
      for (let y = 18; y < h - 6; y += 10) for (let x = 8; x < w - 8; x++) if (x % 2) q.p(x, y, 'rgba(90,58,34,0.35)');
      c = q.c;
    } else {
      const B = RAMP.blue;
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e < 3 && bayer(x, y) < (3 - e) / 3.5) p.p(x, y, B[2]); }
      // rolled-up top edge
      p.r(0, 0, w, 4, B[1]); p.hl(0, w - 1, 1, B[4]); p.hl(0, w - 1, 3, B[0]);
      c = p.c;
    }
    c.className = 'ws-sheet-bg';
    return c;
  }
  async function rollUp(toBench = false, quick = false) {
    const id = V.open;
    const sheet = E.planSheet;
    if (!id || !sheet) return;
    V.open = null; E.planSheet = null;
    E.lever?.lv.classList.remove('ws-armed', 'ws-can');
    E.lever?.plaque.classList.remove('ws-armed', 'ws-can');
    for (const b of [...(E.plans?.values() || []), ...(E.repairs?.values() || [])]) b.classList.remove('ws-sel');
    if (reduced() || quick) { sheet.remove(); return; }
    sfx('paper', { volume: 0.5, pitch: 0.9 });
    const P = L.plan;
    const tube = div('ws-tube' + (sheet.classList.contains('ws-ticket') ? ' ws-tube-k' : ''), E.planLayer);
    place(tube, P.x - 4, P.y + P.h - 6, P.w + 8, 9);
    sheet.classList.add('ws-rollup');
    anim(tube, [{ transform: 'translateY(0)' }, { transform: `translateY(${-(P.h - 4)}px)` }], { duration: 300, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
    await wait(300);
    sheet.remove();
    if (toBench) {
      const k = V.reserve ?? (V.slotJob ? V.slotJob.indexOf(null) : -1);
      const s = L.slots[Math.max(0, k)];
      const dx = s.cx - (P.x + P.w / 2), dy = L.benchY - 20 - P.y;
      const a = anim(tube, [
        { transform: `translateY(${-(P.h - 4)}px)` },
        { transform: `translate(${Math.round(dx * 0.5)}px, ${Math.round(dy * 0.2 - P.h * 0.5)}px) scale(.5, 1) rotate(-20deg)`, offset: 0.45 },
        { transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(.12, 1) rotate(-90deg)` },
      ], { duration: 360, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
      await (a ? a.finished.catch(() => {}) : wait(360));
      tube.remove();
      puff(s.cx, L.benchY - 14, 16, 'dust');
    } else {
      const a = anim(tube, [{ transform: `translateY(${-(P.h - 4)}px)`, opacity: 1 }, { transform: `translateY(${-(P.h - 4) - 30}px) scale(.3, 1)`, opacity: 0 }], { duration: 220, fill: 'forwards' });
      await (a ? a.finished.catch(() => {}) : wait(220));
      tube.remove();
    }
  }
  function flushDirty() {
    const d = V.dirty;
    V.dirty = 0;
    if (!d || !L) return;
    if (d >= 2) {
      picCache.clear();
      V.seen = new Set([...V.seen, ...S.jobs.map((j) => j.id)]);
      build();
      return;
    }
    // same layout: only the corkboard and the repair pile change
    E.board?.remove();
    stage.querySelector('.ws-repairs')?.remove();
    buildBoard(); buildRepairs();
    if (V.open) for (const [k, b] of [...(E.plans || []), ...(E.repairs || [])]) b.classList.toggle('ws-sel', k === V.open);
  }
  function renderBoardState() {
    for (const r of S.recipes) {
      const b = E.plans?.get(r.id);
      if (!b) continue;
      const can = canAfford(r) && !r.locked;
      b.classList.toggle('ws-can', can);
      const ok = b.querySelector('.ws-ok');
      if (can && !ok) okSticker(b); else if (!can && ok) ok.remove();
    }
    if (V.open && E.planSheet && !V.busy) {
      const r = recipe(V.open);
      if (!r) return;
      const tmp = document.createElement('div');
      tmp.innerHTML = planHTML(r);
      for (const sel of ['.ws-sh-need', '.ws-sh-t']) {
        const cur = E.planSheet.querySelector(sel), fresh = tmp.querySelector(sel);
        if (cur && fresh && cur.innerHTML !== fresh.innerHTML) cur.innerHTML = fresh.innerHTML;
      }
      E.lever?.lv.classList.toggle('ws-can', canAfford(r) && freeSlots() > 0);
      E.lever?.plaque.classList.toggle('ws-can', canAfford(r) && freeSlots() > 0);
    }
  }

  // ---------------------------------------------------------------- crate + sign
  function buildCrate() {
    const d = div('ws-crate', stage);
    place(d, L.crate.x, L.crate.y, 64, 44);
    d.appendChild(propCrate());
    div('ws-crate-t', d, '<span>YOURS!</span>');
    d.addEventListener('click', () => { sfx('tock', { volume: 0.4, pitch: 0.8 }); bounce(d); say('Finished pieces go to your Build tab, under Woodwork!'); });
    E.crate = d;
  }
  function buildSign() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ws-sign';
    b.setAttribute('aria-label', 'Close the workshop');
    place(b, L.sign.x, L.sign.y, 52, 36);
    b.appendChild(propSign());
    div('ws-sign-t', b, '<span class="ws-open-t">OPEN</span><span class="ws-closed-t">CLOSED</span>');
    b.addEventListener('pointerenter', () => sfx('hover', { volume: 0.3, pitch: 0.7 }));
    b.addEventListener('click', (e) => { e.stopPropagation(); userClose(); });
    stage.appendChild(b);
    E.sign = b;
  }

  // ---------------------------------------------------------------- fx: particles + comic words
  function puff(x, y, n, kind = 'dust') {
    const R = Math.random;
    for (let i = 0; i < n; i++) {
      const shav = kind === 'shaving' || (kind === 'dust' && R() < 0.2);
      fx.push({ k: shav ? 'shav' : 'dust', x: x + (R() - 0.5) * 6, y: y + (R() - 0.5) * 3, vx: (R() - 0.5) * 50, vy: -10 - R() * 34, g: shav ? 40 : 70, life: 0.5 + R() * 0.6, t: 0, c: ['#e8c890', '#d0a868', '#f4dcae', '#b88a50'][Math.floor(R() * 4)], f: Math.floor(R() * 4), floor: L.benchY + 4 + R() * 8 });
    }
  }
  function sparkle(x, y, n) {
    const R = Math.random;
    for (let i = 0; i < n; i++) fx.push({ k: 'spark', x: x + (R() - 0.5) * 40, y: y + (R() - 0.5) * 34, vx: 0, vy: -4 - R() * 8, g: 0, life: 0.6 + R() * 0.7, t: -R() * 0.4, c: R() < 0.5 ? '#fff6b0' : '#ffffff' });
  }
  function confetti(x, y, n) {
    const R = Math.random, C = ['#ff5a5a', '#ffd23f', '#6cc04a', '#4aa8ff', '#ff8ad0', '#ffffff', '#ffa030'];
    for (let i = 0; i < n; i++) fx.push({ k: 'conf', x: x + (R() - 0.5) * 24, y, vx: (R() - 0.5) * 160 - 30, vy: -80 - R() * 110, g: 130, life: 1.4 + R() * 0.9, t: 0, c: C[Math.floor(R() * C.length)], ph: R() * 6, big: R() < 0.4, floor: L.H + 10 });
  }
  function seedMotes() {
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].k === 'mote') fx.splice(i, 1);
    for (let i = 0; i < 34; i++) fx.push(newMote(true));
  }
  function newMote(anywhere) {
    const R = Math.random, by = L.bulb.y;
    const dy = 8 + R() * (L.benchY - by - 6), half = dy * Math.tan(0.5) + 6;
    return { k: 'mote', x: L.bulb.x + (R() * 2 - 1) * half, y: by + dy, vx: (R() - 0.5) * 3, vy: (R() - 0.5) * 2.5, life: 5 + R() * 8, t: anywhere ? R() * 4 : 0, ph: R() * 6, g: 0 };
  }
  function comic(text, x, y, kind) {
    const d = div('ws-comic ws-comic-' + kind, stage, `<span>${esc(text)}</span>`);
    place(d, x, y);
    setTimeout(() => d.remove(), 1400);
  }
  function shake(px = 2) {
    if (reduced()) return;
    anim(stage, [
      { translate: '0 0' }, { translate: `${px * u}px ${-px * u}px` }, { translate: `${-px * u}px ${px * u}px` }, { translate: `${px * u * 0.5}px 0` }, { translate: '0 0' },
    ], { duration: 220 });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function drawFx(dt) {
    const g = E.fxg;
    if (!g) return;
    g.clearRect(0, 0, L.W, L.H);
    const by = L.bulb.y, bx = L.bulb.x;
    for (let i = fx.length - 1; i >= 0; i--) {
      const q = fx[i];
      q.t += dt;
      if (q.t < 0) continue;
      if (q.t > q.life) { if (q.k === 'mote') fx[i] = newMote(false); else fx.splice(i, 1); continue; }
      q.vy += q.g * dt;
      if (q.k === 'conf') { q.vx *= 1 - dt * 1.2; q.vy = Math.min(q.vy, 40); }
      if (q.k === 'mote') { q.ph += dt; q.vx += Math.sin(q.ph * 0.7) * dt * 1.5; q.vy += Math.cos(q.ph * 0.5) * dt * 1.2; q.vx = clamp(q.vx, -4, 4); q.vy = clamp(q.vy, -3, 3); }
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.floor && q.y > q.floor) { q.y = q.floor; q.vx *= 0.5; q.vy = 0; q.g = 0; }
      const x = Math.round(q.x), y = Math.round(q.y);
      // nothing sparkles through an open plan sheet
      if (V.open && q.k !== 'conf' && x >= L.plan.x && x < L.plan.x + L.plan.w && y >= L.plan.y && y < L.plan.y + L.plan.h) continue;
      const fade = Math.min(1, (q.life - q.t) / 0.3, q.t / 0.15 + 0.2);
      if (q.k === 'mote') {
        const dy = q.y - by, inCone = dy > 0 ? 1 - Math.abs(q.x - bx) / (dy * Math.tan(0.55) + 8) : 0;
        if (inCone <= 0) continue;
        const tw = 0.5 + 0.5 * Math.sin(q.ph * 2.3);
        g.globalAlpha = clamp(inCone * 1.6, 0, 1) * fade * (0.35 + tw * 0.65);
        g.fillStyle = tw > 0.85 ? '#ffffff' : '#ffe9a8';
        g.fillRect(x, y, 1, 1);
      } else if (q.k === 'dust') {
        g.globalAlpha = fade;
        g.fillStyle = q.c; g.fillRect(x, y, 1, 1);
      } else if (q.k === 'shav') {
        g.globalAlpha = fade;
        g.fillStyle = q.c;
        const f = (Math.floor(q.t * 10) + q.f) % 4;
        if (f === 0) { g.fillRect(x, y, 2, 1); g.fillRect(x + 2, y + 1, 1, 1); } else if (f === 1) { g.fillRect(x, y, 1, 2); g.fillRect(x + 1, y + 2, 1, 1); } else if (f === 2) { g.fillRect(x + 1, y, 2, 1); g.fillRect(x, y + 1, 1, 1); } else { g.fillRect(x + 1, y, 1, 2); g.fillRect(x, y + 2, 1, 1); }
      } else if (q.k === 'spark') {
        g.globalAlpha = fade;
        g.fillStyle = q.c;
        const big = q.t < q.life * 0.5;
        g.fillRect(x, y, 1, 1);
        if (big) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); if (q.t < q.life * 0.25) { g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y - 2, 1, 1); g.fillRect(x, y + 2, 1, 1); } }
      } else if (q.k === 'conf') {
        g.globalAlpha = fade;
        g.fillStyle = q.c;
        q.ph += dt * 9;
        const s2 = q.big ? 2 : 1;
        if (Math.sin(q.ph) > 0) g.fillRect(x, y, 1 + s2, s2); else g.fillRect(x, y, s2, 1 + s2);
      }
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the loop
  let raf = 0, last = performance.now(), slotT = 0, blinkT = 2 + Math.random() * 3, idleT = 14, ambT = 2.5;
  function frame(t) {
    if (V.closed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    if (!L) return;
    slotT -= dt;
    if (slotT <= 0) { slotT = 0.25; for (const s of E.slotEls) updateSlot(s); }
    // tools at work: saw strokes, hammer taps, sawdust
    for (const s of E.slotEls) {
      if (s.state !== 'run' || !s.tool) continue;
      s.toolT += dt;
      const ph = s.toolT % 6, sawing = ph < 3.6;
      s.tool.classList.toggle('ws-hammering', !sawing);
      const cx = L.slots[s.i].cx, ly = L.benchY - 40 + s.oy + (s.fy || 0);
      if (sawing) {
        const off = Math.round(Math.sin(s.toolT * 9) * 4);
        s.tool.style.transform = `translateX(${off}px)`;
        if (Math.random() < dt * 9) puff(cx + 6 + off, ly, 1, 'dust');
      } else {
        const up = Math.floor(s.toolT * 5) % 2 === 0;
        s.tool.style.transform = `translateY(${up ? -3 : 0}px)`;
        if (!up && !s.hit) { s.hit = true; puff(cx + 4, ly, 3, 'shaving'); }
        if (up) s.hit = false;
      }
    }
    // ambient workshop sounds while something's being made (quiet, sparse)
    ambT -= dt;
    if (ambT <= 0) {
      ambT = 3.5 + Math.random() * 4.5;
      const running = E.slotEls.filter((s) => s.state === 'run');
      if (running.length) {
        const s = running[Math.floor(Math.random() * running.length)];
        const sawing = s.toolT % 6 < 3.6;
        sfx(sawing ? 'saw' : (Math.random() < 0.5 ? 'hammer' : 'nail'), { volume: 0.16, pitch: 0.9 + Math.random() * 0.25 });
      }
    }
    // Chip idles: blinks, the odd peck, a line now and then
    blinkT -= dt;
    if (blinkT <= 0) {
      setChipFace(true, chipFace.open);
      setTimeout(() => setChipFace(false, chipFace.open), 130);
      blinkT = 2.2 + Math.random() * 3.5;
    }
    idleT -= dt;
    if (idleT <= 0) {
      idleT = 16 + Math.random() * 14;
      if (Math.random() < 0.5) peck(2 + Math.floor(Math.random() * 3));
      else if (performance.now() - V.lastTalk > 15000 && !V.open) talk();
    }
    // done items sparkle
    for (const s of E.slotEls) if (s.state === 'done' && Math.random() < dt * 2.2) sparkle(L.slots[s.i].cx, L.benchY - 28, 1);
    drawFx(dt);
  }

  // ---------------------------------------------------------------- open / close
  function onKey(e) {
    if (e.key !== 'Escape' || V.closed) return;
    e.preventDefault(); e.stopPropagation();
    if (V.open && !V.busy) rollUp(false);
    else userClose();
  }
  async function userClose() {
    if (V.closed || V.closing) return;
    V.closing = true;
    sfx('tock', { volume: 0.6, pitch: 0.8 });
    E.sign?.classList.add('ws-flip');
    await wait(reduced() ? 0 : 300);
    sfx('click', { volume: 0.5, pitch: 0.6 });
    el.classList.add('ws-out');
    await wait(reduced() ? 0 : 420);
    api.close();
    try { o.onClose?.(); } catch (err) { console.error(err); }
  }
  let ro = null, roT = 0, lastSize = '';
  function onResize() {
    clearTimeout(roT);
    roT = setTimeout(() => {
      if (!V.ready || V.closed) return;
      const m = measure(), key = `${m.W}x${m.H}x${u}`;
      if (key === lastSize) return;
      lastSize = key;
      build();
    }, 60);
  }

  const api = {
    el,
    chipEl: chipBox,
    refresh(st = {}) {
      if (V.closed) return;
      const prevRecipes = S.recipes, prevMats = S.materials;
      if (st.wood != null) S.wood = +st.wood || 0;
      if (st.materials) S.materials = st.materials;
      if (st.recipes) S.recipes = st.recipes;
      if (st.jobs) S.jobs = st.jobs.slice();
      if (!L) return;
      // the board / repairs only rebuild when the set of plans (or their lock state) changes
      const sig = (list) => list.map((r) => `${r.id}:${r.locked ? 1 : 0}:${r.kind}`).join('|');
      const count = (list, rep) => list.filter((r) => (r.kind === 'repair') === rep).length;
      const recipesChanged = st.recipes && sig(prevRecipes) !== sig(S.recipes);
      const countsChanged = st.recipes && (count(prevRecipes, false) !== count(S.recipes, false) || count(prevRecipes, true) !== count(S.recipes, true));
      const matsChanged = st.materials && Object.keys(S.materials).join('|') !== Object.keys(prevMats).join('|');
      // rare (a ruin found or used up, a plan unlocked): redo the plans, or the whole room if the layout moves.
      // Never in the middle of an animation: it waits until the lever/collect is done.
      if (countsChanged || matsChanged) V.dirty = 2;
      else if (recipesChanged) V.dirty = Math.max(V.dirty, 1);
      if (V.dirty && !V.busy) flushDirty();
      if (st.materials) {
        for (const [id, m] of Object.entries(S.materials)) {
          const j = E.jars.get(id);
          if (j && j.have !== m.have) { j.have = m.have; j.n.textContent = fmtN(m.have); j.n.parentNode.classList.toggle('ws-zero', !m.have); bounce(j.d); }
        }
      }
      updateWood();
      if (st.jobs && !V.busy) syncSlots();
      renderBoardState();
    },
    say(text) { say(text); },
    get state() { return { ...S, open: V.open }; },
    openPlan(id) { if (!V.busy) openPlan(id); },
    close() {
      if (V.closed) return;
      V.closed = true;
      cancelAnimationFrame(raf);
      clearInterval(typeT); clearTimeout(hideT);
      window.removeEventListener('keydown', onKey, true);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);
      el.remove();
    },
  };

  window.addEventListener('keydown', onKey, true);
  el.addEventListener('click', () => { if (V.open && !V.busy) rollUp(false); });
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onResize); ro.observe(el); } else window.addEventListener('resize', onResize);

  // first paint once the paper textures are decoded (a few ms)
  loadTextures().then(() => {
    if (V.closed) return;
    const m = measure();
    lastSize = `${m.W}x${m.H}x${u}`;
    V.ready = true;
    build();
    el.classList.remove('ws-loading');
    el.classList.add('ws-in');
    setTimeout(() => el.classList.remove('ws-in'), 1600); // entrance animations only play once
    sfx('click', { volume: 0.5, pitch: 0.8 });
    setTimeout(() => { if (!V.closed) { sfx('click', { volume: 0.4, pitch: 0.9 }); } }, 260);
    raf = requestAnimationFrame(frame);
    setTimeout(() => { if (!V.closed) { hop(); say(V.pendingSay || S.chat[0]); V.chatI = V.pendingSay ? 0 : 1; V.pendingSay = null; } }, 650);
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  });
  return api;
}
