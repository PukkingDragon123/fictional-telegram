// [v32 dig] Voxel models for THE DIG (Bonebed Bluff and the fossil sites).
// Same kit as the neighbours' props (critterKit: grain material, hidden-face
// meshing); shapes are hand-shaped with noise-bent outlines and placed details
// (no plain boxes / blobs). Origin = bottom centre, front = +Z.
//
//   makeBluff()          the strata face: nine layers of rock with bones, ammonites
//                        and glowing amber in it, a ladder, survey pins, scree. ~9 x 2.6 units
//   makeLabHut()         Snapp's lab shack (userData.door, userData.smoke = chimney tip)
//   makeFieldTent()      canvas tent, cot, camp table with map + mug
//   makeTrench(w, d, k)  an excavation pit: spoil berm, string grid, half-dug skeleton (k = 0 | 1)
//   makeSieveBench()     the prep bench + sieve (where finds get cleaned; userData.top)
//   makeDisplayCase()    glass case, 3 shelves x 3 slots (userData.slots: local positions)
//   makeSiteMound(kind)  a fossil site in the world: kind 'fresh' | 'dug' (userData.flag: the flag pivot)
//   makeFindMini(id)     a tiny model of a find (display shelves, the lab)
//   makeRibcage()        a giant half-buried skeleton: ribs arching out of the slope, a spine, a skull
import * as THREE from 'three';
import { VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, matFor, grainMaterial, sin, cos, abs, PI, TAU, clamp, lerp } from './critterKit.js';
import { FIND_BY_ID } from '../data/digFinds.js';

const P = {
  grass: 0x5e9a3c, grassD: 0x467a2e, grassL: 0x7cb84a, soil: 0x5a3e26, soilD: 0x402a18, soilL: 0x74523a, root: 0x8a6a44,
  shale: 0x4a4a54, shaleD: 0x3a3a44, clay: 0x7a8aa0, clayD: 0x62728a, sand: 0xd8b878, sandD: 0xb89858, sandL: 0xead090,
  coal: 0x26222a, coalL: 0x5a5868, mud: 0x9a5a3c, mudD: 0x7a4430, mudL: 0xb4704c, lime: 0xb8b2a2, limeD: 0x9a9484, limeL: 0xd4ceba,
  ochre: 0xc8883a, ochreD: 0xa86a2a, ash: 0xe8e2d4, ashD: 0xcfc8b8,
  bone: 0xeee2c4, boneD: 0xcab890, boneL: 0xfff8e4, amber: 0xf0a020, amberD: 0xc06a10, amberL: 0xffd860,
  wood: 0xa8743e, woodD: 0x7e5228, woodL: 0xc48c52, woodDD: 0x5a3a1e, plank: 0xb88850,
  tin: 0x9aa2ac, tinD: 0x76808c, tinL: 0xc4ccd4, rust: 0xa8643a,
  canvas: 0xc8bc8a, canvasD: 0xa89c6a, canvasL: 0xe0d6a8, rope: 0xd8c898, flag: 0xff7a2a, flagD: 0xc8501a,
  white: 0xf6f0e0, red: 0xd8403a, iron: 0x3e3e48, ironL: 0x6a6a78, glass: 0xcfeeff, brass: 0xe0b44a, brassD: 0xa8822a,
  paper: 0xf4ead0, ink: 0x3a2a1a, blue: 0x3a7ad8, green: 0x4caa3c, stoneL: 0xaaa69a, stone: 0x8a8678, stoneD: 0x6a665a,
};
const geoMemo = new Map();
const memo = (key, build, pivot = [0, 0, 0], scale = FV) => { let g = geoMemo.get(key); if (!g) { g = buildGeo(build(), pivot, scale); geoMemo.set(key, g); } return g; };
const lit = (geo, emissive = 0) => {
  const m = new THREE.Mesh(geo, emissive ? grainMaterial(geo.userData.scale, geo.userData.grain, 0.05, emissive) : matFor(geo));
  m.castShadow = true; m.receiveShadow = true;
  return m;
};
let GLASS = null;
const glassMat = () => (GLASS ||= new THREE.MeshLambertMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.22, depthWrite: false, emissive: 0x6a9ab0, emissiveIntensity: 0.2 }));
const plank = (x, y, z) => tone(x, y, z, P.wood, P.woodD, P.woodL, 0.14, 0.1);
const nz = (x, y, s = 0) => hash3(Math.floor(x), Math.floor(y), s);
// smooth value noise (for bent outlines)
function vn(x, s = 0) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash3(i, 7, s), hash3(i + 1, 7, s), u); }

// ================================================================== the bluff
// local voxels (VS): x -92..91, y 0..54, the face front around z = 0 (leaning back as it rises)
const BX = 92;
function bluffTop(x) {
  const u = abs(x) / BX;
  const ends = u > 0.72 ? (u - 0.72) / 0.28 : 0;
  return Math.round((44 + (vn(x * 0.07, 3) - 0.5) * 9 + (vn(x * 0.21, 4) - 0.5) * 4) * (1 - ends * ends * 0.85));
}
// strata from the bottom: [top y (before warp), colour fn]
const LAYERS = [
  [6, (x, y, z) => tone(x, y, z, P.shale, P.shaleD, 0x5a5a64, 0.2, 0.1)],
  [11, (x, y, z) => ((x + 200) % 9 === 0 ? P.clayD : tone(x, y, z, P.clay, P.clayD, 0x8a9ab0, 0.12, 0.1))],
  [18, (x, y, z) => ((x + Math.floor(y * 1.8) + 300) % 11 === 0 ? P.sandD : tone(x, y, z, P.sand, P.sandD, P.sandL, 0.12, 0.12))], // cross-bedding
  [20, (x, y, z) => (nz(x, y, 9) < 0.12 ? P.coalL : P.coal)],
  [28, (x, y, z) => tone(x, y, z, P.mud, P.mudD, P.mudL, 0.16, 0.08)], // the bone bed
  [33, (x, y, z) => tone(x, y, z, P.lime, P.limeD, P.limeL, 0.12, 0.12)],
  [38, (x, y, z) => tone(x, y, z, P.ochre, P.ochreD, P.sand, 0.14, 0.1)],
  [40, (x, y, z) => tone(x, y, z, P.ash, P.ashD, 0xfffaf0, 0.1, 0.1)],
  [99, (x, y, z) => (nz(x, y, 12) < 0.08 ? P.root : tone(x, y, z, P.soil, P.soilD, P.soilL, 0.14, 0.08))],
];
const warp = (x, y) => y - sin(x * 0.045 + 0.6) * 2.2 - x * 0.035;
function layerAt(x, y) { const w = warp(x, y); for (let i = 0; i < LAYERS.length; i++) if (w < LAYERS[i][0]) return i; return LAYERS.length - 1; }
function bluffModel() {
  const v = new VoxelModel();
  const front = (x, y) => {
    // the face leans back as it rises, ledges where hard layers stick out, a bit of crumble
    const L = layerAt(x, y);
    const hard = L === 2 || L === 5 || L === 7 ? 1.2 : L === 3 || L === 4 ? -0.6 : 0;
    const top = bluffTop(x);
    const lean = y * 0.32;
    const crumble = (vn(x * 0.3 + y * 0.11, 21) - 0.5) * 2.4;
    const ends = clamp((abs(x) - BX * 0.6) / (BX * 0.4), 0, 1);
    return Math.round(-lean + hard + crumble - ends * 6 + (y > top - 3 ? -2 : 0));
  };
  for (let x = -BX; x < BX; x++) {
    const top = bluffTop(x);
    for (let y = 0; y <= top; y++) {
      const zf = front(x, y);
      for (let z = zf - 4; z <= zf; z++) {
        const L = layerAt(x, y);
        let c = LAYERS[L][1](x, y, z);
        if (z === zf && y === top) c = P.soilD;
        v.set(x, y, z, c);
      }
      // the back: a thin fill so the top is closed
      if (y === top) for (let z = front(x, y) - 5; z >= -36; z--) v.set(x, y, z, tone(x, y, z, P.grass, P.grassD, P.grassL, 0.2, 0.15));
    }
    // grass lip hanging over the edge + tufts on top
    const zt = front(x, top);
    v.set(x, top + 1, zt - 1, nz(x, 1, 31) < 0.5 ? P.grassL : P.grass);
    if (nz(x, 2, 32) < 0.35) v.set(x, top, zt + 1, P.grassD).set(x, top - 1, zt + 1, nz(x, 3, 33) < 0.5 ? P.grassD : null);
    if (nz(x, 4, 34) < 0.22) for (let k = 1; k <= 2 + Math.floor(nz(x, 5, 35) * 3); k++) v.set(x, top + k, zt - 2 - (k % 2), k > 2 ? P.grassL : P.grass);
    // roots dangling down the topsoil
    if (nz(x, 6, 36) < 0.06) for (let k = 1; k <= 4 + Math.floor(nz(x, 7, 37) * 5); k++) v.set(x + (k % 3 === 0 ? 1 : 0), top - 2 - k, front(x, top - 2 - k) + 1, P.root);
  }
  const onFace = (x, y, out = 1, col) => { v.set(x, y, front(x, y) + out, col); };
  // ammonites in the limestone (spirals in relief)
  for (const [ax, ay, r] of [[-58, 30, 3.2], [-20, 29, 2.4], [26, 31, 3.6], [64, 28, 2.6]]) {
    for (let a = 0; a < 3.2 * TAU; a += 0.18) {
      const rr = r * (1 - a / (3.4 * TAU));
      const x = Math.round(ax + cos(a) * rr * 1.2), y = Math.round(ay + sin(a) * rr);
      onFace(x, y, 1, a < TAU ? P.boneL : P.boneD);
    }
    onFace(ax, ay, 1, P.bone);
  }
  // the big femur sticking out of the bone bed (in relief, 2-3 voxels proud)
  for (let k = -14; k <= 14; k++) {
    const x = -34 + k, y = 22 + Math.round(k * 0.12);
    for (let t = -1; t <= 1; t++) onFace(x, y + t, 2, t === 1 ? P.boneL : P.bone);
    onFace(x, y - 2, 1, P.boneD);
  }
  for (const ex of [-49, -19]) for (let t = -3; t <= 3; t++) for (let o = 1; o <= 3; o++) if (abs(t) + o < 6) onFace(ex + (ex < -30 ? -1 : 1) * (o > 2 ? 1 : 0), 22 + t + Math.round((ex + 34) * 0.12), o, abs(t) > 2 ? P.boneD : P.bone);
  // a long-necked spine of vertebrae curling along the bed
  for (let k = 0; k < 13; k++) {
    const x = 6 + k * 4, y = 24 + Math.round(sin(k * 0.6) * 1.6);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, -1], [1, -1], [2, 0]]) onFace(x + dx, y + dy, dy === 1 ? 2 : 1, dy === 1 ? P.boneL : P.bone);
    onFace(x, y + 2, 1, P.boneD);
  }
  // a horned skull peeking out at the right end of the bone bed
  for (let x = 58; x <= 72; x++) for (let y = 20; y <= 27; y++) {
    const dx = (x - 65) / 7.5, dy = (y - 23.5) / 4;
    if (dx * dx + dy * dy > 1) continue;
    const eye = (x === 62 || x === 63) && (y === 24 || y === 25);
    onFace(x, y, eye ? 0 : 2, eye ? 0x2a1e14 : y > 25 ? P.boneL : (x + y) % 5 === 0 ? P.boneD : P.bone);
  }
  for (let k = 0; k < 5; k++) onFace(56 - k, 27 + Math.round(k * 0.6), 2, P.boneL); // a horn
  for (const x of [66, 68, 70]) onFace(x, 20, 2, P.boneL); // teeth
  // trilobites in the shale
  for (const [tx, ty] of [[-70, 3], [-6, 2], [44, 4]]) for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) onFace(tx + dx, ty + dy, 1, dy === 0 && dx % 2 === 0 ? P.limeD : abs(dx) === 2 ? P.limeD : P.lime);
  // amber nuggets glinting in the sandstone and the coal (glow model)
  const glow = new VoxelModel();
  for (const [gx, gy, s] of [[-80, 14, 2], [-44, 19, 1], [-2, 15, 2], [34, 19, 1], [52, 13, 2], [80, 16, 1]]) {
    for (let dx = -s; dx <= s; dx++) for (let dy = -s + 1; dy <= s - 1 + (dx === 0 ? 1 : 0); dy++) {
      const z = front(gx + dx, gy + dy) + 1;
      glow.set(gx + dx, gy + dy, z, dx < 0 && dy > 0 ? P.amberL : dx > 0 && dy < 0 ? P.amberD : P.amber);
    }
  }
  // scree at the foot: little rocks of every layer
  for (let k = 0; k < 140; k++) {
    const x = Math.floor((hash3(k, 1, 51) * 2 - 1) * (BX - 6));
    const z0 = front(x, 0);
    const d = Math.floor(hash3(k, 2, 51) * 10);
    const c = LAYERS[Math.floor(hash3(k, 3, 51) * 7)][1](x, k, d);
    const s = hash3(k, 4, 51) < 0.25 ? 2 : 1;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) v.set(x + dx, dy, z0 + 1 + d + (dx === 1 && dy === 1 ? -1 : 0), c);
  }
  // survey pins with orange flags + a striped measuring rod leaning on the face
  for (const [px, py] of [[-46, 30], [-12, 16], [20, 24], [48, 34]]) {
    const z = front(px, py) + 1;
    for (let k = 0; k < 4; k++) v.set(px, py + k, z + k, 0x9a9ea8);
    v.set(px + 1, py + 4, z + 3, P.flag).set(px + 2, py + 4, z + 3, P.flag).set(px + 1, py + 3, z + 3, P.flagD).set(px + 2, py + 3, z + 3, P.flag);
  }
  for (let y = 0; y <= 36; y++) { const x = 80 + Math.round(y * 0.08); const z = front(x, y) + 2; v.set(x, y, z, Math.floor(y / 4) % 2 ? P.red : P.white); v.set(x + 1, y, z, Math.floor(y / 4) % 2 ? 0xa83030 : 0xdcd6c8); }
  // a wooden ladder up the face
  for (let y = 0; y <= 40; y++) for (const lx of [-88 + 10, -88 + 14]) { const x = lx; const z = front(x, y) + 3 + Math.round(y * 0.05); v.set(x, y, z, y % 7 === 0 ? P.woodD : plank(x, y, z)); }
  for (let y = 3; y <= 39; y += 5) for (let x = -77; x <= -75; x++) v.set(x, y, front(x, y) + 3 + Math.round(y * 0.05), P.woodL);
  return { v, glow };
}
export function makeBluff() {
  const root = new THREE.Group();
  root.name = 'DigBluff';
  let mod = null;
  const geo = memo('bluff', () => (mod ||= bluffModel()).v, [0, 0, 0], VS);
  const gg = memo('bluffGlow', () => (mod ||= bluffModel()).glow, [0, 0, 0], VS);
  const face = lit(geo);
  face.castShadow = false; // a huge shadow caster for nothing (it faces the sun anyway)
  root.add(face);
  const amb = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true }));
  root.add(amb);
  root.userData.glow = amb;
  return root;
}

// ================================================================== the lab hut
function hutModel() {
  const v = new VoxelModel();
  const W2 = 40, D0 = -30, D1 = 30, H = 58;
  // stone footing
  for (let x = -W2 - 2; x <= W2 + 1; x++) for (let z = D0 - 2; z <= D1 + 1; z++) for (let y = 0; y <= 3; y++) {
    if (x > -W2 + 1 && x < W2 - 2 && z > D0 + 1 && z < D1 - 2) continue;
    v.set(x, y, z, tone(Math.floor(x / 3), y, Math.floor(z / 3), P.stone, P.stoneD, P.stoneL, 0.3, 0.2));
  }
  // vertical plank walls with battens; the front a touch taller (the roof slopes back)
  const wallH = (z) => Math.round(H - (D1 - z) * 0.32);
  for (let z = D0; z <= D1; z++) for (const x of [-W2, W2 - 1]) for (let y = 4; y <= wallH(z); y++) v.set(x, y, z, (z + 100) % 6 === 0 ? P.woodD : y % 13 === 0 ? P.woodDD : plank(x, y, z));
  for (let x = -W2; x < W2; x++) {
    for (let y = 4; y <= wallH(D1); y++) v.set(x, y, D1, (x + 100) % 6 === 0 ? P.woodD : plank(x, y, D1));
    for (let y = 4; y <= wallH(D0); y++) v.set(x, y, D0, (x + 100) % 6 === 0 ? P.woodD : plank(x, y, D0));
  }
  // corner posts
  for (const x of [-W2 - 1, W2]) for (const z of [D0 - 1, D1 + 1]) for (let y = 4; y <= wallH(z) + 1; y++) v.set(x, y, z, P.woodDD);
  // the door (left of centre) and a round window (right)
  const dx0 = -22, dx1 = -8;
  for (let x = dx0; x <= dx1; x++) for (let y = 4; y <= 34; y++) {
    const frame = x === dx0 || x === dx1 || y === 34;
    v.set(x, y, D1 + 1, frame ? P.woodDD : (x - dx0) % 4 === 0 ? P.woodD : 0x8a5a3a);
  }
  v.set(dx1 - 2, 18, D1 + 2, P.brass).set(dx1 - 2, 19, D1 + 2, P.brassD);
  // a "LAB" board over the door (3x5 pixel letters)
  const FONT = { L: ['#..', '#..', '#..', '#..', '###'], A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'] };
  for (let x = dx0 - 2; x <= dx1 + 2; x++) for (let y = 37; y <= 45; y++) v.set(x, y, D1 + 2, x === dx0 - 2 || x === dx1 + 2 || y === 37 || y === 45 ? P.woodDD : P.paper);
  'LAB'.split('').forEach((ch, i) => FONT[ch].forEach((row, j) => [...row].forEach((c, k) => { if (c === '#') v.set(dx0 + 1 + i * 4 + k, 43 - j, D1 + 3, P.red); })));
  const wx = 18, wy = 28;
  for (let x = wx - 8; x <= wx + 8; x++) for (let y = wy - 8; y <= wy + 8; y++) {
    const d = Math.hypot(x - wx, y - wy);
    if (d <= 7.6 && d > 5.8) v.set(x, y, D1 + 1, d > 6.8 ? P.woodDD : P.brass);
    else if (d <= 5.8) v.set(x, y, D1, null);
  }
  // corrugated tin roof, overhanging, sloping back; a patch of rust
  for (let x = -W2 - 5; x <= W2 + 4; x++) for (let z = D0 - 6; z <= D1 + 6; z++) {
    const y = Math.round(wallH(clamp(z, D0, D1)) + 2 + (z > D1 ? -(z - D1) * 0.32 : z < D0 ? (D0 - z) * 0.32 : 0));
    const ridge = (x + 200) % 4 < 2;
    const rust = vn(x * 0.15 + z * 0.05, 61) > 0.72;
    v.set(x, y + (ridge ? 1 : 0), z, rust ? (ridge ? P.rust : 0x8a4a2a) : ridge ? P.tinL : P.tin);
    if (z === D1 + 6 || x === -W2 - 5 || x === W2 + 4) v.set(x, y - 1, z, P.tinD);
  }
  // stove pipe through the roof
  for (let y = H - 10; y <= H + 14; y++) for (let x = 24; x <= 27; x++) for (let z = -6; z <= -3; z++) if (x === 24 || x === 27 || z === -6 || z === -3) v.set(x, y, z, y === H + 14 ? P.iron : y % 6 === 0 ? P.ironL : P.iron);
  // a crate of rocks + a lantern hook by the door
  for (let x = 26; x <= 38; x++) for (let z = D1 + 3; z <= D1 + 13; z++) for (let y = 0; y <= 9; y++) {
    if (x > 26 && x < 38 && z > D1 + 3 && z < D1 + 13 && y > 1) { if (y === 9) v.set(x, y, z, LAYERS[Math.floor(hash3(x, y, z) * 7)][1](x, y, z)); continue; }
    v.set(x, y, z, y === 9 || y === 0 ? P.woodD : plank(x, y, z));
  }
  return v;
}
export function makeLabHut() {
  const root = new THREE.Group();
  root.name = 'DigLabHut';
  root.add(lit(memo('hut', hutModel)));
  root.userData.door = new THREE.Vector3(-15 * FV, 0, 32 * FV);
  root.userData.smoke = new THREE.Vector3(25.5 * FV, 74 * FV, -4.5 * FV);
  // the round window glows a little (a lamp inside)
  const g = new VoxelModel();
  for (let x = 12; x <= 24; x++) for (let y = 22; y <= 34; y++) if (Math.hypot(x - 18, y - 28) <= 5.8) g.set(x, y, 29, (x === 18 || y === 28) ? 0x6a4a2a : y > 28 ? 0xffe6a0 : 0xffd070);
  const win = new THREE.Mesh(memo('hutWin', () => g), new THREE.MeshBasicMaterial({ vertexColors: true }));
  root.add(win);
  return root;
}

// ================================================================== the field tent
function tentModel() {
  const v = new VoxelModel();
  const L = 26, Hh = 30, half = 30;
  // A-frame canvas with a darker seam line; the front flap rolled open on one side
  for (let z = -L; z <= L; z++) for (let x = -half; x <= half; x++) {
    const y = Math.round(Hh * (1 - abs(x) / half));
    if (y < 0) continue;
    const front = z === L;
    if (front && x > -6 && y < Hh - 4) continue; // the open door (right half rolled back)
    const c = abs(x) <= 1 ? P.canvasD : (z + 100) % 13 === 0 ? P.canvasD : tone(x, y, z, P.canvas, P.canvasD, P.canvasL, 0.08, 0.1);
    v.set(x, y, z, c);
    if (front || z === -L) for (let yy = 0; yy < y; yy++) if (!(front && x > -6 && yy < Hh - 4)) v.set(x, yy, z, tone(x, yy, z, P.canvas, P.canvasD, P.canvasL, 0.08, 0.1));
  }
  // the rolled flap tied back, ridge pole ends, guy ropes and pegs
  for (let y = 2; y <= 24; y++) for (let k = 0; k < 3; k++) v.set(4 + k + Math.round(y * 0.15), y, L + 1 + k % 2, k === 1 ? P.canvasD : P.canvasL);
  for (const z of [-L - 3, L + 3]) for (let y = 0; y <= Hh + 3; y++) v.set(0, y, z, y > Hh ? P.woodL : P.woodD);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x0 = sx * half * 0.5, z0 = sz * (L - 2), x1 = sx * (half + 12), z1 = sz * (L + 10);
    for (let k = 0; k <= 20; k++) { const t = k / 20; v.set(Math.round(lerp(x0, x1, t)), Math.round(lerp(Hh * 0.5, 1, t)), Math.round(lerp(z0, z1, t)), P.rope); }
    v.set(x1, 0, z1, P.woodD).set(x1, 1, z1, P.woodL);
  }
  // inside: a cot with a blanket
  for (let x = -2; x <= 18; x++) for (let z = -18; z <= 8; z++) v.set(x, 7, z, x > 0 && z > -16 && z < 6 ? ((x + z) % 5 === 0 ? 0x8a3a2a : 0xb84a34) : P.woodD);
  return v;
}
function campTableModel() {
  const v = new VoxelModel();
  for (let x = -12; x <= 12; x++) for (let z = -8; z <= 8; z++) v.set(x, 16, z, plank(x, 16, z));
  for (const x of [-11, 11]) for (let y = 0; y <= 15; y++) { v.set(x, y, Math.round((y - 8) * 0.8), P.woodD); v.set(x, y, -Math.round((y - 8) * 0.8), P.woodD); }
  // an open map with a red X, a coffee mug, a stack of notebooks
  for (let x = -10; x <= 2; x++) for (let z = -6; z <= 6; z++) v.set(x, 17, z, (x + z) % 7 === 0 ? 0xd8c8a0 : P.paper);
  for (const [x, z] of [[-6, -1], [-5, 0], [-4, 1], [-4, -1], [-6, 1]]) v.set(x, 18, z, P.red);
  for (let k = 0; k < 8; k++) v.set(-9 + k, 18, 3 + Math.round(sin(k) * 1.2), P.blue);
  for (let y = 17; y <= 21; y++) for (const [x, z] of [[6, -3], [8, -3], [6, -5], [8, -5], [6, -4], [8, -4], [7, -3], [7, -5]]) v.set(x, y, z, y === 21 ? 0xe8e0d0 : 0xf2ece0);
  v.set(7, 20, -4, 0x4a2a14).set(9, 19, -4, 0xf2ece0).set(9, 18, -4, 0xf2ece0);
  for (let y = 17; y <= 20; y++) for (let x = 4; x <= 10; x++) for (let z = 2; z <= 6; z++) v.set(x, y, z, [0x8a3a2a, 0x3a5a8a, 0x5a7a3a, 0x8a6a2a][y - 17]);
  return v;
}
export function makeFieldTent() {
  const root = new THREE.Group();
  root.name = 'DigTent';
  root.add(lit(memo('tent', tentModel)));
  const t = lit(memo('camptable', campTableModel));
  t.position.set(-1.25, 0, 0.95); t.rotation.y = 0.3;
  root.add(t);
  return root;
}

// ================================================================== trenches
function trenchModel(w, d, kind) {
  const v = new VoxelModel();
  const hx = Math.round(w / FV / 2), hz = Math.round(d / FV / 2);
  for (let x = -hx - 6; x <= hx + 6; x++) for (let z = -hz - 6; z <= hz + 6; z++) {
    const ex = abs(x) - hx, ez = abs(z) - hz;
    const inside = ex < 0 && ez < 0;
    const wob = (vn(x * 0.2 + z * 0.13, 71) - 0.5) * 3;
    if (inside) {
      // the pit floor: darker dug dirt with stepped strata on the inner walls
      const edge = Math.min(-ex, -ez);
      const floorY = edge <= 1 ? 2 : edge <= 3 ? 1 : 0;
      for (let y = 0; y <= floorY; y++) v.set(x, y, z, y === floorY ? (edge <= 1 ? P.sandD : tone(x, y, z, P.mudD, P.soilD, P.mud, 0.2, 0.1)) : P.soilD);
      continue;
    }
    // the spoil berm around it (an irregular heap, higher on the long sides)
    const dd = Math.max(ex, ez);
    if (dd > 6 + wob * 0.6) continue;
    const hgt = Math.round(clamp(5 - dd * 0.7 + wob, 1, 6));
    for (let y = 0; y < hgt; y++) v.set(x, y, z, y === hgt - 1 ? (nz(x, z, 72) < 0.12 ? P.stone : tone(x, y, z, P.soilL, P.soil, P.sand, 0.2, 0.15)) : P.soil);
  }
  // string grid across the pit on corner stakes
  for (const sx of [-hx - 1, hx + 1]) for (const sz of [-hz - 1, hz + 1]) for (let y = 0; y <= 9; y++) v.set(sx, y, sz, y === 9 ? P.flag : P.woodL);
  for (let x = -hx; x <= hx; x++) for (const z of [-hz - 1, hz + 1, 0]) v.set(x, 8, z, P.white);
  for (let z = -hz; z <= hz; z++) for (const x of [-hx - 1, hx + 1, -Math.round(hx / 2), Math.round(hx / 2)]) v.set(x, 8, z, P.white);
  // what's half dug out on the floor
  if (kind === 0) {
    // a ribcage + spine (a big fish? a small dinosaur?)
    for (let x = -hx + 6; x <= hx - 10; x++) v.set(x, 1, 0, x % 3 === 0 ? P.boneD : P.bone);
    for (let k = 0; k < 6; k++) {
      const x0 = -hx + 10 + k * 5;
      for (let t = 1; t <= 8 - k * 0.6; t++) { v.set(x0 - Math.round(t * 0.3), 1, t, P.bone); v.set(x0 - Math.round(t * 0.3), 1, -t, P.boneD); }
    }
    for (let x = hx - 10; x <= hx - 4; x++) for (let z = -3; z <= 3; z++) if (abs(z) + abs(x - hx + 7) < 6) v.set(x, 2, z, (x + z) % 3 === 0 ? P.boneD : P.boneL);
    v.set(hx - 6, 3, -1, 0x2a1e14);
  } else {
    // an ammonite the size of a cartwheel, half free
    for (let a = 0; a < 3 * TAU; a += 0.12) { const rr = 9 * (1 - a / (3.3 * TAU)); v.set(Math.round(cos(a) * rr * 1.1), 1 + (a < TAU ? 1 : 0), Math.round(sin(a) * rr), a < TAU ? P.boneL : P.bone); }
  }
  // a bucket + a trowel stuck in the berm
  for (let y = 0; y <= 6; y++) for (let a = 0; a < 12; a++) { const x = hx + 3 + Math.round(cos((a / 12) * TAU) * 3), z = hz + 2 + Math.round(sin((a / 12) * TAU) * 3); v.set(x, y + 3, z, y === 6 ? P.tinL : P.tin); }
  for (let y = 0; y <= 6; y++) v.set(-hx - 3, 4 + y, hz + 3, y > 3 ? P.woodL : 0xb8c0cc);
  return v;
}
export function makeTrench(w = 3, d = 1.4, kind = 0) {
  const root = new THREE.Group();
  root.name = 'DigTrench';
  root.add(lit(memo(`trench${w}x${d}:${kind}`, () => trenchModel(w, d, kind))));
  return root;
}

// ================================================================== sieve + prep bench
function benchModel() {
  const v = new VoxelModel();
  // the bench: thick top, four legs, a shelf of trays
  for (let x = -18; x <= 18; x++) for (let z = -9; z <= 9; z++) { v.set(x, 18, z, plank(x, 18, z)); v.set(x, 17, z, (abs(x) === 18 || abs(z) === 9) ? P.woodD : null); }
  for (const x of [-16, 16]) for (const z of [-7, 7]) for (let y = 0; y <= 17; y++) v.set(x, y, z, P.woodD);
  for (let x = -15; x <= 15; x++) for (let z = -6; z <= 6; z++) v.set(x, 5, z, plank(x, 5, z));
  // trays of finds-to-clean on the shelf (crusty grey lumps)
  for (const [tx, tz] of [[-9, -2], [3, 2], [10, -3]]) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (abs(x) + abs(z) < 4) v.set(tx + x, 6 + (abs(x) + abs(z) < 2 ? 1 : 0), tz + z, tone(x, tx, z, P.stone, P.stoneD, P.sand, 0.3, 0.2));
  // on top: a magnifier lamp on an arm, brushes in a jar, a tray with a half-cleaned ammonite
  for (let y = 19; y <= 36; y++) v.set(-15, y, -6, P.iron);
  for (let k = 0; k <= 9; k++) v.set(-15 + k, 36 + Math.round(k * 0.2), -6 + Math.round(k * 0.5), P.iron);
  for (let x = -8; x <= -2; x++) for (let z = -3; z <= 3; z++) if (abs(x + 5) + abs(z) < 5) v.set(x, 38, z, abs(x + 5) + abs(z) < 3 ? 0xd8f4ff : P.brass);
  for (let y = 19; y <= 23; y++) for (const [x, z] of [[12, 4], [14, 4], [12, 6], [14, 6], [13, 3], [13, 7], [11, 5], [15, 5]]) v.set(x, y, z, y === 23 ? 0xd8f4ff : 0xb8dce8);
  for (const [x, z, c] of [[12, 5, P.woodL], [13, 5, P.wood], [14, 5, P.woodD]]) for (let y = 23; y <= 27; y++) v.set(x, y, z, y === 27 ? 0x3a2a1c : c);
  for (let x = -6; x <= 6; x++) for (let z = -5; z <= 5; z++) v.set(x, 19, z, abs(x) === 6 || abs(z) === 5 ? P.woodD : P.sand);
  for (let a = 0; a < 2.6 * TAU; a += 0.2) { const rr = 4 * (1 - a / (3 * TAU)); v.set(Math.round(cos(a) * rr), 20, Math.round(sin(a) * rr * 0.9), a < TAU ? P.boneL : P.bone); }
  // the sieve on its own legs beside the bench
  for (let x = 22; x <= 38; x++) for (let z = -8; z <= 8; z++) {
    const rim = x === 22 || x === 38 || abs(z) === 8;
    v.set(x, 22, z, rim ? P.woodD : ((x + z) % 2 ? 0x8a8e96 : null));
    if (rim) v.set(x, 23, z, P.wood);
    else if (vn(x * 0.4 + z * 0.3, 81) > 0.55) v.set(x, 22 + 1, z, tone(x, z, 1, P.soilL, P.soil, P.sand, 0.2, 0.2));
  }
  for (const [x, z] of [[23, -7], [37, -7], [23, 7], [37, 7]]) for (let y = 0; y <= 21; y++) v.set(x + (x < 30 ? -Math.round((21 - y) * 0.1) : Math.round((21 - y) * 0.1)), y, z, P.woodD);
  // a dirt pile under the sieve
  for (let x = 24; x <= 36; x++) for (let z = -6; z <= 6; z++) { const h = Math.round(4 - Math.hypot(x - 30, z * 1.2) * 0.6 + (nz(x, z, 82) - 0.5)); for (let y = 0; y < h; y++) v.set(x, y, z, tone(x, y, z, P.soil, P.soilD, P.soilL, 0.2, 0.15)); }
  return v;
}
export function makeSieveBench() {
  const root = new THREE.Group();
  root.name = 'DigBench';
  root.add(lit(memo('bench', benchModel)));
  root.userData.top = new THREE.Vector3(0, 20 * FV, 0);
  return root;
}

// ================================================================== the display case
function caseModel() {
  const v = new VoxelModel();
  const W2 = 20, D2 = 8, H = 62;
  // dark wood base cabinet with a drawer row, a crown on top
  for (let x = -W2; x <= W2; x++) for (let z = -D2; z <= D2; z++) for (let y = 0; y <= 14; y++) {
    if (abs(x) < W2 && abs(z) < D2 && y > 0 && y < 14) continue;
    v.set(x, y, z, y === 14 || y === 0 ? P.woodDD : (y === 7 && z === D2) ? P.woodD : plank(x, y, z));
  }
  for (const x of [-10, 10]) v.set(x, 10, D2 + 1, P.brass);
  // corner posts + glass box frame, three shelves inside
  for (const x of [-W2, W2]) for (const z of [-D2, D2]) for (let y = 15; y <= H; y++) v.set(x, y, z, P.woodDD);
  for (let x = -W2; x <= W2; x++) for (const z of [-D2, D2]) { v.set(x, H, z, P.woodD); v.set(x, H + 1, z, P.woodDD); }
  for (let z = -D2; z <= D2; z++) for (const x of [-W2, W2]) { v.set(x, H, z, P.woodD); v.set(x, H + 1, z, P.woodDD); }
  for (let x = -W2 - 1; x <= W2 + 1; x++) for (let z = -D2 - 1; z <= D2 + 1; z++) v.set(x, H + 2, z, abs(x) === W2 + 1 || abs(z) === D2 + 1 ? P.woodDD : P.wood);
  for (const sy of [15, 31, 47]) for (let x = -W2 + 1; x < W2; x++) for (let z = -D2 + 1; z < D2; z++) v.set(x, sy, z, sy === 15 ? 0x6a2a2a : (x + z) % 9 === 0 ? P.woodD : P.woodL);
  // a back panel of red velvet
  for (let x = -W2 + 1; x < W2; x++) for (let y = 15; y < H; y++) v.set(x, y, -D2, (x + y) % 11 === 0 ? 0x7a2a2a : 0x8e3434);
  // a little brass plaque on the front
  for (let x = -6; x <= 5; x++) for (let y = 4; y <= 7; y++) v.set(x, y, D2 + 1, y === 7 || y === 4 ? P.brassD : P.brass);
  return v;
}
function caseGlass() {
  const v = new VoxelModel();
  const W2 = 20, D2 = 8, H = 62;
  for (let x = -W2 + 1; x < W2; x++) for (let y = 15; y < H; y++) v.set(x, y, D2, P.glass);
  for (let z = -D2 + 1; z < D2; z++) for (let y = 15; y < H; y++) { v.set(-W2, y, z, P.glass); v.set(W2, y, z, P.glass); }
  return v;
}
export function makeDisplayCase() {
  const root = new THREE.Group();
  root.name = 'DigCase';
  root.add(lit(memo('case', caseModel)));
  const glass = new THREE.Mesh(memo('caseGlass', caseGlass), glassMat());
  glass.renderOrder = 3;
  root.add(glass);
  const slots = [];
  for (const y of [16, 32, 48]) for (const x of [-12, 0, 12]) slots.push(new THREE.Vector3(x * FV, y * FV, 0));
  root.userData.slots = slots;
  return root;
}

// ================================================================== fossil sites in the world
function moundModel(kind) {
  const v = new VoxelModel();
  const R = 15;
  for (let x = -R - 2; x <= R + 2; x++) for (let z = -R - 2; z <= R + 2; z++) {
    const a = Math.atan2(z, x), r = Math.hypot(x, z * 1.15);
    const edge = R * (0.78 + vn(a * 2.2 + 3, 91) * 0.4);
    if (r > edge) continue;
    const k = 1 - r / edge;
    if (kind === 'dug') {
      // a hole with a crumbly rim of spoil
      const rim = k < 0.38;
      const h = rim ? Math.round(1 + k * 6 + (nz(x, z, 92) - 0.5) * 1.5) : 0;
      if (rim) for (let y = 0; y <= h; y++) v.set(x, y, z, y === h ? tone(x, y, z, P.soilL, P.soil, P.sand, 0.25, 0.15) : P.soil);
      else v.set(x, 0, z, k > 0.8 ? 0x2a1c10 : P.soilD);
      continue;
    }
    // a fresh mound: loose dirt, pebbles, scuffs
    const h = Math.round(k * 5 + (nz(x, z, 93) - 0.5) * 1.6);
    for (let y = 0; y <= Math.max(0, h); y++) v.set(x, y, z, y === Math.max(0, h) ? (nz(x, z, 94) < 0.08 ? P.stone : tone(x, y, z, P.soilL, P.soil, 0x8a6a4a, 0.22, 0.14)) : P.soil);
  }
  // a few loose stones round the edge
  for (let k = 0; k < 7; k++) {
    const a = hash3(k, 1, 95) * TAU, r = R * (0.85 + hash3(k, 2, 95) * 0.3);
    const x = Math.round(cos(a) * r), z = Math.round(sin(a) * r * 0.9);
    v.set(x, 0, z, P.stone).set(x + 1, 0, z, P.stoneL).set(x, 1, z, P.stoneL);
  }
  return v;
}
function stakeModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 26; y++) v.set(0, y, 0, y > 24 ? P.woodL : P.woodD);
  return v;
}
function flagModel() {
  // the cloth, pivot at the pole (it flutters)
  const v = new VoxelModel();
  for (let x = 1; x <= 9; x++) for (let y = -6; y <= 0; y++) {
    if (x > 6 && abs(y + 3) > 9 - x) continue;
    v.set(x, y, 0, y === 0 || x === 1 ? P.flagD : (x + y) % 4 === 0 ? P.flagD : P.flag);
  }
  return v;
}
// what peeks out of a fresh mound (a hint of the group)
function peekModel(group) {
  const v = new VoxelModel();
  if (group === 'amber') {
    for (let x = -3; x <= 3; x++) for (let y = 0; y <= 4; y++) for (let z = -2; z <= 2; z++) {
      if (Math.hypot(x * 0.9, (y - 1) * 1.1, z) > 3.3 + vn(x + y, 96) * 0.6) continue;
      v.set(x, y, z, y > 2 && x < 0 ? P.amberL : x > 1 ? P.amberD : P.amber);
    }
  } else if (group === 'shell' || group === 'plant') {
    for (let a = 0; a < 2.4 * TAU; a += 0.18) { const rr = 4.4 * (1 - a / (2.8 * TAU)); v.set(Math.round(cos(a) * rr), 2 + Math.round(sin(a) * rr), 0, a < TAU ? P.boneL : P.bone); }
    for (let x = -4; x <= 4; x++) for (let y = -2; y <= 6; y++) if (Math.hypot(x, y - 2) < 4.4 && !v.has(x, y, 0)) v.set(x, y, -1, P.limeD);
  } else {
    // a bone end: a shaft rising out of the dirt at an angle with a knobbly end
    for (let k = 0; k <= 9; k++) for (let t = -1; t <= 1; t++) v.set(Math.round(k * 0.55), k, t, t === 1 ? P.boneL : P.bone);
    for (let x = 3; x <= 7; x++) for (let y = 8; y <= 11; y++) for (let z = -2; z <= 2; z++) if (Math.hypot(x - 5, (y - 9.5) * 1.3, z) < 2.6) v.set(x, y, z, y > 10 ? P.boneL : (x + z) % 3 === 0 ? P.boneD : P.bone);
  }
  return v;
}
/** a fossil site in the world. kind 'fresh' (with a flag + what peeks out) | 'dug' */
export function makeSiteMound(kind = 'fresh', group = 'bone') {
  const root = new THREE.Group();
  root.name = 'DigSite';
  root.add(lit(memo('mound:' + kind, () => moundModel(kind))));
  if (kind === 'fresh') {
    const peek = lit(memo('peek:' + group, () => peekModel(group)), group === 'amber' ? 0x6a3a00 : 0);
    peek.position.set(2 * FV, 3 * FV, -2 * FV);
    peek.rotation.set(0.15, 0.5, -0.12);
    root.add(peek);
    const stake = lit(memo('stake', stakeModel));
    stake.position.set(-9 * FV, 1 * FV, -6 * FV);
    root.add(stake);
    const flag = new THREE.Group();
    flag.position.set(-9 * FV, 27 * FV, -6 * FV);
    flag.add(lit(memo('flag', flagModel)));
    root.add(flag);
    root.userData.flag = flag;
  }
  return root;
}

// ================================================================== finds in miniature
const MINI = {
  shell(v, F) {
    if (F.id === 'trilobite') {
      for (let z = -6; z <= 6; z++) for (let x = -4; x <= 4; x++) {
        const w = z > 3 ? 4.5 - (z - 3) * 0.3 : 3.6 - Math.max(0, -z - 2) * 0.5;
        if (abs(x) > w) continue;
        const seg = (z + 20) % 2 === 0 && z < 3;
        v.set(x, z > 3 ? 1 : 0, z, abs(x) <= 1 ? (seg ? P.limeD : P.limeL) : seg ? P.limeD : P.lime);
      }
      v.set(-2, 2, 5, 0x3a3a44).set(1, 2, 5, 0x3a3a44);
      return;
    }
    if (F.id === 'crinoid') {
      for (let y = 0; y <= 10; y++) v.set(Math.round(sin(y * 0.3)), y, 0, y % 2 ? P.limeD : P.limeL);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * PI - PI; for (let r = 1; r <= 5; r++) v.set(Math.round(cos(a) * r * 0.8), 11 + Math.round(-sin(a) * r), 0, r === 5 ? P.limeD : P.lime); }
      return;
    }
    // ammonite: a ribbed spiral disc standing up on its edge
    for (let x = -6; x <= 6; x++) for (let y = 0; y <= 12; y++) {
      const dx = x, dy = y - 6, r = Math.hypot(dx, dy);
      if (r > 6.2) continue;
      const a = Math.atan2(dy, dx);
      const rib = Math.floor((a + PI) * 4 + r * 0.9) % 2;
      v.set(x, y, 0, r < 1.5 ? P.boneD : rib ? P.bone : P.boneL);
      v.set(x, y, -1, P.boneD);
    }
  },
  plant(v) {
    for (let x = -6; x <= 6; x++) for (let y = 0; y <= 13; y++) v.set(x, y, -1, tone(x, y, 1, P.shale, P.shaleD, 0x5a5a64, 0.2, 0.1));
    for (let y = 1; y <= 12; y++) { v.set(0, y, 0, 0x2a2a30); if (y % 2 === 0) for (let k = 1; k <= 5 - Math.floor(y / 4); k++) { v.set(k, y + Math.round(k * 0.3), 0, 0x3a3a40); v.set(-k, y + Math.round(k * 0.3), 0, 0x3a3a40); } }
  },
  bone(v, F) {
    if (F.id === 'sharktooth' || F.id === 'sabrefang') {
      const L = F.id === 'sabrefang' ? 13 : 8;
      for (let y = 0; y <= L; y++) { const w = Math.max(0, Math.round((1 - y / L) * (F.id === 'sabrefang' ? 2 : 3.5))); for (let x = -w; x <= w; x++) v.set(x + Math.round((y / L) ** 2 * 3), y, 0, y < 2 ? 0x8a6a4a : x < 0 ? P.boneL : P.bone); }
      return;
    }
    if (F.id === 'raptorclaw') { for (let k = 0; k <= 12; k++) { const a = k / 12 * 2.1; const r = 7; const w = Math.max(0, 2 - Math.floor(k / 5)); for (let t = -w; t <= w; t++) v.set(Math.round(cos(a) * r) - 3, Math.round(sin(a) * r), t, t > 0 ? P.boneL : P.bone); } return; }
    if (F.id === 'mammoth') { for (let x = -5; x <= 5; x++) for (let y = 0; y <= 7; y++) for (let z = -3; z <= 3; z++) v.set(x, y, z, y === 7 ? ((x + 20) % 2 ? 0xd8ccb0 : 0x8a7a5a) : y < 2 ? 0x8a6a4a : P.bone); return; }
    if (F.id === 'lobescale') { for (let x = -5; x <= 5; x++) for (let y = 0; y <= 10; y++) if (abs(x) + abs(y - 5) <= 5) v.set(x, y, 0, (x + y) % 3 === 0 ? 0x4a6a8a : 0x6a8aaa); return; }
    if (F.id === 'coelacanth') {
      for (let x = -12; x <= 12; x++) for (let y = 0; y <= 10; y++) v.set(x, y, -1, tone(x, y, 1, P.lime, P.limeD, P.limeL, 0.2, 0.1));
      for (let x = -9; x <= 9; x++) { const h = Math.round(3.2 * (1 - (x / 10) ** 2)); for (let y = 5 - h; y <= 5 + h; y++) v.set(x, y, 0, (x + y) % 3 === 0 ? P.boneD : P.bone); }
      for (const [x, y] of [[-11, 2], [-11, 8], [-12, 5], [-10, 5]]) v.set(x, y, 0, P.boneD);
      v.set(7, 6, 1, 0x3a2a1a);
      return;
    }
    // armoured skull: a blunt block of plates with a blade jaw
    for (let x = -6; x <= 6; x++) for (let y = 0; y <= 8; y++) for (let z = -3; z <= 3; z++) {
      if (Math.hypot(x / 6.4, (y - 4) / 4.4) > 1) continue;
      v.set(x, y, z, (x === 0 || y === 5) ? P.boneD : y > 5 ? P.boneL : P.bone);
    }
    v.set(3, 5, 4, 0x2a1e14).set(4, 5, 4, 0x2a1e14);
    for (let x = 2; x <= 7; x++) v.set(x, 1, 3, P.boneL);
  },
  egg(v) {
    for (let x = -5; x <= 5; x++) for (let y = 0; y <= 14; y++) for (let z = -5; z <= 5; z++) {
      if (Math.hypot(x / 5, (y - 7) / 7, z / 5) > 1) continue;
      v.set(x, y, z, (x + y * 2 + z) % 9 === 0 ? 0x8a7a6a : y > 9 ? 0xd8cfc0 : 0xc4baa8);
    }
    for (let y = 4; y <= 9; y++) v.set(Math.round(sin(y) * 1.5), y, 5, 0x5a4a3a);
  },
  amber(v, F) {
    const R = F.id === 'heartamber' ? 6 : 5;
    for (let x = -R; x <= R; x++) for (let y = 0; y <= R * 2; y++) for (let z = -R + 2; z <= R - 2; z++) {
      const r = Math.hypot(x / R, (y - R) / R, z / (R - 1.5));
      if (r > 0.92 + vn(x * 0.6 + y * 0.4, 97) * 0.16) continue;
      v.set(x, y, z, F.id === 'heartamber' ? (y > R && x < 0 ? 0xffb0a0 : 0xe04a3a) : y > R + 1 && x < 0 ? P.amberL : x > 2 ? P.amberD : P.amber);
    }
  },
};
export function makeFindMini(id) {
  const F = FIND_BY_ID[id] || FIND_BY_ID.ammonite;
  const geo = memo('mini:' + F.id, () => {
    const v = new VoxelModel();
    (MINI[F.group] || MINI.bone)(v, F);
    // inclusions inside amber (a dark speck / a feather / a glow)
    if (F.id === 'amberbug') { v.set(0, 5, 3, 0x2a1a0a).set(1, 6, 3, 0x2a1a0a).set(-1, 6, 3, 0x2a1a0a).set(0, 6, 4, 0x2a1a0a); }
    if (F.id === 'amberfeather') for (let k = 0; k < 6; k++) { v.set(-2 + k, 3 + k, 3, 0xf4ead0); v.set(-2 + k, 4 + k, 3, 0x8a6a4a); }
    return v;
  });
  const m = lit(geo, F.kind === 'amber' ? (F.id === 'heartamber' ? 0x701808 : 0x5a3000) : 0);
  const root = new THREE.Group();
  root.add(m);
  root.name = 'Find:' + F.id;
  return root;
}

// ================================================================== a giant, half buried
function ribsModel() {
  const v = new VoxelModel();
  const bone = (x, y, z, k = 0) => { const h = hash3(x, y, z); return h < 0.08 ? P.boneD : k > 0.6 ? P.boneL : h > 0.9 ? P.boneL : P.bone; };
  // the spine: a row of knobbly vertebrae just breaking the ground
  for (let x = -44; x <= 40; x += 4) {
    const y = 1 + Math.round(Math.sin((x + 44) * 0.05) * 1.5);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (let dz = -2; dz <= 1; dz++) v.set(x + dx, y + dy, dz, bone(x + dx, dy, dz, dy / 3));
    v.set(x + 1, y + 3, 0, P.boneL).set(x + 1, y + 4, -1, P.bone); // the spinous process
  }
  // the ribs: tall curved arcs, both sides, shrinking toward the tail; one snapped
  for (let k = 0; k < 7; k++) {
    const x0 = -30 + k * 9, H = 34 - k * 3.4, W = 15 - k * 1.1;
    for (const side of [1, -1]) {
      if (k === 4 && side < 0) continue; // a missing one
      const broken = k === 2 && side > 0;
      for (let q = 0; q <= 1.0001; q += 0.025) {
        if (broken && q > 0.62) break;
        const a = q * Math.PI * 0.62;
        const y = Math.round(Math.sin(a) * H) + 2, z = Math.round((1 - Math.cos(a)) * W * side * 0.55) + (side > 0 ? 1 : -2);
        const x = x0 - Math.round(q * 4);
        for (let t = 0; t < 2; t++) v.set(x + t, y, z, bone(x, y, z, t ? 0.7 : 0));
        if (q < 0.15) v.set(x, y, z + side, P.bone);
      }
      if (broken) { const y = Math.round(Math.sin(0.62 * Math.PI * 0.62) * H) + 2; v.set(x0 - 3, y + 1, 6, P.boneL).set(x0 - 2, y + 2, 6, P.boneD); }
    }
  }
  // the skull, nose down in the dirt at the front: a long jaw with a row of teeth, one empty eye
  for (let x = 42; x <= 62; x++) for (let y = 0; y <= 12; y++) for (let z = -6; z <= 5; z++) {
    const u = (x - 42) / 20;
    const hh = 12 * (1 - u * 0.65), hw = 6 * (1 - u * 0.45);
    if (y > hh || Math.abs(z + 0.5) > hw * Math.sqrt(1 - (y / (hh + 0.01)) ** 2)) continue;
    v.set(x, y, z, bone(x, y, z, y / 12));
  }
  for (let x = 50; x <= 55; x++) for (let y = 6; y <= 9; y++) if (Math.hypot(x - 52.5, y - 7.5) < 2.2) for (let z = 3; z <= 6; z++) v.set(x, y, z, null);
  for (let x = 51; x <= 54; x++) for (let y = 6; y <= 9; y++) if (Math.hypot(x - 52.5, y - 7.5) < 1.8) v.set(x, y, 2, 0x2a1e14);
  for (let x = 46; x <= 62; x += 2) { v.set(x, 1, 5, P.boneL); v.set(x, 0, 5, P.boneL); } // teeth along the jaw
  // dirt heaped round the bones (they're coming out of the ground, not lying on it)
  for (let x = -50; x <= 66; x++) for (let z = -16; z <= 14; z++) {
    const d = Math.abs(z + 0.5) / (8 + vn(x * 0.11, 98) * 6);
    if (d > 1) continue;
    const h = Math.round((1 - d) * (2.5 + vn(x * 0.07 + z * 0.1, 99) * 2.5));
    for (let y = 0; y < h; y++) if (!v.has(x, y, z)) v.set(x, y, z, y === h - 1 ? (nz(x, z, 100) < 0.1 ? P.stone : tone(x, y, z, P.soilL, P.soil, P.sand, 0.2, 0.15)) : P.soil);
  }
  return v;
}
export function makeRibcage() {
  const root = new THREE.Group();
  root.name = 'DigRibs';
  root.add(lit(memo('ribs', ribsModel)));
  return root;
}
