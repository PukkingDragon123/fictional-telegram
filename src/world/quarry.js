// [F&S mining] Flint's Quarry: a flat gravel pit cut into the north mountain,
// west of the office trail. worldgen.js calls carveQuarry(grid) right after the
// office plateau, before any decorations are placed, so the pit stays clear.
// Everything about the quarry's layout (tiles, world units) lives here.
import { KIND } from './grid.js';

// veins: on the floor tiles against the walls (the cliff would swallow anything placed on it)
export const QUARRY_VEINS = [[44, 10, 'coal'], [47, 10, 'stone'], [54, 10, 'copper'], [54, 12, 'iron'], [42, 16, 'copper'], [54, 16, 'coal']];
export const QUARRY = {
  x0: 42, x1: 54, z0: 10, z1: 17, // flat floor (inclusive tiles)
  h: 5, // floor height
  cx: 48, cz: 13.5, r: 7.6, // the fog circle (zones.js 'quarry')
  flint: { x: 44.2, z: 14.8 }, // where Flint hangs out
  shack: { x: 43.1, z: 11.6 }, // his shack (door faces +z)
  mine: { x: 49.5, z: 11.1 }, // the Bear Mine entrance (centre of the front, faces +z), its back against the wall
  canteen: { x: 52.6, z: 13.8 }, // the canteen table + lunch pail post
  bin: { x: 50.2, z: 16.2 }, // ore bin the carts / bears dump into
  drill: { x: 51.9, z: 11.4 }, // Ore Drill pad
  excavator: { x: 46.4, z: 11.9 }, // Steam Excavator pad
};

const lerp = (a, b, t) => a + (b - a) * t;

export function carveQuarry(grid) {
  const { w } = grid;
  const Q = QUARRY;
  const R = 4; // blend ring
  for (let z = Q.z0 - R; z <= Q.z1 + R; z++)
    for (let x = Q.x0 - R; x <= Q.x1 + R; x++) {
      if (!grid.inb(x, z)) continue;
      const i = z * w + x;
      const dx = Math.max(Q.x0 - x, x - Q.x1, 0), dz = Math.max(Q.z0 - z, z - Q.z1, 0);
      const d = Math.max(dx, dz);
      const nat = grid.height[i];
      if (d === 0) {
        grid.height[i] = Q.h;
        grid.kind[i] = KIND.DIRT;
        grid.deco[i] = -1;
        continue;
      }
      if (nat > Q.h) {
        // the pit walls: bare rock right round the floor, rising to the mountain
        if (d <= 2) { grid.kind[i] = KIND.ROCK; grid.height[i] = Math.max(nat, Q.h + d * 0.9); }
      } else {
        // the spoil terrace: a ramp down to the slope below
        grid.height[i] = Math.round(lerp(Q.h, nat, d / (R + 1)) * 4) / 4;
        if (d <= 1) grid.kind[i] = KIND.DIRT;
      }
      grid.deco[i] = -1;
    }
}
