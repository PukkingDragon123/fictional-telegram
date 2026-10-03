// Voxel models for Chip the woodpecker's workshop: rustic hand-made woodwork
// (wd_*) and the restored antiques (an_*): darker varnished wood, velvet and
// polished brass. Same conventions and kit as facilityModels.js:
//
//   STRUCTURE_MODELS[type]({ variant, seed, preview }) -> THREE.Group
//     root at the ground centre of the footprint, front faces +Z, 1 tile = 1 unit;
//     root.userData.update(dt, t) when something moves (rocking chair, pendulum,
//     candle flames, fairy lights, birds), root.userData.seats for things bears
//     can sit on ({ x, z, yaw, y }, like restaurantModel() seats).
import { shade, mix } from '../../core/voxel.js';
import { hash3 } from '../../core/rng.js';
import {
  P, VF, defineModels, rbox, ball, log, tufts, ftufts, text, pix, gear, sparkle, pick, toneOf, fw,
} from './facilityModels.js';

const PI = Math.PI, TAU = PI * 2;
const {
  WOOD_D, WOOD_M, HONEY, BARK, LOG_END, STONE, LEAF, RED, RED_D,
  WHITE, PAPER, METAL, IRON, IRON_L, BRASS, BRASS_D, BRASS_L, FLAME, INK, TWINE,
} = P;
// antique palette: dark varnished mahogany with a glossy streak, velvet, gilt
const MAH = [0x7a3a22, 0x863f25, 0x6e341e], MAH_D = 0x4a2214, MAH_L = 0xb0623a, MAH_LL = 0xd08452;
const VELVET = [[0x8a1a3a, 0xa82a4a, 0x5e0f26], [0x1a6a4a, 0x2a8a5e, 0x0e4a32], [0x2a3a8a, 0x3a50a8, 0x1a2462]];
const CEDAR = [0xb8603a, 0xa85634, 0xc8724a], CEDAR_D = 0x7a3a22;
const BIRCH = [0xf2eee2, 0xe4e0d4, 0xfaf8f0], BIRCH_D = 0x2a2a2a;
const BLOOMS = [
  [0xf06a8a, 0xffffff, 0xd9529b, 0xf8b0c8, 0x9a86ea],
  [0xf2c230, 0xf07a4a, 0xffffff, 0xffe070, 0xe8344a],
  [0xe8344a, 0xffffff, 0x9a86ea, 0xf06a8a, 0xf2c230],
];
// varnish: a lighter streak on the up/left facing voxels of a wood volume
const gloss = (v, cols, test = () => true) => v.paint((x, y, z, c) => {
  if (!cols.includes(c) || !test(x, y, z)) return c;
  if (!v.has(x, y + 1, z) && (x + z) % 5 === 0) return MAH_LL;
  if (!v.has(x, y + 1, z) || !v.has(x - 1, y, z)) return MAH_L;
  return c;
});

// a little pinecone (fine), base at (x, y, z)
function pinecone(f, x, y, z) {
  f.box(x, y, z, x + 1, y + 2, z + 1, (xx, yy, zz) => ((xx + yy + zz) & 1 ? 0x8a5a30 : 0xa86a38));
  f.set(x, y + 3, z, 0x6a4424); f.set(x + 1, y + 3, z + 1, 0x7a4e2a);
}
// a small glass-ish jar (fine, opaque) with a gingham lid
function jar(f, x, y, z, fill, lid = RED) {
  f.box(x, y, z, x + 2, y + 3, z + 2, (xx, yy) => (yy === y + 3 ? 0xd8eef0 : (xx === x && yy > y) ? mix(fill, 0xffffff, 0.35) : fill));
  f.box(x, y + 4, z, x + 2, y + 4, z + 2, (xx, yy, zz) => ((xx + zz) & 1 ? lid : WHITE));
}
// knitted pattern colour
const knit = (cols, x, y, z) => cols[(Math.floor((x + 40) / 2) + Math.floor((z + 40) / 2)) % cols.length];

// ================================================================ LOG STOOL (1x1)
function wd_stool(d, rnd, v) {
  const { c, f } = d;
  const K = [[0xc83a3a, 0xf6f2ea, 0xa82a2a], [0x3a6ac0, 0xf2c230, 0x2a4a90], [0x4a9a5a, 0xf6e6c8, 0x2a6a3a]][v];
  log(c, 'y', 0, 4, 0, 0, 2.9);
  c.set(2, 2, -1, 0x5a3418); c.set(2, 3, -1, BARK[0]);
  for (const [x, z] of [[-4, 0], [3, -1], [0, 3], [-1, -4]]) c.set(x, 0, z, BARK[0]); // roots
  // knitted round cushion: rib stripes, a contrast edge, button + tassels (fine; log top at fine y 10)
  for (let x = -7; x <= 6; x++)
    for (let z = -7; z <= 6; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 6.3) continue;
      const rib = (x + 40) % 3 === 0 ? shade(K[0], 0.86) : K[0];
      f.set(x, 10, z, r > 5.3 ? K[1] : rib);
      if (r < 5.3) f.set(x, 11, z, r > 4.3 ? K[1] : rib);
    }
  f.box(-1, 12, -1, 0, 12, 0, K[2]);
  for (const [x, z] of [[-6, 4], [5, 4]]) { f.set(x, 9, z, K[1]); f.set(x, 8, z, K[1]); }
  // red mushroom at the foot
  f.box(6, 0, 4, 6, 1, 4, 0xf0e6cc);
  f.box(5, 2, 3, 7, 2, 5, 0xd83a2a); f.set(6, 3, 4, 0xd83a2a); f.set(5, 2, 5, WHITE); f.set(7, 3, 4, null); f.set(6, 3, 4, WHITE);
  tufts(c, rnd, 4, { w: 1, d: 1 }, (x, z) => Math.hypot(x + 0.5, z + 0.5) < 4);
  d.seat(0, 0, 0, 0.6);
}

// ================================================================ PLANK TABLE (1x1)
// Thick planed planks on log legs, two log stools, a jar of wildflowers.
function wd_table(d, rnd, v) {
  const { c, f } = d;
  // top: planks along x with dark seams, darker rim
  c.box(-3, 7, -3, 2, 7, 2, (x, y, z) => (x === -3 || x === 2 ? HONEY[1] : z % 2 ? HONEY[0] : HONEY[2]));
  for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) log(c, 'y', 0, 6, x + 0.5, z + 0.5, 0.6, { ends: false, s: x * 3 + z });
  c.box(-2, 2, -3, 1, 2, -3, WOOD_D); c.box(-2, 2, 2, 1, 2, 2, WOOD_D);
  // nail heads (fine, on the top surface at fine y 16)
  for (const x of [-5, 4]) for (const z of [-6, -2, 2]) f.set(x, 16, z, IRON_L);
  // jar of wildflowers, bowl of berries, a pinecone
  f.box(-4, 16, -2, -2, 19, 0, (x, y) => (y === 19 ? 0xc8e8f0 : x === -4 ? 0xd0eef4 : 0xa8d8e4));
  const FL = [0xf2c230, 0xffffff, 0xd9529b, 0x9a86ea];
  for (const [x, y, z, k] of [[-4, 21, -1, 0], [-3, 22, -2, 1], [-2, 21, 0, 2], [-3, 23, -1, 3], [-5, 22, 0, 1]]) { f.set(x, y, z, FL[k]); f.set(x, y - 1, z, LEAF[1]); }
  f.set(-3, 20, -1, LEAF[0]);
  rbox(f, 1, 4, 16, 17, -1, 2, 0.8, WOOD_M); f.box(2, 18, 0, 3, 18, 1, (x, y, z) => ((x + z) & 1 ? 0x5a4ac0 : 0xd8304a));
  pinecone(f, -1, 16, 3);
  // two log stools (seat top 0.5)
  for (const x0 of [-5, 3]) log(c, 'y', 0, 4, x0 + 1, 0, 1.2, { s: x0 });
  tufts(c, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -5 && x <= 4 && z >= -3 && z <= 2);
  d.seat(-0.4, 0, PI / 2, 0.5);
  d.seat(0.4, 0, -PI / 2, 0.5);
}

// ================================================================ BEAR BENCH (2x1)
// A split-log bench with a branch backrest and a carved bear paw.
function wd_bench(d, rnd, v) {
  const { c, f } = d;
  const PLAID = [[0xc83a2a, 0x2a2a2a, 0xa82a22], [0x3a6ac0, 0xf2c230, 0x2a4a90], [0x4a8a5a, 0xf6e6c8, 0x2a5a3a]][v];
  // legs: stout logs
  for (const x of [-8, -1, 6]) for (const z of [-2, 1]) log(c, 'y', 0, 2, x + 0.5, z + 0.5, 0.7, { ends: false, s: x + z });
  // seat: bark underside, planed top
  c.box(-9, 3, -2, 8, 3, 1, (x, y, z) => toneOf(BARK, x, y, z));
  c.box(-9, 4, -2, 8, 4, 1, (x, y, z) => (x === -9 || x === 8 ? LOG_END : z === 1 ? HONEY[1] : (x * 7 + z * 3) % 11 === 0 ? 0xc0844a : HONEY[0]));
  // backrest: branch posts, a lower rail and a half-log top rail
  for (const x of [-9, 8]) for (let y = 4; y <= 11; y++) c.set(x, y, -3, toneOf(BARK, x, y, 4));
  c.box(-8, 7, -3, 7, 7, -3, (x) => toneOf(BARK, x, 7, 5));
  c.box(-9, 10, -3, 8, 11, -3, (x, y) => (x === -9 || x === 8 ? LOG_END : y === 11 ? HONEY[2] : HONEY[0]));
  c.box(-9, 10, -4, 8, 11, -4, (x, y, z) => toneOf(BARK, x, y, z));
  for (const x of [-6, -3, 2, 5]) c.box(x, 8, -3, x, 9, -3, (xx, y) => toneOf(BARK, xx, y, 6));
  // carved paw print + hearts on the top rail (fine, front face z -4)
  pix(f, ['.#.#.', '#...#', '.###.', '#####', '.###.'], -3, 23, -4, { '#': 0x9a6230 });
  for (const x of [-14, 13]) pix(f, ['#.#', '###', '.#.'], x - 1, 22, -4, { '#': 0xc8503a });
  // curled branch armrests
  for (const s of [-1, 1]) { const x = s < 0 ? -10 : 9; c.box(x, 5, -2, x, 6, -2, BARK[0]); c.box(x, 6, -2, x, 6, 1, BARK[1]); c.set(x, 5, 1, BARK[2]); }
  // a folded plaid blanket on one end, an acorn cup
  f.box(9, 10, -4, 15, 11, 1, (x, y, z) => ((x % 3 === 0) || (z % 3 === 0) ? PLAID[1] : (x + z) & 1 ? PLAID[0] : PLAID[2]));
  f.box(-15, 10, 0, -14, 11, 1, 0x8a5a30); f.box(-15, 12, 0, -14, 12, 1, 0x5a3a20);
  tufts(c, rnd, 12, { w: 2, d: 1 }, (x, z) => z >= -4 && z <= 2 && x >= -10 && x <= 9);
  d.seat(-0.45, -0.05, 0, 0.5);
  d.seat(0.45, -0.05, 0, 0.5);
}

// ================================================================ ROCKING CHAIR (1x1)
// Spindle-back rocker on curved runners; the whole chair rocks.
function wd_rocker(d, rnd, v) {
  const K = [[0xc83a3a, 0xf6f2ea], [0x3a6ac0, 0xf6e6c8], [0x4a9a5a, 0xf2c230]][v];
  const rk = d.part({ pivot: [0, 0.95, 0], anim: 'sway', axis: 'x', amp: 0.07, speed: 1.5 });
  const f = rk.f;
  const W = (x, y, z) => HONEY[(x * 3 + y + z * 5 + 99) % 3];
  // runners (along z), curling up at both ends
  for (const x of [-7, 6]) for (let z = -10; z <= 9; z++) {
    const y = Math.round(((z + 0.5) / 9.5) ** 2 * 4);
    f.set(x, y, z, WOOD_M); f.set(x, y + 1, z, WOOD_D);
  }
  // legs + seat
  for (const x of [-7, 6]) for (const z of [-5, 4]) f.box(x, 2, z, x, 9, z, WOOD_D);
  f.box(-7, 10, -6, 6, 10, 5, (x, y, z) => (z === 5 || x === -7 || x === 6 ? HONEY[1] : W(x, y, z)));
  for (const x of [-7, 6]) f.box(x, 5, -5, x, 5, 4, WOOD_M); // stretchers
  // back: two leaning posts, spindles, a curved crest with a carved heart
  const BZ = (y) => -6 - Math.floor((y - 11) / 6);
  for (let y = 11; y <= 28; y++) {
    for (const x of [-7, 6]) f.set(x, y, BZ(y), WOOD_D);
    if (y < 25) for (const x of [-4, -2, 1, 3]) f.set(x, y, BZ(y), W(x, y, 0));
  }
  for (let x = -7; x <= 6; x++) {
    const top = 28 - Math.round(Math.abs(x + 0.5) / 3);
    for (let y = 25; y <= top; y++) f.set(x, y, BZ(y), y === top ? HONEY[2] : HONEY[0]);
  }
  pix(f, ['#.#', '###', '.#.'], -2, 27, BZ(26) + 1, { '#': RED });
  for (const x of [-7, 6]) f.set(x, 29, BZ(29), LOG_END);
  // arms
  for (const x of [-8, 7]) { f.box(x, 17, -6, x, 17, 5, HONEY[2]); f.box(x, 11, 4, x, 16, 4, WOOD_D); f.set(x, 17, 5, LOG_END); }
  // knitted cushion + a little blanket over one arm
  rbox(f, -6, 5, 11, 12, -5, 4, 0.9, (x, y, z) => knit(K, x, y, z));
  f.box(-9, 13, -3, -9, 17, 2, (x, y, z) => knit([K[1], K[0]], y, x, z));
  f.box(-8, 18, -3, -7, 18, 2, (x, y, z) => knit([K[1], K[0]], y, x, z));
  ftufts(d.f, rnd, 12, { w: 1, d: 1 }, (x, z) => x >= -9 && x <= 8 && z >= -11 && z <= 10);
  d.seat(0, 0, 0, 0.62);
}

// ================================================================ PINE SHELF (1x1)
// Open shelf of jars, pinecones, books and a tiny Reynard figurine.
function wd_shelf(d, rnd, v) {
  const { c, f } = d;
  const PINE = [0xe0b478, 0xd4a66a, 0xecc488], PINE_D = 0xb8824a;
  for (const x of [-4, 3]) c.box(x, 0, -4, x, 13, -2, (xx, y, z) => (z === -2 ? PINE[2] : toneOf(PINE, xx, y, z)));
  c.box(-3, 0, -4, 2, 13, -4, (x, y) => (x % 2 ? PINE_D : 0xc8945a)); // back boards
  for (const y of [0, 4, 9]) c.box(-3, y, -3, 2, y, -2, (x) => (y === 0 ? PINE_D : PINE[(x + 9) % 3]));
  c.box(-5, 14, -5, 4, 14, -1, (x, y, z) => (z === -1 || x === -5 || x === 4 ? PINE_D : PINE[0])); // top with overhang
  for (const x of [-4, 3]) c.set(x, 0, -1, PINE_D); // feet
  // bottom shelf (fine y 2): honey jar, books, basket of pinecones
  jar(f, -6, 2, -6, 0xe8a028, 0xd8c8a0); f.set(-5, 7, -5, TWINE);
  f.box(-2, 2, -6, -1, 7, -4, 0x3a6ac0); f.box(0, 2, -6, 0, 6, -4, 0xc83a2a); f.box(1, 2, -6, 2, 5, -4, 0x4a9a5a);
  f.set(-2, 6, -3, 0xf2c230); f.set(1, 4, -3, 0xf2c230);
  f.box(3, 2, -6, 5, 4, -3, (x, y, z) => ((x + y + z) & 1 ? 0xc8a050 : 0xa8803a));
  pinecone(f, 3, 5, -5); pinecone(f, 4, 5, -4);
  // middle shelf (fine y 10): jam jars + the fox figurine
  jar(f, -6, 10, -6, 0xc83a4a); jar(f, -3, 10, -5, 0x6a3a8a, 0x5a8ad8);
  const FOX = 0xe0662a;
  f.box(2, 10, -5, 3, 10, -4, 0x2a2a2a); // base
  f.box(2, 11, -5, 3, 13, -4, FOX); f.set(2, 12, -3, 0xf6e6c8); f.set(3, 12, -3, 0xf6e6c8);
  f.box(2, 14, -5, 3, 15, -4, FOX); f.set(2, 14, -3, 0xf6e6c8); f.set(3, 14, -3, 0x1a1a1a); // snout + nose
  f.box(1, 16, -5, 4, 16, -4, 0x1a1a1e); f.box(2, 17, -5, 3, 18, -4, 0x1a1a1e); f.set(2, 17, -3, RED); // top hat
  f.set(1, 15, -5, FOX); f.set(4, 15, -5, FOX); // ears
  f.box(4, 11, -6, 5, 12, -6, FOX); f.set(5, 13, -6, WHITE); // tail
  // top shelf (fine y 20): pinecones, a candle, a potted fern
  pinecone(f, -6, 20, -5); pinecone(f, -4, 20, -6); pinecone(f, -2, 20, -5);
  f.box(1, 20, -5, 1, 23, -5, 0xf6eedc); f.set(1, 24, -5, FLAME[1]);
  f.box(3, 20, -6, 5, 22, -4, 0xc8683a); f.set(4, 23, -5, LEAF[0]); f.set(3, 24, -5, LEAF[1]); f.set(5, 24, -4, LEAF[3]); f.set(4, 25, -6, LEAF[1]);
  // on top: a carved duck decoy and trailing ivy
  f.box(-5, 30, -6, -1, 31, -4, 0xb8844a); f.box(-1, 32, -5, 0, 33, -5, 0x3a7a4a); f.set(1, 32, -5, 0xf2c230); f.set(-5, 32, -5, 0xa87038);
  for (let y = 22; y <= 29; y++) if (y % 2 === 0 || y > 26) f.set(8 - (y > 26 ? 0 : 1), y, -2, LEAF[(y + 1) % 4]);
  f.box(5, 30, -4, 7, 30, -2, LEAF[1]);
  tufts(c, rnd, 5, { w: 1, d: 1 }, (x, z) => z <= -1 && x >= -5 && x <= 4);
}

// ================================================================ BARREL (1x1)
// Bulging oak barrel with iron hoops, a maple-leaf brand and a dripping tap.
function wd_barrel(d, rnd, v) {
  const f = d.f;
  const R = (y) => 6.1 + Math.sin((PI * y) / 18) * 1.3;
  for (let y = 0; y <= 18; y++)
    for (let x = -9; x <= 8; x++)
      for (let z = -9; z <= 8; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > R(y)) continue;
        if (y < 18 && r < R(y) - 1.4) continue;
        const a = Math.atan2(z + 0.5, x + 0.5);
        const st = Math.floor(((a + PI) / TAU) * 16);
        const hoop = y === 1 || y === 2 || y === 6 || y === 12 || y === 16 || y === 17;
        let col;
        if (y === 18) col = r > R(y) - 1.2 ? WOOD_D : Math.floor(x + 20) % 3 === 0 ? 0x8a5a32 : 0xa06a3a;
        else if (hoop) col = (st & 1) ? IRON : IRON_L;
        else col = Math.floor(((a + PI) / TAU) * 64) % 4 === 0 ? WOOD_D : st % 3 === 0 ? 0xa86e3c : st % 3 === 1 ? 0x9a6234 : 0xb47a44;
        f.set(x, y, z, col);
      }
  // maple leaf brand
  const leaf = ['..#..', '#.#.#', '#####', '.###.', '..#..'];
  pix(f, leaf, -3, 11, (y) => Math.floor(R(y) - 0.5), { '#': RED_D });
  // tap + drip + a little syrup puddle
  f.box(-1, 4, 7, 0, 4, 8, BRASS); f.set(-1, 3, 8, BRASS_D); f.set(0, 5, 8, BRASS_L); f.set(0, 5, 7, BRASS);
  const drip = d.part({ pivot: fw(-1, 2, 8), anim: 'drip', period: 2.6, fall: 0.1 });
  drip.f.set(-1, 2, 8, 0xd88a20);
  f.box(-3, 0, 8, 1, 0, 9, (x, y, z) => ((x + z) & 1 ? 0xc87818 : 0xe09a30));
  // tin cup + ladle on the lid
  f.box(2, 19, -2, 3, 20, -1, METAL); f.set(4, 20, -2, METAL);
  f.line(-4, 19, 1, -1, 21, 3, WOOD_M); f.box(-5, 19, 0, -4, 19, 1, WOOD_D);
}

// ================================================================ CRATE STACK (1x1)
// Slatted crates (fine) stamped FISH, a fragile-glass mark, straw and a fish tail.
function crate(f, x0, y0, z0, x1, y1, z1, s) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const ex = x === x0 || x === x1, ey = y === y0 || y === y1, ez = z === z0 || z === z1;
        if (!ex && !ey && !ez) continue;
        const corner = (ex && ey) || (ex && ez) || (ey && ez);
        let col;
        if (corner) col = WOOD_M;
        else if (ey) col = (x + s) % 3 === 0 ? 0xb88a52 : 0xd0a46a; // lid boards
        else col = (y - y0) % 3 === 0 ? 0x9a6a3a : (y - y0) % 3 === 1 ? 0xd4a86c : 0xc89a5e; // slats with a dark gap
        f.set(x, y, z, col);
      }
}
function wd_crate(d, rnd, v) {
  const f = d.f;
  crate(f, -9, 0, -8, 4, 10, 3, 0);
  crate(f, -7, 11, -7, 2, 18, 1, 1);
  crate(f, 5, 0, 1, 9, 5, 7, 2);
  // shipping label stamped FISH on the big crate, a FRAGILE glass + arrow label on the top one
  const SZ = 3;
  f.box(-8, 2, SZ, 3, 8, SZ, (x, y) => (x === -8 || x === 3 || y === 2 || y === 8 ? 0xc83a2a : PAPER));
  text(f, 'FISH', -7, 7, SZ, 0xb02a20);
  f.box(-6, 12, 1, 0, 17, 1, PAPER);
  pix(f, ['#.#.#', '###.#', '.#..#', '.#.##', '###.#'], -6, 17, 1, { '#': 0xc83a2a });
  f.set(-1, 17, 1, PAPER); f.set(-2, 16, 1, 0xc83a2a);
  // label on the small crate
  f.box(6, 2, 7, 8, 4, 7, PAPER); f.set(7, 3, 7, 0x3a6ac0);
  // straw poking out of the top crate + a fish tail between the lid boards
  for (const [x, z] of [[-6, -6], [-4, -1], [0, -3], [1, 0], [-2, -5]]) { f.set(x, 19, z, 0xe0c060); f.set(x + 1, 20, z, 0xecd27a); }
  f.box(-3, 19, -3, -2, 19, -3, 0x6a9ab0); f.set(-3, 20, -3, 0x8ab8c8); f.set(-2, 20, -3, 0x8ab8c8); f.set(-4, 21, -3, 0x8ab8c8); f.set(-1, 21, -3, 0x8ab8c8);
  // crowbar leaning + nails
  f.line(9, 0, -4, 9, 9, -6, 0xc83a2a); f.set(9, 10, -6, 0xc83a2a); f.set(8, 10, -6, 0xc83a2a);
  f.set(6, 0, -2, METAL); f.set(7, 0, -1, METAL);
}

// ================================================================ PLANTER BOX (1x1)
// Cedar planter overflowing with flowers, trailing blooms and a butterfly.
function wd_planter(d, rnd, v) {
  const { c, f } = d;
  const BL = BLOOMS[v];
  c.box(-4, 0, -3, 3, 3, 2, (x, y, z) => {
    const corner = (x === -4 || x === 3) && (z === -3 || z === 2);
    if (corner) return CEDAR_D;
    if (y === 3) return CEDAR[2];
    return y % 2 ? CEDAR[0] : CEDAR[1];
  });
  for (const [x, z] of [[-4, -3], [3, -3], [-4, 2], [3, 2]]) c.set(x, 4, z, CEDAR_D);
  c.box(-3, 3, -2, 2, 3, 1, 0x4a3020);
  // a carved heart on the front (fine; front face z 6)
  pix(f, ['#.#', '###', '.#.'], -2, 5, 6, { '#': CEDAR_D });
  // flower mound (fine): leafy base, blossoms on top
  const top = (x, z) => 10 + Math.round(5 * Math.max(0, 1 - Math.hypot((x + 0.5) / 9, (z + 1) / 7)) + rnd() * 1.4);
  for (let x = -8; x <= 7; x++)
    for (let z = -6; z <= 5; z++) {
      const h = top(x, z);
      for (let y = 8; y <= h; y++) f.set(x, y, z, y === h ? (rnd() < 0.55 ? pick(rnd, BL) : pick(rnd, LEAF)) : pick(rnd, LEAF));
      if (rnd() < 0.18) { f.set(x, h + 1, z, pick(rnd, BL)); if (rnd() < 0.5) f.set(x, h + 2, z, 0xf2c230); }
    }
  // trailing blooms spilling over the front and sides
  for (const x of [-7, -4, -1, 2, 5]) {
    const n = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) f.set(x + (k & 1), 7 - k, 6, k === n - 1 ? pick(rnd, BL) : LEAF[k % 4]);
  }
  for (const z of [-4, -1, 2]) for (let k = 0; k < 3; k++) { f.set(-9, 7 - k, z + (k & 1), k === 2 ? pick(rnd, BL) : LEAF[1]); f.set(8, 6 - k, z, k === 2 ? pick(rnd, BL) : LEAF[2]); }
  // butterfly
  const b = d.part({ pivot: fw(5, 20, 3), anim: 'bob', speed: 3.2, amp: 0.04 });
  pix(b.f, ['#.#', '.#.', '#.#'], 4, 21, 3, { '#': BL[0] === 0xf06a8a ? 0xf2c230 : 0x9a86ea });
  b.f.set(5, 20, 3, INK);
  tufts(c, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 3 && z >= -3 && z <= 2);
}

// ================================================================ BIRDHOUSE TOWER (1x1)
// Three storeys of bird apartments staggered up a pole, residents at home.
function wd_birdhouse(d, rnd, v) {
  const { c, f } = d;
  c.box(-2, 0, -2, 1, 0, 1, () => pick(rnd, STONE));
  log(c, 'y', 1, 22, 0, 0, 1.1, { ends: false });
  const WALLS = [[0x7ab0c8, 0xf2c230, 0xf08a7a], [0xf6e6c8, 0x9ad08a, 0xb8a0e8], [0xf2a0b0, 0x7ab0c8, 0xf6e6c8]][v];
  // a little house: walls + gable roof with the ridge along z (triangle faces the front)
  const house = (x0, y0, wall, roof, h = 4) => {
    const x1 = x0 + 3, y1 = y0 + h - 1, z0 = -2, z1 = 1;
    c.box(x0, y0, z0, x1, y1, z1, (x, y, z) => (y === y0 ? WOOD_D : (x + y) % 2 ? wall : shade(wall, 0.93)));
    for (let i = 0; i <= 2; i++) {
      const xa = x0 - 1 + i, xb = x1 + 1 - i;
      for (let z = z0; z <= z1 + 1; z++) {
        const eave = z === z1 + 1;
        c.set(xa, y1 + 1 + i, z, eave ? shade(roof, 0.8) : roof);
        c.set(xb, y1 + 1 + i, z, eave ? shade(roof, 0.75) : shade(roof, 0.88));
        if (xb - xa > 1) for (let x = xa + 1; x < xb; x++) c.set(x, y1 + 1 + i, z, i === 2 ? (eave ? shade(roof, 0.8) : roof) : z === z1 || z === z0 ? wall : null);
      }
    }
    return { x0, y1, fz: 2 * z1 + 2 };
  };
  const A = house(-4, 6, WALLS[0], RED);
  const B = house(0, 12, WALLS[1], 0x3a6ac0);
  const C = house(-2, 19, WALLS[2], 0x4a9a5a, 3);
  c.box(-2, 5, -1, 1, 5, 0, WOOD_D); c.box(0, 11, -1, 1, 11, 0, WOOD_D); // brackets
  c.set(-1, 24, -1, 0xe8c040);
  // round doors (fine) + perches
  for (const h of [A, B, C]) {
    const x = 2 * h.x0 + 3, y = 2 * h.y1 - 2, z = h.fz;
    f.box(x, y, z, x + 1, y + 1, z, 0x1a1210); f.set(x, y + 2, z, 0x2a1a10); f.set(x + 1, y + 2, z, 0x2a1a10);
    f.box(x, y - 2, z, x + 1, y - 2, z + 1, WOOD_D);
  }
  // window box on the bottom flat
  f.box(-7, 13, 4, -5, 13, 4, WOOD_M); f.set(-7, 14, 4, 0xe8344a); f.set(-6, 14, 4, LEAF[1]); f.set(-5, 14, 4, 0xf2c230);
  // residents: chickadee on the bottom perch, bluebird on the middle perch, robin peeking from the top
  const bird = (pv, speed, phase, draw) => { const p = d.part({ pivot: pv, anim: 'bob', speed, phase, amp: 0.015 }); draw(p.f); };
  bird(fw(-5, 16, 5), 2.3, 0, (b) => { b.set(-5, 16, 5, 0x8a8a90); b.set(-5, 17, 5, 0x1a1a1e); b.set(-5, 16, 6, 0xe8d8b0); b.set(-5, 17, 6, WHITE); b.set(-4, 16, 4, 0x6a6a70); b.set(-6, 17, 6, 0x2a2a2a); });
  bird(fw(2, 28, 5), 1.9, 1.3, (b) => { b.set(2, 28, 5, 0x4a7ad0); b.set(2, 29, 5, 0x5a8ae0); b.set(2, 28, 6, 0xe8904a); b.set(3, 28, 4, 0x2a4a90); b.set(1, 29, 6, INK); });
  bird(fw(-1, 41, 4), 1.4, 2.1, (b) => { b.set(-1, 41, 4, 0x5a4a40); b.set(-1, 40, 4, 0xd8602a); b.set(-1, 41, 5, 0xe8a030); });
  // flowers round the base
  for (const [x, z] of [[2, 1], [-3, -1], [1, 2], [-2, 2], [2, -2]]) { c.set(x, 0, z, LEAF[0]); c.set(x, 1, z, pick(rnd, P.FLOWERS)); }
  tufts(c, rnd, 6, { w: 1, d: 1 }, (x, z) => Math.abs(x + 0.5) < 3 && Math.abs(z + 0.5) < 3);
}

// ================================================================ TWIG ARCH (2x1)
// Woven birch-twig arch with ferns and twinkling fairy lights.
function wd_arch(d, rnd, v) {
  const f = d.f;
  const CXA = -0.5, CYA = 24, RA = 14.5; // arch centre/radius (fine)
  // path of the bundle: up the left post, round the arch, down the right post
  const pts = [];
  for (let y = 0; y <= CYA; y++) pts.push([CXA - RA, y]);
  for (let a = 180; a >= 0; a -= 2) { const t = (a * PI) / 180; pts.push([CXA + Math.cos(t) * RA, CYA + Math.sin(t) * RA]); }
  for (let y = CYA; y >= 0; y--) pts.push([CXA + RA, y]);
  // three twigs twisting round each other
  pts.forEach(([px, py], i) => {
    for (let k = 0; k < 3; k++) {
      const ph = i * 0.35 + (k * TAU) / 3;
      const nx = px < CXA - RA + 0.1 || px > CXA + RA - 0.1 ? 1 : (px - CXA) / RA;
      const ny = px < CXA - RA + 0.1 || px > CXA + RA - 0.1 ? 0 : (py - CYA) / RA;
      const off = Math.cos(ph) * 1.2;
      const x = Math.round(px + nx * off), y = Math.round(py + (py > CYA ? ny * off : 0)), z = Math.round(-0.5 + Math.sin(ph) * 1.4);
      const fleck = hash(i, k) < 0.16;
      f.set(x, y, z, fleck ? BIRCH_D : toneOf(BIRCH, x, y, z));
    }
  });
  // fern fronds + ivy woven in, fiddleheads at the feet
  pts.forEach(([px, py], i) => {
    if (i % 5 || hash(i, 7) > 0.65) return;
    const side = hash(i, 9) < 0.5 ? -1 : 1;
    f.set(Math.round(px), Math.round(py), 2 * side, LEAF[i % 4]);
    f.set(Math.round(px) + (hash(i, 3) < 0.5 ? 1 : -1), Math.round(py), 2 * side, LEAF[(i + 1) % 4]);
  });
  for (const x0 of [-17, 14]) {
    for (let k = 0; k < 5; k++) f.set(x0 + (k > 2 ? 1 : 0), k, 3, LEAF[0]);
    f.set(x0 + 2, 5, 3, LEAF[3]); f.set(x0 + 2, 4, 3, LEAF[3]); f.set(x0 + 1, 3, 3, LEAF[0]); // fiddlehead curl
    for (const dz of [-3, 2]) for (let k = 0; k < 4; k++) f.set(x0 - 1 + k, 4 - Math.abs(k - 1), dz, LEAF[(k + 1) % 4]);
  }
  // fairy lights: a wire along the front of the arch, bulbs in two twinkling sets
  const BUL = [0xfff0b0, 0xffd070, 0xfff8e0];
  const sets = [d.part({ pivot: [0, 1.2, 0], anim: 'twinkle', speed: 2.2 }), d.part({ pivot: [0, 1.2, 0], anim: 'twinkle', speed: 2.2, phase: PI })];
  let n = 0;
  for (let a = 178; a >= 2; a -= 4) {
    const t = (a * PI) / 180;
    const sag = (Math.sin(a * 0.35) + 1) * 0.8;
    const x = Math.round(CXA + Math.cos(t) * (RA - 1.5 - sag)), y = Math.round(CYA + Math.sin(t) * (RA - 1.5 - sag));
    f.set(x, y, 2, 0x3a4a30);
    if (a % 8 === 2) sets[n++ & 1].gf.set(x, y - 1, 2, BUL[n % 3]);
  }
  for (const s of [-1, 1]) for (let y = 4; y <= CYA; y += 4) sets[(y / 4) & 1].gf.set(Math.round(CXA + s * (RA - 2)), y, 2, BUL[(y / 4) % 3]);
  // stepping stones through the middle
  for (const [x, z] of [[-2, 6], [1, 3], [-1, -2], [2, -6]]) f.box(x - 1, 0, z - 1, x + 1, 0, z, () => pick(rnd, STONE));
  ftufts(f, rnd, 40, { w: 2, d: 1 }, (x, z) => Math.abs(x + 0.5) < 6 && Math.abs(z) < 8);
}
const hash = (i, k) => hash3(i, k, 77);

// ================================================================ ANTIQUE ARMCHAIR (1x1)
// Carved mahogany frame, tufted velvet, rolled arms, brass nailheads + ball feet.
function an_chair(d, rnd, v) {
  const f = d.f;
  const VEL = VELVET[v];
  const W = (x, y, z) => toneOf(MAH, x, y, z);
  // cabriole legs (curve out at the knee) on brass ball feet
  for (const [x, z] of [[-8, -7], [7, -7], [-8, 5], [7, 5]]) {
    const ox = x < 0 ? -1 : 1, oz = z < 0 ? -1 : 1;
    f.set(x, 0, z, BRASS); f.set(x, 1, z, BRASS_D);
    for (let y = 2; y <= 8; y++) f.set(x + (y >= 5 && y <= 7 ? ox : 0), y, z + (y >= 6 && y <= 7 ? oz : 0), y === 8 ? MAH_D : W(x, y, z));
  }
  // seat rail with a carved shell + nailheads
  f.box(-8, 8, -7, 7, 9, 5, (x, y, z) => (y === 9 && (z === 5 || x === -8 || x === 7) && (x + z) % 2 === 0 ? BRASS : W(x, y, z)));
  pix(f, ['.###.', '#####', '.#.#.'], -3, 8, 6, { '#': MAH_L });
  // tufted seat cushion
  rbox(f, -7, 6, 10, 12, -6, 5, 1.2, (x, y, z) => ((x + 40) % 4 === 1 && (z + 40) % 4 === 1 && y === 12 ? VEL[2] : y === 12 ? VEL[1] : VEL[0]));
  // rolled arms with scroll fronts
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -9 : 6;
    rbox(f, x0, x0 + 2, 10, 16, -7, 5, 1.1, (x, y) => (y >= 15 ? VEL[1] : VEL[0]));
    f.box(x0, 10, 6, x0 + 2, 16, 6, (x, y) => (y === 16 || x === x0 + 1 && y === 14 ? MAH_L : W(x, y, 6)));
    f.set(x0 + 1, 13, 7, BRASS);
  }
  // tall back: velvet panel with buttons, carved crest + gilt finial
  for (let y = 10; y <= 30; y++)
    for (let x = -8; x <= 7; x++) {
      const crest = 28 - Math.round(Math.abs(x + 0.5) * 0.45);
      if (y > crest + 2) continue;
      const frame = x === -8 || x === 7 || y >= crest + 1;
      f.set(x, y, -8, frame ? W(x, y, -8) : VEL[0]);
      f.set(x, y, -7, frame ? (y >= crest + 1 ? MAH_L : W(x, y, -7)) : (x + 40) % 4 === 2 && (y + 40) % 4 === 0 ? VEL[2] : (x + y) % 2 ? VEL[1] : VEL[0]);
    }
  f.box(-2, 31, -8, 1, 31, -7, BRASS); f.box(-1, 32, -8, 0, 32, -7, BRASS_L);
  // a lace doily + a small tasseled pillow
  rbox(f, 2, 5, 13, 16, -6, -5, 0.8, (x, y) => (y === 16 ? BRASS_L : VEL[1]));
  gloss(f, MAH);
  d.seat(0, 0.05, 0, 0.65);
}

// ================================================================ ANTIQUE DINING TABLE (2x1)
// Polished table with inlay, turned legs, lace runner, candelabra, china and two chairs.
function an_table(d, rnd, v) {
  const f = d.f;
  const VEL = VELVET[v];
  const W = (x, y, z) => toneOf(MAH, x, y, z);
  // top + inlay border + apron
  f.box(-13, 15, -7, 12, 16, 6, (x, y, z) => {
    if (y === 16 && (x === -12 || x === 11 || z === -6 || z === 5) && x >= -12 && x <= 11 && z >= -6 && z <= 5) return 0xd8a868; // inlay
    return W(x, y, z);
  });
  f.box(-12, 13, -6, 11, 14, 5, (x, y, z) => (x === -12 || x === 11 || z === -6 || z === 5 ? (y === 14 ? MAH_D : W(x, y, z)) : null));
  for (const x of [-5, 4]) f.set(x, 13, 6, BRASS);
  // turned legs: bulbs + brass caps
  for (const [x, z] of [[-12, -6], [10, -6], [-12, 4], [10, 4]])
    for (let y = 0; y <= 12; y++) {
      const r = y === 0 ? 1 : y >= 3 && y <= 5 ? 1 : y === 9 || y === 10 ? 1 : 0;
      for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
        if (r === 0 && (dx < 0 || dz < 0 || dx > 1 || dz > 1)) continue;
        if (r === 1 && (dx === -1 || dx === 2) && (dz === -1 || dz === 2)) continue;
        f.set(x + dx, y, z + dz, y === 0 ? BRASS : W(x, y, z));
      }
    }
  // lace runner, candelabra with three candles, plates, glasses, a vase of roses
  f.box(-11, 17, -2, 10, 17, 1, (x, y, z) => ((x + z) % 3 === 0 ? 0xe8e0d0 : WHITE));
  for (const x of [-12, 11]) for (const z of [-2, 1]) f.set(x, 16, z, WHITE);
  f.box(-1, 18, -1, 0, 18, 0, BRASS_D); f.box(-1, 19, -1, 0, 22, 0, BRASS);
  f.box(-4, 22, -1, 3, 22, 0, BRASS); f.set(-4, 23, -1, BRASS_L); f.set(3, 23, -1, BRASS_L);
  for (const x of [-4, -1, 3]) { const y0 = x === -1 ? 23 : 24; f.box(x, y0, -1, x, y0 + 2, -1, 0xf6eedc); }
  f.set(-1, 23, 0, BRASS_L);
  for (const [x, y] of [[-4, 27], [-1, 26], [3, 27]]) {
    const fl = d.part({ pivot: [(x + 0.5) * VF, y * VF, -0.5 * VF], anim: 'flicker', speed: 8 + x });
    fl.gf.set(x, y, -1, FLAME[1]); fl.gf.set(x, y + 1, -1, FLAME[0]);
  }
  for (const [x, z] of [[-9, 3], [8, 3], [-9, -5], [8, -5]]) {
    f.box(x - 1, 17, z - 1, x + 1, 17, z + 1, (xx, y, zz) => (xx === x && zz === z ? WHITE : 0x6a8ad8));
    f.set(x - 2, 17, z, 0xd8e0e8); f.set(x + 2, 17, z, 0xd8e0e8); // silverware
    f.set(x + 2, 18, z - 2, 0xc8e8f0); f.set(x + 2, 19, z - 2, 0x9a2a3a); // wine glass
  }
  f.box(6, 18, -1, 7, 20, 0, 0x5a8ad8); f.set(6, 21, -1, 0xe8344a); f.set(7, 22, 0, 0xd02a3a); f.set(7, 21, -1, LEAF[1]); f.set(6, 22, 0, 0xe8344a);
  // a chair at each end (velvet seat, carved back)
  for (const s of [-1, 1]) {
    const xs = s < 0 ? -19 : 15; // seat block x range xs..xs+3
    const xb = s < 0 ? xs : xs + 3; // back on the far side
    for (const [x, z] of [[xs, -3], [xs + 3, -3], [xs, 2], [xs + 3, 2]]) f.box(x, 0, z, x, 8, z, (xx, y) => (y === 0 ? BRASS : W(xx, y, z)));
    f.box(xs, 9, -3, xs + 3, 9, 2, (x, y, z) => W(x, y, z));
    rbox(f, xs, xs + 3, 10, 11, -3, 2, 0.8, (x, y, z) => ((x + z) % 2 ? VEL[1] : VEL[0]));
    for (let y = 10; y <= 22; y++) for (let z = -3; z <= 2; z++) {
      const top = 21 - Math.round(Math.abs(z + 0.5) * 0.5);
      if (y > top + 1) continue;
      f.set(xb, y, z, z === -3 || z === 2 || y >= top ? W(xb, y, z) : y > 13 && y < top - 1 ? VEL[0] : W(xb, y, z));
    }
    f.set(xb, 23, -1, BRASS); f.set(xb, 23, 0, BRASS);
  }
  gloss(f, MAH);
  d.seat(-0.85, -0.03, PI / 2, 0.6);
  d.seat(0.85, -0.03, -PI / 2, 0.6);
}

// ================================================================ GRANDFATHER CLOCK (1x1)
// Tall mahogany case, brass dial stuck at dinner o'clock (5), moon-phase arch,
// a swinging brass pendulum behind the glass and a gilt crown.
function an_clock(d, rnd, v) {
  const f = d.f;
  const W = (x, y, z) => toneOf(MAH, x, y, z);
  // plinth on brass bun feet
  for (const [x, z] of [[-7, -5], [6, -5], [-7, 3], [6, 3]]) f.box(x, 0, z, x, 0, z + 1, BRASS);
  f.box(-7, 1, -5, 6, 6, 4, (x, y, z) => (y === 6 ? MAH_L : (z === 4 && (x === -5 || x === 4) && y > 1 && y < 6) ? MAH_D : W(x, y, z)));
  f.box(-3, 2, 5, 2, 5, 5, (x, y) => (x === -3 || x === 2 || y === 2 || y === 5 ? MAH_L : MAH_D)); // raised panel
  // trunk with a glass window
  f.box(-5, 7, -4, 4, 28, 3, (x, y, z) => (z === 3 && (x === -5 || x === 4) ? MAH_D : W(x, y, z)));
  f.box(-3, 9, -3, 2, 26, 3, null); // hollow behind the window
  f.box(-3, 9, -4, 2, 26, -4, MAH_D);
  for (let y = 9; y <= 26; y++) for (let x = -3; x <= 2; x++) d.glass.set(x, y, 3, (x === -3 && y > 14) ? 0xffffff : 0xd8eef4);
  f.box(-4, 8, 4, 3, 8, 4, BRASS_D); f.box(-4, 27, 4, 3, 27, 4, BRASS_D);
  for (let y = 9; y <= 26; y++) { f.set(-4, y, 4, MAH_L); f.set(3, y, 4, MAH_D); }
  f.set(3, 18, 5, BRASS_L); // keyhole escutcheon
  // pendulum (swings) + weights
  const pend = d.part({ pivot: [0, 26.5 * VF, 0.5 * VF], anim: 'sway', axis: 'z', amp: 0.2, speed: 2.8 });
  pend.f.box(-1, 14, 0, 0, 26, 0, BRASS_D);
  for (let x = -3; x <= 2; x++) for (let y = 10; y <= 15; y++) if (Math.hypot(x + 0.5, y + 0.5 - 12.5) <= 2.9) pend.f.set(x, y, 0, Math.hypot(x + 1, y - 13.5) < 1.2 ? BRASS_L : BRASS);
  f.box(-3, 18, -2, -3, 22, -2, BRASS_D); f.box(2, 20, -2, 2, 24, -2, BRASS_D);
  // hood: dial with hands at 5 o'clock, moon arch, columns
  f.box(-6, 29, -5, 5, 41, 4, (x, y, z) => (y === 29 || y === 41 ? MAH_L : W(x, y, z)));
  for (const x of [-6, 5]) for (let y = 30; y <= 40; y++) f.set(x, y, 5, y === 30 || y === 40 ? BRASS : x < 0 ? MAH_L : MAH_D);
  const DX = -0.0, DY = 34.5;
  for (let x = -5; x <= 4; x++)
    for (let y = 30; y <= 40; y++) {
      const r = Math.hypot(x + 0.5 - DX, y + 0.5 - DY);
      if (r <= 4.6) f.set(x, y, 4, r > 3.7 ? (x + y) & 1 ? BRASS : BRASS_L : 0xf6eedc);
      else if (y >= 38 && r <= 6) f.set(x, y, 4, 0x2a3a7a);
    }
  f.set(-1, 39, 4, 0xf2d27a); f.set(0, 39, 4, 0xf2d27a); f.set(0, 40, 4, 0xf2d27a); // moon in the arch
  f.set(3, 39, 4, 0xffffff); f.set(-3, 40, 4, 0xffffff); // stars
  for (const [x, y] of [[-1, 37], [0, 37], [3, 34], [-1, 31], [0, 31], [-4, 34]]) f.set(x, y, 4, INK); // 12, 3, 6, 9
  f.set(-1, 35, 4, INK); f.set(-1, 36, 4, INK); // minute hand -> 12
  f.set(0, 34, 4, INK); f.set(1, 33, 4, INK); // hour hand -> 5
  f.set(-1, 34, 4, BRASS_D);
  // crown: an arched bonnet with a gilt ball finial and corner urns
  [[-6, 5], [-5, 4], [-4, 3], [-2, 1]].forEach(([a, b], k) => f.box(a, 42 + k, -5, b, 42 + k, 4, (x, y, z) => (z === 4 && (x === a || x === b) ? MAH_L : toneOf(MAH, x, y, z))));
  f.box(-6, 42, 5, 5, 42, 5, BRASS_D);
  for (const x of [-6, 5]) { f.set(x, 43, 4, BRASS); f.set(x, 44, 4, BRASS_L); }
  f.box(-1, 46, -1, 0, 46, 0, BRASS_D); ball(f, 0, 48, -0.5, 1.5, BRASS); f.set(-1, 49, 0, BRASS_L);
  gloss(f, MAH);
  sparkle(d, -4, 41, 6, { period: 4.2, col: 0xfff4c0 });
}

// ================================================================ BRASS LANTERN (1x1)
// A varnished post with a scrolled brass bracket; the lantern hangs and sways,
// candle flickering behind its panes.
function an_lamp(d, rnd, v) {
  const f = d.f;
  const W = (x, y, z) => toneOf(MAH, x, y, z);
  // stepped base (brass trim) + post
  f.box(-9, 0, -4, -4, 1, 1, (x, y) => (y === 1 ? BRASS : MAH_D));
  f.box(-8, 2, -3, -5, 3, 0, (x, y) => (y === 3 ? MAH_L : W(x, y, 0)));
  f.box(-7, 4, -2, -6, 34, -1, (x, y, z) => (y % 9 === 0 ? BRASS : W(x, y, z)));
  ball(f, -6, 36, -1, 1.5, BRASS); f.set(-7, 37, -2, BRASS_L);
  // bracket arm with a scroll underneath
  f.box(-5, 33, -2, 2, 33, -1, BRASS);
  for (let a = 0; a <= 12; a++) { const t = (a / 12) * PI * 1.5; f.set(Math.round(-4 + Math.cos(t) * 2), Math.round(30.5 + Math.sin(t) * 2), -2, BRASS_D); }
  f.line(-5, 28, -2, -1, 32, -2, BRASS_D);
  f.set(1, 32, -2, BRASS_L); f.set(1, 32, -1, BRASS_L);
  // the lantern (sways from the hook)
  const L = d.part({ pivot: [1 * VF, 32 * VF, -0.5 * VF], anim: 'sway', axis: 'z', amp: 0.06, speed: 1.2 });
  const lf = L.f;
  lf.box(0, 30, -2, 1, 31, -1, BRASS_D); // ring
  for (let k = 0; k < 4; k++) lf.box(-2 + k, 26 + k, -4 + k, 3 - k, 26 + k, 1 - k, k === 0 ? BRASS_D : BRASS); // roof
  lf.box(-3, 25, -5, 4, 25, 2, BRASS_L);
  for (const [x, z] of [[-3, -5], [4, -5], [-3, 2], [4, 2]]) lf.box(x, 16, z, x, 24, z, BRASS);
  lf.box(-3, 14, -5, 4, 15, 2, (x, y) => (y === 14 ? BRASS_D : BRASS));
  lf.box(-1, 12, -3, 2, 13, 0, BRASS_D); lf.box(0, 11, -2, 1, 11, -1, BRASS_L);
  for (let y = 16; y <= 24; y++) for (let x = -2; x <= 3; x++) for (let z = -4; z <= 1; z++) L.glass.set(x, y, z, x === -2 && z === 1 ? 0xffffff : 0xffe8b0);
  lf.box(0, 16, -2, 1, 18, -1, 0xf6eedc);
  const fl = L.part({ pivot: [1 * VF, 19 * VF, -0.5 * VF], anim: 'flicker', speed: 9 });
  fl.gf.box(0, 19, -2, 1, 19, -1, FLAME[1]); fl.gf.set(0, 20, -2, FLAME[0]); fl.gf.set(1, 20, -1, FLAME[0]); fl.gf.set(0, 21, -1, 0xfff4c0);
  // warm light pooled on the lantern floor
  L.gf.box(-2, 15, -4, 3, 15, 1, 0xffc870); L.f.box(-2, 15, -4, 3, 15, 1, null);
  // flowers in a brass pot at the foot
  f.box(2, 0, 3, 5, 3, 6, (x, y) => (y === 3 ? BRASS_L : BRASS)); f.box(3, 4, 4, 4, 4, 5, LEAF[1]); f.set(3, 5, 4, 0xe8344a); f.set(4, 5, 5, 0xf2c230);
  gloss(f, MAH);
  ftufts(f, rnd, 10, { w: 1, d: 1 }, (x, z) => (x >= -10 && x <= -3 && z >= -5 && z <= 2) || (x >= 1 && z >= 2));
}

// ================================================================ FLOWER CART (2x1)
// The old hand cart, varnished, brass hubs and handle caps, full of flower buckets.
function an_cart(d, rnd, v) {
  const f = d.f;
  const W = (x, y, z) => toneOf(MAH, x, y, z);
  const BL = BLOOMS[v];
  // cart bed (x -13..8, z -6..5, floor y 9, sides to 16) with painted border
  f.box(-13, 9, -6, 8, 16, 5, (x, y, z) => {
    const side = x === -13 || x === 8 || z === -6 || z === 5;
    if (!side && y > 9) return null;
    if (y === 16) return MAH_L;
    if (z === 5 && y === 12 && x > -12 && x < 7) return (x % 3 === 0) ? 0xe8344a : (x % 3 === 1 ? LEAF[1] : 0xf2c230); // painted vine
    return W(x, y, z);
  });
  for (const [x, z] of [[-13, -6], [8, -6], [-13, 5], [8, 5]]) { f.box(x, 9, z, x, 9, z, BRASS); f.set(x, 16, z, BRASS_L); }
  // handles + brass caps, a stand leg under the handles
  for (const z of [-5, 4]) { f.line(8, 13, z, 18, 15, z, W(1, 1, z)); f.set(19, 15, z, BRASS); }
  f.box(14, 0, -5, 14, 13, -5, MAH_D); f.box(14, 0, 4, 14, 13, 4, MAH_D); f.box(14, 6, -4, 14, 6, 3, MAH_D);
  // axle + two spoked wheels (front one faces the camera)
  f.box(-4, 7, -8, -3, 8, 7, IRON);
  for (const [z0, z1] of [[7, 8], [-9, -8]]) {
    gear(f, -3.5, 8, z0, z1, 7.6, 7.6, 0, (x, y, r) => (r > 6.6 ? IRON : r > 5.2 ? W(x, y, 0) : MAH_D), { spokes: 8, hub: BRASS });
    const zc = z0 > 0 ? z1 + 1 : z0 - 1;
    f.set(-4, 7, zc, BRASS_L); f.set(-3, 7, zc, BRASS); f.set(-4, 8, zc, BRASS); f.set(-3, 8, zc, BRASS_D);
  }
  // tin buckets of flowers (sunflowers, tulips, roses, lavender)
  const bucket = (x0, z0, h, kind) => {
    f.box(x0, 10, z0, x0 + 3, 10 + h, z0 + 3, (x, y, z) => (y === 10 + h ? 0xd8e0e8 : (x === x0 || z === z0 + 3) ? 0xb8c4cc : 0xa0acb4));
    const top = 11 + h;
    for (let x = x0 - 1; x <= x0 + 4; x++) for (let z = z0 - 1; z <= z0 + 4; z++) {
      if (rnd() < 0.25) continue;
      const y = top + Math.floor(rnd() * 3);
      f.set(x, y - 1, z, LEAF[(x + z + 8) % 4]);
      let col;
      if (kind === 0) col = rnd() < 0.3 ? 0x6a3a1a : 0xf2c230; // sunflowers
      else if (kind === 1) col = pick(rnd, [BL[0], BL[2], BL[3]]);
      else if (kind === 2) col = pick(rnd, [0xe8344a, 0xd02a3a, 0xf06a8a]);
      else col = (y & 1) ? 0x9a86ea : 0x8a6ad8;
      f.set(x, y, z, col);
      if (kind === 3) f.set(x, y + 1, z, 0x9a86ea);
    }
  };
  bucket(-11, -4, 3, 0); bucket(-6, -4, 2, 2); bucket(-1, -4, 3, 3); bucket(3, -4, 2, 1);
  bucket(-11, 1, 1, 1); bucket(-6, 1, 1, 3); bucket(-1, 1, 1, 0); bucket(3, 1, 1, 2);
  // chalk price tag on a stick + a brass bell on the handle
  f.box(7, 17, 6, 7, 22, 6, WOOD_M); f.box(5, 22, 6, 9, 25, 6, (x, y) => (x === 5 || x === 9 || y === 22 || y === 25 ? WOOD_M : 0x2a3430));
  f.set(6, 24, 7, 0xf8dc70); f.set(7, 23, 7, WHITE); f.set(8, 24, 7, 0xf06a8a);
  f.set(17, 16, 4, BRASS); ball(f, 17.5, 16, 5.5, 1.2, BRASS_L);
  gloss(f, MAH);
  ftufts(f, rnd, 30, { w: 2, d: 1 }, (x, z) => x >= -14 && x <= 9 && z >= -7 && z <= 6);
}

// ---------------------------------------------------------------- export
export const WOODWORK_FOOTPRINTS = { wd_bench: { w: 2, d: 1 }, wd_arch: { w: 2, d: 1 }, an_table: { w: 2, d: 1 }, an_cart: { w: 2, d: 1 } };
export const WOODWORK_TYPES = [
  'wd_stool', 'wd_table', 'wd_bench', 'wd_rocker', 'wd_shelf', 'wd_barrel', 'wd_crate', 'wd_planter', 'wd_birdhouse', 'wd_arch',
  'an_chair', 'an_table', 'an_clock', 'an_lamp', 'an_cart',
];
export const STRUCTURE_MODELS = defineModels({
  wd_stool, wd_table, wd_bench, wd_rocker, wd_shelf, wd_barrel, wd_crate, wd_planter, wd_birdhouse, wd_arch,
  an_chair, an_table, an_clock, an_lamp, an_cart,
}, WOODWORK_FOOTPRINTS);
