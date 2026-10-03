// Ground paints for the Terraform tool that the base terrain atlas doesn't
// have: a flower meadow and a velvety moss. Same format as terrainArt.js:
// 48x48 texels per tile (2x2 world tiles at 24 texels per unit), seamless in
// both directions (periodic noise, stamps wrap). Gentle contrast because the
// engine lights the terrain.
//
// buildPaintAtlas() renders on first call and caches: tiles sit side by side
// in a 96x48 canvas, in PAINT_TILES order (the terrain shader indexes them).

const T = 48;
export const PAINT_TILES = ['flowers', 'moss'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hx = (s) => parseInt(s.replace('#', ''), 16);
const cr = (c) => (c >> 16) & 255, cg = (c) => (c >> 8) & 255, cb = (c) => c & 255;
const rgb = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);
const mix = (a, b, t) => rgb(lerp(cr(a), cr(b), t), lerp(cg(a), cg(b), t), lerp(cb(a), cb(b), t));
const pals = (arr) => arr.map(hx);

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
const wrap = (v) => ((v % T) + T) % T;
function vnoise(x, y, cells, seed) {
  const f = cells / T;
  const gx = x * f, gy = y * f;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i, j) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy);
}
function fbm(x, y, seed, oct = [[4, 0.55], [8, 0.3], [16, 0.15]]) {
  let v = 0, n = 0;
  for (const [cells, w] of oct) { v += vnoise(x, y, cells, seed + cells) * w; n += w; }
  return v / n;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

class Tex {
  constructor() { this.c = new Int32Array(T * T); }
  get(x, y) { return this.c[wrap(y) * T + wrap(x)]; }
  set(x, y, c) { this.c[wrap(Math.floor(y)) * T + wrap(Math.floor(x))] = c; }
  blend(x, y, c, t) { this.set(x, y, mix(this.get(x, y), c, t)); }
}
function base(tex, pal, seed, { oct, dither = 0.55, spread = 1 } = {}) {
  const n = pal.length;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let v = fbm(x, y, seed, oct);
      v = 0.5 + (v - 0.5) * 2.2 * spread;
      v += bayer(x, y) * dither / n * 2 + (hash(x, y, seed + 9) - 0.5) * 0.08;
      tex.set(x, y, pal[clamp(Math.floor(v * n), 0, n - 1)]);
    }
}
function scatter(count, seed, fn) {
  const R = mulberry(seed);
  for (let i = 0; i < count; i++) fn(Math.floor(R() * T), Math.floor(R() * T), R);
}
function blade(tex, x, y, len, pal, lean = 0) {
  for (let k = 0; k < len; k++) {
    const t = k / Math.max(1, len - 1);
    tex.set(x + Math.round(lean * t), y - k, pal[clamp(Math.round(t * (pal.length - 1)), 0, pal.length - 1)]);
  }
}

const TILES = {
  // lush spring grass full of little flowers in drifts: daisies, buttercups,
  // clover heads and lupine spikes, each with a dark leafy shadow under it
  flowers() {
    const t = new Tex();
    const P = pals(['#5f9036', '#67993a', '#6fa13e', '#78a943', '#81b148']);
    base(t, P, 211, { oct: [[2, 0.35], [4, 0.3], [8, 0.2], [16, 0.15]], spread: 0.75 });
    const blades = pals(['#55833a', '#6c9e3c', '#8aba4c', '#a2c85a']);
    scatter(120, 212, (x, y, R) => blade(t, x, y, 2 + Math.floor(R() * 2), blades, R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0));
    const shadow = hx('#3e6a2a');
    // drifts: flowers cluster where a low-frequency noise is high
    const drift = (x, y) => fbm(x, y, 213, [[3, 0.6], [6, 0.4]]);
    const kinds = [
      // daisy: white petals around a yellow eye
      (x, y) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) t.set(x + dx, y + dy, hx('#f6f2e4')); t.set(x, y, hx('#f2c43a')); t.set(x + 1, y + 1, hx('#d8d4c8')); t.blend(x, y + 2, shadow, 0.45); t.blend(x + 1, y + 2, shadow, 0.3); },
      // buttercup: two warm yellow pixels with a lit tip
      (x, y) => { t.set(x, y, hx('#f6d23a')); t.set(x + 1, y, hx('#e0a824')); t.set(x, y - 1, hx('#fff2a0')); t.blend(x, y + 1, shadow, 0.45); },
      // pink clover head
      (x, y) => { t.set(x, y, hx('#f0a0c0')); t.set(x + 1, y, hx('#d87aa4')); t.set(x, y - 1, hx('#ffd0e0')); t.set(x + 1, y + 1, hx('#3f7a30')); t.blend(x, y + 1, shadow, 0.45); },
      // lupine spike: purple, three tall
      (x, y) => { t.set(x, y - 2, hx('#c8a8f0')); t.set(x, y - 1, hx('#9a78d8')); t.set(x, y, hx('#7a58b8')); t.set(x + 1, y, hx('#4a7a34')); t.blend(x, y + 1, shadow, 0.5); },
      // tiny blue forget-me-not
      (x, y) => { t.set(x, y, hx('#8ac0f0')); t.set(x + 1, y, hx('#6a9ad8')); t.set(x, y + 1, hx('#f2e070')); t.blend(x + 1, y + 1, shadow, 0.4); },
    ];
    const R = mulberry(214);
    let placed = 0;
    for (let i = 0; i < 900 && placed < 46; i++) {
      const x = Math.floor(R() * T), y = Math.floor(R() * T);
      if (drift(x, y) < 0.42 + R() * 0.2) continue;
      const w = R();
      kinds[w < 0.34 ? 0 : w < 0.56 ? 1 : w < 0.74 ? 2 : w < 0.88 ? 3 : 4](x, y);
      placed++;
    }
    // a scatter of loose petals and specks between the drifts
    scatter(16, 215, (x, y, R2) => t.set(x, y, R2() < 0.5 ? hx('#f4f0e0') : R2() < 0.5 ? hx('#f2d24a') : hx('#e8a0c0')));
    return t;
  },
  // deep, velvety moss: cushions with lit tops and shaded undersides, star
  // moss specks, red-brown spore stalks and the odd half-buried pebble
  moss() {
    const t = new Tex();
    const P = pals(['#2c5528', '#33602c', '#3a6b30', '#427635', '#4b823b']);
    base(t, P, 221, { oct: [[4, 0.3], [8, 0.4], [16, 0.3]], spread: 0.7, dither: 0.8 });
    // cushions
    const R = mulberry(222);
    for (let i = 0; i < 26; i++) {
      const cx = Math.floor(R() * T), cy = Math.floor(R() * T), r = 1.6 + R() * 2.4;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          const d = Math.hypot(dx, dy * 1.15);
          if (d > r) continue;
          // light from the top-left: brighter on that side of the bump
          const lit = (-dx - dy) / (r * 1.4) + bayer(cx + dx, cy + dy) * 0.5;
          const c = d > r - 0.9 && dx + dy > 0 ? hx('#24481f') : lit > 0.45 ? hx('#68a04a') : lit > 0.05 ? hx('#55903f') : hx('#477e37');
          t.set(cx + dx, cy + dy, c);
        }
    }
    // star moss specks
    scatter(60, 223, (x, y, R2) => { t.set(x, y, R2() < 0.6 ? hx('#86b856') : hx('#a2c862')); if (R2() < 0.3) t.set(x + 1, y, hx('#6ea44a')); });
    // spore stalks: a thin red-brown stem with a pale capsule
    scatter(14, 224, (x, y) => { t.set(x, y, hx('#7a3a26')); t.set(x, y - 1, hx('#9a4a2e')); t.set(x, y - 2, hx('#d8b070')); t.blend(x + 1, y + 1, hx('#1e3a1a'), 0.4); });
    // half-buried pebbles with moss creeping over them
    scatter(4, 225, (x, y) => {
      t.set(x, y, hx('#a8a49c')); t.set(x + 1, y, hx('#8e8a84')); t.set(x, y + 1, hx('#7a766e')); t.set(x + 1, y + 1, hx('#6a665e'));
      t.set(x + 1, y - 1, hx('#5a8e40')); t.blend(x + 2, y + 2, hx('#1e3a1a'), 0.4);
    });
    return t;
  },
};

let ATLAS = null;
// -> { canvas, tiles: { name: { x, y, w, h } } }
export function buildPaintAtlas() {
  if (ATLAS) return ATLAS;
  const W = T * PAINT_TILES.length;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = T;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, T);
  const tiles = {};
  PAINT_TILES.forEach((name, k) => {
    let tex;
    try { tex = TILES[name](); } catch (e) { console.error('paintArt', name, e); tex = new Tex(); }
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const c = tex.get(x, y), o = (y * W + k * T + x) * 4;
        img.data[o] = cr(c); img.data[o + 1] = cg(c); img.data[o + 2] = cb(c); img.data[o + 3] = 255;
      }
    tiles[name] = { x: k * T, y: 0, w: T, h: T };
  });
  ctx.putImageData(img, 0, 0);
  ATLAS = { canvas, tiles };
  return ATLAS;
}
