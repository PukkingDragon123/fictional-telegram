// Bug sprites for "The Bear Must Eat": 20 bugs the ducks and geese eat, a
// bigger UI icon for each, and 6 bug-farm structures.
//
// House style (see natureArt.js): 24 texels per world unit, 3/4 front-ish
// billboards, light from the top-left, hue-shifted shading (cool purple
// shadows, warm highlights), a 1px outline that is a darkened version of the
// local colour, and only opaque or transparent pixels (the game alpha-tests at
// 0.5). Glowing bits are near-white unshaded pixels with dithered opaque
// motes around them. Every bug faces RIGHT.
//
// Names (all pure data, no DOM; natureArt picks them up via import.meta.glob):
//   bug_<id>      2-4 animation frames. Flyers anchor at their centre
//                 (ax = w/2, ay = h/2); crawlers, hoppers and the water
//                 strider anchor at the ground (ax = w/2, ay = h). Frames of
//                 one bug share a size so the anchor never jumps.
//                 About 11-17 px (long antennae / tails / legs push a few past
//                 14). Flyers (firefly, mayfly, dragonfly, damselfly, junebug,
//                 mosquito, bumblebee, monarch, lunamoth) are 2-3 flap frames;
//                 dragonfly, monarch and luna moth are seen from above, the
//                 rest from the side. Special frames: cricket & grasshopper
//                 [walk, walk, hop], pillbug [walk, walk, ball], rhino beetle
//                 [walk, walk, walk+twinkle] - see BUG_ART[id].anim.
//   bugicon_<id>  one larger frame (16-20 px) for cards / UI, centre anchor.
//   farm_<id>     bug farms, 2 frames (frame 1 = subtle animated variant:
//                 grass sway, worm wiggle, ripples, drifting fireflies...),
//                 ground anchor, 30-34 px wide, 23-37 px tall.
// BUG_ART gives each bug a display name, two key colours (for particles, UI
// tints, card backgrounds) and `anim`: which frame indices form each loop.
// Thin legs, antennae and wings are 1px "late" pixels without an outline; the
// firefly / luna moth / glow meadow glow pixels are near-white and unshaded
// (#fcffd8, #e4fa88, #ecffd8) so an emissive pass can pick them out.

// ===========================================================================
// Small math / colour helpers (copied from natureArt so this stays pure data)
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
function mix(a, b, t) {
  return rgb(lerp(cr(a), cr(b), t), lerp(cg(a), cg(b), t), lerp(cb(a), cb(b), t));
}
function toHsl(c) {
  const r = cr(c) / 255, g = cg(c) / 255, b = cb(c) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s <= 0) return rgb(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgb(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
function hueToward(h, target, amt) {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
// Hue-shifted shade: t < 0 darker & cooler (towards violet), t > 0 lighter &
// warmer (towards yellow).
function shade(c, t, o = {}) {
  if (typeof c === 'string') c = hx(c);
  const { hue = 26, sat = 0.12 } = o;
  const [h, s, l] = toHsl(c);
  if (t < 0) {
    const k = -t;
    return fromHsl(hueToward(h, 255, hue * k), clamp(s * (1 + sat * k), 0, 1), l * (1 - 0.62 * k));
  }
  return fromHsl(hueToward(h, 52, hue * 0.8 * t), clamp(s * (1 - 0.1 * t), 0, 1), l + (1 - l) * 0.62 * t);
}
const pals = (arr) => arr.map((s) => (typeof s === 'string' ? hx(s) : s));
const INK = hx('#1d1428');
const olc = (c, k = 0.6) => mix(c, INK, k);
const pick = (pal, I) => pal[clamp(Math.round(((I + 1) / 2) * (pal.length - 1)), 0, pal.length - 1)];
const LX = -0.55, LY = -0.72, LZ = 0.42;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ===========================================================================
// Pixel buffer
// ===========================================================================
class Px {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.c = new Int32Array(w * h);
    this.a = new Uint8Array(w * h);
  }
  ok(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  on(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.a[y * this.w + x] > 127;
  }
  any(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.a[y * this.w + x] > 0;
  }
  get(x, y) {
    return this.c[y * this.w + x];
  }
  set(x, y, c, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (typeof c === 'string') c = hx(c);
    const i = y * this.w + x;
    this.c[i] = c;
    this.a[i] = a;
  }
  del(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.ok(x, y)) this.a[y * this.w + x] = 0;
  }
  tint(x, y, c) {
    if (this.on(x, y)) this.c[y * this.w + x] = typeof c === 'string' ? hx(c) : c;
  }
  blit(src, ox = 0, oy = 0, flip = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = flip ? src.w - 1 - x : x;
        const i = y * src.w + sx;
        if (src.a[i] === 0) continue;
        const tx = x + ox, ty = y + oy;
        if (!this.ok(tx, ty)) continue;
        const j = ty * this.w + tx;
        this.c[j] = src.c[i];
        this.a[j] = Math.max(src.a[i], this.a[j]);
      }
  }
}

// Selective 1px outline: lighter on the lit top/left, darker bottom/right.
function outline(p, o = {}) {
  const { k = 0.62, lit = 0.5, noBottom = false, only = null } = o;
  const add = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.any(x, y)) continue;
      let c = -1, amt = k;
      if (p.on(x, y + 1)) {
        c = p.get(x, y + 1);
        amt = lit;
      } else if (p.on(x + 1, y)) {
        c = p.get(x + 1, y);
        amt = lit + 0.05;
      } else if (p.on(x - 1, y)) {
        c = p.get(x - 1, y);
        amt = k;
      } else if (p.on(x, y - 1)) {
        if (noBottom) continue;
        c = p.get(x, y - 1);
        amt = k + 0.04;
      }
      if (c < 0 || (only && !only(x, y))) continue;
      add.push(x, y, olc(c, amt));
    }
  for (let i = 0; i < add.length; i += 3) p.set(add[i], add[i + 1], add[i + 2]);
  return p;
}
function line(p, x0, y0, x1, y1, c, a = 255) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    if (typeof c === 'function') c(x0, y0);
    else p.set(x0, y0, c, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y0 += sy;
    }
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
// Stamp pixel-string rows into p (no outline). pal: { ch: colour }.
function stamp(p, rows, pal, x0, y0, o = {}) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[o.flip ? row.length - 1 - i : i];
      let v = pal[ch];
      if (v === undefined || v === null) continue;
      let a = 255;
      if (Array.isArray(v)) [v, a] = v;
      p.set(x0 + i, y0 + j, typeof v === 'string' ? hx(v) : v, a);
    }
  });
}
// Dithered glow motes in empty pixels within r of any emitter pixel.
function aura(p, r, c, dens, test, o = {}) {
  const W = p.w, H = p.h;
  const best = new Float32Array(W * H).fill(1e9);
  const R = Math.ceil(r);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!p.on(x, y) || !test(x, y)) continue;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const d = dx * dx + dy * dy;
          if (d < best[Y * W + X]) best[Y * W + X] = d;
        }
    }
  const hi = o.hi ?? mix(c, 0xffffff, 0.5);
  const out = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (p.any(x, y)) continue;
      const d = Math.sqrt(best[y * W + x]) / r;
      if (d >= 1) continue;
      const th = ((BAYER4[((y + (o.shift || 0)) & 3) * 4 + ((x + (o.shift || 0)) & 3)] + 0.5) / 16) * 0.6 + hash(x, y, 71 + (o.seed || 0)) * 0.4;
      const f = (1 - d) * dens;
      if (f > th) out.push(x, y, f > th * 3 ? hi : c);
    }
  for (let i = 0; i < out.length; i += 3) p.set(out[i], out[i + 1], out[i + 2], o.alpha ?? 210);
}
function dew(p, x, y) {
  if (!p.on(x, y) || !p.on(x, y + 1)) return;
  const under = p.get(x, y + 1);
  p.set(x, y, 0xffffff);
  p.set(x + 1, y, mix(p.get(x + 1, y), 0xbfe8ff, 0.7));
  p.set(x, y + 1, mix(under, 0x9fd4f0, 0.55));
  p.set(x + 1, y + 1, mix(under, INK, 0.35));
}
// One blade of grass from the base upwards (see natureArt.blade).
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
    lx = X;
    ly = Y;
    let v = 0.15 + t * 0.6 - (t < 0.18 ? 0.45 : 0) + (o.bright ?? 0);
    if (o.dry && hash(X, Y >> 1, o.seed || 3) < o.dry * t) v -= 0.35;
    p.set(X, Y, pick(pal, v));
    if (t < thick) p.set(X + (lean + curl >= 0 ? 1 : -1), Y, pick(pal, v - 0.65));
  }
  return [x0 + lean + curl, y0 - len + Math.abs(curl) * 0.35];
}
function spotsIn(p, n, R, box, minD = 5, test = null) {
  const out = [];
  const [x0, y0, x1, y1] = box;
  for (let k = 0; k < 400 && out.length < n; k++) {
    const x = Math.floor(x0 + R() * (x1 - x0)), y = Math.floor(y0 + R() * (y1 - y0));
    if (!p.on(x - 1, y - 1) || !p.on(x + 4, y + 1) || !p.on(x, y + 4) || !p.on(x + 3, y + 4)) continue;
    if (test && !test(x, y)) continue;
    if (out.some(([a, b]) => Math.abs(a - x) < minD && Math.abs(b - y) < minD * 0.8)) continue;
    out.push([x, y]);
  }
  return out;
}

// ===========================================================================
// Pixel-string sprites
// ===========================================================================
// frames: array of row arrays (one char per pixel, '.' or ' ' transparent).
// pal: { ch: '#rrggbb' | int }. Options:
//   late:    chars painted AFTER the outline, without one (1px legs, antennae,
//            tail filaments). Default 'l'.
//   glow:    emissive chars (never auto-shaded); with `aura` they get motes.
//   aura:    { r, c, dens, hi } dithered glow motes around glow chars.
//   auto:    automatic edge shading amount (0 = none). noShade: chars to skip.
//   k, lit:  outline strengths.  ol: false = no automatic outline.
//   post:    (px, margin, frameIndex) => void, extra pixels after the outline.
//   anchor:  'ground' | 'centre'.
// All frames are cropped to the union of their opaque pixels, so the anchor
// stays put while legs / wings move.
function sprite(frames, pal, o = {}) {
  const late = o.late ?? 'l';
  const glow = o.glow ?? '';
  const noShade = (o.noShade ?? '') + late + glow;
  const auto = o.auto ?? 0.45;
  const M = 1 + (o.aura ? Math.ceil(o.aura.r) : 0);
  const fh = Math.max(...frames.map((f) => f.length));
  const fw = Math.max(...frames.flatMap((f) => f.map((r) => r.length)));
  const col = {};
  for (const [ch, v] of Object.entries(pal)) col[ch] = typeof v === 'string' ? hx(v) : v;
  const pxs = frames.map((rows, fi) => {
    const p = new Px(fw + M * 2, fh + M * 2);
    const at = (x, y) => {
      if (y < 0 || y >= rows.length || x < 0) return null;
      const ch = rows[y][x];
      if (ch === undefined || ch === '.' || ch === ' ' || late.includes(ch) || col[ch] === undefined) return null;
      return ch;
    };
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = at(x, y);
        if (!ch) continue;
        let c = col[ch];
        if (auto && !noShade.includes(ch)) {
          let t = 0;
          if (!at(x, y - 1)) t += 0.26;
          if (!at(x - 1, y)) t += 0.1;
          if (!at(x, y + 1)) t -= 0.24;
          if (!at(x + 1, y)) t -= 0.1;
          if (t) c = shade(c, clamp(t * auto, -1, 1));
        }
        p.set(x + M, y + M, c);
      }
    });
    if (o.ol !== false) outline(p, { k: o.k ?? 0.6, lit: o.lit ?? 0.5 });
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (late.includes(row[x]) && col[row[x]] !== undefined) p.set(x + M, y + M, col[row[x]]);
    });
    if (o.post) o.post(p, M, fi);
    if (o.aura && (o.aura.frames ? o.aura.frames.includes(fi) : true)) {
      const glowC = new Set([...glow].map((ch) => col[ch]));
      aura(p, o.aura.r, hx(o.aura.c), o.aura.dens ?? 0.6, (x, y) => glowC.has(p.get(x, y)), { hi: o.aura.hi ? hx(o.aura.hi) : undefined, seed: fi, shift: fi });
    }
    return p;
  });
  return finish(pxs, o.anchor || 'centre');
}
// Crop all frames to their union bbox and attach anchors.
function finish(pxs, anchor) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of pxs)
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++)
        if (p.a[y * p.w + x] > 127) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
  if (x1 < 0) (x0 = 0), (y0 = 0), (x1 = 0), (y1 = 0);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  return pxs.map((p) => {
    const q = new Px(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = x + x0, sy = y + y0;
        if (sx >= p.w || sy >= p.h) continue;
        const i = sy * p.w + sx;
        if (p.a[i] < 128) continue; // alpha-tested: only opaque pixels survive
        q.c[y * w + x] = p.c[i];
        q.a[y * w + x] = 255;
      }
    return { px: q, ax: w / 2, ay: anchor === 'ground' ? h : h / 2 };
  });
}
function toRGBA(f) {
  const { px, ax, ay } = f;
  const data = new Uint8ClampedArray(px.w * px.h * 4);
  for (let i = 0; i < px.w * px.h; i++) {
    if (!px.a[i]) continue;
    const c = px.c[i];
    data[i * 4] = cr(c);
    data[i * 4 + 1] = cg(c);
    data[i * 4 + 2] = cb(c);
    data[i * 4 + 3] = 255;
  }
  return { w: px.w, h: px.h, data, ax, ay };
}

// ===========================================================================
// Bugs (in-world)
// ===========================================================================
// Opaque pale wing membrane. Wings are "late" chars: painted after the body
// outline with their own edge colour so they stay light and delicate.
const WING = { v: '#e4f2fe', V: '#b0cce8', u: '#7c96c0' };
const WL = 'vVup'; // default late set for winged bugs (+ 'l' legs)
const BUGS = {};
// Mirror the upper half of a top-view flyer about its body row.
const vmirror = (top, body) => [...top, ...body, ...top.slice().reverse()];

// --- ladybug ---------------------------------------------------------------
BUGS.ladybug = () => {
  const pal = { W: '#fff4e4', L: '#ff7a54', r: '#e8352c', d: '#b01e30', k: '#26161e', p: '#2a2232', w: '#f4eee4', e: '#1e1620', l: '#2a1c26' };
  const body = [
    '..LLLr....',
    '.LWLrrkr..',
    'LLrkrrrrw.',
    'rrrrrkrdpw',
    '.ddrrrddpe',
    '..........',
  ];
  return sprite([
    [...body, '.l..l..l..'],
    [...body, '..l..l..l.'],
  ], pal, { anchor: 'ground', auto: 0.3, noShade: 'kWpwe' });
};

// --- firefly (glowing lantern abdomen) -------------------------------------
BUGS.firefly = () => {
  const pal = { ...WING, k: '#2e2622', K: '#54463a', y: '#d8c070', o: '#e8603a', O: '#ffa070', e: '#1a1418', Y: '#fcffd8', G: '#e4fa88', l: '#2a2420' };
  const body = [
    '..yKKKKKoOl.',
    'GYkkkkkkkoe.',
    'YYGk.l.l.l..',
    '....l.l.l...',
  ];
  return sprite([
    ['.....uvu....', '....uvVvu...', '....uvVu...l', ...body],
    ['............', '............', '.uvvVVvu...l', ...body],
  ], pal, { late: WL + 'l', glow: 'YG', aura: { r: 3, c: '#d8ff70', dens: 0.75, hi: '#f8ffc0' }, auto: 0.3, noShade: 'eyo' });
};

// --- mayfly (upright sail wings, long tail filaments) ---------------------
BUGS.mayfly = () => {
  const pal = { u: '#a8987a', v: '#f8f4e6', V: '#d8ccac', b: '#ecd08a', B: '#c49a50', e: '#3a2418', l: '#7a6040', t: '#b09868' };
  const tail = [
    't..............',
    '.t.............',
    '..t............',
    't..t...........',
    '.tt.b..........',
  ];
  const up = [
    '........uu.....',
    '.......uvVu....',
    '......uvVvVu...',
    '......uvvVvu...',
    '......uvVvvu...',
    '.......uvVvu...',
    '........uvu....',
  ];
  return sprite([
    [
      ...up.slice(0, 2),
      ...tail.map((r, i) => r.slice(0, 6) + up[i + 2].slice(6)),
      '...bbb..uBBe...',
      '.....bbbBBB.l..',
      '........l.l..l.',
      '.......l..l....',
      '...............',
    ],
    [
      '...............',
      '...............',
      ...tail,
      '...bbb...BBe...',
      '.....bbbBBBul..',
      '.......uvVvu.l.',
      '........uvVu...',
      '.........uu....',
    ],
  ], pal, { late: 'uvVlt', auto: 0.3, noShade: 'e' });
};

// --- dragonfly (seen from above, two wing pairs) ---------------------------
BUGS.dragonfly = () => {
  const pal = { ...WING, p: '#3a3048', a: '#4898f0', A: '#8ad0ff', s: '#1e3070', t: '#3cb878', T: '#90e8a8', E: '#2a6ab8', e: '#c8f4ff' };
  return sprite([
    [
      '....pvv....vvp.',
      '.....vVv..vVv..',
      '......vVvvVv...',
      '........tTTeE..',
      'AasasasaatTTEE.',
      '........tttEE..',
      '......vVvvVv...',
      '.....vVv..vVv..',
      '....pvv....vvp.',
    ],
    [
      '...............',
      '...pvvv.pvvv...',
      '.....vVvvVVv...',
      '........tTTeE..',
      'AasasasaatTTEE.',
      '........tttEE..',
      '.....vVvvVVv...',
      '...pvvv.pvvv...',
      '...............',
    ],
  ], pal, { late: WL, auto: 0.2, noShade: 'Ee' });
};

// --- damselfly (slim teal, wings folded over the back) ---------------------
BUGS.damselfly = () => {
  const pal = { ...WING, p: '#2a2a3a', a: '#30d0c8', A: '#9af8ec', s: '#123040', t: '#24a8b0', E: '#1a7a98', e: '#c8fff8', l: '#1e2c38' };
  return sprite([
    [
      '....pvvvvvvu..',
      '.....uuuVVu...',
      '.........tTEe.',
      'aaAsaAsaAttEE.',
      '.........l.l..',
      '........l...l.',
    ],
    [
      '..............',
      '........uvvvp.',
      '.........tTEe.',
      'aaAsaAsaAttEE.',
      '...pvvvvVu.l..',
      '........l...l.',
    ],
  ], pal, { late: WL + 'l', auto: 0.2, noShade: 'Ees' });
};

// --- cricket (dark, crawl / hop) -------------------------------------------
BUGS.cricket = () => {
  const pal = { k: '#2a2226', K: '#4e3e3a', w: '#4a3a30', W: '#6e5846', f: '#5a4436', F: '#8a6c52', h: '#221a1e', H: '#4a3c3c', e: '#f0e0b8', l: '#241c20', m: '#2e2428' };
  return sprite([
    [
      '.........mmm..m',
      '..FF....m...m..',
      '.lfFF.WWWWKHH..',
      '.l.ffFFwwwkhhe.',
      'l..kkkfFfkkhhh.',
      'l.......l..l...',
      'l......l....l..',
    ],
    [
      '.........mmm..m',
      '..FF....m...m..',
      '.lfFF.WWWWKHH..',
      '.l.ffFFwwwkhhe.',
      '.l.kkkfFfkkhhh.',
      '.l......l..l...',
      '.l.......l.l...',
    ],
    [
      '........mmm..m.',
      '........m..m...',
      '.....WWWWKHH...',
      '.FFFFFfwwkhhe..',
      'lffffffkkkhhh..',
      'l........l.l...',
      '...............',
      '...............',
      '...............',
    ],
  ], pal, { late: 'lm', anchor: 'ground', auto: 0.3, noShade: 'e' });
};

// --- grasshopper (green, huge jumping legs) --------------------------------
BUGS.grasshopper = () => {
  const pal = { g: '#86c844', G: '#bce870', d: '#4e8a30', w: '#6a9a34', W: '#a8cc60', y: '#ece070', f: '#78b23a', F: '#c4ec7c', s: '#3e6a24', e: '#3a2a14', E: '#fff8d0', l: '#2e4a1e', m: '#2e4a1e' };
  return sprite([
    [
      '..F.........m.',
      '.lFFf......m..',
      '.l.fFFsWWWGGG.',
      '.l..sfFFwwgEgg',
      '.l...dfFsdgegg',
      'l.....dyyd.l..',
      'l.........l.l.',
    ],
    [
      '..............',
      '..F.........m.',
      '.lFFf......m..',
      '.l.fFFsWWWGGG.',
      '.l..sfFFwwgEgg',
      'l....dyfyddegg',
      'l.......l..l.l',
    ],
    [
      '...........m..',
      '..........m...',
      '.......WWGGG..',
      'FFFFfFsfwgEgg.',
      'lsfffffFdgegg.',
      '.......dyd.l..',
      '..............',
      '..............',
      '..............',
    ],
  ], pal, { late: 'lm', anchor: 'ground', auto: 0.35, noShade: 'eE' });
};

// --- katydid (long flat leaf wings, very long antennae, spindly legs) -----
BUGS.katydid = () => {
  const pal = { g: '#6ccc50', G: '#b4f088', d: '#3c8a38', v: '#e0ffb0', e: '#3a2210', h: '#64c048', H: '#a4e878', l: '#2a5424', m: '#e8fcb0' };
  const body = [
    'GGGGGg.......m..',
    'GvvvgGGGgg..m..m',
    '.gggvvvvgGGhm.m.',
    '..ddgggggggHhm..',
    '....ddddddhhhe..',
  ];
  return sprite([
    ['...............m', '..............m.', ...body, '....l..l...l.l..', '...l...l....l.l.', '..l....l.....l..'],
    ['................', '...............m', ...body, '....l..l...l.l..', '....l..l...l..l.', '....l...l..l...l'],
  ], pal, { late: 'lm', anchor: 'ground', auto: 0.35, noShade: 'ev' });
};

// --- june bug (chunky metallic green-bronze beetle, flying) ----------------
BUGS.junebug = () => {
  const pal = { v: '#f6eed8', V: '#d8c49c', u: '#a88e64', a: '#5e8e3a', A: '#a4d064', s: '#3e6a2e', b: '#946a30', B: '#d0a050', d: '#2e4024', W: '#f6ffdc', h: '#3a2c1e', H: '#6a5236', e: '#f0e0b0', l: '#2a2018' };
  const body = [
    '...bBBBb....',
    '..bAWAAab...',
    '.bAasaAsaHhl',
    '.baasaasahHe',
    '.bdaasaadhhh',
    '..bdddddhh..',
    '...l..l.l...',
    '..l..l..l...',
  ];
  return sprite([
    ['..uu........', '.uvVu.......', '..uvVu......', ...body],
    ['............', '............', '............',
      ...body.slice(0, 2), 'uvbasaAsaHhl', 'uVVvsaasahHe', '.uvVuasaadhhh', '..uu.dddddhh..', ...body.slice(6)],
  ], pal, { late: WL + 'l', auto: 0.25, noShade: 'WHhes' });
};

// --- stag beetle (huge antler mandibles) -----------------------------------
BUGS.stagbeetle = () => {
  const pal = { k: '#42241f', K: '#7a4a38', W: '#f0c8a8', h: '#34201e', H: '#64402e', m: '#7a3420', M: '#d0784a', n: '#5a2418', l: '#2a1a1a' };
  const body = [
    '.............M..',
    '..............M.',
    '..........n...M.',
    '...KKKK..HHnn.M.',
    '..KWKkkkKHhhMMm.',
    '.KKkkkkkkhhhhm..',
    '.kkkkkkkk.......',
    '..kkkkkk........',
  ];
  return sprite([
    [...body, '..l..l..l.l.....', '.l..l..l..l.....'],
    [...body, '..l..l..l.l.....', '...l..l..l.l....'],
  ], pal, { anchor: 'ground', auto: 0.3, noShade: 'Wn' });
};

// --- rhino beetle (big horn, rare & shiny) ---------------------------------
BUGS.rhinobeetle = () => {
  const pal = { k: '#2a2440', K: '#4a3e78', S: '#8a7ad8', W: '#ffffff', h: '#30283c', H: '#6a5a8a', n: '#c8a050', N: '#f0d080', l: '#1e1828' };
  const top = [
    '..........NN..',
    '...........Nn.',
    '..........Nn..',
    '....SKKK.hHn..',
    '..SWSKKkkhhn..',
    '.KSKkkkkkhhh..',
    '.kKkkkkkkhhh..',
    '..kkkkkkkk....',
    '..l..l..l.l...',
  ];
  const f0 = [...top, '.l..l..l..l...'];
  const f1 = [...top, '..l..l..l..l..'];
  return sprite([f0, f1, f0], pal, {
    anchor: 'ground', auto: 0.25, noShade: 'WSNn',
    post: (p, M, fi) => {
      if (fi !== 2) return;
      const x = M + 3, y = M + 2; // a twinkle on the shell: it's a rare one
      p.set(x, y, 0xffffff);
      p.set(x - 1, y, hx('#d8d0ff'));
      p.set(x + 1, y, hx('#d8d0ff'));
      p.set(x, y - 1, hx('#d8d0ff'));
      p.set(x, y + 1, 0xffffff);
    },
  });
};

// --- mealworm (segmented golden larva) -------------------------------------
BUGS.mealworm = () => {
  const pal = { y: '#e8b048', Y: '#fad884', s: '#a86a28', d: '#b87a30', h: '#6a3a1a', H: '#9a5a2a', l: '#4a2a14' };
  return sprite([
    [
      '...........',
      '.YsYsYsYsYH',
      'ydydydydyyh',
      '...........',
      '........l.l',
    ],
    [
      '...YsYs....',
      '.YsydydYsYH',
      'yd.......yh',
      '...........',
      '........l.l',
    ],
  ], pal, { anchor: 'ground', auto: 0.3, noShade: 'sh' });
};

// --- earthworm (pink wiggle) -----------------------------------------------
BUGS.earthworm = () => {
  const pal = { p: '#e88a98', P: '#ffc0c4', d: '#b85a74', c: '#e8786a', C: '#ffa890' };
  return sprite([
    [
      '.PP.....CCP..',
      'PppP...PcppPp',
      'd.dpPPPpd..dd',
      '....ddd......',
    ],
    [
      '.......PCC...',
      '..PPP.Ppcpp..',
      '.Ppdpppd..dpP',
      'dd...........',
    ],
  ], pal, { anchor: 'ground', auto: 0.2 });
};

// --- grub (fat C-shaped white grub) ----------------------------------------
BUGS.grub = () => {
  const pal = { w: '#f6eedc', W: '#fffaf0', s: '#dcd0b8', d: '#b8ac96', g: '#8a8aa4', G: '#a8a8c0', h: '#d8822a', H: '#f4ac4c', e: '#3a1e10', l: '#7a4a24' };
  return sprite([
    [
      '..WWWWww..',
      '.WwswswhH.',
      'WwsdsdhHH.',
      'ws....lhhe',
      'wd...l..l.',
      'Gg....l...',
      'gGgd......',
      '.gdddd....',
    ],
    [
      '..WWWWww..',
      '.WwswswhH.',
      'WwsdsdhHH.',
      'ws.....hhe',
      'wd...ll.l.',
      'Gg.....l..',
      'gGdd......',
      '.gdddd....',
    ],
  ], pal, { anchor: 'ground', auto: 0.3, noShade: 'e' });
};

// --- water strider (long legs, dimples on the water) -----------------------
BUGS.waterstrider = () => {
  const pal = { k: '#3a3442', K: '#6a6274', e: '#d8d0e0', l: '#2a2430', o: '#e0f4ff', O: '#8ac8e8' };
  return sprite([
    [
      '.......KKKe.....',
      '...kkkkkkkk.l...',
      '..l...ll..l..l..',
      '.l...l...l.l..l.',
      'l...l.....l....l',
      'oOo.Oo....oO.oOo',
    ],
    [
      '.......KKKe.....',
      '...kkkkkkkk.l...',
      '...l.l.l..l..l..',
      '..l.l...l..l...l',
      '.l.l.....l..l..O',
      'oOoOo....oO.oO..',
    ],
  ], pal, { late: 'loO', anchor: 'ground', auto: 0.3, noShade: 'e' });
};

// --- mosquito (tiny, dangly legs, long beak) -------------------------------
BUGS.mosquito = () => {
  const pal = { ...WING, k: '#3a3438', w: '#d8d0c8', t: '#5a5058', e: '#1a1418', l: '#3a3238', n: '#2a2428' };
  return sprite([
    [
      '....uvu...',
      '...uvVu...',
      'kwkwttte.n',
      '...l.l.l..',
      '..l..l..l.',
      '..l.l....l',
    ],
    [
      '..........',
      '..........',
      'kwkwttte.n',
      '..uvVvl.l.',
      '..lvul..l.',
      '..l..l...l',
    ],
  ], pal, { late: WL + 'ln', auto: 0.2, noShade: 'ekw' });
};

// --- bumblebee (fuzzy) -----------------------------------------------------
BUGS.bumblebee = () => {
  const pal = { ...WING, y: '#ffd23a', Y: '#fff090', k: '#2a2024', K: '#4a3a3a', o: '#e8e0d0', e: '#141014', l: '#2a2024', f: '#c89a20' };
  return sprite([
    [
      '.....uvu...',
      '....uvVvu..',
      '..YyYKkyY..',
      '.YyykkkyyKe',
      'okyykkkyykk',
      '.okkkKkkkk.',
      '...l..l.l..',
      '..l..l...l.',
    ],
    [
      '...........',
      '...........',
      '..YyYKkyY..',
      '.YyykkkyyKe',
      'okyuvVvyykk',
      '.okkuvukkk.',
      '...l..l.l..',
      '..l..l...l.',
    ],
  ], pal, {
    late: WL + 'l', auto: 0.35, noShade: 'kKe',
    // fuzz: a few loose hairs break the outline over the yellow bands
    post: (p) => {
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++)
          if (!p.on(x, y) && p.on(x, y + 1) && cr(p.get(x, y + 1)) > 200 && hash(x, y, 5) < 0.45) p.set(x, y, hx('#c89a20'));
    },
  });
};

// --- monarch (orange / black butterfly, seen from above) -------------------
// No automatic outline: the black wing border IS the outline.
BUGS.monarch = () => {
  const pal = { k: '#241820', O: '#ffaa3a', o: '#f07a1e', d: '#c85a18', w: '#fff8ec', b: '#3a2c30', B: '#6a5454', l: '#241820' };
  const body = ['..kkbbbbbBl..'];
  const open = vmirror([
    '........kkk..',
    '.kkk..kkOOwk.',
    'kOOOkkOOoOkwk',
    'kwOoOkOooOk..',
    '.kOOkkOOkk.l.',
  ], body);
  const half = vmirror([
    '.............',
    '.............',
    '...kk..kkk...',
    '..kOOkkOoOk..',
    '..kwOkkOokkl.',
  ], body);
  const shut = vmirror([
    '.............',
    '.............',
    '.............',
    '.....kkkkk...',
    '....kwOoOOkl.',
  ], body);
  return sprite([open, half, shut], pal, { late: 'l', auto: 0.2, noShade: 'kwbBl', ol: false });
};

// --- luna moth (pale green, long tails, eyespots, faint glow) --------------
BUGS.lunamoth = () => {
  const pal = { g: '#c4eeaa', G: '#ecffd8', d: '#8ec88c', t: '#a8dc98', T: '#d890b8', m: '#9a4a78', y: '#f4d060', e: '#7a2a4a', b: '#faf6ee', B: '#dcd4c8', l: '#e8d090' };
  const body = ['...dbbbbBbl...'];
  const open = vmirror([
    '.........mmm..',
    '........mGggm.',
    '....ddg.mgyem.',
    'tt.dgygdggd...',
    'T..ddgddgd.l..',
  ], body);
  const half = vmirror([
    '..............',
    '..............',
    '..............',
    '.........mmm..',
    'Ttt.ddgmGgyeml',
  ], body);
  return sprite([open, half], pal, { late: 'l', auto: 0.25, noShade: 'mbBye', glow: 'G', aura: { r: 2, c: '#e8ffd8', dens: 0.5 } });
};

// --- pill bug (grey armour plates; frame 2 = rolled into a ball) -----------
BUGS.pillbug = () => {
  const pal = { g: '#8a8c9c', G: '#c0c4d0', s: '#5a5c6c', d: '#4a4a5a', W: '#eef0f8', h: '#6a6a7a', l: '#2e2e3a', m: '#2e2e3a' };
  return sprite([
    [
      '..GGGGGGG....',
      '.GWgGgGgGgh.m',
      'GgsgsgsgsgGhm',
      'gsgsgsgsgsgh.',
      '.dddddddddd..',
      '.l.l.l.l.l...',
      'l.l.l.l.l....',
    ],
    [
      '..GGGGGGG....',
      '.GWgGgGgGgh..',
      'GgsgsgsgsgGhm',
      'gsgsgsgsgsghm',
      '.dddddddddd..',
      '..l.l.l.l.l..',
      '..l.l.l.l.l..',
    ],
    [
      '....GGGG.....',
      '...GWgGgg....',
      '..GgsgsgGg...',
      '..gsgsgsgs...',
      '..dsdsdsdd...',
      '...dddddd....',
    ],
  ], pal, { late: 'lm', anchor: 'ground', auto: 0.3, noShade: 'W' });
};

// ===========================================================================
// Bug icons (UI)
// ===========================================================================
// UI icons: one bigger, more detailed frame per bug (centre anchor).
const ICONS = {};

ICONS.ladybug = () => sprite([[
  '.....LLLLr.......',
  '...LLWWLrrrk.....',
  '..LWWLrrkkrrr....',
  '.LLLrrrrkkrrdww..',
  'Lkkrrrrrrrrdpppw.',
  'rkkrrrrrrkkdpppee',
  'rrrrrkkrrkkdppewe',
  'rrrrrkkrrrrddpeee',
  '.drrrrrrrrdd..ee.',
  '..ddddrrddd......',
  '...l...l...l..l..',
  '..l...l...l..l...',
]], { W: '#fff4e4', L: '#ff7a54', r: '#e8352c', d: '#a81c30', k: '#26161e', p: '#2a2232', w: '#f6f0e6', e: '#1e1620', l: '#2a1c26' },
{ auto: 0.3, noShade: 'kWpwe' });

ICONS.firefly = () => sprite([[
  '.....uvvu..........',
  '....uvVVvu.........',
  '....uvVVVvu........',
  '.....uvVVvu.....l..',
  '......uvvu.....l...',
  '...yKKKKKKKKyoOOl..',
  '..yKKkkkkkkkkoOpO..',
  '.GGkkkkkkkkkkkoOee.',
  'GYYGkkkkkkkkkk.ee..',
  'YYYG..l..l...l.....',
  '.GG..l..l...l......',
]], { ...WING, k: '#2e2622', K: '#54463a', y: '#e0c878', o: '#e8603a', O: '#ffa070', p: '#2a1a1a', e: '#1a1418', Y: '#fcffe0', G: '#e4fa88', l: '#2a2420' },
{ late: WL + 'l', glow: 'YG', aura: { r: 4, c: '#d8ff70', dens: 0.8, hi: '#f8ffc0' }, auto: 0.3, noShade: 'eyop' });

ICONS.mayfly = () => sprite([[
  '...........uu......',
  '..........uvVu.....',
  '.........uvVvVu....',
  't........uvvVvVu...',
  '.t.......uvVvvVu...',
  '..t.....uvVvVvVu...',
  't..t....uvvVvvu....',
  '.t..t...uvVvVvu....',
  '..t..t...uvVvu.....',
  '...t..bb..uvvu.....',
  '....ttbBb.uBBBe....',
  '.......bbbBBBBBe...',
  '.........bbBBl..l..',
  '..........l..l...l.',
  '.........l..l......',
]], { u: '#a08e70', v: '#fbf8ec', V: '#dccfb0', b: '#ecd08a', B: '#c49a50', e: '#3a2418', l: '#7a6040', t: '#b09868' },
{ late: 'uvVlt', auto: 0.3, noShade: 'e' });

ICONS.dragonfly = () => sprite([[
  '.....puvvvu.pvvvvu.',
  '......uvVvVuuvVvVu.',
  '.......uvVvVvVvVu..',
  '.........uvVvVu....',
  '..........tTTeEE...',
  'AasAasAasatTTTEEE..',
  '..........tttTEE...',
  '.........uvVvVu....',
  '.......uvVvVvVvVu..',
  '......uvVvVuuvVvVu.',
  '.....puvvvu.pvvvvu.',
]], { ...WING, p: '#3a3048', a: '#4898f0', A: '#8ad0ff', s: '#1e3070', t: '#3cb878', T: '#90e8a8', E: '#2a6ab8', e: '#c8f4ff' },
{ late: WL, auto: 0.2, noShade: 'Ee' });

ICONS.damselfly = () => sprite([[
  '.....pvvvvvvvu....',
  '......uuVVVVVvu...',
  '.......pvvvvvVu...',
  '.........uuuu.tTEE',
  '...aAsaAsaAsaAttEe',
  '..sa..........t.EE',
  '.aA..........l..l.',
  '.s..........l..l..',
  'aA................',
  'A.................',
]], { ...WING, p: '#2a2a3a', a: '#30d0c8', A: '#9af8ec', s: '#123040', t: '#24a8b0', T: '#60d8d8', E: '#1a7a98', e: '#c8fff8', l: '#1e2c38' },
{ late: WL + 'l', auto: 0.2, noShade: 'Ees' });

ICONS.cricket = () => sprite([[
  '.........mmmm...m.',
  '.............m.m..',
  '...FF.......m.m...',
  '..FFFf.......m....',
  '..lfFFf.WWWWKKHHh..',
  '.l.ffFFfwwwwkkHhhh.',
  '.l..ffFFfwwwkhhhehh',
  'l....kfFFkkkkhhhhh.',
  'l....kkffkkkkkhhh..',
  'l.....kkkkkk.......',
  'l..........l..l....',
  '..........l....l...',
]], { k: '#2a2226', K: '#4e3e3a', w: '#4a3a30', W: '#6e5846', f: '#5a4436', F: '#9a7a5c', h: '#221a1e', H: '#4e4040', e: '#f6ead0', l: '#241c20', m: '#2e2428' },
{ late: 'lm', auto: 0.3, noShade: 'e' });

ICONS.grasshopper = () => sprite([[
  '...F............m.',
  '..FFf..........m..',
  '..lFFf........m...',
  '..l.fFFf.....m....',
  '..l..sfFFsWWGGGGG..',
  '..l...sfFFwwgGgEgg.',
  '.l.....sfFFwggeegGg',
  '.l......dfFdgggggdd',
  '.l.......ddyydggdd.',
  'l..........dd.l.l..',
  'l............l..l..',
]], { g: '#86c844', G: '#bce870', d: '#4e8a30', w: '#6a9a34', W: '#a8cc60', y: '#ece070', f: '#78b23a', F: '#c4ec7c', s: '#3e6a24', e: '#3a2a14', E: '#fff8d0', l: '#2e4a1e', m: '#2e4a1e' },
{ late: 'lm', auto: 0.3, noShade: 'eE' });

ICONS.katydid = () => sprite([[
  '..................m',
  '.................m.',
  '...l............m..',
  '..lGGGGg.......m..m',
  '..GgvvvgGGg...m..m.',
  '.GgvggvvvgGGg.m.m..',
  'GgvgggggvvvgGHhm...',
  '.ggdgggggggvgHhhm..',
  '..ddggggggggghhhe..',
  '....ddddddddhhhh...',
  '....l...l....l.l...',
  '...l....l.....l.l..',
  '..l.....l......l...',
]], { g: '#6ccc50', G: '#b4f088', d: '#3c8a38', v: '#e0ffb0', e: '#3a2210', h: '#64c048', H: '#a4e878', l: '#2a5424', m: '#e8fcb0' },
{ late: 'lm', auto: 0.3, noShade: 'ev' });

ICONS.junebug = () => sprite([[
  '......uu..........',
  '.....uvvu.........',
  '....uvVVvu........',
  '...uvVVVu.........',
  '..uvVVVu..........',
  '...uvVu.bBBBBb....',
  '....uubBAWWAAab...',
  '.....bAAWAAasaab.l',
  '....bAAAaaAsaaaHhl',
  '....baAasaaasaahHh',
  '.uvvbaaaasaaasahhhe',
  'uvVVbdaaaasaaadhhh.',
  '.uvVVbddaaaaddhhh..',
  '..uuu.bddddddd.....',
  '.......l..l...l....',
  '......l..l...l.....',
]], { v: '#f6eed8', V: '#d8c49c', u: '#a88e64', a: '#5e8e3a', A: '#a4d064', s: '#3e6a2e', b: '#946a30', B: '#d0a050', d: '#2e4024', W: '#f6ffdc', h: '#3a2c1e', H: '#6a5236', e: '#f0e0b0', l: '#2a2018' },
{ late: 'vVul', auto: 0.25, noShade: 'WHhes' });

ICONS.stagbeetle = () => sprite([[
  '...............MM..',
  '................Mm.',
  '.............M...M.',
  '..............M..M.',
  '...........n..M.Mm.',
  '....KKKKK..HHnnMMm.',
  '...KWWKkkkKHHhhMm..',
  '..KWKkkkkkkHhhhmM..',
  '.KKkkkkkkkkhhhhhmm.',
  '.kKkkkkkkkk.hhh....',
  '.kkkkkkkkkk........',
  '..kkkkkkkk.........',
  '...l..l...l..l.....',
  '..l..l...l...l.....',
]], { k: '#42241f', K: '#7a4a38', W: '#f0c8a8', h: '#34201e', H: '#64402e', m: '#8a3820', M: '#d8844e', n: '#5a2418', l: '#2a1a1a' },
{ auto: 0.3, noShade: 'Wn' });

ICONS.rhinobeetle = () => sprite([[
  '............NN....',
  '............NNn...',
  '.............Nn...',
  '............NNn...',
  '...........NNn....',
  '.....SSKK..hHn....',
  '...SWWSKKKkhHnn...',
  '..SWSKKKKkkhhhn...',
  '.KSKKkkkkkkhhhh...',
  '.KKkkkkkkkkhhhh...',
  '.kKkkkkkkkkhhh....',
  '..kkkkkkkkk.......',
  '...l..l...l..l....',
  '..l..l...l..l.....',
]], { k: '#2a2440', K: '#4a3e78', S: '#8a7ad8', W: '#ffffff', h: '#30283c', H: '#6a5a8a', n: '#c8a050', N: '#f0d080', l: '#1e1828' },
{ auto: 0.25, noShade: 'WSNn', post: (p, M) => {
  const x = M + 3, y = M + 5;
  p.set(x - 1, y - 2, 0xffffff); p.set(x - 2, y - 2, hx('#d8d0ff')); p.set(x, y - 2, hx('#d8d0ff')); p.set(x - 1, y - 3, hx('#d8d0ff'));
} });

ICONS.mealworm = () => sprite([[
  '..........YsYsYH...',
  '.......YsYydydyyhH.',
  '....YsYydy....l.yhe',
  '..YsYyd........l...',
  '.Yyyd..............',
  'yyd................',
]], { y: '#e8b048', Y: '#fad884', s: '#a86a28', d: '#b87a30', h: '#6a3a1a', H: '#9a5a2a', e: '#2a1408', l: '#4a2a14' },
{ auto: 0.3, noShade: 'she' });

ICONS.earthworm = () => sprite([[
  '..........PPP....',
  '.........PpppP...',
  '..PPP...Ppd..pP..',
  '.PpppP..pd....pd.',
  'Ppd.dpPCcd.....d.',
  'pd...dCcCd.......',
  'd.....dccd.......',
]], { p: '#e88a98', P: '#ffc0c4', d: '#b85a74', c: '#e8786a', C: '#ffa890' },
{ auto: 0.2 });

ICONS.grub = () => sprite([[
  '....WWWWWww....',
  '..WWwwswswwhH..',
  '.WwwsdsdsdhHHH.',
  'Wwws.....lhhHhe',
  'wws.......hhhhe',
  'wwd.....l.l....',
  'wws......l.....',
  'GGd............',
  'GgGd...........',
  '.gGgdd....d....',
  '..ggdddddd.....',
]], { w: '#f6eedc', W: '#fffaf0', s: '#dcd0b8', d: '#b8ac96', g: '#8a8aa4', G: '#a8a8c0', h: '#d8822a', H: '#f4ac4c', e: '#3a1e10', l: '#7a4a24' },
{ auto: 0.3, noShade: 'e' });

ICONS.waterstrider = () => sprite([[
  '.........KKKKe.....',
  '....kkkkkkkkkkk.l..',
  '...l...l.l...l..l..',
  '..l...l...l...l..l.',
  '.l...l.....l...l..l',
  'l...l.......l....l.',
  'l..l.........l...l.',
  'oOo.oOo....oOo.oOo.',
]], { k: '#3a3442', K: '#6a6274', e: '#d8d0e0', l: '#2a2430', o: '#e0f4ff', O: '#8ac8e8' },
{ late: 'loO', auto: 0.3, noShade: 'e' });

ICONS.mosquito = () => sprite([[
  '.....uvvu......',
  '....uvVVvu.....',
  '...uvVVvu......',
  'kwkwkwtttee...n',
  '.kwkwk.lll..n..',
  '.....l.l.l.....',
  '....l..l..l....',
  '...l...l...l...',
  '...l...l....l..',
]], { ...WING, k: '#3a3438', w: '#e0d8d0', t: '#5a5058', e: '#1a1418', l: '#3a3238', n: '#2a2428' },
{ late: WL + 'ln', auto: 0.2, noShade: 'ekw' });

ICONS.bumblebee = () => sprite([[
  '.......uvvu.....',
  '......uvVVvu....',
  '.....uvVVVvu....',
  '......uvvu......',
  '...YYyYKkkyYY...',
  '..YyyykkkkyyyK..',
  '.oyyyykkkkyyyKKe',
  'okkyyykkkkyyykke',
  'okkyyykkkkyyykk.',
  '.okkkkKkkkkkkk..',
  '..kkkkkkkkkkk...',
  '....l..l..l.....',
  '...l..l....l....',
]], { ...WING, y: '#ffd23a', Y: '#fff090', k: '#2a2024', K: '#4a3a3a', o: '#f0e8d8', e: '#141014', l: '#2a2024' },
{ late: WL + 'l', auto: 0.35, noShade: 'kKe', post: (p) => {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++)
    if (!p.on(x, y) && p.on(x, y + 1) && cr(p.get(x, y + 1)) > 200 && hash(x, y, 9) < 0.5) p.set(x, y, hx('#c89a20'));
} });

ICONS.monarch = () => sprite([vmirror([
  '............kkkk..',
  '..kkkk....kkOOwkk.',
  '.kOOOOk..kOOOkwOwk',
  'kOOOOOOkkOOOkOOkk.',
  'kwOOkOOkOOOkOOOk..',
  'kOOkOOkOOokOOOk...',
  '.kOOOOkOOkOOkk....',
  '..kkOOkkOkkk......',
], ['....kkbbbbbbbBll..'])], { k: '#241820', O: '#ffaa3a', o: '#f07a1e', w: '#fff8ec', b: '#3a2c30', B: '#6a5450', l: '#241820' },
{ late: 'l', auto: 0.2, noShade: 'kwbBl', ol: false });

ICONS.lunamoth = () => sprite([vmirror([
  '.............mmm...',
  '............mGggm..',
  '...........mGgggm..',
  '.......ddg.mggyeem.',
  '......dggggmggeyd..',
  '....ddgygggdgggd...',
  '.ttt.ddggggdggd....',
  'TT....ddgddggd.....',
], ['......dbbbbbbBb.ll.'])], { g: '#c4eeaa', G: '#ecffd8', d: '#8ec88c', t: '#a8dc98', T: '#d890b8', m: '#9a4a78', y: '#f4d060', e: '#7a2a4a', b: '#faf6ee', B: '#dcd4c8', l: '#e8d090' },
{ late: 'l', auto: 0.25, noShade: 'mbBye', glow: 'G', aura: { r: 2.5, c: '#e8ffd8', dens: 0.55 } });

ICONS.pillbug = () => sprite([[
  '....GGGGGGGG.....',
  '..GGWWgGgGgGgh...',
  '.GWWgGgGgGgGghh.m',
  'GgsgsgsgsgsgsghHm',
  'ggsgsgsgsgsgsghhm',
  'gsgsgsgsgsgsgshh.',
  '.ddsdsdsdsdsdhh..',
  '..ddddddddddd....',
  '..l.l.l.l.l.l....',
  '.l.l.l.l.l.l.....',
]], { g: '#8a8c9c', G: '#c0c4d0', s: '#5a5c6c', d: '#4a4a5a', W: '#eef0f8', h: '#6a6a7a', H: '#9a9aaa', l: '#2e2e3a', m: '#2e2e3a' },
{ late: 'lm', auto: 0.3, noShade: 'W' });

// ===========================================================================
// Bug farms
// ===========================================================================
const FARMS = {};
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const MOSS = pals(['#1f3a22', '#2c5028', '#3e6a30', '#56853a', '#74a044', '#98bc58']);
const GRASS = pals(['#1a3424', '#24482c', '#336434', '#4f8a3c', '#78a84a', '#a8cc6a', '#cce48c']);
const GRASS_BACK = pals(['#16302a', '#1e4030', '#2a5634', '#3e7238', '#5c8e42', '#82aa56', '#a8c478']);
const STRAW = pals(['#5a4a2a', '#8a7444', '#b09a5a', '#d4bc78', '#f0dca0', '#fff4cc']);
const WOOD = pals(['#3a2220', '#5a3628', '#7e5032', '#a46e42', '#c48e58', '#deb07a']);
const SOIL = pals(['#160e10', '#24161a', '#36241e', '#4c3426', '#644630', '#7c5a3c']);
const BARK = pals(['#2a1c1e', '#3e2a28', '#553a30', '#6e4c3a', '#886046', '#a07654']);
const WOODEND = pals(['#6a4a34', '#8a6040', '#b08050', '#cda064', '#e4c080', '#f4dca0']);
const LEAF = pals(['#142a1e', '#1c3c24', '#26522a', '#326830', '#428036', '#58983e', '#74b048', '#98c85c', '#c0de7c']);
const CAP_ORANGE = pals(['#3e1418', '#6a2420', '#9a3c22', '#c85a24', '#e8802c', '#f8a840', '#ffd070']);
const CAP_RED = pals(['#3c0e22', '#5e1228', '#8a162a', '#b8202a', '#dc3430', '#f05a3a', '#ff8a5a', '#ffbe8a']);
const CAP_TAN = pals(['#3a2420', '#5a3a2a', '#82583a', '#a8784a', '#c89a62', '#e2bc80', '#f4dca4']);
const STEM = pals(['#5e4652', '#8a6e72', '#b49c94', '#d8c6b0', '#efe2c8', '#fff8e6']);
const BOG = pals(['#101820', '#14222c', '#1a3038', '#204042', '#2a524c', '#3c6c5e', '#6a9a84', '#a8d0c0', '#eefaf4']);
const MUD = pals(['#22181a', '#33241e', '#4a3626', '#634a32', '#7c6040', '#967a52']);
const DUSK = pals(['#141a30', '#1a2a3e', '#20404a', '#285650', '#346a56', '#4a8060', '#6a9a6e', '#94b884']);

// Leafy canopy (a port of natureArt's canopy(): painter-ordered clusters, each
// with its own rounded lighting blended into the crown's, a leaf texture,
// creases where clusters overlap, rim light and loose leaves on the edge).
function canopy(p, clusters, o = {}) {
  const { W = p.w, H = p.h, pal, seed = 1, leaf = 3.2, loose = 0.35, rim = 1.4, bottomDark = 0.9, sparkle = 0.05, jag = 0.16 } = o;
  const R = mulberry(seed);
  const cl = clusters.map((c, i) => ({ ...c, ry: c.ry ?? c.r, i, ph: R() * 6.28, nb: Math.max(5, Math.round((c.r * 6.28) / (o.bump ?? 4.2))), z: c.z ?? c.y + c.r * 0.35 + (c.front || 0) }));
  cl.sort((a, b) => a.z - b.z);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const c of cl) {
    x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r);
    y0 = Math.min(y0, c.y - c.ry); y1 = Math.max(y1, c.y + c.ry);
  }
  const E = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
  const own = new Int16Array(W * H).fill(-1);
  const inside = (c, x, y) => {
    const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / c.ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1.05) return false;
    const a = Math.atan2(dy, dx);
    const b = 0.5 + 0.5 * Math.cos(a * c.nb + c.ph);
    return d < 1 - jag * b * b + (hash(x, y, seed + c.i) - 0.5) * 0.05;
  };
  cl.forEach((c, k) => {
    for (let y = Math.max(0, Math.floor(c.y - c.ry - 1)); y <= Math.min(H - 1, Math.ceil(c.y + c.ry + 1)); y++)
      for (let x = Math.max(0, Math.floor(c.x - c.r - 1)); x <= Math.min(W - 1, Math.ceil(c.x + c.r + 1)); x++)
        if (inside(c, x, y)) own[y * W + x] = k;
  });
  const cells = new Map();
  const cell = (gx, gy) => {
    const key = gx * 1000 + gy;
    let v = cells.get(key);
    if (!v) {
      v = [(gx + 0.2 + hash(gx, gy, seed + 11) * 0.6) * leaf, (gy + 0.2 + hash(gx, gy, seed + 12) * 0.6) * leaf, hash(gx, gy, seed + 13)];
      cells.set(key, v);
    }
    return v;
  };
  const lvl = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = own[y * W + x];
      if (k < 0) continue;
      const c = cl[k];
      const lx = (x + 0.5 - c.x) / c.r, ly = (y + 0.5 - c.y) / c.ry;
      const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
      const gx = (x + 0.5 - E.x) / E.rx, gy = (y + 0.5 - E.y) / E.ry;
      const gz = Math.sqrt(Math.max(0, 1 - gx * gx - gy * gy));
      const wl = o.local ?? 0.66;
      let nx = lx * wl + gx * (1 - wl), ny = ly * wl + gy * (1 - wl), nz = lz * wl + gz * (1 - wl);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      let v = (nx * LX + ny * LY + nz * LZ) * 1.5 - (o.bias ?? 0.5);
      v -= bottomDark * 0.35 * smooth(0.1, 1, gy);
      const fx = (x + 0.5) / leaf, fy = (y + 0.5) / leaf;
      const gx0 = Math.floor(fx), gy0 = Math.floor(fy);
      let d1 = 1e9, d2 = 1e9, best = null;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const q = cell(gx0 + i, gy0 + j);
          const dd = (x + 0.5 - q[0]) ** 2 + (y + 0.5 - q[1]) ** 2;
          if (dd < d1) { d2 = d1; d1 = dd; best = q; } else if (dd < d2) d2 = dd;
        }
      const e = Math.sqrt(d2) - Math.sqrt(d1);
      const ox = (x + 0.5 - best[0]) / leaf, oy = (y + 0.5 - best[1]) / leaf;
      const texAmt = o.texAmt ?? 1;
      v += ((best[2] - 0.5) * 0.2 - (ox + oy) * 0.34) * texAmt;
      if (e < 0.65) v -= (v > 0.2 ? 0.1 : 0.2) * texAmt;
      for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) {
        const xx = x + ax, yy = y + ay;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (own[yy * W + xx] > k) { v -= 0.6; break; }
      }
      if (y + 2 < H && own[(y + 2) * W + x] > k && own[(y + 1) * W + x] === k) v -= 0.25;
      v += c.shift || 0;
      lvl[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = own[y * W + x];
      if (k < 0) continue;
      const c = cl[k];
      const cp = c.pal || pal;
      let idx = (cp.length - 1) * 0.5 + lvl[y * W + x] * (cp.length - 1) * 0.45;
      const upE = y === 0 || own[(y - 1) * W + x] < 0;
      const ulE = x === 0 || y === 0 || own[(y - 1) * W + x - 1] < 0;
      const lE = x === 0 || own[y * W + x - 1] < 0;
      const gx = (x + 0.5 - E.x) / E.rx, gy = (y + 0.5 - E.y) / E.ry;
      if ((upE || ulE) && gx + gy < 0.6) idx += rim;
      else if (lE && gx < 0.2 && gy < 0.5) idx += rim * 0.6;
      if (idx > cp.length - 2 && hash(x, y, seed + 5) > sparkle * 6) idx = Math.min(idx, cp.length - 1.6);
      p.set(x, y, cp[clamp(Math.round(idx), 0, cp.length - 1)]);
    }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (own[y * W + x] >= 0 || p.any(x, y)) continue;
      let nbk = -1;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = own[(y + ay) * W + x + ax];
        if (kk >= 0) nbk = kk;
      }
      if (nbk < 0 || hash(x, y, seed + 21) > loose) continue;
      const c = cl[nbk];
      const gx = (x + 0.5 - E.x) / E.rx, gy = (y + 0.5 - E.y) / E.ry;
      const cp = c.pal || pal;
      const I = 0.5 - (gx + gy) * 0.45 + (hash(x, y, seed + 22) - 0.5) * 0.4;
      p.set(x, y, cp[clamp(Math.round((cp.length - 1) * (0.5 + I * 0.45)), 1, cp.length - 2)]);
    }
  return own;
}

// Small mushroom with its stem foot at (x, yb) (port of natureArt).
function smallShroom(p, x, yb, h, r, capPal, stemPal, seed, o = {}) {
  const sw = Math.max(1.5, r * 0.55);
  const lean = o.lean ?? (hash(seed, 1, 7) - 0.5) * 1.5;
  for (let y = Math.round(yb - h); y <= yb; y++) {
    const t = (yb - y) / h;
    const c = x + lean * t;
    for (let k = 0; k < sw; k++) p.set(Math.floor(c - sw / 2 + k + 0.5), y, pick(stemPal, 0.6 - (k / Math.max(1, sw - 1)) * 1.2 - (t > 0.85 ? 0.5 : 0)));
  }
  const cy = yb - h, cxp = x + lean;
  for (let y = Math.floor(cy - r); y <= cy + 1; y++)
    for (let xx = Math.floor(cxp - r - 0.5); xx <= cxp + r + 0.5; xx++) {
      const nx = (xx + 0.5 - cxp) / (r + 0.4), ny = (y + 0.5 - cy) / (y + 0.5 < cy ? r * (o.tall ?? 0.85) : 1.4);
      if (nx * nx + ny * ny > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let v = (nx * LX + ny * LY + nz * LZ) * 1.4 - 0.25;
      if (ny > 0.3) v -= 0.4;
      p.set(xx, y, pick(capPal, v));
    }
  if (o.spots) {
    p.set(Math.round(cxp - r * 0.3), Math.round(cy - r * 0.5), o.spots);
    if (r > 2.5) p.set(Math.round(cxp + r * 0.45), Math.round(cy - r * 0.15), o.spots);
  } else p.set(Math.round(cxp - r * 0.4), Math.round(cy - r * 0.5), capPal[capPal.length - 1]);
}

// Glowing firefly mote: a near-white core with a dithered halo of opaque motes.
function glowMote(p, x, y, big, phase = 0) {
  const core = hx('#fbffd8'), mid = hx('#e4fa88'), halo = hx('#c8f060');
  p.set(x, y, core);
  if (big) {
    p.set(x + 1, y, mid);
    p.set(x, y + 1, mid);
  }
  const r = big ? 3 : 2;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy;
      if (!p.ok(X, Y) || p.any(X, Y)) continue;
      const d = Math.hypot(dx, dy) / (r + 0.5);
      if (d >= 1) continue;
      const th = (BAYER4[((Y + phase) & 3) * 4 + ((X + phase) & 3)] + 0.5) / 16;
      if ((1 - d) * (big ? 1.1 : 0.85) > th) p.set(X, Y, d < 0.45 ? mid : halo, 210);
    }
}

// Stamp a small picture with its own crisp outline (darkened local colour),
// so a critter reads even when it sits in front of foliage. Chars listed in
// `bare` (thin legs / antennae) are drawn without an outline.
function stampOL(p, rows, pal, x0, y0, o = {}) {
  const bare = o.bare ?? 'l';
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length;
  const col = (ch) => (pal[ch] === undefined ? null : typeof pal[ch] === 'string' ? hx(pal[ch]) : pal[ch]);
  const at = (i, j) => (j < 0 || j >= H || i < 0 || i >= rows[j].length || rows[j][i] === '.' || bare.includes(rows[j][i]) ? null : col(rows[j][i]));
  for (let j = -1; j <= H; j++)
    for (let i = -1; i <= W; i++) {
      if (at(i, j) !== null) continue;
      const n = at(i, j + 1) ?? at(i + 1, j) ?? at(i - 1, j) ?? at(i, j - 1);
      if (n === null) continue;
      if (o.noBottom && at(i, j - 1) !== null && at(i, j + 1) === null && at(i + 1, j) === null && at(i - 1, j) === null) continue;
      p.set(x0 + i, y0 + j, olc(n, o.k ?? 0.6));
    }
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = col(row[i]);
      if (row[i] !== '.' && c !== null) p.set(x0 + i, y0 + j, c);
    }
  });
}

// --- tall meadow grass (crickets & grasshoppers) ---------------------------
FARMS.tallgrass = () => finish([0, 1].map((f) => {
  const W = 32, H = 36;
  const p = new Px(W, H);
  const R = mulberry(5101);
  const cx = W / 2;
  const sway = f ? 1.2 : 0;
  // soil & thatch at the foot of the patch
  ellipse(p, cx, H - 2, 13, 2.5, (x, y, nx, ny) => pick(SOIL, 0.5 - ny * 0.8 - nx * 0.3 + (hash(x, y, 9) - 0.5) * 0.9));
  // thin straw seed stalks (behind the blades)
  const heads = [];
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4 - 0.5;
    const len = 26 + R() * 6 - Math.abs(t) * 8;
    const [tx, ty] = blade(p, cx + t * 14, H - 3, len, t * 5 + (R() - 0.5) * 1.5 + sway * 1.2, sway * 0.5, 1, STRAW.slice(0, 4));
    heads.push([tx, ty, i]);
  }
  const layers = [
    { n: 7, len: [17, 24], pal: GRASS_BACK, w: 2, bright: 0, spread: 18 },
    { n: 8, len: [11, 17], pal: GRASS, w: 1, bright: 0.05, spread: 22 },
    { n: 7, len: [5, 9], pal: GRASS, w: 1, bright: 0.2, spread: 23 },
  ];
  for (const L of layers)
    for (let i = 0; i < L.n; i++) {
      const t = (i + 0.5) / L.n - 0.5;
      const x = cx + t * L.spread + (R() - 0.5) * 1.5;
      const len = L.len[0] + R() * (L.len[1] - L.len[0]) * (1 - Math.abs(t) * 0.8);
      const lean = t * 7 + (R() - 0.5) * 2.5 + sway * (len / 22);
      const curl = (Math.abs(t) > 0.25 ? Math.sign(t) * (1.5 + R() * 3) : (R() - 0.5) * 3) + sway * 0.6;
      blade(p, x, H - 2.5 + R() * 0.8, len, lean, curl, L.w, L.pal, { bright: L.bright, taper: 0.7 });
    }
  // seed heads: timothy spikes and a nodding oat spray
  for (const [tx, ty, i] of heads) {
    const x = Math.round(tx), y = Math.round(ty);
    stamp(p, ['.h', 'hH', 'Hh', 'hA', 'HA', 'Aa'], { h: STRAW[5], H: STRAW[4], A: STRAW[3], a: STRAW[2] }, x - (i < 2 ? 1 : 0), y - 4);
  }
  stamp(p, ['.w.', 'wWw', '.g.'], { w: '#f0a8cc', W: '#ffe4f0', g: '#4f8a3c' }, 6, H - 8);
  stamp(p, ['.y.', 'yYy', '.g.'], { y: '#f4c838', Y: '#fff0a0', g: '#4f8a3c' }, W - 9, H - 7);
  for (let x = 0; x < W; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.3));
  outline(p, { noBottom: true, k: 0.5, lit: 0.42 });
  // residents: a grasshopper clinging to the grass, a cricket in the thatch
  const gx = Math.round(W * 0.6 + sway * 0.5), gy = 14 - f;
  stampOL(p, ['.F.....l', 'FFf..Gl.', '.fFggGGe', 'l.ffgggg', 'l....l.l'], { F: '#d4f08c', f: '#8ccc48', g: '#80c440', G: '#c4ec7c', e: '#2a2410', l: '#2a4a1a' }, gx, gy);
  stampOL(p, ['......ll', '.FF..l..', 'FfkkkKe.', '.kkkkkkk', 'l...l.l.'], { k: '#2a2226', K: '#4e3e3a', F: '#9a7a5c', f: '#5a4436', e: '#f0e0b8', l: '#1e1618' }, 4, H - 7 + f, { noBottom: true });
  for (const [x, y] of spotsIn(p, 1, R, [9, 12, W - 9, H - 12], 6)) dew(p, x, y);
  return p;
}), 'ground');

// --- compost bin (dark soil, eggshells, a worm peeking out) -----------------
FARMS.compost = () => finish([0, 1].map((f) => {
  const W = 30, H = 28;
  const p = new Px(W, H);
  const R = mulberry(5201);
  const x0 = 1, x1 = W - 2; // front face
  const rimY = 13; // top of the front rim
  const backY = 9; // back rim
  // back wall (top edge visible behind the heap) and back posts
  for (let x = x0 + 1; x < x1; x++) {
    p.set(x, backY, pick(WOOD, 0.45 - (x / W) * 0.3));
    p.set(x, backY + 1, pick(WOOD, -0.3));
  }
  for (const x of [x0, x1]) for (let y = backY - 2; y <= rimY; y++) p.set(x, y, pick(WOOD, x === x0 ? 0.2 : -0.4));
  // the heap: dark crumbly compost mounded above the rim
  ellipse(p, W / 2, rimY + 1, (x1 - x0) / 2 - 0.5, 9.5, (x, y, nx, ny) => {
    if (y > rimY + 1) return null;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let v = (nx * LX + ny * LY + nz * LZ) * 1.2 - 0.25 + (hash(x, y, 51) - 0.5) * 0.9;
    if (hash(x >> 1, y, 52) < 0.08) v += 0.7; // crumbs catching the light
    return pick(SOIL, v);
  });
  // scraps in the heap: eggshells, an apple core, leaves, a twig
  const egg = { w: '#fbf6ea', W: '#ffffff', s: '#d8ccb8', i: '#c8b898' };
  stamp(p, ['.wW.', 'wsiw'], egg, 9, rimY - 6);
  stamp(p, ['Ww', 'si'], egg, 19, rimY - 3);
  stamp(p, ['.W', 'wi'], egg, 5, rimY - 1);
  stamp(p, ['.s.', 'rRr', 'rcr', '.r.'], { s: '#5a3a1a', r: '#e04a32', R: '#ff8a6a', c: '#f4e0b0' }, 14, rimY - 5);
  stamp(p, ['oO.', '.oo'], { o: '#d8782a', O: '#f8a848' }, 21, rimY - 6);
  stamp(p, ['y..', '.yY'], { y: '#c8a030', Y: '#f0cc50' }, 7, rimY - 3);
  line(p, 11, rimY - 2, 15, rimY - 1, hx('#7a5a3a'));
  // a worm poking out of the heap (frame 1: it stretches up and leans)
  const worm = f
    ? ['..Pp', '.Pp.', '.pd.', 'Pp..', 'pd..']
    : ['....', '.PP.', 'Pp.p', 'pd..', 'pd..'];
  stamp(p, worm, { P: '#ffb8c0', p: '#e88a98', d: '#b85a74' }, 17, rimY - 11 + (f ? 0 : 1));
  // front rim plank and slatted front with gaps showing the compost
  for (let x = x0; x <= x1; x++) {
    p.set(x, rimY, pick(WOOD, 0.95 - (x / W) * 0.25));
    p.set(x, rimY + 1, pick(WOOD, 0.4 - (x / W) * 0.3));
  }
  for (let y = rimY + 2; y < H; y++) {
    const k = (y - rimY - 2) % 4; // 3px slat + 1px gap
    for (let x = x0; x <= x1; x++) {
      const post = x < x0 + 2 || x > x1 - 2;
      if (k === 3 && !post) {
        p.set(x, y, pick(SOIL, -0.2 + (hash(x, y, 53) < 0.18 ? 0.8 : 0)));
        continue;
      }
      let v = 0.45 - k * 0.3 - (x / W) * 0.35 + (hash(x >> 2, y, 54) - 0.5) * 0.3;
      if (post) v += x < x0 + 2 ? 0.25 : -0.15;
      if (H - 1 - y < 1) v -= 0.4;
      p.set(x, y, pick(WOOD, v));
    }
  }
  // nail heads and a little hand-lettered tag
  for (const x of [x0 + 1, x1 - 1]) for (const y of [rimY + 3, rimY + 7, rimY + 11]) if (y < H) p.set(x, y, hx('#c8ccd4'));
  // moss creeping up the bottom slat
  for (let x = x0 + 2; x < x1 - 1; x++) if (hash(x, 3, 55) < 0.35) p.set(x, H - 1 - (hash(x, 4, 55) < 0.5 ? 1 : 0), MOSS[3 + (x & 1)]);
  outline(p, { noBottom: true });
  // a fly buzzing over the heap
  const fx = f ? 22 : 24, fy = f ? 1 : 2;
  p.set(fx, fy, hx('#2a2a30')); p.set(fx + 1, fy, hx('#2a2a30')); p.set(fx, fy - 1, hx('#e4f2fe')); p.set(fx + 1, fy - 1, hx('#b0cce8'));
  // a dew drop on an eggshell
  for (const [x, y] of spotsIn(p, 1, R, [6, rimY - 6, W - 6, rimY], 6)) dew(p, x, y);
  return p;
}), 'ground');

// --- bog pool (flat decal: murky water, reeds, lily pad, rings) ------------
FARMS.bogpool = () => finish([0, 1].map((f) => {
  const W = 34, H = 24;
  const p = new Px(W, H);
  const R = mulberry(5301);
  const cx = W / 2, cy = H - 7.5, rx = 15.5, ry = 6.2;
  const ph = R() * 6;
  const inside = (nx, ny, k) => Math.hypot(nx, ny) < k + 0.05 * Math.sin(Math.atan2(ny, nx) * 3 + ph) + 0.04 * Math.sin(Math.atan2(ny, nx) * 5 + ph * 2);
  // reed clumps at the back corners (drawn first: behind the bank)
  const reed = pals(['#22301e', '#34462a', '#4c5e30', '#687636', '#88903e', '#a8a854', '#ccc478']);
  const cat = { h: '#a8743e', H: '#d09a5a', b: '#7a4a2a', B: '#4e2e1e' };
  const sw = f ? 0.7 : 0;
  const clumps = [[6, cy - 4.5, [[0, 14, -1.5, 2, true], [2, 10, 0.5, 1], [-2, 8, -3, 1], [3, 6, 2.5, 1]]], [W - 6, cy - 4.5, [[0, 11, 1.2, 2, true], [-2, 8, -1, 1], [2, 6, 2.5, 1]]]];
  for (const [bx, by, list] of clumps)
    for (const [dx, len, lean, w, head] of list) {
      const [tx, ty] = blade(p, bx + dx, by, len, lean + sw, head ? 0 : lean * 0.8, w, reed, { taper: 0.6 });
      if (head) stamp(p, ['.H.', 'hHb', 'hHb', 'hbB', 'hbB', '.B.'], cat, Math.round(tx) - 1, Math.round(ty));
    }
  // muddy bank with moss tufts, and the pool
  ellipse(p, cx, cy, rx, ry, (x, y, nx, ny) => {
    if (!inside(nx, ny, 1)) return null;
    if (!inside(nx, ny, 0.83)) {
      const moss = hash(x >> 1, y, 5302) < 0.42 && ny < 0.6;
      return moss ? pick(MOSS, 0.6 - ny * 0.7 - nx * 0.25 + (hash(x, y, 5303) - 0.5) * 0.6) : pick(MUD, 0.45 - ny * 0.7 - nx * 0.2 + (hash(x, y, 5304) - 0.5) * 0.5);
    }
    let v = -0.3 + ny * 0.2 - nx * 0.12; // tea-dark bog water
    if (ny > -0.35 && ny < 0.15) v += 0.5; // reflected sky band
    if (ny < -0.62) v -= 0.25; // far bank's shadow
    if (ny > 0.6) v -= 0.2;
    return pick(BOG, v);
  });
  // sky glints (dashes) drift a pixel on frame 1
  for (const [gx, gy, n] of [[cx - 9, cy - 1, 3], [cx + 1, cy, 2], [cx - 3, cy - 2, 1]]) for (let k = 0; k < n; k++) p.tint(Math.round(gx + k + (f ? 1 : 0)), Math.round(gy), k ? BOG[7] : BOG[8]);
  // ripple ring (grows on frame 1)
  const ring = (rcx, rcy, r, c) => {
    const n = Math.round(r * 9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const X = Math.floor(rcx + Math.cos(a) * r), Y = Math.floor(rcy + Math.sin(a) * r * 0.45);
      if (inside((X + 0.5 - cx) / rx, (Y + 0.5 - cy) / ry, 0.8)) p.tint(X, Y, Math.sin(a) < 0 ? c : mix(c, BOG[4], 0.5));
    }
  };
  ring(cx - 6, cy + 2.5, f ? 4 : 2.6, BOG[7]);
  if (f) p.tint(Math.round(cx - 6), Math.round(cy + 2.5), BOG[7]);
  // lily pad with a pink flower
  const pad = pals(['#1e3a20', '#2e5a2a', '#4c8c3c', '#72b04a', '#a6d466']);
  ellipse(p, cx + 6, cy + 1.6, 4.2, 2, (x, y, nx, ny) => {
    const a = Math.atan2(ny, nx);
    if (Math.abs(a - 0.6) < 0.35 && Math.hypot(nx, ny) > 0.2) return null;
    return pick(pad, 0.35 - nx * 0.4 - ny * 0.6 + (Math.hypot(nx, ny) > 0.8 ? -0.5 : 0));
  });
  stamp(p, ['.W.', 'wYw', 'pPp'], { W: '#fff4fa', w: '#ffc4dc', p: '#f08ab8', P: '#c0588e', Y: '#ffe060' }, Math.round(cx + 4), Math.round(cy - 1.2));
  // a small lily pad and a stone on the bank
  ellipse(p, cx + 12, cy - 1, 1.8, 0.9, (x, y, nx, ny) => pick(pad, 0.2 - ny - nx * 0.4));
  stamp(p, ['.lL.', 'lmmd', 'mmdd'], { L: '#c2c8cc', l: '#a8aeb6', m: '#767e8a', d: '#4c505e' }, 3, cy + 1);
  outline(p, { noBottom: true, k: 0.55, lit: 0.45 });
  // a water strider skating (1px legs) and a mosquito over the reeds
  const sx = Math.round(cx - 1 + (f ? -1 : 0)), sy = Math.round(cy - 2);
  const k = hx('#2a2430');
  p.set(sx, sy, hx('#6a6274')); p.set(sx + 1, sy, hx('#4a4454')); p.set(sx + 2, sy, k);
  for (const [dx, dy] of [[-1, 1], [-2, 1], [3, 1], [4, 1], [-1, -1], [3, -1]]) p.set(sx + dx, sy + dy, k);
  p.tint(sx - 3, sy + 1, BOG[8]); p.tint(sx + 5, sy + 1, BOG[8]);
  const mx = f ? 25 : 24, my = f ? 2 : 3;
  p.set(mx, my, hx('#3a3438')); p.set(mx + 1, my, hx('#3a3438')); p.set(mx, my - 1, hx('#e4f2fe')); p.set(mx - 1, my + 1, hx('#3a3438')); p.set(mx + 2, my + 1, hx('#3a3438'));
  return p;
}), 'ground');

// --- rotting log (mossy, hollow, mushrooms and a beetle) -------------------
FARMS.rottinglog = () => finish([0, 1].map((f) => {
  const W = 34, H = 24;
  const p = new Px(W, H);
  const R = mulberry(5401);
  const top = 10, bot = H - 1; // log body rows
  const r = (bot - top) / 2, cy = top + r;
  const ex = 6.5, ew = 4.6; // hollow end (ellipse centre / half width)
  // bark cylinder, slightly sagging and broken at the far end
  for (let x = Math.floor(ex); x < W - 1; x++) {
    const sag = Math.round(Math.sin((x / W) * Math.PI) * 0.6);
    const endCut = x > W - 4 ? (x - (W - 4)) * 1.2 : 0;
    for (let y = top + sag + Math.round(endCut * 0.6); y <= bot - (x > W - 3 ? 1 : 0); y++) {
      const ny = (y + 0.5 - cy) / (r + 0.5);
      const furrow = hash(Math.floor(x / 3 + hash(y, 0, 5402) * 3), y, 5402) < 0.3 ? -0.45 : 0;
      const rot = hash(x >> 2, y >> 1, 5403) < 0.1 ? 0.35 : 0; // pale rotten patches
      p.set(x, y, pick(BARK, -ny * 0.8 + 0.1 + furrow + rot + (hash(x, y, 5404) - 0.5) * 0.15 - (x > W - 5 ? 0.25 : 0)));
    }
  }
  // hollow end facing us: bark rim, soft punky wood ring, dark tunnel
  for (let y = top - 1; y <= bot; y++)
    for (let x = Math.floor(ex - ew - 1); x <= ex + ew + 1; x++) {
      const nx = (x + 0.5 - ex) / ew, ny = (y + 0.5 - cy) / (r + 0.9);
      const d = Math.hypot(nx, ny);
      if (d > 1) continue;
      if (d > 0.84) { p.set(x, y, BARK[ny < 0 ? 4 : 2]); continue; }
      if (d > 0.62) { p.set(x, y, WOODEND[clamp(Math.round(3.4 - ny * 1.6 - nx * 0.8 + (hash(x, y, 5405) - 0.5)), 0, 5)]); continue; }
      // inside: darkest deep in, lighter lip at the bottom catching light
      const v = -0.9 + Math.max(0, ny) * 0.6 + (d > 0.5 ? 0.25 : 0);
      p.set(x, y, pick(SOIL, v));
    }
  // moss blanket on top, spilling down the sides
  for (let x = Math.floor(ex) + 2; x < W - 4; x++) {
    const sag = Math.round(Math.sin((x / W) * Math.PI) * 0.6);
    const d = 1 + Math.floor(hash(x >> 1, 2, 5406) * 3) + (hash(x >> 3, 3, 5406) < 0.4 ? 2 : 0);
    for (let k = -1; k < d; k++) {
      const y = top + sag + k;
      if (k < 0 && hash(x, 7, 5406) < 0.5) continue;
      p.set(x, y, MOSS[clamp(5 - (k + 1) - (hash(x, y, 5407) < 0.3 ? 1 : 0), 1, 5)]);
    }
  }
  // moss drapes over the hollow's rim too
  for (let x = Math.floor(ex - 3); x <= ex + 3; x++) p.set(x, top - 1, MOSS[4 + (hash(x, 1, 5408) < 0.4 ? 1 : 0)]);
  // bracket fungi on the side
  const shelf = pals(['#5a2e1a', '#8a4a22', '#b8702e', '#dc9a48', '#f4c878', '#fff0c0']);
  for (const [sx, sy, w] of [[W * 0.5, top + 6, 5], [W * 0.54, top + 9, 4], [W * 0.78, top + 5, 4]]) {
    for (let k = 0; k < w; k++) {
      const u = k / (w - 1);
      p.set(Math.round(sx + k), Math.round(sy), shelf[4 - (u > 0.7 ? 1 : 0)]);
      p.set(Math.round(sx + k), Math.round(sy + 1), shelf[u < 0.2 ? 3 : 2]);
      if (k > 0 && k < w - 1) p.set(Math.round(sx + k), Math.round(sy + 2), shelf[1]);
    }
    p.set(Math.round(sx + 1), Math.round(sy), shelf[5]);
  }
  // mushrooms sprouting from the moss
  smallShroom(p, W * 0.36, top, 5, 2.8, CAP_ORANGE, STEM, 5411);
  smallShroom(p, W * 0.42, top + 1, 3, 2, CAP_ORANGE, STEM, 5412);
  smallShroom(p, W * 0.66, top, 6, 3, CAP_RED, STEM, 5413, { spots: hx('#fff6e8') });
  smallShroom(p, W * 0.74, top + 1, 3, 1.8, CAP_TAN, STEM, 5414);
  // fern sprig at the far end, grass at the near end
  for (let i = 0; i < 3; i++) blade(p, W - 6 + i, top + 2, 5 + i, 2 - i * 0.5, 2, 1, pals(['#1c3e26', '#2c5a30', '#44803a', '#6fa84a', '#a6d072']));
  for (let i = 0; i < 4; i++) blade(p, 1 + i * 1.3, bot, 3 + R() * 3, (R() - 0.5) * 3, 0, 1, GRASS);
  for (let x = 0; x < W; x++) if (p.on(x, bot)) p.set(x, bot, mix(p.get(x, bot), INK, 0.3));
  outline(p, { noBottom: true });
  // residents: a green beetle on the bark, and a pill bug peeking out of the
  // hollow (frame 1: it has crept out a little further)
  const bx = Math.round(W * 0.6) + (f ? 1 : 0);
  stampOL(p, ['....M.', '.KKkhM', 'KWkkhh', 'kkkkk.', 'l.l.l.'], { k: '#42241f', K: '#7a4a38', W: '#f0c8a8', h: '#34201e', M: '#d0784a', l: '#1e1414' }, bx, bot - 6);
  stampOL(p, f ? ['.GGG.', 'GWgGg', 'gsgsg'] : ['.GG.', 'GWgG', 'gsgs'], { G: '#c0c4d0', W: '#eef0f8', g: '#8a8c9c', s: '#5a5c6c' }, Math.round(ex - 2) - (f ? 1 : 0), Math.round(cy) - 1);
  for (const [x, y] of spotsIn(p, 1, R, [12, top - 3, W - 8, top + 3], 8)) dew(p, x, y);
  return p;
}), 'ground');

// --- glow meadow (dusky grass, firefly motes, a glass jar) -----------------
FARMS.glowmeadow = () => finish([0, 1].map((f) => {
  const W = 30, H = 32;
  const p = new Px(W, H);
  const R = mulberry(5501);
  const cx = W / 2;
  // twilight soil and dusky grass tuft
  ellipse(p, cx, H - 2, 12, 2.4, (x, y, nx, ny) => pick(pals(['#140e1c', '#1e1626', '#2a2030', '#3a2c3a']), 0.4 - ny * 0.8 + (hash(x, y, 9) - 0.5) * 0.8));
  const dusk2 = pals(['#16203a', '#1c3044', '#24464e', '#2e5c56', '#3c745c', '#5a8e6a', '#80aa80', '#a8c89a']);
  const layers = [
    { n: 8, len: [14, 21], pal: DUSK, w: 2, spread: 17 },
    { n: 9, len: [9, 15], pal: dusk2, w: 1, spread: 21 },
    { n: 7, len: [4, 8], pal: dusk2, w: 1, spread: 22 },
  ];
  for (const L of layers)
    for (let i = 0; i < L.n; i++) {
      const t = (i + 0.5) / L.n - 0.5;
      const len = L.len[0] + R() * (L.len[1] - L.len[0]) * (1 - Math.abs(t) * 0.8);
      blade(p, cx + t * L.spread + (R() - 0.5) * 1.5, H - 2.5 + R() * 0.8, len, t * 7 + (R() - 0.5) * 2.5 + (f ? 0.6 : 0), Math.abs(t) > 0.25 ? Math.sign(t) * (1.5 + R() * 3) : (R() - 0.5) * 3, L.w, L.pal, { taper: 0.7 });
    }
  // bluebells / pale evening primrose
  stamp(p, ['.b.', 'bBb', '.g.'], { b: '#8aa8f0', B: '#d0dcff', g: '#2e5c56' }, 5, H - 9);
  stamp(p, ['.y.', 'yYy', '.g.'], { y: '#f0e090', Y: '#fffce0', g: '#2e5c56' }, 20, H - 11);
  // a mason jar at the front with fireflies glowing inside
  const jx = 16, jy = H - 14; // top-left of the jar
  const glass = { G: '#b8d4e2', g: '#7c9cb4', d: '#48627c', h: '#ffffff', L: '#d8b058', l: '#9a7432', k: '#6a4e24', t: '#c8b088', T: '#9a8058', i: '#24384a', j: '#3a6458', Y: '#fcffd8', y: '#e4fa88' };
  const dot = (a, b) => (f ? b : a);
  const jar = [
    '..kLLLLk..',
    '..lLLLLl..',
    '...tTtT...',
    '..GgiigG..',
    '.GhjjjjjG.',
    'Ghjj' + dot('Y', 'j') + 'jjjjd',
    'Ghjjjj' + dot('j', 'Y') + 'yjd',
    'Gh' + dot('j', 'y') + 'Yjjjjjd',
    'Ghjjjjj' + dot('Y', 'j') + 'jd',
    'Ghjj' + dot('y', 'Y') + 'jjjjd',
    'gGjjjjjjdd',
    '.gGGGGGgd.',
  ];
  stamp(p, jar, glass, jx, jy);
  outline(p, { noBottom: true, k: 0.5, lit: 0.42 });
  // the jar's glow leaks through the glass a little
  aura(p, 2.5, hx('#d8ff70'), 0.55, (x, y) => x >= jx && x < jx + 8 && y >= jy + 3 && y < jy + 9 && (p.get(x, y) === hx('#fcffd8')), { hi: hx('#f8ffc0'), seed: f });
  // fireflies drifting over the grass (they swap places on frame 1)
  const motes = f
    ? [[7, 6, 1], [19, 3, 0], [26, 9, 1], [4, 14, 0], [12, 10, 0], [24, 1, 0]]
    : [[9, 3, 0], [17, 7, 1], [26, 4, 0], [5, 11, 1], [12, 14, 0], [22, 1, 0]];
  for (const [x, y, big] of motes) glowMote(p, x, y, big === 1, f);
  return p;
}), 'ground');

// --- butterfly bush (purple flower spikes, a monarch visiting) -------------
FARMS.butterflybush = () => finish([0, 1].map((f) => {
  const W = 32, H = 38;
  const p = new Px(W, H);
  const R = mulberry(5601);
  const cx = W / 2;
  // mulch at the base and a few woody stems
  ellipse(p, cx, H - 1.6, 10, 2.2, (x, y, nx, ny) => pick(pals(['#2a1a18', '#46302a', '#6a4a36', '#8a6444']), 0.3 - ny - nx * 0.3 + (hash(x, y, 9) - 0.5) * 1.2));
  const stem = pals(['#3a2826', '#5a4036', '#7a5a46']);
  for (const [dx, lean] of [[-2, -3], [0, 0], [2, 3]]) line(p, cx + dx, H - 2, cx + dx + lean, H - 9, (x, y) => p.set(x, y, pick(stem, dx < 0 ? 0.3 : -0.3)));
  // flower spikes (behind + in front of the leaves): long tapering cones of
  // tiny lilac florets with orange eyes, arching outwards
  const lilac = pals(['#3a1e52', '#5a2e7a', '#7a44a4', '#9a62c8', '#bc8ae0', '#dcb8f4', '#f4e4ff']);
  const spike = (bx, by, ang, len, wid) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / len;
      const w = wid * (1 - t * 0.75) * (t < 0.1 ? 0.6 + t * 4 : 1);
      const px0 = bx + dx * s + t * t * 2.5 * Math.sign(dx), py0 = by + dy * s + t * t * t * 4 * Math.abs(dx);
      for (let k = -w; k <= w; k += 0.5) {
        const x = Math.round(px0 - dy * k), y = Math.round(py0 + dx * k);
        const side = k / Math.max(0.5, w); // -1 .. 1 across the spike
        let v = 0.45 - side * 0.5 * Math.sign(-dx || 1) + (hash(x, y, 5602) - 0.5) * 0.9 - (t < 0.15 ? 0.3 : 0);
        p.set(x, y, pick(lilac, v));
      }
    }
    // a few orange floret eyes
    for (let i = 0; i < 4; i++) {
      const s = len * (0.2 + i * 0.18);
      const x = Math.round(bx + dx * s), y = Math.round(by + dy * s);
      if (hash(x, y, 5603) < 0.7) p.set(x, y, hx('#ffb040'));
    }
    return [Math.round(bx + dx * len + 2.5 * Math.sign(dx)), Math.round(by + dy * len + 4 * Math.abs(dx))];
  };
  const sway = f ? 0.07 : 0;
  // back spikes (behind the leaves)
  spike(cx - 3, 15, -Math.PI / 2 - 0.42 + sway, 11, 1.6);
  spike(cx + 1, 14, -Math.PI / 2 - 0.05 + sway, 12, 1.7);
  const tip = spike(cx + 5, 15, -Math.PI / 2 + 0.45 + sway, 10, 1.6);
  // leafy bush: lance-shaped leaves in clusters
  canopy(p, [
    { x: cx - 7, y: H - 12, r: 5.5, ry: 4.6 }, { x: cx + 7, y: H - 12, r: 5.5, ry: 4.6 }, { x: cx, y: H - 16, r: 6.5, ry: 5.2 },
    { x: cx - 3, y: H - 9, r: 5, ry: 4, front: 3 }, { x: cx + 4, y: H - 8.5, r: 4.6, ry: 3.8, front: 3 },
  ], { pal: LEAF, seed: 5604, leaf: 2.6, loose: 0.4, jag: 0.26, bump: 2.6, bias: 0.45, local: 0.8, rim: 1.1 });
  // front spikes arching out and nodding
  spike(cx - 7, H - 16, -Math.PI / 2 - 1.0 + sway, 10, 1.6);
  spike(cx + 8, H - 16, -Math.PI / 2 + 1.0 + sway, 9, 1.5);
  spike(cx - 2, H - 18, -Math.PI / 2 - 0.2 + sway, 7, 1.4);
  spike(cx + 3, H - 17, -Math.PI / 2 + 0.35 + sway, 6, 1.3);
  outline(p, { noBottom: true });
  // a monarch sipping on the top-right spike (frame 1: wings half closed)
  const mx = tip[0] - 3, my = tip[1] - 5;
  const mon = { k: '#241820', O: '#ffaa3a', o: '#f07a1e', w: '#fff8ec', b: '#3a2c30' };
  if (!f) stamp(p, ['kkk.kkk', 'kOOkOwk', 'kOokoOk', '.kkbkk.', '.kOkOk.', '..k.k..'], mon, mx, my);
  else stamp(p, ['..k.k..', '.kOkOk.', '.kOkwk.', '..kbk..', '..kok..', '...k...'], mon, mx, my);
  return p;
}), 'ground');

// ===========================================================================
// Registry
// ===========================================================================
// name + two key colours per bug; `anim` lists which frame indices make up
// each loop (most bugs simply loop all their frames). Special frames:
//   cricket / grasshopper: frame 2 = mid-hop (legs kicked back, body raised)
//   pillbug: frame 2 = rolled into a ball (hold it, don't loop it)
//   rhinobeetle: frame 2 = walk frame with a twinkle (fine to loop: it glints)
//   monarch: 0 open, 1 half, 2 closed - looks best ping-ponged 0,1,2,1
export const BUG_ART = {
  ladybug: { name: 'Ladybug', colors: ['#e8352c', '#26161e'], anim: { walk: [0, 1] } },
  firefly: { name: 'Firefly', colors: ['#e4fa88', '#2e2622'], anim: { fly: [0, 1] } },
  mayfly: { name: 'Mayfly', colors: ['#ecd08a', '#f8f4e6'], anim: { fly: [0, 1] } },
  dragonfly: { name: 'Dragonfly', colors: ['#4898f0', '#3cb878'], anim: { fly: [0, 1] } },
  damselfly: { name: 'Damselfly', colors: ['#30d0c8', '#123040'], anim: { fly: [0, 1] } },
  cricket: { name: 'Cricket', colors: ['#2a2226', '#8a6c52'], anim: { walk: [0, 1], hop: [2] } },
  grasshopper: { name: 'Grasshopper', colors: ['#86c844', '#ece070'], anim: { walk: [0, 1], hop: [2] } },
  katydid: { name: 'Katydid', colors: ['#6ccc50', '#e0ffb0'], anim: { walk: [0, 1] } },
  junebug: { name: 'June Bug', colors: ['#5e8e3a', '#946a30'], anim: { fly: [0, 1] } },
  stagbeetle: { name: 'Stag Beetle', colors: ['#42241f', '#d0784a'], anim: { walk: [0, 1] } },
  rhinobeetle: { name: 'Rhino Beetle', colors: ['#4a3e78', '#f0d080'], anim: { walk: [0, 1, 2] } },
  mealworm: { name: 'Mealworm', colors: ['#e8b048', '#a86a28'], anim: { walk: [0, 1] } },
  earthworm: { name: 'Earthworm', colors: ['#e88a98', '#b85a74'], anim: { walk: [0, 1] } },
  grub: { name: 'Grub', colors: ['#f6eedc', '#d8822a'], anim: { walk: [0, 1] } },
  waterstrider: { name: 'Water Strider', colors: ['#3a3442', '#8ac8e8'], anim: { walk: [0, 1] } },
  mosquito: { name: 'Mosquito', colors: ['#3a3438', '#d8d0c8'], anim: { fly: [0, 1] } },
  bumblebee: { name: 'Bumblebee', colors: ['#ffd23a', '#2a2024'], anim: { fly: [0, 1] } },
  monarch: { name: 'Monarch', colors: ['#ffaa3a', '#241820'], anim: { fly: [0, 1, 2, 1] } },
  lunamoth: { name: 'Luna Moth', colors: ['#c4eeaa', '#9a4a78'], anim: { fly: [0, 1] } },
  pillbug: { name: 'Pill Bug', colors: ['#8a8c9c', '#4a4a5a'], anim: { walk: [0, 1], ball: [2] } },
};

const OUT = {};
for (const [id, fn] of Object.entries(BUGS)) OUT['bug_' + id] = () => fn().map(toRGBA);
for (const [id, fn] of Object.entries(ICONS)) OUT['bugicon_' + id] = () => fn().map(toRGBA);
for (const [id, fn] of Object.entries(FARMS)) OUT['farm_' + id] = () => fn().map(toRGBA);
export const EXTRA_SPRITES = OUT;
