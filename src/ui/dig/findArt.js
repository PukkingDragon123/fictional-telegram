// [v32 dig] Pixel art for everything you dig up (src/data/digFinds.js ids), drawn
// with the game's pixel kit (src/ui/bagArt.js: character grid + material ramps,
// auto shading from the top-left, 1px ink outline). Every find has one painter
// written in a 24-unit space and scaled, so the 24 px icon and the big dig-tray
// sprite are the same drawing. Shapes are built from bent, noisy outlines and
// placed details (ribs, sutures, cracks, glints), never plain circles.
//
//   findPix(id, s = 1) -> Pix (RGBA, w = h = round(24 * s))      cached
//   findCanvas(id, s, scale) -> <canvas>   findURL(id, s, scale) -> data URL
//   crustPix(id, seed, s) -> Pix   an uncleaned specimen: a lump of matrix rock with a hint of the find
//   silhouettePix(id, s) -> Pix    the collection's "not found yet" shape
import { Grid, render, Pix as BPix, pixCanvas } from '../bagArt.js';
import { FIND_BY_ID } from '../../data/digFinds.js';

const TAU = Math.PI * 2;
const hsh = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn(x, s = 0) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hsh(i, 3, s) + (hsh(i + 1, 3, s) - hsh(i, 3, s)) * u; }

// a painter draws on `g` in 24-unit coords through d = { s, set(x, y, ch), poly(pts, ch), blob(cx, cy, rx, ry, ch, wob, seed), line(...), thick }
function kit(g, s) {
  const S = (v) => v * s;
  const d = {
    s,
    set: (x, y, ch) => g.set(Math.floor(S(x)), Math.floor(S(y)), ch),
    px: (x, y, ch) => { for (let a = 0; a < Math.max(1, Math.round(s)); a++) for (let b = 0; b < Math.max(1, Math.round(s)); b++) g.set(Math.floor(S(x)) + a, Math.floor(S(y)) + b, ch); },
    poly: (pts, ch, only) => g.poly(pts.map(([x, y]) => [S(x), S(y)]), ch, only),
    line: (x0, y0, x1, y1, ch, w = 1) => {
      const t = Math.max(1, Math.round(w * s * 0.75));
      for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) g.line(S(x0) + a, S(y0) + b, S(x1) + a, S(y1) + b, ch);
    },
    // a bent ellipse: radius wobbles with smooth noise around the rim
    blob: (cx, cy, rx, ry, ch, wob = 0.12, seed = 1, only) => {
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const dx = (x + 0.5) / s - cx, dy = (y + 0.5) / s - cy;
        const a = Math.atan2(dy / ry, dx / rx);
        const k = 1 + (vn((a + Math.PI) * 1.4, seed) - 0.5) * 2 * wob + (vn((a + Math.PI) * 3.1, seed + 9) - 0.5) * wob;
        if ((dx / (rx * k)) ** 2 + (dy / (ry * k)) ** 2 <= 1 && (!only || only.includes(g.get(x, y)))) g.set(x, y, ch);
      }
    },
    each: (fn) => { for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const r = fn((x + 0.5) / s, (y + 0.5) / s, g.get(x, y), x, y); if (r) g.set(x, y, r); } },
  };
  return d;
}

// ---------------------------------------------------------------- painters
const PAINT = {
  ammonite(d) {
    d.blob(12, 12.5, 9.6, 9.2, 'A', 0.05, 3);
    // the coil: a spiral seam, ribs crossing each whorl, the tight middle darker
    d.each((x, y, c) => {
      if (c !== 'A') return null;
      const dx = x - 12, dy = y - 12.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const turns = r / 3.1 - a / TAU;
      const f = turns - Math.floor(turns);
      if (f < 0.13) return 'k';
      if (r < 2.2) return 'D';
      const rib = Math.floor((a + Math.PI) * (5 + r * 0.55)) % 2;
      return rib ? 'R' : null;
    });
    d.px(7.5, 6.5, 'h'); d.px(8.5, 6, 'h');
    d.line(17, 16, 19, 19, 'k', 0.6); // a hairline crack
  },
  trilobite(d) {
    d.poly([[12, 2.6], [17.8, 5.4], [19.4, 9], [18.2, 10.2], [17.6, 17], [14.6, 21.4], [12, 22.2], [9.4, 21.4], [6.4, 17], [5.8, 10.2], [4.6, 9], [6.2, 5.4]], 'A');
    d.blob(12, 6.6, 6.6, 3.8, 'C', 0.06, 5); // head shield
    for (let y = 10.4; y < 19.5; y += 1.5) d.line(6.4 + (y - 10) * 0.3, y, 17.6 - (y - 10) * 0.3, y, 'k', 0.5);
    d.each((x, y, c) => (c === 'A' && Math.abs(x - 12) < 2.2 && y > 9 ? 'D' : c === 'A' && Math.abs(x - 12) > 4.8 && y > 10 ? 'L' : null)); // three lobes
    d.blob(12, 6.2, 1.8, 2.6, 'D', 0.05, 6); // glabella
    for (const ex of [8.2, 15.4]) { d.blob(ex, 7, 1.3, 1.1, 'E', 0, 7); d.px(ex - 0.4, 6.4, 'h'); }
    d.line(5.2, 9, 3.6, 13.6, 'A', 0.8); d.line(18.8, 9, 20.4, 13.6, 'A', 0.8); // genal spines
  },
  fern(d) {
    d.poly([[3, 6], [9, 2.4], [17, 3.2], [21.6, 7], [21, 16.4], [17.4, 21.6], [7.8, 21.2], [2.6, 15.2]], 'S');
    d.each((x, y, c) => (c === 'S' && hsh(Math.floor(x * 2), Math.floor(y * 2), 3) < 0.05 ? 'T' : null));
    d.line(6.6, 19.4, 16.6, 4.6, 'F', 0.8);
    for (let k = 1; k < 9; k++) {
      const t = k / 9, x = 6.6 + 10 * t, y = 19.4 - 14.8 * t, L = 4.4 * (1 - t * 0.6);
      d.line(x, y, x - L * 0.9, y - L * 0.55, 'F', 0.55); d.line(x, y, x + L * 0.55, y + L * 0.2 + 0.6, 'F', 0.55);
      d.px(x - L * 0.9, y - L * 0.55, 'G'); d.px(x + L * 0.55, y + L * 0.2 + 0.6, 'G');
    }
  },
  sharktooth(d) {
    d.poly([[5.6, 6], [18.4, 6], [16.8, 9], [14.4, 15], [12.4, 21.6], [11.6, 21.6], [9.6, 15], [7.2, 9]], 'A');
    d.poly([[5, 3.4], [19, 3.4], [18.6, 7], [5.4, 7]], 'R'); // the root
    d.blob(12, 3.6, 7.2, 1.6, 'R', 0.15, 4);
    d.each((x, y, c) => (c === 'A' && (Math.floor(y * 1.4) % 2 === 0) && (x < 8 + (y - 6) * 0.3 || x > 16 - (y - 6) * 0.3) ? 'D' : null)); // serrations
    d.line(11.2, 8, 11.8, 18, 'h', 0.5);
  },
  crinoid(d) {
    for (let y = 22; y > 10; y -= 1.2) { const x = 11 + Math.sin(y * 0.35) * 1.4; d.blob(x, y, 1.8, 0.62, (Math.round(y / 1.2) % 2) ? 'A' : 'D', 0, 1); }
    d.blob(12, 9.6, 3, 2.4, 'C', 0.08, 2);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI * (0.15 + k * 0.175);
      const x0 = 12, y0 = 8.6, x1 = x0 + Math.cos(a) * 8.4, y1 = y0 + Math.sin(a) * 7.6;
      d.line(x0, y0, x1, y1, 'A', 0.9);
      for (let q = 0.3; q < 1; q += 0.16) d.px(x0 + (x1 - x0) * q + 0.8, y0 + (y1 - y0) * q - 0.6, 'L');
    }
  },
  fishskull(d) {
    d.poly([[3, 10], [6, 4.6], [12, 2.6], [18, 4], [21.4, 8.6], [21.6, 13], [19.6, 16.6], [12, 17.6], [5, 15.6]], 'A');
    // the armour plates: sutures
    d.line(12, 2.6, 11, 17, 'k', 0.5); d.line(4, 9.6, 20.6, 9, 'k', 0.5); d.line(16.4, 3.6, 18, 16.8, 'k', 0.5);
    d.each((x, y, c) => (c === 'A' && hsh(Math.floor(x * 1.6), Math.floor(y * 1.6), 9) < 0.07 ? 'D' : null)); // pitted bone
    d.blob(15, 8.2, 2.4, 2.2, 'E', 0.1, 4); d.px(14.4, 7.4, 'D');
    // the blade jaw: bony shears instead of teeth
    d.poly([[11, 16.4], [21.8, 14], [22.6, 16], [21, 19.6], [13, 20.4]], 'B');
    d.poly([[21, 14.4], [22.8, 12.4], [22.6, 15.6]], 'L');
    d.line(14, 18.6, 21.4, 17, 'k', 0.4);
  },
  lobescale(d) {
    d.poly([[12, 2], [21, 11], [12.8, 22], [3.4, 12.6]], 'A');
    d.each((x, y, c) => {
      if (c !== 'A') return null;
      const r = Math.hypot(x - 12, y - 4.4);
      return Math.floor(r * 1.3) % 3 === 0 ? 'D' : (x - 12) * 0.7 + (y - 4) * 0.2 > 3 && Math.floor(y) % 2 ? 'L' : null;
    });
    d.line(12, 3, 12.4, 20.4, 'R', 0.5);
    d.px(9, 7, 'h'); d.px(9.6, 6.2, 'h');
  },
  raptorclaw(d) {
    // a curved sickle: two arcs of different radius
    d.each((x, y) => {
      const r1 = Math.hypot(x - 5, y - 21), r2 = Math.hypot(x - 2.6, y - 22.8);
      return r1 < 16.8 && r2 > 14.6 && y < 21 && x > 4 ? 'A' : null;
    });
    d.each((x, y, c) => (c === 'A' && Math.hypot(x - 5, y - 21) < 16.8 && (x > 15 || y < 7.6) ? 'K' : null)); // the keratin-dark tip
    d.blob(6.6, 19.6, 3.6, 2.8, 'A', 0.12, 2); // the knuckle
    d.line(7, 17.6, 17.4, 6.4, 'h', 0.45);
  },
  sabrefang(d) {
    d.each((x, y) => {
      const t = (y - 2.4) / 20; if (t < 0 || t > 1) return null;
      const cx = 10 + Math.sin(t * 1.6) * 4.6, w = 3.4 * (1 - t * 0.9);
      return Math.abs(x - cx) < w ? (t < 0.24 ? 'R' : 'A') : null;
    });
    d.each((x, y, c) => { const t = (y - 2.4) / 20; const cx = 10 + Math.sin(t * 1.6) * 4.6; return c === 'A' && x > cx + 0.6 ? 'D' : null; });
    d.line(9.2, 7, 13, 20, 'h', 0.45);
    for (let y = 8; y < 20; y += 2.4) d.px(10 + Math.sin(((y - 2.4) / 20) * 1.6) * 4.6 + 1.6, y, 'k'); // a serrated back edge
  },
  mammoth(d) {
    d.poly([[2.6, 8], [21.4, 7], [22, 15], [19.6, 21], [4.6, 21.6], [2, 15]], 'A');
    d.poly([[2.6, 8], [21.4, 7], [21, 4.4], [3, 5.2]], 'T'); // the grinding surface
    for (let x = 4; x < 21; x += 2) { d.line(x, 4.8, x + 0.4, 7.6, 'k', 0.5); d.line(x + 1, 5, x + 1.2, 7.4, 'L', 0.4); }
    d.each((x, y, c) => (c === 'A' && y > 15 && hsh(Math.floor(x), Math.floor(y * 2), 4) < 0.3 ? 'R' : null));
  },
  dinoegg(d) {
    d.blob(12, 12.6, 7.8, 10, 'A', 0.04, 5);
    d.each((x, y, c) => (c === 'A' && hsh(Math.floor(x * 1.5), Math.floor(y * 1.5), 6) < 0.1 ? 'D' : null)); // bumpy shell
    d.line(8.6, 11, 11, 13.4, 'k', 0.5); d.line(11, 13.4, 10, 16.4, 'k', 0.5); d.line(11, 13.4, 13.4, 14.2, 'k', 0.5);
    d.px(8.6, 5.6, 'h'); d.px(9.4, 5, 'h');
  },
  coelacanth(d) {
    d.poly([[1.6, 3], [22.6, 2.6], [22.8, 21.4], [1.4, 21.8]], 'S');
    d.each((x, y, c) => (c === 'S' && hsh(Math.floor(x * 2), Math.floor(y * 2), 8) < 0.04 ? 'T' : null));
    d.blob(12.4, 12, 7.8, 4.6, 'A', 0.06, 2);
    d.poly([[19.8, 11], [23, 8.6], [22.6, 15.4]], 'A'); // head + jaw
    d.poly([[4.8, 12], [1.8, 7.6], [2.6, 12], [1.8, 16.4]], 'A'); // three-lobed tail
    d.blob(3, 12, 1.6, 0.9, 'A', 0, 1);
    for (const [x, y, a] of [[9, 7.4, -0.9], [14, 7.4, -1.1], [9, 16.6, 0.9], [14, 16.4, 1.1]]) { d.line(x, y, x + Math.cos(a) * 3.4 - 1, y + Math.sin(a) * 3.4, 'B', 0.9); } // lobed fins
    d.each((x, y, c) => (c === 'A' && (Math.floor(x * 0.8) + Math.floor(y * 0.8)) % 2 === 0 && x < 18 ? 'D' : null)); // heavy scales
    d.px(19.6, 10.4, 'k');
  },
  amber(d, F) {
    const seed = F.id === 'heartamber' ? 11 : F.id === 'amberbug' ? 3 : F.id === 'amberfeather' ? 7 : 1;
    if (F.id === 'heartamber') {
      d.each((x, y) => { const X = (x - 12) / 8.6, Y = (y - 12.4) / 8.6; const q = X * X + (Y - Math.sqrt(Math.abs(X)) * 0.62) ** 2; return q < 1 ? 'H' : null; });
      d.blob(12, 11.6, 3, 3, 'G', 0.2, 2, ['H']);
      d.blob(12, 11.6, 1.4, 1.4, 'W', 0.1, 3, ['G']);
    } else {
      d.blob(12, 12.6, 8.6, 7.6, 'A', 0.18, seed);
      d.blob(13, 14, 4.8, 3.6, 'D', 0.3, seed + 4, ['A']); // a deeper amber heart
    }
    if (F.id === 'amberbug') {
      d.line(9.6, 12.6, 14.4, 12.2, 'k', 0.7); // body
      d.px(15, 12, 'k');
      for (const [x0, y0, x1, y1] of [[10.4, 12.6, 8.6, 16], [12, 12.6, 11.6, 16.4], [13.2, 12.4, 15, 15.8], [11, 12, 8.4, 9.2], [13, 12, 15, 9]]) d.line(x0, y0, x1, y1, 'k', 0.35);
      d.blob(11.4, 10.6, 1.8, 0.8, 'w', 0, 1); d.blob(13.2, 10.6, 1.8, 0.8, 'w', 0, 2); // wings
    }
    if (F.id === 'amberfeather') {
      d.line(7.4, 17.4, 16.6, 7.6, 'q', 0.5);
      for (let k = 1; k < 10; k++) { const x = 7.4 + k, y = 17.4 - k * 1.08; d.line(x, y, x - 1.6, y - 2.4, 'f', 0.4); d.line(x, y, x + 2.2, y + 1, 'f', 0.4); }
    }
    // glossy highlights + a bubble
    d.px(7.6, 8, 'h'); d.px(8.4, 7.2, 'h'); d.px(9.2, 7.2, 'w');
    d.px(16.4, 16.4, 'w');
  },
};
PAINT.amberbug = PAINT.amber; PAINT.amberfeather = PAINT.amber; PAINT.heartamber = PAINT.amber;

const KEYS = {
  ammonite: { A: 'bone.r@a', R: 'bone:3', D: 'tan:2', h: '#fffdf4' },
  trilobite: { A: 'slate.r@a', C: 'slate.R@a', D: 'slate:2', L: 'slate:4', E: 'black.R', h: '#ffffff' },
  fern: { S: 'stone.r@s', T: 'stone:2', F: 'black:3!', G: 'black:4!' },
  sharktooth: { A: 'slate.Y@a', D: 'slate:1', R: 'leather.r@r', h: '#c8d4e8' },
  crinoid: { A: 'stone.r@a', D: 'stone:2', C: 'stone.R@a', L: 'stone:5' },
  fishskull: { A: 'bone.r@a', B: 'bone.R@b', D: 'tan:3', L: 'bone:5', E: 'black.r' },
  lobescale: { A: 'navy.R@a', D: 'navy:2', L: 'blue:4', R: 'navy:1', h: '#d8f0ff' },
  raptorclaw: { A: 'bone.x@a', K: 'leather.R@a', h: '#fffdf4' },
  sabrefang: { A: 'bone.x@a', D: 'bone:2', R: 'syrup.r@r', h: '#fffdf4' },
  mammoth: { A: 'cream.r@a', T: 'tan.x@t', L: 'cream:5', R: 'leather:3' },
  dinoegg: { A: 'sand.r@a', D: 'sand:2', h: '#fffaf0' },
  coelacanth: { S: 'stone.r@s', T: 'stone:2', A: 'slate.r@a', B: 'slate.R@a', D: 'slate:2' },
  amber: { A: 'honey.R@a', D: 'syrup.R@a', H: 'red.R@h', G: 'fire.R@h', W: '#fff6c0', h: '#fffbe0', w: '#ffe9a8', q: 'cream:3!', f: 'cream:4!' },
};
const keyOf = (F) => (F.kind === 'amber' ? KEYS.amber : KEYS[F.id] || KEYS.ammonite);

const _cache = new Map();
export function findPix(id, s = 1) {
  const F = FIND_BY_ID[id] || FIND_BY_ID.ammonite;
  const k = F.id + '|' + s;
  let p = _cache.get(k);
  if (p) return p;
  const N = Math.round(24 * s);
  const g = new Grid(N, N);
  try { (PAINT[F.id] || PAINT.ammonite)(kit(g, s), F); } catch (e) { console.warn('findArt', id, e); }
  p = render(g, keyOf(F), { k: 3 });
  _cache.set(k, p);
  return p;
}
const _cv = new Map();
export function findCanvas(id, s = 1, scale = 2) {
  const k = `${id}|${s}|${scale}`;
  let c = _cv.get(k);
  if (!c) { c = pixCanvas(findPix(id, s), scale); _cv.set(k, c); }
  return c;
}
const _url = new Map();
export function findURL(id, s = 1, scale = 2) {
  const k = `${id}|${s}|${scale}`;
  let u = _url.get(k);
  if (!u) { u = findCanvas(id, s, scale).toDataURL(); _url.set(k, u); }
  return u;
}
export function findImg(id, { s = 1, scale = 2, cls = '' } = {}) {
  return `<img class="px ${cls}" src="${findURL(id, s, scale)}" alt="" draggable="false" style="image-rendering:pixelated">`;
}

/** a crusty lump of matrix rock, a corner of the find peeking out (uncleaned specimen) */
export function crustPix(id, seed = 1, s = 1) {
  const F = FIND_BY_ID[id] || FIND_BY_ID.ammonite;
  const N = Math.round(24 * s);
  const g = new Grid(N, N);
  const d = kit(g, s);
  d.blob(12, 13, 9.4, 8.2, 'M', 0.22, seed * 7 + 3);
  d.each((x, y, c) => (c === 'M' && hsh(Math.floor(x * 1.3), Math.floor(y * 1.3), seed) < 0.12 ? 'P' : c === 'M' && hsh(Math.floor(x), Math.floor(y), seed + 5) < 0.06 ? 'L' : null));
  d.line(6 + (seed % 3), 9, 10, 12 + (seed % 2), 'k', 0.5);
  // the peek: a glint of amber or a curl of bone
  if (F.kind === 'amber') { d.blob(15.6, 9.6, 2.2, 1.8, 'A', 0.2, seed); d.px(15, 9, 'h'); }
  else { d.blob(15.2, 10, 2.4, 1.4, 'B', 0.2, seed); d.px(14.4, 9.6, 'h'); }
  const key = { M: 'stone.r@m', P: 'sand:2', L: 'stone:5', A: 'honey.R', B: 'bone.r', h: '#fffbe8' };
  return render(g, key, { k: 3 });
}
export function silhouettePix(id, s = 1) {
  const src = findPix(id, s);
  const p = new BPix(src.w, src.h);
  for (let i = 0; i < src.w * src.h; i++) if (src.d[i * 4 + 3] > 127) { p.d[i * 4] = 74; p.d[i * 4 + 1] = 58; p.d[i * 4 + 2] = 44; p.d[i * 4 + 3] = 255; }
  return p;
}
export function pixURL(p, scale = 2) { return pixCanvas(p, scale).toDataURL(); }
