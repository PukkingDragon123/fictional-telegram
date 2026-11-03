// [v31 lab] Pixel art for the lab computer (src/ui/LabTree.js): a green "hacker terminal"
// with a colourful desktop.
//
// Everything is painted pixel by pixel at art resolution and handed out pre-scaled to
// whole device px (shown 1:1, crisp on iPad and at fractional zoom). No blur anywhere:
// a "glow" is a dithered halo of pixels, a gradient is a dither.
//   - desktop folders in COLOUR: a vivid hand-tuned ramp per branch (vividRamp / rainbowHues:
//     a full rainbow, highlights leaning yellow, shadows leaning blue-violet), papers, a
//     contrasting index tab, a dark label screen for the full-colour branch icon; 4 frames:
//     closed, flap opening, open, wide open; a muted slate variant when locked;
//   - the "All" computer (a beige CRT whose green screen wakes up on hover), the "Ready"
//     wooden in-tray, a padlock (slate / dim green / amber when the key is ready), a shadow;
//   - node chips (green): an IC package per research state (pins, notch, LED, icon well);
//   - tiles (dots, grid, hatch, dithered scanlines, a veil) and a dithered fox emblem;
//   - 9-slice frames as CSS border-images: box-drawing panels (single + double line,
//     bright corner joints), sunken wells, keys with a side.
//
//   devU()                  device px per art px for 2 css px per art px
//   urlOf(canvas, u)        nearest-neighbour upscale -> data URL
//   earthy(hex), vividRamp(hue), rainbowHues(colors), MUTED
//   folderStrip(hue, o)     a FW*4 x FH strip; folderLabel(f) = label centre (art px)
//   driveStrip(), inboxStrip(full), padlock(open, tone), shadow(), emblem(), tile(kind)
//   chipCanvas(pal), CHIP    32x32 node chips
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

/** a branch colour pulled into the lab palette: no neon, no pink/magenta (-> clay), blues -> muted slate */
export function earthy(c) {
  let [h, s, l] = hsl(c);
  if (h >= 280 && h < 352) { h = 6 + ((h - 280) / 72) * 18; s = Math.min(s, 0.46); }
  else if (h >= 175 && h < 280) s = Math.min(s, 0.3);
  s = Math.min(s, 0.5);
  l = Math.max(0.4, Math.min(0.58, l));
  return hex(h, s, l);
}

// hue moved `k` of the way toward `to` (shortest way round)
const toward = (h, to, k) => h + ((((to - h) % 360) + 540) % 360 - 180) * k;

/** [v31 lab] a vivid hand-tuned pixel ramp for hue h: highlights lean to yellow, shadows to blue-violet */
export function vividRamp(h) {
  h = ((h % 360) + 360) % 360;
  const L = h > 38 && h < 78 ? 0.5 : h >= 78 && h < 175 ? 0.44 : h >= 175 && h < 265 ? 0.52 : 0.56;
  return {
    hi: hex(toward(h, 56, 0.3), 0.95, Math.min(0.88, L + 0.3)),
    lit: hex(toward(h, 56, 0.15), 0.9, L + 0.14),
    base: hex(h, 0.82, L),
    sh: hex(toward(h, 250, 0.2), 0.72, L - 0.15),
    dp: hex(toward(h, 258, 0.32), 0.62, L - 0.28),
    k: '#0c0718',
  };
}
export const MUTED = { hi: '#9a97b0', lit: '#76738e', base: '#5a5772', sh: '#413f58', dp: '#2b2a40', k: '#0c0718' };

/** distinct rainbow hues for a list of colours: keeps their order round the wheel, spaces them evenly */
export function rainbowHues(colors) {
  const n = Math.max(1, colors.length);
  const idx = colors.map((c, i) => ({ i, h: hsl(c)[0] })).sort((a, b) => a.h - b.h);
  const out = [];
  idx.forEach((e, k) => { out[e.i] = (350 + (k * 360) / n) % 360; });
  return out;
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
  hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  // a filled shape from one span per row; outline pixels get `ink`, the inside gets shade(x, y, d)
  // (d.t/b/l/r: 1 = the row/column right inside the outline, 2 = the next, 9 = deeper)
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
        const c = shade(x, y, d);
        if (c) this.set(x, y, c);
      }
    }
  }
  // the "glow": a dithered ring of `col` on the empty pixels touching any `src` colour
  halo(src, col) {
    const S = new Set(src);
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) || (x + y) % 2) continue;
        let near = false;
        for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if (S.has(this.get(x + i, y + j))) { near = true; break; }
        if (near) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, col);
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

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- folders (in colour)
const PAPER = { k: '#3a2f4a', hi: '#fffbe6', base: '#efe7d0', sh: '#cfc4b0', line: '#a8b8d8' };
const PAPER2 = { k: '#3a2f4a', hi: '#ffffff', base: '#f8f3e4', sh: '#d8cfbe', line: '#9fb0d8' };
const PAPER_LOCK = { k: '#1c1a2a', hi: '#a8a6b8', base: '#8a889c', sh: '#6e6c80', line: '#76748a' };
const FT = [15, 17, 19, 22]; // front flap top row per frame
const SK = [0, 1, 1, 2]; // how far the flap's top edge leans out (art px)
const LIFT = [0, 0, 1, 2]; // papers rise as the flap opens
const FB = 38; // flap bottom row

/** where the label screen's centre sits in frame f (art px, for the DOM icon) */
export function folderLabel(f) {
  const ft = FT[f], sk = SK[f];
  const off = Math.round((sk * (FB - (ft + 10))) / (FB - ft));
  return { x: 20 + off, y: ft + 10.5 };
}

function rngOf(seed) {
  let s = seed >>> 0 || 7;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function paintFolder(a, R, f, seed, locked, tabCol) {
  const ft = FT[f], sk = SK[f], lift = LIFT[f], K = R.k;
  const rnd = rngOf(seed);
  // back panel + tab (we see its inside: a shade darker, lit rim)
  const tab = { 2: [5, 14], 3: [4, 15], 4: [3, 16], 5: [2, 17] };
  a.shape(2, 37, (y) => (tab[y] || (y === 6 ? [2, 36] : y === 37 ? [3, 36] : [2, 37])), (x, y, d) => {
    if (y <= 5) return d.t === 1 ? R.hi : R.lit;
    if (d.t === 1 || d.l === 1) return R.base;
    if (y >= ft - 2 && (x + y) % 2) return R.dp; // the shadow the flap throws on the back
    return R.sh;
  }, K);
  // papers + a contrasting index tab
  const P = locked ? PAPER_LOCK : PAPER, P2 = locked ? PAPER_LOCK : PAPER2;
  const py = 9 - lift;
  const ruled = (Q, top) => (x, y, d) => (d.t === 1 ? Q.hi : d.r === 1 ? Q.sh : (y - top) % 3 === 0 && d.l > 1 && d.r > 2 ? Q.line : Q.base);
  a.shape(py, ft + 1, () => [5, 29], ruled(P, py), P.k);
  a.shape(py - 2, py + 2, () => [24, 28], (x, y, d) => (d.t === 1 ? tabCol.hi : tabCol.base), tabCol.k);
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
  // scuffs + a crease, seeded per branch
  for (let i = 0; i < 4; i++) {
    const y = ft + 3 + Math.floor(rnd() * 3), x = 4 + Math.floor(rnd() * 6) + off(y);
    if (a.get(x, y) === R.base) a.set(x, y, R.lit);
  }
  for (let x = 30; x < 35; x++) { const y = FB - 3 - Math.floor((x - 30) / 2); const X = x + off(y); if (a.get(X, y) && a.get(X, y) !== K) a.set(X, y, R.sh); }
  // the label is a little dark screen (the branch icon glows on it in full colour)
  const ly0 = ft + 3, ly1 = ft + 17;
  a.shape(ly0, ly1, (y) => { const o = off(y); return [11 + o, 28 + o]; }, (x, y, d) => (d.t === 1 || d.l === 1 ? '#05030c' : y % 2 ? '#140c26' : '#0e081c'), R.dp);
  const lo = off(ly0), lb = off(ly1);
  a.set(11 + lo, ly0, R.hi); a.set(28 + lo, ly0, R.hi); a.set(11 + lb, ly1, R.lit); a.set(28 + lb, ly1, R.lit);
}

const _folderCache = new Map();
/** a 4-frame strip (FW*4 x FH) of a folder; `hue` picks its vivid ramp (locked: muted slate) */
export function folderStrip(hue, { locked = false, seed = 'x' } = {}) {
  const key = `${hue}|${locked ? 1 : 0}|${seed}`;
  let c = _folderCache.get(key);
  if (c) return c;
  const R = locked ? MUTED : vividRamp(hue);
  const tabCol = locked ? { ...MUTED, base: MUTED.lit } : vividRamp(hue + 150);
  c = mk(FW * FRAMES, FH);
  const ctx = c.getContext('2d');
  for (let f = 0; f < FRAMES; f++) {
    const a = new Art(FW, FH);
    paintFolder(a, R, locked ? 0 : f, hashStr(String(seed)), locked, tabCol);
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
const LOCK_ROWS = ['..kkkkk..', '.ksssssk.', '.ks...sk.', '.ks...sk.', 'kkkkkkkkk', 'khhhhhhhk', 'kaaaaaaak', 'kaaakaaak', 'kaakkkaak', 'kaaakaaak', 'kdddddddk', '.kkkkkkk.'];
const LOCK_OPEN = ['..kkkkk..', '.ksssssk.', '.ks...sk.', '.ks...sk.', '.ks......', '.ks......', 'kkkkkkkkk', 'khhhhhhhk', 'kaaaaaaak', 'kaaakaaak', 'kaakkkaak', 'kdddddddk', '.kkkkkkk.'];
const LOCK_PALS = {
  dim: { k: '#010804', s: '#3f8a58', h: '#5aa874', a: '#2c6e44', d: '#14402a' },
  amber: { k: '#120a02', s: '#ffd27a', h: '#ffe6a8', a: '#e8a030', d: '#8a5010' },
  slate: { k: '#0c0718', s: '#b8b6c8', h: '#a8a6bc', a: '#7a7892', d: '#4a4862' },
};
export function padlock(open = false, tone = 'dim') {
  const rows = open ? LOCK_OPEN : LOCK_ROWS, P = LOCK_PALS[tone] || LOCK_PALS.dim;
  const a = new Art(9, rows.length);
  rows.forEach((r, y) => { for (let x = 0; x < 9; x++) if (r[x] !== '.') a.set(x, y, P[r[x]]); });
  return a.canvas();
}

export function shadow() {
  const a = new Art(36, 5);
  const rows = [[6, 29], [3, 32], [2, 33], [3, 32], [7, 28]];
  rows.forEach(([x0, x1], y) => { for (let x = x0; x <= x1; x++) if ((x + y) % 2 === 0 || (y > 0 && y < 4 && x > x0 + 2 && x < x1 - 2)) a.set(x, y, '#000000'); });
  return a.canvas();
}

// ---------------------------------------------------------------- node chips
// an IC package: pins on four sides, a notch, an icon well, a status LED (+ a dithered glow)
export const CHIP = {
  avail: { line: '#7cf29e', mid: '#3fb866', pin: '#3fb866', body: '#05190d', scan: '#082414', well: '#010804', led: '#7cf29e', hi: '#e2ffe8', glow: '#0f3a1e' },
  run: { line: '#e2ffe8', mid: '#7cf29e', pin: '#7cf29e', body: '#0a2a14', scan: '#0d3319', well: '#020c06', led: '#ffb83a', hi: '#ffffff', glow: '#1f5a34' },
  done: { line: '#3fb866', mid: '#1f7d3d', pin: '#1f7d3d', body: '#082414', scan: '#0a2a16', well: '#03100a', led: '#c8ffd2', hi: '#9ef5b0', glow: null },
  locked: { line: '#1f5a34', mid: '#14402a', pin: '#123d21', body: '#030c06', scan: '#051209', well: '#010603', led: '#5a1e10', hi: '#2c6e44', glow: null },
  zone: { line: '#c8861e', mid: '#7a4c10', pin: '#6a4210', body: '#0c0a03', scan: '#120e04', well: '#050402', led: '#ffb83a', hi: '#ffd27a', glow: null },
};
export function chipCanvas(p) {
  const a = new Art(32, 32);
  // pins (behind the body edge)
  for (const v of [7, 12, 18, 23]) {
    for (let k = 1; k <= 3; k++) { a.set(k, v, p.pin); a.set(k, v + 1, p.pin); a.set(31 - k, v, p.pin); a.set(31 - k, v + 1, p.pin); }
    for (let k = 1; k <= 3; k++) { a.set(v, k, p.pin); a.set(v + 1, k, p.pin); a.set(v, 31 - k, p.pin); a.set(v + 1, 31 - k, p.pin); }
  }
  // body
  a.shape(4, 27, () => [4, 27], (x, y, d) => (d.t === 1 || d.l === 1 ? p.mid : y % 2 ? p.scan : p.body), p.line);
  // notch + corner joints + LED
  a.hline(14, 17, 4, p.body); a.hline(15, 16, 5, p.line);
  a.set(4, 4, p.hi); a.set(27, 4, p.hi); a.set(4, 27, p.hi); a.set(27, 27, p.hi);
  a.rect(23, 6, 2, 2, p.led);
  a.set(6, 6, p.mid);
  // the icon well
  a.shape(8, 26, () => [6, 25], (x, y, d) => (d.t === 1 || d.l === 1 ? '#000000' : p.well), p.mid);
  if (p.glow) a.halo([p.line, p.hi, p.pin], p.glow);
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
/** a big dithered phosphor fox head for the desktop wallpaper (very dim) */
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
          if (ch === 'k') continue;
          if (ch === 'O' || ch === 'w' ? (X + Y) % 2 === 0 : (X % 2 === 0 && Y % 2 === 0)) a.set(X, Y, ch === 'w' ? '#0e3019' : '#0b2814');
        }
      }
    }
  });
  return a.canvas();
}

/** small repeating tiles: dots (desktop), grid (tree), hatch (locked), scan (dithered scanlines), veil (dims the code rain) */
export function tile(kind) {
  if (kind === 'dots') { const a = new Art(8, 8); a.set(0, 0, '#0a2413'); return a.canvas(); }
  if (kind === 'grid') { const a = new Art(16, 16); a.set(0, 0, '#12381f'); a.set(8, 0, '#0a2413'); a.set(0, 8, '#0a2413'); a.set(8, 8, '#081d10'); return a.canvas(); }
  if (kind === 'hatch') { const a = new Art(8, 8); for (let i = 0; i < 8; i++) { a.set(i, (8 - i) % 8, '#0c2414'); } return a.canvas(); }
  if (kind === 'scan') { const a = new Art(2, 3); a.set(0, 0, 'rgba(0,0,0,0.26)'); a.set(1, 0, 'rgba(0,0,0,0.26)'); a.set(0, 2, 'rgba(0,0,0,0.12)'); return a.canvas(); }
  if (kind === 'veil') { const a = new Art(2, 2); a.set(0, 0, 'rgba(1,5,3,0.92)'); a.set(1, 1, 'rgba(1,5,3,0.92)'); a.set(1, 0, 'rgba(1,5,3,0.55)'); a.set(0, 1, 'rgba(1,5,3,0.55)'); return a.canvas(); }
  const a = new Art(2, 2); a.set(0, 0, '#0f3a1e'); return a.canvas(); // 'dither'
}

// ---------------------------------------------------------------- 9-slice frames
// c = corner (art px), r = pixel rounding, rings = colours from the outside in (null = clear;
// a [lit, dark, corner?] pair is a bevel), fill = the middle, joints = the corner pixel of
// ring 1 (the bright ┌ ┐ └ ┘ joints of a box-drawing frame), depth = rows of key side (dcol).
const SPECS = {
  box: { c: 3, r: 0, rings: [null, '#1f7d3d'], fill: '#030c06', joints: '#7cf29e' },
  boxHi: { c: 3, r: 0, rings: [null, '#3fb866'], fill: '#05140b', joints: '#e2ffe8' },
  boxD: { c: 4, r: 0, rings: [null, '#3fb866', '#030c06', '#1f7d3d'], fill: '#030c06', joints: '#e2ffe8' },
  boxA: { c: 3, r: 0, rings: [null, '#c8861e'], fill: '#0c0903', joints: '#ffd27a' },
  well: { c: 3, r: 0, rings: ['#010402', '#0f3a1e'], fill: '#010603', joints: '#1f7d3d' },
  keyG: { c: 3, r: 1, rings: ['#010402', ['#d0ffd8', '#1f7d3d', '#3fb866']], fill: '#3fb866', depth: 3, dcol: '#0f4a22' },
  keyO: { c: 3, r: 1, rings: ['#010402', '#3fb866'], fill: '#04140a', depth: 2, dcol: '#0f3a1e', joints: '#9ef5b0' },
  keyD: { c: 3, r: 1, rings: ['#010402', '#14402a'], fill: '#030c06', depth: 3, dcol: '#071a0e' },
  keyS: { c: 3, r: 1, rings: ['#010402', '#14402a'], fill: '#030c06', depth: 2, dcol: '#071a0e' },
  keyA: { c: 3, r: 1, rings: ['#120a02', ['#ffe0a0', '#8a5010', '#e8a030']], fill: '#e8a030', depth: 3, dcol: '#5a3008' },
  keyAO: { c: 3, r: 1, rings: ['#010402', '#c8861e'], fill: '#0e0a02', depth: 2, dcol: '#3a2406', joints: '#ffd27a' },
};

function frameCanvas(s) {
  const c = s.c, dep = s.depth || 0, r = s.r ?? 1;
  const W = 2 * c + 2, Hf = 2 * c + 2, H = Hf + dep;
  const a = new Art(W, H);
  const ink = s.rings[0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ex = Math.min(x, W - 1 - x);
      const eyR = Math.min(y, H - 1 - y);
      if (ex + eyR < r) continue;
      if (ex + eyR === r && r > 0) { a.set(x, y, ink); continue; }
      if (y >= Hf) { a.set(x, y, ex === 0 || y === H - 1 ? ink : s.dcol); continue; }
      const ey = Math.min(y, Hf - 1 - y);
      const d = Math.min(ex, ey);
      const ring = d < s.rings.length ? s.rings[d] : s.fill;
      if (ring == null) continue;
      let col = ring;
      if (Array.isArray(ring)) {
        const top = ey === d && y < Hf / 2, left = ex === d && x < W / 2;
        const bot = ey === d && y >= Hf / 2, right = ex === d && x >= W / 2;
        col = (top || left) && !(bot || right) ? ring[0] : (bot || right) && !(top || left) ? ring[1] : ring[2] || ring[0];
      }
      if (s.joints && d === 1 && ex === 1 && ey === 1) col = s.joints;
      a.set(x, y, col);
    }
  }
  return { cv: a.canvas(), c, dep };
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
    map[k] = `url(${url}) ${C} ${C} ${B} ${C} fill / ${cw}px ${cw}px ${bw}px ${cw}px stretch`;
  }
  _frames = { u, map };
  return map;
}
