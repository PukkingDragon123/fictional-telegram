// Voxel bears in suits (and hard hats, flannel, tuxedos...). Built as separate
// parts so limbs can be animated: torso+head, left arm, right arm (+item), leg.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial, shade, mix, addGrain } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';

const BLACK = 0x1a1410;
const SHOE = 0x1c1a1c;

function torsoModel(d) {
  const v = new VoxelModel();
  const rnd = mulberry32(d.fur ^ d.suit);
  const suitAt = (x, y, z) => {
    let c = d.suit;
    if (d.pinstripe && (x & 1) === 0) c = d.pinstripe;
    if (d.flannel) c = ((Math.floor((x + 8) / 2) + Math.floor(y / 2)) % 2) ? d.suit : d.suitDark;
    if (d.hawaiian) { const r = rnd(); c = r < 0.12 ? 0xff6aa0 : r < 0.2 ? 0xffe060 : r < 0.26 ? 0xffffff : d.suit; }
    return c;
  };
  // torso block (rounded corners) y 0..7
  for (let y = 0; y <= 7; y++)
    for (let x = -4; x <= 4; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) === 4 && Math.abs(z) === 3) continue;
        if (y === 7 && (Math.abs(x) === 4 || Math.abs(z) === 3)) continue;
        v.set(x, y, z, y === 0 ? d.suitDark : suitAt(x, y, z));
      }
  // belly bulge
  for (let y = 1; y <= 5; y++) for (let x = -3; x <= 3; x++) if (!(Math.abs(x) === 3 && (y === 1 || y === 5))) v.set(x, y, 4, suitAt(x, y, 4));
  const fz = 4; // front surface for details
  if (d.straps) {
    // coveralls bib with straps over a plain shirt
    for (let y = 3; y <= 7; y++) for (const sx of [-2, 2]) v.set(sx, y, y <= 5 ? fz : 3, d.straps);
    v.set(-2, 5, fz + 1, 0xd8d8d8); v.set(2, 5, fz + 1, 0xd8d8d8);
    v.box(-1, 3, fz, 1, 4, fz, 0x2e4a74);
  } else if (d.vest) {
    for (let x = -4; x <= 4; x++) { v.set(x, 2, x >= -3 && x <= 3 ? fz : 3, d.vest); v.set(x, 5, x >= -3 && x <= 3 ? fz : 3, d.vest); }
    for (let y = 1; y <= 6; y++) v.set(0, y, y <= 5 ? fz : 3, 0x7a7a7a);
  } else if (!d.flannel && !d.hawaiian) {
    // shirt V + lapels
    for (let y = 4; y <= 7; y++) {
      const w = Math.floor((y - 3) * 0.6);
      for (let x = -w; x <= w; x++) v.set(x, y, y <= 5 ? fz : 3, d.shirt);
      if (d.suit !== d.shirt) { v.set(-w - 1, y, y <= 5 ? fz : 3, d.suitDark); v.set(w + 1, y, y <= 5 ? fz : 3, d.suitDark); }
    }
    if (d.suit !== d.shirt) { v.set(1, 2, fz + 1, d.suitDark); v.set(1, 3, fz, d.suitDark); }
  } else if (d.flannel) {
    for (let y = 5; y <= 7; y++) v.set(0, y, y <= 5 ? fz : 3, 0x7a2018);
  }
  if (d.tie) {
    for (let y = 1; y <= 6; y++) v.set(0, y, (y <= 5 ? fz : 3) + 1, d.tie);
    v.set(-1, 6, 4, d.tie); v.set(1, 6, 4, d.tie);
    v.set(0, 7, 4, shade(d.tie, 0.8));
  }
  if (d.bowtie) { v.set(0, 7, 4, shade(d.bowtie, 0.8)); v.set(-1, 7, 4, d.bowtie); v.set(1, 7, 4, d.bowtie); v.set(-2, 7, 4, d.bowtie); v.set(2, 7, 4, d.bowtie); }
  if (d.lanyard) {
    for (let y = 4; y <= 7; y++) { v.set(-1, y, y <= 5 ? fz + 1 : 4, d.lanyard); v.set(1, y, y <= 5 ? fz + 1 : 4, d.lanyard); }
    v.box(-1, 2, fz + 1, 1, 3, fz + 1, 0xffffff);
    v.set(0, 3, fz + 2, 0x3a3a3a);
  }
  if (d.scarf) {
    for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) if (Math.abs(x) === 4 || Math.abs(z) === 3) v.set(x, 7, z, d.scarf);
    for (let y = 2; y <= 7; y++) v.set(-2, y, y <= 5 ? fz + 1 : 4, y % 2 ? d.scarf : shade(d.scarf, 0.8));
  }
  if (d.hawaiian) {
    // camera on a strap
    v.box(-1, 3, fz + 1, 1, 4, fz + 1, 0x202020);
    v.set(0, 3, fz + 2, 0x6a8aa8);
    for (let y = 5; y <= 7; y++) { v.set(-2, y, y <= 5 ? fz + 1 : 4, 0x202020); v.set(2, y, y <= 5 ? fz + 1 : 4, 0x202020); }
  }
  // ---- head y 8..14
  const fur = d.fur, light = d.furLight;
  for (let y = 8; y <= 14; y++)
    for (let x = -4; x <= 4; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) === 4 && Math.abs(z) === 3) continue;
        if ((y === 14 || y === 8) && (Math.abs(x) === 4 || Math.abs(z) === 3)) continue;
        v.set(x, y, z, fur);
      }
  // snout
  for (let y = 9; y <= 11; y++) for (let x = -2; x <= 2; x++) v.set(x, y, 4, light);
  for (let x = -1; x <= 1; x++) { v.set(x, 10, 5, light); v.set(x, 11, 5, light); v.set(x, 9, 5, light); }
  v.set(-1, 11, 6, BLACK); v.set(0, 11, 6, BLACK); v.set(1, 11, 6, BLACK); v.set(0, 10, 6, BLACK);
  v.set(0, 9, 6, mix(light, BLACK, 0.6));
  // eyes
  v.set(-2, 12, 4, BLACK); v.set(2, 12, 4, BLACK);
  v.set(-2, 13, 4, fur === 0xeeeee6 ? 0xdedede : shade(fur, 0.7)); v.set(2, 13, 4, fur === 0xeeeee6 ? 0xdedede : shade(fur, 0.7));
  for (const x of [-3, -1, 1, 3]) v.set(x, 12, 3, fur);
  if (d.glasses) {
    for (const cx of [-2, 2]) for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]]) v.set(cx + dx, 12 + dy, 5, d.glasses);
    v.set(0, 13, 5, d.glasses);
  }
  if (d.monocle) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]]) v.set(2 + dx, 12 + dy, 5, d.monocle);
    v.set(3, 10, 4, d.monocle); v.set(4, 9, 4, d.monocle); v.set(4, 8, 3, d.monocle);
  }
  if (d.shades) { v.box(-3, 12, 5, 3, 12, 5, d.shades); v.box(-3, 13, 5, -1, 13, 5, d.shades); v.box(1, 13, 5, 3, 13, 5, d.shades); }
  if (d.cigar) { v.set(2, 9, 6, 0x6a3a1a); v.set(3, 9, 7, 0x6a3a1a); v.set(3, 9, 8, 0xff5a20); }
  if (d.scale < 0.7) { v.set(-3, 10, 4, 0xf0a0a0); v.set(3, 10, 4, 0xf0a0a0); } // cub blush
  // ---- hats / ears
  const hc = d.hatColor ?? 0x2a2a2e;
  const brimmed = ['fedora', 'tophat', 'hardhat', 'cap', 'toque'].includes(d.hat);
  if (!brimmed) {
    for (const sx of [-1, 1]) {
      v.box(sx * 3, 14, -1, sx * 4, 16, 0, fur);
      v.set(sx * 3, 15, 1, light);
      v.set(sx * 3, 14, 1, light);
    }
  }
  const disk = (y, rx, rz, c, cx = 0, cz = 0) => {
    for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
      if ((x * x) / ((rx + 0.5) ** 2) + (z * z) / ((rz + 0.5) ** 2) > 1) continue;
      v.set(x + cx, y, z + cz, typeof c === 'function' ? c(x, z) : c);
    }
  };
  switch (d.hat) {
    case 'fedora':
      disk(15, 6, 5, hc);
      for (let y = 16; y <= 18; y++) disk(y, 3, 3, y === 16 ? 0x101010 : hc);
      v.set(0, 18, 0, null); v.set(0, 18, 1, null);
      break;
    case 'tophat':
      disk(15, 6, 5, hc);
      for (let y = 16; y <= 22; y++) disk(y, 3, 3, y === 16 || y === 17 ? 0xa01e2a : hc);
      break;
    case 'hardhat':
      v.ellipsoid(0, 15, 0.5, 5.2, 3.2, 4.8, (x, y) => (y < 15 ? null : hc));
      disk(15, 5, 5, hc, 0, 1);
      v.set(0, 18, 0, shade(hc, 0.85)); v.set(0, 17, 5, 0x3a6ad0); v.set(1, 17, 5, 0xf0f0f0);
      break;
    case 'cap':
      for (let y = 15; y <= 16; y++) disk(y, 4, 3, hc);
      v.box(-3, 15, 4, 3, 15, 6, shade(hc, 0.8));
      v.set(0, 17, 0, shade(hc, 0.7));
      break;
    case 'toque':
      for (let y = 14; y <= 17; y++) disk(y, 4, 4, y === 15 ? 0xffffff : hc);
      v.box(-1, 18, -1, 1, 19, 1, 0xffffff);
      break;
    case 'beret':
      disk(15, 5, 4, hc, -1, 0);
      v.box(-4, 16, -2, -1, 16, 2, hc);
      v.set(0, 16, 0, hc); v.set(0, 17, 0, hc);
      break;
    case 'propeller':
      disk(15, 3, 3, (x, z) => (x >= 0 ? (z >= 0 ? 0xe8403a : 0xf2c230) : z >= 0 ? 0x3a8ae8 : 0x3ac860));
      disk(16, 2, 2, (x, z) => (x >= 0 ? (z >= 0 ? 0xe8403a : 0xf2c230) : z >= 0 ? 0x3a8ae8 : 0x3ac860));
      v.set(0, 17, 0, 0x9a9a9a);
      v.box(-4, 18, 0, 4, 18, 0, 0xe8403a); v.set(0, 18, 0, 0xf2c230);
      break;
  }
  return v;
}

function armModel(d, item) {
  const v = new VoxelModel();
  const sleeve = d.flannel ? d.suitDark : d.hawaiian ? d.suit : d.suit === d.shirt ? d.suit : d.suit;
  for (let y = -6; y <= 0; y++)
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) {
        let c = y <= -5 ? d.fur : sleeve;
        if (y === -4 && d.shirt && d.suit !== d.shirt && !d.flannel && !d.hawaiian && !d.vest) c = d.shirt;
        if (d.flannel && y > -5) c = ((y & 2) ? d.suit : d.suitDark);
        if (d.vest && y > -5) c = d.shirt;
        v.set(x, y, z, c);
      }
  v.set(0, -7, 1, d.fur);
  switch (item) {
    case 'briefcase':
      v.box(0, -8, -1, 0, -8, 1, 0x2a1a10);
      v.box(-1, -12, -3, 0, -9, 2, (x, y, z) => (y === -9 && (z === 0 || z === -1) ? 0xe8c040 : y === -12 ? 0x4a2a12 : 0x6a3a1a));
      break;
    case 'coffee':
      v.box(0, -9, 1, 0, -7, 2, (x, y) => (y === -7 ? 0x6a3a1a : y === -8 ? 0xc08a50 : 0xffffff));
      v.set(0, -6, 2, 0x5a2a0a);
      break;
    case 'mop':
      for (let y = -16; y <= -2; y++) v.set(0, y, 1, 0xa87a4a);
      v.box(-1, -18, 0, 1, -17, 2, 0xd0d0c8);
      v.set(0, -19, 1, 0xb0b0a8); v.set(-1, -19, 0, 0xb0b0a8); v.set(1, -19, 2, 0xb0b0a8);
      break;
    case 'lunchbox':
      v.box(0, -8, 0, 0, -8, 0, 0x3a3a3a);
      v.box(-1, -11, -2, 0, -9, 2, (x, y) => (y === -9 ? 0xa02020 : 0xd83a2a));
      break;
    case 'thermos':
      v.box(-1, -12, 0, 0, -8, 1, (x, y) => (y === -8 ? 0xb0b0b0 : 0x2a6a3a));
      break;
    case 'calculator':
      v.box(-1, -8, 1, 0, -8, 3, 0x505860);
      v.set(0, -7, 2, 0x8ad08a); v.set(0, -7, 3, 0xd0d0d0);
      break;
    case 'notepad':
      v.box(-1, -9, 1, 0, -7, 2, 0xffffff);
      v.set(0, -7, 3, 0xe8c040); v.set(0, -6, 3, 0xe8c040);
      break;
    case 'cane':
      for (let y = -15; y <= -7; y++) v.set(0, y, 1, 0x101010);
      v.set(0, -6, 1, 0xe8c040); v.set(0, -6, 2, 0xe8c040);
      break;
    case 'camera':
      v.box(-1, -9, 1, 0, -8, 2, 0x202020);
      break;
  }
  return v;
}

function legModel(d) {
  const v = new VoxelModel();
  const pants = d.hawaiian ? 0xd8c8a0 : d.flannel ? 0x2a3a5a : d.vest ? 0x3a4a6a : d.straps ? d.suit : d.suitDark;
  const shoe = d.scale < 0.7 || d.hawaiian ? d.fur : SHOE;
  for (let y = -5; y <= -1; y++)
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) v.set(x, y, z, y <= -4 ? shoe : pants);
  v.set(-1, -5, 2, shoe); v.set(0, -5, 2, shoe); v.set(1, -5, 2, shoe);
  return v;
}

const cache = new Map();
export function bearGeometries(typeId, def) {
  let g = cache.get(typeId);
  if (!g) {
    g = {
      torso: torsoModel(def).build({ pivot: [0.5, 0, 0.5] }),
      armL: armModel(def, null).build({ pivot: [0.5, 1, 0.5] }),
      armR: armModel(def, def.item).build({ pivot: [0.5, 1, 0.5] }),
      leg: legModel(def).build({ pivot: [0.5, 0, 0.5] }),
    };
    cache.set(typeId, g);
  }
  return g;
}

let angryMat = null, flashMat = null;
export function bearMaterials() {
  if (!angryMat) {
    angryMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(1.5, 0.55, 0.5) }));
    flashMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) }));
  }
  return { normal: voxelMaterial(), angry: angryMat, flash: flashMat };
}

// Scene-graph rig for one bear. Units: 1 voxel = 0.1.
export class BearRig {
  constructor(typeId, def) {
    const g = bearGeometries(typeId, def);
    const mat = voxelMaterial();
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const mk = (geo, parent, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    this.torso = mk(g.torso, this.body, 0, 0.5, 0);
    this.armL = mk(g.armL, this.body, -0.55, 1.25, 0);
    this.armR = mk(g.armR, this.body, 0.55, 1.25, 0);
    this.legL = mk(g.leg, this.root, -0.2, 0.5, 0);
    this.legR = mk(g.leg, this.root, 0.2, 0.5, 0);
    this.meshes = [this.torso, this.armL, this.armR, this.legL, this.legR];
    this.root.scale.setScalar(def.scale);
    this.held = null;
    this.matState = 'normal';
  }

  setMaterial(kind) {
    if (this.matState === kind) return;
    this.matState = kind;
    const m = bearMaterials()[kind];
    for (const mesh of this.meshes) mesh.material = m;
  }

  hold(geo) {
    if (this.held) { this.body.remove(this.held); this.held = null; }
    if (!geo) return;
    const m = new THREE.Mesh(geo, voxelMaterial());
    m.castShadow = true;
    m.position.set(0, 1.35, 0.72);
    m.rotation.set(0, Math.PI / 2, Math.PI / 2.4);
    m.scale.setScalar(0.8);
    this.body.add(m);
    this.held = m;
  }
}
