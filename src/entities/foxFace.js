// Reynard's animated 2D pixel-art face. Three small canvases, drawn texel by
// texel and redrawn only when the face state changes:
//   face  (56x48) - head front: eyes, brows, blush, sweat drop, anger vein, tears
//   mouth (24x20) - muzzle front: mouth shapes, visemes, drool
//   lens  (16x16) - monocle lens: glint sweep
// 4 texels per 0.05 voxel, so the features line up with the voxel head.
import * as THREE from 'three';

export const FACE_W = 56, FACE_H = 48; // head front: 14 x 12 voxels
export const MOUTH_W = 24, MOUTH_H = 16; // muzzle front: 6 x 4 voxels
export const LENS_W = 16;

// ------------------------------------------------------------------ palette
const COLORS = {
  k: '#2a1520', // ink
  K: '#6b2b22', // soft ink (lower lids)
  w: '#fffaf0', // sclera
  W: '#e6d6dc', // sclera shade under the lid
  i: '#f7b52a', // iris (amber)
  I: '#c26a14', // iris rim
  j: '#ffd970', // iris light
  p: '#1c0c16', // pupil
  h: '#ffffff', // highlight
  b: '#5a220f', // brows
  B: '#8a3a1a', // brow light
  m: '#8a2434', // mouth
  M: '#4a0f22', // mouth deep
  t: '#ff8a9c', // tongue
  T: '#dc5270', // tongue shade
  e: '#ffffff', // teeth
  E: '#d8d0e6', // teeth shade
  r: '#ff6f8a', // blush
  R: '#ffadbd', // blush light
  s: '#8fd8ff', // water
  S: '#e8f9ff', // water light
  d: '#3a8ad8', // water dark
  v: '#ec3242', // vein
  V: '#9a1428', // vein dark
  g: '#ffd23f', // gold
  G: '#e59a1f', // gold mid
  n: '#9c5a16', // gold dark
  Y: '#fff4a8', // gold light
  H: '#ff4468', // heart
  L: '#ffb0c0', // heart light
  D: '#b01c3c', // heart dark
  o: '#e0662a', // fur
  c: '#f8eedc', // cream
  z: '#5a3a8a', // spiral
};
const KEYS = Object.keys(COLORS);
const IDX = {};
KEYS.forEach((k, i) => (IDX[k] = i + 1));
const CSS = [null, ...KEYS.map((k) => COLORS[k])];

// Tiny palette-indexed pixel buffer.
class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h);
  }
  clear() { this.d.fill(0); }
  set(x, y, ch) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = ch ? IDX[ch] : 0;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }
  // rows of chars; '.' = keep, '_' = erase
  rows(rows, x0, y0, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[flip ? r.length - 1 - i : i];
        if (ch === '.' || ch === ' ') continue;
        this.set(x0 + i, y0 + j, ch === '_' ? null : ch);
      }
    }
  }
  line(x0, y0, x1, y1, ch, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let t = 0; t < thick; t++) this.set(x0, y0 + t, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  paint(ctx) {
    ctx.clearRect(0, 0, this.w, this.h);
    const d = this.d, w = this.w;
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < w) {
        const c = d[y * w + x];
        if (!c) { x++; continue; }
        let x1 = x + 1;
        while (x1 < w && d[y * w + x1] === c) x1++;
        ctx.fillStyle = CSS[c];
        ctx.fillRect(x, y, x1 - x, 1);
        x = x1;
      }
    }
  }
}

// ------------------------------------------------------------------ eyes
// Eye centres on the face canvas (texel corners). Right eye = viewer's left.
export const EYE_R = { x: 15, y: 18 };
export const EYE_L = { x: 41, y: 18 };

// Eye shapes. rx/ry: ellipse radii (texels). top/bot(xo): lid lines, xo grows
// toward the outer corner. lid: thickness of the upper lash line.
const OPEN_SHAPES = {
  open: { rx: 5.6, ry: 6.3, top: (xo) => -5.2 - xo * 0.18, lid: 2, flick: 1, iris: 3.6 },
  half: { rx: 5.8, ry: 6.3, top: (xo) => -0.6 + xo * 0.1, lid: 2, flick: 1, iris: 3.6, lookY: 0.35 },
  narrow: { rx: 5.8, ry: 6, top: (xo) => -1.6 - xo * 0.38, bot: (xo) => 3.2 - xo * 0.1, lid: 2, flick: 1, iris: 3.4 },
  squint: { rx: 5.8, ry: 6, top: (xo) => -2.4 - xo * 0.55, bot: (xo) => 2.2, lid: 2, flick: 0, iris: 3.1, small: true },
  sleepy: { rx: 5.6, ry: 6.2, top: (xo) => 0.6 + xo * 0.18, lid: 2, flick: 0, iris: 3.4, lookY: 0.9 },
  nervous: { rx: 5.4, ry: 6.2, top: (xo) => -4.2 + xo * 0.32, lid: 1, flick: 0, iris: 2.6, small: true },
  wide: { rx: 6.3, ry: 7.4, lid: 1, flick: 0, pin: true },
  shiny: { rx: 5.9, ry: 6.6, top: (xo) => -5.6 - xo * 0.1, lid: 2, flick: 1, iris: 4.4, shiny: true },
  spiral: { rx: 6, ry: 6.8, lid: 1, flick: 0, spiral: true },
  blink1: { rx: 5.6, ry: 6.3, top: (xo) => 1.6, lid: 2, flick: 1, iris: 3.4 },
};

// Closed eye strokes: y(x) with x in [-5.5, 5.5]
const CLOSED_SHAPES = {
  happy: (x) => -1.6 + (x * x) / 8.5, // ^
  closed: (x, xo) => 1.4 + (xo > 3.5 ? (xo - 3.5) * 0.9 : 0), // - with a droopy lash
  content: (x) => 2.6 - (x * x) / 9, // u (proud, sleeping content)
  blink: (x) => 1.8 + (x * x) / 30,
  wink: (x, xo) => -1.2 + (x * x) / 9 + xo * 0.12,
};

export const EYE_KINDS = [...Object.keys(OPEN_SHAPES).filter((k) => !k.startsWith('blink')), ...Object.keys(CLOSED_SHAPES).filter((k) => k !== 'blink'), 'coin', 'heart', 'x'];

const inEllipse = (x, y, rx, ry) => (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;

function drawOpenEye(P, cx, cy, side, S, lx, ly, t, big) {
  const rx = S.rx + big, ry = S.ry + big;
  const R = 8;
  const mask = new Uint8Array((2 * R + 1) * (2 * R + 1));
  const mi = (i, j) => (j + R) * (2 * R + 1) + (i + R);
  const inside = (i, j) => i >= -R && i <= R && j >= -R && j <= R && mask[mi(i, j)] === 1;
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const x = i + 0.5, y = j + 0.5, xo = x * side;
      if (!inEllipse(x, y, rx, ry)) continue;
      if (S.top && y < S.top(xo)) continue;
      if (S.bot && y > S.bot(xo)) continue;
      mask[mi(i, j)] = 1;
    }
  // fill: sclera, iris, pupil
  const lookY = ly + (S.lookY || 0);
  const ix = lx * (S.pin ? 3 : 2.2), iy = lookY * (S.pin ? 3 : 2) + 0.7;
  const ir = (S.iris || 3.4) + big * 0.4;
  const pxr = S.small ? 1.05 : S.shiny ? 2.2 : 1.25, pyr = S.small ? 1.7 : S.shiny ? 2.7 : 2.8;
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      if (!inside(i, j)) continue;
      const x = i + 0.5, y = j + 0.5;
      let c = 'w';
      if (!inside(i, j - 1)) c = 'W';
      if (S.spiral) {
        const a = Math.atan2(y, x), r = Math.hypot(x, y);
        let ph = (r / 1.9 - (a + t * 7) / (Math.PI * 2)) % 1;
        if (ph < 0) ph += 1;
        if (ph < 0.42 && r < 6.5) c = 'z';
      } else if (S.pin) {
        const dx = x - ix, dy = y - iy;
        if (dx * dx + dy * dy <= 1.3) c = 'p';
      } else {
        const dx = x - ix, dy = y - iy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= ir * ir) {
          c = dy < -ir * 0.45 ? 'I' : dy > ir * 0.4 ? 'j' : 'i';
          if ((dx * dx) / (pxr * pxr) + (dy * dy) / (pyr * pyr) <= 1) c = 'p';
        }
      }
      P.set(cx + i, cy + j, c);
    }
  if (!S.spiral && !S.pin) {
    // highlight (fixed light direction: upper left)
    const hx = Math.floor(ix - 1.6), hy = Math.floor(iy - 2.4);
    const hl = S.shiny ? [[0, 0], [1, 0], [0, 1], [1, 1], [3, 3], [-1, 0]] : S.small ? [[0, 0]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [a, b] of hl) if (inside(hx + a, hy + b)) P.set(cx + hx + a, cy + hy + b, 'h');
  } else if (S.pin) {
    const hx = Math.round(ix), hy = Math.round(iy - 1);
    if (inside(hx - 1, hy - 1)) P.set(cx + hx - 1, cy + hy - 1, 'h');
  }
  // outline ring (outside the mask, 4-neighbours)
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      if (inside(i, j)) continue;
      if (!(inside(i - 1, j) || inside(i + 1, j) || inside(i, j - 1) || inside(i, j + 1))) continue;
      P.set(cx + i, cy + j, 'k');
    }
  // thick upper lash line + outer flick
  if (S.lid > 1) {
    let topOuter = null;
    for (let i = -R; i <= R; i++) {
      let top = null;
      for (let j = -R; j <= R; j++) if (inside(i, j)) { top = j; break; }
      if (top == null) continue;
      for (let k = 1; k <= S.lid; k++) P.set(cx + i, cy + top - 1 - k + 1, 'k');
      P.set(cx + i, cy + top - S.lid, 'k');
      const xo = (i + 0.5) * side;
      if (!topOuter || xo > topOuter.xo) topOuter = { i, top, xo };
    }
    if (S.flick && topOuter) {
      const { i, top } = topOuter;
      P.set(cx + i + side, cy + top - 2, 'k');
      P.set(cx + i + side * 2, cy + top - 3, 'k');
      P.set(cx + i + side, cy + top - 1, 'k');
    }
  }
}

function drawClosedEye(P, cx, cy, side, fn, thick = 2) {
  let prev = null;
  for (let i = -6; i <= 5; i++) {
    const x = i + 0.5, xo = x * side;
    const y = Math.round(fn(x, xo));
    const X = cx + i;
    P.set(X, cy + y, 'k');
    if (thick > 1) P.set(X, cy + y + 1, 'k');
    if (prev != null && Math.abs(prev - y) > 1) {
      const a = Math.min(prev, y), b = Math.max(prev, y);
      for (let yy = a; yy <= b; yy++) P.set(X - (prev < y ? 0 : 1), cy + yy, 'k');
    }
    prev = y;
  }
}

const COIN = [
  '...nnnnnn...',
  '..nGggggGn..',
  '.nGgYYggggn.',
  'nGgY.nn.ggGn',
  'nggYn...gggn',
  'nggg.nn.gggn',
  'ngggg..ngggn',
  'nggg.nn.gGGn',
  'nGgg...GgGGn',
  '.nGgg..gGGn.',
  '..nGGGGGGn..',
  '...nnnnnn...',
];
const COIN_EDGE = [
  '....nnn.....',
  '...nGgGn....',
  '...nYgGn....',
  '...nYgGn....',
  '...nggGn....',
  '...nggGn....',
  '...nggGn....',
  '...nggGn....',
  '...nggGn....',
  '...nGgGn....',
  '...nGGGn....',
  '....nnn.....',
];
const COIN_MID = [
  '...nnnnnn...',
  '..nGgggGGn..',
  '..nggYgggn..',
  '.nggYn.ngGn.',
  '.nggn..ngGn.',
  '.ngg.nn.gGn.',
  '.nggg..ngGn.',
  '.ngg.nn.gGn.',
  '.nGg...ngGn.',
  '..nGg..gGn..',
  '..nGGGGGGn..',
  '...nnnnnn...',
];
const HEART = [
  '.kkk....kkk.',
  'kHLHk..kHHHk',
  'kLHHHkkHHHHk',
  'kHHHHHHHHHHk',
  'kHHHHHHHHHDk',
  '.kHHHHHHHDk.',
  '..kHHHHHDk..',
  '...kHHHDk...',
  '....kHDk....',
  '.....kk.....',
];
const HEART_SMALL = [
  '............',
  '..kk....kk..',
  '.kLHk..kHHk.',
  '.kHHHkkHHHk.',
  '.kHHHHHHHDk.',
  '..kHHHHHDk..',
  '...kHHHDk...',
  '....kHDk....',
  '.....kk.....',
  '............',
];

function drawSpecialEye(P, cx, cy, side, kind, t) {
  if (kind === 'coin') {
    const f = Math.floor(t * 7) % 8;
    const img = f === 3 || f === 7 ? COIN_EDGE : f === 2 || f === 4 || f === 6 ? COIN_MID : COIN;
    P.rows(img, cx - 6, cy - 6, side > 0 && img !== COIN);
    // sparkle
    if (f === 0 || f === 1) {
      const sx = cx + (side > 0 ? 5 : -7), sy = cy - 8;
      P.set(sx + 1, sy, 'Y'); P.set(sx, sy + 1, 'Y'); P.set(sx + 1, sy + 1, 'h'); P.set(sx + 2, sy + 1, 'Y'); P.set(sx + 1, sy + 2, 'Y');
    }
  } else if (kind === 'heart') {
    const big = Math.floor(t * 5) % 2 === 0;
    P.rows(big ? HEART : HEART_SMALL, cx - 6, cy - 5, side > 0);
  } else if (kind === 'x') {
    for (let k = -4; k <= 4; k++) {
      P.set(cx + k, cy + k, 'k'); P.set(cx + k - 1, cy + k, 'k');
      P.set(cx + k, cy - k, 'k'); P.set(cx + k - 1, cy - k, 'k');
    }
  }
}

function drawEye(P, cx, cy, side, kind, lx, ly, t, big) {
  if (OPEN_SHAPES[kind]) drawOpenEye(P, cx, cy, side, OPEN_SHAPES[kind], lx, ly, t, big);
  else if (CLOSED_SHAPES[kind]) drawClosedEye(P, cx, cy, side, CLOSED_SHAPES[kind]);
  else drawSpecialEye(P, cx, cy, side, kind, t);
}

// ------------------------------------------------------------------ brows
// [inner, mid, outer] heights relative to the brow base line
const BROWS = {
  neutral: [0, -1, 0.3],
  raised: [-2.2, -3.6, -1.8],
  high: [-3.8, -5.4, -3.4],
  cocked: [-3.4, -5.6, -2.4],
  low: [1.4, 0.9, 0.6],
  angry: [3.2, 0.9, -1.8],
  worried: [-2.6, -0.8, 1.6],
  droopy: [0.6, 0.6, 1.8],
  relaxed: [0.2, -0.4, 0.8],
  furrow: [2, 0.4, -0.4],
};
export const BROW_KINDS = Object.keys(BROWS);

function drawBrow(P, cx, cy, side, kind, lift) {
  const b = BROWS[kind] || BROWS.neutral;
  const base = cy - 10.5 - lift;
  // quadratic through (inner, mid, outer); drawn column by column
  const X0 = -3.5, X1 = 1, X2 = 5.8;
  const q = (xo) => {
    const l0 = ((xo - X1) * (xo - X2)) / ((X0 - X1) * (X0 - X2));
    const l1 = ((xo - X0) * (xo - X2)) / ((X1 - X0) * (X1 - X2));
    const l2 = ((xo - X0) * (xo - X1)) / ((X2 - X0) * (X2 - X1));
    return b[0] * l0 + b[1] * l1 + b[2] * l2;
  };
  let prev = null;
  for (let k = 0; k <= 9; k++) {
    const xo = X0 + k;
    const x = Math.floor(cx + (xo - 0.5) * side);
    const y = Math.round(base + q(xo));
    const th = k >= 8 ? 1 : k <= 1 ? 3 : 2;
    let y0 = k <= 1 ? y - 1 : y, y1 = y0 + th - 1;
    if (prev != null) {
      if (y0 > prev + 1) y0 = prev + 1;
      if (y1 < prev - 1) y1 = prev - 1;
    }
    for (let yy = y0; yy <= y1; yy++) P.set(x, yy, 'b');
    prev = y;
  }
}

// ------------------------------------------------------------------ overlays (face)
const SWEAT = [
  '...k...',
  '..ksk..',
  '..kSk..',
  '.kSssk.',
  'kSsssdk',
  'kSsssdk',
  'kssssdk',
  '.kssdk.',
  '..kkk..',
];
const SWEAT_SMALL = ['.k.', 'kSk', 'ksk', '.k.'];
const VEIN = [
  '.vv...vv.',
  'vVv...vVv',
  'vV.....Vv',
  '.........',
  '.........',
  'vV.....Vv',
  'vVv...vVv',
  '.vv...vv.',
];
const VEIN2 = [
  '..........',
  '.vv....vv.',
  '.vVv..vVv.',
  '..........',
  '..........',
  '.vVv..vVv.',
  '.vv....vv.',
  '..........',
];
const BLUSH = [
  '.rrRrRrr.',
  'rrRrRrRrr',
  '.rrrrrrr.',
];
const BLUSH_HATCH = [
  '..r..r..r',
  '.r..r..r.',
  'r..r..r..',
];

function drawFaceOverlays(P, s, t) {
  if (s.blush) {
    const img = s.blush > 1 ? BLUSH_HATCH : BLUSH;
    P.rows(img, EYE_R.x - 7, EYE_R.y + 8);
    P.rows(img, EYE_L.x - 2, EYE_L.y + 8, true);
    if (s.blush > 1) { P.rows(BLUSH, EYE_R.x - 7, EYE_R.y + 11); P.rows(BLUSH, EYE_L.x - 2, EYE_L.y + 11, true); }
  }
  if (s.tear) {
    const f = Math.floor(t * 6) % 3;
    for (const [e, side] of [[EYE_R, -1], [EYE_L, 1]]) {
      const x = e.x + side * 5 - (side < 0 ? 1 : 0);
      if (s.tear > 1) {
        // streams
        for (let y = e.y + 3; y < e.y + 16; y++) {
          const w = ((y + f) % 3 === 0) ? 'S' : 's';
          P.set(x, y, w); P.set(x + 1, y, 's');
          P.set(x - 1, y, 'd'); P.set(x + 2, y, 'd');
        }
        P.rows(['.dd.', 'dssd', 'dSsd', '.dd.'], x - 1, e.y + 15 + f);
      } else {
        P.rows(['.d.', 'dSd', 'dsd', '.d.'], x - 1 + side, e.y + 1 + (f === 2 ? 1 : 0));
      }
    }
  }
  if (s.sweat) {
    const f = Math.floor(t * 3) % 4;
    P.rows(SWEAT, 47, 2 + f);
    if (s.sweat > 1) P.rows(SWEAT_SMALL, 5, 5 + ((f + 2) % 4));
  }
  if (s.vein) {
    const f = Math.floor(t * 5) % 2;
    P.rows(f ? VEIN : VEIN2, 3, 1);
  }
}

// ------------------------------------------------------------------ mouths
// 24 wide; rows start at MOUTH_Y (just under the voxel nose). Centre is
// between columns 11 and 12.
const MOUTH_Y = 4;
const PH = '...........kk...........'; // philtrum
const MOUTHS = {
  smirk_soft: [
    PH,
    PH,
    '..........kkkk..........',
    '.....k...k....k...kk....',
    '......kkk......kkk......',
  ],
  smirk: [
    PH,
    PH,
    '...........kk.........k.',
    '.......kkkkkkk.......k..',
    '..............kk....k...',
    '................kkkk....',
  ],
  smirk_fang: [
    PH,
    PH,
    '...........kk.........k.',
    '......kkkkkkkkk......k..',
    '...............kk...k...',
    '...............kekkk....',
    '...............kek......',
    '................k.......',
  ],
  smirk_big: [
    PH,
    PH,
    '..k........kk........k..',
    '...kk.....kkkk.....kk...',
    '.....kkkkk....kkkkk.....',
  ],
  cat: [
    PH,
    PH,
    '..........kkkk..........',
    '..k......k....k......k..',
    '...kk..kk......kk..kk...',
    '.....kk..........kk.....',
  ],
  grin: [
    PH,
    PH,
    '...k.......kk.......k...',
    '...kkkkkkkkkkkkkkkkkk...',
    '....kmmmmmmmmmmmmmmk....',
    '.....kmmmmmmmmmmmmk.....',
    '......kmmmttttmmmk......',
    '.......kkttttttkk.......',
    '.........kkkkkk.........',
  ],
  grin_fang: [
    PH,
    PH,
    '...k.......kk.......k...',
    '...kkkkkkkkkkkkkkkkkk...',
    '....kmmmmmmmmmmmmeeek...',
    '.....kmmmmmmmmmmmeek....',
    '......kmmmttttmmmek.....',
    '.......kkttttttkk.......',
    '.........kkkkkk.........',
  ],
  evil_grin: [
    'k.........kkkk.........k',
    'kk.........kk.........kk',
    'kek........kk........kek',
    'keekkkkkkkkkkkkkkkkkkeek',
    '.keeEeeEeeEeeEeeEeeEeek.',
    '.kMMMMMMMMMMMMMMMMMMMMk.',
    '..kmmmmmmmmmmmmmmmmmmk..',
    '..keeEeeEeeEeeEeeEeeek..',
    '...kkkkkkkkkkkkkkkkkk...',
  ],
  laugh: [
    PH,
    '..kkkkkkkkkkkkkkkkkkkk..',
    '..keeMMMMMMMMMMMMMMeek..',
    '..kMeMMMMMMMMMMMMMMeMk..',
    '...kMMMMMMMMMMMMMMMMk...',
    '...kMMMMMMMMMMMMMMMMk...',
    '....kmMMMMMMMMMMMMmk....',
    '....kmmmttttttttmmmk....',
    '.....kmttttTTttttmk.....',
    '......kkttttttttkk......',
    '........kkkkkkkk........',
  ],
  mwaha: [
    'kk........kkkk........kk',
    'keek.......kk.......keek',
    '.keekkkkkkkkkkkkkkkkeek.',
    '..kMMMMMMMMMMMMMMMMMMk..',
    '..kMMMMMMMMMMMMMMMMMMk..',
    '..kMMMMMMMMMMMMMMMMMMk..',
    '...kMMMMMmmmmmmMMMMMk...',
    '...kmmmmttttttttmmmmk...',
    '....kmtttttTTtttttmk....',
    '.....kkttttttttttkk.....',
    '.......kkkkkkkkkk.......',
  ],
  o: [
    PH,
    PH,
    '..........kkkk..........',
    '.........kMMMMk.........',
    '........kMMMMMMk........',
    '........kMMMMMMk........',
    '.........kmttmk.........',
    '..........kkkk..........',
  ],
  o_big: [
    PH,
    '.........kkkkkk.........',
    '........kMMMMMMk........',
    '.......kMMMMMMMMk.......',
    '.......kMMMMMMMMk.......',
    '.......kMMMMMMMMk.......',
    '.......kMMMMMMMMk.......',
    '.......kMMmmmmMMk.......',
    '........kmttttmk........',
    '.........kkkkkk.........',
  ],
  scream: [
    '.......kkkkkkkkkk.......',
    '.....kkeeEeeEeeEekk.....',
    '....kMMMMMMMMMMMMMMk....',
    '...kMMMMMMMMMMMMMMMMk...',
    '...kMMMMMMMMMMMMMMMMk...',
    '...kMMMMMMMMMMMMMMMMk...',
    '...kMMMMMMMMMMMMMMMMk...',
    '....kMMmmmmmmmmmmMMk....',
    '....kmmttttttttttmmk....',
    '.....kkttttTTttttkk.....',
    '.......kkkkkkkkkk.......',
  ],
  // talk visemes
  A: [
    PH,
    '.......kkkkkkkkkk.......',
    '......kMMMMMMMMMMk......',
    '......kMMMMMMMMMMk......',
    '.......kMMMMMMMMk.......',
    '.......kmmttttmmk.......',
    '........kkttttkk........',
    '..........kkkk..........',
  ],
  E: [
    PH,
    '.....kkkkkkkkkkkkkk.....',
    '.....keeEeeEeeEeeek.....',
    '.....kMMMMMMMMMMMMk.....',
    '......kmmmttttmmmk......',
    '.......kkkkkkkkkk.......',
  ],
  O: [
    PH,
    '..........kkkk..........',
    '.........kMMMMk.........',
    '........kMMMMMMk........',
    '........kMMMMMMk........',
    '.........kmttmk.........',
    '..........kkkk..........',
  ],
  M: [
    PH,
    PH,
    '...........kk...........',
    '.......kkkkkkkkkk.......',
    '......k..........k......',
  ],
  frown: [
    PH,
    PH,
    '...........kk...........',
    '.........kkkkkk.........',
    '.......kk......kk.......',
    '......k..........k......',
    '.....k............k.....',
  ],
  wobbly: [
    PH,
    PH,
    '...........kk...........',
    '.....kk...kkkk...kk.....',
    '....k..k.k....k.k..k....',
    '...k....k......k....k...',
  ],
  grit: [
    PH,
    '....kkkkkkkkkkkkkkkk....',
    '....keeEeeEeeEeeEeek....',
    '....kkkkkkkkkkkkkkkk....',
    '....keeEeeEeeEeeEeek....',
    '.....kkkkkkkkkkkkkk.....',
  ],
  grimace: [
    PH,
    '...k.......kk.......k...',
    '...kkkkkkkkkkkkkkkkkk...',
    '...keeEeeEeeEeeEeeeek...',
    '....kkkkkkkkkkkkkkkk....',
  ],
  yawn: [
    '........kkkkkkkk........',
    '......kkMMMMMMMMkk......',
    '.....kMMMMMMMMMMMMk.....',
    '....keMMMMMMMMMMMMek....',
    '....kMMMMMMMMMMMMMMk....',
    '....kMMMMMMMMMMMMMMk....',
    '....kMMMMMMMMMMMMMMk....',
    '....kMMMMMMMMMMMMMMk....',
    '....kMMMmmmmmmmmmMMMk...',
    '.....kmmttttttttmmk.....',
    '.....kmtttTTTTtttmk.....',
    '......kkttttttttkk......',
    '........kkkkkkkk........',
  ],
  slack: [
    PH,
    PH,
    '..........kkkk..........',
    '.........kMMMMk.........',
    '..........kmmk..........',
    '...........kk...........',
  ],
  tongue: [
    PH,
    PH,
    '..........kkkk..........',
    '.....k...k....k...k.....',
    '......kkkkttttkkkk......',
    '.........kttTtk.........',
    '.........kttTtk.........',
    '..........kkkk..........',
  ],
  chew: [
    PH,
    PH,
    '...........kk...........',
    '.......kkkkkkkkkk.......',
    '.......kmmmmmmmmk.......',
    '........kkkkkkkk........',
  ],
  kiss: [
    PH,
    PH,
    '...........kk...........',
    '..........kkk...........',
    '.........k..k...........',
    '..........kk............',
    '.........k..k...........',
    '..........kkk...........',
  ],
};
export const MOUTH_KINDS = Object.keys(MOUTHS);

const DROOL = ['d', 'S', 's', 'S', 'dsd', 'sSs', '.d.'];

function drawMouth(P, kind, s, t) {
  const img = MOUTHS[kind] || MOUTHS.smirk_soft;
  const y0 = kind === 'evil_grin' || kind === 'mwaha' || kind === 'yawn' || kind === 'scream' ? MOUTH_Y - 1 : MOUTH_Y;
  P.rows(img, 0, y0);
  if (s.drool) {
    // drips from the mouth corner (viewer's left), grows and drops
    const len = 2 + (Math.floor(t * 3) % 4);
    const x = 6, y = y0 + 5;
    for (let k = 0; k < len; k++) P.set(x, y + k, k === 0 ? 'd' : 'S');
    P.rows(['dsd', 'sSs', '.d.'], x - 1, y + len);
  }
}

// ------------------------------------------------------------------ lens
function drawLens(P, glint) {
  // faint sheen + an optional travelling glint streak
  P.set(10, 4, 'S'); P.set(11, 5, 'S');
  if (glint > 0) {
    const off = Math.round((glint - 0.5) * 14);
    for (let k = -3; k <= 3; k++) {
      const x = 8 + off + k, y = 8 - k;
      P.set(x, y, 'h'); P.set(x + 1, y, 'h'); P.set(x + 2, y, 'S');
    }
    if (glint > 0.35 && glint < 0.75) {
      // star sparkle
      const sx = 12, sy = 3;
      P.set(sx, sy - 2, 'h'); P.set(sx, sy - 1, 'h'); P.set(sx, sy + 1, 'h'); P.set(sx, sy + 2, 'h');
      P.set(sx - 2, sy, 'h'); P.set(sx - 1, sy, 'h'); P.set(sx + 1, sy, 'h'); P.set(sx + 2, sy, 'h'); P.set(sx, sy, 'h');
    }
  }
}

// ------------------------------------------------------------------ expressions
// Each preset: eyeL/eyeR, browL/browR, mouth, look [x,y] and overlay flags.
export const EXPRESSIONS = {
  neutral: { eye: 'open', brow: 'neutral', mouth: 'smirk_soft' },
  smug: { eyeR: 'half', eyeL: 'half', browR: 'low', browL: 'cocked', mouth: 'smirk', glint: 1, look: [0.2, 0] },
  greedy: { eye: 'coin', brow: 'raised', mouth: 'grin_fang', drool: 1, glint: 1 },
  evil_grin: { eye: 'narrow', brow: 'angry', mouth: 'evil_grin', glint: 1 },
  scheming: { eye: 'narrow', browR: 'angry', browL: 'cocked', mouth: 'smirk_fang', look: [-0.9, 0.1], glint: 1 },
  laugh: { eye: 'happy', brow: 'raised', mouth: 'laugh', tear: 1 },
  happy: { eye: 'happy', brow: 'raised', mouth: 'grin', blush: 1 },
  wink: { eyeR: 'open', eyeL: 'wink', browR: 'raised', browL: 'low', mouth: 'grin_fang', glint: 1 },
  shocked: { eye: 'wide', brow: 'high', mouth: 'o_big', sweat: 1 },
  angry: { eye: 'squint', brow: 'angry', mouth: 'grit', vein: 1 },
  worried: { eye: 'nervous', brow: 'worried', mouth: 'wobbly', sweat: 1 },
  sleepy: { eye: 'sleepy', brow: 'droopy', mouth: 'slack' },
  asleep: { eye: 'closed', brow: 'relaxed', mouth: 'slack' },
  confused: { eyeR: 'open', eyeL: 'squint', browR: 'high', browL: 'furrow', mouth: 'wobbly', look: [0.4, -0.7] },
  proud: { eye: 'content', brow: 'raised', mouth: 'smirk_big' },
  embarrassed: { eye: 'nervous', brow: 'worried', mouth: 'grimace', blush: 2, sweat: 1, look: [0.9, 0.3] },
  // extras
  dizzy: { eye: 'spiral', brow: 'worried', mouth: 'wobbly' },
  love: { eye: 'heart', brow: 'raised', mouth: 'grin', blush: 1 },
  ko: { eye: 'x', brow: 'relaxed', mouth: 'tongue' },
  sad: { eye: 'shiny', brow: 'worried', mouth: 'frown', tear: 2 },
  mwaha: { eye: 'narrow', brow: 'angry', mouth: 'mwaha', glint: 1, look: [0, -0.4] },
  excited: { eye: 'shiny', brow: 'raised', mouth: 'grin', blush: 1 },
  determined: { eye: 'narrow', brow: 'furrow', mouth: 'smirk', look: [0, 0] },
  // notifier moods
  tsk: { eye: 'closed', brow: 'raised', mouth: 'smirk', glint: 1 },
  alarmed: { eye: 'wide', brow: 'worried', mouth: 'o_big', sweat: 2 },
};
export const EXPRESSION_NAMES = Object.keys(EXPRESSIONS);

// Resolve a preset into a full face state (fills `out`).
export function expressionState(name, out = {}) {
  const e = EXPRESSIONS[name] || EXPRESSIONS.neutral;
  out.eyeL = e.eyeL || e.eye || 'open';
  out.eyeR = e.eyeR || e.eye || 'open';
  out.browL = e.browL || e.brow || 'neutral';
  out.browR = e.browR || e.brow || 'neutral';
  out.mouth = e.mouth || 'smirk_soft';
  out.lookX = e.look ? e.look[0] : 0;
  out.lookY = e.look ? e.look[1] : 0;
  out.blush = e.blush || 0;
  out.sweat = e.sweat || 0;
  out.vein = e.vein || 0;
  out.tear = e.tear || 0;
  out.drool = e.drool || 0;
  out.glint = e.glint || 0;
  return out;
}

const ANIMATED_EYES = new Set(['coin', 'heart', 'spiral']);

export class FoxFace {
  constructor() {
    const mk = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      return { c, ctx: c.getContext('2d'), tex, pix: new Pix(w, h), key: '' };
    };
    this.face = mk(FACE_W, FACE_H);
    this.mouth = mk(MOUTH_W, MOUTH_H);
    this.lens = mk(LENS_W, LENS_W);
  }

  // s: face state (see expressionState) plus lookX/lookY, blink, mono, t.
  update(s, t) {
    const aEye = ANIMATED_EYES.has(s.eyeL) || ANIMATED_EYES.has(s.eyeR);
    const ft = aEye || s.sweat || s.vein || s.tear ? Math.floor(t * 12) : 0;
    const lx = Math.round(s.lookX * 4) / 4, ly = Math.round(s.lookY * 4) / 4;
    const eyeL = s.blink >= 1 && canBlink(s.eyeL) ? (s.blink > 1 ? 'blink' : 'blink1') : s.eyeL;
    const eyeR = s.blink >= 1 && canBlink(s.eyeR) ? (s.blink > 1 ? 'blink' : 'blink1') : s.eyeR;
    const fk = `${eyeL}|${eyeR}|${s.browL}|${s.browR}|${lx}|${ly}|${s.blush}|${s.sweat}|${s.vein}|${s.tear}|${s.mono ? 1 : 0}|${s.browLift || 0}|${ft}`;
    if (fk !== this.face.key) {
      this.face.key = fk;
      const P = this.face.pix;
      P.clear();
      const tt = ft / 12;
      const big = s.mono ? 0.6 : 0;
      drawEye(P, EYE_R.x, EYE_R.y, -1, eyeR, lx, ly, tt, big);
      drawEye(P, EYE_L.x, EYE_L.y, 1, eyeL, lx, ly, tt, 0);
      const lift = s.browLift || 0;
      if (!(eyeR === 'coin' || eyeR === 'heart')) drawBrow(P, EYE_R.x, EYE_R.y, -1, s.browR, lift + (s.mono && s.browR !== 'low' ? 0.5 : 0));
      if (!(eyeL === 'coin' || eyeL === 'heart')) drawBrow(P, EYE_L.x, EYE_L.y, 1, s.browL, lift);
      drawFaceOverlays(P, s, tt);
      P.paint(this.face.ctx);
      this.face.tex.needsUpdate = true;
    }
    const mt = s.drool ? Math.floor(t * 3) : 0;
    const mk = `${s.mouth}|${s.drool}|${mt}`;
    if (mk !== this.mouth.key) {
      this.mouth.key = mk;
      const P = this.mouth.pix;
      P.clear();
      drawMouth(P, s.mouth, s, mt / 3);
      P.paint(this.mouth.ctx);
      this.mouth.tex.needsUpdate = true;
    }
    const g = s.glintT > 0 ? Math.round(s.glintT * 10) / 10 : 0;
    const lk = `${g}`;
    if (lk !== this.lens.key) {
      this.lens.key = lk;
      const P = this.lens.pix;
      P.clear();
      drawLens(P, g);
      P.paint(this.lens.ctx);
      this.lens.tex.needsUpdate = true;
    }
  }

  dispose() {
    this.face.tex.dispose();
    this.mouth.tex.dispose();
    this.lens.tex.dispose();
  }
}

function canBlink(kind) {
  return kind === 'open' || kind === 'half' || kind === 'narrow' || kind === 'nervous' || kind === 'wide' || kind === 'shiny' || kind === 'sleepy' || kind === 'squint';
}

// Small helper textures (snot bubble, pop, "z").
export function makeSpriteTexture(rows, pal = COLORS) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const BUBBLE_ROWS = [
  '....dddddd....',
  '..ddssssssdd..',
  '.dsSSsssssssd.',
  '.dSSssssssssd.',
  'dsSssssssssssd',
  'dsSsssssssssSd',
  'dsssssssssssSd',
  'dsssssssssssSd',
  'dssssssssssSsd',
  'dssssssssssSsd',
  '.dssssssssSsd.',
  '.dsssssssSSsd.',
  '..ddssssssdd..',
  '....dddddd....',
];
export const POP_ROWS = [
  '..S....S....S.',
  '...S...S...S..',
  '....s.....s...',
  'S.............',
  '.Ss.........sS',
  '..............',
  '.............S',
  'SS..........ss',
  '..............',
  '.sS.......Ss..',
  '....s.....s...',
  '...S...S...S..',
  '..S....S....S.',
  '..............',
];
export const ZZZ_ROWS = [
  'kkkkkkk',
  'kSSSSSk',
  'kkkkSdk',
  '..kSdk.',
  '.kSdk..',
  'kSdkkkk',
  'kSSSSSk',
  'kkkkkkk',
];
export { COLORS as FACE_COLORS };
