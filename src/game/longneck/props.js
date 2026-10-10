// [v26 turtle] Old Longneck's front yard at the falls (the stone house shell
// itself is the world's, world/deepZone.js): stone lanterns, a low stone tea
// table, a bamboo pole of wind chimes by the water curtain, stepping stones
// that lead in under the falls to his door, a tiny dock, lily pads and a moss
// pouf for visitors. Fine 0.025 voxels, geometry shared between builds.
//
//   const P = makeLongneckYard(game, v);   // P.group (origin at v, on the ground), P.group.userData.door, P.update(dt)
import * as THREE from 'three';
import { FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, matFor, grainMaterial, sin, cos, abs, PI } from '../../entities/critterKit.js';
import { DEEP_HOUSE } from '../../world/worldgen.js';

const C = {
  stone: 0x8e9286, stoneD: 0x6c7066, stoneL: 0xaab0a2, moss: 0x4f9a3c, mossD: 0x3a7a2e, mossL: 0x7cc256,
  glow: 0xffd070, glowD: 0xe8a840, clay: 0x8a5a3a, clayD: 0x6a4028, clayL: 0xb07a52, tea: 0x8aa846,
  bamboo: 0x9ab85a, bambooD: 0x6e8a3a, bambooL: 0xbcd47a, brass: 0xd8b04a, brassD: 0xa8822a, string: 0xe8dcc0,
  wood: 0x8a6a44, woodD: 0x6a4e30, woodL: 0xa8845a, pad: 0x4e9a3a, padD: 0x3a7a2c, padL: 0x76c056, lotus: 0xf2a6c4, lotusL: 0xfff0f6, lotusY: 0xffd84a,
};
const geoMemo = new Map();
const memo = (key, build, pivot = [0, 0, 0]) => { let g = geoMemo.get(key); if (!g) { g = buildGeo(build(), pivot, FV); geoMemo.set(key, g); } return g; };
const meshOf = (geo, emissive = 0) => {
  const m = new THREE.Mesh(geo, emissive ? grainMaterial(geo.userData.scale, geo.userData.grain, 0.04, emissive) : matFor(geo));
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
const stoneCol = (x, y, z) => (hash3(x, y, z) < 0.12 ? C.moss : tone(x, y, z, C.stone, C.stoneD, C.stoneL, 0.14, 0.1));

function lanternModel() {
  const v = new VoxelModel();
  rbox(v, -6, 5, 0, 1, -6, 5, 1.2, stoneCol); // foot
  rbox(v, -2, 1, 2, 11, -2, 1, 0.8, stoneCol); // pillar
  rbox(v, -5, 4, 12, 13, -5, 4, 1, stoneCol); // shelf
  // the fire box: posts at the corners, open windows (glow goes inside)
  for (const x of [-5, 4]) for (const z of [-5, 4]) for (let y = 14; y <= 20; y++) v.set(x, y, z, stoneCol(x, y, z));
  rbox(v, -8, 7, 21, 22, -8, 7, 1.6, stoneCol); // the hat
  rbox(v, -5, 4, 23, 24, -5, 4, 1.2, stoneCol);
  rbox(v, -1, 0, 25, 27, -1, 0, 0.5, stoneCol); // the knob
  // moss on the hat
  for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) if (v.has(x, 22, z) && !v.has(x, 23, z) && hash3(x, 5, z) < 0.45) v.set(x, 23, z, hash3(x, 6, z) < 0.5 ? C.moss : C.mossL);
  return v;
}
function lanternGlow() {
  const v = new VoxelModel();
  rbox(v, -4, 3, 14, 20, -4, 3, 1, (x, y) => (y > 18 ? C.glowD : C.glow));
  return v;
}
function teaTableModel() {
  const v = new VoxelModel();
  rbox(v, -3, -1, 0, 5, -2, 1, 0.8, stoneCol); rbox(v, 0, 2, 0, 5, -2, 1, 0.8, stoneCol);
  rbox(v, -9, 8, 6, 8, -7, 6, 2.2, (x, y, z) => (y === 8 && hash3(x, y, z) < 0.08 ? C.mossL : tone(x, y, z, C.stoneL, C.stone, C.stoneL, 0.2, 0.1)));
  return v;
}
function teapotModel() {
  const v = new VoxelModel();
  ell(v, 0, 3, 0, 4, 3.2, 4, (x, y, z) => tone(x, y, z, C.clay, C.clayD, C.clayL, 0.15, 0.12));
  v.set(-1, 6, 0, C.clayD).set(0, 6, 0, C.clayD).set(0, 7, 0, C.clayL);
  for (let k = 0; k < 3; k++) v.set(4 + k, 3 + k, 0, C.clay); // spout
  v.set(-5, 4, 0, C.clayD).set(-5, 3, 0, C.clayD).set(-5, 2, 0, C.clayD); // handle
  return v;
}
function bowlModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 2; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > 2.2 + y * 0.2) continue;
    v.set(x, y, z, y === 2 && r < 1.6 ? C.tea : tone(x, y, z, C.clay, C.clayD, C.clayL, 0.2, 0.1));
  }
  return v;
}
function poleModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 44; y++) { const node = y % 9 === 0; v.set(0, y, 0, node ? C.bambooD : tone(0, y, 0, C.bamboo, C.bambooD, C.bambooL, 0.1, 0.2)); v.set(-1, y, 0, node ? C.bambooD : C.bamboo); v.set(0, y, -1, node ? C.bambooD : C.bambooD); v.set(-1, y, -1, C.bamboo); }
  // the crossbar the chimes hang from, out towards +x
  for (let x = 1; x <= 14; x++) v.set(x, 42, 0, x % 5 === 0 ? C.bambooD : C.bamboo).set(x, 42, -1, C.bambooD);
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, 45, z, C.bambooD); // cap
  return v;
}
function chimeModel(len) {
  // a string + a brass tube hanging from y = 0 down
  const v = new VoxelModel();
  for (let y = -1; y >= -3; y--) v.set(0, y, 0, C.string);
  for (let y = -4; y >= -4 - len; y--) v.set(0, y, 0, y === -4 ? C.brassD : C.brass);
  return v;
}
function stoneStepModel(seed) {
  const v = new VoxelModel();
  ell(v, 0, 0.5, 0, 6 + (seed % 2), 1.6, 5, (x, y, z) => (y < 0 ? null : hash3(x + seed, y, z) < 0.15 ? C.mossL : tone(x + seed, y, z, C.stone, C.stoneD, C.stoneL, 0.15, 0.12)));
  return v;
}
function dockModel() {
  // planks across +z, two rows of posts going down into the water
  const v = new VoxelModel();
  const L = 60;
  for (let z = 0; z < L; z++) {
    const gap = z % 6 === 5;
    for (let x = -10; x <= 9; x++) if (!gap) v.set(x, 0, z, (z / 6 | 0) % 2 ? tone(x, 0, z, C.wood, C.woodD, C.woodL, 0.12, 0.1) : tone(x, 0, z, C.woodL, C.wood, C.woodL, 0.12, 0.05));
  }
  for (const x of [-10, 8]) for (const z of [2, 30, 57]) for (let y = -30; y <= 2; y++) { v.set(x, y, z, C.woodD); v.set(x + 1, y, z, C.wood); }
  return v;
}
function padModel(flower) {
  const v = new VoxelModel();
  for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > 6.8 || (x >= 0 && abs(z + 0.5) < 0.9)) continue; // the notch
    v.set(x, 0, z, r > 5.6 ? C.padD : hash3(x, 0, z) < 0.2 ? C.padL : C.pad);
  }
  if (flower) {
    for (const [x, z] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) v.set(x, 1, z, C.lotusY);
    for (const [x, z] of [[-2, -1], [1, 0], [-1, -2], [0, 1], [-2, 0], [1, -1], [-1, 1], [0, -2]]) { v.set(x, 1, z, C.lotus); v.set(x, 2, z, (x + z) % 2 ? C.lotusL : C.lotus); }
  }
  return v;
}
function poufModel() {
  const v = new VoxelModel();
  ell(v, 0, 2.5, 0, 6.5, 3.4, 6, (x, y, z) => (y < 0 ? null : tone(x, y, z, C.moss, C.mossD, C.mossL, 0.2, 0.2)));
  return v;
}

/** Build the yard for villager v (origin at v on the ground). */
export function makeLongneckYard(game, v) {
  const g = game.grid;
  const root = new THREE.Group();
  root.name = 'LongneckYard';
  const y0 = g.groundAt(v.x, v.z);
  const at = (obj, wx, wz, ry = 0, dy = 0, water = false) => {
    const gy = water ? -0.1 : g.groundAt(wx, wz);
    obj.position.set(wx - v.x, gy - y0 + dy, wz - v.z);
    obj.rotation.y = ry;
    root.add(obj);
    return obj;
  };
  // two stone lanterns, one each side of the falls
  const lanterns = [];
  for (const [x, z, ry] of [[37.8, 195.75, 0.3], [31.7, 195.8, -0.3]]) {
    const L = new THREE.Group();
    L.add(meshOf(memo('ln_lantern', lanternModel, [0.5, 0, 0.5])));
    const glow = meshOf(memo('ln_lglow', lanternGlow, [0.5, 0, 0.5]), 0xb07020);
    L.add(glow);
    lanterns.push(glow);
    at(L, x, z, ry);
  }
  // the low tea table with a pot and two bowls
  const tt = new THREE.Group();
  tt.add(meshOf(memo('ln_table', teaTableModel, [0.5, 0, 0.5])));
  const pot = meshOf(memo('ln_pot', teapotModel, [0.5, 0, 0.5])); pot.position.set(-0.06, 9 * FV, -0.02); pot.rotation.y = 0.6;
  const b1 = meshOf(memo('ln_bowl', bowlModel, [0.5, 0, 0.5])); b1.position.set(0.13, 9 * FV, 0.07);
  const b2 = meshOf(memo('ln_bowl', bowlModel, [0.5, 0, 0.5])); b2.position.set(-0.15, 9 * FV, 0.11);
  tt.add(pot, b1, b2);
  at(tt, 37.45, 196.9, -0.25);
  // wind chimes by the curtain of water
  const pole = new THREE.Group();
  pole.add(meshOf(memo('ln_pole', poleModel)));
  const chimes = [];
  [7, 11, 9, 13].forEach((len, i) => {
    const c = meshOf(memo('ln_chime' + len, () => chimeModel(len)));
    const piv = new THREE.Group();
    piv.position.set((4 + i * 3) * FV, 42 * FV, 0);
    piv.add(c);
    pole.add(piv);
    chimes.push(piv);
  });
  at(pole, 36.05, 195.5, Math.PI * 0.9);
  // stepping stones in under the falls, to his door
  [[35.55, 195.98], [35.0, 195.72], [34.5, 195.5]].forEach(([x, z], i) => at(meshOf(memo('ln_step' + (i % 2), () => stoneStepModel(i % 2), [0.5, 0, 0.5])), x, z, i * 0.7, 0.01));
  // a tiny dock out into his pond
  at(meshOf(memo('ln_dock', dockModel, [0.5, 0, 0])), 36.75, 196.95, 0, 0.12, true);
  // lily pads, one in flower
  at(meshOf(memo('ln_pad1', () => padModel(true), [0.5, 0, 0.5])), 38.1, 198.7, 0.4, 0.02, true);
  at(meshOf(memo('ln_pad0', () => padModel(false), [0.5, 0, 0.5])), 37.6, 199.5, 2.1, 0.02, true);
  at(meshOf(memo('ln_pad0', () => padModel(false), [0.5, 0, 0.5])), 39.0, 199.2, 4.0, 0.02, true);
  // a moss pouf for visitors (the audience naps on it)
  at(meshOf(memo('ln_pouf', poufModel, [0.5, 0, 0.5])), 38.25, 196.75, 0);
  // the door, behind the water
  const [dx, dz] = DEEP_HOUSE.door;
  root.userData.door = new THREE.Vector3(dx - v.x, DEEP_HOUSE.y - y0, dz - v.z);
  root.userData.pouf = new THREE.Vector3(38.25, g.groundAt(38.25, 196.75) + 6.5 * FV, 196.75);
  root.userData.chimeAt = new THREE.Vector3(36.05, g.groundAt(36.05, 195.5) + 1.0, 195.5);
  let t = 0;
  const update = (dt) => {
    t += dt;
    chimes.forEach((c, i) => { c.rotation.z = sin(t * 0.9 + i * 1.7) * 0.12 + sin(t * 2.3 + i) * 0.04; c.rotation.x = cos(t * 0.7 + i * 2.1) * 0.08; });
    const f = 0.85 + 0.15 * sin(t * 7.1) * sin(t * 3.3 + 1);
    for (const L of lanterns) L.scale.setScalar(0.98 + 0.03 * f);
  };
  void PI;
  return { group: root, update };
}
