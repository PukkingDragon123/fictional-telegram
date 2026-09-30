// Procedural voxel models for the Canadian wilderness.
import { VoxelModel, mix, shade } from '../core/voxel.js';
import { mulberry32 } from '../core/rng.js';

const TRUNK = [0x6b4a2f, 0x5e4029, 0x74513a];

// Blocky "stacked slab" conifers: clean silhouettes that greedy-mesh well.
export function pineModel({ h = 54, r = 11, seed = 1, spruce = false } = {}) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const trunkTop = Math.round(h * 0.85);
  const tw = r >= 8 ? 1 : 0;
  v.box(-tw, 0, -tw, tw, trunkTop, tw, TRUNK[0]);
  if (tw) v.box(-tw, 0, tw, tw, Math.round(h * 0.2), tw, TRUNK[1]);
  const dark = spruce ? 0x23483f : 0x2b5634;
  const midC = spruce ? 0x2d5a4c : 0x376a3c;
  const lite = spruce ? 0x3f7264 : 0x4e8248;
  const tip = spruce ? 0x5a8a78 : 0x6e9c58;
  const tiers = spruce ? 6 : 5;
  const crownBase = Math.round(h * (spruce ? 0.14 : 0.22));
  const span = h - crownBase;
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const R = Math.max(1, Math.round(r * (1 - k * 0.82)));
    const y0 = crownBase + Math.round(span * k * 0.95);
    const th = Math.max(2, Math.round(span / tiers * (spruce ? 0.95 : 0.8)));
    const ox = Math.round((rnd() - 0.5) * 1.2), oz = Math.round((rnd() - 0.5) * 1.2);
    // bottom slab (full), top slab (inset) -> bevelled tier
    v.box(-R + ox, y0, -R + oz, R + ox, y0 + th - 2, R + oz, dark);
    v.box(-R + 1 + ox, y0 + th - 1, -R + 1 + oz, R - 1 + ox, y0 + th - 1, R - 1 + oz, midC);
    // chamfer the corners
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      for (let y = y0; y < y0 + th - 1; y++) v.set(sx * R + ox, y, sz * R + oz, null);
    // light needles on the upper rim
    const lx = R - 1;
    v.box(-lx + ox, y0 + th - 1, lx + oz, lx + ox, y0 + th - 1, lx + oz, lite);
    v.box(-lx + ox, y0 + th - 1, -lx + oz, -lx + ox, y0 + th - 1, lx + oz, lite);
    for (let i = 0; i < 3; i++) v.set(Math.round((rnd() - 0.5) * 2 * lx) + ox, y0 + th - 1, Math.round((rnd() - 0.5) * 2 * lx) + oz, tip);
  }
  v.box(0, h - 1, 0, 0, h + 2, 0, lite);
  v.set(0, h + 3, 0, tip);
  return v;
}

const MAPLE_PALETTES = [
  [0xb8322a, 0xd2452e, 0x9a2420, 0xe0603a],
  [0xd9701f, 0xec8a2a, 0xbf5a18, 0xf4a640],
  [0xe2a232, 0xf1bd45, 0xc98a26, 0xd65a28],
];

// Blocky broadleaf crown: a cluster of overlapping cubes with shaded tops,
// plus leaf clumps poking out so the silhouette isn't a plain box.
function cubeCrown(v, rnd, cx, cy, cz, r, pal, count = 5) {
  const cubes = [[0, 0, 0, r, 0]];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.8;
    const rr = Math.max(1, Math.round(r * (0.45 + rnd() * 0.25)));
    cubes.push([Math.round(Math.cos(a) * r * 0.85), Math.round((rnd() - 0.35) * r * 0.9), Math.round(Math.sin(a) * r * 0.85), rr, 1 + (i % 2)]);
  }
  cubes.push([Math.round((rnd() - 0.5) * r * 0.5), Math.round(r * 0.75), Math.round((rnd() - 0.5) * r * 0.5), Math.max(1, Math.round(r * 0.5)), 1]);
  for (const [dx, dy, dz, rr, shadeI] of cubes) {
    const x = cx + dx, y = cy + dy, z = cz + dz;
    const base = shadeI === 2 ? pal[2] : pal[0];
    v.box(x - rr, y - rr + 1, z - rr, x + rr, y + rr - 1, z + rr, base);
    v.box(x - rr + 1, y + rr - 1, z - rr + 1, x + rr - 1, y + rr - 1, z + rr - 1, pal[1]);
    // notch the bottom corners
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) v.set(x + sx * rr, y - rr + 1, z + sz * rr, null);
  }
  for (let i = 0; i < 8; i++) {
    const x = cx + Math.round((rnd() - 0.5) * r * 2.2), z = cz + Math.round((rnd() - 0.5) * r * 2.2);
    v.set(x, cy - Math.round(r * 0.3) - 1, z, pal[3]);
  }
}

export function mapleModel({ h = 34, r = 11, seed = 1, variant = 0 } = {}) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const pal = MAPLE_PALETTES[variant % 3];
  const trunkTop = Math.round(h * 0.6);
  const tw = r >= 8 ? 1 : 0;
  v.box(-tw, 0, -tw, tw, trunkTop, tw, TRUNK[0]);
  v.line(0, trunkTop - Math.round(h * 0.15), 0, Math.round(r * 0.45), trunkTop + 1, Math.round(r * 0.2), TRUNK[1], 0);
  v.line(0, trunkTop - Math.round(h * 0.1), 0, -Math.round(r * 0.4), trunkTop + 2, -Math.round(r * 0.25), TRUNK[2], 0);
  cubeCrown(v, rnd, 0, Math.round(h * 0.72), 0, Math.max(2, Math.round(r * 0.55)), pal, 6);
  return v;
}

export function birchModel({ h = 38, r = 7, seed = 1 } = {}) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const trunkTop = Math.round(h * 0.78);
  for (let y = 0; y <= trunkTop; y++) {
    const mark = y % 5 === 2 || (y % 7 === 4);
    v.box(0, y, 0, r >= 5 ? 1 : 0, y, r >= 5 ? 1 : 0, mark ? 0x2c2a28 : 0xe9e5da);
  }
  const gold = [0xe0bd45, 0xf0d25a, 0xc9a133, 0x9aa83e];
  cubeCrown(v, rnd, 0, Math.round(h * 0.8), 0, Math.max(2, Math.round(r * 0.55)), gold, 4);
  return v;
}

export function boulderModel({ seed = 1, size = 1 } = {}) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const rx = (5 + rnd() * 3) * size, ry = (3 + rnd() * 2.5) * size, rz = (4 + rnd() * 3) * size;
  const pal = [0x9c918c, 0xa99e98, 0x8b817c, 0xb4a8a0];
  v.ellipsoid(0, ry * 0.55, 0, rx, ry, rz, (x, y, z, d) => {
    if (y < 0) return null;
    if (d > 0.82 && rnd() < 0.3) return null;
    if (y > ry * 0.9 && rnd() < 0.15) return 0x7a8a4a; // lichen
    return pal[Math.floor(rnd() * pal.length)];
  });
  return v;
}

export function willowModel({ seed = 3 } = {}) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const trunk = [0x5a4230, 0x4e3a2a, 0x66503a];
  for (let y = 0; y <= 22; y++) {
    const w = y < 4 ? 2 : 1;
    v.box(-w, y, -w, w, y, w, () => trunk[Math.floor(rnd() * 3)]);
  }
  v.line(0, 16, 0, 6, 24, 3, trunk[0], 0);
  v.line(0, 17, 0, -6, 25, -2, trunk[1], 0);
  v.line(0, 18, 0, 1, 26, -6, trunk[2], 0);
  const leaf = [0xa7b94a, 0xbfcf5a, 0x8ea43e, 0xd2d86a];
  v.ellipsoid(0, 27, 0, 12, 6, 12, (x, y, z, d) => (d > 0.85 && rnd() < 0.3 ? null : leaf[Math.floor(rnd() * 3)]));
  // weeping strands
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2 + rnd() * 0.1;
    const rr = 9 + rnd() * 3.5;
    const x = Math.round(Math.cos(ang) * rr), z = Math.round(Math.sin(ang) * rr);
    const len = 12 + Math.floor(rnd() * 9);
    for (let y = 26; y > 26 - len; y--) v.set(x, y, z, rnd() < 0.15 ? leaf[3] : leaf[Math.floor(rnd() * 3)]);
  }
  return v;
}

// ---- small clutter
export function tuftModel(seed = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const g = [0x6f9a3c, 0x86ad48, 0x5c8432, 0x9ab852];
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rnd() * 3) - 1, z = Math.floor(rnd() * 3) - 1;
    const hh = 1 + Math.floor(rnd() * 2);
    for (let y = 0; y < hh; y++) v.set(x, y, z, g[Math.floor(rnd() * 4)]);
  }
  return v;
}

export function flowerModel(kind, seed = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const stem = 0x5a8a36;
  if (kind === 'fireweed') {
    for (let y = 0; y < 3; y++) v.set(0, y, 0, stem);
    v.set(1, 1, 0, stem);
    for (let y = 3; y < 5; y++) v.set(0, y, 0, y === 4 ? 0xf08cc0 : 0xd9529b);
  } else if (kind === 'lupine') {
    for (let y = 0; y < 2; y++) v.set(0, y, 0, stem);
    for (let y = 2; y < 5; y++) v.set(0, y, 0, y % 2 ? 0x7d63d8 : 0x9a86ea);
  } else if (kind === 'daisy') {
    for (let y = 0; y < 2; y++) v.set(0, y, 0, stem);
    v.set(0, 2, 0, 0xf2c230);
    v.set(1, 2, 0, 0xffffff); v.set(-1, 2, 0, 0xffffff);
  } else if (kind === 'mushroom') {
    v.set(0, 0, 0, 0xeee6d8); v.set(0, 1, 0, 0xeee6d8);
    v.box(-1, 2, -1, 1, 2, 1, (x, y, z) => ((x + z) % 2 === 0 && x !== 0 ? 0xffffff : 0xc8322a));
    v.set(0, 3, 0, 0xc8322a);
  } else if (kind === 'fern') {
    const g = [0x4f8a3a, 0x5f9c44];
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2 + rnd();
      for (let s = 1; s <= 3; s++) v.set(Math.round(Math.cos(ang) * s), s <= 2 ? s : 2, Math.round(Math.sin(ang) * s), g[s % 2]);
    }
    v.set(0, 0, 0, g[0]);
  }
  return v;
}

export function cattailModel(seed = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const stalks = 4 + Math.floor(rnd() * 3);
  for (let s = 0; s < stalks; s++) {
    const x = Math.floor(rnd() * 5) - 2, z = Math.floor(rnd() * 5) - 2;
    const hh = 9 + Math.floor(rnd() * 6);
    for (let y = 0; y < hh; y++) v.set(x, y, z, y > hh - 5 && y < hh - 1 && s % 2 === 0 ? 0x6a3f22 : rnd() < 0.5 ? 0x6f9a3c : 0x5e8a34);
    if (s % 2 === 0) v.set(x, hh, z, 0x8aa84a);
  }
  // leaves
  for (let l = 0; l < 4; l++) {
    const x = Math.floor(rnd() * 5) - 2, z = Math.floor(rnd() * 5) - 2;
    for (let y = 0; y < 7; y++) v.set(x + (y > 4 ? 1 : 0), y, z, 0x7aa545);
  }
  return v;
}

export function seaweedModel(seed = 1, lush = 1) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const g = [0x3f8a3a, 0x52a046, 0x2f7034, 0x67b04e];
  const strands = 3 + Math.floor(rnd() * 3);
  for (let s = 0; s < strands; s++) {
    const bx = Math.floor(rnd() * 5) - 2, bz = Math.floor(rnd() * 5) - 2;
    const hh = Math.round((5 + rnd() * 3) * lush);
    let x = bx;
    for (let y = 0; y < hh; y++) {
      if (y % 3 === 2) x += rnd() < 0.5 ? 1 : -1;
      v.set(x, y, bz, g[(y + s) % 4]);
      if (y % 2 === 1) v.set(x + (s % 2 ? 1 : -1), y, bz, g[(y + 1) % 4]);
    }
  }
  return v;
}

export function lilypadModel(seed = 1, flower = true) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const pads = 2 + Math.floor(rnd() * 2);
  for (let p = 0; p < pads; p++) {
    const cx = Math.floor(rnd() * 6) - 3, cz = Math.floor(rnd() * 6) - 3;
    const r = 2.2 + rnd() * 1.2;
    const notch = rnd() * Math.PI * 2;
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.hypot(x, z) > r) continue;
        const a = Math.atan2(z, x);
        let da = Math.abs(a - notch);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 0.35 && Math.hypot(x, z) > 0.5) continue;
        v.set(cx + x, 0, cz + z, (x + z) % 3 === 0 ? 0x4f8f3a : 0x5fa244);
      }
    if (flower && p === 0) {
      v.set(cx, 1, cz, 0xf6d8e6);
      v.set(cx + 1, 1, cz, 0xffffff); v.set(cx - 1, 1, cz, 0xffffff); v.set(cx, 1, cz + 1, 0xffffff); v.set(cx, 1, cz - 1, 0xffffff);
      v.set(cx, 2, cz, 0xf2c230);
    }
  }
  return v;
}

export const PALETTE = { mix, shade };
