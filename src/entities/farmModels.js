// Farm & food-storage builds (Snack Bowl, Bear Pantry, Beaver Snack Bar, Bug
// Grinder 3000, Bunny Hutch), the Destroy tool's construction markers and the
// beavers' strike sign.
//
// Bodies are chunky 0.1 voxels (1 tile = 10), small props (produce, jars,
// gears, the zapper cage, cones) use 0.05 "fine" voxels, and the crisp little
// details (signs, labels, the painted paw, wire mesh) are 2D pixel decals.
// Static geometry is built once per type + seed variant and shared; fill piles
// are ref-counted and shared by every instance showing the same pile.
//
//   farmModel(type, { seed = 1, decals = true }) -> {
//     root: THREE.Group      footprint centred on x/z 0, base at y 0, 1x1 tile, front faces +Z
//     setFill(k, items?)     k 0..1; items = produce ids (FOOD_ITEMS keys, cycled, first = bottom
//                            of the pile) for the snack bowl / pantry / snack bar
//     setState(name)         see STATES below ('idle' always works)
//     update(dt, time?)      animation (flicker, gears, puffs, flutter...)
//     dispose()              removes root, frees per-instance resources (shared geometry stays)
//     type, kind, states     extra: zap() on the grinder flashes the lamp (call when a bug is caught)
//   }
//   makeConstructionMarker({ seed = 1, size = 1, kind = 'tile', edges = 15 }) -> {
//     root, update(dt, time?), setProgress(k 0..1), close(onDone?), dispose()
//   }   tape + posts around a size x size area centred at the root (base y 0). edges bits:
//       1 = +x, 2 = -x, 4 = +z, 8 = -z sides get tape (skip sides shared with other marked tiles).
//       kind: 'tile' | 'tree' | 'forest' | 'boulder' | 'weed' | 'clutter' picks the sign pictogram.
//   makeStrikeSign() -> THREE.Group  handheld "NO PAY NO WORK" picket sign; origin = grip point,
//       stick along +Y (from -0.1 to 0.3), board (0.36 x 0.18) centred at y 0.4 facing +Z.
//
// Meshes: lit voxel meshes use the shared voxelMaterial() with userData.tintable = true (so
// StructureSystem's damage tint can swap it); glow meshes and decals are tintable = false and
// carry userData.glow / userData.decal.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial, shade, mix } from '../core/voxel.js';
import { mulberry32, hash3 } from '../core/rng.js';

export const FARM_TYPES = ['snackbowl', 'pantry', 'beaverbar', 'buggrinder', 'rabbithutch'];
export const FARM_STATES = {
  snackbowl: ['idle'],
  pantry: ['idle', 'closed', 'mouse'],
  beaverbar: ['idle', 'strike'],
  buggrinder: ['idle', 'grinding', 'full'],
  rabbithutch: ['idle'],
};

const VC = 0.1; // body voxels
const VF = 0.05; // fine voxels: fine index = 2 x coarse index (both built with pivot 0)
const PI = Math.PI, TAU = PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const pick = (h, arr) => arr[Math.floor(h * arr.length) % arr.length];
const hasDOM = typeof document !== 'undefined';

// ---------------------------------------------------------------- palette
const BARK = [0x7a4e2a, 0x8a5a30, 0x6a4424];
const BARK_D = 0x553620;
const LOG_END = 0xd8a868, LOG_RING = 0xb07e4c, LOG_CORE = 0x8a5a32;
const WOOD = [0xb48452, 0xa8784a, 0xc0905a];
const WOOD_D = 0x6a4424, WOOD_M = 0x8a5a32, WOOD_L = 0xd4a46a;
const HONEY = [0xd89a52, 0xc88a46, 0xe4aa62];
const STONE = [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72];
const MOSS = [0x6a9a3a, 0x5a8a34, 0x7aa848];
const GRASS = [0x6aa040, 0x5a9038, 0x7ab04a];
const LEAF = [0x3f8a3a, 0x4f9c44, 0x2f7034, 0x5aa84a];
const FLOWERS = [0xffffff, 0xf2c230, 0xd9529b, 0x9a86ea, 0xf07a4a];
const STRAW = [0xe0c060, 0xd0aa48, 0xecd27a, 0xc49a3e];
const IRON = 0x3a3a42, IRON_L = 0x5a5a64, METAL = 0x9aa4ac, METAL_D = 0x6a747c, CHROME = 0xd8e0e8;
const BRASS = 0xd8a840, BRASS_D = 0xa87820, BRASS_L = 0xf4d27a;
const COPPER = [0xc8763a, 0xb86a30, 0xd8884a], COPPER_D = 0x8a4a22;
const TEAL = [0x3a8274, 0x327262, 0x4a9484], TEAL_D = 0x24584c;
const BURLAP = [0xc8a46a, 0xb8945a, 0xd6b47a], BURLAP_D = 0x9a7a48;
const RED = 0xd23a2e, RED_D = 0xa82a22, CREAM = 0xf6f2ea;

// ---------------------------------------------------------------- caches
// static geometry: one per key, shared by every instance, kept for the session
const STATIC = new Map();
function sgeo(key, make, scale = VC) {
  let g = STATIC.get(key);
  if (!g) {
    const vm = make();
    g = vm.vox.size ? vm.build({ scale }) : null;
    STATIC.set(key, g);
  }
  return g;
}
// dynamic geometry (fill piles, sack shapes): ref-counted, disposed when unused
const SHARED = new Map();
function acquire(key, make, scale) {
  let e = SHARED.get(key);
  if (!e) {
    const vm = make();
    e = { geo: vm.vox.size ? vm.build({ scale }) : null, refs: 0 };
    SHARED.set(key, e);
  }
  e.refs++;
  return e.geo;
}
function release(key) {
  const e = SHARED.get(key);
  if (!e) return;
  if (--e.refs <= 0) { e.geo?.dispose(); SHARED.delete(key); }
}
let EMPTY = null;
const emptyGeo = () => EMPTY || (EMPTY = new THREE.BufferGeometry());

function vmesh(geo, { shadow = true } = {}) {
  const m = new THREE.Mesh(geo || emptyGeo(), voxelMaterial());
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.userData.tintable = true;
  if (!geo) m.visible = false;
  return m;
}
let glowShared = null;
const glowMaterial = () => glowShared || (glowShared = new THREE.MeshBasicMaterial({ vertexColors: true }));
function gmesh(geo, mat = glowMaterial()) {
  const m = new THREE.Mesh(geo || emptyGeo(), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.tintable = false;
  m.userData.glow = true;
  return m;
}

// A mesh whose geometry comes from the ref-counted cache and changes with the fill.
class Slot {
  constructor(parent, scale = VF, { shadow = true } = {}) {
    this.scale = scale;
    this.key = null;
    this.mesh = vmesh(null, { shadow });
    parent.add(this.mesh);
  }
  set(key, make) {
    if (key === this.key) return;
    const old = this.key;
    this.key = key;
    const g = key ? acquire(key, make, this.scale) : null;
    if (old) release(old);
    this.mesh.geometry = g || emptyGeo();
    this.mesh.visible = !!g;
  }
  dispose() { if (this.key) release(this.key); this.key = null; }
}

// ---------------------------------------------------------------- voxel helpers
// Fill a model's voxels with `cols[i]` picked by a stable hash (wood grain, stone, straw)
const hv = (x, y, z, s = 0) => hash3(x * 7 + s, y * 13 - s, z * 5 + s * 3);
const toneOf = (x, y, z, base, dark, light, pd = 0.12, pl = 0.1, s = 0) => {
  const h = hv(x, y, z, s);
  return h < pd ? dark : h > 1 - pl ? light : base;
};
// a few blades of grass and tiny flowers so the build feels planted (coarse voxels)
function tufts(v, rnd, n, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * 10) - 5, z = Math.floor(rnd() * 10) - 5;
    if (avoid(x, z) || v.has(x, 0, z) || v.has(x, 1, z)) continue;
    const h = 1 + Math.floor(rnd() * 2);
    for (let y = 0; y < h; y++) v.set(x, y, z, pick(rnd(), GRASS));
    if (rnd() < 0.3) v.set(x, h, z, pick(rnd(), FLOWERS));
  }
}
// fine-voxel grass blades (thinner, nicer next to fine props)
function fineTufts(v, rnd, n, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * 20) - 10, z = Math.floor(rnd() * 20) - 10;
    if (avoid(x, z)) continue;
    const h = 1 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) v.set(x + (y === 2 ? (rnd() < 0.5 ? 1 : -1) : 0), y, z, pick(rnd(), GRASS));
    if (rnd() < 0.25) v.set(x, h, z, pick(rnd(), FLOWERS));
  }
}

// ================================================================ 2D pixel decals
// Variable-width 3x5 pixel font (same glyphs as structureDecals.js)
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'], '.': ['.', '.', '.', '.', '#'], ',': ['..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '#', '.'], '!': ['#', '#', '#', '.', '#'], "'": ['#', '#', '.', '.', '.'],
  '-': ['...', '...', '###', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'], '¢': ['.#.', '###', '#..', '###', '.#.'],
};
// bold 4x6 digits for the grinder's "3000"
const BIG = {
  0: ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'], 3: ['###.', '...#', '.##.', '...#', '...#', '###.'],
};
const glyph = (ch) => GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS[' '];
function textW(s, scale = 1, bold = false) {
  const b = bold ? 1 : 0;
  let w = 0;
  for (const ch of s) w += glyph(ch)[0].length * scale + scale + b;
  return Math.max(0, w - scale - b);
}

function painter(ctx, W, H, seed = 1) {
  const rnd = mulberry32(seed >>> 0);
  const hex = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);
  const g = {
    W, H, rnd, ctx,
    px(x, y, c) { if (c == null) return; ctx.fillStyle = hex(c); ctx.fillRect(x | 0, y | 0, 1, 1); },
    rect(x, y, w, h, c) { ctx.fillStyle = hex(c); ctx.fillRect(x, y, w, h); },
    clear(x, y, w = 1, h = 1) { ctx.clearRect(x, y, w, h); },
    frame(x, y, w, h, c) { g.rect(x, y, w, 1, c); g.rect(x, y + h - 1, w, 1, c); g.rect(x, y, 1, h, c); g.rect(x + w - 1, y, 1, h, c); },
    hline(x0, x1, y, c) { g.rect(x0, y, x1 - x0 + 1, 1, c); },
    vline(x, y0, y1, c) { g.rect(x, y0, 1, y1 - y0 + 1, c); },
    speckle(x, y, w, h, cols, p = 0.12) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rnd() < p) g.px(x + i, y + j, cols[Math.floor(rnd() * cols.length)]);
    },
    // wood plank: base + grain streaks along x
    wood(x, y, w, h, base, dark, light) {
      g.rect(x, y, w, h, base);
      for (let j = 0; j < h; j++) {
        let run = 0;
        for (let i = 0; i < w; i++) {
          if (run > 0) { g.px(x + i, y + j, dark); run--; continue; }
          const r = rnd();
          if (r < 0.04) run = 1 + Math.floor(rnd() * 3);
          else if (r < 0.08 && light) g.px(x + i, y + j, light);
        }
      }
    },
    // bold: every stroke 2px wide (reads much better on tiny signs); jitter: hand-painted wobble
    text(s, x, y, c, { shadow = null, scale = 1, jitter = 0, bold = false } = {}) {
      if (shadow) g.text(s, x + 1, y + 1, shadow, { scale, bold });
      let cx = x, k = 0;
      const b = bold ? 1 : 0;
      for (const ch of s) {
        const gl = glyph(ch);
        const jy = jitter ? Math.round(Math.sin(k * 2.7 + jitter) * 0.6) : 0;
        for (let r = 0; r < 5; r++) for (let q = 0; q < gl[r].length; q++) if (gl[r][q] === '#') g.rect(cx + q * scale, y + jy + r * scale, scale + b, scale, c);
        cx += gl[0].length * scale + scale + b;
        k++;
      }
      return cx - x - scale - b;
    },
    ctext(s, y, c, o = {}) {
      const x0 = o.x0 ?? 0, w = o.w ?? W;
      return g.text(s, x0 + Math.floor((w - textW(s, o.scale || 1, o.bold)) / 2), y, c, o);
    },
    big(s, x, y, c) { // bold digits
      let cx = x;
      for (const ch of s) { const gl = BIG[ch] || BIG[0]; gl.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.px(cx + i, y + j, c); }); cx += 5; }
    },
    icon(rows, x, y, pal) {
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.' && pal[ch] != null) g.px(x + i, y + j, pal[ch]); } });
    },
    disk(cx, cy, r, c) {
      for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++)
        for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r) g.px(i, j, c);
    },
    ell(cx, cy, rx, ry, c) {
      for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++)
        for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) if (((i + 0.5 - cx) / rx) ** 2 + ((j + 0.5 - cy) / ry) ** 2 <= 1) g.px(i, j, c);
    },
    // 1px dark outline around every opaque pixel (tinted by `c`)
    outline(c) {
      const d = ctx.getImageData(0, 0, W, H).data;
      const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 128;
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) out.push([x, y]);
      for (const [x, y] of out) g.px(x, y, c);
    },
    // a bear paw print (12 x 11): four bean toes over a wide two-lobed pad
    paw(x, y, c, hi = null) {
      g.icon(PAW, x, y, { '#': c, h: hi || c });
    },
    rope(x, y0, y1, c = '#d8c090', c2 = '#a88a58') { for (let y = y0; y <= y1; y++) g.px(x, y, (y & 1) ? c : c2); },
    nail(x, y) { g.px(x, y, '#3a3a42'); },
  };
  return g;
}

const PAW = [
  '...##..##...',
  '..###..###..',
  '..###..###..',
  '.#.#....#.#.',
  '###......###',
  '###......###',
  '.#..####..#.',
  '...######...',
  '..##h#####..',
  '..########..',
  '...##..##...',
];
const INK = '#3a2414', PAINT_RED = '#c8322a', PAINT_CREAM = '#f6ecd2';
// bunny names for the hutch's carrot sign
const BUNNY_NAMES = ['HOPS', 'BUNS', 'MOCHI', 'PIP', 'NIBS', 'COCO', 'FLOPS', 'BEAN'];

// [w, h, draw(g)] in texels
const DEFS = {
  // ---------- snack bowl: a painted brown paw on the glaze (+ a cream shine)
  'bowl:paw': [12, 11, (g) => g.paw(0, 0, '#6a3a22', '#8a5232')],
  'bowl:pawblue': [12, 11, (g) => g.paw(0, 0, '#2a4a8a', '#3a5aa0')],
  // ---------- pantry: a little plank sign with a big bear paw and SNACKS
  'pantry:sign': [32, 13, (g) => {
    g.wood(0, 0, 32, 13, '#b07a46', '#94643a', '#c48c54');
    g.frame(0, 0, 32, 13, '#5a3418');
    g.clear(0, 0); g.clear(31, 0); g.clear(0, 12); g.clear(31, 12);
    g.paw(2, 1, '#4a2a16', '#6a3e22');
    g.text('BEAR', 15, 1, PAINT_CREAM);
    g.text('FOOD', 15, 7, '#f6c840');
    g.nail(1, 6); g.nail(30, 6);
  }],
  'pantry:hole': [6, 4, (g) => {
    g.rect(1, 0, 4, 4, '#1a100a'); g.rect(0, 1, 6, 3, '#1a100a'); g.px(1, 0, '#3a2414'); g.px(4, 0, '#3a2414');
  }],
  // ---------- beaver snack bar
  'bar:sign': [36, 17, (g) => {
    g.wood(0, 1, 36, 15, '#8a5a32', '#74482a', '#9a6a3a');
    g.frame(0, 1, 36, 15, '#4a2a16');
    for (const x of [0, 35]) { g.clear(x, 1); g.clear(x, 15); }
    // chewed top edge (beaver-made!)
    for (const x of [6, 7, 19, 28, 29, 30]) g.clear(x, 1);
    g.px(6, 2, '#74482a'); g.px(29, 2, '#74482a');
    g.text('SNACK', 4, 3, PAINT_CREAM, { jitter: 1.3, shadow: '#3a2010' });
    g.text('BAR', 8, 9, '#f6c840', { jitter: 2.1, shadow: '#3a2010' });
    // a carrot + paint drips
    g.icon(['....gg', '...g.g', '..oo..', '.ooo..', 'ooo...', 'oo....', 'o.....'], 23, 7, { o: '#f07a1a', g: '#5ab040' });
    g.px(4, 9, PAINT_CREAM); g.px(4, 10, PAINT_CREAM); g.px(10, 15, '#f6c840');
  }],
  'bar:picto': [16, 9, (g) => {
    // beaver head  +  carrot  (=  happy beaver)
    g.ell(4, 4.6, 3.6, 3.6, '#8c5530');
    g.px(1, 1, '#8c5530'); g.px(7, 1, '#8c5530');
    g.px(2, 3, '#1a1010'); g.px(6, 3, '#1a1010');
    g.rect(3, 5, 3, 1, '#3a2224'); g.rect(3, 6, 1, 2, '#fff8e8'); g.rect(5, 6, 1, 2, '#fff8e8');
    g.px(1, 5, '#e8968a'); g.px(7, 5, '#e8968a');
    g.text('+', 9, 2, PAINT_CREAM);
    g.icon(['..gg', '.oog', 'ooo.', 'oo..', 'o...'], 12, 2, { o: '#f07a1a', g: '#5ab040' });
  }],
  'bar:tips': [16, 7, (g) => {
    g.rect(0, 0, 16, 7, '#f2ead6'); g.frame(0, 0, 16, 7, '#b8a888');
    g.text('TIPS', 1, 1, '#2a6a3a');
  }],
  // ---------- strike sign: hand-painted on cardboard
  'strike:sign': [36, 19, (g) => {
    g.rect(0, 0, 36, 19, '#d8b47a');
    g.speckle(0, 0, 36, 19, ['#c8a46a', '#e4c48a', '#c09a60'], 0.18);
    g.frame(0, 0, 36, 19, '#a8844a');
    g.clear(0, 0); g.clear(35, 0); g.clear(35, 18); g.clear(34, 18); g.px(34, 17, '#a8844a'); // torn corners
    g.text('NO PAY', 6, 2, PAINT_RED, { jitter: 0.7, scale: 1 });
    g.text('NO WORK', 4, 10, PAINT_RED, { jitter: 1.9 });
    g.hline(4, 30, 16, '#1a1a1e'); g.px(31, 15, '#1a1a1e'); // underline swoosh
    g.px(8, 8, PAINT_RED); g.px(27, 16, PAINT_RED); // drips
  }],
  'strike:back': [36, 19, (g) => {
    g.rect(0, 0, 36, 19, '#c8a46a');
    g.speckle(0, 0, 36, 19, ['#b8945a', '#d4b47a'], 0.2);
    for (let x = 2; x < 34; x += 4) g.vline(x, 1, 17, '#bc9a62'); // corrugation
    g.frame(0, 0, 36, 19, '#a8844a');
    g.clear(0, 0); g.clear(35, 0); g.clear(0, 18); g.clear(1, 18); g.px(1, 17, '#a8844a');
  }],
  // ---------- bug grinder
  'grinder:plate': [44, 19, (g) => {
    g.rect(0, 0, 44, 19, '#d8a840'); g.frame(0, 0, 44, 19, '#8a6420'); g.hline(1, 42, 1, '#f4d27a');
    g.clear(0, 0); g.clear(43, 0); g.clear(0, 18); g.clear(43, 18);
    g.ctext('BUG GRINDER', 3, '#4a2e10');
    g.big('3000', 12, 10, '#a82a22');
    g.px(2, 2, '#8a6420'); g.px(41, 2, '#8a6420'); g.px(2, 16, '#8a6420'); g.px(41, 16, '#8a6420'); // rivets
    g.icon(['.#', '#.', '##', '.#', '#.'], 4, 10, { '#': '#4a2e10' }); g.icon(['.#', '#.', '##', '.#', '#.'], 37, 10, { '#': '#4a2e10' }); // bolts
  }],
  'grinder:gauge': [11, 11, (g) => {
    g.disk(5.5, 5.5, 5.5, '#3a3a42'); g.disk(5.5, 5.5, 4.4, '#f6f2ea');
    for (const [x, y] of [[2, 6], [3, 3], [5, 2], [8, 3], [9, 6]]) g.px(x, y, '#3a3a42');
    g.px(8, 4, '#d23a2e'); g.px(9, 5, '#d23a2e');
    g.px(5, 5, '#3a3a42');
  }],
  'grinder:port': [11, 11, (g) => {
    g.disk(5.5, 5.5, 5.5, '#8a6420'); g.disk(5.5, 5.5, 4.6, '#d8a840'); g.disk(5.5, 5.5, 3.6, '#1e2a22');
    // ground-up bug mush swirling inside
    for (const [x, y, c] of [[4, 6, '#5a7a2a'], [5, 7, '#6a4a2a'], [6, 7, '#5a7a2a'], [7, 6, '#8aa040'], [3, 5, '#6a4a2a'], [6, 5, '#4a6a22'], [5, 4, '#2e3a2a'], [7, 4, '#3a2a1a']]) g.px(x, y, c);
    g.px(3, 3, '#e8f6f0'); g.px(4, 3, '#a8c8c0'); g.px(3, 4, '#a8c8c0'); // glint
    g.px(1, 5, '#f4d27a'); g.px(9, 5, '#8a6420'); g.px(5, 1, '#f4d27a'); g.px(5, 9, '#8a6420'); // rivets
  }],
  'grinder:needle': [11, 11, (g) => { g.vline(5, 2, 5, '#d23a2e'); g.px(5, 6, '#3a3a42'); }],
  'grinder:hazard': [9, 8, (g) => {
    for (let j = 0; j < 8; j++) g.hline(4 - Math.floor(j / 2), 4 + Math.floor(j / 2), j, '#1a1a1e');
    for (let j = 2; j < 7; j++) g.hline(5 - Math.floor(j / 2), 3 + Math.floor(j / 2), j, '#f6c830');
    g.px(4, 2, '#f6c830');
    g.icon(['.#', '#.', '##', '.#'], 3, 3, { '#': '#1a1a1e' });
  }],
  'grinder:label': [19, 21, (g) => {
    g.rect(0, 0, 19, 21, '#f2ead6'); g.frame(0, 0, 19, 21, '#5aa83a'); g.frame(1, 1, 17, 19, '#e8e0c8');
    // ladybug
    g.ell(9.5, 6.4, 4.1, 3.7, '#d82a2a');
    g.ell(9.5, 3.4, 2.2, 1.4, '#1a1a1e');
    g.vline(9, 4, 9, '#1a1a1e');
    for (const [x, y] of [[7, 5], [12, 5], [7, 8], [12, 8]]) g.px(x, y, '#1a1a1e');
    g.px(8, 3, '#ffffff'); g.px(10, 3, '#ffffff');
    g.px(7, 1, '#1a1a1e'); g.px(12, 1, '#1a1a1e'); // antennae
    g.px(6, 4, '#ff8a7a');
    g.ctext('BUG', 10, '#2a5a1a');
    g.ctext('BITES', 15, '#c8322a');
  }],
  // ---------- bunny hutch
  'hutch:heart': [9, 8, (g) => {
    const H = ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'];
    g.icon(H.map((r) => r.replace(/#/g, 'k')), 1, 0, { k: '#4a2a1a' });
    g.icon(['.##.##.', '#.....#', '#.....#', '#.....#', '.#...#.', '..#.#..', '...#...'], 1, 0, { '#': '#e8b07a' });
    g.icon(['..', '.#'], 2, 1, { '#': '#2a1810' });
    g.px(3, 2, '#7a4a2a'); // a sliver of the bunny bedroom
  }],
  'hutch:mesh': [20, 14, (g) => {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) if (x % 3 === 0 || y % 3 === 0) g.px(x, y, (x + y) % 2 ? '#b8c4cc' : '#d8e0e6');
    g.frame(0, 0, 20, 14, '#8a96a0');
  }],
  'hutch:mesh2': [14, 10, (g) => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) if (x % 3 === 0 || y % 3 === 0) g.px(x, y, (x + y) % 2 ? '#b8c4cc' : '#d8e0e6');
    g.frame(0, 0, 14, 10, '#8a96a0');
  }],
  ...Object.fromEntries(BUNNY_NAMES.map((n) => [`hutch:name:${n}`, [30, 11, (g) => {
    // a carrot-shaped name board pointing right
    const len = 26;
    for (let x = 0; x < len; x++) {
      const t = x / (len - 1);
      const half = Math.max(0.6, 4.6 * (1 - t * t * 0.9));
      for (let y = 0; y < 11; y++) if (Math.abs(y - 5.5 + 0.5) <= half) g.px(x + 3, y, (x + y) % 7 === 0 ? '#d86a14' : '#f08a2a');
    }
    for (const x of [8, 14, 20]) for (let y = 3; y <= 7; y++) if ((y + x) % 2) g.px(x, y, '#c85a10'); // ridges
    // leafy top
    g.icon(['g..', 'gg.', '.gG', 'GGg', '.gg', 'g..', '...'], 0, 2, { g: '#5ab040', G: '#3a8a2a' });
    g.ctext(n, 3, '#5a2a0a', { x0: 4, w: 21 });
    g.px(28, 5, '#c85a10');
  }]])),
};

// ---------------------------------------------------------------- decal textures / meshes
const texCache = new Map(), matCache = new Map(), planeCache = new Map();
function texInfo(key) {
  let t = texCache.get(key);
  if (t) return t;
  const def = DEFS[key];
  if (!def) throw new Error('farmModels: unknown decal ' + key);
  const [w, h, draw] = def;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  let seed = 11;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  draw(painter(canvas.getContext('2d'), w, h, seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  t = { key, w, h, canvas, tex };
  texCache.set(key, t);
  return t;
}
function decalMat(key, glow = false) {
  const mk = key + (glow ? '|g' : '|l');
  let m = matCache.get(mk);
  if (m) return m;
  const info = texInfo(key);
  const o = { map: info.tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, side: THREE.FrontSide };
  m = glow ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial({ ...o, color: 0xf2f2f2 });
  m.name = 'farmDecal:' + mk;
  matCache.set(mk, m);
  return m;
}
function planeGeo(w, h) {
  const k = `${w.toFixed(4)}x${h.toFixed(4)}`;
  let g = planeCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); planeCache.set(k, g); }
  return g;
}
const _zAxis = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3();
/**
 * Add a decal plane to `group`. D = texels per world unit, pos = plane centre, n = facing normal.
 * rotZ turns it in its plane. Returns the mesh.
 */
function decal(group, key, D, pos, { n = [0, 0, 1], rotZ = 0, glow = false, shadow = false } = {}) {
  if (!hasDOM) return null;
  const info = texInfo(key);
  const m = new THREE.Mesh(planeGeo(info.w / D, info.h / D), decalMat(key, glow));
  m.position.set(pos[0], pos[1], pos[2]);
  _n.set(n[0], n[1], n[2]).normalize();
  m.quaternion.setFromUnitVectors(_zAxis, _n);
  if (rotZ) m.rotateZ(rotZ);
  m.castShadow = shadow;
  m.receiveShadow = !glow;
  m.userData.tintable = false;
  m.userData.decal = key;
  m.name = 'decal:' + key;
  group.add(m);
  return m;
}
const EPS = 0.004;
const fP = (i) => (i + 1) * VC + EPS; // just outside the + face of coarse voxel i
const fN = (i) => i * VC - EPS; // just outside the - face of coarse voxel i

// ================================================================ produce (fine voxels)
// id -> [shape, base, dark, light, flag]
const ITEM = {
  blueberry: ['berries', 0x3a4ab8, 0x26307a, 0x8a9af0],
  raspberry: ['drupe', 0xd02a4a, 0x9a1834, 0xff7a90],
  strawberry: ['strawberry', 0xe8303a, 0xb01c28, 0xff7a6a],
  saskatoon: ['berries', 0x6a3a9a, 0x42246a, 0xa07ad0],
  cranberry: ['berries', 0xc0202e, 0x80141e, 0xf06a6a],
  cloudberry: ['drupe', 0xf0a040, 0xc87820, 0xffd880],
  elderberry: ['berries', 0x3a2450, 0x241434, 0x7a6a9a],
  goldenberry: ['berries', 0xffc420, 0xd8961a, 0xfff0a0],
  moonberry: ['berries', 0x9ad4ff, 0x6aa0e0, 0xeaf8ff],
  honey: ['comb', 0xf0b020, 0xc88010, 0xffe070],
  royal_jelly: ['jar', 0xfff0a0, 0xe8d070, 0xffffff],
  wildrice: ['grains', 0x8a6a3a, 0x6a4a2a, 0xb89a6a],
  pearl_rice: ['grains', 0xf4f0e0, 0xd8d0c0, 0xffffff],
  chanterelle: ['mushroom', 0xf0a030, 0xc87a18, 0xffc860],
  truffle: ['lump', 0x5a3e26, 0x3a2818, 0xffd040],
  syrup: ['bottle', 0xb8601a, 0x7a3a10, 0xf0a050],
  maple_gem: ['gem', 0xe8902a, 0xb8601a, 0xfff0b0],
  carrot: ['carrot', 0xf07a1a, 0xc85a10, 0xffa848],
  golden_carrot: ['carrot', 0xffc420, 0xd8961a, 0xfff4a0],
  lettuce: ['lettuce', 0x7ad04a, 0x4a9a30, 0xc0f088],
  clover: ['clover', 0x3ac04a, 0x268a34, 0x8ae890],
  peas: ['pod', 0x5ac03a, 0x3a8a28, 0x9ae870],
  corn: ['corn', 0xffd23a, 0xe0a818, 0xfff0a0],
  rainbow_corn: ['corn', 0xffd23a, 0xe0a818, 0xfff0a0, 1],
  pumpkin: ['pumpkin', 0xf08a2a, 0xc86a18, 0xffb050],
  giant_pumpkin: ['pumpkin', 0xf08a2a, 0xc86a18, 0xffb050, 1],
  potato: ['potato', 0xc8a060, 0x9a7840, 0xe4c488],
  radish: ['radish', 0xe04a6a, 0xa82a48, 0xff90a8],
  sunflower: ['sunhead', 0xffd23a, 0x5a3a1a, 0xffe880],
  sun_seed: ['seed', 0xffd23a, 0xd8a018, 0xfff4b0],
  bugbites: ['pellets', 0x5a7a2a, 0x6a4a2a, 0x8aa040],
};
const RAINBOW = [0xff6a8a, 0x4ab0ff, 0x6ad04a, 0xffd23a, 0x9a6ae0, 0xff9a3a];
const GREENS = [0x5ab040, 0x3a8a2a, 0x7ac850];
function itemDef(id) {
  const d = ITEM[id];
  if (d) return d;
  // unknown produce: a blob in a stable colour
  let h = 7;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = [0xe8603a, 0x8ac040, 0xd8b040, 0xb05ad0, 0x4aa0d8][h % 5];
  return ['drupe', c, shade(c, 0.72), shade(c, 1.25)];
}

/** Voxels of one produce piece, normalised so min x/y/z = 0: [[x, y, z, color], ...] */
function produceShape(id, rnd) {
  const [shape, b, d, l, flag] = itemDef(id);
  const out = [];
  const add = (x, y, z, c) => out.push([x, y, z, c]);
  const r = rnd;
  switch (shape) {
    case 'berries': {
      // a little cluster of round berries, one catching the light
      const spots = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [2, 1], [1, 2]];
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const [x, z] = spots[(i * 3 + Math.floor(r() * 2)) % spots.length]; add(x, 0, z, i === 0 ? d : b); }
      add(1, 1, Math.floor(r() * 2), l);
      break;
    }
    case 'drupe':
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) add(x, y, z, y === 1 && x === 0 && z === 1 ? l : (x + y + z) % 2 ? d : b);
      if (flag == null && r() < 0.5) add(0, 2, 0, GREENS[0]);
      break;
    case 'strawberry':
      for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) { add(x, 0, z, (x + z) % 2 ? d : b); add(x, 1, z, x === 0 && z === 1 ? l : (x + z) % 3 === 0 ? 0xf6e070 : b); }
      add(0, 2, 0, GREENS[0]); add(1, 2, 1, GREENS[1]); add(1, 2, 0, GREENS[2]);
      break;
    case 'comb': // a honeycomb chunk with a drip
      for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) add(x, 0, z, (x + z) % 2 ? d : b);
      add(1, 1, 0, l); add(0, 1, 1, b); add(2, 1, 1, l);
      break;
    case 'jar':
      for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) { add(x, 0, z, b); add(x, 1, z, x === 0 && z === 1 ? l : b); add(x, 2, z, 0xd8a840); }
      break;
    case 'grains':
      for (let i = 0; i < 6; i++) add(Math.floor(r() * 3), 0, Math.floor(r() * 3), pick(r(), [b, d, l]));
      add(1, 1, 1, l);
      break;
    case 'mushroom':
      add(1, 0, 1, 0xf6dca0);
      for (const [x, z] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) add(x, 1, z, x === 1 && z === 1 ? l : b);
      add(0, 2, 0, d); // a second little one leaning
      add(2, 1, 2, d);
      break;
    case 'lump':
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) if (!(x && y && z)) add(x, y, z, (x + z) % 2 ? d : b);
      add(0, 2, 0, b); add(1, 1, 1, l);
      break;
    case 'bottle':
      for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) add(x, y, z, y === 1 && x === 0 && z === 1 ? l : (y === 0 && z === 1 ? 0xf2ead6 : b));
      add(0, 2, 0, d); add(0, 3, 0, RED);
      break;
    case 'gem':
      add(0, 0, 0, d); add(1, 0, 0, b); add(0, 0, 1, b); add(1, 0, 1, d); add(0, 1, 1, l); add(1, 1, 0, b); add(0, 1, 0, 0xffffff);
      break;
    case 'carrot': { // lying along x, leafy top at x 0
      add(0, 1, 0, GREENS[0]); add(0, 2, 1, GREENS[1]); add(0, 1, 1, GREENS[2]);
      for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) { add(1, y, z, y && !z ? l : b); add(2, y, z, (y + z) % 2 ? d : b); }
      add(3, 0, 0, b); add(3, 0, 1, d); add(3, 1, 0, b); add(4, 0, 0, b); add(5, 0, 0, d);
      if (flag == null && id === 'golden_carrot') add(2, 2, 0, 0xffffff);
      break;
    }
    case 'lettuce':
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) add(x, 0, z, (x + z) % 2 ? d : b);
      for (const [x, z] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) add(x, 1, z, x === 1 && z === 1 ? l : b);
      add(1, 2, 1, l);
      break;
    case 'clover':
      for (const [x, z] of [[1, 0], [0, 1], [2, 1], [1, 2]]) add(x, 0, z, b);
      add(1, 0, 1, l); add(0, 0, 0, d); add(2, 0, 2, d);
      break;
    case 'pod':
      for (let x = 0; x < 4; x++) { add(x, 0, 0, d); add(x, 0, 1, x === 3 ? d : b); if (x < 3) add(x, 1, 0, x % 2 ? b : l); }
      add(4, 0, 0, GREENS[1]);
      break;
    case 'corn': {
      add(0, 0, 0, GREENS[0]); add(0, 1, 1, GREENS[2]); add(0, 0, 1, GREENS[1]); add(1, 1, 1, GREENS[0]);
      for (let x = 1; x <= 4; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
        if (x === 1 && y === 1 && z === 1) continue;
        add(x, y, z, flag ? pick(hv(x, y, z, 3), RAINBOW) : y === 1 && (x + z) % 2 ? l : (x + y + z) % 2 ? d : b);
      }
      add(5, 0, 0, d);
      break;
    }
    case 'pumpkin': {
      const R = flag ? 2.9 : 2.1, H = flag ? 4 : 3, cx = flag ? 2.5 : 1.5;
      for (let x = 0; x <= cx * 2; x++) for (let z = 0; z <= cx * 2; z++) for (let y = 0; y < H; y++) {
        const dx = x - cx, dz = z - cx, dy = (y + 0.5 - H / 2) / (H / 2);
        if (Math.hypot(dx, dz) > R * Math.sqrt(Math.max(0, 1 - dy * dy * 0.55))) continue;
        const rib = Math.floor(((Math.atan2(dz, dx) + PI) / TAU) * (flag ? 10 : 8)) % 2;
        add(x, y, z, y === H - 1 && dx < 0 && dz > 0 ? l : rib ? d : b);
      }
      add(Math.round(cx), H, Math.round(cx), 0x6a5a2a); add(Math.round(cx) + 1, H, Math.round(cx), GREENS[0]);
      break;
    }
    case 'potato':
      for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) add(x, 0, z, (x * 3 + z) % 4 === 0 ? 0x7a5a30 : (x + z) % 2 ? d : b);
      add(0, 1, 0, b); add(1, 1, 1, l); add(1, 1, 0, b);
      break;
    case 'radish':
      for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) { add(x, 0, z, (x + z) % 2 ? d : b); add(x, 1, z, x === 0 && z === 1 ? l : b); }
      add(2, 0, 0, 0xf6eef0); add(0, 2, 0, GREENS[0]); add(1, 3, 0, GREENS[2]); add(1, 2, 0, GREENS[1]);
      break;
    case 'sunhead':
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) add(x, 0, z, x === 1 && z === 1 ? d : (x + z) % 2 ? b : l);
      add(1, 1, 1, 0x3a2410);
      break;
    case 'seed':
      add(0, 0, 0, b); add(1, 0, 0, l); add(0, 0, 1, d);
      break;
    case 'pellets':
      for (let i = 0; i < 7; i++) add(Math.floor(r() * 3), 0, Math.floor(r() * 3), pick(r(), [b, d, l]));
      add(1, 1, 1, b); add(0, 1, 1, d);
      break;
    default:
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) add(x, y, z, b);
  }
  // random quarter turn about Y, then normalise to min 0
  const q = Math.floor(r() * 4);
  for (const p of out) {
    let x = p[0], z = p[2];
    for (let k = 0; k < q; k++) [x, z] = [-z, x];
    p[0] = x; p[2] = z;
  }
  let mx = Infinity, my = Infinity, mz = Infinity;
  for (const p of out) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); mz = Math.min(mz, p[2]); }
  for (const p of out) { p[0] -= mx; p[1] -= my; p[2] -= mz; }
  return out;
}

/**
 * Heap produce pieces into a container (fine voxels). Pieces come in little runs of the same
 * produce placed next to each other (a bunch of carrots here, berries there) and are placed
 * with a fixed random sequence, so pile(n) is always pile(n - 1) plus one more piece.
 * spec: { inside(x, z), floor(x, z), cap(x, z), sample(rnd) -> [x, z], run, spread, tries }
 */
function buildPile(spec, items, n, seed) {
  const v = new VoxelModel();
  const top = new Map();
  const K = (x, z) => (x + 512) * 1024 + (z + 512);
  const hAt = (x, z) => top.get(K(x, z)) ?? spec.floor(x, z);
  const rnd = mulberry32(seed >>> 0);
  const RUN = spec.run || 3, SP = spec.spread ?? 2.2;
  let centre = null;
  for (let i = 0; i < n; i++) {
    const run = Math.floor(i / RUN);
    const id = items[run % items.length];
    if (i % RUN === 0) centre = spec.sample(rnd);
    const shape = produceShape(id, rnd);
    let w = 0, d = 0, sh = 0;
    for (const p of shape) { w = Math.max(w, p[0] + 1); d = Math.max(d, p[2] + 1); sh = Math.max(sh, p[1] + 1); }
    const tries = spec.tries || 10;
    for (let t = 0; t < tries; t++) {
      // near the run's centre first, anywhere later
      const [sx, sz] = t < tries / 2 ? [centre[0] + (rnd() - 0.5) * 2 * SP, centre[1] + (rnd() - 0.5) * 2 * SP] : spec.sample(rnd);
      const x0 = Math.round(sx - w / 2), z0 = Math.round(sz - d / 2);
      let ok = true, base = -Infinity;
      for (const p of shape) {
        const x = x0 + p[0], z = z0 + p[2];
        if (!spec.inside(x, z)) { ok = false; break; }
        if (p[1] === 0) base = Math.max(base, hAt(x, z));
      }
      if (!ok) continue;
      if (base + sh > spec.cap(x0 + Math.floor(w / 2), z0 + Math.floor(d / 2))) continue;
      for (const p of shape) {
        const x = x0 + p[0], y = base + p[1], z = z0 + p[2];
        if (v.has(x, y, z)) continue;
        v.set(x, y, z, p[3]);
        if (y + 1 > hAt(x, z)) top.set(K(x, z), y + 1);
      }
      break;
    }
  }
  return v;
}
// sample a point in a disk (fine units) biased to the middle so piles mound up
const diskSampler = (cx, cz, R) => (rnd) => {
  const a = rnd() * TAU, r = Math.sqrt(rnd()) * R * (0.35 + 0.65 * rnd());
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
};
const itemsKey = (items) => items.slice(0, 16).join(',');
function normItems(items, fallback) {
  if (!Array.isArray(items) || !items.length) return fallback;
  const out = items.filter((s) => typeof s === 'string' && s);
  return out.length ? out : fallback;
}

// ================================================================ SNACK BOWL
const BOWL_GLAZES = [
  { body: [0xf2e6cc, 0xe4d4b4, 0xfcf4e2], rim: 0x4a86c8, rimL: 0x6aa4e0, paw: 'bowl:paw' },
  { body: [0xf2e6cc, 0xe4d4b4, 0xfcf4e2], rim: 0xd0503a, rimL: 0xe8705a, paw: 'bowl:paw' },
  { body: [0x8ac0e4, 0x76acd6, 0xa8d4f0], rim: 0xf6f0e0, rimL: 0xffffff, paw: 'bowl:pawblue' },
];
const BOWL_ITEMS = ['carrot', 'blueberry', 'corn', 'strawberry', 'pumpkin', 'raspberry', 'peas'];
const BOWL_PIECES = 44;
const BOWL_FLOOR = 10; // fine y of the bowl's inside floor

function snackbowlBody(sv) {
  const v = new VoxelModel();
  const G = BOWL_GLAZES[sv];
  const C = -0.5;
  // stump: bark sides with vertical streaks and flared roots
  for (let y = 0; y <= 2; y++) {
    const r = y === 0 ? 3.3 : 2.9;
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
      const dx = x - C, dz = z - C, d = Math.hypot(dx, dz);
      if (d > r + 0.2) continue;
      const a = Math.floor(((Math.atan2(dz, dx) + PI) / TAU) * 16);
      if (y === 0 && d > 2.9 && a % 3 !== 0) continue; // only a few roots
      v.set(x, y, z, a % 4 === 0 ? BARK_D : BARK[(a + y) % 3]);
    }
  }
  // ceramic bowl: foot, floor, near-vertical walls and a rolled rim (front stays flat at z 3)
  const rows = [[3, 3.0, null], [4, 4.0, null], [5, 4.3, 3.3], [6, 4.4, 3.4], [7, 4.5, 3.5]];
  for (const [y, R, inner] of rows) {
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) {
      const d = Math.hypot(x - C, z - C);
      if (d > R) continue;
      if (inner != null && d <= inner) continue;
      let c = toneOf(x, y, z, G.body[0], G.body[1], G.body[2], 0.16, 0.12, 3);
      if (y === 3) c = shade(G.body[1], 0.82);
      if (y === 7) c = d > 4.05 ? G.rim : G.rimL;
      if (y === 4 && d < 3.4) c = shade(G.body[1], 0.86); // inside floor
      if (inner != null && d < inner + 1 && y < 7) c = shade(G.body[1], 0.9); // inner wall
      v.set(x, y, z, c);
    }
  }
  // glaze highlights on the upper-left
  v.set(-4, 6, -2, G.body[2]); v.set(-4, 5, -2, G.body[2]); v.set(-3, 6, -4, G.body[2]);
  return v;
}
// fine details round the stump: grass, flowers, a mushroom, a few crumbs on the ground
function snackbowlDetails(sv) {
  const v = new VoxelModel();
  const rnd = mulberry32(sv * 977 + 13);
  fineTufts(v, rnd, 22, (x, z) => Math.hypot(x + 0.5, z + 0.5) < 7.6);
  // little red toadstool against the stump (side varies)
  const tx = sv === 1 ? -6 : 5, tz = sv === 2 ? 3 : -4;
  v.set(tx, 0, tz, 0xf2e6cc); v.set(tx, 1, tz, 0xf2e6cc);
  for (const [x, z] of [[-1, 0], [0, 0], [1, 0], [0, -1], [0, 1]]) v.set(tx + x, 2, tz + z, RED);
  v.set(tx, 3, tz, RED); v.set(tx - 1, 2, tz, 0xffffff); v.set(tx, 3, tz, 0xffffff);
  // moss on the stump's shady side
  for (const [x, z] of [[-3, -6], [-1, -6], [-5, -4], [1, -6]]) v.set(x, 6, z, pick(hv(x, 6, z), MOSS));
  return v;
}
// crumbs + a lonely blueberry and a carrot top when the bowl is empty
function bowlCrumbs(sv) {
  const v = new VoxelModel();
  const rnd = mulberry32(sv * 31 + 5);
  const CR = [0xd8b070, 0xc89a58, 0xe8c888, 0xb88a48];
  for (let i = 0; i < 10; i++) {
    const a = rnd() * TAU, r = Math.sqrt(rnd()) * 5.4;
    v.set(Math.round(-0.5 + Math.cos(a) * r), BOWL_FLOOR, Math.round(-0.5 + Math.sin(a) * r), pick(rnd(), CR));
  }
  v.set(2, BOWL_FLOOR, -2, 0x3a4ab8); v.set(2, BOWL_FLOOR + 1, -2, 0x8a9af0);
  v.set(-3, BOWL_FLOOR, 1, 0x5ab040); v.set(-4, BOWL_FLOOR + 1, 1, 0x3a8a2a); v.set(-3, BOWL_FLOOR, 2, 0xf07a1a);
  for (const [x, y, z] of [[4, 0, 7], [-7, 0, 6], [8, 0, -3], [-8, 0, -5]]) v.set(x, y, z, pick(rnd(), CR));
  return v;
}

function snackbowl(seed, o) {
  const root = new THREE.Group();
  const sv = seed % BOWL_GLAZES.length;
  root.add(vmesh(sgeo(`bowl:${sv}`, () => snackbowlBody(sv))));
  root.add(vmesh(sgeo(`bowldet:${sv}`, () => snackbowlDetails(sv), VF), { shadow: false }));
  const crumbs = vmesh(sgeo(`bowlcrumbs:${sv}`, () => bowlCrumbs(sv), VF), { shadow: false });
  root.add(crumbs);
  if (o.decals) decal(root, BOWL_GLAZES[sv].paw, 40, [-0.05, 0.555, fP(3)]);
  const pile = new Slot(root, VF);
  // a little fly buzzing round the empty bowl
  const fly = vmesh(sgeo('bowlfly', () => {
    const f = new VoxelModel();
    f.set(0, 0, 0, 0x1a1a1e); f.set(1, 0, 0, 0x2a2a30); f.set(0, 1, 0, 0xd8f0ff); f.set(1, 1, 0, 0xc8e8ff);
    return f;
  }, 0.03), { shadow: false });
  fly.visible = false;
  root.add(fly);
  const spec = {
    inside: (x, z) => Math.hypot(x + 0.5, z + 0.5) <= 6.4,
    floor: () => BOWL_FLOOR,
    cap: (x, z) => BOWL_FLOOR + 4 + Math.round(5 * (1 - (Math.hypot(x + 0.5, z + 0.5) / 6.8) ** 2)),
    sample: diskSampler(-0.5, -0.5, 5.8),
    run: 3, spread: 2.4, tries: 10,
  };
  let t = 0;
  return {
    root,
    setFill(kk, it) {
      const items = normItems(it, BOWL_ITEMS);
      const n = Math.round(clamp01(kk || 0) * BOWL_PIECES);
      crumbs.visible = n === 0;
      fly.visible = n === 0;
      pile.set(n ? `bowlpile|${n}|${itemsKey(items)}` : null, () => buildPile(spec, items, n, 4242));
    },
    setState() {},
    update(dt) {
      t += dt;
      if (fly.visible) {
        const a = t * 3.1;
        fly.position.set(Math.cos(a) * 0.22 + Math.sin(a * 2.3) * 0.05, 0.9 + Math.sin(a * 1.7) * 0.06, Math.sin(a) * 0.18);
        fly.rotation.y = -a;
      }
    },
    dispose() { pile.dispose(); },
  };
}

// ================================================================ BEAR PANTRY
// Larder shed: x -4..3, z -4..0, floor y 1, shelves y 5 / 8, ceiling y 12, gable roof (ridge
// along z) up to y 17. Inside (fine): x -6..5, z -4..1, shelf tops at fine y 4 / 12 / 18.
const PANTRY_ITEMS = ['honey', 'blueberry', 'potato', 'carrot', 'raspberry', 'corn', 'pumpkin', 'syrup', 'wildrice', 'peas'];
const SHINGLE = [0x9a4a38, 0x8a3e30, 0xa85840];
const PLANK = [0xb07a46, 0xa06c3e, 0xbc8650];
// fill order: [x0 (fine), y0 (fine shelf top), room (fine height), big?]
const PANTRY_SLOTS = [
  [-2, 4, 8, true], [-6, 12, 6], [2, 18, 6], [-6, 4, 8, true], [2, 12, 6], [-2, 18, 6],
  [2, 4, 8, true], [-2, 12, 6], [-6, 18, 6], ['out', 0, 9, true],
];

function pantryBody(sv) {
  const v = new VoxelModel();
  const plank = (x, y, z) => {
    const b = ((x + 40) >> 1) + ((z + 40) >> 1); // 2-voxel wide vertical boards
    const c = PLANK[b % 3];
    return hv(x, y, z, 9) < 0.1 ? shade(c, 0.86) : c;
  };
  // stone footing
  v.box(-4, 0, -4, 3, 0, 0, (x, y, z) => toneOf(x, y, z, STONE[0], STONE[3], STONE[2], 0.25, 0.2, 2));
  // walls, lining and corner posts
  v.box(-4, 1, -4, 3, 11, -4, plank);
  v.box(-4, 1, -4, -4, 11, 0, plank);
  v.box(3, 1, -4, 3, 11, 0, plank);
  v.box(-3, 2, -3, 2, 11, -3, (x, y) => (y % 3 === 0 ? 0x5a3a20 : 0x6a4428)); // dark back boards
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 0], [3, 0]]) v.box(x, 0, z, x, 12, z, (xx, y) => (y % 4 === 0 ? 0x5a3418 : WOOD_D));
  // floor, shelves (lighter front edge), ceiling with a trim
  v.box(-3, 1, -3, 2, 1, 0, (x, y, z) => (z === 0 ? WOOD_L : WOOD_M));
  for (const y of [5, 8]) v.box(-3, y, -3, 2, y, 0, (x, yy, z) => (z === 0 ? WOOD_L : WOOD[1]));
  v.box(-4, 12, -4, 3, 12, 0, (x, y, z) => (z === 0 ? 0x5a3418 : WOOD_M));
  // little brackets under the shelves
  for (const y of [4, 7]) { v.set(-3, y, 0, WOOD_D); v.set(2, y, 0, WOOD_D); }
  // gable roof: shingle edges step in one voxel per layer, the gable wall shows between them,
  // cream trim along the eaves
  for (let k = 0; k <= 3; k++) {
    const y = 13 + k, x0 = -5 + k, x1 = 4 - k;
    for (let x = x0; x <= x1; x++) for (let z = -5; z <= 1; z++) {
      const edge = x === x0 || x === x1;
      if (z === 1 && !edge) continue;
      if (edge) v.set(x, y, z, z === 1 ? 0xe8dcc0 : SHINGLE[(z + k + 20) % 3]);
      else if (z === 0) v.set(x, y, z, plank(x, y, z)); // gable wall
      else v.set(x, y, z, k === 3 ? SHINGLE[(z + 21) % 3] : WOOD_M);
    }
  }
  // round vent in the gable
  v.set(-1, 15, 0, 0x2a1a10); v.set(0, 15, 0, 0x2a1a10);
  return v;
}
// door: 3 x 10 planks with a Z brace, hinges and a knob; `side` -1 = left door (hinge at its x 0)
function pantryDoor(side) {
  const v = new VoxelModel();
  const xs = side < 0 ? [0, 1, 2] : [-3, -2, -1];
  for (const x of xs) for (let y = 2; y <= 11; y++) v.set(x, y, 0, PLANK[(x + 9) % 3]);
  // Z brace (darker planks across the front)
  for (const x of xs) { v.set(x, 3, 0, WOOD_M); v.set(x, 10, 0, WOOD_M); }
  for (let y = 4; y <= 9; y++) v.set(xs[Math.round(((y - 4) / 5) * 2)], y, 0, WOOD_M);
  // iron hinges on the hinge side, a dark knob on the free side
  const hx = side < 0 ? 0 : -1, kx = side < 0 ? 2 : -3;
  for (const y of [3, 10]) v.set(hx, y, 0, IRON);
  v.set(kx, 7, 0, 0x4a2e18);
  return v;
}
// garlic braid hanging from the eave + a broom leaning on the right wall (fine voxels)
function pantryDetails(sv) {
  const v = new VoxelModel();
  const rnd = mulberry32(sv * 131 + 7);
  // garlic: straw braid with white bulbs, hanging at fine (9, 25 -> 16, 3)
  for (let y = 16; y <= 25; y++) v.set(9, y, 3, STRAW[y % 4]);
  for (const [y, dx] of [[23, -1], [20, 1], [17, -1], [14, 0]]) {
    for (let x = 0; x < 3; x++) for (let yy = 0; yy < 3; yy++) for (let z = 0; z < 2; z++) {
      if ((x === 0 || x === 2) && (yy === 0 || yy === 2)) continue;
      v.set(9 + dx + x - 1, y + yy - 1, 3 + z, yy === 2 ? 0xe8dcec : x === 0 ? 0xd8c8d8 : 0xf6f0f2);
    }
    v.set(9 + dx, y - 2, 3, 0xc8b8a0);
  }
  // broom leaning on the right wall
  for (let y = 0; y <= 18; y++) v.set(9 + Math.round(y * 0.06), y + 4, -3, 0x9a6a3a);
  for (let y = 0; y <= 4; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 0; z++) if (y < 4 || x === 0) v.set(9 + x, y, -3 + z, STRAW[(x + y + 9) % 4]);
  v.set(9, 4, -3, 0xc8322a); // red binding
  // a crate of apples by the left wall + grass round the footing
  for (let x = -10; x <= -8; x++) for (let z = 3; z <= 6; z++) { v.set(x, 0, z, WOOD_M); if (x !== -9 || z === 3 || z === 6) v.set(x, 1, z, WOOD[2]); }
  for (const [x, z] of [[-9, 4], [-9, 5]]) { v.set(x, 1, z, 0xd83a2a); v.set(x, 2, z, 0xe85a3a); }
  fineTufts(v, rnd, 16, (x, z) => x >= -9 && x <= 8 && z >= -9 && z <= 2);
  return v;
}

// goods for one slot (fine voxels, origin at the slot's front-left on the shelf top)
function pantryGood(id, big, room, rnd) {
  const out = [];
  const add = (x, y, z, c) => out.push([x, y, -z, c]); // z grows to the back
  const [shape, b, d, l] = itemDef(id);
  const jar = (x0, z0, content, lid, h = 3) => {
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) for (let y = 0; y < h; y++) {
      if ((x === 0 || x === 2) && (z === 0 || z === 2) && y === h - 1) continue;
      add(x0 + x, y, z0 + z, y === 1 && z === 0 && x === 1 ? 0xf2ead6 : x === 0 && z === 0 && y === h - 1 ? mix(content, 0xffffff, 0.45) : (x + y) % 2 ? content : shade(content, 0.88));
    }
    for (const [x, z] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) add(x0 + x, h, z0 + z, typeof lid === 'function' ? lid(x, z) : lid);
  };
  const gingham = (x, z) => ((x + z) % 2 ? 0xd83a2a : 0xf6f2ea);
  const sack = (w, h, content, tied) => {
    for (let x = 0; x < w; x++) for (let z = 0; z < w; z++) for (let y = 0; y < h; y++) {
      const edge = (x === 0 || x === w - 1) && (z === 0 || z === w - 1);
      if (edge && (y === 0 || y >= h - 2)) continue;
      add(x, y, z, (x + y + z) % 3 === 0 ? BURLAP[1] : (x * 3 + y) % 5 === 0 ? BURLAP_D : BURLAP[0]);
    }
    const m = Math.floor(w / 2) - (w % 2 ? 0 : 1);
    if (tied) { add(m, h, m, BURLAP[2]); add(m + 1, h, m, BURLAP[1]); add(m, h - 1, m - 1 < 0 ? 0 : m, 0x6a4a2a); }
    else for (let x = 1; x < w - 1; x++) for (let z = 1; z < w - 1; z++) add(x, h - 1, z, (x + z) % 2 ? content : shade(content, 1.15));
    add(m, Math.floor(h / 2), 0, 0xf2ead6); // a little label
  };
  switch (shape) {
    case 'berries': case 'drupe': case 'strawberry': case 'pod':
      jar(0, 0, b, gingham, 3);
      if (big || rnd() < 0.5) jar(3 <= 1 ? 0 : 1, 0, d, 0xd8a840, 2), out.splice(0, 0);
      break;
    case 'comb': { // honey pot with a dipper
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) for (let y = 0; y < 4; y++) {
        if ((x === 0 || x === 3) && (y === 0 || y === 3)) continue;
        add(x, y, z, y === 3 ? 0xffc030 : y === 1 ? 0xb87820 : (x + z) % 2 ? 0xe8a828 : 0xd89820);
      }
      add(1, 2, -1, 0xffc030); add(1, 1, -1, 0xffd060); // drip on the front
      add(2, 4, 1, 0x9a6a3a); add(3, 5, 1, 0x9a6a3a);
      break;
    }
    case 'jar': jar(0, 0, b, 0xd8a840, 3); break;
    case 'bottle': case 'gem': { // syrup jug
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) for (let y = 0; y < 3; y++) add(x, y, z, y === 1 && z === 0 && x === 1 ? RED : (x + y) % 2 ? b : d);
      add(1, 3, 1, d); add(1, 4, 1, shape === 'gem' ? l : 0xf6f2ea); add(3, 2, 1, d); add(3, 1, 1, d);
      if (shape === 'gem') add(1, 3, 0, 0xffffff);
      break;
    }
    case 'grains': case 'sunhead': case 'seed': case 'pellets':
      if (big) sack(4, Math.min(room, 6), b, true); else sack(3, 4, b, true);
      break;
    case 'potato':
      if (big) sack(4, Math.min(room - 1, 5), b, false);
      else for (const [x, z, y] of [[0, 0, 0], [2, 0, 0], [1, 1, 0], [1, 0, 1], [3, 1, 0]]) { add(x, y, z, b); add(x, y, z + 1, d); }
      break;
    case 'carrot': case 'radish': { // crate with tops sticking out
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) for (let y = 0; y < 2; y++) add(x, y, z, y === 0 || z === 0 ? (x % 2 ? WOOD[0] : WOOD[2]) : WOOD_M);
      for (let x = 0; x < 4; x++) { add(x, 2, 1, x % 2 ? b : l); add(x, 2, 2, d); add(x, 3, 1 + (x % 2), GREENS[x % 3]); }
      add(0, 2, 0, b); add(3, 2, 0, b);
      break;
    }
    case 'corn': { // a stack of cobs
      const cob = (x0, y0) => { for (let z = 0; z < 3; z++) add(x0, y0, z, (z + y0) % 2 ? b : d); add(x0, y0, 3, GREENS[0]); };
      cob(0, 0); cob(1, 0); cob(2, 0); cob(3, 0); cob(1, 1); cob(2, 1);
      if (big) cob(1, 2);
      break;
    }
    case 'pumpkin': {
      const sh = produceShape(big ? id : 'pumpkin', rnd);
      for (const p of sh) add(p[0], p[1], p[2], p[3]);
      break;
    }
    case 'lettuce': case 'clover':
      for (const x0 of [0, 2]) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) { add(x0 + x, 0, z, (x + z) % 2 ? b : d); add(x0 + x, 1, z, x0 ? l : b); }
      break;
    case 'mushroom': case 'lump': { // wicker basket with caps
      for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) { add(x, 0, z, (x + z) % 2 ? 0xc89a5a : 0xa87a40); if (x === 0 || x === 3 || z === 0 || z === 2) add(x, 1, z, (x + z) % 2 ? 0xa87a40 : 0xc89a5a); }
      for (const [x, z] of [[1, 1], [2, 1], [1, 0], [2, 2]]) add(x, 2, z, (x + z) % 2 ? b : l);
      add(0, 2, 1, 0x8a6a3a); add(3, 3, 1, 0x8a6a3a); add(1, 3, 1, 0x8a6a3a); add(2, 3, 1, 0x8a6a3a); // handle
      break;
    }
    default: {
      const sh = produceShape(id, rnd);
      for (const p of sh) add(p[0], p[1], p[2], p[3]);
    }
  }
  return out;
}
function pantryGoods(items, n, sv) {
  const v = new VoxelModel();
  const rnd = mulberry32(1234 + sv * 7);
  for (let i = 0; i < n && i < PANTRY_SLOTS.length; i++) {
    const [sx, sy, room, big] = PANTRY_SLOTS[i];
    const id = items[i % items.length];
    const good = pantryGood(id, !!big, room, rnd);
    let w = 0;
    for (const p of good) w = Math.max(w, p[0] + 1);
    const out = sx === 'out';
    // front-aligned on the shelf (fine z 1 is the front row), centred in its 4-wide slot
    const x0 = out ? -3 : sx + Math.max(0, Math.floor((4 - w) / 2)), y0 = out ? 0 : sy, z0 = out ? 6 : 1;
    for (const p of good) if (p[1] < room) v.set(x0 + p[0], y0 + p[1], z0 + p[2], p[3]);
  }
  return v;
}
// a grey mouse peeking out of the hole (fine voxels) + its cheese crumb
function mouseModel() {
  const v = new VoxelModel();
  const G = 0x9a96a0, GD = 0x7a7680, P = 0xf0a0b0;
  v.box(0, 0, 0, 2, 1, 1, (x, y) => (y === 1 && x === 1 ? 0xb0acb6 : G));
  v.set(0, 2, 0, G); v.set(2, 2, 0, G); v.set(0, 2, 1, P); v.set(2, 2, 1, P); // ears
  v.set(0, 1, 2, 0x1a1a1e); v.set(2, 1, 2, 0x1a1a1e); v.set(1, 0, 2, P); // eyes + nose
  v.set(1, 0, 3, GD); // whisker-nose tip
  v.set(4, 0, 2, 0xf6d050); v.set(5, 0, 2, 0xf0c040); v.set(4, 1, 2, 0xffe070); // cheese
  return v;
}

function pantry(seed, o) {
  const root = new THREE.Group();
  const sv = seed % 2;
  root.add(vmesh(sgeo('pantry', () => pantryBody(0))));
  root.add(vmesh(sgeo(`pantrydet:${sv}`, () => pantryDetails(sv), VF), { shadow: true }));
  const doors = [-1, 1].map((side) => {
    const piv = new THREE.Group();
    piv.position.set(side * 0.3, 0, 0.1);
    piv.add(vmesh(sgeo(`pantrydoor:${side}`, () => pantryDoor(side))));
    root.add(piv);
    return piv;
  });
  const OPEN = sv === 0 ? [2.1, 1.2] : [1.2, 2.1]; // one door wide open, the other ajar
  let doorK = 1, doorGoal = 1;
  const goods = new Slot(root, VF);
  const mouse = new THREE.Group();
  mouse.add(vmesh(sgeo('pantrymouse', () => mouseModel(), VF / 2), { shadow: false }));
  mouse.position.set(0.17, 0, 0.1);
  mouse.visible = false;
  root.add(mouse);
  if (o.decals) {
    decal(root, 'pantry:sign', 66, [0, 1.345, fP(0)]);
    decal(root, 'pantry:hole', 40, [0.22, 0.05, fP(0)]);
  }
  let state = 'idle', t = 0;
  const setDoors = (k) => {
    doors[0].rotation.y = -OPEN[0] * k;
    doors[1].rotation.y = OPEN[1] * k;
  };
  setDoors(1);
  return {
    root,
    setFill(kk, it) {
      const items = normItems(it, PANTRY_ITEMS);
      const n = Math.round(clamp01(kk || 0) * PANTRY_SLOTS.length);
      goods.set(n ? `pantry|${sv}|${n}|${itemsKey(items)}` : null, () => pantryGoods(items, n, sv));
    },
    setState(name) {
      state = FARM_STATES.pantry.includes(name) ? name : 'idle';
      doorGoal = state === 'closed' ? 0 : 1;
      mouse.visible = state === 'mouse';
    },
    update(dt) {
      t += dt;
      doorK += (doorGoal - doorK) * Math.min(1, dt * 6);
      // the ajar door creaks in the breeze
      setDoors(doorK);
      doors[sv === 0 ? 1 : 0].rotation.y += Math.sin(t * 0.9) * 0.04 * doorK * (sv === 0 ? 1 : -1);
      if (mouse.visible) {
        const peek = Math.max(0, Math.sin(t * 0.8)) ** 0.5;
        mouse.position.z = 0.1 - 0.06 + peek * 0.07;
        mouse.rotation.y = Math.sin(t * 2.3) * 0.25 * peek;
      }
    },
    dispose() { goods.dispose(); },
  };
}

// ================================================================ BEAVER SNACK BAR
// Log trough x -4..3, z -2..1 on two stumps (inside fine x -6..5, z -2..1, floor fine y 6),
// stick posts holding a little thatched awning, sign board on top, log bench in front.
const BAR_ITEMS = ['carrot', 'corn', 'blueberry', 'potato', 'bugbites', 'carrot', 'peas', 'sunflower'];
const BAR_PIECES = 30;
const thatchY = (z) => 12 - Math.floor((z + 4) / 3); // z -4..0: back 12 -> front 11

function beaverbarBody(sv) {
  const v = new VoxelModel();
  const bark = (x, y, z) => { const h = hv(x, y, z, 5); return h < 0.15 ? BARK_D : h > 0.85 ? BARK[1] : (x + y) % 3 === 0 ? BARK[2] : BARK[0]; };
  // stump legs
  for (const x0 of [-4, 2]) v.box(x0, 0, -2, x0 + 1, 1, 1, bark);
  // trough: half-log walls (bark outside, cut wood along the top), log-end caps
  v.box(-4, 2, -2, 3, 2, 1, (x, y, z) => (z === 1 || z === -2 ? bark(x, y, z) : WOOD_M));
  for (const z of [-2, 1]) v.box(-4, 3, z, 3, 4, z, (x, y) => (y === 4 ? (hv(x, y, z) < 0.3 ? 0xc89458 : 0xd8a868) : bark(x, y, z)));
  for (const x of [-4, 3]) for (let z = -2; z <= 1; z++) for (let y = 2; y <= 4; y++) {
    const r = Math.hypot(z + 0.5, y - 3);
    v.set(x, y, z, r < 0.8 ? LOG_CORE : r < 1.4 ? LOG_RING : LOG_END);
  }
  // rope lashing round the trough ends
  for (const x of [-3, 2]) { v.set(x, 3, 1, 0xd8c090); v.set(x, 4, 1, 0xb89a68); v.set(x, 3, -2, 0xd8c090); }
  // stick posts with gnawed, pointy tips
  const post = (x, z, top) => {
    for (let y = 0; y <= top; y++) v.set(x, y, z, y % 4 === 1 ? BARK_D : BARK[(y + x) & 1]);
    v.set(x, top + 1, z, LOG_END);
  };
  post(-5, -3, thatchY(-3) - 1); post(4, -3, thatchY(-3) - 1);
  post(-5, 0, thatchY(0) - 1); post(4, 0, thatchY(0) - 1);
  // thatched awning over the back half: straw bundles in rows, a ridge log, ragged fringe in front
  for (let z = -4; z <= 0; z++) {
    const y = thatchY(z);
    for (let x = -5; x <= 4; x++) {
      const band = (z + 8) % 2;
      const c = hv(x, y, z, 7) < 0.18 ? STRAW[3] : STRAW[(band + (x & 1)) % 3];
      v.set(x, y, z, c);
      if (z === -3) v.set(x, y + 1, z, x % 3 === 0 ? 0xb89040 : STRAW[2]); // tied bundle row
      if (z === 0 && hv(x, 1, z, 3) < 0.55) v.set(x, y - 1, z, STRAW[(x + 9) % 4]);
    }
  }
  for (let x = -5; x <= 4; x++) v.set(x, thatchY(-4) + 1, -4, BARK[x & 1]);
  v.set(-5, thatchY(-4) + 1, -4, LOG_END); v.set(4, thatchY(-4) + 1, -4, LOG_END);
  // sign board standing on the thatch (the decal covers its front)
  v.box(-3, 13, -2, 2, 15, -2, (x, y) => (y === 13 ? WOOD_D : WOOD_M));
  v.set(-3, 12, -3, BARK_D); v.set(2, 12, -3, BARK_D); v.set(-3, 13, -3, BARK_D); v.set(2, 13, -3, BARK_D);
  // log bench in front: a split log on two little stumps
  for (const x of [-3, 1]) v.set(x, 0, 3, bark(x, 0, 3)), v.set(x + 1, 0, 3, bark(x + 1, 0, 3));
  v.box(-3, 1, 3, 2, 1, 4, (x, y, z) => (z === 4 ? bark(x, y, z) : hv(x, y, z) < 0.3 ? 0xc89458 : 0xd8a868));
  v.set(-4, 1, 3, LOG_END); v.set(3, 1, 3, LOG_END); v.set(-4, 1, 4, LOG_RING); v.set(3, 1, 4, LOG_RING);
  if (sv === 1) v.set(2, 2, 3, 0x6a9a3a); // a moss tuft on the bench
  return v;
}
// wood chips, a gnawed stick, the tip jar and grass (fine voxels)
function beaverbarDetails(sv) {
  const v = new VoxelModel();
  const rnd = mulberry32(sv * 61 + 3);
  const CHIP = [0xe0b878, 0xd0a060, 0xc89050, 0xf0d098];
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rnd() * 20) - 10, z = Math.floor(rnd() * 20) - 10;
    if (x >= -9 && x <= 7 && z >= -5 && z <= 3) continue;
    v.set(x, 0, z, pick(rnd(), CHIP));
    if (rnd() < 0.3) v.set(x + 1, 0, z, pick(rnd(), CHIP));
  }
  // gnawed stick with pointy ends on the ground
  const gz = sv === 0 ? -8 : 9;
  for (let x = -2; x <= 4; x++) v.set(x, 0, gz, x === -2 || x === 4 ? LOG_END : x % 3 === 0 ? BARK_D : BARK[0]);
  v.set(1, 1, gz, 0x5ab040);
  // tip jar on the front-right corner: glass, coins, a coin on the lid
  const GL = 0xcfe8ee, GLD = 0xa8d0dc;
  for (let x = 6; x <= 8; x++) for (let z = 1; z <= 3; z++) for (let y = 10; y <= 13; y++) {
    const corner = (x === 6 || x === 8) && (z === 1 || z === 3);
    if (corner && y === 13) continue;
    const inner = x === 7 && z === 2;
    const coin = y <= 11 && (inner || (y === 10 && !corner));
    v.set(x, y, z, coin ? (y === 11 ? 0xf6d050 : 0xd8a030) : y === 13 ? 0xd8a840 : (x + y) % 2 ? GL : GLD);
  }
  v.set(7, 14, 2, 0xf6d050);
  fineTufts(v, rnd, 18, (x, z) => x >= -10 && x <= 9 && z >= -6 && z <= 9 && !(z > 3 && x > -9 && x < 7));
  return v;
}
// the hand-painted picket sign stuck in the ground (strike state)
function picketModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 12; y++) v.set(0, y, 0, y < 2 ? 0x8a6a4a : (y % 4 === 0 ? 0x9a6a3a : 0xb8844e));
  v.set(0, 13, 0, 0xd8a868);
  return v;
}

function beaverbar(seed, o) {
  const root = new THREE.Group();
  const sv = seed % 2;
  root.add(vmesh(sgeo(`bar:${sv}`, () => beaverbarBody(sv))));
  root.add(vmesh(sgeo(`bardet:${sv}`, () => beaverbarDetails(sv), VF)));
  const pile = new Slot(root, VF);
  // strike: a picket sign planted next to the bar (pops up)
  const picket = new THREE.Group();
  picket.position.set(-0.36, 0, 0.34);
  picket.rotation.set(0, 0.25, 0.06);
  const stake = vmesh(sgeo('picket', () => picketModel(), VF));
  stake.position.set(-0.025, 0, -0.025);
  picket.add(stake);
  if (hasDOM) {
    const board = new THREE.Group();
    board.position.set(0, 0.62, 0.03);
    board.add(vmesh(sgeo('picketboard', () => { const b = new VoxelModel(); b.box(-9, -5, 0, 8, 4, 0, (x, y) => ((x + y) % 5 === 0 ? 0xc09a60 : 0xd0aa6c)); return b; }, 0.025)));
    if (o.decals) {
      decal(board, 'strike:sign', 80, [-0.0125, -0.0125, 0.025 + EPS]);
      decal(board, 'strike:back', 80, [-0.0125, -0.0125, -EPS], { n: [0, 0, -1] });
    }
    picket.add(board);
  }
  picket.visible = false;
  root.add(picket);
  if (o.decals) {
    decal(root, 'bar:sign', 60, [-0.05, 1.445, fP(-2)]);
    decal(root, 'bar:picto', 40, [-0.05, 0.355, fP(1)]);
    decal(root, 'bar:tips', 120, [0.375, 0.56, 0.2 + EPS]);
  }
  const spec = {
    inside: (x, z) => x >= -6 && x <= 5 && z >= -2 && z <= 1,
    floor: () => 6,
    cap: (x) => 6 + 4 + (Math.abs(x + 0.5) < 3 ? 2 : Math.abs(x + 0.5) < 5 ? 1 : 0),
    sample: (rnd) => [-6 + rnd() * 12, -2 + rnd() * 4],
    run: 3, spread: 2, tries: 12,
  };
  let state = 'idle', pop = 1, t = 0;
  return {
    root,
    setFill(kk, it) {
      const items = normItems(it, BAR_ITEMS);
      const n = Math.round(clamp01(kk || 0) * BAR_PIECES);
      pile.set(n ? `barpile|${n}|${itemsKey(items)}` : null, () => buildPile(spec, items, n, 777));
    },
    setState(name) {
      const prev = state;
      state = FARM_STATES.beaverbar.includes(name) ? name : 'idle';
      picket.visible = state === 'strike';
      if (state === 'strike' && prev !== 'strike') pop = 0;
    },
    update(dt) {
      t += dt;
      if (picket.visible) {
        pop = Math.min(1, pop + dt * 2.2);
        // springs up out of the ground with an overshoot, then wobbles in the breeze
        const e = pop >= 1 ? 1 : 1 - Math.cos(pop * PI * 2.5) * (1 - pop) ** 2 * 1.3 - (1 - pop) ** 3;
        picket.scale.set(1, Math.max(0.05, e), 1);
        picket.rotation.z = 0.06 + Math.sin(t * 2.1) * 0.03;
      }
    },
    dispose() { pile.dispose(); },
  };
}

// ================================================================ BUG GRINDER 3000
// Crate base (y 0..1), riveted copper drum x -4..3 z -3..1 y 2..7, steel funnel y 8..11,
// zapper lamp on a gooseneck above the funnel, gears on the front-right, chute + sack front-left.
const GR_CX = -0.5, GR_CZ = -1; // drum / funnel centre in coarse index space

function grinderBody() {
  const v = new VoxelModel();
  // wooden crate base with dark corner posts
  v.box(-4, 0, -3, 3, 1, 1, (x, y, z) => {
    const cx = x === -4 || x === 3, cz = z === -3 || z === 1;
    if (cx && cz) return WOOD_D;
    if (y === 1 && (cx || cz)) return WOOD_M;
    return (x + z) % 3 === 0 ? WOOD[1] : WOOD[0];
  });
  // copper drum with brass bands, rivets and cut corners
  for (let y = 2; y <= 7; y++) for (let x = -4; x <= 3; x++) for (let z = -3; z <= 1; z++) {
    const cx = x === -4 || x === 3, cz = z === -3 || z === 1;
    if (cx && cz) continue;
    const band = y === 2 || y === 7;
    const shell = cx || cz;
    let c = band ? ((x + z) % 2 ? BRASS : BRASS_D) : toneOf(x, y, z, TEAL[0], TEAL[1], TEAL[2], 0.16, 0.14, 4);
    if (band && shell && (x + z) % 2 === 0) c = BRASS_L; // rivets
    if (!band && shell && y === 4 && (x + z) % 3 === 0) c = TEAL_D; // panel seams
    v.set(x, y, z, c);
  }
  // steel funnel (hopper): hollow rings widening upward, brass rim
  const rings = [[8, 1.9, null], [9, 2.7, 1.6], [10, 3.4, 2.4], [11, 3.9, 3.0]];
  for (const [y, R, inner] of rings) for (let x = -5; x <= 4; x++) for (let z = -6; z <= 4; z++) {
    const d = Math.hypot(x - GR_CX, z - GR_CZ);
    if (d > R || (inner != null && d <= inner)) continue;
    v.set(x, y, z, y === 11 ? (d > 3.5 ? BRASS : BRASS_D) : toneOf(x, y, z, METAL, METAL_D, CHROME, 0.2, 0.12, 6));
  }
  // dark throat of the funnel with a few caught bugs
  for (let x = -2; x <= 1; x++) for (let z = -3; z <= 1; z++) if (Math.hypot(x - GR_CX, z - GR_CZ) < 1.6) v.set(x, 8, z, 0x2a2a30);
  // axle bracket for the gears (front-right) + a crank arm mount
  v.box(2, 5, 2, 2, 6, 2, IRON);
  // lamp post: up the back-left corner, then a horizontal arm along x over the funnel
  for (let y = 2; y <= 15; y++) v.set(-5, y, -2, y % 4 === 0 ? BRASS_D : COPPER[1]);
  v.box(-6, 0, -3, -4, 0, -1, IRON); v.set(-5, 1, -2, IRON);
  for (let x = -5; x <= -1; x++) v.set(x, 16, -2, x === -5 ? COPPER[0] : COPPER[1]);
  v.set(-4, 15, -2, COPPER_D); // little brace
  v.set(-1, 15, -2, IRON); // hook
  // exhaust pipe at the back-right with a little cap
  for (let y = 8; y <= 12; y++) v.set(3, y, -3, y === 12 ? IRON : METAL_D);
  v.set(3, 13, -3, IRON_L);
  return v;
}
// fine details: zapper cage (without the glowing tube), fried bugs, chute, grass
function grinderDetails() {
  const v = new VoxelModel();
  const rnd = mulberry32(99);
  // zapper cage: fine x -3..2, z -4..1, y 22..30 (centre over the funnel), open sides
  for (let x = -3; x <= 2; x++) for (let z = -4; z <= 1; z++) {
    const edge = x === -3 || x === 2 || z === -4 || z === 1;
    v.set(x, 22, z, edge ? BRASS_D : IRON_L); // bottom tray
    if (edge) v.set(x, 30, z, BRASS);
    else v.set(x, 31, z, BRASS_D);
    const corner = (x === -3 || x === 2) && (z === -4 || z === 1);
    if (corner) for (let y = 23; y <= 29; y++) v.set(x, y, z, IRON);
  }
  // thin middle bars front and back
  for (let y = 23; y <= 29; y += 1) { v.set(-1, y, 1, y % 2 ? IRON : IRON_L); v.set(0, y, -4, IRON); }
  v.set(-1, 32, -2, IRON); v.set(-1, 33, -2, IRON); // chain to the arm
  // fried bugs on the tray
  for (const [x, z] of [[-2, 0], [1, -3], [1, 0]]) v.set(x, 23, z, 0x2a2420);
  // chute: out of the drum's front-left, sloping down into the sack's mouth
  for (let k = 0; k <= 4; k++) {
    const x = -7, y = 10 - Math.round(k * 0.75), z = 4 + k;
    v.set(x, y, z, COPPER[0]); v.set(x - 1, y + 1, z, COPPER_D); v.set(x + 1, y + 1, z, COPPER_D);
  }
  v.box(-8, 10, 3, -6, 12, 3, BRASS_D); // collar on the drum
  // grass and a few dropped bites round the crate
  fineTufts(v, rnd, 18, (x, z) => x >= -9 && x <= 7 && z >= -7 && z <= 3);
  for (const [x, z] of [[-3, 9], [2, 8], [-1, 6]]) v.set(x, 0, z, pick(hv(x, 0, z), [0x5a7a2a, 0x6a4a2a]));
  return v;
}
// UV tube inside the cage (glow): a fat bright core with a softer shell
function grinderTube() {
  const v = new VoxelModel();
  for (let y = 23; y <= 29; y++) for (let x = -2; x <= 1; x++) for (let z = -3; z <= 0; z++) {
    const core = (x === -1 || x === 0) && (z === -2 || z === -1);
    const corner = (x === -2 || x === 1) && (z === -3 || z === 0);
    if (corner || (!core && (y === 23 || y === 29))) continue;
    v.set(x, y, z, core ? (y % 2 ? 0xf4f0ff : 0xe0d8ff) : (x + y + z) % 2 ? 0xa890ff : 0x9078ff);
  }
  return v;
}
// gear in the x/y plane, centred on the voxel corner (0, 0); r = outer radius in fine voxels
function gearModel(r, teeth) {
  const v = new VoxelModel();
  for (let x = -r - 1; x <= r; x++) for (let y = -r - 1; y <= r; y++) {
    const dx = x + 0.5, dy = y + 0.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const tooth = Math.floor(((a + PI) / TAU) * teeth * 2) % 2 === 0;
    if (d > r + 0.5 || (d > r - 0.5 && !tooth)) continue;
    v.set(x, y, 0, d < 1.3 ? IRON : d > r - 0.5 ? BRASS_D : d > r - 1.5 ? BRASS : (x + y) % 3 === 0 ? BRASS_L : BRASS);
  }
  return v;
}
function crankModel() {
  const v = new VoxelModel();
  for (let x = 0; x <= 3; x++) v.set(x, 0, 1, IRON);
  v.set(3, 0, 2, 0x9a6a3a); v.set(3, 0, 3, 0xb8844e); v.set(3, 0, 4, 0x9a6a3a);
  v.set(0, 0, 0, IRON_L);
  return v;
}
// burlap sack, 6 x 5 fine footprint, height by fullness (front at fine z 0, label on it)
const SACK_LEVELS = 5;
function sackModel(level, bulge) {
  const v = new VoxelModel();
  const H = 3 + level + (bulge ? 1 : 0);
  const W = 6 + (bulge ? 1 : 0);
  for (let y = 0; y < H; y++) {
    const t = y / Math.max(1, H - 1);
    const inset = t > 0.8 ? 1 : 0;
    const w2 = (bulge && y > 0 && y < H - 1) ? 0.6 : 0;
    for (let x = 0; x < W; x++) for (let z = -4; z <= 0; z++) {
      const ex = x < inset - w2 || x > W - 1 - inset + w2, ez = z < -4 + inset || z > -inset;
      if (ex || ez) continue;
      const corner = (x === 0 || x === W - 1) && (z === -4 || z === 0);
      if (corner && (y === 0 || y === H - 1)) continue;
      v.set(x, y, z, (x + y * 2 + z) % 4 === 0 ? BURLAP[1] : (x * 3 + y) % 7 === 0 ? BURLAP_D : BURLAP[0]);
    }
  }
  // open mouth with bug bites inside + a folded lip
  const m = Math.floor(W / 2);
  for (let x = 2; x < W - 2; x++) for (let z = -3; z <= -1; z++) v.set(x, H - 1, z, (x + z) % 2 ? 0x5a7a2a : 0x6a4a2a);
  if (level >= SACK_LEVELS - 1) { v.set(m, H, -2, 0x5a7a2a); v.set(m - 1, H, -2, 0x8aa040); }
  if (bulge) { v.set(-1, 0, 1, 0x5a7a2a); v.set(W, 0, 0, 0x6a4a2a); v.set(W + 1, 0, 1, 0x5a7a2a); }
  return v;
}

function buggrinder(seed, o) {
  const root = new THREE.Group();
  const shaker = new THREE.Group(); // everything that rattles while grinding
  root.add(shaker);
  shaker.add(vmesh(sgeo('grinder', () => grinderBody())));
  shaker.add(vmesh(sgeo('grinderdet', () => grinderDetails(), VF)));
  // zapper tube: own material so it can flicker
  const tubeMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  const tube = gmesh(sgeo('grindertube', () => grinderTube(), VF), tubeMat);
  shaker.add(tube);
  // soft glow halo (additive sprite) round the lamp
  let halo = null, haloMat = null;
  if (hasDOM) {
    haloMat = new THREE.SpriteMaterial({ map: haloTexture(), color: 0x9a7aff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    halo = new THREE.Sprite(haloMat);
    halo.scale.set(0.55, 0.55, 1);
    halo.position.set(-0.05, 1.32, 0.12);
    halo.userData.glow = true;
    halo.renderOrder = 30;
    shaker.add(halo);
  }
  // gears + crank (front-right), spinning about z
  const gears = [];
  const mkGear = (r, teeth, x, y, key) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0.235);
    g.add(vmesh(sgeo(key, () => gearModel(r, teeth), VF)));
    shaker.add(g);
    gears.push({ g, r });
    return g;
  };
  const big = mkGear(4, 9, 0.3, 0.64, 'gear4');
  const crank = vmesh(sgeo('crank', () => crankModel(), VF));
  crank.position.set(-0.025, -0.025, 0.02);
  big.add(crank);
  const small = mkGear(2, 6, 0.3 + 0.31 * Math.cos(2.5), 0.64 + 0.31 * Math.sin(2.5), 'gear2');
  void small;
  // status light on the drum top (green idle / amber grinding / red full)
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x6aff7a });
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), lightMat);
  light.position.set(0.22, 0.825, 0.12);
  light.userData.glow = true; light.userData.tintable = false;
  shaker.add(light);
  // sack (outside the shaker), geometry by fullness
  const sackG = new THREE.Group();
  sackG.position.set(-0.47, 0, 0.47);
  root.add(sackG);
  const sack = new Slot(sackG, VF);
  let sackLabel = null;
  if (o.decals) {
    decal(shaker, 'grinder:plate', 90, [-0.07, 0.31, fP(1)]);
    decal(shaker, 'grinder:port', 56, [-0.17, 0.6, fP(1)]);
    decal(shaker, 'grinder:hazard', 40, [-0.05, 0.955, 0.205 + EPS], { n: [0, 0.35, 0.94] });
    sackLabel = decal(sackG, 'grinder:label', 110, [0.15, 0.13, 0.05 + EPS]);
  }
  // steam puffs from the exhaust + bites dropping down the chute
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xf2f0ec, transparent: true, opacity: 0.9 });
  const puffGeo = puffGeometry();
  const puffs = [0, 1, 2, 3].map((i) => {
    const m = new THREE.Mesh(puffGeo, puffMat);
    m.visible = false; m.castShadow = false; m.userData.tintable = false;
    shaker.add(m);
    return { m, ph: i / 4 };
  });
  const biteMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const bites = [0, 1].map((i) => {
    const m = new THREE.Mesh(puffGeo, biteMat);
    m.scale.setScalar(0.35); m.visible = false; m.userData.tintable = false;
    root.add(m);
    return { m, ph: i * 0.5 };
  });
  let state = 'idle', fill = 0, t = 0, spin = 0, spinV = 0, zapT = 0, nextZap = 2.5 + (seed % 5) * 0.4;
  const setSack = () => {
    const full = state === 'full';
    const level = full ? SACK_LEVELS - 1 : Math.round(fill * (SACK_LEVELS - 1));
    sack.set(`sack|${level}|${full ? 1 : 0}`, () => sackModel(level, full));
    if (sackLabel) {
      const H = 3 + level + (full ? 1 : 0);
      sackLabel.position.set(0.15 + (full ? 0.025 : 0), Math.max(0.1, H * VF * 0.45), 0.05 + EPS);
    }
  };
  const api = {
    root,
    setFill(kk) { fill = clamp01(kk || 0); setSack(); },
    setState(name) {
      state = FARM_STATES.buggrinder.includes(name) ? name : 'idle';
      lightMat.color.setHex(state === 'grinding' ? 0xffc040 : state === 'full' ? 0xff4a3a : 0x6aff7a);
      setSack();
    },
    zap() { zapT = 0.22; },
    update(dt) {
      t += dt;
      const grinding = state === 'grinding';
      // gears spin up / coast down
      spinV += ((grinding ? 7 : 0) - spinV) * Math.min(1, dt * (grinding ? 3 : 1.5));
      spin += spinV * dt;
      big.rotation.z = -spin;
      gears[1].g.rotation.z = spin * (4 / 2.4);
      // rattle while grinding
      if (grinding) {
        shaker.position.set(Math.sin(t * 53) * 0.006, Math.abs(Math.sin(t * 31)) * 0.008, Math.cos(t * 47) * 0.004);
        shaker.rotation.z = Math.sin(t * 41) * 0.012;
      } else { shaker.position.set(0, 0, 0); shaker.rotation.z = 0; }
      // zapper flicker + an occasional ZAP (bright flash)
      nextZap -= dt;
      if (nextZap <= 0) { zapT = 0.18; nextZap = 2 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) % 1 * 4; }
      zapT = Math.max(0, zapT - dt);
      const n = 0.86 + Math.sin(t * 23) * 0.06 + Math.sin(t * 61 + 1) * 0.05 + (Math.sin(t * 7.3) > 0.97 ? -0.3 : 0);
      const zap = zapT > 0 ? 1 : 0;
      tubeMat.color.setScalar(1.15 * n);
      if (zap) tubeMat.color.setRGB(1.6, 1.6, 1.8);
      if (haloMat) {
        haloMat.opacity = zap ? 0.95 : 0.35 + n * 0.2;
        halo.scale.setScalar(zap ? 0.75 : 0.5 + Math.sin(t * 3) * 0.02);
        haloMat.color.setHex(zap ? 0xd8d0ff : 0x9a7aff);
      }
      lightMat.color.multiplyScalar(1); // keep
      if (state === 'full') light.visible = Math.sin(t * 9) > -0.2; else light.visible = true;
      // puffs: rise from the exhaust, grow, fade
      for (const p of puffs) {
        p.m.visible = grinding;
        if (!grinding) continue;
        const u = (t * 0.9 + p.ph) % 1;
        p.m.position.set(0.35 + Math.sin(u * 5 + p.ph * 9) * 0.03, 1.42 + u * 0.38, -0.25 + u * 0.05);
        p.m.scale.setScalar((0.5 + u * 0.9) * (u > 0.75 ? (1 - u) / 0.25 : 1));
      }
      puffMat.opacity = 0.9;
      // bites tumbling from the chute into the sack
      for (const b of bites) {
        b.m.visible = grinding;
        if (!grinding) continue;
        const u = (t * 1.6 + b.ph) % 1;
        b.m.position.set(-0.33, 0.4 - u * u * 0.14, 0.42 + u * 0.03);
      }
    },
    dispose() {
      sack.dispose();
      tubeMat.dispose(); lightMat.dispose(); puffMat.dispose(); biteMat.dispose(); haloMat?.dispose();
      light.geometry.dispose();
    },
  };
  return api;
}
let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  // dithered round glow (pixel-y, no smooth gradient)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
    const a = Math.max(0, 1 - d);
    const th = ((x & 1) * 2 + (y & 1)) / 4 * 0.6;
    if (a * a > th + 0.05) { g.fillStyle = `rgba(255,255,255,${Math.min(1, a * 1.2).toFixed(2)})`; g.fillRect(x, y, 1, 1); }
  }
  haloTex = new THREE.CanvasTexture(c);
  haloTex.magFilter = THREE.NearestFilter; haloTex.minFilter = THREE.NearestFilter; haloTex.generateMipmaps = false;
  return haloTex;
}
let puffGeoShared = null;
const puffGeometry = () => puffGeoShared || (puffGeoShared = new THREE.BoxGeometry(0.07, 0.07, 0.07));

// ================================================================ BUNNY HUTCH
// Two storeys on legs: x -4..3, z -3..0. Lower storey y 4..7 (wire-mesh window + door with a
// ramp down to the ground), floor y 8, upper storey y 9..11 (heart cutout + round doorway),
// mint gable roof y 12..15 with the carrot name sign, hay rack on the left side.
const MINT = [0x6ac0a8, 0x5aae96, 0x7ad0b8], CREAM_T = 0xf2ead6;
const HPLANK = [0xd8a868, 0xc8985a, 0xe2b676];
const BUNNY_COLS = [
  { fur: 0xf6f2ea, furD: 0xdcd6cc, ear: 0xf0a8b8 },
  { fur: 0xb8875a, furD: 0x9a6c44, ear: 0xe89aa8 },
  { fur: 0x9a98a4, furD: 0x7e7c88, ear: 0xe8a0b0 },
  { fur: 0x3a3438, furD: 0x2a2428, ear: 0xd88a9a },
];

function hutchBody(sv) {
  const v = new VoxelModel();
  const plank = (x, y, z) => {
    const c = HPLANK[((y + 40) >> 1) % 3];
    return hv(x, y, z, 11) < 0.1 ? shade(c, 0.86) : c;
  };
  // legs
  for (const [x, z] of [[-4, -3], [3, -3], [-4, 0], [3, 0]]) v.box(x, 0, z, x, 2, z, WOOD_D);
  // lower storey floor, walls, dark inside
  v.box(-4, 3, -3, 3, 3, 0, (x, y, z) => (z === 0 ? CREAM_T : WOOD_M));
  v.box(-4, 4, -3, 3, 7, -3, plank);
  v.box(-4, 4, -3, -4, 7, 0, plank);
  v.box(3, 4, -3, 3, 7, 0, plank);
  v.box(-3, 4, -2, 2, 7, -2, (x, y) => (y === 4 ? STRAW[1] : 0x5a3a22)); // inner back + straw bedding
  v.box(-3, 4, -1, 2, 4, -1, (x) => STRAW[(x + 9) % 4]);
  // front of the lower storey: posts round the mesh window (x -3..-1) and the door (x 1..2)
  for (let y = 4; y <= 7; y++) { v.set(-4, y, 0, CREAM_T); v.set(0, y, 0, CREAM_T); v.set(3, y, 0, CREAM_T); }
  v.box(-3, 7, 0, 2, 7, 0, CREAM_T);
  // middle floor with a cream trim
  v.box(-4, 8, -3, 3, 8, 0, (x, y, z) => (z === 0 ? CREAM_T : WOOD_M));
  // upper storey: planked front with a round doorway on the right
  v.box(-4, 9, -3, 3, 11, 0, (x, y, z) => (x === -4 || x === 3) && z === 0 ? CREAM_T : plank(x, y, z));
  v.box(-3, 9, -2, 2, 11, -1, null);
  for (const [x, y] of [[1, 9], [2, 9], [1, 10], [2, 10]]) v.set(x, y, 0, null);
  v.box(1, 9, -1, 2, 10, -1, 0x2a1810); // dark inside the doorway
  v.set(1, 11, 0, CREAM_T); v.set(2, 11, 0, CREAM_T);
  // mint gable roof (ridge along z), cream barge boards in front
  for (let k = 0; k <= 3; k++) {
    const y = 12 + k, x0 = -5 + k, x1 = 4 - k;
    for (let x = x0; x <= x1; x++) for (let z = -4; z <= 1; z++) {
      const edge = x === x0 || x === x1;
      if (z === 1 && !edge) continue;
      if (edge) v.set(x, y, z, z === 1 ? CREAM_T : MINT[(z + k + 20) % 3]);
      else if (z === 0) v.set(x, y, z, plank(x, y, z));
      else v.set(x, y, z, k === 3 ? MINT[(z + 21) % 3] : WOOD_M);
    }
  }
  // ramp from the lower door down to the ground, with cleats
  for (let k = 0; k <= 3; k++) for (let x = 1; x <= 2; x++) v.set(x, 3 - k, 1 + k, k % 2 ? WOOD[0] : WOOD[2]);
  // hay rack on the left side: V of dark bars, hay sticking out
  for (let z = -2; z <= -1; z++) { v.set(-5, 5, z, IRON); v.set(-6, 6, z, IRON); v.set(-6, 7, z, STRAW[2]); v.set(-5, 6, z, STRAW[0]); v.set(-5, 7, z, STRAW[1]); }
  v.set(-6, 8, -2, STRAW[2]); v.set(-5, 8, -1, STRAW[0]);
  if (sv === 1) v.set(-6, 8, -1, 0xf07a1a); // a carrot tucked in the hay
  return v;
}
// fine details: straw spilling out, water bottle on the mesh, grass, a carrot on the ramp
function hutchDetails(sv) {
  const v = new VoxelModel();
  const rnd = mulberry32(sv * 41 + 9);
  for (let i = 0; i < 26; i++) {
    const x = 1 + Math.floor(rnd() * 6) - (rnd() < 0.3 ? 4 : 0), z = 2 + Math.floor(rnd() * 8);
    const onRamp = x >= 2 && x <= 5 && z >= 2 && z <= 9;
    const y = onRamp ? Math.max(0, 8 - (z - 1)) : 0;
    v.set(x, y, z, pick(rnd(), STRAW));
  }
  for (let x = -8; x <= 6; x++) if (rnd() < 0.5) v.set(x, 0, -3 + Math.floor(rnd() * 4), pick(rnd(), STRAW)); // under the hutch
  // water bottle hanging on the mesh (upside down, metal spout)
  for (let y = 10; y <= 13; y++) v.set(-1, y, 2, y === 13 ? 0xc84a3a : y === 10 ? 0x9ad0f0 : 0x6ab4e8);
  v.set(-1, 9, 2, CHROME); v.set(-2, 8, 2, METAL_D);
  // a carrot dropped on the ground by the ramp
  v.set(-1, 0, 8, 0xf07a1a); v.set(0, 0, 8, 0xf07a1a); v.set(1, 0, 8, 0xc85a10); v.set(-2, 1, 8, 0x5ab040); v.set(-2, 0, 9, 0x3a8a2a);
  fineTufts(v, rnd, 20, (x, z) => x >= -10 && x <= 7 && z >= -7 && z <= 1);
  return v;
}
// a bunny head peeking out (fine voxels, origin at the bottom centre of the head, facing +z)
function bunnyHead(ci) {
  const v = new VoxelModel();
  const C = BUNNY_COLS[ci];
  for (let x = -2; x <= 1; x++) for (let y = 0; y <= 2; y++) for (let z = -2; z <= 0; z++) {
    if ((x === -2 || x === 1) && y === 2 && z === 0) continue;
    v.set(x, y, z, y === 0 && z === 0 ? C.furD : C.fur);
  }
  v.set(-1, 1, 1, C.fur); v.set(0, 1, 1, C.fur); v.set(-1, 0, 1, 0xf6f2ea); v.set(0, 0, 1, 0xf6f2ea); // muzzle
  v.set(-1, 1, 1, 0xf090a0); // nose
  v.set(-2, 2, 1, 0x1a1a1e); v.set(1, 2, 1, 0x1a1a1e); // eyes
  if (ci === 3) { v.set(-1, 2, 1, 0xf6f2ea); v.set(0, 2, 1, 0xf6f2ea); } // white blaze
  for (const x of [-2, 1]) for (let y = 3; y <= 5; y++) { v.set(x, y, -1, C.fur); v.set(x, y, 0, y < 5 ? C.ear : C.fur); }
  return v;
}

function rabbithutch(seed, o) {
  const root = new THREE.Group();
  const sv = seed % 2;
  root.add(vmesh(sgeo(`hutch:${sv}`, () => hutchBody(sv))));
  root.add(vmesh(sgeo(`hutchdet:${sv}`, () => hutchDetails(sv), VF), { shadow: false }));
  // peeking bunnies: lower window (behind the mesh), lower door, upper doorway, under the hutch
  const SPOTS = [[-0.2, 0.42, -0.06, 0], [0.2, 0.42, 0.0, 1], [0.2, 0.9, 0.0, 2], [-0.12, 0.0, 0.14, 3]];
  const bunnies = SPOTS.map(([x, y, z, ci], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const m = vmesh(sgeo(`bunny:${(ci + sv) % 4}`, () => bunnyHead((ci + sv) % 4), VF), { shadow: false });
    g.add(m);
    g.visible = false;
    root.add(g);
    return { g, y, ph: i * 1.7 };
  });
  if (o.decals) {
    decal(root, 'hutch:mesh', 52, [-0.2, 0.54, fP(0)]);
    decal(root, 'hutch:heart', 40, [-0.2, 1.0, fP(0)]);
    decal(root, `hutch:name:${BUNNY_NAMES[seed % BUNNY_NAMES.length]}`, 64, [0, 1.335, fP(0)]);
  }
  let n = 0, t = 0;
  return {
    root,
    setFill(kk) {
      n = Math.round(clamp01(kk || 0) * 4);
      bunnies.forEach((b, i) => { b.g.visible = i < n; });
    },
    setState() {},
    update(dt) {
      t += dt;
      for (const b of bunnies) {
        if (!b.g.visible) continue;
        // little hops of curiosity + head tilts
        const hop = Math.max(0, Math.sin(t * 1.3 + b.ph)) ** 6;
        b.g.position.y = b.y + hop * 0.03;
        b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.12;
        b.g.rotation.y = Math.sin(t * 0.6 + b.ph * 2) * 0.3;
      }
    },
    dispose() {},
  };
}

// ================================================================ CONSTRUCTION MARKERS
// One merged mesh per variant (posts, cone, sign post, hard hat as fine voxels + the tape
// ribbons, all vertex-coloured) with a shared flutter material, plus one decal for the sign
// face whose geometry is swapped per progress frame. Everything is shared: a marker owns
// nothing but its Group, so 100+ markers cost ~2 draw calls and ~400 triangles each.
const MK_KINDS = { tile: 0, forest: 1, tree: 1, boulder: 2, rock: 2, weed: 3, clutter: 3 };
const MK_FRAMES = 6; // 0..4 = progress pips lit, 5 = done
const MK_TEX = 15;
const MK_PICTO = [
  ['..kkk..', '.kkkkk.', 'kkkkkkk', '.k.k.k.', '.kkkkk.', '..k.k..'], // beaver in a hard hat
  ['...k...', '..kkk..', '.kkkkk.', 'kkkkkkk', '...k.kk', '...k..k'], // tree + axe
  ['....k..', '.kk.kk.', 'kkkk.k.', 'kkkkk..', 'kkkkk..', '.kkk...'], // rock + pick
  ['.k...k.', 'kk.k.kk', '.kkkkk.', '...k...', '..kkk..', '.kkkkk.'], // weed + mound
];
let MK = null; // shared material, atlas, frame geometries, variant geometries
function markerShared() {
  if (MK) return MK;
  const uTime = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMkTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFl;\nuniform float uMkTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 2.3;
  float w = length(aFl.xyz);
  transformed += aFl.xyz * 0.03 * sin(uMkTime * 6.5 + aFl.w * 9.0 + ph);
  transformed.y += w * 0.014 * sin(uMkTime * 5.1 + aFl.w * 7.0 + ph * 1.3);
}`);
  };
  mat.customProgramCacheKey = () => 'farmMarkerFlutter';
  MK = { uTime, mat, frames: new Map(), variants: new Map(), signMat: null, atlas: null };
  if (hasDOM) {
    const W = MK_TEX * MK_FRAMES, H = MK_TEX * 4;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = painter(c.getContext('2d'), W, H, 5);
    for (let k = 0; k < 4; k++) for (let f = 0; f < MK_FRAMES; f++) {
      const ox = f * MK_TEX, oy = k * MK_TEX, done = f === MK_FRAMES - 1;
      for (let y = 0; y < MK_TEX; y++) for (let x = 0; x < MK_TEX; x++) {
        const d = Math.abs(x - 7) + Math.abs(y - 7);
        if (d > 7) continue;
        g.px(ox + x, oy + y, d >= 6 ? '#1a1a1e' : d === 5 ? (done ? '#8ae890' : '#ffb060') : done ? '#3aa84a' : '#f08a1a');
      }
      if (done) g.icon(['.....kk', '....kk.', 'kk.kk..', '.kkk...', '..k....'], ox + 4, oy + 4, { k: '#ffffff' });
      else {
        g.icon(MK_PICTO[k], ox + 4, oy + 3, { k: '#1a1a1e' });
        for (let i = 0; i < 4; i++) g.px(ox + 5 + i + (i > 1 ? 1 : 0), oy + 10, i < f ? '#fff6b0' : '#a85a10');
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    MK.atlas = { canvas: c, tex, W, H };
    MK.signMat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xf6f6f6 });
  }
  return MK;
}
function markerFrameGeo(kind, f) {
  const S = markerShared();
  const key = kind * 10 + f;
  let g = S.frames.get(key);
  if (g) return g;
  const sz = MK_TEX / 64;
  g = new THREE.PlaneGeometry(sz, sz);
  const uv = g.attributes.uv;
  const u0 = (f * MK_TEX) / S.atlas.W, u1 = ((f + 1) * MK_TEX) / S.atlas.W;
  const v1 = 1 - (kind * MK_TEX) / S.atlas.H, v0 = 1 - ((kind + 1) * MK_TEX) / S.atlas.H;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1);
  S.frames.set(key, g);
  return g;
}
// variant layout from the seed: where the cone / sign go, post style, hard hat
function markerLayout(seed, size, edges) {
  const h = (k) => hash3(seed * 3 + k, seed >> 4, k * 7);
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]; // +x+z, -x+z, -x-z, +x-z (front corners first)
  const front = h(1) < 0.5 ? 0 : 1;
  return {
    cone: corners[(front + (h(2) < 0.65 ? 1 : 2)) % 4],
    sign: corners[front],
    hat: h(3) < 0.5 ? corners[(front + 2) % 4] : null,
    stake: h(4) < 0.35, // wooden stakes instead of striped delineators
    variant: Math.floor(h(5) * 4),
    size, edges,
  };
}
function markerGeometry(L) {
  const half = L.size / 2 - 0.06;
  const fi = (w) => Math.round(w / VF); // world -> fine index
  const v = new VoxelModel();
  const has = (sx, sz) => (sx > 0 && L.edges & 1) || (sx < 0 && L.edges & 2) || (sz > 0 && L.edges & 4) || (sz < 0 && L.edges & 8);
  const POST_H = 6;
  const posts = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    if (!has(sx, 0) && !has(0, sz)) continue;
    const x = fi(sx * half) - (sx > 0 ? 1 : 0), z = fi(sz * half) - (sz > 0 ? 1 : 0);
    posts.push([sx, sz]);
    if (L.stake) {
      for (let y = 0; y < POST_H; y++) v.set(x, y, z, y === POST_H - 1 ? LOG_END : y % 3 === 0 ? BARK_D : BARK[0]);
      v.set(x, POST_H, z, 0xf2c230); // a wrap of tape at the top
    } else {
      for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) v.set(x + dx, 0, z + dz, Math.abs(dx) + Math.abs(dz) === 2 ? null : 0x2a2a30);
      for (let y = 1; y <= POST_H; y++) v.set(x, y, z, Math.floor((y - 1) / 2) % 2 ? 0xf6f2ea : 0xf07a1a);
    }
    if (L.hat && L.hat[0] === sx && L.hat[1] === sz) { // hard hat hung on the post
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) v.set(x + dx, POST_H + 1, z + dz, Math.abs(dx) + Math.abs(dz) === 2 ? 0xe8a818 : 0xf6c830);
      v.set(x, POST_H + 2, z, 0xffe070); v.set(x + (sz > 0 ? 0 : 0), POST_H + 1, z + 2 * Math.sign(sz || 1), 0xe8a818);
    }
  }
  // traffic cone just inside a corner
  {
    const [sx, sz] = L.cone;
    const x = fi(sx * (half - 0.14)) - 1, z = fi(sz * (half - 0.14)) - 1;
    for (let dx = -1; dx <= 2; dx++) for (let dz = -1; dz <= 2; dz++) v.set(x + dx, 0, z + dz, 0x2a2a30);
    for (let y = 1; y <= 2; y++) for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) v.set(x + dx, y, z + dz, y === 2 ? 0xf6f2ea : 0xf07a1a);
    v.set(x, 3, z, 0xf07a1a); v.set(x + 1, 3, z + 1, 0xe06a10); v.set(x + 1, 3, z, 0xf07a1a); v.set(x, 3, z + 1, 0xf07a1a);
    v.set(x, 4, z, 0xff9a3a); v.set(x + 1, 4, z + 1, 0xf6f2ea);
  }
  // sign post (the diamond decal goes on top)
  {
    const [sx, sz] = L.sign;
    const x = fi(sx * (half - 0.16)), z = fi(sz * (half - 0.05));
    for (let y = 0; y <= 6; y++) v.set(x, y, z, y === 0 ? 0x2a2a30 : 0x8a8a94);
    L.signPos = [(x + 0.5) * VF, 0.44, (z + 1) * VF + 0.006];
  }
  const vg = v.build({ scale: VF });
  // tape ribbons between post tops (sagging), alternating yellow / black segments, both faces
  const P = Array.from(vg.attributes.position.array), N = Array.from(vg.attributes.normal.array), C = Array.from(vg.attributes.color.array);
  const I = Array.from(vg.index.array);
  const F = new Array((P.length / 3) * 4).fill(0);
  vg.dispose();
  const Y = new THREE.Color(0xffd23a).convertSRGBToLinear(), K = new THREE.Color(0x1e1a22).convertSRGBToLinear();
  const top = (POST_H - 0.5) * VF, sag = 0.05, wide = 0.07;
  const ribbon = (ax, az, bx, bz, ox, oz, segs, tail = false) => {
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const col = i % 2 ? K : Y;
      const pts = [];
      for (const t of [t0, t1]) {
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = top - (tail ? t * 0.14 : Math.sin(t * PI) * sag);
        const w = tail ? t : Math.sin(t * PI);
        // tilt the ribbon outward a little so the high camera sees its face
        pts.push([x, y + wide / 2, z, w, t], [x + ox * 0.03, y - wide / 2, z + oz * 0.03, w, t]);
      }
      const nx = ox * 0.9, ny = 0.42, nz = oz * 0.9;
      for (const side of [1, -1]) {
        const base = P.length / 3;
        for (const [x, y, z, w, t] of pts) {
          P.push(x, y, z); N.push(nx * side, ny * side, nz * side); C.push(col.r, col.g, col.b);
          F.push(ox * w * (tail ? 1.8 : 1), 0, oz * w * (tail ? 1.8 : 1), t);
        }
        if (side > 0) I.push(base, base + 1, base + 3, base, base + 3, base + 2);
        else I.push(base, base + 3, base + 1, base, base + 2, base + 3);
      }
    }
  };
  const segs = Math.max(6, Math.round(L.size * 10));
  const cx = (sx) => sx * half, sides = [[1, 0, 1], [-1, 0, 2], [0, 1, 4], [0, -1, 8]];
  for (const [sx, sz, bit] of sides) {
    if (!(L.edges & bit)) continue;
    if (sx) ribbon(cx(sx), -half, cx(sx), half, sx, 0, segs);
    else ribbon(-half, cx(sz), half, cx(sz), 0, sz, segs);
  }
  // a loose end flapping from one post
  if (posts.length) {
    const [sx, sz] = posts[L.variant % posts.length];
    ribbon(sx * half, sz * half, sx * (half + 0.02), sz * (half + 0.16), sx || 1, 0, 3, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aFl', new THREE.Float32BufferAttribute(F, 4));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere();
  g.userData.signPos = L.signPos;
  return g;
}

/**
 * Construction tape + posts round a tile marked for the beavers to clear.
 * @param {{ seed?: number, size?: number, kind?: string, edges?: number }} [o]
 */
export function makeConstructionMarker({ seed = 1, size = 1, kind = 'tile', edges = 15 } = {}) {
  const S = markerShared();
  seed = Math.abs(seed | 0);
  size = Math.max(1, Math.round(size || 1));
  edges &= 15;
  const L = markerLayout(seed, size, edges);
  const vkey = `${L.cone}|${L.sign}|${L.hat}|${L.stake}|${L.variant}|${size}|${edges}`;
  let geo = S.variants.get(vkey);
  if (!geo) { geo = markerGeometry(L); S.variants.set(vkey, geo); }
  const root = new THREE.Group();
  root.name = 'constructionMarker';
  const body = new THREE.Mesh(geo, S.mat);
  body.castShadow = true; body.receiveShadow = true;
  body.userData.tintable = false;
  root.add(body);
  const k = MK_KINDS[kind] ?? 0;
  let sign = null;
  if (S.signMat) {
    sign = new THREE.Mesh(markerFrameGeo(k, 0), S.signMat);
    const sp = geo.userData.signPos;
    sign.position.set(sp[0], sp[1], sp[2]);
    sign.castShadow = true;
    sign.userData.decal = 'marker:sign';
    root.add(sign);
  }
  let frame = 0, age = 0, flip = 0, closing = -1, onClosed = null, time = 0;
  root.scale.setScalar(0.001);
  return {
    root,
    update(dt = 0, tm) {
      dt = Math.min(0.1, Math.max(0, dt || 0));
      time = tm ?? time + dt;
      S.uTime.value = time;
      age += dt;
      if (closing >= 0) {
        closing += dt;
        const u = Math.min(1, closing / 0.25);
        root.scale.set(1 + u * 0.15, Math.max(0.001, 1 - u), 1 + u * 0.15);
        if (u >= 1 && onClosed) { const cb = onClosed; onClosed = null; cb(); }
        return;
      }
      // pop in: squash-and-stretch overshoot
      const u = Math.min(1, age / 0.45);
      const e = u >= 1 ? 1 : 1 + Math.sin(u * PI * 1.5) * (1 - u) * 0.6 - (1 - u) ** 3;
      root.scale.set(1 / Math.sqrt(Math.max(0.3, e)) * Math.min(1, u * 3), Math.max(0.001, e), 1 / Math.sqrt(Math.max(0.3, e)) * Math.min(1, u * 3));
      if (sign && flip > 0) { flip = Math.max(0, flip - dt); sign.rotation.y = (1 - flip / 0.45) * TAU; if (flip === 0) sign.rotation.y = 0; }
    },
    setProgress(p) {
      const f = p >= 1 ? MK_FRAMES - 1 : Math.max(0, Math.min(4, Math.floor(clamp01(p || 0) * 5)));
      if (f === frame || !sign) return;
      if (f === MK_FRAMES - 1) flip = 0.45; // the sign flips round to the green check
      frame = f;
      sign.geometry = markerFrameGeo(k, f);
    },
    close(cb) { closing = 0; onClosed = cb || null; },
    dispose() { root.removeFromParent(); },
  };
}

// ================================================================ STRIKE SIGN
/** Handheld "NO PAY NO WORK" picket sign: origin = grip, stick along +Y, board faces +Z. */
export function makeStrikeSign() {
  const g = new THREE.Group();
  g.name = 'strikeSign';
  const stick = vmesh(sgeo('strikestick', () => {
    const v = new VoxelModel();
    for (let y = -4; y <= 12; y++) for (const x of [-1, 0]) v.set(x, y, -1, y % 5 === 0 ? 0x9a6a3a : 0xb8844e);
    v.set(-1, -5, -1, 0x8a5a30);
    return v;
  }, 0.025));
  g.add(stick);
  const board = new THREE.Group();
  board.position.set(0, 0.4, 0);
  board.add(vmesh(sgeo('strikeboard', () => {
    const v = new VoxelModel();
    v.box(-7, -4, 0, 6, 3, 0, (x, y) => ((x + y) % 5 === 0 ? 0xc09a60 : 0xd0aa6c));
    return v;
  }, 0.025)));
  if (hasDOM) {
    decal(board, 'strike:sign', 100, [-0.0125, -0.0125, 0.025 + EPS]);
    decal(board, 'strike:sign', 100, [-0.0125, -0.0125, -EPS], { n: [0, 0, -1] });
  }
  g.add(board);
  return g;
}

// ---------------------------------------------------------------- debug / previews
export const FARM_DECALS = Object.keys(DEFS);
export function farmDecalCanvas(key) { return texInfo(key).canvas; }

// ---------------------------------------------------------------- public API
const BUILDERS = { snackbowl, pantry, beaverbar, buggrinder, rabbithutch };

/**
 * Build a farm / food-storage model.
 * @param {string} type one of FARM_TYPES
 * @param {{ seed?: number, decals?: boolean }} [o] decals: false skips the 2D decals (ghost previews)
 */
export function farmModel(type, { seed = 1, decals = true } = {}) {
  const fn = BUILDERS[type];
  if (!fn) return null;
  const s = Math.abs(seed | 0);
  const m = fn(s, { decals: decals && hasDOM });
  m.root.name = 'farm:' + type;
  m.type = type;
  m.states = FARM_STATES[type] || ['idle'];
  let time = 0, disposed = false;
  const upd = m.update;
  m.update = (dt = 0, tm) => {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    time = tm ?? time + dt;
    upd(dt, time);
  };
  const dis = m.dispose;
  m.dispose = () => {
    if (disposed) return;
    disposed = true;
    m.root.removeFromParent();
    dis?.();
  };
  if (!m.zap) m.zap = () => {};
  m.setFill(0);
  m.setState('idle');
  return m;
}
