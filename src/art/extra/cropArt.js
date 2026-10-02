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
  const { k = 0.62, lit = 0.5, noBottom = true } = o;
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
// Palettes
// ===========================================================================
const SOIL = pals(['#2a1814', '#40261c', '#5a3826', '#7a4e32', '#9a6840', '#b88654', '#d2a46c']);
const LEAF = pals(['#142a1e', '#1c3c24', '#26522a', '#326830', '#428036', '#58983e', '#74b048', '#98c85c', '#c0de7c']);
const LEAF_LIGHT = pals(['#1e3a22', '#2c5228', '#3e6e2e', '#548a36', '#6ea640', '#8cc04e', '#acd664', '#cceb88', '#e8f8b0']);
const LEAF_BLUE = pals(['#14262a', '#1a3634', '#22483e', '#2e5c46', '#3c704e', '#4e8458', '#669a66', '#86b47c', '#acce98']);
const STEM = pals(['#1e3a1e', '#2e5428', '#447432', '#5e9440', '#80b054']);
const WOOD = pals(['#3a2418', '#5a3a26', '#7e5636', '#a07448', '#c49a64', '#e2c08c']);
const ORANGE = pals(['#5a1c0c', '#9a3a14', '#d8601c', '#f4862a', '#ffaa48', '#ffd27a']);
const RADISH = pals(['#3a0a20', '#7a1230', '#c0204a', '#e8406a', '#ff7a98', '#ffc0d0']);
const POTATO = pals(['#4a3020', '#76522e', '#a07a48', '#c4a066', '#e0c488', '#f4e2b0']);
const PUMPKIN = pals(['#4a1a10', '#8a3618', '#c8601e', '#f08a2a', '#ffb850', '#ffe090']);
const KERNEL = pals(['#6a4a10', '#b8861a', '#f0c030', '#ffde5a', '#fff2a0']);
const PETAL = pals(['#8a4a10', '#d07a18', '#f4aa22', '#ffd23a', '#ffec7a', '#fffac0']);
const POD = pals(['#1e3a1a', '#2e5a24', '#4a8a30', '#6cb040', '#98d060', '#c8ec90']);

// ===========================================================================
// The bed: a tilled mound shared by every stage
// ===========================================================================
const BW = 26; // canvas width of a bed sprite (the mound is ~20 px)
// mound occupies the bottom 5 rows of a canvas of height H
function mound(p, o = {}) {
  const H = p.h, cx = BW / 2, rx = 9.6, ry = 4.2;
  const top = (x) => ry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2));
  for (let x = 0; x < BW; x++) {
    const h = top(x);
    if (h < 0.6) continue;
    for (let y = Math.round(H - h); y < H; y++) {
      const nx = (x + 0.5 - cx) / rx, ny = 1 - (H - 0.5 - y) / h; // 0 top .. 1 bottom
      let v = 0.35 - nx * 0.55 - ny * 0.9;
      // furrow along the ridge where things are planted, crumbly clods
      if (y === Math.round(H - h) + 1 && Math.abs(nx) < 0.62) v -= 0.55;
      const r = hash(x, y, 4401);
      if (r < 0.14) v += 0.45;
      else if (r > 0.9) v -= 0.4;
      p.set(x, y, pick(SOIL, v));
    }
  }
  // a few pebbles and a darker contact row
  for (const [x, y] of [[5, H - 2], [18, H - 3]]) { p.set(x, y, hx('#b8aca0')); p.set(x + 1, y, hx('#857a76')); }
  for (let x = 0; x < BW; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.3));
  if (o.seeds) for (const x of [8, 12, 16]) { const y = H - 5; p.set(x, y, hx('#f0dca8')); p.set(x + 1, y, hx('#b89464')); }
  return p;
}
// the furrow row (plant base) of a bed of height H
const ridge = (H) => H - 4;
// a tiny wooden plant marker with a painted sign
function marker(p, x, yb, icon) {
  const sign = { W: '#ead8b2', w: '#c8b088', s: '#a8744e', S: '#6a4430' };
  stamp(p, ['WWWW', 'Wwww', '.s..', '.s..', '.S..'], sign, x, yb - 4);
  if (icon) stamp(p, icon, { g: '#5aa040', o: '#f08a2a', r: '#d8304a', y: '#f4c030', k: '#7a5236' }, x + 1, yb - 4);
}

// ===========================================================================
// Generic stages
// ===========================================================================
function seedBed() {
  const p = new Px(BW, 10);
  mound(p, { seeds: true });
  marker(p, 19, 7, ['kk']);
  outline(p);
  return p;
}
function sproutBed() {
  const p = new Px(BW, 14);
  mound(p);
  const b = ridge(14);
  // a curved stem and two round seed leaves, one each side
  blade(p, 13, b + 1, 4, -0.5, 0, 1, STEM);
  leaf(p, 12, b - 3, Math.PI + 0.35, 4.2, 1.5, LEAF_LIGHT, { bright: 0.15 });
  leaf(p, 13, b - 3, -0.3, 4.2, 1.5, LEAF_LIGHT, { bright: 0.25 });
  marker(p, 19, 11, ['g.']);
  outline(p);
  p.set(15, b - 4, 0xffffff); // a dew sparkle on the leaf
  return p;
}
// wild rice: a seed pod floating in a ring of ripples (shallow-water bed)
function seedWater() {
  const W = 26, H = 9;
  const p = new Px(W, H);
  const water = pals(['#14243a', '#1c3450', '#244a68', '#2e6280', '#3c7c98', '#5a9cb4', '#88c0d4', '#bfe2ee']);
  ellipse(p, W / 2, H - 3, 11.5, 3, (x, y, nx, ny) => pick(water, -0.1 - ny * 0.5 - nx * 0.2 + ((x * 3 + y) % 7 === 0 ? 0.3 : 0)));
  // ripple rings (light) around the pod
  for (const [rx, ry, v] of [[8.6, 2.3, 0.95], [5.2, 1.4, 0.75]])
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = Math.floor(W / 2 + Math.cos(a) * rx), y = Math.floor(H - 3 + Math.sin(a) * ry);
      if (p.on(x, y) && hash(x, y, 9) < 0.85) p.set(x, y, pick(water, v));
    }
  // the pod: a tan husk with a tiny green tip and its reflection
  stamp(p, ['..g', '.Hh', 'HHh', 'hh.'], { H: '#e8cc8a', h: '#a8844a', g: '#7cb848' }, W / 2 - 1, H - 6);
  p.set(W / 2 - 1, H - 2, hx('#5a7a6a'));
  p.set(W / 2, H - 2, hx('#4a6a64'));
  outline(p, { k: 0.5 });
  return p;
}

// ===========================================================================
// Vegetables
// ===========================================================================
// feathery carrot top: a thin stem with tiny forked sprigs (lots of air
// between them so it reads as lacy foliage, not a bush)
function fern(p, x0, y0, len, lean, pal, seed) {
  const [tx, ty] = blade(p, x0, y0, len, lean, lean * 0.4, 1, pal);
  const n = Math.round(len / 2);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 0.6);
    const x = Math.round(x0 + (tx - x0) * t), y = Math.round(y0 + (ty - y0) * t);
    const l = t < 0.75 ? 2 : 1;
    const v = 0.3 + t * 0.6;
    p.set(x - 1, y - 1, pick(pal, v + 0.2));
    p.set(x + 1, y - 1, pick(pal, v - 0.1));
    if (l > 1) { p.set(x - 2, y - 1 - (hash(i, seed, 3) < 0.5 ? 1 : 0), pick(pal, v + 0.3)); p.set(x + 2, y - 2, pick(pal, v)); }
  }
  p.set(Math.round(tx - 0.5), Math.round(ty - 0.5) - 1, pal[pal.length - 1]);
}
function carrot(ripe) {
  const H = ripe ? 24 : 17;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const L = pals(['#1a3a1c', '#2a5a24', '#3e7c2c', '#5a9c36', '#80bc48', '#a8d86a', '#d0f090']);
  const xs = ripe ? [7, 13, 19] : [8, 13, 18];
  xs.forEach((x, i) => {
    const len = ripe ? 12 + (i === 1 ? 4 : 0) : 6 + (i === 1 ? 2 : 0);
    for (const lean of ripe ? [-3, 0.5, 3] : [-1.5, 1.5]) fern(p, x, b + 1, len - Math.abs(lean) * 0.7, lean, L, 51 + i * 7 + lean);
  });
  if (ripe) {
    // orange shoulders peeking out of the soil, ridged
    for (const x of xs) {
      ball(p, x + 0.5, b + 2.4, 2.4, 1.9, ORANGE, { bias: 0.05 });
      p.set(x - 1, b + 2, ORANGE[5]);
      p.set(x + 1, b + 3, ORANGE[1]);
    }
  }
  outline(p);
  if (ripe) twinkle(p, 22, 8);
  return p;
}
function lettuce(ripe) {
  const H = ripe ? 18 : 13;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const cx = 13, rx = ripe ? 8.5 : 4.6, ry = ripe ? 6 : 3.4, cy = b + 1 - ry * 0.55;
  // outer leaves: darker, broad, splayed; inner: pale, crinkled, cupped
  const n = ripe ? 9 : 6;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (i / (n - 1)) * Math.PI;
    leaf(p, cx + Math.cos(a) * 1.2, cy + 1, a, rx * 0.95, ripe ? 2.6 : 1.7, LEAF, { frill: true, bright: -0.05 });
  }
  ball(p, cx, cy, rx * 0.62, ry * 0.75, LEAF_LIGHT, { bias: -0.05, tex: 0.5, seed: 9 });
  // crinkle: curved lighter leaf edges spiralling in the heart
  const r2 = ripe ? 3 : 1.6;
  for (let a = 0; a < Math.PI * 2; a += 0.6) {
    const x = Math.round(cx + Math.cos(a) * r2), y = Math.round(cy + Math.sin(a) * r2 * 0.6);
    p.set(x, y, LEAF_LIGHT[7]);
    p.set(x + 1, y, LEAF_LIGHT[3]);
  }
  p.set(cx, Math.round(cy - 1), LEAF_LIGHT[8]);
  outline(p);
  if (ripe) { dew(p, cx - 4, Math.round(cy - 2)); twinkle(p, 20, 4); }
  return p;
}
function radish(ripe) {
  const H = ripe ? 20 : 15;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const xs = ripe ? [7, 13, 19] : [8, 13, 18];
  xs.forEach((x, i) => {
    const len = ripe ? 8 + (i === 1 ? 2 : 0) : 5 + (i === 1 ? 1 : 0);
    // a rosette of oval leaves on red-tinged stalks
    for (const [a, l] of [[-Math.PI / 2 - 0.75, len], [-Math.PI / 2 + 0.7, len * 0.9], [-Math.PI / 2 - 0.05, len * 1.05]]) {
      line(p, x, b + 1, x + Math.cos(a) * l * 0.4, b + 1 + Math.sin(a) * l * 0.4, (X, Y) => p.set(X, Y, hx('#a83a4a')));
      leaf(p, x + Math.cos(a) * l * 0.3, b + 1 + Math.sin(a) * l * 0.3, a, l * 0.75, ripe ? 2.1 : 1.5, LEAF, { bright: 0.1 });
    }
  });
  if (ripe) for (const x of xs) {
    ball(p, x + 0.5, b + 2.3, 2.6, 2.3, RADISH, { bias: 0.0 });
    p.set(x - 1, b + 1, RADISH[5]);
    p.set(x, b + 4, hx('#f6eef0')); // white root tip
  }
  outline(p);
  if (ripe) twinkle(p, 4, 7);
  return p;
}
function peas(ripe) {
  const H = ripe ? 28 : 22;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  // twig trellis: two stakes and twine rungs
  const top = ripe ? 3 : 6;
  for (const x of [6, 19]) {
    line(p, x, b + 2, x + (x < 12 ? 1 : -1), top, (X, Y) => { p.set(X, Y, WOOD[3]); p.set(X + 1, Y, WOOD[1]); });
    p.set(x + (x < 12 ? 1 : -1), top - 1, WOOD[4]);
  }
  for (let y = top + 3; y < b - 1; y += 4) line(p, 7, y, 19, y + 1, (X, Y) => p.set(X, Y, hx('#e2d2a8')));
  // vines climbing: wobbly stems with round leaves and curly tendrils
  const vines = ripe ? [[9, 0], [13, 1], [17, 2]] : [[10, 0], [15, 2]];
  for (const [vx, ph] of vines) {
    const h = ripe ? b - top - 1 : (b - top) * 0.65;
    let px = vx, py = b + 1;
    for (let s = 0; s <= h; s++) {
      const x = vx + Math.sin(s * 0.55 + ph) * 1.6, y = b + 1 - s;
      line(p, px, py, x, y, (X, Y) => p.set(X, Y, STEM[3]));
      px = x; py = y;
      if (s % 3 === 1) leaf(p, x, y, Math.sin(s + ph) > 0 ? -0.4 : Math.PI + 0.4, 3.2, 1.4, LEAF_LIGHT, { bright: 0.05 });
      if (s % 5 === 3) { p.set(x + 1, y - 1, STEM[4]); p.set(x + 2, y - 2, STEM[4]); p.set(x + 3, y - 2, STEM[3]); }
    }
  }
  if (ripe) {
    // fat pods hanging off the vines (bumpy with peas) and a white flower
    for (const [x, y] of [[8, b - 9], [14, b - 5], [17, b - 13], [11, b - 15]]) {
      stamp(p, ['.lmm.', 'lbmbm', 'dbdbd', '.ddd.'], { l: POD[5], m: POD[4], b: POD[3], d: POD[1] }, x, y);
    }
    stamp(p, ['.w.', 'wyw', '.w.'], { w: '#fffaf4', y: '#f0d050' }, 18, b - 18);
  }
  outline(p);
  if (ripe) twinkle(p, 4, 8);
  return p;
}
// a bushy clump of small leaves (potato / pumpkin leaves)
function bush(p, cx, cy, rx, ry, pal, seed, n) {
  const R = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R());
    const x = cx + Math.cos(a) * rx * r * 0.8, y = cy + Math.sin(a) * ry * r * 0.8;
    ball(p, x, y, 2.2 + R() * 0.8, 1.8 + R() * 0.6, pal, { bias: 0.1 + (y - cy) / ry * 0.35, tex: 0.3, seed: seed + i });
  }
}
function potato(ripe) {
  const H = ripe ? 21 : 16;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  for (const [x, l] of [[10, ripe ? 9 : 5], [13, ripe ? 11 : 7], [16, ripe ? 9 : 5]]) blade(p, x, b + 1, l, (x - 13) * 0.4, 0, 2, STEM);
  if (ripe) {
    // potatoes peeking out of the soil at the base
    for (const [x, y] of [[6, b + 2], [18, b + 1.8]]) {
      ball(p, x, y, 2.3, 1.6, POTATO, { bias: 0.05, tex: 0.3, seed: x });
      p.set(Math.round(x) - 1, Math.round(y), POTATO[1]);
    }
  }
  bush(p, 13, b - (ripe ? 7 : 4), ripe ? 8 : 5, ripe ? 4.5 : 3, LEAF, 61, ripe ? 16 : 9);
  if (ripe) {
    // star flowers, white and lilac, with yellow eyes
    for (const [x, y, c] of [[8, b - 11, '#f8f4ff'], [15, b - 13, '#c8a4ec'], [19, b - 8, '#f8f4ff'], [11, b - 6, '#c8a4ec']])
      stamp(p, ['.w.', 'wyw', '.w.'], { w: c, y: '#f4c830' }, x, y);
  }
  outline(p);
  if (ripe) twinkle(p, 4, 9);
  return p;
}
function corn(ripe) {
  const H = ripe ? 40 : 25;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const stalks = ripe ? [[9, 31, -0.8], [16, 34, 0.8]] : [[10, 17, -0.6], [16, 19, 0.6]];
  for (const [x, h, lean] of stalks) {
    blade(p, x, b + 1, h, lean, 0, 2, STEM);
    // long arching leaves alternating sides
    // long ribbon leaves arching out and drooping, alternating sides
    const leaves = ripe ? [[0.2, 12, 1.1], [0.42, 11, 0.95], [0.64, 9, 1.05]] : [[0.25, 9, 1.05], [0.55, 8, 0.95]];
    leaves.forEach(([t, len, up], k) => {
      const yy = b + 1 - h * t, xx = x + lean * t;
      const s = (k + (lean > 0 ? 1 : 0)) % 2 ? 1 : -1;
      leaf(p, xx, yy, s > 0 ? -up : Math.PI + up, len, 0.75, LEAF, { droop: len * 0.75, bright: 0.1, fat: 1.0 });
    });
    if (ripe) {
      // tassel on top
      const tx = x + lean, ty = b + 1 - h;
      for (const dx of [-2, 0, 2]) line(p, tx, ty, tx + dx, ty - 3, (X, Y) => p.set(X, Y, hx('#d8b860')));
      p.set(tx, ty - 4, hx('#f0d890'));
    }
  }
  if (ripe) {
    // ears: green husk, golden kernels peeking out, pink-tan silk
    for (const [x, y, s] of [[11, b - 15, 1], [14, b - 21, -1]]) {
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 3; i++) {
          const kern = j > 0 && j < 6 && i === (s > 0 ? 2 : 0);
          p.set(x + i, y + j, kern ? KERNEL[(i + j) % 2 ? 3 : 2] : POD[i === 1 ? 4 : 2]);
        }
      for (let j = 1; j < 6; j++) p.set(x + 1, y + j, j % 2 ? KERNEL[4] : KERNEL[3]);
      line(p, x + 1, y - 1, x + 1 + s * 2, y - 3, (X, Y) => p.set(X, Y, hx('#e8a87a')));
      p.set(x + 1, y - 1, hx('#c8805a'));
    }
  }
  outline(p);
  if (ripe) twinkle(p, 20, 13);
  return p;
}
function sunflower(ripe) {
  const H = ripe ? 38 : 28;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const cx = 13, top = ripe ? 11 : 6;
  blade(p, cx, b + 1, b + 1 - top, ripe ? 0.5 : 0, 0, 2, STEM);
  for (const [y, s] of [[b - 4, -1], [b - 10, 1], [b - 16, -1]]) if (y > top + 3) leaf(p, cx, y, s > 0 ? -0.45 : Math.PI + 0.45, 6, 2.4, LEAF, { droop: 1.2, bright: 0.05 });
  if (!ripe) {
    // a fat green bud with pointed sepals and a peek of yellow
    ball(p, cx, top, 2.8, 2.6, POD, { bias: 0.05 });
    for (const [dx, dy] of [[-3, -1], [3, -1], [0, -3], [-2, -3], [2, -3]]) p.set(cx + dx, top + dy, POD[2]);
    p.set(cx, top - 3, PETAL[3]);
    p.set(cx - 1, top - 2, PETAL[4]);
  } else {
    const fy = top, fx = cx + 1;
    // petal ring
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (let r = 3.4; r < 7.6; r += 0.5) {
        const w = Math.sin(((r - 3.4) / 4.2) * Math.PI) * 0.22;
        for (const da of [-w, 0, w]) {
          const x = fx + Math.cos(a + da) * r, y = fy + Math.sin(a + da) * r * 0.92;
          p.set(Math.floor(x), Math.floor(y), pick(PETAL, 0.35 - Math.cos(a) * 0.3 - Math.sin(a) * 0.4 + (r > 6.5 ? 0.2 : 0) - (k & 1) * 0.25));
        }
      }
    }
    // seed disk with a happy face
    const disk = pals(['#2a140c', '#4a2814', '#6a3c1c', '#8a5428', '#a87036']);
    ellipse(p, fx, fy, 3.9, 3.6, (x, y, nx, ny) => pick(disk, 0.25 - nx * 0.4 - ny * 0.5 + ((x + y) % 2 ? 0.15 : -0.1)));
    stamp(p, ['E.E', '...', 'M.M', '.M.'], { E: '#1a0c08', M: '#1a0c08' }, Math.floor(fx) - 1, Math.floor(fy) - 2);
    p.set(Math.floor(fx) - 1, Math.floor(fy) - 2, hx('#1a0c08'));
    p.set(Math.floor(fx) - 2, Math.floor(fy), hx('#ff8a6a')); // rosy cheeks
    p.set(Math.floor(fx) + 2, Math.floor(fy), hx('#ff8a6a'));
  }
  outline(p);
  if (ripe) {
    p.set(cx, top - 2, 0xffffff); // eye glints
    p.set(cx + 2, top - 2, 0xffffff);
    twinkle(p, 4, 6);
  }
  return p;
}
function pumpkin(ripe) {
  const H = ripe ? 20 : 15;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  // curly vines over the bed
  for (let k = 0; k < 2; k++) {
    let x = 3 + k * 10, y = b + 2;
    for (let i = 0; i < 12; i++) {
      p.set(Math.round(x), Math.round(y), STEM[2 + (i % 2)]);
      x += 0.9; y = b + 2 - Math.abs(Math.sin(i * 0.7 + k)) * 1.6;
    }
  }
  // broad lobed leaves on stalks behind
  const lv = ripe ? [[5, b - 4, 3.6], [20, b - 5, 3.8], [13, b - 7, 3.4]] : [[8, b - 3, 3], [17, b - 4, 3.2], [12, b - 5, 2.8]];
  for (const [x, y, r] of lv) {
    line(p, 13, b + 1, x, y + 1, (X, Y) => p.set(X, Y, STEM[2]));
    ball(p, x, y, r, r * 0.78, LEAF, { bias: 0.05, tex: 0.35, seed: x });
    p.set(Math.round(x), Math.round(y), LEAF[3]);
    p.set(Math.round(x) - 1, Math.round(y) - 1, LEAF[3]);
  }
  if (ripe) {
    ball(p, 12.5, b - 0.2, 7.2, 4.8, PUMPKIN, { bias: 0.2, k: 1.5, rib: 2.5 });
    // curly stem
    stamp(p, ['.ss', 's..', 'S..'], { s: '#7a6a3a', S: '#5a4a2a' }, 12, b - 7);
    p.set(9, b - 2, PUMPKIN[5]);
  } else {
    // a little green pumpkin and a big yellow flower
    ball(p, 9.5, b + 0.6, 2.6, 2, pals(['#1e2a14', '#344a1e', '#4e6a28', '#6e8a34', '#94aa4a', '#c0cc70']), { bias: 0.1, rib: 1.5 });
    stamp(p, ['y.y.y', '.yYy.', 'yYoYy', '.yyy.'], { y: '#f4c030', Y: '#ffe070', o: '#e08a20' }, 15, b - 3);
  }
  outline(p);
  if (ripe) twinkle(p, 6, b - 4);
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
for (const [id, fn] of Object.entries(VEG)) {
  OUT[`crop_${id}_grow`] = once(() => [toRGBA(fn(false))]);
  OUT[`crop_${id}_ripe`] = once(() => [toRGBA(fn(true))]);
  CROP_ART[id].grow = `crop_${id}_grow`;
  CROP_ART[id].ripe = `crop_${id}_ripe`;
}
OUT.crop_ready_glint = once(() => glintFrames().map((p) => toRGBA(p, p.w / 2, p.h / 2)));
export const EXTRA_SPRITES = OUT;
