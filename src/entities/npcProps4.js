// Props for Pip the chipmunk, the travelling lumber trader: his two-wheel
// lumber cart and his little lumber mill. Same conventions as npcProps.js ..
// npcProps3.js: Lambert + grain, geometry built lazily on first use and shared
// between copies (don't dispose it). Every maker returns a THREE.Group with
// shadows, front = +Z, 1 unit = 1 tile.
//
//   makeLumberCart()  two-wheel hand cart: a slatted bed of logs (ring ends to the front), a chalk slate
//                     "WE BUY LOGS" on two posts, a brass bell on a hook, a push bar at the back (-Z).
//                     ~0.65 x 1.1 (long side along Z), origin = ground under the axle.
//                     userData: { wheels: [L, R], bell, bar (local push-bar centre), wheelR, roll(dist), ring(), update(dt) }
//   makeLumberMill()  a little board-and-batten mill shed with a "PIP'S LUMBER" sign, open barn doors and a
//                     stovepipe; a water wheel turning under a flume on its left; a log scale with a dial; a crank
//                     saw table; a stickered plank stack; a log pile, a chopping block with an axe, sawdust.
//                     ~3 x 2 tiles, origin = bottom centre of the yard.  userData: { stand, door, wheel, blade,
//                     needle, update(dt), size }  (stand / door: local points; call update(dt) to turn the wheel)
import * as THREE from 'three';
import { VS, FV, VoxelModel, tone, hash3, buildGeo, matFor, grainMaterial, pixTex, sin, abs, max, min, PI, floor } from './critterKit.js';
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

const L = {
  bark: 0x7a5232, barkD: 0x5c3c24, barkL: 0x956842, barkDD: 0x40281a, moss: 0x6a9a3a, mossL: 0x8ab84a,
  ring: 0xf0d098, ringD: 0xcfa264, ringL: 0xfae6b8, heart: 0xa8723e,
  wood: 0xb07a46, woodD: 0x8a5a32, woodL: 0xc89058, woodDD: 0x5e3c20,
  pine: 0xe6be84, pineD: 0xc89a5c, pineL: 0xf6d8a4, pineDD: 0xa87a44,
  wall: 0xc48a52, wallD: 0xa06a3a, wallL: 0xd8a068, batten: 0x8a5a32, battenL: 0xa06c3e,
  roof: 0x4f7f8a, roofD: 0x3c6470, roofL: 0x6a9aa4, roofDD: 0x2c4a54,
  trim: 0xf2e6c8, trimD: 0xd8c8a4, dark: 0x2e1e18, darkL: 0x46302a,
  stone: 0x9a968c, stoneD: 0x7e7a72, stoneL: 0xb8b4a8,
  iron: 0x3e3e48, ironL: 0x6a6a78, ironLL: 0x9a9aa8, steel: 0xb8c0cc, steelD: 0x8a92a0, steelL: 0xe8eef6,
  brass: 0xe8c050, brassD: 0xb88e2a, brassL: 0xfff0a0,
  red: 0xd8483e, redD: 0xa8303a, redL: 0xf07a5a, green: 0x5aa04a, greenD: 0x3e7e36, greenL: 0x86c45e,
  slate: 0x34463e, slateD: 0x26342e, chalk: 0xf4f0e0,
  water: 0x4aa6d8, waterD: 0x2e7cb0, waterL: 0x9ad8f4, foam: 0xeaf8ff,
  dial: 0xfaf4e4, dialD: 0xe0d6bc, ink: 0x2a2028,
  dust: 0xf2d8a4, dustD: 0xdcb880, glow: 0xffd070, glowL: 0xfff0b0,
  leaf: 0x5aae3c, leafD: 0x3e8a2c, flower: 0xf08aa8, flowerY: 0xffd84a,
};
const barkCol = (x, y, z) => tone(x, y, z, L.bark, L.barkD, L.barkL, 0.16, 0.12);
const woodCol = (x, y, z) => tone(x, y, z, L.wood, L.woodD, L.woodL, 0.12, 0.1);
const pineCol = (x, y, z) => ((x + z + 60) % 5 === 0 ? L.pineD : tone(x, y, z, L.pine, L.pineD, L.pineL, 0.1, 0.12));

// ------------------------------------------------------------------ pixel text (3x5 font, carved / chalk)
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], G: ['.##', '#..', '#.#', '#.#', '.##'],
  I: ['###', '.#.', '.#.', '.#.', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  W: ['#.#', '#.#', '###', '###', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], "'": ['#', '#', '.', '.', '.'],
  '!': ['#', '#', '#', '.', '#'], ' ': ['..', '..', '..', '..', '..'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
};
const textTex = new Map();
/** Canvas texture of 1-2 lines in the 3x5 font. style 'carve' = burnt into a light plank, 'chalk' = chalk on slate. */
function textTexture(lines, style) {
  const key = style + '|' + lines.join('\n');
  let e = textTex.get(key);
  if (e) return e;
  const lw = (l) => [...l].reduce((s, ch) => s + (FONT[ch] || FONT[' '])[0].length + 1, -1);
  const tw = max(...lines.map(lw)), th = lines.length * 6 - 1;
  const c = document.createElement('canvas');
  c.width = tw + 2; c.height = th + 2;
  const g = c.getContext('2d');
  lines.forEach((line, li) => {
    let x0 = 1 + floor((tw - lw(line)) / 2);
    for (const ch of line) {
      const gl = FONT[ch] || FONT[' '];
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < gl[0].length; x++) {
          if (gl[y][x] !== '#') continue;
          const px = x0 + x, py = 1 + li * 6 + y;
          if (style === 'chalk') { g.fillStyle = hash3(px, py, 7) < 0.18 ? '#c8ccc0' : '#f6f2e4'; g.fillRect(px, py, 1, 1); }
          else {
            g.fillStyle = '#3a1e0e'; g.fillRect(px, py, 1, 1);
            g.fillStyle = 'rgba(255,236,190,0.55)'; if (!(gl[y + 1] && gl[y + 1][x] === '#')) g.fillRect(px, py + 1, 1, 1); // a light bevel under the carving
          }
        }
      x0 += gl[0].length + 1;
    }
  });
  e = { tex: pixTex(c), w: c.width, h: c.height };
  textTex.set(key, e);
  return e;
}
const textMats = new Map();
function textPlane(lines, style, texel) {
  const T = textTexture(lines, style);
  let m = textMats.get(T);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: T.tex, transparent: true, alphaTest: 0.5 }); textMats.set(T, m); }
  return new THREE.Mesh(new THREE.PlaneGeometry(T.w * texel, T.h * texel), m);
}

// ------------------------------------------------------------------ logs (shared)
/** A log lying along Z in fine voxels: bark round the side, rings on both ends. */
function putLog(v, cx, cy, z0, z1, r, seed = 1) {
  for (let z = z0; z <= z1; z++)
    for (let x = floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
      for (let y = floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        const end = z === z0 || z === z1;
        let c;
        if (end) c = d > r - 0.9 ? L.barkD : d < 0.9 ? L.heart : abs(d - r * 0.55) < 0.45 ? L.ringD : d < r * 0.4 ? L.ringL : L.ring;
        else if (d < r - 1.1) continue; // hollow inside (cheaper)
        else c = hash3(x + seed, y, floor(z / 3)) < 0.1 && y > cy ? L.moss : (z + seed * 3 + (x > cx ? 1 : 0)) % 7 === 0 ? L.barkDD : barkCol(x, y, z);
        v.set(x, y, z, c);
      }
}
/** Log along X (ends face left/right). */
function putLogX(v, cy, cz, x0, x1, r, seed = 1) {
  for (let x = x0; x <= x1; x++)
    for (let z = floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++)
      for (let y = floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        const d = Math.hypot(z + 0.5 - cz, y + 0.5 - cy);
        if (d > r) continue;
        const end = x === x0 || x === x1;
        let c;
        if (end) c = d > r - 0.9 ? L.barkD : d < 0.9 ? L.heart : abs(d - r * 0.55) < 0.45 ? L.ringD : L.ring;
        else if (d < r - 1.1) continue;
        else c = (x + seed * 3 + (z > cz ? 1 : 0)) % 7 === 0 ? L.barkDD : barkCol(x, y, z);
        v.set(x, y, z, c);
      }
}

// ------------------------------------------------------------------ lumber cart (0.025 voxels)
const C_WR = 9; // wheel radius
const C_AX = 9; // axle height
const C_WX = 11.5; // wheel centre |x|
const C_BAR = [0, 17.5, -31]; // push bar centre
const C_BELL = [12, 29, 13]; // bell hook
function cartModel() {
  const v = new VoxelModel();
  const X0 = -9, X1 = 8, Z0 = -13, Z1 = 12, FY = 12;
  // under-frame: two beams along Z, an iron axle across, a short front leg
  for (const bx of [-7, 6]) for (let z = Z0 - 1; z <= Z1; z++) for (let y = 10; y <= 11; y++) v.set(bx, y, z, y === 10 ? L.woodD : woodCol(bx, y, z));
  for (let x = -11; x <= 10; x++) { v.set(x, C_AX, 0, L.iron); v.set(x, C_AX, -1, L.ironL); }
  // two short back legs under the tailboard: parked it rests on them, lift the push bar and they clear the ground
  for (const lx of [X0 + 1, X1 - 1]) for (let y = 0; y <= 11; y++) v.set(lx, y, Z0, y === 0 ? L.iron : y % 4 === 0 ? L.woodD : woodCol(lx, y, 0));
  // slatted bed floor
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) v.set(x, FY, z, (x + 40) % 4 === 0 ? L.woodD : woodCol(x, FY, z));
  // stake sides (gappy rails), front + back boards, iron corner straps
  for (let z = Z0; z <= Z1; z++)
    for (const x of [X0 - 1, X1 + 1])
      for (let y = FY; y <= 19; y++) {
        const rail = y === 15 || y === 16 || y === 19 || y === FY;
        const stake = (z - Z0) % 6 === 0 || z === Z1;
        if (rail || stake) v.set(x, y, z, stake && !rail ? L.woodD : y === 19 ? L.woodL : woodCol(x, y, z));
      }
  for (let x = X0 - 1; x <= X1 + 1; x++)
    for (let y = FY; y <= 18; y++) {
      v.set(x, y, Z0 - 1, y === 18 ? L.woodL : (y + 40) % 3 === 0 ? L.woodD : woodCol(x, y, Z0 - 1)); // tailboard
      if (y <= 13) v.set(x, y, Z1 + 1, woodCol(x, y, Z1 + 1)); // low front lip (the log ends show)
    }
  for (const x of [X0 - 1, X1 + 1]) for (const z of [Z0 - 1, Z1 + 1]) for (let y = FY; y <= 21; y++) v.set(x, y, z, y >= 20 ? L.woodDD : y % 3 === 0 ? L.ironL : L.iron);
  // a painted stripe + a little chipmunk-paw stencil on each side
  for (let z = Z0 + 1; z <= Z1 - 1; z++) for (const x of [X0 - 1, X1 + 1]) if ((z - Z0) % 6) v.set(x, 17, z, L.red);
  for (const x of [X0 - 2, X1 + 2]) for (const [z, y, c] of [[-2, 13, L.trim], [-1, 13, L.trim], [-2, 14, L.trim], [-1, 14, L.trim], [-3, 15, L.trim], [-1, 15, L.trim], [0, 15, L.trim]]) v.set(x, y, z, c);
  // handles: two shafts rising to the back, a push bar wrapped in red tape
  for (let z = Z0 - 1; z >= -31; z--) {
    const y = Math.round(13 + ((Z0 - 1 - z) / 18) * 4.5);
    for (const x of [X0 + 1, X1 - 1]) { v.set(x, y, z, woodCol(x, y, z)); v.set(x, y - 1, z, L.woodD); }
  }
  for (let x = X0 + 1; x <= X1 - 1; x++) for (let y = 17; y <= 18; y++) v.set(x, y, -31, abs(x + 0.5) < 5 ? ((x + 40) % 2 ? L.red : L.redD) : y === 18 ? L.woodL : L.wood);
  // logs: three on the bottom, two on top, ring ends to the front
  const R = 3.1;
  [[-5.5, 0], [0, 0], [5.5, 0], [-2.75, 1], [2.75, 1]].forEach(([x, row], i) => putLog(v, x + 0.5, FY + 1 + R + row * 5.3, Z0 + (i % 2), Z1 - (i % 3 === 1 ? 1 : 0), R, i * 5 + 1));
  // a hatchet on top of the pile
  for (let z = -6; z <= 6; z++) v.set(0, 28 - (z > 3 ? 1 : 0), z, z < 4 ? L.woodL : L.woodD);
  for (let z = 4; z <= 7; z++) for (let y = 26; y <= 29; y++) v.set(1, y, z, z === 7 ? L.steelL : L.steel);
  // chalk slate on two posts at the front: "WE BUY LOGS"
  for (const x of [-7, 6]) for (let y = 14; y <= 34; y++) v.set(x, y, Z1 + 2, y > 32 ? L.woodDD : woodCol(x, y, 0));
  for (let x = -9; x <= 8; x++) for (let y = 23; y <= 33; y++) {
    const edge = x === -9 || x === 8 || y === 23 || y === 33;
    v.set(x, y, Z1 + 3, edge ? ((x + y) % 2 ? L.wood : L.woodL) : hash3(x, y, 2) < 0.12 ? L.slateD : L.slate);
  }
  v.set(-6, 22, Z1 + 3, L.chalk); v.set(-5, 22, Z1 + 3, L.chalk); // chalk stub on the ledge
  // bell post on the front-right corner with an iron arm
  for (let y = 19; y <= 31; y++) v.set(X1 + 1, y, Z1 + 1, y === 31 ? L.brass : L.iron);
  for (let x = X1 + 1; x <= C_BELL[0]; x++) v.set(x, 31, Z1 + 1, L.iron);
  v.set(C_BELL[0], 30, Z1 + 1, L.iron);
  return v;
}
function wheelModel() {
  // spoked wooden wheel in the YZ plane, iron tyre, centred on the hub (pivot = voxel centre)
  const v = new VoxelModel();
  for (let y = -C_WR - 1; y <= C_WR + 1; y++)
    for (let z = -C_WR - 1; z <= C_WR + 1; z++) {
      const r = Math.hypot(y, z), a = Math.atan2(y, z);
      if (r > C_WR + 0.4) continue;
      let c = null;
      if (r > C_WR - 0.8) c = (floor((a + PI) * 4) % 2) ? L.iron : L.ironL; // tyre with rivets
      else if (r > C_WR - 2.2) c = woodCol(0, y, z);
      else if (r < 2.1) c = r < 1 ? L.ironL : L.woodD;
      else { const sp = ((a / (PI / 3)) % 1 + 1) % 1; if (sp < 0.17 || sp > 0.83) c = woodCol(1, y, z); }
      if (c == null) continue;
      for (let x = -1; x <= 0; x++) v.set(x, y, z, c);
    }
  for (const x of [-2, 1]) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) v.set(x, y, z, y === 0 && z === 0 ? L.brass : L.iron); // hub caps
  return v;
}
function bellModel() {
  // brass bell hanging from its top (origin), clapper peeking out
  const v = new VoxelModel();
  for (let y = -6; y <= 0; y++) {
    const r = y === 0 ? 0.6 : y > -3 ? 1.4 : y > -5 ? 2.0 : 2.6;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, z) <= r) v.set(x, y, z, y === -6 ? L.brassD : x < 0 && z > 0 ? L.brassL : L.brass);
  }
  v.set(0, -7, 0, L.iron); v.set(0, 1, 0, L.iron);
  return v;
}

/** Pip's two-wheel lumber cart (front = +Z, push bar at -Z). */
export function makeLumberCart() {
  const body = meshOf(memoGeo('lc_body', cartModel));
  const wg = memoGeo('lc_wheel', wheelModel, [0.5, 0.5, 0.5]);
  const g = group('LumberCart', body);
  const wheels = [1, -1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * C_WX * FV, (C_AX + 0.5) * FV, 0);
    w.add(meshOf(wg));
    g.add(w);
    return w;
  });
  const bell = new THREE.Group();
  bell.position.set((C_BELL[0] + 0.5) * FV, (C_BELL[1] - 0.5) * FV, (13 + 1.5) * FV);
  bell.add(meshOf(memoGeo('lc_bell', bellModel, [0.5, 0, 0.5])));
  g.add(bell);
  const slate = textPlane(['WE BUY', 'LOGS'], 'chalk', 0.0118);
  slate.position.set(0, 28.3 * FV, (12 + 4) * FV + 0.001);
  g.add(slate);
  const R = (C_WR + 0.4) * FV;
  let swing = 0, swingV = 0;
  g.userData = {
    wheels, bell, wheelR: R, bar: new THREE.Vector3(C_BAR[0] * FV, C_BAR[1] * FV, C_BAR[2] * FV),
    /** Turn the wheels for `dist` world units of travel (negative = backwards). */
    roll(dist) { for (const w of wheels) w.rotation.x += dist / R; },
    /** Give the bell a shove (it swings and settles in update). */
    ring(kick = 1) { swingV += 9 * kick; },
    /** Bell swing spring; call each frame if you ring it. */
    update(dt) {
      dt = Math.min(dt, 0.05);
      swingV += (-90 * swing - 4 * swingV) * dt; swing += swingV * dt;
      bell.rotation.z = Math.max(-0.9, Math.min(0.9, swing));
      bell.rotation.x = swing * 0.3;
    },
    size: { w: 0.7, d: 1.15, h: 0.85 },
  };
  return g;
}

// ------------------------------------------------------------------ lumber mill (0.05 voxels + fine details)
// shed footprint (VS): x SX0..SX1, z SZ0..SZ1, walls to WH, gable ridge along Z (triangle faces the front)
const SX0 = -22, SX1 = 4, SZ0 = -19, SZ1 = -4, WH = 18;
const SCX = (SX0 + SX1 + 1) / 2; // shed centre x (corner units)
const DOOR = [-14, -5, 13]; // door x0, x1, top
const RIDGE = WH + Math.ceil((SX1 - SX0 + 1) / 2) + 1;
const WHEEL = { x: -26, y: 11, z: -10, r: 9 }; // water wheel (VS, centre)
function shedModel() {
  const v = new VoxelModel();
  const roofY = (x) => WH + 1 + Math.floor(min(x - (SX0 - 2), SX1 + 2 - x) * 0.9);
  // stone footing
  for (let x = SX0 - 1; x <= SX1 + 1; x++) for (let z = SZ0 - 1; z <= SZ1 + 1; z++) {
    const edge = x === SX0 - 1 || x === SX1 + 1 || z === SZ0 - 1 || z === SZ1 + 1;
    if (edge) v.set(x, 0, z, (x * 3 + z) % 4 === 0 ? L.stoneD : hash3(x, 0, z) > 0.8 ? L.stoneL : L.stone);
  }
  // walls: board and batten, darker log corner posts, a lighter plank band at the top
  for (let x = SX0; x <= SX1; x++)
    for (let z = SZ0; z <= SZ1; z++) {
      const sx = x === SX0 || x === SX1, sz = z === SZ0 || z === SZ1;
      if (!sx && !sz) continue;
      for (let y = 1; y <= WH; y++) {
        const corner = sx && sz;
        const along = sz ? x : z;
        let c = (along + 60) % 4 === 0 ? (y % 5 === 0 ? L.battenL : L.batten) : tone(x, y, z, L.wall, L.wallD, L.wallL, 0.12, 0.1);
        if (y === WH || y === WH - 1) c = (along + y) % 2 ? L.woodL : L.wood;
        if (corner) c = (y % 3 === 0) ? L.barkD : barkCol(x, y, z);
        v.set(x, y, z, c);
      }
    }
  // gable triangles front + back
  for (const z of [SZ0, SZ1])
    for (let x = SX0; x <= SX1; x++)
      for (let y = WH + 1; y < roofY(x); y++) v.set(x, y, z, (x + 60) % 3 === 0 ? L.batten : tone(x, y, z, L.wall, L.wallD, L.wallL, 0.12, 0.1));
  // roof: teal tin, standing seams, an overhang all round, a ridge cap
  for (let x = SX0 - 2; x <= SX1 + 2; x++)
    for (let z = SZ0 - 2; z <= SZ1 + 2; z++) {
      const y = roofY(x);
      const seam = (z + 60) % 3 === 0;
      const eave = z === SZ1 + 2 || z === SZ0 - 2 || x === SX0 - 2 || x === SX1 + 2;
      v.set(x, y, z, eave ? L.roofDD : seam ? L.roofL : hash3(x, y, z) < 0.06 ? L.roofD : L.roof);
      v.set(x, y - 1, z, L.roofD);
    }
  for (let z = SZ0 - 2; z <= SZ1 + 2; z++) { const y = roofY(Math.round(SCX - 0.5)) + 1; v.set(Math.round(SCX - 0.5), y, z, L.roofDD); v.set(Math.round(SCX - 1.5), y, z, L.roofDD); }
  // the door opening (dark inside), a few planks inside, open barn doors flat against the front
  for (let x = DOOR[0]; x <= DOOR[1]; x++) for (let y = 1; y <= DOOR[2]; y++) { v.set(x, y, SZ1, null); v.set(x, y, SZ1 - 1, y < 3 ? L.darkL : L.dark); }
  for (let x = DOOR[0]; x <= DOOR[1]; x++) v.set(x, DOOR[2] + 1, SZ1 + 1, L.woodDD); // lintel
  for (let x = DOOR[0] + 1; x <= DOOR[0] + 3; x++) for (let y = 1; y <= 9; y++) v.set(x, y, SZ1 - 2, y % 3 ? L.pineD : L.pine);
  for (const [x0, x1] of [[DOOR[0] - 5, DOOR[0] - 1], [DOOR[1] + 1, DOOR[1] + 5]])
    for (let x = x0; x <= x1; x++)
      for (let y = 1; y <= DOOR[2]; y++) {
        const fr = y === 1 || y === DOOR[2] || y === Math.round(DOOR[2] / 2);
        const brace = Math.abs((x - x0) / (x1 - x0) - ((y - 1) % 6) / 6) < 0.18 && y < DOOR[2] - 1;
        v.set(x, y, SZ1 + 1, fr || brace ? L.trim : (x + 60) % 2 ? L.red : L.redD);
      }
  // sign board on the gable (text plane goes on top)
  for (let x = -18; x <= 0; x++) for (let y = WH + 1; y <= WH + 5; y++) v.set(x, y, SZ1 + 1, x === -18 || x === 0 || y === WH + 1 || y === WH + 5 ? L.woodD : L.pineL);
  // round gable vent
  for (let x = -11; x <= -8; x++) for (let y = WH + 7; y <= WH + 10; y++) if (Math.hypot(x + 9, y - WH - 8.5) < 2.1) v.set(x, y, SZ1 + 1, Math.hypot(x + 9, y - WH - 8.5) < 1.2 ? L.dark : L.trim);
  // side window (right wall) with shutters and a flower box
  for (let z = -15; z <= -9; z++) for (let y = 7; y <= 13; y++) {
    const fr = z === -15 || z === -9 || y === 7 || y === 13 || z === -12 || y === 10;
    v.set(SX1 + 1, y, z, fr ? L.trim : y > 10 ? L.glowL : L.glow);
  }
  for (let y = 7; y <= 13; y++) for (const z of [-17, -16, -8, -7]) v.set(SX1 + 1, y, z, (y + z) % 2 ? L.green : L.greenD);
  for (let z = -16; z <= -8; z++) { v.set(SX1 + 1, 6, z, L.woodD); v.set(SX1 + 2, 6, z, L.wood); v.set(SX1 + 2, 7, z, (z % 2) ? L.leaf : (z % 3 ? L.flower : L.flowerY)); }
  // stovepipe on the right slope
  for (let y = roofY(0) - 1; y <= roofY(0) + 5; y++) for (let x = 0; x <= 1; x++) for (let z = -15; z <= -14; z++) v.set(x, y, z, y === roofY(0) + 5 ? L.ironL : L.iron);
  for (let x = -1; x <= 2; x++) for (let z = -16; z <= -13; z++) v.set(x, roofY(0) + 6, z, L.iron);
  // water-wheel side: an axle box on the left wall + the flume on stilts + a wooden tub under the wheel
  for (let y = WHEEL.y - 1; y <= WHEEL.y + 1; y++) for (let z = WHEEL.z - 1; z <= WHEEL.z + 1; z++) v.set(SX0 - 1, y, z, L.woodDD);
  for (let x = WHEEL.x + 2; x <= SX0 - 1; x++) v.set(x, WHEEL.y, WHEEL.z, L.iron);
  const FY = WHEEL.y + WHEEL.r + 2;
  for (let z = SZ0 - 4; z <= WHEEL.z - 2; z++) {
    for (let x = WHEEL.x - 2; x <= WHEEL.x + 3; x++) {
      const side = x === WHEEL.x - 2 || x === WHEEL.x + 3;
      v.set(x, FY, z, woodCol(x, FY, z));
      if (side) v.set(x, FY + 1, z, (z % 3) ? L.wood : L.woodD);
      else v.set(x, FY + 1, z, (z + x) % 4 === 0 ? L.waterL : L.water);
    }
  }
  for (const z of [SZ0 - 3, WHEEL.z - 4]) for (const x of [WHEEL.x - 2, WHEEL.x + 3]) for (let y = 0; y < FY; y++) if (z < WHEEL.z - WHEEL.r - 1 || y > WHEEL.y + WHEEL.r) v.set(x, y, z, y % 4 === 0 ? L.woodDD : L.woodD);
  // the spill: water pouring off the flume end onto the wheel's front paddles
  for (let y = WHEEL.y + 3; y <= FY; y++) for (let x = WHEEL.x - 1; x <= WHEEL.x + 2; x++) v.set(x, y, WHEEL.z - 1 + (y < FY - 2 ? 0 : 0), (x + y) % 3 === 0 ? L.foam : (x + y) % 2 ? L.waterL : L.water);
  // tub
  for (let x = WHEEL.x - 4; x <= WHEEL.x + 5; x++)
    for (let z = WHEEL.z - WHEEL.r - 2; z <= WHEEL.z + WHEEL.r + 2; z++)
      for (let y = 0; y <= 3; y++) {
        const wall = x === WHEEL.x - 4 || x === WHEEL.x + 5 || z === WHEEL.z - WHEEL.r - 2 || z === WHEEL.z + WHEEL.r + 2;
        if (wall) v.set(x, y, z, y === 1 ? L.iron : y === 3 ? L.woodL : woodCol(x, y, z));
        else if (y === 2) v.set(x, y, z, hash3(x, y, z) < 0.15 ? L.foam : (x + z) % 5 === 0 ? L.waterL : L.water);
      }
  return v;
}
function millWheelModel() {
  // paddle wheel in the YZ plane (axis X), pivot at the hub
  const v = new VoxelModel();
  const R = WHEEL.r;
  for (let y = -R - 2; y <= R + 2; y++)
    for (let z = -R - 2; z <= R + 2; z++) {
      const r = Math.hypot(y, z), a = Math.atan2(y, z);
      for (const x of [-2, 2]) {
        if (r <= R + 0.4 && r > R - 1.2) v.set(x, y, z, (floor((a + PI) * 3) % 2) ? L.wood : L.woodD); // rims
        else if (r < 2.2) v.set(x, y, z, r < 1 ? L.iron : L.woodDD);
        else if (r < R - 1.2) { const s = ((a / (PI / 4)) % 1 + 1) % 1; if (s < 0.12 || s > 0.88) v.set(x, y, z, woodCol(x, y, z)); }
      }
      // paddles across both rims every 30 degrees
      const s = ((a / (PI / 6)) % 1 + 1) % 1;
      if (r > R - 2 && r <= R + 2.2 && (s < 0.08 || s > 0.92)) for (let x = -2; x <= 2; x++) v.set(x, y, z, r > R + 1.2 ? L.woodL : x === 0 ? L.wood : woodCol(x, y, z));
    }
  for (let x = -3; x <= 3; x++) v.set(x, 0, 0, L.ironL);
  return v;
}

// fine-voxel details in mill space (FV = half a VS): scale, saw table, plank stack, log pile, block + axe, sawdust
const SCALE = [5, 15]; // log scale centre x, z (FV)
const SAW = [32, 8]; // saw table centre
const DIAL = [SCALE[0], 30, SCALE[1] - 5]; // dial centre (FV) - the needle pivots here
function detailModel() {
  const v = new VoxelModel();
  const rnd = mulberry32(31);
  // ---- log scale: iron frame, plank platform, a column up to a big round dial; a log on the platform
  {
    const [cx, cz] = SCALE;
    for (let x = cx - 9; x <= cx + 8; x++) for (let z = cz - 6; z <= cz + 7; z++) {
      const rim = x === cx - 9 || x === cx + 8 || z === cz - 6 || z === cz + 7;
      v.set(x, 0, z, L.iron); v.set(x, 1, z, rim ? L.ironL : L.iron);
      if (!rim) v.set(x, 2, z, (z + 40) % 3 === 0 ? L.woodD : woodCol(x, 2, z));
    }
    for (let y = 1; y <= 24; y++) for (let x = cx - 1; x <= cx; x++) for (let z = cz - 8; z <= cz - 7; z++) v.set(x, y, z, y % 6 === 0 ? L.ironLL : x === cx - 1 ? L.ironL : L.iron);
    // dial housing (cream face, brass rim, ticks) facing +Z
    for (let x = cx - 8; x <= cx + 7; x++) for (let y = DIAL[1] - 8; y <= DIAL[1] + 7; y++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - DIAL[1]);
      if (r > 7.6) continue;
      v.set(x, y, DIAL[2] - 2, L.ironL);
      v.set(x, y, DIAL[2] - 1, r > 6.6 ? (r > 7.1 ? L.brassD : L.brass) : L.dial);
      const a = Math.atan2(y + 0.5 - DIAL[1], x + 0.5 - cx);
      if (r > 4.8 && r <= 6.6 && a > -0.5 && a < PI + 0.5) { const tk = ((a / (PI / 6)) % 1 + 1) % 1; if (tk < 0.16 || tk > 0.84) v.set(x, y, DIAL[2] - 1, r > 5.6 ? L.ink : L.dialD); }
      if (r > 4.6 && r <= 6.6 && a > -0.5 && a < 0.2) v.set(x, y, DIAL[2] - 1, L.red); // red "too heavy!" zone
    }
    v.set(cx, DIAL[1] + 8, DIAL[2] - 1, L.brass); v.set(cx - 1, DIAL[1] + 8, DIAL[2] - 1, L.brass);
    putLogX(v, 7, cz, cx - 8, cx + 7, 4.2, 3);
    // brass counterweights stacked on the base
    for (const [x, y, r] of [[cx + 11, 0, 2.4], [cx + 11, 2, 1.8], [cx + 11, 4, 1.2]]) for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (Math.hypot(a, b) <= r) { v.set(x + a, y, cz + b, L.brass); v.set(x + a, y + 1, cz + b, a < 0 ? L.brassL : L.brassD); }
  }
  // ---- crank saw table: thick top, braced legs, a slot for the blade, a half-cut plank, a crank wheel + belt
  {
    const [cx, cz] = SAW, TOP = 17;
    for (let x = cx - 14; x <= cx + 13; x++) for (let z = cz - 7; z <= cz + 6; z++) for (let y = TOP - 1; y <= TOP; y++) {
      if (abs(z - cz) < 1 && x > cx - 8 && x < cx + 8 && y === TOP) continue; // blade slot
      v.set(x, y, z, y < TOP ? L.woodD : (x + 60) % 7 === 0 ? L.woodD : woodCol(x, y, z));
    }
    for (const lx of [cx - 13, cx + 11]) for (const lz of [cz - 6, cz + 4]) for (let y = 0; y < TOP - 1; y++) for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) v.set(lx + a, y, lz + b, y === 0 ? L.woodDD : a ? L.wood : L.woodD);
    for (let x = cx - 12; x <= cx + 11; x++) { v.set(x, 5, cz - 6, L.woodD); v.set(x, 5, cz + 5, L.wood); }
    // blade guard housing below (iron) + belt to the crank
    for (let x = cx - 4; x <= cx + 3; x++) for (let y = 8; y <= TOP - 2; y++) for (let z = cz - 2; z <= cz + 1; z++) v.set(x, y, z, L.iron);
    for (let y = 4; y <= 13; y++) v.set(cx + 13 + Math.round((y - 4) * 0.0), y, cz + 6, (y % 2) ? L.ink : L.iron);
    // crank wheel on the right end (axis X)
    const kx = cx + 15, ky = 9, kz = cz;
    for (let y = ky - 5; y <= ky + 5; y++) for (let z = kz - 5; z <= kz + 5; z++) {
      const r = Math.hypot(y - ky, z - kz);
      if (r <= 4.8 && (r > 3.6 || r < 1.2 || abs(y - ky) < 0.6 || abs(z - kz) < 0.6)) v.set(kx, y, z, r > 3.6 ? L.red : L.iron);
    }
    for (let x = kx; x <= kx + 3; x++) v.set(x, ky + 4, kz + 0, L.iron);
    for (let y = ky + 4; y <= ky + 7; y++) v.set(kx + 3, y, kz, L.woodL);
    // a plank being cut, a pencil line and a push stick
    for (let x = cx - 18; x <= cx + 2; x++) for (let z = cz - 4; z <= cz + 3; z++) v.set(x, TOP + 1, z, x === cx - 18 ? L.ring : pineCol(x, TOP + 1, z));
    for (let x = cx - 18; x <= cx + 2; x++) if (x % 2) v.set(x, TOP + 2, cz, L.ink);
    for (let x = cx + 6; x <= cx + 12; x++) v.set(x, TOP + 1, cz + 4, x === cx + 12 ? L.redD : L.red);
  }
  // ---- stickered plank stack (back right): 5 layers of planks with spacer sticks, ends showing
  for (let layer = 0; layer < 5; layer++) {
    const y0 = 2 + layer * 3;
    for (let pk = 0; pk < 4; pk++) {
      const z0 = -34 + pk * 5;
      for (let x = 14 - (layer % 2) * 2; x <= 52 - ((layer + pk) % 3); x++)
        for (let z = z0; z <= z0 + 3; z++)
          for (let y = y0; y <= y0 + 1; y++) v.set(x, y, z, x === 14 - (layer % 2) * 2 || x === 52 - ((layer + pk) % 3) ? (y === y0 ? L.ringD : L.ring) : pineCol(x, y, z));
    }
    for (const sx of [17, 32, 48]) for (let z = -35; z <= -15; z++) v.set(sx, y0 + 2, z, L.woodD); // stickers
  }
  for (const sx of [17, 32, 48]) for (let z = -35; z <= -15; z++) { v.set(sx, 0, z, L.woodDD); v.set(sx, 1, z, L.woodD); } // bearers
  for (let y = 0; y <= 18; y++) v.set(53 + Math.round(y * 0.15), y, -14, y > 14 ? L.woodDD : L.woodL); // a broom leaning on the stack
  for (let x = 51; x <= 55; x++) for (let y = 0; y <= 2; y++) v.set(x, y, -14, L.flowerY);
  // ---- little log pile (front left): 3 + 2 + 1, ends to the front
  [[-52, 3.6, 0], [-44, 3.6, 0], [-36, 3.6, 0], [-48, 10.4, 1], [-40, 10.4, 1], [-44, 17.2, 2]].forEach(([x, y, row], i) => putLog(v, x, y, 14 + row, 30 - (i % 2), 3.6, i * 7 + 2));
  for (const [x, z] of [[-55, 30], [-33, 30], [-55, 14], [-33, 14]]) for (let y = 0; y <= 6; y++) v.set(x, y, z, L.woodD); // pegs
  // ---- chopping block with the axe in it (right of the door)
  {
    const bx = 18, bz = 30;
    for (let y = 0; y <= 6; y++) for (let x = bx - 4; x <= bx + 4; x++) for (let z = bz - 4; z <= bz + 4; z++) {
      const r = Math.hypot(x - bx, z - bz);
      if (r > 4.2) continue;
      v.set(x, y, z, y === 6 ? (r > 3.4 ? L.barkD : abs(r - 2) < 0.5 ? L.ringD : L.ring) : barkCol(x, y, z));
    }
    for (let k = 0; k <= 11; k++) v.set(bx - 1 - Math.round(k * 0.45), 7 + k, bz + Math.round(k * 0.3), k > 9 ? L.woodDD : L.woodL);
    for (let x = bx - 1; x <= bx + 2; x++) for (let y = 5; y <= 8; y++) v.set(x, y, bz, y === 5 ? L.steelD : L.steel);
    v.set(bx + 2, 7, bz, L.steelL); v.set(bx + 2, 8, bz, L.steelL);
  }
  // ---- sawdust + chips + a few flowers round the yard
  for (let i = 0; i < 70; i++) {
    const x = Math.round(-30 + rnd() * 90), z = Math.round(-6 + rnd() * 42);
    if (!v.has(x, 0, z) && !v.has(x, 1, z)) v.set(x, 0, z, rnd() < 0.55 ? L.dust : rnd() < 0.5 ? L.dustD : L.pineL);
  }
  for (const [x, z, c] of [[-60, 36, L.flower], [-58, 38, L.flowerY], [58, 34, L.flower], [60, 30, 0xb89ad8], [-26, 36, L.flowerY]]) { v.set(x, 0, z, L.leafD); v.set(x, 1, z, L.leaf); v.set(x, 2, z, c); v.set(x + 1, 1, z, L.leaf); }
  return v;
}
function needleModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 5; y++) v.set(0, y, 0, y > 3 ? L.red : L.ink);
  v.set(0, 0, 1, L.brass);
  return v;
}
function bladeModel() {
  // circular saw blade in the XY plane (axis Z), pivot at the arbor
  const v = new VoxelModel();
  for (let x = -7; x <= 7; x++) for (let y = -7; y <= 7; y++) {
    const r = Math.hypot(x, y), a = Math.atan2(y, x);
    const tooth = ((a / (PI / 8)) % 1 + 1) % 1;
    if (r > 7.4 || (r > 6.4 && tooth > 0.5)) continue;
    v.set(x, y, 0, r < 1.2 ? L.brass : r > 6.2 ? L.steelL : (x + y) % 5 === 0 ? L.steelD : L.steel);
  }
  return v;
}
function dropsModel() {
  // a few splash droplets for the wheel tub (spun with the wheel's phase)
  const v = new VoxelModel();
  for (const [x, y, z] of [[0, 0, 0], [2, 2, -1], [-2, 1, 1], [1, 4, 1], [-1, 3, -2]]) v.set(x, y, z, y > 2 ? L.foam : L.waterL);
  return v;
}

/** Pip's little lumber mill (front = +Z): shed + water wheel + scale + saw table + plank stack, ~3 x 2 tiles. */
export function makeLumberMill() {
  const shed = meshOf(memoGeo('lm_shed', shedModel, [0, 0, 0], VS));
  const det = meshOf(memoGeo('lm_det', detailModel));
  const g = group('LumberMill', shed, det);
  // water wheel (turns), saw blade (spins when userData.sawing), scale needle (wobbles), splash drops
  const wheel = new THREE.Group();
  wheel.position.set((WHEEL.x + 0.5) * VS, (WHEEL.y + 0.5) * VS, (WHEEL.z + 0.5) * VS);
  wheel.add(meshOf(memoGeo('lm_wheel', millWheelModel, [0.5, 0.5, 0.5], VS)));
  g.add(wheel);
  const blade = new THREE.Group();
  blade.position.set((SAW[0] + 0.5) * FV, 15 * FV, (SAW[1] + 0.5) * FV);
  blade.add(meshOf(memoGeo('lm_blade', bladeModel, [0.5, 0.5, 0.5])));
  g.add(blade);
  const needle = new THREE.Group();
  needle.position.set((SCALE[0] + 0) * FV, (DIAL[1] + 0) * FV, (DIAL[2] + 0) * FV);
  needle.add(meshOf(memoGeo('lm_needle', needleModel, [0.5, 0, 0]), { shadows: false }));
  g.add(needle);
  const drops = new THREE.Group();
  drops.position.set((WHEEL.x + 0.5) * VS, 0.15, (WHEEL.z + WHEEL.r) * VS);
  drops.add(meshOf(memoGeo('lm_drops', dropsModel, [0.5, 0, 0.5]), { shadows: false, emissive: 0x204060 }));
  g.add(drops);
  // the sign: "PIP'S LUMBER", burnt into the pale board on the gable
  const sign = textPlane(["PIP'S", 'LUMBER'], 'carve', 0.0124);
  sign.position.set(-8.5 * VS, (WH + 3.5) * VS, (SZ1 + 2) * VS + 0.002);
  g.add(sign);
  let t = 0;
  g.userData = {
    wheel, blade, needle, sawing: false,
    stand: new THREE.Vector3(-0.45, 0, 0.7), // where Pip likes to stand (local), in front of the door by the scale
    door: new THREE.Vector3((DOOR[0] + DOOR[1] + 1) / 2 * VS, 0, SZ1 * VS + 0.1),
    size: { w: 3, d: 2, h: (RIDGE + 7) * VS },
    update(dt) {
      t += dt;
      wheel.rotation.x -= dt * 0.9; // water pours on the front: it turns toward the camera at the top
      if (g.userData.sawing) blade.rotation.z -= dt * 24;
      needle.rotation.z = -0.55 + sin(t * 2.1) * 0.03 + sin(t * 5.3) * 0.015; // a log sitting on the scale, a little bounce
      const u = (t * 1.6) % 1;
      drops.position.y = 0.12 + u * 0.12 - u * u * 0.16;
      drops.scale.setScalar(u < 0.8 ? 1 : (1 - u) * 5);
    },
  };
  g.userData.update(0);
  return g;
}

