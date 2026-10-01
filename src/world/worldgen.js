// Procedural Canadian valley. A meadow and pond (your land) sit in the middle
// of a huge forest that you can clear with beavers. A snowy mountain lies to
// the north, with the Bear St. office on a plateau and a switchback trail
// down to the meadow. The forest hides biomes and landmarks:
//   - a river running down from the mountain on the east, with a lumberjack
//     hut and a bridge
//   - a swamp to the south-west, with puddles, cypress and a stilted shack
//   - a glowing mushroom forest to the south-east, with a mushroom hut
//   - the Great Willow on a hill to the west, with a little shrine
//   - a fire watch tower in the north-west foothills
import { Grid, KIND, FLOOR_DEEP, FLOOR_SHALLOW } from './grid.js';
import { fbm2, hash2, mulberry32, clamp } from '../core/rng.js';

export const WORLD_W = 140;
export const WORLD_H = 118;
export const MEADOW = { x0: 48, x1: 92, z0: 21, z1: 55 };
export const OFFICE = { x: 70, z: 5.5, h: 14 };
export const HUT = { x: 77, z: 41 }; // top-left tile of 3x3 hut
export const TRAIL_WAYPOINTS = [
  [70, 9.2],
  [81, 10.5],
  [59, 13.2],
  [79, 16.2],
  [64, 19.2],
  [70, 22.5],
];
// region of the map where the pond water simulation runs (tiles)
export const SIM_RECT = { x0: 30, x1: 112, z0: 20, z1: 92 };

// biome ids (grid.biome)
export const BIOME = { FOREST: 0, SWAMP: 1, MUSHROOM: 2, WILLOW: 3, ALPINE: 4, RIVER: 5 };

// Landmarks: discovered by clearing the forest up to them. x/z = top-left tile.
export const LANDMARKS = [
  { id: 'firetower', name: 'Fire Watch Tower', x: 24, z: 25, w: 2, d: 2, biome: BIOME.FOREST },
  { id: 'lumberhut', name: 'Lumberjack Hut', x: 106, z: 40, w: 3, d: 3, biome: BIOME.FOREST },
  { id: 'willowshrine', name: 'The Great Willow', x: 21, z: 47, w: 2, d: 2, biome: BIOME.WILLOW },
  { id: 'mushhut', name: 'Mushroom Hut', x: 87, z: 93, w: 2, d: 2, biome: BIOME.MUSHROOM },
  { id: 'swampshack', name: 'Swamp Shack', x: 27, z: 88, w: 3, d: 2, biome: BIOME.SWAMP },
];
export const WILLOW = { x: 21, z: 43 }; // the Great Willow trunk tile
const SWAMP = { x: 30, z: 86, r: 19 };
const MUSH = { x: 88, z: 95, r: 16 };
const WILLOW_HILL = { x: 21.5, z: 45, r: 6.5 };
const TOWER_HILL = { x: 25, z: 26, r: 5 };
export const RIVER = [
  [106, 20], [104, 26], [100, 34], [101.5, 44], [98, 54], [102, 64], [109, 75], [106, 87], [112, 100], [116, 112], [118, 118],
];

function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

function mountainH(x, z) {
  if (z >= 21.5) return 0;
  const t = clamp((21.5 - z) / 19.5, 0, 1);
  let h = Math.pow(t, 1.25) * 16.5;
  const lat = Math.abs(x - 70) / 70;
  h *= 1 - 0.2 * lat * lat;
  h += (fbm2(x * 0.18, z * 0.18, 7) - 0.5) * 5 * t;
  // jagged peaks along the range
  for (const [px, pz, r, a] of [[53, 2.5, 11, 12], [88, 2, 12, 10], [24, 3, 14, 13], [120, 3, 13, 12], [6, 6, 10, 8], [136, 7, 10, 7]]) {
    const p = Math.max(0, 1 - Math.hypot(x - px, (z - pz) * 1.3) / r);
    h += p * p * a;
  }
  return Math.max(0, h);
}

// gentle rolling forest hills, flat near the meadow, swamp and river
function forestH(x, z) {
  const dx = Math.max(MEADOW.x0 - x, x - MEADOW.x1, 0);
  const dz = Math.max(MEADOW.z0 - z, z - MEADOW.z1, 0);
  const md = Math.hypot(dx, dz);
  let h = Math.max(0, fbm2(x * 0.07, z * 0.07, 3) - 0.42) * 7;
  h *= clamp((md - 3) / 8, 0, 1);
  const sw = Math.hypot(x - SWAMP.x, z - SWAMP.z) / SWAMP.r;
  h *= clamp(sw - 0.6, 0, 1);
  h *= clamp((riverDist(x, z) - 2) / 5, 0, 1);
  const wh = Math.hypot(x - WILLOW_HILL.x, z - WILLOW_HILL.z) / WILLOW_HILL.r;
  if (wh < 1.6) h = Math.max(h * clamp(wh - 0.6, 0, 1), wh < 1 ? 1 : 0);
  const th = Math.hypot(x - TOWER_HILL.x, z - TOWER_HILL.z) / TOWER_HILL.r;
  if (th < 1.5) h = Math.max(h, (1.5 - th) * 2.4);
  return Math.min(h, 3.5);
}

export function generateWorld(seed = 1337) {
  const rnd = mulberry32(seed);
  const grid = new Grid(WORLD_W, WORLD_H);
  const { w, h } = grid;
  grid.biome = new Uint8Array(w * h);

  // --- base heights, kinds and biomes
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      const inMeadow = x >= MEADOW.x0 && x < MEADOW.x1 && z >= MEADOW.z0 && z < MEADOW.z1;
      grid.meadow[i] = inMeadow ? 1 : 0;
      let hh = inMeadow ? 0 : Math.max(mountainH(cx, cz), forestH(cx, cz));
      hh = Math.round(hh * 2) / 2;
      grid.height[i] = hh;
      let k = KIND.GRASS;
      let b = BIOME.FOREST;
      if (!inMeadow) {
        if (hh > 12.5) k = KIND.SNOW;
        else if (hh > 8.5) k = KIND.ROCK;
        else k = KIND.FOREST;
        if (z < 21) { b = BIOME.ALPINE; if (k === KIND.FOREST && fbm2(x * 0.3, z * 0.3, 11) > 0.62) k = KIND.ROCK; }
        const sw = Math.hypot(cx - SWAMP.x, (cz - SWAMP.z) * 1.15);
        if (sw < SWAMP.r + (fbm2(x * 0.2, z * 0.2, 31) - 0.5) * 6) b = BIOME.SWAMP;
        const mu = Math.hypot(cx - MUSH.x, cz - MUSH.z);
        if (mu < MUSH.r + (fbm2(x * 0.2, z * 0.2, 41) - 0.5) * 6) b = BIOME.MUSHROOM;
        const wh = Math.hypot(cx - WILLOW_HILL.x, cz - WILLOW_HILL.z);
        if (wh < WILLOW_HILL.r) { b = BIOME.WILLOW; if (wh < WILLOW_HILL.r - 1.2) k = KIND.GRASS; }
      }
      grid.kind[i] = k;
      grid.biome[i] = b;
    }

  // --- river: carved from the mountain spring down to the south edge
  for (let z = 20; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      const d = riverDist(cx, cz);
      const width = 1.35 + (fbm2(x * 0.15, z * 0.15, 51) - 0.5) * 0.8 + clamp((cz - 20) / 60, 0, 0.6);
      if (d < width && !grid.meadow[i]) {
        grid.kind[i] = KIND.WATER;
        grid.biome[i] = BIOME.RIVER;
        if (z < 21) grid.height[i] = 0;
      } else if (d < width + 1.1 && !grid.meadow[i] && grid.kind[i] === KIND.FOREST && hash2(x, z, 52) < 0.55) {
        grid.kind[i] = KIND.SAND; // pebbly banks
      }
    }

  // --- swamp puddles and mud
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (grid.biome[i] !== BIOME.SWAMP || grid.kind[i] !== KIND.FOREST) continue;
      const n = fbm2(x * 0.22, z * 0.22, 61);
      if (n > 0.6) { grid.kind[i] = KIND.WATER; grid.height[i] = 0; }
      else if (n > 0.53) grid.kind[i] = KIND.DIRT;
    }
  // stray forest puddles
  for (let z = 22; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (grid.kind[i] === KIND.FOREST && grid.biome[i] === BIOME.FOREST && grid.height[i] === 0 && hash2(x, z, 71) < 0.006) grid.kind[i] = KIND.WATER;
    }

  // --- office plateau
  for (let z = 2; z <= 9; z++)
    for (let x = OFFICE.x - 7; x <= OFFICE.x + 7; x++) {
      const i = z * w + x;
      grid.height[i] = OFFICE.h;
      grid.kind[i] = z >= 8 ? KIND.TRAIL : KIND.ROCK;
    }

  // --- trail: carve along the polyline with smoothly decreasing height
  const pts = TRAIL_WAYPOINTS;
  const segLen = [];
  let total = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const L = Math.hypot(pts[s + 1][0] - pts[s][0], pts[s + 1][1] - pts[s][1]);
    segLen.push(L);
    total += L;
  }
  const trailHeightAt = (dist) => OFFICE.h * Math.pow(1 - clamp(dist / total, 0, 1), 1.05);
  const trail = []; // sampled path for bears: [x, y, z]
  let acc = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const L = segLen[s];
    const steps = Math.ceil(L * 3);
    for (let k = 0; k <= steps; k++) {
      if (s > 0 && k === 0) continue;
      const t = k / steps;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const d = acc + L * t;
      const th = trailHeightAt(d);
      trail.push([px, th, pz]);
      for (let oz = 0; oz <= 1; oz++)
        for (let ox = 0; ox <= 1; ox++) {
          const tx = Math.floor(px + (ox - 0.5) * 0.9), tz = Math.floor(pz + (oz - 0.5) * 0.9);
          if (!grid.inb(tx, tz)) continue;
          const ti = tz * w + tx;
          if (grid.meadow[ti]) continue;
          grid.height[ti] = Math.round(th * 4) / 4;
          grid.kind[ti] = KIND.TRAIL;
          grid.deco[ti] = -1;
        }
    }
    acc += L;
  }
  for (const p of trail) {
    const tx = Math.floor(p[0]), tz = Math.floor(p[2]);
    if (grid.inb(tx, tz)) p[1] = grid.height[tz * w + tx];
  }

  // --- the pond (organic blob)
  const pcx = 67.5, pcz = 33.5;
  for (let z = MEADOW.z0; z < MEADOW.z1; z++)
    for (let x = MEADOW.x0; x < MEADOW.x1; x++) {
      const dx = (x + 0.5 - pcx) / 6.2, dz = (z + 0.5 - pcz) / 4.4;
      const wob = (fbm2(x * 0.35, z * 0.35, 5) - 0.5) * 0.5;
      if (dx * dx + dz * dz < 1 + wob) grid.kind[z * w + x] = KIND.WATER;
    }
  refreshWaterHeights(grid);

  // --- landmark footprints: flat clear ground, reserved
  for (const L of LANDMARKS) {
    let base = 0;
    for (let z = L.z; z < L.z + L.d; z++) for (let x = L.x; x < L.x + L.w; x++) base = Math.max(base, grid.height[z * w + x]);
    for (let z = L.z - 1; z <= L.z + L.d; z++)
      for (let x = L.x - 1; x <= L.x + L.w; x++) {
        if (!grid.inb(x, z)) continue;
        const i = z * w + x;
        const inside = x >= L.x && x < L.x + L.w && z >= L.z && z < L.z + L.d;
        if (grid.kind[i] === KIND.WATER && !inside) continue;
        grid.kind[i] = inside ? KIND.DIRT : KIND.GRASS;
        grid.height[i] = base;
        if (inside) grid.occ[i] = -2;
      }
  }
  // willow trunk spot is open ground
  for (let z = WILLOW.z - 1; z <= WILLOW.z + 1; z++) for (let x = WILLOW.x - 1; x <= WILLOW.x + 1; x++) grid.kind[z * w + x] = KIND.GRASS;

  // --- decorations (individual objects; forest tiles are drawn procedurally)
  const decos = [];
  const addDeco = (type, x, z, extra = {}) => {
    const i = z * w + x;
    if (grid.deco[i] >= 0) return null;
    const d = { type, x, z, rot: Math.floor(rnd() * 4), scale: 0.85 + rnd() * 0.3, variant: Math.floor(rnd() * 3), ...extra };
    grid.deco[i] = decos.length;
    decos.push(d);
    return d;
  };
  const hutX0 = HUT.x - 1, hutX1 = HUT.x + 4, hutZ0 = HUT.z - 1, hutZ1 = HUT.z + 4;
  const nearPond = (x, z, r) => {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (grid.isWater(x + dx, z + dz)) return true;
    return false;
  };
  addDeco('greatwillow', WILLOW.x, WILLOW.z, { scale: 1, rot: 0 });
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const k = grid.kind[i];
      const r = hash2(x, z, 99);
      if (grid.occ[i] === -2) continue;
      if (k === KIND.FOREST && z < 21) {
        // mountain slopes: sparse alpine conifers (individual)
        const hgt = grid.height[i];
        const dens = hgt > 5 ? 0.22 : 0.42;
        if (r < dens) addDeco(hash2(x, z, 5) < 0.6 ? 'spruce' : hgt < 3 && hash2(x, z, 6) < 0.3 ? 'birch' : 'pine', x, z, { far: true });
        continue;
      }
      if (k === KIND.FOREST) {
        // forest tiles carry procedural trees; the odd boulder instead
        if (r < 0.025) addDeco('boulder', x, z, { far: true });
        continue;
      }
      if (k === KIND.ROCK && r < 0.08) addDeco('boulder', x, z, { far: true });
      else if (k === KIND.GRASS && grid.meadow[i]) {
        const inHut = x >= hutX0 && x <= hutX1 && z >= hutZ0 && z <= hutZ1;
        const inCorridor = Math.abs(x + 0.5 - 70) < 3.5 && z < 30; // path from trail to pond
        if (inHut || inCorridor || nearPond(x, z, 2)) continue;
        const rim = Math.min(x - MEADOW.x0, MEADOW.x1 - 1 - x, MEADOW.z1 - 1 - z, z - MEADOW.z0);
        const p = rim <= 1 ? 0.3 : rim <= 3 ? 0.1 : 0.02;
        if (r < p) {
          const t = hash2(x, z, 8);
          const type = t < 0.3 ? 'maple' : t < 0.52 ? 'birch' : t < 0.8 ? 'pine' : 'spruce';
          addDeco(type, x, z);
        } else if (r < p + 0.012) addDeco('boulder', x, z);
        else if (r < p + 0.012 + (rim > 2 ? 0.07 : 0.03) && !nearPond(x, z, 3)) addDeco('weed', x, z, { variant: Math.floor(hash2(x, z, 9) * 4) });
      } else if (k === KIND.GRASS && grid.biome[i] === BIOME.WILLOW && r < 0.04) addDeco('weed', x, z, { variant: Math.floor(hash2(x, z, 9) * 4) });
    }

  // ground clutter (non-blocking): grass tufts, flowers, ferns, mushrooms
  const clutter = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const k = grid.kind[i];
      if (k !== KIND.GRASS && k !== KIND.FOREST && k !== KIND.DIRT) continue;
      // only near your land / the willow: the deep forest floor is hidden by trees
      const near = grid.meadow[i] || grid.biome[i] === BIOME.WILLOW || hash2(x, z, 7) < 0.35;
      if (!near) continue;
      const count = k === KIND.GRASS ? 2 : 1;
      const patch = fbm2(x * 0.22, z * 0.22, 41);
      const flowerKind = patch > 0.62 ? 'fireweed' : patch < 0.3 ? 'lupine' : 'daisy';
      for (let c = 0; c < count; c++) {
        const r = rnd();
        if (r > 0.5) continue;
        const t = rnd();
        let type = 'tuft';
        if (k === KIND.GRASS) {
          const flowerChance = patch > 0.62 || patch < 0.3 ? 0.3 : 0.06;
          if (t < flowerChance) type = flowerKind;
        } else if (grid.biome[i] === BIOME.MUSHROOM) type = t < 0.5 ? 'glowcap' : 'mushroom';
        else if (grid.biome[i] === BIOME.SWAMP) type = t < 0.6 ? 'swampgrass' : 'fern';
        else type = t < 0.35 ? 'fern' : t < 0.4 && grid.deco[i] < 0 ? 'mushroom' : 'tuft';
        clutter.push({ type, x: x + 0.15 + rnd() * 0.7, z: z + 0.15 + rnd() * 0.7, y: grid.height[i], rot: rnd() * Math.PI * 2 });
      }
    }

  return { grid, decos, clutter, trail, seed, canopy: [] };
}

export function refreshWaterHeights(grid) {
  const { w, h } = grid;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (grid.kind[i] !== KIND.WATER) continue;
      const b = grid.biome ? grid.biome[i] : 0;
      // swamp puddles are shallow; the river runs a little deeper mid-stream
      if (b === BIOME.SWAMP || (b === BIOME.FOREST && !grid.meadow[i])) grid.height[i] = FLOOR_SHALLOW + 0.2;
      else grid.height[i] = grid.hasLandNeighbor(x, z) ? FLOOR_SHALLOW : FLOOR_DEEP;
    }
}
