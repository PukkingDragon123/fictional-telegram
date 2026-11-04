// [v32 dive] Voxel models for THE DIVE: everything under Loon Lake (rocks, sunken logs,
// plants, the old barge, litter, the fish-farm structures, a crayfish and a painted
// turtle), Reynard's dive gear, and the lake props up top (Noodles' camp, Chief Buff's
// dock, shack and dive flag buoy, reeds).
//
// Every model is a VoxelModel built by hand-shaped rules: irregular silhouettes (noise-carved,
// never a plain ellipsoid), form shading baked per voxel (lit top-left, dark undersides),
// cracks, moss, highlights. Geometry is built once and shared (memo by key); the dive scene
// gives them its own underwater material (src/entities/diveScene.js), the lake props use the
// game's grain material.
//
//   rockModel(seed, size)          irregular boulder (size in voxels across)       VS
//   logModel(seed, len)            sunken log: bark grooves, stubs, moss, a hollow end
//   kelpModel(seed, h)             tall pondweed / "lake kelp": stalk + blades (sway attr)
//   grassModel(seed, h)            eelgrass / tape grass clump                     VS
//   coontailModel(seed)            bushy coontail whorls
//   lilyStemModel(h), lilyPadModel(seed, bloom)
//   reedModel(seed, h)             cattail reeds (shallows / lake shore)
//   bargeModel()                   the sunken barge (Deep Hole), restorable (hatchery)
//   litterModel(kind)              'can' | 'boot' | 'bottle' | 'tire'
//   whistleModel()                 Chief's lost brass whistle (fine voxels)
//   hoopModel()                    a training hoop (life ring on a weighted line)
//   farmModel(type, opts)          'pen' | 'nursery' | 'mussels' | 'feeder' | 'cage' | 'hatchery'
//   crayfishModel(part)            'body' | 'clawL' | 'clawR'
//   turtleModel(part)              'shell' | 'head' | 'flipL' | 'flipR' | 'legL' | 'legR'
//   gearModel(kind)                'mask' | 'snorkel' | 'flipper' | 'helmet' | 'tanks'
//   lake props: makeLakeCamp(), makeDiveDock(), makeDiveShack(), makeDiveBuoy(), makeReedClump(seed)
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';
import { VS, FV, buildGeo, matFor, tone, hash3 } from './critterKit.js';

const { abs, min, max, floor, sin, cos, sqrt, PI, round, hypot } = Math;
const TAU = PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** smooth 3D value noise (cheap, deterministic) */
function vnoise(x, y, z, seed = 0) {
  const xi = floor(x), yi = floor(y), zi = floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const h = (a, b, c) => hash3(a + seed * 31, b - seed * 17, c + seed * 7);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z, seed) => vnoise(x, y, z, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1, seed + 3) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3, seed + 9) * 0.1;

// ------------------------------------------------------------------ geometry memo
const MEMO = new Map();
/** Build (once) the geometry of a model; `sway` adds a 0..1 height attribute for swaying plants. */
export function diveGeo(key, build, { pivot = [0, 0, 0], scale = VS, sway = false } = {}) {
  let g = MEMO.get(key);
  if (g) return g;
  const m = build();
  g = buildGeo(m, pivot, scale);
  if (sway) {
    const pos = g.attributes.position;
    let top = 1e-6;
    for (let i = 0; i < pos.count; i++) top = max(top, pos.getY(i));
    const a = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) a[i] = clamp(pos.getY(i) / top, 0, 1);
    g.setAttribute('sway', new THREE.BufferAttribute(a, 1));
  }
  g.userData.dims = { x: (m.maxX - m.minX + 1) * scale, y: (m.maxY - m.minY + 1) * scale, z: (m.maxZ - m.minZ + 1) * scale };
  MEMO.set(key, g);
  return g;
}

// ------------------------------------------------------------------ palettes
const P = {
  rock: [0x3e4652, 0x56626e, 0x72808a, 0x909ea6, 0xb6c2c6], // deep .. lit (cool granite)
  rockW: [0x4e4238, 0x6a5a4c, 0x86725e, 0xa48c74, 0xc4ac90], // warm sandstone
  moss: [0x2e4a24, 0x3e6230, 0x527a3a, 0x6a9446],
  algae: [0x3a5a3a, 0x4e7448],
  bark: [0x3a2818, 0x523a24, 0x6a4c30, 0x84623e, 0x9e7a50],
  wood: [0x6a4c32, 0x8a6644, 0xa88058, 0xc49c70],
  ring: [0xb08a5a, 0x8a6a44],
  kelp: [0x2c4a1e, 0x3e6226, 0x547e2e, 0x6e9a36, 0x8cb446],
  kelpY: [0x5a5a1e, 0x76762a, 0x949038, 0xb0aa4a],
  grass: [0x2e5a32, 0x3e7240, 0x52904e, 0x6cae5e],
  lily: [0x2e5a2a, 0x3e7434, 0x58923e, 0x76ae4a],
  stem: [0x5a6a2e, 0x748438],
  reed: [0x6a7a34, 0x86963e, 0x9eac4e],
  cat: [0x5a3a1e, 0x6e4826],
};
const pick = (pal, t) => pal[clamp(floor(t * pal.length), 0, pal.length - 1)];

// ------------------------------------------------------------------ rocks
/**
 * A hand-shaped boulder: three overlapping noise-carved lobes on a flattened base,
 * lit from the top-left, cracks running over it, moss on the upward faces, pale
 * highlights on the lit rims. size = voxels across (VS).
 */
export function rockModel(seed = 1, size = 24, { warm = false, moss = 1 } = {}) {
  const v = new VoxelModel();
  const r = rng(seed);
  const pal = warm ? P.rockW : P.rock;
  const R = size / 2;
  const lobes = [];
  const n = 2 + floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = R * (0.15 + r() * 0.45);
    lobes.push({ x: cos(a) * d, z: sin(a) * d * 0.7, y: R * (0.05 + r() * 0.15), rx: R * (0.5 + r() * 0.4), ry: R * (0.3 + r() * 0.28), rz: R * (0.45 + r() * 0.35) });
  }
  lobes.push({ x: 0, z: 0, y: R * 0.2, rx: R * 0.9, ry: R * 0.5, rz: R * 0.7 });
  // a tilted cleavage plane shears the top flat on some rocks (a slab look)
  const cut = r() < 0.6 ? { a: (r() - 0.5) * 0.6, b: (r() - 0.5) * 0.6, h: R * (0.45 + r() * 0.25) } : null;
  const field = (x, y, z) => {
    let best = -1e9;
    for (const L of lobes) {
      const dx = (x - L.x) / L.rx, dy = (y - L.y) / L.ry, dz = (z - L.z) / L.rz;
      best = max(best, 1 - sqrt(dx * dx + dy * dy + dz * dz));
    }
    // chunky facets: noise pushes the surface in and out in flat-ish planes
    const nz = fbm(x * 0.13, y * 0.13, z * 0.13, seed) - 0.5;
    const facet = round(nz * 3) / 3;
    let f = best + facet * 0.55 + (fbm(x * 0.4, y * 0.4, z * 0.4, seed + 5) - 0.5) * 0.08;
    if (cut && y > cut.h + x * cut.a + z * cut.b) f = Math.min(f, -0.01);
    return f;
  };
  const W = ceilR(R * 1.6);
  const H = ceilR(R * 1.5);
  const inside = new Set();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let x = -W; x <= W; x++) for (let z = -W; z <= W; z++) for (let y = 0; y <= H; y++) if (field(x, y, z) > 0) inside.add(key(x, y, z));
  // cracks: a few random walks on the surface
  const cracks = new Set();
  for (let c = 0; c < 2 + floor(r() * 2); c++) {
    let x = floor((r() - 0.5) * R), y = floor(R * (0.4 + r() * 0.6)), z = floor((r() - 0.5) * R);
    for (let k = 0; k < R * 1.4; k++) {
      cracks.add(key(x, y, z));
      x += floor(r() * 3) - 1; y -= r() < 0.6 ? 1 : 0; z += floor(r() * 3) - 1;
    }
  }
  for (const k of inside) {
    const [x, y, z] = k.split(',').map(Number);
    const up = !inside.has(key(x, y + 1, z));
    const out = !inside.has(key(x + 1, y, z)) || !inside.has(key(x - 1, y, z)) || !inside.has(key(x, y, z + 1)) || !inside.has(key(x, y, z - 1)) || up;
    if (!out) { v.set(x, y, z, pal[1]); continue; }
    // form shading: light from the top-left-front, deep at the bottom
    const lx = !inside.has(key(x - 1, y, z)), lz = !inside.has(key(x, y, z + 1));
    let t = 0.35 + (up ? 0.3 : 0) + (lx ? 0.12 : 0) + (lz ? 0.06 : 0) - (y < H * 0.18 ? 0.22 : 0) + (hash3(x, y, z + seed) - 0.5) * 0.18;
    let c = pick(pal, t);
    if (up && lx && hash3(x, y + 7, z) < 0.5) c = pal[pal.length - 1]; // rim highlights
    if (cracks.has(key(x, y, z)) || cracks.has(key(x, y + 1, z))) c = pal[0];
    if (moss && up && y > H * 0.35 && fbm(x * 0.25, 0, z * 0.25, seed + 11) > 0.52 - moss * 0.06) c = pick(P.moss, 0.3 + hash3(x, y, z) * 0.7);
    else if (moss && y < H * 0.25 && fbm(x * 0.3, y, z * 0.3, seed + 13) > 0.62) c = pick(P.algae, hash3(z, y, x));
    v.set(x, y, z, c);
  }
  return v;
}
function ceilR(x) { return Math.ceil(x); }

// ------------------------------------------------------------------ logs
/** A sunken log along X: bark with grooves, broken branch stubs, moss on top, one hollow end, the other a sawn ring face. */
export function logModel(seed = 1, len = 70, rad = 7) {
  const v = new VoxelModel();
  const r = rng(seed);
  const bend = (x) => sin(x * 0.05 + seed) * 1.2;
  const L2 = len / 2;
  for (let x = -L2; x <= L2; x++) {
    const u = (x + L2) / len;
    const rr = rad * (1 - u * 0.18) + sin(x * 0.4 + seed) * 0.3;
    const yc = rr + bend(x) * 0.3, zc = bend(x);
    for (let y = -2; y <= rad * 2 + 2; y++)
      for (let z = -rad - 3; z <= rad + 3; z++) {
        const d = hypot(y - yc, z - zc);
        if (d > rr) continue;
        const hollow = u > 0.88 && d < rr - 2.2; // the hollow end
        if (hollow) continue;
        const shell = d > rr - 1.2;
        const endFace = x === -L2 || (u > 0.88 && x === L2);
        let c;
        if (endFace && !shell) c = (round(d) & 1) ? P.ring[0] : P.ring[1];
        else if (shell) {
          const ang = Math.atan2(y - yc, z - zc);
          const groove = (round(ang * 9 + sin(x * 0.2) * 0.8) & 1) === 0;
          const top = y - yc > rr * 0.4;
          let t = 0.45 + (top ? 0.3 : 0) - (y - yc < -rr * 0.3 ? 0.3 : 0) + (groove ? -0.18 : 0) + (hash3(x, y, z) - 0.5) * 0.12;
          c = pick(P.bark, t);
          if (top && fbm(x * 0.12, 0, z * 0.2, seed + 3) > 0.5) c = pick(P.moss, 0.3 + hash3(x, y, z) * 0.7);
          if (y < yc - rr * 0.6 && hash3(x, z, y) < 0.3) c = pick(P.algae, 0.5);
        } else c = P.wood[1];
        v.set(x, y, z, c);
      }
    if (u > 0.88) for (let y = -2; y <= rad * 2; y++) for (let z = -rad; z <= rad; z++) { const d = hypot(y - yc, z - zc); if (d < rr - 2.2 && d > rr - 3.4) v.set(x, y, z, P.bark[0]); }
  }
  // broken branch stubs
  for (let k = 0; k < 3; k++) {
    const x0 = floor((r() - 0.5) * len * 0.7), side = r() < 0.5 ? -1 : 1, up = r() < 0.6;
    for (let i = 0; i < 6 + floor(r() * 6); i++) {
      const x = x0 + floor(i * 0.5), y = round(rad + (up ? i * 0.9 + rad * 0.5 : 0)), z = round(bend(x0) + side * (up ? i * 0.3 : rad + i));
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (abs(a) + abs(b) < 2 || i < 3) v.set(x + a * 0, y + a, z + b, pick(P.bark, 0.4 + hash3(x, y + a, z + b) * 0.4));
      if (i > 3 && r() < 0.15) break;
    }
  }
  return v;
}

// ------------------------------------------------------------------ plants
/** Tall "lake kelp" (giant pondweed): a wavy stalk with long alternating blades; h in voxels. */
export function kelpModel(seed = 1, h = 90, { yellow = false } = {}) {
  const v = new VoxelModel();
  const r = rng(seed);
  const pal = yellow ? P.kelpY : P.kelp;
  const sx = (y) => round(sin(y * 0.07 + seed) * 2.2 + sin(y * 0.19 + seed * 2) * 0.8);
  // holdfast
  for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) if (abs(x) + abs(z) < 4 && hash3(x, seed, z) < 0.8) v.set(x, 0, z, pal[0]);
  for (let y = 0; y < h; y++) {
    const x = sx(y);
    v.set(x, y, 0, pick(pal, 0.15 + (y / h) * 0.3));
    if (y < h * 0.3) v.set(x + 1, y, 0, pal[1]);
  }
  // blades: long ribbons angled up, alternating sides, each with a midrib and a light edge
  let y = 6 + floor(r() * 4);
  let side = r() < 0.5 ? -1 : 1;
  while (y < h - 4) {
    const bl = (14 + floor(r() * 14)) * (1 - y / h * 0.35);
    const wide = 3 + floor(r() * 3);
    const x0 = sx(y);
    for (let i = 1; i <= bl; i++) {
      const u = i / bl;
      const bx = x0 + side * round(i * 0.55 + sin(u * PI) * 1.5);
      const by = y + round(i * 0.75);
      const w = max(1, round(wide * sin(u * PI) + 0.3));
      for (let k = 0; k < w; k++) {
        const t = 0.35 + (k === 0 ? 0.15 : 0) + u * 0.25 + (y / h) * 0.2 + (hash3(bx, by, k) - 0.5) * 0.12;
        v.set(bx, by + k, (k & 1) ? 1 : 0, pick(pal, t));
      }
      if (u > 0.85 && hash3(i, y, seed) < 0.4) v.set(bx + side, by + 1, 0, pal[pal.length - 1]);
    }
    side = -side;
    y += 3 + floor(r() * 4);
  }
  // a seed head / float bladders near the top
  for (let k = 0; k < 3; k++) { const yy = h - 2 - k * 6; v.set(sx(yy) + (k & 1 ? 2 : -2), yy, 0, pal[pal.length - 1]); }
  return v;
}

/** A clump of eelgrass / tape grass ribbons; h in voxels. */
export function grassModel(seed = 1, h = 22) {
  const v = new VoxelModel();
  const r = rng(seed);
  const n = 5 + floor(r() * 5);
  for (let b = 0; b < n; b++) {
    const x0 = floor((r() - 0.5) * 8), z0 = floor((r() - 0.5) * 5);
    const hh = h * (0.55 + r() * 0.45), lean = (r() - 0.5) * 0.5, curl = (r() - 0.5) * 0.08;
    for (let y = 0; y < hh; y++) {
      const u = y / hh;
      const x = round(x0 + y * lean + y * y * curl);
      v.set(x, y, z0, pick(P.grass, 0.2 + u * 0.7 + (hash3(x, y, b) - 0.5) * 0.2));
      if (u < 0.6 && (y & 1)) v.set(x + 1, y, z0, pick(P.grass, 0.15 + u * 0.5));
    }
  }
  return v;
}

/** Coontail: a bushy stalk with whorls of needle leaves. */
export function coontailModel(seed = 1, h = 26) {
  const v = new VoxelModel();
  const r = rng(seed);
  for (let s = 0; s < 3; s++) {
    const x0 = floor((r() - 0.5) * 6), z0 = floor((r() - 0.5) * 4);
    const hh = h * (0.6 + r() * 0.4);
    for (let y = 0; y < hh; y++) {
      const x = x0 + round(sin(y * 0.2 + s) * 1.2);
      v.set(x, y, z0, P.kelp[1]);
      if (y % 3 === 1) {
        const w = max(1, round(3.6 * (1 - y / hh) + 1));
        for (let a = 0; a < 6; a++) {
          const ang = a / 6 * TAU + y;
          for (let k = 1; k <= w; k++) v.set(x + round(cos(ang) * k), y + (k > 1 ? 1 : 0), z0 + round(sin(ang) * k * 0.6), pick(P.kelp, 0.3 + k / w * 0.6));
        }
      }
    }
  }
  return v;
}

/** A lily stem from the bed up to the pad (h in voxels). */
export function lilyStemModel(seed = 1, h = 110) {
  const v = new VoxelModel();
  for (let y = 0; y < h; y++) v.set(round(sin(y * 0.04 + seed) * 2), y, round(cos(y * 0.03 + seed) * 1), P.stem[(y >> 3) & 1]);
  return v;
}
/** A floating lily pad (seen from below it is a dark disc with a light notch and veins), optional bloom. */
export function lilyPadModel(seed = 1, bloom = false) {
  const v = new VoxelModel();
  const R = 9 + (seed % 3);
  const notch = (seed * 1.7) % TAU;
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      const d = hypot(x, z);
      if (d > R + (hash3(x, seed, z) - 0.5) * 0.8) continue;
      const a = Math.atan2(z, x);
      let da = abs(((a - notch + PI) % TAU + TAU) % TAU - PI);
      if (da < 0.22 && d > 1) continue;
      const vein = (round(a * 4) - a * 4) ** 2 < 0.01 || d < 1.5;
      v.set(x, 0, z, d > R - 1 ? P.lily[3] : vein ? P.lily[0] : pick(P.lily, 0.3 + hash3(x, 0, z) * 0.4));
    }
  if (bloom) {
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU;
      for (let i = 1; i <= 3; i++) v.set(round(cos(a) * i), i, round(sin(a) * i), i === 3 ? 0xf8d0e0 : 0xfaf4f0);
    }
    v.set(0, 2, 0, 0xffd23a); v.set(0, 3, 0, 0xffe878);
  }
  return v;
}
/** Cattail reeds; h in voxels (VS). */
export function reedModel(seed = 1, h = 60) {
  const v = new VoxelModel();
  const r = rng(seed);
  for (let s = 0; s < 5; s++) {
    const x0 = floor((r() - 0.5) * 8), z0 = floor((r() - 0.5) * 6), hh = h * (0.6 + r() * 0.4);
    const lean = (r() - 0.5) * 0.12;
    for (let y = 0; y < hh; y++) v.set(round(x0 + y * lean), y, z0, pick(P.reed, 0.2 + (y / hh) * 0.7));
    if (r() < 0.6) for (let y = round(hh * 0.72); y < hh * 0.88; y++) { const x = round(x0 + y * lean); v.set(x, y, z0, P.cat[y & 1]); v.set(x + 1, y, z0, P.cat[0]); v.set(x, y, z0 + 1, P.cat[1]); }
    // a bent leaf
    const ly = floor(hh * 0.3);
    for (let i = 0; i < 12; i++) v.set(round(x0 + i * 0.6), ly + i - floor(i * i * 0.05), z0 + 1, pick(P.reed, 0.4));
  }
  return v;
}

// ------------------------------------------------------------------ the sunken barge (VOXEL 0.1 units)
/** The old barge on its side in the Deep Hole. restored: patched planks, brass lanterns, egg racks glowing inside. */
export function bargeModel(restored = false) {
  const v = new VoxelModel();
  const L = 64, Wd = 22, H = 15;
  const WOOD = [0x4a3424, 0x5e4430, 0x765840, 0x8e6c4e, 0xa88460];
  const NEW = [0x8a6a44, 0xa88458, 0xc4a070];
  // planks run along the hull: a dark seam every third row, butt joints staggered per row
  const plank = (x, y, z) => {
    const row = Math.floor(y / 3);
    if ((y % 3) === 2) return WOOD[0];
    const joint = (x + 64 + row * 17) % 23 === 0;
    if (joint) return WOOD[1];
    const b = Math.floor((x + 64 + row * 17) / 23);
    let t = 0.45 + (hash3(b, row, z > 0 ? 1 : 0) - 0.5) * 0.4 + (y > H - 3 ? 0.2 : 0) + (hash3(x, y, z) - 0.5) * 0.1;
    if (restored && hash3(b, row, 9) < 0.25) return pick(NEW, t);
    return pick(WOOD, t);
  };
  const hull = (x, y) => { // half width at (x, y): bluff bow, flat bottom, rounded bilge
    const u = (x + L / 2) / L;
    const bow = u > 0.82 ? 1 - ((u - 0.82) / 0.18) ** 1.6 * 0.6 : u < 0.06 ? 0.92 : 1;
    const bilge = y < 3 ? 0.78 + y * 0.07 : 1;
    return (Wd / 2) * bow * bilge;
  };
  const wreck = (x, y, z) => !restored && (fbm(x * 0.09, y * 0.16, z * 0.09, 7) > 0.66 || (y > H - 3 && fbm(x * 0.2, 0, z * 0.2, 4) > 0.6));
  for (let x = -L / 2; x <= L / 2; x++) {
    for (let y = 0; y <= H; y++) {
      const hw = hull(x, y);
      for (let z = -Math.ceil(hw); z <= Math.ceil(hw); z++) {
        const d = abs(z) - hw;
        const side = d > -1.5 && d <= 0.5;
        const bottom = y === 0 && abs(z) <= hw;
        const stern = x === -L / 2 && abs(z) <= hw;
        if (!side && !bottom && !stern) continue;
        if (wreck(x, y, z) && !bottom) continue;
        let c = plank(x, y, z);
        if (!restored && y < 5 && hash3(x, y, z) < 0.3) c = pick(P.moss, hash3(z, y, x)); // weed on the low strakes
        if (!restored && y > H - 5 && fbm(x * 0.15, y * 0.3, z * 0.15, 3) > 0.58) c = pick(P.algae, 0.6);
        if (!restored && y < 2 && hash3(x, y, z + 1) < 0.18) c = (x + z) & 1 ? 0x2a2e48 : 0x1e2238; // mussel clusters
        if (restored && hash3(x, y, z) < 0.025) c = 0xd8b04a; // brass nails
        v.set(x, y, round(z), c);
      }
    }
    // ribs inside, every 6
    if ((x + 64) % 6 === 0) for (let y = 1; y <= H - 1; y++) { const hw = hull(x, y) - 1.5; for (const z of [-round(hw), round(hw)]) if (!wreck(x, y, z + 1)) v.set(x, y, z, WOOD[1]); }
    // the gunwale rail
    const hw = hull(x, H);
    for (const z of [-round(hw), round(hw)]) if (!wreck(x, H + 1, z)) v.set(x, H + 1, z, WOOD[3]);
  }
  // the deckhouse: board walls, two portholes, a hatch
  for (let x = -10; x <= 6; x++) for (let y = H; y <= H + 9; y++) for (let z = -6; z <= 6; z++) {
    const shell = x === -10 || x === 6 || abs(z) === 6 || y === H + 9;
    if (!shell) continue;
    if (!restored && x > 2 && y > H + 5 && z > 0) continue; // the roof is stove in
    const port = (y === H + 4 || y === H + 5) && abs(z) === 6 && (x === -6 || x === -5 || x === 1 || x === 2);
    const rim = (y === H + 3 || y === H + 6) && abs(z) === 6 && (x >= -7 && x <= -4 || x >= 0 && x <= 3);
    v.set(x, y, z, port ? (restored ? 0xffe070 : 0x10181c) : rim ? 0xb8902e : y === H + 9 ? WOOD[2] : ((x + 40) % 3 === 0 ? WOOD[1] : WOOD[3]));
  }
  // the mast, snapped (or whole and flying a little pennant once restored)
  const mh = restored ? 30 : 14;
  for (let y = H + 9; y < H + 9 + mh; y++) for (let a = 0; a <= 1; a++) v.set(-2 + a, y, 0, WOOD[2 + a]);
  if (!restored) { v.set(-2, H + 9 + mh, 0, WOOD[4]); v.set(-1, H + 9 + mh + 1, 1, WOOD[4]); for (let k = 0; k < 14; k++) v.set(-2 - k, H + 9 + mh - 1 - k, round(sin(k * 0.5) * 2), ROPE_C[k & 1]); }
  else { for (let x = 0; x <= 8; x++) for (let y = 0; y <= 3 - (x >> 2); y++) v.set(x, H + 9 + mh - 4 + y, 0, x & 1 ? 0xd8403a : 0xf6f2ea); }
  if (restored) {
    for (const x of [-22, -2, 18]) { v.set(x, H - 1, -Wd / 2 - 1, 0xffe070); v.set(x, H, -Wd / 2 - 1, 0xb08a2a); v.set(x, H - 2, -Wd / 2 - 1, 0xb08a2a); v.set(x, H - 1, -Wd / 2 - 2, 0xfff4b0); }
    // egg racks along the open deck
    for (let x = -26; x <= 24; x += 5) for (let k = 0; k < 2; k++) { const z = k ? 5 : -5; v.set(x, 2, z, WOOD[0]); v.set(x + 1, 2, z, WOOD[0]); v.set(x, 3, z, 0xf8e6b8); v.set(x + 1, 3, z, 0xffd0a0); v.set(x, 4, z, 0xfff4d8); }
  }
  return v;
}
const ROPE_C = [0x9a7e4e, 0xc8a870];

// ------------------------------------------------------------------ litter / lesson props (fine voxels)
export function litterModel(kind = 'can') {
  const v = new VoxelModel();
  if (kind === 'can') {
    for (let x = -6; x <= 6; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      if (hypot(y, z) > 3.2) continue;
      const end = abs(x) === 6;
      v.set(x, y, z, end ? 0xb8bcc8 : x > -2 && x < 3 ? 0xf6f2e8 : (y > 1 ? 0xf05a4a : 0xd83a32));
    }
    v.set(-1, 0, 4, 0xffd23a); v.set(0, 0, 4, 0xffd23a); // a daisy on the label (Daisy Beer)
  } else if (kind === 'boot') {
    for (let x = -4; x <= 4; x++) for (let y = 0; y <= 14; y++) for (let z = -3; z <= 3; z++) if (hypot(x, z * 1.2) < 4.2) v.set(x, y, z, y > 12 ? 0x3a2a1e : (y + z) & 1 ? 0x5a3e28 : 0x4a3222);
    for (let x = 4; x <= 12; x++) for (let y = 0; y <= 5; y++) for (let z = -3; z <= 3; z++) if (y < 5 - max(0, x - 9)) v.set(x, y, z, y === 0 ? 0x1a1410 : 0x5a3e28);
    v.set(0, 8, 4, 0xc8b070); v.set(0, 10, 4, 0xc8b070); // laces
  } else if (kind === 'bottle') {
    for (let x = -8; x <= 8; x++) for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) {
      const r = x > 3 ? 1.6 : 3.8;
      if (hypot(y, z) > r) continue;
      v.set(x, y, z, x > 7 ? 0xc89060 : (y > 1 ? 0x9ad8a8 : 0x4e9a6a));
    }
    v.set(-1, 1, 0, 0xfaf0d0); v.set(0, 1, 0, 0xfaf0d0); // the note inside
  } else if (kind === 'tire') {
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) for (let y = 0; y <= 6; y++) {
      const d = hypot(x, z);
      if (d > 10 || d < 5) continue;
      const tread = (round(Math.atan2(z, x) * 8) & 1) && d > 9;
      v.set(x, y, z, tread ? 0x16161a : y === 6 ? 0x34343c : 0x24242a);
    }
  }
  return v;
}
export function whistleModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) if (hypot(x, y, z) < 3.2) v.set(x, y, z, y > 1 && x < 0 ? 0xfff0a0 : 0xe8c050);
  for (let z = 3; z <= 7; z++) for (let x = -1; x <= 1; x++) v.set(x, 2, z, z === 7 ? 0xb08a2a : 0xe8c050);
  for (let k = 0; k < 10; k++) v.set(-3 - k, -2 - (k >> 1), 0, k & 1 ? 0xd8403a : 0xa02a28); // a bit of red lanyard
  return v;
}
/** A training hoop: a red-and-white life ring stood up on a weighted line (VS voxels). */
export function hoopModel() {
  const v = new VoxelModel();
  const R = 14;
  for (let a = 0; a < 200; a++) {
    const t = a / 200 * TAU;
    for (let k = -2; k <= 2; k++) for (let j = -2; j <= 2; j++) {
      if (k * k + j * j > 5) continue;
      const rr = R + k;
      const seg = floor(((t + 0.2) / TAU) * 8) & 1;
      v.set(round(cos(t) * rr), round(sin(t) * rr) + R + 4, j, seg ? 0xf6f2ea : 0xe0403a);
    }
  }
  for (let y = 0; y < 4; y++) v.set(0, y, 0, 0xc8b070);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) v.set(x, 0, z, 0x5a5a64);
  return v;
}

// ------------------------------------------------------------------ farm structures (VS voxels, ~2.4 units = 48 voxels)
const CEDAR = [0x5a3a24, 0x74503a, 0x8e6648, 0xa87c58];
const ROPE = [0x9a7e4e, 0xc8a870];
const IRON = [0x2e3038, 0x464a56, 0x60667a];
const BRASS = [0x8a6420, 0xb8902e, 0xe8c050, 0xfff0a0];
function post(v, x0, z0, h, seed) {
  for (let y = 0; y < h; y++) for (let x = 0; x <= 1; x++) for (let z = 0; z <= 1; z++) {
    let t = 0.3 + (x === 0 ? 0.25 : 0) + (z === 1 ? 0.15 : 0) + (hash3(x0 + x, y, z0 + z + seed) - 0.5) * 0.2;
    let c = pick(CEDAR, t);
    if (y < 8 && hash3(x0, y, z0) < 0.4) c = pick(P.algae, 0.5);
    if (y % 9 === 4 && x === 0) c = ROPE[0]; // rope lashing
    v.set(x0 + x, y, z0 + z, c);
  }
  v.set(x0, h, z0, CEDAR[2]); v.set(x0 + 1, h, z0 + 1, CEDAR[1]);
}
function ropeLine(v, x0, y0, z0, x1, y1, z1, sag = 2) {
  const n = max(abs(x1 - x0), abs(z1 - z0), 1);
  for (let i = 0; i <= n; i++) { const u = i / n; v.set(round(lerp(x0, x1, u)), round(lerp(y0, y1, u) - sin(u * PI) * sag), round(lerp(z0, z1, u)), ROPE[(i >> 1) & 1]); }
}
export function farmModel(type, { level = 0 } = {}) {
  const v = new VoxelModel();
  if (type === 'pen') {
    const S = 22, H = 38;
    for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) post(v, x, z, H + 4, x * 3 + z);
    // the net: a diamond lattice on all four sides (open top), weighted along the bottom
    for (let i = -S + 2; i < S; i++)
      for (let y = 2; y < H; y++) {
        const knot = ((i + y) % 4 === 0) || ((i - y + 400) % 4 === 0);
        if (!knot) continue;
        const c = (i * 7 + y) % 13 === 0 ? 0x6a8a5a : 0xb8b49a;
        v.set(i, y, -S, c); v.set(i, y, S + 1, c); v.set(-S, y, i, c); v.set(S + 1, y, i, c);
      }
    for (let i = -S; i <= S + 1; i++) for (const [a, b] of [[i, -S], [i, S + 1], [-S, i], [S + 1, i]]) { v.set(a, 1, b, 0x4a4a52); v.set(a, H, b, ROPE[1]); }
    // cork floats along the top rope, red and white
    for (let i = -S + 3; i < S; i += 6) for (const [a, b] of [[i, -S], [i, S + 1], [-S, i], [S + 1, i]]) for (let dy = 0; dy <= 2; dy++) for (let d = -1; d <= 1; d++) {
      const vert = a === -S || a === S + 1;
      v.set(vert ? a : a + d, H + 1 + dy, vert ? b + d : b, dy === 1 ? 0xf6f2ea : 0xd8403a);
    }
    // a hinged gate and a little slate sign
    for (let y = 6; y < 22; y++) { v.set(-6, y, S + 2, CEDAR[2]); v.set(6, y, S + 2, CEDAR[2]); }
    for (let x = -5; x <= 5; x++) for (let y = 24; y <= 29; y++) v.set(x, y, S + 2, (x === -5 || x === 5 || y === 24 || y === 29) ? CEDAR[1] : 0x3a4048);
  } else if (type === 'cage') {
    const S = 20, H = 32;
    for (let y = 0; y <= H; y++)
      for (let i = -S; i <= S; i++) {
        const bar = (i + 400) % 4 === 0;
        const band = y === 0 || y === H || y === round(H / 2);
        if (!bar && !band) continue;
        const c = band ? IRON[2] : pick(IRON, 0.3 + (i & 1) * 0.3);
        v.set(i, y, -S, c); v.set(i, y, S, c); v.set(-S, y, i, c); v.set(S, y, i, c);
      }
    for (let x = -S; x <= S; x++) for (let z = -S; z <= S; z++) if (((x + z) & 3) === 0 || abs(x) === S || abs(z) === S) v.set(x, H, z, IRON[1]); // grated lid
    for (const [x, z] of [[-S, -S], [S, -S], [-S, S], [S, S]]) for (let y = 0; y <= H + 2; y++) for (let a = 0; a <= 1; a++) v.set(x + a * Math.sign(-x), y, z, 0x8a5a2a); // rusty corner posts
    for (let x = -3; x <= 3; x++) for (let y = 4; y <= 10; y++) v.set(x, y, S + 1, (abs(x) === 3 || y === 4 || y === 10) ? IRON[0] : 0xb8902e); // a brass padlock plate
    v.set(0, 7, S + 2, 0x2a2a30);
  } else if (type === 'nursery') {
    const S = 20, H = 34;
    for (const x of [-S, S]) post(v, x, 0, H + 2, x);
    for (const y of [10, 20, 30]) ropeLine(v, -S, y, 0, S + 1, y, 0, 1.5);
    // young kelp fronds hanging off the ropes, little seedling tags
    for (const y of [10, 20, 30]) for (let x = -S + 3; x < S; x += 4) {
      const len = 5 + ((x * 7 + y) % 5);
      for (let k = 0; k < len; k++) v.set(x + round(sin(k * 0.6 + x) * 1), y - 1 - k + (k > len - 3 ? 0 : 0), (k & 1) ? 1 : 0, pick(P.kelp, 0.3 + k / len * 0.6));
      if ((x + y) % 12 === 0) { v.set(x, y - 2, 2, 0xf6f2ea); v.set(x, y - 3, 2, 0xf6f2ea); }
    }
    for (let x = -S; x <= S + 1; x++) for (let z = -3; z <= 3; z++) if (abs(z) === 3 || (x & 3) === 0) v.set(x, 0, z, CEDAR[1]); // base frame
  } else if (type === 'mussels') {
    // a wooden crate half-sunk in the sand, packed with blue-black mussels, a few open
    const S = 14;
    for (let x = -S; x <= S; x++) for (let z = -S + 4; z <= S - 4; z++) for (let y = 0; y <= 8; y++) {
      const wall = abs(x) === S || abs(z) === S - 4 || y === 0;
      if (wall) v.set(x, y, z, pick(CEDAR, 0.2 + ((y >> 1) & 1) * 0.3 + (hash3(x, y, z) - 0.5) * 0.2));
    }
    for (let x = -S + 1; x < S; x += 3) for (let z = -S + 5; z < S - 4; z += 3) {
      const open = hash3(x, 3, z) < 0.25;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) v.set(x + a, 9 + b, z + (open ? b : 0), b ? 0x3a3e6a : 0x1e2240);
      if (open) { v.set(x, 9, z + 1, 0xd8c8b8); if (hash3(z, x, 1) < 0.5) v.set(x + 1, 10, z + 1, 0xfaf8ff); }
    }
  } else if (type === 'feeder') {
    // a brass diving-bell hopper on three legs, a crank, a hose and a sieve plate underneath
    const R = 10;
    for (let y = 18; y <= 34; y++) {
      const u = (y - 18) / 16;
      const r = R * (1 - u * 0.45) + (u > 0.9 ? -2 : 0);
      for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
        const d = hypot(x, z);
        if (d > r || d < r - 1.6) continue;
        let c = pick(BRASS, 0.3 + (x < 0 ? 0.3 : 0) + (z > 0 ? 0.15 : 0) - (y < 20 ? 0.25 : 0) + (hash3(x, y, z) - 0.5) * 0.1);
        if (y % 5 === 0 && hash3(x, y, z) < 0.5) c = BRASS[0]; // rivet rows
        v.set(x, y, z, c);
      }
    }
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) v.set(x, 35, z, BRASS[1]);
    for (let x = -4; x <= 4; x++) for (let y = 25; y <= 29; y++) if (hypot(x, y - 27) < 2.6) v.set(x, y, R - 1, hypot(x, y - 27) < 1.6 ? 0xc8ecf0 : BRASS[0]); // porthole
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; for (let y = 0; y < 19; y++) v.set(round(cos(a) * (8 + (18 - y) * 0.15)), y, round(sin(a) * (8 + (18 - y) * 0.15)), pick(IRON, 0.5)); }
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) if (hypot(x, z) < 7 && ((x + z) & 1)) v.set(x, 17, z, IRON[1]);
    for (let y = 30; y <= 40; y++) v.set(R + 1, y, 0, 0x2a2a2a); for (let x = R + 1; x <= R + 5; x++) v.set(x, 40, 0, 0x2a2a2a); // hose up
    v.set(-R - 1, 28, 0, IRON[2]); v.set(-R - 2, 28, 0, IRON[2]); v.set(-R - 2, 29, 0, 0xd8403a); // crank
  } else if (type === 'hatchery') {
    return bargeModel(true);
  }
  return v;
}

// ------------------------------------------------------------------ fauna (fine voxels)
export function crayfishModel(part = 'body') {
  const v = new VoxelModel();
  const R = [0x8a2a1a, 0xb43a22, 0xd85a32, 0xf08a52];
  if (part === 'body') {
    for (let x = -12; x <= 6; x++) {
      const u = (x + 12) / 18;
      const r = x > 0 ? 3.6 - x * 0.2 : 2.2 + u * 1.8;
      for (let y = 0; y <= 5; y++) for (let z = -4; z <= 4; z++) {
        if (hypot((y - 2.2) / 1.1, z) > r) continue;
        const seg = x < 0 && (x & 1) === 0;
        v.set(x, y, z, pick(R, 0.25 + (y > 3 ? 0.4 : 0) + (seg ? -0.15 : 0)));
      }
    }
    for (let z = -4; z <= 4; z++) for (let y = 0; y <= 3; y++) if (abs(z) + y < 6) v.set(-13 - (abs(z) > 2 ? 1 : 0), y, z, R[1]); // tail fan
    for (const z of [-2, 2]) { v.set(7, 4, z, 0x101010); v.set(7, 5, z, 0x101010); }
    for (let k = 0; k < 10; k++) { v.set(7 + k, 3 + (k >> 2), -1 - (k >> 1), R[0]); v.set(7 + k, 3 + (k >> 2), 1 + (k >> 1), R[0]); } // antennae
    for (const z of [-3, 3]) for (const x of [-6, -3, 0]) { v.set(x, 0, z + Math.sign(z), R[0]); v.set(x, -1, z + Math.sign(z) * 2, R[0]); } // legs
  } else {
    const s = part === 'clawL' ? 1 : -1;
    for (let x = 0; x <= 8; x++) for (let y = -1; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      const r = x < 4 ? 1.2 : 2.2 - (x - 4) * 0.1;
      if (hypot(y - 0.5, z) > r) continue;
      if (x > 5 && abs(y - 0.5) < 0.6) continue; // the pincer gap
      v.set(x, y, z * s, pick(R, 0.3 + (y > 1 ? 0.4 : 0)));
    }
  }
  return v;
}
export function turtleModel(part = 'shell') {
  const v = new VoxelModel();
  const SH = [0x2a3a2a, 0x3e5236, 0x546a44];
  const SK = [0x2e3a2e, 0x46563c, 0xf0c040, 0xd8403a];
  if (part === 'shell') {
    for (let x = -14; x <= 14; x++) for (let z = -11; z <= 11; z++) {
      const d = hypot(x / 14, z / 11);
      if (d > 1) continue;
      const hgt = round((1 - d * d) * 7);
      for (let y = 0; y <= hgt; y++) {
        const top = y === hgt;
        const scute = (round(x / 5) + round(z / 5)) & 1;
        let c = top ? SH[scute ? 2 : 1] : SH[0];
        if (top && (abs(x % 5) === 0 || abs(z % 5) === 0)) c = 0x1a241a;
        if (d > 0.88 && y < 2) c = (round(Math.atan2(z, x) * 6) & 1) ? 0xd8403a : 0x1e2a1e; // red marginal scutes
        v.set(x, y, z, c);
      }
    }
    for (let x = -12; x <= 12; x++) for (let z = -9; z <= 9; z++) if (hypot(x / 12, z / 9) < 1) v.set(x, -1, z, 0xe8c050); // yellow plastron
  } else if (part === 'head') {
    for (let x = 0; x <= 8; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      if (hypot(y, z) > (x > 5 ? 2.2 : 1.8)) continue;
      v.set(x, y, z, (y + z + x) % 3 === 0 ? SK[2] : SK[1]);
    }
    for (const z of [-2, 2]) { v.set(7, 1, z, 0x101010); v.set(6, 0, z, SK[3]); }
  } else {
    const s = part.endsWith('L') ? 1 : -1;
    const big = part.startsWith('flip');
    for (let x = 0; x <= (big ? 9 : 5); x++) for (let z = 0; z <= (big ? 5 : 3); z++) v.set(x * (big ? 0.6 : 0.5) | 0, 0, z * s, (x + z) % 3 === 0 ? SK[2] : SK[1]);
  }
  return v;
}

// ------------------------------------------------------------------ Reynard's dive gear (fine voxels)
export function gearModel(kind) {
  const v = new VoxelModel();
  if (kind === 'mask') {
    // an oval rubber frame (the glass is left open so his eyes show) + a strap round the head
    for (let x = -11; x <= 10; x++) for (let y = -6; y <= 6; y++) {
      const d = hypot((x + 0.5) / 11, y / 6.4);
      if (d > 1 || d < 0.72) continue;
      v.set(x, y, 0, y > 3 ? 0x3a3e4a : 0x1e2028);
    }
    for (let y = -6; y <= -2; y++) for (let x = -2; x <= 1; x++) v.set(x, y, 1, 0x1e2028); // nose pocket
    for (let k = 0; k < 12; k++) for (const s of [-1, 1]) v.set(s * 11 + (s < 0 ? 0 : -1), 1, -k, 0x2a2e3a);
    v.set(-8, 3, 1, 0xffffff); v.set(6, 3, 1, 0xffffff); // glints on the rim
  } else if (kind === 'snorkel') {
    for (let y = 0; y <= 26; y++) for (let x = 0; x <= 1; x++) for (let z = 0; z <= 1; z++) v.set(x, y, z, y > 22 ? 0xd8403a : y % 6 === 0 ? 0xe0a020 : 0xffd23a);
    for (let z = 2; z <= 5; z++) { v.set(0, 0, z, 0xffd23a); v.set(1, 0, z, 0xffd23a); }
  } else if (kind === 'flipper') {
    // a bright yellow fin, the foot pocket black; points along +Z
    for (let z = -2; z <= 16; z++) {
      const hw = z < 3 ? 3 : 3 + (z - 3) * 0.32;
      for (let x = -round(hw); x <= round(hw) - 1; x++) {
        const rib = abs(x + 0.5) > hw - 1.2 || ((x + 40) % 3 === 0 && z > 4);
        v.set(x, 0, z, z < 3 ? 0x1e2028 : rib ? 0xe0a020 : 0xffd23a);
        if (z < 3) { v.set(x, 1, z, 0x2a2e3a); v.set(x, 2, z, z < 1 ? 0x2a2e3a : null); }
      }
    }
  } else if (kind === 'helmet') {
    // a brass Navy pattern helmet: dome, a front porthole (open so his face shows), side ports, bolts, collar
    const R = 15;
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R + 2; y++) for (let z = -R; z <= R; z++) {
      const d = hypot(x, y * 0.95, z);
      if (d > R || d < R - 1.6) continue;
      if (z > 6 && hypot(x, y - 1) < 8) { if (hypot(x, y - 1) > 6.6) v.set(x, y, z, 0xb8902e); continue; } // front port (open)
      if (abs(x) > 10 && hypot(z, y - 1) < 5) { v.set(x, y, z, hypot(z, y - 1) > 3.6 ? 0xb8902e : 0x9ad8e8); continue; } // side ports
      if (y < -R + 3) continue;
      let c = pick(BRASS, 0.3 + (x < 0 ? 0.25 : 0) + (y > 6 ? 0.2 : 0) + (hash3(x, y, z) - 0.5) * 0.12);
      if (y > 10 && x < -2 && z > 2 && hash3(x, y, z) < 0.35) c = BRASS[3];
      v.set(x, y, z, c);
    }
    for (let x = -R - 2; x <= R + 2; x++) for (let z = -R - 2; z <= R + 2; z++) for (let y = -R + 1; y <= -R + 4; y++) {
      const d = hypot(x, z);
      if (d > R + 2 || d < R - 3) continue;
      v.set(x, y, z, (round(Math.atan2(z, x) * 6) & 1) && y === -R + 3 ? 0xfff0a0 : 0x8a6420); // bolted collar
    }
    for (let y = R; y <= R + 4; y++) v.set(0, y, -6, 0x5a5a62); // air valve on top
  } else if (kind === 'tanks') {
    for (const s of [-1, 1]) for (let y = 0; y <= 26; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      if (hypot(x, z) > 3.4) continue;
      if (y > 23 && hypot(x, z) > 3.4 - (y - 23)) continue;
      v.set(x + s * 4, y, z, y % 8 === 0 ? 0xd8403a : x < 0 ? 0xd8dce6 : 0xa8b0c0);
    }
    for (let x = -5; x <= 5; x++) v.set(x, 27, 0, 0x5a5a62);
    v.set(0, 28, 0, 0xe8c050);
  }
  return v;
}

// ------------------------------------------------------------------ lake props (overworld, game grain material)
function propMesh(key, build, pivot = [0, 0, 0], scale = FV) {
  const g = diveGeo('lake_' + key, build, { pivot, scale });
  const m = new THREE.Mesh(g, matFor(g));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const PL = [0x86664a, 0xa4825e, 0xbe9c74, 0xd8b88c]; // weathered dock planks, sun-bleached
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
/** Noodles' camp: an overturned canoe on two sawhorses, a smoky campfire with a fish rack, a bait bucket and a creel. */
export function makeLakeCamp() {
  const g = new THREE.Group(); g.name = 'noodlesCamp';
  g.add(at(propMesh('canoe', () => {
    const v = new VoxelModel();
    for (let x = -28; x <= 28; x++) {
      const u = abs(x) / 28;
      const hw = 8 * sqrt(max(0, 1 - u * u)) + 1;
      for (let z = -round(hw); z <= round(hw); z++) {
        const top = round(6 * sqrt(max(0, 1 - (z / hw) ** 2)));
        for (let y = 0; y <= top; y++) {
          const shell = y === top || abs(z) >= round(hw) - 0;
          if (!shell && y > 0) continue;
          v.set(x, y + 10, z, y === 0 ? 0x5a3a20 : (round(z / 3) & 1) ? 0x2e6aa0 : 0x3a7cb8);
        }
      }
      if (abs(x) > 24) v.set(x, 17, 0, 0xd8c8a0);
    }
    for (const x of [-16, 16]) for (let y = 0; y <= 10; y++) for (const z of [-6, 6]) v.set(x + (y < 5 ? (z > 0 ? 1 : -1) * 0 : 0), y, z + (z > 0 ? -round((10 - y) * 0.3) : round((10 - y) * 0.3)), PL[1]);
    for (const x of [-16, 16]) for (let z = -6; z <= 6; z++) v.set(x, 10, z, PL[2]);
    for (let k = -14; k <= 14; k++) v.set(k, 18, 0, k % 4 === 0 ? 0xd8c8a0 : null); // a paddle laid on top
    for (let x = 12; x <= 26; x++) v.set(x, 18, 3, x > 22 ? 0xa87c58 : 0xc49c70);
    return v;
  }), -0.9, 0, -0.9));
  // the campfire: stones ring, logs, a smoking rack of fish on forked sticks
  g.add(at(propMesh('fire', () => {
    const v = new VoxelModel();
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; for (let y = 0; y <= 2; y++) for (let d = 0; d <= 1; d++) v.set(round(cos(a) * (8 + d)), y, round(sin(a) * (8 + d)), pick(P.rock, 0.3 + (y === 2 ? 0.4 : 0) + hash3(k, y, d) * 0.2)); }
    for (let k = -6; k <= 6; k++) { v.set(k, 1, round(k * 0.3), P.bark[2]); v.set(round(k * 0.3), 2, k, P.bark[3]); }
    for (let y = 2; y <= 7; y++) for (let x = -2; x <= 2; x++) if (abs(x) <= 3 - y * 0.4) v.set(x, y, 0, y > 5 ? 0xffe070 : y > 3 ? 0xf8a030 : 0xe05a20);
    for (const x of [-10, 10]) for (let y = 0; y <= 22; y++) v.set(x, y, -4, y > 19 ? (y === 22 ? null : P.bark[2]) : P.bark[3]);
    for (let x = -10; x <= 10; x++) v.set(x, 20, -4, P.bark[2]);
    for (const x of [-6, -1, 4]) for (let y = 12; y <= 19; y++) for (let z = -5; z <= -3; z++) if (abs(z + 4) + abs(y - 15.5) * 0.4 < 2.2) v.set(x + (y > 17 ? 0 : 0), y, z, y > 17 ? 0xc89050 : (z === -3 ? 0xd8a060 : 0xb07840)); // smoked fish
    return v;
  }), 1.2, 0, 0.3));
  g.add(at(propMesh('bucket', () => {
    const v = new VoxelModel();
    for (let y = 0; y <= 10; y++) for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) { const d = hypot(x, z); const r = 4.6 + y * 0.12; if (d > r || (d < r - 1 && y > 0)) continue; v.set(x, y, z, y % 4 === 0 ? 0x8a909c : 0xb8bcc8); }
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (hypot(x, z) < 4.6) v.set(x, 9, z, 0x3a6a8a);
    for (const [x, z] of [[-1, 1], [2, -1]]) { v.set(x, 10, z, 0xe0b040); v.set(x + 1, 10, z, 0xd8a030); }
    for (let a = 0; a <= 12; a++) v.set(round(-6 + a), 11 + round(sin(a / 12 * PI) * 4), 0, 0x5a5a62);
    // BAIT painted on the side
    return v;
  }), -1.3, 0, 0.6));
  return g;
}
/** Chief's dock: a plank jetty on posts running out over the water (length in tiles along +Z), a bollard, a coiled line and a ladder at the end. */
export function makeDiveDock(len = 4.2) {
  const n = round(len / FV);
  const g = new THREE.Group(); g.name = 'diveDock';
  g.add(propMesh('dock' + n, () => {
    const v = new VoxelModel();
    const W = 16;
    for (let z = 0; z <= n; z++) for (let x = -W; x <= W; x++) {
      const plankI = floor(z / 5);
      const gap = z % 5 === 4;
      if (gap) continue;
      const t = 0.3 + (hash3(plankI, 1, 3) - 0.5) * 0.4 + (x < -W + 2 || x > W - 2 ? -0.2 : 0);
      v.set(x, 0, z, pick(PL, t + (hash3(x, plankI, 7) < 0.08 ? -0.3 : 0)));
      if (hash3(x, plankI, 9) < 0.03) v.set(x, 1, z, 0x8a8a92); // nail heads
    }
    for (let z = 0; z <= n; z++) for (const x of [-W - 1, W + 1]) { v.set(x, 0, z, PL[0]); v.set(x, -1, z, (z % 22) === 7 ? 0x5a5a62 : PL[0]); }
    for (let z = 6; z <= n; z += 22) for (const x of [-W, W - 1]) for (let y = -34; y <= 4; y++) for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) v.set(x + a, y, z + b, y < -8 ? (hash3(x, y, z) < 0.4 ? 0x3e5a2e : PL[0]) : pick(PL, 0.2 + a * 0.3));
    // bollard + a coil of rope + the ladder at the far end
    for (let y = 1; y <= 6; y++) for (let x = W - 6; x <= W - 3; x++) for (let z = n - 8; z <= n - 5; z++) v.set(x, y, z, y === 6 ? 0x5a5a62 : 0x3a3a42);
    for (let a = 0; a < 40; a++) { const t = a / 40 * TAU * 2; v.set(round(-8 + cos(t) * (3 + a * 0.05)), 1 + (a > 20 ? 1 : 0), round(n - 10 + sin(t) * (3 + a * 0.05)), ROPE[a & 1]); }
    for (let y = -20; y <= 6; y++) for (const x of [-4, 4]) v.set(x, y, n + 1, 0xb8bcc8);
    for (let y = -18; y <= 4; y += 5) for (let x = -3; x <= 3; x++) v.set(x, y, n + 1, 0xd8dce4);
    return v;
  }, [0, 0, 0]));
  return g;
}
/** Chief's shack: a little board-and-batten boathouse, a tin roof, a DIVE sign, a brass helmet on a post, life ring on the wall. */
export function makeDiveShack() {
  const g = new THREE.Group(); g.name = 'diveShack';
  g.add(propMesh('shack', () => {
    const v = new VoxelModel();
    const X = 22, Z = 18, H = 30;
    for (let x = -X; x <= X; x++) for (let z = -Z; z <= Z; z++) for (let y = 0; y <= H; y++) {
      const wall = abs(x) === X || abs(z) === Z;
      if (!wall && y > 0) continue;
      const door = z === Z && abs(x + 6) <= 5 && y < 20;
      const win = z === Z && x > 4 && x < 15 && y > 10 && y < 20;
      if (door) { v.set(x, y, z, y < 19 && abs(x + 6) < 5 ? ((x + 6) & 3) === 0 ? 0x24324e : 0x2c3a5e : 0xf6f2ea); continue; }
      if (win) { v.set(x, y, z, (x === 9 || y === 15) ? 0xf6f2ea : 0x9ad8e8); continue; }
      const batten = (x + 40) % 4 === 0 || (z + 40) % 4 === 0;
      v.set(x, y, z, batten ? 0x8aa0b0 : (y < 2 ? 0x6a7a88 : 0xa8bccc));
    }
    // tin roof, corrugated, overhanging
    for (let x = -X - 3; x <= X + 3; x++) for (let z = -Z - 3; z <= Z + 3; z++) {
      const y = H + round((Z + 3 - abs(z)) * 0.55);
      v.set(x, y, z, (x & 1) ? 0x8a909c : 0xb8bcc8);
      if (abs(z) > Z + 1) v.set(x, y - 1, z, 0x6a707c);
    }
    // the DIVE sign: navy board, white letters (a pixel D I V E)
    const L = { D: ['##.', '#.#', '#.#', '#.#', '##.'], I: ['#', '#', '#', '#', '#'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], E: ['###', '#..', '##.', '#..', '###'] };
    for (let x = -14; x <= 14; x++) for (let y = 21; y <= 29; y++) v.set(x, y, Z + 1, (abs(x) === 14 || y === 21 || y === 29) ? 0xe8c050 : 0x24324e);
    let cx = -11;
    for (const ch of 'DIVE') { const r = L[ch]; for (let j = 0; j < 5; j++) for (let i = 0; i < r[j].length; i++) if (r[j][i] === '#') { v.set(cx + i * 2, 27 - j, Z + 2, 0xf6f2ea); v.set(cx + i * 2 + 1, 27 - j, Z + 2, 0xf6f2ea); } cx += r[0].length * 2 + 3; }
    // a life ring on the wall
    for (let a = 0; a < 48; a++) { const t = a / 48 * TAU; for (let k = 0; k <= 1; k++) v.set(X + 1, round(14 + sin(t) * (5 + k)), round(cos(t) * (5 + k)), (floor(t / TAU * 8) & 1) ? 0xf6f2ea : 0xe0403a); }
    return v;
  }, [0, 0, 0]));
  // the brass helmet on a post by the door
  const hp = propMesh('helmpost', () => {
    const v = new VoxelModel();
    for (let y = 0; y <= 22; y++) for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) v.set(a, y, b, pick(PL, 0.3 + a * 0.3));
    return v;
  });
  hp.position.set(-1.0, 0, 0.75);
  g.add(hp);
  const hm = new THREE.Mesh(diveGeo('gear_helmet', () => gearModel('helmet'), { scale: FV }), null);
  hm.material = matFor(hm.geometry);
  hm.scale.setScalar(0.7); hm.position.set(-0.99, 0.58 + 0.27, 0.77); hm.rotation.y = 0.5; hm.castShadow = true;
  g.add(hm);
  return g;
}
/** The dive flag buoy: a red flag with the white diagonal stripe on a bobbing float. userData.flag = the flag (flutters). */
export function makeDiveBuoy() {
  const g = new THREE.Group(); g.name = 'diveBuoy';
  const b = propMesh('buoy', () => {
    const v = new VoxelModel();
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) for (let y = -4; y <= 4; y++) { const d = hypot(x, z, y * 1.6); if (d > 8) continue; v.set(x, y, z, y > 1 ? 0xf6f2ea : y > -2 ? 0xe0403a : 0xc8302a); }
    for (let y = 4; y <= 40; y++) v.set(0, y, 0, 0x8a909c);
    return v;
  });
  g.add(b);
  const flag = propMesh('flag', () => {
    const v = new VoxelModel();
    for (let x = 0; x <= 18; x++) for (let y = 0; y <= 12; y++) { const stripe = abs((y - 12 + x * 12 / 18)) < 2.2; v.set(x, y, 0, stripe ? 0xffffff : 0xe0302a); }
    return v;
  });
  flag.position.set(0.03, 0.66, 0);
  g.add(flag);
  g.userData.flag = flag;
  return g;
}
/** A lily pad floating on the lake (game material), some in bloom. */
export function makeLakeLily(seed = 1) {
  return propMesh('lily' + (seed % 3), () => lilyPadModel(2 + (seed % 3), seed % 3 === 1), [0, 0, 0], FV * 1.6);
}
/** A clump of shore reeds / cattails for the lake edge (game material). */
export function makeReedClump(seed = 1) {
  return propMesh('reeds' + (seed % 4), () => reedModel(seed % 4 + 1, 28), [0, 0, 0], VS);
}
