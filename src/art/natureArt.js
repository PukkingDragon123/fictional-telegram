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
function stumpSprite(W, H, seed) {
  const p = new Px(W, H);
  const bark = pals(['#2a1c1e', '#3e2a28', '#553a30', '#6e4c3a', '#886046', '#a07654']);
  const wood = pals(['#8a6040', '#b08050', '#cda064', '#e4c080', '#f4dca0']);
  const cx = W / 2, rx = W / 2 - 3, topY = 4, ry = 3;
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
// Registry
// ===========================================================================
// name -> () => Array<{ px: Px, ax, ay }>
const REG = {};
const ground = (px) => ({ px, ax: px.w / 2, ay: px.h });
const centre = (px) => ({ px, ax: px.w / 2, ay: px.h / 2 });
function reg(name, fn) {
  REG[name] = fn;
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
    try {
      FRAMES[name] = REG[name]();
    } catch (e) {
      console.error('natureArt: failed to build', name, e);
      FRAMES[name] = [ground(new Px(1, 1))];
    }
  }
  return FRAMES;
}

let ATLAS = null;
export function buildNatureAtlas() {
  if (ATLAS) return ATLAS;
  const fr = allFrames();
  const items = [];
  for (const name of NATURE_NAMES) fr[name].forEach((f, i) => items.push({ name, i, f }));
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
  let W = 256, H = 256, pos = null;
  while (!(pos = pack(W, H))) {
    if (W <= H) W *= 2;
    else H *= 2;
    if (W > 2048 || H > 2048) throw new Error('natureArt: atlas overflow');
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
