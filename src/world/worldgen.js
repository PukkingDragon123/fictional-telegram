// Procedural Canadian valley: meadow + pond in the middle, forested hills around,
// a snowy mountain to the north with the Bear St. office on a plateau and a
// switchback trail running down to the meadow.
import { Grid, KIND, FLOOR_DEEP, FLOOR_SHALLOW } from './grid.js';
import { fbm2, hash2, mulberry32, clamp } from '../core/rng.js';

export const WORLD_W = 60;
export const WORLD_H = 62;
export const MEADOW = { x0: 8, x1: 52, z0: 21, z1: 55 };
export const OFFICE = { x: 30, z: 5.5, h: 14 };
export const HUT = { x: 37, z: 41 }; // top-left tile of 3x3 hut
export const TRAIL_WAYPOINTS = [
  [30, 9.2],
  [41, 10.5],
  [19, 13.2],
  [39, 16.2],
  [24, 19.2],
  [30, 22.5],
];

function mountainH(x, z) {
  if (z >= 21.5) return 0;
  const t = clamp((21.5 - z) / 19.5, 0, 1);
  let h = Math.pow(t, 1.25) * 16.5;
  const lat = Math.abs(x - 30) / 30;
  h *= 1 - 0.25 * lat * lat;
  h += (fbm2(x * 0.18, z * 0.18, 7) - 0.5) * 5 * t;
  // two jagged peaks framing the office
  const p1 = Math.max(0, 1 - Math.hypot(x - 13, (z - 2.5) * 1.3) / 11);
  const p2 = Math.max(0, 1 - Math.hypot(x - 48, (z - 2) * 1.3) / 12);
  h += p1 * p1 * 12 + p2 * p2 * 10;
  return Math.max(0, h);
}

function edgeHillH(x, z) {
  // distance outside the meadow rectangle (east/west/south only)
  const dx = Math.max(MEADOW.x0 - x, x - (MEADOW.x1 - 1), 0);
  const dz = Math.max(z - (MEADOW.z1 - 1), 0);
  const d = Math.hypot(dx, dz);
  if (d <= 0) return 0;
  return Math.max(0, d * 0.55 + (fbm2(x * 0.2, z * 0.2, 3) - 0.5) * 2.2 - 0.3);
}

export function generateWorld(seed = 1337) {
  const rnd = mulberry32(seed);
  const grid = new Grid(WORLD_W, WORLD_H);
  const { w, h } = grid;

  // --- base heights & kinds
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const cx = x + 0.5, cz = z + 0.5;
      let hh = Math.max(mountainH(cx, cz), edgeHillH(cx, cz));
      const inMeadow = x >= MEADOW.x0 && x < MEADOW.x1 && z >= MEADOW.z0 && z < MEADOW.z1;
      grid.meadow[i] = inMeadow ? 1 : 0;
      if (inMeadow) hh = 0;
      hh = Math.round(hh * 2) / 2;
      grid.height[i] = hh;
      let k = KIND.GRASS;
      if (!inMeadow) {
        if (hh > 12.5) k = KIND.SNOW;
        else if (hh > 8.5) k = KIND.ROCK;
        else k = KIND.FOREST;
        // rocky outcrops lower down
        if (k === KIND.FOREST && z < 21 && fbm2(x * 0.3, z * 0.3, 11) > 0.62) k = KIND.ROCK;
      }
      grid.kind[i] = k;
    }

  // --- office plateau
  for (let z = 2; z <= 9; z++)
    for (let x = 23; x <= 37; x++) {
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
      // carve the path (about 1.5 tiles wide)
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
  // smooth trail heights to per-tile values the bears will actually walk on
  for (const p of trail) {
    const tx = Math.floor(p[0]), tz = Math.floor(p[2]);
    if (grid.inb(tx, tz)) p[1] = grid.height[tz * w + tx];
  }

  // --- the pond (organic blob)
  const pcx = 27.5, pcz = 33.5;
  for (let z = MEADOW.z0; z < MEADOW.z1; z++)
    for (let x = MEADOW.x0; x < MEADOW.x1; x++) {
      const dx = (x + 0.5 - pcx) / 6.2, dz = (z + 0.5 - pcz) / 4.4;
      const wob = (fbm2(x * 0.35, z * 0.35, 5) - 0.5) * 0.5;
      if (dx * dx + dz * dz < 1 + wob) grid.kind[z * w + x] = KIND.WATER;
    }
  refreshWaterHeights(grid);

  // --- decorations
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
  const canopy = [];
  const meadowDist = (x, z) => Math.max(MEADOW.x0 - x, x - (MEADOW.x1 - 1), MEADOW.z0 - z, z - (MEADOW.z1 - 1), 0);
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const k = grid.kind[i];
      const r = hash2(x, z, 99);
      if (k === KIND.FOREST) {
        const md = meadowDist(x, z);
        const band = z < MEADOW.z0 ? 4 : 3;
        if (md > band) {
          // deep forest: rendered as a lumpy canopy mesh, with the odd tree poking out
          canopy.push(i);
          grid.deco[i] = -3;
          if (r < 0.05) { grid.deco[i] = -1; addDeco(hash2(x, z, 5) < 0.5 ? 'maple' : 'pine', x, z, { far: true }); canopy.pop(); }
          continue;
        }
        const dens = 0.5 + fbm2(x * 0.25, z * 0.25, 21) * 0.4;
        if (r < dens) {
          const hgt = grid.height[i];
          const t = hash2(x, z, 5);
          const type = hgt > 6 ? 'pine' : t < 0.55 ? 'pine' : t < 0.72 ? 'spruce' : t < 0.87 ? 'maple' : 'birch';
          addDeco(type, x, z, { far: true });
        }
      } else if (k === KIND.ROCK && r < 0.08) {
        addDeco('boulder', x, z, { far: true });
      } else if (k === KIND.GRASS && grid.meadow[i]) {
        const inHut = x >= hutX0 && x <= hutX1 && z >= hutZ0 && z <= hutZ1;
        const inCorridor = Math.abs(x + 0.5 - 30) < 3.5 && z < 30; // path from trail to pond
        if (inHut || inCorridor || nearPond(x, z, 2)) continue;
        // denser trees near the meadow rim
        const rim = Math.min(x - MEADOW.x0, MEADOW.x1 - 1 - x, MEADOW.z1 - 1 - z, z - MEADOW.z0);
        const p = rim <= 1 ? 0.35 : rim <= 3 ? 0.12 : 0.025;
        if (r < p) {
          const t = hash2(x, z, 8);
          const type = t < 0.3 ? 'maple' : t < 0.52 ? 'birch' : t < 0.8 ? 'pine' : 'spruce';
          addDeco(type, x, z);
        } else if (r < p + 0.012) {
          addDeco('boulder', x, z);
        }
      }
    }

  // ground clutter (non-blocking): grass tufts, flowers, ferns, mushrooms
  const clutter = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const k = grid.kind[i];
      if (k !== KIND.GRASS && k !== KIND.FOREST) continue;
      const count = k === KIND.GRASS ? 2 : 1;
      // flowers grow in patches
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
        } else {
          type = t < 0.35 ? 'fern' : t < 0.4 && grid.deco[i] < 0 ? 'mushroom' : 'tuft';
        }
        clutter.push({ type, x: x + 0.15 + rnd() * 0.7, z: z + 0.15 + rnd() * 0.7, y: grid.height[i], rot: rnd() * Math.PI * 2 });
      }
    }

  // deco -3 marks canopy tiles (blocked, no individual tree)
  return { grid, decos, clutter, trail, seed, canopy };
}

// Water tiles: floor is shallow next to land, deeper in the middle.
export function refreshWaterHeights(grid) {
  const { w, h } = grid;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (grid.kind[i] !== KIND.WATER) continue;
      grid.height[i] = grid.hasLandNeighbor(x, z) ? FLOOR_SHALLOW : FLOOR_DEEP;
    }
}
