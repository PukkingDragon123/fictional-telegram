// Garden crop growth stages for the nature atlas (see src/data/crops.js).
//
// Every vegetable grows out of the same little tilled mound, so the four
// stages (crop_seed -> crop_sprout -> crop_<id>_grow -> crop_<id>_ripe)
// swap in place without the bed jumping. Beds are ~24 px wide (one tile,
// like the berry bushes), ground anchored (ax = w / 2, ay = h, no outline
// under the bottom row). Style follows natureArt.js: light from the top
// left, hue-shifted ramps (cool violet shadows, warm highlights), a 1 px
// outline darkened from the local colour, opaque or transparent pixels only.
//
// Names
//   crop_seed          mound, a few seeds in the furrow, a wooden marker
//   crop_sprout        the same mound with a two-leaf sprout
//   crop_seed_water    a wild-rice seed pod bobbing in a ring of ripples
//   mushlog_bare       natureArt's 'mushlog' (same seed / pixels) without
//                      any mushrooms: moss, fern and beetle only
//   crop_<id>_grow     half grown   (carrot lettuce radish peas potato
//   crop_<id>_ripe     lush, produce visible, a sparkle    corn sunflower pumpkin)
//   crop_ready_glint   4-frame twinkle to overlay on ripe crops (centre anchor)
// CROP_ART[id] = { grow, ripe, colors: [leaf, produce] } for particles / UI.

// ===========================================================================
// Helpers (copied from natureArt.js so this module stays pure data)
// ===========================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const hx = (s) => parseInt(s.replace('#', ''), 16);
const cr = (c) => (c >> 16) & 255;
const cg = (c) => (c >> 8) & 255;
const cb = (c) => c & 255;
const rgb = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);
const mix = (a, b, t) => rgb(lerp(cr(a), cr(b), t), lerp(cg(a), cg(b), t), lerp(cb(a), cb(b), t));
const pals = (arr) => arr.map((s) => (typeof s === 'string' ? hx(s) : s));
const INK = hx('#1d1428');
const olc = (c, k = 0.6) => mix(c, INK, k);
const pick = (pal, I) => pal[clamp(Math.round(((I + 1) / 2) * (pal.length - 1)), 0, pal.length - 1)];
const LX = -0.55, LY = -0.72, LZ = 0.42;

class Px {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.c = new Int32Array(w * h);
    this.a = new Uint8Array(w * h);
  }
  ok(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  on(x, y) { return this.ok(x, y) && this.a[y * this.w + x] > 127; }
  any(x, y) { return this.ok(x, y) && this.a[y * this.w + x] > 0; }
  get(x, y) { return this.c[y * this.w + x]; }
  set(x, y, c, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.ok(x, y)) return;
    if (typeof c === 'string') c = hx(c);
    const i = y * this.w + x;
    this.c[i] = c;
    this.a[i] = a;
  }
  tint(x, y, c) { if (this.on(x, y)) this.c[y * this.w + x] = typeof c === 'string' ? hx(c) : c; }
  blit(src, ox = 0, oy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + x;
        if (!src.a[i]) continue;
        const tx = x + ox, ty = y + oy;
        if (!this.ok(tx, ty)) continue;
        this.c[ty * this.w + tx] = src.c[i];
        this.a[ty * this.w + tx] = 255;
      }
  }
}
// selective 1px outline: lighter on the lit top/left
function outline(p, o = {}) {
  const { k = 0.78, lit = 0.66, noBottom = true } = o;
  const add = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.any(x, y)) continue;
      let c = -1, amt = k;
      if (p.on(x, y + 1)) { c = p.get(x, y + 1); amt = lit; }
      else if (p.on(x + 1, y)) { c = p.get(x + 1, y); amt = lit + 0.05; }
      else if (p.on(x - 1, y)) { c = p.get(x - 1, y); amt = k; }
      else if (p.on(x, y - 1)) { if (noBottom && y === p.h - 1) continue; c = p.get(x, y - 1); amt = k + 0.04; }
      if (c < 0) continue;
      add.push(x, y, olc(c, amt));
    }
  for (let i = 0; i < add.length; i += 3) p.set(add[i], add[i + 1], add[i + 2]);
  return p;
}
function line(p, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (typeof c === 'function') c(x0, y0); else p.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
function ellipse(p, cx, cy, rx, ry, fn) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = typeof fn === 'function' ? fn(x, y, nx, ny) : fn;
      if (c === null || c === undefined || c < 0) continue;
      p.set(x, y, c);
    }
}
// lit sphere-ish blob: v from the 3D normal, plus an offset
function ball(p, cx, cy, rx, ry, pal, o = {}) {
  const { bias = 0.3, k = 1.4, tex = 0, seed = 1, rib = 0 } = o;
  ellipse(p, cx, cy, rx, ry, (x, y, nx, ny) => {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let v = (nx * LX + ny * LY + nz * LZ) * k - bias;
    if (tex) v += (hash(x, y, seed) - 0.5) * tex;
    if (rib) {
      const r = Math.abs(Math.sin((Math.asin(clamp(nx, -1, 1)) / Math.PI) * rib * Math.PI));
      if (r < 0.3) v -= 0.45;
    }
    return pick(pal, v);
  });
}
function stamp(p, rows, pal, x0, y0) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const v = pal[row[i]];
      if (v === undefined || v === null) continue;
      p.set(x0 + i, y0 + j, typeof v === 'string' ? hx(v) : v);
    }
  });
}
// one blade / stem from the base upwards (natureArt's blade)
function blade(p, x0, y0, len, lean, curl, w, pal, o = {}) {
  const steps = Math.max(2, Math.ceil(len * 2));
  const thick = w > 1 ? clamp((1 - 1 / w) * (o.taper ?? 0.85) * 1.6, 0, 1) : 0;
  let lx = null, ly = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + lean * t + curl * t * t * t;
    const y = y0 - len * t + Math.abs(curl) * 0.35 * t * t * t * t;
    const X = Math.round(x - 0.5), Y = Math.round(y - 0.5);
    if (X === lx && Y === ly) continue;
    lx = X; ly = Y;
    const v = 0.15 + t * 0.6 - (t < 0.18 ? 0.45 : 0) + (o.bright ?? 0);
    p.set(X, Y, pick(pal, v));
    if (t < thick) p.set(X + (lean + curl >= 0 ? 1 : -1), Y, pick(pal, v - 0.65));
  }
  return [x0 + lean + curl, y0 - len + Math.abs(curl) * 0.35];
}
// pointed leaf from (x0, y0) along angle `ang`: lighter upper half, a vein
function leaf(p, x0, y0, ang, len, wid, pal, o = {}) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const nx = -dy, ny = dx; // left-hand normal
  const up = ny < 0 ? 1 : -1; // which side faces the sky
  for (let s = 0; s <= len; s += 0.4) {
    const t = s / len;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * (o.fat ?? 1.15))), 0.8) + 0.3;
    for (let k = -w; k <= w; k += 0.4) {
      const x = x0 + dx * s + nx * k + (o.droop ?? 0) * t * t * dx;
      const y = y0 + dy * s + ny * k + (o.droop ?? 0) * t * t;
      const side = (k / Math.max(0.5, w)) * up; // +1 = sky side
      let v = 0.1 + side * 0.35 + (1 - t) * -0.15 + (o.bright ?? 0) - (Math.abs(k) < 0.45 && t > 0.15 && t < 0.85 ? 0.3 : 0);
      if (o.frill && Math.abs(k) > w - 0.6 && hash(Math.round(x), Math.round(y), 7) < 0.5) v += 0.4;
      p.set(x, y, pick(pal, v));
    }
  }
}
function dew(p, x, y) {
  if (!p.on(x, y) || !p.on(x, y + 1)) return;
  const under = p.get(x, y + 1);
  p.set(x, y, 0xffffff);
  p.set(x + 1, y, mix(p.get(x + 1, y), 0xbfe8ff, 0.7));
  p.set(x, y + 1, mix(under, 0x9fd4f0, 0.55));
}
// sparkle: a white core with a soft 4-point cross (on top of the art)
function twinkle(p, x, y, big = false) {
  p.set(x, y, 0xffffff);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, hx('#fff6c0'));
  if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) p.set(x + dx, y + dy, hx('#ffe88a'));
}
const toRGBA = (p, ax = p.w / 2, ay = p.h) => {
  const d = new Uint8ClampedArray(p.w * p.h * 4);
  for (let i = 0; i < p.w * p.h; i++) {
    if (!p.a[i]) continue;
    d[i * 4] = cr(p.c[i]); d[i * 4 + 1] = cg(p.c[i]); d[i * 4 + 2] = cb(p.c[i]); d[i * 4 + 3] = 255;
  }
  return { w: p.w, h: p.h, data: d, ax, ay };
};

// ===========================================================================
// Palettes (punchy produce so ripe beds read through the meadow clutter)
// ===========================================================================
const SOIL = pals(['#24140f', '#3a2218', '#543222', '#744a2e', '#94643c', '#b4824e', '#d0a066']);
const LEAF = pals(['#10261a', '#183a20', '#225026', '#2e682c', '#3e8232', '#539c3a', '#70b444', '#96cc58', '#c2e47a']);
const LEAF_LIGHT = pals(['#1a3a1e', '#285424', '#3a722a', '#509032', '#6aac3c', '#88c64a', '#aadc60', '#ccf084', '#ecfcb0']);
const STEM = pals(['#1a3a1a', '#2a5626', '#3e7830', '#58983e', '#7cb850']);
const WOOD = pals(['#3a2418', '#5a3a26', '#7e5636', '#a07448', '#c49a64', '#e2c08c']);
const ORANGE = pals(['#5a1606', '#a8340a', '#ec5a0e', '#ff7e1c', '#ffa83c', '#ffd884']);
const RADISH = pals(['#4a0414', '#9a0824', '#d81034', '#f42a48', '#ff6a84', '#ffc4d0']);
const POTATO = pals(['#5a2e14', '#94542a', '#c87e40', '#e8a85a', '#f8cc80', '#fff0c0']);
const PUMPKIN = pals(['#5a1806', '#a8380a', '#e65c0c', '#ff8418', '#ffae3a', '#ffe08a']);
const KERNEL = pals(['#7a4800', '#c88808', '#f8c010', '#ffde3a', '#fff4a0']);
const PETAL = pals(['#984a00', '#e07a08', '#ffaa10', '#ffd21e', '#ffee6a', '#fffcc0']);
const POD = pals(['#183a16', '#285a20', '#40882c', '#62b03c', '#90d05a', '#c4ee8c']);

// ===========================================================================
// The bed: a tilled mound shared by every stage (1.3x the berry-bush scale so
// a garden plot reads from afar). Plants stand on its furrow row.
// ===========================================================================
const BW = 34, CX = BW / 2, K = 1.3;
const X = (x) => CX + (x - 13) * K; // old 26 px layout -> 34 px layout
function mound(p, o = {}) {
  const H = p.h, rx = 12.6, ry = 5.4;
  const top = (x) => ry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - CX) / rx) ** 2));
  for (let x = 0; x < BW; x++) {
    const h = top(x);
    if (h < 0.6) continue;
    const y0 = Math.round(H - h);
    for (let y = y0; y < H; y++) {
      const nx = (x + 0.5 - CX) / rx, ny = 1 - (H - 0.5 - y) / h;
      let v = 0.35 - nx * 0.55 - ny * 0.9;
      // furrow along the ridge, a raked ridge line, crumbly clods
      if (y === y0 + 1 && Math.abs(nx) < 0.66) v -= 0.6;
      if (y === y0 + 3 && Math.abs(nx) < 0.5 && (x & 1)) v -= 0.3;
      const r = hash(x, y, 4401);
      if (r < 0.14) v += 0.45;
      else if (r > 0.9) v -= 0.4;
      p.set(x, y, pick(SOIL, v));
    }
  }
  for (const [x, y] of [[7, H - 2], [24, H - 3]]) { p.set(x, y, hx('#c4b8ac')); p.set(x + 1, y, hx('#8a7e7a')); p.set(x, y + 1, hx('#6a5e5c')); }
  for (let x = 0; x < BW; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.3));
  if (o.seeds) for (const x of [11, 17, 23]) { const y = H - 4; p.set(x, y, hx('#f6e4b0')); p.set(x + 1, y, hx('#c09a62')); p.set(x, y - 1, hx('#fff8e0')); }
  return p;
}
const ridge = (H) => H - 5;
// heap a lip of soil crumbs over the bottom of something poking out of the bed
function embed(p, cx, y, w) {
  for (let x = Math.round(cx - w / 2) - 1; x <= Math.round(cx + w / 2); x++) {
    if (!p.on(x, y)) continue;
    p.set(x, y, pick(SOIL, 0.1 + (hash(x, y, 31) - 0.5) * 0.8));
    if (hash(x, y, 32) < 0.4 && p.on(x, y - 1)) p.set(x, y - 1, pick(SOIL, 0.45));
  }
}
// wooden plant marker with a painted sign
function marker(p, x, yb, icon) {
  const sign = { W: '#f0e0bc', w: '#cdb48a', s: '#a8744e', S: '#6a4430' };
  stamp(p, ['WWWWW', 'Wwwww', 'Wwwww', '..s..', '..s..', '..S..'], sign, x, yb - 5);
  if (icon) stamp(p, icon, { g: '#5aa040', o: '#ff7e1c', r: '#e01840', y: '#f8c010', k: '#6a4426' }, x + 1, yb - 4);
}

// ===========================================================================
// Generic stages
// ===========================================================================
function seedBed() {
  const p = new Px(BW, 14);
  mound(p, { seeds: true });
  marker(p, 26, 11, ['kkk', '.k.']);
  outline(p);
  return p;
}
function sproutBed() {
  const p = new Px(BW, 19);
  mound(p);
  const b = ridge(19);
  blade(p, 17, b + 1, 5.5, -0.6, 0, 2, STEM);
  leaf(p, 16, b - 4, Math.PI + 0.35, 5.6, 2.1, LEAF_LIGHT, { bright: 0.15 });
  leaf(p, 17, b - 4, -0.3, 5.6, 2.1, LEAF_LIGHT, { bright: 0.25 });
  marker(p, 26, 15, ['g.g', '.g.']);
  outline(p);
  p.set(21, b - 6, 0xffffff);
  return p;
}
function seedWater() {
  const W = 34, H = 12;
  const p = new Px(W, H);
  const water = pals(['#14243a', '#1c3450', '#244a68', '#2e6280', '#3c7c98', '#5a9cb4', '#88c0d4', '#bfe2ee']);
  ellipse(p, W / 2, H - 4, 15, 3.9, (x, y, nx, ny) => pick(water, -0.1 - ny * 0.5 - nx * 0.2 + ((x * 3 + y) % 7 === 0 ? 0.3 : 0)));
  for (const [rx, ry, v] of [[11.4, 3, 1], [7, 1.9, 0.8]])
    for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = Math.floor(W / 2 + Math.cos(a) * rx), y = Math.floor(H - 4 + Math.sin(a) * ry);
      if (p.on(x, y) && hash(x, y, 9) < 0.85) p.set(x, y, pick(water, v));
    }
  // the pod: a golden husk with a green tip, floating, and its reflection
  stamp(p, ['...g', '..gG', '.HHh', 'HHHh', 'Hhh.'], { H: '#f4d890', h: '#b88c48', g: '#88cc4c', G: '#4e8a30' }, W / 2 - 2, H - 8);
  p.set(W / 2 - 2, H - 3, hx('#5a7a6a')); p.set(W / 2 - 1, H - 3, hx('#4a6a64')); p.set(W / 2, H - 3, hx('#4a6a64'));
  outline(p, { k: 0.6 });
  return p;
}

// ===========================================================================
// Vegetables
// ===========================================================================
// feathery carrot top: a thin stem with tiny forked sprigs
function fern(p, x0, y0, len, lean, pal, seed) {
  const [tx, ty] = blade(p, x0, y0, len, lean, lean * 0.4, 1, pal);
  const n = Math.round(len / 2);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 0.6);
    const x = Math.round(x0 + (tx - x0) * t), y = Math.round(y0 + (ty - y0) * t);
    const v = 0.3 + t * 0.6;
    p.set(x - 1, y - 1, pick(pal, v + 0.2));
    p.set(x + 1, y - 1, pick(pal, v - 0.1));
    if (t < 0.75) { p.set(x - 2, y - 1 - (hash(i, seed, 3) < 0.5 ? 1 : 0), pick(pal, v + 0.3)); p.set(x + 2, y - 2, pick(pal, v)); }
  }
  p.set(Math.round(tx - 0.5), Math.round(ty - 0.5) - 1, pal[pal.length - 1]);
}
const CARROT_TOP = pals(['#12321a', '#1e5222', '#2e7428', '#469632', '#68b840', '#92d45a', '#c4ec84']);
function carrot(ripe) {
  const H = ripe ? 31 : 22;
  const p = new Px(BW, H);
  const b = ridge(H);
  const xs = ripe ? [9, 17, 25] : [10, 17, 24];
  xs.forEach((x, i) => {
    const len = ripe ? 15 + (i === 1 ? 5 : 0) : 8 + (i === 1 ? 3 : 0);
    for (const lean of ripe ? [-4, 0.6, 4] : [-2, 2]) fern(p, x, b + 1, len - Math.abs(lean) * 0.7, lean, CARROT_TOP, 51 + i * 7 + lean);
  });
  mound(p);
  // fat orange carrots shouldering out of the soil
  if (ripe) for (const [i, x] of xs.entries()) {
    const cy = b - 0.6 - (i === 1 ? 1 : 0);
    ball(p, x + 0.5, cy, 3.3, 3.5, ORANGE, { bias: -0.1 });
    for (const dy of [-1, 1]) p.set(x + 2, Math.round(cy + dy), ORANGE[1]); // ridges
    p.set(x - 1, Math.round(cy - 2), ORANGE[5]);
    embed(p, x + 0.5, Math.round(cy + 2.6), 4);
  }
  outline(p);
  if (ripe) twinkle(p, 29, 10);
  return p;
}
function lettuce(ripe) {
  const H = ripe ? 23 : 17;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const rx = ripe ? 10.5 : 6, ry = ripe ? 7.4 : 4.4, cy = b + 1 - ry * 0.5;
  const n = ripe ? 11 : 7;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    leaf(p, CX + Math.cos(a) * 1.5, cy + 1, a, rx * 0.95, ripe ? 3.3 : 2.2, LEAF, { frill: true, bright: 0 });
  }
  ball(p, CX, cy, rx * 0.64, ry * 0.76, LEAF_LIGHT, { bias: -0.08, tex: 0.5, seed: 9 });
  const r2 = ripe ? 4 : 2.1;
  for (let a = 0; a < Math.PI * 2; a += 0.5) {
    const x = Math.round(CX + Math.cos(a) * r2), y = Math.round(cy + Math.sin(a) * r2 * 0.6);
    p.set(x, y, LEAF_LIGHT[8]);
    p.set(x + 1, y, LEAF_LIGHT[3]);
  }
  p.set(CX, Math.round(cy - 1), LEAF_LIGHT[8]);
  outline(p);
  if (ripe) { dew(p, CX - 5, Math.round(cy - 3)); twinkle(p, 28, 5); }
  return p;
}
function radish(ripe) {
  const H = ripe ? 26 : 19;
  const p = new Px(BW, H);
  const b = ridge(H);
  const xs = ripe ? [9, 17, 25] : [10, 17, 24];
  xs.forEach((x, i) => {
    const len = (ripe ? 10.4 : 6.5) + (i === 1 ? 2.6 : 0);
    for (const [a, l] of [[-Math.PI / 2 - 0.8, len], [-Math.PI / 2 + 0.75, len * 0.9], [-Math.PI / 2 - 0.05, len * 1.05]]) {
      line(p, x, b + 1, x + Math.cos(a) * l * 0.4, b + 1 + Math.sin(a) * l * 0.4, (X2, Y2) => p.set(X2, Y2, hx('#b82a44')));
      leaf(p, x + Math.cos(a) * l * 0.3, b + 1 + Math.sin(a) * l * 0.3, a, l * 0.75, ripe ? 2.7 : 1.9, LEAF, { bright: 0.1 });
    }
  });
  mound(p);
  if (ripe) for (const x of xs) {
    ball(p, x + 0.5, b - 0.2, 3.5, 3.2, RADISH, { bias: 0.12 });
    p.set(x - 1, b - 2, RADISH[5]); p.set(x - 2, b - 1, RADISH[4]);
    embed(p, x + 0.5, b + 2, 4);
    p.set(x, b + 3, hx('#f6eef0')); p.set(x + 1, b + 3, hx('#e0c8d0'));
  }
  outline(p);
  if (ripe) twinkle(p, 5, 9);
  return p;
}
function peas(ripe) {
  const H = ripe ? 36 : 29;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const top = ripe ? 3 : 8;
  for (const x of [8, 25]) {
    line(p, x, b + 2, x + (x < CX ? 1 : -1), top, (X2, Y2) => { p.set(X2, Y2, WOOD[3]); p.set(X2 + 1, Y2, WOOD[1]); });
    p.set(x + (x < CX ? 1 : -1), top - 1, WOOD[4]);
  }
  for (let y = top + 4; y < b - 1; y += 5) line(p, 9, y, 25, y + 1, (X2, Y2) => p.set(X2, Y2, hx('#efe0b8')));
  const vines = ripe ? [[12, 0], [17, 1], [22, 2]] : [[13, 0], [20, 2]];
  for (const [vx, ph] of vines) {
    const h = ripe ? b - top - 1 : (b - top) * 0.65;
    let px = vx, py = b + 1;
    for (let s2 = 0; s2 <= h; s2++) {
      const x = vx + Math.sin(s2 * 0.45 + ph) * 2.1, y = b + 1 - s2;
      line(p, px, py, x, y, (X2, Y2) => p.set(X2, Y2, STEM[3]));
      px = x; py = y;
      if (s2 % 4 === 1) leaf(p, x, y, Math.sin(s2 + ph) > 0 ? -0.4 : Math.PI + 0.4, 4.2, 1.8, LEAF_LIGHT, { bright: 0.05 });
      if (s2 % 6 === 3) { p.set(x + 1, y - 1, STEM[4]); p.set(x + 2, y - 2, STEM[4]); p.set(x + 3, y - 2, STEM[3]); }
    }
  }
  if (ripe) {
    for (const [x, y] of [[10, b - 12], [18, b - 7], [21, b - 17], [13, b - 20], [16, b - 26]])
      stamp(p, ['.lmmm.', 'lbmbmm', 'dbdbdb', '.dddd.'], { l: POD[5], m: POD[4], b: POD[3], d: POD[1] }, x, y);
    stamp(p, ['.w.', 'wyw', '.w.'], { w: '#fffaf4', y: '#f0d050' }, 23, b - 24);
    stamp(p, ['.p.', 'pyp', '.p.'], { p: '#f4a8d0', y: '#f0d050' }, 9, b - 18);
  }
  outline(p);
  if (ripe) twinkle(p, 4, 10);
  return p;
}
function bush(p, cx, cy, rx, ry, pal, seed, n) {
  const R = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R());
    const x = cx + Math.cos(a) * rx * r * 0.8, y = cy + Math.sin(a) * ry * r * 0.8;
    ball(p, x, y, 2.8 + R() * 1, 2.3 + R() * 0.8, pal, { bias: 0.1 + (y - cy) / ry * 0.35, tex: 0.3, seed: seed + i });
  }
}
function potato(ripe) {
  const H = ripe ? 27 : 21;
  const p = new Px(BW, H);
  const b = ridge(H);
  mound(p);
  if (ripe) for (const [x, y] of [[8, b + 0.6], [26, b + 0.4], [12, b + 2.4]]) {
    ball(p, x, y, 3.4, 2.4, POTATO, { bias: -0.1, tex: 0.3, seed: x });
    p.set(Math.round(x) - 1, Math.round(y), POTATO[1]); p.set(Math.round(x) + 1, Math.round(y) - 1, POTATO[1]);
    embed(p, x, Math.round(y + 2), 4);
  }
  for (const [x, l] of [[13, ripe ? 12 : 7], [17, ripe ? 14 : 9], [21, ripe ? 12 : 7]]) blade(p, x, b + 1, l, (x - 17) * 0.5, 0, 2, STEM);
  bush(p, CX, b - (ripe ? 9 : 5), ripe ? 10.4 : 6.5, ripe ? 5.8 : 3.9, LEAF, 61, ripe ? 18 : 10);
  if (ripe) for (const [x, y, c] of [[10, b - 14, '#fbf8ff'], [19, b - 17, '#c49cf0'], [24, b - 10, '#fbf8ff'], [14, b - 8, '#c49cf0'], [21, b - 13, '#fbf8ff']])
    stamp(p, ['.w.', 'wyw', '.w.'], { w: c, y: '#f8c820' }, x, y);
  outline(p);
  if (ripe) twinkle(p, 4, 9);
  return p;
}
function corn(ripe) {
  const H = ripe ? 50 : 32;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const stalks = ripe ? [[12, 40, -1], [21, 44, 1]] : [[13, 22, -0.8], [21, 25, 0.8]];
  for (const [x, h, lean] of stalks) {
    blade(p, x, b + 1, h, lean, 0, 3, STEM);
    const leaves = ripe ? [[0.18, 15, 1.1], [0.38, 14, 0.95], [0.58, 12, 1.05], [0.76, 9, 1.0]] : [[0.25, 11, 1.05], [0.55, 10, 0.95]];
    leaves.forEach(([t, len, up], k) => {
      const yy = b + 1 - h * t, xx = x + lean * t;
      const s2 = (k + (lean > 0 ? 1 : 0)) % 2 ? 1 : -1;
      leaf(p, xx, yy, s2 > 0 ? -up : Math.PI + up, len, 1.0, LEAF, { droop: len * 0.75, bright: 0.1, fat: 1.0 });
    });
    if (ripe) {
      const tx = x + lean, ty = b + 1 - h;
      for (const dx of [-3, -1, 1, 3]) line(p, tx, ty, tx + dx, ty - 4, (X2, Y2) => p.set(X2, Y2, hx('#e8c860')));
      p.set(tx, ty - 5, hx('#fff0a0'));
    }
  }
  if (ripe) {
    // big golden cobs bursting from their husks, with pink silk
    for (const [x, y, s2] of [[13, b - 20, 1], [17, b - 29, -1]]) {
      for (let j = 0; j < 10; j++)
        for (let i = 0; i < 4; i++) {
          const husk = (i === (s2 > 0 ? 0 : 3)) || j > 8;
          p.set(x + i, y + j, husk ? POD[i === 0 || i === 3 ? 2 : 4] : KERNEL[((i + j) % 2 ? 3 : 2) + (i === 1 ? 1 : 0) - (j > 6 ? 1 : 0)]);
        }
      line(p, x + 1, y - 1, x + 1 + s2 * 3, y - 4, (X2, Y2) => p.set(X2, Y2, hx('#f0a07a')));
      line(p, x + 2, y - 1, x + 2 + s2 * 2, y - 4, (X2, Y2) => p.set(X2, Y2, hx('#d8805a')));
    }
  }
  outline(p);
  if (ripe) twinkle(p, 28, 16);
  return p;
}
function sunflower(ripe) {
  const H = ripe ? 48 : 36;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const top = ripe ? 13 : 7;
  blade(p, CX, b + 1, b + 1 - top, ripe ? 0.6 : 0, 0, 3, STEM);
  for (const [y, s2] of [[b - 5, -1], [b - 13, 1], [b - 21, -1], [b - 28, 1]]) if (y > top + 4) leaf(p, CX, y, s2 > 0 ? -0.45 : Math.PI + 0.45, 8, 3.1, LEAF, { droop: 1.6, bright: 0.05 });
  if (!ripe) {
    ball(p, CX, top, 3.7, 3.4, POD, { bias: 0.05 });
    for (const [dx, dy] of [[-4, -1], [4, -1], [0, -4], [-3, -3], [3, -3]]) p.set(CX + dx, top + dy, POD[2]);
    p.set(CX, top - 4, PETAL[3]); p.set(CX - 1, top - 3, PETAL[4]); p.set(CX + 1, top - 3, PETAL[3]);
  } else {
    const fy = top, fx = CX + 1;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      for (let r = 4.4; r < 10; r += 0.5) {
        const w = Math.sin(((r - 4.4) / 5.6) * Math.PI) * 0.22;
        for (const da of [-w, 0, w]) {
          const x = fx + Math.cos(a + da) * r, y = fy + Math.sin(a + da) * r * 0.92;
          p.set(Math.floor(x), Math.floor(y), pick(PETAL, 0.35 - Math.cos(a) * 0.3 - Math.sin(a) * 0.4 + (r > 8.6 ? 0.2 : 0) - (k & 1) * 0.25));
        }
      }
    }
    const disk = pals(['#2a140c', '#4a2814', '#6a3c1c', '#8a5428', '#a87036']);
    ellipse(p, fx, fy, 5.1, 4.8, (x, y, nx, ny) => pick(disk, 0.25 - nx * 0.4 - ny * 0.5 + ((x + y) % 2 ? 0.15 : -0.1)));
    // a big happy face: shiny eyes, rosy cheeks, a wide smile
    const ex = Math.floor(fx), ey = Math.floor(fy);
    stamp(p, ['E...E', 'E...E', '.....', 'M...M', '.MMM.'], { E: '#140804', M: '#140804' }, ex - 2, ey - 2);
    p.set(ex - 3, ey + 1, hx('#ff7a60')); p.set(ex + 3, ey + 1, hx('#ff7a60'));
  }
  outline(p);
  if (ripe) { p.set(Math.floor(CX + 1) - 2, top - 2, 0xffffff); p.set(Math.floor(CX + 1) + 2, top - 2, 0xffffff); twinkle(p, 4, 7); }
  return p;
}
function pumpkin(ripe) {
  const H = ripe ? 27 : 20;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  for (let k = 0; k < 2; k++) {
    let x = 3 + k * 14, y = b + 2;
    for (let i = 0; i < 15; i++) {
      p.set(Math.round(x), Math.round(y), STEM[2 + (i % 2)]);
      x += 0.95; y = b + 2 - Math.abs(Math.sin(i * 0.6 + k)) * 2;
    }
  }
  const lv = ripe ? [[6, b - 5, 4.7], [27, b - 6, 4.9], [17, b - 10, 4.4]] : [[10, b - 4, 3.9], [23, b - 5, 4.1], [16, b - 7, 3.6]];
  for (const [x, y, r] of lv) {
    line(p, CX, b + 1, x, y + 1, (X2, Y2) => p.set(X2, Y2, STEM[2]));
    ball(p, x, y, r, r * 0.78, LEAF, { bias: 0.05, tex: 0.35, seed: x });
    for (const d of [0, 1, 2]) p.set(Math.round(x) - d, Math.round(y) - d, LEAF[3]);
  }
  if (ripe) {
    ball(p, 16.5, b - 1.2, 9.6, 6.6, PUMPKIN, { bias: 0.15, k: 1.55, rib: 3 });
    stamp(p, ['.sss', 'sS..', 'sS..', 'S...'], { s: '#7a6a34', S: '#4e4222' }, 16, b - 10);
    p.set(12, b - 4, PUMPKIN[5]); p.set(11, b - 3, PUMPKIN[5]);
  } else {
    ball(p, 12.5, b + 0.6, 3.4, 2.6, pals(['#1e2a14', '#344a1e', '#4e6a28', '#6e8a34', '#94aa4a', '#c0cc70']), { bias: 0.1, rib: 1.5 });
    stamp(p, ['y..y..y', '.yyYyy.', 'yyYoYyy', '.yYYYy.', '..yyy..'], { y: '#f8c010', Y: '#ffe86a', o: '#e88010' }, 19, b - 5);
  }
  outline(p);
  if (ripe) twinkle(p, 6, b - 6);
  return p;
}

// ===========================================================================
// crop_bed: a flat, top-down tilled plot drawn on the ground under every
// garden plant (26 x 26, centre anchored): plank frame, raked soil rows.
// ===========================================================================
function cropBed() {
  const N = 26;
  const p = new Px(N, N);
  const plank = pals(['#3a2216', '#5a3824', '#7e5434', '#a27248', '#c49462']);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, y, N - 1 - x, N - 1 - y);
      if (edge < 2) {
        // planks: lit on the top / left rails, a dark outer lip, wood grain
        const horiz = y < 2 || y > N - 3;
        let v = (y < 2 || x < 2 ? 0.45 : -0.15) - (edge === 0 ? 0.55 : 0) + (hash(horiz ? x >> 2 : y >> 2, horiz ? y : x, 12) - 0.5) * 0.4;
        if ((horiz ? x : y) % 9 === 0) v -= 0.45; // plank joints
        p.set(x, y, pick(plank, v));
        continue;
      }
      // soil rows: raised ridges (lit top edge) and dark furrows, crumbs
      const r = (y - 2) % 4;
      let v = r === 0 ? 0.45 : r === 1 ? 0.15 : r === 2 ? -0.2 : -0.75;
      v += (hash(x, y, 77) - 0.5) * 0.45;
      if (edge === 2) v -= 0.35; // shadow inside the frame
      p.set(x, y, pick(SOIL, v));
    }
  // pebbles, a sprinkle of straw, corner nails
  for (const [x, y] of [[6, 8], [18, 15], [11, 20], [20, 5]]) { p.set(x, y, hx('#c8bcb0')); p.set(x + 1, y, hx('#8a7e7a')); }
  for (const [x, y] of [[9, 4], [15, 12], [5, 17], [21, 19]]) { p.set(x, y, hx('#d8c070')); p.set(x + 1, y + 1, hx('#b09848')); }
  for (const [x, y] of [[1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2]]) p.set(x, y, hx('#c8ccd4'));
  return p;
}

// mushrooms coming: the bare log with pale pinhead caps poking out
function pinsLog() {
  const p = bareLog();
  const cap = pals(['#8a6a5a', '#c8a890', '#ecd6bc', '#fff4e4']);
  for (const [x, y] of [[13, 6], [16, 7], [27, 6], [30, 7]]) {
    p.set(x, y, cap[2]); p.set(x + 1, y, cap[1]); p.set(x, y - 1, cap[3]); p.set(x + 1, y - 1, cap[2]);
    p.set(x - 1, y, olc(cap[1], 0.6)); p.set(x + 2, y, olc(cap[0], 0.6)); p.set(x, y - 2, olc(cap[2], 0.6)); p.set(x + 1, y - 2, olc(cap[1], 0.6));
  }
  p.set(13, 5, 0xffffff);
  return p;
}

// ===========================================================================
// mushlog_bare: natureArt's mushLog(44, 20, 3131) minus every mushroom
// ===========================================================================
const MOSS = pals(['#1f3a22', '#2c5028', '#3e6a30', '#56853a', '#74a044', '#98bc58']);
function natOutline(p, o = {}) {
  const { k = 0.62, lit = 0.5, noBottom = false } = o;
  const add = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.any(x, y)) continue;
      let c = -1, amt = k;
      if (p.on(x, y + 1)) { c = p.get(x, y + 1); amt = lit; }
      else if (p.on(x + 1, y)) { c = p.get(x + 1, y); amt = lit + 0.05; }
      else if (p.on(x - 1, y)) { c = p.get(x - 1, y); amt = k; }
      else if (p.on(x, y - 1)) { if (noBottom) continue; c = p.get(x, y - 1); amt = k + 0.04; }
      if (c < 0) continue;
      add.push(x, y, olc(c, amt));
    }
  for (let i = 0; i < add.length; i += 3) p.set(add[i], add[i + 1], add[i + 2]);
  return p;
}
function logSprite(W, H, seed) {
  const p = new Px(W, H);
  const bark = pals(['#2a1c1e', '#3e2a28', '#553a30', '#6e4c3a', '#886046', '#a07654']);
  const wood = pals(['#8a6040', '#b08050', '#cda064', '#e4c080', '#f4dca0']);
  const r = (H - 2) / 2;
  const cy = 1 + r;
  const x0 = 1 + Math.ceil(r * 0.45), x1 = W - 2;
  for (let x = x0; x <= x1; x++) {
    const endTaper = x > x1 - 2 ? 1 : 0;
    for (let y = 1 + endTaper; y < H - 1 + (endTaper ? -1 : 1) && y < H; y++) {
      const ny = (y + 0.5 - cy) / r;
      const v = -ny * 0.75 + 0.1 - (x > x1 - 3 ? 0.2 : 0);
      const furrow = hash(Math.floor(x / 3 + hash(y, 0, seed) * 3), y, seed) < 0.3 ? -0.45 : 0;
      p.set(x, y, pick(bark, v + furrow + (hash(x, y, seed + 1) - 0.5) * 0.15));
    }
  }
  const ex = x0, ew = Math.max(2, r * 0.55);
  for (let y = 1; y < H; y++)
    for (let x = Math.floor(ex - ew - 1); x <= ex + ew; x++) {
      const nx = (x + 0.5 - ex) / ew, ny = (y + 0.5 - cy) / (r + 0.4);
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) continue;
      if (d > 0.82) { p.set(x, y, bark[1]); continue; }
      const ring = Math.floor(d * 4.2 + hash(x, y, seed) * 0.3) % 2;
      p.set(x, y, wood[clamp(Math.round(3 - ring - ny * 1.2 - nx * 0.5), 0, 4)]);
    }
  for (let x = x0 + 2; x < x1 - 1; x++) {
    if (hash(x >> 2, 3, seed) < 0.45) continue;
    const d = 1 + (hash(x, 4, seed) < 0.5 ? 1 : 0);
    for (let y = 1; y < 1 + d; y++) p.set(x, y, MOSS[clamp(4 - y + (hash(x, y, seed) < 0.3 ? 1 : 0), 0, 5)]);
  }
  for (let x = 0; x < W; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.35));
  natOutline(p, { noBottom: true });
  return p;
}
function spotsIn(p, n, R, box, minD = 5) {
  const out = [];
  const [x0, y0, x1, y1] = box;
  for (let k = 0; k < 400 && out.length < n; k++) {
    const x = Math.floor(x0 + R() * (x1 - x0)), y = Math.floor(y0 + R() * (y1 - y0));
    if (!p.on(x - 1, y - 1) || !p.on(x + 4, y + 1) || !p.on(x, y + 4) || !p.on(x + 3, y + 4)) continue;
    if (out.some(([a, b]) => Math.abs(a - x) < minD && Math.abs(b - y) < minD * 0.8)) continue;
    out.push([x, y]);
  }
  return out;
}
function bareLog() {
  const W = 44, H = 20, seed = 3131;
  const p = new Px(W, H);
  const R = mulberry(seed);
  p.blit(logSprite(W, H - 6, seed), 0, 6);
  const top = 7, bot = H - 1;
  for (let x = 6; x < W - 3; x++) {
    const d = 1 + Math.floor(hash(x >> 1, 2, seed) * 3);
    for (let y = top - 1; y < top - 1 + d; y++) if (p.any(x, y + 1) || y >= top) p.set(x, y, MOSS[clamp(5 - (y - top + 1) - (hash(x, y, seed) < 0.3 ? 1 : 0), 1, 5)]);
  }
  for (let i = 0; i < 3; i++) blade(p, W - 6 + i, top + 1, 4 + i, 2 - i * 0.5, 2, 1, pals(['#1c3e26', '#2c5a30', '#44803a', '#6fa84a', '#a6d072']));
  natOutline(p, { noBottom: true });
  for (const [x, y] of spotsIn(p, 2, R, [8, 4, W - 6, top + 3], 8)) dew(p, x, y);
  stamp(p, ['.kk.', 'kgGk', 'kGgk'], { k: '#141018', g: '#4ad08a', G: '#2a8a6a' }, Math.round(W * 0.55), bot - 4);
  return p;
}

// ===========================================================================
// Ready glint: a 4-point star that grows, flashes and fades (9 x 9)
// ===========================================================================
function glintFrames() {
  const W = 9, c = 4;
  const core = 0xffffff, warm = hx('#fff2a8'), gold = hx('#ffd04a');
  return [0, 1, 2, 3].map((f) => {
    const p = new Px(W, W);
    const arm = [1, 2, 4, 2][f];
    p.set(c, c, f === 0 ? warm : core);
    for (let r = 1; r <= arm; r++) {
      const col = r === arm ? gold : r === 1 ? core : warm;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(c + dx * r, c + dy * r, col);
    }
    if (f === 2) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) p.set(c + dx, c + dy, warm);
    if (f === 3) { p.set(c + 3, c - 3, gold); p.set(c - 3, c + 2, gold); }
    return p;
  });
}

// ===========================================================================
// Registry
// ===========================================================================
const VEG = { carrot, lettuce, radish, peas, potato, corn, sunflower, pumpkin };
export const CROP_ART = {
  carrot: { colors: ['#5a9c36', '#f4862a'] },
  lettuce: { colors: ['#6ea640', '#cceb88'] },
  radish: { colors: ['#428036', '#e8406a'] },
  peas: { colors: ['#548a36', '#6cb040'] },
  potato: { colors: ['#428036', '#c4a066'] },
  corn: { colors: ['#428036', '#f0c030'] },
  sunflower: { colors: ['#428036', '#ffd23a'] },
  pumpkin: { colors: ['#428036', '#f08a2a'] },
};
const OUT = {};
const once = (fn) => { let c = null; return () => (c ||= fn()).map((f) => ({ ...f, data: f.data.slice() })); };
OUT.crop_seed = once(() => [toRGBA(seedBed())]);
OUT.crop_sprout = once(() => [toRGBA(sproutBed())]);
OUT.crop_seed_water = once(() => [toRGBA(seedWater())]);
OUT.mushlog_bare = once(() => [toRGBA(bareLog())]);
OUT.mushlog_pins = once(() => [toRGBA(pinsLog())]);
OUT.crop_bed = once(() => { const p = cropBed(); return [toRGBA(p, p.w / 2, p.h / 2)]; });
for (const [id, fn] of Object.entries(VEG)) {
  OUT[`crop_${id}_grow`] = once(() => [toRGBA(fn(false))]);
  OUT[`crop_${id}_ripe`] = once(() => [toRGBA(fn(true))]);
  CROP_ART[id].grow = `crop_${id}_grow`;
  CROP_ART[id].ripe = `crop_${id}_ripe`;
}
OUT.crop_ready_glint = once(() => glintFrames().map((p) => toRGBA(p, p.w / 2, p.h / 2)));
export const EXTRA_SPRITES = OUT;
// drawing kit shared with plantStages.js (pure helpers, nothing built here)
export const PLANT_KIT = { Px, clamp, lerp, mulberry, hash, hx, mix, pals, pick, olc, INK, LX, LY, LZ, outline, natOutline, line, ellipse, ball, stamp, blade, leaf, dew, twinkle, toRGBA, mound, embed, ridge, BW, SOIL, LEAF, STEM, WOOD, POD };
