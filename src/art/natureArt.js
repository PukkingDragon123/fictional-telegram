// Pixel-art nature sprites for "The Bear Must Eat": trees, bushes, ground
// cover, rocks & wood, water plants, birds, bugs and small critters.
//
// Scale: 24 texels per world unit. Every sprite is drawn in a 3/4 front view
// (camera-facing billboard) with light from the top-left, hue-shifted shading
// (cool purple shadows, warm yellow highlights) and a 1px outline that is a
// darkened version of the local colour. Grounded sprites anchor at their
// bottom centre, flying ones at their centre, flat water plants at the centre.
//
// Big things (trees, bushes, rocks, logs) are generated procedurally from a
// fixed seed, small things (flowers, birds, bugs) are hand-authored pixel
// strings. Nothing is drawn at import time: buildNatureAtlas() renders every
// frame on first call, packs them into one power-of-two atlas and caches it.
//
// v3 additions (bigger map, new biomes): mushroom forest (giant fly agaric,
// bolete with a door, glowing caps), swamp (cypress, tamarack, dead trees,
// sedge, bog pads, algae, pitcher plant, bubbles), water & land details
// (puddles, ripples, rapids, stepping stones, river rocks), weeds & plowed
// soil, demolish leftovers, the Great Willow landmark, berry bushes with
// full/_picked states, buildable plants and more critters.
//  - Anchors: grounded sprites bottom centre (ay = h), flat ones (water
//    surface / ground decals: bogpad, algae, puddle, ripplering, rapids,
//    steppingstone, plowed, chips, bubbles) and flying ones at the centre.
//  - Glow (glow shrooms, glowcaps, goldenberry, firefly_big, willow lanterns):
//    the game alpha-tests at 0.5, so halos are dithered opaque motes
//    (alpha >= 150), never smooth alpha. Emissive pixels are near-white
//    unshaded colours, ready for an unlit / additive pass if wanted.
//  - Aliases (build_berrybush_*, appletree_bare) share their target's
//    frames: they are packed once and point at the same atlas rects.
//  - Atlas cap is 4096 (power of two); the full v3 set packs into 1024x512.

export const NATURE_TEXELS_PER_UNIT = 24;

// ===========================================================================
// Small math / colour helpers
// ===========================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

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
  h = ((h % 360) + 360) % 360 / 360;
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
// Rotate hue h towards `target` by at most `amt` degrees (shortest way round).
function hueToward(h, target, amt) {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}
// Hue-shifted shade: t < 0 darker & cooler (towards violet), t > 0 lighter &
// warmer (towards yellow).
function shade(c, t, o = {}) {
  const { hue = 26, sat = 0.12 } = o;
  const [h, s, l] = toHsl(c);
  if (t < 0) {
    const k = -t;
    return fromHsl(hueToward(h, 255, hue * k), clamp(s * (1 + sat * k), 0, 1), l * (1 - 0.62 * k));
  }
  return fromHsl(hueToward(h, 52, hue * 0.8 * t), clamp(s * (1 - 0.1 * t), 0, 1), l + (1 - l) * 0.62 * t);
}
// n-step ramp from dark to light around a base colour.
function ramp(base, n = 6, lo = 0.9, hi = 0.75, o) {
  const c = typeof base === 'string' ? hx(base) : base;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    out.push(shade(c, t < 0 ? t * lo : t * hi, o));
  }
  return out;
}
const pals = (arr) => arr.map((s) => (typeof s === 'string' ? hx(s) : s));

// Outline colour: a darkened, slightly purple-shifted version of the local colour.
const INK = hx('#1d1428');
const olc = (c, k = 0.6) => mix(c, INK, k);

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
    const i = y * this.w + x;
    this.c[i] = c;
    this.a[i] = a;
  }
  del(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.ok(x, y)) this.a[y * this.w + x] = 0;
  }
  // Recolour an existing opaque pixel.
  tint(x, y, c) {
    if (this.on(x, y)) this.c[y * this.w + x] = c;
  }
  clone() {
    const p = new Px(this.w, this.h);
    p.c.set(this.c);
    p.a.set(this.a);
    return p;
  }
  // Copy `src` onto this buffer at (ox, oy) (alpha-over, opaque pixels win).
  blit(src, ox = 0, oy = 0, flip = false) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = flip ? src.w - 1 - x : x;
        const i = y * src.w + sx;
        if (src.a[i] === 0) continue;
        const tx = x + ox, ty = y + oy;
        if (!this.ok(tx, ty)) continue;
        const j = ty * this.w + tx;
        if (src.a[i] >= 255 || this.a[j] === 0) {
          this.c[j] = src.c[i];
          this.a[j] = Math.max(src.a[i], this.a[j]);
        } else {
          this.c[j] = mix(this.c[j], src.c[i], src.a[i] / 255);
        }
      }
  }
}

// Add a 1px outline around every opaque shape. Pixels on the lit top/left side
// get a lighter outline than the shaded bottom/right side (selective outline).
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

// Bresenham line.
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

// Filled ellipse with a per-pixel colour callback fn(x, y, nx, ny) where
// nx, ny are the normalised offsets from the centre (-1..1).
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

// Pick a ramp colour from an intensity in [-1, 1].
const pick = (pal, I) => pal[clamp(Math.round(((I + 1) / 2) * (pal.length - 1)), 0, pal.length - 1)];

// Light direction (screen space: x right, y down, z towards the viewer).
const LX = -0.55, LY = -0.72, LZ = 0.42;

// ===========================================================================
// Palettes
// ===========================================================================
const P = {
  // conifers (deep blue-green spruce, warmer pine, soft blue white pine)
  spruce: pals(['#0f2229', '#142f35', '#1a3f3f', '#215048', '#2a6250', '#377558', '#4b8a5e', '#6aa368', '#94c078']),
  pine: pals(['#14261f', '#1b3526', '#23462c', '#2d5731', '#396a36', '#4b7d3c', '#619145', '#7ea84f', '#a6c266']),
  wpine: pals(['#152629', '#1b3534', '#22463f', '#2c5848', '#376a52', '#467d5c', '#5b9166', '#7aa874', '#a2c28a']),
  snow: pals(['#6f7fa8', '#8b9cc4', '#a9bbdc', '#c7d6ee', '#e2ecf8', '#f7fbff']),
  // bark
  barkSpruce: pals(['#2a1d22', '#3b2a2a', '#503a34', '#664a3e', '#7d5d4a']),
  barkRedPine: pals(['#3b1f1f', '#5a2e24', '#80432c', '#a55b34', '#c67a44', '#dc9a5c']),
  barkMaple: pals(['#2a1f28', '#3e2f34', '#56443f', '#6f5a4c', '#8a735d', '#a48e72']),
  barkBirch: pals(['#8a8594', '#b3afb8', '#d6d2d2', '#eeebe4', '#fbf9f2']),
  barkAspen: pals(['#8b927f', '#aab19b', '#c7ccb4', '#dfe2cc', '#f1f2e0']),
  barkSnag: pals(['#3e3a40', '#57525a', '#716b70', '#8c8588', '#a9a2a1', '#c4bdb8']),
  // autumn broadleaf canopies
  mapleRed: pals(['#3c1330', '#5e1834', '#8a1f35', '#b52c33', '#d44535', '#e8653a', '#f48d48', '#fdb860']),
  mapleOrange: pals(['#4a1f2a', '#74302c', '#a4452c', '#cc612c', '#e57f2f', '#f39c38', '#fbbd4f', '#ffdb78']),
  mapleScarlet: pals(['#330f33', '#521338', '#7b1540', '#a81a43', '#cf2a45', '#e84a4a', '#f7755a', '#ffa270']),
  birch: pals(['#3e2420', '#62341e', '#8c501e', '#b87622', '#daa030', '#eec23e', '#f8dc5a', '#fff29a']),
  aspen: pals(['#503214', '#7a4d18', '#a66c1c', '#cc8d22', '#e6ad2c', '#f5c93c', '#fde160', '#fff29e']),
  leafGreen: pals(['#142a22', '#1c3b28', '#27502e', '#336434', '#43793a', '#578e42', '#70a44c', '#92bb5c', '#b8d37a']),
};

// ===========================================================================
// Trunks & limbs
// ===========================================================================
// Draw a tapered, shaded trunk from (cx, yb) up to yt. The centre line may
// lean/curve; `bark(x, y, s, t, I)` can return an intensity offset or a colour.
function trunk(p, o) {
  const { cx, yb, yt, wb, wt, pal, seed = 1, flare = 1.2, lean = 0, curve = 0, bark = null, contact = true, shadeTo = -1, shadeLen = 6 } = o;
  for (let y = yt; y <= yb; y++) {
    const t = (y - yt) / Math.max(1, yb - yt); // 0 top -> 1 bottom
    const c = cx + lean * (1 - t) + curve * Math.sin(t * Math.PI);
    let w = lerp(wt, wb, Math.pow(t, 0.8));
    const fromBase = yb - y;
    if (fromBase < 3) w += flare * (3 - fromBase) * 0.75;
    const x0 = c - w / 2, x1 = c + w / 2;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const cover = Math.min(x + 1, x1) - Math.max(x, x0);
      if (cover < 0.5) continue;
      const s = (x + 0.5 - x0) / Math.max(0.5, x1 - x0); // 0 left -> 1 right
      let I = 0.55 - s * 1.25;
      if (s < 0.12 && w > 3) I -= 0.25; // thin reflected-light edge darker than the lit strip
      let col = null;
      if (bark) {
        const r = bark(x, y, s, t, I);
        if (typeof r === 'number') I += r;
        else if (r && r.c !== undefined) col = r.c;
      }
      if (contact && fromBase < 2) I -= 0.45 - fromBase * 0.18;
      if (shadeTo >= 0 && y < shadeTo + shadeLen) I -= 0.75 * (1 - clamp((y - shadeTo) / shadeLen, 0, 1));
      p.set(x, y, col !== null ? col : pick(pal, I));
    }
  }
}

// A tapered branch along a polyline of points [[x, y], ...].
function limb(p, pts, w0, w1, pal, seed = 1) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const x = lerp(ax, bx, f), y = lerp(ay, by, f);
      const w = lerp(w0, w1, (acc + f * len) / Math.max(1, total));
      const r = w / 2;
      for (let yy = Math.floor(y - r); yy <= Math.floor(y + r); yy++)
        for (let xx = Math.floor(x - r); xx <= Math.floor(x + r); xx++) {
          const dx = xx + 0.5 - x, dy = yy + 0.5 - y;
          if (dx * dx + dy * dy > r * r + 0.3) continue;
          const I = 0.35 - (dx / Math.max(0.6, r)) * 0.5 - (dy / Math.max(0.6, r)) * 0.3 + (hash(xx, yy, seed) - 0.5) * 0.2;
          p.set(xx, yy, pick(pal, I));
        }
    }
    acc += len;
  }
}

// ===========================================================================
// Conifers (spruce / snowy spruce): stacked tiers of drooping bough lobes
// ===========================================================================
// Each tier is a skirt of lobes. Lobes left of the centre point left-down,
// lobes right of it point right-down, so the hem is a sawtooth of drooping
// bough tips; inner lobes overlap the outer ones (dark crease at each tip).
function coniferTree(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const pal = o.pal || P.spruce;
  const N = pal.length;
  const cx = W / 2;
  const trunkH = o.trunkH ?? 7;
  const tipY = 1;
  const hemBottom = H - 1 - trunkH;
  const maxHW = W / 2 - 1.5;
  const n = o.tiers ?? Math.max(6, Math.round((hemBottom - tipY) / 9));

  trunk(p, { cx, yb: H - 1, yt: Math.round(H * 0.45), wb: o.trunkW ?? 5, wt: 3, pal: o.bark || P.barkSpruce, seed, flare: 1.1,
    bark: (x, y) => (hash(x, y >> 1, seed) < 0.3 ? -0.35 : 0) });

  const tiers = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    const hem = tipY + 7 + (hemBottom - tipY - 7) * Math.pow(f, o.tierPow ?? 1.12);
    const base = Math.max(3, maxHW * (0.12 + 0.88 * Math.pow(f, 0.82)));
    const hwL = i === n - 1 ? base : base * (0.9 + R() * 0.12);
    const hwR = i === n - 1 ? base : base * (0.9 + R() * 0.12);
    tiers.push({ i, hem, hwL, hwR, off: i < 1 ? 0 : (R() - 0.5) * 1.2, seed: (R() * 1e9) | 0 });
  }
  for (let i = 0; i < n; i++) {
    const t = tiers[i];
    const prev = i ? tiers[i - 1].hem : tipY;
    t.apex = i === 0 ? tipY : prev - Math.max(3, (t.hem - prev) * 0.95);
    // lobes: a centre lobe, then lobes stepping outwards on both sides
    const lobes = [];
    const c = Math.min(Math.max(t.hwL, t.hwR), 1.6 + R() * 1.4);
    lobes.push({ a: -c, b: c, dir: 0 });
    for (const dir of [-1, 1]) {
      const hw = dir < 0 ? t.hwL : t.hwR;
      let at = c;
      while (at < hw - 0.5) {
        let w = (o.lobeW ?? 5.5) * (0.75 + R() * 0.5);
        if (hw - (at + w) < 2.5) w = hw - at;
        const a = dir < 0 ? -(at + w) : at, b = dir < 0 ? -at : at + w;
        lobes.push({ a, b, dir, outer: false });
        at += w;
      }
      const last = lobes[lobes.length - 1];
      if (last.dir === dir) last.outer = true;
    }
    for (const L of lobes) {
      const mid = (L.a + L.b) / 2;
      const hw = mid < 0 ? t.hwL : t.hwR;
      const u = Math.min(1, Math.abs(mid) / hw);
      L.tip = t.hem - hw * 0.1 * u * u + (1 + hw * 0.18) * smooth(0.4, 1, u) + (R() - 0.5) * 1.2;
      L.depth = Math.min(4, 1.2 + (L.b - L.a) * 0.45) * (L.dir === 0 ? 0.7 : 1);
    }
    t.lobes = lobes;
  }
  const lobeAt = (t, dx) => {
    for (const L of t.lobes) if (dx >= L.a && dx < L.b) return L;
    return dx < 0 ? t.lobes.find((L) => L.dir < 0 && L.outer) || t.lobes[0] : t.lobes.find((L) => L.dir > 0 && L.outer) || t.lobes[0];
  };
  // position inside the lobe: 0 at its inner (root) end, 1 at its outer tip
  const lobeS = (L, dx) => (L.dir < 0 ? (L.b - dx) / (L.b - L.a) : L.dir > 0 ? (dx - L.a) / (L.b - L.a) : 1 - Math.abs(dx) / Math.max(0.5, L.b));
  const hemY = (t, dx) => {
    const L = lobeAt(t, dx);
    const s = clamp(lobeS(L, dx), 0, 1);
    let y = L.tip - L.depth * (1 - Math.pow(s, 0.65));
    const xi = Math.floor(dx + 200);
    if (s > 0.25 && (xi + t.i) % 2 === 0) y += 0.8; // needle teeth
    return y;
  };
  const topY = (t, dx) => {
    const hw = dx < 0 ? t.hwL : t.hwR;
    const u = Math.min(1, Math.abs(dx) / hw);
    const edge = hemY(t, Math.sign(dx || 1) * hw * 0.98);
    return t.apex + (edge - 2.4 - t.apex) * Math.pow(u, 1.4);
  };
  const inTier = (t, dx) => dx >= -t.hwL && dx <= t.hwR;

  // Ownership: bottom tier painted first, upper tiers overlap lower ones.
  const own = new Int16Array(W * H).fill(-1);
  for (let i = n - 1; i >= 0; i--) {
    const t = tiers[i];
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - (cx + t.off);
      if (!inTier(t, dx)) continue;
      const y0 = topY(t, dx), y1 = hemY(t, dx);
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 2, Math.ceil(y1)); y++)
        if (y + 0.5 >= y0 && y + 0.5 <= y1) own[y * W + x] = i;
    }
  }
  const visTop = (i, x) => {
    const t = tiers[i];
    let v = topY(t, x + 0.5 - (cx + t.off));
    for (let j = i - 1; j >= 0; j--) {
      const u = tiers[j];
      const d = x + 0.5 - (cx + u.off);
      if (inTier(u, d)) {
        v = Math.max(v, hemY(u, d));
        break;
      }
    }
    return v;
  };

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = own[y * W + x];
      if (i < 0) continue;
      const t = tiers[i];
      const dx = x + 0.5 - (cx + t.off);
      const hw = dx < 0 ? t.hwL : t.hwR;
      const cu = clamp(dx / hw, -1, 1);
      const L = lobeAt(t, dx);
      const s = clamp(lobeS(L, dx), 0, 1);
      const hy = hemY(t, dx);
      const vt = visTop(i, x);
      const dTop = y + 0.5 - vt;
      const dHem = hy - (y + 0.5);
      const band = Math.max(2, hy - vt);
      // teeth run diagonally along the bough direction (needles pointing out & down)
      const dg = L.dir < 0 ? x + y : L.dir > 0 ? x - y + 300 : x * 2;
      const tooth = (((dg % 3) + 3) % 3) * 0.13 + ((dg * 7 + t.i) % 5 === 0 ? 0.12 : 0);
      const f = clamp(dTop / band, 0, 1) - tooth + 0.12;
      // left of each lobe a touch brighter (rounded bough), plus global side light
      const lx = L.dir < 0 ? 1 - s : L.dir > 0 ? s : (dx - L.a) / Math.max(0.5, L.b - L.a);
      let idx = 3.85 - 2.05 * cu - 0.7 * (lx - 0.5) - 0.35 * (y / H - 0.5);
      if (f < 0.34) idx += 1.6 - 0.5 * Math.max(0, cu) + 0.45 * Math.max(0, -cu);
      else if (f < 0.7) idx += 0.1;
      else idx -= 1.05;
      if (dHem < 1) idx -= 1.6; // underside of the bough tips
      if (i > 0 && dTop < 0.8) idx -= 1.3; // contact line under the tier above
      // crease: the drooping tip of an inner lobe overlapping the next lobe out
      const nb = lobeAt(t, dx + (L.dir < 0 ? -1 : 1));
      if (L.dir !== 0 && nb !== L && dHem < L.depth + 1) idx -= 1.1;
      if (L.dir === 0) {
        const nl = lobeAt(t, dx - 1), nr = lobeAt(t, dx + 1);
        if ((nl !== L || nr !== L) && dHem < L.depth + 1) idx -= 0.8;
      }
      // rim light where the tier meets open sky on its top-left
      const upEmpty = y === 0 || own[(y - 1) * W + x] < 0;
      const leftEmpty = x === 0 || own[y * W + x - 1] < 0;
      if (upEmpty && cu < 0.4) idx += 1.6;
      else if (leftEmpty && !upEmpty && cu < 0) idx += 0.9;
      p.set(x, y, pal[clamp(Math.round(idx), 0, N - 1)]);
    }
  // Needle hooks: small bright strokes on the lit upper surfaces.
  for (const t of tiers) {
    const r2 = mulberry(t.seed + 7);
    for (const L of t.lobes) {
      const mid = (L.a + L.b) / 2;
      if (mid > (t.hwR * 0.5) || r2() < 0.3) continue;
      const dx0 = lerp(L.a, L.b, 0.3 + r2() * 0.4);
      const x0 = Math.floor(cx + t.off + dx0);
      const vt = visTop(t.i, x0);
      const y0 = Math.floor(vt + 1 + r2() * 1.5);
      const dir = L.dir || (r2() < 0.5 ? -1 : 1);
      const pts = [[x0, y0], [x0 + dir, y0 + 1], [x0 + dir, y0 + 2]];
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x >= W || y >= H || own[y * W + x] !== t.i) continue;
        const cur = pal.indexOf(p.get(x, y));
        p.set(x, y, pal[clamp(cur + 1, 0, N - 2)]);
      }
    }
  }
  // new growth: pale tips on the lowest pixel of the lit bough points
  for (const t of tiers) {
    for (const L of t.lobes) {
      const tipDx = L.dir < 0 ? L.a + 0.5 : L.dir > 0 ? L.b - 0.5 : 0;
      const u = tipDx / (tipDx < 0 ? t.hwL : t.hwR);
      if (u > 0.3 || hash(t.i, Math.round(tipDx), seed + 17) < 0.35) continue;
      const x = Math.floor(cx + t.off + tipDx);
      for (let y = H - 2; y > 0; y--)
        if (own[y * W + x] === t.i) {
          p.set(x, y - 1, pal[N - 2]);
          if (u < -0.4) p.set(x, y, pal[N - 3]);
          break;
        }
    }
  }
  // cones hanging under the upper boughs
  for (let k = 0; k < (o.cones || 0); k++) {
    const t = tiers[1 + (k % Math.min(3, n - 1))];
    const dx = (k % 2 ? 1 : -1) * t.hwR * (0.35 + 0.3 * hash(k, 1, seed));
    const x = Math.floor(cx + t.off + dx);
    const y = Math.floor(hemY(t, dx));
    const cone = pals(['#3a2230', '#5e3434', '#86503e']);
    p.set(x, y, cone[1]); p.set(x, y + 1, cone[1]); p.set(x, y + 2, cone[0]);
    p.set(x + (dx < 0 ? -1 : 1) * 0, y, cone[2]);
  }
  // leader: a thin spike on the very top
  const lx = Math.floor(cx - 0.5);
  for (let y = 0; y < 4; y++) if (!p.on(lx, y)) p.set(lx, y, pick(pal, 0.1 - y * 0.05));
  if (o.snow) snowOnTiers(p, own, tiers, hemY, visTop, lobeAt, lobeS, cx, W, H);
  outline(p, { noBottom: true });
  return p;
}

function snowOnTiers(p, own, tiers, hemY, visTop, lobeAt, lobeS, cx, W, H) {
  const S = P.snow;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = own[y * W + x];
      if (i < 0) continue;
      const t = tiers[i];
      const dx = x + 0.5 - (cx + t.off);
      const u = clamp(dx / (dx < 0 ? t.hwL : t.hwR), -1, 1);
      const L = lobeAt(t, dx);
      const l = L.dir === 0 ? 0 : lobeS(L, dx) * 2 - 1;
      const hy = hemY(t, dx);
      const vt = visTop(i, x);
      const band = hy - vt;
      const depth = Math.max(1.5, band * 0.55 - Math.abs(l) * 1.2 + 0.8 * Math.sin(x * 1.7 + i * 2.3));
      const d = y + 0.5 - vt;
      if (d < 0 || d > depth) continue;
      let v = 0.5 - 0.65 * u - 0.25 * l - (d / depth) * 0.35;
      if (i > 0 && d < 1.2) v -= 0.55; // shaded where the tier above overhangs
      else if (d < 1.2) v += 0.3;
      p.set(x, y, pick(S, v));
    }
  // snow clumps sitting on some bough tips
  for (const t of tiers)
    for (const L of t.lobes) {
      if (hash(t.i, Math.round(L.a * 3), 77) < 0.45) continue;
      const tipDx = L.dir < 0 ? L.a + 1 : L.dir > 0 ? L.b - 1 : 0;
      const x = Math.floor(cx + t.off + tipDx);
      const y = Math.floor(visTop(t.i, x)) + 1;
      const u = tipDx / (tipDx < 0 ? t.hwL : t.hwR);
      if (own[y * W + x] !== t.i) continue;
      p.set(x, y, pick(S, 0.9 - u * 0.6));
      p.set(x + (L.dir || 1), y, pick(S, 0.6 - u * 0.6));
    }
  // cap on the tip
  for (let y = 0; y < 5; y++)
    for (let x = Math.floor(cx - 3); x <= Math.ceil(cx + 2); x++)
      if (own[y * W + x] === 0 && (y < 3 || hash(x, y, 9) < 0.6)) p.set(x, y, pick(S, 0.7 - (x + 0.5 - cx) * 0.35 - y * 0.08));
}

// ===========================================================================
// Hand-authored sprites
// ===========================================================================
// rows: equal-ish length strings, one char per pixel ('.' / ' ' transparent);
// pal: { char: '#rrggbb' | int | [int, alpha] }. Options:
//   ol: outline (default true)  pad: 1 (margin kept for the outline)
//   ground: true -> no margin/outline below the bottom row
function art(rows, pal, o = {}) {
  const { ol = true, ground: gr = true, pad = ol ? 1 : 0, lit, k, auto = 0, noShade = '' } = o;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const p = new Px(w + pad * 2, h + pad + (gr ? 0 : pad));
  const cache = {};
  const col = (ch) => {
    if (cache[ch] !== undefined) return cache[ch];
    let v = pal[ch];
    if (v === undefined || v === null) v = null;
    else if (typeof v === 'string') v = [hx(v), 255];
    else if (typeof v === 'number') v = [v, 255];
    else if (Array.isArray(v)) v = [typeof v[0] === 'string' ? hx(v[0]) : v[0], v[1] ?? 255];
    return (cache[ch] = v);
  };
  const at = (x, y) => {
    if (y < 0 || y >= h || x < 0) return null;
    const ch = rows[y][x];
    if (ch === undefined || ch === '.' || ch === ' ') return null;
    return col(ch) ? ch : null;
  };
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const v = col(ch);
      if (!v) continue;
      let c = v[0];
      // automatic form shading: lit top/left edges, shaded bottom/right edges
      if (auto && !noShade.includes(ch)) {
        let t = 0;
        if (!at(x, y - 1)) t += 0.26;
        else if (at(x, y - 1) !== ch && !noShade.includes(at(x, y - 1))) t += 0.1;
        if (!at(x - 1, y)) t += 0.1;
        if (!at(x, y + 1)) t -= 0.24;
        if (!at(x + 1, y)) t -= 0.1;
        if (t) c = shade(c, clamp(t * auto, -1, 1));
      }
      p.set(x + pad, y + pad, c, v[1]);
    }
  });
  if (ol) outline(p, { noBottom: gr, lit, k });
  return p;
}
// Mirror a pixel buffer horizontally.
function flip(px) {
  const q = new Px(px.w, px.h);
  q.blit(px, 0, 0, true);
  return q;
}

// ===========================================================================
// Broadleaf canopies: painter-ordered leaf clusters
// ===========================================================================
// clusters: [{ x, y, r, ry?, pal?, shift? }]. Lower clusters are painted last
// (in front), each has its own rounded lighting blended with the lighting of
// the whole crown, a leaf texture, creases where it overlaps the ones behind,
// a rim light on the sky side and a few loose leaves on the silhouette.
function canopy(p, clusters, o = {}) {
  const { W = p.w, H = p.h, pal, seed = 1, leaf = 3.2, tex = 'leaf', env = null, holes = 0, loose = 0.35, rim = 1.4, bottomDark = 0.9, sparkle = 0.05, jag = 0.16 } = o;
  const R = mulberry(seed);
  const N = pal.length;
  const cl = clusters.map((c, i) => ({ ...c, ry: c.ry ?? c.r, i, ph: R() * 6.28, nb: Math.max(5, Math.round((c.r * 6.28) / (o.bump ?? 4.2))), z: c.z ?? c.y + c.r * 0.35 + (c.front || 0) }));
  cl.sort((a, b) => a.z - b.z);
  const E = env || (() => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const c of cl) {
      x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r);
      y0 = Math.min(y0, c.y - c.ry); y1 = Math.max(y1, c.y + c.ry);
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
  })();
  const own = new Int16Array(W * H).fill(-1);
  const spiky = tex === 'needle';
  const inside = (c, x, y) => {
    const dx = (x + 0.5 - c.x) / c.r, dy = (y + 0.5 - c.y) / c.ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1.05) return false;
    const a = Math.atan2(dy, dx);
    const b = 0.5 + 0.5 * Math.cos(a * c.nb + c.ph);
    if (spiky) {
      // needle tufts: sharp spikes on the upper half, soft flat underside
      const up = clamp(-dy * 1.4 + 0.35, 0, 1);
      return d < 1 - jag * (up * (1 - b * b * b * b) + (1 - up) * 0.3 * b * b) + (hash(x, y, seed + c.i) - 0.5) * 0.05;
    }
    return d < 1 - jag * b * b + (hash(x, y, seed + c.i) - 0.5) * 0.05;
  };
  cl.forEach((c, k) => {
    for (let y = Math.max(0, Math.floor(c.y - c.ry - 1)); y <= Math.min(H - 1, Math.ceil(c.y + c.ry + 1)); y++)
      for (let x = Math.max(0, Math.floor(c.x - c.r - 1)); x <= Math.min(W - 1, Math.ceil(c.x + c.r + 1)); x++)
        if (inside(c, x, y)) own[y * W + x] = k;
  });
  // holes near the rim of the crown (sky / branches show through)
  for (let h = 0; h < holes; h++) {
    const a = R() * 6.28, rr = 0.55 + R() * 0.3;
    const hx0 = E.x + Math.cos(a) * E.rx * rr, hy0 = E.y + Math.sin(a) * E.ry * rr * 0.9 + E.ry * 0.15;
    const hr = 1 + R() * 1.4;
    for (let y = Math.floor(hy0 - hr); y <= hy0 + hr; y++)
      for (let x = Math.floor(hx0 - hr); x <= hx0 + hr; x++)
        if (x >= 0 && y >= 0 && x < W && y < H && (x + 0.5 - hx0) ** 2 + (y + 0.5 - hy0) ** 2 <= hr * hr) own[y * W + x] = -2;
  }
  // leaf cells: jittered grid
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
      // leaf texture
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
      const texAmt = (tex === 'coin' ? 1.4 : 1) * (o.texAmt ?? 1);
      if (tex === 'needle') {
        // radial needle bundles: streaks fanning out from the clump's base
        const bx = c.x, by = c.y + c.ry * 0.6;
        const ang = Math.atan2(y + 0.5 - by, x + 0.5 - bx);
        const dist = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
        const sid = Math.floor(ang * (c.r * 0.9) + c.ph * 10);
        const seg = Math.floor(dist / 3 + hash(sid, 0, seed) * 3);
        const hv = hash(sid, seg, seed + c.i);
        v += (hv - 0.5) * 0.5 * texAmt;
        if (hv < 0.2) v -= 0.18 * texAmt;
      } else {
        v += ((best[2] - 0.5) * 0.2 - (ox + oy) * 0.34) * texAmt;
        if (e < (tex === 'coin' ? 0.9 : 0.65)) v -= (v > 0.2 ? 0.1 : 0.2) * texAmt;
      }
      // crease: darker where this cluster is overlapped by one in front
      for (const [ax, ay] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) {
        const xx = x + ax, yy = y + ay;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const kk = own[yy * W + xx];
        if (kk > k) { v -= 0.6; break; }
      }
      if (y + 2 < H) {
        const kk = own[(y + 2) * W + x];
        if (kk > k && own[(y + 1) * W + x] === k) v -= 0.25;
      }
      v += c.shift || 0;
      lvl[y * W + x] = v;
    }
  // quantise + rim light
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
  // loose leaves poking out of the silhouette
  const edge = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (own[y * W + x] >= 0) continue;
      let nbk = -1;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = own[(y + ay) * W + x + ax];
        if (kk >= 0) nbk = kk;
      }
      if (nbk >= 0) edge.push([x, y, nbk]);
    }
  for (const [x, y, k] of edge) {
    if (hash(x, y, seed + 21) > loose) continue;
    const c = cl[k];
    const gx = (x + 0.5 - E.x) / E.rx, gy = (y + 0.5 - E.y) / E.ry;
    const cp = c.pal || pal;
    const I = 0.5 - (gx + gy) * 0.45 + (hash(x, y, seed + 22) - 0.5) * 0.4;
    p.set(x, y, cp[clamp(Math.round((cp.length - 1) * (0.5 + I * 0.45)), 1, cp.length - 2)]);
  }
  return own;
}

// Rounded crown of clusters inside an ellipse: one big middle cluster, a ring
// of medium ones and small ones filling the rim.
function crownClusters(R, cx, cy, rx, ry, o = {}) {
  const { count = 7, big = 0.52, ring = 0.62, mid = 0.4, small = 6, smallR = 0.2 } = o;
  const out = [];
  out.push({ x: cx + (R() - 0.5) * rx * 0.12, y: cy - ry * 0.12, r: rx * big, ry: ry * big * 1.02 });
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2 + (R() - 0.5) * 0.5;
    const d = ring * (0.9 + R() * 0.2);
    const r = rx * mid * (0.85 + R() * 0.3);
    out.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r, ry: r * (ry / rx) * 0.98 });
  }
  for (let i = 0; i < small; i++) {
    const a = (R() - 0.5) * Math.PI * 1.7 - Math.PI / 2;
    const d = 0.78 + R() * 0.12;
    const r = rx * smallR * (0.8 + R() * 0.5);
    out.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r, ry: r });
  }
  // two front clusters low in the crown
  for (let i = 0; i < 2; i++) {
    const r = rx * mid * (0.8 + R() * 0.25);
    out.push({ x: cx + (i ? 1 : -1) * rx * (0.18 + R() * 0.15), y: cy + ry * (0.3 + R() * 0.1), r, ry: r * (ry / rx), front: 4 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Maples: grey trunk forking into the crown, full round autumn canopy
// ---------------------------------------------------------------------------
function mapleTree(W, H, seed, pal, alt) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const Rx = W / 2 - 3, Ry = Rx * 1.06;
  const cy = Ry + 2.5;
  // bark: vertical furrows (darker streaks that wander a little)
  const barkF = (x, y, s) => {
    const f = hash(x + ((y >> 3) & 1), y >> 2, seed);
    return f < 0.3 ? -0.5 : f > 0.9 && s < 0.5 ? 0.3 : 0;
  };
  const crownBottom = cy + Ry * 0.86;
  trunk(p, { cx, yb: H - 1, yt: Math.round(cy + Ry * 0.3), wb: 7, wt: 3.6, pal: P.barkMaple, seed, flare: 1.7, curve: (R() - 0.5) * 1.2, bark: barkF, shadeTo: Math.round(crownBottom), shadeLen: 7 });
  // main forks reaching into the crown
  const fy = cy + Ry * 0.72;
  limb(p, [[cx - 0.5, fy + 5], [cx - 5, fy - 2], [cx - 11, fy - 8]], 3.2, 1.4, P.barkMaple.slice(0, 4), seed + 2);
  limb(p, [[cx + 0.5, fy + 5], [cx + 5, fy - 3], [cx + 10, fy - 10]], 3.2, 1.4, P.barkMaple.slice(0, 4), seed + 3);
  limb(p, [[cx, fy + 3], [cx + 0.5, fy - 10]], 3, 1.4, P.barkMaple.slice(0, 4), seed + 4);
  // crown: explicit arrangement with jitter, lower clusters in front
  const J = (v) => v * (0.88 + R() * 0.24);
  const cls = [
    { x: cx, y: cy - Ry * 0.52, r: J(Rx * 0.44) },
    { x: cx - Rx * 0.5, y: cy - Ry * 0.3, r: J(Rx * 0.42) },
    { x: cx + Rx * 0.52, y: cy - Ry * 0.28, r: J(Rx * 0.4) },
    { x: cx, y: cy - Ry * 0.02, r: J(Rx * 0.5) },
    { x: cx - Rx * 0.6, y: cy + Ry * 0.14, r: J(Rx * 0.4) },
    { x: cx + Rx * 0.6, y: cy + Ry * 0.16, r: J(Rx * 0.4) },
    { x: cx - Rx * 0.36, y: cy + Ry * 0.44, r: J(Rx * 0.38) },
    { x: cx + Rx * 0.38, y: cy + Ry * 0.45, r: J(Rx * 0.36) },
    { x: cx - Rx * 0.78, y: cy - Ry * 0.05, r: J(Rx * 0.22) },
    { x: cx + Rx * 0.8, y: cy - Ry * 0.02, r: J(Rx * 0.2) },
    { x: cx - Rx * 0.3, y: cy - Ry * 0.74, r: J(Rx * 0.22) },
    { x: cx + Rx * 0.34, y: cy - Ry * 0.7, r: J(Rx * 0.24) },
  ];
  for (const c of cls) {
    c.x += (R() - 0.5) * Rx * 0.12;
    c.y += (R() - 0.5) * Ry * 0.1;
    c.ry = c.r * 0.94;
    c.shift = (R() - 0.5) * 0.14;
    if (alt && R() < 0.22) c.pal = alt;
  }
  canopy(p, cls, { pal, seed: seed + 9, leaf: 4, holes: 2, loose: 0.3, env: { x: cx, y: cy, rx: Rx, ry: Ry }, bias: 0.62 });
  outline(p, { noBottom: true, lit: 0.56 });
  return p;
}

// ---------------------------------------------------------------------------
// Pines: tall bare trunk, clumpy needle crown
// ---------------------------------------------------------------------------
// Red pine: straight orange-brown trunk with bark plates, round-topped crown
// of needle pom-poms on short whorled branches.
function redPine(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const crownTop = 2, crownBot = Math.round(H * 0.55);
  const plate = (x, y, s) => {
    // flaky plates: lighter orange scales separated by dark cracks
    const py = Math.floor((y + (x % 2) * 2) / 4);
    const f = hash(x, py, seed);
    if (f < 0.22) return -0.6;
    if ((y + (x % 2) * 2) % 4 === 0) return -0.35;
    return s < 0.45 && f > 0.75 ? 0.35 : 0;
  };
  trunk(p, { cx, yb: H - 1, yt: crownTop + 8, wb: 5.5, wt: 2.5, pal: P.barkRedPine, seed, flare: 1.3, curve: (R() - 0.5) * 1, bark: plate, shadeTo: crownBot - 4, shadeLen: 6 });
  const cls = [];
  const rx = W / 2 - 4;
  const levels = [
    { y: crownTop + 7, xs: [0], r: 6 },
    { y: crownTop + 16, xs: [-0.42, 0.4], r: 7 },
    { y: crownTop + 26, xs: [-0.72, 0.02, 0.7], r: 7.5 },
    { y: crownTop + 37, xs: [-0.8, -0.08, 0.72], r: 7.8 },
    { y: crownTop + 48, xs: [-0.5, 0.48], r: 7 },
  ];
  levels.forEach((L, i) => {
    L.xs.forEach((f, k) => {
      const bx = cx + f * rx + (R() - 0.5) * 2;
      const by = L.y + (R() - 0.5) * 2.5;
      if (Math.abs(f) > 0.1) limb(p, [[cx, by + 4], [lerp(cx, bx, 0.6), by + 2], [bx, by + 0.5]], 2.2, 1, P.barkRedPine.slice(0, 4), seed + i * 5 + k);
      const r = L.r * (0.88 + R() * 0.24);
      cls.push({ x: bx, y: by, r: r * 1.12, ry: r * 0.74, z: by + (Math.abs(f) < 0.2 ? 3 : 0) });
    });
  });
  canopy(p, cls, { pal: P.pine, seed: seed + 9, tex: 'needle', leaf: 3, loose: 0.55, jag: 0.42, bump: 2.3, bias: 0.52, local: 0.72,
    env: { x: cx, y: (crownTop + crownBot) / 2, rx: rx + 2, ry: (crownBot - crownTop) / 2 } });
  outline(p, { noBottom: true });
  return p;
}

// Eastern white pine: leaning trunk, windswept flat shelves of soft needles
// swept to one side (the Group of Seven silhouette).
function whitePine(W, H, seed, dir = 1) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const top = 3;
  const lean = dir * 5; // top of the trunk shifted downwind
  const barkF = (x, y) => (hash(x, y >> 2, seed) < 0.32 ? -0.5 : 0);
  const yt = top + 5;
  trunk(p, { cx, yb: H - 1, yt, wb: 5.5, wt: 2, pal: P.barkSpruce, seed, flare: 1.4, lean, curve: -dir * 1.2, bark: barkF });
  const trunkX = (y) => {
    const t = (y - yt) / (H - 1 - yt);
    return cx + lean * (1 - t) - dir * 1.2 * Math.sin(t * Math.PI);
  };
  // shelves: [y, reach downwind, reach upwind, thickness]
  const shelves = [
    [top + 5, 7, 2, 4],
    [top + 15, 17, 3, 4.5],
    [top + 27, 23, 4, 5],
    [top + 40, 19, 8, 5],
    [top + 52, 11, 11, 4.5],
  ];
  const cls = [];
  shelves.forEach(([y, far, near, th], i) => {
    const tx = trunkX(y);
    const ex = clamp(tx + dir * far * (0.9 + R() * 0.15), 5, W - 5);
    const bx = clamp(tx - dir * near * (0.85 + R() * 0.25), 5, W - 5);
    limb(p, [[tx, y + 3], [lerp(tx, ex, 0.5), y + 2 + R()], [ex, y]], 2.2, 1, P.barkSpruce.slice(0, 4), seed + i * 3);
    if (near > 5) limb(p, [[tx, y + 3], [lerp(tx, bx, 0.6), y + 2.5], [bx, y + 1]], 1.8, 1, P.barkSpruce.slice(0, 4), seed + i * 3 + 1);
    // flat clumps along the shelf
    const n = Math.max(2, Math.round((far + near) / 5.5));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      const x = lerp(bx, ex, f);
      const r = th * (0.85 + 0.35 * Math.sin(f * Math.PI)) * (0.85 + R() * 0.3);
      cls.push({ x, y: y - 1 + (R() - 0.5) * 1.6 - Math.sin(f * Math.PI) * 1.2, r: r * 1.3, ry: r * 0.66, z: y + (k % 2) * 0.6 });
    }
  });
  canopy(p, cls, { pal: P.wpine, seed: seed + 9, tex: 'needle', leaf: 3, loose: 0.55, jag: 0.38, bump: 2.4, bias: 0.45, local: 0.82, bottomDark: 0.4,
    env: { x: cx + dir * 5, y: top + 28, rx: W / 2, ry: 32 } });
  outline(p, { noBottom: true });
  return p;
}

// ---------------------------------------------------------------------------
// Birch & aspen: pale trunks with dark marks, airy golden crowns
// ---------------------------------------------------------------------------
const INKY = hx('#2a2230');
function birchBark(seed, dark = INKY, base = 7, H = 100) {
  return (x, y, s, t) => {
    const fromBase = H - 1 - y;
    // rough black fissures near the base
    if (fromBase < base && hash(x, y >> 1, seed + 1) < 0.55 - fromBase * 0.05) return { c: dark };
    // horizontal lenticels
    const row = hash(0, y, seed);
    if (row < 0.2) {
      const x0 = Math.floor(hash(1, y, seed) * 6);
      if ((x + x0) % 6 < 2 + (row < 0.08 ? 1 : 0)) return { c: mix(dark, 0x6a6070, s * 0.3) };
    }
    return 0;
  };
}
// dark "eye" scar where a branch left the trunk
function barkEye(p, x, y, dir, c = INKY) {
  p.set(x, y, c);
  p.set(x + dir, y - 1, c);
  p.tint(x - dir, y + 1, mix(c, 0x8a8594, 0.4));
}

function birchTree(W, H, seed, twin = false) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const crownCY = H * 0.34, rx = W / 2 - 3, ry = H * 0.3;
  const twig = pals(['#2a1c22', '#3e2a2c', '#5a3c36']);
  const stems = twin ? [[-1, -10], [1, 8]] : [[0, (R() - 0.5) * 3]];
  const tops = [];
  for (const [side, lean] of stems) {
    const yt = Math.round(crownCY - ry * 0.3 + (twin ? Math.abs(lean) * 0.6 : 0));
    const bx = cx + side * (twin ? 1.6 : 0);
    trunk(p, { cx: bx, yb: H - 1, yt, wb: twin ? 3.6 : 4.6, wt: 1.8, pal: P.barkBirch, seed: seed + side, flare: twin ? 0.8 : 1.2, lean, curve: -lean * 0.25,
      bark: birchBark(seed + side * 7, INKY, 7, H), contact: true, shadeTo: Math.round(crownCY + ry * 0.85), shadeLen: 5 });
    tops.push([bx + lean, yt]);
  }
  // scars and branches
  for (const [tx, ty] of tops) {
    for (let k = 0; k < 3; k++) {
      const y = Math.round(lerp(ty + 6, crownCY + ry * 0.8, k / 2));
      const dir = k % 2 ? 1 : -1;
      const t = (y - ty) / (H - 1 - ty);
      const x = Math.round(lerp(tx, cx, t));
      const ex = clamp(x + dir * 9, cx - rx * 0.6, cx + rx * 0.6);
      limb(p, [[x, y], [lerp(x, ex, 0.55), y - 5], [ex, y - 10]], 1.6, 1, twig, seed + k);
    }
  }
  for (let k = 0; k < 4; k++) {
    const y = Math.round(lerp(crownCY + ry, H - 12, k / 3));
    const [tx, ty] = tops[k % tops.length];
    const t = (y - ty) / (H - 1 - ty);
    const x = Math.round(lerp(tx, cx + (twin ? (k % 2 ? 1 : -1) * 1.2 : 0), t));
    barkEye(p, x - (k % 2 ? 0 : 1), y, k % 2 ? 1 : -1);
  }
  // crown: many small clusters, airy
  const cls = [];
  const n = twin ? 13 : 10;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.72;
    const r = (twin ? 6.5 : 6) + R() * 2.5;
    cls.push({ x: cx + Math.cos(a) * rx * d, y: crownCY + Math.sin(a) * ry * d, r, ry: r * 1.08 });
  }
  cls.push({ x: cx, y: crownCY - ry * 0.72, r: 6.5, ry: 6 });
  cls.push({ x: cx - rx * 0.45, y: crownCY + ry * 0.62, r: 5.5 });
  cls.push({ x: cx + rx * 0.5, y: crownCY + ry * 0.58, r: 5.5 });
  for (const c of cls) c.shift = (R() - 0.5) * 0.2;
  canopy(p, cls, { pal: P.birch, seed: seed + 9, leaf: 3.4, holes: 6, loose: 0.55, jag: 0.24, bump: 3.2, bias: 0.72, local: 0.74,
    env: { x: cx, y: crownCY, rx, ry } });
  outline(p, { noBottom: true });
  return p;
}

function aspenTree(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const crownCY = H * 0.36, rx = W / 2 - 3, ry = H * 0.33;
  trunk(p, { cx, yb: H - 1, yt: Math.round(crownCY - ry * 0.5), wb: 4.2, wt: 1.8, pal: P.barkAspen, seed, flare: 1, curve: (R() - 0.5) * 1.5,
    bark: (x, y, s) => {
      if (H - 1 - y < 5 && hash(x, y, seed) < 0.4) return { c: hx('#3a3430') };
      return hash(0, y, seed) < 0.06 && s < 0.8 ? { c: hx('#4a4440') } : 0;
    }, shadeTo: Math.round(crownCY + ry * 0.85), shadeLen: 5 });
  for (let k = 0; k < 3; k++) {
    const y = Math.round(lerp(crownCY + ry + 3, H - 14, k / 2));
    barkEye(p, Math.round(cx - 1 + (k % 2)), y, k % 2 ? 1 : -1, hx('#3a3238'));
  }
  const twig = pals(['#3a2c26', '#54403a', '#6e5a4e']);
  for (let k = 0; k < 4; k++) {
    const y = Math.round(lerp(crownCY - ry * 0.2, crownCY + ry * 0.8, k / 3));
    const dir = k % 2 ? 1 : -1;
    limb(p, [[cx, y], [cx + dir * 4, y - 4], [cx + dir * 7, y - 9]], 1.5, 1, twig, seed + k);
  }
  const cls = [];
  for (let i = 0; i < 12; i++) {
    const a = R() * Math.PI * 2;
    const d = Math.sqrt(R()) * 0.7;
    const r = 5.5 + R() * 2.5;
    cls.push({ x: cx + Math.cos(a) * rx * d, y: crownCY + Math.sin(a) * ry * d, r, ry: r * 1.1 });
  }
  cls.push({ x: cx, y: crownCY - ry * 0.75, r: 5.5 });
  cls.push({ x: cx - 1, y: crownCY + ry * 0.72, r: 5 });
  for (const c of cls) c.shift = (R() - 0.5) * 0.25;
  canopy(p, cls, { pal: P.aspen, seed: seed + 9, tex: 'coin', leaf: 2.6, holes: 5, loose: 0.55, jag: 0.25, bump: 2.8, bias: 0.62, local: 0.7,
    env: { x: cx, y: crownCY, rx, ry } });
  outline(p, { noBottom: true });
  return p;
}

// ---------------------------------------------------------------------------
// Snag: dead grey tree, broken top, bare branches, woodpecker hole, fungus
// ---------------------------------------------------------------------------
function snagTree(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const top = 8;
  const wood = P.barkSnag;
  trunk(p, { cx, yb: H - 1, yt: top, wb: 6, wt: 3.4, pal: wood, seed, flare: 1.6, curve: 1.2,
    bark: (x, y, s) => {
      const f = hash(x, y >> 2, seed);
      if (f < 0.25) return -0.5; // cracks
      if (hash(x >> 1, y >> 3, seed + 2) > 0.8) return 0.4; // bare silver wood where bark fell off
      return 0;
    } });
  // jagged broken top
  const tx = Math.round(cx + 0.7);
  const jag = [[-2, 3], [-1, 0], [0, 2], [1, -1], [2, 1]];
  for (const [dx, dy] of jag) for (let y = top + dy; y < top + 4; y++) p.set(tx + dx - 1, y, pick(wood, 0.4 - dx * 0.35));
  p.set(tx - 2, top - 2, pick(wood, 0.6));
  p.set(tx - 2, top - 3, pick(wood, 0.8));
  // bare branches (some broken)
  const br = [
    [0.22, -1, 10, -8], [0.32, 1, 9, -10], [0.46, -1, 7, -4], [0.55, 1, 5, -2], [0.16, 1, 5, -6],
  ];
  for (const [f, dir, len, rise] of br) {
    const y = Math.round(lerp(top, H - 1, f));
    const x = cx + dir * 1.2;
    limb(p, [[x, y], [x + dir * len * 0.5, y + rise * 0.4], [x + dir * len, y + rise]], 2, 1, wood.slice(1, 5), seed + y);
    if (len > 8) limb(p, [[x + dir * len * 0.6, y + rise * 0.5], [x + dir * (len * 0.6 + 3), y + rise * 0.5 - 4]], 1, 1, wood.slice(1, 4), seed + y + 1);
  }
  // woodpecker hole
  const hy = Math.round(H * 0.42);
  const hxp = Math.round(cx - 1);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]) p.set(hxp + dx, hy + dy, hx('#1c1620'));
  p.set(hxp, hy - 1, pick(wood, -0.4));
  p.set(hxp + 1, hy - 1, pick(wood, -0.4));
  // bracket fungus
  const fung = pals(['#6a3e22', '#9a5a2a', '#c98a45', '#e8b870']);
  for (const [fy, dir] of [[Math.round(H * 0.62), 1], [Math.round(H * 0.66), 1], [Math.round(H * 0.7), -1]]) {
    const fx = Math.round(cx + dir * 3) - (dir < 0 ? 1 : 0);
    for (let k = 0; k < 4; k++) p.set(fx + dir * k, fy, fung[k === 0 ? 2 : k === 3 ? 1 : 3]);
    for (let k = 0; k < 3; k++) p.set(fx + dir * k, fy + 1, fung[k === 2 ? 0 : 1]);
  }
  // a bit of moss at the foot
  const moss = pals(['#2e4a26', '#4a6e30', '#6f9440']);
  for (let x = Math.floor(cx - 4); x <= cx + 3; x++) {
    const h = 1 + Math.floor(hash(x, 0, seed) * 3);
    for (let y = H - h; y < H; y++) if (p.on(x, y) && hash(x, y, seed + 4) < 0.7) p.set(x, y, moss[y === H - h ? 2 : 1]);
  }
  outline(p, { noBottom: true });
  return p;
}

// Young maple sapling: thin stem, a few leaf clumps turning colour.
function sapling(W, H, seed) {
  const p = new Px(W, H);
  const cx = W / 2;
  const stem = pals(['#3a2826', '#5a4036', '#7a5a46']);
  limb(p, [[cx, H - 1], [cx - 0.2, H - 9], [cx + 0.4, H - 17]], 2, 1.2, stem, seed);
  limb(p, [[cx, H - 9], [cx - 2.5, H - 12], [cx - 4, H - 14]], 1, 1, stem, seed + 1);
  limb(p, [[cx + 0.2, H - 13], [cx + 2.5, H - 16], [cx + 4, H - 18]], 1, 1, stem, seed + 2);
  const cls = [
    { x: cx - 4, y: H - 15.5, r: 3.6, pal: P.mapleRed },
    { x: cx + 4.2, y: H - 19, r: 3.6, pal: P.mapleOrange },
    { x: cx + 0.4, y: H - 22.5, r: 4.4, pal: P.mapleOrange },
  ];
  canopy(p, cls, { pal: P.mapleOrange, seed: seed + 9, leaf: 2.4, loose: 0.45, jag: 0.22, bump: 3, bias: 0.45, local: 0.8, texAmt: 0.7, rim: 1 });
  // a couple of leaves still green, and grass at the foot
  p.tint(Math.round(cx - 5), H - 14, hx('#6a9a44'));
  outline(p, { noBottom: true });
  return p;
}

// ===========================================================================
// Bushes
// ===========================================================================
function bushClusters(R, W, H, n, o = {}) {
  const cx = W / 2, cy = H * (o.cy ?? 0.56), rx = W / 2 - 2, ry = H * (o.ry ?? 0.46);
  const cls = [];
  // back row, then front row (lower = in front)
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const a = Math.PI * (1.1 + f * 0.8);
    const r = rx * (o.r ?? 0.42) * (0.85 + R() * 0.3);
    cls.push({ x: cx + Math.cos(a) * rx * 0.55, y: cy + Math.sin(a) * ry * 0.45, r, ry: r * 0.9 });
  }
  for (let i = 0; i < n - 1; i++) {
    const f = (i + 0.5) / (n - 1);
    const r = rx * (o.r ?? 0.42) * (0.8 + R() * 0.3);
    cls.push({ x: cx + (f - 0.5) * rx * 1.3, y: cy + ry * 0.28, r, ry: r * 0.85 });
  }
  return { cls, env: { x: cx, y: cy, rx, ry } };
}

function bushSprite(W, H, seed, pal, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const stems = pals(['#2a1e22', '#40302c', '#5a4436']);
  const cx = W / 2;
  for (let k = -1; k <= 1; k++) limb(p, [[cx + k * 1.5, H - 1], [cx + k * 4, H - 5]], 1.4, 1, stems, seed + k);
  const { cls, env } = bushClusters(R, W, H, o.n ?? 3, o);
  if (o.alt) for (const c of cls) if (R() < (o.altP ?? 0.3)) c.pal = o.alt;
  if (o.altForce) cls[o.altForce].pal = o.alt;
  for (const c of cls) c.shift = (R() - 0.5) * 0.2;
  canopy(p, cls, { pal, seed: seed + 9, leaf: o.leaf ?? 2.8, loose: 0.4, jag: 0.2, bump: 3, bias: o.bias ?? 0.5, local: 0.72, env, bottomDark: 1.1, rim: 1.2 });
  // clip to the ground line and darken the contact rows
  for (let x = 0; x < W; x++) {
    if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.35));
    if (p.on(x, H - 2)) p.set(x, H - 2, mix(p.get(x, H - 2), INK, 0.15));
  }
  return p;
}

// Small round berry / flower / hip decorations.
function berry(p, x, y, pal) {
  // pal: [dark, mid, light, highlight]
  p.set(x, y, pal[2]);
  p.set(x + 1, y, pal[1]);
  p.set(x, y + 1, pal[1]);
  p.set(x + 1, y + 1, pal[0]);
  p.set(x, y, pal[3]);
}
const BLUE = pals(['#1e2352', '#343f8a', '#4d5fb8', '#98a8ec']);
const HIP = pals(['#6a1420', '#b3242a', '#e0503a', '#ffc0a0']);

function blueberryBush(W, H, seed, berries) {
  const leaves = pals(['#1c2c26', '#24402e', '#2f5634', '#3c6b3a', '#4f8242', '#679a4a', '#86b358', '#aacb6e']);
  const autumn = pals(['#22101f', '#3a1426', '#561a2e', '#742234', '#92303a', '#ad4440', '#c4604a', '#d88a5e']);
  const p = bushSprite(W, H, seed, leaves, { n: 3, alt: autumn, altP: 0.25, altForce: 1, cy: 0.58, ry: 0.44, leaf: 2.5, bias: 0.62 });
  const R = mulberry(seed + 50);
  const spots = [];
  for (let k = 0; k < 200 && spots.length < berries; k++) {
    const x = Math.floor(3 + R() * (W - 8)), y = Math.floor(H * 0.2 + R() * H * 0.55);
    if (!p.on(x - 1, y - 1) || !p.on(x + 4, y + 1) || !p.on(x, y + 3) || !p.on(x + 3, y + 3)) continue;
    if (spots.some(([a, b]) => Math.abs(a - x) < 6 && Math.abs(b - y) < 4)) continue;
    spots.push([x, y]);
  }
  for (const [x, y] of spots) {
    berry(p, x, y, BLUE);
    if (berries > 3) {
      berry(p, x + 2, y + 1, BLUE);
      if (R() < 0.7) berry(p, x - 1, y + 2, BLUE);
    }
  }
  outline(p, { noBottom: true });
  return p;
}

function roseBush(W, H, seed) {
  const leaves = pals(['#1c2e22', '#25422a', '#315830', '#3f6e36', '#52843c', '#6c9a44', '#8cb454', '#b2cd72']);
  const p = bushSprite(W, H, seed, leaves, { n: 3, cy: 0.56, leaf: 2.5 });
  const R = mulberry(seed + 50);
  const petal = pals(['#b8406e', '#e2709a', '#f79cbc', '#ffd2e2']);
  const flowers = [];
  for (let k = 0; k < 60 && flowers.length < 5; k++) {
    const x = Math.floor(3 + R() * (W - 6)), y = Math.floor(2 + R() * H * 0.62);
    if (!p.on(x, y) || !p.on(x, y + 2)) continue;
    if (flowers.some(([a, b]) => Math.abs(a - x) < 6 && Math.abs(b - y) < 5)) continue;
    flowers.push([x, y]);
  }
  for (const [x, y] of flowers) {
    // five-petal wild rose with a golden heart
    const F = [
      '.ab.',
      'bYyc',
      'byyc',
      '.cd.',
    ];
    const map = { a: petal[3], b: petal[2], c: petal[1], d: petal[0], Y: hx('#fff08a'), y: hx('#f0b83a') };
    F.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && p.set(x - 1 + i, y - 1 + j, map[ch])));
  }
  for (let k = 0, hips = 0; k < 40 && hips < 3; k++) {
    const x = Math.floor(3 + R() * (W - 6)), y = Math.floor(H * 0.4 + R() * H * 0.4);
    if (!p.on(x, y) || !p.on(x + 1, y + 1)) continue;
    if (flowers.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)) continue;
    berry(p, x, y, HIP);
    hips++;
  }
  outline(p, { noBottom: true });
  return p;
}

// Staghorn sumac: a few upright stems ending in fuzzy crimson cones, with
// long compound leaves arching out and drooping (leaflet pairs along a rib).
function frond(p, x0, y0, ang, len, droop, pal, seed, o = {}) {
  const R = mulberry(seed);
  const steps = Math.max(3, Math.round(len / (o.step ?? 1.9)));
  let prev = null;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = x0 + Math.cos(ang) * len * t;
    const y = y0 + Math.sin(ang) * len * t + droop * t * t;
    const dx = Math.cos(ang), dy = Math.sin(ang) + (2 * droop * t) / Math.max(1, len);
    const n = Math.hypot(dx, dy) || 1;
    const tx = dx / n, ty = dy / n;
    const leafLen = (o.leaf ?? 2.2) * (1 - 0.5 * t) + 0.5;
    // leaflets on both sides, pointing forward
    for (const side of [-1, 1]) {
      const nx = -ty * side, ny = tx * side;
      for (let j = 1; j <= Math.round(leafLen); j++) {
        const lx = x + nx * j + tx * j * 0.6, ly = y + ny * j + ty * j * 0.6;
        const up = ny < 0 ? 1 : 0; // upper side catches the light
        const v = 0.15 + up * 0.35 - t * 0.2 - (j === Math.round(leafLen) ? 0.15 : 0) + (R() - 0.5) * 0.3 + (o.bright ?? 0);
        p.set(lx, ly, pick(pal, v));
      }
    }
    const rib = pick(pal, -0.55);
    if (prev) line(p, prev[0], prev[1], x, y, rib);
    prev = [x, y];
  }
}

const SUMAC_PAL = {
  y: '#ffb85c', o: '#f27a36', r: '#d9412f', R: '#a8263a', m: '#6e1a34',
  c: '#c63a48', C: '#861c30', q: '#ee7a80', s: '#a58a6c', S: '#5e4636',
};
const SUMAC = [
  '..........qc..............',
  '..........cC........qc....',
  '...qc.....cC........cC....',
  '...cC....yooR.......cC....',
  '...cC..yoorrorR...yooR....',
  '..yooRoyorrRRrRR.oyorrR...',
  '.yorrrRyorrRmRrRyorrRrRR..',
  'yorRrRmRrRRrmmRyorRRmRmRm.',
  'orRrmRmRrm.RmRorRmmRmmRmm.',
  'rR.rRmRm.m.mRrRRm.mRm.Rm..',
  'R..rm.Rm...mRRm.m..Rm..m..',
  '...r...R....RRm....m...m..',
  '.......S....sS.....S......',
  '.......sS...sS....sS......',
  '........S...sS....S.......',
  '........sS..sS...sS.......',
  '.........S..sS...S........',
  '.........sS.sS..sS........',
  '..........S.sS..S.........',
  '..........sSsS.sS.........',
  '...........sSSsS..........',
  '...........sSSS...........',
];
function sumacBush() {
  return art(SUMAC, SUMAC_PAL);
}

// ===========================================================================
// Ground cover
// ===========================================================================
const FLOWER_STEM = { G: '#2a4f2c', g: '#3e7236', l: '#5f9640', L: '#8cbc54' };
const GC = {};
const GRASS = { L: '#b8d878', l: '#7fb24e', g: '#4f8a3c', G: '#336434', D: '#224a2a' };
const GRASS_AU = { L: '#dcd88a', l: '#b0b04e', g: '#86903a', G: '#5e6c2e', D: '#3e4c24' };
GC.tuft_0 = () => [art([
  '...L.....',
  '.L.l..L..',
  '.l.lL.l..',
  '..glg.g.L',
  '..gGgGg.l',
  '.gGGGGGg.',
  '..DGDGD..',
], GRASS, { k: 0.5, lit: 0.42 })];
GC.tuft_1 = () => [art([
  '.....L.....',
  '..L..l..L..',
  '..l..lL.l..',
  'L.lg.gl.g.L',
  'l.gg.gg.g.l',
  '.gGgGgGgGg.',
  '..GGDGGDG..',
  '...DDDDD...',
], GRASS, { k: 0.5, lit: 0.42 })];
GC.tuft_2 = () => [art([
  '...L...',
  '.L.l.L.',
  '.l.l.l.',
  '.glgGg.',
  '..GGG..',
  '..DDD..',
], GRASS, { k: 0.5, lit: 0.42 })];
GC.tuft_3 = () => [art([
  '......L.....',
  '...L..l..L..',
  '.L.l.Ll..l..',
  '.l.lg.g.gl.L',
  '..gg.gg.g..l',
  '..gGgGgGgGg.',
  '...GGDGDGG..',
  '....DDDDD...',
], GRASS_AU, { k: 0.5, lit: 0.42 })];
const TALLG = { h: '#f0dca0', H: '#c8a868', A: '#a89a5a', a: '#7e7a42', L: '#a8cc6a', l: '#78a84a', g: '#4f8a3c', G: '#336434', D: '#224a2a' };
GC.tallgrass_0 = () => [art([
  '....h.......',
  '...hH.......',
  '...Hh....h..',
  '...hA...hH..',
  '...Ha...Hh..',
  '....a...hA..',
  '....a...Aa..',
  '....a...a...',
  '.l..a..a....',
  '.l..a..a..l.',
  '..l.a..a..l.',
  '..l.ga.a.l..',
  '..lgg.ag.l..',
  '...lg.gg.g..',
  '...gg.gGgg..',
  '..gGg.GGg...',
  '..gGGgGGgG..',
  '...GGDGDG...',
], TALLG, { k: 0.5, lit: 0.42 })];
GC.tallgrass_1 = () => [art([
  '.......h......',
  '..h...hH......',
  '..Hh..Hh...h..',
  '...h..hA..hH..',
  '...a...a..Hh..',
  '...a...a...a..',
  '.L.a...a...a..',
  '.l.a..La...a..',
  '..la..la...a.L',
  '..la..la..a..l',
  '..ga..ga..a.l.',
  '.l.a.lga.ga.l.',
  '.l.gaLg.ga..g.',
  '..lgalg.ggalg.',
  '..lgggg.gGglg.',
  '...gGgg.GGgg..',
  '...gGGgGGGgG..',
  '..gGGGGGGGGg..',
  '...GGDGDGDG...',
  '....DDDDDD....',
], TALLG, { k: 0.5, lit: 0.42 })];
const FERN = { L: '#a6d072', l: '#6fa84a', g: '#44803a', G: '#2c5a30', D: '#1c3e26' };
const FERN_AU = { L: '#f0d880', l: '#d0a844', g: '#a07a2c', G: '#6e5424', D: '#4a381c' };
const FERN0 = [
  '.......L...L.......',
  '......Ll...lL......',
  '..L..Llg...glL..L..',
  '.Ll..lgg...ggl..lL.',
  'Llg.Llg.....glL.glL',
  'lgg.lgg.....ggl.ggl',
  '.gg.lg..L.L..gl.gg.',
  '.Gg.gg.Ll.lL.gg.gG.',
  '..Gg.gGlg.glGg.gG..',
  '..GgggGgg.ggGgggG..',
  '...GgGGgg.ggGGgG...',
  '....GGGgGgGgGGG....',
  '.....GGGGGGGGG.....',
  '......DGGDGGD......',
  '.......DDDDD.......',
];
GC.fern_0 = () => [art(FERN0, FERN, { k: 0.52, lit: 0.44 })];
GC.fern_1 = () => [art([
  '......L...L......',
  '.....Ll...lL.....',
  '.L..Llg...glL..L.',
  'Ll..lgg...ggl..lL',
  'lg.Llg.....glL.gl',
  'gg.lgg.L.L.ggl.gg',
  'Gg.lg.Ll.lL.gl.gG',
  '.Gg.gGlg.glGg.gG.',
  '.GgggGgg.ggGgggG.',
  '..GgGGgg.ggGGgG..',
  '...GGGgGgGgGGG...',
  '....GGGGGGGGG....',
  '.....DGGDGGD.....',
  '......DDDDD......',
], FERN_AU, { k: 0.52, lit: 0.44 })];
GC.clover = () => [art([
  '..gl.......',
  '.glLg.lL...',
  '.Gggl.glg..',
  '..GgGlgGl..',
  '.lL.G.GW...',
  'glLg.gwWw..',
  'GggGgGWiw..',
  '.GGgGG.i...',
], { ...FLOWER_STEM, W: '#fff6f8', w: '#f4c8d8', i: '#d884a8' })];
GC.mushroom_red = () => [art([
  '...rRRr.........',
  '..rWrrWRr.......',
  '.rrrrWrrRR......',
  '.rWrrrrWrR..rRr.',
  'rrrrrWrrrRR.WrRR',
  'RRrrrrrRRRRrrrWR',
  '.DRRRRRRRD.RRRR.',
  '...cCcCC....cC..',
  '...WccCc....Wc..',
  '..cWcCCC....Wc..',
  '...WWcC....cWcC.',
  '...WccC....WcC..',
  '..gWccCg..gWcCg.',
], { r: '#e8402e', R: '#b02630', D: '#7a1a2a', W: '#fff6e8', c: '#efe2cc', C: '#c8b49a', g: '#4a7a36' })];
GC.mushroom_brown = () => [art([
  '.yYYy......',
  'yYyyyo..yY.',
  'oyyyoO.yYyo',
  '.OooO.yyyoO',
  '..yo...OoO.',
  '..yO..yYo..',
  '.gyOg.yO...',
  '..yO.gyOg..',
], { Y: '#ffe07a', y: '#f7b43a', o: '#d98a26', O: '#a35e1c', g: '#4a7a36' })];
GC.fireweed = () => [art([
  '...n...',
  '..nNm..',
  '..mnN..',
  '.nNmn..',
  '.mnNmn.',
  '..mNnm.',
  '.nmnNm.',
  '.mNmMn.',
  '..mMm..',
  '.nMlMm.',
  '..Ml.M.',
  '...lg..',
  '..Lg...',
  '..lgG..',
  '...gl..',
  '..Lg...',
  '..gGl..',
  '...g...',
], { ...FLOWER_STEM, N: '#ffb2e0', n: '#f06ab8', m: '#c83a92', M: '#8e2468' })];
function lupine(hi, mid, lo, dk) {
  return [art([
    '...h...',
    '..hm...',
    '..mhd..',
    '.hmmd..',
    '..hmmd.',
    '.hmdmd.',
    '.mhmdd.',
    '.hmdmd.',
    '..mdd..',
    '..Gg...',
    'l.lg.L.',
    'Llglgll',
    '.gLgGg.',
    '...g...',
  ], { ...FLOWER_STEM, h: hi, m: mid, d: lo, D: dk })];
}
GC.lupine_purple = () => lupine('#c8a8ff', '#8a64e0', '#5a3aa8', '#3a2278');
GC.lupine_blue = () => lupine('#a8ccff', '#5a8ae8', '#3456b0', '#22357a');
GC.lupine_pink = () => lupine('#ffc2e0', '#ee7ab8', '#b8468a', '#7a2a5e');
GC.daisy = () => [art([
  '..w.w..',
  '.wWwWw.',
  'wWyYwWw',
  '.wyoWw.',
  'wWwWwWw',
  '..wLw..',
  '..Lg...',
  '.lLg.l.',
  '..lgLl.',
  '...g...',
], { ...FLOWER_STEM, w: '#dfe2ee', W: '#ffffff', y: '#ffd23f', Y: '#fff08a', o: '#e0962a' })];
GC.susan = () => [art([
  '..y.y..',
  '.yYyYy.',
  'yYbBYyo',
  '.ybbyo.',
  'oyYyoyo',
  '..oLo..',
  '..Lg...',
  '.lLg.l.',
  '..lgLl.',
  '...g...',
], { ...FLOWER_STEM, y: '#f7b62a', Y: '#ffd84a', o: '#d8861e', b: '#4a2a1e', B: '#6e4430' })];
GC.trillium = () => [art([
  '...W....',
  '..WwW...',
  '.wWyWw..',
  'wW.W.Ww.',
  '.w.g.w..',
  'lLlgLLl.',
  '.lLgGl..',
  '..lgl...',
  '...g....',
], { ...FLOWER_STEM, W: '#ffffff', w: '#dcd8ec', y: '#f4d04a' })];
GC.aster = () => [art([
  '.v.....',
  'vYv.v..',
  '.vVvYv.',
  '.gvVv.v',
  '.g.g.vYv',
  '..lg..v.',
  '.lLgGg..',
  '..lgl...',
  '...g....',
], { ...FLOWER_STEM, v: '#a888f0', V: '#6c52c0', Y: '#ffd84a' })];
GC.dandelion = () => [art([
  '..Y...',
  '.YyY..',
  'YyyoY.',
  '.YoY..',
  '..g...',
  'l.gl.l',
  'Llglgl',
  '.GlgG.',
], { ...FLOWER_STEM, Y: '#ffe45a', y: '#fbc02a', o: '#e0901e' })];

// ===========================================================================
// Rocks & wood
// ===========================================================================
const GRANITE = pals(['#2e2632', '#433742', '#584952', '#6e5c63', '#857176', '#9c878a', '#b39f9e', '#cab8b2', '#e2d2c8']);
const LICHEN = pals(['#7e8a4e', '#a2ae66', '#c4cc88']);
const LICHEN_O = pals(['#b0602e', '#d88a44', '#f0b060']);
const MOSS = pals(['#1f3a22', '#2c5028', '#3e6a30', '#56853a', '#74a044', '#98bc58']);

// Faceted granite: the silhouette is a lumpy superellipse sitting on the
// ground; Voronoi facets get their own plane normal (flat-shaded), then
// speckles (mica, feldspar, quartz), lichen and moss are sprinkled on top.
function rockSprite(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const pal = o.pal || GRANITE;
  const cx = W / 2, rx = W / 2 - 1.5, ry = (H - 2) / 2 * (o.tall ?? 1);
  const cy = H - 1 - ry * 0.86;
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28];
  const inside = (x, y) => {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (y >= H) return false;
    const a = Math.atan2(ny, nx);
    const r = 1 + 0.07 * Math.sin(a * 3 + ph[0]) + 0.05 * Math.sin(a * 5 + ph[1]) + 0.04 * Math.sin(a * 2 + ph[2]);
    const e = 2.3;
    return Math.pow(Math.abs(nx), e) + Math.pow(Math.abs(ny < 0 ? ny : ny * 1.05), e) < Math.pow(r, e);
  };
  const facets = [];
  const K = o.facets ?? Math.max(4, Math.round((W * H) / 70));
  for (let k = 0; k < K * 4 && facets.length < K; k++) {
    const x = cx + (R() * 2 - 1) * rx * 0.9, y = cy + (R() * 2 - 1) * ry * 0.9;
    if (!inside(Math.floor(x), Math.floor(y))) continue;
    const nx = (x - cx) / rx, ny = (y - cy) / (ry * 1.2);
    let n = [nx * 0.9 + (R() - 0.5) * 0.5, ny * 0.9 - 0.35 + (R() - 0.5) * 0.5, 0];
    n[2] = Math.sqrt(Math.max(0.05, 1 - n[0] * n[0] - n[1] * n[1]));
    const l = Math.hypot(...n);
    facets.push({ x, y, n: n.map((v) => v / l) });
  }
  const fid = new Int16Array(W * H).fill(-1);
  const edge = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      let d1 = 1e9, d2 = 1e9, b = 0;
      facets.forEach((f, k) => {
        const d = (x + 0.5 - f.x) ** 2 + ((y + 0.5 - f.y) * 1.3) ** 2;
        if (d < d1) { d2 = d1; d1 = d; b = k; } else if (d < d2) d2 = d;
      });
      fid[y * W + x] = b;
      edge[y * W + x] = Math.sqrt(d2) - Math.sqrt(d1) < 0.9 ? 1 : 0;
    }
  const N = pal.length;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = fid[y * W + x];
      if (k < 0) continue;
      const n = facets[k].n;
      let v = (n[0] * LX + n[1] * LY + n[2] * LZ) * 1.3 - 0.38;
      // ambient occlusion towards the ground
      v -= 0.55 * smooth(0.55, 1, (y - (cy - ry)) / (H - (cy - ry)));
      v += (hash(x, y, seed) - 0.5) * 0.12;
      let idx = Math.round((N - 1) * (0.5 + v * 0.42));
      if (edge[y * W + x]) {
        // facet edge: highlight if the facet above-left is lit, crease otherwise
        const up = y > 0 ? fid[(y - 1) * W + x] : -1;
        if (up >= 0 && up !== k) idx += facets[up].n[1] < n[1] ? -1 : 1;
      }
      p.set(x, y, pal[clamp(idx, 0, N - 1)]);
    }
  // top-left rim light
  for (let y = 1; y < H; y++)
    for (let x = 1; x < W; x++) {
      if (fid[y * W + x] < 0) continue;
      if ((fid[(y - 1) * W + x] < 0 || fid[y * W + x - 1] < 0) && x + 0.5 < cx + rx * 0.3 && y < cy + ry * 0.2) {
        const cur = pal.indexOf(p.get(x, y));
        p.set(x, y, pal[clamp(cur + 1, 0, N - 1)]);
      }
    }
  // speckles
  const nsp = Math.round((W * H) / (o.speck ?? 16));
  for (let i = 0; i < nsp; i++) {
    const x = Math.floor(R() * W), y = Math.floor(R() * H);
    if (fid[y * W + x] < 0) continue;
    const cur = pal.indexOf(p.get(x, y));
    const t = R();
    if (t < 0.45) p.set(x, y, pal[clamp(cur - 2, 0, N - 1)]); // mica
    else if (t < 0.75) p.set(x, y, mix(pal[clamp(cur, 0, N - 1)], hx('#e0a090'), 0.3)); // feldspar
    else p.set(x, y, pal[clamp(cur + 2, 0, N - 1)]); // quartz
  }
  // lichen blotches on the upper surfaces
  const blot = (cxb, cyb, rr, P3) => {
    for (let y = Math.floor(cyb - rr); y <= cyb + rr; y++)
      for (let x = Math.floor(cxb - rr); x <= cxb + rr; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || fid[y * W + x] < 0) continue;
        const d = Math.hypot(x + 0.5 - cxb, (y + 0.5 - cyb) * 1.4);
        if (d > rr || hash(x, y, seed + 33) < 0.25) continue;
        p.set(x, y, P3[clamp(Math.round(2 - (x - cxb + y - cyb) * 0.35 - d * 0.4), 0, 2)]);
      }
  };
  for (let i = 0; i < (o.lichen ?? 2); i++) {
    const x = cx + (R() - 0.6) * rx * 1.2, y = cy - ry * (0.2 + R() * 0.5);
    blot(x, y, 1.2 + R() * 1.4, R() < 0.3 ? LICHEN_O : LICHEN);
  }
  // moss cap
  if (o.moss) {
    for (let x = 0; x < W; x++) {
      let top = -1;
      for (let y = 0; y < H; y++) if (fid[y * W + x] >= 0) { top = y; break; }
      if (top < 0) continue;
      const u = (x + 0.5 - cx) / rx;
      const depth = o.moss * (1 - u * u) * (0.8 + 0.4 * Math.sin(x * 1.3 + seed)) + (hash(x, 0, seed) < 0.3 ? 1 : 0);
      for (let y = top; y < top + depth && y < H; y++) {
        const t = (y - top) / Math.max(1, depth);
        p.set(x, y, MOSS[clamp(Math.round(4.3 - t * 3 - u * 1.2 + (hash(x, y, seed + 7) - 0.5) * 1.5), 0, 5)]);
      }
      // drips of moss
      if (hash(x, 1, seed) < 0.25 && depth > 1) p.set(x, top + Math.ceil(depth), MOSS[1]);
    }
  }
  // ground contact
  for (let x = 0; x < W; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.3));
  outline(p, { noBottom: true });
  return p;
}

// Horizontal log: shaded cylinder with bark furrows, a cut end with rings,
// moss on the top.
function logSprite(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const bark = o.bark || pals(['#2a1c1e', '#3e2a28', '#553a30', '#6e4c3a', '#886046', '#a07654']);
  const wood = pals(['#8a6040', '#b08050', '#cda064', '#e4c080', '#f4dca0']);
  const r = (H - 2) / 2; // radius (rows)
  const cy = 1 + r;
  const x0 = 1 + Math.ceil(r * 0.45), x1 = W - 2;
  for (let x = x0; x <= x1; x++) {
    const endTaper = x > x1 - 2 ? 1 : 0;
    for (let y = 1 + endTaper; y < H - 1 + (endTaper ? -1 : 1) && y < H; y++) {
      const ny = (y + 0.5 - cy) / r; // -1 top .. 1 bottom
      let v = -ny * 0.75 + 0.1 - (x > x1 - 3 ? 0.2 : 0);
      if (o.birch) {
        const mark = (hash(x, Math.floor((y + (x % 3)) / 3), seed) < 0.16 && Math.abs(ny) < 0.85) || (hash(x >> 2, 9, seed) < 0.12 && y === Math.round(cy + 1));
        p.set(x, y, mark ? mix(hx('#2a2230'), 0x8a8594, Math.max(0, -ny) * 0.3) : pick(P.barkBirch, v * 1.2 + 0.1));
        continue;
      }
      // furrows run along the log
      const furrow = hash(Math.floor(x / 3 + hash(y, 0, seed) * 3), y, seed) < 0.3 ? -0.45 : 0;
      p.set(x, y, pick(bark, v + furrow + (hash(x, y, seed + 1) - 0.5) * 0.15));
    }
  }
  // cut end: an upright ellipse with growth rings
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
  if (o.moss) {
    for (let x = x0 + 2; x < x1 - 1; x++) {
      if (hash(x >> 2, 3, seed) < 0.45) continue;
      const d = 1 + (hash(x, 4, seed) < 0.5 ? 1 : 0);
      for (let y = 1; y < 1 + d; y++) p.set(x, y, MOSS[clamp(4 - y + (hash(x, y, seed) < 0.3 ? 1 : 0), 0, 5)]);
    }
  }
  if (o.shroom) {
    const sx = Math.round(lerp(x0, x1, 0.62));
    const cap = pals(['#8a4a22', '#c0702e', '#e89a48', '#fcc878']);
    p.set(sx, 0, cap[3]); p.set(sx + 1, 0, cap[2]); p.set(sx - 1, 1, cap[2]); p.set(sx, 1, cap[2]); p.set(sx + 1, 1, cap[1]); p.set(sx + 2, 1, cap[0]);
    p.set(sx + 3, 1, cap[2]); p.set(sx + 4, 1, cap[1]); p.set(sx + 3, 0, cap[3]);
  }
  for (let x = 0; x < W; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.35));
  outline(p, { noBottom: true });
  return p;
}

// Cut stump: bark sides, ringed top face seen from above, flaring roots.
function stumpSprite(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const bark = pals(['#2a1c1e', '#3e2a28', '#553a30', '#6e4c3a', '#886046', '#a07654']);
  const wood = pals(['#8a6040', '#b08050', '#cda064', '#e4c080', '#f4dca0']);
  const cx = W / 2, rx = W / 2 - 3, topY = o.topY ?? 4, ry = o.ry ?? 3;
  // body with root flare
  for (let y = topY; y < H; y++) {
    const t = (y - topY) / (H - 1 - topY);
    const w = rx + Math.pow(t, 3) * 3;
    for (let x = Math.floor(cx - w); x < Math.ceil(cx + w); x++) {
      const s = (x + 0.5 - (cx - w)) / (2 * w);
      const furrow = hash(x, (y + x) >> 2, seed) < 0.28 ? -0.45 : 0;
      p.set(x, y, pick(bark, 0.55 - s * 1.3 + furrow - (H - 1 - y < 1 ? 0.4 : 0)));
    }
  }
  // roots
  for (const [dx, len] of [[-1, 3], [1, 2]]) {
    const bx = cx + dx * (rx + 1);
    for (let k = 0; k < len; k++) p.set(bx + dx * (k + 1), H - 1 - (k === 0 ? 1 : 0), pick(bark, dx < 0 ? 0 : -0.5));
    p.set(bx + dx * (len + 1), H - 1, pick(bark, -0.3));
  }
  // top face
  for (let y = topY - ry; y <= topY + ry; y++)
    for (let x = Math.floor(cx - rx); x < Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - topY) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) continue;
      if (d > 0.84) { p.set(x, y, bark[ny > 0 ? 2 : 4]); continue; }
      const ring = Math.floor(d * 3.4) % 2;
      p.set(x, y, wood[clamp(Math.round(3.2 - ring - nx * 0.8 - ny * 0.6), 0, 4)]);
    }
  // crack and a little moss
  p.set(Math.round(cx + 1), topY, wood[0]);
  p.set(Math.round(cx + 2), topY + 1, wood[0]);
  for (let x = Math.floor(cx - rx); x < cx - 1; x++) if (hash(x, 9, seed) < 0.6) p.set(x, H - 2 - (hash(x, 8, seed) < 0.5 ? 1 : 0), MOSS[3]);
  if (o.roots) return p; // caller adds details and outlines
  outline(p, { noBottom: true });
  return p;
}

const WOODS = {
  pinecone: () => [art([
    '.gG.',
    'hmMh',
    'mhmM',
    'hmMh',
    'mhmM',
    '.mM.',
  ], { g: '#5a7a3a', G: '#3a5a2a', h: '#c08a54', m: '#8a5a34', M: '#5a3a24' })],
  driftwood: () => [art([
    '..........................',
    '...........Tt.............',
    '.TTtt.......tS............',
    'TUUTTttTTTttTTttSS....tt..',
    'tTUUTTTTUUTTTTTTttSSSTTUt.',
    '.tsTTttTTTTttTtTTTtsSsTTs.',
    '..SSsstssSSttsssttSSsSSS..',
    '....SSSS..SSSSSSSS........',
  ], { U: '#f0ece2', T: '#d4ccc0', t: '#aea69c', s: '#8a827c', S: '#66605e' })],
};
function leafSprite(pal) {
  return [art([
    '.a.a.',
    'aAbAa',
    '.bAb.',
    '..s..',
  ], { a: pal[0], A: pal[1], b: pal[2], s: pal[3] }, { k: 0.5 })];
}
const PEBBLES = [
  ['.ab.', 'abbc', '.cc.'],
  ['.ab..', 'abbbc', '.bcc.'],
  ['ab.', 'bbc', '.c.'],
  ['..ab.', '.abbc', 'abbc.', '.cc..'],
];
const PEB_PAL = [
  { a: '#d6ccc4', b: '#a89c9c', c: '#766a72' },
  { a: '#dcc6a8', b: '#b09474', c: '#7c6450' },
  { a: '#c8ccd0', b: '#949aa4', c: '#62687a' },
  { a: '#e4d4c8', b: '#b8a098', c: '#86706e' },
];

// ===========================================================================
// Water plants
// ===========================================================================
const REED = { L: '#b6d27a', l: '#86b050', g: '#588a3a', G: '#3a6430', D: '#264a28', y: '#d8c070', Y: '#b09a50' };
const CAT = { ...REED, h: '#a8744a', b: '#7a4a2e', B: '#50301e', s: '#c8a070' };
const WATER_PLANTS = {
  cattail_0: [
    '.....s........',
    '.....s....s...',
    '....hbB...s...',
    '....hbB..hbB..',
    '....hbB..hbB..',
    '.L..hbB..hbB..',
    '.l..hbB..hbB..',
    '..l.hbB..hbB..',
    '..l..g...hbB..',
    '..lL.g....g..L',
    '...l.g....g.l.',
    '...lLg....gLl.',
    '....lg...lg.l.',
    '....lg...lg.g.',
    '....lgL..lgg..',
    '.L..lgl..lgG..',
    '.lL.lglL.lgG..',
    '..l.lgGl.lgG..',
    '..lLlgGllgG...',
    '...llgGllgG...',
    '...lgggGlgG...',
    '...lgGgGggG...',
    '....gGGGgG....',
    '....GGDGGD....',
  ],
  cattail_1: [
    '......s.....',
    '......s.....',
    '.....hbB....',
    '.....hbB....',
    '.....hbB....',
    '.....hbB..y.',
    '.....hbB.yY.',
    '..L..hbB.Y..',
    '..l..hbB.Y..',
    '..l...g..Y..',
    '..lL..g.lY..',
    '...l..g.l...',
    '...l..g.l...',
    '...lL.g.lL..',
    '....l.gLl...',
    '....lLglg...',
    '.L..llgGg...',
    '.lL.llgGgL..',
    '..llllgGgl..',
    '...llgggGl..',
    '...lgGgGG...',
    '....gGGGG...',
    '....GDGDG...',
  ],
  reeds_0: [
    '....y.......',
    '....Y...y...',
    '....l...Y...',
    '.y..l...l...',
    '.Y..l...l.y.',
    '.l..l..Ll.Y.',
    '.l..lL.l..l.',
    '..l.lg.l..l.',
    '..l.lg.l.l..',
    '..l.lg.lgl..',
    '..lLlg.lgl..',
    '...llg.lg...',
    '...lgg.lg...',
    '...lgglgG...',
    '...lgglgG...',
    '...lgGlgG...',
    '....gGggG...',
    '....GGDGG...',
  ],
  reeds_1: [
    '...y......',
    '...Y......',
    '...l...y..',
    '...l...Y..',
    '.L.l...l..',
    '.l.l..ll..',
    '..ll..l...',
    '..llL.l...',
    '..lglLl.L.',
    '..lgglgl..',
    '..lgglgl..',
    '...ggGgG..',
    '...gGGgG..',
    '...GGDGG..',
  ],
  wildrice: [
    '.....h.......',
    '....hHh......',
    '...h.y.H.h...',
    '..H..y..hHh..',
    '.h...y.h.y.H.',
    '.....y...y..h',
    '..h..y...y...',
    '.hHh.Y...y...',
    'h.y.HY...Y...',
    '..y..Y...Y...',
    '..y..Y...Y...',
    '..Y..Y...Y...',
    '..Y..Y..LY...',
    '..Y..Y..lY...',
    'L.Y..g..lY...',
    'l.Y..g.l.Y...',
    '.lY..g.l.g...',
    '.lg..g.l.g.L.',
    '..g..g.l.g.l.',
    '..gL.gl..gl..',
    '..gl.gl..gl..',
    '..glLgl.lg...',
    '...lggglgg...',
    '...lgGgGgG...',
    '....GgGGG....',
    '....GGDGG....',
  ],
  lilypad_0: [
    '....LLLlll....',
    '..LLlllgllll..',
    '.Llllgllgllgg.',
    'Llllgllglgg.gg',
    'lllgllgggg..gG',
    '.llgglgggG..GG',
    '..gggGGgg..GG.',
    '....GGGGG.G...',
  ],
  lilypad_1: [
    '...LLll.......',
    '.LLllgll......',
    'Llgllgll.LLl..',
    'llglgglgLllgl.',
    '.gggg..GLlglgg',
    '..GG..G.lglgGG',
    '........gGGGG.',
  ],
  lilyflower_pink: [
    '...w.w...',
    '.w.pWp.w.',
    '.pwPyPwp.',
    'pPpyYypPp',
    '.pPPpPPp.',
    '..gGgGg..',
  ],
  lilyflower_white: [
    '...w.w...',
    '.w.pWp.w.',
    '.pwPyPwp.',
    'pPpyYypPp',
    '.pPPpPPp.',
    '..gGgGg..',
  ],
};
const LILY = { L: '#a6d466', l: '#72b04a', g: '#4c8c3c', G: '#2e6432' };
const LILYF_P = { W: '#fff4fa', w: '#ffc4dc', p: '#f08ab8', P: '#c0588e', y: '#f4c030', Y: '#fff080', g: '#4c8c3c', G: '#2e6432' };
const LILYF_W = { W: '#ffffff', w: '#f4f2ff', p: '#dcdaf0', P: '#aaa6c8', y: '#f4c030', Y: '#fff080', g: '#4c8c3c', G: '#2e6432' };

// Duckweed: a flat drifting patch of tiny round fronds, seen from above.
function duckweed(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const pal = pals(['#2e6a2e', '#4a8c36', '#6cac44', '#98cc5a', '#c4e67c']);
  const cx = W / 2, cy = H / 2;
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const x = cx + Math.cos(a) * d * (W / 2 - 1.5) * (1 + 0.2 * Math.sin(a * 3 + seed));
    const y = cy + Math.sin(a) * d * (H / 2 - 1.2);
    const X = Math.floor(x), Y = Math.floor(y);
    const v = R();
    p.set(X, Y, pal[v < 0.3 ? 1 : 2]);
    if (v > 0.5) p.set(X + 1, Y, pal[v > 0.85 ? 3 : 2]);
    if (v > 0.75) p.set(X, Y - 1, pal[4]);
  }
  outline(p, { k: 0.45, lit: 0.4 });
  return p;
}

// ===========================================================================
// Birds
// ===========================================================================
// Songbird template frames (side view, facing right). Region letters:
//  q crest   c crown   n nape   f face   a mask   e eye   k beak   j throat
//  m breast band   b back   w wing   v wing tip   x wing bar   t tail
//  r tail tip   u breast   y belly   l legs
const SONG = {
  idle0: [
    '.......qq...',
    '......qccc..',
    '.....ncccca.',
    '.....nfaeaak',
    '....bnffjaa.',
    '..bbbwwwujj.',
    '.tbbwwwwuum.',
    'ttbwwwwxuuu.',
    'trvvwwwuuuy.',
    'r...vvyyyy..',
    '......l.l...',
  ],
  idle1: [
    '.......qq...',
    '......qccc..',
    '.....ncccca.',
    '.....nfaffak',
    '....bnffjaa.',
    't.bbbwwwujj.',
    'ttbbwwwwuum.',
    'rtbwwwwxuuu.',
    '.rvvwwwuuuy.',
    '....vvyyyy..',
    '......l.l...',
  ],
  hop0: [
    '............',
    '.......qq...',
    '......qccc..',
    '.....ncccca.',
    '.....nfaeaak',
    '...bbnffjaa.',
    '.tbbwwwwujj.',
    'ttbwwwwxuum.',
    'trvvwwwuuuu.',
    'r..vvwyyyyy.',
    '.....l.l....',
  ],
  hop1: [
    '.......qq...',
    '......qccc..',
    '.....ncccca.',
    '.....nfaeaak',
    '....bnffjaa.',
    't.bbbwwwujj.',
    'ttbbwwwwuum.',
    'rtbwwwwxuuu.',
    '.rvvvwwuuuy.',
    '....vvyyyy..',
    '.....l..l...',
  ],
  peck0: [
    '............',
    '............',
    'tr..........',
    'ttbb...qq...',
    '.tbbbbqccc..',
    '..bwwwncccca',
    '..wwwwnfaeak',
    '..vwwwxfjaak',
    '...vvwuujj..',
    '....yyyuu...',
    '......l.l...',
  ],
  peck1: [
    '............',
    '............',
    'r...........',
    'tr..........',
    'ttbbb.......',
    '.tbbbbbqq...',
    '..bwwwwqccc.',
    '..wwwwnccccc',
    '..vvwwxnfeaa',
    '...vvuuujfak',
    '....yyl.l..k',
  ],
  fly0: [
    '.....v......',
    '....vw......',
    '....ww......',
    '...wwx..qq..',
    '...wwbbqccc.',
    'ttbbwbbncceak',
    'rttbbbbnffaa.',
    '.r.yyuuuujj..',
    '.....yyuu....',
    '.............',
  ],
  fly1: [
    '.............',
    '.............',
    '........qq...',
    '.......qccc..',
    'tt.vvwwbncceak',
    'rttbbwwxbnffaa',
    '.rvvwwwbuuujj.',
    '...yyyyuuuu...',
    '.............',
    '.............',
  ],
  fly2: [
    '.............',
    '.............',
    '........qq...',
    '.......qccc..',
    'tt..bbbbncceak',
    'rttbbwwbbnffaa',
    '.r.wwwwxuuujj.',
    '...vwwwyuuu...',
    '...vvwy.......',
    '....v.........',
  ],
  fly3: [
    '.............',
    '.............',
    '...v....qq...',
    '...vw..qccc..',
    'tt.wwxbbncceak',
    'rttbwwbbnffaa.',
    '.r.byyuuuujj..',
    '....yyyuu.....',
    '.............',
    '.............',
  ],
};
const BIRD_KEYS = 'qcnfaekjmbwvxtruyl';
function songPal(o) {
  const d = {};
  for (const ch of BIRD_KEYS) d[ch] = o[ch];
  d.q = o.q || null;
  d.a = o.a || o.f;
  d.m = o.m || o.u;
  d.x = o.x || o.w;
  d.v = o.v || o.w;
  d.r = o.r || o.t;
  d.n = o.n || o.c;
  d.j = o.j || o.u;
  d.l = o.l || '#d08a5a';
  d.e = o.e || '#140e18';
  return d;
}
const BIRDS = {
  bluejay: { q: '#5a8ae0', c: '#5a8ae0', n: '#4a72c8', f: '#f4f6fa', a: '#f4f6fa', k: '#2a2430', j: '#f4f6fa', m: '#262a38', b: '#4a78d0', w: '#3e6ac8', x: '#f4f6fa', v: '#26356e', t: '#3e6ac8', r: '#1c2a5a', u: '#dde2ec', y: '#f4f6fa', l: '#5a5260' },
  cardinal: { q: '#e8402e', c: '#e8402e', n: '#d0342c', f: '#e8402e', a: '#221820', k: '#f59a3a', j: '#221820', b: '#c8302c', w: '#b02a2e', x: '#b02a2e', v: '#7a1e2a', t: '#a82a30', r: '#6e1a26', u: '#ec5040', y: '#d8463a', l: '#8a5a50' },
  chickadee: { c: '#1c1820', n: '#1c1820', f: '#fbfaf4', a: '#fbfaf4', k: '#2a2430', j: '#1c1820', b: '#8c9098', w: '#6e7280', x: '#e8eaee', v: '#4a4e5a', t: '#646876', r: '#3e4250', u: '#f6f2ea', y: '#e8c49a', l: '#5a5260' },
  robin: { c: '#3a3434', n: '#3a3434', f: '#3a3434', a: '#3a3434', k: '#f4c238', j: '#f0ece6', b: '#6e625e', w: '#62564e', x: '#62564e', v: '#3e3432', t: '#2e2828', r: '#1e1a1c', u: '#e8702e', y: '#f4f0ea', m: '#e8702e', l: '#c89a5a' },
  grayjay: { c: '#fbfaf6', n: '#3e3e46', f: '#fbfaf6', a: '#fbfaf6', k: '#2a2430', j: '#f0f0ee', b: '#7c808c', w: '#6c707e', x: '#9ea2ae', v: '#4a4e5c', t: '#6c707e', r: '#4a4e5c', u: '#d4d6dc', y: '#e8e8ea', l: '#4a4450' },
};

const CROW = {
  idle0: [
    '..........ccc..',
    '.........ccccc.',
    '........nccefkk',
    '......bbnfffkk.',
    '....bbbwwbfu...',
    '...bbwwwwwuu...',
    '..bbwwwwwwuu...',
    '.tbwwwwwxvuu...',
    'ttvvvwwvvuu....',
    'tt..vvvyyy.....',
    't.....l.l......',
  ],
  idle1: [
    '..........ccc..',
    '.........ccccc.',
    '........nccffkk',
    '......bbnfffkk.',
    '....bbbwwbfu...',
    '...bbwwwwwuu...',
    't.bbwwwwwwuu...',
    'ttbwwwwwxvuu...',
    '.rvvvwwvvuu....',
    '....vvvyyy.....',
    '......l.l......',
  ],
  hop0: [
    '...............',
    '..........ccc..',
    '.........ccccc.',
    '........nccefkk',
    '....bbbbnfffkk.',
    '...bbwwwwbfu...',
    '..bbwwwwwwuu...',
    '.tbwwwwwxvuu...',
    'ttvvvwwvvuuu...',
    'tt..vvvyyyy....',
    't.....l.l......',
  ],
  hop1: [
    '..........ccc..',
    '.........ccccc.',
    '........nccefkk',
    '......bbnfffkk.',
    '....bbbwwbfu...',
    '...bbwwwwwuu...',
    '..bbwwwwwwuu...',
    'ttbwwvvwxvuu...',
    'trvv..vvvuu....',
    'r....vyyyy.....',
    '.....l..l......',
  ],
  peck0: [
    '...............',
    '...............',
    'tt.............',
    'ttbb...........',
    '.tbbbbb........',
    '..bwwwwbbcc....',
    '..wwwwwwnccc...',
    '..vwwwwxncccec.',
    '...vvwwwufcfkk.',
    '....vvyyuu..kk.',
    '.....l..l......',
  ],
  peck1: [
    '...............',
    '...............',
    't..............',
    'tt.............',
    'ttbbb..........',
    '.tbbbbbb.......',
    '..bwwwwwbcc....',
    '..wwwwwwnccc...',
    '..vvwwwxncccec.',
    '...vvwwuufcfk..',
    '....yyl..l..kk.',
  ],
  fly0: [
    '......vv.......',
    '.....vww.......',
    '.....www.......',
    '....wwwx...cc..',
    '....wwwbb.cccc.',
    'tt.bbwbbbbncekk',
    'rttbbbbbbbnffk.',
    '.r.yyyuuuuuu...',
    '......yyuu.....',
    '...............',
  ],
  fly1: [
    '...............',
    '...............',
    '...........cc..',
    '.vvvwwwbb.cccc.',
    'ttvvwwwwbbncekk',
    'rttbbwwxbbnffk.',
    '.r.yyuuuuuuu...',
    '.....yyyuu.....',
    '...............',
    '...............',
  ],
  fly2: [
    '...............',
    '...............',
    '...........cc..',
    '..........cccc.',
    'tt..bbbbbbncekk',
    'rttbbwwwbbnffk.',
    '.r.wwwwwxuuuu..',
    '...vwwwwyyuu...',
    '...vvwwy.......',
    '....vv.........',
  ],
  fly3: [
    '...............',
    '...............',
    '....vv.....cc..',
    '....vww...cccc.',
    'tt..wwxbbbncekk',
    'rttbwwbbbbnffk.',
    '.r.byyuuuuuu...',
    '.....yyyuu.....',
    '...............',
    '...............',
  ],
};
BIRDS.crow = { c: '#2c2a3c', n: '#2c2a3c', f: '#2c2a3c', e: '#d8d0c0', k: '#1a1822', b: '#302e44', w: '#27253a', x: '#46466a', v: '#1a182c', t: '#27253a', r: '#1a182c', u: '#312f44', y: '#2a283a', l: '#1e1c28' };

// Water birds: sit on the waterline (bottom row is a ripple line).
const WATERLINE = { '~': '#d4eef8', '-': '#8cc8e0' };
const GOOSE_PAL = { ...WATERLINE, k: '#1e1a22', K: '#34303a', w: '#f6f4ee', g: '#8a7a6a', G: '#6a5a4e', h: '#a89888', n: '#c8bcae', N: '#b0a494', t: '#1e1a22', W: '#f6f4ee', e: '#6a6070' };
const GOOSE = {
  swim0: [
    '...............kk.....',
    '..............kkkk....',
    '..............kwwkkk..',
    '..............kwwkk...',
    '...............kk.....',
    '...............Kk.....',
    '...............Kk.....',
    '..t............Kk.....',
    '.ttghhghhghhhgnnk.....',
    'tWWgGhgGhgGhgnnnN.....',
    '.WWgGgGgGgGggnnNN.....',
    '..WGGGGGGGGGGNNN......',
    '..~~-~~~-~~~~-~~~.....',
  ],
  swim1: [
    '......................',
    '...............kk.....',
    '..............kkkk....',
    '..............kwwkkk..',
    '..............kwwkk...',
    '...............Kk.....',
    '...............Kk.....',
    '..t............Kk.....',
    '.ttghhghhghhhgnnk.....',
    'tWWgGhgGhgGhgnnnN.....',
    '.WWgGgGgGgGggnnNN.....',
    '..WGGGGGGGGGGNNN......',
    '.~-~~~-~~~~-~~~-~.....',
  ],
  fly0: [
    '.......hh.............',
    '......hGG.............',
    '......gGG.............',
    '.....ggGG.............',
    '.....gGGg.........kk..',
    'tt..hggGGhhh.....kwwkk',
    'tWWhhgggghhnnKKKKkwk..',
    '.WWgGggGGgnnNN........',
    '...GGGGGGNNN..........',
  ],
  fly1: [
    '......................',
    '......................',
    '..................kk..',
    '.hhgggGGGhh......kwwkk',
    'thhggGGGGghhnKKKKkwk..',
    'tWWhGGgggghnnN........',
    '.WWgGggGGgnnNN........',
    '...GGGGGGNNN..........',
    '......................',
  ],
  fly2: [
    '......................',
    '......................',
    '..................kk..',
    '.................kwwkk',
    'tt..hhghhhhnnKKKKkwk..',
    'tWWhhgggghnnNN........',
    '.WWgGGGGGgnNN.........',
    '...gGGGGgNN...........',
    '....gGGG..............',
    '.....gG...............',
  ],
  fly3: [
    '......................',
    '......................',
    '......gG..........kk..',
    '.....ggGG........kwwkk',
    'tt..hggGGhhnnKKKKkwk..',
    'tWWhhgggghnnNN........',
    '.WWgGggGGgnnNN........',
    '...GGGGGGNNN..........',
    '......................',
  ],
};
const LOON_PAL = { ...WATERLINE, k: '#1a1a24', K: '#2c3036', g: '#1e3a36', r: '#d8262a', b: '#23222c', w: '#f4f4f0', W: '#dcdcd8', s: '#1a1a24' };
const LOON = {
  swim0: [
    '..............ggk.....',
    '.............gggrk....',
    '.............kkkkbbb..',
    '.............wkw......',
    '.............kwk......',
    '...kkkkkkkkkkkkk......',
    '..kkwkkwkkwkkwkkW.....',
    '.kkwkkwkkwkkwkkkWW....',
    'kkkkkkkkkkkkkkkkWW....',
    '.~~-~~~~-~~~~-~~~~~...',
  ],
  swim1: [
    '......................',
    '..............ggk.....',
    '.............gggrk....',
    '.............kkkkbbb..',
    '.............wkw......',
    '...kkkkkkkkkkkwk......',
    '..kkwkkwkkwkkwkkW.....',
    '.kkwkkwkkwkkwkkkWW....',
    'kkkkkkkkkkkkkkkkWW....',
    '~-~~~~-~~~~-~~~~-~~...',
  ],
  dive0: [
    '......................',
    '......................',
    '......................',
    '......................',
    '...kkkkkkkkk..........',
    '..kkwkkwkkwkkk........',
    '.kkwkkwkkwkkwkkggk....',
    'kkkkkkkkkkkkkkkkgrkbb.',
    '.~~-~~~~-~~~~-~~~~~~b.',
  ],
  dive1: [
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '.......kkkkkk.........',
    '.....kkwkkwkkk..~.....',
    '....kkkkkkkkkkk~.~....',
    '...~~-~~~~-~~~~~-~~...',
  ],
  dive2: [
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '.........~~~~.........',
    '......~~.-..-.~~......',
    '....~-.~~~~~~~~.-~....',
  ],
  call0: [
    '................kbb...',
    '..............ggkb....',
    '.............gggrk....',
    '.............kkkk.....',
    '.............wkw......',
    '...kkkkkkkkkkkwk......',
    '..kkwkkwkkwkkwkkW.....',
    '.kkwkkwkkwkkwkkkWW....',
    'kkkkkkkkkkkkkkkkWW....',
    '.~~-~~~~-~~~~-~~~~~...',
  ],
  call1: [
    '................b.b...',
    '..............ggkb.b..',
    '.............gggrk....',
    '.............kkkk.....',
    '.............wkw......',
    '...kkkkkkkkkkkwk......',
    '..kkwkkwkkwkkwkkW.....',
    '.kkwkkwkkwkkwkkkWW....',
    'kkkkkkkkkkkkkkkkWW....',
    '~-~~~~-~~~~-~~~~-~~...',
  ],
};
const MALLARD_PAL = { ...WATERLINE, g: '#2a8a52', G: '#1c5e3c', y: '#f2c838', w: '#f6f4ee', c: '#8a3e26', C: '#6a2e1e', s: '#aeb0b4', S: '#8a8c94', k: '#1e1c22', b: '#3e62b8', e: '#101014', o: '#f08a2a' };
const MALLARD = {
  swim0: [
    '..........ggg...',
    '.........gggey..',
    '.........gggyyy.',
    '..........wg....',
    '..k......ccc....',
    '.kksssssscccc...',
    'kksSsbbsSsccC...',
    '.kkSSSSSSSCC....',
    '.~~-~~~-~~~~-~..',
  ],
  swim1: [
    '................',
    '..........ggg...',
    '.........gggey..',
    '.........gggyyy.',
    '..k.......wg....',
    '.kksssssscccc...',
    'kksSsbbsSsccC...',
    '.kkSSSSSSSCC....',
    '~-~~~-~~~~-~~~..',
  ],
  fly0: [
    '....ss..........',
    '...sSS..........',
    '...sSb......ggg.',
    '..ssSb.....gggey',
    'kkssssssccwgggyy',
    '.kkSSSSSCCC.....',
    '..........o.....',
  ],
  fly1: [
    '................',
    '................',
    '............ggg.',
    '.ssssbbs...gggey',
    'kkSSsssssccwgyyy',
    '.kkSSSSSCCC.....',
    '..........o.....',
  ],
  fly2: [
    '................',
    '................',
    '............ggg.',
    '...........gggey',
    'kkssssssccwgggyy',
    '.kkSsbbSCCC.....',
    '...SSbbS.o......',
    '...SSS..........',
  ],
};
const HUM_PAL = { g: '#4cc070', G: '#2a8048', r: '#ec2a40', R: '#a01a30', w: '#f4f4ee', W: '#c8ccc8', k: '#1c1a22', e: '#101014', v: ['#f0f8ff', 120], V: ['#d0e4f8', 96] };
const HUM = {
  hover0: [
    '.vv.........',
    'vVVv..gg....',
    '.vVv.ggge.kk',
    '..v.gGgRr...',
    '...gGgWr....',
    '..tGgWW.....',
    '.tt.W.......',
    '.t..........',
  ],
  hover1: [
    '............',
    '......gg....',
    '.....ggge.kk',
    '....gGgRr...',
    '.vVgGgWr....',
    'vVVtGWW.....',
    '.vt.W.......',
    '.t..........',
  ],
};
HUM_PAL.t = '#2a6e44';

function birdFrames(tpl, names, pal, o = {}) {
  const P2 = songPal(pal);
  return names.map((n) => art(tpl[n], P2, { ground: o.ground ?? false, k: 0.66, lit: 0.55, auto: 1, noShade: 'ekl' }));
}

// ===========================================================================
// Bugs & small critters
// ===========================================================================
const GLASS = (a = 118) => ({ v: ['#e8f6ff', a], V: ['#b8dcf4', a - 14] });
const BUGS = {
  dragonfly: [
    [
      '..vv..vv...',
      '...vVvVv...',
      'bbBbBBttEE.',
      '...vVvVv...',
      '..vv..vv...',
    ],
    [
      '...........',
      '....vVvVv..',
      'bbBbBBttEE.',
      '....vVvVv..',
      '...........',
    ],
  ],
  monarch: [
    [
      'kkk...kkk',
      'kOOk.kOOk',
      'kOoOkOoOk',
      'wkOOkOOkw',
      '.kokbkok.',
      '..kw.wk..',
    ],
    [
      '.kk...kk.',
      '.kOk.kOk.',
      '.kOokoOk.',
      '..kOkOk..',
      '..kkbkk..',
      '...w.w...',
    ],
    [
      '....k....',
      '...kOk...',
      '...kOk...',
      '...kok...',
      '....b....',
    ],
  ],
  bee: [
    [
      '..vV..',
      '.vVv..',
      'yKyKyk',
      'yKyKyk',
      '.yKy..',
    ],
    [
      '......',
      '......',
      'yKyKyk',
      'yKyKyk',
      'vVKy..',
      '.vV...',
    ],
  ],
  firefly: [
    [
      '.vv..',
      'vVkkh',
      'ggkkk',
      '.g...',
    ],
    [
      '.vv..',
      'vVkkh',
      'YYkkk',
      '.Y...',
    ],
  ],
  ladybug: [
    [
      '.rrr..',
      'rkrrkh',
      'rrkrrh',
      '.l.l..',
    ],
    [
      '.rrr..',
      'rkrrkh',
      'rrkrrh',
      'l.l.l.',
    ],
  ],
  moth: [
    [
      'mm...mm',
      'mMmbmMm',
      '.mMbMm.',
      '..m.m..',
    ],
    [
      '.m...m.',
      '.mm.mm.',
      '..mbm..',
      '..mbm..',
      '...b...',
    ],
  ],
};
const BUG_PAL = {
  dragonfly: { ...GLASS(125), b: '#44b0f0', B: '#2266b8', t: '#30b884', E: '#2a70b0', e: '#9ae0ff', l: '#1e2a3a' },
  monarch: { k: '#241c24', O: '#f58a1e', o: '#d0601a', w: '#fbf4e8', b: '#2a2028' },
  bluebutterfly: { k: '#1e2248', O: '#7ab4ff', o: '#4a78e0', w: '#eaf2ff', b: '#2a2438' },
  bee: { ...GLASS(150), y: '#ffd23a', K: '#2a2024', k: '#2a2024' },
  firefly: { ...GLASS(130), k: '#3a3024', h: '#e04a3a', g: '#8a9a4a', Y: '#f4ff7a' },
  ladybug: { r: '#e2302a', k: '#1e1a20', h: '#1e1a20', l: '#1e1a20' },
  moth: { m: '#d8c8a8', M: '#a8906e', b: '#7a6450' },
};
function bugFrames(name, key = name, o = {}) {
  const pal = BUG_PAL[name];
  return BUGS[key].map((rows) => art(rows, pal, { ground: false, k: 0.6, lit: 0.5, auto: o.auto ?? 0.6, noShade: 'vVkKeEbl' }));
}
// firefly glow: soft halo around the lantern when lit
function fireflyFrames() {
  const [off, on] = bugFrames('firefly');
  const W = on.w + 4, H = on.h + 4;
  const wrap = (src, glow) => {
    const q = new Px(W, H);
    if (glow)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x + 0.5 - (3 + 1.5), y + 0.5 - (2 + 3.5));
          if (d < 3.6) q.set(x, y, hx('#f4ff8a'), Math.round(150 * (1 - d / 3.6)));
        }
    q.blit(src, 2, 2);
    return q;
  };
  return [wrap(off, false), wrap(on, true)];
}

const FROG_PAL = { g: '#5aa844', G: '#3a7a34', d: '#2a5a2a', l: '#9ad060', y: '#f0e08a', Y: '#fff6c0', e: '#141018', E: '#f4d23a', s: '#fff0b0' };
const FROG = {
  idle0: [
    '.......EE...',
    '......EeEg..',
    '..gggggEEgg.',
    '.gGgdggggggl',
    'gGdggGggyyy.',
    'gGGgggGyyy..',
    '.gGGggGGy...',
    'gGG..gGGg...',
  ],
  idle1: [
    '.......gg...',
    '......gGGg..',
    '..gggggGggg.',
    '.gGgdggggggl',
    'gGdggGggyyy.',
    'gGGgggGyyy..',
    '.gGGggGGy...',
    'gGG..gGGg...',
  ],
  croak0: [
    '.......EE...',
    '......EeEg..',
    '..gggggEEgg.',
    '.gGgdggggggl',
    'gGdggGggyyyy',
    'gGGgggGyyyy.',
    '.gGGggGGyy..',
    'gGG..gGGg...',
  ],
  croak1: [
    '.......EE....',
    '......EeEg...',
    '..gggggEEgg..',
    '.gGgdgggggglY',
    'gGdggGggyYssY',
    'gGGgggGyYsssY',
    '.gGGggGGyYYY.',
    'gGG..gGGg....',
  ],
  jump0: [
    '............',
    '........EE..',
    '.......EeEg.',
    '...ggggggEEg',
    '.gGgdgggggyl',
    'gGGGgGGGyyy.',
    'GG.gGG.GG...',
  ],
  jump1: [
    '..........EE...',
    '.........EeEg..',
    '.....gggggEEgg.',
    '..ggGgdggggggyl',
    'GGgGggGGgyyyy..',
    '.GG....gGG.....',
    '.........GG....',
  ],
};
const SQ_PAL = { r: '#c8622a', R: '#9a4420', o: '#e08a3e', t: '#b8581e', T: '#8a3a1a', h: '#f0a860', w: '#f6ecda', W: '#dccab0', e: '#141018', k: '#2a1c1c', n: '#3a2420' };
const SQUIRREL = {
  idle0: [
    '.tt.........',
    'thTt...r.r..',
    'thhTt..rrr..',
    'thTTt.rrrerk',
    '.thTt.rowrr.',
    '.thTTroowW..',
    '..tTTrrowW..',
    '..tTTrrwwW..',
    '...tTrrrwW..',
    '....TRrRrR..',
  ],
  idle1: [
    '............',
    '..tt...r.r..',
    '.thTt..rrr..',
    'thhTt.rrrerk',
    'thTTt.rowrr.',
    '.thTTroowW..',
    '.thTTrrowW..',
    '..tTTrrwwW..',
    '...tTrrrwW..',
    '....TRrRrR..',
  ],
  run0: [
    'tt..........',
    'thtt.....r..',
    '.thTTt..rrr.',
    '..tTTrrrrrerk',
    '....TrrrrrrR.',
    '...RrooowwW..',
    '..RR......RR.',
  ],
  run1: [
    '............',
    'ttt......r..',
    'thhTt...rrr.',
    '.ttTTrrrrrerk',
    '....TrrrrrrR.',
    '....RrowWR...',
    '.....RR.RR...',
  ],
};

// ===========================================================================
// v3 helpers: stamps, glow, blades, fruit
// ===========================================================================
// Stamp a small pixel-string picture into an existing buffer (no outline).
function stamp(p, rows, pal, x0, y0, o = {}) {
  const map = {};
  for (const [k, v] of Object.entries(pal)) map[k] = Array.isArray(v) ? [typeof v[0] === 'string' ? hx(v[0]) : v[0], v[1] ?? 255] : [typeof v === 'string' ? hx(v) : v, 255];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[o.flip ? row.length - 1 - i : i];
      const v = map[ch];
      if (!v) continue;
      p.set(x0 + i, y0 + j, v[0], v[1]);
    }
  });
}
// Copy an outlined sprite (Px) into `p` with its bottom centre at (x, y).
function place(p, src, x, y, flipX = false) {
  p.blit(src, Math.round(x - src.w / 2), Math.round(y - src.h), flipX);
}

// Glow: the game alpha-tests sprites at 0.5, so instead of a soft alpha halo
// we scatter light motes on an ordered-dither pattern (alpha >= 150). Up close
// they read as a shimmering aura, from afar as a soft bloom. Only empty
// pixels are touched, so call it after outline().
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function glowHalo(p, cx, cy, r, c, dens = 0.6, o = {}) {
  const sy = o.sy ?? 1, a0 = o.alpha ?? 190;
  const hi = o.hi ?? mix(c, 0xffffff, 0.55);
  for (let y = Math.floor(cy - r / sy - 1); y <= cy + r / sy + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      if (!p.ok(x, y) || p.any(x, y)) continue;
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * sy) / r;
      if (d >= 1) continue;
      const th = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      const f = (1 - d) * (1 - d) * dens * 2;
      if (f > th) p.set(x, y, f > th * 2.6 ? hi : c, a0);
    }
}
// Aura: dithered motes in the empty pixels within r of any pixel that passes
// test(x, y) (the emitter), denser close to it.
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
      const th = ((BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16) * 0.6 + hash(x, y, 71) * 0.4;
      const f = (1 - d) * dens;
      if (f > th) out.push(x, y, f > th * 3 ? hi : c);
    }
  for (let i = 0; i < out.length; i += 3) p.set(out[i], out[i + 1], out[i + 2], o.alpha ?? 200);
}
// A glowing pixel with a 1px soft cross around it (on top of existing art).
function sparkle(p, x, y, core, mid, big = false) {
  p.set(x, y, core);
  if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (p.on(x + dx, y + dy)) p.set(x + dx, y + dy, mid);
}
// Dew drop: a 2px bead with a bright highlight and a darker underside.
function dew(p, x, y) {
  if (!p.on(x, y) || !p.on(x, y + 1)) return;
  const under = p.get(x, y + 1);
  p.set(x, y, 0xffffff);
  p.set(x + 1, y, mix(p.get(x + 1, y) ?? 0xbfe8ff, 0xbfe8ff, 0.7));
  p.set(x, y + 1, mix(under, 0x9fd4f0, 0.55));
  p.set(x + 1, y + 1, mix(under, INK, 0.35));
}

// One blade of grass / reed / sedge, drawn from the base upwards.
// lean: total horizontal travel, curl: extra bend near the tip (droop).
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
    let v = 0.15 + t * 0.6 - (t < 0.18 ? 0.45 : 0) + (o.bright ?? 0);
    if (o.dry && hash(X, Y >> 1, o.seed || 3) < o.dry * t) v -= 0.35;
    p.set(X, Y, pick(pal, v));
    // second, shaded column on the lower part of wide blades
    if (t < thick) p.set(X + (lean + curl >= 0 ? 1 : -1), Y, pick(pal, v - 0.65));
  }
  return [x0 + lean + curl, y0 - len + Math.abs(curl) * 0.35];
}

// Fruit stamps. Palettes: [outline/dark, shade, base, light, highlight]
const FRUIT = {
  dot: ['ab', 'bc'],
  round3: ['.lb.', 'lbbd', 'bbdd', '.dd.'],
  round2: ['hb', 'bd'],
  drupe: ['.lm.', 'lmbm', 'mbmd', 'bmdd', '.dd.'],
  drupe_s: ['lm.', 'mbm', '.dd'],
  amber: ['.lm.', 'lmlm', 'mlmd', '.md.'],
  apple: ['.s..', 'hlb.', 'lbbd', 'bbdd', '.dd.'],
  straw: ['.gGg.', 'hlyld', 'lblbd', '.bybd', '.bdd.', '..d..'],
};
function fruit(p, x, y, shape, pal, extra = {}) {
  const [d, s, b, l, h] = pal;
  const m = { a: l, b, c: s, d: s, l, h, m: mix(b, l, 0.5), y: hx('#ffe88a'), s: hx('#5a3a26'), g: hx('#6aa846'), G: hx('#3e7a36'), ...extra };
  const rows = FRUIT[shape];
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      p.set(x + i, y + j, m[ch]);
    }
  });
  // crisp dark rim on the bottom/right so the fruit pops off the leaves
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (rows[j][i] === '.' || rows[j][i] === undefined) continue;
      const below = j + 1 >= H || rows[j + 1][i] === '.' || rows[j + 1][i] === undefined;
      const right = i + 1 >= rows[j].length || rows[j][i + 1] === '.';
      if (below && j > 0) p.set(x + i, y + j + 1, d);
      else if (right && j > 0 && hash(i, j, 3) < 0.5) p.set(x + i + 1, y + j, mix(d, b, 0.3));
    }
  if (h !== undefined) p.set(x + (rows[0][0] === '.' ? 1 : 0), y + (rows[0][0] === '.' ? 1 : 0), h);
}
// Find up to n spots inside an opaque region (fully surrounded by pixels).
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
// Mushroom forest
// ===========================================================================
const SHROOM = {
  red: pals(['#3c0e22', '#5e1228', '#8a162a', '#b8202a', '#dc3430', '#f05a3a', '#ff8a5a', '#ffbe8a']),
  wart: pals(['#a88ea0', '#d2c2c4', '#efe6dc', '#fffaf0', '#ffffff']),
  stem: pals(['#5e4652', '#8a6e72', '#b49c94', '#d8c6b0', '#efe2c8', '#fff8e6']),
  brown: pals(['#2a1418', '#43201c', '#5f3020', '#7e4426', '#9c5a2e', '#b8743a', '#d29350', '#e8b670']),
  bstem: pals(['#56404a', '#7a6258', '#a08a72', '#c4ae8e', '#dccaa6', '#f0e2c0']),
  pores: pals(['#5a5226', '#8a7e30', '#b8a63e', '#d8c850', '#f0e070']),
  glow: pals(['#101438', '#141f52', '#173468', '#1a4e7e', '#1c6e90', '#2096a2', '#38bcb2', '#6edcc4', '#b6f4dc']),
  gstem: pals(['#1e2448', '#2a3864', '#3c5080', '#5a709e', '#8296bc', '#b8cce0']),
  glowLight: pals(['#40e0d8', '#8afff0', '#d8fffa', '#ffffff']),
  gill: pals(['#7a6a6e', '#a8989a', '#cfc2bc', '#ebe0d4']),
};

// Mushroom cap in 3/4 view: half-ellipsoid dome over a rim ellipse that bows
// towards the viewer, with a thin crescent of gills under the front rim.
// Returns { own, rimY } where own marks cap pixels (1) and gill pixels (2).
function shroomCap(p, cx, rimY, rx, h, lip, pal, o = {}) {
  const { seed = 1, tex = 0.1, flat = 0.75, gill = null, gillH = 2, droop = 0 } = o;
  const own = new Uint8Array(p.w * p.h);
  const N = pal.length;
  for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const u = (x + 0.5 - cx) / rx;
    if (Math.abs(u) >= 1) continue;
    const s = Math.sqrt(1 - u * u);
    const hh = h * Math.pow(s, flat);
    const yTop = rimY - hh;
    const yRim = rimY + lip * s + droop * u * u; // bottom edge of the cap
    for (let y = Math.floor(yTop); y <= Math.ceil(yRim); y++) {
      const yc = y + 0.5;
      if (yc < yTop || yc > yRim) continue;
      let nx, ny, nz;
      if (yc <= rimY) {
        const v = (rimY - yc) / Math.max(0.5, hh); // 0 rim .. 1 top
        nx = u * Math.sqrt(1 - v * v * 0.6);
        ny = -v * 0.95 * s;
        nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      } else {
        const w = (yc - rimY) / Math.max(0.5, yRim - rimY); // front rim band
        nx = u;
        ny = 0.25 + w * 0.5;
        nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      }
      let v = (nx * LX + ny * LY + nz * LZ) * 1.6 - (o.bias ?? 0.62);
      v += (hash(x, y, seed) - 0.5) * tex * 2;
      v -= 0.4 * smooth(0.55, 1, Math.abs(u)); // rolls away at the sides
      if (yRim - yc < 1.2) v -= 0.45; // underside lip
      else if (yRim - yc < 2.5) v -= 0.2;
      if (p.ok(x, y)) own[y * p.w + x] = 1;
      p.set(x, y, pick(pal, v));
    }
    // gill crescent under the front rim
    if (gill && Math.abs(u) < 0.9) {
      const gh = gillH * s;
      for (let y = Math.ceil(yRim); y < yRim + gh; y++) {
        const t = (y + 0.5 - yRim) / Math.max(1, gh);
        // gills radiate towards the stem: alternating light/dark lines
        const line = (Math.floor((x - cx) * (1 + t * 0.6) + 200) % 2) === 0;
        let v = 0.2 - t * 0.9 - Math.abs(u) * 0.3 + (line ? 0.25 : -0.15);
        if (p.ok(x, y)) own[y * p.w + x] = 2;
        p.set(x, y, pick(gill, v));
      }
    }
  }
  return { own };
}
// Wart patches / spots on a cap: foreshortened towards the rim.
function capSpots(p, own, cx, rimY, rx, h, n, R, pal, o = {}) {
  const out = [];
  for (let k = 0; k < n * 8 && out.length < n; k++) {
    const u = (R() * 2 - 1) * 0.86, v = 0.12 + R() * 0.8;
    const s = Math.sqrt(1 - u * u);
    const x = cx + u * rx, y = rimY - v * h * Math.pow(s, 0.75) + (o.down ?? 0);
    if (out.some(([a, b]) => Math.hypot(a - x, (b - y) * 1.4) < (o.gap ?? 4.5))) continue;
    out.push([x, y, u, v]);
  }
  for (const [x, y, u, v] of out) {
    const r = (o.r ?? 2.2) * (0.6 + R() * 0.7);
    const rx2 = Math.max(0.7, r * Math.sqrt(1 - u * u)), ry2 = Math.max(0.6, r * (0.45 + v * 0.45));
    for (let yy = Math.floor(y - ry2 - 1); yy <= y + ry2 + 1; yy++)
      for (let xx = Math.floor(x - rx2 - 1); xx <= x + rx2 + 1; xx++) {
        if (!p.ok(xx, yy) || own[yy * p.w + xx] !== 1) continue;
        const dx = (xx + 0.5 - x) / rx2, dy = (yy + 0.5 - y) / ry2;
        const d = dx * dx + dy * dy;
        if (d > 1) {
          // soft shadow on the bottom-right of each wart
          if (d < 1.9 && dx + dy > 0.6 && o.shadow !== false) p.set(xx, yy, mix(p.get(xx, yy), INK, 0.28));
          continue;
        }
        const I = 0.35 - u * 0.75 - (dx + dy) * 0.4 + v * 0.35;
        p.set(xx, yy, pick(pal, I));
      }
  }
  return out;
}
// Ring/skirt hanging from a stem (fly agaric annulus).
function stemSkirt(p, cx, y, w, len, pal, seed) {
  for (let x = Math.floor(cx - w / 2 - 1); x <= cx + w / 2 + 1; x++) {
    const u = (x + 0.5 - cx) / (w / 2 + 1);
    if (Math.abs(u) > 1) continue;
    const l = len * (0.7 + 0.3 * Math.sqrt(1 - u * u)) + (hash(x, 1, seed) < 0.4 ? 1 : 0);
    for (let k = 0; k < l; k++) {
      let v = 0.5 - u * 0.8 - (k / l) * 0.5 + ((x & 1) ? -0.15 : 0.1);
      if (k === 0) v -= 0.4;
      p.set(x, y + k, pick(pal, v));
    }
  }
}
// Ground skirt: moss, grass blades and pebbles hugging the base of a sprite.
function baseTuft(p, cx, w, seed, o = {}) {
  const R = mulberry(seed);
  const H = p.h;
  const moss = o.moss || MOSS;
  for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
    const u = (x + 0.5 - cx) / (w / 2);
    const hgt = Math.round((1 - u * u) * (o.h ?? 2.5) + R() * 1.5);
    for (let y = H - hgt; y < H; y++) if (R() < 0.85) p.set(x, y, moss[clamp(Math.round(3.6 - (y - (H - hgt)) * 0.9 - u * 1.4 + (R() - 0.5)), 0, moss.length - 1)]);
  }
  const g = o.grass || pals(['#1e3a24', '#2c5a2e', '#3e7a36', '#5c9a42', '#86ba58', '#b2d47a']);
  for (let i = 0; i < (o.blades ?? 8); i++) {
    const x = cx + (R() - 0.5) * w * 1.1;
    blade(p, x, H - 1, 2 + R() * (o.bladeH ?? 5), (R() - 0.5) * 3, (R() - 0.5) * 2, 1, g);
  }
}

// --- giant mushrooms ---------------------------------------------------------
function giantFlyAgaric(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2 + (o.shift ?? 0);
  const rx = W / 2 - 2, capH = o.capH ?? Math.round(H * 0.24), lip = o.lip ?? 4;
  const rimY = capH + 2;
  // stem: tapered, slightly curved, with a bulbous scaly volva at the foot
  const sw = o.stemW ?? Math.max(8, Math.round(W * 0.2));
  const curve = (R() - 0.5) * 3;
  trunk(p, { cx, yb: H - 1, yt: rimY, wb: sw + 2, wt: sw - 1, pal: SHROOM.stem, seed, flare: 0.5, curve,
    bark: (x, y, s) => (hash(x, y >> 2, seed) < 0.14 ? -0.25 : (s < 0.3 && hash(x, y, seed + 1) < 0.25 ? 0.25 : 0)), shadeTo: rimY + lip, shadeLen: 9 });
  // volva bulb
  const vb = H - 4;
  ellipse(p, cx + 0.3, vb, sw * 0.78, 4.2, (x, y, nx, ny) => {
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let v = (nx * LX + ny * LY + nz * LZ) * 1.3 - 0.2;
    if ((y + (x >> 1)) % 3 === 0 && ny < 0.6) v -= 0.35; // scaly rings
    if (y >= H - 1) v -= 0.6;
    return pick(SHROOM.stem, v);
  });
  // stem texture: fine vertical fibres + a few wisps of the veil
  for (let y = rimY + lip + 4; y < vb - 4; y++)
    for (let x = Math.floor(cx - sw / 2); x < cx + sw / 2; x++)
      if (p.on(x, y) && hash(x, y >> 1, seed + 5) < 0.06) p.tint(x, y, mix(p.get(x, y), SHROOM.stem[1], 0.5));
  // skirt (annulus) under the cap
  stemSkirt(p, cx + curve * 0.3, rimY + lip + Math.round((H - rimY) * 0.18), sw + 3, 4, SHROOM.wart, seed);
  // cap
  const { own } = shroomCap(p, cx, rimY, rx, capH, lip, SHROOM.red, { seed, tex: 0.08, flat: 0.65, gill: SHROOM.gill, gillH: 3 });
  // a glossy highlight band on the upper left
  for (let y = 0; y < rimY; y++)
    for (let x = 0; x < W; x++) {
      if (own[y * W + x] !== 1) continue;
      const u = (x + 0.5 - cx) / rx, v = (rimY - y - 0.5) / capH;
      const d = Math.hypot(u + 0.42, (v - 0.68) * 1.3);
      if (d < 0.2 && hash(x, y, seed + 9) < 0.8) p.set(x, y, SHROOM.red[7]);
      else if (d < 0.32) p.set(x, y, SHROOM.red[6]);
    }
  capSpots(p, own, cx, rimY, rx, capH, o.spots ?? 13, R, SHROOM.wart, { r: o.spotR ?? 2.6, gap: o.gap ?? 6 });
  baseTuft(p, cx, sw * 2.4, seed + 3, { h: 3, blades: 10 });
  outline(p, { noBottom: true });
  // dew drops and a tiny bug
  const dews = spotsIn(p, o.dew ?? 3, R, [cx - rx * 0.7, 3, cx + rx * 0.2, rimY - 2], 7, (x, y) => own[y * W + x] === 1);
  for (const [x, y] of dews) dew(p, x, y);
  if (o.snail) stamp(p, ['..e.e..', '...kk..', '.sSSk..', 'sShSsk.', 'sSSsS..', '.bbbbbb'], { e: '#3a2a2a', k: '#c8b49a', s: '#b0703a', S: '#e0a058', h: '#ffd890', b: '#d8c4a4' }, Math.round(cx + sw / 2 - 2), Math.round(H * 0.62));
  if (o.ladybug) stamp(p, ['.kk..', 'hrkrr', 'rkrkr', '.rrr.'], { r: '#ff3a2e', h: '#ffa090', k: '#1e1a20' }, Math.round(cx + rx * 0.35), Math.round(rimY - capH * 0.55));
  return p;
}

function giantBolete(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const rx = W / 2 - 2, capH = Math.round(H * 0.3), lip = 5;
  const rimY = capH + 2;
  // fat club stem, wider at the bottom, with a raised net (reticulation)
  const sw = Math.round(W * 0.34);
  for (let y = rimY; y < H; y++) {
    const t = (y - rimY) / (H - 1 - rimY);
    const w = lerp(sw * 0.82, sw * 1.15, Math.pow(t, 1.6)) - (t > 0.94 ? (t - 0.94) * 20 : 0);
    for (let x = Math.floor(cx - w / 2); x < Math.ceil(cx + w / 2); x++) {
      const s = (x + 0.5 - (cx - w / 2)) / w;
      let v = 0.6 - s * 1.35;
      // net pattern: diamond mesh, stronger in the upper stem
      const mx = (x - cx) * 0.9, my = y * 0.55;
      const net = ((Math.floor(mx + my) + Math.floor(mx - my)) & 1) === 0 && hash(x, y, seed) < 0.45;
      if (net && t < 0.55) v -= 0.22 * (1 - t / 0.55);
      if (y < rimY + lip + 6) v -= 0.65 * (1 - (y - rimY - lip) / 6);
      if (H - 1 - y < 2) v -= 0.4;
      p.set(x, y, pick(SHROOM.bstem, v));
    }
  }
  // a tiny round door with a step and a lantern: someone lives here
  const dx = Math.round(cx - 6), dy = H - 13;
  stamp(p, [
    '...oooo...',
    '.ooDddDoo.',
    '.oDdDdDdo.',
    'oDdDdDdDdo',
    'oDdDdDdDdo',
    'ohdDdDdDdo',
    'oDdDdDdkDo',
    'oDdDdDdDdo',
    'ohdDdDdDdo',
    'oDdDdDdDdo',
    'oDdDdDdDdo',
    'sSssSssSss',
  ], { o: '#4a2c22', D: '#7e4a2c', d: '#a8683a', h: '#2a2028', k: '#ffd860', s: '#a8a2ac', S: '#7a7480' }, dx, dy);
  // round window above it, warm light inside
  stamp(p, ['.oooo.', 'oYYoyo', 'oYYoyo', 'oooooo', 'oyyoyo', '.oooo.'], { o: '#4a2c22', Y: '#fff0a0', y: '#ffb84a' }, Math.round(cx + 4), H - 30);
  // lantern on a hook by the door
  stamp(p, ['k..', 'kk.', '.k.', 'kYk', 'kyk', '.k.'], { k: '#2a2028', Y: '#fff0a0', y: '#ffa83a' }, dx + 11, dy - 2);
  // cap: velvety brown, rounded bun shape
  const { own } = shroomCap(p, cx, rimY, rx, capH, lip, SHROOM.brown, { seed, tex: 0.07, flat: 0.55, gill: SHROOM.pores, gillH: 3.5 });
  // velvet: fine light flecks on the lit side, a few cracks
  for (let y = 0; y < rimY + lip; y++)
    for (let x = 0; x < W; x++) {
      if (own[y * W + x] !== 1) continue;
      const u = (x + 0.5 - cx) / rx;
      const h = hash(x, y, seed + 4);
      if (h < 0.04 && u < 0.3) p.set(x, y, mix(p.get(x, y), SHROOM.brown[7], 0.6));
      else if (h > 0.985) p.set(x, y, mix(p.get(x, y), SHROOM.brown[2], 0.5));
    }
  // fallen leaf & moss tuft on the cap
  stamp(p, ['.a.a.', 'aAbAa', '.bAb.', '..s..'], { a: '#e0782a', A: '#f8a040', b: '#b8561e', s: '#6a3a26' }, Math.round(cx + rx * 0.2), Math.round(rimY - capH * 0.86));
  stamp(p, ['.lL.', 'lgGg', 'gGGD'], { L: '#98bc58', l: '#74a044', g: '#56853a', G: '#3e6a30', D: '#2c5028' }, Math.round(cx - rx * 0.55), Math.round(rimY - capH * 0.62));
  baseTuft(p, cx, sw * 1.9, seed + 3, { h: 3, blades: 12 });
  // little mushrooms at the foot
  smallShroom(p, cx + sw * 0.75, H - 1, 6, 3.2, SHROOM.brown, SHROOM.bstem, seed + 7);
  smallShroom(p, cx + sw * 0.95, H - 1, 4, 2.2, SHROOM.brown, SHROOM.bstem, seed + 8);
  outline(p, { noBottom: true });
  for (const [x, y] of spotsIn(p, 3, R, [cx - rx * 0.8, 4, cx + rx * 0.3, rimY], 8, (x, y) => own[y * W + x] === 1)) dew(p, x, y);
  return p;
}

function giantGlowShroom(W, H, seed, lit, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const rx = W / 2 - 5, capH = Math.round(H * (o.capF ?? 0.28)), lip = 3;
  const rimY = capH + 4;
  // slender stem with a gentle S curve
  const sw = Math.max(5, Math.round(W * 0.15));
  const curve = (R() < 0.5 ? -1 : 1) * (2 + R() * 2);
  trunk(p, { cx, yb: H - 1, yt: rimY, wb: sw + 1, wt: sw - 1, pal: SHROOM.gstem, seed, flare: 1.4, curve,
    bark: (x, y) => (hash(x >> 1, y >> 2, seed) < 0.2 ? -0.25 : 0), shadeTo: rimY + lip, shadeLen: 6 });
  const stemX = (y) => cx + curve * Math.sin(((y - rimY) / (H - 1 - rimY)) * Math.PI);
  // bell-shaped translucent cap
  const { own } = shroomCap(p, cx, rimY, rx, capH, lip, SHROOM.glow, { seed, tex: 0.06, flat: 1.25, bias: 0.9, gill: SHROOM.glow.slice(2, 7), gillH: 3, droop: 2 });
  // radial ribs on the cap (striations)
  for (let y = 0; y < rimY + lip + 2; y++)
    for (let x = 0; x < W; x++) {
      if (own[y * W + x] !== 1) continue;
      const u = (x + 0.5 - cx) / rx;
      const ang = Math.atan2(rimY + capH * 0.6 - y, (x + 0.5 - cx) * 0.6);
      if (Math.floor(ang * 9 + 100) % 2 === 0 && (rimY - y) < capH * 0.7) p.set(x, y, mix(p.get(x, y), SHROOM.glow[2], 0.18 + Math.abs(u) * 0.15));
    }
  const L = SHROOM.glowLight;
  // glowing spots: bright cores with a cyan rim (emissive look: no shading)
  const spots = capSpots(p, own, cx, rimY, rx, capH, o.spots ?? 9, R, [L[0], L[0], L[1], L[1], L[2]], { r: 1.8, gap: 6, shadow: false });
  for (const [x, y] of spots) p.set(Math.floor(x), Math.floor(y), lit ? L[3] : L[2]);
  // glowing gill line along the rim
  for (let x = 0; x < W; x++)
    for (let y = rimY; y < H; y++)
      if (own[y * W + x] === 2) {
        if (hash(x, 3, seed) < (lit ? 0.75 : 0.5)) p.set(x, y, (x & 1) ? L[0] : L[1]);
        break;
      }
  // glowing ring on the stem and luminous speckles
  const ringY = rimY + lip + 6;
  stemSkirt(p, stemX(ringY), ringY, sw + 2, 2, [L[0], L[0], L[1], L[1], L[2]], seed);
  for (let y = ringY + 4; y < H - 4; y += 3) {
    const x = Math.round(stemX(y) - sw / 2 + 1 + hash(1, y, seed) * (sw - 2));
    if (hash(2, y, seed) < 0.5 && p.on(x, y)) p.set(x, y, L[0]);
  }
  baseTuft(p, cx, sw * 3, seed + 3, { h: 2.5, blades: 8, moss: pals(['#14243a', '#183a48', '#1e5450', '#2c6e5a', '#3e8a64', '#5aa870']) });
  // baby glow caps around the foot
  smallShroom(p, cx - sw * 1.3, H - 1, 5, 2.6, SHROOM.glow, SHROOM.gstem, seed + 7, L);
  smallShroom(p, cx + sw * 1.4, H - 1, 7, 3.2, SHROOM.glow, SHROOM.gstem, seed + 8, L);
  outline(p, { noBottom: true, k: 0.55 });
  // aura: light motes around the cap and the little ones
  const auraC = lit ? hx('#7ff6ec') : hx('#3cc0c8');
  aura(p, lit ? 6 : 5, auraC, lit ? 0.62 : 0.4, (x, y) => y < rimY + lip + 4 || y > H - 12);
  // floating spores
  const R2 = mulberry(seed + (lit ? 99 : 98));
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(2 + R2() * (W - 4)), y = Math.floor(2 + R2() * (H * 0.75));
    if (!p.any(x, y)) p.set(x, y, R2() < 0.5 ? L[1] : L[2], 230);
  }
  return p;
}

// Small mushroom (drawn into p with its stem foot at x, yb). glow: emissive pal.
function smallShroom(p, x, yb, h, r, capPal, stemPal, seed, glow = null, o = {}) {
  const sw = Math.max(1.5, r * 0.55);
  const lean = o.lean ?? (hash(seed, 1, 7) - 0.5) * 1.5;
  for (let y = Math.round(yb - h); y <= yb; y++) {
    const t = (yb - y) / h;
    const c = x + lean * t;
    for (let k = 0; k < sw; k++) p.set(Math.floor(c - sw / 2 + k + 0.5), y, pick(stemPal, 0.6 - (k / Math.max(1, sw - 1)) * 1.2 - (t > 0.85 ? 0.5 : 0)));
  }
  const cy = yb - h;
  const cxp = x + lean;
  for (let y = Math.floor(cy - r); y <= cy + 1; y++)
    for (let xx = Math.floor(cxp - r - 0.5); xx <= cxp + r + 0.5; xx++) {
      const nx = (xx + 0.5 - cxp) / (r + 0.4), ny = (y + 0.5 - cy) / (y + 0.5 < cy ? r * (o.tall ?? 0.85) : 1.4);
      if (nx * nx + ny * ny > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let v = (nx * LX + ny * LY + nz * LZ) * 1.4 - 0.25;
      if (ny > 0.3) v -= 0.4;
      p.set(xx, y, pick(capPal, v));
    }
  if (glow) {
    p.set(Math.round(cxp - r * 0.35), Math.round(cy - r * 0.45), glow[3]);
    if (r > 2.5) p.set(Math.round(cxp + r * 0.4), Math.round(cy - r * 0.2), glow[1]);
    for (let xx = Math.ceil(cxp - r + 0.5); xx < cxp + r - 0.5; xx++) if ((xx & 1) === 0) p.set(xx, Math.round(cy + 1), glow[0]);
  } else if (o.spots) {
    p.set(Math.round(cxp - r * 0.3), Math.round(cy - r * 0.5), o.spots);
    if (r > 2.5) p.set(Math.round(cxp + r * 0.45), Math.round(cy - r * 0.15), o.spots);
  } else p.set(Math.round(cxp - r * 0.4), Math.round(cy - r * 0.5), capPal[capPal.length - 1]);
}

const SHROOM_MIX = {
  tan: pals(['#3a2420', '#5a3a2a', '#82583a', '#a8784a', '#c89a62', '#e2bc80', '#f4dca4']),
  violet: pals(['#1e1430', '#32204a', '#4c3068', '#6a4488', '#8c5ca8', '#b080c8', '#d8acec']),
  orange: pals(['#3e1418', '#6a2420', '#9a3c22', '#c85a24', '#e8802c', '#f8a840', '#ffd070']),
  cream: pals(['#5a4a4e', '#7e6e6a', '#a89a8c', '#ccc0ac', '#e8dcc6', '#fbf4e2']),
};
// A clump of medium mushrooms on a mossy mound.
function shroomCluster(W, H, seed, kinds) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  // mound of moss and leaf litter
  ellipse(p, W / 2, H - 1.5, W / 2 - 2, 3, (x, y, nx, ny) => MOSS[clamp(Math.round(3.4 - ny * 2 - nx * 1.2 + (hash(x, y, seed) - 0.5) * 1.5), 0, 5)]);
  for (const k of kinds) {
    const [fx, h, r, cap, stem, spots] = k;
    smallShroom(p, W * fx, H - 2 - R() * 1.5, h, r, cap, stem, seed + (fx * 100) | 0, null, { spots });
  }
  for (let i = 0; i < 5; i++) blade(p, 2 + R() * (W - 4), H - 1, 2 + R() * 3, (R() - 0.5) * 3, 0, 1, pals(['#1e3a24', '#2c5a2e', '#3e7a36', '#5c9a42', '#86ba58']));
  outline(p, { noBottom: true });
  const dw = spotsIn(p, 1, R, [2, 1, W - 4, H - 6], 6);
  for (const [x, y] of dw) dew(p, x, y);
  return p;
}
function glowCap(W, H, seed, n, lit) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const L = SHROOM.glowLight;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : 0.25 + (i / (n - 1)) * 0.5;
    smallShroom(p, W * f + (R() - 0.5), H - 1, 2 + R() * 3 + (i === 1 ? 2 : 0), 1.6 + R() * 1.2 + (i === 1 ? 0.6 : 0), SHROOM.glow, SHROOM.gstem, seed + i * 13, L);
  }
  for (let x = 2; x < W - 2; x++) if (R() < 0.6) p.set(x, H - 1, MOSS[2 + (R() < 0.5 ? 1 : 0)]);
  outline(p, { noBottom: true, k: 0.5 });
  aura(p, lit ? 4 : 3, lit ? hx('#7ff6ec') : hx('#3cc0c8'), lit ? 0.75 : 0.5, (x, y) => y < H - 1);
  return p;
}

// Mossy log with bracket fungi and a row of little caps.
function mushLog(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const log = logSprite(W, H - 6, seed, { moss: true });
  p.blit(log, 0, 6);
  const top = 7, bot = H - 1;
  // thick moss blanket on top with a few fern fronds
  for (let x = 6; x < W - 3; x++) {
    const d = 1 + Math.floor(hash(x >> 1, 2, seed) * 3);
    for (let y = top - 1; y < top - 1 + d; y++) if (p.any(x, y + 1) || y >= top) p.set(x, y, MOSS[clamp(5 - (y - top + 1) - (hash(x, y, seed) < 0.3 ? 1 : 0), 1, 5)]);
  }
  // bracket fungi on the side (stacked shelves)
  const shelf = pals(['#5a2e1a', '#8a4a22', '#b8702e', '#dc9a48', '#f4c878', '#fff0c0']);
  for (const [sx, sy, w] of [[W * 0.42, top + 5, 6], [W * 0.46, top + 8, 5], [W * 0.78, top + 4, 5]]) {
    for (let k = 0; k < w; k++) {
      const u = k / (w - 1);
      p.set(Math.round(sx + k), Math.round(sy), shelf[4 - (u > 0.7 ? 1 : 0)]);
      p.set(Math.round(sx + k), Math.round(sy + 1), shelf[u < 0.2 ? 3 : 2]);
      if (k > 0 && k < w - 1) p.set(Math.round(sx + k), Math.round(sy + 2), shelf[1]);
    }
    p.set(Math.round(sx + 1), Math.round(sy), shelf[5]);
  }
  // caps sprouting from the top
  smallShroom(p, W * 0.3, top, 5, 2.8, SHROOM_MIX.orange, SHROOM.stem, seed + 1);
  smallShroom(p, W * 0.36, top + 1, 3, 2, SHROOM_MIX.orange, SHROOM.stem, seed + 2);
  smallShroom(p, W * 0.62, top, 4, 2.4, SHROOM.red, SHROOM.stem, seed + 3, null, { spots: hx('#fff6e8') });
  smallShroom(p, W * 0.7, top + 1, 2.5, 1.7, SHROOM_MIX.tan, SHROOM.stem, seed + 4);
  // fern sprig at the right end
  for (let i = 0; i < 3; i++) blade(p, W - 6 + i, top + 1, 4 + i, 2 - i * 0.5, 2, 1, pals(['#1c3e26', '#2c5a30', '#44803a', '#6fa84a', '#a6d072']));
  outline(p, { noBottom: true });
  for (const [x, y] of spotsIn(p, 2, R, [8, 4, W - 6, top + 3], 8)) dew(p, x, y);
  // a tiny beetle crawling on the bark
  stamp(p, ['.kk.', 'kgGk', 'kGgk'], { k: '#141018', g: '#4ad08a', G: '#2a8a6a' }, Math.round(W * 0.55), bot - 4);
  return p;
}
// Spore puff: a small burst that expands and fades (3 frames).
function sporeFrames() {
  const W = 11, H = 11;
  const pal = pals(['#c8b878', '#e8dca0', '#fff6c8', '#ffffff']);
  const sets = [
    [[5, 6, 2], [4, 5, 1], [6, 5, 2], [5, 4, 3]],
    [[3, 4, 2], [7, 3, 1], [5, 6, 2], [2, 7, 1], [8, 6, 2], [5, 2, 3], [6, 8, 1]],
    [[1, 3, 1], [9, 2, 0], [5, 1, 2], [2, 8, 0], [9, 8, 1], [6, 5, 0], [3, 5, 1], [7, 9, 0]],
  ];
  return sets.map((pts, f) => {
    const p = new Px(W, H);
    for (const [x, y, c] of pts) {
      p.set(x, y, pal[c], f === 2 ? 170 : 235);
      if (f === 1 && c >= 2) {
        p.set(x + 1, y, pal[c - 1], 200);
        p.set(x, y + 1, pal[c - 2], 200);
      }
    }
    if (f === 0) {
      p.set(5, 5, pal[3]);
      p.set(4, 6, pal[2]);
      p.set(6, 6, pal[1]);
    }
    return p;
  });
}

// ===========================================================================
// Swamp
// ===========================================================================
const SWAMP = {
  cypress: pals(['#142420', '#1c3424', '#26462a', '#34582e', '#466a32', '#5c7e38', '#78963e', '#9aae4c', '#c0c86a']),
  cypressRust: pals(['#2a1418', '#46201c', '#6a3220', '#8e4822', '#b06428', '#c8823a', '#dca252', '#ecc678']),
  tamarack: pals(['#2a2414', '#3e3418', '#58481c', '#74601e', '#927a22', '#b09628', '#ccb236', '#e2ca52', '#f4e282']),
  barkCyp: pals(['#2a1c22', '#40282a', '#5a3a32', '#76503e', '#92684c', '#ac845e']),
  barkDead: pals(['#1e1a22', '#2e282e', '#433a3e', '#5a4e50', '#726462', '#8c7c76']),
  moss: pals(['#3e4a3e', '#5a6a54', '#7a8a6c', '#9cac88', '#c0cca8']),
  sedge: pals(['#1e2a1a', '#2e3e20', '#445626', '#5e6e2e', '#7c8838', '#a0a44c', '#c6c26e']),
  sedgeDry: pals(['#3a2a1a', '#5a4024', '#7a5a30', '#9c7a40', '#bc9a58', '#dcc080']),
  murk: pals(['#1e2a20', '#2c3c26', '#3e4e2a', '#56622e', '#6e7634', '#8a8c40', '#a8a654']),
  algae: pals(['#24461e', '#346424', '#4c8228', '#6aa02c', '#8cbc38', '#b4d64e', '#dcf07c']),
};

// Bald cypress: fluted buttress, knees, flat feathery crown with hanging moss.
function baldCypress(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const crownBot = Math.round(H * 0.5);
  // trunk with a wide fluted buttress
  const yt = 10;
  for (let y = yt; y < H; y++) {
    const t = (y - yt) / (H - 1 - yt);
    const c = cx + Math.sin(t * 2.2) * 1.2;
    let w = lerp(2.4, 6, t) + Math.pow(smooth(0.62, 1, t), 1.6) * 15;
    const x0 = c - w / 2, x1 = c + w / 2;
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const s = (x + 0.5 - x0) / (x1 - x0);
      let v = 0.55 - s * 1.3;
      // flutes: vertical ridges that fan out into the buttress
      const fl = Math.sin((x + 0.5 - c) / Math.max(1, w) * Math.PI * (2 + t * 3)) * (t > 0.6 ? 0.35 : 0.12);
      v += fl;
      if (hash(x, y >> 2, seed) < 0.18) v -= 0.3;
      if (y < crownBot + 4) v -= 0.5 * (1 - clamp((y - crownBot + 4) / 8, 0, 1));
      if (H - 1 - y < 2) v -= 0.4;
      p.set(x, y, pick(SWAMP.barkCyp, v));
    }
  }
  // cypress knees poking out of the mud
  for (const [kx, kh] of [[-14, 5], [-10, 3], [13, 6], [17, 3]]) {
    for (let k = 0; k < kh; k++) {
      const w = Math.max(1, Math.round((1 - k / kh) * 3));
      for (let i = 0; i < w; i++) p.set(Math.round(cx + kx - w / 2 + i), H - 1 - k, pick(SWAMP.barkCyp, 0.5 - i * 0.6 - (k === 0 ? 0.3 : 0)));
    }
  }
  // limbs
  const limbs = [[-1, 0.42, 16, -4], [1, 0.36, 15, -6], [-1, 0.24, 11, -5], [1, 0.18, 9, -4]];
  for (const [dir, f, len, rise] of limbs) {
    const y = Math.round(H * f);
    limb(p, [[cx, y + 2], [cx + dir * len * 0.5, y + rise * 0.3], [cx + dir * len, y + rise]], 2.2, 1, SWAMP.barkCyp.slice(0, 5), seed + y);
  }
  // crown: flat shelves of feathery foliage
  const cls = [];
  const shelves = [[8, 10, 4], [18, 17, 5], [29, 22, 5.5], [40, 20, 5.5], [crownBot - 3, 14, 4.5]];
  shelves.forEach(([y, reach, th], i) => {
    const n = Math.max(2, Math.round(reach / 4.5));
    for (let k = -n; k <= n; k++) {
      const f = k / n;
      const r = th * (0.85 + 0.35 * (1 - Math.abs(f))) * (0.85 + R() * 0.3);
      cls.push({ x: cx + f * reach + (R() - 0.5) * 2, y: y + Math.abs(f) * 2 + (R() - 0.5) * 2, r: r * 1.25, ry: r * 0.72, pal: R() < 0.16 ? SWAMP.cypressRust : undefined });
    }
  });
  canopy(p, cls, { pal: SWAMP.cypress, seed: seed + 9, tex: 'needle', leaf: 3, loose: 0.6, jag: 0.4, bump: 2.2, bias: 0.48, local: 0.78,
    env: { x: cx, y: (6 + crownBot) / 2, rx: W / 2 - 2, ry: (crownBot - 4) / 2 } });
  outline(p, { noBottom: true });
  // Spanish moss strands hanging from the crown
  const M = SWAMP.moss;
  for (let i = 0; i < 16; i++) {
    const x = Math.round(cx + (R() - 0.5) * (W - 10));
    let y = -1;
    for (let yy = H - 1; yy > 0; yy--) if (p.on(x, yy) && yy < crownBot + 6) { y = yy; break; }
    if (y < 0 || y < 8) continue;
    const len = 4 + Math.floor(R() * 9);
    for (let k = 1; k <= len; k++) {
      const xx = x + Math.round(Math.sin(k * 0.7 + i) * 0.6);
      if (p.on(xx, y + k) && k > 2) break;
      p.set(xx, y + k, M[clamp(Math.round(3.5 - (k / len) * 2.5 + (xx < cx ? 0.5 : -0.5)), 0, 4)]);
    }
  }
  return p;
}

// Tamarack (larch) in autumn gold, standing on stilted bog roots.
function tamarack(W, H, seed) {
  const p = new Px(W, H);
  const roots = new Px(W, H);
  const cx = W / 2;
  for (const [dx, len, up] of [[-1, 12, 6], [1, 11, 5], [-1, 7, 3], [1, 6, 3], [0.2, 4, 2]]) {
    limb(roots, [[cx + dx * 1.5, H - 1 - up], [cx + dx * len * 0.5, H - 1 - up * 0.6], [cx + dx * len, H - 1]], 2.6, 1.2, SWAMP.barkCyp.slice(0, 5), seed + len);
  }
  for (let x = 0; x < W; x++) if (roots.on(x, H - 1)) roots.set(x, H - 1, mix(roots.get(x, H - 1), INK, 0.3));
  outline(roots, { noBottom: true });
  const tree = coniferTree(W, H - 4, seed, { pal: SWAMP.tamarack, bark: SWAMP.barkCyp, tiers: 9, trunkH: 6, lobeW: 4.5 });
  p.blit(roots, 0, 0);
  p.blit(tree, 0, 0);
  // a few bare twigs and golden needles drifting down
  const R = mulberry(seed + 5);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(2 + R() * (W - 4)), y = Math.floor(H * 0.3 + R() * H * 0.5);
    if (!p.any(x, y)) p.set(x, y, SWAMP.tamarack[7]);
  }
  return p;
}

// Dead swamp tree: crooked recursive branches, hollow, fungus, hanging moss.
function deadTree(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const pal = SWAMP.barkDead;
  const top = Math.round(H * (o.fork ?? 0.45));
  trunk(p, { cx, yb: H - 1, yt: top, wb: o.wb ?? 6, wt: 3.5, pal, seed, flare: 2, curve: (R() - 0.5) * 4,
    bark: (x, y) => (hash(x, y >> 1, seed) < 0.22 ? -0.45 : hash(x >> 1, y >> 3, seed + 1) > 0.85 ? 0.35 : 0) });
  const branch = (x, y, ang, len, w, depth) => {
    const mx = x + Math.cos(ang) * len * 0.5 + (R() - 0.5) * len * 0.3, my = y + Math.sin(ang) * len * 0.5 + (R() - 0.5) * len * 0.2;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    limb(p, [[x, y], [mx, my], [ex, ey]], w, Math.max(1, w * 0.6), pal.slice(0, 5), seed + depth * 31 + Math.round(x));
    if (depth <= 0 || len < 4) return;
    const k = R() < 0.3 ? 1 : 2;
    for (let i = 0; i < k; i++) branch(ex, ey, ang + (i === 0 ? -1 : 1) * (0.35 + R() * 0.5), len * (0.58 + R() * 0.15), Math.max(1, w * 0.6), depth - 1);
  };
  const L = H * (o.reach ?? 0.24);
  branch(cx, top + 2, -Math.PI / 2 - 0.55, L, 3, 3);
  branch(cx, top + 1, -Math.PI / 2 + 0.5, L * 0.9, 3, 3);
  branch(cx, top + 8, -Math.PI / 2 + 1.2, L * 0.55, 2, 2);
  // hollow
  const hy = Math.round(H * 0.7);
  stamp(p, ['.kk.', 'kKKk', 'kKKk', 'kKKk', '.kk.'], { k: '#2a2226', K: '#120e14' }, Math.round(cx - 2), hy);
  // shelf fungus
  const fung = pals(['#4a3a2a', '#7a6040', '#a88a5a', '#d4ba84']);
  for (const [fy, dir] of [[Math.round(H * 0.58), 1], [Math.round(H * 0.62), 1]]) {
    const fx = Math.round(cx + dir * 2.5);
    for (let k = 0; k < 4; k++) p.set(fx + k, fy, fung[k === 0 ? 2 : 3]);
    for (let k = 0; k < 3; k++) p.set(fx + k, fy + 1, fung[1]);
  }
  baseTuft(p, cx, 14, seed + 3, { h: 2, blades: 6, grass: SWAMP.sedge });
  outline(p, { noBottom: true });
  // wisps of moss hanging from branch ends
  const M = SWAMP.moss;
  for (let i = 0; i < (o.moss ?? 8); i++) {
    const x = Math.floor(2 + R() * (W - 4));
    let y = -1;
    for (let yy = 0; yy < top; yy++) if (p.on(x, yy)) { y = yy; }
    if (y < 0) continue;
    const len = 3 + Math.floor(R() * 6);
    for (let k = 1; k <= len; k++) if (!p.any(x, y + k)) p.set(x + (k > 3 && i % 2 ? 1 : 0), y + k, M[clamp(3 - Math.round((k / len) * 2.5), 0, 4)]);
  }
  return p;
}

// Sedge / swamp grass tuft.
function sedgeTuft(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const x = W / 2 + (f - 0.5) * W * 0.3 + (R() - 0.5) * 1.5;
    const len = (H - 2) * (0.5 + R() * 0.5) * (1 - Math.abs(f - 0.5) * 0.8);
    const lean = (f - 0.5) * W * 0.75 + (R() - 0.5) * 2;
    const curl = (f - 0.5) * (3 + R() * 4);
    blade(p, x, H - 1, len, lean, curl, Math.abs(f - 0.5) < 0.2 ? 2 : 1, R() < (o.dryP ?? 0.25) ? SWAMP.sedgeDry : SWAMP.sedge, { dry: 0.6, seed: seed + i });
  }
  if (o.seeds) for (let i = 0; i < o.seeds; i++) {
    const x = Math.round(W / 2 + (R() - 0.5) * W * 0.4), len = H - 3 - R() * 3;
    const [tx, ty] = blade(p, x, H - 1, len, (R() - 0.5) * 4, 0, 1, SWAMP.sedgeDry);
    stamp(p, ['.h.', 'hHb', 'hbB', '.b.'], { h: '#c8a870', H: '#e8d098', b: '#8a6a40', B: '#5a4428' }, Math.round(tx) - 1, Math.round(ty) - 2);
  }
  for (let x = 0; x < W; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.3));
  outline(p, { noBottom: true, k: 0.55, lit: 0.45 });
  return p;
}

// Murky bog lily pad (flat, seen from above): notch, veins, decaying edge.
function bogPad(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2, cy = H / 2, rx = W / 2 - 1.5, ry = H / 2 - 1.2;
  const notch = R() * Math.PI * 2;
  ellipse(p, cx, cy, rx, ry, (x, y, nx, ny) => {
    const a = Math.atan2(ny, nx);
    const da = Math.abs(((a - notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const d = Math.hypot(nx, ny);
    if (da < 0.28 && d > 0.15) return null; // V notch
    // veins radiate from the centre
    const vein = Math.abs(Math.sin(a * 6 + seed)) < 0.13 && d > 0.2 && d < 0.85;
    let v = 0.2 - nx * 0.35 - ny * 0.45 + (hash(x, y, seed) - 0.5) * 0.35 + (vein ? 0.4 : 0);
    if (d > 0.82) v -= 0.4 + (hash(x, y, seed + 1) < 0.3 ? 0.4 : 0); // curled brown rim
    if (o.brown && hash(x >> 1, y, seed + 2) < 0.12) v -= 0.6;
    return pick(o.pal || SWAMP.murk, v);
  });
  outline(p, { k: 0.45, lit: 0.4 });
  if (o.drop) dew(p, Math.round(cx - rx * 0.3), Math.round(cy - 1));
  if (o.bug) stamp(p, ['k.k', '.K.', 'k.k'], { k: '#2a2228', K: '#5a8ad0' }, Math.round(cx + rx * 0.25), Math.round(cy));
  return p;
}
// Algae / pond scum: a loose flat mat with brighter filaments.
function algaeMat(W, H, seed, n = 5) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const blobs = [];
  for (let i = 0; i < n; i++) blobs.push([2 + R() * (W - 4), 2 + R() * (H - 4), 2 + R() * W * 0.18, 1.5 + R() * H * 0.22]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let f = 0;
      for (const [bx, by, brx, bry] of blobs) f = Math.max(f, 1 - Math.hypot((x + 0.5 - bx) / brx, (y + 0.5 - by) / bry));
      f += (hash(x, y, seed) - 0.5) * 0.35;
      if (f <= 0.05) continue;
      if (f < 0.25 && hash(x, y, seed + 1) < 0.5) continue; // lacy edge
      const fil = Math.sin((x + y * 1.7) * 0.9 + hash(x >> 2, y >> 1, seed) * 6) > 0.75;
      p.set(x, y, pick(SWAMP.algae, f * 1.4 - 0.6 + (fil ? 0.5 : 0) - (y / H) * 0.3));
    }
  outline(p, { k: 0.35, lit: 0.3 });
  // a couple of tiny bubbles trapped in the mat
  for (const [x, y] of spotsIn(p, 2, R, [2, 1, W - 4, H - 4], 5)) p.set(x, y, hx('#e8fff0'));
  return p;
}

// Pitcher plant: tubular pitchers with red veins and hooded mouths, and a
// nodding flower on a tall stalk.
const PITCHER = pals(['#2a1a24', '#4a2430', '#7a2c34', '#a8403a', '#c8643e', '#8ca040', '#b4c456', '#dce07a']);
function pitcherPlant(W, H, seed) {
  const p = new Px(W, H);
  // purple pitcher plant (Sarracenia purpurea): fat curved horns in a rosette
  const tubes = [[0.3, 10, 3.6, -3.5], [0.5, 13, 3.8, -0.5], [0.68, 11, 3.6, 2.5], [0.2, 6, 3, -4], [0.8, 6, 3, 4]];
  const green = pals(['#1e2e1a', '#2e4a22', '#46682a', '#64883a', '#8caa4c', '#b8cc6a']);
  const red = pals(['#2a0e1a', '#4a1424', '#701e2c', '#962a32', '#bc443a', '#de6a4a', '#f4a080']);
  const throat = hx('#24081a');
  // flower: tall stalk with a nodding maroon bloom
  const fx = Math.round(W * 0.5) + 1;
  for (let y = 4; y < H - 1; y++) p.set(fx + (y < 8 ? 1 : 0), y, hx(y < 10 ? '#6a4a2a' : '#4a5a28'));
  stamp(p, ['..rr..', '.rRRr.', 'rRmmRr', 'rmMMmr', '.yYYy.', '..y.y.'], { r: '#6a1428', R: '#a82a3a', m: '#c84448', M: '#e87a6a', y: '#9a8a3a', Y: '#d0c060' }, fx - 2, 0);
  const order = [3, 4, 0, 2, 1];
  for (const i of order) {
    const [f, h, wt, lean] = tubes[i];
    const bx = W * f;
    let mx = 0, my = 0;
    for (let k = 0; k < h; k++) {
      const t = k / (h - 1);
      const x = bx + lean * t * t;
      const w = lerp(1.6, wt, Math.pow(t, 0.9));
      const n = Math.max(1, Math.round(w));
      for (let i2 = 0; i2 < n; i2++) {
        const X = Math.round(x - n / 2 + i2), Y = H - 1 - k;
        const s = n > 1 ? i2 / (n - 1) : 0.4;
        const v = 0.45 - s * 1.0 + t * 0.25;
        const vein = t > 0.3 && (X * 2 + Y) % 3 === 0;
        p.set(X, Y, vein ? pick(red, v - 0.1) : t > 0.75 ? mix(pick(green, v), pick(red, v), 0.45) : pick(green, v));
      }
      mx = x; my = H - 1 - k;
    }
    // lip (front rim), open throat, wavy hood rising behind
    const n = Math.round(wt);
    const x0 = Math.round(mx - n / 2);
    for (let i2 = 0; i2 < n; i2++) {
      p.set(x0 + i2, my, pick(red, 0.75 - i2 * 0.35));
      p.set(x0 + i2, my - 1, i2 === 0 ? red[4] : i2 === n - 1 ? red[2] : throat);
    }
    const dir = lean < 0 ? -1 : 1;
    for (let i2 = 0; i2 < n; i2++) p.set(x0 + i2 + (dir > 0 ? 1 : 0), my - 2, pick(red, 0.55 - i2 * 0.3));
    for (let i2 = 1; i2 < n - 1; i2++) p.set(x0 + i2 + (dir > 0 ? 1 : 0), my - 3, red[(i2 & 1) ? 5 : 4]);
  }
  baseTuft(p, W / 2, W * 0.8, seed + 3, { h: 2, blades: 4, moss: pals(['#2e2a1a', '#4a3e22', '#6a5a2c', '#5a7a32', '#7a9a3e', '#a0ba58']) });
  outline(p, { noBottom: true });
  // a fly peeking over one rim
  stamp(p, ['v.', 'kk'], { v: ['#d8f0ff', 210], k: '#1e1a20' }, Math.round(W * 0.68 + 2.5), H - 1 - 11 - 4);
  return p;
}

function swampReeds(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const pal = pals(['#22301e', '#34462a', '#4c5e30', '#687636', '#88903e', '#a8a854', '#ccc478']);
  const n = o.n ?? 5;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const x = W / 2 + (f - 0.5) * W * 0.62;
    const len = (H - 4) * (0.55 + R() * 0.45);
    const broken = R() < 0.25;
    const [tx, ty] = blade(p, x, H - 1, broken ? len * 0.6 : len, (f - 0.5) * 4 + (R() - 0.5) * 2, 0, i % 2 ? 1 : 2, R() < 0.3 ? SWAMP.sedgeDry : pal, { taper: 0.6 });
    if (broken) blade(p, tx, ty, len * 0.35, (f < 0.5 ? -1 : 1) * len * 0.3, 2, 1, SWAMP.sedgeDry);
    else if (R() < 0.55) stamp(p, ['.H.', 'hHb', 'hHb', 'hbB', 'hbB', '.B.'], { h: '#a8743e', H: '#d09a5a', b: '#7a4a2a', B: '#4e2e1e' }, Math.round(tx) - 1, Math.round(ty) - 2);
  }
  // long arching leaves
  for (let i = 0; i < 3; i++) blade(p, W / 2 + (i - 1) * 3, H - 1, H * 0.3 + R() * 5, (i - 1 || 1) * (3 + R() * 3), (i - 1 || 1) * 4, 1, pal);
  for (let x = 0; x < W; x++) if (p.on(x, H - 1)) p.set(x, H - 1, mix(p.get(x, H - 1), INK, 0.3));
  outline(p, { noBottom: true, k: 0.55, lit: 0.45 });
  // a dragonfly resting on a reed tip
  if (o.dragonfly) stamp(p, ['v.v', 'bBt', 'v.v'], { v: ['#e8f6ff', 200], b: '#e85a3a', B: '#b8362a', t: '#ff8a5a' }, W - 6, Math.round(H * 0.35));
  return p;
}

// Swamp bubbles rising and popping (3 frames).
function swampBubbles() {
  const W = 12, H = 9;
  const C = { o: '#56704a', w: '#e8f4d8', l: '#a8c49a', m: '#7a9a6a', d: '#3a5038' };
  const F = [
    ['............', '............', '............', '.....ol.....', '....owlm....', '....olmm....', '.....mm.....', '..o.........', '............'],
    ['............', '.....oo.....', '....owll....', '...owlllm...', '...olllmm...', '...olmmmd...', '....mmdd..o.', '.....dd..olm', '.........mm.'],
    ['............', '...w....w...', '.w..........', '....mmmm....', '..m......m..', '..m......m..', '....mmmm....', '.w........w.', '.......w....'],
  ];
  return F.map((rows) => {
    const p = new Px(W, H);
    stamp(p, rows, C, 0, 0);
    return p;
  });
}

function frogLog(seed, frame) {
  const W = 36, H = 20;
  const p = new Px(W, H);
  const log = logSprite(W, 11, seed, { moss: true });
  p.blit(log, 0, H - 11);
  const frog = art(FROG[frame === 0 ? 'idle0' : 'croak1'], FROG_PAL, { auto: 0.8, noShade: 'eEkn', k: 0.62 });
  place(p, frog, W * 0.58, H - 9);
  // lily flower tucked by the log end
  for (const [x, y] of [[W - 4, H - 2]]) {
    p.set(x, y, hx('#f08ab8')); p.set(x + 1, y, hx('#ffc4dc')); p.set(x, y - 1, hx('#fff4fa'));
  }
  return p;
}

// ===========================================================================
// Water & land details
// ===========================================================================
const WATER = {
  deep: pals(['#14243a', '#1c3450', '#244a68', '#2e6280', '#3c7c98', '#5a9cb4', '#88c0d4', '#bfe2ee', '#f2fcff']),
  mud: pals(['#2a1e1e', '#3e2c26', '#56402e', '#6e543a', '#8a6c4a']),
  foam: pals(['#6aa6c4', '#9ccbe0', '#c8e6f2', '#eaf8fd', '#ffffff']),
  river: pals(['#3a3a4a', '#4e5262', '#646c7a', '#7c8692', '#96a0a8', '#b2bac0', '#ccd2d4', '#e6eae8']),
};

// Puddle: muddy rim, dark water, a slice of bright sky reflected on top.
function puddle(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2, cy = H / 2, rx = W / 2 - 1, ry = H / 2 - 0.8;
  const ph = R() * 6;
  const inside = (nx, ny, k) => Math.hypot(nx, ny) < k + 0.08 * Math.sin(Math.atan2(ny, nx) * 3 + ph) + 0.05 * Math.sin(Math.atan2(ny, nx) * 5 + ph * 2);
  ellipse(p, cx, cy, rx, ry, (x, y, nx, ny) => {
    if (!inside(nx, ny, 1)) return null;
    if (!inside(nx, ny, 0.8)) return pick(WATER.mud, 0.2 - ny * 0.6 - nx * 0.2 + (hash(x, y, seed) - 0.5) * 0.5);
    // water: darker at the bottom edge (shadow of the bank), sky band across the top
    let v = -0.1 + ny * 0.5 - nx * 0.15;
    if (ny < -0.15 && ny > -0.55) v += 0.6;
    if (ny > 0.5) v -= 0.5;
    return pick(WATER.deep, v);
  });
  // sky reflection: bright dashes + a cloud glint
  for (let i = 0; i < (o.glints ?? 3); i++) {
    const y = Math.round(cy - ry * 0.3 + (R() - 0.5) * 2), x = Math.round(cx - rx * 0.4 + R() * rx * 0.6);
    for (let k = 0; k < 2 + Math.floor(R() * 3); k++) if (p.on(x + k, y)) p.set(x + k, y, k === 0 ? WATER.deep[8] : WATER.deep[7]);
  }
  p.set(Math.round(cx - rx * 0.45), Math.round(cy - ry * 0.35), 0xffffff);
  if (o.leaf) stamp(p, ['.a.', 'aAb', '.b.'], { a: '#e0782a', A: '#f8a040', b: '#b8561e' }, Math.round(cx + rx * 0.2), Math.round(cy));
  outline(p, { k: 0.4, lit: 0.35 });
  return p;
}
// Expanding ripple ring (4 frames, same size so the centre stays put).
function rippleFrames() {
  const W = 28, H = 14;
  return [0, 1, 2, 3].map((f) => {
    const p = new Px(W, H);
    const r = 3 + f * 3.4, ry = r * 0.45;
    const cx = W / 2, cy = H / 2;
    const steps = Math.round(r * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      if (f >= 2 && hash(i, f, 5) < f * 0.18) continue; // breaks up as it fades
      const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cy + Math.sin(a) * ry);
      const top = Math.sin(a) < 0;
      p.set(x, y, top ? WATER.foam[f < 2 ? 4 : 3] : WATER.foam[f < 2 ? 2 : 1], f === 3 ? 170 : 230);
    }
    if (f === 0) { p.set(cx, cy, 0xffffff); p.set(cx - 1, cy, WATER.foam[3]); }
    return p;
  });
}
// River rapids: churning white water and streaks flowing to the right. Frames
// loop: the streak pattern is periodic in x and scrolls 1/3 of a period.
function rapidsFrames(W, H, seed) {
  const R = mulberry(seed);
  const caps = [];
  for (let i = 0; i < Math.round(W / 4.5); i++) caps.push([W * 0.08 + R() * W * 0.84, H * 0.28 + R() * H * 0.44, 3.4 + R() * 3.8, R() * 6]);
  // streaks: [lane y, start x, length]
  const streaks = [];
  for (let i = 0; i < Math.round(W / 4); i++) streaks.push([Math.floor(1 + R() * (H - 2)), R() * W, 2 + Math.floor(R() * 5)]);
  return [0, 1, 2].map((f) => {
    const p = new Px(W, H);
    const cx = W / 2, cy = H / 2;
    const shift = (f * W) / 3;
    const env = (x, y) => 1 - (((x + 0.5 - cx) / (W / 2)) ** 2 * 0.85 + ((y + 0.5 - cy) / (H / 2)) ** 2);
    // streaks scroll downstream and loop (period W)
    for (const [y, sx, len] of streaks) {
      for (let k = 0; k < len; k++) {
        const x = Math.floor((((sx + shift + k) % W) + W) % W);
        const e = env(x, y);
        if (e < 0.12) continue;
        p.set(x, y, pick(WATER.foam, (k === 0 ? 0.7 : 0.1) + e * 0.3), 225);
      }
    }
    // foam caps churn in place: bubbly clumps with a blue-shaded underside
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const e = env(x, y);
        if (e <= 0.1) continue;
        let foam = 0, ny = 0;
        for (const [bx, by, br, ph] of caps) {
          const r = br * (0.75 + 0.3 * Math.sin(ph + f * 2.1));
          const d = 1 - Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 1.5) / r;
          if (d > foam) { foam = d; ny = (y + 0.5 - by) / r; }
        }
        foam = foam * Math.min(1, e * 2.2) + (hash(x + f * 5, y, seed) - 0.5) * 0.3;
        if (foam < 0.08) continue;
        p.set(x, y, pick(WATER.foam, foam * 1.2 + 0.2 - ny * 0.9), 245);
      }
    // spray droplets
    const R2 = mulberry(seed + f * 17);
    for (let i = 0; i < Math.round(W / 8); i++) {
      const x = Math.floor(R2() * W), y = Math.floor(R2() * H);
      if (env(x, y) > 0.2 && !p.any(x, y)) p.set(x, y, 0xffffff, 230);
    }
    return p;
  });
}
// Flat stepping stone: lit top face, darker front edge, wet waterline.
function steppingStone(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2, cy = H / 2 - 1, rx = W / 2 - 1.5, ry = H / 2 - 2;
  const ph = [R() * 6, R() * 6];
  const shape = (x, y, k = 1) => {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    const a = Math.atan2(ny, nx);
    return Math.pow(Math.abs(nx), 2.4) + Math.pow(Math.abs(ny), 2.4) < Math.pow(k * (1 + 0.08 * Math.sin(a * 3 + ph[0]) + 0.05 * Math.sin(a * 5 + ph[1])), 2.4);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const top = shape(x, y);
      const side = !top && shape(x, y - 2);
      if (!top && !side) continue;
      if (side) {
        const wet = !shape(x, y - 1);
        p.set(x, y, wet ? pick(RIVERSTONE, -0.95) : pick(RIVERSTONE, -0.55 - ((x + 0.5 - cx) / rx) * 0.25));
        continue;
      }
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      let v = 0.3 - nx * 0.45 - ny * 0.4 + (hash(x, y, seed) - 0.5) * 0.3 + (hash(x >> 1, y >> 1, seed + 1) < 0.15 ? -0.3 : 0);
      if (Math.hypot(nx, ny) > 0.85) v -= 0.2;
      p.set(x, y, pick(RIVERSTONE, v));
    }
  // moss or lichen dab
  if (o.moss) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!shape(x, y)) continue;
    const d = Math.hypot(x + 0.5 - (cx + rx * 0.35), (y + 0.5 - (cy - 1)) * 1.6);
    if (d < 3 && hash(x, y, seed + 3) < 0.75) p.set(x, y, MOSS[clamp(Math.round(4 - d), 1, 5)]);
  }
  // wet speckles and a sheen
  p.set(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.4), RIVERSTONE[7]);
  p.set(Math.round(cx - rx * 0.4) + 1, Math.round(cy - ry * 0.4), RIVERSTONE[6]);
  outline(p, { k: 0.5, lit: 0.4 });
  // foam lapping at the upstream (left) side
  for (let y = 0; y < H; y++) {
    let x0 = -1;
    for (let x = 0; x < W; x++) if (p.on(x, y)) { x0 = x; break; }
    if (x0 > 0 && y > H * 0.35 && hash(y, 1, seed) < 0.7) p.set(x0 - 1, y, WATER.foam[4], 235);
  }
  return p;
}
// Smooth wet river rock (grounded).
const RIVERSTONE = pals(['#2a2a36', '#3a3c4a', '#4c505e', '#606674', '#767e8a', '#8e96a0', '#a8aeb6', '#c2c8cc', '#dfe2e2']);
function riverRock(W, H, seed, o = {}) {
  const p = rockSprite(W, H, seed, { pal: RIVERSTONE, facets: o.facets ?? 3, lichen: 0, speck: 40, moss: o.moss });
  // glossy wet highlight and a dark wet band at the waterline
  const R = mulberry(seed + 2);
  for (let k = 0; k < 3; k++) {
    const x = Math.round(W * (0.3 + R() * 0.15)) + k, y = Math.round(H * 0.3) + (k === 2 ? 1 : 0);
    if (p.on(x, y) && p.on(x, y + 1)) p.set(x, y, k === 0 ? 0xffffff : RIVERSTONE[8]);
  }
  for (let x = 0; x < W; x++) for (let y = H - 3; y < H; y++) if (p.on(x, y)) p.set(x, y, mix(p.get(x, y), hx('#1c2a3a'), 0.35));
  if (o.algae) for (let x = 0; x < W; x++) if (p.on(x, H - 3) && hash(x, 4, seed) < 0.6) p.set(x, H - 3 - (hash(x, 5, seed) < 0.4 ? 1 : 0), SWAMP.algae[3]);
  return p;
}
function driftwood2() {
  const p = new Px(34, 13);
  const pal = pals(['#5a524e', '#7a726c', '#9a928a', '#bab2a6', '#d6d0c4', '#f0ece2']);
  limb(p, [[2, 10], [10, 9.5], [20, 10], [31, 9]], 4, 2.4, pal, 41);
  limb(p, [[13, 9.5], [16, 6], [17, 2]], 2.2, 1, pal, 42);
  limb(p, [[24, 9.5], [27, 7], [31, 5.5]], 1.8, 1, pal, 43);
  limb(p, [[3, 10], [1, 8]], 1.6, 1, pal, 44);
  // grain lines
  for (let x = 4; x < 30; x++) if (hash(x >> 2, 1, 4) < 0.5) p.tint(x, 10, pal[1]);
  outline(p, { noBottom: true });
  return p;
}

// ===========================================================================
// Weeds (to plow) & plowed earth
// ===========================================================================
const WEED_G = { L: '#a4c46a', l: '#78a048', g: '#527a36', G: '#36582c', D: '#243c22' };
const WEEDS = {
  // thistle: spiny grey-green rosette, two purple brush heads
  weed_0: [[
    '...pP.....pP...',
    '..pPpP...pPpP..',
    '..PpPp...PpPp..',
    '..bBbB...bBbB..',
    '.b.bB.b.b.bB.b.',
    '....g.....g....',
    '.L..g..l..g..L.',
    '.lL.gl.l.lg.Ll.',
    'L.lLgLlglLgLl.L',
    '.lLlggLgLggl.l.',
    'L.lgGglggGgl..L',
    '.lLgGgGgGgGgLl.',
    'lLgGgDgGgDgGgLl',
    '.gGgDGgDgGDgGg.',
    '..GDGDGDGDGDG..',
  ], { ...WEED_G, p: '#e090e8', P: '#b050c0', b: '#5a7a46', B: '#3e5a38' }],
  // dandelion clump: toothy rosette, two flowers and a seed clock
  weed_1: [[
    '..........wWw...',
    '.........wWwWw..',
    '.yY......wWwWw..',
    'yYyo......wWw...',
    '.yoy..yY...g....',
    '..g..yYyo..g....',
    '..g...yoy..g....',
    'L.gL...g..Lg..L.',
    'lLglL..g.lLg.lL.',
    '.lLglLlgLlgLLl.l',
    'L.lLglLgLglLl.L.',
    '.lLgGlgGglgGgLl.',
    '..gGgDgGgDgGg...',
  ], { ...WEED_G, y: '#ffd83a', Y: '#fff28a', o: '#e09a1e', w: '#e8eaf2', W: '#ffffff' }],
  // burdock: huge floppy leaves and a stalk of hooked burrs
  weed_2: [[
    '.......rR.........',
    '......rbBr.rR.....',
    '.......bB.rbBr....',
    '....rR..g..bB.....',
    '...rbBr.g.g.......',
    '....bB..ggg.......',
    '.....g..g.........',
    '..LLl.g.g.LLLl....',
    '.LllllgLglllllL...',
    'LllglllgllglllllL.',
    'lllglllgllglllglll',
    '.llglGlgGlglGlglg.',
    '..gGglGgGgGlGgGg..',
    '.GgGDgGDgDgGgDgG..',
    '..GDGDGDGDGDGDG...',
  ], { ...WEED_G, r: '#c070a8', R: '#e8a0d0', b: '#7a5a3a', B: '#523a28' }],
  // ragweed: lacy upright weed with nodding green-yellow flower spikes
  weed_3: [[
    '.....y.....',
    '....yY..y..',
    '..y.Yg.yY..',
    '..Yy.g.Yg..',
    '..gY.g.g...',
    '.L.g.gLg.L.',
    'lL.gLglg.lL',
    '.lLglgLgLl.',
    'L.lggLggl.L',
    '.lLgLggLgl.',
    'lLlgGggGlLl',
    '.lgGgGgGgl.',
    '..gGDgDGg..',
    '...DGDGD...',
  ], { ...WEED_G, y: '#d8d860', Y: '#f0f090' }],
};
// Tilled soil: furrow ridges with lit tops, clods, a pebble and a worm.
function plowedPatch(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const soil = pals(['#24161a', '#38221e', '#4e3024', '#68422c', '#825638', '#9e6e48', '#b88a60']);
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const nx = (x + 0.5 - cx) / (W / 2 - 0.5), ny = (y + 0.5 - cy) / (H / 2 - 0.5);
      const e = Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4);
      if (e > 1 + (hash(x, y, seed) - 0.5) * 0.25) continue;
      // furrows run left-right, 4 px pitch
      const ph = (y + Math.sin(x * 0.15 + seed) * 0.6) % 4;
      let v = ph < 1 ? 0.55 : ph < 2 ? 0.15 : ph < 3 ? -0.35 : -0.75;
      v += (hash(x, y, seed + 1) - 0.5) * 0.4 - nx * 0.15;
      if (e > 0.75) v -= 0.25;
      p.set(x, y, pick(soil, v));
    }
  // clods
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(3 + R() * (W - 6)), y = Math.floor(2 + R() * (H - 4));
    if (!p.on(x, y) || !p.on(x + 1, y + 1)) continue;
    p.set(x, y, soil[6]); p.set(x + 1, y, soil[5]); p.set(x, y + 1, soil[4]); p.set(x + 1, y + 1, soil[2]);
  }
  stamp(p, ['ab', 'bc'], { a: '#c8c0c4', b: '#9a9098', c: '#6a6270' }, Math.round(W * 0.7), Math.round(H * 0.3));
  stamp(p, ['pp.', '..pP'], { p: '#e08a90', P: '#f0b0b0' }, Math.round(W * 0.28), Math.round(H * 0.62));
  outline(p, { k: 0.4, lit: 0.35 });
  return p;
}

// ===========================================================================
// Demolish leftovers
// ===========================================================================
function rubblePile(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  // planks first (behind), then stones
  const plank = pals(['#3e2620', '#5e3a2a', '#82543a', '#a8744e', '#c89868']);
  for (let i = 0; i < (o.planks ?? 2); i++) {
    const y0 = H - 4 - R() * (H * 0.4), x0 = 2 + R() * W * 0.3;
    limb(p, [[x0, y0 + 4], [x0 + W * 0.55, y0]], 2.5, 2.5, plank, seed + i);
  }
  const stones = [];
  for (let i = 0; i < (o.n ?? 7); i++) {
    const w = Math.round(6 + R() * 6), h = Math.round(4 + R() * 4);
    stones.push([2 + R() * (W - w - 4), H - h - R() * (H * 0.35), w, h, (seed + i * 7) | 0]);
  }
  stones.sort((a, b) => a[1] + a[3] - (b[1] + b[3]));
  for (const [x, y, w, h, s] of stones) {
    const r = rockSprite(w + 2, h + 2, s, { facets: 2, lichen: 0, speck: 12 });
    p.blit(r, Math.round(x), Math.round(Math.min(H - h - 2, y)));
  }
  // dust and grit around the base, a bent nail
  for (let x = 1; x < W - 1; x++) if (R() < 0.5) p.set(x, H - 1, pick(GRANITE, (R() - 0.5) * 0.6));
  stamp(p, ['k..', '.k.', '.kK'], { k: '#5a5460', K: '#9a94a0' }, Math.round(W * 0.7), H - 4);
  outline(p, { noBottom: true });
  return p;
}
function woodPile(W, H, seed) {
  const p = new Px(W, H);
  const bark = pals(['#2a1c1e', '#3e2a28', '#553a30', '#6e4c3a', '#886046']);
  const wood = pals(['#7a5034', '#a06a40', '#c48e58', '#e0b47a', '#f4d8a0']);
  const r = 3.6;
  const rows = [[5, H - 1 - r], [4, H - 1 - r * 2.7], [3, H - 1 - r * 4.4]];
  const N = 5;
  rows.forEach(([n, cy], ri) => {
    for (let i = 0; i < n; i++) {
      const cx = W / 2 + (i - (n - 1) / 2) * (r * 2 + 0.6) + (hash(i, ri, seed) - 0.5);
      const rr = r * (0.88 + hash(i, ri + 9, seed) * 0.22);
      ellipse(p, cx, cy, rr, rr * 0.95, (x, y, nx, ny) => {
        const d = Math.hypot(nx, ny);
        if (d > 0.78) return pick(bark, 0.3 - nx * 0.6 - ny * 0.6);
        const ring = Math.floor(d * 3.2 + hash(x, y, seed) * 0.25) % 2;
        let v = 0.45 - ring * 0.4 - nx * 0.3 - ny * 0.4;
        if (hash(i, ri, seed + 4) < 0.35 && Math.abs(nx - ny * 0.4) < 0.12) v -= 0.6; // split crack
        return pick(wood, v);
      });
    }
  });
  // a log lying along the top and an axe in the stack
  outline(p, { noBottom: true });
  stamp(p, ['.SSs', 'SSss', '.Ss.', '..h.', '..h.', '..h.', '..H.'], { S: '#c8ccd4', s: '#7a7e8a', h: '#a8744e', H: '#6a4430' }, W - 9, 2);
  return p;
}
function woodChips(W, H, seed) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const wood = pals(['#6a4430', '#94643e', '#ba8a56', '#dcb07a', '#f2d4a2']);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const x = Math.round(W / 2 + Math.cos(a) * d * (W / 2 - 2)), y = Math.round(H / 2 + Math.sin(a) * d * (H / 2 - 1.5));
    const long = R() < 0.5;
    p.set(x, y, wood[3 + (R() < 0.3 ? 1 : 0)]);
    if (long) p.set(x + 1, y, wood[2]);
    else p.set(x, y + 1, wood[1]);
    if (R() < 0.3) p.set(x + 1, y + 1, wood[0]);
  }
  // sawdust specks
  for (let i = 0; i < 18; i++) {
    const x = Math.round(W / 2 + (R() - 0.5) * W * 0.8), y = Math.round(H / 2 + (R() - 0.5) * H * 0.7);
    if (!p.any(x, y)) p.set(x, y, wood[4], 210);
  }
  outline(p, { k: 0.45, lit: 0.4 });
  return p;
}
// Big old stump: wide ringed top with a crack, moss, mushrooms and an axe mark.
function bigStump(W, H, seed) {
  const p = stumpSprite(W, H, seed, { ry: 5.5, topY: 7, roots: 3 });
  const R = mulberry(seed + 1);
  smallShroom(p, W * 0.24, H - 3, 4, 2.4, SHROOM_MIX.orange, SHROOM.stem, seed + 2);
  smallShroom(p, W * 0.3, H - 2, 2.5, 1.7, SHROOM_MIX.orange, SHROOM.stem, seed + 3);
  // moss on the shaded side
  for (let y = 10; y < H - 1; y++) for (let x = Math.round(W * 0.66); x < W - 4; x++) if (p.on(x, y) && hash(x >> 1, y >> 1, seed) < 0.4) p.set(x, y, MOSS[clamp(Math.round(2 + hash(x, y, seed + 5) * 2), 0, 5)]);
  outline(p, { noBottom: true });
  for (const [x, y] of spotsIn(p, 1, R, [W * 0.3, 3, W * 0.6, 9], 6)) dew(p, x, y);
  return p;
}

// ===========================================================================
// The Great Willow (landmark)
// ===========================================================================
// A huge old weeping willow on a root mound: deeply furrowed trunk with a
// tiny arched door and a sleepy carved face, a wide dome of leaves and long
// curtains of fronds that part in the middle, paper lanterns, a rope swing
// and fireflies. Two frames: the fronds sway (each strand with its own
// phase), the swing rocks and the fireflies blink.
const WILLOW = pals(['#122420', '#183424', '#204628', '#2c5a2c', '#3c7030', '#508636', '#689c3c', '#86b448', '#a8cc5c', '#d0e684']);
const WILLOW_BARK = pals(['#221a22', '#30242a', '#433230', '#58443a', '#6e5846', '#867056', '#a08a6c']);
function greatWillow(frame) {
  const W = 248, H = 200;
  const seed = 7001;
  const R = mulberry(seed);
  const cx = W / 2;
  const p = new Px(W, H);
  const mid = new Px(W, H);
  const front = new Px(W, H);

  // --- trunk, roots and limbs ------------------------------------------------
  const furrow = (x, y, s) => {
    const w = Math.sin((x - cx) * 0.85 + Math.sin(y * 0.11 + x * 0.05) * 2.2);
    let v = w > 0.55 ? -0.55 : w > 0.25 ? -0.2 : 0;
    if (hash(x, y >> 2, seed) < 0.08) v -= 0.3;
    if (s < 0.35 && w < -0.6 && hash(x, y, seed + 1) < 0.5) v += 0.25; // lit ridges
    return v;
  };
  // grassy root mound
  ellipse(mid, cx, H - 0.5, 100, 9, (x, y, nx, ny) => {
    if (y >= H) return null;
    return pick(pals(['#1e3a24', '#2a5028', '#38662c', '#4a7c32', '#62943a', '#80ac48', '#a2c45c']), 0.5 - ny * 0.9 - nx * 0.4 + (hash(x, y, seed + 8) - 0.5) * 0.5 - (ny > 0.75 ? 0.5 : 0));
  });
  const yt = 96;
  trunk(mid, { cx, yb: H - 1, yt, wb: 38, wt: 22, pal: WILLOW_BARK, seed, flare: 4, curve: 1.5, bark: furrow, shadeTo: 70, shadeLen: 34 });
  const limbs = [
    [[cx - 8, yt + 8], [cx - 30, 80], [cx - 62, 60], [cx - 84, 54]], [[cx + 8, yt + 8], [cx + 34, 78], [cx + 66, 58], [cx + 88, 56]],
    [[cx - 3, yt + 4], [cx - 14, 66], [cx - 24, 40]], [[cx + 4, yt + 4], [cx + 18, 64], [cx + 30, 42]],
  ];
  limbs.forEach((pts, i) => limb(mid, pts, i < 2 ? 15 : 12, 5, WILLOW_BARK.slice(0, 6), seed + i));
  // roots snaking over the mound
  const roots = [
    [[cx - 14, H - 12], [cx - 34, H - 7], [cx - 56, H - 4], [cx - 78, H - 1]], [[cx + 14, H - 12], [cx + 36, H - 7], [cx + 60, H - 3], [cx + 84, H - 1]],
    [[cx - 8, H - 6], [cx - 22, H - 2], [cx - 36, H - 1]], [[cx + 9, H - 6], [cx + 24, H - 2], [cx + 40, H - 1]],
    [[cx - 18, H - 16], [cx - 40, H - 12], [cx - 50, H - 6]],
  ];
  roots.forEach((pts, i) => limb(mid, pts, 9 - (i > 1 ? 3 : 0), 2, WILLOW_BARK.slice(0, 6), seed + 10 + i));
  // moss on the roots and the trunk foot
  for (let y = H - 22; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mid.on(x, y) || mid.on(x, y - 2)) continue;
      if (hash(x >> 1, y, seed + 3) < 0.7) mid.set(x, y, MOSS[clamp(Math.round(4.5 - (x - cx) / 40 + (hash(x, y, seed) - 0.5) * 1.5), 1, 5)]);
    }
  // door: arched planks, porthole window, brass knob, stone step
  const dw = 15, dh = 22, dx0 = Math.round(cx - dw / 2), dy0 = H - 4 - dh;
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const u = (x + 0.5 - dw / 2) / (dw / 2);
      const archTop = 6 * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
      if (y < archTop) continue;
      const edge = y < archTop + 1.2 || Math.abs(u) > 0.84;
      let c = edge ? hx('#3a2420') : ((x >> 1) & 1) ? hx('#8a5432') : hx('#a8683a');
      if (!edge && (y === 7 || y === 16)) c = hx('#5a3626'); // cross battens
      mid.set(dx0 + x, dy0 + y, c);
    }
  stamp(mid, ['.oo.', 'oYyo', 'oyYo', '.oo.'], { o: '#3a2420', Y: '#fff0a0', y: '#ffb84a' }, dx0 + 5, dy0 + 9);
  stamp(mid, ['k', 'K'], { k: '#ffe070', K: '#b08020' }, dx0 + dw - 4, dy0 + 13);
  stamp(mid, ['..ssssssssssssss..', '.sSsSSsSSsSSsSSss.', 'SSSSSSSSSSSSSSSSSS'], { s: '#b8b2bc', S: '#827c8a' }, dx0 - 2, H - 4);
  // sleepy carved face in the bark, high on the trunk
  const fy = H - 70;
  for (const ex of [-9, 4]) stamp(mid, ['k.....k', '.k...k.', '..kkk..', '..lll..'], { k: '#1a1216', l: '#8a7262' }, Math.round(cx + ex - 1), fy);
  stamp(mid, ['k......k', '.k....k.', '..kkkk..', '..llll..'], { k: '#1a1216', l: '#8a7262' }, Math.round(cx - 4), fy + 8);
  stamp(mid, ['rrr'], { r: '#a86a5a' }, Math.round(cx - 13), fy + 5);
  stamp(mid, ['rrr'], { r: '#a86a5a' }, Math.round(cx + 11), fy + 5);
  // a little mailbox mushroom and some flowers by the door
  smallShroom(mid, cx - 24, H - 6, 6, 3.2, SHROOM.red, SHROOM.stem, seed + 4, null, { spots: hx('#fff6e8') });
  smallShroom(mid, cx - 19, H - 5, 3.5, 2, SHROOM.red, SHROOM.stem, seed + 5, null, { spots: hx('#fff6e8') });

  // --- crown -------------------------------------------------------------------
  const cls = [];
  const rows = [[22, 50, 16, 14], [36, 84, 17, 16], [52, 104, 18, 16], [68, 108, 20, 14], [80, 90, 22, 11]];
  rows.forEach(([y, reach, step, r], ri) => {
    for (let x = -reach; x <= reach + 0.1; x += step) {
      const rr = r * (0.85 + R() * 0.3);
      cls.push({ x: cx + x + (R() - 0.5) * 6, y: y + (R() - 0.5) * 5 + Math.pow(Math.abs(x) / 110, 2) * 8, r: rr, ry: rr * 0.78, shift: (R() - 0.5) * 0.2 });
    }
  });
  cls.push({ x: cx - 6, y: 84, r: 15, ry: 10 }, { x: cx + 10, y: 86, r: 13, ry: 9 });
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (0.12 + 0.76 * (i / 8));
    cls.push({ x: cx + Math.cos(a) * 100, y: 50 + Math.sin(a) * 40, r: 9 + R() * 4, ry: 8 + R() * 2 });
  }
  const crownOwn = canopy(mid, cls, { pal: WILLOW, seed: seed + 9, leaf: 2.4, holes: 8, loose: 0.6, jag: 0.3, bump: 2.4, bias: 0.46, local: 0.5, bottomDark: 0.8,
    env: { x: cx, y: 52, rx: 118, ry: 44 } });
  // willow texture: short vertical leaf streaks across the crown
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (crownOwn[y * W + x] < 0) continue;
      const k = (x * 7 + Math.floor((y + hash(x, 0, seed) * 4) / 3) * 3) % 5;
      if (k === 0) mid.set(x, y, mix(mid.get(x, y), WILLOW[1], 0.35));
      else if (k === 2 && hash(x, y >> 1, seed + 6) < 0.35) mid.set(x, y, mix(mid.get(x, y), WILLOW[8], 0.3));
    }
  outline(mid, { noBottom: true });

  // hem: lowest crown pixel per column
  const hem = new Float32Array(W).fill(-1);
  for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (crownOwn[y * W + x] >= 0) { hem[x] = y; break; }

  // --- fronds --------------------------------------------------------------------
  const sw = frame ? 1 : -1; // global breeze direction for this frame
  const strand = (dst, x0, y0, L, i, layer) => {
    const ph = hash(i, layer, seed) * 6.28;
    const amp = 1.6 + hash(i, 7, seed) * 1.6;
    const u = (x0 - cx) / 116;
    const leafPhase = i % 3;
    for (let k = 0; k <= L; k++) {
      const t = k / L;
      const sway = (Math.sin(ph + frame * 2.4) * amp * 0.6 + sw * amp * 0.7) * Math.pow(t, 1.6);
      const x = Math.round(x0 + u * 6 * t * t + sway);
      const y = Math.round(y0 + k);
      let v = 0.15 - u * 0.55 + t * 0.55 - (layer === 0 ? 0.75 : 0);
      if (t < 0.25) v -= 0.6 * (1 - t / 0.25); // in the shadow of the crown
      v += (hash(i, k >> 2, seed + 2) - 0.5) * 0.3;
      const c = pick(WILLOW, v);
      dst.set(x, y, c);
      if (layer === 1) dst.set(x + 1, y, pick(WILLOW, v - 0.55));
      // leaves: little alternating ticks
      if (k % 3 === leafPhase && k > 2) dst.set(x - 1, y, pick(WILLOW, v + 0.35));
      else if (k % 3 === (leafPhase + 1) % 3 && k > 2) dst.set(x + (layer ? 2 : 1), y + 1, pick(WILLOW, v - (layer ? 0.3 : 0.6)));
    }
    // pale tip
    const tx = Math.round(x0 + u * 6 + (Math.sin(ph + frame * 2.4) * amp * 0.6 + sw * amp * 0.7));
    dst.set(tx, Math.round(y0 + L) + 1, pick(WILLOW, 0.75 - u * 0.4 - (layer === 0 ? 0.6 : 0)));
  };
  // back curtain (behind the trunk): dense and dark
  let i = 0;
  for (let x = 6; x < W - 6; x += 2.2 + hash(i, 1, seed) * 1.2, i++) {
    const xi = Math.round(x);
    if (hem[xi] < 0) continue;
    const y0 = hem[xi] - 8 - hash(i, 2, seed) * 6;
    const groundY = H - 10 - hash(i, 3, seed) * 26;
    strand(p, xi, y0, Math.max(10, (groundY - y0) * (0.7 + hash(i, 4, seed) * 0.3)), i, 0);
  }
  p.blit(mid, 0, 0);
  // rope swing on the right limb (behind the front curtain)
  const swX = Math.round(cx + 52), swTop = 62, swLen = 88;
  const rock = frame ? 2 : -1;
  const rope = hx('#c8a46a'), ropeD = hx('#8a6a40');
  for (const off of [0, 11]) line(p, swX + off, swTop, swX + off + rock, swTop + swLen, (x, y) => p.set(x, y, (y & 1) ? rope : ropeD));
  stamp(p, ['SSSSSSSSSSSSS', 'sddddddddddds'], { S: '#c88a52', s: '#5a3a26', d: '#8a5a36' }, swX - 1 + rock, swTop + swLen);
  // front curtain: parts in the middle like a doorway arch
  i = 1000;
  for (let x = 4; x < W - 4; x += 2.6 + hash(i, 1, seed) * 1.6, i++) {
    const xi = Math.round(x);
    if (hem[xi] < 0) continue;
    const ax = Math.abs(xi - cx);
    const open = 0.12 + 0.88 * smooth(20, 46, ax);
    const y0 = hem[xi] - 9 - hash(i, 2, seed) * 12;
    const groundY = H - 14 - hash(i, 3, seed) * 30;
    let L = (groundY - y0) * (0.55 + hash(i, 4, seed) * 0.45) * open;
    if (ax > 46 && ax < 66 && xi > cx) L *= 0.55; // window over the swing
    if (L < 4) continue;
    strand(front, xi, y0, L, i, 1);
  }
  p.blit(front, 0, 0);

  // --- lanterns, strings and fireflies -----------------------------------------
  const lanterns = [[cx - 70, 26], [cx - 38, 40], [cx + 30, 34], [cx + 82, 22], [cx - 98, 18], [cx + 4, 24]];
  const LAN = ['.kkk.', 'lYYYl', 'YWWYy', 'lYYyl', '.lyl.', '..k..'];
  const lanPal = { k: '#3a2224', l: '#e8783a', Y: '#ffd870', W: '#fff8d8', y: '#f4a040' };
  const lights = [];
  for (const [lx, drop] of lanterns) {
    const x = Math.round(lx);
    const top = hem[x] > 0 ? hem[x] - 4 : 60;
    const sway = frame ? 1 : 0;
    line(p, x, top, x + sway, top + drop, hx('#4a3a34'));
    stamp(p, LAN, lanPal, x + sway - 2, top + drop + 1);
    lights.push([x + sway, top + drop + 3]);
  }
  // warm glow around each lantern
  for (const [x, y] of lights) {
    for (let yy = y - 6; yy <= y + 6; yy++)
      for (let xx = x - 6; xx <= x + 6; xx++) {
        const d = Math.hypot(xx - x, (yy - y) * 1.1) / 6;
        if (d >= 1 || d < 0.35) continue;
        const th = ((BAYER4[(yy & 3) * 4 + (xx & 3)] + 0.5) / 16);
        if ((1 - d) * 0.9 > th + 0.18) p.set(xx, yy, mix(p.any(xx, yy) ? p.get(xx, yy) : hx('#ffb84a'), hx('#ffd070'), p.any(xx, yy) ? 0.55 : 1), 230);
      }
  }
  // fireflies drifting among the fronds (different spots each frame)
  const RF = mulberry(seed + 50 + frame * 7);
  for (let k = 0; k < 16; k++) {
    const x = Math.round(14 + RF() * (W - 28)), y = Math.round(70 + RF() * (H - 90));
    const on = (k + frame) % 3 !== 0;
    p.set(x, y, on ? hx('#f8ffa0') : hx('#a8c860'));
    if (on) {
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + ax, y + ay, mix(p.any(x + ax, y + ay) ? p.get(x + ax, y + ay) : hx('#d8f070'), hx('#e8ff80'), 0.6), 220);
    }
  }
  // grass and flowers on the mound
  const RG = mulberry(seed + 77);
  const gpal = pals(['#1e3a24', '#2c5a2e', '#3e7a36', '#5c9a42', '#86ba58', '#b2d47a']);
  for (let k = 0; k < 40; k++) blade(p, 10 + RG() * (W - 20), H - 1, 2 + RG() * 5, (RG() - 0.5) * 3, (RG() - 0.5) * 2, 1, gpal);
  for (let k = 0; k < 10; k++) {
    const x = Math.round(16 + RG() * (W - 32)), y = H - 2 - Math.floor(RG() * 3);
    const c = [hx('#ffd84a'), hx('#ff8ab8'), hx('#a888f0'), hx('#ffffff')][k % 4];
    p.set(x, y, c); p.set(x + 1, y, mix(c, INK, 0.3)); p.set(x, y - 1, mix(c, 0xffffff, 0.4));
  }
  return p;
}

// ===========================================================================
// Berry bushes (full + picked)
// ===========================================================================
// Fruit palettes: [rim, shade, base, light, highlight]
const BERRY = {
  rasp: pals(['#4a0618', '#9a1430', '#d82a3e', '#ff6a6a', '#ffd0d0']),
  raspRaw: pals(['#5a6a2a', '#8aa040', '#c0d468', '#e8f0a0', '#ffffff']),
  straw: pals(['#5a0a14', '#b01826', '#e8342e', '#ff7a5a', '#ffe0d0']),
  cran: pals(['#3a0414', '#8a0c24', '#d81c34', '#ff5a5a', '#ffe0e4']),
  sask: pals(['#1a1030', '#382a62', '#5a4892', '#8a7ac0', '#e0dcf8']),
  saskRaw: pals(['#4a1422', '#8a2a3a', '#c04a52', '#e8807a', '#ffd8d0']),
  cloud: pals(['#6a2a08', '#c0601a', '#f09a30', '#ffcc60', '#fff4c8']),
  elder: pals(['#100818', '#2a1438', '#4a2458', '#7a4a8a', '#c8a8e0']),
  gold: pals(['#6a3a08', '#c07818', '#f4b830', '#ffe470', '#ffffff']),
};
const LEAF_FRESH = pals(['#142a1e', '#1c3c24', '#26522a', '#326830', '#428036', '#58983e', '#74b048', '#98c85c', '#c0de7c']);
const LEAF_BLUE = pals(['#14262a', '#1a3634', '#22483e', '#2e5c46', '#3c704e', '#4e8458', '#669a66', '#86b47c', '#acce98']);
const LEAF_BOG = pals(['#1e1418', '#2e1c1e', '#422822', '#4e3a26', '#4a502a', '#5a6a30', '#76843a', '#9aa04c', '#c0bc6a']);
const LEAF_MAGIC = pals(['#10242a', '#163636', '#1c4a40', '#246048', '#327852', '#46905a', '#64aa62', '#90c472', '#d0e490']);

function placeFruit(p, n, R, box, shape, pal, minD = 5, extra) {
  const pts = spotsIn(p, n, R, box, minD);
  for (const [x, y] of pts) fruit(p, x, y, shape, pal, extra);
  return pts;
}

function raspberryBush(picked) {
  const W = 28, H = 24, seed = 3601;
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cane = pals(['#3a1a22', '#5a2a2e', '#7e3e3a', '#a0584a']);
  // arching canes poke out of the leaves
  for (const [x0, x1, y1] of [[10, 3, 3], [14, 14, 0], [18, 25, 4], [12, 6, 8]]) limb(p, [[x0, H - 1], [lerp(x0, x1, 0.4), y1 + 6], [x1, y1]], 1.6, 1, cane, seed + x0);
  const leaves = bushSprite(W, H, seed, LEAF_FRESH, { n: 3, cy: 0.52, ry: 0.5, leaf: 2.6, bias: 0.55 });
  p.blit(leaves, 0, 0);
  // serrated leaf tips: a few pale points on the lit edge
  for (let x = 1; x < W - 1; x++) for (let y = 1; y < H - 4; y++) if (p.on(x, y) && !p.on(x, y - 1) && hash(x, y, seed) < 0.3) p.set(x, y - 1, LEAF_FRESH[7]);
  if (!picked) placeFruit(p, 8, R, [2, 3, W - 6, H - 7], 'drupe', BERRY.rasp, 5);
  else placeFruit(p, 2, R, [3, 5, W - 6, H - 8], 'drupe_s', BERRY.raspRaw, 7);
  // a white bloom on the picked bush, so it reads as regrowing
  if (picked) stamp(p, ['.w.', 'wyw', '.w.'], { w: '#fffaf4', y: '#f0d050' }, 16, 7);
  outline(p, { noBottom: true });
  if (!picked) for (const [x, y] of spotsIn(p, 1, R, [4, 2, W - 8, 10], 6)) dew(p, x, y);
  return p;
}
function strawberryPatch(picked) {
  const W = 28, H = 13, seed = 3602;
  const p = new Px(W, H);
  const R = mulberry(seed);
  // low clumps of trifoliate leaves along runners
  const cls = [];
  for (let i = 0; i < 6; i++) {
    const x = 3 + (i / 5) * (W - 6) + (R() - 0.5) * 2, y = H - 4.5 - (i % 2) * 2 - R();
    for (let k = 0; k < 3; k++) cls.push({ x: x + (k - 1) * 2.2, y: y - (k === 1 ? 1.5 : 0), r: 2.4 + R() * 0.6, ry: 1.9 });
  }
  canopy(p, cls, { pal: LEAF_FRESH, seed: seed + 9, leaf: 2, loose: 0.3, jag: 0.12, bump: 2.5, bias: 0.4, local: 0.85, texAmt: 0.6, rim: 1 });
  // runners on the ground
  for (let x = 1; x < W - 1; x++) if (!p.any(x, H - 1) && hash(x, 1, seed) < 0.6) p.set(x, H - 1, hx('#6a8a3a'));
  if (!picked) {
    for (const [x, y] of [[3, 6], [10, 7], [17, 6], [22, 7]]) fruit(p, x, y, 'straw', BERRY.straw);
    stamp(p, ['.w.', 'wyw', '.w.'], { w: '#ffffff', y: '#f4d040' }, 13, 1);
  } else {
    stamp(p, ['.w.', 'wyw', '.w.'], { w: '#ffffff', y: '#f4d040' }, 6, 2);
    stamp(p, ['.w.', 'wyw', '.w.'], { w: '#ffffff', y: '#f4d040' }, 19, 3);
    fruit(p, 12, 7, 'round2', BERRY.raspRaw);
  }
  outline(p, { noBottom: true });
  return p;
}
function cranberryBush(picked) {
  const W = 24, H = 12, seed = 3603;
  const p = new Px(W, H);
  const R = mulberry(seed);
  // sphagnum bed
  ellipse(p, W / 2, H - 1.5, W / 2 - 1, 2.5, (x, y, nx, ny) => pick(pals(['#3a2024', '#5a2e2e', '#7a4234', '#6a6a34', '#8a8a44']), 0.4 - ny - nx * 0.3 + (hash(x, y, seed) - 0.5) * 0.8));
  const leaves = bushSprite(W, H - 1, seed, LEAF_BOG, { n: 4, cy: 0.58, ry: 0.42, leaf: 1.8, bias: 0.5, r: 0.3 });
  p.blit(leaves, 0, 0);
  // tiny wiry stems poking up
  for (const x of [4, 9, 15, 20]) line(p, x, 3, x + 1, 1, LEAF_BOG[3]);
  if (!picked) placeFruit(p, 9, R, [1, 1, W - 4, H - 5], 'round3', BERRY.cran, 4);
  else placeFruit(p, 1, R, [3, 2, W - 6, H - 6], 'round2', BERRY.cran, 4);
  outline(p, { noBottom: true });
  return p;
}
function saskatoonBush(picked) {
  const W = 30, H = 30, seed = 3604;
  const p = new Px(W, H);
  const R = mulberry(seed);
  const stems = pals(['#2a2028', '#40323a', '#5a4a4c', '#7a6a66']);
  for (const [x0, x1] of [[13, 10], [15, 15], [17, 20]]) limb(p, [[x0, H - 1], [x1, H - 6]], 2, 1.4, stems, seed + x0);
  const leaves = bushSprite(W, H - 3, seed, LEAF_BLUE, { n: 4, cy: 0.5, ry: 0.5, leaf: 2.8, bias: 0.55, r: 0.38 });
  p.blit(leaves, 0, 0);
  if (!picked) {
    // berries hang in little grape-like clusters, a couple still reddish
    const pts = spotsIn(p, 6, R, [2, 3, W - 6, H - 12], 6);
    pts.forEach(([x, y], i) => {
      const pal = i === 4 ? BERRY.saskRaw : BERRY.sask;
      fruit(p, x, y, 'round3', pal);
      fruit(p, x + 3, y + 1, 'round2', pal);
      if (i % 2 === 0) fruit(p, x + 1, y + 3, 'round2', pal);
    });
  } else placeFruit(p, 1, R, [4, 4, W - 8, H - 14], 'round2', BERRY.saskRaw, 6);
  outline(p, { noBottom: true });
  if (!picked) for (const [x, y] of spotsIn(p, 2, R, [3, 1, W - 6, 12], 8)) dew(p, x, y);
  return p;
}
function cloudberryPlant(picked) {
  const W = 22, H = 13, seed = 3605;
  const p = new Px(W, H);
  const R = mulberry(seed);
  // a few big crinkled lobed leaves on short stalks
  const cls = [];
  for (const [x, y, r] of [[5, 8, 4], [11, 7, 4.6], [17, 8.5, 3.8], [8, 10, 3.2], [14, 10.5, 3.4]]) cls.push({ x, y, r, ry: r * 0.72 });
  canopy(p, cls, { pal: LEAF_FRESH, seed: seed + 9, leaf: 2.2, loose: 0.25, jag: 0.32, bump: 2.2, bias: 0.4, local: 0.85, rim: 1.1 });
  // leaf veins
  for (const [x, y] of [[5, 8], [11, 7], [17, 8]]) for (let k = -2; k <= 2; k++) p.tint(x + k, y + (Math.abs(k) > 1 ? -1 : 0), LEAF_FRESH[3]);
  const st = hx('#7a5a3a');
  if (!picked) {
    for (const [x, y] of [[8, 0], [15, 2]]) {
      line(p, x + 1, y + 4, x + 1, y + 7, st);
      fruit(p, x, y, 'amber', BERRY.cloud);
    }
  } else {
    line(p, 9, 4, 9, 7, st);
    stamp(p, ['wWw', '.y.'], { w: '#f4f0e8', W: '#ffffff', y: '#d8c060' }, 8, 2);
  }
  outline(p, { noBottom: true });
  return p;
}
function elderberryBush(picked) {
  const W = 32, H = 32, seed = 3606;
  const p = new Px(W, H);
  const R = mulberry(seed);
  const stems = pals(['#2a2022', '#3e3030', '#5a4840', '#7a6650']);
  for (const [x0, x1] of [[14, 11], [16, 16], [18, 21]]) limb(p, [[x0, H - 1], [x1, H - 6]], 2.2, 1.4, stems, seed + x0);
  const leaves = bushSprite(W, H - 5, seed, LEAF_FRESH, { n: 4, cy: 0.56, ry: 0.46, leaf: 3, bias: 0.6, r: 0.36 });
  p.blit(leaves, 0, 3);
  // umbels: flat-topped sprays of tiny berries on red stalks
  const umbels = [[8, 13, 4.5], [20, 11, 5], [26, 18, 3.5], [13, 20, 3.5]];
  const stalk = hx('#b8404e');
  for (const [ux, uy, r] of umbels) {
    if (picked) {
      // bare red stalks left after picking
      for (const k of [-2, 0, 2]) line(p, ux, uy + 2, ux + k, uy - 1, stalk);
      continue;
    }
    // drooping cluster of tiny glossy berries; the red stalks peek out on top
    for (let y = Math.floor(uy - r * 0.45); y <= uy + r * 0.55; y++)
      for (let x = Math.floor(ux - r); x <= ux + r; x++) {
        const dy = y + 0.5 - uy;
        const d = Math.hypot((x + 0.5 - ux) / (r + 0.3), dy / (dy < 0 ? r * 0.45 + 0.5 : r * 0.55 + 0.5));
        if (d > 1) continue;
        const gap = (x + y * 2) % 3 === 0;
        let v = 0.55 - ((x + 0.5 - ux) / r) * 0.5 - (dy / r) * 0.6 + (hash(x, y, seed) - 0.5) * 0.3;
        p.set(x, y, gap ? BERRY.elder[0] : pick(BERRY.elder, v));
        if (!gap && hash(x, y, seed + 1) < 0.18 && v > 0.2) p.set(x, y, BERRY.elder[4]);
      }
    for (let x = Math.round(ux - r + 1); x < ux + r - 1; x += 2) p.set(x, Math.floor(uy - r * 0.45) - 1, stalk);
  }
  outline(p, { noBottom: true });
  return p;
}
function goldenberryBush(picked, frame) {
  const W = 28, H = 26, seed = 3607;
  const p = new Px(W, H);
  const R = mulberry(seed);
  const leaves = bushSprite(W, H, seed, LEAF_MAGIC, { n: 3, cy: 0.54, ry: 0.48, leaf: 2.6, bias: 0.6 });
  p.blit(leaves, 0, 0);
  // golden leaf veins catching the light
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (p.on(x, y) && hash(x, y, seed + 3) < 0.05) p.set(x, y, hx('#e8d070'));
  // physalis-style husk lanterns with a glowing berry inside
  const lanterns = picked ? [[9, 9]] : [[5, 6], [12, 3], [19, 7], [9, 12], [17, 13]];
  const glowing = ['..s..', '.hHh.', 'hHYHh', 'hYWYh', '.hYh.', '..h..'];
  const empty = ['..s..', '.h.h.', 'h...h', 'h.H.h', '.h.h.', '..h..'];
  for (const [x, y] of lanterns) stamp(p, picked ? empty : glowing, { s: '#5a6a2a', h: picked ? '#c8a870' : '#e89a2a', H: picked ? '#e8d0a0' : '#ffd060', Y: '#ffe680', W: '#ffffff' }, x, y);
  outline(p, { noBottom: true });
  if (!picked) {
    aura(p, frame ? 4 : 3, hx('#ffd860'), frame ? 0.6 : 0.4, (x, y) => p.get(x, y) === hx('#ffe680') || p.get(x, y) === 0xffffff, { hi: hx('#fff6c0') });
  }
  // twinkles
  const RT = mulberry(seed + 11 + frame);
  for (let k = 0; k < (picked ? 2 : 5); k++) {
    const x = Math.floor(1 + RT() * (W - 2)), y = Math.floor(1 + RT() * (H - 6));
    if (!p.any(x, y)) p.set(x, y, hx('#fff6c0'), 230);
  }
  return p;
}

// ===========================================================================
// Buildable plants
// ===========================================================================
// Sugar maple: big summer-green maple just starting to turn, with a tap and a
// lidded sap bucket hung on the trunk.
function sugarMaple() {
  const W = 66, H = 94;
  const p = mapleTree(W, H, 3701, P.leafGreen, P.mapleOrange);
  const cx = W / 2;
  const by = H - 22, bx = Math.round(cx - 3);
  // spout (tap) and a drop of sap
  stamp(p, ['kkK', '..K'], { k: '#5a5a66', K: '#a8aab8' }, bx + 2, by - 3);
  // bucket: tapered galvanised pail with a little red roof lid
  const lid = pals(['#5a1420', '#9a2228', '#d03a32', '#f06a4a']);
  for (let x = -1; x <= 9; x++) {
    const u = Math.abs(x - 4) / 5.5;
    const top = Math.round(u * 2);
    for (let y = top; y < 3; y++) p.set(bx + x - 1, by - 2 + y, lid[clamp(y === top ? 3 - (x > 4 ? 1 : 0) : x > 5 ? 0 : 1, 0, 3)]);
  }
  const metal = pals(['#3e4250', '#5e6474', '#868c9c', '#b0b6c2', '#dce0e8', '#ffffff']);
  for (let y = 0; y < 10; y++) {
    const w = 9 - Math.floor(y / 4);
    const x0 = bx - 1 + Math.floor((9 - w) / 2);
    for (let i = 0; i < w; i++) {
      const s = i / (w - 1);
      let v = 0.6 - s * 1.3 + (y === 0 ? 0.3 : 0) + (y === 3 || y === 7 ? -0.35 : 0);
      if (i === 1) v += 0.5; // specular stripe
      p.set(x0 + i, by + 1 + y, pick(metal, v));
    }
  }
  p.set(bx + 4, by + 11, hx('#2a2a34'));
  // amber sap drip falling into the bucket
  p.set(bx + 4, by - 1, hx('#f4b040'));
  // a few fallen leaves and a tiny maple seedling
  stamp(p, ['.a.a.', 'aAbAa', '.bAb.', '..s..'], { a: '#e0782a', A: '#f8a040', b: '#b8561e', s: '#6a3a26' }, Math.round(cx + 9), H - 4);
  stamp(p, ['.a.a.', 'aAbAa', '.bAb.', '..s..'], { a: '#c8342a', A: '#e8573a', b: '#9a2228', s: '#6a3a26' }, Math.round(cx - 15), H - 4);
  return p;
}
function appleTree(apples) {
  const W = 56, H = 72;
  const p = mapleTree(W, H, 3711, P.leafGreen, null);
  const R = mulberry(3712);
  const red = pals(['#4a0a14', '#9a1826', '#d8302e', '#ff6a4a', '#ffe0c8']);
  const yel = pals(['#5a3a08', '#a8701a', '#e8b030', '#ffe070', '#ffffff']);
  if (apples) {
    const pts = spotsIn(p, 10, R, [6, 6, W - 10, H * 0.66], 6);
    pts.forEach(([x, y], i) => fruit(p, x, y, 'apple', i % 5 === 3 ? yel : red));
    // windfalls in the grass
    fruit(p, Math.round(W / 2 + 7), H - 5, 'apple', red);
    fruit(p, Math.round(W / 2 - 12), H - 4, 'round3', red);
  } else {
    // picked clean: a couple of leaves drift down, one apple core in the grass
    stamp(p, ['.a.', 'aAb', '.b.'], { a: '#78a640', A: '#a6c85c', b: '#4a7a34' }, Math.round(W / 2 + 10), H - 4);
    stamp(p, ['.s.', 'cCc', '.C.', 'cCc'], { s: '#5a3a26', c: '#f4e0b0', C: '#c88a50' }, Math.round(W / 2 - 13), H - 5);
  }
  return p;
}

// Planter box (3/4 view) with soil and flowers.
const FLOWERS = {
  tulip: ['.a.a.', 'aAaAa', 'aAAAa', '.aAa.', '..g..', '.lg..', '..g..'],
  daisy: ['.w.w.', 'wWyWw', '.wyw.', 'w.w.w', '..g..', '..gl.', '..g..'],
  lupine: ['..a..', '.aA..', '.Aa..', 'aAa..', '.aA..', 'aAa..', '.g...', '.gl..'],
  marigold: ['.aAa.', 'aAyAa', 'AyYyA', '.aAa.', '..g..', '.lg..'],
  pansy: ['aa.aa', 'aAkAa', '.AyA.', '..g..', '.lg..'],
  cosmos: ['a...a', '.aAa.', 'aAyAa', '.aAa.', 'a.g.a', '..g..', '..gl.', '..g..'],
};
function flowerBed(W, H, seed, set) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const wood = pals(['#3a2220', '#5a3628', '#7e5032', '#a46e42', '#c48e58', '#deb07a']);
  const soil = pals(['#20141a', '#36221e', '#4e3226', '#684630']);
  const frontH = 7, topH = 5;
  const y0 = H - frontH - topH; // top of the back rim
  // back rim, soil, front rim, front planks
  for (let x = 1; x < W - 1; x++) {
    p.set(x, y0, pick(wood, 0.5));
    p.set(x, y0 + 1, pick(wood, -0.2));
    for (let y = y0 + 2; y < y0 + topH; y++) p.set(x, y, pick(soil, 0.2 - (y - y0 - 2) * 0.3 + (hash(x, y, seed) - 0.5) * 0.8));
  }
  for (let x = 0; x < W; x++) {
    p.set(x, y0 + topH, pick(wood, 0.95));
    for (let y = y0 + topH + 1; y < H; y++) {
      const plank = Math.floor((y - y0 - topH - 1) / 3);
      const seam = (y - y0 - topH - 1) % 3 === 2;
      let v = 0.35 - plank * 0.25 - (seam ? 0.6 : 0) + (hash(x >> 2, y, seed) - 0.5) * 0.25 - (x / W) * 0.3;
      if (x < 2 || x >= W - 2) v += 0.25; // corner posts
      if (H - 1 - y < 1) v -= 0.4;
      p.set(x, y, pick(wood, v));
    }
  }
  // nails on the corner posts
  for (const x of [0, W - 2]) { p.set(x + 1, y0 + topH + 2, hx('#c8ccd4')); p.set(x + 1, y0 + topH + 5, hx('#c8ccd4')); }
  for (const x of [0, W - 1]) for (let y = y0; y <= y0 + topH; y++) p.set(x, y, pick(wood, x === 0 ? 0.4 : -0.3));
  // flowers: two rows in the soil, back row first
  const stem = { g: '#3e7236', l: '#6fa84a', G: '#2a4f2c' };
  const spots = [];
  const n = Math.floor((W - 4) / 4.6);
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < n - row; i++) spots.push([3 + (i + row * 0.5) * ((W - 6) / (n - 0.5)) + (R() - 0.5), y0 + 2 + row * 2]);
  spots.forEach(([x, y], i) => {
    const [shape, pal] = set[i % set.length];
    const rows = FLOWERS[shape];
    stamp(p, rows, { ...stem, ...pal }, Math.round(x - 2), Math.round(y - rows.length + 3));
  });
  outline(p, { noBottom: true });
  // a watering can? no - a tiny snail on the rim and a dew drop
  stamp(p, ['.s.', 'sSk'], { s: '#c08040', S: '#e8b070', k: '#d8c4a4' }, W - 7, y0 + topH - 1);
  return p;
}
const FB_PAL = {
  red: { a: '#e8343a', A: '#a81e30', y: '#ffe060', Y: '#fff4b0' },
  yellow: { a: '#ffd23a', A: '#d8961e', y: '#fff4b0', Y: '#ffffff' },
  white: { w: '#e4e6f0', W: '#ffffff', y: '#ffd23a' },
  purple: { a: '#a07ae8', A: '#6a48b8' },
  pink: { a: '#ff8ac0', A: '#c84a8a', y: '#ffe060' },
  orange: { a: '#ff9a2a', A: '#d0601a', y: '#ffd23a', Y: '#fff08a' },
  violet: { a: '#7a5ad8', A: '#4a3498', k: '#2a1a3a', y: '#ffd23a' },
  blue: { a: '#7aa8ff', A: '#3a64c8' },
};

// Kelp: a wavy stipe with ribbon blades and gas bladders, 2 sway frames.
const KELP = pals(['#14201a', '#1e3020', '#2c4424', '#405a28', '#58702c', '#748632', '#94a03e', '#b8bc56']);
function kelp(W, H, seed, frame) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const cx = W / 2;
  const ph = frame * Math.PI * 0.9;
  const sx = (y) => cx + Math.sin(y * 0.12 + ph + seed) * 1.6 * (1 - y / H) + Math.sin(y * 0.05 + ph) * 2.2 * (1 - y / H);
  // holdfast
  for (const [dx, dy] of [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, -1], [0, -1], [1, -1], [-3, 0], [3, 0]]) p.set(Math.round(cx + dx), H - 1 + dy, pick(KELP, -0.3 - dx * 0.15));
  // stipe
  for (let y = H - 2; y > 3; y--) {
    const x = sx(y);
    p.set(Math.round(x - 0.5), y, KELP[3]);
    p.set(Math.round(x + 0.5), y, KELP[1]);
  }
  // blades: long wavy ribbons rising to alternate sides
  const n = Math.max(4, Math.round(H / 8));
  for (let i = 0; i < n; i++) {
    const y0 = Math.round(H - 6 - (i / n) * (H - 12));
    const dir = i % 2 ? 1 : -1;
    const len = 9 + R() * 8 + (1 - i / n) * 6;
    const bx = sx(y0);
    // gas bladder at the base of each blade
    p.set(Math.round(bx + dir), y0, KELP[7]);
    p.set(Math.round(bx + dir * 2), y0, KELP[5]);
    p.set(Math.round(bx + dir), y0 + 1, KELP[4]);
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const x = bx + dir * (2 + Math.sin(t * Math.PI * 0.6) * W * 0.36) + Math.sin(k * 0.6 + ph + i) * 0.8;
      const y = y0 - k;
      const w = Math.max(1, Math.round(3.4 * Math.sin(Math.min(1, t * 1.3 + 0.2) * Math.PI)));
      for (let j = 0; j < w; j++) {
        const X = Math.round(x + (dir > 0 ? j : -j));
        const v = 0.55 - j * 0.45 + (dir < 0 ? 0.15 : -0.15) + t * 0.2 + ((k + j * 2) % 5 === 0 ? -0.3 : 0);
        p.set(X, y, pick(KELP, v));
      }
    }
  }
  // top frond
  for (let k = 0; k < 6; k++) p.set(Math.round(sx(3) + Math.sin(k + ph) * 1.2), 3 - Math.min(3, k >> 1), KELP[5 + (k & 1)]);
  outline(p, { noBottom: true, k: 0.5, lit: 0.45 });
  return p;
}

function plantPatch(W, H, list, o = {}) {
  const p = new Px(W, H);
  // murky shallows / mud under the clump
  if (o.water) ellipse(p, W / 2, H - 2, W / 2 - 1, 2.6, (x, y, nx, ny) => (ny < -0.2 ? pick(WATER.deep, 0.4 - nx * 0.3) : pick(WATER.deep, -0.2 + nx * -0.2 + ((x + y) % 5 === 0 ? 0.6 : 0))));
  for (const [rows, pal, x, flipX] of list) place(p, art(rows, pal, { k: 0.52 }), x, H - (o.water ? 2 : 0), flipX);
  if (o.stake) {
    // a little hand-painted marker stake
    stamp(p, ['WWWWW', 'WkWkW', 'WWWWW', '..s..', '..s..', '..s..', '..S..'], { W: '#e8d8b8', k: '#7a5a3a', s: '#a8744e', S: '#6a4430' }, W - 8, H - 12);
  }
  return p;
}

// Tree with a wild honeycomb hive hanging from a limb, and bees.
function beehiveTree(frame) {
  const W = 54, H = 76;
  const p = mapleTree(W, H, 3721, P.leafGreen, null);
  const hx0 = Math.round(W / 2 + 9), hy0 = Math.round(H * 0.6);
  const comb = pals(['#4a2a10', '#7a4a18', '#b0741e', '#dca030', '#f4c850', '#fff0a0']);
  // branch the hive hangs from
  limb(p, [[W / 2 + 2, hy0 - 4], [hx0 + 2, hy0 - 3], [hx0 + 6, hy0 - 6]], 2.4, 1.4, P.barkMaple.slice(0, 4), 3722);
  // teardrop hive with horizontal comb ridges
  for (let y = 0; y < 13; y++) {
    const t = y / 12;
    const w = Math.sin(Math.min(1, t * 1.15 + 0.12) * Math.PI) * 4.6 + 0.6;
    for (let x = Math.floor(-w); x <= w; x++) {
      const s = (x + w) / (2 * w);
      let v = 0.6 - s * 1.2 - (y % 3 === 0 ? 0.35 : 0) + (y === 0 ? -0.3 : 0);
      p.set(hx0 + x, hy0 - 1 + y, pick(comb, v));
    }
  }
  // entrance and honey drip
  stamp(p, ['kk', 'kk'], { k: '#1e1210' }, hx0 - 1, hy0 + 6);
  p.set(hx0 + 1, hy0 + 12, comb[4]); p.set(hx0 + 1, hy0 + 13, comb[3]);
  if (frame) p.set(hx0 + 1, hy0 + 14, comb[5]);
  // bees buzzing about
  const R = mulberry(3723 + frame * 5);
  for (let k = 0; k < 4; k++) {
    const x = Math.round(hx0 - 8 + R() * 18), y = Math.round(hy0 - 4 + R() * 18);
    stamp(p, ['.v', 'yk'], { v: ['#e8f6ff', 210], y: '#ffd23a', k: '#2a2024' }, x, y);
  }
  // a honey pot left at the foot
  stamp(p, ['.kkk.', 'hYYyh', 'hYyyh', '.hhh.'], { k: '#8a5a3a', h: '#b07428', Y: '#ffd860', y: '#e8a030' }, Math.round(W / 2 - 13), H - 4);
  return p;
}
function stakedSapling() {
  const W = 24, H = 38;
  const p = new Px(W, H);
  const cx = W / 2 + 2;
  // mulch ring
  ellipse(p, cx, H - 1.5, 8, 2.2, (x, y, nx, ny) => pick(pals(['#2a1a18', '#46302a', '#6a4a36', '#8a6444']), 0.3 - ny - nx * 0.3 + (hash(x, y, 9) - 0.5) * 1.2));
  // stake and twine tie
  const sk = Math.round(cx - 4);
  for (let y = 12; y < H - 1; y++) { p.set(sk, y, hx('#c89a62')); p.set(sk + 1, y, hx('#8a6040')); }
  p.set(sk, 11, hx('#e0b880')); p.set(sk + 1, 11, hx('#a87a50'));
  const stem = pals(['#3a2826', '#5a4036', '#7a5a46']);
  limb(p, [[cx, H - 2], [cx - 0.3, H - 14], [cx + 0.5, H - 24]], 2.2, 1.2, stem, 3731);
  limb(p, [[cx, H - 16], [cx - 4, H - 20]], 1, 1, stem, 3732);
  limb(p, [[cx, H - 20], [cx + 4, H - 24]], 1, 1, stem, 3733);
  line(p, sk + 2, H - 15, cx - 1, H - 15, hx('#e8d8a8'));
  line(p, sk + 2, H - 14, cx - 1, H - 14, hx('#b8a070'));
  canopy(p, [
    { x: cx - 4, y: H - 22, r: 4.2 }, { x: cx + 4, y: H - 25, r: 4.4 }, { x: cx, y: H - 30, r: 5.2 }, { x: cx + 0.5, y: H - 24.5, r: 3.6, front: 3 },
  ], { pal: LEAF_FRESH, seed: 3734, leaf: 2.4, loose: 0.45, jag: 0.22, bump: 3, bias: 0.4, local: 0.8, texAmt: 0.7, rim: 1 });
  outline(p, { noBottom: true });
  // a ladybug on the stake
  stamp(p, ['rk', 'kr'], { r: '#ff3a2e', k: '#1e1a20' }, sk - 1, 20);
  return p;
}
function pumpkinPatch() {
  const W = 38, H = 22;
  const p = new Px(W, H);
  const R = mulberry(3741);
  const vine = hx('#4a6a2a');
  // vines curling over the ground
  for (let k = 0; k < 3; k++) {
    let x = 4 + k * 12, y = H - 2;
    for (let i = 0; i < 14; i++) { p.set(Math.round(x), Math.round(y), vine); x += 0.9; y = H - 2 - Math.abs(Math.sin(i * 0.6 + k)) * 2; }
  }
  // big leaves behind
  const cls = [[6, H - 9, 4.2], [16, H - 11, 4.6], [27, H - 10, 4.4], [33, H - 7, 3.4], [11, H - 6, 3.6], [22, H - 6, 3.4]].map(([x, y, r]) => ({ x, y, r, ry: r * 0.8 }));
  canopy(p, cls, { pal: LEAF_FRESH, seed: 3742, leaf: 2.6, loose: 0.3, jag: 0.34, bump: 2.2, bias: 0.4, local: 0.85, rim: 1.1 });
  const orange = pals(['#4a1a10', '#8a3618', '#c8601e', '#f08a2a', '#ffb850', '#ffe090']);
  const green = pals(['#1e2a14', '#344a1e', '#4e6a28', '#6e8a34', '#94aa4a', '#c0cc70']);
  const pumpkin = (cx, cy, rx, ry, pal) => {
    ellipse(p, cx, cy, rx, ry, (x, y, nx, ny) => {
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let v = (nx * LX + ny * LY + nz * LZ) * 1.5 - 0.35;
      const rib = Math.abs(Math.sin((Math.asin(clamp(nx, -1, 1)) / Math.PI) * 5 * Math.PI));
      if (rib < 0.3) v -= 0.4;
      return pick(pal, v);
    });
    p.set(Math.round(cx), Math.round(cy - ry), hx('#5a4a2a'));
    p.set(Math.round(cx), Math.round(cy - ry) - 1, hx('#7a6a3a'));
    p.set(Math.round(cx) + 1, Math.round(cy - ry) - 2, hx('#7a6a3a'));
  };
  pumpkin(12, H - 5, 6, 4.4, orange);
  pumpkin(26, H - 4.5, 5, 3.8, orange);
  pumpkin(19, H - 3, 3, 2.4, green);
  outline(p, { noBottom: true });
  for (const [x, y] of spotsIn(p, 1, R, [8, H - 9, 16, H - 5], 4)) dew(p, x, y);
  return p;
}
function sunflower() {
  const W = 20, H = 46;
  const p = new Px(W, H);
  const cx = W / 2;
  const stem = pals(['#1e3a1e', '#2e5428', '#447432', '#5e9440', '#80b054']);
  limb(p, [[cx, H - 1], [cx - 0.5, H - 18], [cx + 0.5, 14]], 2.6, 2, stem, 3751);
  // leaves: big hearts on alternate sides
  canopy(p, [{ x: cx - 4.5, y: H - 12, r: 3.6, ry: 2.6 }, { x: cx + 4.5, y: H - 20, r: 3.6, ry: 2.6 }, { x: cx - 4, y: H - 27, r: 3, ry: 2.2 }],
    { pal: LEAF_FRESH, seed: 3752, leaf: 2.2, loose: 0.2, jag: 0.2, bump: 3, bias: 0.4, local: 0.85, rim: 1 });
  // head: petal ring and seed disk with a spiral pattern
  const hy = 10;
  const petals = pals(['#8a4a10', '#d07a18', '#f4aa22', '#ffd23a', '#ffec7a', '#fffac0']);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    for (let r = 3.5; r < 8.2; r += 0.5) {
      const w = Math.sin(((r - 3.5) / 4.7) * Math.PI) * 0.22;
      for (const da of [-w, 0, w]) {
        const x = cx + Math.cos(a + da) * r, y = hy + Math.sin(a + da) * r * 0.92;
        const v = 0.35 - Math.cos(a) * 0.35 - Math.sin(a) * 0.45 + (r > 7 ? 0.2 : 0) - (k & 1) * 0.25;
        p.set(Math.floor(x), Math.floor(y), pick(petals, v));
      }
    }
  }
  const disk = pals(['#1e100c', '#3a2014', '#5a341c', '#7a4c24', '#9a6a30']);
  ellipse(p, cx, hy, 4, 3.7, (x, y, nx, ny) => {
    const a = Math.atan2(ny, nx), d = Math.hypot(nx, ny);
    const spiral = Math.sin(a * 5 + d * 9) > 0.3;
    return pick(disk, 0.2 - nx * 0.4 - ny * 0.5 + (spiral ? 0.35 : -0.15) - d * 0.3);
  });
  outline(p, { noBottom: true });
  // a bumblebee visiting
  stamp(p, ['.vv', 'yky', 'kyk'], { v: ['#e8f6ff', 210], y: '#ffd23a', k: '#2a2024' }, Math.round(cx + 4), hy - 9);
  return p;
}

// ===========================================================================
// v3 critters: heron, turtle, beaver, owl, big firefly
// ===========================================================================
const HERON_PAL = { k: '#1e1a24', w: '#f4f2ec', g: '#b8bcc8', s: '#5a5e70', b: '#6e86a8', B: '#4a5e80', u: '#c8ccd6', r: '#9a5a3a', l: '#8a7a4a', L: '#5a4e30',
  y: '#f2c838', Y: '#b08a20', e: '#141018', f: '#dce8f0', F: '#7a98a8', o: '#e8f6ff' };
const HERON_BODY = [
  '.......bbbbbggg...........',
  '.....bbBbbbbbgg...........',
  '....bbBBbbbbbbu...........',
  '...bbBBBbbbbbbu...........',
  '..bbBBBBbbbbbbu...........',
  '..bBBBBbbbbbbuu...........',
  '.BBBBBbbbbbbbuu...........',
  '.BBBBbbbbbbbuu............',
  'BBBbbbbbbbbuuu............',
  'BBbbbBbbbbuuu.............',
  '.B..BBbbbrruu.............',
  '.....BBBrrr...............',
];
const HERON_LEGS = [
  '........rl.l..............',
  '........l..l..............',
  '........l..l..............',
  '........l..l..............',
  '........l..l..............',
  '........L..l..............',
  '........l..L..............',
  '........l..l..............',
  '........l..l..............',
  '........l..l..............',
  '........L..l..............',
  '........l..l..............',
  '.......ll.ll..............',
  '......l.ll.ll.............',
];
const HERON_NECK = [
  '...........gwwwk..........',
  '...........ggg............',
  '..........sgg.............',
  '.........sgg..............',
  '.........sgg..............',
  '.........gsg..............',
  '..........gsg.............',
  '...........gsg............',
  '...........ggsg...........',
  '...........gggsg..........',
];
const HERON_HEAD = [
  '..........kkk.............',
  '.......kkkkwwkk...........',
  '.....kk...wwwwekyyy.......',
  '..........wwwwwyyyyyY.....',
];
const HERON = {
  idle0: [...HERON_HEAD, ...HERON_NECK, ...HERON_BODY, ...HERON_LEGS],
  idle1: ['..........................', ...HERON_HEAD.map((r) => r.replace('e', 'w')), ...HERON_NECK.slice(0, 9), ...HERON_BODY, ...HERON_LEGS],
  fish0: [
    ...Array(6).fill('..........................'),
    '...........kkk............',
    '........kkkkwwkk..........',
    '...........wwwwekyyy......',
    '...........wwwwwyyyyY.....',
    '............gwwk..........',
    '...........sggg...........',
    '...........sgg............',
    '...........ggsg...........',
    ...HERON_BODY, ...HERON_LEGS],
  fish1: [
    ...Array(14).fill('..........................'),
    '.......bbbbbgg............',
    '.....bbBbbbbbsgg..........',
    '....bbBBbbbbbbusgg........',
    '...bbBBBbbbbbbu.gsgg......',
    '..bbBBBBbbbbbbu...gsgg....',
    '..bBBBBbbbbbbuu.....gsg...',
    '.BBBBBbbbbbbbuu......gsg..',
    '.BBBBbbbbbbbuu.......kgsk.',
    'BBBbbbbbbbbuuu.......kwwk.',
    'BBbbbBbbbbuuu........wwew.',
    '.B..BBbbbrruu........wwyy.',
    '.....BBBrrr...........yy..',
    '........rl.l..........yy..',
    '........l..l..........Y...',
    '........l..l.........o.o..',
    '........l..l........o...o.',
    ...HERON_LEGS.slice(4)],
  fish2: [
    '..........kkk.............',
    '.......kkkkwwkk.....f.....',
    '.....kk...wwwwekyyyfFf....',
    '..........wwwwwyyyyyFf....',
    '...........gwwwk...fFf....',
    '...........ggg......F.....',
    ...HERON_NECK.slice(2), ...HERON_BODY, ...HERON_LEGS],
};

const TURTLE_PAL = { ...WATERLINE, s: '#3e4a2a', S: '#2a3420', y: '#a8a050', r: '#d0402a', R: '#8a2a20', h: '#2e4a2a', Y: '#e8d050', e: '#141018', l: '#2e4a2a' };
const TURTLE = {
  swim0: [
    '.....sSSSs..........',
    '...sSySSySSs........',
    '..sSSSySSSySs....hY.',
    '.rRrRrRrRrRrRr..hYhhe',
    '~~-~~~-~~~-~~~-~hhYh~',
    '..-~~..-~~...-~~-~..',
  ],
  swim1: [
    '.....sSSSs..........',
    '...sSySSySSs........',
    '..sSSSySSSySs.......',
    '.rRrRrRrRrRrRr...hYh.',
    '~-~~~-~~~-~~~-~~hYhhe',
    '.-~~..-~~...-~~..-~..',
  ],
  sun0: [
    '......sSSSs..........',
    '....sSySSySSs........',
    '...sSSSySSSySs...hY..',
    '..sSSySSSSySSSs.hYhhe',
    '..rRrRrRrRrRrRr.hhYh.',
    '.YyYyYyYyYyYyYyhh....',
    '..ll.........ll......',
    '.ll...........ll.....',
  ],
  sun1: [
    '......sSSSs......hY..',
    '....sSySSySSs...hYhhe',
    '...sSSSySSSySs.hhYh..',
    '..sSSySSSSySSSshh....',
    '..rRrRrRrRrRrRr......',
    '.YyYyYyYyYyYyYy......',
    '..ll.........ll......',
    '.ll...........ll.....',
  ],
};
const BEAVER_PAL = { ...WATERLINE, n: '#5a3a24', N: '#8a5a36', b: '#4a3020', B: '#7a5236', k: '#1a1214', e: '#141018' };
const BEAVER = {
  swim0: [
    '..............nn......',
    '.............nNNnn....',
    '...bbbb.....nNNeNNnk..',
    '..bBBBBBb..nNNNNNNNkk.',
    '~~bBBBBBb~~nNNNNNNnn~~',
    '~-~~-~~-~~-~~-~~-~~-~~',
    '.-....-~~...-~~.-....-',
  ],
  swim1: [
    '......................',
    '..............nn......',
    '...bbbb......nNNnn....',
    '..bBBBBBb...nNNeNNnk..',
    '~~bBBBBBb~~nNNNNNNNkk~',
    '~-~~-~~-~~-~~-~~-~~-~~',
    '..-...-~~...-~~.-...-.',
  ],
};
const OWL_PAL = { b: '#7a5a3e', B: '#4e3828', c: '#eadcc0', C: '#b89c78', F: '#5a4030', f: '#cfb088', E: '#ffcc30', e: '#141018', w: '#ffffff', k: '#e0c870', K: '#9a8040', t: '#d8b050' };
const OWL_BODY = [
  'bBcbCcbCcbCbBb',
  'bBbCcbCcbCcBBb',
  'bBcbCcbCcbCbBb',
  'bBbCcbCcbCcBBb',
  '.BcbCcbCcbCbB.',
  '.BBCcbCcbCcBB.',
  '..BBbCbCbCBB..',
  '...tt....tt...',
];
const owlFace = (eyes) => [
  'bbFFFFbbFFFFbb',
  ...eyes,
  'bbFFFFfKFFFFbb',
  'bbbFFFFFFFFbbb',
];
const OWL_OPEN = ['bFfEEfFFfEEfFb', 'bFEweEffEweEFb', 'bFEeeEffEeeEFb', 'bFfEEfkkfEEfFb'];
const OWL = {
  idle0: ['.B..........B.', '.Bb........bB.', '.bbbbbbbbbbbb.', ...owlFace(OWL_OPEN), ...OWL_BODY],
  idle1: ['..............', 'BB..........BB', '.bbbbbbbbbbbb.', ...owlFace(['bFfEEfFFfEEfFb', 'bFEewEffEewEFb', 'bFEeeEffEeeEFb', 'bFfEEfkkfEEfFb']), ...OWL_BODY],
  half: ['.B..........B.', '.Bb........bB.', '.bbbbbbbbbbbb.', ...owlFace(['bFfBBfFFfBBfFb', 'bFBBBBffBBBBFb', 'bFEeeEffEeeEFb', 'bFfEEfkkfEEfFb']), ...OWL_BODY],
  shut: ['.B..........B.', '.Bb........bB.', '.bbbbbbbbbbbb.', ...owlFace(['bFffffFFffffFb', 'bFBBBBffBBBBFb', 'bFfffffffffffb', 'bFffffkkffffFb']), ...OWL_BODY],
};
const BIGFLY = {
  off: [
    '..vvv.......',
    '.vVVvv......',
    'vVVVVvv.....',
    '.vvkkkkkhh..',
    '.ggkKkKkkhe.',
    'gggkkkkkk...',
    '.gg.l.l.l...',
  ],
};
BIGFLY.on = BIGFLY.off.map((r) => r.replace(/g/g, 'Y'));
function bigFireflyFrames() {
  const pal = { ...GLASS(150), k: '#3a3024', K: '#5a4a34', h: '#e04a3a', e: '#141018', g: '#8a9a4a', Y: '#f4ff7a', l: '#2a2420' };
  return ['off', 'on'].map((n, i) => {
    const src = art(BIGFLY[n], pal, { ground: false, k: 0.6, lit: 0.5, auto: 0.5, noShade: 'vVkKeYl' });
    const q = new Px(src.w + 8, src.h + 8);
    q.blit(src, 4, 4);
    if (i) {
      aura(q, 4.5, hx('#d8ff70'), 0.7, (x, y) => q.get(x, y) === hx('#f4ff7a'), { hi: hx('#f8ffc0') });
      // brightest core pixel
      for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) if (q.on(x, y) && q.get(x, y) === hx('#f4ff7a') && hash(x, y, 3) < 0.4) q.set(x, y, hx('#ffffe0'));
    }
    return q;
  });
}

// ===========================================================================
// Registry
// ===========================================================================
// name -> () => Array<{ px: Px, ax, ay }>
const REG = {};
const ground = (px) => ({ px, ax: px.w / 2, ay: px.h });
const centre = (px) => ({ px, ax: px.w / 2, ay: px.h / 2 });
function reg(name, fn) {
  REG[name] = fn;
}
// Alias: `name` shows exactly the frames of `target` (registered earlier);
// the atlas stores them once and both names point at the same rects.
const ALIAS = {};
function alias(name, target) {
  ALIAS[name] = target;
  REG[name] = () => REG[target]();
}

// --- trees ---
reg('spruce_0', () => [ground(coniferTree(40, 100, 11))]);
reg('spruce_1', () => [ground(coniferTree(46, 112, 23, { tiers: 11, cones: 4 }))]);
reg('spruce_2', () => [ground(coniferTree(36, 90, 37, { tiers: 9, trunkH: 6 }))]);
reg('spruce_snow_0', () => [ground(coniferTree(42, 100, 41, { snow: true }))]);
reg('spruce_snow_1', () => [ground(coniferTree(38, 92, 53, { snow: true, tiers: 9 }))]);

reg('maple_red', () => [ground(mapleTree(54, 76, 101, P.mapleRed, P.mapleScarlet))]);
reg('maple_orange', () => [ground(mapleTree(54, 76, 202, P.mapleOrange, P.mapleRed))]);
reg('maple_scarlet', () => [ground(mapleTree(52, 74, 303, P.mapleScarlet, P.mapleRed))]);

reg('pine_0', () => [ground(redPine(46, 106, 404))]);
reg('pine_1', () => [ground(whitePine(62, 110, 505, 1))]);

reg('birch_0', () => [ground(birchTree(40, 88, 606))]);
reg('birch_1', () => [ground(birchTree(46, 84, 707, true))]);
reg('aspen_0', () => [ground(aspenTree(36, 90, 808))]);
reg('snag', () => [ground(snagTree(30, 84, 909))]);
reg('sapling', () => [ground(sapling(18, 30, 1001))]);

// --- bushes ---
const BUSH_A = pals(['#15271f', '#1c3826', '#264c2c', '#316132', '#3e7738', '#518c40', '#6aa24a', '#8cba5a', '#b5d276']);
const BUSH_B = pals(['#1a2a1e', '#233d24', '#2e5229', '#3b672e', '#4b7c33', '#61903b', '#7ca646', '#9cbc58', '#c2d67a']);
const BUSH_Y = pals(['#3a2c14', '#5a4418', '#7e601c', '#a37e22', '#c49a2a', '#dcb638', '#ecd058', '#f8e88a']);
reg('bush_0', () => [ground(outline(bushSprite(24, 18, 1101, BUSH_A, { n: 3 }), { noBottom: true }))]);
reg('bush_1', () => [ground(outline(bushSprite(30, 19, 1202, BUSH_B, { n: 4, alt: BUSH_Y, altP: 0.2, r: 0.36 }), { noBottom: true }))]);
reg('blueberry', () => [ground(blueberryBush(24, 16, 1303, 5))]);
reg('blueberry_picked', () => [ground(blueberryBush(24, 16, 1303, 1))]);
reg('rose', () => [ground(roseBush(24, 19, 1404))]);
reg('sumac', () => [ground(sumacBush())]);

// --- ground cover ---
for (const n of ['tuft_0', 'tuft_1', 'tuft_2', 'tuft_3', 'tallgrass_0', 'tallgrass_1', 'clover', 'fern_0', 'fern_1', 'mushroom_red', 'mushroom_brown', 'fireweed', 'lupine_purple', 'lupine_blue', 'lupine_pink', 'daisy', 'susan', 'trillium', 'aster', 'dandelion'])
  reg(n, () => GC[n]().map(ground));

// --- rocks & wood ---
reg('boulder_0', () => [ground(rockSprite(28, 22, 1901, { lichen: 3 }))]);
reg('boulder_1', () => [ground(rockSprite(30, 20, 1902, { lichen: 2, moss: 2.5 }))]);
reg('rock_0', () => [ground(rockSprite(14, 10, 1903, { lichen: 1, facets: 4 }))]);
reg('rock_1', () => [ground(rockSprite(12, 9, 1904, { lichen: 0, facets: 3 }))]);
reg('rock_2', () => [ground(rockSprite(15, 11, 1905, { lichen: 1, facets: 4, moss: 1.5 }))]);
reg('mossrock', () => [ground(rockSprite(24, 18, 1906, { lichen: 1, moss: 5 }))]);
PEBBLES.forEach((rows, i) => reg('pebble_' + i, () => [ground(art(rows, PEB_PAL[i], { k: 0.5 }))]));
reg('log_0', () => [ground(logSprite(30, 10, 2001, { moss: true, shroom: true }))]);
reg('log_1', () => [ground(logSprite(28, 9, 2002, { birch: true }))]);
reg('stump', () => [ground(stumpSprite(18, 14, 2003))]);
reg('pinecone', () => WOODS.pinecone().map(ground));
reg('leaf_red', () => leafSprite(pals(['#c8342a', '#e8573a', '#9a2228', '#6a3a26'])).map(ground));
reg('leaf_orange', () => leafSprite(pals(['#e0782a', '#f8a040', '#b8561e', '#6a3a26'])).map(ground));
reg('leaf_yellow', () => leafSprite(pals(['#e8b830', '#ffd85a', '#c08a20', '#6a4a26'])).map(ground));
reg('leaf_brown', () => leafSprite(pals(['#8a5a34', '#a8744a', '#6a4028', '#4a3020'])).map(ground));
reg('driftwood', () => WOODS.driftwood().map(ground));

// --- water plants ---
reg('cattail_0', () => [ground(art(WATER_PLANTS.cattail_0, CAT, { k: 0.52 }))]);
reg('cattail_1', () => [ground(art(WATER_PLANTS.cattail_1, CAT, { k: 0.52 }))]);
reg('reeds_0', () => [ground(art(WATER_PLANTS.reeds_0, REED, { k: 0.52 }))]);
reg('reeds_1', () => [ground(art(WATER_PLANTS.reeds_1, REED, { k: 0.52 }))]);
reg('lilypad_0', () => [centre(art(WATER_PLANTS.lilypad_0, LILY, { ground: false }))]);
reg('lilypad_1', () => [centre(art(WATER_PLANTS.lilypad_1, LILY, { ground: false }))]);
reg('lilyflower_pink', () => [ground(art(WATER_PLANTS.lilyflower_pink, LILYF_P))]);
reg('lilyflower_white', () => [ground(art(WATER_PLANTS.lilyflower_white, LILYF_W))]);
reg('duckweed', () => [centre(duckweed(20, 10, 2101))]);
reg('wildrice', () => [ground(art(WATER_PLANTS.wildrice, { ...REED, h: '#f0d890', H: '#c8a45a', y: '#c8b060', Y: '#9a8a48' }, { k: 0.5 }))]);

// --- birds ---
for (const [b, pal] of Object.entries(BIRDS)) {
  reg(b + '_idle', () => birdFrames(SONG, ['idle0', 'idle1'], pal).map(ground));
  reg(b + '_hop', () => birdFrames(SONG, ['hop0', 'hop1'], pal).map(ground));
  reg(b + '_peck', () => birdFrames(SONG, ['peck0', 'peck1'], pal).map(ground));
  reg(b + '_fly', () => birdFrames(SONG, ['fly0', 'fly1', 'fly2', 'fly3'], pal).map(centre));
}

reg('crow_idle', () => birdFrames(CROW, ['idle0', 'idle1'], BIRDS.crow).map(ground));
reg('crow_hop', () => birdFrames(CROW, ['hop0', 'hop1'], BIRDS.crow).map(ground));
reg('crow_peck', () => birdFrames(CROW, ['peck0', 'peck1'], BIRDS.crow).map(ground));
reg('crow_fly', () => birdFrames(CROW, ['fly0', 'fly1', 'fly2', 'fly3'], BIRDS.crow).map(centre));
const wb = (tpl, names, pal, o = {}) => names.map((n) => art(tpl[n], pal, { ground: o.ground ?? true, auto: o.auto ?? 0.8, noShade: '~-e' + (o.noShade || ''), k: 0.62 }));
reg('goose_swim', () => wb(GOOSE, ['swim0', 'swim1'], GOOSE_PAL).map(ground));
reg('goose_fly', () => wb(GOOSE, ['fly0', 'fly1', 'fly2', 'fly3'], GOOSE_PAL, { ground: false }).map(centre));
reg('loon_swim', () => wb(LOON, ['swim0', 'swim1'], LOON_PAL, { auto: 0.5 }).map(ground));
reg('loon_dive', () => wb(LOON, ['dive0', 'dive1', 'dive2'], LOON_PAL, { auto: 0.5 }).map(ground));
reg('loon_call', () => wb(LOON, ['call0', 'call1'], LOON_PAL, { auto: 0.5 }).map(ground));
reg('mallard_swim', () => wb(MALLARD, ['swim0', 'swim1'], MALLARD_PAL).map(ground));
reg('mallard_fly', () => wb(MALLARD, ['fly0', 'fly1', 'fly2'], MALLARD_PAL, { ground: false }).map(centre));
reg('hummingbird_hover', () => HUM_FRAMES().map(centre));
function HUM_FRAMES() {
  return ['hover0', 'hover1'].map((n) => art(HUM[n], HUM_PAL, { ground: false, auto: 0.7, noShade: 'vVek', k: 0.55, lit: 0.45 }));
}

// --- bugs & critters ---
reg('dragonfly', () => bugFrames('dragonfly').map(centre));
reg('monarch', () => bugFrames('monarch').map(centre));
reg('bluebutterfly', () => bugFrames('bluebutterfly', 'monarch').map(centre));
reg('bee', () => bugFrames('bee').map(centre));
reg('firefly', () => fireflyFrames().map(centre));
reg('ladybug', () => bugFrames('ladybug').map(ground));
reg('moth', () => bugFrames('moth').map(centre));
const critter = (tpl, names, pal) => names.map((n) => ground(art(tpl[n], pal, { auto: 0.8, noShade: 'eEkn', k: 0.62 })));
reg('frog_idle', () => critter(FROG, ['idle0', 'idle1'], FROG_PAL));
reg('frog_croak', () => critter(FROG, ['croak0', 'croak1'], FROG_PAL));
reg('frog_jump', () => critter(FROG, ['jump0', 'jump1'], FROG_PAL));
reg('squirrel_idle', () => critter(SQUIRREL, ['idle0', 'idle1'], SQ_PAL));
reg('squirrel_run', () => critter(SQUIRREL, ['run0', 'run1'], SQ_PAL));


// ===========================================================================
// v3: mushroom forest
// ===========================================================================
reg('giantshroom_red_0', () => [ground(giantFlyAgaric(78, 108, 3101, { spots: 22, spotR: 2.1, gap: 5, dew: 3, ladybug: true }))]);
reg('giantshroom_red_1', () => [ground(giantFlyAgaric(60, 84, 3102, { spots: 15, spotR: 1.9, gap: 4.6, capH: 18, snail: true, shift: 0 }))]);
reg('giantshroom_brown_0', () => [ground(giantBolete(76, 96, 3103))]);
reg('giantshroom_glow_0', () => [0, 1].map((f) => ground(giantGlowShroom(66, 120, 3104, f === 1))));
reg('giantshroom_glow_1', () => [0, 1].map((f) => ground(giantGlowShroom(52, 76, 3105, f === 1, { spots: 6, capF: 0.32 }))));
reg('shroomcluster_0', () => [ground(shroomCluster(24, 18, 3111, [
  [0.3, 9, 3.6, SHROOM.red, SHROOM.stem, hx('#fff6e8')], [0.62, 6, 2.8, SHROOM.red, SHROOM.stem, hx('#fff6e8')], [0.8, 3.5, 2, SHROOM_MIX.tan, SHROOM.stem]]))]);
reg('shroomcluster_1', () => [ground(shroomCluster(22, 16, 3112, [
  [0.25, 5, 2.6, SHROOM_MIX.tan, SHROOM_MIX.cream], [0.48, 8, 3.4, SHROOM_MIX.tan, SHROOM_MIX.cream], [0.72, 6, 3, SHROOM_MIX.orange, SHROOM_MIX.cream], [0.86, 3, 1.8, SHROOM_MIX.orange, SHROOM_MIX.cream]]))]);
reg('shroomcluster_2', () => [ground(shroomCluster(22, 17, 3113, [
  [0.3, 7, 3, SHROOM_MIX.violet, SHROOM.gstem], [0.55, 10, 3.4, SHROOM_MIX.violet, SHROOM.gstem, hx('#e8d0ff')], [0.78, 5, 2.4, SHROOM_MIX.violet, SHROOM.gstem]]))]);
[[12, 12, 1], [14, 12, 2], [16, 13, 3]].forEach(([w, h, n], i) => reg('glowcap_' + i, () => [0, 1].map((f) => ground(glowCap(w, h, 3121 + i, n, f === 1)))));
reg('mushlog', () => [ground(mushLog(44, 20, 3131))]);
reg('spore', () => sporeFrames().map(centre));

// ===========================================================================
// v3: swamp
// ===========================================================================
reg('cypress_0', () => [ground(baldCypress(56, 104, 3201))]);
reg('cypress_1', () => [ground(tamarack(38, 96, 3202))]);
reg('deadtree_0', () => [ground(deadTree(44, 84, 3211))]);
reg('deadtree_1', () => [ground(deadTree(34, 62, 3212, { fork: 0.5, wb: 5, reach: 0.26, moss: 5 }))]);
reg('swampgrass_0', () => [ground(sedgeTuft(16, 16, 3221))]);
reg('swampgrass_1', () => [ground(sedgeTuft(20, 20, 3222, { n: 10, seeds: 2, dryP: 0.35 }))]);
reg('swampgrass_2', () => [ground(sedgeTuft(13, 12, 3223, { n: 6, dryP: 0.5 }))]);
reg('bogpad_0', () => [centre(bogPad(20, 11, 3231, { drop: true }))]);
reg('bogpad_1', () => [centre(bogPad(16, 9, 3232, { brown: true, bug: true }))]);
reg('algae_0', () => [centre(algaeMat(24, 11, 3241, 5))]);
reg('algae_1', () => [centre(algaeMat(16, 8, 3242, 3))]);
reg('algae_2', () => [centre(algaeMat(32, 14, 3243, 7))]);
reg('pitcherplant', () => [ground(pitcherPlant(22, 24, 3251))]);
reg('swampreeds_0', () => [ground(swampReeds(18, 34, 3261, { dragonfly: true }))]);
reg('swampreeds_1', () => [ground(swampReeds(15, 26, 3262, { n: 4 }))]);
reg('bubbles_swamp', () => swampBubbles().map(centre));
reg('frog_log', () => [0, 1].map((f) => ground(frogLog(3271, f))));

// ===========================================================================
// v3: water & land details
// ===========================================================================
reg('puddle_0', () => [centre(puddle(26, 11, 3301))]);
reg('puddle_1', () => [centre(puddle(34, 14, 3302, { glints: 4, leaf: true }))]);
reg('puddle_2', () => [centre(puddle(18, 8, 3303, { glints: 2 }))]);
reg('ripplering', () => rippleFrames().map(centre));
reg('rapids_0', () => rapidsFrames(44, 18, 3311).map(centre));
reg('rapids_1', () => rapidsFrames(32, 14, 3312).map(centre));
reg('rapids_2', () => rapidsFrames(58, 22, 3313).map(centre));
reg('steppingstone_0', () => [centre(steppingStone(22, 13, 3321))]);
reg('steppingstone_1', () => [centre(steppingStone(17, 11, 3322, { moss: true }))]);
reg('steppingstone_2', () => [centre(steppingStone(24, 14, 3323))]);
reg('riverrock_0', () => [ground(riverRock(20, 14, 3331))]);
reg('riverrock_1', () => [ground(riverRock(14, 10, 3332, { facets: 2 }))]);
reg('riverrock_2', () => [ground(riverRock(28, 17, 3333, { facets: 4, algae: true, moss: 1.5 }))]);
reg('driftwood_1', () => [ground(driftwood2())]);

// ===========================================================================
// v3: weeds & plowed earth
// ===========================================================================
for (const n of Object.keys(WEEDS)) reg(n, () => [ground(art(WEEDS[n][0], WEEDS[n][1], { k: 0.55, lit: 0.45, auto: 0.4, noShade: 'wWyYoO' }))]);
reg('plowed_0', () => [centre(plowedPatch(48, 22, 3401))]);

// ===========================================================================
// v3: demolish leftovers
// ===========================================================================
reg('stump_1', () => [ground(stumpSprite(22, 15, 3501, { ry: 3.5 }))]);
reg('stump_big', () => [ground(bigStump(36, 26, 3502))]);
reg('rubble_0', () => [ground(rubblePile(32, 18, 3511))]);
reg('rubble_1', () => [ground(rubblePile(24, 14, 3512, { n: 5, planks: 1 }))]);
reg('woodpile', () => [ground(woodPile(36, 24, 3521))]);
reg('chips_0', () => [centre(woodChips(26, 12, 3531))]);

// ===========================================================================
// v3: the Great Willow (landmark, 248x200 = ~10.3 x 8.3 units, 2 sway frames)
// ===========================================================================
reg('greatwillow', () => [0, 1].map((f) => ground(greatWillow(f))));

// ===========================================================================
// v3: berry bushes (each has a full and a _picked state)
// ===========================================================================
reg('raspberry', () => [ground(raspberryBush(false))]);
reg('raspberry_picked', () => [ground(raspberryBush(true))]);
reg('strawberry', () => [ground(strawberryPatch(false))]);
reg('strawberry_picked', () => [ground(strawberryPatch(true))]);
reg('cranberry', () => [ground(cranberryBush(false))]);
reg('cranberry_picked', () => [ground(cranberryBush(true))]);
reg('saskatoon', () => [ground(saskatoonBush(false))]);
reg('saskatoon_picked', () => [ground(saskatoonBush(true))]);
reg('cloudberry', () => [ground(cloudberryPlant(false))]);
reg('cloudberry_picked', () => [ground(cloudberryPlant(true))]);
reg('elderberry', () => [ground(elderberryBush(false))]);
reg('elderberry_picked', () => [ground(elderberryBush(true))]);
reg('goldenberry', () => [0, 1].map((f) => ground(goldenberryBush(false, f))));
reg('goldenberry_picked', () => [0, 1].map((f) => ground(goldenberryBush(true, f))));
// buildable berry bushes are aliases: they share the atlas frames above
for (const k of ['raspberry', 'strawberry', 'cranberry', 'saskatoon', 'cloudberry', 'elderberry', 'goldenberry', 'blueberry']) {
  alias('build_berrybush_' + k, k);
  alias('build_berrybush_' + k + '_picked', k + '_picked');
}

// ===========================================================================
// v3: buildable plants
// ===========================================================================
reg('sugarmaple', () => [ground(sugarMaple())]);
reg('appletree', () => [ground(appleTree(true))]);
reg('applertree_bare', () => [ground(appleTree(false))]);
alias('appletree_bare', 'applertree_bare'); // correctly spelled alias
reg('flowerbed_0', () => [ground(flowerBed(30, 22, 3761, [['tulip', FB_PAL.red], ['tulip', FB_PAL.yellow], ['tulip', FB_PAL.pink]]))]);
reg('flowerbed_1', () => [ground(flowerBed(30, 23, 3762, [['daisy', FB_PAL.white], ['lupine', FB_PAL.purple], ['lupine', FB_PAL.blue], ['daisy', FB_PAL.white], ['lupine', FB_PAL.pink]]))]);
reg('flowerbed_2', () => [ground(flowerBed(26, 21, 3763, [['marigold', FB_PAL.orange], ['pansy', FB_PAL.violet], ['marigold', FB_PAL.yellow], ['pansy', FB_PAL.yellow]]))]);
reg('flowerbed_3', () => [ground(flowerBed(34, 23, 3764, [['cosmos', FB_PAL.pink], ['cosmos', FB_PAL.purple], ['tulip', FB_PAL.red], ['cosmos', FB_PAL.white]]))]);
reg('seaweed_0', () => [0, 1].map((f) => ground(kelp(18, 56, 3771, f))));
reg('seaweed_1', () => [0, 1].map((f) => ground(kelp(22, 72, 3772, f))));
reg('seaweed_2', () => [0, 1].map((f) => ground(kelp(16, 44, 3774, f))));
reg('cattailpatch', () => [ground(plantPatch(40, 30, [
  [WATER_PLANTS.reeds_0, REED, 8], [WATER_PLANTS.cattail_0, CAT, 16], [WATER_PLANTS.cattail_1, CAT, 26], [WATER_PLANTS.reeds_1, REED, 33], [WATER_PLANTS.cattail_1, CAT, 9, true],
], { water: true }))]);
reg('wildriceplot', () => [ground(plantPatch(42, 31, [
  [WATER_PLANTS.wildrice, { ...REED, h: '#f0d890', H: '#c8a45a', y: '#c8b060', Y: '#9a8a48' }, 9],
  [WATER_PLANTS.wildrice, { ...REED, h: '#f0d890', H: '#c8a45a', y: '#c8b060', Y: '#9a8a48' }, 21, true],
  [WATER_PLANTS.wildrice, { ...REED, h: '#f0d890', H: '#c8a45a', y: '#c8b060', Y: '#9a8a48' }, 30],
], { water: true, stake: true }))]);
reg('beehive_tree', () => [0, 1].map((f) => ground(beehiveTree(f))));
reg('sapling_1', () => [ground(stakedSapling())]);
reg('pumpkinpatch', () => [ground(pumpkinPatch())]);
reg('sunflower', () => [ground(sunflower())]);

// ===========================================================================
// v3: critters
// ===========================================================================
reg('heron_idle', () => critter(HERON, ['idle0', 'idle1'], HERON_PAL));
reg('heron_fish', () => critter(HERON, ['fish0', 'fish1', 'fish2'], HERON_PAL));
reg('turtle_swim', () => wb(TURTLE, ['swim0', 'swim1'], TURTLE_PAL).map(ground));
reg('turtle_sun', () => critter(TURTLE, ['sun0', 'sun1'], TURTLE_PAL));
reg('beaver_swim', () => wb(BEAVER, ['swim0', 'swim1'], BEAVER_PAL, { noShade: 'k' }).map(ground));
reg('owl_idle', () => critter(OWL, ['idle0', 'idle1'], OWL_PAL));
reg('owl_blink', () => critter(OWL, ['half', 'shut', 'half'], OWL_PAL));
reg('firefly_big', () => bigFireflyFrames().map(centre));

// ===========================================================================
// Extra sprite modules (src/art/extra/*.js). Each exports
//   EXTRA_SPRITES = { name: () => [{ w, h, data: Uint8ClampedArray(w*h*4) RGBA, ax, ay }, ...] }
// Plain RGBA frames, so they can be drawn anywhere; a name that already exists
// here is replaced (that is how the songbirds got redrawn).
// ===========================================================================
function rgbaFrame(f) {
  const p = new Px(f.w, f.h);
  const d = f.data;
  for (let i = 0; i < f.w * f.h; i++) {
    const a = d[i * 4 + 3];
    if (!a) continue;
    p.c[i] = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
    p.a[i] = a;
  }
  return { px: p, ax: f.ax ?? f.w / 2, ay: f.ay ?? f.h };
}
const EXTRA_MODS = import.meta.glob('./extra/*.js', { eager: true });
for (const m of Object.values(EXTRA_MODS)) {
  for (const [name, fn] of Object.entries(m.EXTRA_SPRITES || {})) {
    delete ALIAS[name];
    reg(name, () => fn().map(rgbaFrame));
  }
}
export const NATURE_NAMES = Object.keys(REG);

// ===========================================================================
// Atlas
// ===========================================================================
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

function pxToImageData(ctx, px) {
  const img = ctx.createImageData(px.w, px.h);
  const d = img.data;
  for (let i = 0; i < px.w * px.h; i++) {
    const c = px.c[i];
    d[i * 4] = cr(c);
    d[i * 4 + 1] = cg(c);
    d[i * 4 + 2] = cb(c);
    d[i * 4 + 3] = px.a[i];
  }
  return img;
}

let FRAMES = null; // name -> [{ px, ax, ay }]
function allFrames() {
  if (FRAMES) return FRAMES;
  FRAMES = {};
  for (const name of NATURE_NAMES) {
    if (ALIAS[name] && FRAMES[ALIAS[name]]) {
      FRAMES[name] = FRAMES[ALIAS[name]];
      continue;
    }
    try {
      FRAMES[name] = REG[name]();
    } catch (e) {
      console.error('natureArt: failed to build', name, e);
      FRAMES[name] = [ground(new Px(1, 1))];
    }
  }
  return FRAMES;
}

const ATLAS_MAX = 4096;
let ATLAS = null;
export function buildNatureAtlas() {
  if (ATLAS) return ATLAS;
  const fr = allFrames();
  const items = [];
  for (const name of NATURE_NAMES) if (!ALIAS[name]) fr[name].forEach((f, i) => items.push({ name, i, f }));
  items.sort((a, b) => b.f.px.h - a.f.px.h || b.f.px.w - a.f.px.w);
  const PAD = 2;
  const pack = (W, H) => {
    let x = PAD, y = PAD, rowH = 0;
    const pos = [];
    for (const it of items) {
      const w = it.f.px.w, h = it.f.px.h;
      if (x + w + PAD > W) {
        x = PAD;
        y += rowH + PAD;
        rowH = 0;
      }
      if (y + h + PAD > H) return null;
      pos.push([x, y]);
      x += w + PAD;
      rowH = Math.max(rowH, h);
    }
    return pos;
  };
  // Grows power-of-two up to ATLAS_MAX (4096; v3 raised it from 2048 for the
  // bigger map's sprites, the Great Willow included). With everything in v3
  // it currently packs into 1024x512, so there is plenty of headroom and a
  // single texture is kept (world.js binds one atlas texture).
  let W = 256, H = 256, pos = null;
  while (!(pos = pack(W, H))) {
    if (W <= H) W *= 2;
    else H *= 2;
    if (W > ATLAS_MAX || H > ATLAS_MAX) throw new Error('natureArt: atlas overflow');
  }
  const canvas = makeCanvas(W, H);
  const ctx = ctx2d(canvas);
  const frames = {};
  for (const name of NATURE_NAMES) frames[name] = [];
  items.forEach((it, k) => {
    const [x, y] = pos[k];
    ctx.putImageData(pxToImageData(ctx, it.f.px), x, y);
    frames[it.name][it.i] = { x, y, w: it.f.px.w, h: it.f.px.h, ax: it.f.ax, ay: it.f.ay };
  });
  for (const name of NATURE_NAMES) if (ALIAS[name]) frames[name] = frames[ALIAS[name]];
  ATLAS = { canvas, frames };
  return ATLAS;
}

const CANVAS_CACHE = new Map();
export function natureCanvas(name, frame = 0, scale = 1) {
  scale = Math.max(1, Math.round(scale) || 1);
  const key = `${name}|${frame}|${scale}`;
  if (CANVAS_CACHE.has(key)) return CANVAS_CACHE.get(key);
  const fr = REG[name] ? allFrames()[name] : null;
  let c;
  if (!fr || !fr.length) {
    c = makeCanvas(scale, scale);
  } else {
    const fi = Number.isFinite(+frame) ? Math.floor(+frame) : 0;
    const f = fr[((fi % fr.length) + fr.length) % fr.length];
    const src = makeCanvas(f.px.w, f.px.h);
    const sctx = ctx2d(src);
    sctx.putImageData(pxToImageData(sctx, f.px), 0, 0);
    if (scale === 1) c = src;
    else {
      c = makeCanvas(f.px.w * scale, f.px.h * scale);
      const g = ctx2d(c);
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 0, 0, c.width, c.height);
    }
  }
  CANVAS_CACHE.set(key, c);
  return c;
}
