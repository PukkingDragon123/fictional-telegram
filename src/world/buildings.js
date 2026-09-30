// Landmark buildings: the Bear St. office tower on the mountain and
// Reynard the fox's log cabin (with a lab) by the pond.
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
// Voxel scale 0.1, footprint 3x3 tiles (30x30 voxels), origin at tile corner.
export function hutModel() {
  const body = new VoxelModel();
  const glow = new VoxelModel();
  const rnd = mulberry32(7);
  const logs = [0x8f5b2e, 0x7d4e27, 0x9a6634];
  const x0 = 2, x1 = 27, z0 = 3, z1 = 20, wallH = 14;
  // stone foundation
  body.box(x0 - 1, 0, z0 - 1, x1 + 1, 1, z1 + 1, () => (rnd() < 0.5 ? 0x8a847c : 0x77726b));
  // log walls
  for (let y = 2; y < 2 + wallH; y++) {
    const band = Math.floor((y - 2) / 2);
    const col = logs[band % 3];
    for (let x = x0; x <= x1; x++) { body.set(x, y, z0, col); body.set(x, y, z1, col); }
    for (let z = z0; z <= z1; z++) { body.set(x0, y, z, col); body.set(x1, y, z, col); }
    if ((y - 2) % 2 === 0) {
      // protruding log ends at corners
      for (const [cx, cz] of [[x0 - 1, z0], [x1 + 1, z0], [x0 - 1, z1], [x1 + 1, z1], [x0, z0 - 1], [x1, z0 - 1], [x0, z1 + 1], [x1, z1 + 1]])
        body.set(cx, y, cz, 0xc49060);
    }
  }
  // gable roof along x, ridge at z=mid
  const mid = (z0 + z1) / 2;
  const roofY0 = 2 + wallH;
  const shingles = [0x8c2f2a, 0x9e3a32, 0x7a2824];
  for (let s = 0; s <= 12; s++) {
    const y = roofY0 + s;
    const za = Math.round(z0 - 2 + s * 0.8), zb = Math.round(z1 + 2 - s * 0.8);
    if (za > zb) break;
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      body.set(x, y, za, shingles[(x + s) % 3]);
      body.set(x, y, zb, shingles[(x + s + 1) % 3]);
      if (s > 0) {
        body.set(x, y - 1, za + 1, shingles[2]);
        body.set(x, y - 1, zb - 1, shingles[2]);
      }
    }
    // gable ends
    for (let z = za + 1; z < zb; z++) {
      body.set(x0, y, z, logs[s % 3]);
      body.set(x1, y, z, logs[s % 3]);
    }
  }
  // ridge cap
  for (let x = x0 - 2; x <= x1 + 2; x++) body.set(x, roofY0 + Math.floor((z1 - z0 + 4) / 1.6 / 2) + 1, Math.round(mid), 0x5a1e1a);
  // chimney
  body.box(x0 + 4, roofY0, z0 + 3, x0 + 7, roofY0 + 13, z0 + 6, () => (rnd() < 0.5 ? 0x8a847c : 0x6f6a64));
  // door (front = +z)
  body.box(12, 2, z1, 16, 10, z1, 0x5a381c);
  body.set(15, 6, z1 + 1, 0xe0b040); // knob
  glow.box(13, 8, z1 + 1, 15, 9, z1 + 1, 0xffd890); // door window
  // windows
  for (const wx of [5, 21]) {
    body.box(wx - 1, 5, z1, wx + 4, 10, z1, 0x3e2a18);
    glow.box(wx, 6, z1 + 0, wx + 3, 9, z1 + 0, 0xffd07a);
    body.box(wx - 1, 4, z1 + 1, wx + 4, 4, z1 + 2, 0x6a4424); // flower box
    for (let k = 0; k < 6; k++) body.set(wx - 1 + k, 5, z1 + 2, [0xd9529b, 0xf2c230, 0xffffff, 0x7d63d8][k % 4]);
  }
  // side lab window (east wall) with green glow
  glow.box(x1, 6, 8, x1, 11, 14, 0x7cff9a);
  // sign board standing on the front edge of the porch roof
  body.box(0, 14, z1 + 9, 29, 20, z1 + 9, 0x2f4a2e);
  body.box(0, 13, z1 + 9, 0, 14, z1 + 9, 0x5a3a20); body.box(29, 13, z1 + 9, 29, 14, z1 + 9, 0x5a3a20);
  voxelText(glow, 'REYNARD', 1, 19, z1 + 10, 0xffe9b0);
  // porch deck + posts
  body.box(x0, 1, z1 + 1, x1, 1, z1 + 8, (x, y, z) => ((x + z) % 4 === 0 ? 0x9a7048 : 0xb08050));
  for (const px of [x0, x1]) body.box(px, 2, z1 + 8, px, 12, z1 + 8, 0x7a5030);
  body.box(x0, 13, z1 + 1, x1, 13, z1 + 9, (x, y, z) => ((x + z) % 3 ? 0x8a3a30 : 0x7a2e28));
  // red Muskoka chair
  const cx = 22, cz = z1 + 4;
  body.box(cx, 2, cz, cx + 3, 3, cz + 3, 0xc8322a);
  body.box(cx, 4, cz + 3, cx + 3, 7, cz + 3, 0xc8322a);
  body.box(cx - 1, 4, cz, cx - 1, 4, cz + 3, 0xa82822);
  body.box(cx + 4, 4, cz, cx + 4, 4, cz + 3, 0xa82822);
  // lab contraption on roof: copper pipe + glowing flask
  body.box(x1 - 5, roofY0 + 2, z0 + 3, x1 - 4, roofY0 + 9, z0 + 4, 0xb87333);
  body.box(x1 - 7, roofY0 + 9, z0 + 3, x1 - 4, roofY0 + 9, z0 + 4, 0xb87333);
  glow.ellipsoid(x1 - 8, roofY0 + 10, z0 + 3.5, 1.6, 1.6, 1.6, 0x66ff88);
  // flag pole at porch corner
  for (let y = 1; y < 26; y++) body.set(x0 - 2, y, z1 + 9, 0xd8d8d8);
  flagModel(body, x0 - 1, 19, z1 + 9);
  return { body, glow };
}
