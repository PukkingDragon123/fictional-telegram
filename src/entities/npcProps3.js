// Homestead props for Chip the woodpecker, the meadow's master carpenter: his
// tree house and an outdoor workbench. Same conventions as npcProps.js /
// npcProps2.js: Lambert + grain, geometry built lazily on first use and shared
// between copies (don't dispose it). Every maker returns a THREE.Group with
// shadows, front = +Z, 1 unit = 1 tile.
//
//   makeTreeHouse()  a big hollow oak with a cottage built round the trunk: a round red door in the trunk
//                    (lantern, doormat), a deck with a porch rail + bunting, round and side windows (warm glow),
//                    a shingle roof disappearing into a clumpy crown (a few apples), a rope ladder, a hanging
//                    carpenter's sign, a pulley bucket of pinecones, a birdhouse mailbox, a chopping block,
//                    a lumber stack and curly wood shavings.  ~3 x 3 tiles, ~4 tall; origin = trunk base centre.
//                    userData: { door, stand, bucket, size }  (door / stand: local points; bucket: the hanging bucket group)
//   makeWorkbench()  carpenter's bench: a vise clamping a board, a hand plane + shavings, a birdhouse in progress,
//                    planks, a nail jar and a mug; a pegboard of tools behind; a sawhorse with a plank and a saw.
//                    ~2 x 1 tiles (long side along X), origin = bottom centre.  userData: { top } (bench-top height)
import * as THREE from 'three';
import { VS, FV, VoxelModel, ell, tone, hash3, buildGeo, matFor, grainMaterial, sin, cos, abs, max, min, PI, floor } from './critterKit.js';
import { mulberry32 } from '../core/rng.js';

// ------------------------------------------------------------------ prop plumbing
const geoMemo = new Map();
function memoGeo(key, build, pivot = [0, 0, 0], scale = FV) {
  let g = geoMemo.get(key);
  if (!g) { g = buildGeo(build(), pivot, scale); geoMemo.set(key, g); }
  return g;
}
function meshOf(geo, { shadows = true, emissive = 0, amount = 0.08 } = {}) {
  const m = new THREE.Mesh(geo, emissive ? grainMaterial(geo.userData.scale, geo.userData.grain, amount, emissive) : matFor(geo, amount));
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}
function group(name, ...meshes) {
  const g = new THREE.Group();
  g.name = name;
  for (const m of meshes) g.add(m);
  return g;
}

const T = {
  bark: 0x7a5232, barkD: 0x5c3c24, barkL: 0x956842, barkDD: 0x40281a, moss: 0x6a9a3a, mossD: 0x527e2e, mossL: 0x8ab84a,
  ring: 0xecc890, ringD: 0xc89a5e,
  deck: 0xb07a46, deckD: 0x8a5a32, deckL: 0xc89058, trim: 0x6e4426, trimL: 0x8a5a32,
  wall: 0xe4b474, wallD: 0xc8965a, wallL: 0xf2cc8c,
  frame: 0xf6eedc, frameD: 0xdcd0b8,
  roof: 0xc0703e, roofD: 0xa05a32, roofL: 0xd8884e, roofDD: 0x7a4024,
  door: 0xd0543a, doorD: 0xa83e2c, doorL: 0xe87458, sage: 0x6aa88a, sageD: 0x4e8a6e, sageL: 0x8ac4a4,
  brass: 0xe8c050, brassD: 0xb88e2a, iron: 0x3e3e48, ironL: 0x6a6a78, steel: 0x9aa2b0, steelD: 0x646a78, steelL: 0xdce2ec,
  glow: 0xffd070, glowL: 0xfff0b0, glowD: 0xf0a040,
  leaf: 0x4f9c44, leafD: 0x3f8a3a, leafDD: 0x2f7034, leafL: 0x6ab852, leafLL: 0x8ccc62, apple: 0xd8403a, appleL: 0xff7a5a,
  stone: 0x9a968c, stoneD: 0x7e7a72, stoneL: 0xb4b0a4,
  rope: 0xd8c090, ropeD: 0xb89a68, pine: 0xeac48a, pineD: 0xcc9c5c, pineL: 0xf8deac, pineDD: 0xa87a44, knot: 0x8a5a2e,
  maple: 0xd8a868, mapleD: 0xb88848, mapleL: 0xecc488,
  red: 0xd8403a, redD: 0xa82a28, yellow: 0xffd84a, blue: 0x5a9ad8, green: 0x5aae3c, pink: 0xf08aa8, white: 0xfaf6ea, cream: 0xf4e8c8,
  shave: 0xfbe6b8, shaveD: 0xe8c890, cone: 0x8a5a2e, coneD: 0x6a4020, pot: 0xc86a3a, potD: 0xa04e2a,
  peg: 0xc89a62, pegD: 0xa87a44, hole: 0x5a3a22, ink: 0x2a2028,
};
const TAU2 = PI * 2;
const deckCol = (x, y, z) => tone(x, y, z, T.deck, T.deckD, T.deckL, 0.1, 0.1);
const pineCol = (x, y, z) => ((z + 40) % 3 === 0 ? T.pineD : tone(x, y, z, T.pine, T.pineD, T.pineL, 0.1, 0.12));
const ropeCol = (y) => ((y + 40) % 2 ? T.rope : T.ropeD);

// ------------------------------------------------------------------ tree house (0.05 voxels)
const DECK = 31; // deck boards (top surface at y = 32)
const HX0 = -15, HX1 = 14, HZ0 = -13, HZ1 = 12, W0 = DECK + 1, W1 = DECK + 15; // cottage walls
const DX0 = -19, DX1 = 18, DZ0 = -17, DZ1 = 17; // deck
const LAD = [-13, -9]; // gap in the front rail for the ladder (x)
const trunkR = (y) => (y < 4 ? 12.6 - y * 0.55 : 10.4 - (y - 4) * 0.028);
const DW = 6, DT = 23; // trunk door: half width, top
const inDoor = (x, y) => y >= 1 && (y <= DT - DW ? abs(x + 0.5) <= DW : Math.hypot(x + 0.5, y + 0.5 - (DT - DW)) <= DW);

function barkCol(x, y, z) {
  const a = Math.atan2(z + 0.5, x + 0.5);
  const rid = floor(a * 7 + sin(y * 0.15 + a * 3) * 0.9) & 1;
  const h = hash3(x, y, z);
  if (y < 14 && (z < 0 || x < -7) && h < (14 - y) * 0.05) return h < 0.12 ? T.mossD : y < 4 ? T.moss : T.mossL; // moss on the shady side
  return rid ? (h < 0.25 ? T.barkDD : T.barkD) : tone(x, y, z, T.bark, T.barkD, T.barkL, 0.12, 0.12);
}
function wallCol(x, y, z) { return (y - W0) % 3 === 2 ? T.wallD : tone(x, y, z, T.wall, T.wallD, T.wallL, 0.08, 0.1); }

function treeHouseModel() {
  const v = new VoxelModel(), g = new VoxelModel();
  const rnd = mulberry32(4127);
  // --- trunk: a hollow shell with a flared base
  for (let y = 0; y <= 74; y++) {
    const R = trunkR(y);
    for (let x = -14; x <= 13; x++)
      for (let z = -14; z <= 13; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > R || r < R - 2.4) continue;
        v.set(x, y, z, barkCol(x, y, z));
      }
  }
  // --- roots snaking out (kept clear of the door, the ladder and the lumber stack)
  for (const [a, L] of [[0.05, 9], [0.85, 7], [2.3, 7], [2.8, 8], [3.75, 9], [4.7, 8], [5.5, 8]]) {
    for (let d = 8; d <= 12 + L; d += 0.7) {
      const u = (d - 8) / (L + 4), wob = sin(d * 0.5 + a * 3) * 0.9;
      const cx = cos(a) * d - sin(a) * wob, cz = sin(a) * d + cos(a) * wob;
      ell(v, cx, (1 - u) * 2.6, cz, 2.6 - u * 1.5, 3.2 * (1 - u) + 0.7, 2.6 - u * 1.5, (x, y, z) => (y < 0 ? null : barkCol(x, y, z)));
    }
  }
  // --- round red door in the trunk: recessed planks, arched frame, porthole, hinges, knob, threshold
  for (let x = -DW - 2; x <= DW + 1; x++)
    for (let y = 0; y <= DT + 2; y++) {
      const R = trunkR(y), zf = floor(Math.sqrt(max(0, R * R - (x + 0.5) ** 2)));
      if (inDoor(x, y)) {
        for (let z = zf - 2; z <= zf + 1; z++) v.set(x, y, z, null);
        let c = (x + 30) % 3 === 0 ? T.doorD : x <= -3 && y > 12 ? T.doorL : T.door;
        if ((y === 5 || y === 15) && x < 0) c = T.iron; // strap hinges
        v.set(x, y, zf - 2, c); v.set(x, y, zf - 3, T.doorD);
        const pr = Math.hypot(x + 0.5, y + 0.5 - 17.5);
        if (pr < 2.3) { v.set(x, y, zf - 2, null); g.set(x, y, zf - 2, pr < 1.2 ? T.glowL : T.glow); }
        else if (pr < 3.2) v.set(x, y, zf - 1, T.iron);
      } else if (y >= 1 && (inDoor(x - 1, y) || inDoor(x + 1, y) || inDoor(x, y - 1) || inDoor(x - 1, y - 1) || inDoor(x + 1, y - 1))) {
        v.set(x, y, zf, (x + y) % 4 === 0 ? T.trim : T.trimL); v.set(x, y, zf - 1, T.trim);
      }
    }
  { const zf = floor(Math.sqrt(trunkR(10) ** 2 - 9)); v.set(3, 10, zf - 1, T.brass); v.set(3, 9, zf - 1, T.brassD); }
  for (let x = -DW - 1; x <= DW; x++) { const zf = floor(Math.sqrt(trunkR(0) ** 2 - (x + 0.5) ** 2)); v.set(x, 0, zf - 1, T.trimL); v.set(x, 0, zf, T.trim); }
  // --- deck with fascia + joists, four braces into the trunk, two front posts
  const Rd = trunkR(DECK) - 0.6;
  for (let x = DX0; x <= DX1; x++)
    for (let z = DZ0; z <= DZ1; z++) {
      if (Math.hypot(x + 0.5, z + 0.5) < Rd) continue;
      const edge = x === DX0 || x === DX1 || z === DZ0 || z === DZ1;
      v.set(x, DECK, z, edge ? T.deckD : (z + 40) % 3 === 0 ? T.deckD : deckCol(x, DECK, z));
      if (edge) v.set(x, DECK - 1, z, T.trim);
      else if ((x + 40) % 6 === 0) v.set(x, DECK - 1, z, T.trim);
    }
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const a = Math.atan2(sz, sx * 0.8);
    v.line(cos(a) * 9, 14, sin(a) * 9, sx * 15, DECK - 2, sz * 13, T.trim, 0.5);
  }
  for (const x of [DX0, DX1 - 1])
    for (let y = 0; y < DECK; y++)
      for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) v.set(x + dx, y, DZ1 - 1 + dz, y < 2 ? T.barkD : (y + dx) % 5 === 0 ? T.barkD : dx ? T.bark : T.barkL);
  // --- porch rail: posts, balusters, top rail (gap for the ladder)
  const railAt = (x, z, post) => {
    const top = DECK + 5;
    for (let y = DECK + 1; y < top; y++) if (post || (x + z) % 2 === 0) v.set(x, y, z, post ? T.trim : T.deckD);
    v.set(x, top, z, T.deckL);
    if (!post) v.set(x, DECK + 2, z, T.deckD);
    if (post) v.set(x, top + 1, z, T.trimL);
  };
  for (let x = DX0; x <= DX1; x++) { if (x >= LAD[0] && x <= LAD[1]) continue; railAt(x, DZ1, x === DX0 || x === DX1 || x === LAD[0] - 1 || x === LAD[1] + 1 || x % 6 === 0); }
  for (let z = HZ1 + 1; z < DZ1; z++) { railAt(DX0, z, false); railAt(DX1, z, false); }
  // --- cottage walls: lap siding, corner posts, sill + top plate
  for (let y = W0; y <= W1; y++) {
    for (let x = HX0; x <= HX1; x++) for (const z of [HZ0, HZ1]) v.set(x, y, z, wallCol(x, y, z));
    for (let z = HZ0; z <= HZ1; z++) for (const x of [HX0, HX1]) v.set(x, y, z, wallCol(x, y, z));
    for (const [x, z] of [[HX0, HZ0], [HX0, HZ1], [HX1, HZ0], [HX1, HZ1]]) v.set(x, y, z, T.trim);
  }
  for (let x = HX0; x <= HX1; x++) { v.set(x, W0, HZ1 + 1, T.trim); v.set(x, W1, HZ1 + 1, T.trimL); }
  // front door (sage green, round top), cream frame, brass knob
  const d2 = (x, y) => x >= -12 && x <= -6 && y >= W0 && (y <= W0 + 9 || Math.hypot(x + 8.5, y + 0.5 - (W0 + 9)) <= 3.6);
  for (let x = -14; x <= -4; x++)
    for (let y = W0; y <= W0 + 14; y++) {
      if (d2(x, y)) v.set(x, y, HZ1, (x + 30) % 2 ? T.sageD : x === -11 && y > W0 + 6 ? T.sageL : T.sage);
      else if (d2(x - 1, y) || d2(x + 1, y) || d2(x, y - 1)) v.set(x, y, HZ1 + 1, T.frame);
    }
  v.set(-7, W0 + 5, HZ1 + 1, T.brass);
  // round window with a cross mullion + a flower box
  const WC = [5, W0 + 8.5];
  for (let x = -1; x <= 10; x++)
    for (let y = W0 + 2; y <= W0 + 14; y++) {
      const r = Math.hypot(x + 0.5 - WC[0], y + 0.5 - WC[1]);
      if (r < 3.7) {
        v.set(x, y, HZ1, null);
        g.set(x, y, HZ1, x === WC[0] || x === WC[0] - 1 || y === floor(WC[1]) ? T.frame : r < 1.6 ? T.glowL : (x + y) % 5 === 0 ? T.glowD : T.glow);
        if (x === WC[0] || x === WC[0] - 1 || y === floor(WC[1])) { g.set(x, y, HZ1, null); v.set(x, y, HZ1, T.frame); }
      } else if (r < 4.7) v.set(x, y, HZ1 + 1, r < 4.2 ? T.frame : T.frameD);
    }
  for (let x = 0; x <= 9; x++) {
    v.set(x, W0 + 1, HZ1 + 1, T.trim); v.set(x, W0 + 2, HZ1 + 2, T.trimL); v.set(x, W0 + 1, HZ1 + 2, T.trim);
    const fc = [T.red, T.yellow, T.pink, T.white, T.red, T.blue][x % 6];
    v.set(x, W0 + 3, HZ1 + 2, x % 2 ? fc : T.green);
    if (x % 3 === 1) v.set(x, W0 + 4, HZ1 + 2, fc);
  }
  // side windows with open shutters
  for (const [xw, xo] of [[HX0, HX0 - 1], [HX1, HX1 + 1]])
    for (let z = -6; z <= 5; z++)
      for (let y = W0 + 4; y <= W0 + 11; y++) {
        const inW = z >= -3 && z <= 2 && y >= W0 + 5 && y <= W0 + 10;
        if (inW) { v.set(xw, y, z, null); g.set(xw, y, z, z === 0 || y === W0 + 7 ? null : (z + y) % 4 === 0 ? T.glowD : T.glow); if (z === 0 || y === W0 + 7) v.set(xw, y, z, T.frame); }
        else if (z >= -4 && z <= 3 && y >= W0 + 4 && y <= W0 + 11) v.set(xo, y, z, T.frame);
        else if (y >= W0 + 5 && y <= W0 + 10) v.set(xo, y, z, (y + 40) % 2 ? T.sage : T.sageD);
      }
  // --- roof: stepped cedar shakes around the trunk, dark eave lip, a little moss
  const RY0 = W1 + 1;
  for (let i = 0; i <= 11; i++) {
    const y = RY0 + i;
    const x0 = HX0 - 3 + i, x1 = HX1 + 3 - i, z0 = HZ0 - 3 + i, z1 = HZ1 + 3 - i;
    if (x1 - x0 < 3) break;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        if (!(x === x0 || x === x1 || z === z0 || z === z1)) continue;
        if (Math.hypot(x + 0.5, z + 0.5) < trunkR(y) - 0.3) continue;
        const along = x === x0 || x === x1 ? z : x;
        const seam = (along + i * 2 + 40) % 4 === 0;
        let c = i === 0 ? T.roofDD : seam ? T.roofD : i % 2 ? T.roof : T.roofL;
        if (i > 0 && hash3(x, y, z) < 0.06) c = hash3(z, x, y) < 0.5 ? T.moss : T.mossL;
        v.set(x, y, z, c);
        if (i === 0) v.set(x, y - 1, z, T.roofDD);
      }
  }
  // bunting under the front eave
  for (let x = HX0 - 2; x <= HX1 + 2; x++) {
    const sag = Math.round(sin(((x - HX0 + 2) / (HX1 - HX0 + 4)) * PI * 2) * 0.6);
    v.set(x, W1 - 1 + sag, HZ1 + 3, T.ink);
    if ((x + 40) % 3 === 0) { const c = [T.red, T.yellow, T.blue, T.green][((x + 40) / 3) % 4]; v.set(x, W1 - 2 + sag, HZ1 + 3, c); v.set(x + 1, W1 - 2 + sag, HZ1 + 3, c); v.set(x, W1 - 3 + sag, HZ1 + 3, c); }
  }
  // --- branches + a clumpy crown (shells only), with a few apples
  for (const [sx, sz, h] of [[-1, 0.3, 0], [1, -0.2, 2], [-0.4, -1, 1], [0.5, 0.9, 3]]) v.line(sx * 6, 54 + h, sz * 6, sx * 19, 61 + h, sz * 15, T.barkD, 0.6);
  const leafCol = (x, y, z, cy, ry) => {
    const h = hash3(x, y, z), up = (y + 0.5 - cy) / ry;
    if (h > 0.988 && up > -0.3) return h > 0.995 ? T.appleL : T.apple;
    if (up > 0.5) return h < 0.2 ? T.leaf : h > 0.7 ? T.leafLL : T.leafL;
    if (up < -0.3) return h < 0.35 ? T.leafDD : T.leafD;
    return h < 0.18 ? T.leafD : h > 0.82 ? T.leafL : T.leaf;
  };
  const blob = (cx, cy, cz, rx, ry, rz) => {
    for (let x = floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2;
          if (d > 1 || d < 0.55) continue;
          v.set(x, y, z, leafCol(x, y, z, cy, ry));
        }
  };
  const CY = 66;
  blob(0, CY, -1, 23, 9, 19);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * PI * 2, e = -0.35 + rnd() * 1.25;
    const r = 6 + rnd() * 3.5;
    const px = cos(a) * cos(e) * 22, py = CY + sin(e) * 9, pz = -1 + sin(a) * cos(e) * 18;
    blob(px, py, pz, r, r * 0.8, r);
  }
  return { v, g };
}

// fine-voxel details in tree-house space (0.025 voxels): ladder, sign, pulley, lantern, mailbox, lumber, chopping block, shavings, pots
function shavings(v, rnd, cx, cz, rad, n) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * PI * 2, d = Math.sqrt(rnd()) * rad;
    const x0 = cx + cos(a) * d, z0 = cz + sin(a) * d, ang = rnd() * PI;
    const R = 1.2 + rnd() * 1.2, c = rnd() < 0.5 ? T.shave : T.shaveD;
    for (let k = 0; k < 7; k++) {
      const u = (k / 6) * PI * 1.4;
      v.set(x0 + cos(ang) * cos(u) * R, Math.round(R - cos(u) * R) * 0.5 + (sin(u) > 0 ? 0 : 0), z0 + sin(ang) * cos(u) * R + sin(u) * 0.6, k === 3 ? T.pineD : c);
    }
  }
}
function detailModel() {
  const v = new VoxelModel(), g = new VoxelModel();
  const rnd = mulberry32(911);
  const F = (n) => n * 2; // 0.05 voxels -> fine voxels
  // --- rope ladder from the gap in the porch rail down to the roots
  const lz = F(DZ1 + 1);
  for (const x of [F(LAD[0]) + 1, F(LAD[1]) + 1]) {
    for (let y = 0; y <= F(DECK + 5); y++) v.set(x, y, lz + (y < 3 ? 3 - y : 0), ropeCol(y));
    v.set(x, F(DECK + 5) + 1, lz, T.ropeD); v.set(x + 1, 1, lz + 3, T.ropeD); // knots
  }
  for (let y = 5; y <= F(DECK); y += 7)
    for (let x = F(LAD[0]) + 1; x <= F(LAD[1]) + 1; x++) { v.set(x, y, lz, x === F(LAD[0]) + 1 || x === F(LAD[1]) + 1 ? T.ropeD : pineCol(x, y, lz)); v.set(x, y, lz + 1, T.pineD); }
  // --- hanging carpenter's sign on a bracket off the front-right post: crossed hammer + saw
  const sx0 = 37, sx1 = 51, sy0 = 34, sy1 = 47, sz = F(DZ1) + 1;
  for (let x = F(DX1) + 1; x <= sx1 + 1; x++) { v.set(x, sy1 + 7, sz, T.iron); v.set(x, sy1 + 8, sz, x === sx1 + 1 ? T.ironL : T.iron); }
  v.set(F(DX1) + 1, sy1 + 6, sz, T.iron); v.set(F(DX1) + 2, sy1 + 5, sz, T.iron); v.set(F(DX1) + 3, sy1 + 4, sz, T.iron);
  for (const x of [sx0 + 2, sx1 - 2]) for (let y = sy1 + 1; y <= sy1 + 6; y++) v.set(x, y, sz, y % 2 ? T.steel : T.steelD);
  for (let x = sx0; x <= sx1; x++)
    for (let y = sy0; y <= sy1; y++) {
      const edge = x === sx0 || x === sx1 || y === sy0 || y === sy1;
      v.set(x, y, sz, edge ? T.trim : pineCol(x, y, sz)); v.set(x, y, sz - 1, T.pineDD);
    }
  // icon (board space 0..12): saw from bottom-left to top-right, hammer the other way
  const ix = sx0 + 1, iy = sy0 + 1, P = (x, y, c) => v.set(ix + x, iy + y, sz + 1, c);
  for (let k = 3; k <= 11; k++) { P(k, k, T.steel); P(k, k - 1, T.steelL); if (k & 1) P(k + 1, k - 2, T.steelD); }
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 3], [3, 2], [0, 2], [2, 0]]) P(x, y, T.red);
  P(1, 0, T.redD); P(0, 1, T.redD);
  for (let k = 0; k <= 7; k++) P(11 - k, 1 + k, T.door);
  for (const [x, y] of [[2, 9], [3, 10], [4, 11], [1, 8], [3, 8], [4, 9], [5, 10]]) P(x, y, y + x > 12 ? T.steelL : T.steelD);
  // --- pulley: arm out of the right side of the deck, wheel, rope to a cleat on the rail
  const pz = -12;
  for (let x = F(DX1) + 2; x <= 58; x++) for (let y = 58; y <= 59; y++) for (let z = pz - 1; z <= pz; z++) v.set(x, y, z, y === 59 ? T.deckL : T.trim);
  for (let k = 0; k <= 10; k++) v.set(F(DX1) + 2 + k, 46 + k, pz, T.trim); // strut
  for (let a = 0; a < 20; a++) { const x = Math.round(54 + cos((a / 20) * TAU2) * 3.2), y = Math.round(54 + sin((a / 20) * TAU2) * 3.2); v.set(x, y, pz, T.iron); v.set(x, y, pz - 1, T.ironL); }
  for (let k = -2; k <= 2; k++) { v.set(54 + k, 54, pz, T.trimL); v.set(54, 54 + k, pz, T.trimL); }
  v.set(54, 54, pz + 1, T.brass); v.set(54, 57, pz, T.iron); v.set(54, 58, pz, T.iron);
  for (let k = 0; k <= 14; k++) v.set(Math.round(51 - k * 0.8), Math.round(54 + k * 1.05), pz, ropeCol(k)); // back to the rail
  // --- lantern by the door (frame; the glass glows)
  const L = [-19, 34, 14];
  for (let k = 0; k <= 3; k++) v.set(L[0] + k * 0, L[1] + 8, L[2] - 3 + k, T.iron);
  v.set(L[0], L[1] + 7, L[2], T.iron);
  for (let x = -2; x <= 1; x++)
    for (let y = 0; y <= 6; y++)
      for (let z = -2; z <= 1; z++) {
        const cap = y === 0 || y === 6, corner = abs(x + 0.5) > 1 && abs(z + 0.5) > 1;
        if (cap || corner) v.set(L[0] + x, L[1] + y, L[2] + z, y === 6 && !corner ? T.ironL : T.iron);
        else g.set(L[0] + x, L[1] + y, L[2] + z, y === 3 ? T.glowL : T.glow);
      }
  // --- birdhouse mailbox on a post (front left) with a little red flag
  const M = [-44, 44];
  for (let y = 0; y <= 22; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(M[0] + x, y, M[1] + z, y < 2 ? T.barkD : T.trim);
  for (let x = -5; x <= 4; x++)
    for (let z = -5; z <= 4; z++)
      for (let y = 23; y <= 30; y++) {
        const shell = abs(x + 0.5) > 4 || abs(z + 0.5) > 4 || y === 23;
        if (shell) v.set(M[0] + x, y, M[1] + z, (y + 40) % 3 === 0 ? T.sageD : T.sage);
      }
  for (let i = 0; i <= 6; i++) for (let z = -6; z <= 5; z++) { v.set(M[0] - 6 + i, 31 + i, M[1] + z, z === -6 || z === 5 ? T.redD : T.red); v.set(M[0] + 5 - i, 31 + i, M[1] + z, z === -6 || z === 5 ? T.redD : T.red); }
  for (const [x, y] of [[-1, 26], [0, 26], [-1, 27], [0, 27]]) v.set(M[0] + x, y, M[1] + 5, T.ink); // round hole
  v.set(M[0] - 1, 24, M[1] + 6, T.trim); v.set(M[0], 24, M[1] + 6, T.trim); // perch
  for (let y = 26; y <= 33; y++) v.set(M[0] + 6, y, M[1] - 2, T.ink);
  for (const [y, z] of [[33, -1], [33, 0], [32, -1], [32, 0], [33, 1]]) v.set(M[0] + 6, y, M[1] + z, T.red);
  // --- lumber stack on the left (planks crosswise, a log on top)
  for (let layer = 0; layer < 4; layer++) {
    const y0 = layer * 2, along = layer % 2 === 0;
    for (let p = 0; p < 4 - (layer >> 1); p++)
      for (let a = 0; a < 26; a++)
        for (let w = 0; w < 3; w++)
          for (let yy = y0; yy <= y0 + 1; yy++) {
            const x = along ? -58 + p * 4 + w : -60 + a * 0.6, z = along ? -22 + a : -20 + p * 6 + w;
            if (!along && a > 24) continue;
            const end = along ? a === 0 || a === 25 : a === 0 || a === 24;
            v.set(x, yy, z, end ? ((yy + w) % 2 ? T.ring : T.ringD) : pineCol(x, yy, z));
          }
  }
  for (let z = -20; z <= 2; z++) for (let x = -56; x <= -50; x++) for (let y = 8; y <= 13; y++) if (Math.hypot(x + 52.5, y - 10.5) < 3.2) v.set(x, y, z, z === 2 || z === -20 ? (Math.hypot(x + 52.5, y - 10.5) < 1.5 ? T.ringD : T.ring) : barkCol(x, y, z));
  // --- chopping block + hatchet + split logs (front right)
  const B = [24, 42];
  for (let y = 0; y <= 9; y++)
    for (let x = -7; x <= 6; x++)
      for (let z = -7; z <= 6; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > 6.6 - (y > 8 ? 0.6 : 0)) continue;
        v.set(B[0] + x, y, B[1] + z, y === 9 ? (r < 1.5 ? T.ringD : Math.round(r) % 2 ? T.ring : T.ringD) : barkCol(x, y, z));
      }
  for (let y = 10; y <= 12; y++) for (let x = -2; x <= 2; x++) v.set(B[0] + x, y, B[1], y === 10 ? T.steelD : x === 2 ? T.steelL : T.steel); // blade in the block
  for (let k = 0; k <= 10; k++) for (let w = 0; w <= 1; w++) v.set(B[0] - 3 - k, 12 + Math.round(k * 0.5), B[1] + w, k > 8 ? T.red : (k + w) % 3 ? T.maple : T.mapleD); // handle
  for (const [x, z, r] of [[B[0] + 11, B[1] - 2, 0.3], [B[0] + 9, B[1] + 6, -0.6]])
    for (let k = -5; k <= 5; k++) for (let w = -1; w <= 1; w++) for (let y = 0; y <= 2; y++) {
      const xx = Math.round(x + cos(r) * k - sin(r) * w), zz = Math.round(z + sin(r) * k + cos(r) * w);
      v.set(xx, y, zz, abs(k) === 5 ? T.ring : y === 2 && w === 0 ? T.pineL : y === 0 ? T.barkD : w === 1 ? T.bark : T.pine);
    }
  // --- curly wood shavings everywhere he works
  shavings(v, rnd, B[0], B[1], 13, 26);
  shavings(v, rnd, 10, 34, 8, 12);
  shavings(v, rnd, -14, 38, 6, 6);
  // --- doormat
  for (let x = -8; x <= 7; x++) for (let z = 27; z <= 32; z++) v.set(x, 0, z, x === -8 || x === 7 || z === 27 || z === 32 ? T.redD : (x + 40) % 4 < 2 ? T.cream : T.red);
  // --- potted plants on the porch
  for (const [px, pzz] of [[F(DX1) - 4, F(DZ1) - 4], [F(LAD[0]) - 6, F(DZ1) - 4], [F(HX1) - 3, F(HZ1) + 4]]) {
    const y0 = F(DECK + 1);
    for (let y = y0; y <= y0 + 4; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(px + x, y, pzz + z, y === y0 + 4 ? T.potD : (x + z) % 3 ? T.pot : T.potD);
    for (const [x, y, z] of [[0, 5, 0], [-1, 6, 0], [1, 7, -1], [0, 8, 1], [-2, 7, 1], [1, 6, 1], [-1, 8, -1], [0, 9, 0]]) v.set(px + x, y0 + y, pzz + z, y > 7 ? T.leafL : (x + y) % 2 ? T.leaf : T.leafD);
  }
  return { v, g };
}
function bucketModel() {
  // wooden bucket of pinecones on its rope (origin = rope top at the pulley wheel; the bucket hangs 24 fine voxels below)
  const v = new VoxelModel();
  for (let y = -24; y <= 0; y++) v.set(0, y, 0, ropeCol(y));
  for (let k = -4; k <= 4; k++) v.set(k, Math.round(-24 - 0.12 * k * k), 0, T.iron); // handle
  for (let y = -38; y <= -28; y++)
    for (let x = -6; x <= 5; x++)
      for (let z = -6; z <= 5; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = 5.4 + (y + 38) * 0.06;
        if (r > R || (r < R - 1.3 && y > -38)) continue;
        const band = y === -36 || y === -30;
        v.set(x, y, z, band ? T.iron : Math.floor(Math.atan2(z + 0.5, x + 0.5) * 3) % 2 ? T.deck : T.deckL);
      }
  for (const [x, z] of [[-2, -1], [1, 1], [-1, 2], [2, -2], [0, 0]]) for (let y = -29; y <= -26; y++) v.set(x, y, z, (y + x) % 2 ? T.cone : T.coneD);
  v.set(0, -25, 0, T.cone); v.set(3, -27, 2, T.pineL); v.set(3, -26, 2, T.pine);
  return v;
}

/** Chip's tree house: big hollow oak, a cottage on a deck round the trunk, door at the trunk base (front = +Z). */
export function makeTreeHouse() {
  let parts = geoMemo.get('th_parts');
  if (!parts) {
    const t = treeHouseModel(), d = detailModel();
    parts = {
      body: buildGeo(t.v, [0, 0, 0], VS), glow: buildGeo(t.g, [0, 0, 0], VS),
      det: buildGeo(d.v, [0, 0, 0], FV), detGlow: buildGeo(d.g, [0, 0, 0], FV),
      bucket: buildGeo(bucketModel(), [0, 0, 0], FV),
    };
    geoMemo.set('th_parts', parts);
  }
  const body = meshOf(parts.body), det = meshOf(parts.det);
  const glow = meshOf(parts.glow, { emissive: 0x8a6420, shadows: false }), detGlow = meshOf(parts.detGlow, { emissive: 0x8a6420, shadows: false });
  const bucket = group('Bucket', meshOf(parts.bucket));
  bucket.position.set(56.5 * FV, 54 * FV, -12 * FV);
  const g = group('TreeHouse', body, glow, det, detGlow, bucket);
  g.userData.door = new THREE.Vector3(0, 0, trunkR(0) * VS + 0.06);
  g.userData.stand = new THREE.Vector3(0.32, 0, 1.45); // where Chip likes to stand (local)
  g.userData.bucket = bucket;
  g.userData.size = { w: 3, d: 3, h: 4.1 };
  return g;
}

// ------------------------------------------------------------------ workbench (0.025 voxels)
const TOP = 19; // bench-top layer (surface at 20 fine voxels = 0.5)
const mapleCol = (x, y, z) => ((x + 60) % 6 === 0 ? T.mapleD : tone(x, y, z, T.maple, T.mapleD, T.mapleL, 0.1, 0.1));
function benchModel() {
  const v = new VoxelModel();
  const X0 = -32, X1 = 17, Z0 = -9, Z1 = 8;
  // thick butcher-block top + legs, stretchers, a bottom shelf
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) for (let y = TOP - 2; y <= TOP; y++) v.set(x, y, z, y < TOP && (z === Z1 || x === X0 || x === X1) ? T.mapleD : mapleCol(x, y, z));
  for (const lx of [X0 + 1, X1 - 3]) for (const lz of [Z0 + 1, Z1 - 3]) for (let y = 0; y < TOP - 2; y++) for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) v.set(lx + a, y, lz + b, y < 1 ? T.trim : a === 0 || b === 2 ? T.mapleD : T.maple);
  for (let x = X0 + 1; x <= X1 - 1; x++) for (let z = Z0 + 1; z <= Z1 - 1; z++) v.set(x, 5, z, (z + 40) % 3 === 0 ? T.deckD : T.deck);
  for (let x = X0 + 1; x <= X1 - 1; x++) { v.set(x, 14, Z1 - 1, T.mapleD); v.set(x, 15, Z1 - 1, T.maple); v.set(x, 16, Z1 - 1, T.maple); }
  // drawer with a brass pull
  for (let x = -12; x <= 2; x++) for (let y = 13; y <= 16; y++) v.set(x, y, Z1, x === -12 || x === 2 || y === 13 ? T.trimL : T.mapleL);
  v.set(-6, 15, Z1 + 1, T.brass); v.set(-4, 15, Z1 + 1, T.brass); v.set(-5, 15, Z1 + 1, T.brassD);
  // shelf: toolbox + paint can + offcuts
  for (let x = -26; x <= -16; x++) for (let z = -5; z <= 3; z++) for (let y = 6; y <= 10; y++) { const sh = x === -26 || x === -16 || z === -5 || z === 3 || y === 6; if (sh) v.set(x, y, z, y === 10 ? T.redD : T.red); }
  for (let x = -22; x <= -20; x++) v.set(x, 12, -1, T.iron); v.set(-22, 11, -1, T.iron); v.set(-20, 11, -1, T.iron);
  for (let y = 6; y <= 10; y++) for (let x = -10; x <= -6; x++) for (let z = -2; z <= 2; z++) if (Math.hypot(x + 7.5, z + 0.5) < 2.6) v.set(x, y, z, y === 10 ? T.steelD : y === 8 ? T.white : T.blue);
  for (let x = 0; x <= 12; x++) for (let z = -4; z <= 1; z++) v.set(x, 6, z, x === 0 || x === 12 ? T.ring : pineCol(x, 6, z));
  // vise on the front-left corner: wooden jaw, steel screw + T-handle, a board clamped in it
  for (let x = X0 + 1; x <= X0 + 9; x++) for (let y = TOP - 7; y <= TOP; y++) v.set(x, y, Z1 + 2, y === TOP ? T.mapleL : x === X0 + 1 || x === X0 + 9 ? T.mapleD : T.maple);
  for (let z = Z1 + 3; z <= Z1 + 7; z++) v.set(X0 + 5, TOP - 4, z, T.steel);
  for (let y = TOP - 8; y <= TOP; y++) v.set(X0 + 5, y, Z1 + 7, y === TOP - 8 || y === TOP ? T.trim : T.steelL);
  for (let x = X0 + 2; x <= X0 + 8; x++) for (let y = TOP + 1; y <= TOP + 9; y++) v.set(x, y, Z1 + 1, y === TOP + 9 ? T.ring : pineCol(x, y, 0));
  // pegboard behind, framed, a grid of holes
  const PZ = Z0 - 2, PY0 = TOP + 1, PY1 = TOP + 34, PX0 = X0, PX1 = X1;
  for (let x = PX0; x <= PX1; x++)
    for (let y = PY0; y <= PY1; y++) {
      const edge = x === PX0 || x === PX1 || y === PY1 || y === PY0;
      v.set(x, y, PZ, edge ? T.trim : (x + 60) % 3 === 0 && (y + 60) % 3 === 0 ? T.hole : (x + y) % 7 === 0 ? T.pegD : T.peg);
    }
  for (const x of [PX0 + 1, PX1 - 1]) for (let y = TOP + 1; y <= PY1; y++) v.set(x, y, PZ - 1, T.trim); // posts
  const hook = (x, y) => { v.set(x, y, PZ + 1, T.steelD); v.set(x, y + 1, PZ + 2, T.steelD); };
  const Z = PZ + 2;
  // hammer
  hook(-27, 46); for (let y = 34; y <= 45; y++) v.set(-27, y, Z, y < 37 ? T.red : T.maple);
  for (let x = -30; x <= -24; x++) for (let y = 46; y <= 47; y++) v.set(x, y, Z, x === -24 ? T.steelL : T.steel);
  // handsaw
  hook(-18, 48);
  for (let y = 31; y <= 47; y++) for (let x = -21; x <= -21 + Math.round((y - 31) * 0.3) + 2; x++) v.set(x, y, Z, y === 31 || x === -21 ? T.steelD : T.steel);
  for (let y = 41; y <= 48; y++) for (let x = -17; x <= -14; x++) if (!(y >= 43 && y <= 46 && x >= -16 && x <= -15)) v.set(x, y, Z, T.maple);
  // three chisels
  for (const [x, c] of [[-10, T.red], [-8, T.blue], [-6, T.green]]) { hook(x, 48); for (let y = 37; y <= 47; y++) v.set(x, y, Z, y < 41 ? T.steel : y < 42 ? T.brass : c); }
  // carpenter's square
  hook(0, 50); for (let y = 30; y <= 50; y++) v.set(-2, y, Z, y % 3 ? T.steelL : T.ink); for (let x = -2; x <= 8; x++) v.set(x, 30, Z, x % 3 ? T.steelL : T.ink);
  // brace drill
  hook(8, 50);
  for (let y = 36; y <= 50; y++) v.set(8, y, Z, y > 48 ? T.maple : T.steel);
  for (let k = 0; k <= 5; k++) { v.set(9 + (k < 3 ? k : 5 - k), 41 + k, Z, T.steel); }
  v.set(11, 43, Z, T.maple); v.set(11, 44, Z, T.maple); v.set(8, 35, Z, T.steelD);
  // wrench + pliers + a coil of string
  hook(13, 48); for (let y = 36; y <= 47; y++) v.set(13, y, Z, T.steel); v.set(12, 47, Z, T.steel); v.set(14, 47, Z, T.steel); v.set(12, 36, Z, T.steelD); v.set(14, 36, Z, T.steelD);
  for (let a = 0; a < 16; a++) v.set(Math.round(-29 + cos((a / 16) * TAU2) * 3), Math.round(29 + sin((a / 16) * TAU2) * 3), Z, a % 2 ? T.red : T.cream);
  // painted woodpecker-head plaque on the top rail (red crest!)
  for (const [x, y, c] of [[-4, 52, T.red], [-3, 53, T.red], [-2, 53, T.red], [-3, 52, T.red], [-2, 52, T.ink], [-1, 52, T.ink], [-3, 51, T.white], [-2, 51, T.white], [-1, 51, T.ink], [0, 51, T.steelD], [1, 51, T.steelD], [-2, 50, T.white]]) v.set(x, y, PZ + 1, c);
  // on the top: a hand plane with a shaving curling out, planks, a birdhouse in progress, nail jar, mug, pencil
  const ty = TOP + 1;
  for (let x = -6; x <= 3; x++) for (let z = -2; z <= 1; z++) for (let y = ty; y <= ty + 2; y++) v.set(x, y, z, y === ty + 2 ? (x >= -2 && x <= 0 ? T.red : T.steel) : x === -6 || x === 3 ? T.mapleD : T.maple);
  for (const [x, y] of [[-4, 3], [-3, 4], [-2, 4]]) v.set(x, ty + y, -1, T.maple);
  for (let k = 0; k < 8; k++) v.set(4 + k * 0.8, ty + Math.round(sin(k * 0.9) * 1.5 + 1.5), Math.round(cos(k * 0.9) * 1.5) - 1, k % 2 ? T.shave : T.shaveD);
  for (let layer = 0; layer < 3; layer++) for (let x = 6 - layer * 2; x <= 16; x++) for (let z = -8 + layer; z <= -5 + layer; z++) v.set(x, ty + layer, z, x === 16 ? T.ring : pineCol(x, ty + layer, z));
  const BH = [-18, -2];
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) for (let y = 0; y <= 7; y++) {
    const shell = abs(x + 0.5) > 3 || abs(z + 0.5) > 3;
    if (shell || y === 0) v.set(BH[0] + x, ty + y, BH[1] + z, (y + 40) % 2 ? T.pine : T.pineL);
  }
  for (const [x, y] of [[-1, 4], [0, 4], [-1, 5], [0, 5]]) v.set(BH[0] + x, ty + y, BH[1] + 4, T.ink);
  for (let i = 0; i <= 4; i++) for (let z = -5; z <= 4; z++) v.set(BH[0] - 5 + i, ty + 8 + i, BH[1] + z, (z + i) % 2 ? T.red : T.redD); // half the roof on
  for (let y = 0; y <= 4; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (Math.hypot(x + 0.5, z + 0.5) < 2) v.set(9 + x, ty + y, 4 + z, y === 4 ? T.brass : y > 0 && (x + y + z) % 3 === 0 ? T.steelL : 0xd8f0f8);
  for (let y = 0; y <= 3; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (Math.hypot(x + 0.5, z + 0.5) < 2.1 && (y === 0 || Math.hypot(x + 0.5, z + 0.5) > 1.2)) v.set(-27 + x, ty + y, 4 + z, y === 3 ? T.white : T.blue);
  v.set(-25, ty + 2, 4, T.blue); v.set(-27, ty + 3, 4, 0x6a3a1a);
  for (let x = -14; x <= -8; x++) v.set(x, ty, 5, x === -8 ? T.ink : x === -9 ? T.pineL : T.red);
  // sawhorse on the right with a long plank and a saw resting on it
  for (let x = 22; x <= 37; x++) for (let y = 12; y <= 13; y++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === 13 ? T.pineL : pineCol(x, y, z));
  for (const ex of [23, 35]) for (const s of [-1, 1]) for (let y = 0; y <= 11; y++) { const z = Math.round((s > 0 ? 0 : -1) + s * (11 - y) * 0.4); v.set(ex, y, z, T.pineD); v.set(ex + 1, y, z, pineCol(ex + 1, y, z)); }
  for (let x = 19; x <= 39; x++) for (let y = 14; y <= 15; y++) for (let z = -3; z <= 2; z++) v.set(x, y, z, x === 19 || x === 39 ? ((y + z) & 1 ? T.ring : T.ringD) : pineCol(x, y, z));
  for (let z = -5; z <= 9; z++) { const top = Math.round(19 - (z + 5) * 0.15); for (let y = 16; y <= top; y++) v.set(30, y, z, y === top ? T.steelD : T.steel); }
  for (let z = -9; z <= -5; z++) for (let y = 16; y <= 21; y++) if (!(z >= -8 && z <= -6 && y >= 17 && y <= 20)) v.set(30, y, z, T.maple);
  // sawdust + shavings on the ground
  const rnd = mulberry32(77);
  for (let i = 0; i < 40; i++) { const x = Math.round(-36 + rnd() * 76), z = Math.round(-6 + rnd() * 22); if (!v.has(x, 0, z)) v.set(x, 0, z, rnd() < 0.5 ? T.shave : T.pineL); }
  shavings(v, rnd, -8, 14, 10, 14);
  shavings(v, rnd, 30, 8, 8, 8);
  return v;
}

/** Chip's outdoor carpenter's bench with a pegboard of tools and a sawhorse (front = +Z). */
export function makeWorkbench() {
  const g = group('Workbench', meshOf(memoGeo('workbench', benchModel)));
  g.userData.top = (TOP + 1) * FV;
  return g;
}
