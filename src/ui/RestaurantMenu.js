// RestaurantMenu: "Chez Reynard", the fine-dining menu that replaces the plain
// Reviews panel. A tall oxblood-leather folder with gold foil, art-deco corners
// and a fox-and-fish crest swings open to cream card-stock pages:
//   - Tonight's Rating: big gold rosettes with a foil shimmer, a verdict, a gauge
//     with the 1.0 shutdown line, a warning ribbon near it and the quote of the day;
//   - The Reviews: every review served as a course (The Chef's Table for five stars,
//     then Mains / Appetizers / Just Desserts) with a bear cameo, the reviewer in
//     small caps and dotted leaders to its stars;
//   - The Trophy Cabinet: mahogany, green velvet, glass shelves and spot lights.
//     Locked trophies wait under velvet cloths with a brass "How to get" plate, and
//     a wine-list page (La Carte) says how to earn every one.
// Reynard, in chef whites, lives in a transparent WebGL overlay in front of the
// menu: he wanders, stirs the copper pot on his cart, tastes ("Magnifique!") and
// bows. Click a trophy and he fetches it, carries it to the centre and presents
// it under a spotlight with a fanfare and a plaque; click again (or x) and he puts
// it back.
//
//   import { RestaurantMenu } from './RestaurantMenu.js';
//   const m = new RestaurantMenu({ game, root: document.getElementById('ui') || document.body });
//   m.open({ section: 'rating' | 'reviews' | 'trophies' });
//   m.close(); m.isOpen; m.refresh();
//   m.back();        // Esc: put the trophy back, else close. true if it did something
//   m.present(id);   // fetch + present a trophy by achievement id
//
// Reads game.state.{ rating, bestRating, reviews, achievements, achievementDays?, day },
// game.ui.icons.bear(type) for portraits and game.audio.play / babble for sound.
// Options: zIndex (75), autoUpdate (true: own rAF while open; false: call update(dt)),
// sfx(name, opts) override, onClose(), keys (true: Esc), seed (fox RNG).
// Nothing is built until the first open().
import * as THREE from 'three';
import './fonts.css';
import './restaurantmenu.css';
import { FoxRig } from '../entities/foxRig.js';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';
import { makeTrophy, trophyLook } from '../entities/trophyModels.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { spriteURL, hasSprite } from './sprites.js';

const S = 2; // CSS px per art pixel
const PS = 2; // CSS px per rendered 3D pixel
const FOX_H = 1.86; // FoxRig height with the hat, world units
const PITCH = 0.16; // stage camera looks down a little
const SECTIONS = ['rating', 'reviews', 'trophies'];
const ACH = new Map(ACHIEVEMENTS.map((a, i) => [a.id, { ...a, n: i + 1 }]));

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
const easeIO = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
const easeBack = (t) => { t = clamp01(t); const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function mulberry(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const RGB = new Map();
function rgb(h) {
  let c = RGB.get(h);
  if (!c) {
    const n = parseInt(String(h).replace('#', ''), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(h, c);
  }
  return c;
}
const ramp = (arr) => arr.map(rgb);

// ---------------------------------------------------------------- palette
const PAL = {
  leather: ramp(['#16050a', '#250913', '#36101b', '#481724', '#5b1f2d', '#6f2937']),
  foil: ramp(['#4a2808', '#7c4c12', '#b27c24', '#dfae40', '#f8d878', '#fff6c8']),
  card: ramp(['#c6b088', '#dac8a0', '#e9dbb8', '#f3e9cf', '#faf3e2', '#fffdf6']),
  green: ramp(['#04100a', '#081a12', '#0e271c', '#143425', '#1b4230', '#24533d']),
  wood: ramp(['#150704', '#260e07', '#38150b', '#4e1f10', '#662915', '#80361c', '#9c4826']),
  velvet: ramp(['#140206', '#26060e', '#3e0b18', '#5a1324', '#781d32', '#962c44']),
  brass: ramp(['#3a2a0c', '#664a18', '#94702a', '#c09846', '#e2c47a', '#fbeebc']),
  red: ramp(['#3a070b', '#681015', '#981c1f', '#c42a26', '#e4523c', '#f88a64']),
  silver: ramp(['#2a2e3a', '#565c70', '#8a92a8', '#bcc2d2', '#e4e8f0', '#ffffff']),
  bronze: ramp(['#2e1406', '#5e2c12', '#8e4c22', '#bc743c', '#e0a46c', '#fcd8b0']),
};
const INK = rgb('#1c0c0a');

// ================================================================ pixel art kit
class Pix {
  constructor(w, h) { this.w = Math.max(1, w | 0); this.h = Math.max(1, h | 0); this.d = new Uint8ClampedArray(this.w * this.h * 4); }
  i(x, y) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : (y * this.w + x) * 4; }
  set(x, y, c, a = 255) { const i = this.i(x, y); if (i < 0) return; const d = this.d; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; }
  a(x, y) { const i = this.i(x, y); return i < 0 ? 0 : this.d[i + 3]; }
  rect(x, y, w, h, c, a = 255) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a); }
  tint(x, y, c, t) {
    const i = this.i(x, y); if (i < 0 || !this.d[i + 3]) return;
    const d = this.d; for (let k = 0; k < 3; k++) d[i + k] += (c[k] - d[i + k]) * t;
  }
  canvas(cv = document.createElement('canvas')) {
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return cv;
  }
  url() { return this.canvas().toDataURL(); }
}

// 2D shape masks: 0 empty, 1 foil, 2 engraved line, 3 polished (bright)
class Mask {
  constructor(w, h) { this.w = w; this.h = h; this.m = new Uint8Array(w * h); }
  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.m[y * this.w + x]; }
  put(x, y, v = 1) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = v; return this; }
  fill(test, v = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (test(x + 0.5, y + 0.5)) this.m[y * this.w + x] = v;
    return this;
  }
  ell(cx, cy, rx, ry, v = 1) { return this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, v); }
  ring(cx, cy, r0, r1, v = 1, ky = 1) { return this.fill((x, y) => { const d = Math.hypot(x - cx, (y - cy) / ky); return d >= r0 && d <= r1; }, v); }
  tri(ax, ay, bx, by, cx, cy, v = 1) { return this.fill((x, y) => inTri(x, y, ax, ay, bx, by, cx, cy), v); }
  leaf(cx, cy, rx, ry, ang, v = 1) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return this.fill((x, y) => { const dx = x - cx, dy = y - cy, u = dx * c + dy * s, w = -dx * s + dy * c; return (u / rx) ** 2 + (w / ry) ** 2 <= 1; }, v);
  }
  line(x0, y0, x1, y1, v = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5) + 1;
    for (let i = 0; i <= n; i++) { const t = i / n; this.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, v); }
    return this;
  }
  rows(rows, ox, oy, map = { '#': 1 }) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (map[ch] != null) this.put(ox + i, oy + j, map[ch]); })); return this; }
  flipped(fx, fy) {
    const o = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.m[y * this.w + x] = this.at(fx ? this.w - 1 - x : x, fy ? this.h - 1 - y : y);
    return o;
  }
}
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// Gold foil (or any metal ramp) from a mask: light bevel top-left, dark bottom-right,
// a diagonal sheen, sparkles on the lit edges and an optional emboss shadow.
function stamp(p, mk, ox, oy, F, { shadow = null, sparkle = 0.12, seed = 1, sheen = 11, outline = null } = {}) {
  const solid = (x, y) => { const v = mk.at(x, y); return v === 1 || v === 3; };
  const any = (x, y) => mk.at(x, y) > 0;
  for (let y = -1; y <= mk.h; y++)
    for (let x = -1; x <= mk.w; x++) {
      const v = mk.at(x, y);
      if (!v) {
        if (outline && (any(x - 1, y) || any(x + 1, y) || any(x, y - 1) || any(x, y + 1))) p.set(ox + x, oy + y, outline);
        else if (shadow && (solid(x - 1, y - 1) || solid(x - 1, y) || solid(x, y - 1))) p.set(ox + x, oy + y, shadow);
        continue;
      }
      let t;
      if (v === 2) t = 1;
      else if (v === 3) t = 5;
      else {
        const tl = !solid(x - 1, y) || !solid(x, y - 1);
        const br = !solid(x + 1, y) || !solid(x, y + 1);
        t = tl && !br ? 4 : br && !tl ? 2 : 3;
        if (t === 3 && sheen && (x + y + seed) % sheen === 0) t = 4;
        if (t === 4 && hash(ox + x, oy + y, seed) < sparkle) t = 5;
      }
      p.set(ox + x, oy + y, F[t]);
    }
}

// ================================================================ art pieces
const ART = new Map(); // cache: key -> anything
const cached = (key, fn) => { if (!ART.has(key)) ART.set(key, fn()); return ART.get(key); };

function leather(p, x0, y0, w, h, seed = 3, { vig = 20, sheen = 1 } = {}) {
  const L = PAL.leather;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const X = x0 + x, Y = y0 + y;
      const peb = hash(X >> 1, Y >> 1, seed) * 0.75 + hash(X, Y, seed + 5) * 0.4;
      const slow = vnoise(X / 17, Y / 13, seed + 9) * 0.8;
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      const edge = e < vig ? (1 - e / vig) ** 2 * 1.5 : 0;
      const sh = sheen * Math.max(0, 1 - Math.hypot((x / w - 0.3) * 1.5, y / h - 0.16) * 2.3) * 1.2;
      const v = 1.05 + peb + slow + sh - edge;
      p.set(X, Y, L[clamp(Math.floor(v + bayer(X, Y) - 0.5), 0, 5)]);
    }
}
// padded leather panel edge: dark rim, a lit inner line top-left, round corners
function bevelPanel(p, x, y, w, h) {
  const L = PAL.leather;
  for (let i = 1; i < w - 1; i++) { p.set(x + i, y, L[0]); p.set(x + i, y + h - 1, L[0]); p.set(x + i, y + 1, L[5]); p.set(x + i, y + h - 2, L[1]); }
  for (let j = 1; j < h - 1; j++) { p.set(x, y + j, L[0]); p.set(x + w - 1, y + j, L[0]); p.set(x + 1, y + j, L[4]); p.set(x + w - 2, y + j, L[1]); }
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
    p.set(cx, cy, L[0], 0); p.set(cx + dx, cy, L[0]); p.set(cx, cy + dy, L[0]); p.set(cx + dx, cy + dy, L[0]);
  }
}
function stitches(p, x, y, w, h, col, hole) {
  for (let i = 0; i < w; i++) {
    if (i % 4 < 2) { p.set(x + i, y, col); p.set(x + i, y + h - 1, col); p.set(x + i, y + 1, hole); p.set(x + i, y + h, hole); }
  }
  for (let j = 0; j < h; j++) {
    if (j % 4 < 2) { p.set(x, y + j, col); p.set(x + w - 1, y + j, col); p.set(x + 1, y + j, hole); p.set(x + w, y + j, hole); }
  }
}
function foilRule(p, x, y, w, h, F, shadow, seed = 0) {
  for (let i = 0; i < w; i++) {
    p.set(x + i, y, F[hash(x + i, y, seed) < 0.07 ? 5 : 4]);
    p.set(x + i, y + h - 1, F[2]);
    if (shadow) p.set(x + i + 1, y + h, shadow);
  }
  for (let j = 0; j < h; j++) {
    p.set(x, y + j, F[j ? 4 : 5]);
    p.set(x + w - 1, y + j, F[2]);
    if (shadow) p.set(x + w, y + j + 1, shadow);
  }
}
// art-deco fan opening inward from the corner (x, y)
function decoCorner(p, x, y, sx, sy, F, shadow, R = 12) {
  const mk = new Mask(R, R);
  for (const [r0, r1] of [[2.6, 3.6], [5.6, 6.5], [8.6, 9.5]]) mk.ring(0, 0, r0, r1, 1);
  for (let k = 1; k < 4; k++) { const a = (k / 4) * Math.PI / 2; mk.line(Math.cos(a) * 3.6, Math.sin(a) * 3.6, Math.cos(a) * 8.6, Math.sin(a) * 8.6, 1); }
  mk.put(0, 0, 3); mk.put(1, 0, 1); mk.put(0, 1, 1);
  mk.put(R - 1, 0, 1); mk.put(0, R - 1, 1);
  const m2 = mk.flipped(sx < 0, sy < 0);
  stamp(p, m2, sx < 0 ? x - R + 1 : x, sy < 0 ? y - R + 1 : y, F, { shadow, sparkle: 0.2 });
}

function fleuronMask() {
  return new Mask(9, 9).rows(['....#....', '...###...', '..#.#.#..', '.##.#.##.', '####3####', '.##.#.##.', '..#.#.#..', '...###...', '....#....'], 0, 0, { '#': 1, 3: 3 });
}

// The Chez Reynard crest: laurel wreath, three little stars, Reynard's head with his
// monocle, and a fish below. 64 x 64 art px.
function crestMask() {
  const W = 64, m = new Mask(W, W);
  const cx = 32;
  // laurel branches (left drawn, mirrored by symmetry in the loop)
  const C0 = { x: 32, y: 32 }, R = 27;
  for (const s of [-1, 1]) {
    for (let k = 0; k <= 26; k++) {
      const th = 0.16 + (k / 26) * 2.2; // up from the bottom
      m.put(C0.x + s * R * Math.sin(th) - (s > 0 ? 1 : 0), C0.y + R * Math.cos(th), 1);
    }
    for (let k = 0; k < 9; k++) {
      const th = 0.42 + k * 0.235;
      const px = C0.x + s * R * Math.sin(th), py = C0.y + R * Math.cos(th);
      const tx = s * Math.cos(th), ty = -Math.sin(th); // tangent (growing upward)
      const nx = s * Math.sin(th), ny = Math.cos(th); // outward normal
      const ang = Math.atan2(ty, tx);
      m.leaf(px + nx * 2.4 + tx * 1.6, py + ny * 2.4 + ty * 1.6, 3.4, 1.4, ang + s * 0.55, 1);
      m.leaf(px - nx * 2.4 + tx * 1.2, py - ny * 2.4 + ty * 1.2, 3.1, 1.3, ang - s * 0.55, 1);
    }
  }
  // ribbon bow where the branches cross
  m.tri(27, 54.5, 27, 61.5, 32, 58, 1);
  m.tri(37, 54.5, 37, 61.5, 32, 58, 1);
  m.ell(32, 58, 1.8, 1.8, 3);
  m.line(30.5, 59.5, 27.5, 63.5, 1); m.line(33.5, 59.5, 36.5, 63.5, 1);
  // three stars above
  for (const sx of [24, 32, 40]) m.rows(['..#..', '.###.', '#####', '.#.#.'], sx - 2, sx === 32 ? 1 : 3, { '#': sx === 32 ? 3 : 1 });
  // --- Reynard
  // ears
  m.tri(19.5, 9, 16.5, 22, 27, 16.5, 1);
  m.tri(44.5, 9, 47.5, 22, 37, 16.5, 1);
  m.tri(20.5, 12.5, 18.6, 19.6, 24.6, 16.8, 2);
  m.tri(43.5, 12.5, 45.4, 19.6, 39.4, 16.8, 2);
  // head + cheek tufts
  m.ell(32, 25, 11.2, 8.4, 1);
  m.tri(15.5, 28.5, 22, 21, 23, 33, 1);
  m.tri(18, 33, 23, 27, 25.5, 35, 1);
  m.tri(48.5, 28.5, 42, 21, 41, 33, 1);
  m.tri(46, 33, 41, 27, 38.5, 35, 1);
  // muzzle
  m.ell(32, 32.5, 5.6, 5.4, 1);
  m.tri(26, 29, 38, 29, 32, 40, 1);
  // engraved fur lines: muzzle V and cheek splits
  m.line(26.5, 27, 30.5, 36.5, 2); m.line(37.5, 27, 33.5, 36.5, 2);
  m.line(20, 28, 23, 31, 2); m.line(44, 28, 41, 31, 2);
  // eyes (cut out so the leather shows), sly brow on the right
  m.ell(26.6, 24.6, 1.9, 1.05, 0); m.ell(37.4, 24.6, 1.9, 1.05, 0);
  m.line(35, 21.6, 40.2, 20.8, 2);
  // the monocle: polished ring with a gap ring, and its chain
  m.ring(26.6, 24.6, 5.0, 5.9, 0);
  m.ring(26.6, 24.6, 3.5, 4.6, 3);
  for (let k = 0; k < 7; k++) m.put(22.4 - k * 0.55, 29.4 + k * 1.45, k % 2 ? 1 : 3);
  // nose
  m.ell(32, 37.8, 2.3, 1.5, 0);
  // --- fish
  m.ell(33.5, 48, 7.8, 3.3, 1);
  m.tri(21.5, 43.6, 21.5, 52.4, 26.8, 48, 1);
  m.tri(29.5, 45.2, 35.5, 45.2, 31.2, 42.6, 1);
  m.put(38.4, 47, 0);
  m.line(36, 45.4, 36, 50.4, 2);
  for (const [x, y] of [[29, 47], [31, 46], [31, 49], [33, 47.5], [27.5, 49]]) m.put(x, y, 2);
  return m;
}

function coverArt(w, h, crestY) {
  return cached(`cover:${w}x${h}:${crestY}`, () => {
    const p = new Pix(w, h);
    leather(p, 0, 0, w, h, 11, { vig: 18 });
    bevelPanel(p, 0, 0, w, h);
    stitches(p, 4, 4, w - 8, h - 8, rgb('#8c6a34'), PAL.leather[0]);
    const F = PAL.foil, sh = PAL.leather[0];
    foilRule(p, 9, 9, w - 18, h - 18, F, sh, 1);
    foilRule(p, 12, 12, w - 24, h - 24, F, sh, 2);
    for (const [x, y, sx, sy] of [[13, 13, 1, 1], [w - 14, 13, -1, 1], [13, h - 14, 1, -1], [w - 14, h - 14, -1, -1]]) decoCorner(p, x, y, sx, sy, F, sh);
    const m = crestMask();
    stamp(p, m, (w - m.w) >> 1, crestY, F, { shadow: sh, seed: 3 });
    const fl = fleuronMask();
    stamp(p, fl, (w - fl.w) >> 1, h - 27, F, { shadow: sh });
    return p.url();
  });
}

// inside of the open folder: leather, a stitched rim and (spread) the spine crease
function folderArt(w, h, spread) {
  return cached(`folder:${w}x${h}:${spread}`, () => {
    const p = new Pix(w, h);
    leather(p, 0, 0, w, h, 23, { vig: 10, sheen: 0.6 });
    bevelPanel(p, 0, 0, w, h);
    stitches(p, 3, 3, w - 6, h - 6, rgb('#7a5a2c'), PAL.leather[0]);
    if (spread) {
      const mx = w >> 1;
      for (let y = 2; y < h - 2; y++) {
        p.set(mx - 2, y, PAL.leather[1]); p.set(mx - 1, y, PAL.leather[0]); p.set(mx, y, PAL.leather[0]); p.set(mx + 1, y, PAL.leather[3]);
        if (y % 4 < 2 && y > 4 && y < h - 5) p.set(mx - 4, y, rgb('#7a5a2c'));
      }
    }
    return p.url();
  });
}

// cream card stock with a gilt edge and a fine double gold rule
function pageArt(w, h, gutter = 0, seed = 1) {
  return cached(`page:${w}x${h}:${gutter}:${seed}`, () => {
    const p = new Pix(w, h);
    const Cd = PAL.card, F = PAL.foil;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = 2.45 + hash(x, y, seed) * 0.6 + vnoise(x / 9, y / 7, seed + 2) * 0.55 + (hash(x >> 2, y, seed + 9) < 0.025 ? -0.7 : 0);
        if (gutter) { const d = gutter < 0 ? w - 1 - x : x; if (d < 12) v -= (1 - d / 12) ** 2 * 1.7; }
        const e = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (e < 4) v -= (4 - e) * 0.12;
        p.set(x, y, Cd[clamp(Math.floor(v + bayer(x, y) - 0.5), 0, 5)]);
      }
    for (let i = 0; i < w; i++) { p.set(i, 0, F[4]); p.set(i, h - 1, F[2]); }
    for (let j = 0; j < h; j++) { p.set(0, j, F[4]); p.set(w - 1, j, F[2]); }
    const r1 = rgb('#c49a4a'), r2 = rgb('#d8b462');
    const rule = (x, y, ww, hh, c) => { for (let i = 0; i < ww; i++) { p.set(x + i, y, c); p.set(x + i, y + hh - 1, c); } for (let j = 0; j < hh; j++) { p.set(x, y + j, c); p.set(x + ww - 1, y + j, c); } };
    rule(5, 5, w - 10, h - 10, r1);
    rule(7, 7, w - 14, h - 14, r2);
    // small deco fans in the corners and diamonds on the top / bottom rules
    for (const [x, y, sx, sy] of [[8, 8, 1, 1], [w - 9, 8, -1, 1], [8, h - 9, 1, -1], [w - 9, h - 9, -1, -1]]) {
      for (let a = 0; a <= 12; a++) {
        const t = (a / 12) * Math.PI / 2;
        p.set(x + sx * Math.round(Math.cos(t) * 3), y + sy * Math.round(Math.sin(t) * 3), r1);
        p.set(x + sx * Math.round(Math.cos(t) * 5.4), y + sy * Math.round(Math.sin(t) * 5.4), r2);
      }
      p.set(x, y, F[4]);
    }
    for (const yy of [5, h - 6]) {
      const mx = w >> 1;
      for (let k = -2; k <= 2; k++) for (let j = -2; j <= 2; j++) if (Math.abs(k) + Math.abs(j) <= 2) p.set(mx + k, yy + j, Math.abs(k) + Math.abs(j) === 2 ? F[2] : F[4]);
      p.set(mx, yy, F[5]);
    }
    return p.url();
  });
}

function dividerURL(w = 96) {
  return cached(`div:${w}`, () => {
    const H = 9, c = w / 2, mk = new Mask(w, H);
    mk.fill((x, y) => Math.abs(x - c) < c - 2 && Math.abs(y - 4.5) < 0.62 + 0.95 * (1 - Math.abs(x - c) / c) ** 3, 1);
    mk.fill((x, y) => Math.abs(x - c) / 4.6 + Math.abs(y - 4.5) / 4.6 <= 1, 1);
    mk.fill((x, y) => Math.abs(x - c) / 1.8 + Math.abs(y - 4.5) / 1.8 <= 1, 3);
    for (const s of [-1, 1]) { mk.ring(c + s * 11, 4.5, 1.2, 2.3, 1); mk.put(c + s * (c - 4) - 0.5, 4, 1); mk.put(c + s * 17, 4, 3); }
    const p = new Pix(w, H);
    stamp(p, mk, 0, 0, PAL.foil, { shadow: rgb('#d8c49c'), sparkle: 0.2 });
    return p.url();
  });
}
function fleuronURL() {
  return cached('fleuron', () => { const p = new Pix(11, 11); stamp(p, fleuronMask(), 1, 1, PAL.foil, { outline: rgb('#8a5a1c') }); return p.url(); });
}
// tiny 7 x 7 stars for review scores (filled gold / blind outline)
const STAR7 = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
function starURL(filled) {
  return cached(`star:${filled}`, () => {
    const p = new Pix(7, 7);
    const mk = new Mask(7, 7).rows(STAR7, 0, 0);
    if (filled) stamp(p, mk, 0, 0, PAL.foil, { sparkle: 0.3, sheen: 0 });
    else for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (!mk.at(x, y)) continue;
      const edge = !mk.at(x - 1, y) || !mk.at(x + 1, y) || !mk.at(x, y - 1) || !mk.at(x, y + 1);
      p.set(x, y, edge ? rgb('#c4a676') : rgb('#e6d6b2'));
    }
    return p.url();
  });
}
function dotsURL() {
  return cached('dots', () => { const p = new Pix(6, 3); p.set(1, 1, rgb('#b08a4a')); p.set(2, 1, rgb('#c8a464')); return p.url(); });
}
function checkURL() {
  return cached('check', () => { const p = new Pix(8, 7); new Mask(8, 7).rows(['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '...#....'], 0, 0); const mk = new Mask(8, 7).rows(['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '...#....'], 0, 0); stamp(p, mk, 0, 0, ramp(['#0c2a10', '#174a1c', '#226a2a', '#2f8a38', '#4aac50', '#8ad88a']), { sheen: 0, sparkle: 0 }); return p.url(); });
}
function lockURL() {
  return cached('lock', () => {
    const p = new Pix(7, 8);
    const mk = new Mask(7, 8).rows(['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######', '#######'], 0, 0);
    stamp(p, mk, 0, 0, ramp(['#2a2018', '#4a3a2c', '#6a5640', '#8a7458', '#a8927a', '#c8b49c']), { sheen: 0, sparkle: 0 });
    return p.url();
  });
}
function coinURL() {
  if (hasSprite('coin')) { try { return spriteURL('coin', 1); } catch { /* fall back */ } }
  return cached('coin', () => { const p = new Pix(7, 7); stamp(p, new Mask(7, 7).ell(3.5, 3.5, 3.4, 3.4, 1).ell(3.5, 3.5, 1.4, 2.2, 2), 0, 0, PAL.foil, { outline: rgb('#5a3410') }); return p.url(); });
}
function glintURL() {
  return cached('glint', () => {
    const p = new Pix(7, 7), w = rgb('#fffbe8'), y = rgb('#ffe27a');
    for (let k = -3; k <= 3; k++) { p.set(3 + k, 3, Math.abs(k) > 1 ? y : w); p.set(3, 3 + k, Math.abs(k) > 1 ? y : w); }
    return p.url();
  });
}
function closeURL() {
  return cached('close', () => {
    const N = 18, p = new Pix(N, N), mk = new Mask(N, N);
    mk.ell(9, 9, 8.6, 8.6, 1);
    const p2 = new Pix(N, N);
    stamp(p2, mk, 0, 0, PAL.foil, { outline: INK, sparkle: 0.2 });
    const inner = new Mask(N, N).ell(9, 9, 6.4, 6.4, 1);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = p2.i(x, y);
      if (inner.at(x, y)) p2.set(x, y, PAL.leather[(x + y < 15) ? 4 : 3]);
      if (i >= 0 && p2.d[i + 3]) p.set(x, y, [p2.d[i], p2.d[i + 1], p2.d[i + 2]]);
    }
    for (let k = -3; k <= 3; k++) { p.set(9 + k - 0.5, 9 + k - 0.5, rgb('#fff0c8')); p.set(9 + k - 0.5, 9 - k - 1.5, rgb('#fff0c8')); p.set(9 + k + 0.5, 9 + k - 0.5, rgb('#e8c880')); p.set(9 + k + 0.5, 9 - k - 1.5, rgb('#e8c880')); }
    return p.url();
  });
}
// tier medal: ribbon + disc
function medalURL(tier) {
  return cached(`medal:${tier}`, () => {
    const p = new Pix(11, 14), M = PAL[tier] || PAL.foil;
    const rib = new Mask(11, 14).tri(1, 0, 5, 0, 4.5, 7, 1).tri(10, 0, 6, 0, 6.5, 7, 1);
    stamp(p, rib, 0, 0, PAL.red, { sheen: 0, sparkle: 0 });
    stamp(p, new Mask(11, 14).ell(5.5, 9, 4.4, 4.4, 1).ell(5.5, 9, 2, 2, 3), 0, 0, M, { outline: INK, sparkle: 0.2 });
    return p.url();
  });
}

// Michelin-style rosette (28 x 28): tone map for the gold version and the blind-embossed one
const ROS = 28;
function rosetteTones() {
  return cached('rosette', () => {
    const c = ROS / 2, mk = new Mask(ROS, ROS);
    mk.fill((x, y) => {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      return r <= 8.7 + 4.4 * Math.abs(Math.cos(3 * a + Math.PI / 2)) ** 0.72;
    }, 1);
    mk.ring(c, c, 4.4, 5.4, 2);
    mk.ell(c, c, 2.4, 2.4, 3);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      for (let r = 6.4; r <= 9.4; r += 0.5) mk.put(c + Math.cos(a) * r, c + Math.sin(a) * r, 2);
    }
    const gold = new Int8Array(ROS * ROS).fill(-1), blind = new Int8Array(ROS * ROS).fill(-1);
    const solid = (x, y) => mk.at(x, y) === 1 || mk.at(x, y) === 3;
    for (let y = 0; y < ROS; y++)
      for (let x = 0; x < ROS; x++) {
        const v = mk.at(x, y), i = y * ROS + x;
        if (!v) {
          if (mk.at(x - 1, y) || mk.at(x + 1, y) || mk.at(x, y - 1) || mk.at(x, y + 1)) gold[i] = 9; // outline
          continue;
        }
        if (v === 2) gold[i] = 1;
        else if (v === 3) gold[i] = 5;
        else {
          const tl = !solid(x - 1, y) || !solid(x, y - 1), br = !solid(x + 1, y) || !solid(x, y + 1);
          gold[i] = tl && !br ? 4 : br && !tl ? 2 : 3;
          if (gold[i] === 3 && (x + y) % 9 === 0) gold[i] = 4;
        }
        // blind emboss on card: shadowed top-left inner edge, lit bottom-right
        const tl = !mk.at(x - 1, y) || !mk.at(x, y - 1), br = !mk.at(x + 1, y) || !mk.at(x, y + 1);
        blind[i] = v === 2 ? 1 : tl && !br ? 1 : br && !tl ? 4 : 2;
      }
    return { gold, blind };
  });
}
// draws a rosette filled up to `fill` (0..1, from the left) with the foil shimmer at `phase`
function drawRosette(cv, fill, phase) {
  const ctx = cv.getContext('2d');
  const img = cv._img || (cv._img = ctx.createImageData(ROS, ROS));
  const { gold, blind } = rosetteTones();
  const d = img.data, F = PAL.foil, Cd = PAL.card, OL = rgb('#6a4214');
  const cut = fill * ROS;
  for (let y = 0; y < ROS; y++)
    for (let x = 0; x < ROS; x++) {
      const i = y * ROS + x, o = i * 4;
      let c = null;
      if (x + 0.5 <= cut) {
        let t = gold[i];
        if (t === 9) c = OL;
        else if (t >= 0) {
          const s = x + y * 0.55 - phase;
          if (s >= 0 && s < 3) t = Math.min(5, t + 2);
          else if (s >= 3 && s < 4.5) t = Math.min(5, t + 1);
          c = F[t];
        }
      } else if (blind[i] >= 0) c = Cd[blind[i]];
      if (c) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; } else d[o + 3] = 0;
    }
  ctx.putImageData(img, 0, 0);
}

function cameoURLs() {
  return cached('cameo', () => {
    const w = 22, h = 26, cx = 11, cy = 13;
    const back = new Pix(w, h), ring = new Pix(w, h), G = PAL.green;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = ((x + 0.5 - cx) / 9.8) ** 2 + ((y + 0.5 - cy) / 11.8) ** 2;
        if (d > 1) continue;
        const v = 3.6 - (y / h) * 2 + (d > 0.7 ? -0.6 : 0);
        back.set(x, y, G[clamp(Math.floor(v + bayer(x, y) - 0.5), 1, 5)]);
      }
    const mk = new Mask(w, h).fill((x, y) => {
      const o = ((x - cx) / 11) ** 2 + ((y - cy) / 13) ** 2, i = ((x - cx) / 9.2) ** 2 + ((y - cy) / 11.2) ** 2;
      return o <= 1 && i > 1;
    }, 1);
    mk.put(10, 0, 3); mk.put(11, 0, 3); mk.put(10, 25, 1); mk.put(11, 25, 1);
    stamp(ring, mk, 0, 0, PAL.foil, { outline: null, sparkle: 0.25, sheen: 7 });
    return { back: back.url(), ring: ring.url() };
  });
}

// rating gauge 0..5 with the red "closed" zone below 1.0
function gaugeURL(w, rating) {
  const key = `gauge:${w}:${rating.toFixed(2)}`;
  return cached(key, () => {
    const h = 10, p = new Pix(w, h), F = PAL.foil, Rr = PAL.red;
    const x0 = 2, x1 = w - 3, span = x1 - x0;
    const X = (v) => Math.round(x0 + (v / 5) * span);
    for (let x = 0; x < w; x++) for (let y = 2; y < h - 2; y++) p.set(x, y, INK);
    for (let x = x0; x <= x1; x++)
      for (let y = 3; y < h - 3; y++) {
        let c;
        if (x <= X(1)) c = (x + y) % 3 === 0 ? Rr[1] : Rr[3];
        else if (x <= X(rating)) c = y === 3 ? F[5] : y === h - 4 ? F[2] : F[(x + y) % 7 === 0 ? 4 : 3];
        else c = y === 3 ? PAL.card[1] : PAL.card[2];
        p.set(x, y, c);
      }
    for (let y = 0; y < h; y++) p.set(X(1), y, Rr[2]);
    for (let v = 2; v <= 4; v++) { p.set(X(v), 1, rgb('#a07a46')); p.set(X(v), h - 2, rgb('#a07a46')); }
    const m = X(rating);
    for (let y = 0; y < h; y++) p.set(m, y, y < 2 || y > h - 3 ? F[1] : F[5]);
    p.set(m - 1, 0, F[1]); p.set(m + 1, 0, F[1]); p.set(m - 1, h - 1, F[1]); p.set(m + 1, h - 1, F[1]);
    return p.url();
  });
}

// red satin warning ribbon with forked tails
function ribbonURL(w) {
  return cached(`ribbon:${w}`, () => {
    const h = 20, p = new Pix(w, h), Rr = PAL.red;
    const tail = 10;
    for (const s of [-1, 1]) {
      for (let x = 0; x < tail + 2; x++)
        for (let y = 4; y < h; y++) {
          const notch = Math.abs(y - 12) < (tail - x) * 0.55 - 1;
          if (notch && x < tail - 1) continue;
          const X = s < 0 ? x : w - 1 - x;
          p.set(X, y, y === 4 || y === h - 1 ? Rr[0] : y < 7 ? Rr[2] : Rr[1]);
        }
    }
    for (let x = tail - 2; x < w - tail + 2; x++)
      for (let y = 0; y < h - 4; y++) {
        let c = y === 0 || y === h - 5 ? Rr[0] : y === 1 ? Rr[5] : y === 2 ? Rr[4] : y > h - 8 ? Rr[2] : Rr[3];
        if (y > 2 && y < h - 8 && (x * 3 + y * 7) % 23 === 0) c = Rr[4];
        p.set(x, y, c);
      }
    for (const s of [-1, 1]) for (let y = 0; y < h - 4; y++) p.set(s < 0 ? tail - 2 : w - tail + 1, y, Rr[0]);
    return p.url();
  });
}

// frame of the Chef's Table box: gold double line with corner fans
function chefFrameURL(w, h) {
  return cached(`chef:${w}x${h}`, () => {
    const p = new Pix(w, h), F = PAL.foil;
    for (let i = 0; i < w; i++) { p.set(i, 0, F[3]); p.set(i, h - 1, F[2]); p.set(i, 2, F[4]); p.set(i, h - 3, F[3]); }
    for (let j = 0; j < h; j++) { p.set(0, j, F[3]); p.set(w - 1, j, F[2]); p.set(2, j, F[4]); p.set(w - 3, j, F[3]); }
    for (const [x, y] of [[0, 0], [w - 4, 0], [0, h - 4], [w - 4, h - 4]]) p.rect(x, y, 4, 4, F[5]);
    const mx = w >> 1;
    for (let k = -6; k <= 6; k++) for (const yy of [0, 1, 2]) p.set(mx + k, yy, rgb('#f3e9cf'), 0);
    return p.url();
  });
}

// Mahogany trophy cabinet with green velvet, glass shelves and little spot lights.
function cabinetURL(g) {
  return cached(`cab:${JSON.stringify(g)}`, () => {
    const { w, h, fx, top, base, cols, rows, colW, bandH, shelfY } = g;
    const p = new Pix(w, h), Wd = PAL.wood, V = PAL.green, B = PAL.brass;
    const ix0 = fx, ix1 = fx + cols * colW, iy0 = top, iy1 = top + rows * bandH;
    // carved crown: flat top with a raised central arch
    const archW = Math.floor(w * 0.56), archH = 9, ax0 = (w - archW) >> 1;
    const topAt = (x) => {
      if (x < ax0 || x >= ax0 + archW) return archH;
      const u = (x - ax0) / archW * 2 - 1;
      return Math.round(archH - Math.sqrt(Math.max(0, 1 - u * u)) * archH);
    };
    for (let x = 0; x < w; x++) {
      const t = topAt(x);
      for (let y = t; y < h; y++) {
        const grain = vnoise(x / 2.5, y / 26, 41) * 1.4 + hash(x, y >> 2, 7) * 0.5;
        p.set(x, y, Wd[clamp(Math.floor(2.4 + grain + bayer(x, y) - 0.5), 1, 5)]);
      }
      p.set(x, t, Wd[6]); p.set(x, t + 1, Wd[5]);
    }
    // outer bevel
    for (let y = archH; y < h; y++) { p.set(0, y, Wd[0]); p.set(1, y, Wd[5]); p.set(w - 1, y, Wd[0]); p.set(w - 2, y, Wd[1]); }
    for (let x = 0; x < w; x++) { p.set(x, h - 1, Wd[0]); p.set(x, h - 2, Wd[1]); }
    for (let x = 0; x < w; x++) p.set(x, topAt(x) - 1, INK, x === 0 || x === w - 1 ? 0 : 255);
    // a gold moulding under the crown + a gold finial
    for (let x = 3; x < w - 3; x++) { p.set(x, archH + 3, PAL.foil[4]); p.set(x, archH + 4, PAL.foil[2]); }
    const mx = w >> 1;
    for (let k = -2; k <= 2; k++) { p.set(mx + k, 0, PAL.foil[k ? 3 : 5]); }
    p.set(mx, -1 + 1, PAL.foil[5]);
    // brass title plate on the crown
    const pw = Math.min(w - 30, 92), px0 = mx - (pw >> 1), py0 = archH + 6, ph = top - archH - 9;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      let c = B[3];
      if (y === 0 || x === 0) c = B[5]; else if (y === ph - 1 || x === pw - 1) c = B[1]; else if ((x + y * 2) % 13 === 0) c = B[4];
      p.set(px0 + x, py0 + y, c);
    }
    for (const sx of [px0 + 2, px0 + pw - 3]) p.set(sx, py0 + (ph >> 1), B[0]);
    for (let x = px0; x < px0 + pw + 1; x++) p.set(x, py0 + ph, INK);
    // recessed interior: velvet with a tufted diamond lattice, lamps and light cones
    for (let y = iy0; y < iy1; y++)
      for (let x = ix0; x < ix1; x++) {
        const band = Math.floor((y - iy0) / bandH), by = y - iy0 - band * bandH;
        const col = Math.floor((x - ix0) / colW), bx = x - ix0 - col * colW, cxl = colW / 2;
        let v = 1.6 + (1 - by / bandH) * 1.1;
        // light cone from the lamp at the top of each compartment
        const spread = 3 + by * 0.42;
        const inCone = Math.abs(bx - cxl) < spread && by < shelfY + 1;
        if (inCone) v += 1.1 - (Math.abs(bx - cxl) / spread) * 0.6;
        // tufting lattice
        const u = (x - ix0) + (y - iy0), q = (x - ix0) - (y - iy0);
        if (((u % 10) + 10) % 10 === 0 || ((q % 10) + 10) % 10 === 0) v -= 0.7;
        p.set(x, y, V[clamp(Math.floor(v + bayer(x, y) - 0.5), 0, 5)]);
        if (((u % 10) + 10) % 10 === 0 && ((q % 10) + 10) % 10 === 0) p.set(x, y, B[inCone ? 4 : 2]);
      }
    // inner bevel (recess): dark top-left, lit bottom-right
    for (let x = ix0 - 1; x <= ix1; x++) { p.set(x, iy0 - 1, Wd[0]); p.set(x, iy1, Wd[5]); }
    for (let y = iy0 - 1; y <= iy1; y++) { p.set(ix0 - 1, y, Wd[0]); p.set(ix1, y, Wd[5]); }
    // column dividers (thin wood posts) between compartments
    for (let c = 1; c < cols; c++) {
      const x = ix0 + c * colW;
      for (let y = iy0; y < iy1; y++) { p.set(x - 1, y, Wd[2]); p.set(x, y, Wd[4]); }
    }
    for (let r = 0; r < rows; r++) {
      const y0 = iy0 + r * bandH;
      for (let c = 0; c < cols; c++) {
        const lx = ix0 + c * colW + (colW >> 1);
        // brass lamp hood
        for (let k = -3; k <= 2; k++) p.set(lx + k, y0, B[k < 0 ? 4 : 2]);
        for (let k = -2; k <= 1; k++) p.set(lx + k, y0 + 1, B[k < 0 ? 3 : 1]);
        p.set(lx - 1, y0 + 2, rgb('#fff6d0')); p.set(lx, y0 + 2, rgb('#ffe9a0'));
      }
      // glass shelf: a lit edge, a translucent body, a soft shadow below
      const gy = y0 + shelfY;
      for (let x = ix0; x < ix1; x++) {
        p.set(x, gy, rgb('#e6fbff'));
        p.tint(x, gy + 1, rgb('#a8dce0'), 0.55);
        p.tint(x, gy + 2, V[0], 0.6);
        p.tint(x, gy + 3, V[0], 0.3);
      }
      for (const bxp of [ix0, ix1 - 2]) { p.set(bxp, gy + 1, B[3]); p.set(bxp + 1, gy + 1, B[2]); p.set(bxp, gy + 2, B[1]); }
    }
    // glass door reflections: two long diagonal glints
    for (let y = iy0; y < iy1; y++)
      for (let x = ix0; x < ix1; x++) {
        const s = x * 1 + y * 0.55;
        const k1 = ((s - (ix0 + 20)) % 90 + 90) % 90;
        if (k1 < 1.2) p.tint(x, y, rgb('#ffffff'), 0.22);
        else if (k1 > 4 && k1 < 5) p.tint(x, y, rgb('#ffffff'), 0.12);
      }
    // base: a darker plinth with a carved groove and two little feet
    for (let x = 2; x < w - 2; x++) { p.set(x, iy1 + 3, Wd[1]); p.set(x, iy1 + 4, Wd[4]); }
    return p.url();
  });
}

// Burgundy velvet cloth draped over a trophy silhouette (alpha mask from its icon).
function clothURL(key, mask, w, h, baseY) {
  return cached(`cloth:${key}`, () => {
    const pad = 5, W = w + pad * 2, H = baseY + 2, Vv = PAL.velvet;
    const p = new Pix(W, H);
    const topRaw = new Array(w).fill(Infinity);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (mask[y * w + x]) { topRaw[x] = y; break; }
    const top = new Array(W).fill(Infinity);
    for (let X = 0; X < W; X++)
      for (let x = 0; x < w; x++) if (topRaw[x] < Infinity) top[X] = Math.min(top[X], topRaw[x] - 2 + ((X - pad - x) ** 2) * 0.32);
    const has = (X, Y) => X >= 0 && X < W && Y >= 0 && Y < H && Y >= Math.round(top[X]) && Math.round(top[X]) < H - 3;
    for (let X = 0; X < W; X++) {
      const t = Math.round(top[X]);
      if (!(t < H - 3)) continue;
      for (let Y = Math.max(0, t); Y < H; Y++) {
        const depth = Y - t;
        const fold = Math.sin(X * 0.95 + Math.sin(Y * 0.12) * 1.4) + (hash(X, 3, 17) - 0.5) * 0.6;
        const k = clamp((Y - t) / 10, 0, 1);
        let v = 2.6 + (depth < 3 ? 1.3 - depth * 0.35 : 0) + fold * 0.85 * k - (Y / H) * 0.5;
        if (X < 3 || X > W - 4) v -= 0.6;
        let c = Vv[clamp(Math.floor(v + bayer(X, Y) - 0.5), 0, 5)];
        if (Y >= H - 2) c = (X + Y) % 2 ? PAL.foil[3] : PAL.foil[1]; // gold fringe
        p.set(X, Y, c);
      }
    }
    // outline
    const out = [];
    for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (!has(X, Y) && (has(X - 1, Y) || has(X + 1, Y) || has(X, Y - 1) || has(X, Y + 1))) out.push([X, Y]);
    for (const [X, Y] of out) p.set(X, Y, rgb('#12020a'));
    // tassels at the lowest corners
    let L = 0, Rt = W - 1;
    while (L < W && !has(L, H - 3)) L++;
    while (Rt > 0 && !has(Rt, H - 3)) Rt--;
    for (const x of [L + 1, Rt - 1]) { p.set(x, H - 1, PAL.foil[4]); p.set(x, H - 2, PAL.foil[3]); }
    return { url: p.url(), w: W, h: H, pad };
  });
}

// ---------------------------------------------------------------- words
const VERDICTS = [[4.5, 'Worth a special journey'], [3.5, 'Worth a detour'], [2.5, 'Worth a stop'], [1.8, 'Worth a shrug'], [1.0, 'On thin ice'], [-1, 'Closed by the bears']];
const COURSES = [
  { id: 'chef', title: "The Chef's Table", sub: 'la table du chef', test: (s) => s >= 5 },
  { id: 'mains', title: 'Mains', sub: 'les plats', test: (s) => s === 4 },
  { id: 'apps', title: 'Appetizers', sub: 'les entrées', test: (s) => s === 3 },
  { id: 'dess', title: 'Just Desserts', sub: 'les desserts', test: (s) => s <= 2 },
];
const LINES = {
  welcome: ['Bienvenue!', 'Bonsoir! Table for one?', 'Welcome to Chez Reynard!'],
  taste: ['Magnifique!', 'Ooh la la!', 'Perfection.', 'Needs... more butter.'],
  bow: ['Bon appétit!', 'Merci, merci!', 'At your service.'],
  poke: ['Oui, chef?', 'Hands off ze soup!', 'Heh heh heh.', 'Ze secret? Butter.'],
  show: ['Voilà!', 'Behold!', 'One of my finest!'],
  mystery: ['Ooh, a mystery!', 'Not yet earned...', 'Soon, mon ami.'],
};
const TIER_NAME = { gold: 'Gold award', silver: 'Silver award', bronze: 'Bronze award' };

// ================================================================ 3D: the chef's stage
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
float Z(vec2 o) { return -orthographicDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
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
    if (z - zn > 0.12) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}
`;

function lights(scene) {
  const L = {};
  scene.add((L.hemi = new THREE.HemisphereLight(0xffe4c4, 0x5a3a5a, 1.3)));
  L.key = new THREE.DirectionalLight(0xfff0d6, 2.2); L.key.position.set(-1.6, 2.6, 3.2); scene.add(L.key); scene.add(L.key.target);
  L.fill = new THREE.DirectionalLight(0xffc6a0, 0.5); L.fill.position.set(2.5, 0.4, 2); scene.add(L.fill); scene.add(L.fill.target);
  L.rim = new THREE.DirectionalLight(0xffd27a, 2.4); L.rim.position.set(2.4, 1.8, -2.6); scene.add(L.rim); scene.add(L.rim.target);
  L.rim2 = new THREE.DirectionalLight(0xff9fd0, 1.2); L.rim2.position.set(-2.6, 1.2, -2.2); scene.add(L.rim2); scene.add(L.rim2.target);
  L.spot = new THREE.DirectionalLight(0xfff2d8, 0); L.spot.position.set(0.3, 5, 1.6); scene.add(L.spot); scene.add(L.spot.target);
  return L;
}

// Reynard's flambé cart: brass legs, a linen skirt, a copper pot of bisque, a
// pepper mill and a bottle. 0.05 world units per voxel, origin at the floor centre.
function cartModel() {
  const v = new VoxelModel();
  const WD = [0x2e120a, 0x44190e, 0x5c2414, 0x76301a, 0x904222];
  const BR = [0x5a3e14, 0x8a6424, 0xb88c3a, 0xdcb460, 0xf4dc98];
  const CU = [0x4a1c0c, 0x7a3216, 0xae4e20, 0xd4703a, 0xf09a5c, 0xffcfa0];
  const LIN = [0xcdc3b0, 0xe6dfd0, 0xf8f4ea];
  for (const [x, z] of [[-8, -3], [7, -3], [-8, 3], [7, 3]]) {
    v.box(x, 0, z - 1, x, 1, z + 1, 0x241a1c); v.set(x, 1, z, BR[3]);
    v.box(x, 2, z, x, 11, z, (xx, y) => (y % 4 === 0 ? BR[4] : BR[2]));
  }
  v.box(-8, 5, -3, 7, 5, 3, (x, y, z) => (z === 3 ? WD[3] : WD[2]));
  for (let k = 0; k < 3; k++) v.box(-6, 6 + k, -2, -2, 6 + k, 1, k === 2 ? LIN[2] : LIN[1]); // plates
  v.box(1, 6, -2, 3, 8, 0, WD[4]); // a little crate of lemons
  v.set(2, 9, -1, 0xf2d040); v.set(1, 9, -1, 0xe8c030);
  v.box(-9, 11, -4, 8, 11, 4, WD[2]);
  v.box(-9, 12, -4, 8, 12, 4, LIN[2]);
  v.box(-9, 8, 5, 8, 12, 5, (x, y) => (y === 8 ? (x % 2 ? LIN[0] : LIN[1]) : y === 10 ? 0xb02028 : LIN[2]));
  v.box(-10, 8, -4, -10, 12, 4, (x, y) => (y === 10 ? 0xb02028 : LIN[1]));
  v.box(9, 8, -4, 9, 12, 4, (x, y) => (y === 10 ? 0x8a1820 : LIN[0]));
  // brass rail at the back
  v.box(-9, 14, -4, 8, 14, -4, BR[3]);
  for (const x of [-9, 0, 8]) v.box(x, 13, -4, x, 13, -4, BR[2]);
  // burner + copper pot of bisque
  for (let x = -3; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.hypot(x + 0.5, z) < 3) v.set(x, 13, z, BR[1]);
  const pr = [3.0, 3.6, 3.8, 3.8, 3.9];
  pr.forEach((r, i) => {
    const y = 14 + i;
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 5; z++) {
        const d = Math.hypot(x + 0.5, z);
        if (d > r) continue;
        const a = Math.atan2(x + 0.5, z);
        let c = a < -0.9 ? CU[3] : a < -0.4 ? CU[5] : a < 0.1 ? CU[4] : a < 0.7 ? CU[2] : CU[1];
        if (i === pr.length - 1) c = d < r - 1 ? (hash(x, z, 5) < 0.2 ? 0xf0a050 : 0xd8642a) : CU[4];
        v.set(x, y, z, c);
      }
  });
  for (const s of [-1, 1]) { v.set(s < 0 ? -6 : 5, 17, 0, BR[3]); v.set(s < 0 ? -6 : 5, 16, 0, BR[2]); }
  // pepper mill + a bottle of Daisy-free Bordeaux
  v.box(6, 13, 0, 6, 18, 0, (x, y) => (y === 18 ? BR[4] : y % 2 ? WD[4] : WD[3])); v.set(6, 19, 0, BR[3]);
  v.box(-7, 13, 0, -6, 17, 1, (x, y) => (y === 15 ? 0xf0e6cc : 0x1e3a22));
  v.box(-7, 18, 0, -7, 20, 0, 0x1e3a22); v.set(-7, 21, 0, 0x8a1820);
  return v;
}
let CART_GEO = null;

// fallback chef toque if the rig has no setOutfit (kept tiny on purpose)
function toqueModel() {
  const v = new VoxelModel();
  for (let y = 0; y < 3; y++) for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if (Math.hypot(x + 0.5, z + 0.5) <= 4.2) v.set(x, y, z, y === 0 ? 0xe6e2da : 0xf8f6f0);
  for (let y = 3; y < 8; y++) for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5), r = 5.6 - Math.abs(y - 5.2) * 0.6;
    if (d <= r) v.set(x, y, z, d > r - 1 && (x + z + y) % 5 === 0 ? 0xe2ded6 : 0xffffff);
  }
  return v;
}

class FoxStage {
  constructor(menu) {
    this.menu = menu;
    this.built = false;
    this.ok = false;
    this.vw = 1; this.vh = 1; this.K = 80; this.floor = 0;
    this.icons = new Map();
    this.f = { x: -10, yaw: 0, tyaw: 0, z: 0 };
    this.plan = [];
    this.step = null;
    this.cur = null; // current anim name
    this.carry = null; // { id, holder, obj, landed }
    this.rng = mulberry(menu.opts.seed ?? ((Math.random() * 1e9) | 0));
    this.entered = false;
    this.cartX = 1;
    this._v = new THREE.Vector3();
  }

  build(container) {
    if (this.built) return this.ok;
    this.built = true;
    let r;
    try {
      r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    } catch (e) {
      console.warn('RestaurantMenu: no WebGL, the chef stays in the kitchen', e);
      return (this.ok = false);
    }
    this.ok = true;
    this.renderer = r;
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    const cv = (this.canvas = r.domElement);
    cv.className = 'rm-fox';
    container.appendChild(cv);
    const scene = (this.scene = new THREE.Scene());
    this.L = lights(scene);
    const rig = (this.rig = new FoxRig({ shadows: false }));
    if (typeof rig.setOutfit === 'function') { try { rig.setOutfit('chef'); } catch (e) { console.warn('setOutfit', e); } }
    else this._toque(rig);
    rig.onEvent = (n) => { if (n === 'step' && this.cur === 'run') this.menu._sfx('footsteps', { volume: 0.06, pitch: 1.4 }); };
    scene.add(rig.root);
    // the cart
    if (!CART_GEO) CART_GEO = cartModel().build({ pivot: [0, 0, 0], scale: 0.05 });
    this.cart = new THREE.Mesh(CART_GEO, voxelMaterial());
    scene.add(this.cart);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    // post (outline + upscale)
    this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(2, 2);
    this.post = this._postMat(this.rt);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, this.post);
    this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // icon rendering
    this.iconScene = new THREE.Scene();
    lights(this.iconScene);
    this.iconCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
    this.iconRT = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.iconRT.depthTexture = new THREE.DepthTexture(2, 2);
    this.iconOut = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.iconOut.texture.colorSpace = THREE.SRGBColorSpace;
    this.iconPost = this._postMat(this.iconRT);
    this.iconQuad = new THREE.Mesh(g, this.iconPost);
    this.iconQuad.frustumCulled = false;
    this.iconPostScene = new THREE.Scene();
    this.iconPostScene.add(this.iconQuad);
    return true;
  }

  _postMat(rt) {
    return new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture },
        size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x1a0c0e) },
        cNear: { value: 0.1 }, cFar: { value: 200 },
      },
      depthTest: false, depthWrite: false,
    });
  }

  _toque(rig) {
    if (!rig.hatSeat) return;
    const m = new THREE.Mesh(toqueModel().build({ pivot: [0, 0, 0], scale: 0.05 }), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.position.set(0, -0.06, 0);
    rig.hatSeat.add(m);
    if (rig.hatMesh) rig.hatMesh.visible = false;
    this.toque = m;
  }

  has(name) { return !!this.rig && this.rig.anims.includes(name); }
  pick(...names) { for (const n of names) if (this.has(n)) return n; return 'idle'; }

  resize(L) {
    if (!this.ok) return;
    const { vw, vh, K, floor } = L;
    this.vw = vw; this.vh = vh; this.K = K; this.floor = floor;
    const n = [Math.max(2, Math.round(vw / PS)), Math.max(2, Math.round(vh / PS))];
    this.renderer.setSize(n[0], n[1], false);
    this.rt.setSize(n[0], n[1]);
    this.post.uniforms.size.value.set(n[0], n[1]);
    const c = this.cam, hw = vw / 2 / K, hh = vh / 2 / K;
    c.left = -hw; c.right = hw; c.top = hh; c.bottom = -hh;
    c.near = 0.1; c.far = 200;
    c.updateProjectionMatrix();
    const ty = (floor - vh / 2) / (K * Math.cos(PITCH));
    const T = new THREE.Vector3(vw / 2 / K, ty, 0);
    c.position.set(T.x, T.y + Math.sin(PITCH) * 60, Math.cos(PITCH) * 60);
    c.lookAt(T);
    c.updateMatrixWorld(true);
    this.post.uniforms.cNear.value = c.near; this.post.uniforms.cFar.value = c.far;
    this.xMin = 0.55; this.xMax = vw / K - 0.55;
    this.centerX = vw / 2 / K;
    // cart in the left margin when there is room, else at the left edge
    const margin = L.spread ? L.left : 0;
    this.cartX = margin > 150 ? clamp(margin * 0.5 / K, 0.75, 4) : 0.62;
    this.cart.position.set(this.cartX, 0, 0.55);
    this.cart.scale.setScalar(1);
    if (this.f.x > this.xMax + 0.5 && this.entered) this.f.x = this.xMax;
  }

  toScreen(v, out = {}) {
    const p = this._v.copy(v).project(this.cam);
    out.x = (p.x + 1) / 2 * this.vw;
    out.y = (1 - p.y) / 2 * this.vh;
    return out;
  }

  // ---------------------------------------------------------------- icons
  /** Pixel icon of a trophy rendered with the stage's lights + outline. */
  icon(id, locked, ppw = 42) {
    const key = `${id}:${locked ? 1 : 0}:${ppw}`;
    if (this.icons.has(key)) return this.icons.get(key);
    let res;
    if (!this.ok) {
      const name = locked ? 'lock' : 'trophy';
      const url = hasSprite(name) ? spriteURL(name, 2) : '';
      res = { url, w: 24, h: 24, baseY: 23, topY: 0, mask: null, fallback: true };
      this.icons.set(key, res);
      return res;
    }
    const r = this.renderer;
    const obj = makeTrophy({ id, locked });
    const wrap = new THREE.Group();
    obj.rotation.y = -0.42;
    wrap.rotation.x = 0.3;
    wrap.add(obj);
    this.iconScene.add(wrap);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const pad = 3;
    const w = Math.ceil((box.max.x - box.min.x) * ppw) + pad * 2, h = Math.ceil((box.max.y - box.min.y) * ppw) + pad * 2;
    const cam = this.iconCam;
    cam.left = box.min.x - pad / ppw; cam.right = cam.left + w / ppw;
    cam.bottom = box.min.y - pad / ppw; cam.top = cam.bottom + h / ppw;
    cam.near = 0.1; cam.far = 50;
    cam.position.set(0, 0, box.max.z + 10);
    cam.lookAt(0, 0, box.max.z);
    cam.position.set(0, 0, box.max.z + 10);
    cam.rotation.set(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.iconRT.setSize(w, h);
    this.iconOut.setSize(w, h);
    this.iconPost.uniforms.size.value.set(w, h);
    this.iconPost.uniforms.cNear.value = cam.near; this.iconPost.uniforms.cFar.value = cam.far;
    const prevRT = r.getRenderTarget();
    r.setRenderTarget(this.iconRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(this.iconScene, cam);
    r.setRenderTarget(this.iconOut);
    r.clear(true, true, true);
    r.render(this.iconPostScene, this.postCam);
    const px = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(this.iconOut, 0, 0, w, h, px);
    r.setRenderTarget(prevRT);
    this.iconScene.remove(wrap);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const mask = new Uint8Array(w * h);
    let baseY = 0, topY = h;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const si = ((h - 1 - y) * w + x) * 4, di = (y * w + x) * 4;
        if (px[si + 3] > 40) {
          img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2]; img.data[di + 3] = 255;
          mask[y * w + x] = 1;
          if (y > baseY) baseY = y;
          if (y < topY) topY = y;
        }
      }
    ctx.putImageData(img, 0, 0);
    res = { url: cv.toDataURL(), w, h, baseY, topY, mask, ppw };
    this.icons.set(key, res);
    return res;
  }

  // ---------------------------------------------------------------- behaviour
  run(steps) { this.plan = steps.slice(); this.step = null; }

  _next() {
    this.step = this.plan.shift() || null;
    if (this.step) this.step.t = 0;
  }

  play(name, o = {}) {
    if (!this.rig) return;
    if (this.cur === name && !o.restart) return;
    this.cur = name;
    this.rig.play(name, { fade: o.fade ?? 0.22, loop: o.loop, restart: !!o.restart, onDone: o.onDone });
  }

  idleAnim() { return this.carry ? this.pick('carry', 'idle') : this.pick('chef_idle', 'idle'); }

  _idlePlan() {
    const f = this.f, R = this.rng;
    if (!this.entered) {
      this.entered = true;
      f.x = this.xMax + 1.6;
      const home = clamp(this.vw / this.K * (this.menu.L?.spread ? 0.78 : 0.7), this.xMin + 1, this.xMax - 0.4);
      return this.run([
        { do: 'walk', x: home },
        { do: 'turn', yaw: 0 },
        { do: 'say', key: 'welcome' },
        { do: 'anim', names: ['bow_fancy', 'bow'] },
        { do: 'idle', dur: 1.4 },
      ]);
    }
    const r = R();
    if (r < 0.32) {
      return this.run([
        { do: 'walk', x: this.cartX },
        { do: 'turn', yaw: 0 },
        { do: 'fn', fn: () => { this.rig.holdProp?.('ladle'); this.stirring = true; } },
        { do: 'anim', names: ['chef_taste', 'count_coins'], t1: 4.2 },
        { do: 'fn', fn: () => { this.stirring = false; } },
        { do: 'say', key: 'taste' },
        { do: 'anim', names: this.has('chef_taste') ? ['chef_idle'] : ['cheer'], t1: 1.4 },
        { do: 'fn', fn: () => this.rig.holdProp?.(null) },
        { do: 'idle', dur: 0.8 + R() * 1.2 },
      ]);
    }
    if (r < 0.62) {
      let x = this.xMin + R() * (this.xMax - this.xMin);
      if (Math.abs(x - f.x) < 1.2) x = clamp(f.x + (x > f.x ? 1.6 : -1.6), this.xMin, this.xMax);
      return this.run([{ do: 'walk', x }, { do: 'turn', yaw: 0 }, { do: 'idle', dur: 1.6 + R() * 2.2 }]);
    }
    if (r < 0.8) return this.run([{ do: 'turn', yaw: 0 }, ...(R() < 0.5 ? [{ do: 'say', key: 'bow' }] : []), { do: 'anim', names: ['bow_fancy', 'bow'] }, { do: 'idle', dur: 1.5 + R() }]);
    if (r < 0.9) return this.run([{ do: 'turn', yaw: 0 }, { do: 'anim', names: ['polish_monocle', 'think'] }, { do: 'idle', dur: 1.2 }]);
    return this.run([{ do: 'turn', yaw: R() < 0.5 ? 0.5 : -0.5 }, { do: 'idle', dur: 2 + R() * 2 }]);
  }

  think(dt) {
    if (!this.rig) return;
    let guard = 6;
    while (guard-- > 0) {
      if (!this.step) { this._next(); if (!this.step) { this._idlePlan(); this._next(); } }
      const s = this.step;
      if (!s) return;
      s.t += dt;
      if (!this._do(s, dt)) return; // still running
      this.step = null;
      dt = 0;
    }
  }

  // returns true when the step is finished
  _do(s, dt) {
    const f = this.f;
    switch (s.do) {
      case 'walk': {
        const dx = s.x - f.x;
        if (Math.abs(dx) < 0.03) { f.x = s.x; this.play(this.idleAnim()); return true; }
        f.tyaw = Math.sign(dx) * 1.28;
        const run = s.run && !this.carry;
        this.play(this.carry ? this.pick('carry', 'walk') : run ? this.pick('run', 'walk') : 'walk');
        const sp = s.speed ?? (run ? 4.2 : this.carry ? 1.9 : 1.15);
        if (Math.abs(f.yaw - f.tyaw) < 1.0) f.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
        return false;
      }
      case 'turn': {
        f.tyaw = s.yaw;
        if (this.cur === 'walk' || this.cur === 'run' || this.cur === 'carry') this.play(this.idleAnim());
        return Math.abs(f.yaw - s.yaw) < 0.08 || s.t > 0.55;
      }
      case 'idle':
        this.play(this.idleAnim());
        return s.t >= (s.dur ?? 1.5);
      case 'anim': {
        if (!s.started) {
          s.started = true;
          const name = s.names.find((n) => this.has(n));
          if (!name) return true;
          s.name = name;
          this.cur = name;
          this.rig.play(name, { fade: 0.2, loop: s.loop, restart: true, onDone: () => { s.finished = true; } });
        }
        return s.finished || s.t >= (s.t1 ?? 6);
      }
      case 'wait': return s.t >= s.dur;
      case 'until': return !!s.test() || s.t > (s.max ?? 6);
      case 'say': this.menu._say(LINES[s.key] ? LINES[s.key][Math.floor(this.rng() * LINES[s.key].length)] : s.text); return true;
      case 'fn': s.fn(); return true;
      case 'hold': return false;
      default: return true;
    }
  }

  // ---------------------------------------------------------------- carrying
  attach(id, locked) {
    this.drop();
    const holder = new THREE.Group();
    const obj = makeTrophy({ id, locked });
    obj.visible = false;
    obj.scale.setScalar(1.3); // shown off big, cartoon style
    obj.position.y = -(obj.userData.height || 0.6) * 1.3 * 0.18; // the paws grip the plinth, the cup towers above
    holder.add(obj);
    const rig = this.rig;
    if (typeof rig.holdBoth === 'function') rig.holdBoth(holder);
    else rig.hold(holder);
    this.carry = { id, locked, holder, obj, landed: false };
    return this.carry;
  }
  drop() {
    const c = this.carry;
    if (!c) return;
    const rig = this.rig;
    if (typeof rig.holdBoth === 'function') rig.holdBoth(null); else rig.hold(null);
    c.holder.parent?.remove(c.holder);
    this.carry = null;
  }
  /** screen position (bottom centre) + scale of the carried trophy */
  carryScreen(out = {}) {
    const c = this.carry;
    if (!c) return null;
    c.obj.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().setFromMatrixPosition(c.obj.matrixWorld);
    this.toScreen(p, out);
    const top = new THREE.Vector3(0, c.obj.userData.height || 0.6, 0).applyMatrix4(c.obj.matrixWorld); // matrixWorld includes the 1.6x
    const t = this.toScreen(top, {});
    out.h = Math.hypot(t.x - out.x, t.y - out.y);
    out.topX = t.x; out.topY = t.y;
    return out;
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    if (!this.ok) return;
    this.think(dt);
    const f = this.f;
    f.yaw += (f.tyaw - f.yaw) * (1 - Math.exp(-dt * 9));
    const rig = this.rig;
    rig.root.position.set(f.x, 0, f.z);
    rig.root.rotation.y = f.yaw;
    rig.update(dt);
    const sp = this.menu._spot;
    this.L.spot.intensity = 2.6 * sp.a;
    this.L.hemi.intensity = 1.3 - 0.45 * sp.a;
    this.L.key.intensity = 2.2 - 0.6 * sp.a;
  }

  render() {
    if (!this.ok) return;
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }

  foxScreen() {
    if (!this.ok) return null;
    const feet = this.toScreen(this.rig.root.position, {});
    const head = this.toScreen(this.rig.headTop(new THREE.Vector3()), {});
    return { x: feet.x, y: feet.y, headX: head.x, headY: head.y };
  }

  potScreen() { return this.ok ? this.toScreen(new THREE.Vector3(this.cartX, 0.98, 0.55), {}) : null; }

  dispose() {
    if (!this.ok) return;
    this.drop();
    this.rig.dispose();
    this.rt.dispose(); this.rt.depthTexture.dispose();
    this.iconRT.dispose(); this.iconRT.depthTexture.dispose(); this.iconOut.dispose();
    this.post.dispose(); this.iconPost.dispose(); this.quad.geometry.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.ok = false; this.built = false;
  }
}

// ================================================================ 2D fx: spotlight, shadows, steam, sparkles
class FX {
  constructor(back, front) {
    this.back = back; this.front = front;
    this.bx = back.getContext('2d'); this.fx = front.getContext('2d');
    this.parts = [];
    this.w = 1; this.h = 1;
  }
  resize(vw, vh) {
    this.w = Math.max(2, Math.round(vw / PS)); this.h = Math.max(2, Math.round(vh / PS));
    for (const c of [this.back, this.front]) { c.width = this.w; c.height = this.h; }
  }
  // kinds: spark (twinkle star), steam (puff), conf (confetti), dust
  emit(kind, x, y, o = {}) {
    if (this.parts.length > 260) return;
    this.parts.push({ kind, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, t: 0, life: o.life ?? 1, size: o.size ?? 2, col: o.col ?? '#fff6d0', spin: o.spin ?? 0 });
  }
  burst(x, y, n = 14, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, sp = (o.speed ?? 120) * (0.4 + Math.random() * 0.8);
      this.emit('spark', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.5 + Math.random() * 0.5, size: 1 + Math.round(Math.random() * 2), col: Math.random() < 0.5 ? '#fff6d0' : '#ffd860' });
    }
  }
  confetti(x, y, n = 40) {
    const cols = ['#ffd860', '#fff6d0', '#e8543e', '#c42a26', '#f8d878', '#ffffff'];
    for (let i = 0; i < n; i++) this.emit('conf', x + (Math.random() - 0.5) * 60, y, { vx: (Math.random() - 0.5) * 220, vy: -160 - Math.random() * 200, life: 1.4 + Math.random() * 0.8, col: cols[i % cols.length], spin: Math.random() * 10 });
  }
  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      if (p.kind === 'conf') { p.vy += 420 * dt; p.vx *= 1 - dt * 1.2; p.vy = Math.min(p.vy, 140); }
      else if (p.kind === 'steam') { p.vx += Math.sin(p.t * 3 + p.y * 0.05) * 6 * dt; }
      else if (p.kind === 'spark') { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.vy += 30 * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
  }
  // ground shadows + the spotlight (under the fox)
  drawBack(spot, shadows) {
    const g = this.bx, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);
    if (spot.a > 0.005) {
      const a = spot.a;
      g.fillStyle = `rgba(10,3,6,${(0.6 * a).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      const sx = spot.x / PS, fy = spot.y / PS, top = -4, r0 = 10, r1 = spot.r / PS;
      for (let y = Math.max(0, top); y < Math.min(H, fy + 8); y++) {
        const u = clamp((y - top) / (fy - top), 0, 1.2);
        const half = r0 + (r1 - r0) * u;
        const x0 = Math.round(sx - half), x1 = Math.round(sx + half);
        g.clearRect(x0, y, x1 - x0, 1);
        g.fillStyle = `rgba(255,236,190,${(0.13 * a).toFixed(3)})`;
        g.fillRect(x0, y, x1 - x0, 1);
        g.fillStyle = `rgba(10,3,6,${(0.32 * a).toFixed(3)})`;
        for (let k = 0; k < 3; k++) { if (((y + k) & 1) === 0) { g.fillRect(x0 + k, y, 1, 1); g.fillRect(x1 - 1 - k, y, 1, 1); } }
      }
      // pool of light on the floor
      g.fillStyle = `rgba(255,240,200,${(0.22 * a).toFixed(3)})`;
      const pr = r1 * 1.1, ph = Math.max(3, pr * 0.22);
      for (let y = -Math.ceil(ph); y <= Math.ceil(ph); y++) {
        const hw = Math.round(pr * Math.sqrt(Math.max(0, 1 - (y / ph) ** 2)));
        g.fillRect(Math.round(sx - hw), Math.round(fy + y), hw * 2, 1);
      }
    }
    // soft pixel shadows under the fox and the cart
    for (const s of shadows) {
      if (!s) continue;
      const cx = s.x / PS, cy = s.y / PS, rx = s.rx / PS, ry = Math.max(1.5, s.ry / PS);
      g.fillStyle = 'rgba(12,4,8,0.38)';
      for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
        const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
        if (hw > 0) g.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, 1);
      }
    }
  }
  drawFront() {
    const g = this.fx;
    g.clearRect(0, 0, this.w, this.h);
    for (const p of this.parts) {
      const u = p.t / p.life, x = Math.round(p.x / PS), y = Math.round(p.y / PS);
      if (p.kind === 'spark') {
        const s = Math.max(0, Math.round(p.size * (u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7) + 0.3));
        g.fillStyle = p.col;
        g.fillRect(x, y, 1, 1);
        if (s > 0) { g.fillRect(x - s, y, s, 1); g.fillRect(x + 1, y, s, 1); g.fillRect(x, y - s, 1, s); g.fillRect(x, y + 1, 1, s); }
      } else if (p.kind === 'steam') {
        const r = 1 + Math.round(u * 3);
        g.fillStyle = `rgba(255,250,240,${(0.5 * (1 - u)).toFixed(3)})`;
        for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + 0.5 && ((xx + yy + x + y) & 1 || u < 0.4)) g.fillRect(x + xx, y + yy, 1, 1);
      } else if (p.kind === 'conf') {
        g.fillStyle = p.col;
        const flip = Math.sin(p.t * p.spin) > 0;
        g.fillRect(x, y, flip ? 2 : 1, flip ? 1 : 2);
      }
    }
  }
}

// ================================================================ the menu
export class RestaurantMenu {
  /**
   * @param {object} o
   * @param {object} o.game      the Game (state, ui.icons, audio)
   * @param {HTMLElement} [o.root] parent for the fixed overlay (default document.body)
   */
  constructor({ game = null, root = null, zIndex = 75, autoUpdate = true, sfx = null, onClose = null, keys = true, seed = null } = {}) {
    this.game = game;
    this.root = root || document.body;
    this.opts = { zIndex, autoUpdate, keys, seed };
    this.sfxFn = sfx;
    this.onClose = onClose;
    this.isOpen = false;
    this.section = 'rating';
    this.L = null;
    this._built = false;
    this._tweens = [];
    this._raf = 0; this._last = 0; this._t = 0;
    this._spot = { a: 0, target: 0, x: 0, y: 0, r: 60 };
    this._present = null;
    this._sayT = 0;
    this._sig = '';
    this._sigT = 0;
    this._tick = this._tick.bind(this);
    this._onResize = () => { clearTimeout(this._rzT); this._rzT = setTimeout(() => { if (this.isOpen) this._relayout(); }, 120); };
    this._onKey = (e) => {
      if (!this.isOpen || e.key !== 'Escape') return;
      e.stopPropagation(); e.preventDefault();
      this.back();
    };
    this.stage = new FoxStage(this);
  }

  // ---------------------------------------------------------------- public API
  open({ section = 'rating' } = {}) {
    const sec = SECTIONS.includes(section) ? section : 'rating';
    this._build();
    if (this.isOpen) { this.show(sec); return; }
    this.isOpen = true;
    this.section = sec;
    this.el.style.display = 'block';
    this.el.style.opacity = '1';
    this._layout();
    this._renderSpread();
    this._openAnim();
    window.addEventListener('resize', this._onResize);
    if (this.opts.keys) window.addEventListener('keydown', this._onKey, true);
    this._sig = this._signature();
    this._start();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._abortPresent();
    this._spot.a = this._spot.target = 0;
    this._sfx('menu_close', { volume: 0.5 });
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey, true);
    const el = this.el;
    this._tweens = [];
    const t0 = performance.now();
    const fade = () => {
      const u = clamp01((performance.now() - t0) / 180);
      el.style.opacity = String(1 - u);
      this.book.style.transform = `translate(${this._bx}px, ${this._by + u * 18}px) scale(${1 - u * 0.03})`;
      if (u < 1 && !this.isOpen) requestAnimationFrame(fade);
      else if (!this.isOpen) { el.style.display = 'none'; this.stage.entered = false; this.stage.plan = []; this.stage.step = null; }
    };
    requestAnimationFrame(fade);
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.onClose?.();
  }

  /** Re-read game state and redraw the visible pages (keeps scroll positions). */
  refresh() {
    if (!this._built || !this.isOpen) return;
    if (this._present) { this._dirty = true; return; }
    const keep = [...this.book.querySelectorAll('.rm-page .rm-scroll')].map((s) => s.scrollTop);
    this._renderSpread();
    [...this.book.querySelectorAll('.rm-page .rm-scroll')].forEach((s, i) => { s.scrollTop = keep[i] || 0; });
    this._sig = this._signature();
  }

  /** Switch section (page flip). */
  show(section) {
    if (!SECTIONS.includes(section) || !this.isOpen) return;
    if (this._flipping) { this._queued = section; return; }
    const from = this._spreadOf(this.section), to = this._spreadOf(section);
    const prevSec = this.section;
    this.section = section;
    this._updateTabs();
    if (from === to && this.L.spread) { this._sfx('click', { volume: 0.25 }); return; }
    if (this._present) this._abortPresent(true);
    this._flip(from, to, prevSec);
  }

  /** Esc / back: put the presented trophy back, else close. */
  back() {
    if (!this.isOpen) return false;
    if (this._present) { this.dismiss(); return true; }
    this.close();
    return true;
  }

  /** Fetch and present a trophy (achievement id). */
  present(id) {
    if (!this.isOpen || !ACH.has(id)) return;
    if (this.section !== 'trophies') { this.show('trophies'); this._afterFlip = () => this.present(id); return; }
    const P = this._present;
    if (P && P.id === id) { if (P.phase === 'shown') this.dismiss(); return; }
    if (P) this._abortPresent(true);
    const locked = !this._got(id);
    const slot = this._slotEl(id);
    if (slot && this.L.single) this._scrollIntoView(slot);
    this._present = { id, locked, phase: 'fetch' };
    this._catch.style.display = 'block';
    if (!this.stage.ok) { this._present.phase = 'shown'; this._showPlaque(id); return; }
    this._sfx('click', { volume: 0.3 });
    const st = this.stage;
    const sx = this._slotPoint(id)?.x ?? this.L.vw / 2;
    st.run([
      { do: 'walk', x: clamp(sx / this.L.K, st.xMin, st.xMax), run: true },
      { do: 'turn', yaw: 0 },
      { do: 'fn', fn: () => this._pickup(id) },
      { do: 'until', test: () => st.carry?.id === id && st.carry.landed, max: 3 },
      { do: 'wait', dur: 0.12 },
      { do: 'walk', x: st.centerX },
      { do: 'turn', yaw: 0 },
      { do: 'fn', fn: () => this._presentNow(id) },
      { do: 'hold' },
    ]);
  }

  /** Put the presented trophy back. */
  dismiss() {
    const P = this._present;
    if (!P) return;
    if (P.phase !== 'shown') { this._abortPresent(true); return; }
    P.phase = 'return';
    this._hidePlaque();
    this._spot.target = 0;
    this._sfx('menu_page', { volume: 0.18, pitch: 1.3 });
    const st = this.stage;
    if (!st.ok) { this._present = null; this._catch.style.display = 'none'; return; }
    const sx = this._slotPoint(P.id)?.x ?? this.L.vw / 2;
    st.run([
      { do: 'walk', x: clamp(sx / this.L.K, st.xMin, st.xMax) },
      { do: 'turn', yaw: 0 },
      { do: 'fn', fn: () => this._putBack(P.id) },
      { do: 'wait', dur: 0.55 },
      { do: 'anim', names: ['bow_fancy', 'bow'], t1: 2.2 },
    ]);
    this._catch.style.display = 'none';
  }

  update(dt) {
    if (!this.isOpen || !this._built) return;
    dt = clamp(dt || 0, 0, 0.1);
    this._t += dt;
    // tweens
    if (this._tweens.length) {
      const list = this._tweens.slice();
      for (const tw of list) {
        tw.t += dt;
        if (tw.t < 0) continue;
        tw.fn(clamp01(tw.t / tw.dur));
        if (tw.t >= tw.dur) { const k = this._tweens.indexOf(tw); if (k < 0) continue; this._tweens.splice(k, 1); tw.done?.(); }
      }
    }
    // spotlight follows the fox
    const sp = this._spot;
    sp.a += (sp.target - sp.a) * (1 - Math.exp(-dt * 7));
    if (Math.abs(sp.target - sp.a) < 0.003) sp.a = sp.target;
    this.stage.update(dt);
    const fs = this.stage.foxScreen();
    if (fs) { sp.x = fs.x; sp.y = fs.y; sp.r = this.L.foxH * 0.62; }
    // steam from the pot
    const pot = this.stage.potScreen();
    if (pot && (this._steamT = (this._steamT || 0) - dt) <= 0) {
      this._steamT = this.stage.stirring ? 0.09 : 0.28;
      this.fx.emit('steam', pot.x + (Math.random() - 0.5) * this.L.K * 0.25, pot.y, { vy: -22 - Math.random() * 18, vx: (Math.random() - 0.5) * 8, life: 1.3 + Math.random() * 0.6 });
    }
    // twinkles on the carried trophy
    const c = this.stage.carry;
    if (c?.landed && !c.locked && (this._twT = (this._twT || 0) - dt) <= 0) {
      this._twT = 0.18 + Math.random() * 0.25;
      const g = c.obj.userData.glints;
      if (g?.length) {
        const v = g[Math.floor(Math.random() * g.length)].clone().applyMatrix4(c.obj.matrixWorld);
        const s = this.stage.toScreen(v, {});
        this.fx.emit('spark', s.x, s.y, { life: 0.45, size: 2 });
      }
    }
    this.fx.update(dt);
    const shadows = [];
    if (fs) shadows.push({ x: fs.x, y: fs.y + 2, rx: this.L.K * 0.34, ry: this.L.K * 0.07 });
    if (this.stage.ok) { const cs = this.stage.toScreen(new THREE.Vector3(this.stage.cartX, 0, 0.55), {}); shadows.push({ x: cs.x, y: cs.y + 2, rx: this.L.K * 0.5, ry: this.L.K * 0.08 }); }
    this.fx.drawBack(sp, shadows);
    this.fx.drawFront();
    // rosette shimmer
    if (this._rosettes?.length) {
      const per = 3.4;
      this._rosettes.forEach((r, i) => {
        const ph = ((this._t - i * 0.11) % per) / per * 70 - 14;
        drawRosette(r.cv, r.fill, ph);
      });
    }
    // speech bubble + hit box follow the fox
    if (fs) {
      if (this._sayT > 0) {
        this._sayT -= dt;
        const u = this._sayT;
        const pop = clamp01((this._sayDur - u) / 0.18);
        this._sayEl.style.display = 'block';
        const cs = this.stage.carry?.landed ? this.stage.carryScreen({}) : null;
        const sy = cs ? Math.min(fs.headY, cs.topY - 6) : fs.headY;
        this._sayEl.style.transform = `translate(${Math.round(fs.headX - this._sayEl.offsetWidth / 2)}px, ${Math.round(sy - this._sayEl.offsetHeight - 16)}px) scale(${(0.6 + 0.4 * easeBack(pop)).toFixed(3)})`;
        if (u <= 0) this._sayEl.style.display = 'none';
      }
      const hb = this._hit, hw = this.L.K * 0.7, hh = fs.y - fs.headY;
      hb.style.transform = `translate(${Math.round(fs.x - hw / 2)}px, ${Math.round(fs.headY)}px)`;
      hb.style.width = `${Math.round(hw)}px`; hb.style.height = `${Math.round(hh)}px`;
    }
    if (this._present?.phase === 'shown') this._placePlaque();
    if (!this._skipRender) this.stage.render();
    // poll for game changes (new reviews, trophies) about once a second
    if ((this._sigT -= dt) <= 0) {
      this._sigT = 1;
      const s = this._signature();
      if (s !== this._sig && !this._flipping && !this._opening) this.refresh();
    }
  }

  dispose() {
    this.close();
    if (!this._built) return;
    this.stage.dispose();
    this.el.remove();
    this._built = false;
  }

  // ---------------------------------------------------------------- state helpers
  _st() { return this.game?.state || {}; }
  _got(id) { return (this._st().achievements || []).includes(id); }
  _signature() {
    const st = this._st(), rv = st.reviews || [];
    return `${(+st.rating || 0).toFixed(2)}|${rv.length}|${rv[0]?.text || ''}|${(st.achievements || []).length}`;
  }
  _sfx(name, o = {}) {
    try {
      if (this.sfxFn) { this.sfxFn(name, o); return; }
      this.game?.audio?.play?.(name, { volume: 0.5, ...o });
    } catch { /* audio is optional */ }
  }
  _say(text, dur = 2.4) {
    if (!text || !this._sayEl) return;
    this._sayEl.textContent = text;
    this._sayDur = this._sayT = dur;
    try {
      const b = this.game?.audio?.babble;
      if (this.sfxFn?.babble) this.sfxFn.babble('fox', text);
      else if (typeof b === 'function') b.call(this.game.audio, 'fox', text, { volume: 0.7 });
      this.stage.rig?.talk?.(text);
    } catch { /* optional */ }
  }
  _portrait(type) {
    try {
      const u = this.game?.ui?.icons?.bear?.(type);
      if (u) return u;
    } catch { /* placeholder below */ }
    return cached('bearph', () => {
      const p = new Pix(18, 18), b = rgb('#8a5a30'), bl = rgb('#c09060'), s = rgb('#2a3550'), w = rgb('#f2f2ee');
      const mk = new Mask(18, 18).ell(9, 8, 5.5, 5, 1).ell(4.5, 3.5, 1.8, 1.8, 1).ell(13.5, 3.5, 1.8, 1.8, 1);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
        if (mk.at(x, y)) p.set(x, y, y > 8 && Math.abs(x - 9) < 3 ? bl : b);
        if (y >= 13 && Math.abs(x - 9) < 7 - (y - 13) * -0.4) p.set(x, y, Math.abs(x - 9) < 1 ? w : s);
      }
      p.set(7, 7, INK); p.set(11, 7, INK); p.set(9, 10, INK);
      return p.url();
    });
  }

  // ---------------------------------------------------------------- DOM
  _build() {
    if (this._built) return;
    this._built = true;
    const el = (this.el = document.createElement('div'));
    el.className = 'rm-root';
    el.style.zIndex = String(this.opts.zIndex);
    el.innerHTML = `<div class="rm-backdrop"></div>
      <div class="rm-book"><img class="rm-folder" alt=""><div class="rm-page rm-left"></div><div class="rm-page rm-right"></div><div class="rm-tabs"></div></div>
      <canvas class="rm-fxback"></canvas>`;
    this.root.appendChild(el);
    this.book = el.querySelector('.rm-book');
    this.folder = el.querySelector('.rm-folder');
    this.pageL = el.querySelector('.rm-left');
    this.pageR = el.querySelector('.rm-right');
    this.tabs = el.querySelector('.rm-tabs');
    const back = el.querySelector('.rm-fxback');
    this.stage.build(el);
    const front = document.createElement('canvas');
    front.className = 'rm-fxfront';
    el.appendChild(front);
    this.fx = new FX(back, front);
    // click-catcher while presenting, the fox hit box, the bubble, the close button
    const mk = (cls, tag = 'div') => { const d = document.createElement(tag); d.className = cls; el.appendChild(d); return d; };
    this._catch = mk('rm-catch');
    this._catch.addEventListener('click', () => this.dismiss());
    this._hit = mk('rm-foxhit');
    this._hit.addEventListener('click', (e) => { e.stopPropagation(); this._poke(); });
    this._sayEl = mk('rm-say');
    this._sayEl.style.display = 'none';
    this._x = document.createElement('button');
    this._x.className = 'rm-x';
    this._x.title = 'Close';
    this._x.style.backgroundImage = `url(${closeURL()})`;
    this._x.addEventListener('click', () => this.close());
    this.book.appendChild(this._x);
    // tabs
    const tabDefs = [['rating', 'Rating'], ['reviews', 'Reviews'], ['trophies', 'Trophies']];
    this.tabs.innerHTML = tabDefs.map(([id, label]) => `<button class="rm-tab" data-sec="${id}"><img src="${fleuronURL()}" width="11" height="11" alt="">${label}</button>`).join('');
    this.tabs.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => { this._sfx('click', { volume: 0.3 }); this.show(b.dataset.sec); }));
    el.addEventListener('pointerdown', () => { try { this.game?.audio?.unlock?.(); } catch { /* */ } });
  }

  _measure() {
    const vw = Math.max(320, window.innerWidth || 1280), vh = Math.max(320, window.innerHeight || 720);
    const spread = vw >= 880 && vh >= 540;
    const foxH = spread ? clamp(vh * 0.21, 120, 176) : clamp(vh * 0.13, 84, 112);
    const K = foxH / FOX_H;
    const floor = vh - (spread ? 10 : 6);
    const B = spread ? 14 : 10;
    const tabsH = 30;
    const top = even(8 + tabsH - 6);
    const bottom = floor - foxH * (spread ? 0.4 : 0.42);
    const ph = even(bottom - top - 2 * B);
    const pw = spread ? even(Math.min(ph * 0.74, (vw - 40 - 3 * B) / 2)) : even(Math.min(vw - 12 - 2 * B, 620));
    const bw = spread ? 2 * pw + 3 * B : pw + 2 * B;
    const bh = ph + 2 * B;
    const left = even((vw - bw) / 2);
    return { vw, vh, spread, single: !spread, foxH, K, floor, B, pw, ph, bw, bh, left, top, tabsH };
  }

  _layout() {
    const L = (this.L = this._measure());
    this.el.classList.toggle('rm-single', L.single);
    const bk = this.book;
    bk.style.width = `${L.bw}px`; bk.style.height = `${L.bh}px`;
    this._bx = L.left; this._by = L.top;
    bk.style.transform = `translate(${L.left}px, ${L.top}px)`;
    this.folder.src = folderArt(L.bw / S, L.bh / S, L.spread);
    this.folder.style.width = `${L.bw}px`; this.folder.style.height = `${L.bh}px`;
    const place = (p, x) => { p.style.left = `${x}px`; p.style.top = `${L.B}px`; p.style.width = `${L.pw}px`; p.style.height = `${L.ph}px`; };
    if (L.spread) { place(this.pageL, L.B); place(this.pageR, L.B * 2 + L.pw); this.pageL.style.display = ''; }
    else { place(this.pageR, L.B); this.pageL.style.display = 'none'; }
    this.tabs.style.left = `${L.B + 6}px`;
    this.tabs.style.top = `${-L.tabsH + 2}px`;
    this._x.style.left = `${L.bw - 26}px`;
    this._x.style.top = `${-12}px`;
    this.stage.resize(L);
    this.fx.resize(L.vw, L.vh);
    this._updateTabs();
  }

  _relayout() {
    const sec = this.section;
    this._abortPresent();
    this._layout();
    this._renderSpread();
    this.section = sec;
  }

  _updateTabs() {
    this.tabs.querySelectorAll('[data-sec]').forEach((b) => {
      const on = this.L?.spread ? this._spreadOf(b.dataset.sec) === this._spreadOf(this.section) && (b.dataset.sec === this.section || this._spreadOf(this.section) === 0) : b.dataset.sec === this.section;
      b.classList.toggle('rm-on', on);
    });
  }

  _spreadOf(sec) { return this.L?.spread ? (sec === 'trophies' ? 1 : 0) : SECTIONS.indexOf(sec); }
  _kinds(spreadIdx) {
    if (this.L.spread) return spreadIdx === 1 ? ['cabinet', 'list'] : ['rating', 'reviews'];
    return [null, ['rating', 'reviews', 'trophies'][spreadIdx]];
  }

  _renderSpread() {
    const [l, r] = this._kinds(this._spreadOf(this.section));
    this._rosettes = [];
    if (l) this._mountPage(this.pageL, l, -1, true);
    this._mountPage(this.pageR, r, this.L.spread ? 1 : 0, true);
  }

  _mountPage(el, kind, gutter, live) {
    const L = this.L;
    el.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'rm-paper';
    img.alt = '';
    img.src = pageArt(L.pw / S, L.ph / S, gutter, kind.length);
    el.appendChild(img);
    const sc = document.createElement('div');
    sc.className = 'rm-scroll';
    el.appendChild(sc);
    const cw = L.pw - (L.single ? 40 : 56);
    sc.innerHTML = this._html(kind, cw);
    this._wire(sc, kind, cw, live);
    if (kind === 'cabinet') sc.classList.add('rm-noscroll');
    return el;
  }

  _html(kind, cw) {
    const st = this._st();
    switch (kind) {
      case 'rating': return this._ratingHTML(st, cw);
      case 'reviews': return this._reviewsHTML(st, cw);
      case 'cabinet': return this._cabinetHTML(st, cw, this.L.ph - 92);
      case 'list': return this._listHTML(st);
      case 'trophies': return `${this._head('Le cabinet', 'The Trophy Cabinet')}${this._cabinetHTML(st, cw, 600, true)}${this._listHTML(st, true)}`;
      default: return '';
    }
  }

  _head(kicker, title) {
    return `<div class="rm-kicker">${esc(kicker)}</div><h2 class="rm-h">${esc(title)}</h2><img class="rm-divider" src="${dividerURL(96)}" width="192" height="18" alt="">`;
  }
  _dots() { return `<i class="rm-dots" style="background-image:url(${dotsURL()})"></i>`; }
  _stars(n) {
    let s = '<span class="rm-stars">';
    for (let i = 1; i <= 5; i++) s += `<img src="${starURL(n >= i)}" alt="">`;
    return s + '</span>';
  }

  _ratingHTML(st, cw) {
    const r = clamp(+st.rating || 0, 0, 5);
    const verdict = VERDICTS.find(([v]) => r >= v)[1];
    const reviews = st.reviews || [];
    const day = st.day || 1;
    const today = reviews.filter((x) => x.day === day);
    const pool = today.length ? today : reviews.slice(0, 8);
    const q = pool.find((x) => x.type === 'critic') || pool.slice().sort((a, b) => (b.weight || 1) - (a.weight || 1) || b.stars - a.stars)[0];
    const gw = Math.min(cw - 20, 300) & ~1;
    const fives = reviews.filter((x) => x.stars >= 5).length;
    let h = this._head('La note du soir', "Tonight's Rating");
    h += '<div class="rm-rosettes">' + [0, 1, 2, 3, 4].map((i) => `<canvas width="${ROS}" height="${ROS}" data-fill="${clamp01(r - i).toFixed(3)}"></canvas>`).join('') + '</div>';
    h += `<div class="rm-score"><span class="rm-foil rm-onpaper rm-big">${r.toFixed(2)}</span><span class="rm-of">/ 5</span></div>`;
    h += `<div class="rm-verdict">${esc(verdict)}</div>`;
    h += `<div class="rm-gauge" style="width:${gw}px;height:20px"><img src="${gaugeURL(gw / S, r)}" style="width:${gw}px;height:20px" alt=""></div>`;
    h += `<div class="rm-gauge-l" style="width:${gw}px"><span>0</span><b>1.0 = closed</b><span>5</span></div>`;
    if (r < 1.8) {
      const rw = Math.min(cw, 330) & ~1;
      h += `<div class="rm-ribbon" style="width:${rw}px"><img src="${ribbonURL(rw / S)}" style="width:${rw}px;height:40px" alt=""><span>${r < 1.25 ? 'LAST CHANCE! 1.0 = CLOSED' : 'DANGER! BELOW 1.0 WE CLOSE'}</span></div>`;
    }
    h += '<div class="rm-qlabel">Quote of the day</div>';
    if (q) h += `<div class="rm-quote"><img class="rm-qmark" src="${fleuronURL()}" width="22" height="22" alt=""><div class="rm-q">"${esc(q.text)}"</div><cite>- ${esc(q.name)}, ${esc(q.dept)}</cite></div>`;
    else h += `<div class="rm-quote"><img class="rm-qmark" src="${fleuronURL()}" width="22" height="22" alt=""><div class="rm-q">"Doors open at 5 PM. The suits are hungry."</div><cite>- Reynard, chef</cite></div>`;
    h += '<div class="rm-lines">';
    const line = (a, b) => `<div class="rm-line"><span>${a}</span>${this._dots()}<b>${b}</b></div>`;
    h += line('Best rating ever', (+st.bestRating || r).toFixed(2));
    h += line('Reviews on file', reviews.length);
    h += line('Five-star reviews', fives);
    h += line('Trophies', `${(st.achievements || []).length} / ${ACHIEVEMENTS.length}`);
    h += '</div>';
    h += '<div class="rm-fine">Keep it above 1.0 or Chez Reynard closes for good.</div>';
    return h;
  }

  _reviewsHTML(st) {
    const reviews = (st.reviews || []).slice(0, 30);
    let h = this._head('Les critiques', 'The Reviews');
    if (!reviews.length) return h + '<div class="rm-empty">No reviews yet.<br>The first suits arrive at 5 PM.</div>';
    for (const c of COURSES) {
      const list = reviews.filter((r) => c.test(r.stars | 0));
      if (!list.length) continue;
      const head = `<div class="rm-course-h"><img src="${fleuronURL()}" width="22" height="22" alt="">${esc(c.title)}<img src="${fleuronURL()}" width="22" height="22" alt=""></div><div class="rm-course-sub">${esc(c.sub)}</div>`;
      const dishes = list.map((r) => this._dish(r)).join('');
      if (c.id === 'chef') h += `<section class="rm-course rm-chef" data-chef="1">${head}${dishes}</section>`;
      else h += `<section class="rm-course">${head}${dishes}</section>`;
    }
    return h;
  }

  _dish(r) {
    const cm = cameoURLs();
    const wt = r.weight > 1 ? `<span class="rm-wt">x${r.weight}</span>` : '';
    return `<div class="rm-dish"><div class="rm-cameo"><img class="rm-cbg" src="${cm.back}" alt=""><img class="rm-por" src="${this._portrait(r.type)}" alt=""><img class="rm-ring" src="${cm.ring}" alt=""></div>
      <div class="rm-dish-b"><div class="rm-dish-t"><span class="rm-dish-n">"${esc(r.text)}"</span>${this._dots()}${this._stars(r.stars | 0)}</div>
      <div class="rm-dish-by">${esc(r.name)} &middot; ${esc(r.dept)} &middot; day ${r.day ?? '?'}${wt}</div></div></div>`;
  }

  _cabGeom(cw, ah, single) {
    const w = Math.floor(cw / S);
    const cols = 3, rows = 5;
    const top = 26, base = 9;
    const colW = Math.floor((w - 12) / cols);
    const fx = Math.floor((w - colW * cols) / 2);
    const bandH = single ? 50 : clamp(Math.floor((ah / S - top - base) / rows), 40, 56);
    const plateH = 15;
    const shelfY = bandH - plateH - 2;
    return { w, h: top + base + bandH * rows, fx, top, base, cols, rows, colW, bandH, shelfY, plateH };
  }

  _cabinetHTML(st, cw, ah, single = false) {
    const g = this._cabGeom(cw, ah, single);
    this._cab = g;
    const ppw = clamp(Math.floor((g.shelfY - 2) / 0.7), 28, 50);
    this._ppw = ppw;
    const got = (st.achievements || []).length;
    let h = `<div class="rm-cabinet" style="width:${g.w * S}px;height:${g.h * S}px"><img class="rm-cab-art" src="${cabinetURL(g)}" alt="">`;
    h += `<div class="rm-cab-title" style="top:${(15 + 1) * S}px">The Trophy Cabinet</div>`;
    h += `<div class="rm-cab-count" style="top:${(g.top + g.bandH * g.rows + 1) * S}px"></div>`;
    ACHIEVEMENTS.forEach((a, i) => {
      const r = Math.floor(i / g.cols), c = i % g.cols;
      const x = (g.fx + c * g.colW) * S, y = (g.top + r * g.bandH) * S, w = g.colW * S, hh = g.bandH * S;
      const done = this._got(a.id);
      const ic = this.stage.icon(a.id, !done, ppw);
      const iw = ic.w * S, ih = ic.h * S;
      const ty = g.shelfY * S - (ic.baseY + 1) * S + S;
      let inner = `<img class="rm-tro" src="${ic.url}" style="width:${iw}px;height:${ih}px;top:${ty}px" alt="">`;
      if (!done && ic.mask) {
        const cl = clothURL(`${a.id}:${ppw}`, ic.mask, ic.w, ic.h, ic.baseY);
        inner += `<img class="rm-cloth" src="${cl.url}" style="width:${cl.w * S}px;height:${cl.h * S}px;top:${ty}px" alt="">`;
      } else if (done) {
        inner += `<img class="rm-glint" src="${glintURL()}" style="left:${Math.round(w / 2 - iw * 0.22)}px;top:${ty + ic.topY * S + 2}px;animation-delay:${(-i * 0.83).toFixed(2)}s" alt="">`;
      }
      const plateTop = (g.shelfY + 3) * S;
      inner += done
        ? `<span class="rm-plate rm-name ${a.name.length > 13 ? 'rm-long' : ''}" style="top:${plateTop}px">${esc(a.name)}</span>`
        : `<span class="rm-plate rm-how" style="top:${plateTop}px"><i>How to get:</i> ${esc(a.desc)}</span>`;
      inner += `<span class="rm-tag ${done ? 'rm-got' : ''}" style="top:${Math.max(4, ty + ih * 0.35) | 0}px"><img src="${coinURL()}" alt="" style="width:14px;height:14px">${a.reward}</span>`;
      h += `<button class="rm-slot" data-id="${a.id}" title="${esc(a.name)}" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px">${inner}</button>`;
    });
    h += '</div>';
    h += `<div class="rm-sub" style="margin-top:6px">${got} of ${ACHIEVEMENTS.length} collected &middot; tap one</div>`;
    return h;
  }

  _listHTML(st, inline = false) {
    const days = st.achievementDays || st.trophyDays || {};
    let h = inline ? '<div style="height:18px"></div>' : '';
    h += this._head('La carte des trophées', 'How to Earn Them');
    h += '<div class="rm-wine">';
    for (const a of ACHIEVEMENTS) {
      const done = this._got(a.id), n = ACH.get(a.id).n;
      const d = days[a.id];
      const mark = done ? `<span class="rm-mark rm-yes"><img src="${checkURL()}" style="width:16px;height:14px;display:inline-block" alt="">${d ? `<br>day ${d}` : ''}</span>` : `<span class="rm-mark rm-no"><img src="${lockURL()}" style="width:14px;height:16px;display:inline-block" alt=""></span>`;
      h += `<button class="rm-wl ${done ? '' : 'rm-lock'}" data-id="${a.id}"><span class="rm-bin">${String(n).padStart(2, '0')}</span><span class="rm-wl-b"><span class="rm-line"><span>${esc(a.name)}</span>${this._dots()}<b><img src="${coinURL()}" style="width:14px;height:14px" alt="">${a.reward}</b></span><span class="rm-wl-d" style="display:block">${esc(a.desc)}</span></span>${mark}</button>`;
    }
    h += '</div>';
    return h;
  }

  _wire(sc, kind, cw, live) {
    if (!live) return;
    if (kind === 'rating') {
      sc.querySelectorAll('.rm-rosettes canvas').forEach((cv) => {
        const r = { cv, fill: +cv.dataset.fill };
        drawRosette(cv, r.fill, -20);
        this._rosettes.push(r);
      });
    }
    if (kind === 'reviews') {
      const box = sc.querySelector('.rm-chef');
      if (box) {
        requestAnimationFrame(() => {
          const w = box.offsetWidth, hh = box.offsetHeight;
          if (!w || !hh) return;
          const img = document.createElement('img');
          img.className = 'rm-chef-frame';
          img.alt = '';
          img.src = chefFrameURL(Math.round(w / S), Math.round(hh / S));
          Object.assign(img.style, { position: 'absolute', left: '0', top: '0', width: `${Math.round(w / S) * S}px`, height: `${Math.round(hh / S) * S}px`, pointerEvents: 'none' });
          box.prepend(img);
        });
      }
    }
    if (kind === 'cabinet' || kind === 'trophies' || kind === 'list') {
      sc.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.present(b.dataset.id); }));
    }
  }

  // ---------------------------------------------------------------- open / flip animations
  _tween(dur, fn, done, delay = 0) { const tw = { t: -delay, dur, fn, done }; this._tweens.push(tw); return tw; }

  _openAnim() {
    const L = this.L;
    this._opening = true;
    const panelW = L.spread ? L.bw / 2 : L.bw;
    const flap = document.createElement('div');
    flap.className = 'rm-flap';
    Object.assign(flap.style, { left: `${L.spread ? L.bw / 2 : 0}px`, top: '0px', width: `${panelW}px`, height: `${L.bh}px`, transformOrigin: '0 50%' });
    const crestY = Math.round(L.bh / S * 0.12);
    const front = document.createElement('div');
    front.className = 'rm-face rm-cover';
    front.innerHTML = `<img src="${coverArt(panelW / S, L.bh / S, crestY)}" style="width:${panelW}px;height:${L.bh}px" alt="">
      <div class="rm-cover-text" style="top:${(crestY + 70) * S}px"><div class="rm-cover-name rm-foil">Chez Reynard</div><div class="rm-cover-sub">FINE POND DINING</div><div class="rm-cover-est">est. day 1 &middot; by the pond</div></div>
      <div class="rm-cover-hint">tap to open</div>`;
    const backF = document.createElement('div');
    backF.className = 'rm-face rm-back';
    backF.innerHTML = `<img src="${folderArt(panelW / S, L.bh / S, false)}" style="width:${panelW}px;height:${L.bh}px" alt=""><div class="rm-shade"></div>`;
    const shade = document.createElement('div');
    shade.className = 'rm-shade';
    front.appendChild(shade);
    flap.append(front, backF);
    this.book.appendChild(flap);
    this.book.style.perspective = '2200px';
    this.pageL.classList.add('rm-dim');
    this.pageL.style.opacity = L.spread ? '0' : '';
    this.tabs.style.opacity = '0';
    this._x.style.opacity = '0';
    const shift = L.spread ? -L.bw / 4 : 0;
    if (L.spread) this.folder.style.clipPath = 'inset(0 0 0 50%)'; // closed: only the front panel exists
    let held = false;
    const swing = () => {
      if (held) return;
      held = true;
      this._sfx('menu_open', { volume: 0.6 });
      this._tween(0.72, (u) => {
        const e = easeIO(u);
        flap.style.transform = `rotateY(${(-180 * e).toFixed(2)}deg)`;
        if (e > 0.5) this.folder.style.clipPath = '';
        shade.style.opacity = String(clamp01(e * 2) * 0.55);
        backF.querySelector('.rm-shade').style.opacity = String((1 - clamp01(e * 2 - 1)) * 0.5);
        this.book.style.transform = `translate(${(this._bx + shift * (1 - e)).toFixed(1)}px, ${this._by}px)`;
        if (!L.spread && e > 0.5) flap.style.opacity = String(1 - (e - 0.5) * 2);
        this.tabs.style.opacity = String(clamp01(e * 1.6 - 0.6));
        this._x.style.opacity = String(clamp01(e * 1.6 - 0.6));
      }, () => {
        flap.remove();
        this.pageL.style.opacity = '';
        this._tween(0.2, (u) => { this.pageL.querySelector('.rm-scroll') && (this.pageL.querySelector('.rm-scroll').style.opacity = String(u)); }, () => {
          this.pageL.classList.remove('rm-dim');
          const s = this.pageL.querySelector('.rm-scroll'); if (s) s.style.opacity = '';
        });
        this.book.style.perspective = '';
        this._opening = false;
      });
    };
    front.addEventListener('click', swing);
    this.book.style.opacity = '0';
    this._tween(0.34, (u) => {
      const e = easeOut(u);
      this.book.style.opacity = String(e);
      this.book.style.transform = `translate(${this._bx + shift}px, ${this._by + (1 - e) * 28}px) scale(${(0.95 + 0.05 * e).toFixed(4)})`;
    }, () => { this.book.style.opacity = ''; this._tween(0.5, () => {}, swing); });
    this._sfx('menu_page', { volume: 0.25, pitch: 0.8 });
  }

  _flip(from, to, prevSec) {
    const L = this.L;
    this._flipping = true;
    const fwd = to > from;
    if (L.spread) {
      const [nl, nr] = this._kinds(to);
      const leaf = document.createElement('div');
      leaf.className = 'rm-leaf';
      const src = fwd ? this.pageR : this.pageL;
      Object.assign(leaf.style, { left: src.style.left, top: src.style.top, width: `${L.pw}px`, height: `${L.ph}px`, transformOrigin: fwd ? '0 50%' : '100% 50%' });
      const frontF = document.createElement('div'); frontF.className = 'rm-face';
      const backF = document.createElement('div'); backF.className = 'rm-face rm-back';
      frontF.appendChild(src.cloneNode(true)).style.cssText = `left:0;top:0;width:${L.pw}px;height:${L.ph}px`;
      const tmp = document.createElement('div');
      tmp.className = 'rm-page';
      tmp.style.cssText = `left:0;top:0;width:${L.pw}px;height:${L.ph}px`;
      this._rosettesTmp = this._rosettes;
      this._rosettes = [];
      this._mountPage(tmp, fwd ? nl : nr, fwd ? -1 : 1, false);
      backF.appendChild(tmp);
      const sh1 = document.createElement('div'); sh1.className = 'rm-shade'; frontF.appendChild(sh1);
      const sh2 = document.createElement('div'); sh2.className = 'rm-shade'; backF.appendChild(sh2);
      leaf.append(frontF, backF);
      // the page under the leaf already shows the new content
      this._mountPage(fwd ? this.pageR : this.pageL, fwd ? nr : nl, fwd ? 1 : -1, true);
      const newLive = this._rosettes;
      this._rosettes = (this._rosettesTmp || []).concat(newLive);
      this.book.appendChild(leaf);
      this.book.style.perspective = '2400px';
      this._sfx('menu_page', { volume: 0.5 });
      this._tween(0.62, (u) => {
        const e = easeIO(u);
        leaf.style.transform = `rotateY(${((fwd ? -180 : 180) * e).toFixed(2)}deg)`;
        sh1.style.opacity = String(clamp01(e * 2) * 0.5);
        sh2.style.opacity = String((1 - clamp01(e * 2 - 1)) * 0.5);
      }, () => {
        this._rosettes = newLive;
        this._mountPage(fwd ? this.pageL : this.pageR, fwd ? nl : nr, fwd ? -1 : 1, true);
        leaf.remove();
        this.book.style.perspective = '';
        this._flipDone();
      });
    } else {
      const old = this.pageR.cloneNode(true);
      old.style.zIndex = '5';
      this._rosettes = [];
      this._mountPage(this.pageR, this._kinds(to)[1], 0, true);
      const leaf = document.createElement('div');
      leaf.className = 'rm-leaf';
      Object.assign(leaf.style, { left: this.pageR.style.left, top: this.pageR.style.top, width: `${L.pw}px`, height: `${L.ph}px`, transformOrigin: '0 50%' });
      const face = document.createElement('div'); face.className = 'rm-face';
      old.style.left = '0'; old.style.top = '0';
      face.appendChild(old);
      const sh = document.createElement('div'); sh.className = 'rm-shade'; face.appendChild(sh);
      leaf.appendChild(face);
      this.book.appendChild(leaf);
      this.book.style.perspective = '1800px';
      this._sfx('menu_page', { volume: 0.5 });
      this._tween(0.5, (u) => {
        const e = easeIO(u);
        leaf.style.transform = `rotateY(${((fwd ? -1 : 1) * 95 * e).toFixed(2)}deg)`;
        sh.style.opacity = String(e * 0.6);
        leaf.style.opacity = String(1 - clamp01((e - 0.75) * 4));
      }, () => { leaf.remove(); this.book.style.perspective = ''; this._flipDone(); });
    }
    void prevSec;
  }

  _flipDone() {
    this._flipping = false;
    this._updateTabs();
    if (this._queued) { const q = this._queued; this._queued = null; this.show(q); return; }
    if (this._afterFlip) { const f = this._afterFlip; this._afterFlip = null; f(); }
  }

  // ---------------------------------------------------------------- trophies
  _slotEl(id) { return this.book.querySelector(`.rm-page .rm-slot[data-id="${id}"]`); }
  _slotPoint(id) {
    const s = this._slotEl(id);
    const img = s?.querySelector('.rm-tro');
    if (!img) return null;
    const r = img.getBoundingClientRect(), ic = this.stage.icon(id, !this._got(id), this._ppw);
    return { x: r.left + r.width / 2, y: r.top + (ic.baseY + 1) * S, w: r.width, h: r.height, ic };
  }
  _scrollIntoView(slot) {
    const sc = slot.closest('.rm-scroll');
    if (!sc) return;
    const sr = slot.getBoundingClientRect(), cr = sc.getBoundingClientRect();
    if (sr.top < cr.top + 10 || sr.bottom > cr.bottom - this.L.foxH * 0.6) sc.scrollTop += sr.top - cr.top - 40;
  }

  // the DOM trophy hops off its shelf into Reynard's paws, then the 3D one takes over
  _pickup(id) {
    const st = this.stage, locked = !this._got(id);
    const from = this._slotPoint(id);
    const slot = this._slotEl(id);
    st.play(st.pick('present_trophy', 'cheer'), { restart: true });
    const c = st.attach(id, locked);
    const cloth = slot?.querySelector('.rm-cloth');
    if (cloth) {
      this._sfx('whoosh', { volume: 0.25, pitch: 1.3 });
      this._tween(0.3, (u) => { cloth.style.transform = `translateX(-50%) translateY(${(u * 18).toFixed(1)}px) scaleY(${(1 - u * 0.6).toFixed(3)})`; cloth.style.opacity = String(1 - u); });
    }
    if (!from) { c.obj.visible = true; c.landed = true; return; }
    slot.classList.add('rm-out');
    this._fly(from.ic, from, () => {
      const p = st.carryScreen({});
      return p ? { x: p.x, y: p.y, h: p.h } : { x: from.x, y: from.y, h: 40 };
    }, 0.55, () => {
      c.obj.visible = true;
      c.landed = true;
      this._sfx('clink', { volume: 0.45 });
      const p = st.carryScreen({});
      if (p) this.fx.burst(p.topX, p.topY, 10, { speed: 90 });
      st.play(st.pick('carry', 'idle'));
    }, cloth ? 0.18 : 0.08);
  }

  _presentNow(id) {
    const P = this._present;
    if (!P || P.id !== id) return;
    const st = this.stage, locked = P.locked;
    this._spot.target = 1;
    this._sfx('spotlight', { volume: 0.5 });
    this._tween(0.4, () => {}, () => {
      if (this._present !== P) return;
      st.play(st.pick('present_trophy', 'cheer'), { restart: true, loop: st.has('present_trophy') ? undefined : false });
      this._say(LINES[locked ? 'mystery' : 'show'][Math.floor(st.rng() * 3)], 2.2);
      if (!locked) {
        this._sfx('fanfare_small', { volume: 0.55 });
        this._tween(0.35, () => {}, () => {
          const p = st.carryScreen({});
          if (p) { this.fx.burst(p.topX, p.topY, 22, { speed: 160 }); this.fx.confetti(p.topX, p.topY - 20, 46); }
        });
      } else this._sfx('menu_page', { volume: 0.3, pitch: 0.6 });
      P.phase = 'shown';
      this._showPlaque(id);
    });
  }

  _putBack(id) {
    const st = this.stage, c = st.carry, slot = this._slotEl(id);
    st.play(st.pick('present_trophy', 'cheer'), { restart: true });
    const to = this._slotPoint(id);
    const finish = () => {
      slot?.classList.remove('rm-out');
      const cloth = slot?.querySelector('.rm-cloth');
      if (cloth) {
        this._tween(0.3, (u) => { cloth.style.transform = `translateX(-50%) translateY(${((1 - u) * -14).toFixed(1)}px)`; cloth.style.opacity = String(u); });
      }
      this._sfx('clink', { volume: 0.4, pitch: 1.12 });
      if (to) this.fx.burst(to.x, to.y - 20, 8, { speed: 70 });
      this._present = null;
      if (this._dirty) { this._dirty = false; this.refresh(); }
    };
    if (!c || !to) { st.drop(); finish(); return; }
    const p = st.carryScreen({});
    c.obj.visible = false;
    st.drop();
    this._fly(to.ic, p ? { x: p.x, y: p.y, h: p.h, fromStage: true } : to, () => ({ x: to.x, y: to.y, h: null }), 0.5, finish, 0.15);
  }

  // abort a presentation; magic = the trophy zips home on its own
  _abortPresent(magic = false) {
    const P = this._present;
    if (!P) return;
    this._present = null;
    this._hidePlaque(true);
    this._spot.target = 0;
    this._catch.style.display = 'none';
    const st = this.stage;
    const slot = this._slotEl(P.id);
    if (st.carry) {
      const p = st.carryScreen({});
      const to = this._slotPoint(P.id);
      st.drop();
      if (magic && p && to) this._fly(to.ic, { x: p.x, y: p.y, h: p.h, fromStage: true }, () => ({ x: to.x, y: to.y, h: null }), 0.4, () => slot?.classList.remove('rm-out'), 0);
      else slot?.classList.remove('rm-out');
    } else slot?.classList.remove('rm-out');
    const cloth = slot?.querySelector('.rm-cloth');
    if (cloth) { cloth.style.transform = ''; cloth.style.opacity = ''; }
    for (const f of this.el.querySelectorAll('.rm-fly')) f.remove();
    if (st.ok) st.run([{ do: 'idle', dur: 0.6 }]);
  }

  // DOM flight: from {x,y (bottom centre), h?} to target() (live), arc + scale to match the 3D size
  _fly(ic, from, target, dur, done, delay = 0) {
    const img = document.createElement('img');
    img.className = 'rm-fly';
    img.src = ic.url;
    img.alt = '';
    const w = ic.w * S, h = ic.h * S;
    img.style.width = `${w}px`; img.style.height = `${h}px`;
    img.style.visibility = 'hidden';
    this.el.appendChild(img);
    const base = (ic.baseY + 1) * S, tall = Math.max(1, (ic.baseY - ic.topY + 1) * S);
    const s0 = from.h ? from.h / tall : 1;
    this._tween(dur, (u) => {
      const t = target();
      const e = easeIO(u);
      const x = lerp(from.x, t.x, e), y = lerp(from.y, t.y, e) - Math.sin(u * Math.PI) * 70;
      const s1 = t.h ? t.h / tall : 1;
      const s = lerp(s0, s1, e) * (1 + Math.sin(u * Math.PI) * 0.12);
      img.style.visibility = 'visible';
      img.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - base).toFixed(1)}px) scale(${s.toFixed(3)}) rotate(${(Math.sin(u * Math.PI * 2) * 8).toFixed(1)}deg)`;
      img.style.transformOrigin = `50% ${base}px`;
    }, () => { img.remove(); done?.(); }, delay);
  }

  _poke() {
    const st = this.stage;
    if (!st.ok || this._present) return;
    this._sfx('click', { volume: 0.25, pitch: 1.2 });
    st.run([{ do: 'turn', yaw: 0 }, { do: 'say', key: 'poke' }, { do: 'anim', names: ['cheer'], t1: 1.4 }, { do: 'idle', dur: 1.2 }]);
  }

  // ---------------------------------------------------------------- plaque
  _showPlaque(id) {
    this._hidePlaque(true);
    const a = ACH.get(id), look = trophyLook(id), done = this._got(id), L = this.L;
    const days = this._st().achievementDays || this._st().trophyDays || {};
    const el = document.createElement('div');
    el.className = 'rm-plaque';
    const W = L.single ? Math.min(L.vw - 24, 340) & ~1 : 300;
    el.style.width = `${W}px`;
    const status = done ? `<span class="rm-stamp">Earned${days[id] ? ` &middot; day ${days[id]}` : ''}</span>` : '<span class="rm-stamp rm-not">Not yet earned</span>';
    el.innerHTML = `<div class="rm-plaque-in">
      <div class="rm-tier"><img src="${medalURL(look.tier)}" width="22" height="28" alt="">${esc(TIER_NAME[look.tier] || 'Award')} &middot; no. ${a.n}</div>
      <h3>${done ? esc(a.name) : esc(a.name)}</h3>
      <img class="rm-divider" src="${dividerURL(80)}" width="160" height="18" alt="" style="margin:6px auto 2px">
      <div class="rm-lbl">How to get</div>
      <div class="rm-how-t">${esc(a.desc)}</div>
      <div class="rm-lines"><div class="rm-line"><span>Reward</span>${this._dots()}<b><img src="${coinURL()}" style="width:14px;height:14px" alt="">${a.reward} coins</b></div></div>
      ${status}
      <div class="rm-hint">tap anywhere to put it back</div>
    </div><button class="rm-px" title="Put it back" style="background-image:url(${closeURL()})"></button>`;
    el.querySelector('.rm-px').addEventListener('click', (e) => { e.stopPropagation(); this.dismiss(); });
    el.addEventListener('click', (e) => { e.stopPropagation(); this.dismiss(); });
    el.style.visibility = 'hidden';
    this.el.appendChild(el);
    const H = even(el.offsetHeight);
    const bg = document.createElement('img');
    bg.alt = '';
    bg.src = pageArt(W / S, H / S, 0, 7);
    Object.assign(bg.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px` });
    el.prepend(bg);
    el.style.height = `${H}px`;
    this._plaque = { el, W, H, t: 0 };
    this._placePlaque(true);
    el.style.visibility = 'visible';
    this._tween(0.38, (u) => { this._plaque && (this._plaque.k = easeBack(u)); this._placePlaque(); });
  }

  _placePlaque(first) {
    const P = this._plaque;
    if (!P) return;
    const L = this.L, fs = this.stage.foxScreen() || { x: L.vw / 2, y: L.floor, headY: L.floor - L.foxH };
    let x, y;
    if (L.single) { x = (L.vw - P.W) / 2; y = Math.max(46, fs.headY - P.H - L.foxH * 0.9); }
    else {
      x = fs.x + L.foxH * 0.55;
      if (x + P.W > L.vw - 12) x = fs.x - L.foxH * 0.55 - P.W;
      y = clamp(fs.headY - P.H * 0.7, 20, L.vh - P.H - 20);
    }
    const k = first ? 0 : P.k ?? 0;
    P.el.style.opacity = String(clamp01(k * 1.6));
    P.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + (1 - k) * 16)}px) scale(${(0.86 + 0.14 * k).toFixed(3)})`;
  }

  _hidePlaque(now = false) {
    const P = this._plaque;
    if (!P) return;
    this._plaque = null;
    if (now) { P.el.remove(); return; }
    const el = P.el;
    const t0 = el.style.transform;
    this._tween(0.2, (u) => { el.style.opacity = String(1 - u); el.style.transform = `${t0} translateY(${(u * 10).toFixed(1)}px)`; }, () => el.remove());
  }

  // ---------------------------------------------------------------- loop
  _start() {
    if (!this.opts.autoUpdate || this._raf) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }
  _tick(now) {
    this._raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this.update(dt);
    if (this.isOpen) this._raf = requestAnimationFrame(this._tick);
  }
}

export default RestaurantMenu;
