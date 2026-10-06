// Clip definitions for clips.mjs. Functions are serialised and run inside the page.
//   server  'tb' (The Bear Must Eat dev server) | 'dv' (Deli-very-dead dev server)
//   url     path + query;  ready: page predicate;  init: extra init scripts
//   setup / setup2  run before / after the `warm` pump (ms of virtual time)
//   hook(i) runs before every frame step;  meta() -> per-frame anchors (screen px)
//   audio   page expression -> array of audio objects whose play/babble calls get logged
//   capture 'canvas' (WebGL canvas only, default) | 'page' (screenshot incl. DOM)
export const DEFS = {};

// ---------------------------------------------------------------- The Bear Must Eat
// title diorama at sunset: Reynard fishing, then the bear bursts out of the pond
DEFS.tb_gag = {
  server: 'tb', url: '/', frames: 180, warm: 600,
  ready: () => window.__title && window.__title.active && window.__game,
  setup: () => { const T = window.__title; T.T = 16; T.gagT = 1e9; T.beatT = 1e9; },
  setup2: () => { const T = window.__title; T.gagT = 1.4; },
  audio: '[window.__game.audio]',
};

// the 5 PM rush: restaurants round the pond, bears piling in; our own camera moves
// (the game's feast director is switched off). Shots (frames): 0-119 wide orbit,
// 120-239 close on a bear eating, 240-359 the restaurant shore, 360-479 a bear arriving
const FEAST_SETUP = () => {
  const g = window.__game, st = g.state, D = window.__data;
  g.cine.startFeast = () => {};
  st.coins = 99999;
  for (const r of D.RESEARCH) if (!st.research.includes(r.id)) st.research.push(r.id);
  g.mods = D.computeMods(st.research, 0);
  const P = (t, x, z) => { try { return g.structures.place(t, x, z, { instant: true, free: true }); } catch { return null; } };
  // the pond's middle, then restaurants in rings around it (whatever fits)
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
  window.__step(48, 0.05); // fast-forward: the rush starts and the first bears reach the pond
  window.__feast = { placed, pond: [px, pz] };
};
const FEAST_CAM = (i) => {
  const g = window.__game, rig = g.rig, F = window.__feast, L = (a, b, u) => a + (b - a) * u;
  const bears = g.bears.list.filter((b) => b.visible);
  const pick = (pred) => bears.filter(pred).sort((a, b) => Math.hypot(a.x - F.pond[0], a.z - F.pond[1]) - Math.hypot(b.x - F.pond[0], b.z - F.pond[1]))[0];
  let x = F.pond[0], z = F.pond[1], yaw = 0.6, pitch = 40, wupp = 0.03;
  if (i < 120) { const u = i / 119; yaw = L(0.35, 0.75, u); wupp = L(0.036, 0.028, u); pitch = 42; }
  else if (i < 240) {
    if (i === 120 || !F.hero) F.hero = pick((b) => /eat|yummy|toss|snack|pay|hunt/.test(b.state)) || pick(() => true);
    const p = F.hero; if (p) { x = p.x; z = p.z; }
    const u = (i - 120) / 119; yaw = L(0.9, 1.1, u); wupp = L(0.0125, 0.0105, u); pitch = 34;
  } else if (i < 360) {
    const s = F.placed.find((q) => q[0] === 'bar') || F.placed[0] || ['', F.pond[0], F.pond[1]];
    const u = (i - 240) / 119; x = L(s[1] - 2.5, s[1] + 2.5, u); z = s[2]; yaw = 0.2; wupp = 0.016; pitch = 36;
  } else {
    if (i === 360 || !F.arr) F.arr = pick((b) => /commute|walk|queued|search/.test(b.state)) || pick(() => true);
    const p = F.arr; if (p) { x = p.x; z = p.z; }
    const u = (i - 360) / 119; yaw = L(-0.3, -0.1, u); wupp = L(0.016, 0.013, u); pitch = 30;
  }
  rig.freeBounds = true; rig.follow = null;
  rig.goal.set(x, g.grid.groundAt ? g.grid.groundAt(x, z) : 0, z); rig.target.copy(rig.goal);
  rig.yaw = rig.yawGoal = yaw;
  rig.pitch = rig.pitchGoal = (pitch * Math.PI) / 180;
  rig.minWupp = Math.min(rig.minWupp, wupp);
  rig.wupp = rig.wuppGoal = wupp;
  const rr = g.renderer, hh0 = (rr.rtH * wupp) / 2;
  rig.dist = Math.max(24, (hh0 * Math.cos(rig.pitch) + 0.8) / Math.sin(rig.pitch));
};
DEFS.tb_bears = {
  server: 'tb', url: '/?autostart&notut', frames: 480, warm: 600,
  ready: () => window.__game && window.__game.running && window.__data,
  setup: FEAST_SETUP,
  hook: FEAST_CAM,
  audio: '[window.__game.audio]',
};

// Pukking's bedroom (portfolio): Reynard asleep, jolts awake, changes into his teacher suit
DEFS.tb_wake = {
  server: 'tb', url: '/portfolio/index.html', frames: 300, warm: 1200,
  ready: () => window.__pf && window.__pf.bed,
  setup: () => { window.__pf.setMode('bed'); },
  hook: (i) => { if (i === 24) window.__pf.wakeFox(); },
  meta: () => {
    const P = window.__pf, f = P.bed.fox, v = f.headTop();
    const s = P.bed.rig.worldToScreen(v, P.pr);
    return { fox: [Math.round(s.x), Math.round(s.y)] };
  },
  audio: "import('/src/audio/audio.js').then((m) => [m.default])",
};

// ---------------------------------------------------------------- Deli-very-dead
// settings seeded so the quality governor never steps in; helpers for every DV clip:
//   __dvh.prep({ hour, weather })      1280x720 render, golden-hour light, weather
//   __dvh.pilot(path, { spin, k, wheelie(t), hop(t) })   Hank follows a polyline of [x, z]
//   __dvh.cam(fn)                      fn() -> { pos:[x,y,z], look:[x,y,z], fov } every frame
//                                      (applied right before the world update + render)
const DV_INIT = `
try { localStorage.setItem('deliverydead.settings.v1', JSON.stringify({ quality: 'high', autoQuality: false, pixel: 1, gfx: 4 })); } catch {}
window.__dvh = {
  prep({ hour = 17.6, weather = 'breezy' } = {}) {
    const G = window.__game, p = G.pipeline;
    p.supersample = 1; p.resize(); G.camera.aspect = p.w / p.h; G.camera.updateProjectionMatrix();
    // the software GPU can't afford the water mirror pass or a 4K shadow map
    p.reflections = false; G.world.water.material.uniforms.uReflOn.value = 0;
    const sun = G.world.sun; if (sun.shadow.mapSize.x > 2048) { sun.shadow.mapSize.set(2048, 2048); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    const A = G.world.atmosphere; if (hour != null) A.lightHour = hour; if (weather) A.setWeather(weather, true);
    const g = G.game; if (g?.bike) g.bike.stamina = 1;
  },
  pilot(path, { spin = 1, k = 2.4, ahead = 5, wheelie = null, hop = null } = {}) {
    const g = window.__game.game; let wi = 1;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    window.__pilotT = 0;
    // the crank only banks strokes while input.riding is set (the real controls() sets it)
    import('/src/core/input.js').then((m) => { window.__dvInput = m.input; });
    g.controls = function () {
      const b = this.bike, dt = this.frameDt || 1 / 30;
      if (window.__dvInput) window.__dvInput.riding = true;
      window.__pilotT += dt;
      const t = window.__pilotT;
      while (wi < path.length - 1 && Math.hypot(path[wi][0] - b.pos.x, path[wi][1] - b.pos.z) < ahead) wi++;
      const want = Math.atan2(path[wi][0] - b.pos.x, path[wi][1] - b.pos.z);
      const err = wrap(want - b.yaw);
      b.stamina = 1;
      const hj = hop ? hop(t) : 0;
      return { turn: spin * 11 * dt, brake: 0, steer: Math.max(-1, Math.min(1, -k * err)), jump: hj > 0, jumpPressed: hj === 2, drift: false,
        leanBack: wheelie && wheelie(t) ? 1 : 0, leanFwd: 0, trick: false, up: false, down: false, assist: true };
    };
  },
  cam(fn) {
    const G = window.__game, W = G.world;
    window.__dvCam = fn;
    if (!W.__camWrapped) {
      const orig = W.update.bind(W);
      W.update = (...a) => {
        const f = window.__dvCam && window.__dvCam();
        if (f) { const c = G.camera; c.position.set(...f.pos); c.lookAt(...f.look); if (f.fov) { c.fov = f.fov; c.updateProjectionMatrix(); } }
        return orig(...a);
      };
      W.__camWrapped = true;
    }
  },
};
`;
const DV_RIDE = '/?start=ride&frames=999999999&step=0.0333333&nofreeze';
const dvReady = () => !!(window.__ready === true && window.__game && window.__game.game && window.__game.game.bike);

// the title screen's own dollies: Main Street from the sea, the pumpkin contest (Hank rides
// at the camera), the harbour. 150 frames each, from 2 s into the shot.
DEFS.dv_title = {
  server: 'dv', url: '/?frames=999999999&step=0.0333333', init: [DV_INIT], frames: 180, warm: 400,
  ready: () => !!(window.__ready === true && window.__game && window.__game.game && window.__game.game.title),
  setup: () => { window.__dvh.prep({ hour: null, weather: null }); },
  // frames 0-109: the pumpkin contest (Hank rides at the camera); 110-179: Main Street from the sea
  hook: (i) => {
    const G = window.__game, T = G.game.title;
    if (i === 0) { T.shotI = 0; T.next(); T.shotT = 1.5; }
    if (i === 110) { T.shotI = -1; T.next(); T.shotT = 3; }
    T.shotT = Math.min(T.shotT, 13);
    G.pipeline.post.uFade.value = 0;
  },
};

// golden hour on the country road east of Nana's: chase cam swinging round to a 3/4 view
DEFS.dv_ride = {
  server: 'dv', url: DV_RIDE + '&spawn=-128,63,2.0', init: [DV_INIT], frames: 100, warm: 1500,
  ready: dvReady,
  setup: () => {
    window.__dvh.prep({ hour: 17.5, weather: 'breezy' });
    window.__dvh.pilot([[-128, 63], [-106, 54], [-88, 48.4], [-66, 40], [-46, 33.5], [-31, 32], [-14, 31.6], [8, 33], [32, 38]]);
  },
  hook: (i) => { const c = window.__game.game.chase; c.orbitYaw = -0.6 + Math.min(1, i / 99) * 0.75; c.orbitPitch = 0.12; },
};

// front tracking shot on the road to the covered bridge: the camera rides ahead of
// Hank, a little to the side, looking back at him (his face, the forest behind)
DEFS.dv_bridge = {
  server: 'dv', url: DV_RIDE + '&spawn=-66,40,1.92', init: [DV_INIT], frames: 90, warm: 1200,
  ready: dvReady,
  setup: () => {
    const H = window.__dvh;
    H.prep({ hour: 18.2, weather: 'breezy' });
    H.pilot([[-66, 40], [-46, 33.5], [-31, 32], [-14, 31.6], [8, 33], [32, 38]]);
    H.cam(() => {
      const b = window.__game.game.bike, p = b.pos, f = [Math.sin(b.yaw), Math.cos(b.yaw)], r = [f[1], -f[0]];
      return { pos: [p.x + f[0] * 5.5 + r[0] * 1.6, p.y + 1.45, p.z + f[1] * 5.5 + r[1] * 1.6], look: [p.x, p.y + 1.05, p.z], fov: 50 };
    });
  },
};

// Main Street: a long wheelie past the shops, side tracking shot
DEFS.dv_wheelie = {
  server: 'dv', url: DV_RIDE + '&spawn=152,52.2,1.5708', init: [DV_INIT], frames: 90, warm: 2400,
  ready: dvReady,
  setup: () => {
    const H = window.__dvh;
    H.prep({ hour: 17.8, weather: 'clear' });
    H.pilot([[152, 52.2], [190, 52.2], [230, 52.2], [266, 52.2]], { spin: 1.35, wheelie: (t) => t > 2.7 && t < 6.2 });
    H.cam(() => {
      const b = window.__game.game.bike, p = b.pos, f = [Math.sin(b.yaw), Math.cos(b.yaw)];
      return { pos: [p.x - f[1] * -5.2 + f[0] * 1.2, p.y + 1.3, p.z + f[0] * -5.2 + f[1] * 1.2], look: [p.x + f[0] * 0.6, p.y + 0.95, p.z + f[1] * 0.6], fov: 52 };
    });
  },
};

// ---------------------------------------------------------------- The Bear Must Eat: classroom + outro
// the classroom (portfolio): Reynard chalks up game ideas on the board, the game's own
// lesson text box at the bottom (page capture keeps the DOM text box)
DEFS.tb_ideas = {
  server: 'tb', url: '/portfolio/index.html?idle=1', frames: 300, warm: 1500, capture: 'page',
  ready: () => window.__pf && window.__pf.room && window.__pf.room.board,
  setup: () => {
    const css = document.createElement('style');
    css.textContent = '.pf-x, .pf-tip, .pf-lbl, .pf-labels, .pf-in, .pf-bubble, #pf-loading { display: none !important; }';
    document.head.appendChild(css);
    window.__pf.room.board.clear();
  },
  setup2: () => {
    const T = (text, x, y, o = {}) => ({ text, x, y, ...o }), D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
    const S = { font: 'small' };
    window.__pf.setMode('chapter');
    window.__pf.room.runChapter({
      id: 'ideas', title: 'Game Ideas', number: 7, doodle: 'controller', color: 'yellow', stamp: ['', ''],
      steps: [
        { cam: 'board', expr: 'excited', wait: 0.4, speed: 4.5,
          say: "Need ideas? Here's what I'd love to build with you:",
          draw: [{ text: 'GAME IDEAS', x: 96, y: 9, scale: 2, color: 'yellow', id: 'title' },
            D('sprout', 32, 36, { scale: 2 }), T('FARM SIM', 32, 54, { ...S, color: 'green' }),
            D('egg', 96, 36, { scale: 2 }), T('PET RPG', 96, 54, { ...S, color: 'pink' }),
            D('coin', 160, 36, { scale: 2 }), T('TYCOON', 160, 54, { ...S, color: 'yellow' })] },
        { cam: 'board', expr: 'proud', wait: 3, speed: 4.5,
          say: 'Minecraft mods, roguelikes... or YOUR idea!',
          draw: [D('block', 32, 76, { scale: 2 }), T('MC MOD', 32, 94, { ...S, color: 'blue' }),
            D('flame', 96, 76, { scale: 2 }), T('ROGUELIKE', 96, 94, { ...S, color: 'orange' }),
            D('question', 160, 76, { scale: 2 }), T('YOUR IDEA!', 160, 94, { ...S, color: 'pink' })] },
      ],
    });
  },
  audio: "import('/src/audio/audio.js').then((m) => [m.default])",
};

// outro line-up at the pond: the duck, the fox and the bear (the three price tiers)
DEFS.tb_lineup = {
  server: 'tb', url: '/', frames: 210, warm: 300,
  ready: () => window.__title && window.__title.active && window.__game,
  setup: async () => {
    const S = await import('/tools/promo/stage.js');
    await S.setup('tiers', {
      px: 1, camF: -0.6, fill: 0.6, wupp: 0.0135,
      cast: [
        { kind: 'duck', name: 'duck', sx: 0.21, sy: 0.9, scale: 3.4, rot: 0.3, anim: 'quack', t: 0.3, d: 5, live: true },
        { kind: 'fox', name: 'fox', sx: 0.5, sy: 0.93, scale: 1.25, rot: 0.1, anim: 'dance', t: 0.2, expr: 'happy', d: 5, live: true },
        { kind: 'bear', name: 'bear', type: 'office', sx: 0.79, sy: 0.92, scale: 0.68, rot: -0.2, pose: 'wave', t01: 0.5, time: 0.6, d: 5, live: true },
      ],
    });
  },
  hook: (i) => { const P = window.__promo; if (P.cam) P.cam.wupp = 0.0142 - Math.min(1, i / 209) * 0.0012; },
  meta: () => {
    const P = window.__promo, g = window.__game, f = P.rigs?.fox;
    if (!f) return null;
    const s = g.rig.worldToScreen(f.headTop(), g.renderer);
    return { fox: [Math.round(s.x), Math.round(s.y)] };
  },
};
