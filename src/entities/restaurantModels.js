// Voxel models for the beaver-built outdoor restaurant around the pond.
//
// Conventions match decorModels.js / landmarkModels.js: 1 tile = 10 voxels,
// y = 0 is the first layer above the ground, a model with footprint { w, d }
// is centred on its footprint (x: -5w .. 5w-1, z: -5d .. 5d-1), +z faces the
// default camera. Build body/glow with { pivot: [0.5, 0, 0.5], scale: 0.1 };
// parts mount exactly like decor parts (see decorModels.js).
//
// restaurantModel(type, { seed }) -> {
//   body, glow?, parts?,
//   footprint: { w, d },                     tiles
//   seats?: [{ x, z, yaw, y }]               world units relative to the model origin;
//                                            y = seat surface height, yaw = facing (0 faces +z,
//                                            PI/2 faces +x), so bear.rotation.y = yaw.
//                                            The hammock seat has `lie: true`.
// }
// Extra anim used here besides the decor ones:
//   blink: neon buzz, holder.visible toggles off now and then
//          (k = floor(t*8); off when hash(k) < 0.12, or in bursts when hash(floor(t/2)) < 0.2 && k odd)
// Parts may carry `amp` (amplitude multiplier for sway / bob, default 1).
import { VoxelModel, shade } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';

export const RESTAURANT_TYPES = [
  'bar', 'picnictable', 'roundtable', 'umbrellatable', 'bbq', 'hangout', 'hammock', 'menuboard',
  'cooler', 'stringlights', 'bench', 'neonsign', 'tikitorch', 'planterbox', 'jukebox',
];

const FOOTPRINTS = {
  bar: { w: 3, d: 1 }, picnictable: { w: 2, d: 1 }, hangout: { w: 2, d: 2 }, stringlights: { w: 2, d: 1 },
  neonsign: { w: 3, d: 1 },
};
const fpOf = (t) => FOOTPRINTS[t] || { w: 1, d: 1 };

// ---------------------------------------------------------------- palette
const WOOD = [0xb48452, 0xa8784a, 0xc0905a];
const WOOD_D = 0x6a4424, WOOD_M = 0x8a5a32;
const HONEY = [0xd89a52, 0xc88a46, 0xe4aa62];
const BARK = [0x7a4e2a, 0x8a5a30, 0x6a4424];
const LOG_END = 0xd0a066, LOG_RING = 0xa87a48;
const STONE = [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72];
const LEAF = [0x3f8a3a, 0x4f9c44, 0x2f7034, 0x5aa84a];
const GRASS = [0x6aa040, 0x5a9038, 0x7ab04a];
const RED = 0xd23a2e, RED_D = 0xa82a22;
const WHITE = 0xf6f2ea, CREAM = 0xf0e6cc;
const METAL = 0xa8b0b8, METAL_D = 0x6a747c, IRON = 0x3a3a40, CHROME = 0xd8e0e8;
const BRASS = 0xd8a840;
const ROPE = 0xd8c090;
const BEER = 0xe8a028, FOAM = 0xfff8e8;
const DAISY = 0xf6d030, DAISY_C = 0xc8701c, NAVY = 0x2a4a8a, NAVY_D = 0x1e3668;
const CHALK = 0x2a3430;
const WARM = 0xffd070, WARM2 = 0xffb050, FLAME = [0xffe070, 0xffb030, 0xff7a20];
const FLOWERS = [0xffffff, 0xf2c230, 0xd9529b, 0x9a86ea, 0xf07a4a];

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const seat = (x, z, yaw, y, extra) => ({ x: +(x * 0.1).toFixed(3), z: +(z * 0.1).toFixed(3), yaw: +yaw.toFixed(4), y: +(y * 0.1).toFixed(3), ...extra });
const PI = Math.PI;

function tufts(v, rnd, n, fp, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = -5 * fp.w + Math.floor(rnd() * 10 * fp.w), z = -5 * fp.d + Math.floor(rnd() * 10 * fp.d);
    if (avoid(x, z) || v.has(x, 0, z) || v.has(x, 1, z)) continue;
    const h = 1 + Math.floor(rnd() * 2);
    for (let y = 0; y < h; y++) v.set(x, y, z, pick(rnd, GRASS));
    if (rnd() < 0.3) v.set(x, h, z, pick(rnd, FLOWERS));
  }
}

// Daisy Beer logo: yellow petals round an orange centre, centred at (x, y) on plane z (facing +z)
function daisyLogo(v, x, y, z, big = false) {
  v.set(x, y, z, DAISY_C);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) v.set(x + dx, y + dy, z, DAISY);
  if (big) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) v.set(x + dx, y + dy, z, 0xfff0a0);
}

// beer mug: 1x2 glass of amber + foam, handle on +x
function mug(v, x, y, z) {
  v.set(x, y, z, BEER); v.set(x, y + 1, z, FOAM);
  v.set(x + 1, y, z, 0xe8e8e0);
}
// Daisy Beer bottle (amber, yellow label) standing at (x, y, z)
function bottle(v, x, y, z, glass = 0x8a5a1a) {
  v.set(x, y, z, glass); v.set(x, y + 1, z, DAISY); v.set(x, y + 2, z, glass); v.set(x, y + 3, z, 0xe8c040);
}
function plate(v, x, y, z, food) {
  v.box(x - 1, y, z, x + 1, y, z, WHITE);
  if (food === 'fish') { v.set(x, y + 1, z, 0xd8905a); v.set(x - 1, y + 1, z, 0xc87a4a); v.set(x + 1, y + 1, z, 0x9ab0a0); }
  else if (food === 'fries') { v.set(x, y + 1, z, 0xf0c050); v.set(x - 1, y + 1, z, 0xe8b040); }
  else if (food === 'berries') { v.set(x, y + 1, z, 0x5a4ac0); v.set(x + 1, y + 1, z, 0xd8304a); }
  else { v.set(x, y + 1, z, 0xc8603a); }
}
function napkin(v, x, y, z) { v.set(x, y, z, 0xffffff); }

// simple chair; seat top at y = 5 (cushion), backrest on the side opposite `face`
// face: '+x' | '-x' | '+z' | '-z' ; footprint centred on (cx, cz), 2x3 seat
function chair(v, cx, cz, face, wood = HONEY, cushion = RED) {
  const alongX = face === '+z' || face === '-z';
  const hw = alongX ? 1 : 0, hd = alongX ? 0 : 1; // seat spans x cx-1..cx+1 (alongX) or z cz-1..cz+1
  const x0 = cx - (alongX ? 1 : 0), x1 = cx + (alongX ? 1 : 1), z0 = cz - (alongX ? 0 : 1), z1 = cz + (alongX ? 1 : 1);
  // legs
  for (const x of [x0, x1]) for (const z of [z0, z1]) v.box(x, 0, z, x, 3, z, WOOD_D);
  v.box(x0, 4, z0, x1, 4, z1, wood[0]);
  v.box(x0, 5, z0, x1, 5, z1, (x, y, z) => ((x + z) % 2 ? cushion : shade(cushion, 1.1)));
  // backrest
  const bx = face === '+x' ? x0 - 1 : face === '-x' ? x1 + 1 : null;
  const bz = face === '+z' ? z0 - 1 : face === '-z' ? z1 + 1 : null;
  if (bx != null) { v.box(bx, 0, z0, bx, 10, z0, WOOD_D); v.box(bx, 0, z1, bx, 10, z1, WOOD_D); v.box(bx, 7, z0, bx, 10, z1, (x, y) => (y === 8 ? null : wood[1])); }
  if (bz != null) { v.box(x0, 0, bz, x0, 10, bz, WOOD_D); v.box(x1, 0, bz, x1, 10, bz, WOOD_D); v.box(x0, 7, bz, x1, 10, bz, (x, y) => (y === 8 ? null : wood[1])); }
  void hw; void hd;
}

// ================================================================ BAR (3x1)
function bar(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [], seats = [];
  // back shelf unit (bartender side, -z)
  body.box(-14, 0, -5, 13, 16, -5, (x, y) => (y % 4 === 0 ? WOOD_M : 0x7a4a2a));
  body.box(-14, 0, -4, 13, 4, -4, (x, y) => (y === 0 ? WOOD_D : x % 5 === 0 ? WOOD_D : WOOD[1])); // cabinet
  for (let x = -12; x <= 12; x += 5) body.set(x, 3, -3, BRASS); // knobs
  for (const y of [5, 10, 15]) body.box(-14, y, -4, 13, y, -4, WOOD[2]);
  for (const x of [-14, -5, 4, 13]) body.box(x, 5, -4, x, 16, -4, WOOD_D);
  // bottles on the shelves
  const GL = [0x3a7a3a, 0x8a5a1a, 0xc8d8d0, 0x6a2a4a, 0x2a6a8a, 0xa8681a];
  for (const y of [6, 11]) for (let x = -13; x <= 3; x++) {
    if (x === -5 || rnd() < 0.3) continue;
    const g = pick(rnd, GL), h = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < h; k++) body.set(x, y + k, -4, k === 1 ? (rnd() < 0.5 ? CREAM : DAISY) : g);
    body.set(x, y + h, -4, rnd() < 0.5 ? 0xe8c040 : 0x2a2a2a);
  }
  // stacked glasses in the right bay
  for (const y of [6, 11]) for (let x = 5; x <= 12; x++) { body.set(x, y, -4, x % 2 ? 0xd8eef0 : 0xc0dde4); if (x % 2) body.set(x, y + 1, -4, 0xd8eef0); }
  body.box(6, 13, -4, 7, 13, -4, BEER); body.set(10, 13, -4, 0x3a7a3a); body.set(10, 14, -4, 0x3a7a3a);
  // chalkboard menu propped on top of the right bay
  body.box(5, 16, -5, 12, 22, -4, (x, y, z) => {
    if (z === -5 || x === 5 || x === 12 || y === 16 || y === 22) return z === -5 ? WOOD_D : HONEY[0];
    if (y === 21 && x >= 6 && x <= 11) return x % 2 ? 0xe8e4d8 : CHALK; // header
    if (y === 19 && x >= 6 && x <= 7) return 0xf6a0a0; if (y === 18 && x === 7) return 0xf6a0a0; if (y === 20 && x === 7) return 0xf6a0a0; // fish
    if (y === 19 && (x === 9 || x === 10)) return 0xf6d070; // price
    if (y === 17 && x === 6) return DAISY; if (y === 17 && x === 7) return 0xffffff; // mug
    if (y === 17 && (x === 9 || x === 10)) return 0xe8e4d8;
    return CHALK;
  });
  // fish trophy plaque on the left
  body.box(-13, 17, -5, -8, 20, -5, WOOD_D);
  body.box(-12, 18, -4, -9, 19, -4, (x, y) => (y === 19 ? 0x6a9aa0 : 0xc8d8c0));
  body.set(-8, 18, -4, 0x5a8a90); body.set(-8, 19, -4, 0x5a8a90); body.set(-12, 19, -4, 0x1a1a1a);
  body.set(-11, 16, -4, BRASS); body.set(-10, 16, -4, BRASS);
  // Daisy Beer sign on top
  body.box(-6, 17, -5, 3, 21, -5, (x, y) => (y === 17 || y === 21 || x === -6 || x === 3 ? WOOD_D : NAVY));
  daisyLogo(body, -4, 19, -4, true);
  body.box(-1, 20, -4, 2, 20, -4, CREAM); body.box(-1, 18, -4, 1, 18, -4, DAISY);
  // little sconces
  for (const x of [-14, 13]) { body.set(x, 17, -4, BRASS); glow.set(x, 18, -4, WARM); glow.set(x, 19, -4, 0xfff0b0); }
  // counter: front planks, kick plate, top with overhang
  body.box(-13, 0, -2, 12, 10, 0, (x, y, z) => {
    if (z < 0) return WOOD_D;
    if (y === 0) return 0x4a3018;
    if (y === 10 || y === 5) return WOOD_D;
    return x % 3 === 0 ? WOOD[1] : x % 3 === 1 ? WOOD[0] : WOOD[2];
  });
  body.box(-14, 11, -3, 13, 11, 1, (x, y, z) => (z === 1 ? 0x7a4220 : (x + z) % 7 === 0 ? 0xa86a3a : 0x9a5a30));
  // daisy painted on the counter front
  daisyLogo(body, -1, 7, 1, true);
  // brass foot rail
  for (let x = -13; x <= 12; x++) body.set(x, 2, 1, BRASS);
  for (const x of [-12, -4, 4, 12]) body.set(x, 2, 0, 0xb88a30);
  // taps: tower, crossbar, three Daisy handles, drip tray
  body.box(-1, 12, -1, -1, 14, -1, BRASS);
  body.box(-3, 15, -1, 1, 15, -1, BRASS);
  for (const x of [-3, -1, 1]) { body.set(x, 14, 0, CHROME); body.set(x, 16, -1, WOOD_D); body.set(x, 17, -1, DAISY); body.set(x, 18, -1, DAISY_C); }
  body.box(-3, 12, 0, 1, 12, 0, METAL);
  // mugs, napkins, peanuts, tip jar, a fish plate
  mug(body, -10, 12, 0); napkin(body, -11, 12, 1);
  mug(body, -5, 12, 0); napkin(body, -6, 12, 1); mug(body, -7, 12, -2);
  mug(body, 4, 12, 0); napkin(body, 3, 12, 1);
  plate(body, 7, 12, 0, 'fish'); napkin(body, 8, 12, 1);
  body.box(-13, 12, -1, -12, 12, 0, 0x9a6a3a); body.set(-13, 13, -1, 0xd8b060); body.set(-12, 13, 0, 0xc8a050); // peanuts
  body.box(12, 12, 0, 12, 14, 0, 0xc8e0e8); body.set(12, 13, 0, BRASS); // tip jar
  bottle(body, 10, 12, -2);
  // the bar cat: orange tabby curled up asleep on the counter (breathes = bob part)
  const cat = new VoxelModel();
  const CT = [0xe8903a, 0xd8802a], CTD = 0xb86a20;
  cat.box(8, 12, -2, 11, 13, -1, (x, y, z) => (x % 2 && y === 13 ? CTD : CT[(x + z) & 1]));
  cat.box(9, 14, -2, 10, 14, -1, CT[0]);
  cat.box(11, 12, -2, 12, 14, -2, CT[1]); // head
  cat.set(11, 15, -2, CTD); cat.set(12, 15, -2, CTD); // ears
  cat.set(12, 13, -1, 0x2a1a10); cat.set(12, 12, -1, 0xf0e0d0); // closed eye + muzzle
  cat.box(7, 12, -1, 7, 12, 0, CTD); cat.set(8, 12, 0, CT[0]); // tail wrapped round
  parts.push({ model: cat, pivot: [10, 12, -1], anim: 'bob', speed: 1.2, amp: 0.25 });
  // bar stools
  for (const x of [-9, -3, 3, 9]) {
    body.box(x - 1, 0, 2, x + 1, 0, 4, IRON);
    body.box(x, 1, 3, x, 5, 3, METAL_D);
    body.box(x - 1, 3, 3, x + 1, 3, 3, (xx) => (xx === x ? METAL_D : METAL)); body.set(x, 3, 2, METAL); body.set(x, 3, 4, METAL);
    body.box(x - 1, 6, 2, x + 1, 6, 4, WOOD_D);
    body.box(x - 1, 7, 2, x + 1, 7, 4, (xx, yy, zz) => ((xx + zz) % 2 ? RED : 0xe04a3a));
    seats.push(seat(x, 3, PI, 8));
  }
  return { body, glow, parts, seats };
}

// ================================================================ PICNIC TABLE (2x1)
function picnictable(rnd) {
  const body = new VoxelModel();
  const W = (x, y, z) => HONEY[(z + 9) % 3];
  // A-frame legs + cross supports
  for (const x of [-7, 6]) {
    body.line(x, 0, -3, x, 6, -1, WOOD_D); body.line(x, 0, 2, x, 6, 0, WOOD_D);
    body.box(x, 3, -5, x, 3, 4, WOOD_M);
  }
  body.box(-7, 6, -2, 6, 6, 1, null);
  for (const x of [-7, 6]) body.box(x, 6, -2, x, 6, 1, WOOD_D);
  // top (planks along x, gaps between) + benches
  body.box(-9, 7, -2, 8, 7, 1, W);
  for (const z of [-5, -4, 3, 4]) body.box(-9, 4, z, 8, 4, z, (x) => HONEY[(x + z + 20) % 3]);
  for (let x = -9; x <= 8; x += 6) { body.set(x, 7, -1, shade(HONEY[0], 0.9)); }
  // a red-white runner down the middle
  body.box(-3, 8, -2, 2, 8, 1, (x, y, z) => ((x + z) % 2 ? RED : WHITE));
  // food: plates of fish, fries basket, mugs, ketchup + mustard, pitcher, napkins
  plate(body, -6, 8, -1, 'fish'); plate(body, 5, 8, 0, 'fish');
  body.box(-1, 9, -1, 0, 9, 0, 0xc8302a); body.set(-1, 10, -1, 0xf0c050); body.set(0, 10, 0, 0xe8b040); body.set(0, 10, -1, 0xf6d070); // fries basket
  mug(body, -8, 8, 1); mug(body, 3, 8, -2); mug(body, 7, 8, -2);
  body.box(-3, 9, 0, -3, 10, 0, 0xd02a1a); body.set(-3, 11, 0, WHITE); // ketchup
  body.box(-3, 9, -2, -3, 10, -2, 0xf0c020); body.set(-3, 11, -2, 0xc8901a); // mustard
  body.box(1, 9, 0, 2, 11, 1, (x, y) => (y === 11 ? FOAM : BEER)); body.set(3, 10, 1, 0xd8d8d0); // pitcher
  napkin(body, -6, 8, 1); napkin(body, 5, 8, -2);
  body.set(-4, 8, -2, METAL); body.set(4, 8, 1, METAL); // forks
  tufts(body, rnd, 10, fpOf('picnictable'), (x, z) => z >= -5 && z <= 4 && x >= -9 && x <= 8);
  const seats = [seat(-5, -4.5, 0, 5), seat(4, -4.5, 0, 5), seat(-5, 3.5, PI, 5), seat(4, 3.5, PI, 5)];
  return { body, seats };
}

// ================================================================ ROUND TABLE (1x1)
function roundtable(rnd) {
  const body = new VoxelModel();
  const parts = [];
  const CX = -0.5, CZ = -0.5;
  body.cylinder(CX, 0, CZ, 1.6, 1, IRON);
  body.box(-1, 1, -1, 0, 6, 0, IRON);
  // checkered cloth with a drop round the rim
  body.cylinder(CX, 7, CZ, 2.9, 1, (x, y, z) => ((x + z) & 1 ? RED : WHITE));
  for (let a = 0; a < 360; a += 10) {
    const t = (a * PI) / 180;
    const x = Math.round(CX + Math.cos(t) * 3.2), z = Math.round(CZ + Math.sin(t) * 3.2);
    body.set(x, 6, z, (x + z) & 1 ? RED : WHITE);
    body.set(x, 7, z, null);
  }
  // vase w/ flower, plates, mugs, candle jar
  body.set(-1, 8, -1, 0x5aa0c8); body.set(-1, 9, -1, LEAF[0]); body.set(-1, 10, -1, 0xf2c230); body.set(0, 10, -1, WHITE); body.set(-1, 10, -2, WHITE);
  plate(body, -2, 8, 0, 'berries'); plate(body, 1, 8, 0, 'fish');
  body.set(0, 8, -2, 0xc8e0e8);
  const flame = new VoxelModel();
  flame.set(0, 9, -2, FLAME[0]);
  parts.push({ glow: flame, pivot: [0.5, 9, -1.5], anim: 'flicker', speed: 10 });
  // two chairs facing the table
  chair(body, -4, -1, '+x', HONEY, 0x4a7ab0);
  chair(body, 2, -1, '-x', HONEY, 0x4a7ab0);
  tufts(body, rnd, 6, { w: 1, d: 1 }, (x, z) => Math.hypot(x + 0.5, z + 0.5) < 4);
  return { body, parts, seats: [seat(-3.5, -0.5, PI / 2, 6), seat(2.5, -0.5, -PI / 2, 6)] };
}

// ================================================================ UMBRELLA TABLE (1x1)
function umbrellatable(rnd) {
  const body = new VoxelModel();
  const parts = [];
  // table
  body.box(-3, 7, -3, 2, 7, 2, (x, y, z) => (x === -3 || x === 2 || z === -3 || z === 2 ? WOOD_D : (x + 9) % 2 ? WOOD[0] : WOOD[2]));
  for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) body.box(x, 0, z, x, 6, z, WOOD_D);
  body.box(-1, 0, -1, -1, 7, -1, CHROME);
  body.set(-1, 0, -2, IRON); body.set(-1, 0, 0, IRON); body.set(-2, 0, -1, IRON); body.set(0, 0, -1, IRON);
  // lemonade glasses with straws + an ice-cream sundae
  for (const [x, z] of [[-2, 1], [1, -2]]) { body.set(x, 8, z, 0xf8e870); body.set(x, 9, z, 0xfff8b0); body.set(x, 10, z, 0xff6a8a); }
  body.set(1, 8, 1, 0xc8e0e8); body.set(1, 9, 1, 0xf8d8e0); body.set(1, 10, 1, 0xd03040);
  napkin(body, -2, 8, -2);
  // chairs front + back
  chair(body, -1, 2, '-z', WOOD, 0xf2c230);
  chair(body, -1, -4, '+z', WOOD, 0xf2c230);
  // parasol: pole + canopy, sways from the table
  const para = new VoxelModel();
  for (let y = 8; y <= 19; y++) para.set(-1, y, -1, y === 13 ? IRON : CHROME);
  const STR = [0x3ab0a0, CREAM];
  const rings = [[16, 5.0], [17, 4.3], [18, 3.3], [19, 2.1], [20, 0.9]];
  for (const [y, r] of rings)
    para.cylinder(-0.5, y, -0.5, r, 1, (x, yy, z) => {
      const a = Math.atan2(z + 0.5, x + 0.5);
      const s = Math.floor(((a + PI) / (2 * PI)) * 8) % 2;
      return y === 16 && Math.hypot(x + 0.5, z + 0.5) < 4.1 ? null : STR[s];
    });
  // scalloped fringe
  for (let a = 0; a < 360; a += 15) {
    const t = (a * PI) / 180;
    const x = Math.round(-0.5 + Math.cos(t) * 5.0), z = Math.round(-0.5 + Math.sin(t) * 5.0);
    if ((a / 15) % 2 === 0) para.set(x, 15, z, 0x2a9080);
  }
  para.set(-1, 21, -1, 0xe8c040);
  parts.push({ model: para, pivot: [-0.5, 8, -0.5], anim: 'sway', axis: 'z', speed: 1.1, amp: 0.35 });
  tufts(body, rnd, 5, { w: 1, d: 1 }, (x, z) => Math.abs(x + 0.5) < 3.5 && Math.abs(z + 0.5) < 5);
  return { body, parts, seats: [seat(-1, 2.5, PI, 6), seat(-1, -3.5, 0, 6)] };
}

// ================================================================ BBQ (1x1)
function bbq(rnd) {
  const body = new VoxelModel();
  const parts = [];
  const BL = 0xc83a2a, BL2 = 0xa82e22;
  // legs, lower shelf with a charcoal bag, wheels
  for (const x of [-4, 2]) for (const z of [-3, 2]) body.box(x, 0, z, x, 4, z, IRON);
  body.box(-4, 2, -3, 2, 2, 2, (x, y, z) => ((x + z) % 2 ? METAL_D : null));
  body.box(-3, 3, -2, -1, 5, 0, (x, y) => (y === 4 ? 0xe8e0c8 : 0x8a6a4a)); body.set(-2, 4, 1, 0x1a1a1a);
  body.set(-4, 0, 3, 0x1a1a1a); body.set(2, 0, 3, 0x1a1a1a);
  // barrel bowl (lower half-cylinder along x)
  for (let x = -4; x <= 2; x++)
    for (let y = 4; y <= 7; y++)
      for (let z = -3; z <= 2; z++) {
        const d = Math.hypot(y - 7.5, z + 0.5);
        if (d > 3.1) continue;
        if (x === -4 || x === 2 || d > 2.1) body.set(x, y, z, (x + y) % 3 === 0 ? BL2 : BL);
      }
  // grate + food on it
  body.box(-3, 7, -2, 1, 7, 1, (x, y, z) => (z % 2 ? METAL : null));
  for (const [x, z, c] of [[-3, -2, 0xb8502a], [-2, -2, 0xc85a30], [-1, -2, 0xb8502a], [-3, 0, 0xf0c040], [-2, 0, 0xf6d050], [0, 1, 0xd8905a], [1, 1, 0xc87a4a], [0, -1, 0xc85a30], [1, -1, 0xb8502a]])
    body.set(x, 8, z, c);
  body.set(0, 8, 0, 0x9ab0a0); body.set(1, 9, 1, 0x60a040); // fish tail + herb
  // side shelf with spatula, sauce, plate of buns
  body.box(3, 7, -2, 4, 7, 1, WOOD[0]); body.box(3, 6, -2, 3, 6, 1, IRON);
  body.box(4, 8, -1, 4, 9, -1, 0x8a2a1a); body.set(4, 10, -1, 0xd8d0c0);
  body.set(3, 8, 1, WHITE); body.set(4, 8, 1, WHITE); body.set(3, 9, 1, 0xe0a860); body.set(4, 9, 1, 0xd89850);
  body.line(3, 8, -2, 4, 8, 0, METAL); body.set(4, 8, -2, WOOD_D);
  // coals (glow, flickers)
  const coals = new VoxelModel();
  coals.box(-3, 5, -2, 1, 6, 1, (x, y, z) => {
    const d = Math.hypot(y - 7.5, z + 0.5);
    if (d > 2.1) return null;
    return y === 6 ? ((x + z) % 2 ? 0xff6a20 : 0xffa030) : 0xd84a10;
  });
  parts.push({ glow: coals, pivot: [-0.5, 5, -0.5], anim: 'flicker', speed: 7 });
  // open lid standing up behind, hinged at the back rim (wobbles a little)
  const lid = new VoxelModel();
  for (let x = -4; x <= 2; x++)
    for (let y = 8; y <= 13; y++) {
      const d = Math.hypot(y - 8, (x + 1) * 0.9);
      if (d > 3.7) continue;
      const lz = -4 - Math.floor((y - 8) / 3);
      lid.set(x, y, lz, (x + y) % 3 === 0 ? BL2 : BL);
      if (x === -4 || x === 2 || d > 3) lid.set(x, y, lz + 1, BL);
    }
  lid.box(-2, 11, -4, 0, 11, -4, CHROME); lid.set(-1, 9, -4, METAL); // thermometer
  parts.push({ model: lid, pivot: [-0.5, 8, -3.5], anim: 'sway', axis: 'x', speed: 2.2, amp: 0.3 });
  tufts(body, rnd, 5, { w: 1, d: 1 }, (x, z) => x > -5 && x < 5 && z > -4 && z < 3);
  return { body, parts };
}

// ================================================================ HANGOUT: fire ring + log benches (2x2)
function hangout(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const CX = -0.5, CZ = -0.5;
  // packed-dirt clearing
  for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) {
    const r = Math.hypot(x - CX, z - CZ);
    if (r < 6.5 && rnd() < 0.55) body.set(x, 0, z, pick(rnd, [0x8a6a48, 0x7a5c3e, 0x9a7a54]));
  }
  // stone ring, logs, embers
  body.cylinder(CX, 0, CZ, 2.4, 1, () => (rnd() < 0.5 ? 0x4a4440 : 0x3a3430));
  for (let a = 0; a < 360; a += 24) {
    const t = (a * PI) / 180;
    const x = Math.round(CX + Math.cos(t) * 3.6), z = Math.round(CZ + Math.sin(t) * 3.6);
    body.set(x, 0, z, pick(rnd, STONE)); body.set(x, 1, z, pick(rnd, STONE));
  }
  for (const [x0, z0, x1, z1] of [[-3, -1, -1, -1], [2, 0, 0, 0], [0, 2, 0, 0], [-1, -3, -1, -1]]) { body.line(x0, 1, z0, x1, 4, z1, BARK[0]); body.set(x0, 1, z0, LOG_END); }
  glow.box(-2, 1, -2, 1, 1, 1, () => (rnd() < 0.5 ? 0xff6a20 : 0xffa030));
  const flame = new VoxelModel();
  flame.box(-2, 2, -2, 1, 2, 1, (x, y, z) => (Math.abs(x + 0.5) + Math.abs(z + 0.5) > 2.5 ? null : FLAME[2]));
  flame.box(-1, 3, -1, 0, 4, 0, (x, y) => (y === 3 ? FLAME[1] : FLAME[0]));
  flame.set(-2, 3, -1, FLAME[2]); flame.set(1, 3, 0, FLAME[2]); flame.set(0, 3, -2, FLAME[1]); flame.set(-1, 3, 1, FLAME[1]);
  flame.set(-1, 5, 0, FLAME[0]); flame.set(0, 5, -1, FLAME[1]); flame.set(0, 6, 0, 0xfff4b0); flame.set(-1, 7, -1, 0xfff4b0);
  parts.push({ glow: flame, pivot: [-0.5, 2, -0.5], anim: 'flicker', speed: 9 });
  // log benches: horizontal logs with end grain
  const benchLog = (x0, z0, x1, z1) => {
    const alongX = z0 === z1 || Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let a = alongX ? x0 : z0; a <= (alongX ? x1 : z1); a++)
      for (let y = 0; y <= 2; y++)
        for (let o = -1; o <= 1; o++) {
          if (Math.abs(o) === 1 && y === 2) continue;
          const x = alongX ? a : x0 + o, z = alongX ? z0 + o : a;
          const end = a === (alongX ? x0 : z0) || a === (alongX ? x1 : z1);
          body.set(x, y, z, end ? (o === 0 && y === 1 ? LOG_RING : LOG_END) : y === 2 ? HONEY[(a + 30) % 3] : pick(rnd, BARK));
        }
  };
  benchLog(-6, -8, 5, -8);
  benchLog(-8, -5, -8, 4);
  benchLog(7, -5, 7, 4);
  // two stumps up front
  for (const x of [-5, 4]) body.cylinder(x, 0, 6, 1.4, 4, (xx, y, z) => (y === 3 ? (Math.hypot(xx - x, z - 6) < 0.8 ? LOG_RING : LOG_END) : pick(rnd, BARK)));
  // a plaid blanket over the back bench, mugs, guitar, marshmallow sticks, s'mores box
  body.box(-4, 3, -9, -1, 3, -7, (x, y, z) => (x % 2 === 0 && z % 2 === 0 ? 0x2a3a6a : x % 2 === 0 || z % 2 === 0 ? 0x3a5aa0 : 0x4a7ac8));
  body.set(-1, 2, -6, 0x3a5aa0); body.set(-4, 2, -6, 0x3a5aa0);
  mug(body, 2, 3, -8); mug(body, -8, 3, 3);
  // guitar leaning on the left bench
  body.box(-6, 0, -3, -6, 2, -1, 0xc87a3a); body.box(-6, 1, -2, -6, 1, -2, 0x3a2010); body.set(-6, 3, -2, 0xc87a3a);
  body.line(-6, 3, -2, -6, 8, -2, 0x5a3418); body.set(-6, 9, -2, 0x3a2010);
  for (const [x0, z0, x1, z1] of [[5, 5, 2, 2], [-6, 5, -3, 2]]) { body.line(x0, 2, z0, x1, 5, z1, 0x8a5a30); body.set(x1, 6, z1, WHITE); }
  body.box(4, 4, 6, 5, 4, 6, 0xd84a3a); body.set(4, 5, 6, 0xe8c070); // s'mores box on the stump
  // firewood stack
  for (const [x, y] of [[6, 0], [8, 0], [7, 2]]) body.box(x, y, 6, x + 1, y + 1, 8, (xx, yy, zz) => (zz === 8 ? LOG_END : pick(rnd, BARK)));
  tufts(body, rnd, 26, fpOf('hangout'), (x, z) => body.has(x, 0, z));
  const seats = [
    seat(-3, -8, 0, 3), seat(2, -8, 0, 3),
    seat(-8, -3, PI / 2, 3), seat(-8, 2, PI / 2, 3),
    seat(7, -3, -PI / 2, 3), seat(7, 2, -PI / 2, 3),
    seat(-5, 6, PI, 4), seat(4, 6, PI, 4),
  ];
  return { body, glow, parts, seats };
}

// ================================================================ HAMMOCK (1x1)
function hammock(rnd) {
  const body = new VoxelModel();
  const parts = [];
  for (const x of [-5, 4]) {
    for (let y = 0; y <= 12; y++) body.set(x, y, -1, BARK[(y + x + 9) % 3]);
    body.set(x, 13, -1, LOG_END);
    body.set(x, 0, 0, pick(rnd, GRASS)); body.set(x, 0, -2, pick(rnd, GRASS));
  }
  const ham = new VoxelModel();
  const STR = [0xe85a46, 0xf2c230, 0x3ab0a0, 0xf6f2ea];
  const sag = (x) => Math.round(10 - Math.sin(((x + 4) / 7) * PI) * 4.5);
  for (let x = -3; x <= 2; x++) {
    const y = sag(x);
    for (let z = -3; z <= 1; z++) {
      const edge = z === -3 || z === 1;
      ham.set(x, y + (edge ? 1 : 0), z, STR[(z + 3) % 4]);
      if (edge) ham.set(x, y, z, STR[(z + 3) % 4]);
    }
  }
  // spreader ropes to the posts
  for (const [x, dx] of [[-4, 1], [3, -1]]) { ham.line(x, 11, -1, x + dx, sag(x + dx) + 1, -3, ROPE); ham.line(x, 11, -1, x + dx, sag(x + dx) + 1, 1, ROPE); ham.set(x, 11, -1, ROPE); }
  // pillow + an open book
  ham.box(-3, sag(-3) + 1, -2, -2, sag(-3) + 1, 0, WHITE); ham.set(-3, sag(-3) + 2, -1, 0xe8e0d0);
  ham.set(1, sag(1) + 1, -1, 0x3a6ac0); ham.set(1, sag(1) + 1, 0, 0x3a6ac0); ham.set(1, sag(1) + 2, -1, CREAM); ham.set(1, sag(1) + 2, 0, CREAM);
  parts.push({ model: ham, pivot: [-0.5, 11, -0.5], anim: 'sway', axis: 'x', speed: 1.2, amp: 0.8 });
  // flip-flops + a lemonade on the ground
  body.box(-2, 0, 3, -1, 0, 3, 0x3ab0c0); body.box(0, 0, 3, 1, 0, 3, 0x3ab0c0);
  body.set(2, 0, 2, 0xf8e870); body.set(2, 1, 2, 0xfff8b0);
  tufts(body, rnd, 8, { w: 1, d: 1 }, (x, z) => z > -4 && z < 2 && x > -5 && x < 4);
  return { body, parts, seats: [seat(-0.5, -1, PI / 2, sag(0) + 1, { lie: true })] };
}

// ================================================================ MENU BOARD (1x1)
function menuboard(rnd) {
  const body = new VoxelModel();
  const H = 12;
  const zF = (y) => Math.round(1 - (y * 2) / H); // front board leans back
  const zB = (y) => Math.round(-3 + (y * 2) / H);
  const chalkPix = (x, y) => {
    // header squiggle, fish + mug icons, price lines
    if (y === 10 && x >= -2 && x <= 1) return (x % 2 ? 0xffffff : 0xf0e8d0);
    if (y === 8 && x >= -2 && x <= 0) return 0xf6a0a0; // fish
    if (y === 7 && x === -1) return 0xf6a0a0; if (y === 9 && x === -1) return 0xf6a0a0; if (y === 8 && x === 1) return 0xf6a0a0;
    if ((y === 5 || y === 4) && x === -2) return 0xf6d070; if (y === 5 && x === -1) return 0xf6d070; // mug
    if (y === 6 && (x === -2 || x === -1)) return 0xffffff;
    if ((y === 5 || y === 3) && x >= 0 && x <= 1) return 0xe8e4d8;
    if (y === 2 && x === -2) return 0x9ae0a0; // paw dot
    return CHALK;
  };
  for (let y = 0; y <= H; y++)
    for (let x = -3; x <= 2; x++) {
      const frame = x === -3 || x === 2 || y === H || y === 1;
      const zf = zF(y), zb = zB(y);
      if (y === 0 && !(x === -3 || x === 2)) continue;
      body.set(x, y, zf, frame ? HONEY[0] : y > 1 ? chalkPix(x, y) : HONEY[0]);
      body.set(x, y, zf - 1, frame ? HONEY[1] : WOOD_D);
      body.set(x, y, zb, frame ? HONEY[1] : CHALK);
      body.set(x, y, zb + 1, frame ? HONEY[1] : WOOD_D);
    }
  body.box(-3, H + 1, -1, 2, H + 1, -1, HONEY[2]); // hinge cap
  body.set(-1, H + 2, -1, WOOD_D); body.set(0, H + 2, -1, WOOD_D);
  body.box(-2, 2, 2, 1, 2, 2, HONEY[2]); body.set(0, 3, 2, WHITE); body.set(-1, 3, 2, 0xf6d070); // chalk tray
  // little flower pot beside it
  body.box(3, 0, 1, 4, 2, 2, 0xc8683a); body.box(3, 3, 1, 4, 3, 2, LEAF[1]); body.set(3, 4, 1, 0xd9529b); body.set(4, 4, 2, 0xf2c230);
  tufts(body, rnd, 6, { w: 1, d: 1 }, (x, z) => x >= -3 && x <= 4 && z >= -3 && z <= 2);
  return { body };
}

// ================================================================ COOLER (1x1)
function cooler(rnd) {
  const body = new VoxelModel();
  body.box(-3, 0, -2, 2, 5, 1, (x, y, z) => (y === 0 ? NAVY_D : y === 1 ? DAISY : (x === -3 || x === 2) && z === 1 ? NAVY_D : NAVY));
  body.box(-4, 6, -3, 3, 7, 2, (x, y) => (y === 6 ? 0xe8e4dc : WHITE));
  body.box(-4, 6, 2, 3, 6, 2, 0xd8d4cc);
  daisyLogo(body, -1, 3, 2, true);
  body.box(1, 4, 2, 2, 4, 2, CREAM); body.box(1, 3, 2, 2, 3, 2, CREAM);
  // side handles
  for (const x of [-4, 3]) { body.set(x, 4, -1, WHITE); body.set(x, 4, 0, WHITE); body.set(x, 5, -1, 0xd8d4cc); body.set(x, 5, 0, 0xd8d4cc); }
  body.set(-1, 5, 2, 0xc8c8c8); // latch
  // bottles + opener on top, an ice bucket beside
  bottle(body, -3, 8, -1); bottle(body, -1, 8, 0, 0x3a7a3a);
  body.set(1, 8, -1, CHROME); body.set(2, 8, -1, WOOD_D);
  body.cylinder(3, 0, -4, 1.3, 3, (x, y) => (y === 2 ? CHROME : METAL));
  body.set(3, 3, -4, 0xe8f6ff); body.set(4, 3, -4, 0xd0ecff); body.set(2, 3, -4, 0xe8f6ff);
  bottle(body, 3, 3, -3); body.set(3, 4, -4, 0x8a5a1a); body.set(3, 5, -4, DAISY);
  body.set(-4, 0, 3, 0xe8c040); body.set(-3, 0, 4, 0xe8c040); // bottle caps on the grass
  tufts(body, rnd, 6, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 4 && z >= -5 && z <= 2);
  return { body };
}

// ================================================================ STRING LIGHTS (2x1)
function stringlights(rnd) {
  const body = new VoxelModel();
  const parts = [];
  for (const x of [-9, 8]) {
    for (let y = 0; y <= 14; y++) body.set(x, y, -1, BARK[(y + x + 9) % 3]);
    body.set(x, 15, -1, LOG_END);
    body.box(x - 1, 0, -2, x + 1, 1, 0, (xx, y, z) => (y === 1 ? (xx === x && z === -1 ? BARK[0] : pick(rnd, STONE)) : 0xc8683a)); // planter base
    body.set(x + 1, 2, -2, LEAF[0]); body.set(x - 1, 2, 0, 0xd9529b);
    body.set(x + (x < 0 ? 1 : -1), 13, -1, IRON); // hook
  }
  const wire = new VoxelModel(), bulbs = new VoxelModel();
  const BULBS = [0xffd070, 0xffb860, 0xffe8a0, 0xff9a70, 0xfff0c0];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = -8 + 15 * t;
    const y = 13 - Math.sin(t * PI) * 4;
    wire.set(x, y, -1, 0x4a4438);
    if (i % 2 === 1 && i < N) bulbs.set(x, y - 1, -1, BULBS[(i >> 1) % BULBS.length]);
  }
  // pennant bunting on a second, higher strand
  const PEN = [RED, 0xf2c230, 0x3ab0a0, 0x9a86ea, WHITE];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = Math.round(-8 + 15 * t), y = Math.round(14.5 - Math.sin(t * PI) * 2);
    wire.set(x, y, -2, ROPE);
    if (i % 2 === 1 && i < N) { const c = PEN[(i >> 1) % PEN.length]; wire.set(x, y - 1, -2, c); wire.set(x, y - 2, -2, shade(c, 0.9)); }
  }
  parts.push({ model: wire, glow: bulbs, pivot: [-0.5, 13, -0.5], anim: 'sway', axis: 'x', speed: 0.9, amp: 0.4 });
  tufts(body, rnd, 10, fpOf('stringlights'), (x, z) => Math.abs(z + 1) < 2 && (Math.abs(x + 9) < 2 || Math.abs(x - 8) < 2));
  return { body, parts };
}

// ================================================================ BENCH (1x1)
function bench(rnd) {
  const body = new VoxelModel();
  const W = (x, y, z) => HONEY[(x * 3 + y + z * 7 + 99) % 3];
  for (const x of [-4, 3]) {
    body.box(x, 0, -2, x, 3, -2, IRON); body.box(x, 0, 1, x, 3, 1, IRON);
    body.box(x, 6, -2, x, 6, 2, IRON); body.set(x, 5, 1, IRON); body.set(x, 4, 1, IRON); body.set(x, 6, 2, CHROME);
    body.box(x, 5, -3, x, 10, -3, IRON);
  }
  for (const z of [-2, -1, 0, 1]) body.box(-4, 4, z, 3, 4, z, (x) => HONEY[(x + z + 20) % 3]);
  body.box(-4, 10, -3, 3, 10, -3, W);
  // Daisy Beer ad plank on the backrest
  body.box(-4, 7, -3, 3, 9, -3, (x, y) => (y === 9 || y === 7 ? NAVY_D : NAVY));
  daisyLogo(body, -2, 8, -2);
  body.box(0, 8, -2, 2, 8, -2, CREAM);
  // folded newspaper + a coffee cup
  body.box(1, 5, -1, 2, 5, 0, 0xe8e4d8); body.set(1, 6, -1, 0xd8d4c8);
  body.set(-3, 5, 0, WHITE); body.set(-3, 6, 0, 0x6a3a20);
  tufts(body, rnd, 6, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 3 && z >= -3 && z <= 2);
  return { body, seats: [seat(-2.5, -0.5, 0, 5), seat(1.5, -0.5, 0, 5)] };
}

// ================================================================ NEON SIGN (3x1)
const FONT = {
  B: ['110', '101', '110', '101', '110'], E: ['111', '100', '110', '100', '111'], A: ['010', '101', '111', '101', '101'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'], D: ['110', '101', '101', '101', '110'],
  I: ['111', '010', '010', '010', '111'], N: ['101', '111', '111', '101', '101'], "'": ['1', '1', '0', '0', '0'],
};
function textWidth(s) { let w = 0; for (const ch of s) w += FONT[ch][0].length + 1; return w - 1; }
function drawText(v, s, x0, yTop, z, color) {
  let x = x0;
  const out = [];
  for (const ch of s) {
    const g = FONT[ch];
    const tgt = typeof v === 'function' ? v(ch) : v;
    for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '1') tgt.set(x + c, yTop - r, z, color);
    out.push(x);
    x += g[0].length + 1;
  }
  return out;
}
function neonsign(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const X0 = -13, X1 = 12, Y0 = 12, Y1 = 28;
  // posts + concrete feet
  for (const x of [-10, 9]) {
    body.box(x, 0, -1, x, Y0 - 1, -1, METAL_D);
    body.box(x - 1, 0, -2, x + 1, 0, 0, STONE[1]);
  }
  // board: navy face, chrome rim, rounded top corners, back panel
  body.box(X0, Y0, -2, X1, Y1, -1, (x, y, z) => {
    if ((x === X0 || x === X1) && y === Y1) return null;
    const rim = x === X0 || x === X1 || y === Y0 || y === Y1;
    if (z === -2) return METAL_D;
    return rim ? CHROME : (x + y) % 9 === 0 ? 0x22305a : 0x1a2648;
  });
  body.box(X0 + 1, Y0 + 8, -1, X1 - 1, Y0 + 8, -1, 0x2a3a6a); // divider
  // chaser bulbs round the border (glow, two tones)
  for (let x = X0 + 1; x < X1; x += 2) { glow.set(x, Y1, 0, (x & 2) ? WARM : 0xfff0c0); glow.set(x, Y0, 0, (x & 2) ? 0xfff0c0 : WARM); }
  for (let y = Y0 + 2; y < Y1; y += 2) { glow.set(X0, y, 0, WARM); glow.set(X1, y, 0, WARM); }
  // "BEAR'S" (pink) on top, "DINER" (cyan) below; the S buzzes
  const PINK = 0xff5ab0, CYAN = 0x5af0ff;
  const top = "BEAR'S", bot = 'DINER';
  const sPart = new VoxelModel();
  const tx = Math.round(-0.5 - textWidth(top) / 2);
  drawText((ch) => (ch === 'S' ? sPart : glow), top, tx, Y1 - 2, 0, PINK);
  drawText(glow, bot, Math.round(-0.5 - textWidth(bot) / 2), Y0 + 6, 0, CYAN);
  // tube mounts behind the letters (dark, so tubes read in the day too)
  for (const [k, c] of glow.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512;
    if (y > Y0 && y < Y1 && x > X0 && x < X1) body.set(x, y, -1, 0x101830);
  }
  parts.push({ glow: sPart, pivot: [tx + 18.5, Y1 - 4, 0.5], anim: 'blink', speed: 1 });
  // little arrow underneath pointing down-right + a bear-paw badge
  body.box(X1 - 4, Y0 - 3, -1, X1 - 1, Y0 - 1, -1, (x, y) => (x - (X1 - 4) >= Y0 - 1 - y ? 0xd83a2a : null));
  glow.set(X1 - 3, Y0 - 1, 0, 0xff8a40); glow.set(X1 - 2, Y0 - 2, 0, 0xff8a40); glow.set(X1 - 1, Y0 - 3, 0, 0xff8a40);
  body.box(X0 + 1, Y0 - 3, -1, X0 + 4, Y0 - 1, -1, 0x8a5a32);
  body.set(X0 + 2, Y0 - 2, 0, 0x3a2010); body.set(X0 + 3, Y0 - 2, 0, 0x3a2010); body.set(X0 + 2, Y0 - 1, 0, 0x3a2010); body.set(X0 + 3, Y0 - 1, 0, 0x3a2010);
  // flower beds at the feet
  for (const x of [-12, -8, 7, 11]) { body.set(x, 0, 0, LEAF[1]); body.set(x, 1, 0, pick(rnd, FLOWERS)); }
  tufts(body, rnd, 12, fpOf('neonsign'), (x, z) => z >= -2 && z <= 0);
  return { body, glow, parts };
}

// ================================================================ TIKI TORCH (1x1)
function tikitorch(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  // stone base
  body.box(-2, 0, -2, 1, 0, 1, () => pick(rnd, STONE));
  // bamboo pole (2x2) with nodes
  for (let y = 1; y <= 13; y++) body.box(-1, y, -1, 0, y, 0, y % 4 === 0 ? 0xa89040 : (y % 4 === 1 ? 0xd8c070 : 0xc8b060));
  // carved tiki face on the front
  body.set(-1, 10, 1, 0x7a4a28); body.set(0, 10, 1, 0x7a4a28);
  body.set(-1, 11, 1, 0xf0e0c0); body.set(0, 11, 1, 0xf0e0c0);
  body.box(-1, 8, 1, 0, 8, 1, 0x5a3418); body.set(-1, 9, 1, 0x8a5a30); body.set(0, 9, 1, 0x8a5a30);
  // woven torch cup + rope wrap
  body.box(-2, 14, -2, 1, 17, 1, (x, y, z) => ((x + y + z) % 2 ? 0x9a6a3a : 0xc8985a));
  body.box(-1, 14, -1, 0, 17, 0, null);
  body.box(-1, 13, -1, 0, 13, 0, ROPE);
  glow.box(-1, 17, -1, 0, 17, 0, 0xff8a30);
  const flame = new VoxelModel();
  flame.box(-1, 18, -1, 0, 19, 0, (x, y) => (y === 18 ? FLAME[1] : FLAME[0]));
  flame.set(-2, 18, -1, FLAME[2]); flame.set(1, 18, 0, FLAME[2]); flame.set(0, 18, -2, FLAME[2]); flame.set(-1, 18, 1, FLAME[2]);
  flame.set(-1, 20, 0, FLAME[0]); flame.set(0, 20, -1, FLAME[1]); flame.set(-1, 21, -1, 0xfff4b0);
  parts.push({ glow: flame, pivot: [-0.5, 18, -0.5], anim: 'flicker', speed: 10 });
  // ferns at the base
  for (const [x, z] of [[2, 1], [-3, -1], [1, 2], [-2, 2]]) { body.set(x, 0, z, LEAF[0]); body.set(x, 1, z, pick(rnd, LEAF)); }
  tufts(body, rnd, 6, { w: 1, d: 1 }, (x, z) => Math.abs(x + 0.5) < 3 && Math.abs(z + 0.5) < 3);
  return { body, glow, parts };
}

// ================================================================ PLANTER BOX (1x1)
function planterbox(rnd) {
  const body = new VoxelModel();
  const parts = [];
  body.box(-4, 0, -2, 3, 3, 1, (x, y, z) => {
    const corner = (x === -4 || x === 3) && (z === -2 || z === 1);
    if (corner) return WOOD_D;
    if (y === 3) return HONEY[2];
    return y % 2 ? HONEY[0] : HONEY[1];
  });
  body.box(-3, 3, -1, 2, 3, 0, 0x4a3020); // soil
  // flowers: tulips, daisies, lavender, herbs
  for (let x = -3; x <= 2; x++)
    for (let z = -1; z <= 0; z++) {
      const k = (x + 3) * 2 + (z + 1);
      const kind = k % 4;
      if (kind === 0) { body.box(x, 4, z, x, 5, z, LEAF[0]); body.set(x, 6, z, pick(rnd, [0xe8344a, 0xf2c230, 0xf06a8a])); body.set(x, 7, z, pick(rnd, [0xe8344a, 0xf2c230])); }
      else if (kind === 1) { body.box(x, 4, z, x, 4, z, LEAF[1]); body.set(x, 5, z, WHITE); body.set(x, 6, z, 0xf2c230); }
      else if (kind === 2) { body.box(x, 4, z, x, 5, z, LEAF[3]); body.box(x, 6, z, x, 8, z, (xx, y) => (y % 2 ? 0x9a86ea : 0x8a6ad8)); }
      else { body.box(x, 4, z, x, 4 + (x & 1), z, pick(rnd, LEAF)); }
    }
  body.set(-4, 4, 1, LEAF[0]); body.set(-4, 3, 2, LEAF[2]); body.set(3, 4, -2, LEAF[1]); // trailing ivy
  // watering can
  body.box(0, 0, 3, 2, 2, 4, 0x4a9a6a); body.set(1, 3, 3, 0x4a9a6a); body.set(1, 3, 4, 0x4a9a6a);
  body.line(3, 1, 3, 4, 3, 3, 0x4a9a6a); body.set(4, 4, 3, METAL);
  // a bumblebee circling the flowers
  const bee = new VoxelModel();
  bee.set(2, 10, -1, 0xf2c230); bee.set(3, 10, -1, 0x1a1a1a); bee.set(2, 11, -1, 0xeaf6ff);
  parts.push({ model: bee, pivot: [-0.5, 10, -0.5], anim: 'rotateY', axis: 'y', speed: 1.8 });
  tufts(body, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 4 && z >= -2 && z <= 4);
  return { body, parts };
}

// ================================================================ JUKEBOX (1x1)
function jukebox(rnd) {
  const body = new VoxelModel(), glow = new VoxelModel();
  const parts = [];
  const WAL = [0x7a3e22, 0x8a4a2a], CR = 0xf0e0c0;
  const cx = -0.5;
  // cabinet with an arched top
  for (let x = -4; x <= 3; x++)
    for (let y = 0; y <= 15; y++) {
      if (y > 10) { const d = Math.hypot(x - cx, (y - 10) * 1.15); if (d > 4.3) continue; }
      for (let z = -2; z <= 1; z++) body.set(x, y, z, y === 0 ? 0x3a2010 : WAL[(y + z) & 1]);
    }
  // front face (z = 2): grille, selector panel, record window, arch of glowing tubes
  for (let x = -4; x <= 3; x++)
    for (let y = 1; y <= 15; y++) {
      const d = Math.hypot(x - cx, (y - 10) * 1.15);
      if (y > 10 && d > 4.3) continue;
      let c = null, g = null;
      if (x === -4 || x === 3) g = y % 2 ? 0xff5a8a : 0xffb040; // bubble tubes up the sides
      else if (y > 10 && d > 3.2) g = d > 3.8 ? 0xff6a3a : 0xffd050; // arch
      else if (y <= 4) c = (x % 2 ? CHROME : 0x2a2020); // speaker grille
      else if (y === 5) c = CHROME;
      else if (y <= 7) c = (x + y) % 2 ? CR : (y === 6 && x % 2 === 0 ? 0xd83a2a : CR); // selector buttons
      else if (y === 8) c = CHROME;
      else c = (x + y) % 3 === 0 ? 0x5a4a6a : 0x3a2a4a; // record window
      if (g != null) glow.set(x, y, 2, g);
      else body.set(x, y, 2, c);
    }
  // spinning-record hint + coin slot + chrome crown
  body.set(-1, 10, 2, 0x1a1a1a); body.set(0, 10, 2, 0x1a1a1a); body.set(-1, 11, 2, 0xd83a2a); body.set(0, 9, 2, 0x1a1a1a);
  body.set(2, 6, 3, CHROME); body.set(-3, 6, 3, BRASS);
  body.box(-2, 16, -1, 1, 16, 0, CHROME);
  glow.set(-1, 12, 2, 0xfff0c0); glow.set(0, 12, 2, 0xfff0c0);
  // floating music notes (glow so they read at night too)
  const note = (m, x, y, z) => { m.box(x, y, z, x + 1, y, z, 0xff5ab0); m.box(x + 1, y + 1, z, x + 1, y + 3, z, 0xff5ab0); m.set(x + 2, y + 3, z, 0xff5ab0); };
  const n1 = new VoxelModel(); note(n1, -4, 18, 0);
  const n2 = new VoxelModel(); note(n2, 1, 20, -1);
  n2.paint(() => 0x5af0ff);
  parts.push({ glow: n1, pivot: [-3, 18, 0.5], anim: 'bob', speed: 2.4, amp: 2 });
  parts.push({ glow: n2, pivot: [2, 20, -0.5], anim: 'bob', speed: 2.0, phase: 1.6, amp: 2 });
  tufts(body, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -4 && x <= 3 && z >= -2 && z <= 2);
  return { body, glow, parts };
}

// ---------------------------------------------------------------- public API
const BUILDERS = {
  bar, picnictable, roundtable, umbrellatable, bbq, hangout, hammock, menuboard, cooler, stringlights,
  bench, neonsign, tikitorch, planterbox, jukebox,
};

/**
 * Build the voxel model(s) for a restaurant structure.
 * @param {string} type one of RESTAURANT_TYPES
 * @param {{ seed?: number }} [o]
 * @returns {{ body, glow?, parts?, footprint: { w: number, d: number }, seats?: { x: number, z: number, yaw: number, y: number }[] } | null}
 */
export function restaurantModel(type, { seed = 1 } = {}) {
  const fn = BUILDERS[type];
  if (!fn) return null;
  const rnd = mulberry32((seed * 7919 + type.length * 131 + type.charCodeAt(0) * 23) >>> 0);
  const out = fn(rnd);
  const clip = (m) => m && m.paint((x, y, z, c) => (y < 0 ? null : c));
  clip(out.body); clip(out.glow);
  // glow + animated voxels win over body voxels in the same cell (no z-fighting / poking through)
  for (const o of [out.glow, ...(out.parts || []).flatMap((p) => [p.model, p.glow])]) if (o) for (const k of o.vox.keys()) out.body.vox.delete(k);
  if (out.glow && out.glow.vox.size === 0) delete out.glow;
  out.footprint = { ...fpOf(type) };
  return out;
}

export function restaurantFootprint(type) {
  return BUILDERS[type] ? { ...fpOf(type) } : null;
}
