// HedgehogBaker: "Hazel", the meadow's baker. A round little hedgehog with a
// spiky brown-and-cream coat, a pointy snout with a shiny nose, a puffy white
// chef's toque, a red kerchief, a rose apron dusted with flour (a wooden spoon
// in the pocket) and a rolling pin tucked in her apron strings.
//
//   const h = new HedgehogBaker();  scene.add(h.root);
//   h.play('roll_dough');   // a pastry stool pops up, she rolls the dough flat, flour puffs
//   h.play('taste');        // a warm pie from behind her back: sniff, taste, "mmm!"
//   h.play('curl_up');      // poof! a spiky ball (toque and all), bounces, rolls, pops back out
//   h.onEvent = (name) => {};  // 'step' | 'roll' | 'clap' | 'sniff' | 'yum' | 'poof' | 'bounce' | 'pop' | 'giggle'
//
// Anims: idle wave talk laugh walk happy roll_dough taste curl_up
// Expressions: neutral happy talk surprised sleepy smug laugh sniff yum proud (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.38 units/s (quick little steps; move the root, the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.04 tall to the head, ~1.38 to the top of the toque.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS } from './npcProps.js';
import { spriteMatPal, FLOUR_PAL, FLOUR_ROWS, STEAM_PAL, STEAM_ROWS, STAR_PAL, STAR_ROWS } from './npcProps2.js';

const C = {
  sp: 0x8a6440, spD: 0x6a4a2e, spDD: 0x4a3220, spL: 0xa87c52, tip: 0xeedcb8, tipD: 0xd8c098,
  face: 0xf2dcb6, faceD: 0xdcc296, faceL: 0xfcecd0, nose: 0x2a1a1a, noseL: 0x6a5050, ear: 0xe0b098, earD: 0xc89078,
  paw: 0xd8a088, pawD: 0xb07a64, flour: 0xffffff,
  apron: 0xf4a8b8, apronD: 0xd8849a, apronL: 0xfcc8d4, frill: 0xfff4f6, kerch: 0xd8403a, kerchD: 0xa82a28, dot: 0xfff2ea,
  toque: 0xffffff, toqueD: 0xeceae4, toqueDD: 0xd4cec2,
  pin: 0xe8c890, pinD: 0xc8a064, pinL: 0xf8e0b0, pinH: 0xa8743e,
  spoon: 0xc89a5a, spoonD: 0xa0763a,
  board: 0xc89a5a, boardD: 0xa0763a, boardL: 0xdcb070, dough: 0xf6e4c0, doughD: 0xe4cc9e, doughL: 0xfff4dc,
  crust: 0xe8a858, crustD: 0xc07a34, crustL: 0xf8cc84, berry: 0x8a2a6a, berryL: 0xc04a8a, tin: 0xb4b4c0,
};

const D = {
  HIP_Y: 5, WAIST: 1, NECK: 6.4, NECK_Z: 0.8, SH: [5.4, 5.6, 0.6], L_UP: 3.2, L_FORE: 3.2, L_HAND: 1.8,
  THIGH: 2.7, SHIN: 2.6, LEG_X: 2.4, EAR: [4.1, 5.8, 0.2], TAIL: [0.2, -5.4],
};

// ------------------------------------------------------------------ models
const spCol = (x, y, z) => ((x * 3 + y * 7 + z * 5) % 5 === 0 ? C.spDD : tone(x, y, z, C.sp, C.spD, C.spL, 0.2, 0.12));
const faceCol = (x, y, z) => tone(x, y, z, C.face, C.faceD, C.faceL, 0.1, 0.08);
const apronCol = (x, y, z) => (hash3(x, y, z * 3 + 1) > 0.9 ? C.flour : tone(x, y, z, C.apron, C.apronD, C.apronL, 0.1, 0.08));
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -14; z <= 14; z++) if (v.has(x, y, z)) return z;
  return null;
}
/**
 * Spines: a coat of little voxel cones (quill tufts) standing on an ellipsoid, dark at the root,
 * banded, cream at the tips. keep(nx, ny, nz) picks where on the surface they grow;
 * n = number of tufts over the whole sphere (spacing), len = tuft height (voxels).
 */
function spines(v, cx, cy, cz, rx, ry, rz, keep, n = 90, len = 2.6) {
  const ga = PI * (3 - Math.sqrt(5));
  const dirs = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * ga;
    const d = [cos(a) * r, y, sin(a) * r];
    if (keep(d[0], d[1], d[2])) dirs.push([...d, len * (0.8 + hash3(i, 3, 7) * 0.4)]);
  }
  const R = (rx + ry + rz) / 3, ang = Math.sqrt((4 * PI) / n) * 0.62;
  const ex = Math.ceil(len + 1);
  for (let x = Math.floor(cx - rx - ex); x <= cx + rx + ex; x++)
    for (let y = Math.floor(cy - ry - ex); y <= cy + ry + ex; y++)
      for (let z = Math.floor(cz - rz - ex); z <= cz + rz + ex; z++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
        const e = Math.hypot(dx / rx, dy / ry, dz / rz);
        if (e < 0.97) continue;
        const h = (e - 1) * R; // height above the surface (voxels)
        if (h > len * 1.25) continue;
        const dl = Math.hypot(dx, dy, dz);
        const ux = dx / dl, uy = dy / dl, uz = dz / dl;
        let best = -1, bh = 0;
        for (const [qx, qy, qz, H] of dirs) {
          const c = ux * qx + uy * qy + uz * qz;
          if (c < 0.8) continue;
          const a = Math.acos(Math.min(1, c));
          const allow = H * (1 - a / ang);
          if (allow > best) { best = allow; bh = H; }
        }
        if (best <= 0 || h > best) continue;
        const f = h / bh;
        v.set(x, y, z, f > 0.55 ? (hash3(x, y, z) > 0.25 ? C.tip : C.tipD) : f > 0.25 ? C.spL : C.sp);
      }
}
function pelvisModel() {
  const v = new VoxelModel();
  ell(v, 0, -0.6, -0.6, 5.6, 3.6, 4.8, (x, y, z) => (z >= 1 ? faceCol(x, y, z) : spCol(x, y, z)));
  // apron skirt: rose panel with a white frill hem, flour dust
  for (let x = -5; x <= 4; x++)
    for (let y = -3; y <= 1; y++) {
      const z = surfZ(v, x, y);
      if (z === null || z < 0) continue;
      v.set(x, y, z + 1, y === -3 ? ((x + 40) % 2 ? C.frill : C.apronL) : apronCol(x, y, z));
    }
  spines(v, 0, -0.6, -0.6, 5.6, 3.6, 4.8, (nx, ny, nz) => nz < -0.3 && ny > -0.5, 60, 2.2);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // round body: cream tummy in front, spiny coat round the back and shoulders
  const CY = 2.6, R = [6.2, 5.6, 5.4];
  ell(v, 0, CY, -0.4, R[0], R[1], R[2], (x, y, z) => (y < -1 ? null : z >= 0.5 && abs(x + 0.5) < 4.6 ? faceCol(x, y, z) : spCol(x, y, z)));
  // apron bib + flour handprint + pocket with a wooden spoon
  for (let x = -4; x <= 3; x++)
    for (let y = -1; y <= 5; y++) {
      const z = surfZ(v, x, y);
      if (z === null) continue;
      v.set(x, y, z + 1, y === 5 || x === -4 || x === 3 ? C.apronD : apronCol(x, y, z));
    }
  for (const [x, y] of [[1, 3], [2, 3], [1, 2], [2, 2], [0, 3], [3, 4], [1, 4]]) { const z = surfZ(v, x, y); v.set(x, y, z, C.flour); }
  for (let x = -3; x <= -1; x++) for (let y = -1; y <= 1; y++) { const z = surfZ(v, x, y); v.set(x, y, z + 1, y === 1 ? C.apronD : x === -3 || x === -1 ? C.apronL : C.apron); }
  { const z = surfZ(v, -2, 1); for (let y = 1; y <= 3; y++) v.set(-2, y, z - 1, C.spoon); v.set(-2, 4, z - 1, C.spoonD); v.set(-3, 4, z - 2, C.spoon); }
  // apron straps over the shoulders
  for (const x of [-4, 3]) for (let y = 5; y <= 7; y++) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, C.apronD); }
  // quills all round the back + shoulders
  spines(v, 0, CY, -0.4, R[0], R[1], R[2], (nx, ny, nz) => nz < 0.1 - max(0, ny) * 0.4 || (ny > 0.7 && nz < 0.4), 110, 3.0);
  // neck + red polka-dot kerchief
  rbox(v, -3, 2, 7, 9, -2, 2, 1.2, (x, y, z) => (z >= 1 ? C.face : C.sp));
  for (let x = -4; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const r = Math.hypot((x + 0.5) / 4.2, (z + 0.2) / 3.4);
    if (r <= 1 && r > 0.5) v.set(x, 8, z, (x * 3 + z * 5) % 7 === 0 ? C.dot : C.kerch);
  }
  for (const [x, y] of [[-1, 7], [0, 7], [-1, 6], [0, 6], [0, 5]]) { const z = surfZ(v, x, y); v.set(x, y, z + 1, y === 5 ? C.kerchD : (x + y) % 3 === 0 ? C.dot : C.kerch); }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    // cream face mask (heart-ish shape under a brown widow's peak), spiny back of the head
    const mask = z >= 0.5 && y <= 6.4 - fx * 0.25 && !(fx < 1.2 && y >= 6);
    return mask ? faceCol(x, y, z) : spCol(x, y, z);
  };
  rbox(v, -5, 4, 0, 7, -4, 3, 3.0, col);
  ell(v, 0, 2.6, 0.6, 5.6, 2.8, 3.8, col); // round cheeks
  // pointy snout + shiny nose
  for (let z = 3; z <= 7; z++) {
    const r = lerp(2.6, 1.0, (z - 3) / 4), cy = lerp(2.6, 3.0, (z - 3) / 4);
    for (let x = -3; x <= 2; x++) for (let y = 0; y <= 5; y++) if (Math.hypot(x + 0.5, (y + 0.5 - cy) * 1.15) <= r) v.set(x, y, z, y + 0.5 > cy + 0.4 && z > 4 ? C.faceL : faceCol(x, y, z));
  }
  for (let x = -1; x <= 0; x++) for (let y = 2; y <= 3; y++) v.set(x, y, 8, y === 3 && x === -1 ? C.noseL : C.nose);
  v.set(-1, 3, 7, C.nose); v.set(0, 3, 7, C.nose);
  // flour smudge on the cheek
  v.set(3, 3, 3, C.flour); v.set(3, 2, 3, C.flour); v.set(4, 3, 2, C.flour);
  // quills on the back + the sides of the head (the toque covers the top)
  spines(v, -0.5, 4.0, -0.6, 5.0, 4.0, 3.8, (nx, ny, nz) => nz < -0.2 || (abs(nx) > 0.75 && nz < 0.25 && ny > -0.1), 80, 2.6);
  // a fringe of quills peeking under the toque at the front
  for (const x of [-4, -3, 2, 3]) { v.set(x, 8, 2, C.spD); v.set(x + (x < 0 ? -1 : 1), 9, 2, C.tip); }
  return v;
}
function earModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 1; y++) for (let x = 0; x <= 1; x++) v.set(x, y, 0, x === 0 && y === 0 ? C.earD : C.ear);
  v.set(0, 0, -1, C.earD); v.set(1, 1, -1, C.ear); v.set(0, 2, 0, C.ear);
  return v;
}
function toqueModel() {
  const v = new VoxelModel();
  // band (pleated) + a big puffy top with soft lumps
  for (let y = 0; y <= 2; y++)
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > 4.4 || r < 3.0) continue;
        v.set(x, y, z, y === 0 ? C.toqueDD : (floor20(Math.atan2(z + 0.5, x + 0.5) * 3) % 2) ? C.toque : C.toqueD);
      }
  for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) if (Math.hypot(x + 0.5, z + 0.5) <= 3.4) v.set(x, 2, z, C.toqueD);
  ell(v, 0, 5.6, 0, 6.4, 3.8, 6.2, (x, y, z) => {
    if (y < 3) return null;
    const a = Math.atan2(z + 0.5, x + 0.5), r = Math.hypot(x + 0.5, z + 0.5);
    const lump = sin(a * 5) * 0.9;
    if (r > 6.4 + lump - (y > 7 ? (y - 7) * 1.5 : 0) - (y < 4 ? 1.6 : 0)) return null;
    return y <= 3 ? C.toqueD : (sin(a * 5) < -0.5 && r > 3) ? C.toqueD : y >= 7 && x <= -1 ? 0xffffff : C.toque;
  });
  return v;
}
const floor20 = (a) => Math.floor(a + 20);
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => tone(x, y, z, C.face, C.faceD, C.face, 0.14, 0));
  ell(v, 0.5, -0.6, 0.5, 2.0, 1.5, 2.0, (x, y, z) => (y < -1 ? null : spCol(x, y, z))); // spiny shoulder
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => (y <= -D.L_FORE ? C.paw : faceCol(x, y, z)));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, (x, y, z) => tone(x, y, z, C.face, C.faceD, C.face, 0.14, 0));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 1, 0, -1, 1, 1.0, faceCol);
  const y = -D.SHIN;
  rbox(v, -1, 1, y, y + 1, -1, 3, 0.6, (x, yy, z) => (z === 3 && yy === y ? C.pawD : C.paw));
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  v.set(-1, 0, -1, C.face); v.set(0, 0, -1, C.face); v.set(-1, 1, -1, C.faceD); v.set(0, -1, -2, C.faceD); // tiny stub (bow of the apron hides most of it)
  for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) { v.set(s * k - (s < 0 ? 1 : 0), 2, 0, C.apron); v.set(s * k - (s < 0 ? 1 : 0), 3, 0, k === 2 ? C.apronD : C.apron); }
  v.set(-1, 2, 0, C.apronD); v.set(0, 2, 0, C.apronD); v.set(-1, 1, 0, C.apron); v.set(0, 0, 0, C.apronD);
  return v;
}
function pinModel() {
  // rolling pin along X, centred at the origin
  const v = new VoxelModel();
  for (let x = -8; x <= 7; x++) for (let y = -2; y <= 1; y++) for (let z = -2; z <= 1; z++) {
    const r = Math.hypot(y + 0.5, z + 0.5);
    if (r > 2.2) continue;
    v.set(x, y, z, x === -8 || x === 7 ? C.pinD : y >= 0 && z >= 0 && r > 1.2 ? C.pinL : (x + 40) % 5 === 0 ? C.pinD : C.pin);
  }
  for (const s of [-1, 1]) for (let k = 1; k <= 5; k++) { const x = s > 0 ? 7 + k : -8 - k; v.set(x, -1, -1, k === 5 ? C.pinH : C.pinD); v.set(x, 0, -1, C.pinD); v.set(x, -1, 0, C.pinD); v.set(x, 0, 0, k === 5 ? C.pinH : C.pin); }
  v.set(2, 1, 1, C.flour); v.set(-3, 1, 0, C.flour); v.set(5, 0, 1, C.flour);
  return v;
}
const BOARD_Z = 0.42; // root z of the stool + board (in front of her)
const STOOL = 11; // pastry stool top (fine voxels); the board sits on it
function boardModel() {
  // a little three-legged milking stool with the floury pastry board on top
  const v = new VoxelModel();
  for (const [lx, lz] of [[-6, -4], [5, -4], [0, 5]])
    for (let y = 0; y < STOOL - 1; y++) { v.set(lx + Math.round((y - STOOL) * 0.08 * Math.sign(lx || 0.01)), y, lz + Math.round((STOOL - y) * 0.06 * Math.sign(lz)), y % 4 === 0 ? C.boardD : C.pinH); }
  for (let x = -7; x <= 6; x++) for (let z = -6; z <= 5; z++) if (Math.hypot(x + 0.5, z + 0.5) < 6.6) v.set(x, STOOL - 1, z, Math.hypot(x + 0.5, z + 0.5) > 5.6 ? C.pinH : C.boardD);
  const Y = STOOL;
  for (let x = -12; x <= 11; x++) for (let z = -8; z <= 7; z++) {
    const edge = x === -12 || x === 11 || z === -8 || z === 7;
    v.set(x, Y, z, edge ? C.boardD : (x + 40) % 6 === 0 ? C.boardD : tone(x, 0, z, C.board, C.boardD, C.boardL, 0.1, 0.1));
    if (!edge && hash3(x, 5, z) > 0.8) v.set(x, Y + 1, z, C.flour);
  }
  for (let k = 0; k <= 3; k++) v.set(12 + k, Y, 0, C.boardD); // handle
  v.set(16, Y, 0, C.boardD); v.set(16, Y, 1, C.boardD); v.set(16, Y, -1, C.boardD);
  return v;
}
function doughModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 5.4, 2.6, 4.6, (x, y, z) => (y < 0 ? null : y >= 2 && x <= -1 ? C.doughL : (x + y + z) % 5 === 0 ? C.doughD : C.dough));
  return v;
}
function pieModel() {
  const v = new VoxelModel();
  for (let x = -6; x <= 5; x++)
    for (let z = -6; z <= 5; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 6.2) continue;
      v.set(x, 0, z, C.tin);
      v.set(x, 1, z, r > 5 ? C.crustD : C.berry);
      if (r > 5) { v.set(x, 2, z, (x + z) % 2 ? C.crust : C.crustL); v.set(x, 3, z, r > 5.6 && (x + z) % 3 === 0 ? C.crustD : C.crust); }
      else if ((x + 40) % 3 === 0 || (z + 40) % 3 === 0) v.set(x, 2, z, (x + 40) % 3 === 0 && (z + 40) % 3 === 0 ? C.crustL : C.crust);
      else v.set(x, 2, z, C.berryL);
    }
  return v;
}
function ballModel() {
  // the curled-up hedgehog: a spiky ball with the tip of her snout + toes peeking out at the front-bottom
  const v = new VoxelModel();
  ell(v, 0, 6.4, 0, 6.6, 6.2, 6.4, (x, y, z) => (z >= 3 && y <= 4 && abs(x + 0.5) < 3 ? faceCol(x, y, z) : spCol(x, y, z)));
  spines(v, 0, 6.4, 0, 6.6, 6.2, 6.4, (nx, ny, nz) => !(nz > 0.5 && ny < -0.15) && ny > -0.75, 120, 3.0);
  v.set(-1, 3, 7, C.nose); v.set(0, 3, 7, C.nose); v.set(-1, 4, 7, C.noseL);
  for (const x of [-3, 2]) { v.set(x, 0, 5, C.paw); v.set(x, 0, 6, C.pawD); }
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())), toque: buildGeo(toqueModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    pin: buildGeo(pinModel(), [0, 0, 0], FV), board: buildGeo(boardModel(), [0, 0, 0], FV), dough: buildGeo(doughModel(), [0, 0, 0], FV),
    pie: buildGeo(pieModel(), [0, 0, 0], FV), ball: buildGeo(ballModel(), [0, 0, 0]),
  };
  for (const k of HAND_KINDS) {
    // paws with flour on the fingertips
    const hl = handModel(k, 1, C.paw, C.pawD), hr = handModel(k, -1, C.paw, C.pawD);
    for (const h of [hl, hr]) for (const [key, c] of h.vox) { const y = ((key >> 10) & 1023) - 512; if (y <= -5 && c !== C.pawD) h.vox.set(key, C.flour); }
    G['hand_' + k + 'L'] = buildGeo(hl, [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(hr, [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 18, eyes: [{ x: 11, y: 9 }, { x: 29, y: 9 }], rx: 3.9, ry: 4.5, style: 'bead', lash: true,
  blush: [{ x: 4, y: 15 }, { x: 36, y: 15 }], blushW: 3,
  mw: 24, mh: 10, mx: 12, my: 1, mstyle: 'deer', mHalf: 3,
  pal: { i: '#3a2418', I: '#8a5a3a', b: '#5a3c24' },
};
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 2, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'open', blush: 1, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 1, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 1, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 2, tear: 0 },
  sniff: { eyes: 'closed', brows: 'up', mouth: 'chew1', blush: 1, tear: 0 },
  yum: { eyes: 'happy', brows: 'up', mouth: 'blep', blush: 2, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 2, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
export class HedgehogBaker extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('HedgehogBaker', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('hat', this.head, 0, 7.4, -0.2);
    const hatTilt = new THREE.Group(); hatTilt.rotation.set(-0.1, 0, 0.12); this.hat.add(hatTilt);
    this.mesh(G.toque, hatTilt);
    this.face = new NpcFace(FACE);
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 7.4 - FACE.h / 8, 4.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 2.3 - FACE.mh / 8, 6.6);
    // rolling pin: both hands (a group on the right grip), or tucked in the apron strings at the back
    this.pinHold = new THREE.Group(); this.gripR.add(this.pinHold);
    this.pin = this.mesh(G.pin, this.pinHold, { x: 0.2 });
    this.pinTuck = this.mesh(G.pin, this.hips, { x: -0.5 * VS, y: 1.6 * VS, z: -5.8 * VS });
    this.pinTuck.rotation.set(0, 0.25, -0.5);
    this.pie = this.mesh(G.pie, this.gripL);
    // pastry board + dough (root space, in front), the curled-up ball
    this.board = this.mesh(G.board, this.root, { x: 0, y: 0, z: BOARD_Z });
    this.dough = this.mesh(G.dough, this.root, { x: 0, y: (STOOL + 1) * FV, z: BOARD_Z });
    this.ball = new THREE.Group(); this.root.add(this.ball);
    this.ballSpin = new THREE.Group(); this.ballSpin.position.y = 6.4 * VS; this.ball.add(this.ballSpin);
    this.mesh(G.ball, this.ballSpin, { y: -6.4 * VS });
    const bt = this.mesh(G.toque, this.ball, { y: 12.2 * VS, z: -0.2 * VS });
    bt.rotation.set(-0.2, 0, 0.3); bt.scale.setScalar(0.9);
    this.ballToque = bt;
    // sprites
    const fm = spriteMatPal(FLOUR_ROWS, FLOUR_PAL), sm = spriteMatPal(STEAM_ROWS, STEAM_PAL), stm = spriteMatPal(STAR_ROWS, STAR_PAL);
    const spr = (m, n) => [...Array(n)].map(() => { const s = new THREE.Sprite(m); s.visible = false; this.root.add(s); return s; });
    this.flour = spr(fm, 5);
    this.steam = spr(sm, 3);
    this.stars = spr(stm, 4);
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.root));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.root));
    this.scalar('board', 0);
    this.scalar('flat', 0); // dough: 0 = a ball .. 1 = rolled flat
    this.scalar('flour', 0); // >0.5: flour puffs (at flourX/Z, root voxels)
    this.scalar('flourY', 0);
    this.scalar('steam', 0);
    this.scalar('ball', 0); // >0.5: curled up
    this.scalar('ballY', 0); this.scalar('ballRx', 0); this.scalar('ballS', 1); this.scalar('ballRz', 0);
    this.scalar('poof', 0); // flour-puff burst for the curl transitions (0..1 progress)
    this.scalar('stars', 0);
    this.scalar('notes', 0);
    this.scalar('spark', 0);
    this.scalar('hearts', 0);
    this.jiggle('hat', 'rx', { k: 160, c: 7, az: -0.9, ay: 0.35, max: 0.35, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 160, c: 7, ax: 0.9, max: 0.3, probe: 'head' });
    this.jiggle('hat', 's', { k: 220, c: 8, ay: 0.12, max: 0.12, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.06, max: 0.08, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this.jiggle('earL', 'rz', { k: 200, c: 9, ay: -0.5, max: 0.4, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 200, c: 9, ay: 0.5, max: 0.4, probe: 'head' });
    this.jiggle('tail', 'rz', { k: 140, c: 6, ax: 0.6, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // curled up: hide the body, show the ball
    const curled = k.ball > 0.5;
    this.hips.visible = !curled;
    this.ball.visible = curled;
    if (curled) {
      this.ball.position.set(0, k.ballY * VS, 0);
      this.ballSpin.rotation.set(k.ballRx, 0, k.ballRz);
      const s = k.ballS;
      this.ball.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      this.ballToque.rotation.set(-0.2 + sin(tz * 9) * 0.05, 0, 0.3 + k.ballRz * 0.4);
    }
    // pin
    this.pin.visible = !!p.vis.pin;
    this.pinTuck.visible = !p.vis.pin;
    if (this.pin.visible) orientIn(this.pinHold, this.chest, [0, 1, 0], [0, 0, 1], 1);
    this.pie.visible = !!p.vis.pie;
    if (this.pie.visible) { orientIn(this.pie, this.chest, [0, 1, 0], [0, 0, 1], 1); this.pie.position.set(-0.08, -0.03, 0.06); }
    // board + dough
    this.board.visible = this.dough.visible = k.board > 0.02;
    if (this.board.visible) {
      const b = min(1, k.board);
      this.board.scale.set(b, b, b);
      this.dough.position.y = (STOOL + 1) * FV * b;
      const fl = clamp(k.flat, 0, 1);
      this.dough.scale.set(b * (1 + fl * 0.6), b * (1 - fl * 0.72), b * (1 + fl * 0.35));
    }
    // flour puffs
    const fpz = k.poof;
    this.flour.forEach((s, i) => {
      const u = (tz * 1.6 + i / 5) % 1;
      if (fpz > 0.01 && fpz < 0.99) {
        // burst ring
        const a = i * 1.26;
        s.visible = true;
        s.position.set(cos(a) * (0.12 + fpz * 0.3), 0.18 + fpz * 0.25 + sin(a * 2) * 0.05, sin(a) * (0.1 + fpz * 0.2) + 0.05);
        s.scale.setScalar(0.11 * sin(fpz * PI) + 0.03);
        return;
      }
      s.visible = k.flour > 0.5;
      if (!s.visible) return;
      s.position.set((i - 2) * 0.07 + sin(i * 3 + tz) * 0.03, k.flourY * VS + 0.03 + u * 0.22, BOARD_Z + sin(i * 7) * 0.08);
      s.scale.setScalar(0.07 * (u < 0.7 ? min(1, u * 5) : (1 - u) / 0.3));
    });
    // steam off the pie
    if (this.pie.visible) { this.pie.updateWorldMatrix(true, false); _w2.set(0, 4 * FV, 0); this.pie.localToWorld(_w2); this.root.worldToLocal(_w2); }
    this.steam.forEach((s, i) => {
      const u = (tz * 0.7 + i / 3) % 1;
      s.visible = k.steam > 0.5 && this.pie.visible;
      if (!s.visible) return;
      s.position.set(_w2.x + (i - 1) * 0.06 + sin(u * 6 + i * 2) * 0.04 + u * 0.12 * (i - 1), _w2.y + 0.02 + u * 0.34, _w2.z + 0.04 + u * 0.05);
      s.scale.setScalar(0.075 * (u < 0.75 ? min(1, u * 4) : (1 - u) / 0.25));
    });
    // stars burst (pop out of the ball)
    const st = k.stars;
    this.stars.forEach((s, i) => {
      s.visible = st > 0.02 && st < 0.98;
      const a = i * (TAU / 4) + 0.4;
      s.position.set(cos(a) * (0.15 + st * 0.35), 0.75 + sin(a) * (0.1 + st * 0.3), 0.1);
      s.scale.setScalar(0.08 * sin(st * PI));
    });
    // face sprites
    this.head.updateWorldMatrix(true, false);
    _w.set(0, 4 * VS, 4 * VS); this.head.localToWorld(_w); this.root.worldToLocal(_w);
    if (curled) _w.set(0, 0.6, 0.1);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w.x + 0.14 + u * 0.12 + sin(u * 8 + i) * 0.03, _w.y + 0.08 + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w.x + cos(a) * 0.32, _w.y + 0.2 + sin(a * 1.3) * 0.12, _w.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i * 0.5) % 1;
      s.visible = k.hearts > 0.5;
      s.position.set(_w.x + (i ? 0.17 : -0.15) + sin(u * 6 + i) * 0.03, _w.y + 0.26 + u * 0.28, _w.z - 0.05);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 5));
    });
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Round little baker standing: toes out, a bounce in her step. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.35, 0.7, 0.7, 0.16);
  p.chest.rx -= 0.02;
}
/** Paws folded on her apron. */
function pawsFront(p, rig, w = 1) {
  rig.reach(p, 1, 2.6, 1.6, 6.4, [0.9, -0.4, -0.6], w);
  rig.reach(p, -1, 2.6, 1.6, 6.4, [0.9, -0.4, -0.6], w);
  if (w > 0.5) { p.wristL.rx = p.wristR.rx = 0.6; p.wristL.rz = 0.3; p.wristR.rz = -0.3; p.handL = p.handR = 'relax'; }
}
function onHips(p, rig, side, w = 1) {
  rig.reach(p, side, 6.6, 0.4, 1.8, [0.9, 0.2, -1], w);
  const n = side > 0 ? 'L' : 'R';
  p['wrist' + n].rx = 0.4; p['wrist' + n].rz = side * 0.6; p['hand' + n] = 'fist';
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 1.0);
    p.hips.x = sway * 0.3; p.hips.rz = sway * 0.035; p.chest.rz = -sway * 0.04;
    p.head.rz = sin(t * 1.0 + 0.7) * 0.07;
    const T = t % 10;
    pawsFront(p, rig);
    // dusts the flour off her paws: clap clap, a white puff
    const clap = win(T, 1.6, 3.0, 0.2, 0.25);
    if (clap > 0) {
      const c = max(0, sin((T - 1.6) * 14));
      rig.reach(p, 1, lerp(2.6, 1.2 + c * 1.2, clap), lerp(1.6, 4.4, clap), lerp(6.4, 6.6, clap), [0.9, -0.5, -0.4], clap);
      rig.reach(p, -1, lerp(2.6, 1.2 + c * 1.2, clap), lerp(1.6, 4.4, clap), lerp(6.4, 6.6, clap), [0.9, -0.5, -0.4], clap);
      p.handL = p.handR = 'open'; p.wristL.rz = 0.8; p.wristR.rz = -0.8;
      p.k.flour = clap > 0.6 ? 1 : 0; p.k.flourY = 9;
      if (clap > 0.4) f.eyes = 'happy';
    }
    // sniffs the air (fresh bread somewhere?), snout up, little nose twitches
    const sn = win(T, 4.4, 6.0, 0.3, 0.3);
    p.head.rx -= sn * (0.22 + sin(t * 18) * 0.03); p.chest.rx -= sn * 0.05;
    if (sn > 0.4) { f.expr = 'sniff'; }
    // hums while swaying, toque bobbing
    const hum = win(T, 7.0, 9.4, 0.3, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.head.rz += hum * sin(t * 4) * 0.08; p.hips.x += hum * sin(t * 4) * 0.3;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = 'chew1'; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // quick little steps, round body rocking side to side
    const P = 0.5, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.5);
    p.hips.y = -0.4 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.1; p.chest.rz = -cs * 0.06; p.hips.ry = -sn * 0.08;
    p.chest.rx = 0.05; p.head.rx = -0.04; p.head.rz = cs * 0.06;
    p.armL.rx = sn * 0.5; p.armR.rx = -sn * 0.5; p.armL.rz = 0.35; p.armR.rz = -0.35;
    p.foreL.rx = p.foreR.rx = -0.6; p.handL = p.handR = 'relax';
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    const wv = sin(t * 8.5);
    rig.reach(p, 1, 8.0 + wv * 0.8, 9.8, 2.8, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.45 - 0.2; p.wristL.rx = -0.2; p.handL = 'open';
    onHips(p, rig, -1);
    p.mover.y += abs(sin(t * 4.2)) * 0.4;
    p.chest.rz += 0.07; p.head.rz += -0.12 + sin(t * 4.2) * 0.06;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 7.5, open: 'open', mid: 'grin', shut: 'smile' });
    // warm and busy: paw offers -> counts on her fingers -> hands clasped "oh, you must try it!"
    const T = t % 6.4;
    const offer = win(T, 0.2, 1.9, 0.3, 0.3), count = win(T, 2.2, 3.9, 0.25, 0.25), clasp = win(T, 4.3, 6.0, 0.3, 0.3);
    pawsFront(p, rig, 1 - max(offer, count, clasp));
    if (offer > 0) {
      rig.reach(p, -1, 7.6, 3.4 + sin(t * 5) * 0.3, 6.2, [1, -0.5, -0.3], offer);
      p.handR = 'open'; p.wristR.rz = -0.4 * offer; p.wristR.rx = -0.3; p.chest.ry -= offer * 0.1;
    }
    if (count > 0) {
      rig.reach(p, 1, 3.4, 5.4, 6.6, [1, -0.5, -0.5], count);
      rig.reach(p, -1, 2.4, 5.0 + abs(sin(t * 5)) * 0.5, 7.0, [1, -0.5, -0.5], count);
      p.handL = 'open'; p.handR = 'point'; p.head.rx += count * 0.1;
      f.look = [0, count * 1];
    }
    if (clasp > 0) {
      const m = rig.headPoint(p, 1.0, 5.6, _c);
      for (const sd of [1, -1]) rig.reach(p, sd, 1.6, m[0] - 3.2, m[1] + 1.0, [1, -0.6, -0.2], clasp);
      p.handL = p.handR = 'fist'; p.head.rz += sin(t * 3) * 0.1 * clasp;
      if (clasp > 0.5) f.eyes = 'happy';
    }
    p.head.rx += on ? sin(t * 7.5) * 0.04 : 0;
    p.head.rz += sin(t * 1.3) * 0.08;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // jolly round laugh: paws on her tummy, the whole ball of her jiggling, quills shivering
    const ha = sin(t * 13);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.35 + abs(ha) * 0.35, 0.7, 0.7, 0.16);
    for (const sd of [1, -1]) rig.reach(p, sd, 4.6, 0.6 + abs(ha) * 0.4, 5.6, [0.9, -0.4, -0.6]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.8;
    p.chest.s = 1 + ha * 0.04; p.chest.rx += -0.12 + ha * 0.04; p.head.rx += -0.22 + ha * 0.06;
    p.mover.y += abs(ha) * 0.25;
    p.head.rz = sin(t * 2.4) * 0.12;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
    if (beat(s, 'g', t, 0.9, 0.1)) rig._emit('giggle');
  },
});

const HAPPY_DUR = 1.9;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // bouncy hop with a little spin, both paws up, toque wobbling
    const jump = K(t, [[0, 0], [0.2, -1.0, 'out'], [0.32, 0], [0.56, 3.8, 'out'], [0.82, 0, 'in'], [0.92, -0.8, 'out'], [1.04, 0], [1.2, 1.3, 'out'], [1.34, 0, 'in'], [1.44, -0.4], [1.62, 0]]);
    const up = win(t, 0.24, 1.45, 0.12, 0.35);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    p.mover.ry = sin(clamp((t - 0.32) / 0.5, 0, 1) * PI) * 0.4;
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.3; p.shinL.rx = p.shinR.rx = 0.6; p.thighL.rz = 0.35; p.thighR.rz = -0.35; }
    else rig.stance(p, max(0, -jump) * 1.4 + 0.35, 0.7, 0.7, 0.16);
    p.hips.s = 1 + (jump < 0 ? jump * 0.07 : 0.02);
    const fl = sin(t * 16) * 0.5 * up;
    rig.reach(p, 1, lerp(2.6, 6.8, up), lerp(1.6, 9.4, up) + fl, lerp(6.4, 2.6, up), [1, -0.6, -0.4]);
    rig.reach(p, -1, lerp(2.6, 6.8, up), lerp(1.6, 9.4, up) - fl, lerp(6.4, 2.6, up), [1, -0.6, -0.4]);
    p.handL = p.handR = up > 0.4 ? 'open' : 'relax';
    p.chest.rx -= up * 0.1; p.head.rx -= up * 0.14;
    p.k.spark = clamp((t - 0.45) / 1.2, 0, 1) * (t < 1.7 ? 1 : 0);
    p.k.hearts = t > 0.8 && t < 1.8 ? 1 : 0;
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (beat(s, 'l1', t, 99, 0.82) || beat(s, 'l2', t, 99, 1.34)) rig._emit('step');
  },
});

const RD = 6.2;
def('roll_dough', {
  dur: RD, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, RD);
    // pin from the apron strings, a pastry stool pops up, roll roll roll (flour flies), a proud dusty clap
    stand(p, rig, t, 0.4);
    const lean = K(t, [[0.5, 0], [1.0, 1, 'io'], [4.5, 1], [5.0, 0, 'io']]);
    rig.stance(p, 0.35 + lean * 0.6, 0.7, 0.7, 0.16);
    p.chest.rx += lean * 0.38; p.head.rx -= lean * 0.05; p.hips.rx += lean * 0.06;
    p.k.board = K(t, [[0.15, 0], [0.45, 1.15, 'out'], [0.55, 1], [5.5, 1], [5.85, 0, 'in']]);
    // grab the pin from the back
    const fetch = pulse(t, 0.05, 0.7), stow = pulse(t, 5.15, 0.7);
    p.vis.pin = t > 0.4 && t < 5.5;
    const roll = win(t, 1.0, 4.4, 0.3, 0.3);
    const rz = sin((t - 1.0) * 5.2) * 1.4 * roll; // forward / back strokes
    p.k.flat = K(t, [[1.0, 0], [4.4, 1, 'out'], [5.6, 1]]);
    // the pin rides on top of the dough (stool top + dough height, mover space voxels)
    const top = (STOOL + 1) * FV / VS + 2.4 - p.k.flat * 1.6;
    const c = rig.toChest(p, top + 1.0, BOARD_Z / VS - 0.4 + rz, _c);
    const hx = 3.4;
    rig.reach(p, -1, lerp(4.6, hx, roll), lerp(0.6, c[0], roll), lerp(2.0, c[1], roll), [1, -0.3, -0.6]);
    rig.reach(p, 1, lerp(4.6, hx, roll), lerp(0.6, c[0], roll), lerp(2.0, c[1], roll), [1, -0.3, -0.6]);
    if (fetch > 0 || stow > 0) { const w = max(fetch, stow); rig.reach(p, -1, 2.6, 2.0, -6.0, [1, 0, 0.6], w); p.chest.ry -= w * 0.15; }
    p.handL = p.handR = 'fist';
    p.chest.rx += rz * 0.035; p.hips.z += rz * 0.12;
    p.k.flour = roll > 0.5 && abs(rz) > 0.9 ? 1 : 0; p.k.flourY = (STOOL + 2) * FV / VS;
    // dusty clap at the end
    const clap = win(t, 4.5, 5.2, 0.15, 0.2);
    if (clap > 0) {
      const cc = max(0, sin((t - 4.5) * 16));
      for (const sd of [1, -1]) rig.reach(p, sd, 1.2 + cc * 1.4, 4.4, 7.0, [0.9, -0.5, -0.4], clap);
      p.handL = p.handR = 'open'; p.wristL.rz = 0.8; p.wristR.rz = -0.8; p.vis.pin = false;
      p.k.flour = 1; p.k.flourY = 10;
      f.expr = 'proud'; p.k.spark = clap;
    }
    if (roll > 0.3) { f.look = [0, 1.2]; f.mouth = 'chew1'; p.k.notes = t > 2.2 && t < 3.6 ? 1 : 0; }
    if (roll > 0.5 && beat(s, 'r', t - 1.0, PI / 5.2, 0)) rig._emit('roll');
    if (beat(s, 'cl', t, 99, 4.6)) rig._emit('clap');
  },
});

const TS = 4.6;
def('taste', {
  dur: TS, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, TS);
    stand(p, rig, t, 0.5);
    // a warm pie appears from behind her back, up to the snout: sniiiff... a taste... MMM!
    const fetch = K(t, [[0, 0], [0.4, 1, 'io'], [0.75, 0, 'io'], [3.85, 0], [4.2, 1, 'io'], [4.5, 0, 'io']]);
    const hold = win(t, 0.55, 4.0, 0.3, 0.3);
    const sniff = win(t, 1.0, 2.2, 0.25, 0.25);
    const m = rig.headPoint(p, 1.0, 7.0, _c);
    let x = lerp(4.6, 2.4, fetch), y = lerp(0.6, 1.6, fetch), z = lerp(2.0, -5.4, fetch);
    x = lerp(x, 2.0, hold); y = lerp(y, lerp(4.2, m[0] - 3.2, sniff), hold); z = lerp(z, lerp(7.4, m[1] + 1.4, sniff), hold);
    rig.reach(p, 1, x, y, z, [1, -0.5, -0.5]);
    p.handL = 'open'; p.wristL.rx = -0.2;
    p.vis.pie = (t > 0.4 && t < 4.2);
    p.k.steam = hold > 0.5 ? 1 : 0;
    // right paw supports, then dips a finger and pops it in her mouth
    const dip = K(t, [[2.3, 0], [2.6, 1, 'io'], [2.8, 1], [3.1, 2, 'io'], [3.4, 2], [3.6, 0, 'io']]);
    let rx = lerp(4.6, 2.6, hold * (dip < 0.01 ? 1 : 0.6)), ry = lerp(0.6, y - 0.6, hold), rz = lerp(2.0, z - 0.2, hold);
    if (dip > 0) {
      const d1 = min(1, dip), d2 = max(0, dip - 1);
      rx = lerp(rx, 1.2, d1); ry = lerp(ry, y + 0.8, d1); rz = lerp(rz, z + 0.6, d1);
      rx = lerp(rx, 0.8, d2); ry = lerp(ry, m[0] - 2.4, d2); rz = lerp(rz, m[1] + 1.2, d2);
    }
    rig.reach(p, -1, rx, ry, rz, [1, -0.5, -0.4], max(hold, fetch));
    p.handR = dip > 0.3 ? 'point' : 'open'; p.wristR.rx = -0.3;
    p.head.rx += sniff * (0.12 + sin(t * 18) * 0.03);
    if (sniff > 0.4) { f.expr = 'sniff'; p.k.hearts = sniff > 0.7 ? 1 : 0; }
    if (dip > 1.6) f.mouth = 'chew2';
    const yum = win(t, 3.4, 4.3, 0.12, 0.25);
    if (yum > 0) { f.expr = 'yum'; p.k.spark = yum; p.mover.y += abs(sin(t * 11)) * 0.6 * yum; p.head.rz += sin(t * 8) * 0.1 * yum; }
    else if (hold > 0.5 && sniff < 0.2 && dip < 0.1) f.look = [0, 1];
    if (beat(s, 'sn', t, 99, 1.3)) rig._emit('sniff');
    if (beat(s, 'y', t, 99, 3.45)) rig._emit('yum');
  },
});

const CU = 4.0;
def('curl_up', {
  dur: CU, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, CU);
    // squash + eyes shut -> POOF, a spiky ball -> boing boing, roll forward and back, wobble -> POP! ta-da
    const pre = win(t, 0, 0.42, 0.25, 0.04);
    stand(p, rig, t, 0.4);
    rig.stance(p, 0.35 + pre * 1.6, 0.7, 0.7, 0.16);
    p.chest.rx += pre * 0.5; p.head.rx += pre * 0.4; p.chest.s = 1 - pre * 0.08;
    for (const sd of [1, -1]) rig.reach(p, sd, 2.0, 2.4, 6.0, [0.9, -0.4, -0.6], pre);
    if (pre > 0.3) { f.eyes = 'shut'; f.mouth = 'flat'; }
    const T0 = 0.42, T1 = 2.75;
    p.k.ball = t > T0 && t < T1 ? 1 : 0;
    const u = t - T0;
    p.k.ballY = K(u, [[0, 0], [0.35, 3.4, 'out'], [0.6, 0, 'in'], [0.82, 1.6, 'out'], [1.02, 0, 'in'], [2.33, 0]]);
    p.k.ballS = K(u, [[0, 0.82], [0.12, 1.08], [0.35, 1.0], [0.6, 0.86, 'in'], [0.68, 1.04], [1.02, 0.92], [1.1, 1.0], [2.0, 1.0], [2.25, 0.84, 'io'], [2.33, 1.12]]);
    p.k.ballRx = K(u, [[1.0, 0], [1.45, 2.2, 'io'], [1.95, 0, 'io']]);
    p.k.ballRz = sin(max(0, u - 1.95) * 22) * 0.12 * (u > 1.95 && u < 2.3 ? 1 : 0);
    p.mover.z += K(u, [[1.0, 0], [1.45, 2.0, 'io'], [1.95, 0, 'io']]);
    p.k.poof = K(t, [[T0 - 0.02, 0], [T0 + 0.4, 1, 'out']]) * (t < T0 + 0.41 ? 1 : 0) + K(t, [[T1 - 0.02, 0], [T1 + 0.4, 1, 'out']]) * (t > T1 - 0.02 && t < T1 + 0.41 ? 1 : 0);
    p.k.stars = K(t, [[T1, 0], [T1 + 0.5, 1, 'out']]) * (t < T1 + 0.5 ? 1 : 0);
    // pop out: arms flung up, a hop, toque bounce
    const ta = win(t, T1, CU - 0.15, 0.06, 0.35);
    if (ta > 0) {
      p.mover.y += K(t, [[T1, 0], [T1 + 0.2, 2.4, 'out'], [T1 + 0.45, 0, 'in']]);
      for (const sd of [1, -1]) rig.reach(p, sd, 7.0, 9.4, 2.6, [1, -0.6, -0.4], ta);
      p.handL = p.handR = 'open';
      f.expr = 'proud'; p.k.spark = ta;
    }
    if (beat(s, 'pf', t, 99, T0)) rig._emit('poof');
    if (beat(s, 'b1', t, 99, T0 + 0.6) || beat(s, 'b2', t, 99, T0 + 1.02)) rig._emit('bounce');
    if (beat(s, 'pp', t, 99, T1)) rig._emit('pop');
  },
});

export { ANIMS as HEDGEHOG_ANIMS };
