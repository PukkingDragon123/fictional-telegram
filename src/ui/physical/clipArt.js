// [v33 paper] Hand-placed pixel art for the physical clipboard (Clipboard.js) and other
// paper objects: the pressed-board backing, the steel spring clip, sticky index tabs,
// the dog-eared page corner, a pencil (lying and writing), printed tick boxes and
// pencil ticks, colored-pencil gauges, worn rubber stamps, coffee rings, tape, the
// sheet stack and the dithered backdrop. All painters return a Pix (art pixels).
import { Pix, hexc, ramp, bay, noise, fbm, rng, clamp, rotNN } from './pix.js';
import { pxTextBuf } from '../kinetic/pxfont.js';

export const INK = hexc('#21160f');
export const PRINT = hexc('#33405f'); // printed form ink (blue-black)
export const PRINT_LT = hexc('#8d9cc0'); // printed rules
export const GRAPHITE = '#4a4858';
export const GRAPHITE_LT = '#8a8698';
const STEEL = ramp(['#1b1d29', '#363a4d', '#555b71', '#7d849c', '#a9afc4', '#d3d8e6', '#f4f6fb']);
const BOARD = ramp(['#3a2212', '#5a3419', '#74451f', '#8c5827', '#a26a30', '#b57c3a', '#c58e46', '#d5a256', '#e4b86c']); // warm honey hardboard
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
    const mark = textPix('FOXCO', { font: 'tiny', color: '#3a3e52' });
    for (let y = 0; y < mark.h; y++) for (let x = 0; x < mark.w; x++) if (mark.a(x, y)) {
      const X = Math.round(W / 2 - mark.w / 2) + x, Y = jy0 + 6 + y - 2;
      if (Y < jy0 + jh - 3) { p.set(X, Y, S(2)); if (!mark.a(x, y + 1)) p.set(X, Y + 1, S(6)); }
    }
  }
  p.outline(hexc('#11131c'));
  // dithered shadow the jaw throws on the paper
  const sy = jy0 + jh + 1;
  for (let y = sy; y < sy + (open ? 3 : 2); y++) for (let x = 8; x < W - 6; x++) if (((x + y) & 1) === 0 && !p.a(x, y)) p.set(x, y, hexc('#2a1c10'), open ? 70 : 120);
  return p;
}

// ================================================================ sticky index tab
export const TAB_COLORS = {
  yellow: ramp(['#8a5a08', '#d99a16', '#f6c63a', '#ffe27a', '#fff3b8']),
  orange: ramp(['#7a2c0c', '#c95a1e', '#f08838', '#ffb066', '#ffd8a8']),
  pink: ramp(['#7a1a3a', '#c2416a', '#ec7398', '#ffa2be', '#ffd4e2']),
  green: ramp(['#1e4a1c', '#3a8a34', '#62b852', '#94dc7c', '#cff2b8']),
  blue: ramp(['#173a6a', '#2e64b0', '#4c90dc', '#84bcf2', '#c4e2ff']),
  violet: ramp(['#3a1f68', '#6640a8', '#8f6ad6', '#b89cf0', '#e2d4ff']),
  red: ramp(['#5e0e12', '#a8242a', '#d84a46', '#f68478', '#ffc0b4']),
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

// ================================================================ pencil
// axis angle in degrees (0 = lying, tip left). Returns { pix, tip: [x, y] }.
export function paintPencil(angle = 0, { len = 40, eraserDown = false } = {}) {
  const a = (angle * Math.PI) / 180;
  const ax = -Math.cos(a), ay = Math.sin(a); // from eraser toward the tip
  const px = -ay, py = ax; // perpendicular
  const half = 2.6;
  const ex = Math.abs(ax) * len + Math.abs(px) * half * 2 + 4, ey = Math.abs(ay) * len + Math.abs(py) * half * 2 + 4;
  const W = Math.ceil(ex), H = Math.ceil(ey);
  const p = new Pix(W, H);
  // tip at u = len, eraser end at u = 0; center the shaft in the box
  const cx = W / 2 - (ax * len) / 2, cy = H / 2 - (ay * len) / 2;
  const YEL = ramp(['#7a4806', '#c47e10', '#eeb428', '#ffd658', '#fff0a6']);
  const WOOD = ramp(['#9a6a3a', '#cfa068', '#efcc96']);
  const LEAD = ramp(['#1e1e26', '#3e3f4c', '#62647a']);
  const PINK = ramp(['#8e3a4e', '#c8607a', '#ee8ea2', '#ffbccb']);
  const MET = ramp(['#4a4e60', '#7d849c', '#b6bccf', '#e8ebf3']);
  let tip = [0, 0], end = [0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = dx * ax + dy * ay, v = dx * px + dy * py;
    if (u < 0 || u > len) continue;
    const tipLen = 8;
    let r = half;
    if (u > len - tipLen) r = half * ((len - u) / tipLen) + 0.35;
    if (u < 1.2) r = half - 0.7; // rounded eraser end
    if (Math.abs(v) > r) continue;
    const f = v / half; // -1 .. 1 across the shaft (light from the top left)
    let c;
    if (u > len - 2.6) c = LEAD[f < -0.1 ? 2 : f < 0.4 ? 1 : 0];
    else if (u > len - tipLen) c = WOOD[f < -0.2 ? 2 : f < 0.5 ? 1 : 0];
    else if (u > 9) {
      // hexagonal painted body: three facets + an edge glint
      const t = f < -0.55 ? 4 : f < -0.15 ? 3 : f < 0.45 ? 2 : f < 0.8 ? 1 : 0;
      c = YEL[t];
      if (t === 2 && Math.abs(u - (len * 0.42)) < 0.6) c = YEL[1]; // a printed band
    } else if (u > 4.5) {
      const ring = Math.floor(u) % 2 === 0;
      c = MET[clamp((f < -0.3 ? 3 : f < 0.4 ? 2 : 1) - (ring ? 1 : 0), 0, 3)];
    } else c = PINK[f < -0.3 ? 3 : f < 0.4 ? 2 : 1];
    p.set(x, y, c);
    if (u > len - 1.5) tip = [x, y];
    if (u < 1.5 && Math.abs(v) < 1) end = [x, y];
  }
  p.outline(INK);
  void eraserDown;
  return { pix: p, tip, end };
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

// ================================================================ colored-pencil gauge (hand drawn box + hatching)
const PENCILS = { red: ['#c23a4c', '#e47286'], green: ['#3c8a3a', '#78c060'], gold: ['#c08414', '#e8b440'], blue: ['#3a64b0', '#76a0e0'], grey: ['#5a5c66', '#8c8e98'] };
export function paintGauge(v, color = 'green', { w = 36, h = 8, seed = 1 } = {}) {
  const p = new Pix(w + 1, h + 1);
  const [c0, c1] = (PENCILS[color] || PENCILS.grey).map(hexc);
  const g = hexc(GRAPHITE), gl = hexc(GRAPHITE_LT);
  const fill = Math.round(clamp(v, 0, 100) / 100 * (w - 3));
  for (let y = 2; y < h - 1; y++) for (let x = 2; x < 2 + fill; x++) {
    if ((x + y * 2) % 3 === 0) p.set(x, y, noise(x, y, seed) < 0.12 ? c1 : c0);
    else if ((x + y * 2) % 3 === 1 && noise(x, y, seed + 3) < 0.25) p.set(x, y, c1);
  }
  // the sketchy box: lines overshoot a corner or two
  const jog = 3 + Math.floor(noise(seed, 1, 9) * (w - 8));
  for (let x = 0; x < w; x++) { p.set(x, x > jog ? 1 : 0, g); p.set(x, h - 1, noise(x, 5, seed) < 0.2 ? gl : g); }
  p.set(w, 0, gl); p.set(0, h, gl);
  for (let y = 0; y < h; y++) { p.set(0, y, g); p.set(w - 1, y, noise(7, y, seed) < 0.25 ? gl : g); }
  return p;
}

// ================================================================ worn rubber stamp (pixel rotated)
export function paintStamp(text, color = '#b8282c', { rot = -8, font = 'bold', seed = 5, frame = 'double', pad = 3 } = {}) {
  const t = textPix(text, { font, color });
  const W = t.w + pad * 2 + 4, H = t.h + pad * 2 + 2;
  const p = new Pix(W, H);
  const C = hexc(color);
  if (frame !== 'none') {
    for (let x = 0; x < W; x++) { p.set(x, 0, C); p.set(x, H - 1, C); }
    for (let y = 0; y < H; y++) { p.set(0, y, C); p.set(W - 1, y, C); }
    if (frame === 'double') {
      for (let x = 2; x < W - 2; x++) { p.set(x, 2, C); p.set(x, H - 3, C); }
      for (let y = 2; y < H - 2; y++) { p.set(2, y, C); p.set(W - 3, y, C); }
    }
  }
  p.blit(t, pad + 2, pad);
  // ink wear: blotchy gaps and thin spots
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!p.a(x, y)) continue;
    const n = fbm(x * 1.7, y * 1.7, 5, seed);
    if (n < 0.3 || noise(x, y, seed) < 0.07) p.set(x, y, [0, 0, 0], 0);
    else if (n < 0.4) p.set(x, y, C, 150);
    else p.set(x, y, C, 225);
  }
  return rotNN(p, rot);
}

// ================================================================ coffee ring
export function paintCoffee(r = 17, seed = 2) {
  const N = Math.ceil(r * 2 + 10), p = new Pix(N, N), c = N / 2, R = rng(seed);
  const dark = hexc('#7a4a22'), mid = hexc('#a8703a');
  const gap0 = R() * Math.PI * 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy), an = Math.atan2(dy, dx);
    const rr = r + (fbm(Math.cos(an) * 8 + 20, Math.sin(an) * 8 + 20, 4, seed) - 0.5) * 2.4;
    const ga = Math.abs(((an - gap0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const thin = ga > Math.PI - 0.5 ? 0.5 : 1;
    if (Math.abs(d - rr) < 0.75 * thin) p.set(x, y, dark, ga > Math.PI - 0.5 ? 90 : 160);
    else if (d < rr && d > rr - 2.6 * thin) { if (bay(x, y) < 0.55) p.set(x, y, mid, 85); }
    else if (d < rr - 2.6 && bay(x, y) < 0.08) p.set(x, y, mid, 45);
  }
  for (let k = 0; k < 3; k++) {
    const an = R() * Math.PI * 2, dd = r + 3 + R() * 3;
    const x = Math.round(c + Math.cos(an) * dd), y = Math.round(c + Math.sin(an) * dd);
    p.set(x, y, dark, 150); if (R() < 0.6) { p.set(x + 1, y, mid, 110); p.set(x, y + 1, mid, 110); }
  }
  return p;
}

// ================================================================ tape strip (torn ends, translucent)
export function paintTape(w = 26, h = 8, { color = '#efe0a0', seed = 3 } = {}) {
  const p = new Pix(w, h), C = hexc(color), L = hexc('#fffbe4'), D = hexc('#c9b878');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const jl = Math.floor(noise(0, y, seed) * 2.6), jr = Math.floor(noise(1, y, seed) * 2.6);
    if (x < jl || x >= w - jr) continue;
    let c = C, a = 175;
    if (y === 1) { c = L; a = 200; }
    else if (y === h - 1 || y === 0) { c = D; a = 190; }
    else if (noise(x, y, seed + 4) < 0.06) { c = L; a = 190; }
    p.set(x, y, c, a);
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

// ================================================================ the close button: a red plastic push-button on the board
export function paintCloseKnob() {
  const N = 15, p = new Pix(N, N + 2), c = (N - 1) / 2;
  const RED = ramp(['#4a0c10', '#8c1c20', '#c4322e', '#e8584a', '#ff9a86', '#ffe0d6']);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    if (d > c + 0.3) continue;
    let t = 2.4 - (dx + dy) / N * 2.2;
    if (d > c - 1.5) t -= 1.2; // rim
    if (Math.hypot(dx + 3, dy + 3) < 1.6) t = 5;
    p.set(x, y, RED[clamp(Math.floor(t + bay(x, y) * 0.8), 0, 5)]);
  }
  // the X, embossed
  for (let i = -3; i <= 3; i++) for (const s of [1, -1]) {
    const x = Math.round(c + i), y = Math.round(c + i * s);
    p.set(x, y, hexc('#fff3ea')); p.set(x + 1, y + 1, RED[1]);
  }
  p.outline(INK);
  for (let x = 2; x < N - 2; x++) if (!p.a(x, N) && (x & 1) === 0) p.set(x, N, hexc('#1a0f08'), 120);
  return p;
}

// ================================================================ pencil dots for 1..max ratings
export function paintPips(n, max = 5, { color = GRAPHITE, hi = false } = {}) {
  const p = new Pix(max * 6, 6);
  const C = hexc(color), L = hexc(GRAPHITE_LT), Y = hexc('#ffe27a');
  const DOT = ['.##.', '####', '####', '.##.'];
  for (let i = 0; i < max; i++) {
    const ox = i * 6, on = i < n;
    if (hi && on) for (let y = 0; y < 6; y++) for (let x = -1; x < 5; x++) if (bay(ox + x, y) < 0.7) p.set(ox + x, y, Y, 200);
    DOT.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch !== '#') return;
      const edge = y === 0 || y === 3 || x === 0 || x === 3;
      if (on) p.set(ox + x, 1 + y, C);
      else if (edge) p.set(ox + x, 1 + y, L);
    }));
    if (on) p.set(ox + 1, 2, hexc('#a8a6b4'));
  }
  return p;
}

// ================================================================ highlighter swipe (a marker band, dithered)
export function paintHighlight(w = 8, h = 8, color = '#fff07a') {
  const p = new Pix(w, h), C = hexc(color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bay(x, y) < 0.62) p.set(x, y, C, 170);
  return p;
}
