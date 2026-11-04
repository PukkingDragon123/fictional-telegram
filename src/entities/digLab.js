// [v32 dig] Professor Snapp's lab: the inside of his hut at Bonebed Bluff (HomeMode
// interior, registered in src/entities/homes/index.js). A plank shack crammed with
// science: a prep bench under a magnifier lamp (opens the Lab Bench), a cabinet that
// shows YOUR displayed finds, an armoured fish skull on a plaque, the brass-and-glass
// still where the Primordial Vial bubbles, a wall map full of pins, specimen jars, a
// cot under a pile of field notebooks and a gramophone that only plays one record.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, rbox, bookshelf, table, lamp, crate, barrel, stool, frame, steamer, bed, gramophone } from './homes/homeKit.js';
import { makeFindMini } from './digModels.js';
import { FIND_BY_ID } from '../data/digFinds.js';

const JAR = [0xc8e8a0, 0xf0d890, 0xa8d8e8, 0xe8b8a0, 0xd0c0f0];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function buildSnappLab(k, { game, night }) {
  const D = game?.digsite;
  k.room({
    w: 124, d: 80, h: 62,
    floor: (x, z) => ((x + 200) % 10 === 0 ? 0x6a4424 : tone(Math.floor(x / 2), 0, z, 0xb07c48, 0x9a6a3a, 0xc08a52)),
    wall: (x, y, z, side) => {
      const a = side === 'back' ? x : z;
      if ((a + 200) % 9 === 0) return 0x7a5228; // board seams
      if (y >= 40 && y <= 41) return 0x6a4424; // a picture rail
      return tone(Math.floor(a / 3), Math.floor(y / 6), z, 0xc89a62, 0xb88a54, 0xd8aa70, 0.2, 0.15);
    },
    base: 0x6a4424, lip: 0x4a3018, cap: 0x5a3a1e,
    windows: [{ side: 'back', a0: 34, a1: 48, y0: 28, y1: 38, round: true, frame: 0x6a4424, sky: (u, v) => mix(night ? 0x141a34 : 0x9ad0ee, night ? 0x2a3460 : 0xe8f6ff, v) }],
  });
  // a rug of an old survey map on the floor
  k.rug(-16, 4, 16, 22, (x, z) => (Math.abs(x) === 16 || z === 4 || z === 22 ? 0x8a6a3a : (x * 3 + z * 7) % 23 === 0 ? 0x5a8a4a : (x + z) % 11 === 0 ? 0xc8a878 : 0xe8d4a8));

  // ---- the prep bench under the magnifier lamp: opens the Lab Bench
  const bench = table(k, { w: 34, d: 16, h: 16, col: 0x8a6a44 });
  const bt = k.v();
  bt.box(-12, 17, -5, 4, 17, 5, (x, z) => ((x + z) % 4 === 0 ? 0x3e6a4a : 0x4a7a56)); // cutting mat
  for (let a = 0; a < 2.6 * Math.PI * 2; a += 0.2) { const rr = 4 * (1 - a / (3 * Math.PI * 2)); bt.set(-4 + Math.round(Math.cos(a) * rr), 18, Math.round(Math.sin(a) * rr), a < Math.PI * 2 ? 0xfff2d8 : 0xe8d8b0); }
  for (let y = 17; y <= 34; y++) bt.set(12, y, -6, PAL.iron);
  for (let q = 0; q <= 10; q++) bt.set(12 - q, 34 + Math.round(q * 0.2), -6 + Math.round(q * 0.5), PAL.iron);
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (Math.abs(x) + Math.abs(z) < 5) bt.set(2 + x, 36, z, Math.abs(x) + Math.abs(z) < 3 ? 0xd8f4ff : PAL.brass);
  for (const [x, c] of [[8, 0x3a2a1c], [9, 0x5a4030], [10, 0x3a2a1c]]) for (let y = 17; y <= 22; y++) bt.set(x, y, 4, y > 20 ? c : 0xa8743e);
  bench.add(k.mesh(bt));
  k.light(0xfff0c0, night ? 1.4 : 0.7, 2.4, [-0.2, 1.4, -0.7]);
  k.prop('bench', bench, {
    x: -0.2, z: -0.95, label: 'Prep bench', stand: [-0.2, -0.2],
    tap: {
      anim: ['loupe', 'talk'], sfx: 'dig_brush', fx: 'puff', fxN: 3,
      lines: ['My bench. Touch the lamp and I bite.', 'Bring me crusty rocks. I make them into history.', 'Clean it, name it, love it. In that order.'],
      effect: () => { setTimeout(() => D?.openBench?.('bench'), 1100); return false; },
    },
  });

  // ---- the display cabinet: your finds on the shelves
  const cab = k.v(), gl = k.v();
  const CW = 30, CH = 46, CD = 10;
  cab.box(-CW / 2, 0, -CD / 2, CW / 2 - 1, CH - 1, CD / 2 - 1, (x, y, z) => tone(x, y, z, 0x6a4424, 0x5a3a1e, 0x7a5228, 0.15, 0.1));
  cab.box(-CW / 2 + 2, 2, -CD / 2 + 1, CW / 2 - 3, CH - 3, CD / 2 - 1, null);
  for (const y of [2, 16, 30]) cab.box(-CW / 2 + 2, y, -CD / 2 + 1, CW / 2 - 3, y, CD / 2 - 2, 0x8e3434);
  gl.box(-CW / 2 + 2, 3, CD / 2 - 1, CW / 2 - 3, CH - 3, CD / 2 - 1, 0xcfeeff);
  const cabinet = k.obj('cabinet', cab, null, { glass: gl });
  const shown = D?.displayed?.() || [];
  const SLOTS = [];
  for (const y of [3, 17, 31]) for (const x of [-9, 0, 9]) SLOTS.push([x, y]);
  shown.slice(0, 9).forEach((it, i) => {
    const m = makeFindMini(it.id);
    m.position.set(W(SLOTS[i][0]), W(SLOTS[i][1]), 0);
    m.scale.setScalar(0.9);
    m.rotation.y = (i % 3 - 1) * 0.3;
    cabinet.add(m);
  });
  if (!shown.length) { const m = makeFindMini('ammonite'); m.position.set(0, W(17), 0); cabinet.add(m); }
  k.prop('cabinet', cabinet, {
    x: 2.2, z: -1.5, label: 'Display cabinet', stand: [1.8, -0.6],
    tap: {
      anim: ['happy', 'loupe'], sfx: 'dig_glint', fx: 'sparks', fxN: 4,
      lines: shown.length ? [`${shown.length} finds on display. ${FIND_BY_ID[shown[0].id]?.name || 'That one'} is my favourite. Don't tell the others.`, 'The public loves it. The public licks the glass.'] : ['Empty shelves. A museum without bones is a CUPBOARD.', 'Dig something up. Put it here. Make me proud. Or at least less grumpy.'],
      effect: () => { setTimeout(() => D?.openBench?.('collection'), 1100); return false; },
    },
  });

  // ---- the armoured skull on a plaque (a Dunkleosteus head, his pride)
  const sk = k.v();
  sk.box(-12, -2, -1, 11, 13, 0, (x, y) => (Math.abs(x) > 10 || y < 0 || y > 11 ? 0x5a3a1e : 0x7a5228));
  for (let x = -9; x <= 9; x++) for (let y = 0; y <= 11; y++) {
    const dx = x / 9.4, dy = (y - 5.5) / 6;
    if (dx * dx + dy * dy > 1) continue;
    sk.set(x, y, 1, (x === 0 || y === 7) ? 0xc8b890 : y > 7 ? 0xfff6e0 : 0xeee2c4);
  }
  for (const [x, y] of [[4, 6], [5, 6], [4, 7], [5, 7]]) sk.set(x, y, 2, 0x2a1e14);
  for (let x = 1; x <= 10; x++) sk.set(x, 1 + (x > 6 ? 1 : 0), 2, 0xfff8e8); // the blade jaw
  const skull = k.obj('skull', sk);
  k.prop('skull', skull, {
    x: -1.5, y: W(34), z: -1.95, label: 'Dunkleosteus skull', stand: [-1.4, -1.1], pad: 0.1,
    tap: {
      anim: ['loupe', 'happy'], sfx: 'dig_chomp',
      lines: ['Dunkleosteus. Six metres. Bit through sharks for fun. Lovely fellow.', 'No teeth. Bone BLADES. They sharpened themselves. Like my wit.', 'I found him in 1911. He found me first, really.'],
      fox: ['I have seen that face on a bear at 5 PM.'],
      reward: { friend: 0.5 }, rewardLine: ['You stared at him for a whole minute. Good. Respect.'],
    },
  });

  // ---- the still: the Primordial Vial bubbles in a brass-and-glass contraption
  const still = k.v(), sg = k.v();
  still.box(-8, 0, -6, 7, 9, 5, (x, y, z) => (y === 9 ? 0x6a6a74 : (x + y) % 5 === 0 ? 0x3a3a44 : 0x4a4a54)); // a little burner box
  for (let y = 10; y <= 30; y++) still.set(6, y, 0, PAL.brass);
  for (let q = 0; q <= 12; q++) still.set(6 - q, 30 - Math.round(q * 0.4), 0, PAL.brassD);
  ell(sg, -2, 18, 0, 6, 7, 6, (x, y) => (y > 21 ? 0xdff8ff : null));
  ell(sg, -2, 16, 0, 5, 5, 5, (x, y, z) => (y > 18 ? null : (x + y + z) % 4 === 0 ? 0xffd060 : 0x9ae06a));
  const stillObj = k.obj('still', still, sg);
  const sm = steamer(k, new THREE.Vector3(2.5 - W(2), W(27), 0.6), { n: 3, rise: 0.35, rate: 0.5, size: 0.06 });
  sm.on = !!game?.state?.research?.includes('r_dig_vial');
  k.light(0x9af06a, 0.6, 1.6, [2.4, 0.9, 0.6]);
  k.every((dt, t) => { stillObj.position.y = Math.sin(t * 9) * 0.004; });
  k.prop('still', stillObj, {
    x: 2.5, z: 0.6, label: 'The still', stand: [1.9, 1.0],
    tap: {
      anim: ['grumble', 'talk'], sfx: 'dig_brew', fx: 'bubbles', fxN: 6,
      lines: game?.state?.research?.includes('r_dig_vial') ? ['Primordial Vial. Amber, bone dust and something I will NOT discuss.', 'One drop. ONE. Two drops and you get a fish with opinions.'] : ['Don\'t touch the still. It is for... research.', 'It bubbles. That\'s all you need to know. For now.'],
      effect: () => { if (game?.state?.research?.includes('r_dig_vial')) setTimeout(() => D?.openBench?.('vial'), 1300); return false; },
    },
  });

  // ---- the wall map, pins everywhere
  const mp = frame(k, { w: 26, h: 18, col: 0x5a3a1e, art: (x, y) => {
    if ((x === 6 && y === 12) || (x === 18 && y === 5) || (x === 21 && y === 13) || (x === 10 && y === 4)) return 0xd8402a;
    if (Math.abs(y - (9 + Math.sin(x * 0.4) * 3)) < 0.8) return 0x4a8ad8; // Fern Brook
    return (x + y * 3) % 17 === 0 ? 0xb8a070 : 0xecdcae;
  } });
  k.prop('map', mp, {
    x: 0.9, y: W(42), z: -1.95, label: 'Survey map', stand: [0.8, -1.1], pad: 0.1,
    tap: {
      anim: ['tap_hammer', 'talk'], sfx: 'paper',
      lines: ['Every red pin is a dig. The coffee rings are coffee.', 'Here be bones. And here. And there, but that one\'s a sandwich.'],
      fox: ['Half these pins are in my pond.'],
      effect: (c) => { if (!c.once()) return false; D?.sites?.refresh?.(); c.reward({ friend: 0.3 }, ['Go on then. New sites turn up every morning once you\'ve got my maps.']); return true; },
    },
  });

  // ---- specimen jars on a shelf, a cot under notebooks, crates, a gramophone
  const jars = bookshelf(k, {
    w: 22, h: 36, d: 8, col: 0x6a4424, rows: 4,
    fill: (b, y, h, hx, d, r) => {
      for (let x = -hx + 2; x < hx - 2; x += 4) {
        const c = JAR[(x + r * 3 + 40) % JAR.length];
        for (let yy = y; yy < y + Math.min(6, h); yy++) for (let dx = 0; dx < 3; dx++) b.set(x + dx, yy, 0, yy === y + Math.min(6, h) - 1 ? 0x8a6a44 : c);
        b.set(x + 1, y + 2, 1, 0xfff6e0);
      }
    },
  });
  k.prop('jars', jars, {
    x: -2.55, z: -1.45, label: 'Specimen jars', stand: [-2.1, -0.6],
    tap: {
      anim: ['loupe', 'talk'], sfx: 'dig_glint',
      lines: ['That\'s a leech from 1923. His name is also Gerald.', 'Pickled. Labelled. Judged.', 'Don\'t open the green one. Nobody opens the green one.'],
      reward: { coins: 20 }, rewardLine: ['A coin fell out of the old trilobite jar. Finders keepers. You found it.'],
    },
  });
  k.add(bed(k, { w: 22, d: 34, col: 0x7a5228, blanket: 0x8a3a2a, h: 6, head: 12 }), -2.3, 0, 0.75, Math.PI / 2);
  const notes = k.v();
  for (let n = 0; n < 6; n++) notes.box(-3 + (n % 2), n, -2, 3 + (n % 2), n, 2, [0x8a3a2a, 0x3a5a8a, 0x5a7a3a, 0xc8a050][n % 4]);
  k.add(k.obj('notes', notes), -2.3, W(8), 0.4);
  k.add(crate(k, { w: 12, h: 10, d: 10, col: 0xc89a5a, stuff: [0x8e8690, 0xc8a878, 0x9a5a3c, 0xf0a020] }), 1.0, 0, 1.45);
  k.add(barrel(k, { col: 0x8a6a3a, h: 13, r: 5 }), 2.75, 0, 1.6);
  k.add(stool(k, { col: 0x8a6a44, h: 9 }), -0.6, 0, -0.35);
  const gram = gramophone(k, { col: 0x5a3a1e, horn: PAL.brass });
  k.prop('gramophone', gram, {
    x: -1.35, z: 1.45, label: 'Gramophone', stand: [-0.9, 1.0],
    tap: {
      anim: ['happy', 'laugh'], sfx: 'pop_in', fx: 'notes', fxN: 4,
      lines: ['"Rock Around the Clock". It is about strata.', 'One record. I have listened to it nine thousand times. It gets better.'],
      fox: ['He is tapping his foot. Barely. But he is.'],
    },
  });
  k.add(lamp(k, { col: 0x5a3a1e, shadeCol: 0xf0c870, h: 26 }), 2.75, 0, -0.35);
  k.light(0xffd8a0, 0.9, 6, [0.2, 1.9, 0.3]);
  k.light(night ? 0x8ab8ff : 0xfff0d0, 0.5, 6, [1.6, 2.2, -0.8]);

  const crateN = D?.crate?.().length || 0;
  return {
    title: 'Snapp\'s Lab', bg: 0x1e1610, music: 'sleep',
    light: { sky: 0xfff0d8, ground: 0x4a3420, hemi: 1.45, fillI: 0.8 },
    npc: { x: 0.6, z: -0.25, rot: 0.2 }, npcScale: 0.92,
    fox: { x: -0.9, z: 1.35 },
    idle: ['idle'],
    specials: ['loupe', 'tap_hammer', 'grumble', 'lure'],
    greet: crateN ? [`${crateN} crusty rock${crateN > 1 ? 's' : ''} in the crate. To the bench!`, 'Wipe your paws. The floor is older than you. ...It is not. But wipe them.'] : ['Wipe your paws. Don\'t lick anything.', 'Welcome to the lab. Mind the ammonite. Mind EVERYTHING.'],
    bye: ['Go dig something.', 'Close the door. Gently. The jars.'],
    chatter: ['Hm.', 'Jurassic. Obviously.', 'Gerald, NOT NOW.', pick(['Where is my trowel.', 'I am holding my trowel.'])],
  };
}
