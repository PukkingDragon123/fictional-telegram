// Voxel models for pond decorations and the newer contraptions.
//
// Conventions (same as structureModels.js): one tile = 10 voxels, x/z run
// -5..4 across the tile, y = 0 is the tile's base surface. Land models sit on
// the ground; water models (stones, floatlantern, decoy, fountain, duckweed,
// wildrice) have their origin on the POND FLOOR and use `depth` (voxels from
// the floor to the water surface, default 10).
//
// decorModel(type, { seed, depth }) -> {
//   body:  VoxelModel                       lit, build with { pivot: [0.5, 0, 0.5], scale: 0.1 }
//   glow?: VoxelModel                       emissive bits (unlit), same coordinates + pivot as body
//   parts?: [{
//     model?: VoxelModel,                   lit animated voxels   } at least one of the two.
//     glow?:  VoxelModel,                   unlit animated voxels } Same tile coordinates as body.
//     pivot:  [x, y, z],                    rotation/anim centre in voxel units, tile coordinates
//     anim:   'spin' | 'sway' | 'flicker' | 'bob' | 'wave' | 'rotateY',
//     axis?:  'x' | 'y' | 'z',              spin/sway axis (default 'y' for rotateY, 'z' otherwise)
//     speed?: number,                       radians/s for spin/rotateY, Hz-ish for the rest
//     phase?: number,                       anim time offset (so neighbours don't sync)
//   }]
// }
// Mounting a part: build its model/glow with { pivot: part.pivot, scale: 0.1 }
// and place that mesh at ((pivot[0] - 0.5) * 0.1, pivot[1] * 0.1, (pivot[2] - 0.5) * 0.1)
// inside the body's group, then animate the mesh around its local origin:
//   spin/rotateY: rotation[axis] = time * speed
//   sway:  rotation[axis] = sin(time * speed) * ~0.15
//   wave:  per-frame shear / small rotation.y = sin(time * speed) * ~0.2 (cloth hangs from pivot)
//   bob:   position.y += sin(time * speed) * ~0.03, slight rotation.z wobble
//   flicker: scale.y = 1 + sin/noise * ~0.15 (scale from pivot at the flame base), toggle brightness
import { VoxelModel, shade, mix } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';

export const DECOR_TYPES = [
  'mailbox', 'pinwheel', 'bench', 'birdhouse', 'birdbath', 'gnome', 'arch', 'stringlights',
  'stonelantern', 'campfire', 'flag', 'canoe', 'hockey', 'moose', 'stones', 'floatlantern',
  'decoy', 'fountain', 'lighthouse', 'hatchery', 'sprinkler', 'buglamp',
  // newer nature structures from data/structures.js (also covered here)
  'duckweed', 'reeds', 'fern', 'wildrice', 'mushrooms', 'bughotel',
];

// Types whose origin is the pond floor (they read `depth`).
export const WATER_DECOR = new Set(['stones', 'floatlantern', 'decoy', 'fountain', 'duckweed', 'wildrice']);

// ---------------------------------------------------------------- palette
const WOOD = [0xa8784a, 0x9a6a40, 0xb48452];
const WOOD_D = 0x6a4424;
const BARK = [0x7a4e2a, 0x8a5a30, 0x6a4424];
const LOG_END = 0xd0a066;
const MAPLE = [0xd89a52, 0xc88a46, 0xe4aa62]; // golden maple wood
const MAPLE_D = 0xa86a36;
const STONE = [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72];
const MOSS = [0x6a9a3a, 0x5a8a34, 0x7aa848];
const LEAF = [0x3f8a3a, 0x4f9c44, 0x2f7034, 0x5aa84a];
const GRASS = [0x6aa040, 0x5a9038, 0x7ab04a];
const RED = 0xd23a2e, RED_D = 0xa82a22, RED_L = 0xe85a46;
const WHITE = 0xf6f2ea;
const METAL = 0x9aa4ac, METAL_D = 0x6a747c;
const BRONZE = [0xb87333, 0xc88a44, 0x9a5a28];
const VERDI = 0x5aa890; // verdigris
const WATER_L = 0x9ad8f0, WATER = 0x5ab4e0, FOAM = 0xeaf8ff;
const WARM = 0xffd070, WARM2 = 0xffb050, FLAME = [0xffe070, 0xffb030, 0xff7a20];

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// a few blades of grass + tiny flowers around a footprint so things feel planted
function tufts(v, rnd, n, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * 10) - 5, z = Math.floor(rnd() * 10) - 5;
    if (avoid(x, z) || v.has(x, 0, z)) continue;
    const h = 1 + Math.floor(rnd() * 2);
    for (let y = 0; y < h; y++) v.set(x, y, z, pick(rnd, GRASS));
    if (rnd() < 0.3) v.set(x, h, z, pick(rnd, [0xffffff, 0xf2c230, 0xd9529b, 0x9a86ea]));
  }
}

// ---------------------------------------------------------------- land decor
function mailbox(rnd) {
  const body = new VoxelModel();
  // post + little stone base with flowers
  for (const [x, z] of [[-1, -2], [0, -2], [-1, -1], [0, -1], [-2, -2], [1, -1], [-1, 0], [0, -3]]) body.set(x, 0, z, pick(rnd, STONE));
  body.box(-1, 1, -2, 0, 7, -1, (x, y) => (y % 3 === 0 ? WOOD[1] : WOOD[0]));
  body.box(-2, 7, -3, 1, 7, 0, WOOD_D); // cross brace
  // box: tunnel shape along z, rounded top
  body.box(-2, 8, -4, 1, 10, 3, (x, y, z) => (z === 3 ? RED_D : y === 8 ? RED_D : RED));
  body.box(-1, 11, -4, 0, 11, 3, RED);
  body.set(-2, 10, -4, null); body.set(1, 10, -4, null); body.set(-2, 10, 3, null); body.set(1, 10, 3, null);
  body.box(-1, 9, 4, 0, 10, 4, RED_D); // door
  body.set(0, 9, 4, 0xe8c040); // latch
  // name plate + letter poking out the back
  body.box(-2, 9, -1, -2, 9, 1, WHITE);
  body.set(-3, 9, 0, 0x2a2a30);
  body.set(-1, 10, -5, 0xf6ead0); body.set(0, 10, -5, 0xf6ead0); body.set(0, 9, -5, 0xe6d8b8);
  // flag (up!) on the +x side
  body.box(2, 9, -1, 2, 13, -1, 0x3a3a40);
  body.box(2, 12, 0, 2, 13, 1, RED_L);
  body.set(2, 13, 2, RED_L);
  // flowers at the base
  for (const [x, z, c] of [[1, 1, 0xd9529b], [-3, 0, 0xf2c230], [2, -2, 0x9a86ea], [-2, 1, 0xffffff]]) {
    body.set(x, 0, z, LEAF[0]); body.set(x, 1, z, LEAF[1]); body.set(x, 2, z, c);
  }
  tufts(body, rnd, 6);
  return { body };
}

function pinwheel(rnd) {
  const body = new VoxelModel();
  for (let y = 0; y <= 12; y++) body.set(0, y, 0, y % 2 ? WHITE : RED);
  body.set(0, 0, 1, 0x5a8a36); body.set(1, 0, 0, 0x5a8a36);
  body.set(0, 13, 1, METAL); // axle
  tufts(body, rnd, 5, (x, z) => Math.abs(x) < 2 && Math.abs(z) < 2);
  // four triangular blades in the x/y plane at z = 2, centred on (0, 13)
  const wheel = new VoxelModel();
  const cols = [0xe84a3a, 0xf2c230, 0x4a8ae0, 0x5ac06a];
  const cy = 13;
  for (let b = 0; b < 4; b++) {
    for (let a = 1; a <= 4; a++)
      for (let k = 0; k < a; k++) {
        // base wedge (a along +x, k up), rotated 90deg per blade
        let u = a, w = k;
        for (let r = 0; r < b; r++) [u, w] = [-w, u];
        const c = k === a - 1 ? shade(cols[b], 1.15) : cols[b];
        wheel.set(u, cy + w, 2, c);
      }
  }
  wheel.set(0, cy, 2, WHITE);
  wheel.set(0, cy, 3, 0xe8c040);
  return { body, parts: [{ model: wheel, pivot: [0.5, cy + 0.5, 2.5], anim: 'spin', axis: 'z', speed: 4 }] };
}

function bench(rnd) {
  const body = new VoxelModel();
  const W = (x, y, z) => MAPLE[(x * 3 + y + z * 7 + 99) % 3];
  // legs: carved curly sides at x = -4 and x = 3
  for (const x of [-4, 3]) {
    body.box(x, 0, -2, x, 3, -2, MAPLE_D);
    body.box(x, 0, 1, x, 3, 1, MAPLE_D);
    body.set(x, 1, -1, MAPLE_D); body.set(x, 1, 0, MAPLE_D); // stretcher
    // armrest
    body.box(x, 6, -2, x, 6, 2, W);
    body.set(x, 5, 1, MAPLE_D); body.set(x, 4, 1, MAPLE_D);
    body.set(x, 6, 2, LOG_END); // scroll end
  }
  // seat slats along x, with gaps
  for (const z of [-2, 0, 1]) body.box(-4, 4, z, 3, 4, z, W);
  body.box(-4, 4, -1, 3, 4, -1, (x) => (x % 2 ? MAPLE[1] : MAPLE[2]));
  // backrest: posts + slats leaning back
  for (const x of [-4, 3]) body.box(x, 5, -3, x, 10, -3, MAPLE_D);
  body.box(-4, 10, -3, 3, 10, -3, W);
  body.box(-3, 7, -3, 2, 7, -3, W);
  for (const x of [-3, -1, 1, 2]) body.box(x, 8, -3, x, 9, -3, x === -1 || x === 1 ? null : MAPLE[1]);
  // carved maple leaf in the middle of the back
  const leaf = [[0, 0], [-1, 1], [0, 1], [1, 1], [0, 2], [-1, 2], [1, 2], [0, 3]];
  for (const [dx, dy] of leaf) body.set(dx, 7 + dy, -2, dx === 0 && dy === 0 ? RED_D : RED);
  // cushion + mug on the seat
  body.box(-3, 5, -1, -1, 5, 1, 0x4a7ab0);
  body.set(-2, 5, 0, 0x5a8ac8);
  body.set(2, 5, 0, WHITE); body.set(2, 6, 0, WHITE); body.set(3, 6, 0, null); body.set(2, 6, 1, 0x6a3a20);
  tufts(body, rnd, 6, (x, z) => x >= -4 && x <= 3 && z >= -3 && z <= 2);
  return { body };
}

function birdhouse(rnd) {
  const body = new VoxelModel();
  body.box(-1, 0, -1, 0, 0, 0, pick(rnd, STONE));
  for (let y = 0; y <= 11; y++) body.set(0, y, 0, BARK[y % 3]);
  body.set(1, 3, 0, LEAF[0]); body.set(-1, 6, 0, LEAF[1]); body.set(0, 8, 1, LEAF[0]); // ivy
  // house
  body.box(-2, 12, -2, 2, 16, 2, (x, y, z) => (y === 12 ? WOOD_D : (x + z) % 2 === 0 ? 0x7ab0c8 : 0x6aa0b8));
  // gable roof along x, peak over z = 0
  for (let i = 0; i <= 3; i++) body.box(-3, 17 + i, -3 + i, 3, 17 + i, 3 - i, (x, y, z) => (z === -3 + i || z === 3 - i ? RED_D : RED));
  body.box(-2, 17, -1, 2, 18, 1, (x, y, z) => (x === -2 || x === 2 ? 0x6aa0b8 : null));
  body.set(0, 21, 0, 0xe8c040);
  // entrance hole + perch on +z face
  body.set(0, 15, 2, 0x1a1210); body.set(0, 14, 2, 0x2a1a10);
  body.set(0, 13, 3, WOOD_D);
  // chickadee on the perch: black cap, white cheek, buff belly
  body.set(1, 13, 3, 0x8a8a90); body.set(1, 14, 3, 0x1a1a1e); body.set(1, 13, 4, 0xe8d8b0);
  body.set(2, 13, 3, 0x6a6a70);
  body.set(1, 14, 4, 0xf6f2ea);
  tufts(body, rnd, 7, (x, z) => Math.abs(x) < 2 && Math.abs(z) < 2);
  return { body };
}

function birdbath(rnd) {
  const body = new VoxelModel();
  body.cylinder(0, 0, 0, 2.6, 1, (x, y, z) => pick(rnd, STONE));
  body.cylinder(0, 1, 0, 1.2, 4, (x, y, z) => (y === 3 ? STONE[3] : STONE[0]));
  body.cylinder(0, 5, 0, 2.2, 1, STONE[2]);
  // basin rim
  body.cylinder(0, 6, 0, 4.4, 2, (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y === 7 && r < 3.3) return WATER;
    if (y === 6 && r < 3.3) return WATER;
    return rnd() < 0.18 ? pick(rnd, MOSS) : pick(rnd, STONE);
  });
  for (const [x, z] of [[-1, 0], [1, 1], [0, -1]]) body.set(x, 7, z, WATER_L);
  body.set(1, 7, -1, FOAM);
  // robin on the rim
  body.set(3, 8, -2, 0x5a4a40); body.set(3, 8, -1, 0xd8602a); body.set(3, 9, -1, 0x3a3030);
  body.set(3, 9, 0, 0xe8a030); body.set(3, 8, -3, 0x4a3a30);
  // blue jay splashing
  body.set(-1, 8, 1, 0x4a7ad0); body.set(-1, 9, 1, 0x5a8ae0); body.set(-1, 8, 2, 0xf0f0f0); body.set(-2, 8, 1, 0x2a4a90);
  body.set(-1, 10, 1, 0x4a7ad0);
  const glow = new VoxelModel();
  // a couple of droplets flying off the jay
  glow.set(-3, 10, 2, FOAM); glow.set(0, 11, 2, FOAM);
  tufts(body, rnd, 6, (x, z) => Math.hypot(x, z) < 3);
  return { body, glow };
}

function gnome(rnd) {
  const body = new VoxelModel();
  const BLUE = 0x3a6ac0, BLUE_D = 0x2a4a90, SKIN = 0xf0b890, BEARD = 0xf6f2ea, HAT = 0xd8322a;
  // little mossy rock it stands on
  body.ellipsoid(0, 0, 0, 3.4, 1, 3, (x, y) => (y > 0 ? pick(rnd, MOSS) : pick(rnd, STONE)));
  // boots
  body.box(-2, 1, 0, -1, 1, 2, 0x4a2a1a); body.box(1, 1, 0, 2, 1, 2, 0x4a2a1a);
  // tunic
  body.ellipsoid(0, 4, 0, 2.6, 2.6, 2.2, (x, y) => (y === 3 ? 0x4a2a1a : y < 3 ? BLUE_D : BLUE));
  body.set(0, 3, 3, 0xe8c040); // buckle
  // arms + a tiny fishing rod
  body.set(-3, 4, 1, BLUE); body.set(-3, 3, 2, SKIN);
  body.set(3, 4, 1, BLUE); body.set(3, 3, 2, SKIN);
  body.line(3, 3, 3, 5, 9, 4, 0x8a5a30);
  body.set(5, 8, 5, 0xd8d8d8); body.set(5, 7, 5, 0xd8322a);
  // head + beard
  body.ellipsoid(0, 8, 0, 2, 1.8, 2, SKIN);
  body.box(-2, 5, 2, 2, 8, 2, (x, y) => (y === 8 && Math.abs(x) === 2 ? SKIN : BEARD));
  body.box(-1, 4, 3, 1, 7, 3, BEARD); body.set(0, 4, 3, 0xe6e0d6);
  body.set(0, 8, 3, 0xe88a7a); // nose
  body.set(-1, 9, 2, 0x1a1a1e); body.set(1, 9, 2, 0x1a1a1e); // eyes
  body.set(-2, 8, 2, 0xf0a0a0); body.set(2, 8, 2, 0xf0a0a0); // rosy cheeks
  // pointy hat (leans back a little)
  const hr = [2.4, 2.1, 1.7, 1.3, 0.9, 0.5];
  hr.forEach((r, i) => body.cylinder(0, 10 + i, -Math.floor(i / 3), r, 1, HAT));
  body.set(0, 16, -2, shade(HAT, 0.85));
  // moose antlers strapped to the hat: brow tine + palm on each side
  for (const s of [-1, 1]) {
    const A = 0xc8a070, AD = 0xa88050;
    body.set(3 * s, 11, 0, AD);
    body.set(4 * s, 12, 0, A);
    body.box(4 * s, 13, -1, 5 * s, 13, 1, A);
    body.box(5 * s, 14, -1, 5 * s, 14, 1, A);
    body.set(5 * s, 15, -1, A); body.set(5 * s, 15, 1, A); body.set(4 * s, 14, 1, AD);
    body.set(4 * s, 13, 2, AD); // brow tine forward
  }
  tufts(body, rnd, 5, (x, z) => Math.hypot(x, z) < 3.5);
  return { body };
}

function arch(rnd) {
  const body = new VoxelModel();
  const TR = 0xf2eee2, TRD = 0xd8d2c2;
  const ROSE = [0xe8344a, 0xf06a8a, 0xd02a3a, 0xf8a0b8];
  // two lattice posts (x = -4 and x = 3), each 2 deep in z
  for (const x of [-4, 3]) {
    for (let y = 0; y <= 13; y++)
      for (const z of [-1, 0]) body.set(x, y, z, (y + z) % 3 === 0 ? TRD : TR);
    body.set(x, 0, -2, 0x8a847c); body.set(x, 0, 1, 0x8a847c);
  }
  // semicircle on top (centre x = -0.5, y = 13), radius 3.5..4
  for (let a = 0; a <= 180; a += 4) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(-0.5 + Math.cos(t) * 3.6), y = Math.round(13 + Math.sin(t) * 3.4);
    body.set(x, y, -1, TR); body.set(x, y, 0, TR);
  }
  // vines + roses climbing all over
  const pts = [...body.vox.keys()].map((k) => [(k & 1023) - 512, ((k >> 10) & 1023) - 512, ((k >> 20) & 1023) - 512]);
  for (const [x, y, z] of pts) {
    if (y === 0) continue;
    const n = rnd();
    if (n < 0.55) {
      const dx = x < -0.5 ? -1 : 1;
      const side = rnd();
      const p = side < 0.4 ? [x, y, z === 0 ? 1 : -2] : side < 0.7 ? [x + (y > 12 ? 0 : dx), y + (y > 12 ? 1 : 0), z] : [x - dx, y, z];
      if (!body.has(p[0], p[1], p[2])) body.set(p[0], p[1], p[2], rnd() < 0.32 ? pick(rnd, ROSE) : pick(rnd, LEAF));
    }
  }
  // drooping tendrils from the arch
  for (const x of [-3, -1, 1, 2]) {
    const y0 = 15 - Math.abs(x + 0.5) * 0.4;
    for (let k = 0; k < 2 + Math.floor(rnd() * 2); k++) body.set(x, Math.round(y0 - 1 - k), 1, k % 2 ? LEAF[3] : LEAF[0]);
  }
  // little stepping path through
  for (const z of [-4, 2, 4]) body.set(-1 + (z % 2), 0, z, pick(rnd, STONE));
  tufts(body, rnd, 6, (x, z) => z > -2 && z < 2);
  return { body };
}

function stringlights(rnd) {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  const posts = [[-4, -3], [3, 2]];
  for (const [x, z] of posts) {
    for (let y = 0; y <= 12; y++) body.set(x, y, z, BARK[(y + x) % 3]);
    body.set(x, 13, z, LOG_END);
    body.set(x + 1, 0, z, pick(rnd, GRASS)); body.set(x, 0, z + 1, pick(rnd, GRASS));
  }
  // sagging wire between the posts + a short loop hanging off each post
  const [a, b] = posts;
  const N = 14;
  const BULBS = [0xffd070, 0xffb860, 0xffe8a0, 0xff9a70, 0xfff0c0];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    const y = 12 - Math.sin(t * Math.PI) * 4;
    body.set(x, y, z, 0x3a3a30);
    if (i % 2 === 1) glow.set(x, y - 1, z, BULBS[(i >> 1) % BULBS.length]);
  }
  for (const [[x, z], dx] of [[a, 1], [b, -1]]) {
    for (let k = 1; k <= 3; k++) body.set(x + dx * k, 12 - Math.round(k * 0.8), z + (dx > 0 ? 2 : -2), 0x3a3a30);
    glow.set(x + dx * 2, 9, z + (dx > 0 ? 2 : -2), BULBS[1]);
  }
  // a lantern-lit picnic blanket below
  body.box(-2, 0, -1, 1, 0, 1, (x, y, z) => ((x + z) % 2 ? 0xd8a040 : 0xf2e2b8));
  body.set(0, 1, 0, 0xa83a2a); // jam jar
  tufts(body, rnd, 5, (x, z) => x >= -2 && x <= 1 && z >= -1 && z <= 1);
  return { body, glow };
}

function stonelantern(rnd) {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  const S = (x, y, z) => (rnd() < 0.2 ? pick(rnd, MOSS) : pick(rnd, STONE));
  body.box(-3, 0, -3, 2, 0, 2, S); // base slab
  body.box(-2, 1, -2, 1, 1, 1, S);
  body.box(-1, 2, -1, 0, 6, 0, S); // pillar
  body.box(-2, 7, -2, 1, 7, 1, S); // platform
  // firebox: corners solid, windows glowing
  body.box(-2, 8, -2, 1, 10, 1, (x, y, z) => {
    const edgeX = x === -2 || x === 1, edgeZ = z === -2 || z === 1;
    if (edgeX && edgeZ) return S();
    if (y === 10) return S();
    return null;
  });
  glow.box(-1, 8, -1, 0, 9, 0, WARM);
  glow.set(-1, 9, -1, 0xfff0b0);
  for (const [x, z] of [[-1, -2], [0, -2], [-1, 1], [0, 1], [-2, -1], [-2, 0], [1, -1], [1, 0]]) { glow.set(x, 9, z, WARM); glow.set(x, 8, z, WARM2); }
  // wide roof with upturned corners
  body.box(-4, 11, -4, 3, 11, 3, (x, y, z) => (Math.abs(x + 0.5) > 3 && Math.abs(z + 0.5) > 3 ? null : S()));
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) body.set(x, 12, z, STONE[2]);
  body.box(-3, 12, -3, 2, 12, 2, (x, y, z) => pick(rnd, MOSS));
  body.box(-1, 13, -1, 0, 13, 0, S);
  body.set(-1, 14, -1, STONE[2]); body.set(0, 14, 0, STONE[2]); body.set(-1, 14, 0, STONE[1]); body.set(0, 14, -1, STONE[1]);
  body.set(0, 15, 0, STONE[0]);
  // ferns + pebbles
  for (const [x, z] of [[3, -1], [-4, 1], [2, 3]]) { body.set(x, 1, z, LEAF[0]); body.set(x + 1, 1, z, LEAF[1]); body.set(x, 2, z, LEAF[3]); }
  tufts(body, rnd, 5, (x, z) => x >= -3 && x <= 2 && z >= -3 && z <= 2);
  return { body, glow };
}

function campfire(rnd) {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  // ash bed + stone ring
  body.cylinder(-0.5, 0, -0.5, 2.2, 1, (x, y, z) => (rnd() < 0.5 ? 0x4a4440 : 0x3a3430));
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180;
    const x = Math.round(-0.5 + Math.cos(t) * 3.3), z = Math.round(-0.5 + Math.sin(t) * 3.3);
    body.set(x, 0, z, pick(rnd, STONE)); body.set(x, 1, z, pick(rnd, STONE));
  }
  // logs in a teepee
  for (const [x0, z0, x1, z1] of [[-3, -1, 0, 0], [2, 0, -1, -1], [0, 2, -1, -1], [-1, -3, 0, 0]]) {
    body.line(x0, 1, z0, x1, 4, z1, BARK[0]);
    body.set(x0, 1, z0, LOG_END);
  }
  glow.box(-2, 1, -2, 1, 1, 1, (x, y, z) => (rnd() < 0.5 ? 0xff6a20 : 0xffa030)); // embers
  // flame (flickers from its base)
  const flame = new VoxelModel();
  flame.box(-2, 2, -2, 1, 2, 1, (x, y, z) => (Math.abs(x + 0.5) + Math.abs(z + 0.5) > 2.5 ? null : FLAME[2]));
  flame.box(-1, 3, -1, 0, 4, 0, (x, y) => (y === 3 ? FLAME[1] : FLAME[0]));
  flame.set(-2, 3, -1, FLAME[2]); flame.set(1, 3, 0, FLAME[2]); flame.set(0, 3, -2, FLAME[1]);
  flame.set(-1, 5, 0, FLAME[0]); flame.set(0, 6, 0, 0xfff4b0); flame.set(-1, 5, -1, FLAME[1]);
  // marshmallow sticks leaning in from the sides
  for (const [x0, z0, x1, z1, toast] of [[4, 3, 1, 1, 0xd8a050], [-5, 3, -2, 1, WHITE]]) {
    body.line(x0, 2, z0, x1, 5, z1, 0x8a5a30);
    body.set(x1 + Math.sign(x1 - x0), 6, z1, toast);
    body.set(x1, 6, z1, WHITE);
  }
  // seating stump + little cup
  body.cylinder(3, 0, -3, 1.2, 2, (x, y, z) => (y === 1 ? LOG_END : BARK[1]));
  body.set(3, 2, -3, 0x4a7ab0);
  tufts(body, rnd, 5, (x, z) => Math.hypot(x + 0.5, z + 0.5) < 4);
  return { body, glow, parts: [{ glow: flame, pivot: [-0.5, 2, -0.5], anim: 'flicker', speed: 9 }] };
}

function flag() {
  const body = new VoxelModel();
  body.box(-5, 0, -1, -3, 0, 1, STONE[1]);
  body.box(-4, 1, 0, -4, 1, 0, STONE[2]);
  for (let y = 1; y <= 22; y++) body.set(-4, y, 0, y % 6 === 0 ? 0xc8c8c8 : 0xe0e0e0);
  body.set(-4, 23, 0, 0xe8c040);
  body.line(-4, 3, 0, -3, 3, 1, 0xd8d0b0); // halyard cleat
  // cloth: 2 red | 6 white with a maple leaf | 2 red, 6 tall
  const cloth = new VoxelModel();
  const leaf = [
    '...#..',
    '#.###.',
    '######',
    '.####.',
    '..##..',
    '..#...',
  ];
  for (let y = 0; y < 6; y++)
    for (let i = 0; i < 10; i++) {
      let c = i < 2 || i > 7 ? 0xd52b1e : 0xf6f4f0;
      if (i >= 2 && i <= 7 && leaf[5 - y][i - 2] === '#') c = 0xd52b1e;
      cloth.set(-3 + i, 16 + y, 0, c);
    }
  return { body, parts: [{ model: cloth, pivot: [-3, 19, 0.5], anim: 'wave', axis: 'y', speed: 3 }] };
}

function canoe(rnd) {
  const body = new VoxelModel();
  const CEDAR = [0xe0ae74, 0xc8945a];
  const GUN = 0x5a3020;
  // slim hull along x (-5..4): keel row y0, red sides y1, dark gunwale y2;
  // bow + stern narrow to a point and sweep up
  const HW = [0, 1, 1, 2, 2, 2, 2, 1, 1, 0]; // half-width per x (-5..4)
  for (let x = -5; x <= 4; x++) {
    const hw = HW[x + 5];
    const end = hw <= 1;
    const y0 = x === -5 || x === 4 ? 1 : 0;
    for (let z = -hw; z <= hw; z++) {
      const side = Math.abs(z) === hw;
      // keel / bottom
      body.set(x, y0, z, side ? RED_D : end ? RED_D : CEDAR[(x + 10) % 2]);
      if (side || end) {
        body.set(x, y0 + 1, z, RED);
        body.set(x, y0 + 2, z, GUN);
      }
    }
  }
  // upswept tips
  for (const x of [-5, 4]) { body.set(x, 3, 0, RED); body.set(x, 4, 0, GUN); }
  body.set(-4, 3, 0, GUN); body.set(3, 3, 0, GUN);
  // cedar ribs on the inside of the hull + thwarts
  for (const x of [-2, 0, 2]) { body.set(x, 1, -1, CEDAR[1]); body.set(x, 1, 1, CEDAR[1]); }
  body.box(-1, 2, -1, -1, 2, 1, CEDAR[0]); body.box(1, 2, -1, 1, 2, 1, CEDAR[0]);
  // life jacket in the bow, paddle leaning on the hull
  body.set(-3, 1, 0, 0xf08020); body.set(-3, 2, 0, 0xf08020); body.set(-2, 1, 0, 0xe07018);
  body.line(-3, 0, 3, 3, 0, 3, 0xc89a60);
  body.box(3, 0, 3, 4, 0, 4, 0xb88a50); body.set(-4, 0, 3, 0x2a2a2e);
  // pebbles wedging it in + reeds
  body.set(-5, 0, 0, pick(rnd, STONE)); body.set(4, 0, 0, pick(rnd, STONE)); body.set(1, 0, -3, pick(rnd, STONE));
  tufts(body, rnd, 5, (x, z) => Math.abs(z) < 3);
  return { body };
}

function hockey(rnd) {
  const body = new VoxelModel();
  const NET = 0xf0f0f0, MESH = 0xdcdcdc;
  // little patch of ice in front
  body.box(-4, 0, -1, 3, 0, 4, (x, y, z) => ((x === -4 || x === 3) && z === 4 ? null : (x + z) % 4 === 0 ? 0xe8f8ff : 0xb8dcea));
  // red pipe frame: goal mouth at z = -2 opening toward +z, depth to z = -4
  body.box(-4, 0, -2, -4, 5, -2, RED); body.box(3, 0, -2, 3, 5, -2, RED);
  body.box(-4, 5, -2, 3, 5, -2, RED);
  body.box(-4, 0, -4, 3, 0, -4, RED);
  body.box(-4, 0, -3, -4, 0, -3, RED); body.box(3, 0, -3, 3, 0, -3, RED);
  // mesh (back + sides + roof)
  body.box(-3, 1, -4, 2, 4, -4, (x, y) => ((x + y) % 2 ? MESH : null));
  body.box(-3, 5, -3, 2, 5, -3, (x) => (x % 2 ? MESH : NET));
  for (const x of [-4, 3]) body.box(x, 1, -3, x, 4, -3, (x, y) => (y % 2 ? MESH : null));
  // stick leaning on the post (black tape on the blade)
  body.line(4, 6, -1, 2, 0, 2, 0xc8a070);
  body.box(0, 0, 2, 1, 0, 2, 0x2a2a2e);
  body.set(4, 6, -1, 0x2a2a2e);
  // puck + a toque on the net
  body.set(-1, 1, 1, 0x1a1a1e);
  body.box(-3, 6, -3, -2, 6, -2, 0xd84a3a); body.set(-3, 7, -3, WHITE);
  tufts(body, rnd, 4, (x, z) => z > -5 && z < 5 && x > -5 && x < 4);
  return { body };
}

function moose(rnd) {
  const body = new VoxelModel();
  const C = [0x8a5a30, 0x9a6a3a, 0x7a4e28]; // carved wood
  const CD = 0x4a2e1a;
  const Wd = () => pick(rnd, C);
  // stone plinth with a brass plaque
  body.box(-4, 0, -5, 3, 1, 4, (x, y) => (y === 1 && rnd() < 0.2 ? pick(rnd, MOSS) : pick(rnd, STONE)));
  body.box(-1, 0, 4, 0, 0, 4, 0xe0b040);
  // built facing +x in `m`, then turned to face the viewer (+z) so the antlers spread wide
  const m = new VoxelModel();
  for (const [x, z] of [[-4, -2], [-4, 1], [0, -2], [0, 1]]) m.box(x, 2, z, x, 7, z, (xx, y) => (y < 3 ? CD : Wd()));
  m.ellipsoid(-1.8, 10, -0.5, 3.4, 2.4, 2.1, Wd); // barrel
  m.ellipsoid(0, 11.5, -0.5, 2, 2.2, 2, Wd); // shoulder hump
  m.box(1, 10, -1, 2, 12, 0, Wd); // neck
  m.box(2, 11, -1, 4, 12, 0, C[0]); // head
  m.box(4, 10, -1, 5, 11, 0, C[2]); // droopy muzzle
  m.set(5, 11, -1, CD); m.set(5, 11, 0, CD); // nostrils
  m.set(3, 12, -2, 0x1a1210); m.set(3, 12, 1, 0x1a1210); // eyes
  m.box(2, 9, -1, 2, 9, 0, C[2]); m.set(2, 8, -1, C[2]); // dewlap (bell)
  m.set(2, 13, -2, C[2]); m.set(2, 13, 1, C[2]); // ears
  m.set(-5, 11, -1, CD); m.set(-5, 11, 0, CD); // stubby tail
  // palmate antlers (pale wood), a big flat palm on each side with tines
  const A = 0xe0bc88, AD = 0xb88a5a;
  for (const s of [-1, 1]) {
    const z = (d) => (s < 0 ? -1 - d : d);
    m.set(2, 13, z(1), AD); m.set(2, 14, z(2), AD); // beam
    m.box(1, 15, z(2), 3, 15, z(3), A);
    m.box(0, 16, z(3), 3, 16, z(4), A);
    m.set(0, 17, z(4), A); m.set(2, 17, z(4), A); m.set(3, 17, z(3), A); // tines
    m.set(4, 15, z(2), AD); // brow tine forward
  }
  for (const [k, c] of m.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    body.set(z, y, x - 1, c);
  }
  // carved chisel marks
  body.paint((x, y, z, c) => (y > 7 && y < 13 && C.includes(c) && rnd() < 0.1 ? shade(c, 0.82) : c));
  tufts(body, rnd, 4, (x) => x > -5 && x < 4);
  return { body };
}

function hatchery(rnd) {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  // legs + wooden box
  for (const [x, z] of [[-4, -3], [3, -3], [-4, 2], [3, 2]]) body.set(x, 0, z, WOOD_D);
  body.box(-4, 1, -3, 3, 4, 2, (x, y, z) => {
    if (x === -4 || x === 3 || z === -3 || z === 2) return (y === 1 || y === 4) ? WOOD_D : WOOD[(x + 8) % 3];
    if (y === 1) return 0x5a3a20;
    if (y === 2) return rnd() < 0.5 ? 0xe8c870 : 0xd8b05a; // straw
    return null;
  });
  // eggs nestled in the straw
  const EGG = [0xf6eee0, 0xb8e0e8, 0xf0d8a8, 0xe8c8d8];
  [[-2, -1], [0, 0], [1, -2], [-2, 1]].forEach(([x, z], i) => {
    body.set(x, 3, z, EGG[i]); body.set(x, 4, z, shade(EGG[i], 1.04));
    if (i % 2 === 0) body.set(x, 3, z + 1, mix(EGG[i], 0x8a6a4a, 0.25)); // speckle
  });
  // glass lid propped open at the back (hinged at z = -3, y = 5)
  for (let i = 0; i <= 3; i++) {
    const y = 5 + i, z = -3 - Math.floor(i / 2);
    body.box(-4, y, z, 3, y, z, (x) => (x === -4 || x === 3 ? WOOD_D : null));
    glow.box(-3, y, z, 2, y, z, (x) => ((x + y) % 3 === 0 ? 0xe8fbff : 0xbfe6f0));
  }
  body.box(-4, 9, -5, 3, 9, -5, WOOD_D);
  // gooseneck heat lamp from the right, warm bulb over the eggs
  body.box(3, 5, 1, 3, 9, 1, METAL_D);
  body.line(3, 9, 1, 0, 10, 0, METAL_D);
  body.box(-1, 9, -1, 1, 9, 1, (x, y, z) => (x === 0 && z === 0 ? null : 0xc8322a)); // shade
  body.set(0, 10, 0, 0xc8322a);
  glow.set(0, 8, 0, 0xffb040); glow.set(0, 9, 0, 0xffd070);
  // thermometer dial on the front
  body.set(-1, 3, 3, 0xf0f0f0); body.set(0, 3, 3, 0xf0f0f0); body.set(-1, 2, 3, 0xf0f0f0); body.set(0, 2, 3, RED);
  body.set(2, 3, 3, 0x5ac06a); // power light
  return { body, glow };
}

function sprinkler(rnd) {
  const body = new VoxelModel();
  // rain barrel: staves + iron hoops
  body.cylinder(-2.5, 0, -2.5, 2.3, 8, (x, y, z) => (y === 1 || y === 6 ? 0x4a4a50 : (x + z) % 2 ? 0x8a5a30 : 0x9a6a3a));
  body.cylinder(-2.5, 7, -2.5, 1.6, 1, WATER); // open top shows water
  body.set(-3, 8, -3, 0x5ab040); // floating leaf
  // downspout from "above" + spigot + hose to the sprinkler
  body.box(-5, 8, -3, -5, 11, -3, METAL); body.set(-4, 11, -3, METAL);
  body.set(-1, 2, -1, METAL_D); body.set(0, 2, 0, METAL_D);
  const HOSE = 0x3a9a4a;
  body.line(0, 1, 0, 2, 0, 1, HOSE); body.line(2, 0, 1, 2, 0, 2, HOSE); body.line(2, 0, 2, 1, 0, 3, HOSE);
  // sprinkler stand
  body.box(1, 0, 2, 2, 0, 3, METAL_D);
  body.box(1, 1, 3, 1, 4, 3, 0xd8a040);
  body.set(1, 5, 3, METAL);
  // spinning head: two arms with nozzles + flung droplets
  const head = new VoxelModel();
  head.box(-1, 6, 3, 3, 6, 3, 0xd8a040);
  head.box(1, 6, 1, 1, 6, 5, 0xd8a040);
  for (const [x, z] of [[-1, 3], [3, 3], [1, 1], [1, 5]]) head.set(x, 7, z, METAL_D);
  const drops = new VoxelModel();
  for (const [x, z, y] of [[-3, 3, 8], [5, 3, 8], [1, -1, 8], [1, 7, 8], [-4, 2, 7], [6, 4, 7], [0, -2, 7], [2, 8, 7]]) drops.set(x, y, z, WATER_L);
  // wet patch + happy flowers
  for (const [x, z] of [[3, 0], [4, 1], [-1, 4], [3, 4]]) { body.set(x, 0, z, LEAF[0]); body.set(x, 1, z, pick(rnd, [0xd9529b, 0xf2c230, 0xffffff])); }
  return {
    body,
    parts: [{ model: head, glow: drops, pivot: [1.5, 6, 3.5], anim: 'rotateY', axis: 'y', speed: 3.2 }],
  };
}

function buglamp(rnd) {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  body.box(-1, 0, -1, 0, 0, 0, pick(rnd, STONE));
  for (let y = 0; y <= 14; y++) body.set(-1, y, -1, BARK[y % 3]);
  body.box(-1, 14, -1, 2, 14, -1, WOOD_D); // bracket arm
  body.set(0, 13, -1, WOOD_D);
  // little cage lamp hanging from the arm
  body.set(2, 13, -1, 0x2a2a2e);
  body.box(1, 12, -2, 3, 12, 0, 0x2a2a2e);
  body.box(1, 8, -2, 3, 8, 0, 0x2a2a2e);
  for (const [x, z] of [[1, -2], [3, -2], [1, 0], [3, 0]]) body.box(x, 9, z, x, 11, z, 0x3a3a40);
  glow.box(2, 9, -1, 2, 11, -1, 0xfff0a0);
  for (const [x, z] of [[2, -2], [1, -1], [3, -1], [2, 0]]) glow.box(x, 9, z, x, 11, z, 0xffd060);
  // moths orbiting the lamp
  const moths = new VoxelModel();
  for (const [x, y, z] of [[5, 11, -1], [-1, 10, 1], [2, 12, 3], [1, 9, -5]]) {
    moths.set(x, y, z, 0xe8dcc0);
    moths.set(x, y + 1, z, 0xc8b898);
  }
  // porch-step crate with a jar of fireflies
  body.box(-4, 0, 1, -2, 1, 3, (x, y) => (y === 1 ? WOOD[2] : WOOD[1]));
  body.set(-3, 2, 2, 0xd8f0f0);
  glow.set(-3, 3, 2, 0xc8ff70);
  tufts(body, rnd, 5, (x, z) => x < 0 && x > -5 && z > 0);
  return {
    body,
    glow,
    parts: [{ model: moths, pivot: [2.5, 10, -0.5], anim: 'rotateY', axis: 'y', speed: 1.6 }],
  };
}

function lighthouse(rnd) {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  // rocky footing
  body.ellipsoid(-0.5, 0, -0.5, 5, 2, 5, (x, y) => (y >= 1 && rnd() < 0.25 ? pick(rnd, MOSS) : pick(rnd, STONE)));
  // tapered tower with red/white bands
  for (let y = 2; y <= 18; y++) {
    const r = 3.2 - (y - 2) * 0.07;
    const band = Math.floor((y - 2) / 4) % 2 === 0 ? RED : WHITE;
    body.cylinder(-0.5, y, -0.5, r, 1, (x, yy, z) => (rnd() < 0.06 ? shade(band, 0.92) : band));
  }
  // door + windows
  body.box(-1, 2, 2, 0, 4, 2, 0x4a2a1a); body.set(0, 3, 3, 0xe8c040);
  body.set(-3, 9, -1, 0x2a3a4a); body.set(2, 13, 0, 0x2a3a4a); body.set(-1, 15, 2, 0x2a3a4a);
  // gallery + railing
  body.cylinder(-0.5, 19, -0.5, 3.2, 1, 0x3a3a40);
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180;
    body.set(Math.round(-0.5 + Math.cos(t) * 3.1), 20, Math.round(-0.5 + Math.sin(t) * 3.1), 0x3a3a40);
  }
  // lantern room: corner mullions, glass, red cap
  for (const [x, z] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) body.box(x, 20, z, x, 22, z, 0x2a2a30);
  glow.box(-2, 20, -1, 1, 22, 0, 0xfff4c0);
  glow.box(-1, 20, -2, 0, 22, 1, 0xfff4c0);
  body.cylinder(-0.5, 23, -0.5, 2.4, 1, RED_D);
  body.cylinder(-0.5, 24, -0.5, 1.4, 1, RED);
  body.box(-1, 25, -1, 0, 25, 0, 0x2a2a30); body.set(-1, 26, -1, 0xe8c040);
  // rotating lens: bright beams poking out both sides
  const lens = new VoxelModel();
  lens.box(-1, 21, -1, 0, 21, 0, 0xffffff);
  lens.box(-4, 21, -1, -2, 21, 0, 0xfff0a0);
  lens.box(1, 21, -1, 3, 21, 0, 0xfff0a0);
  lens.set(-5, 21, -1, 0xffe080); lens.set(4, 21, 0, 0xffe080);
  // gull on the gallery
  body.set(2, 20, -3, WHITE); body.set(2, 21, -3, WHITE); body.set(3, 20, -3, 0x9aa0a8); body.set(2, 21, -2, 0xe8a030);
  return { body, glow, parts: [{ glow: lens, pivot: [0, 21, 0], anim: 'rotateY', axis: 'y', speed: 1.5 }] };
}

// ---------------------------------------------------------------- water decor (origin = pond floor)
function stones(rnd, depth) {
  const body = new VoxelModel();
  const spots = [[-3, -3, 2.2], [1, -1, 2], [-1, 3, 1.8], [3, 3, 1.4]];
  spots.forEach(([cx, cz, r], i) => {
    const top = depth + (i === 3 ? -2 : 0); // the last one is just under the surface
    for (let y = 0; y <= top; y++) {
      const rr = y < top - 1 ? r + 0.6 : r;
      body.cylinder(cx, y, cz, rr, 1, (x, yy, z) => {
        if (yy === top) return rnd() < 0.35 ? pick(rnd, MOSS) : STONE[2];
        return pick(rnd, STONE);
      });
    }
  });
  // frog sunbathing on the middle stone
  const F = 0x5ab040, FD = 0x3a8a30;
  body.box(0, depth + 1, -1, 1, depth + 1, 0, F);
  body.set(0, depth + 2, 0, F); body.set(1, depth + 2, 0, F);
  body.set(0, depth + 2, 1, 0x1a1a1e); body.set(1, depth + 2, 1, 0x1a1a1e);
  body.set(-1, depth + 1, 0, FD); body.set(2, depth + 1, 0, FD);
  body.set(0, depth + 1, 1, 0xf0e8a0);
  // pebbles and a bit of weed on the floor
  for (let i = 0; i < 8; i++) body.set(Math.floor(rnd() * 10) - 5, 0, Math.floor(rnd() * 10) - 5, pick(rnd, [0x8a7a62, 0x6a604e, 0x9a8a70]));
  for (const [x, z] of [[3, -4], [-4, 1]]) for (let y = 0; y < depth - 3; y++) body.set(x + (y % 4 === 3 ? 1 : 0), y, z, LEAF[y % 4]);
  return { body };
}

function floatlantern(rnd, depth) {
  const body = new VoxelModel();
  // an anchor stone + lily pad so the tile isn't empty underwater
  body.ellipsoid(1, 0, 1, 1.6, 1, 1.4, () => pick(rnd, STONE));
  body.box(-4, depth, 2, -3, depth, 3, 0x4a9a3a);
  body.set(-2, depth, 3, 0x4a9a3a);
  const parts = [];
  const PAPER = [0xffb060, 0xff8a8a, 0xffe080];
  [[-2, -2], [2, 0], [-1, 3]].forEach(([x, z], i) => {
    const frame = new VoxelModel();
    const paper = new VoxelModel();
    const y = depth;
    frame.box(x - 1, y, z - 1, x + 1, y, z + 1, 0x8a5a30); // little wooden raft
    frame.box(x - 1, y + 4, z - 1, x + 1, y + 4, z + 1, (xx, yy, zz) => (xx === x && zz === z ? null : 0xb03a2a)); // rim
    paper.box(x - 1, y + 1, z - 1, x + 1, y + 3, z + 1, (xx, yy, zz) => (yy === y + 2 && (xx + zz) % 2 === 0 ? shade(PAPER[i], 1.08) : PAPER[i]));
    paper.set(x, y + 4, z, 0xfff4c0); // flame peeking out the top
    parts.push({ model: frame, glow: paper, pivot: [x + 0.5, y, z + 0.5], anim: 'bob', speed: 1.4 + i * 0.3, phase: i * 1.7 });
  });
  return { body, parts };
}

function decoy(rnd, depth) {
  const body = new VoxelModel();
  // anchor weight on the floor + cord up to the duck
  body.box(0, 0, 0, 1, 1, 1, 0x5a5a60);
  for (let y = 2; y < depth - 1; y++) body.set(0, y, Math.floor(y / 4) - 1, 0xd8c8a0);
  const duck = new VoxelModel();
  const y = depth - 1; // sits with its keel just under the surface
  const GREY = 0xb8b4a8, GREY_D = 0x8a867c, BROWN = 0x8a4a2a, HEAD = 0x2a8a4a, BILL = 0xf0c030;
  duck.ellipsoid(-0.5, y + 1, -0.5, 3.6, 1.4, 2, (x, yy, z) => (yy <= y ? GREY_D : x > 1 ? BROWN : GREY));
  duck.box(-4, y + 2, -1, -3, y + 2, 0, 0x2a2a2e); // tail
  duck.set(-5, y + 3, -1, 0x2a2a2e); duck.set(-4, y + 3, 0, 0xf0f0f0); // curl
  duck.box(-2, y + 2, -2, 0, y + 2, -2, 0x3a5ac0); duck.box(-2, y + 2, 1, 0, y + 2, 1, 0x3a5ac0); // speculum
  duck.box(2, y + 3, -1, 2, y + 3, 0, 0xf6f6f0); // white collar
  duck.box(2, y + 4, -1, 3, y + 5, 0, HEAD);
  duck.box(4, y + 4, -1, 5, y + 4, 0, BILL);
  duck.set(3, y + 5, -2, 0x1a1a1e); duck.set(3, y + 5, 1, 0x1a1a1e);
  duck.set(3, y + 4, -2, shade(HEAD, 1.2));
  // painted brush strokes
  duck.paint((x, yy, z, c) => (c === GREY && rnd() < 0.15 ? 0xa8a498 : c));
  return { body, parts: [{ model: duck, pivot: [-0.5, y + 1, -0.5], anim: 'bob', speed: 1.1 }] };
}

function fountain(rnd, depth) {
  const body = new VoxelModel();
  // rock pile from the floor up past the surface
  const top = depth + 3;
  for (let y = 0; y <= top; y++) {
    const r = y < depth ? 3.6 - y * 0.08 : 3.2 - (y - depth) * 0.8;
    body.cylinder(-0.5, y, -0.5, r, 1, (x, yy, z) => (yy >= depth && rnd() < 0.3 ? pick(rnd, MOSS) : pick(rnd, STONE)));
  }
  // bronze leaping fish: tail on the rock, arcing up, mouth to the sky
  const B = () => (rnd() < 0.15 ? VERDI : pick(rnd, BRONZE));
  const fy = top + 1;
  body.box(-3, fy, -1, -3, fy + 2, 0, B); body.set(-4, fy + 2, -1, B()); body.set(-4, fy + 2, 0, B()); // tail fin
  body.box(-2, fy + 1, -1, -1, fy + 3, 0, B);
  body.box(0, fy + 3, -1, 1, fy + 6, 0, B);
  body.box(-1, fy + 4, -1, -1, fy + 5, 0, B); // belly curve
  body.box(1, fy + 7, -1, 2, fy + 8, 0, B);
  body.set(2, fy + 9, -1, B()); body.set(2, fy + 9, 0, B());
  body.set(0, fy + 6, -2, BRONZE[0]); body.set(0, fy + 6, 1, BRONZE[0]); // fins
  body.set(2, fy + 8, -2, 0x1a1210); body.set(2, fy + 8, 1, 0x1a1210); // eyes
  // spout: water jet up then falling in a little arc, splash ring
  const spout = new VoxelModel();
  for (const [x, y] of [[2, fy + 10], [2, fy + 11], [3, fy + 12], [4, fy + 12], [5, fy + 11], [5, fy + 10], [6, fy + 9], [6, fy + 8], [6, fy + 7], [6, fy + 5], [6, fy + 3]])
    for (const z of [-1, 0]) spout.set(x, y, z, (x + y) % 3 === 0 ? FOAM : WATER_L);
  spout.set(1, fy + 12, -1, FOAM); spout.set(-1, fy + 11, 0, WATER_L);
  for (const [x, z] of [[5, -2], [7, -1], [7, 0], [5, 1], [6, 2], [6, -3]]) spout.set(x, depth, z, FOAM);
  return { body, parts: [{ glow: spout, pivot: [2.5, fy + 10, 0], anim: 'flicker', speed: 6 }] };
}

// ---------------------------------------------------------------- newer nature structures
function duckweed(rnd, depth) {
  const body = new VoxelModel();
  const G = [0x8ac040, 0x7ab038, 0x9ad050, 0x6aa030];
  for (let x = -5; x <= 4; x++)
    for (let z = -5; z <= 4; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 5 || rnd() < 0.3 + d * 0.06) continue;
      body.set(x, depth, z, pick(rnd, G));
    }
  // a few tiny white flowers + dangling roots
  for (let i = 0; i < 3; i++) body.set(Math.floor(rnd() * 6) - 3, depth + 1, Math.floor(rnd() * 6) - 3, 0xf6f6e8);
  for (let i = 0; i < 6; i++) body.set(Math.floor(rnd() * 8) - 4, depth - 1, Math.floor(rnd() * 8) - 4, 0x5a7a40);
  return { body };
}

function reeds(rnd) {
  const body = new VoxelModel();
  const STALK = [0x8aa848, 0x7a9a40, 0x9ab858];
  for (let s = 0; s < 9; s++) {
    const x = Math.floor(rnd() * 8) - 4, z = Math.floor(rnd() * 8) - 4;
    const h = 10 + Math.floor(rnd() * 8);
    let xx = x;
    for (let y = 0; y < h; y++) {
      if (y > h * 0.6 && y % 4 === 0) xx += s % 2 ? 1 : 0;
      body.set(xx, y, z, pick(rnd, STALK));
    }
    // feathery plume
    body.set(xx, h, z, 0xe8d8a8); body.set(xx, h + 1, z, 0xd8c890); body.set(xx + 1, h, z, 0xe8d8a8);
  }
  // songbird (red-winged blackbird) perched
  const k = [...body.vox.keys()].find((kk) => ((kk >> 10) & 1023) - 512 === 9);
  if (k != null) {
    const x = (k & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    body.set(x + 1, 9, z, 0x1a1a1e); body.set(x + 1, 10, z, 0x1a1a1e); body.set(x + 1, 9, z + 1, 0xd8322a);
    body.set(x + 2, 10, z, 0xe8a030);
  }
  return { body };
}

function fern(rnd) {
  const body = new VoxelModel();
  const G = [0x3f8a3a, 0x4f9c44, 0x5fb04e, 0x2f7034];
  for (let c = 0; c < 3; c++) {
    const cx = [-2, 2, 0][c], cz = [-2, -1, 2][c];
    const fronds = 6;
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + rnd() * 0.5;
      for (let s = 0; s <= 5; s++) {
        const y = s < 3 ? s + 1 : 4 - (s - 3);
        const x = cx + Math.cos(a) * s * 0.55, z = cz + Math.sin(a) * s * 0.55;
        body.set(x, y, z, G[(s + f) % 4]);
      }
    }
    body.set(cx, 0, cz, G[3]);
    body.set(cx, 1, cz, 0x8a6a3a); // fiddlehead
    body.set(cx, 2, cz, 0x6aa040);
  }
  return { body };
}

function wildrice(rnd, depth) {
  const body = new VoxelModel();
  for (let s = 0; s < 10; s++) {
    const x = Math.floor(rnd() * 9) - 5, z = Math.floor(rnd() * 9) - 5;
    const h = depth + 5 + Math.floor(rnd() * 5);
    for (let y = 0; y < h; y++) body.set(x + (y > depth + 3 && s % 3 === 0 ? 1 : 0), y, z, y < depth ? 0x4a7a3a : rnd() < 0.5 ? 0x8ab048 : 0x9ab858);
    // drooping golden seed head
    const tx = x + (s % 3 === 0 ? 1 : 0);
    body.set(tx, h, z, 0xe8c870); body.set(tx + 1, h, z, 0xd8b060); body.set(tx + 1, h - 1, z, 0xc8a050);
    if (s % 2) body.set(tx, h - 2, z + 1, 0x9ab858); // leaf blade
  }
  return { body };
}

function mushrooms(rnd) {
  const body = new VoxelModel();
  // mossy log along x
  for (let x = -5; x <= 4; x++)
    for (let y = 0; y <= 3; y++)
      for (let z = -2; z <= 1; z++) {
        const d = Math.hypot(y - 1.5, z + 0.5);
        if (d > 2.1) continue;
        const end = x === -5 || x === 4;
        body.set(x, y, z, end ? (d < 1 ? 0xb88a50 : LOG_END) : y === 3 && rnd() < 0.6 ? pick(rnd, MOSS) : pick(rnd, BARK));
      }
  // chanterelles (golden-orange funnels) along the side and top
  const CH = [0xf0a030, 0xe89020, 0xf8b848];
  for (const [x, z, y] of [[-3, 2, 0], [-1, 2, 0], [2, 2, 1], [0, 3, 0], [3, -3, 0], [-2, -3, 0], [1, -1, 4]]) {
    body.set(x, y, z, 0xe8c070);
    body.set(x, y + 1, z, pick(rnd, CH));
    body.set(x + 1, y + 1, z, CH[2]); body.set(x - 1, y + 1, z, CH[1]);
  }
  tufts(body, rnd, 5);
  return { body };
}

// ---------------------------------------------------------------- public API
const BUILDERS = {
  mailbox, pinwheel, bench, birdhouse, birdbath, gnome, arch, stringlights, stonelantern, campfire,
  flag, canoe, hockey, moose, stones, floatlantern, decoy, fountain, lighthouse, hatchery, sprinkler,
  buglamp, duckweed, reeds, fern, wildrice, mushrooms,
};

/**
 * Build the voxel model(s) for a decoration / contraption.
 * @param {string} type one of DECOR_TYPES
 * @param {{ seed?: number, depth?: number }} [o] depth = water depth in voxels for water types
 * @returns {{ body: VoxelModel, glow?: VoxelModel, parts?: object[] } | null}
 */
export function decorModel(type, { seed = 1, depth = 10 } = {}) {
  if (type === 'bughotel') return bugHotel();
  const fn = BUILDERS[type];
  if (!fn) return null;
  const rnd = mulberry32((seed * 7919 + type.length * 131 + type.charCodeAt(0)) >>> 0);
  const out = fn(rnd, depth);
  // nothing pokes below the base surface / pond floor
  const clip = (m) => m && m.paint((x, y, z, c) => (y < 0 ? null : c));
  clip(out.body); clip(out.glow);
  if (out.glow && out.glow.vox.size === 0) delete out.glow;
  return out;
}

// a cuter bug hotel than the old one: stacked compartments of logs, pinecones, straw
function bugHotel() {
  const body = new VoxelModel();
  const rnd = mulberry32(31);
  body.box(-4, 0, -2, 3, 0, 1, WOOD_D);
  body.box(-4, 1, -2, 3, 11, 1, (x, y, z) => {
    if (x === -4 || x === 3 || y === 1 || y === 11 || y === 6 || (x === -1 && y > 6)) return WOOD[1];
    if (z < 1) return 0x4a3020;
    if (y < 6) {
      // log ends with dark holes
      const r = (x + y * 3) % 4;
      return r === 0 ? 0x2a1a10 : r === 1 ? LOG_END : 0xb88a50;
    }
    if (x < -1) return rnd() < 0.5 ? 0x8a5a30 : 0x6a4424; // pinecones
    return rnd() < 0.5 ? 0xe8c870 : 0xd8b05a; // straw
  });
  for (let i = 0; i <= 2; i++) body.box(-5 + i, 12 + i, -3, 4 - i, 12 + i, 2, (x, y, z) => (z === 2 || z === -3 ? RED_D : RED));
  body.set(-3, 3, 2, 0xe8c040); body.set(2, 9, 2, 0x2a2a2e); // a bee + a beetle visiting
  tufts(body, rnd, 5, (x, z) => x >= -4 && x <= 3 && z >= -2 && z <= 1);
  return { body };
}
