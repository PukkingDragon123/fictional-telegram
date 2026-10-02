// Voxel trophies for Chez Reynard's trophy cabinet (src/ui/RestaurantMenu.js):
// fish cup, heart cup, a cup brimming with fish, a bear paw, a flask, a DNA
// helix, a golden fish, a beaver statue, a wave, a five-point star, the CEO's
// briefcase, a "7" plaque, a money bag, the grand Pond Legend cup and a book.
// Polished metal is faked the pixel-art way: hard light / dark reflection bands
// baked into the vertex colours, plus a shiny Phong material for live glints.
//
//   import { makeTrophy, trophyLook } from './trophyModels.js';
//   const cup = makeTrophy({ id: 'a_golden' });                 // shape + tier from TROPHY_LOOKS
//   const odd = makeTrophy({ shape: 'star', tier: 'silver' });
//   const sil = makeTrophy({ id: 'a_dex', locked: true });      // dark silhouette
//
// - Origin at the bottom centre of the plinth, front faces +Z, 1 voxel = 0.025 world
//   units (the fox's prop scale): 0.5-0.7 units tall.
// - group.userData = { id, shape, tier, locked, height, width, glints: [Vector3 local] }.
//   `glints` are sparkle spots (rims, tips) a UI can twinkle at.
// - Geometry is built once per shape + tier and shared: never dispose it, just drop the group.
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';

export const TROPHY_VOXEL = 0.025;
const FV = TROPHY_VOXEL;

// ---------------------------------------------------------------- palette
// metal ramps, dark -> light; index 5 is the white-hot specular pixel
const METALS = {
  gold: [0x4a2204, 0x8a4a0a, 0xc8841a, 0xf2b630, 0xffe27a, 0xfffbe2],
  silver: [0x30344a, 0x5e657e, 0x949cb4, 0xc4cbdc, 0xeaedf6, 0xffffff],
  bronze: [0x3a1808, 0x6a3216, 0x9e5628, 0xc87c44, 0xe8aa74, 0xffe0c2],
};
const SPEC = { gold: 0xb08a40, silver: 0xa0a4b4, bronze: 0x9a6a40 };
const EMI = { gold: 0x2a1500, silver: 0x14161c, bronze: 0x1c0d04 };
const LACQ = [0x120806, 0x1e100a, 0x2c180e, 0x3e2414, 0x56321c];
const EN = {
  red: [0x56081a, 0x901428, 0xc82440, 0xee5670, 0xffa4b2],
  blue: [0x0c2858, 0x1a4c94, 0x2c78ce, 0x60acee, 0xb0dcff],
  green: [0x0a3820, 0x186838, 0x2c9850, 0x60c678, 0xb0f0b8],
  pink: [0x782848, 0xae4870, 0xde789e, 0xf6a8c2, 0xffdcea],
  white: [0x86889a, 0xb8bac8, 0xe0e2ec, 0xf4f4fa, 0xffffff],
  glass: [0x48788a, 0x78b2c4, 0xacdeea, 0xd6f2fa, 0xf2fdff],
  wood: [0x281006, 0x48200c, 0x683216, 0x884822, 0xa66032],
  orange: [0x6a2410, 0x9c3a14, 0xd85a1c, 0xf6862e, 0xffc078],
};
const INK = 0x140a0c;

/** Shape + tier per achievement id (src/data/achievements.js). */
export const TROPHY_LOOKS = {
  a_first: { shape: 'fishcup', tier: 'bronze' },
  a_love: { shape: 'heartcup', tier: 'bronze' },
  a_full: { shape: 'brimming', tier: 'bronze' },
  a_happy10: { shape: 'paw', tier: 'bronze' },
  a_research5: { shape: 'flask', tier: 'bronze' },
  a_hybrid: { shape: 'helix', tier: 'silver' },
  a_golden: { shape: 'goldfish', tier: 'gold' },
  a_dams: { shape: 'beaver', tier: 'silver' },
  a_big: { shape: 'wave', tier: 'silver' },
  a_rating: { shape: 'star', tier: 'gold' },
  a_ceo: { shape: 'briefcase', tier: 'gold' },
  a_week: { shape: 'plaque', tier: 'silver' },
  a_rich: { shape: 'moneybag', tier: 'gold' },
  a_month: { shape: 'grandcup', tier: 'gold' },
  a_dex: { shape: 'book', tier: 'gold' },
};
export const TROPHY_TIERS = Object.keys(METALS);

/** { shape, tier } for an achievement id (unknown ids get a bronze cup). */
export function trophyLook(id) {
  return TROPHY_LOOKS[id] || { shape: 'cup', tier: 'bronze' };
}

// ---------------------------------------------------------------- shading
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LX = -0.6, LY = 0.66, LZ = 0.45; // top-left-front key light (normalised below)
const LN = Math.hypot(LX, LY, LZ);
// polished metal from a normal: hard bands plus a dark "horizon" reflection on the
// shadow side, which is what makes chrome read as chrome in pixel art
function shine(R, nx, ny, nz, bias = 0) {
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const d = (nx * LX + ny * LY + nz * LZ) / LN;
  let i = d > 0.84 ? 5 : d > 0.56 ? 4 : d > 0.24 ? 3 : d > -0.14 ? 2 : d > -0.5 ? 1 : 0;
  if (i >= 2 && i <= 4 && nx > 0.25 && Math.abs(ny) < 0.3) i -= 1;
  return R[clamp(i + bias, 0, R.length - 1)];
}
// stylised chrome for round things, by azimuth (0 = facing the viewer): a white-hot
// stripe left of centre, a dark band right of centre and a reflected rim light
const CHROME = [[-1.2, 2], [-0.8, 3], [-0.46, 5], [-0.16, 4], [0.24, 3], [0.68, 1], [1.12, 0], [1.6, 2]];
function chrome(R, nx, ny, nz, bias = 0) {
  const a = Math.atan2(nx, nz);
  let i = 1;
  if (a > -1.6 && a <= 1.6) { i = 2; for (const [lim, k] of CHROME) if (a <= lim) { i = k; break; } }
  const l = Math.hypot(nx, ny, nz) || 1, up = ny / l;
  if (up > 0.62) i = Math.max(i, 3) + 1; else if (up > 0.3) i += 1; else if (up < -0.55) i -= 1;
  return R[clamp(i + bias, 0, R.length - 1)];
}
const hash = (x, y, z) => {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- builder
// One part = one VoxelModel (+ transform). Voxel (x, y, z) spans [x, x + 1] etc.
class Part {
  constructor(R) {
    this.v = new VoxelModel();
    this.R = R;
    this.pos = [0, 0, 0]; // voxels, in the trophy's space
    this.rot = [0, 0, 0];
    this.pivot = [0, 0, 0];
  }
  set(x, y, z, c) { this.v.set(x, y, z, c); return this; }
  // filled disk on row y around (cx, cz) (grid corner coordinates); col(px, pz, d, x, z)
  disk(y, r, col, cx = 0, cz = 0) {
    const n = Math.ceil(r + Math.abs(cx) + Math.abs(cz)) + 1;
    for (let x = -n; x <= n; x++)
      for (let z = -n; z <= n; z++) {
        const px = x + 0.5 - cx, pz = z + 0.5 - cz, d = Math.hypot(px, pz);
        if (d <= r) this.v.set(x, y, z, typeof col === 'function' ? col(px, pz, d, x, z) : col);
      }
    return this;
  }
  // solid of revolution, one radius per row; `hollow` darkens the top as a cup's inside
  lathe(y0, radii, { hollow = false, inside = null, ramp = this.R, bias = 0, cx = 0, cz = 0 } = {}) {
    const n = radii.length;
    radii.forEach((r, i) => {
      if (!(r > 0)) return;
      const rp = radii[i - 1] ?? r, rn = radii[i + 1] ?? 0;
      const slope = clamp((rp - (radii[i + 1] ?? r)) * 0.7, -1.2, 1.2);
      const top = hollow && i === n - 1;
      this.disk(y0 + i, r, (px, pz, d, x, z) => {
        if (top && d < r - 1.05) return typeof inside === 'function' ? inside(px, pz, d, x, z) : inside ?? ramp[0];
        const up = d > rn - 0.3 ? 0.55 : 0; // exposed from above
        const dd = Math.max(d, 0.6);
        return chrome(ramp, px / dd, slope + up, pz / dd, bias + (top ? 1 : 0));
      }, cx, cz);
    });
    return y0 + n;
  }
  // ellipsoid shaded by its normal; col(x, y, z, nx, ny, nz) may override
  ell(cx, cy, cz, rx, ry, rz, { ramp = this.R, col = null, bias = 0 } = {}) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz); z++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          if (dx * dx + dy * dy + dz * dz > 1) continue;
          const c = col ? col(x, y, z, dx / rx, dy / ry, dz / rz) : null;
          this.v.set(x, y, z, c ?? chrome(ramp, dx / rx, dy / ry, dz / rz, bias));
        }
    return this;
  }
  box(x0, y0, z0, x1, y1, z1, col) { this.v.box(x0, y0, z0, x1, y1, z1, col); return this; }
  // metal box with bevelled shading: faces get their own band, edges catch the light
  mbox(x0, y0, z0, x1, y1, z1, { ramp = this.R, bias = 0 } = {}) {
    return this.box(x0, y0, z0, x1, y1, z1, (x, y, z) => {
      const nx = x === x0 ? -1 : x === x1 ? 1 : 0, ny = y === y1 ? 1 : y === y0 ? -1 : 0, nz = z === z1 ? 1 : z === z0 ? -1 : 0;
      const edge = (nx !== 0) + (ny !== 0) + (nz !== 0) >= 2;
      return shine(ramp, nx * 0.8, ny, nz || 0.4, bias + (edge && ny >= 0 && nx <= 0 ? 1 : 0));
    });
  }
  // 2D picture (rows top -> bottom) puffed into a rounded relief: thickness grows with
  // the distance to the outline; chars map to { ramp, k (max half-thickness), flat }
  relief(rows, { x0 = null, yTop = null, zc = 0, k = 2, map = {}, sheen = true } = {}) {
    const H = rows.length, W = Math.max(...rows.map((r) => r.length));
    const at = (i, j) => (i < 0 || j < 0 || i >= H || j >= rows[i].length ? '.' : rows[i][j]);
    const X0 = x0 ?? -Math.floor(W / 2), Y0 = yTop ?? H - 1;
    // chamfer distance to the outside
    const dist = rows.map((r) => [...r].map((c) => (c === '.' ? 0 : 99)));
    for (let pass = 0; pass < 2; pass++)
      for (let ii = 0; ii < H; ii++)
        for (let jj = 0; jj < W; jj++) {
          const i = pass ? H - 1 - ii : ii, j = pass ? W - 1 - jj : jj;
          if (!dist[i] || !(dist[i][j] > 0)) continue;
          const s = pass ? 1 : -1;
          const a = dist[i + s]?.[j] ?? 0, b = dist[i]?.[j + s] ?? 0;
          dist[i][j] = Math.min(dist[i][j], a + 1, b + 1);
        }
    for (let i = 0; i < H; i++)
      for (let j = 0; j < rows[i].length; j++) {
        const ch = rows[i][j];
        if (ch === '.' || ch === ' ') continue;
        const m = map[ch] || {};
        const ramp = m.ramp || this.R;
        const kk = m.k ?? Math.min(k, dist[i][j]);
        // bevel normal: away from empty neighbours
        let nx = 0, ny = 0;
        for (let di = -1; di <= 1; di++)
          for (let dj = -1; dj <= 1; dj++) {
            if (!di && !dj) continue;
            const c = at(i + di, j + dj);
            if (c === '.' || c === ' ') { nx += dj; ny -= di; }
          }
        let c;
        if (m.color != null) c = m.color;
        else {
          let bias = m.bias || 0;
          if (sheen && !m.flat && (j - i + 64) % 9 < 2 && nx === 0 && ny === 0) bias += 1;
          c = shine(ramp, nx * 0.42, ny * 0.42, 1, bias);
        }
        const x = X0 + j, y = Y0 - i;
        const z0 = zc - Math.max(1, kk), z1 = zc + Math.max(1, kk) - 1;
        for (let z = z0; z <= z1; z++) this.v.set(x, y, z, z === z1 && m.front != null ? m.front : c);
        if (m.raise) this.v.set(x, y, z1 + 1, m.raise);
      }
    return this;
  }
}

// Shared bits (all centred on the x/z grid corner 0, 0)
// lacquered wooden plinth with a metal trim ring and a little name plate
function plinth(p, w = 6, h = 2) {
  const R = p.R;
  p.box(-w, 0, -w, w - 1, h - 1, w - 1, (x, y, z) => {
    if (y === h - 1 && (x === -w || z === w - 1)) return LACQ[4];
    if (x === w - 1 || z === -w) return LACQ[1];
    return hash(x, y, z) < 0.12 ? LACQ[3] : LACQ[2];
  });
  p.disk(h, w - 0.6, (px, pz, d) => chrome(R, px / d, 0.45, pz / d, 0)); // rounded trim
  p.box(-w + 2, h + 1, -w + 2, w - 3, h + 2, w - 3, (x, y, z) => (y === h + 2 && (z === w - 3 || x === -w + 2) ? LACQ[4] : LACQ[2]));
  p.box(-2, h + 1, w - 2, 1, h + 2, w - 2, (x, y) => (y === h + 2 ? R[4] : x === 1 ? R[2] : R[3]));
  return h + 3;
}
function stem(p, y0, h = 3, r = 1.25, knotAt = 1) {
  const radii = [];
  for (let i = 0; i < h; i++) radii.push(i === knotAt ? r + 1.1 : r);
  return p.lathe(y0, radii);
}
// C-shaped handles hugging the bowl rows [yA..yB] (yA top); r(y) gives the bowl radius
function handles(p, yA, yB, r, { out = 2, thick = 2, big = false } = {}) {
  const R = p.R;
  const span = yA - yB;
  for (const s of [-1, 1])
    for (let k = 0; k <= span; k++) {
      const y = yA - k;
      const edge = Math.floor(r(y) - 0.5);
      const u = span ? k / span : 0;
      const reach = Math.round(1 + (out - 1) * Math.sin(u * Math.PI)) + (big ? 1 : 0);
      const xs = s > 0 ? [edge + reach] : [-edge - 1 - reach];
      if (k === 0 || k === span) for (let q = 1; q < reach; q++) xs.push(s > 0 ? edge + q : -edge - 1 - q);
      for (const x of xs)
        for (let z = -Math.floor(thick / 2); z < Math.ceil(thick / 2); z++) p.set(x, y, z, chrome(R, s * 0.9, 0.5 - u, 0.6));
    }
}
const parse = (s) => s.trim().split('\n').map((r) => r.trim());

// fish templates (facing right): f = fin (thin), e = eye, g = gill line, m = mouth
const FISH_BIG = parse(`
.........fffff.......
.......fffffff.......
ff....###########....
fff..#############...
.fff################.
..ff#########g##e####
.fff#########g#######
fff..########g######m
ff....#############..
.......fff....fff....
........ff.....ff....`);
const FISH_SMALL = parse(`
.....fff....
ff..######..
.fff####e##.
ff..#######m
......ff....`);
const SEVEN = parse(`
#######
#######
....###
...###.
..###..
..###..
.###...
.###...`);
const DOLLAR = parse(`
..#..
.####
#.#..
.###.
..#.#
####.
..#..`);
const WAVE = parse(`
.........wwwwww...
......wwww####ww..
....ww###########.
...w####....######
..w###.......#####
..###.........###.
.###..........##..
.###..............
####..............
#####.............
######............
########..........
###########.......
##################`);

// ---------------------------------------------------------------- shapes
// Each builder fills parts[0] (and may push more parts); returns glint spots (voxel coords).
const SHAPES = {
  cup(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = stem(p, y, 3);
    const radii = [2.2, 3.4, 4.3, 4.9, 5.3, 5.6, 5.8, 6.1];
    const top = p.lathe(y, radii, { hollow: true }) - 1;
    handles(p, top - 1, top - 5, (yy) => radii[yy - y] ?? 4, { out: 3 });
    return [[-5, top, 1], [0, y + 1, 3]];
  },

  fishcup(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = stem(p, y, 3);
    const radii = [2.2, 3.3, 4.2, 4.8, 5.2, 5.5, 5.7];
    const top = p.lathe(y, radii, { hollow: true, inside: EN.blue[1] }) - 1;
    handles(p, top - 1, top - 4, (yy) => radii[yy - y] ?? 4, { out: 2 });
    // a little fish leaping out of the water
    const f = new Part(R);
    f.relief(FISH_SMALL, { k: 1, map: { f: { k: 1, bias: 1 }, e: { color: INK }, m: { color: R[0] } } });
    f.pivot = [0, 2.5, 0];
    f.pos = [0.5, top + 4, 0];
    f.rot = [0, 0, 0.7];
    parts.push(f);
    return [[-5, top, 1], [3, top + 6, 1]];
  },

  heartcup(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = stem(p, y, 2, 1.25, 0);
    const radii = [2.0, 3.2, 4.0, 4.5, 4.7];
    const top = p.lathe(y, radii) - 1;
    handles(p, top, top - 3, (yy) => radii[yy - y] ?? 4, { out: 2 });
    // ruby heart in a metal frame
    const rows = [];
    const W = 15, H = 13;
    for (let i = 0; i < H; i++) {
      let s = '';
      for (let j = 0; j < W; j++) {
        const u = ((j + 0.5) / W - 0.5) * 2.7, v = (0.55 - (i + 0.5) / H) * 2.75;
        const f = (u * u + v * v - 1) ** 3 - u * u * v * v * v;
        s += f <= 0 ? '#' : '.';
      }
      rows.push(s);
    }
    // frame = cells touching the outside
    const framed = rows.map((r, i) => [...r].map((c, j) => {
      if (c === '.') return '.';
      const out = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([a, b]) => (rows[i + a]?.[j + b] ?? '.') === '.');
      return out ? '#' : 'r';
    }).join(''));
    const h = new Part(R);
    h.relief(framed, { k: 2, map: { r: { ramp: EN.red, k: 1, bias: 0 } } });
    h.pos = [-0.5, top - 1, 0]; // the point tucks into the cup
    parts.push(h);
    return [[-4, top + 11, 2], [3, top + 9, 2]];
  },

  brimming(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = stem(p, y, 2, 1.25, 0);
    const radii = [3.0, 4.4, 5.4, 6.1, 6.6, 6.9];
    const top = p.lathe(y, radii, { hollow: true, inside: (px, pz) => (hash(Math.round(px * 3), 7, Math.round(pz * 3)) < 0.2 ? EN.blue[4] : EN.blue[2]) }) - 1;
    handles(p, top - 1, top - 3, (yy) => radii[yy - y] ?? 4, { out: 2 });
    // three fish poking out of the water
    const fish = [[-2.5, 0.9, EN.orange, -0.2], [2.2, 1.3, EN.blue, 0.35], [0, 2.1, EN.green, 1.1]];
    for (const [x, rz, ramp, ry] of fish) {
      const f = new Part(ramp);
      f.relief(FISH_SMALL, { k: 1, map: { f: { k: 1, bias: 1 }, e: { color: INK }, m: { color: ramp[0] } } });
      f.pivot = [0, 1.5, 0];
      f.pos = [x, top + 3.5, rz > 1.5 ? -1.5 : 1];
      f.rot = [0, ry, rz];
      parts.push(f);
    }
    return [[-6, top, 1], [5, top, -1]];
  },

  paw(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = p.lathe(y, [2.0, 2.0, 2.3, 2.6]);
    // palm + four toes, pink beans
    const W = 17, H = 17, rows = [];
    for (let i = 0; i < H; i++) {
      let s = '';
      for (let j = 0; j < W; j++) {
        const x = j - 8, yy = 16 - i; // yy up
        const palm = ((x / 6.1) ** 2 + ((yy - 5.6) / 5.4) ** 2) <= 1;
        let toe = false, bean = false;
        for (const a of [-0.95, -0.33, 0.33, 0.95]) {
          const tx = Math.sin(a) * 7.0, ty = 5.8 + Math.cos(a) * 6.2;
          const d = Math.hypot(x - tx, yy - ty);
          if (d <= 2.35) toe = true;
          if (d <= 1.2) bean = true;
        }
        const pad = (x / 3.4) ** 2 + ((yy - 4.6) / 2.7) ** 2 <= 1;
        s += bean || (pad && palm) ? 'p' : palm || toe ? '#' : '.';
      }
      rows.push(s);
    }
    const q = new Part(R);
    q.relief(rows, { k: 2, map: { p: { ramp: EN.pink, k: 2 } } });
    q.pos = [-0.5, y - 1, 0];
    parts.push(q);
    return [[-6, y + 13, 2], [6, y + 15, 2]];
  },

  flask(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = p.lathe(y, [5.4]); // metal foot ring
    const body = [5.6, 5.7, 5.4, 4.8, 4.0, 3.2, 2.4, 1.8, 1.8, 1.8];
    // glass body, liquid in the lower half (the liquid shows through as the front colour)
    body.forEach((r, i) => {
      const yy = y + i;
      p.disk(yy, r, (px, pz, d) => {
        const liquid = i <= 3;
        if (i === 3 && hash(Math.round(px * 2), yy, Math.round(pz * 2)) < 0.25) return EN.green[4]; // bubbles at the surface
        return chrome(liquid ? EN.green : EN.glass, px / Math.max(d, 0.6), (body[i - 1] ?? r) - (body[i + 1] ?? r), pz / Math.max(d, 0.6), liquid ? (i === 3 ? 0 : -1) : 0);
      });
    });
    const ny = y + body.length;
    p.lathe(ny, [2.4, 2.2]); // metal lip
    // bubbles
    p.ell(0.5, ny + 4, 0.5, 1.4, 1.4, 1.4, { ramp: EN.green, bias: 1 });
    p.ell(-1.5, ny + 7, 0.5, 0.9, 0.9, 0.9, { ramp: EN.green, bias: 1 });
    return [[-4, y + 2, 4], [-1, ny + 1, 2]];
  },

  helix(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = p.lathe(y, [3.2, 2.0]);
    const y0 = y, y1 = y + 17;
    for (let yy = y0; yy <= y1; yy++) {
      const a = (yy - y0) * 0.42;
      for (const ph of [0, Math.PI]) {
        const cx = Math.cos(a + ph) * 3.4, cz = Math.sin(a + ph) * 3.4;
        p.disk(yy, 1.15, (px, pz) => chrome(R, cx + px, 0.2, cz + pz, ph ? 0 : 1), cx, cz);
      }
      if ((yy - y0) % 3 === 1) {
        // rung between the strands
        const ramp = ((yy - y0) / 3) % 2 < 1 ? EN.pink : EN.blue;
        for (let k = -3; k <= 3; k++) {
          const x = Math.cos(a) * k, z = Math.sin(a) * k;
          p.set(Math.floor(x), yy, Math.floor(z), ramp[Math.abs(k) < 2 ? 3 : 2]);
        }
      }
    }
    p.ell(0, y1 + 2.5, 0, 2, 2, 2, { bias: 1 });
    return [[-1, y1 + 3, 1], [3, y0 + 6, 3]];
  },

  goldfish(R, parts) {
    const p = parts[0];
    let y = plinth(p, 7, 2);
    // a splash for the fish to leap from
    y = p.lathe(y, [2.4, 1.6, 1.4]);
    for (const [x, z, h] of [[-3, 1, 2], [3, 0, 3], [1, 3, 1], [-1, -2, 2]]) for (let k = 0; k < h; k++) p.set(x, y - 1 + k, z, k === h - 1 ? EN.white[4] : EN.glass[2]);
    const f = new Part(R);
    f.relief(FISH_BIG, { k: 3, map: { f: { k: 1, bias: 1 }, e: { color: INK }, g: { bias: -2 }, m: { color: R[0] } } });
    f.pivot = [0, 5, 0];
    f.pos = [-0.5, y + 9, 0];
    f.rot = [0, 0, 0.55];
    parts.push(f);
    return [[-6, y + 4, 3], [6, y + 15, 3], [0, y + 11, 3]];
  },

  beaver(R, parts) {
    const p = parts[0];
    let y = plinth(p, 6, 2);
    // flat tail behind
    p.box(-3, y, -6, 2, y, -2, (x, yy, z) => ((x + z) % 2 ? R[1] : R[2]));
    // body, head, ears, snout
    p.ell(0, y + 5.2, 0, 4.1, 5.0, 3.5);
    p.ell(0, y + 11.6, 0.4, 3.4, 3.2, 3.1);
    p.ell(-2.8, y + 14.3, -0.5, 1.1, 1.1, 0.9, { bias: 1 });
    p.ell(2.8, y + 14.3, -0.5, 1.1, 1.1, 0.9);
    p.box(-1, y + 9, 3, 0, y + 11, 4, (x, yy, z) => (yy === y + 11 && z === 4 ? INK : R[3]));
    p.box(-2, y + 10, 3, 1, y + 10, 3, R[3]);
    // teeth + eyes
    p.set(-1, y + 8, 4, EN.white[3]); p.set(0, y + 8, 4, EN.white[2]);
    p.set(-2, y + 12, 3, INK); p.set(1, y + 12, 3, INK);
    // arms hugging a log
    const log = new Part(EN.wood);
    for (let i = 0; i < 10; i++) log.disk(i - 5, 1.4, (px, pz, d) => (i === 0 || i === 9 ? (d < 0.8 ? EN.wood[2] : EN.wood[4]) : shine(EN.wood, 0, px, pz)));
    log.rot = [0, 0, Math.PI / 2];
    log.pos = [0, y + 5.5, 4.5];
    parts.push(log);
    p.ell(-3, y + 6.4, 2.6, 1.3, 1.6, 1.3, { bias: 1 });
    p.ell(3, y + 6.4, 2.6, 1.3, 1.6, 1.3);
    // feet
    p.ell(-2.2, y + 0.6, 3.0, 1.4, 0.9, 1.6);
    p.ell(2.2, y + 0.6, 3.0, 1.4, 0.9, 1.6);
    return [[-3, y + 14, 2], [3, y + 10, 4]];
  },

  wave(R, parts) {
    const p = parts[0];
    const y = plinth(p, 6, 2);
    const q = new Part(R);
    q.relief(WAVE, { k: 2, map: { w: { ramp: EN.white, k: 2, bias: 1 } } });
    q.pos = [0, y, 0];
    parts.push(q);
    return [[4, y + 13, 3], [-5, y + 3, 3]];
  },

  star(R, parts) {
    const p = parts[0];
    let y = plinth(p);
    y = stem(p, y, 4, 1.25, 2);
    const N = 17, rows = [];
    const Ro = 8.4, Ri = 3.5, sec = (Math.PI * 2) / 5;
    const P0 = [0, Ro], P1 = [Ri * Math.sin(sec / 2), Ri * Math.cos(sec / 2)];
    for (let i = 0; i < N; i++) {
      let s = '';
      for (let j = 0; j < N; j++) {
        const x = j - 8, yy = 8 - i + 0.6;
        const r = Math.hypot(x, yy);
        let a = Math.atan2(x, yy);
        a = ((a % sec) + sec) % sec;
        if (a > sec / 2) a = sec - a;
        const qx = r * Math.sin(a), qy = r * Math.cos(a);
        const cross = (P1[0] - P0[0]) * (qy - P0[1]) - (P1[1] - P0[1]) * (qx - P0[0]);
        s += cross <= 0.5 ? (r < 1.6 ? 'd' : '#') : '.';
      }
      rows.push(s);
    }
    const q = new Part(R);
    q.relief(rows, { k: 2, map: { d: { ramp: EN.white, k: 2, raise: EN.white[4], bias: 1 } } });
    q.pos = [-0.5, y - 5, 0]; // bottom inner vertex rests on the stem
    parts.push(q);
    return [[-1, y + 16, 2], [-8, y + 10, 2], [7, y + 10, 2]];
  },

  briefcase(R, parts) {
    const p = parts[0];
    let y = plinth(p, 7, 2);
    y = p.lathe(y, [2.2, 1.4]);
    const x0 = -7, x1 = 6, y0 = y, y1 = y + 10, z0 = -2, z1 = 2;
    p.mbox(x0, y0, z0, x1, y1, z1);
    // lid seam, clasps, handle, monocle emblem
    for (let x = x0; x <= x1; x++) p.set(x, y1 - 3, z1, R[1]);
    for (const cx of [-5, 4]) { p.box(cx, y1 - 4, z1 + 1, cx + 1, y1 - 2, z1 + 1, R[4]); p.set(cx, y1 - 3, z1 + 1, R[5]); }
    p.box(-2, y1 + 1, 0, 1, y1 + 1, 0, R[3]);
    p.box(-3, y1 + 1, 0, -3, y1 + 2, 0, R[4]);
    p.box(2, y1 + 1, 0, 2, y1 + 2, 0, R[2]);
    p.box(-3, y1 + 3, 0, 2, y1 + 3, 0, R[4]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      p.set(Math.round(-0.5 + Math.cos(a) * 2), Math.round(y0 + 3.5 + Math.sin(a) * 2), z1 + 1, i < 6 ? R[1] : R[0]);
    }
    p.set(2, y0 + 1, z1 + 1, R[0]); p.set(3, y0 + 0, z1 + 1, R[1]);
    return [[-6, y1, 3], [5, y1 - 3, 4]];
  },

  plaque(R, parts) {
    const p = parts[0];
    let y = plinth(p, 6, 2);
    // a mahogany shield with a silver rim and a big 7, on a little easel foot
    const W = 15, H = 18, rows = [];
    for (let i = 0; i < H; i++) {
      let s = '';
      for (let j = 0; j < W; j++) {
        const x = Math.abs(j - 7);
        const hw = i < 9 ? 7.4 : 7.4 * Math.sqrt(Math.max(0, 1 - ((i - 8) / 9.6) ** 2)) - (i - 8) * 0.12;
        const notch = i === 0 && (x === 3 || x === 4);
        s += x <= hw && !notch ? '#' : '.';
      }
      rows.push(s);
    }
    const shield = rows.map((r, i) => [...r].map((c, j) => {
      if (c === '.') return '.';
      const out = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([a, b]) => (rows[i + a]?.[j + b] ?? '.') === '.');
      if (out) return '#';
      const si = i - 4, sj = j - 4;
      if (SEVEN[si]?.[sj] === '#') return '7';
      return 'w';
    }).join(''));
    const q = new Part(R);
    q.relief(shield, { k: 1, map: { w: { ramp: EN.wood, k: 1, flat: true }, 7: { k: 1, raise: R[3], bias: 1 } } });
    // laurels
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) {
        const j = 7 + s * (5 - Math.round(i * 0.35)), ii = 6 + i * 1.6;
        q.set(-7 + j, H - 1 - Math.round(ii), 1, i % 2 ? EN.green[3] : EN.green[2]);
      }
    }
    q.pos = [-0.5, y + 1, 0];
    q.rot = [-0.12, 0, 0];
    parts.push(q);
    p.box(-3, y, -3, 2, y, -1, LACQ[3]);
    return [[-6, y + H - 1, 2], [2, y + 12, 3]];
  },

  moneybag(R, parts) {
    const p = parts[0];
    let y = plinth(p, 7, 2);
    // a few loose coins on the plinth
    for (const [cx, cz, h] of [[-4.5, 3, 2], [4.6, 2.5, 3], [4.2, -3.2, 1]])
      for (let k = 0; k < h; k++) p.disk(y + k, 2.1, (px, pz, d) => (d > 1.4 ? R[2] : k === h - 1 ? R[4] : R[3]), cx, cz);
    // the bag
    p.ell(0, y + 5.4, 0, 5.4, 5.0, 4.8);
    p.lathe(y + 10, [2.4, 1.8, 1.8]);
    p.disk(y + 11, 2.3, EN.red[2]); // red tie
    p.ell(0, y + 14, 0, 3.6, 1.6, 3.2, { bias: 1 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; p.set(Math.round(Math.cos(a) * 3.4 - 0.5), y + 15, Math.round(Math.sin(a) * 3.0 - 0.5), R[4]); }
    // engraved $
    DOLLAR.forEach((r, i) => [...r].forEach((c, j) => { if (c === '#') p.set(j - 2, y + 8 - i, 5, R[1]); }));
    return [[-4, y + 9, 3], [2, y + 15, 2]];
  },

  grandcup(R, parts) {
    const p = parts[0];
    let y = plinth(p, 7, 2);
    p.box(-5, y, -5, 4, y, 4, LACQ[3]);
    y += 1;
    y = p.lathe(y, [2.4, 1.5, 2.6, 1.5, 1.5]);
    const radii = [2.6, 3.8, 4.8, 5.5, 6.0, 6.4, 6.6, 6.8, 6.9, 7.1];
    const top = p.lathe(y, radii, { hollow: false }) - 1;
    // laurel band with rubies
    p.disk(y + 5, 6.5, (px, pz, d) => (pz > 0 && Math.abs(px) < 2 && Math.abs(px) > 0.6 ? EN.red[3] : (px * 7 + pz * 3) % 3 > 1.5 ? EN.green[3] : EN.green[2]));
    handles(p, top - 1, top - 7, (yy) => radii[yy - y] ?? 5, { out: 3, big: true });
    // lid, dome and a crowned finial
    const ly = p.lathe(top + 1, [6.2, 5.0, 3.8, 2.2, 1.2]);
    p.ell(0, ly + 1.4, 0, 1.8, 1.8, 1.8, { bias: 1 });
    for (const [x, z] of [[-1, 1], [0, -1], [1, 0]]) p.set(x, ly + 3, z, R[4]);
    p.set(0, ly + 3, 1, EN.red[3]);
    return [[-6, top, 2], [0, ly + 3, 1], [5, y + 3, 3]];
  },

  book(R, parts) {
    const p = parts[0];
    let y = plinth(p, 7, 2);
    y = p.lathe(y, [1.8, 1.4, 1.4, 2.6]);
    // open book on a tilted lectern: two page blocks with engraved lines and a fish
    const b = new Part(R);
    const W = 8;
    const liftOf = (j) => Math.round(Math.sin((j / W) * Math.PI) * 1.2 + j * 0.15);
    for (const s of [-1, 1]) {
      for (let j = 0; j < W; j++) {
        const x = s < 0 ? -1 - j : j;
        const lift = liftOf(j);
        for (let z = -5; z <= 5; z++) {
          b.set(x, lift, z, R[1]); // cover
          const edge = j === W - 1 || z === -5 || z === 5;
          const line = !edge && z % 2 === 0 && j > 0 && j < W - 2;
          b.set(x, lift + 1, z, edge ? R[4] : line ? (s < 0 ? R[2] : R[3]) : s < 0 ? R[3] : R[4]);
        }
      }
    }
    // fish emblem on the left page
    for (const [x, z] of [[-3, 0], [-4, 0], [-5, 0], [-4, 1], [-4, -1], [-6, 1], [-6, -1], [-2, 1]]) b.set(x, liftOf(-1 - x) + 1, z, EN.blue[3]);
    // red ribbon bookmark hanging over the near edge
    for (let k = 0; k < 4; k++) b.set(1, liftOf(1) + 1 - k, 6, k === 3 ? EN.red[1] : EN.red[2]);
    b.pos = [0, y + 4, 0];
    b.rot = [0.95, 0, 0];
    parts.push(b);
    return [[-7, y + 6, 4], [6, y + 5, 4]];
  },
};

// ---------------------------------------------------------------- materials + cache
const GEO = new Map(); // `${shape}:${tier}` -> { parts: [{ geo, pos, rot }], glints, box }
const MATS = new Map();
// The baked reflection bands are half self-lit, so polished metal keeps its hard
// light / dark contrast under any lighting; real lights add glints on top.
function material(tier, locked) {
  const key = locked ? 'locked' : tier;
  let m = MATS.get(key);
  if (m) return m;
  if (locked) m = new THREE.MeshLambertMaterial({ color: 0x3a2c44, emissive: 0x0e0a14 });
  else {
    m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: SPEC[tier], shininess: 34, emissive: EMI[tier] });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance += vColor.rgb * 0.52;\n#endif');
    };
    m.customProgramCacheKey = () => 'trophy-selflit';
    m.color.setScalar(0.55);
  }
  MATS.set(key, m);
  return m;
}

function built(shape, tier) {
  const key = `${shape}:${tier}`;
  let g = GEO.get(key);
  if (g) return g;
  const R = METALS[tier] || METALS.bronze;
  const parts = [new Part(R)];
  const glints = (SHAPES[shape] || SHAPES.cup)(R, parts) || [];
  const box = new THREE.Box3();
  const out = [];
  for (const p of parts) {
    const geo = p.v.build({ pivot: p.pivot, scale: FV });
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.pos[0] * FV, p.pos[1] * FV, p.pos[2] * FV),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot[0], p.rot[1], p.rot[2])),
      new THREE.Vector3(1, 1, 1),
    );
    geo.computeBoundingBox();
    box.union(geo.boundingBox.clone().applyMatrix4(m));
    out.push({ geo, pos: p.pos, rot: p.rot });
  }
  g = { parts: out, glints: glints.map(([x, y, z]) => new THREE.Vector3((x + 0.5) * FV, (y + 0.5) * FV, (z + 0.5) * FV)), box };
  GEO.set(key, g);
  return g;
}

/**
 * Build a trophy.
 * @param {object} o
 * @param {string} [o.id]      achievement id: picks shape + tier from TROPHY_LOOKS
 * @param {'gold'|'silver'|'bronze'} [o.tier]
 * @param {string} [o.shape]   one of TROPHY_SHAPES
 * @param {boolean} [o.locked] dark silhouette (not earned yet)
 * @returns {THREE.Group}
 */
export function makeTrophy({ id = null, tier = null, shape = null, locked = false } = {}) {
  const look = trophyLook(id);
  const sh = shape && SHAPES[shape] ? shape : look.shape;
  const tr = tier && METALS[tier] ? tier : look.tier;
  const b = built(sh, tr);
  const grp = new THREE.Group();
  grp.name = `trophy:${id || sh}`;
  const mat = material(tr, locked);
  for (const p of b.parts) {
    const m = new THREE.Mesh(p.geo, mat);
    m.position.set(p.pos[0] * FV, p.pos[1] * FV, p.pos[2] * FV);
    m.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    m.castShadow = false;
    grp.add(m);
  }
  const size = b.box.getSize(new THREE.Vector3());
  grp.userData = {
    id, shape: sh, tier: tr, locked: !!locked,
    height: b.box.max.y, width: Math.max(size.x, size.z),
    box: b.box.clone(),
    glints: b.glints.map((v) => v.clone()),
  };
  return grp;
}

export const TROPHY_SHAPES = Object.keys(SHAPES);
