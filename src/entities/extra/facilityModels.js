// Voxel models for the v14 facilities (bear business, fox tools, beaver
// works) plus the little kit woodworkModels.js builds on.
//
//   STRUCTURE_MODELS[type]({ variant, seed, preview }) -> THREE.Group
//     Root at the ground centre of the footprint, front faces +Z, 1 tile = 1 unit.
//     Bodies use chunky 0.1 voxels like restaurantModels.js; small props, trim and
//     lettering use 0.05 "fine" voxels (fine index = 2 x coarse index, both built
//     with pivot 0 so voxel x covers [x, x+1] * size).
//     root.userData.update(dt, t)  animates the moving bits (gears, glints, hearts...);
//                                  only present when the model has moving parts.
//     root.userData.seats          [{ x, z, yaw, y }] world units, same format as
//                                  restaurantModel() seats (yaw 0 faces +z).
//     root.userData.footprint      { w, d } tiles.
//   Meshes: lit voxels share voxelMaterial() and carry userData.tintable (damage tint);
//   glow (unlit) and glass meshes are tintable = false with userData.glow / .glass.
//   Geometry is built lazily on first use, once per (type, variant), and shared.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial, shade, mix } from '../../core/voxel.js';
import { mulberry32, hash3 } from '../../core/rng.js';

export const VC = 0.1; // coarse voxel
export const VF = 0.05; // fine voxel
const PI = Math.PI, TAU = PI * 2;

// ---------------------------------------------------------------- palette (shared with woodwork)
export const P = {
  WOOD: [0xb48452, 0xa8784a, 0xc0905a], WOOD_D: 0x6a4424, WOOD_M: 0x8a5a32, WOOD_L: 0xd4a46a,
  HONEY: [0xd89a52, 0xc88a46, 0xe4aa62],
  BARK: [0x7a4e2a, 0x8a5a30, 0x6a4424], BARK_D: 0x553620,
  LOG_END: 0xd8a868, LOG_RING: 0xb07e4c, LOG_CORE: 0x8a5a32,
  STONE: [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72],
  MOSS: [0x6a9a3a, 0x5a8a34, 0x7aa848],
  LEAF: [0x3f8a3a, 0x4f9c44, 0x2f7034, 0x5aa84a],
  GRASS: [0x6aa040, 0x5a9038, 0x7ab04a],
  FLOWERS: [0xffffff, 0xf2c230, 0xd9529b, 0x9a86ea, 0xf07a4a],
  RED: 0xd23a2e, RED_D: 0xa82a22, RED_L: 0xe85a46,
  WHITE: 0xf6f2ea, CREAM: 0xf0e6cc, PAPER: 0xf6ecd0,
  METAL: 0xa8b0b8, METAL_D: 0x6a747c, METAL_L: 0xc8d0d8, IRON: 0x3a3a42, IRON_L: 0x5a5a64, CHROME: 0xd8e0e8,
  BRASS: 0xd8a840, BRASS_D: 0xa87820, BRASS_L: 0xf4d27a,
  GOLD: 0xf2c23a, GOLD_D: 0xc8962a, GOLD_DD: 0x9a6a1a, GOLD_L: 0xffe27a, GOLD_LL: 0xfff4c0,
  NAVY: 0x2a4a8a, NAVY_D: 0x1e3668,
  CHALK: 0x2a3430, ROPE: 0xd8c090, TWINE: 0xc8a070,
  WARM: 0xffd070, FLAME: [0xffe070, 0xffb030, 0xff7a20],
  INK: 0x2a1a14,
};
const {
  WOOD, WOOD_D, WOOD_M, HONEY, BARK, LOG_END, LOG_RING, LOG_CORE, STONE, MOSS, LEAF, GRASS,
  RED, RED_D, RED_L, WHITE, CREAM, PAPER, METAL, METAL_D, METAL_L, IRON, IRON_L, CHROME,
  BRASS, BRASS_D, BRASS_L, GOLD, GOLD_D, GOLD_DD, GOLD_L, GOLD_LL, NAVY, NAVY_D, CHALK, TWINE, FLAME, INK,
} = P;

// ---------------------------------------------------------------- voxel helpers
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const hv = (x, y, z, s = 0) => hash3(x * 7 + s, y * 13 - s, z * 5 + s * 3);
// stable per-voxel tone variation (grain, stone, fur)
export const tone = (x, y, z, base, dark, light, pd = 0.14, pl = 0.12, s = 0) => {
  const h = hv(x, y, z, s);
  return h < pd ? dark : h > 1 - pl ? light : base;
};
export const toneOf = (arr, x, y, z, s = 0) => arr[Math.floor(hv(x, y, z, s) * arr.length) % arr.length];

// rounded box (inclusive voxel ranges), r = corner radius in voxels
export function rbox(v, x0, x1, y0, y1, z0, z1, r, col) {
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  const hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2, hz = (z1 - z0 + 1) / 2;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const qx = Math.abs(x + 0.5 - cx) - (hx - r), qy = Math.abs(y + 0.5 - cy) - (hy - r), qz = Math.abs(z + 0.5 - cz) - (hz - r);
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
        if (d <= 0.02) v.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
  return v;
}

// sphere centred on a voxel-corner point (cx, cy, cz) (use .5 for voxel centres)
export function ball(v, cx, cy, cz, r, col) {
  for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++)
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++)
      for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r); z++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
        if (dx * dx + dy * dy + dz * dz <= r * r) v.set(x, y, z, typeof col === 'function' ? col(x, y, z, dx, dy, dz) : col);
      }
  return v;
}

// A log along an axis ('x' | 'y' | 'z'), from a0 to a1 (inclusive), axis centre (u, w)
// on the two other axes (voxel-corner coordinates), radius r. Bark round the
// outside, rings + core on the end faces.
export function log(v, axis, a0, a1, u, w, r, { ends = true, s = 0, bark = BARK } = {}) {
  const R = Math.ceil(r) + 1;
  for (let a = a0; a <= a1; a++)
    for (let i = Math.floor(u - R); i <= Math.ceil(u + R); i++)
      for (let j = Math.floor(w - R); j <= Math.ceil(w + R); j++) {
        const d = Math.hypot(i + 0.5 - u, j + 0.5 - w);
        if (d > r) continue;
        const end = ends && (a === a0 || a === a1);
        let c;
        if (end) c = r >= 2 && d > r - 0.9 ? bark[2] : d < r * 0.3 ? LOG_CORE : Math.floor(d * 1.4) % 2 ? LOG_RING : LOG_END;
        else c = toneOf(bark, a, i, j, s);
        if (axis === 'x') v.set(a, i, j, c);
        else if (axis === 'y') v.set(i, a, j, c);
        else v.set(i, j, a, c);
      }
  return v;
}

// grass blades + tiny flowers (coarse), within footprint fp (tiles)
export function tufts(v, rnd, n, fp = { w: 1, d: 1 }, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = -5 * fp.w + Math.floor(rnd() * 10 * fp.w), z = -5 * fp.d + Math.floor(rnd() * 10 * fp.d);
    if (avoid(x, z) || v.has(x, 0, z) || v.has(x, 1, z)) continue;
    const h = 1 + Math.floor(rnd() * 2);
    for (let y = 0; y < h; y++) v.set(x, y, z, pick(rnd, GRASS));
    if (rnd() < 0.3) v.set(x, h, z, pick(rnd, P.FLOWERS));
  }
}
// fine-voxel blades (thinner, nicer next to fine props); avoid(x, z) in fine units
export function ftufts(v, rnd, n, fp = { w: 1, d: 1 }, avoid = () => false) {
  for (let i = 0; i < n; i++) {
    const x = -10 * fp.w + Math.floor(rnd() * 20 * fp.w), z = -10 * fp.d + Math.floor(rnd() * 20 * fp.d);
    if (avoid(x, z) || v.has(x, 0, z)) continue;
    const h = 1 + Math.floor(rnd() * 3);
    for (let y = 0; y < h; y++) v.set(x + (y === 2 ? (rnd() < 0.5 ? 1 : -1) : 0), y, z, pick(rnd, GRASS));
    if (rnd() < 0.25) v.set(x, h, z, pick(rnd, P.FLOWERS));
  }
}

// ---------------------------------------------------------------- pixel lettering
// 3x5 variable-width glyphs ('#' = ink). N and W are the narrow 3-wide forms so
// short words fit on a 1-tile sign; a space is just one extra pixel of gap.
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['#', '#', '#', '#', '#'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#.#', '###', '###', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '#.#', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  1: ['.#', '##', '.#', '.#', '.#'], 5: ['###', '#..', '##.', '..#', '##.'], 0: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '!': ['#', '#', '#', '.', '#'], ' ': [''], ':': ['.', '#', '.', '#', '.'], '-': ['..', '..', '##', '..', '..'],
};
const glyph = (ch) => GLYPHS[ch] || GLYPHS[' '];
export function textW(s) {
  let w = 0;
  for (const ch of s) w += glyph(ch)[0].length + 1;
  return Math.max(0, w - 1);
}
// draw `s` with its top row at yTop, left column x0, on plane z (number or fn(y) -> z)
export function text(v, s, x0, yTop, z, col) {
  let x = x0;
  for (const ch of s) {
    const g = glyph(ch);
    for (let r = 0; r < g.length; r++)
      for (let c = 0; c < g[r].length; c++)
        if (g[r][c] === '#') v.set(x + c, yTop - r, typeof z === 'function' ? z(yTop - r) : z, col);
    x += g[0].length + 1;
  }
  return x - x0 - 1;
}
// stamp a little pixel picture: rows top->bottom, map char -> colour (missing = skip)
export function pix(v, rows, x0, yTop, z, map) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const col = map[row[c]];
      if (col != null) v.set(x0 + c, yTop - r, typeof z === 'function' ? z(yTop - r) : z, col);
    }
  });
}

// spoked / toothed disc in the x-y plane (rotates round z), centred on the
// voxel-corner point (cx, cy), from z0..z1. teeth: count (0 = none); phase in rad.
export function gear(v, cx, cy, z0, z1, rIn, rOut, teeth, col, { phase = 0, hub = IRON, spokes = 0, rim = null } = {}) {
  const R = Math.ceil(rOut) + 1;
  for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++)
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r > rOut) continue;
      let a = Math.atan2(dy, dx) - phase;
      a = ((a % TAU) + TAU) % TAU;
      const tooth = teeth > 0 && Math.floor(a / (PI / teeth)) % 2 === 0;
      if (r > rIn && !tooth) continue;
      let c = typeof col === 'function' ? col(x, y, r, a) : col;
      if (r <= 1.25) c = hub;
      else if (spokes && r < rIn - 1.1 && r > 1.6) {
        const k = (a * spokes) / TAU;
        if (Math.abs(k - Math.round(k)) > 0.14) continue;
      } else if (rim && r > rIn - 1.1 && r <= rIn) c = rim;
      for (let z = z0; z <= z1; z++) v.set(x, y, z, c);
    }
  return v;
}

// ---------------------------------------------------------------- drafts, baking, instancing
// A Draft collects voxels per layer; parts are child drafts that animate round a
// pivot (world units, same tile space as the body; nested parts are fine).
export class Draft {
  constructor(o = {}) {
    this.o = o;
    this.c = new VoxelModel(); // lit, 0.1
    this.f = new VoxelModel(); // lit, 0.05
    this.gc = new VoxelModel(); // glow, 0.1
    this.gf = new VoxelModel(); // glow, 0.05
    this.glass = new VoxelModel(); // translucent, 0.05 (make it a solid volume: only the outer skin is drawn)
    this.parts = [];
    this.seats = [];
  }
  // o: { pivot: [x, y, z] world, anim, axis, speed, amp, phase, period, rise, ... } (see animate())
  part(o) {
    const d = new Draft(o);
    this.parts.push(d);
    return d;
  }
  seat(x, z, yaw, y, extra) {
    this.seats.push({ x: +x.toFixed(3), z: +z.toFixed(3), yaw: +yaw.toFixed(4), y: +y.toFixed(3), ...extra });
  }
}
// world position of a fine voxel's centre (handy for pivots)
export const fw = (x, y, z) => [(x + 0.5) * VF, (y + 0.5) * VF, (z + 0.5) * VF];

function bake(d, top = true) {
  // glow + moving voxels win over static lit voxels in the same cell
  for (const k of d.gc.vox.keys()) d.c.vox.delete(k);
  for (const k of d.gf.vox.keys()) d.f.vox.delete(k);
  const own = { c: [], f: [] };
  for (const p of d.parts) {
    const collect = (q) => {
      own.c.push(...q.c.vox.keys(), ...q.gc.vox.keys());
      own.f.push(...q.f.vox.keys(), ...q.gf.vox.keys());
      q.parts.forEach(collect);
    };
    collect(p);
  }
  for (const k of own.c) d.c.vox.delete(k);
  for (const k of own.f) d.f.vox.delete(k);
  if (top) for (const vm of [d.c, d.f, d.gc, d.gf, d.glass]) vm.paint((x, y, z, c) => (y < 0 ? null : c));
  const piv = d.o.pivot || [0, 0, 0];
  const layers = [];
  const add = (vm, s, kind) => {
    if (!vm.vox.size) return;
    layers.push({ kind, geo: vm.build({ pivot: [piv[0] / s, piv[1] / s, piv[2] / s], scale: s, ao: kind === 'lit' }) });
  };
  add(d.c, VC, 'lit'); add(d.f, VF, 'lit'); add(d.gc, VC, 'glow'); add(d.gf, VF, 'glow'); add(d.glass, VF, 'glass');
  return { o: d.o, piv, layers, parts: d.parts.map((p) => bake(p, false)), seats: d.seats };
}

let glowMat = null, glassMat = null;
export function glowMaterial() {
  return glowMat || (glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }));
}
export function glassMaterial() {
  return glassMat || (glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, emissive: 0x1a2a30 }));
}
function meshOf(l) {
  const kind = l.kind;
  const m = new THREE.Mesh(l.geo, kind === 'lit' ? voxelMaterial() : kind === 'glow' ? glowMaterial() : glassMaterial());
  m.castShadow = kind === 'lit';
  m.receiveShadow = kind !== 'glow';
  m.userData.tintable = kind === 'lit';
  if (kind === 'glow') m.userData.glow = true;
  if (kind === 'glass') { m.userData.glass = true; m.renderOrder = 2; }
  return m;
}
function instance(rec, parentPiv, anims) {
  const g = new THREE.Group();
  g.position.set(rec.piv[0] - parentPiv[0], rec.piv[1] - parentPiv[1], rec.piv[2] - parentPiv[2]);
  for (const l of rec.layers) g.add(meshOf(l));
  for (const p of rec.parts) g.add(instance(p, rec.piv, anims));
  if (rec.o.anim) anims.push({ h: g, o: rec.o, x0: g.position.x, y0: g.position.y, z0: g.position.z });
  return g;
}

const frac = (t, per) => (t - Math.floor(t / per) * per) / per;
// Part animations. tt = (time + per-instance offset) * speed + phase.
//   spin    rotation[axis] = tt                          (gears, vanes)
//   sway    rotation[axis] = sin(tt) * amp (rad)          (tags, pendulum, rocking chair)
//   bob     y += sin(tt) * amp (units)                    (birds, butterflies)
//   flicker flame scale wobble from its base
//   glint   a sparkle pops (scale 0 -> 1 -> 0) for the first 0.45 of every `period`
//   float   rises `rise` units over `period`, fades in/out (hearts, zzz)
//   squish  squash & stretch pulse every `period`
//   twinkle on/off (fairy lights), duty ~70%
//   drip    a drop swells at the spout then falls `fall` units, every `period`
function animate(a, t) {
  const o = a.o, h = a.h;
  const tt = t * (o.speed ?? 1) + (o.phase || 0);
  switch (o.anim) {
    case 'spin': h.rotation[o.axis || 'y'] = tt; break;
    case 'sway': h.rotation[o.axis || 'z'] = Math.sin(tt) * (o.amp ?? 0.15); break;
    case 'bob': h.position.y = a.y0 + Math.sin(tt) * (o.amp ?? 0.02); h.rotation.z = Math.sin(tt * 0.7) * 0.05; break;
    case 'flicker': {
      const n = Math.sin(tt * 7.3) * 0.5 + Math.sin(tt * 13.1) * 0.3 + Math.sin(tt * 3.1) * 0.2;
      h.scale.set(1 - n * 0.07, 1 + n * 0.18, 1 - n * 0.07);
      break;
    }
    case 'glint': {
      const u = frac(tt, o.period || 3) * (o.period || 3);
      const k = u < 0.45 ? Math.sin((u / 0.45) * PI) : 0;
      h.visible = k > 0.04;
      h.scale.setScalar(Math.max(0.05, k));
      break;
    }
    case 'float': {
      const u = frac(tt, o.period || 3);
      const s = Math.min(1, u / 0.15, (1 - u) / 0.3);
      h.position.y = a.y0 + u * (o.rise ?? 0.4);
      h.position.x = a.x0 + Math.sin(u * TAU) * (o.wiggle ?? 0.03);
      h.visible = s > 0.04;
      h.scale.setScalar(Math.max(0.05, s));
      break;
    }
    case 'squish': {
      const u = frac(tt, o.period || 2.4);
      const k = u < 0.3 ? Math.sin((u / 0.3) * PI) : u < 0.55 ? -0.35 * Math.sin(((u - 0.3) / 0.25) * PI) : 0;
      h.scale.set(1 + 0.2 * k, 1 - 0.3 * k, 1 + 0.2 * k);
      break;
    }
    case 'twinkle': h.visible = Math.sin(tt) > -0.4; break;
    case 'drip': {
      const u = frac(tt, o.period || 2.5);
      if (u < 0.6) { h.visible = true; h.scale.setScalar(Math.max(0.05, u / 0.6)); h.position.y = a.y0; }
      else { const f = (u - 0.6) / 0.4; h.scale.setScalar(1); h.position.y = a.y0 - f * f * (o.fall ?? 0.3); h.visible = f < 0.95; }
      break;
    }
    default: break;
  }
}

const RECIPES = new Map();
/**
 * Wrap draft builders into STRUCTURE_MODELS factories.
 * @param {Object<string, (d: Draft, rnd: () => number, variant: number) => void>} builders
 * @param {Object<string, {w:number, d:number}>} footprints
 */
export function defineModels(builders, footprints = {}) {
  const out = {};
  for (const [type, build] of Object.entries(builders)) {
    out[type] = ({ variant = 0, seed = 1, preview = false } = {}) => {
      const v = (((variant | 0) % 3) + 3) % 3;
      const key = type + ':' + v;
      let rec = RECIPES.get(key);
      if (!rec) {
        const d = new Draft();
        build(d, mulberry32((v * 7919 + type.length * 131 + type.charCodeAt(0) * 23 + type.charCodeAt(type.length - 1)) >>> 0), v);
        rec = bake(d);
        RECIPES.set(key, rec);
      }
      const anims = [];
      const root = instance(rec, [0, 0, 0], anims);
      root.name = type;
      root.userData.footprint = { ...(footprints[type] || { w: 1, d: 1 }) };
      if (rec.seats.length) root.userData.seats = rec.seats.map((s) => ({ ...s }));
      if (anims.length) {
        const off = (((seed | 0) * 2654435761) >>> 0) / 4294967296 * 17;
        let clock = 0;
        root.userData.update = (dt, t) => {
          clock = t != null ? t : clock + Math.min(0.1, dt || 0);
          for (const a of anims) animate(a, clock + off);
        };
        root.userData.update(0, 0);
      }
      void preview;
      return root;
    };
  }
  return out;
}

// pop-in sparkle (fine glow cross) at fine voxel (x, y, z)
export function sparkle(d, x, y, z, { period = 3, phase = 0, big = false, col = 0xfff8d0 } = {}) {
  const p = d.part({ pivot: fw(x, y, z), anim: 'glint', period, phase });
  p.gf.set(x, y, z, 0xffffff);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.gf.set(x + dx, y + dy, z, col);
  if (big) for (const [dx, dy] of [[0, 2], [0, -2]]) p.gf.set(x + dx, y + dy, z, col);
  return p;
}

// a gold / silver / copper coin lying flat (fine, 2x1x2) or stacked
function coinStack(f, x, y, z, n, rnd) {
  for (let i = 0; i < n; i++) {
    const c = i % 3 === 2 ? 0xc8ccd4 : rnd() < 0.5 ? GOLD : GOLD_L;
    f.box(x, y + i, z, x + 1, y + i, z + 1, (xx, yy, zz) => ((xx + zz) & 1 ? c : shade(c, 0.88)));
  }
}

// ================================================================ TIP JAR (1x1)
// A big squarish glass jar of coins and bills with a "TIPS" label, on a stump.
function tipjar(d, rnd) {
  const { c, f, glass } = d;
  // stump (coarse) with roots, top rings
  const SR = 4.1;
  for (let y = 0; y <= 1; y++)
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > SR) continue;
        if (y === 1) c.set(x, y, z, r > SR - 0.9 ? BARK[2] : r < 1.2 ? LOG_CORE : Math.floor(r * 1.3) % 2 ? LOG_RING : LOG_END);
        else c.set(x, y, z, toneOf(BARK, x, y, z));
      }
  for (const [x, z] of [[-5, -1], [4, 0], [-1, 4], [0, -5], [3, 3]]) c.set(x, 0, z, BARK[0]);
  // jar profile (fine): squircle so the label sits on a flat-ish front
  const BASE = 4;
  const RY = (y) => (y === BASE ? 7 : y <= 17 ? 7.5 : y === 18 ? 6.6 : y === 19 ? 5.4 : y <= 21 ? 4.5 : 5.1);
  const inside = (x, z, R) => Math.pow(Math.abs(x + 0.5) / R, 4) + Math.pow(Math.abs(z + 0.5) / R, 4) <= 1;
  const zSurf = (x, R) => { let z = -12; for (let k = -12; k <= 12; k++) if (inside(x, k, R)) z = k; return z; };
  for (let y = BASE; y <= 22; y++)
    for (let x = -9; x <= 8; x++)
      for (let z = -9; z <= 8; z++) {
        const R = RY(y);
        if (!inside(x, z, R)) continue;
        if (y === BASE) { f.set(x, y, z, (x + z) & 1 ? 0xa8d0d8 : 0xb8dce4); continue; } // thick glass foot
        if (y === 22) { if (!inside(x, z, R - 1.1)) f.set(x, y, z, x + 0.5 < -2 ? 0xf4fcff : 0xd8f0f4); continue; } // rolled lip
        // glass: brighter skin on the front-left for a highlight
        const hi = (x + 0.5 < -4.5 && z + 0.5 > 3) || (x + 0.5 < -5.5 && z > -2);
        glass.set(x, y, z, hi ? 0xffffff : (y + x) % 5 === 0 ? 0xe4f8fc : 0xc6ecf4);
      }
  // coins inside: mound peaking in the middle, a few silver/copper, green bills
  const COIN = [GOLD, GOLD, GOLD_L, GOLD, GOLD_D, GOLD, GOLD_L, 0xc8ccd4];
  for (let x = -7; x <= 6; x++)
    for (let z = -7; z <= 6; z++) {
      if (!inside(x, z, 6.4)) continue;
      const rr = Math.hypot(x + 0.5, z + 0.5);
      const top = 14 + Math.round(2.4 * (1 - rr / 8) + hv(x, 0, z) * 1.3);
      for (let y = BASE + 1; y <= top; y++) {
        const h = hv(x, y, z, 3);
        f.set(x, y, z, h < 0.05 ? 0x8ad06a : COIN[Math.floor(h * 97) % COIN.length]);
      }
    }
  // coins standing on edge on top of the pile
  for (const [x, z] of [[-2, 1], [2, -2], [0, 3]]) { f.set(x, 18, z, GOLD_L); f.set(x, 17, z, GOLD); }
  // two bills poking up out of the mouth (pale with a dark border + portrait dot)
  const bill = (x0, y0, z, w, h, lean) => {
    for (let k = 0; k < h; k++)
      for (let i = 0; i < w; i++) {
        const edge = i === 0 || i === w - 1 || k === h - 1;
        f.set(x0 + i + Math.floor((k * lean) / 4), y0 + k, z, edge ? 0x4a9a42 : k === h - 3 && i === (w >> 1) ? 0x3f7a3a : 0xa8e08a);
      }
  };
  bill(-3, 15, 0, 4, 12, -1);
  bill(-1, 15, -2, 4, 11, 1);
  // "TIPS" label: a flat paper plate on the front (text flush, so it stays crisp)
  const TIPS = new VoxelModel();
  text(TIPS, 'TIPS', -6, 13, 0, 1);
  const LZ = zSurf(0, 7.5) + 1;
  for (let x = -7; x <= 6; x++)
    for (let y = 7; y <= 15; y++)
      for (let z = zSurf(x, 7.5) + 1; z <= LZ; z++) {
        let col = y === 7 || y === 15 ? RED : PAPER;
        if (z === LZ && TIPS.has(x, y, 0)) col = 0x8a2216;
        f.set(x, y, z, col);
      }
  // twine bow round the neck
  for (let x = -7; x <= 6; x++)
    for (let z = -7; z <= 6; z++)
      if (inside(x, z, 5.5) && !inside(x, z, 4.5)) f.set(x, 20, z, (x + z) & 1 ? TWINE : 0xb88a58);
  const bz = zSurf(0, 5.5) + 1;
  for (const [x, y] of [[-2, 21], [-3, 21], [-2, 20], [1, 21], [2, 21], [1, 20], [-1, 20], [0, 20], [-1, 19], [1, 19]]) f.set(x, y, bz, (x + y) & 1 ? 0xd84a4a : RED);
  // a little coin stack + stray coins on the ground
  coinStack(f, 6, 0, 8, 3, rnd);
  coinStack(f, -9, 0, 7, 1, rnd);
  coinStack(f, 8, 0, 5, 1, rnd);
  // glints on the coins and the glass
  sparkle(d, -2, 19, 2, { period: 2.7, phase: 0 });
  sparkle(d, 3, 17, -2, { period: 3.3, phase: 1.1 });
  sparkle(d, -6, 15, 8, { period: 3.9, phase: 2.2, big: true });
  sparkle(d, 6, 4, 9, { period: 3.1, phase: 0.6 });
}

// ================================================================ PRICE BOARD (1x1)
// A-frame chalkboard: big "$$" and a chalk chart that only goes up.
function pricesign(d, rnd) {
  const f = d.f;
  const H = 27;
  const zF = (y) => Math.round(4 - (y * 5) / H);
  const zB = (y) => Math.round(-6 + (y * 5) / H);
  const W = (x, y) => HONEY[(x * 3 + y + 30) % 3];
  const CH = (x, y) => ((x * 7 + y * 3) % 11 === 0 ? 0x34403a : (x + y * 5) % 13 === 0 ? 0x26302c : CHALK);
  // chalk drawing in board space (x -6..5, y 7..24)
  const ART = new VoxelModel();
  const DOLLAR = ['..#..', '.####', '###..', '###..', '.###.', '..###', '..###', '####.', '..#..'];
  pix(ART, DOLLAR, -6, 25, 0, { '#': 0xf8dc70 });
  pix(ART, DOLLAR, 1, 25, 0, { '#': 0xf8dc70 });
  for (let x = -5; x <= 4; x += 2) ART.set(x, 15, 0, 0xe8e4d8); // dotted divider
  for (let y = 8; y <= 13; y++) ART.set(-6, y, 0, 0xe8e4d8); // chart axes
  for (let x = -6; x <= 5; x++) ART.set(x, 7, 0, 0xe8e4d8);
  const line = [[-5, 8], [-4, 9], [-3, 9], [-2, 8], [-1, 10], [0, 11], [1, 10], [2, 12], [3, 13]];
  for (const [x, y] of line) { ART.set(x, y, 0, 0xff8a8a); }
  ART.set(4, 13, 0, 0xff8a8a); ART.set(4, 12, 0, 0xff8a8a); ART.set(3, 12, 0, null); ART.set(4, 14, 0, 0xff8a8a); ART.set(5, 13, 0, 0xff8a8a); // arrow head
  for (let y = 0; y <= H; y++)
    for (let x = -8; x <= 7; x++) {
      const side = x <= -7 || x >= 6;
      if (y < 5 && !side) continue; // legs only
      const frame = side || y === 5 || y >= H - 1;
      const zf = zF(y), zb = zB(y);
      const a = ART.get(x, y, 0);
      f.set(x, y, zf, frame ? W(x, y) : a ?? CH(x, y));
      f.set(x, y, zf - 1, frame ? HONEY[1] : WOOD_D);
      f.set(x, y, zb, frame ? HONEY[1] : CHALK);
      f.set(x, y, zb + 1, frame ? HONEY[1] : WOOD_D);
      if (side && y < 5) { f.set(x, y, zf - 1, null); f.set(x, y, zb + 1, null); }
    }
  // hinge cap + gold coin badge, rope stay between the legs
  f.box(-8, H + 1, -2, 7, H + 1, 0, (x) => (x === -8 || x === 7 ? WOOD_M : HONEY[2]));
  f.box(-1, H + 2, -1, 0, H + 3, -1, GOLD); f.set(-1, H + 3, -1, GOLD_L); f.set(0, H + 2, -1, GOLD_D);
  for (let z = zB(3) + 1; z <= zF(3) - 1; z++) { f.set(-8, 3, z, P.ROPE); f.set(7, 3, z, P.ROPE); }
  // chalk tray with chalk + felt eraser
  const tz = zF(5) + 1;
  f.box(-6, 5, tz, 5, 5, tz, HONEY[2]);
  f.set(-4, 6, tz, WHITE); f.set(-3, 6, tz, WHITE); f.set(-1, 6, tz, 0xf8dc70);
  f.box(2, 6, tz, 4, 6, tz, 0x6a5a4a); f.box(2, 7, tz, 4, 7, tz, 0x8a7a6a);
  // coins at its feet
  coinStack(f, 5, 0, 7, 4, rnd);
  coinStack(f, 3, 0, 8, 1, rnd);
  coinStack(f, -7, 0, 6, 2, rnd);
  sparkle(d, 5, 5, 9, { period: 3.4 });
  sparkle(d, -4, 25, zF(25) + 1, { period: 4.1, phase: 1.7, col: 0xfff0a0 });
}

// ================================================================ WAITING BENCH (1x1)
// Cushioned bench under a big clock (hands stuck near 5, of course), plus a
// magazine stand topped with a "take a number" ticket dispenser.
function waitbench(d, rnd, v) {
  const { c, f } = d;
  const CUSH = [[0xc83a3a, 0xe05a4a, 0x9a2a2a], [0x3a6ac0, 0x5a8ad8, 0x2a4a90], [0x4a9a5a, 0x6ab86a, 0x2a6a3a]][v];
  // bench (coarse) x -5..1
  for (const x of [-5, 1]) {
    c.box(x, 0, -2, x, 3, -2, WOOD_D); c.box(x, 0, 1, x, 3, 1, WOOD_D);
    c.set(x, 1, -1, WOOD_M); c.set(x, 1, 0, WOOD_M);
    c.box(x, 6, -2, x, 6, 2, HONEY[2]); c.set(x, 5, 1, WOOD_D); c.set(x, 4, 1, WOOD_D); c.set(x, 6, 2, LOG_END);
    c.box(x, 4, -3, x, 9, -3, WOOD_D);
  }
  for (const z of [-2, -1, 0, 1]) c.box(-5, 4, z, 1, 4, z, (x) => HONEY[(x + z + 20) % 3]);
  c.box(-5, 9, -3, 1, 9, -3, HONEY[2]);
  c.box(-4, 6, -3, 0, 6, -3, HONEY[0]);
  c.box(-4, 7, -3, 0, 8, -3, (x) => (x % 2 ? HONEY[1] : null));
  // two plump seat cushions (fine; slat tops at fine y 10) with a button each
  for (const [x0, x1] of [[-8, -4], [-3, 1]]) {
    rbox(f, x0, x1, 10, 11, -4, 3, 0.9, (x, y, z) => (y === 11 && (x + z) & 1 ? CUSH[1] : CUSH[0]));
    f.set(Math.floor((x0 + x1) / 2), 11, 0, CUSH[2]);
  }
  // clock on a post over the backrest; the minute hand creeps round
  f.box(-4, 20, -6, -3, 21, -5, WOOD_D);
  const CX = -3, CY = 26, CZ = -4;
  for (let x = CX - 5; x <= CX + 4; x++)
    for (let y = CY - 5; y <= CY + 4; y++) {
      const r = Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
      if (r > 4.7) continue;
      f.set(x, y, CZ - 1, WOOD_D);
      f.set(x, y, CZ, r > 3.7 ? (x + y) & 1 ? BRASS : BRASS_D : WHITE);
    }
  for (const [x, y] of [[CX - 1, CY + 3], [CX, CY + 3], [CX + 2, CY], [CX - 1, CY - 4], [CX, CY - 4], [CX - 4, CY]]) f.set(x, y, CZ, 0x2a2a2a);
  f.set(CX - 3, CY, CZ, 0x2a2a2a); f.set(CX + 3, CY - 1, CZ, null);
  f.set(CX, CY - 1, CZ, INK); f.set(CX + 1, CY - 2, CZ, INK); // hour hand -> 5
  const hand = d.part({ pivot: [CX * VF, CY * VF, (CZ + 1) * VF], anim: 'spin', axis: 'z', speed: -0.35 });
  hand.f.box(CX - 1, CY, CZ + 1, CX - 1, CY + 2, CZ + 1, RED_D);
  hand.f.set(CX - 1, CY - 1, CZ + 1, BRASS_D);
  // magazine stand (fine) x 4..9: three stepped tiers, covers face the camera
  for (const x of [4, 9]) {
    f.box(x, 0, -3, x, 19, -3, HONEY[0]);
    for (let i = 0; i < 3; i++) f.box(x, 2 + 6 * i, -3, x, 2 + 6 * i, 3 - 2 * i, HONEY[2]);
    f.box(x, 0, 3, x, 2, 3, HONEY[0]);
  }
  f.box(5, 0, -3, 8, 19, -3, HONEY[1]);
  f.box(4, 0, -3, 9, 0, 3, WOOD_M);
  const ART = [
    { bg: 0xf8d04a, art: ['#..#', '####', '.##.'], ac: 0x8a5a3a }, // bear
    { bg: 0xf06a8a, art: ['#.#.', '###.', '.#..'], ac: WHITE }, // heart
    { bg: 0x5ab0e8, art: ['.#..', '###.', '.#..'], ac: 0xffd84a }, // star
  ];
  for (let i = 0; i < 3; i++) {
    const y0 = 3 + 6 * i, z = 2 - 2 * i, m = ART[i];
    f.box(5, y0 - 1, z + 1, 8, y0 - 1, z + 1, HONEY[2]); // lip
    for (let y = y0; y <= y0 + 4; y++)
      for (let x = 5; x <= 8; x++) {
        let col = m.bg;
        if (y === y0 + 4) col = x % 2 ? WHITE : 0xe0dccf; // masthead
        else if (y > y0) { const r = m.art[y0 + 3 - y]; if (r && r[x - 5] === '#') col = m.ac; }
        f.set(x, y, z, col);
        f.set(x, y, z - 1, shade(m.bg, 0.8));
      }
  }
  // ticket dispenser on top
  rbox(f, 5, 8, 20, 23, -2, 1, 1.2, (x, y) => (y === 23 ? 0xe85a46 : RED));
  f.set(6, 22, 2, 0x2a2a2a); f.set(7, 22, 2, 0x2a2a2a);
  f.set(7, 20, 2, PAPER); f.set(7, 19, 3, PAPER); f.set(8, 18, 3, 0xf0e4c4); f.set(8, 17, 4, PAPER);
  f.box(2, 0, 7, 3, 0, 7, PAPER); f.set(3, 0, 8, 0xe8dcc0); // a dropped ticket
  // newspaper on the bench end
  f.box(-9, 12, -1, -7, 12, 1, (x, y, z) => (z === 0 ? 0xc8c4b8 : 0xeae6da));
  tufts(c, rnd, 5, { w: 1, d: 1 }, (x, z) => x >= -5 && x <= 4 && z >= -3 && z <= 2);
  d.seat(-0.3, -0.05, 0, 0.6);
  d.seat(0.05, -0.05, 0, 0.6);
}

// ================================================================ STRESS BALL BUCKET (1x1)
// A painted pail heaped with squishy smiley stress balls.
function stressbin(d, rnd, v) {
  const f = d.f;
  const PAIL = [[0x3aa0a0, 0x2a8080, 0x5ac0b8], [0xd84a3a, 0xa83a2a, 0xf06a50], [0x4a7ad0, 0x3a5aa8, 0x6a9ae8]][v];
  const R = (y) => 5 + y * 0.07;
  for (let y = 0; y <= 12; y++)
    for (let x = -8; x <= 7; x++)
      for (let z = -8; z <= 7; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > R(y)) continue;
        if (y === 12) { f.set(x, y, z, r > R(y) - 1.2 ? (x + z) & 1 ? METAL_L : CHROME : null); continue; }
        if (y > 0 && r < R(y) - 1.1) continue;
        let col = y === 0 ? PAIL[1] : y === 3 || y === 9 ? PAIL[1] : tone(x, y, z, PAIL[0], PAIL[1], PAIL[2], 0.08, 0.1);
        if (x + 0.5 < -3 && z > 0 && y > 1 && y < 11 && y !== 3 && y !== 9) col = PAIL[2];
        f.set(x, y, z, col);
      }
  // calm-bear sticker on the front
  const bz = 5;
  pix(f, ['#...#', '#####', '#.#.#', '##o##', '#ooo#', '.###.'], -3, 9, (y) => (y >= 8 ? bz : bz + 1), { '#': 0xb07848, o: 0xf0d8b0, '.': null });
  f.set(-1, 6, bz + 1, 0x3a2010); f.set(-2, 7, bz + 1, 0x3a2010); f.set(0, 7, bz + 1, 0x3a2010);
  for (const y of [8, 9]) { f.set(-3, y, bz, 0xb07848); f.set(1, y, bz, 0xb07848); }
  // handle: tilted back over the rim
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * PI;
    const x = Math.round(-0.5 - Math.cos(a) * 6.3), y = Math.round(11.5 + Math.sin(a) * 5.4), z = Math.round(-0.5 - Math.sin(a) * 4.6);
    f.set(x, y, z, i === 0 || i === 24 ? IRON : METAL_D);
  }
  // the balls (r 2.4, centred on voxel centres) with little faces when they face us
  const COLS = [0xff7ab0, 0xffd84a, 0x5ad8e8, 0x9ae05a, 0xff9a3a, 0xb48aff];
  const sq = (m, cx, cy, cz, col, face) => {
    ball(m, cx + 0.5, cy + 0.5, cz + 0.5, 2.45, (x, y, z, dx, dy) => (dx < -0.5 && dy > 0.5 ? shade(col, 1.12) : dy < -1.2 ? shade(col, 0.86) : col));
    if (face) { m.set(cx - 1, cy, cz + 2, 0x2a1a20); m.set(cx + 1, cy, cz + 2, 0x2a1a20); m.set(cx, cy - 1, cz + 2, 0xc83a5a); }
  };
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if (Math.hypot(x + 0.5, z + 0.5) < 4.6) f.set(x, 11, z, COLS[(x * 3 + z * 5 + 40) % 6]);
  const BALLS = [[-3, 13, -2, 3, 0], [2, 13, -3, 5, 0], [-2, 13, 2, 0, 1], [3, 13, 1, 1, 1], [0, 14, -1, 2, 0], [-4, 12, 1, 4, 0], [4, 12, -1, 3, 0]];
  for (const [x, y, z, k, face] of BALLS) sq(f, x, y, z, COLS[(k + v) % 6], face);
  // top ball squishes now and then
  const top = d.part({ pivot: [0.5 * VF, 15 * VF, 0.5 * VF], anim: 'squish', period: 2.8 });
  sq(top.f, 0, 17, 0, COLS[(5 + v) % 6], 1);
  top.f.set(-1, 17, 2, null); top.f.set(1, 17, 2, null); top.f.set(-1, 17, 3, 0x2a1a20); top.f.set(1, 17, 3, 0x2a1a20);
  // two escaped balls on the ground
  sq(f, 6, 2, 6, COLS[(3 + v) % 6], 1);
  sq(f, -7, 2, 5, COLS[(1 + v) % 6], 0);
  sparkle(d, -3, 18, 3, { period: 3.6, phase: 0.8, col: 0xffe0f0 });
}

// ================================================================ PR BILLBOARD (2x1)
// A big ad on stilts: a smiling bear in a suit giving a thumbs up, "YUM!" and five stars.
function prboard(d, rnd) {
  const { c, f, gf } = d;
  const X0 = -19, X1 = 18, Y0 = 18, Y1 = 41;
  // posts + braces (coarse)
  for (const x of [-7, 6]) {
    c.box(x, 0, -1, x, 20, -1, (xx, y) => (y % 5 === 0 ? WOOD_D : WOOD_M));
    c.box(x - 1, 0, -2, x + 1, 0, 0, STONE[1]);
  }
  c.line(-7, 2, -1, -2, 8, -1, WOOD_D); c.line(6, 2, -1, 1, 8, -1, WOOD_D);
  // ladder on the left post (fine)
  for (let y = 1; y <= 16; y++) { f.set(-17, y, -1, WOOD_D); f.set(-17, y, 1, WOOD_D); if (y % 3 === 0) f.set(-17, y, 0, HONEY[2]); }
  // board backing + frame
  f.box(X0, Y0, -1, X1, Y1, -1, WOOD_D);
  // poster art
  const hx = -8, hy = 31; // bear head centre (voxel corner)
  const art = (x, y) => {
    const dx = x + 0.5 - hx, dy = y + 0.5 - hy;
    const rh = Math.hypot(dx, dy);
    // ears
    for (const ex of [-13, -3]) {
      const er = Math.hypot(x + 0.5 - ex, y + 0.5 - 37);
      if (er < 1.3) return 0xf0a0a0;
      if (er < 2.5) return 0x8a5a3a;
    }
    if (rh < 6.2) {
      // face
      const mr = Math.hypot((x + 0.5 - hx) / 3.3, (y + 0.5 - 28.6) / 2.3);
      if ((y === 32 && (x === -12 || x === -10 || x === -6 || x === -4)) || (y === 33 && (x === -11 || x === -5))) return 0x2a1a14; // happy eyes
      if (y === 30 && (x === -14 || x === -2)) return 0xf09090; // cheeks
      if (y === 30 && (x === -9 || x === -8)) return 0x1a1010; // nose
      if (y === 29 && (x === -9 || x === -8)) return 0x6a3a2a;
      if ((y === 28 && (x === -11 || x === -6)) || (y === 27 && x >= -10 && x <= -7)) return 0x5a1a14; // smile
      if (y === 28 && x >= -10 && x <= -7) return 0xd85a6a;
      if (mr < 1) return 0xf0d8b0;
      if (rh > 5.2 && dy < -2) return 0x6a4428;
      if (dx < -2 && dy > 2) return 0xa06a44;
      return 0x8a5a3a;
    }
    // suit body (trapezoid) + shirt V + red tie
    const bw = 7 - (y - Y0) * 0.25;
    if (y <= 25 && Math.abs(x + 0.5 - hx) < bw) {
      const vw = (y - 20) * 0.6;
      if (Math.abs(x + 0.5 - hx) < vw) {
        if (Math.abs(x + 0.5 - hx) < 0.9 && y < 25) return y === 24 ? 0xa82a22 : RED;
        return WHITE;
      }
      return (x + y) % 7 === 0 ? 0x34508a : 0x2a3a6a;
    }
    // thumbs up paw on the right
    if (x >= -1 && x <= 1 && y >= 22 && y <= 25) return x === -1 ? WHITE : 0x8a5a3a;
    if (x === 0 && y >= 26 && y <= 27) return 0xa06a44;
    // stars, YUM!, a plate of fish
    return null;
  };
  const RIGHT = new VoxelModel();
  text(RIGHT, 'YUM!', 1, 39, 0, 0xe03a3a);
  for (let i = 0; i < 5; i++) pix(RIGHT, ['.#.', '###', '#.#'], -1 + i * 4, 32, 0, { '#': 0xffc83a });
  // plate of fish
  for (let x = 2; x <= 14; x++) RIGHT.set(x, 21, 0, x === 2 || x === 14 ? 0xd8d8d0 : WHITE);
  for (let x = 3; x <= 13; x++) RIGHT.set(x, 22, 0, x < 5 || x > 11 ? WHITE : 0xf09a5a);
  for (let x = 5; x <= 11; x++) RIGHT.set(x, 23, 0, x === 6 ? 0x1a1a1a : 0xf8b070);
  RIGHT.set(4, 23, 0, 0xf09a5a); RIGHT.set(12, 23, 0, 0xf09a5a); RIGHT.set(13, 24, 0, 0xf09a5a); RIGHT.set(13, 22, 0, 0xf09a5a);
  RIGHT.set(8, 24, 0, 0x6ab04a); RIGHT.set(9, 25, 0, 0x6ab04a); // herb sprig
  for (let x = 6; x <= 10; x += 2) { RIGHT.set(x, 26, 0, 0xffffff); RIGHT.set(x + 1, 27, 0, 0xe8f0f8); } // steam
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const frame = x === X0 || x === X1 || y === Y0 || y === Y1;
      let col;
      if (frame) col = (x + y) % 2 ? HONEY[0] : HONEY[2];
      else {
        col = art(x, y) ?? RIGHT.get(x, y, 0);
        if (col == null) {
          if (y <= Y0 + 2) col = (x + y) % 3 ? 0x6ab04a : 0x7ac05a; // grass strip
          else { const a = Math.atan2(y + 0.5 - hy, x + 0.5 - hx); col = Math.floor((a + PI) / (TAU / 18)) % 2 ? 0x8fd4f4 : 0xb8e6fa; }
        }
      }
      f.set(x, y, 0, col);
    }
  // catwalk under the board + paste bucket and brush
  f.box(X0 + 1, Y0 - 1, 0, X1 - 1, Y0 - 1, 3, (x, y, z) => (z === 3 ? WOOD_D : HONEY[(x + 40) % 3]));
  for (const x of [-12, 0, 12]) f.line(x, Y0 - 2, 1, x, Y0 - 4, -1, IRON);
  rbox(f, 9, 11, Y0, Y0 + 2, 1, 3, 0.8, (x, y) => (y === Y0 + 2 ? WHITE : METAL)); f.line(10, Y0 + 3, 2, 12, Y0 + 6, 1, WOOD_M); f.set(12, Y0 + 6, 1, 0xd8c8a0);
  // two goose-neck lamps over the top
  for (const x of [-11, 10]) {
    f.set(x, Y1 + 1, -1, IRON); f.set(x, Y1 + 2, 0, IRON); f.set(x, Y1 + 2, 1, IRON);
    f.box(x - 1, Y1 + 2, 2, x + 1, Y1 + 3, 3, 0x2a5a3a);
    gf.box(x - 1, Y1 + 1, 2, x + 1, Y1 + 1, 3, 0xfff0b0);
  }
  // flowers at the post feet + grass
  for (const [x, z] of [[-17, 3], [-12, 4], [13, 3], [16, 2]]) { f.set(x, 0, z, LEAF[1]); f.set(x, 1, z, LEAF[0]); f.set(x, 2, z, pick(rnd, P.FLOWERS)); }
  tufts(c, rnd, 12, { w: 2, d: 1 }, (x, z) => z >= -2 && z <= 0 && (Math.abs(x + 7) < 2 || Math.abs(x - 6) < 2));
  sparkle(d, 3, 34, 1, { period: 3.2 });
  sparkle(d, 15, 31, 1, { period: 3.8, phase: 1.5 });
}

// ================================================================ FRANCHISE STATUE (2x2)
// Solid gold Reynard (top hat, monocle, money bag, paw on hip) on a marble
// pedestal with a brass "REYNARD" plaque, velvet ropes and a red carpet.
function franchise(d, rnd) {
  const { c, f } = d;
  const MARBLE = [0xf2eee8, 0xe6e1da, 0xfaf8f4];
  const VEIN = 0xc8bcc8, MARBLE_D = 0xd0c8c4;
  const M = (x, y, z) => (hv(x + z, y, z - x, 9) < 0.07 ? VEIN : toneOf(MARBLE, x, y, z, 5));
  // pedestal (coarse): two steps, fluted column, cap. Top = 0.7 (fine y 14)
  c.box(-10, 0, -10, 9, 0, 9, (x, y, z) => (x === -10 || x === 9 || z === -10 || z === 9 ? MARBLE_D : M(x, y, z)));
  c.box(-9, 1, -9, 8, 1, 8, M);
  c.box(-7, 2, -7, 6, 5, 6, (x, y, z) => {
    const e = x === -7 || x === 6 ? z : z === -7 || z === 6 ? x : 99;
    if (e !== 99 && (e + 20) % 2 === 0 && y > 2) return MARBLE_D; // fluting
    return y === 2 ? MARBLE_D : M(x, y, z);
  });
  c.box(-8, 6, -8, 7, 6, 7, (x, y, z) => (x === -8 || x === 7 || z === -8 || z === 7 ? MARBLE_D : M(x, y, z)));
  // brass plaque, text flush with the plate
  f.box(-15, 5, 14, 14, 11, 14, (x, y) => (x === -15 || x === 14 || y === 5 || y === 11 ? BRASS_D : BRASS));
  text(f, 'REYNARD', -14, 10, 14, 0x4a2a08);
  // red carpet up the front step, velvet ropes round the sides and back
  c.box(-3, 1, 7, 2, 1, 9, (x, y, z) => (x === -3 || x === 2 ? 0xe8c040 : z & 1 ? 0xb82a2a : 0xc83a34));
  c.box(-3, 0, 9, 2, 0, 9, (x) => (x === -3 || x === 2 ? 0xe8c040 : 0xc83a34));
  for (const [x, z] of [[-9, -9], [8, -9], [-9, 8], [8, 8]]) { c.box(x, 2, z, x, 4, z, BRASS); c.set(x, 5, z, BRASS_L); }
  for (let i = -8; i <= 7; i++) { c.set(i, 4, -9, 0xa01a2a); c.set(-9, 4, i, 0xa01a2a); c.set(8, 4, i, 0xa01a2a); }
  for (const i of [-4, 3]) { c.set(i, 3, -9, 0xa01a2a); c.set(-9, 3, i, 0xa01a2a); c.set(8, 3, i, 0xa01a2a); }
  // coins tossed onto the steps + a bouquet
  for (const [x, z, n] of [[-12, 16, 1], [9, 17, 2], [13, 15, 1], [-16, 17, 2], [-8, 16, 1]]) coinStack(f, x, 4, z, n, rnd);
  f.box(11, 4, 14, 12, 4, 15, LEAF[1]); f.set(11, 5, 14, 0xe8344a); f.set(12, 5, 15, 0xf06a8a); f.set(12, 5, 14, WHITE); f.set(11, 5, 15, 0xf2c230);
  // ---- the statue (fine). Tones per part keep it readable while all gold.
  const S = new VoxelModel();
  const B = 14;
  const FUR = GOLD_L, CRM = GOLD_LL, COAT = GOLD, HAT = GOLD_D, DET = GOLD_DD;
  // feet + legs
  rbox(S, -5, -2, B, B + 1, -2, 3, 0.8, COAT); rbox(S, 1, 4, B, B + 1, -2, 3, 0.8, COAT);
  rbox(S, -4, -2, B + 2, B + 5, -1, 1, 0.8, FUR); rbox(S, 1, 3, B + 2, B + 5, -1, 1, 0.8, FUR);
  // coat tails, coat, waistcoat belly, chest fluff
  S.box(-4, B + 3, -4, -2, B + 8, -4, HAT); S.box(1, B + 3, -4, 3, B + 8, -4, HAT);
  rbox(S, -5, 4, B + 5, B + 15, -4, 3, 1.8, COAT);
  rbox(S, -4, 3, B + 7, B + 13, 0, 4, 2, (x, y, z) => (z >= 3 && Math.abs(x + 0.5) <= (y - (B + 9)) * 0.7 ? CRM : COAT));
  S.set(-1, B + 9, 4, DET); S.set(0, B + 9, 4, DET); S.set(-1, B + 11, 4, DET); S.set(0, B + 11, 4, DET);
  // bow tie
  for (let y = B + 14; y <= B + 15; y++) { for (const x of [-4, -3, -2, 1, 2, 3]) S.set(x, y, 4, DET); S.set(-1, y, 5, HAT); S.set(0, y, 5, HAT); }
  // head, cream cheeks, muzzle, nose, cheek tufts
  rbox(S, -7, 6, B + 16, B + 27, -6, 5, 2.4, (x, y, z) => (y <= B + 19 && z >= 0 ? CRM : FUR));
  for (let z = 6; z <= 9; z++) for (let x = -3; x <= 2; x++) for (let y = B + 16; y <= B + 19; y++) {
    if (z >= 8 && y === B + 19 && (x === -3 || x === 2)) continue;
    S.set(x, y, z, y === B + 19 ? FUR : CRM);
  }
  S.box(-1, B + 19, 9, 0, B + 19, 10, DET); S.box(-1, B + 18, 10, 0, B + 18, 10, DET);
  for (const s of [-1, 1]) { const X = s < 0 ? -8 : 7; S.box(X, B + 16, 1, X, B + 18, 3, CRM); S.set(X + s, B + 17, 2, CRM); }
  // eyes (deep, with a lighter glint) + a smug brow
  for (const ex of [-5, 3]) { S.box(ex, B + 21, 5, ex + 1, B + 23, 5, DET); S.set(ex, B + 23, 5, CRM); }
  S.box(3, B + 24, 5, 5, B + 24, 5, HAT);
  // ears poke out beside the hat brim (lean out), darker inside, dark tips
  for (const s of [-1, 1]) {
    for (let k = 0; k < 10; k++) {
      const w = k < 4 ? 4 : k < 6 ? 3 : k < 8 ? 2 : 1;
      const lean = Math.floor(k / 4);
      for (let i = 0; i < w; i++) {
        const xi = s < 0 ? -8 - lean + i : 7 + lean - i;
        for (let z = -2; z <= 0; z++) S.set(xi, B + 25 + k, z, k >= 8 ? DET : z === 0 && i > 0 && i < w - 1 && k < 7 ? HAT : FUR);
      }
    }
  }
  // top hat: brim, crown with a band, flared lip
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 4; z++) if (Math.hypot((x + 0.5) / 6, (z + 1) / 5.2) <= 1) S.set(x, B + 28, z, HAT);
  for (let y = B + 29; y <= B + 36; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -5; z <= 2; z++) {
        if ((x === -4 || x === 3) && (z === -5 || z === 2)) continue;
        S.set(x, y, z, y <= B + 30 ? DET : HAT);
      }
  for (let x = -4; x <= 3; x++) { S.set(x, B + 36, 3, HAT); S.set(x, B + 36, -6, HAT); }
  for (let z = -5; z <= 2; z++) { S.set(-5, B + 36, z, HAT); S.set(4, B + 36, z, HAT); }
  // monocle ring over his right eye (-x) + chain to the waistcoat
  pix(S, ['.####.', '#....#', '#....#', '#....#', '#....#', '.####.'], -7, B + 25, 6, { '#': CRM });
  S.line(-7, B + 20, 6, -3, B + 12, 5, HAT);
  // right arm out to the money bag, left paw on the hip
  S.line(-6, B + 14, 0, -9, B + 12, 1, COAT, 1);
  S.box(-11, B + 11, 0, -9, B + 13, 2, FUR);
  S.line(5, B + 14, 0, 8, B + 11, 0, COAT, 1); S.line(8, B + 11, 0, 5, B + 8, 2, COAT, 1); S.box(4, B + 7, 2, 6, B + 9, 3, FUR);
  // the money bag with an engraved "$"
  rbox(S, -16, -9, B + 1, B + 9, -1, 5, 2.6, COAT);
  S.box(-14, B + 10, 1, -11, B + 10, 3, DET); S.box(-14, B + 11, 1, -11, B + 12, 3, COAT); S.set(-15, B + 12, 2, COAT); S.set(-10, B + 12, 2, COAT);
  pix(S, ['.#.', '###', '#..', '###', '..#', '###', '.#.'], -14, B + 8, 5, { '#': DET });
  // big bushy tail curling round his left side, cream tip
  const TAIL = [[2, B + 4, -6, 2.6], [5, B + 5, -6, 3], [8, B + 7, -4, 3.3], [10, B + 10, -2, 3.2], [11, B + 13, 0, 2.9], [11, B + 16, 1, 2.4]];
  TAIL.forEach(([x, y, z, r], i) => ball(S, x + 0.5, y + 0.5, z + 0.5, r, i >= 5 ? CRM : FUR));
  // subtle polish: lighter where it faces up, deeper underneath
  S.paint((x, y, z, col) => {
    if (col === DET) return col;
    if (!S.has(x, y + 1, z) && !S.has(x - 1, y, z)) return mix(col, 0xffffff, 0.3);
    if (!S.has(x, y - 1, z)) return shade(col, 0.88);
    return hv(x, y, z, 2) < 0.1 ? shade(col, 0.94) : col;
  });
  f.merge(S);
  // shine
  sparkle(d, -4, B + 39, 2, { period: 2.6, big: true });
  sparkle(d, -6, B + 24, 7, { period: 3.4, phase: 1.3, col: 0xffffff });
  sparkle(d, -15, B + 8, 6, { period: 3.0, phase: 2.0 });
  sparkle(d, 12, B + 18, 2, { period: 3.7, phase: 0.7 });
  sparkle(d, 13, 15, 15, { period: 4.2, phase: 2.9 });
}

// ================================================================ TAG RACK (1x1)
// A wooden rack of red "DO NOT EAT" fish tags that sway on their strings.
function tagrack(d, rnd) {
  const f = d.f;
  // posts + feet
  for (const x0 of [-10, 8]) {
    f.box(x0, 0, -1, x0 + 1, 31, 0, (x, y) => (y === 31 ? LOG_END : x === x0 ? HONEY[1] : HONEY[0]));
    f.box(x0 - 1, 0, -4, x0 + 2, 1, 3, (x, y, z) => (y === 1 ? HONEY[2] : WOOD_M));
  }
  // header sign
  f.box(-11, 17, 1, 10, 30, 1, (x, y) => (x === -11 || x === 10 || y === 17 || y === 30 ? WOOD_M : PAPER));
  f.box(-11, 17, 0, 10, 30, 0, WOOD_D);
  text(f, 'DO NOT', -10, 28, 2, RED);
  text(f, 'EAT!', -7, 22, 2, RED);
  f.box(-10, 23, 2, 9, 23, 2, null);
  // dowel + swinging tags
  f.box(-8, 14, 1, 7, 14, 1, WOOD_M);
  [-6, -2, 2, 6].forEach((cx, i) => {
    const t = d.part({ pivot: [(cx + 0.5) * VF, 14 * VF, 1.5 * VF], anim: 'sway', axis: 'z', amp: 0.16, speed: 1.6 + i * 0.13, phase: i * 1.7 });
    t.f.set(cx, 13, 1, TWINE);
    pix(t.f, ['.#.', '#o#', '###', '#w#', '.w.', '#w#', '###'], cx - 1, 12, 1, { '#': RED, o: WHITE, w: WHITE });
    t.f.set(cx - 1, 6, 1, RED_D); t.f.set(cx + 1, 6, 1, RED_D);
    t.f.box(cx - 1, 6, 0, cx + 1, 12, 0, RED_D);
  });
  // shelf with a stack of spare tags, twine ball and a pencil
  f.box(-8, 3, -2, 7, 3, 2, (x) => HONEY[(x + 30) % 3]);
  for (let y = 4; y <= 6; y++) f.box(-6, y, -1, -4, y, 1, (x, yy, z) => (z === 1 ? (y % 2 ? WHITE : RED) : RED_D));
  ball(f, 1.5, 6, 0, 1.7, (x, y, z) => ((x + y + z) & 1 ? TWINE : 0xb88a58));
  f.line(4, 4, 1, 7, 4, 0, 0xf2c230); f.set(7, 4, 0, 0xf09ab0); f.set(3, 4, 1, 0x2a2a2a);
  ftufts(f, rnd, 16, { w: 1, d: 1 }, (x, z) => z >= -4 && z <= 3 && (x <= -7 || x >= 6));
}

// ================================================================ FEED SILO (1x1)
// Corrugated mini silo with a red cone roof, fish-vane, ladder and a feed chute.
function feedsilo(d, rnd) {
  const { c, f } = d;
  const CX = -0.5, CZ = -1.5, R = 3.3;
  c.cylinder(CX, 0, CZ, R + 0.6, 1, () => pick(rnd, STONE));
  for (let y = 1; y <= 12; y++)
    for (let x = -5; x <= 4; x++)
      for (let z = -6; z <= 3; z++) {
        const r = Math.hypot(x - CX, z - CZ);
        if (r > R + 0.3) continue;
        const a = Math.atan2(z - CZ, x - CX);
        const rib = Math.floor(((a + PI) / TAU) * 22) % 2;
        let col = rib ? METAL : METAL_L;
        if (y === 5 || y === 10) col = rib ? METAL_D : IRON_L;
        if (y === 1) col = METAL_D;
        c.set(x, y, z, col);
      }
  // roof cone + vent
  [[13, R + 0.9], [14, R - 0.1], [15, R - 1.1], [16, R - 2.1]].forEach(([y, r]) =>
    c.cylinder(CX, y, CZ, r, 1, (x, yy, z) => (Math.hypot(x - CX, z - CZ) > r - 0.8 ? RED_D : (x + z + y) % 3 === 0 ? 0xc03428 : RED)));
  c.set(-1, 17, -2, METAL_D); c.set(0, 17, -2, METAL_D); c.set(-1, 17, -1, METAL_D); c.set(0, 17, -1, METAL_D);
  // painted fish on a white panel (fine) on the front
  const pz = 2 * Math.round(CZ + R) + 1;
  f.box(-5, 12, pz, 4, 17, pz, (x, y) => (x === -5 || x === 4 || y === 12 || y === 17 ? 0xe8e4dc : WHITE));
  pix(f, ['..##..#', '.####.#', '#o#####', '.####.#', '..##..#'], -4, 16, pz + 1, { '#': 0xf08a3a, o: 0x1a1a1a });
  // ladder on the left (fine)
  for (let y = 2; y <= 27; y++) { f.set(-9, y, -5, IRON_L); f.set(-9, y, -1, IRON_L); if (y % 3 === 0) f.box(-9, y, -4, -9, y, -2, METAL_D); }
  // chute: hopper spout -> slanted pipe -> trough with pellets (front right)
  f.box(3, 8, 3, 6, 10, 5, METAL_D); f.box(4, 9, 6, 5, 9, 6, IRON);
  for (let i = 0; i <= 5; i++) f.box(4, 8 - i, 5 + Math.floor(i / 2), 5, 8 - i, 6 + Math.floor(i / 2), i === 5 ? IRON : METAL);
  f.box(1, 0, 6, 8, 2, 9, (x, y, z) => (y === 0 || x === 1 || x === 8 || z === 6 || z === 9 ? WOOD_M : null));
  const PEL = [0xd88a3a, 0xb86a2a, 0xe8a050, 0x9a5a2a];
  for (let x = 2; x <= 7; x++) for (let z = 7; z <= 8; z++) { f.set(x, 1, z, pick(rnd, PEL)); if (rnd() < 0.6) f.set(x, 2, z, pick(rnd, PEL)); }
  f.set(4, 3, 7, PEL[0]); f.set(5, 3, 8, PEL[2]);
  for (const [x, z] of [[0, 8], [-1, 9], [8, 4]]) f.set(x, 0, z, pick(rnd, PEL));
  // a feed sack leaning on the left
  rbox(f, -10, -5, 0, 7, 3, 7, 1.6, (x, y, z) => (y >= 6 ? 0xb8945a : toneOf([0xc8a46a, 0xd6b47a, 0xb8945a], x, y, z)));
  f.box(-9, 8, 4, -7, 8, 6, 0xb8945a); f.set(-8, 9, 5, TWINE);
  pix(f, ['.#.#', '####', '.#.#'], -9, 5, 8, { '#': 0x3a6ac0 });
  // fish weather vane on top (spins)
  const vane = d.part({ pivot: [CX * VC, 0, CZ * VC], anim: 'spin', axis: 'y', speed: 0.6 });
  vane.f.box(-1, 36, -3, -1, 41, -3, IRON);
  pix(vane.f, ['..##...#', '.######.', '#o#####.', '.######.', '..##...#'], -5, 44, -3, { '#': IRON_L, o: 0xffd040 });
  vane.f.set(-1, 45, -3, 0xffd040);
  ftufts(f, rnd, 14, { w: 1, d: 1 }, (x, z) => Math.hypot(x + 1, z + 3) < 9 || (x >= 0 && z >= 5));
}

// ================================================================ SHOVEL SHED (1x1)
// A little lean-to tool shed (shingled roof, door, window box) at the back;
// the star is the big shovel stuck upright in a fresh pile of dirt out front.
function shovelshed(d, rnd, v) {
  const { c, f } = d;
  const ROOF = [[0xb8503a, 0xa0402e, 0x7a3020], [0x4a8a5a, 0x3a7a4a, 0x2a5a3a], [0x4a6aa0, 0x3a5a8a, 0x2a4068]][v];
  const X0 = -5, X1 = 1, Z0 = -5, Z1 = -2;
  const RY = (z) => 9 + (Z1 - z); // roof row height, low at the front
  c.box(X0, 0, Z0, X1, 0, Z1, () => pick(rnd, STONE));
  for (let z = Z0; z <= Z1; z++)
    for (let x = X0; x <= X1; x++)
      for (let y = 1; y < RY(z); y++) {
        if (x > X0 && x < X1 && z > Z0 && z < Z1) continue;
        const corner = (x === X0 || x === X1) && (z === Z0 || z === Z1);
        c.set(x, y, z, corner ? WOOD_D : y === 1 ? WOOD_M : z === Z1 || z === Z0 ? WOOD[(x + 9) % 3] : WOOD[(z + 9) % 3]);
      }
  // shingle rows (one per step), overhanging the front and sides
  for (let z = Z0 - 1; z <= Z1 + 1; z++)
    for (let x = X0 - 1; x <= X1 + 1; x++) {
      const y = RY(Math.min(z, Z1 + 0));
      const edge = x === X0 - 1 || x === X1 + 1;
      c.set(x, z > Z1 ? RY(Z1) - 0 : y, z, edge ? ROOF[2] : (x + z) % 3 === 0 ? ROOF[1] : ROOF[0]);
      if (z > Z1) c.set(x, RY(Z1) - 1, z, null);
    }
  // door (front face = fine z -2) with a Z brace + knob, window with a flower box
  c.box(-4, 1, Z1, -2, 7, Z1, (x, y) => (y === 7 ? WOOD_D : x === -3 ? 0x7a4a2a : 0x8a5430));
  f.box(-8, 3, -2, -3, 3, -2, 0x5a3418); f.box(-8, 13, -2, -3, 13, -2, 0x5a3418); f.line(-8, 4, -2, -3, 12, -2, 0x5a3418);
  f.set(-4, 8, -2, BRASS); f.set(-4, 7, -2, BRASS_D);
  f.box(-1, 9, -2, 2, 13, -2, (x, y) => (x === -1 || x === 2 || y === 9 || y === 13 ? WHITE : 0x9ad0e8));
  f.box(0, 10, -2, 1, 12, -2, (x, y) => (x === 0 && y === 12 ? 0xe8f6ff : 0xb0dcee));
  f.box(-1, 8, -2, 2, 8, -1, WOOD_M); f.set(-1, 9, -1, 0xe8344a); f.set(1, 9, -1, 0xf2c230); f.set(0, 9, -1, LEAF[1]); f.set(2, 9, -1, LEAF[0]);
  // little shovel sign over the door
  f.box(-8, 15, -2, -4, 17, -2, PAPER);
  pix(f, ['...##', '..#..', '##...'], -8, 17, -1, { '#': WOOD_M });
  f.set(-8, 15, -1, METAL); f.set(-7, 15, -1, METAL);
  // rake leaning on the side wall
  f.line(4, 0, -4, 4, 15, -8, WOOD_M);
  f.box(3, 15, -9, 5, 15, -7, METAL_D); f.set(3, 14, -8, METAL_D); f.set(5, 14, -8, METAL_D);
  // dirt pile + the shovel standing in it
  const DIRT = [0x7a5a3a, 0x6a4a2e, 0x8a6a48];
  f.ellipsoid(4.5, 0, 4.5, 4.4, 2.8, 3.6, (x, y, z) => toneOf(DIRT, x, y, z));
  for (const [x, z] of [[-1, 6], [9, 2], [0, 3], [8, 8], [-2, 8]]) f.set(x, 0, z, DIRT[2]);
  const SZ = 6;
  const BLADE = [[6, 6], [5, 7], [4, 8], [4, 8], [4, 8], [4, 8], [4, 8]];
  BLADE.forEach(([a, b], k) => { for (let x = a; x <= b; x++) f.set(x, 1 + k, SZ, x === a ? CHROME : x === b ? METAL_D : METAL); });
  f.box(4, 8, SZ, 8, 8, SZ, METAL_D);
  f.box(6, 9, SZ, 6, 10, SZ, IRON_L);
  for (let y = 11; y <= 22; y++) f.set(6, y, SZ, y % 5 === 0 ? WOOD_D : P.WOOD_L);
  f.box(5, 23, SZ, 7, 23, SZ, WOOD_M); f.set(5, 24, SZ, WOOD_M); f.set(7, 24, SZ, WOOD_M); f.box(5, 25, SZ, 7, 25, SZ, 0x3a2a20);
  // a seedling where the last hole was filled in
  f.set(-6, 1, 5, LEAF[0]); f.set(-6, 2, 5, LEAF[3]); f.set(-7, 2, 5, LEAF[1]); f.set(-6, 0, 5, DIRT[0]);
  tufts(c, rnd, 9, { w: 1, d: 1 }, (x, z) => (x >= X0 - 1 && x <= X1 + 1 && z >= Z0 - 1 && z <= Z1 + 1) || (x >= 0 && z >= 0));
}

// ================================================================ WHISPER SHELL (1x1)
// A giant pink conch on a little wooden stand; hearts drift out of its mouth.
function whispershell(d, rnd) {
  const f = d.f;
  const SAND = [0xe8d4a8, 0xdcc498, 0xf0e0b8];
  // sand patch + pebbles + a starfish
  for (let x = -10; x <= 9; x++)
    for (let z = -8; z <= 8; z++) {
      const r = Math.hypot((x + 0.5) / 9.5, (z + 0.5) / 8);
      if (r <= 1) f.set(x, 0, z, toneOf(SAND, x, 0, z));
    }
  for (const [x, z] of [[7, 5], [-8, -4], [6, -6]]) f.set(x, 1, z, pick(rnd, STONE));
  for (const [x, z] of [[-7, 6], [-8, 6], [-6, 6], [-7, 5], [-7, 7], [-9, 7], [-5, 7], [-8, 5], [-6, 5]]) f.set(x, 1, z, x === -7 && z === 6 ? 0xf8a050 : 0xf07a3a);
  // stand: two legs each side, crossbars, a brass heart plate on the front bar
  const STAND = [0x8a5430, 0x7a4a2a, 0x9a6038];
  for (const x of [-6, 5]) for (const z of [-4, 3]) f.box(x, 1, z, x, 7, z, (xx, y) => toneOf(STAND, xx, y, z));
  f.box(-6, 7, 3, 5, 8, 3, (x, y) => (y === 8 ? HONEY[0] : STAND[1]));
  f.box(-6, 7, -4, 5, 8, -4, STAND[1]);
  for (const x of [-6, 5]) f.box(x, 8, -3, x, 8, 2, STAND[0]);
  f.box(-2, 6, 4, 1, 7, 4, BRASS); f.set(-1, 7, 4, 0xe85a7a); f.set(0, 7, 4, 0xe85a7a); f.set(-1, 6, 4, BRASS_D);
  // shell: spire to -x (whorls with dark sutures and knobs), body whorl, siphon to +x
  const CY = 14, CZ = -0.5;
  const rOf = (x) => (x <= -4 ? 1.1 + (x + 12) * 0.5 : x <= 3 ? 5.3 + Math.cos((x / 4) * (PI / 2)) * 0.5 : 5 - (x - 3) * 0.72);
  const CRM = [0xf6e2c8, 0xeed4b4, 0xfaecd8];
  const BAND = 0xd88a52, SUT = 0x9a5a3a;
  for (let x = -12; x <= 9; x++) {
    const r = rOf(x);
    const spire = x <= -4;
    for (let y = CY - 7; y <= CY + 7; y++)
      for (let z = -8; z <= 7; z++) {
        const dy = y + 0.5 - CY, dz = z + 0.5 - CZ;
        if (dy * dy + dz * dz > r * r) continue;
        let col = toneOf(CRM, x, y, z);
        if (spire) { if ((x + 12) % 3 === 0) col = SUT; else if ((x + 12) % 3 === 1) col = BAND; }
        else if (x === -1 || x === 2) col = BAND;
        else if (x === 6) col = 0xe8a070;
        f.set(x, y, z, col);
      }
  }
  // knobs on each whorl shoulder + along the body
  for (const x of [-10, -7, -4, -2, 0, 2]) { const r = rOf(x); f.set(x, CY + Math.round(r), -1, CRM[2]); f.set(x, CY + Math.round(r) + 1, -1, CRM[0]); }
  f.set(-12, CY, -1, SUT); f.set(-13, CY, -1, SUT);
  // aperture: carve the front, glossy pink throat, flared lip round it
  const AX = 2.2, AY = CY - 0.3;
  const ap = (x, y) => Math.hypot((x + 0.5 - AX) / 4.8, (y + 0.5 - AY) / 4.3);
  for (let x = -4; x <= 9; x++)
    for (let y = CY - 6; y <= CY + 6; y++) {
      const e = ap(x, y);
      if (e < 1) {
        for (let z = 0; z <= 8; z++) f.set(x, y, z, null);
        f.set(x, y, -1, e < 0.5 ? 0xb84a6a : e < 0.8 ? 0xe07090 : 0xf4a0b4);
      } else if (e < 1.35) {
        const zl = Math.round(CZ + Math.sqrt(Math.max(0, rOf(x) ** 2 - (y + 0.5 - CY) ** 2)));
        for (let z = 0; z <= zl; z++) f.set(x, y, z, z === zl ? (e < 1.15 ? 0xffc0cc : 0xffe6e6) : 0xf8b0c0);
      }
    }
  // hearts drifting out of the mouth
  const HEART = ['#.#', '###', '.#.'];
  [0, 1, 2].forEach((i) => {
    const hx = 2 + (i === 1 ? -2 : i === 2 ? 2 : 0);
    const h = d.part({ pivot: fw(hx, 17, 4), anim: 'float', period: 3.6, phase: i * 1.2, rise: 0.75, wiggle: 0.04 });
    pix(h.gf, HEART, hx - 1, 18, 4, { '#': i === 1 ? 0xff9ac0 : 0xff6aa0 });
  });
  sparkle(d, -3, CY + 4, 5, { period: 3.4, col: 0xffe8f0 });
}

// ================================================================ BEAVER TOOL BOX (1x1)
// A wooden tool chest with its lid propped open: the saw hangs on the inside
// of the lid, chisels and a pencil poke out, a big mallet leans on the front.
function toolbox(d, rnd, v) {
  const { c, f } = d;
  const PAINT = [0xc83a2a, 0x3a7ac0, 0x4a9a5a][v];
  // chest (coarse) + lid standing open at the back
  c.box(-4, 0, -2, 3, 3, 1, (x, y, z) => (y === 0 ? WOOD_D : (x === -4 || x === 3) && (z === -2 || z === 1) ? WOOD_M : y === 3 ? HONEY[2] : HONEY[(x + 9) % 3]));
  c.box(-3, 1, -1, 2, 3, 0, null);
  c.box(-3, 1, -1, 2, 1, 0, 0x5a3a20);
  c.box(-4, 4, -3, 3, 9, -3, (x, y) => (x === -4 || x === 3 || y === 9 || y === 4 ? WOOD_M : HONEY[1]));
  // painted band, brass corners + hasp, beaver-teeth emblem on the front (front face = fine z 4)
  f.box(-8, 5, 4, 7, 5, 4, PAINT);
  for (const x of [-8, 7]) { f.set(x, 7, 4, BRASS); f.set(x, 1, 4, BRASS); }
  f.box(-1, 6, 4, 0, 7, 4, BRASS_D);
  rbox(f, -3, 2, 0, 4, 4, 4, 1.0, 0x8a5a3a);
  f.box(-1, 1, 5, -1, 3, 5, WHITE); f.box(0, 1, 5, 0, 3, 5, WHITE); f.set(0, 1, 5, 0xe0dcd0);
  f.set(-2, 4, 5, 0x1a1a1a); f.set(1, 4, 5, 0x1a1a1a);
  // saw hung on the lid (lid face = fine z -4): blade with teeth below, D-handle on the right
  for (let x = -7; x <= 2; x++) {
    const top = 15, bot = 11 + Math.floor((x + 7) / 4) * 0 - (x > -2 ? 1 : 0);
    for (let y = bot; y <= top; y++) f.set(x, y, -4, y === top ? METAL : (x + y) % 7 === 0 ? 0xf4f8fc : CHROME);
    if ((x & 1) === 0) f.set(x, bot - 1, -4, METAL_D);
  }
  f.set(-7, 11, -4, null); f.set(-7, 12, -4, null);
  rbox(f, 3, 7, 9, 16, -4, -4, 0.6, (x, y) => (y === 9 ? 0x7a3a1a : 0xb0562a));
  f.box(4, 11, -4, 5, 14, -4, null);
  for (const x of [-6, 6]) f.set(x, 17, -4, IRON_L); // pegs
  // chisels (coloured handles), pencil, a rolled plan poking out of the chest
  f.box(-5, 6, -1, -5, 9, -1, (x, y) => (y >= 8 ? PAINT : METAL));
  f.box(-3, 6, 0, -3, 10, 0, (x, y) => (y >= 9 ? 0xf2c230 : METAL));
  f.box(1, 6, -1, 1, 11, -1, (x, y) => (y === 11 ? 0xf09ab0 : y === 6 ? INK : 0xf2c230));
  f.box(3, 6, -2, 4, 11, -2, (x, y) => (y === 11 ? 0x9ab0e0 : 0xe8e4f0));
  // folding ruler over the front rim
  for (let x = -6; x <= 4; x++) f.set(x, 8, 3, x % 3 === 0 ? 0x2a2a2a : 0xf8d040);
  // the mallet: round head on the ground (rings toward us), handle up against the chest
  log(f, 'z', 4, 8, 7.5, 2.5, 2.5, { bark: [0xd8b080, 0xc8a070, 0xb89060] });
  f.line(6, 5, 5, 3, 13, 4, WOOD_M); f.line(7, 5, 5, 4, 13, 4, 0x9a6a40);
  // gnawed log, shavings and nails on the ground
  for (let x = -10; x <= -5; x++) {
    const r = x === -8 ? 1.2 : x === -7 || x === -9 ? 1.8 : 2.4;
    for (let y = 0; y <= 4; y++) for (let z = 4; z <= 8; z++) if (Math.hypot(y + 0.5 - 2.5, z + 0.5 - 6.5) <= r) f.set(x, y, z, x === -10 || x === -5 ? LOG_END : x === -8 ? 0xe8c890 : toneOf(BARK, x, y, z));
  }
  for (const [x, z] of [[-4, 7], [-3, 9], [1, 6], [2, 9], [-6, 9]]) { f.set(x, 0, z, 0xf0d8a8); f.set(x + 1, 1, z, 0xe8cc98); }
  for (const [x, z] of [[0, 8], [-1, 9]]) f.set(x, 0, z, METAL);
  tufts(c, rnd, 7, { w: 1, d: 1 }, (x, z) => x >= -5 && x <= 4 && z >= -4 && z <= 4);
}

// ================================================================ GEAR STATION (1x1)
// A grinding wheel spinning on a post, two meshed brass gears, a lever and sparks.
function gearstation(d, rnd) {
  const { c, f } = d;
  // plank deck
  c.box(-5, 0, -4, 4, 0, 3, (x, y, z) => (z === 3 || z === -4 ? WOOD_D : HONEY[(x + z * 3 + 30) % 3]));
  // back panel the gears mount on + post for the wheel (fine)
  f.box(0, 2, -6, 9, 22, -5, (x, y) => (x === 0 || x === 9 || y === 22 ? WOOD_D : WOOD[(y + 30) % 3]));
  f.box(-5, 2, -5, -3, 20, -3, (x, y) => (y === 20 ? LOG_END : toneOf(BARK, x, y, 0)));
  f.box(-5, 2, -2, -3, 3, 0, WOOD_D);
  // axle
  f.box(-5, 13, -2, -4, 14, 3, IRON);
  // water trough under the wheel
  f.box(-10, 2, 1, -1, 6, 6, (x, y, z) => (x === -10 || x === -1 || z === 1 || z === 6 || y === 2 ? WOOD_M : null));
  f.box(-9, 3, 2, -2, 5, 5, (x, y) => (y === 5 ? 0x7ac8e8 : 0x4a9ac8));
  // grinding wheel (spins round z)
  const wheel = d.part({ pivot: [-4.5 * VF, 13.5 * VF, 0], anim: 'spin', axis: 'z', speed: -2.4 });
  const SANDS = [0xb8b0a0, 0xa89f8e, 0xc8c0b0];
  gear(wheel.f, -4.5, 13.5, 0, 2, 6.2, 6.2, 0, (x, y, r) => (r > 5.3 ? 0x8a8478 : toneOf(SANDS, x, y, 0)), { hub: IRON });
  for (let k = 2; k <= 5; k++) { wheel.f.set(Math.round(-4.5 + k) - 1, 13, 3, RED); wheel.f.set(Math.round(-4.5 + k) - 1, 13, 2, RED); }
  wheel.f.set(-8, 17, 3, 0x6a645a); wheel.f.set(-2, 9, 3, 0x6a645a);
  // gears (8 and 7 teeth, meshed; ratio 8/7)
  const gA = d.part({ pivot: [5 * VF, 17 * VF, 0], anim: 'spin', axis: 'z', speed: 1.1 });
  gear(gA.f, 5, 17, -4, -3, 2.9, 3.9, 8, (x, y, r) => (r > 2.9 ? BRASS : r > 2.1 ? BRASS_D : BRASS_L), { spokes: 4 });
  const gB = d.part({ pivot: [5 * VF, 10.6 * VF, 0], anim: 'spin', axis: 'z', speed: -1.1 * (8 / 7) });
  gear(gB.f, 5, 10.6, -4, -3, 2.4, 3.4, 7, (x, y, r) => (r > 2.4 ? 0xc8763a : 0xa85a28), { phase: 0.674, hub: BRASS_D });
  // lever: pivots at the bottom right, knob rocks back and forth
  f.box(7, 2, 1, 9, 4, 3, IRON);
  const lev = d.part({ pivot: [8.5 * VF, 4.5 * VF, 2.5 * VF], anim: 'sway', axis: 'z', amp: 0.3, speed: 1.3 });
  lev.f.box(8, 5, 2, 8, 14, 2, METAL);
  ball(lev.f, 8.5, 16, 2.5, 1.6, RED);
  lev.f.set(7, 16, 3, RED_L);
  // an axe resting with its edge on the wheel, sparks flying off
  f.line(-10, 2, 4, -9, 9, 3, WOOD_M);
  f.box(-11, 9, 3, -9, 11, 3, METAL_D); f.set(-11, 11, 3, CHROME); f.set(-11, 10, 3, CHROME);
  const SPK = [0xffe070, 0xffb030, 0xfff4b0];
  [0, 1, 2].forEach((i) => {
    const sx = -12 - i, sy = 12 + i;
    const sp = d.part({ pivot: fw(sx, sy, 3), anim: 'glint', period: 0.55 + i * 0.13, phase: i * 0.21 });
    sp.gf.set(sx, sy, 3, SPK[i]); sp.gf.set(sx - 1, sy + 1, 3, SPK[(i + 1) % 3]); sp.gf.set(sx + 1, sy + 2, 4, SPK[2]);
  });
  // spare gear + tooth file on the deck
  gear(f, 3.5, 3.5, 4, 4, 1.6, 2.4, 5, 0xc8763a, { hub: 0xa85a28 });
  f.box(3, 2, 6, 6, 3, 7, (x, y, z) => (x === 6 ? WOOD_M : METAL_D));
  tufts(c, rnd, 6, { w: 1, d: 1 }, (x, z) => z >= -4 && z <= 3);
}

// ================================================================ BEAVER BED (1x1)
// Log bed with a patchwork quilt, fluffy pillow, plush fish and a bedside candle.
function beaverbed(d, rnd, v) {
  const { c, f } = d;
  const QUILT = [
    [0xd8604a, 0xf2c230, 0x6aa0d8, 0xf6e6c8, 0x8ac06a],
    [0x8a6ad8, 0xf09ab0, 0xf6e6c8, 0x5ab0a0, 0xf2c230],
    [0x3a6ac0, 0xd8d0b8, 0xc83a2a, 0x4a8a5a, 0xf2c230],
  ][v];
  // posts (coarse logs w/ end grain), headboard + footboard logs, side rails
  for (const [x, z, h] of [[-5, -5, 10], [4, -5, 10], [-5, 3, 6], [4, 3, 6]]) {
    for (let y = 0; y < h; y++) c.set(x, y, z, toneOf(BARK, x, y, z));
    c.set(x, h, z, LOG_END);
  }
  for (let y = 4; y <= 8; y++) c.box(-4, y, -5, 3, y, -5, (x) => (y === 8 ? HONEY[2] : toneOf(BARK, x, y, 1)));
  c.box(-4, 6, -5, 3, 6, -5, (x) => (x === -1 || x === 0 ? LOG_END : toneOf(BARK, x, 6, 2)));
  for (let y = 3; y <= 4; y++) c.box(-4, y, 3, 3, y, 3, (x) => toneOf(BARK, x, y, 3));
  for (const x of [-5, 4]) c.box(x, 1, -4, x, 2, 2, (xx, y, z) => toneOf(BARK, xx, y, z));
  // mattress (straw ticking)
  c.box(-4, 2, -4, 3, 3, 2, (x, y, z) => (y === 2 ? 0xc8a868 : (x & 1 ? 0xf0e6cc : 0xd8c8a8)));
  // pillow (fine), sheet fold, quilt with patchwork draping over the sides
  rbox(f, -6, 5, 8, 11, -9, -6, 1.4, (x, y) => (y >= 10 ? WHITE : 0xe8e4dc));
  f.box(-1, 11, -8, 0, 11, -7, 0xdcd8d0);
  f.box(-8, 8, -5, 7, 8, -4, (x) => (x % 2 ? WHITE : 0xeae6de));
  for (let x = -9; x <= 8; x++)
    for (let z = -3; z <= 6; z++) {
      const side = x === -9 || x === 8, front = z === 6;
      const ptc = QUILT[Math.floor(hv(Math.floor((x + 10) / 3), 0, Math.floor((z + 4) / 3), v) * QUILT.length)];
      const seam = (x + 10) % 3 === 0 || (z + 4) % 3 === 0;
      const col = seam ? shade(ptc, 0.88) : ptc;
      if (!side && !front) f.set(x, 8, z, col);
      if (side) for (let y = 4; y <= 8; y++) f.set(x, y, z, y === 4 ? shade(ptc, 0.8) : col);
      if (front && !side) for (let y = 5; y <= 8; y++) f.set(x, y, z, y === 5 ? shade(ptc, 0.8) : col);
    }
  // the sleeper's lump under the quilt + plush fish toy
  rbox(f, -4, 3, 9, 10, -3, 3, 1.5, (x, y, z) => QUILT[Math.floor(hv(Math.floor((x + 10) / 3), 0, Math.floor((z + 4) / 3), v) * QUILT.length)]);
  pix(f, ['.##..#', '#o####', '.##..#'], 2, 12, 2, { '#': 0xff9a5a, o: 0x1a1a1a });
  f.box(3, 11, 1, 6, 11, 1, 0xf08a4a);
  // bedside candle on the left headboard post (fine top of post = y 22)
  f.box(-10, 22, -10, -9, 22, -9, BRASS);
  f.box(-10, 23, -10, -10, 25, -10, 0xf6eedc);
  const fl = d.part({ pivot: [-9.5 * VF, 26 * VF, -9.5 * VF], anim: 'flicker', speed: 9 });
  fl.gf.set(-10, 26, -10, FLAME[1]); fl.gf.set(-10, 27, -10, FLAME[0]);
  // floating z's
  [0, 1].forEach((i) => {
    const z = d.part({ pivot: fw(-4 + i * 4, 12, -7), anim: 'float', period: 3.2, phase: i * 1.6, rise: 0.6, wiggle: 0.05 });
    pix(z.gf, ['###', '.#.', '###'], -5 + i * 4, 13, -7, { '#': i ? 0xb8ccff : 0xd8e4ff });
  });
  // fuzzy slippers on the rug
  f.box(-6, 0, 7, -2, 0, 9, (x, y, z) => ((x + z) & 1 ? 0xb85a3a : 0xc86a48));
  for (const x0 of [-5, -3]) { f.box(x0, 1, 7, x0, 1, 9, 0xf09ab0); f.set(x0, 2, 7, 0xffc0d0); }
  tufts(c, rnd, 5, { w: 1, d: 1 }, (x, z) => z <= 4 && x >= -5 && x <= 4);
}

// ---------------------------------------------------------------- export
export const FACILITY_FOOTPRINTS = { prboard: { w: 2, d: 1 }, franchise: { w: 2, d: 2 } };
export const FACILITY_TYPES = [
  'tipjar', 'pricesign', 'waitbench', 'stressbin', 'prboard', 'franchise',
  'tagrack', 'feedsilo', 'shovelshed', 'whispershell',
  'toolbox', 'gearstation', 'beaverbed',
];
export const STRUCTURE_MODELS = defineModels({
  tipjar, pricesign, waitbench, stressbin, prboard, franchise,
  tagrack, feedsilo, shovelshed, whispershell,
  toolbox, gearstation, beaverbed,
}, FACILITY_FOOTPRINTS);
