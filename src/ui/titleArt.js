// [v26 menu] Pixel-art painters shared by the title menu, the save boxes and the
// settings page: bitmap-font text, wood planks, nails, arrow planks, signs and the
// moving boxes (open with the save's stuff inside / empty / taped shut).
// Everything paints into small canvases (1 canvas px = 1 art pixel); CSS scales
// them up pixelated.
import { GOOFY_HI, GOOFY_BIG, GOOFY_SMALL, goofyBitmap } from './goofyFont.js';

export const INK = '#2a160c';
export const FONTS = { hi: GOOFY_HI, big: GOOFY_BIG, small: GOOFY_SMALL };
export function h1(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
export function cv(w, h, cls = 'tm-px') { const c = document.createElement('canvas'); c.width = w; c.height = h; c.className = cls; return c; }
export const measure = (font, str) => goofyBitmap(font, str);
/** size a canvas to `s` CSS px per art pixel */
export function scaleEl(c, s) { c.style.width = `${c.width * s}px`; c.style.height = `${c.height * s}px`; return c; }

// text from bitmap glyphs: 1 px ink outline + a drop, two-tone fill
export function text(ctx, font, str, x, y, { fill, shade, ink = INK, split = 0.55, drop = 1, outline = true }) {
  const bm = goofyBitmap(font, str), px = [];
  bm.rows.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '#') px.push(u, v); });
  ctx.fillStyle = ink;
  if (outline) for (let i = 0; i < px.length; i += 2) ctx.fillRect(x + px[i] - 1, y + px[i + 1] - 1, 3, 3 + drop);
  const cut = Math.round(bm.h * split);
  for (let i = 0; i < px.length; i += 2) { ctx.fillStyle = px[i + 1] < cut ? fill : shade ?? fill; ctx.fillRect(x + px[i], y + px[i + 1], 1, 1); }
  return bm;
}

// wood planks with grain, knots and a lit top edge
export const WOOD = {
  plain: undefined,
  green: { base: [78, 140, 74], dark: [52, 100, 54], light: [120, 184, 102] },
  red: { base: [196, 72, 52], dark: [140, 44, 34], light: [236, 120, 86] },
  dark: { base: [96, 58, 36], dark: [70, 40, 26], light: [124, 80, 50] },
  blue: { base: [72, 108, 156], dark: [48, 76, 118], light: [116, 152, 198] },
  gold: { base: [200, 150, 60], dark: [150, 104, 36], light: [238, 198, 104] },
};
export function wood(ctx, x0, y0, w, h, seed, { base = [168, 104, 58], dark = [122, 72, 38], light = [206, 146, 88] } = {}) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = Math.sin((x + seed * 13) * 0.21 + Math.sin(y * 0.9 + seed) * 1.6 + Math.sin(x * 0.05 + seed) * 3);
    let c = base;
    if (g > 0.86) c = dark; else if (g < -0.9 && h1(x * 3 + y * 7 + seed) > 0.4) c = light;
    if (y === 0) c = light;
    if (y === h - 1) c = dark;
    if (h1(x * 1.3 + y * 17.1 + seed) > 0.985) c = dark;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x0 + x, y0 + y, 1, 1);
  }
}
export function nail(ctx, x, y) { ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 4, 4); ctx.fillStyle = '#d8dde6'; ctx.fillRect(x, y, 2, 2); ctx.fillStyle = '#8a909e'; ctx.fillRect(x + 1, y + 1, 1, 1); }
export function outline(g, w, h) { g.fillStyle = INK; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h); }

/** an arrow plank (pointing right, or left with dir: -1); label + optional small second line */
export function arrowPlank(label, sub, { tint = null, seed = 1, dir = 1, minW = 56, icon = null } = {}) {
  const b = measure(GOOFY_BIG, label), s = sub ? measure(GOOFY_SMALL, sub) : null;
  const iw = icon ? icon.width + 3 : 0;
  const W = Math.max(minW, b.w + 24 + iw, s ? s.w + 24 + iw : 0), H = sub ? 21 : 15, tip = Math.ceil(H / 2);
  const c = cv(W, H), g = c.getContext('2d');
  wood(g, 0, 0, W, H, seed, tint || undefined);
  for (let y = 0; y < H; y++) {
    const cut = Math.ceil(Math.abs(y - (H - 1) / 2) / ((H - 1) / 2) * tip);
    if (dir > 0) { g.clearRect(W - cut, y, cut, 1); g.fillStyle = INK; g.fillRect(W - cut - 1, y, 1, 1); }
    else { g.clearRect(0, y, cut, 1); g.fillStyle = INK; g.fillRect(cut, y, 1, 1); }
  }
  g.fillStyle = INK;
  if (dir > 0) { g.fillRect(0, 0, W - tip, 1); g.fillRect(0, H - 1, W - tip, 1); g.fillRect(0, 0, 1, H); nail(g, 3, Math.floor(H / 2) - 1); }
  else { g.fillRect(tip, 0, W - tip, 1); g.fillRect(tip, H - 1, W - tip, 1); g.fillRect(W - 1, 0, 1, H); nail(g, W - 5, Math.floor(H / 2) - 1); }
  const x0 = dir > 0 ? 9 : tip + 4;
  if (icon) g.drawImage(icon, x0, Math.round((H - icon.height) / 2));
  text(g, GOOFY_BIG, label, x0 + iw, sub ? 3 : 4, { fill: '#fff4dc', shade: '#ffd8a0' });
  if (s) text(g, GOOFY_SMALL, sub, x0 + iw + 1, 14, { fill: '#ffe2a8', shade: '#ffe2a8', drop: 0 });
  return c;
}

/** a hanging board with big caps (logo-style), optional bite out of a corner */
export function board(lines, { font = GOOFY_HI, pad = 11, seed = 3, bite = false, colors = [['#ffe08a', '#ffb84a'], ['#ffc070', '#ff8a3a']] } = {}) {
  const bms = lines.map((l) => measure(font, l));
  const W = Math.max(...bms.map((b) => b.w)) + pad * 2, H = bms.reduce((a, b) => a + b.h, 0) + (lines.length - 1) * 2 + 16;
  const c = cv(W, H), g = c.getContext('2d');
  const n = Math.max(2, Math.min(3, Math.round(H / 14)));
  const ph = Math.floor(H / n);
  for (let i = 0; i < n; i++) { const y = i * ph, h = i === n - 1 ? H - y : ph; wood(g, 0, y, W, h, i * 5 + seed); if (i) { g.fillStyle = INK; g.fillRect(1, y, W - 2, 1); } }
  outline(g, W, H);
  g.fillStyle = 'rgba(255,230,180,0.35)'; g.fillRect(1, 1, W - 2, 1);
  if (bite) {
    const bites = [[W - 4, H - 1, 5], [W - 1, H - 7, 4.5], [W - 10, H + 1, 3.6]];
    for (let yy = 0; yy < H; yy++) for (let xx = W - 22; xx < W; xx++) {
      let inB = false, edge = false;
      for (const [bx, by, r] of bites) { const d = Math.hypot(xx - bx, yy - by); if (d < r) inB = true; else if (d < r + 1.2) edge = true; }
      if (inB) g.clearRect(xx, yy, 1, 1); else if (edge) { g.fillStyle = INK; g.fillRect(xx, yy, 1, 1); }
    }
    g.fillStyle = INK; g.fillRect(W - 16, H - 3, 1, 2); g.fillRect(W - 6, H - 13, 2, 1);
  }
  nail(g, 9, 4); nail(g, W - 12, 4);
  let y = 8;
  bms.forEach((b, i) => {
    const [f, s] = colors[i % colors.length];
    text(g, font, lines[i], Math.round((W - b.w) / 2) + (i % 2), y, { fill: f, shade: s });
    y += b.h + 2;
  });
  return c;
}

// ------------------------------------------------------------------ the moving box
// 3/4 view: front face, right side, the top opening and four flaps.
export const BOX_W = 84, BOX_H = 76;
const OX = 8; // left margin (the left flap swings out past the front face)
const F = { x0: OX + 4, x1: OX + 50, y0: 41, y1: 71 }; // front face
const D = { x: 12, y: -9 }; // depth offset of the back edge
const CB = {
  front: '#c99558', frontL: '#dcaa6c', frontD: '#b48047', side: '#a06c3c', sideD: '#8a5a30',
  in: '#5e3c20', inBack: '#74502c', inD: '#4a2e18', flap: '#d6a666', flapIn: '#e2bc84', flapD: '#b98a50',
  tape: '#e7c37c', tapeL: '#f6dda4', tapeD: '#c99e58', marker: '#231512', print: '#7a4e2a',
};
function poly(g, pts, color) {
  // scanline fill of a convex polygon on the pixel grid
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  g.fillStyle = color;
  for (let y = Math.floor(minY); y < Math.ceil(maxY); y++) {
    const yc = y + 0.5;
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      if ((yc >= y1 && yc < y2) || (yc >= y2 && yc < y1)) { const x = x1 + (yc - y1) / (y2 - y1) * (x2 - x1); a = Math.min(a, x); b = Math.max(b, x); }
    }
    if (b > a) g.fillRect(Math.round(a), y, Math.round(b) - Math.round(a), 1);
  }
}
function line(g, x0, y0, x1, y1, color) {
  g.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
}
function polyInk(g, pts, fill) { poly(g, pts, fill); for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c2, d] = pts[(i + 1) % pts.length]; line(g, a, b, c2, d, INK); } }
function speckle(g, x0, y0, w, h, color, seed, p = 0.06) {
  g.fillStyle = color;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (h1(x * 7.1 + y * 3.3 + seed) < p) g.fillRect(x, y, 1, 1);
}

// item sprites: rows of palette letters, origin = bottom centre
export const IP = {
  k: INK, w: '#ffffff', W: '#e8e0d0', b: '#6aa6d0', B: '#3c6c96', o: '#f09a3a', O: '#c86a1e',
  y: '#ffd84a', Y: '#fff3a0', g: '#d08a1c', G: '#5cd24c', n: '#2a8a3a', N: '#b8f29a',
  r: '#dc3a30', R: '#a01e2c', p: '#f2e2b8', P: '#d8bf88', s: '#a8b0bc', S: '#6c7482', t: '#8a5a2a', T: '#5e3a1a',
  e: '#f4f0e0', E: '#c8bfa4', c: '#ff8a3a', v: '#7a3ea0', V: '#c08ae0', m: '#5ab0ff',
};
export const ITEMS = {
  fish: ['...kkk...', '..kbbbk..', '.kbwkbbk.', '.kbbbbbk.', 'kbbBbbbbk', 'kbBBbbBbk', 'kbbBbbBbk', 'kbbbBBbbk', '.kboobbk.', '.kbOobbk.', '..kbbbk..', '..kbbbk..', '...kbk...', '..kbbbk..', '.kbbkbbk.', '.kkk.kkk.'],
  goldfish: ['...kkk...', '..kyyyk..', '.kywkyyk.', '.kyyyyyk.', 'kyyoyyyyk', 'kyooyyoyk', 'kyyoyyoyk', 'kyyyooyyk', '.kyYYyyk.', '.kyYYyyk.', '..kyyyk..', '..kyyyk..', '...kyk...', '..kyyyk..', '.kyykyyk.', '.kkk.kkk.'],
  tie: ['.kkkkk.', '.kRrRk.', '..kRk..', '.krrrk.', '.kRrrk.', 'krrRrrk', 'krrrRrk', 'krrrrRk', 'kRrrrrk', '.krrRk.', '..krk..', '...k...'],
  flask: ['..kkkkk..', '...kwk...', '...kwk...', '...kwk...', '..kwNwk..', '.kwwwwwk.', '.kGNGGGk.', 'kGGGGGNGk', 'kGNGGGGGk', 'kGGGGnGGk', 'knGGGGGnk', '.kkkkkkk.'],
  beaverhat: ['....kkkk....', '..kkyYYYkk..', '.kyyyyYYYyk.', '.kyykyyyyyk.', '.kyykyyyyyk.', 'kkkkkkkkkkkk', 'kggggggggggk', '.kkkkkkkkkk.'],
  map: ['.kkkkkkkkkkkk.', 'kPppppppppppPk', 'kPpkkpppprpppk', 'kPpppkpprrrppk', 'kPppppkpprpppk', 'kPpppppkpppppk', 'kPppppppppppPk', '.kkkkkkkkkkkk.'],
  egg: ['..kkk..', '.keeek.', 'keeEeek', 'keEeeek', 'keeeeEk', 'kEeeeek', 'keeEeek', '.kEeek.', '..kkk..'],
  carrot: ['.k.k.k.', 'kGknkGk', '.kGnGk.', '..kGk..', '.kcckk.', '.kcOck.', '.kccck.', '..kcOk.', '..kcck.', '..kcck.', '...kck.', '...kOk.', '...kk..', '....k..'],
  pickaxe: ['..kkkkkkk....', '.kssssssskk..', 'kSkkkksssssk.', 'kk...kTksSsk.', '.....kTk.kSk.', '....kTk...kk.', '....kTk......', '...kTk.......', '...kTk.......', '..kTk........', '..kTk........', '.kTk.........', '.kk..........'],
  gear: ['....kkk....', '.kk.ksk.kk.', '.kskksskssk', '..kssssssk.', 'kkssskssskk', 'ksssk.kssSk', 'kkssskssSkk', '..kssSSSk..', '.ksskSSkSk.', '.kk.kSk.kk.', '....kkk....'],
  trophy: ['kkkkkkkkkkk', 'kyYYyyyyygk', 'kykYyyyygkk', 'kkyYyyyygkk', '.kyyyyyygk.', '..kyyyyyk..', '...kyygk...', '....kgk....', '....kyk....', '...kyyyk...', '..kgggggk..', '..kkkkkkk..'],
  crown: ['k...k...k...k', 'kk.kyk.kyk.kk', 'kykyYykyYykyk', 'kyyyyyyyyyyyk', 'kyrryymyyrryk', 'kyyyyyyyyyyyk', 'kgggggggggggk', 'kkkkkkkkkkkkk'],
  coin: ['.kkk.', 'kYyyk', 'kyyyk', 'kgggk', '.kkk.'],
};
function sprite(g, rows, cx, by) {
  const w = rows[0].length, h = rows.length, x0 = Math.round(cx - w / 2), y0 = by - h;
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = IP[row[x]]; if (col) { g.fillStyle = col; g.fillRect(x0 + x, y0 + y, 1, 1); } } });
}
function coinPile(g, cx, by, n) {
  // rows of coins, widest at the bottom
  const rows = n >= 3 ? [5, 4, 4, 3, 2, 1] : n === 2 ? [4, 3, 2, 1] : [2, 1];
  rows.forEach((cnt, r) => {
    for (let i = 0; i < cnt; i++) sprite(g, ITEMS.coin, cx + (i - (cnt - 1) / 2) * 4 + (r % 2), by - r * 3);
  });
}
// where each thing sits in the box (x = centre, y = bottom; the front face hides what's below y 38)
const SPOTS = {
  carrot: [OX + 8, 43, 'back'], fish: [OX + 17, 44, 'back'], trophy: [OX + 27, 42, 'back'], flask: [OX + 37, 42, 'back'],
  goldfish: [OX + 49, 41, 'back'], pickaxe: [OX + 58, 40, 'back'], map: [OX + 57, 37, 'back'],
  beaverhat: [OX + 20, 43, 'mid'], coins: [OX + 34, 45, 'mid'], egg: [OX + 45, 44, 'mid'], gear: [OX + 53, 45, 'mid'], crown: [OX + 34, 0, 'top'],
  tie: [OX + 8, 0, 'over'],
};
const PILE_H = { 1: 8, 2: 14, 3: 20 };

/** paint a box. state: 'open' | 'empty' | 'closed'. items from saveSlots.boxItems(). label e.g. 'SAVE 1' */
export function paintBox(c, { state = 'open', items = [], label = 'SAVE 1', seed = 1 } = {}) {
  c.width = BOX_W; c.height = BOX_H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, BOX_W, BOX_H);
  const { x0, x1, y0, y1 } = F;
  const bx0 = x0 + D.x, bx1 = x1 + D.x, by0 = y0 + D.y; // back top edge
  // ground shadow
  g.fillStyle = 'rgba(30,10,30,0.35)';
  poly(g, [[x0 - 2, y1 + 1], [x1 + D.x + 4, y1 + 1 + D.y], [x1 + D.x + 6, y1 + 4 + D.y], [x0 + 2, y1 + 5]], 'rgba(30,10,30,0.35)');
  const closed = state === 'closed';
  if (!closed) {
    // back flap: stands up behind, leaning back a little (we see its unprinted inner side)
    polyInk(g, [[bx0, by0], [bx1, by0], [bx1 + 5, by0 - 9], [bx0 + 5, by0 - 9]], CB.flapIn);
    speckle(g, bx0 + 3, by0 - 8, bx1 - bx0 - 2, 7, CB.flap, seed * 3 + 1, 0.08);
    line(g, bx0 + 1, by0 - 1, bx1, by0 - 1, CB.flapD);
    // the inside: back wall + left wall in shadow
    poly(g, [[x0, y0], [x1, y0], [bx1, by0], [bx0, by0]], CB.in);
    poly(g, [[bx0, by0], [bx1, by0], [bx1, by0 + 6], [bx0, by0 + 6]], CB.inBack);
    poly(g, [[x0, y0], [bx0, by0], [bx0, by0 + 7], [x0 + 3, y0]], CB.inD);
    if (state === 'empty') {
      // a dust bunny and a cobweb in the back corner
      g.fillStyle = '#9a8a80'; g.fillRect(bx0 + 30, by0 + 4, 3, 1); g.fillRect(bx0 + 31, by0 + 3, 2, 1);
      line(g, bx1 - 1, by0, bx1 - 7, by0 + 5, 'rgba(240,230,255,0.5)');
      line(g, bx1 - 1, by0 + 3, bx1 - 5, by0, 'rgba(240,230,255,0.4)');
    }
    // the stuff: back row, then middle, then whatever sits on top
    for (const layer of ['back', 'mid', 'top']) {
      for (const id of items) {
        const key = id.startsWith('coins') ? 'coins' : id;
        const sp = SPOTS[key];
        if (!sp || sp[2] !== layer) continue;
        if (key === 'coins') coinPile(g, sp[0], sp[1], +id.slice(5) || 1);
        else if (key === 'crown') { const pile = items.find((i) => i.startsWith('coins')); sprite(g, ITEMS.crown, sp[0], SPOTS.coins[1] - (PILE_H[+pile?.slice(5) || 1] || 8) + 3); }
        else if (ITEMS[key]) sprite(g, ITEMS[key], sp[0], sp[1]);
      }
    }
    // left + right flaps splayed outwards
    polyInk(g, [[x0, y0], [bx0, by0], [bx0 - 10, by0 - 6], [x0 - 9, y0 - 3]], CB.flap);
    line(g, x0 - 7, y0 - 3, bx0 - 9, by0 - 5, CB.flapIn);
    polyInk(g, [[x1, y0], [bx1, by0], [bx1 + 7, by0 - 9], [x1 + 8, y0 - 8]], CB.flapD);
    line(g, x1 + 2, y0 - 2, bx1 + 1, by0 - 3, CB.flap);
  } else {
    // closed: two top flaps meeting in a seam, taped across
    polyInk(g, [[x0, y0], [x1, y0], [bx1, by0], [bx0, by0]], CB.flap);
    line(g, x0 + Math.round(D.x / 2), y0 + Math.round(D.y / 2), x1 + Math.round(D.x / 2), y0 + Math.round(D.y / 2), CB.flapD);
    poly(g, [[x0 + 20, y0], [x0 + 26, y0], [bx0 + 26, by0], [bx0 + 20, by0]], CB.tape);
    line(g, x0 + 21, y0 - 1, bx0 + 21, by0 + 1, CB.tapeL);
  }
  // right side face
  polyInk(g, [[x1, y0], [bx1, by0], [bx1, y1 + D.y], [x1, y1]], CB.side);
  speckle(g, x1 + 1, by0 + 2, D.x - 1, y1 - y0, CB.sideD, seed * 5 + 2, 0.07);
  // "this side up" arrows printed on the side
  g.fillStyle = CB.sideD;
  for (const ax of [x1 + 4, x1 + 9]) { const ay = y0 + 6 - Math.round((ax - x1) * 0.55); g.fillRect(ax, ay, 1, 6); g.fillRect(ax - 1, ay + 1, 3, 1); g.fillRect(ax - 2, ay + 2, 5, 1); }
  // front face
  polyInk(g, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], CB.front);
  speckle(g, x0 + 1, y0 + 1, x1 - x0 - 1, y1 - y0 - 1, CB.frontD, seed * 7 + 3, 0.05);
  line(g, x0 + 1, y1 - 1, x1 - 1, y1 - 1, CB.frontD);
  line(g, x0 + 1, y0 + 1, x0 + 1, y1 - 1, CB.frontL);
  if (!closed) {
    // front flap folded down over the front, with the tape still on it
    polyInk(g, [[x0, y0], [x1, y0], [x1 + 1, y0 + 8], [x0 - 1, y0 + 8]], CB.flap);
    line(g, x0 + 1, y0 + 1, x1 - 1, y0 + 1, CB.frontL);
    line(g, x0, y0 + 7, x1, y0 + 7, CB.flapD);
    const tx = x0 + 20;
    poly(g, [[tx, y0 + 1], [tx + 6, y0 + 1], [tx + 6, y0 + 11], [tx, y0 + 11]], CB.tape);
    line(g, tx + 1, y0 + 1, tx + 1, y0 + 10, CB.tapeL);
    // ragged torn tape end
    g.fillStyle = CB.tapeD; g.fillRect(tx, y0 + 11, 2, 1); g.fillRect(tx + 3, y0 + 11, 1, 1); g.fillRect(tx + 4, y0 + 12, 2, 1);
  } else {
    // tape running down the front
    poly(g, [[x0 + 20, y0], [x0 + 26, y0], [x0 + 26, y0 + 9], [x0 + 20, y0 + 9]], CB.tape);
    line(g, x0 + 21, y0, x0 + 21, y0 + 8, CB.tapeL);
  }
  // a tie draped over the front edge
  if (items.includes('tie') && !closed) sprite(g, ITEMS.tie, SPOTS.tie[0] + 2, y0 + 11);
  // marker label, scribbled
  const lb = measure(GOOFY_SMALL, label);
  const lx = x0 + Math.round((x1 - x0 - lb.w) / 2) + 1, ly = y0 + (closed ? 12 : 14);
  text(g, GOOFY_SMALL, label, lx, ly, { fill: CB.marker, shade: CB.marker, outline: false, drop: 0 });
  line(g, lx - 1, ly + lb.h + 1, lx + lb.w, ly + lb.h + 2, CB.marker); // underline swoosh
  return c;
}

/** a tiny pixel coin (for tags) */
export function coinIcon() {
  const c = cv(7, 7), g = c.getContext('2d');
  const rows = ['.kkkkk.', 'kYyyyyk', 'kyYgyyk', 'kyygyyk', 'kyyyygk', 'kggggk.', '.kkkk..'];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const col = IP[r[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
  return c;
}
