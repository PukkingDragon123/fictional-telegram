// [v20 npc homes] Otis's riverside den: stick walls, a porthole on the river,
// Gerald the walleye in his tank (feed him!), a tackle box, a hammock, a
// shelf of skipping pebbles and a ship's bell.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, tank, chest, bell, bookshelf, rugOval, plant, barrel, crate, lamp, sign } from './homeKit.js';

// Gerald: an olive-gold walleye with big glassy eyes and a spiky dorsal fin (fine voxels, faces +X)
function gerald(v) {
  ell(v, 0, 0, 0, 5, 2, 1.6, (x, y) => (y > 0 ? 0x8a8a3a : y === 0 ? 0xc8b04a : 0xe8e0b0));
  for (let x = -4; x <= 4; x += 2) v.set(x, 1, 2, 0x5a5a2a);
  v.box(-8, -2, 0, -6, 2, 0, 0xa89a4a); v.set(-8, 0, 0, null);
  for (let x = -2; x <= 2; x++) v.set(x, 3 + (x % 2 === 0 ? 1 : 0), 0, 0x6a6a2a);
  for (const z of [1, -1]) { v.set(3, 1, z * 2, 0xf4f8e8); v.set(4, 1, z * 2, 0x2a2028); }
  v.set(5, -1, 0, 0x8a5a3a);
}

export function buildOtis(k, { night }) {
  k.room({
    floor: (x, z) => tone(x, 0, z, ((z + 200) % 6 === 0) ? 0x6a4a2a : 0x9a6a3e, 0x8a5e36, 0xaa7a48),
    wall: (x, y, z, side) => { const a = side === 'back' ? x : z; const band = Math.floor((y + Math.floor(hash3(Math.floor(a / 7), 0, 1) * 3)) / 3) % 2; const c = band ? 0x8a5a30 : 0x6a4222; return hash3(x, y, z) < 0.08 ? 0xa8743e : hash3(x, y, z + 3) < 0.02 ? 0x4a7a3a : c; },
    base: 0x4a3a2a, cap: 0x5a7a9a, lip: 0x3a4a5a,
    windows: [{ side: 'back', a0: -24, a1: -8, y0: 24, y1: 40, round: true, frame: 0xe8c050, bars: false, sky: (u, v, a, y) => (v < 0.45 ? (hash3(a, y, 1) < 0.15 ? 0x9ad8f0 : 0x3a8ac0) : mix(night ? 0x1a2240 : 0x9fd6f0, night ? 0x2a3a68 : 0xe8f6ff, v)) }],
  });
  rugOval(k, -6, 10, 28, 14, [0x3a6aa8, 0x4a7ab8, 0xe8e0c8, 0x3a6aa8]);

  // ---- Gerald's tank
  const tk = tank(k, { w: 30, h: 18, d: 12, stand: 11, col: 0x6a4424, fish: gerald });
  const fish = tk.userData.parts.fish;
  const feed = { t: 0, flakes: [] };
  k.prop('tank', tk, {
    x: 1.75, z: -1.6, label: "Gerald's tank",
    tap: {
      anim: ['hold_fish', 'happy'], sfx: 'bubble', lines: ['That\'s Gerald. Gerald is a walleye. Gerald knows things.', 'Don\'t tap the glass. He hates that. He loves you though.'],
      reward: { friend: 0.5 }, rewardLine: ['You fed Gerald! He says thanks. Gerald has never said thanks.'],
      effect: (c) => { feed.t = 3; c.fxAt('bubbles', new THREE.Vector3(1.75 + (Math.random() - 0.5) * 0.4, W(20), -1.6), 4, { rise: 0.3 }); for (let i = 0; i < 5; i++) { const s = flake(); s.position.set(1.75 + (Math.random() - 0.5) * 0.6, W(28), -1.6 + (Math.random() - 0.5) * 0.3); feed.flakes.push(s); } },
    },
  });
  const fmat = new THREE.SpriteMaterial({ color: 0xd8a040 });
  k.textures.add(fmat);
  function flake() { const s = new THREE.Sprite(fmat); s.scale.setScalar(0.03); k.group.add(s); return s; }
  k.every((dt, t) => {
    const u = fish.userData;
    feed.t = Math.max(0, feed.t - dt);
    const tx = feed.t > 0 ? 0 : Math.sin(t * 0.5) * u.hx, ty = feed.t > 0 ? W(6) : Math.sin(t * 0.8) * 0.04;
    fish.position.x += (tx - fish.position.x) * Math.min(1, dt * (feed.t > 0 ? 3 : 1));
    fish.position.y = u.home.y + ty;
    fish.position.z = u.home.z + Math.sin(t * 0.37) * u.hz;
    fish.rotation.y = feed.t > 0 ? 0 : (Math.cos(t * 0.5) > 0 ? 0 : Math.PI);
    fish.rotation.z = Math.sin(t * 4) * 0.05;
    for (let i = feed.flakes.length - 1; i >= 0; i--) { const s = feed.flakes[i]; s.position.y -= dt * 0.12; if (s.position.y < W(22) || feed.t <= 0) { s.removeFromParent(); feed.flakes.splice(i, 1); } }
  });

  // ---- tackle box
  const tb = chest(k, { w: 14, h: 7, d: 9, col: 0x3a8a5a, band: 0xd8d8e0, gold: false });
  const lures = k.v(); for (let x = -5; x <= 5; x += 2) lures.set(x, 5, 0, [0xd8403a, 0xffd84a, 0xf4e8c8, 0x5a9ad8][(x + 5) / 2 % 4 | 0]);
  tb.add(k.mesh(lures));
  k.prop('tackle', tb, {
    x: -0.6, z: -1.5, label: 'Tackle box',
    tap: {
      sfx: 'open', anim: ['cast_line', 'talk'], lines: ['Lures! This one\'s called Lucky Larry. Never caught a thing.', 'Hooks, bobbers, one sad sandwich.'],
      reward: { food: { id: 'worms', n: 2 } }, rewardLine: ['Spare worms. Pike go wild for \'em.'],
      effect: (c) => { const l = c.parts.lid; c.tween(0.5, (q) => { l.rotation.x = -q * 1.7; }); c.later(2.6, () => c.tween(0.5, (q) => { l.rotation.x = -(1 - q) * 1.7; })); },
    },
  });

  // ---- hammock between two posts
  const hm = k.obj('hammock', null);
  const hv = k.v();
  for (const x of [-20, 19]) hv.box(x, 0, 0, x + 1, 26, 1, 0x6a4424);
  for (let x = -18; x <= 17; x++) { const y = Math.round(10 + ((x + 0.5) / 18) ** 2 * 10); for (let z = -4; z <= 5; z++) hv.set(x, y, z, ((x + 40) % 4 < 2) ? 0xd84a3a : 0xf4e8c8); }
  hv.line(-19, 24, 0, -18, 20, 0, 0xd8c090); hv.line(18, 24, 0, 17, 20, 0, 0xd8c090);
  hm.add(k.mesh(hv));
  k.prop('hammock', hm, {
    x: -1.75, z: -0.15, rot: 0.5, label: 'Hammock',
    tap: { anim: ['float_back', 'happy'], fx: 'zzz', fxN: 2, sfx: 'splash', lines: ['Practising my back float. On land. Like a pro.', 'Best nap spot this side of the river.'], effect: (c) => { c.tween(2, (q) => { hm.rotation.z = Math.sin(q * Math.PI * 4) * 0.06 * (1 - q); }); } },
  });

  // ---- pebble shelf
  const ps = bookshelf(k, {
    w: 20, h: 20, d: 7, col: 0x7e5228, rows: 2,
    fill: (v, y, h, hx) => { for (let x = -hx + 2; x < hx - 2; x += 3) ell(v, x + 0.5, y + 1, 0, 1.4, 1, 1.4, [0x9a968c, 0xc8c0b0, 0x7a7a82, 0xd8b8a0, 0x8aa0a8][(x + 40) % 5]); },
  });
  k.prop('pebbles', ps, {
    x: -0.2, y: 0, z: 0.0, label: 'Skipping pebbles', pad: 0.04,
    tap: { anim: ['juggle_pebble', 'happy'], sfx: 'plop', lines: ['Eleven skips. River record. Ask anyone.', 'Flat ones skip. Round ones sulk.', 'This one\'s Gerald\'s favourite. Don\'t tell the others.'] },
  });

  // ---- ship's bell
  const bl = bell(k, { hang: true, col: 0xe8c050 });
  const bracket = k.v(); bracket.box(-1, 0, -5, 0, 1, 0, 0x3a3a42); bracket.box(-1, -1, -5, 0, 0, -5, 0x3a3a42);
  bl.add(k.mesh(bracket));
  k.prop('bell', bl, {
    x: 2.85, y: 1.7, z: 0.2, rot: -Math.PI / 2, label: "Ship's bell", stand: [2.3, 0.4],
    tap: {
      sfx: 'bell', anim: ['happy', 'laugh'], lines: ['DING! Supper time! For Gerald.', 'Rings for high tide. And snacks.'],
      effect: (c) => { const b = c.parts.bell; c.tween(1.4, (q) => { b.rotation.z = Math.sin(q * Math.PI * 6) * 0.5 * (1 - q); }); },
    },
  });

  k.add(barrel(k, { col: 0x7a5a3a }), 2.6, 0, 1.2);
  const rods = k.v(); for (let i = 0; i < 3; i++) rods.line(i * 3, 0, 0, i * 3 + 2, 36, -2, [0xc8a050, 0x5a9ad8, 0xd8403a][i]);
  k.add(k.obj('rods', rods), -2.75, 0, -1.6);
  k.add(plant(k, { leaf: 0x3a9a5a, h: 9, pot: 0x5a7aa8 }), 0.8, 0, -1.75);
  k.add(sign(k, 'GERALD', { w: 0.55, h: 0.18, bg: '#e8dcb8', fg: '#2a4a6a' }), 1.75, W(31), -1.95);
  k.light(0xffd890, 1.0, 4.5, [-0.5, 2.0, -0.6]);
  k.light(0x8ad0ff, 0.9, 2.5, [1.75, 1.0, -1.2], 1.6);
  return {
    title: "Otis's Den", bg: 0x14222e,
    light: { sky: 0xe8f4ff, ground: 0x3a3a2a, hemi: 1.5, fillI: 0.8 },
    npc: { x: 0.65, z: -0.4, rot: 0.25 }, npcScale: 0.94,
    fox: { x: -1.3, z: 1.35 },
    greet: ['Ahoy! Come aboard, er, a-den!', 'Welcome! Say hi to Gerald. He\'s shy.'],
    bye: ['Fair winds, pond neighbour!', 'Gerald will miss you. He won\'t say it.'],
    chatter: ['Gerald, no.', 'Smell that? River.', 'Hm, the pike are grumpy today.'],
  };
}
