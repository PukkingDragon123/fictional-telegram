// [v26 seasons] Voxel models for the weather gear (src/data/ext/seasons.js),
// built with the facility kit (Draft / defineModels from facilityModels.js).
//   firepit      a ring of stones, a log teepee, a flickering fire (1x1)
//   patioheater  a tall brass mushroom heater with a glowing burner (1x1)
//   rainshelter  a red tin gable roof on four posts, a bench under it (2x2)
//   mistfan      a pedestal fan with spinning blades and misting nozzles (1x1)
//   greenhouse   glass house with a white frame, planters, a little stove pipe (2x2)
// root.userData.flames: the fire parts (shown only while the burner is lit; see Seasons).
import { defineModels, rbox, ball, log, gear, text, textW, P, toneOf, VF } from './facilityModels.js';

const { WOOD, WOOD_D, WOOD_M, BARK, STONE, IRON, IRON_L, BRASS, BRASS_D, BRASS_L, METAL, METAL_D, METAL_L, CHROME, RED, RED_D, RED_L, WHITE, FLAME, LEAF, GRASS } = P;
const ASH = [0x3a3438, 0x4a4246, 0x2e2a2e];
const EMBER = [0xff5a1a, 0xff8a2a, 0xd8341a];

// ================================================================ FIRE PIT (1x1)
function firepit(d, rnd) {
  const { f } = d;
  // ash bed
  for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) if (Math.hypot(x + 0.5, z + 0.5) < 6.2) f.set(x, 0, z, toneOf(ASH, x, 0, z));
  // stone ring: chunky rounded stones
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rnd() * 0.2;
    const cx = Math.cos(a) * 7.6, cz = Math.sin(a) * 7.6;
    const r = 1.9 + rnd() * 0.6;
    ball(f, cx, 1.2, cz, r, (x, y, z) => (y >= 2 ? STONE[2] : toneOf(STONE, x, y, z, i)));
  }
  // log teepee
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6;
    const x0 = Math.round(Math.cos(a) * 5), z0 = Math.round(Math.sin(a) * 5);
    f.line(x0, 1, z0, 0, 9, 0, i % 2 ? BARK[0] : BARK[1]);
    f.line(x0 + 1, 1, z0, 1, 9, 0, BARK[2]);
  }
  f.box(-3, 1, -1, 2, 2, 0, (x) => (x === -3 || x === 2 ? 0xd8a868 : WOOD_M)); // a log lying across
  // embers
  for (let i = 0; i < 8; i++) { const a = rnd() * 6.28, r = rnd() * 3.5; d.gf.set(Math.round(Math.cos(a) * r), 1, Math.round(Math.sin(a) * r), EMBER[i % 3]); }
  // the fire (flickers; hidden while the pit is out of wood)
  const fl = d.part({ pivot: [0.5 * VF, 2 * VF, 0.5 * VF], anim: 'flicker', speed: 8 });
  for (let y = 2; y <= 13; y++) {
    const r = (y < 5 ? 3.2 : 3.2 - (y - 5) * 0.36);
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      const dd = Math.hypot(x, z) + (y > 8 ? (((x * 7 + z * 3 + y) & 3) === 0 ? 0.8 : 0) : 0);
      if (dd > r) continue;
      const core = dd < r - 1.2 && y < 10;
      fl.gf.set(x, y, z, core ? (y < 6 ? FLAME[0] : 0xfff4c0) : y > 9 ? FLAME[2] : FLAME[1]);
    }
  }
  fl.gf.set(1, 14, 0, FLAME[1]); fl.gf.set(-1, 15, 1, FLAME[2]);
  d.flame = true;
}

// ================================================================ PATIO HEATER (1x1)
function patioheater(d) {
  const { f } = d;
  // weighted base + gas cabinet
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) if (Math.hypot(x + 0.5, z + 0.5) < 6) f.set(x, 0, z, (x + z) & 1 ? IRON : IRON_L);
  rbox(f, -4, 3, 1, 10, -4, 3, 1.2, (x, y, z) => (y === 10 || y === 1 ? BRASS_D : (x + y) % 7 === 0 ? METAL_D : METAL));
  for (let y = 4; y <= 8; y++) f.set(-4, y, 3, y % 2 ? METAL_L : METAL); // vent slits
  f.box(1, 6, 4, 2, 7, 4, RED); // the knob
  // brass pole
  for (let y = 11; y <= 31; y++) f.box(-1, y, -1, 0, y, 0, y % 6 === 0 ? BRASS_D : (y & 1 ? BRASS : BRASS_L));
  // burner: a glass column with the flame inside
  for (let y = 32; y <= 37; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > 2.9) continue;
    if (r > 1.9) d.glass.set(x, y, z, 0xd8eef8);
  }
  f.box(-3, 31, -3, 2, 31, 2, BRASS_D);
  const fl = d.part({ pivot: [0, 32 * VF, 0], anim: 'flicker', speed: 11 });
  for (let y = 32; y <= 37; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (Math.hypot(x + 0.5, z + 0.5) < 1.6) fl.gf.set(x, y, z, y > 35 ? FLAME[2] : y > 33 ? FLAME[1] : FLAME[0]);
  // mushroom reflector
  for (let y = 38; y <= 41; y++) {
    const R = y === 38 ? 9.6 : y === 39 ? 9 : y === 40 ? 7.4 : 4.5;
    for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > R) continue;
      f.set(x, y, z, y === 38 ? (r > R - 1 ? BRASS_D : CHROME) : r > R - 1.2 ? BRASS : BRASS_L);
    }
  }
  f.box(-1, 42, -1, 0, 43, 0, BRASS_D);
  // the warm glow ring under the cap
  const glow = d.part({ pivot: [0, 37 * VF, 0], anim: 'flicker', speed: 3 });
  for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) { const r = Math.hypot(x + 0.5, z + 0.5); if (r > 5.6 && r < 7.2) glow.gf.set(x, 37, z, (x + z) & 1 ? 0xff9a3a : 0xffc060); }
  d.flame = true;
}

// ================================================================ RAIN SHELTER (2x2)
function rainshelter(d, rnd, v) {
  const { f } = d;
  const TIN = v === 1 ? [0x2e7a8a, 0x246270, 0x3a92a2] : v === 2 ? [0x3e8a4a, 0x2e6a38, 0x52a05a] : [RED, RED_D, RED_L];
  // posts
  for (const [x, z] of [[-18, -18], [16, -18], [-18, 16], [16, 16]]) f.box(x, 0, z, x + 1, 31, z + 1, (xx, y) => (y % 9 === 0 ? WOOD_D : WOOD[(y + xx) % 3]));
  // beams under the roof
  f.box(-19, 32, -19, 18, 33, -18, WOOD_D); f.box(-19, 32, 17, 18, 33, 18, WOOD_D);
  f.box(-19, 32, -18, -18, 33, 17, WOOD_M); f.box(17, 32, -18, 18, 33, 17, WOOD_M);
  // gable tin roof, ridge along x, corrugated stripes
  for (let z = -22; z <= 21; z++) {
    const y = 44 - Math.round(Math.abs(z + 0.5) * 0.5);
    for (let x = -22; x <= 21; x++) {
      const c = Math.abs(z + 0.5) < 1 ? TIN[1] : x % 3 === 0 ? TIN[1] : x % 3 === 1 ? TIN[0] : TIN[2];
      f.set(x, y, z, c);
      if (Math.abs(z + 0.5) > 20.5) f.set(x, y - 1, z, 0x8a8f9a); // gutter lip
    }
  }
  for (let z = -21; z <= 20; z++) { const y = 44 - Math.round(Math.abs(z + 0.5) * 0.5); for (let yy = 34; yy < y; yy++) { if (Math.abs(z + 0.5) < 19) { f.set(-19, yy, z, WOOD_M); f.set(18, yy, z, WOOD_M); } } }
  // a bench under the roof (back) and a little sign on the front beam
  f.box(-12, 7, -12, 11, 8, -8, (x) => WOOD[(x + 30) % 3]);
  for (const x of [-11, 10]) f.box(x, 0, -11, x, 6, -9, WOOD_D);
  f.box(-12, 9, -13, 11, 15, -13, (x, y) => (y === 15 ? WOOD_D : WOOD[(y + 31) % 3]));
  const label = 'DRY';
  const w = textW(label);
  f.box(-Math.ceil(w / 2) - 2, 34, 19, Math.floor(w / 2) + 1, 40, 19, 0xf0e6cc);
  text(f, label, -Math.ceil(w / 2), 39, 20, 0x2a1a14);
  // a puddle with a drip line along the eaves
  for (let x = -20; x <= 19; x += 3) f.set(x, 0, 22, 0x6ab0d8);
  void rnd;
}

// ================================================================ MISTING FAN (1x1)
function mistfan(d) {
  const { f } = d;
  // water tank base
  rbox(f, -6, 5, 0, 7, -6, 5, 1.6, (x, y) => (y === 7 ? 0x5ab0e0 : y === 0 ? METAL_D : 0x3a8ac8));
  f.box(-2, 8, -2, 1, 8, 1, METAL_D);
  // pole
  for (let y = 9; y <= 22; y++) f.box(-1, y, 0, 0, y, 1, y & 1 ? METAL : METAL_L);
  // cage (front + back rings, spokes) facing +z
  gear(f, 0, 30, -1, -1, 7.2, 8.2, 0, METAL_D, { hub: IRON });
  gear(f, 0, 30, 4, 4, 7.2, 8.2, 0, METAL, { hub: IRON });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; for (let r = 2; r <= 7; r++) f.set(Math.round(Math.cos(a) * r - 0.5), Math.round(30 + Math.sin(a) * r - 0.5), 4, METAL_L); }
  f.box(-1, 22, -1, 0, 23, 0, IRON);
  // blades (spin round z)
  const bl = d.part({ pivot: [0, 30 * VF, 1.5 * VF], anim: 'spin', axis: 'z', speed: 9 });
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    for (let r = 1.5; r <= 6.5; r += 0.5) for (let s = -1.2; s <= 1.2; s += 0.6) {
      const a = a0 + s / Math.max(1.5, r);
      bl.f.set(Math.round(Math.cos(a) * r - 0.5), Math.round(30 + Math.sin(a) * r - 0.5), 1, k === 0 ? 0x4ab0e0 : 0x7ac8f0);
    }
  }
  bl.f.box(-1, 29, 1, 0, 30, 2, CHROME);
  // misting nozzles round the rim (twinkle)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p = d.part({ pivot: [Math.cos(a) * 8 * VF, (30 + Math.sin(a) * 8) * VF, 5 * VF], anim: 'twinkle', speed: 5 + k, phase: k });
    p.gf.set(Math.round(Math.cos(a) * 8), Math.round(30 + Math.sin(a) * 8), 5, 0xe8f8ff);
  }
}

// ================================================================ GREENHOUSE (2x2)
function greenhouse(d, rnd) {
  const { f } = d;
  // brick sill
  for (let x = -19; x <= 18; x++) for (let z = -19; z <= 18; z++) {
    const edge = x === -19 || x === 18 || z === -19 || z === 18;
    if (edge) for (let y = 0; y <= 2; y++) f.set(x, y, z, ((x + z + y) & 3) === 0 ? 0x9a4a3a : 0xb85a44);
    else f.set(x, 0, z, (x * 3 + z) % 5 === 0 ? 0x5a3a24 : 0x6a4a30);
  }
  // planters with plants (seen through the glass)
  for (const z0 of [-12, 2]) {
    f.box(-15, 1, z0, 14, 5, z0 + 7, (x, y, z) => (y === 5 && x > -15 && x < 14 && z > z0 && z < z0 + 7 ? 0x4a3020 : WOOD_M));
    for (let x = -13; x <= 12; x += 4) {
      const h = 4 + Math.floor(rnd() * 4);
      for (let y = 6; y < 6 + h; y++) f.box(x, y, z0 + 2, x + 1, y, z0 + 4, LEAF[(y + x) & 3]);
      ball(f, x + 1, 6 + h, z0 + 3.5, 2.2, (xx, yy, zz) => (((xx + yy + zz) & 7) === 0 ? 0xe03a2a : LEAF[(xx + zz) & 3]));
    }
  }
  // glass walls + gable glass roof (ridge along x)
  for (let y = 3; y <= 24; y++) for (let x = -19; x <= 18; x++) for (let z = -19; z <= 18; z++) {
    const wall = x === -19 || x === 18 || z === -19 || z === 18;
    if (!wall) continue;
    const frame = y === 3 || y === 24 || x === -19 || x === 18 || z === -19 || z === 18 ? ((x % 6 === 0 || z % 6 === 0) || y === 3 || y === 24) : false;
    const corner = (x === -19 || x === 18) && (z === -19 || z === 18);
    if (frame || corner) f.set(x, y, z, WHITE);
    else d.glass.set(x, y, z, 0xcff0e8);
  }
  for (let z = -20; z <= 19; z++) {
    const y = 37 - Math.round(Math.abs(z + 0.5) * 0.62);
    for (let x = -20; x <= 19; x++) {
      if (x % 6 === 0 || Math.abs(z + 0.5) < 1 || Math.abs(z + 0.5) > 18.5 || x === -20 || x === 19) f.set(x, y, z, WHITE);
      else d.glass.set(x, y, z, 0xd8f4ee);
    }
    // gable ends
    for (let yy = 25; yy < y; yy++) if (Math.abs(z + 0.5) < 19) { for (const x of [-19, 18]) { if (z % 6 === 0) f.set(x, yy, z, WHITE); else d.glass.set(x, yy, z, 0xcff0e8); } }
  }
  // door (front) and a stove pipe
  f.box(-3, 3, 19, 2, 18, 19, (x, y) => (x === -3 || x === 2 || y === 18 ? WOOD_D : y === 11 ? WOOD_M : null));
  f.set(1, 10, 20, BRASS);
  log(f, 'y', 30, 44, 12.5, -8.5, 1.4, { ends: false, bark: [IRON, IRON_L, IRON] });
  f.box(11, 45, -10, 14, 45, -7, IRON);
  void CHROME; void GRASS; void BRASS_L;
}

const BASE = defineModels({ firepit, patioheater, rainshelter, mistfan, greenhouse }, { rainshelter: { w: 2, d: 2 }, greenhouse: { w: 2, d: 2 } });

// collect the flame parts so the game can put the fire out when there's no fuel
const withFlames = (fn) => (o) => {
  const root = fn(o);
  root.userData.flames = root.children.filter((c) => c.isGroup);
  return root;
};

export const STRUCTURE_MODELS = {
  firepit: withFlames(BASE.firepit),
  patioheater: withFlames(BASE.patioheater),
  rainshelter: BASE.rainshelter,
  mistfan: BASE.mistfan,
  greenhouse: BASE.greenhouse,
};
