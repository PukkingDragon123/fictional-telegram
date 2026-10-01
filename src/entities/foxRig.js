// Reynard the fox: a super-expressive voxel rig with an animated 2D pixel
// face, procedural crossfaded animations (squash & stretch, follow-through on
// ears / tail / hat / belly), props, lip-flap talking and look-at.
//
//   const fox = new FoxRig();
//   scene.add(fox.root);
//   fox.play('walk');  fox.setExpression('smug', { hold: 2 });
//   fox.talk('Welcome to my humble pond!');
//   fox.update(dt);
//
// Units: 1 voxel = 0.05 world units. Root origin at the feet, facing +Z.
// Reynard's right side is -X (monocle eye, prop hand).
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';
import {
  FoxFace, expressionState, EXPRESSION_NAMES, FACE_W, FACE_H, MOUTH_W, MOUTH_H,
  makeSpriteTexture, BUBBLE_ROWS, POP_ROWS, ZZZ_ROWS,
} from './foxFace.js';

const VS = 0.05; // world units per voxel
const FV = 0.025; // fine voxels (monocle, chain, props)

/** Seat surface height (world units) the sit_* animations are posed for: matches the lab chair cushion (labScene anchors.foxSeat.seatHeight = 0.5). The root stays on the floor, centred on the seat. */
export const FOX_SEAT_SURFACE = 0.5;
/** Hip (pelvis joint) height above the root when seated, world units. */
export const FOX_SEAT_HEIGHT = FOX_SEAT_SURFACE + 0.13;
/** Desk / keyboard surface height (world units) that sit_type and sit_doze are posed for (the lab desk top is at 0.8). */
export const FOX_DESK_HEIGHT = 0.8;
/** Distance in front of the root (+Z, world units) of the keyboard centre for sit_type. */
export const FOX_KEYBOARD_Z = 0.36;

// ------------------------------------------------------------------ palette
const C = {
  fur: 0xe0662a, furD: 0xd35c25, furDD: 0xb54a1e, furL: 0xea7431, furLL: 0xf38a42,
  cream: 0xf8eedc, creamD: 0xecdcc4, creamDD: 0xd9c2a2,
  sock: 0x302634, sockD: 0x241c28, sockL: 0x46394e, pad: 0x6a4e5c,
  vest: 0x6c3b90, vestD: 0x552b76, vestDD: 0x3e1d5a, vestL: 0x8453aa, satin: 0x4a3060,
  gold: 0xffdc4a, goldD: 0xf0b030, goldDD: 0xb87a1c, goldL: 0xfff6c4,
  red: 0xdc3a30, redD: 0xa8242a, redL: 0xf25e4c,
  hat: 0x221c2a, hatD: 0x17131d, hatL: 0x3b3348, hatLL: 0x5e5270,
  nose: 0x241a22, noseL: 0x6e5e6c,
  earIn: 0xf6c7b4, earInD: 0xe7a795,
  can: 0x58d23c, canD: 0x2f8a2a, canK: 0x1c2420, canS: 0xd8dde6, canSD: 0x9aa2b0, bolt: 0xffe23a,
  sack: 0xd8b27a, sackD: 0xb08850, sackL: 0xecd09c, fish: 0x3c88d8, rope: 0x8a5a2a,
};

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const tone = (x, y, z, base, dark, light, pd = 0.1, pl = 0.09) => {
  const h = hash3(x, y, z);
  return h < pd ? dark : h > 1 - pl ? light : base;
};

// Rounded box with voxel indices x0..x1 etc. (inclusive), edge radius r.
function rbox(v, x0, x1, y0, y1, z0, z1, r, col) {
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  const hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2, hz = (z1 - z0 + 1) / 2;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const qx = Math.abs(x + 0.5 - cx) - (hx - r), qy = Math.abs(y + 0.5 - cy) - (hy - r), qz = Math.abs(z + 0.5 - cz) - (hz - r);
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
        if (d <= 0.02) v.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
}

// ------------------------------------------------------------------ models
// Head: pivot at the neck (bottom centre). x -7..6, y 0..11, z -6..5; muzzle z 6..9.
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const cheek = y + Math.max(0, 2 - z) * 0.9 <= 5.2 && (x <= -4 || x >= 3 || z < 5);
    if (y <= 0 && z > -4) return tone(x, y, z, C.cream, C.creamD, C.cream);
    if (cheek && (z >= 0 || y <= 1)) return tone(x, y, z, C.cream, C.creamD, C.cream, 0.1, 0);
    if (y >= 10 && z <= -2) return tone(x, y, z, C.furD, C.furDD, C.fur);
    return tone(x, y, z, C.fur, C.furD, C.furL);
  };
  rbox(v, -7, 6, 0, 11, -6, 5, 2.4, col);
  rbox(v, -7, 6, 0, 11, 0, 5, 1.1, col);
  // cheek tufts (small jagged fluff)
  for (const s of [-1, 1]) {
    const X = (k) => (s < 0 ? -8 - k : 7 + k);
    for (let y = 1; y <= 3; y++) for (let z = 1; z <= 3; z++) if (!(y === 3 && z === 1)) v.set(X(0), y, z, tone(s, y, z, C.cream, C.creamD, C.cream));
    v.set(X(0), 0, 2, C.creamD); v.set(X(1), 2, 2, C.cream); v.set(X(1), 1, 3, C.creamD);
  }
  // muzzle (6 x 4, 4 deep)
  for (let z = 6; z <= 9; z++)
    for (let x = -3; x <= 2; x++)
      for (let y = 0; y <= 3; y++) {
        if (z >= 8 && y === 3 && (x === -3 || x === 2)) continue;
        let c = y >= 3 || (y === 2 && (x === -3 || x === 2) && z < 8) ? tone(x, y, z, C.fur, C.furD, C.furL) : tone(x, y, z, C.cream, C.creamD, C.cream, 0.08, 0);
        if (y === 0 && z === 9) c = C.creamD;
        v.set(x, y, z, c);
      }
  // button nose
  v.set(-1, 3, 9, C.nose); v.set(0, 3, 9, C.nose);
  v.set(-1, 3, 10, C.noseL); v.set(0, 3, 10, C.nose);
  return v;
}

// Ear (left; mirrored for right): pivot at the base centre, tip leans out (+x).
function earModel(side) {
  const v = new VoxelModel();
  const rows = [[-2, 1], [-2, 1], [-2, 1], [-2, 1], [-1, 1], [-1, 1], [0, 1], [0, 0]];
  rows.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++)
      for (let z = -2; z <= 0; z++) {
        if (z === -2 && (y > 3 || x === a || x === b)) continue;
        let c = tone(x, y, z, C.fur, C.furD, C.furL);
        if (y >= 5) c = y === 5 && z === -2 ? C.sock : tone(x, y, z, C.sock, C.sockD, C.sockL);
        else if (z === 0 && x > a && x < b && y <= 4) c = y >= 3 ? C.earInD : C.earIn;
        else if (z === 0 && y === 4 && (x === a || x === b)) c = C.sock;
        v.set(side < 0 ? -1 - x : x, y, z, c);
      }
  });
  return v;
}

// Top hat: pivot at the brim underside centre.
function hatModel() {
  const v = new VoxelModel();
  for (let x = -5; x <= 4; x++)
    for (let z = -5; z <= 4; z++) {
      const dx = x + 0.5, dz = z + 0.5;
      if ((dx * dx) / 25 + (dz * dz) / 25 > 1) continue;
      v.set(x, 0, z, Math.abs(dz) < 4 && Math.abs(dx) > 4 ? C.hatL : C.hatD);
      if (Math.abs(dx) > 3.9 && Math.abs(dz) < 3) v.set(x, 1, z, C.hat); // side curl
    }
  for (let y = 1; y <= 10; y++)
    for (let x = -3; x <= 2; x++)
      for (let z = -3; z <= 2; z++) {
        const cx = Math.abs(x + 0.5), cz = Math.abs(z + 0.5);
        const flare = y >= 9 ? 0 : 0.6;
        if (cx > 2 && cz > 2 && flare > 0) continue;
        let c = tone(x, y, z, C.hat, C.hatD, C.hat);
        if (y <= 2) c = y === 1 ? C.redD : C.red;
        else if (x === -2 && z === 2 && y >= 4 && y <= 8) c = C.hatLL; // silk highlight
        else if ((x === -3 || z === 2) && y >= 3) c = tone(x, y, z, C.hatL, C.hat, C.hatL);
        if (y === 10) c = x === -2 && z >= 0 ? C.hatL : C.hat;
        v.set(x, y, z, c);
      }
  // flare lip at the top
  for (let x = -3; x <= 2; x++) { v.set(x, 10, 3, C.hat); v.set(x, 10, -4, C.hatD); }
  for (let z = -3; z <= 2; z++) { v.set(-4, 10, z, C.hatL); v.set(3, 10, z, C.hatD); }
  // gold buckle on the band
  v.set(-1, 2, 3, C.gold); v.set(0, 2, 3, C.goldD); v.set(-1, 1, 3, C.goldD); v.set(0, 1, 3, C.gold);
  return v;
}

// Torso (waistcoat): pivot at the waist. y -2..5 (+ neck ruff), x -5..4, z -4..3, belly to z 4.
function torsoModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = x + 0.5;
    // V-neck with chest fluff
    if (z >= 1 && y >= 1 && Math.abs(fx) <= (y - 0.6) * 0.75) return tone(x, y, z, C.cream, C.creamD, C.cream);
    if (z >= 1 && y >= 1 && Math.abs(fx) <= (y - 0.6) * 0.75 + 1) return C.vestDD; // lapel edge
    if (y === -2) return C.vestDD;
    if (z <= -3 && y >= -1 && y <= 4) return tone(x, y, z, C.satin, C.vestDD, C.satin);
    return tone(x, y, z, C.vest, C.vestD, C.vestL, 0.18, 0.12);
  };
  rbox(v, -5, 4, -2, 5, -4, 3, 1.7, col);
  rbox(v, -4, 3, -2, 3, 0, 4, 2.1, col); // belly
  // neck ruff (hidden inside the head at rest, fills gaps when the head tilts)
  rbox(v, -4, 3, 5, 8, -3, 3, 1.4, (x, y, z) => (z >= 1 ? tone(x, y, z, C.cream, C.creamD, C.cream) : tone(x, y, z, C.fur, C.furD, C.furL)));
  // waistcoat points at the front hem
  for (const [a, b] of [[-3, -1], [0, 2]]) for (let x = a; x <= b; x++) v.set(x, -3, 3, C.vestDD);
  v.set(-2, -3, 2, C.vestDD); v.set(1, -3, 2, C.vestDD);
  // gold buttons (flush) + a pocket welt
  for (const y of [1, -1]) { v.set(-1, y, 4, C.gold); v.set(0, y, 4, C.goldD); }
  for (let x = 1; x <= 3; x++) v.set(x, 2, 4, C.vestDD);
  v.set(-4, 0, 3, C.gold); v.set(-3, -1, 4, C.goldD);
  // bow tie
  for (let y = 4; y <= 5; y++) {
    for (const x of [-4, -3, -2, 1, 2, 3]) v.set(x, y, 4, (x === -4 || x === 3) && y === 5 ? C.redD : C.red);
    v.set(-1, y, 4, C.redD); v.set(0, y, 4, C.redD);
    v.set(-1, y, 5, C.red); v.set(0, y, 5, C.redL);
  }
  v.set(-3, 6, 4, C.redL); v.set(2, 6, 4, C.red); v.set(-2, 3, 4, C.redD); v.set(1, 3, 4, C.redD);
  // back buckle
  v.set(-1, 0, -5, C.gold); v.set(0, 0, -5, C.goldD);
  return v;
}

function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -3, 0, -3, 2, 1.5, (x, y, z) => (z >= 2 && y <= -2 ? tone(x, y, z, C.cream, C.creamD, C.cream) : tone(x, y, z, C.fur, C.furD, C.furL)));
  return v;
}

// Upper arm: pivot at the shoulder (voxel centre), hangs down 4.
function upperArmModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -4, 1, -1, 1, 0.9, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  return v;
}
function forearmModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -3, 0, -1, 1, 0.8, (x, y, z) => (y === 0 ? tone(x, y, z, C.furD, C.sock, C.furD) : tone(x, y, z, C.sock, C.sockD, C.sockL)));
  return v;
}
// Paws: pivot at the wrist; `inner` = -1 for the left paw (thumb toward -x).
function pawModel(kind, inner) {
  const v = new VoxelModel();
  const S = (x, y, z) => tone(x, y, z, C.sock, C.sockD, C.sockL);
  const X = (x) => x * -inner; // author with the thumb at +x
  if (kind === 'open') {
    rbox(v, -1, 1, -2, 0, -1, 1, 0.6, S);
    for (const x of [-1, 0, 1]) { v.set(X(x) * 1, -3, 0, S(x, -3, 0)); v.set(X(x), -4, x === 0 ? 0 : x > 0 ? 1 : -1, S(x, -4, 0)); }
    v.set(X(2), -1, 1, S(2, -1, 1)); v.set(X(2), -2, 1, S(2, -2, 1));
    for (let y = -2; y <= 0; y++) v.set(X(1), y, 0, C.pad);
  } else if (kind === 'point') {
    rbox(v, -1, 1, -3, 0, -1, 1, 0.8, S);
    v.set(X(1), -4, 1, S(1, -4, 1)); v.set(X(1), -5, 1, S(1, -5, 1)); v.set(X(1), -6, 1, C.sockL);
    v.set(X(2), -2, 0, S(2, -2, 0));
  } else if (kind === 'fist') {
    rbox(v, -1, 1, -3, 0, -1, 1, 0.8, S);
    v.set(X(2), -2, 0, S(2, -2, 0)); v.set(X(2), -2, 1, C.sockL);
    for (const x of [-1, 0, 1]) v.set(x, -3, 2, x === 0 ? C.sockL : C.sock);
  } else {
    rbox(v, -1, 1, -3, 0, -1, 1, 0.9, S);
    v.set(X(2), -1, 1, S(2, -1, 1)); v.set(X(2), -2, 1, S(2, -2, 1));
    v.set(X(1), -2, 1, C.pad);
  }
  return v;
}

function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -3, 1, -2, 1, 1.2, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  const S = (x, y, z) => tone(x, y, z, C.sock, C.sockD, C.sockL);
  rbox(v, -2, 1, -2, 0, -2, 1, 1.0, (x, y, z) => (y === 0 ? tone(x, y, z, C.furD, C.sock, C.furD) : S(x, y, z)));
  rbox(v, -2, 1, -3, -2, -2, 3, 0.8, S); // foot
  for (const x of [-1, 0]) v.set(x, -2, 3, C.sockD);
  v.set(-2, -3, 3, C.sockL); v.set(1, -3, 3, C.sockL); v.set(-1, -3, 4, C.sock); v.set(0, -3, 4, C.sock);
  return v;
}

// Tail segment: along -Z from the pivot. r0 -> r1 radius, `tip` = cream end.
function tailModel(len, r0, r1, tipFrom = 99, cap = false) {
  const v = new VoxelModel();
  for (let z = 1; z >= -len; z--) {
    const u = Math.min(1, Math.max(0, -z / len));
    let r = r0 + (r1 - r0) * u;
    if (cap && u > 0.55) r *= Math.sqrt(Math.max(0.05, 1 - ((u - 0.55) / 0.45) ** 2));
    const ry = r * 0.92;
    const R = Math.ceil(r);
    for (let x = -R - 1; x <= R; x++)
      for (let y = -R - 1; y <= R; y++) {
        const dx = x + 0.5, dy = y + 0.5;
        if ((dx * dx) / (r * r) + (dy * dy) / (ry * ry) > 1) continue;
        let c;
        if (-z >= tipFrom) c = tone(x, y, z, C.cream, C.creamD, C.cream, 0.12, 0);
        else if (-z >= tipFrom - 1 && hash3(x, y, z) < 0.5) c = C.creamD;
        else if (dy > ry * 0.35) c = tone(x, y, z, C.furD, C.furDD, C.fur);
        else if (dy < -ry * 0.4) c = tone(x, y, z, C.furL, C.fur, C.furLL);
        else c = tone(x, y, z, C.fur, C.furD, C.furL, 0.2, 0.15);
        v.set(x, y, z, c);
      }
  }
  return v;
}

// Monocle ring in fine voxels, centred on the lens.
function monocleModel() {
  const v = new VoxelModel();
  for (let x = -6; x <= 5; x++)
    for (let y = -6; y <= 5; y++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d > 5.6 || d < 4.5) continue;
      const c = x + y < -3 ? C.goldL : x + y > 3 ? C.goldD : C.gold;
      v.set(x, y, 0, c);
    }
  v.set(-6, -4, 0, C.goldD); v.set(-7, -5, 0, C.gold); // chain loop
  return v;
}

function canModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 7; y++)
    for (let x = -2; x <= 1; x++)
      for (let z = -2; z <= 1; z++) {
        if ((x === -2 || x === 1) && (z === -2 || z === 1)) continue;
        let c = y === 0 || y === 7 ? C.canSD : y === 6 ? C.canS : y === 1 ? C.canK : C.can;
        if (y >= 2 && y <= 5 && z === 1) c = (y === 4 && x === -1) || (y === 3 && x === 0) || (y === 5 && x === 0) || (y === 2 && x === -1) ? C.bolt : y === 3 || y === 4 ? C.canK : C.can;
        if (y >= 2 && y <= 5 && (x === -2 || x === 1) && y % 2 === 0) c = C.canD;
        v.set(x, y, z, c);
      }
  v.set(0, 8, 0, C.canS); v.set(0, 8, -1, C.canSD);
  return v;
}
function coinModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++)
    for (let z = -3; z <= 2; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 3.1) continue;
      v.set(x, 0, z, d > 2.2 ? C.goldD : x + z < -1 ? C.goldL : C.gold);
    }
  v.set(-1, 1, -1, C.goldD); v.set(0, 1, 0, C.goldD); v.set(-1, 1, 0, C.gold);
  return v;
}
function stackModel() {
  const v = new VoxelModel();
  for (let i = 0; i < 6; i++) {
    const o = [0, 1, 0, -1, 0, 1][i];
    for (let x = -3; x <= 2; x++)
      for (let z = -3; z <= 2; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > 3.1) continue;
        v.set(x + o, i, z, i % 2 ? C.goldD : d > 2.4 ? C.goldD : C.gold);
      }
  }
  return v;
}
function sackModel() {
  const v = new VoxelModel();
  rbox(v, -3, 3, 0, 6, -2, 2, 1.6, (x, y, z) => tone(x, y, z, C.sack, C.sackD, C.sackL));
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.set(x, 7, z, C.sackD);
  v.set(0, 8, 0, C.sack); v.set(-1, 8, 0, C.sackL); v.set(1, 8, 0, C.sack);
  for (let x = -2; x <= 2; x++) v.set(x, 7, 2, C.rope);
  // fish logo
  v.set(-1, 3, 3, C.fish); v.set(0, 3, 3, C.fish); v.set(1, 3, 3, C.fish); v.set(0, 4, 3, C.fish); v.set(0, 2, 3, C.fish); v.set(2, 4, 3, C.fish); v.set(2, 2, 3, C.fish);
  return v;
}

// Geometry cache shared by all rigs (ref counted).
let GEO = null, geoRefs = 0;
function geometries() {
  if (GEO) return GEO;
  const b = (m, pivot, s = VS) => m.build({ pivot, scale: s });
  GEO = {
    head: b(headModel(), [0, 0, 0]),
    earL: b(earModel(1), [0, 0, 0]),
    earR: b(earModel(-1), [0, 0, 0]),
    hat: b(hatModel(), [0, 0, 0]),
    torso: b(torsoModel(), [0, 0, 0]),
    pelvis: b(pelvisModel(), [0, 0, 0]),
    upperArm: b(upperArmModel(), [0.5, 0, 0.5]),
    forearm: b(forearmModel(), [0.5, 0, 0.5]),
    thigh: b(thighModel(), [0, 0, 0]),
    shin: b(shinModel(), [0, 0, 0]),
    tail0: b(tailModel(5, 1.7, 2.6), [0, 0, 0]),
    tail1: b(tailModel(6, 2.6, 3.5), [0, 0, 0]),
    tail2: b(tailModel(7, 3.5, 3.1, 4.6, true), [0, 0, 0]),
    monocle: b(monocleModel(), [0, 0, 0.5], FV),
    can: b(canModel(), [0, 0, 0], FV),
    coin: b(coinModel(), [0, 0.5, 0], FV),
    stack: b(stackModel(), [0, 0, 0], FV),
    sack: b(sackModel(), [0, 0, 0], FV),
    link: new THREE.BoxGeometry(FV * 0.9, FV * 0.9, FV * 0.9),
  };
  for (const kind of ['relax', 'fist', 'open', 'point']) {
    GEO['pawL_' + kind] = b(pawModel(kind, -1), [0.5, 0, 0.5]);
    GEO['pawR_' + kind] = b(pawModel(kind, 1), [0.5, 0, 0.5]);
  }
  return GEO;
}

// ------------------------------------------------------------------ materials
// Lambert + per-voxel grain aligned to 0.05 voxels (offset for half-voxel pivots).
const matCache = new Map();
function foxMaterial(ox = 0, oy = 0, oz = 0, amount = 0.08, emissive = 0) {
  const key = `${ox},${oy},${oz},${amount},${emissive}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive });
  const off = new THREE.Vector3(ox, oy, oz);
  const freq = amount > 0 ? (1 / VS).toFixed(1) : '1.0';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGrainOff = { value: off };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFoxPos;\nvarying vec3 vFoxNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFoxPos = position;\nvFoxNor = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uGrainOff;
varying vec3 vFoxPos;
varying vec3 vFoxNor;
float foxHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vFoxNor);
  vec3 g = vFoxPos * ${freq} + uGrainOff;
  vec2 cell = an.y > 0.5 ? g.xz : (an.x > 0.5 ? g.zy : g.xy);
  float gn = foxHash(floor(cell + 0.001));
  diffuseColor.rgb *= 1.0 + (gn - 0.5) * ${amount.toFixed(3)};
}`);
  };
  m.customProgramCacheKey = () => 'foxgrain' + amount;
  matCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ helpers
const TAU = Math.PI * 2;
const { sin, cos, abs, min, max, PI } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const EASE = {
  lin: (x) => x,
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  io: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
  in3: (x) => x * x * x,
  out3: (x) => 1 - (1 - x) ** 3,
  back: (x) => { const c = 1.8; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; },
  el: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-9 * x) * sin((x * 10 - 0.75) * (TAU / 3)) + 1),
  step: (x) => (x < 1 ? 0 : 1),
};
// Keyframes [[t, v, ease?], ...]; the ease applies to the segment ending at a key.
function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k[0]) {
      const p = keys[i - 1];
      const u = k[0] > p[0] ? (t - p[0]) / (k[0] - p[0]) : 1;
      return p[1] + (k[1] - p[1]) * EASE[k[2] || 'io'](u);
    }
  }
  return keys[keys.length - 1][1];
}
// 0 -> 1 between a and a+ra, back to 0 between b and b+rb
const win = (t, a, b, ra = 0.12, rb = 0.12) => smooth((t - a) / ra) * (1 - smooth((t - b) / rb));
const pulse = (t, a, d) => (t >= a && t < a + d ? sin(((t - a) / d) * PI) : 0);
const once = (s, key, cond, fn) => { if (cond && !s[key]) { s[key] = true; fn(); } };

// ------------------------------------------------------------------ skeleton constants (voxels)
const HIP_Y = 6, WAIST = 1, NECK_Y = 6, SHOULDER_X = 5.5, SHOULDER_Y = 5;
const L_UPPER = 4, L_FORE = 2.5, L_PAW = 1.6; // arm lengths
const EYE_POS = [-3.25, 7.5, 6.6]; // right eye centre (head space), monocle rest
const NOSE_POS = [-0.5, 2.6, 11.1];
const HAT_SEAT = [0, 12, -0.5];
const HAT_TOP = 11.2;

// ------------------------------------------------------------------ pose
function mkArm() { return { sw: 0, ra: 0, tw: 0, el: 0, wx: 0, wy: 0, wz: 0, ik: 0, tx: 0, ty: 0, tz: 0, px: 0.6, py: -0.3, pz: -1, shY: 0, shZ: 0, st: 1.4 }; }
function mkLeg() { return { sw: 0, sp: 0, tw: 0, kn: 0 }; }
function mkEar() { return { fl: 0, sp: 0, tw: 0 }; }

class Pose {
  constructor() {
    this.aL = mkArm(); this.aR = mkArm();
    this.lL = mkLeg(); this.lR = mkLeg();
    this.eL = mkEar(); this.eR = mkEar();
    this.reset();
  }
  reset() {
    this.x = 0; this.y = 0; this.z = 0; this.lean = 0; this.turn = 0; this.roll = 0; this.sq = 1;
    this.hipX = 0; this.hipY = 0; this.hipZ = 0; this.hipRx = 0; this.hipRy = 0; this.hipRz = 0;
    this.chRx = 0; this.chRy = 0; this.chRz = 0; this.breath = 0;
    this.hRx = -0.05; this.hRy = 0; this.hRz = 0; this.hSq = 1;
    for (const [a, s] of [[this.aL, 1], [this.aR, -1]]) {
      Object.assign(a, { sw: -0.12, ra: 0.16, tw: 0, el: 0.7, wx: 0.1, wy: 0, wz: 0, ik: 0, tx: 0, ty: 0, tz: 0, px: 0.7, py: -0.4, pz: -1, shY: 0, shZ: 0, st: 1.4 });
      a.side = s;
    }
    for (const l of [this.lL, this.lR]) Object.assign(l, { sw: 0, sp: 0.04, tw: 0, kn: 0 });
    for (const e of [this.eL, this.eR]) Object.assign(e, { fl: 0, sp: 0.2, tw: 0 });
    this.tLift = 0.25; this.tSide = 0.75; this.tCurl = 0.95; this.tCurlSide = 0.25; this.tPuff = 1; this.tTw = 0;
    this.hatRx = 0; this.hatRz = 0; this.hatY = 0;
    this.lookW = 1; // how much lookAt may turn the head
    this.pawL = 'relax'; this.pawR = 'relax';
    this.propL = null; this.propR = null;
  }
  // IK helper: paw centre target in chest space (voxels); pole outward/down/back
  ik(arm, x, y, z, px = 0.7, py = -0.4, pz = -1, w = 1) {
    arm.ik = w; arm.tx = x * arm.side; arm.ty = y; arm.tz = z; arm.px = px; arm.py = py; arm.pz = pz;
  }
}

// Face request written by animations each frame.
function mkFaceReq() {
  return { expr: null, eyeL: null, eyeR: null, browL: null, browR: null, mouth: null, look: null, blush: null, sweat: null, vein: null, tear: null, drool: null, snot: 0, zzz: 0, blink: true, browLift: 0 };
}
function resetFaceReq(f) {
  f.expr = null; f.eyeL = f.eyeR = f.browL = f.browR = f.mouth = null; f.look = null;
  f.blush = f.sweat = f.vein = f.tear = f.drool = null; f.snot = 0; f.zzz = 0; f.blink = true; f.browLift = 0;
}

// ------------------------------------------------------------------ frame (joint transforms)
const J = ['mover', 'hips', 'chest', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'thL', 'knL', 'thR', 'knR', 't0', 't1', 't2', 'earL', 'earR', 'hat'];
const JI = Object.fromEntries(J.map((n, i) => [n, i]));
const NS = 12; // scalars: sq, hSq, breath, puff, stretchL, stretchR, lookW, shYL, shYR, shZL, shZR, tTw
class Frame {
  constructor() {
    this.q = J.map(() => new THREE.Quaternion());
    this.moverP = new THREE.Vector3();
    this.hipsP = new THREE.Vector3();
    this.hatP = new THREE.Vector3();
    this.s = new Float32Array(NS);
  }
  copy(o) {
    for (let i = 0; i < J.length; i++) this.q[i].copy(o.q[i]);
    this.moverP.copy(o.moverP); this.hipsP.copy(o.hipsP); this.hatP.copy(o.hatP);
    this.s.set(o.s);
    return this;
  }
  blend(a, b, w) {
    for (let i = 0; i < J.length; i++) this.q[i].slerpQuaternions(a.q[i], b.q[i], w);
    this.moverP.lerpVectors(a.moverP, b.moverP, w);
    this.hipsP.lerpVectors(a.hipsP, b.hipsP, w);
    this.hatP.lerpVectors(a.hatP, b.hatP, w);
    for (let i = 0; i < NS; i++) this.s[i] = a.s[i] + (b.s[i] - a.s[i]) * w;
    return this;
  }
}

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const setQ = (q, x, y, z, order) => q.setFromEuler(_e.set(x, y, z, order));

// Two-bone arm IK in chest space. Writes shoulder + elbow quaternions, returns stretch.
function solveArm(arm, qS, qE) {
  const side = arm.side;
  const S = _v1.set(side * SHOULDER_X, SHOULDER_Y + arm.shY, arm.shZ);
  const T = _v2.set(arm.tx, arm.ty, arm.tz);
  const L1 = L_UPPER, L2 = L_FORE + L_PAW;
  const d = _v3.subVectors(T, S);
  let dist = d.length();
  let stretch = 1;
  const reach = (L1 + L2) * 0.995;
  if (dist > reach) { stretch = Math.min(arm.st, dist / reach); }
  const l1 = L1 * stretch, l2 = L2 * stretch;
  dist = clamp(dist, Math.abs(l1 - l2) + 0.3, (l1 + l2) * 0.995);
  const dir = d.normalize();
  const pole = _v4.set(arm.px * side, arm.py, arm.pz);
  pole.addScaledVector(dir, -pole.dot(dir));
  if (pole.lengthSq() < 1e-6) pole.set(side, 0, -0.3).addScaledVector(dir, -dir.x * side);
  pole.normalize();
  const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
  // elbow position
  const E = _v5.copy(S).addScaledVector(dir, l1 * cos(a)).addScaledVector(pole, l1 * sin(a));
  // upper arm basis: +Y from elbow to shoulder, +Z toward the bend
  _ay.subVectors(S, E).normalize();
  _az.set(arm.tx, arm.ty, arm.tz).sub(E);
  _az.addScaledVector(_ay, -_az.dot(_ay));
  if (_az.lengthSq() < 1e-6) _az.copy(pole).negate();
  _az.normalize();
  _ax.crossVectors(_ay, _az).normalize();
  _az.crossVectors(_ax, _ay);
  _m.makeBasis(_ax, _ay, _az);
  qS.setFromRotationMatrix(_m);
  const b = Math.acos(clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1));
  setQ(qE, -(PI - b), 0, 0, 'XYZ');
  return stretch;
}

function poseToFrame(p, F) {
  F.moverP.set(p.x * VS, p.y * VS, p.z * VS);
  setQ(F.q[JI.mover], p.lean, p.turn, p.roll, 'YXZ');
  F.hipsP.set(p.hipX * VS, (HIP_Y + p.hipY) * VS, p.hipZ * VS);
  setQ(F.q[JI.hips], p.hipRx, p.hipRy, p.hipRz, 'YXZ');
  setQ(F.q[JI.chest], p.chRx, p.chRy, p.chRz, 'YXZ');
  setQ(F.q[JI.head], p.hRx, p.hRy, p.hRz, 'YXZ');
  const s = F.s;
  s[0] = p.sq; s[1] = p.hSq; s[2] = p.breath; s[3] = p.tPuff; s[6] = p.lookW; s[11] = p.tTw;
  for (const [a, sh, el, wr, si, yi, zi] of [[p.aL, 'shL', 'elL', 'wrL', 4, 7, 9], [p.aR, 'shR', 'elR', 'wrR', 5, 8, 10]]) {
    const side = a.side;
    const qS = F.q[JI[sh]], qE = F.q[JI[el]];
    setQ(qS, a.sw, a.tw * side, a.ra * side, 'ZXY');
    setQ(qE, -a.el, 0, 0, 'XYZ');
    s[si] = 1;
    if (a.ik > 0) {
      const st = solveArm(a, _q1, _q2);
      if (a.ik >= 1) { qS.copy(_q1); qE.copy(_q2); s[si] = st; }
      else { qS.slerp(_q1, a.ik); qE.slerp(_q2, a.ik); s[si] = lerp(1, st, a.ik); }
    }
    setQ(F.q[JI[wr]], a.wx, a.wy * side, a.wz * side, 'XYZ');
    s[yi] = a.shY; s[zi] = a.shZ;
  }
  for (const [l, th, kn, side] of [[p.lL, 'thL', 'knL', 1], [p.lR, 'thR', 'knR', -1]]) {
    setQ(F.q[JI[th]], l.sw, l.tw * side, l.sp * side, 'ZXY');
    setQ(F.q[JI[kn]], l.kn, 0, 0, 'XYZ');
  }
  // tail: lift/side distributed over 3 segments + curl toward the tip
  const tw = [0.5, 0.3, 0.2], cw = [0.15, 0.35, 0.5];
  for (let i = 0; i < 3; i++) setQ(F.q[JI['t' + i]], p.tLift * tw[i] + p.tCurl * cw[i], -(p.tSide * tw[i] + p.tCurlSide * cw[i]), 0, 'YXZ');
  setQ(F.q[JI.earL], -p.eL.fl, p.eL.tw, -p.eL.sp, 'XYZ');
  setQ(F.q[JI.earR], -p.eR.fl, -p.eR.tw, p.eR.sp, 'XYZ');
  F.hatP.set(0, p.hatY * VS, 0);
  setQ(F.q[JI.hat], p.hatRx, 0, p.hatRz, 'XYZ');
}

// Damped spring on one value.
class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, force, dt) { this.v += (this.k * (target - this.x) - this.c * this.v + force) * dt; this.x += this.v * dt; return this.x; }
}

// Tracks an object's world motion in its own local frame.
class MotionProbe {
  constructor() {
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3(); this.a = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.dq = new THREE.Vector3(); this.init = false;
    this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
  }
  sample(obj, dt) {
    obj.matrixWorld.decompose(this._p, this._q, this._s);
    if (!this.init || dt <= 0) {
      this.p.copy(this._p); this.q.copy(this._q); this.v.set(0, 0, 0); this.a.set(0, 0, 0); this.dq.set(0, 0, 0); this.init = true;
      return;
    }
    const nv = this._v.subVectors(this._p, this.p).divideScalar(dt);
    if (nv.lengthSq() > 400) nv.setLength(20); // teleport guard
    this.a.subVectors(nv, this.v).divideScalar(dt);
    if (this.a.lengthSq() > 3600) this.a.setLength(60);
    this.v.copy(nv);
    // to local frame
    _q1.copy(this._q).invert();
    this.a.applyQuaternion(_q1);
    // local rotation delta
    _q2.copy(this.q).invert().multiply(this._q);
    if (_q2.w < 0) { _q2.x = -_q2.x; _q2.y = -_q2.y; _q2.z = -_q2.z; _q2.w = -_q2.w; }
    const ang = 2 * Math.acos(clamp(_q2.w, -1, 1));
    const sn = Math.sqrt(Math.max(1e-9, 1 - _q2.w * _q2.w));
    this.dq.set(_q2.x / sn, _q2.y / sn, _q2.z / sn).multiplyScalar(ang > 1e-5 ? Math.min(ang, 0.5) : 0);
    this.p.copy(this._p); this.q.copy(this._q);
  }
}

// ------------------------------------------------------------------ the rig
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion(), _ws = new THREE.Vector3();
const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4();
const _pA = new THREE.Vector3(), _pB = new THREE.Vector3(), _qA = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _sA = new THREE.Vector3(), _sB = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class FoxRig {
  constructor({ shadows = true } = {}) {
    const G = geometries();
    geoRefs++;
    this.shadows = shadows;
    const M = foxMaterial(), MA = foxMaterial(0.5, 0, 0.5);
    const MG = foxMaterial(0, 0, 0, 0, 0x2a1c00);
    const meshes = (this._meshes = []);
    const mesh = (geo, mat, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadows;
      parent.add(m);
      meshes.push(m);
      return m;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x * VS, y * VS, z * VS);
      parent.add(g);
      return g;
    };
    this.root = new THREE.Group();
    this.root.name = 'Reynard';
    this.mover = grp(this.root);
    this.hips = grp(this.mover, 0, HIP_Y, 0);
    this.pelvis = mesh(G.pelvis, M, this.hips);
    this.chest = grp(this.hips, 0, WAIST, 0);
    this.torso = mesh(G.torso, M, this.chest);
    this.neck = grp(this.chest, 0, NECK_Y, 0);
    this.head = grp(this.neck);
    this.headMesh = mesh(G.head, M, this.head);
    this.earL = grp(this.head, 4.7, 11.3, -1.5); mesh(G.earL, M, this.earL);
    this.earR = grp(this.head, -4.7, 11.3, -1.5); mesh(G.earR, M, this.earR);
    this._earRest = [this.earL.position.clone(), this.earR.position.clone()];

    // 2D face
    this.face = new FoxFace();
    const faceMat = (map) => new THREE.MeshLambertMaterial({ map, transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.16 });
    this.faceMat = faceMat(this.face.face.tex);
    this.mouthMat = faceMat(this.face.mouth.tex);
    this._planes = [];
    const plane = (w, h, mat, parent, x, y, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z);
      parent.add(m);
      this._planes.push(m);
      return m;
    };
    this.facePlane = plane((FACE_W / 4) * VS, (FACE_H / 4) * VS, this.faceMat, this.head, 0, (FACE_H / 8) * VS, 6 * VS + 0.0016);
    this.mouthPlane = plane((MOUTH_W / 4) * VS, (MOUTH_H / 4) * VS, this.mouthMat, this.head, 0, (MOUTH_H / 8) * VS, 10 * VS + 0.0016);

    // hat
    this.hatSeat = grp(this.head, ...HAT_SEAT);
    this.hat = grp(this.hatSeat);
    this.hatMesh = mesh(G.hat, M, this.hat);

    // monocle (+ lens) and chain
    this.monocle = grp(this.head, ...EYE_POS);
    this.monocleMesh = mesh(G.monocle, MG, this.monocle);
    this.lensMat = new THREE.MeshBasicMaterial({ map: this.face.lens.tex, transparent: true, alphaTest: 0.5 });
    this.lens = plane(0.2, 0.2, this.lensMat, this.monocle, 0, 0, 0.004);
    this._monoRest = new THREE.Vector3(...EYE_POS).multiplyScalar(VS);
    this.links = [];
    this._linkMat = new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x3a2800 });
    this.chainGroup = grp(this.chest);
    for (let i = 0; i < 11; i++) {
      const l = new THREE.Mesh(G.link, this._linkMat);
      l.castShadow = false;
      this.chainGroup.add(l);
      this.links.push(l);
    }
    this._chainAnchor = new THREE.Vector3(-3.4 * VS, 4.4 * VS, 4.7 * VS); // chest space
    this._mono = { mode: 'on', w: 1, p: new THREE.Vector3(), pp: new THREE.Vector3(), t: 0, spin: 0 };

    // arms
    const arm = (side) => {
      const sh = grp(this.chest, side * SHOULDER_X, SHOULDER_Y, 0);
      const upper = mesh(G.upperArm, MA, sh);
      const el = grp(sh, 0, -L_UPPER, 0);
      const fore = mesh(G.forearm, MA, el);
      const wr = grp(el, 0, -L_FORE, 0);
      const k = side > 0 ? 'pawL_' : 'pawR_';
      const paws = {};
      for (const kind of ['relax', 'fist', 'open', 'point']) {
        paws[kind] = mesh(G[k + kind], MA, wr);
        paws[kind].visible = kind === 'relax';
      }
      const grip = grp(wr, 0, -L_PAW, 0.5);
      return { sh, upper, el, fore, wr, paws, grip, paw: 'relax', side, shRest: sh.position.clone() };
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    // legs
    const leg = (side) => {
      const th = grp(this.hips, side * 2, 0, 0);
      mesh(G.thigh, M, th);
      const kn = grp(th, 0, -3, 0);
      mesh(G.shin, M, kn);
      return { th, kn };
    };
    this.legL = leg(1);
    this.legR = leg(-1);
    // tail
    this.tail = [];
    let tp = grp(this.hips, 0, 0.2, -2.6);
    this.tail.push(tp); this.tailMeshes = [mesh(G.tail0, M, tp)];
    tp = grp(tp, 0, 0, -5); this.tail.push(tp); this.tailMeshes.push(mesh(G.tail1, M, tp));
    tp = grp(tp, 0, 0, -6); this.tail.push(tp); this.tailMeshes.push(mesh(G.tail2, M, tp));

    // props
    const prop = (geo, parent, x, y, z) => { const m = mesh(geo, foxMaterial(0, 0, 0, 0, 0x100800), parent); m.position.set(x, y, z); m.visible = false; return m; };
    this.props = {
      can: prop(G.can, this.armR.grip, 0, -0.07, 0.01),
      coin: prop(G.coin, this.armR.grip, 0, 0.0, 0.02),
      stack: prop(G.stack, this.armL.grip, 0, 0.0, 0.0),
      sack: prop(G.sack, this.armL.grip, 0, -0.14, 0),
    };
    this.flyCoin = prop(G.coin, this.chest, 0, 0, 0);
    this._held = null;

    // sprites (snot bubble, pop, zzz)
    const spr = (rows, scale) => {
      const tex = makeSpriteTexture(rows);
      const mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(scale);
      s.visible = false;
      return s;
    };
    this.bubble = spr(BUBBLE_ROWS, 0.2); this.head.add(this.bubble);
    this.pop = spr(POP_ROWS, 0.24); this.head.add(this.pop);
    this.zzz = [0, 1, 2].map(() => { const s = spr(ZZZ_ROWS, 0.11); this.root.add(s); return s; });
    this._sprites = [this.bubble, this.pop, ...this.zzz];

    // animation state
    this.anims = Object.keys(ANIMS);
    this.expressions = EXPRESSION_NAMES.slice();
    this.onEvent = null; // (name, rig) => void : 'release', 'land', 'hatLand', 'step', 'coin', 'type', 'gulp', 'snore', 'pop', ...
    this.time = 0;
    this._pose = new Pose();
    this._freq = mkFaceReq();
    this._fs = {};
    this._fFrom = new Frame(); this._fCur = new Frame(); this._fOut = new Frame();
    this._fadeT = 1; this._fadeDur = 0;
    this._cur = null;
    this._userExpr = null; this._userHold = 0; this._userHoldT = 0;
    this._talk = null; this._viseme = 'M';
    this._lookTarget = null;
    this._look = { yaw: 0, pitch: 0, px: 0, py: 0 };
    this._blinkT = 1.5; this._blinkPh = -1;
    this._glintT = 0; this._glintNext = 1; this._lastExpr = '';
    this._hatFly = null; this._hatHand = { w: 0, goal: 0 };
    this._hatSq = new Spring(260, 12);
    this._headSq = new Spring(240, 11);
    this._nod = new Spring(200, 16);
    // secondary dynamics
    this._probeHead = new MotionProbe();
    this._probeHips = new MotionProbe();
    this._probeChest = new MotionProbe();
    this._sec = {
      tail: [0, 1, 2].map((i) => ({ x: new Spring([95, 70, 55][i], [9, 7.5, 6.5][i]), y: new Spring([80, 60, 48][i], [8, 7, 6][i]) })),
      tailAcc: { x: 0, y: 0 },
      ears: [0, 1].map(() => ({ x: new Spring(170, 9), z: new Spring(170, 9) })),
      headAcc: { x: 0, z: 0 },
      hat: { x: new Spring(230, 13), z: new Spring(230, 13), y: new Spring(300, 16) },
      belly: new Spring(280, 9),
      init: false,
    };
    this._prevSnot = 0; this._popT = 0;
    this._zzzT = 0;
    this.play('idle', { fade: 0 });
    this.update(0);
  }

  // ---------------------------------------------------------------- public API
  play(name, { loop, fade = 0.2, speed = 1, onDone, restart = false } = {}) {
    const def = ANIMS[name];
    if (!def) { console.warn('FoxRig: unknown animation', name); return this; }
    const cur = this._cur;
    if (cur && cur.name === name && cur.loop && !restart && (loop ?? def.loop)) {
      cur.speed = speed;
      if (onDone) cur.onDone = onDone;
      return this;
    }
    if (cur && cur.def.exit) cur.def.exit(cur.state, this, name);
    this._fFrom.copy(this._fOut);
    this._fadeT = 0;
    this._fadeDur = Math.max(0, fade);
    this._cur = { name, def, t: 0, loop: loop ?? !!def.loop, speed, onDone, state: {}, done: false };
    if (def.enter) def.enter(this._cur.state, this);
    return this;
  }

  get current() { return this._cur ? this._cur.name : null; }

  setExpression(name, { hold = 0 } = {}) {
    if (name && !EXPRESSION_NAMES.includes(name)) { console.warn('FoxRig: unknown expression', name); return this; }
    this._userExpr = name || null;
    this._userHold = hold;
    this._userHoldT = hold;
    if (name) this._headSq.v -= 0.9;
    return this;
  }

  talk(text, { cps = 16 } = {}) {
    const seq = [];
    let t = 0;
    const d = 1 / Math.max(1, cps);
    const push = (v, dur) => {
      const last = seq[seq.length - 1];
      if (last && last.v === v) last.d += dur;
      else seq.push({ v, t0: t, d: dur });
      t += dur;
    };
    for (const ch of String(text).toLowerCase()) {
      if (ch === 'a') push('A', d);
      else if (ch === 'e' || ch === 'i' || ch === 'y') push('E', d);
      else if (ch === 'o' || ch === 'u') push('O', d);
      else if (/[a-z0-9]/.test(ch)) push('M', d);
      else if (ch === ' ') push('M', d);
      else if (',;:'.includes(ch)) push('M', 0.16);
      else if ('.!?'.includes(ch)) push('M', 0.3);
      else if (ch === '-' || ch === '…') push('M', 0.22);
      else push('M', d * 0.5);
    }
    // re-time: t0 of each segment
    let acc = 0;
    for (const s of seq) { s.t0 = acc; acc += s.d; }
    this._talk = { seq, i: 0, t: 0, dur: acc, excl: /!/.test(text), ques: /\?/.test(text) };
    return acc;
  }

  stopTalking() { this._talk = null; return this; }

  get talking() { return !!this._talk && this._talk.t < this._talk.dur; }

  lookAt(target) { this._lookTarget = target || null; return this; }

  hold(obj) {
    if (this._held && this._held.parent === this.armR.grip) this.armR.grip.remove(this._held);
    this._held = obj || null;
    if (obj) this.armR.grip.add(obj);
    return this;
  }

  headTop(out = new THREE.Vector3()) {
    this.hatSeat.updateWorldMatrix(true, false);
    out.set(0, (HAT_TOP + 1.5) * VS, 0);
    return this.hatSeat.localToWorld(out);
  }

  // Extras used by the animations (public so a game can trigger the gags too)
  popHat(height = 1.35, spins = 2) {
    const g = 16;
    const v0 = Math.sqrt(2 * g * height);
    this._hatFly = { t: 0, T: (2 * v0) / g, v0, g, spins, drift: (Math.random() - 0.5) * 0.25 };
    this._hatHand.goal = 0; this._hatHand.w = 0;
    return this;
  }
  dropMonocle() {
    const m = this._mono;
    if (m.mode === 'drop') return this;
    this._monoWorld(m.p);
    m.pp.copy(m.p).add(_v1.set(0, 0.012, -0.01));
    m.mode = 'drop'; m.t = 0;
    return this;
  }
  restoreMonocle() {
    const m = this._mono;
    if (m.mode === 'on') return this;
    m.mode = 'return'; m.t = 0;
    return this;
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    this.face.dispose();
    this.faceMat.dispose(); this.mouthMat.dispose(); this.lensMat.dispose(); this._linkMat.dispose();
    for (const p of this._planes) p.geometry.dispose();
    for (const s of this._sprites) { s.material.map.dispose(); s.material.dispose(); }
    geoRefs--;
    if (geoRefs <= 0 && GEO) {
      for (const k in GEO) GEO[k].dispose();
      GEO = null; geoRefs = 0;
    }
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    const cur = this._cur;
    cur.t += dt * cur.speed;
    const def = cur.def;
    let t = cur.t;
    if (def.dur) {
      if (cur.loop) t = cur.t;
      else if (t > def.dur) t = def.dur;
    }
    // user expression hold
    if (this._userExpr && this._userHold > 0) {
      this._userHoldT -= dt;
      if (this._userHoldT <= 0) this._userExpr = null;
    }
    // talk timeline
    this._stepTalk(dt);
    // 1) animation pose
    const p = this._pose, f = this._freq;
    p.reset(); resetFaceReq(f);
    def.fn(t, p, f, cur.state, this, dt);
    this._talkAccents(p, dt);
    // 2) frame + crossfade
    poseToFrame(p, this._fCur);
    if (this._fadeT < this._fadeDur) {
      this._fadeT += dt;
      this._fOut.blend(this._fFrom, this._fCur, smooth(this._fadeT / this._fadeDur));
    } else this._fOut.copy(this._fCur);
    this._apply(this._fOut, p);
    // 3) look-at (head + pupils)
    this._applyLook(dt);
    // 4) secondary motion
    this._secondary(dt);
    // 5) gags & props
    this._updateHat(dt);
    this._updateMonocle(dt);
    this._updateProps(p);
    this._updateFace(dt);
    this._updateSprites(dt);
    // 6) finished one-shots
    if (!cur.loop && def.dur && cur.t >= def.dur && !cur.done && this._cur === cur) {
      cur.done = true;
      if (cur.onDone) cur.onDone(this);
      if (this._cur === cur && def.next !== null) this.play(def.next || 'idle', { fade: def.nextFade ?? 0.3 });
    }
  }

  _emit(name) { if (this.onEvent) this.onEvent(name, this); }

  _apply(F, p) {
    const s = F.s;
    this.mover.position.copy(F.moverP);
    this.mover.quaternion.copy(F.q[JI.mover]);
    const sq = s[0], isq = 1 / Math.sqrt(Math.max(0.2, sq));
    this.mover.scale.set(isq, sq, isq);
    this.hips.position.copy(F.hipsP);
    this.hips.quaternion.copy(F.q[JI.hips]);
    this.chest.quaternion.copy(F.q[JI.chest]);
    const br = s[2];
    this._breath = br;
    this.head.quaternion.copy(F.q[JI.head]);
    this._baseHSq = s[1];
    for (const [A, sh, el, wr, si, yi, zi] of [[this.armL, 'shL', 'elL', 'wrL', 4, 7, 9], [this.armR, 'shR', 'elR', 'wrR', 5, 8, 10]]) {
      A.sh.quaternion.copy(F.q[JI[sh]]);
      A.sh.position.set(A.shRest.x, A.shRest.y + s[yi] * VS, A.shRest.z + s[zi] * VS);
      A.el.quaternion.copy(F.q[JI[el]]);
      const st = s[si];
      A.upper.scale.set(1, st, 1);
      A.el.position.y = -L_UPPER * st * VS;
      A.fore.scale.set(1, st, 1);
      A.wr.position.y = -L_FORE * st * VS;
      A.wr.quaternion.copy(F.q[JI[wr]]);
    }
    this.legL.th.quaternion.copy(F.q[JI.thL]); this.legL.kn.quaternion.copy(F.q[JI.knL]);
    this.legR.th.quaternion.copy(F.q[JI.thR]); this.legR.kn.quaternion.copy(F.q[JI.knR]);
    for (let i = 0; i < 3; i++) this.tail[i].quaternion.copy(F.q[JI['t' + i]]);
    const puff = s[3];
    for (let i = 0; i < 3; i++) this.tailMeshes[i].scale.set(puff, puff, 1 + (puff - 1) * 0.3);
    this.tail[0].rotation.z += s[11];
    this.earL.quaternion.copy(F.q[JI.earL]);
    this.earR.quaternion.copy(F.q[JI.earR]);
    this.hat.position.copy(F.hatP);
    this.hat.quaternion.copy(F.q[JI.hat]);
    this._lookW = s[6];
    // paws (discrete: follow the dominant animation)
    const fading = this._fadeT < this._fadeDur && this._fadeT / this._fadeDur < 0.5;
    if (!fading) {
      this._setPaw(this.armL, p.pawL);
      this._setPaw(this.armR, p.pawR);
    }
  }

  _setPaw(A, kind) {
    if (A.paw === kind || !A.paws[kind]) return;
    A.paws[A.paw].visible = false;
    A.paws[kind].visible = true;
    A.paw = kind;
  }

  _applyLook(dt) {
    const L = this._look;
    let yaw = 0, pitch = 0;
    const tgt = this._lookTarget;
    const w = this._lookW;
    if (tgt) {
      this.neck.updateWorldMatrix(true, false);
      _v1.set(0, 7 * VS, 6 * VS).applyMatrix4(this.neck.matrixWorld); // between the eyes
      _v2.subVectors(tgt, _v1);
      this.neck.getWorldQuaternion(_q1).invert();
      _v2.applyQuaternion(_q1);
      const ty = Math.atan2(_v2.x, _v2.z), tp = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      const behind = Math.abs(ty) > 2.1;
      yaw = behind ? 0 : clamp(ty * 0.55, -0.6, 0.6) * w;
      pitch = behind ? 0 : clamp(-tp * 0.45, -0.32, 0.3) * w;
    }
    const k = 1 - Math.exp(-dt * 9);
    L.yaw += (yaw - L.yaw) * k;
    L.pitch += (pitch - L.pitch) * k;
    if (Math.abs(L.yaw) + Math.abs(L.pitch) > 1e-4) {
      _q1.setFromEuler(_e.set(L.pitch, L.yaw, 0, 'YXZ'));
      this.head.quaternion.premultiply(_q1);
    }
    // pupils: target direction in the (final) head frame
    if (tgt) {
      this.head.updateWorldMatrix(true, false);
      _v1.set(0, 7 * VS, 6 * VS).applyMatrix4(this.head.matrixWorld);
      _v2.subVectors(tgt, _v1);
      this.head.getWorldQuaternion(_q1).invert();
      _v2.applyQuaternion(_q1);
      const hy = Math.atan2(_v2.x, Math.max(0.05, _v2.z)), hp = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      L.px = clamp(hy / 0.55, -1, 1);
      L.py = clamp(-hp / 0.45, -1, 1);
      L.has = true;
    } else L.has = false;
  }

  _secondary(dt) {
    const S = this._sec;
    this.root.updateMatrixWorld(true);
    this._probeHead.sample(this.head, dt);
    this._probeHips.sample(this.hips, dt);
    this._probeChest.sample(this.chest, dt);
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    const aH = this._probeHips.a, dH = this._probeHips.dq;
    const aHd = this._probeHead.a, dHd = this._probeHead.dq;
    const tail = S.tail;
    const ears = S.ears;
    const hat = S.hat;
    // tail anim-local angles are already in the quaternions; springs hold offsets
    for (let k = 0; k < n; k++) {
      // tail chain: parent rotation deltas feed through as lag
      let pvx = -dH.x / n / h, pvy = -dH.y / n / h; // parent angular velocity (opposes)
      for (let i = 0; i < 3; i++) {
        const sp = tail[i];
        const fx = -aH.y * 0.05 * (1 + i * 0.4) + pvx * sp.x.c * 0.9;
        const fy = aH.x * 0.05 * (1 + i * 0.4) + pvy * sp.y.c * 0.9;
        const ox = sp.x.x, oy = sp.y.x;
        sp.x.step(0, fx, h);
        sp.y.step(0, fy, h);
        pvx = -(sp.x.x - ox) / h * 0.6;
        pvy = -(sp.y.x - oy) / h * 0.6;
      }
      for (let e = 0; e < 2; e++) {
        const sp = ears[e];
        const s = e === 0 ? 1 : -1;
        sp.x.step(0, -aHd.z * 0.04 - dHd.x / n / h * sp.x.c * 0.8, h);
        sp.z.step(0, (-aHd.y * 0.035 * s) + aHd.x * 0.03 - dHd.z / n / h * sp.z.c * 0.8, h);
      }
      hat.x.step(0, -aHd.z * 0.02 - dHd.x / n / h * hat.x.c * 0.5, h);
      hat.z.step(0, aHd.x * 0.02 - dHd.z / n / h * hat.z.c * 0.5, h);
      hat.y.step(0, aHd.y * 0.012, h);
      if (hat.y.x < -0.012) { hat.y.x = -0.012; if (hat.y.v < 0) hat.y.v = 0; }
      S.belly.step(0, -aH.y * 0.004, h);
    }
    for (let i = 0; i < 3; i++) {
      const sp = tail[i];
      sp.x.x = clamp(sp.x.x, -0.9, 0.9); sp.y.x = clamp(sp.y.x, -1.1, 1.1);
      _q1.setFromEuler(_e.set(sp.x.x, sp.y.x, 0, 'YXZ'));
      this.tail[i].quaternion.multiply(_q1);
    }
    for (let e = 0; e < 2; e++) {
      const sp = ears[e];
      sp.x.x = clamp(sp.x.x, -0.8, 0.8); sp.z.x = clamp(sp.z.x, -0.8, 0.8);
      _q1.setFromEuler(_e.set(sp.x.x, 0, sp.z.x, 'XYZ'));
      (e === 0 ? this.earL : this.earR).quaternion.multiply(_q1);
    }
    hat.x.x = clamp(hat.x.x, -0.5, 0.5); hat.z.x = clamp(hat.z.x, -0.5, 0.5);
    _q1.setFromEuler(_e.set(hat.x.x, 0, hat.z.x, 'XYZ'));
    this.hat.quaternion.multiply(_q1);
    this.hat.position.y += clamp(hat.y.x, -0.012, 0.25);
    // belly / breathing
    const b = clamp(S.belly.x, -0.18, 0.18), br = this._breath || 0;
    this.torso.scale.set(1 - b * 0.5 + br * 0.012, 1 + b + br * 0.018, 1 - b * 0.5 + br * 0.03);
    // head squash (anim * springs)
    const hs = this._baseHSq * (1 + this._headSq.step(0, 0, dt) * 1);
    const hi = 1 / Math.sqrt(Math.max(0.3, hs));
    this.head.scale.set(hi, hs, hi);
  }

  _talkAccents(p, dt) {
    const T = this._talk;
    const nod = this._nod.step(0, 0, dt);
    p.hRx += nod;
    if (!T || T.t >= T.dur) return;
    p.hRz += sin(T.t * 2.3) * 0.05 * (T.ques ? 2.2 : 1);
    this._freq.browLift += T.excl ? 1 : 0;
  }

  _stepTalk(dt) {
    const T = this._talk;
    if (!T) { this._viseme = null; return; }
    T.t += dt;
    if (T.t >= T.dur) { this._talk = null; this._viseme = null; return; }
    while (T.i < T.seq.length - 1 && T.t >= T.seq[T.i].t0 + T.seq[T.i].d) {
      T.i++;
      const v = T.seq[T.i].v;
      if (v !== 'M') this._nod.v += v === 'A' ? 1.1 : 0.7;
    }
    this._viseme = T.seq[T.i].v;
  }

  // ---------------------------------------------------------------- face
  _updateFace(dt) {
    const f = this._freq, st = this._fs, def = this._cur.def;
    const user = this._userExpr;
    const name = user || f.expr || def.expr || 'neutral';
    expressionState(name, st);
    if (!user) {
      if (f.eyeL) st.eyeL = f.eyeL;
      if (f.eyeR) st.eyeR = f.eyeR;
      if (f.browL) st.browL = f.browL;
      if (f.browR) st.browR = f.browR;
      if (f.mouth) st.mouth = f.mouth;
      if (f.look) { st.lookX = f.look[0]; st.lookY = f.look[1]; }
      for (const k of ['blush', 'sweat', 'vein', 'tear', 'drool']) if (f[k] != null) st[k] = f[k];
    }
    if (this._viseme) st.mouth = this._viseme;
    else if (!user && def.gibber && !f.mouth) st.mouth = ['A', 'M', 'E', 'M', 'O', 'M', 'A', 'E', 'M'][Math.floor(this.time * 9) % 9];
    if (this._look.has) { st.lookX = this._look.px; st.lookY = this._look.py; }
    st.browLift = f.browLift;
    st.mono = this._mono.mode === 'on';
    // blinking
    let blink = 0;
    this._blinkT -= dt;
    if (this._blinkT <= 0 && this._blinkPh < 0) this._blinkPh = 0;
    if (this._blinkPh >= 0) {
      this._blinkPh += dt;
      const b = this._blinkPh;
      blink = b < 0.04 ? 1 : b < 0.11 ? 2 : b < 0.15 ? 1 : 0;
      if (b >= 0.15) { this._blinkPh = -1; this._blinkT = Math.random() < 0.18 ? 0.2 : 1.8 + Math.random() * 3; }
    }
    st.blink = f.blink ? blink : 0;
    // monocle glint
    if (name !== this._lastExpr) { this._lastExpr = name; if (st.glint) this._glintNext = 0.1; }
    this._glintNext -= dt;
    if (this._glintT > 0) { this._glintT += dt / 0.45; if (this._glintT > 1) this._glintT = 0; }
    else if (this._glintNext <= 0) { this._glintNext = st.glint ? 2 + Math.random() * 2.5 : 5 + Math.random() * 6; if (st.mono) this._glintT = 0.001; }
    st.glintT = this._glintT;
    this.face.update(st, this.time);
  }

  // ---------------------------------------------------------------- hat
  _updateHat(dt) {
    const F = this._hatFly;
    const H = this._hatHand;
    H.w += clamp(H.goal - H.w, -dt / 0.14, dt / 0.14);
    if (F) {
      F.t += dt;
      const u = F.t / F.T;
      if (u >= 1) {
        this._hatFly = null;
        this._hatSq.v -= 4.5;
        this._headSq.v -= 2.2;
        this._sec.ears[0].z.v -= 6; this._sec.ears[1].z.v += 6;
        this._emit('hatLand');
      } else {
        const up = F.v0 * F.t - 0.5 * F.g * F.t * F.t;
        const side = F.drift * sin(u * PI);
        // world-space offset from the seat, converted into seat space
        this.hatSeat.updateWorldMatrix(true, false);
        this.root.getWorldQuaternion(_wq);
        _v1.set(side, up, sin(u * PI) * 0.12).applyQuaternion(_wq);
        this.hatSeat.getWorldPosition(_v2).add(_v1);
        this.hatSeat.worldToLocal(_v2);
        this.hat.position.copy(_v2);
        // spin in root space, settle upright for the landing
        const spin = EASE.out(clamp01(u / 0.85)) * F.spins * TAU;
        _q1.setFromEuler(_e.set(-spin, 0, sin(u * TAU * 1.5) * 0.35 * (1 - u), 'XYZ'));
        this.hatSeat.getWorldQuaternion(_q2).invert();
        _q2.multiply(_wq).multiply(_q1);
        this.hat.quaternion.copy(_q2);
      }
    } else if (H.w > 0.001) {
      // blend between the head seat and the right paw
      this.hat.updateWorldMatrix(true, false);
      _mA.copy(this.hat.matrixWorld);
      this.armR.grip.updateWorldMatrix(true, false);
      _mB.copy(this.armR.grip.matrixWorld).multiply(_m.makeRotationFromEuler(_e.set(0.2, 0, -1.25)).setPosition(-0.2, -0.01, 0.02));
      _mA.decompose(_pA, _qA, _sA);
      _mB.decompose(_pB, _qB, _sB);
      const w = smooth(H.w);
      _pA.lerp(_pB, w); _qA.slerp(_qB, w);
      _mA.compose(_pA, _qA, _sA);
      this.hatSeat.updateWorldMatrix(true, false);
      _mB.copy(this.hatSeat.matrixWorld).invert().multiply(_mA);
      _mB.decompose(this.hat.position, this.hat.quaternion, _sB);
    }
    const hs = 1 + this._hatSq.step(0, 0, dt);
    this.hat.scale.set(1 / Math.sqrt(Math.max(0.3, hs)), hs, 1 / Math.sqrt(Math.max(0.3, hs)));
  }

  // ---------------------------------------------------------------- monocle + chain
  _monoWorld(out) {
    // monocle rest position in chest space
    this.head.updateWorldMatrix(true, false);
    out.copy(this._monoRest).applyMatrix4(this.head.matrixWorld);
    return this.chest.worldToLocal(out);
  }

  _updateMonocle(dt) {
    const m = this._mono;
    m.t += dt;
    const mono = this.monocle;
    if (m.mode === 'hand') {
      const u = EASE.io(clamp01(m.t / 0.22));
      mono.position.lerpVectors(m.hp, _v1.set(0.02, -0.01, 0.07), u);
      mono.quaternion.slerpQuaternions(m.hq, _q1.setFromEuler(_e.set(-1.3, 0, 0.3, 'XYZ')), u);
    }
    if (m.mode === 'drop' || m.mode === 'return') {
      if (mono.parent !== this.chest) this.chest.attach(mono);
      // pendulum in chest space
      const a = this._chainAnchor;
      const L = 0.3;
      this.chest.getWorldQuaternion(_q1).invert();
      const g = _v1.set(0, -9.8, 0).applyQuaternion(_q1);
      const ac = _v2.copy(this._probeChest.a).multiplyScalar(-1);
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / n;
      for (let k = 0; k < n && m.mode === 'drop'; k++) {
        const vx = (m.p.x - m.pp.x) * 0.992, vy = (m.p.y - m.pp.y) * 0.992, vz = (m.p.z - m.pp.z) * 0.992;
        m.pp.copy(m.p);
        m.p.x += vx + (g.x + ac.x) * h * h;
        m.p.y += vy + (g.y + ac.y) * h * h;
        m.p.z += vz + (g.z + ac.z) * h * h;
        _v3.subVectors(m.p, a);
        if (_v3.length() > L) m.p.copy(a).addScaledVector(_v3.normalize(), L);
        // keep in front of the belly
        const zMin = 5.8 * VS;
        if (m.p.y < 4 * VS && m.p.z < zMin) m.p.z = zMin;
      }
      if (m.mode === 'drop') {
        mono.position.copy(m.p);
        const sw = Math.atan2(m.p.x - a.x, a.y - m.p.y);
        m.spin += dt * 3;
        mono.quaternion.setFromEuler(_e.set(0.2, sin(m.spin) * 0.8, sw * 0.7, 'XYZ'));
      } else {
        // fly back to the eye
        const u = clamp01(m.t / 0.25);
        this._monoWorld(_v3);
        mono.position.lerpVectors(m.p, _v3, EASE.out(u));
        this.head.getWorldQuaternion(_q2);
        this.chest.getWorldQuaternion(_q1).invert();
        _q1.multiply(_q2);
        mono.quaternion.slerp(_q1, u);
        if (u >= 1) {
          this.head.attach(mono);
          mono.position.copy(this._monoRest);
          mono.quaternion.identity();
          m.mode = 'on';
          this._emit('monocle');
        }
      }
    }
    // chain: from the ring's loop to the waistcoat anchor (chest space)
    mono.updateWorldMatrix(true, false);
    _v1.set(-6.6 * FV, -4.6 * FV, 0).applyMatrix4(mono.matrixWorld);
    this.chest.worldToLocal(_v1);
    const A = this._chainAnchor;
    const on = m.mode === 'on';
    const mid = _v2.addVectors(_v1, A).multiplyScalar(0.5);
    if (on) mid.add(_v3.set(-0.3 * VS, -1.6 * VS, 3.2 * VS));
    else mid.add(_v3.set(0, -0.5 * VS, 0.8 * VS));
    const N = this.links.length;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const l = this.links[i];
      const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      l.position.set(a * _v1.x + b * mid.x + c * A.x, a * _v1.y + b * mid.y + c * A.y, a * _v1.z + b * mid.z + c * A.z);
      l.rotation.set(u * 3 + i, i * 0.7, 0);
    }
  }

  _monoHand(on) {
    const m = this._mono, mono = this.monocle;
    if (on) {
      this.armR.grip.attach(mono);
      m.hp = mono.position.clone(); m.hq = mono.quaternion.clone();
      m.mode = 'hand'; m.t = 0;
    } else {
      this.chest.attach(mono);
      m.p.copy(mono.position);
      m.mode = 'return'; m.t = 0;
    }
  }

  // ---------------------------------------------------------------- props & sprites
  _updateProps(p) {
    const fading = this._fadeT < this._fadeDur && this._fadeT / this._fadeDur < 0.5;
    if (fading) return;
    const P = this.props;
    P.can.visible = p.propR === 'can';
    P.coin.visible = p.propR === 'coin';
    P.stack.visible = p.propL === 'stack';
    P.sack.visible = p.propL === 'sack';
    if (this._held) this._held.visible = !p.propR;
    if (p.flyCoin) {
      this.flyCoin.visible = true;
      this.flyCoin.position.set(p.flyCoin[0] * VS, p.flyCoin[1] * VS, p.flyCoin[2] * VS);
      this.flyCoin.rotation.set(p.flyCoin[3], 0, 0.3);
    } else this.flyCoin.visible = false;
  }

  _updateSprites(dt) {
    const f = this._freq;
    const s = f.snot;
    const b = this.bubble;
    if (s > 0.05) {
      b.visible = true;
      const r = 0.25 + s * 0.75;
      b.scale.setScalar(0.2 * r);
      b.position.set((NOSE_POS[0] - 1.5 * r) * VS, (NOSE_POS[1] - 1.8 * r) * VS, (NOSE_POS[2] + 1.8 * r) * VS);
    } else b.visible = false;
    if (this._prevSnot > 0.45 && s < 0.05) { this._popT = 0.14; this._emit('pop'); }
    this._prevSnot = s;
    this._popT -= dt;
    this.pop.visible = this._popT > 0;
    if (this.pop.visible) this.pop.position.set((NOSE_POS[0] - 1.5) * VS, (NOSE_POS[1] - 1.5) * VS, (NOSE_POS[2] + 2) * VS);
    // Zzz
    if (f.zzz > 0) this._zzzT += dt;
    this.head.updateWorldMatrix(true, false);
    for (let i = 0; i < 3; i++) {
      const z = this.zzz[i];
      if (!(f.zzz > 0)) { z.visible = false; continue; }
      const u = ((this._zzzT * 0.45 + i / 3) % 1);
      z.visible = true;
      _v1.set((7 + u * 5 + sin(u * 9 + i) * 1.2) * VS, (12 + u * 12) * VS, 2 * VS).applyMatrix4(this.head.matrixWorld);
      this.root.worldToLocal(_v1);
      z.position.copy(_v1);
      z.scale.setScalar(0.06 + u * 0.08);
    }
  }
}

// ================================================================== animations
// fn(t, pose, faceReq, state, rig, dt). Poses are in voxels / radians.
// Arms: ik(arm, xOut, y, z) targets the paw centre in chest space (x = outward).
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const SEAT_HIP = FOX_SEAT_HEIGHT / VS; // hip joint height when seated (voxels)
const DESK_Y = FOX_DESK_HEIGHT / VS; // desk top (voxels, root space)

function life(t, p, amt = 1) {
  const br = sin(t * 2.3);
  p.breath = br * amt;
  p.chRx += br * 0.014 * amt;
  p.hRx += -br * 0.016 * amt;
  p.aL.sw += sin(t * 2.3 + 0.6) * 0.035 * amt;
  p.aR.sw += sin(t * 2.3 + 0.2) * 0.035 * amt;
  p.tSide += sin(t * 1.7) * 0.3 * amt;
  p.tCurlSide += sin(t * 1.7 - 1.1) * 0.25 * amt;
  p.tLift += sin(t * 1.1) * 0.07 * amt;
}

function steps(s, ph, rig) {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit('step');
  s.step = k;
}

// random little idle gags
const FIDGETS = {
  glance: {
    dur: 1.7, w: 3,
    fn(u, p, f) {
      const lx = K(u, [[0, 0], [0.1, -1, 'out'], [0.62, -1], [0.72, 1, 'out'], [1.3, 1], [1.45, 0]]);
      f.look = [lx, 0.05];
      f.expr = 'scheming';
      p.hRy += lx * 0.2 * win(u, 0, 1.4, 0.15, 0.25);
      p.eL.tw += lx * 0.35; p.eR.tw -= lx * 0.35;
    },
  },
  monocle: {
    dur: 1.7, w: 2,
    fn(u, p, f) {
      const w = win(u, 0.0, 1.15, 0.32, 0.4);
      p.ik(p.aR, 3.2, 12.4 + sin(u * 34) * 0.35 * win(u, 0.35, 0.9, 0.05, 0.05), 7.6, 1, -0.3, -0.1, w);
      p.aR.st = 1.6;
      p.hRx += 0.14 * w; p.hRz += 0.12 * w;
      p.pawR = w > 0.6 ? 'fist' : 'relax';
      f.expr = 'smug';
      f.eyeR = w > 0.6 && u < 0.95 ? 'squint' : null;
    },
  },
  chuckle: {
    dur: 1.3, w: 2,
    fn(u, p, f) {
      const w = win(u, 0, 0.95, 0.08, 0.3);
      const b = abs(sin(u * 17)) * w;
      p.aL.shY += b * 0.7; p.aR.shY += b * 0.7;
      p.y += b * 0.35;
      p.chRx += 0.1 * w; p.hRx += 0.1 * w;
      p.aR.sw -= 0.3 * w; p.aR.el += 0.8 * w;
      f.eyeL = f.eyeR = w > 0.3 ? 'happy' : null;
      f.mouth = w > 0.3 ? 'grin_fang' : null;
    },
  },
  ear: { dur: 0.55, w: 2, fn(u, p) { p.eL.fl += pulse(u, 0, 0.16) * 0.7; p.eL.sp += pulse(u, 0.16, 0.2) * 0.45; p.eR.tw += pulse(u, 0.1, 0.3) * 0.4; } },
  tail: { dur: 0.9, w: 2, fn(u, p) { const w = pulse(u, 0, 0.9); p.tSide += w * sin(u * 16) * 0.9; p.tLift += w * 0.45; p.tPuff += w * 0.12; } },
  sniff: {
    dur: 1.2, w: 1,
    fn(u, p, f) {
      const w = win(u, 0, 0.9, 0.12, 0.25);
      p.hRx -= 0.2 * w; p.hRy += sin(u * 5) * 0.12 * w;
      p.hSq *= 1 + sin(u * 40) * 0.02 * w;
      f.eyeL = f.eyeR = w > 0.4 ? 'content' : null;
      f.mouth = w > 0.4 ? 'cat' : null;
      p.eL.fl -= 0.2 * w; p.eR.fl -= 0.2 * w;
    },
  },
};
const FID_KEYS = Object.keys(FIDGETS);
function fidgets(t, p, f, s, rig, allow = FID_KEYS) {
  if (s.next === undefined) s.next = t + 1.2 + Math.random() * 2;
  if (!s.fid && t >= s.next) {
    let tot = 0;
    for (const k of allow) tot += FIDGETS[k].w;
    let r = Math.random() * tot;
    for (const k of allow) { r -= FIDGETS[k].w; if (r <= 0) { s.fid = k; break; } }
    if (s.fid === s.lastFid && Math.random() < 0.6) s.fid = allow[(allow.indexOf(s.fid) + 1) % allow.length];
    s.lastFid = s.fid;
    s.ft0 = t;
  }
  if (s.fid) {
    const F = FIDGETS[s.fid];
    const u = t - s.ft0;
    if (u >= F.dur) { s.fid = null; s.next = t + 1.6 + Math.random() * 3; }
    else F.fn(u, p, f, s, rig);
  }
}

// seated lower body (shared by all sit_* animations)
function sitBase(t, p, swing = 1) {
  p.hipY = SEAT_HIP - HIP_Y;
  p.hipZ = -0.8;
  p.lL.sw = p.lR.sw = -1.5;
  p.lL.kn = p.lR.kn = 1.35;
  p.lL.sp = p.lR.sp = 0.1;
  p.lL.kn += sin(t * 3.3) * 0.28 * swing;
  p.lR.kn += sin(t * 3.3 + 2.4) * 0.28 * swing;
  p.chRx = 0.04;
  p.tLift = -1.25; p.tSide = 1.25; p.tCurl = 0.55; p.tCurlSide = 0.5;
  p.tSide += sin(t * 1.4) * 0.12;
  p.tCurl += sin(t * 1.9) * 0.15;
}
// paws resting on the desk / lap
const deskY = (dy = 0) => DESK_Y - (SEAT_HIP + WAIST) + 0.9 + dy;
function lapHands(p, t) {
  p.ik(p.aL, 2.4, 0.4 + sin(t * 2.3) * 0.1, 5.4, 1, -0.2, -0.6);
  p.ik(p.aR, 2.4, 0.4 + sin(t * 2.3 + 0.4) * 0.1, 5.4, 1, -0.2, -0.6);
}

// talking gestures (upper body), used by talk & sit_talk
const GESTURES = [
  (u, p) => { // open palm out
    const w = win(u, 0, 0.9, 0.18, 0.3);
    p.ik(p.aR, 6.5, 5.2, 6.2, 1, -0.6, -0.3, w); p.pawR = w > 0.5 ? 'open' : 'relax'; p.aR.wx -= 0.8 * w;
  },
  (u, p) => { // both hands explaining
    const w = win(u, 0, 1.0, 0.2, 0.3), b = sin(u * 9) * 0.5 * w;
    p.ik(p.aL, 5.5, 3.5 + b, 6.5, 1, -0.5, -0.4, w); p.ik(p.aR, 5.5, 3.5 - b, 6.5, 1, -0.5, -0.4, w);
    p.pawL = p.pawR = w > 0.5 ? 'open' : 'relax';
  },
  (u, p, f) => { // a-ha! finger up
    const w = win(u, 0, 0.8, 0.12, 0.3);
    p.ik(p.aR, 4.6, 10.6 + sin(u * 20) * 0.3 * w, 5.2, 1, -0.8, 0, w); p.pawR = w > 0.4 ? 'point' : 'relax'; p.aR.wx -= 2.6 * w;
    f.browLift += 1.5 * w;
  },
  (u, p) => { // paw on chest ("moi?")
    const w = win(u, 0, 0.8, 0.18, 0.3);
    p.ik(p.aR, -0.3, 4.6, 5.6, 1, -0.7, 0.2, w); p.pawR = w > 0.5 ? 'open' : 'relax'; p.aR.wz += 1.2 * w;
    p.hRz -= 0.1 * w; p.chRx -= 0.05 * w;
  },
  (u, p) => { // karate chop emphasis
    const w = win(u, 0, 0.7, 0.1, 0.25), c = abs(sin(u * 11)) * w;
    p.ik(p.aL, 4.2, 4 + c * 1.5, 7, 1, -0.5, -0.5, w); p.pawL = w > 0.4 ? 'open' : 'relax';
    p.hRx += c * 0.06;
  },
];
function talkUpper(t, p, f, s) {
  if (s.gT === undefined || t >= s.gT + s.gD) {
    s.gT = t; s.gD = 1 + Math.random() * 0.8;
    let g = Math.floor(Math.random() * GESTURES.length);
    if (g === s.g) g = (g + 1) % GESTURES.length;
    s.g = g;
  }
  GESTURES[s.g](t - s.gT, p, f);
  p.hRy += sin(t * 1.3) * 0.12;
  p.chRy += sin(t * 1.3 + 0.5) * 0.06;
  p.eL.fl += sin(t * 5.1) * 0.08; p.eR.fl += sin(t * 4.3 + 1) * 0.08;
}

// ---------------------------------------------------------------- standing
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    life(t, p);
    p.hipX = sin(t * 0.8) * 0.3; p.hipRz = sin(t * 0.8) * 0.02; p.chRz = -sin(t * 0.8) * 0.035;
    p.hRz += sin(t * 0.8 + 0.5) * 0.045;
    // villain pose: left paw on the hip
    p.ik(p.aL, 6.6, 0.9, 1.4, 1, 0.1, -0.7);
    p.pawL = 'fist';
    fidgets(t, p, f, s, rig);
  },
});

def('idle_scheme', {
  loop: true, expr: 'evil_grin',
  fn(t, p, f, s) {
    life(t, p, 0.6);
    p.lean = 0.06; p.chRx += 0.2; p.hRx += 0.16;
    f.look = [sin(t * 0.9) * 0.5, -0.6];
    const r = sin(t * 14);
    p.ik(p.aL, 0.6, 3.8 + r * 0.8, 6.8, 1, -0.7, -0.3);
    p.ik(p.aR, 0.6, 3.8 - r * 0.8, 6.8, 1, -0.7, -0.3);
    p.aL.shY = p.aR.shY = 0.8;
    p.aL.wx = p.aR.wx = -0.5;
    const sn = max(0, sin(t * 1.6)) ** 8;
    p.y += abs(sin(t * 19)) * 0.45 * sn;
    p.aL.shY += abs(sin(t * 19)) * 0.5 * sn; p.aR.shY += abs(sin(t * 19)) * 0.5 * sn;
    if (sn > 0.35) { f.eyeL = f.eyeR = 'happy'; f.mouth = 'mwaha'; }
    p.tLift += 0.35; p.tCurl += 0.35; p.tCurlSide += sin(t * 0.8) * 0.5;
    p.eL.fl = p.eR.fl = 0.3;
    p.hipY = -0.4; p.lL.kn = p.lR.kn = 0.25; p.lL.sw = p.lR.sw = -0.12;
  },
});

def('walk', {
  loop: true, expr: 'smug',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.62) * TAU, sn = sin(ph), cs = cos(ph);
    const bob = abs(cs);
    p.lL.sw = -sn * 0.6; p.lR.sw = sn * 0.6;
    p.lL.kn = max(0, cs) * 1.0 + 0.05; p.lR.kn = max(0, -cs) * 1.0 + 0.05;
    p.hipY = -0.85 + bob * 1.0;
    p.sq = 1 + (bob - 0.55) * 0.07;
    p.roll = cs * 0.05; p.hipX = -cs * 0.3;
    p.aL.sw = sn * 0.6 - 0.12; p.aR.sw = -sn * 0.6 - 0.12;
    p.aL.el = 0.55 + max(0, -sn) * 0.5; p.aR.el = 0.55 + max(0, sn) * 0.5;
    p.chRy = sn * 0.1; p.hipRy = -sn * 0.08;
    p.hRy = -sn * 0.05; p.hRx = -0.1 + bob * 0.04; p.hRz = cs * 0.04;
    p.lean = 0.05;
    p.tSide = 0.15 + sn * 0.35; p.tLift = 0.3; p.tCurl = 0.4;
    steps(s, ph, rig);
  },
});

def('run', {
  loop: true, expr: 'determined',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.4) * TAU, sn = sin(ph), cs = cos(ph);
    const fl = 1 - abs(cs);
    p.lean = 0.34; p.hRx = -0.3; p.chRx = 0.04;
    p.lL.sw = -sn * 1.05 - 0.2; p.lR.sw = sn * 1.05 - 0.2;
    p.lL.kn = max(0, cs) * 1.7 + 0.25; p.lR.kn = max(0, -cs) * 1.7 + 0.25;
    p.y = fl * 2.2; p.sq = 1 + (fl - 0.45) * 0.14;
    p.aL.sw = sn * 1.15 - 0.35; p.aR.sw = -sn * 1.15 - 0.35;
    p.aL.el = p.aR.el = 1.55; p.aL.ra = p.aR.ra = 0.28;
    p.pawL = p.pawR = 'fist';
    p.chRy = sn * 0.16; p.hipRy = -sn * 0.12;
    p.eL.fl = p.eR.fl = 0.8; p.eL.sp = p.eR.sp = 0.1;
    p.tLift = -0.05; p.tCurl = -0.1; p.tSide = sn * 0.25;
    p.hatRx = -0.18;
    steps(s, ph, rig);
  },
});

def('tiptoe', {
  loop: true, expr: 'scheming',
  fn(t, p, f, s, rig) {
    const P = 1.6, u = (t / P) % 1;
    const leg = (v) => {
      if (v < 0.5) { const e = smooth(clamp01((v * 2 - 0.1) / 0.75)); return [lerp(0.45, -0.75, e), 1.9 * sin(e * PI) + 0.15, e]; }
      return [lerp(-0.75, 0.45, (v - 0.5) * 2), 0.15, 0];
    };
    const [swL, knL, eL] = leg(u), [swR, knR, eR] = leg((u + 0.5) % 1);
    p.lL.sw = swL; p.lL.kn = knL; p.lR.sw = swR; p.lR.kn = knR;
    const lift = sin(max(eL, eR) * PI);
    p.y = lift * 0.8;
    p.lean = 0.3; p.chRx = 0.12; p.hRx = -0.42; p.hipY = -1.1;
    p.hRy = sin((t / P) * PI) * 0.4;
    f.look = [sin((t / P) * PI * 3) > 0 ? 0.95 : -0.95, 0.1];
    p.aL.sw = p.aR.sw = -1.0 + lift * 0.08; p.aL.ra = p.aR.ra = 0.38;
    p.aL.el = p.aR.el = 1.95; p.aL.wx = p.aR.wx = 1.35 + lift * 0.2;
    p.tLift = 0.95; p.tCurl = 1.0; p.tSide = sin(t * 2) * 0.2;
    p.eL.fl = p.eR.fl = -0.15; p.eL.tw = p.eR.tw = sin((t / P) * PI) * 0.35;
    const k = Math.floor(u * 2);
    if (s.k !== undefined && k !== s.k) rig._emit('step');
    s.k = k;
  },
});

def('throw', {
  dur: 0.85, expr: 'scheming',
  fn(t, p, f, s, rig) {
    p.propL = 'sack';
    p.ik(p.aL, 3.4, 2.2, 5.2, 1, -0.5, -0.5); p.pawL = 'fist';
    const wind = K(t, [[0, 0], [0.25, 1, 'out'], [0.35, 0, 'in']]);
    const thr = K(t, [[0.25, 0], [0.35, 1, 'in'], [0.52, 1], [0.85, 0, 'io']]);
    p.chRy = -0.45 * wind + 0.35 * thr;
    p.lean = -0.14 * wind + 0.2 * thr;
    p.hRx += -0.12 * wind + 0.08 * thr;
    p.sq = 1 - 0.08 * wind + 0.07 * thr;
    p.aR.sw = K(t, [[0, -0.12], [0.25, 1.1, 'out'], [0.35, -2.5, 'in'], [0.48, -1.7, 'out'], [0.85, -0.12, 'io']]);
    p.aR.ra = K(t, [[0, 0.16], [0.25, 0.55], [0.35, 0.25], [0.85, 0.16]]);
    p.aR.el = K(t, [[0, 0.7], [0.25, 1.8], [0.35, 0.15, 'in'], [0.55, 0.4], [0.85, 0.7]]);
    p.aR.wx = K(t, [[0, 0.1], [0.25, 0.9], [0.35, -0.6], [0.85, 0.1]]);
    p.pawR = t < 0.33 ? 'fist' : t < 0.7 ? 'open' : 'relax';
    once(s, 'rel', t >= 0.33, () => rig._emit('release'));
    p.lL.sw = -0.35 * thr; p.lR.sw = 0.25 * thr; p.lL.kn = 0.2 * thr;
    p.hipY = -0.6 * wind - 0.3 * thr;
    if (t > 0.33) f.expr = 'wink';
  },
});

def('cheer', {
  dur: 1.4, expr: 'happy',
  fn(t, p, f, s, rig) {
    const crouch = K(t, [[0, 0], [0.13, 1, 'out'], [0.2, 0, 'in']]);
    const jt = (t - 0.2) / 0.42;
    const air = jt > 0 && jt < 1 ? 4 * jt * (1 - jt) : 0;
    const land = K(t, [[0.6, 0], [0.65, 1, 'out'], [0.85, 0, 'io']]);
    p.y = air * 10;
    p.sq = 1 - crouch * 0.17 + (jt > 0 && jt < 0.3 ? 0.14 * (1 - jt / 0.3) : 0) - land * 0.15;
    const bend = crouch + land * 0.9;
    p.hipY = -bend * 1.5;
    p.lL.sw = p.lR.sw = -bend * 0.55 - air * 0.3;
    p.lL.kn = p.lR.kn = bend * 1.1 + air * 0.9;
    p.lR.kn += air * 0.9; p.lR.sw += air * 0.35;
    const up = K(t, [[0, 0], [0.13, -0.25], [0.3, 1, 'out'], [0.62, 1], [0.75, 0.45]]);
    p.aL.sw = lerp(-0.12, -2.9, up); p.aR.sw = lerp(-0.12, -2.95, up);
    p.aL.ra = p.aR.ra = 0.2 + up * 0.2; p.aL.el = p.aR.el = 0.7 - up * 0.45;
    p.pawL = p.pawR = up > 0.3 ? 'fist' : 'relax';
    if (t > 0.7) {
      const pump = abs(sin((t - 0.7) * 10.5)) * smooth((1.4 - t) / 0.25);
      p.aR.sw = -1.3 - pump * 1.4; p.aR.el = 1.7 - pump * 0.9; p.aR.ra = 0.35;
      p.ik(p.aL, 6.6, 0.9, 1.4, 1, 0.1, -0.7, smooth((t - 0.7) / 0.2));
      p.y += pump * 0.4; p.hRx += -pump * 0.1;
    }
    p.hRx += -air * 0.15;
    once(s, 'land', t >= 0.62, () => rig._emit('land'));
    if (t > 0.62) f.expr = 'laugh';
  },
});

def('dance', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const B = 0.27; // beat
    const beat = t / B, bi = Math.floor(beat), bu = beat - bi;
    const bar = bi % 8;
    const hop = sin(bu * PI);
    p.y = hop * 1.6;
    p.sq = 1 + (hop - 0.5) * 0.08;
    const side = bar % 2 === 0 ? 1 : -1;
    if (bar < 6) {
      // jig: kick alternating legs, arms on hips then waving
      const kick = sin(bu * PI);
      const kL = side > 0 ? kick : 0, kR = side < 0 ? kick : 0;
      p.lL.sw = -kL * 1.1; p.lL.kn = kL * 0.3 + (1 - kL) * 0.1;
      p.lR.sw = -kR * 1.1; p.lR.kn = kR * 0.3 + (1 - kR) * 0.1;
      p.roll = side * 0.1 * hop; p.hipX = -side * 0.4;
      p.hRz = -side * 0.14; p.hRy = side * 0.1;
      if (bar < 4) {
        p.ik(p.aL, 6.6, 0.9, 1.4, 1, 0.1, -0.7); p.ik(p.aR, 6.6, 0.9, 1.4, 1, 0.1, -0.7);
        p.pawL = p.pawR = 'fist';
        p.chRy = side * 0.18;
      } else {
        p.aL.sw = -2.7 + sin(t * 20) * 0.2; p.aR.sw = -2.7 - sin(t * 20) * 0.2;
        p.aL.ra = p.aR.ra = 0.45 + side * 0.25; p.aL.el = p.aR.el = 0.5;
        p.pawL = p.pawR = 'open';
        p.chRz = side * 0.12;
      }
    } else {
      // spin!
      const u = (bar - 6 + bu) / 2;
      p.turn = EASE.io(u) * TAU;
      p.y = sin(u * PI) * 4;
      p.lL.kn = p.lR.kn = 0.9 * sin(u * PI); p.lR.sw = -0.6 * sin(u * PI);
      p.aL.sw = p.aR.sw = -1.6; p.aL.ra = p.aR.ra = 1.2; p.aL.el = p.aR.el = 0.2;
      p.pawL = p.pawR = 'open';
      if (u > 0.85) f.expr = 'wink';
    }
    p.tSide = sin(t * TAU / (B * 2)) * 0.8; p.tLift += 0.3;
    p.eL.fl = sin(t * 11) * 0.2; p.eR.fl = -sin(t * 11) * 0.2;
    const k = bi;
    if (s.k !== undefined && k !== s.k) rig._emit('step');
    s.k = k;
  },
});

def('panic', {
  loop: true, expr: 'shocked',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.26) * TAU, sn = sin(ph), cs = cos(ph);
    p.lL.sw = -max(0, sn) * 1.2; p.lR.sw = -max(0, -sn) * 1.2;
    p.lL.kn = max(0, sn) * 1.8; p.lR.kn = max(0, -sn) * 1.8;
    p.y = abs(cs) * 1.2 + max(0, sin(t * 2.1)) ** 12 * 5;
    p.sq = 1 + abs(cs) * 0.05;
    const a = t * 22;
    p.aL.sw = -2.6 + sin(a) * 0.7; p.aR.sw = -2.6 + sin(a + PI) * 0.7;
    p.aL.ra = 0.5 + cos(a) * 0.5; p.aR.ra = 0.5 + cos(a + PI) * 0.5;
    p.aL.el = p.aR.el = 0.6 + sin(a * 0.5) * 0.3;
    p.pawL = p.pawR = 'open';
    p.hRy = sin(t * 27) * 0.28; p.hRx = -0.12;
    p.chRz = sin(t * 13) * 0.08; p.lean = -0.08;
    p.eL.fl = p.eR.fl = 0.9;
    p.tPuff = 1.45; p.tLift = 0.9 + sin(t * 30) * 0.3; p.tSide = sin(t * 17) * 0.7; p.tCurl = 0;
    p.hatY = abs(sin(t * 15)) * 0.8;
    f.sweat = 2;
    f.mouth = Math.floor(t * 5) % 3 === 0 ? 'wobbly' : 'scream';
    f.blink = false;
    steps(s, ph, rig);
  },
});

def('greedy', {
  loop: true, expr: 'greedy',
  fn(t, p, f, s) {
    life(t, p, 0.5);
    p.lean = 0.12; p.chRx += 0.18; p.hRx += 0.05;
    const r = sin(t * 16);
    p.ik(p.aL, 0.5, 3.6 + r * 0.8, 6.9, 1, -0.7, -0.3);
    p.ik(p.aR, 0.5, 3.6 - r * 0.8, 6.9, 1, -0.7, -0.3);
    p.aL.shY = p.aR.shY = 0.9 + abs(r) * 0.2;
    p.y += abs(sin(t * 8)) * 0.35;
    p.hipY = -0.5 + abs(sin(t * 8)) * 0.2; p.lL.kn = p.lR.kn = 0.3; p.lL.sw = p.lR.sw = -0.15;
    p.hRz = sin(t * 4) * 0.08;
    p.tSide = sin(t * 18) * 0.6; p.tLift += 0.4;
    p.eL.fl = p.eR.fl = -0.1;
    f.look = [0, -0.2];
  },
});

def('count_coins', {
  loop: true, expr: 'greedy',
  fn(t, p, f, s, rig) {
    life(t, p, 0.4);
    p.propL = 'stack';
    const C2 = 2.4, u = t % C2, cyc = Math.floor(t / C2);
    p.ik(p.aL, 1.8, 2.8, 6.6, 1, -0.6, -0.5); p.pawL = 'open';
    p.aL.wx = -0.6;
    p.chRx += 0.12; p.hRx += 0.16;
    if (u < 1.2) {
      // flip a coin and catch it
      const up = K(u, [[0, 0], [0.2, 0.3], [0.3, -0.2, 'in'], [0.35, 0]]);
      const air = u > 0.32 && u < 0.86;
      const ca = air ? (u - 0.32) / 0.54 : 0;
      p.ik(p.aR, 2.4, 3 + up * 1.5 - (u > 0.86 && u < 1 ? 0.6 : 0), 6.4, 1, -0.6, -0.5);
      p.pawR = air ? 'open' : 'fist';
      p.propR = air ? null : 'coin';
      if (air) p.flyCoin = [-2.4, 4 + 4 * ca * (1 - ca) * 14, 7.4, ca * TAU * 3];
      f.look = air ? [-0.35, -0.9 + ca * 0.9 * (ca > 0.5 ? 1 : 0)] : [-0.3, 0.3];
      p.hRx -= air ? 0.3 * sin(ca * PI) : 0;
      once(s, 'f' + cyc, u > 0.32, () => rig._emit('coin'));
      once(s, 'c' + cyc, u > 0.86, () => rig._emit('catch'));
    } else {
      // bite test: is it real gold?
      const v = u - 1.2;
      const w = win(v, 0, 0.85, 0.22, 0.25);
      p.propR = 'coin'; p.pawR = 'fist';
      p.ik(p.aR, 1.2, 7.2, 9.2, 1, -0.6, -0.2, w);
      p.aR.st = 1.6;
      p.ik(p.aR, 2.4, 3, 6.4, 1, -0.6, -0.5, 1 - w);
      p.hRx += 0.12 * w;
      const bite = v > 0.3 && v < 0.75 ? abs(sin((v - 0.3) * 22)) : 0;
      f.mouth = w > 0.6 ? (bite > 0.5 ? 'grit' : 'E') : null;
      f.eyeL = f.eyeR = w > 0.6 ? 'squint' : null;
      if (v > 0.85) { f.eyeL = f.eyeR = 'coin'; f.mouth = 'grin_fang'; p.y += pulse(v, 0.85, 0.3) * 1.2; }
      once(s, 'b' + cyc, v > 0.45, () => rig._emit('bite'));
    }
    p.tSide = sin(t * 9) * 0.5;
  },
});

def('laugh_evil', {
  dur: 3.0, expr: 'evil_grin', next: 'idle',
  fn(t, p, f, s, rig) {
    const pre = win(t, 0, 0.55, 0.15, 0.12);
    const big = win(t, 0.55, 2.55, 0.25, 0.4);
    // "heh heh": fingers steepled
    const hh = abs(sin(t * 14)) * pre;
    p.ik(p.aL, 0.2, 5.2 + hh * 0.4, 6.8, 1, -0.7, -0.3, pre);
    p.ik(p.aR, 0.2, 5.2 + hh * 0.4, 6.8, 1, -0.7, -0.3, pre);
    p.pawL = p.pawR = t < 0.55 ? 'open' : 'open';
    p.chRx += 0.15 * pre; p.hRx += 0.18 * pre; p.aL.shY = p.aR.shY = hh * 0.6;
    // MWAHAHA: lean back, arms spread, shoulders shaking
    const shake = abs(sin(t * 21)) * big;
    p.lean += -0.3 * big; p.chRx += -0.15 * big; p.hRx += -0.4 * big + shake * 0.08;
    p.aL.sw += -1.9 * big; p.aR.sw += -1.9 * big;
    p.aL.ra += 0.9 * big; p.aR.ra += 0.9 * big;
    p.aL.el += -0.2 * big; p.aR.el += -0.2 * big;
    p.aL.wx += -0.7 * big; p.aR.wx += -0.7 * big;
    p.aL.shY += shake * 0.9; p.aR.shY += shake * 0.9;
    p.y += shake * 0.45; p.sq *= 1 + shake * 0.03;
    p.hipY = -0.5 * big; p.lL.kn = p.lR.kn = 0.3 * big; p.lL.sw = p.lR.sw = 0.1 * big;
    p.tPuff = 1 + 0.2 * big; p.tLift += 0.5 * big; p.tSide += sin(t * 21) * 0.2 * big;
    p.eL.fl = p.eR.fl = 0.2 * big;
    p.hatRz = sin(t * 21) * 0.1 * big;
    if (big > 0.3) {
      f.expr = 'mwaha';
      f.mouth = Math.floor(t * 7) % 2 ? 'mwaha' : 'laugh';
      f.eyeL = f.eyeR = Math.floor(t * 3.5) % 3 === 2 ? 'happy' : 'narrow';
    } else if (t > 2.55) f.expr = 'smug';
    once(s, 'mw', t > 0.6, () => rig._emit('mwaha'));
  },
});

def('point', {
  dur: 1.5, expr: 'smug',
  fn(t, p, f, s) {
    const w = K(t, [[0, 0], [0.18, -0.25, 'out'], [0.34, 1, 'back'], [1.15, 1], [1.5, 0, 'io']]);
    const jab = pulse(t, 0.62, 0.14) + pulse(t, 0.86, 0.14);
    p.aR.sw = lerp(-0.12, -1.55, w) - jab * 0.1; p.aR.ra = lerp(0.16, 0.05, w);
    p.aR.el = lerp(0.7, 0.05, w) + jab * 0.25;
    p.aR.shZ = jab * 1.2 + w * 0.6;
    p.pawR = w > 0.3 ? 'point' : 'relax';
    p.aR.wx = -0.1 * w;
    p.ik(p.aL, 6.6, 0.9, 1.4, 1, 0.1, -0.7, smooth(t / 0.3) * (1 - smooth((t - 1.2) / 0.3)));
    p.pawL = 'fist';
    p.lean = 0.12 * w + jab * 0.05; p.chRy = -0.25 * w; p.hRy = 0.18 * w;
    p.hRx += -0.08 * w + jab * 0.08;
    p.lR.sw = -0.3 * w; p.lL.sw = 0.15 * w;
    f.browLift = jab * 1.5;
    if (t > 0.34 && t < 1.2) f.mouth = jab > 0.3 ? 'A' : 'smirk_fang';
  },
});

def('shrug', {
  dur: 1.3, expr: 'confused',
  fn(t, p, f) {
    const w = K(t, [[0, 0], [0.2, 1.08, 'out'], [0.3, 1], [0.9, 1], [1.3, 0, 'io']]);
    for (const a of [p.aL, p.aR]) {
      a.shY = 1.5 * w; a.ra = lerp(0.16, 0.9, w); a.sw = lerp(-0.12, -0.35, w);
      a.el = lerp(0.7, 1.6, w); a.tw = -0.9 * w; a.wx = -0.5 * w;
    }
    p.pawL = p.pawR = w > 0.4 ? 'open' : 'relax';
    p.hRz = 0.28 * w; p.hRx += -0.05 * w;
    p.y += 0.3 * w;
    p.eL.sp += 0.3 * w; p.eR.sp += 0.3 * w;
    f.mouth = w > 0.5 ? 'wobbly' : null;
    f.eyeL = f.eyeR = w > 0.5 ? 'half' : null;
    f.browL = f.browR = w > 0.5 ? 'raised' : null;
  },
});

def('facepalm', {
  dur: 2.0, expr: 'sleepy',
  fn(t, p, f, s, rig) {
    const w = K(t, [[0, 0], [0.32, 1, 'in'], [1.45, 1], [1.9, 0, 'io']]);
    const hit = pulse(t, 0.3, 0.15);
    p.hRx += 0.5 * w + hit * 0.1; p.hRz += -0.12 * w;
    p.chRx += 0.14 * w; p.lean += 0.06 * w;
    p.hRy += sin(max(0, t - 0.5) * 7) * 0.13 * win(t, 0.5, 1.35, 0.1, 0.1);
    p.ik(p.aR, 1.2, 10.4, 9.5, 1, -0.9, 0.2, w);
    p.aR.st = 1.8; p.aR.wx += -1.0 * w;
    p.pawR = w > 0.3 ? 'open' : 'relax';
    p.aL.shY = p.aR.shY = -0.6 * win(t, 0.7, 1.4, 0.2, 0.2);
    p.eL.fl = p.eR.fl = 0.45 * w; p.eL.sp = p.eR.sp = 0.2 + 0.4 * w;
    p.tLift -= 0.5 * w;
    once(s, 'slap', t > 0.3, () => rig._emit('slap'));
    if (w > 0.4) { f.eyeL = f.eyeR = 'closed'; f.mouth = 'frown'; f.browL = f.browR = 'angry'; }
  },
});

def('wave', {
  dur: 1.6, expr: 'happy',
  fn(t, p, f) {
    const w = K(t, [[0, 0], [0.2, 1, 'back'], [1.25, 1], [1.6, 0, 'io']]);
    const wv = sin((t - 0.2) * 14) * win(t, 0.2, 1.2, 0.1, 0.15);
    p.aR.sw = lerp(-0.12, -2.55, w); p.aR.ra = lerp(0.16, 0.5, w) + wv * 0.35;
    p.aR.el = lerp(0.7, 0.55, w) + wv * 0.2; p.aR.wz = wv * 0.4;
    p.pawR = w > 0.4 ? 'open' : 'relax';
    p.chRz = -0.08 * w + wv * 0.03; p.hRz = 0.1 * w - wv * 0.04; p.roll = -wv * 0.02;
    p.ik(p.aL, 6.6, 0.9, 1.4, 1, 0.1, -0.7, w);
    p.pawL = 'fist';
    p.tSide += wv * 0.4;
  },
});

def('bow', {
  dur: 2.4, expr: 'proud',
  enter(s) { s.hand = false; },
  fn(t, p, f, s, rig) {
    const reach = K(t, [[0, 0], [0.32, 1, 'io'], [0.45, 1], [0.8, 0, 'io']]);
    const bow = K(t, [[0.35, 0], [0.8, 1, 'io'], [1.45, 1], [1.85, 0, 'io']]);
    const back = K(t, [[1.45, 0], [1.75, 1, 'io'], [1.9, 1], [2.2, 0, 'io']]);
    // grab the brim
    p.ik(p.aR, 1.8, 16.5, 4.4, 1, -0.3, 0.1, max(reach, back));
    p.aR.st = 1.9;
    // sweep the hat out while bowing
    const sweep = bow * (1 - back);
    if (sweep > 0.01) {
      p.ik(p.aR, 6.8, 6 - sweep * 1.5, 5 + sweep * 1.5, 1, -0.3, -0.6, sweep);
    }
    p.hRx += -0.1 * reach + 0.25 * bow;
    p.hipRx = 0.55 * bow; p.chRx += 0.35 * bow;
    p.hipZ = -1.2 * bow; p.hipY = -0.4 * bow;
    p.lR.sw = 0.35 * bow - 0.55 * bow; p.lL.sw = -0.55 * bow;
    p.lR.sw = 0.3 * bow; p.lR.kn = 0.3 * bow; p.lL.kn = 0.1 * bow;
    p.ik(p.aL, 1.6, 1.4, 6, 1, -0.4, -0.4, bow);
    p.pawL = 'relax';
    p.pawR = reach > 0.8 || sweep > 0.2 || back > 0.8 ? 'fist' : 'relax';
    p.tLift += 0.6 * bow; p.tSide += sin(t * 5) * 0.3 * bow;
    const inHand = t > 0.36 && t < 1.8;
    if (inHand !== s.hand) { s.hand = inHand; rig._hatHand.goal = inHand ? 1 : 0; }
    if (t > 1.95) f.expr = 'wink';
  },
  exit(s, rig) { rig._hatHand.goal = 0; },
});

def('talk', {
  loop: true, expr: 'neutral', gibber: true,
  fn(t, p, f, s) {
    life(t, p, 0.5);
    talkUpper(t, p, f, s);
    p.hipX = sin(t * 0.9) * 0.3;
  },
});

def('yawn', {
  dur: 2.6, expr: 'sleepy',
  fn(t, p, f, s, rig) {
    const y = K(t, [[0, 0], [0.4, 1, 'io'], [1.35, 1], [1.7, 0, 'io']]);
    p.aL.sw = lerp(-0.12, -2.85, y); p.aR.sw = lerp(-0.12, -2.85, y);
    p.aL.ra = p.aR.ra = 0.2 + 0.25 * y; p.aL.el = p.aR.el = lerp(0.7, 0.6, y);
    p.pawL = p.pawR = y > 0.5 ? 'fist' : 'relax';
    p.sq = 1 + 0.09 * y; p.lean = -0.1 * y; p.hRx += -0.3 * y; p.y += 0.6 * y;
    p.tLift += 0.9 * y; p.tCurl -= 0.3 * y; p.tPuff = 1 + 0.15 * y;
    p.eL.fl = p.eR.fl = 0.5 * y;
    p.hRy += sin(t * 3) * 0.05 * y;
    const smack = t > 1.7 && t < 2.2 ? Math.floor((t - 1.7) * 8) % 2 : -1;
    f.mouth = y > 0.25 ? 'yawn' : t < 0.4 && y > 0.05 ? 'o' : smack === 0 ? 'chew' : smack === 1 ? 'M' : null;
    f.eyeL = f.eyeR = y > 0.2 ? 'closed' : null;
    f.tear = t > 1.0 && t < 2.2 ? 1 : 0;
    once(s, 'y', t > 0.3, () => rig._emit('yawn'));
  },
});

def('stretch', {
  dur: 2.8, expr: 'proud',
  fn(t, p, f, s, rig) {
    const up = K(t, [[0, 0], [0.35, 1, 'io'], [1.8, 1], [2.1, 0, 'io']]);
    const lean = K(t, [[0.35, 0], [0.7, 1], [1.1, -1], [1.4, 0], [1.75, 0]]);
    const back = win(t, 1.3, 1.8, 0.15, 0.2);
    p.ik(p.aL, 0.5, 13.5 + up * 3.5, 1.2, 1, -0.2, -1, up);
    p.ik(p.aR, 0.5, 13.5 + up * 3.5, 1.2, 1, -0.2, -1, up);
    p.aL.st = p.aR.st = 1.9;
    p.pawL = p.pawR = up > 0.5 ? 'fist' : 'relax';
    p.roll = lean * 0.24 * up; p.chRz = lean * 0.12 * up;
    p.lean = -0.25 * back; p.hRx += -0.25 * back - 0.1 * up;
    p.sq = 1 + 0.08 * up;
    p.tLift += 0.7 * up; p.tCurl -= 0.4 * up;
    // shake-off
    const sh = win(t, 2.1, 2.55, 0.05, 0.1);
    p.chRy += sin(t * 55) * 0.2 * sh; p.hRy += sin(t * 55 + 1) * 0.35 * sh; p.hipRy += -sin(t * 55) * 0.12 * sh;
    p.tSide += sin(t * 55) * 0.8 * sh;
    if (sh > 0.1) { f.eyeL = f.eyeR = 'closed'; f.mouth = 'wobbly'; }
    else if (t > 2.5) f.expr = 'happy';
    else f.mouth = up > 0.5 ? 'o' : null;
    f.eyeL = f.eyeL || (up > 0.5 ? 'content' : null); f.eyeR = f.eyeR || (up > 0.5 ? 'content' : null);
    once(s, 'sh', t > 2.1, () => rig._emit('shake'));
  },
});

// ---------------------------------------------------------------- lying & sitting
def('sleep_lie', {
  loop: true, expr: 'asleep', lookW: 0,
  fn(t, p, f) {
    const br = sin(t * 1.5);
    p.roll = PI / 2; p.y = 6.2; p.x = 9.5; p.turn = 0;
    p.lean = 0.1;
    p.hipRx = 0.35; p.chRx = 0.3 + br * 0.02; p.hRx = 0.28; p.hRz = 0.25;
    p.lL.sw = p.lR.sw = -1.75; p.lL.kn = p.lR.kn = 2.2; p.lL.sp = 0.1; p.lR.sp = 0.25;
    p.aL.sw = -1.3; p.aR.sw = -1.1; p.aL.el = p.aR.el = 1.9; p.aL.ra = 0.25; p.aR.ra = -0.1;
    p.aL.wx = p.aR.wx = 0.9;
    p.tLift = -3.0; p.tSide = -0.6; p.tCurl = -0.6; p.tCurlSide = -0.5;
    p.tCurl += sin(t * 0.9) * 0.06;
    p.breath = br;
    p.eL.fl = 0.5; p.eR.fl = 0.3; p.eL.sp = p.eR.sp = 0.4;
    p.eL.fl += max(0, sin(t * 0.7)) ** 30 * 0.5;
    p.hatRz = 0.35; p.hatRx = 0.25;
    f.snot = 0.45 + 0.4 * sin(t * 1.5 - 0.6);
    f.zzz = 1;
    f.blink = false;
  },
});

def('sit', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    sitBase(t, p);
    life(t, p, 0.4);
    lapHands(p, t);
    fidgets(t, p, f, s, rig, ['glance', 'ear', 'chuckle', 'sniff', 'monocle']);
  },
});

def('sit_talk', {
  loop: true, expr: 'neutral', gibber: true,
  fn(t, p, f, s) {
    sitBase(t, p, 0.5);
    life(t, p, 0.4);
    lapHands(p, t);
    talkUpper(t, p, f, s);
  },
});

def('sit_scheme', {
  loop: true, expr: 'evil_grin',
  fn(t, p, f) {
    sitBase(t, p, 0.3);
    life(t, p, 0.4);
    p.chRx += 0.2; p.hRx += 0.12;
    const r = sin(t * 14);
    p.ik(p.aL, 0.6, 3.9 + r * 0.8, 6.6, 1, -0.7, -0.3);
    p.ik(p.aR, 0.6, 3.9 - r * 0.8, 6.6, 1, -0.7, -0.3);
    p.aL.shY = p.aR.shY = 0.8;
    f.look = [sin(t * 0.7) * 0.6, -0.6];
    const sn = max(0, sin(t * 1.6)) ** 8;
    p.aL.shY += abs(sin(t * 19)) * 0.5 * sn; p.aR.shY += abs(sin(t * 19)) * 0.5 * sn;
    if (sn > 0.35) { f.eyeL = f.eyeR = 'happy'; f.mouth = 'mwaha'; }
  },
});

def('sit_laugh', {
  dur: 2.6, expr: 'mwaha', next: 'sit',
  fn(t, p, f, s, rig) {
    sitBase(t, p, 0.2);
    const big = win(t, 0.1, 2.1, 0.25, 0.4);
    const shake = abs(sin(t * 21)) * big;
    p.chRx += -0.35 * big; p.hRx += -0.35 * big + shake * 0.08;
    p.aL.sw += -1.8 * big; p.aR.sw += -1.8 * big; p.aL.ra += 0.9 * big; p.aR.ra += 0.9 * big;
    p.aL.wx += -0.7 * big; p.aR.wx += -0.7 * big;
    p.pawL = p.pawR = 'open';
    p.aL.shY = p.aR.shY = shake * 0.9;
    p.hipY += shake * 0.3;
    p.lL.kn += shake * 0.4; p.lR.kn += shake * 0.4;
    f.mouth = Math.floor(t * 7) % 2 ? 'mwaha' : 'laugh';
    f.eyeL = f.eyeR = Math.floor(t * 3.5) % 3 === 2 ? 'happy' : 'narrow';
    if (big < 0.3) f.expr = 'smug';
    once(s, 'mw', t > 0.15, () => rig._emit('mwaha'));
  },
});

def('sit_doze', {
  loop: true, expr: 'sleepy', lookW: 0.2,
  fn(t, p, f, s, rig) {
    sitBase(t, p, 0.15);
    const C2 = 6.2, u = t % C2, cyc = Math.floor(t / C2);
    const droop = u < 4.3 ? EASE.in(u / 4.3) : u < 4.45 ? 1 - EASE.out((u - 4.3) / 0.15) * 1.25 : K(u, [[4.45, -0.25], [5.2, 0.05, 'out'], [6.2, 0]]);
    const br = sin(t * 1.7);
    p.breath = br * 0.7;
    p.hRx = 0.95 * droop + br * 0.02; p.hRz = 0.15 * droop * sin(cyc * 1.7 + 1);
    p.chRx = 0.04 + 0.2 * droop; p.lean = 0.04 * droop;
    // arms on the desk
    p.ik(p.aL, 3.3, deskY(0) - droop * 0.4, 7.2, 1, -0.2, -0.8);
    p.ik(p.aR, 3.3, deskY(0) - droop * 0.4, 7.2, 1, -0.2, -0.8);
    p.pawL = p.pawR = 'relax';
    p.aL.wx = p.aR.wx = -0.8;
    p.eL.fl = p.eR.fl = 0.5 * droop; p.eL.sp = p.eR.sp = 0.2 + 0.45 * max(0, droop);
    p.tLift -= 0.2 * droop;
    const asleep = u > 1.3 && u < 4.3;
    const jerk = u >= 4.3 && u < 4.8;
    f.expr = asleep ? 'asleep' : jerk ? 'shocked' : 'sleepy';
    if (jerk) { f.mouth = 'o'; f.sweat = 0; f.blink = false; }
    if (asleep) {
      f.mouth = 'slack';
      f.drool = u > 2.6 ? 1 : 0;
      f.snot = clamp01((u - 1.4) / 2.6) * (0.6 + 0.4 * sin(t * 3.4));
      f.zzz = 1;
    }
    once(s, 'j' + cyc, u >= 4.3, () => rig._emit('jerk'));
    once(s, 's' + cyc, u >= 2, () => rig._emit('snore'));
  },
});

def('sit_type', {
  loop: true, expr: 'scheming', lookW: 0.4,
  fn(t, p, f, s, rig) {
    sitBase(t, p, 0.2);
    life(t, p, 0.3);
    p.chRx += 0.1; p.hRx += 0.02; p.lean = 0.02;
    const C2 = 3.6, u = t % C2;
    const slam = win(u, 2.9, 3.35, 0.18, 0.12);
    const tapL = max(0, sin(t * 29)) * (1 - slam), tapR = max(0, sin(t * 23 + 1.3)) * (1 - slam);
    const kx = (v) => 2.2 + sin(t * v) * 0.8;
    p.ik(p.aL, kx(3.1), deskY(0.6) + tapL * 0.9, 7.4, 1, -0.3, -0.7);
    p.ik(p.aR, kx(2.3), deskY(0.6) + tapR * 0.9 + slam * 5 * (u < 3.2 ? 1 : 0), 7.4 - slam * 0.5, 1, -0.3, -0.7);
    p.aL.wx = p.aR.wx = -0.9;
    p.pawL = p.pawR = 'relax';
    p.hRy = sin(t * 0.6) * 0.08;
    f.look = [sin(t * 1.3) * 0.4, -0.15];
    if (u > 3.2 && u < 3.6) { f.expr = 'evil_grin'; p.hRx -= 0.08; }
    const k = Math.floor(t * 8);
    if (s.k !== undefined && k !== s.k && slam < 0.2) rig._emit('type');
    s.k = k;
    once(s, 'e' + Math.floor(t / C2), u > 3.22, () => rig._emit('enter'));
  },
});

def('sit_sip', {
  dur: 3.4, expr: 'neutral', next: 'sit',
  fn(t, p, f, s, rig) {
    sitBase(t, p, 0.3);
    life(t, p, 0.3);
    p.propR = 'can';
    lapHands(p, t);
    const up = K(t, [[0, 0], [0.5, 1, 'io'], [1.75, 1], [2.1, 0, 'io']]);
    const tilt = K(t, [[0.45, 0], [0.7, 1, 'io'], [1.6, 1], [1.8, 0]]);
    p.ik(p.aR, 1.4, lerp(1.5, 8.2 + tilt * 0.6, up), lerp(5.2, 8.6, up), 1, -0.8, -0.2, 1);
    p.aR.st = 1.7;
    p.aR.wx = -0.9 * up - 1.1 * tilt; p.aR.wz = -0.2 * up;
    p.hRx += -0.32 * tilt; p.chRx += -0.08 * tilt;
    const gulp = t > 0.75 && t < 1.6 ? abs(sin((t - 0.75) * 11)) : 0;
    p.hSq *= 1 - gulp * 0.03;
    if (tilt > 0.3) { f.eyeL = f.eyeR = 'content'; f.mouth = 'M'; }
    // ZING! energy shiver
    const zing = win(t, 2.15, 2.75, 0.04, 0.2);
    if (t > 2.1) {
      p.y += zing * 1.2; p.hSq *= 1 + zing * 0.08;
      p.hRy += sin(t * 70) * 0.08 * zing; p.chRz += sin(t * 60) * 0.05 * zing;
      p.eL.fl = p.eR.fl = -0.3 * zing; p.eL.sp = p.eR.sp = 0.05;
      p.tPuff = 1 + 0.5 * zing; p.tLift += 0.8 * zing;
      f.expr = zing > 0.2 ? 'excited' : 'smug';
      f.mouth = zing > 0.2 ? 'grin' : null;
    }
    for (let i = 0; i < 3; i++) once(s, 'g' + i, t > 0.9 + i * 0.28, () => rig._emit('gulp'));
    once(s, 'z', t > 2.15, () => rig._emit('zing'));
  },
});

def('wake_startle', {
  dur: 2.9, expr: 'shocked', next: 'sit',
  fn(t, p, f, s, rig) {
    sitBase(t, p, 0);
    const jt = t / 0.46;
    const air = jt < 1 ? 4 * jt * (1 - jt) : 0;
    const land = K(t, [[0.44, 0], [0.5, 1, 'out'], [0.72, 0, 'io']]);
    p.y = air * 8;
    p.sq = 1 + (jt < 0.4 ? 0.18 * (1 - jt / 0.4) : 0) - land * 0.14;
    const fl = win(t, 0, 0.75, 0.04, 0.3);
    // flail
    const a = t * 30;
    p.aL.sw = lerp(-0.4, -2.3 + sin(a) * 0.6, fl); p.aR.sw = lerp(-0.4, -2.3 + sin(a + 2) * 0.6, fl);
    p.aL.ra = p.aR.ra = lerp(0.3, 1.0, fl); p.aL.el = p.aR.el = lerp(1, 0.3, fl);
    p.pawL = p.pawR = fl > 0.3 ? 'open' : 'relax';
    p.lL.kn -= 0.9 * fl + sin(a * 0.9) * 0.4 * fl; p.lR.kn -= 0.9 * fl + sin(a * 0.9 + 2) * 0.4 * fl;
    p.hRx += -0.25 * fl; p.hSq *= 1 + 0.12 * fl;
    p.eL.fl = p.eR.fl = -0.3 * fl; p.eL.sp = p.eR.sp = 0.05;
    p.tPuff = 1 + 0.6 * fl; p.tLift += 1.2 * fl;
    once(s, 'hat', t > 0.02, () => rig.popHat(1.5, 2));
    once(s, 'mono', t > 0.05, () => rig.dropMonocle());
    once(s, 'yelp', t > 0.02, () => rig._emit('startle'));
    // embarrassed recovery: straighten the hat, pop the monocle back, tug the waistcoat
    const fix = win(t, 1.45, 2.05, 0.2, 0.2);
    p.ik(p.aR, 3.2, 12.4, 7.6, 1, -0.3, -0.1, fix);
    p.aR.st = 1.6;
    p.hRx += 0.12 * fix; p.hRz += 0.12 * fix;
    if (fix > 0.5) p.pawR = 'fist';
    once(s, 'fix', t > 1.72, () => rig.restoreMonocle());
    const tug = win(t, 2.15, 2.6, 0.12, 0.15);
    p.ik(p.aL, 2.5, -1.5 - sin(t * 30) * 0.5 * tug, 5.8, 1, -0.3, -0.5, tug);
    p.ik(p.aR, 2.5, -1.5 - sin(t * 30 + 1) * 0.5 * tug, 5.8, 1, -0.3, -0.5, tug);
    if (tug > 0.5) p.pawL = p.pawR = 'fist';
    p.chRx += -0.05 * tug;
    if (t > 0.78) {
      f.expr = 'embarrassed';
      f.look = t < 1.4 ? [sin(t * 9) > 0 ? 0.9 : -0.9, 0.2] : [0.7, 0.3];
      if (t > 2.3) { f.expr = 'smug'; f.look = null; }
    } else {
      f.mouth = t < 0.45 ? 'scream' : 'o_big';
      f.blink = false;
    }
  },
});

// ---------------------------------------------------------------- extra gags
def('think', {
  loop: true, expr: 'confused',
  fn(t, p, f, s, rig) {
    life(t, p, 0.5);
    p.ik(p.aR, 1.6, 8.8, 9.1, 1, -0.9, 0.2);
    p.aR.st = 1.6; p.pawR = 'fist'; p.aR.wx = -1.2;
    p.ik(p.aL, 1.8, 3.2, 5.6, 1, -0.4, -0.5); p.pawL = 'relax';
    p.hRx += -0.18; p.hRz = 0.14 + sin(t * 0.8) * 0.05;
    f.look = [0.5 + sin(t * 0.7) * 0.3, -0.85];
    // tap tap tap (foot)
    const tap = max(0, sin(t * 9)) * (sin(t * 0.9) > -0.3 ? 1 : 0);
    p.lL.sw = -0.25; p.lL.kn = 0.35 * tap;
    p.tSide += sin(t * 3) * 0.3;
    const k = Math.floor(t * 9 / TAU);
    if (s.k !== undefined && k !== s.k && sin(t * 0.9) > -0.3) rig._emit('tap');
    s.k = k;
  },
});

def('angry_stomp', {
  dur: 1.8, expr: 'angry',
  fn(t, p, f, s, rig) {
    const st = (t % 0.45) / 0.45, k = Math.floor(t / 0.45);
    const leftLeg = k % 2 === 0;
    const lift = st < 0.65 ? sin((st / 0.65) * PI * 0.5) : 1 - EASE.in((st - 0.65) / 0.35);
    const stomp = st > 0.65 && st < 0.8 ? 1 - (st - 0.65) / 0.15 : 0;
    const L = leftLeg ? p.lL : p.lR;
    L.sw = -0.8 * lift; L.kn = 1.3 * lift;
    p.y = lift * 1.2; p.sq = 1 - stomp * 0.12 + lift * 0.03;
    p.hipY = -stomp * 0.8;
    const shake = sin(t * 38);
    p.aL.sw = -1.2 + shake * 0.15; p.aR.sw = -1.2 - shake * 0.15;
    p.aL.ra = p.aR.ra = 0.35; p.aL.el = p.aR.el = 1.7;
    p.pawL = p.pawR = 'fist';
    p.lean = 0.12; p.hRx = 0.1 + shake * 0.02; p.hRy = shake * 0.04;
    p.tPuff = 1.3; p.tLift = 0.9 + shake * 0.1; p.tSide = shake * 0.3;
    p.eL.fl = p.eR.fl = 0.6;
    once(s, 'st' + k, st > 0.66, () => rig._emit('stomp'));
  },
});

def('faint', {
  dur: 2.4, expr: 'shocked', next: null,
  fn(t, p, f, s, rig) {
    const hand = K(t, [[0, 0], [0.35, 1, 'out'], [1.0, 1]]);
    const fall = K(t, [[0.75, 0], [1.25, 1, 'in'], [1.35, 0.93, 'out'], [1.45, 1, 'in']]);
    p.ik(p.aR, 2, 11, 7.5, 1, -0.4, 0.3, hand * (1 - fall));
    p.aR.st = 1.6; p.pawR = 'open'; p.aR.wx = -1.4 * hand;
    p.hRx += -0.35 * hand * (1 - fall); p.hRz += 0.2 * hand * (1 - fall);
    p.lean = -1.5 * fall; p.y = fall * 3.2; p.z = -fall * 1.5;
    p.lL.sw = -1.3 * fall; p.lR.sw = -1.0 * fall; p.lL.kn = 0.2 * fall;
    p.aL.sw = lerp(-0.12, -1.6, fall); p.aL.ra = lerp(0.16, 1.4, fall); p.aL.el = 0.2 * fall + 0.7 * (1 - fall);
    p.aR.sw += -1.5 * fall; p.aR.ra += 1.2 * fall;
    p.pawL = fall > 0.5 ? 'open' : 'relax';
    p.hRx += -0.2 * fall;
    p.tLift = lerp(0.3, -0.9, fall); p.tCurl = lerp(0.35, -0.3, fall);
    p.eL.fl = p.eR.fl = 0.7 * fall;
    if (t > 1.3) {
      f.expr = 'ko';
      p.lL.sw += sin(t * 20) * 0.1 * max(0, 1 - (t - 1.3) * 1.2);
    } else if (t > 0.35) f.expr = 'worried';
    once(s, 'thud', t > 1.25, () => rig._emit('thud'));
  },
});

def('polish_monocle', {
  dur: 3.4, expr: 'smug',
  fn(t, p, f, s, rig) {
    life(t, p, 0.3);
    const take = K(t, [[0, 0], [0.35, 1, 'io']]);
    const holdOut = K(t, [[0.5, 0], [0.8, 1, 'io'], [2.5, 1], [2.9, 0, 'io']]);
    const eye = win(t, 0, 0.55, 0.3, 0.2) + win(t, 2.75, 3.2, 0.2, 0.2);
    // to the eye / hold out in front / rub on the belly
    p.ik(p.aR, 3.2, 12.4, 7.6, 1, -0.3, -0.1, clamp01(eye));
    p.aR.st = 1.6;
    const breathe = win(t, 0.8, 1.3, 0.1, 0.1);
    const rub = win(t, 1.35, 2.15, 0.1, 0.1);
    const insp = win(t, 2.15, 2.6, 0.1, 0.1);
    const rx = 2.2 + sin(t * 18) * 0.9 * rub, ry = lerp(lerp(8.4, 1.2, rub), 9.2, insp) + cos(t * 18) * 0.7 * rub;
    p.ik(p.aR, rx, ry, lerp(8.6, 6.4, rub), 1, -0.5, -0.2, holdOut * (1 - clamp01(eye)));
    p.pawR = 'fist';
    p.hRx += 0.25 * rub - 0.1 * insp + 0.1 * breathe;
    const inHand = t > 0.38 && t < 2.95;
    if (inHand && !s.hand) { s.hand = true; rig._monoHand(true); }
    if (!inHand && s.hand) { s.hand = false; rig._monoHand(false); }
    if (breathe > 0.3) f.mouth = 'o';
    if (rub > 0.3) { f.eyeL = f.eyeR = 'content'; f.mouth = 'smirk_big'; }
    if (insp > 0.3) { f.eyeR = 'squint'; f.eyeL = 'open'; f.look = [-0.4, -0.3]; }
    once(s, 'hah', t > 0.85, () => rig._emit('hah'));
    once(s, 'ting', t > 2.3, () => rig._emit('glint'));
  },
  exit(s, rig) { if (s.hand) rig._monoHand(false); },
});

def('sneeze', {
  dur: 1.9, expr: 'neutral',
  fn(t, p, f, s, rig) {
    const ah = K(t, [[0, 0], [0.3, 0.5, 'io'], [0.42, 0.35], [0.8, 1, 'in'], [0.86, -1.1, 'in'], [1.05, -0.6, 'out'], [1.5, 0, 'io']]);
    p.hRx += -0.4 * max(0, ah) + 0.35 * max(0, -ah); p.chRx += -0.1 * max(0, ah) + 0.2 * max(0, -ah);
    p.lean = -0.08 * max(0, ah) + 0.15 * max(0, -ah);
    p.sq = 1 + 0.06 * max(0, ah) - 0.08 * max(0, -ah);
    p.hSq *= 1 + 0.06 * max(0, ah);
    p.eL.fl = p.eR.fl = 0.5 * max(0, -ah);
    p.tPuff = 1 + 0.3 * max(0, -ah); p.tLift += 0.6 * max(0, -ah);
    p.aL.sw += 0.3 * max(0, -ah); p.aR.sw += 0.3 * max(0, -ah);
    if (t < 0.84) { f.eyeL = f.eyeR = ah > 0.3 ? 'squint' : null; f.mouth = ah > 0.3 ? 'o' : 'O'; f.browL = f.browR = 'worried'; }
    else if (t < 1.1) { f.eyeL = f.eyeR = 'closed'; f.mouth = 'scream'; }
    else { f.expr = 'confused'; }
    once(s, 'ach', t > 0.84, () => { rig._emit('sneeze'); rig.popHat(0.55, 1); });
  },
});

def('dizzy', {
  loop: true, expr: 'dizzy',
  fn(t, p, f) {
    const a = t * 3.2;
    p.roll = sin(a) * 0.12; p.lean = cos(a) * 0.1;
    p.hRz = sin(a + 0.8) * 0.2; p.hRx += cos(a + 0.8) * 0.12;
    p.hipX = sin(a) * 0.8; p.hipZ = cos(a) * 0.6;
    p.aL.ra = 0.6 + sin(a) * 0.2; p.aR.ra = 0.6 - sin(a) * 0.2; p.aL.sw = p.aR.sw = -0.4;
    p.pawL = p.pawR = 'open';
    p.lL.sp = 0.2; p.lR.sp = 0.2; p.lL.kn = max(0, sin(a)) * 0.3; p.lR.kn = max(0, -sin(a)) * 0.3;
    p.eL.fl = 0.3 + sin(a) * 0.3; p.eR.fl = 0.3 - sin(a) * 0.3;
    p.tSide = sin(a * 2) * 0.5;
    p.hatRz = sin(a + 1.5) * 0.25;
  },
});
