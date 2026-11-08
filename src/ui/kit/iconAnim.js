// [v33 kit] Little idle animations for the hotbar icons, made from the icons themselves.
//
// Every frame is built at ART resolution from the sprite (src/ui/sprites.js, 1 canvas px = 1 art px):
// nearest-neighbour turns about a hand-picked pivot, row shears, a few hand-placed pixels in the icon's
// own palette (bubbles, a glint, a page corner, sparks). Then it is scaled up by whole pixels exactly like
// spriteImg() scales the original, so a frame is the same size and density as the icon it replaces.
//
//   iconAnim(name, factor) -> { frames: [dataURL], seq: [[frameIndex, ms], ...] } | null
//     factor = CSS-to-canvas upscale of the icon's <img> (its naturalWidth / sprite width)
//   ICON_ANIMS                the icon names that animate
import { spriteCanvas, hasSprite } from '../sprites.js';

// ---------------------------------------------------------------- pixel buffer helpers
function grab(name) {
  const c = spriteCanvas(name, 1);
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  return { w: c.width, h: c.height, d: new Uint8ClampedArray(d) };
}
const blank = (P) => ({ w: P.w, h: P.h, d: new Uint8ClampedArray(P.w * P.h * 4) });
const copy = (P) => ({ w: P.w, h: P.h, d: new Uint8ClampedArray(P.d) });
const A = (P, x, y) => (x >= 0 && y >= 0 && x < P.w && y < P.h ? P.d[(y * P.w + x) * 4 + 3] : 0);
const get = (P, x, y) => { const i = (y * P.w + x) * 4; return [P.d[i], P.d[i + 1], P.d[i + 2], P.d[i + 3]]; };
function put(P, x, y, c) {
  if (x < 0 || y < 0 || x >= P.w || y >= P.h) return;
  const i = (y * P.w + x) * 4;
  P.d[i] = c[0]; P.d[i + 1] = c[1]; P.d[i + 2] = c[2]; P.d[i + 3] = c[3] ?? 255;
}
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };
const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
// dest pixel (x, y) takes the source pixel map(x, y) -> [sx, sy] (nearest)
function remap(P, map) {
  const O = blank(P);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    const [sx, sy] = map(x + 0.5, y + 0.5);
    const X = Math.floor(sx), Y = Math.floor(sy);
    if (A(P, X, Y) > 127) put(O, x, y, get(P, X, Y));
  }
  return O;
}
const rot = (P, deg, px, py) => {
  const a = (-deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return remap(P, (x, y) => [(x - px) * c - (y - py) * s + px, (x - px) * s + (y - py) * c + py]);
};
const scale = (P, k, px, py) => remap(P, (x, y) => [(x - px) / k + px, (y - py) / k + py]);
// rows y0..y1 slide by dx (a sway / rustle)
const shear = (P, y0, y1, dx) => remap(P, (x, y) => (y >= y0 && y <= y1 + 1 ? [x - dx, y] : [x, y]));
const shift = (P, y0, y1, dy) => remap(P, (x, y) => {
  if (y >= y0 + dy && y <= y1 + 1 + dy) return [x, y - dy];
  // the rows the band moved off are left empty (no smeared copy)
  if (dy < 0 ? y > y1 + 1 + dy && y <= y1 + 1 : y >= y0 && y < y0 + dy) return [-1, -1];
  return [x, y];
});
// opaque bounding box
function box(P) {
  let x0 = P.w, y0 = P.h, x1 = -1, y1 = -1;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) if (A(P, x, y) > 127) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}
// a white glint: a 2 px diagonal band across the lit (non-outline) pixels
function glint(P, pos) {
  const O = copy(P);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    if (A(P, x, y) < 128) continue;
    const c = get(P, x, y);
    if (lum(c) < 70) continue; // keep the dark outline
    const t = x + y - pos;
    if (t === 0 || t === 1) put(O, x, y, t === 0 ? [255, 255, 255, 255] : [255, 248, 210, 255]);
  }
  return O;
}
function toURL(P, f) {
  const c = document.createElement('canvas');
  c.width = P.w; c.height = P.h;
  c.getContext('2d').putImageData(new ImageData(P.d, P.w, P.h), 0, 0);
  if (f === 1) return c.toDataURL('image/png');
  const o = document.createElement('canvas');
  o.width = P.w * f; o.height = P.h * f;
  const g = o.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(c, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}

// ---------------------------------------------------------------- the animations
// each: (P, B) -> [frames] (frame 0 is the icon itself); seq: [frame, ms]
const ANIMS = {
  // Build: the hammer lifts and taps, a spark flies off the head
  hammer: {
    make(P, B) {
      const px = B.x0 + 2, py = B.y1 - 1; // the grip end
      const up = rot(P, -14, px, py), hit = rot(P, 6, px, py);
      const spark = copy(hit);
      const W = hex('#fff3a0'), Y = hex('#ffd23f');
      for (const [x, y, c] of [[B.x1, B.y0 + 3, W], [B.x1 + 1, B.y0 + 2, Y], [B.x1 - 1, B.y0 + 1, Y], [B.x1, B.y0 + 6, Y]]) put(spark, x, y, c);
      return [P, up, hit, spark];
    },
    seq: [[1, 110], [2, 60], [3, 90], [0, 120], [1, 100], [2, 60], [3, 90], [0, 0]],
  },
  // Lab: bubbles rise through the potion and pop at the neck
  flask: {
    make(P, B) {
      const W = hex('#ffffff'), D = hex('#2a723e'), G = hex('#d2eefa');
      // [x, y, size]: a bubble is a white pixel with a dark rim pixel under-right (reads on the bright potion)
      const pts = [[[8, 16, 1], [13, 17, 1]], [[8, 14, 2], [12, 15, 1], [6, 17, 1]], [[9, 12, 2], [12, 13, 1], [11, 17, 1]], [[10, 9, 1], [12, 11, 1], [8, 15, 2]], [[10, 6, 1], [9, 12, 1]], [[10, 3, 1]]];
      return [P, ...pts.map((list) => {
        const F = copy(P);
        for (const [x, y, n] of list) {
          if (A(P, x, y) < 128) continue;
          const inGlass = lum(get(P, x, y)) > 200;
          for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) put(F, x + i, y + j, inGlass ? G : W);
          if (A(P, x + n, y + n) > 127) put(F, x + n, y + n - 1, inGlass ? hex('#78aed2') : D);
        }
        return F;
      })];
    },
    seq: [[1, 110], [2, 110], [3, 110], [4, 110], [5, 120], [6, 120], [0, 0]],
  },
  // Matchmaker: the heart beats (lub-dub)
  heart: {
    make(P, B) { return [P, scale(P, 0.86, B.cx, B.cy + 1), scale(P, 0.93, B.cx, B.cy + 1)]; },
    seq: [[1, 90], [0, 90], [2, 80], [0, 260], [1, 90], [0, 90], [2, 80], [0, 0]],
  },
  // e-Buy: the eggs in the basket wobble (the basket stays put)
  shop: {
    make(P) { return [P, shear(P, 0, 9, 1), shear(P, 0, 9, -1), shift(P, 3, 9, -1)]; },
    seq: [[1, 90], [2, 90], [1, 90], [2, 90], [3, 110], [0, 0]],
  },
  // Tag: it swings on its string
  tag: {
    make(P, B) { const px = B.x0 + 1, py = B.y0 + 1; return [P, rot(P, 10, px, py), rot(P, -8, px, py), rot(P, 5, px, py), rot(P, -3, px, py)]; },
    seq: [[1, 110], [2, 110], [3, 110], [4, 110], [0, 0]],
  },
  // Restaurant: a glint sweeps across the trophy
  trophy: {
    make(P, B) { const out = [P]; for (let p = B.x0 + B.y0; p <= B.x1 + B.y1; p += 3) out.push(glint(P, p)); return out; },
    seq: null, // built from the frame count
  },
  // Encyclopedia: a page corner lifts and flutters
  book: {
    make(P, B) {
      const C = hex('#fffaf0'), c = hex('#e2c992'), K = hex('#8a6a44');
      const corner = (n) => {
        const F = copy(P);
        const x1 = B.x1 - 1, y0 = B.y0 + 1;
        for (let j = 0; j < n; j++) for (let i = 0; i <= j; i++) put(F, x1 - n + 1 + i + (n - 1 - j), y0 + j, j === n - 1 || i === 0 ? K : (i + j) % 3 ? C : c);
        return F;
      };
      return [P, corner(2), corner(4), corner(5), corner(3)];
    },
    seq: [[1, 80], [2, 80], [3, 110], [2, 80], [4, 80], [1, 80], [0, 0]],
  },
  // Carry: the glove waves hello
  hand: {
    make(P, B) { const px = B.cx, py = B.y1; return [P, rot(P, -12, px, py), rot(P, 12, px, py), rot(P, -7, px, py), rot(P, 6, px, py)]; },
    seq: [[1, 110], [2, 120], [1, 110], [2, 120], [3, 100], [4, 100], [0, 0]],
  },
  // Food: the bag rustles and a pellet hops out
  food: {
    make(P, B) {
      const a = shear(P, B.y0, B.y0 + 6, 1), b = shear(P, B.y0, B.y0 + 6, -1);
      const pel = copy(P), O = hex('#e8921a'), o = hex('#8e420a');
      put(pel, Math.round(B.cx), B.y0 - 2, O); put(pel, Math.round(B.cx) + 1, B.y0 - 2, o);
      const pel2 = copy(P);
      put(pel2, Math.round(B.cx) + 2, B.y0 - 1, O);
      return [P, a, b, pel, pel2];
    },
    seq: [[1, 80], [2, 80], [1, 80], [3, 110], [4, 110], [0, 0]],
  },
  // Pet: the little heart over the glove bounces
  nurture: {
    make(P) { return [P, shift(P, 0, 8, -1), shift(P, 0, 8, -2)]; },
    seq: [[1, 90], [2, 120], [1, 90], [0, 120], [1, 90], [2, 120], [0, 0]],
  },
  // Destroy: the "!" shudders
  bang: {
    make(P) { return [P, shear(P, 0, 19, 1), shear(P, 0, 19, -1)]; },
    seq: [[1, 60], [2, 60], [1, 60], [2, 60], [0, 0]],
  },
};
export const ICON_ANIMS = Object.keys(ANIMS);
// the upscale of an icon <img> made by spriteImg (its decoded width / the sprite's art width)
export function iconFactor(name, img) {
  try { const w = spriteCanvas(name, 1).width; return Math.max(1, Math.round((img.naturalWidth || 0) / w)) || 2; } catch { return 2; }
}

const cache = new Map();
export function iconAnim(name, factor = 2) {
  const def = ANIMS[name];
  if (!def || !hasSprite(name)) return null;
  const key = name + '|' + factor;
  if (cache.has(key)) return cache.get(key);
  let res = null;
  try {
    const P = grab(name), B = box(P);
    const frames = def.make(P, B).map((F) => toURL(F, factor));
    const seq = def.seq || [...frames.keys()].slice(1).map((i) => [i, 55]).concat([[0, 0]]);
    res = { frames, seq };
  } catch (e) { console.warn('icon anim', name, e); }
  cache.set(key, res);
  return res;
}
