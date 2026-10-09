// [F&S industry] Voxel models for the "Flint & Steel" industry builds
// (src/data/structuresIndustry.js). Loaded by StructureSystem through
// import.meta.glob('../entities/extra/*.js') (STRUCTURE_MODELS).
//
//   STRUCTURE_MODELS[type]({ variant, seed, preview }) -> THREE.Group
//     Root at the ground centre of the footprint, front faces +Z, 1 tile = 1 unit,
//     built from 0.05 "fine" voxels. Lit meshes share voxelMaterial() (tintable),
//     glow meshes are unlit (userData.glow).
//   root.userData.st      state written by src/game/Industry.js every frame:
//                          { on: running, k: speed 0..2, lamp: 'on'|'idle'|'off'|'warn' }
//   root.userData.update(dt, t)   animates from st (called by StructureSystem)
//   root.userData.fx      { smoke: [[x,y,z]...] local chimney tops, out: [x,y,z] output spot }
//   extra hooks per type (all optional): aim(yaw) fire() swing() dispense() pulse() setDepth(d)
// makeDrone() -> { root, update(dt, t, carrying) } the Auto-Hauler's flying drone
// makeBeltItem(id) -> THREE.Object3D   a small ore chunk / ingot / part riding a belt
import * as THREE from 'three';
import { VoxelModel, voxelMaterial, shade } from '../../core/voxel.js';
import { hash3 } from '../../core/rng.js';
import { gear, ball, text, textW, glowMaterial, glassMaterial, P } from './facilityModels.js';

const VF = 0.05;
const PI = Math.PI, TAU = PI * 2;

// ---------------------------------------------------------------- palette
const BRICK = [0xa8503a, 0x984632, 0xb85c42, 0x9c4a36];
const BRICK_D = 0x6a2e22, MORTAR = 0xc8b8a0;
const STONE = [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72];
const CONC = [0xb8b4aa, 0xaaa69c, 0xc4c0b6];
const IRON = 0x3a3a42, IRON_L = 0x5a5a64, IRON_D = 0x26262c;
const STEEL = 0x8c92aa, STEEL_L = 0xbcc2d4, STEEL_D = 0x5e6478;
const COPPER = 0xc86a3a, COPPER_L = 0xe8945a, COPPER_D = 0x8a4224;
const BRASS = P.BRASS, BRASS_D = P.BRASS_D, BRASS_L = P.BRASS_L;
const HAZ_Y = 0xf2c230, HAZ_K = 0x2a2a2e;
const RED = 0xc8362c, RED_D = 0x92241e, RED_L = 0xe85a46;
const GREEN = 0x4aa84a, GREEN_D = 0x2e7a34, GREEN_L = 0x8ad06a;
const WHITE = 0xf2f0ea, CREAM = 0xe8dcc0;
const WOOD = [0xa8784a, 0xb48452, 0x9a6a3e], WOOD_D = 0x6a4424;
const LEATHER = 0x6a3a22, LEATHER_L = 0x8a5030;
const COAL = [0x2a2830, 0x34323a, 0x222026, 0x3e3c46];
const FIRE = [0xfff0a0, 0xffd040, 0xff9a20, 0xff6a10];
const RUBBER = 0x2c2a30, RUBBER_L = 0x46444c;
const BLUE = 0x3c78c8, BLUE_D = 0x2a5a9a, BLUE_L = 0x6ca8e8;
const GLASS_TINT = 0xa6d4ec;

const hv = (x, y, z, s = 0) => hash3(x * 7 + s, y * 13 - s, z * 5 + s * 3);
const pickT = (arr, x, y, z, s = 0) => arr[Math.floor(hv(x, y, z, s) * arr.length) % arr.length];
const brick = (x, y, z) => {
  // running bond: courses 3 voxels tall, bricks 6 long, offset every other course
  const row = Math.floor(y / 3);
  const u = (x + z + (row % 2) * 3) % 6;
  if (y % 3 === 2 || ((u + 6) % 6) === 0) return MORTAR;
  return pickT(BRICK, Math.floor((x + z + (row % 2) * 3) / 6), row, 0);
};
const hazard = (x, y) => (((x + y) >> 1) & 1 ? HAZ_Y : HAZ_K);

// ---------------------------------------------------------------- draft parts
class Part {
  constructor(name, pivot = [0, 0, 0], o = {}) {
    this.name = name; this.pivot = pivot; this.o = o;
    this.f = new VoxelModel(); // lit
    this.g = new VoxelModel(); // glow
    this.gl = new VoxelModel(); // glass
    this.parts = [];
  }
  part(name, pivot, o) { const p = new Part(name, pivot, o); this.parts.push(p); return p; }
}
// world (model) position of a fine voxel's centre
const at = (x, y, z) => [(x + 0.5) * VF, (y + 0.5) * VF, (z + 0.5) * VF];

function bake(p) {
  // glow voxels win over lit voxels in the same cell
  for (const k of p.g.vox.keys()) p.f.vox.delete(k);
  const piv = [p.pivot[0] / VF, p.pivot[1] / VF, p.pivot[2] / VF];
  const layers = [];
  if (p.f.vox.size) layers.push({ kind: 'lit', geo: p.f.build({ pivot: piv, scale: VF }) });
  if (p.g.vox.size) layers.push({ kind: 'glow', geo: p.g.build({ pivot: piv, scale: VF, ao: false }) });
  if (p.gl.vox.size) layers.push({ kind: 'glass', geo: p.gl.build({ pivot: piv, scale: VF, ao: false }) });
  return { name: p.name, pivot: p.pivot, o: p.o, layers, parts: p.parts.map(bake) };
}
function meshOf(l) {
  const m = new THREE.Mesh(l.geo, l.kind === 'lit' ? voxelMaterial() : l.kind === 'glow' ? glowMaterial() : glassMaterial());
  m.castShadow = l.kind === 'lit';
  m.receiveShadow = l.kind !== 'glow';
  m.userData.tintable = l.kind === 'lit';
  if (l.kind === 'glow') m.userData.glow = true;
  if (l.kind === 'glass') { m.userData.glass = true; m.renderOrder = 2; }
  return m;
}
function instance(rec, parentPiv, named) {
  const g = new THREE.Group();
  g.position.set(rec.pivot[0] - parentPiv[0], rec.pivot[1] - parentPiv[1], rec.pivot[2] - parentPiv[2]);
  for (const l of rec.layers) g.add(meshOf(l));
  for (const c of rec.parts) g.add(instance(c, rec.pivot, named));
  if (rec.name) named[rec.name] = g;
  g.userData.base = g.position.clone();
  return g;
}
const RECS = new Map();
function cached(key, build) {
  let r = RECS.get(key);
  if (!r) { const root = new Part(null); build(root); r = bake(root); RECS.set(key, r); }
  return r;
}

// status lamp: little bulb on a stalk, three coloured glow bulbs toggled by state
const LAMP_GEO = new THREE.BoxGeometry(VF * 2, VF * 2, VF * 2);
const LAMP_MATS = { on: new THREE.MeshBasicMaterial({ color: 0x6aff6a }), idle: new THREE.MeshBasicMaterial({ color: 0xffc040 }), warn: new THREE.MeshBasicMaterial({ color: 0xff4a3a }), off: new THREE.MeshBasicMaterial({ color: 0x3a3a3a }) };
function addLamp(root, x, y, z) {
  const m = new THREE.Mesh(LAMP_GEO, LAMP_MATS.off);
  m.position.set(x, y, z);
  m.userData.glow = true;
  root.add(m);
  return m;
}

// common wrapper: instance a recipe, attach state + lamp + an update that only
// advances the machine clock while it runs (so gears spin up / wind down)
function machine(key, build, { lamp = null, fx = {}, anim } = {}) {
  const rec = cached(key, build);
  const named = {};
  const root = instance(rec, [0, 0, 0], named);
  root.name = key;
  const st = { on: false, k: 1, lamp: 'off' };
  root.userData.st = st;
  root.userData.parts = named;
  root.userData.fx = fx;
  const bulb = lamp ? addLamp(root, lamp[0], lamp[1], lamp[2]) : null;
  let clock = 0, vel = 0, blink = 0;
  root.userData.update = (dt, t) => {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const target = st.on ? Math.max(0.2, st.k || 1) : 0;
    vel += (target - vel) * Math.min(1, dt * 2.5);
    clock += dt * vel;
    blink += dt;
    if (bulb) {
      const l = st.lamp || 'off';
      bulb.material = l === 'warn' ? (Math.sin(blink * 6) > 0 ? LAMP_MATS.warn : LAMP_MATS.off) : LAMP_MATS[l] || LAMP_MATS.off;
    }
    anim?.(named, clock, vel, dt, t || 0, st, root);
  };
  root.userData.update(0, 0);
  return root;
}

// ---------------------------------------------------------------- shared bits
function cylY(v, cx, cz, r, y0, y1, col) {
  for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++)
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r); z++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > r) continue;
      for (let y = y0; y <= y1; y++) v.set(x, y, z, typeof col === 'function' ? col(x, y, z, d) : col);
    }
}
function cylX(v, cy, cz, r, x0, x1, col) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++)
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r); z++) {
      const d = Math.hypot(y + 0.5 - cy, z + 0.5 - cz);
      if (d > r) continue;
      for (let x = x0; x <= x1; x++) v.set(x, y, z, typeof col === 'function' ? col(x, y, z, d) : col);
    }
}
function cylZ(v, cx, cy, r, z0, z1, col) {
  for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++)
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      for (let z = z0; z <= z1; z++) v.set(x, y, z, typeof col === 'function' ? col(x, y, z, d) : col);
    }
}
// a wheel in the y-z plane (spins round x), centred on (cy, cz)
function wheelX(v, x0, x1, cy, cz, rOut, col, { spokes = 6, rim = 1.4, hub = IRON } = {}) {
  const R = Math.ceil(rOut) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) {
      const dy = y + 0.5 - cy, dz = z + 0.5 - cz, r = Math.hypot(dy, dz);
      if (r > rOut) continue;
      let c = null;
      if (r > rOut - rim) c = col;
      else if (r < 1.6) c = hub;
      else {
        const a = Math.atan2(dy, dz), k = (a * spokes) / TAU;
        if (Math.abs(k - Math.round(k)) < 0.12) c = shade(col, 0.85);
      }
      if (c != null) for (let x = x0; x <= x1; x++) v.set(x, y, z, c);
    }
}
function rivetsRingX(v, x, cy, cz, r, n, col) {
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; v.set(x, Math.round(cy + Math.sin(a) * r - 0.5), Math.round(cz + Math.cos(a) * r - 0.5), col); }
}
function slab(v, x0, x1, z0, z1, y = 0, tones = STONE) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    v.set(x, y, z, edge ? shade(pickT(tones, x, y, z), 0.85) : pickT(tones, x >> 2, y, z >> 2));
  }
}
function grassTufts(v, n, x0, x1, z0, z1, seed, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(hv(i, seed, 1) * (x1 - x0 + 1)), z = z0 + Math.floor(hv(i, seed, 2) * (z1 - z0 + 1));
    if (avoid(x, z) || v.has(x, 0, z)) continue;
    const h = 1 + Math.floor(hv(i, seed, 3) * 3);
    for (let y = 0; y < h; y++) v.set(x, y, z, pickT(P.GRASS, x, y, z));
  }
}
function plaque(v, s, xc, yTop, z, bg, ink, pad = 1) {
  const w = textW(s);
  const x0 = Math.round(xc - w / 2);
  v.box(x0 - pad, yTop - 4 - pad, z, x0 + w - 1 + pad, yTop + pad, z, bg);
  text(v, s, x0, yTop, z + 1, ink);
}

// ================================================================ SMELTER (2x2)
// A brick furnace with a tall chimney, glowing mouth, leather bellows, a crucible
// that tips molten metal into ingot moulds, a coal pile and a stack of ingots.
function buildSmelter(R) {
  const f = R.f, g = R.g;
  slab(f, -19, 18, -19, 18, 0, CONC);
  // furnace body (bricks) with a domed top
  for (let x = -15; x <= 5; x++) for (let z = -16; z <= 3; z++) for (let y = 1; y <= 22; y++) {
    const shell = x === -15 || x === 5 || z === -16 || z === 3 || y === 22;
    if (shell) f.set(x, y, z, brick(x, y, z));
  }
  for (let y = 23; y <= 28; y++) {
    const k = (y - 22) * 1.6;
    for (let x = -15 + Math.floor(k); x <= 5 - Math.floor(k); x++) for (let z = -16 + Math.floor(k); z <= 3 - Math.floor(k); z++) f.set(x, y, z, y === 28 ? IRON_L : brick(x, y, z));
  }
  // iron corner straps + base course
  for (const x of [-15, 5]) for (const z of [-16, 3]) for (let y = 1; y <= 22; y++) f.set(x, y, z, y % 6 === 0 ? IRON_L : IRON);
  for (let x = -15; x <= 5; x++) { f.set(x, 1, 3, BRICK_D); f.set(x, 1, -16, BRICK_D); }
  // furnace mouth (arched opening, glowing coals inside)
  for (let x = -9; x <= -1; x++) for (let y = 3; y <= 12; y++) {
    const arch = y > 9 && Math.abs(x + 5) > 4 - (y - 9) * 1.3;
    if (arch) continue;
    f.set(x, y, 3, null); f.set(x, y, 2, null);
  }
  for (let x = -10; x <= 0; x++) { f.set(x, 13, 3, BRICK_D); f.set(x, 13, 4, BRICK_D); }
  for (const x of [-10, 0]) for (let y = 3; y <= 12; y++) f.set(x, y, 4, BRICK_D);
  const fire = R.part('fire', at(-5, 4, 2));
  for (let x = -9; x <= -1; x++) for (let y = 3; y <= 11; y++) {
    if (y > 9 && Math.abs(x + 5) > 4 - (y - 9) * 1.3) continue;
    const h = hv(x, y, 7);
    const c = y <= 4 ? FIRE[3] : y <= 6 ? FIRE[h < 0.5 ? 2 : 1] : y <= 8 ? FIRE[h < 0.4 ? 1 : 0] : FIRE[h < 0.6 ? 2 : 3];
    fire.g.set(x, y, 1, c);
  }
  fire.g.box(-9, 3, 0, -1, 3, 0, FIRE[3]);
  // glowing coals on the sill
  for (let x = -8; x <= -2; x += 2) g.set(x, 3, 3, FIRE[2]);
  // brass plate above the mouth with an ingot pictogram
  f.box(-10, 15, 4, 0, 20, 4, BRASS_D); f.box(-9, 16, 5, -1, 19, 5, BRASS);
  f.box(-7, 17, 6, -3, 17, 6, COPPER_D); f.box(-6, 18, 6, -4, 18, 6, COPPER_L);
  // chimney (round brick stack with iron bands)
  cylY(f, -9.5, -10.5, 4.2, 23, 54, (x, y, z) => (y % 9 === 0 ? IRON : y >= 52 ? IRON_D : brick(x, y, z)));
  cylY(f, -9.5, -10.5, 5.2, 55, 56, IRON);
  for (let x = -12; x <= -7; x++) for (let z = -13; z <= -8; z++) if (Math.hypot(x + 0.5 + 9.5, z + 0.5 + 10.5) < 3.2) { f.set(x, 56, z, null); f.set(x, 55, z, null); g.set(x, 54, z, 0x6a2a1a); }
  // bellows on the left wall (squeezed while running)
  f.box(-19, 1, -6, -17, 3, 0, WOOD_D);
  const bel = R.part('bellows', at(-18, 4, -3));
  for (let y = 4; y <= 9; y++) for (let x = -19; x <= -16; x++) for (let z = -6; z <= 0; z++) {
    const top = y === 9, ridge = y % 2 === 0;
    const inside = x > -19 && x < -16 && z > -6 && z < 0 && !top;
    if (inside) continue;
    bel.f.set(x, y, z, top ? WOOD[1] : ridge ? LEATHER_L : LEATHER);
  }
  bel.f.box(-20, 10, -4, -20, 10, -2, WOOD_D); bel.f.box(-21, 10, -3, -20, 13, -3, WOOD_D);
  f.box(-16, 6, -3, -16, 6, -3, BRASS); // nozzle into the wall
  // crucible gantry on the right with a tipping pot
  for (const x of [8, 17]) { f.box(x, 1, -2, x, 18, -1, IRON); f.box(x, 1, -3, x, 2, 0, IRON_L); }
  f.box(8, 19, -2, 17, 19, -1, IRON_L);
  const pot = R.part('pot', at(12, 14, -2));
  for (let x = 9; x <= 16; x++) for (let y = 8; y <= 15; y++) for (let z = -6; z <= 2; z++) {
    const d = Math.hypot((x + 0.5 - 12.5) / 3.8, (y + 0.5 - 12.5) / 4.2, (z + 0.5 + 2) / 3.8);
    if (d > 1) continue;
    if (y >= 14 && d < 0.85) { pot.g.set(x, 14, z, hv(x, 2, z) < 0.5 ? FIRE[1] : FIRE[0]); continue; }
    pot.f.set(x, y, z, d > 0.85 ? (y === 15 ? IRON_L : IRON) : IRON_D);
  }
  pot.f.box(9, 13, -2, 16, 13, -2, null);
  pot.f.box(15, 14, 2, 16, 15, 3, IRON); // pouring lip (toward the moulds)
  // molten stream (shown while pouring)
  const pour = R.part('pour', at(15, 14, 3));
  for (let y = 4; y <= 13; y++) pour.g.set(15, y, 4 + (y < 8 ? 1 : 0), y % 3 ? FIRE[0] : FIRE[1]);
  // ingot moulds on a table in front
  f.box(7, 1, 7, 7, 3, 7, IRON); f.box(17, 1, 7, 17, 3, 7, IRON); f.box(7, 1, 15, 7, 3, 15, IRON); f.box(17, 1, 15, 17, 3, 15, IRON);
  f.box(7, 4, 6, 17, 4, 16, IRON_L);
  for (const mz of [8, 12]) for (const mx of [9, 13]) {
    f.box(mx - 1, 5, mz - 1, mx + 3, 5, mz + 2, IRON_D);
  }
  const molds = R.part('molds', at(12, 5, 11));
  for (const mz of [8, 12]) for (const mx of [9, 13]) molds.g.box(mx, 5, mz, mx + 2, 5, mz + 1, FIRE[1]);
  // cooled ingot stack (back right)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i >> 1); j++) {
    const col = (i + j) % 3 === 0 ? COPPER : (i + j) % 3 === 1 ? STEEL : BRASS;
    const z = -16 + j * 3, y = 1 + i * 2;
    f.box(9 + (i % 2), y, z, 15 - (i % 2), y + 1, z + 1, (x, yy) => (yy === y + 1 ? shade(col, 1.12) : col));
  }
  // coal pile + a shovel
  for (let x = -19; x <= -10; x++) for (let z = 6; z <= 17; z++) {
    const h = 5.5 - Math.hypot((x + 14.5) / 1.1, (z - 11.5) / 1.2) * 0.9 + hv(x, 0, z) * 1.2;
    for (let y = 1; y <= h; y++) f.set(x, y, z, pickT(COAL, x, y, z));
  }
  f.line(-12, 6, 10, -8, 13, 13, WOOD_D); f.box(-13, 4, 9, -12, 6, 10, STEEL);
  grassTufts(f, 18, -19, 18, -19, 18, 11, (x, z) => (x > -16 && x < 18 && z > -17 && z < 17));
}
function smelterAnim(n, clock, vel, dt, t, st) {
  const k = Math.min(1, vel);
  if (n.fire) { const fl = Math.sin(t * 9.3) * 0.5 + Math.sin(t * 15.1) * 0.3; n.fire.scale.set(1, 0.55 + k * 0.45 + fl * 0.08 * (0.3 + k), 1); n.fire.visible = true; }
  if (n.bellows) { const s = Math.sin(clock * 4); n.bellows.scale.y = 1 - 0.18 * k * (s * 0.5 + 0.5); }
  // crucible: rests, tips over (pours), comes back
  const cyc = (clock * 0.35) % 1;
  const tip = cyc < 0.45 ? 0 : cyc < 0.6 ? (cyc - 0.45) / 0.15 : cyc < 0.85 ? 1 : 1 - (cyc - 0.85) / 0.15;
  if (n.pot) n.pot.rotation.x = tip * 0.75 * k;
  if (n.pour) n.pour.visible = k > 0.3 && tip > 0.8;
  if (n.molds) { const glow = cyc > 0.55 ? Math.max(0, 1 - (cyc - 0.55) / 0.45) : 0; n.molds.visible = k > 0.2 && glow > 0.05; n.molds.scale.y = 0.5 + glow; }
  void dt; void st;
}

// ================================================================ MACHINE SHOP (2x2)
// A corrugated tin shed with a sawtooth roof: stamping press, lathe, a big
// flywheel driving it all through a belt, a crane hook with a gear on it.
function buildShop(R) {
  const f = R.f, g = R.g;
  slab(f, -19, 18, -19, 18, 0, CONC);
  const tin = (x, y, z, alongX) => ((alongX ? x : z) % 2 === 0 ? 0x7a8aa0 : 0x6a7a90);
  // back wall + side walls (corrugated)
  for (let x = -19; x <= 18; x++) for (let y = 1; y <= 26; y++) f.set(x, y, -19, tin(x, y, -19, true));
  for (const x of [-19, 18]) for (let z = -19; z <= 6; z++) for (let y = 1; y <= 26; y++) f.set(x, y, z, tin(x, y, z, false));
  // window strip on the side walls
  for (const x of [-19, 18]) for (let z = -15; z <= 1; z++) for (let y = 15; y <= 19; y++) { f.set(x, y, z, null); if (z % 6 === 0 || y === 15 || y === 19) f.set(x, y, z, STEEL_D); else R.gl.set(x, y, z, GLASS_TINT); }
  // sawtooth roof: three teeth facing front, glass on the steep side
  for (let i = 0; i < 3; i++) {
    const z0 = -19 + i * 9;
    for (let dz = 0; dz < 9; dz++) {
      const z = z0 + dz, h = 26 + Math.round((dz / 8) * 7);
      for (let x = -20; x <= 19; x++) {
        f.set(x, h, z, dz % 3 === 0 ? 0x4a5a72 : 0x5a6a84);
        if (dz === 8) for (let y = 27; y < h; y++) { if (x % 5 === 0 || x <= -19 || x >= 18) f.set(x, y, z, STEEL_D); else R.gl.set(x, y, z, GLASS_TINT); }
      }
    }
  }
  for (let x = -20; x <= 19; x++) { f.set(x, 26, 8, 0x4a5a72); f.set(x, 27, 8, HAZ_K); }
  // front posts + sign board on the roof edge
  for (const x of [-19, 18]) for (let y = 1; y <= 26; y++) f.set(x, y, 7, y % 5 === 0 ? HAZ_Y : STEEL_D);
  f.box(-11, 28, 9, 13, 34, 9, 0x2a3a5a);
  f.box(-11, 28, 9, 13, 28, 9, BRASS_D); f.box(-11, 34, 9, 13, 34, 9, BRASS_D);
  text(f, 'SHOP', -4, 33, 10, WHITE);
  gear(f, -8, 31, 10, 10, 1.6, 2.6, 6, BRASS, { hub: BRASS_D });
  // --- stamping press (left)
  for (const x of [-17, -9]) f.box(x, 1, -12, x + 1, 24, -10, IRON);
  f.box(-17, 22, -12, -8, 25, -10, IRON_L);
  f.box(-16, 1, -14, -9, 6, -8, IRON_D); f.box(-15, 7, -13, -10, 7, -9, STEEL_L); // anvil die
  const ram = R.part('ram', at(-13, 18, -11));
  ram.f.box(-15, 12, -13, -10, 20, -9, STEEL); ram.f.box(-14, 10, -12, -11, 11, -10, STEEL_L);
  ram.f.box(-13, 21, -12, -12, 22, -11, BRASS);
  for (let y = 13; y <= 19; y += 3) ram.f.box(-15, y, -9, -10, y, -9, HAZ_Y);
  // pressed plate sitting on the die (glows hot right after a hit)
  const hot = R.part('hot', at(-13, 8, -11));
  hot.g.box(-15, 8, -13, -10, 8, -9, FIRE[1]);
  // --- lathe on a bench (right)
  f.box(1, 1, -12, 2, 8, -5, WOOD_D); f.box(14, 1, -12, 15, 8, -5, WOOD_D);
  f.box(0, 9, -13, 16, 10, -4, WOOD[1]);
  f.box(1, 11, -12, 5, 18, -6, 0x3a6a4a); f.box(13, 11, -11, 15, 15, -7, 0x3a6a4a);
  f.box(6, 11, -10, 14, 11, -8, STEEL_D);
  const chuck = R.part('chuck', at(6, 14.5, -9));
  wheelX(chuck.f, 6, 7, 14.5, -8.5, 3.2, STEEL_L, { spokes: 3, rim: 1.2, hub: IRON });
  cylX(chuck.f, 14.5, -8.5, 1.4, 8, 13, (x) => (x % 2 ? BRASS : BRASS_L));
  // --- the big flywheel outside the right wall, belt to the lathe
  f.box(19, 1, -8, 20, 14, -6, IRON);
  const fly = R.part('fly', at(21, 14, -7));
  wheelX(fly.f, 21, 22, 14, -6.5, 8.5, RED, { spokes: 6, rim: 1.6, hub: IRON });
  const belt = R.part('belt', at(19, 14, -7));
  for (let y = 7; y <= 21; y++) { belt.f.set(19, y, -15, y % 3 ? RUBBER : RUBBER_L); }
  // --- crane hook with a gear dangling
  f.box(-20, 25, -4, 19, 25, -3, HAZ_Y);
  const hook = R.part('hook', at(2, 25, -3));
  hook.f.box(2, 15, -3, 2, 24, -3, IRON_L);
  gear(hook.f, 2.5, 11.5, -4, -3, 2.4, 3.6, 7, BRASS, { hub: BRASS_D });
  // crates of parts out front
  f.box(9, 1, 10, 16, 5, 16, (x, y, z) => (x === 9 || x === 16 || z === 10 || z === 16 ? WOOD_D : WOOD[(x + y) % 3]));
  for (let i = 0; i < 5; i++) gear(f, 10.5 + (i % 3) * 2.2, 7 - (i >> 1) * 0.2, 11 + (i % 2) * 2 + (i >> 1) * 2, 11 + (i % 2) * 2 + (i >> 1) * 2, 1, 1.9, 5, i % 2 ? BRASS : COPPER, { hub: BRASS_D });
  for (let i = 0; i < 5; i++) f.box(-16, 1 + i, 10 + (i % 2), -8, 1 + i, 15 + (i % 2), (x, y) => (x === -8 ? STEEL_L : i % 2 ? STEEL : STEEL_L));
  g.set(-20, 18, -16, 0xfff0a0); // a work light
  grassTufts(f, 12, -19, 18, 8, 18, 5, (x, z) => (x > -18 && x < 18 && z < 17));
}
function shopAnim(n, clock, vel) {
  const k = Math.min(1, vel);
  const u = (clock * 0.9) % 1;
  const drop = u < 0.15 ? u / 0.15 : u < 0.25 ? 1 : 1 - (u - 0.25) / 0.75;
  if (n.ram) n.ram.position.y = n.ram.userData.base.y - drop * drop * 0.32;
  if (n.hot) n.hot.visible = k > 0.2 && u > 0.12 && u < 0.6;
  if (n.chuck) n.chuck.rotation.x = clock * 9;
  if (n.fly) n.fly.rotation.x = clock * 3;
  if (n.belt) n.belt.position.y = n.belt.userData.base.y + Math.sin(clock * 6) * 0.01;
  if (n.hook) n.hook.rotation.z = Math.sin(clock * 1.3) * 0.08 + Math.sin(clock * 0.6) * 0.04;
}

// ================================================================ STEAM GENERATOR (1x1)
// A red riveted boiler on bricks, a glowing firebox, smokestack, a spinning
// flywheel + piston, a pressure gauge, and a power pole with sparking insulators.
function buildGenerator(R) {
  const f = R.f, g = R.g;
  slab(f, -9, 9, -9, 9, 0, STONE);
  f.box(-9, 1, -7, 4, 4, 5, (x, y, z) => brick(x, y, z));
  // boiler drum along x
  cylX(f, 10.5, -1, 5.6, -9, 4, (x, y, z, d) => (x === -9 || x === 4 ? (d > 4.6 ? IRON : RED_D) : x % 5 === 0 ? IRON : d > 5.2 && (y + z) % 3 === 0 ? RED_L : RED));
  rivetsRingX(f, -10, 10.5, -1, 4.6, 10, BRASS);
  for (const x of [-6, -1, 4]) rivetsRingX(f, x, 10.5, -1, 5.8, 12, IRON_L);
  // firebox door (glowing) at the front under the drum
  f.box(-8, 1, 6, -2, 5, 6, IRON);
  const fire = R.part('fire', at(-5, 2, 6));
  fire.g.box(-7, 2, 7, -3, 4, 7, FIRE[2]); fire.g.box(-6, 3, 7, -4, 3, 7, FIRE[0]);
  // stack
  cylY(f, -5.5, -4.5, 2.4, 15, 36, (x, y) => (y % 7 === 0 ? IRON_L : IRON));
  cylY(f, -5.5, -4.5, 3.4, 36, 38, IRON_D);
  // steam dome + whistle
  cylY(f, 0.5, -0.5, 1.8, 16, 18, BRASS); f.box(0, 19, -1, 1, 21, 0, BRASS_L);
  // pressure gauge with a needle
  cylZ(f, -3.5, 14.5, 2.2, 5, 5, WHITE); f.box(-4, 14, 5, -3, 15, 5, WHITE);
  const needle = R.part('needle', at(-4, 14, 6));
  needle.f.box(-4, 14, 6, -4, 16, 6, RED_D);
  // flywheel + crank on the right
  f.box(5, 1, -2, 6, 10, 0, IRON);
  const fly = R.part('fly', at(7.5, 10.5, -1));
  wheelX(fly.f, 7, 8, 10.5, -1, 7.2, IRON_L, { spokes: 5, rim: 1.6, hub: BRASS });
  const rod = R.part('rod', at(5, 10, 3));
  rod.f.box(-1, 10, 3, 5, 10, 3, STEEL_L); rod.f.box(-2, 9, 3, -1, 11, 3, BRASS_D);
  // power pole with insulators + a bolt sign
  f.box(7, 1, -8, 8, 30, -7, WOOD_D);
  f.box(3, 27, -8, 12, 28, -7, WOOD[0]);
  for (const x of [3, 7, 12]) { f.set(x, 29, -8, 0x6ab0a0); f.set(x, 30, -8, 0x8ad0c0); }
  f.box(6, 19, -6, 9, 23, -6, HAZ_Y); g.set(8, 22, -5, 0x2a2a2e); g.set(7, 21, -5, 0x2a2a2e); g.set(8, 20, -5, 0x2a2a2e);
  const spark = R.part('spark', at(7, 31, -8));
  for (const [x, y] of [[7, 31], [6, 32], [8, 32], [7, 33], [3, 31], [12, 31]]) spark.g.set(x, y, -8, 0xbff0ff);
  // coal bin
  f.box(2, 1, 4, 8, 4, 8, (x, y, z) => (x === 2 || x === 8 || z === 8 || z === 4 ? IRON : null));
  for (let x = 3; x <= 7; x++) for (let z = 5; z <= 7; z++) f.set(x, 4 + (hv(x, 1, z) < 0.5 ? 1 : 0), z, pickT(COAL, x, 1, z));
}
function generatorAnim(n, clock, vel, dt, t) {
  const k = Math.min(1, vel);
  if (n.fly) n.fly.rotation.x = clock * 5;
  if (n.rod) n.rod.position.z = n.rod.userData.base.z + Math.sin(clock * 5) * 0.12;
  if (n.needle) n.needle.rotation.z = -0.6 - k * 1.4 + Math.sin(t * 7) * 0.08 * k;
  if (n.fire) { n.fire.visible = k > 0.05; n.fire.scale.y = 0.6 + Math.sin(t * 11) * 0.25 + k * 0.3; }
  if (n.spark) n.spark.visible = k > 0.4 && Math.sin(t * 23) > 0.7;
}

// ================================================================ CONVEYOR BELT (1x1)
// Steel frame on legs, a black rubber belt with moving slats, hazard rails and a
// yellow chevron at the front end. Front = +Z = the way items travel.
function buildBelt(R) {
  const f = R.f;
  for (const x of [-9, 8]) for (let z = -10; z <= 9; z++) { f.set(x, 4, z, STEEL_D); f.set(x, 5, z, (z >> 1) & 1 ? HAZ_Y : HAZ_K); }
  for (const x of [-9, 8]) for (const z of [-8, 7]) f.box(x, 0, z, x, 3, z, IRON);
  for (let x = -8; x <= 7; x++) for (let z = -10; z <= 9; z++) f.set(x, 3, z, RUBBER);
  // end rollers
  for (const z of [-10, 9]) for (let x = -8; x <= 7; x++) f.set(x, 2, z, STEEL_L);
  const tread = R.part('tread', [0, 0, 0]);
  for (let z = -10; z <= 9; z += 4) for (let x = -7; x <= 6; x++) tread.f.set(x, 4, z, x === -7 || x === 6 ? RUBBER_L : 0x5a5862);
  // chevron on the front rail ends
  for (const x of [-9, 8]) { f.set(x, 6, 8, HAZ_Y); f.set(x, 6, 9, HAZ_Y); }
}
function beltAnim(n, clock) {
  if (n.tread) n.tread.position.z = ((clock * 1.25) % (4 * VF));
}

// ================================================================ SUPPLY CHUTE (1x1)
function buildLoader(R) {
  const f = R.f, g = R.g;
  slab(f, -9, 8, -9, 8, 0, CONC);
  for (const x of [-7, 6]) for (const z of [-7, 2]) f.box(x, 1, z, x, 12, z, IRON);
  // the hopper funnel
  for (let y = 12; y <= 22; y++) {
    const r = 3 + (y - 12) * 0.62;
    for (let x = Math.floor(-0.5 - r); x <= Math.ceil(-0.5 + r); x++) for (let z = Math.floor(-2.5 - r); z <= Math.ceil(-2.5 + r); z++) {
      const edge = Math.max(Math.abs(x + 0.5 + 0.5), Math.abs(z + 0.5 + 2.5)) > r - 1;
      if (!edge && y < 22) continue;
      f.set(x, y, z, y === 22 ? STEEL_D : (x + y) % 4 === 0 ? STEEL_L : STEEL);
    }
  }
  // ore peeking out of the top
  for (let x = -5; x <= 4; x++) for (let z = -7; z <= 2; z++) if (hv(x, 3, z) < 0.6) f.set(x, 22, z, hv(x, 4, z) < 0.3 ? COPPER : hv(x, 5, z) < 0.5 ? 0x6a5a58 : pickT(COAL, x, 1, z));
  // spout down onto the belt start (front)
  f.box(-3, 7, 2, 2, 11, 6, STEEL_D); f.box(-2, 6, 4, 1, 6, 8, STEEL_D);
  // sign + crate
  f.box(-9, 1, 3, -4, 6, 8, (x, y, z) => (x === -9 || x === -4 || z === 8 ? WOOD_D : WOOD[(x + y) % 3]));
  f.box(-5, 13, 3, 4, 19, 3, HAZ_Y);
  for (const [x, y] of [[-1, 4], [0, 4], [-1, 3], [0, 3], [-3, 2], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 2], [-2, 1], [-1, 1], [0, 1], [1, 1], [-1, 0], [0, 0]]) f.set(x, 14 + y, 4, HAZ_K);
  const shake = R.part('shake', [0, 0.6, -0.12]);
  shake.g.set(-1, 23, -3, 0xffe080); shake.g.set(0, 24, -2, 0xffe080);
}
function loaderAnim(n, clock, vel, dt, t) {
  if (n.shake) { n.shake.visible = vel > 0.3 && Math.sin(t * 9) > 0; }
}

// ================================================================ AUTO-FEEDER MK2 (1x1, shore)
// A steel silo with a porthole full of pellets and a turret cannon on top.
function buildFeeder(R) {
  const f = R.f, g = R.g;
  slab(f, -8, 7, -8, 7, 0, CONC);
  for (let y = 1; y <= 4; y++) for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) if (Math.abs(x + 0.5) > 5.5 || Math.abs(z + 0.5) > 5.5) f.set(x, y, z, hazard(x + z, y));
  cylY(f, -0.5, -0.5, 5.4, 5, 20, (x, y, z) => (y % 5 === 0 ? STEEL_D : (x + z) % 7 === 0 ? STEEL_L : STEEL));
  // porthole with pellets
  for (let y = 9; y <= 15; y++) for (let x = -3; x <= 2; x++) { const d = Math.hypot(x + 0.5, y + 0.5 - 12); if (d < 3.2) { f.set(x, y, 5, d > 2.4 ? BRASS : null); if (d <= 2.4) { R.gl.set(x, y, 5, GLASS_TINT); f.set(x, y, 4, hv(x, y, 1) < 0.5 ? 0xc89050 : 0xa87038); } } }
  f.box(-6, 15, 5, 8, 21, 5, WHITE);
  text(f, 'MK', -5, 20, 6, RED);
  for (const [r, row] of ['###', '..#', '###', '#..', '###'].entries()) for (let c = 0; c < 3; c++) if (row[c] === '#') f.set(5 + c, 20 - r, 6, RED);
  cylY(f, -0.5, -0.5, 3.2, 21, 22, IRON);
  const tur = R.part('turret', at(0, 23, 0));
  cylY(tur.f, -0.5, -0.5, 3.6, 23, 27, (x, y) => (y === 27 ? STEEL_L : RED));
  tur.f.box(-2, 28, -2, 1, 28, 1, RED_D);
  const barrel = tur.part('barrel', at(0, 26, 1));
  cylZ(barrel.f, -0.5, 25.5, 1.5, 2, 10, (x, y, z) => (z >= 9 ? IRON_D : z % 3 === 0 ? STEEL_D : STEEL_L));
  barrel.f.box(-1, 25, 10, 0, 26, 10, IRON_D);
  const blink = tur.part('blink', at(2, 28, 0));
  blink.g.set(2, 28, 0, 0x6aff6a); blink.g.set(-3, 28, 0, 0xff6a3a);
  // a fish-food sack leaning on the base
  f.box(4, 1, 4, 7, 6, 7, 0xd8b878); f.box(5, 7, 5, 6, 7, 6, 0xb89858); g.set(5, 4, 8, 0xffd060);
}
function feederAnim(n, clock, vel, dt, t, st, root) {
  const u = root.userData;
  u.yaw = u.yaw ?? 0; u.yawGoal = u.yawGoal ?? 0;
  if (vel > 0.05) u.yawGoal += dt * 0.25 * (u.aimed ? 0 : 1);
  u.yaw += Math.atan2(Math.sin(u.yawGoal - u.yaw), Math.cos(u.yawGoal - u.yaw)) * Math.min(1, dt * 4);
  if (n.turret) n.turret.rotation.y = u.yaw;
  u.recoil = Math.max(0, (u.recoil || 0) - dt * 3);
  if (n.barrel) { n.barrel.position.z = n.barrel.userData.base.z - u.recoil * 0.12; n.barrel.rotation.x = -0.35; }
  if (n.blink) n.blink.visible = vel > 0.1 && Math.sin(t * 5) > 0;
}

// ================================================================ AUTO-HARVESTER (1x1)
// A robot arm on a turntable (shoulder + elbow + a claw) and a basket of veggies.
function buildHarvester(R) {
  const f = R.f, g = R.g;
  slab(f, -9, 8, -9, 8, 0, CONC);
  cylY(f, -0.5, -0.5, 6, 1, 2, (x, y, z) => hazard(x, z));
  // basket of produce
  f.box(3, 1, 3, 8, 4, 8, (x, y, z) => ((x + y + z) % 2 ? WOOD[0] : WOOD_D));
  for (let x = 4; x <= 7; x++) for (let z = 4; z <= 7; z++) f.set(x, 5, z, [0xf07a2a, 0x7ac04a, 0xd84a3a, 0xf2c230][(x + z * 3) % 4]);
  const yaw = R.part('yaw', at(0, 3, 0));
  cylY(yaw.f, -0.5, -0.5, 4, 3, 5, (x, y) => (y === 5 ? STEEL_L : STEEL));
  yaw.f.box(-2, 6, -2, 1, 9, 1, GREEN_D);
  const sh = yaw.part('shoulder', at(0, 9, 0));
  sh.f.box(-1, 9, -1, 0, 20, 0, GREEN);
  sh.f.box(-2, 9, -2, 1, 10, 1, IRON); sh.f.box(-2, 19, -2, 1, 21, 1, IRON);
  const el = sh.part('elbow', at(0, 20, 0));
  el.f.box(-1, 20, 0, 0, 21, 10, GREEN_L);
  el.f.box(-2, 19, 9, 1, 21, 11, IRON);
  const claw = el.part('claw', at(0, 19, 10));
  claw.f.box(-2, 15, 8, -2, 18, 8, STEEL_L); claw.f.box(1, 15, 8, 1, 18, 8, STEEL_L);
  claw.f.box(-2, 15, 12, -2, 18, 12, STEEL_L); claw.f.box(1, 15, 12, 1, 18, 12, STEEL_L);
  claw.f.box(-2, 14, 9, -2, 14, 11, STEEL); claw.f.box(1, 14, 9, 1, 14, 11, STEEL);
  // antenna light
  f.box(-8, 1, -8, -8, 14, -8, IRON_L);
  const ant = R.part('ant', at(-8, 15, -8));
  ant.g.set(-8, 15, -8, 0xff5a3a);
}
function harvesterAnim(n, clock, vel, dt, t, st, root) {
  const u = root.userData;
  u.yaw = u.yaw ?? 0; u.yawGoal = u.yawGoal ?? 0;
  u.reach = Math.max(0, (u.reach || 0) - dt * 0.9);
  if (vel > 0.05 && u.reach <= 0) u.yawGoal += dt * 0.4;
  u.yaw += Math.atan2(Math.sin(u.yawGoal - u.yaw), Math.cos(u.yawGoal - u.yaw)) * Math.min(1, dt * 3);
  const r = u.reach > 0 ? Math.sin(Math.min(1, u.reach) * PI) : 0;
  if (n.yaw) n.yaw.rotation.y = u.yaw;
  if (n.shoulder) n.shoulder.rotation.x = 0.25 + r * 0.6 + Math.sin(clock * 2) * 0.06;
  if (n.elbow) n.elbow.rotation.x = 0.35 + r * 0.55;
  if (n.claw) n.claw.rotation.x = -0.6 - r * 1.1;
  if (n.ant) n.ant.visible = Math.sin(t * 3) > 0;
}

// ================================================================ AUTO-HAULER DOCK (1x1)
function buildHauler(R) {
  const f = R.f, g = R.g;
  for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) f.set(x, 0, z, Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) > 7.5 ? hazard(x, z) : 0x4a4e5a);
  for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) f.set(x, 1, z, 0x5a5e6a);
  // big H
  for (let z = -4; z <= 3; z++) { f.set(-4, 2, z, HAZ_Y); f.set(-3, 2, z, HAZ_Y); f.set(2, 2, z, HAZ_Y); f.set(3, 2, z, HAZ_Y); }
  for (let x = -2; x <= 1; x++) { f.set(x, 2, -1, HAZ_Y); f.set(x, 2, 0, HAZ_Y); }
  // charging post
  f.box(6, 1, -8, 8, 16, -6, STEEL_D); f.box(5, 12, -8, 5, 14, -6, IRON);
  const lights = R.part('lights', [0, 0, 0]);
  for (const [x, z] of [[-9, -9], [8, -9], [-9, 8], [8, 8]]) lights.g.set(x, 2, z, 0x6aff9a);
  g.set(7, 17, -7, 0x6ae8ff);
  // a log pile + an ore crate it has delivered (decor)
  f.box(-9, 1, 9, -5, 4, 9, WOOD_D);
}
function haulerAnim(n, clock, vel, dt, t) {
  if (n.lights) n.lights.visible = vel > 0.05 ? Math.sin(t * 4) > -0.2 : false;
}

// ================================================================ VENDING MACHINE (1x1)
function buildVending(R) {
  const f = R.f, g = R.g;
  slab(f, -8, 7, -7, 7, 0, CONC);
  // red body
  for (let x = -7; x <= 6; x++) for (let y = 1; y <= 34; y++) for (let z = -6; z <= 4; z++) {
    if (x > -7 && x < 6 && z > -6 && z < 4 && y > 1 && y < 34) continue;
    f.set(x, y, z, y === 34 || y === 1 ? RED_D : x === -7 || x === 6 ? RED_D : RED);
  }
  // window with snack rows
  const SN = [0xf07a2a, 0x7ac04a, 0xffd23f, 0x6aa8f0, 0xe85aa0, 0xc89050];
  for (let row = 0; row < 4; row++) {
    const y0 = 12 + row * 5;
    for (let x = -6; x <= 1; x++) f.set(x, y0, 3, STEEL_L);
    for (let i = 0; i < 4; i++) { const c = SN[(row * 2 + i) % SN.length]; f.box(-6 + i * 2, y0 + 1, 2, -5 + i * 2, y0 + 3, 3, c); f.set(-6 + i * 2, y0 + 3, 3, shade(c, 1.2)); }
  }
  for (let x = -6; x <= 1; x++) for (let y = 11; y <= 30; y++) { f.set(x, y, 4, null); R.gl.set(x, y, 5, GLASS_TINT); }
  // top sign
  g.box(-7, 32, 5, 7, 38, 5, 0xfff2c0); f.box(-8, 31, 4, 8, 39, 4, RED_D);
  text(f, 'SNAX', -7, 37, 6, RED_D);
  // keypad + coin slot
  f.box(2, 18, 5, 5, 28, 5, 0x2a2a30);
  for (let r = 0; r < 3; r++) for (let c2 = 0; c2 < 2; c2++) g.set(3 + c2, 20 + r * 2, 6, [0x6aff6a, 0xffd040, 0xff6a5a][r]);
  f.box(3, 26, 6, 4, 26, 6, BRASS_L);
  // dispenser flap
  f.box(-6, 3, 5, 3, 8, 5, 0x1a1a20);
  f.box(-6, 9, 5, 3, 9, 5, STEEL_L);
  // paw logo on the side
  for (const [x, y] of [[0, 0], [-2, 2], [0, 3], [2, 2], [-1, 1], [1, 1]]) f.set(-8, 22 + y, -1 + x, WHITE);
  const can = R.part('can', at(-1, 6, 6));
  can.f.box(-2, 4, 6, 0, 7, 7, 0x6aa8f0); can.f.box(-2, 7, 6, 0, 7, 7, STEEL_L);
  const glowp = R.part('panel', [0, 0, 0]);
  glowp.g.box(-6, 11, 3, 1, 11, 3, 0xfff8e0);
}
function vendingAnim(n, clock, vel, dt, t, st, root) {
  const u = root.userData;
  u.drop = Math.max(0, (u.drop || 0) - dt);
  if (n.can) { n.can.visible = u.drop > 0; n.can.position.y = n.can.userData.base.y + Math.max(0, u.drop - 0.5) * 0.9; }
  if (n.panel) n.panel.visible = vel > 0.05 && (Math.sin(t * 2) > -0.8);
}

// ================================================================ AIR SCRUBBER (1x1)
function buildScrubber(R) {
  const f = R.f, g = R.g;
  slab(f, -9, 8, -8, 8, 0, CONC);
  for (let x = -8; x <= 7; x++) for (let y = 1; y <= 30; y++) for (let z = -7; z <= 5; z++) {
    if (x > -8 && x < 7 && z > -7 && z < 5 && y < 30) continue;
    f.set(x, y, z, y >= 28 ? GREEN_D : (y % 8 === 0 ? 0xd8e0d8 : WHITE));
  }
  // side louvers
  for (const x of [-8, 7]) for (let y = 4; y <= 24; y += 2) for (let z = -5; z <= 3; z++) f.set(x, y, z, 0x9aa49a);
  // big front fan
  for (let y = 9; y <= 27; y++) for (let x = -7; x <= 6; x++) { const d = Math.hypot(x + 0.5, y + 0.5 - 18); if (d < 7.4) f.set(x, y, 5, d > 6.4 ? GREEN_D : null); if (d < 6.4) f.set(x, y, 3, 0x30363a); }
  const fan = R.part('fan', [0, 18 * VF, 4.5 * VF]);
  for (let y = 12; y <= 24; y++) for (let x = -6; x <= 5; x++) {
    const dx = x + 0.5, dy = y + 0.5 - 18, r = Math.hypot(dx, dy);
    if (r > 6.2) continue;
    const a = Math.atan2(dy, dx);
    if (r < 1.5) fan.f.set(x, y, 4, IRON);
    else if (((a + TAU) % (TAU / 4)) < 0.6) fan.f.set(x, y, 4, STEEL_L);
  }
  for (let y = 11; y <= 25; y += 2) for (let x = -6; x <= 5; x++) if (Math.hypot(x + 0.5, y + 0.5 - 18) < 6.4) f.set(x, y, 6, 0x9aa49a);
  // leaf logo
  for (const [x, y] of [[0, 0], [1, 1], [-1, 1], [0, 1], [0, 2], [1, 2], [0, 3], [-1, 3]]) f.set(-4 + x, 4 + y, 6, GREEN);
  text(f, 'AIR', -1, 7, 6, GREEN_D);
  // top exhaust with a second fan
  cylY(f, -0.5, -1, 4, 31, 33, STEEL_D);
  const fan2 = R.part('fan2', at(0, 33, -1));
  for (let x = -4; x <= 3; x++) for (let z = -5; z <= 2; z++) { const r = Math.hypot(x + 0.5 + 0.5, z + 0.5 + 1); if (r < 3.4 && (Math.abs(x + 0.5 + 0.5) < 0.9 || Math.abs(z + 0.5 + 1) < 0.9)) fan2.f.set(x, 33, z, STEEL_L); }
  const puff = R.part('puff', at(0, 36, -1));
  for (const [x, y, z] of [[0, 36, -1], [-2, 37, 0], [1, 38, -2], [-1, 39, -1]]) puff.g.set(x, y, z, 0xe8fff0);
}
function scrubberAnim(n, clock, vel, dt, t) {
  if (n.fan) n.fan.rotation.z = -clock * 8;
  if (n.fan2) n.fan2.rotation.y = clock * 10;
  if (n.puff) { const u = (t * 0.6) % 1; n.puff.visible = vel > 0.2; n.puff.position.y = n.puff.userData.base.y + u * 0.4; n.puff.scale.setScalar(0.6 + u * 0.8); }
}

// ================================================================ WATER FILTER (1x1, in water)
// A pontoon with a blue tank, a pump with a spinning impeller and a bubbling outlet.
// The pontoon floats at the water line (setDepth: metres from the pond floor).
function buildFilter(R) {
  const f = R.f;
  // pilings (scaled to the water depth by setDepth)
  const pil = R.part('pilings', [0, 0, 0]);
  for (const x of [-7, 6]) for (const z of [-7, 6]) pil.f.box(x, 0, z, x, 19, z, WOOD_D);
  const top = R.part('float', [0, 0, 0]);
  const t = top.f, tg = top.g;
  // pontoon deck (y 0 = water line)
  for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) t.set(x, 0, z, (x + z) % 2 ? WOOD[0] : WOOD[1]);
  for (const z of [-9, 8]) for (let x = -9; x <= 8; x++) t.set(x, -1, z, 0xd8d0c0);
  // blue tank
  cylY(t, -3.5, -2.5, 4.4, 1, 13, (x, y, z) => (y === 13 ? BLUE_D : y % 4 === 0 ? BLUE_D : (x + z) % 5 === 0 ? BLUE_L : BLUE));
  tg.box(-4, 9, 2, -3, 10, 2, 0x8ae8ff);
  // pump with a pipe down into the water
  t.box(2, 1, -6, 7, 5, -1, STEEL_D); t.box(3, 6, -5, 6, 7, -2, STEEL);
  t.box(4, -4, -8, 5, 5, -7, IRON_L);
  const imp = top.part('imp', [8.5 * VF, 3.5 * VF, -3.5 * VF]);
  wheelX(imp.f, 8, 8, 3.5, -3.5, 2.6, BRASS, { spokes: 4, rim: 0.8, hub: IRON });
  // outlet spout
  t.box(-1, 3, 4, 0, 4, 9, STEEL_L);
  // a charcoal sack
  t.box(3, 1, 3, 7, 4, 7, 0x3a3a3a); t.box(4, 5, 4, 6, 5, 6, 0x5a5a5a);
  for (const [x, y] of [[0, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2], [1, 2], [0, 3]]) t.set(-4 + x, 4 + y, 2, WHITE);
}
function filterAnim(n, clock) {
  if (n.imp) n.imp.rotation.x = clock * 9;
}

// ---------------------------------------------------------------- the hauler drone
export function makeDrone() {
  const rec = cached('ind_drone', (R) => {
    const f = R.f, g = R.g;
    f.box(-4, 0, -4, 3, 3, 3, 0xf2c230); f.box(-3, 4, -3, 2, 4, 2, 0xd8a820);
    f.box(-2, 1, 4, 1, 2, 4, IRON); g.set(-1, 2, 5, 0x6ae8ff); g.set(0, 2, 5, 0x6ae8ff);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      f.line(sx * 3, 3, sz * 3, sx * 8, 4, sz * 8, IRON_L);
      f.box(sx * 8 - 1, 2, sz * 8 - 1, sx * 8, 4, sz * 8, IRON);
    }
    for (const [i, sx, sz] of [[0, -1, -1], [1, 1, -1], [2, -1, 1], [3, 1, 1]]) {
      const r = R.part('rot' + i, at(sx * 8 - 0.5, 5, sz * 8 - 0.5));
      for (let k = -5; k <= 4; k++) { r.f.set(sx * 8 + k, 5, sz * 8, 0x2a2a30); r.f.set(sx * 8, 5, sz * 8 + k, 0x2a2a30); }
    }
    const claw = R.part('claw', at(0, 0, 0));
    claw.f.box(-1, -4, -1, 0, -1, 0, IRON);
    claw.f.box(-3, -6, -1, -3, -4, 0, STEEL_L); claw.f.box(2, -6, -1, 2, -4, 0, STEEL_L);
    claw.f.box(-3, -4, -1, 2, -4, 0, STEEL);
  });
  const named = {};
  const root = instance(rec, [0, 0, 0], named);
  root.scale.setScalar(1.1);
  return {
    root,
    named,
    update(dt, t) {
      for (let i = 0; i < 4; i++) if (named['rot' + i]) named['rot' + i].rotation.y = t * 40 + i;
    },
  };
}

// ---------------------------------------------------------------- belt items
const ITEM_COL = {
  stone: 0x9a929c, coal: 0x34323a, copper: 0xd0763e, iron: 0xa87a6a, gold: 0xffcc34, crystal: 0x9a7ed8,
  ingot_copper: 0xe08a4a, ingot_iron: 0x9aa0b2, ingot_gold: 0xffd23f, gear: 0xb8924c, plate: 0x8c92aa, circuit: 0x30ad9c, wood: 0xa8784a,
  glass: 0xa6d4ec, wire: 0xe8945a, motor: 0x3c78c8, solar_cell: 0x2c4a9a, // [v26 power]
};
const ITEM_GEO = new Map();
function itemGeo(id) {
  let geo = ITEM_GEO.get(id);
  if (geo) return geo;
  const v = new VoxelModel();
  const c = ITEM_COL[id] ?? 0xcccccc;
  if (id.startsWith('ingot_')) {
    v.box(-3, 0, -1, 2, 1, 0, c); v.box(-2, 2, -1, 1, 2, 0, shade(c, 1.2));
  } else if (id === 'gear') {
    gear(v, 0, 0, 0, 0, 1.6, 2.8, 6, c, { hub: shade(c, 0.6) });
  } else if (id === 'plate') {
    v.box(-3, 0, -2, 2, 0, 1, c); v.box(-3, 1, -2, 2, 1, 1, shade(c, 1.15));
  } else if (id === 'circuit') {
    v.box(-2, 0, -2, 1, 0, 1, c); v.set(-1, 1, -1, 0xffd23f); v.set(0, 1, 0, 0x2a2a30); v.set(1, 1, -2, 0xffd23f);
  } else if (id === 'glass') { // [v26 power] a pane of glass on its edge
    v.box(-3, 0, 0, 2, 4, 0, (x, y) => ((x + y) % 4 === 0 ? 0xeaf8ff : c));
  } else if (id === 'wire') { // a spool of copper wire
    for (let x = -2; x <= 1; x++) for (let y = 0; y <= 3; y++) for (let z = -2; z <= 1; z++) {
      const r = Math.hypot(y - 1.5, z + 0.5);
      if (r > 2.1) continue;
      v.set(x, y, z, x === -2 || x === 1 ? 0xb07840 : (y + z) & 1 ? c : shade(c, 0.8));
    }
  } else if (id === 'motor') { // a blue can with fins and a steel shaft
    for (let x = -2; x <= 1; x++) for (let y = 0; y <= 3; y++) for (let z = -2; z <= 1; z++) if (Math.hypot(y - 1.5, z + 0.5) <= 2.1) v.set(x, y, z, x % 2 ? c : shade(c, 0.8));
    v.box(2, 1, -1, 3, 2, 0, 0xbcc2d4); v.box(-3, 0, -2, 2, 0, 1, 0x3a3a42);
  } else if (id === 'solar_cell') { // a dark blue cell with a silver grid
    v.box(-3, 0, -2, 2, 0, 1, (x, y, z) => (x % 2 === 0 || z === -1 ? 0xbcc2d4 : c));
  } else if (id === 'wood') {
    for (let x = -4; x <= 3; x++) for (let y = 0; y <= 2; y++) for (let z = -1; z <= 1; z++) if (Math.hypot(y - 1, z) < 1.6) v.set(x, y, z, x === -4 || x === 3 ? 0xd8a868 : pickT(WOOD, x, y, z));
  } else {
    // a lumpy ore chunk with a few bright flecks
    for (let x = -2; x <= 1; x++) for (let y = 0; y <= 2; y++) for (let z = -2; z <= 1; z++) {
      if (Math.hypot(x + 0.5, y - 1, z + 0.5) > 2.1 + hv(x, y, z) * 0.4) continue;
      const fleck = id !== 'stone' && id !== 'coal' && hv(x, y, z, 3) < 0.35;
      v.set(x, y, z, fleck ? c : id === 'coal' ? pickT(COAL, x, y, z) : id === 'stone' ? pickT(STONE, x, y, z) : pickT([0x6a6270, 0x7a7280, 0x5e5866], x, y, z));
    }
  }
  if (id === 'gear') {
    // the gear stands flat on the belt
    const w = new VoxelModel();
    for (const [k, col] of v.vox) { const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512; w.set(x, 0, y, col); w.set(x, 1, y, shade(col, 1.1)); }
    geo = w.build({ pivot: [0, 0, 0], scale: VF });
  } else geo = v.build({ pivot: [0, 0, 0], scale: VF });
  ITEM_GEO.set(id, geo);
  return geo;
}
export function makeBeltItem(id) {
  const m = new THREE.Mesh(itemGeo(id), voxelMaterial());
  m.castShadow = true;
  return m;
}

// ================================================================ [v26 power] CIRCUIT FAB (2x2)
// A clean white shed with a teal roof: a big window onto the solder bench (a green board,
// a glowing CRT, a soldering iron with a hot tip), a blinking antenna, a CIRCUITS sign.
function buildCircuitFab(R) {
  const f = R.f, g = R.g;
  slab(f, -19, 18, -19, 18, 0, CONC);
  const W1 = 0xeceae2, W2 = 0xdedcd2, TEAL = 0x2a8a84, TEAL_D = 0x1e6a66, TEAL_L = 0x4ab0a8;
  // walls (white panels with seams), door on the right
  for (let x = -17; x <= 16; x++) for (let z = -16; z <= 6; z++) for (let y = 1; y <= 22; y++) {
    const shell = x === -17 || x === 16 || z === -16 || z === 6;
    if (!shell) continue;
    f.set(x, y, z, (x + 40) % 8 === 0 || (z + 40) % 8 === 0 ? W2 : y === 1 ? 0xb8b4aa : W1);
  }
  // the big front window (glass) with the bench behind it
  for (let x = -14; x <= 3; x++) for (let y = 7; y <= 17; y++) { f.set(x, y, 6, null); if (x === -14 || x === 3 || y === 7 || y === 17 || x === -6) f.set(x, y, 6, STEEL_D); else R.gl.set(x, y, 6, GLASS_TINT); }
  // door + step + a hazard-free mat
  f.box(7, 1, 6, 13, 15, 6, null); f.box(7, 1, 6, 13, 15, 6, (x, y) => (x === 7 || x === 13 || y === 15 ? STEEL_D : y === 8 && x === 12 ? BRASS : 0x5a7a8a));
  f.box(6, 0, 7, 14, 0, 9, 0x8a867e);
  // roof: teal, low pitch, with a vent box + antenna
  for (let z = -18; z <= 8; z++) { const h = 23 + Math.round(((z + 18) / 26) * -3); for (let x = -19; x <= 18; x++) f.set(x, h + 3, z, (x + 40) % 2 ? TEAL : TEAL_D); }
  for (let x = -19; x <= 18; x++) f.set(x, 23, 8, TEAL_L);
  f.box(6, 26, -12, 11, 28, -7, STEEL); f.box(7, 29, -11, 10, 29, -8, STEEL_D);
  f.box(-12, 27, -10, -12, 40, -10, STEEL_L); f.box(-14, 34, -10, -10, 34, -10, STEEL_L); f.box(-13, 37, -10, -11, 37, -10, STEEL_L);
  const blink = R.part('blink', at(-12, 41, -10));
  blink.g.set(-12, 41, -10, 0xff3a2a);
  // the sign
  f.box(-12, 19, 7, 3, 23, 7, 0x1e3a3a);
  text(f, 'CHIPS', -9, 22, 8, 0x8affc8);
  // the solder bench inside (seen through the window)
  f.box(-13, 1, -2, 2, 6, 3, WOOD_D); f.box(-14, 7, -3, 3, 7, 4, WOOD[1]);
  f.box(-12, 8, -1, -7, 8, 3, 0x2e7a34); // a green board on the bench
  for (const [x, z] of [[-11, 0], [-9, 2], [-8, 0]]) f.set(x, 9, z, 0x2a2a30);
  for (const x of [-12, -10, -8]) f.set(x, 9, 2, 0xffd23f);
  // CRT monitor (green screen, flickers)
  f.box(-4, 8, -3, 1, 13, 1, 0xd8d4c4); f.box(-3, 8, 2, 0, 9, 2, 0xb8b4a6);
  const crt = R.part('crt', at(-1.5, 11, 2));
  crt.g.box(-3, 9, 2, 0, 12, 2, 0x3aff8a); for (let x = -3; x <= 0; x++) crt.g.set(x, 11, 2, 0x9affc8);
  // soldering iron + the hot tip
  f.line(-6, 8, 4, -9, 10, 1, STEEL_D); f.box(-6, 8, 4, -5, 9, 4, 0xd23a2a);
  const tip = R.part('tip', at(-9, 10, 1));
  tip.g.set(-9, 10, 1, 0xffb040); tip.g.set(-10, 10, 0, 0xfff0a0);
  // a crate of finished boards by the door + a cable reel
  f.box(9, 1, 10, 15, 4, 15, (x, y, z) => (x === 9 || x === 15 || z === 10 || z === 15 ? WOOD_D : WOOD[(x + y) % 3]));
  for (let i = 0; i < 3; i++) f.box(10, 5 + i, 11 + i, 14, 5 + i, 13 + i, i % 2 ? 0x2e7a34 : 0x3a8a44);
  cylZ(f, -12.5, 4.5, 4, 10, 15, (x, y, z, d) => (d > 3 ? 0xb07840 : d > 1.3 ? (z % 2 ? COPPER : COPPER_L) : WOOD_D));
  grassTufts(f, 10, -19, 18, 8, 18, 9, (x, z) => (x > -18 && x < 18 && z < 17));
}
function circuitAnim(n, clock, vel, dt, t) {
  const k = Math.min(1, vel);
  if (n.blink) n.blink.visible = Math.sin(t * 3.3) > 0.2;
  if (n.crt) n.crt.visible = k < 0.05 ? Math.sin(t * 0.7) > -0.2 : Math.sin(t * 37) > -0.7;
  if (n.tip) n.tip.visible = k > 0.1 && Math.sin(t * 13) > -0.4;
}

// ================================================================ [v26 power] ASSEMBLY BENCH (2x1)
// A long fitter's bench: a vice, a half-built blue motor on a stand (its shaft spins when
// running), gears and a tool board behind, a lamp hanging from a little gantry.
function buildAssembly(R) {
  const f = R.f, g = R.g;
  slab(f, -19, 18, -9, 9, 0, CONC);
  // bench top + legs + a shelf
  f.box(-17, 9, -4, 16, 10, 5, (x, y, z) => (y === 10 ? WOOD[(x >> 2) % 3] : WOOD_D));
  for (const x of [-16, 15]) for (const z of [-3, 4]) f.box(x, 1, z, x + 1, 8, z, WOOD_D);
  f.box(-16, 3, -3, 16, 3, 4, WOOD[2]);
  for (let i = 0; i < 4; i++) f.box(-14 + i * 4, 4, -2, -12 + i * 4, 5 + (i % 2), 2, i % 2 ? STEEL : STEEL_L); // plates on the shelf
  // the tool board (back) with a hammer, a wrench, a saw outline
  f.box(-17, 11, -6, 16, 24, -5, (x, y) => ((x + 40) % 9 === 0 ? WOOD_D : 0x9a7a52));
  f.line(-14, 14, -5, -10, 22, -4, WOOD_D); f.box(-12, 21, -4, -9, 23, -4, STEEL_D);
  f.line(-5, 13, -4, -5, 22, -4, STEEL_L); f.box(-6, 21, -4, -4, 22, -4, STEEL_L);
  for (let x = 2; x <= 9; x++) f.set(x, 16 + ((x & 1) ? 0 : 1), -4, STEEL_L); f.box(10, 15, -4, 12, 17, -4, WOOD_D);
  // the vice (left)
  f.box(-15, 11, -1, -10, 13, 2, IRON); f.box(-14, 14, -1, -11, 15, 2, IRON_L); f.box(-16, 12, 3, -9, 12, 3, STEEL_L);
  // the motor on its stand (right of centre); the shaft + fan spin
  f.box(0, 11, -2, 8, 11, 3, IRON);
  cylX(f, 16, 0.5, 4.2, 1, 7, (x, y, z, d) => (d > 3.6 ? (x % 2 ? BLUE : BLUE_D) : BLUE_L));
  f.box(-1, 13, -1, 0, 19, 2, STEEL_D);
  const shaft = R.part('shaft', at(9, 16, 0.5));
  cylX(shaft.f, 16, 0.5, 1, 8, 12, STEEL_L);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; shaft.f.line(12, 16, 0.5, 12, Math.round(16 + Math.sin(a) * 3), Math.round(0.5 + Math.cos(a) * 3), HAZ_Y); }
  // loose gears on the bench
  gear(f, -6.5, 11.5, 2, 3, 1.4, 2.6, 6, BRASS, { hub: BRASS_D });
  gear(f, 12.5, 11.5, 2, 3, 1, 2, 5, COPPER, { hub: BRASS_D });
  // the lamp on a gantry (swings a little)
  f.box(-17, 1, 6, -16, 30, 7, IRON); f.box(15, 1, 6, 16, 30, 7, IRON); f.box(-17, 30, 6, 16, 31, 7, HAZ_Y);
  const lamp = R.part('lamp', at(0, 30, 6.5));
  lamp.f.box(0, 25, 6, 0, 29, 6, IRON_L); lamp.f.box(-2, 23, 5, 2, 24, 8, 0x3a6a4a);
  lamp.g.box(-1, 22, 6, 1, 22, 7, 0xfff0b0);
}
function assemblyAnim(n, clock, vel, dt, t) {
  if (n.shaft) n.shaft.rotation.x = clock * 14;
  if (n.lamp) n.lamp.rotation.z = Math.sin(t * 1.1) * 0.05 + Math.sin(clock * 3) * 0.04;
}

// ---------------------------------------------------------------- [v26 power] the kit, for powerModels.js / storageModels.js
export const IND_KIT = { machine, at, cylY, cylX, cylZ, wheelX, slab, grassTufts, plaque, hv, pickT, brick, hazard, VF, cached, instance };
export const IND_PAL = { BRICK, BRICK_D, MORTAR, STONE, CONC, IRON, IRON_L, IRON_D, STEEL, STEEL_L, STEEL_D, COPPER, COPPER_L, COPPER_D, BRASS, BRASS_D, BRASS_L, HAZ_Y, HAZ_K, RED, RED_D, RED_L, GREEN, GREEN_D, GREEN_L, WHITE, CREAM, WOOD, WOOD_D, LEATHER, LEATHER_L, COAL, FIRE, RUBBER, RUBBER_L, BLUE, BLUE_D, BLUE_L, GLASS_TINT };

// ---------------------------------------------------------------- factories
export const STRUCTURE_MODELS = {
  ind_circuitfab: () => machine('ind_circuitfab', buildCircuitFab, { lamp: [0.75, 1.0, 0.36], fx: { smoke: [] }, anim: circuitAnim }), // [v26 power]
  ind_assembly: () => machine('ind_assembly', buildAssembly, { lamp: [0.85, 0.6, 0.3], anim: assemblyAnim }), // [v26 power]
  ind_smelter: () => machine('ind_smelter', buildSmelter, { lamp: [0.25, 1.48, 0.2], fx: { smoke: [[-0.45, 2.85, -0.5]], out: [0.6, 0.3, 0.9] }, anim: smelterAnim }),
  ind_shop: () => machine('ind_shop', buildShop, { lamp: [-0.55, 1.75, 0.5], fx: { smoke: [[0.95, 1.5, -0.8]], out: [0.6, 0.4, 0.9] }, anim: shopAnim }),
  ind_generator: () => machine('ind_generator', buildGenerator, { lamp: [0.05, 1.12, 0.1], fx: { smoke: [[-0.25, 1.95, -0.2]], steam: [0.03, 1.1, -0.02] }, anim: generatorAnim }),
  ind_belt: () => machine('ind_belt', buildBelt, { anim: beltAnim }),
  ind_loader: () => machine('ind_loader', buildLoader, { lamp: [0.32, 0.95, 0.15], anim: loaderAnim }),
  ind_feeder2: () => machine('ind_feeder2', buildFeeder, { lamp: [0.3, 0.55, 0.3], anim: feederAnim }),
  ind_harvester: () => machine('ind_harvester', buildHarvester, { lamp: [-0.35, 0.15, 0.35], anim: harvesterAnim }),
  ind_hauler: () => machine('ind_hauler', buildHauler, { lamp: [0.37, 0.95, -0.35], anim: haulerAnim }),
  ind_vending: () => machine('ind_vending', buildVending, { lamp: [0.28, 1.5, 0.3], anim: vendingAnim }),
  ind_scrubber: () => machine('ind_scrubber', buildScrubber, { lamp: [0.32, 1.45, 0.3], anim: scrubberAnim }),
  ind_filter: () => {
    const root = machine('ind_filter', buildFilter, { anim: filterAnim });
    const n = root.userData.parts;
    root.userData.setDepth = (d) => {
      const depth = Math.max(0.05, d);
      if (n.float) n.float.position.y = depth;
      if (n.pilings) n.pilings.scale.y = (depth + 0.05) / (20 * VF);
    };
    root.userData.setDepth(0.45);
    return root;
  },
};
export const INDUSTRY_MODEL_TYPES = Object.keys(STRUCTURE_MODELS);
