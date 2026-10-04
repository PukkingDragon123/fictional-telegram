// [v20 npc homes] Rocco's hoard in the mushroom hut: purple gloom, piles of
// "found" stuff, a safe with a spinning dial, a trash can to rummage in, a
// coin pile he counts, a gramophone and a crate of totally legit goods.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, chest, gramophone, table, crate, barrel, lamp, frame, bookshelf, rugOval, sign } from './homeKit.js';

export function buildRocco(k, { night }) {
  k.room({
    floor: (x, z) => tone(x, 0, z, ((x + 200) % 9 === 0) ? 0x3a2e3e : 0x5a4a5e, 0x4e4052, 0x66566a),
    wall: (x, y, z, side) => { const a = side === 'back' ? x : z; const stripe = Math.floor((a + 200) / 5) % 2; const c = stripe ? 0x5a4a78 : 0x4e406a; return hash3(x, y, z) < 0.03 ? 0x6a5a88 : (y === 18 ? 0x3a2e4a : c); },
    base: 0x2e243a, cap: 0x8a5a9a, lip: 0x3a2e4a,
    windows: [{ side: 'back', a0: -46, a1: -36, y0: 24, y1: 34, round: true, frame: 0xc8a050, sky: (u, v) => mix(night ? 0x1a1430 : 0x8a7ab0, night ? 0x3a2a58 : 0xc8b8e0, v) }],
  });
  rugOval(k, 0, 8, 26, 14, [0x8a3a4a, 0xa84a5a, 0xd8a050, 0x8a3a4a]);
  // junk piles along the walls (static)
  const junk = [0xc8a050, 0x8a8a92, 0xd8403a, 0x5a9ad8, 0xf4e8c8, 0x6aa84a, 0xb87a3a, 0xa8a8b0];
  k.deco((R) => { for (const [cx, cz, r, h] of [[-48, -28, 12, 10], [44, 16, 10, 7], [-50, 20, 8, 6], [10, -32, 9, 7]]) for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) { const d = Math.hypot(x - cx, (z - cz) * 1.2) / r; if (d > 1) continue; const top = Math.round(h * (1 - d * d) + hash3(x, 0, z) * 2); for (let y = 0; y < top; y++) R.set(x, y, z, junk[Math.floor(hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2)) * junk.length)]); } });

  // ---- the safe
  const sf = k.obj('safe', null);
  const sv = k.v(); sv.box(-8, 0, -7, 7, 18, 6, (x, y, z) => tone(x, y, z, 0x4a4a58, 0x3e3e4a, 0x5a5a68)); sv.box(-6, 2, 7, 5, 16, 7, 0x5a5a6a); sv.box(4, 7, 8, 4, 11, 8, 0xc8a050);
  sf.add(k.mesh(sv));
  const dial = k.v(); for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (Math.hypot(x, y) <= 3.2) dial.set(x, y, 0, Math.hypot(x, y) > 2.4 ? 0xc8a050 : (x === 0 && y > 0 ? PAL.ink : 0xe8d8a0));
  const dp = k.part(sf, 'dial', dial, null, [-1, 10, 8]);
  k.prop('safe', sf, {
    x: 2.2, z: -1.55, rot: -0.3, label: 'Safe',
    tap: {
      sfx: 'tick', anim: ['count_coins', 'show_item'],
      lines: ['Combination? My birthday. Which I also don\'t know.', 'Nothing in here. Move along.'],
      reward: { coins: 25 }, rewardLine: ['Here. Don\'t ask where it\'s from.'],
      effect: (c) => { c.tween(1.2, (q) => { dp.rotation.z = Math.sin(q * Math.PI * 3) * 2.5; }); },
    },
  });

  // ---- trash can to rummage in
  const tc = barrel(k, { col: 0x8a8a92, h: 14, r: 5, lid: false });
  const lid = k.v(); lid.cylinder(-0.5, 0, -0.5, 6, 1, 0x9a9aa2); lid.box(-1, 1, -1, 0, 1, 0, 0x6a6a72);
  const lp = k.part(tc, 'lid', lid, null, [0, 14, 0]);
  const FINDS = ['A left boot. Very rare. Size: one.', 'Half a sandwich! Vintage.', 'A golden spoon. Probably brass. Probably.', 'A map to... the trash can. Huh.', 'Ooh, a bottle cap. Collector\'s item.'];
  k.prop('trash', tc, {
    x: -2.4, z: -0.4, label: 'Trash can',
    tap: {
      sfx: 'crunch', fx: 'puff', fxN: 4, anim: ['rummage', 'show_item'],
      effect: (c) => { c.tween(0.4, (q) => { lp.rotation.x = -q * 1.2; lp.position.y = W(14) + q * 0.1; }); c.later(2.2, () => c.tween(0.4, (q) => { lp.rotation.x = -(1 - q) * 1.2; lp.position.y = W(14) + (1 - q) * 0.1; })); c.anim(['rummage']); c.later(0.8, () => c.say(FINDS[Math.floor(Math.random() * FINDS.length)])); return true; },
    },
  });

  // ---- coin pile on the counting table
  k.add(table(k, { w: 26, d: 14, h: 13, col: 0x4a3a2a }), -0.9, 0, -1.55);
  const cp = k.obj('coins', null, null);
  const cv = k.v(); for (let i = 0; i < 6; i++) { const cx = (i % 3) * 5 - 5, cz = Math.floor(i / 3) * 4 - 2; const h = 2 + (i * 7) % 5; for (let y = 0; y < h; y++) cv.cylinder(cx, y, cz, 1.6, 1, y % 2 ? 0xffd84a : 0xe8b830); }
  cp.add(k.mesh(cv));
  k.prop('coins', cp, {
    x: -0.9, y: W(14), z: -1.55, label: 'Coin pile', pad: 0.12,
    tap: { anim: ['count_coins'], sfx: 'coin', fx: 'coins', fxN: 4, lines: ['...forty-one, forty-two... don\'t look.', 'Shiny cash only. Shiny.', 'This one\'s a button. Still counts.'], fox: ['A raccoon after my own heart.'] },
  });

  // ---- gramophone
  const gr = gramophone(k, { col: 0x5a3a2a, horn: 0xc8a050 });
  k.add(crate(k, { w: 16, h: 10, d: 14, col: 0x8a6a40 }), 1.55, 0, 0.55);
  let spin = 0;
  k.prop('gramophone', gr, {
    x: 1.55, y: W(10), z: 0.55, rot: -0.4, label: 'Gramophone',
    tap: { sfx: 'chip', fx: 'notes', fxN: 6, anim: ['laugh', 'show_item'], lines: ['Smooth jazz. Fell off a moose.', 'One song. Forty years. Still slaps.'], effect: () => { spin = 8; } },
  });
  k.every((dt) => { spin = Math.max(0, spin - dt); gr.userData.parts.disc.rotation.y += dt * 6 * Math.min(1, spin); });

  // ---- legit goods crate
  const lg = crate(k, { w: 16, h: 11, d: 12, col: 0xb8884a, stuff: [0xffd84a, 0xd8403a, 0x5a9ad8, 0x8a6ac8, 0xf4e8c8] });
  const tag = sign(k, 'LEGIT', { w: 0.42, h: 0.14, bg: '#f4e8c8', fg: '#a82a28' });
  tag.position.set(0, W(6), W(6.2));
  lg.add(tag);
  k.prop('goods', lg, {
    x: -1.9, z: 0.75, rot: 0.3, label: 'Legit goods',
    tap: { anim: ['show_item', 'count_coins'], sfx: 'pop_in', lines: ['All legit. See? Says so on the box.', 'Rare stuff. Rare like... rare.'], reward: { food: { id: 'truffle', n: 1 } }, rewardLine: ['A truffle. Found it. In a mushroom. Legally.'] },
  });

  k.add(lamp(k, { shadeCol: 0xc85a9a, h: 26 }), 2.7, 0, 0.1);
  k.add(bookshelf(k, { w: 18, h: 26, d: 8, col: 0x3a2e3a, books: [0xc8a050, 0x8a3a4a, 0x5a5a6a] }), 0.75, 0, -1.75);
  const pic = frame(k, { w: 12, h: 9, col: 0xc8a050, art: (x, y) => (Math.hypot(x - 5.5, y - 4) < 3 ? 0x8a8a92 : 0x4a3a5a) });
  k.add(pic, -0.9, 1.6, -1.97);
  k.light(0xff9ad0, 1.0, 4, [2.6, 1.4, 0.2], 1.4);
  k.light(0xffd890, 0.9, 4, [-0.9, 1.6, -1.0], 1.4);
  return {
    title: "Rocco's Hoard", bg: 0x150f1e, music: 'lab',
    light: { sky: 0xe0c8ff, ground: 0x2e2238, hemi: 1.25, fillI: 0.7 },
    npc: { x: 0.45, z: -0.5, rot: 0.2 }, npcScale: 0.94,
    fox: { x: -1.2, z: 1.35 },
    greet: ['Psst. Get in, quick. Close the door.', 'Welcome to the vault. Touch nothing. Okay, touch some things.'],
    bye: ['You were never here.', 'Come back with shiny stuff.'],
    chatter: ['Heh.', 'Where\'d I put that spoon...', 'Shiny...'],
  };
}
