// [v20 npc homes] Professor Hoot's lookout nest: a little observatory under the
// fire tower. Starry wallpaper, a big round window, a brass telescope, bird
// charts, a twig nest bed and a cuckoo clock.
import * as THREE from 'three';
import { HomeKit, W, PAL, shade, mix, tone, hash3, ell, bookshelf, table, clock, plant, rugOval, lamp, stool } from './homeKit.js';

export function buildHoot(k, { game, night }) {
  const NAVY = 0x2e3a5e, NAVY_D = 0x26304e;
  k.room({
    floor: (x, z) => tone(x, 0, z, ((x + 200) % 8 === 0) ? 0x8a5a32 : 0xa8743e, 0x96643a, 0xb88450),
    wall: (x, y, z, side) => {
      if (side !== 'back' && y < 26) return tone(x, y, z, 0x9a6a3e, 0x8a5a32, 0xaa7a48);
      if (y < 26) return (y % 6 === 0) ? 0x7e5228 : tone(x, y, z, 0x9a6a3e, 0x8a5a32, 0xaa7a48);
      if (y === 26) return 0x6a4424;
      const s = hash3(x, y, z === undefined ? 0 : z);
      return s < 0.025 ? 0xfff2b0 : s < 0.04 ? 0xbfd0ff : tone(x, y, z, NAVY, NAVY_D, 0x3a4870, 0.2, 0.1);
    },
    base: 0x6a4424, cap: 0x5a3a22, lip: 0x5a3a22,
    windows: [{ side: 'back', a0: 22, a1: 44, y0: 26, y1: 50, round: true, frame: 0xe8c050, bars: true, sky: (u, v, a, y) => (hash3(a, y, 3) < 0.05 ? 0xffffff : mix(night ? 0x1a2248 : 0xf0a070, night ? 0x3a4a88 : 0x7ab8e8, v)) }],
  });
  // a twiggy rug
  rugOval(k, -10, 10, 22, 14, [0x8a6a3a, 0x9a7a44, 0x7a5a30, 0xb08a4a]);

  // ---- telescope on a tripod, aimed at the window
  const tel = k.obj('telescope', null);
  const legs = k.v();
  for (const a of [0, 2.1, 4.2]) for (let i = 0; i < 22; i++) legs.set(Math.round(Math.cos(a) * (8 - i * 0.33)), i, Math.round(Math.sin(a) * (8 - i * 0.33)), i % 7 === 0 ? 0x5a3a22 : 0x7e5228);
  legs.box(-1, 22, -1, 0, 24, 0, PAL.brassD);
  tel.add(k.mesh(legs));
  const tube = k.v();
  for (let z = -16; z <= 12; z++) { const r = z < -12 ? 3.4 : 2.6 - z * 0.03; for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) if (Math.hypot(x + 0.5, y + 0.5) <= r) tube.set(x, y, z, z === -16 || z === -10 || z === 4 ? 0xb88e2a : tone(x, y, z, PAL.brass, PAL.brassD, 0xfff0a0, 0.12, 0.18)); }
  tube.box(-1, -1, 13, 0, 0, 15, 0x3a3a42);
  const tp = k.part(tel, 'tube', tube, null, [0, 26, 0]);
  tp.rotation.x = 0.55;
  k.prop('telescope', tel, {
    x: 0.9, z: -0.9, rot: Math.PI + 0.2, label: 'Telescope',
    tap: {
      anim: ['binoculars', 'head_turn', 'happy'], sfx: 'whoosh',
      lines: ['Hoo! A nuthatch on the moon. No. A smudge.', 'Twelve geese, heading south. Early this year.', 'I can see your pond from here. Lovely algae.'],
      reward: { coins: 15 }, rewardLine: ['A comet! Write that down! Here, for your trouble.'],
      fox: ['Can it see coins from here?', 'I spy... profit.'],
      effect: (c) => { const t = c.parts.tube; c.tween(1.2, (q) => { t.rotation.x = 0.55 + Math.sin(q * Math.PI) * 0.35; t.rotation.y = Math.sin(q * Math.PI * 2) * 0.3; }); c.fx('sparks', 4); },
    },
  });

  // ---- bird charts on the back wall (canvas)
  const birds = (game.state.birdsSpotted || []).length;
  const chart = k.canvasPlane(96, 64, 1.5, 1.0, (ctx) => {
    ctx.fillStyle = '#f2e6c8'; ctx.fillRect(0, 0, 96, 64);
    ctx.fillStyle = '#6a4424'; ctx.fillRect(0, 0, 96, 3); ctx.fillRect(0, 61, 96, 3);
    const cols = ['#c8402a', '#3a6aa8', '#e8a030', '#5aae3c', '#8a6ac8', '#2a2028', '#d8709a', '#7a5a3a'];
    for (let i = 0; i < 12; i++) {
      const x = 6 + (i % 4) * 23, y = 7 + Math.floor(i / 4) * 18;
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(x + 2, y + 4, 9, 5); ctx.fillRect(x + 9, y + 2, 4, 4); ctx.fillRect(x, y + 5, 3, 2); ctx.fillRect(x + 13, y + 3, 2, 1);
      ctx.fillStyle = '#2a2028'; ctx.fillRect(x + 4, y + 9, 1, 3); ctx.fillRect(x + 7, y + 9, 1, 3);
      ctx.fillStyle = i < birds ? '#3a9a3a' : '#c8b898'; ctx.fillRect(x + 15, y + 6, 4, 4);
    }
  });
  const ch = new THREE.Group(); ch.add(chart.mesh); ch.userData.parts = {};
  k.prop('charts', ch, {
    x: -1.6, y: 1.5, z: -1.97, label: 'Bird charts', stand: [-1.6, -0.9],
    tap: {
      anim: ['write_notes', 'talk'],
      lines: [`${birds} species spotted so far. Hoo! Keep looking up.`, 'Waxwings: masked bandits of the sky.', 'Tick a box, feel alive. That is birding.'],
      fox: ['Do any of them taste like fish?'],
    },
  });

  // ---- the nest bed
  const nest = k.obj('nest', null);
  const nv = k.v();
  ell(nv, -0.5, 4, -0.5, 14, 5, 11, (x, y, z) => (Math.hypot((x + 0.5) / 11, (z + 0.5) / 8) < 1 && y > 4 ? null : (hash3(x, y, z) < 0.3 ? 0x6a4a28 : hash3(x, y, z) < 0.6 ? 0x9a7a44 : 0x8a6a3a)));
  ell(nv, -0.5, 5, -0.5, 10, 2, 7, (x, y, z) => ((x + z) % 4 === 0 ? 0xc8402a : 0xf4e8c8));
  nv.paint((x, y, z, c) => (y < 0 ? null : c));
  ell(nv, -6, 8, -4, 4, 2.5, 3, 0xfaf6ea); // pillow
  nest.add(k.mesh(nv));
  k.prop('nest', nest, {
    x: -2.15, z: 0.1, label: 'Nest bed',
    tap: { anim: ['sleepy', 'head_turn', 'talk'], fx: 'zzz', fxN: 3, sfx: 'fox_snore', lines: ['I nap in four-minute shifts. Ranger rules.', 'Twigs, moss and one very good sock.', 'Owls sleep in the day. I sleep whenever.'] },
  });

  // ---- cuckoo clock
  const cl = clock(k, { wall: true, cuckoo: true, col: 0x7e5228 });
  k.prop('cuckoo', cl, {
    x: 2.35, y: 1.25, z: -1.9, label: 'Cuckoo clock', stand: [2.0, -0.8],
    tap: {
      sfx: 'bird_chirp', anim: ['head_turn', 'laugh'],
      lines: ['Cuckoo! He is always four minutes fast.', 'A cuckoo in an owl house. Scandalous.', 'Time for tea! Or birds. Usually birds.'],
      effect: (c) => { const b = c.parts.bird; b.visible = true; c.tween(1.4, (q) => { b.position.z = W(Math.sin(Math.min(1, q * 1.5) * Math.PI) * 7); }, () => { b.visible = false; }); c.later(0.4, () => c.sfx('bird_chirp', 0.35, { pitch: 1.3 })); },
    },
  });
  k.every((dt, t) => { const p = cl.userData.parts.pend; p.rotation.z = Math.sin(t * 3) * 0.3; });

  // ---- desk with a seed jar
  const desk = table(k, { w: 30, d: 16, h: 15, col: 0x8a5a32 });
  k.add(desk, 2.0, 0, -1.4);
  const jar = k.obj('jar', null);
  const jv = k.v();
  jv.cylinder(-0.5, 0, -0.5, 3, 7, (x, y, z) => (y === 6 ? 0x8a5a32 : y > 4 ? 0xe8f4ff : hash3(x, y, z) < 0.5 ? 0x5a4a3a : 0xf2e2b0));
  jar.add(k.mesh(jv));
  k.prop('seeds', jar, {
    x: 1.55, y: W(16), z: -1.35, label: 'Seed jar', pad: 0.1,
    tap: { anim: ['happy', 'talk'], sfx: 'chip', lines: ['Seeds for the finches. Not for foxes.', 'Every seed is a tiny bird ticket.'], reward: { food: { id: 'sunflower', n: 2 } }, rewardLine: ['Plant these. Finches adore a sunflower.'] },
  });
  // notebook + quill on the desk
  k.deco(() => {});
  const book = k.v(); book.box(0, 0, 0, 7, 1, 5, 0xf4e8c8); book.box(0, 2, 0, 7, 2, 5, 0x3a6aa8); book.box(9, 0, 1, 9, 6, 1, 0xfaf6ea);
  k.add(k.obj('notes', book), 2.2, W(16), -1.6, 0.2);

  // decor
  k.add(bookshelf(k, { w: 22, h: 36, d: 8, col: 0x6a4424 }), -2.45, 0, -1.75);
  k.add(plant(k, { leaf: 0x5a9a4a, h: 14 }), -0.3, 0, -1.75);
  k.add(lamp(k, { shadeCol: 0x9ab84a }), 2.75, 0, -0.2);
  k.add(stool(k, { col: 0x8a5a32, cushion: 0x869034 }), 2.4, 0, -0.75);
  k.light(0xffd890, 1.2, 4.5, [2.7, 1.6, 0], 1.4);
  k.light(night ? 0x8aa8ff : 0xffc890, 1.0, 5, [0.3, 2.0, -1.5]);
  return {
    title: "Hoot's Lookout",
    bg: 0x1a1e30,
    light: { sky: 0xffe8cc, ground: 0x4a3a30, hemi: 1.5, fillI: 0.8 },
    npc: { x: 0.2, z: -0.5, rot: 0.25 },
    fox: { x: -1.4, z: 1.3 },
    greet: ['Hoo-hoo! Visitors! Mind the binoculars.', 'Welcome to the lookout. Whisper. Birds are listening.'],
    bye: ['Keep your eyes on the sky!', 'Hoo! Come back at dusk. Best birds.'],
    chatter: ['Was that a warbler? Hoo!', 'Note to self: more seeds.', 'Hm. Hmm. Hoo.'],
  };
}
