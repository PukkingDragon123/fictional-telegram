// [v26 resort] Voxel models for the Bear Resort facilities (src/data/ext/resort.js)
// plus the little props bears wear afterwards (towel, robe, cucumber slices,
// ice cream cone, foam fish hat, marshmallow stick). Same kit and conventions as
// facilityModels.js:
//
//   STRUCTURE_MODELS[type]({ variant, seed, preview }) -> THREE.Group
//     root at the ground centre of the footprint, front faces +Z, 1 tile = 1 unit.
//     root.userData.update(dt, t)   animated bits (steam, bubbles, flames, towels...)
//     root.userData.rs = {          what the resort system (src/game/ext/resort.js) drives
//       spots: [{ x, z, yaw, y, pose }]  where a visiting bear stands / sits / lies (local units,
//                                     yaw 0 = facing +z; pose 'stand' | 'sit' | 'lie' | 'tub' | 'hide')
//       work: [{ x, z, yaw }]         where a staff beaver works
//       front: [x, z]                 the service point in front of the build (queue starts here)
//       parts: { door, roof, sign, closed, clerk, turnstile, flash, curtain, water, fire }
//                                     named sub-objects (doors swing, the CLOSED sign shows, the roof
//                                     flies off when a bear smashes it...)
//     }
//   PROPS: makeProp(kind, look?) -> THREE.Object3D for 'towel' | 'robe' | 'cucumbers' | 'cone' | 'hat'
//     | 'mallow' | 'ticket' | 'strip' (world units at bear scale 1, origin where it attaches).
import * as THREE from 'three';
import { VoxelModel, voxelMaterial, shade, mix } from '../../core/voxel.js';
import { hash3 } from '../../core/rng.js';
import {
  P, VC, VF, defineModels, rbox, ball, log, tufts, ftufts, text, textW, pix, sparkle, pick, toneOf, tone, fw, glowMaterial,
} from './facilityModels.js';

const PI = Math.PI, TAU = PI * 2;
const {
  WOOD, WOOD_D, WOOD_M, WOOD_L, HONEY, BARK, LOG_END, LOG_RING, STONE, MOSS, LEAF, GRASS, RED, RED_D, RED_L,
  WHITE, CREAM, PAPER, METAL, METAL_D, METAL_L, IRON, IRON_L, CHROME, BRASS, BRASS_D, BRASS_L, GOLD, GOLD_L, NAVY, NAVY_D, ROPE, FLAME, INK,
} = P;
const CEDAR = [0xc8743a, 0xb8683a, 0xd8844a], CEDAR_D = 0x8a4a28, CEDAR_L = 0xe8a060;
const TEAL = [0x5ab8b0, 0x4aa8a0, 0x6ac8c0], TEAL_D = 0x2a7a78;
const MINT = [0x9ad8b8, 0x8ac8a8, 0xaae8c8];
const WATER = [0x3aa8d8, 0x4ab8e8, 0x2a98c8], WATER_L = 0x8ae0f8;
const STEAM = 0xf4f8ff;
const TOWELS = [[0xf06a8a, 0xffffff], [0x5ab0e8, 0xffffff], [0xf2c230, 0xffffff], [0x6ac87a, 0xffffff], [0xb48aff, 0xffffff]];
const AWN = [[0xd23a2e, 0xf6f2ea], [0x2a6ab0, 0xf6f2ea], [0x2a9a6a, 0xf6f2ea]];
const BEAVER = [0x8a4c28, 0x7a4220, 0x9a5a30], BEAVER_L = 0xc88c58;
const hv = (x, y, z, s = 0) => hash3(x * 7 + s, y * 13 - s, z * 5 + s * 3);

// a fine-voxel 3x5 text line centred on cx (fine units), top row yTop, plane z
function ctext(f, s, cx, yTop, z, col) { return text(f, s, Math.round(cx - textW(s) / 2), yTop, z, col); }

// a little voxel beaver clerk (head + shoulders), fine voxels, facing +z, centre x, base y, front z
function beaverBust(f, cx, y0, z, { visor = 0x3aa060, apron = null } = {}) {
  // shoulders / body
  rbox(f, cx - 4, cx + 3, y0, y0 + 4, z - 4, z - 1, 1.2, (x, y) => (apron && y <= y0 + 3 ? apron : toneOf(BEAVER, x, y, z)));
  // head
  rbox(f, cx - 3, cx + 2, y0 + 5, y0 + 10, z - 4, z, 1.6, (x, y, zz) => toneOf(BEAVER, x, y, zz));
  f.box(cx - 2, y0 + 5, z + 1, cx + 1, y0 + 7, z + 1, BEAVER_L); // muzzle
  f.set(cx - 1, y0 + 7, z + 2, 0x2a1a14); f.set(cx, y0 + 7, z + 2, 0x2a1a14); // nose
  f.set(cx - 1, y0 + 5, z + 2, WHITE); f.set(cx, y0 + 5, z + 2, WHITE); // buck teeth
  f.set(cx - 2, y0 + 8, z + 1, 0x1a1210); f.set(cx + 1, y0 + 8, z + 1, 0x1a1210); // eyes
  f.set(cx - 3, y0 + 11, z - 2, BEAVER[1]); f.set(cx + 2, y0 + 11, z - 2, BEAVER[1]); // ears
  if (visor) { f.box(cx - 3, y0 + 10, z - 3, cx + 2, y0 + 10, z + 2, visor); f.box(cx - 3, y0 + 11, z - 3, cx + 2, y0 + 11, z - 2, shade(visor, 0.8)); }
}

// stripes helper
const stripe = (k, a, b, w = 2) => (Math.floor(k / w) % 2 ? b : a);

// ---------------------------------------------------------------- sub-model builders
// Each runtime-driven piece is its own tiny model so the resort can grab it by name.
// pivoted(d, pivot) draws into a part whose group sits at the pivot (hinges, spinners).
const SUBS = {};
function sub(name, build) { SUBS[name] = build; }

// CLOSED sign (fine voxels, 23 wide): hung in a window / on a door. Pivot at its top centre.
sub('closed', (d) => {
  const p = d.part({ pivot: [0, 0, 0] });
  const W = 13, H = 8;
  for (let x = -W; x <= W - 1; x++) for (let y = -H; y <= -1; y++) {
    const edge = x === -W || x === W - 1 || y === -H || y === -1;
    p.f.set(x, y, 0, edge ? RED_D : RED);
    p.f.set(x, y, -1, RED_D);
  }
  ctext(p.f, 'CLOSED', 0, -2, 1, WHITE);
  // string to the nail
  p.f.set(-6, 0, 0, ROPE); p.f.set(-4, 1, 0, ROPE); p.f.set(-2, 2, 0, ROPE); p.f.set(0, 3, 0, BRASS);
  p.f.set(5, 0, 0, ROPE); p.f.set(3, 1, 0, ROPE); p.f.set(1, 2, 0, ROPE);
});

// ================================================================ TICKET BOOTH (1x1)
// Striped kiosk with a big window, a "TIX" board, a turnstile and a red velvet rope.
function rs_ticket(d, rnd, v) {
  const { c, f } = d;
  const [A, B] = AWN[v];
  // stone step + plank floor
  c.box(-5, 0, -5, 3, 0, 2, (x, y, z) => toneOf(STONE, x, y, z));
  // booth body (coarse) x -4..2, z -4..1, y 1..11: cream walls, striped skirt
  for (let x = -4; x <= 2; x++)
    for (let z = -4; z <= 1; z++)
      for (let y = 1; y <= 11; y++) {
        const wall = x === -4 || x === 2 || z === -4 || z === 1;
        if (!wall) continue;
        const corner = (x === -4 || x === 2) && (z === -4 || z === 1);
        let col = corner ? WOOD_D : y <= 3 ? stripe(x + z + 10, A, B, 1) : y === 4 ? WOOD_M : CREAM;
        if (y === 11) col = WOOD_M;
        c.set(x, y, z, col);
      }
  // window on the front (z = 1): x -3..1, y 5..9 open, dark inside
  for (let x = -3; x <= 1; x++) for (let y = 5; y <= 9; y++) c.set(x, y, 1, null);
  c.box(-3, 1, -3, 1, 10, -3, 0x4a3428); // back wall inside (dark)
  c.box(-3, 1, -2, 1, 1, 0, WOOD_M); // inside floor
  // counter shelf + window frame (fine)
  f.box(-7, 10, 3, 3, 10, 5, HONEY[2]); f.box(-7, 9, 3, 3, 9, 4, WOOD_M);
  for (const x of [-7, 3]) f.box(x, 11, 3, x, 19, 3, WOOD_D);
  f.box(-7, 20, 3, 3, 20, 3, WOOD_D);
  // ticket roll, a brass bell, the cash box on the counter
  f.box(-6, 11, 4, -5, 12, 4, RED); f.set(-6, 11, 5, PAPER); f.set(-6, 10, 6, PAPER);
  f.set(1, 11, 4, BRASS); f.set(1, 12, 4, BRASS_L); f.set(2, 11, 4, BRASS_D);
  f.box(-3, 11, 3, -1, 12, 4, 0x3a6a3a); f.set(-2, 12, 5, BRASS);
  // price plate under the window: a coin and a "6"
  f.box(-5, 13, 2, 1, 15, 2, PAPER);
  f.box(-4, 14, 3, -3, 14, 3, GOLD); f.set(-4, 15, 3, GOLD_L);
  pix(f, ['###', '#..', '###', '#.#', '###'], -1, 16, 3, { '#': INK });
  // turnstile post (fine) on the right, front corner
  f.box(6, 0, 3, 7, 10, 4, METAL_D); f.box(6, 11, 3, 7, 11, 4, CHROME);
  // red velvet rope between two brass posts (front left)
  for (const [x, z] of [[-9, 5], [-9, 9]]) { f.box(x, 0, z, x, 9, z, BRASS); f.set(x, 10, z, BRASS_L); f.set(x, 0, z, BRASS_D); }
  for (let z = 6; z <= 8; z++) f.set(-9, z === 7 ? 6 : 7, z, 0xa8203a);
  tufts(c, rnd, 6, { w: 1, d: 1 }, (x, z) => x >= -5 && x <= 3 && z >= -5 && z <= 2);
  d.seat(-0.12, 0.78, PI, 0, { pose: 'stand' });
}
sub('rs_ticket_roof', (d, rnd, v) => {
  const p = d.part({ pivot: [-0.1, 1.2, -0.15] });
  const [A, B] = AWN[v || 0];
  // stepped striped roof (coarse), overhanging
  for (let k = 0; k < 4; k++) {
    const x0 = -5 + k, x1 = 3 - k, z0 = -5 + k, z1 = 2 - k;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const rim = x === x0 || x === x1 || z === z0 || z === z1;
      if (!rim && k < 3) continue;
      p.c.set(x, 12 + k, z, stripe(x + 10, A, B, 1));
    }
  }
  // scalloped valance along the front (fine)
  for (let x = -10; x <= 7; x++) p.f.set(x, 23, 6, stripe(Math.floor((x + 10) / 2), A, B, 1));
  for (let x = -10; x <= 7; x += 2) p.f.set(x, 22, 6, A);
  // gold ball finial
  p.f.box(-2, 32, -2, -1, 33, -1, GOLD); p.f.set(-2, 34, -2, GOLD_L);
});
sub('rs_ticket_sign', (d) => {
  const p = d.part({ pivot: [-0.1, 1.35, 0.25] });
  // "TIX" board on the roof front
  for (let x = -6; x <= 3; x++) for (let y = 25; y <= 31; y++) { p.f.set(x, y, 6, x === -6 || x === 3 || y === 25 || y === 31 ? WOOD_D : 0xf6e6b8); p.f.set(x, y, 5, WOOD_D); }
  ctext(p.f, 'TIX', -1, 30, 7, RED_D);
  p.f.set(-6, 32, 6, GOLD); p.f.set(3, 32, 6, GOLD);
});
sub('rs_ticket_turnstile', (d) => {
  const p = d.part({ pivot: [fw(6.5, 0, 3.5)[0], 0.5, fw(6.5, 0, 3.5)[2]] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    for (let r = 1; r <= 6; r++) p.f.set(6.5 + Math.cos(a) * r, 9, 3.5 + Math.sin(a) * r, r === 6 ? RED : CHROME);
  }
  p.f.set(6, 9, 3, BRASS); p.f.set(7, 9, 4, BRASS);
});
sub('rs_ticket_clerk', (d) => {
  const p = d.part({ pivot: [-0.05, 0.6, 0.0] });
  beaverBust(p.f, -1, 11, 1, { visor: 0x3aa060 });
});

// ================================================================ RESTROOM (1x1)
// "Bear Necessities": a mint outhouse with a moon on the door and a paper roll.
function rs_restroom(d, rnd, v) {
  const { c, f } = d;
  const PAINT = [[0x9ad8b8, 0x7ab898], [0xf0c8d8, 0xd8a8b8], [0xf6e2a0, 0xdcc480]][v];
  c.box(-4, 0, -4, 3, 0, 2, (x, y, z) => toneOf(STONE, x, y, z));
  for (let x = -3; x <= 2; x++)
    for (let z = -3; z <= 1; z++)
      for (let y = 1; y <= 12; y++) {
        if (x > -3 && x < 2 && z > -3 && z < 1) continue;
        const corner = (x === -3 || x === 2) && (z === -3 || z === 1);
        c.set(x, y, z, corner ? WHITE : (x + z) % 2 ? PAINT[0] : PAINT[1]);
      }
  c.box(-2, 1, -2, 1, 1, 0, WOOD_M);
  // door frame (fine) on the front z = 2 (fine 4)
  f.box(-5, 2, 4, -5, 23, 4, WHITE); f.box(4, 2, 4, 4, 23, 4, WHITE); f.box(-5, 24, 4, 4, 24, 4, WHITE);
  // toilet paper roll on the right wall
  f.box(6, 12, 0, 6, 12, 3, METAL_D);
  for (let y = 10; y <= 13; y++) for (let z = 0; z <= 3; z++) if (!(y === 13 && (z === 0 || z === 3))) f.set(7, y, z, y === 10 ? 0xe8e4dc : WHITE);
  f.set(7, 9, 2, WHITE); f.set(7, 8, 2, WHITE); f.set(7, 7, 3, 0xf0ece4);
  // vent pipe through the roof
  f.box(-5, 26, -5, -4, 34, -4, METAL_D); f.box(-6, 35, -6, -3, 35, -3, METAL);
  // hand-wash barrel with a tap
  for (let y = 0; y <= 7; y++) for (let x = -10; x <= -7; x++) for (let z = 4; z <= 7; z++) {
    const r = Math.hypot(x + 8.5, z - 5.5);
    if (r <= 2) f.set(x, y, z, y === 2 || y === 6 ? IRON : toneOf(WOOD, x, y, z));
  }
  f.box(-9, 8, 5, -8, 8, 6, WATER[0]);
  f.box(-8, 9, 7, -8, 9, 8, CHROME);
  // potted fern by the door
  f.box(6, 0, 6, 8, 3, 8, 0xb8603a); f.box(6, 4, 6, 8, 4, 8, 0x5a3a20);
  for (const [x, y, z] of [[7, 5, 7], [6, 6, 7], [8, 6, 6], [7, 7, 8], [5, 7, 7], [9, 7, 7], [7, 8, 7]]) f.set(x, y, z, pick(rnd, LEAF));
  tufts(c, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 3 && z >= -4 && z <= 2);
  d.seat(-0.05, 0.62, PI, 0, { pose: 'hide' });
}
sub('rs_restroom_roof', (d) => {
  const p = d.part({ pivot: [-0.05, 1.3, -0.1] });
  // single slope, high at the back, dark shingles
  for (let z = -5; z <= 3; z++) for (let x = -4; x <= 3; x++) {
    const y = 13 + Math.floor((3 - z) / 3);
    p.c.set(x, y, z, (x + z) % 3 === 0 ? 0x5a4a5a : (x === -4 || x === 3) ? 0x3a2e3a : 0x6a5a6a);
  }
});
sub('rs_restroom_door', (d) => {
  // hinge on the left edge of the door
  const p = d.part({ pivot: [fw(-4, 0, 5)[0] - VF * 0.5, 0.1, fw(-4, 0, 5)[2]] });
  for (let x = -4; x <= 3; x++) for (let y = 2; y <= 22; y++) {
    let col = x % 2 ? WOOD[0] : WOOD[2];
    if (y === 4 || y === 20) col = WOOD_D;
    p.f.set(x, y, 5, col);
  }
  // crescent moon cut-out
  for (let x = -2; x <= 2; x++) for (let y = 14; y <= 19; y++) {
    const r1 = Math.hypot(x + 0.2, y - 16.5), r2 = Math.hypot(x - 1.0, y - 17.1);
    if (r1 <= 2.6 && r2 > 2.0) p.f.set(x, y, 5, 0x2a1a14);
  }
  p.f.set(2, 11, 6, BRASS); p.f.set(2, 10, 6, BRASS_D);
  // the "LOO" plate
  for (let x = -4; x <= 3; x++) for (let y = 21; y <= 23; y++) p.f.set(x, y, 6, 0xf6eedc);
  ctext(p.f, 'LOO', 0, 23, 7, NAVY);
});

// ================================================================ PARK BENCH (2x1)
// Green slatted bench on curly cast-iron legs, a little bin at the end.
function rs_bench(d, rnd, v) {
  const { f } = d;
  const SLAT = [[0x3a8a4a, 0x2a7a3a, 0x4a9a5a], [0xb8743a, 0xa8642a, 0xc8844a], [0x3a6aa0, 0x2a5a90, 0x4a7ab0]][v];
  // iron legs (fine) at x -14, -1, 12: S-curl sides
  for (const x0 of [-14, 12]) {
    for (let y = 0; y <= 8; y++) { f.set(x0, y, 2, IRON); f.set(x0, y, -3, IRON); }
    f.box(x0, 8, -3, x0, 8, 3, IRON);
    for (let y = 9; y <= 18; y++) f.set(x0, y, -4 - (y > 14 ? 1 : 0), IRON);
    f.set(x0, 4, 3, IRON); f.set(x0, 5, 4, IRON); f.set(x0, 6, 4, IRON); f.set(x0, 7, 3, IRON); // front curl
    f.box(x0, 0, -4, x0, 0, 3, IRON_L);
  }
  // seat slats (along x), backrest slats
  for (const z of [-3, -1, 1]) f.box(-16, 9, z, 15, 9, z + 1, (x) => toneOf(SLAT, x, 9, z));
  for (const y of [12, 15, 18]) f.box(-16, y, -5, 15, y + 1, -5, (x) => toneOf(SLAT, x, y, -5));
  // brass plaque on the backrest
  f.box(-2, 13, -4, 1, 13, -4, BRASS);
  // bin at the right end
  for (let y = 0; y <= 9; y++) for (let x = 16; x <= 19; x++) for (let z = 2; z <= 5; z++) {
    if (y > 0 && x > 16 && x < 19 && z > 2 && z < 5) continue;
    f.set(x, y, z, y === 9 ? METAL : (x + z) % 2 ? METAL_D : 0x5a6470);
  }
  f.set(17, 9, 3, PAPER); f.set(18, 10, 4, 0xd84a3a);
  // a dropped newspaper and pigeons' crumbs
  f.box(-8, 10, 0, -5, 10, 1, (x) => (x % 2 ? 0xe8e4d8 : 0xd0ccc0));
  ftufts(f, rnd, 14, { w: 2, d: 1 }, (x, z) => z >= -6 && z <= 4 && x >= -17 && x <= 19);
  d.seat(-0.42, -0.02, 0, 0.47, { pose: 'sit' });
  d.seat(0.42, -0.02, 0, 0.47, { pose: 'sit' });
}

// ================================================================ INFO BOARD (1x1)
// A little roofed map board: the pond, dotted paths, a red YOU ARE HERE.
function rs_infoboard(d, rnd) {
  const { c, f } = d;
  for (const x of [-8, 7]) { f.box(x, 0, -1, x + 1, 26, 0, (xx, y) => toneOf(WOOD, xx, y, 0)); }
  // board frame (fine) x -9..8, y 10..25, at z 1
  for (let x = -9; x <= 8; x++) for (let y = 10; y <= 25; y++) {
    const edge = x <= -8 || x >= 7 || y <= 11 || y >= 24;
    f.set(x, y, 1, edge ? WOOD_D : 0xf2e2b4);
    f.set(x, y, 0, WOOD_D);
  }
  // the map: pond blob, island, paths, buildings, the X
  for (let x = -6; x <= 5; x++) for (let y = 12; y <= 23; y++) {
    const r = Math.hypot((x + 1) / 3.6, (y - 17) / 2.8);
    if (r <= 1) f.set(x, y, 2, r < 0.6 ? WATER[2] : WATER[0]);
  }
  f.set(-1, 17, 3, LEAF[1]);
  for (const [x, y] of [[-6, 22], [-4, 22], [-2, 22], [0, 21], [2, 21], [4, 20], [4, 18], [4, 16], [3, 14], [1, 13], [-1, 13]]) f.set(x, y, 2, 0x9a6a3a);
  for (const [x, y] of [[-5, 13], [-6, 14]]) f.set(x, y, 2, RED);
  f.box(4, 22, 2, 5, 23, 2, CEDAR[0]); f.box(-6, 19, 2, -5, 20, 2, TEAL[0]);
  f.set(-4, 13, 3, RED_D); f.set(-6, 13, 3, RED_D); f.set(-5, 14, 3, RED_D); f.set(-4, 15, 3, RED_D); f.set(-6, 15, 3, RED_D);
  // little roof
  for (let x = -10; x <= 9; x++) { f.set(x, 27, 0, 0x7a3a2a); f.set(x, 27, 1, 0x8a4a3a); f.set(x, 27, -1, 0x8a4a3a); f.set(x, 26, 2, 0x6a2a1a); f.set(x, 26, -2, 0x6a2a1a); }
  // a leaflet box on the post
  f.box(-12, 9, -1, -10, 13, 1, CEDAR[0]); f.box(-12, 14, -1, -10, 14, 1, CEDAR_D); f.set(-11, 13, 1, PAPER); f.set(-11, 14, 1, PAPER);
  tufts(c, rnd, 7, { w: 1, d: 1 }, (x, z) => z >= -2 && z <= 1 && x >= -5 && x <= 4);
  d.seat(0.0, 0.62, PI, 0, { pose: 'stand' });
  d.seat(-0.36, 0.7, PI - 0.3, 0, { pose: 'stand' });
}

// ================================================================ BEACH UMBRELLA (1x1)
// A striped parasol over a deck chair, a side table with a fizzy drink.
function rs_umbrella(d, rnd, v) {
  const { f } = d;
  const [A, B] = AWN[v];
  // sand patch
  for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) if (Math.hypot((x + 0.5) / 9.6, (z + 0.5) / 9.6) <= 1) f.set(x, 0, z, toneOf([0xecd8a8, 0xe0c890, 0xf4e4bc], x, 0, z));
  // pole
  f.box(-6, 1, -6, -6, 34, -6, WHITE);
  // deck chair (fine): frame + striped canvas, reclining toward -z
  const CAN = (k) => stripe(k, A, 0xf6f2ea, 2);
  for (const x of [-3, 6]) { f.line(x, 1, 7, x, 9, -1, WOOD_M); f.line(x, 1, -3, x, 5, 4, WOOD_M); f.line(x, 6, -2, x, 16, -7, WOOD_M); }
  for (let x = -2; x <= 5; x++) {
    for (let k = 0; k <= 8; k++) f.set(x, 7 + Math.round(k * 0.0), 6 - k, CAN(x + 10));
    for (let k = 0; k <= 9; k++) f.set(x, 8 + k, -2 - Math.round(k * 0.55), CAN(x + 10));
  }
  // side table + drink with a straw + a paper umbrella
  f.box(7, 0, 4, 7, 6, 4, WOOD_D); f.box(6, 7, 3, 9, 7, 6, WOOD_M);
  f.box(7, 8, 4, 8, 10, 5, 0xf08a3a); f.set(8, 11, 5, WHITE); f.set(8, 12, 6, WHITE);
  // flip flops
  f.box(-9, 1, 5, -8, 1, 8, 0x3a8ae8); f.box(-6, 1, 6, -5, 1, 9, 0x3a8ae8);
  d.seat(0.1, 0.12, 0, 0.36, { pose: 'sit' });
}
sub('rs_umbrella_top', (d, rnd, v) => {
  const p = d.part({ pivot: [fw(-6, 34, -6)[0], 1.72, fw(-6, 34, -6)[2]], anim: 'sway', axis: 'z', amp: 0.03, speed: 1.3 });
  const [A, B] = AWN[v || 0];
  const cx = -5.5, cz = -5.5;
  for (let x = -22; x <= 11; x++) for (let z = -22; z <= 11; z++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz, r = Math.hypot(dx, dz);
    if (r > 15.5) continue;
    const a = Math.atan2(dz, dx), seg = Math.floor(((a + PI) / TAU) * 8) % 2;
    const y = 34 + Math.round((15.5 - r) * 0.42);
    p.f.set(x, y, z, seg ? A : B);
    if (r > 14.5 && (Math.floor(((a + PI) / TAU) * 32) % 2)) p.f.set(x, y - 1, z, seg ? A : B);
  }
  p.f.box(-6, 41, -6, -5, 42, -5, GOLD);
});

// ================================================================ ICE CREAM CART (1x1)
// A pink cart on bicycle wheels, three tubs under a glass lid, a striped canopy.
function rs_icecream(d, rnd, v) {
  const { f } = d;
  const BODY = [[0xf8b0c8, 0xe890b0], [0xa8e0f0, 0x88c8e0], [0xf8e0a0, 0xe8c880]][v];
  // wheels (fine) on the left and right sides (edge-on from the front)
  for (const x of [-10, 8]) {
    for (let a = 0; a < 40; a++) { const t = (a / 40) * TAU; f.set(x, Math.round(4 + Math.sin(t) * 4), Math.round(-0.5 + Math.cos(t) * 4), IRON); }
    for (let k = 0; k < 4; k++) { const t = (k / 4) * PI; for (let r = 0; r <= 3; r++) { f.set(x, Math.round(4 + Math.sin(t) * r), Math.round(-0.5 + Math.cos(t) * r), METAL); f.set(x, Math.round(4 - Math.sin(t) * r), Math.round(-0.5 - Math.cos(t) * r), METAL); } }
    f.set(x + (x < 0 ? 1 : -1), 4, -1, METAL_D); f.set(x + (x < 0 ? 1 : -1), 4, 0, METAL_D);
  }
  // cart box
  for (let x = -8; x <= 6; x++) for (let y = 6; y <= 15; y++) for (let z = -5; z <= 4; z++) {
    const edge = x === -8 || x === 6 || z === -5 || z === 4;
    if (!edge && y < 15) continue;
    f.set(x, y, z, y === 15 ? WHITE : y === 6 || y === 14 ? BODY[1] : BODY[0]);
  }
  // scoop tubs on top (three flavours)
  const FL = [0xf8a8c8, 0xa8e8c8, 0x8a5a3a];
  for (let k = 0; k < 3; k++) for (let x = -6 + k * 4; x <= -4 + k * 4; x++) for (let z = -2; z <= 1; z++) f.set(x, 16, z, FL[k]);
  for (let k = 0; k < 3; k++) { f.set(-5 + k * 4, 17, -1, FL[k]); f.set(-5 + k * 4, 17, 0, shade(FL[k], 1.08)); }
  // a big cone sign on the front
  for (let y = 9; y <= 12; y++) for (let x = Math.round(-4 - (y - 9) * 0.5); x <= Math.round(-4 + (y - 9) * 0.5); x++) f.set(x, y, 5, (x + y) % 2 ? 0xd8a050 : 0xc88a40);
  for (const [x, y] of [[-5, 13], [-4, 13], [-3, 13], [-4, 14], [-5, 14], [-3, 14], [-4, 15]]) f.set(x, y, 5, 0xf8a8c8);
  ctext(f, 'ICE', 3, 13, 5, 0x8a3a5a);
  // handle bar and a bell
  f.box(7, 13, -4, 9, 13, -4, CHROME); f.box(7, 13, 3, 9, 13, 3, CHROME); f.box(9, 13, -4, 9, 13, 3, 0x2a2a2a);
  f.set(9, 14, -1, BRASS_L); f.set(9, 14, 0, BRASS);
  // canopy poles
  for (const [x, z] of [[-8, -5], [6, -5]]) f.box(x, 16, z, x, 30, z, CHROME);
  tufts(d.c, rnd, 4, { w: 1, d: 1 }, (x, z) => x >= -5 && x <= 4 && z >= -4 && z <= 3);
  d.seat(0.0, 0.72, PI, 0, { pose: 'stand' });
  d.seat(-0.42, 0.66, PI - 0.25, 0, { pose: 'stand' });
}
sub('rs_icecream_top', (d, rnd, v) => {
  const p = d.part({ pivot: [-0.05, 1.5, -0.25], anim: 'sway', axis: 'x', amp: 0.02, speed: 1.1 });
  const [A] = AWN[v || 0];
  for (let x = -11; x <= 9; x++) for (let z = -9; z <= 2; z++) {
    const y = 31 + Math.round((2 - Math.abs(z + 3.5) * 0.3));
    p.f.set(x, y, z, stripe(x + 12, A, 0xf6f2ea, 2));
  }
  for (let x = -11; x <= 9; x += 2) p.f.set(x, 30, 2, A);
});

// ================================================================ SOUVENIR STAND (1x1)
// A market stall: foam fish hats, mugs, "I SURVIVED" shirts, pennants on a string.
function rs_souvenir(d, rnd, v) {
  const { c, f } = d;
  const [A] = AWN[(v + 1) % 3];
  // counter + back shelves (coarse)
  c.box(-5, 0, -5, 4, 0, 3, (x, y, z) => toneOf(STONE, x, y, z));
  c.box(-4, 1, 0, 3, 4, 1, (x, y, z) => (y === 4 ? HONEY[2] : toneOf(WOOD, x, y, z)));
  for (const x of [-5, 4]) c.box(x, 1, -4, x, 13, -4, WOOD_D);
  for (const x of [-5, 4]) c.box(x, 1, 1, x, 13, 1, WOOD_D);
  c.box(-4, 1, -5, 3, 12, -5, (x, y) => (y % 4 === 0 ? WOOD_M : 0x6a4a34));
  for (const y of [4, 8]) c.box(-4, y, -4, 3, y, -3, HONEY[1]);
  // foam fish hats on the shelves (fine), mugs, folded shirts
  for (let k = 0; k < 4; k++) {
    const x0 = -8 + k * 4, y0 = 17;
    pix(f, ['.###..#', '#o#####', '.###..#'], x0, y0 + 2, -6, { '#': k % 2 ? 0xf2c230 : 0xf08a3a, o: INK });
  }
  for (let k = 0; k < 4; k++) { const x = -7 + k * 4; f.box(x, 10, -7, x + 1, 12, -6, k % 2 ? WHITE : 0x5ab0e8); f.set(x + 2, 11, -6, k % 2 ? WHITE : 0x5ab0e8); }
  // counter goods: a tray of postcards, a rack with a shirt hanging on the front
  f.box(-7, 10, 0, -3, 10, 2, (x) => (x % 2 ? 0xf6eedc : 0xa8d8f0));
  f.box(1, 10, 0, 4, 12, 1, 0xd84a3a); f.box(2, 13, 0, 3, 13, 1, 0xd84a3a);
  // shirt on the front of the counter: "I <3 FISH"
  for (let x = -6; x <= 3; x++) for (let y = 1; y <= 7; y++) if (!(y >= 6 && x >= -3 && x <= 0)) f.set(x, y, 4, WHITE);
  f.box(-8, 5, 4, -7, 7, 4, WHITE); f.box(4, 5, 4, 5, 7, 4, WHITE);
  pix(f, ['#.#.#', '#.###', '#..#.'], -5, 5, 5, { '#': 0xd84a5a });
  // pennant string across the front
  for (let x = -10; x <= 9; x++) {
    const y = 26 - Math.round(Math.sin(((x + 10) / 19) * PI) * 2);
    f.set(x, y, 3, ROPE);
    if ((x + 10) % 4 === 1) { const col = [0xd84a3a, 0xf2c230, 0x3a8ae8, 0x4aa85a][(((x + 10) / 4) | 0) % 4]; f.set(x, y - 1, 3, col); f.set(x + 1, y - 1, 3, col); f.set(x, y - 2, 3, col); f.set(x + 1, y - 2, 3, col); f.set(x, y - 3, 3, col); }
  }
  tufts(c, rnd, 4, { w: 1, d: 1 }, (x, z) => z >= -5 && z <= 3);
  d.seat(0.0, 0.72, PI, 0, { pose: 'stand' });
  d.seat(-0.4, 0.68, PI - 0.25, 0, { pose: 'stand' });
}
sub('rs_souvenir_roof', (d, rnd, v) => {
  const p = d.part({ pivot: [0.0, 1.3, -0.2] });
  const [A] = AWN[((v || 0) + 1) % 3];
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 3; z++) p.c.set(x, 14 + Math.round((-z - 1) * 0.2), z, stripe(x + 10, A, 0xf6f2ea, 1));
  for (let x = -12; x <= 11; x++) if (x % 2 === 0) p.f.set(x, 26, 7, A);
  // "GIFTS" board
  for (let x = -7; x <= 6; x++) for (let y = 31; y <= 37; y++) p.f.set(x, y, -3, x === -7 || x === 6 || y === 31 || y === 37 ? WOOD_D : 0xf6e6b8);
  ctext(p.f, 'GIFTS', 0, 36, -2, RED_D);
});

// ================================================================ PHOTO BOOTH (1x1)
// A tall red booth, a curtain, a flash bulb on top, PHOTO in lights.
function rs_photo(d, rnd, v) {
  const { c, f } = d;
  const BODY = [[0xc8303a, 0xa8202a], [0x3a5ab0, 0x2a4a90], [0x2a8a6a, 0x1a6a4a]][v];
  c.box(-4, 0, -4, 3, 0, 2, (x, y, z) => toneOf(STONE, x, y, z));
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 1; z++) for (let y = 1; y <= 17; y++) {
    if (x > -4 && x < 3 && z > -4 && z < 1) continue;
    let col = (x === -4 || x === 3) && (z === -4 || z === 1) ? GOLD : y === 17 || y === 1 ? BODY[1] : BODY[0];
    c.set(x, y, z, col);
  }
  // doorway on the front left (curtain covers it), photo slot on the right
  for (let x = -3; x <= 0; x++) for (let y = 2; y <= 13; y++) c.set(x, y, 1, null);
  c.box(-3, 1, -3, 0, 13, -3, 0x2a1a2a); c.box(-3, 1, -2, 0, 1, 0, 0x2a1a2a);
  f.box(3, 10, 3, 6, 10, 3, 0x1a1a1a); // slot
  f.box(2, 11, 3, 7, 13, 3, GOLD);
  // a sample strip in a frame
  for (let y = 16; y <= 25; y++) for (let x = 3; x <= 6; x++) f.set(x, y, 3, y % 3 === 0 ? WHITE : (x === 3 || x === 6) ? WHITE : 0x8ab8e8);
  for (const y of [17, 20, 23]) { f.set(4, y + 1, 4, 0x8a5a38); f.set(5, y + 1, 4, 0x8a5a38); }
  // "PHOTO" marquee on top with bulbs
  for (let x = -11; x <= 10; x++) for (let y = 35; y <= 43; y++) { f.set(x, y, 3, x === -11 || x === 10 || y === 35 || y === 43 ? GOLD : 0x2a1a2a); f.set(x, y, 2, BODY[1]); }
  for (let x = -10; x <= 9; x += 3) d.gf.set(x, 43, 4, 0xfff0a0);
  f.box(7, 43, 3, 7, 44, 3, METAL_D); // flash stalk
  // sit stool inside
  f.box(-5, 2, -4, -2, 6, -1, 0x6a4a3a);
  tufts(c, rnd, 4, { w: 1, d: 1 }, (x, z) => z >= -4 && z <= 2);
  d.seat(-0.15, 0.62, PI, 0, { pose: 'hide' });
}
sub('rs_photo_sign', (d) => {
  const p = d.part({ pivot: [0, 2, 0.2] });
  const G = new VoxelModel();
  ctext(G, 'PHOTO', 0, 41, 4, 1);
  for (const [k] of G.vox) { const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512; p.gf.set(x, y, 4, 0xfff4b0); }
});
sub('rs_photo_flash', (d) => {
  const p = d.part({ pivot: [fw(7, 46, 3)[0], fw(7, 46, 3)[1], fw(7, 46, 3)[2]] });
  p.gf.box(6, 45, 3, 8, 47, 4, 0xffffff); p.gf.set(7, 46, 5, 0xfffff0);
  p.gf.set(5, 46, 4, 0xfff4c0); p.gf.set(9, 46, 4, 0xfff4c0); p.gf.set(7, 48, 4, 0xfff4c0);
});
sub('rs_photo_curtain', (d, rnd, v) => {
  const p = d.part({ pivot: [fw(-7, 27, 3)[0], fw(-7, 27, 3)[1], fw(-7, 27, 3)[2]] });
  const CUR = [0x8a1a3a, 0xf2c230, 0xd84a3a][v || 0];
  for (let x = -7; x <= 1; x++) for (let y = 4; y <= 27; y++) p.f.set(x, y, 3 + ((x + 7) % 3 === 1 ? 1 : 0), (x + 7) % 3 === 1 ? shade(CUR, 1.15) : CUR);
  p.f.box(-8, 28, 3, 2, 28, 3, GOLD);
});

// ================================================================ CAMPFIRE PIT (2x2)
// Stone ring, crossed logs, flames, four log seats, a bag of marshmallows.
function rs_campfire(d, rnd, v) {
  const { c, f } = d;
  // ash + stone ring (coarse) round the centre
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r <= 2.2) c.set(x, 0, z, (x + z) % 2 ? 0x4a4440 : 0x3a3430);
    else if (r <= 3.7) { c.set(x, 0, z, toneOf(STONE, x, 0, z)); if (r > 2.9) c.set(x, 1, z, toneOf(STONE, x, 1, z, 3)); }
  }
  // crossed logs (fine) in the middle
  log(f, 'x', -6, 5, 1.5, 0.5, 1.4, { s: 1 });
  log(f, 'z', -6, 5, -0.5, 2.5, 1.4, { s: 2 });
  for (const [x, z] of [[-2, -1], [1, 1], [-1, 2], [2, -2]]) f.set(x, 3, z, 0xff7a20);
  // four log seats (coarse logs) on the sides
  log(c, 'x', -4, 3, 1, -7.5, 1.4, { s: 3 }); // back
  log(c, 'x', -4, 3, 1, 6.5, 1.4, { s: 4 }); // front
  log(c, 'z', -4, 3, -7.5, 1, 1.4, { s: 5 }); // left (axis z: u = x, w = y)
  log(c, 'z', -4, 3, 6.5, 1, 1.4, { s: 6 });
  // marshmallow bag, a kettle on a stone, sticks leaning on a log
  f.box(14, 0, 14, 17, 5, 16, 0xf6f2ea); f.box(14, 6, 15, 17, 6, 15, 0x5ab0e8); f.set(15, 4, 17, 0xf8c8d8); f.set(16, 3, 17, 0x5ab0e8);
  f.box(-17, 0, 14, -14, 2, 17, (x, y, z) => toneOf(STONE, x, y, z));
  f.box(-17, 3, 14, -14, 6, 17, IRON); f.box(-16, 7, 15, -15, 7, 16, IRON_L); f.line(-13, 6, 15, -12, 7, 15, IRON);
  for (let k = 0; k < 3; k++) f.line(10 + k * 2, 2, -14, 13 + k * 2, 14, -18, WOOD_L);
  ftufts(f, rnd, 30, { w: 2, d: 2 }, (x, z) => Math.hypot(x + 0.5, z + 0.5) < 15 || (Math.abs(x) < 9 && Math.abs(z) > 10) || (Math.abs(z) < 9 && Math.abs(x) > 10));
  // seats (sit on the logs, facing the fire)
  d.seat(0.05, -0.74, 0, 0.12, { pose: 'sit' });
  d.seat(0.05, 0.66, PI, 0.12, { pose: 'sit' });
  d.seat(-0.74, 0.05, PI / 2, 0.12, { pose: 'sit' });
  d.seat(0.66, 0.05, -PI / 2, 0.12, { pose: 'sit' });
}
sub('rs_campfire_fire', (d) => {
  // flames (glow, flickering) + embers
  const p = d.part({ pivot: [0, 0.15, 0], anim: 'flicker', speed: 7 });
  for (let y = 4; y <= 14; y++) {
    const r = 3.6 * (1 - (y - 4) / 12);
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
      const dd = Math.hypot(x + 0.5, z + 0.5);
      if (dd > r || hv(x, y, z, 7) < 0.25) continue;
      p.gf.set(x, y, z, y > 10 ? FLAME[0] : dd < r * 0.45 ? FLAME[0] : y > 7 ? FLAME[1] : FLAME[2]);
    }
  }
  const q = d.part({ pivot: [0.02, 0.5, 0.01], anim: 'float', period: 1.6, rise: 0.6, wiggle: 0.05 });
  q.gf.set(0, 10, 0, 0xffd060);
  const q2 = d.part({ pivot: [-0.08, 0.5, 0.05], anim: 'float', period: 2.1, phase: 0.9, rise: 0.7, wiggle: 0.06 });
  q2.gf.set(-2, 10, 1, 0xffa040);
});

// ================================================================ FIRST-AID TENT (2x2)
// White canvas tent with red crosses, two cots inside, a medicine chest.
function rs_firstaid(d, rnd) {
  const { c, f } = d;
  c.box(-10, 0, -10, 9, 0, 8, (x, y, z) => ((x + z) % 2 ? 0xc8b88a : 0xb8a87a));
  // two cots (fine) along z: frame + white sheet + pillow at the back
  for (const cx of [-10, 9]) {
    for (const [dx, dz] of [[-4, -15], [3, -15], [-4, 11], [3, 11]]) f.box(cx + dx, 0, dz, cx + dx, 6, dz, METAL_D);
    f.box(cx - 4, 7, -15, cx + 3, 7, 11, 0x6a8a5a);
    f.box(cx - 4, 8, -15, cx + 3, 8, 11, (x, y, z) => ((x + z) % 4 === 0 ? 0xe8eef4 : WHITE));
    rbox(f, cx - 3, cx + 2, 9, 10, -15, -12, 0.8, 0xf4f8ff);
    f.box(cx - 4, 9, 7, cx + 3, 9, 11, 0x6a9ad8); // folded blanket at the foot
  }
  // medicine chest + bandage rolls between the cots, at the back
  f.box(-2, 0, -17, 1, 7, -13, WHITE); f.box(-1, 4, -12, 0, 5, -12, RED); f.set(-1, 6, -12, RED); f.set(0, 3, -12, RED);
  f.box(-2, 8, -16, -1, 9, -15, 0xf6f2ea); f.box(1, 8, -16, 1, 9, -15, 0xf6f2ea);
  // a red-cross flag on a pole by the entrance
  f.box(18, 0, 16, 18, 38, 16, METAL); f.box(19, 32, 16, 25, 37, 16, WHITE); f.box(21, 33, 16, 23, 36, 16, RED); f.box(20, 34, 16, 24, 35, 16, RED);
  ftufts(f, rnd, 12, { w: 2, d: 2 }, (x, z) => z > 16 || x > 17 || x < -18);
  d.seat(-0.48, 0.62, PI, 0.42, { pose: 'lie' });
  d.seat(0.48, 0.62, PI, 0.42, { pose: 'lie' });
}
sub('rs_firstaid_roof', (d) => {
  const p = d.part({ pivot: [0, 0.8, -0.1] });
  const CAN = [0xf4f0e6, 0xe8e4d8];
  // A-frame canvas: ridge along z (front to back), slopes down to low side walls, open front
  for (let k = 0; k <= 20; k++) {
    const y = 34 - Math.round(k * 1.2);
    for (const x of [-k - 1, k]) for (let z = -19; z <= 15; z++) { p.f.set(x, y, z, CAN[k % 5 === 0 ? 1 : 0]); p.f.set(x, y + 1, z, CAN[k % 5 === 0 ? 1 : 0]); }
  }
  for (const x of [-21, 20]) for (let y = 1; y <= 10; y++) for (let z = -19; z <= 15; z++) p.f.set(x, y, z, CAN[1]);
  // closed back wall
  for (let k = 0; k <= 20; k++) for (let y = 1; y <= 35 - Math.round(k * 1.2); y++) { p.f.set(-k - 1, y, -19, CAN[1]); p.f.set(k, y, -19, CAN[1]); }
  // red crosses on both slopes (seen from above)
  for (const side of [-1, 1]) {
    for (let k = 9; k <= 10; k++) for (let z = -9; z <= 3; z++) p.f.set(side < 0 ? -k - 1 : k, 35 - Math.round(k * 1.2) + 1, z, RED);
    for (let k = 6; k <= 13; k++) for (let z = -4; z <= -2; z++) p.f.set(side < 0 ? -k - 1 : k, 35 - Math.round(k * 1.2) + 1, z, RED);
  }
  // front flaps tied back + a cross badge over the door
  for (let y = 4; y <= 28; y++) for (const x of [-20 + Math.floor((28 - y) / 4), 19 - Math.floor((28 - y) / 4)]) p.f.set(x, y, 16, CAN[1]);
  for (const x of [-17, 16]) p.f.set(x, 14, 17, RED_D);
  p.f.box(-3, 27, 16, 2, 32, 16, WHITE); p.f.box(-1, 27, 17, 0, 32, 17, RED); p.f.box(-3, 29, 17, 2, 30, 17, RED);
  // guy ropes to pegs
  for (const z of [-17, 13]) { p.f.line(-21, 10, z, -24, 0, z, ROPE); p.f.line(20, 10, z, 23, 0, z, ROPE); }
});

// ================================================================ TOWEL ROOM (1x1)
// A cabana hatch full of stacked fluffy towels, one drying on a line.
function rs_towels(d, rnd, v) {
  const { c, f } = d;
  const WALL = [[0xf6e6c8, 0xe8d4b0], [0xd8eef6, 0xc0dce8], [0xf8dce4, 0xe8c4d0]][v];
  c.box(-5, 0, -5, 4, 0, 2, (x, y, z) => toneOf(STONE, x, y, z));
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 1; z++) for (let y = 1; y <= 12; y++) {
    if (x > -4 && x < 3 && z > -4 && z < 1) continue;
    c.set(x, y, z, (x === -4 || x === 3) && (z === -4 || z === 1) ? WOOD_D : y % 3 === 0 ? WALL[1] : WALL[0]);
  }
  // service hatch x -3..2, y 4..10 on the front, counter + shelves of towels inside
  for (let x = -3; x <= 2; x++) for (let y = 4; y <= 10; y++) c.set(x, y, 1, null);
  c.box(-3, 1, -3, 2, 11, -3, 0x5a4434);
  c.box(-3, 4, 1, 2, 4, 2, HONEY[2]);
  for (const y of [11, 15, 19]) f.box(-6, y, -5, 5, y, -3, WOOD_M);
  for (let s = 0; s < 3; s++) for (let k = 0; k < 4; k++) {
    const [col] = TOWELS[(s * 4 + k + v) % TOWELS.length];
    const x0 = -6 + k * 3, y0 = 12 + s * 4;
    f.box(x0, y0, -5, x0 + 2, y0 + 2, -3, (x, y) => (y === y0 + 1 ? WHITE : col));
  }
  // a folded towel waiting on the counter
  f.box(-2, 10, 3, 1, 11, 4, TOWELS[1][0]); f.box(-2, 11, 3, 1, 11, 4, (x) => (x % 2 ? TOWELS[1][0] : WHITE));
  // "TOWEL" plate above the hatch
  for (let x = -9; x <= 9; x++) for (let y = 22; y <= 26; y++) f.set(x, y, 3, x === -9 || x === 9 || y === 22 || y === 26 ? WOOD_D : 0xf6eedc);
  ctext(f, 'TOWEL', 0, 26, 4, NAVY);
  // laundry basket
  for (let x = 6; x <= 9; x++) for (let z = 4; z <= 8; z++) for (let y = 0; y <= 4; y++) if (x === 6 || x === 9 || z === 4 || z === 8 || y === 0) f.set(x, y, z, (x + y + z) % 2 ? 0xd8b880 : 0xc8a870);
  f.box(7, 4, 5, 8, 5, 7, TOWELS[3][0]);
  tufts(c, rnd, 4, { w: 1, d: 1 }, (x, z) => z >= -5 && z <= 2);
  d.seat(-0.05, 0.7, PI, 0, { pose: 'stand' });
  d.seat(0.38, 0.66, PI + 0.25, 0, { pose: 'stand' });
}
sub('rs_towels_roof', (d) => {
  const p = d.part({ pivot: [0, 1.3, -0.15] });
  for (let k = 0; k < 3; k++) for (let x = -5 + k; x <= 4 - k; x++) for (let z = -5; z <= 2; z++) p.c.set(x, 13 + k, z, (x + z + k) % 2 ? 0x3a7a9a : 0x2a6a8a);
});
sub('rs_towels_line', (d, rnd, v) => {
  // a towel drying on a line between the hut and a post (sways)
  const p = d.part({ pivot: [fw(10, 24, 6)[0], fw(10, 24, 6)[1], fw(10, 24, 6)[2]], anim: 'sway', axis: 'x', amp: 0.12, speed: 2.3 });
  const [col] = TOWELS[((v || 0) + 2) % TOWELS.length];
  for (let x = 7; x <= 12; x++) for (let y = 15; y <= 24; y++) p.f.set(x, y, 6, y === 18 || y === 21 ? WHITE : col);
  for (let x = 7; x <= 12; x += 5) p.f.set(x, 24, 7, 0xd8c8a0);
});

// ================================================================ CHANGING HUTS (2x1)
// Two striped beach huts with numbered doors and a row of lockers between.
function rs_lockers(d, rnd, v) {
  const { c, f } = d;
  const STR = [[0x3a8ae8, 0xf6f2ea], [0xd84a3a, 0xf6f2ea], [0x4aa85a, 0xf6f2ea], [0xf2c230, 0xf6f2ea]];
  c.box(-10, 0, -5, 9, 0, 2, (x, y, z) => ((x + z) % 2 ? 0xd8c8a0 : 0xc8b890));
  for (let h = 0; h < 2; h++) {
    const [A, B] = STR[(h + v) % 4];
    const x0 = h ? 3 : -9, x1 = x0 + 5;
    for (let x = x0; x <= x1; x++) for (let z = -4; z <= 1; z++) for (let y = 1; y <= 12; y++) {
      if (x > x0 && x < x1 && z > -4 && z < 1) continue;
      c.set(x, y, z, stripe(x - x0 + (z === -4 || z === 1 ? 0 : z), A, B, 1));
    }
    c.box(x0 + 1, 1, -3, x1 - 1, 1, 0, WOOD_M);
    for (let x = x0 + 2; x <= x0 + 3; x++) for (let y = 1; y <= 9; y++) c.set(x, y, 1, null); // doorway (the door swings over it)
    c.box(x0 + 1, 2, -3, x1 - 1, 9, -3, 0x3a3440);
    // peaked roof
    for (let k = 0; k <= 3; k++) for (let x = x0 - 1 + k; x <= x1 + 1 - k; x++) for (let z = -5; z <= 2; z++) if (k === 3 || x === x0 - 1 + k || x === x1 + 1 - k) c.set(x, 13 + k, z, (x + z) % 2 ? shade(A, 0.8) : shade(A, 0.7));
    // number plate
    const nx = (x0 + x1 + 1) * 2 / 2;
    f.box(nx - 2, 21, 4, nx + 1, 24, 4, WHITE);
    pix(f, h ? ['###', '..#', '###', '#..', '###'] : ['.#', '##', '.#', '.#', '.#'], nx - 1, 25 - 1, 5, { '#': NAVY });
  }
  // lockers between the huts
  for (let x = -5; x <= 4; x++) for (let y = 0; y <= 16; y++) f.set(x, y, -6, x === -5 || x === 4 || y === 8 || y === 16 ? METAL_D : 0x8ab0c8);
  for (let x = -4; x <= 3; x++) for (let y = 0; y <= 16; y++) if (x === -1 || x === 0) f.set(x, y, -5, METAL_D);
  for (const [x, y] of [[-3, 12], [2, 12], [-3, 4], [2, 4]]) f.set(x, y, -5, BRASS);
  // flip flops and a beach ball
  ball(f, 0.5, 2.5, 6.5, 2.4, (x, y, z, dx, dy) => (dy > 1 ? WHITE : dx > 0.6 ? 0xd84a3a : dx < -0.6 ? 0x3a8ae8 : 0xf2c230));
  tufts(c, rnd, 5, { w: 2, d: 1 }, (x, z) => z >= -5 && z <= 2);
  d.seat(-0.65, 0.62, PI, 0, { pose: 'hide' });
  d.seat(0.55, 0.62, PI, 0, { pose: 'hide' });
}
function hutDoor(d, h, v) {
  const STR = [[0x3a8ae8, 0xf6f2ea], [0xd84a3a, 0xf6f2ea], [0x4aa85a, 0xf6f2ea], [0xf2c230, 0xf6f2ea]];
  const x0 = (h ? 3 : -9) * 2 + 3, x1 = x0 + 5; // fine
  const p = d.part({ pivot: [x0 * VF, 0.1, 4 * VF] });
  const [A] = STR[(h + (v || 0)) % 4];
  for (let x = x0; x <= x1; x++) for (let y = 2; y <= 20; y++) p.f.set(x, y, 4, y === 2 || y === 20 ? shade(A, 0.75) : (x === x0 || x === x1) ? shade(A, 0.85) : 0xf6f2ea);
  p.f.set(x1 - 1, 11, 5, BRASS);
  for (let x = x0 + 1; x <= x1 - 1; x++) p.f.set(x, 16, 5, A);
}
sub('rs_lockers_door0', (d, rnd, v) => hutDoor(d, 0, v));
sub('rs_lockers_door1', (d, rnd, v) => hutDoor(d, 1, v));

// ================================================================ HOT TUB (2x2)
// A round cedar tub with iron bands, steps, bubbling water, a rubber duck.
const TUB_R = 17, TUB_IN = 15, TUB_TOP = 12, TUB_WATER = 11;
function rs_hottub(d, rnd, v) {
  const { c, f } = d;
  // deck boards under the tub (coarse)
  c.box(-10, 0, -10, 9, 0, 9, (x, y, z) => ((x + 40) % 3 === 0 ? WOOD_D : toneOf(HONEY, x, 0, z)));
  // staves + bands (fine)
  for (let x = -TUB_R - 1; x <= TUB_R; x++) for (let z = -TUB_R - 1; z <= TUB_R; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > TUB_R + 0.3) continue;
    const a = Math.atan2(z + 0.5, x + 0.5), stave = Math.floor(((a + PI) / TAU) * 36);
    for (let y = 2; y <= TUB_TOP; y++) {
      if (r < TUB_IN - 0.2) { if (y === 2) f.set(x, y, z, CEDAR_D); continue; }
      let col = r > TUB_R - 1.2 ? (stave % 2 ? CEDAR[0] : CEDAR[2]) : CEDAR[1];
      if ((y === 4 || y === 9) && r > TUB_R - 1.2) col = (stave % 3 === 0) ? IRON_L : IRON;
      if (y === TUB_TOP) col = r > TUB_R - 1 ? CEDAR_D : CEDAR_L;
      f.set(x, y, z, col);
    }
  }
  // steps at the front
  for (let k = 0; k < 2; k++) f.box(-6, 2 + k * 3 - 2, TUB_R + 2 - k * 2, 5, 2 + k * 3, TUB_R + 3 - k * 2, (x) => toneOf(HONEY, x, k, 0));
  // folded towels on a stool + a rubber duck waiting on the rim
  f.box(13, 0, 15, 17, 6, 18, WOOD_M); f.box(13, 7, 15, 17, 8, 18, TOWELS[0][0]); f.box(13, 9, 15, 17, 9, 18, (x) => (x % 2 ? WHITE : TOWELS[1][0]));
  // a little control box and a hose
  f.box(-19, 0, 10, -17, 5, 13, METAL_D); f.set(-18, 4, 14, 0x6ae86a); f.set(-18, 3, 14, RED);
  // heater stove pipe at the back with a tiny glow
  f.box(-3, 0, -20, 2, 7, -18, IRON); f.box(-2, 8, -20, 1, 9, -18, IRON_L); d.gf.set(0, 3, -17, 0xff8a3a); d.gf.set(-1, 3, -17, 0xffb84a);
  ftufts(f, rnd, 16, { w: 2, d: 2 }, (x, z) => Math.hypot(x + 0.5, z + 0.5) < TUB_R + 2 || z > 15);
  // seats inside (sit low: the water covers up to the chest)
  for (const [x, z, yaw] of [[0, -0.48, 0], [0, 0.46, PI], [-0.48, 0, PI / 2], [0.46, 0, -PI / 2]]) d.seat(x, z, yaw, 0.12, { pose: 'tub' });
}
sub('rs_hottub_water', (d) => {
  const p = d.part({ pivot: [0, TUB_WATER * VF, 0] });
  for (let x = -TUB_IN; x <= TUB_IN; x++) for (let z = -TUB_IN; z <= TUB_IN; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > TUB_IN - 0.2) continue;
    const ring = Math.floor(r * 0.8 + hv(x, 0, z) * 1.2) % 3;
    p.f.set(x, TUB_WATER, z, r > TUB_IN - 1.5 ? WATER_L : ring === 0 ? WATER[1] : ring === 1 ? WATER[0] : WATER[2]);
  }
  // bubbles popping (glint) and a bobbing duck
  const bubbles = [[-6, -3], [4, 6], [8, -7], [-9, 8], [1, -10], [-2, 2], [10, 2]];
  bubbles.forEach(([x, z], i) => {
    const b = d.part({ pivot: fw(x, TUB_WATER + 1, z), anim: 'glint', period: 0.9 + (i % 3) * 0.35, phase: i * 0.37 });
    b.f.set(x, TUB_WATER + 1, z, WHITE); b.f.set(x + 1, TUB_WATER + 1, z, 0xd8f4ff); b.f.set(x, TUB_WATER + 1, z + 1, 0xd8f4ff);
  });
  const duck = d.part({ pivot: fw(7, TUB_WATER + 1, -4), anim: 'bob', amp: 0.012, speed: 2.2 });
  duck.f.box(6, TUB_WATER + 1, -5, 9, TUB_WATER + 2, -3, 0xf8d030); duck.f.box(8, TUB_WATER + 3, -5, 9, TUB_WATER + 4, -4, 0xf8d030);
  duck.f.set(10, TUB_WATER + 3, -5, 0xf08a2a); duck.f.set(9, TUB_WATER + 4, -3, INK);
  // steam puffs rising
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7, x = Math.round(Math.cos(a) * 8), z = Math.round(Math.sin(a) * 8);
    const s = d.part({ pivot: fw(x, TUB_WATER + 3, z), anim: 'float', period: 2.6 + i * 0.4, phase: i * 0.8, rise: 0.75, wiggle: 0.06 });
    s.f.box(x - 1, TUB_WATER + 3, z - 1, x + 1, TUB_WATER + 4, z, STEAM); s.f.set(x, TUB_WATER + 5, z, STEAM);
  }
});

// ================================================================ SAUNA (2x1)
// A little cedar log cabin: steaming chimney, glowing window, bucket bench.
function rs_sauna(d, rnd, v) {
  const { c, f } = d;
  c.box(-10, 0, -5, 9, 0, 3, (x, y, z) => toneOf(STONE, x, y, z));
  // log walls (coarse) x -9..6, z -4..1, y 1..11: horizontal logs, crossed corners
  for (let y = 1; y <= 11; y++) for (let x = -9; x <= 6; x++) for (let z = -4; z <= 1; z++) {
    const wall = x === -9 || x === 6 || z === -4 || z === 1;
    if (!wall) continue;
    const corner = (x === -9 || x === 6) && (z === -4 || z === 1);
    c.set(x, y, z, corner ? LOG_END : y % 2 ? CEDAR[0] : CEDAR[2]);
  }
  for (const [x, z] of [[-10, -4], [-10, 1], [7, -4], [7, 1], [-9, -5], [6, -5], [-9, 2], [6, 2]]) for (let y = 1; y <= 11; y += 2) c.set(x, y, z, LOG_RING);
  c.box(-8, 1, -3, 5, 1, 0, CEDAR_D);
  // doorway (the door swings over it) + window with a warm glow
  for (let x = -6; x <= -4; x++) for (let y = 1; y <= 8; y++) c.set(x, y, 1, null);
  c.box(-6, 2, -3, -4, 9, -3, 0x5a2a1a);
  for (let x = 1; x <= 3; x++) for (let y = 5; y <= 7; y++) c.set(x, y, 1, null);
  for (let x = 2; x <= 7; x++) for (let y = 10; y <= 15; y++) d.gf.set(x, y, 2, (x + y) % 3 ? 0xffb050 : 0xffd080);
  f.box(1, 9, 4, 8, 9, 4, CEDAR_D); f.box(1, 16, 4, 8, 16, 4, CEDAR_D); f.box(4, 10, 4, 5, 15, 4, CEDAR_D);
  // thermometer: red line well past "HOT"
  f.box(10, 8, 4, 10, 17, 4, WHITE); f.box(10, 8, 5, 10, 16, 5, RED); f.set(10, 7, 5, RED_D);
  // bench outside with a bucket + ladle and a water barrel
  f.box(10, 0, 6, 10, 5, 6, WOOD_D); f.box(17, 0, 6, 17, 5, 6, WOOD_D); f.box(9, 6, 5, 18, 6, 8, CEDAR[0]);
  for (let y = 7; y <= 10; y++) for (let x = 11; x <= 14; x++) for (let z = 5; z <= 8; z++) if (x === 11 || x === 14 || z === 5 || z === 8 || y === 7) f.set(x, y, z, y === 9 ? IRON : CEDAR[2]);
  f.box(12, 10, 6, 13, 10, 7, WATER[0]); f.line(13, 10, 7, 16, 14, 8, WOOD_M);
  for (let y = 0; y <= 9; y++) for (let x = -19; x <= -15; x++) for (let z = 4; z <= 8; z++) if (Math.hypot(x + 16.5, z - 6.5) <= 2.4) f.set(x, y, z, y === 3 || y === 7 ? IRON : toneOf(CEDAR, x, y, z));
  f.box(-18, 10, 5, -16, 10, 7, WATER[1]);
  tufts(c, rnd, 6, { w: 2, d: 1 }, (x, z) => z >= -5 && z <= 2 && x >= -10 && x <= 7);
  d.seat(-0.5, 0.62, PI, 0, { pose: 'hide' });
  d.seat(-0.2, 0.68, PI, 0, { pose: 'hide' });
  d.seat(-0.8, 0.68, PI, 0, { pose: 'hide' });
}
sub('rs_sauna_roof', (d) => {
  const p = d.part({ pivot: [-0.15, 1.2, -0.15] });
  // gable roof, ridge along x
  for (let k = 0; k <= 4; k++) for (let x = -11; x <= 8; x++) for (const z of [-6 + k, 3 - k]) p.c.set(x, 12 + k, z, (x + k) % 3 === 0 ? 0x5a3a2a : (x === -11 || x === 8) ? 0x4a2a1a : 0x6a4a34);
  for (let x = -11; x <= 8; x++) { p.c.set(x, 16, -1, 0x4a2a1a); p.c.set(x, 16, -2, 0x4a2a1a); }
  // gable ends
  for (let k = 0; k <= 3; k++) for (let z = -5 + k; z <= 2 - k; z++) { p.c.set(-9, 12 + k, z, CEDAR[1]); p.c.set(6, 12 + k, z, CEDAR[1]); }
  // chimney pipe
  p.f.box(6, 30, -6, 7, 40, -5, IRON); p.f.box(5, 41, -7, 8, 41, -4, IRON_L);
});
sub('rs_sauna_steam', (d) => {
  for (let i = 0; i < 3; i++) {
    const s = d.part({ pivot: fw(6, 43, -6), anim: 'float', period: 2.2 + i * 0.5, phase: i * 0.75, rise: 0.9, wiggle: 0.08 });
    s.f.box(5, 43 + i, -7, 7, 45 + i, -5, STEAM);
  }
});
sub('rs_sauna_door', (d) => {
  const x0 = -12;
  const p = d.part({ pivot: [x0 * VF, 0.1, 4 * VF] });
  for (let x = x0; x <= x0 + 5; x++) for (let y = 2; y <= 17; y++) p.f.set(x, y, 4, (x === x0 || x === x0 + 5 || y === 2 || y === 17) ? CEDAR_D : x % 2 ? CEDAR[0] : CEDAR[1]);
  for (let x = x0 + 1; x <= x0 + 4; x++) for (let y = 12; y <= 15; y++) p.f.set(x, y, 4, 0xf8c070);
  p.f.set(x0 + 4, 9, 5, BRASS); p.f.set(x0 + 4, 8, 5, BRASS);
});

// ================================================================ SPA ROOM (2x2)
// A teal pavilion: two massage tables with towels, candles, river stones,
// bamboo, a robe on a hook and a bowl of cucumbers. Open to the front.
function rs_spa(d, rnd, v) {
  const { c, f } = d;
  const WALLC = [[0x9ad8d0, 0x7ac0b8], [0xf0d8e4, 0xd8c0cc], [0xe8e0c8, 0xd0c8b0]][v];
  // pale deck floor (coarse)
  c.box(-10, 0, -10, 9, 0, 9, (x, y, z) => ((z + 40) % 3 === 0 ? 0xc8a878 : (x + z) % 2 ? 0xe0c898 : 0xd8c090));
  // back wall + side walls (coarse), half-height windows on the sides
  for (let y = 1; y <= 13; y++) {
    for (let x = -10; x <= 9; x++) c.set(x, y, -10, y === 13 ? WHITE : y % 4 === 0 ? WALLC[1] : WALLC[0]);
    for (let z = -10; z <= 5; z++) for (const x of [-10, 9]) {
      const win = y >= 6 && y <= 10 && z >= -6 && z <= 1;
      c.set(x, y, z, win ? null : y === 13 ? WHITE : WALLC[0]);
    }
  }
  for (const x of [-10, 9]) for (let z = -6; z <= 1; z++) { c.set(x, 5, z, WHITE); c.set(x, 11, z, WHITE); }
  // two columns at the front corners
  for (const x of [-10, 9]) for (let y = 1; y <= 13; y++) c.set(x, y, 8, y % 4 === 0 ? 0xe8e4dc : WHITE);
  // massage tables (fine) along z at x = -10 and 9: legs, padded top, towel, face hole at the back end
  for (const cx of [-10, 9]) {
    for (const [dx, dz] of [[-4, -13], [3, -13], [-4, 10], [3, 10]]) f.box(cx + dx, 0, dz, cx + dx, 6, dz, WOOD_M);
    f.box(cx - 5, 7, -14, cx + 4, 8, 11, (x, y) => (y === 8 ? 0xf6f2ea : 0xe0d8c8));
    f.box(cx - 5, 9, -6, cx + 4, 9, 6, (x, y, z) => ((z + 40) % 4 === 0 ? 0x9ad8d0 : WHITE)); // towel
    f.set(cx - 1, 8, -12, 0x8a7a6a); f.set(cx, 8, -12, 0x8a7a6a);
  }
  // back shelf: candles (flicker), stacked river stones, a bowl of cucumbers + jug
  f.box(-6, 14, -18, 5, 14, -17, WOOD_M);
  for (const x of [-5, 3]) { f.box(x, 15, -18, x + 1, 17, -17, 0xf8f0e0); }
  for (const x of [-5, 3]) { const fl = d.part({ pivot: fw(x, 18, -18), anim: 'flicker', speed: 9 + x }); fl.gf.set(x, 18, -18, FLAME[1]); fl.gf.set(x, 19, -18, FLAME[0]); }
  for (const [y, w] of [[15, 3], [17, 2], [19, 1]]) f.box(-1 - w, y, -18, w - 1, y + 1, -17, (x) => toneOf([0x6a6a70, 0x7a7a80, 0x5a5a60], x, y, 0));
  f.box(-3, 0, -2, 2, 6, 2, WOOD_D); f.box(-4, 7, -3, 3, 7, 3, WOOD_M);
  rbox(f, -3, 0, 8, 9, -2, 1, 0.8, WHITE); for (const [x, z] of [[-3, -1], [-2, 0], [-1, -1]]) f.set(x, 10, z, 0x5aa83a); f.set(-2, 10, -1, 0xc8f0a0);
  f.box(1, 8, -1, 2, 12, 0, 0xd8f4f8); f.set(1, 10, 1, 0x7ac86a);
  // robe on a hook (left wall, inside)
  f.box(-18, 22, -6, -18, 22, -5, BRASS);
  for (let y = 10; y <= 21; y++) for (let z = -8; z <= -3; z++) if (!(y > 19 && (z === -8 || z === -3))) f.set(-17, y, z, y === 15 ? 0x9ad8d0 : WHITE);
  // bamboo in a pot at the front right
  f.box(14, 0, 13, 17, 4, 16, 0x3a3a40);
  for (const [x, z, h] of [[15, 14, 24], [16, 15, 20], [14, 15, 17]]) { for (let y = 5; y <= h; y++) f.set(x, y, z, y % 5 === 0 ? 0x6a9a3a : 0x8ac04a); f.set(x + 1, h, z, LEAF[3]); f.set(x - 1, h - 2, z, LEAF[0]); }
  // stepping stones out front
  for (const [x, z] of [[-3, 16], [2, 18], [-1, 19]]) f.box(x, 0, z, x + 2, 0, z + 1, (xx, y, zz) => toneOf(STONE, xx, 0, zz));
  // lying seats: feet at the front of each table, head toward the back
  d.seat(-0.48, 0.66, PI, 0.42, { pose: 'lie' });
  d.seat(0.48, 0.66, PI, 0.42, { pose: 'lie' });
}
sub('rs_spa_roof', (d, rnd, v) => {
  const p = d.part({ pivot: [0, 1.4, -0.1] });
  const T = [[0x2a7a78, 0x3a8a88], [0xb85a7a, 0xc86a8a], [0x8a6a3a, 0x9a7a4a]][v || 0];
  for (let x = -11; x <= 10; x++) for (let z = -11; z <= 9; z++) {
    const rim = x === -11 || x === 10 || z === -11 || z === 9;
    p.c.set(x, 14, z, rim ? WHITE : (x + z) % 2 ? T[0] : T[1]);
    if (!rim && Math.abs(x + 0.5) < 6 && Math.abs(z + 1) < 5) p.c.set(x, 15, z, T[0]);
  }
});
sub('rs_spa_sign', (d) => {
  const p = d.part({ pivot: [0, 1.55, 0.95] });
  for (let x = -10; x <= 9; x++) for (let y = 30; y <= 38; y++) p.f.set(x, y, 19, x === -10 || x === 9 || y === 30 || y === 38 ? GOLD : 0xf6f2ea);
  ctext(p.f, 'SPA', 0, 36, 20, TEAL_D);
  // a lotus on each side
  for (const s of [-1, 1]) { const x = s * 7; p.f.set(x, 33, 20, 0xf08ab0); p.f.set(x - 1, 34, 20, 0xf8b0c8); p.f.set(x + 1, 34, 20, 0xf8b0c8); p.f.set(x, 35, 20, 0xf8b0c8); }
});

// ================================================================ MASSAGE CHAIR (1x1)
// A padded red recliner on a chrome base, a coin box and a remote.
function rs_massagechair(d, rnd, v) {
  const { f } = d;
  const PAD = [[0xc8303a, 0xa8202a, 0xe04a4a], [0x2a2a30, 0x1a1a20, 0x3a3a44], [0x5a3a8a, 0x4a2a7a, 0x6a4a9a]][v];
  f.box(-7, 0, -6, 6, 3, 6, (x, y) => (y === 3 ? CHROME : 0x3a3a40));
  // seat cushion, leg rest, reclined back
  rbox(f, -6, 5, 4, 8, -5, 5, 1.2, (x, y, z) => (y === 8 && (x + z) % 4 === 0 ? PAD[2] : PAD[0]));
  for (let k = 0; k <= 6; k++) f.box(-6, 4 - Math.round(k * 0.3), 6 + k, 5, 7 - Math.round(k * 0.3), 6 + k, k % 3 === 0 ? PAD[1] : PAD[0]);
  for (let k = 0; k <= 12; k++) f.box(-6, 9 + k, -5 - Math.round(k * 0.45), 5, 9 + k, -3 - Math.round(k * 0.45), (x) => (k % 3 === 0 ? PAD[1] : x === -6 || x === 5 ? PAD[1] : PAD[0]));
  rbox(f, -4, 3, 22, 25, -11, -8, 1, PAD[2]); // head pillow
  // armrests with a control pad
  for (const x of [-9, 7]) { f.box(x, 4, -4, x + 1, 11, 4, PAD[1]); f.box(x, 12, -4, x + 1, 12, 4, 0x2a2a30); }
  f.box(7, 13, 2, 8, 13, 3, 0x2a2a30); f.set(7, 14, 3, 0x6ae86a); f.set(8, 14, 2, 0xe86a6a);
  // coin box on a pole
  f.box(10, 0, -2, 10, 12, -2, METAL_D); f.box(9, 13, -3, 12, 17, -1, BRASS); f.box(10, 15, 0, 11, 15, 0, 0x1a1a1a);
  pix(f, ['#.#', '#.#', '###', '..#', '..#'], 10, 17, 0, { '#': INK });
  tufts(d.c, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 3 && z >= -4 && z <= 4);
  d.seat(-0.03, 0.05, 0, 0.38, { pose: 'sit' });
}

// ================================================================ composition
const FOOTPRINTS = { rs_bench: { w: 2, d: 1 }, rs_campfire: { w: 2, d: 2 }, rs_firstaid: { w: 2, d: 2 }, rs_lockers: { w: 2, d: 1 }, rs_hottub: { w: 2, d: 2 }, rs_sauna: { w: 2, d: 1 }, rs_spa: { w: 2, d: 2 } };
const BASES = defineModels({
  rs_ticket, rs_restroom, rs_bench, rs_infoboard, rs_umbrella, rs_icecream, rs_souvenir, rs_photo,
  rs_campfire, rs_firstaid, rs_towels, rs_lockers, rs_hottub, rs_sauna, rs_spa, rs_massagechair,
}, FOOTPRINTS);
const SUBM = defineModels(SUBS);

// per type: named sub-models, where the CLOSED sign hangs (local units, + scale),
// the service point (queue starts there, queue runs along +z) and staff work spots
const LAYOUT = {
  rs_ticket: { parts: { roof: 'rs_ticket_roof', sign: 'rs_ticket_sign', turnstile: 'rs_ticket_turnstile', clerk: 'rs_ticket_clerk' }, closed: [-0.1, 0.92, 0.3, 0.55], front: [-0.12, 0.85], work: [[-0.1, -0.05, 0]] },
  rs_restroom: { parts: { roof: 'rs_restroom_roof', door: 'rs_restroom_door' }, closed: [0, 1.0, 0.33, 0.45], front: [-0.05, 0.75] },
  rs_bench: { parts: {}, front: [0, 0.6] },
  rs_infoboard: { parts: {}, front: [0, 0.8] },
  rs_umbrella: { parts: { top: 'rs_umbrella_top' }, front: [0.1, 0.75] },
  rs_icecream: { parts: { top: 'rs_icecream_top' }, closed: [0, 0.68, 0.32, 0.5], front: [0, 0.82], work: [[0, -0.5, 0]] },
  rs_souvenir: { parts: { roof: 'rs_souvenir_roof' }, closed: [0, 0.78, 0.3, 0.5], front: [0, 0.82], work: [[0, -0.2, 0]] },
  rs_photo: { parts: { sign: 'rs_photo_sign', flash: 'rs_photo_flash', curtain: 'rs_photo_curtain' }, closed: [-0.1, 1.2, 0.3, 0.45], front: [-0.15, 0.75] },
  rs_campfire: { parts: { fire: 'rs_campfire_fire' }, front: [0, 1.15] },
  rs_firstaid: { parts: { roof: 'rs_firstaid_roof' }, closed: [0, 1.45, 0.9, 0.6], front: [0, 1.2], work: [[0, -0.35, 0]] },
  rs_towels: { parts: { roof: 'rs_towels_roof', line: 'rs_towels_line' }, closed: [0, 0.98, 0.25, 0.5], front: [-0.05, 0.82], work: [[0, -0.15, 0]] },
  rs_lockers: { parts: { roof: null, door: 'rs_lockers_door0', door2: 'rs_lockers_door1' }, closed: [0, 1.25, 0.3, 0.55], front: [0, 0.75] },
  rs_hottub: { parts: { water: 'rs_hottub_water' }, closed: [0, 0.9, 1.0, 0.6], front: [0, 1.25] },
  rs_sauna: { parts: { roof: 'rs_sauna_roof', steam: 'rs_sauna_steam', door: 'rs_sauna_door' }, closed: [-0.25, 1.0, 0.3, 0.5], front: [-0.5, 0.75] },
  rs_spa: { parts: { roof: 'rs_spa_roof', sign: 'rs_spa_sign' }, closed: [0, 1.25, 1.0, 0.6], front: [0, 1.2], work: [[-0.02, 0.55, 0], [-0.02, -0.2, 0]] },
  rs_massagechair: { parts: {}, front: [0, 0.75] },
};

function makeFacility(type, opts = {}) {
  const root = BASES[type](opts);
  const L = LAYOUT[type] || { parts: {} };
  const parts = {};
  const updates = [];
  if (root.userData.update) updates.push(root.userData.update);
  for (const [name, subName] of Object.entries(L.parts || {})) {
    if (!subName || !SUBM[subName]) continue;
    const sr = SUBM[subName]({ variant: opts.variant, seed: opts.seed });
    sr.name = name;
    root.add(sr);
    parts[name] = sr.children[0] || sr;
    parts[name].name = name;
    if (sr.userData.update) updates.push(sr.userData.update);
  }
  if (L.closed && !opts.preview) {
    const cs = SUBM.closed({});
    const [x, y, z, k] = L.closed;
    cs.position.set(x, y, z); cs.scale.setScalar(k);
    cs.visible = false;
    cs.name = 'closed';
    root.add(cs);
    parts.closed = cs;
  }
  // the ticket clerk only shows when nobody is hired for the job (see resort.js)
  root.userData.rs = {
    spots: (root.userData.seats || []).map((s) => ({ ...s })),
    front: L.front || [0, 0.8],
    work: (L.work || []).map(([x, z, yaw]) => ({ x, z, yaw })),
    parts,
  };
  if (updates.length) root.userData.update = (dt, t) => { for (const u of updates) u(dt, t); };
  return root;
}

export const RESORT_TYPES = Object.keys(LAYOUT);
export const STRUCTURE_MODELS = Object.fromEntries(RESORT_TYPES.map((t) => [t, (o) => makeFacility(t, o)]));
