// [v26 turtle] Old Longneck's grotto behind the falls: a cosy cave of river
// stone, a round window with the waterfall pouring past (light ripples over the
// room), moss rugs, a low stone tea table, shelves of ancient scrolls and fossils,
// a raked sand garden, a glowing pool with one very old koi, wind chimes, an
// indoor sundial, and the lectern with THE LONG TALK written down so far.
// Everything he says in here is slow, too.
import * as THREE from 'three';
import { W, mix, tone, hash3, ell, table, bookshelf, teapot, steamer, rugOval, plant } from './homeKit.js';
import { slowAll } from '../../game/longneck/ui.js';

const STONE = [0x7c8278, 0x8a9088, 0x6c7268, 0x969c90];
const MOSS = [0x4f7a32, 0x5f8c3a, 0x3f6a2a, 0x6a9a44];

export function buildLongneck(k, { game, night }) {
  const LN = game?.longneck;
  // ---- the grotto: river-stone walls (mortar lines, moss creeping up), a stone-flag floor
  const wall = (a, y, z) => {
    const row = Math.floor(y / 5), off = (row % 2) * 4;
    if (y % 5 === 0 || (a + 400 + off) % 8 === 0) return 0x4a4e48;
    const h = hash3(Math.floor((a + 400 + off) / 8), row, 3);
    if (y < 8 && hash3(a, y, z) < 0.5 - y * 0.05) return MOSS[Math.floor(h * 4)];
    if (hash3(a, y, z + 7) < 0.03) return 0x5a9a44; // a fern sprig in a crack
    return STONE[Math.floor(h * 4)];
  };
  k.room({
    w: 120, d: 80, h: 56, round: 26, lowFront: 12,
    floor: (x, z) => {
      const fx = Math.floor((x + 400 + (Math.floor((z + 400) / 9) % 2) * 5) / 10), fz = Math.floor((z + 400) / 9);
      if ((x + 400 + (fz % 2) * 5) % 10 === 0 || (z + 400) % 9 === 0) return 0x5e625a;
      return tone(x, 0, z, STONE[Math.floor(hash3(fx, fz, 5) * 4)], 0x6c7268, 0x9aa096);
    },
    wall: (x, y, z, side) => wall(side === 'back' ? x : z, y, z),
    base: 0x4f7a32, lip: 0x5a5e56,
    windows: [{ side: 'back', a0: -42, a1: -14, y0: 14, y1: 46, round: true, frame: 0x8a9088, bars: false, sky: (u, v) => mix(0x5aa8d8, 0xc8eef8, v) }],
  });
  // moss rugs
  rugOval(k, -4, 12, 30, 15, [0x5f8c3a, 0x4f7a32, 0x6a9a44, 0x3f6a2a]);
  rugOval(k, 34, 22, 12, 8, [0x6a9a44, 0x5f8c3a, 0x4f7a32]);

  // ---- the waterfall through the round window (an animated canvas, light rippling into the room)
  const fall = k.canvasPlane(28, 34, W(29), W(33), null);
  fall.mesh.position.set(W(-27.5), W(30), W(-40) + 0.02);
  k.group.add(fall.mesh);
  const drawFall = (t) => {
    const c = fall.ctx;
    for (let x = 0; x < 28; x++) {
      const sp = 9 + (x * 7) % 5, ph = (x * 13) % 17;
      for (let y = 0; y < 34; y++) {
        const s = (y - t * sp * 6 + ph * 3) % 11;
        const w = ((s % 11) + 11) % 11;
        c.fillStyle = w < 1 ? '#f4fcff' : w < 3 ? '#b8e4f4' : x % 3 === 0 ? '#5aa8d0' : '#7cc0e0';
        c.fillRect(x, y, 1, 1);
      }
    }
    for (let x = 0; x < 28; x++) if (hash3(x, Math.floor(t * 8), 1) < 0.4) { c.fillStyle = '#ffffff'; c.fillRect(x, 32 + (x % 2), 1, 1); }
    fall.tex.needsUpdate = true;
  };
  drawFall(0);
  const ripple = k.light(0x9ad8f8, 0.9, 6, [W(-27), W(28), W(-30)], 1.2);
  let ft = 0;
  k.every((dt, t) => {
    ft += dt;
    if (ft > 0.08) { ft = 0; drawFall(t); }
    ripple.intensity = 0.75 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 2.1 + 1);
  });

  // ---- THE LONG TALK on a lectern: tap to read what he has said so far
  const lec = k.v();
  lec.box(-2, 0, -2, 1, 16, 1, (x, y, z) => tone(x, y, z, 0x7a5a36, 0x5a4024, 0x8a6a44));
  lec.box(-7, 17, -5, 6, 18, 4, (x, y, z) => tone(x, y, z, 0x8a6a44, 0x6a4e30, 0x9a7a52));
  lec.box(-5, 0, -4, 4, 0, 3, 0x5a4024);
  const scroll = k.v();
  scroll.box(-6, 19, -3, 5, 19, 3, (x, y, z) => (z === -3 || z === 3 ? 0x8a5a30 : (x + z * 3) % 4 === 0 ? 0x6a5a40 : 0xf1e3bd));
  for (const z of [-4, 4]) scroll.box(-7, 19, z, 6, 20, z, 0x8a5a30);
  const lectern = k.obj('lectern', lec, null, {});
  lectern.add(k.mesh(scroll));
  k.prop('scroll', lectern, {
    x: 1.55, z: -0.35, rot: -0.5, label: 'The Long Talk (so far)', stand: [1.05, 0.35],
    tap: {
      effect: (c) => {
        const ph = LN?.S?.phase;
        c.sfx('page', 0.4);
        if (ph === 'talking' || ph === 'done') {
          c.anim(['nod']);
          c.later(0.4, () => LN.openTranscript());
          if (ph === 'talking') c.later(1.0, () => c.foxSay('He writes it down as he goes? Then he\'s slow at that too.'));
          return true;
        }
        c.anim(['talk']);
        c.say('...That is... ... for later. ... ... Ask me... outside.');
        return true;
      },
    },
  });

  // ---- the low stone tea table, a clay pot that steams, two bowls, cushions of moss
  const tt = table(k, { w: 26, d: 18, h: 7, round: true, col: 0x8a9088 });
  k.add(tt, -0.25, 0, 0.55);
  const pot = teapot(k, { col: 0x8a5a3a });
  const bowls = k.v();
  for (const [bx, bz] of [[7, 3], [-8, 4]]) for (let y = 0; y < 2; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) bowls.set(bx + x, y, bz + z, y === 1 && !x && !z ? 0x8aa846 : 0x8a5a3a);
  k.add(k.obj('bowls', bowls), -0.25, W(8), 0.55);
  const steam = steamer(k, new THREE.Vector3(-0.05, W(16), 0.5), { n: 3, rise: 0.4, rate: 0.12 });
  for (const [cx, cz] of [[-1.15, 0.85], [0.75, 1.0]]) { const cu = k.v(); ell(cu, 0, 1.5, 0, 6, 2, 5, (x, y, z) => tone(x, y, z, 0x5f8c3a, 0x4f7a32, 0x6a9a44)); k.add(k.obj('cushion', cu), cx, 0, cz); }
  k.prop('tea', pot, {
    x: -0.35, y: W(8), z: 0.45, label: 'Pine-needle tea', pad: 0.12,
    tap: {
      anim: ['sip_tea', 'nod'], sfx: 'bubble', fx: 'puff', fxN: 2,
      lines: ['...Pine-needle tea. ... ... Steep it... ... until spring.', '...Sugar? ... ... ... No.', '...It is hot. ... ... It was hot... ... in 1902. ... Still is.'],
      reward: { friend: 0.5 }, rewardLine: ['...A bowl... for you. ... ... Sip. ... Slowly.'],
      fox: ['It tastes like a Christmas tree. A very old Christmas tree.'],
      effect: (c) => { const l = c.parts.lid; c.tween(1.6, (q) => { l.position.y = W(6) + Math.abs(Math.sin(q * Math.PI * 2)) * 0.03; }); steam.on = true; },
    },
  });

  // ---- shelves of ancient scrolls and fossils
  const shelf = bookshelf(k, {
    w: 26, h: 34, d: 9, col: 0x6a5a40, rows: 4,
    fill: (b, y, hh, hx, d, r) => {
      for (let x = -hx + 2; x < hx - 2; x += 4) {
        const h = hash3(x, r, 11);
        if (r % 2 === 0 && h < 0.7) {
          // rolled scrolls lying in a stack
          for (let s = 0; s < 2 + (h * 2 | 0); s++) b.box(x - 1, y + s, -d / 2 + 2, x + 1, y + s, d / 2 - 2, (xx, yy, zz) => (zz === -d / 2 + 2 || zz === d / 2 - 2 ? 0x8a5a30 : (xx + s) % 2 ? 0xf1e3bd : 0xe0cc9a));
        } else if (h < 0.85) {
          // an ammonite fossil (a spiral in a stone slab)
          b.box(x - 1, y, -1, x + 1, y + 2, 0, (xx, yy) => ((xx + yy) % 2 ? 0xb8b0a0 : 0x9a927e));
          b.set(x, y + 1, 1, 0x6a624e);
        } else b.box(x - 1, y, -1, x, y + 1, 0, 0x8aa0a8); // a smooth river stone
      }
    },
  });
  k.prop('shelf', shelf, {
    x: 1.9, z: -1.6, label: 'Scrolls and fossils',
    tap: {
      anim: ['point', 'talk'], sfx: 'paper',
      lines: ['...My letters. ... ... I am still... ... writing back.', '...That fossil... ... was a friend... of mine.', '...An ammonite. ... ... Very slow... ... reader.'],
      fox: ['Is that a fossil or his old lunch?', 'Every one of these scrolls says "Dear..." and then nothing.'],
    },
  });

  // ---- the sand garden (raked lines around three stones)
  const sg = k.v();
  const SX = 18, SZ = 12;
  sg.box(-SX, 0, -SZ, SX - 1, 1, SZ - 1, (x, y, z) => (Math.abs(x + 0.5) > SX - 1.5 || Math.abs(z + 0.5) > SZ - 1.5 ? 0x6a5a40 : null));
  const rocks = [[-8, -2, 2.6], [6, 3, 2.0], [10, -5, 1.4]];
  for (let x = -SX + 1; x < SX - 1; x++) for (let z = -SZ + 1; z < SZ - 1; z++) {
    let d = 99;
    for (const [rx, rz] of rocks) d = Math.min(d, Math.hypot(x - rx, z - rz));
    const line = d < 9 ? Math.floor(d) % 2 : z % 2 === 0 ? 1 : 0;
    sg.set(x, 0, z, line ? 0xd8cca4 : 0xeee4c4);
  }
  for (const [rx, rz, r] of rocks) ell(sg, rx, 1, rz, r, r * 0.8, r * 0.9, (x, y, z) => tone(x, y, z, 0x7c8278, 0x6c7268, 0x9aa096));
  const garden = k.obj('sandgarden', sg);
  k.prop('garden', garden, {
    x: -1.7, z: 1.2, rot: 0.08, label: 'Sand garden',
    tap: {
      anim: ['nod', 'talk'], sfx: 'rs_path', fx: 'puff', fxN: 3,
      lines: ['...I rake it... ... once a year.', '...The lines... ... are a map. ... ... Of nothing.', '...Do not... step... ... on the... ... ... ah.'],
      reward: { friend: 0.5 }, rewardLine: ['...You found... ... the calm. ... ... Took me... a century.'],
    },
  });

  // ---- the glowing pool with one very old koi
  const pool = k.v(), glow = k.v();
  ell(pool, 0, 0.5, 0, 14, 2.2, 10, (x, y, z) => {
    const r = Math.hypot(x / 14, z / 10);
    if (r < 0.78) return null;
    return tone(x, y, z, 0x8a9088, 0x6c7268, 0xaab0a2);
  });
  ell(glow, 0, 0, 0, 11, 1, 7.8, (x, y, z) => (hash3(x, y, z) < 0.12 ? 0x9af0e8 : (x + z) % 5 === 0 ? 0x4ad0c8 : 0x3ab8b8));
  const poolObj = k.obj('pool', pool, glow);
  const koi = k.v();
  ell(koi, 0, 0, 0, 3, 1, 1.4, (x) => (x > 1 ? 0xf8f4e8 : x > -1 ? 0xe8783a : 0xf8f4e8));
  koi.set(-4, 0, 0, 0xe8783a).set(-5, 0, 1, 0xf8f4e8).set(-5, 0, -1, 0xf8f4e8).set(2, 1, 0, 0xffd84a);
  const fish = k.part(poolObj, 'koi', koi, null, [0, 2, 0]);
  k.every((dt, t) => { const a = t * 0.25; fish.position.set(Math.cos(a) * W(6), W(2.2), Math.sin(a) * W(4)); fish.rotation.y = -a - Math.PI / 2; });
  k.light(0x6ae8e0, 0.8, 3, [1.2, 0.35, 0.7], 1.6);
  k.prop('pool', poolObj, {
    x: 1.25, z: 0.75, label: 'The glowing pool',
    tap: {
      anim: ['point', 'nod'], sfx: 'bubble', fx: 'bubbles', fxN: 5,
      lines: ['...The koi... ... is older... than me. ... ... Do not... tell her.', '...The pool... glows. ... ... Nobody knows why. ... ... I know why.', '...Her name... is Mildred. ... ... She does not... ... know that.'],
      reward: { coins: 30 }, rewardLine: ['...A coin... ... from the bottom. ... ... Very old. ... Spend it... slowly.'],
      fox: ['A koi older than him. That fish has seen things.'],
    },
  });

  // ---- wind chimes by the window
  const ch = k.v();
  ch.box(-8, 0, 0, 7, 0, 0, 0x6e8a3a);
  ch.set(0, 1, 0, 0xe8dcc0).set(0, 2, 0, 0xe8dcc0);
  const chimes = k.obj('chimes', ch);
  const tubes = [];
  [-6, -2, 2, 6].forEach((x, i) => {
    const tb = k.v();
    for (let y = -1; y >= -2; y--) tb.set(0, y, 0, 0xe8dcc0);
    for (let y = -3; y >= -6 - i * 2; y--) tb.set(0, y, 0, y === -3 ? 0xa8822a : 0xd8b04a);
    tubes.push(k.part(chimes, 't' + i, tb, null, [x, 0, 0]));
  });
  const swing = { a: 0.06 };
  k.every((dt, t) => { swing.a = Math.max(0.06, swing.a - dt * 0.3); tubes.forEach((tb, i) => { tb.rotation.z = Math.sin(t * 1.3 + i * 1.9) * swing.a; tb.rotation.x = Math.cos(t * 0.9 + i) * swing.a * 0.6; }); });
  k.prop('chimes', chimes, {
    x: W(-8), y: W(50), z: -1.55, label: 'Wind chimes', stand: [-0.4, -0.6], pad: 0.1,
    tap: {
      anim: ['nod', 'happy'], sfx: ['ln_chime', 0.5],
      lines: ['...Listen. ... ... ... ... There.', '...The wind... ... is late... ... today.', '...They play... ... one song. ... ... It is... ... very long.'],
      effect: () => { swing.a = 0.5; },
    },
  });

  // ---- an indoor sundial (he does not need to know the time precisely)
  const sd = k.v();
  ell(sd, 0, 0, 0, 7, 3, 7, (x, y, z) => (y < 0 ? null : y >= 2 ? ((Math.round(Math.atan2(z, x) * 6 / Math.PI) % 2) ? 0xc8c2b0 : 0xb0aa98) : 0x8a9088));
  for (let y = 3; y <= 7; y++) sd.set(0, y, 3 - Math.round(y * 0.4), 0xa8822a);
  k.prop('sundial', k.obj('sundial', sd), {
    x: -2.55, z: -0.45, label: 'Indoor sundial',
    tap: { anim: ['point', 'talk'], lines: ['...It is... ... about... ... now.', '...A sundial. ... Indoors. ... ... I am... ... never late.', '...It has... ... never... been wrong. ... ... It has never... been right.'], fox: ['There is no sun in here. ...I\'m not going to say anything.'] },
  });

  // decor: a fern in a stone pot, a stack of river stones, a lantern of glowing moss
  k.add(plant(k, { pot: 0x7c8278, leaf: 0x5a9a44, h: 12 }), 2.6, 0, 1.45);
  k.add(plant(k, { pot: 0x6c7268, leaf: 0x4f7a32, h: 9 }), -2.7, 0, 1.5);
  const cairn = k.v();
  [[0, 0, 4], [0, 2, 3], [1, 4, 2], [0, 6, 1.4]].forEach(([x, y, r]) => ell(cairn, x, y, 0, r, 1.2, r * 0.8, (xx, yy, zz) => tone(xx, yy, zz, 0x8a9088, 0x6c7268, 0xaab0a2)));
  k.add(k.obj('cairn', cairn), 2.65, 0, -0.55);
  k.deco((R, G) => { for (let x = 30; x < 52; x++) for (let y = 30; y < 50; y++) if (hash3(x, y, 77) < 0.04) G.set(x, y, -40, 0x9af0a0); }); // glowing moss specks
  k.light(0xffd8a0, 0.7, 6, [0.4, 1.8, 0.4]);
  k.light(night ? 0x8ab8ff : 0xfff0d0, 0.5, 6, [-1.6, 2.2, -0.6]);

  const line = LN?.homeLine?.();
  return {
    title: "Longneck's Grotto", bg: 0x161c1a, music: 'sleep',
    light: { sky: 0xd8ecf0, ground: 0x34402e, hemi: 1.3, fillI: 0.6 },
    npc: { x: -0.2, z: -0.35, rot: 0.45 }, npcScale: 0.86,
    fox: { x: -1.3, z: 1.3 },
    idle: ['idle'],
    specials: ['sip_tea', 'nod', 'doze', 'point'],
    greet: line ? [line] : ['...Ah. ... ... Come in. ... ... Slowly.', '...Shoes... ... off. ... ... Shell... on.'],
    bye: ['...Off you... ... go.', '...Come back... ... in a century... ... or two.'],
    chatter: ['...', '...Hm.', '...Tea.'],
    // everything he says in here types slowly (but not the goodbye: that bubble outlives the room)
    update: (dt, t, mode) => { if (mode?.state === 'inside') slowAll(game, 'homelongneck', 3.5); else for (const b of game.ui?.bubbles?.list || []) if (b.key === 'homelongneck') b.__ln = 1; },
  };
}
