// [v30 classroom] The parts of Reynard's classroom that only exist since it is
// filmed from inside with a perspective camera (src/game/classroom/ClassCam.js):
// the front wall (door, windows, cork board, cubbies), a wooden-beam ceiling with
// brass pendant lamps, a big fish tank on a cabinet, and more plants.
// Voxels only; the animated bits (tank fish, bubbles, lamp glow) live in
// buildClassroom (src/entities/classroomScene.js), placed from `fx`.
import { shade } from '../core/voxel.js';
import { hash2, hash3 } from '../core/rng.js';

const WOOD = [0x8a5430, 0x9a603a, 0x7e4a2a];
const BEAM = [0x7a4626, 0x84502c, 0x6e3e20];
const CEIL = [0xf0dcb0, 0xead6a8, 0xf3e2b8];
const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];

/**
 * R: lit voxels, GL: glass, G: glow (unlit), TK: tank water.
 * C: { X0, X1, ZB, ZF, HT, wallColor } ; returns fx additions.
 */
export function buildClassExtras(R, GL, G, TK, C) {
  const { X0, X1, ZB, ZF, HT, wallColor } = C;
  const fx = {};
  const ZW = ZF - 6; // inner face of the front wall
  fx.frontZ = ZW;

  // ---------------------------------------------------------------- front wall
  for (let x = X0 - 4; x <= X1 + 4; x++) for (let y = 0; y < HT; y++) for (let z = ZW; z <= ZW + 3; z++) {
    let c = wallColor(x * 1 + 700, y, 5);
    if (z > ZW) c = shade(c, 0.8);
    R.set(x, y, z, c);
  }
  for (let x = X0; x <= X1; x++) {
    R.set(x, 0, ZW - 1, 0x6e4226); R.set(x, 1, ZW - 1, 0x6e4226); R.set(x, 2, ZW - 1, 0xa86e40);
    R.set(x, 17, ZW - 1, 0x6e4226); R.set(x, 18, ZW - 1, 0xa86e40);
  }
  // door (left): panelled wood, a glass light, brass knob, EXIT-ish sign "RECESS"
  const dx0 = -80, dx1 = -63, dy1 = 40;
  for (let x = dx0 - 2; x <= dx1 + 2; x++) for (let y = 0; y <= dy1 + 2; y++) for (let z = ZW - 1; z <= ZW + 3; z++) R.set(x, y, z, null);
  for (let x = dx0 - 2; x <= dx1 + 2; x++) for (let y = 0; y <= dy1 + 2; y++) {
    const frame = x < dx0 || x > dx1 || y > dy1;
    if (frame) { R.set(x, y, ZW - 1, (x + y) % 6 ? 0xf4ecd8 : 0xd8cdb4); R.set(x, y, ZW, 0xd8cdb4); continue; }
    const ix = x - dx0, iy = y;
    let c = pick(WOOD, hash2(Math.floor(ix / 6), 3, 9));
    const inPanel = (a, b, c0, c1) => ix >= a && ix <= b && iy >= c0 && iy <= c1;
    if (inPanel(3, 14, 26, 37)) { GL.set(x, y, ZW + 1, 1); R.set(x, y, ZW + 2, null); continue; } // glass light
    if (inPanel(3, 7, 4, 22) || inPanel(10, 14, 4, 22)) c = shade(c, (ix === 3 || ix === 10 || iy === 4) ? 0.78 : 0.92);
    if (iy === 25 || iy === 38 || ix === 0 || ix === dx1 - dx0) c = shade(c, 0.85);
    R.set(x, y, ZW + 1, c);
  }
  R.box(dx1 - 3, 18, ZW, dx1 - 2, 19, ZW, 0xf0c030); R.set(dx1 - 3, 18, ZW - 1, 0xffe27a);
  fx.doorGlass = { x0: dx0 + 3, x1: dx0 + 14, y0: 26, y1: 37, z: ZW + 2 };
  // two windows with a cork board between them
  fx.frontWindows = [];
  for (const [wx0, wx1] of [[-40, -20], [30, 50]]) {
    const y0 = 22, y1 = 46;
    for (let x = wx0; x <= wx1; x++) for (let y = y0; y <= y1; y++) for (let z = ZW; z <= ZW + 3; z++) R.set(x, y, z, null);
    for (let x = wx0 - 2; x <= wx1 + 2; x++) for (let y = y0 - 2; y <= y1 + 2; y++) {
      if (x >= wx0 && x <= wx1 && y >= y0 && y <= y1) continue;
      R.set(x, y, ZW - 1, (x + y) % 7 ? 0xf4ecd8 : 0xd8cdb4);
    }
    const mx = Math.round((wx0 + wx1) / 2), my = Math.round((y0 + y1) / 2);
    for (let x = wx0; x <= wx1; x++) for (let y = y0; y <= y1; y++) {
      if (x === mx || y === my) R.set(x, y, ZW + 2, 0xf4ecd8);
      else GL.set(x, y, ZW + 2, 1);
    }
    for (let x = wx0 - 3; x <= wx1 + 3; x++) for (let z = ZW - 3; z <= ZW; z++) { R.set(x, y0 - 2, z, 0xf4ecd8); R.set(x, y0 - 3, z, 0xd8cdb4); }
    // a curtain each side, tied back
    for (const side of [-1, 1]) {
      const cx = side < 0 ? wx0 - 4 : wx1 + 4;
      for (let y = y0 - 6; y <= y1 + 4; y++) {
        const w = y > y0 + 8 && y < y0 + 12 ? 1 : 2;
        for (let k = 0; k <= w; k++) R.set(cx + side * k * -1, y, ZW - 1 - (k % 2), (y + k) % 4 === 0 ? 0xc0443a : 0xd8584a);
      }
      R.set(cx, y0 + 10, ZW - 3, 0xf0c030);
    }
    fx.frontWindows.push({ x0: wx0, x1: wx1, y0, y1, z: ZW + 3 });
  }
  // cork board with pinned drawings of fish
  {
    const bx0 = -8, bx1 = 22, by0 = 22, by1 = 44, z = ZW - 1;
    for (let x = bx0 - 1; x <= bx1 + 1; x++) for (let y = by0 - 1; y <= by1 + 1; y++) {
      const edge = x < bx0 || x > bx1 || y < by0 || y > by1;
      R.set(x, y, z, edge ? 0x6e4226 : hash3(x, y, 3, 1) < 0.3 ? 0xb8864e : hash3(x, y, 4, 1) < 0.5 ? 0xc89458 : 0xd09e60);
    }
    const papers = [[-5, 33, 8, 9, 0xfdf6e2, 0x3a7ad8], [5, 35, 7, 7, 0xfff2b0, 0xe0503a], [14, 31, 7, 10, 0xfdf6e2, 0x3aa04a], [-4, 24, 9, 7, 0xf6d8e8, 0xe06a9a], [8, 24, 10, 8, 0xfdf6e2, 0xe0a020]];
    for (const [px, py, w, h, paper, ink] of papers) {
      for (let x = px; x < px + w; x++) for (let y = py; y < py + h; y++) R.set(x, y, z - 1, paper);
      // a scribbled fish on each
      const cx = px + Math.floor(w / 2), cy = py + Math.floor(h / 2);
      for (const [ax, ay] of [[-2, 0], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [2, 1], [2, -1], [-3, 0]]) R.set(cx + ax, cy + ay, z - 2, ink);
      R.set(px + Math.floor(w / 2), py + h - 1, z - 2, 0xe03a3a); // pin
    }
  }
  // cubbies with backpacks under the right window
  {
    const x0 = 56, x1 = 86, z0 = ZW - 8, top = 14;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= ZW - 1; z++) for (let y = 0; y <= top; y++) {
      const shelf = y === 0 || y === 7 || y === top || x === x0 || x === x1 || (x - x0) % 10 === 0 || z === ZW - 1;
      if (shelf) R.set(x, y, z, y === top ? 0xc4844a : pick(WOOD, hash2(x >> 2, y, 2)));
    }
    const bags = [[61, 1, 0xd84a3a], [71, 1, 0x3a7ad8], [81, 8, 0x5aaa4a], [61, 8, 0xe0a020]];
    for (const [bx, by, col] of bags) {
      R.box(bx, by, z0 + 1, bx + 5, by + 5, ZW - 3, (x, y) => (y === by + 5 ? shade(col, 0.8) : (x === bx + 2 && y > by + 1) ? shade(col, 1.2) : col));
      R.box(bx + 1, by + 1, z0, bx + 4, by + 3, z0, shade(col, 0.88));
    }
  }

  // ---------------------------------------------------------------- ceiling + beams
  for (let x = X0 - 4; x <= X1 + 4; x++) for (let z = ZB - 4; z <= ZW + 3; z++) {
    R.set(x, HT, z, pick(CEIL, hash2(x >> 2, z >> 2, 8)));
    R.set(x, HT + 1, z, 0x8a6a4a);
  }
  fx.beams = [];
  for (let bx = -75; bx <= 80; bx += 31) {
    for (let x = bx - 1; x <= bx + 1; x++) for (let z = ZB - 1; z <= ZW - 1; z++) for (let y = HT - 3; y <= HT - 1; y++) {
      let c = pick(BEAM, hash2(x, Math.floor(z / 9), 3));
      if (y === HT - 3) c = shade(c, 0.85);
      if (hash3(x, y, z, 6) < 0.03) c = shade(c, 0.8);
      R.set(x, y, z, c);
    }
    fx.beams.push(bx);
  }
  // a long beam across under the cross beams, at the middle
  for (let x = X0; x <= X1; x++) for (let z = -2; z <= 0; z++) for (let y = HT - 5; y <= HT - 4; y++) R.set(x, y, z, pick(BEAM, hash2(x >> 3, z, 7)));
  // pendant lamps over the desks: cord, brass cap, green enamel shade, glowing bulb
  fx.lamps = [];
  for (const [lx, lz] of [[-56, 6], [-8, 6], [40, 6]]) {
    const top = HT - 1, cy = 44;
    for (let y = cy + 5; y <= top; y++) R.set(lx, y, lz, 0x2a2018);
    R.box(lx - 1, cy + 4, lz - 1, lx + 1, cy + 4, lz + 1, 0xc8961c);
    for (let y = cy; y <= cy + 3; y++) {
      const r = 1 + (cy + 3 - y) * 0.9;
      for (let x = Math.floor(lx - r); x <= Math.ceil(lx + r); x++) for (let z = Math.floor(lz - r); z <= Math.ceil(lz + r); z++) {
        const d = Math.hypot(x - lx, z - lz);
        if (d <= r + 0.2 && d >= r - 1.1) R.set(x, y, z, y === cy ? 0xf0c030 : (x + z + y) % 5 === 0 ? 0x2e6a46 : 0x357a50);
      }
    }
    G.set(lx, cy - 1, lz, 0xfff0b0); G.set(lx, cy, lz, 0xffe08a);
    fx.lamps.push([lx, cy - 1, lz]);
  }
  // hanging ivy pots on two beams
  for (const [hx, hz] of [[-75, -40], [80, 30]]) {
    for (let y = HT - 10; y <= HT - 4; y++) R.set(hx, y, hz, 0xd8c8a0);
    R.cylinder(hx, HT - 14, hz, 2.6, 4, (x, y) => (y === HT - 11 ? 0xb85a32 : 0xd06a3a));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, len = 4 + Math.floor(hash2(i, hx, 4) * 9);
      for (let k = 0; k < len; k++) {
        const x = hx + Math.round(Math.cos(a) * (2.5 + k * 0.15)), z = hz + Math.round(Math.sin(a) * (2.5 + k * 0.15));
        R.set(x, HT - 12 - k, z, k % 3 === 0 ? 0x6ac04a : (i + k) % 2 ? 0x3a8a34 : 0x4a9a3a);
      }
    }
  }

  // ---------------------------------------------------------------- fish tank on a cabinet (right wall)
  {
    const x0 = 76, x1 = 90, z0 = -14, z1 = 26, top = 13;
    // cabinet
    R.box(x0, 0, z0, x1, top, z1, (x, y, z) => {
      if (y === top) return x === x0 ? 0xcc8a4e : 0xb8763e;
      if (y === 0) return 0x5e3519;
      if (x === x0) {
        const dz = (z - z0) % 20;
        if (dz === 0 || y === 1 || y === top - 1) return 0x8e5a30;
        if (dz === 10 && y > 4 && y < 8) return 0xf0c030; // knobs
        return (z + y) % 7 === 0 ? 0xa86c38 : 0xb8763e;
      }
      return 0x8e5a30;
    });
    // tank: glass box, water, gravel, plants, castle, lid with a light strip
    const tx0 = x0 + 2, tx1 = x1 - 1, tz0 = z0 + 1, tz1 = z1 - 1, ty0 = top + 1, ty1 = top + 18;
    for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) for (let z = tz0; z <= tz1; z++) {
      const wall = x === tx0 || x === tx1 || z === tz0 || z === tz1 || y === ty0;
      if (wall) { if (y === ty0 || x === tx0 || z === tz0 || z === tz1) GL.set(x, y, z, 1); else R.set(x, y, z, 0x2a5a6a); continue; }
      if (y === ty0 + 1) { R.set(x, y, z, pick([0xf2c230, 0xe86a8a, 0x5ab8e8, 0xf4f0e6, 0x8ad05a, 0xd8b890], hash3(x, y, z, 2))); continue; }
      if (y <= ty1 - 2) TK.set(x, y, z, y === ty1 - 2 ? 0x9ae8ff : 0x4ab0d8);
    }
    // black trim on the glass edges
    for (let x = tx0; x <= tx1; x++) for (const z of [tz0, tz1]) { R.set(x, ty1 + 1, z, 0x2a2a30); R.set(x, ty0, z, 0x2a2a30); }
    for (let z = tz0; z <= tz1; z++) { R.set(tx0, ty1 + 1, z, 0x2a2a30); R.set(tx0, ty0, z, 0x2a2a30); }
    for (let y = ty0; y <= ty1 + 1; y++) for (const z of [tz0, tz1]) R.set(tx0, y, z, 0x2a2a30);
    // lid + light strip
    R.box(tx0, ty1 + 2, tz0, tx1, ty1 + 2, tz1, 0x34343c);
    for (let z = tz0 + 2; z <= tz1 - 2; z++) G.set(tx0 + 3, ty1 + 1, z, 0xd8f4ff);
    // plants (tall wavy strands) + a little castle + a treasure chest
    const plant = (px, pz, h, col) => { for (let y = ty0 + 2; y < ty0 + 2 + h; y++) { const x = px + Math.round(Math.sin(y * 0.7 + pz) * 0.6); TK.set(x, y, pz, null); R.set(x, y, pz, (y + pz) % 3 ? col : shade(col, 1.2)); } };
    for (const [pz, h] of [[tz0 + 3, 13], [tz0 + 5, 9], [tz0 + 8, 11], [tz1 - 3, 14], [tz1 - 6, 8], [tz1 - 4, 12]]) plant(tx1 - 2 - (pz % 3), pz, h, pz % 2 ? 0x3a9a4a : 0x5aba4a);
    for (let x = tx1 - 6; x <= tx1 - 2; x++) for (let y = ty0 + 2; y <= ty0 + 8; y++) for (let z = 4; z <= 9; z++) {
      const crenel = y === ty0 + 8 && (x + z) % 2 === 0;
      const door = z >= 6 && z <= 7 && y <= ty0 + 4 && x === tx1 - 6;
      if (crenel || door) continue;
      TK.set(x, y, z, null); R.set(x, y, z, (x + y + z) % 4 === 0 ? 0x9a948a : 0xb8b0a4);
    }
    R.box(tx1 - 4, ty0 + 2, 14, tx1 - 2, ty0 + 3, 17, (x, y) => (y === ty0 + 3 ? 0xc89030 : 0x8a5430)); TK.box(tx1 - 4, ty0 + 2, 14, tx1 - 2, ty0 + 3, 17, null);
    fx.tank = { x0: tx0 + 1, x1: tx1 - 1, y0: ty0 + 2, y1: ty1 - 2, z0: tz0 + 1, z1: tz1 - 1 };
    // a fish-food tub + a little net on the cabinet top? (top is the tank) - on the wall: a tide chart
  }

  // ---------------------------------------------------------------- tall plant in the front-left corner + a reading corner
  {
    const px = -84, pz = ZW - 6;
    R.cylinder(px, 0, pz, 4, 8, (x, y) => (y === 7 ? 0x8a4a2a : y % 3 === 0 ? 0xb85a32 : 0xc8693a));
    R.box(px - 3, 7, pz - 3, px + 3, 7, pz + 3, 0x4a3020);
    for (let y = 8; y <= 30; y++) R.set(px, y, pz, 0x6a4a2a);
    for (let i = 0; i < 22; i++) {
      const y = 14 + Math.floor(hash2(i, 1, 4) * 22), a = hash2(i, 2, 4) * Math.PI * 2, r = 2 + hash2(i, 3, 4) * 4;
      const cx = px + Math.round(Math.cos(a) * r), cz = pz + Math.round(Math.sin(a) * r);
      R.ellipsoid(cx, y, cz, 2.2, 1.4, 2.2, (x, yy, z) => (hash3(x, yy, z, 9) < 0.3 ? 0x5ab048 : hash3(x, yy, z, 8) < 0.5 ? 0x3a8a34 : 0x4a9a3a));
    }
    // a beanbag and a stack of picture books
    R.ellipsoid(-66, 3, ZW - 10, 6, 3.5, 5, (x, y, z) => ((x + z) % 5 === 0 ? 0xd8a020 : y > 4 ? 0xf0c030 : 0xe0b028));
    R.box(-56, 0, ZW - 6, -50, 1, ZW - 2, 0x3a6a8a); R.box(-56, 2, ZW - 6, -51, 3, ZW - 3, 0xb83a32); R.box(-55, 4, ZW - 5, -51, 4, ZW - 3, 0xf2c230);
  }
  // potted fern on the teacher's side of the board + a fish poster frame on the left wall handled by posters
  {
    const px = 82, pz = ZB + 22;
    R.cylinder(px, 0, pz, 3, 6, (x, y) => (y === 5 ? 0x8a4a2a : 0x3a6a8a));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, len = 6 + (i % 4);
      for (let k = 0; k <= len; k++) R.set(px + Math.round(Math.cos(a) * k * 0.7), 6 + Math.round(k * 1.1 - (k * k) / (len * 1.6)), pz + Math.round(Math.sin(a) * k * 0.7), k > len - 2 ? 0x8ad05a : 0x4a9a3a);
    }
  }
  return fx;
}
