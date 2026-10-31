// [v30 ebuy] Crisp canvas art for the e-Buy shop (src/ui/EBuy.js).
//
// Every picture here is painted at DEVICE resolution and shown 1:1, so pixel art
// lands on whole device pixels on every screen (iPad @2, phones @3, desktops @1):
//
//   loadArt(src)            -> Promise<Art>   item image (canvas or URL) analysed once:
//   artNow(src)             -> Art | null      its pixel-art texel size is found (gcd of
//                                              colour runs), it is trimmed and shrunk to
//                                              1 canvas px = 1 art texel. Cached by src.
//   paintWell(cv, w, h, o)  paints an item "well" (backdrop + spotlight + floor shadow +
//                           item + optional egg) into canvas cv for a CSS box w x h
//   paintThumb(cv, art, css, o)  a small square item thumbnail (cart lines, receipt)
//   paintBezel(cv, w, h)    the laptop's beige plastic body (stepped chamfer corners,
//                           bevel, speckle, screws, vents)
//   tiles()                 { wood, woodDark, paper, rail } -> { url, size } CSS backgrounds
//                           drawn at device px (background-size given in CSS px)
//
// Art = { c: texel canvas, w, h, smooth: bool (not pixel art: scaled smoothly) }
import { dpr } from './uiScale.js';

const INK = '#2a1a14';
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

// ---------------------------------------------------------------- item art
const cache = new Map(); // src -> { art, p }
const keyOf = (src) => (typeof src === 'string' ? src : src);

function analyse(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let d;
  try { d = new Uint32Array(g.getImageData(0, 0, w, h).data.buffer); } catch { return { c, w, h, smooth: true }; }
  // transparent pixels compare equal whatever their rgb
  for (let i = 0; i < d.length; i++) if ((d[i] >>> 24) < 8) d[i] = 0;
  let t = 0;
  outer: for (let y = 0; y < h; y++) {
    let run = 1;
    for (let x = 1; x < w; x++) {
      if (d[y * w + x] === d[y * w + x - 1]) run++;
      else { t = gcd(t, run); run = 1; if (t === 1) break outer; }
    }
    t = gcd(t, run);
    if (t === 1) break;
  }
  if (t > 1) {
    outer2: for (let x = 0; x < w; x++) {
      let run = 1;
      for (let y = 1; y < h; y++) {
        if (d[y * w + x] === d[(y - 1) * w + x]) run++;
        else { t = gcd(t, run); run = 1; if (t === 1) break outer2; }
      }
      t = gcd(t, run);
      if (t === 1) break;
    }
  }
  t = Math.max(1, t || 1);
  // trim the transparent margin
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!d[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  x0 = Math.floor(x0 / t) * t; y0 = Math.floor(y0 / t) * t;
  const bw = Math.ceil((x1 + 1 - x0) / t), bh = Math.ceil((y1 + 1 - y0) / t);
  const out = document.createElement('canvas');
  out.width = bw; out.height = bh;
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = false;
  og.drawImage(c, x0, y0, bw * t, bh * t, 0, 0, bw, bh);
  // a big image with no pixel grid is a painting, not pixel art
  return { c: out, w: bw, h: bh, smooth: t === 1 && Math.max(bw, bh) > 72 };
}

export function artNow(src) { return src ? cache.get(keyOf(src))?.art || null : null; }
export function loadArt(src) {
  if (!src) return Promise.resolve(null);
  const k = keyOf(src);
  let e = cache.get(k);
  if (e) return e.p;
  e = { art: null, p: null };
  cache.set(k, e);
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    try { e.art = analyse(src); } catch { e.art = null; }
    e.p = Promise.resolve(e.art);
    return e.p;
  }
  const url = typeof src === 'string' ? src : src.src;
  e.p = new Promise((res) => {
    const im = new Image();
    im.onload = () => { try { e.art = analyse(im); } catch { e.art = null; } res(e.art); };
    im.onerror = () => res(null);
    im.src = url;
  });
  return e.p;
}

// ---------------------------------------------------------------- palettes
// well backdrops: [base, checker, light, rim]
const WELL = {
  none: ['#f7eed6', '#f2e6c8', '#fffaf0', '#e4d4ae'],
  common: ['#f7eed6', '#f2e6c8', '#fffaf0', '#e4d4ae'],
  uncommon: ['#e6f3d2', '#dcedc4', '#f6fdea', '#bcdc9a'],
  rare: ['#ddeffa', '#d0e6f6', '#f2faff', '#a8d0f0'],
  epic: ['#f0e2fa', '#e6d4f6', '#fbf4ff', '#cfb0ec'],
  legendary: ['#fff2c4', '#fde8a4', '#fffbe6', '#f0cc66'],
  locked: ['#e4dfd6', '#dbd5ca', '#ece8e0', '#c8c0b2'],
  hot: ['#ffe2c4', '#ffd4ac', '#fff4e0', '#ffb070'],
  doublehot: ['#ffd4c0', '#ffc4a8', '#fff0e0', '#ff8a60'],
  frozen: ['#e2f6ff', '#d2eefc', '#f6fdff', '#9ad4f4'],
  candy: ['#ffe4f0', '#ffd6e8', '#fff6fa', '#ff9ac8'],
  doge: ['#fff0c4', '#ffe6a4', '#fffbe6', '#f0b848'],
  zombie: ['#e2f0d4', '#d6e8c4', '#f2faea', '#9ccc7a'],
  galaxy: ['#2a1c5a', '#24184e', '#4a3488', '#6a50b0'],
  shiny: ['#fff6d0', '#fdeeb4', '#fffdf0', '#f0cc66'],
  rainbow: ['#f2ecff', '#eae2fc', '#fdfaff', '#c8b8f0'],
};
const EGG = {
  common: { e: '#fff1d6', w: '#ffffff', s: '#c89a64', d: '#e6cfa6', k: '#7a5a3a' },
  uncommon: { e: '#c8f0a8', w: '#effde0', s: '#5a9a3a', d: '#a0d47e', k: '#2f5a24' },
  rare: { e: '#bfe2ff', w: '#f0f9ff', s: '#3c7ac8', d: '#92c4ee', k: '#1f3f7a' },
  epic: { e: '#e6c8ff', w: '#faf2ff', s: '#8a4ac8', d: '#c8a0ee', k: '#4a1f7a' },
  legendary: { e: '#ffe88a', w: '#fffbe0', s: '#d09010', d: '#f0c850', k: '#7a4a10' },
};
const EGG_ROWS = [
  '...kkkk...',
  '..kweeek..',
  '.kwweeeek.',
  '.kweeseedk',
  'kweeeeeedk',
  'keeseeeedk',
  'keeeeeseek',
  'keseeeeedk',
  'keeeeeeddk',
  '.keeesedk.',
  '..kddddk..',
  '...kkkk...',
];
const eggCache = new Map();
function eggArt(rarity) {
  const pal = EGG[rarity] || EGG.common;
  let c = eggCache.get(rarity);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 10; c.height = 12;
  const g = c.getContext('2d');
  EGG_ROWS.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = pal[row[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
  eggCache.set(rarity, c);
  return c;
}

// ---------------------------------------------------------------- canvas sizing
// size cv to the CSS box at device resolution; returns { g, W, H, r }
function fit(cv, w, h) {
  const r = dpr();
  const W = Math.max(1, Math.round(w * r)), H = Math.max(1, Math.round(h * r));
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  cv.style.width = `${W / r}px`;
  cv.style.height = `${H / r}px`;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  return { g, W, H, r };
}
// a pixel-stepped ellipse, B device px per step
function ellipse(g, cx, cy, rx, ry, B, col) {
  g.fillStyle = col;
  const rows = Math.max(1, Math.round(ry / B));
  for (let j = -rows; j < rows; j++) {
    const yy = (j + 0.5) / rows;
    const hw = Math.round((rx * Math.sqrt(Math.max(0, 1 - yy * yy))) / B) * B;
    if (hw <= 0) continue;
    g.fillRect(Math.round(cx - hw), Math.round(cy + j * B), hw * 2, B);
  }
}
function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), (s >>> 0) / 4294967296);
}

/**
 * paintWell(cv, w, h, o): o = { art, tone: WELL key, locked, egg: rarity|null, fill (0..1 of box),
 *   maxCss (max CSS px per art texel), minCss, seed, sparkle: n, big: bool, scale: 1 | 0.5 | 1.25 }
 * returns { x, y, w, h } of the item in CSS px (for fly-to-cart), or null
 */
export function paintWell(cv, w, h, o = {}) {
  if (!(w > 2 && h > 2)) return null;
  const { g, W, H, r } = fit(cv, w, h);
  const B = Math.max(1, Math.round((o.big ? 3 : 2) * r)); // backdrop texel
  const pal = WELL[o.tone] || WELL.none;
  // checker backdrop
  g.fillStyle = pal[0];
  g.fillRect(0, 0, W, H);
  g.fillStyle = pal[1];
  for (let y = 0, j = 0; y < H; y += B, j++) for (let x = (j % 2) * B; x < W; x += B * 2) g.fillRect(x, y, B, B);
  if (o.locked) {
    // diagonal hatch
    g.fillStyle = 'rgba(42,26,20,0.05)';
    for (let y = 0; y < H; y += B) for (let x = ((y / B) % 8) * B - W; x < W; x += B * 8) g.fillRect(x + W, y, B * 2, B);
  }
  const rand = rnd(o.seed || 7);
  // spotlight + floor
  const cx = W / 2, cy = H * 0.47;
  if (!o.locked) {
    ellipse(g, cx, cy, W * 0.4, H * 0.38, B, pal[2] + 'b0');
    ellipse(g, cx, cy, W * 0.3, H * 0.29, B, pal[2]);
  }
  // shelf lip at the bottom
  g.fillStyle = pal[3];
  g.fillRect(0, H - B * 2, W, B * 2);
  g.fillStyle = 'rgba(42,26,20,0.1)';
  g.fillRect(0, H - B * 2, W, Math.max(1, Math.round(r)));
  // sparkles (rare things)
  for (let i = 0; i < (o.sparkle || 0); i++) {
    const sx = Math.round((0.08 + rand() * 0.84) * W / B) * B, sy = Math.round((0.08 + rand() * 0.6) * H / B) * B;
    g.fillStyle = o.tone === 'galaxy' ? '#ffffff' : '#ffffffd0';
    g.fillRect(sx, sy - B, B, B * 3); g.fillRect(sx - B, sy, B * 3, B);
  }
  if (o.tone === 'galaxy') {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) g.fillRect(Math.floor(rand() * W / B) * B, Math.floor(rand() * H * 0.9 / B) * B, B, B);
  }
  const art = o.art;
  if (!art) return null;
  // item scale: whole device px per art texel
  const fillK = o.fill || 0.74;
  let k;
  if (art.smooth) k = Math.min((W * fillK) / art.w, (H * fillK) / art.h);
  else {
    k = Math.floor(Math.min((W * fillK) / art.w, (H * (fillK - 0.02)) / art.h));
    const maxK = Math.max(1, Math.round((o.maxCss || 4) * r));
    k = Math.max(1, Math.min(k, maxK));
    if (o.minCss) k = Math.max(k, Math.round(o.minCss * r));
    if (o.scale && o.scale !== 1) k = Math.max(1, Math.round(k * o.scale));
  }
  const iw = Math.round(art.w * k), ih = Math.round(art.h * k);
  const x = Math.round(cx - iw / 2), y = Math.round(cy - ih / 2);
  // floor shadow
  const fy = Math.min(H - B * 3, y + ih + B);
  ellipse(g, cx, fy, Math.max(B * 3, iw * 0.42), Math.max(B, Math.round(B * 1.5)), B, o.tone === 'galaxy' ? 'rgba(0,0,0,0.3)' : 'rgba(42,26,20,0.14)');
  g.imageSmoothingEnabled = !!art.smooth;
  if (o.locked) {
    // a solid silhouette with a 1-texel lighter rim
    const s = document.createElement('canvas');
    s.width = iw; s.height = ih;
    const sg = s.getContext('2d');
    sg.imageSmoothingEnabled = !!art.smooth;
    sg.drawImage(art.c, 0, 0, iw, ih);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#5c5266';
    sg.fillRect(0, 0, iw, ih);
    g.globalAlpha = 0.9;
    g.drawImage(s, x, y);
    g.globalAlpha = 1;
  } else {
    g.drawImage(art.c, x, y, iw, ih);
    if (o.egg) {
      const e = eggArt(o.egg);
      const ek = art.smooth ? Math.max(1, Math.round(r * 3)) : k;
      const ew = e.width * ek, eh = e.height * ek;
      const ex = Math.min(W - ew - B, Math.round(x + iw - ew * 0.55)), ey = Math.min(H - eh - B * 2, Math.round(y + ih - eh * 0.7));
      g.imageSmoothingEnabled = false;
      g.drawImage(e, ex, ey, ew, eh);
    }
  }
  g.imageSmoothingEnabled = false;
  return { x: x / r, y: y / r, w: iw / r, h: ih / r };
}

/** a square thumbnail (no backdrop): art fitted into css x css */
export function paintThumb(cv, art, css, o = {}) {
  const { g, W, H, r } = fit(cv, css, css);
  if (!art) return;
  let k;
  if (art.smooth) k = Math.min((W * 0.9) / art.w, (H * 0.9) / art.h);
  else k = Math.max(1, Math.min(Math.floor(Math.min((W * 0.92) / art.w, (H * 0.92) / art.h)), Math.round((o.maxCss || 3) * r)));
  const iw = Math.round(art.w * k), ih = Math.round(art.h * k);
  g.imageSmoothingEnabled = !!art.smooth;
  const x = Math.round((W - iw) / 2), y = Math.round((H - ih) / 2);
  g.drawImage(art.c, x, y, iw, ih);
  if (o.egg) {
    const e = eggArt(o.egg);
    const ek = art.smooth ? Math.max(1, Math.round(r * 2)) : k;
    g.imageSmoothingEnabled = false;
    g.drawImage(e, Math.min(W - e.width * ek, x + iw - e.width * ek * 0.6), Math.min(H - e.height * ek, y + ih - e.height * ek * 0.7), e.width * ek, e.height * ek);
  }
}

// ---------------------------------------------------------------- the laptop body
// texel T device px; chamfered corners (3 steps), ink outline, bevel, speckle, screws
export function paintBezel(cv, w, h, o = {}) {
  if (!(w > 20 && h > 20)) return;
  const { g, W, H, r } = fit(cv, w, h);
  const T = Math.max(2, Math.round((o.texel || 3) * r));
  const C = o.chamfer ?? 3; // steps
  const col = { ink: INK, body: '#ddd3bd', hi: '#f4ecda', hi2: '#e9e0cb', lo: '#bdb198', lo2: '#cbc0a8', speck: '#d2c7af', speck2: '#e6dcc6' };
  // body silhouette, row by row in texels (right/bottom anchored to W/H)
  const cols = Math.ceil(W / T), rows = Math.ceil(H / T);
  const inset = (j) => (j < C ? C - j : j > rows - 1 - C ? C - (rows - 1 - j) : 0);
  for (let j = 0; j < rows; j++) {
    const i0 = inset(j);
    const y = j === rows - 1 ? H - T : j * T;
    const x0 = i0 * T, x1 = W - i0 * T;
    g.fillStyle = col.ink;
    g.fillRect(x0, y, x1 - x0, T);
    // inside
    const ii = inset(j);
    if (j === 0 || j === rows - 1) continue;
    const a = (ii + 1) * T, b = W - (ii + 1) * T;
    const top = j === 1 || (j <= C && inset(j - 1) > ii);
    g.fillStyle = col.body;
    g.fillRect(a, y, b - a, T);
    // bevel: top rows light, bottom rows dark, left light, right dark
    if (j <= 2) { g.fillStyle = j === 1 ? col.hi : col.hi2; g.fillRect(a, y, b - a, T); }
    if (j >= rows - 3) { g.fillStyle = j === rows - 2 ? col.lo : col.lo2; g.fillRect(a, y, b - a, T); }
    g.fillStyle = col.hi2; g.fillRect(a, y, T, T);
    g.fillStyle = col.lo2; g.fillRect(b - T, y, T, T);
    if (top) { g.fillStyle = col.hi; g.fillRect(a, y, b - a, T); }
  }
  // chamfer step highlights (top-left light, bottom-right dark)
  // speckle
  const rand = rnd(9001);
  const n = Math.round((cols * rows) / 9);
  for (let i = 0; i < n; i++) {
    const x = (3 + Math.floor(rand() * (cols - 6))) * T, y = (3 + Math.floor(rand() * (rows - 6))) * T;
    g.fillStyle = rand() < 0.5 ? col.speck : col.speck2;
    g.fillRect(x, y, T, T);
  }
  // screws near the corners
  const screw = (sx, sy) => {
    g.fillStyle = '#9a8e76'; g.fillRect(sx - T, sy - T, T * 3, T * 3);
    g.fillStyle = '#c8bca2'; g.fillRect(sx - T, sy - T, T * 2, T);
    g.fillStyle = '#6a604c'; g.fillRect(sx - T, sy, T * 3, Math.max(1, Math.round(T / 3)));
  };
  const m = (C + 3) * T;
  screw(m, m); screw(W - m, m);
  if (o.screwsBottom !== false) { screw(m, H - m); screw(W - m, H - m); }
  // vents on the chin
  if (o.vents) {
    g.fillStyle = '#a89c82';
    for (let i = 0; i < 6; i++) g.fillRect(m + T * 3 + i * T * 2, H - T * 5, T, T * 2);
    for (let i = 0; i < 6; i++) g.fillRect(W - m - T * 4 - i * T * 2, H - T * 5, T, T * 2);
  }
}

// ---------------------------------------------------------------- tiled CSS textures
let TILES = null, tilesR = 0;
function tileCanvas(tw, th, K, paint) {
  const c = document.createElement('canvas');
  c.width = tw * K; c.height = th * K;
  const g = c.getContext('2d');
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x * K, y * K, w * K, h * K); };
  paint(px, rnd(tw * 131 + th));
  return c;
}
export function tiles() {
  const r = dpr();
  if (TILES && tilesR === r) return TILES;
  tilesR = r;
  const K = Math.max(1, Math.round(2 * r));
  const mk = (tw, th, paint) => {
    const c = tileCanvas(tw, th, K, paint);
    return { url: `url(${c.toDataURL()})`, size: `${(tw * K) / r}px ${(th * K) / r}px` };
  };
  // horizontal planks with grain
  const wood = (base, dark, light, seam) => mk(96, 24, (px, R) => {
    px(0, 0, base, 96, 24);
    for (let p = 0; p < 2; p++) {
      const y0 = p * 12;
      px(0, y0, light, 96, 1);
      px(0, y0 + 11, seam, 96, 1);
      for (let i = 0; i < 9; i++) {
        const y = y0 + 2 + Math.floor(R() * 8), x = Math.floor(R() * 96), len = 6 + Math.floor(R() * 22);
        for (let k = 0; k < len; k++) px((x + k) % 96, y, dark);
      }
      const kx = Math.floor(R() * 80) + 8, ky = y0 + 4 + Math.floor(R() * 3);
      px(kx, ky, seam, 3, 2); px(kx - 1, ky + 1, dark, 1, 1); px(kx + 3, ky, dark, 1, 1);
      const j = (p ? 30 : 70) + Math.floor(R() * 10);
      px(j, y0 + 1, seam, 1, 10);
    }
  });
  TILES = {
    wood: wood('#8a5a34', '#764a2a', '#a06c40', '#5a361e'),
    woodDark: wood('#5e3c24', '#4e301c', '#704a2e', '#3a2414'),
    rail: wood('#c49460', '#b38250', '#d6a874', '#946a40'),
    paper: mk(32, 32, (px, R) => {
      px(0, 0, '#fff8e6', 32, 32);
      for (let i = 0; i < 18; i++) px(Math.floor(R() * 32), Math.floor(R() * 32), R() < 0.5 ? '#f8eed6' : '#fbf3e0');
    }),
  };
  return TILES;
}
