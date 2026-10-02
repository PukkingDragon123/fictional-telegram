// The Encyclopedia: Reynard's grand leather-bound field guide to the pond.
// A closed book drops onto the desk, the cover swings open in 3D and pages
// turn around the spine with a real curl, shading and cast shadows (drag a
// page, swipe, tap the corners, arrow keys or the mouse wheel). Cloth tabs
// jump between chapters, the contents and index pages link to every entry.
// Entries discovered since the book was last opened wear a NEW! ribbon and
// bloom out of an ink blot. Every texture is procedural pixel art.
//
//   import { Encyclopedia } from './Encyclopedia.js';
//   const book = new Encyclopedia({ game, root: document.getElementById('ui') || document.body });
//   book.open({ chapter: 'fish', entry: 'bluegill' });   // -> Promise; both keys optional
//   book.close();                                        // -> Promise (Escape / the × bookmark too)
//   book.isOpen;  book.toggle();
//
// Options: { game, root, sfx(name, opts), onOpen(), onClose() }. Without sfx it
// plays through game.audio. "Last seen" lives in game.state.dexSeen (see
// encyclopediaData.js). Sounds come from src/audio/extra/bookSfx.js.
import './fonts.css';
import './encyclopedia.css';
import { buildEncyclopedia, commitDexSeen, CHAPTERS, encArt, medalArt } from './encyclopediaData.js';
import { hasSprite, spriteURL } from './sprites.js';

const { Pix, hexc, mixc, hash, strHash, bayer, dq, mkCanvas, scaled, clamp } = encArt;

// ---------------------------------------------------------------- geometry (CSS px at scale 1)
const PW = 416, PH = 576; // one page
const OV = 14; // board overhang around the page block
const BW = 2 * (PW + OV), BH = PH + 2 * OV; // open book (both boards)
const PAD_X = 50, PAD_Y = 52; // room for tabs / bookmarks around the book
const TAB_H = 46, TAB_GAP = 6, TAB_TOP = OV + 30;
const TX = 2; // CSS px per texel of book art

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function roman(n) {
  const T = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of T) while (n >= v) { s += r; n -= v; }
  return s;
}
const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  back: (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// ===========================================================================
// procedural art: noise + texture registry
// ===========================================================================
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, cell, oct, s) {
  let sum = 0, amp = 1, norm = 0, f = 1 / cell;
  for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 17); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}
const ramp = (arr) => arr.map(hexc);
const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }
const urlOf = (c) => (typeof c === 'string' ? c : c ? c.toDataURL() : '');
let styleEl = null;
const texRules = new Set();
// a texture as a CSS class (keeps data URLs out of the page HTML)
function texClass(key, fn) {
  const cls = `enc-x-${key}`;
  if (texRules.has(cls)) return cls;
  texRules.add(cls);
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'enc-tex'; document.head.appendChild(styleEl); }
  styleEl.appendChild(document.createTextNode(`.${cls}{background-image:url(${urlOf(fn())});}\n`));
  return cls;
}

const LEATHER = ramp(['#1c0608', '#2c0a0e', '#3e1014', '#521a1c', '#682226', '#7e2e2e', '#963c38', '#ae5242']);
const GOLD = ramp(['#4a2806', '#7a4a0e', '#b07818', '#dca42a', '#f6cc4a', '#ffe68a', '#fff8d0']);
const BRASS = ramp(['#2e1e0c', '#523616', '#7e5a24', '#a8823a', '#cca458', '#ead088', '#fff0c0']);
const PAPER = ramp(['#9e7e52', '#b49464', '#c8aa78', '#d6bb8a', '#e2cb9e', '#ecd9b0', '#f4e6c4', '#f9efd6']);
const INK = hexc('#2b1d14');

// pebbled leather; tone(x, y) can add tooling on top
function leatherPix(w, h, seed, { wear = 1, base = 3.4 } = {}) {
  const p = new Pix(w, h), n = LEATHER.length;
  const G = 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = base + (fbm(x, y, 26, 3, seed) - 0.5) * 2.2;
    // pebble grain: nearest jittered feature point, lit from the top left
    const cx = Math.floor(x / G), cy = Math.floor(y / G);
    let best = 9, bx = 0, by = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const fx = (cx + i) * G + hash(cx + i, cy + j, seed) * G, fy = (cy + j) * G + hash(cx + i, cy + j, seed + 5) * G;
      const d = Math.hypot(x - fx, y - fy);
      if (d < best) { best = d; bx = fx; by = fy; }
    }
    const hgt = Math.max(0, 1 - best / 2.3);
    v += (-(x - bx) - (y - by)) / (best + 0.4) * hgt * 0.45 - (best > 1.7 ? 0.35 : 0);
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (e < 6) v += (6 - e) * 0.16 * wear * (fbm(x * 2, y * 2, 5, 2, seed + 3) > 0.5 ? 1 : 0.25);
    if (e === 0) v -= 2.2; else if (e === 1) v -= 0.6;
    p.set(x, y, LEATHER[dq(v, x, y, n)]);
  }
  return p;
}
// gold leaf pixel with a little glitter
function goldAt(p, x, y, t = 3, seed = 1) {
  const g = hash(x, y, seed);
  p.set(x, y, GOLD[clamp(t + (g < 0.12 ? 2 : g < 0.3 ? 1 : g > 0.9 ? -1 : 0), 0, 6)]);
}
// a debossed (pressed in) leather line: dark in the groove, light lip below
function blindLine(p, pts) {
  for (const [x, y] of pts) { p.mix(x, y, LEATHER[0], 0.7); p.mix(x + 1, y + 1, LEATHER[7], 0.35); }
}
function rectPts(x0, y0, x1, y1) {
  const out = [];
  for (let x = x0; x <= x1; x++) { out.push([x, y0]); out.push([x, y1]); }
  for (let y = y0 + 1; y < y1; y++) { out.push([x0, y]); out.push([x1, y]); }
  return out;
}

// emboss a region map: each char -> tone; lit from the top left
function embossRows(p, x0, y0, rows, tones, R = GOLD, { bevel = 1, seed = 3 } = {}) {
  const H = rows.length, W = rows[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : rows[y][x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = at(x, y);
    if (ch === '.' || tones[ch] == null) continue;
    let t = tones[ch];
    if (bevel) {
      const tl = at(x - 1, y) !== ch || at(x, y - 1) !== ch, br = at(x + 1, y) !== ch || at(x, y + 1) !== ch;
      if (tl && !br) t += 1; else if (br && !tl) t -= 1;
    }
    const g = hash(x0 + x, y0 + y, seed);
    if (g < 0.06) t += 1;
    p.set(x0 + x, y0 + y, R[clamp(t, 0, R.length - 1)]);
  }
}

// ---------------------------------------------------------------- the fox crest (gold, embossed)
const FOX_CREST = [
  '..........hhhhhhhhhhhh..........',
  '..........hHHHHHHHHHHh..........',
  '..........hHHHHHHHHHHh..........',
  '..........hHHHHHHHHHHh..........',
  '..e.......hHHHHHHHHHHh.......e..',
  '..ee......hHHHHHHHHHHh......ee..',
  '..eie.....hbbbbbbbbbbh.....eie..',
  '..eiie..rrrrrrrrrrrrrrrr..eiie..',
  '..eiiie.RRRRRRRRRRRRRRRR.eiiie..',
  '..eiiiieaaaaaaaaaaaaaaaaeiiiie..',
  '..eiiiiaaaaaaaaaaaaaaaaaaiiiie..',
  '...eiiaaaaaaaaaaaaaaaaaaaaiie...',
  '...eeaaaaaaaaaaaaaaaaaaaaaaee...',
  '....aaaaaaaaaaaaaaaaaaaaaaaa....',
  '...aaaaaKKaaaaaaaaaaaammmmaaa...',
  '..aaaaaKkkKaaaaaaaaaamKkkKmaaa..',
  '..aaaaaaKKaaaaaaaaaaamaKKammaa..',
  '.caaaaaaaaaaaaaaaaaaaammmmaacaa.',
  'ccaaaaaaaaaaaaaaaaaaaaaaaa.cmcc.',
  '.cccaaaaaaawwwwwwwwwwaaaaaccmc..',
  '..ccccaaawwwwwwwwwwwwwwaaccc.m..',
  '...cccccwwwwwwwwwwwwwwwwccc..m..',
  '.....cccwwwwwwwwwwwwwwwwcc...m..',
  '.......cwwwwwwwkkkkwwwwwc.......',
  '........wwwwwwwkkkkwwwww........',
  '.........wwwwwwwkkwwwww.........',
  '..........wwwwwwwwwwww..........',
  '............wwwwwwww............',
  '..............wwww..............',
];
const CREST_TONES = { h: 1, H: 3, b: 5, r: 4, R: 2, e: 3, i: 1, a: 3, K: 1, k: 0, m: 6, c: 4, w: 5 };

function crestPix() {
  const W = 72, H = 64, p = new Pix(W, H), cx = 36;
  // laurel branches curving up both sides
  const leaf = (x, y, ang) => {
    for (let t = -2; t <= 2; t++) for (let s = -1; s <= 1; s++) {
      if (Math.abs(s) === 1 && Math.abs(t) === 2) continue;
      const lx = x + Math.cos(ang) * t - Math.sin(ang) * s * 0.8, ly = y + Math.sin(ang) * t + Math.cos(ang) * s * 0.8;
      goldAt(p, Math.round(lx), Math.round(ly), s < 0 ? 4 : s > 0 ? 2 : 3, 9);
    }
  };
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.62 + k * 0.075);
      const r = 27;
      const x = cx + side * Math.cos(a) * -r * 1.02, y = 34 + Math.sin(a) * r * 0.95;
      goldAt(p, Math.round(x), Math.round(y), 2, 4);
      const out = Math.atan2(y - 34, x - cx);
      leaf(x + Math.cos(out) * 3, y + Math.sin(out) * 3, out + side * 0.9);
      if (k % 2 === 0) leaf(x - Math.cos(out) * 2.2, y - Math.sin(out) * 2.2, out - side * 0.6 + Math.PI);
    }
  }
  // medallion rings
  for (let a = 0; a < Math.PI * 2; a += 0.012) {
    const x = Math.round(cx - 0.5 + Math.cos(a) * 22.5), y = Math.round(32 + Math.sin(a) * 22.5);
    goldAt(p, x, y, 3, 2);
    const x2 = Math.round(cx - 0.5 + Math.cos(a) * 20.2), y2 = Math.round(32 + Math.sin(a) * 20.2);
    if ((Math.round(a * 40) % 3) === 0) goldAt(p, x2, y2, 4, 5);
  }
  embossRows(p, cx - 16, 15, FOX_CREST, CREST_TONES);
  // a scroll ribbon under the medallion
  for (let x = 5; x < 67; x++) {
    const w = Math.sin(((x - 5) / 62) * Math.PI) * 1.6;
    const y0 = Math.round(55 - w);
    for (let y = y0; y < y0 + 6; y++) p.set(x, y, GOLD[y === y0 ? 6 : y === y0 + 5 ? 2 : 5]);
  }
  for (const [x0, dir] of [[5, -1], [66, 1]]) for (let k = 0; k < 5; k++) for (let y = 56 + k - 2; y < 61 - (k === 4 ? 2 : 0); y++) goldAt(p, x0 + dir * k, y, 2, 7);
  return p;
}

// ---------------------------------------------------------------- the cover
const COVER_W = (PW + OV) / TX, COVER_H = BH / TX; // 215 x 302 texels
function cornerPiece(p, ox, oy, fx, fy, S = 24) {
  // brass corner protector: a triangle with a concave inner edge, raised rim, rivets
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    const inside = u + v < 1.0 - 0.18 * Math.sin(Math.PI * clamp((u - v + 1) / 2, 0, 1));
    if (!inside) continue;
    const x = ox + fx * i, y = oy + fy * j;
    const edge = u + v > 0.86 - 0.18 * Math.sin(Math.PI * clamp((u - v + 1) / 2, 0, 1)) || i === 0 || j === 0;
    let t = 3 + (fx < 0 ? 0.6 : -0.3) + (fy < 0 ? 0.6 : -0.3);
    if (edge) t += i === 0 || j === 0 ? 1.4 : -1.2;
    // filigree cut-out
    const fu = u * S - S * 0.32, fv = v * S - S * 0.32, fd = Math.hypot(fu, fv);
    if (fd > 2.6 && fd < 4 && !edge) { p.set(x, y, LEATHER[1]); continue; }
    if (Math.abs(i - j) < 1 && i > 3 && i < S * 0.4) t += 1.2;
    p.set(x, y, BRASS[dq(t, x, y, BRASS.length)]);
  }
  for (const [i, j] of [[3, 3], [Math.round(S * 0.62), 3], [3, Math.round(S * 0.62)]]) {
    const x = ox + fx * i, y = oy + fy * j;
    p.set(x, y, BRASS[6]); p.set(x + 1, y + 1, BRASS[1]); p.set(x + 1, y, BRASS[4]); p.set(x, y + 1, BRASS[3]);
  }
}
function coverPix() {
  const W = COVER_W, H = COVER_H;
  const p = leatherPix(W, H, 21, { wear: 1.1 });
  // spine hinge groove
  for (let y = 2; y < H - 2; y++) { p.mix(8, y, LEATHER[0], 0.75); p.mix(9, y, LEATHER[0], 0.4); p.mix(10, y, LEATHER[7], 0.25); }
  // outer gold fillet, blind fillet, inner gold frame + dots
  for (const [x, y] of rectPts(16, 8, W - 9, H - 9)) goldAt(p, x, y, 3, 11);
  blindLine(p, rectPts(19, 11, W - 12, H - 12));
  for (const [x, y] of rectPts(24, 16, W - 17, H - 17)) goldAt(p, x, y, 3, 13);
  for (const [x, y] of rectPts(26, 18, W - 19, H - 19)) if ((x + y) % 3 === 0) goldAt(p, x, y, 4, 14);
  // corner fleurons on the inner frame
  const fleur = ['...#...', '..#.#..', '.#.#.#.', '#.###.#', '.#.#.#.', '..#.#..', '...#...'];
  for (const [fx, fy] of [[24, 16], [W - 17, 16], [24, H - 17], [W - 17, H - 17]]) {
    fleur.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') goldAt(p, fx - 3 + i, fy - 3 + j, i === 3 && j === 3 ? 6 : 4, 15); }));
  }
  // title cartouche: a double frame with notched corners
  const tx0 = 40, tx1 = W - 33, ty0 = 38, ty1 = 96;
  for (const [x, y] of rectPts(tx0, ty0, tx1, ty1)) if (!((x - tx0 < 3 || tx1 - x < 3) && (y - ty0 < 3 || ty1 - y < 3))) goldAt(p, x, y, 4, 16);
  for (const [x, y] of rectPts(tx0 + 3, ty0 + 3, tx1 - 3, ty1 - 3)) goldAt(p, x, y, 2, 17);
  for (const [x, y] of [[tx0 + 1, ty0 + 1], [tx1 - 1, ty0 + 1], [tx0 + 1, ty1 - 1], [tx1 - 1, ty1 - 1]]) goldAt(p, x, y, 5, 18);
  // little diamond rule under the cartouche, and above the publisher line
  const rule = (y) => {
    const mx = Math.round((tx0 + tx1) / 2);
    for (let x = mx - 40; x <= mx + 40; x++) if (Math.abs(x - mx) > 4) goldAt(p, x, y, 3, 19);
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) goldAt(p, mx + dx, y + dy, Math.abs(dx) + Math.abs(dy) === 0 ? 6 : 4, 20);
  };
  rule(102);
  rule(H - 52);
  // the crest
  // the crest, each crest texel doubled (chunky gold leaf)
  const cr = crestPix();
  const cx0 = Math.round((tx0 + tx1) / 2 - cr.w), cy0 = 108;
  for (let y = 0; y < cr.h * 2; y++) for (let x = 0; x < cr.w * 2; x++) {
    const c = cr.get(x >> 1, y >> 1);
    if (c) p.set(cx0 + x, cy0 + y, c);
    else if (cr.get((x - 1) >> 1, (y - 1) >> 1)) p.mix(cx0 + x, cy0 + y, LEATHER[0], 0.55); // pressed-in shadow
  }
  // brass corners
  cornerPiece(p, W - 1, 0, -1, 1);
  cornerPiece(p, W - 1, H - 1, -1, -1);
  cornerPiece(p, 0, 0, 1, 1, 18);
  cornerPiece(p, 0, H - 1, 1, -1, 18);
  return p;
}
// the inside of the cover: leather turn-ins around the pasted-down endpaper
function boardPix(seed) {
  return leatherPix(COVER_W, COVER_H, seed, { wear: 0.8, base: 3.0 });
}

// ---------------------------------------------------------------- paper
const PG_W = PW / TX, PG_H = PH / TX; // 208 x 288
function paperPix(side, seed) {
  const W = PG_W, H = PG_H, p = new Pix(W, H), n = PAPER.length;
  const s = 100 + seed * 7 + (side === 'R' ? 50 : 0);
  const gut = (x) => (side === 'L' ? W - 1 - x : x); // distance from the spine
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 5.2 + (fbm(x, y, 30, 3, s) - 0.5) * 1.5 + (hash(x, y, s) - 0.5) * 0.55;
    const g = gut(x);
    if (g < 34) v -= 3.1 * Math.pow(1 - g / 34, 2.3);
    else if (g < 44) v += 0.25;
    const outer = side === 'L' ? x : W - 1 - x;
    const e = Math.min(outer, y, H - 1 - y) + (fbm(x, y, 9, 2, s + 4) - 0.5) * 5;
    if (e < 12) v -= (12 - e) * 0.1;
    if (e < 2) v -= 0.6;
    // page-curl shading at the outer corners
    const cy = Math.min(y, H - 1 - y);
    if (outer < 26 && cy < 26) v -= Math.max(0, 1 - Math.hypot(outer, cy) / 26) * 0.9;
    p.set(x, y, PAPER[dq(v, x, y, n)]);
  }
  const R = (k) => hash(k, 9, s);
  // fibres
  for (let k = 0; k < W * H * 0.012; k++) {
    const x0 = R(k * 3) * W, y0 = R(k * 3 + 1) * H, a = R(k * 3 + 2) * Math.PI * 2, len = 2 + R(k + 999) * 4;
    const col = R(k + 77) < 0.6 ? PAPER[7] : PAPER[3];
    for (let t = 0; t < len; t++) p.mix(x0 + Math.cos(a) * t, y0 + Math.sin(a) * t * 0.6, col, 0.4);
  }
  // foxing: rusty age spots
  const spots = 5 + (seed % 4) * 2;
  for (let k = 0; k < spots; k++) {
    const sx = 8 + R(k * 11 + 3) * (W - 16), sy = 8 + R(k * 11 + 4) * (H - 16), r = 1.2 + R(k * 11 + 5) * (k % 3 === 0 ? 4.5 : 2.2);
    for (let y = Math.floor(sy - r - 2); y <= sy + r + 2; y++) for (let x = Math.floor(sx - r - 2); x <= sx + r + 2; x++) {
      const d = Math.hypot(x - sx, y - sy) / (r * (0.75 + vnoise(x * 0.7, y * 0.7, s + k) * 0.5));
      if (d > 1) continue;
      if (bayer(x, y) < (1 - d) * 1.1) p.mix(x, y, hexc(d < 0.35 ? '#8a5a2c' : '#a87a48'), d < 0.35 ? 0.55 : 0.32);
    }
    for (let q = 0; q < 4; q++) p.mix(sx + (R(k * 7 + q) - 0.5) * r * 4, sy + (R(k * 13 + q) - 0.5) * r * 4, hexc('#9a6a3a'), 0.4);
  }
  // faint ruled lines
  for (let y = 26; y < H - 22; y += 13) {
    for (let x = 12; x < W - 12; x++) if (hash(x, y, s + 2) > 0.18 && gut(x) > 20) p.mix(x, y, hexc('#b49870'), 0.16);
  }
  return p;
}
// blank leaves for fast riffles: paper with squiggly "text" lines
function blankPagePix(side, seed) {
  const p = paperPix(side, seed);
  const R = (k) => hash(k, 3, seed + 900);
  for (let y = 40; y < PG_H - 40; y += 7) {
    if (R(y) < 0.18) continue;
    const x0 = 22 + Math.round(R(y + 1) * 6), x1 = PG_W - 26 - Math.round(R(y + 2) * 40);
    for (let x = x0; x < x1; x++) if (hash(x >> 2, y, seed) > 0.22) p.mix(x, y, INK, 0.28);
  }
  return p;
}

// ---------------------------------------------------------------- marbled endpaper
const MARBLE = ramp(['#6a1a1e', '#8e3a2c', '#d8c49a', '#c89a48', '#e6d6b0', '#2a5a5a', '#3e7270', '#d8c49a', '#7a2a24', '#24384e']);
function marblePix(w, h, seed = 4) {
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const w1 = fbm(x, y, 40, 3, seed) - 0.5, w2 = fbm(x + 91, y + 37, 40, 3, seed + 1) - 0.5;
    const u = x + w1 * 48, v = y + w2 * 48;
    const comb = Math.sin(u * 0.5) * 0.45;
    const t = v * 0.16 + Math.sin(u * 0.06 + v * 0.02) * 2.2 + comb + Math.sin(u * 0.017) * 3;
    const band = Math.floor(t), fr = t - band;
    let c = MARBLE[((band % MARBLE.length) + MARBLE.length) % MARBLE.length];
    if (fr < 0.1) c = mixc(c, [20, 12, 10], 0.55);
    else if (fr > 0.88) c = mixc(c, [255, 246, 220], 0.25);
    if (bayer(x, y) < 0.2 && fr > 0.45 && fr < 0.55) c = mixc(c, [255, 255, 255], 0.12);
    p.set(x, y, c);
  }
  // stone droplets
  for (let k = 0; k < (w * h) / 900; k++) {
    const sx = hash(k, 1, seed) * w, sy = hash(k, 2, seed) * h, r = 1.5 + hash(k, 3, seed) * 3;
    const col = MARBLE[Math.floor(hash(k, 4, seed) * MARBLE.length)];
    for (let y = Math.floor(sy - r - 1); y <= sy + r + 1; y++) for (let x = Math.floor(sx - r - 1); x <= sx + r + 1; x++) {
      const d = Math.hypot(x - sx, y - sy);
      if (d <= r - 0.6) p.set(x, y, col);
      else if (d <= r + 0.4) p.set(x, y, mixc(col, [20, 12, 10], 0.5));
    }
  }
  return p;
}

// ---------------------------------------------------------------- glyphs (chapter emblems, 1-bit)
const GLYPHS = {
  fish: ['....#####...', '..#########.', '#.#####.####', '############', '#.##########', '..#########.', '....#####...'],
  dna: ['#.......#', '##.....##', '.##...##.', '..#####..', '...###...', '..#####..', '.##...##.', '##.....##', '#.......#'],
  feather: ['.......###', '......####', '.....####.', '....####..', '...####...', '..#.##....', '.#.##.....', '.##.......', '#.........'],
  bug: ['.#......#.', '..#....#..', '...####...', '.########.', '##.##.####', '##########', '####.##.##', '.########.', '..######..'],
  egg: ['...####...', '..######..', '.########.', '.########.', '##########', '##########', '##########', '.########.', '..######..'],
  paw: ['.##....##.', '.##....##.', '#..#..#..#', '##......##', '...####...', '..######..', '.########.', '.########.', '..##..##..'],
  leaf: ['......#####', '....#######', '...####.###', '..####.####', '.####.####.', '.###.####..', '.#.####....', '#.##.......', '#..........'],
  food: ['.....#....', '....#.##..', '..##.##...', '.########.', '##########', '###.######', '##########', '.########.', '..##..##..'],
  home: ['....##....', '...####...', '..######..', '.########.', '##########', '.##....##.', '.##.##.##.', '.##.##.##.', '.########.'],
  trophy: ['##########', '#.######.#', '#.######.#', '.########.', '..######..', '...####...', '....##....', '..######..', '.########.'],
};
function glyphPix(name, col, shadow) {
  const g = GLYPHS[name] || GLYPHS.egg;
  const w = Math.max(...g.map((r) => r.length)), h = g.length;
  const p = new Pix(w + 1, h + 1);
  if (shadow) g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') p.set(x + 1, y + 1, shadow); }));
  g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') p.set(x, y, col); }));
  return p;
}

// ---------------------------------------------------------------- cloth tabs
function clothPix(hex, glyph, side) {
  const W = 26, H = TAB_H / TX, p = new Pix(W, H);
  const base = hexc(hex);
  const R = [mixc(base, [10, 6, 20], 0.55), mixc(base, [10, 6, 20], 0.3), base, mixc(base, [255, 240, 210], 0.22), mixc(base, [255, 240, 210], 0.42)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // rounded free end (right side for R tabs)
    const fx = side === 'R' ? x : W - 1 - x;
    const cy = Math.min(y, H - 1 - y);
    if (fx > W - 4 && cy < 3 && (fx - (W - 4)) + (3 - cy) > 3) continue;
    let v = 2 + ((x + y) % 2 ? 0.25 : -0.25) + (y % 3 === 0 ? -0.35 : 0) + (fbm(x, y, 6, 2, strHash(hex)) - 0.5) * 0.8;
    if (cy === 0) v = y === 0 ? 3.6 : 0.6;
    if (fx >= W - 1 || (fx > W - 4 && cy < 3 && (fx - (W - 4)) + (3 - cy) === 3)) v = 0.4;
    if (fx < 4) v -= (4 - fx) * 0.35; // tucked under the page
    p.set(x, y, R[dq(v, x, y, 5)]);
  }
  // stitched seam along the free end
  for (let y = 3; y < H - 3; y += 2) p.set(side === 'R' ? W - 4 : 3, y, R[4]);
  const gl = glyphPix(glyph, [255, 244, 214], R[0]);
  const gx = side === 'R' ? 10 : W - 10 - gl.w + 1, gy = Math.round((H - gl.h) / 2);
  for (let y = 0; y < gl.h; y++) for (let x = 0; x < gl.w; x++) { const c = gl.get(x, y); if (c) p.set(gx + x, gy + y, c); }
  return p;
}

// ---------------------------------------------------------------- seals, ribbons, doodles
const WAX = ramp(['#3a060c', '#5e0e14', '#86181c', '#ac2a26', '#cc4232', '#e86a4c', '#ffa080']);
const FOX_MINI = ['#.....#', '##...##', '#######', '#.###.#', '#######', '.#####.', '..###..', '...#...'];
function waxSealPix() {
  const N = 30, p = new Pix(N, N), c = 14.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - c, dy = y - c, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const r = 12 + Math.sin(a * 5 + 1.3) * 0.9 + Math.sin(a * 11) * 0.5 + (a > 1.2 && a < 1.9 ? 1.6 : 0);
    if (d > r) continue;
    let v = 3.2 + (-dx - dy) / r * 1.3;
    if (d > r - 1.5) v -= 1.2; else if (d > 8.4 && d < 9.6) v -= 1.3; else if (d >= 9.6 && d < 10.6) v += 0.8;
    p.set(x, y, WAX[dq(v, x, y, WAX.length)]);
  }
  // a drip
  for (let y = 26; y < 29; y++) { p.set(15, y, WAX[y > 27 ? 2 : 3]); p.set(16, y, WAX[2]); }
  FOX_MINI.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch !== '#') return;
    p.set(11 + i, 10 + j, WAX[1]);
    if (!FOX_MINI[j - 1] || FOX_MINI[j - 1][i] !== '#') p.set(11 + i, 9 + j, WAX[5]);
  }));
  p.set(12, 13, WAX[5]); p.set(16, 13, WAX[5]);
  return p;
}
function goldSealPix(glyph) {
  const N = 44, p = new Pix(N, N + 14), c = 21.5;
  // ribbon tails
  const rib = ramp(['#4e0e14', '#8a1c22', '#c0342e', '#e8604a']);
  for (let y = 24; y < N + 13; y++) for (const s of [-1, 1]) {
    const x0 = Math.round(c + s * (5 + (y - 24) * 0.3));
    for (let k = 0; k < 7; k++) {
      const x = x0 + s * k - (s < 0 ? 6 : 0) * 0;
      if (y > N + 8 && Math.abs(k - 3) < (y - (N + 8))) continue;
      p.set(x, y, rib[k === 0 || k === 6 ? 0 : k === 2 ? 3 : 2]);
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - c, dy = y - c, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const r = 19 + Math.cos(a * 16) * 1.4;
    if (d > r) continue;
    let v = 3 + (-dx - dy) / r * 1.5;
    if (d > r - 2) v += Math.cos(a * 16) > 0.2 ? 0.6 : -0.8;
    else if (d > 14.6 && d < 15.6) v -= 1.6;
    else if (d >= 15.6 && d < 16.6) v += 1.2;
    else if (d < 13 && d > 12) v -= 0.9;
    p.set(x, y, GOLD[dq(v, x, y, GOLD.length)]);
  }
  const g = GLYPHS[glyph] || GLYPHS.trophy;
  const gw = g[0].length, gh = g.length, gx = Math.round(c - gw / 2 + 0.5), gy = Math.round(c - gh / 2 + 0.5);
  g.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch !== '#') return;
    p.set(gx + i, gy + j, GOLD[5]);
    if (!g[j + 1] || g[j + 1][i] !== '#') p.set(gx + i, gy + j + 1, GOLD[1]);
  }));
  return p;
}
function ribbonPix(len, { x = false, hex = '#7a1420' } = {}) {
  const W = 9, p = new Pix(W, len), b = hexc(hex);
  const R = [mixc(b, [0, 0, 0], 0.5), mixc(b, [0, 0, 0], 0.25), b, mixc(b, [255, 220, 200], 0.25), mixc(b, [255, 230, 200], 0.45)];
  for (let y = 0; y < len; y++) for (let k = 0; k < W; k++) {
    if (y > len - 5 && Math.abs(k - 4) < 5 - (len - y)) continue; // swallowtail
    const v = k === 0 ? 0 : k === W - 1 ? 0.6 : k === 1 ? 3.4 : 2 + (y % 4 === 0 ? -0.4 : 0) + (k === 2 ? 0.6 : 0);
    p.set(k, y, R[dq(v, k, y, 5)]);
  }
  if (x) {
    const X = ['#...#', '##.##', '.###.', '##.##', '#...#'];
    const y0 = len - 14;
    X.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') { p.set(2 + i, y0 + j + 1, R[0]); p.set(2 + i, y0 + j, GOLD[5]); } }));
  }
  return p;
}
const DOODLES = {
  fishbone: ['.#...............', '..#..#.#.#.#..##.', '#################k', '..#..#.#.#.#..##.', '.#...............'],
  hook: ['..##..', '.#..#.', '.#..#.', '..##..', '...#..', '...#..', '...#..', '#..#..', '#..#..', '.##...'],
  bubbles: ['....##..', '...#..#.', '...#..#.', '....##..', '.##.....', '#..#....', '.##...#.', '......#.'],
  heart: ['.##.##.', '#..#..#', '#.....#', '.#...#.', '..#.#..', '...#...'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '#.....#'],
  spiral: ['.####.', '#....#', '#.##.#', '#.#..#', '#.###.', '#.....', '.####.'],
  arrow: ['.....##', '......#', '.....#.', '....#..', '...#...', '#.#....', '##.....', '###....'],
  sun: ['#..#..#', '.#...#.', '..###..', '#.###.#', '..###..', '.#...#.', '#..#..#'],
  cloud: ['...###....', '..#...#...', '.#.....##.', '#.........#', '#.........#', '.#########.'],
  paws: ['.#.#.......', '#.#.#......', '.###.......', '......#.#..', '.....#.#.#.', '......###..'],
  sprout: ['.##...##.', '#..#.#..#', '.##.#.##.', '....#....', '....#....', '..#####..'],
  bee: ['#.#.#.#........', '..............#', '.#.#.#.#.....##', '...........###.', '.........##k##.', '..........###..'],
  coin: ['.####.', '#....#', '#.##.#', '#.#..#', '#.##.#', '.####.'],
  fox: ['#.....#', '##...##', '#.###.#', '#######', '.#.#.#.', '..###..', '...#...'],
  magnifier: ['.###...', '#...#..', '#...#..', '#...#..', '.###...', '....#..', '.....#.', '......#'],
  feather: GLYPHS.feather,
  leafd: GLYPHS.leaf,
  footprint: ['.#.#.#', '..###.', '...#..', '......', '#.#.#.', '.###..', '..#...'],
};
function doodlePix(name) {
  const g = DOODLES[name] || DOODLES.star;
  const w = Math.max(...g.map((r) => r.length)), h = g.length, p = new Pix(w, h);
  g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') p.set(x, y, ch === 'k' ? [20, 12, 8] : INK); }));
  return p;
}

// ---------------------------------------------------------------- naturalist plate washes
const WASH = {
  water: { a: '#a8d8e0', b: '#78b8cc', rim: '#4e8aa8', extra: 'ripples' },
  night: { a: '#5a5a9a', b: '#3a3a72', rim: '#24244e', extra: 'stars' },
  sky: { a: '#cfe6f0', b: '#a8d0e4', rim: '#78a8c8', extra: 'twig' },
  leaf: { a: '#cfe4a8', b: '#a8cc80', rim: '#6a9a50', extra: 'leaf' },
  pond: { a: '#b0dcd0', b: '#80bca8', rim: '#4e8a78', extra: 'lily' },
  meadow: { a: '#dcebb0', b: '#b8d488', rim: '#7aa058', extra: 'grass' },
  soil: { a: '#e8d0a0', b: '#cca878', rim: '#9a7448', extra: 'soil' },
  table: { a: '#f4d8c0', b: '#e8b898', rim: '#c07a5a', extra: 'plate' },
  cameo: { a: '#e8dcc4', b: '#d4c4a4', rim: '#9a8460', extra: 'oval' },
  velvet: { a: '#8a2a34', b: '#6a1a24', rim: '#40101a', extra: 'none' },
};
function washPix(style, W = 173, H = 88) {
  const S = WASH[style] || WASH.water;
  const p = new Pix(W, H), a = hexc(S.a), b = hexc(S.b), rim = hexc(S.rim);
  const seed = strHash(style);
  const cx = W / 2, cy = H / 2 + 2, rx = W * 0.42, ry = H * 0.4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ang = Math.atan2(y - cy, x - cx);
    const wob = 0.86 + fbm(Math.cos(ang) * 6 + 9, Math.sin(ang) * 6 + 9, 2.2, 2, seed) * 0.28;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry) / wob;
    if (d > 1) {
      // splatter specks outside the wash
      if (d < 1.25 && hash(x, y, seed) < 0.012) p.set(x, y, b);
      continue;
    }
    const g = fbm(x, y, 14, 3, seed + 4);
    let c = mixc(a, b, clamp((g - 0.35) * 1.6 + d * 0.25, 0, 1));
    if (d > 0.9) c = mixc(c, rim, 0.55); // pigment pools at the edge
    else if (d > 0.84 && bayer(x, y) < 0.5) c = mixc(c, rim, 0.3);
    if (hash(x, y, seed + 9) < 0.05) c = mixc(c, rim, 0.25); // granulation
    p.set(x, y, c);
  }
  const ink = hexc(S.rim);
  if (S.extra === 'ripples') {
    for (let k = 0; k < 3; k++) {
      const ry2 = 4 + k * 3, rx2 = 22 + k * 14, y0 = H - 18;
      for (let t = 0; t < Math.PI; t += 0.02) {
        const x = Math.round(cx + Math.cos(t) * rx2), y = Math.round(y0 + Math.sin(t) * ry2 * 0.5);
        if (hash(x, k, 3) < 0.75) p.mix(x, y, ink, 0.6);
      }
    }
    for (const [x, y, r] of [[W - 40, 16, 2.2], [W - 34, 26, 1.5], [36, 20, 1.8]]) for (let t = 0; t < 6.3; t += 0.3) p.mix(x + Math.cos(t) * r, y + Math.sin(t) * r, ink, 0.7);
  } else if (S.extra === 'stars') {
    for (let k = 0; k < 18; k++) {
      const x = Math.round(16 + hash(k, 1, seed) * (W - 32)), y = Math.round(10 + hash(k, 2, seed) * (H - 20));
      if (!p.a(x, y)) continue;
      p.set(x, y, [255, 250, 230]);
      if (k % 4 === 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, [200, 200, 250]);
    }
  } else if (S.extra === 'twig') {
    const bark = hexc('#6a4a2a'), bark2 = hexc('#8a6a40');
    for (let x = 22; x < W - 26; x++) {
      const y = Math.round(H - 20 + Math.sin(x * 0.05) * 3);
      p.set(x, y, bark2); p.set(x, y + 1, bark);
      if (x % 37 === 0) for (let k = 1; k < 7; k++) p.set(x + k, y - k, bark);
    }
    for (const [lx, ly] of [[40, H - 30], [W - 50, H - 26]]) p.ell(lx, ly, 4, 2, hexc('#7aa058'));
  } else if (S.extra === 'grass' || S.extra === 'soil') {
    const g1 = hexc(S.extra === 'grass' ? '#5a8a3a' : '#8a6a40'), g2 = hexc(S.extra === 'grass' ? '#7aac4a' : '#a88a5a');
    for (let x = 18; x < W - 18; x++) {
      const y = H - 16 + Math.round(Math.sin(x * 0.11) * 1.2);
      p.set(x, y, g1);
      if (S.extra === 'grass' && hash(x, 1, 2) < 0.3) for (let k = 1; k < 3 + hash(x, 2, 2) * 4; k++) p.set(x + (hash(x, 3, 2) < 0.5 ? 0 : 1) * (k > 2 ? 1 : 0), y - k, k > 2 ? g2 : g1);
      if (S.extra === 'soil' && hash(x, 4, 2) < 0.15) p.set(x, y + 1, g2);
    }
  } else if (S.extra === 'lily') {
    p.ell(W - 44, H - 22, 14, 5, (x, y, nx, ny) => (ny < -0.1 && Math.abs(nx) < 0.15 ? null : mixc(hexc('#6aa858'), hexc('#3a7a3a'), clamp(ny + 0.5, 0, 1))));
    p.ell(38, H - 18, 9, 3.5, hexc('#5a9a4a'));
  } else if (S.extra === 'plate') {
    p.ell(cx, H - 22, 52, 11, (x, y, nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.85 ? hexc('#d8c8b0') : d > 0.7 ? hexc('#f4ece0') : hexc('#fbf6ee'); });
  }
  return p;
}
// the double-rule ink frame around a plate (drawn separately so it stays crisp)
function plateFramePix(W = 173, H = 88) {
  const p = new Pix(W, H);
  const ink = hexc('#3a2a1e');
  for (const [x, y] of rectPts(0, 0, W - 1, H - 1)) p.set(x, y, ink);
  for (const [x, y] of rectPts(1, 1, W - 2, H - 2)) p.set(x, y, ink);
  for (const [x, y] of rectPts(4, 4, W - 5, H - 5)) if (hash(x, y, 4) > 0.04) p.set(x, y, ink);
  for (const [cx, cy] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]]) {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.abs(i) + Math.abs(j) <= 2) p.set(cx + i, cy + j, ink);
    p.set(cx, cy, hexc('#e8d4a8'));
  }
  return p;
}
// small dog-eared corner (prev / next)
function cornerPix(dir) {
  const S = 26, p = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = dir > 0 ? x : S - 1 - x;
    if (u + y < S - 1) continue;
    const t = (u + y - (S - 1)) / S;
    const v = 4.6 - t * 3 + (u + y === S - 1 ? -2.4 : 0);
    p.set(x, y, PAPER[dq(v, x, y, PAPER.length)]);
  }
  const A = ['...#..', '..##..', '.###..', '####..', '.###..', '..##..', '...#..'];
  A.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') p.set(dir > 0 ? S - 9 + (5 - i) : 3 + i, S - 10 + j, INK); }));
  return p;
}
function bookplatePix() {
  const W = 120, H = 92, p = new Pix(W, H);
  const cream = ramp(['#cbb890', '#e0d0a8', '#efe2c2', '#f8f0dc']);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, cream[dq(2.4 + (fbm(x, y, 18, 2, 5) - 0.5) * 1.2, x, y, 4)]);
  const red = hexc('#8a2024'), ink = hexc('#3a2a1e');
  for (const [x, y] of rectPts(0, 0, W - 1, H - 1)) p.set(x, y, ink);
  for (const [x, y] of rectPts(3, 3, W - 4, H - 4)) p.set(x, y, red);
  for (const [x, y] of rectPts(5, 5, W - 6, H - 6)) if ((x + y) % 2 === 0) p.set(x, y, red);
  // scalloped inner frame corners
  for (const [cx, cy] of [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6]]) for (let a = 0; a < 6.3; a += 0.2) p.set(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, red);
  return p;
}
// little stat icons the sprite set doesn't have
const MINI = {
  gem: ['..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  ruler: ['#########', '#.#.#.#.#', '#.#.#.#.#', '#########'],
  bear: ['##...##', '#######', '#.###.#', '#######', '.##.##.', '..###..'],
  paw: GLYPHS.paw, feather: GLYPHS.feather, leaf: GLYPHS.leaf,
};
function miniIconURL(name, color = '#3a2a1e') {
  return cached(`mini:${name}:${color}`, () => {
    const g = MINI[name];
    const w = g[0].length, h = g.length, p = new Pix(w + 2, h + 2);
    const c = hexc(color), dk = mixc(c, [20, 12, 8], 0.55), lt = mixc(c, [255, 255, 255], 0.45);
    g.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') p.set(x + 1, y + 1, name === 'gem' && (x + y < 4) ? lt : c); }));
    p.outline(0.6);
    if (name === 'gem') { p.set(3, 2, lt); p.set(4, 2, [255, 255, 255]); }
    void dk;
    return p.canvas().toDataURL();
  });
}
function iconURL(name, color) {
  if (!name) return '';
  if (MINI[name]) return miniIconURL(name, color || '#6a4a30');
  if (hasSprite(name)) { try { return spriteURL(name, 1); } catch { return ''; } }
  return miniIconURL('gem', color || '#a8946c');
}

// ---------------------------------------------------------------- art helpers
// an inked silhouette: hatched interior, solid outline
function inkSilhouette(src) {
  if (!src || typeof src === 'string') return null;
  const w = src.width, h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const p = new Pix(w, h);
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const c1 = hexc('#2e2018'), c2 = hexc('#4e3a2a'), c3 = hexc('#3c2c20');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) < 128) continue;
    const edge = A(x - 1, y) < 128 || A(x + 1, y) < 128 || A(x, y - 1) < 128 || A(x, y + 1) < 128;
    p.set(x, y, edge ? c1 : (x + y) % 3 === 0 ? c2 : c3);
  }
  return p.canvas();
}
function loadImage(url) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
}
function imgToCanvas(im) {
  const c = mkCanvas(im.naturalWidth || im.width, im.naturalHeight || im.height);
  c.getContext('2d').drawImage(im, 0, 0);
  return c;
}
// fit art (texel size w x h) into a box with an integer scale
function fitScale(w, h, bw, bh, max = 8) {
  return Math.max(1, Math.min(max, Math.floor(Math.min(bw / w, bh / h))));
}

// ===========================================================================
// the book
// ===========================================================================
export class Encyclopedia {
  constructor({ game = null, root = null, sfx = null, onOpen = null, onClose = null } = {}) {
    this.game = game;
    this.root = root || (typeof document !== 'undefined' ? document.getElementById('ui') || document.body : null);
    this.opt = { sfx, onOpen, onClose };
    this.el = null;
    this.state = 'closed'; // closed | opening | open | closing
    this.pages = [];
    this.pos = 0; // left page index of the visible spread (single mode: the page shown)
    this.leaves = [];
    this.tweens = [];
    this.parts = [];
    this.manual = false;
    this._t = 0;
    this._raf = 0;
    this.revealed = new Set();
    this._html = new Map();
    this._sil = new Map();
    this._fitLvl = new Map();
  }

  get isOpen() { return this.state === 'open' || this.state === 'opening'; }
  toggle(o) { return this.isOpen ? this.close() : this.open(o); }

  sfx(name, o = {}) {
    try {
      if (this.opt.sfx) this.opt.sfx(name, o);
      else this.game?.audio?.play?.(name, { volume: 0.5, ...o });
    } catch { /* never throw for audio */ }
  }

  // -------------------------------------------------------------- open / close
  open({ chapter = null, entry = null, instant = false } = {}) {
    if (this.state === 'open' || this.state === 'opening') { if (chapter) this.goTo(chapter, entry); return Promise.resolve(); }
    if (this.el) this._teardown();
    this.book = buildEncyclopedia(this.game);
    try { commitDexSeen(this.game, this.book); } catch (e) { console.warn('dexSeen', e); }
    this.revealed.clear();
    this._html.clear();
    this._fitLvl.clear();
    this.buildPages();
    this.buildDOM();
    this.layout();
    this.pos = 0;
    this.state = 'opening';
    this.opt.onOpen?.();
    const target = chapter ? this.pageFor(chapter, entry) : null;
    if (instant || reducedMotion()) {
      this.el.classList.add('is-in');
      this._setOpenPose(1);
      this._finishOpen();
      if (target != null) this._jump(target);
      return Promise.resolve();
    }
    return this._openSequence().then(() => { if (target != null && this.state === 'open') return this.goToPage(target); return null; });
  }

  close({ instant = false } = {}) {
    if (!this.el || this.state === 'closing' || this.state === 'closed') return Promise.resolve();
    this._cancelDrag();
    for (const L of [...this.leaves]) this._removeLeaf(L);
    this.state = 'closing';
    const done = () => { this._teardown(); this.state = 'closed'; this.opt.onClose?.(); };
    if (instant || reducedMotion()) { done(); return Promise.resolve(); }
    return this._closeSequence().then(done);
  }

  destroy() { this._teardown(); this.state = 'closed'; }

  _teardown() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.tweens.length = 0; this.parts.length = 0; this.leaves.length = 0;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('resize', this._onResize);
    this.el?.remove();
    this.el = null;
  }

  // -------------------------------------------------------------- pages
  buildPages() {
    const P = [];
    const single = this.single;
    P.push({ kind: 'endpaper' });
    P.push({ kind: 'contents' });
    this.chapterStart = {};
    this.entryPage = {};
    for (const ch of this.book.chapters) {
      if (P.length % 2) P.push({ kind: 'notes', ch });
      this.chapterStart[ch.id] = P.length;
      P.push({ kind: 'chapter', ch });
      P.push({ kind: 'index', ch });
      const per = ch.perPage || 1;
      for (let i = 0; i < ch.entries.length; i += per) {
        const items = ch.entries.slice(i, i + per);
        for (const e of items) this.entryPage[`${ch.id}:${e.id}`] = P.length;
        P.push({ kind: 'entries', ch, items, first: i });
      }
    }
    if (P.length % 2) P.push({ kind: 'notes', ch: null });
    P.push({ kind: 'fin' });
    P.push({ kind: 'backpaper' });
    this.pages = P;
    void single;
  }

  pageFor(chapter, entry) {
    if (entry != null && this.entryPage[`${chapter}:${entry}`] != null) return this.entryPage[`${chapter}:${entry}`];
    return this.chapterStart[chapter] ?? null;
  }

  // the page index shown at the left of the spread that contains page i
  spreadOf(i) { return this.single ? clamp(i, 1, this.pages.length - 2) : i - (i % 2); }

  // -------------------------------------------------------------- DOM
  buildDOM() {
    const el = document.createElement('div');
    el.className = 'enc-ov';
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Encyclopedia');
    const boardL = texClass('boardL', () => scaled(boardPix(31).canvas(), 1));
    const boardR = texClass('boardR', () => boardPix(37).canvas());
    const cover = texClass('cover', () => coverPix().canvas());
    el.innerHTML = `
      <div class="enc-dim"></div>
      <div class="enc-stage">
        <div class="enc-book is-closed">
          <div class="enc-board enc-board-L ${boardL}"></div>
          <div class="enc-board enc-board-R ${boardR}"></div>
          <div class="enc-stack enc-stack-L"></div>
          <div class="enc-stack enc-stack-R"></div>
          <div class="enc-tabs"></div>
          <div class="enc-spread">
            <div class="enc-page enc-L"></div>
            <div class="enc-page enc-R"></div>
            <div class="enc-cast enc-cast-L"></div>
            <div class="enc-cast enc-cast-R"></div>
            <div class="enc-gutter"></div>
            <div class="enc-measure" aria-hidden="true"></div>
            <div class="enc-cover">
              <div class="enc-cface enc-cface--f ${cover}">
                <div class="enc-ctitle">
                  <div class="enc-cvol">VOL. I</div>
                  <div class="enc-cname"><span>ENCYCLOPEDIA</span></div>
                  <div class="enc-cof">of Reynard's Pond</div>
                </div>
                <div class="enc-cmotto">URSUS EDERE DEBET</div>
                <div class="enc-cpub">R. FOX &amp; SONS &middot; PUBLISHERS</div>
                <div class="enc-cshade"></div>
              </div>
              <div class="enc-cface enc-cface--b ${boardL}"><div class="enc-cinside"></div><div class="enc-cshade"></div></div>
            </div>
          </div>
          <button class="enc-corner enc-corner-prev" aria-label="Previous page"></button>
          <button class="enc-corner enc-corner-next" aria-label="Next page"></button>
          <div class="enc-ribbon"></div>
          <button class="enc-close" aria-label="Close the book" title="Close (Esc)"></button>
        </div>
      </div>
      <canvas class="enc-fx"></canvas>`;
    el.style.setProperty('--enc-speck', `url(${cached('speck', () => {
      const N = 32, q = new Pix(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) q.set(x, y, [0, 0, 0], fbm(x, y, 6, 2, 4) < 0.3 || hash(x, y, 9) < 0.07 ? 90 : 255);
      return q.canvas().toDataURL();
    })})`);
    this.root.appendChild(el);
    this.el = el;
    const $ = (s) => el.querySelector(s);
    this.$ = { stage: $('.enc-stage'), book: $('.enc-book'), spread: $('.enc-spread'), L: $('.enc-L'), R: $('.enc-R'), castL: $('.enc-cast-L'), castR: $('.enc-cast-R'), cover: $('.enc-cover'), tabs: $('.enc-tabs'), fx: $('.enc-fx'), stackL: $('.enc-stack-L'), stackR: $('.enc-stack-R'), measure: $('.enc-measure'), prev: $('.enc-corner-prev'), next: $('.enc-corner-next'), close: $('.enc-close'), ribbon: $('.enc-ribbon'), dim: $('.enc-dim') };
    this.fxc = this.$.fx.getContext('2d');
    this.$.prev.style.backgroundImage = `url(${cached('cornerP', () => cornerPix(-1).canvas().toDataURL())})`;
    this.$.next.style.backgroundImage = `url(${cached('cornerN', () => cornerPix(1).canvas().toDataURL())})`;
    this.$.close.style.backgroundImage = `url(${cached('ribX', () => ribbonPix(40, { x: true, hex: '#1f5a3a' }).canvas().toDataURL())})`;
    this.$.ribbon.style.backgroundImage = `url(${cached('ribB', () => ribbonPix(36, { hex: '#7a1420' }).canvas().toDataURL())})`;
    // the inside of the cover is the endpaper page (seen while it swings)
    el.querySelector('.enc-cinside').appendChild(this.pageEl(0));
    this.buildTabs();
    this.bindEvents();
  }

  buildTabs() {
    const T = this.$.tabs;
    T.innerHTML = '';
    this.book.chapters.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'enc-tab';
      b.dataset.tab = ch.id;
      b.title = ch.name;
      b.style.top = `${TAB_TOP + i * (TAB_H + TAB_GAP)}px`;
      b.innerHTML = `<i class="enc-tab-R ${texClass(`tabR_${ch.id}`, () => clothPix(ch.cloth, ch.icon, 'R').canvas())}"></i><i class="enc-tab-L ${texClass(`tabL_${ch.id}`, () => clothPix(ch.cloth, ch.icon, 'L').canvas())}"></i><span class="enc-tab-tip">${esc(ch.short || ch.name)}</span>${ch.known >= ch.total && ch.total ? '<b class="enc-tab-done"></b>' : ''}`;
      T.appendChild(b);
    });
    this.updateTabs();
  }

  updateTabs() {
    if (!this.$) return;
    const pos = this.pos;
    let cur = null;
    for (const ch of this.book.chapters) if (this.chapterStart[ch.id] <= (this.single ? pos : pos + 1)) cur = ch.id;
    for (const b of this.$.tabs.children) {
      const st = this.chapterStart[b.dataset.tab];
      const left = !this.single && st <= pos && this.state !== 'closed';
      b.classList.toggle('is-left', left);
      b.classList.toggle('is-on', b.dataset.tab === cur);
    }
  }

  layout() {
    if (!this.el) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const H = BH + PAD_Y * 2;
    const fitS = Math.min((vw - 12) / (BW + PAD_X * 2), (vh - 8) / H);
    const W1 = PW + OV * 2 + PAD_X + 10;
    const fit1 = Math.min((vw - 6) / W1, (vh - 8) / H);
    const single = fitS < 0.62 && fit1 > fitS * 1.12;
    const fit = single ? fit1 : fitS;
    let s = fit;
    for (const c of [2, 5 / 3, 3 / 2, 4 / 3, 1]) if (fit >= c) { s = c; break; }
    this.scale = s;
    const changed = this.single !== single;
    this.single = single;
    this.el.classList.toggle('is-single', single);
    const st = this.$.stage;
    st.style.width = `${BW}px`; st.style.height = `${BH}px`;
    st.style.transform = `translate(-50%, -50%) scale(${s})`;
    const fx = this.$.fx;
    const fw = Math.ceil(vw / 2), fh = Math.ceil(vh / 2);
    if (fx.width !== fw || fx.height !== fh) { fx.width = fw; fx.height = fh; }
    if (changed && this.state === 'open') {
      this.pos = this.single ? Math.max(1, this.pos + (this.pos % 2 ? 0 : 1)) : this.pos - (this.pos % 2);
      this.renderStatic();
    }
    this._applyBookX();
  }

  _applyBookX() {
    const b = this.$.book;
    const tx = this._bookX ?? 0, ty = this._bookY ?? 0, sx = this._bookSX ?? 1, sy = this._bookSY ?? 1, rx = this._bookRX ?? 0;
    const shift = this.single ? -(PW + OV) / 2 : 0;
    b.style.transform = `translate(${(tx + shift).toFixed(2)}px, ${ty.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }

  // -------------------------------------------------------------- page rendering
  pageEl(i) {
    let tpl = this._html.get(i);
    if (!tpl) {
      const make = () => { const t = document.createElement('template'); t.innerHTML = this.pageHTML(i).trim(); return t; };
      tpl = make();
      // crowded entry pages tighten up until they fit: no note, a shorter plate, compact stats
      if (this.pages[i]?.kind === 'entries' && this.$?.measure) {
        for (let lvl = this._fitLvl.get(i) || 0; lvl < 3; lvl++) {
          const n = tpl.content.firstElementChild.cloneNode(true);
          this.$.measure.replaceChildren(n);
          const col = n.querySelector('.enc-entry:not(.is-compact)');
          const over = col && col.scrollHeight > col.clientHeight + 1;
          this.$.measure.replaceChildren();
          if (!over) break;
          this._fitLvl.set(i, lvl + 1);
          tpl = make();
        }
      }
      this._html.set(i, tpl);
    }
    return tpl.content.firstElementChild.cloneNode(true);
  }

  pageHTML(i) {
    const P = this.pages[i];
    if (!P) return '<div class="enc-pg enc-pg--blank"></div>';
    const side = i % 2 ? 'R' : 'L';
    const seed = (i * 7 + 3) % 4;
    const tex = P.kind === 'endpaper' || P.kind === 'backpaper' ? texClass('marble', () => marblePix(PG_W, PG_H).canvas()) : texClass(`pg${side}${seed}`, () => paperPix(side, seed).canvas());
    let body = '';
    try {
      switch (P.kind) {
        case 'endpaper': body = this.htmlEndpaper(); break;
        case 'backpaper': body = this.htmlBackpaper(); break;
        case 'contents': body = this.htmlContents(); break;
        case 'chapter': body = this.htmlChapter(P.ch); break;
        case 'index': body = this.htmlIndex(P.ch); break;
        case 'entries': body = this.htmlEntries(P, i); break;
        case 'notes': body = this.htmlNotes(P, i); break;
        case 'fin': body = this.htmlFin(); break;
        default: body = '';
      }
    } catch (e) {
      console.warn('encyclopedia page', i, e);
      body = '<div class="enc-err">A page is smudged...</div>';
    }
    const num = P.kind === 'endpaper' || P.kind === 'backpaper' ? '' : `<div class="enc-pnum">${P.kind === 'contents' ? '' : i}</div>`;
    const run = P.ch && P.kind !== 'chapter' ? `<div class="enc-run"><span>${esc(P.ch.name)}</span><i></i><span>${P.kind === 'index' ? 'Index' : P.kind === 'entries' ? `No. ${P.items[0].num}` : ''}</span></div>` : '';
    return `<div class="enc-pg enc-pg--${side} enc-k-${P.kind} ${tex}" data-page="${i}">${run}<div class="enc-body">${body}</div>${num}</div>`;
  }

  // art for an entry/variant -> { url, w, h } (silhouette when unknown); null while pending
  artInfo(key, fn, known, silhouette = true) {
    const k = `${key}|${known ? 1 : 0}`;
    if (this._sil.has(k)) return this._sil.get(k);
    let art = null;
    try { art = fn(1); } catch { art = null; }
    let out = null;
    if (!art) out = null;
    else if (typeof art === 'string') {
      // data URL (3D renders): known shows it directly; silhouettes are made async
      if (known || !silhouette) out = { url: art, w: 0, h: 0, pendingSize: true };
      else {
        out = { url: '', w: 0, h: 0, pending: true };
        loadImage(art).then((im) => {
          if (!im) return;
          const sil = inkSilhouette(imgToCanvas(im));
          const info = { url: sil.toDataURL(), w: sil.width, h: sil.height };
          this._sil.set(k, info);
          this.el?.querySelectorAll(`img[data-sil="${CSS.escape(k)}"]`).forEach((n) => { n.src = info.url; n.style.width = `${n.dataset.bw}px`; });
        });
      }
      if (out.pendingSize) {
        loadImage(art).then((im) => {
          if (!im || !this.el) return;
          const info = { url: art, w: im.naturalWidth, h: im.naturalHeight };
          this._sil.set(k, info);
        });
      }
    } else {
      const c = known || !silhouette ? art : inkSilhouette(art);
      out = c ? { url: c.toDataURL(), w: c.width, h: c.height, canvas: c } : null;
    }
    if (out && !out.pending && !out.pendingSize) this._sil.set(k, out);
    return out;
  }

  imgTag(key, fn, known, { bw, bh, max = 8, cls = '', silhouette = true } = {}) {
    const a = this.artInfo(key, fn, known, silhouette);
    if (!a) return `<span class="enc-noart ${cls}">?</span>`;
    if (a.pending || a.pendingSize) {
      // size unknown yet: let CSS fit it into the box (pixelated)
      return `<img class="enc-img enc-img--fit ${cls}" src="${a.url || 'data:,'}" data-sil="${esc(`${key}|${known ? 1 : 0}`)}" data-bw="${bw}" style="max-width:${bw}px;max-height:${bh}px;width:${Math.min(bw, bh)}px" alt="" draggable="false">`;
    }
    const s = fitScale(a.w, a.h, bw, bh, max);
    return `<img class="enc-img ${cls}" src="${a.url}" width="${a.w * s}" height="${a.h * s}" alt="" draggable="false">`;
  }

  icon(name, color) {
    const u = iconURL(name, color);
    return u ? `<img class="enc-ico" src="${u}" alt="">` : '';
  }

  doodle(name, { x, y, rot = 0, s = 2, op = 0.55, right, bottom } = {}) {
    const u = cached(`doodle:${name}`, () => doodlePix(name).canvas().toDataURL());
    const d = DOODLES[name] || DOODLES.star;
    const w = Math.max(...d.map((r) => r.length)) * s, h = d.length * s;
    const pos = [x != null ? `left:${x}px` : '', y != null ? `top:${y}px` : '', right != null ? `right:${right}px` : '', bottom != null ? `bottom:${bottom}px` : ''].filter(Boolean).join(';');
    return `<img class="enc-doodle" src="${u}" width="${w}" height="${h}" style="${pos};--r:${rot}deg;opacity:${op}" alt="">`;
  }

  progressHTML(known, total, { wide = false } = {}) {
    const f = total ? known / total : 0;
    return `<div class="enc-prog ${wide ? 'is-wide' : ''}"><span class="enc-prog-t">Discovered <b>${known}</b>/${total}</span><span class="enc-prog-bar"><i style="width:${(f * 100).toFixed(1)}%"></i></span></div>`;
  }

  sealImg(ch, big = false) {
    const u = cached(`gseal:${ch.icon}`, () => goldSealPix(ch.icon).canvas().toDataURL());
    return `<img class="enc-gseal ${big ? 'is-big' : ''}" src="${u}" width="${big ? 88 : 44}" height="${big ? 116 : 58}" alt="Complete!" title="Chapter complete!">`;
  }

  // ---- endpaper / back
  htmlEndpaper() {
    const plate = cached('bookplate', () => bookplatePix().canvas().toDataURL());
    const crest = cached('crestSmall', () => {
      const p = crestPix();
      const q = new Pix(p.w, p.h);
      // ink-print version of the crest for the bookplate
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const c = p.get(x, y); if (c) q.set(x, y, mixc(hexc('#8a2024'), [40, 10, 12], clamp(1 - (c[0] + c[1]) / 420, 0, 1))); }
      return q.canvas().toDataURL();
    });
    const B = this.book;
    return `<div class="enc-bookplate" style="background-image:url(${plate})">
        <div class="enc-bp-ex">EX LIBRIS</div>
        <img class="enc-bp-crest" src="${crest}" width="72" height="64" alt="">
        <div class="enc-bp-name">Reynard Fox, Esq.</div>
        <div class="enc-bp-sub">Proprietor &middot; All-U-Can-Eat Pond</div>
      </div>
      <div class="enc-sticky"><b>How to read me</b><br>Tabs = chapters<br>Drag a page corner<br>&larr; &rarr; flip, Esc shuts</div>
      <div class="enc-endnote">${B.known} of ${B.total} logged</div>`;
  }
  htmlBackpaper() { return '<div class="enc-backnote">Printed at the pond. Do not feed this book to bears.</div>'; }

  // ---- contents
  htmlContents() {
    const B = this.book;
    let rows = '';
    B.chapters.forEach((ch, i) => {
      const done = ch.total && ch.known >= ch.total;
      rows += `<li class="enc-toc-row ${done ? 'is-done' : ''}" data-goto-ch="${ch.id}">
          <span class="enc-toc-g ${texClass(`gl_${ch.id}`, () => glyphPix(ch.icon, hexc(ch.color), null).canvas())}"></span>
          <span class="enc-toc-n">${ROMAN[i]}.</span><span class="enc-toc-name">${esc(ch.name)}</span><span class="enc-toc-dots"></span>
          <span class="enc-toc-p">${ch.known}/${ch.total}</span><span class="enc-toc-pg">${this.chapterStart[ch.id]}</span>
          ${done ? this.sealImg(ch) : ''}
        </li>`;
    });
    return `<div class="enc-h1">Contents</div>${this.ruleHTML()}<ol class="enc-toc">${rows}</ol>
      ${this.progressHTML(B.known, B.total, { wide: true })}
      <div class="enc-hand enc-toc-note" style="--r:-3deg">Gotta log 'em all! <i>- R.</i></div>
      ${this.doodle('fox', { right: 34, bottom: 38, rot: 8, op: 0.5 })}`;
  }
  ruleHTML() { return '<div class="enc-rule"><i></i><b></b><i></i></div>'; }

  // ---- chapter title page
  htmlChapter(ch) {
    const idx = this.book.chapters.indexOf(ch);
    const done = ch.total && ch.known >= ch.total;
    // the vignette: the three most valuable known entries (or silhouettes)
    const pick = ch.entries.filter((e) => e.known && e.art).sort((a, b) => (b.rarity?.tier || 0) - (a.rarity?.tier || 0)).slice(0, 3);
    const show = pick.length ? pick : ch.entries.slice(0, 3);
    const pos = [['50%', '44%', 150, 96], ['22%', '66%', 90, 64], ['78%', '66%', 90, 64]];
    let vig = '';
    show.forEach((e, k) => {
      const [x, y, bw, bh] = pos[k];
      vig += `<div class="enc-vig-a" style="left:${x};top:${y}">${this.imgTag(`${ch.id}:${e.id}`, e.art, e.known, { bw, bh, max: 6, silhouette: e.silhouette })}</div>`;
    });
    const wash = texClass(`wash_${ch.plate}`, () => washPix(ch.plate, 150, 92).canvas());
    return `<div class="enc-chap">
        <div class="enc-chap-no">Chapter ${ROMAN[idx]}</div>
        <div class="enc-chap-t">${esc(ch.name)}</div>
        ${this.ruleHTML()}
        <div class="enc-vig ${wash}">${vig}<div class="enc-vig-ring"></div></div>
        <div class="enc-hand enc-blurb" style="--r:-1.5deg">${esc(ch.blurb)}</div>
        ${this.progressHTML(ch.known, ch.total)}
        <div class="enc-chap-seal">${done ? this.sealImg(ch, true) : '<div class="enc-seal-empty">?</div>'}</div>
      </div>
      ${this.doodle(['spiral', 'star', 'arrow', 'sun'][idx % 4], { x: 30, bottom: 44, rot: -10, op: 0.45 })}`;
  }

  // ---- index
  htmlIndex(ch) {
    const n = ch.entries.length;
    const AW = PW - 76, AH = PH - 150;
    let cols = Math.max(3, Math.ceil(Math.sqrt(n * AW / AH)));
    let rows = Math.ceil(n / cols);
    while (rows * 60 > AH && cols < 9) { cols++; rows = Math.ceil(n / cols); }
    const cw = Math.floor(AW / cols), chh = Math.min(84, Math.floor(AH / rows));
    let cells = '';
    for (const e of ch.entries) {
      const tag = this.imgTag(`${ch.id}:${e.id}`, e.art, e.known, { bw: cw - 10, bh: chh - 22, max: 4, silhouette: e.silhouette });
      cells += `<button class="enc-cell ${e.known ? 'is-known' : 'is-unknown'} ${e.isNew ? 'is-new' : ''}" data-goto-e="${ch.id}:${e.id}" title="${esc(e.known ? e.name : '???')}" style="width:${cw}px;height:${chh}px">
          <span class="enc-cell-a">${tag}</span><span class="enc-cell-n">${e.num}</span>${e.isNew ? '<b class="enc-cell-new">NEW</b>' : ''}
        </button>`;
    }
    return `<div class="enc-h2">Index</div><div class="enc-grid">${cells}</div>${this.progressHTML(ch.known, ch.total)}`;
  }

  // ---- notes (filler pages)
  htmlNotes(P, i) {
    const pool = ['bubbles', 'fishbone', 'paws', 'sprout', 'cloud', 'bee', 'heart', 'magnifier'];
    const lines = ['Buy low, sell to bears.', 'Remember: bears hate tiny fish.', 'Note to self: more ponds.', 'Ducks are NOT fish. Check.', 'Get a bigger hat?'];
    return `<div class="enc-h2 enc-notes-t">Notes</div>
      <div class="enc-hand enc-notes-l" style="--r:-2deg">${esc(lines[i % lines.length])}</div>
      ${this.doodle(pool[i % pool.length], { x: 150, y: 250, rot: 6, s: 4, op: 0.4 })}
      ${this.doodle(pool[(i + 3) % pool.length], { right: 60, bottom: 90, rot: -12, s: 2, op: 0.4 })}`;
  }
  htmlFin() {
    const B = this.book;
    return `<div class="enc-fin"><div class="enc-h1">~ Fin ~</div>${this.ruleHTML()}
      <div class="enc-hand" style="--r:-2deg">...for now. There is always more to discover.</div>
      ${this.progressHTML(B.known, B.total, { wide: true })}
      <div class="enc-sig">Reynard</div></div>
      ${this.doodle('fox', { x: 180, y: 330, s: 4, rot: -6, op: 0.45 })}`;
  }

  // ---- entries
  htmlEntries(P, pi) {
    const ch = P.ch;
    if (ch.id === 'trophies') return `<div class="enc-tro-grid">${P.items.map((e) => this.htmlTrophy(e)).join('')}</div>`;
    if ((ch.perPage || 1) > 1) return `<div class="enc-duo">${P.items.map((e) => this.htmlEntry(ch, e, pi, true)).join('<div class="enc-duo-rule"></div>')}</div>`;
    return this.htmlEntry(ch, P.items[0], pi, false);
  }

  statsHTML(e) {
    return `<div class="enc-stats">${(e.stats || []).map((s) => `<div class="enc-stat" title="${esc(s.label)}">
        <span class="enc-stat-i">${this.icon(s.icon, s.color)}</span><span class="enc-stat-v">${e.known ? esc(s.value) : '???'}</span><span class="enc-stat-l">${esc(s.label)}</span></div>`).join('')}</div>`;
  }

  plateHTML(ch, e, { compact = false, short = false } = {}) {
    const W = compact ? 120 : PW - 74, H = compact ? 110 : short ? 144 : 176;
    const style = e.plate || ch.plate || 'water';
    const sz = `${W}x${H}`;
    const wash = texClass(`wash_${style}_${sz}`, () => washPix(style, W / TX, H / TX).canvas());
    const frame = texClass(`frame_${sz}`, () => plateFramePix(W / TX, H / TX).canvas());
    const reveal = e.isNew && !this.revealed.has(`${ch.id}:${e.id}`);
    const known = e.known && !reveal;
    const art = this.imgTag(`${ch.id}:${e.id}`, e.art, known, { bw: W - 40, bh: H - (compact ? 22 : 44), max: compact ? 5 : 8, cls: 'enc-art', silhouette: e.silhouette });
    const seal = e.known && ch.id !== 'trophies' && !compact ? `<div class="enc-seal"><img src="${cached('wax', () => waxSealPix().canvas().toDataURL())}" width="60" height="60" alt=""></div><span class="enc-stamp">DISCOVERED</span>` : '';
    return `<div class="enc-plate ${wash} ${compact ? 'is-compact' : ''} ${e.known ? '' : 'is-unknown'} ${e.isNew ? 'is-new' : ''} ${reveal ? 'will-reveal' : ''}" data-entry="${ch.id}:${e.id}" ${reveal ? 'data-reveal="1"' : ''} style="width:${W}px;height:${H}px">
        <div class="enc-plate-art">${art}${e.known || reveal ? '' : '<b class="enc-q">?</b>'}</div>
        <div class="enc-plate-frame ${frame}"></div>
        ${compact ? '' : `<div class="enc-plate-cap">Plate ${roman(e.num)}${e.known ? ` &middot; <i>${esc(e.sub)}</i>` : ''}</div>`}
        ${e.isNew ? '<div class="enc-newrib"><span>NEW!</span></div>' : ''}
        ${seal}
      </div>`;
  }

  htmlEntry(ch, e, pi, compact) {
    const known = e.known;
    const name = known ? esc(e.name) : '???';
    const gem = e.rarity ? `<img class="enc-gem" src="${miniIconURL('gem', known ? e.rarity.color : '#a8946c')}" alt="">` : '';
    let vars = '';
    if (!compact && e.variants?.length && known) {
      const vw = Math.min(62, Math.floor((PW - 70) / e.variants.length) - 4);
      vars = `<div class="enc-vars"><div class="enc-vars-t">${esc(e.variantsTitle || 'Variants')}</div><div class="enc-vars-r">${e.variants.map((v) => `<div class="enc-var ${v.known ? '' : 'is-unknown'} ${v.isNew ? 'is-new' : ''}" style="width:${vw}px" title="${esc(v.known ? v.name : '???')}">
          <span class="enc-var-a">${this.imgTag(`${ch.id}:${e.id}:v:${v.id}`, v.art, v.known, { bw: vw - 6, bh: 34, max: 3 })}</span><span class="enc-var-n">${v.known ? esc(v.name) : '???'}</span>${v.isNew ? '<b class="enc-var-new"></b>' : ''}</div>`).join('')}</div></div>`;
    }
    let how = '';
    if (e.recipe && !compact) {
      how = `<div class="enc-how enc-recipe">${this.icon('heart')}<span>Recipe:</span>${e.recipe.map((r, k) => `${k ? '<b class="enc-x">&times;</b>' : ''}<span class="enc-rcp">${this.imgTag(`fish:${r.id}`, r.art, r.known, { bw: 40, bh: 22, max: 2 })}<i>${r.known ? esc(r.name) : '???'}</i></span>`).join('')}</div>`;
    } else if (known && e.how) {
      how = `<div class="enc-how">${this.icon('info')}<span>${esc(e.how)}</span></div>`;
    }
    const perks = !compact && known && e.perks?.length ? `<div class="enc-perks">${e.perks.map((p) => `<div class="enc-perk">${this.icon(p.icon)}<span>${esc(p.title)}</span></div>`).join('')}</div>` : '';
    const hearts = !compact && known && e.hearts != null && ch.id === 'villagers' ? `<div class="enc-hearts">${[0, 1, 2, 3, 4].map((k) => this.icon(k < e.hearts ? 'heart' : 'heart_broken')).join('')}</div>` : '';
    const quote = !compact && known && e.quote ? `<div class="enc-quote enc-hand" style="--r:-1deg">&ldquo;${esc(e.quote)}&rdquo;</div>` : '';
    const desc = known ? `<p class="enc-desc">${esc(e.desc)}</p>` : `<p class="enc-desc enc-hint"><span class="enc-hint-k">Where to look:</span> ${esc(e.hint || 'Keep exploring...')}</p>`;
    const h = strHash(e.id);
    const fit = this._fitLvl.get(pi) || 0;
    const note = !compact && e.note && fit < 1 ? `<div class="enc-hand enc-note" style="--r:${(h % 7) - 4}deg">${esc(known ? e.note : 'Still looking...')}</div>` : '';
    const dpool = { fish: ['fishbone', 'bubbles', 'hook'], morphs: ['star', 'spiral', 'magnifier'], birds: ['feather', 'footprint', 'cloud'], bugs: ['bee', 'leafd', 'magnifier'], livestock: ['heart', 'footprint', 'sun'], land: ['paws', 'sprout', 'heart'], plants: ['sprout', 'leafd', 'sun'], foods: ['coin', 'heart', 'star'], villagers: ['heart', 'sun', 'fox'], trophies: ['star', 'coin'] }[ch.id] || ['star'];
    const dood = !compact ? this.doodle(dpool[h % dpool.length], { x: 28, bottom: 40, rot: (h % 20) - 10, op: 0.45 }) : '';
    if (compact) {
      return `<div class="enc-entry is-compact ${known ? '' : 'is-unknown'}">
          ${this.plateHTML(ch, e, { compact: true })}
          <div class="enc-ctext">
            <div class="enc-head">${gem}<span class="enc-name">${name}</span></div>
            <div class="enc-sub">${known ? esc(e.sub) : 'Not yet discovered'}</div>
            ${desc}
          </div>
          ${known ? this.statsHTML(e) : ''}
          ${known && e.how ? `<div class="enc-how">${this.icon('info')}<span>${esc(e.how)}</span></div>` : ''}
        </div>`;
    }
    return `<div class="enc-entry ${known ? '' : 'is-unknown'} enc-ch-${ch.id} ${fit >= 3 ? 'is-tight' : ''}">
        ${this.plateHTML(ch, e, { short: fit >= 2 })}
        <div class="enc-head">${gem}<span class="enc-name">${name}</span>${known && e.rarity ? `<span class="enc-rar" style="--c:${e.rarity.color}">${esc(e.rarity.name)}</span>` : ''}</div>
        <div class="enc-sub">${known ? esc(e.sub) : 'Not yet discovered'}</div>
        ${desc}${quote}
        ${known ? this.statsHTML(e) : ''}
        ${hearts}${perks}${vars}${how}${note}
      </div>${dood}`;
  }

  htmlTrophy(e) {
    const art = this.imgTag(`trophies:${e.id}`, e.art, true, { bw: 120, bh: 110, max: 3, silhouette: false });
    return `<div class="enc-tro ${e.done ? 'is-done' : 'is-locked'} ${e.isNew ? 'is-new' : ''}" data-entry="trophies:${e.id}">
        <div class="enc-tro-art ${texClass(e.done ? 'velvet' : 'velvetL', () => trophyBackPix(e.done).canvas())}">${art}${e.done ? '' : `<span class="enc-tro-lock">${this.icon('lock')}</span>`}</div>
        <div class="enc-tro-name">${esc(e.name)}</div>
        <div class="enc-tro-how"><span>How:</span> ${esc(e.desc)}</div>
        <div class="enc-tro-rew">${this.icon('coin')}<b>+${e.reward}</b></div>
        ${e.done ? '<span class="enc-tro-stamp">DONE</span>' : '<span class="enc-tro-stamp is-locked">LOCKED</span>'}
        ${e.isNew ? '<div class="enc-newrib is-small"><span>NEW!</span></div>' : ''}
      </div>`;
  }

  // -------------------------------------------------------------- static pages
  renderStatic() {
    const { L, R } = this.$;
    if (this.single) {
      L.replaceChildren();
      R.replaceChildren(this.pageEl(this.pos));
    } else {
      L.replaceChildren(this.pageEl(this.pos));
      R.replaceChildren(this.pageEl(this.pos + 1));
    }
    this.updateChrome();
  }

  updateChrome() {
    const last = this.pages.length - 1;
    const atStart = this.single ? this.pos <= 1 : this.pos <= 0;
    const atEnd = this.single ? this.pos >= last - 1 : this.pos + 1 >= last;
    this.$.prev.classList.toggle('is-off', atStart);
    this.$.next.classList.toggle('is-off', atEnd);
    this.updateTabs();
    this.updateStacks();
  }

  updateStacks() {
    const f = this.pages.length > 2 ? this.pos / (this.pages.length - 2) : 0;
    const layers = (k, dir) => {
      const out = [];
      for (let i = 1; i <= k; i++) out.push(`${dir * i}px ${Math.round(i * 0.6)}px 0 ${i % 2 ? '#e2cfa4' : '#b89c70'}`);
      return out.join(',') || 'none';
    };
    const nl = this.single ? 0 : Math.round(1 + f * 5), nr = Math.round(1 + (1 - f) * 5);
    this.$.stackL.style.boxShadow = layers(nl, -1);
    this.$.stackR.style.boxShadow = layers(nr, 1);
  }

  // -------------------------------------------------------------- navigation
  next() { return this.flip(1); }
  prev() { return this.flip(-1); }

  canFlip(dir) {
    if (this.state !== 'open') return false;
    const last = this.pages.length - 1;
    if (this.single) return dir > 0 ? this.pos < last - 1 : this.pos > 1;
    return dir > 0 ? this.pos + 2 <= last - 1 : this.pos >= 2;
  }

  flip(dir, { dur = 640 } = {}) {
    if (!this.canFlip(dir) || this.leaves.length || this.drag) return Promise.resolve(false);
    const L = this._startLeaf(dir);
    this.sfx('page_flip', { volume: 0.55, pitch: 0.92 + Math.random() * 0.16 });
    return this._animateLeaf(L, dir > 0 ? 1 : 0, dur).then(() => true);
  }

  goTo(chapter, entry) {
    const p = this.pageFor(chapter, entry);
    return p == null ? Promise.resolve(false) : this.goToPage(p);
  }

  goToPage(i) {
    if (this.state !== 'open' || this.leaves.length || this.drag) return Promise.resolve(false);
    const target = this.spreadOf(i);
    const cur = this.pos;
    if (target === cur) { this.revealVisible(); return Promise.resolve(true); }
    const dir = target > cur ? 1 : -1;
    const steps = this.single ? Math.abs(target - cur) : Math.abs(target - cur) / 2;
    if (steps <= 1) return this.flip(dir);
    return this._riffle(dir, target, steps);
  }

  _jump(i) {
    this.pos = this.spreadOf(i);
    this.renderStatic();
    this.revealVisible();
  }

  // -------------------------------------------------------------- the leaf (a turning page)
  // dir +1: the right page turns to the left (p 0 -> 1); dir -1: back (p 1 -> 0)
  _startLeaf(dir, { front = null, back = null, blank = false, depth = 0, total = 1 } = {}) {
    const single = this.single;
    const pos = this.pos;
    let fi, bi;
    if (single) { fi = dir > 0 ? pos : pos - 1; bi = -1; } else if (dir > 0) { fi = pos + 1; bi = pos + 2; } else { fi = pos - 1; bi = pos; }
    const frontEl = front || (blank ? this.blankEl('R', depth) : this.pageEl(fi));
    const backEl = back || (bi < 0 ? this.blankEl('L', depth + 1, true) : blank ? this.blankEl('L', depth + 1) : this.pageEl(bi));
    const N = blank ? 1 : single ? 4 : 6;
    const segW = PW / N;
    const el = document.createElement('div');
    el.className = 'enc-leaf';
    const segs = [];
    let parent = el;
    for (let i = 0; i < N; i++) {
      const s = document.createElement('div');
      s.className = 'enc-seg';
      s.style.width = `${segW + (i < N - 1 ? 0.6 : 0)}px`;
      s.style.left = i === 0 ? '0px' : `${segW}px`;
      const f = document.createElement('div');
      f.className = 'enc-face enc-face--f';
      const fc = i === N - 1 ? frontEl : frontEl.cloneNode(true);
      fc.style.left = `${-i * segW}px`;
      const fs = document.createElement('div'); fs.className = 'enc-shade';
      f.append(fc, fs);
      const b = document.createElement('div');
      b.className = 'enc-face enc-face--b';
      const bc = i === N - 1 ? backEl : backEl.cloneNode(true);
      bc.style.left = `${-(PW - (i + 1) * segW)}px`;
      const bs = document.createElement('div'); bs.className = 'enc-shade';
      b.append(bc, bs);
      // stack order inside a riffle: earlier leaves above on the right, later ones above on the left
      const zf = 1 + (total - depth) * 0.6, zb = 1 + depth * 0.6;
      f.style.transform = `translateZ(${zf}px)`;
      b.style.transform = `rotateY(180deg) translateZ(${zb}px)`;
      s.append(f, b);
      parent.appendChild(s);
      parent = s;
      segs.push({ s, fs, bs });
    }
    this.$.spread.appendChild(el);
    const L = { el, segs, N, segW, dir, p: dir > 0 ? 0 : 1, fi, bi, blank, depth };
    this.leaves.push(L);
    // what lies underneath while it turns
    if (!blank && depth === 0) {
      if (single) { if (dir > 0) this.$.R.replaceChildren(this.pageEl(pos + 1)); }
      else if (dir > 0) this.$.R.replaceChildren(this.pageEl(pos + 3));
      else this.$.L.replaceChildren(this.pageEl(pos - 2));
    }
    this.$.book.classList.add('is-flipping');
    this._setLeaf(L, L.p);
    return L;
  }

  blankEl(side, k, verso = false) {
    const cls = texClass(`blank${side}${k % 3}`, () => (verso ? paperPix(side, 3 + k % 2) : blankPagePix(side, k % 3)).canvas());
    const d = document.createElement('div');
    d.className = `enc-pg enc-pg--${side} ${cls}`;
    return d;
  }

  // pose a leaf: p = 0 flat on the right ... 1 flat on the left
  _setLeaf(L, p) {
    L.p = p;
    const N = L.N;
    const base = -180 * p;
    const lift = Math.sin(Math.PI * clamp(p, 0, 1));
    const curl = L.blank ? 0 : lift * (this.single ? 26 : 38) * (L.dir > 0 ? 1 : -1);
    const ang = [];
    for (let i = 0; i < N; i++) {
      const f = N > 1 ? Math.pow(i / (N - 1), 1.35) : 0;
      ang.push(clamp(base - curl * f, -179.6, -0.01));
    }
    let x = 0;
    for (let i = 0; i < N; i++) {
      const rel = i === 0 ? ang[0] : ang[i] - ang[i - 1];
      const S = L.segs[i];
      S.s.style.transform = `rotateY(${rel.toFixed(3)}deg)`;
      // shading across the segment from its neighbours' angles
      const a0 = i === 0 ? ang[0] : (ang[i - 1] + ang[i]) / 2, a1 = i === N - 1 ? ang[i] : (ang[i] + ang[i + 1]) / 2;
      const df = (a) => 0.5 * (1 - Math.cos(a * Math.PI / 180)) * 0.55;
      const db = (a) => 0.5 * (1 + Math.cos(a * Math.PI / 180)) * 0.5;
      const hi = Math.abs(ang[i] - (ang[i - 1] ?? ang[i])) > 3 ? 0.08 : 0;
      S.fs.style.background = `linear-gradient(90deg, rgba(40,22,8,${df(a0).toFixed(3)}), rgba(255,246,220,${hi}) 12%, rgba(40,22,8,${df(a1).toFixed(3)}))`;
      S.bs.style.background = `linear-gradient(270deg, rgba(40,22,8,${db(a0).toFixed(3)}), rgba(40,22,8,${db(a1).toFixed(3)}))`;
      x += L.segW * Math.cos(ang[i] * Math.PI / 180);
    }
    if (L.depth === 0) this._casts(x, lift);
    if (this.single) L.el.style.opacity = p > 0.62 ? String(clamp(1 - (p - 0.62) / 0.3, 0, 1)) : '1';
  }

  // shadows the turning page throws on the pages below
  _casts(x, lift) {
    const { castL, castR } = this.$;
    const a = (0.34 * lift).toFixed(3);
    if (x >= 0) {
      castR.style.opacity = '1';
      castR.style.background = `linear-gradient(90deg, rgba(30,16,6,0) 0, rgba(30,16,6,0) ${x.toFixed(1)}px, rgba(30,16,6,${a}) ${x.toFixed(1)}px, rgba(30,16,6,0) ${(x + 20 + 90 * lift).toFixed(1)}px)`;
      castL.style.opacity = '0';
    } else {
      const xl = PW + x;
      castL.style.opacity = '1';
      castL.style.background = `linear-gradient(270deg, rgba(30,16,6,0) 0, rgba(30,16,6,0) ${(PW - xl).toFixed(1)}px, rgba(30,16,6,${a}) ${(PW - xl).toFixed(1)}px, rgba(30,16,6,0) ${(PW - xl + 20 + 90 * lift).toFixed(1)}px)`;
      castR.style.opacity = '0';
    }
  }

  _animateLeaf(L, to, dur) {
    const from = L.p;
    const d = Math.max(140, dur * Math.abs(to - from));
    return new Promise((res) => {
      this.tween(d, (t) => this._setLeaf(L, from + (to - from) * t), L.blank ? ease.sine : ease.inOut, () => { this._landLeaf(L, to); res(); });
    });
  }

  _landLeaf(L, p) {
    const turned = L.dir > 0 ? p >= 1 : p <= 0; // the turn completed (vs. cancelled)
    if (L.depth === 0 && !L.riffle) {
      if (turned) this.pos += this.single ? L.dir : 2 * L.dir;
      this.renderStatic();
      if (turned) this.revealVisible();
    }
    this._removeLeaf(L);
  }

  _removeLeaf(L) {
    L.el.remove();
    this.leaves = this.leaves.filter((x) => x !== L);
    if (!this.leaves.length) {
      this.$.book.classList.remove('is-flipping');
      this.$.castL.style.opacity = '0'; this.$.castR.style.opacity = '0';
    }
  }

  // several leaves at once for big jumps (tabs, contents, index)
  _riffle(dir, target, steps) {
    const K = clamp(Math.round(steps), 2, 6);
    const pos = this.pos;
    const single = this.single;
    this.sfx('book_riffle', { volume: 0.5 });
    // what's left on the static pages: the target underneath, the current page on top until covered
    if (single) this.$.R.replaceChildren(this.pageEl(dir > 0 ? target : pos));
    else if (dir > 0) this.$.R.replaceChildren(this.pageEl(target + 1));
    else this.$.L.replaceChildren(this.pageEl(target));
    this.$.book.classList.add('is-flipping');
    const leaves = [];
    for (let k = 0; k < K; k++) {
      const first = k === 0, last = k === K - 1;
      let front, back;
      if (single) {
        front = dir > 0 ? (first ? this.pageEl(pos) : this.blankEl('R', k)) : (last ? this.pageEl(target) : this.blankEl('R', k));
        back = this.blankEl('L', k + 1, true);
      } else if (dir > 0) {
        front = first ? this.pageEl(pos + 1) : this.blankEl('R', k);
        back = last ? this.pageEl(target) : this.blankEl('L', k + 1);
      } else {
        front = last ? this.pageEl(target + 1) : this.blankEl('R', k);
        back = first ? this.pageEl(pos) : this.blankEl('L', k + 1);
      }
      const L = this._startLeaf(dir, { front, back, blank: !(first || last), depth: k, total: K });
      L.riffle = true;
      leaves.push(L);
    }
    const stagger = 70, dur = 520;
    return new Promise((res) => {
      let done = 0;
      leaves.forEach((L, k) => {
        this.tween(dur, (t) => this._setLeaf(L, dir > 0 ? t : 1 - t), ease.inOut, () => {
          done++;
          if (done === K) {
            for (const x of leaves) this._removeLeaf(x);
            this.pos = target;
            this.renderStatic();
            this.revealVisible();
            res(true);
          }
        }, k * stagger);
        if (k > 0 && k < K - 1) setTimeout(() => this.sfx('page_flip', { volume: 0.2, pitch: 1.3 + Math.random() * 0.3 }), k * stagger + 120);
      });
    });
  }

  // -------------------------------------------------------------- cover open / close
  _setOpenPose(p) {
    // p: 0 closed (cover on the right, book shifted so the cover is centred) .. 1 open
    const a = -180 * p;
    const c = this.$.cover;
    c.style.transform = `rotateY(${a.toFixed(2)}deg)`;
    const fs = c.querySelector('.enc-cface--f .enc-cshade'), bs = c.querySelector('.enc-cface--b .enc-cshade');
    const r = a * Math.PI / 180;
    fs.style.opacity = String(clamp((1 - Math.cos(r)) * 0.42, 0, 0.8));
    bs.style.opacity = String(clamp((1 + Math.cos(r)) * 0.42, 0, 0.8));
    this._bookX = this.single ? 0 : -(PW + OV) / 2 * (1 - ease.inOut(clamp(p * 1.1, 0, 1)));
    this._applyBookX();
    const lift = Math.sin(Math.PI * p);
    if (p > 0 && p < 1) this._casts(Math.cos(r) * PW, lift * 0.8);
    this.$.book.classList.toggle('is-closed', p <= 0);
    this.$.book.classList.toggle('is-opening', p > 0 && p < 1);
  }

  _openSequence() {
    const book = this.$.book;
    this.renderStatic();
    // the closed book shows the first page under the cover; the left side is empty
    this.$.L.replaceChildren();
    if (this.single) this.$.R.replaceChildren(this.pageEl(1));
    this._setOpenPose(0);
    this.el.classList.add('is-in');
    this.sfx('book_drop', { volume: 0.5 });
    return new Promise((res) => {
      // drop in with a squash
      this.tween(520, (t) => {
        const k = ease.out(t);
        this._bookY = (1 - k) * 90; this._bookRX = (1 - k) * 18;
        const sq = t > 0.6 ? Math.sin((t - 0.6) / 0.4 * Math.PI) * 0.035 : 0;
        this._bookSX = 1 + sq; this._bookSY = 1 - sq;
        book.style.opacity = String(clamp(t * 3, 0, 1));
        this._applyBookX();
      }, (t) => t, () => {
        this._bookY = 0; this._bookRX = 0; this._bookSX = 1; this._bookSY = 1; this._applyBookX();
        book.classList.add('is-glint');
        this.burst('sparkle', { x: PW + (PW + OV) / 2, y: 290, n: 10 });
        this.tween(1150, (t) => {
          this._setOpenPose(t);
          if (t > 0.18 && t < 0.7 && Math.random() < 0.5) this.burst('mote', { x: PW, y: 80 + Math.random() * 420, n: 2, spread: 60 });
        }, ease.inOut, () => {
          this._finishOpen();
          this.burst('mote', { x: PW, y: 300, n: 26, spread: 380 });
          res();
        }, 380);
        setTimeout(() => this.sfx('book_open', { volume: 0.55 }), 380);
      });
    });
  }

  _finishOpen() {
    this._setOpenPose(1);
    this.$.cover.style.display = 'none';
    this.$.book.classList.remove('is-closed', 'is-opening', 'is-glint');
    this.$.book.classList.add('is-open');
    this.$.book.style.opacity = '1';
    this.state = 'open';
    this.pos = this.single ? 1 : 0;
    this.renderStatic();
    this.el.focus({ preventScroll: true });
  }

  _closeSequence() {
    const book = this.$.book;
    const c = this.$.cover;
    c.style.display = '';
    this._setOpenPose(1);
    book.classList.remove('is-open');
    // the inside cover lands over the left page; swap what's under it
    this.$.L.replaceChildren(this.pageEl(0));
    return new Promise((res) => {
      this.tween(760, (t) => this._setOpenPose(1 - t), ease.in, () => {
        this._setOpenPose(0);
        this.sfx('book_close', { volume: 0.6 });
        this.burst('puff', { x: PW + 10, y: BH - 30, n: 14, spread: 220 });
        this.burst('puff', { x: BW - OV, y: 300, n: 8, spread: 60 });
        this.tween(260, (t) => {
          const sq = Math.sin(t * Math.PI) * 0.04;
          this._bookSX = 1 + sq; this._bookSY = 1 - sq; this._applyBookX();
        }, (t) => t, () => {
          this.el.classList.remove('is-in');
          this.tween(300, (t) => { this._bookY = t * 70; book.style.opacity = String(1 - t); this._applyBookX(); }, ease.in, res, 120);
        });
      });
    });
  }

  // -------------------------------------------------------------- ink-blot reveal
  revealVisible() {
    if (!this.el) return;
    const plates = [...this.$.L.querySelectorAll('[data-reveal]'), ...this.$.R.querySelectorAll('[data-reveal]')];
    plates.forEach((pl, k) => {
      const key = pl.dataset.entry;
      if (this.revealed.has(key)) return;
      this.revealed.add(key);
      const pg = pl.closest('[data-page]');
      if (pg) this._html.delete(+pg.dataset.page);
      setTimeout(() => this.inkReveal(pl), 180 + k * 420);
    });
    // trophies and compact entries just get their ribbon pop
    for (const n of [...this.$.L.querySelectorAll('.enc-tro.is-new, .enc-entry.is-compact .enc-plate.is-new'), ...this.$.R.querySelectorAll('.enc-tro.is-new, .enc-entry.is-compact .enc-plate.is-new')]) n.classList.add('is-revealed');
  }

  inkReveal(plate) {
    if (!this.el || !plate.isConnected) return;
    const [chId, eid] = plate.dataset.entry.split(':');
    const ch = this.book.chapters.find((c) => c.id === chId);
    const e = ch?.entries.find((x) => String(x.id) === eid);
    const img = plate.querySelector('.enc-art');
    if (!e || !img) { plate.classList.add('is-revealed'); return; }
    const key = `${chId}:${e.id}`;
    const art = this.artInfo(key, e.art, true, e.silhouette);
    const sil = this.artInfo(key, e.art, false, e.silhouette);
    const go = (A, S) => {
      if (!A?.canvas || !S?.canvas || !plate.isConnected) { if (A?.url) img.src = A.url; plate.classList.add('is-revealed'); this.sfx('book_seal', { volume: 0.4 }); return; }
      const w = A.canvas.width, h = A.canvas.height;
      const cv = mkCanvas(w, h);
      cv.className = 'enc-ink';
      cv.style.width = img.style.width || `${img.width}px`;
      cv.style.height = img.style.height || `${img.height}px`;
      cv.style.left = `${img.offsetLeft}px`; cv.style.top = `${img.offsetTop}px`;
      img.after(cv);
      img.style.visibility = 'hidden';
      const g = cv.getContext('2d');
      const ad = A.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const sd = S.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
      const out = g.createImageData(w, h);
      const cx = w * (0.4 + hash(w, h, 1) * 0.2), cy = h * 0.5;
      const seed = strHash(key);
      const wet = [26, 20, 44];
      const frame = (t) => {
        const o = out.data;
        const r = t * 1.45;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const a = Math.atan2(y - cy, x - cx);
          const d = Math.hypot((x - cx) / (w * 0.5), (y - cy) / (h * 0.5)) / (0.78 + vnoise(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5, seed) * 0.44);
          let src = sd;
          if (d < r - 0.12) src = ad;
          if (!src[i + 3] && !(d < r && d > r - 0.12 && ad[i + 3])) { o[i + 3] = 0; continue; }
          if (d >= r - 0.12 && d < r && (ad[i + 3] || sd[i + 3])) { o[i] = wet[0]; o[i + 1] = wet[1]; o[i + 2] = wet[2]; o[i + 3] = 255; continue; }
          o[i] = src[i]; o[i + 1] = src[i + 1]; o[i + 2] = src[i + 2]; o[i + 3] = src[i + 3];
        }
        g.putImageData(out, 0, 0);
      };
      plate.classList.add('is-inking');
      this.sfx('ink_blot', { volume: 0.5 });
      frame(0);
      this.tween(1000, frame, ease.out, () => {
        img.src = A.url;
        img.style.visibility = '';
        cv.remove();
        plate.classList.remove('is-inking');
        plate.classList.add('is-revealed');
        const r = plate.getBoundingClientRect();
        this.burstScreen('sparkle', r.left + r.width / 2, r.top + r.height / 2, 12, r.width * 0.4);
        setTimeout(() => this.sfx('book_seal', { volume: 0.45 }), 380);
      });
    };
    if (art?.canvas && sil?.canvas) go(art, sil);
    else {
      // 3D-rendered (URL) art: decode first
      let url = null;
      try { url = e.art(1); } catch { url = null; }
      if (typeof url !== 'string') { go(art, sil); return; }
      loadImage(url).then((im) => {
        if (!im) { go(null, null); return; }
        const c = imgToCanvas(im);
        go({ canvas: c, url }, { canvas: inkSilhouette(c) });
      });
    }
  }

  // -------------------------------------------------------------- tweens + fx loop
  clock() { return this.manual ? this._t : performance.now(); }

  tween(dur, fn, ez = (t) => t, done = null, delay = 0) {
    const tw = { t0: this.clock() + delay, dur, fn, ez, done };
    this.tweens.push(tw);
    this._kick();
    return tw;
  }

  _kick() {
    if (this._raf || this.manual || !this.el) return;
    const loop = () => {
      this._raf = 0;
      this._tick(performance.now());
      if (this.el && (this.tweens.length || this.parts.length) && !this.manual) this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // manual stepping for previews / tests
  advance(ms) { this.manual = true; this._t += ms; this._tick(this._t); }

  _tick(now) {
    const last = this._lastTick ?? now;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    this._lastTick = now;
    for (const tw of [...this.tweens]) {
      if (now < tw.t0) continue;
      const t = clamp((now - tw.t0) / tw.dur, 0, 1);
      try { tw.fn(tw.ez(t), t); } catch (e) { console.warn('encyclopedia tween', e); }
      if (t >= 1) {
        this.tweens = this.tweens.filter((x) => x !== tw);
        try { tw.done?.(); } catch (e) { console.warn('encyclopedia tween done', e); }
      }
    }
    this._fx(dt);
  }

  // book coordinates -> screen (fx canvas works in screen px / 2)
  bookToScreen(x, y) {
    const r = this.$.spread.getBoundingClientRect();
    const s = r.width / (2 * PW) || 1;
    return [r.left + (x - OV) * s, r.top + (y - OV) * s, s];
  }
  burst(kind, { x, y, n = 8, spread = 40 }) {
    if (!this.el) return;
    const [sx, sy, s] = this.bookToScreen(x, y);
    this.burstScreen(kind, sx, sy, n, spread * s);
  }
  burstScreen(kind, sx, sy, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
      const p = { kind, x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r * (kind === 'puff' ? 0.3 : 1), t: 0, seed: Math.random() * 10 };
      if (kind === 'mote') { p.life = 2.5 + Math.random() * 3; p.vx = (Math.random() - 0.5) * 16; p.vy = -6 - Math.random() * 18; }
      else if (kind === 'sparkle') { p.life = 0.5 + Math.random() * 0.6; p.vx = Math.cos(a) * 30; p.vy = Math.sin(a) * 30 - 20; }
      else { p.life = 0.6 + Math.random() * 0.5; p.vx = Math.cos(a) * (40 + Math.random() * 60); p.vy = -Math.random() * 40; p.r = 3 + Math.random() * 5; }
      this.parts.push(p);
    }
    this._kick();
  }
  _fx(dt) {
    const c = this.fxc;
    if (!c) return;
    const W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    if (!this.parts.length) return;
    for (const p of this.parts) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'mote') { p.vx += Math.sin(p.t * 1.7 + p.seed) * 6 * dt; }
      else if (p.kind === 'puff') { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; p.r += 14 * dt; }
      else p.vy += 40 * dt;
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const p of this.parts) {
      const k = p.t / p.life, x = Math.round(p.x / 2), y = Math.round(p.y / 2);
      if (p.kind === 'mote') {
        const a = Math.sin(Math.PI * k) * (0.55 + 0.45 * Math.sin(p.t * 6 + p.seed));
        c.fillStyle = `rgba(255,236,180,${a.toFixed(3)})`;
        c.fillRect(x, y, 1, 1);
        if (p.seed > 7) c.fillRect(x + 1, y, 1, 1);
      } else if (p.kind === 'sparkle') {
        const a = 1 - k;
        c.fillStyle = `rgba(255,248,200,${a.toFixed(3)})`;
        const L = k < 0.5 ? 2 : 1;
        c.fillRect(x - L, y, L * 2 + 1, 1); c.fillRect(x, y - L, 1, L * 2 + 1);
      } else {
        const a = (1 - k) * 0.55, r = Math.round(p.r / 2);
        c.fillStyle = `rgba(214,196,160,${a.toFixed(3)})`;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r && bayer(x + i & 3, y + j & 3) < 0.6) c.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  // -------------------------------------------------------------- input
  bindEvents() {
    const el = this.el;
    el.addEventListener('click', (ev) => this._onClick(ev));
    el.addEventListener('wheel', (ev) => this._onWheel(ev), { passive: false });
    el.addEventListener('pointerdown', (ev) => this._onDown(ev));
    el.addEventListener('pointermove', (ev) => this._onMove(ev));
    el.addEventListener('pointerup', (ev) => this._onUp(ev));
    el.addEventListener('pointercancel', () => this._cancelDrag());
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this._onKey = (ev) => this._key(ev);
    this._onResize = () => this.layout();
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('resize', this._onResize);
  }

  _key(ev) {
    if (!this.el || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    // the book is modal: the game doesn't get keys while it's open
    ev.stopPropagation();
    if (k === 'Escape') { ev.preventDefault(); this.close(); return; }
    if (this.state !== 'open') return;
    if (k === 'ArrowRight' || k === 'PageDown' || k === 'd' || k === 'D') { ev.preventDefault(); this.next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'a' || k === 'A') { ev.preventDefault(); this.prev(); }
    else if (k === 'Home') { ev.preventDefault(); this.goToPage(1); }
    else if (k === 'End') { ev.preventDefault(); this.goToPage(this.pages.length - 1); }
    else if (k === ' ') ev.preventDefault();
  }

  _onWheel(ev) {
    ev.preventDefault();
    const now = performance.now();
    if (now - (this._wheelT || 0) < 380 || Math.abs(ev.deltaY) + Math.abs(ev.deltaX) < 12) return;
    this._wheelT = now;
    if (ev.deltaY + ev.deltaX > 0) this.next(); else this.prev();
  }

  _onClick(ev) {
    if (this._dragged) { this._dragged = false; return; }
    const t = ev.target;
    if (t.closest('.enc-close')) { this.close(); return; }
    if (this.state !== 'open') return;
    if (t.closest('.enc-leaf')) return;
    if (t.closest('.enc-corner-next')) { this.next(); return; }
    if (t.closest('.enc-corner-prev')) { this.prev(); return; }
    const tab = t.closest('[data-tab]');
    if (tab) { this.sfx('book_tab', { volume: 0.5 }); this.goTo(tab.dataset.tab); return; }
    const ch = t.closest('[data-goto-ch]');
    if (ch) { this.sfx('book_tab', { volume: 0.35, pitch: 1.2 }); this.goTo(ch.dataset.gotoCh); return; }
    const en = t.closest('[data-goto-e]');
    if (en) { const [c, id] = en.dataset.gotoE.split(':'); this.sfx('book_tab', { volume: 0.35, pitch: 1.3 }); this.goTo(c, id); return; }
    if (t === this.$.dim || t === this.el || t === this.$.stage) this.close();
  }

  // drag a page: the grabbed point follows the pointer
  _local(ev) {
    const r = this.$.spread.getBoundingClientRect();
    const s = r.width / (2 * PW) || 1;
    return { x: (ev.clientX - r.left) / s - PW, y: (ev.clientY - r.top) / s, s };
  }
  _onDown(ev) {
    if (this.state !== 'open' || this.leaves.length || ev.button > 0) return;
    if (!ev.target.closest('.enc-spread, .enc-corner')) return;
    const p = this._local(ev);
    if (p.y < -OV || p.y > PH + OV) return;
    this.drag = { id: ev.pointerId, x0: p.x, x: p.x, t0: performance.now(), vx: 0, lastX: p.x, lastT: performance.now(), leaf: null, dir: 0 };
  }
  _onMove(ev) {
    const D = this.drag;
    if (!D || ev.pointerId !== D.id) return;
    const p = this._local(ev);
    const now = performance.now();
    D.vx = (p.x - D.lastX) / Math.max(1, now - D.lastT);
    D.lastX = p.x; D.lastT = now; D.x = p.x;
    const dx = p.x - D.x0;
    if (!D.leaf) {
      if (Math.abs(dx) < 10) return;
      const dir = this.single ? (dx < 0 ? 1 : -1) : D.x0 >= 0 ? 1 : -1;
      if ((dir > 0 && dx > 0) || (dir < 0 && dx < 0) || !this.canFlip(dir)) { this.drag = null; return; }
      D.dir = dir;
      D.leaf = this._startLeaf(dir);
      try { this.el.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      this.sfx('page_flip', { volume: 0.25, pitch: 1.25 });
    }
    this._setLeaf(D.leaf, this._dragP(D, p.x));
  }
  _dragP(D, x) {
    if (this.single) return D.dir > 0 ? clamp(-(x - D.x0) / PW, 0, 1) : clamp(1 - (x - D.x0) / PW, 0, 1);
    const d = Math.max(150, Math.abs(D.x0));
    return clamp(Math.acos(clamp(x / d, -1, 1)) / Math.PI, 0, 1);
  }
  _onUp(ev) {
    const D = this.drag;
    if (!D || ev.pointerId !== D.id) return;
    this.drag = null;
    if (!D.leaf) return;
    this._dragged = true;
    setTimeout(() => { this._dragged = false; }, 0);
    const L = D.leaf;
    const fling = D.vx * (D.dir > 0 ? -1 : 1) > 0.35;
    const p = L.p;
    const done = D.dir > 0 ? p > 0.5 || (fling && p > 0.06) : p < 0.5 || (fling && p < 0.94);
    const to = D.dir > 0 ? (done ? 1 : 0) : (done ? 0 : 1);
    if (done) this.sfx('page_flip', { volume: 0.4, pitch: 1.05 });
    this._animateLeaf(L, to, 520);
  }
  _cancelDrag() {
    const D = this.drag;
    this.drag = null;
    if (D?.leaf) this._animateLeaf(D.leaf, D.dir > 0 ? 0 : 1, 400);
  }

  // -------------------------------------------------------------- previews / tests
  // Pose the book at a moment of an animation without timers:
  //   _pose({ open: 0..1 })                       the cover mid-swing
  //   _pose({ flip: 0..1, dir: 1|-1 })            a page mid-turn
  _pose({ open = null, flip = null, dir = 1 } = {}) {
    if (open != null) {
      this.$.cover.style.display = '';
      this.$.book.style.opacity = '1';
      this.$.book.classList.remove('is-open');
      if (open < 1) { this.$.L.replaceChildren(); if (this.single) this.$.R.replaceChildren(this.pageEl(1)); }
      this._setOpenPose(open);
    }
    if (flip != null) {
      let L = this.leaves[0];
      if (!L) L = this._startLeaf(dir);
      this._setLeaf(L, dir > 0 ? flip : 1 - flip);
    }
  }
}

// the trophy cabinet background: velvet (done) or a pencil-hatched niche (locked)
function trophyBackPix(done) {
  const W = 70, H = 60, p = new Pix(W, H);
  const V = done ? ramp(['#3a0e16', '#561620', '#70202a', '#8a2c34']) : ramp(['#c4b090', '#d4c2a2', '#e0d0b2', '#e8dcc0']);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const arch = y < 14 ? Math.hypot((x - W / 2) / (W / 2), (14 - y) / 14) > 1 : false;
    if (arch) continue;
    let v = 1.6 + (fbm(x, y, 10, 2, done ? 3 : 4) - 0.5) * 1.2 - (y > H - 8 ? 0.8 : 0) + (x < 4 || x > W - 5 ? -0.6 : 0);
    if (!done && (x + y) % 5 === 0) v -= 0.8;
    p.set(x, y, V[dq(v, x, y, 4)]);
  }
  return p;
}

// convenience: one shared book per game
export function openEncyclopedia(game, opts = {}) {
  const ui = game?.ui;
  const host = ui || game || {};
  host._encyclopedia ||= new Encyclopedia({ game, root: ui?.root });
  return host._encyclopedia.open(opts);
}

export const __encArt = { coverPix, paperPix, marblePix, crestPix, waxSealPix, goldSealPix, washPix, clothPix, medalArt };
