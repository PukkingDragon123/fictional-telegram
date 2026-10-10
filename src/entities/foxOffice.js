// [v26 evening] Reynard's home office: the right-hand corner of his bedroom
// (src/entities/bedroomScene.js). A walnut desk against the back wall with a
// chunky beige 386 (pizza-box case + CRT), a banker's lamp, the piggy bank, a
// "#1 BOSS" mug... and a high-backed red villain chair that swivels. Plus the
// twin-bell alarm clock for the nightstand and the morning coffee mug.
//
// Everything is built in the bedroom's voxel space (0.05 / 0.025 world units,
// floor top y = 0, back wall face z = -1.6). The static parts go straight into
// the room's voxel models; the parts that move are their own meshes:
//
//   const office = buildOffice({ R, F, G, FG, mats, group });
//   office.chair            Group, origin = seat centre on the floor; local +z = the sitter's front
//   office.seat             { position, rotationY } where the fox's root sits (facing the desk)
//   office.pc.setMode('off' | 'boot' | 'on' | 'alert'), office.pc.jolt()
//   office.junk.jolt(k)     the desk clutter hops (desk slam)
//   office.alarm.ring(on)   the nightstand alarm clock rattles (or stops)
//   office.update(dt, t)
//   makeMug()               a coffee mug for fox.hold()
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';
import { FOX_DESK_HEIGHT, FOX_KEYBOARD_Z } from './foxRig.js';

const V = 0.05, FV = 0.025;
const W = (n) => n * V;

// palette
const WAL = 0x6e4024, WAL_D = 0x51301a, WAL_L = 0x8c5632, BRASS = 0xe8b84a, BRASS_D = 0xb8862a, BRASS_L = 0xfff0a0;
const BEIGE = 0xe4d8ba, BEIGE_L = 0xf4ecd4, BEIGE_D = 0xc8b894, BEIGE_DD = 0x9c8c6c, KEY = 0x6c665a, KEY_L = 0x8c867a;
const LEATHER = 0xb8262c, LEATHER_D = 0x8a1a22, LEATHER_L = 0xd8463c, STUD = 0xffd23f, CHROME = 0xc8ccd8, CHROME_D = 0x80869a, BLACK = 0x2a2228;

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ layout (world units)
// desk against the back wall; the fox sits in front of it facing -z (back to the camera)
export const OFFICE = Object.freeze({
  deskX0: 2.6, deskX1: 3.8, deskZ0: -1.6, deskZ1: -1.0, top: FOX_DESK_HEIGHT,
  seatX: 3.12, seatZ: -1.0 - 0.08 + FOX_KEYBOARD_Z, // keyboard 0.08 behind the desk's front edge
  pcX: 2.82, pcZ: -1.36,
  x1: 4.3, // right edge of the room
});

// ------------------------------------------------------------------ static decor (room voxels)
function buildDesk(R, F) {
  const x0 = Math.round(OFFICE.deskX0 / V), x1 = Math.round(OFFICE.deskX1 / V) - 1; // 52..75
  const z0 = -32, z1 = Math.round(OFFICE.deskZ1 / V) - 1; // -32..-21
  const topY = Math.round(OFFICE.top / V) - 1; // 15 (top face at 0.8)
  const grain = (x, y, z) => { const h = hash3(x, y, z); return h < 0.12 ? WAL_D : h > 0.9 ? WAL_L : WAL; };
  // top slab with a lighter rounded front edge
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0; z <= z1 + 1; z++) {
    R.set(x, topY, z, z === z1 + 1 || x === x0 - 1 || x === x1 + 1 ? WAL_L : grain(x, topY, z >> 2));
    R.set(x, topY - 1, z, WAL_D);
  }
  // two pedestals with drawers (front face z = z1), a knee hole between them
  for (const [a, b] of [[x0, x0 + 6], [x1 - 6, x1]]) {
    for (let x = a; x <= b; x++) for (let z = z0; z <= z1; z++) for (let y = 0; y < topY - 1; y++) {
      const front = z === z1;
      let c = grain(x, y, z);
      if (front) {
        const seam = y === 0 || y === 5 || y === 10 || x === a || x === b;
        c = seam ? WAL_D : grain(x, y, 7);
        if ((y === 3 || y === 8 || y === 12) && x === ((a + b) >> 1)) c = BRASS;
      }
      R.set(x, y, z, c);
    }
  }
  // back panel of the knee hole
  for (let x = x0 + 7; x < x1 - 6; x++) for (let y = 3; y < topY - 1; y++) R.set(x, y, z0, WAL_D);
  // brass drawer pulls stick out a little (fine voxels)
  for (const xc of [(x0 + x0 + 6) / 2, (x1 - 6 + x1) / 2]) for (const y of [3, 8, 12]) {
    const fx = Math.round((xc + 0.5) * 2) - 1, fy = y * 2 + 1, fz = (z1 + 1) * 2;
    F.set(fx - 1, fy, fz, BRASS_D); F.set(fx, fy, fz, BRASS); F.set(fx + 1, fy, fz, BRASS_D);
  }
  return { x0, x1, z0, z1, topY };
}

function buildWallDecor(R, F) {
  const z = -32;
  // framed profit chart above the desk: cream paper, a green zig-zag going UP, red arrow head, a coin
  const cx0 = 61, cx1 = 74, cy0 = 22, cy1 = 33; // [v26 evening] was 59: room for the cork board next to the wardrobe
  for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) {
    const fr = x === cx0 || x === cx1 || y === cy0 || y === cy1;
    R.set(x, y, z, fr ? (x + y) % 3 ? 0xd8a83a : 0xb88a2a : 0xf6ecd2);
  }
  const pts = [[61, 25], [63, 27], [65, 26], [67, 29], [69, 28], [71, 31]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) R.set(Math.round(ax + (bx - ax) * k / n), Math.round(ay + (by - ay) * k / n), z, 0x3aa84a);
  }
  R.set(72, 32, z, 0xd8463e); R.set(71, 32, z, 0xd8463e); R.set(72, 31, z, 0xd8463e); R.set(70, 32, z, 0xd8463e);
  for (let x = 61; x <= 63; x++) for (let y = 30; y <= 32; y++) if (!(x !== 62 && y !== 31)) R.set(x, y, z, 0xffd23f);
  R.set(62, 31, z, 0xf0a020);
  // cork board with pinned notes and a "wanted" bear photo (red X)
  const bx0 = 49, bx1 = 59, by0 = 20, by1 = 30;
  for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) {
    const fr = x === bx0 || x === bx1 || y === by0 || y === by1;
    R.set(x, y, z, fr ? WAL_D : hash3(x, y, 3) < 0.3 ? 0xb88a5a : 0xc89a68);
  }
  const note = (x, y, c) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R.set(x + i, y + j, z, c); };
  note(50, 26, 0xffe46a); note(54, 27, 0xffa0c0); note(50, 21, 0xf6f2e6);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) R.set(55 + i, 21 + j, z, j === 0 || j === 3 || i === 0 || i === 3 ? 0xf6f2e6 : 0x6a4a3a);
  R.set(55, 21, z, 0xd8463e); R.set(56, 22, z, 0xd8463e); R.set(57, 23, z, 0xd8463e); R.set(58, 24, z, 0xd8463e);
  R.set(58, 21, z, 0xd8463e); R.set(57, 22, z, 0xd8463e); R.set(56, 23, z, 0xd8463e); R.set(55, 24, z, 0xd8463e);
  for (const [x, y] of [[51, 28], [55, 29], [51, 23], [56, 25]]) F.set(x * 2 + 1, y * 2 + 1, z * 2 + 2, 0xd83a32);
}

function buildCabinet(R) {
  // olive filing cabinet in the back-right corner, three drawers with brass pulls + label slots
  const x0 = 78, x1 = 85, z0 = -32, z1 = -24, h = 21;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 0; y <= h; y++) {
    const front = z === z1;
    let c = (x === x0 || y === h) ? 0x8a9a7a : 0x7a8a6a;
    if (front) {
      const seam = y === 0 || y === 7 || y === 14 || y === h || x === x0 || x === x1;
      c = seam ? 0x5a6a4e : 0x7a8a6a;
      if ((y === 4 || y === 11 || y === 18) && x >= 80 && x <= 83) c = BRASS;
      if ((y === 5 || y === 12 || y === 19) && x >= 81 && x <= 82) c = 0xf6f2e6;
    }
    R.set(x, y, z, c);
  }
  // a fern on top
  for (let y = h + 1; y <= h + 3; y++) for (let x = 80; x <= 83; x++) for (let z = -30; z <= -27; z++) R.set(x, y, z, y === h + 3 ? 0x6a4026 : 0xc86a3a);
  const leaf = [[81, -28, 0], [80, -29, 1], [83, -28, 1], [82, -30, 2], [79, -28, 2], [84, -29, 3], [81, -27, 3], [82, -28, 4]];
  for (const [x, z, k] of leaf) for (let y = 0; y < 3 + (k % 2); y++) R.set(x + (y > 1 ? (x < 82 ? -1 : 1) : 0), h + 4 + k + y - 2, z, y % 2 ? 0x5aa83c : 0x4a983a);
}

function buildOfficeRug(R) {
  // dark green rectangular rug with a gold border under the chair
  for (let x = 50; x <= 77; x++) for (let z = -20; z <= 2; z++) {
    const border = x === 50 || x === 77 || z === -20 || z === 2;
    const inner = x === 52 || x === 75 || z === -18 || z === 0;
    R.set(x, 0, z, border ? 0x2a4a2a : inner ? 0xd8a83a : (x + z) % 5 === 0 ? 0x3a6a3a : 0x34603a);
  }
}

function buildBin(R) {
  // wicker waste bin, overflowing with crumpled drafts
  const cx = 78.5, cz = -14;
  for (let x = 76; x <= 81; x++) for (let z = -17; z <= -11; z++) for (let y = 0; y <= 6; y++) {
    const d = Math.hypot(x + 0.5 - cx - 0.5, z + 0.5 - cz);
    if (d > 3 || (d < 2.1 && y > 0)) continue;
    R.set(x, y, z, (x + y + z) % 2 ? 0xc89a58 : 0xa87a40);
  }
  for (const [x, y, z] of [[78, 6, -15], [79, 7, -14], [77, 6, -13], [80, 6, -13], [82, 0, -10], [75, 0, -9]]) R.set(x, y, z, 0xf6f2e6);
}

// ------------------------------------------------------------------ moving meshes
function chairModel() {
  // origin: seat centre on the floor (voxel 0,0,0 = world origin of the group); front = +z
  const v = new VoxelModel();
  // star base with casters + chrome post
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    for (let r = 0; r <= 5; r++) v.set(Math.round(Math.cos(a) * r), 1, Math.round(Math.sin(a) * r), r === 5 ? CHROME_D : CHROME);
    v.set(Math.round(Math.cos(a) * 5), 0, Math.round(Math.sin(a) * 5), BLACK);
  }
  for (let y = 2; y <= 7; y++) { v.set(0, y, 0, y > 6 ? CHROME_D : CHROME); v.set(-1, y, 0, CHROME_D); }
  // seat cushion (top face at y = 10 voxels = 0.5)
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 4; z++) for (let y = 8; y <= 9; y++) {
    if ((x === -5 || x === 5) && (z === -5 || z === 4)) continue;
    const edge = x === -5 || x === 5 || z === 4;
    v.set(x, y, z, y === 8 ? LEATHER_D : edge ? LEATHER_D : (x + z) % 4 === 0 ? LEATHER_L : LEATHER);
  }
  // tall tufted back with wings, gold studs along the edge
  for (let x = -5; x <= 5; x++) for (let y = 10; y <= 22; y++) {
    const u = x / 5.5;
    const top = 19 + Math.round((1 - u * u) * 2.5);
    if (y > top) continue;
    const wing = (x <= -4 || x >= 4) && y > 15;
    const edge = y === top || x === -5 || x === 5;
    for (let z = -7; z <= -6; z++) {
      let c = z === -7 ? LEATHER_D : edge ? LEATHER_D : LEATHER;
      if (z === -6 && !edge && (y % 4 === 0) && ((x + (y >> 2)) % 3 === 0)) c = 0x7a1218; // tufting buttons
      if (z === -6 && edge && (x + y) % 2 === 0) c = STUD;
      v.set(x, y, z, c);
    }
    if (wing) v.set(x, y, -5, edge ? STUD : LEATHER);
  }
  return v;
}

function pcModel() {
  // origin: bottom centre of the case on the desk top; screen faces +z. Fine voxels.
  const v = new VoxelModel();
  const shade = (x, y, z, base) => (y === 0 ? BEIGE_DD : z < -6 ? BEIGE_D : (x + y + z) % 11 === 0 ? BEIGE_D : base);
  // pizza-box case: 20 x 5 x 16
  for (let x = -10; x <= 9; x++) for (let y = 0; y <= 4; y++) for (let z = -8; z <= 7; z++) {
    let c = shade(x, y, z, y === 4 ? BEIGE_L : BEIGE);
    if (z === 7) {
      c = y === 4 ? BEIGE_L : BEIGE;
      if (y === 2 && x >= 2 && x <= 7) c = 0x2a2620; // 3.5" slot
      if (y === 2 && x >= -8 && x <= -2) c = 0x3a342c; // 5.25" slot
      if (y === 1 && x >= -8 && x <= -2) c = BEIGE_D;
      if (y === 1 && (x === 8)) c = 0xd83a32; // power switch
    }
    v.set(x, y, z, c);
  }
  // CRT: bezel 16 x 15 at the front, tube tapering back
  for (let z = -7; z <= 7; z++) {
    const back = z < 1;
    const ix = back ? Math.max(4, 8 - Math.round((1 - z) * 0.5)) : 8, iy0 = back ? 6 + Math.round((1 - z) * 0.25) : 5, iy1 = back ? 19 - Math.round((1 - z) * 0.35) : 19;
    for (let x = -ix; x <= ix - 1; x++) for (let y = iy0; y <= iy1; y++) {
      const front = z >= 6;
      let c = front ? ((y === 19 || x === -ix) ? BEIGE_L : BEIGE) : shade(x, y, z, BEIGE);
      if (!front && z < -2 && (y % 3 === 0) && Math.abs(x) < 3) c = BEIGE_DD; // vent slots on the back
      v.set(x, y, z, c);
    }
  }
  // screen recess (the glowing plane sits in it) + inner dark rim
  for (let x = -6; x <= 5; x++) for (let y = 8; y <= 17; y++) {
    v.set(x, y, 7, null);
    const rim = x === -6 || x === 5 || y === 8 || y === 17;
    v.set(x, y, 6, rim ? 0x34343c : 0x1a2a22);
  }
  // badge, power LED, sticky notes
  for (let x = -2; x <= 1; x++) v.set(x, 6, 7, 0xd8a83a);
  v.set(5, 6, 7, 0x2a2620);
  v.set(6, 19, 7, 0xffe46a); v.set(7, 19, 7, 0xffe46a); v.set(7, 18, 7, 0xffe46a); v.set(7, 17, 6, 0xffe46a);
  v.set(-8, 16, 6, 0xffa0c0); v.set(-8, 15, 6, 0xffa0c0); v.set(-9, 16, 6, 0xffa0c0);
  return v;
}

function deskJunkModel() {
  // clutter on the desk top, fine voxels in a frame whose origin is the desk-top point (x = seatX, z = desk front edge)
  const v = new VoxelModel();
  const sx = Math.round(OFFICE.seatX / FV), fz = Math.round(OFFICE.deskZ1 / FV); // 125, -40
  const at = (x, z) => [Math.round(x / FV) - sx, Math.round(z / FV) - fz];
  // keyboard: 16 x 6, keys in rows, a little slope
  {
    const kz = OFFICE.seatZ - FOX_KEYBOARD_Z;
    const [cx, cz] = at(OFFICE.seatX, kz);
    for (let x = -8; x <= 7; x++) for (let z = -3; z <= 2; z++) {
      v.set(cx + x, 0, cz + z, z === -3 ? BEIGE_D : BEIGE);
      if (z > -3 && z < 2 && x > -8 && x < 7 && (x + z) % 2 === 0) v.set(cx + x, 1, cz + z, z === 1 && x > -3 && x < 3 ? KEY_L : KEY);
      if (z === -3) v.set(cx + x, 1, cz + z, BEIGE_D);
    }
    // the mouse and its cord
    const [mx, mz] = at(OFFICE.seatX + 0.32, kz);
    for (let x = 0; x <= 2; x++) for (let z = -1; z <= 2; z++) v.set(mx + x, 0, mz + z, z === -1 ? BEIGE_D : BEIGE);
    v.set(mx + 1, 1, mz, BEIGE_L); v.set(mx + 1, 1, mz + 1, BEIGE);
    for (let z = -2; z >= -9; z--) v.set(mx + 1 + Math.round(Math.sin(z * 0.8)), 0, mz + z, 0x5a564c);
  }
  // "#1 BOSS" mug (red with a gold 1)
  {
    const [cx, cz] = at(3.68, -1.1);
    for (let y = 0; y <= 4; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
      const corner = (x === -2 || x === 1) && (z === -2 || z === 1);
      if (corner) continue;
      const inside = y > 0 && x > -2 && x < 1 && z > -2 && z < 1;
      if (inside) { if (y === 3) v.set(cx + x, y, cz + z, 0x4a2a14); continue; }
      v.set(cx + x, y, cz + z, y === 4 ? 0xf06a5a : 0xd83a32);
    }
    v.set(cx, 2, cz + 2, STUD); v.set(cx, 3, cz + 2, STUD); v.set(cx, 1, cz + 2, STUD);
    v.set(cx + 2, 1, cz, 0xd83a32); v.set(cx + 2, 3, cz, 0xd83a32); v.set(cx + 3, 2, cz, 0xd83a32);
  }
  // stack of ledgers / papers
  {
    const [cx, cz] = at(3.25, -1.47);
    for (let y = 0; y <= 3; y++) for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) v.set(cx + x + (y === 2 ? 1 : 0), y, cz + z, y === 1 ? 0x3a5aa8 : y === 3 ? 0xd8463e : 0xf6f2e6);
  }
  // pencil cup with pencils
  {
    const [cx, cz] = at(2.64, -1.08);
    for (let y = 0; y <= 3; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (y === 0 || x !== 0 || z !== 0) v.set(cx + x, y, cz + z, 0x3a6aa8);
    v.set(cx, 4, cz, 0xffd23f); v.set(cx, 5, cz, 0xffd23f); v.set(cx, 6, cz, 0xf0a0a0);
    v.set(cx + 1, 4, cz, 0x5aa84a); v.set(cx + 1, 5, cz - 1, 0x5aa84a);
  }
  // piggy bank (moved here from the nightstand) + a coin stack
  {
    const [px, pz] = at(3.6, -1.3);
    const py = 0;
    for (let x = -4; x <= 4; x++) for (let y = 0; y <= 6; y++) for (let z = -3; z <= 3; z++) {
      const d = (x * x) / 20 + ((y - 3.2) ** 2) / 12 + (z * z) / 11;
      if (d > 1) continue;
      v.set(px + x, py + y + 1, pz + z, y >= 5 && x < 0 ? 0xffc8d8 : y < 2 ? 0xd87898 : 0xf4a0b8);
    }
    v.set(px - 5, py + 4, pz, 0xe888a8); v.set(px - 5, py + 5, pz, 0xe888a8); v.set(px - 6, py + 4, pz, 0xc86888);
    v.set(px - 4, py + 6, pz - 2, 0x2a1a20); v.set(px - 4, py + 6, pz + 2, 0x2a1a20);
    for (const [x, z] of [[-3, -2], [-3, 2], [3, -2], [3, 2]]) v.set(px + x, py, pz + z, 0xc86888);
    for (let z = -1; z <= 1; z++) v.set(px + 1, py + 8, pz + z, 0x5a2a3a);
    const [qx, qz] = at(3.4, -1.3);
    for (let y = 0; y <= 2; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (Math.abs(x) + Math.abs(z) < 2) v.set(qx + x, y, qz + z, y === 2 && x === 0 && z === 0 ? 0xfff6c4 : y % 2 ? 0xf0b030 : 0xffd23f);
  }
  return v;
}

function lampModel() {
  // banker's lamp: brass base + stem, green glass shade (fine voxels, origin bottom centre)
  const v = new VoxelModel(), glass = new VoxelModel();
  for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) { v.set(x, 0, z, BRASS_D); if (Math.abs(x) < 3) v.set(x, 1, z, BRASS); }
  for (let y = 2; y <= 9; y++) v.set(0, y, 0, y % 3 ? BRASS : BRASS_L);
  v.set(0, 2, 1, BRASS_D); v.set(0, 3, 2, BRASS_D); // pull chain
  for (let x = -5; x <= 5; x++) for (let z = -2; z <= 2; z++) for (let y = 10; y <= 12; y++) {
    const r = Math.hypot(z, (y - 10) * 1.6);
    if (r > 2.6 || (r < 1.6 && y < 12)) continue;
    glass.set(x, y, z, y === 12 ? 0x3ab866 : x === -5 || x === 5 ? 0x1a6a3a : 0x2a8a4a);
  }
  return { v, glass };
}

// [v26 evening] tall walnut wardrobe: carcass (open front, rail + clothes inside) + two hinged doors.
// Group-local voxels: x 0..12, y 0..32, z 0..8 (front at z 8); doors hinge at x 0 / x 13.
const WD_H = 32;
function wardrobeModels() {
  const body = new VoxelModel(), doorL = new VoxelModel(), doorR = new VoxelModel();
  const grain = (x, y, z) => { const h = hash3(x, y, z); return h < 0.14 ? WAL_D : h > 0.88 ? WAL_L : WAL; };
  for (let x = 0; x <= 12; x++) for (let y = 0; y <= WD_H; y++) for (let z = 0; z <= 8; z++) {
    const side = x === 0 || x === 12, back = z === 0, top = y >= WD_H - 1, base = y <= 1;
    if (!(side || back || top || base)) continue;
    let c = back ? 0x3a2214 : grain(x >> 1, y >> 2, z);
    if (base && z === 8) c = WAL_D;
    if (top && z >= 7) c = y === WD_H ? WAL_L : WAL_D;
    body.set(x, y, z, c);
  }
  // crown moulding + a carved coin up top
  for (let x = -1; x <= 13; x++) for (let z = 0; z <= 9; z++) body.set(x, WD_H + 1, z, z === 9 || x === -1 || x === 13 ? WAL_L : WAL_D);
  for (let x = 4; x <= 8; x++) for (let y = WD_H + 2; y <= WD_H + 4; y++) if (Math.hypot(x - 6, y - (WD_H + 3)) < 2.4) body.set(x, y, 5, (x + y) % 3 ? BRASS : BRASS_D);
  // brass rail + hanging clothes (only seen with the doors open)
  for (let x = 1; x <= 11; x++) body.set(x, WD_H - 4, 4, BRASS);
  const clothes = [[1, 3, 0x6c3b90], [4, 6, 0xc8282a], [7, 8, 0xf8f6f2], [9, 11, 0x1e2c5a]];
  for (const [a, b, c] of clothes) for (let x = a; x <= b; x++) for (let y = 12; y <= WD_H - 5; y++) for (let z = 2; z <= 5; z++) {
    if (y < 16 && (x === a || x === b)) continue;
    body.set(x, y, z, (x + y) % 5 === 0 ? 0x2a1a20 : c);
  }
  // doors: a raised panel, brass knob at the meeting edge
  const door = (v, x0, x1, knobX) => {
    for (let x = x0; x <= x1; x++) for (let y = 2; y <= WD_H - 2; y++) {
      const fr = x === x0 || x === x1 || y === 2 || y === WD_H - 2 || y === 17;
      v.set(x, y, 0, fr ? WAL_D : grain(x, y >> 2, 3));
      if (!fr && (x === x0 + 1 || x === x1 - 1 || y === 3 || y === WD_H - 3 || y === 16 || y === 18)) v.set(x, y, 1, WAL_L);
    }
    v.set(knobX, 17, 1, BRASS); v.set(knobX, 17, 2, BRASS_L); v.set(knobX, 16, 1, BRASS_D);
  };
  door(doorL, 0, 5, 5);
  door(doorR, -6, -1, -6);
  return { body, doorL, doorR };
}

function alarmModels() {
  // classic twin-bell alarm clock, fine voxels, origin bottom centre, dial faces +z
  const body = new VoxelModel(), bells = new VoxelModel();
  const cy = 5;
  for (let x = -4; x <= 4; x++) for (let y = 1; y <= 9; y++) for (let z = -1; z <= 1; z++) {
    const d = Math.hypot(x, y - cy);
    if (d > 4.2) continue;
    const rim = d > 3.3;
    let c = rim ? (x + y < cy - 2 ? 0xf07060 : z === -1 ? 0xa8302a : 0xd8463e) : z === 1 ? 0xfff6e0 : 0xd8463e;
    if (z === 1 && !rim) {
      // hands at 7:00 sharp, a red second hand, hour pips
      if ((x === 0 && y >= cy && y <= cy + 3) || (y === cy && x >= -2 && x <= 0) || (x === -1 && y === cy - 1)) c = 0x2a1a14;
      if (d > 2.6 && (Math.abs(x) === 0 || y === cy)) c = 0x6a5a50;
      if (x === 1 && y === cy - 1) c = 0xd83a32;
    }
    body.set(x, y, z, c);
  }
  body.set(0, cy, 2, 0xffd23f); // centre cap (domed glass)
  for (const sx of [-3, 3]) { body.set(sx, 0, 0, BRASS_D); body.set(sx, 0, 1, BRASS); body.set(sx + Math.sign(sx), 0, 0, BRASS_D); } // feet
  for (let y = 9; y <= 11; y++) body.set(0, y, 0, BRASS_D); // hammer post
  body.set(0, 12, 0, BRASS); body.set(-1, 12, 0, BRASS); body.set(1, 12, 0, BRASS);
  body.set(0, cy, -2, BRASS); body.set(0, cy + 1, -3, BRASS); body.set(0, cy - 1, -3, BRASS); // winding key
  for (const sx of [-1, 1]) {
    const bx = sx * 3;
    for (let x = -2; x <= 2; x++) for (let y = 0; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      if (Math.hypot(x, y * 1.2, z) > 2.5) continue;
      bells.set(bx + x, 10 + y, z, y === 2 || x * sx < 0 ? 0xfff0a0 : y === 0 ? BRASS_D : 0xffd23f);
    }
    bells.set(bx, 13, 0, BRASS_D);
  }
  return { body, bells };
}

/** The morning mug: big, blue with a white band and a gold coin, coffee inside, origin at its
 * base; handle on +x. Hold it like the energy-drink can: `mug.position.set(0, -0.1, 0.01); fox.hold(mug)`. */
export function makeMug() {
  const v = new VoxelModel();
  const BLUE = 0x3a6ad8, BLUE_D = 0x2a4aa8, BLUE_L = 0x6a9af0;
  for (let y = 0; y <= 6; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    if ((x === -2 || x === 2) && (z === -2 || z === 2)) continue;
    const inside = y > 0 && x > -2 && x < 2 && z > -2 && z < 2;
    if (inside) { if (y === 5) v.set(x, y, z, x === -1 && z === -1 ? 0x7a4a24 : 0x4a2a14); continue; }
    let c = y === 0 ? BLUE_D : y === 6 ? BLUE_L : (y === 2 || y === 3) ? 0xf6f2e6 : BLUE;
    if (z === 2 && x === 0 && (y === 2 || y === 3)) c = 0xffd23f;
    if (x === -2 && y > 0 && y < 6) c = c === BLUE ? BLUE_L : c;
    v.set(x, y, z, c);
  }
  for (const [x, y] of [[3, 1], [3, 5], [4, 2], [4, 3], [4, 4]]) v.set(x, y, 0, BLUE);
  const mesh = new THREE.Mesh(v.build({ scale: FV * 1.25, pivot: [0, 0, 0] }), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.dispose = () => { mesh.geometry.dispose(); mesh.material.dispose(); };
  return g;
}

// ------------------------------------------------------------------ the CRT screen (tiny canvas in 3D)
function makeScreen() {
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 40;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const S = { mode: 'off', t: 0, k: 0 };
  const bars = [9, 14, 6, 18, 11, 22, 15];
  function draw() {
    const t = S.t;
    g.clearRect(0, 0, 48, 40);
    if (S.mode === 'off') {
      g.fillStyle = '#0e1a16'; g.fillRect(0, 0, 48, 40);
      g.fillStyle = '#1e3028'; g.fillRect(6, 4, 10, 2); g.fillRect(4, 6, 4, 6); // glass reflection
      return;
    }
    if (S.mode === 'boot') {
      const k = Math.min(1, t / 0.5);
      g.fillStyle = '#05060c'; g.fillRect(0, 0, 48, 40);
      g.fillStyle = '#ffffff';
      const h = Math.max(1, Math.round(40 * k * k));
      g.fillRect(0, 20 - (h >> 1), 48, h);
      if (k >= 1) { g.fillStyle = '#c8c8c8'; for (let i = 0; i < Math.min(5, Math.floor((t - 0.5) * 10)); i++) g.fillRect(3, 4 + i * 4, 10 + ((i * 7) % 20), 2); }
      return;
    }
    const red = S.mode === 'alert' && Math.floor(t * 6) % 2 === 0;
    g.fillStyle = red ? '#7a1018' : '#14207a'; g.fillRect(0, 0, 48, 40);
    g.fillStyle = red ? '#ff5a5a' : '#55ffff'; g.fillRect(0, 0, 48, 4);
    g.fillStyle = '#ffffff'; g.fillRect(2, 1, 10, 2);
    for (let i = 0; i < bars.length; i++) {
      const h = Math.round(bars[i] * (0.8 + 0.2 * Math.sin(t * 2 + i)));
      g.fillStyle = i % 3 === 2 ? '#ff5555' : '#55ff55';
      g.fillRect(4 + i * 6, 36 - h, 4, h);
    }
    g.fillStyle = '#ffff55';
    for (let x = 0; x < 44; x++) g.fillRect(2 + x, Math.round(14 + Math.sin(x * 0.35 + t) * 3 - x * 0.12), 1, 1);
    if (Math.floor(t * 2) % 2) { g.fillStyle = '#ffffff'; g.fillRect(40, 34, 4, 2); }
  }
  draw();
  return {
    tex,
    get mode() { return S.mode; },
    setMode(m) { if (m !== S.mode) { S.mode = m; S.t = 0; draw(); tex.needsUpdate = true; } },
    update(dt) {
      if (S.mode === 'off') return;
      S.t += dt;
      S.k -= dt;
      if (S.k <= 0) { S.k = 1 / 12; draw(); tex.needsUpdate = true; }
    },
  };
}

// ------------------------------------------------------------------ build
export function buildOffice({ R, F, group, litMat, litFine, glowMat, track }) {
  const desk = buildDesk(R, F);
  buildWallDecor(R, F);
  buildCabinet(R);
  buildOfficeRug(R);
  buildBin(R);
  const mk = (geo, mat, name, cast = true) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.castShadow = cast; m.receiveShadow = true; m.name = name;
    return m;
  };

  // the swivel chair (its own group: origin = seat centre)
  const chair = new THREE.Group();
  chair.name = 'officeChair';
  chair.add(mk(chairModel().build({ scale: V, pivot: [0.5, 0, 0.5] }), litMat, 'chair'));
  chair.position.set(OFFICE.seatX, 0, OFFICE.seatZ);
  chair.rotation.y = Math.PI;
  group.add(chair);

  // the PC: case + CRT; the screen is a glowing canvas plane in the recess
  const pc = new THREE.Group();
  pc.name = 'pc';
  pc.add(mk(pcModel().build({ scale: FV, pivot: [0.5, 0, 0.5] }), litFine, 'pcBody'));
  const screen = makeScreen();
  const screenMat = track(new THREE.MeshBasicMaterial({ map: track(screen.tex) }));
  const screenMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(12 * FV, 10 * FV)), screenMat);
  screenMesh.position.set(-0.5 * FV, 13 * FV, 7.05 * FV);
  pc.add(screenMesh);
  pc.position.set(OFFICE.pcX, OFFICE.top, OFFICE.pcZ);
  group.add(pc);
  const pcRest = pc.position.clone();
  // green-blue phosphor glow on whoever sits there
  const glow = new THREE.PointLight(0x7ab8ff, 0, 1.6, 1.6);
  glow.position.set(OFFICE.pcX + 0.05, OFFICE.top + 0.38, OFFICE.pcZ + 0.45);
  group.add(glow);

  // desk clutter (hops when the desk is slammed)
  const junk = new THREE.Group();
  junk.name = 'deskJunk';
  junk.add(mk(deskJunkModel().build({ scale: FV, pivot: [0, 0, 0] }), litFine, 'junk'));
  junk.position.set(Math.round(OFFICE.seatX / FV) * FV, OFFICE.top, Math.round(OFFICE.deskZ1 / FV) * FV);
  group.add(junk);
  const junkRest = junk.position.clone();

  // banker's lamp (glass shade glows) + its warm light
  const lampM = lampModel();
  const lamp = new THREE.Group();
  lamp.add(mk(lampM.v.build({ scale: FV, pivot: [0.5, 0, 0.5] }), litFine, 'lamp'));
  const glassMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff }));
  lamp.add(mk(lampM.glass.build({ scale: FV, pivot: [0.5, 0, 0.5], ao: false }), glassMat, 'lampGlass', false));
  lamp.position.set(3.62, OFFICE.top, -1.52);
  lamp.rotation.y = 0.35;
  group.add(lamp);
  const lampLight = new THREE.PointLight(0xffd8a0, 1.6, 1.8, 1.5);
  lampLight.position.set(3.5, OFFICE.top + 0.24, -1.32);
  group.add(lampLight);

  // twin-bell alarm clock on the nightstand (where the piggy bank used to sit)
  const am = alarmModels();
  const alarm = new THREE.Group();
  alarm.name = 'alarmClock';
  const alarmBody = mk(am.body.build({ scale: FV, pivot: [0.5, 0, 0.5] }), litFine, 'alarmBody');
  const alarmBells = mk(am.bells.build({ scale: FV, pivot: [0.5, 0, 0.5] }), litFine, 'alarmBells');
  alarm.add(alarmBody, alarmBells);
  alarm.position.set(1.4, 0.55, -1.3);
  alarm.rotation.y = -0.3;
  alarm.scale.setScalar(1.3);
  group.add(alarm);
  const alarmRest = { p: alarm.position.clone(), r: alarm.rotation.y };

  // [v26 evening] the wardrobe (between the nightstand and the desk), doors swing open with a creak
  const wm = wardrobeModels();
  const wardrobe = new THREE.Group();
  wardrobe.name = 'wardrobe';
  wardrobe.add(mk(wm.body.build({ scale: V, pivot: [0, 0, 0] }), litMat, 'wardrobeBody'));
  const doorL = mk(wm.doorL.build({ scale: V, pivot: [0, 0, 0] }), litMat, 'wardrobeDoorL');
  const doorR = mk(wm.doorR.build({ scale: V, pivot: [0, 0, 0] }), litMat, 'wardrobeDoorR');
  doorL.position.set(0, 0, 9 * V); doorR.position.set(13 * V, 0, 9 * V);
  wardrobe.add(doorL, doorR);
  wardrobe.position.set(1.8, 0, -1.6);
  group.add(wardrobe);
  const wdSt = { k: 0, goal: 0 };

  // ---- animation state
  const st = { ringing: false, ringT: 0, jolt: 0, pcJolt: 0, lampOn: 1, lampGoal: 1, glow: 0, glowGoal: 0 };
  const api = {
    desk, chair, pc, junk, alarm, lamp, lampLight, glow, screen, screenMesh,
    seat: { position: new THREE.Vector3(OFFICE.seatX, 0, OFFICE.seatZ), rotationY: Math.PI },
    /** set the desk lamp (eased) */
    wardrobe, wardrobeSpot: new THREE.Vector3(2.13, 0, -0.78),
    /** open / close the wardrobe doors (eased, with a little overshoot) */
    openWardrobe(on) { wdSt.goal = on ? 1 : 0; },
    setDeskLamp(on, instant = false) { st.lampGoal = on ? 1 : 0; if (instant) st.lampOn = st.lampGoal; },
    /** the CRT: 'off' | 'boot' | 'on' | 'alert' */
    setPC(mode) { screen.setMode(mode); st.glowGoal = mode === 'off' ? 0 : mode === 'boot' ? 1.4 : 1; },
    /** the clutter hops (and the CRT jumps) */
    joltDesk(k = 1) { st.jolt = Math.max(st.jolt, k); st.pcJolt = Math.max(st.pcJolt, k); },
    ringAlarm(on) { st.ringing = !!on; st.ringT = 0; if (!on) { alarm.position.copy(alarmRest.p); alarm.rotation.set(0, alarmRest.r, 0); alarmBells.position.set(0, 0, 0); } },
    get ringing() { return st.ringing; },
    update(dt, t) {
      screen.update(dt);
      if (Math.abs(wdSt.goal - wdSt.k) > 1e-3) {
        wdSt.k += Math.sign(wdSt.goal - wdSt.k) * Math.min(Math.abs(wdSt.goal - wdSt.k), dt / 0.45);
        const e = wdSt.k < 1 ? 1 - (1 - wdSt.k) ** 3 : 1;
        doorL.rotation.y = -1.95 * e; doorR.rotation.y = 1.95 * e;
      }
      st.lampOn += (st.lampGoal - st.lampOn) * Math.min(1, dt * 10);
      lampLight.intensity = 1.6 * st.lampOn;
      glassMat.color.setScalar(0.45 + 0.55 * st.lampOn);
      st.glow += (st.glowGoal - st.glow) * Math.min(1, dt * 6);
      glow.intensity = st.glow * (screen.mode === 'alert' && Math.floor(t * 6) % 2 === 0 ? 1.6 : 1) * (0.95 + Math.sin(t * 50) * 0.05);
      glow.color.setHex(screen.mode === 'alert' ? 0xff6a6a : 0x7ab8ff);
      // desk slam: clutter hops with a little spin, settles with a bounce
      if (st.jolt > 0.001) {
        st.jolt = Math.max(0, st.jolt - dt * 2.2);
        const k = st.jolt, h = Math.abs(Math.sin(k * 14)) * k * 0.05;
        junk.position.set(junkRest.x + Math.sin(t * 61) * 0.004 * k, junkRest.y + h, junkRest.z);
        junk.rotation.z = Math.sin(t * 47) * 0.02 * k;
      } else if (junk.position.y !== junkRest.y) { junk.position.copy(junkRest); junk.rotation.set(0, 0, 0); }
      if (st.pcJolt > 0.001) {
        st.pcJolt = Math.max(0, st.pcJolt - dt * 2.6);
        const k = st.pcJolt;
        pc.position.set(pcRest.x, pcRest.y + Math.abs(Math.sin(k * 11)) * k * 0.035, pcRest.z);
        pc.rotation.z = Math.sin(t * 39) * 0.03 * k;
      } else if (pc.position.y !== pcRest.y) { pc.position.copy(pcRest); pc.rotation.set(0, 0, 0); }
      // the alarm: hops and skitters, bells blur
      if (st.ringing) {
        st.ringT += dt;
        const f = Math.floor(st.ringT * 30);
        alarm.position.set(alarmRest.p.x + Math.sin(st.ringT * 9) * 0.012, alarmRest.p.y + (f % 2) * 0.012, alarmRest.p.z + Math.cos(st.ringT * 7) * 0.006);
        alarm.rotation.set(0, alarmRest.r + Math.sin(st.ringT * 11) * 0.12, (f % 2 ? 1 : -1) * 0.12);
        alarmBells.position.set((f % 2 ? 1 : -1) * 0.006, 0, 0);
      }
    },
  };
  return api;
}
