// Pixel-art fish sprites for "The Bear Must Eat".
//
// Side view, facing RIGHT (the game mirrors them for left), 26 texels per
// world unit. Style: 1px outline that is a darkened version of the local
// colour, 4-6 tone hue-shifted shading with the light from the top-left, a
// bright rim along the back, lighter belly, fin rays, gill line and a bright
// eye with a 1px shine.
//
// How it works
//   Every species has an art definition (body profile, fins, head details,
//   pattern ops, palette) in DEFS below. A small implicit renderer turns a
//   definition + a pose (swim frame, flop, fry) into an "index sprite": each
//   pixel stores a semantic palette slot (material + tone) plus its body
//   coordinates. Morph palettes (albino, golden, prismatic, ...) are derived
//   programmatically at colorize time, so every species gets every morph.
//
// Nothing is rendered at import time; everything is built on first use and
// cached.

import { SPECIES } from '../data/species.js';

export const FISH_TEXELS_PER_UNIT = 26;
export const FISH_FRAMES = 5; // 0..3 swim cycle, 4 = flop (held up)

const MORPH_LIST = ['normal', 'albino', 'melanistic', 'calico', 'ghost', 'golden', 'rainbow'];

// ===========================================================================
// Small math helpers
// ===========================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function strSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, oct = 3) {
  let s = 0, n = 0, amp = 1, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, seed + i * 31) * amp; n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}

// Monotone cubic interpolation through [[x, y], ...] (x ascending).
function monotone(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
// Linear interpolation through [[x, y], ...]
function polyline(pts) {
  return (x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1);
      }
    }
    return pts[pts.length - 1][1];
  };
}
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ===========================================================================
// Colour: OKLab / OKLCH based hue-shifted ramps
// ===========================================================================
function hexRgb(h) {
  if (Array.isArray(h)) return h.slice(0, 3);
  const n = typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function rgbLch(rgb) {
  const r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
function lchLinear(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (c) => c[0] > -1e-4 && c[0] < 1.0001 && c[1] > -1e-4 && c[1] < 1.0001 && c[2] > -1e-4 && c[2] < 1.0001;
function lchRgb(L, C, H) {
  L = clamp(L, 0, 1);
  let c = lchLinear(L, C, H);
  if (!inGamut(c)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (inGamut(lchLinear(L, mid, H))) lo = mid; else hi = mid; }
    c = lchLinear(L, lo, H);
  }
  return [0, 1, 2].map((i) => Math.round(clamp(toGam(clamp(c[i], 0, 1)), 0, 1) * 255));
}
// Hue shifting: shadows drift toward blue-violet / crimson, highlights toward
// warm yellow, each along the "natural" side of the colour wheel (blue
// highlights go cyan, not violet; yellow shadows go amber, not green).
function shiftHue(h, dh) {
  if (!dh) return h;
  const k = Math.abs(dh);
  let dir;
  if (dh < 0) dir = h >= 32 && h < 118 ? -1 : h >= 118 && h < 282 ? 1 : h >= 282 ? -0.6 : -1; // shadows
  else dir = h >= 118 && h < 300 ? -1 : h >= 96 && h < 118 ? -0.3 : 1; // highlights
  return (h + dir * k + 360) % 360;
}
// Lightness shift with hue shift (dh < 0 shadow side, dh > 0 highlight side)
// and chroma scale.
function tweak(col, dL, dh = 0, cMul = 1) {
  let [L, C, H] = rgbLch(hexRgb(col));
  if (C < 0.02 && dh) { H = dh < 0 ? 265 : 85; C = Math.max(C, 0.005 + Math.abs(dh) * 0.00035); }
  return lchRgb(L + dL, C * cMul, shiftHue(H, dh));
}
function mixRgb(a, b, t) {
  a = hexRgb(a); b = hexRgb(b);
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}
function lightness(col) { return rgbLch(hexRgb(col))[0]; }
// 5-tone ramp: 0 deep shadow, 1 shadow, 2 base, 3 light, 4 highlight
function ramp5(col, spread = 1) {
  const c = hexRgb(col);
  return [
    tweak(c, -0.2 * spread, -22, 1.02),
    tweak(c, -0.1 * spread, -11, 1.0),
    c,
    tweak(c, 0.075 * spread, 9, 0.93),
    tweak(c, 0.15 * spread, 17, 0.8),
  ];
}
function outlineOf(col, k = 0.42, floor = 0.13, ceil = 0.34) {
  const c = hexRgb(col);
  const L = rgbLch(c)[0];
  const Lt = clamp(L * k, floor, ceil);
  return tweak(c, Lt - L, -26, 0.78);
}

// ===========================================================================
// Materials (semantic palette slots)
// ===========================================================================
const NONE = 0, BACK = 1, SIDE = 2, BELLY = 3, HEAD = 4, FIN = 5, FIN2 = 6, FINX = 7,
  P1 = 8, P2 = 9, P3 = 10, P4 = 11, P5 = 12, P6 = 13, SCUTE = 14,
  RING = 15, IRIS = 16, PUPIL = 17, SHINE = 18, MOUTH = 19, TEETH = 20, GILL = 21, OUTL = 22, BARB = 23, SPARK = 24, GAPE = 25;
const NMAT = 26;
const MAT_BY_NAME = { back: BACK, side: SIDE, belly: BELLY, head: HEAD, fin: FIN, fin2: FIN2, finx: FINX, p1: P1, p2: P2, p3: P3, p4: P4, p5: P5, p6: P6, scute: SCUTE, iris: IRIS, pupil: PUPIL, shine: SHINE, mouth: MOUTH, teeth: TEETH, barb: BARB };
const isBodyMat = (m) => m >= BACK && m <= HEAD;
const isFinMat = (m) => m >= FIN && m <= FINX;
const isPatMat = (m) => m >= P1 && m <= SCUTE;
// parts
const PT_BODY = 1, PT_FIN = 2, PT_TAIL = 3, PT_PEC = 4, PT_EYE = 5, PT_DET = 6, PT_LINE = 7;

function newBuf(w, h) {
  const n = w * h;
  return { w, h, mat: new Uint8Array(n), tone: new Uint8Array(n), base: new Uint8Array(n), part: new Uint8Array(n), lock: new Uint8Array(n), fs: new Float32Array(n), fn: new Float32Array(n) };
}

// light direction (toward the light): from the top-left, toward the viewer
const LX = -0.26, LY = 0.56, LZ = 0.79;

// ===========================================================================
// Geometry: compile an art definition (TL units: s = 0 snout .. 1 tail tip,
// t = up) into pixel-space lookups for a given length P (interior px)
// ===========================================================================
const TAILS = {
  // normalized [u along the tail 0..1, v up -1..1]; base vertices are added
  fork: [[0.35, 0.58], [0.72, 0.9], [1, 1.02], [0.9, 0.72], [0.74, 0.34], [0.62, 0.02], [0.62, -0.02], [0.74, -0.34], [0.9, -0.72], [1, -1.02], [0.72, -0.9], [0.35, -0.58]],
  deep: [[0.35, 0.6], [0.72, 0.92], [1, 1.04], [0.86, 0.66], [0.64, 0.28], [0.48, 0.02], [0.48, -0.02], [0.64, -0.28], [0.86, -0.66], [1, -1.04], [0.72, -0.92], [0.35, -0.6]],
  emarg: [[0.38, 0.62], [0.78, 0.94], [1, 1], [0.96, 0.62], [0.86, 0.2], [0.82, 0], [0.86, -0.2], [0.96, -0.62], [1, -1], [0.78, -0.94], [0.38, -0.62]],
  square: [[0.42, 0.66], [0.84, 0.95], [1, 1], [1, 0.5], [0.96, 0], [1, -0.5], [1, -1], [0.84, -0.95], [0.42, -0.66]],
  round: [[0.3, 0.72], [0.62, 0.96], [0.84, 0.88], [0.97, 0.56], [1, 0.16], [1, -0.16], [0.97, -0.56], [0.84, -0.88], [0.62, -0.96], [0.3, -0.72]],
  point: [[0.4, 0.62], [0.8, 0.96], [1, 1.04], [0.9, 0.62], [0.8, 0.22], [0.76, 0], [0.8, -0.22], [0.9, -0.62], [1, -1.04], [0.8, -0.96], [0.4, -0.62]],
  hetero: [[0.4, 0.62], [0.78, 1.0], [1, 1.28], [0.86, 0.86], [0.64, 0.4], [0.46, 0.06], [0.42, -0.18], [0.5, -0.46], [0.56, -0.7], [0.4, -0.66], [0.2, -0.46]],
  rfork: [[0.4, 0.62], [0.74, 0.92], [0.92, 1.0], [1.0, 0.86], [0.97, 0.6], [0.82, 0.26], [0.7, 0.03], [0.7, -0.03], [0.82, -0.26], [0.97, -0.6], [1.0, -0.86], [0.92, -1.0], [0.74, -0.92], [0.4, -0.62]],
  flow: [[0.22, 0.72], [0.5, 0.98], [0.78, 1.06], [1, 1], [0.94, 0.7], [0.84, 0.42], [0.72, 0.12], [0.68, -0.04], [0.76, -0.3], [0.9, -0.6], [1, -0.92], [0.86, -1.1], [0.58, -1.08], [0.3, -0.86]],
};

function compile(def, P) {
  const F = { def, P, sP: def.sP * P, dorsal: [], ventral: [], pats: [], stamps: [] };
  const topF = monotone(def.top), botF = monotone(def.bot);
  const n = Math.ceil(F.sP * 4) + 12;
  F.topL = new Float32Array(n); F.botL = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.min(i / 4, F.sP) / P;
    F.topL[i] = topF(u) * P; F.botL[i] = botF(u) * P;
  }
  F.bs = polyline(def.zones?.bs || [[0, 0.42]]);
  F.sb = polyline(def.zones?.sb || [[0, -0.34]]);
  F.round = def.round ?? 0.55;
  F.rim = def.rim || [0.06, 0.72];
  F.headZ = def.head ? { s: polyline(def.head.s), belly: def.head.belly ?? false } : null;
  const finOf = (f) => {
    const len = (f.s1 - f.s0) * P;
    // rays/spines only when they can sit at least 2px apart
    const spines = f.spines ? Math.min(f.spines, Math.floor(len / 2)) : 0;
    const rays = f.rays ? Math.min(f.rays, Math.floor(len / 2)) : 0;
    return {
      ...f, spines, rays,
      s0: f.s0 * P, s1: f.s1 * P,
      H: monotone(f.h.map(([sg, hh]) => [sg, hh * P])),
      mat: f.mat ? MAT_BY_NAME[f.mat] : FIN,
      spacing: len / Math.max(1, spines || rays || 1),
    };
  };
  for (const f of def.dorsal || []) F.dorsal.push(finOf(f));
  F.cover = new Uint8Array(Math.ceil(P) + 4);
  for (const f of F.dorsal) for (let x = Math.floor(f.s0); x <= Math.ceil(f.s1); x++) if (x >= 0 && x < F.cover.length) F.cover[x] = 1;
  for (const f of def.ventral || []) F.ventral.push(finOf(f));
  // tail
  const T = def.tail || { type: 'fork', spread: 0.12 };
  const Lt = P - F.sP;
  const hbT = topAt(F, F.sP), hbB = botAt(F, F.sP);
  const tc = (hbT - hbB) / 2, hb = (hbT + hbB) / 2;
  const spread = T.spread * P;
  const tmpl = T.poly || TAILS[T.type] || TAILS.fork;
  const poly = [[-1.5, hb + 0.2], ...tmpl.map(([u, v]) => [u * Lt, v * spread]), [-1.5, -hb - 0.2]];
  F.tail = { ...T, m: MAT_BY_NAME[T.mat] || FIN, Lt, tc, hb, spread, poly, lift: T.lift || 0, a0: hb * 1.6 + 1, rays: Math.min(T.rays ?? 4, Math.floor(spread / 2.2)) };
  F.tail.dth = Math.atan2(spread, Lt + F.tail.a0) / Math.max(1, F.tail.rays);
  // pectoral
  if (def.pec) F.pec = { s: def.pec.s * P, t: def.pec.t * P, L: def.pec.len * P, W: Math.max(1.6, def.pec.w * P), ang: def.pec.ang ?? 25, mat: MAT_BY_NAME[def.pec.mat] || FIN };
  // hinge for the open-mouth flop frame
  if (def.mouth?.pts) {
    const pts = def.mouth.pts;
    const last = pts[pts.length - 1];
    F.jaw = { hs: (def.mouth.hinge ?? last[0]) * P, ht: (def.mouth.hingeT ?? pts[0][1]) * P, g: ((def.mouth.gape ?? 20) * Math.PI) / 180, teeth: !!def.mouth.teethOpen, f0: def.mouth.front != null ? def.mouth.front * P : -1e9 };
  }
  // big spike teeth / tusks: polygons drawn over everything, fixed to the
  // upper jaw (they stay put when the mouth drops open)
  if (def.fangs) {
    F.fangs = def.fangs.map((fg) => {
      const pts = (fg.pts || fg).map(([s, t]) => [s * P, t * P]);
      const xs = pts.map((q) => q[0]), ts = pts.map((q) => q[1]);
      return { pts, s0: Math.min(...xs), s1: Math.max(...xs), t0: Math.min(...ts), t1: Math.max(...ts), cs: xs.reduce((a, b) => a + b, 0) / xs.length, mat: MAT_BY_NAME[fg.mat] || SCUTE };
    });
  }
  if (def.scutes) {
    const sc = def.scutes, step = sc.step * P;
    F.scuteRow = [];
    for (let x = sc.s0 * P; x <= sc.s1 * P; x += step) F.scuteRow.push(x);
    F.scuteW = Math.max(1.2, sc.w * P); F.scuteH = Math.max(1, sc.h * P);
  }
  // patterns
  for (const p of def.pats || []) compilePat(F, p);
  return F;
}
function lut(L, s) {
  const x = clamp(s * 4, 0, L.length - 1.001);
  const i = x | 0, f = x - i;
  return L[i] + (L[i + 1] - L[i]) * f;
}
function topAt(F, s) { return lut(F.topL, s); }
function botAt(F, s) { return lut(F.botL, s); }

// ---------------------------------------------------------------- patterns
// Per-pixel pattern ops receive (F, s, t, n, u, R) in px/normalized units and
// may overwrite R.mat (the base stays the body zone).
function compilePat(F, p) {
  const P = F.P, mat = MAT_BY_NAME[p.mat] || P1;
  const seed = strSeed(F.def.id + ':' + (p.seed ?? F.pats.length));
  switch (p.op) {
    case 'bars': {
      const s0 = p.s0 * P, s1 = p.s1 * P, cnt = p.n;
      const cs = [];
      const r = rng(seed);
      for (let i = 0; i < cnt; i++) cs.push(s0 + ((i + 0.5) * (s1 - s0)) / cnt + (r() - 0.5) * (p.jit || 0) * P);
      const hwT = (p.hw ?? 0.02) * P, hwB = (p.hwBot ?? p.hw ?? 0.02) * P;
      const nTop = p.nTop ?? 1.2, nBot = p.nBot ?? -0.3;
      const slant = p.slant || 0, wav = (p.wave || 0) * P, brk = p.broken || 0;
      F.pats.push((F, s, t, n, u, R) => {
        if (n > nTop || n < nBot) return;
        const k = (n - nBot) / (nTop - nBot || 1);
        const hw = lerp(hwB, hwT, clamp(k, 0, 1));
        const ss = s - slant * t - wav * Math.sin(t * 0.9 + s * 0.13);
        for (let i = 0; i < cs.length; i++) {
          const d = Math.abs(ss - cs[i]);
          if (d < hw) {
            if (brk && vnoise(s * 0.45, t * 0.6, seed + i) < brk) return;
            if (!p.over && (R.tone === 4 || R.tone === 1)) return;
            R.mat = mat; if (p.tone != null) R.tone = p.tone; return;
          }
        }
      });
      break;
    }
    case 'band': {
      const n0 = polyline(p.n0.length ? p.n0 : [[0, p.n0]]), n1 = polyline(p.n1.length ? p.n1 : [[0, p.n1]]);
      const s0 = p.s0 * P, s1 = p.s1 * P, jag = p.jag || 0, fr = p.freq || 0.5;
      F.pats.push((F, s, t, n, u, R) => {
        if (s < s0 || s > s1) return;
        const j = jag ? (vnoise(s * fr, 3.3, seed) - 0.5) * jag : 0;
        const nn = n + j;
        if (nn >= n0(u) && nn <= n1(u)) R.mat = mat;
      });
      break;
    }
    case 'saddles': {
      const s0 = p.s0 * P, s1 = p.s1 * P, cnt = p.n;
      const cs = [];
      for (let i = 0; i < cnt; i++) cs.push(s0 + ((i + 0.5) * (s1 - s0)) / cnt);
      const hw = (p.hw ?? 0.03) * P, nD = p.nD ?? 0.1;
      F.pats.push((F, s, t, n, u, R) => {
        if (n < nD) return;
        const k = Math.pow((n - nD) / (1 - nD), p.pow ?? 0.6);
        for (const c of cs) if (Math.abs(s - c) < hw * k + 0.25) { R.mat = mat; return; }
      });
      break;
    }
    case 'worms': {
      const s0 = p.s0 * P, s1 = p.s1 * P, sc = (p.scale || 0.07) * P, wd = p.width ?? 0.13;
      const n0 = p.n0 ?? -1, n1 = p.n1 ?? 1;
      const lv = p.levels || [0.5];
      F.pats.push((F, s, t, n, u, R) => {
        if (s < s0 || s > s1 || n < n0 || n > n1) return;
        if (!p.over && (R.tone === 4 || R.tone === 1)) return;
        // 1px contour lines of a noise field: a maze of wiggly worm tracks
        const a = fbm(s / sc, t / sc, seed, 2), b = fbm((s + 1) / sc, t / sc, seed, 2), c = fbm(s / sc, (t + 1) / sc, seed, 2);
        for (const L of lv) if ((a > L) !== (b > L) || (a > L) !== (c > L)) { R.mat = mat; if (p.tone != null) R.tone = p.tone; return; }
      });
      break;
    }
    case 'mottle': {
      const sc = (p.scale || 0.08) * P, th = p.th ?? 0.6, n0 = p.n0 ?? -1, n1 = p.n1 ?? 1;
      const s0 = (p.s0 ?? 0) * P, s1 = (p.s1 ?? 1) * P;
      F.pats.push((F, s, t, n, u, R) => {
        if (s < s0 || s > s1 || n < n0 || n > n1) return;
        if (fbm(s / sc, (t / sc) * (p.sq || 1), seed, 3) > th) R.mat = mat;
      });
      break;
    }
    case 'blob': {
      const cs = p.s * P, ct = p.t * P, rs = p.rs * P, rt = p.rt * P;
      F.pats.push((F, s, t, n, u, R) => {
        const a = (s - cs) / rs, b = (t - ct) / rt;
        if (a * a + b * b <= 1) { R.mat = mat; if (p.tone != null) R.tone = p.tone; if (p.lock) R.lock = 1; }
      });
      break;
    }
    case 'head': {
      const cut = polyline(p.s);
      F.pats.push((F, s, t, n, u, R) => {
        if (u < cut(n) && (p.belly || R.base !== BELLY)) { R.mat = mat; R.base = mat; }
      });
      break;
    }
    case 'spots':
    case 'stamp':
    case 'lines':
    case 'plates':
      F.stamps.push({ ...p, mat, seed, halo: p.halo ? MAT_BY_NAME[p.halo] : 0 });
      break;
    default:
      break;
  }
}

// ===========================================================================
// Sampling the implicit fish at fish-space (s px from snout, t px up)
// ===========================================================================
// Zone-based pixel-art shading: a bright rim along the back, a lit upper
// flank, a light belly with a 1px shadow above the outline. Few tones, clean
// bands, like a hand-shaded sprite.
function shadeBody(F, s, t, top, bot, R) {
  const n = t >= 0 ? (top > 0.01 ? t / top : 0) : bot > 0.01 ? t / bot : 0;
  const u = s / F.P;
  const nBS = F.bs(u), nSB = F.sb(u);
  let z = n > nBS ? BACK : n < nSB ? BELLY : SIDE;
  const dT = top - t, dB = t + bot;
  const big = F.P >= 30;
  let tone;
  if (z === BACK) {
    tone = 2;
    const rimOk = u > F.rim[0] && u < F.rim[1] && !F.cover[Math.round(s)];
    if (dT < 1 && rimOk) tone = 4;
    else if (big && dT < 2 && rimOk && u > F.rim[0] + 0.05 && u < F.rim[1] - 0.12) tone = 3;
  } else if (z === SIDE) {
    tone = n > lerp(nSB, nBS, F.def.litSide ?? 0.45) ? 3 : 2;
    if (dT < 1 && u > F.rim[0] && u < F.rim[1] && !F.cover[Math.round(s)]) tone = 4;
    if (dB < 1) tone = 1;
  } else {
    tone = 3;
    // 1px shade above the outline, only where the belly band is thick enough
    if (dB < 1 && (t - nSB * bot) > 1.2) tone = F.def.bellyShade ?? 2;
  }
  if (u > F.sP / F.P - 0.05 && tone > 1 && z !== BELLY && dT >= 1) tone--; // peduncle falls into shade
  // scale texture: a sparse lattice of lighter scale glints
  const sc = F.def.scales;
  if (sc && (tone === 2 || tone === 3) && dT >= 1 && dB >= 1 && u > (sc.s0 ?? 0.2) && u < F.sP / F.P - 0.04) {
    const per = sc.per || 4, yi = Math.floor(t + 64), xi = Math.floor(s + (yi >> 1) % 2 * (per >> 1));
    if (yi % 2 === 0 && xi % per === 0 && (z !== BELLY || sc.belly)) tone = sc.dark ? tone - 1 : Math.min(4, tone + 1);
  }
  R.mat = z; R.base = z; R.tone = tone; R.part = PT_BODY; R.fs = u; R.fn = n;
  for (let i = 0; i < F.pats.length; i++) F.pats[i](F, s, t, n, u, R);
}

function finLine(f, sg) {
  const cnt = f.spines || f.rays;
  if (!cnt) return false;
  const k = sg * cnt;
  return Math.abs(k - Math.round(k)) * f.spacing < 0.5;
}

function sampleFins(F, s, t, R) {
  for (let pass = 0; pass < 2; pass++) {
    const list = pass ? F.ventral : F.dorsal;
    for (const f of list) {
      if (s < f.s0 - 8 || s > f.s1 + 14) continue;
      const cs = clamp(s, 0, F.sP);
      const d = pass ? -t - botAt(F, cs) : t - topAt(F, cs);
      if (d <= 0) continue;
      const sg = (s - f.rake * d - f.s0) / (f.s1 - f.s0);
      if (sg < 0 || sg > 1) continue;
      let H = f.H(sg);
      if (f.spines) { const tri = Math.abs(2 * ((sg * f.spines) % 1) - 1); H *= 1 - (f.dip ?? 0.3) * (1 - tri); }
      if (d > H) continue;
      R.mat = f.mat; R.base = f.mat; R.part = PT_FIN; R.fs = s / F.P; R.fn = pass ? -1 : 1;
      R.tone = d < 1 && !f.flat ? 1 : finLine(f, sg) ? 2 : d > H - 1 && H > 2.2 ? 4 : 3;
      if (f.edge && d > H - 1) { R.mat = MAT_BY_NAME[f.edge] || FINX; R.tone = f.edgeTone ?? 2; }
      if (f.lead && sg < (f.leadW ?? 0.2)) { R.mat = MAT_BY_NAME[f.lead] || FINX; R.tone = 2; }
      if (f.spot && Math.hypot((sg - f.spot[0]) * (f.s1 - f.s0), d - f.spot[1] * F.P) < f.spot[2] * F.P) { R.mat = MAT_BY_NAME[f.spot[3] || 'p2']; R.tone = 2; }
      if (f.band && d > H * f.band[0] && d < H * f.band[1]) { R.mat = MAT_BY_NAME[f.band[2] || 'p2']; R.tone = 2; }
      return true;
    }
  }
  return false;
}

function sampleTail(F, s, t, R) {
  const T = F.tail;
  const a = s - F.sP;
  if (a < -1.5 || a > T.Lt + 1) return false;
  const b = t - T.tc - T.lift * Math.max(0, a);
  if (!inPoly(T.poly, a, b)) return false;
  const u = a / T.Lt;
  const th = Math.atan2(b, a + T.a0);
  const k = th / T.dth;
  const r = Math.hypot(b, a + T.a0);
  const onRay = Math.abs(k - Math.round(k)) * T.dth * r < 0.55;
  R.mat = T.m; R.base = T.m; R.part = PT_TAIL; R.fs = s / F.P; R.fn = b / (T.spread || 1);
  R.tone = u < 0.14 ? 1 : onRay && u < 0.9 ? 2 : u > 0.9 ? 4 : 3;
  if (T.tipLow && b < -T.spread * 0.45 && u > 0.5) { R.mat = MAT_BY_NAME[T.tipLow] || FINX; R.tone = 2; }
  if (T.tipUp && b > T.spread * 0.45 && u > 0.5) { R.mat = MAT_BY_NAME[T.tipUp] || FINX; R.tone = 2; }
  if (T.edge && u > (T.edgeAt ?? 0.84)) { R.mat = MAT_BY_NAME[T.edge] || FINX; R.tone = 2; }
  return true;
}

function samplePec(F, s, t, ang, R) {
  const p = F.pec;
  const ds = s - p.s, dt = t - p.t;
  const a = (ang * Math.PI) / 180;
  const es = Math.cos(a), et = -Math.sin(a);
  const along = ds * es + dt * et;
  if (along < -0.3 || along > p.L) return false;
  const across = -ds * et + dt * es;
  const u = along / p.L;
  const hw = (p.W / 2) * (u < 0.6 ? 0.45 + 0.55 * Math.sqrt(Math.max(0, u / 0.6)) : Math.sqrt(Math.max(0, 1 - ((u - 0.6) / 0.4) ** 2)));
  if (Math.abs(across) > hw + 0.2) return false;
  R.mat = p.mat; R.base = p.mat; R.part = PT_PEC; R.fs = s / F.P; R.fn = 0;
  R.tone = u < 0.25 ? 3 : 4;
  if (F.def.pec.lead && across > hw - 1) { R.mat = MAT_BY_NAME[F.def.pec.lead] || FINX; R.tone = 2; }
  return true;
}

function sampleCore(F, s, t, pose, R) {
  R.mat = 0;
  if (F.pec && pose.pecAng != null && samplePec(F, s, t, pose.pecAng, R)) return;
  if (s >= 0 && s <= F.sP) {
    const top = topAt(F, s), bot = botAt(F, s);
    if (t <= top && t >= -bot) { shadeBody(F, s, t, top, bot, R); return; }
  }
  if (s > F.sP - 1.5 && sampleTail(F, s, t, R)) return;
  if (sampleFins(F, s, t, R)) return;
  if (F.scuteRow && s > 0 && s < F.sP) {
    // bony plates along the back poke through the silhouette
    const top = topAt(F, s), d = t - top;
    if (d > 0 && d < F.scuteH + 0.5) {
      for (const c of F.scuteRow) {
        const k = 1 - Math.abs(s - c) / F.scuteW;
        if (k > 0 && d < F.scuteH * k + 0.35) { R.mat = SCUTE; R.base = BACK; R.part = PT_BODY; R.tone = s < c ? 3 : 2; R.fs = s / F.P; R.fn = 1; return; }
      }
    }
  }
}

// Open mouth (flop pose): the lower jaw swings down around a hinge behind
// the mouth corner; the gap shows the dark mouth.
function sampleFangs(F, s, t, R) {
  for (const fg of F.fangs) {
    if (s < fg.s0 - 0.5 || s > fg.s1 + 0.5 || t < fg.t0 - 0.5 || t > fg.t1 + 0.5 || !inPoly(fg.pts, s, t)) continue;
    // lit from the top-left: the tail-side half of the spike catches the light
    R.mat = fg.mat; R.base = HEAD; R.part = PT_DET; R.fs = s / F.P; R.fn = 0;
    R.tone = t < fg.t0 + (fg.t1 - fg.t0) * 0.3 ? 2 : s >= fg.cs ? 4 : 3;
    return true;
  }
  return false;
}

function sampleFish(F, s, t, pose, R) {
  if (F.fangs && sampleFangs(F, s, t, R)) return;
  const J = pose.open && F.jaw;
  if (J && s < J.hs + 0.5 && s > -3 && s >= J.f0) {
    const ds = s - J.hs, dt = t - J.ht;
    if (ds < 0 && dt < 0.5) {
      const c = Math.cos(J.g), sn = Math.sin(J.g);
      const ds2 = ds * c + dt * sn, dt2 = -ds * sn + dt * c; // rotate back up
      if (dt2 < 0) {
        sampleCore(F, J.hs + ds2, J.ht + dt2, pose, R);
        if (R.mat && R.part === PT_BODY) return;
      }
      if (dt < 0) {
        const topClosed = topAt(F, clamp(s, 0, F.sP));
        if (dt2 >= 0 && t < topClosed && s >= -0.5) {
          const tooth = J.teeth && dt > -1.1 && s > 0.8 && Math.floor(s) % 2 === 0;
          R.mat = tooth ? TEETH : GAPE; R.base = BELLY; R.tone = tooth ? 2 : dt2 < 1 ? 1 : 2; R.part = PT_BODY; R.fs = s / F.P; R.fn = 0; return;
        }
        R.mat = 0;
        return;
      }
    }
  }
  sampleCore(F, s, t, pose, R);
}

// ===========================================================================
// Poses. inv(px, py, Q) maps a sprite pixel centre to fish space (Q.s, Q.t);
// fwd(s, t) maps fish space to sprite coordinates.
// ===========================================================================
function extents(F) {
  // generous vertical extents (px) of the straight fish incl. fins
  let up = 0, dn = 0;
  for (let s = 0; s <= F.sP; s += 0.5) { up = Math.max(up, topAt(F, s)); dn = Math.max(dn, botAt(F, s)); }
  for (const f of F.dorsal) for (let k = 0; k <= 10; k++) up = Math.max(up, topAt(F, clamp(lerp(f.s0, f.s1, k / 10), 0, F.sP)) + f.H(k / 10));
  for (const f of F.ventral) for (let k = 0; k <= 10; k++) dn = Math.max(dn, botAt(F, clamp(lerp(f.s0, f.s1, k / 10), 0, F.sP)) + f.H(k / 10));
  const T = F.tail;
  for (const [a, v] of T.poly) { const b = v + T.tc + T.lift * Math.max(0, a); up = Math.max(up, b); dn = Math.max(dn, -b); }
  if (F.pec) dn = Math.max(dn, -F.pec.t + F.pec.L);
  if (F.fangs) for (const fg of F.fangs) { up = Math.max(up, fg.t1); dn = Math.max(dn, -fg.t0); }
  return { up: up + 3, dn: dn + 4 };
}

// straight, un-animated pose used for sampling decisions (spot placement)
const POSE0 = { pecAng: null };

function swimPose(F, f, fry) {
  const ex = extents(F);
  const W = Math.ceil(F.P) + 10, H = Math.ceil(ex.up + ex.dn) + 8;
  const xs = W - 5, ya = Math.ceil(ex.up) + 4;
  const sw = F.def.swim || {};
  const T = (sw.tilt ?? 0.2) * (fry ? 1.2 : 1);
  // [tailTilt, foreshortening, peduncle offset, pectoral angle offset]
  const seq = fry
    ? [[T, 0.95, 0.35, 12], [-T, 0.74, -0.35, -8]]
    : [[0, 1, 0, 0], [T, 0.86, 0.55, 16], [0, 0.72, 0, 4], [-T, 0.86, -0.55, -10]];
  let [tilt, k, dyP, pa] = seq[f % seq.length];
  const s0 = F.sP * (sw.flex ?? 0.6);
  let dy = (s) => (s <= s0 ? 0 : dyP * smooth(s0, F.sP, s));
  if (sw.wave) {
    // anguilliform swimming: a sine wave travels down the body, the head
    // stays steady and the tail continues the wave's slope
    const amp = sw.wave * F.P, kw = (2 * Math.PI * (sw.cycles ?? 1.25)) / F.P, ph = (f * 2 * Math.PI) / seq.length;
    const e0 = F.P * (sw.still ?? 0.12), e1 = F.P * 0.5;
    dy = (s) => amp * Math.sin(kw * s - ph) * smooth(e0, e1, s);
    dyP = dy(F.sP); k = 1;
    tilt = clamp(dy(F.sP) - dy(F.sP - 1), -0.5, 0.5);
  }
  const pecAng = (F.def.pec?.ang ?? 25) + pa * (sw.pec ?? 1);
  return {
    W, H, pecAng, open: 0, wide: false,
    inv(px, py, Q) {
      const sr = xs - px;
      if (sr < -1 || sr > F.P + 2) return false;
      if (sr <= F.sP) { Q.s = sr; Q.t = ya - py - dy(sr); }
      else { Q.s = F.sP + (sr - F.sP) / k; Q.t = ya - py - dyP - tilt * (sr - F.sP); }
      return true;
    },
    fwd(s, t) {
      if (s <= F.sP) return [xs - s, ya - (t + dy(s))];
      const a = (s - F.sP) * k;
      return [xs - (F.sP + a), ya - (t + dyP + tilt * a)];
    },
  };
}

// Flop (held up): the spine is a curve whose curvature is zero along the
// rigid head and peaks mid-body, so the fish curls into a C with head and tail
// raised. Pixels map back to fish space through the nearest spine point.
function flopPose(F) {
  const L = F.P;
  const fl = F.def.flop || {};
  const K = fl.bend ?? 1.75;
  const n = Math.max(8, Math.ceil(L * 2)) + 1;
  const ds = L / (n - 1);
  const w = (u) => smooth(0.16, 0.4, u) * (1 - 0.55 * smooth(0.82, 1, u));
  let sumW = 0;
  for (let i = 0; i < n - 1; i++) sumW += w(i / (n - 1)) * ds;
  const X = new Float64Array(n), Y = new Float64Array(n), TH = new Float64Array(n);
  let th = Math.PI + K / 2, x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    X[i] = x; Y[i] = y; TH[i] = th;
    const dth = (K * w(i / (n - 1)) * ds) / sumW;
    const mid = th - dth / 2;
    x += Math.cos(mid) * ds; y += Math.sin(mid) * ds;
    th -= dth;
  }
  // level the chord (snout .. tail tip), then tilt the head up a touch
  const rot = -Math.atan2(Y[n - 1] - Y[0], X[n - 1] - X[0]) + Math.PI + ((fl.tilt ?? 5) * Math.PI) / 180;
  const c = Math.cos(rot), sn = Math.sin(rot);
  for (let i = 0; i < n; i++) { const xx = X[i] * c - Y[i] * sn, yy = X[i] * sn + Y[i] * c; X[i] = xx; Y[i] = yy; TH[i] += rot; }
  const ex = extents(F);
  const pad = Math.max(ex.up, ex.dn) + 3;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
  const W = Math.ceil(x1 - x0 + pad * 2 + 4), H = Math.ceil(y1 - y0 + pad * 2 + 4);
  const ox = -x0 + pad + 2, oy = y1 + pad + 2; // buffer x = X + ox, buffer y = oy - Y
  const maxT = pad + 1;
  return {
    W, H, pecAng: (F.def.pec?.ang ?? 25) + 28, open: fl.open ?? 1, wide: true,
    inv(px, py, Q) {
      const qx = px - ox, qy = oy - py;
      // nearest spine segment: coarse scan then local refine
      let best = 1e9, bi = 0;
      for (let i = 0; i < n; i += 4) { const d = (X[i] - qx) ** 2 + (Y[i] - qy) ** 2; if (d < best) { best = d; bi = i; } }
      if (best > (maxT + 6) ** 2) return false;
      let bs = 0, bt = 0, bd = 1e9;
      for (let i = Math.max(0, bi - 5); i < Math.min(n - 1, bi + 5); i++) {
        const ax = X[i + 1] - X[i], ay = Y[i + 1] - Y[i];
        let u = ((qx - X[i]) * ax + (qy - Y[i]) * ay) / (ax * ax + ay * ay);
        const uu = clamp(u, 0, 1);
        const cx = X[i] + ax * uu, cy = Y[i] + ay * uu;
        const d = (qx - cx) ** 2 + (qy - cy) ** 2;
        if (d < bd) {
          bd = d;
          const thm = TH[i] + (TH[i + 1] - TH[i]) * uu;
          const nx = Math.sin(thm), ny = -Math.cos(thm);
          // allow running past the ends so the snout / tail tip are not clipped
          const uEnd = i === 0 ? Math.min(u, 1) : i === n - 2 ? Math.max(u, 0) : uu;
          bs = (i + uEnd) * ds;
          bt = (qx - (X[i] + ax * uEnd)) * nx + (qy - (Y[i] + ay * uEnd)) * ny;
        }
      }
      if (Math.abs(bt) > maxT) return false;
      Q.s = bs; Q.t = bt;
      return true;
    },
    fwd(s, t) {
      const f = clamp(s / ds, 0, n - 1.001), i = Math.floor(f), u = f - i;
      const sx = X[i] + (X[i + 1] - X[i]) * u, sy = Y[i] + (Y[i + 1] - Y[i]) * u;
      const thm = TH[i] + (TH[i + 1] - TH[i]) * u;
      return [sx + Math.sin(thm) * t + ox, oy - (sy - Math.cos(thm) * t)];
    },
  };
}

// ===========================================================================
// Stamps: spots, eye, mouth, gill line, barbels
// ===========================================================================
const SPOTS = {
  dot: [[0, 0]],
  bean: [[0, 0], [1, 0]],
  bean3: [[-1, 0], [0, 0], [1, 0]],
  vbean: [[0, 0], [0, 1]],
  blob: [[0, 0], [1, 0], [0, 1], [1, 1]],
  blob3: [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]],
  plus: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  diag: [[0, 0], [1, 1]],
  cres: [[0, 0], [1, 0], [2, 1]],
};
const HALO4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const R_TMP = {};
function regionOk(st, R) {
  if (!R.mat) return false;
  const reg = st.region || 'body';
  if (reg === 'body') return R.part === PT_BODY && R.fn >= (st.n0 ?? -1) && R.fn <= (st.n1 ?? 1) && R.mat !== P2;
  if (reg === 'tail') return R.part === PT_TAIL;
  if (reg === 'dorsal') return R.part === PT_FIN && R.fn > 0;
  if (reg === 'fins') return R.part === PT_FIN || R.part === PT_TAIL;
  return true;
}
function spotList(F, st) {
  const P = F.P;
  const r = rng(st.seed);
  const sp = st.spacing * P;
  const list = [];
  const s0 = (st.s0 ?? 0) * P, s1 = (st.s1 ?? 1) * P;
  const up = P * 0.7;
  let row = 0;
  for (let t = up; t >= -up; t -= sp * (st.rowK ?? 0.8), row++) {
    for (let s = s0 + (row % 2 ? sp * 0.5 : 0); s <= s1; s += sp) {
      const cs = s + (r() - 0.5) * sp * (st.jit ?? 0.7), ct = t + (r() - 0.5) * sp * (st.jit ?? 0.7) * 0.7;
      const keep = r();
      if (cs < s0 || cs > s1) continue;
      if (st.p != null && keep > st.p) continue;
      sampleFish(F, cs, ct, POSE0, R_TMP);
      if (!regionOk(st, R_TMP)) continue;
      if (st.avoidEye && F.def.eye && Math.hypot(cs - F.def.eye.s * P, ct - F.def.eye.t * P) < st.avoidEye * P) continue;
      list.push([cs, ct, keep]);
    }
  }
  // greedy Poisson-disk thinning so spots never clump
  const minD = st.minD != null ? st.minD * P : Math.max(2.2, sp * 0.72);
  list.sort((a, b) => a[2] - b[2]);
  const out = [];
  for (const c of list) {
    if (out.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) < minD)) continue;
    out.push(c);
    if (st.max && out.length >= st.max) break;
  }
  return out;
}

function putPx(B, x, y, mat, tone, pred) {
  if (x < 0 || y < 0 || x >= B.w || y >= B.h) return false;
  const i = y * B.w + x;
  if (pred && !pred(i)) return false;
  B.mat[i] = mat;
  if (tone != null) B.tone[i] = tone;
  return true;
}
const onBody = (B) => (i) => B.part[i] === PT_BODY && B.mat[i] !== GILL && !B.lock[i];
const onBodyOrFin = (B) => (i) => (B.part[i] === PT_BODY || B.part[i] === PT_FIN || B.part[i] === PT_TAIL) && !B.lock[i];

function applyStamps(F, pose, B) {
  for (const st of F.stamps) {
    if (st.op === 'spots') {
      if (!st._list || st._P !== F.P) { st._list = spotList(F, st); st._P = F.P; }
      const shapeOf = (k) => SPOTS[Array.isArray(st.shape) ? st.shape[Math.floor(k * st.shape.length) % st.shape.length] : st.shape || 'dot'];
      const pred = st.region === 'body' || !st.region ? onBody(B) : onBodyOrFin(B);
      for (const [cs, ct, k] of st._list) {
        const [x, y] = pose.fwd(cs, ct);
        const xi = Math.floor(x), yi = Math.floor(y);
        const shape = shapeOf(k);
        if (st.halo) for (const [dx, dy] of st.haloShape === 'full' ? [...HALO4, [1, 1], [-1, -1], [1, -1], [-1, 1]] : HALO4) putPx(B, xi + dx, yi + dy, st.halo, st.haloTone ?? 2, pred);
        for (const [dx, dy] of shape) putPx(B, xi + dx, yi + dy, st.mat, st.tone ?? 2, pred);
      }
    } else if (st.op === 'stamp') {
      const [x, y] = pose.fwd(st.s * F.P, st.t * F.P);
      const rows = st.rows;
      const ax = Math.floor(rows[0].length / 2), ay = Math.floor(rows.length / 2);
      const pred = onBody(B);
      for (let j = 0; j < rows.length; j++) for (let i2 = 0; i2 < rows[j].length; i2++) {
        const ch = rows[j][i2];
        if (ch === '.') continue;
        putPx(B, Math.floor(x) - ax + i2, Math.floor(y) - ay + j, ch === '+' ? st.halo || st.mat : st.mat, null, pred);
      }
    } else if (st.op === 'plates') {
      // a row of bony plates at a fixed height: light top-left, dark bottom-right
      const P = F.P, pred = onBody(B);
      for (let x = st.s0 * P; x <= st.s1 * P; x += st.step * P) {
        const top = topAt(F, x), bot = botAt(F, x);
        const tt = st.n >= 0 ? st.n * top : st.n * bot;
        const [fx, fy] = pose.fwd(x, tt);
        const xi = Math.floor(fx), yi = Math.floor(fy);
        const shape = st.big && P >= 40 ? [[0, 0, 3], [1, 0, 3], [-1, 1, 3], [0, 1, 2], [1, 1, 1]] : [[0, 0, 3], [1, 0, 2], [0, 1, 2], [1, 1, 1]];
        for (const [dx, dy, tn] of shape) putPx(B, xi + dx, yi + dy, SCUTE, tn, pred);
      }
    } else if (st.op === 'lines') {
      const pred = st.onFins ? onBodyOrFin(B) : onBody(B);
      for (const ln of st.lines) {
        const path = tracePath(pose, ln.map(([s, t]) => [s * F.P, t * F.P]));
        for (const [x, y] of path) putPx(B, x, y, st.mat, st.tone, pred);
      }
    }
  }
}

// Ordered pixel path through fish-space points, 8-connected, no L-corners.
function tracePath(pose, pts) {
  const raw = [];
  let lx = null, ly = null;
  const push = (xi, yi) => {
    if (xi === lx && yi === ly) return;
    if (lx !== null && (Math.abs(xi - lx) > 1 || Math.abs(yi - ly) > 1)) {
      const n = Math.max(Math.abs(xi - lx), Math.abs(yi - ly));
      for (let k = 1; k < n; k++) raw.push([Math.round(lerp(lx, xi, k / n)), Math.round(lerp(ly, yi, k / n))]);
    }
    raw.push([xi, yi]); lx = xi; ly = yi;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, t0] = pts[i], [s1, t1] = pts[i + 1];
    const steps = Math.max(2, Math.ceil(Math.hypot(s1 - s0, t1 - t0) * 3));
    for (let k = i ? 1 : 0; k <= steps; k++) {
      const [x, y] = pose.fwd(lerp(s0, s1, k / steps), lerp(t0, t1, k / steps));
      push(Math.floor(x), Math.floor(y));
    }
  }
  if (pts.length === 1) { const [x, y] = pose.fwd(pts[0][0], pts[0][1]); push(Math.floor(x), Math.floor(y)); }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    if (out.length && i < raw.length - 1) {
      const a = out[out.length - 1], b = raw[i], c = raw[i + 1];
      if (Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1 && (a[0] === b[0] || a[1] === b[1])) continue;
    }
    out.push(raw[i]);
  }
  return out;
}

// Eye stamps: o ring, i iris, j iris shade, k iris light, p pupil, w shine
const EYES = {
  2: ['wp', 'pp'],
  3: ['wii', 'ipi', 'jij'],
  4: ['.ii.', 'iwpi', 'ippi', '.jj.'],
  5: ['.iii.', 'iwppi', 'ipppi', 'jpppj', '.jjj.'],
  '3wide': ['.ii.', 'iwii', 'iipi', '.jj.'],
  '4wide': ['.ii.', 'iwii', 'iipi', '.jj.'],
  '5wide': ['.iii.', 'iwiii', 'iipii', 'jiiij', '.jjj.'],
  '4glass': ['.kk.', 'kwkk', 'kppi', '.ii.'],
  '3ring': ['oio', 'iwp', 'opp'],
  '4ring': ['.oo.', 'owio', 'oipo', '.oo.'],
  '5glass': ['.kkk.', 'kwkkk', 'kkppi', 'iippi', '.iii.'],
  '6glass': ['.kkkk.', 'kwwkkk', 'kwkppk', 'kkpppi', 'ikppii', '.iiii.'],
};
function drawEye(F, pose, B) {
  const e = F.def.eye;
  if (!e) return;
  const P = F.P;
  const d = e.px || clamp(Math.round((e.d || 0.1) * P), 2, 6);
  let key = String(d);
  if (e.style === 'glass' && d >= 4) key = d + 'glass';
  if (e.style === 'ring' && EYES[d + 'ring']) key = d + 'ring';
  if (e.style === 'wide' && EYES[d + 'wide']) key = d + 'wide';
  if (pose.wide) key = e.style === 'glass' ? Math.min(6, d + 1) + 'glass' : Math.min(5, Math.max(4, d + 1)) + 'wide';
  const rows = EYES[key] || EYES[d] || EYES[3];
  const [x, y] = pose.fwd(e.s * P, e.t * P);
  const sz = rows.length;
  const bx = Math.round(x - sz / 2), by = Math.round(y - sz / 2);
  // keep a ring of body pixels around the eye so it never touches the outline
  const inStamp = (xx, yy, x0, y0) => { const i = xx - x0, j = yy - y0; return j >= 0 && j < sz && i >= 0 && i < rows[j].length && rows[j][i] !== '.'; };
  const fits = (x0, y0) => {
    for (let j = 0; j < sz; j++) for (let i = 0; i < rows[j].length; i++) {
      if (rows[j][i] === '.') continue;
      const xx = x0 + i, yy = y0 + j;
      if (xx < 1 || yy < 1 || xx >= B.w - 1 || yy >= B.h - 1) return false;
      const k = yy * B.w + xx;
      if (B.part[k] !== PT_BODY && B.part[k] !== PT_PEC) return false;
      for (const [dx, dy] of HALO4) {
        if (inStamp(xx + dx, yy + dy, x0, y0)) continue;
        const kk = (yy + dy) * B.w + xx + dx;
        if (!B.mat[kk] || B.part[kk] === PT_FIN || B.part[kk] === PT_TAIL) return false;
      }
    }
    return true;
  };
  let x0 = bx, y0 = by;
  for (const [dx, dy] of [[0, 0], [0, 1], [-1, 0], [-1, 1], [1, 0], [0, -1], [1, 1], [0, 2], [-1, 2], [-2, 1]]) {
    if (fits(bx + dx, by + dy)) { x0 = bx + dx; y0 = by + dy; break; }
  }
  for (let j = 0; j < sz; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch === '.') continue;
    const xx = x0 + i, yy = y0 + j;
    if (xx < 0 || yy < 0 || xx >= B.w || yy >= B.h) continue;
    const k = yy * B.w + xx;
    if (!B.mat[k]) continue;
    const m = ch === 'o' ? RING : ch === 'p' ? PUPIL : ch === 'w' ? SHINE : IRIS;
    B.mat[k] = m; B.part[k] = PT_EYE;
    B.tone[k] = ch === 'j' ? 1 : ch === 'k' ? 3 : 2;
  }
}

function drawMouth(F, pose, B) {
  const m = F.def.mouth;
  if (!m) return;
  const P = F.P;
  if (m.pts) {
    const path = tracePath(pose, m.pts.map(([s, t]) => [s * P, t * P]));
    for (const [x, y] of path) putPx(B, x, y, MOUTH, 2, (i) => B.part[i] === PT_BODY || B.part[i] === PT_PEC);
  }
  if (m.teeth) for (const [s, t] of m.teeth) {
    const [x, y] = pose.fwd(s * P, t * P);
    putPx(B, Math.floor(x), Math.floor(y), TEETH, 2, (i) => B.part[i] === PT_BODY);
  }
}

function drawGill(F, pose, B) {
  const g = F.def.gill;
  if (!g) return;
  const P = F.P;
  const pts = [];
  const n0 = g.n0 ?? 0.55, n1 = g.n1 ?? -0.7, nc = (n0 + n1) / 2, hr = (n0 - n1) / 2;
  for (let k = 0; k <= 12; k++) {
    const n = lerp(n0, n1, k / 12);
    const s = (g.s + (g.bulge ?? 0.025) * (1 - ((n - nc) / hr) ** 2) + (g.slant || 0) * (n - nc)) * P;
    pts.push([s, n >= 0 ? n * topAt(F, s) : n * botAt(F, s)]);
  }
  const path = tracePath(pose, pts);
  for (const [x, y] of path) {
    if (x < 0 || y < 0 || x >= B.w || y >= B.h) continue;
    const i = y * B.w + x;
    if (B.part[i] !== PT_BODY || B.mat[i] === MOUTH || B.lock[i]) continue;
    B.base[i] = B.mat[i]; B.mat[i] = GILL;
  }
}

function drawBarbels(F, pose, B) {
  for (const bb of F.def.barbels || []) {
    const path = tracePath(pose, bb.map(([s, t]) => [s * F.P, t * F.P]));
    for (const [x, y] of path) {
      if (x < 0 || y < 0 || x >= B.w || y >= B.h) continue;
      const i = y * B.w + x;
      if (B.mat[i] && B.mat[i] !== OUTL) continue;
      B.mat[i] = BARB; B.part[i] = PT_LINE; B.tone[i] = 2; B.base[i] = BELLY;
    }
  }
}

// dark line where a median fin meets the body (the body outline runs under it)
function finBaseLines(F, B) {
  const { w, h, part, mat, base } = B;
  const set = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (part[i] !== PT_FIN) continue;
    const up = part[i - w] === PT_BODY, dn = part[i + w] === PT_BODY;
    if (up || dn) set.push(i, up ? i - w : i + w);
  }
  for (let k = 0; k < set.length; k += 2) { const i = set[k]; mat[i] = OUTL; base[i] = base[set[k + 1]]; B.tone[i] = 0; }
}

// pectoral fin edge where it overlaps the body
function pecEdges(B) {
  const { w, h, part, tone } = B;
  const set = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (part[i] !== PT_PEC) continue;
    const nb = [i - w, i + w, i - 1, i + 1];
    if (nb.some((j) => part[j] === PT_BODY || part[j] === PT_EYE)) set.push(i);
  }
  for (const i of set) tone[i] = 1;
}

function addOutline(B) {
  const { w, h, mat, part, base } = B;
  const solid = (i) => mat[i] !== NONE && mat[i] !== OUTL && part[i] !== PT_LINE;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (mat[i]) continue;
    let nb = -1;
    if (y > 0 && solid(i - w)) nb = i - w;
    else if (y < h - 1 && solid(i + w)) nb = i + w;
    else if (x > 0 && solid(i - 1)) nb = i - 1;
    else if (x < w - 1 && solid(i + 1)) nb = i + 1;
    if (nb >= 0) add.push(i, nb);
  }
  for (let k = 0; k < add.length; k += 2) {
    const i = add[k], j = add[k + 1];
    mat[i] = OUTL; base[i] = isBodyMat(base[j]) || isFinMat(base[j]) ? base[j] : SIDE;
    part[i] = part[j]; B.fs[i] = B.fs[j]; B.fn[i] = B.fn[j]; B.tone[i] = 0;
  }
}

function renderPose(F, pose) {
  const B = newBuf(pose.W, pose.H);
  const R = {}, Q = {};
  for (let y = 0; y < pose.H; y++) {
    for (let x = 0; x < pose.W; x++) {
      if (!pose.inv(x + 0.5, y + 0.5, Q)) continue;
      R.lock = 0;
      sampleFish(F, Q.s, Q.t, pose, R);
      if (!R.mat) continue;
      const i = y * pose.W + x;
      B.mat[i] = R.mat; B.tone[i] = R.tone; B.base[i] = R.base; B.part[i] = R.part; B.fs[i] = R.fs; B.fn[i] = R.fn; B.lock[i] = R.lock;
    }
  }
  applyStamps(F, pose, B);
  drawGill(F, pose, B);
  drawMouth(F, pose, B);
  drawEye(F, pose, B);
  if (F.def.finBase) finBaseLines(F, B);
  pecEdges(B);
  addOutline(B);
  drawBarbels(F, pose, B);
  return B;
}

function bbox(B) {
  let x0 = B.w, y0 = B.h, x1 = -1, y1 = -1;
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    if (!B.mat[y * B.w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? [0, 0, 1, 1] : [x0, y0, x1, y1];
}
function crop(B, x0, y0, w, h) {
  const C = newBuf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0, sy = y + y0;
    if (sx < 0 || sy < 0 || sx >= B.w || sy >= B.h) continue;
    const i = sy * B.w + sx, j = y * w + x;
    C.mat[j] = B.mat[i]; C.tone[j] = B.tone[i]; C.base[j] = B.base[i]; C.part[j] = B.part[i]; C.fs[j] = B.fs[i]; C.fn[j] = B.fn[i];
  }
  return C;
}
// crop several frames rendered in the same space to one shared box (+1px margin)
function cropShared(list) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const B of list) { const b = bbox(B); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  return list.map((B) => crop(B, x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3));
}

// ===========================================================================
// Species art definitions (TL units; s = 0 snout .. 1 tail tip, t = up)
// ===========================================================================
// Optional extras (all opt-in):
//   fangs: [[[s, t], ...], ...]   spike teeth / tusk polygons fixed to the upper jaw
//   mouth.front / mouth.hingeT    only s >= front drops open in the flop pose; jaw split height
//   swim: { wave, cycles }        eel-style travelling body wave instead of a tail flick
//   eye.style: 'wide'             big mostly-iris eye (goldeye, rock bass)
//   fry: { top, bot }             separate body profile for the juvenile sprite
// Shared family profiles (TL units; heights above / below the body axis)
const scl = (pts, k) => pts.map(([x, y]) => [x, y * k]);
const SUN_TOP = [[0, 0.01], [0.04, 0.065], [0.1, 0.135], [0.2, 0.2], [0.32, 0.232], [0.44, 0.234], [0.56, 0.205], [0.66, 0.15], [0.73, 0.1], [0.8, 0.072]];
const SUN_BOT = [[0, 0.02], [0.04, 0.05], [0.1, 0.105], [0.2, 0.172], [0.32, 0.205], [0.44, 0.208], [0.56, 0.18], [0.66, 0.128], [0.73, 0.088], [0.8, 0.068]];
const TROUT_TOP = [[0, 0.012], [0.03, 0.043], [0.08, 0.081], [0.16, 0.116], [0.28, 0.139], [0.42, 0.143], [0.56, 0.125], [0.7, 0.09], [0.82, 0.06]];
const TROUT_BOT = [[0, 0.026], [0.03, 0.046], [0.08, 0.073], [0.16, 0.102], [0.28, 0.12], [0.42, 0.123], [0.56, 0.106], [0.7, 0.076], [0.82, 0.053]];
const PIKE_TOP = [[0, 0.007], [0.04, 0.018], [0.1, 0.029], [0.15, 0.04], [0.2, 0.055], [0.28, 0.07], [0.4, 0.08], [0.55, 0.084], [0.68, 0.078], [0.8, 0.056], [0.86, 0.041]];
const PIKE_BOT = [[0, 0.013], [0.04, 0.021], [0.1, 0.03], [0.16, 0.043], [0.25, 0.062], [0.4, 0.076], [0.56, 0.082], [0.7, 0.07], [0.8, 0.05], [0.86, 0.039]];
const SUN_Z = { bs: [[0, 0.55], [0.8, 0.45]], sb: [[0, -0.42], [0.8, -0.6]] };
const TROUT_Z = { bs: [[0, 0.38]], sb: [[0, -0.42], [0.8, -0.5]] };

const sunFins = (o = {}) => ({
  dorsal: [
    { s0: 0.26, s1: 0.48, h: [[0, 0.05], [0.2, 0.11], [1, 0.1]], rake: 0.4, spines: 3, dip: 0.35, ...o.spiny },
    { s0: 0.48, s1: 0.72, h: [[0, 0.1], [0.3, 0.15], [0.7, 0.15], [1, 0.05]], rake: 0.55, rays: 3, ...o.soft },
  ],
  ventral: [
    { s0: 0.27, s1: 0.33, h: [[0, 0.12], [1, 0.04]], rake: 1.1, ...o.pelvic },
    { s0: 0.5, s1: 0.72, h: [[0, 0.06], [0.3, 0.13], [0.7, 0.12], [1, 0.04]], rake: 0.55, rays: 3, ...o.anal },
  ],
  pec: { s: 0.25, t: -0.035, len: 0.24, w: 0.1, ang: 20, ...o.pec },
});
const troutFins = (o = {}) => ({
  dorsal: [
    { s0: 0.38, s1: 0.52, h: [[0, 0.095], [0.3, 0.105], [1, 0.035]], rake: 0.7, rays: 3, ...o.dorsal },
    { s0: 0.71, s1: 0.755, h: [[0, 0.034], [0.5, 0.042], [1, 0.02]], rake: 0.9, flat: true, ...o.adipose },
  ],
  ventral: [
    { s0: 0.46, s1: 0.51, h: [[0, 0.08], [1, 0.02]], rake: 1.0, ...o.pelvic },
    { s0: 0.62, s1: 0.7, h: [[0, 0.09], [1, 0.025]], rake: 0.75, rays: 3, ...o.anal },
  ],
  pec: { s: 0.19, t: -0.05, len: 0.13, w: 0.055, ang: 28, ...o.pec },
});
const pikeFins = (o = {}) => ({
  dorsal: [{ s0: 0.63, s1: 0.77, h: [[0, 0.06], [0.5, 0.075], [1, 0.028]], rake: 0.6, rays: 4, ...o.dorsal }],
  ventral: [
    { s0: 0.48, s1: 0.53, h: [[0, 0.055], [1, 0.015]], rake: 0.9, ...o.pelvic },
    { s0: 0.65, s1: 0.78, h: [[0, 0.06], [0.5, 0.07], [1, 0.022]], rake: 0.6, rays: 4, ...o.anal },
  ],
  pec: { s: 0.26, t: -0.042, len: 0.085, w: 0.038, ang: 25, ...o.pec },
});
const LEAF5 = ['..#..', '#.#.#', '#####', '.###.', '..#..'];
const LEAF7 = ['...#...', '.#.#.#.', '.#####.', '#######', '.#####.', '..###..', '...#...'];

const DEFS = {
  // ------------------------------------------------------------ sunfish
  bluegill: {
    sP: 0.8, top: SUN_TOP, bot: SUN_BOT,
    zones: { bs: [[0, 0.55], [0.8, 0.45]], sb: [[0, -0.42], [0.14, -0.38], [0.3, -0.2], [0.5, -0.38], [0.8, -0.78]] },
    ...sunFins({ soft: { spot: [0.8, 0.02, 0.045, 'p2'] } }),
    tail: { type: 'emarg', spread: 0.19, rays: 3 },
    eye: { s: 0.13, t: 0.065, px: 3 },
    mouth: { pts: [[0.004, 0.01], [0.03, -0.004]] },
    gill: { s: 0.22, n0: 0.45, n1: -0.7, bulge: 0.03 },
    pats: [
      { op: 'bars', mat: 'p1', n: 5, s0: 0.3, s1: 0.76, hw: 0.02, hwBot: 0.014, nTop: 0.95, nBot: -0.4 },
      { op: 'blob', mat: 'p2', s: 0.265, t: 0.04, rs: 0.03, rt: 0.04, lock: true, tone: 2 },
    ],
    colors: { back: '#34496e', side: '#5f7fb8', belly: '#f0a646', fin: '#92a6c2', p1: '#4c66a2', p2: '#121830', iris: '#f0b24a' },
  },
  pumpkinseed: {
    sP: 0.8, top: scl(SUN_TOP, 1.07), bot: scl(SUN_BOT, 1.07),
    zones: { bs: [[0, 0.5], [0.8, 0.42]], sb: [[0, -0.3], [0.2, -0.14], [0.45, -0.2], [0.8, -0.6]] },
    ...sunFins({ soft: { spot: null } }),
    tail: { type: 'emarg', spread: 0.19, rays: 3 },
    eye: { s: 0.13, t: 0.07, px: 3 },
    mouth: { pts: [[0.004, 0.01], [0.03, -0.004]] },
    gill: { s: 0.22, n0: 0.45, n1: -0.7, bulge: 0.03 },
    pats: [
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.1, region: 'body', n0: -0.55, n1: 0.8, s0: 0.28, s1: 0.78, jit: 0.6 },
      { op: 'spots', mat: 'p3', shape: 'dot', spacing: 0.12, region: 'body', n0: -0.3, n1: 0.9, s0: 0.3, s1: 0.76, jit: 0.8, seed: 5 },
      { op: 'lines', mat: 'p4', lines: [[[0.02, -0.01], [0.07, 0.0], [0.12, -0.016], [0.2, -0.004]], [[0.04, -0.06], [0.09, -0.05], [0.14, -0.066], [0.21, -0.055]]] },
      { op: 'blob', mat: 'p2', s: 0.262, t: 0.045, rs: 0.034, rt: 0.044, lock: true, tone: 2 },
      { op: 'blob', mat: 'p5', s: 0.292, t: 0.045, rs: 0.02, rt: 0.022, lock: true, tone: 2 },
    ],
    colors: { back: '#5f6e34', side: '#bb9a4a', belly: '#f07a2a', fin: '#b6a66a', p1: '#ea742a', p2: '#16140f', p3: '#f2cf5a', p4: '#3cd2c6', p5: '#f03a2a', iris: '#e8a030' },
  },
  goldfish: {
    sP: 0.64,
    top: [[0, 0.012], [0.04, 0.062], [0.1, 0.12], [0.2, 0.17], [0.3, 0.19], [0.4, 0.184], [0.5, 0.15], [0.58, 0.102], [0.64, 0.072]],
    bot: [[0, 0.02], [0.04, 0.054], [0.1, 0.106], [0.2, 0.162], [0.3, 0.182], [0.4, 0.172], [0.5, 0.132], [0.58, 0.088], [0.64, 0.062]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.35], [0.6, -0.5]] },
    dorsal: [{ s0: 0.22, s1: 0.5, h: [[0, 0.12], [0.3, 0.15], [1, 0.05]], rake: 0.5, rays: 3 }],
    ventral: [
      { s0: 0.3, s1: 0.36, h: [[0, 0.11], [1, 0.03]], rake: 1.0 },
      { s0: 0.5, s1: 0.58, h: [[0, 0.1], [1, 0.03]], rake: 0.8 },
    ],
    pec: { s: 0.2, t: -0.06, len: 0.17, w: 0.09, ang: 30 },
    tail: { type: 'flow', spread: 0.25, rays: 3 },
    eye: { s: 0.125, t: 0.05, px: 4 },
    mouth: { pts: [[0.004, 0.004], [0.02, -0.004]] },
    gill: { s: 0.2, n0: 0.5, n1: -0.7, bulge: 0.025 },
    scales: { per: 3 },
    colors: { back: '#d4531c', side: '#f08c2c', belly: '#ffd070', fin: '#f8a458', finx: '#ffe2a8', iris: '#ffdf8a' },
  },
  // ------------------------------------------------------------ perch & bass
  perch: {
    sP: 0.82,
    top: [[0, 0.01], [0.05, 0.048], [0.12, 0.092], [0.22, 0.135], [0.32, 0.15], [0.45, 0.14], [0.6, 0.11], [0.72, 0.078], [0.82, 0.056]],
    bot: [[0, 0.022], [0.05, 0.042], [0.12, 0.07], [0.22, 0.094], [0.35, 0.104], [0.5, 0.1], [0.65, 0.076], [0.82, 0.05]],
    zones: { bs: [[0, 0.55]], sb: [[0, -0.4], [0.8, -0.5]] },
    dorsal: [
      { s0: 0.25, s1: 0.47, h: [[0, 0.07], [0.2, 0.125], [0.7, 0.105], [1, 0.04]], rake: 0.3, spines: 4, dip: 0.35, spot: [0.85, 0.03, 0.05, 'p2'] },
      { s0: 0.5, s1: 0.68, h: [[0, 0.09], [0.3, 0.1], [1, 0.035]], rake: 0.6, rays: 3 },
    ],
    ventral: [
      { s0: 0.28, s1: 0.34, h: [[0, 0.1], [1, 0.03]], rake: 1.0, mat: 'fin2' },
      { s0: 0.58, s1: 0.7, h: [[0, 0.085], [1, 0.03]], rake: 0.7, mat: 'fin2', rays: 3 },
    ],
    pec: { s: 0.21, t: -0.025, len: 0.13, w: 0.06, ang: 25, mat: 'fin2' },
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.1, t: 0.035, px: 3 },
    mouth: { pts: [[0.004, 0.004], [0.06, -0.01]] },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.025 },
    pats: [{ op: 'bars', mat: 'p1', n: 6, s0: 0.22, s1: 0.8, hw: 0.028, hwBot: 0.008, nTop: 1.1, nBot: -0.5 }],
    colors: { back: '#5e6f2a', side: '#e0c040', belly: '#f6eab0', fin: '#b8ad62', fin2: '#ec7a36', p1: '#46531f', p2: '#262614', iris: '#e8d060' },
  },
  smallmouth: {
    sP: 0.82,
    top: [[0, 0.01], [0.04, 0.042], [0.1, 0.082], [0.2, 0.122], [0.32, 0.142], [0.45, 0.144], [0.58, 0.122], [0.7, 0.086], [0.82, 0.06]],
    bot: [[0, 0.03], [0.04, 0.046], [0.1, 0.072], [0.2, 0.1], [0.32, 0.116], [0.45, 0.116], [0.58, 0.1], [0.7, 0.07], [0.82, 0.055]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.42], [0.8, -0.5]] },
    dorsal: [
      { s0: 0.3, s1: 0.5, h: [[0, 0.06], [0.2, 0.1], [0.8, 0.08], [1, 0.065]], rake: 0.35, spines: 4, dip: 0.35 },
      { s0: 0.5, s1: 0.72, h: [[0, 0.075], [0.3, 0.105], [0.8, 0.095], [1, 0.03]], rake: 0.6, rays: 3 },
    ],
    ventral: [
      { s0: 0.3, s1: 0.35, h: [[0, 0.09], [1, 0.03]], rake: 1.0 },
      { s0: 0.57, s1: 0.71, h: [[0, 0.085], [1, 0.03]], rake: 0.7, rays: 3 },
    ],
    pec: { s: 0.22, t: -0.03, len: 0.13, w: 0.06, ang: 25 },
    tail: { type: 'emarg', spread: 0.145, rays: 3 },
    eye: { s: 0.1, t: 0.035, px: 3 },
    mouth: { pts: [[0.004, 0.004], [0.05, -0.006], [0.1, -0.014]] },
    gill: { s: 0.225, n0: 0.55, n1: -0.72, bulge: 0.025 },
    pats: [
      { op: 'bars', mat: 'p1', n: 7, s0: 0.26, s1: 0.8, hw: 0.018, nTop: 0.95, nBot: -0.35, broken: 0.25 },
      { op: 'lines', mat: 'p2', lines: [[[0.125, 0.05], [0.24, 0.062]], [[0.13, 0.022], [0.245, 0.018]], [[0.12, -0.004], [0.23, -0.03]]] },
    ],
    colors: { back: '#5a4a28', side: '#a8844a', belly: '#e8dcb8', fin: '#a08250', p1: '#6c5430', p2: '#3a2a16', iris: '#d83028' },
  },
  bass: {
    sP: 0.82,
    top: [[0, 0.014], [0.04, 0.048], [0.1, 0.088], [0.2, 0.128], [0.32, 0.148], [0.45, 0.15], [0.58, 0.128], [0.7, 0.09], [0.82, 0.062]],
    bot: [[0, 0.04], [0.03, 0.05], [0.1, 0.082], [0.2, 0.112], [0.32, 0.128], [0.45, 0.124], [0.58, 0.106], [0.7, 0.072], [0.82, 0.056]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.42], [0.8, -0.5]] },
    dorsal: [
      { s0: 0.3, s1: 0.47, h: [[0, 0.05], [0.25, 0.105], [0.8, 0.07], [1, 0.03]], rake: 0.35, spines: 4, dip: 0.35 },
      { s0: 0.5, s1: 0.72, h: [[0, 0.075], [0.3, 0.115], [0.8, 0.105], [1, 0.035]], rake: 0.6, rays: 4 },
    ],
    ventral: [
      { s0: 0.3, s1: 0.36, h: [[0, 0.09], [1, 0.03]], rake: 1.0 },
      { s0: 0.57, s1: 0.71, h: [[0, 0.09], [1, 0.03]], rake: 0.7, rays: 3 },
    ],
    pec: { s: 0.23, t: -0.035, len: 0.13, w: 0.06, ang: 25 },
    tail: { type: 'emarg', spread: 0.15, rays: 3 },
    eye: { s: 0.1, t: 0.045, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.08, -0.008], [0.155, -0.02]], gape: 28 },
    gill: { s: 0.23, n0: 0.55, n1: -0.72, bulge: 0.025 },
    pats: [{ op: 'band', mat: 'p1', n0: -0.22, n1: 0.14, s0: 0.14, s1: 0.84, jag: 0.4, freq: 0.9 }],
    colors: { back: '#3e5e2a', side: '#88a852', belly: '#eef0dc', fin: '#86a060', p1: '#2e4520', iris: '#e0a838' },
  },
  // ------------------------------------------------------------ trout & char
  brook: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: TROUT_Z,
    ...troutFins({ pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2', lead: 'finx' } }),
    tail: { type: 'square', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'worms', mat: 'p3', s0: 0.02, s1: 0.82, n0: 0.3, n1: 1.1, scale: 0.05, width: 0.09 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.08, region: 'body', n0: -0.35, n1: 0.3, s0: 0.2, s1: 0.8 },
      { op: 'spots', mat: 'p2', shape: 'dot', halo: 'p4', spacing: 0.17, region: 'body', n0: -0.25, n1: 0.15, s0: 0.25, s1: 0.75, seed: 7 },
    ],
    colors: { back: '#3f4f2e', side: '#6c7c46', belly: '#e96a2c', fin: '#7a8456', fin2: '#e2622c', finx: '#fbf6ee', p1: '#e8d468', p2: '#e22c2c', p3: '#c9cc92', p4: '#5b9be2', iris: '#e8c060' },
  },
  rainbow: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: { bs: [[0, 0.45]], sb: [[0, -0.4], [0.8, -0.46]] },
    ...troutFins(),
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.068, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'band', mat: 'p1', n0: -0.3, n1: 0.2, s0: 0.1, s1: 0.83 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.095, region: 'body', n0: 0.25, n1: 1, s0: 0.2, s1: 0.82 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.08, region: 'tail' },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.07, region: 'dorsal' },
    ],
    colors: { back: '#5b7a5a', side: '#cfd6d2', belly: '#f3f5f0', fin: '#a7b4a2', p1: '#e57f8e', p2: '#28322c', iris: '#e8c060' },
  },
  laketrout: {
    sP: 0.8, top: scl(TROUT_TOP, 0.96), bot: scl(TROUT_BOT, 0.96), zones: TROUT_Z,
    ...troutFins({ pelvic: { lead: 'finx' }, anal: { lead: 'finx' }, pec: { lead: 'finx' } }),
    tail: { type: 'deep', spread: 0.15, rays: 4 },
    eye: { s: 0.08, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.075, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'spots', mat: 'p1', shape: ['dot', 'dot', 'bean'], spacing: 0.062, region: 'body', n0: -0.45, n1: 1, s0: 0.12, s1: 0.82 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.065, region: 'tail' },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.055, region: 'dorsal' },
    ],
    colors: { back: '#3a4a44', side: '#62726a', belly: '#e2e6da', fin: '#66766c', finx: '#ece8d6', p1: '#ebe5c6', iris: '#d8c070' },
  },
  grayling: {
    sP: 0.82, top: scl(TROUT_TOP, 0.88), bot: scl(TROUT_BOT, 0.88), zones: { bs: [[0, 0.45]], sb: [[0, -0.4], [0.8, -0.5]] },
    ...troutFins({ dorsal: { s0: 0.24, s1: 0.6, h: [[0, 0.08], [0.25, 0.15], [0.6, 0.215], [0.88, 0.22], [1, 0.1]], rake: 0.3, rays: 5, mat: 'fin2', edge: 'p5' } }),
    tail: { type: 'fork', spread: 0.125, rays: 3 },
    eye: { s: 0.08, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, 0.004], [0.04, -0.008]] },
    gill: { s: 0.17, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.07, region: 'body', n0: -0.2, n1: 0.9, s0: 0.14, s1: 0.4 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.06, region: 'dorsal' },
      { op: 'spots', mat: 'p3', shape: 'dot', spacing: 0.075, region: 'dorsal', seed: 3 },
    ],
    colors: { back: '#4a4a6a', side: '#aeaccc', belly: '#eceaf4', fin: '#9894ae', fin2: '#583282', p1: '#1e1e2a', p2: '#3ac8b8', p3: '#f08ab8', p5: '#e2303a', iris: '#d8c8e8' },
  },
  char: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: TROUT_Z,
    ...troutFins({ pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2', lead: 'finx' } }),
    tail: { type: 'emarg', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [{ op: 'spots', mat: 'p1', shape: ['dot', 'blob', 'dot'], spacing: 0.09, region: 'body', n0: -0.35, n1: 0.7, s0: 0.18, s1: 0.8 }],
    colors: { back: '#243658', side: '#5a6c8e', belly: '#f05a30', fin: '#4e5e7c', fin2: '#e8503a', finx: '#fbf6ee', p1: '#f4b4bc', iris: '#e8c060' },
  },
  // ------------------------------------------------------------ salmon & whitefish
  whitefish: {
    sP: 0.8,
    top: [[0, 0.01], [0.03, 0.03], [0.08, 0.056], [0.14, 0.092], [0.22, 0.126], [0.32, 0.142], [0.45, 0.136], [0.6, 0.106], [0.72, 0.072], [0.8, 0.05]],
    bot: [[0, 0.012], [0.03, 0.028], [0.08, 0.05], [0.16, 0.082], [0.28, 0.102], [0.42, 0.102], [0.56, 0.086], [0.7, 0.062], [0.8, 0.045]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.4], [0.8, -0.5]] },
    ...troutFins({ dorsal: { s0: 0.36, s1: 0.48 }, adipose: { s0: 0.68, s1: 0.72 }, pelvic: { s0: 0.44, s1: 0.49 }, anal: { s0: 0.6, s1: 0.68 } }),
    tail: { type: 'deep', spread: 0.14, rays: 3 },
    eye: { s: 0.075, t: 0.026, px: 3 },
    mouth: { pts: [[0.012, -0.012], [0.035, -0.018]] },
    gill: { s: 0.17, n0: 0.55, n1: -0.72, bulge: 0.02 },
    scales: { per: 4 },
    colors: { back: '#6a7a8a', side: '#d0d8e0', belly: '#f4f6f8', fin: '#b2bac2', iris: '#d8d0b0' },
  },
  sockeye: {
    sP: 0.82,
    top: [[0, -0.004], [0.02, 0.018], [0.06, 0.05], [0.12, 0.086], [0.2, 0.13], [0.3, 0.158], [0.42, 0.152], [0.56, 0.12], [0.7, 0.08], [0.82, 0.055]],
    bot: [[0, 0.03], [0.02, 0.036], [0.06, 0.052], [0.12, 0.074], [0.24, 0.096], [0.38, 0.102], [0.52, 0.092], [0.68, 0.066], [0.82, 0.05]],
    zones: { bs: [[0, 0.42]], sb: [[0, -0.5], [0.8, -0.55]] },
    ...troutFins({ dorsal: { s0: 0.4, s1: 0.53 }, pelvic: { mat: 'fin2' }, anal: { mat: 'fin2' }, pec: { mat: 'fin2' } }),
    tail: { type: 'fork', spread: 0.13, rays: 3 },
    eye: { s: 0.1, t: 0.036, px: 3 },
    mouth: { pts: [[0.002, -0.002], [0.05, -0.012], [0.1, -0.016]], teeth: [[0.02, -0.01], [0.045, -0.014]] },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'head', mat: 'head', s: [[-1, 0.2], [0, 0.225], [1, 0.2]], belly: true },
      { op: 'head', mat: 'p3', s: [[-1, 0.19], [-0.45, 0.19], [-0.4, -1], [1, -1]], belly: true },
    ],
    colors: { back: '#a82626', side: '#d63a30', belly: '#e4604c', head: '#4f7c3c', fin: '#5f7e3e', fin2: '#6a8a44', p3: '#b8c89a', iris: '#e8c060' },
  },
  chinook: {
    sP: 0.82, top: scl(TROUT_TOP, 1.06), bot: scl(TROUT_BOT, 1.06), zones: { bs: [[0, 0.4]], sb: [[0, -0.42], [0.8, -0.5]] },
    ...troutFins(),
    tail: { type: 'fork', spread: 0.14, rays: 4 },
    eye: { s: 0.08, t: 0.032, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.085, -0.014]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    scales: { per: 4 },
    pats: [
      { op: 'spots', mat: 'p1', shape: ['dot', 'dot', 'bean'], spacing: 0.06, region: 'body', n0: 0.3, n1: 1.1, s0: 0.12, s1: 0.82 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.05, region: 'tail' },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.05, region: 'dorsal' },
    ],
    colors: { back: '#3a5a6a', side: '#c8d4dc', belly: '#f4f6f8', fin: '#7a8a92', p1: '#1a2024', mouth: '#0c0c0e', iris: '#d8c070' },
  },
  // ------------------------------------------------------------ big game
  walleye: {
    sP: 0.83,
    top: [[0, 0.01], [0.04, 0.042], [0.1, 0.074], [0.2, 0.104], [0.32, 0.118], [0.45, 0.115], [0.6, 0.097], [0.72, 0.072], [0.83, 0.05]],
    bot: [[0, 0.022], [0.04, 0.037], [0.1, 0.062], [0.2, 0.087], [0.32, 0.097], [0.45, 0.094], [0.6, 0.08], [0.72, 0.059], [0.83, 0.045]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.4], [0.8, -0.48]] },
    dorsal: [
      { s0: 0.27, s1: 0.48, h: [[0, 0.06], [0.2, 0.1], [0.8, 0.08], [1, 0.03]], rake: 0.35, spines: 5, dip: 0.35, spot: [0.86, 0.03, 0.04, 'p2'] },
      { s0: 0.52, s1: 0.7, h: [[0, 0.08], [0.3, 0.09], [1, 0.03]], rake: 0.6, rays: 3 },
    ],
    ventral: [
      { s0: 0.3, s1: 0.35, h: [[0, 0.085], [1, 0.025]], rake: 1.0 },
      { s0: 0.6, s1: 0.7, h: [[0, 0.08], [1, 0.025]], rake: 0.7, rays: 3 },
    ],
    pec: { s: 0.21, t: -0.03, len: 0.12, w: 0.055, ang: 25 },
    tail: { type: 'fork', spread: 0.13, rays: 3, tipLow: 'finx' },
    eye: { s: 0.1, t: 0.036, px: 4, style: 'glass' },
    mouth: { pts: [[0.004, 0.004], [0.07, -0.01], [0.11, -0.016]], teeth: [[0.03, -0.006]] },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.025 },
    pats: [
      { op: 'saddles', mat: 'p1', n: 5, s0: 0.22, s1: 0.8, hw: 0.035, nD: 0.05 },
      { op: 'mottle', mat: 'p3', scale: 0.045, th: 0.66, n0: -0.2, n1: 0.9 },
    ],
    colors: { back: '#6a6a30', side: '#c4a848', belly: '#f0ecd0', fin: '#b09a50', finx: '#fffaf0', p1: '#4a4a22', p2: '#1a1a10', p3: '#d8c060', iris: '#eef4e0' },
  },
  pike: {
    sP: 0.86, top: PIKE_TOP, bot: PIKE_BOT,
    zones: { bs: [[0, 0.62], [0.2, 0.42], [0.8, 0.38]], sb: [[0, -0.2], [0.2, -0.32], [0.8, -0.45]] },
    ...pikeFins(),
    tail: { type: 'fork', spread: 0.1, rays: 4 },
    eye: { s: 0.16, t: 0.034, px: 3 },
    mouth: { pts: [[0.003, 0.002], [0.08, -0.004], [0.145, -0.012]], teethOpen: true },
    gill: { s: 0.25, n0: 0.6, n1: -0.75, bulge: 0.02 },
    pats: [
      { op: 'spots', mat: 'p1', shape: 'bean', spacing: 0.075, region: 'body', n0: -0.62, n1: 0.85, s0: 0.24, s1: 0.86, rowK: 0.62, jit: 0.35 },
    ],
    colors: { back: '#39592c', side: '#5f8641', belly: '#e9ecc8', fin: '#9a9a48', p1: '#dadd88', iris: '#e0c050' },
  },
  burbot: {
    sP: 0.88,
    top: [[0, 0.012], [0.04, 0.036], [0.1, 0.056], [0.18, 0.072], [0.3, 0.082], [0.45, 0.08], [0.6, 0.07], [0.75, 0.056], [0.88, 0.04]],
    bot: [[0, 0.03], [0.04, 0.046], [0.1, 0.06], [0.18, 0.07], [0.3, 0.075], [0.45, 0.072], [0.6, 0.062], [0.75, 0.05], [0.88, 0.038]],
    zones: { bs: [[0, 0.45]], sb: [[0, -0.42], [0.8, -0.5]] },
    dorsal: [
      { s0: 0.3, s1: 0.4, h: [[0, 0.035], [0.5, 0.048], [1, 0.03]], rake: 0.3 },
      { s0: 0.43, s1: 0.9, h: [[0, 0.04], [0.2, 0.052], [0.9, 0.052], [1, 0.04]], rake: 0.25, rays: 7 },
    ],
    ventral: [
      { s0: 0.14, s1: 0.18, h: [[0, 0.05], [1, 0.02]], rake: 0.8 },
      { s0: 0.5, s1: 0.9, h: [[0, 0.04], [0.2, 0.052], [0.9, 0.052], [1, 0.04]], rake: 0.25, rays: 6 },
    ],
    pec: { s: 0.17, t: -0.02, len: 0.1, w: 0.06, ang: 15 },
    tail: { type: 'round', spread: 0.085, rays: 3 },
    eye: { s: 0.075, t: 0.032, px: 3 },
    mouth: { pts: [[0.003, 0.0], [0.06, -0.012]] },
    gill: { s: 0.16, n0: 0.55, n1: -0.72, bulge: 0.02 },
    barbels: [[[0.03, -0.034], [0.036, -0.075]]],
    pats: [
      { op: 'mottle', mat: 'p1', scale: 0.055, th: 0.56, sq: 1.3 },
      { op: 'mottle', mat: 'p3', scale: 0.04, th: 0.7, n0: -0.4, seed: 9 },
    ],
    colors: { back: '#4a3a22', side: '#8a7a44', belly: '#d8cc98', fin: '#6a5a34', p1: '#3a2a18', p3: '#bcae68', barb: '#3a2a18', iris: '#d0b060' },
  },
  muskie: {
    sP: 0.86, top: scl(PIKE_TOP, 1.05), bot: scl(PIKE_BOT, 1.05),
    zones: { bs: [[0, 0.6], [0.2, 0.42], [0.8, 0.38]], sb: [[0, -0.2], [0.2, -0.32], [0.8, -0.45]] },
    ...pikeFins({ dorsal: { mat: 'fin', rays: 4 } }),
    tail: { type: 'point', spread: 0.1, rays: 4 },
    eye: { s: 0.16, t: 0.034, px: 3 },
    mouth: { pts: [[0.003, 0.002], [0.08, -0.004], [0.145, -0.012]], teethOpen: true },
    gill: { s: 0.25, n0: 0.6, n1: -0.75, bulge: 0.02 },
    pats: [
      { op: 'bars', mat: 'p1', n: 11, s0: 0.24, s1: 0.86, hw: 0.011, nTop: 1.1, nBot: -0.5, wave: 0.008, broken: 0.18 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.05, region: 'fins' },
    ],
    colors: { back: '#5a6a4a', side: '#b8b890', belly: '#ece8d0', fin: '#b07e3e', p1: '#3a4028', p2: '#4a3018', iris: '#e0c050' },
  },
  sturgeon: {
    sP: 0.8,
    top: [[0, 0.004], [0.04, 0.018], [0.1, 0.04], [0.18, 0.07], [0.28, 0.09], [0.42, 0.094], [0.56, 0.084], [0.68, 0.064], [0.8, 0.036]],
    bot: [[0, 0.004], [0.04, 0.014], [0.1, 0.03], [0.18, 0.056], [0.28, 0.074], [0.42, 0.08], [0.56, 0.072], [0.68, 0.052], [0.8, 0.028]],
    zones: { bs: [[0, 0.4]], sb: [[0, -0.35], [0.8, -0.45]] },
    rim: [0.03, 0.62],
    dorsal: [{ s0: 0.62, s1: 0.7, h: [[0, 0.055], [0.3, 0.065], [1, 0.02]], rake: 0.8 }],
    ventral: [
      { s0: 0.54, s1: 0.59, h: [[0, 0.045], [1, 0.015]], rake: 0.9 },
      { s0: 0.64, s1: 0.7, h: [[0, 0.05], [1, 0.02]], rake: 0.8 },
    ],
    pec: { s: 0.21, t: -0.05, len: 0.1, w: 0.05, ang: 18 },
    tail: { type: 'hetero', spread: 0.1, rays: 4, lift: 0.28 },
    eye: { s: 0.135, t: 0.028, px: 2 },
    mouth: { pts: [[0.115, -0.052], [0.14, -0.054]] },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.02 },
    barbels: [[[0.055, -0.016], [0.055, -0.04]], [[0.072, -0.02], [0.074, -0.046]], [[0.09, -0.025], [0.093, -0.05]]],
    scutes: { s0: 0.18, s1: 0.6, step: 0.052, w: 0.022, h: 0.018 },
    flop: { open: 0 }, // underslung mouth: no jaw drop
    pats: [
      { op: 'plates', s0: 0.2, s1: 0.76, step: 0.05, n: 0.15, big: true },
      { op: 'plates', s0: 0.26, s1: 0.66, step: 0.06, n: -0.58 },
    ],
    colors: { back: '#56564a', side: '#7a786a', belly: '#dad6c6', fin: '#5e5e52', scute: '#dcd6c0', barb: '#4a4436', iris: '#c8b070' },
  },
  // ------------------------------------------------------------ panfish & minnows
  crappie: {
    sP: 0.8,
    top: [[0, 0.02], [0.04, 0.046], [0.09, 0.078], [0.14, 0.12], [0.22, 0.178], [0.32, 0.212], [0.44, 0.21], [0.56, 0.18], [0.66, 0.13], [0.74, 0.092], [0.8, 0.07]],
    bot: [[0, 0.028], [0.04, 0.05], [0.1, 0.098], [0.2, 0.165], [0.32, 0.198], [0.44, 0.198], [0.56, 0.17], [0.66, 0.122], [0.74, 0.086], [0.8, 0.066]],
    zones: { bs: [[0, 0.5], [0.8, 0.4]], sb: [[0, -0.45], [0.8, -0.6]] },
    dorsal: [
      { s0: 0.34, s1: 0.5, h: [[0, 0.06], [0.3, 0.13], [1, 0.16]], rake: 0.4, spines: 3, dip: 0.25 },
      { s0: 0.5, s1: 0.73, h: [[0, 0.16], [0.35, 0.18], [0.75, 0.15], [1, 0.06]], rake: 0.55, rays: 3, band: [0.3, 0.55, 'p3'] },
    ],
    ventral: [
      { s0: 0.26, s1: 0.32, h: [[0, 0.11], [1, 0.035]], rake: 1.0 },
      { s0: 0.42, s1: 0.73, h: [[0, 0.07], [0.4, 0.16], [0.8, 0.14], [1, 0.06]], rake: 0.55, rays: 3, band: [0.3, 0.55, 'p3'] },
    ],
    pec: { s: 0.24, t: -0.035, len: 0.2, w: 0.09, ang: 22, mat: 'fin2' },
    tail: { type: 'emarg', spread: 0.19, rays: 3 },
    eye: { s: 0.14, t: 0.05, px: 3 },
    mouth: { pts: [[0.004, 0.02], [0.05, -0.006], [0.1, -0.03]], gape: 30 },
    gill: { s: 0.23, n0: 0.5, n1: -0.72, bulge: 0.03 },
    pats: [
      { op: 'mottle', mat: 'p1', scale: 0.075, th: 0.6, n0: -0.6, s0: 0.12, s1: 0.8 },
      { op: 'spots', mat: 'p1', shape: ['dot', 'blob', 'dot'], spacing: 0.1, region: 'body', n0: -0.5, n1: 0.9, s0: 0.16, s1: 0.78, seed: 3 },
    ],
    colors: { back: '#3a4632', side: '#c6cab4', belly: '#eef0e4', fin: '#4e5444', fin2: '#b8bca4', p1: '#232a1e', p3: '#d4d8c0', iris: '#e8c060' },
  },
  rockbass: {
    sP: 0.8,
    top: [[0, 0.018], [0.04, 0.058], [0.1, 0.108], [0.2, 0.16], [0.32, 0.182], [0.45, 0.178], [0.58, 0.148], [0.7, 0.1], [0.8, 0.07]],
    bot: [[0, 0.04], [0.04, 0.056], [0.1, 0.094], [0.2, 0.135], [0.32, 0.152], [0.45, 0.146], [0.58, 0.12], [0.7, 0.08], [0.8, 0.062]],
    zones: { bs: [[0, 0.5], [0.8, 0.42]], sb: [[0, -0.45], [0.8, -0.55]] },
    dorsal: [
      { s0: 0.27, s1: 0.48, h: [[0, 0.06], [0.25, 0.1], [1, 0.085]], rake: 0.35, spines: 4, dip: 0.35 },
      { s0: 0.48, s1: 0.72, h: [[0, 0.085], [0.35, 0.13], [0.75, 0.12], [1, 0.04]], rake: 0.55, rays: 3 },
    ],
    ventral: [
      { s0: 0.28, s1: 0.33, h: [[0, 0.1], [1, 0.035]], rake: 1.0 },
      { s0: 0.5, s1: 0.72, h: [[0, 0.07], [0.35, 0.12], [0.75, 0.11], [1, 0.04]], rake: 0.55, rays: 3, edge: 'p2' },
    ],
    pec: { s: 0.23, t: -0.03, len: 0.16, w: 0.075, ang: 22 },
    tail: { type: 'emarg', spread: 0.17, rays: 3 },
    eye: { s: 0.12, t: 0.05, px: 4, style: 'wide' },
    mouth: { pts: [[0.004, 0.01], [0.06, -0.006], [0.12, -0.02]], gape: 28 },
    gill: { s: 0.22, n0: 0.5, n1: -0.72, bulge: 0.03 },
    pats: [
      { op: 'mottle', mat: 'p1', scale: 0.09, th: 0.62, n0: -0.4, s0: 0.2 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.085, region: 'body', n0: -0.6, n1: 0.7, s0: 0.22, s1: 0.78, rowK: 0.5, jit: 0.15 },
    ],
    colors: { back: '#4a3c22', side: '#9e8a4a', belly: '#e4d6a6', fin: '#7c6a3a', p1: '#6a5630', p2: '#2e2414', iris: '#e0281c' },
  },
  creekchub: {
    sP: 0.82,
    top: [[0, 0.016], [0.04, 0.05], [0.1, 0.085], [0.2, 0.113], [0.32, 0.125], [0.45, 0.12], [0.6, 0.097], [0.72, 0.072], [0.82, 0.055]],
    bot: [[0, 0.032], [0.04, 0.047], [0.1, 0.072], [0.2, 0.096], [0.32, 0.106], [0.45, 0.1], [0.6, 0.082], [0.72, 0.062], [0.82, 0.05]],
    zones: { bs: [[0, 0.42]], sb: [[0, -0.42], [0.8, -0.5]] },
    dorsal: [{ s0: 0.42, s1: 0.56, h: [[0, 0.09], [0.3, 0.1], [1, 0.035]], rake: 0.6, rays: 3, spot: [0.12, 0.01, 0.035, 'p2'] }],
    ventral: [
      { s0: 0.44, s1: 0.49, h: [[0, 0.075], [1, 0.02]], rake: 1.0, mat: 'fin2' },
      { s0: 0.6, s1: 0.68, h: [[0, 0.08], [1, 0.025]], rake: 0.75, mat: 'fin2' },
    ],
    pec: { s: 0.2, t: -0.05, len: 0.13, w: 0.06, ang: 28, mat: 'fin2' },
    tail: { type: 'fork', spread: 0.13, rays: 3 },
    eye: { s: 0.1, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.008], [0.06, -0.006], [0.085, -0.012]] },
    gill: { s: 0.19, n0: 0.55, n1: -0.72, bulge: 0.025 },
    pats: [
      { op: 'band', mat: 'p3', n0: -0.75, n1: -0.2, s0: 0.12, s1: 0.5 },
      { op: 'band', mat: 'p1', n0: [[0, -0.12], [0.55, -0.2], [0.8, -0.42]], n1: [[0, 0.32], [0.55, 0.32], [0.8, 0.45]], s0: 0.0, s1: 0.84 },
      { op: 'blob', mat: 'p2', s: 0.8, t: 0.0, rs: 0.03, rt: 0.032 },
    ],
    colors: { back: '#7a7a4a', side: '#c8c4ac', belly: '#f4ece2', fin: '#b0a678', fin2: '#e89470', p1: '#26241a', p2: '#1c1a14', p3: '#ea8a6a', iris: '#e8c060' },
  },
  dace: {
    sP: 0.8,
    top: [[0, 0.03], [0.04, 0.075], [0.1, 0.12], [0.2, 0.158], [0.32, 0.17], [0.45, 0.162], [0.6, 0.128], [0.72, 0.092], [0.8, 0.072]],
    bot: [[0, 0.04], [0.04, 0.07], [0.1, 0.108], [0.2, 0.142], [0.32, 0.152], [0.45, 0.144], [0.6, 0.112], [0.72, 0.082], [0.8, 0.064]],
    zones: { bs: [[0, 0.72]], sb: [[0, -0.5], [0.8, -0.6]] },
    dorsal: [{ s0: 0.44, s1: 0.58, h: [[0, 0.1], [0.3, 0.11], [1, 0.04]], rake: 0.6 }],
    ventral: [
      { s0: 0.44, s1: 0.5, h: [[0, 0.085], [1, 0.025]], rake: 1.0 },
      { s0: 0.6, s1: 0.68, h: [[0, 0.09], [1, 0.03]], rake: 0.75 },
    ],
    pec: { s: 0.2, t: -0.06, len: 0.14, w: 0.07, ang: 28 },
    tail: { type: 'fork', spread: 0.16, rays: 2 },
    eye: { s: 0.11, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, 0.0], [0.04, -0.012]] },
    pats: [
      { op: 'band', mat: 'p1', n0: [[0, -0.46], [0.8, -0.5]], n1: [[0, 0.02], [0.8, 0.0]], s0: 0.0, s1: 0.82 },
      { op: 'band', mat: 'p2', n0: 0.36, n1: [[0, 0.66], [0.8, 0.6]], s0: 0.14, s1: 0.82 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.12, region: 'body', n0: 0.72, n1: 1, s0: 0.2, s1: 0.7 },
    ],
    colors: { back: '#6e5c32', side: '#e0d2a0', belly: '#ee3a24', fin: '#ecc444', p1: '#1e1a14', p2: '#2a2418', iris: '#e8c060' },
  },
  // ------------------------------------------------------------ drum, goldeye & lake herring
  drum: {
    sP: 0.8,
    top: [[0, 0.016], [0.03, 0.05], [0.08, 0.104], [0.14, 0.158], [0.22, 0.19], [0.3, 0.198], [0.4, 0.18], [0.52, 0.145], [0.64, 0.102], [0.74, 0.072], [0.8, 0.06]],
    bot: [[0, 0.046], [0.03, 0.056], [0.1, 0.078], [0.2, 0.1], [0.32, 0.11], [0.45, 0.108], [0.58, 0.094], [0.7, 0.07], [0.8, 0.056]],
    zones: { bs: [[0, 0.48], [0.8, 0.4]], sb: [[0, -0.4], [0.8, -0.5]] },
    dorsal: [
      { s0: 0.24, s1: 0.4, h: [[0, 0.07], [0.2, 0.12], [1, 0.05]], rake: 0.35, spines: 4, dip: 0.3 },
      { s0: 0.41, s1: 0.79, h: [[0, 0.04], [0.15, 0.06], [0.85, 0.06], [1, 0.03]], rake: 0.35, rays: 6 },
    ],
    ventral: [
      { s0: 0.24, s1: 0.29, h: [[0, 0.11], [1, 0.03]], rake: 1.1, mat: 'fin2' },
      { s0: 0.6, s1: 0.7, h: [[0, 0.08], [1, 0.025]], rake: 0.7, rays: 2 },
    ],
    pec: { s: 0.22, t: -0.02, len: 0.15, w: 0.065, ang: 24 },
    tail: { poly: [[0.3, 0.72], [0.6, 0.94], [0.82, 0.76], [0.95, 0.4], [1, 0], [0.95, -0.4], [0.82, -0.76], [0.6, -0.94], [0.3, -0.72]], spread: 0.12, rays: 3 },
    eye: { s: 0.1, t: 0.04, px: 3 },
    mouth: { pts: [[0.016, -0.03], [0.06, -0.038]] },
    gill: { s: 0.21, n0: 0.55, n1: -0.72, bulge: 0.03 },
    scales: { per: 4 },
    pats: [
      { op: 'band', mat: 'p4', n0: [[0, 0.4], [0.8, 0.32]], n1: [[0, 0.62], [0.8, 0.52]], s0: 0.18, s1: 0.82, jag: 0.25, freq: 0.7 },
      { op: 'lines', mat: 'p3', lines: [[[0.22, 0.07], [0.36, 0.1], [0.5, 0.08], [0.66, 0.04], [0.8, 0.012], [0.9, 0.006]]], onFins: true },
    ],
    colors: { back: '#56607a', side: '#c6ced8', belly: '#f4f4f0', fin: '#a0a8b2', fin2: '#eceae4', p3: '#eef2fa', p4: '#9a90c0', iris: '#d8d0b8' },
  },
  goldeye: {
    sP: 0.8,
    top: [[0, 0.022], [0.04, 0.056], [0.1, 0.092], [0.2, 0.11], [0.32, 0.116], [0.45, 0.11], [0.58, 0.094], [0.7, 0.07], [0.8, 0.052]],
    bot: [[0, 0.03], [0.04, 0.056], [0.1, 0.092], [0.2, 0.124], [0.32, 0.138], [0.45, 0.13], [0.58, 0.104], [0.7, 0.072], [0.8, 0.05]],
    zones: { bs: [[0, 0.5], [0.8, 0.42]], sb: [[0, -0.42], [0.8, -0.5]] },
    dorsal: [{ s0: 0.56, s1: 0.66, h: [[0, 0.085], [0.3, 0.09], [1, 0.03]], rake: 0.65, rays: 3 }],
    ventral: [
      { s0: 0.36, s1: 0.41, h: [[0, 0.07], [1, 0.02]], rake: 1.0 },
      { s0: 0.5, s1: 0.74, h: [[0, 0.08], [0.2, 0.07], [1, 0.03]], rake: 0.45, rays: 4 },
    ],
    pec: { s: 0.17, t: -0.08, len: 0.13, w: 0.05, ang: 22 },
    tail: { type: 'deep', spread: 0.15, rays: 3 },
    eye: { s: 0.1, t: 0.02, px: 4, style: 'wide' },
    mouth: { pts: [[0.004, 0.02], [0.04, 0.0], [0.07, -0.01]] },
    gill: { s: 0.19, n0: 0.55, n1: -0.75, bulge: 0.025 },
    scales: { per: 4 },
    pats: [{ op: 'band', mat: 'p3', n0: -0.3, n1: 0.2, s0: 0.1, s1: 0.8 }],
    colors: { back: '#3a6a72', side: '#d8dccc', belly: '#f6f6f0', fin: '#cac6aa', p3: '#ecdc9a', iris: '#ffc21e', pupil: '#1a1208' },
  },
  cisco: {
    sP: 0.8,
    top: [[0, 0.016], [0.04, 0.04], [0.1, 0.066], [0.2, 0.09], [0.32, 0.102], [0.45, 0.1], [0.58, 0.086], [0.7, 0.064], [0.8, 0.05]],
    bot: [[0, 0.01], [0.03, 0.03], [0.1, 0.06], [0.2, 0.08], [0.32, 0.09], [0.45, 0.088], [0.58, 0.075], [0.7, 0.056], [0.8, 0.046]],
    zones: { bs: [[0, 0.4], [0.8, 0.3]], sb: [[0, -0.4], [0.8, -0.5]] },
    ...troutFins({ dorsal: { s0: 0.38, s1: 0.5, edge: 'finx' }, adipose: { s0: 0.68, s1: 0.72 }, pelvic: { s0: 0.45, s1: 0.5 }, anal: { s0: 0.6, s1: 0.68, edge: 'finx' } }),
    tail: { type: 'fork', spread: 0.135, rays: 3, edge: 'finx', edgeAt: 0.88 },
    eye: { s: 0.075, t: 0.022, px: 3 },
    mouth: { pts: [[0.0, 0.006], [0.04, -0.008]] },
    gill: { s: 0.17, n0: 0.55, n1: -0.72, bulge: 0.02 },
    scales: { per: 4 },
    pats: [{ op: 'band', mat: 'p3', n0: [[0, 0.24], [0.8, 0.14]], n1: [[0, 0.4], [0.8, 0.3]], s0: 0.16, s1: 0.82 }],
    colors: { back: '#2e4a72', side: '#d8dce8', belly: '#f6f6fa', fin: '#aab2c2', finx: '#4e5668', p3: '#cfa6dc', iris: '#d8d4c4' },
  },
  // ------------------------------------------------------------ catfish
  bullhead: {
    sP: 0.82,
    top: [[0, 0.024], [0.04, 0.05], [0.1, 0.074], [0.2, 0.104], [0.3, 0.12], [0.4, 0.118], [0.55, 0.092], [0.68, 0.064], [0.82, 0.044]],
    bot: [[0, 0.036], [0.04, 0.058], [0.1, 0.082], [0.2, 0.1], [0.3, 0.106], [0.42, 0.098], [0.55, 0.078], [0.68, 0.056], [0.82, 0.04]],
    zones: { bs: [[0, 0.3]], sb: [[0, -0.45], [0.8, -0.55]] },
    dorsal: [
      { s0: 0.3, s1: 0.41, h: [[0, 0.12], [0.25, 0.115], [1, 0.03]], rake: 0.55, rays: 3, lead: 'p1', leadW: 0.18 },
      { s0: 0.7, s1: 0.79, h: [[0, 0.03], [0.5, 0.045], [1, 0.025]], rake: 0.6, flat: true },
    ],
    ventral: [
      { s0: 0.46, s1: 0.51, h: [[0, 0.07], [1, 0.025]], rake: 0.9 },
      { s0: 0.58, s1: 0.76, h: [[0, 0.07], [0.5, 0.075], [1, 0.03]], rake: 0.45, rays: 4 },
    ],
    pec: { s: 0.17, t: -0.05, len: 0.14, w: 0.06, ang: 20 },
    tail: { type: 'emarg', spread: 0.15, rays: 3 },
    eye: { s: 0.085, t: 0.04, px: 2 },
    mouth: { pts: [[0.002, -0.004], [0.04, -0.014]] },
    gill: { s: 0.19, n0: 0.55, n1: -0.72, bulge: 0.02 },
    barbels: [
      [[0.026, 0.034], [0.014, 0.12]],
      [[0.01, -0.008], [-0.04, -0.03], [-0.075, -0.07], [-0.085, -0.14]],
      [[0.04, -0.046], [0.034, -0.15]],
      [[0.085, -0.064], [0.09, -0.15]],
    ],
    pats: [
      { op: 'mottle', mat: 'p1', scale: 0.075, th: 0.55, sq: 1.2, n0: -0.5 },
      { op: 'mottle', mat: 'p3', scale: 0.06, th: 0.7, n0: -0.6, n1: 0.4, seed: 4 },
    ],
    colors: { back: '#3a2e1c', side: '#7a643c', belly: '#e4d28e', fin: '#4c3e28', p1: '#2e2216', p3: '#9a8450', barb: '#3a2c1a', iris: '#d8b050' },
  },
  catfish: {
    sP: 0.82,
    top: [[0, 0.02], [0.04, 0.042], [0.1, 0.066], [0.2, 0.09], [0.3, 0.104], [0.42, 0.104], [0.55, 0.09], [0.68, 0.066], [0.82, 0.046]],
    bot: [[0, 0.03], [0.04, 0.044], [0.1, 0.06], [0.2, 0.076], [0.3, 0.084], [0.42, 0.082], [0.55, 0.07], [0.68, 0.054], [0.82, 0.04]],
    zones: { bs: [[0, 0.36]], sb: [[0, -0.42], [0.8, -0.52]] },
    dorsal: [
      { s0: 0.3, s1: 0.39, h: [[0, 0.12], [0.2, 0.115], [1, 0.03]], rake: 0.6, rays: 3, lead: 'p1', leadW: 0.15 },
      { s0: 0.68, s1: 0.75, h: [[0, 0.028], [0.5, 0.04], [1, 0.02]], rake: 0.7, flat: true },
    ],
    ventral: [
      { s0: 0.46, s1: 0.5, h: [[0, 0.06], [1, 0.02]], rake: 0.9 },
      { s0: 0.58, s1: 0.76, h: [[0, 0.065], [0.5, 0.065], [1, 0.03]], rake: 0.5, rays: 4 },
    ],
    pec: { s: 0.17, t: -0.045, len: 0.12, w: 0.05, ang: 22 },
    tail: { type: 'deep', spread: 0.135, rays: 4 },
    eye: { s: 0.085, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, -0.006], [0.05, -0.014]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    barbels: [
      [[0.022, 0.02], [0.012, 0.07]],
      [[0.016, -0.012], [-0.025, -0.028], [-0.055, -0.06], [-0.068, -0.1], [-0.064, -0.14]],
      [[0.035, -0.036], [0.03, -0.1]],
      [[0.065, -0.05], [0.066, -0.11]],
    ],
    pats: [
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'body', n0: -0.4, n1: 0.9, s0: 0.14, s1: 0.82 },
    ],
    colors: { back: '#465868', side: '#8e9eaa', belly: '#eef0ee', fin: '#5c6c76', p1: '#1c2228', barb: '#262c32', iris: '#d8c070' },
  },
  // ------------------------------------------------------------ ancient fish
  bowfin: {
    sP: 0.84,
    top: [[0, 0.022], [0.04, 0.05], [0.1, 0.072], [0.2, 0.09], [0.32, 0.1], [0.45, 0.1], [0.6, 0.09], [0.72, 0.076], [0.84, 0.062]],
    bot: [[0, 0.032], [0.04, 0.05], [0.1, 0.07], [0.2, 0.086], [0.32, 0.092], [0.45, 0.09], [0.6, 0.078], [0.72, 0.066], [0.84, 0.056]],
    zones: { bs: [[0, 0.42]], sb: [[0, -0.4], [0.8, -0.5]] },
    dorsal: [{ s0: 0.36, s1: 0.84, h: [[0, 0.045], [0.08, 0.06], [0.9, 0.06], [1, 0.045]], rake: 0.25, rays: 9, mat: 'fin2', band: [0.55, 0.8, 'p4'] }],
    ventral: [
      { s0: 0.46, s1: 0.5, h: [[0, 0.06], [1, 0.02]], rake: 0.9, mat: 'fin2' },
      { s0: 0.7, s1: 0.8, h: [[0, 0.065], [0.4, 0.07], [1, 0.03]], rake: 0.6, mat: 'fin2', rays: 2 },
    ],
    pec: { s: 0.2, t: -0.04, len: 0.11, w: 0.06, ang: 18, mat: 'fin2' },
    tail: { type: 'round', spread: 0.11, rays: 3, mat: 'fin2' },
    eye: { s: 0.08, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, 0.0], [0.06, -0.01], [0.1, -0.016]], teethOpen: true },
    gill: { s: 0.19, n0: 0.55, n1: -0.72, bulge: 0.025 },
    barbels: [[[0.012, 0.022], [0.004, 0.036]]],
    pats: [
      { op: 'mottle', mat: 'p1', scale: 0.065, th: 0.6, sq: 1.4 },
      { op: 'lines', mat: 'p2', lines: [[[0.1, 0.018], [0.18, 0.012]], [[0.1, -0.006], [0.17, -0.03]]] },
      { op: 'blob', mat: 'p5', s: 0.79, t: 0.018, rs: 0.05, rt: 0.052, lock: true, tone: 2 },
      { op: 'blob', mat: 'p2', s: 0.79, t: 0.018, rs: 0.03, rt: 0.03, lock: true, tone: 2 },
    ],
    colors: { back: '#3e4a26', side: '#78824c', belly: '#d8daa6', fin: '#5a7a3a', fin2: '#3aa84a', p1: '#4a5226', p2: '#141a0e', p4: '#2a7a3a', p5: '#f08a20', iris: '#d8b040' },
  },
  gar: {
    sP: 0.87,
    top: [[0, 0.016], [0.06, 0.02], [0.14, 0.024], [0.2, 0.03], [0.25, 0.05], [0.31, 0.066], [0.4, 0.072], [0.55, 0.072], [0.68, 0.064], [0.78, 0.05], [0.87, 0.04]],
    bot: [[0, 0.018], [0.06, 0.022], [0.14, 0.026], [0.2, 0.032], [0.26, 0.052], [0.34, 0.064], [0.45, 0.068], [0.6, 0.064], [0.72, 0.054], [0.8, 0.046], [0.87, 0.038]],
    zones: { bs: [[0, 0.3], [0.25, 0.38]], sb: [[0, -0.4], [0.8, -0.5]] },
    rim: [0.24, 0.72],
    dorsal: [{ s0: 0.75, s1: 0.83, h: [[0, 0.055], [0.3, 0.058], [1, 0.022]], rake: 0.75, rays: 3 }],
    ventral: [
      { s0: 0.52, s1: 0.56, h: [[0, 0.05], [1, 0.016]], rake: 0.9 },
      { s0: 0.73, s1: 0.81, h: [[0, 0.05], [0.3, 0.055], [1, 0.02]], rake: 0.75, rays: 3 },
    ],
    pec: { s: 0.29, t: -0.04, len: 0.08, w: 0.045, ang: 20 },
    tail: { poly: [[0.25, 0.7], [0.55, 0.96], [0.8, 0.9], [0.96, 0.6], [1, 0.2], [0.96, -0.2], [0.82, -0.6], [0.6, -0.86], [0.3, -0.7]], spread: 0.07, rays: 3, lift: 0.06 },
    eye: { s: 0.235, t: 0.022, px: 3 },
    mouth: { pts: [[0.002, 0.0], [0.1, 0.0], [0.2, -0.004], [0.24, -0.014]], teeth: [[0.03, 0.0], [0.07, 0.0], [0.11, 0.0], [0.15, -0.002], [0.19, -0.004]], teethOpen: true, gape: 16 },
    gill: { s: 0.3, n0: 0.6, n1: -0.75, bulge: 0.02 },
    scales: { per: 3, dark: true, s0: 0.28 },
    pats: [
      { op: 'spots', mat: 'p1', shape: ['dot', 'dot', 'bean'], spacing: 0.065, region: 'body', n0: -0.4, n1: 0.9, s0: 0.5, s1: 0.87 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.05, region: 'fins', s0: 0.7 },
    ],
    colors: { back: '#48522e', side: '#9e9c68', belly: '#eae6ca', fin: '#8e7e4a', p1: '#262214', iris: '#e0c050' },
  },
  paddlefish: {
    sP: 0.84,
    top: [[0, 0.03], [0.025, 0.04], [0.06, 0.03], [0.11, 0.018], [0.2, 0.016], [0.27, 0.02], [0.3, 0.03], [0.34, 0.052], [0.42, 0.084], [0.54, 0.1], [0.66, 0.086], [0.76, 0.06], [0.84, 0.036]],
    bot: [[0, 0.03], [0.025, 0.04], [0.06, 0.03], [0.11, 0.018], [0.2, 0.016], [0.27, 0.02], [0.3, 0.034], [0.34, 0.064], [0.42, 0.086], [0.54, 0.09], [0.66, 0.074], [0.76, 0.05], [0.84, 0.032]],
    zones: { bs: [[0, 0.1], [0.3, 0.42]], sb: [[0, -0.5], [0.3, -0.4], [0.8, -0.5]] },
    rim: [0.3, 0.7],
    dorsal: [{ s0: 0.56, s1: 0.65, h: [[0, 0.1], [0.25, 0.105], [1, 0.03]], rake: 0.9, rays: 3 }],
    ventral: [
      { s0: 0.58, s1: 0.62, h: [[0, 0.055], [1, 0.02]], rake: 0.9 },
      { s0: 0.66, s1: 0.73, h: [[0, 0.07], [1, 0.025]], rake: 0.8, rays: 2 },
    ],
    pec: { s: 0.44, t: -0.05, len: 0.1, w: 0.045, ang: 22 },
    tail: { poly: [[0.38, 0.62], [0.74, 1.0], [1, 1.22], [0.84, 0.78], [0.6, 0.3], [0.48, 0.02], [0.54, -0.3], [0.72, -0.72], [0.84, -0.98], [0.62, -0.9], [0.32, -0.6]], spread: 0.135, rays: 4, lift: 0.12 },
    eye: { s: 0.325, t: 0.016, px: 2 },
    mouth: { pts: [[0.3, -0.018], [0.36, -0.036], [0.42, -0.05]], front: 0.29, gape: 26 },
    gill: { s: 0.47, n0: 0.6, n1: -0.75, bulge: 0.05, slant: 0.03 },
    pats: [
      { op: 'head', mat: 'head', s: [[-1, 0.29], [1, 0.29]], belly: true },
      { op: 'spots', mat: 'p3', shape: 'dot', spacing: 0.035, region: 'body', s0: 0.0, s1: 0.27, jit: 0.4 },
      { op: 'mottle', mat: 'p1', scale: 0.05, th: 0.68, n0: 0.2, s0: 0.32 },
    ],
    fry: {
      top: [[0, 0.05], [0.05, 0.055], [0.12, 0.04], [0.24, 0.04], [0.3, 0.055], [0.36, 0.075], [0.44, 0.095], [0.56, 0.1], [0.68, 0.084], [0.84, 0.04]],
      bot: [[0, 0.05], [0.05, 0.055], [0.12, 0.04], [0.24, 0.04], [0.3, 0.06], [0.36, 0.08], [0.44, 0.092], [0.56, 0.09], [0.68, 0.074], [0.84, 0.036]],
    },
    colors: { back: '#4a5a6c', side: '#8e9caa', belly: '#e6eaee', head: '#6a7888', fin: '#5c6c7c', p1: '#3e4c5c', p3: '#c4ccd6', iris: '#c8c0b0' },
  },
  eel: {
    sP: 0.93,
    top: [[0, 0.014], [0.03, 0.03], [0.08, 0.042], [0.15, 0.049], [0.3, 0.053], [0.5, 0.051], [0.7, 0.045], [0.85, 0.036], [0.93, 0.026]],
    bot: [[0, 0.022], [0.03, 0.032], [0.08, 0.042], [0.15, 0.048], [0.3, 0.05], [0.5, 0.047], [0.7, 0.04], [0.85, 0.032], [0.93, 0.024]],
    zones: { bs: [[0, 0.3]], sb: [[0, -0.35], [0.9, -0.45]] },
    rim: [0.05, 0.85],
    dorsal: [{ s0: 0.36, s1: 0.95, h: [[0, 0.018], [0.15, 0.032], [0.9, 0.036], [1, 0.03]], rake: 0.2 }],
    ventral: [{ s0: 0.5, s1: 0.95, h: [[0, 0.016], [0.15, 0.03], [0.9, 0.034], [1, 0.03]], rake: 0.2 }],
    pec: { s: 0.13, t: -0.01, len: 0.045, w: 0.05, ang: 10 },
    tail: { type: 'round', spread: 0.05, rays: 0 },
    eye: { s: 0.055, t: 0.018, px: 2 },
    mouth: { pts: [[0.0, -0.004], [0.05, -0.012]] },
    gill: { s: 0.12, n0: 0.2, n1: -0.5, bulge: 0.01 },
    swim: { wave: 0.03, cycles: 1.3 },
    flop: { bend: 2.6 },
    colors: { back: '#3a3a1e', side: '#7c7c3c', belly: '#dcd48c', fin: '#5c5828', iris: '#d8c060' },
  },
  // ------------------------------------------------------------ river trout & salmon
  bulltrout: {
    sP: 0.82,
    top: [[0, 0.014], [0.03, 0.036], [0.08, 0.064], [0.16, 0.096], [0.28, 0.12], [0.42, 0.126], [0.56, 0.11], [0.7, 0.08], [0.82, 0.055]],
    bot: [[0, 0.03], [0.03, 0.046], [0.08, 0.07], [0.16, 0.094], [0.28, 0.108], [0.42, 0.11], [0.56, 0.095], [0.7, 0.07], [0.82, 0.05]],
    zones: TROUT_Z,
    ...troutFins({ pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2', lead: 'finx' } }),
    tail: { type: 'emarg', spread: 0.135, rays: 3 },
    eye: { s: 0.09, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, 0.004], [0.07, -0.01], [0.115, -0.02]], gape: 26 },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.075, region: 'body', n0: 0.05, n1: 1, s0: 0.14, s1: 0.82 },
      { op: 'spots', mat: 'p2', shape: ['dot', 'blob'], spacing: 0.1, region: 'body', n0: -0.4, n1: 0.15, s0: 0.2, s1: 0.8, seed: 5 },
    ],
    colors: { back: '#485848', side: '#7c8c72', belly: '#eed6b8', fin: '#6a7c64', fin2: '#d8823e', finx: '#fbf6ee', p1: '#e8d87a', p2: '#ee8250', iris: '#e8c060' },
  },
  cutthroat: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: { bs: [[0, 0.42]], sb: [[0, -0.42], [0.8, -0.5]] },
    ...troutFins(),
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.075, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'blob', mat: 'p3', s: 0.15, t: -0.01, rs: 0.035, rt: 0.04 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.1, region: 'body', n0: -0.3, n1: 1, s0: 0.2, s1: 0.5 },
      { op: 'spots', mat: 'p1', shape: ['dot', 'dot', 'bean'], spacing: 0.06, region: 'body', n0: -0.5, n1: 1, s0: 0.5, s1: 0.84, seed: 3 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'tail' },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'dorsal' },
      { op: 'lines', mat: 'p2', lines: [[[0.03, -0.048], [0.09, -0.07], [0.17, -0.098]], [[0.05, -0.036], [0.1, -0.052], [0.17, -0.07]]] },
    ],
    colors: { back: '#56603a', side: '#c6b070', belly: '#f2e4c4', fin: '#a89c64', p1: '#1e1c12', p2: '#e8342a', p3: '#e49478', iris: '#e8c060' },
  },
  coho: {
    sP: 0.82,
    top: [[0, -0.004], [0.02, 0.02], [0.06, 0.052], [0.12, 0.088], [0.2, 0.122], [0.3, 0.142], [0.42, 0.138], [0.56, 0.114], [0.7, 0.08], [0.82, 0.055]],
    bot: [[0, 0.034], [0.02, 0.04], [0.06, 0.054], [0.12, 0.076], [0.24, 0.098], [0.38, 0.104], [0.52, 0.094], [0.68, 0.068], [0.82, 0.05]],
    zones: { bs: [[0, 0.45]], sb: [[0, -0.5], [0.8, -0.55]] },
    ...troutFins({ dorsal: { s0: 0.4, s1: 0.53 } }),
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.1, t: 0.034, px: 3 },
    mouth: { pts: [[0.002, -0.004], [0.05, -0.014], [0.1, -0.018]], teeth: [[0.02, -0.012], [0.04, -0.016]], gape: 24 },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'band', mat: 'p2', n0: [[0, -0.55], [0.8, -0.6]], n1: [[0, 0.3], [0.5, 0.36], [0.8, 0.3]], s0: 0.21, s1: 0.86, jag: 0.25, freq: 0.6 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.07, region: 'body', n0: 0.45, n1: 1.1, s0: 0.18, s1: 0.82 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'tail', n0: 0 },
    ],
    colors: { back: '#2e4a3a', side: '#5a6a5a', belly: '#6a6a74', fin: '#40564a', p1: '#121a14', p2: '#c8283a', teeth: '#fbf6ee', iris: '#e8c060' },
  },
  pinksalmon: {
    sP: 0.82,
    top: [[0, -0.008], [0.02, 0.018], [0.06, 0.062], [0.12, 0.13], [0.18, 0.198], [0.25, 0.232], [0.32, 0.222], [0.42, 0.17], [0.54, 0.12], [0.68, 0.08], [0.82, 0.055]],
    bot: [[0, 0.04], [0.02, 0.046], [0.06, 0.058], [0.12, 0.078], [0.24, 0.098], [0.38, 0.102], [0.52, 0.092], [0.68, 0.066], [0.82, 0.05]],
    zones: { bs: [[0, 0.5], [0.25, 0.42], [0.8, 0.45]], sb: [[0, -0.4], [0.8, -0.5]] },
    ...troutFins({ dorsal: { s0: 0.38, s1: 0.5 } }),
    tail: { type: 'fork', spread: 0.13, rays: 3 },
    eye: { s: 0.1, t: 0.03, px: 3 },
    mouth: { pts: [[0.004, -0.026], [0.05, -0.022], [0.1, -0.026]], teeth: [[0.025, -0.024]], front: 0.002, gape: 24 },
    gill: { s: 0.2, n0: 0.5, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'bars', mat: 'p1', n: 6, s0: 0.24, s1: 0.8, hw: 0.026, hwBot: 0.018, nTop: 0.5, nBot: -0.55, broken: 0.35, wave: 0.01 },
      { op: 'spots', mat: 'p2', shape: ['bean', 'blob'], spacing: 0.075, region: 'body', n0: 0.45, n1: 1.1, s0: 0.12, s1: 0.82 },
      { op: 'spots', mat: 'p2', shape: ['bean', 'blob'], spacing: 0.065, region: 'tail' },
    ],
    colors: { back: '#4e5442', side: '#d89ca2', belly: '#f2ece8', fin: '#6c6c5a', p1: '#7a6a5a', p2: '#1c1c18', teeth: '#fbf6ee', iris: '#e8c060' },
  },
  kokanee: {
    sP: 0.82,
    top: [[0, -0.002], [0.02, 0.02], [0.06, 0.048], [0.12, 0.08], [0.2, 0.11], [0.3, 0.13], [0.42, 0.126], [0.56, 0.104], [0.7, 0.074], [0.82, 0.052]],
    bot: [[0, 0.03], [0.02, 0.035], [0.06, 0.05], [0.12, 0.07], [0.24, 0.088], [0.38, 0.092], [0.52, 0.082], [0.68, 0.06], [0.82, 0.046]],
    zones: { bs: [[0, 0.42]], sb: [[0, -0.5], [0.8, -0.55]] },
    ...troutFins({ dorsal: { s0: 0.4, s1: 0.53 }, pelvic: { mat: 'fin2' }, anal: { mat: 'fin2' }, pec: { mat: 'fin2' } }),
    tail: { type: 'fork', spread: 0.13, rays: 3 },
    eye: { s: 0.1, t: 0.034, px: 3 },
    mouth: { pts: [[0.002, -0.002], [0.05, -0.012], [0.09, -0.016]] },
    gill: { s: 0.2, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'head', mat: 'head', s: [[-1, 0.2], [0, 0.22], [1, 0.2]], belly: true },
      { op: 'head', mat: 'p3', s: [[-1, 0.17], [-0.45, 0.17], [-0.4, -1], [1, -1]], belly: true },
    ],
    colors: { back: '#cc2a26', side: '#f2402c', belly: '#f47654', head: '#2e9a4e', fin: '#3a8a4a', fin2: '#46a052', p3: '#eef2e6', iris: '#f0d060' },
  },
  browntrout: {
    sP: 0.82, top: scl(TROUT_TOP, 1.04), bot: scl(TROUT_BOT, 1.04), zones: { bs: [[0, 0.42]], sb: [[0, -0.4], [0.8, -0.5]] },
    ...troutFins({ adipose: { mat: 'fin2' } }),
    tail: { type: 'emarg', spread: 0.13, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.08, -0.014]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'spots', mat: 'p1', shape: ['dot', 'dot', 'bean'], halo: 'p4', spacing: 0.115, region: 'body', n0: -0.1, n1: 0.95, s0: 0.12, s1: 0.8 },
      { op: 'spots', mat: 'p2', shape: 'dot', halo: 'p4', spacing: 0.14, region: 'body', n0: -0.5, n1: 0.1, s0: 0.22, s1: 0.78, seed: 6 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.07, region: 'dorsal' },
    ],
    colors: { back: '#5a4824', side: '#c89a48', belly: '#f2da92', fin: '#a8803a', fin2: '#e8642a', p1: '#1e1610', p2: '#d83a2a', p4: '#f2e6c2', iris: '#e8c060' },
  },
  goldentrout: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: { bs: [[0, 0.5]], sb: [[0, -0.46], [0.8, -0.55]] },
    ...troutFins({ dorsal: { lead: 'finx', edge: 'finx' }, pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2' } }),
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'blob', mat: 'p2', s: 0.13, t: -0.012, rs: 0.04, rt: 0.035 },
      { op: 'band', mat: 'p2', n0: -0.22, n1: 0.16, s0: 0.12, s1: 0.84 },
      { op: 'bars', mat: 'p3', n: 8, s0: 0.2, s1: 0.82, hw: 0.018, nTop: 0.38, nBot: -0.38, over: true },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.08, region: 'body', n0: 0.5, n1: 1.1, s0: 0.4, s1: 0.84 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'tail' },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'dorsal' },
    ],
    colors: { back: '#7a6a28', side: '#f4c432', belly: '#ee5a2a', fin: '#dcae40', fin2: '#ee7a34', finx: '#fffbf2', p1: '#2a2210', p2: '#e2382a', p3: '#7c7a30', iris: '#e8c060' },
  },
  sabertooth: {
    sP: 0.82,
    top: [[0, -0.034], [0.012, -0.008], [0.03, 0.016], [0.05, 0.036], [0.075, 0.06], [0.1, 0.09], [0.15, 0.15], [0.21, 0.196], [0.28, 0.212], [0.36, 0.2], [0.48, 0.158], [0.6, 0.116], [0.72, 0.078], [0.82, 0.054]],
    bot: [[0, 0.086], [0.016, 0.088], [0.036, 0.062], [0.052, 0.08], [0.07, 0.088], [0.1, 0.088], [0.16, 0.094], [0.26, 0.108], [0.38, 0.112], [0.52, 0.1], [0.66, 0.074], [0.82, 0.05]],
    zones: { bs: [[0, 0.4], [0.3, 0.5], [0.8, 0.42]], sb: [[0, -0.2], [0.4, -0.1], [0.8, -0.25]] },
    rim: [0.1, 0.72],
    dorsal: [
      { s0: 0.4, s1: 0.54, h: [[0, 0.085], [0.25, 0.1], [0.42, 0.055], [0.55, 0.09], [1, 0.03]], rake: 0.7, rays: 4 },
      { s0: 0.71, s1: 0.755, h: [[0, 0.034], [0.5, 0.042], [1, 0.02]], rake: 0.9, flat: true },
    ],
    ventral: [
      { s0: 0.46, s1: 0.51, h: [[0, 0.08], [1, 0.02]], rake: 1.0 },
      { s0: 0.62, s1: 0.7, h: [[0, 0.09], [1, 0.025]], rake: 0.75, rays: 3 },
    ],
    pec: { s: 0.2, t: -0.05, len: 0.13, w: 0.055, ang: 28 },
    tail: { poly: [[0.35, 0.58], [0.72, 0.9], [1, 1.02], [0.94, 0.86], [0.86, 0.82], [0.88, 0.62], [0.74, 0.34], [0.62, 0.02], [0.62, -0.02], [0.74, -0.34], [0.9, -0.72], [1, -1.02], [0.72, -0.9], [0.35, -0.58]], spread: 0.14, rays: 4 },
    eye: { s: 0.125, t: 0.046, px: 3 },
    mouth: { pts: [[0.032, -0.062], [0.05, -0.044], [0.1, -0.04], [0.16, -0.052]], teeth: [[0.12, -0.042], [0.14, -0.046]], front: 0.036, hingeT: -0.044, gape: 22, teethOpen: true },
    fangs: [
      [[0.05, -0.024], [0.09, -0.024], [0.072, -0.085], [0.05, -0.155], [0.03, -0.152], [0.05, -0.085]],
      [[0.11, -0.028], [0.148, -0.028], [0.128, -0.085], [0.106, -0.14], [0.086, -0.137], [0.106, -0.085]],
    ],
    gill: { s: 0.225, n0: 0.55, n1: -0.72, bulge: 0.025 },
    scales: { per: 4, s0: 0.24 },
    pats: [
      { op: 'head', mat: 'head', s: [[-1, 0.19], [0, 0.22], [1, 0.2]], belly: true },
      { op: 'band', mat: 'p3', n0: -1.2, n1: [[0, -0.55], [1, -0.55]], s0: 0.036, s1: 0.2 },
      { op: 'band', mat: 'belly', n0: -1.2, n1: [[0, -0.1], [0.4, 0.0], [0.8, -0.15]], s0: 0.19, s1: 0.9, jag: 0.35, freq: 0.7 },
      { op: 'spots', mat: 'p1', shape: ['dot', 'bean'], spacing: 0.06, region: 'body', n0: 0.5, n1: 1.1, s0: 0.24, s1: 0.82 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.06, region: 'tail' },
      { op: 'lines', mat: 'p4', lines: [[[0.33, 0.12], [0.37, 0.02]], [[0.37, 0.13], [0.41, 0.03]], [[0.41, 0.12], [0.45, 0.03]], [[0.6, 0.075], [0.66, 0.03]]] },
      { op: 'lines', mat: 'p1', lines: [[[0.1, 0.082], [0.15, 0.072]]] },
    ],
    colors: { back: '#7a1620', side: '#c42a34', belly: '#cad2dc', head: '#3a4636', p3: '#7c8672', fin: '#6a2228', p1: '#1a0e10', p4: '#f4c8c4', scute: '#f6f0e0', teeth: '#f6f0e0', iris: '#f0b030' },
  },
  // ------------------------------------------------------------ hybrids
  sunperch: {
    sP: 0.8, top: scl(SUN_TOP, 0.85), bot: scl(SUN_BOT, 0.85),
    zones: { bs: [[0, 0.5]], sb: [[0, -0.38], [0.8, -0.55]] },
    ...sunFins({ spiny: { spines: 4, h: [[0, 0.06], [0.2, 0.12], [1, 0.08]] }, pelvic: { mat: 'fin2' }, anal: { mat: 'fin2' }, pec: { mat: 'fin2', len: 0.2 } }),
    tail: { type: 'fork', spread: 0.17, rays: 3 },
    eye: { s: 0.12, t: 0.055, px: 3 },
    mouth: { pts: [[0.004, 0.008], [0.04, -0.006]] },
    gill: { s: 0.21, n0: 0.45, n1: -0.7, bulge: 0.03 },
    pats: [
      { op: 'bars', mat: 'p1', n: 5, s0: 0.28, s1: 0.78, hw: 0.026, hwBot: 0.01, nTop: 1.1, nBot: -0.45 },
      { op: 'blob', mat: 'p2', s: 0.25, t: 0.035, rs: 0.022, rt: 0.03, lock: true, tone: 2 },
    ],
    colors: { back: '#237e84', side: '#46bfb0', belly: '#f6d040', fin: '#70b8a8', fin2: '#f08a3a', p1: '#f0a030', p2: '#123a44', iris: '#f0b040' },
  },
  goldseed: {
    sP: 0.68,
    top: [[0, 0.01], [0.04, 0.07], [0.1, 0.14], [0.2, 0.2], [0.3, 0.222], [0.4, 0.215], [0.5, 0.175], [0.6, 0.11], [0.68, 0.072]],
    bot: [[0, 0.02], [0.04, 0.056], [0.1, 0.112], [0.2, 0.175], [0.3, 0.198], [0.4, 0.19], [0.5, 0.15], [0.6, 0.095], [0.68, 0.064]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.3], [0.6, -0.5]] },
    ...sunFins({ spiny: { s0: 0.22, s1: 0.4 }, soft: { s0: 0.4, s1: 0.62, h: [[0, 0.1], [0.4, 0.16], [0.8, 0.14], [1, 0.05]] }, pelvic: { s0: 0.24, s1: 0.3 }, anal: { s0: 0.44, s1: 0.62 }, pec: { s: 0.21, len: 0.2 } }),
    tail: { type: 'flow', spread: 0.25, rays: 3 },
    eye: { s: 0.12, t: 0.06, px: 3 },
    mouth: { pts: [[0.004, 0.008], [0.03, -0.004]] },
    gill: { s: 0.2, n0: 0.45, n1: -0.7, bulge: 0.03 },
    scales: { per: 3 },
    pats: [
      { op: 'lines', mat: 'p4', lines: [[[0.02, -0.01], [0.07, 0.0], [0.12, -0.016], [0.19, -0.004]], [[0.04, -0.06], [0.09, -0.05], [0.14, -0.066], [0.2, -0.055]]] },
    ],
    colors: { back: '#e0661a', side: '#f8a030', belly: '#ffe070', fin: '#ffb466', finx: '#ffe2a8', p4: '#40d8d0', iris: '#6a2a10' },
  },
  bassgill: {
    sP: 0.8, top: scl(SUN_TOP, 0.98), bot: scl(SUN_BOT, 1.02),
    zones: { bs: [[0, 0.5]], sb: [[0, -0.38], [0.3, -0.25], [0.8, -0.6]] },
    ...sunFins({ spiny: { spines: 4 } }),
    tail: { type: 'emarg', spread: 0.18, rays: 3 },
    eye: { s: 0.11, t: 0.07, px: 3 },
    mouth: { pts: [[0.004, 0.012], [0.07, -0.004], [0.14, -0.014]], gape: 30 },
    gill: { s: 0.22, n0: 0.45, n1: -0.7, bulge: 0.03 },
    pats: [{ op: 'bars', mat: 'p1', n: 3, s0: 0.3, s1: 0.74, hw: 0.035, hwBot: 0.024, nTop: 1.0, nBot: -0.3 }],
    colors: { back: '#33624f', side: '#6aa07a', belly: '#f0a040', fin: '#7c98a8', p1: '#2a4e40', iris: '#f0c040' },
  },
  tiger: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: TROUT_Z,
    ...troutFins({ pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2' } }),
    tail: { type: 'emarg', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [{ op: 'worms', mat: 'p1', s0: 0.03, s1: 0.83, n0: -0.5, n1: 1.1, scale: 0.042, width: 0.1 }],
    colors: { back: '#6a5a28', side: '#d8a848', belly: '#f4e0b0', fin: '#b89048', fin2: '#d8804a', finx: '#fff4e0', p1: '#3a3018', iris: '#e8c060' },
  },
  splake: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: TROUT_Z,
    ...troutFins({ pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2', lead: 'finx' } }),
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'worms', mat: 'p3', s0: 0.02, s1: 0.82, n0: 0.35, n1: 1.1, scale: 0.05, width: 0.09 },
      { op: 'spots', mat: 'p1', shape: 'dot', spacing: 0.08, region: 'body', n0: -0.4, n1: 0.3, s0: 0.18, s1: 0.8 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.2, region: 'body', n0: -0.25, n1: 0.15, s0: 0.3, s1: 0.7, seed: 4 },
    ],
    colors: { back: '#3a4a3a', side: '#6a7a5a', belly: '#f0a070', fin: '#687a5c', fin2: '#dc7c4c', finx: '#fbf6ee', p1: '#ebe2c2', p2: '#dc3a30', p3: '#b8c0a0', iris: '#e8c060' },
  },
  aurora: {
    sP: 0.82, top: scl(TROUT_TOP, 1.02), bot: scl(TROUT_BOT, 1.02), zones: { bs: [[0, 0.42]], sb: [[0, -0.42], [0.8, -0.5]] },
    ...troutFins(),
    tail: { type: 'fork', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    grad: [
      [0.08, { side: '#3ccf86', back: '#1f7a5a', head: '#1f7a5a', fin: '#5fb89a' }],
      [0.36, { side: '#34c2c8', back: '#1a6a8a', head: '#1a6a8a', fin: '#5a9ad0' }],
      [0.62, { side: '#4a86e8', back: '#2a3f9a', head: '#2a3f9a', fin: '#7a70d8' }],
      [0.9, { side: '#8a5ae0', back: '#3a2a7a', head: '#3a2a7a', fin: '#9a5ad8' }],
    ],
    pats: [{ op: 'spots', mat: 'p1', shape: ['dot', 'dot', 'plus'], spacing: 0.085, region: 'body', n0: -0.3, n1: 0.9, s0: 0.14, s1: 0.82 }],
    colors: { back: '#2a3f9a', side: '#3ac8a0', belly: '#bff2e2', fin: '#9a5ad8', p1: '#f4fff8', iris: '#f0e0a0' },
  },
  sparctic: {
    sP: 0.82, top: TROUT_TOP, bot: TROUT_BOT, zones: TROUT_Z,
    ...troutFins({ pelvic: { mat: 'fin2', lead: 'finx' }, anal: { mat: 'fin2', lead: 'finx' }, pec: { mat: 'fin2', lead: 'finx' } }),
    tail: { type: 'emarg', spread: 0.135, rays: 3 },
    eye: { s: 0.085, t: 0.034, px: 3 },
    mouth: { pts: [[0.004, 0.006], [0.07, -0.012]] },
    gill: { s: 0.18, n0: 0.55, n1: -0.72, bulge: 0.02 },
    pats: [
      { op: 'worms', mat: 'p3', s0: 0.02, s1: 0.82, n0: 0.35, n1: 1.1, scale: 0.05, width: 0.09 },
      { op: 'spots', mat: 'p1', shape: ['dot', 'blob'], spacing: 0.09, region: 'body', n0: -0.35, n1: 0.3, s0: 0.18, s1: 0.8 },
    ],
    colors: { back: '#2e3e3a', side: '#8a7048', belly: '#ff7a2a', fin: '#c86a30', fin2: '#ff6a2a', finx: '#fff4ea', p1: '#ffc0a0', p3: '#9ab0a8', iris: '#e8c060' },
  },
  pikeeye: {
    sP: 0.86, top: scl(PIKE_TOP, 1.04), bot: scl(PIKE_BOT, 1.04),
    zones: { bs: [[0, 0.6], [0.2, 0.42], [0.8, 0.38]], sb: [[0, -0.2], [0.2, -0.32], [0.8, -0.45]] },
    ...pikeFins(),
    tail: { type: 'fork', spread: 0.1, rays: 4, tipLow: 'finx' },
    eye: { s: 0.155, t: 0.036, px: 5, style: 'glass' },
    mouth: { pts: [[0.003, 0.002], [0.08, -0.004], [0.145, -0.012]], teethOpen: true },
    gill: { s: 0.25, n0: 0.6, n1: -0.75, bulge: 0.02 },
    pats: [
      { op: 'saddles', mat: 'p1', n: 6, s0: 0.24, s1: 0.84, hw: 0.03, nD: 0.1 },
      { op: 'spots', mat: 'p3', shape: 'bean', spacing: 0.085, region: 'body', n0: -0.55, n1: 0.4, s0: 0.26, s1: 0.84, rowK: 0.62, jit: 0.4 },
    ],
    colors: { back: '#5a6a2c', side: '#a8a848', belly: '#f0ecd0', fin: '#a89040', finx: '#ffffff', p1: '#3a4420', p3: '#e8e890', iris: '#d8ffb0' },
  },
  tigermuskie: {
    sP: 0.86, top: scl(PIKE_TOP, 1.05), bot: scl(PIKE_BOT, 1.05),
    zones: { bs: [[0, 0.6], [0.2, 0.42], [0.8, 0.38]], sb: [[0, -0.2], [0.2, -0.32], [0.8, -0.45]] },
    ...pikeFins(),
    tail: { type: 'rfork', spread: 0.1, rays: 4 },
    eye: { s: 0.16, t: 0.034, px: 3 },
    mouth: { pts: [[0.003, 0.002], [0.08, -0.004], [0.145, -0.012]], teethOpen: true },
    gill: { s: 0.25, n0: 0.6, n1: -0.75, bulge: 0.02 },
    pats: [
      { op: 'bars', mat: 'p1', n: 12, s0: 0.24, s1: 0.86, hw: 0.013, nTop: 1.1, nBot: -0.55, wave: 0.02, broken: 0.3, slant: 0.3 },
      { op: 'spots', mat: 'p2', shape: 'dot', spacing: 0.05, region: 'fins' },
    ],
    colors: { back: '#4a5a3a', side: '#c0c8a0', belly: '#f0eee0', fin: '#b08a4a', p1: '#2a3420', p2: '#3a2a18', iris: '#e0c050' },
  },
  mapleKoi: {
    sP: 0.7,
    top: [[0, 0.012], [0.04, 0.05], [0.1, 0.094], [0.2, 0.135], [0.32, 0.152], [0.45, 0.148], [0.58, 0.118], [0.66, 0.086], [0.7, 0.07]],
    bot: [[0, 0.024], [0.04, 0.046], [0.1, 0.08], [0.2, 0.112], [0.32, 0.124], [0.45, 0.12], [0.58, 0.095], [0.66, 0.07], [0.7, 0.06]],
    zones: { bs: [[0, 0.5]], sb: [[0, -0.42], [0.7, -0.5]] },
    dorsal: [{ s0: 0.28, s1: 0.62, h: [[0, 0.08], [0.15, 0.12], [0.7, 0.1], [1, 0.05]], rake: 0.5, rays: 5, edge: 'finx' }],
    ventral: [
      { s0: 0.34, s1: 0.4, h: [[0, 0.1], [1, 0.03]], rake: 1.0, edge: 'finx' },
      { s0: 0.55, s1: 0.63, h: [[0, 0.09], [1, 0.03]], rake: 0.8 },
    ],
    pec: { s: 0.2, t: -0.06, len: 0.2, w: 0.085, ang: 32 },
    tail: { type: 'flow', spread: 0.2, rays: 4, edge: 'finx', edgeAt: 0.86 },
    eye: { s: 0.1, t: 0.035, px: 3 },
    mouth: { pts: [[0.004, 0.0], [0.025, -0.008]] },
    gill: { s: 0.19, n0: 0.5, n1: -0.72, bulge: 0.025 },
    barbels: [[[0.02, -0.014], [0.035, -0.036]]],
    scales: { per: 3, dark: true },
    pats: [
      { op: 'blob', mat: 'p1', s: 0.12, t: 0.055, rs: 0.05, rt: 0.042 },
      { op: 'blob', mat: 'p1', s: 0.58, t: 0.02, rs: 0.075, rt: 0.075 },
      { op: 'stamp', mat: 'p1', s: 0.38, t: 0.06, rows: LEAF5 },
    ],
    colors: { back: '#f6f2ea', side: '#faf8f2', belly: '#ffffff', fin: '#f2e2dc', finx: '#f09a90', p1: '#d52b1e', iris: '#f0c030' },
  },
};

// ===========================================================================
// Palettes and morphs
// ===========================================================================
function baseColors(def) {
  const c = def.colors;
  const C = new Array(NMAT).fill(null);
  C[BACK] = c.back; C[SIDE] = c.side; C[BELLY] = c.belly; C[HEAD] = c.head || c.back;
  C[FIN] = c.fin; C[FIN2] = c.fin2 || c.fin; C[FINX] = c.finx || tweak(c.fin, 0.22, 10, 0.55);
  C[P1] = c.p1 || tweak(c.side, -0.22, -14); C[P2] = c.p2 || tweak(c.side, -0.3, -18);
  C[P3] = c.p3 || tweak(c.side, 0.18, 12, 0.7); C[P4] = c.p4 || tweak(c.side, 0.25, 12, 0.5);
  C[P5] = c.p5 || '#e0302a'; C[P6] = c.p6 || '#ffffff';
  C[SCUTE] = c.scute || '#dcd6c0';
  C[IRIS] = c.iris || '#e8b848'; C[PUPIL] = c.pupil || '#141018'; C[SHINE] = c.shine || '#ffffff';
  C[MOUTH] = c.mouth || outlineOf(c.belly, 0.36); C[TEETH] = c.teeth || '#f6f2e4';
  C[BARB] = c.barb || outlineOf(c.side, 0.42);
  C[GAPE] = c.gape || '#6a1f2a';
  return C;
}
const FLAT = new Set([PUPIL, SHINE, MOUTH, TEETH, BARB]);
const A = (rgb, a = 1) => [rgb[0], rgb[1], rgb[2], Math.round(255 * a)];
const PAT_MATS = [P1, P2, P3, P4, P5, P6];

// spec: { C: colours per mat, ramps?: explicit 5-tone ramps per mat, alpha, outK/outFloor/outCeil, outline }
function makePalette(spec) {
  const { C } = spec;
  const ramps = new Array(NMAT).fill(null), outline = new Array(NMAT).fill(null);
  const al = spec.alpha || {};
  for (let m = 1; m < NMAT; m++) {
    const a = al[m] ?? al.all ?? 1;
    if (spec.ramps && spec.ramps[m]) ramps[m] = spec.ramps[m].map((c) => A(hexRgb(c), a));
    else if (C[m]) ramps[m] = FLAT.has(m) ? new Array(5).fill(A(hexRgb(C[m]), a)) : ramp5(C[m], spec.spread || 1).map((c) => A(c, a));
    if (!ramps[m]) continue;
    const oc = spec.outline ? hexRgb(spec.outline) : outlineOf(ramps[m][2], spec.outK || 0.42, spec.outFloor ?? 0.13, spec.outCeil ?? 0.34);
    outline[m] = A(oc, al.outline ?? 1);
  }
  return { ramps, outline, bands: spec.bands || null, pixel: spec.pixel || null, sparkle: spec.sparkle || 0, glow: spec.glow || null, sparkCol: spec.sparkCol };
}

// Gradient bands along the body (aurora, prismatic): list of { u, C } where C
// overrides colours for some mats; ramps are built per band.
function makeBands(list, mats, rampFn) {
  return {
    u: list.map((b) => b.u),
    mats: new Set(mats),
    ramps: list.map((b) => { const r = new Array(NMAT).fill(null); for (const m of mats) if (b.C[m]) r[m] = rampFn(b.C[m], m); return r; }),
    outline: list.map((b) => { const r = new Array(NMAT).fill(null); for (const m of mats) if (b.C[m]) r[m] = A(outlineOf(b.C[m], 0.42)); return r; }),
  };
}

const MORPHS = {
  normal(def, C) {
    const spec = { C };
    if (def.grad) {
      const list = def.grad.map(([u, cols]) => {
        const CC = new Array(NMAT).fill(null);
        for (const k of Object.keys(cols)) CC[MAT_BY_NAME[k]] = cols[k];
        return { u, C: CC };
      });
      spec.bands = makeBands(list, [BACK, SIDE, HEAD, FIN, FIN2], (c) => ramp5(c).map((x) => A(x)));
    }
    return spec;
  },
  albino(def, C) {
    const D = C.slice();
    D[BACK] = '#f1d6d4'; D[SIDE] = '#f8e6e2'; D[BELLY] = '#fff6f2'; D[HEAD] = '#f3dcda';
    D[FIN] = '#f2bcc2'; D[FIN2] = '#f5b0ba'; D[FINX] = '#fff1f1';
    for (const m of PAT_MATS) { const L = lightness(C[m]); D[m] = lchRgb(0.8 + 0.13 * L, 0.05 + 0.02 * (1 - L), 12); }
    D[SCUTE] = '#fff0ea'; D[IRIS] = '#d4243e'; D[PUPIL] = '#6a0a20'; D[MOUTH] = '#b05c68'; D[BARB] = '#d8a0a6';
    return { C: D, spread: 0.8, outK: 0.62, outFloor: 0.44, outCeil: 0.6 };
  },
  melanistic(def, C) {
    const D = C.slice();
    const R = [];
    R[BACK] = ['#0d0e12', '#15161c', '#1e2028', '#243e46', '#3a3462'];
    R[SIDE] = ['#121318', '#1b1d24', '#282a33', '#2b4850', '#453e70'];
    R[BELLY] = ['#1f2027', '#2a2b33', '#373841', '#434551', '#50525f'];
    R[HEAD] = R[BACK];
    R[FIN] = ['#15161b', '#1e2027', '#2a2c35', '#363a46', '#454a58'];
    R[FIN2] = R[FIN];
    for (const m of PAT_MATS) {
      const L = lightness(C[m]);
      const base = L > 0.62 ? '#454756' : '#16171c';
      R[m] = ramp5(base, 0.6).map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
    }
    D[FINX] = '#6a6c7c'; D[SCUTE] = '#50525e'; D[IRIS] = '#c9d1db'; D[PUPIL] = '#060608'; D[MOUTH] = '#050507'; D[BARB] = '#2a2c34';
    return { C: D, ramps: R, outK: 0.5, outFloor: 0.05, outCeil: 0.11 };
  },
  calico(def, C) {
    const D = C.slice();
    D[BACK] = '#f3eee5'; D[SIDE] = '#faf6ee'; D[BELLY] = '#fffdf8'; D[HEAD] = '#f5f0e8';
    D[FIN] = '#f2ebe2'; D[FIN2] = '#f2ebe2'; D[FINX] = '#fffaf4';
    for (const m of PAT_MATS) D[m] = '#e9e2d6';
    D[SCUTE] = '#fff8ee'; D[BARB] = '#b8a898';
    const orange = ramp5('#ee8a2e').map((c) => A(c)), black = ramp5('#2b2b31', 0.7).map((c) => A(c));
    const orangeFin = ramp5('#f6b476').map((c) => A(c));
    const oOut = A(outlineOf(orange[2])), bOut = A(outlineOf(black[2], 0.5, 0.06, 0.12));
    const seed = strSeed(def.id + ':calico');
    const patch = (u, n) => {
      const o = fbm(u * 5.2 + 1.7, n * 1.25 + 3.1, seed, 2);
      if (o > 0.56) return 1;
      const k = fbm(u * 6.4 + 9.3, n * 1.5 + 0.7, seed + 99, 2);
      return k > 0.64 ? 2 : 0;
    };
    const pixel = (B, i, x, y, c) => {
      const m = B.mat[i], base = B.base[i], part = B.part[i];
      const bodyish = part === PT_BODY && (isBodyMat(m) || isPatMat(m) || m === GILL || m === OUTL);
      if (bodyish && m !== SCUTE) {
        const pc = patch(B.fs[i], B.fn[i]);
        if (!pc) return null;
        const r = pc === 1 ? orange : black;
        if (m === OUTL) return pc === 1 ? oOut : bOut;
        let t = B.tone[i];
        if (isPatMat(m)) t = Math.max(0, t - 1);
        if (m === GILL) t = Math.max(0, t - 2);
        if (base === BACK && t > 0 && m !== GILL) t = Math.min(t, 3);
        return r[t];
      }
      if ((part === PT_TAIL || part === PT_FIN) && (m === FIN || m === FIN2) && patch(B.fs[i], 0.2) === 1) return orangeFin[B.tone[i]];
      return null;
    };
    return { C: D, pixel };
  },
  ghost(def, C) {
    const D = C.slice();
    D[BACK] = '#c9e6fb'; D[SIDE] = '#ddf2ff'; D[BELLY] = '#eefaff'; D[HEAD] = '#cfe9fc';
    D[FIN] = '#cfeeff'; D[FIN2] = '#cfeeff'; D[FINX] = '#f2fcff';
    for (const m of PAT_MATS) D[m] = lightness(C[m]) > 0.62 ? '#f4fdff' : '#a4d2ee';
    D[SCUTE] = '#f2fbff'; D[IRIS] = '#c4fdff'; D[PUPIL] = '#2d7fa0'; D[MOUTH] = '#86c2e0'; D[TEETH] = '#ffffff'; D[BARB] = '#8fe8f6';
    const alpha = { all: 0.6, [FIN]: 0.42, [FIN2]: 0.42, [FINX]: 0.5, [IRIS]: 1, [PUPIL]: 1, [SHINE]: 1, [BARB]: 0.95, outline: 1 };
    return { C: D, alpha, outline: '#74eeff', spread: 0.7, glow: A(hexRgb('#aef6ff'), 0.78) };
  },
  golden(def, C) {
    const D = C.slice();
    const R = [];
    const G = ['#a5631b', '#e59a1f', '#ffd23f', '#ffe680', '#fff3a3'];
    R[SIDE] = G; R[HEAD] = ['#7e4814', '#a5631b', '#e59a1f', '#ffd23f', '#fff3a3'];
    R[BACK] = R[HEAD]; R[BELLY] = ['#e59a1f', '#ffd23f', '#ffe680', '#fff3a3', '#fffbe2'];
    R[FIN] = ['#b8721c', '#e8a428', '#ffd84a', '#ffe98a', '#fff6c2']; R[FIN2] = R[FIN];
    const dark = ['#5e3310', '#7e4814', '#a5631b', '#c8801e', '#e59a1f'];
    for (const m of PAT_MATS) R[m] = lightness(C[m]) > lightness(C[SIDE]) + 0.05 ? ['#e59a1f', '#ffd23f', '#fff3a3', '#fffbe2', '#ffffff'] : dark;
    R[SCUTE] = ['#e59a1f', '#ffd23f', '#fff3a3', '#fffbe2', '#ffffff'];
    D[FINX] = '#fff6c2'; D[IRIS] = '#fff3a3'; D[PUPIL] = '#4a2208'; D[MOUTH] = '#5e3310'; D[TEETH] = '#fffbe2'; D[BARB] = '#a5631b';
    return { C: D, ramps: R, outline: '#6b3910', sparkle: 1, sparkCol: [A([255, 255, 255]), A(hexRgb('#fff3a3'))] };
  },
  rainbow(def, C) {
    const D = C.slice();
    D[IRIS] = '#fff4fb'; D[PUPIL] = '#2e1b46'; D[MOUTH] = '#6a3a6a'; D[FINX] = '#ffffff'; D[BARB] = '#9a6ab0'; D[SCUTE] = '#fff8ff';
    const mats = [BACK, SIDE, BELLY, HEAD, FIN, FIN2, P1, P2, P3, P4, P5, P6];
    const list = [];
    const N = 8;
    for (let k = 0; k < N; k++) {
      const h = 22 + (k / (N - 1)) * 300;
      const CC = new Array(NMAT).fill(null);
      CC[SIDE] = lchRgb(0.86, 0.09, h); CC[BACK] = lchRgb(0.77, 0.11, h + 6); CC[HEAD] = CC[BACK];
      CC[BELLY] = lchRgb(0.94, 0.045, h - 4); CC[FIN] = lchRgb(0.89, 0.075, h + 10); CC[FIN2] = CC[FIN];
      for (const m of PAT_MATS) CC[m] = lightness(C[m]) > lightness(C[SIDE]) + 0.05 ? lchRgb(0.96, 0.03, h) : lchRgb(0.66, 0.13, h + 8);
      list.push({ u: k / (N - 1), C: CC });
    }
    const bands = makeBands(list, mats, (c) => ramp5(c, 0.8).map((x) => A(x)));
    return { C: D, bands, sparkle: 1, sparkCol: [A([255, 255, 255]), A([255, 255, 255])] };
  },
};

function colorize(B, pal, seed = 0) {
  const n = B.w * B.h, w = B.w;
  const img = new Uint8ClampedArray(n * 4);
  const { mat, tone, base } = B;
  const bands = pal.bands;
  for (let i = 0; i < n; i++) {
    const m = mat[i];
    if (!m) continue;
    const x = i % w, y = (i / w) | 0;
    let ramps = pal.ramps, outs = pal.outline;
    if (bands) {
      const key = m === OUTL || m === GILL || m === RING ? base[i] : m;
      if (bands.mats.has(key)) {
        const u = B.fs[i], U = bands.u;
        let p = 0;
        if (u >= U[U.length - 1]) p = U.length - 1;
        else if (u > U[0]) { let k = 0; while (u > U[k + 1]) k++; p = k + (u - U[k]) / (U[k + 1] - U[k]); }
        const bi = clamp(Math.floor(p + 0.5 + ((x + y) & 1 ? 0.14 : -0.14)), 0, U.length - 1);
        if (bands.ramps[bi][key]) { ramps = bands.ramps[bi]; outs = bands.outline[bi]; }
      }
    }
    let c;
    if (m === OUTL || m === RING) c = outs[base[i]] || pal.outline[base[i]] || pal.outline[SIDE];
    else if (m === GILL) c = (ramps[base[i]] || pal.ramps[base[i]] || pal.ramps[SIDE])[Math.max(0, tone[i] - 2)];
    else c = (ramps[m] || pal.ramps[m] || pal.ramps[SIDE])[tone[i]];
    if (pal.pixel) c = pal.pixel(B, i, x, y, c) || c;
    img[i * 4] = c[0]; img[i * 4 + 1] = c[1]; img[i * 4 + 2] = c[2]; img[i * 4 + 3] = c[3];
  }
  if (pal.glow) {
    // ghost: faint inner glow just inside the outline
    const g = pal.glow;
    for (let i = 0; i < n; i++) {
      const m = mat[i];
      if (!m || m === OUTL || B.part[i] === PT_EYE) continue;
      const x = i % w;
      if ((x > 0 && mat[i - 1] === OUTL) || (x < w - 1 && mat[i + 1] === OUTL) || (i >= w && mat[i - w] === OUTL) || (i + w < n && mat[i + w] === OUTL)) {
        img[i * 4] = g[0]; img[i * 4 + 1] = g[1]; img[i * 4 + 2] = g[2]; img[i * 4 + 3] = Math.max(img[i * 4 + 3], g[3]);
      }
    }
  }
  if (pal.sparkle) sparkles(B, img, seed, pal.sparkCol);
  return img;
}

// A few twinkling sparkle pixels on lit body areas; positions change with the
// frame seed so the animation glitters.
function sparkles(B, img, seed, cols) {
  const { w, h, mat, part, tone } = B;
  const cand = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (part[i] !== PT_BODY || !(isBodyMat(mat[i]) || isPatMat(mat[i])) || tone[i] < 2) continue;
    if (mat[i - 1] === OUTL || mat[i + 1] === OUTL || mat[i - w] === OUTL || mat[i + w] === OUTL) continue;
    cand.push(i);
  }
  if (!cand.length) return;
  const r = rng(seed);
  const count = clamp(Math.round((w * h) / 260), 1, 3);
  const put = (i, c) => { img[i * 4] = c[0]; img[i * 4 + 1] = c[1]; img[i * 4 + 2] = c[2]; img[i * 4 + 3] = 255; };
  for (let k = 0; k < count; k++) {
    const i = cand[Math.floor(r() * cand.length)];
    put(i, cols[0]);
    if (k === 0 && w >= 30) for (const j of [i - 1, i + 1, i - w, i + w]) if (part[j] === PT_BODY && mat[j] !== OUTL) put(j, cols[1]);
  }
}

// ===========================================================================
// Fry: a chubby, big-eyed, simplified juvenile derived from the adult art
// ===========================================================================
function fryDef(def, P) {
  const d = { ...def };
  const k = def.fry?.chub ?? 1.16;
  d.top = (def.fry?.top || def.top).map(([x, y]) => [x, y * k]);
  d.bot = (def.fry?.bot || def.bot).map(([x, y]) => [x, y * k * 0.98]);
  const small = P < 10;
  const e = def.eye || { s: 0.1, t: 0.04 };
  d.eye = { s: Math.max(0.14, e.s * 1.15 + 0.035), t: e.t * 1.15 + 0.012, px: small ? 2 : 3, style: e.style === 'glass' ? 'glass' : undefined };
  if (def.fry?.eye) Object.assign(d.eye, def.fry.eye);
  const finK = (f, kk) => ({ ...f, h: f.h.map(([a, b]) => [a, b * kk]), spines: 0, rays: 0, spot: null, edge: small ? null : f.edge, lead: small ? null : f.lead });
  const sail = def.fry?.sail ?? 0.9;
  d.dorsal = (def.dorsal || []).filter((f) => !f.flat).map((f) => finK(f, f.h.some(([, hh]) => hh > 0.15) ? sail : 0.72));
  d.ventral = (def.ventral || []).map((f) => finK(f, 0.7));
  if (def.dorsal && def.dorsal.length > 1 && def.dorsal[0].spines && !def.fry?.keepSplit) {
    // merge split dorsals into one soft fin
    const all = d.dorsal;
    d.dorsal = [{ s0: all[0].s0, s1: all[all.length - 1].s1, h: [[0, 0.07], [0.5, 0.1], [1, 0.05]], rake: 0.5 }];
  }
  d.pec = def.pec && !small ? { ...def.pec, len: def.pec.len * 0.85, w: def.pec.w * 1.3, lead: null } : null;
  d.tail = { ...def.tail, rays: 0, edge: small ? null : def.tail.edge, spread: def.tail.spread * (def.fry?.tail ?? 1.05) };
  if (d.tail.type === 'deep') d.tail.type = 'fork';
  d.mouth = def.mouth?.pts ? { pts: [def.mouth.pts[0], [def.mouth.pts[0][0] + 0.05, def.mouth.pts[0][1] - 0.01]] } : null;
  if (small && d.mouth) d.mouth = { pts: [def.mouth.pts[0]] };
  d.gill = null;
  d.scales = null;
  d.barbels = (def.barbels || []).slice(0, 2).map((b) => [b[0], [b[1][0], b[0][1] + (b[1][1] - b[0][1]) * 0.6]]);
  d.scutes = def.scutes ? { ...def.scutes, step: def.scutes.step * 1.7, h: def.scutes.h * 1.2 } : null;
  d.rim = def.rim;
  d.pats = [];
  for (const p0 of def.pats || []) {
    const p = { ...p0 };
    switch (p.op) {
      case 'bars': p.n = Math.min(p.n, small ? 2 : 3); p.hw = (p.hw ?? 0.02) * 1.9; p.hwBot = (p.hwBot ?? p.hw) * 1.6; p.broken = 0; p.wave = 0; break;
      case 'saddles': p.n = Math.min(p.n, 3); p.hw *= 1.5; break;
      case 'spots': if (p.region && p.region !== 'body') continue; p.spacing *= 2.1; p.shape = 'dot'; p.halo = small ? null : p.halo; break;
      case 'worms': p.scale *= 1.8; break;
      case 'mottle': p.scale *= 1.6; break;
      case 'lines': if (small) continue; p.lines = p.lines.slice(0, 1); break;
      case 'blob': if (p.rs < 0.025) continue; p.rs *= 1.15; p.rt *= 1.15; break;
      case 'stamp': p.rows = ['.#.', '###', '.#.']; break;
      case 'plates': p.step *= 1.7; p.big = false; break;
      default: break;
    }
    d.pats.push(p);
  }
  d.swim = { ...(def.swim || {}), flex: 0.5 };
  return d;
}

// ===========================================================================
// Per-species sprite sets (index sprites for every frame), cached
// ===========================================================================
const SPECIES_SIZE = Object.fromEntries(SPECIES.map((s) => [s.id, s.size]));
const _sets = new Map();

function defFor(id) {
  if (DEFS[id]) return { id, ...DEFS[id] };
  return { id: 'bluegill', ...DEFS.bluegill };
}
function resolveId(id) { return DEFS[id] ? id : 'bluegill'; }

function spriteSet(id) {
  id = resolveId(id);
  let S = _sets.get(id);
  if (S) return S;
  const def = defFor(id);
  const size = SPECIES_SIZE[id] || 1;
  const W = Math.round(size * FISH_TEXELS_PER_UNIT);
  const F = compile(def, W - 4);
  const swim = cropShared([0, 1, 2, 3].map((f) => renderPose(F, swimPose(F, f, false))));
  const [flop] = cropShared([renderPose(F, flopPose(F))]);
  const fryLen = Math.round(clamp(9 + ((size - 0.8) / 1.3) * 7, 9, 16));
  const FF = compile(fryDef(def, fryLen - 2), fryLen - 2);
  const fry = cropShared([0, 1].map((f) => renderPose(FF, swimPose(FF, f, true))));
  S = { id, def, F, adult: [...swim, flop], fry };
  _sets.set(id, S);
  return S;
}

const _pals = new Map();
function paletteFor(id, morph) {
  if (!MORPHS[morph]) morph = 'normal';
  const key = id + '|' + morph;
  let p = _pals.get(key);
  if (!p) {
    const def = defFor(id);
    p = makePalette(MORPHS[morph](def, baseColors(def)));
    _pals.set(key, p);
  }
  return p;
}

function frameIndex(frame, n) {
  let f = Math.floor(Number(frame) || 0) % n;
  return f < 0 ? f + n : f;
}
function spriteImageData(id, morph, frame, fry) {
  const S = spriteSet(id);
  const list = fry && S.fry.length ? S.fry : S.adult;
  frame = frameIndex(frame, list.length);
  const B = list[frame];
  const img = colorize(B, paletteFor(S.id, morph), strSeed(`${S.id}|${frame}|${fry ? 1 : 0}`));
  return { w: B.w, h: B.h, img };
}

function newCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

export function fishSize(id, fry = false) {
  const S = spriteSet(id);
  const B = fry && S.fry.length ? S.fry[0] : S.adult[0];
  return { w: B.w, h: B.h };
}

const _canv = new Map();
export function fishCanvas(id, { morph = 'normal', frame = 0, fry = false, scale = 1 } = {}) {
  if (!MORPHS[morph]) morph = 'normal';
  frame = frameIndex(frame, fry ? 2 : FISH_FRAMES);
  scale = scale > 0 ? scale : 1;
  const key = `${resolveId(id)}|${morph}|${frame}|${fry ? 1 : 0}|${scale}`;
  let cv = _canv.get(key);
  if (cv) return cv;
  const { w, h, img } = spriteImageData(id, morph, frame, fry);
  const base = newCanvas(w, h);
  base.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(img, w, h), 0, 0);
  if (scale === 1) cv = base;
  else {
    cv = newCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
  }
  _canv.set(key, cv);
  return cv;
}

// Debug helper for the preview page: false-colour view of the semantic slots.
export function _debugSlots(id, frame = 0, fry = false, scale = 8) {
  const S = spriteSet(id);
  const B = (fry && S.fry.length ? S.fry : S.adult)[frame];
  const cols = { [BACK]: [60, 90, 200], [SIDE]: [90, 170, 230], [BELLY]: [240, 200, 90], [HEAD]: [150, 90, 200], [FIN]: [120, 200, 120], [FINX]: [250, 250, 250],
    [P1]: [220, 60, 60], [P2]: [120, 20, 20], [P3]: [240, 120, 200], [P4]: [255, 170, 60], [RING]: [30, 30, 30], [IRIS]: [255, 230, 0], [PUPIL]: [0, 0, 0], [SHINE]: [255, 255, 255],
    [MOUTH]: [90, 0, 60], [TEETH]: [255, 255, 200], [GILL]: [255, 0, 255], [OUTL]: [20, 20, 30], [SCUTE]: [200, 200, 180], [BARB]: [255, 128, 0] };
  const cv = newCanvas(B.w * scale, B.h * scale);
  const g = cv.getContext('2d', { willReadFrequently: true });
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const i = y * B.w + x, m = B.mat[i];
    if (!m) continue;
    const c = cols[m] || [128, 128, 128];
    const k = 0.55 + B.tone[i] * 0.12;
    g.fillStyle = `rgb(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0})`;
    g.fillRect(x * scale, y * scale, scale, scale);
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.font = `${scale * 0.5}px 'TBME Body', monospace`;
    g.fillText(String(B.tone[i]), x * scale + 2, y * scale + scale * 0.7);
  }
  return cv;
}

export function fishDataURL(id, opts = {}) {
  const o = { morph: 'normal', frame: 0, fry: false, scale: 1, ...opts };
  const key = `${resolveId(id)}|${o.morph}|${o.frame}|${o.fry ? 1 : 0}|${o.scale}`;
  let u = _urls.get(key);
  if (!u) { u = fishCanvas(id, o).toDataURL(); _urls.set(key, u); }
  return u;
}
const _urls = new Map();

// ===========================================================================
// Extras: fish skeletons (bears toss these) and a clutch of eggs
// ===========================================================================
const BONE = 1, BONE_OUT = 2, BONE_DARK = 3;
function boneSprite(L) {
  const W = L + 2, H = Math.round(L * 0.5) + 4;
  const m = new Uint8Array(W * H), tn = new Uint8Array(W * H);
  const set = (x, y, t = 2) => { x = Math.round(x); y = Math.round(y); if (x >= 1 && y >= 1 && x < W - 1 && y < H - 1) { m[y * W + x] = BONE; tn[y * W + x] = t; } };
  const hole = (x, y) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = BONE_DARK; };
  const line = (x0, y0, x1, y1, t = 2) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let k = 0; k <= n; k++) set(lerp(x0, x1, k / n), lerp(y0, y1, k / n), t); };
  const cy = Math.floor(H / 2);
  const big = L >= 30, mid = L >= 20;
  // skull: rounded wedge pointing right
  const sw = Math.round(L * (big ? 0.3 : 0.34)), sh = Math.round(L * (big ? 0.3 : 0.36));
  const sx1 = W - 2, sx0 = sx1 - sw;
  for (let y = 0; y < H; y++) for (let x = sx0; x <= sx1; x++) {
    const u = (x - sx0) / sw; // 0 back .. 1 snout
    const half = (sh / 2) * (u < 0.55 ? Math.sqrt(1 - ((0.55 - u) / 0.62) ** 2) : 1 - ((u - 0.55) / 0.45) * 0.72);
    const dy = y + 0.5 - (cy + 0.5 + (u > 0.6 ? (u - 0.6) * 1.2 : 0));
    if (Math.abs(dy) <= half) set(x, y, dy < -half + 1.2 ? 3 : dy > half - 1.2 ? 1 : 2);
  }
  // eye socket (X eye on the bigger ones) and a jaw notch
  const ex = sx0 + Math.round(sw * 0.52), ey = cy - Math.round(sh * 0.14);
  if (mid) { for (const [dx, dy] of big ? [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]] : [[0, 0], [1, 0], [0, -1], [1, -1]]) hole(ex + dx, ey + dy); }
  else hole(ex, ey);
  for (let x = sx1 - Math.round(sw * 0.45); x <= sx1 + 1; x++) hole(x, cy + Math.round(sh * 0.12));
  // spine with vertebra beads
  const tx = 2 + Math.round(L * 0.14);
  line(tx, cy, sx0 + 1, cy, 3);
  if (big) line(tx, cy + 1, sx0 + 1, cy + 1, 1);
  for (let x = tx + 1; x < sx0; x += big ? 3 : 2) { set(x, cy - 1, 3); if (big) set(x, cy + 2, 1); }
  // ribs: pairs curving back, shrinking toward the tail
  const nr = big ? 6 : mid ? 4 : 3;
  const r0 = sx0 - 1, r1 = tx + Math.round(L * 0.12);
  for (let i = 0; i < nr; i++) {
    const x = Math.round(lerp(r0, r1, i / Math.max(1, nr - 1)));
    const hgt = (sh / 2 + (big ? 1.5 : 0.5)) * lerp(1, 0.5, i / Math.max(1, nr - 1));
    const back = Math.max(1, Math.round(hgt * 0.45));
    line(x, cy - 1, x - back, cy - hgt, 3);
    line(x, cy + 1 + (big ? 1 : 0), x - back, cy + hgt + (big ? 1 : 0), 1);
  }
  // tail fork
  const th = Math.round(L * (big ? 0.2 : 0.22));
  line(tx, cy, 1, cy - th, 3); line(tx, cy, 1, cy + th, 1);
  if (mid) { line(tx, cy - 1, 2, cy - th, 3); line(tx, cy + 1, 2, cy + th, 1); set(1, cy - th + 1, 2); set(1, cy + th - 1, 2); }
  // outline
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (m[i] === BONE) continue;
    if ((x > 0 && m[i - 1] === BONE) || (x < W - 1 && m[i + 1] === BONE) || (y > 0 && m[i - W] === BONE) || (y < H - 1 && m[i + W] === BONE)) out[i] = 1;
  }
  const img = new Uint8ClampedArray(W * H * 4);
  const cols = { 1: hexRgb('#cfb98f'), 2: hexRgb('#f0e4c6'), 3: hexRgb('#fff9ec') }, oc = hexRgb('#5a3826');
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) {
    let c = null;
    if (m[i] === BONE) c = cols[tn[i]] || cols[2];
    else if (out[i] || m[i] === BONE_DARK) c = oc;
    if (!c) continue;
    img.set([c[0], c[1], c[2], 255], i * 4);
    const x = i % W, y = (i / W) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return cropImg(img, W, H, x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3);
}
function cropImg(img, W, H, x0, y0, w, h) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + x0, sy = y + y0;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const si = (sy * W + sx) * 4, di = (y * w + x) * 4;
    o[di] = img[si]; o[di + 1] = img[si + 1]; o[di + 2] = img[si + 2]; o[di + 3] = img[si + 3];
  }
  return { w, h, img: o };
}
function eggSprite() {
  const W = 14, H = 12;
  const img = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= W || y >= H) return; img.set([c[0], c[1], c[2], a], (y * W + x) * 4); };
  const out = hexRgb('#9a3e18'), base = hexRgb('#f6892c'), lite = hexRgb('#ffc166'), shade = hexRgb('#d9621f'), hi = hexRgb('#fffbe8'), dot = hexRgb('#6a2a14');
  // back row first so front eggs overlap it
  const eggs = [[3, 1, 0], [7, 1, 1], [1, 4, 0], [5, 4, 1], [9, 4, 0], [3, 7, 1], [7, 7, 0]];
  for (const [ex, ey, e] of eggs) {
    for (let y = -1; y <= 3; y++) for (let x = -1; x <= 3; x++) {
      const corner = (x === -1 || x === 3) && (y === -1 || y === 3);
      if (corner) continue;
      const edge = x === -1 || x === 3 || y === -1 || y === 3;
      if (edge) { put(ex + x, ey + y, out); continue; }
      let c = base, a = 228;
      if (x === 1 && y === 1) c = lite;
      if (y === 2 || x === 2) c = x === 0 && y === 2 ? base : shade;
      if (x === 1 && y === 1) c = lite;
      if (x === 0 && y === 0) { c = hi; a = 255; }
      if (e && x === 2 && y === 2) { c = dot; a = 255; }
      put(ex + x, ey + y, c, a);
    }
  }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < W * H; i++) if (img[i * 4 + 3]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return cropImg(img, W, H, x0 - 1, y0 - 1, x1 - x0 + 3, y1 - y0 + 3);
}
const EXTRA_BUILD = { bones_s: () => boneSprite(13), bones_m: () => boneSprite(22), bones_l: () => boneSprite(34), eggs: eggSprite };
const _extras = new Map();
function extraImage(name) {
  if (!EXTRA_BUILD[name]) name = 'bones_m';
  let e = _extras.get(name);
  if (!e) { e = EXTRA_BUILD[name](); _extras.set(name, e); }
  return e;
}
const _extraCanv = new Map();
export function extraCanvas(name, scale = 1) {
  const key = name + '|' + scale;
  let cv = _extraCanv.get(key);
  if (cv) return cv;
  const { w, h, img } = extraImage(name);
  const base = newCanvas(w, h);
  base.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(img, w, h), 0, 0);
  if (scale === 1) cv = base;
  else {
    cv = newCanvas(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
  }
  _extraCanv.set(key, cv);
  return cv;
}

// ===========================================================================
// Atlas: every species x morph x frame (+ fry) + extras in one POT canvas
// ===========================================================================
let _atlas = null;
export function buildFishAtlas() {
  if (_atlas) return _atlas;
  const items = [];
  const ids = Object.keys(DEFS);
  for (const id of ids) {
    const S = spriteSet(id);
    for (const morph of MORPH_LIST) {
      S.adult.forEach((B, f) => items.push({ key: `${id}|${morph}|${f}|0`, id, morph, f, fry: false, w: B.w, h: B.h }));
      S.fry.forEach((B, f) => items.push({ key: `${id}|${morph}|${f}|1`, id, morph, f, fry: true, w: B.w, h: B.h }));
    }
  }
  for (const name of Object.keys(EXTRA_BUILD)) { const e = extraImage(name); items.push({ key: 'x|' + name, extra: name, w: e.w, h: e.h }); }
  // shelf packing, tallest first, into the smallest power-of-two square-ish canvas
  const order = items.slice().sort((a, b) => b.h - a.h || b.w - a.w);
  const tryPack = (W, H) => {
    let x = 0, y = 0, rowH = 0;
    for (const it of order) {
      if (x + it.w > W) { x = 0; y += rowH + 1; rowH = 0; }
      if (y + it.h > H) return false;
      it.x = x; it.y = y; x += it.w + 1; rowH = Math.max(rowH, it.h);
    }
    return true;
  };
  let W = 512, H = 512;
  for (const [w, h] of [[512, 512], [1024, 512], [1024, 1024], [2048, 1024], [2048, 2048]]) { W = w; H = h; if (tryPack(w, h)) break; }
  const canvas = newCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rects = new Map(), extras = {};
  for (const it of order) {
    const data = it.extra ? extraImage(it.extra) : spriteImageData(it.id, it.morph, it.f, it.fry);
    ctx.putImageData(new ImageData(data.img, data.w, data.h), it.x, it.y);
    const r = Object.freeze({ x: it.x, y: it.y, w: it.w, h: it.h });
    if (it.extra) extras[it.extra] = r; else rects.set(it.key, r);
  }
  _atlas = {
    canvas,
    frame(id, morph = 'normal', frame = 0, fry = false) {
      const sid = resolveId(id);
      const m = MORPHS[morph] ? morph : 'normal';
      const n = fry ? 2 : FISH_FRAMES;
      let f = Math.floor(Number(frame) || 0) % n;
      if (f < 0) f += n;
      return rects.get(`${sid}|${m}|${f}|${fry ? 1 : 0}`);
    },
    extra(name) { return extras[name] || extras.bones_m; },
  };
  return _atlas;
}
