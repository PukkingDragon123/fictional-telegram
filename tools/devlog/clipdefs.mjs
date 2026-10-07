// Clips for the devlog videos, recorded with tools/video/clips.mjs:
//   node tools/video/clips.mjs dl_d1_orbit dl_d1_walk ... --defs tools/devlog/clipdefs.mjs
// -> tools/video/clips/<name>/fNNNN.jpg (1080x1920) + meta.json (anchors per frame, sounds).
// Sandbox shots (sandbox.html): the greybox prototype, the voxel turntable, the pixel renderer.
const SB = (shot, seconds, { skip = 0 } = {}) => ({
  server: 'tb',
  url: `/tools/devlog/sandbox.html?shot=${shot}${skip ? `&skip=${skip}` : ''}`,
  viewport: [1080, 1920],
  ready: '() => window.__sb?.ready',
  setup: '() => window.__sb.play()',
  audio: '[window.__sbAudio]',
  meta: '() => window.__sb.meta()',
  capture: 'canvas',
  frames: Math.round(seconds * 30),
});

export const DEFS = {
  dl_d1_orbit: SB('d1_orbit', 7),
  dl_d1_walk: SB('d1_walk', 6.5),
  dl_d1_bug: SB('d1_bug', 6.5, { skip: 4.6 }),
  dl_d2_fish: SB('d2_fish', 6.5),
  dl_d2_bug: SB('d2_bug', 5.5),
  dl_d2_fixed: SB('d2_fixed', 6.5),
  dl_d3_door: SB('d3_door', 5),
  dl_d3_rush: SB('d3_rush', 9, { skip: 2.6 }),
  dl_d3_empty: SB('d3_empty', 5, { skip: 15 }),
  dl_d4_build: SB('d4_build', 9),
  dl_d4_anims: SB('d4_anims', 8.2),
  dl_d4_swap: SB('d4_swap', 6),
  dl_d5_turn: SB('d5_turn', 8.2),
  dl_d5_lineup: SB('d5_lineup', 6.5),
  dl_d5_world: SB('d5_world', 8, { skip: 2 }),
  dl_d6_plain: SB('d6_plain', 6, { skip: 3 }),
  dl_d6_low: SB('d6_low', 6, { skip: 3 }),
  dl_d6_outline: SB('d6_outline', 6, { skip: 3 }),
  dl_d6_pixel: SB('d6_pixel', 6, { skip: 3 }),
};

// ---------------------------------------------------------------- the real game (days 7-10)
// Portrait (1080x1920 -> the game's own 360x640 pixel target). CALM: a quiet day with the clock
// held, no lunch crowd and no rush, the pond stocked; __dl.pond = the pond's middle.
const CALM = `
  const g = window.__game, st = g.state, D = window.__data;
  g.cine.startFeast = () => {};
  g.startRush = () => {};
  g.lunchDone = true;
  g.tutorialHold = true;
  st.coins = 99999;
  for (const r of D.RESEARCH) if (!st.research.includes(r.id)) st.research.push(r.id);
  g.mods = D.computeMods(st.research, 0);
  st.hour = 10.5;
  let px = 0, pz = 0, pn = 0;
  for (let i = 0; i < 80; i++) { const p = g.fish.randomWaterPoint(); if (p) { px += p.x; pz += p.z; pn++; } }
  px /= pn; pz /= pn;
  const sp = ['bluegill', 'perch', 'bass', 'brook', 'rainbow', 'sockeye', 'pike', 'char', 'aurora', 'tiger', 'mapleKoi'];
  for (let i = 0; i < 34; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn(sp[i % sp.length], p.x, p.z, { adult: true, golden: i === 7 }); }
  for (let i = 0; i < 6; i++) { const p = g.fish.randomWaterPoint(); if (p) { try { g.structures.place(i % 2 ? 'lilypad' : 'seaweed', Math.floor(p.x), Math.floor(p.z), { instant: true, free: true }); } catch {} } }
  g.onTopologyChanged();
  window.__dl = { pond: [px, pz] };
`;
// a spot on land next to the pond with room for a little restaurant: __dl.site = [x, z]
const SITE = `
  {
    const g = window.__game, [px, pz] = window.__dl.pond;
    let best = null;
    for (let r = 7; r < 14 && !best; r++) for (let a = 0; a < 24 && !best; a++) {
      const x = Math.round(px + Math.cos((a / 24) * 6.2832 + 0.4) * r), z = Math.round(pz + Math.sin((a / 24) * 6.2832 + 0.4) * r);
      let ok = 0;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (g.structures.canPlace('tikitorch', x + dx, z + dz).ok) ok++;
      if (ok >= 40) best = [x, z];
    }
    window.__dl.site = best || [Math.round(px + 8), Math.round(pz)];
  }
`;
// camera keys { f, x, z (relative to __dl.pond or __dl.site), yaw, pitch (deg), wupp }, eased between keys
const CAM = (keys, { at = 'pond', extra = '' } = {}) => `(i) => {
  const K = ${JSON.stringify(keys)};
  const g = window.__game, rig = g.rig, P = window.__dl.${at};
  let a = K[K.length - 1], b = a, u = 0;
  for (let k = 0; k < K.length - 1; k++) if (i >= K[k].f && i < K[k + 1].f) { a = K[k]; b = K[k + 1]; u = (i - a.f) / (b.f - a.f); break; }
  u = u * u * (3 - 2 * u);
  const L = (p, q) => p + (q - p) * u;
  const x = P[0] + L(a.x, b.x), z = P[1] + L(a.z, b.z), pitch = (L(a.pitch, b.pitch) * Math.PI) / 180, wupp = L(a.wupp, b.wupp);
  rig.freeBounds = true; rig.follow = null;
  rig.goal.set(x, g.grid.groundAt ? g.grid.groundAt(x, z) : 0, z); rig.target.copy(rig.goal);
  rig.yaw = rig.yawGoal = L(a.yaw, b.yaw);
  rig.pitch = rig.pitchGoal = pitch;
  rig.minWupp = Math.min(rig.minWupp, wupp);
  rig.wupp = rig.wuppGoal = wupp;
  rig.dist = Math.max(24, ((g.renderer.rtH * wupp) / 2 * Math.cos(pitch) + 0.8) / Math.sin(pitch));
  ${extra}
}`;
const GAME = (o) => ({
  server: 'tb', url: '/?autostart&notut', viewport: [1080, 1920], warm: 600,
  ready: () => window.__game && window.__game.running && window.__data,
  audio: '[window.__game.audio]',
  ...o,
});

// day 7: the real world, then a whole day/night cycle in eight seconds
DEFS.g7_world = GAME({
  frames: 240,
  setup: `() => { ${CALM} }`,
  hook: CAM([{ f: 0, x: -2, z: -0.5, yaw: 0.2, pitch: 42, wupp: 0.03 }, { f: 240, x: 2, z: -1.5, yaw: -0.05, pitch: 40, wupp: 0.025 }]),
});
DEFS.g7_cycle = GAME({
  frames: 240,
  setup: `() => { ${CALM} }`,
  hook: CAM([{ f: 0, x: 0, z: 1, yaw: 0.05, pitch: 40, wupp: 0.03 }, { f: 240, x: 0.5, z: 0, yaw: 0.2, pitch: 40, wupp: 0.028 }], {
    // 9:00 -> sunset -> a long night -> dawn -> 9:00
    extra: `const HK = [[0, 9], [60, 16.6], [110, 20.2], [190, 28.6], [240, 33]];
      let h = 9; for (let k = 0; k < HK.length - 1; k++) if (i >= HK[k][0] && i <= HK[k + 1][0]) h = HK[k][1] + (HK[k + 1][1] - HK[k][1]) * (i - HK[k][0]) / (HK[k + 1][0] - HK[k][0]);
      g.state.hour = h % 24;`,
  }),
});

// day 8: build a little restaurant, one plonk at a time (the game's own placement juice)
const BUILD_LIST = ['umbrellatable', 'bbq', 'tikitorch', 'picnictable', 'neonsign', 'jukebox', 'umbrellatable', 'planterbox', 'tikitorch', 'beercooler', 'hangout', 'menuboard'];
DEFS.g8_build = GAME({
  frames: 270,
  setup: `() => { ${CALM} ${SITE}
    const [cx, cz] = window.__dl.site, L = [];
    const want = ${JSON.stringify(BUILD_LIST)};
    const spots = [];
    for (let r = 0; r <= 4; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) spots.push([cx + dx * 1, cz + dz * 1]);
    for (const t of want) {
      for (const [x, z] of spots) {
        if (!g.structures.canPlace(t, x, z).ok) continue;
        const s = g.structures.place(t, x, z, { instant: true, free: true });
        if (s) { L.push([t, x, z, s]); break; }
      }
    }
    for (const q of L) g.structures.remove(q[3], { silent: true });
    window.__dl.build = L.map((q) => q.slice(0, 3));
  }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.25, pitch: 40, wupp: 0.021 }, { f: 270, x: 0, z: 0, yaw: 0.05, pitch: 38, wupp: 0.019 }], {
    at: 'site',
    extra: `const B = window.__dl.build, k = Math.floor((i - 24) / 17);
      if (i >= 24 && (i - 24) % 17 === 0 && B[k]) { const [t, x, z] = B[k]; const s = g.structures.place(t, x, z, { instant: true, free: true }); if (s) { g.placeFx(s); g.onStructureBuilt?.(s); } }`,
  }),
});

// the 5 PM rush around a built-up pond (from the gig video's feast setup), portrait
const FEAST = `
  const g = window.__game, st = g.state, D = window.__data;
  g.cine.startFeast = () => {};
  st.coins = 99999;
  for (const r of D.RESEARCH) if (!st.research.includes(r.id)) st.research.push(r.id);
  g.mods = D.computeMods(st.research, 0);
  const P = (t, x, z) => { try { return g.structures.place(t, x, z, { instant: true, free: true }); } catch { return null; } };
  let px = 0, pz = 0, pn = 0;
  for (let i = 0; i < 80; i++) { const p = g.fish.randomWaterPoint(); if (p) { px += p.x; pz += p.z; pn++; } }
  px /= pn; pz /= pn;
  const want = ['bar', 'umbrellatable', 'bbq', 'neonsign', 'jukebox', 'tikitorch', 'hangout', 'roundtable', 'beercooler', 'planterbox', 'tikitorch', 'umbrellatable', 'picnictable', 'menuboard', 'hammock', 'tikitorch'];
  const placed = [];
  for (let r = 3; r < 16 && placed.length < want.length; r++) for (let a = 0; a < 32 && placed.length < want.length; a++) {
    const t = want[placed.length], x = Math.round(px + Math.cos((a / 32) * 6.2832 + r) * r), z = Math.round(pz + Math.sin((a / 32) * 6.2832 + r) * r);
    if (g.structures.canPlace(t, x, z).ok && P(t, x, z)) placed.push([t, x, z]);
  }
  for (let i = 0; i < 6; i++) { const p = g.fish.randomWaterPoint(); if (p) P(i % 2 ? 'lilypad' : 'seaweed', Math.floor(p.x), Math.floor(p.z)); }
  g.onTopologyChanged();
  const sp = ['bluegill', 'perch', 'bass', 'brook', 'rainbow', 'sockeye', 'pike', 'char', 'aurora', 'tiger', 'mapleKoi'];
  for (let i = 0; i < 40; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn(sp[i % sp.length], p.x, p.z, { adult: true, golden: i === 7 }); }
  g.beavers?.refreshCounts?.();
  st.day = 12;
  g.wave = g.bears.planWave(12);
  st.hour = 16.98;
  window.__step(48, 0.05);
  window.__dl = { pond: [px, pz], placed };
`;
// follow one eating bear (picked once), close
const HERO = (pred) => `
  const F = window.__dl;
  if (!F.hero || !F.hero.visible) {
    const bs = g.bears.list.filter((b) => b.visible && (${pred})(b)).sort((a, b) => Math.hypot(a.x - F.pond[0], a.z - F.pond[1]) - Math.hypot(b.x - F.pond[0], b.z - F.pond[1]));
    F.hero = bs[0] || F.hero;
  }
  if (F.hero) { const hx = F.hero.x, hz = F.hero.z; F.cx = F.cx == null ? hx : F.cx + (hx - F.cx) * 0.08; F.cz = F.cz == null ? hz : F.cz + (hz - F.cz) * 0.08;
    rig.goal.set(F.cx, rig.goal.y, F.cz + 0.6); rig.target.copy(rig.goal); }
`;
DEFS.g8_use = GAME({
  frames: 240,
  setup: `() => { ${FEAST} }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.5, pitch: 40, wupp: 0.03 }, { f: 240, x: 0, z: 0, yaw: 0.75, pitch: 40, wupp: 0.026 }]),
});
// day 9: the same rush with every bit of juice off (particles hidden, no shake, no UI), and on
// (the game's own UI stays on in the juice clip, minus the toolbar, its hint and the day card)
const HIDE_UI = `{ const st = document.createElement('style'); st.textContent = '.daycard, #toolbar, .toolhint, .eggtray { display: none !important; }'; document.head.appendChild(st); }`;
DEFS.g9_plain = GAME({
  frames: 210,
  setup: `() => { ${FEAST}
    Object.defineProperty(g.rig, 'shake', { get: () => 0, set: () => {} });
  }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.9, pitch: 38, wupp: 0.024 }, { f: 210, x: 0, z: 0, yaw: 1.0, pitch: 38, wupp: 0.022 }], {
    extra: `${HERO("(b) => /eat|yummy|toss|snack|pay|hunt/.test(b.state)")}
      const PS = g.particles; PS.lit.mesh.visible = PS.glow.mesh.visible = false; PS.fx.batch.mesh.visible = PS.decals.batch.mesh.visible = false;`,
  }),
});
DEFS.g9_juice = GAME({
  frames: 240,
  capture: 'page',
  setup: `() => { ${FEAST} ${HIDE_UI} }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.9, pitch: 38, wupp: 0.024 }, { f: 240, x: 0, z: 0, yaw: 1.0, pitch: 38, wupp: 0.022 }], {
    extra: HERO("(b) => /eat|yummy|toss|snack|pay|hunt/.test(b.state)"),
  }),
});

// day 10: the title screen (menu + the sunset diorama), and the bear bursting out of the pond
DEFS.g10_title = {
  server: 'tb', url: '/', viewport: [1080, 1920], frames: 240, warm: 900, capture: 'page',
  ready: () => window.__title && window.__title.active && window.__game,
  setup: () => { const T = window.__title; T.gagT = 1e9; T.beatT = 1e9; },
  setup2: () => { const T = window.__title; T.gagT = 2.2; },
  audio: '[window.__game.audio]',
};

// day 7: the title screen's bear, with a banana fish for dessert. Straight from the roar to the
// leaping fish (no ducks this time), the camera leaning towards the bear so it is in frame in portrait
DEFS.gb_title_eat = {
  server: 'tb', url: '/', viewport: [1080, 1920], frames: 240, warm: 900, capture: 'page',
  ready: () => window.__title && window.__title.active && window.__game,
  setup: () => { const T = window.__title; T.gagT = 1e9; T.beatT = 1e9; T.setDessert('banana'); },
  setup2: () => {
    const T = window.__title, run = T._runBearGag.bind(T), cam = T._updateCamera.bind(T), rig = window.__game.rig;
    T._runBearGag = (dt) => { const G = T.gag; if (G && G.phase === 'grab') { G.phase = 'fish'; G.t = 0; } return run(dt); };
    T._updateCamera = (dt, instant) => {
      cam(dt, instant);
      const B = T.gag?.bear;
      if (B) { T._lean = Math.min(1, (T._lean || 0) + dt * 1.5); const k = 0.55 * T._lean; rig.goal.x += (B.root.position.x - rig.goal.x) * k; rig.goal.z += (B.root.position.z - rig.goal.z) * k; rig.wuppGoal *= 1 - 0.18 * T._lean; }
    };
    T._startBearGag();
  },
  audio: '[window.__game.audio]',
};

// ---------------------------------------------------------------- v2: the square prototype (pixel art) + the banana fish
for (const [k, sec, skip] of [['q1_wide', 7], ['q1_walk', 6.5], ['q1_bug', 6.5, 4.6], ['q2_fish', 6.5], ['q2_bug', 5.5], ['q2_fixed', 6.5],
  ['q3_door', 5], ['q3_rush', 9, 2.6], ['q3_empty', 5, 15], ['q4_build', 9], ['q4_anims', 8.2], ['q4_swap', 6],
  ['q5_turn', 8.2], ['q5_lineup', 6.5], ['q5_swap', 9]]) DEFS['dl_' + k] = SB(k, sec, { skip });

// banana fish in the real pond: a calm day, a pond full of bananas (and a few normal fish), the
// camera drifting after one of them
const BANANAS = `
  { const g = window.__game;
    for (let i = 0; i < 16; i++) { const p = g.fish.randomWaterPoint(); if (p) g.fish.spawn('banana', p.x, p.z, { adult: true }); }
    if (!g.state.discovered.includes('banana')) g.state.discovered.push('banana'); }
`;
DEFS.gb_pond = GAME({
  frames: 240,
  setup: `() => { ${CALM} ${BANANAS} }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.1, pitch: 42, wupp: 0.011 }, { f: 240, x: 0, z: 0, yaw: 0.2, pitch: 42, wupp: 0.0102 }], {
    extra: `const F = window.__dl;
      if (!F.star || F.star.dead) F.star = g.fish.list.filter((f) => f.sp.id === 'banana' && !f.dead).sort((a, b) => Math.hypot(a.x - F.pond[0], a.z - F.pond[1]) - Math.hypot(b.x - F.pond[0], b.z - F.pond[1]))[0];
      // every so often a banana leaps out of the water (the game's bug-snap jump, minus the bug):
      // out of the water a fish is drawn in full colour
      const LEAP = { 30: 0, 70: 1, 105: 0, 140: 2, 178: 0, 212: 1 };
      if (LEAP[i] != null && F.star) {
        const near = g.fish.list.filter((f) => f.sp.id === 'banana' && !f.dead && !f.jump).sort((a, b) => Math.hypot(a.x - F.star.x, a.z - F.star.z) - Math.hypot(b.x - F.star.x, b.z - F.star.z));
        const f = near[LEAP[i]];
        if (f) g.fish.startJump(f, { x: f.x + Math.cos(f.heading) * 1.6, z: f.z + Math.sin(f.heading) * 1.6, dead: true });
      }
      if (F.star) { F.cx = F.cx == null ? F.star.x : F.cx + (F.star.x - F.cx) * 0.05; F.cz = F.cz == null ? F.star.z : F.cz + (F.star.z - F.cz) * 0.05; rig.goal.set(F.cx, rig.goal.y, F.cz); rig.target.copy(rig.goal); }`,
  }),
});
// the banana fish hatching from a bought egg in the pond, in the game's own egg ceremony:
// tap, tap, tap, NEW SPECIES, then it swims out
DEFS.gb_hatch = GAME({
  frames: 360,
  capture: 'page',
  setup: `() => { ${CALM} ${HIDE_UI}
    st.discovered = st.discovered.filter((s) => s !== 'banana');
    const F = window.__dl, p = g.fish.nearestWater(F.pond[0], F.pond[1]) || g.fish.randomWaterPoint();
    const tmp = g.fish.spawn('banana', p.x, p.z, { adult: true }), genes = tmp.g;
    g.fish.remove(tmp);
    genes.morph = 'normal'; genes.mut = null; genes.stars = 3;
    const e = g.fish.addBoughtEgg('banana', genes, 0, { x: p.x, z: p.z });
    e.ready = true;
    F.egg = e; F.eggAt = [p.x - F.pond[0], p.z - F.pond[1]]; }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.1, pitch: 42, wupp: 0.013 }, { f: 360, x: 0, z: 0, yaw: 0.16, pitch: 42, wupp: 0.012 }], {
    extra: `const F = window.__dl; rig.goal.set(F.pond[0] + F.eggAt[0], rig.goal.y, F.pond[1] + F.eggAt[1] + 0.4); rig.target.copy(rig.goal);
      if (i === 10) g.ui.tapPondEgg(F.egg);
      if (i === 64 || i === 82 || i === 100 || i === 250 || i === 280) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));`,
  }),
});
// ...and the bears eat them: the 5 PM rush on a bare pond stocked mostly with bananas, the camera
// on a bear with a banana in its paws
const FEAST_BANANAS = FEAST
  .replace("const want = ['bar', 'umbrellatable', 'bbq', 'neonsign', 'jukebox', 'tikitorch', 'hangout', 'roundtable', 'beercooler', 'planterbox', 'tikitorch', 'umbrellatable', 'picnictable', 'menuboard', 'hammock', 'tikitorch'];", 'const want = [];')
  .replace("const sp = ['bluegill', 'perch', 'bass', 'brook', 'rainbow', 'sockeye', 'pike', 'char', 'aurora', 'tiger', 'mapleKoi'];", "const sp = ['banana', 'banana', 'banana', 'bluegill', 'banana', 'banana', 'perch', 'banana'];");
DEFS.gb_eat = GAME({
  frames: 240,
  setup: `() => { ${FEAST_BANANAS} }`,
  hook: CAM([{ f: 0, x: 0, z: 0, yaw: 0.9, pitch: 38, wupp: 0.016 }, { f: 240, x: 0, z: 0, yaw: 1.0, pitch: 38, wupp: 0.015 }], {
    extra: HERO("(b) => b.heldFish && b.heldFish.sp && b.heldFish.sp.id === 'banana'"),
  }),
});
