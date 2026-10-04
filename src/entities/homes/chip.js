// [v20 npc homes] Chip's woodshop inside the hollow oak: ring-grain walls, a
// sawdusty floor, a workbench (hammer for spare wood), a sawhorse, a cuckoo
// clock he carved himself, a half-built chair and a lumber rack.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, table, clock, crate, bookshelf, stool, plant, lamp, rugOval } from './homeKit.js';

export function buildChip(k, { night }) {
  k.room({
    round: 16, h: 58,
    floor: (x, z) => (hash3(x, 0, z) < 0.12 ? 0xf8deac : tone(x, 0, z, ((x + 200) % 8 === 0) ? 0x9a6a3a : 0xc08a52, 0xb07a46, 0xd09a62)),
    wall: (x, y, z, side) => { const a = side === 'back' ? x : z; const r = Math.hypot(a * 0.6, (y - 30)); return (Math.floor(r) % 5 === 0) ? 0xc89a5a : tone(x, y, z, 0xe4b474, 0xd8a868, 0xf0c484, 0.1, 0.1); },
    base: 0x7a5232, cap: 0x7a5232, lip: 0x5c3c24,
    windows: [{ side: 'back', a0: -6, a1: 8, y0: 30, y1: 44, round: true, frame: 0xd0543a, sky: (u, v) => mix(night ? 0x1a2240 : 0x6ab852, night ? 0x2a3a68 : 0xa8dcf0, v) }],
  });
  rugOval(k, 0, 10, 24, 12, [0xd0543a, 0xe87458, 0xf6eedc, 0xd0543a]);

  // ---- pegboard of tools (static) above the bench
  k.deco((R) => { for (let x = -54; x <= -22; x++) for (let y = 22; y <= 40; y++) R.set(x, y, -39, (x % 3 === 0 && y % 3 === 0) ? 0x8a5a2e : 0xc89a62); for (const [x, c, h] of [[-50, 0x9aa2b0, 9], [-45, 0x8a5a32, 11], [-40, 0x646a78, 7], [-35, 0xd0543a, 10], [-29, 0x9aa2b0, 8], [-25, 0xe8c050, 6]]) R.box(x, 38 - h, -38, x + 1, 37, -38, c); });

  // ---- workbench
  const wb = table(k, { w: 34, d: 16, h: 15, col: 0x8a5a32 });
  const vise = k.v(); vise.box(-2, 0, -2, 2, 4, 2, 0x3e3e48); vise.box(-8, 2, -1, 8, 3, 1, 0xd8a868);
  wb.add(Object.assign(k.mesh(vise), {}));
  wb.children[wb.children.length - 1].position.set(W(-8), W(16), 0);
  const ham = k.v(); ham.box(0, 0, 0, 7, 0, 0, 0x8a5a32); ham.box(7, -1, -1, 8, 1, 1, 0x646a78);
  const hp = k.part(wb, 'hammer', ham, null, [5, 17, 2]);
  k.prop('bench', wb, {
    x: -1.7, z: -1.55, label: 'Workbench', stand: [-1.4, -0.6],
    tap: {
      anim: ['hammer', 'peck_wood'], sfx: 'hammer', fx: 'puff', fxN: 4,
      lines: ['Tok-tok-tok! Measure twice, peck once.', 'A birdhouse for a bird who already has a house.'],
      reward: { wood: 2 }, rewardLine: ['Offcuts! Take \'em, they\'re good wood.'],
      effect: (c) => { c.tween(0.9, (q) => { hp.rotation.z = Math.abs(Math.sin(q * Math.PI * 3)) * 0.9; }); c.later(0.3, () => c.sfx('nail', 0.35)); },
    },
  });

  // ---- sawhorse with a plank + saw
  const sh = k.obj('sawhorse', null);
  const sv = k.v();
  for (const x of [-10, 9]) { sv.line(x, 0, -4, x, 11, 0, 0xa87444); sv.line(x, 0, 4, x, 11, 0, 0xa87444); }
  sv.box(-12, 12, -1, 11, 13, 1, 0xa87444);
  sv.box(-16, 14, -4, 15, 15, 3, (x) => ((x + 40) % 7 === 0 ? 0xc89a5a : 0xe4b474));
  sh.add(k.mesh(sv));
  const saw = k.v(); saw.box(0, 0, 0, 9, 3, 0, 0x9aa2b0); saw.box(-3, 1, 0, -1, 4, 0, 0xd0543a);
  const sp = k.part(sh, 'saw', saw, null, [2, 16, 0]);
  sp.rotation.z = -0.3;
  k.prop('sawhorse', sh, {
    x: 1.45, z: 0.5, rot: -0.25, label: 'Sawhorse',
    tap: { anim: ['saw', 'measure'], sfx: 'saw', fx: 'puff', fxN: 5, lines: ['Zip-zip! Straight as a beak.', 'Saw dust, saw dust, everywhere!'], effect: (c) => { c.tween(1.4, (q) => { sp.position.x = W(2 + Math.sin(q * Math.PI * 6) * 3); }); } },
  });

  // ---- cuckoo clock he carved
  const cc = clock(k, { wall: true, cuckoo: true, col: 0xa87444, face: 0xf6eedc });
  k.prop('cuckoo', cc, {
    x: 1.2, y: 1.15, z: -1.9, label: 'Carved cuckoo clock', stand: [1.2, -0.8],
    tap: {
      sfx: 'bird_chirp', anim: ['inspect', 'happy'],
      lines: ['Carved it myself! The bird is me. Obviously.', 'Cuckoo! I mean, tok-tok!', 'It runs on pinecones and pride.'],
      reward: { friend: 0.5 }, rewardLine: ['You like it? I\'ll carve you one someday!'],
      effect: (c) => { const b = c.parts.bird; b.visible = true; c.tween(1.4, (q) => { b.position.z = W(Math.sin(Math.min(1, q * 1.5) * Math.PI) * 7); }, () => { b.visible = false; }); },
    },
  });
  k.every((dt, t) => { cc.userData.parts.pend.rotation.z = Math.sin(t * 3.2) * 0.3; });

  // ---- half-built chair
  const hc = k.obj('chair', null);
  const cv = k.v();
  cv.box(-6, 9, -6, 5, 10, 5, 0xe4b474);
  for (const [x, z, h] of [[-6, -6, 25], [5, -6, 25], [-6, 5, 9]]) cv.box(x, 0, z, x, h - 1, z, 0xc89a5a);
  cv.box(-6, 18, -6, 5, 19, -6, 0xc89a5a);
  cv.box(4, 0, 4, 5, 0, 5, 0x9a6a3a); // the missing leg lies on the floor
  cv.box(8, 0, 2, 9, 1, 10, 0xc89a5a);
  hc.add(k.mesh(cv));
  k.prop('chair', hc, {
    x: 0.0, z: 0.85, rot: 0.4, label: 'Unfinished chair',
    tap: { anim: ['inspect', 'measure'], sfx: 'tock', lines: ['Needs a fourth leg. Or a very balanced bear.', 'A commission from Dale. He\'s in no hurry.'], fox: ['Three legs. Bold. Minimalist.'], effect: (c) => { c.tween(0.8, (q) => { hc.rotation.z = Math.sin(q * Math.PI * 3) * 0.08 * (1 - q); }); } },
  });

  // ---- lumber rack
  const lr = bookshelf(k, { w: 14, h: 40, d: 9, col: 0x7a5232, rows: 4, fill: (v, y, h, hx, d, r) => { for (let z = -2; z <= 1; z++) v.box(-hx + 1, y, z, hx - 2, y + 1, z, (x) => (x % 6 === 0 ? 0xc89a5a : [0xe4b474, 0xd8a868, 0xc08a52, 0xecc488][r])); } });
  k.prop('lumber', lr, {
    x: 2.55, z: -1.2, rot: -Math.PI / 2 + 0.2, label: 'Lumber rack', stand: [2.0, -0.6],
    tap: { anim: ['measure', 'inspect'], sfx: 'chip', lines: ['Oak, maple, birch, and one plank of mystery.', 'Fallen logs make the best planks. Free wood!'] },
  });

  k.add(stool(k, { col: 0xa87444 }), -1.6, 0, -0.75);
  k.add(crate(k, { w: 12, h: 9, d: 10, col: 0xc89a5a, stuff: [0x8a5a2e, 0xa87444, 0x6a4020] }), -2.5, 0, 0.6);
  k.add(plant(k, { leaf: 0x4f9c44, h: 10 }), 2.5, 0, 1.2);
  k.add(lamp(k, { shadeCol: 0x6aa88a, h: 30 }), -0.5, 0, -1.75);
  k.light(0xffd890, 1.1, 4.5, [-0.5, 1.7, -1.4], 1.4);
  return {
    title: "Chip's Woodshop", bg: 0x1e1a12,
    light: { sky: 0xfff0d8, ground: 0x5a3a22, hemi: 1.55, fillI: 0.85 },
    npc: { x: 0.55, z: -0.55, rot: 0.2 }, npcScale: 0.92,
    fox: { x: -1.1, z: 1.35 },
    greet: ['Tok-tok! Come in, come in! Mind the shavings.', 'Welcome to the shop! Nothing is level. On purpose.'],
    bye: ['Tok-tok! Come back soon!', 'Bring wood next time!'],
    chatter: ['Tok.', 'Hmm, a quarter inch off.', 'Tok-tok-tok.'],
  };
}
