// Pixel-art food packaging for "The Bear Must Eat": the fish-food bags (each
// brand with its own mascot), the mascots on their own, and little crates /
// baskets of garden produce for the Food picker.
//
//   bagCanvas(id, { scale = 1, fill = 1, open = false, shake = 0, ghost = false }) -> cached <canvas>
//       BAG_W x BAG_H texels per scale step (the bag itself is ~40x56, the rest is
//       room for the outline, a lean and food peeking out of the top)
//       fill   0..1  how full it looks: the top deflates, creases and slumps as it empties
//       open         the top is torn off and the food peeks out
//       shake  -1..1 the bag leans (frames for a throw wobble)
//       ghost        a flat dashed silhouette (bags you have never owned)
//   mascotCanvas(id, scale = 4)   -> cached <canvas>: the brand mascot on its own
//   produceCanvas(id, scale = 2)  -> cached <canvas> 24x24: produce in a crate / basket,
//                                    a special find on a velvet cushion
//   bagLook(id)                   -> { main, accent, dark, trim } CSS colours of the brand
//   BAG_W, BAG_H, MASCOTS         (MASCOTS: bag id -> mascot name)
//
// A small pixel kit (Grid authoring + render(): ramps, automatic top-left
// shading, inner lines and outlines tinted by the local colour, mirroring
// src/ui/sprites.js) is exported for src/ui/icons/foodIcons.js. This module
// imports no other UI module (the icon glob in sprites.js imports
// foodIcons.js, which imports this file), and nothing is built until asked.
import { FOOD_ITEMS } from '../data/foods.js';

// ===========================================================================
// COLOUR
// ===========================================================================
export const INK = [42, 26, 20]; // #2a1a14 warm near-black (same as sprites.js)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function rgb(h) {
  if (Array.isArray(h)) return h;
  if (typeof h === 'number') return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function hex(c) {
  return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
}
export function mix(a, b, t) {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
const hueToward = (h, to, amt) => {
  const d = ((to - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
};

// A 6-tone hue-shifted ramp from any colour (tone 3 = the colour itself):
// shadows drift toward violet, highlights toward warm yellow, like RAMPS.
const RAMP_CACHE = new Map();
export function rampFrom(base) {
  const c = rgb(base);
  const key = (c[0] << 16) | (c[1] << 8) | c[2];
  let r = RAMP_CACHE.get(key);
  if (r) return r;
  const [h, s, l] = toHsl(c);
  const grey = s < 0.12;
  const dark = (t) => fromHsl(grey ? h : hueToward(h, 262, 4.5 * t), clamp01(s * (1 + 0.04 * t)), Math.max(0.035, l * (1 - 0.2 * t)));
  const light = (t) => fromHsl(grey ? h : hueToward(h, 52, 6 * t), clamp01(s + (1 - s) * 0.12 * t), Math.min(0.97, l + (1 - l) * 0.24 * t + 0.02 * t));
  r = [dark(3), dark(2), dark(1), c, light(1), light(2)];
  RAMP_CACHE.set(key, r);
  return r;
}
// one tone step lighter (k > 0) or darker (k < 0) along the colour's own ramp
export function shade(c, k) {
  if (!k) return c;
  return rampFrom(c)[3 + Math.max(-3, Math.min(2, k))];
}

// Hue-shifted ramps (dark -> light) shared with src/ui/sprites.js so the food
// icons sit in the same palette. Tone 3 is the base colour.
export const RAMPS = {
  gold: ['#7a4a12', '#b0661a', '#e5a320', '#ffd23f', '#ffe98a', '#fffbe0'],
  brass: ['#3a2610', '#5c4219', '#8d6c32', '#b8924c', '#dcbd72', '#f6e6ac'],
  copper: ['#4a1e14', '#74301e', '#a04a2a', '#c86a3a', '#e8945a', '#fcc490'],
  wood: ['#3b2414', '#55331a', '#6b4220', '#8b5a2b', '#a86d38', '#c98f55'],
  lwood: ['#5a3418', '#7c4c26', '#a06a36', '#c28a4c', '#dcaa6a', '#f0cf98'],
  dwood: ['#1f120b', '#2e1b10', '#3b2414', '#51321b', '#6b4220', '#8b5a2b'],
  parch: ['#8a6a44', '#c4a672', '#e2c992', '#f3e2b8', '#fbf0d0', '#fffaf0'],
  cream: ['#7a5e48', '#a88a6a', '#d4b894', '#eedcbc', '#f9efdc', '#ffffff'],
  white: ['#50506a', '#8286a0', '#b4b8cc', '#dcdfea', '#f2f4f9', '#ffffff'],
  red: ['#4e1422', '#80202e', '#b0303a', '#d9453b', '#f07a52', '#ffb888'],
  pink: ['#6a2448', '#a03c68', '#d0608a', '#f08aa8', '#fab6c8', '#ffe0ea'],
  orange: ['#6a2410', '#9c3a14', '#cc5a1c', '#ee7e2a', '#faa650', '#ffd08a'],
  fox: ['#5e220e', '#8e3414', '#c2501c', '#e8702c', '#f99a4c', '#ffc680'],
  yellow: ['#7c4a10', '#b27414', '#e0a01e', '#ffcc34', '#ffe478', '#fff8c8'],
  honey: ['#5e2806', '#8e420a', '#c0680e', '#e8921a', '#f8b840', '#ffdc80'],
  green: ['#1f3f2c', '#255a3c', '#2f6f4a', '#3f8f5f', '#6cc08a', '#aee6b0'],
  leaf: ['#173628', '#1f5236', '#2a723e', '#46963c', '#7cbe46', '#c2e274'],
  olive: ['#2a2e14', '#434a1c', '#626a26', '#869034', '#aab44c', '#d4dc80'],
  mint: ['#1c4a44', '#2a6e60', '#3c9a80', '#62c4a2', '#98e2c0', '#d4f8e4'],
  teal: ['#123840', '#1a5660', '#20807c', '#30ad9c', '#68d6bc', '#b2f2dc'],
  blue: ['#1a2658', '#223e84', '#2c60b2', '#3c88d8', '#6cb6ee', '#b8e6fa'],
  sky: ['#26508e', '#3576b8', '#4e9cd8', '#7cc2ee', '#b0e0f8', '#eafaff'],
  water: ['#16304e', '#1e4a72', '#28699a', '#3a8cbc', '#62b4d8', '#a4dcee'],
  navy: ['#10142e', '#1a2046', '#252e62', '#334080', '#4a5ca2', '#7488c6'],
  purple: ['#26163e', '#3a2262', '#54328c', '#7050b8', '#9a7ed8', '#cdb8f4'],
  plum: ['#23122e', '#3a1d46', '#542a62', '#6e3a7e', '#8e56a0', '#b680c4'],
  lilac: ['#3e2e6a', '#5c4896', '#7e6ac0', '#a092e0', '#c4baf2', '#ece6ff'],
  steel: ['#262838', '#40445a', '#62687e', '#8c92aa', '#bcc2d4', '#eef0f8'],
  iron: ['#141218', '#201e28', '#2e2c38', '#43414f', '#5e5c6c', '#858394'],
  stone: ['#302c34', '#4a444e', '#696270', '#8e8690', '#b4aab0', '#d8d0cc'],
  slate: ['#1c2230', '#2a3446', '#3c4a60', '#54667e', '#7890a4', '#a8bccc'],
  black: ['#0e0c12', '#17141d', '#221e2a', '#2f2a38', '#443e50', '#625a70'],
  bear: ['#351f14', '#4e2e1e', '#6a4128', '#8a5a38', '#aa7a4e', '#c89e6c'],
  tan: ['#5e3c26', '#8c6040', '#b88a60', '#dab284', '#eed0a4', '#faeacc'],
  skin: ['#6a3a2a', '#9a5a42', '#c88262', '#eaa884', '#f8c8a4', '#ffe6cc'],
  leather: ['#2a1810', '#442618', '#623822', '#84502e', '#a66e42', '#c8905c'],
  fire: ['#6e1a0e', '#b43414', '#e8601a', '#ffa028', '#ffd24c', '#fff6c0'],
  glass: ['#2a4c6e', '#4a7ca4', '#78aed2', '#a6d4ec', '#d2eefa', '#ffffff'],
  ice: ['#3a6a9a', '#5a92c0', '#86bce0', '#b4dcf2', '#dcf2fc', '#ffffff'],
  lime: ['#2e4a10', '#467014', '#62981e', '#88c02c', '#b4e04a', '#e2f89a'],
  bone: ['#6a5a48', '#948068', '#bcaa8c', '#dccfb2', '#f0e8d4', '#fffdf4'],
  ink: ['#08080a', '#141418', '#26262c', '#3c3c44', '#5c5c66', '#8a8a94'],
  grey: ['#2c2c30', '#4a4a50', '#707076', '#9a9aa0', '#c4c4c8', '#ececee'],
  moss: ['#1a2e1a', '#26422a', '#345a34', '#4c7a40', '#6e9c52', '#9cc070'],
  sand: ['#6a4e30', '#98744a', '#c4a068', '#e2c48c', '#f2dcaa', '#fcf0d0'],
  rose: ['#5a1428', '#8a1e3a', '#bc2c4c', '#e04a64', '#f47c8c', '#ffb4bc'],
  syrup: ['#3a1606', '#62280a', '#8c3e0e', '#b65e18', '#dc8a32', '#f6c070'],
  straw: ['#5a3a12', '#86581c', '#b27e2a', '#d6a444', '#ecc66c', '#fae6a4'],
  glyph: ['#6a5448', '#b4a292', '#dccdb6', '#f6ecd8', '#fffaee', '#ffffff'],
  bberry: ['#1a1840', '#28266a', '#3a3c96', '#5058c0', '#7a86dc', '#b4c0f4'],
  cinnamon: ['#4a2210', '#733618', '#9c5024', '#c47a3a', '#e3a462', '#f4d29c'],
  blackbear: ['#16121c', '#221c2a', '#302838', '#443a4e', '#5e5268', '#7c7088'],
  grizzly: ['#2e2016', '#4a3424', '#6a4c34', '#8c6848', '#b08c68', '#cfb08a'],
  polar: ['#6a7088', '#9aa2b8', '#c4cad8', '#e4e8f0', '#f4f6fa', '#ffffff'],
  cub: ['#4a2c16', '#6e4424', '#94603a', '#b67c46', '#d8a068', '#f0c890'],
  dkbear: ['#24160e', '#3a2416', '#52341f', '#6e472c', '#8c603c', '#aa7c52'],
  beaver: ['#2e160c', '#4a2414', '#6a361c', '#8a4c28', '#aa6a3c', '#c88c58'],
  furw: ['#5e4e4c', '#a0928e', '#cfc5bf', '#efe8e2', '#faf6f2', '#ffffff'],
  denim: ['#1a2440', '#26365e', '#344c80', '#4866a2', '#6a88c0', '#9cb4dc'],
};
const RAMP_RGB = {};
function ramp(name) {
  let r = RAMP_RGB[name];
  if (!r) {
    const src = RAMPS[name];
    if (!src) throw new Error('unknown ramp ' + name);
    r = RAMP_RGB[name] = src.map(rgb);
  }
  return r;
}

// ===========================================================================
// CHARACTER GRID (authoring surface, same API as the one in sprites.js)
// ===========================================================================
export class Grid {
  constructor(w, h, fill = '.') {
    this.w = w;
    this.h = h;
    this.c = new Array(w * h).fill(fill);
  }
  static from(rows) {
    const h = rows.length;
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const g = new Grid(w, h);
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) g.c[y * w + x] = r[x];
    });
    return g;
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.c[y * this.w + x] : '.'; }
  set(x, y, ch) {
    x = Math.round(x);
    y = Math.round(y);
    if (this.in(x, y)) this.c[y * this.w + x] = ch;
    return this;
  }
  rect(x, y, w, h, ch) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
    return this;
  }
  // filled ellipse; centre/radii in pixel units, a pixel is in if its centre is
  ellipse(cx, cy, rx, ry, ch, only) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 + 0.35 / Math.max(rx, ry)) {
          if (only && !only.includes(this.get(x, y))) continue;
          this.c[y * this.w + x] = ch;
        }
      }
    return this;
  }
  // filled polygon (pixel centres inside, even-odd)
  poly(pts, ch, only) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside && (!only || only.includes(this.get(x, y)))) this.c[y * this.w + x] = ch;
      }
    return this;
  }
  line(x0, y0, x1, y1, ch) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  // paint rows at (x, y); '.' keeps, '_' erases; map optionally renames chars
  stamp(x, y, rows, map) {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        let ch = r[i];
        if (ch === '.') continue;
        if (ch === '_') ch = '.';
        else if (map && ch in map) ch = map[ch];
        this.set(x + i, y + j, ch);
      }
    });
    return this;
  }
  replace(from, to) {
    for (let i = 0; i < this.c.length; i++) if (from.includes(this.c[i])) this.c[i] = to;
    return this;
  }
  // recolour chars matching `from` where test(x, y) holds
  where(from, to, test) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (from.includes(this.c[y * this.w + x]) && test(x, y)) this.c[y * this.w + x] = to;
    return this;
  }
  flipX() {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.c[y * this.w + x] = this.c[y * this.w + (this.w - 1 - x)];
    return g;
  }
}

// ===========================================================================
// RGBA PIXEL BUFFER
// ===========================================================================
export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  a(x, y) { return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  put(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (!this.in(x, y)) return this;
    const i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
    return this;
  }
  clear(x, y) {
    if (this.in(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0;
    return this;
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, c);
    return this;
  }
  // stamp another Pix (opaque pixels only); opts.flip mirrors it
  draw(src, ox = 0, oy = 0, flip = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + (flip ? src.w - 1 - x : x)) * 4;
        if (src.d[i + 3] > 127) this.put(x + ox, y + oy, [src.d[i], src.d[i + 1], src.d[i + 2]]);
      }
    return this;
  }
  clone() {
    const p = new Pix(this.w, this.h);
    p.d.set(this.d);
    return p;
  }
  // 1px outline around the opaque silhouette, tinted from the neighbour it hugs
  outline(f = 0.55, n8 = false) {
    const add = [];
    const nb = n8 ? N8 : N4;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.a(x, y)) continue;
        let best = null;
        for (const [dx, dy] of nb) {
          if (!this.a(x + dx, y + dy)) continue;
          const c = mix(shade(this.get(x + dx, y + dy), -3), INK, f);
          if (!best || lum(c) < lum(best)) best = c;
        }
        if (best) add.push([x, y, best]);
      }
    for (const [x, y, c] of add) this.put(x, y, c);
    return this;
  }
}
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const N8 = [...N4, [-1, -1], [1, -1], [-1, 1], [1, 1]];

// ===========================================================================
// RENDER: grid + key -> Pix (port of the renderer in src/ui/sprites.js)
// ===========================================================================
// key values:
//   'line'                     inner line darkened from the neighbours ('k' by default)
//   '#rrggbb'                  flat colour
//   'ramp[:tone][.mode][@group][!]'   a RAMPS material ('~rrggbb' = a ramp made from that colour)
//       tone  0..5 pins a tone (otherwise shaded automatically from the top-left)
//       mode  r round (default) | x across | y down | i inset | f flat bevel | s solid; upper case = glossy
//       group pixels shade together when their group matches
//       !     casts no outline
const GLOBAL_KEY = { k: 'line', K: '#2a1a14', '+': '#fffcf0', '*': '#ffffff' };
const SPEC_CACHE = new Map();
function parseSpec(s) {
  let sp = SPEC_CACHE.get(s);
  if (sp) return sp;
  let noOl = false;
  let t = s;
  if (t.endsWith('!')) { noOl = true; t = t.slice(0, -1); }
  if (t === 'line') sp = { kind: 'line', noOl };
  else if (t[0] === '#') sp = { kind: 'hex', c: rgb(t), g: 'h' + t, noOl };
  else {
    const m = /^(~[0-9a-f]{6}|[a-z]+)(?::(\d))?(?:\.([a-z]))?(?:@(\w+))?$/i.exec(t);
    if (!m) throw new Error('bad key spec ' + s);
    const tones = m[1][0] === '~' ? rampFrom('#' + m[1].slice(1)) : ramp(m[1]);
    sp = { kind: 'mat', tones, tone: m[2] != null ? +m[2] : -1, mode: m[3] || 'r', g: m[4] ? '@' + m[4] : m[1], noOl };
    sp.wild = sp.tone >= 0 && !m[4];
  }
  SPEC_CACHE.set(s, sp);
  return sp;
}

const BANDS = { m: [0, 0.62, 1.12, 1.5], g: [0.3, 0.66, 1.12, 1.5] };
function shadeTone(mode, u, d, l, r, K) {
  if (mode === 's') return 3;
  if (mode === 'f' || mode === 'F') {
    const s = (u === 0) + (l === 0) - (d === 0) - (r === 0);
    return 3 + Math.sign(s) + (mode === 'F' && u === 0 && l === 0 ? 1 : 0);
  }
  const ty = ((u + 0.5) / (u + d + 1)) * 2 - 1;
  const tx = ((l + 0.5) / (l + r + 1)) * 2 - 1;
  const lo = mode.toLowerCase();
  const gloss = mode !== lo;
  let dist;
  if (lo === 'x') dist = Math.abs(tx + 0.42) * 1.35 + Math.max(0, ty) * 0.25;
  else if (lo === 'y') dist = Math.abs(ty + 0.42) * 1.35 + Math.max(0, tx) * 0.25;
  else if (lo === 'i') dist = Math.hypot(tx - 0.42, ty - 0.5) * 0.9 + 0.25;
  else dist = Math.hypot(tx + 0.4, ty + 0.5);
  dist *= K / 3;
  const b = gloss ? BANDS.g : BANDS.m;
  if (dist < b[0]) return 5;
  if (dist < b[1]) return 4;
  if (dist < b[2]) return 3;
  if (dist < b[3]) return 2;
  return 1;
}

export function render(g, key = {}, opt = {}) {
  const W = g.w, H = g.h, N = W * H;
  const K = { ...GLOBAL_KEY, ...key };
  const spec = new Array(N).fill(null);
  const local = {};
  for (let i = 0; i < N; i++) {
    const ch = g.c[i];
    if (ch === '.' || ch === ' ') continue;
    let s = local[ch];
    if (!s) {
      const def = K[ch];
      s = def == null ? { kind: 'hex', c: [255, 0, 255], g: '?' } : parseSpec(def);
      local[ch] = s;
    }
    spec[i] = s;
  }
  const col = new Array(N).fill(null);
  const inG = (x, y, gr) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const q = spec[y * W + x];
    return !!q && (q.g === gr || !!q.wild);
  };
  const kk = opt.k || 3;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, s = spec[i];
      if (!s || s.kind === 'line') continue;
      if (s.kind === 'hex') { col[i] = s.c; continue; }
      let t = s.tone;
      if (t < 0) {
        const G = s.g;
        let u = 0, d = 0, l = 0, r = 0;
        while (inG(x, y - u - 1, G)) u++;
        while (inG(x, y + d + 1, G)) d++;
        while (inG(x - l - 1, y, G)) l++;
        while (inG(x + r + 1, y, G)) r++;
        t = shadeTone(s.mode, u, d, l, r, kk);
      }
      col[i] = s.tones[t];
    }
  const darkOf = (s, c, f) => (s.kind === 'mat' ? (f < 0.7 ? s.tones[0] : mix(s.tones[0], INK, 0.5)) : mix(c, INK, f));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, s = spec[i];
      if (!s || s.kind !== 'line') continue;
      let best = null;
      for (const nb of [N4, N8]) {
        for (const [dx, dy] of nb) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const j = Y * W + X, sj = spec[j];
          if (!sj || sj.kind === 'line' || !col[j]) continue;
          const c = darkOf(sj, col[j], opt.lineF || 0.62);
          if (!best || lum(c) < lum(best)) best = c;
        }
        if (best) break;
      }
      col[i] = best || INK;
    }
  if (opt.ol !== false) {
    const nb = opt.ol8 ? N8 : N4;
    const add = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (spec[i]) continue;
        let best = null;
        for (const [dx, dy] of nb) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const j = Y * W + X, sj = spec[j];
          if (!sj || sj.noOl || !col[j]) continue;
          const c = sj.kind === 'line' ? mix(col[j], INK, 0.45) : darkOf(sj, col[j], 0.8);
          if (!best || lum(c) < lum(best)) best = c;
        }
        if (best) add.push([i, best]);
      }
    for (const [i, c] of add) col[i] = c;
  }
  const p = new Pix(W, H);
  for (let i = 0; i < N; i++) if (col[i]) {
    p.d[i * 4] = col[i][0]; p.d[i * 4 + 1] = col[i][1]; p.d[i * 4 + 2] = col[i][2]; p.d[i * 4 + 3] = 255;
  }
  return p;
}

// T('gold') -> { 0: 'gold:0', ..., 5: 'gold:5' }; chars remap tones (' '/'.' skip)
export function T(r, chars = '012345', g = '') {
  const o = {};
  for (let i = 0; i < 6; i++) if (chars[i] && chars[i] !== ' ' && chars[i] !== '.') o[chars[i]] = r + ':' + i + (g ? '@' + g : '');
  return o;
}

// small deterministic randomness
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const hash2 = (x, y, s = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Pix -> cached canvas at an integer scale
export function pixCanvas(p, scale = 1) {
  scale = Math.max(1, Math.floor(scale) || 1);
  const cv = document.createElement('canvas');
  cv.width = p.w * scale;
  cv.height = p.h * scale;
  const ctx = cv.getContext('2d');
  const base = document.createElement('canvas');
  base.width = p.w;
  base.height = p.h;
  base.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.d), p.w, p.h), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, cv.width, cv.height);
  return cv;
}

// ===========================================================================
// TINY PIXEL FONT (3x5 caps, a few wide letters, digits, signs)
// ===========================================================================
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '.##.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  "'": ['#', '#', '.', '.', '.'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  ':': ['.', '#', '.', '#', '.'],
  '-': ['..', '..', '##', '..', '..'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '$': ['.##', '##.', '.#.', '.##', '##.'],
  '&': ['.#..', '#.#.', '.#.#', '#.#.', '.#.#'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
  '★': ['..#..', '.###.', '#####', '.###.', '.#.#.'],
  ' ': ['..', '..', '..', '..', '..'],
};
const GLYPH_H = 5;
const glyph = (c) => GLYPHS[c] || GLYPHS[String(c).toUpperCase()] || GLYPHS['?'];
export function textWidth(str) {
  let w = 0;
  for (const c of String(str)) w += glyph(c)[0].length + 1;
  return Math.max(0, w - 1);
}
// calls put(x, y) for every lit pixel of the string drawn at (x, y)
export function eachTextPixel(str, x, y, put) {
  let cx = x;
  for (const c of String(str)) {
    const g = glyph(c);
    for (let j = 0; j < GLYPH_H; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') put(cx + i, y + j);
    cx += g[0].length + 1;
  }
}

// ===========================================================================
// MASCOTS (Grid art, rendered with the shared ramps)
// ===========================================================================
const MASCOT_ART = {
  // Reynard: winking, monocle on a chain, top hat at a jaunty angle, bow tie
  fox: () => {
    const g = new Grid(26, 27);
    const key = {
      H: 'black.x@hat', h: 'black.y@brim', r: 'red.y@band', E: 'fox.r@earL', F: 'fox.r@earR', e: 'cream:3', t: 'dkbear:2',
      O: 'fox.r@head', o: 'fox:1', W: 'furw.r@muz', N: 'black.R@nose', K: '#2a1a14', w: '#ffffff', y: 'gold:4',
      m: 'gold:4', M: 'gold:2', g: 'gold:3', R: 'red.R@bow', q: 'red:1', T: '#ffffff', G: 'glass:5',
    };
    g.poly([[0.8, 2.8], [10.6, 9.2], [3.4, 13.8]], 'E');
    g.poly([[25.2, 2.8], [15.4, 9.2], [22.6, 13.8]], 'F');
    g.poly([[2.8, 5.6], [8.6, 9.6], [4.4, 12.4]], 'e');
    g.poly([[23.2, 5.6], [17.4, 9.6], [21.6, 12.4]], 'e');
    g.stamp(1, 3, ['tt', 'ttt']).stamp(23, 3, ['.tt', 'ttt']);
    g.ellipse(13, 15, 9.6, 6.6, 'O');
    // cheek tufts + the white lower face
    g.poly([[5.4, 14.6], [0.8, 18.4], [3.2, 18.2], [2.2, 20.6], [5.8, 19.8], [7, 21.4], [9.4, 18.6]], 'W');
    g.poly([[20.6, 14.6], [25.2, 18.4], [22.8, 18.2], [23.8, 20.6], [20.2, 19.8], [19, 21.4], [16.6, 18.6]], 'W');
    g.poly([[5.6, 16.8], [9.4, 15.8], [13, 17.2], [16.6, 15.8], [20.4, 16.8], [17.8, 20.6], [13, 22.8], [8.2, 20.6]], 'W');
    // brows: one down for the wink, one cocked up over the monocle
    g.stamp(5, 11, ['ooo']).stamp(16, 9, ['oooo']);
    // the wink, and the sly half-lidded eye behind the monocle
    g.stamp(6, 13, ['.KKK', 'K...K']);
    g.stamp(16, 12, ['KKKK', 'KwyK', '.KK.']);
    for (let y = 8; y < 20; y++)
      for (let x = 12; x < 24; x++) {
        const r = Math.hypot(x + 0.5 - 18, y + 0.5 - 13.5);
        if (r > 2.7 && r <= 3.55) g.set(x, y, x + y < 31 ? 'm' : 'M');
      }
    g.set(16, 11, 'G');
    for (const [x, y] of [[20, 17], [21, 18], [21, 19], [22, 20], [22, 21]]) g.set(x, y, 'g');
    g.stamp(11, 16, ['NNNN', '.NN.']);
    // sly grin with a fang
    g.stamp(9, 18, ['K......K', '.KKKKKK.']).set(11, 20, 'T');
    // top hat, tipped to the right
    g.poly([[10, 0.2], [18.4, 0.2], [17.8, 6.8], [9.4, 6.8]], 'H');
    g.rect(9, 5, 9, 2, 'r');
    g.ellipse(13.6, 7.5, 7.6, 1.25, 'h');
    // bow tie
    g.stamp(8, 23, ['RRR....RRR', 'RRRRqqRRRR', 'RRR....RRR']);
    return { g, key };
  },

  // Flakey Jake: a jolly rainbow trout in a chef's toque
  trout: () => {
    const g = new Grid(30, 24);
    const key = {
      T: 'olive.r@tail', B: 'olive.r@body', P: 'rose.r@body', S: 'white.r@body', D: '~8aa858.r@fin', d: 'olive:0', u: 'olive:1',
      C: 'white.R@hat', c: 'white.y@band', w: '#ffffff', K: '#2a1a14', p: 'red:2', b: 'pink:4', G: '~f08aa8.r@gill',
    };
    g.poly([[0.6, 8.8], [6.8, 12.4], [6.8, 15.4], [0.6, 19.4], [2.6, 14]], 'T');
    g.ellipse(13.6, 14, 10.6, 5.2, 'B');
    g.ellipse(21.2, 13.8, 6.2, 5.4, 'B');
    g.poly([[9.2, 9.6], [12.4, 5.6], [15.6, 9.2]], 'D');
    g.poly([[5.6, 9.8], [6.6, 8.2], [7.8, 9.8]], 'D');
    g.where('B', 'S', (x, y) => y >= 16);
    g.where('B', 'P', (x, y) => y >= 13 && y <= 15);
    g.ellipse(20.4, 14.6, 2.6, 2.4, 'G', 'BPS');
    g.line(18, 11, 17, 17, 'k');
    for (const [x, y] of [[8, 11], [11, 10], [14, 11], [5, 12], [16, 10], [3, 11], [2, 17], [12, 7]]) if ('BTD'.includes(g.get(x, y))) g.set(x, y, 'd');
    // waving fin
    g.poly([[13.6, 16.8], [10.6, 21.8], [16.4, 18.6]], 'D');
    // eye + rosy cheek + big grin
    g.stamp(21, 10, ['.KK.', 'KwwK', 'KwKK', '.KK.']);
    g.set(22, 11, 'w');
    g.stamp(21, 15, ['K....', '.KppK', '..KK.']);
    g.set(26, 14, 'K').set(26, 15, 'K');
    g.set(19, 15, 'b').set(20, 15, 'b');
    // chef hat, tipped back
    g.ellipse(18.8, 4, 2.5, 2.5, 'C');
    g.ellipse(21.8, 3, 2.8, 2.6, 'C');
    g.ellipse(24.6, 4.2, 2.4, 2.3, 'C');
    g.poly([[17.6, 5.6], [26, 5.6], [25.6, 8.8], [18, 8.8]], 'c');
    g.stamp(20, 6, ['k..k']);
    return { g, key };
  },

  // Dr. Wiggles: a worm in a lab coat and very cool sunglasses
  worm: () => {
    const g = new Grid(26, 28);
    const key = {
      H: 'pink.r@head', h: 'pink.r@tail', n: 'pink:2', N: 'pink:4', G: 'black.R@shades', w: '#ffffff', K: '#2a1a14', L: 'white.x@coat', l: 'white:2',
      b: 'blue:3', r: 'red:3', o: 'steel:3', J: 'glass.x@tube', j: 'rose.r@juice', R: 'red.R@heart', m: 'pink:5', s: 'steel.r@steth',
    };
    g.ellipse(12.8, 6.6, 5.4, 5.6, 'H');
    g.rect(8, 9, 10, 6, 'H');
    // rings on the neck
    g.line(8, 13, 17, 13, 'n').line(9, 12, 16, 12, 'N');
    // lab coat
    g.poly([[5.6, 14.6], [20, 14.6], [22, 26.6], [3.6, 26.6]], 'L');
    g.poly([[9.6, 14.4], [16, 14.4], [12.8, 19.6]], 'H');
    g.line(9, 14, 12, 20, 'k').line(16, 14, 13, 20, 'k');
    g.line(13, 21, 13, 26, 'l').set(12, 22, 'o').set(12, 25, 'o');
    g.rect(16, 20, 3, 3, 'l');
    g.set(16, 19, 'b').set(16, 18, 'b').set(18, 19, 'r').set(18, 18, 'r');
    // the tail curls out from under the coat
    g.ellipse(21, 26.4, 3, 1.6, 'h').ellipse(24, 25, 1.7, 1.6, 'h');
    g.set(20, 26, 'n').set(22, 26, 'n').set(24, 24, 'N');
    // shades with a glint, confident smile
    g.stamp(7, 5, ['KKKKKKKKKKKK', 'KGGGGKKGGGGK', '.GGGG..GGGG.', '..GG....GG..']);
    g.set(8, 6, 'w').set(14, 6, 'w').set(9, 6, 'w');
    g.stamp(10, 10, ['K....K', '.KKKK.']);
    g.set(9, 2, 'N').set(10, 1, 'N').set(11, 1, 'N');
    // test tube of love potion, a heart bubbling up
    g.rect(0, 15, 3, 8, 'J');
    g.rect(0, 18, 3, 5, 'j');
    g.stamp(0, 14, ['KKK']);
    g.rect(3, 19, 3, 3, 'L');
    g.stamp(0, 8, ['.R.R.', 'RRRRR', '.RRR.', '..R..']).set(1, 8, 'm');
    g.set(2, 13, 'm');
    return { g, key };
  },

  // Captain Krill: a pink krill pirate with an eyepatch and a tricorne
  krill: () => {
    const g = new Grid(30, 26);
    const key = {
      C: 'pink.r@head', P: 'rose.r@body', Q: 'rose.r@tail', a: 'rose:1', l: 'rose:2', H: 'black.r@hat', y: 'gold:4', Y: 'gold:3',
      G: 'black.R@patch', w: '#ffffff', K: '#2a1a14', s: 'bone:4', t: 'red:2',
    };
    // antennae sweep back over the hat
    g.line(22, 9, 26, 3, 'a').line(26, 3, 28, 1, 'a').line(23, 10, 29, 6, 'a');
    // curled body, tail fan
    const segs = [[15.6, 15.2, 3.6, 3.8], [12, 17, 3.2, 3.4], [9.2, 18.8, 2.8, 3], [6.8, 20.6, 2.4, 2.6]];
    for (const [x, y, rx, ry] of segs) g.ellipse(x, y, rx, ry, 'P');
    g.poly([[5.6, 20.6], [0.6, 18.6], [1.6, 21.6], [0.8, 24.6], [5, 23.6]], 'Q');
    g.line(13.8, 12.6, 14.6, 17.6, 'k').line(10.6, 14.8, 11, 19.6, 'k').line(8, 16.8, 8.2, 21.4, 'k');
    for (const [x, y] of [[13, 21], [14, 22], [10, 22], [11, 23], [16, 19], [17, 20], [7, 23]]) g.set(x, y, 'l');
    // head
    g.ellipse(20.6, 13.4, 6.4, 5.4, 'C');
    g.stamp(17, 11, ['.ww.', 'wwKw', 'wwKK', '.ww.']);
    g.stamp(21, 11, ['GGGG', 'GGGG', '.GG.']);
    g.line(21, 10, 18, 8, 'K').line(25, 11, 27, 12, 'K');
    g.stamp(18, 16, ['K...K', '.KKK.']).set(19, 17, 'w');
    // tricorne with gold trim and a tiny skull
    g.poly([[13.4, 9.4], [27.4, 9.4], [25, 5.2], [20.4, 2.4], [15.8, 5.2]], 'H');
    g.line(14, 9, 27, 9, 'y').line(15, 8, 16, 6, 'Y').line(26, 8, 25, 6, 'Y');
    g.stamp(19, 4, ['.ss.', 'sKsK', '.ss.']).set(19, 5, 's');
    return { g, key };
  },

  // Mountie Moose: red serge, campaign Stetson, antlers out the sides
  moose: () => {
    const g = new Grid(32, 30);
    const key = {
      A: 'bone.r@antL', B: 'bone.r@antR', F: 'beaver.r@head', M: 'cinnamon.r@muz', E: 'beaver.r@ear', n: 'dkbear:1',
      T: 'tan.r@hat', t: 'tan:1', h: 'tan.y@brim', b: 'leather.y@band', S: 'red.x@serge', s: 'red:1', c: 'navy.r@collar',
      y: 'gold:4', K: '#2a1a14', w: '#ffffff', p: 'pink:3',
    };
    // antlers (palmate, three points each)
    g.poly([[11, 12.4], [3.4, 10.6], [0.6, 6.4], [1.8, 3], [3.2, 6.2], [4.4, 2.4], [5.8, 6.4], [7.4, 3.2], [8.6, 7.2], [11.6, 9]], 'A');
    g.poly([[21, 12.4], [28.6, 10.6], [31.4, 6.4], [30.2, 3], [28.8, 6.2], [27.6, 2.4], [26.2, 6.4], [24.6, 3.2], [23.4, 7.2], [20.4, 9]], 'B');
    g.ellipse(8.4, 13.6, 3, 1.5, 'E').ellipse(23.6, 13.6, 3, 1.5, 'E');
    // serge shoulders + collar
    g.poly([[2.6, 29.6], [6.6, 23.4], [25.4, 23.4], [29.4, 29.6]], 'S');
    g.poly([[11, 22.6], [21, 22.6], [19.6, 26.4], [16, 24.8], [12.4, 26.4]], 'c');
    g.set(16, 26, 'y').set(16, 28, 'y').set(9, 25, 'y').set(23, 25, 'y');
    g.line(6, 28, 9, 25, 's').line(26, 28, 23, 25, 's');
    // long face + droopy muzzle
    g.ellipse(16, 14.6, 6.4, 5.4, 'F');
    g.ellipse(16, 19.6, 5.6, 4.4, 'M');
    g.set(13, 20, 'n').set(14, 21, 'n').set(19, 20, 'n').set(18, 21, 'n');
    g.stamp(12, 13, ['Kw', 'KK']).stamp(19, 13, ['wK', 'KK']);
    g.set(11, 15, 'p').set(21, 15, 'p');
    g.stamp(14, 22, ['K...K', '.KKK.']);
    // Stetson with the "Montana pinch"
    g.poly([[11.4, 8], [13.4, 2.4], [16, 0.6], [18.6, 2.4], [20.6, 8]], 'T');
    g.line(16, 1, 16, 5, 't').set(14, 4, 't').set(18, 4, 't');
    g.rect(11, 7, 10, 2, 'b');
    g.ellipse(16, 9.6, 11.4, 1.7, 'h');
    return { g, key };
  },

  // Queen Sturgeon: long snout, bony scutes, a crown and a string of pearls
  sturgeon: () => {
    const g = new Grid(32, 22);
    const key = {
      B: 'slate.r@body', S: 'bone.r@body', T: 'slate.r@tail', D: 'slate.r@fin', u: 'bone:5', U: 'bone:3', q: 'bone:2',
      Y: 'gold.R@crown', y: 'gold:5', j: 'red.R@gem', z: 'sky.R@gem2', p: 'white.R@pearl', K: '#2a1a14', w: '#ffffff', b: 'pink:4',
    };
    g.poly([[26.6, 12], [31.4, 5.6], [30, 12.4], [31.2, 18.2], [26.6, 14.8]], 'T');
    g.ellipse(16.6, 13.4, 11.6, 4.6, 'B');
    g.poly([[0.6, 11.4], [8, 9.4], [9, 15.6], [2.4, 13.6]], 'B');
    g.where('B', 'S', (x, y) => y >= 15);
    g.poly([[20.6, 9.4], [23.6, 5.4], [25.2, 9.2]], 'D');
    g.poly([[10.4, 16.6], [8.6, 20.6], [13.8, 17.4]], 'D');
    // scutes along the back and flank
    for (let x = 10; x <= 25; x += 3) g.set(x, 9, 'u').set(x, 13, 'U');
    // barbels
    g.set(3, 14, 'q').set(3, 15, 'q').set(5, 15, 'q').set(5, 16, 'q');
    // eye with lashes, a regal smile, blush
    g.stamp(6, 10, ['KK', 'wK']).set(5, 9, 'K').set(7, 9, 'K');
    g.stamp(1, 13, ['KK.']).set(8, 13, 'b');
    // pearls
    for (const [x, y] of [[12, 9], [12, 11], [13, 13], [12, 15], [12, 17]]) g.set(x, y, 'p');
    // crown
    g.stamp(5, 1, ['Y.Y.Y.Y', 'YYYYYYY', 'YjYzYjY', 'YYYYYYY'].map((r) => r.replace(/\./g, '.')));
    g.set(5, 0, 'y').set(8, 0, 'y').set(11, 0, 'y');
    g.rect(5, 5, 7, 2, 'Y');
    return { g, key };
  },

  // Bug Bites: a ladybug chef holding a fork
  ladybug: () => {
    const g = new Grid(26, 26);
    const key = {
      R: 'red.R@shell', S: 'black.r@spot', H: 'black.r@head', C: 'white.R@hat', c: 'white.y@band', w: '#ffffff', K: '#2a1a14',
      f: 'steel.x@fork', F: 'steel:4', b: 'pink:3', p: 'pink:4', a: 'black:3',
    };
    g.line(9, 6, 6, 2, 'K').line(16, 6, 19, 2, 'K');
    g.ellipse(5.6, 1.8, 1.4, 1.4, 'a').ellipse(19.4, 1.8, 1.4, 1.4, 'a');
    g.ellipse(12.4, 18.4, 9, 6.8, 'R');
    g.line(12, 13, 12, 25, 'k');
    for (const [x, y] of [[6, 16], [16, 16], [8, 21], [17, 21], [4, 20], [13, 23]]) g.stamp(x, y, ['SS', 'SS']);
    g.ellipse(12.4, 10.6, 5.8, 4.4, 'H');
    g.stamp(9, 9, ['ww.', 'wK.']).stamp(14, 9, ['ww', 'Kw']);
    g.set(8, 12, 'b').set(17, 12, 'b');
    g.stamp(11, 12, ['p..p', '.pp.']);
    // chef hat
    g.ellipse(9.6, 4, 2.6, 2.4, 'C').ellipse(12.6, 3.2, 3, 2.6, 'C').ellipse(15.6, 4, 2.6, 2.4, 'C');
    g.rect(8, 5, 9, 3, 'c');
    // fork
    g.line(20, 16, 22, 13, 'K');
    g.rect(22, 6, 1, 9, 'f');
    g.stamp(20, 1, ['F.F.F', 'f.f.f', 'f.f.f', 'fffff', '.fff.']);
    return { g, key };
  },
};

export const MASCOTS = { pellets: 'fox', flakes: 'trout', worms: 'worm', krill: 'krill', maple: 'moose', caviar: 'sturgeon', bugbites: 'ladybug' };
const MASCOT_PIX = new Map();
export function mascotPix(name) {
  name = MASCOTS[name] || name;
  let p = MASCOT_PIX.get(name);
  if (!p) {
    const art = MASCOT_ART[name] || MASCOT_ART.fox;
    const { g, key } = art();
    p = render(g, key);
    MASCOT_PIX.set(name, p);
  }
  return p;
}

const MASCOT_CV = new Map();
export function mascotCanvas(id, scale = 4) {
  const name = MASCOTS[id] || id;
  const k = name + '@' + scale;
  let cv = MASCOT_CV.get(k);
  if (!cv) { cv = pixCanvas(mascotPix(name), scale); MASCOT_CV.set(k, cv); }
  return cv;
}

// ===========================================================================
// BAGS
// ===========================================================================
// Each bag is designed flat in a DW x DH design space (the front of a full
// bag, top seal included). bagCanvas() then lays the rows out for the fill /
// tear / lean asked for, paints the food behind windows and in the torn top,
// shades it like a soft pillow lit from the top-left, adds creases and a
// tinted outline.
const DW = 40, DH = 56;
export const BAG_W = 48, BAG_H = 60;
const BOTTOM = BAG_H - 3; // canvas row of the bag's bottom edge
const OX = (BAG_W - DW) / 2;
// material per pixel: decides how it shades
const M_BAG = 1, M_PRINT = 2, M_SEAL = 3, M_WIN = 4, M_GOLD = 5, M_LABEL = 6, M_INNER = 7, M_FOOD = 8;

const WHITE = [255, 255, 255];
const KRAFT = rgb('#c99a62');

class Design {
  constructor(id, look) {
    this.id = id;
    this.p = new Pix(DW, DH);
    this.m = new Uint8Array(DW * DH);
    this.c = look;
    this.ext = [];
    this.seal = 4; // last seal row
    this.head = [5, 8]; // plain rows that fold away as the bag empties
    this.finish = 'paper';
    this.lean = 1;
    this.win = null;
    this.inner = rgb('#e8dcc4'); // inside of the bag (seen through a torn top)
  }
  row(y, xl, xr, c = this.c.main) {
    this.ext[y] = [xl, xr];
    for (let x = xl; x <= xr; x++) { this.p.put(x, y, c); this.m[y * DW + x] = M_BAG; }
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < DW && y < DH && this.p.a(x, y) > 0; }
  px(x, y, c, m = M_PRINT) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return this;
    this.p.put(x, y, c);
    this.m[y * DW + x] = m;
    return this;
  }
  rect(x, y, w, h, c, m) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c, m);
    return this;
  }
  hline(y, c, m, x0 = 0, x1 = DW - 1) { for (let x = x0; x <= x1; x++) this.px(x, y, c, m); return this; }
  ellipse(cx, cy, rx, ry, c, m, test) {
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
        if (d <= 1 + 0.3 / Math.max(rx, ry) && (!test || test(x, y, d))) this.px(x, y, c, m);
      }
    return this;
  }
  poly(pts, c, m) {
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.px(x, y, c, m);
      }
    return this;
  }
  text(str, x, y, c, m) { eachTextPixel(str, x, y, (X, Y) => this.px(X, Y, c, m)); return this; }
  textC(str, cx, y, c, m) { return this.text(str, Math.round(cx - textWidth(str) / 2), y, c, m); }
  // brand lettering: glossy letters, an outline and a drop shadow
  logo(str, cx, y, o) {
    const x0 = Math.round(cx - textWidth(str) / 2);
    const on = new Set();
    eachTextPixel(str, x0, y, (X, Y) => on.add(X + Y * 64));
    const ring = new Set();
    for (const k of on) {
      const X = k % 64, Y = (k / 64) | 0;
      for (const [dx, dy] of N8) { const q = X + dx + (Y + dy) * 64; if (!on.has(q)) ring.add(q); }
    }
    if (o.shadow) for (const k of ring) { const q = k + 64; if (!on.has(q) && !ring.has(q)) this.px(q % 64, (q / 64) | 0, o.shadow); }
    for (const k of ring) this.px(k % 64, (k / 64) | 0, o.line);
    for (const k of on) {
      const X = k % 64, Y = (k / 64) | 0;
      this.px(X, Y, Y - y < 2 && o.hi ? o.hi : o.fill);
    }
    return this;
  }
  // printed ribbon with folded tails (or a full-bleed sash when it does not fit)
  ribbon(str, cy, o) {
    const tw = textWidth(str);
    const bleed = o.bleed || tw + 18 > DW;
    const bw = bleed ? DW : Math.max(tw + 8, 18);
    const x0 = Math.round(DW / 2 - bw / 2), x1 = x0 + bw - 1;
    const sag = (x) => Math.round(Math.pow((x + 0.5 - DW / 2) / (DW / 2), 2) * (o.arc ?? 2));
    const back = shade(o.fill, -2), lo = shade(o.fill, -1), hi = shade(o.fill, 1);
    if (!bleed)
      for (let i = 1; i <= 4; i++)
        for (const side of [-1, 1]) {
          const x = side < 0 ? x0 - i : x1 + i;
          for (let y = cy - 1; y <= cy + 4; y++) {
            if (i === 4 && y === cy + 1) continue; // the V notch
            if (i >= 3 && (y === cy + 1 || (i === 4 && (y === cy || y === cy + 2)))) continue;
            this.px(x, y + sag(x), i === 1 && y < cy + 1 ? shade(back, -1) : back);
          }
        }
    for (let x = x0; x <= x1; x++) {
      const s = sag(x);
      for (let y = cy - 3; y <= cy + 3; y++) this.px(x, y + s, y === cy - 3 ? hi : y === cy + 3 ? lo : o.fill);
      if (o.edge) { this.px(x, cy - 4 + s, o.edge); this.px(x, cy + 4 + s, o.edge); }
    }
    const tx = Math.round(DW / 2 - tw / 2);
    eachTextPixel(str, tx, cy - 2, (X, Y) => this.px(X, Y + sag(X), o.ink));
    return this;
  }
  // a zig-zag starburst sticker with a word on it
  burst(cx, cy, rx, ry, str, o) {
    const n = o.spikes || 14;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + (o.rot || 0), k = i % 2 ? 0.8 : 1;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    const inPoly = (px, py) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const on = (x, y) => inPoly(x + 0.5, y + 0.5);
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        if (!on(x, y)) continue;
        const rim = N4.some(([dx, dy]) => !on(x + dx, y + dy));
        this.px(x, y, rim ? o.line : y < cy - ry * 0.45 ? shade(o.fill, 1) : o.fill);
      }
    if (str) this.textC(str, cx, Math.round(cy - 2), o.ink);
    return this;
  }
  // printed sunburst rays behind a mascot
  rays(cx, cy, n, c, test) {
    for (let y = 0; y < DH; y++)
      for (let x = 0; x < DW; x++) {
        const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * n * 2) % 2 === 0 && (!test || test(x, y)) && this.m[y * DW + x] === M_BAG) this.px(x, y, c, M_BAG);
      }
    return this;
  }
  roundel(cx, cy, rx, ry, o) {
    this.ellipse(cx, cy, rx, ry, o.line);
    this.ellipse(cx, cy, rx - 1, ry - 1, o.ring);
    this.ellipse(cx, cy, rx - 2, ry - 2, o.fill);
    return this;
  }
  sprite(p, x, y, flip = false, m = M_PRINT) {
    for (let j = 0; j < p.h; j++)
      for (let i = 0; i < p.w; i++) {
        const k = (j * p.w + (flip ? p.w - 1 - i : i)) * 4;
        if (p.d[k + 3] > 127) this.px(x + i, y + j, [p.d[k], p.d[k + 1], p.d[k + 2]], m);
      }
    return this;
  }
  // a tiny "nutrition facts" panel: lines of grey type under a bold header
  facts(x, y, w, h, ink = INK) {
    const paper = rgb('#fbf6e8');
    this.rect(x, y, w, h, ink, M_LABEL);
    this.rect(x + 1, y + 1, w - 2, h - 2, paper, M_LABEL);
    this.hline(y + 1, ink, M_LABEL, x + 1, x + w - 2);
    const grey = rgb('#9a8c80');
    for (let j = y + 3; j < y + h - 1; j += 2)
      for (let i = x + 1; i < x + w - 1; i++) if ((i - x) % 4 !== 3 || j === y + 3) this.px(i, j, j === y + 3 ? shade(grey, -1) : grey, M_LABEL);
    return this;
  }
  barcode(x, y, h = 4) {
    const bars = '1011010011101011';
    this.rect(x, y, bars.length + 2, h + 2, WHITE, M_LABEL);
    for (let i = 0; i < bars.length; i++) if (bars[i] === '1') for (let j = 0; j < h; j++) this.px(x + 1 + i, y + 1 + j, INK, M_LABEL);
    return this;
  }
  // a see-through window: content is painted at render time from the fill level
  window(test, frame) {
    const cells = [];
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) if (this.inside(x, y) && test(x, y)) cells.push([x, y]);
    if (!cells.length) return this;
    const set = new Set(cells.map(([x, y]) => x + y * 64));
    let y0 = DH, y1 = 0;
    for (const [x, y] of cells) {
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const edge = N4.some(([dx, dy]) => !set.has(x + dx + (y + dy) * 64));
      this.px(x, y, edge ? frame : [0, 0, 0], edge ? M_PRINT : M_WIN);
    }
    this.win = { y0: y0 + 1, y1: y1 - 1 };
    return this;
  }
  // heat-sealed crimp: serrated top edge, vertical ridges, a seam under it
  crimp(y0, y1, c, m = M_SEAL) {
    for (let y = y0; y <= y1; y++) {
      const e = this.ext[y];
      for (let x = e[0]; x <= e[1]; x++) {
        if (y === y0 && x % 2) { this.p.clear(x, y); this.m[y * DW + x] = 0; continue; }
        const v = y === y1 ? shade(c, -1) : x % 2 ? shade(c, -1) : y === y0 ? shade(c, 1) : c;
        this.px(x, y, v, m);
      }
    }
    this.seal = y1;
    return this;
  }
  hangHole(cy) {
    for (let x = 17; x <= 22; x++) { this.p.clear(x, cy); this.m[cy * DW + x] = 0; }
    this.p.clear(17, cy); this.p.clear(22, cy);
    return this;
  }
}

// ---------------------------------------------------------------- shapes
function sackShape(D, sealRows = 5) {
  for (let y = 0; y < DH; y++) {
    let xl = 1, xr = DW - 2;
    if (y < sealRows) { xl = 2; xr = DW - 3; }
    if (y === DH - 2) { xl = 2; xr = DW - 3; } else if (y === DH - 1) { xl = 4; xr = DW - 5; }
    D.row(y, xl, xr);
  }
}
function pouchShape(D) {
  for (let y = 0; y < DH; y++) {
    let xl = 1, xr = DW - 2;
    if (y < 4) { xl = 2; xr = DW - 3; }
    if (y >= 49 && y <= 53) { xl = 0; xr = DW - 1; }
    if (y === DH - 2) { xl = 1; xr = DW - 2; } else if (y === DH - 1) { xl = 3; xr = DW - 4; }
    D.row(y, xl, xr);
  }
}
function kraftShape(D) {
  for (let y = 0; y < DH; y++) {
    let xl = 2, xr = DW - 3;
    if (y <= 6) { xl = 1; xr = DW - 2; }
    if (y === DH - 1) { xl = 3; xr = DW - 4; }
    D.row(y, xl, xr, y <= 6 ? shade(KRAFT, -1) : KRAFT);
  }
}

// ---------------------------------------------------------------- the designs
// Rule of thumb: rows D.head[0]..D.head[1] stay plain bag colour (they fold
// away as the bag empties), everything printed sits below them.
const WAVE = (x) => Math.round(Math.sin(x * 0.75) * 1.2);
const BAG_DESIGNS = {
  // Reynard's Classic Pellets: a cheerful orange paper sack, the fox on a sunburst
  pellets(D, C) {
    sackShape(D);
    D.crimp(0, 4, shade(C.main, -1));
    D.fold = true;
    D.rect(0, 9, DW, 8, C.dark);
    D.hline(9, shade(C.dark, 1), M_PRINT);
    D.logo("REYNARD'S", 20, 11, { fill: C.accent, hi: WHITE, line: C.dark });
    D.rays(20, 31, 9, shade(C.main, 1), (x, y) => y > 16 && y < 48);
    D.sprite(mascotPix('fox'), 7, 16);
    D.ribbon('MINE!', 44, { fill: C.trim, ink: C.dark });
    D.rect(0, 49, DW, 7, C.dark);
    D.text('PELLETS', 4, 50, C.accent);
    D.facts(31, 49, 7, 7);
  },
  // Flakey Jake's Rainbow Flakes: teal foil pouch, a rainbow, flakes in a window
  flakes(D, C) {
    pouchShape(D);
    D.finish = 'foil';
    D.head = [4, 6];
    D.crimp(0, 3, shade(C.main, 1));
    D.hangHole(1);
    D.fold = true;
    const bow = [0xff6a8a, 0xffb43a, 0xffe14a, 0x6ad04a, 0x4ab0ff].map(rgb);
    for (let i = 0; i < bow.length; i++) D.ellipse(20, 44, 21 - i * 2, 19 - i * 2, bow[i], M_PRINT, (x, y) => y < 44);
    D.ellipse(20, 44, 11, 9, C.main, M_BAG, (x, y) => y < 44);
    D.logo('FLAKEY', 20, 8, { fill: C.trim, hi: C.accent, line: C.dark, shadow: shade(C.dark, -1) });
    D.logo("JAKE'S", 20, 15, { fill: C.accent, hi: WHITE, line: C.dark, shadow: shade(C.dark, -1) });
    D.sprite(mascotPix('trout'), 5, 21);
    D.ribbon('YUM!', 45, { fill: C.trim, ink: C.dark });
    D.window((x, y) => y >= 49 && y <= 54 && x >= 6 && x <= 33 && !((x === 6 || x === 33) && (y === 49 || y === 54)), C.dark);
  },
  // Dr. Wiggles' Wiggle Worms: a red lab-supply bag, folded and stapled
  worms(D, C) {
    sackShape(D, 7);
    D.seal = 6;
    D.head = [7, 9];
    const flap = shade(C.main, -1);
    for (let y = 0; y <= 6; y++) D.hline(y, y === 0 ? shade(C.main, 1) : y === 6 ? shade(C.main, -2) : flap, M_SEAL);
    D.hline(1, shade(flap, 1), M_SEAL, 3, 36);
    for (const x of [8, 29]) { D.rect(x, 3, 3, 1, rgb('#d8dce8'), M_GOLD); D.px(x, 4, rgb('#8c92aa'), M_GOLD); D.px(x + 2, 4, rgb('#8c92aa'), M_GOLD); }
    // the lab label; the doctor pops out over its bottom edge
    D.rect(3, 10, 34, 17, C.accent, M_LABEL);
    D.hline(10, shade(C.accent, 1), M_LABEL, 3, 36);
    D.hline(26, shade(C.accent, -2), M_LABEL, 3, 36);
    D.textC('DR.', 20, 12, C.main, M_LABEL);
    D.logo('WIGGLES', 20, 19, { fill: C.main, hi: shade(C.main, 1), line: shade(C.main, -2), shadow: shade(C.accent, -2) });
    for (const [x, y] of [[5, 12], [32, 12]]) { D.rect(x, y + 1, 3, 1, C.main, M_LABEL); D.rect(x + 1, y, 1, 3, C.main, M_LABEL); }
    for (const [x, y] of [[2, 33], [33, 30], [31, 38]]) D.text('♥', x, y, C.trim);
    D.sprite(mascotPix('worm'), 7, 23);
    D.ribbon('LOVE!', 49, { fill: C.trim, ink: C.dark });
  },
  // Captain Krill's Krill Thrill: a navy foil pouch, waves and a porthole
  krill(D, C) {
    pouchShape(D);
    D.finish = 'foil';
    D.head = [4, 6];
    D.crimp(0, 3, shade(C.main, 1));
    D.hangHole(1);
    D.fold = true;
    D.textC('CAPTAIN', 20, 7, C.trim);
    D.logo('KRILL', 20, 13, { fill: C.accent, hi: WHITE, line: shade(C.dark, -1), shadow: shade(C.trim, -2) });
    const sea = rgb('#3a6ab0'), foam = rgb('#cfe8ff');
    for (let x = 0; x < DW; x++) {
      const w = 41 + WAVE(x);
      for (let y = w; y < DH; y++) D.px(x, y, y === w ? foam : y < w + 3 ? sea : shade(sea, -1));
    }
    D.sprite(mascotPix('krill'), 1, 17);
    D.burst(27.5, 22, 8.4, 6.4, 'NEW', { fill: rgb('#ffd23a'), line: rgb('#b0302a'), ink: rgb('#b0302a'), spikes: 11 });
    D.ribbon('MATEY!', 44, { fill: C.trim, ink: C.dark, arc: 1 });
    D.window((x, y) => Math.hypot(x + 0.5 - 20, y + 0.5 - 51) <= 4.4, rgb('#c8a050'));
  },
  // Mountie Moose Maple Munchies: a flour sack in the flag's red and white
  maple(D, C) {
    sackShape(D, 5);
    D.head = [5, 7];
    for (let y = 0; y <= 4; y++) D.hline(y, y === 4 ? shade(C.main, -2) : shade(C.main, -1), M_SEAL);
    for (let x = 3; x < 37; x += 3) { D.px(x, 2, C.accent, M_SEAL); D.px(x + 1, 2, C.accent, M_SEAL); }
    D.rect(10, 8, 20, 41, C.accent);
    D.logo('MOUNTIE', 20, 10, { fill: C.trim, hi: shade(C.trim, 2), line: C.dark });
    D.logo('MOOSE', 20, 17, { fill: C.main, hi: shade(C.main, 1), line: C.dark });
    const leaf = (cx, cy) => D.poly([[cx, cy - 3], [cx + 1, cy - 1], [cx + 3, cy - 2], [cx + 2, cy + 1], [cx + 1, cy + 1], [cx, cy + 3], [cx - 1, cy + 1], [cx - 2, cy + 1], [cx - 3, cy - 2], [cx - 1, cy - 1]], C.accent);
    leaf(5, 40); leaf(34, 40);
    D.sprite(mascotPix('moose'), 4, 21);
    D.ribbon('EH?', 47, { fill: C.trim, ink: C.dark });
    D.rect(0, 51, DW, 5, C.dark);
    D.textC('MUNCHIES', 20, 51, C.accent);
  },
  // Queen Sturgeon Royal Pearls: purple velvet pouch, gold foil everything
  caviar(D, C) {
    pouchShape(D);
    D.head = [4, 5];
    D.crimp(0, 3, C.trim, M_GOLD);
    D.hangHole(1);
    D.fold = true;
    for (let y = 7; y < 48; y++) for (let x = 3; x < 37; x++) if ((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) D.px(x, y, shade(C.main, -1), M_BAG);
    for (let y = 6; y <= 47; y++) { D.px(2, y, C.trim, M_GOLD); D.px(37, y, C.trim, M_GOLD); }
    D.hline(6, C.trim, M_GOLD, 2, 37);
    D.hline(47, C.trim, M_GOLD, 2, 37);
    for (const [x, y] of [[4, 8], [35, 8], [4, 45], [35, 45]]) D.px(x, y, shade(C.trim, 2), M_GOLD);
    D.rect(17, 9, 7, 3, C.trim, M_GOLD);
    for (const x of [17, 20, 23]) D.px(x, 8, C.trim, M_GOLD);
    D.px(20, 10, rgb('#e83a4a'), M_GOLD);
    D.logo('QUEEN', 20, 14, { fill: C.trim, hi: shade(C.trim, 2), line: C.dark, shadow: shade(C.dark, -1) });
    D.textC('STURGEON', 20, 21, C.accent);
    D.sprite(mascotPix('sturgeon'), 4, 26);
    for (let x = 6; x <= 33; x += 3) D.px(x, 44 + Math.round(Math.pow((x - 20) / 14, 2) * -2), rgb('#f4f0ff'), M_PRINT);
    D.ribbon('PREMIUM', 51, { fill: C.trim, ink: C.dark, bleed: true, arc: 1 });
  },
  // Bug Bites: a homemade kraft bag, top rolled and pegged, a stuck-on label
  bugbites(D, C) {
    kraftShape(D);
    D.finish = 'kraft';
    D.seal = 6;
    D.head = [7, 9];
    D.lean = -1;
    D.inner = shade(KRAFT, 1);
    for (let y = 0; y <= 6; y++) D.hline(y, y === 0 || y === 3 ? shade(KRAFT, 1) : y === 2 || y === 6 ? shade(KRAFT, -2) : shade(KRAFT, -1), M_SEAL);
    const peg = rgb('#e8c890');
    D.rect(18, 0, 4, 9, peg, M_PRINT);
    D.rect(18, 4, 4, 1, rgb('#9aa0b0'), M_GOLD);
    D.px(19, 0, shade(peg, 1)).px(18, 8, shade(peg, -1)).px(21, 8, shade(peg, -1));
    // the label, a little crooked, with tape at the corners
    const paper = rgb('#fbf3dc');
    for (let y = 11; y <= 46; y++) {
      const s = y < 23 ? 1 : y < 35 ? 0 : -1;
      for (let x = 4 + s; x <= 35 + s; x++) D.px(x, y, (y === 11 || y === 46 || x === 4 + s || x === 35 + s) ? shade(paper, -1) : paper, M_LABEL);
    }
    const tape = mix(rgb('#f4f0d8'), KRAFT, 0.25);
    D.rect(3, 9, 6, 4, tape, M_LABEL).rect(32, 9, 6, 4, tape, M_LABEL);
    D.textC('BUG', 21, 13, rgb('#c0392b'), M_LABEL);
    D.logo('BITES', 21, 19, { fill: shade(C.main, -1), hi: C.main, line: rgb('#fbf3dc'), shadow: rgb('#e0d4b0') });
    D.sprite(mascotPix('ladybug'), 8, 23, false, M_LABEL);
    // rubber-stamped "LOCAL!" in slightly faded red ink
    const ink = rgb('#c0392b');
    for (let x = 8; x <= 31; x++) { if (hash2(x, 1, 9) > 0.15) D.px(x, 48, ink); if (hash2(x, 2, 9) > 0.15) D.px(x, 54, ink); }
    for (let y = 48; y <= 54; y++) { D.px(8, y, ink); D.px(31, y, ink); }
    eachTextPixel('LOCAL!', 9 + Math.round((22 - textWidth('LOCAL!')) / 2), 49, (X, Y) => { if (hash2(X, Y, 4) > 0.12) D.px(X, Y, ink); });
  },
};

function look(id) {
  const f = FOOD_ITEMS[id] || FOOD_ITEMS.pellets;
  const c = f.colors || FOOD_ITEMS.pellets.colors;
  return { main: rgb(c.main), accent: rgb(c.accent), dark: rgb(c.dark), trim: rgb(c.trim) };
}
export function bagLook(id) {
  const f = FOOD_ITEMS[id] || FOOD_ITEMS.pellets;
  return { ...(f.colors || FOOD_ITEMS.pellets.colors) };
}

const DESIGNS = new Map();
function bagDesign(id) {
  let D = DESIGNS.get(id);
  if (!D) {
    D = new Design(id, look(id));
    (BAG_DESIGNS[id] || BAG_DESIGNS.pellets)(D, D.c);
    DESIGNS.set(id, D);
  }
  return D;
}

// ---------------------------------------------------------------- the food itself
const FOOD_STYLE = { pellets: 'kibble', flakes: 'flake', worms: 'worm', krill: 'kibble', maple: 'kibble', caviar: 'pearl', bugbites: 'crumb' };
const FOOD_RGB = new Map();
function foodColors(id) {
  let c = FOOD_RGB.get(id);
  if (!c) { c = (FOOD_ITEMS[id]?.pellet || [0xb8742e]).map(rgb); FOOD_RGB.set(id, c); }
  return c;
}
// colour of a heap of this food at (x, y): 2x2 kibbles lit from the top-left
export function foodAt(id, x, y) {
  const cols = foodColors(id), st = FOOD_STYLE[id] || 'kibble';
  const cx = x & 1, cy = y & 1, gx = x >> 1, gy = y >> 1;
  const base = cols[Math.floor(hash2(gx, gy, 11) * cols.length) % cols.length];
  if (st === 'flake') return hash2(x, y, 14) < 0.25 ? shade(base, 1) : cx && cy ? shade(base, -1) : base;
  if (st === 'worm') { const k = (x + y * 2) % 4; return k === 0 ? shade(base, -2) : k === 1 ? shade(base, 1) : base; }
  if (st === 'crumb') return hash2(x, y, 15) < 0.3 ? shade(base, -1) : hash2(x, y, 16) < 0.15 ? shade(base, 1) : base;
  if (hash2(gx, gy, 12) < 0.07) return shade(base, -2);
  if (st === 'pearl') return !cx && !cy ? (hash2(gx, gy, 13) < 0.6 ? rgb('#c8c0e0') : shade(base, 2)) : cx && cy ? shade(base, -1) : base;
  return !cx && !cy ? shade(base, 1) : cx && cy ? shade(base, -1) : base;
}

// ---------------------------------------------------------------- rendering
const SHADED = [0, 1, 1, 1, 1, 1, 1, 0, 0];
function buildBag(id, fill, open, shake) {
  const D = bagDesign(id);
  const e = 1 - fill;
  const seed = hashStr(id);
  const out = new Pix(BAG_W, BAG_H);
  const mat = new Uint8Array(BAG_W * BAG_H);
  const rowOf = new Int16Array(BAG_H).fill(-1);
  const ext = new Array(BAG_H).fill(null);
  // 1. which design rows survive. Settling: the plain band under the seal
  // folds away. Nearly empty (crimped bags): the whole top folds over forward.
  const [h0, h1] = D.head;
  const fold = !open && D.fold && e >= 0.8;
  const nDrop = fold ? 0 : Math.round(clamp01((e - 0.12) / 0.66) * (h1 - h0 + 1));
  const rows = [];
  for (let r = fold ? h0 : 0; r < DH; r++) if (!(r >= h0 && r < h0 + nDrop)) rows.push(r);
  const top = BOTTOM - (rows.length - 1);
  // the food level (design rows): plump below it, deflated above it
  const lvl = D.seal + 3 + e * (DH - 12 - D.seal);
  const span = Math.max(1, lvl - D.seal);
  // crumple kinks: runs of rows where one side caves in by a pixel
  const kinkL = new Int8Array(DH), kinkR = new Int8Array(DH);
  const kinks = [];
  if (e > 0.4) {
    const KR = rng(seed * 31 + 7);
    const n = Math.round((e - 0.3) * 6);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(D.seal + 2 + KR() * Math.max(1, lvl - D.seal - 2));
      const len = 2 + Math.floor(KR() * 3), left = KR() < 0.5;
      for (let k = 0; k < len && r + k < DH - 3; k++) (left ? kinkL : kinkR)[r + k] = 1;
      kinks.push([r, left]);
    }
  }
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j], y = top + j;
    const t = j / (rows.length - 1);
    const defl = r < lvl ? clamp01((lvl - r) / span) : 0;
    const lean = D.lean * Math.round(Math.pow(defl, 1.4) * e * 2.4) + Math.round(shake * 3 * Math.pow(1 - t, 1.25));
    let ins = 0;
    if (r > lvl + 2 && r > D.seal + 5 && r < DH - 5) ins = -1; // plump: the sides bulge
    else if (r > D.seal && r < lvl && e > 0.3 && defl > 0.15 && defl < 0.95) ins = 1; // a soft waist
    const [xl, xr] = D.ext[r];
    const il = ins + kinkL[r], ir = ins + kinkR[r];
    let ol = 1e9, or = -1e9;
    for (let x = xl + il; x <= xr - ir; x++) {
      const sx = Math.min(xr, Math.max(xl, x));
      if (!D.p.a(sx, r)) continue;
      const X = OX + x + lean;
      if (X < 0 || X >= BAG_W) continue;
      out.put(X, y, D.p.get(sx, r));
      mat[y * BAG_W + X] = D.m[r * DW + sx];
      ol = Math.min(ol, X); or = Math.max(or, X);
    }
    rowOf[y] = r;
    if (or >= ol) ext[y] = { xl: ol, xr: or, defl, r };
  }
  // 2. see-through window: the food level drops with the fill
  if (D.win) {
    const { y0, y1 } = D.win;
    const level = y0 + (1 - fill) * (y1 - y0 + 1);
    const empty = mix(shade(D.c.main, -3), [24, 20, 40], 0.45);
    for (let y = 0; y < BAG_H; y++) {
      const r = rowOf[y];
      if (r < 0) continue;
      for (let x = 0; x < BAG_W; x++) {
        if (mat[y * BAG_W + x] !== M_WIN) continue;
        const bump = hash2(x, 5, seed) < 0.35 ? -1 : 0;
        let c = fill > 0.03 && r >= level + bump ? foodAt(id, x, y) : r === y1 && hash2(x, 6, seed) < 0.3 ? foodAt(id, x, y) : empty;
        if ((x + r) % 7 === 0 && r < y0 + 3) c = mix(c, WHITE, 0.6);
        out.put(x, y, c);
        mat[y * BAG_W + x] = M_FOOD;
      }
    }
  }
  // 3. torn open: the seal is ripped off and the food peeks out
  if (open) {
    let ty = -1;
    for (let y = 0; y < BAG_H; y++) if (rowOf[y] > D.seal && ext[y]) { ty = y; break; }
    if (ty > 2) {
      for (let y = 0; y < ty; y++) {
        for (let x = 0; x < BAG_W; x++) { out.clear(x, y); mat[y * BAG_W + x] = 0; }
        ext[y] = null;
      }
      const { xl, xr } = ext[ty];
      for (let x = xl; x <= xr; x++) if (hash2(x, 7, seed) < 0.38) { out.clear(x, ty); mat[ty * BAG_W + x] = 0; }
      const dark = mix(shade(D.c.main, -3), INK, 0.6);
      const cx = (xl + xr) / 2, hw = Math.max(1, (xr - xl) / 2);
      for (let x = xl + 1; x <= xr - 1; x++) {
        const u = (x - cx) / hw;
        const bt = ty - 3 + (hash2(x, 8, seed) < 0.3 ? 1 : 0) + (Math.abs(u) > 0.8 ? 1 : 0);
        for (let y = bt; y <= ty; y++) {
          if (y === ty && out.a(x, y)) continue;
          const c = y >= ty - 1 && Math.abs(u) < 0.9 ? dark : y === bt ? shade(D.inner, 1) : D.inner;
          out.put(x, y, c);
          mat[y * BAG_W + x] = M_INNER;
        }
        if (fill > 0.1) {
          const hh = Math.round(fill * 3.6 * (1 - u * u) + (hash2(x, 9, seed) - 0.5) * 1.5);
          for (let k = 0; k < hh; k++) {
            const y = ty - 1 - k;
            out.put(x, y, foodAt(id, x, y));
            mat[y * BAG_W + x] = M_FOOD;
          }
          // the topmost bit of the heap is outlined so it reads against the bag
          if (hh > 0) { const y = ty - 1 - hh; if (y >= 0) { out.put(x, y, mix(shade(foodColors(id)[0], -3), INK, 0.4)); mat[y * BAG_W + x] = M_FOOD; } }
        }
      }
      if (fill > 0.35)
        for (let i = 0; i < 3; i++) {
          const x = Math.round(cx + (hash2(i, 10, seed) - 0.5) * hw * 1.4), y = ty + 1 + (i % 2);
          if (out.a(x, y)) { out.put(x, y, shade(foodColors(id)[i % foodColors(id).length], i ? 0 : 1)); mat[y * BAG_W + x] = M_FOOD; }
        }
    }
  }
  // 4. shading: a soft pillow lit from the top-left, sheen on foil, paper grain.
  // Dithered band edges only on plain bag colour so print stays crisp.
  const foil = D.finish === 'foil', kraft = D.finish === 'kraft';
  for (let y = 0; y < BAG_H; y++) {
    const E = ext[y];
    if (!E) continue;
    const w = Math.max(1, E.xr - E.xl);
    for (let x = E.xl; x <= E.xr; x++) {
      const i = y * BAG_W + x, m = mat[i];
      if (!out.a(x, y) || !SHADED[m]) continue;
      const u = (x - E.xl + 0.5) / (w + 1), d = m === M_BAG ? (x + y) & 1 : u < 0.5 ? 1 : 0;
      let k = 0;
      if (u > 0.1 && u < 0.24) k = 1;
      else if ((u > 0.06 && u <= 0.1) || (u >= 0.24 && u < 0.3)) k = d;
      if (u > 0.93) k = -2; else if (u > 0.81) k = -1; else if (u > 0.75) k = -d;
      if ((foil && (m === M_BAG || m === M_SEAL)) || m === M_GOLD) {
        if (u > 0.14 && u < 0.2) k = 2;
        else if (u > 0.58 && u < 0.62) k = Math.max(k, 1);
      }
      if (E.r === D.seal + 1 && !fold) k -= 1;
      if (y >= BOTTOM - 1) k -= 1;
      if (y === BOTTOM) k -= 1;
      if (E.defl > 0.2 && e > 0.35 && k > 0 && (x + y) & 1) k = 0;
      if (m === M_BAG && !foil) {
        const h = hash2(x, y, kraft ? 21 : 22);
        if (h < (kraft ? 0.1 : 0.03)) k -= 1; else if (kraft && h > 0.95) k += 1;
      }
      if (m === M_LABEL) k = Math.max(-1, Math.min(1, k));
      if (k) out.put(x, y, shade(out.get(x, y), k));
    }
  }
  // 5. creases: gusset folds when full, wrinkles from every kink as it empties
  const creasable = (x, y) => out.a(x, y) && SHADED[mat[y * BAG_W + x]];
  const crease = (x, y, dir, dy, len, R) => {
    for (let s = 0; s < len; s++) {
      if (!creasable(x, y)) break;
      out.put(x, y, shade(out.get(x, y), -1));
      if (creasable(x, y - 1)) out.put(x, y - 1, shade(out.get(x, y - 1), 1));
      x += dir;
      if (R() < 0.55) y += dy;
    }
  };
  const R = rng(seed ^ (Math.round(fill * 20) * 7919));
  const yOfRow = (r) => { for (let y = 0; y < BAG_H; y++) if (rowOf[y] === r && ext[y]) return y; return -1; };
  // gusset folds at the bottom corners
  for (const side of [-1, 1]) {
    const y = BOTTOM - 2 - Math.floor(R() * 3);
    if (ext[y]) crease(side < 0 ? ext[y].xl + 1 : ext[y].xr - 1, y, -side, -1, 3, R);
  }
  for (const [r, left] of kinks) {
    const y = yOfRow(r);
    if (y < 0) continue;
    crease(left ? ext[y].xl + 1 : ext[y].xr - 1, y, left ? 1 : -1, R() < 0.5 ? 1 : -1, 3 + Math.floor(R() * 4 * e), R);
  }
  if (e > 0.3) {
    const n = Math.round(e * 6);
    for (let i = 0; i < n; i++) {
      const cand = [];
      for (let y = 0; y < BAG_H; y++) if (ext[y] && ext[y].defl > 0.05 && ext[y].r > D.seal + 1) cand.push(y);
      if (!cand.length) break;
      const y = cand[Math.floor(R() * cand.length)], side = R() < 0.5 ? -1 : 1;
      crease(side < 0 ? ext[y].xl + 1 : ext[y].xr - 1, y, -side, R() < 0.5 ? 1 : -1, 2 + Math.floor(R() * 3), R);
    }
  }
  // 6. the folded-over top: a rounded fold, the back of the bag, the crimp hanging down
  if (fold) {
    const fy = top, E = ext[fy];
    if (E) {
      const back = shade(D.c.main, -1), sealC = D.p.get(Math.floor(DW / 2), Math.max(0, D.seal - 1));
      for (let k = 0; k < 4; k++) {
        const y = fy + k, Ek = ext[y] || E;
        for (let x = Ek.xl + (k === 0 ? 1 : 0); x <= Ek.xr - (k === 0 ? 1 : 0); x++) {
          let c;
          if (k === 0) c = shade(back, 2);
          else if (k === 3) { if (x % 2) continue; c = shade(sealC, -1); }
          else c = (x + k) % 5 === 0 ? shade(back, -1) : back;
          out.put(x, y, c);
          mat[y * BAG_W + x] = M_SEAL;
        }
      }
      const y = fy + 4;
      if (ext[y]) for (let x = ext[y].xl; x <= ext[y].xr; x++) if (out.a(x, y) && SHADED[mat[y * BAG_W + x]]) out.put(x, y, shade(out.get(x, y), -1));
    }
  }
  if (e > 0.8) {
    // empty: the colours go a little dull
    const t = (e - 0.8) * 1.4;
    for (let i = 0; i < out.d.length; i += 4) {
      if (!out.d[i + 3]) continue;
      const g = lum([out.d[i], out.d[i + 1], out.d[i + 2]]);
      for (let k = 0; k < 3; k++) out.d[i + k] = Math.round(out.d[i + k] + (g - out.d[i + k]) * t);
    }
  }
  // 7. tinted outline
  out.outline(0.5);
  return out;
}

// a faint dashed silhouette for bags you have never owned
function buildGhost(id) {
  const src = buildBag(id, 1, false, 0);
  const out = new Pix(BAG_W, BAG_H);
  const line = rgb('#fff4dc');
  for (let y = 0; y < BAG_H; y++)
    for (let x = 0; x < BAG_W; x++) {
      if (!src.a(x, y)) continue;
      const edge = N4.some(([dx, dy]) => !src.a(x + dx, y + dy));
      if (edge && (x + y) % 3 !== 0) out.put(x, y, line);
    }
  return out;
}

const BAG_CV = new Map();
export function bagCanvas(id, o = {}) {
  if (!FOOD_ITEMS[id]) id = 'pellets';
  const scale = Math.max(1, Math.floor(o.scale || 1));
  const fill = Math.round(clamp01(o.fill == null ? 1 : +o.fill || 0) * 20) / 20;
  const shake = Math.round(Math.max(-1, Math.min(1, +o.shake || 0)) * 4) / 4;
  const open = !!o.open, ghost = !!o.ghost;
  const key = `${id}|${scale}|${ghost ? 'g' : fill + '|' + (open ? 1 : 0) + '|' + shake}`;
  let cv = BAG_CV.get(key);
  if (!cv) {
    cv = pixCanvas(ghost ? buildGhost(id) : buildBag(id, fill, open, shake), scale);
    BAG_CV.set(key, cv);
  }
  return cv;
}

// ===========================================================================
// PRODUCE + SPECIAL FINDS (20x20 icon art, shared with foodIcons.js)
// ===========================================================================
const carrotAt = (g, x0, y0, x1, y1, w, ch, lf) => {
  // a tapered root from (x0, y0) (shoulder) to (x1, y1) (tip), leaves on top
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = w * (1 - t * 0.85);
    g.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(0.6, r), Math.max(0.6, r), ch);
  }
  for (let i = 1; i < 5; i++) g.set(Math.round(x0 + (x1 - x0) * i / 6 + 0.5), Math.round(y0 + (y1 - y0) * i / 6), 'k');
  if (lf) {
    g.line(x0, y0 - 1, x0 - 2, y0 - 5, lf).line(x0, y0 - 1, x0 + 1, y0 - 6, lf).line(x0 + 1, y0 - 1, x0 + 3, y0 - 4, lf);
    g.line(x0 - 1, y0 - 1, x0 - 3, y0 - 3, lf);
  }
};
const sparkle = (g, x, y, ch = 's') => g.set(x, y, ch).set(x - 1, y, ch).set(x + 1, y, ch).set(x, y - 1, ch).set(x, y + 1, ch);

const ICON_ART = {
  carrot: () => {
    const g = new Grid(20, 20);
    carrotAt(g, 6, 6, 16, 18, 3.2, 'C', 'L');
    carrotAt(g, 11, 4, 17, 13, 2.6, 'D', 'M');
    return { g, key: { C: 'orange.r@c1', D: 'orange.r@c2', L: 'leaf.x@l1', M: 'leaf.x@l2' } };
  },
  golden_carrot: () => {
    const g = new Grid(20, 20);
    carrotAt(g, 7, 6, 15, 18, 3.6, 'C', 'L');
    sparkle(g, 16, 4); sparkle(g, 3, 13); g.set(17, 9, 'w');
    return { g, key: { C: 'gold.R@c', L: 'lime.x@l', s: '#fff8c0', w: '#ffffff' } };
  },
  lettuce: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 11.4, 8.4, 7, 'A');
    g.ellipse(5.4, 9.6, 4, 4, 'B').ellipse(14.6, 9.6, 4, 4, 'B');
    g.ellipse(10, 9, 4.4, 4, 'C');
    g.line(10, 6, 10, 16, 'v').line(10, 12, 6, 9, 'v').line(10, 12, 14, 9, 'v');
    for (const x of [3, 7, 13, 17]) g.set(x, 17, 'k');
    return { g, key: { A: 'leaf.r@a', B: 'lime.r@b', C: 'lime.R@c', v: 'lime:5' } };
  },
  radish: () => {
    const g = new Grid(20, 20);
    g.poly([[9, 8], [5, 1.4], [8.2, 2.4], [10, 7]], 'L').poly([[11, 8], [15, 0.8], [15.6, 4], [11.6, 8.4]], 'M');
    g.ellipse(10, 12, 5.6, 5, 'R');
    g.line(10, 17, 11, 19, 'W');
    g.set(8, 10, 'h').set(7, 11, 'h');
    return { g, key: { L: 'leaf.x@l', M: 'leaf.x@m', R: 'rose.R@r', W: 'cream:4', h: 'pink:5' } };
  },
  peas: () => {
    const g = new Grid(20, 20);
    g.poly([[1.6, 13], [6, 7.4], [13, 4.6], [18.6, 4.4], [15, 9.6], [8, 14.8], [2.6, 15.6]], 'P');
    for (let i = 0; i < 4; i++) g.ellipse(6 + i * 3.1, 11.6 - i * 1.8, 1.7, 1.7, 'E');
    g.line(2, 15, 9, 14, 'k');
    g.line(17, 4, 19, 1, 'S');
    return { g, key: { P: 'leaf.r@pod', E: 'lime.R@pea', S: 'olive:3' } };
  },
  potato: () => {
    const g = new Grid(20, 20);
    g.ellipse(7.6, 12.4, 6, 4.6, 'A');
    g.ellipse(13.4, 9, 5.4, 4.2, 'B');
    for (const [x, y] of [[5, 12], [9, 14], [12, 8], [15, 10], [7, 10]]) g.set(x, y, 'e');
    g.set(4, 14, 'd').set(14, 7, 'h');
    return { g, key: { A: 'tan.r@a', B: 'sand.r@b', e: 'cinnamon:2', d: 'tan:1', h: 'sand:5' } };
  },
  corn: () => cornArt(false),
  rainbow_corn: () => cornArt(true),
  sunflower: () => {
    const g = new Grid(20, 20);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.ellipse(10 + Math.cos(a) * 6, 10 + Math.sin(a) * 6, 2.4, 2.4, i % 2 ? 'P' : 'Q');
    }
    g.ellipse(10, 10, 4.6, 4.6, 'C');
    for (let y = 6; y < 15; y++) for (let x = 6; x < 15; x++) if (g.get(x, y) === 'C' && (x + y) % 2 === 0) g.set(x, y, 'c');
    return { g, key: { P: 'yellow.r@p', Q: 'gold.r@q', C: 'dkbear.r@c', c: 'cinnamon:2' } };
  },
  sun_seed: () => {
    const g = new Grid(20, 20);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.line(10 + Math.cos(a) * 6.4, 10 + Math.sin(a) * 6.4, 10 + Math.cos(a) * 8.6, 10 + Math.sin(a) * 8.6, 'r'); }
    g.ellipse(10, 10.4, 3.6, 5.6, 'S');
    g.line(9, 6, 9, 15, 'T').line(11, 6, 11, 15, 'T');
    g.set(8, 7, 'w');
    return { g, key: { r: 'yellow:4', S: 'gold.R@seed', T: 'honey:2', w: '#ffffff' } };
  },
  pumpkin: () => pumpkinArt(false),
  giant_pumpkin: () => pumpkinArt(true),
  moonberry: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 11, 7.4, 7.4, 'B');
    g.ellipse(7, 8, 3, 3, 'h').ellipse(8.2, 9, 2.6, 2.6, 'B');
    g.line(10, 4, 12, 1, 'S').ellipse(14, 2.2, 2.4, 1.2, 'L');
    sparkle(g, 17, 8); sparkle(g, 3, 16); g.set(15, 15, 'w');
    return { g, key: { B: 'ice.R@b', h: 'sky:5', S: 'olive:2', L: 'leaf.r@l', s: '#ffffff', w: '#ffffff' } };
  },
  royal_jelly: () => {
    const g = new Grid(20, 20);
    g.rect(5, 7, 10, 10, 'J').rect(4, 8, 12, 8, 'J');
    g.rect(5, 9, 10, 7, 'Y');
    g.rect(5, 4, 10, 3, 'L');
    g.stamp(7, 1, ['C.C.C', 'CCCCC']);
    g.set(6, 10, 'w').set(6, 11, 'w');
    return { g, key: { J: 'glass.x@jar', Y: 'cream.R@jelly', L: 'purple.y@lid', C: 'gold.R@crown', w: '#ffffff' } };
  },
  truffle: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 11.6, 7, 6, 'T');
    g.ellipse(6.4, 9.6, 3, 3, 'T').ellipse(13.6, 8.6, 3.4, 3, 'T');
    for (let i = 0; i < 14; i++) { const x = 4 + ((i * 7) % 13), y = 7 + ((i * 5) % 10); if (g.get(x, y) === 'T') g.set(x, y, 'b'); }
    sparkle(g, 15, 4); g.set(4, 6, 'y');
    g.line(5, 17, 15, 17, 'G');
    return { g, key: { T: 'dkbear.r@t', b: 'cinnamon:2', s: '#fff2a0', y: 'gold:4', G: 'gold:3' } };
  },
  maple_gem: () => {
    const g = new Grid(20, 20);
    g.poly([[10, 1.4], [16.6, 7], [10, 18.6], [3.4, 7]], 'A');
    g.poly([[10, 1.4], [16.6, 7], [10, 7]], 'B').poly([[3.4, 7], [10, 7], [10, 18.6]], 'C');
    g.line(5, 7, 15, 7, 'h');
    g.set(7, 4, 'w').set(8, 4, 'w').set(7, 5, 'w');
    sparkle(g, 17, 15);
    return { g, key: { A: 'honey.R@g', B: 'yellow.R@g2', C: 'syrup.R@g3', h: 'yellow:5', w: '#ffffff', s: '#fff4c0' } };
  },
  pearl_rice: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 15.4, 8.4, 3.4, 'W');
    g.rect(3, 15, 15, 3, 'W');
    g.ellipse(10, 12, 7, 3.4, 'R');
    for (let i = 0; i < 9; i++) g.set(5 + ((i * 3) % 11), 10 + (i % 3), i % 3 ? 'p' : 'w');
    sparkle(g, 16, 5); g.set(4, 6, 'w');
    return { g, key: { W: 'denim.y@bowl', R: 'white.R@rice', p: 'lilac:5', w: '#ffffff', s: '#f4f0ff' } };
  },
  // crate fillers for produce whose UI icon already lives in sprites.js
  x_honey: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 12, 7, 6, 'H');
    g.rect(5, 4, 10, 3, 'C');
    g.rect(6, 10, 8, 4, 'L');
    g.set(6, 8, 'h');
    return { g, key: { H: 'honey.R@jar', C: 'red.y@cloth', L: 'parch.f@lab', h: 'honey:5' } };
  },
  x_syrup: () => {
    const g = new Grid(20, 20);
    g.rect(8, 2, 4, 3, 'R');
    g.ellipse(10, 12.6, 6.6, 6.4, 'S');
    g.rect(6, 10, 8, 5, 'L');
    g.set(9, 12, 'm').set(10, 11, 'm').set(11, 12, 'm').set(10, 12, 'm');
    return { g, key: { R: 'red.R@cap', S: 'syrup.R@b', L: 'parch.f@lab', m: 'red:3' } };
  },
  x_mushroom: () => {
    const g = new Grid(20, 20);
    g.ellipse(7, 7, 6, 3.6, 'C').rect(5, 9, 4, 8, 'S');
    g.ellipse(14.6, 10, 4.4, 2.8, 'D').rect(13, 12, 3, 6, 'S');
    return { g, key: { C: 'orange.R@c', D: 'gold.R@d', S: 'cream.x@s' } };
  },
  x_wildrice: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 13, 8.6, 5.6, 'G');
    for (let i = 0; i < 16; i++) g.set(3 + ((i * 5) % 14), 10 + ((i * 3) % 7), i % 2 ? 'g' : 'h');
    return { g, key: { G: 'syrup.r@g', g: 'straw:4', h: 'cinnamon:2' } };
  },
  x_clover: () => {
    const g = new Grid(20, 20);
    for (const [x, y] of [[6.6, 6.6], [13.4, 6.6], [6.6, 13.4], [13.4, 13.4]]) g.ellipse(x, y, 3.6, 3.6, 'L');
    g.line(10, 10, 15, 18, 'S');
    return { g, key: { L: 'leaf.R@l', S: 'leaf:2' } };
  },
};
function cornArt(rainbow) {
  const g = new Grid(20, 20);
  g.poly([[4, 16], [13.6, 2.6], [17.4, 5.4], [7.4, 18.6]], 'K');
  const cols = rainbow ? ['a', 'b', 'c', 'd', 'e'] : ['K', 'k2'];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (g.get(x, y) === 'K') {
    if ((x + y) % 2 === 0) g.set(x, y, rainbow ? cols[(x * 3 + y) % 5] : 'Y');
  }
  g.poly([[2, 19], [3.4, 11], [8.6, 15.6]], 'H').poly([[6, 19.4], [12, 12.8], [10.4, 18.6]], 'J');
  if (rainbow) { sparkle(g, 3, 4); sparkle(g, 17, 14); }
  return { g, key: { K: 'yellow.r@cob', Y: 'yellow:5', H: 'lime.x@h1', J: 'leaf.x@h2', a: 'red.R@k', b: 'gold.R@k', c: 'leaf.R@k', d: 'blue.R@k', e: 'purple.R@k', s: '#ffffff' } };
}
function pumpkinArt(giant) {
  const g = new Grid(20, 20);
  const cy = giant ? 11.6 : 12.4, rx = giant ? 9.4 : 8, ry = giant ? 7.6 : 6.4;
  g.ellipse(10, cy, rx, ry, 'P');
  g.ellipse(10, cy, rx * 0.45, ry, 'Q');
  g.line(10, cy - ry + 1, 10, cy + ry - 1, 'k');
  g.line(Math.round(10 - rx * 0.45), cy - ry + 2, Math.round(10 - rx * 0.45), cy + ry - 2, 'k').line(Math.round(10 + rx * 0.45), cy - ry + 2, Math.round(10 + rx * 0.45), cy + ry - 2, 'k');
  g.rect(9, Math.round(cy - ry - 2), 2, 3, 'S');
  g.ellipse(13.4, cy - ry - 0.6, 2.6, 1.4, 'L');
  if (giant) { g.ellipse(16, 15, 2.6, 2.6, 'R').set(16, 15, 'y').line(15, 17, 14, 19, 'R').line(17, 17, 18, 19, 'R'); }
  return { g, key: { P: 'orange.r@p', Q: 'orange.R@q', S: 'dkbear.x@s', L: 'leaf.r@l', R: 'blue.R@ros', y: 'gold:4' } };
}

const ICON_PIX = new Map();
// 20x20 Pix of a produce / special icon (null when there is no art for it)
export function foodIconPix(name) {
  if (ICON_PIX.has(name)) return ICON_PIX.get(name);
  const art = ICON_ART[name];
  const p = art ? (({ g, key }) => render(g, key))(art()) : null;
  ICON_PIX.set(name, p);
  return p;
}
export const FOOD_ICON_NAMES = Object.keys(ICON_ART).filter((n) => !n.startsWith('x_'));

// a heap of berries tinted with the item's colour
function berryPile(id) {
  const base = rgb((FOOD_ITEMS[id]?.pellet || [0x3a4ab0])[0]);
  const p = new Pix(20, 20);
  const pts = [[5, 12], [9, 11], [13, 12], [7, 9], [11, 8], [15, 10], [3, 14], [17, 14], [9, 14], [13, 15], [6, 15]];
  pts.forEach(([x, y], i) => {
    for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) if (j * j + k * k <= 4) p.put(x + k, y + j, shade(base, j < 0 && k < 0 ? 1 : j > 0 || k > 1 ? -1 : 0));
    p.put(x - 1, y - 1, shade(base, 2));
    if (i === 4) { p.put(x, y - 3, rgb('#46963c')).put(x + 1, y - 4, rgb('#7cbe46')); }
  });
  return p.outline(0.5);
}

const CRATE_KIND = { blueberry: 'basket', raspberry: 'basket', strawberry: 'basket', saskatoon: 'basket', cranberry: 'basket', cloudberry: 'basket', elderberry: 'basket', goldenberry: 'basket', chanterelle: 'basket', wildrice: 'basket' };
const FILLER = { honey: 'x_honey', syrup: 'x_syrup', chanterelle: 'x_mushroom', wildrice: 'x_wildrice', clover: 'x_clover' };
function buildProduce(id) {
  const f = FOOD_ITEMS[id] || {};
  const p = new Pix(24, 24);
  const special = f.kind === 'special';
  let item = f.icon === 'berry' ? berryPile(id) : foodIconPix(FILLER[id] || id) || foodIconPix(f.icon) || berryPile(id);
  if (special) {
    // velvet cushion with gold piping, the find resting on it
    const vel = rgb('#7a3aa8'), gold = rgb('#ffd23f');
    for (let y = 17; y < 23; y++) for (let x = 2; x < 22; x++) {
      const u = (x - 12) / 10, v = (y - 20) / 3;
      if (u * u + v * v * 0.8 > 1.05) continue;
      p.put(x, y, y === 17 || y === 22 ? gold : shade(vel, y < 19 ? 1 : y > 20 ? -1 : 0));
    }
    p.put(2, 21, gold).put(21, 21, gold).put(1, 22, gold).put(22, 22, gold);
    p.draw(item, 2, 0);
  } else {
    p.draw(item, 2, 0);
    const basket = CRATE_KIND[id] === 'basket';
    const wood = basket ? rgb('#c89050') : rgb('#b07840');
    for (let y = 14; y < 23; y++) for (let x = 1; x < 23; x++) {
      if (basket && (x === 1 || x === 22) && y > 20) continue;
      let c = wood;
      if (basket) c = (x + y * 2) % 4 < 2 ? shade(wood, 1) : shade(wood, -1);
      else if (y === 14 || y === 18) c = shade(wood, 1);
      else if (y === 17 || y === 22) c = shade(wood, -2);
      else if (x === 1 || x === 22) c = shade(wood, -1);
      p.put(x, y, c);
    }
    if (basket) for (let x = 2; x < 22; x++) p.put(x, 14, shade(wood, 2));
    else { p.put(3, 16, rgb('#5c5c6c')).put(20, 16, rgb('#5c5c6c')).put(3, 20, rgb('#5c5c6c')).put(20, 20, rgb('#5c5c6c')); }
  }
  p.outline(0.5);
  if (special) for (const [x, y] of [[1, 3], [21, 6], [20, 1]]) p.put(x, y, rgb('#fff8c0'));
  return p;
}
const PRODUCE_CV = new Map();
export function produceCanvas(id, scale = 2) {
  const k = id + '@' + scale;
  let cv = PRODUCE_CV.get(k);
  if (!cv) { cv = pixCanvas(buildProduce(id), scale); PRODUCE_CV.set(k, cv); }
  return cv;
}
