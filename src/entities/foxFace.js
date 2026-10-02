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
  q: '#6a5ab8', // gloom lines
  Q: '#9a8ad8', // gloom tips
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
// Cute dot eyes: small solid ink dots set low and wide, with a 1px highlight.
// Expressions read through lids, brows, mouth and blush. Centres are continuous
// texel coordinates on the face canvas. Right eye = viewer's left (monocle).
export const EYE_R = { x: 13.5, y: 21 };
export const EYE_L = { x: 42.5, y: 21 };

// Stamps are authored for the viewer's-left eye (outer corner = left); `flip`
// mirrors them for the other eye (shapes with highlights stay lit from the top-left).
// dy nudges the stamp down from the eye centre; `look` lets it follow the gaze.
const DOT = {
  open: { rows: ['.kk.', 'khkk', 'kkkk', 'kkkk', '.kk.'], look: 1 },
  big: { rows: ['.kkk.', 'khhkk', 'khkkk', 'kkkkk', 'kkkkk', '.kkk.'], look: 1 }, // magnified by the monocle
  wide: { rows: ['.kkk.', 'khhkk', 'khkkk', 'kkkkk', 'kkkkk', '.kkk.'], look: 1.4 },
  shiny: { rows: ['.kkk.', 'khhkk', 'khhkk', 'kkkkk', 'kkkhk', '.kkk.'], look: 1 },
  half: { rows: ['kkkkkk', '.kkkk.', '.kkkk.'], dy: 1, look: 1 },
  narrow: { rows: ['kk....', '..kkk.', '.kkkkk', '.kkkk.'], dy: 0, look: 1, flip: true },
  squint: { rows: ['kkk...', '.kkkkk', '..kkk.'], dy: 1, look: 0.8, flip: true },
  sleepy: { rows: ['.kkkkk', 'k.kkk.'], dy: 1, look: 0.6, flip: true },
  nervous: { rows: ['hk', 'kk', 'kk'], look: 1, jitter: 1 },
  tiny: { rows: ['kk', 'kk'], look: 0.6, jitter: 1 },
  blink1: { rows: ['.kk.', 'kkkk', '.kk.'], dy: 1, look: 1 },
  blink: { rows: ['kkkk'], dy: 1, look: 1 },
  // closed shapes
  happy: { rows: ['.kkk.', 'k...k', 'k...k'], dy: 0 }, // ^ ^
  closed: { rows: ['kkkkk', 'k....'], dy: 1, flip: true }, // - with a droopy lash
  content: { rows: ['k...k', 'k...k', '.kkk.'], dy: 0 }, // u u
  wink: { rows: ['k....', '.kk..', '...kk', '.kk..', 'k....'], dy: 0, flip: true, mirror: true }, // >
  squeeze: { rows: ['kk...', '..kkk', 'kk...'], dy: 0, flip: true, mirror: true }, // > < shut tight
};
// a few eyes need a time-varying redraw (spinning / pulsing / trembling)
const ANIM_EYES = new Set(['coin', 'heart', 'spiral', 'nervous', 'tiny']);

export const EYE_KINDS = [...Object.keys(DOT).filter((k) => !k.startsWith('blink') && k !== 'big'), 'coin', 'heart', 'x', 'spiral'];

function drawDotEye(P, cx, cy, side, D, lx, ly, t) {
  const rows = D.rows;
  const h = rows.length, w = rows[0].length;
  const look = D.look || 0;
  let dx = Math.round(lx * 1.6 * look), dy = Math.round(ly * 1.2 * look) + (D.dy || 0);
  if (D.jitter) { const j = Math.floor(t * 12) % 4; dx += j === 1 ? 1 : j === 3 ? -1 : 0; }
  // `mirror` shapes point toward the nose: authored for the right eye, flipped for the left
  const flip = D.flip ? (D.mirror ? side < 0 : side > 0) : false;
  P.rows(rows, Math.round(cx - w / 2 + dx), Math.round(cy - h / 2 + dy), flip);
}

const COIN = ['..nnn..', '.nYggn.', 'nYgnggn', 'nggnggn', 'nggngGn', '.nggGn.', '..nnn..'];
const COIN_MID = ['..nnn..', '..nYgn.', '.nYngn.', '.ngnGn.', '.ngnGn.', '..nGGn.', '..nnn..'];
const COIN_EDGE = ['...n...', '..nYn..', '..ngn..', '..ngn..', '..nGn..', '..nGn..', '...n...'];
const HEART = ['.kk.kk.', 'kHLkHHk', 'kLHHHHk', 'kHHHHDk', '.kHHDk.', '..kDk..', '...k...'];
const HEART_SMALL = ['.......', '.kk.kk.', '.kLHHk.', '.kHHDk.', '..kDk..', '...k...', '.......'];
const XEYE = ['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'];

function drawSpecialEye(P, cx, cy, side, kind, t) {
  const x0 = Math.round(cx - 3.5), y0 = Math.round(cy - 3.5);
  if (kind === 'coin') {
    const f = Math.floor(t * 7) % 8;
    const img = f === 3 || f === 7 ? COIN_EDGE : f === 2 || f === 4 || f === 6 ? COIN_MID : COIN;
    P.rows(img, x0, y0, side > 0 && img !== COIN);
    if (f === 0 || f === 1) { const sx = cx + (side > 0 ? 3 : -5), sy = cy - 6; P.set(sx + 1, sy, 'Y'); P.set(sx, sy + 1, 'Y'); P.set(sx + 1, sy + 1, 'h'); P.set(sx + 2, sy + 1, 'Y'); P.set(sx + 1, sy + 2, 'Y'); }
  } else if (kind === 'heart') {
    P.rows(Math.floor(t * 5) % 2 === 0 ? HEART : HEART_SMALL, x0, y0, side > 0);
  } else if (kind === 'x') {
    P.rows(XEYE, Math.round(cx - 2.5), Math.round(cy - 2.5));
  } else if (kind === 'spiral') {
    // tiny rotating spiral
    for (let j = -4; j <= 3; j++)
      for (let i = -4; i <= 3; i++) {
        const x = i + 0.5, y = j + 0.5, r = Math.hypot(x, y);
        if (r > 3.9) continue;
        let ph = (r / 1.6 - (Math.atan2(y, x) + t * 7 * side) / (Math.PI * 2)) % 1;
        if (ph < 0) ph += 1;
        if (ph < 0.45) P.set(Math.round(cx) + i, Math.round(cy) + j, 'z');
      }
  }
}

function drawEye(P, cx, cy, side, kind, lx, ly, t, big) {
  if (kind === 'open' && big) kind = 'big';
  const D = DOT[kind];
  if (D) drawDotEye(P, cx, cy, side, D, lx, ly, t);
  else drawSpecialEye(P, cx, cy, side, kind, t);
}

// ------------------------------------------------------------------ brows
// Short soft dashes. [inner, mid, outer] heights relative to the brow base line.
const BROWS = {
  neutral: [0, -0.6, 0.2],
  raised: [-1.4, -2.2, -1.2],
  high: [-2.6, -3.4, -2.2],
  cocked: [-2.4, -3.6, -1.8],
  low: [0.9, 0.6, 0.4],
  angry: [2.4, 0.6, -1.4],
  worried: [-1.8, -0.5, 1.2],
  droopy: [0.4, 0.4, 1.3],
  relaxed: [0.1, -0.3, 0.6],
  furrow: [1.5, 0.3, -0.4],
};
export const BROW_KINDS = Object.keys(BROWS);

function drawBrow(P, cx, cy, side, kind, lift) {
  const b = BROWS[kind] || BROWS.neutral;
  const base = cy - 6.5 - lift;
  const X0 = -2.5, X1 = 0, X2 = 2.5;
  const q = (xo) => {
    const l0 = ((xo - X1) * (xo - X2)) / ((X0 - X1) * (X0 - X2));
    const l1 = ((xo - X0) * (xo - X2)) / ((X1 - X0) * (X1 - X2));
    const l2 = ((xo - X0) * (xo - X1)) / ((X2 - X0) * (X2 - X1));
    return b[0] * l0 + b[1] * l1 + b[2] * l2;
  };
  let prev = null;
  for (let k = 0; k <= 5; k++) {
    const xo = X0 + k;
    const x = Math.floor(cx + (xo - 0.5) * side + (side > 0 ? 0 : 0));
    const y = Math.round(base + q(xo));
    const th = k === 5 ? 1 : 2;
    let y0 = y, y1 = y0 + th - 1;
    if (prev != null) { if (y0 > prev + 1) y0 = prev + 1; if (y1 < prev - 1) y1 = prev - 1; }
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
const BLUSH = ['.rRRr.', 'rrrrrr', '.rrrr.'];
const BLUSH_SOFT = ['.R.R.', 'R.R.R'];
const BLUSH_HATCH = ['..r..r..', '.r..r..r', 'r..r..r.'];

function drawFaceOverlays(P, s, t) {
  // blush sits on the cream cheeks, just under and outside the dots
  const bl = (rows, dy = 0) => {
    const w = rows[0].length;
    P.rows(rows, Math.round(EYE_R.x - w / 2 - 1.5), EYE_R.y + 4 + dy);
    P.rows(rows, Math.round(EYE_L.x - w / 2 + 1.5), EYE_L.y + 4 + dy, true);
  };
  if (s.blush >= 2) { bl(BLUSH_HATCH); bl(BLUSH, 2); }
  else if (s.blush >= 1) bl(BLUSH);
  else if (s.blush > 0) bl(BLUSH_SOFT, 1);
  if (s.gloom) {
    // manga "gloom" lines raining down the forehead
    const f = Math.floor(t * 4) % 2;
    for (let x = 5; x < 52; x += 3) {
      const len = 5 + ((x * 7 + f * 3) % 5);
      for (let y = 0; y < len; y++) if (!(y === len - 1 && (x + y) & 1)) P.set(x, y, y < len - 2 ? 'q' : 'Q');
    }
  }
  if (s.tear) {
    const f = Math.floor(t * 6) % 3;
    for (const [e, side] of [[EYE_R, -1], [EYE_L, 1]]) {
      const x = Math.round(e.x + side * 3.5);
      if (s.tear > 1) {
        for (let y = e.y + 1; y < e.y + 14; y++) {
          P.set(x, y, ((y + f) % 3 === 0) ? 'S' : 's'); P.set(x - 1, y, 'd'); P.set(x + 1, y, 'd');
        }
        P.rows(['.dd.', 'dssd', 'dSsd', '.dd.'], x - 1, e.y + 13 + f);
      } else {
        P.rows(['.d.', 'dSd', 'dsd', '.d.'], x - 1, e.y - 1 + (f === 2 ? 1 : 0));
      }
    }
  }
  if (s.sweat) {
    const f = Math.floor(t * 3) % 4;
    P.rows(SWEAT, 47, 2 + f);
    if (s.sweat > 1) P.rows(SWEAT_SMALL, 4, 6 + ((f + 2) % 4));
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
  smile: [
    PH,
    PH,
    '...k.......kk.......k...',
    '....kk....k..k....kk....',
    '......kkkk....kkkk......',
  ],
  mmm: [
    PH,
    PH,
    '......k....kk....k......',
    '.......kkkk..kkkk.......',
  ],
  tongue_side: [
    PH,
    PH,
    '...........kk...........',
    '......kkkkkkkkkk........',
    '..............kktk......',
    '...............kttk.....',
    '................kk......',
  ],
  horror: [
    PH,
    '.......kk.kkkk.kk.......',
    '......kMMkMMMMkMMk......',
    '.....kMMMMMMMMMMMMk.....',
    '.....kMMMMmmmmMMMMk.....',
    '......kMMkkMMkkMMk......',
    '.......kk..kk..kk.......',
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
  neutral: { eye: 'open', brow: 'neutral', mouth: 'smirk_soft', blush: 0.5 },
  smug: { eyeR: 'half', eyeL: 'half', browR: 'low', browL: 'cocked', mouth: 'smirk', glint: 1, look: [0.2, 0] },
  greedy: { eye: 'coin', brow: 'raised', mouth: 'grin_fang', drool: 1, glint: 1 },
  evil_grin: { eye: 'narrow', brow: 'angry', mouth: 'evil_grin', glint: 1 },
  scheming: { eye: 'narrow', browR: 'angry', browL: 'cocked', mouth: 'smirk_fang', look: [-0.9, 0.1], glint: 1 },
  laugh: { eye: 'happy', brow: 'raised', mouth: 'laugh', tear: 1, blush: 0.5 },
  happy: { eye: 'happy', brow: 'raised', mouth: 'grin', blush: 1 },
  wink: { eyeR: 'open', eyeL: 'wink', browR: 'raised', browL: 'low', mouth: 'grin_fang', glint: 1, blush: 0.5 },
  shocked: { eye: 'wide', brow: 'high', mouth: 'o_big', sweat: 1 },
  angry: { eye: 'squint', brow: 'angry', mouth: 'grit', vein: 1 },
  worried: { eye: 'nervous', brow: 'worried', mouth: 'wobbly', sweat: 1 },
  sleepy: { eye: 'sleepy', brow: 'droopy', mouth: 'slack' },
  asleep: { eye: 'closed', brow: 'relaxed', mouth: 'slack', blush: 0.5 },
  confused: { eyeR: 'open', eyeL: 'squint', browR: 'high', browL: 'furrow', mouth: 'wobbly', look: [0.4, -0.7] },
  proud: { eye: 'content', brow: 'raised', mouth: 'smirk_big', blush: 0.5, glint: 1 },
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
  // outfits & props
  teacher: { eyeR: 'open', eyeL: 'open', browR: 'cocked', browL: 'relaxed', mouth: 'smile', blush: 0.5, glint: 1 },
  horror: { eye: 'tiny', brow: 'high', mouth: 'horror', sweat: 2, gloom: 1 },
  cower: { eye: 'squeeze', brow: 'worried', mouth: 'wobbly', sweat: 1, gloom: 1 },
  charge: { eye: 'narrow', brow: 'furrow', mouth: 'grin' },
  focused: { eye: 'open', brow: 'furrow', mouth: 'tongue_side', look: [0, -0.3] },
  magnifique: { eye: 'happy', brow: 'raised', mouth: 'kiss', blush: 1 },
  yum: { eye: 'content', brow: 'raised', mouth: 'mmm', blush: 1 },
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
  out.gloom = e.gloom || 0;
  return out;
}


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
    const aEye = ANIM_EYES.has(s.eyeL) || ANIM_EYES.has(s.eyeR);
    const ft = aEye || s.sweat || s.vein || s.tear || s.gloom ? Math.floor(t * 12) : 0;
    const lx = Math.round(s.lookX * 4) / 4, ly = Math.round(s.lookY * 4) / 4;
    const eyeL = s.blink >= 1 && canBlink(s.eyeL) ? (s.blink > 1 ? 'blink' : 'blink1') : s.eyeL;
    const eyeR = s.blink >= 1 && canBlink(s.eyeR) ? (s.blink > 1 ? 'blink' : 'blink1') : s.eyeR;
    const fk = `${eyeL}|${eyeR}|${s.browL}|${s.browR}|${lx}|${ly}|${s.blush}|${s.sweat}|${s.vein}|${s.tear}|${s.mono ? 1 : 0}|${s.browLift || 0}|${s.gloom || 0}|${ft}`;
    if (fk !== this.face.key) {
      this.face.key = fk;
      const P = this.face.pix;
      P.clear();
      const tt = ft / 12;
      const big = !!s.mono; // the monocle magnifies the right eye
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
  return kind === 'open' || kind === 'half' || kind === 'narrow' || kind === 'nervous' || kind === 'wide' || kind === 'shiny' || kind === 'squint';
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
