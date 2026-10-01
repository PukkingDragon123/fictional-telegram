// Moose Express courier bicycle: red step-through frame, cream fenders, a
// wicker front basket and a brass bell. Fine 0.025 voxels, geometry cached.
// The parts that move (steering, wheels, crank + pedals, bell, kickstand)
// are separate groups; MooseCourier spins them from its ground speed.
import * as THREE from 'three';
import { FV, VoxelModel, tone, hash3, buildGeo, geoCache, matFor } from './critterKit.js';

/** Bike layout in world units (bike space: origin on the ground between the wheels, facing +Z). */
export const BIKE = {
  R: 0.22, // wheel radius
  rearZ: -0.36, frontZ: 0.38,
  crankY: 0.25, crankZ: -0.0, crankR: 0.085,
  seatY: 0.6, seatZ: -0.17,
  steerZ: 0.27, steerY: 0.56,
  gripX: 0.19, gripY: 0.73, gripZ: 0.18,
  basketY: 0.62, basketZ: 0.47,
  bellX: 0.11, bellY: 0.745, bellZ: 0.22,
  gear: 1.5, // wheel turns per crank turn
};

const C = {
  frame: 0xd8402a, frameD: 0xa82a1e, frameL: 0xf06048,
  fender: 0xf4ead2, fenderD: 0xdccdb0,
  tire: 0x2a2428, tireL: 0x3e3840, rim: 0xc8ccd6, rimD: 0x9aa0ae, spoke: 0xb8bec8, hub: 0xe8ecf2,
  seat: 0x5a3a24, seatL: 0x7a5234, grip: 0x3a2a24, chrome: 0xd8dce4, chromeD: 0xa0a6b2,
  wick: 0xc8945a, wickD: 0xa07038, wickL: 0xe0b078,
  bell: 0xffd84a, bellD: 0xd8a82a, pedal: 0x3a3a42, pedalL: 0x5a5a64, chain: 0x6a6a74,
  logo: 0x2f62c8, white: 0xfaf6ea,
};
const W = (u) => u / FV; // world -> fine voxels

function tube(v, a, b, col, r = 0.9) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2) + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const px = Math.round(x - 0.5 + dx * 0.5), py = Math.round(y + dy * 0.5), pz = Math.round(z + dz * 0.5);
      if (Math.hypot(px + 0.5 - x, py - y, pz - z) <= r) v.set(px, py, pz, typeof col === 'function' ? col(px, py, pz) : col);
    }
  }
}

// Frame (bike space, fine voxels).
function frameModel() {
  const v = new VoxelModel();
  const P = (z, y) => [0, W(y), W(z)];
  const rear = P(BIKE.rearZ, BIKE.R), crank = P(BIKE.crankZ, BIKE.crankY), seat = P(BIKE.seatZ, BIKE.seatY - 0.04);
  const head = P(BIKE.steerZ - 0.02, BIKE.steerY - 0.12), headTop = P(BIKE.steerZ - 0.01, BIKE.steerY);
  const fc = (x, y, z) => tone(x, y, z, C.frame, C.frameD, C.frameL, 0.08, 0.1);
  tube(v, crank, seat, fc, 1.0); // seat tube
  tube(v, crank, head, fc, 1.0); // step-through down tube
  tube(v, P(-0.02, 0.38), P(BIKE.steerZ - 0.03, BIKE.steerY - 0.05), fc, 0.9); // low top tube (step-through curve)
  tube(v, head, headTop, fc, 1.1);
  for (const sx of [-2, 2]) {
    const off = (p) => [p[0] + sx, p[1], p[2]];
    tube(v, off(rear), off(crank), fc, 0.7); // chain stays
    tube(v, off(rear), off(P(BIKE.seatZ + 0.02, BIKE.seatY - 0.1)), fc, 0.7); // seat stays
  }
  // seat post + saddle
  tube(v, seat, P(BIKE.seatZ - 0.01, BIKE.seatY), C.chrome, 0.7);
  for (let x = -3; x <= 2; x++)
    for (let z = -5; z <= 3; z++) {
      const w = z > 0 ? 1.4 : 3;
      if (Math.abs(x + 0.5) > w) continue;
      v.set(x, W(BIKE.seatY) + 1, W(BIKE.seatZ) + z, z === -5 ? C.seatL : C.seat);
      if (z < 2) v.set(x, W(BIKE.seatY) + 2, W(BIKE.seatZ) + z, (x + z) % 3 ? C.seat : C.seatL);
    }
  // rear fender + chain guard with a little Moose Express logo
  for (let a = -0.2; a <= 2.2; a += 0.04) {
    const y = W(BIKE.R) + Math.sin(a) * 10.5, z = W(BIKE.rearZ) - Math.cos(a) * 10.5;
    for (let x = -2; x <= 1; x++) v.set(x, Math.round(y), Math.round(z), x === -2 || x === 1 ? C.fenderD : C.fender);
  }
  for (let z = Math.round(W(BIKE.rearZ)) + 1; z <= 2; z++)
    for (let y = W(BIKE.crankY) - 1; y <= W(BIKE.crankY) + 2; y++) {
      const t = (z - W(BIKE.rearZ)) / (0 - W(BIKE.rearZ));
      if (y > W(BIKE.R) + 2 + t * 1.2 || y < W(BIKE.R) - 2 + t * 0.4) continue;
      v.set(4, y, z, (z + y) % 9 === 0 ? C.chain : C.frame);
    }
  v.set(4, W(BIKE.crankY), -6, C.white); v.set(4, W(BIKE.crankY) + 1, -6, C.logo); v.set(4, W(BIKE.crankY), -7, C.logo);
  // rear reflector
  v.set(-1, W(0.36), W(BIKE.rearZ) - 11, 0xff3030); v.set(0, W(0.36), W(BIKE.rearZ) - 11, 0xff3030);
  return v;
}

// Steering (pivot at the head tube): fork, handlebars, front fender, basket, lamp.
function steerModel() {
  const v = new VoxelModel();
  const ox = W(BIKE.steerZ), oy = W(BIKE.steerY);
  const P = (z, y, x = 0) => [x, W(y) - oy, W(z) - ox];
  const fc = (x, y, z) => tone(x, y, z, C.frame, C.frameD, C.frameL, 0.08, 0.1);
  for (const sx of [-2, 2]) tube(v, P(BIKE.steerZ, BIKE.steerY - 0.1, sx), P(BIKE.frontZ, BIKE.R, sx), fc, 0.75);
  tube(v, P(BIKE.steerZ - 0.01, BIKE.steerY - 0.11, -1.5), P(BIKE.steerZ - 0.01, BIKE.steerY - 0.11, 1.5), fc, 0.8);
  // stem + swept-back bars
  tube(v, P(BIKE.steerZ, BIKE.steerY), P(BIKE.steerZ, BIKE.gripY - 0.01), C.chrome, 0.8);
  tube(v, P(BIKE.steerZ, BIKE.gripY - 0.01, -W(0.06)), P(BIKE.steerZ, BIKE.gripY - 0.01, W(0.06)), C.chrome, 0.8);
  for (const s of [-1, 1]) {
    tube(v, P(BIKE.steerZ, BIKE.gripY - 0.01, s * W(0.06)), P(BIKE.gripZ + 0.03, BIKE.gripY, s * W(BIKE.gripX - 0.04)), C.chrome, 0.8);
    tube(v, P(BIKE.gripZ + 0.03, BIKE.gripY, s * W(BIKE.gripX - 0.04)), P(BIKE.gripZ - 0.02, BIKE.gripY, s * W(BIKE.gripX + 0.03)), C.grip, 1.0);
  }
  // front fender
  for (let a = 0.3; a <= 2.5; a += 0.05) {
    const y = W(BIKE.R) - oy + Math.sin(a) * 10.5, z = W(BIKE.frontZ) - ox + Math.cos(a) * 10.5;
    for (let x = -2; x <= 1; x++) v.set(x, Math.round(y), Math.round(z), x === -2 || x === 1 ? C.fenderD : C.fender);
  }
  // headlamp
  for (let x = -1; x <= 0; x++) for (let y = -1; y <= 0; y++) v.set(x, y - 2, 3, C.chrome);
  v.set(-1, -2, 4, 0xfff6c0); v.set(0, -2, 4, 0xfff6c0); v.set(-1, -3, 4, 0xffe680); v.set(0, -3, 4, 0xffe680);
  // wicker basket (open top) on a bracket
  const by = W(BIKE.basketY) - oy, bz = W(BIKE.basketZ) - ox;
  for (let x = -6; x <= 5; x++)
    for (let y = 0; y <= 4; y++)
      for (let z = -4; z <= 4; z++) {
        const wall = x === -6 || x === 5 || z === -4 || z === 4 || y === 0;
        if (!wall) continue;
        let c = (x + y + z) % 2 ? C.wick : C.wickD;
        if (y === 4) c = C.wickL;
        if (y === 0) c = (x + z) % 2 ? C.wickD : C.wick;
        v.set(x, by + y, bz + z, c);
      }
  for (let x = -6; x <= 5; x++) { v.set(x, by + 5, bz - 4, C.wickL); v.set(x, by + 5, bz + 4, C.wickL); }
  for (let z = -4; z <= 4; z++) { v.set(-6, by + 5, bz + z, C.wickL); v.set(5, by + 5, bz + z, C.wickL); }
  // a little Moose Express tag on the basket
  for (let x = -2; x <= 1; x++) for (let y = 1; y <= 3; y++) v.set(x, by + y, bz + 5, y === 3 ? C.logo : C.white);
  v.set(-1, by + 2, bz + 5, 0xe0402e); v.set(0, by + 2, bz + 5, 0xe0402e);
  tube(v, [0, by - 1, bz - 4], [0, -2, 1], C.chrome, 0.6);
  return v;
}

function wheelModel() {
  const v = new VoxelModel();
  const R = W(BIKE.R);
  for (let y = -Math.ceil(R); y <= R; y++)
    for (let z = -Math.ceil(R); z <= R; z++) {
      const r = Math.hypot(y + 0.5, z + 0.5);
      if (r > R + 0.2) continue;
      let c = null, th = 0;
      if (r > R - 1.3) { c = (Math.atan2(y, z) * 8) % 1 < 0.5 ? C.tire : C.tireL; th = 1; }
      else if (r > R - 2.2) { c = C.rim; th = 0; }
      else if (r < 1.6) { c = C.hub; th = 1; }
      else {
        const a = Math.atan2(y + 0.5, z + 0.5);
        const k = ((a / (Math.PI / 2)) % 1 + 1) % 1;
        if (Math.abs(k - 0.5) * (Math.PI / 2) * r < 0.62) c = C.spoke;
      }
      if (c == null) continue;
      v.set(0, y, z, c);
      if (th) v.set(-1, y, z, c === C.hub ? C.chromeD : c);
    }
  return v;
}

function crankModel() {
  const v = new VoxelModel();
  // chainring + two opposite crank arms (the arms point +-Y at angle 0)
  for (let y = -3; y <= 2; y++) for (let z = -3; z <= 2; z++) { const r = Math.hypot(y + 0.5, z + 0.5); if (r < 3.3) v.set(4, y, z, r > 2.4 ? C.chain : C.chrome); }
  const L = Math.round(W(BIKE.crankR));
  for (let k = 0; k <= L; k++) { v.set(5, k, 0, C.chromeD); v.set(-5, -k, 0, C.chromeD); }
  for (let x = -5; x <= 5; x++) v.set(x, 0, 0, C.chromeD);
  return v;
}
function pedalModel() {
  const v = new VoxelModel();
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, 0, z, (x === -2 || x === 1) ? C.pedalL : C.pedal);
  return v;
}
function bellModel() {
  const v = new VoxelModel();
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) { v.set(x, 0, z, C.bellD); if (Math.abs(x + 0.5) + Math.abs(z + 0.5) < 2.5) v.set(x, 1, z, C.bell); }
  v.set(-1, 2, -1, 0xfff6c4); v.set(0, 2, 0, C.bell);
  v.set(2, 0, 0, C.chrome); v.set(3, 1, 0, C.chrome); // lever
  return v;
}
function kickModel() {
  const v = new VoxelModel();
  for (let y = -9; y <= 0; y++) v.set(0, y, 0, C.chromeD);
  v.set(0, -10, 0, C.pedal); v.set(0, -10, 1, C.pedal);
  return v;
}

const cache = geoCache(() => ({
  frame: buildGeo(frameModel(), [0, 0, 0], FV),
  steer: buildGeo(steerModel(), [0, 0, 0], FV),
  wheel: buildGeo(wheelModel(), [-0.5, 0, 0], FV),
  crank: buildGeo(crankModel(), [0, 0, 0], FV),
  pedal: buildGeo(pedalModel(), [0, 0, 0], FV),
  bell: buildGeo(bellModel(), [0, 0, 0], FV),
  kick: buildGeo(kickModel(), [0, 0, 0], FV),
}));

/**
 * Build a bicycle. Returns { group, steer, frontWheel, rearWheel, crank, pedalL, pedalR, basketSlot, bell, kick, dispose() }.
 * Spin wheels about X (positive = rolling forward), crank about X, keep pedals level with pedal.rotation.x = -crank.
 */
export function makeBicycle({ shadows = true } = {}) {
  const G = cache.get();
  const mk = (geo, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, matFor(geo));
    m.castShadow = shadows;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const group = new THREE.Group();
  group.name = 'Bicycle';
  mk(G.frame, group, 0.0125);
  const rearWheel = grp(group, 0, BIKE.R, BIKE.rearZ); mk(G.wheel, rearWheel);
  const steer = grp(group, 0, BIKE.steerY, BIKE.steerZ); mk(G.steer, steer, 0.0125);
  const frontWheel = grp(steer, 0, BIKE.R - BIKE.steerY, BIKE.frontZ - BIKE.steerZ); mk(G.wheel, frontWheel);
  const crank = grp(group, 0, BIKE.crankY, BIKE.crankZ); mk(G.crank, crank, 0.0125);
  const pedalL = grp(crank, 0.14, BIKE.crankR, 0); mk(G.pedal, pedalL, 0.0125);
  const pedalR = grp(crank, -0.12, -BIKE.crankR, 0); mk(G.pedal, pedalR, 0.0125);
  const basketSlot = grp(steer, 0, BIKE.basketY - BIKE.steerY + FV, BIKE.basketZ - BIKE.steerZ);
  const bell = grp(steer, BIKE.bellX, BIKE.bellY - BIKE.steerY, BIKE.bellZ - BIKE.steerZ); mk(G.bell, bell, 0.0125);
  const kick = grp(group, 0.07, 0.24, -0.1); mk(G.kick, kick);
  kick.rotation.x = -1.4;
  return { group, steer, frontWheel, rearWheel, crank, pedalL, pedalR, basketSlot, bell, kick, dispose: () => cache.release() };
}
void hash3;
