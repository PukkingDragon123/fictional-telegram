// [v20 npc homes] Pip's office at the lumber mill: board-and-batten walls, a
// cash register (ka-ching), the price chalkboard with today's log price, an
// acorn jar, a neat log pile and a ledger desk with an abacus.
import * as THREE from 'three';
import { W, PAL, shade, mix, tone, hash3, ell, table, bookshelf, clock, crate, plant, stool, lamp, rugOval } from './homeKit.js';

export function buildPip(k, { night, game }) {
  k.room({
    floor: (x, z) => tone(x, 0, z, ((x + 200) % 6 === 0) ? 0x7a4a2a : 0xb8783a, 0xa86a34, 0xc88a4a),
    wall: (x, y, z, side) => { const a = side === 'back' ? x : z; return (a + 200) % 8 === 0 ? 0x8a5a32 : tone(x, y, z, 0xc8a070, 0xb89060, 0xd8b080, 0.1, 0.1); },
    base: 0x6a4424, cap: 0xc8402a, lip: 0x5a3a22,
    windows: [{ side: 'back', a0: -46, a1: -30, y0: 24, y1: 38, frame: 0xf4e8c8, sky: (u, v, a, y) => (v < 0.3 ? 0x4f9c44 : mix(night ? 0x1a2240 : 0x9fd6f0, night ? 0x2a3a68 : 0xe8f6ff, v)) }],
  });
  rugOval(k, 2, 10, 24, 12, [0xc8402a, 0xe8b878, 0x3a2a1a, 0xc8402a]);

  // ---- ledger desk + abacus + cash register
  k.add(table(k, { w: 34, d: 16, h: 15, col: 0x7a4a28 }), 0.9, 0, -1.55);
  const cr = k.obj('register', null);
  const rv = k.v(); rv.box(-6, 0, -4, 5, 7, 4, 0x3a3a42); rv.box(-5, 8, -4, 4, 11, 0, 0x4a4a52); rv.box(-4, 9, -5, 3, 10, -5, 0x7cff9a);
  for (let x = -5; x <= 3; x += 2) for (let z = 1; z <= 3; z++) rv.set(x, 8, z, 0xe8e0c8);
  const drawer = k.v(); drawer.box(-5, 0, 0, 4, 2, 6, 0x5a5a62); drawer.set(-1, 1, 7, 0xe8c050); for (let x = -4; x <= 3; x += 2) drawer.set(x, 2, 3, 0xffd84a);
  cr.add(k.mesh(rv));
  const dp = k.part(cr, 'drawer', drawer, null, [0, 0, -2]);
  k.prop('register', cr, {
    x: 1.55, y: W(16), z: -1.55, label: 'Cash register', pad: 0.1,
    tap: {
      anim: ['haggle', 'count_logs'], sfx: 'coins', fx: 'coins', fxN: 4,
      lines: ['Ka-ching! Music to my cheeks.', 'Cash, coins, and one IOU from Rocco.'],
      reward: { coins: 15 }, rewardLine: ['A finder\'s fee, partner! Fair and square.'],
      effect: (c) => { c.tween(0.35, (q) => { dp.position.z = W(-2) + q * 0.22; }); c.later(2, () => c.tween(0.35, (q) => { dp.position.z = W(-2) + (1 - q) * 0.22; })); },
    },
  });
  const ab = k.obj('abacus', null);
  const av = k.v(); av.box(-7, 0, 0, 6, 0, 1, 0x6a4424); av.box(-7, 9, 0, 6, 9, 1, 0x6a4424); av.box(-7, 0, 0, -7, 9, 1, 0x6a4424); av.box(6, 0, 0, 6, 9, 1, 0x6a4424);
  for (let r = 0; r < 4; r++) for (let x = -6; x <= 5; x++) av.set(x, 2 + r * 2, 0, (x + r * 3 + 20) % 5 < 2 ? [0xc8402a, 0xffd84a, 0x5a9ad8, 0x5aae3c][r] : 0x8a6a42);
  ab.add(k.mesh(av));
  k.prop('abacus', ab, {
    x: 0.35, y: W(16), z: -1.75, label: 'Abacus + ledger', pad: 0.1,
    tap: { anim: ['count_logs', 'haggle'], sfx: 'tick', lines: ['Logs in, coins out. Simple maths!', 'Carry the one... carry the log...', 'The ledger balances. Mostly. Ish.'] },
  });

  // ---- price chalkboard
  const price = game.pipVisit?.price?.() ?? '?';
  const cb = k.canvasPlane(64, 40, 1.2, 0.75, (ctx) => {
    ctx.fillStyle = '#7a4a28'; ctx.fillRect(0, 0, 64, 40); ctx.fillStyle = '#2a3a32'; ctx.fillRect(3, 3, 58, 34);
    ctx.fillStyle = '#e8f0e0'; ctx.font = 'bold 10px "Pixelify Sans", monospace'; ctx.textAlign = 'center';
    ctx.fillText('TODAY', 32, 15); ctx.font = 'bold 13px "Pixelify Sans", monospace'; ctx.fillText(`${price} / LOG`, 32, 31);
  });
  const cbg = new THREE.Group(); cbg.add(cb.mesh); cbg.userData.parts = {};
  k.prop('board', cbg, {
    x: -0.95, y: 1.55, z: -1.97, label: 'Price board', stand: [-0.95, -0.8],
    tap: { anim: ['haggle', 'talk'], lines: [`Today: ${price} coins a log! Sell smart, partner!`, 'Prices go up, prices go down. Pip stays cute.'] },
  });

  // ---- acorn jar
  const aj = k.obj('acorns', null);
  const jv = k.v(); jv.cylinder(-0.5, 0, -0.5, 4, 10, (x, y, z) => (y === 9 ? 0xc8402a : y > 7 ? 0xe8f4ff : hash3(x, y, z) < 0.5 ? 0x9a6a3a : 0x6a4424));
  aj.add(k.mesh(jv));
  k.add(stool(k, { col: 0x8a5a32 }), -2.35, 0, -0.95);
  k.prop('acorns', aj, {
    x: -2.35, y: W(10), z: -0.95, label: 'Acorn jar', pad: 0.1,
    tap: { anim: ['stuff_cheeks'], sfx: 'nibble', lines: ['Mmf! Emergency snacks. Very emergency.', 'One for now, nine for later.'], reward: { food: { id: 'pinecone', n: 2 } }, rewardLine: ['Mmf! Pinecones, for your... whatever eats pinecones!'], fox: ['How many can you fit in there?'] },
  });

  // ---- log pile
  const lp = k.obj('logs', null);
  const lv = k.v();
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) { const cx = (i - (3 - r) / 2) * 7, cy = 3 + r * 6; for (let z = -8; z <= 8; z++) for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) { const d = Math.hypot(x, y); if (d > 3.2) continue; lv.set(Math.round(cx + x), Math.round(cy + y), z, Math.abs(z) === 8 ? (d < 1.5 ? 0xd89a5a : d < 2.5 ? 0xecc488 : 0xa87444) : (hash3(x, y, z) < 0.2 ? 0x6a4424 : 0x8a5a32)); } }
  lp.add(k.mesh(lv));
  k.prop('logs', lp, {
    x: 2.1, z: 0.55, rot: 0.25, label: 'Log pile',
    tap: { anim: ['count_logs', 'happy'], sfx: 'chip', lines: ['Logs, logs, lovely logs!', 'Stacked by size, then by smell.', 'A garage full of wood is a happy garage.'] },
  });

  const wc = clock(k, { wall: true, col: 0x6a4424 });
  k.add(wc, 2.35, 1.35, -1.92);
  k.every((dt, t) => { wc.userData.parts.pend.rotation.z = Math.sin(t * 3) * 0.3; });
  k.add(bookshelf(k, { w: 18, h: 30, d: 8, col: 0x6a4424, books: [0xc8402a, 0xe8b878, 0x3a2a1a, 0xf4e8c8] }), -2.5, 0, -1.75);
  k.add(crate(k, { w: 12, h: 10, d: 10, col: 0xc89a5a }), -2.4, 0, 0.9);
  k.add(plant(k, { leaf: 0x4f9c44, flower: 0xffd84a, h: 9 }), 2.7, 0, -0.5);
  k.add(lamp(k, { table: true, shadeCol: 0x5aae3c }), 0.0, W(16), -1.45);
  k.light(0xffd890, 1.1, 4.5, [0.4, 1.8, -1.0], 1.4);
  return {
    title: "Pip's Mill Office", bg: 0x24180e,
    light: { sky: 0xfff0d8, ground: 0x5a3a22, hemi: 1.55, fillI: 0.85 },
    npc: { x: -0.2, z: -0.6, rot: 0.2 }, npcScale: 0.92,
    fox: { x: -1.2, z: 1.35 },
    greet: ['Welcome to the office, partner! Wipe your paws!', 'Come in! Business hours: always.'],
    bye: ['Pleasure doing business!', 'Bring logs! Lots of logs!'],
    chatter: ['Mmf.', 'Logs...', 'Carry the one...'],
  };
}
