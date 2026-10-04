// [v20 npc homes] Clover's root cellar: an earthy burrow with roots in the
// ceiling, warm grow lamps over carrot beds, a seed drawer chest, pickle jars,
// a compost bin and a tiny bed.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, bookshelf, bed, barrel, table, plant, lamp, rugOval } from './homeKit.js';

export function buildClover(k, { night, game }) {
  k.room({
    round: 20, h: 56,
    floor: (x, z) => tone(x, 0, z, 0x7a5a3a, 0x6a4a2e, 0x8a6a46, 0.2, 0.15),
    wall: (x, y, z, side) => { const s = hash3(x, y, z); return s < 0.04 ? 0x9a968c : s < 0.07 ? 0x5a3a22 : tone(x, y, z, 0x9a6a3e, 0x8a5e36, 0xa87648, 0.2, 0.12); },
    base: 0x6a4a2a, lip: 0x5a8a32,
    windows: [{ side: 'back', a0: 28, a1: 42, y0: 32, y1: 44, round: true, frame: 0xf4e8c8, sky: (u, v, a, y) => (v < 0.35 ? 0x6aa83e : mix(night ? 0x1a2240 : 0x9fd6f0, night ? 0x2a3a68 : 0xe8f6ff, v)) }],
  });
  // roots dangling from the top of the back wall
  k.deco((R) => { for (let i = 0; i < 14; i++) { const x = -52 + i * 8 + Math.floor(hash3(i, 0, 0) * 4); const len = 4 + Math.floor(hash3(i, 1, 0) * 9); for (let y = 0; y < len; y++) R.set(x + (y > len / 2 ? 1 : 0), 55 - y, -39, y === len - 1 ? 0xc8a070 : 0x8a6a42); } });
  rugOval(k, -4, 14, 22, 12, [0x6aa84a, 0x86c05a, 0xf4e8c8, 0x6aa84a]);

  // ---- grow bed with carrots under a lamp
  const gb = k.obj('growbed', null);
  const bv = k.v();
  bv.box(-18, 0, -6, 17, 6, 5, (x, y, z) => (x === -18 || x === 17 || z === -6 || z === 5 ? 0x9a6a3a : y === 6 ? 0x5a3a22 : 0x6a4a2a));
  const carrots = k.v();
  for (let x = -15; x <= 14; x += 4) for (const z of [-3, 2]) { carrots.set(x, 0, z, 0xf08a1a); for (let y = 1; y < 4; y++) carrots.set(x + (y === 3 ? (x % 8 ? 1 : -1) : 0), y, z, y === 1 ? 0x3e8a2c : 0x5aae3c); }
  const gl = k.v(); for (let x = -16; x <= 15; x++) gl.set(x, 0, 0, 0xfff0b0);
  bv.box(-18, 24, -1, 17, 25, 1, 0x4a4a52); bv.box(-18, 7, -1, -18, 24, -1, 0x4a4a52); bv.box(17, 7, -1, 17, 24, -1, 0x4a4a52);
  gb.add(k.mesh(bv), k.mesh(gl, 'glow'));
  gb.children[1].position.y = W(23);
  const cp = k.part(gb, 'carrots', carrots, null, [0, 7, 0]);
  k.prop('growbed', gb, {
    x: -0.7, z: -1.4, label: 'Carrot bed',
    tap: {
      anim: ['water_plants', 'dig'], sfx: 'water_drip', fx: 'drops', fxN: 7,
      lines: ['Water in the morning, never at noon!', 'Grow, little carrots! Grow for the bears!'],
      reward: { food: { id: 'carrot', n: 2 } }, rewardLine: ['Two crunchy ones, just for you!'],
      effect: (c) => { c.tween(0.8, (q) => { cp.position.y = W(7) + Math.sin(q * Math.PI) * 0.06; }); },
    },
  });
  k.light(0xffe8a0, 1.4, 2.5, [-0.7, 1.1, -1.2], 1.6);

  // ---- seed drawers
  const sd = k.obj('seeds', null);
  const dv = k.v(); dv.box(-10, 0, -5, 9, 20, 4, (x, y, z) => tone(x, y, z, 0xa87448, 0x986840, 0xb88450));
  const fronts = [];
  sd.add(k.mesh(dv));
  const SEEDC = [0xf08a1a, 0xd8403a, 0x5aae3c, 0xffd84a, 0x8a6ac8, 0xf4e8c8];
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < 3; cI++) {
    const f = k.v(); f.box(0, 0, 0, 5, 5, 1, 0xc89a5a); f.set(2, 3, 2, SEEDC[(r * 3 + cI) % 6]); f.set(3, 3, 2, SEEDC[(r * 3 + cI) % 6]); f.set(2, 1, 2, 0x6a4424); f.set(3, 1, 2, 0x6a4424);
    fronts.push(k.part(sd, 'd' + r + cI, f, null, [-9 + cI * 6.3, 1 + r * 6.5, 4]));
  }
  k.prop('drawers', sd, {
    x: 1.95, z: -1.65, label: 'Seed drawers',
    tap: {
      anim: ['sniff', 'happy'], sfx: 'open', lines: ['Carrot, radish, sunflower, mystery!', 'The mystery drawer bit me once.', 'Labelled by colour. Mostly orange.'],
      reward: { friend: 0.5 }, rewardLine: ['Take a peek, neighbour. Gardeners share!'],
      effect: (c) => { const f = fronts[Math.floor(Math.random() * fronts.length)]; const z0 = f.position.z; c.tween(0.4, (q) => { f.position.z = z0 + q * 0.18; }); c.later(2.2, () => c.tween(0.4, (q) => { f.position.z = z0 + (1 - q) * 0.18; })); },
    },
  });

  // ---- pickle shelf
  const pk = bookshelf(k, { w: 22, h: 24, d: 7, col: 0x7e5228, rows: 3, fill: (v, y, h, hx, d, r) => { for (let x = -hx + 2; x < hx - 2; x += 4) v.cylinder(x + 1, y, 0, 1.6, Math.min(5, h - 1), (xx, yy) => (yy === y + Math.min(5, h - 1) - 1 ? 0xd8403a : [0x8ac04a, 0xf08a1a, 0xd85a8a, 0xffd84a][(x + r + 40) % 4])); } });
  k.prop('pickles', pk, {
    x: -2.4, z: -1.0, rot: Math.PI / 2, label: 'Pickle shelf', stand: [-1.8, -0.6],
    tap: { anim: ['sniff', 'laugh'], sfx: 'chip', lines: ['Pickled radish. Pickled beets. Pickled pickles.', 'Jam from last summer. Still jammin\'.'] },
  });

  // ---- compost bin
  const cb = barrel(k, { col: 0x5a7a3a, h: 12, r: 6, lid: false });
  const fill = k.v(); fill.cylinder(-0.5, 0, -0.5, 5, 1, (x, y, z) => [0x5a3a22, 0x6aa84a, 0xf08a1a, 0x8a6a42][Math.floor(hash3(x, 1, z) * 4)]);
  const fm = k.mesh(fill); fm.position.y = W(11); cb.add(fm);
  k.prop('compost', cb, {
    x: 2.5, z: 0.6, label: 'Compost bin',
    tap: { anim: ['sniff', 'dig'], fx: 'puff', fxN: 3, sfx: 'squelch', lines: ['Compost is just salad\'s second chance.', 'Smells like... next year\'s carrots!'], fox: ['Smells like... no. Just no.'] },
  });

  k.add(bed(k, { w: 22, d: 30, col: 0x9a6a3a, blanket: 0x6aa84a, h: 7, head: 14 }), -2.35, 0, 0.75);
  k.add(table(k, { w: 16, d: 12, h: 11, col: 0x9a6a3a, round: true, cloth: 0xf08a1a }), 0.85, 0, 0.6);
  k.add(plant(k, { leaf: 0x5aae3c, flower: 0xffd84a, h: 6, r: 2 }), 0.85, W(12), 0.6);
  k.add(lamp(k, { shadeCol: 0xf0b860, h: 22 }), 0.4, 0, -1.7);
  k.light(0xffc070, 1.0, 4.2, [0.4, 1.4, -1.4], 1.4);
  return {
    title: "Clover's Root Cellar", bg: 0x1e1810,
    light: { sky: 0xffe8c8, ground: 0x4a3420, hemi: 1.5, fillI: 0.8 },
    npc: { x: 0.85, z: -0.25, rot: 0.1 }, npcScale: 0.92,
    fox: { x: -1.0, z: 1.4 },
    greet: ['Oh! Hello, neighbour! Wipe your feet, it\'s dirt anyway.', 'Welcome to the cellar! Mind the roots.'],
    bye: ['Bye! Eat your greens!', 'Come back when the carrots are taller!'],
    chatter: ['Grow, grow, grow...', '*sniff sniff*', 'Was that a worm? Hi, worm.'],
  };
}
