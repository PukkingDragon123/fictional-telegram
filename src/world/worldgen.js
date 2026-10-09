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
import { carveQuarry } from './quarry.js'; // [F&S mining] Flint's Quarry pit
import { extendWorld } from './forestBig.js'; // [v26 world] the big forest south of the old map edge

export const WORLD_W = 140;
// [v26 world] the map grew south (rows 118+): same width, so every saved tile
// index (z * WORLD_W + x) still points at the same tile. LEGACY_H is the old
// height: generateWorld() runs the old generator unchanged on those rows (decos,
// ruins and finds keep their indices), then forestBig.js adds the new rows.
export const LEGACY_H = 118;
export const WORLD_H = 232;
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
export const SIM_RECT = { x0: 0, x1: WORLD_W, z0: 0, z1: WORLD_H }; // [v20 water] the whole map: river, swamps and dug ponds get waves too

// biome ids (grid.biome)
export const BIOME = { FOREST: 0, SWAMP: 1, MUSHROOM: 2, WILLOW: 3, ALPINE: 4, RIVER: 5, OLDWOOD: 6, DEEP: 7, HIGHLAND: 8, MASSIF: 9 }; // [v26 world] +old wood, the Deep, the highland, the massif

// ---------------------------------------------------------------- [v26 world]
// The Deepest Zone: Mistfall Hollow, a sunken glen at the far south-west of the
// big forest. A tall waterfall drops off the Highland cliff into a quiet pond;
// a stone house sits in the grotto behind the falling water (exterior shell in
// world/deepZone.js, the turtle who lives there comes later). Tiles (x, z).
export const DEEP_ZONE = { x0: 4, x1: 70, z0: 194, z1: 228 };
// where the water leaves the cliff lip (x, z) and lands (bottom = the pond's surface)
export const WATERFALL = { x: 34, z: 193, top: 9, bottom: -0.1, land: 197.6, w: 3.2 };
export const DEEP_POND = { cx: 34, cz: 203.5, rx: 9.6, rz: 6.4 };
// the stone house in the grotto behind the falls: footprint (tiles x0..x1, z0..z1),
// floor height, and the door (it faces +z, out through the curtain of water)
export const DEEP_HOUSE = { x0: 32, x1: 36, z0: 193, z1: 194, y: 0.5, door: [34, 195.1] };
// The route there, one natural barrier after the other. Each opens with its
// research node (src/data/ext/world.js) - plus, for `trigger` barriers, your land
// touching the `near` tile - and is otherwise just terrain: water you can't
// cross, brambles / a fallen giant / a cliff ledge the beavers refuse to touch.
// Tiles are filled in by forestBig.js (grid.barrier = index + 1).
export const BARRIERS = [
  { id: 'bridge', name: 'The Broadwater', kind: 'bridge', research: 'r_xp_bridge', trigger: true, near: [45, 157], far: [45, 173], x0: 44, x1: 46,
    hint: 'Too wide to wade. Research a Rope Bridge, then clear the forest up to the river bank.' },
  { id: 'thorns', name: 'The Bramblewall', kind: 'thorns', research: 'r_xp_thorns', z0: 176, z1: 179,
    hint: 'Thorns as long as your arm. The beavers refuse. Research Bramble Hooks.' },
  { id: 'log', name: 'The Fallen Giant', kind: 'log', research: 'r_xp_saw', trigger: true, near: [54, 189], x0: 51, x1: 58, z: 190,
    hint: 'An ancient tree lies across the only way down. Research a Crosscut Saw, then clear up to it.' },
  { id: 'cliff', name: 'Heron Steps', kind: 'cliff', research: 'r_xp_ropes',
    hint: 'A goat path down the cliff. Too steep without ropes: research Climbing Ropes.' },
];
// [v26 world] the neighbours' fog pockets moved out into the woods: a deer path
// (grassy glade tiles, still forest to clear) leads from your land to each
// (see forestBig.js nearPaths). [from, to] in tiles.
export const NEAR_PATHS = [
  [[50, 50], [37.5, 62]], // Chip's tree house, west
  [[62, 55], [57.5, 79]], // Clover's garden, south
  [[80, 55], [80.5, 72.5]], // Pip's mill, south
  [[91, 53], [102.5, 75.5]], // Otis, down the river
  [[91, 26], [122.5, 28.5]], // Hazel's bakery, east over the river
];

// Landmarks: discovered by clearing the forest up to them. x/z = top-left tile.
export const LANDMARKS = [
  { id: 'firetower', name: 'Fire Watch Tower', x: 24, z: 25, w: 2, d: 2, biome: BIOME.FOREST },
  { id: 'lumberhut', name: 'Lumberjack Hut', x: 106, z: 40, w: 3, d: 3, biome: BIOME.FOREST },
  { id: 'willowshrine', name: 'The Great Willow', x: 21, z: 47, w: 2, d: 2, biome: BIOME.WILLOW },
  { id: 'mushhut', name: 'Mushroom Hut', x: 87, z: 93, w: 2, d: 2, biome: BIOME.MUSHROOM },
  { id: 'swampshack', name: 'Swamp Shack', x: 27, z: 88, w: 3, d: 2, biome: BIOME.SWAMP },
];
export const WILLOW = { x: 21, z: 43 }; // the Great Willow trunk tile
// grid.glade per forest tile: thick grove, open woodland (fewer trees) or a
// grassy glade / deer path (no trees). Every one of them stays KIND.FOREST, so
// clearing, land plots and saves work exactly as before; only the look changes.
export const GLADE = { GROVE: 0, OPEN: 1, GLADE: 2 };
// the old homestead ruin you can reach on day one (south of the meadow)
const EARLY_RUIN = { x0: 74, x1: 88, z0: 56, z1: 59 };
const RUIN_TYPES = ['ruin_chair', 'ruin_table', 'ruin_clock', 'ruin_lamp', 'ruin_cart'];
const SWAMP = { x: 30, z: 86, r: 19 };
const MUSH = { x: 88, z: 95, r: 16 };
const WILLOW_HILL = { x: 21.5, z: 45, r: 6.5 };
const TOWER_HILL = { x: 25, z: 26, r: 5 };
export const RIVER = [
  [106, 20], [104, 26], [100, 34], [101.5, 44], [98, 54], [102, 64], [109, 75], [106, 87], [112, 100], [116, 112], [118, 118],
];
// [v26 world]
// Rivers (water tiles at the water line), downstream order. `legacy`: the old
// Daisy River, carved by the old generator (only its new tail is carved here).
export const RIVERS = [
  { id: 'main', name: 'Daisy River', pts: [...RIVER.map((p) => [p[0], p[1]]), [120, 125], [118, 133], [112, 142], [104, 150.5], [96, 157.5]], w: 1.6, w1: 2.6, speed: 1.0, legacy: true },
  { id: 'wide', name: 'The Broadwater', pts: [[96, 157.5], [84, 162.5], [70, 164.5], [56, 164], [42, 165.5], [28, 166.5], [14, 165], [-2, 166]], w: 6.4, speed: 0.38 },
  { id: 'fern', name: 'Fern Brook', pts: [[-2, 127], [12, 131], [24, 130], [36, 135], [48, 139], [60, 141.5], [72, 139.5], [84, 144], [94, 149], [104.5, 151]], w: 0.95, speed: 0.8 },
  { id: 'moss', name: 'Mossy Run', pts: [[67, 120.5], [66, 127], [63, 134], [60.5, 141.5]], w: 0.7, speed: 0.9, spring: true },
  { id: 'cedar', name: 'Cedar Creek', pts: [[21, 145], [19, 151], [23, 156], [24, 160]], w: 0.75, speed: 0.85, spring: true },
  { id: 'turtle', name: 'Turtle Run', pts: [[42, 206.5], [48, 210.5], [54, 215], [57.5, 222], [60, 233]], w: 1.0, speed: 0.6 },
];
// Streams above the water line (high ground): ribbons of water over the
// terrain that cascade down every step and pour off the end. Not grid water.
export const STREAMS = [
  { id: 'falls', name: 'Mistfall Run', pts: [[-1, 183], [9, 185.5], [18, 188], [26, 190.2], [31, 191.4], [34, 192.6]], w: 0.85, speed: 1.1, fall: true },
  { id: 'snowmelt', name: 'Snowmelt Steps', pts: [[115.5, 5.5], [106, 20.6]], w: 0.55, speed: 1.4, descend: true }, // path: steepest way down (forestBig.js)
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
  const grid = new Grid(WORLD_W, LEGACY_H); // [v26 world] the old map first (unchanged), extendWorld() adds the rest
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

  carveQuarry(grid); // [F&S mining] Flint's Quarry: a flat pit in the mountain (src/world/quarry.js)

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

  // --- groves, glades and deer paths (after the decos so saved deco indices
  // never shift), then a few mossy ruin spots in little clearings
  buildGlades(grid);
  grid.ruins = placeRuins(grid);
  grid.forage = placeForage(grid);
  const forageTile = new Set(grid.forage.map((f) => f.i));

  // ground clutter (non-blocking): grass tufts, flowers, ferns, mushrooms
  const clutter = [];
  const glade = grid.glade;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const k = grid.kind[i];
      if (k !== KIND.GRASS && k !== KIND.FOREST && k !== KIND.DIRT) continue;
      // only near your land / the willow / in glades: the thick groves hide their floor
      const gl = k === KIND.FOREST ? glade[i] : 0;
      const near = grid.meadow[i] || grid.biome[i] === BIOME.WILLOW || gl > 0 || hash2(x, z, 7) < 0.35;
      if (!near || forageTile.has(i)) continue; // keep forest finds in plain sight
      const count = k === KIND.GRASS || gl === GLADE.GLADE ? 2 : gl === GLADE.OPEN ? 2 : 1;
      const patch = fbm2(x * 0.22, z * 0.22, 41);
      const flowerKind = patch > 0.62 ? 'fireweed' : patch < 0.3 ? 'lupine' : 'daisy';
      for (let c = 0; c < count; c++) {
        const r = rnd();
        if (r > (gl === GLADE.GLADE ? 0.62 : 0.5)) continue;
        const t = rnd();
        let type = 'tuft';
        if (k === KIND.GRASS) {
          const flowerChance = patch > 0.62 || patch < 0.3 ? 0.3 : 0.06;
          if (t < flowerChance) type = flowerKind;
        } else if (grid.biome[i] === BIOME.MUSHROOM) type = t < 0.5 ? 'glowcap' : 'mushroom';
        else if (grid.biome[i] === BIOME.SWAMP) type = t < 0.6 ? 'swampgrass' : 'fern';
        else if (gl === GLADE.GLADE) {
          // sunny glades: wildflower drifts, ferns hugging the grove edges
          const edge = gladeEdge(grid, x, z);
          type = t < (edge ? 0.4 : 0.12) ? 'fern' : t < 0.5 ? flowerKind : t < 0.56 ? 'daisy' : 'tuft';
        } else if (gl === GLADE.OPEN) type = t < 0.45 ? 'fern' : t < 0.53 && grid.deco[i] < 0 ? 'mushroom' : t < 0.62 ? 'daisy' : 'tuft';
        else type = t < 0.35 ? 'fern' : t < 0.4 && grid.deco[i] < 0 ? 'mushroom' : 'tuft';
        clutter.push({ type, x: x + 0.15 + rnd() * 0.7, z: z + 0.15 + rnd() * 0.7, y: grid.height[i], rot: rnd() * Math.PI * 2 });
      }
    }

  // Wild land at height 0 next to a hill used to be drawn as a flat tile, which
  // leaves slits in the smoothed slopes (hidden by the old wall of trees, but
  // the glades show them). A hair of height puts every wild tile on the slope.
  for (let z = 22; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x, k = grid.kind[i];
      if (grid.meadow[i] || k === KIND.WATER || k === KIND.TRAIL || grid.occ[i] === -2 || grid.biome[i] === BIOME.ALPINE) continue;
      if (grid.height[i] >= 0.01 || grid.hasWaterNeighbor(x, z, true)) continue; // shores keep their flat banks
      grid.height[i] = 0.02;
    }

  return extendWorld({ grid, decos, clutter, trail, seed, canopy: [] }); // [v26 world]
}

// Openness of every forest tile (grid.glade): a patchy noise makes groves and
// clearings, a thin band of a second noise winds deer paths between them.
// Swamp keeps its look; the mushroom wood only thins out a little.
function buildGlades(grid) {
  const { w, h } = grid;
  const gl = (grid.glade = new Uint8Array(w * h));
  for (let z = 22; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (grid.kind[i] !== KIND.FOREST || grid.occ[i] === -2) continue;
      const b = grid.biome[i];
      // big clearings (tall trees hide anything smaller than a few tiles), a
      // finer grove / open-woodland mix, and thin winding deer paths
      const big = fbm2(x * 0.09, z * 0.09, 131) + (hash2(x, z, 133) - 0.5) * 0.06;
      const mid = fbm2(x * 0.21, z * 0.21, 137);
      const path = Math.abs(fbm2(x * 0.07, z * 0.07, 141) - 0.5) < 0.014;
      let v = GLADE.GROVE;
      if (b === BIOME.FOREST || b === BIOME.WILLOW) v = big > 0.6 || path ? GLADE.GLADE : mid > 0.5 || big > 0.53 ? GLADE.OPEN : GLADE.GROVE;
      else if (b === BIOME.MUSHROOM && mid > 0.5) v = GLADE.OPEN;
      // a loose treeline right around your land so the meadow still reads as yours
      const md = Math.hypot(Math.max(MEADOW.x0 - x, x - (MEADOW.x1 - 1), 0), Math.max(MEADOW.z0 - z, z - (MEADOW.z1 - 1), 0));
      if (md < 1.5 && v === GLADE.GLADE) v = GLADE.OPEN;
      gl[i] = v;
    }
}

// a glade tile next to a thick grove (ferns gather in the shade there)
function gladeEdge(grid, x, z) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, nz = z + dz;
    if (!grid.inb(nx, nz)) continue;
    const ni = nz * grid.w + nx;
    if (grid.kind[ni] === KIND.FOREST && grid.glade[ni] === GLADE.GROVE) return true;
  }
  return false;
}

// Ruins of old homesteads: a 3x3 mossy clearing with a stone foundation and a
// piece of old furniture (picked up by src/game/Forage.js). One sits just
// south of the meadow so you find the idea on day one; the rest hide in the
// woods, spaced out. Returns [{ x, z, type }] (furniture tile).
function placeRuins(grid) {
  const { w, h } = grid;
  const md = (x, z) => Math.hypot(Math.max(MEADOW.x0 - x, x - (MEADOW.x1 - 1), 0), Math.max(MEADOW.z0 - z, z - (MEADOW.z1 - 1), 0));
  const ok = (x, z) => {
    if (x < 3 || z < 24 || x > w - 4 || z > h - 4) return false;
    const y = grid.height[z * w + x];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = (z + dz) * w + x + dx;
        if (grid.kind[i] !== KIND.FOREST || grid.deco[i] >= 0 || grid.occ[i] === -2 || grid.height[i] !== y) return false;
        if (grid.biome[i] !== BIOME.FOREST && grid.biome[i] !== BIOME.MUSHROOM) return false;
      }
    return true;
  };
  const out = [];
  const take = (x, z, type) => {
    out.push({ x, z, type });
    // the clearing opens towards the camera (south) so the trees don't hide it
    for (let dz = -1; dz <= 2; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const i = (z + dz) * w + x + dx;
        if (grid.kind[i] === KIND.FOREST) grid.glade[i] = GLADE.GLADE;
      }
  };
  // the early one: the best spot in the strip south of the meadow, with a
  // little overgrown path back to your land
  let best = null, bs = 9;
  for (let z = EARLY_RUIN.z0; z <= EARLY_RUIN.z1; z++)
    for (let x = EARLY_RUIN.x0; x <= EARLY_RUIN.x1; x++) {
      if (!ok(x, z)) continue;
      const s = hash2(x, z, 771) + (z - EARLY_RUIN.z0) * 0.15;
      if (s < bs) { bs = s; best = [x, z]; }
    }
  if (best) {
    take(best[0], best[1], 'ruin_chair');
    for (let z = MEADOW.z1; z < best[1]; z++) { const i = z * w + best[0]; if (grid.kind[i] === KIND.FOREST) grid.glade[i] = GLADE.GLADE; }
  }
  // the rest: the luckiest candidates out in the woods, at least 13 tiles apart
  const cands = [];
  for (let z = 24; z < h - 3; z++)
    for (let x = 3; x < w - 3; x++) {
      const r = hash2(x, z, 773);
      if (r > 0.02 || md(x, z) < 4 || !ok(x, z)) continue;
      cands.push([r, x, z]);
    }
  cands.sort((a, b) => a[0] - b[0]);
  let k = 1;
  for (const [, x, z] of cands) {
    if (out.length >= 13) break;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 13)) continue;
    take(x, z, RUIN_TYPES[k++ % RUIN_TYPES.length]);
  }
  return out;
}

// Forest finds (picked up in src/game/Forage.js): one per lucky tile, more in
// glades and open woodland, extra right round the meadow so there is
// something to find on day one. Returns [{ i, x, z, kind, h }] (h: a stable
// per-tile random for variants and amounts). world.js keeps a sightline
// open south of every find so the trees don't hide it.
export function forageKindFor(gl, bio, t) {
  if (bio === BIOME.SWAMP) return t < 0.4 ? 'log' : t < 0.7 ? 'fiddlehead' : t < 0.85 ? 'resin' : 'wildberry';
  if (bio === BIOME.MUSHROOM) return t < 0.55 ? 'morel' : t < 0.75 ? 'log' : t < 0.9 ? 'pinecone' : 'resin';
  if (gl === GLADE.GLADE) return t < 0.28 ? 'wildberry' : t < 0.48 ? 'ramps' : t < 0.66 ? 'fiddlehead' : t < 0.8 ? 'log' : t < 0.9 ? 'resin' : 'morel';
  if (gl === GLADE.OPEN) return t < 0.2 ? 'log' : t < 0.36 ? 'pinecone' : t < 0.5 ? 'resin' : t < 0.64 ? 'morel' : t < 0.78 ? 'fiddlehead' : t < 0.9 ? 'ramps' : 'wildberry';
  return t < 0.3 ? 'log' : t < 0.55 ? 'pinecone' : t < 0.75 ? 'resin' : 'morel';
}
function placeForage(grid) {
  const { w, h } = grid;
  const skip = new Set();
  for (const r of grid.ruins || []) for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) skip.add((r.z + dz) * w + r.x + dx);
  const out = [];
  for (let z = 22; z < h - 1; z++)
    for (let x = 1; x < w - 1; x++) {
      const i = z * w + x;
      if (grid.kind[i] !== KIND.FOREST || grid.deco[i] >= 0 || grid.occ[i] === -2 || skip.has(i)) continue;
      const bio = grid.biome[i], gv = grid.glade[i];
      const md = Math.hypot(Math.max(MEADOW.x0 - x, x - (MEADOW.x1 - 1), 0), Math.max(MEADOW.z0 - z, z - (MEADOW.z1 - 1), 0));
      let dens = gv === GLADE.GLADE ? 0.065 : gv === GLADE.OPEN ? 0.05 : 0.025;
      if (md < 3.5) dens *= 2.4;
      if (bio === BIOME.SWAMP) dens *= 0.6;
      if (hash2(x, z, 5101) >= dens) continue;
      // never two side by side
      if (out.length && out.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.z - z) <= 1)) continue;
      out.push({ i, x, z, kind: forageKindFor(gv, bio, hash2(x, z, 5103)), h: hash2(x, z, 5105) });
    }
  return out;
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
