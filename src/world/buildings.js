// Landmark buildings: the Bear St. office tower on the mountain (Reynard's
// cottage by the pond: ./hut.js). Also the voxel font + flag used by both.
import { VoxelModel } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';

export const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '.': ['...', '...', '...', '...', '.#.'],
  "'": ['.#.', '.#.', '...', '...', '...'], ' ': ['...', '...', '...', '...', '...'], '-': ['...', '...', '###', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
};

// Write text on the plane z = zf, left to right along +x (or -x when mirrored).
export function voxelText(v, text, x0, yTop, zf, color, dir = 1) {
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) if (g[r][c] === '#') v.set(cx + c * dir, yTop - r, zf, color);
    cx += 4 * dir;
  }
  return Math.abs(cx - x0);
}

export function flagModel(v, x0, y0, z0, scale = 1) {
  // Canadian flag 12x6 (x along +x). Leaf drawn in the white square.
  const RED = 0xd52b1e, WHITE = 0xf6f4f0;
  const leaf = ['..#..', '#####', '.###.', '#####', '..#..', '..#..'];
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 12; x++) {
      let c = x < 3 || x > 8 ? RED : WHITE;
      if (x >= 3 && x <= 8) {
        const lx = x - 3 - 0.5, row = leaf[5 - y];
        const li = Math.round(lx);
        if (li >= 0 && li < 5 && row[li] === '#') c = RED;
      }
      v.set(x0 + x, y0 + y, z0, c);
    }
}

// ------------------------------------------------------------ office
// Built at voxel scale 0.25. Returns { body, glow } models (glow = windows).
export function officeModel() {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  const rnd = mulberry32(42);
  const W = 36, D = 16, H = 38;
  const stone = [0x8f8b85, 0x9a958e, 0x85817b];
  const lime = 0xc2bcb0, limeD = 0xa8a296, slab = 0x6d6a66;
  const x0 = -W / 2, z0 = -D / 2;
  // lobby base
  body.box(x0 - 1, 0, z0 - 1, x0 + W, 5, z0 + D, () => stone[Math.floor(rnd() * 3)]);
  // tower walls
  for (let y = 6; y < H; y++) {
    for (let x = x0; x < x0 + W; x++)
      for (let z = z0; z < z0 + D; z++) {
        const edge = x === x0 || x === x0 + W - 1 || z === z0 || z === z0 + D - 1;
        if (!edge) continue;
        const floorLine = (y - 6) % 4 === 3;
        const along = z === z0 || z === z0 + D - 1 ? x - x0 : z - z0;
        const colLine = along % 3 === 0;
        const corner = (x === x0 || x === x0 + W - 1) && (z === z0 || z === z0 + D - 1);
        if (floorLine || colLine || corner) body.set(x, y, z, floorLine ? limeD : lime);
        else glow.set(x, y, z, rnd() < 0.72 ? 0xffe2a0 : 0x6a6a70);
      }
  }
  // roof + parapet
  body.box(x0, H, z0, x0 + W - 1, H, z0 + D - 1, slab);
  for (let x = x0; x < x0 + W; x++) { body.set(x, H + 1, z0, lime); body.set(x, H + 1, z0 + D - 1, lime); }
  for (let z = z0; z < z0 + D; z++) { body.set(x0, H + 1, z, lime); body.set(x0 + W - 1, H + 1, z, lime); }
  // doors (front = +z)
  const fz = z0 + D;
  body.box(-4, 0, fz - 1, 3, 4, fz - 1, null);
  glow.box(-4, 0, fz - 1, 3, 3, fz - 1, 0xfff0c8);
  body.box(-5, 4, fz, 4, 4, fz, 0x3a3a3e); // awning
  body.box(-6, 0, fz, 5, 0, fz + 2, 0xa9a49c); // steps
  // sign over the lobby
  body.box(-17, 7, fz, 16, 13, fz, 0x2a3350);
  voxelText(glow, 'HOLDINGS', -16, 12, fz + 1, 0xfff6d8);
  // rooftop sign frame + letters
  body.box(-10, H + 2, z0 + 7, 9, H + 9, z0 + 7, 0x4a4a52);
  body.box(-10, H + 1, z0 + 6, -10, H + 9, z0 + 8, 0x3a3a40);
  body.box(9, H + 1, z0 + 6, 9, H + 9, z0 + 8, 0x3a3a40);
  voxelText(glow, 'BEAR ST.', -8, H + 8, z0 + 8, 0xff5a4a);
  // steam whistle
  body.box(12, H + 1, z0 + 3, 13, H + 6, z0 + 4, 0xb08a3a);
  body.box(11, H + 7, z0 + 2, 14, H + 7, z0 + 5, 0xd0a848);
  // flag pole
  for (let y = H + 1; y < H + 16; y++) body.set(-15, y, z0 + 3, 0xd8d8d8);
  flagModel(body, -14, H + 9, z0 + 3);
  // clock on the facade
  const cy = 27;
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++) if (dx * dx + dy * dy <= 10) body.set(dx, cy + dy, fz, dx * dx + dy * dy >= 7 ? 0x30343a : 0xf4f0e6);
  body.set(0, cy, fz + 1, 0x202020); body.set(0, cy + 1, fz + 1, 0x202020); body.set(0, cy + 2, fz + 1, 0x202020);
  body.set(1, cy, fz + 1, 0x202020); body.set(2, cy, fz + 1, 0x202020);
  return { body, glow };
}

// ------------------------------------------------------------ fox hut
// [v28 house] the cottage lives in ./hut.js now (real windows, lit rooms, porch, smoke);
// re-exported here for tools/decals-preview.js. hutModel() -> { body, glow, interior, panes }
export { hutModel } from './hut.js';
