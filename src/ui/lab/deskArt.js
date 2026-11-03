// [v31 lab] Pixel art for the lab computer's green-phosphor "desktop" (src/ui/LabTree.js).
//
// Everything here is painted pixel by pixel at art resolution (hand-placed spans,
// outlines, bevels, dither) and handed out pre-scaled to whole device px, so the
// browser shows it 1:1 (crisp on iPad / fractional zoom too):
//   - folder icons: 4-frame strips (closed, flap opening, open, wide open), tinted per
//     research branch, a paper label sticker on the front for the branch icon, papers
//     and an index tab peeking out; a grey-olive locked variant;
//   - the "All" computer (a beige CRT whose screen wakes up on hover), the "Ready"
//     in-tray (papers lift out on hover), a padlock, a pixel drop shadow;
//   - the desktop wallpaper emblem and dither / dot tiles;
//   - 9-slice frames (bevelled panels, sunken wells, keycaps with a side, brass plates)
//     as ready-made CSS `border-image` values.
//
//   devU()                  device px per art px for 2 css px per art px
//   urlOf(canvas, u)        nearest-neighbour upscale -> data URL
//   earthy(hex)             a branch colour pulled into the lab's earthy, non-neon range
//   folderStrip(tint, o)    { cv, ico: [{x, y}] per frame (label centre, art px) }
//   driveStrip(), inboxStrip(full), padlock(open), shadow(), emblem(), tile(kind)
//   frames(u)               { name: 'url(...) slices fill / widths stretch' }

export const FW = 40; // icon frame size (art px); shown at 2 css px per art px
export const FH = 40;
export const FRAMES = 4;

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

export function devU(css = 2) {
  const r = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  return Math.max(1, Math.round(css * r));
}

export function upscale(src, u) {
  const c = mk(src.width * u, src.height * u);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
export const urlOf = (src, u) => upscale(src, u).toDataURL();

// ---------------------------------------------------------------- colour
function rgb(h) {
  let s = String(h || '').replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hsl(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function hex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const f = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
// hue moved `k` of the way toward `to` (shortest way round)
const toward = (h, to, k) => h + ((((to - h) % 360) + 540) % 360 - 180) * k;

/** a branch colour pulled into the lab palette: no neon, no pink/magenta (-> clay), blues -> muted slate */
export function earthy(c) {
  let [h, s, l] = hsl(c);
  if (h >= 280 && h < 352) { h = 6 + ((h - 280) / 72) * 18; s = Math.min(s, 0.46); } // pink / magenta -> clay, terracotta
  else if (h >= 175 && h < 280) s = Math.min(s, 0.3); // cyan / blue -> slate
  s = Math.min(s, 0.5);
  l = Math.max(0.4, Math.min(0.58, l));
  return hex(h, s, l);
}

/** 6 hand-tuned shades from one tint: highlights lean warm (toward yellow), shadows lean into the lab green */
export function ramp(c) {
  const [h, s, l] = hsl(c);
  return {
    hi: hex(toward(h, 52, 0.35), s * 0.75, Math.min(0.9, l + 0.25)),
    lit: hex(toward(h, 52, 0.18), s * 0.88, Math.min(0.82, l + 0.12)),
    base: hex(h, s, l),
    sh: hex(toward(h, 140, 0.25), s * 0.9, l - 0.13),
    dp: hex(toward(h, 145, 0.4), s * 0.85, l - 0.25),
    k: '#061309',
  };
}

// ---------------------------------------------------------------- a tiny pixel painter
class Art {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.p = new Array(w * h).fill(null);
  }
  set(x, y, c) { if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.p[y * this.w + x] : null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // a filled shape from one span per row; outline pixels get `ink`, the inside gets shade(x, y, d)
  // where d = { t, b, l, r }: 1 = the row/column right inside the outline, 2 = the next, 9 = deeper
  shape(y0, y1, spans, shade, ink) {
    const rows = new Map();
    for (let y = y0; y <= y1; y++) { const s = spans(y); if (s && s[1] >= s[0]) rows.set(y, s); }
    const inn = (x, y) => { const s = rows.get(y); return !!s && x >= s[0] && x <= s[1]; };
    for (const [y, [a, b]] of rows) {
      for (let x = a; x <= b; x++) {
        if (!inn(x - 1, y) || !inn(x + 1, y) || !inn(x, y - 1) || !inn(x, y + 1)) { if (ink) this.set(x, y, ink); continue; }
        const d = {
          t: !inn(x, y - 2) ? 1 : !inn(x, y - 3) ? 2 : 9,
          b: !inn(x, y + 2) ? 1 : !inn(x, y + 3) ? 2 : 9,
          l: !inn(x - 2, y) ? 1 : !inn(x - 3, y) ? 2 : 9,
          r: !inn(x + 2, y) ? 1 : !inn(x + 3, y) ? 2 : 9,
        };
        this.set(x, y, shade(x, y, d));
      }
    }
  }
  draw(ctx, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.p[y * this.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  canvas() { const c = mk(this.w, this.h); this.draw(c.getContext('2d')); return c; }
}

function rngOf(seed) {
  let s = seed >>> 0 || 7;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PAPER = { k: '#4e4a32', hi: '#fffbe6', base: '#efe7c6', sh: '#cfc49c', line: '#a9bd9c' };
const PAPER2 = { k: '#4e4a32', hi: '#ffffff', base: '#f8f3dc', sh: '#d8cfaa', line: '#9fb894' };
const LABEL = { k: '#3c3620', hi: '#fbf3d2', base: '#e6dbb0', sh: '#c2b585', tape: '#f4f0dc', tapeD: '#cfc8a6' };
const LABEL_LOCK = { k: '#2a2c22', hi: '#b8b8a0', base: '#9a9a84', sh: '#7a7c66', tape: '#c4c2ae', tapeD: '#a2a08c' };
const AMBER = { k: '#3a2206', hi: '#ffe7a6', base: '#f0b040', sh: '#b8761a' };

// ---------------------------------------------------------------- folders
const FT = [15, 17, 19, 22]; // front flap top row per frame
const SK = [0, 1, 1, 2]; // how far the flap's top edge leans out (art px)
const LIFT = [0, 0, 1, 2]; // papers rise as the flap opens
const FB = 38; // flap bottom row

/** where the label sticker's centre sits in frame f (art px, for the DOM icon) */
export function folderLabel(f) {
  const ft = FT[f], sk = SK[f];
  const off = Math.round((sk * (FB - (ft + 10))) / (FB - ft));
  return { x: 20 + off, y: ft + 10.5 };
}

function paintFolder(a, R, f, seed, locked) {
  const ft = FT[f], sk = SK[f], lift = LIFT[f], K = R.k;
  const rnd = rngOf(seed);
  // back panel + tab (we see its inside: a shade darker, lit rim)
  const tab = { 2: [5, 14], 3: [4, 15], 4: [3, 16], 5: [2, 17] };
  a.shape(2, 37, (y) => (tab[y] || (y === 6 ? [2, 36] : y === 37 ? [3, 36] : [2, 37])), (x, y, d) => {
    if (y <= 5) return d.t === 1 ? R.lit : R.base;
    if (d.t === 1) return R.base;
    if (d.l === 1) return R.base;
    if (y >= ft - 2 && (x + y) % 2) return R.dp; // the shadow the flap throws on the back
    return R.sh;
  }, K);
  // papers: a back sheet, an amber index tab, a front sheet set slightly crooked
  const P = locked ? LABEL_LOCK : PAPER, P2 = locked ? LABEL_LOCK : PAPER2, A = locked ? LABEL_LOCK : AMBER;
  const py = 9 - lift;
  const ruled = (Q, top) => (x, y, d) => (d.t === 1 ? Q.hi : d.r === 1 ? Q.sh : (y - top) % 3 === 0 && d.l > 1 && d.r > 2 ? Q.line || Q.sh : Q.base);
  a.shape(py, ft + 1, () => [5, 29], ruled(P, py), P.k);
  a.shape(py - 2, py + 2, () => [24, 28], (x, y, d) => (d.t === 1 ? A.hi : A.base), A.k);
  a.shape(py + 1, ft + 1, (y) => (y === py + 1 ? [9, 21] : [9, 33]), ruled(P2, py + 1), P2.k);
  // front flap: leans toward you as it opens (its top edge drops and slides right)
  const off = (y) => Math.round((sk * (FB - y)) / (FB - ft));
  a.shape(ft, FB, (y) => { const o = off(y); return y === ft ? [2 + o, 36 + o] : y === FB ? [2, 36] : [1 + o, 37 + o]; }, (x, y, d) => {
    if (d.t === 1) return R.hi;
    if (d.t === 2) return R.lit;
    if (d.b === 1) return R.dp;
    if (d.r === 1) return R.sh;
    if (d.l === 1) return R.lit;
    if (d.b === 2) return R.sh;
    if (y >= FB - 6 && (x + y) % 2 === 0) return R.sh; // dithered fade toward the bottom
    return R.base;
  }, K);
  // a few scuffs and a crease, placed by hand (seeded per branch so every folder is a little different)
  for (let i = 0; i < 4; i++) {
    const y = ft + 3 + Math.floor(rnd() * 3), x = 4 + Math.floor(rnd() * 6) + off(y);
    if (a.get(x, y) === R.base) a.set(x, y, R.lit);
  }
  for (let x = 30; x < 35; x++) { const y = FB - 3 - Math.floor((x - 30) / 2); if (a.get(x + off(y), y) && a.get(x + off(y), y) !== K) a.set(x + off(y), y, R.sh); }
  // the label sticker (+ two bits of tape)
  const L = locked ? LABEL_LOCK : LABEL;
  const ly0 = ft + 3, ly1 = ft + 17;
  a.shape(ly0, ly1, (y) => { const o = off(y); return [11 + o, 28 + o]; }, (x, y, d) => (d.t === 1 ? L.hi : d.b === 1 || d.r === 1 ? L.sh : L.base), L.k);
  const o0 = off(ly0);
  for (const [x, y] of [[10, ly0 - 1], [11, ly0 - 1], [11, ly0], [12, ly0]]) a.set(x + o0, y, L.tape);
  a.set(12 + o0, ly0 + 1, L.tapeD);
  for (const [x, y] of [[28, ly0 - 1], [29, ly0 - 1], [27, ly0], [28, ly0]]) a.set(x + o0, y, L.tape);
  a.set(27 + o0, ly0 + 1, L.tapeD);
}

const _folderCache = new Map();
/** a 4-frame strip (FW*4 x FH) of a folder in `tint` */
export function folderStrip(tint, { locked = false, seed = 'x' } = {}) {
  const key = `${tint}|${locked ? 1 : 0}|${seed}`;
  let c = _folderCache.get(key);
  if (c) return c;
  const R = ramp(locked ? '#5f6654' : tint);
  if (locked) R.base = '#5f6654';
  c = mk(FW * FRAMES, FH);
  const ctx = c.getContext('2d');
  for (let f = 0; f < FRAMES; f++) {
    const a = new Art(FW, FH);
    paintFolder(a, R, f, hashStr(String(seed)), locked);
    a.draw(ctx, f * FW, 0);
  }
  _folderCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- the "All" computer
const BEIGE = { k: '#1c180a', hi: '#fbf3d0', lit: '#e8dfb6', base: '#cdc195', sh: '#a0946a', dp: '#716848' };
const SCR = { bg: '#04160a', ln: '#0b2a15', d: '#2f9a52', g: '#5fe08a', b: '#c8ffd2' };

function paintDrive(a, f) {
  const B = BEIGE, K = B.k;
  // monitor case
  a.shape(3, 27, (y) => (y === 3 ? [6, 33] : y === 27 ? [5, 34] : [4, 35]), (x, y, d) => {
    if (d.t === 1) return B.hi;
    if (d.l === 1) return B.lit;
    if (d.r === 1 || d.b === 1) return B.sh;
    if (d.b === 2) return B.sh;
    return B.base;
  }, K);
  // screen: a sunken bezel ring, then the phosphor glass
  a.shape(6, 22, (y) => (y === 6 || y === 22 ? [9, 30] : [8, 31]), (x, y, d) => (d.t === 1 || d.l === 1 ? B.dp : B.sh), B.dp);
  a.shape(8, 20, (y) => (y === 8 || y === 20 ? [11, 28] : [10, 29]), () => SCR.bg, K);
  for (let y = 10; y <= 19; y += 2) for (let x = 11; x <= 28; x++) a.set(x, y, SCR.ln);
  if (f === 3) {
    a.shape(9, 19, () => [11, 28], () => SCR.g, null);
    for (let y = 10; y <= 19; y += 2) for (let x = 11; x <= 28; x++) a.set(x, y, SCR.b);
  } else {
    // text lines, a prompt, and (awake) a tiny research tree
    const lines = f === 0 ? [[12, 6], [12, 10], [12, 4]] : f === 1 ? [[12, 7], [12, 11], [12, 5], [12, 8]] : [[12, 5]];
    lines.forEach(([x, w], i) => { for (let k = 0; k < w; k++) a.set(x + k, 10 + i * 2, i === lines.length - 1 ? SCR.g : SCR.d); });
    const cy = 10 + lines.length * 2;
    if (cy <= 19) { a.set(12, cy, SCR.b); a.set(13, cy, SCR.b); }
    if (f >= 1) {
      const box = (x, y, c) => { a.rect(x, y, 3, 2, c); };
      if (f === 2) {
        box(15, 13, SCR.b); box(21, 11, SCR.g); box(21, 15, SCR.g); box(26, 13, SCR.d);
        for (let x = 18; x <= 20; x++) { a.set(x, 14, SCR.d); }
        a.set(19, 12, SCR.d); a.set(19, 13, SCR.d); a.set(19, 15, SCR.d); a.set(20, 12, SCR.d); a.set(20, 16, SCR.d); a.set(19, 16, SCR.d);
        for (let x = 24; x <= 25; x++) a.set(x, 14, SCR.d);
        a.set(24, 12, SCR.d); a.set(24, 13, SCR.d); a.set(24, 15, SCR.d); a.set(24, 16, SCR.d);
      }
    }
  }
  // glass glint (top-left)
  a.set(11, 9, '#9fe8b4'); a.set(12, 9, '#6fcf8e'); a.set(11, 10, '#6fcf8e');
  // chin: badge, vents, floppy slot, power LED
  a.rect(9, 24, 5, 1, B.sh); a.rect(9, 25, 5, 1, B.dp);
  a.rect(18, 24, 9, 1, K); a.rect(18, 25, 9, 1, B.lit);
  a.set(31, 24, f === 3 || f % 2 ? '#7cf29e' : '#2f9a52'); a.set(32, 24, B.sh);
  // neck
  a.shape(27, 29, () => [15, 24], (x, y, d) => (d.l === 1 ? B.base : B.sh), K);
  // keyboard
  const kb = { 30: [7, 32], 31: [5, 34], 36: [4, 35] };
  a.shape(30, 36, (y) => kb[y] || [3, 36], (x, y, d) => (d.t === 1 ? B.hi : d.b === 1 ? B.dp : d.b === 2 ? B.sh : B.base), K);
  for (const y of [32, 34]) for (let x = 6 + (y === 34 ? 1 : 0); x <= 33; x += 2) a.set(x, y, B.sh);
  a.rect(14, 35, 12, 1, B.sh); // space bar
}

let _drive = null;
export function driveStrip() {
  if (_drive) return _drive;
  const c = mk(FW * FRAMES, FH), ctx = c.getContext('2d');
  for (let f = 0; f < FRAMES; f++) { const a = new Art(FW, FH); paintDrive(a, f); a.draw(ctx, f * FW, 0); }
  return (_drive = c);
}

// ---------------------------------------------------------------- the "Ready" in-tray
const WOOD = { k: '#1e1006', hi: '#e8b478', lit: '#c88a4c', base: '#a86a34', sh: '#7a4a22', dp: '#4e2c12' };
const BRASS = { k: '#2a1a04', hi: '#fff0b0', base: '#d8a43a', sh: '#8a5e14' };
const GLYPH_IN = ['###.#..#', '.#..##.#', '.#..#.##', '.#..#..#', '###.#..#']; // "IN" on the brass plate

function paintInbox(a, f, full) {
  const W = WOOD, K = W.k;
  // the back lip + inside floor of the tray
  a.shape(17, 30, (y) => (y === 17 ? [5, 34] : [4, 35]), (x, y, d) => (d.t === 1 ? W.lit : y < 22 ? W.sh : W.dp), K);
  // papers (behind the front face): the top sheet lifts out as you hover
  if (full) {
    const lift = [0, 1, 3, 6][f];
    const sheet = (x0, x1, top, Q, tilt) => a.shape(top, 27, (y) => (y === top && tilt ? [x0, x0 + 10] : [x0, x1]), (x, y, d) => (d.t === 1 ? Q.hi : d.r === 1 ? Q.sh : (y - top) % 3 === 2 && d.l > 1 && d.r > 2 ? Q.line : Q.base), Q.k);
    sheet(8, 30, 13, PAPER, false);
    sheet(10, 31, 11, PAPER2, true);
    sheet(7, 29, 10 - lift, PAPER2, f === 3);
    // a stamp on the top sheet
    const sy = 13 - lift;
    a.rect(23, sy, 4, 3, '#3fb866'); a.set(23, sy, '#2f9a52'); a.set(26, sy + 2, '#2f9a52'); a.set(24, sy + 1, '#c8ffd2');
  } else {
    a.set(14, 26, PAPER.sh); a.set(15, 26, PAPER.base); a.set(25, 27, W.lit);
  }
  // the front face: planks with grain, chamfered corners
  a.shape(23, 37, (y) => (y === 23 ? [3, 36] : y === 37 ? [4, 35] : [2, 37]), (x, y, d) => {
    if (d.t === 1) return W.hi;
    if (d.t === 2) return W.lit;
    if (d.b === 1) return W.dp;
    if (d.l === 1) return W.lit;
    if (d.r === 1) return W.sh;
    if (y === 30) return W.sh; // plank seam
    if ((y === 27 && x % 7 === 2) || (y === 33 && (x + 3) % 9 < 3) || (y === 26 && (x + 5) % 11 < 2)) return W.sh; // grain
    return W.base;
  }, K);
  // brass label plate "IN" with rivets
  a.shape(26, 34, () => [13, 26], (x, y, d) => (d.t === 1 ? BRASS.hi : d.b === 1 || d.r === 1 ? BRASS.sh : BRASS.base), BRASS.k);
  GLYPH_IN.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') a.set(16 + x, 28 + y, BRASS.k); });
  a.set(14, 27, BRASS.sh); a.set(25, 27, BRASS.sh); a.set(14, 33, BRASS.sh); a.set(25, 33, BRASS.sh);
}

const _inbox = new Map();
export function inboxStrip(full) {
  const k = full ? 1 : 0;
  if (_inbox.has(k)) return _inbox.get(k);
  const c = mk(FW * FRAMES, FH), ctx = c.getContext('2d');
  for (let f = 0; f < FRAMES; f++) { const a = new Art(FW, FH); paintInbox(a, f, full); a.draw(ctx, f * FW, 0); }
  _inbox.set(k, c);
  return c;
}

// ---------------------------------------------------------------- padlock, shadow
const LOCK_ROWS = [
  '..kkkkk..',
  '.kssssbk.',
  '.ks...sk.',
  '.ks...sk.',
  'kkkkkkkkk',
  'khhhhhhak',
  'khaaaaadk',
  'kaaakaadk',
  'kaakkkadk',
  'kaaakaadk',
  'kdddddddk',
  '.kkkkkkk.',
];
const LOCK_OPEN = [
  '..kkkkk..',
  '.kssssbk.',
  '.ks...sk.',
  '.ks...sk.',
  '.ks......',
  '.ks......',
  'kkkkkkkkk',
  'khhhhhhak',
  'khaaaaadk',
  'kaaakaadk',
  'kaakkkadk',
  'kdddddddk',
  '.kkkkkkk.',
];
const LOCK_PAL = { k: '#120c02', s: '#a8b0a0', b: '#e8f0e0', h: '#fff0a8', a: '#e0a838', d: '#8a5a14' };
export function padlock(open = false) {
  const rows = open ? LOCK_OPEN : LOCK_ROWS;
  const a = new Art(9, rows.length);
  rows.forEach((r, y) => { for (let x = 0; x < 9; x++) if (r[x] !== '.') a.set(x, y, LOCK_PAL[r[x]]); });
  return a.canvas();
}

export function shadow() {
  const a = new Art(36, 5);
  const rows = [[6, 29], [3, 32], [2, 33], [3, 32], [7, 28]];
  rows.forEach(([x0, x1], y) => { for (let x = x0; x <= x1; x++) a.set(x, y, y === 0 || y === 4 || x < x0 + 2 || x > x1 - 2 ? 'rgba(1,8,4,0.32)' : 'rgba(1,8,4,0.55)'); });
  return a.canvas();
}

// ---------------------------------------------------------------- wallpaper + tiles
const FOX = [
  'o.........o',
  'oo.......oo',
  'oOo.....oOo',
  'oOOoooooOOo',
  'ooooooooooo',
  'oo.kook.ooo',
  'ooooooooooo',
  '.oowwwwwoo.',
  '..owwkwwo..',
  '...owwwo...',
  '....ooo....',
];
/** a big dithered fox-head emblem for the desktop wallpaper (two dark greens) */
export function emblem() {
  const S = 6;
  const a = new Art(FOX[0].length * S, FOX.length * S);
  FOX.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const X = x * S + i, Y = y * S + j;
          const solid = ch === 'O' || ch === 'k';
          if (ch === 'k') a.set(X, Y, '#06180c');
          else if (solid || (X + Y) % 2 === 0) a.set(X, Y, ch === 'w' ? '#14402a' : '#103620');
        }
      }
    }
  });
  return a.canvas();
}

/** small repeating tiles: 'dots' (wallpaper), 'grid' (tree view), 'hatch' (locked sections), 'ditherD' */
export function tile(kind) {
  if (kind === 'dots') { const a = new Art(8, 8); a.set(0, 0, '#0f2c19'); a.set(4, 4, '#0d2816'); return a.canvas(); }
  if (kind === 'grid') { const a = new Art(16, 16); a.set(0, 0, '#163f24'); a.set(8, 0, '#0f2c19'); a.set(0, 8, '#0f2c19'); return a.canvas(); }
  if (kind === 'hatch') {
    const a = new Art(8, 8);
    for (let i = 0; i < 8; i++) { a.set(i, (8 - i) % 8, '#1b2a14'); a.set(i, (9 - i) % 8, '#141f0f'); }
    return a.canvas();
  }
  const a = new Art(2, 2); a.set(0, 0, 'rgba(0,0,0,0.35)'); a.set(1, 1, 'rgba(0,0,0,0.35)'); return a.canvas();
}

// ---------------------------------------------------------------- 9-slice frames
// spec: c = corner (art px), r = pixel rounding, rings = colours from the outline inward
// (a [lit, dark, corner?] pair is a bevel: lit on the top/left, dark on the bottom/right),
// fill = the middle, depth = rows of keycap side under the face (dcol), rivets = brass dots.
const SPECS = {
  panel: { c: 3, r: 1, rings: ['#010804', ['#2c7046', '#03120a', '#174a2a']], fill: '#0c2716' },
  card: { c: 3, r: 1, rings: ['#010804', ['#1f5a34', '#03120a', '#123a20']], fill: '#081d10' },
  inset: { c: 3, r: 1, rings: ['#010804', ['#020a05', '#246040', '#0d2a18']], fill: '#04120a' },
  key: { c: 3, r: 1, rings: ['#141408', ['#f2ecc4', '#7d7646', '#bdb47c']], fill: '#bdb47c', depth: 2, dcol: '#5a5430' },
  keyG: { c: 3, r: 1, rings: ['#03140a', ['#c4ffd0', '#1f7d3d', '#3fb866']], fill: '#3fb866', depth: 3, dcol: '#125a2a' },
  keyA: { c: 3, r: 1, rings: ['#1c0e02', ['#ffe6a8', '#a0601a', '#e8a030']], fill: '#e8a030', depth: 3, dcol: '#6a3a0c' },
  keyB: { c: 3, r: 1, rings: ['#1c1204', ['#ffeeb0', '#86601a', '#cc9a36']], fill: '#cc9a36', depth: 3, dcol: '#5a3c0c' },
  keyD: { c: 3, r: 1, rings: ['#010804', ['#30583a', '#0a1a10', '#1c3a26']], fill: '#1c3a26', depth: 3, dcol: '#06140a' },
  keyS: { c: 3, r: 1, rings: ['#010804', ['#3f7a52', '#0a2214', '#1f4a2c']], fill: '#1f4a2c', depth: 2, dcol: '#071a0d' },
  plate: { c: 4, r: 1, rings: ['#1a1004', ['#ffe8a0', '#7a5216', '#c8952e'], '#c08a2a'], fill: '#c08a2a', rivets: ['#5a3a0c', '#ffe8a0'] },
  bezel: { c: 6, r: 2, rings: ['#0e1006', ['#a8aa6c', '#2a2c14', '#6a6c3c'], '#5a5c30', '#5a5c30', ['#e8c060', '#6a4a14', '#a87a2a'], '#0a0c04'], fill: '#5a5c30', screws: true },
  paper: { c: 3, r: 1, rings: ['#3c3620', ['#fffbe6', '#c2b585', '#e6dbb0']], fill: '#ece2bc', perf: true },
};

function frameCanvas(s) {
  const c = s.c, dep = s.depth || 0, r = s.r ?? 1;
  const W = 2 * c + 2, Hf = 2 * c + 2, H = Hf + dep;
  const a = new Art(W, H);
  const ink = s.rings[0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ex = Math.min(x, W - 1 - x);
      const eyR = Math.min(y, H - 1 - y); // rounding: against the very bottom (keycap side included)
      if (ex + eyR < r) continue;
      if (ex + eyR === r && r > 0) { a.set(x, y, ink); continue; }
      if (y >= Hf) { a.set(x, y, ex === 0 || y === H - 1 ? ink : s.dcol); continue; }
      const ey = Math.min(y, Hf - 1 - y);
      const d = Math.min(ex, ey);
      const ring = d < s.rings.length ? s.rings[d] : s.fill;
      let col = ring;
      if (Array.isArray(ring)) {
        const top = ey === d && y < Hf / 2, left = ex === d && x < W / 2;
        const bot = ey === d && y >= Hf / 2, right = ex === d && x >= W / 2;
        col = (top || left) && !(bot || right) ? ring[0] : (bot || right) && !(top || left) ? ring[1] : ring[2] || ring[0];
      }
      if (s.perf && (y === 0 || y === Hf - 1) && x > c && x < W - 1 - c && x % 2 === 0) continue; // perforated paper edge
      a.set(x, y, col);
    }
  }
  if (s.rivets) for (const [x, y] of [[2, 2], [W - 3, 2], [2, Hf - 3], [W - 3, Hf - 3]]) { a.set(x, y, s.rivets[0]); a.set(x - 1, y - 1, s.rivets[1]); }
  if (s.screws) {
    for (const [x, y] of [[3, 3], [W - 4, 3], [3, Hf - 4], [W - 4, Hf - 4]]) {
      a.set(x - 1, y, '#2a2c14'); a.set(x + 1, y, '#2a2c14'); a.set(x, y - 1, '#c8c890'); a.set(x, y + 1, '#2a2c14'); a.set(x, y, '#8a8c58');
      a.set(x - 1, y - 1, '#a8aa6c'); a.set(x + 1, y + 1, '#1a1c0c');
    }
  }
  return { cv: a.canvas(), c, dep, W, H };
}

let _frames = null;
/** CSS border-image values ('url(...) t r b l fill / widths stretch'), 2 css px per art px */
export function frames(u = devU()) {
  if (_frames && _frames.u === u) return _frames.map;
  const map = {};
  for (const [k, s] of Object.entries(SPECS)) {
    const f = frameCanvas(s);
    const url = urlOf(f.cv, u);
    const C = f.c * u, B = (f.c + f.dep) * u, cw = f.c * 2, bw = (f.c + f.dep) * 2;
    map[k] = `url(${url}) ${C} ${C} ${B} ${C} fill / ${cw}px ${cw}px ${bw}px ${cw}px ${s.perf ? 'round' : 'stretch'}`;
  }
  _frames = { u, map };
  return map;
}
