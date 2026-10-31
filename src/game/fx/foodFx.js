// [v30 feeding] Food you throw into the pond, as little pixel sprites with
// highlights (one atlas, drawn once): kibble pellets, rainbow flakes, wiggly
// worms, krill with a black eye, glossy caviar pearls, berries with a green
// calyx, veggie chunks, leaves, seeds, corn kernels and honey drops. Each kind
// floats, drifts and sinks its own way (flakes and leaves flutter down, worms
// and honey drop fast, berries bob on the surface for ages).
//
//   foodAtlas()           -> { canvas, frames: { [item]: [frame...] } } (lazy, cached)
//   foodFrames(item)      -> frames for that food (variants; worms: 2 wiggle frames each)
//   foodStyle(item)       -> style name ('kibble' | 'flake' | 'worm' | ...)
//   FOOD_PHYS[style]      -> { float: [min, max] s on the surface, sink: speed, flutter, wiggle, bob }
//   FOOD_TPU              texels per world unit for the food sprites
//   feedDepth(f, y, dt)   a fish chasing floating food rises toward it (FishSystem)
import { FOOD_ITEMS } from '../../data/foods.js';
import { WATER_Y, FISH_Y } from '../../world/grid.js';

export const FOOD_TPU = 26;

const BAG_STYLE = { pellets: 'kibble', flakes: 'flake', worms: 'worm', krill: 'krill', maple: 'kibble', caviar: 'pearl', bugbites: 'crumb' };
const LEAFY = new Set(['lettuce', 'cabbage', 'clover', 'fiddlehead', 'ramps']);
const DROPS = new Set(['honey', 'syrup', 'royal_jelly', 'maple_gem']);
const SEEDS = new Set(['wildrice', 'pearl_rice', 'sunflower', 'sun_seed']);
const KERNEL = new Set(['corn', 'rainbow_corn']);

export function foodStyle(item) {
  const f = FOOD_ITEMS[item];
  if (!f) return 'kibble';
  if (BAG_STYLE[item]) return BAG_STYLE[item];
  if (f.snack === 'berries' || item === 'moonberry') return 'berry';
  if (item === 'peas') return 'pea';
  if (LEAFY.has(item)) return 'leaf';
  if (DROPS.has(item)) return 'drop';
  if (SEEDS.has(item)) return 'seed';
  if (KERNEL.has(item)) return 'kernel';
  return 'chunk';
}

// how each kind behaves in the water
export const FOOD_PHYS = {
  kibble: { float: [2.2, 4], sink: 0.13, bob: 1 },
  flake: { float: [6, 9], sink: 0.055, flutter: 1, bob: 1.4 },
  worm: { float: [0.5, 1.1], sink: 0.2, wiggle: 1, bob: 0.6 },
  krill: { float: [1.4, 2.6], sink: 0.14, bob: 1 },
  pearl: { float: [0.2, 0.5], sink: 0.22, bob: 0.5 },
  berry: { float: [8, 12], sink: 0.05, bob: 1.6 },
  pea: { float: [3, 5], sink: 0.1, bob: 1.2 },
  chunk: { float: [2, 3.5], sink: 0.12, bob: 1 },
  leaf: { float: [8, 11], sink: 0.04, flutter: 1, bob: 1.6 },
  seed: { float: [2.5, 4], sink: 0.1, bob: 1 },
  kernel: { float: [1.6, 2.8], sink: 0.14, bob: 1 },
  drop: { float: [0.1, 0.3], sink: 0.18, bob: 0.4 },
  crumb: { float: [1.2, 2.2], sink: 0.15, bob: 1 },
};

// texel art: o outline, d dark, b base, l light, h highlight, e eye, g calyx green, w white
const SHAPES = {
  kibble: [
    ['.oo.', 'olho', 'obbo', '.oo.'],
    ['.oo.', 'ohlo', 'obdo', '.oo.'],
    ['.ooo', 'olhb', 'obbo', '.oo.'],
  ],
  flake: [
    ['oooo.', 'ohlbo', '.obbo', '..oo.'],
    ['.ooo', 'olhb', 'obbo', 'oo..'],
    ['ooo.', 'ohbo', 'obbo', '.ooo'],
  ],
  // worms: pairs of wiggle frames
  worm: [
    ['oo....', 'hloooo', 'ooblbo', '...oo.'],
    ['....oo', 'oooolh', 'oblboo', '.oo...'],
  ],
  krill: [
    ['..ooo.', '.olhbo', 'obbboe', 'odo.o.'],
    ['.ooo..', 'eobhlo', '.obbbo', '.o.odo'],
  ],
  pearl: [
    ['.oo.', 'ohbo', 'obbo', '.oo.'],
    ['oo.', 'ho.', '...'],
  ],
  berry: [
    ['.gg.', 'olgo', 'ohbo', 'obbo', '.oo.'],
    ['..g.', '.og.', 'ohlo', 'obbo', '.oo.'],
  ],
  pea: [
    ['.oo.', 'ohlo', 'obbo', '.oo.'],
    ['oo.', 'oho', '.oo'],
  ],
  chunk: [
    ['ooo.', 'ohlo', 'olbo', 'oooo'],
    ['.ooo', 'ohbo', 'obdo', 'ooo.'],
  ],
  leaf: [
    ['..oo', '.olo', 'ohbo', 'obo.', 'oo..'],
    ['oo..', 'olo.', 'obho', '.obo', '..oo'],
  ],
  seed: [
    ['oo.', 'oho', 'obo', '.oo'],
    ['.oo', 'oho', 'oo.'],
  ],
  kernel: [
    ['ooo', 'ohl', 'obb', 'ooo'],
    ['ooo.', 'ohlo', 'obbo', '.oo.'],
  ],
  drop: [
    ['.o.', 'olo', 'ohbo', 'obbo', '.oo.'],
  ],
  crumb: [
    ['oo..', 'olbo', 'obdo', '.oo.'],
    ['.oo', 'ohb', 'oo.'],
  ],
};

const toRgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

let ATLAS = null;
export function foodAtlas() {
  if (ATLAS) return ATLAS;
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const frames = {};
  let cx = 1, cy = 1, rowH = 0;
  const alloc = (w, h) => {
    if (cx + w + 1 > W) { cx = 1; cy += rowH + 1; rowH = 0; }
    const r = { x: cx, y: cy, w, h };
    cx += w + 1; rowH = Math.max(rowH, h);
    return r;
  };
  const WHITE = [255, 252, 238], INKC = [34, 22, 26], GREEN = [70, 150, 60];
  for (const id of Object.keys(FOOD_ITEMS)) {
    const f = FOOD_ITEMS[id];
    if (!f.fish) continue;
    const style = foodStyle(id);
    const shapes = SHAPES[style];
    const cols = (f.pellet || [0xb8742e]).map(toRgb);
    const list = [];
    const nv = Math.max(shapes.length, Math.min(4, cols.length));
    for (let v = 0; v < nv; v++) {
      const rows = shapes[v % shapes.length];
      const c = cols[v % cols.length];
      const dark = (c[0] + c[1] + c[2]) < 200;
      const pal = {
        o: mix(c, INKC, dark ? 0.55 : 0.68),
        d: mix(c, INKC, 0.3),
        b: c,
        l: mix(c, WHITE, dark ? 0.4 : 0.32),
        h: mix(c, WHITE, dark ? 0.82 : 0.7),
        e: [16, 12, 20],
        g: GREEN,
        w: WHITE,
      };
      const r = alloc(rows[0].length, rows.length);
      for (let y = 0; y < rows.length; y++)
        for (let x = 0; x < rows[y].length; x++) {
          const ch = rows[y][x];
          if (ch === '.' || !pal[ch]) continue;
          ctx.fillStyle = css(pal[ch]);
          ctx.fillRect(r.x + x, r.y + y, 1, 1);
        }
      list.push(r);
    }
    frames[id] = list;
  }
  ATLAS = { canvas: cv, frames };
  return ATLAS;
}

export function foodFrames(item) {
  const A = foodAtlas();
  return A.frames[item] || A.frames.pellets;
}

// A fish going for floating food swims up to just under the surface (FishSystem
// sets f.riseTo = the food's height every frame it chases it; cleared here).
export function feedDepth(f, y, dt) {
  const to = f.riseTo;
  f.riseTo = null;
  const want = to != null ? Math.max(0, Math.min(WATER_Y - 0.06, to - 0.07) - y) : 0;
  const r = f.rise || 0;
  f.rise = r + (want - r) * Math.min(1, dt * (want > r ? 4.5 : 2.2));
  return y + f.rise;
}

export { WATER_Y, FISH_Y };
