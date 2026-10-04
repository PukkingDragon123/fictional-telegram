// [v20 npc homes] Dale's riverside cabin (the old lumberjack hut): log walls,
// a humming mini-fridge of Daisy Beer, a boxy TV, his second-best lawn chair,
// a singing salmon on a plaque, a dartboard and a snack cooler.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, cupboard, openDoors, table, frame, rugOval, plant, crate, lamp, sign } from './homeKit.js';

const LOG = [0x9c6435, 0x8f5b2f, 0xa66d3a];
export function buildDale(k, { night, game }) {
  k.room({
    floor: (x, z) => tone(x, 0, z, ((x + 200) % 7 === 0) ? 0x7a4a2a : 0xb07a48, 0xa06a3c, 0xc08850),
    wall: (x, y, z, side) => { const c = Math.floor(y / 5); const row = y % 5; const base = LOG[c % 3]; return row === 0 ? 0xd8c49a : row === 1 ? shade(base, 0.85) : row === 4 ? shade(base, 1.06) : tone(x, y, z, base, shade(base, 0.9), shade(base, 1.08)); },
    base: 0x6a4424, cap: 0xa87444, lip: 0x6a4424,
    windows: [{ side: 'back', a0: 14, a1: 34, y0: 22, y1: 36, frame: 0xe8dcc0, sky: (u, v, a, y) => (v < 0.3 ? mix(0x3a7ab0, 0x5a9ad0, u) : mix(night ? 0x1a2240 : 0x9fd6f0, night ? 0x2a3a68 : 0xe0f4ff, v)) }],
  });
  // plaid rug
  k.rug(-34, -6, 4, 22, (x, z) => (((x + 40) % 8 < 2) || ((z + 40) % 8 < 2) ? 0x2a5a3a : ((x + z) % 2 ? 0xc83a2a : 0xb83226)));

  // ---- mini fridge full of Daisy Beer
  const fr = cupboard(k, { w: 16, h: 24, d: 12, col: 0xe8ecef, door: 0xf4f6f8, knob: 0x8a9aa8, single: true, items: [0xf2c83c, 0x3e9e52, 0xf2c83c, 0xffffff], glowInside: 0xe8f8ff, legs: 1 });
  const lightIn = k.light(0xd8f0ff, 0, 1.6, [2.1, 0.7, -1.4]);
  k.prop('fridge', fr, {
    x: 2.1, z: -1.65, label: 'Mini fridge',
    tap: {
      anim: ['drink', 'cheers'], sfx: 'open', lines: ['Daisy Beer, eh? Official drink of not working.', 'Fridge hums in B flat. I checked.'],
      reward: { friend: 0.5 }, rewardLine: ['Here, bud. Juice box. You\'re on the clock.'],
      fox: ['Is that... cream soda? Business expense.'],
      effect: (c) => { c.tween(0.5, (q) => { openDoors(c.obj, q); lightIn.intensity = q * 1.4; }); c.later(2.8, () => c.tween(0.5, (q) => { openDoors(c.obj, 1 - q); lightIn.intensity = (1 - q) * 1.4; })); },
    },
  });
  // ---- TV on a crate
  const tvStand = crate(k, { w: 20, h: 9, d: 12, col: 0x8a6a40 });
  k.add(tvStand, -1.0, 0, -1.6);
  const tv = k.obj('tv', null);
  const tb = k.v(); tb.box(-9, 0, -5, 8, 13, 5, (x, y, z) => tone(x, y, z, 0x6a4a2e, 0x5a3e26, 0x7a5636)); tb.box(-7, 2, 5, 4, 11, 5, null); tb.box(6, 9, 6, 6, 9, 6, 0xd8d0c0); tb.box(6, 6, 6, 6, 6, 6, 0xd8d0c0);
  tb.line(-3, 14, 0, -7, 20, 0, 0x2a2a32); tb.line(1, 14, 0, 5, 21, 0, 0x2a2a32);
  tv.add(k.mesh(tb));
  const scr = k.canvasPlane(32, 24, W(12), W(10), null);
  scr.mesh.position.set(W(-1.5), W(7), W(5.6));
  tv.add(scr.mesh);
  let channel = 0;
  const drawTV = (t) => {
    const g = scr.ctx;
    if (channel === 0) { for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) { const v = Math.floor(Math.random() * 120 + 60); g.fillStyle = `rgb(${v},${v},${v + 10})`; g.fillRect(x, y, 1, 1); } }
    else if (channel === 1) { g.fillStyle = '#5aa0d8'; g.fillRect(0, 0, 32, 24); g.fillStyle = '#3a78b0'; g.fillRect(0, 14, 32, 10); const fx = 6 + ((t * 8) % 22); g.fillStyle = '#d87a5a'; g.fillRect(fx, 16 - Math.abs(Math.sin(t * 3)) * 6, 7, 3); g.fillRect(fx - 2, 16 - Math.abs(Math.sin(t * 3)) * 6, 2, 3); g.fillStyle = '#fff'; g.fillRect(1, 1, 14, 3); }
    else { g.fillStyle = '#2a5a2a'; g.fillRect(0, 0, 32, 24); g.fillStyle = '#e8e0c0'; g.fillRect(4, 4, 24, 3); g.fillStyle = '#f2c83c'; g.fillRect(8 + Math.sin(t * 2) * 6, 10, 6, 9); g.fillStyle = '#3e9e52'; g.fillRect(8 + Math.sin(t * 2) * 6, 12, 6, 3); }
    scr.tex.needsUpdate = true;
  };
  let tvT = 0;
  k.every((dt, t) => { tvT += dt; if (tvT > 0.12) { tvT = 0; drawTV(t); } });
  k.prop('tv', tv, {
    x: -1.0, y: W(10), z: -1.6, label: 'TV',
    tap: {
      sfx: 'crt_on', anim: ['point_laugh', 'laugh'],
      effect: (c) => { channel = (channel + 1) % 3; c.say(['Static. My favourite show.', 'Fishing Tonight! The salmon always wins.', 'Daisy Beer ad. I\'m in this one. Background guy.'][channel]); c.anim(channel === 0 ? ['talk'] : ['point_laugh', 'laugh']); return true; },
    },
  });

  // ---- lawn chair (his good one is outside)
  const lc = k.obj('lawnchair', null);
  const lv = k.v();
  for (let x = -7; x <= 6; x++) { for (let z = -6; z <= 5; z++) lv.set(x, 7, z, ((x + 7) % 4 < 2) ? 0x3e9e52 : 0xe8e0c0); for (let y = 8; y <= 22; y++) lv.set(x, y, -6 - Math.floor((y - 8) / 4), ((x + 7) % 4 < 2) ? 0x3e9e52 : 0xe8e0c0); }
  for (const x of [-8, 7]) { lv.line(x, 0, -6, x, 7, 5, 0xc8ccd0); lv.line(x, 0, 5, x, 7, -6, 0xc8ccd0); lv.box(x, 11, -6, x, 11, 4, 0xc8ccd0); }
  lc.add(k.mesh(lv));
  k.prop('chair', lc, {
    x: -2.2, z: 0.4, rot: 0.6, label: 'Lawn chair',
    tap: { anim: ['laugh', 'talk'], sfx: 'pop_in', lines: ['Best seat in the house. Only seat in the house.', 'Indoor lawn chair. It\'s called class, bud.', 'She squeaks. She\'s a good chair.'], fox: ['Lumbar support: zero. Charm: plenty.'] },
  });

  // ---- singing salmon plaque
  const sal = k.obj('salmon', null);
  const pv = k.v(); pv.box(-8, -5, 0, 7, 5, 0, (x, y) => ((x + y) % 5 === 0 ? 0x6a4424 : 0x8a5a32));
  const fish = k.v(); ell(fish, 0, 0, 0, 6, 2.6, 1, (x, y) => (y > 0 ? 0x8a9a7a : 0xe88a6a)); fish.box(-9, -2, 0, -7, 2, 0, 0x7a8a6a); fish.set(4, 1, 1, PAL.ink);
  sal.add(k.mesh(pv));
  const fm = k.part(sal, 'fish', fish, null, [0, 0, 1.5]);
  k.prop('salmon', sal, {
    x: -0.2, y: 1.7, z: -1.93, label: 'Singing salmon', stand: [-0.2, -0.9],
    tap: {
      sfx: 'fanfare', fx: 'notes', fxN: 5, anim: ['laugh', 'point_laugh'],
      lines: ['Sings when you tap it. Drives the moose nuts.', 'Caught him in \'09. He sang then too.', 'Take me to the river! ...that\'s all he knows.'],
      effect: (c) => { c.tween(1.6, (q) => { fm.rotation.y = Math.sin(q * Math.PI * 6) * 0.4; fm.rotation.z = Math.sin(q * Math.PI * 4) * 0.15; }); },
    },
  });

  // ---- dartboard
  const db = k.obj('darts', null);
  const dv = k.v();
  for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) { const r = Math.hypot(x, y); if (r > 6.3) continue; const ring = Math.floor(r / 1.6); dv.set(x, y, 0, r < 1 ? 0xd8403a : ring % 2 ? 0x2a2a2a : (Math.floor(Math.atan2(y, x) * 3) % 2 ? 0xf4e8c8 : 0x3e9e52)); }
  db.add(k.mesh(dv));
  const dartV = k.v(); dartV.box(0, 0, 0, 0, 0, 4, 0xc8ccd0); dartV.box(0, 0, 5, 0, 0, 6, 0xd8403a);
  const dart = k.part(db, 'dart', dartV, null, [2, 1, 1]);
  dart.visible = false;
  k.prop('darts', db, {
    x: -2.72, y: 1.45, z: -0.5, rot: Math.PI / 2, label: 'Dartboard', stand: [-2.2, -0.3],
    tap: {
      sfx: 'tock', anim: ['cheers', 'laugh'],
      effect: (c) => { const hit = Math.random() < 0.4; dart.visible = true; dart.position.set(W(hit ? -0.5 : 4 - Math.random() * 8), W(hit ? 0 : 3 - Math.random() * 6), W(1)); c.say(hit ? 'BULLSEYE! Did ya see that? Nobody saw that.' : pick(['Close enough, eh?', 'The board moved.', 'Practice throw.'])); c.anim(hit ? ['cheers'] : ['laugh']); if (hit) c.fx('sparks', 5); return true; },
    },
  });

  // ---- snack cooler
  const cool = k.obj('cooler', null);
  const cv = k.v(); cv.box(-7, 0, -5, 6, 9, 4, (x, y) => (y > 7 ? 0xf4f6f8 : 0x3a7ac8)); cv.box(-3, 10, 0, 2, 10, 0, 0xf4f6f8);
  cool.add(k.mesh(cv));
  k.prop('cooler', cool, {
    x: 1.2, z: 0.9, rot: -0.3, label: 'Snack cooler',
    tap: { anim: ['drink', 'talk'], sfx: 'crunch', lines: ['Chips. Ketchup flavour. Don\'t judge.', 'Empty. Who ate my chips?'], reward: { food: { id: 'maple', n: 2 } }, rewardLine: ['Maple Munchies for your fish, bud. Don\'t tell my mom.'] },
  });

  k.add(plant(k, { leaf: 0x4a8a3a, h: 12 }), 2.6, 0, 0.6);
  k.add(lamp(k, { shadeCol: 0xf2c83c }), 2.65, 0, -0.5);
  k.add(sign(k, 'DAISY', { w: 0.6, h: 0.22, bg: '#f2c83c', fg: '#2a5a2a' }), 1.05, 2.15, -1.97);
  k.light(0xffd890, 1.2, 4.5, [2.5, 1.5, -0.3], 1.4);
  k.light(0x9ad0ff, 0.5, 3, [-1, 0.9, -1.0]);
  return {
    title: "Dale's Cabin", bg: 0x1e2a30,
    light: { sky: 0xffe8cc, ground: 0x4a3a2a, hemi: 1.5, fillI: 0.85 },
    npc: { x: 0.4, z: -0.3, rot: 0.2 }, npcScale: 0.86,
    fox: { x: -1.4, z: 1.3 },
    idle: ['idle'], specials: ['drink', 'laugh', 'cheers', 'talk'],
    greet: ['Oh hey bud! Come on in, eh!', 'Welcome to the cabin! Mind the cans.'],
    bye: ['Later, bud!', 'Take a can for the road. No? More for me.'],
    chatter: ['Eh?', 'Wicked.', 'Good times.'],
  };
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
