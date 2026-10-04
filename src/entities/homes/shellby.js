// [v20 npc homes] Grandpa Shellby's shell house under the Great Willow: a low,
// round, dim and sleepy room with shell-plate walls, a tea table, a very
// comfy armchair, old pond photos, a slow grandfather clock and a mossy chest.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, table, armchair, clock, frame, chest, teapot, steamer, rugOval, plant, bookshelf, lamp } from './homeKit.js';

export function buildShellby(k, { night }) {
  // hexagon-ish shell plates
  const plate = (a, y) => {
    const row = Math.floor(y / 9), off = row % 2 ? 6 : 0;
    const col = Math.floor((a + off + 300) / 12);
    const ea = (a + off + 300) % 12, ey = y % 9;
    if (ea === 0 || ey === 0) return 0x4a5a32;
    const h = hash3(col, row, 7);
    return h < 0.33 ? 0x7a8a4a : h < 0.66 ? 0x6a7a42 : 0x8a7a48;
  };
  k.room({
    w: 116, d: 76, h: 54, round: 22, lowFront: 10,
    floor: (x, z) => { const r = Math.hypot(x, z * 1.4); return r % 14 < 1 ? 0x6a5a3a : tone(x, 0, z, 0x8a7a54, 0x7a6a48, 0x9a8a60); },
    wall: (x, y, z, side) => (side === 'back' ? plate(x, y) : plate(z, y)),
    base: 0x4a5a32, lip: 0x4a5a32,
    windows: [{ side: 'back', a0: -40, a1: -26, y0: 20, y1: 32, round: true, frame: 0xc8b890, sky: (u, v, a, y) => mix(night ? 0x1a2a48 : 0x8ac8a0, night ? 0x2a3a68 : 0xc8ecd0, v) }],
  });
  rugOval(k, 2, 8, 30, 16, [0xa86a4a, 0xc8885a, 0xa86a4a, 0xe0b080]);
  // moss tufts along the walls
  k.deco((R) => { for (let x = -56; x < 56; x++) if (hash3(x, 1, 1) < 0.3) R.set(x, 0, -37, 0x6aa84a); });

  // ---- tea table + teapot
  const tt = table(k, { w: 22, d: 18, h: 10, round: true, col: 0x7a5a32, cloth: 0x5a9a6a });
  k.add(tt, -0.2, 0, 0.35);
  const pot = teapot(k, { col: 0x5a8ac8 });
  const cup = k.v(); cup.cylinder(-0.5, 0, -0.5, 2, 2, PAL.white); cup.set(-0.5, 2, -0.5, 0x8a5a2a);
  k.add(k.obj('cup', cup), 0.15, W(12), 0.45);
  const steam = steamer(k, new THREE.Vector3(0.15, W(15), 0.45), { n: 3, rise: 0.35 });
  k.prop('tea', pot, {
    x: -0.35, y: W(12), z: 0.25, label: 'Willow tea', pad: 0.12,
    tap: {
      anim: ['sip_tea', 'happy'], sfx: 'bubble', fx: 'puff', fxN: 3,
      lines: ['Willow-bark tea. Good for the shell.', 'Steep it for one hour. Or until I wake up.', 'Milk? No. Sugar? No. Patience? Yes.'],
      reward: { friend: 0.5 }, rewardLine: ['A cup for you too, sprout. Sit a spell.'],
      fox: ['Tastes like a tree. A rich tree, I hope.'],
      effect: (c) => { const l = c.parts.lid; c.tween(0.9, (q) => { l.position.y = W(6) + Math.abs(Math.sin(q * Math.PI * 4)) * 0.05; }); steam.on = true; },
    },
  });

  // ---- the armchair (napping spot)
  const ac = armchair(k, { col: 0x8a6a9a, wood: 0x4a3a22, w: 22, d: 18 });
  k.prop('armchair', ac, {
    x: -1.75, z: -0.9, rot: 0.35, label: 'Comfy armchair',
    tap: { anim: ['doze', 'sleepy'], fx: 'zzz', fxN: 3, sfx: 'fox_snore', lines: ['Just resting my eyes. For a decade or so.', 'This chair and I have an understanding.', 'Zzz... hm? The bears? Fine, fine.'], fox: ['Wake me when he wakes up.'] },
  });
  const blanket = k.v(); blanket.box(0, 0, 0, 9, 1, 6, (x, y, z) => ((x + z) % 3 ? 0xd8a848 : 0xc85a3a));
  k.add(k.obj('blanket', blanket), -2.2, W(10), -0.7, 0.3);

  // ---- old photos on the back wall
  const photos = new THREE.Group(); photos.userData.parts = {};
  const sepia = (a, b) => (x, y) => (hash3(x, y, 9) < 0.08 ? 0x5a4a32 : mix(a, b, y / 10));
  const f1 = frame(k, { w: 14, h: 10, col: 0x5a3a22, art: sepia(0xc8a878, 0x8a7a58) });
  const f2 = frame(k, { w: 8, h: 11, col: 0x8a6a3a, art: (x, y) => (Math.hypot(x - 3.5, y - 6) < 3 ? 0x7a6a48 : 0xd8c8a0) });
  const f3 = frame(k, { w: 10, h: 7, col: 0x5a3a22, art: sepia(0xa8b0a0, 0x7a8478) });
  f1.position.set(0, 0, 0); f2.position.set(W(14), W(1), 0); f3.position.set(W(-12), W(5), 0);
  photos.add(f1, f2, f3);
  k.prop('photos', photos, {
    x: 0.5, y: 1.25, z: -1.88, label: 'Old photos', stand: [0.5, -0.9],
    tap: { anim: ['talk', 'laugh'], lines: ['That is the pond in 1826. Lovely puddle.', 'My first gar. He bit me. We are still friends.', 'Your grandfather fox. Same hat. Same schemes.'], fox: ['Was that... a fox in a monocle?'] },
  });

  // ---- slow grandfather clock
  const gc = clock(k, { col: 0x5a3a22, h: 44 });
  k.prop('clock', gc, {
    x: 2.35, z: -1.55, label: 'Grandfather clock',
    tap: { sfx: ['tock', 0.5, { pitch: 0.6 }], anim: ['sleepy', 'talk'], lines: ['It is three o\'clock. It is always three o\'clock.', 'Tick... ... ... tock. Good clock. Unhurried.', 'I wound it in spring. Which spring, I forget.'] },
  });
  k.every((dt, t) => { gc.userData.parts.pend.rotation.z = Math.sin(t * 0.9) * 0.22; });

  // ---- mossy treasure chest
  const ch = chest(k, { col: 0x5a6a3a, band: 0xb8a060 });
  k.prop('chest', ch, {
    x: 1.7, z: 0.3, rot: -0.4, label: 'Mossy chest',
    tap: {
      anim: ['happy', 'talk'], sfx: 'open',
      lines: ['Old coins. Older than the coins.', 'My shell collection. Kidding. It is just me.'],
      reward: { coins: 20 }, rewardLine: ['Found these in the moss. Old coins spend fine, sprout.'],
      effect: (c) => { const lid = c.parts.lid; c.tween(0.6, (q) => { lid.rotation.x = -q * 1.6; }); c.later(2.6, () => c.tween(0.6, (q) => { lid.rotation.x = -(1 - q) * 1.6; })); },
    },
  });

  // decor
  k.add(bookshelf(k, { w: 20, h: 28, d: 8, col: 0x4a3a22, books: [0x5a7a5a, 0x8a6a3a, 0xa8a088, 0x6a5a8a] }), -0.8, 0, -1.65);
  k.add(plant(k, { leaf: 0x5aa04a, flower: 0xf0d8f0, h: 8 }), 2.45, 0, 1.4);
  k.add(lamp(k, { shadeCol: 0xd8b878, h: 22 }), -2.6, 0, 0.3);
  k.light(0xffc070, 1.0, 4, [-2.5, 1.3, 0.4], 1.4);
  k.light(0xffd8a0, 0.6, 5, [0.5, 2, -0.8]);
  return {
    title: "Shellby's Shell House", bg: 0x1a2420, music: 'sleep',
    light: { sky: 0xe8e0c0, ground: 0x3a4430, hemi: 1.35, fillI: 0.7 },
    npc: { x: 0.65, z: -0.55, rot: 0.15 }, npcScale: 0.94,
    fox: { x: -1.2, z: 1.25 },
    idle: ['idle'],
    greet: ['Hmm? Oh! Company. Come in, slowly.', 'Welcome, sprout. Shoes off. Shell on.'],
    bye: ['Off you go. No rush. Never any rush.', 'Come back in a century or two.'],
    chatter: ['Zzz...', 'Back in my day...', 'Hm. Tea.'],
  };
}
