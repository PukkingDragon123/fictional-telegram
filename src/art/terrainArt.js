// Seamless top-down terrain textures for "The Bear Must Eat".
//
// Every tile is 48x48 texels = 2x2 world tiles at 24 texels per unit, and
// tiles in both directions (all noise is periodic and every detail stamp wraps
// around the edges). Contrast is kept gentle because the engine lights the
// terrain and characters stand in front of it. Average colours sit close to
// the old per-kind vertex colours so the lighting balance stays the same.
//
// buildTerrainAtlas() renders everything on first call and caches it. Each
// tile sits in a 64x64 slot with an 8px gutter that continues the wrapped
// texture, so linear filtering / mipmaps at the tile edge never bleed; the
// returned rect is the 48x48 core.

const T = 48; // tile size (texels)
const GUT = 8; // wrapped gutter around each tile in the atlas

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
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

// Periodic value noise: `cells` lattice cells across the tile (must divide
// into the tile evenly for a seamless result), smooth-step interpolated.
function vnoise(x, y, cells, seed) {
  const f = cells / T;
  const gx = x * f, gy = y * f;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const tx = gx - x0, ty = gy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const h = (i, j) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}
function fbm(x, y, seed, oct = [[4, 0.55], [8, 0.3], [16, 0.15]]) {
  let v = 0, n = 0;
  for (const [cells, w] of oct) {
    v += vnoise(x, y, cells, seed + cells) * w;
    n += w;
  }
  return v / n;
}
// 4x4 Bayer matrix (tiles seamlessly: 48 is a multiple of 4)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

class Tex {
  constructor() {
    this.c = new Int32Array(T * T);
  }
  get(x, y) {
    return this.c[wrap(y) * T + wrap(x)];
  }
  set(x, y, c) {
    this.c[wrap(Math.floor(y)) * T + wrap(Math.floor(x))] = c;
  }
  blend(x, y, c, t) {
    this.set(x, y, mix(this.get(x, y), c, t));
  }
}

// Base layer: fbm value picks a colour from `pal` (dark -> light), dithered.
function base(tex, pal, seed, o = {}) {
  const { oct, dither = 0.55, bias = 0, spread = 1 } = o;
  const n = pal.length;
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let v = fbm(x, y, seed, oct);
      v = 0.5 + (v - 0.5) * 2.2 * spread + bias;
      v += bayer(x, y) * dither / n * 2 + (hash(x, y, seed + 9) - 0.5) * 0.08;
      tex.set(x, y, pal[clamp(Math.floor(v * n), 0, n - 1)]);
    }
}

// Scatter helper: calls fn(x, y, rnd) `count` times at random positions.
function scatter(count, seed, fn) {
  const R = mulberry(seed);
  for (let i = 0; i < count; i++) fn(Math.floor(R() * T), Math.floor(R() * T), R);
}

// Short grass blade: dark root, light tip (vertical, slight lean).
function blade(tex, x, y, len, pal, lean = 0) {
  for (let k = 0; k < len; k++) {
    const t = k / Math.max(1, len - 1);
    tex.set(x + Math.round(lean * t), y - k, pal[clamp(Math.round(t * (pal.length - 1)), 0, pal.length - 1)]);
  }
}
// Small round pebble with a highlight and a soft shadow below-right.
function pebble(tex, x, y, pal, big = false) {
  const [sh, dk, md, lt] = pal;
  tex.blend(x + 1, y + 2, sh, 0.35);
  tex.blend(x + 2, y + 1, sh, 0.35);
  tex.set(x, y, lt);
  tex.set(x + 1, y, md);
  tex.set(x, y + 1, md);
  tex.set(x + 1, y + 1, dk);
  if (big) {
    tex.set(x + 2, y, md);
    tex.set(x + 2, y + 1, dk);
    tex.set(x, y + 2, dk);
    tex.set(x + 1, y + 2, dk);
    tex.blend(x + 3, y + 2, sh, 0.35);
    tex.blend(x + 2, y + 3, sh, 0.35);
  }
}
function leafSpeck(tex, x, y, c, d) {
  tex.set(x, y, c);
  tex.set(x + 1, y, c);
  tex.set(x, y + 1, d);
}
function twig(tex, x, y, len, ang, c, hi) {
  for (let k = 0; k < len; k++) {
    const px = x + Math.round(Math.cos(ang) * k), py = y + Math.round(Math.sin(ang) * k);
    tex.set(px, py, c);
    if (hi && k % 3 === 1) tex.set(px, py - 1, hi);
  }
}

// ---------------------------------------------------------------------------
// tiles
// ---------------------------------------------------------------------------
const TILES = {
  grass() {
    const t = new Tex();
    const P = pals(['#5e8b35', '#658f38', '#6c963c', '#739d40', '#7ba444']);
    base(t, P, 11, { oct: [[2, 0.35], [4, 0.3], [8, 0.2], [16, 0.15]], spread: 0.75 });
    const blades = pals(['#557f31', '#6a9a3a', '#86b24a', '#9cc056']);
    scatter(150, 12, (x, y, R) => blade(t, x, y, 2 + Math.floor(R() * 2), blades, R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0));
    // clover patches
    const clover = pals(['#4f8a38', '#5f9c40', '#76b050']);
    scatter(5, 13, (x, y) => {
      for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [3, 2], [4, 1]]) {
        t.set(x + dx, y + dy, clover[1]);
        t.set(x + dx + 1, y + dy, clover[0]);
      }
      t.set(x, y, clover[2]);
      t.set(x + 3, y + 2, clover[2]);
    });
    // tiny flower specks
    scatter(7, 14, (x, y, R) => {
      const c = R() < 0.5 ? hx('#f4f0e0') : R() < 0.5 ? hx('#f2d24a') : hx('#e8a0c0');
      t.set(x, y, c);
      t.blend(x, y + 1, hx('#3e6a2a'), 0.4);
    });
    return t;
  },
  grass_autumn() {
    const t = new Tex();
    const P = pals(['#848a36', '#8e923a', '#98993e', '#a2a142', '#aca848']);
    base(t, P, 21, { oct: [[3, 0.5], [6, 0.3], [12, 0.2]], spread: 0.9 });
    const blades = pals(['#7a7e32', '#96943c', '#b2ac4c', '#c8bf62']);
    scatter(130, 22, (x, y, R) => blade(t, x, y, 2 + Math.floor(R() * 2), blades, R() < 0.3 ? (R() < 0.5 ? -1 : 1) : 0));
    const green = pals(['#6e8a36', '#7c9a3c']);
    scatter(40, 23, (x, y, R) => blade(t, x, y, 2, green, 0));
    const leaves = [['#c8502e', '#9a3a26'], ['#e0862e', '#b0601e'], ['#e8b838', '#b88a26'], ['#9a6a3a', '#744c2a']];
    scatter(12, 24, (x, y, R) => {
      const [a, b] = leaves[Math.floor(R() * leaves.length)];
      leafSpeck(t, x, y, hx(a), hx(b));
    });
    return t;
  },
  dirt() {
    const t = new Tex();
    const P = pals(['#765838', '#7f603e', '#886744', '#916f4a', '#9a7851']);
    base(t, P, 31, { oct: [[4, 0.45], [8, 0.35], [24, 0.2]] });
    // clods: darker blobs with a lit upper-left pixel
    scatter(26, 32, (x, y) => {
      t.set(x, y, hx('#6a4e32'));
      t.set(x + 1, y, hx('#6e5234'));
      t.set(x, y - 1, hx('#a48258'));
    });
    const peb = pals(['#5a4632', '#7c7470', '#a09690', '#c8bcb0']);
    scatter(9, 33, (x, y, R) => pebble(t, x, y, peb, R() < 0.3));
    // fine roots
    scatter(2, 34, (x, y, R) => twig(t, x, y, 5 + Math.floor(R() * 4), R() * 6.28, hx('#5e4430')));
    return t;
  },
  sand() {
    const t = new Tex();
    const P = pals(['#bca46e', '#c3ab74', '#cab27a', '#d1b981', '#d8c088']);
    base(t, P, 41, { oct: [[4, 0.4], [8, 0.35], [16, 0.25]], dither: 0.9 });
    // grain
    scatter(90, 42, (x, y, R) => t.blend(x, y, R() < 0.5 ? hx('#a89060') : hx('#e8d4a0'), 0.55));
    // ripple lines left by water, gentle
    for (let y = 0; y < T; y += 8)
      for (let x = 0; x < T; x++) {
        const yy = y + Math.round(Math.sin((x / T) * Math.PI * 4 + y) * 1.5);
        if (hash(x, y, 43) < 0.7) t.blend(x, yy, hx('#b09866'), 0.28);
      }
    const peb = pals(['#9a8660', '#8a8488', '#aca6a6', '#d4ccc6']);
    scatter(5, 44, (x, y, R) => pebble(t, x, y, peb, R() < 0.3));
    // shell / twig bits
    scatter(3, 45, (x, y) => {
      t.set(x, y, hx('#f4ece0'));
      t.set(x + 1, y, hx('#e0d0c0'));
    });
    return t;
  },
  pondfloor() {
    const t = new Tex();
    const P = pals(['#7a7050', '#827855', '#8a7f5a', '#92875f', '#9a8e64']);
    base(t, P, 51, { oct: [[4, 0.5], [8, 0.3], [16, 0.2]] });
    const peb = pals(['#5e5640', '#7e7a70', '#9e9890', '#c0b8ae']);
    scatter(12, 52, (x, y, R) => pebble(t, x, y, peb, R() < 0.35));
    scatter(4, 53, (x, y, R) => twig(t, x, y, 4 + Math.floor(R() * 4), R() * 6.28, hx('#5a4a30'), hx('#8a7650')));
    // little water-plant sprouts
    scatter(5, 54, (x, y) => {
      t.set(x, y, hx('#4a7a3a'));
      t.set(x, y - 1, hx('#6a9a44'));
      t.set(x + 1, y - 2, hx('#8ab456'));
      t.set(x - 1, y - 1, hx('#5a8a3e'));
    });
    return t;
  },
  cliff() {
    // vertical granite face: horizontal strata ledges (lit tops, shaded
    // undersides), vertical cracks, moss and lichen on the ledges
    const t = new Tex();
    const P = pals(['#625a5a', '#6a6262', '#726a68', '#7a716e', '#837a76']);
    base(t, P, 61, { oct: [[2, 0.4], [4, 0.35], [12, 0.25]], dither: 0.7 });
    const ledges = [3, 15, 27, 39];
    for (const ly of ledges)
      for (let x = 0; x < T; x++) {
        const off = Math.round(Math.sin((x / T) * Math.PI * 2 + ly) * 1.2 + Math.sin((x / T) * Math.PI * 6 + ly * 3) * 0.6);
        const y = ly + off;
        t.set(x, y, hx('#9a908a'));
        if (hash(x, ly, 62) < 0.6) t.set(x, y - 1, hx('#8e8480'));
        t.set(x, y + 1, hx('#524a4c'));
        if (hash(x, ly, 63) < 0.5) t.set(x, y + 2, hx('#5c5456'));
      }
    // vertical cracks between ledges
    scatter(9, 64, (x, y, R) => {
      const len = 5 + Math.floor(R() * 7);
      let cx = x;
      for (let k = 0; k < len; k++) {
        t.set(cx, y + k, hx('#4c4446'));
        t.blend(cx + 1, y + k, hx('#968c86'), 0.5);
        if (R() < 0.25) cx += R() < 0.5 ? -1 : 1;
      }
    });
    // moss clumps sitting on ledges
    const moss = pals(['#3e5a2e', '#4e6e34', '#62843c']);
    const R = mulberry(65);
    for (const ly of ledges)
      for (let k = 0; k < 2; k++) {
        const x0 = Math.floor(R() * T), w = 3 + Math.floor(R() * 5);
        for (let i = 0; i < w; i++) {
          const x = x0 + i;
          const off = Math.round(Math.sin((x / T) * Math.PI * 2 + ly) * 1.2 + Math.sin((x / T) * Math.PI * 6 + ly * 3) * 0.6);
          const h = i === 0 || i === w - 1 ? 1 : 2;
          for (let j = 0; j < h; j++) t.set(x, ly + off - 1 - j, moss[j === h - 1 ? 2 : 1]);
          t.set(x, ly + off, moss[0]);
        }
      }
    // lichen specks
    scatter(10, 66, (x, y, R) => t.set(x, y, R() < 0.6 ? hx('#a0a878') : hx('#c89a5a')));
    return t;
  },
  snow() {
    const t = new Tex();
    const P = pals(['#d4dfeb', '#dde6f0', '#e5edf4', '#edf3f8', '#f5f8fb']);
    base(t, P, 71, { oct: [[2, 0.5], [4, 0.3], [8, 0.2]], dither: 0.8 });
    // soft, broken wind ridges: lit crest with a pale blue shadow behind
    for (let r = 0; r < 3; r++) {
      const y0 = r * 16 + 6, ph = r * 2.1;
      for (let x = 0; x < T; x++) {
        const on = vnoise(x, r * 7, 4, 75 + r);
        if (on < 0.45) continue;
        const y = y0 + Math.round(Math.sin((x / T) * Math.PI * 2 + ph) * 3 + Math.sin((x / T) * Math.PI * 4 + ph * 2) * 1.2);
        t.blend(x, y, hx('#fbfdff'), 0.8);
        t.blend(x, y + 1, hx('#c4d2e6'), 0.35 * (on - 0.45) * 3);
      }
    }
    scatter(14, 73, (x, y) => t.set(x, y, hx('#ffffff')));
    scatter(10, 74, (x, y) => t.blend(x, y, hx('#a8bcd8'), 0.5));
    return t;
  },
  trail() {
    const t = new Tex();
    const P = pals(['#a2804f', '#a98654', '#b08c5a', '#b79260', '#be9966']);
    base(t, P, 81, { oct: [[4, 0.45], [8, 0.35], [16, 0.2]], spread: 0.8 });
    // gravel
    const grav = pals(['#8e7c6a', '#9c948c', '#bab2aa', '#d8d0c4']);
    scatter(70, 82, (x, y, R) => {
      const c = grav[Math.floor(R() * 4)];
      t.set(x, y, c);
      t.blend(x + 1, y + 1, hx('#8a6a42'), 0.35);
    });
    const peb = pals(['#7e6444', '#8a8284', '#aaa2a0', '#d0c8c0']);
    scatter(6, 83, (x, y, R) => pebble(t, x, y, peb, R() < 0.4));
    // packed-down lighter patches
    scatter(20, 84, (x, y) => {
      t.blend(x, y, hx('#c8a472'), 0.45);
      t.blend(x + 1, y, hx('#c8a472'), 0.3);
    });
    return t;
  },
  forest() {
    // forest floor: needles + leaf litter over a mossy dark base
    const t = new Tex();
    const P = pals(['#44602e', '#4a6731', '#506e34', '#577537', '#5e7c3a']);
    base(t, P, 91, { oct: [[3, 0.5], [6, 0.3], [12, 0.2]] });
    // brown litter patches
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const n = fbm(x, y, 92, [[4, 0.6], [8, 0.4]]);
        if (n > 0.56) t.blend(x, y, hx('#6a5a34'), clamp((n - 0.56) * 4, 0, 0.6));
      }
    // pine needles: short thin strokes in random directions
    const needles = pals(['#6e5a30', '#7e6434', '#8e6e3a', '#627032']);
    scatter(80, 93, (x, y, R) => {
      const a = R() * Math.PI;
      const len = 1 + Math.floor(R() * 3);
      const c = needles[Math.floor(R() * needles.length)];
      for (let k = 0; k < len; k++) t.blend(x + Math.round(Math.cos(a) * k), y + Math.round(Math.sin(a) * k), c, 0.75);
    });
    // fallen leaves
    const leaves = [['#a8482c', '#7e3424'], ['#c07a2c', '#8e5a22'], ['#c8a038', '#9a7a28'], ['#7e5a32', '#5e4226']];
    scatter(9, 94, (x, y, R) => {
      const [a, b] = leaves[Math.floor(R() * leaves.length)];
      leafSpeck(t, x, y, hx(a), hx(b));
    });
    scatter(3, 95, (x, y, R) => twig(t, x, y, 4 + Math.floor(R() * 4), R() * 6.28, hx('#4a3a26'), hx('#7a6040')));
    // moss tufts
    scatter(30, 96, (x, y, R) => blade(t, x, y, 2, pals(['#4e7032', '#6a8e3e']), R() < 0.5 ? -1 : 0));
    return t;
  },
};

export const TERRAIN_NAMES = Object.keys(TILES);

function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

let ATLAS = null;
export function buildTerrainAtlas() {
  if (ATLAS) return ATLAS;
  const names = TERRAIN_NAMES;
  const slot = T + GUT * 2;
  const cols = Math.ceil(Math.sqrt(names.length));
  const rows = Math.ceil(names.length / cols);
  let W = 1, H = 1;
  while (W < cols * slot) W *= 2;
  while (H < rows * slot) H *= 2;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const tiles = {};
  names.forEach((name, i) => {
    let tex;
    try {
      tex = TILES[name]();
    } catch (e) {
      console.error('terrainArt: failed to build', name, e);
      tex = new Tex();
    }
    const sx = (i % cols) * slot, sy = Math.floor(i / cols) * slot;
    let sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < slot; y++)
      for (let x = 0; x < slot; x++) {
        const c = tex.get(x - GUT, y - GUT);
        const o = ((sy + y) * W + sx + x) * 4;
        d[o] = cr(c);
        d[o + 1] = cg(c);
        d[o + 2] = cb(c);
        d[o + 3] = 255;
        if (x >= GUT && y >= GUT && x < GUT + T && y < GUT + T) {
          sr += cr(c);
          sg += cg(c);
          sb += cb(c);
        }
      }
    const n = T * T;
    const avg = '#' + rgb(sr / n, sg / n, sb / n).toString(16).padStart(6, '0');
    tiles[name] = { x: sx + GUT, y: sy + GUT, w: T, h: T, avg };
  });
  ctx.putImageData(img, 0, 0);
  ATLAS = { canvas, tiles };
  return ATLAS;
}
