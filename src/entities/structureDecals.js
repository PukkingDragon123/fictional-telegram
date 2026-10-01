// 2D pixel-art decals (menus, posters, price boards, labels, stickers, chalk
// specials, plaques...) layered onto the voxel structures so the 3D builds get
// crisp, hand-drawn details that voxels are too coarse for.
//
// Every decal is a small textured plane. Textures are drawn procedurally on a
// canvas (a 3x5 pixel font + pixel-string icons), cached and shared by every
// instance. Texel density is ~32-48 texels per world unit (1 voxel = 0.1).
//
// decalsFor(type, { seed, depth }) -> THREE.Group | null
//   Positions are in the structure's local space: the same space as the group
//   StructureSystem.makeObject() returns (origin = footprint centre on the
//   base surface, +z = model front), BEFORE the object's own rotation. Just
//   add the returned group as a child of that object. `seed` picks poster /
//   placemat / number variants, `depth` is the lodge's water depth in voxels
//   (StructureSystem.depthVox(s)).
// hutDecals() -> THREE.Group
//   In the hut model's local space (world.js `hg`, built without a pivot at
//   scale 0.1, positioned at HUT.x, 0, HUT.z): add it as a child of that group.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const PI = Math.PI;
const EPS = 0.004; // gap off the surface (plus polygonOffset)

// ------------------------------------------------------------------ pixel font
// Variable width glyphs, 5 rows. '#' = ink.
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
  e: ['...', '.#.', '###', '#..', '.##'],
  0: ['.#.', '#.#', '#.#', '#.#', '.#.'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '##.', '#.#', '.#.'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['.#.', '#.#', '.#.', '#.#', '.#.'],
  9: ['.#.', '#.#', '.##', '..#', '##.'],
  ' ': ['..', '..', '..', '..', '..'], '.': ['.', '.', '.', '.', '#'], ',': ['..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '#', '.'], '!': ['#', '#', '#', '.', '#'], "'": ['#', '#', '.', '.', '.'],
  '-': ['...', '...', '###', '...', '...'], '=': ['...', '###', '...', '###', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
  '*': ['#.#', '.#.', '#.#', '...', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  '#': ['#.#', '###', '#.#', '###', '#.#'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '¢': ['.#.', '###', '#..', '###', '.#.'], '°': ['##', '##', '..', '..', '..'], '^': ['.#.', '#.#', '...', '...', '...'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
};
const glyph = (ch) => GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS[' '];
export function textWidth(s, scale = 1) {
  let w = 0;
  for (const ch of s) w += glyph(ch)[0].length * scale + scale;
  return Math.max(0, w - scale);
}

// ------------------------------------------------------------------ icons
const ICONS = {
  // bluegill, head left, forked tail right (o = eye)
  fish: ['.###..#', '#o###.#', '######.', '#####.#', '.###..#'],
  trout: ['.#####.#', '#o######', '.#####.#'],
  berry: ['..g..', '.#g#.', '#####', '#####', '.###.'],
  mug: ['fff..', 'bbbg.', 'bbb.g', 'bbbg.', 'bbb..'],
  flame: ['.r.', '.rr', 'ror', 'oyo', '.y.'],
  leaf: ['..#..', '#.#.#', '#####', '.###.', '..#..'],
  star: ['.#.', '###', '.#.'],
  paw: ['#.#', '...', '###', '###'],
  moose: [
    'aa.a.....a.aa', '.aaa.....aaa.', '..aa.....aa..', '....mmmmm....', '...meemmmeem..',
    '....mmmmm....', '.....mmmd....', '.....mmmm....', '......ddd....', '.......d.....',
  ],
  cat: [
    '....b....b....', '....b....b....', '...oooooooo...', '...oeooooeo...', '...oooponooo..',
    '....oooooo....', '...oooooooo...', '...owwwwwwo...', '...owwwwwwo...', '....oo..oo....', '..........o...', '...........o..',
  ],
  bear: [
    '.bb.....bb.', 'bbbbbbbbbbb', '.bbbbbbbbb.', '.bebbbbbeb.', '.bbbmmmbbb.', '..bbmnmbb..',
    '...bbbbb...', '..swwtwws..', '.sswwtwwss.', 'sssswtwssss', 'ssssstsssss',
  ],
};

// ------------------------------------------------------------------ painter
function painter(ctx, W, H, seed = 1) {
  const rnd = mulberry32(seed >>> 0);
  const g = {
    W, H, rnd, ctx,
    px(x, y, c) { if (!c) return; ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); },
    rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
    clear(x, y, w = 1, h = 1) { ctx.clearRect(x, y, w, h); },
    frame(x, y, w, h, c) { g.rect(x, y, w, 1, c); g.rect(x, y + h - 1, w, 1, c); g.rect(x, y, 1, h, c); g.rect(x + w - 1, y, 1, h, c); },
    hline(x0, x1, y, c) { g.rect(x0, y, x1 - x0 + 1, 1, c); },
    vline(x, y0, y1, c) { g.rect(x, y0, 1, y1 - y0 + 1, c); },
    // speckle a region with a few alternate colours (paper fibres, chalk dust, grain)
    speckle(x, y, w, h, cols, p = 0.12) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rnd() < p) g.px(x + i, y + j, cols[Math.floor(rnd() * cols.length)]);
    },
    // wood planks: horizontal grain rows
    wood(x, y, w, h, base, dark, light) {
      g.rect(x, y, w, h, base);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const r = rnd();
        if (r < 0.05) g.px(x + i, y + j, dark); else if (r < 0.09 && light) g.px(x + i, y + j, light);
      }
    },
    text(s, x, y, c, { shadow = null, scale = 1 } = {}) {
      if (shadow) g.text(s, x + scale, y + scale, shadow, { scale });
      let cx = x;
      for (const ch of s) {
        const gl = glyph(ch);
        for (let r = 0; r < 5; r++) for (let k = 0; k < gl[r].length; k++) if (gl[r][k] === '#') g.rect(cx + k * scale, y + r * scale, scale, scale, c);
        cx += gl[0].length * scale + scale;
      }
      return cx - x - scale;
    },
    ctext(s, y, c, o = {}) {
      const x0 = o.x0 ?? 0, w = o.w ?? W;
      return g.text(s, x0 + Math.floor((w - textWidth(s, o.scale || 1)) / 2), y, c, o);
    },
    // pixel-string sprite; pal maps chars -> colour ('#' default ink)
    icon(name, x, y, pal) {
      const rows = ICONS[name] || name;
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.') g.px(x + i, y + j, pal[ch] || pal['#']); } });
    },
    disk(cx, cy, r, c) {
      for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++)
        for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) g.px(i, j, c);
    },
    daisy(cx, cy, r, petal = '#f6d030', centre = '#c8701c', tip = '#fff0a0') {
      g.disk(cx, cy, r, petal);
      if (r >= 3) for (let a = 0; a < 8; a++) g.px(Math.round(cx + Math.cos(a * PI / 4) * r), Math.round(cy + Math.sin(a * PI / 4) * r), tip);
      g.disk(cx, cy, Math.max(0.8, r * 0.38), centre);
    },
    // a sheet of paper: fill + fibres + 1px edge + dog-eared bottom-right corner
    paper(bg, edge, fib = null) {
      g.rect(0, 0, W, H, bg);
      if (fib) g.speckle(1, 1, W - 2, H - 2, fib, 0.06);
      g.frame(0, 0, W, H, edge);
      g.clear(W - 1, H - 1); g.clear(W - 2, H - 1); g.clear(W - 1, H - 2); g.px(W - 2, H - 2, edge);
    },
    tape(col = '#efe8cc') { g.rect(0, 0, 3, 2, col); g.rect(W - 3, 0, 3, 2, col); },
    chalkboard(x, y, w, h) {
      g.rect(x, y, w, h, '#2a3430');
      g.speckle(x, y, w, h, ['#323e39', '#26302c', '#3a4640'], 0.1);
    },
    honeyFrame(t = 2) {
      g.rect(0, 0, W, H, '#d89a52');
      g.speckle(0, 0, W, H, ['#c88a46', '#e4aa62'], 0.25);
      g.frame(0, 0, W, H, '#a86a36');
      return t;
    },
    rope(x, y0, y1, c = '#d8c090') { for (let y = y0; y <= y1; y++) g.px(x, y, (y & 1) ? c : '#b89a68'); },
  };
  return g;
}

// ------------------------------------------------------------------ textures
const INK = '#3a2414', CREAM = '#f0e0c0', RED = '#c8322a', NAVY = '#2a4a8a', NAVY_D = '#1e3668', DAISY = '#f6d030';
const CHALK_W = '#e8e4d8', CHALK_Y = '#f6d070', CHALK_P = '#f6a0a0', CHALK_B = '#9ad8f0', CHALK_V = '#a89af0';
const fishPal = (body, eye = '#1a1a1a') => ({ '#': body, o: eye });
const mugPal = { f: '#fff8e8', b: '#e8a028', g: '#e8e8e0' };

const POSTERS = ['wanted', 'memo', 'moose', 'hang', 'mvp', 'daisy', 'tps'];

const DEFS = {
  // ---------- posters 30x34
  'poster:wanted': [30, 34, (g) => {
    g.paper('#f0dcb0', '#b89868', ['#e4cc9c', '#f6e6c4']); g.tape();
    g.ctext('WANTED', 2, '#5a3418');
    g.hline(3, 26, 8, '#8a5a32');
    // a big drawn bluegill
    const body = '#5a8ab0', belly = '#9ac0d8';
    for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) {
      const dx = (i - 7.5) / 8, dy = (j - 4) / 4.6;
      if (dx * dx + dy * dy <= 1) g.px(5 + i, 10 + j, j > 5 ? belly : body);
    }
    for (const [i, j] of [[0, 0], [0, 1], [1, 1], [0, 7], [0, 8], [1, 7], [1, 2], [1, 6], [2, 3], [2, 4], [2, 5]]) g.px(23 - i, 10 + j, body);
    g.vline(24, 10, 11, body); g.vline(24, 17, 18, body);
    g.px(8, 13, '#1a1a1a'); g.px(9, 12, '#ffffff'); g.px(6, 15, '#c8322a'); // eye + smile
    g.vline(12, 11, 17, '#3a6a90'); g.vline(15, 12, 16, '#3a6a90'); // gill / stripes
    g.ctext('MORE', 21, '#5a3418');
    g.ctext('FISH!', 27, RED);
  }],
  'poster:memo': [30, 34, (g) => {
    g.paper('#f6f4ee', '#b8b4a8', ['#ebe8e0']); g.tape('#e8e8f0');
    g.rect(1, 1, 28, 7, '#3a5aa0');
    g.ctext('MEMO', 2, '#ffffff');
    g.ctext('MONDAY', 10, '#2a2a3a');
    g.ctext('= FISH', 16, '#2a2a3a');
    g.ctext('DAY', 22, RED);
    g.text('-BOSS', 9, 28, '#3a5aa0');
    g.px(5, 30, '#3a5aa0'); g.px(6, 29, '#3a5aa0'); g.px(7, 30, '#3a5aa0');
  }],
  'poster:moose': [30, 34, (g) => {
    g.paper('#f2c84a', '#a8782a', ['#e8b83a', '#f8d870']); g.tape();
    g.rect(1, 1, 28, 7, '#6a3a1a');
    g.ctext('MOOSE', 2, '#ffffff');
    g.ctext('EXPRESS', 9, '#6a3a1a');
    // speed lines + running moose head + parcel
    for (const y of [17, 20, 23]) g.hline(2, 5, y, '#c8902a');
    g.icon('moose', 7, 15, { a: '#e8d0a0', m: '#7a4a28', e: '#1a1010', d: '#4a2a18' });
    g.rect(21, 20, 6, 5, '#c89a5a'); g.frame(21, 20, 6, 5, '#6a4424'); g.vline(24, 20, 24, RED);
    g.text('DELIVER', 1, 27, '#6a3a1a');
    g.icon(['#.#', '.#.', '#.#'], 26, 26, { '#': RED });
  }],
  'poster:hang': [30, 34, (g) => {
    g.paper('#8ac8e8', '#4a88a8', ['#9ad4f0', '#7abcde']); g.tape();
    g.hline(1, 28, 3, '#7a4e2a'); g.hline(1, 28, 4, '#5a3418'); g.px(22, 2, '#4f9c44'); g.px(23, 2, '#4f9c44'); g.px(6, 5, '#4f9c44');
    g.icon('cat', 8, 2, { b: '#c87a2a', o: '#e8903a', e: '#1a1a1a', p: '#f0a0a0', n: '#f0e0d0', w: '#f6d8b0' });
    g.ctext('HANG IN', 21, '#ffffff', { shadow: '#2a5a7a' });
    g.ctext('THERE', 27, '#ffffff', { shadow: '#2a5a7a' });
  }],
  'poster:mvp': [30, 34, (g) => {
    g.rect(0, 0, 30, 34, '#d8a840'); g.frame(0, 0, 30, 34, '#8a6420'); g.frame(1, 1, 28, 32, '#f0c860');
    g.rect(3, 3, 24, 21, '#c8d8e8'); g.speckle(3, 3, 24, 21, ['#b8cce0'], 0.1);
    g.icon('bear', 9, 9, { b: '#8a5a32', e: '#1a1010', m: '#d8b080', n: '#2a1a10', s: '#2a3a5a', w: '#ffffff', t: RED });
    g.px(8, 6, '#ffffff'); g.px(21, 5, '#ffffff'); // sparkle
    g.rect(5, 25, 20, 7, '#f0c860'); g.frame(5, 25, 20, 7, '#8a6420');
    g.ctext('MVP', 26, '#5a3a10');
  }],
  'poster:daisy': [30, 34, (g) => {
    g.paper(NAVY, NAVY_D, ['#34549a']); g.tape('#d8d4c0');
    g.daisy(14.5, 8, 5.4, '#ffffff', '#f2a020', '#f6f2ea');
    g.ctext('DAISY', 16, DAISY);
    g.ctext('BEER', 22, CREAM);
    g.icon('mug', 8, 28, mugPal); g.text('8¢', 15, 28, DAISY);
  }],
  'poster:tps': [30, 34, (g) => {
    g.paper('#f8f8f2', '#b8b8b0', ['#eeeee8']); g.tape();
    g.ctext('TPS', 3, RED, { scale: 2 });
    g.ctext('REPORTS', 15, '#2a2a3a');
    g.ctext('DUE FRI', 21, '#2a2a3a');
    for (const y of [28, 31]) { g.frame(4, y - 1, 3, 3, '#6a6a7a'); g.hline(9, 9 + 10 + (y % 5) * 2, y, '#9a9aa8'); }
    g.px(5, 27, RED); g.px(6, 26, RED); g.px(4, 26, RED); // tick
  }],

  // ---------- bar
  'sign:daisy': [32, 16, (g) => {
    g.wood(0, 0, 32, 16, '#6a4424', '#5a3418', '#7a5030');
    g.rect(2, 2, 28, 12, NAVY); g.speckle(2, 2, 28, 12, ['#34549a'], 0.08);
    g.daisy(6, 6.5, 3.2);
    g.text('DAISY', 11, 3, DAISY, { shadow: NAVY_D });
    g.ctext('BEER', 9, CREAM, { x0: 9, w: 21 });
    g.px(1, 1, '#d8a840'); g.px(30, 1, '#d8a840'); g.px(1, 14, '#d8a840'); g.px(30, 14, '#d8a840');
  }],
  'chalk:bar': [26, 22, (g) => {
    g.honeyFrame(); g.chalkboard(2, 2, 22, 18);
    g.icon('fish', 3, 3, fishPal(CHALK_P, '#2a3430')); g.text('12¢', 12, 3, CHALK_Y);
    g.icon('trout', 3, 10, fishPal(CHALK_B, '#2a3430')); g.text('30¢', 12, 9, CHALK_Y);
    g.icon('mug', 4, 15, { f: CHALK_W, b: '#e8b840', g: CHALK_W }); g.text('8¢', 14, 15, CHALK_Y);
  }],

  // ---------- menu board (chalk A-frame)
  'chalk:menu': [24, 40, (g) => {
    g.honeyFrame(); g.chalkboard(2, 2, 20, 36);
    g.ctext('TODAY', 3, CHALK_W);
    for (let x = 4; x <= 19; x++) g.px(x, 9 + ((x >> 1) & 1), '#c8c4b8');
    g.icon('fish', 2, 12, fishPal(CHALK_P, '#2a3430')); g.text('12¢', 10, 12, CHALK_Y);
    g.icon('trout', 2, 20, fishPal(CHALK_B, '#2a3430')); g.text('30¢', 11, 19, CHALK_Y);
    g.icon('berry', 3, 26, { '#': CHALK_V, g: '#9ae0a0' }); g.text('4¢', 12, 26, CHALK_Y);
    g.icon('mug', 3, 32, { f: CHALK_W, b: '#e8b840', g: CHALK_W }); g.text('8¢', 12, 32, CHALK_Y);
    g.icon('star', 19, 26, { '#': '#c8c4b8' }); g.icon('paw', 18, 32, { '#': '#9ae0a0' });
  }],
  'chalk:menuback': [24, 40, (g) => {
    g.honeyFrame(); g.chalkboard(2, 2, 20, 36);
    g.ctext('MON', 4, CHALK_W);
    g.ctext('=', 10, CHALK_Y);
    g.ctext('FISH', 16, CHALK_P);
    g.ctext('DAY!', 22, CHALK_W);
    // a big chalk fish doodle
    for (let i = 0; i < 11; i++) { const h = Math.round(Math.sin((i / 10) * PI) * 2.6); g.px(4 + i, 32 - h, CHALK_B); g.px(4 + i, 32 + h, CHALK_B); }
    g.vline(15, 30, 34, CHALK_B); g.px(16, 29, CHALK_B); g.px(16, 35, CHALK_B); g.px(17, 28, CHALK_B); g.px(17, 36, CHALK_B); g.vline(18, 28, 36, CHALK_B);
    g.px(6, 31, CHALK_W);
  }],

  // ---------- cooler
  'logo:cooler': [24, 15, (g) => {
    g.rect(0, 0, 24, 15, NAVY); g.speckle(0, 0, 24, 15, ['#34549a'], 0.06); g.frame(0, 0, 24, 15, NAVY_D);
    g.ctext('DAISY', 2, DAISY, { shadow: NAVY_D });
    g.daisy(4, 10, 2.4); g.text('BEER', 8, 8, CREAM);
  }],
  'sticker:eh': [7, 7, (g) => {
    g.disk(3, 3, 3.3, '#d52b1e'); g.icon('leaf', 1, 1, { '#': '#ffffff' });
  }],

  // ---------- neon sign placard
  'placard:open': [48, 18, (g) => {
    g.rope(6, 0, 2, '#9aa4ac'); g.rope(41, 0, 2, '#9aa4ac');
    g.wood(0, 3, 48, 15, '#4a2e1a', '#3a2414', '#5a3a20'); g.frame(0, 3, 48, 15, '#2a1a10');
    g.ctext('OPEN 24/7*', 5, '#7a2a4a');
    g.ctext('*EXCL. NAPS', 11, CREAM);
  }],
  'placard:openglow': [48, 18, (g) => {
    const x = Math.floor((48 - textWidth('OPEN 24/7*')) / 2);
    const w = g.text('OPEN', x, 5, '#ff5ab0');
    g.text(' 24/7*', x + w + 1, 5, '#5af0ff');
  }],

  // ---------- jukebox
  'card:songs': [24, 19, (g) => {
    g.paper('#f6eed8', '#c8b48c'); g.rect(1, 1, 22, 6, '#d83a2a');
    g.ctext('HITS', 1, '#ffffff');
    g.text('A1 EH!', 2, 8, '#3a2a4a');
    g.text('B2 YAY', 1, 14, '#3a2a4a');
  }],

  // ---------- planter, bench, bbq, hammock
  'plaque:herbs': [23, 7, (g) => {
    g.wood(0, 0, 23, 7, '#c8985a', '#b8884a', '#d8a868'); g.frame(0, 0, 23, 7, '#6a4424');
    g.ctext('HERBS', 1, '#2f5a2a');
  }],
  'ad:bench': [32, 12, (g) => {
    g.rect(0, 0, 32, 12, NAVY); g.speckle(0, 0, 32, 12, ['#34549a'], 0.06); g.hline(0, 31, 0, NAVY_D); g.hline(0, 31, 11, NAVY_D);
    g.daisy(3, 5.5, 2.4); g.daisy(28, 5.5, 2.4);
    g.ctext('DAISY', 1, DAISY);
    g.ctext('BEER', 6, CREAM);
  }],
  'plaque:brass': [10, 4, (g) => {
    g.rect(0, 0, 10, 4, '#d8a840'); g.frame(0, 0, 10, 4, '#a87820');
    for (const x of [2, 3, 5, 6, 7]) g.px(x, 1, '#6a4a18');
    for (const x of [2, 4, 5]) g.px(x, 2, '#8a6420');
  }],
  'plate:bbq': [20, 7, (g) => {
    g.rect(0, 0, 20, 7, '#c8d0d8'); g.frame(0, 0, 20, 7, '#6a747c'); g.hline(1, 18, 1, '#e8eef4');
    g.icon('flame', 1, 1, { r: '#d83a2a', o: '#ff8a30', y: '#ffd040' });
    g.icon('flame', 16, 1, { r: '#d83a2a', o: '#ff8a30', y: '#ffd040' });
    g.ctext('BBQ', 1, '#a82a22');
  }],
  'label:coal': [17, 15, (g) => {
    g.rect(0, 0, 17, 15, '#c8a070'); g.speckle(0, 0, 17, 15, ['#b89060', '#d8b080'], 0.15); g.frame(0, 0, 17, 15, '#8a6a4a');
    g.rect(1, 1, 15, 7, '#2a2a2a'); g.ctext('COAL', 2, '#f0e0c0');
    g.icon('flame', 7, 9, { r: '#d83a2a', o: '#ff8a30', y: '#ffd040' });
  }],
  'label:sauce': [4, 6, (g) => {
    g.rect(0, 0, 4, 6, '#f6f2ea'); g.rect(0, 0, 4, 2, '#d83a2a');
    g.px(1, 3, '#ff8a30'); g.px(2, 3, '#d83a2a'); g.px(1, 4, '#d83a2a'); g.px(2, 4, '#ffd040');
  }],
  'tag:zzz': [7, 10, (g) => {
    g.rect(1, 2, 5, 8, '#f6eed8'); g.frame(1, 2, 5, 8, '#c8b48c');
    g.px(3, 0, '#9a6a3a'); g.px(2, 1, '#9a6a3a'); g.px(4, 1, '#9a6a3a'); g.clear(3, 3); g.px(3, 3, '#c8b48c');
    g.icon(['###', '..#', '.#.', '#..', '###'], 2, 4, { '#': '#3a5aa0' });
    g.px(5, 4, '#9a86ea');
  }],

  // ---------- table stuff
  'mat:0': [13, 10, (g) => {
    g.rect(0, 0, 13, 10, '#f2ead6'); g.frame(0, 0, 13, 10, RED);
    for (let x = 1; x < 12; x += 2) { g.px(x, 1, '#f6c0b8'); g.px(x, 8, '#f6c0b8'); }
    g.icon('fish', 3, 3, fishPal('#5a8ab0'));
  }],
  'mat:1': [13, 10, (g) => {
    for (let j = 0; j < 10; j++) for (let i = 0; i < 13; i++) g.px(i, j, (i + j) & 1 ? '#3a8a4a' : '#f2ead6');
    g.rect(1, 1, 11, 8, '#f2ead6'); g.ctext('EAT', 2, '#2a6a3a');
  }],
  'mat:2': [13, 10, (g) => {
    g.rect(0, 0, 13, 10, '#d8b870'); for (let y = 0; y < 10; y += 2) g.hline(0, 12, y, '#c8a860');
    g.frame(0, 0, 13, 10, '#a8884a');
    g.disk(6, 4.5, 3.2, '#ffffff'); g.disk(6, 4.5, 1.8, '#f0e8d8'); g.px(6, 4, '#d8905a'); g.px(7, 5, '#c87a4a');
  }],
  'mat:small': [9, 6, (g) => {
    g.rect(0, 0, 9, 6, '#8ac0e0'); g.clear(0, 0); g.clear(8, 0); g.clear(0, 5); g.clear(8, 5);
    for (let i = 1; i < 8; i += 2) { g.px(i, 0, '#ffffff'); g.px(i, 5, '#ffffff'); g.px(0, i & 4 ? 2 : 3, '#ffffff'); }
    g.rect(2, 2, 5, 2, '#d8eef8');
  }],
  'mat:long': [16, 6, (g) => {
    g.rect(0, 0, 16, 6, '#d8b870'); for (let x = 0; x < 16; x += 2) g.vline(x, 0, 5, '#c8a860'); g.frame(0, 0, 16, 6, '#a8884a');
    // fish-shaped plate
    g.icon(['.#####..#', '#######.#', '########.', '#######.#', '.#####..#'], 4, 0, { '#': '#ffffff' });
    g.px(5, 1, '#3a3a3a'); g.px(8, 2, '#d8905a'); g.px(9, 2, '#c87a4a');
  }],
  'paper:bsj': [16, 9, (g) => {
    g.rect(0, 0, 16, 9, '#e8e4d8'); g.frame(0, 0, 16, 9, '#b8b4a8');
    g.text('BSJ', 1, 1, '#1a1a1a');
    g.px(12, 5, '#3a8a4a'); g.px(13, 4, '#3a8a4a'); g.px(14, 2, '#3a8a4a'); g.px(14, 3, '#3a8a4a'); g.px(13, 2, '#3a8a4a'); // stonks
    g.hline(1, 14, 7, '#8a8a8a');
  }],
  'tent:menu': [6, 6, (g) => {
    g.rect(0, 0, 6, 6, '#ffffff'); g.rect(0, 0, 6, 2, RED);
    g.px(1, 3, '#5a8ab0'); g.px(2, 3, '#5a8ab0'); g.px(4, 3, '#d8a840'); g.hline(1, 4, 4, '#a8a8a8');
  }],
  'plate:fish': [9, 5, (g) => {
    g.icon(['.#####..#', '#######.#', '########.', '#######.#', '.#####..#'], 0, 0, { '#': '#6ab0d8' });
    g.icon(['.....', '.####', '#####', '.####'], 1, 1, { '#': '#a8dcf0' });
    g.px(1, 1, '#3a3a3a'); g.px(4, 2, '#d8905a'); g.px(5, 2, '#c87a4a'); g.px(3, 3, '#60a040');
  }],
  napkin: [5, 5, (g) => { g.rect(0, 0, 5, 5, '#f6f4f0'); g.hline(0, 4, 2, '#e0dcd4'); g.px(4, 0, '#e8344a'); }],

  // ---------- hangout
  'sign:notps': [24, 30, (g) => {
    g.rect(11, 15, 2, 15, '#7a4e2a'); g.vline(12, 15, 29, '#5a3418');
    g.wood(0, 0, 24, 15, '#b48452', '#9a6a40', '#c49460'); g.frame(0, 0, 24, 15, '#5a3418');
    g.px(1, 1, '#2a2a2e'); g.px(22, 1, '#2a2a2e'); g.px(1, 13, '#2a2a2e'); g.px(22, 13, '#2a2a2e');
    g.ctext('NO TPS', 2, RED);
    g.ctext('TALK!', 8, INK);
  }],

  // ---------- mailbox
  'plank:reynard': [32, 10, (g) => {
    g.wood(0, 0, 32, 10, '#d0a066', '#b88a50', '#e0b478'); g.frame(0, 0, 32, 10, '#6a4424');
    g.ctext('REYNARD', 2, INK);
    g.px(1, 4, '#3a3a40'); g.px(30, 4, '#3a3a40');
  }],
  'sticker:ebuy': [17, 8, (g) => {
    g.rect(0, 0, 17, 8, '#ffffff'); g.frame(0, 0, 17, 8, '#b8b8c0'); g.clear(0, 0); g.clear(16, 0); g.clear(0, 7); g.clear(16, 7);
    let x = 1;
    for (const [ch, c] of [['e', '#e0383e'], ['B', '#1a64c8'], ['U', '#f0a810'], ['Y', '#7ab020']]) x += g.text(ch, x, 1, c) + 1;
    g.hline(2, 14, 6, '#d8d8e0');
  }],

  // ---------- birdhouse numbers
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`num:${n}`, [5, 7, (g) => {
    g.rect(0, 0, 5, 7, '#d8a840'); g.clear(0, 0); g.clear(4, 0); g.clear(0, 6); g.clear(4, 6);
    g.text(String(n), 1, 1, '#4a2e10');
  }]])),

  // ---------- incubator
  'label:hot': [13, 12, (g) => {
    g.rect(0, 0, 13, 12, '#f2c230'); g.frame(0, 0, 13, 12, '#1a1a1a');
    for (let j = 0; j < 5; j++) { g.px(6 - j, 1 + j, '#1a1a1a'); g.px(6 + j, 1 + j, '#1a1a1a'); }
    g.hline(2, 10, 5, '#1a1a1a'); g.vline(6, 2, 3, '#1a1a1a');
    g.ctext('HOT', 6, '#1a1a1a');
  }],
  'lcd:temp': [12, 7, (g) => {
    g.rect(0, 0, 12, 7, '#1a2420'); g.frame(0, 0, 12, 7, '#6a747c');
    g.text('37°', 1, 1, '#7cff9a');
  }],
  'chart:eggs': [12, 12, (g) => {
    g.paper('#f8f8f2', '#b8b8b0');
    g.vline(2, 2, 9, '#3a3a4a'); g.hline(2, 9, 9, '#3a3a4a');
    const pts = [[3, 8], [4, 7], [5, 8], [6, 6], [7, 5], [8, 3]];
    for (const [x, y] of pts) g.px(x, y, '#3aa04a');
    g.px(9, 2, '#3aa04a'); g.px(8, 2, '#3aa04a'); g.px(9, 3, '#3aa04a');
    g.px(5, 3, '#e8c870'); g.px(5, 2, '#f6eee0'); // egg
  }],

  // ---------- feeder
  'label:chow': [20, 13, (g) => {
    g.rect(0, 0, 20, 13, '#f0e0b8'); g.frame(0, 0, 20, 13, RED);
    g.ctext('FISH', 1, RED);
    g.ctext('CHOW', 7, INK);
  }],
  'label:moose': [24, 13, (g) => {
    g.rect(0, 0, 24, 13, '#d8b070'); g.frame(0, 0, 24, 13, '#6a4424');
    g.ctext('MOOSE', 1, INK);
    for (let x = 2; x <= 12; x++) if ((x * 7) % 5 < 3) g.vline(x, 7, 11, '#1a1a1a');
    g.icon(['.#.', '###', '.#.', '.#.'], 15, 7, { '#': RED }); g.icon(['.#.', '###', '.#.', '.#.'], 19, 7, { '#': RED });
  }],

  // ---------- lodge
  'sign:lodge': [42, 26, (g) => {
    g.wood(0, 0, 42, 14, '#9a6a40', '#7a5030', '#aa7a4a'); g.frame(0, 0, 42, 14, '#4a2e1a');
    g.px(1, 1, '#2a2a2e'); g.px(40, 1, '#2a2a2e');
    g.ctext('BUCKTOOTH', 2, CREAM, { shadow: '#4a2e1a' });
    g.ctext('BROS.', 8, '#f2c230', { shadow: '#4a2e1a' });
    g.rope(8, 14, 16); g.rope(33, 14, 16);
    g.rect(0, 17, 42, 9, '#f0ece0'); g.frame(0, 17, 42, 9, RED);
    g.ctext('NO VACANCY', 19, RED);
  }],

  // ---------- statues, hotels, crates, arches
  ...Object.fromEntries(['GERALD', 'BRUCE', 'DOUG', 'MAUDE'].map((n) => [`plaque:${n}`, [27, 7, (g) => {
    g.rect(0, 0, 27, 7, '#e0b040'); g.frame(0, 0, 27, 7, '#8a6420'); g.hline(1, 25, 1, '#f0d070');
    g.ctext(n, 1, '#4a2e10');
  }]])),
  'plaque:hotel': [22, 9, (g) => {
    g.rect(0, 0, 22, 9, '#4a2e1a'); g.frame(0, 0, 22, 9, '#d8a840');
    g.ctext('HOTEL', 1, '#f2c230');
    for (const x of [5, 8, 11, 14, 17]) g.px(x, 7, '#f2c230');
  }],
  'stencil:bugs': [16, 8, (g) => {
    g.ctext('BUGS', 1, '#2a2a2e');
    g.hline(1, 14, 7, '#2a2a2e');
  }],
  'sign:photo': [20, 16, (g) => {
    g.rope(4, 0, 2, '#5a8a34'); g.rope(15, 0, 2, '#5a8a34');
    g.rect(0, 3, 20, 13, '#f6f2ea'); g.frame(0, 3, 20, 13, '#c8c2b2');
    g.ctext('PHOTO', 4, '#d02a3a');
    g.ctext('SPOT', 10, '#2f7034');
    g.px(1, 4, '#e8344a'); g.px(18, 14, '#f06a8a');
  }],

  // ---------- hut
  'hang:fish': [24, 18, (g) => {
    g.rope(4, 0, 2); g.rope(19, 0, 2);
    g.wood(0, 3, 24, 15, '#c49060', '#a8784a', '#d4a070'); g.frame(0, 3, 24, 15, '#5a3a20');
    g.ctext('FISH', 5, RED, { shadow: '#8a5a32' });
    g.ctext('4 SALE', 11, INK);
  }],
  'hang:ebuy': [24, 18, (g) => {
    g.rope(4, 0, 2, '#9aa4ac'); g.rope(19, 0, 2, '#9aa4ac');
    g.rect(0, 3, 24, 15, '#ffffff'); g.frame(0, 3, 24, 15, '#8a8a96');
    let x = Math.floor((24 - textWidth('eBUY')) / 2);
    for (const [ch, c] of [['e', '#e0383e'], ['B', '#1a64c8'], ['U', '#f0a810'], ['Y', '#7ab020']]) x += g.text(ch, x, 5, c) + 1;
    for (let i = 0; i < 5; i++) g.icon('star', 3 + i * 4, 12, { '#': '#f2b020' });
  }],
  'mat:refunds': [30, 14, (g) => {
    g.rect(0, 0, 30, 14, '#8a3a2a'); g.speckle(0, 0, 30, 14, ['#7a3222', '#9a4a32'], 0.25); g.frame(0, 0, 30, 14, '#5a2018');
    for (let x = 1; x < 30; x += 2) { g.px(x, 0, '#c8a070'); g.px(x, 13, '#c8a070'); }
    g.ctext('NO', 2, CREAM);
    g.ctext('REFUNDS', 8, CREAM);
  }],
  'sign:keepout': [18, 16, (g) => {
    g.rect(0, 0, 18, 16, '#f2c230'); g.frame(0, 0, 18, 16, '#1a1a1a');
    g.ctext('KEEP', 2, '#1a1a1a');
    g.ctext('OUT!', 8, RED);
    for (let x = 1; x < 17; x++) { g.px(x, 14, (x >> 1) & 1 ? '#1a1a1a' : '#f2c230'); }
  }],
  'memo:tps': [16, 20, (g) => {
    g.paper('#f8f8f2', '#b8b8b0', ['#eeeee8']); g.tape();
    g.ctext('TPS', 2, RED);
    g.ctext('DUE', 8, '#2a2a3a');
    g.ctext('FRI!', 14, '#2a2a3a');
  }],
};
for (const p of POSTERS) if (!DEFS[`poster:${p}`]) throw new Error('missing poster ' + p);

// ------------------------------------------------------------------ caches
const texCache = new Map();
const matCache = new Map();
const geoCache = new Map();
const hasDOM = typeof document !== 'undefined';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 1;
  return t;
}

function texInfo(key) {
  let t = texCache.get(key);
  if (t) return t;
  const def = DEFS[key];
  if (!def) throw new Error('unknown decal ' + key);
  const [w, h, draw] = def;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  let seed = 7;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  draw(painter(ctx, w, h, seed));
  t = { key, w, h, canvas, tex: canvasTex(canvas) };
  texCache.set(key, t);
  return t;
}

// plain wooden back for a free-standing sign: the front's silhouette, mirrored
function backInfo(key) {
  const bk = key + '#back';
  let t = texCache.get(bk);
  if (t) return t;
  const f = texInfo(key);
  const canvas = makeCanvas(f.w, f.h);
  const src = f.canvas.getContext('2d').getImageData(0, 0, f.w, f.h).data;
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(f.w * 131 + f.h);
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++) {
      const i = (y * f.w + (f.w - 1 - x)) * 4;
      if (src[i + 3] < 128) continue;
      const r = src[i], gg = src[i + 1], b = src[i + 2];
      const keep = Math.abs(r - 0xd8) + Math.abs(gg - 0xc0) + Math.abs(b - 0x90) < 40 || (r < 0x80 && gg < 0x60 && b < 0x40); // ropes / posts
      ctx.fillStyle = keep ? `rgb(${r},${gg},${b})` : rnd() < 0.12 ? '#5a3a20' : y % 5 === 0 ? '#6a4424' : '#7a5030';
      ctx.fillRect(x, y, 1, 1);
    }
  t = { key: bk, w: f.w, h: f.h, canvas, tex: canvasTex(canvas) };
  texCache.set(bk, t);
  return t;
}

function material(info, glow) {
  const mk = info.key + (glow ? '|g' : '|l');
  let m = matCache.get(mk);
  if (m) return m;
  const o = { map: info.tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 };
  m = glow ? new THREE.MeshBasicMaterial(o) : new THREE.MeshLambertMaterial({ ...o, color: 0xf2f2f2 });
  m.name = 'decal:' + mk;
  matCache.set(mk, m);
  return m;
}

function planeGeo(w, h) {
  const k = `${w.toFixed(4)}x${h.toFixed(4)}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); geoCache.set(k, g); }
  return g;
}

const _m4 = new THREE.Matrix4(), _n = new THREE.Vector3(), _o = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function orient(mesh, n, rotZ = 0) {
  if (Math.abs(n[1]) > 0.999) { mesh.rotation.set(n[1] > 0 ? -PI / 2 : PI / 2, 0, rotZ); return; }
  _n.set(n[0], n[1], n[2]).normalize();
  _m4.lookAt(_n, _o, _up);
  mesh.quaternion.setFromRotationMatrix(_m4);
  if (rotZ) mesh.rotateZ(rotZ);
}

/**
 * Add one decal plane.
 * @param {THREE.Group} group
 * @param {string} key texture key in DEFS
 * @param {number} D texels per world unit
 * @param {number[]} pos plane centre (local space)
 * @param {object} [o] n: facing normal (default +z) | rotZ: in-plane turn | glow: unlit |
 *                     stand: add a mirrored wooden back + cast shadows | back: custom back key
 */
function put(group, key, D, pos, o = {}) {
  const info = texInfo(key);
  const w = info.w / D, h = info.h / D;
  const n = o.n || [0, 0, 1];
  const m = new THREE.Mesh(planeGeo(w, h), material(info, o.glow));
  m.position.set(pos[0], pos[1], pos[2]);
  orient(m, n, o.rotZ || 0);
  m.receiveShadow = !o.glow;
  m.castShadow = !!o.stand;
  m.userData.tintable = false;
  m.userData.decal = key;
  m.name = 'decal:' + key;
  group.add(m);
  if (o.stand) {
    const bi = o.back ? texInfo(o.back) : backInfo(key);
    const b = new THREE.Mesh(planeGeo(w, h), material(bi, false));
    const t = 0.012;
    b.position.set(pos[0] - n[0] * t, pos[1] - n[1] * t, pos[2] - n[2] * t);
    orient(b, [-n[0], -n[1], -n[2]], -(o.rotZ || 0));
    b.receiveShadow = true; b.castShadow = true; b.userData.tintable = false; b.userData.decal = key + '#back';
    group.add(b);
  }
  return m;
}

// a little tent card standing on a table top (surface y = ys)
function tent(group, key, D, x, ys, z, lean = 0.3) {
  const info = texInfo(key);
  const h = info.h / D;
  const s = Math.sin(lean), c = Math.cos(lean);
  put(group, key, D, [x, ys + (h / 2) * c, z + (h / 2) * s], { n: [0, s, c] });
  put(group, key, D, [x, ys + (h / 2) * c, z - (h / 2) * s], { n: [0, s, -c] });
}

// voxel helpers (pivot [0.5, 0, 0.5], scale 0.1): voxel i spans (i-0.5..i+0.5)*0.1
const fP = (i) => (i + 0.5) * 0.1 + EPS; // just outside the + face of voxel i
const fN = (i) => (i - 0.5) * 0.1 - EPS; // just outside the - face of voxel i
const UP = [0, 1, 0];
const top = (j) => (j + 1) * 0.1 + 0.003; // just above the top of voxel layer j

// ------------------------------------------------------------------ per type
const BUILD = {
  bar(g, seed) {
    // tin "DAISY BEER" sign over the back shelf (covers the voxel sign + its logo)
    put(g, 'sign:daisy', 32, [-0.15, 1.95, fP(-4)]);
    // chalk price list on the right bay
    put(g, 'chalk:bar', 32.5, [0.85, 1.95, fP(-4)]);
    // two posters on the counter front, either side of the painted daisy
    const a = seed % POSTERS.length, b = (a + 2 + (seed >> 3) % (POSTERS.length - 2)) % POSTERS.length;
    put(g, `poster:${POSTERS[a]}`, 38, [-0.84, 0.5, fP(0)]);
    put(g, `poster:${POSTERS[b === a ? (a + 1) % POSTERS.length : b]}`, 38, [0.71, 0.5, fP(0)]);
    // and two more on the back of the shelf unit (seen when the camera swings round)
    put(g, `poster:${POSTERS[(a + 4) % POSTERS.length]}`, 36, [0.75, 0.75, fN(-5)], { n: [0, 0, -1] });
    put(g, `poster:${POSTERS[(a + 5) % POSTERS.length]}`, 36, [-0.6, 0.75, fN(-5)], { n: [0, 0, -1] });
  },
  menuboard(g) {
    // the A-frame's front-most voxels step from z = 1 (rows 0-3) to z = 0 (rows 4-12, incl. the
    // hinge block), the back from z = -3 (rows 0-2) to z = -2: lean each plane just outside both steps
    const a = Math.atan(0.1 / 0.9), b = Math.atan(0.1);
    put(g, 'chalk:menu', 40, [-0.05, 0.8, 0.155 + EPS - 0.4 / 9], { n: [0, Math.sin(a), Math.cos(a)] });
    put(g, 'chalk:menuback', 40, [-0.05, 0.8, -0.355 - EPS + 0.05], { n: [0, Math.sin(b), -Math.cos(b)] });
  },
  cooler(g) {
    put(g, 'logo:cooler', 40, [-0.05, 0.39, fP(2)]);
    put(g, 'sticker:eh', 40, [0.22, top(7), 0.13], { n: UP });
  },
  neonsign(g) {
    const y = 1.2 - 18 / 32 / 2 - 0.04;
    put(g, 'placard:open', 32, [-0.05, y, -0.12], { stand: true });
    put(g, 'placard:openglow', 32, [-0.05, y, -0.12 + 0.003], { glow: true });
  },
  jukebox(g) { put(g, 'card:songs', 40, [-0.05, 0.43 + 19 / 80, fP(2)]); },
  planterbox(g) { put(g, 'plaque:herbs', 46, [-0.19, 0.2, fP(1)]); },
  bench(g) {
    put(g, 'ad:bench', 40, [-0.05, 0.85, fP(-2)]);
    put(g, 'plaque:brass', 40, [-0.05, 0.43, fP(1)]);
  },
  bbq(g) {
    put(g, 'plate:bbq', 40, [-0.1, 0.7, fP(2)]);
    put(g, 'label:coal', 56, [-0.2, 0.45, fP(0)]);
    put(g, 'label:sauce', 40, [fP(4), 0.9, -0.1], { n: [1, 0, 0] });
  },
  hammock(g) { put(g, 'tag:zzz', 40, [-0.5, 0.66, fP(-1)]); },
  hangout(g) { put(g, 'sign:notps', 40, [-0.76, 0.375, -0.6], { stand: true }); },
  picnictable(g, seed) {
    put(g, `mat:${seed % 3}`, 32, [-0.6, top(7), -0.07], { n: UP });
    put(g, `mat:${(seed + 1) % 3}`, 32, [0.5, top(7), -0.05], { n: UP });
    put(g, 'paper:bsj', 32, [-0.02, top(4), 0.35], { n: UP });
  },
  roundtable(g) {
    put(g, 'mat:small', 40, [-0.2, top(7), 0.01], { n: UP });
    put(g, 'mat:small', 40, [0.1, top(7), 0.01], { n: UP });
    tent(g, 'tent:menu', 40, 0.15, top(7) - 0.003, -0.2);
  },
  umbrellatable(g) {
    put(g, 'mat:long', 32, [-0.05, top(7), 0.14], { n: UP });
    put(g, 'mat:long', 32, [-0.05, top(7), -0.24], { n: UP, rotZ: PI });
  },
  picnic(g) {
    put(g, 'plate:fish', 40, [-0.25, top(4), -0.1], { n: UP });
    put(g, 'napkin', 40, [0.24, top(4), 0.06], { n: UP });
  },
  mailbox(g) {
    put(g, 'plank:reynard', 40, [-0.05, 0.3, fP(-1)]);
    put(g, 'sticker:ebuy', 48, [fN(-2), 0.895, -0.262], { n: [-1, 0, 0] });
  },
  birdhouse(g, seed) { put(g, `num:${(seed % 9) + 1}`, 40, [-0.16, 1.5, fP(2)]); },
  hatchery(g) {
    put(g, 'label:hot', 46, [-0.3, 0.3, fP(2)]);
    put(g, 'lcd:temp', 44, [0.185, 0.2, fP(2)]);
    put(g, 'chart:eggs', 40, [fP(3), 0.3, -0.05], { n: [1, 0, 0] });
  },
  feeder(g) {
    put(g, 'label:chow', 40, [-0.05, 1.2, fP(2)]);
    put(g, 'label:moose', 40, [-0.05, 1.2, fN(-3)], { n: [0, 0, -1] });
  },
  lodge(g, seed, depth = 9) {
    // planted against the dome on the land-facing (+z) side, just above the water
    const yc = (depth - 2) * 0.1 + 0.05, R = 0.9, RZ = 0.65;
    const surf = (y) => RZ * Math.sqrt(Math.max(0, 1 - ((y - yc) / R) ** 2)) + 0.05;
    const L = 26 / 40, yb = depth * 0.1 + 0.13; // land beside the lodge is ~0.1 above the water
    let yt = yb + L, zb = 0, zt = 0;
    for (let k = 0; k < 3; k++) { zb = surf(yb) + 0.08; zt = surf(yt) + 0.08; yt = yb + L * Math.cos(Math.atan2(zb - zt, yt - yb)); }
    const th = Math.atan2(zb - zt, yt - yb);
    put(g, 'sign:lodge', 40, [0, (yb + yt) / 2, (zb + zt) / 2], { n: [0, Math.sin(th), Math.cos(th)] });
  },
  moose(g, seed) { put(g, `plaque:${['GERALD', 'BRUCE', 'DOUG', 'MAUDE'][seed % 4]}`, 40, [-0.05, 0.1, fP(4)]); },
  bughotel(g) { put(g, 'plaque:hotel', 40, [-0.05, 1.2 + 9 / 80, fP(2)]); },
  buglamp(g) { put(g, 'stencil:bugs', 53, [-0.3, 0.1, fP(3)]); },
  arch(g) { put(g, 'sign:photo', 40, [-0.05, 1.55 - 0.2, 0.19], { stand: true }); }, // hangs in front of the vines
};
BUILD.beercooler = BUILD.cooler;

export const DECAL_TYPES = Object.keys(BUILD);

/**
 * Decals for one structure type, in the local space of the group
 * StructureSystem.makeObject() returns (before its rotation).
 * @param {string} type structure type (or restaurant model name, e.g. 'cooler')
 * @param {{ seed?: number, depth?: number }} [o]
 * @returns {THREE.Group | null}
 */
export function decalsFor(type, { seed = 0, depth } = {}) {
  const fn = BUILD[type];
  if (!fn || !hasDOM) return null;
  const g = new THREE.Group();
  g.name = 'decals';
  g.userData.decals = true;
  fn(g, Math.abs(seed | 0), depth);
  return g.children.length ? g : null;
}

/**
 * Posters, hanging signs and a doormat for Reynard's hut, in the hut model's
 * local space (voxel x spans x*0.1..(x+1)*0.1, no pivot, scale 0.1).
 * Add to the hut group in World.buildLandmarks(): `hg.add(hutDecals())`.
 */
export function hutDecals() {
  const g = new THREE.Group();
  g.name = 'hutDecals';
  if (!hasDOM) return g;
  // west wall (x0 = 2, outer face x = 0.2), seen from -x
  put(g, 'poster:wanted', 40, [0.2 - EPS, 0.86, 0.8], { n: [-1, 0, 0] });
  put(g, 'poster:moose', 40, [0.2 - EPS, 0.86, 1.6], { n: [-1, 0, 0] });
  // east wall (x1 = 27, outer face x = 2.8), either side of the lab window
  put(g, 'sign:keepout', 40, [2.8 + EPS, 0.9, 1.76], { n: [1, 0, 0] });
  put(g, 'memo:tps', 40, [2.8 + EPS, 0.86, 0.55], { n: [1, 0, 0] });
  // hanging from the porch roof's front edge (roof slab bottom y = 1.3, front z = 3.0)
  put(g, 'hang:fish', 40, [0.8, 1.3 - 18 / 80, 2.95], { stand: true });
  put(g, 'hang:ebuy', 40, [2.15, 1.3 - 18 / 80, 2.95], { stand: true });
  // doormat on the porch deck in front of the door (deck top y = 0.2)
  put(g, 'mat:refunds', 40, [1.45, 0.203, 2.3], { n: UP });
  return g;
}

// for previews / debugging: every texture key
export const DECAL_TEXTURES = Object.keys(DEFS);
export function decalCanvas(key) { return texInfo(key).canvas; }
