// [v20 npc homes] Hazel's bakery kitchen: cream tiles with a pink stripe, a
// checker floor, a brick oven (light it and a pie pops out), the dough table,
// a cooling rack of pies, a counter bell and flour sacks.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, stove, table, bell, bookshelf, cupboard, openDoors, plant, stool, sign, steamer } from './homeKit.js';

function pie(v, x, y, z, fill = 0xc84060) {
  ell(v, x, y + 1, z, 4, 1.4, 4, 0xe0a050);
  ell(v, x, y + 2, z, 3, 0.6, 3, fill);
  for (let i = -2; i <= 2; i += 2) v.set(Math.round(x + i), y + 3, Math.round(z), 0xf0c070);
}

export function buildHazel(k, { night }) {
  k.room({
    floor: (x, z) => ((Math.floor((x + 200) / 6) + Math.floor((z + 200) / 6)) % 2 ? 0xf4ead8 : 0xd8705a),
    wall: (x, y, z, side) => { const a = side === 'back' ? x : z; if (y >= 16 && y <= 18) return 0xe87890; if (y < 16) return (a % 4 === 0 || y % 4 === 0) ? 0xe8dcc8 : 0xfaf2e4; return tone(x, y, z, 0xf8e4c8, 0xf0d8b8, 0xfff0d8, 0.1, 0.1); },
    base: 0xc85a74, cap: 0xe87890, lip: 0x8a4a3a,
    windows: [{ side: 'back', a0: 4, a1: 22, y0: 24, y1: 38, frame: 0xffffff, sky: (u, v) => mix(night ? 0x1a2240 : 0xa8dcf0, night ? 0x2a3a68 : 0xf0f8ff, v) }],
  });

  // ---- brick oven (pie part pops out)
  const ov = stove(k, { brick: true, w: 26, h: 20, d: 16 });
  const pv = k.v(); pie(pv, 0, 0, 0);
  const pp = k.part(ov, 'pie', pv, null, [0, 4, 4]);
  pp.visible = false;
  const ovL = k.light(0xff8a3a, 0, 2.6, [-2.0, 0.4, -1.0]);
  const smoke = steamer(k, new THREE.Vector3(-2.0, W(36), -1.6), { n: 4, rise: 0.6, size: 0.09 });
  smoke.on = false;
  k.prop('oven', ov, {
    x: -2.0, z: -1.5, label: 'Brick oven', stand: [-1.6, -0.5],
    tap: {
      anim: ['roll_dough', 'happy'], sfx: 'whoosh',
      lines: ['Hot, hot, hot! Mind the whiskers.', 'Two hundred degrees and one hedgehog.'],
      reward: { food: { id: 'honey', n: 1 } }, rewardLine: ['Honey-crust pie! The secret\'s out now, dear.'],
      effect: (c) => {
        c.parts.fire.visible = true; ovL.intensity = 1.6; smoke.on = true;
        c.later(1.6, () => { pp.visible = true; c.sfx('pop_in', 0.4); c.tween(0.6, (q) => { pp.position.z = W(4) + q * 0.45; pp.position.y = W(4) + Math.sin(q * Math.PI) * 0.25; }); c.fxAt('sparks', new THREE.Vector3(-2, 0.6, -0.8), 4); });
        c.later(5, () => { if (c.parts.fire) { c.parts.fire.visible = false; pp.visible = false; pp.position.set(0, W(4), W(4)); } ovL.intensity = 0; smoke.on = false; });
      },
    },
  });

  // ---- dough table
  const dt = table(k, { w: 28, d: 16, h: 14, col: 0xc8a070 });
  const dough = k.v(); ell(dough, 0, 1, 0, 6, 1.5, 4, 0xf4e8c8); dough.box(8, 0, -1, 13, 1, 0, 0xc89a5a); dough.box(7, 0, -1, 7, 1, 0, 0x8a5a32); dough.box(14, 0, -1, 14, 1, 0, 0x8a5a32);
  const dg = k.part(dt, 'dough', dough, null, [-3, 15, 0]);
  k.prop('dough', dt, {
    x: -0.25, z: 0.25, label: 'Dough table',
    tap: { anim: ['roll_dough'], sfx: 'squelch', fx: 'puff', fxN: 4, lines: ['Roll it thin, roll it nice!', 'Knead it like it owes you money. Gently.', 'Flour, butter, love. And more butter.'], effect: (c) => { c.tween(1.2, (q) => { dg.scale.set(1 + Math.sin(q * Math.PI) * 0.25, 1 - Math.sin(q * Math.PI) * 0.4, 1); }); } },
  });

  // ---- cooling rack with pies
  const rack = bookshelf(k, { w: 22, h: 30, d: 10, col: 0xd8d0c8, rows: 3, fill: (v, y, h, hx, d, r) => { pie(v, -5, y, 0, [0xc84060, 0x6a4aa8, 0xe8a030][r]); pie(v, 5, y, 0, [0x6a4aa8, 0xe8a030, 0xc84060][r]); } });
  const rs = steamer(k, new THREE.Vector3(1.2, W(32), -1.6), { n: 3, rise: 0.3 });
  k.prop('rack', rack, {
    x: 1.2, z: -1.65, label: 'Cooling pies',
    tap: {
      anim: ['taste', 'happy'], fx: 'hearts', fxN: 3, sfx: 'nibble',
      lines: ['Blueberry, cherry, mystery. Mystery is best.', 'For the bears upstairs. And one for me.'],
      reward: { friend: 0.5 }, rewardLine: ['Have a slice, sweetie. Don\'t tell the bears.'],
      fox: ['Purely for quality control...'],
    },
  });

  // ---- counter with a bell
  const ct = cupboard(k, { w: 24, h: 16, d: 12, col: 0xe87890, door: 0xf8a0b4, knob: 0xffffff, legs: 1 });
  k.add(ct, 2.2, 0, 0.2, -Math.PI / 2 + 0.1);
  const bl = bell(k, { col: 0xe8c050 });
  k.prop('bell', bl, {
    x: 2.2, y: W(17), z: 0.0, label: 'Counter bell', pad: 0.12,
    tap: {
      sfx: 'bell', anim: ['happy', 'laugh'], lines: ['Order up! ...oh, it\'s just you, sweetie.', 'Ding! Pies for table nine!', 'That bell is older than Shellby. Almost.'],
      effect: (c) => { const b = c.parts.bell; c.tween(0.7, (q) => { b.position.y = W(1) + Math.abs(Math.sin(q * Math.PI * 4)) * 0.03 * (1 - q); b.rotation.z = Math.sin(q * Math.PI * 6) * 0.2 * (1 - q); }); },
    },
  });

  // ---- flour sacks
  const fs = k.obj('flour', null);
  const sv = k.v();
  for (const [x, z, h] of [[-5, 0, 11], [4, 1, 9], [0, -5, 10]]) { ell(sv, x, h / 2, z, 4.5, h / 2, 4, 0xf0e8d8); sv.box(x - 1, h, z - 1, x, h + 1, z, 0xc8b898); sv.set(x, Math.round(h / 2), z + 4, 0xc85a74); }
  fs.add(k.mesh(sv));
  k.prop('flour', fs, {
    x: -2.25, z: 0.55, label: 'Flour sacks',
    tap: { anim: ['curl_up', 'sniff'], fx: 'puff', fxN: 7, sfx: 'whoosh', lines: ['Achoo! Flour everywhere!', 'Sixty pounds of flour. Forty pounds of pie.', 'Mind the spikes, dear. The sacks pop.'], fox: ['My coat! It\'s white now!'] },
  });

  k.add(plant(k, { leaf: 0x5aae3c, flower: 0xf08aa8, h: 8 }), 0.35, 0, -1.8);
  k.add(stool(k, { col: 0xc8a070, cushion: 0xe87890 }), 0.8, 0, 0.75);
  k.add(sign(k, 'PIES', { w: 0.5, h: 0.2, bg: '#fff3d8', fg: '#c85a74', border: '#e87890' }), 0.65, 2.3, -1.97);
  k.light(0xffd8a0, 1.1, 4.5, [0.5, 2.1, -0.4]);
  return {
    title: "Hazel's Kitchen", bg: 0x2a1a1e,
    light: { sky: 0xfff0e0, ground: 0x6a4a3a, hemi: 1.55, fillI: 0.85 },
    npc: { x: 0.65, z: -0.45, rot: 0.15 }, npcScale: 0.92,
    fox: { x: -1.0, z: 1.35 },
    greet: ['Oh my, visitors! Come in, it smells lovely in here.', 'Welcome, sweetie! Don\'t touch the hot things.'],
    bye: ['Bye, sweetie! Come back hungry!', 'Mind the step, dear.'],
    chatter: ['Hmm, more butter.', 'Is that burning? No. Good.', 'La la la...'],
  };
}
