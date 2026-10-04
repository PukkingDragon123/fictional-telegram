// [v20 npc homes] Outside models for the neighbours' homes (the ones that had no
// building yet) + the little mailbox that marks every home's front door.
// Same conventions as npcProps*.js: Lambert + grain, geometry built lazily and
// shared between copies (never disposed), front = +Z, 1 unit = 1 tile, origin =
// bottom centre. Every house has userData.door (local point in front of the door)
// and userData.parts.door (a hinged group that swings open on visits).
//
//   makeHomeHouse('clover' | 'otis' | 'hazel')   burrow mound / riverside stick den / bakery cottage
//   makeMailbox(flagHex, postHex)                a post + box with a flag (raised when a reward waits)
import * as THREE from 'three';
import { VS, VoxelModel, ell, tone, hash3, buildGeo, matFor, grainMaterial } from '../critterKit.js';
import { shade, mix } from '../../core/voxel.js';

const memo = new Map();
const geoOf = (key, build, scale = VS) => { let g = memo.get(key); if (!g) { g = buildGeo(build(), [0, 0, 0], scale); memo.set(key, g); } return g; };
const glowGeo = (key, build, scale = VS) => { let g = memo.get(key); if (!g) { g = build().build({ pivot: [0, 0, 0], scale, ao: false }); g.userData.scale = scale; memo.set(key, g); } return g; };
let glowMat = null;
const mesh = (geo, glow = false) => {
  const m = new THREE.Mesh(geo, glow ? (glowMat ||= grainMaterial(VS, [0, 0, 0], 0.02, 0xffc860)) : matFor(geo, 0.08));
  m.castShadow = !glow; m.receiveShadow = true;
  return m;
};

const P = {
  grass: 0x6aa83e, grassD: 0x58902f, grassL: 0x86c04c, dirt: 0x8a5a32, dirtD: 0x6a4224,
  wood: 0xa8743e, woodD: 0x7e5228, woodL: 0xc48c50, stick: 0x8a5a30, stickD: 0x6a4222, stickL: 0xa8743e,
  cream: 0xf4e4c0, creamD: 0xe0ccA0, pink: 0xe87890, pinkD: 0xc85a74, pinkL: 0xf8a0b4, red: 0xd8403a, brass: 0xe8c050,
  stone: 0x9a968c, stoneD: 0x7e7a72, stoneL: 0xb4b0a4, glow: 0xffd070, glowL: 0xfff0b0, blue: 0x4a8ad0, blueD: 0x3a6aa8,
  ink: 0x2a2028, white: 0xfaf6ea, carrot: 0xf08a1a, leaf: 0x4f9c44, sage: 0x6aa88a, sageD: 0x4e8a6e,
};

// round door shape: half width hw, height h (top is a half circle)
const inDoor = (x, y, hw, h) => { const top = h - hw; if (y < 0 || Math.abs(x + 0.5) > hw) return false; if (y <= top) return true; return Math.hypot(x + 0.5, y - top) <= hw; };

function doorModel(hw, h, col, knob = P.brass, round = true) {
  const v = new VoxelModel();
  for (let x = -hw; x < hw; x++) for (let y = 0; y < h; y++) {
    if (round && !inDoor(x, y, hw, h)) continue;
    const plank = (x + 40) % 3 === 0;
    v.set(x + hw, y, 0, plank ? shade(col, 0.82) : tone(x, y, 1, col, shade(col, 0.92), shade(col, 1.08)));
  }
  v.set(2 * hw - 2, Math.round(h * 0.45), 1, knob);
  return v;
}

// ------------------------------------------------------------------ Clover: a grassy burrow mound
function burrow() {
  const v = new VoxelModel(), g = new VoxelModel();
  const RX = 22, RY = 24, RZ = 17;
  ell(v, -0.5, 0, -2, RX, RY, RZ, (x, y, z) => (y > RY * 0.55 - hash3(x, 0, z) * 4 ? tone(x, y, z, P.grass, P.grassD, P.grassL, 0.2, 0.15) : tone(x, y, z, P.dirt, P.dirtD, 0xa06a3c, 0.2, 0.12)));
  v.paint((x, y, z, c) => (y < 0 ? null : c));
  // stone ring round the door
  const DH = 17, DW = 6, fz = 13;
  for (let x = -DW - 2; x < DW + 2; x++) for (let y = 0; y < DH + 2; y++) {
    const ind = inDoor(x, y, DW, DH), ring = inDoor(x, y, DW + 2, DH + 2);
    if (ind) for (let z = fz - 6; z <= fz + 6; z++) v.set(x, y, z, null);
    else if (ring) { for (let z = fz - 3; z <= fz + 3; z++) if (v.has(x, y, z) || z <= fz + 1) v.set(x, y, z, tone(x, y, 0, P.stone, P.stoneD, P.stoneL, 0.25, 0.2)); }
  }
  for (let x = -DW; x < DW; x++) for (let y = 0; y < DH; y++) if (inDoor(x, y, DW, DH)) v.set(x, y, fz - 4, 0x3a2414);
  // round windows either side (warm glow)
  for (const cx of [-14, 13]) for (let x = cx - 3; x <= cx + 3; x++) for (let y = 7; y <= 13; y++) {
    const r = Math.hypot(x - cx, y - 10);
    if (r > 3.6) continue;
    let fzz = null; for (let z = 18; z > -10; z--) if (v.has(x, y, z)) { fzz = z; break; }
    if (fzz == null) continue;
    if (r > 2.5) v.set(x, y, fzz + 1, P.white); else { v.set(x, y, fzz, null); g.set(x, y, fzz, r < 1 ? P.glowL : P.glow); }
  }
  // flowers + a carrot sign on top, a little chimney pipe
  for (let i = 0; i < 26; i++) { const a = i * 2.39, r = 4 + (i % 7) * 2.4; const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r * 0.7) - 2; let y = 0; for (let yy = 30; yy > 0; yy--) if (v.has(x, yy, z)) { y = yy + 1; break; } if (y > 10) v.set(x, y, z, [0xffffff, 0xf2c230, 0xd9529b, 0x7d63d8][i % 4]); }
  v.box(8, 18, -6, 10, 26, -4, 0x6a6a72); v.box(7, 27, -7, 11, 27, -3, 0x4a4a52);
  // big carrot weathervane on a pole
  v.box(-9, 20, -4, -9, 32, -4, P.woodD);
  for (let i = 0; i < 9; i++) { v.set(-12 + i, 33 + (i > 6 ? 0 : 0), -4, i < 2 ? P.leaf : P.carrot); if (i > 1 && i < 7) v.set(-12 + i, 34, -4, P.carrot); }
  v.set(-13, 34, -4, P.leaf); v.set(-13, 32, -4, P.leaf);
  // stepping stones + doormat
  for (const [x, z] of [[-1, 19], [1, 23], [-1, 27]]) v.box(x - 2, 0, z - 1, x + 1, 0, z + 1, P.stoneL);
  v.box(-5, 0, fz + 2, 4, 0, fz + 4, (x) => (x % 2 ? 0xc8a04a : 0xa8803a));
  return { v, g, door: { hw: DW, h: DH, at: [-DW, 0, fz - 3], col: P.sage }, front: fz + 5 };
}

// ------------------------------------------------------------------ Otis: a stick den on the bank
function den() {
  const v = new VoxelModel(), g = new VoxelModel();
  const RX = 21, RY = 22, RZ = 16;
  ell(v, -0.5, 0, -2, RX, RY, RZ, (x, y, z) => {
    const band = Math.floor((y + hash3(x, 0, z) * 3) / 3) % 2;
    const c = band ? P.stick : P.stickD;
    return hash3(x, y, z) < 0.12 ? P.stickL : hash3(x, y, z + 7) < 0.04 ? 0x4a7a3a : c;
  });
  v.paint((x, y, z, c) => (y < 0 ? null : c));
  // sticks poking out
  for (let i = 0; i < 18; i++) { const a = i * 1.7, h = 4 + (i * 5) % 18; const x0 = Math.round(Math.cos(a) * 18), z0 = Math.round(Math.sin(a) * 13) - 2; for (let k = 0; k < 6; k++) v.set(x0 + Math.round(Math.cos(a) * k * 0.6), h + (k >> 1), z0 + Math.round(Math.sin(a) * k * 0.5), P.stickL); }
  const DH = 16, DW = 6, fz = 12;
  for (let x = -DW - 2; x < DW + 2; x++) for (let y = 0; y < DH + 2; y++) {
    const ind = inDoor(x, y, DW, DH), ring = inDoor(x, y, DW + 2, DH + 2);
    if (ind) for (let z = fz - 6; z <= fz + 8; z++) v.set(x, y, z, null);
    else if (ring) for (let z = fz - 2; z <= fz + 2; z++) v.set(x, y, z, P.woodL);
  }
  for (let x = -DW; x < DW; x++) for (let y = 0; y < DH; y++) if (inDoor(x, y, DW, DH)) v.set(x, y, fz - 4, 0x2a1a10);
  // porthole window (brass ring, glow)
  const cx = 12, cy = 13;
  for (let x = cx - 4; x <= cx + 4; x++) for (let y = cy - 4; y <= cy + 4; y++) {
    const r = Math.hypot(x - cx, y - cy);
    if (r > 4.3) continue;
    let fzz = null; for (let z = 18; z > -10; z--) if (v.has(x, y, z)) { fzz = z; break; }
    if (fzz == null) continue;
    if (r > 3) v.set(x, y, fzz + 1, P.brass); else { v.set(x, y, fzz, null); g.set(x, y, fzz, r < 1.2 ? P.glowL : P.glow); }
  }
  // fish sign over the door
  ell(v, -0.5, DH + 6, fz + 3, 6, 2.5, 1, 0x7ab0d0); v.box(5, DH + 4, fz + 3, 7, DH + 8, fz + 3, 0x5a90b8); v.set(-5, DH + 7, fz + 4, P.ink);
  // anchor + rope coil by the door, oar leaning
  v.box(-14, 0, fz + 2, -14, 9, fz + 2, 0x5a5a62); v.box(-17, 1, fz + 2, -11, 1, fz + 2, 0x5a5a62); v.set(-17, 2, fz + 2, 0x5a5a62); v.set(-11, 2, fz + 2, 0x5a5a62); v.box(-16, 9, fz + 2, -12, 9, fz + 2, 0x5a5a62);
  for (let a = 0; a < 20; a++) v.set(Math.round(11 + Math.cos(a * 0.6) * 3), a > 10 ? 1 : 0, Math.round(fz + 4 + Math.sin(a * 0.6) * 2), 0xd8c090);
  v.box(-8, 0, fz + 6, 7, 0, fz + 8, (x) => (x % 2 ? 0x5a90b8 : 0x4a7aa0));
  return { v, g, door: { hw: DW, h: DH, at: [-DW, 0, fz - 3], col: P.blue }, front: fz + 8 };
}

// ------------------------------------------------------------------ Hazel: a bakery cottage
function bakery() {
  const v = new VoxelModel(), g = new VoxelModel();
  const X0 = -18, X1 = 17, Z0 = -12, Z1 = 9, WH = 22;
  // stone footing + cream timber-frame walls
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) for (let y = 0; y < WH; y++) {
    const edge = x === X0 || x === X1 || z === Z0 || z === Z1;
    if (!edge) continue;
    let c = y < 3 ? tone(x, y, z, P.stone, P.stoneD, P.stoneL, 0.3, 0.2) : tone(x, y, z, P.cream, 0xe8d4ac, 0xfaf0d8, 0.15, 0.1);
    if (y >= 3 && ((x - X0) % 9 === 0 || y === 3 || y === WH - 1 || y === 12)) c = P.woodD;
    v.set(x, y, z, c);
  }
  // gable roof (pink shingles) along X
  for (let i = 0; i <= 15; i++) for (let x = X0 - 2; x <= X1 + 2; x++) {
    const y = WH + i;
    for (const z of [Z0 - 2 + i, Z1 + 2 - i]) v.set(x, y, z, (i % 2 ? P.pink : P.pinkD) === P.pink && hash3(x, y, z) < 0.15 ? P.pinkL : i % 2 ? P.pink : P.pinkD);
    if (Z0 - 2 + i >= Z1 + 2 - i) break;
  }
  for (let y = WH; y < WH + 14; y++) for (let z = Z0 + (y - WH); z <= Z1 - (y - WH); z++) { v.set(X0, y, z, P.cream); v.set(X1, y, z, P.cream); }
  // chimney
  v.box(9, WH + 4, -6, 13, WH + 18, -2, (x, y, z) => ((y % 3 === 0) || ((x + Math.floor(y / 3)) % 4 === 0) ? 0xd8c8b0 : 0xb8583a));
  // door (red, round top) with a step
  const DW = 5, DH = 15, dx = -7;
  for (let x = -DW; x < DW; x++) for (let y = 0; y < DH; y++) if (inDoor(x, y, DW, DH)) { v.set(x + dx, y + 1, Z1, null); v.set(x + dx, y + 1, Z1 - 1, 0x3a2414); }
  v.box(dx - DW - 1, 0, Z1 + 1, dx + DW, 0, Z1 + 2, P.stoneL);
  // big shop window with pies on the sill + a striped awning
  for (let x = 1; x <= 13; x++) for (let y = 6; y <= 13; y++) { const fr = x === 1 || x === 13 || y === 6 || y === 13 || x === 7; if (fr) v.set(x, y, Z1 + 1, P.white); else { v.set(x, y, Z1, null); g.set(x, y, Z1 - 1, y > 10 ? P.glowL : P.glow); } }
  v.box(1, 5, Z1 + 1, 13, 5, Z1 + 3, P.woodL);
  for (const px of [3, 9]) { ell(v, px + 0.5, 6.5, Z1 + 2, 2.4, 1.2, 1.2, 0xe0a050); v.set(px, 7, Z1 + 2, 0xc84060); }
  for (let x = 0; x <= 14; x++) for (let k = 0; k < 4; k++) v.set(x, 16 - k, Z1 + 1 + k, Math.floor(x / 2) % 2 ? P.white : P.pink);
  // round pie sign hanging over the door
  v.box(dx - 3, DH + 4, Z1 + 1, dx + 2, DH + 4, Z1 + 4, P.woodD);
  ell(v, dx - 0.5, DH + 1, Z1 + 4, 3.5, 3.5, 0.6, 0xe0a050); ell(v, dx - 0.5, DH + 1.5, Z1 + 5, 2, 1, 0.5, 0xc84060);
  // flour sacks + a little bench
  for (const [x, z] of [[-16, Z1 + 3], [-13, Z1 + 3]]) { ell(v, x, 3, z, 2.2, 3.2, 2, 0xf0e8d8); v.set(x, 6, z, 0xc8b898); }
  return { v, g, door: { hw: DW, h: DH, at: [dx - DW, 1, Z1 - 1], col: P.red }, front: Z1 + 3 };
}

const BUILD = { clover: burrow, otis: den, hazel: bakery };

/** A neighbour's house (the three that had none); null for others. */
export function makeHomeHouse(id) {
  const fn = BUILD[id];
  if (!fn) return null;
  let parts = memo.get('house_' + id);
  if (!parts) {
    const m = fn();
    parts = { body: buildGeo(m.v, [0, 0, 0], VS), glow: m.g.vox.size ? m.g.build({ pivot: [0, 0, 0], scale: VS, ao: false }) : null, door: buildGeo(doorModel(m.door.hw, m.door.h, m.door.col), [0, 0, 0], VS), info: m };
    memo.set('house_' + id, parts);
  }
  const g = new THREE.Group();
  g.name = 'Home_' + id;
  g.add(mesh(parts.body));
  if (parts.glow) g.add(mesh(parts.glow, true));
  const hinge = new THREE.Group();
  const dm = mesh(parts.door);
  hinge.add(dm);
  const [ax, ay, az] = parts.info.door.at;
  hinge.position.set(ax * VS, ay * VS, az * VS);
  g.add(hinge);
  g.userData.parts = { door: hinge };
  g.userData.door = new THREE.Vector3((ax + parts.info.door.hw) * VS, 0, (parts.info.front) * VS);
  return g;
}

/** A mailbox on a post (marks the door; userData.flag raises when something waits inside) */
export function makeMailbox(flag = 0xd8403a, body = 0x4a8ad0) {
  const key = 'mail_' + flag + '_' + body;
  const geo = geoOf(key, () => {
    const v = new VoxelModel();
    v.box(0, 0, 0, 1, 14, 1, P.woodD);
    v.box(-3, 15, -4, 4, 19, 5, (x, y, z) => (z === 5 ? shade(body, 0.85) : tone(x, y, z, body, shade(body, 0.9), shade(body, 1.1))));
    v.box(-2, 20, -4, 3, 20, 5, shade(body, 1.1));
    return v;
  }, 0.025);
  const fgeo = geoOf('mailflag_' + flag, () => { const v = new VoxelModel(); v.box(0, 0, 0, 0, 7, 0, P.ink); v.box(0, 5, 0, 0, 7, 3, flag); return v; }, 0.025);
  const g = new THREE.Group();
  g.name = 'Mailbox';
  g.add(mesh(geo));
  const f = mesh(fgeo);
  f.position.set(5 * 0.025, 15 * 0.025, -1 * 0.025);
  g.add(f);
  g.userData.flag = f;
  return g;
}

// floating "door" marker (a little pixel house with an arrow) shown near open homes
let markerMat = null;
export function makeDoorMarker() {
  if (!markerMat) {
    const rows = [
      '....kk....', '...kRRk...', '..kRRRRk..', '.kRRRRRRk.', 'kkkkkkkkkk', '.kwwwwwwk.', '.kwkkwwwk.', '.kwkykwwk.', '.kwkkwwwk.', '.kkkkkkkk.',
      '..........', '....kk....', '...kyyk...', '..kyyyyk..', '...kkkk...',
    ];
    const pal = { k: '#2a1520', R: '#d8403a', w: '#fff3d8', y: '#ffd84a' };
    const c = document.createElement('canvas');
    c.width = 10; c.height = rows.length;
    const ctx = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); } }));
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    markerMat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, depthTest: false });
  }
  const s = new THREE.Sprite(markerMat);
  s.scale.set(0.32, 0.48, 1);
  s.renderOrder = 5;
  return s;
}
