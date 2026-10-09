// [v26 resort] Little voxel things bears wear / carry after a facility visit:
// a striped towel round the neck, a fluffy spa robe (built to fit each bear's
// torso), cucumber slices on the eyes, an ice cream cone, a foam fish hat, a
// toasted marshmallow on a stick. Attach them to BearRig anchors (rig._anchor:
// children are in world units at bear scale 1).
//
//   attachProp(rig, kind, opts) -> Object3D (already parented), kinds:
//     'towel' (opts.color) | 'robe' | 'cucumbers' | 'cone' | 'hat' | 'mallow'
//   detachProp(obj)
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';

const U = 1 / 32; // prop voxel (half a bear voxel)
const TOWEL_COLS = [0xf06a8a, 0x5ab0e8, 0xf2c230, 0x6ac87a, 0xb48aff];
const geoCache = new Map();
const robeCache = new WeakMap();

function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make().build({ scale: U }); geoCache.set(key, g); }
  return g;
}

function towelModel(ci) {
  const v = new VoxelModel();
  const col = TOWEL_COLS[ci % TOWEL_COLS.length];
  // ring round the neck (behind the head) + two ends hanging down the chest
  for (let a = 0; a < 96; a++) {
    const t = (a / 96) * Math.PI * 2;
    const x = Math.round(Math.cos(t) * 13.5), z = Math.round(Math.sin(t) * 11.5);
    for (let y = 0; y <= 2; y++) v.set(x, y, z, (a % 12 < 2) ? 0xffffff : col);
  }
  for (const sx of [-1, 1]) for (let y = -11; y <= 1; y++) for (let k = 0; k < 4; k++) {
    const x = sx * (4 + k), z = 12 + (y < -4 ? 1 : 0);
    v.set(x, y, z, y === -8 || y === -10 ? 0xffffff : y === -11 ? 0xe8e4dc : col);
  }
  return v;
}

function cucumberModel() {
  const v = new VoxelModel();
  for (const cx of [-5, 5]) for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) {
    const r = Math.hypot(x, y);
    if (r > 3.3) continue;
    v.set(cx + x, y, 0, r > 2.4 ? 0x3a8a3a : r < 0.8 ? 0xb8e090 : (x + y) % 3 === 0 ? 0xd8f0b0 : 0xc8ea98);
  }
  return v;
}

function coneModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 8; y++) { const r = y * 0.35; for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (Math.hypot(x, z) <= r + 0.3) v.set(x, y, z, (x + y + z) % 3 === 0 ? 0xb87a3a : 0xd8a050); }
  for (let x = -4; x <= 4; x++) for (let y = 9; y <= 15; y++) for (let z = -4; z <= 4; z++) {
    const lo = Math.hypot(x, (y - 11) * 1.1, z) <= 3.8, hi = Math.hypot(x, (y - 14.5) * 1.1, z) <= 2.9;
    if (lo) v.set(x, y, z, 0xa8e8c8);
    else if (hi) v.set(x, y, z, 0xf8a8c8);
  }
  v.set(0, 17, 0, 0xd82a3a); v.set(0, 18, 0, 0x3a8a3a);
  return v;
}

function hatModel() {
  const v = new VoxelModel();
  // a big yellow foam fish lying across the head, tail up
  for (let x = -9; x <= 7; x++) for (let y = 0; y <= 6; y++) for (let z = -4; z <= 4; z++) {
    const body = ((x + 1) / 8) ** 2 + ((y - 3) / 3.4) ** 2 + (z / 4) ** 2 <= 1;
    if (body) v.set(x, y, z, y >= 5 ? 0xffe070 : (x + z) % 4 === 0 ? 0xf0b830 : 0xf8c840);
  }
  for (let y = 2; y <= 9; y++) for (let k = 0; k <= Math.abs(y - 5); k++) { v.set(-10 - k, y, 0, 0xf08a3a); }
  for (const z of [-4, 4]) { v.set(5, 4, z, 0xffffff); v.set(5, 4, z + (z > 0 ? 1 : -1), 0x1a1a1a); }
  for (let x = -4; x <= 2; x++) v.set(x, 7, 0, 0xf08a3a); // dorsal fin
  return v;
}

function mallowModel() {
  const v = new VoxelModel();
  for (let k = 0; k <= 22; k++) v.set(0, k, Math.round(k * 0.35), 0xb8864a);
  for (let x = -2; x <= 2; x++) for (let y = 23; y <= 27; y++) for (let z = 7; z <= 11; z++) v.set(x, y, z, y === 23 || x === 2 ? 0xc8884a : 0xf8f0e4);
  return v;
}

// ---- the robe: a terry shell round this bear's torso + belly (bearRig.js shapes)
const se = (x, y, z, cx, cy, cz, rx, ry, rz, p) => Math.pow(Math.abs(x - cx) / rx, p) + Math.pow(Math.abs(y - cy) / ry, p) + Math.pow(Math.abs(z - cz) / rz, p);
function inBody(L, x, y, z, grow) {
  const t = L.T, b = L.BL;
  const rx = t.rx - Math.max(0, y + 0.5 - (t.taperY ?? 14.6)) * (t.taper ?? 0.42);
  if (se(x, y + 0.5, z, t.cx, t.cy, t.cz, rx + grow, t.ry + grow * 0.6, t.rz + grow, t.p) <= 1) return true;
  if (b && z >= 0 && se(x, y + 0.5, z, b.cx, b.cy, b.cz, b.rx + grow, b.ry + grow, b.rz + grow, b.p) <= 1) return true;
  return false;
}
function robeGeometry(L) {
  let g = robeCache.get(L);
  if (g) return g;
  const v = new VoxelModel();
  const N = L.neckY ?? 17, TRIM = 0x7ac8c0;
  const top = N - 1, bot = 6;
  for (let y = bot; y <= top; y++) for (let x = -12; x <= 12; x++) for (let z = -10; z <= 12; z++) {
    if (!inBody(L, x, y, z, 1.5) || inBody(L, x, y, z, 0.4)) continue;
    if (Math.abs(x) >= 6.5 && y >= 13) continue; // armholes
    const vee = z > 1 && y > top - 6 && Math.abs(x + 0.5) < (y - (top - 7)) * 0.75;
    if (vee) continue;
    const edge = z > 1 && y > top - 7 && Math.abs(x + 0.5) < (y - (top - 7)) * 0.75 + 1.3;
    let c = (x + y + z) % 2 ? 0xf6f2ea : 0xebe5d8;
    if (edge || y === bot) c = TRIM;
    if (y === 9 || y === 10) c = y === 10 ? 0xf0ece0 : 0xe2dccc; // sash
    v.set(x, y, z, c);
  }
  // sash knot + tails on the front left
  for (const [x, y, dz] of [[-3, 9, 1], [-3, 10, 1], [-4, 9, 1], [-4, 8, 1], [-4, 7, 1], [-2, 8, 1], [-2, 7, 1]]) {
    let z = 12; while (z > -2 && !v.has(x, y, z)) z--;
    v.set(x, y, z + dz, 0xe8e2d4);
  }
  g = v.build({ pivot: [0.5, 10, 0.5], scale: 0.0625 });
  robeCache.set(L, g);
  return g;
}

function boneIdx(rig, name) { return rig.bones.findIndex((b) => b.name === name); }

function mesh(geo) {
  const m = new THREE.Mesh(geo, voxelMaterial());
  m.castShadow = true;
  return m;
}

export function attachProp(rig, kind, o = {}) {
  if (!rig || !rig._anchor) return null;
  const L = rig.look || {};
  let a = null, m = null;
  switch (kind) {
    case 'towel': {
      a = rig._anchor(boneIdx(rig, 'spine'), 0, (L.neckY ?? 17) - 0.5, 0.3);
      m = mesh(cached('towel' + (o.color | 0), () => towelModel(o.color | 0)));
      break;
    }
    case 'robe': {
      a = rig._anchor(boneIdx(rig, 'spine'), 0, 10, 0);
      if (!L.T) return null;
      m = mesh(robeGeometry(L));
      break;
    }
    case 'cucumbers': {
      a = rig._anchor(boneIdx(rig, 'head'), 0, 23.4, 10.2);
      m = mesh(cached('cuke', cucumberModel));
      break;
    }
    case 'cone': {
      a = rig.handAnchorL;
      m = mesh(cached('cone', coneModel));
      m.position.set(0, 0.02, 0.04);
      break;
    }
    case 'mallow': {
      a = rig.handAnchorL;
      m = mesh(cached('mallow', mallowModel));
      m.rotation.x = 0.5;
      break;
    }
    case 'hat': {
      a = rig.topAnchor;
      m = mesh(cached('hat', hatModel));
      m.position.y = -0.06;
      m.rotation.y = 0.3;
      break;
    }
    default: return null;
  }
  if (!a || !m) return null;
  if (kind === 'towel' || kind === 'robe' || kind === 'cucumbers') a.userData.rsMade = true;
  m.name = 'rs_' + kind;
  a.add(m);
  m.userData.anchor = a;
  return m;
}

export function detachProp(obj) {
  if (!obj) return;
  const a = obj.userData.anchor;
  obj.parent?.remove(obj);
  // anchors made just for the prop go too (hand/top anchors belong to the rig)
  if (a && a.userData.rsMade && a.children.length === 0) a.parent?.remove(a);
}
