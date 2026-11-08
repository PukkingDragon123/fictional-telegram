// [v33 scope] Pixel art for Professor Reynard's Fish Scope (FishScope.js): a naturalist's
// field kit instead of a hologram. Everything is painted at ART resolution with the
// physical-UI toolkit (src/ui/physical/pix.js) in the game's own palettes (frames.js wood /
// brass, the manila egg tags, the clipboard's graphite and printed ink) and shown at a whole
// number of CSS px per art px.
//
//   scopeArtCSS(P)              injects the 9-slice classes for P CSS px per art px:
//                               .fsc-tagR / .fsc-tagL (manila luggage tags, string end
//                               toward the fish), .fsc-card (the museum specimen label),
//                               .fsc-lbl (small sticker labels), .fsc-sheet (field notes paper)
//   eyeletURL(side)             the brass-ringed string hole of a tag (+ the twine knot)
//   gaugeURL(v, color, w)       a printed gauge filled in with coloured-pencil hatching
//   heartsURL(n, max)           the well-fed meter: inked hearts, filled in red
//   swatchURL(hex)              a dab of paint (colour / mutation swatch)
//   tickURL(on)                 printed tick box + pencil tick
//   drawLens(buf, L)            the brass magnifier + boxwood ruler + twine strings, per frame
//
// Nothing touches the DOM at import time.
import { Pix, hexc, ramp, bay, noise, fbm, clamp } from './physical/pix.js';

const INK = hexc('#2a1a0c');
// the manila tag card (eggtag / luggage tag)
const CARD = ramp(['#5c3f1e', '#9a7a48', '#c4a46a', '#d9bf8a', '#e7d3a3', '#f2e6c4', '#fbf4de']);
// cream museum-label paper
const CREAM = ramp(['#6b4f2e', '#b9a27a', '#dccaa0', '#ebdcb8', '#f5ecd4', '#fdf8ea']);
// brass (frames.js PAL.brass + a hot spot)
const BRASS = ramp(['#2a1a0c', '#5c4219', '#8d6c32', '#b8924c', '#dcbd72', '#f6e6ac', '#fffbe0']);
// the game's wood (frames.js PAL.wood)
const WOOD = ramp(['#2a180c', '#3b2414', '#55331a', '#6b4220', '#7a4d24', '#8b5a2b', '#a86d38', '#c98f55', '#dcae74']);
const BOX = ramp(['#6b4a20', '#b08a50', '#d8b474', '#ead096', '#f7e6b8']); // boxwood ruler
const SHADOW = hexc('#1a0e06');

const dpr = () => (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);
// device px per art px (whole), so the browser only ever scales source images by 1/dpr
const devScale = (P) => Math.max(1, Math.round(P * dpr()));
const urlCache = new Map();
const cached = (key, fn) => { let u = urlCache.get(key); if (!u) { u = fn(); urlCache.set(key, u); } return u; };
const pm = (v, p) => ((v % p) + p) % p;

// ================================================================ 9-slice sources
// card body tone with periodic speckle (period 16 in the stretched middle, so it tiles)
function paperTone(R, x, y, s0, base, seed) {
  const X = pm(x - s0, 16), Y = pm(y - s0, 16);
  const n = noise(X, Y, seed), m = noise(X >> 1, Y, seed + 3);
  let t = base;
  if (n < 0.07) t -= 1; else if (n > 0.95) t += 1;
  if (m < 0.05) t -= 1; // a short fibre
  return R[clamp(t, 0, R.length - 1)];
}

// luggage tag: 26x26 (card 24 + 2 px dithered shadow); slices [4, 6, 6, 4]; the string end
// (clipped corners) faces the fish: side 'R' = tag on the right of the screen, string end left
function paintTag(side) {
  const W = 26, C = 24, p = new Pix(W, W);
  const inner = side === 'R' ? (x) => x : (x) => C - 1 - x; // distance from the string end
  const isCard = (x, y) => {
    if (x < 0 || y < 0 || x >= C || y >= C) return false;
    const u = inner(x);
    return !(u + y < 3 || u + (C - 1 - y) < 3);
  };
  // hard dithered drop shadow (down-right)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (isCard(x, y) || !isCard(x - 2, y - 2)) continue;
    if (((x + y) & 1) === 0) p.set(x, y, SHADOW, 120);
  }
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    if (!isCard(x, y)) continue;
    const edge = !isCard(x - 1, y) || !isCard(x + 1, y) || !isCard(x, y - 1) || !isCard(x, y + 1);
    if (edge) { p.set(x, y, INK); continue; }
    let c;
    if (!isCard(x, y - 2) || (y === 1)) c = CARD[6]; // lit top lip
    else if (!isCard(x, y + 2) || y === C - 2) c = CARD[3]; // card thickness, bottom
    else if (!isCard(x + 2, y) && side === 'L') c = CARD[3];
    else if (x === C - 2 && side === 'R') c = CARD[3];
    else c = paperTone(CARD, x, y, 4, 4, 11);
    p.set(x, y, c);
  }
  return p;
}

// museum specimen label: cream card with a printed double rule; 30x30 (28 + 2 shadow), slices [6, 8, 8, 6]
function paintCard() {
  const W = 30, C = 28, p = new Pix(W, W);
  const RULE = hexc('#9a3a24'), RULE_L = hexc('#c07a5a');
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const inC = x < C && y < C;
    if (!inC) { if (x >= 2 && y >= 2 && x - 2 < C && y - 2 < C && ((x + y) & 1) === 0) p.set(x, y, SHADOW, 120); continue; }
    if (x === 0 || y === 0 || x === C - 1 || y === C - 1) { p.set(x, y, INK); continue; }
    let c = paperTone(CREAM, x, y, 6, 4, 23);
    if (y === 1) c = CREAM[5];
    if (y === C - 2 || x === C - 2) c = CREAM[2];
    // printed double rule (outer heavy, inner hairline)
    const d2 = (x === 2 || x === C - 3) && y >= 2 && y <= C - 3 || (y === 2 || y === C - 3) && x >= 2 && x <= C - 3;
    const d4 = (x === 4 || x === C - 5) && y >= 4 && y <= C - 5 || (y === 4 || y === C - 5) && x >= 4 && x <= C - 5;
    if (d2) c = RULE;
    else if (d4) c = bay(x, y) < 0.8 ? RULE_L : c;
    p.set(x, y, c);
  }
  return p;
}

// small sticker label for the notes chips: 13x13 (12 + 1 shadow), slices [3, 4, 4, 3]
function paintLabel() {
  const W = 13, C = 12, p = new Pix(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const inC = x < C && y < C;
    if (!inC) { if (x >= 1 && y >= 1 && ((x + y) & 1) === 0) p.set(x, y, SHADOW, 110); continue; }
    if (x === 0 || y === 0 || x === C - 1 || y === C - 1) { p.set(x, y, INK); continue; }
    p.set(x, y, y === 1 ? CARD[6] : y === C - 2 ? CARD[4] : CARD[5]);
  }
  return p;
}

// field-notes paper: ruled lines every 8 art px, a red margin, torn-ish edge; 34x34 slices [6, 6, 6, 12]
function paintSheet() {
  const W = 34, p = new Pix(W, W);
  const RULE = hexc('#9fb3d0'), MARGIN = hexc('#d0707a');
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    // the top edge is torn off a pad: a ragged top line
    const rag = y === 0 && (noise(pm(x - 12, 16), 0, 5) < 0.35);
    if (rag) continue;
    if (x === 0 || x === W - 1 || y === W - 1 || (y === 0) || (y === 1 && noise(pm(x - 12, 16), 0, 5) < 0.35)) { p.set(x, y, INK); continue; }
    let c = paperTone(CREAM, x, y, 6, 4, 31);
    if (pm(y - 6, 8) === 7 && y > 3) c = RULE;
    if (x === 9 || x === 10) c = MARGIN;
    if (y === W - 2) c = CREAM[2];
    p.set(x, y, c);
  }
  return p;
}

const SLICES = {
  tagR: { paint: () => paintTag('R'), s: [4, 6, 6, 4] },
  tagL: { paint: () => paintTag('L'), s: [4, 6, 6, 4] },
  card: { paint: paintCard, s: [6, 8, 8, 6] },
  lbl: { paint: paintLabel, s: [3, 4, 4, 3] },
  sheet: { paint: paintSheet, s: [6, 6, 6, 12] },
};

let cssP = 0;
export function scopeArtCSS(P) {
  if (typeof document === 'undefined') return;
  const D = devScale(P);
  const key = P + 'x' + D;
  if (cssP === key) return;
  cssP = key;
  let css = '';
  for (const [name, S] of Object.entries(SLICES)) {
    const url = cached('9:' + name + ':' + D, () => S.paint().url(D));
    const [t, r, b, l] = S.s;
    css += `.fsc-${name}{border-style:solid;border-width:${t * P}px ${r * P}px ${b * P}px ${l * P}px;`
      + `border-image:url(${url}) ${t * D} ${r * D} ${b * D} ${l * D} fill / ${t * P}px ${r * P}px ${b * P}px ${l * P}px repeat;image-rendering:pixelated;background:none;}\n`;
  }
  css += `.fsc{--P:${P}px;}\n`;
  let st = document.getElementById('fsc-art-css');
  if (!st) { st = document.createElement('style'); st.id = 'fsc-art-css'; document.head.appendChild(st); }
  st.textContent = css;
}

// ================================================================ small painted pieces
// brass eyelet in a stitched reinforcement patch, the twine knotted through it: 11x11
export function eyeletURL(side, P) {
  return cached(`eye:${side}:${devScale(P)}`, () => {
    const N = 11, p = new Pix(N, N), c = 5;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      const L = d > 0 ? (-dx - dy) / (d * 1.414) : 0; // lit from the top left
      if (d < 1.5) continue; // the hole: the string shows through it
      if (d < 2.2) { p.set(x, y, BRASS[1]); continue; }
      if (d < 3.4) { p.set(x, y, BRASS[clamp(Math.floor(3.6 + L * 2.2 + bay(x, y) - 0.5), 2, 6)]); continue; }
      if (d < 4.1) { p.set(x, y, BRASS[0]); continue; }
      if (d < 5.4) {
        // the reinforcement patch, stitched round its edge
        const st = d >= 4.8 && ((x + y) & 1) === 0;
        p.set(x, y, st ? CARD[1] : CARD[3]);
      }
    }
    // twine knot: through the hole and over the ring toward the string end
    const dir = side === 'R' ? -1 : 1;
    const TW = [hexc('#e2cf9e'), hexc('#a07c4a')];
    for (let i = 0; i < 5; i++) { const x = c + dir * (i - 1), y = c + (i > 2 ? 1 : 0); p.set(x, y, TW[(i >> 1) & 1]); p.set(x, y + 1, SHADOW, 140); }
    p.set(c + dir * 2, c - 1, TW[0]);
    return p.url(devScale(P));
  });
}

const GAUGE = {
  green: ['#3f8f5f', '#6cc08a', '#255a3c'],
  red: ['#d9453b', '#f07a52', '#80202e'],
  orange: ['#e0782a', '#f8a84a', '#8a3a10'],
  pink: ['#e05a90', '#ff9ac0', '#7a1a3a'],
  gold: ['#e5a320', '#ffd23f', '#7a4a12'],
  blue: ['#2e64b0', '#4c90dc', '#173a6a'],
};
// a printed gauge (blue-black ink box, quarter ticks) filled with coloured-pencil hatching
export function gaugeURL(v, color = 'green', w = 50, P = 2) {
  const q = Math.round(clamp(v, 0, 1) * (w - 2));
  return cached(`g:${q}:${color}:${w}:${devScale(P)}`, () => {
    const h = 9, p = new Pix(w, h), C = (GAUGE[color] || GAUGE.green).map(hexc);
    const PR = hexc('#33405f');
    for (let x = 0; x < w; x++) { p.set(x, 0, PR); p.set(x, 6, PR); }
    for (let y = 0; y <= 6; y++) { p.set(0, y, PR); p.set(w - 1, y, PR); }
    for (const f of [0.25, 0.5, 0.75]) { const x = Math.round(f * (w - 1)); p.set(x, 7, PR); if (f === 0.5) p.set(x, 8, PR); }
    for (let y = 1; y < 6; y++) for (let x = 1; x <= q; x++) {
      // pencil hatching: diagonal strokes, a darker stroke edge, paper grain gaps
      const k = pm(x + y, 3);
      if (noise(x, y, 7) < 0.06) continue;
      p.set(x, y, k === 0 ? C[2] : k === 1 ? C[0] : C[1]);
    }
    // a pencil overshoot at the end of the fill
    if (q > 2 && q < w - 2) { p.set(q + 1, 2, C[2]); p.set(q + 1, 4, C[2]); }
    return p.url(devScale(P));
  });
}

// the well-fed meter: n of max inked hearts filled in red
export function heartsURL(n, max = 4, P = 2) {
  return cached(`h:${n}:${max}:${devScale(P)}`, () => {
    const H = ['.aa.aa.', 'abbabba', 'abbbbba', 'abbbbba', '.abbba.', '..aba..', '...a...'];
    const p = new Pix(max * 9, 7);
    for (let i = 0; i < max; i++) {
      const on = i < n;
      H.forEach((row, y) => [...row].forEach((ch, x) => {
        const X = i * 9 + x;
        if (ch === 'a') p.set(X, y, on ? hexc('#5a0e1c') : hexc('#7a5a3a'));
        else if (ch === 'b' && on) p.set(X, y, (x === 1 || x === 2) && y === 1 ? hexc('#ffb0a8') : y >= 4 ? hexc('#b02838') : hexc('#e04050'));
        else if (ch === 'b' && !on && bay(X, y) < 0.12) p.set(X, y, hexc('#c9b088'));
      }));
    }
    return p.url(devScale(P));
  });
}

// a dab of paint, hand-shaped (not a box), lit top-left with a wet highlight
export function swatchURL(hex, P = 2) {
  return cached(`s:${hex}:${devScale(P)}`, () => {
    const S = ['...xxxxx...', '.xxxxxxxxx.', 'xxxxxxxxxxx', 'xxxxxxxxxxx', '.xxxxxxxxxx', '..xxxxxxxx.', '....xxx....'];
    const W = 11, H = S.length, p = new Pix(W + 1, H + 1);
    const c = hexc(hex), dk = c.map((v) => Math.round(v * 0.62)), lt = c.map((v) => Math.min(255, Math.round(v + (255 - v) * 0.5)));
    const on = (x, y) => S[y] && S[y][x] === 'x';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
      p.set(x, y, edge ? dk : (x < 5 && y < 3 ? lt : c));
    }
    p.set(3, 1, [255, 255, 240]); p.set(4, 1, [255, 255, 240]); p.set(3, 2, lt);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y) && !on(x + 1, y + 1) && ((x + y) & 1) === 0) p.set(x + 1, y + 1, SHADOW, 90);
    return p.url(devScale(P));
  });
}

// printed tick box (blue-black ink) + a graphite tick, or an empty box
export function tickURL(on, P = 2) {
  return cached(`t:${on ? 1 : 0}:${devScale(P)}`, () => {
    const p = new Pix(12, 11), PR = hexc('#33405f'), G = hexc('#4a4858'), GL = hexc('#8a8698');
    for (let i = 0; i < 8; i++) { p.set(i, 3, PR); p.set(i, 10, PR); }
    for (let i = 3; i <= 10; i++) { p.set(0, i, PR); p.set(7, i, PR); }
    if (on) {
      const T = [[1, 6], [2, 7], [3, 8], [4, 7], [5, 6], [6, 4], [7, 3], [8, 2], [9, 1], [10, 0]];
      T.forEach(([x, y], i) => { p.set(x, y, G); if (i < 3) p.set(x, y - 1, GL); });
    }
    return p.url(devScale(P));
  });
}

// ================================================================ the lens layer (per frame)
// buf: { w, h, d: Uint32Array } (little-endian ABGR). L: { cx, cy, R, hw, hh, strings: [...], pins }
const pack = (c, a = 255) => ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
const P_INK = pack(INK);
const P_SH = pack(SHADOW, 150);
function put(buf, x, y, v) { if (x >= 0 && y >= 0 && x < buf.w && y < buf.h) buf.d[y * buf.w + x] = v; }
function blend(buf, x, y, c, a) {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const i = y * buf.w + x, o = buf.d[i];
  const oa = (o >>> 24) & 255;
  if (!oa) { buf.d[i] = pack(c, a); return; }
  const k = a / 255;
  const r = Math.round((o & 255) * (1 - k) + c[0] * k), g = Math.round(((o >>> 8) & 255) * (1 - k) + c[1] * k), b = Math.round(((o >>> 16) & 255) * (1 - k) + c[2] * k);
  buf.d[i] = pack([r, g, b], Math.max(oa, a));
}

// a light, quantised vignette: sparse ordered-dither dots outside the lens, denser further out
export function paintVignette(buf, cx, cy, R) {
  const D = buf.d, W = buf.w, H = buf.h;
  const far = Math.max(W, H) * 0.5, r0 = R + 16;
  const dot = pack(hexc('#1c1008'), 120);
  for (let y = 0; y < H; y++) {
    const dy = y - cy;
    for (let x = 0; x < W; x++) {
      const dx = x - cx, d2 = dx * dx + dy * dy;
      if (d2 <= r0 * r0) continue;
      const t = clamp((Math.sqrt(d2) - r0) / far, 0, 1);
      const cov = 0.0625 + Math.floor(t * 3) * 0.0625; // 1/16 .. 3/16, in hard steps
      if (bay(x, y) < cov) D[y * W + x] = dot;
    }
  }
}

// the magnifier's wooden handle with a brass collar, running out down-right from the rim
function paintHandle(buf, cx, cy, R) {
  const a = 0.86, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
  const s0 = R + 4, collar = 7, len = Math.max(26, Math.round(R * 0.95)), hwid = 4;
  const ex = cx + ux * (s0 + len + 2), ey = cy + uy * (s0 + len + 2);
  const x0 = Math.floor(Math.min(cx + ux * s0, ex) - 8), x1 = Math.ceil(Math.max(cx + ux * s0, ex) + 8);
  const y0 = Math.floor(Math.min(cy + uy * s0, ey) - 8), y1 = Math.ceil(Math.max(cy + uy * s0, ey) + 8);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const vx = x - cx, vy = y - cy;
    const s = vx * ux + vy * uy - s0, w = vx * px + vy * py;
    if (s < 0 || s > len) continue;
    const isCol = s < collar;
    let half = isCol ? hwid + 0.6 : hwid - (s > len - 3 ? (s - (len - 3)) * 0.9 : 0) + (s > collar + 2 && s < collar + 5 ? -0.6 : 0);
    if (Math.abs(w) > half + 0.5) continue;
    if (Math.abs(w) > half - 0.5 || s > len - 0.8) { put(buf, x, y, P_INK); continue; }
    const lit = -w / half; // the up-right side catches the light
    if (isCol) {
      let t = Math.floor(3.4 + lit * 2.4 + bay(x, y) - 0.5);
      if (Math.abs(s - 2.5) < 0.6 || Math.abs(s - 5) < 0.6) t -= 2; // turned rings
      put(buf, x, y, pack(BRASS[clamp(t, 1, 6)]));
    } else {
      let t = 4.6 + lit * 2.2;
      const g = fbm(s * 0.35, (w + 6) * 2.4, 3, 17);
      if (g < 0.36) t -= 1.4; else if (g > 0.66) t += 0.8;
      put(buf, x, y, pack(WOOD[clamp(Math.floor(t + bay(x, y) - 0.5), 1, 8)]));
    }
  }
}

function paintRing(buf, cx, cy, R) {
  const RO = R + 6;
  const glint = hexc('#fffbe8'), rim = hexc('#d8ece4'), warm = hexc('#ffe8b0');
  for (let y = cy - RO - 1; y <= cy + RO + 1; y++) for (let x = cx - RO - 1; x <= cx + RO + 1; x++) {
    const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > R + 6.5) continue;
    const ang = Math.atan2(dy, dx) * 180 / Math.PI; // -180..180, -135 = top left
    if (d < R - 0.5) {
      // glass: a glint arc top-left, a second short one, a warm reflection bottom-right, a faint rim
      if (d >= R - 3.6 && d < R - 2.4 && ang > -165 && ang < -108) blend(buf, x, y, glint, ang > -150 && ang < -122 ? 235 : 150);
      else if (d >= R - 3.6 && d < R - 2.4 && ang > -101 && ang < -93) blend(buf, x, y, glint, 200);
      else if (d >= R - 2.4 && d < R - 1.4 && ang > 25 && ang < 62 && bay(x, y) < 0.5) blend(buf, x, y, warm, 140);
      else if (d >= R - 1.5 && bay(x, y) < 0.5) blend(buf, x, y, rim, 110);
      continue;
    }
    if (d < R + 0.5 || d >= R + 5.5) { put(buf, x, y, P_INK); continue; }
    // the bezel: a raised, rounded brass band lit from the top left
    const j = Math.floor(d - R - 0.5); // 0..4
    const L = (-dx - dy) / (d * 1.414);
    let t = [2.2, 3.8, 4.8, 4.0, 2.6][j] + L * 1.7;
    if (j === 4 && (Math.floor((ang + 180) / 4.5) & 1)) t -= 1; // knurled outer edge
    if (j === 2 && L > 0.82) t = 6; // hot spot
    put(buf, x, y, pack(BRASS[clamp(Math.floor(t + bay(x, y) - 0.5), 1, 6)]));
  }
  // two slotted screws holding the bezel, at 10 and 4 o'clock
  for (const a of [-150, 30]) {
    const r = a * Math.PI / 180, sx = Math.round(cx + Math.cos(r) * (R + 3)), sy = Math.round(cy + Math.sin(r) * (R + 3));
    const S = ['.ab.', 'abbc', 'bddc', '.cc.'];
    S.forEach((row, yy) => [...row].forEach((ch, xx) => {
      if (ch === '.') return;
      put(buf, sx - 2 + xx, sy - 2 + yy, pack(ch === 'a' ? BRASS[6] : ch === 'b' ? BRASS[4] : ch === 'c' ? BRASS[2] : BRASS[0]));
    }));
  }
}

// a boxwood ruler under the fish, ticked in tenths of its length
function paintRuler(buf, x0, x1, y) {
  if (x1 - x0 < 10) return;
  for (let x = x0 - 2; x <= x1 + 2; x++) {
    for (let j = 0; j < 6; j++) {
      const edge = j === 0 || j === 5 || x === x0 - 2 || x === x1 + 2;
      put(buf, x, y + j, edge ? P_INK : pack(BOX[j === 1 ? 4 : j === 4 ? 1 : noise(x, j, 3) < 0.1 ? 2 : 3]));
    }
    if (((x + 1) & 1) === 0) put(buf, x + 1, y + 6, P_SH);
  }
  for (let i = 0; i <= 10; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / 10);
    const h = i % 5 === 0 ? 3 : 2;
    for (let j = 1; j <= h; j++) put(buf, x, y + j, P_INK);
  }
}

// twine: a sagging string, 1 art px, twisted two-tone with a hard shadow; red when it's the hot one
const TWINE = [hexc('#efe0b4'), hexc('#a8804c')], RED = [hexc('#e0503a'), hexc('#8a1a14')];
function paintString(buf, x0, y0, x1, y1, hot) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + Math.min(26, len * 0.14 + 3);
  const n = Math.ceil(len * 1.6) + 2;
  const pts = [];
  let lx = null, ly = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const x = Math.round(a * x0 + b * mx + c * x1), y = Math.round(a * y0 + b * my + c * y1);
    if (x === lx && y === ly) continue;
    pts.push([x, y]); lx = x; ly = y;
  }
  // drop L-corners (keeps the line one pixel thin)
  const thin = pts.filter((p, i) => {
    const a = pts[i - 1], b = pts[i + 1];
    return !(a && b && Math.abs(a[0] - b[0]) === 1 && Math.abs(a[1] - b[1]) === 1);
  });
  const C = hot ? RED : TWINE;
  for (const [x, y] of thin) put(buf, x, y + 1, P_SH);
  thin.forEach(([x, y], i) => put(buf, x, y, pack(C[(i >> 1) & 1])));
}

// a map pin pushed into the specimen: red bead, highlight, ink outline
function paintPin(buf, x, y, hot) {
  const R0 = hot ? hexc('#ffd23f') : hexc('#d9453b'), RH = hexc('#ffe8c8'), RD = hot ? hexc('#b0661a') : hexc('#80202e');
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) put(buf, x + dx, y + dy, P_INK);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) put(buf, x + dx, y + dy, pack(dx + dy >= 1 ? RD : R0));
  put(buf, x - 1, y - 1, pack(RH));
}

/** Paint the whole lens layer into buf (cleared by the caller, vignette already in it). */
export function drawLens(buf, L) {
  paintHandle(buf, L.cx, L.cy, L.R);
  paintRing(buf, L.cx, L.cy, L.R);
  if (L.ruler) paintRuler(buf, L.ruler.x0, L.ruler.x1, L.ruler.y);
  for (const s of L.strings) paintString(buf, s.x0, s.y0, s.x1, s.y1, s.hot);
  for (const s of L.strings) paintPin(buf, s.x1, s.y1, s.hot);
}
