// [v32 class] Pixel art for the test paper (./TestPaper.js): the pencil and the red pen, the grade
// stamp, the gold-star sticker, the margin doodle, the painted buttons. Everything is drawn pixel by
// pixel into small canvases at 1 art px = 1 canvas px and shown at a whole-number scale.
import { pxTextBuf } from '../kinetic/pxfont.js';
import { GOOFY_HI, GOOFY_BIG, goofyBitmap } from '../goofyFont.js';

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
export function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** rows of chars -> canvas, with a palette { char: '#rrggbb' } */
export function paintRows(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const c = canvas(w, h), x = c.getContext('2d');
  rows.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) { const k = pal[r[xx]]; if (!k) continue; x.fillStyle = k; x.fillRect(xx, yy, 1, 1); } });
  return c;
}
/** pixel-font text -> { c: canvas, w, h } (fonts: body | bold | tiny | script) */
export function textCanvas(text, font = 'body', color = '#2a2830', o = {}) {
  const b = pxTextBuf(String(text), { font, color, ...o });
  const c = canvas(b.w, b.h);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(b.bytes), b.w, b.h), 0, 0);
  return { c, w: b.w, h: b.h, buf: b };
}
/** the game font (TBME Goofy) as pixels -> canvas */
export function goofyCanvas(text, color = '#2a2830', big = false) {
  const bm = goofyBitmap(big ? GOOFY_HI : GOOFY_BIG, String(text));
  const c = canvas(bm.w, bm.h), x = c.getContext('2d');
  x.fillStyle = color;
  bm.rows.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) if (r[xx] === '#') x.fillRect(xx, yy, 1, 1); });
  return { c, w: bm.w, h: bm.h, rows: bm.rows };
}

// ------------------------------------------------------------------ the pencil (tip at bottom-left)
// 45 degrees, yellow barrel with a darker facet, a pink eraser in a brass ferrule, a wood cone, graphite
const PENCIL = [
  '..............KKK',
  '.............KppK',
  '............KpprK',
  '...........KbbrK.',
  '..........KbBbK..',
  '.........KyYbK...',
  '........KyYYK....',
  '.......KyYYoK....',
  '......KyYYoK.....',
  '.....KyYYoK......',
  '....KyYYoK.......',
  '...KwwYoK........',
  '..KwwwoK.........',
  '..KgwwK..........',
  '.KggKK...........',
  '.KgK.............',
  'KK...............',
];
const PEN = [
  '..............KKK',
  '.............KrrK',
  '............KrRRK',
  '...........KwRRK.',
  '..........KrwRK..',
  '.........KrRRK...',
  '........KrRRDK...',
  '.......KrRRDK....',
  '......KrRRDK.....',
  '.....KsSSDK......',
  '....KsSSDK.......',
  '...KsSSK.........',
  '..KSSSK..........',
  '..KsSK...........',
  '.KsKK............',
  '.KRK.............',
  'KK...............',
];
let _tools = null;
export function tools() {
  if (_tools) return _tools;
  _tools = {
    pencil: paintRows(PENCIL, { K: '#2a1a10', p: '#f08aa0', r: '#d8607a', b: '#d8b040', B: '#a88020', y: '#ffe070', Y: '#f2c230', o: '#c88a18', w: '#f0d0a0', g: '#4a4a52' }),
    pen: paintRows(PEN, { K: '#2a1a10', r: '#ff7a7a', R: '#d8282e', D: '#8a1418', w: '#ffd0d0', s: '#e8e8f0', S: '#a8a8b8' }),
  };
  return _tools;
}

// ------------------------------------------------------------------ gold star sticker (smiling, with a white die-cut rim)
export function starSticker(R = 13) {
  const W = R * 2 + 6, c = canvas(W, W + 1), x = c.getContext('2d');
  const cx = W / 2, cy = W / 2 + 0.5;
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.45 : R; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const inside = (px, py) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  const near = (px, py, d) => { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (Math.abs(dx) + Math.abs(dy) <= d + 0.5 && inside(px + dx, py + dy)) return true; return false; };
  for (let yy = 0; yy < W + 1; yy++) for (let xx = 0; xx < W; xx++) {
    const px = xx + 0.5, py = yy + 0.5;
    if (inside(px, py)) {
      const lit = (xx - cx) * -0.6 + (yy - cy) * -0.8;
      x.fillStyle = lit > R * 0.4 ? '#fff4a0' : lit > 0 ? '#ffd23a' : lit > -R * 0.35 ? '#f4b020' : '#d88a14';
      x.fillRect(xx, yy, 1, 1);
    } else if (near(px, py, 1)) { x.fillStyle = '#8a4a10'; x.fillRect(xx, yy, 1, 1); }
    else if (near(px, py - 1, 2)) { x.fillStyle = '#ffffff'; x.fillRect(xx, yy, 1, 1); }
    else if (near(px - 1, py - 2, 2)) { x.fillStyle = 'rgba(42,26,16,0.35)'; x.fillRect(xx, yy, 1, 1); }
  }
  // face
  const f = (px, py, col, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(Math.round(cx + px), Math.round(cy + py), w, h); };
  f(-4, -2, '#5a2a0a', 2, 3); f(2, -2, '#5a2a0a', 2, 3); f(-4, -2, '#ffffff'); f(2, -2, '#ffffff');
  f(-3, 3, '#5a2a0a'); f(-2, 4, '#5a2a0a', 5, 1); f(3, 3, '#5a2a0a');
  f(-7, 1, '#ff8a8a', 2, 1); f(5, 1, '#ff8a8a', 2, 1);
  f(-1, -R + 4, '#ffffff', 1, 2);
  return c;
}

// ------------------------------------------------------------------ the grade stamp
const STAMP_GLYPHS = {
  A: ['..###..', '.#####.', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##'],
  B: ['######.', '##...##', '##...##', '######.', '######.', '##...##', '##...##', '##...##', '######.'],
  C: ['..#####', '.##...#', '##.....', '##.....', '##.....', '##.....', '##.....', '.##...#', '..#####'],
  D: ['#####..', '##..##.', '##...##', '##...##', '##...##', '##...##', '##...##', '##..##.', '#####..'],
  F: ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '##.....'],
  '+': ['..#..', '..#..', '#####', '..#..', '..#..'],
};
const STAMP_INK = { 'A+': '#c8202a', A: '#c8202a', B: '#c8202a', C: '#c8202a', D: '#c8202a', F: '#c8202a' };
/** a rubber-stamp impression of the grade, already rotated (pixel-rotated, so it stays crisp) */
export function gradeStamp(grade, { rot = -0.2, word } = {}) {
  const ink = STAMP_INK[grade] || '#c8202a';
  const W = 52, H = 46;
  const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  const P = (px, py) => x.fillRect(px, py, 1, 1);
  x.fillStyle = ink;
  // double ring: a rounded box
  const ring = (i, w = 1) => {
    for (let k = 0; k < w; k++) {
      const a = i + k;
      x.fillRect(a + 2, a, W - 4 - a * 2, 1); x.fillRect(a + 2, H - 1 - a, W - 4 - a * 2, 1);
      x.fillRect(a, a + 2, 1, H - 4 - a * 2); x.fillRect(W - 1 - a, a + 2, 1, H - 4 - a * 2);
      P(a + 1, a + 1); P(W - 2 - a, a + 1); P(a + 1, H - 2 - a); P(W - 2 - a, H - 2 - a);
    }
  };
  ring(0, 2); ring(4, 1);
  // the letter: hand-made bold stamp capitals (7x9 cells at 3x), a '+' beside an A
  const G = STAMP_GLYPHS[grade.replace('+', '')] || STAMP_GLYPHS.F;
  const plus = grade.includes('+');
  const K = 3, gw = 7 * K + (plus ? 4 + 5 * K : 0), gh = 9 * K;
  const ox = Math.round((W - gw) / 2), oy = Math.round((H - gh) / 2) - 4;
  G.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) if (r[xx] === '#') x.fillRect(ox + xx * K, oy + yy * K, K, K); });
  if (plus) STAMP_GLYPHS['+'].forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) if (r[xx] === '#') x.fillRect(ox + 7 * K + 4 + xx * K, oy + 2 * K + yy * K, K, K); });
  // a tiny word under it
  const tw = textCanvas(word || (grade === 'F' ? 'SEE ME' : 'POND SCHOOL'), 'tiny', ink);
  x.drawImage(tw.c, Math.round((W - tw.w) / 2), H - 12);
  // rubber texture: knock out specks, heavier on one side (uneven pressure)
  const id = x.getImageData(0, 0, W, H), d = id.data; // (one read, once per stamp)
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const i = (yy * W + xx) * 4;
    if (!d[i + 3]) continue;
    const p = 0.04 + (xx / W) * 0.08 + (hash(xx >> 2, yy >> 2, 3) > 0.85 ? 0.14 : 0);
    if (hash(xx, yy, 9) < p) d[i + 3] = 0;
    else if (hash(xx, yy, 4) < 0.12) { d[i] = Math.min(255, d[i] + 40); d[i + 1] += 30; d[i + 2] += 30; }
  }
  x.putImageData(id, 0, 0);
  return rotatePx(c, rot);
}
/** nearest-neighbour rotation (crisp pixel-art rotate) */
export function rotatePx(src, a) {
  const w = src.width, h = src.height;
  const cs = Math.cos(a), sn = Math.sin(a);
  const W = Math.ceil(Math.abs(w * cs) + Math.abs(h * sn)) + 2, H = Math.ceil(Math.abs(w * sn) + Math.abs(h * cs)) + 2;
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = canvas(W, H), ox = out.getContext('2d'), od = ox.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - W / 2 + 0.5, dy = y - H / 2 + 0.5;
    const sx = Math.floor(dx * cs + dy * sn + w / 2), sy = Math.floor(-dx * sn + dy * cs + h / 2);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const si = (sy * w + sx) * 4, di = (y * W + x) * 4;
    od.data[di] = sd[si]; od.data[di + 1] = sd[si + 1]; od.data[di + 2] = sd[si + 2]; od.data[di + 3] = sd[si + 3];
  }
  ox.putImageData(od, 0, 0);
  return out;
}

// ------------------------------------------------------------------ margin doodles (pencil grey)
export const DOODLES = {
  // a fish in a top hat blowing bubbles (Reynard's pond, by a bored student)
  fishHat: [
    '.........o.....',
    '.....KKK..o....',
    '....KKKKK......',
    '....KKKKK.o....',
    '...KKKKKKK.....',
    '..K..KKK...K...',
    '.K.....KK.KK...',
    'K..O.....KKK...',
    'K.......KK.KK..',
    '.K..k..K....K..',
    '..KKKKK........',
  ],
  // a little bear face, angry eyebrows
  bear: [
    '.KK.....KK.',
    'K..K...K..K',
    'K..KKKKK..K',
    '.KK.....KK.',
    '.K.K...K.K.',
    'K..O...O..K',
    'K....K....K',
    'K...KKK...K',
    '.K..K.K..K.',
    '..KKKKKKK..',
  ],
  // a smiley sun
  sun: [
    '..k..K..k..',
    '...k...k...',
    'k..KKKKK..k',
    '..K.....K..',
    'K.K.O.O.K.K',
    '..K.....K..',
    'k.K.K.K.K.k',
    '..K..K..K..',
    '...KKKKK...',
    '..k..k..k..',
  ],
};
export function doodleCanvas(name, ink = '#6a6a74') {
  return paintRows(DOODLES[name] || DOODLES.fishHat, { K: ink, k: '#9a9aa4', O: ink, o: '#9a9aa4' });
}

// ------------------------------------------------------------------ painted buttons (wood sign + label)
export function signButton(label, { w = 0, accent = '#f2c230', kind = 'wood' } = {}) {
  const t = goofyCanvas(label, '#f6ead0');
  const W = Math.max(w, t.w + 18), H = 16;
  const c = canvas(W, H + 2), x = c.getContext('2d');
  const R = (px, py, ww, hh, col) => { x.fillStyle = col; x.fillRect(px, py, ww, hh); };
  const paper = kind === 'paper';
  // drop shadow
  R(2, 3, W - 3, H - 1, 'rgba(18,10,8,0.45)');
  R(1, 0, W - 2, H, '#1d1410'); R(0, 1, W, H - 2, '#1d1410');
  R(1, 1, W - 2, H - 2, paper ? '#f4ead0' : '#8a5430');
  if (!paper) for (let yy = 3; yy < H - 3; yy++) for (let xx = 2; xx < W - 2; xx++) if (hash(xx >> 2, yy, 7) > 0.8 && hash(xx, yy, 3) > 0.4) R(xx, yy, 1, 1, '#7a4828');
  R(1, 1, W - 2, 1, paper ? '#fffaf0' : '#c98a52'); R(1, 2, 1, H - 4, paper ? '#fffaf0' : '#b47442');
  R(1, H - 2, W - 2, 1, paper ? '#d8c8a0' : '#43240f'); R(W - 2, 2, 1, H - 4, paper ? '#d8c8a0' : '#5e3519');
  R(3, 4, 2, 2, accent); R(4, 5, 1, 1, '#9a6a14');
  const lab = paper ? goofyCanvas(label, '#3a2414') : t;
  if (!paper) x.drawImage(goofyCanvas(label, '#1d1410').c, 10, 5);
  x.drawImage(lab.c, 9, 4);
  return c;
}
