// [v33 paper] Pixel art for the physical clipboard (Clipboard.js), in the game's own palettes
// (frames.js wood / brass / gold / green / red, the old staff UI's bars and diamond pips):
// the pressed-board backing, the brass spring clip, sticky index tabs, the dog-eared page
// corner, printed tick boxes + pencil ticks, little bars, rating pips, the sheet stack and
// the dithered backdrop. The pencil, coffee ring, tape and stamps are the game's existing
// paper.js art (see Clipboard.js). All painters return a Pix (art pixels).
import { Pix, hexc, ramp, bay, noise, fbm, rng, clamp } from './pix.js';
import { pxTextBuf } from '../kinetic/pxfont.js';

export const INK = hexc('#21160f');
export const PRINT = hexc('#33405f'); // printed form ink (blue-black)
export const PRINT_LT = hexc('#8d9cc0'); // printed rules
export const GRAPHITE = '#4a4858';
export const GRAPHITE_LT = '#8a8698';
const STEEL = ramp(['#2a1a0c', '#5c4219', '#8d6c32', '#b8924c', '#dcbd72', '#f6e6ac', '#fffbe0']); // brass (frames.js PAL.brass)
// the game's wood palette (frames.js PAL.wood: the toolbar frame and the old staff clipboard)
const BOARD = ramp(['#2a180c', '#3b2414', '#55331a', '#6b4220', '#7a4d24', '#8b5a2b', '#a86d38', '#c98f55', '#dcae74']);
export const PAPER_BACK = ramp(['#b7a57c', '#cdbd95', '#dccdaa', '#e9dcbe', '#f4ead3', '#fcf6e8']);

// text -> Pix through the bitmap pixel fonts (src/ui/kinetic/pxfont.js)
export function textPix(text, o = {}) {
  const b = pxTextBuf(text, o);
  const p = new Pix(b.w, b.h);
  p.d.set(b.bytes);
  return p;
}

// ---------------------------------------------------------------- rounded-rect helpers
function inRR(x, y, w, h, r) {
  const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (w - r)), dy = Math.max(r - y - 0.5, 0, y + 0.5 - (h - r));
  return dx * dx + dy * dy <= r * r + 0.25;
}
// distance (px) from the inside of a rounded rect to its edge
function edgeDist(x, y, w, h, r) {
  const cx = x + 0.5, cy = y + 0.5;
  const dx = Math.max(r - cx, 0, cx - (w - r)), dy = Math.max(r - cy, 0, cy - (h - r));
  if (dx > 0 && dy > 0) return r - Math.hypot(dx, dy);
  return Math.min(cx, cy, w - cx, h - cy);
}

// ================================================================ the pressed-board backing
// w x h art px; returns { pix, sh } (the canvas is bigger by the drop shadow)
export function paintBoard(w, h, { seed = 3 } = {}) {
  const SH = 3, p = new Pix(w + SH, h + SH), R = 8, r = rng(seed);
  // hard dithered drop shadow
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inRR(x, y, w, h, R)) continue;
    const X = x + SH - 1, Y = y + SH;
    if (((X + Y) & 1) === 0) p.set(X, Y, hexc('#120a06'), 150);
  }
  const fib = new Float32Array(w * h);
  // pressed fibres: short horizontal streaks, darker and lighter
  for (let k = 0; k < (w * h) / 26; k++) {
    const x = (r() * w) | 0, y = (r() * h) | 0, L = 2 + ((r() * 5) | 0), v = r() < 0.6 ? -0.7 : 0.55;
    for (let i = 0; i < L; i++) if (x + i < w) fib[y * w + x + i] += v * (i === 0 || i === L - 1 ? 0.6 : 1);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inRR(x, y, w, h, R)) continue;
    const e = edgeDist(x, y, w, h, R);
    let v = 4.2 + (fbm(x, y, 26, seed) - 0.5) * 1.8 + (fbm(x * 1.6, y * 0.5, 6, seed + 5) - 0.5) * 1.1 + fib[y * w + x];
    // a waxy sheen band across the upper left
    const u = x / w * 0.85 + y / h * 0.55;
    v += 1.15 * Math.max(0, 1 - Math.abs(u - 0.32) / 0.13) + 0.5 * Math.max(0, 1 - Math.abs(u - 0.47) / 0.05);
    let c;
    if (e < 1) c = INK;
    else if (e < 3.2) {
      // the cut edge: rough, lighter on the top/left, darker on the bottom/right
      const tl = x + 0.5 < R + 2 || y + 0.5 < R + 2 ? (x / w + y / h < 1 ? 1 : 0) : (x < w / 2 && x + 0.5 < 3.2) || (y < h / 2 && y + 0.5 < 3.2) ? 1 : 0;
      const tone = tl ? 7.2 - (e - 1) * 0.8 : 3.2 - (e - 1) * 0.5;
      c = BOARD[clamp(Math.floor(tone + (noise(x, y, seed) - 0.5) * 1.4 + bay(x, y) * 0.6), 0, 8)];
    } else if (e < 4.2) c = BOARD[clamp(Math.floor(v - 1.4 + bay(x, y)), 0, 8)];
    else c = BOARD[clamp(Math.floor(v + bay(x, y) - 0.5), 0, 8)];
    p.set(x, y, c);
  }
  // dents and scratches: an engraved dark line with a lit lip below
  for (let k = 0; k < 9; k++) {
    let x = 10 + r() * (w - 20), y = 10 + r() * (h - 20);
    const a = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI), L = 3 + r() * 9;
    for (let i = 0; i < L; i++) {
      const X = Math.round(x), Y = Math.round(y);
      p.set(X, Y, BOARD[2]); p.set(X, Y + 1, BOARD[7]);
      x += Math.cos(a); y += Math.sin(a) * 0.5;
    }
  }
  // a little round dent cluster bottom right (the clipboard's been dropped)
  const dx0 = w - 24, dy0 = h - 10;
  for (const [ox, oy] of [[0, 0], [3, 1], [1, 2]]) { p.set(dx0 + ox, dy0 + oy, BOARD[2]); p.set(dx0 + ox + 1, dy0 + oy, BOARD[7]); }
  return { pix: p, sh: SH };
}

// ================================================================ the steel spring clip
// classic lever clip: riveted base plate, spring barrel, wire lever loop, pressing jaw.
// open = lever pressed, jaw lifted off the paper.
export function paintClip(open = false) {
  const W = 104, H = 32, p = new Pix(W, H);
  const S = (i) => STEEL[clamp(i, 0, 6)];
  // wire lever loop (2 px thick)
  const lw = 40, ly0 = open ? 5 : 0, lh = open ? 6 : 11, lx0 = Math.round((W - lw) / 2);
  for (let y = ly0; y < ly0 + lh; y++) for (let x = lx0; x < lx0 + lw; x++) {
    const X = x - lx0, Y = y - ly0;
    if (!inRR(X, Y, lw, lh, 4) || inRR(X - 2, Y - 2, lw - 4, lh - 4, 3)) continue;
    const top = Y < 2, lft = X < 3;
    p.set(x, y, S(top ? (X > lw * 0.25 && X < lw * 0.55 ? 6 : 5) : lft ? 4 : Y > lh - 3 ? 2 : 3));
  }
  // base plate riveted to the board
  const by0 = 9, bh = 10;
  for (let y = by0; y < by0 + bh; y++) for (let x = 3; x < W - 3; x++) {
    if (!inRR(x - 3, y - by0, W - 6, bh, 3)) continue;
    const Y = y - by0;
    let t = Y === 0 ? 6 : Y < 3 ? 5 : Y < 6 ? 4 : Y < 8 ? 3 : 2;
    if (Y === 2 || Y === 5) t -= bay(x, y) < 0.5 ? 1 : 0; // dithered band edges
    if (Y >= 1 && Y <= 2 && ((x * 7) % 23 === 0)) t = 6; // brushed glints
    p.set(x, y, S(t));
  }
  // rivets: little domes with a hot spot
  const RIV = ['.bc.', 'bdec', 'cedb', '.bb.'];
  for (const rx of [9, W - 13]) RIV.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    p.set(rx + i, by0 + 3 + j, S({ b: 2, c: 3, d: 6, e: 4 }[ch]));
  }));
  // spring barrel: a rolled cylinder
  const BAR = [2, 4, 6, 5, 3, 1];
  for (let j = 0; j < 6; j++) for (let x = 13; x < W - 13; x++) {
    let t = BAR[j];
    if ((x - 13) % 9 === 0) t -= 1; // coil turns
    p.set(x, by0 + 7 + j, S(t));
  }
  for (let j = 0; j < 6; j++) { p.set(12, by0 + 7 + j, S(1)); p.set(W - 13, by0 + 7 + j, S(1)); }
  // the jaw pressing on the paper, with stamped grooves and a curled lip
  const jy0 = open ? 15 : 17, jh = open ? 7 : 11;
  for (let y = jy0; y < jy0 + jh; y++) for (let x = 5; x < W - 5; x++) {
    const X = x - 5, Y = y - jy0, jw = W - 10;
    // trapezoid: narrows a little toward the lip, rounded lower corners
    const ins = Math.max(0, Y - (jh - 4));
    if (X < ins || X >= jw - ins) continue;
    if (!inRR(X, Y, jw, jh, 3) && Y > 2) continue;
    let t = Y === 0 ? 1 : Y < 3 ? 5 : Y < jh - 3 ? 4 : Y === jh - 3 ? 6 : Y === jh - 2 ? 3 : 2;
    if (Y === 4 && X > 6 && X < jw - 6) t = 2; // groove
    if (Y === 5 && X > 6 && X < jw - 6) t = 6;
    if (t === 4 && bay(x, y) < 0.18) t = 3;
    p.set(x, y, S(t));
  }
  // an embossed maker's mark on the jaw
  if (!open) {
    const mark = textPix('FOXCO', { font: 'tiny', color: '#5c4219' });
    for (let y = 0; y < mark.h; y++) for (let x = 0; x < mark.w; x++) if (mark.a(x, y)) {
      const X = Math.round(W / 2 - mark.w / 2) + x, Y = jy0 + 6 + y - 2;
      if (Y < jy0 + jh - 3) { p.set(X, Y, S(2)); if (!mark.a(x, y + 1)) p.set(X, Y + 1, S(6)); }
    }
  }
  p.outline(hexc('#2a1a0c'));
  // dithered shadow the jaw throws on the paper
  const sy = jy0 + jh + 1;
  for (let y = sy; y < sy + (open ? 3 : 2); y++) for (let x = 8; x < W - 6; x++) if (((x + y) & 1) === 0 && !p.a(x, y)) p.set(x, y, hexc('#2a1c10'), open ? 70 : 120);
  return p;
}

// ================================================================ sticky index tab
export const TAB_COLORS = {
  yellow: ramp(['#b0661a', '#e5a320', '#ffd23f', '#fff3a3', '#fffbe0']), // frames.js PAL.gold
  orange: ramp(['#7a2c0c', '#c95a1e', '#f08838', '#ffb066', '#ffd8a8']),
  pink: ramp(['#7a1a3a', '#c2416a', '#ec7398', '#ffa2be', '#ffd4e2']),
  green: ramp(['#255a3c', '#2f6f4a', '#3f8f5f', '#6cc08a', '#aee6b0']), // frames.js PAL.green
  blue: ramp(['#173a6a', '#2e64b0', '#4c90dc', '#84bcf2', '#c4e2ff']),
  violet: ramp(['#3a1f68', '#6640a8', '#8f6ad6', '#b89cf0', '#e2d4ff']),
  red: ramp(['#80202e', '#b0303a', '#d9453b', '#f07a52', '#ffc9a0']), // frames.js PAL.red
  teal: ramp(['#0e4848', '#1f8484', '#3cb4aa', '#78d8c8', '#c0f2e8']),
};
export function paintTab(label, color = 'yellow', { w = 46, h = 13, on = false, hover = false } = {}) {
  const C = TAB_COLORS[color] || TAB_COLORS.yellow;
  const p = new Pix(w, h + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // flat left end (stuck under the sheet), rounded right end
    if (x > w - 5 && !inRR(x - (w - 10), y, 10, h, 4)) continue;
    let t = y === 0 ? 4 : y < 3 ? 3 : y < h - 3 ? 2 : y < h - 1 ? 1 : 0;
    if (y === 1 && x > w - 12 && x < w - 5) t = 4; // plastic glint
    if (x < 7) t = Math.max(0, t - 1); // glue strip, under the sheet's edge
    if (t === 2 && bay(x, y) < 0.12) t = 3;
    p.set(x, y, C[t]);
  }
  p.outline(INK);
  // shadow under the lip
  for (let x = 1; x < w - 3; x++) if (!p.a(x, h) && ((x & 1) === 0)) p.set(x, h, hexc('#1a0f08'), 110);
  if (label) {
    const t = textPix(label, { font: 'tiny', color: on ? '#21160f' : '#2e2016' });
    const ox = 12, oy = Math.round((h - 7) / 2) - 1; // clear of the sheet's edge
    p.blit(t, ox, oy);
  }
  void hover;
  return p;
}

// ================================================================ dog-eared corner (c x c, bottom right of a sheet)
export function paintDogEar(c = 12, { under = '#d6c59c', flip = false } = {}) {
  const p = new Pix(c + 1, c + 1);
  const U = hexc(under), Ud = hexc('#b9a57a');
  for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) {
    const X = flip ? c - 1 - x : x;
    const s = X + y - (c - 1); // >0: under the corner (next sheet shows), <0: the flap
    if (s > 0) {
      // the sheet below, shaded where the flap's shadow falls; its own edge outlined
      const edge = y === c - 1 || X === c - 1;
      p.set(x, y, edge ? hexc('#6a5636') : s < 3 && ((x + y) & 1) === 0 ? Ud : U);
      continue;
    }
    if (s === 0) { p.set(x, y, INK); continue; }
    // the flap (back of the paper): lit near the fold, darker toward the tip
    const d = -s;
    let t = d < 2 ? 5 : d < 4 ? 4 : d < c * 0.7 ? 3 : 2;
    if (t === 3 && bay(x, y) < 0.3) t = 2;
    p.set(x, y, PAPER_BACK[t]);
    if (y === 0 || X === 0) p.set(x, y, INK);
  }
  return p;
}

// ================================================================ printed tick box + pencil tick
export const TICK_PATH = [[2, 6], [3, 7], [4, 8], [5, 9], [6, 8], [7, 7], [8, 5], [9, 4], [10, 2], [11, 1], [12, 0]];
// box 9x9 at (1, 2) inside a 14 x 12 canvas so the tick can overshoot
export function paintTickBox({ ticks = 0, cross = false, color = GRAPHITE, dim = false } = {}) {
  const p = new Pix(14, 12);
  const pr = dim ? hexc('#a7b0c8') : PRINT;
  for (let i = 0; i < 9; i++) { p.set(1 + i, 2, pr); p.set(1 + i, 10, pr); p.set(1, 2 + i, pr); p.set(9, 2 + i, pr); }
  if (cross) { for (let i = 0; i < 5; i++) { p.set(3 + i, 4 + i, hexc('#a7b0c8')); p.set(7 - i, 4 + i, hexc('#a7b0c8')); } }
  const g = hexc(color), gl = hexc(GRAPHITE_LT);
  const n = Math.min(TICK_PATH.length, ticks === true ? TICK_PATH.length : ticks | 0);
  for (let i = 0; i < n; i++) {
    const [x, y] = TICK_PATH[i];
    p.set(x, y, g);
    if (i < 4) p.set(x, y - 1, i % 2 ? gl : g); // heavier down-stroke
    else if (i < 7 && i % 2 === 0) p.set(x + 1, y, gl);
  }
  return p;
}

// ================================================================ a little bar (the old staff bars: mood pink, energy green, xp gold)
const BARS = { red: ['#f08aa8', '#ffc2d2'], green: ['#6cc08a', '#aee6b0'], gold: ['#ffd23f', '#fff3a3'], blue: ['#6aa8e0', '#b4d6f6'], grey: ['#9a9aa0', '#c4c4c8'] };
export function paintGauge(v, color = 'green', { w = 36, h = 6, seed = 1 } = {}) {
  void seed;
  const p = new Pix(w, h);
  const [c0, c1] = (BARS[color] || BARS.grey).map(hexc), track = hexc('#3a2a1c'), ol = hexc('#2a1a14');
  const fill = Math.round(clamp(v, 0, 100) / 100 * (w - 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { p.set(x, y, ol); continue; }
    p.set(x, y, x - 1 < fill ? (y === 1 ? c1 : c0) : track);
  }
  return p;
}

// ================================================================ the sheets under the top page (edges peek out)
export function paintStack(w, h, n = 3) {
  const p = new Pix(w + 5, h + 6);
  const tones = ramp(['#e9dcbc', '#ded0ad', '#d2c29d']);
  for (let i = Math.min(3, n); i >= 1; i--) {
    const ox = i === 3 ? 4 : i === 2 ? 2 : 1, oy = i === 3 ? 5 : i === 2 ? 3 : 2;
    for (let y = oy; y < h + oy; y++) for (let x = ox; x < w + ox; x++) {
      const edge = x === ox || y === oy || x === w + ox - 1 || y === h + oy - 1;
      p.set(x, y, edge ? hexc('#6a5636') : tones[i - 1]);
    }
  }
  return p;
}

// ================================================================ dithered backdrop tile
export function paintDim() {
  const p = new Pix(4, 4), c = hexc('#120a12');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) p.set(x, y, c, bay(x, y) < 0.5 ? 175 : 70);
  return p;
}

// ================================================================ rating pips (the old staff diamonds: gold on, cream off)
export function paintPips(n, max = 5, { hi = false } = {}) {
  const p = new Pix(max * 7, 7);
  const ON = hexc('#e5a320'), ONL = hexc('#ffd23f'), ONB = hexc('#7a4a12'), OFF = hexc('#f6ecd0'), OFFB = hexc('#6b4220'), Y = hexc('#fff0a8');
  const D = ['..b..', '.bfb.', 'bfffb', '.bfb.', '..b..'];
  for (let i = 0; i < max; i++) {
    const ox = i * 7 + 1, on = i < n;
    if (hi && on) for (let y = 0; y < 7; y++) for (let x = -1; x < 6; x++) if (bay(ox + x, y) < 0.6) p.set(ox + x, y, Y, 200);
    D.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      p.set(ox + x, 1 + y, ch === 'b' ? (on ? ONB : OFFB) : on ? (y === 1 ? ONL : ON) : OFF);
    }));
  }
  return p;
}

// ================================================================ highlighter swipe (a marker band, dithered)
export function paintHighlight(w = 8, h = 8, color = '#fff07a') {
  const p = new Pix(w, h), C = hexc(color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bay(x, y) < 0.62) p.set(x, y, C, 170);
  return p;
}
