// [v32 dig] SnapperProf: "Professor Ambrose Snapp", an old alligator snapping turtle
// and the grumpiest paleontologist in Canada. Same CHIBI biped as the other
// neighbours, but built like a boulder: a huge triangular head with a heavily
// hooked beak and rough tubercled skin, little grumpy eyes ringed by fleshy star
// filaments, a dark spiky carapace with three rows of tall pyramid keels and a
// serrated back rim (algae on it, and an orange survey flag stuck in it), a long
// saw-crested tail, big clawed feet. Field kit: a dented pith helmet with brass
// goggles on the band, a khaki vest stuffed with brushes and pencils, a brass
// loupe on a cord, a rock hammer. On his tongue lives Gerald, the pink worm lure
// (it wiggles when his mouth opens: "Gerald, NOT NOW").
//
//   const s = new SnapperProf();  scene.add(s.root);
//   s.play('loupe');   // up goes the loupe: one huge eye, a long "hmmm", an approving grunt
//   s.onEvent = (name) => {};  // 'step' | 'tink' (hammer) | 'brush' | 'chomp' | 'huff' | 'gerald'
//
// Anims: idle talk wave happy laugh walk loupe brush tap_hammer lure grumble snap
// Expressions: neutral happy talk surprised sleepy smug laugh focused proud grumpy (+ BASE_EXPRS)
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.25 tall to the helmet top.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, geoCache, mirrorX, handModel, K, beat, win, pulse,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, PUFF_ROWS } from './npcProps.js';

const C = {
  skin: 0x6e6852, skinD: 0x534e3c, skinL: 0x8a826a, skinDD: 0x3a3628, tub: 0x9c9478, belly: 0xb8aa82, bellyD: 0x968a66, bellyL: 0xd2c69e,
  beak: 0x3e382c, beakD: 0x2a261e, beakL: 0x5e5644, mouthIn: 0xd8a8a0, mouthD: 0xa8746c, tongue: 0xe8908a,
  shell: 0x4a4430, shellD: 0x36321f, shellL: 0x6a6244, seam: 0x221f14, keel: 0x5a5236, keelL: 0x7e7452, algae: 0x5c7a34, algaeL: 0x7c9c44,
  vest: 0xc8b47c, vestD: 0xa08c58, vestL: 0xdccc96, stitch: 0x7a6640, pocket: 0xb4a06a,
  hat: 0xe4d6a8, hatD: 0xc0b080, hatL: 0xf4ead0, band: 0x6a4a2a, bandD: 0x4a3018,
  brass: 0xe0b44a, brassD: 0xa8822a, brassL: 0xfff0a0, lens: 0x9ad0e0, lensL: 0xe8faff,
  wood: 0xa8743e, woodD: 0x7e5228, woodL: 0xc89058, steel: 0xa8b0bc, steelD: 0x6e7684, steelL: 0xe8eef4,
  bristle: 0x3a2a1c, pencil: 0xf2c230, flag: 0xff7a2a, flagD: 0xc8501a, claw: 0xd8ccb0, clawD: 0xa89c80,
  worm: 0xff8aa8, wormD: 0xe0607e, wormL: 0xffc4d4,
};

const D = {
  CHIBI: { body: 0.84, head: 1.3, hatTilt: 0.14, tail: 1.1 },
  HIP_Y: 5, WAIST: 1, NECK: 6.4, NECK_Z: 1.6, SH: [6.0, 5.2, 0.8], L_UP: 3.0, L_FORE: 3.0, L_HAND: 1.8,
  THIGH: 2.4, SHIN: 2.6, LEG_X: 3.3, EAR: [5.2, 4.2, 1.2], TAIL: [0.4, -6.2],
};

// ------------------------------------------------------------------ models
const skinCol = (x, y, z) => {
  const h = hash3(x, y, z);
  if (h < 0.05) return C.tub; // little pale tubercles
  return tone(x, y, z, C.skin, C.skinD, C.skinL, 0.12, 0.08);
};
const vestCol = (x, y, z) => tone(x, y, z, C.vest, C.vestD, C.vestL, 0.08, 0.06);
function surfZ(v, x, y) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; return null; }
function topY(v, x, z) { for (let y = 20; y >= -6; y--) if (v.has(x, y, z)) return y; return null; }

function pelvisModel() {
  const v = new VoxelModel();
  ell(v, 0, -0.4, -0.2, 5.6, 3.2, 4.6, (x, y, z) => (z > 1 ? tone(x, y, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.06) : y > 1 ? vestCol(x, y, z) : skinCol(x, y, z)));
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // the body inside (vest in front), the carapace dome over the back and shoulders
  ell(v, 0, 3.2, 0.6, 5.8, 5.4, 4.8, (x, y, z) => (y < -1 ? null : vestCol(x, y, z)));
  const CY = 4.4, CZ = -3.4, RX = 8.2, RY = 7.6, RZ = 7.0;
  const rowOf = (z) => Math.floor((z + 12) / 3.2);
  const colOf = (x, z) => Math.floor((x + 9 + (rowOf(z) % 2) * 1.6) / 3.4);
  const shellCol = (x, y, z) => {
    const r = rowOf(z), c = colOf(x, z);
    if (rowOf(z + 1) !== r || colOf(x + 1, z) !== c) return C.seam;
    const h = hash3(x, y, z);
    if (h < 0.06) return C.algae;
    if (h > 0.95) return C.shellL;
    return tone(x, y, z, C.shell, C.shellD, C.shellL, 0.14, 0.04);
  };
  ell(v, 0, CY, CZ, RX, RY, RZ, (x, y, z) => (y < -1.5 || z > 1.2 ? null : shellCol(x, y, z)));
  // the bottom rim of the shell: serrated points at the back (marginal scutes)
  for (let x = -8; x <= 7; x++) for (let z = -11; z <= 1; z++) {
    if (!v.has(x, -1, z) || v.has(x, -2, z)) continue;
    const back = z < -5;
    v.set(x, -1, z, (x + z) % 3 === 0 ? C.seam : C.shellD);
    if (back && (x + 20) % 3 === 0 && !v.has(x, -1, z - 1)) v.set(x, -2, z, C.shellD).set(x, -3, z, C.seam);
  }
  // three rows of pyramid keels along the top: the alligator snapper's dinosaur back
  for (const [kx, big] of [[-5, 0], [0, 1], [4, 0]]) {
    for (let z = -9; z <= 0; z += 3) {
      const ty = topY(v, kx, z);
      if (ty == null || ty < 6) continue;
      const hgt = big ? 4 : 3;
      for (let k = 0; k < hgt; k++) {
        const r = Math.max(0, (big ? 2 : 1) - Math.floor(k * 0.8));
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          const c = k === hgt - 1 ? C.keelL : dz > 0 || dx < 0 ? C.keelL : (dx + dz + k) % 3 === 0 ? C.shellD : C.keel;
          v.set(kx + dx, ty + 1 + k, z + dz - Math.round(k * 0.5), c); // the tips lean back
        }
      }
      v.set(kx, ty + hgt + 1, z - Math.round(hgt * 0.5), C.keelL);
    }
  }
  // a dab of moss + algae fringe on the back rim
  for (let x = -7; x <= 6; x++) { const z = -10; const ty = topY(v, x, z); if (ty != null && hash3(x, 3, z) < 0.5) v.set(x, ty, z, hash3(x, 4, z) < 0.5 ? C.algae : C.algaeL); }
  // an orange survey flag on a wire, stuck in the shell (he forgot it there in 1987)
  { const fx = 6, fz = -5, ty = topY(v, fx, fz) ?? 8; for (let y = 1; y <= 5; y++) v.set(fx, ty + y, fz, 0x8a8e96); for (let y = 3; y <= 5; y++) for (let z = 1; z <= 3; z++) v.set(fx, ty + y, fz - z, y === 3 || z === 3 ? C.flagD : C.flag); }
  // the vest front: seam, two chest pockets with flaps, brush + pencils sticking out
  for (let y = 0; y <= 7; y++) { const z = surfZ(v, -1, y); if (z != null && z > 1) v.set(-1, y, z, y % 2 ? C.stitch : C.vestD); }
  for (const [x0, x1, y0, y1] of [[-5, -2, 3, 5], [1, 4, 3, 5], [-5, -2, 0, 1], [1, 4, 0, 1]]) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const z = surfZ(v, x, y);
      if (z == null || z < 1) continue;
      const flap = y === y1;
      v.set(x, y, z + 1, flap ? C.vestD : x === x0 || x === x1 ? C.stitch : C.pocket);
    }
  }
  { // brush in the left chest pocket (viewer's right): handle up, dark bristles
    const z = (surfZ(v, 2, 5) ?? 4) + 1;
    for (let y = 5; y <= 8; y++) v.set(2, y, z, y === 8 ? C.woodL : C.wood);
    v.set(2, 9, z, C.brassD); v.set(2, 10, z, C.bristle); v.set(3, 10, z, C.bristle); v.set(1, 10, z, C.bristle); v.set(2, 11, z, C.bristle);
  }
  { // two pencils in the other pocket
    const z = (surfZ(v, -4, 5) ?? 4) + 1;
    for (let y = 5; y <= 7; y++) { v.set(-4, y, z, C.pencil); v.set(-3, y + 1, z, 0x3a8ad8); }
    v.set(-4, 8, z, 0xf0d8b0); v.set(-3, 9, z, 0xf0d8b0);
  }
  // the loupe on a cord: a brass ring at the belly
  for (const [x, y] of [[-1, 2], [0, 2], [-2, 1], [1, 1], [-2, 0], [1, 0], [-1, -1], [0, -1]]) { const z = (surfZ(v, x, y) ?? 4) + 1; v.set(x, y, z, y === 2 ? C.brassL : C.brass); }
  { const z = (surfZ(v, -1, 0) ?? 4) + 1; v.set(-1, 0, z, C.lens).set(0, 0, z, C.lensL).set(-1, 1, z, C.lensL).set(0, 1, z, C.lens); }
  for (let y = 3; y <= 6; y++) { const z = (surfZ(v, -1 + (y > 4 ? 1 : 0), y) ?? 4) + 1; v.set(-1 + (y > 4 ? 1 : 0), y, z, C.bandD); }
  // the neck where the big head goes on: wrinkled skin
  rbox(v, -3, 2, 6, 9, -1, 3, 1.4, skinCol);
  return v;
}
function headModel() {
  // a big wedge of a head: wide at the back, narrowing to a heavy hooked beak (front = +z)
  const v = new VoxelModel();
  for (let z = -4; z <= 6; z++) {
    const u = (z + 4) / 10; // 0 back .. 1 front
    const hw = lerp(6.2, 3.2, u * u), hh = lerp(4.4, 2.9, u), cy = lerp(4.3, 3.4, u);
    for (let x = -7; x <= 6; x++) for (let y = 0; y <= 9; y++) {
      const dx = (x + 0.5) / hw, dy = (y + 0.5 - cy) / hh;
      const d = dx * dx + dy * dy * (dy > 0 ? 1 : 1.3);
      if (d > 1) continue;
      let c = skinCol(x, y, z);
      if (y <= 1 && abs(x + 0.5) < hw - 1.5) c = tone(x, y, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.06); // pale throat
      v.set(x, y, z, c);
    }
  }
  // the beak: a hard horny upper jaw that hooks down over the lower one
  for (let z = 5; z <= 8; z++) for (let x = -3; x <= 2; x++) for (let y = 1; y <= 5; y++) {
    const half = z < 7 ? 3 : z === 7 ? 2 : 1;
    if (abs(x + 0.5) > half) continue;
    if (y > 5 - (z - 5)) continue; // the top slopes down to the tip
    v.set(x, y, z, y === 1 ? C.beakL : (x + y + z) % 4 === 0 ? C.beakD : C.beak);
  }
  for (const x of [-1, 0]) { v.set(x, 0, 8, C.beak); v.set(x, -1, 8, C.beakD); v.set(x, 0, 7, C.beakD); } // the hook
  v.set(-1, 4, 7, C.beakD).set(0, 4, 7, C.beakD); // nostrils
  // the mouth line along the sides (a long grumpy downturn)
  for (let z = -1; z <= 6; z++) for (const s of [-1, 1]) {
    const hw = lerp(6.2, 3.2, ((z + 4) / 10) ** 2);
    const x = s < 0 ? -Math.round(hw) : Math.round(hw) - 1;
    const y = z < 2 ? 2 : 1;
    if (v.has(x, y, z)) v.set(x, y, z, C.skinDD);
  }
  // heavy brow ridges + a bony knob on top, rough bumps over the skull
  for (let x = -6; x <= 5; x++) { const z = 3; const ty = topY(v, x, z); if (ty != null && abs(x + 0.5) > 1.5) v.set(x, ty + 1, z, abs(x + 0.5) > 3.5 ? C.skinD : C.skinL); }
  for (let k = 0; k < 26; k++) {
    const x = Math.floor(hash3(k, 1, 7) * 11) - 6, z = Math.floor(hash3(k, 2, 7) * 9) - 4;
    const ty = topY(v, x, z);
    if (ty != null && ty >= 6) v.set(x, ty + 1, z, hash3(k, 3, 7) < 0.5 ? C.tub : C.skinL);
  }
  // fleshy filaments under the chin
  for (const [x, z] of [[-3, 1], [2, 1], [-2, -1], [1, -1], [-4, -2], [3, -2]]) v.set(x, -1, z, C.skinD);
  return v;
}
function jawModel() {
  const v = new VoxelModel();
  for (let z = -1; z <= 7; z++) {
    const u = (z + 1) / 8;
    const hw = lerp(5.2, 2.2, u * u);
    for (let x = -6; x <= 5; x++) for (let y = -2; y <= 0; y++) {
      if (abs(x + 0.5) > hw) continue;
      const top = y === 0 && abs(x + 0.5) < hw - 1 && z < 6;
      v.set(x, y, z, top ? (abs(x + 0.5) < 1.2 && z > 0 && z < 5 ? C.tongue : C.mouthIn) : z >= 6 ? C.beak : y === -2 ? tone(x, y, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.06) : skinCol(x, y, z));
    }
  }
  for (const x of [-1, 0]) v.set(x, 1, 7, C.beakL); // the lower beak's little upturn
  return v;
}
function geraldModel() {
  // Gerald: a pink worm-shaped lure (fine voxels), pivot at his root on the tongue, curling up
  const v = new VoxelModel();
  const pts = [[0, 0, 0], [0, 1, 1], [1, 2, 1], [1, 3, 2], [0, 4, 3], [-1, 4, 4], [-1, 5, 5]];
  pts.forEach(([x, y, z], i) => {
    const c = i % 2 ? C.wormD : C.worm;
    v.set(x, y, z, c).set(x - 1, y, z, c).set(x, y, z - 1, C.wormD);
    if (i === pts.length - 1) v.set(x, y + 1, z, C.wormL).set(x - 1, y + 1, z, C.wormL);
  });
  return v;
}
function helmetModel() {
  // a dented pith helmet: dome, wide brim, leather band, brass goggles on the front of the band
  const v = new VoxelModel();
  for (let x = -10; x <= 9; x++) for (let z = -10; z <= 10; z++) {
    const r = Math.hypot((x + 0.5) / 9.4, (z + 0.5) / 9.9);
    if (r > 1 || r < 0.66) continue;
    const droop = (abs(z + 0.5) > 7 ? -1 : 0);
    v.set(x, droop, z, r > 0.93 ? C.hatD : (x + z) % 7 === 0 ? C.hatD : C.hat);
  }
  ell(v, 0, 0.5, 0, 6.6, 5.6, 7.2, (x, y, z) => (y < 0 ? null : y <= 1 ? (y === 1 ? C.band : C.bandD) : hash3(x, y, z) < 0.08 ? C.hatD : y > 4 ? C.hatL : C.hat));
  // a dent on the left side of the crown
  for (const [x, y, z] of [[-5, 3, 1], [-5, 4, 2], [-4, 4, 1], [-5, 3, 2]]) v.set(x, y, z, C.hatD);
  v.set(0, 6, 0, C.brassD).set(0, 7, 0, C.brass); // vent button
  // brass field goggles strapped to the front of the band
  for (const cx of [-2, 2]) for (let x = cx - 1; x <= cx + 1; x++) for (let y = 1; y <= 3; y++) {
    const z = 7;
    const ring = x !== cx || y !== 2;
    v.set(x - (cx < 0 ? 1 : 0), y, z, ring ? (y === 3 ? C.brassL : C.brass) : C.lens);
  }
  v.set(-2, 3, 7, C.lensL).set(2, 3, 8, C.brassD);
  v.set(-1, 2, 7, C.brassD).set(0, 2, 7, C.brassD);
  return v;
}
function earModel() {
  // (the "ear" joints) the fleshy rough bumps behind the eyes on each side of the head
  const v = new VoxelModel();
  v.set(0, 0, 0, C.skinD).set(0, 1, 0, C.skin).set(0, 0, -1, C.skinD).set(1, 0, 0, C.tub).set(0, -1, 0, C.skinD);
  return v;
}
function upperModel() { const v = new VoxelModel(); rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, skinCol); return v; }
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.1, skinCol);
  // rolled-up shirt cuff at the elbow
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.set(x, 0, z, C.vestD);
  return v;
}
function thighModel() { const v = new VoxelModel(); rbox(v, -2, 2, -D.THIGH, 1, -2, 1, 1.4, skinCol); return v; }
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -2, 2, -D.SHIN + 1, 0, -2, 1, 1.4, (x, y, z) => ((x + y + z) % 3 === 0 ? C.skinD : skinCol(x, y, z)));
  // big flat feet with four long claws
  rbox(v, -3, 2, -D.SHIN, -D.SHIN + 1, -2, 3, 0.9, (x, y, z) => tone(x, y, z, C.skinD, C.skinDD, C.skin, 0.2, 0.05));
  for (const x of [-3, -1, 0, 2]) { v.set(x, -D.SHIN, 4, C.claw); v.set(x, -D.SHIN, 5, C.clawD); }
  return v;
}
function tailModel() {
  // a long thick tail with three saw-tooth crests (pivot at the base, runs back and down)
  const v = new VoxelModel();
  for (let k = 0; k <= 9; k++) {
    const z = -k, y = -Math.round(k * 0.45), r = lerp(2.4, 0.8, k / 9);
    for (let x = -3; x <= 2; x++) for (let yy = -3; yy <= 3; yy++) {
      if (Math.hypot(x + 0.5, yy) > r) continue;
      v.set(x, y + yy, z, yy < 0 ? tone(x, yy, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.06) : skinCol(x, y + yy, z));
    }
    if (k % 2 === 0 && k < 9) {
      const ty = y + Math.ceil(r);
      v.set(0, ty + 1, z, C.keelL).set(-1, ty + 1, z, C.keel); // centre crest
      if (r > 1.4) { v.set(-2, ty, z, C.keel); v.set(1, ty, z, C.keel); } // side crests
    }
  }
  return v;
}
function hammerModel() {
  // a rock hammer: pivot at the grip, handle along +Y, a square head with a pick end
  const v = new VoxelModel();
  for (let y = -3; y <= 12; y++) { v.set(0, y, 0, y < 0 ? C.woodD : tone(0, y, 0, C.wood, C.woodD, C.woodL, 0.2, 0.15)); v.set(-1, y, 0, C.woodD); }
  for (let z = -3; z <= 6; z++) for (let y = 12; y <= 15; y++) for (let x = -2; x <= 1; x++) {
    if (z > 2 && (y < 13 || y > 14 || x < -1 || x > 0)) continue; // the pick end tapers
    v.set(x, y, z, z < -2 ? C.steelD : y === 15 ? C.steelL : C.steel);
  }
  v.set(-1, 13, 7, C.steelL).set(0, 14, 7, C.steelD);
  return v;
}
function brushModel() {
  const v = new VoxelModel();
  for (let y = -3; y <= 8; y++) { v.set(0, y, 0, tone(0, y, 0, C.wood, C.woodD, C.woodL, 0.2, 0.15)); v.set(-1, y, 0, C.woodD); }
  for (let x = -2; x <= 1; x++) { v.set(x, 9, 0, C.brass); v.set(x, 9, -1, C.brassD); }
  for (let x = -3; x <= 2; x++) for (let y = 10; y <= 12; y++) v.set(x, y, 0, (x + y) % 2 ? C.bristle : 0x5a4030).set(x, y, -1, C.bristle);
  return v;
}
function loupeModel() {
  const v = new VoxelModel();
  for (let y = -4; y <= 2; y++) v.set(0, y, 0, C.woodD);
  for (let a = 0; a < 24; a++) { const x = Math.round(cos((a / 24) * TAU) * 4), y = 7 + Math.round(sin((a / 24) * TAU) * 4); v.set(x, y, 0, y > 8 ? C.brassL : C.brass); }
  for (let x = -3; x <= 3; x++) for (let y = 4; y <= 10; y++) if (Math.hypot(x, y - 7) < 3.4 && !v.has(x, y, 0)) v.set(x, y, 0, x < 0 && y > 7 ? C.lensL : C.lens);
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()), jaw: buildGeo(jawModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())), helmet: buildGeo(helmetModel()),
    gerald: buildGeo(geraldModel(), [0, 0, 0], FV),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    hammer: buildGeo(hammerModel(), [0, 0, 0], FV), brush: buildGeo(brushModel(), [0, 0, 0], FV), loupe: buildGeo(loupeModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.skin, C.skinDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.skin, C.skinDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 44, h: 18, eyes: [{ x: 11, y: 10 }, { x: 33, y: 10 }], rx: 4.6, ry: 5, style: 'toon',
  blush: [{ x: 4, y: 15 }, { x: 40, y: 15 }], blushW: 2,
  mw: 8, mh: 4, mx: 4, my: 1, mstyle: 'deer', mHalf: 2,
  pal: { i: '#3a2a14', I: '#7a5a2a', b: '#2a2418', f: '#6e6852', F: '#3a3628', w: '#f4ecd0', W: '#d8ccb0' },
};
// the alligator snapper's star of fleshy filaments around each eye + heavy wrinkles
function eyeRings(P, st, cfg) {
  if (st.eyes === 'heart') return;
  cfg.eyes.forEach((e, i) => {
    const side = i === 0 ? -1 : 1;
    const R = 4.9;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + 0.3;
      for (let r = R; r <= R + (k % 2 ? 2.2 : 1.4); r += 0.7) {
        const x = Math.floor(e.x + cos(a) * r * 1.0), y = Math.floor(e.y + sin(a) * r * 0.9);
        if (!P.get(x, y)) P.set(x, y, r > R + 1 ? 'F' : 'f');
      }
    }
    // the deep crease under the eye
    for (let x = -3; x <= 3; x++) if (!P.get(e.x + x, e.y + 6)) P.set(e.x + x, e.y + 6 - (abs(x) > 2 ? 1 : 0), 'F');
    // heavy brow wrinkle toward the middle (a permanent frown)
    for (let k = 0; k < 3; k++) if (!P.get(e.x - side * (2 + k), e.y - 7 + k)) P.set(e.x - side * (2 + k), e.y - 7 + k, 'F');
  });
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: 'angry', mouth: 'smile', blush: 0, tear: 0 },
  grumpy: { eyes: 'half', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'open', brows: 'flat', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'flat', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  laugh: { eyes: 'shut', brows: 'up', mouth: 'laugh', blush: 1, tear: 1 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  lure: { eyes: 'half', brows: 'flat', mouth: 'yell', blush: 0, tear: 0 },
};
const JAW_OPEN = { open: 0.42, laugh: 0.5, yell: 0.62, grin: 0.12, o: 0.3, sip: 0.08, chew2: 0.12, chew1: 0.05, cheeky: 0.04 };

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
export class SnapperProf extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('SnapperProf', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    // the jaw hinge at the back of the mouth, Gerald on the tongue
    this.jaw = new THREE.Group(); this.jaw.position.set(0, 1.6 * VS, -1 * VS); this.head.add(this.jaw);
    this.mesh(G.jaw, this.jaw, { z: 1 * VS });
    this._jaw = 0;
    this.gerald = new THREE.Group(); this.gerald.position.set(-0.4 * VS, 0.3 * VS, 3.4 * VS); this.jaw.add(this.gerald);
    this.geraldMesh = this.mesh(G.gerald, this.gerald);
    this.joint('hat', this.head, 0, 7.6, -0.2);
    this.mesh(G.helmet, this.hat);
    this.face = new NpcFace(FACE, { eyes: eyeRings });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 6.2 - FACE.h / 8, 5.3);
    // tools: hammer (right), brush (right, when brushing), loupe (left)
    this.hammer = this.mesh(G.hammer, this.gripR);
    this.hammer.scale.setScalar(1.5);
    this.brush = this.mesh(G.brush, this.gripR);
    this.brush.scale.setScalar(1.4);
    this.loupe = this.mesh(G.loupe, this.gripL);
    this.loupe.scale.setScalar(1.5);
    this.hold = new THREE.Group(); this.gripR.add(this.hold);
    const spr = (rows, n, s) => [...Array(n)].map(() => this.sprite(rows, s, this.space));
    this.puffs = spr(PUFF_ROWS, 4, 0.06);
    this.sparks = spr(SPARK_ROWS, 3, 0.07);
    this.hearts = spr(HEART_ROWS, 2, 0.07);
    this.scalar('lure', 0); // 0..1 Gerald stands up and wiggles
    this.scalar('jawK', 0); // extra jaw opening (anims)
    this.scalar('dust', 0); // 0..1 dust burst at the brush tip
    this.scalar('huff', 0); // steam puff from the nostrils
    this.scalar('spark', 0);
    this.scalar('hearts', 0);
    this.scalar('hammerA', 0); // hammer swing (rad)
    this.jiggle('hat', 'rx', { k: 160, c: 8, az: -0.8, ay: 0.3, max: 0.3, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 160, c: 8, ax: 0.8, max: 0.25, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.06, max: 0.08, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this.jiggle('tail', 'ry', { k: 120, c: 6, ax: 0.5, yaw: 0.03, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _updateFace(dt, f, def) {
    super._updateFace(dt, f, def);
    const tgt = max(JAW_OPEN[this._fst.mouth] || 0, (this.k?.jawK || 0) * 0.62);
    this._jaw += (tgt - this._jaw) * Math.min(1, dt * 14);
    this.jaw.rotation.x = this._jaw;
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // tools
    this.hammer.visible = !!p.vis.hammer;
    this.brush.visible = !!p.vis.brush;
    this.loupe.visible = !!p.vis.loupe;
    if (this.hammer.visible) { const a = k.hammerA; orientIn(this.hammer, this.chest, [0, cos(a), sin(a)], [0, -sin(a), cos(a)], 1); }
    if (this.brush.visible) orientIn(this.brush, this.chest, [0.2, -0.3, 1], [0, 1, 0], 1);
    if (this.loupe.visible) orientIn(this.loupe, this.chest, [0, 1, 0.15], [0, 0, 1], 1);
    // Gerald: tucked in on the tongue, wiggling harder when the mouth is open or he is "fishing"
    const open = this._jaw;
    const L = clamp(k.lure, 0, 1);
    const wig = (0.25 + open * 1.2 + L * 1.4);
    this.gerald.rotation.z = sin(tz * (8 + L * 6)) * 0.35 * wig;
    this.gerald.rotation.x = -0.4 - L * 0.5 + sin(tz * 5.3) * 0.12 * wig;
    this.gerald.scale.setScalar(1 + L * 0.35);
    this.geraldMesh.visible = open > 0.06 || L > 0.05;
    // dust at the brush tip, puffs from the nostrils, sparkles / hearts round the head
    if (this.brush.visible) { this.brush.updateWorldMatrix(true, false); _w2.set(0, 12 * FV, 0); this.brush.localToWorld(_w2); this.space.worldToLocal(_w2); }
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 4.6 * VS, 8 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    this.puffs.forEach((s, i) => {
      const u = (tz * 1.6 + i / 4) % 1;
      const dust = k.dust > 0.05 && this.brush.visible, huff = k.huff > 0.05;
      s.visible = dust || huff;
      if (!s.visible) return;
      const o = dust ? _w2 : _w;
      s.position.set(o.x + (i - 1.5) * 0.04 + sin(u * 7 + i) * 0.03, o.y + u * (dust ? 0.12 : 0.18), o.z + 0.02 + u * 0.06);
      s.scale.setScalar((dust ? 0.05 : 0.045) * (0.4 + u) * (u < 0.7 ? 1 : (1 - u) / 0.3));
    });
    _w.set(0, 9 * VS, 2 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.6;
      s.position.set(_w.x + cos(a) * 0.32, _w.y + 0.12 + sin(a * 1.3) * 0.1, _w.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i * 0.5) % 1;
      s.visible = k.hearts > 0.5;
      s.position.set(_w.x + (i ? 0.16 : -0.14) + sin(u * 6 + i) * 0.03, _w.y + 0.1 + u * 0.26, _w.z - 0.05);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 5));
    });
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Heavy stance: wide feet, a hunch forward (a shell is heavy), slow breathing. */
function stand(p, rig, t, amt = 1) {
  rig.life(t * 0.8, p, amt);
  rig.stance(p, 0.5, 0.6, 0.6, 0.22);
  p.chest.rx += 0.1;
  p.head.rx -= 0.06;
  p.tail.rx = -0.15 + sin(t * 0.9) * 0.04;
}
/** Hands clasped behind the back (under the shell rim), the professor's walk-around pose. */
function behind(p, rig, w = 1) {
  rig.reach(p, 1, 2.6, 1.0, -3.4, [1, 0.2, 0.4], w);
  rig.reach(p, -1, 2.6, 1.0, -3.4, [1, 0.2, 0.4], w);
  if (w > 0.5) { p.handL = p.handR = 'fist'; }
}
/** Hammer in the right hand, resting on the shoulder. */
function hammerShoulder(p, rig, w = 1) {
  rig.reach(p, -1, 4.6, 6.6, 3.0, [1, -0.5, -0.2], w);
  p.handR = 'fist'; p.vis.hammer = true; p.k.hammerA = -2.2;
}
function armsCrossed(p, rig, w = 1) {
  rig.reach(p, 1, 1.4, 3.6, 6.2, [1, -0.3, -0.4], w);
  rig.reach(p, -1, 1.0, 4.2, 6.6, [1, -0.3, -0.4], w);
  if (w > 0.5) { p.handL = 'fist'; p.handR = 'fist'; }
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const T = t % 14;
    // hands behind the back... a look around the dig... grumble at a rock... loupe peek
    behind(p, rig);
    const look = K(T, [[0, 0], [2, 0], [3, 0.35, 'io'], [5, 0.35], [6, -0.3, 'io'], [8, -0.3], [9, 0, 'io']]);
    p.head.ry += look * 0.5; p.chest.ry += look * 0.12;
    f.look = [look * 1.6, 0];
    const nod = win(T, 9.6, 11.4, 0.3, 0.3);
    p.head.rx += nod * sin(t * 6) * 0.08;
    if (nod > 0.3) f.expr = 'grumpy';
    // Gerald peeks out by himself (he gets ideas)
    const peek = win(T, 11.8, 13.2, 0.2, 0.3);
    p.k.jawK = peek * 0.35; p.k.lure = peek * 0.6;
    if (peek > 0.4) { f.eyes = 'half'; f.look = [0, 1]; }
    if (beat(s, 'g', T, 99, 12.1)) rig._emit('gerald');
    p.mover.y += abs(sin(t * 0.9)) * 0.08;
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a heavy, swaying, shell-rocking plod
    const P = 0.62, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.45);
    p.hips.y = -0.5 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.1; p.chest.rz = -cs * 0.08; p.hips.ry = -sn * 0.1;
    p.chest.rx = 0.16; p.head.rx = -0.12; p.head.rz = cs * 0.05;
    p.armL.rx = sn * 0.45; p.armR.rx = -sn * 0.45; p.armL.rz = 0.45; p.armR.rz = -0.45;
    p.foreL.rx = p.foreR.rx = -0.4; p.handL = p.handR = 'fist';
    p.tail.ry = sn * 0.2;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'grumpy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    // one curt raise of the hammer. That is a wave. That is all you get.
    const wv = sin(t * 4.5);
    rig.reach(p, -1, 7.0, 10.2 + wv * 0.4, 2.8, [1, -0.6, 0.2]);
    p.handR = 'fist'; p.vis.hammer = true; p.k.hammerA = 0.2 + wv * 0.15;
    behind(p, rig, 0); rig.reach(p, 1, 2.6, 1.0, -3.4, [1, 0.2, 0.4]); p.handL = 'fist';
    p.chest.rz -= 0.05; p.head.rz += 0.06;
    f.mouth = 'flat';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 6, open: 'open', mid: 'grin', shut: 'flat', o: 'o' });
    // lecturing: the hammer points... jabs... then back to the shoulder
    const T = t % 7;
    const point = win(T, 0.3, 2.6, 0.3, 0.3), jab = win(T, 3.4, 5.0, 0.2, 0.3);
    hammerShoulder(p, rig, 1 - max(point, jab));
    if (point > 0) {
      rig.reach(p, -1, 4.0, 6.0 + sin(t * 3) * 0.4, 7.8, [1, -0.5, -0.3], point);
      p.vis.hammer = true; p.k.hammerA = lerp(-2.2, 1.2, point); p.chest.ry -= point * 0.12;
    }
    if (jab > 0) {
      const hit = abs(sin((T - 3.4) * 9));
      rig.reach(p, -1, 3.2, 5.4 + hit * 0.8, 7.4, [1, -0.5, -0.3], jab);
      p.vis.hammer = true; p.k.hammerA = 1.4 + hit * 0.2;
      p.head.rx += jab * 0.06 * hit;
    }
    behind(p, rig, 0); rig.reach(p, 1, 3.4, 2.6, 4.4, [1, -0.3, -0.5]); p.handL = 'relax';
    p.head.rx += on ? sin(t * 6) * 0.05 : 0;
    p.head.rz += sin(t * 1.1) * 0.05;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // a wheezy, rusty old laugh: "heh-heh-hnnhh"
    const ha = sin(t * 10);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.5 + abs(ha) * 0.3, 0.6, 0.6, 0.22);
    for (const sd of [1, -1]) rig.reach(p, sd, 4.8, 1.0 + abs(ha) * 0.4, 5.8, [0.9, -0.4, -0.6]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.8;
    p.chest.s = 1 + ha * 0.04; p.chest.rx += -0.1 + ha * 0.04; p.head.rx += -0.24 + ha * 0.06;
    p.mover.y += abs(ha) * 0.2;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
  },
});

const HAPPY = 2.2;
def('happy', {
  dur: HAPPY, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY);
    // a stiff old-turtle fist pump (and an immediate "my back")
    stand(p, rig, t, 0.5);
    const up = win(t, 0.15, 1.5, 0.15, 0.4);
    const pump = up * abs(sin(t * 9));
    rig.reach(p, -1, lerp(4.6, 6.0, up), lerp(6.6, 10.4, up) + pump * 0.8, lerp(3, 2.6, up), [1, -0.6, -0.2]);
    p.handR = 'fist'; p.vis.hammer = true; p.k.hammerA = lerp(-2.2, 0.1, up);
    behind(p, rig, 0); rig.reach(p, 1, 2.6, 1.0, -3.4, [1, 0.2, 0.4]); p.handL = 'fist';
    p.mover.y += up * 0.6 * abs(sin(t * 4.5));
    p.k.spark = clamp(t / 1.2, 0, 1) * (t < 1.9 ? 1 : 0);
    if (t > 1.6) { f.expr = 'grumpy'; p.chest.rx += 0.12; } // ...my back
    if (beat(s, 'st', t, 99, 0.8)) rig._emit('step');
  },
});

const LP = 5.2;
def('loupe', {
  dur: LP, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, LP);
    stand(p, rig, t, 0.5);
    // the loupe comes up to one eye... a long "hmmmm"... a satisfied grunt
    const up = win(t, 0.3, 4.4, 0.45, 0.45);
    const m = rig.headPoint(p, 6.2, 7.2, _c);
    rig.reach(p, 1, lerp(3.0, 1.4, up), lerp(2.0, m[0] - 0.4, up), lerp(4.4, m[1] + 2.4, up), [1, -0.5, -0.3]);
    p.handL = 'fist'; p.vis.loupe = up > 0.15;
    hammerShoulder(p, rig, 1);
    p.head.rx += up * 0.18; p.chest.rx += up * 0.08;
    p.head.rz += up * sin(t * 0.8) * 0.05;
    if (up > 0.6) { f.eyes = 'wide'; f.brows = 'raised'; f.mouth = 'o'; f.look = [0.5, 0.6]; }
    if (t > 4.2) { f.expr = 'proud'; p.k.spark = win(t, 4.2, 5.2, 0.2, 0.3); }
  },
});

const BR = 4.8;
def('brush', {
  dur: BR, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, BR);
    // down on the knees (slowly, with a groan), brush brush brush, blow the dust off
    const down = win(t, 0.0, BR - 0.6, 0.6, 0.6);
    rig.life(t, p, 0.5);
    rig.stance(p, 0.5 + down * 2.4, 1.4 * down + 0.6, 0.6, 0.3);
    p.chest.rx += 0.1 + down * 0.45; p.head.rx -= down * 0.15;
    const sw = sin(t * 11) * down;
    rig.reach(p, -1, lerp(4.6, 1.6 + sw * 1.6, down), lerp(6.6, -1.6, down), lerp(3.0, 7.0, down), [1, -0.4, -0.3]);
    p.handR = 'fist';
    if (down > 0.2) { p.vis.brush = true; p.k.dust = abs(sw) > 0.5 ? 1 : 0; } else hammerShoulder(p, rig, 1);
    rig.reach(p, 1, 4.8, 1.0, 5.0, [0.9, -0.4, -0.6], down); p.handL = 'open';
    const blow = win(t, 3.4, 4.0, 0.1, 0.2);
    if (blow > 0.3) { f.mouth = 'o'; p.k.huff = 1; p.k.dust = 0; }
    if (beat(s, 'b', t, 0.57, 0.6) && down > 0.6) rig._emit('brush');
  },
});

const TH = 3.6;
def('tap_hammer', {
  dur: TH, expr: 'grumpy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, TH);
    stand(p, rig, t, 0.6);
    // tap... tap... tap: the rock hammer on his palm, impatient
    const tap = abs(sin(t * 5.2));
    rig.reach(p, 1, 2.6, 4.2, 6.4, [1, -0.4, -0.4]); p.handL = 'open'; p.wristL.rx = 0.9;
    rig.reach(p, -1, 2.0, 5.0 + tap * 1.6, 6.8, [1, -0.5, -0.3]);
    p.handR = 'fist'; p.vis.hammer = true; p.k.hammerA = 1.9 - tap * 0.5;
    p.head.rx += 0.06; f.look = [0, 1];
    if (beat(s, 'tk', t, PI / 5.2, PI / 5.2 * 0.98)) rig._emit('tink');
  },
});

const LU = 5.6;
def('lure', {
  dur: LU, expr: 'lure', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, LU);
    stand(p, rig, t, 0.4);
    behind(p, rig);
    // the alligator snapper's trick: mouth wide open, very still... Gerald wiggles... SNAP!
    const open = K(t, [[0, 0], [0.8, 1, 'io'], [4.2, 1], [4.3, 0, 'in']]);
    p.k.jawK = open; p.k.lure = open;
    p.head.rx -= open * 0.12;
    if (t > 4.25 && t < 4.9) { f.eyes = 'shut'; p.mover.y += 0.4; p.head.rx += 0.1; }
    if (t > 4.9) { f.expr = 'smug'; }
    if (beat(s, 'g', t, 99, 1.2)) rig._emit('gerald');
    if (beat(s, 'c', t, 99, 4.28)) rig._emit('chomp');
  },
});

const GR = 4.2;
def('grumble', {
  dur: GR, expr: 'grumpy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, GR);
    stand(p, rig, t, 0.5);
    armsCrossed(p, rig);
    // foot tap, a huff of steam from the nostrils
    const tap = max(0, sin(t * 7));
    rig.legTo(p, 1, -p.mover.y + tap * 1.2, 0.8);
    p.head.rz += sin(t * 1.4) * 0.06;
    p.k.huff = win(t, 1.6, 2.6, 0.1, 0.3);
    f.mouth = 'flat';
    if (beat(s, 'h', t, 99, 1.7)) rig._emit('huff');
  },
});

const SN = 2.0;
def('snap', {
  dur: SN, expr: 'surprised', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SN);
    stand(p, rig, t, 0.4);
    behind(p, rig);
    // CHOMP: the beak snaps shut so hard his helmet jumps (and he startles himself)
    const o = K(t, [[0, 0], [0.35, 1, 'out'], [0.45, 0, 'in']]);
    p.k.jawK = o;
    const jolt = K(t, [[0.45, 0], [0.5, 1, 'out'], [0.9, 0, 'io']]);
    p.hat.y += jolt * 1.4; p.mover.y += jolt * 0.5;
    if (t > 0.5) f.expr = t > 1.3 ? 'grumpy' : 'surprised';
    if (beat(s, 'c', t, 99, 0.45)) rig._emit('chomp');
  },
});

export { ANIMS as SNAPPER_ANIMS };
