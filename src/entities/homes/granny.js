// [v20 npc homes] Granny Ribbit's lily-pad kitchen in the swamp shack: green
// tiles, a lily-pad rug, a bubbling bug stew on the stove, a shelf of glowing
// bug jars, her knitting chair, a pantry of worms and a whistling kettle.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, cupboard, openDoors, stove, table, bookshelf, teapot, steamer, plant, stool, barrel } from './homeKit.js';
import { spriteMat } from '../critterKit.js';

export function buildGranny(k, { night }) {
  k.room({
    floor: (x, z) => tone(x, 0, z, ((x + 200) % 6 === 0) ? 0x5a4a2e : 0x7a6a42, 0x6a5a38, 0x8a7a4e),
    wall: (x, y, z, side) => {
      if (y < 22) { const a = side === 'back' ? x : z; return (a % 6 === 0 || y % 6 === 0) ? 0xd8e8c8 : ((Math.floor(a / 6) + Math.floor(y / 6)) % 2 ? 0x6ab06a : 0x7ac07a); }
      if (y === 22) return 0x4a7a3a;
      return tone(x, y, z, 0xb8d8a0, 0xa8c890, 0xc8e4b0, 0.1, 0.1);
    },
    base: 0x4a7a3a, cap: 0x4a6a32, lip: 0x4a5a32,
    windows: [{ side: 'back', a0: -8, a1: 8, y0: 26, y1: 40, frame: 0xe8e0c8, sky: (u, v, a, y) => (hash3(a, y, 4) < 0.06 ? 0x9ad0e8 : mix(night ? 0x1a2a30 : 0x6a9a7a, night ? 0x2a3a48 : 0xa8c8b0, v)) }],
  });
  // lily-pad rug: a few round pads with a notch
  for (const [cx, cz, r] of [[-14, 10, 9], [4, 14, 7], [16, 6, 6], [-4, 2, 5]]) k.rug(cx - r, cz - r, cx + r, cz + r, (x, z) => { const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d > r) return null; if (dx > 0 && Math.abs(dz) < (dx / r) * 2) return null; return d > r - 1 ? 0x3a8a3a : (Math.abs(Math.atan2(dz, dx) * 3) % 1 < 0.15 ? 0x4a9a3a : 0x5aae4a); });

  // ---- stove with bug stew
  const sv = stove(k, { col: 0x4a4a52, pot: 0x3a3a42 });
  const stew = k.v(); stew.cylinder(-0.5, 0, -0.5, 3, 1, (x, y, z) => (hash3(x, y, z) < 0.3 ? 0x8a6a2a : 0x6a8a3a));
  const sp = k.part(sv, 'stew', stew, null, [-6.5, 23, 0]);
  sp.position.x = W(-6.5 + 0.5);
  k.prop('stove', sv, {
    x: -1.9, z: -1.6, label: 'Bug stew', stand: [-1.6, -0.6],
    tap: {
      anim: ['tongue_catch', 'laugh'], sfx: 'bubble', fx: 'bubbles', fxN: 6,
      lines: ['Bug stew, dearie. Seven beetles, one secret.', 'Stir it widdershins or it sulks.'],
      reward: { food: { id: 'bugbites', n: 3 } }, rewardLine: ['A scoop for your fish, dear. They\'ll thank me.'],
      fox: ['I will NOT be tasting that.'],
      effect: (c) => { c.parts.fire.visible = true; fireL.intensity = 1.2; c.later(5, () => { if (c.parts.fire) c.parts.fire.visible = false; fireL.intensity = 0; }); },
    },
  });
  const fireL = k.light(0xff8a3a, 0, 2.2, [-1.9, 0.3, -1.1]);

  // ---- shelf of bug jars (fireflies glow)
  const jars = bookshelf(k, {
    w: 26, h: 30, d: 8, col: 0x5a4a2a, rows: 3,
    fill: (v, y, h, hx, d, r) => { for (let x = -hx + 2; x < hx - 3; x += 5) { v.cylinder(x + 1.5, y, 0, 2, Math.min(h - 1, 6), (xx, yy) => (yy === y + Math.min(h - 1, 6) - 1 ? 0x8a6a3a : 0xd8f0e0)); v.set(x + 1, y + 1, 0, [0x3a2a1a, 0x5a8a2a, 0xa83a2a, 0x6a4a8a][(x + r * 3 + 40) % 4]); } },
  });
  const glows = [];
  const fmat = spriteMat(['.y.', 'yYy', '.y.']);
  for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(fmat); s.scale.setScalar(0.05); s.position.set(W(-10 + (i % 4) * 5 + 1.5), W(4 + Math.floor(i / 4) * 9), W(1)); s.visible = false; jars.add(s); glows.push(s); }
  k.prop('jars', jars, {
    x: 0.6, z: -1.75, label: 'Bug jars',
    tap: {
      anim: ['laugh', 'talk'], sfx: 'bees',
      lines: ['Fireflies! They light up when you say hello.', 'Mayflies, june bugs, one very rude hornet.', 'Labelled by mood, dear. Not species.'],
      effect: (c) => { for (const g of glows) g.visible = true; c.later(6, () => { for (const g of glows) g.visible = false; }); },
    },
  });
  k.every((dt, t) => { glows.forEach((g, i) => { g.scale.setScalar(0.04 + Math.abs(Math.sin(t * 3 + i)) * 0.03); }); });

  // ---- rocking chair with knitting
  const rc = k.obj('rocker', null);
  const rv = k.v();
  rv.box(-7, 7, -6, 6, 8, 5, 0x8a5a32); for (let y = 9; y <= 24; y++) rv.box(-7, y, -7 - Math.floor((y - 9) / 5), 6, y, -7 - Math.floor((y - 9) / 5), (x) => (x % 3 === 0 ? 0x7a4a28 : 0x9a6a3a));
  for (const x of [-7, 6]) { for (let z = -9; z <= 8; z++) rv.set(x, Math.round(((z) / 9) ** 2 * 2), z, 0x6a4424); rv.box(x, 1, -5, x, 6, -5, 0x6a4424); rv.box(x, 1, 4, x, 6, 4, 0x6a4424); rv.box(x, 9, -6, x, 13, 4, 0x6a4424); }
  ell(rv, 2, 10, 2, 3, 2.5, 3, 0xd87ab0); rv.line(0, 11, 0, 4, 14, 3, 0xc8c8d0); rv.line(4, 11, 0, 0, 14, 3, 0xc8c8d0);
  rc.add(k.mesh(rv));
  const rock = { t: 0 };
  k.prop('knitting', rc, {
    x: 2.1, z: 0.1, rot: -0.5, label: 'Knitting chair',
    tap: {
      anim: ['knit', 'sit_knit', 'laugh'], sfx: 'tick',
      lines: ['A scarf for Shellby. Year nine of knitting it.', 'Knit one, purl two, eat a fly.', 'Pink. Everyone looks better in pink.'],
      reward: { friend: 0.5 }, rewardLine: ['Here, a little cosy for your teapot, dear.'],
      effect: () => { rock.t = 4; },
    },
  });
  k.every((dt, t) => { rock.t = Math.max(0, rock.t - dt); rc.rotation.x = Math.sin(t * 2.4) * 0.08 * Math.min(1, rock.t); });

  // ---- pantry
  const pan = cupboard(k, { w: 18, h: 30, d: 10, col: 0x6a8a4a, door: 0x7a9a5a, items: [0xc8a060, 0xd8403a, 0x8a6a3a, 0xf4e8c8, 0x5a8a3a] });
  k.prop('pantry', pan, {
    x: 2.35, z: -1.6, label: 'Pantry',
    tap: {
      sfx: 'open', anim: ['happy', 'talk'], lines: ['Worms, grubs, and biscuits. For guests.', 'Never open the bottom jar. Trust Granny.'],
      reward: { food: { id: 'worms', n: 3 } }, rewardLine: ['Wiggle worms! Fresh this morning, dear.'],
      effect: (c) => { c.tween(0.5, (q) => openDoors(c.obj, q)); c.later(2.8, () => c.tween(0.5, (q) => openDoors(c.obj, 1 - q))); },
    },
  });

  // ---- kettle on a little table
  k.add(table(k, { w: 18, d: 14, h: 12, col: 0x7a5a32, cloth: 0xd87ab0 }), -0.4, 0, 0.75);
  const ket = teapot(k, { col: 0x9a9aa8 });
  const st = steamer(k, new THREE.Vector3(-0.1, W(18), 0.75), { n: 3, rise: 0.4 });
  st.on = false;
  k.prop('kettle', ket, {
    x: -0.45, y: W(13), z: 0.75, label: 'Kettle', pad: 0.12,
    tap: {
      sfx: 'whistle', anim: ['laugh', 'talk'], lines: ['Swamp tea. It\'s brown on purpose.', 'Whistles like my late husband. Bless him.'],
      effect: (c) => { st.on = true; c.later(3, () => { st.on = false; }); const l = c.parts.lid; c.tween(1.2, (q) => { l.position.y = W(6) + Math.abs(Math.sin(q * Math.PI * 6)) * 0.04; }); },
    },
  });
  k.add(stool(k, { col: 0x7a5a32, cushion: 0xd87ab0 }), -1.05, 0, 0.85);
  k.add(barrel(k, { col: 0x6a5a3a }), -2.6, 0, 0.5);
  k.add(plant(k, { leaf: 0x3a8a4a, flower: 0xf0a0c0, h: 10 }), -2.65, 0, -0.4);
  // herbs hanging from the side wall
  k.deco((R) => { for (let i = 0; i < 5; i++) { const z = -30 + i * 6; for (let y = 30; y < 40; y++) R.set(-59, y, z, y === 39 ? 0x6a4424 : hash3(i, y, 2) < 0.5 ? 0x5a8a3a : 0x7aaa4a); } });
  k.light(0xffc890, 1.0, 4.5, [0.3, 2.0, -0.6]);
  return {
    title: "Granny's Kitchen", bg: 0x18241a,
    light: { sky: 0xf0ffe0, ground: 0x3a4a2a, hemi: 1.5, fillI: 0.8 },
    npc: { x: 0.1, z: -0.65, rot: 0.2 }, npcScale: 0.94,
    fox: { x: -1.4, z: 1.3 },
    greet: ['Ribbit! Come in, dearie, come in!', 'Oh, you look thin. Sit, sit!'],
    bye: ['Take a mealworm for the road, dear!', 'Wrap up warm. Ribbit!'],
    chatter: ['Ribbit.', '*zap* ...pardon me.', 'Where did I put my glasses?'],
  };
}
