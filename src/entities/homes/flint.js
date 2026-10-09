// [F&S mining] Flint's place: a burrow dug into the quarry wall. Rough stone
// walls held up by timber props, a plank floor over the gravel, a pot-belly
// stove with a coffee pot, a shelf of rocks he has licked, an ore cart on a
// stub of rail, a crate of "gentle" dynamite, his bunk and a map of the mountain.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, stove, bookshelf, bed, crate, barrel, stool, sign, steamer } from './homeKit.js';

const ORE = [0xd0763e, 0xffcc34, 0x2a2830, 0xa85a3a, 0xa080e8, 0x9a929c, 0x4ab08a];
const pickRock = (x, y, z) => ORE[Math.floor(hash3(x, y, z) * ORE.length)];

export function buildFlint(k, { night, game }) {
  k.room({
    round: 22,
    floor: (x, z) => ((z + 200) % 8 === 0 ? 0x6a4a2a : (Math.abs(x) < 34 && z > -30) ? tone(x, 0, z, 0x9a6a3e, 0x8a5c34, 0xaa7848) : tone(x, 0, z, 0x7a7680, 0x6a6670, 0x8a8690)),
    wall: (x, y, z, side) => {
      const a = side === 'back' ? x : z;
      // timber props every so often, otherwise rough stone with ore flecks
      if ((a + 200) % 30 < 3) return y % 9 === 0 ? 0x4a3018 : 0x7a5228;
      if (y >= 46 && y <= 48) return 0x6a4424;
      const h = hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2));
      if (h < 0.025) return pickRock(x, y, z);
      return tone(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), 0x8e8690, 0x7a7280, 0x9e96a0, 0.25, 0.2);
    },
    base: 0x5a3a22, lip: 0x4a3a30,
    windows: [{ side: 'back', a0: 18, a1: 30, y0: 30, y1: 40, round: true, frame: 0x6a4424, sky: (u, v) => mix(night ? 0x141a34 : 0x9ad0ee, night ? 0x2a3460 : 0xe8f6ff, v) }],
  });

  // ---- pot-belly stove + coffee pot
  const sv = stove(k, { w: 16, h: 16, d: 14, col: 0x3a3a44, pipe: 34, pot: 0x5a7aa8 });
  const st = steamer(k, new THREE.Vector3(-2.38, W(24), -1.35), { n: 3, rise: 0.4, rate: 0.35 });
  st.on = false;
  const sl = k.light(0xff9a40, 0, 2.4, [-2.3, 0.4, -1.0]);
  k.prop('stove', sv, {
    x: -2.4, z: -1.45, label: 'Stove & coffee', stand: [-1.9, -0.4],
    tap: {
      anim: ['laugh', 'talk'], sfx: 'whoosh',
      lines: ['Coffee. Strong enough to dig with.', 'Forty years, same pot. Never washed it. That\'s the flavour.'],
      fox: ['Is it supposed to be that thick?'],
      effect: (c) => { c.parts.fire.visible = true; sl.intensity = 1.4; st.on = true; c.later(4.5, () => { if (c.parts.fire) c.parts.fire.visible = false; sl.intensity = 0; st.on = false; }); },
    },
  });

  // ---- the rock collection
  const shelf = bookshelf(k, { w: 26, h: 32, d: 9, col: 0x6a4424, rows: 4, fill: (v, y, h, hx, d, r) => { for (let x = -hx + 2; x < hx - 2; x += 3) { const c = pickRock(x, r, 7); ell(v, x, y + 1.5, 0, 1.4, 1.6 + hash3(x, r, 1), 1.4, (xx, yy, zz) => (yy > y + 2 ? shade(c, 1.2) : c)); } } });
  k.prop('rocks', shelf, {
    x: 1.0, z: -1.7, label: 'Rock collection',
    tap: {
      anim: ['bite_nugget', 'talk'], fx: 'sparks', fxN: 5, sfx: 'pick_clank',
      lines: ['Every rock has a story. That one\'s boring.', 'Licked every one. Science.', 'That one bit me back.'],
      effect: (c) => {
        if (!c.once()) return false;
        const kinds = ['copper', 'coal', 'iron', 'stone'];
        const id = kinds[(c.game.state.day || 1) % kinds.length];
        c.game.res?.add(id, 3);
        c.reward({ friend: 0.5 }, [`Take a few. ${id === 'coal' ? 'Coal\'s coal.' : 'Good ones.'} Don't lick 'em.`]);
        c.fx('sparks', 6);
        c.anim(['bite_nugget']);
        return true;
      },
    },
  });

  // ---- an ore cart on a stub of rail
  const cart = k.obj('cart', null);
  const rail = k.v();
  for (let x = -22; x <= 21; x++) { rail.set(x, 0, -4, 0x5a5a64); rail.set(x, 0, 3, 0x5a5a64); if ((x + 40) % 5 === 0) rail.box(x, -1, -6, x, -1, 5, 0x5a3a22); }
  cart.add(k.mesh(rail));
  const cb = k.v();
  cb.box(-7, 3, -6, 6, 11, 5, (x, y, z) => (y === 11 ? 0x6a6a74 : (x + y) % 5 === 0 ? 0x3a3a44 : 0x4a4a54));
  cb.box(-6, 4, -5, 5, 11, 4, null);
  for (let x = -6; x <= 5; x++) for (let z = -5; z <= 4; z++) { const top = 10 + Math.round(hash3(x, 0, z) * 2); for (let y = 8; y <= top; y++) cb.set(x, y, z, pickRock(x, y, z)); }
  for (const [x, z] of [[-5, -6], [4, -6], [-5, 5], [4, 5]]) for (let y = 0; y <= 2; y++) cb.set(x, y + 1, z + (z < 0 ? 0 : 0), 0x2a2a32);
  const cp = k.part(cart, 'body', cb, null, [0, 0, 0]);
  k.prop('cart', cart, {
    x: 1.9, z: 0.6, rot: -0.25, label: 'Ore cart',
    tap: {
      sfx: 'cart_roll', anim: ['laugh', 'happy'], lines: ['Push it? She rolls. She always rolls.', 'Best cart on the mountain. Only cart on the mountain.'],
      reward: { coins: 15 }, rewardLine: ['Found a coin in the ore. Finders keepers. You found it.'],
      effect: (c) => { c.tween(1.6, (q) => { cp.position.x = Math.sin(q * Math.PI) * 0.45; cp.rotation.z = Math.sin(q * Math.PI * 4) * 0.03; }); },
    },
  });

  // ---- the dynamite crate
  const dc = crate(k, { w: 14, h: 9, d: 10, col: 0xb07a46 });
  const sticks = k.v();
  for (let i = 0; i < 5; i++) for (let y = 0; y <= 5; y++) for (let dx = 0; dx <= 1; dx++) sticks.set(-5 + i * 2 + dx, 9 + y, -1 + (i % 2), y === 5 ? 0xf2e8d0 : 0xd8302a);
  k.part(dc, 'sticks', sticks, null, [0, 0, 0]);
  k.add(sign(k, 'GENTLE', { w: 0.42, h: 0.14, bg: '#f4e8c8', fg: '#c8302a', border: '#6a4424' }), -0.95, W(5), 1.1 + W(5.2));
  k.prop('dynamite', dc, {
    x: -0.95, z: 1.05, label: 'Gentle dynamite', pad: 0.1,
    tap: {
      anim: ['gentle_boom'], sfx: 'fuse_fizz', lines: ['Gentle dynamite. Wouldn\'t hurt a fly. Might annoy it.', 'Stand back. ...Further. ...Ok, that\'s far enough.'],
      fox: ['My FUR!', 'Was that... it?'],
      effect: (c) => { c.later(3.0, () => { c.sfx('pfft', 0.45); c.fx('puff', 8, { spread: 0.5, rise: 0.6, size: 0.18 }); }); },
    },
  });

  // ---- his bunk
  const bk = bed(k, { w: 24, d: 34, col: 0x7a5228, blanket: 0xc83c34, pillow: 0xe8e4d8, h: 9, head: 16 });
  k.prop('bunk', bk, {
    x: -2.25, z: 0.75, rot: Math.PI / 2, label: 'Bunk',
    tap: { anim: ['laugh', 'talk'], fx: 'zzz', fxN: 3, sfx: 'sleep', lines: ['Forty years, one pillow. Still lumpy.', 'I sleep with my helmet on. Rocks fall. Habits stick.'], expr: 'sleepy' },
  });

  // ---- a map of the mountain on the wall
  const { mesh: map } = k.canvasPlane(64, 44, 0.9, 0.62, (ctx, w, h) => {
    ctx.fillStyle = '#4a3018'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8d8a8'; ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#9a8a6a';
    for (const [x, y, s] of [[12, 30, 10], [30, 26, 14], [48, 30, 10]]) { ctx.beginPath(); ctx.moveTo(x - s, y + 8); ctx.lineTo(x, y - s); ctx.lineTo(x + s, y + 8); ctx.fill(); }
    ctx.fillStyle = '#f6f0e0'; for (const [x, y] of [[30, 13], [12, 21]]) { ctx.beginPath(); ctx.moveTo(x - 3, y + 3); ctx.lineTo(x, y - 1); ctx.lineTo(x + 3, y + 3); ctx.fill(); }
    ctx.strokeStyle = '#c8302a'; ctx.lineWidth = 2;
    for (const [x, y] of [[18, 31], [36, 22], [44, 34], [25, 36], [52, 27], [8, 34]]) { ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + 2, y + 2); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.stroke(); }
    ctx.fillStyle = '#3a2a1a'; ctx.font = 'bold 7px monospace'; ctx.fillText('GOLD?', 34, 11);
  });
  const mp = k.obj('map', null); mp.add(map);
  k.prop('map', mp, {
    x: -0.4, y: 1.55, z: -1.97, label: 'Map of the mountain', pad: 0.1,
    tap: { anim: ['talk', 'swing_pick'], sfx: 'paper', lines: ['X marks the spot. There are forty X\'s.', 'Gold\'s up high. Crystals up higher. Bring a scarf.', 'That X is a sandwich I lost in 1987.'] },
  });

  // ---- static bits: pickaxes on a rack, a lantern, a barrel of water, a stool
  k.deco((R) => {
    for (let i = 0; i < 3; i++) {
      const x0 = 30 + i * 6;
      for (let y = 8; y <= 30; y++) R.set(x0, y, -38, 0xb07c46);
      for (let x = x0 - 4; x <= x0 + 4; x++) R.set(x, 30 - Math.round(Math.abs(x - x0) * 0.4), -38, 0xb8c0cc);
    }
    for (let x = 26; x <= 50; x++) R.set(x, 32, -39, 0x6a4424);
  });
  k.add(barrel(k, { col: 0x8a5a2e, h: 13, r: 5 }), 2.55, 0, -1.2);
  k.add(stool(k, { col: 0x7a5228, h: 9, r: 4 }), -1.6, 0, -0.55);
  const lan = k.v(); lan.box(-2, 0, -2, 1, 0, 1, 0x3e3e48); lan.box(-2, 6, -2, 1, 6, 1, 0x3e3e48); lan.box(-1, 7, -1, 0, 8, 0, 0x3e3e48);
  const lanG = k.v(); lanG.box(-1, 1, -1, 0, 5, 0, 0xffd070);
  k.add(k.obj('lantern', lan, lanG), 0.35, W(28), -1.9);
  k.light(0xffc070, 1.25, 4.2, [0.35, 1.6, -1.2]);
  k.light(0xffd8a0, 0.6, 5, [-1.5, 2.2, 0.6]);
  void game; void PAL;
  return {
    title: 'Flint\'s Burrow', bg: 0x1a1612,
    light: { sky: 0xffe8d0, ground: 0x5a4a3a, hemi: 1.35, fillI: 0.8 },
    npc: { x: 0.2, z: -0.5, rot: 0.1 }, npcScale: 0.94,
    fox: { x: -1.0, z: 1.4 },
    greet: ['Hrmph. Wipe your boots. It\'s a burrow, not a barn.', 'Come in, come in. Mind the dynamite.'],
    bye: ['Off you go. Dig responsibly.', 'Close the door. Drafty mountain.'],
    chatter: ['Hrm.', '*sniff* Copper. Somewhere.', 'Where did I put my good rock...'],
    idle: ['idle'],
  };
}
