// [v33 tut] Things Reynard holds up during the tour: real voxel models, held in both paws
// (FoxRig.holdBoth) so they show in the 3D world and in the close-ups.
//
//   makeProp('fish', { species: 'bluegill', golden: false, male: true })   a voxel fish (the game's fish builder)
//   makeProp('egg')       a fish egg the size of his paw: amber, an eye spot, a curled-up fry inside
//   makeProp('pellets')   a kraft-paper bag of Fish Pellets, rolled top, red label with a fish
//   makeProp('scope')     the Fish Scope: a brass magnifier with a cyan lens, a dial and a wooden grip
//   makeProp('tag')       a red DO NOT EAT tag on a string loop
//   makeProp('coins')     a little stack of gold coins
// Every prop is a THREE.Group centred on its middle, about 0.2-0.4 world units big.
// Shapes are placed voxel by voxel (irregular, hand-shaded clusters), not stacked boxes.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial, shade, mix } from '../../core/voxel.js';
import { fishVoxels } from '../../entities/fishModels.js';
import { SPECIES_BY_ID } from '../../data/species.js';

const FV = 0.03; // world units per prop voxel (the fox is 0.05 * 0.85): props read clearly in the close-ups
const h3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function meshOf(vm, scale = FV) {
  const cx = (vm.minX + vm.maxX + 1) / 2, cy = (vm.minY + vm.maxY + 1) / 2, cz = (vm.minZ + vm.maxZ + 1) / 2;
  const geo = vm.build({ pivot: [cx, cy, cz], scale });
  const m = new THREE.Mesh(geo, voxelMaterial());
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  g.userData.dispose = () => geo.dispose();
  return g;
}

// ------------------------------------------------------------------ fish
function fishModel(spId, male) {
  const sp = SPECIES_BY_ID[spId] || SPECIES_BY_ID.bluegill;
  const c = sp.colors || { back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8, accent: 0x16223a };
  const round = /gill|seed|goldfish|crappie|sunfish/.test(sp.id);
  return {
    L: 17, H: round ? 11 : 8, W: 5, shape: round ? 'round' : 'fusiform',
    back: c.back, side: male ? c.side : mix(c.side, 0xd8d0b0, 0.25), belly: c.belly, fin: c.fin,
    pattern: round ? [{ type: 'bars', from: 0.2, to: 0.72, count: 5, color: shade(c.side, 0.72) }, { type: 'patch', at: 0.74, y: 0.25, color: c.accent || 0x16223a }] : [{ type: 'spots', density: 0.12, yMin: -0.2, color: c.accent || shade(c.back, 0.7) }],
    dorsal: round ? 'long' : 'short', tail: 'fork', cheek: male && c.accent ? c.accent : null, eye: 0x101418, eyeBig: true,
  };
}

// ------------------------------------------------------------------ egg
function eggVoxels() {
  const v = new VoxelModel();
  const R = 4.6;
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    const d = Math.hypot(x, y * 0.94, z);
    if (d > R) continue;
    const lit = (-x * 0.5 + y * 0.7 + z * 0.5) / R; // light from the upper left front
    let c = lit > 0.45 ? 0xffd890 : lit > -0.1 ? 0xffb24a : lit > -0.55 ? 0xf08a2a : 0xc8641a;
    if (h3(x, y, z) < 0.12 && d > R - 1) c = shade(c, 1.08); // little membrane speckles
    v.set(x, y, z, c);
  }
  // the fry curled up inside, seen through the shell: a dark eye spot and a pale curl
  for (const [x, y] of [[1, 1], [2, 1], [1, 2]]) v.set(x, y, 5 - (x > 1 ? 1 : 0), 0x2a1a20);
  v.set(2, 2, 4, 0xfff6e0);
  for (const [x, y] of [[0, -1], [-1, -1], [-2, 0], [-2, 1], [-1, 2], [0, 3]]) v.set(x, y, 4, 0xffe6b0);
  // the shine
  v.set(-2, 3, 3, 0xffffff); v.set(-3, 2, 3, 0xffffff); v.set(-2, 2, 4, 0xfff6e0);
  return v;
}

// ------------------------------------------------------------------ pellet bag
function pelletVoxels() {
  const v = new VoxelModel();
  const K = 0xc8955a, KD = 0xa8743e, KL = 0xe0b478, KDD = 0x7a5028;
  const W = 6, D = 3; // half width, half depth
  for (let y = -8; y <= 7; y++) {
    const bulge = y < -5 ? 0 : y < 3 ? 1 : 0; // paper bags bulge in the middle
    const w = W + bulge - (y > 5 ? 1 : 0), d = D + (y > -6 && y < 4 ? 1 : 0);
    for (let x = -w; x <= w; x++) for (let z = -d; z <= d; z++) {
      const edge = Math.abs(x) === w || Math.abs(z) === d;
      if (!edge && y > -8 && y < 7) continue; // hollow (only the skin is seen)
      let c = x < -w + 2 ? KL : x > w - 2 ? KD : K;
      if (h3(x, y, z) < 0.18) c = shade(c, 0.92); // paper fibres
      if ((x === -2 || x === 3) && Math.abs(z) === d && h3(x, y, 7) < 0.6) c = KD; // creases
      if (y === -8) c = KDD;
      v.set(x, y, z, c);
    }
  }
  // the rolled top: three folds
  for (let k = 0; k < 3; k++) for (let x = -6; x <= 6; x++) for (let z = -2; z <= 2; z++) {
    const y = 8 + k;
    if (k === 2 && (Math.abs(z) > 1)) continue;
    v.set(x, y, z, k === 1 ? KL : k === 2 ? KD : K);
  }
  // red label with a white fish and pellets, on the front (z = +d)
  for (let y = -4; y <= 3; y++) for (let x = -5; x <= 5; x++) {
    const z = 4;
    const border = y === -4 || y === 3 || Math.abs(x) === 5;
    v.set(x, y, z, border ? 0xffe8c0 : 0xd8343a);
  }
  const fish = [[-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [-2, -1], [-1, -1], [0, -1], [2, 1], [2, -1], [2, 0]];
  for (const [x, y] of fish) v.set(x, y, 5, 0xfff6e8);
  v.set(-1, 0, 5, 0x2a1418);
  for (const [x, y] of [[3, 2], [4, 1], [3, -2], [-4, -2]]) v.set(x, y, 5, 0x8a5a2a);
  // a few pellets spilling over the top
  for (const [x, z] of [[-2, 0], [1, 1], [3, -1]]) v.set(x, 11, z, 0x8a5a2a);
  return v;
}

// ------------------------------------------------------------------ Fish Scope
function scopeVoxels() {
  const v = new VoxelModel();
  const B = 0xe8b040, BD = 0xb07a1a, BL = 0xfff0a0;
  // the brass ring (radius 6), lens inside
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const d = Math.hypot(x, y);
    if (d > 7.2) continue;
    if (d > 5.4) {
      const lit = (-x + y) / 10;
      for (const z of [-1, 0, 1]) v.set(x, y + 9, z, lit > 0.25 ? BL : lit < -0.3 ? BD : B);
    } else {
      // cyan glass, a bright glint, and a faint scan line
      let c = 0x7ad8e8;
      if (x + y > 3) c = 0x5ab8d0;
      if (x - y === -5 || x - y === -6) c = 0xe8ffff;
      if (y === -1) c = 0x9ae8f0;
      v.set(x, y + 9, 0, c);
    }
  }
  // a little brass dial on the ring with a red needle
  for (const [x, y] of [[6, 13], [7, 13], [7, 14], [6, 14], [8, 14], [7, 15]]) v.set(x, y, 1, B);
  v.set(7, 14, 2, 0xd8343a);
  // the neck and a wooden grip with a brass collar and grip grooves
  for (let y = 0; y <= 1; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.set(x, y, z, BD);
  for (let y = -10; y < 0; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
    let c = 0x8a5228;
    if (x === -1) c = 0xa8683a;
    if (y % 3 === 0) c = 0x6a3a1a;
    v.set(x, y, z, c);
  }
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) + Math.abs(z) < 4) v.set(x, -11, z, B);
  return v;
}

// ------------------------------------------------------------------ DO NOT EAT tag
function tagVoxels() {
  const v = new VoxelModel();
  const R = 0xd83a2a, RD = 0xa82418, RL = 0xff6a4a;
  for (let y = -6; y <= 6; y++) for (let x = -5; x <= 5; x++) {
    if (y > 3 && Math.abs(x) > 5 - (y - 3)) continue; // the clipped top corners
    const c = x === -5 || y === 6 ? RL : x === 5 || y === -6 ? RD : R;
    v.set(x, y, 0, c);
  }
  // the eyelet and a loop of string
  v.set(0, 5, 1, 0xfff0d0); v.set(-1, 5, 1, 0xd8c8a0); v.set(1, 5, 1, 0xd8c8a0); v.set(0, 4, 1, 0xd8c8a0);
  for (const [x, y] of [[0, 6], [-1, 7], [-2, 8], [-2, 9], [-1, 10], [0, 10], [1, 9], [1, 8]]) v.set(x, y, 1, 0xf0e0b8);
  // a white "X" stamp and two lines of tiny lettering
  for (let k = -2; k <= 2; k++) { v.set(k, k - 1, 1, 0xfff6e8); v.set(k, -k - 1, 1, 0xfff6e8); }
  for (let x = -3; x <= 3; x++) if (x % 2 === 0 || x === 1) v.set(x, 2, 1, 0xffd0c0);
  return v;
}

// ------------------------------------------------------------------ coins
function coinVoxels() {
  const v = new VoxelModel();
  const G = 0xffc832, GD = 0xc88a12, GL = 0xfff0a0;
  const coin = (ox, oy, oz) => {
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      if (x * x + z * z > 11) continue;
      const rim = x * x + z * z > 6;
      v.set(ox + x, oy, oz + z, rim ? G : GD);
      v.set(ox + x, oy + 1, oz + z, rim ? (x < 0 ? GL : G) : x === 0 || z === 0 ? GL : G);
    }
  };
  for (let k = 0; k < 5; k++) coin(h3(k, 1, 2) < 0.5 ? 0 : 1, k * 2, h3(k, 3, 1) < 0.5 ? 0 : -1);
  coin(4, 1, 2); // one that slid off the stack
  return v;
}

const BUILDERS = { egg: eggVoxels, pellets: pelletVoxels, scope: scopeVoxels, tag: tagVoxels, coins: coinVoxels };

export function makeProp(name, o = {}) {
  try {
    if (name === 'fish') {
      const vm = fishVoxels(fishModel(o.species || 'bluegill', o.male !== false), !!o.golden);
      const g = meshOf(vm, o.scale || 0.027);
      g.rotation.y = o.turn ?? -0.35; // three-quarter view: the face toward us
      g.userData.kind = 'fish';
      return g;
    }
    const b = BUILDERS[name];
    if (!b) return null;
    const g = meshOf(b(), o.scale || FV);
    g.userData.kind = name;
    if (name === 'scope') g.rotation.z = 0.2;
    return g;
  } catch (e) {
    console.warn('[tut] prop', name, e);
    return null;
  }
}

export function disposeProp(p) { try { p?.userData?.dispose?.(); } catch { /* ignore */ } }
