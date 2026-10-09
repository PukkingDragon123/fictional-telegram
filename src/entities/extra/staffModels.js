// [v26 staff] Models for the beaver staff buildings (STRUCTURE_MODELS via
// src/entities/extra/*.js) + the rescue stretcher.
//   st_tent    Interview Tent (2x2): striped canvas tent, NOW HIRING sign, a desk with a bell
//   st_poster  Help Wanted Poster (1x1): a post with a paper poster
//   st_burrow  Beaver Burrow (1x1): a grassy mound with a round door and a chimney pipe
//   st_bunk    Bunkhouse (2x1): a long log bunkhouse with a stovepipe
//   st_cabin   Cozy Cabin (2x2): a log cabin with a porch, chimney and flower boxes
//   makeStretcher() -> THREE.Group (centre at the poles, along X, ~1 unit long)
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';
import { defineModels, P, tone, toneOf, text, textW, tufts, ftufts, sparkle, log, rbox, ball } from './facilityModels.js';

const { WOOD, WOOD_D, WOOD_M, WOOD_L, BARK, STONE, MOSS, LEAF, GRASS, RED, RED_D, WHITE, CREAM, PAPER, IRON, BRASS, INK, WARM, FLOWERS } = P;
const CANVAS = [0xf2e6c8, 0xe8dab8, 0xf8eed4];
const STRIPE = [0xd8453b, 0xc23a32, 0xe85a4a];
const DIRT = [0x8a6a44, 0x7a5c3a, 0x96764c];
const ROOF = [[0x5a7a4a, 0x4a6a3e, 0x6a8a56], [0xa84a32, 0x983e2a, 0xb85a40], [0x4a5a7a, 0x3e4e6a, 0x5a6a8a]];

// ---------------------------------------------------------------- Interview Tent (2x2)
function st_tent(d, rnd, variant) {
  const { c, f, gf } = d;
  // plank deck
  c.box(-9, 0, -8, 8, 0, 7, (x, y, z) => ((z + 20) % 3 === 0 ? WOOD_D : toneOf(WOOD, x, 0, z, 3)));
  const st = [STRIPE, [[0x3c88d8, 0x2c70c0, 0x5aa0e8]][0], [[0x46963c, 0x3a7e32, 0x5aa850]][0]][variant];
  // canvas walls + peaked roof (ridge along x)
  for (let y = 1; y <= 13; y++) {
    const hz = y <= 6 ? 7 : Math.max(0, 7 - Math.round((y - 6) * 1.05));
    for (let x = -8; x <= 7; x++) for (let z = -hz; z <= hz; z++) {
      const edge = Math.abs(z) === hz || x === -8 || x === 7;
      if (!edge) continue;
      if (z === hz && y <= 7 && x >= -4 && x <= 3) continue; // the doorway
      const roof = y > 6 && Math.abs(z) === hz;
      const col = (x + 40) % 4 < 2 ? toneOf(st, x, y, z) : toneOf(CANVAS, x, y, z);
      c.set(x, y, z, roof ? col : y === 1 ? toneOf(CANVAS, x, y, z, 2) : col);
    }
  }
  // flaps tied back + poles + scalloped valance
  for (let y = 1; y <= 7; y++) { c.set(-5, y, 8, toneOf(CANVAS, 0, y, 8)); c.set(4, y, 8, toneOf(CANVAS, 1, y, 8)); }
  for (const x of [-9, 8]) for (let y = 1; y <= 14; y++) c.set(x, y, 0, WOOD_D);
  for (let x = -8; x <= 7; x++) c.set(x, 7, 8, x % 2 ? st[0] : st[1]);
  // NOW HIRING board over the door (fine)
  const msg = 'NOW HIRING';
  const tw = textW(msg);
  const x0 = -Math.ceil(tw / 2) - 2;
  f.box(x0, 17, 17, x0 + tw + 3, 25, 17, (x, y) => (x === x0 || x === x0 + tw + 3 || y === 17 || y === 25 ? WOOD_D : PAPER));
  text(f, msg, x0 + 2, 23, 18, RED_D);
  // inside: a little desk with a stack of resumes and a bell
  c.box(-6, 1, -5, -1, 3, -3, (x, y) => (y === 3 ? WOOD_L : WOOD_M));
  f.box(-9, 8, -8, -6, 8, -7, PAPER); f.box(-9, 9, -8, -6, 9, -7, CREAM);
  f.box(-4, 8, -8, -3, 9, -7, BRASS);
  // a bench for the line outside + a lantern
  c.box(9, 1, 8, 9, 1, 9, WOOD_D);
  f.box(-19, 15, 15, -17, 18, 16, (x, y) => (y === 15 || y === 18 ? IRON : 0xffe6a0));
  gf.set(-18, 16, 16, WARM); gf.set(-18, 17, 16, 0xfff0b0);
  sparkle(d, -18, 19, 16, { period: 3.4 });
  tufts(c, rnd, 8, { w: 2, d: 2 }, (x, z) => x >= -10 && x <= 9 && z >= -9 && z <= 8);
}

// ---------------------------------------------------------------- Help Wanted Poster (1x1)
function st_poster(d, rnd, variant) {
  const { c, f } = d;
  for (let y = 0; y <= 13; y++) for (const [x, z] of [[-1, 0], [0, 0]]) c.set(x, y, z, y > 11 ? WOOD_D : toneOf(BARK, x, y, z));
  // the poster (fine), pinned to the front of the post
  const px0 = -10, px1 = 9, py0 = 12, py1 = 27, pz = 2;
  f.box(px0, py0, pz, px1, py1, pz, (x, y) => ((x * 3 + y) % 7 === 0 ? 0xeee0c0 : PAPER));
  text(f, 'NOW', -5, py1 - 1, pz + 1, RED_D);
  text(f, 'HIRING', -9, py1 - 7, pz + 1, INK);
  // a beaver head doodle
  const B = 0x8a5530;
  for (const [x, y] of [[-2, 14], [-1, 14], [0, 14], [1, 14], [-3, 15], [2, 15], [-3, 16], [2, 16], [-2, 17], [1, 17], [-2, 13], [1, 13]]) f.set(x, y, pz + 1, B);
  f.set(-1, 15, pz + 1, INK); f.set(0, 15, pz + 1, INK); f.set(-1, 13, pz + 1, 0xffffff); f.set(0, 13, pz + 1, 0xffffff);
  for (const [x, y] of [[px0 + 1, py1 - 1], [px1 - 1, py1 - 1]]) f.set(x, y, pz + 1, [RED, 0x3c88d8, 0x46963c][variant]);
  // tear-off tabs at the bottom
  for (let x = px0 + 1; x <= px1 - 1; x += 2) f.box(x, py0 - 3, pz, x, py0 - 1, pz, CREAM);
  ftufts(f, rnd, 10);
}

// ---------------------------------------------------------------- Beaver Burrow (1x1)
function st_burrow(d, rnd, variant) {
  const { c, f, gf } = d;
  ball(c, 0, -2, -1, 6.4, (x, y, z, dx, dy, dz) => (y < 0 ? null : dy > 3.6 ? toneOf(GRASS, x, y, z) : toneOf(DIRT, x, y, z, 1)));
  // round wooden door + frame stones
  for (let x = -3; x <= 2; x++) for (let y = 0; y <= 5; y++) {
    const r = Math.hypot(x + 0.5, Math.max(0, y - 2));
    if (r > 3.1) continue;
    c.set(x, y, 5, r > 2.4 ? toneOf(STONE, x, y, 5) : (x + 20) % 2 ? WOOD_M : WOOD);
    c.set(x, y, 4, r > 2.4 ? toneOf(STONE, x, y, 4) : WOOD_D);
  }
  f.set(2, 5, 12, BRASS);
  // a little round window glowing at night + a stovepipe
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) { c.set(x, y, 3, IRON); }
  gf.set(9, 9, 8, WARM); gf.set(10, 9, 8, WARM); gf.set(9, 10, 8, WARM); gf.set(10, 10, 8, 0xfff0b0);
  for (let y = 3; y <= 8; y++) c.set(-3, y, -2, y === 8 ? IRON : 0x6a6a72);
  // flowers on the roof
  for (let i = 0; i < 6; i++) { const x = Math.floor(rnd() * 8) - 4, z = Math.floor(rnd() * 6) - 4; for (let y = 6; y >= 0; y--) if (c.has(x, y, z)) { c.set(x, y + 1, z, FLOWERS[(i + variant) % FLOWERS.length]); break; } }
  tufts(c, rnd, 5);
}

// ---------------------------------------------------------------- shared log cabin bits
function logWalls(c, x0, x1, z0, z1, h, door, rnd) {
  for (let y = 1; y <= h; y++) {
    for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) {
      if (z === z1 && door && x >= door[0] && x <= door[1] && y <= door[2]) continue;
      c.set(x, y, z, (y % 2) ? toneOf(BARK, x, y, z) : toneOf(WOOD, x, y, z, 1));
    }
    for (let z = z0; z <= z1; z++) for (const x of [x0, x1]) c.set(x, y, z, (y % 2) ? toneOf(WOOD, x, y, z, 2) : toneOf(BARK, x, y, z));
    // log ends poking out at the corners
    for (const [x, z] of [[x0 - 1, z0], [x1 + 1, z0], [x0 - 1, z1], [x1 + 1, z1]]) if (y % 2) c.set(x, y, z, 0xd8a868);
  }
  void rnd;
}
function gableRoof(c, x0, x1, z0, z1, y0, roof) {
  const half = Math.ceil((z1 - z0 + 3) / 2);
  for (let k = 0; k <= half; k++) {
    const y = y0 + k;
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      c.set(x, y, z0 - 1 + k, toneOf(roof, x, y, z0 + k));
      c.set(x, y, z1 + 1 - k, toneOf(roof, x, y, z1 - k));
    }
    for (let z = z0 + k; z <= z1 - k; z++) for (const x of [x0, x1]) c.set(x, y, z, toneOf(WOOD, x, y, z, 3));
  }
}
function windowAt(c, gf, x, y, z, glowZ) {
  c.box(x - 1, y - 1, z, x + 1, y + 1, z, WOOD_D);
  c.set(x, y, z, 0x9ad0e8);
  gf.set(x * 2, y * 2, glowZ, WARM); gf.set(x * 2 + 1, y * 2, glowZ, WARM); gf.set(x * 2, y * 2 + 1, glowZ, 0xfff0b0); gf.set(x * 2 + 1, y * 2 + 1, glowZ, WARM);
}

// ---------------------------------------------------------------- Bunkhouse (2x1)
function st_bunk(d, rnd, variant) {
  const { c, f, gf } = d;
  c.box(-10, 0, -5, 9, 0, 4, (x, y, z) => toneOf(STONE, x, 0, z));
  logWalls(c, -9, 8, -4, 3, 7, [-1, 0, 5], rnd);
  gableRoof(c, -9, 8, -4, 3, 8, ROOF[variant]);
  windowAt(c, gf, -5, 4, 4, 9); windowAt(c, gf, 5, 4, 4, 9);
  c.box(-1, 1, 3, 0, 5, 3, (x, y) => (y === 5 ? WOOD_D : WOOD_M));
  // stovepipe + sign
  for (let y = 9; y <= 15; y++) c.set(6, y, -1, y === 15 ? IRON : 0x6a6a72);
  const tw = textW('BUNKS');
  f.box(-Math.ceil(tw / 2) - 2, 12, 9, Math.floor(tw / 2) + 2, 18, 9, (x, y) => (y === 12 || y === 18 ? WOOD_D : WOOD_L));
  text(f, 'BUNKS', -Math.ceil(tw / 2), 16, 10, INK);
  // a laundry line with a towel
  for (let x = 10; x <= 19; x++) f.set(x, 18, 12, 0xd8c090);
  f.box(13, 14, 12, 15, 17, 12, STRIPE[0]);
  tufts(c, rnd, 6, { w: 2, d: 1 }, (x, z) => z >= -5 && z <= 4 && x >= -10 && x <= 9);
}

// ---------------------------------------------------------------- Cozy Cabin (2x2)
function st_cabin(d, rnd, variant) {
  const { c, f, gf } = d;
  c.box(-10, 0, -10, 9, 0, 9, (x, y, z) => (z >= 4 ? ((x + 20) % 2 ? WOOD : WOOD_L) : toneOf(GRASS, x, 0, z)));
  logWalls(c, -8, 7, -8, 3, 8, [-1, 0, 6], rnd);
  gableRoof(c, -8, 7, -8, 3, 9, ROOF[(variant + 1) % 3]);
  // porch roof on posts
  for (const x of [-8, 7]) for (let y = 1; y <= 7; y++) c.set(x, y, 8, WOOD_D);
  for (let x = -9; x <= 8; x++) for (let z = 4; z <= 9; z++) c.set(x, 8 - Math.floor((z - 4) / 3), z, toneOf(ROOF[(variant + 1) % 3], x, 8, z));
  c.box(-1, 1, 3, 0, 6, 3, (x, y) => (y === 6 ? WOOD_D : 0x8a3a2a));
  windowAt(c, gf, -5, 4, 4, 9); windowAt(c, gf, 4, 4, 4, 9);
  // flower boxes
  for (const x0 of [-6, 3]) for (let x = x0; x <= x0 + 2; x++) { c.set(x, 2, 4, WOOD_D); c.set(x, 3, 4, FLOWERS[(x + variant) % FLOWERS.length]); }
  // stone chimney with smoke
  for (let y = 1; y <= 16; y++) for (const x of [-10, -9]) for (const z of [-5, -4]) c.set(x, y, z, toneOf(STONE, x, y, z));
  // rocking chair + quilt on the porch
  f.box(8, 2, 13, 11, 6, 13, WOOD_M); f.box(8, 2, 14, 11, 2, 16, WOOD_M); f.box(9, 3, 14, 10, 3, 15, [0xf08aa8, 0x6ab0f0, 0xf2c23a][variant]);
  sparkle(d, -10, 16, 12, { period: 4 });
  tufts(c, rnd, 8, { w: 2, d: 2 }, (x, z) => z >= -9 && z <= 9 && x >= -10 && x <= 9);
}

export const STRUCTURE_MODELS = defineModels({ st_tent, st_poster, st_burrow, st_bunk, st_cabin }, { st_tent: { w: 2, d: 2 }, st_bunk: { w: 2, d: 1 }, st_cabin: { w: 2, d: 2 } });

// ---------------------------------------------------------------- the stretcher
let STR = null;
export function makeStretcher() {
  if (!STR) {
    const v = new VoxelModel();
    const FVX = 0.025;
    for (let x = -20; x <= 19; x++) for (const z of [-6, 5]) v.set(x, 0, z, Math.abs(x) > 15 ? 0x6a4424 : 0x8a5a32);
    for (let x = -13; x <= 12; x++) for (let z = -5; z <= 4; z++) v.set(x, 0, z, (x + z) % 5 === 0 ? 0xe2d8c8 : 0xf4eee2);
    for (const [x, z] of [[-1, -1], [0, -1], [-1, 0], [0, 0], [-2, -1], [1, -1], [-2, 0], [1, 0], [-1, -2], [0, -2], [-1, 1], [0, 1]]) v.set(x, 1, z, 0xd8302a);
    for (const x of [-13, 12]) for (let z = -5; z <= 4; z++) v.set(x, 0, z, 0x8a5a32);
    STR = v.build({ pivot: [0, 0.5, 0], scale: FVX });
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(STR, voxelMaterial());
  m.castShadow = true;
  g.add(m);
  return g;
}
void tone; void log; void rbox; void LEAF; void MOSS; void WHITE; void RED;
