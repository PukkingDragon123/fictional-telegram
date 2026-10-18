// [v28 house] Reynard's cottage by the pond (replaces the old log hut in buildings.js).
//
// Voxel scale 0.1, footprint 3x3 tiles (x 0..29, z 0..29 voxels), origin at the
// footprint's corner (world.js puts the group at HUT.x, 0, HUT.z), front = +z.
// Log walls x 0..29 / z 3..20, the door centred at x = 1.5 (homePC / Ambient /
// Tutorial anchors), the chimney top at (0.75, 3.1, 0.75) where Ambient puffs smoke.
//
// Layers (all merged voxel geometry, one draw call each):
//   body      lit voxels (voxelMaterial: shadows, grain, snow on roofs)
//   interior  the little rooms behind each window, door and the lab window: unlit,
//             their light baked into the vertex colours (warm falloff round each
//             lamp), dimmed by day and glowing at night (fx.update)
//   glow      lamp shades, lanterns, rooftop letters, lab flasks (day: plain paint,
//             night: bright, blooms)
//   glass     one quad per pane, a pixel glass texture (blue-white edges, highlight
//             streaks), see-through: the rooms show behind it
//   puffs     a few voxel smoke puffs looping above the chimney pot (instanced)
//   pools     warm light spilling on the ground in front at night (additive quads)
//
//   const g = buildHut();          // THREE.Group
//   g.userData.fx.update(time, night); // per frame (world.update)
//   HUT_SPOTS                      // local centres of the front panes + door (trailer)
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';
import { voxelText, flagModel } from './buildings.js';

const S = 0.1; // world units per voxel

// ------------------------------------------------------------------ palette
const P = {
  stone: [0x8f897f, 0x7f7a72, 0x9a948a, 0x736e67], mortar: 0x5c5853,
  logL: [0xb57a48, 0xab7142, 0xbb804c], logD: [0x8f5b33, 0x85532f, 0x97613a], knot: 0x6a4325, plate: 0x9e6a3e,
  endA: 0xe0b47c, endB: 0xc28d56,
  trim: 0xf1e6cb, trimD: 0xd8c7a1, trimS: 0xbfae8a,
  shut: [0x3d7a55, 0x478a60], shutD: 0x2c5c3f, iron: 0x2b2a2d,
  door: [0xc2483a, 0xb23f32], doorD: 0x7e2a20, brass: 0xe8bc48, brassD: 0xa9822c,
  shingle: [[0xb2483a, 0xa64234], [0x9c3e31, 0xa94536]], shingleL: 0xc65a44, seam: 0x7a2c22, moss: [0x7f8f46, 0x6c7d3c],
  ridge: 0x5b241c, ridgeL: 0x7a3326, soffit: 0x5e3d26, fascia: 0xe9dcbc,
  gable: [0x84593a, 0x76502f],
  deck: [0xbf9160, 0xae8253], deckEdge: 0x8c6644, step: 0x9a958c,
  box: [0x7d5232, 0x6e4829], soil: 0x3f2b1e,
  leaf: [0x4f8b3c, 0x3f7a31, 0x5c9a44], bloom: [0xe0453a, 0xf06d9c, 0xf6f1e6, 0xf3c335, 0xd8433a],
  copper: 0xc4793e, copperD: 0x9a5a2c, flag: 0xdadada,
  post: 0xa8703e, postL: 0xbc844c,
  sign: [0x4a3020, 0x543724], signFr: 0x2e1e14,
};
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
function scaleHex(hex, k, kg = k, kb = k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * kg));
  const b = Math.min(255, Math.round((hex & 255) * kb));
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------------ layout (voxels)
const X0 = 0, X1 = 29, Z0 = 3, Z1 = 20; // log walls
const WALL_TOP = 16;
const EAVE_Y = 17; // main roof: y = EAVE_Y + min(z - 1, 22 - z), ridge at z 11/12
const roofY = (z) => EAVE_Y + Math.min(z - 1, 22 - z);
// front windows: openings 5 wide (pane 2 | mullion | pane 2), y 5..13 (rails at 5 / 9 / 13)
const WINS = [{ x: 4, room: 'living' }, { x: 21, room: 'kitchen' }];
const WY0 = 5, WY1 = 13, WT = 9; // bottom rail, top rail, transom
const DOOR = { x0: 13, x1: 16, y0: 2, y1: 12, z: 19 }; // recessed one voxel
const DOORWIN = { x0: 14, x1: 15, y0: 9, y1: 11 };
// east (lab) window: openings along z
const LAB = { z: 9, x: X1 };
// porch
const PORCH = { x0: 10, x1: 19, z0: 21, z1: 27 };
const porchY = (x) => 13 + Math.min(x - 9, 20 - x); // porch gable roof, x 9..20
// rooftop letters, flag pole (back slope)
const SIGN_Z = 18;
const FLAG = { x: 12, z: 5, top: 35 };

// world-space (local) centres of the front panes and the door, for cameras
export const HUT_SPOTS = (() => {
  const zGlass = (Z1) * S + 0.004; // the glass sits on the inside face of the front logs
  const panes = [];
  for (const w of WINS) {
    for (const [px, py] of [[w.x, WY0 + 1], [w.x + 3, WY0 + 1], [w.x, WT + 1], [w.x + 3, WT + 1]])
      panes.push({ x: (px + 1) * S, y: (py + 1.5) * S, z: zGlass, w: 2 * S, h: 3 * S });
  }
  return {
    windows: WINS.map((w) => ({ x: (w.x + 2.5) * S, y: ((WY0 + WY1 + 1) / 2) * S, z: zGlass, panes: panes.splice(0, 4) })),
    door: { x: ((DOOR.x0 + DOOR.x1 + 1) / 2) * S, y: ((DOOR.y0 + DOOR.y1 + 1) / 2) * S, z: DOOR.z * S + 0.1 },
    doorPane: { x: ((DOORWIN.x0 + DOORWIN.x1 + 1) / 2) * S, y: ((DOORWIN.y0 + DOORWIN.y1 + 1) / 2) * S, z: DOOR.z * S + 0.004 },
    chimney: { x: 0.8, y: 3.3, z: 0.8 },
    flask: { x: 1.9, y: 2.95, z: 0.7 },
  };
})();

// ------------------------------------------------------------------ the model
export function hutModel() {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  const room = new VoxelModel();
  const rnd = mulberry32(7);
  const panes = []; // { x, y, z, nx, nz } pane quads (lower-left corner in voxels, along +x or +z)

  // ---------- foundation: a stone plinth round the walls (inside: just the ground course)
  for (let x = X0 - 1; x <= X1 + 1; x++)
    for (let z = Z0 - 1; z <= Z1 + 1; z++) {
      const rim = x <= X0 || x >= X1 || z <= Z0 || z >= Z1;
      for (let y = 0; y <= (rim ? 1 : 0); y++) {
        const mortar = (y === 1 && (x + z * 3) % 5 === 0) || (y === 0 && (x + z * 3 + 2) % 5 === 0);
        body.set(x, y, z, mortar ? P.mortar : pick(P.stone, rnd()));
      }
    }

  // ---------- log walls (2-voxel logs: light top, dark bottom), knots, corner log ends
  const logCol = (y, wall) => {
    const k = (y - 2) >> 1;
    const r = mulberry32(k * 7 + wall * 131)();
    if (y === WALL_TOP) return P.plate;
    return ((y - 2) & 1) ? pick(P.logL, r) : pick(P.logD, r);
  };
  for (let y = 2; y <= WALL_TOP; y++) {
    for (let x = X0; x <= X1; x++) {
      body.set(x, y, Z0, rnd() < 0.035 ? P.knot : logCol(y, 0));
      body.set(x, y, Z1, rnd() < 0.035 ? P.knot : logCol(y, 1));
    }
    for (let z = Z0; z <= Z1; z++) {
      body.set(X0, y, z, rnd() < 0.035 ? P.knot : logCol(y, 2));
      body.set(X1, y, z, rnd() < 0.035 ? P.knot : logCol(y, 3));
    }
    if (y < WALL_TOP) {
      const even = ((y - 2) >> 1) % 2 === 0, top = (y - 2) & 1;
      const c = top ? P.endA : P.endB;
      if (even) for (const [cx, cz] of [[X0 - 1, Z0], [X1 + 1, Z0], [X0 - 1, Z1], [X1 + 1, Z1]]) body.set(cx, y, cz, c);
      else for (const [cx, cz] of [[X0, Z0 - 1], [X1, Z0 - 1], [X0, Z1 + 1], [X1, Z1 + 1]]) body.set(cx, y, cz, c);
    }
  }

  // ---------- front windows: sash (cream) in the log wall, shutters, sill, head, flower box
  for (const w of WINS) {
    const a = w.x, b = w.x + 4; // opening columns
    for (let y = WY0; y <= WY1; y++)
      for (let x = a; x <= b; x++) {
        const rail = y === WY0 || y === WY1 || y === WT || x === a + 2;
        body.set(x, y, Z1, rail ? P.trim : null);
      }
    // reveal: the cut log ends either side read as the frame from an angle
    for (let y = WY0; y <= WY1; y++) { body.set(a - 1, y, Z1, P.trimD); body.set(b + 1, y, Z1, P.trimD); }
    for (const [px, py] of [[a, WY0 + 1], [a + 3, WY0 + 1], [a, WT + 1], [a + 3, WT + 1]]) panes.push({ x: px, y: py, z: Z1, w: 2, h: 3, face: 'z' });
    // shutters (two planks, battens, hinges)
    for (const [s0, hingeX] of [[a - 2, a - 1], [b + 1, b + 1]]) {
      for (let y = WY0; y <= WY1; y++)
        for (let x = s0; x <= s0 + 1; x++) {
          let c = P.shut[(x - s0 + (s0 > a ? 1 : 0)) & 1];
          if (y === WY0 + 2 || y === WY1 - 2) c = P.shutD;
          if (y === WY0 || y === WY1) c = P.shutD;
          if (x === hingeX && (y === WY0 + 1 || y === WY1 - 1)) c = P.iron;
          body.set(x, y, Z1 + 1, c);
        }
      // a little pine cut-out in each shutter
      body.set(s0 + (s0 < a ? 0 : 1), WT, Z1 + 1, P.shutD);
    }
    // head trim + drip cap, sill
    for (let x = a - 2; x <= b + 2; x++) body.set(x, WY1 + 1, Z1 + 1, P.trimD);
    for (let x = a - 3; x <= b + 3; x++) { body.set(x, WY1 + 2, Z1 + 1, P.trim); body.set(x, WY1 + 2, Z1 + 2, P.trimS); }
    for (let x = a - 2; x <= b + 2; x++) body.set(x, WY0 - 1, Z1 + 1, P.trim);
    // flower box under the sill, resting on the plinth
    for (let x = a - 1; x <= b + 1; x++)
      for (let y = 2; y <= 3; y++)
        for (let z = Z1 + 1; z <= Z1 + 3; z++) {
          const edge = x === a - 1 || x === b + 1 || z === Z1 + 3 || y === 2;
          body.set(x, y, z, edge ? P.box[(x + y) & 1] : y === 3 ? P.soil : P.box[1]);
        }
    for (let x = a - 1; x <= b + 1; x++) body.set(x, 2, Z1 + 3, x % 2 ? P.box[1] : 0x5e3c22);
    // flowers and trailing leaves
    for (let x = a - 1; x <= b + 1; x++) {
      const r = rnd();
      body.set(x, 4, Z1 + 2, (x + w.x) % 2 ? pick(P.leaf, r) : pick(P.bloom, rnd()));
      if (x > a - 1 && x < b + 1 && (x + w.x) % 2 === 0) body.set(x, 5, Z1 + 2, pick(P.bloom, rnd()));
      if ((x + w.x) % 3 === 0) body.set(x, 4, Z1 + 3, pick(P.leaf, rnd()));
      if ((x + w.x) % 4 === 1) { body.set(x, 3, Z1 + 4, P.leaf[1]); body.set(x, 2, Z1 + 4, P.leaf[0]); }
    }
  }

  // ---------- the door: teal planks, arched top, strap hinges, brass knocker + knob, a little window
  for (let y = DOOR.y0; y <= DOOR.y1; y++)
    for (let x = DOOR.x0; x <= DOOR.x1; x++) {
      body.set(x, y, Z1, null); // the doorway through the log wall
      const inWin = x >= DOORWIN.x0 && x <= DOORWIN.x1 && y >= DOORWIN.y0 && y <= DOORWIN.y1;
      let c = P.door[(x - DOOR.x0) & 1];
      if (y === DOOR.y0) c = P.doorD;
      if (y === DOOR.y1 && (x === DOOR.x0 || x === DOOR.x1)) c = P.trim; // arched corners
      body.set(x, y, DOOR.z, inWin ? null : c);
    }
  panes.push({ x: DOORWIN.x0, y: DOORWIN.y0, z: DOOR.z, w: 2, h: 3, face: 'z', door: true });
  for (let x = DOORWIN.x0 - 1; x <= DOORWIN.x1 + 1; x++) { body.set(x, DOORWIN.y0 - 1, DOOR.z, P.trimD); }
  // hinges (left), knocker, knob (on the door face, in the doorway)
  body.set(DOOR.x0, 4, Z1, P.iron); body.set(DOOR.x0 + 1, 4, Z1, P.iron);
  body.set(DOOR.x0, 10, Z1, P.iron);
  body.set(DOOR.x0 + 1, 7, Z1, P.brass); body.set(DOOR.x0 + 2, 7, Z1, P.brass); body.set(DOOR.x0 + 1, 6, Z1, P.brassD); body.set(DOOR.x0 + 2, 6, Z1, P.brassD);
  body.set(DOOR.x1, 5, Z1, P.brass);
  // frame: trims either side, lintel with a little hood
  for (let y = DOOR.y0; y <= DOOR.y1; y++) { body.set(DOOR.x0 - 1, y, Z1 + 1, P.trim); body.set(DOOR.x1 + 1, y, Z1 + 1, P.trim); }
  for (let x = DOOR.x0 - 1; x <= DOOR.x1 + 1; x++) body.set(x, DOOR.y1 + 1, Z1 + 1, P.trimD);
  for (let x = DOOR.x0 - 2; x <= DOOR.x1 + 2; x++) { body.set(x, DOOR.y1 + 2, Z1 + 1, P.trim); body.set(x, DOOR.y1 + 2, Z1 + 2, P.trimS); }
  // wall lanterns either side of the door
  for (const lx of [DOOR.x0 - 2, DOOR.x1 + 2]) {
    body.set(lx, 11, Z1 + 1, P.iron); body.set(lx, 11, Z1 + 2, P.iron); // bracket + cap
    glow.set(lx, 10, Z1 + 2, 0xffd890); glow.set(lx, 9, Z1 + 2, 0xffc060);
    body.set(lx, 8, Z1 + 2, P.iron);
  }

  // ---------- porch: deck, step, posts, side rails, a little gabled roof
  for (let x = PORCH.x0; x <= PORCH.x1; x++)
    for (let z = PORCH.z0; z <= PORCH.z1; z++) {
      const edge = x === PORCH.x0 || x === PORCH.x1 || z === PORCH.z1;
      body.set(x, 1, z, edge ? P.deckEdge : P.deck[z & 1]);
      body.set(x, 0, z, z === PORCH.z1 ? ((x & 1) ? P.soffit : 0x3e2a1a) : P.soffit);
    }
  for (let x = PORCH.x0 + 1; x <= PORCH.x1 - 1; x++) body.set(x, 0, PORCH.z1 + 1, x === PORCH.x0 + 1 || x === PORCH.x1 - 1 ? P.deckEdge : P.deck[x & 1]);
  for (const px of [PORCH.x0, PORCH.x1]) {
    for (let y = 2; y <= 13; y++) body.set(px, y, PORCH.z1, y === 2 ? P.stone[3] : y === 12 ? P.plate : (y & 1) ? P.post : P.postL);
    // side rail + balusters
    for (let z = PORCH.z0 + 1; z < PORCH.z1; z++) {
      body.set(px, 6, z, P.postL);
      if ((z - PORCH.z0) % 2 === 1) for (let y = 2; y <= 5; y++) body.set(px, y, z, P.post);
    }
  }
  // corner brackets + the tie beam
  body.set(PORCH.x0 + 1, 12, PORCH.z1, P.postL); body.set(PORCH.x1 - 1, 12, PORCH.z1, P.postL);
  for (let x = PORCH.x0; x <= PORCH.x1; x++) body.set(x, 13, PORCH.z1, P.shutD);
  // porch roof (gable to the front), cream bargeboards on the front edge
  for (let z = PORCH.z0 + 1; z <= PORCH.z1 + 1; z++)
    for (let x = 9; x <= 20; x++) {
      const y = porchY(x);
      const row = Math.min(x - 9, 20 - x);
      const front = z === PORCH.z1 + 1;
      body.set(x, y, z, front ? P.fascia : shingle(x * 2 + z, row, rnd));
      if (x > 9 && x < 20) body.set(x, y - 1, z, front ? P.fascia : P.soffit);
    }
  for (let z = PORCH.z0 + 1; z <= PORCH.z1 + 1; z++) { body.set(14, 19, z, P.ridge); body.set(15, 19, z, P.ridge); }
  // gable infill: vertical cream boards
  for (let x = 11; x <= 18; x++)
    for (let y = 14; y <= porchY(x) - 2; y++) body.set(x, y, PORCH.z1, (x & 1) ? P.trim : P.trimD);

  // ---------- main roof: shingle rows, eaves, gable ends, ridge cap
  function shingle(x, row, r) {
    const off = (row & 1) * 2;
    if ((x + off) % 4 === 0) return P.seam;
    const v = r();
    if (row < 3 && v < 0.07) return pick(P.moss, r());
    if (v < 0.1) return P.shingleL;
    return P.shingle[row & 1][(x + off) % 4 === 2 ? 1 : 0];
  }
  for (let z = 1; z <= 22; z++) {
    const y = roofY(z);
    const row = Math.min(z - 1, 22 - z); // 0 at the eaves
    for (let x = X0 - 2; x <= X1 + 2; x++) {
      const edge = x === X0 - 2 || x === X1 + 2;
      body.set(x, y, z, edge ? P.fascia : shingle(x, row, rnd));
      body.set(x, y - 1, z, edge ? P.fascia : P.soffit);
    }
  }
  // attic fill (solid) + gable siding on the ends
  for (let z = Z0; z <= Z1; z++)
    for (let y = WALL_TOP + 1; y <= roofY(z) - 2; y++)
      for (let x = X0; x <= X1; x++) {
        const end = x === X0 || x === X1;
        body.set(x, y, z, end ? P.gable[z & 1] : z === Z0 || z === Z1 ? P.soffit : P.gable[0]);
      }
  // ridge cap
  for (let x = X0 - 2; x <= X1 + 2; x++) { body.set(x, roofY(11) + 1, 11, x % 3 ? P.ridge : P.ridgeL); body.set(x, roofY(12) + 1, 12, x % 3 ? P.ridge : P.ridgeL); }
  // round attic windows in both gables (lit at night)
  for (const gx of [X0, X1]) {
    const cz = 11.5, cy = 22;
    for (let z = 9; z <= 14; z++)
      for (let y = 19; y <= 25; y++) {
        const d = Math.hypot((z - cz) / 2.6, (y - cy) / 2.6);
        if (d <= 0.55) { body.set(gx, y, z, null); glow.set(gx, y, z, 0xffcf80); } else if (d <= 1.05) body.set(gx, y, z, P.trim);
      }
  }

  // ---------- chimney (back left), stone with a cap and two clay pots
  for (let y = WALL_TOP + 1; y <= 29; y++)
    for (let x = 6; x <= 9; x++) for (let z = 6; z <= 9; z++) body.set(x, y, z, (x + y * 2 + z) % 5 === 0 ? P.mortar : pick(P.stone, rnd()));
  for (let x = 5; x <= 10; x++) for (let z = 5; z <= 10; z++) body.set(x, 30, z, 0x6a655f);
  for (const [px, pz] of [[7, 7], [8, 8]]) {
    body.set(px, 31, pz, 0xb5653a); body.set(px, 32, pz, 0xc4744a);
  }
  body.set(7, 31, 8, 0x5c5853); body.set(8, 31, 7, 0x5c5853);

  // ---------- Reynard's lab on the roof: copper pipe into a bubbling green flask
  for (let y = roofY(6) + 1; y <= 30; y++) body.set(23, y, 6, y % 4 === 0 ? P.brass : P.copper);
  for (let x = 19; x <= 23; x++) body.set(x, 31, 6, x === 23 ? P.copperD : P.copper);
  body.set(19, 30, 6, P.copperD);
  glow.ellipsoid(18.5, 27, 6.5, 1.7, 1.9, 1.7, (x, y) => (y >= 28 ? 0x9affb0 : 0x58e07a));
  glow.set(18, 29, 6, 0xc8ffd8); glow.set(19, 29, 6, 0xc8ffd8);

  // ---------- rooftop sign: a plank board on two legs, REYNARD in chunky letters (lit at night)
  {
    const y0 = roofY(SIGN_Z) + 2, y1 = y0 + 6, zb = SIGN_Z - 1;
    for (let x = 0; x <= 28; x++)
      for (let y = y0; y <= y1; y++) {
        const fr = x === 0 || x === 28 || y === y0 || y === y1;
        body.set(x, y, zb, fr ? P.signFr : (y & 1) ? P.sign[0] : P.sign[1]);
      }
    for (const lx of [3, 25]) for (let y = roofY(zb) + 1; y < y0; y++) { body.set(lx, y, zb, P.signFr); body.set(lx, y, zb - 1, P.signFr); }
    for (const [cx, cy] of [[0, y0], [28, y0], [0, y1], [28, y1]]) body.set(cx, cy, SIGN_Z, P.brass);
    voxelText(glow, 'REYNARD', 1, y1 - 1, SIGN_Z, 0xfff0c4);
  }

  // ---------- the flag flies from a pole on the back slope; the FISH 4 SALE stand at the front-right
  for (let y = roofY(FLAG.z) + 1; y <= FLAG.top; y++) body.set(FLAG.x, y, FLAG.z, P.flag);
  body.set(FLAG.x, FLAG.top + 1, FLAG.z, P.brass);
  flagModel(body, FLAG.x + 1, FLAG.top - 6, FLAG.z);
  for (const px of [23, 29]) for (let y = 0; y <= 5; y++) body.set(px, y, 29, P.soffit);
  for (let x = 23; x <= 29; x++) body.set(x, 6, 29, P.deckEdge);
  // a red mailbox at the front-left corner (its little flag is up: e-Buy parcels)
  for (let y = 0; y <= 4; y++) body.set(1, y, 28, P.soffit);
  for (let x = 0; x <= 2; x++) for (let z = 26; z <= 29; z++) { body.set(x, 5, z, 0xb83a30); body.set(x, 6, z, x === 1 ? 0xc8463a : 0xb83a30); }
  for (let z = 26; z <= 29; z++) body.set(1, 7, z, 0xa8342c);
  body.set(1, 6, 29, 0x2b2a2d); body.set(3, 6, 27, P.iron); body.set(3, 7, 27, 0xf3c335); body.set(3, 8, 27, 0xf3c335);
  // potted plants either side of the door
  for (const px of [PORCH.x0 + 1, PORCH.x1 - 1]) {
    body.set(px, 2, PORCH.z0 + 1, 0xb5653a); body.set(px, 3, PORCH.z0 + 1, 0xc4744a);
    body.set(px, 4, PORCH.z0 + 1, P.leaf[0]); body.set(px, 5, PORCH.z0 + 1, P.leaf[2]);
  }

  // ---------- back: a shuttered window (heart cut-out glows at night), woodpile under the eave
  {
    const a = 18, b = 23;
    for (let y = WY0; y <= WY1; y++)
      for (let x = a; x <= b; x++) {
        let c = P.shut[x & 1];
        if (y === WY0 + 2 || y === WY1 - 2) c = P.shutD;
        body.set(x, y, Z0 - 1, c);
      }
    for (const [hx, hy] of [[20, 9], [21, 9], [20, 10], [21, 10], [19, 10], [22, 10]]) { body.set(hx, hy, Z0 - 1, null); glow.set(hx, hy, Z0 - 1, 0xffc870); }
    for (let x = a - 1; x <= b + 1; x++) { body.set(x, WY1 + 1, Z0 - 1, P.trimD); body.set(x, WY0 - 1, Z0 - 1, P.trim); }
    // stacked firewood: 2x2 log ends, staggered rows
    for (let y = 0; y <= 5; y++)
      for (let x = 2; x <= 12; x++) {
        if (y >= 4 && (x < 4 || x > 10)) continue;
        const u = (x + (y >> 1) % 2) % 2, v = y % 2;
        const c = u === 0 && v === 1 ? P.endA : u === 1 && v === 0 ? P.logD[0] : P.endB;
        body.set(x, y, 0, c); body.set(x, y, 1, P.logD[1]);
      }
  }

  // ---------- east lab window (green light inside), shutters
  {
    const a = LAB.z, b = LAB.z + 4, x = LAB.x;
    for (let y = WY0; y <= WY1; y++)
      for (let z = a; z <= b; z++) {
        const rail = y === WY0 || y === WY1 || y === WT || z === a + 2;
        body.set(x, y, z, rail ? P.trim : null);
      }
    for (const [pz, py] of [[a, WY0 + 1], [a + 3, WY0 + 1], [a, WT + 1], [a + 3, WT + 1]]) panes.push({ x, y: py, z: pz, w: 2, h: 3, face: 'x' });
    for (const s0 of [a - 2, b + 1])
      for (let y = WY0; y <= WY1; y++)
        for (let z = s0; z <= s0 + 1; z++) body.set(x + 1, y, z, y === WY0 + 2 || y === WY1 - 2 || y === WY0 || y === WY1 ? P.shutD : P.shut[(z - s0) & 1]);
    for (let z = a - 2; z <= b + 2; z++) { body.set(x + 1, WY1 + 1, z, P.trimD); body.set(x + 1, WY0 - 1, z, P.trim); body.set(x + 2, WY0 - 1, z, P.trimS); }
  }

  buildRooms(room, glow);
  return { body, glow, interior: room, panes };
}

// ------------------------------------------------------------------ the rooms behind the windows
// Unlit voxels with the lamp light baked in: colour * (ambient + warm falloff round the lamp).
// Each room is a closed box (no gaps whatever the angle) open on the window side.
function buildRooms(R, G) {
  const lit = (lamp, amb = 0.5, k = 0.75, r2 = 34) => (x, y, z, hex) => {
    const d2 = (x - lamp[0]) ** 2 + (y - lamp[1]) ** 2 * 0.8 + (z - lamp[2]) ** 2;
    const f = amb + k * Math.exp(-d2 / r2);
    return scaleHex(hex, f * 1.04, f, f * 0.9);
  };
  // box x a..b, z c..d, floor y 1, ceiling y top; open side +z (front rooms) or +x (the lab)
  function roomBox(a, b, c, d, top, paint, light, openX = false) {
    for (let x = a; x <= b; x++)
      for (let z = c; z <= d; z++) {
        R.set(x, 1, z, light(x, 1, z, paint(x, 1, z, 'floor')));
        R.set(x, top, z, light(x, top, z, paint(x, top, z, 'ceil')));
      }
    for (let y = 2; y < top; y++) {
      if (!openX) {
        for (let x = a; x <= b; x++) R.set(x, y, c, light(x, y, c, paint(x, y, c, 'back')));
        for (let z = c; z <= d; z++) { R.set(a, y, z, light(a, y, z, paint(a, y, z, 'side'))); R.set(b, y, z, light(b, y, z, paint(b, y, z, 'side'))); }
      } else {
        for (let z = c; z <= d; z++) R.set(a, y, z, light(a, y, z, paint(a, y, z, 'back')));
        for (let x = a; x <= b; x++) { R.set(x, y, c, light(x, y, c, paint(x, y, c, 'side'))); R.set(x, y, d, light(x, y, d, paint(x, y, d, 'side'))); }
      }
    }
  }
  const put = (x, y, z, hex, light) => R.set(x, y, z, light(x, y, z, hex));
  // tied-back curtains just inside a window opening x o0..o1: hidden behind the logs either side,
  // only the top corners and the flared hems peek into the outer panes
  function curtains(o0, o1, cols, light) {
    for (const [cx, out] of [[o0, -1], [o1, 1]])
      for (let y = 5; y <= 14; y++) {
        const c = (cx + y) & 1 ? cols[0] : cols[1];
        put(cx + out, y, 18, c, light); put(cx + out * 2, y, 18, c, light);
        if (y >= 12 || y <= 6) put(cx, y, 18, c, light);
      }
    for (const cx of [o0 - 1, o1 + 1]) put(cx, 9, 17, 0xe8bc48, light); // tie-backs
    for (let x = o0 - 2; x <= o1 + 2; x++) put(x, 14, 17, 0x5e3a20, light); // rod
  }

  // --- living room behind the left window (opening x 4..8): table lamp, shelf of books, painting, armchair
  {
    const L = lit([8, 10.5, 16], 0.4, 0.85, 30);
    const paper = (u, y) => (y >= 8 ? ((u & 1) ? 0xecd49c : 0xe2c78a) : y === 7 ? 0x6e4a2c : (u & 1) ? 0x9a6a40 : 0x8c5f38);
    roomBox(1, 11, 13, 19, 16, (x, y, z, part) => {
      if (part === 'floor') return (x + z) % 5 === 0 ? 0x7a5230 : z & 1 ? 0xa0703f : 0x936638;
      if (part === 'ceil') return x % 3 === 0 ? 0x6a4428 : 0x82583a;
      if (part === 'back' && y >= 9 && (x + y) % 4 === 0) return 0xc8584a; // little red flowers on the paper
      return paper(part === 'back' ? x : z, y);
    }, L);
    // rug
    for (let x = 3; x <= 9; x++) for (let z = 15; z <= 18; z++) put(x, 1, z, (x === 3 || x === 9 || z === 15 || z === 18) ? 0xe8d8b0 : (x + z) & 1 ? 0xb83c34 : 0xa8322c, L);
    // shelf with books + a jar
    for (let x = 2; x <= 6; x++) put(x, 10, 14, 0x6e4628, L);
    const books = [[2, 0xb03a32, 3], [3, 0x3a5a9a, 2], [4, 0x4a7a3a, 3], [5, 0xd0a030, 2]];
    for (const [x, c, h] of books) for (let y = 11; y < 11 + h; y++) put(x, y, 14, c, L);
    put(6, 11, 14, 0x8fd0c8, L); put(6, 12, 14, 0xd8f0e8, L);
    // painting: the pond at sunset, gold frame
    for (let x = 7; x <= 10; x++)
      for (let y = 11; y <= 14; y++) {
        const fr = x === 7 || x === 10 || y === 11 || y === 14;
        put(x, y, 14, fr ? 0xd0a840 : y === 13 ? (x === 8 ? 0xffd070 : 0xf09a68) : 0x4a86b0, L);
      }
    // side table + lamp (the shade glows)
    for (let x = 7; x <= 9; x++) for (let z = 15; z <= 17; z++) put(x, 6, z, 0x7a4c2a, L);
    for (const [x, z] of [[7, 15], [9, 15], [7, 17], [9, 17]]) for (let y = 2; y <= 5; y++) put(x, y, z, 0x5e3a20, L);
    put(8, 7, 16, 0xb08a3a, L); put(8, 8, 16, 0xc8a048, L); put(8, 9, 16, 0xc8a048, L);
    for (let x = 7; x <= 9; x++) for (let z = 15; z <= 17; z++) { G.set(x, 10, z, 0xffe0a0); G.set(x, 11, z, (x + z) & 1 ? 0xffd488 : 0xffe8b8); }
    // armchair (red velvet)
    for (let x = 2; x <= 5; x++) for (let z = 15; z <= 17; z++) { put(x, 2, z, 0x7a2a26, L); put(x, 3, z, 0xb8423a, L); }
    for (let x = 2; x <= 5; x++) for (let y = 4; y <= 7; y++) put(x, y, 15, y === 7 ? 0xa83a34 : 0xb8423a, L);
    for (const x of [2, 5]) for (let z = 16; z <= 17; z++) put(x, 4, z, 0xa83a34, L);
    // inner sill + a potted fern
    for (let x = 3; x <= 9; x++) put(x, 4, 19, 0xe4d6b4, L);
    put(5, 5, 19, 0xb5653a, L); put(5, 6, 19, 0x4f8b3c, L); put(4, 6, 19, 0x5c9a44, L); put(5, 7, 19, 0x3f7a31, L);
    curtains(4, 8, [0xc8423a, 0xf2e4d2], L);
  }

  // --- kitchen behind the right window (opening x 21..25): pendant lamp, counter, shelf with jars
  {
    const L = lit([23, 11, 17], 0.4, 0.85, 30);
    roomBox(18, 28, 15, 19, 16, (x, y, z, part) => {
      if (part === 'floor') return (x + z) & 1 ? 0xd8c8a8 : 0x6a5a48; // checker
      if (part === 'ceil') return x % 3 === 0 ? 0x6a4428 : 0x82583a;
      const u = part === 'back' ? x : z;
      if (y <= 5) return (u & 1) ? 0x5f8f74 : 0x557f68;
      return ((u + y) % 3 === 0) ? 0xbcd4dc : 0xeae6da; // tiles
    }, L);
    // counter + things on it
    for (let x = 19; x <= 27; x++) { put(x, 6, 16, 0x8a5a32, L); for (let y = 2; y <= 5; y++) put(x, y, 16, y === 4 ? 0x46705a : (x & 1) ? 0x5f8f74 : 0x557f68, L); }
    put(21, 7, 16, 0xc4793e, L); put(22, 7, 16, 0xc4793e, L); put(21, 8, 16, 0xd88a4a, L); put(22, 8, 16, 0x9a5a2c, L); // copper kettle
    for (let x = 24; x <= 26; x++) put(x, 7, 16, 0xe8e4dc, L); // a plate...
    put(24, 8, 16, 0x6a90a8, L); put(25, 8, 16, 0x9ac0d8, L); put(26, 8, 16, 0x8ab0c8, L); // ...with a fish
    // shelf with jars and a glowing lab flask
    for (let x = 19; x <= 27; x++) put(x, 10, 16, 0x6e4628, L);
    const jars = [[19, 0xd09030], [20, 0x6ab060], [21, 0xb03040], [24, 0xe8d8b0], [25, 0x5a7ab8], [26, 0xd09030], [27, 0x8a5a9a]];
    for (const [x, c] of jars) { put(x, 11, 16, c, L); if (x & 1) put(x, 12, 16, scaleHex(c, 1.15), L); }
    G.set(22, 11, 16, 0x7cff9a); G.set(22, 12, 16, 0xb8ffc8);
    // pendant lamp
    put(23, 15, 18, 0x2b2a2d, L); put(23, 14, 18, 0x2b2a2d, L);
    for (let x = 22; x <= 24; x++) put(x, 13, 18, 0x3d7a55, L);
    put(21, 12, 18, 0x3d7a55, L); put(25, 12, 18, 0x3d7a55, L);
    G.set(22, 12, 18, 0xffe6a8); G.set(23, 12, 18, 0xfff4d0); G.set(24, 12, 18, 0xffe6a8); G.set(23, 11, 18, 0xffd890);
    // inner sill + a little cactus
    for (let x = 20; x <= 26; x++) put(x, 4, 19, 0xe4d6b4, L);
    put(25, 5, 19, 0xb5653a, L); put(25, 6, 19, 0x5c9a44, L); put(25, 7, 19, 0x4f8b3c, L); put(24, 7, 19, 0x4f8b3c, L);
    curtains(21, 25, [0x4a8a5a, 0xeef0e2], L);
  }

  // --- the hall behind the door window: a coat hook with Reynard's spare top hat
  {
    const L = lit([13.5, 13, 17], 0.62, 0.7, 18);
    roomBox(12, 17, 15, 18, 16, (x, y, z, part) => (part === 'floor' ? 0x936638 : part === 'ceil' ? 0x82583a : (x + z) & 1 ? 0xecd49c : 0xe2c78a), L);
    for (let x = 13; x <= 16; x++) put(x, 13, 16, 0x6e4628, L); // hat shelf
    put(15, 12, 16, 0x2b2a2d, L); // hook
    for (let x = 15; x <= 16; x++) { put(x, 11, 16, 0x24222a, L); put(x, 10, 16, 0xb8423a, L); } // crown + red band
    for (let x = 14; x <= 16; x++) put(x, 9, 16, 0x24222a, L); // brim
    put(13, 9, 16, 0x8a5a32, L); put(13, 10, 16, 0x6e8a5a, L); // umbrella handle peeking in
    G.set(13, 14, 17, 0xffe0a0); G.set(14, 14, 17, 0xffe8b8);
  }

  // --- the lab behind the east window (opening z 9..13): teal panels, glowing flasks, a bubbling tank
  {
    const L = lit([26, 9, 11], 0.62, 0.6, 22);
    roomBox(24, 28, 8, 14, 16, (x, y, z, part) => {
      if (part === 'floor') return (x + z) & 1 ? 0x5a5a62 : 0x4c4c56;
      if (part === 'ceil') return 0x44444c;
      return (y % 4 === 0) ? 0x3a6a5e : ((part === 'back' ? z : x) & 1) ? 0x5a9a88 : 0x52907e;
    }, L, true);
    for (let z = 9; z <= 13; z++) put(25, 10, z, 0x6e4628, L);
    const fl = [[9, 0x7cff9a], [10, 0xb07cff], [12, 0x7ce8ff], [13, 0xffd060]];
    for (const [z, c] of fl) { G.set(25, 11, z, c); G.set(25, 12, z, z & 1 ? 0xe0ffe8 : c); }
    // bubbling specimen tank on a bench (shows through the lower panes)
    for (let z = 9; z <= 13; z++) {
      put(26, 4, z, 0x2b2a2d, L); put(26, 3, z, 0x6e4628, L); put(26, 2, z, 0x6e4628, L);
      for (let y = 5; y <= 8; y++) G.set(26, y, z, y === 8 ? 0xa0ffd0 : (z + y) % 3 ? 0x40d0a0 : 0x80f8d0);
      put(26, 9, z, 0x2b2a2d, L);
    }
    G.set(26, 6, 11, 0xff9a40); G.set(26, 7, 10, 0xffffff); // a goldfish in the tank, a bubble
    put(27, 15, 11, 0x2b2a2d, L); put(27, 14, 11, 0xa9822c, L); G.set(27, 13, 11, 0xd8ffe0);
  }
}

// ------------------------------------------------------------------ glass texture (2x3 voxel pane, 4 px per voxel)
let glassTex = null;
function glassTexture() {
  if (glassTex) return glassTex;
  const W = 8, H = 12;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const yy = H - 1 - y; // row 0 = top of the pane
      let c = [150, 196, 226, 28];
      if (x === W - 1 || yy === H - 1) c = [64, 92, 132, 80];
      if (x === 0 || yy === 0) c = [226, 242, 255, 120];
      const s = x + yy;
      if (x > 0 && yy > 0 && x < W - 1 && yy < H - 1) {
        if (s === 5 && yy <= 4) c = [255, 255, 255, 120];
        else if (s === 6 && yy >= 2 && yy <= 4) c = [255, 255, 255, 70];
        else if (s === 13 && x >= 4) c = [235, 248, 255, 60];
      }
      data.set(c, (y * W + x) * 4);
    }
  glassTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  glassTex.magFilter = THREE.NearestFilter;
  glassTex.minFilter = THREE.NearestFilter;
  glassTex.colorSpace = THREE.SRGBColorSpace;
  glassTex.needsUpdate = true;
  return glassTex;
}

function glassGeometry(panes) {
  const pos = [], uv = [], idx = [];
  let v = 0;
  for (const p of panes) {
    // the glass sits on the inside face of the sash voxel layer (door: the door's back face)
    if (p.face === 'z') {
      const z = p.z * S + 0.004, x0 = p.x * S, x1 = (p.x + p.w) * S, y0 = p.y * S, y1 = (p.y + p.h) * S;
      pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    } else {
      const x = p.x * S + 0.004, z0 = (p.z + p.w) * S, z1 = p.z * S, y0 = p.y * S, y1 = (p.y + p.h) * S;
      pos.push(x, y0, z0, x, y0, z1, x, y1, z1, x, y1, z0);
    }
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// soft warm light on the ground in front of the windows and the door at night
function poolTexture() {
  const N = 16;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
      const d = Math.sqrt(dx * dx * 4 + dy * dy * 4);
      const a = d < 0.42 ? 0.34 : d < 0.7 ? 0.2 : d < 0.95 ? 0.08 : 0; // stepped, pixel-art rings
      data.set([255, 200, 120, Math.round(a * 255)], (y * N + x) * 4);
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ assembled group
const DAY_ROOM = new THREE.Color(0.5, 0.45, 0.4), NIGHT_ROOM = new THREE.Color(1.08, 0.9, 0.66);
const DAY_GLOW = new THREE.Color(0.86, 0.84, 0.8), NIGHT_GLOW = new THREE.Color(1.35, 1.2, 0.95);
const DAY_GLASS = new THREE.Color(1, 1, 1), NIGHT_GLASS = new THREE.Color(0.5, 0.48, 0.46);
const DAY_SMOKE = new THREE.Color(0xdcd8d2), NIGHT_SMOKE = new THREE.Color(0x7c7c92);

export function buildHut() {
  const m = hutModel();
  const g = new THREE.Group();
  g.name = 'hut';
  const body = new THREE.Mesh(m.body.build({ scale: S }), voxelMaterial());
  body.castShadow = true; body.receiveShadow = true;
  body.name = 'hutBody';
  const roomMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: DAY_ROOM.clone() });
  const rooms = new THREE.Mesh(m.interior.build({ scale: S }), roomMat);
  rooms.name = 'hutRooms';
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: DAY_GLOW.clone() });
  const glow = new THREE.Mesh(m.glow.build({ scale: S, ao: false }), glowMat);
  glow.name = 'hutGlow';
  const glassMat = new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: DAY_GLASS.clone() });
  const glass = new THREE.Mesh(glassGeometry(m.panes), glassMat);
  glass.name = 'hutGlass';
  glass.renderOrder = 2;
  g.add(body, rooms, glow, glass);

  // light pools (front windows + door), additive, faded in at night
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pg = [];
  const quad = (cx, cz, w, d) => { const q = new THREE.PlaneGeometry(w, d); q.rotateX(-Math.PI / 2); q.translate(cx, 0.012, cz); pg.push(q); };
  quad(1.5, 3.18, 3.0, 0.62); // one soft spill along the front (windows + door + lanterns)
  const pools = new THREE.Mesh(mergeGeos(pg), poolMat);
  pools.name = 'hutPools';
  pools.renderOrder = 1;
  pools.visible = false;
  g.add(pools);

  // smoke: a few voxel puffs looping above the chimney pots
  const N = 5;
  const smokeMat = new THREE.MeshLambertMaterial({ color: DAY_SMOKE.clone() });
  const puffs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), smokeMat, N);
  puffs.name = 'hutSmoke';
  puffs.frustumCulled = false;
  g.add(puffs);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), SC = new THREE.Vector3();
  const base = HUT_SPOTS.chimney;
  let lastNight = -1;

  g.userData.spots = HUT_SPOTS;
  g.userData.fx = {
    update(time, night = 0) {
      const n = Math.max(0, Math.min(1, night));
      if (Math.abs(n - lastNight) > 0.002) {
        lastNight = n;
        roomMat.color.copy(DAY_ROOM).lerp(NIGHT_ROOM, n);
        glowMat.color.copy(DAY_GLOW).lerp(NIGHT_GLOW, n);
        glassMat.color.copy(DAY_GLASS).lerp(NIGHT_GLASS, n);
        smokeMat.color.copy(DAY_SMOKE).lerp(NIGHT_SMOKE, n);
        poolMat.opacity = Math.max(0, (n - 0.25) / 0.75) * 0.6;
        pools.visible = poolMat.opacity > 0.01;
      }
      const t = time || 0;
      for (let i = 0; i < N; i++) {
        const k = (t / 3.4 + i / N) % 1;
        const s = (0.05 + 0.13 * Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5)) * (k > 0.8 ? (1 - k) / 0.2 : 1);
        V.set(base.x + k * 0.3 + Math.sin(t * 1.3 + i * 2.1) * 0.03, base.y + k * 0.95, base.z - k * 0.08 + Math.cos(t * 1.1 + i) * 0.03);
        E.set(k * 1.7 + i, k * 2.3 + i * 0.7, 0);
        Q.setFromEuler(E);
        SC.set(s, s, s);
        M.compose(V, Q, SC);
        puffs.setMatrixAt(i, M);
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
  };
  g.userData.fx.update(0, 0);
  return g;
}

function mergeGeos(list) {
  const pos = [], uv = [], idx = [];
  let v = 0;
  for (const q of list) {
    const p = q.attributes.position.array, u = q.attributes.uv.array, ix = q.index.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + v);
    v += p.length / 3;
    q.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

