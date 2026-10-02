// Growth stages for plants that only had a finished sprite, so every plant
// visibly grows, plus PLANT_STAGES (read by src/data/crops.js: keep this a
// plain literal and never import crops.js from here, it globs this folder).
//
// Names (all ground anchored ax = w / 2, ay = h unless noted)
//   <berry>_sprout   a seedling in a mulch patch, the bush's own leaf colour
//   <berry>_young    a young leafy bush, ~60% size, no fruit
//                    (blueberry raspberry strawberry saskatoon cranberry
//                     cloudberry elderberry goldenberry)
//   flowerbed_sprout / flowerbed_young   the same planter box: shoots, buds
//   fern_sprout (fiddleheads) / fern_young
//   reeds_sprout (also the cattail seedling) / reeds_young / cattail_young
//   seaweed_sprout / seaweed_young       2 sway frames each, like seaweed_*
//   lilypad_sprout / lilypad_young / duckweed_sprout / duckweed_young
//                    flat water sprites, centre anchored like lilypad_0
//   wildrice_young / wildrice_grow       shoots, then green unripe stalks
// The bushes reuse natureArt's own canopy generator (copied below verbatim)
// at a smaller size, so leaves, rims and creases match the grown sprite.
import { PLANT_KIT } from './cropArt.js';

const { Px, clamp, lerp, mulberry, hash, hx, mix, pals, pick, INK, LX, LY, LZ, natOutline, line, ellipse, ball, stamp, leaf, blade, toRGBA, twinkle } = PLANT_KIT;
const outline = natOutline; // natureArt's outline (no line under anything)
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ===========================================================================
// natureArt.js generators, copied verbatim (canopy, bushes, limbs, kelp)
// ===========================================================================
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

// ===========================================================================
// Palettes (from natureArt.js)
// ===========================================================================
const LEAF_FRESH = pals(['#142a1e', '#1c3c24', '#26522a', '#326830', '#428036', '#58983e', '#74b048', '#98c85c', '#c0de7c']);
const LEAF_BLUE = pals(['#14262a', '#1a3634', '#22483e', '#2e5c46', '#3c704e', '#4e8458', '#669a66', '#86b47c', '#acce98']);
const LEAF_BOG = pals(['#1e1418', '#2e1c1e', '#422822', '#4e3a26', '#4a502a', '#5a6a30', '#76843a', '#9aa04c', '#c0bc6a']);
const LEAF_MAGIC = pals(['#10242a', '#163636', '#1c4a40', '#246048', '#327852', '#46905a', '#64aa62', '#90c472', '#d0e490']);
const BLUE_LEAVES = pals(['#1c2c26', '#24402e', '#2f5634', '#3c6b3a', '#4f8242', '#679a4a', '#86b358', '#aacb6e']);
const BLUE_AUTUMN = pals(['#22101f', '#3a1426', '#561a2e', '#742234', '#92303a', '#ad4440', '#c4604a', '#d88a5e']);
const KELP = pals(['#14201a', '#1e3020', '#2c4424', '#405a28', '#58702c', '#748632', '#94a03e', '#b8bc56']);
const DEEP = pals(['#14243a', '#1c3450', '#244a68', '#2e6280', '#3c7c98', '#5a9cb4', '#88c0d4', '#bfe2ee', '#f2fcff']);
const MULCH = pals(['#2a1a18', '#46302a', '#6a4a36', '#8a6444']);
const REED = { L: '#b6d27a', l: '#86b050', g: '#588a3a', G: '#3a6430', D: '#264a28', y: '#d8c070', Y: '#b09a50' };
const FERN = { L: '#a6d072', l: '#6fa84a', g: '#44803a', G: '#2c5a30', D: '#1c3e26' };
const LILY = { L: '#a6d466', l: '#72b04a', g: '#4c8c3c', G: '#2e6432' };
const WILDRICE = [
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
];

// ASCII picture -> outlined Px (natureArt's art() without auto shading)
function artPx(rows, pal, o = {}) {
  const ground = o.ground ?? true;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const p = new Px(w + 2, h + (ground ? 1 : 2));
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const v = pal[ch]; if (v) p.set(x + 1, y + 1, hx(v)); }));
  outline(p, { noBottom: ground, k: o.k ?? 0.52, lit: o.lit ?? 0.44 });
  return p;
}
const flipRows = (rows) => rows.map((r) => [...r].reverse().join(''));
// copy an outlined Px into p with its bottom centre at (x, y)
const place = (p, src, x, y) => p.blit(src, Math.round(x - src.w / 2), Math.round(y - src.h));
const ground = (p) => toRGBA(p);
const centre = (p) => toRGBA(p, p.w / 2, p.h / 2);

// ===========================================================================
// Berry bushes: seedling, then a young bush
// ===========================================================================
// mulch patch with a seedling: stems [[x0, y0, x1, y1, w]], leaves [[x, y, ang, len, wid]]
function seedling(W, H, seed, o) {
  const p = new Px(W, H);
  ellipse(p, W / 2, H - 1.4, W / 2 - 2, 1.9, (x, y, nx, ny) => pick(MULCH, 0.3 - ny - nx * 0.3 + (hash(x, y, seed) - 0.5) * 1.2));
  for (const [x0, y0, x1, y1, w] of o.stems || []) limb(p, [[x0, y0], [x1, y1]], w, Math.max(1, w * 0.6), o.stem, seed);
  for (const [x, y, a, len, wid, alt] of o.leaves) leaf(p, x, y, a, len, wid, alt ? o.alt : o.pal, { bright: 0.1 });
  if (o.extra) o.extra(p);
  outline(p, { noBottom: true });
  return p;
}
const CANE = pals(['#3a1a22', '#5a2a2e', '#7e3e3a', '#a0584a']);
const TWIG = pals(['#2a1e22', '#40302c', '#5a4436']);
const GREYTWIG = pals(['#2a2028', '#40323a', '#5a4a4c', '#7a6a66']);
const UP = -Math.PI / 2;
const SPROUTS = {
  blueberry: () => seedling(16, 13, 1303, { stem: TWIG, pal: BLUE_LEAVES, alt: BLUE_AUTUMN,
    stems: [[8, 12, 8, 4, 1.4]], leaves: [[8, 9, Math.PI + 0.5, 4, 1.5], [8, 7, -0.5, 4, 1.5, true], [8, 5, Math.PI + 0.7, 3.2, 1.2], [8, 4, UP + 0.4, 3, 1.2]] }),
  raspberry: () => seedling(16, 14, 3601, { stem: CANE, pal: LEAF_FRESH,
    stems: [[8, 13, 7, 3, 1.4]], leaves: [[8, 10, Math.PI + 0.4, 4.4, 1.8], [7, 7, -0.4, 4.4, 1.8], [7, 4, UP - 0.2, 3.6, 1.6]],
    extra: (p) => { for (const [x, y] of [[4, 8], [11, 5], [6, 2]]) p.set(x, y, LEAF_FRESH[7]); } }),
  strawberry: () => seedling(16, 10, 3602, { stem: pals(['#3e6a2a', '#5a8a3a', '#6a9a44']), pal: LEAF_FRESH,
    stems: [[8, 9, 8, 5, 1]], leaves: [[8, 5, Math.PI + 0.6, 3.6, 1.8], [8, 5, -0.6, 3.6, 1.8], [8, 5, UP, 3.4, 1.8]],
    extra: (p) => { for (let x = 9; x < 15; x++) if (!p.any(x, 9)) p.set(x, 9, hx('#6a8a3a')); } }),
  saskatoon: () => seedling(16, 14, 3604, { stem: GREYTWIG, pal: LEAF_BLUE,
    stems: [[8, 13, 8, 4, 1.6], [8, 8, 11, 5, 1]], leaves: [[7, 9, Math.PI + 0.5, 4, 2], [11, 5, -0.3, 3.4, 1.8], [8, 4, UP - 0.3, 3.4, 1.8]] }),
  cranberry: () => seedling(16, 8, 3603, { stem: pals(['#5a2a2a', '#7a3a32', '#8a4a3a']), pal: LEAF_BOG,
    stems: [[3, 6, 13, 6, 1]], leaves: [[5, 6, UP - 0.6, 2.4, 1.1], [8, 6, UP + 0.2, 2.6, 1.1], [11, 6, UP + 0.6, 2.4, 1.1], [13, 6, -0.2, 2, 1]] }),
  cloudberry: () => seedling(16, 10, 3605, { stem: pals(['#5a4a2a', '#7a5a3a', '#9a7a4a']), pal: LEAF_FRESH,
    stems: [[8, 9, 8, 6, 1]], leaves: [],
    extra: (p) => { canopy(p, [{ x: 8, y: 5, r: 3.4, ry: 2.5 }], { pal: LEAF_FRESH, seed: 3614, leaf: 2.2, loose: 0.25, jag: 0.32, bump: 2.2, bias: 0.4, local: 0.85, rim: 1.1 }); for (let k = -2; k <= 2; k++) p.tint(8 + k, 5 + (Math.abs(k) > 1 ? -1 : 0), LEAF_FRESH[3]); } }),
  elderberry: () => seedling(16, 15, 3606, { stem: pals(['#2a2022', '#3e3030', '#5a4840', '#7a6650']), pal: LEAF_FRESH,
    stems: [[8, 14, 8, 4, 1.6], [8, 8, 4, 5, 1], [8, 8, 12, 5, 1]], leaves: [[4, 5, Math.PI + 0.3, 3, 1.4], [12, 5, -0.3, 3, 1.4], [8, 4, UP, 3.2, 1.4], [5, 8, Math.PI + 0.8, 2.6, 1.2], [11, 8, -0.8, 2.6, 1.2]] }),
  goldenberry: () => seedling(16, 13, 3607, { stem: TWIG, pal: LEAF_MAGIC,
    stems: [[8, 12, 8, 5, 1.4]], leaves: [[8, 9, Math.PI + 0.5, 4, 1.7], [8, 7, -0.5, 4, 1.7], [8, 5, UP + 0.3, 3.2, 1.4]],
    extra: (p) => { p.set(5, 8, hx('#e8d070')); p.set(11, 6, hx('#e8d070')); } }),
};
// young bushes: natureArt's bushSprite at ~60% of the grown size, no fruit
function youngBush(W, H, seed, pal, o, extra) {
  const p = new Px(W, H);
  if (o.under) o.under(p);
  const leaves = bushSprite(W, H - (o.lift || 0), seed, pal, o);
  p.blit(leaves, 0, 0);
  if (extra) extra(p);
  outline(p, { noBottom: true });
  return p;
}
const YOUNG = {
  blueberry: () => youngBush(16, 11, 1303, BLUE_LEAVES, { n: 3, alt: BLUE_AUTUMN, altP: 0.25, altForce: 1, cy: 0.58, ry: 0.44, leaf: 2.2, bias: 0.62 }),
  raspberry: () => youngBush(18, 16, 3601, LEAF_FRESH, { n: 3, cy: 0.52, ry: 0.5, leaf: 2.2, bias: 0.55,
    under: (p) => { for (const [x0, x1, y1] of [[7, 2, 2], [11, 16, 3]]) limb(p, [[x0, 15], [lerp(x0, x1, 0.4), y1 + 4], [x1, y1]], 1.3, 1, CANE, 3601 + x0); } },
  (p) => { for (let x = 1; x < p.w - 1; x++) for (let y = 1; y < p.h - 4; y++) if (p.on(x, y) && !p.on(x, y - 1) && hash(x, y, 3601) < 0.3) p.set(x, y - 1, LEAF_FRESH[7]); }),
  strawberry: () => {
    const W = 18, H = 9, p = new Px(W, H), R = mulberry(3602);
    const cls = [];
    for (let i = 0; i < 4; i++) {
      const x = 3 + (i / 3) * (W - 6) + (R() - 0.5), y = H - 3.5 - (i % 2) * 1.5;
      for (let k = 0; k < 3; k++) cls.push({ x: x + (k - 1) * 1.8, y: y - (k === 1 ? 1.2 : 0), r: 2 + R() * 0.4, ry: 1.6 });
    }
    canopy(p, cls, { pal: LEAF_FRESH, seed: 3611, leaf: 2, loose: 0.3, jag: 0.12, bump: 2.5, bias: 0.4, local: 0.85, texAmt: 0.6, rim: 1 });
    for (let x = 1; x < W - 1; x++) if (!p.any(x, H - 1) && hash(x, 1, 3602) < 0.6) p.set(x, H - 1, hx('#6a8a3a'));
    stamp(p, ['.w.', 'wyw', '.w.'], { w: '#ffffff', y: '#f4d040' }, 8, 0);
    outline(p, { noBottom: true });
    return p;
  },
  saskatoon: () => youngBush(20, 20, 3604, LEAF_BLUE, { n: 3, cy: 0.5, ry: 0.5, leaf: 2.4, bias: 0.55, r: 0.4, lift: 2,
    under: (p) => { for (const [x0, x1] of [[9, 7], [10, 10], [11, 13]]) limb(p, [[x0, 19], [x1, 15]], 1.6, 1.1, GREYTWIG, 3604 + x0); } }),
  cranberry: () => youngBush(16, 8, 3603, LEAF_BOG, { n: 3, cy: 0.5, ry: 0.42, leaf: 1.8, bias: 0.5, r: 0.32,
    under: (p) => ellipse(p, 8, 6.5, 7, 1.8, (x, y, nx, ny) => pick(pals(['#3a2024', '#5a2e2e', '#7a4234', '#6a6a34', '#8a8a44']), 0.4 - ny - nx * 0.3 + (hash(x, y, 3603) - 0.5) * 0.8)) },
  (p) => { for (const x of [4, 9, 13]) line(p, x, 2, x + 1, 0, LEAF_BOG[3]); }),
  cloudberry: () => {
    const W = 15, H = 9, p = new Px(W, H);
    canopy(p, [[4, 5.5, 3], [8, 4.5, 3.4], [11.5, 6, 2.8], [7, 7, 2.6]].map(([x, y, r]) => ({ x, y, r, ry: r * 0.72 })), { pal: LEAF_FRESH, seed: 3614, leaf: 2.2, loose: 0.25, jag: 0.32, bump: 2.2, bias: 0.4, local: 0.85, rim: 1.1 });
    for (const [x, y] of [[4, 5], [8, 4]]) for (let k = -1; k <= 1; k++) p.tint(x + k, y, LEAF_FRESH[3]);
    stamp(p, ['wWw', '.y.'], { w: '#f4f0e8', W: '#ffffff', y: '#d8c060' }, 7, 0);
    outline(p, { noBottom: true });
    return p;
  },
  elderberry: () => youngBush(21, 21, 3606, LEAF_FRESH, { n: 3, cy: 0.56, ry: 0.46, leaf: 2.4, bias: 0.6, r: 0.38, lift: 3,
    under: (p) => { for (const [x0, x1] of [[9, 7], [10, 10], [11, 13]]) limb(p, [[x0, 20], [x1, 16]], 1.8, 1.2, pals(['#2a2022', '#3e3030', '#5a4840', '#7a6650']), 3606 + x0); } },
  (p) => { for (const [x, y] of [[6, 5], [14, 4]]) for (const k of [-1, 0, 1]) p.set(x + k, y - (k ? 0 : 1), hx('#b8404e')); }),
  goldenberry: () => youngBush(18, 17, 3607, LEAF_MAGIC, { n: 3, cy: 0.54, ry: 0.48, leaf: 2.2, bias: 0.6 },
    (p) => { for (let y = 2; y < p.h - 2; y++) for (let x = 2; x < p.w - 2; x++) if (p.on(x, y) && hash(x, y, 3610) < 0.05) p.set(x, y, hx('#e8d070')); }),
};

// ===========================================================================
// Nature plants
// ===========================================================================
// the wildflower planter box (flowerbed_0's box: same size, seed, wood)
function planter(fill) {
  const W = 30, H = 22, seed = 3761;
  const p = new Px(W, H);
  const wood = pals(['#3a2220', '#5a3628', '#7e5032', '#a46e42', '#c48e58', '#deb07a']);
  const soil = pals(['#20141a', '#36221e', '#4e3226', '#684630']);
  const frontH = 7, topH = 5;
  const y0 = H - frontH - topH;
  for (let x = 1; x < W - 1; x++) {
    p.set(x, y0, pick(wood, 0.5));
    p.set(x, y0 + 1, pick(wood, -0.2));
    for (let y = y0 + 2; y < y0 + topH; y++) p.set(x, y, pick(soil, 0.2 - (y - y0 - 2) * 0.3 + (hash(x, y, seed) - 0.5) * 0.8));
  }
  // what grows in it sits behind the front planks
  fill(p, y0, topH);
  for (let x = 0; x < W; x++) {
    p.set(x, y0 + topH, pick(wood, 0.95));
    for (let y = y0 + topH + 1; y < H; y++) {
      const plank = Math.floor((y - y0 - topH - 1) / 3);
      const seam = (y - y0 - topH - 1) % 3 === 2;
      let v = 0.35 - plank * 0.25 - (seam ? 0.6 : 0) + (hash(x >> 2, y, seed) - 0.5) * 0.25 - (x / W) * 0.3;
      if (x < 2 || x >= W - 2) v += 0.25;
      if (H - 1 - y < 1) v -= 0.4;
      p.set(x, y, pick(wood, v));
    }
  }
  for (const x of [0, W - 2]) { p.set(x + 1, y0 + topH + 2, hx('#c8ccd4')); p.set(x + 1, y0 + topH + 5, hx('#c8ccd4')); }
  for (const x of [0, W - 1]) for (let y = y0; y <= y0 + topH; y++) p.set(x, y, pick(wood, x === 0 ? 0.4 : -0.3));
  outline(p, { noBottom: true });
  stamp(p, ['.s.', 'sSk'], { s: '#c08040', S: '#e8b070', k: '#d8c4a4' }, W - 7, y0 + topH - 1);
  return p;
}
const FSTEM = pals(['#2a4f2c', '#3e7236', '#56903e', '#6fa84a', '#94c464']);
const BUDS = ['#e8343a', '#ffd23a', '#ff8ac0', '#e8343a', '#ffd23a'];
function flowerbedStage(young) {
  return planter((p, y0) => {
    const n = 5;
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < n - row; i++) {
        const x = Math.round(3 + (i + row * 0.5) * (24 / (n - 0.5))), yb = y0 + 3 + row * 2;
        if (!young) { p.set(x, yb - 1, FSTEM[3]); p.set(x - 1, yb - 2, FSTEM[4]); p.set(x + 1, yb - 2, FSTEM[2]); continue; }
        // leafy tuft with a closed bud on a stem
        leaf(p, x, yb, Math.PI + 0.7, 2.6, 1, FSTEM);
        leaf(p, x, yb, -0.7, 2.6, 1, FSTEM);
        line(p, x, yb, x, yb - 5, (X2, Y2) => p.set(X2, Y2, FSTEM[2]));
        const c = hx(BUDS[(i + row * 2) % BUDS.length]);
        p.set(x, yb - 6, c); p.set(x, yb - 7, mix(c, 0xffffff, 0.35)); p.set(x - 1, yb - 6, FSTEM[3]); p.set(x + 1, yb - 6, FSTEM[1]);
      }
  });
}
const FERN_SPROUT = [
  '.Ll....lL..',
  'l.gl..lg.l.',
  'lG.g..g.Gl.',
  '.gGg.Lg.Gg.',
  '...gl.gL...',
  '...g..g....',
  '..Gg..gG...',
  '..GGDDGG...',
];
const FERN_YOUNG = [
  '.....L...L.....',
  '..L.Ll...lL.L..',
  '.Ll.lg...gl.lL.',
  'Llg.gg...gg.glL',
  'lgg.g..L..g.ggl',
  '.gg.g.Ll..g.gg.',
  '..GggGlg.gGggG.',
  '...GgGgg.gGgG..',
  '....GGgGgGGG...',
  '.....GGDGGD....',
];
const REEDS_SPROUT = [
  '..L.....',
  '..l..L..',
  'L.l..l..',
  'l.lL.l.L',
  '.lgl.gl.',
  '..gglgG.',
  '..GGDG..',
];
const REEDS_YOUNG = [
  '....L.....',
  '....l...L.',
  '.L..l...l.',
  '.l..lL..l.',
  '..l.lg.l..',
  '..l.lg.l..',
  '..lLlg.lg.',
  '...llg.lg.',
  '...lgglgG.',
  '...lgGlgG.',
  '....gGggG.',
  '....GGDGG.',
];
// a clump in a little patch of shallows (natureArt's plantPatch water)
function shallows(W, H, list, o = {}) {
  const p = new Px(W, H);
  ellipse(p, W / 2, H - 2, W / 2 - 1, 2.6, (x, y, nx, ny) => (ny < -0.2 ? pick(DEEP, 0.4 - nx * 0.3) : pick(DEEP, -0.2 + nx * -0.2 + ((x + y) % 5 === 0 ? 0.6 : 0))));
  for (const [rows, pal, x, flip] of list) place(p, artPx(flip ? flipRows(rows) : rows, pal, { k: 0.52 }), x, H - 2);
  if (o.stake) stamp(p, ['WWWWW', 'WkWkW', 'WWWWW', '..s..', '..s..', '..s..', '..S..'], { W: '#e8d8b8', k: '#7a5a3a', s: '#a8744e', S: '#6a4430' }, W - 8, H - 12);
  return p;
}
const GREEN_RICE = { ...REED, h: '#c4e08a', H: '#86b058', y: '#8ab85c', Y: '#5e8c40' };
// duckweed with fewer fronds (natureArt's duckweed, n fronds)
function duckweed(W, H, seed, n) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const pal = pals(['#2e6a2e', '#4a8c36', '#6cac44', '#98cc5a', '#c4e67c']);
  const cx = W / 2, cy = H / 2;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    const x = cx + Math.cos(a) * d * (W / 2 - 1.5) * (1 + 0.2 * Math.sin(a * 3 + seed));
    const y = cy + Math.sin(a) * d * (H / 2 - 1.2);
    const X2 = Math.floor(x), Y2 = Math.floor(y), v = R();
    p.set(X2, Y2, pal[v < 0.3 ? 1 : 2]);
    if (v > 0.5) p.set(X2 + 1, Y2, pal[v > 0.85 ? 3 : 2]);
    if (v > 0.75) p.set(X2, Y2 - 1, pal[4]);
  }
  outline(p, { k: 0.45, lit: 0.4 });
  return p;
}

// ===========================================================================
// Registry
// ===========================================================================
const OUT = {};
const once = (fn) => { let c = null; return () => (c ||= fn()).map((f) => ({ ...f, data: f.data.slice() })); };
const BERRIES = ['blueberry', 'raspberry', 'strawberry', 'saskatoon', 'cranberry', 'cloudberry', 'elderberry', 'goldenberry'];
for (const b of BERRIES) {
  OUT[`${b}_sprout`] = once(() => [ground(SPROUTS[b]())]);
  OUT[`${b}_young`] = once(() => [ground(YOUNG[b]())]);
}
OUT.flowerbed_sprout = once(() => [ground(flowerbedStage(false))]);
OUT.flowerbed_young = once(() => [ground(flowerbedStage(true))]);
OUT.fern_sprout = once(() => [ground(artPx(FERN_SPROUT, FERN))]);
OUT.fern_young = once(() => [ground(artPx(FERN_YOUNG, FERN))]);
OUT.reeds_sprout = once(() => [ground(artPx(REEDS_SPROUT, REED))]);
OUT.reeds_young = once(() => [ground(artPx(REEDS_YOUNG, REED))]);
OUT.cattail_young = once(() => [ground(shallows(30, 18, [[REEDS_YOUNG, REED, 8], [REEDS_YOUNG, REED, 16, true], [REEDS_SPROUT, REED, 23]]))]);
OUT.seaweed_sprout = once(() => [0, 1].map((f) => ground(kelp(12, 18, 3775, f))));
OUT.seaweed_young = once(() => [0, 1].map((f) => ground(kelp(16, 32, 3776, f))));
OUT.lilypad_sprout = once(() => [centre(artPx(['.Ll.', 'Lglg', '.gG.'], LILY, { ground: false }))]);
OUT.lilypad_young = once(() => [centre(artPx(['..LLl.....', '.Llgll....', 'Llgglgg.Ll', '.gggGG.LgG', '...GG...G.'], LILY, { ground: false }))]);
OUT.duckweed_sprout = once(() => [centre(duckweed(10, 6, 2102, 12))]);
OUT.duckweed_young = once(() => [centre(duckweed(15, 8, 2103, 34))]);
OUT.wildrice_young = once(() => [ground(shallows(26, 14, [[REEDS_SPROUT, REED, 8], [REEDS_SPROUT, REED, 14, true], [REEDS_SPROUT, REED, 19]]))]);
OUT.wildrice_grow = once(() => [ground(shallows(42, 31, [[WILDRICE, GREEN_RICE, 9], [WILDRICE, GREEN_RICE, 21, true], [WILDRICE, GREEN_RICE, 30]], { stake: true }))]);
export const EXTRA_SPRITES = OUT;

// [seed, sprout, growing, ripe] sprite per plant structure type. Perennials
// (berry bushes, wild rice, mushrooms) regrow from stage 2 after a harvest,
// so stage 2 is the full plant without produce (the berry `_picked` art).
// Types with variants (flowers, fern, seaweed, lily pads, reeds) list their
// first variant as ripe: keep using def.sprite[seed % n] once fully grown.
export const PLANT_STAGES = {
  carrot: ['crop_seed', 'crop_sprout', 'crop_carrot_grow', 'crop_carrot_ripe'],
  lettuce: ['crop_seed', 'crop_sprout', 'crop_lettuce_grow', 'crop_lettuce_ripe'],
  radish: ['crop_seed', 'crop_sprout', 'crop_radish_grow', 'crop_radish_ripe'],
  peas: ['crop_seed', 'crop_sprout', 'crop_peas_grow', 'crop_peas_ripe'],
  potato: ['crop_seed', 'crop_sprout', 'crop_potato_grow', 'crop_potato_ripe'],
  corn: ['crop_seed', 'crop_sprout', 'crop_corn_grow', 'crop_corn_ripe'],
  sunflower: ['crop_seed', 'crop_sprout', 'crop_sunflower_grow', 'crop_sunflower_ripe'],
  pumpkin: ['crop_seed', 'crop_sprout', 'crop_pumpkin_grow', 'crop_pumpkin_ripe'],
  berries: ['blueberry_sprout', 'blueberry_young', 'blueberry_picked', 'blueberry'],
  raspberry: ['raspberry_sprout', 'raspberry_young', 'raspberry_picked', 'raspberry'],
  strawberry: ['strawberry_sprout', 'strawberry_young', 'strawberry_picked', 'strawberry'],
  saskatoon: ['saskatoon_sprout', 'saskatoon_young', 'saskatoon_picked', 'saskatoon'],
  cranberry: ['cranberry_sprout', 'cranberry_young', 'cranberry_picked', 'cranberry'],
  cloudberry: ['cloudberry_sprout', 'cloudberry_young', 'cloudberry_picked', 'cloudberry'],
  elderberry: ['elderberry_sprout', 'elderberry_young', 'elderberry_picked', 'elderberry'],
  goldenberry: ['goldenberry_sprout', 'goldenberry_young', 'goldenberry_picked', 'goldenberry'],
  wildrice: ['crop_seed_water', 'wildrice_young', 'wildrice_grow', 'wildriceplot'],
  mushrooms: ['mushlog_bare', 'mushlog_bare', 'mushlog_pins', 'mushlog'],
  flowers: ['crop_seed', 'flowerbed_sprout', 'flowerbed_young', 'flowerbed_0'],
  fern: ['fern_sprout', 'fern_sprout', 'fern_young', 'fern_0'],
  cattail: ['reeds_sprout', 'reeds_sprout', 'cattail_young', 'cattailpatch'],
  reeds: ['reeds_sprout', 'reeds_sprout', 'reeds_young', 'reeds_0'],
  seaweed: ['seaweed_sprout', 'seaweed_sprout', 'seaweed_young', 'seaweed_0'],
  lilypad: ['lilypad_sprout', 'lilypad_sprout', 'lilypad_young', 'lilypad_0'],
  duckweed: ['duckweed_sprout', 'duckweed_sprout', 'duckweed_young', 'duckweed'],
};
