// [v33 title] HeistScene: the title screen as a looping noon cinematic.
//
// High noon by the pond. Reynard has set up a one-fox bank on an upturned fruit crate:
// a felt pad, a heap of gold, coin stacks, bundles of bills and a burlap sack. The
// camera directs a ~47 s comic short in shots (crane, orbit, slow push-ins, a macro
// insert, a low-angle reveal, a tracking chase) and loops back seamlessly:
//
//   A  0.0  crane down onto the little bank by the pond, Reynard counting coins
//   B  6.0  close: he licks his thumb and flicks through a bundle, then flips a coin
//   C 12.2  macro insert: a coin lands on the stack, CLINK, the top coin glints, TING!
//   D 13.8  he hugs the whole heap, then MWAHAHA... while a bear wanders in behind him
//   E 19.0  tight: a huge shadow falls over him. A glance up, back to counting, the
//           double take: frozen, then YIPE! (hat pops, monocle drops)
//   G 23.0  low angle: the bear looms over the crate and ROARS
//   H 24.6  a blur of paws sweeps everything into the sack, legs wind up, ZOOM!
//   I 27.5  tracking shot: Reynard sprints across the meadow hugging the sack, bills
//           fluttering out behind him, the bear lumbering after him
//   J 32.5  the empty bank. One dropped coin glints in the grass... Reynard zips back
//           for it, kisses it, the bear thunders in behind him again, a sheepish grin
//           to the camera, ZOOM, both gone again
//   K 39.5  a stray bill flutters onto the crate; Reynard tiptoes back with the sack,
//           pours the money out, rubs his paws and starts counting as the camera cranes
//           back up to the opening shot.
//
// Lighting: a high, bright, slightly warm sun from over the camera's left shoulder
// (crisp short shadows), a clear blue sky with a few fat clouds (heistSky.js), drifting
// cloud shadows, warm saturated grade. Shot E cheats the sun behind the bear so its
// shadow can fall over Reynard (a film cut cheat). Everything the scene touches
// (renderer uniforms, sky, camera, hidden trees / hut / fish) is restored by stop().
//
//   const s = new HeistScene(game); s.start(); s.update(dt); s.stop();
//   window.__title.seek(t)   jump to loop time t (tests);  ?heist=t  start at t
import * as THREE from 'three';
import { FoxRig } from '../../entities/foxRig.js';
import { BearRig } from '../../entities/bearRig.js';
import { BEAR_TYPES } from '../../data/bears.js';
import { FX } from '../Particles.js';
import { comicWordSize, paintComicWord } from '../../ui/goofyText.js';
import { voxelMaterial } from '../../core/voxel.js';
import { makeNoonSky } from './heistSky.js';
import { makeCrateDesk, makeDeskMoney, makeSack, BillFlurry, coinGeometry, billBundleGeometry, MONEY_V, CRATE_V, disposeHeistProps } from './heistProps.js';
import { HEIST_ANIMS, playDef, borrow } from './heistAnims.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = {
  lin: (t) => t,
  io: (t) => smooth(t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};
const rand = (a, b) => a + Math.random() * (b - a);
const angLerp = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };

// ---------------------------------------------------------------- the set
const SET = { x: 75.5, z: 36.0 }; // the crate: on the grass by the pond's south-east corner
const Y0 = 0.35; // base camera yaw (camera south-south-east of the set, looking across it at the pond)
const LOOP = 47;
const FOX_SCALE = 0.9;
const SKY_D = 6.5; // the sky curtain hangs this far behind the camera's focus
const FOX_SPOT = [0, -0.42]; // behind the crate
const SACK_SPOT = [-0.64, 0.08];
const COIN_SPOT = [0.78, 0.6]; // where the dropped coin lands
const BEAR_CAST = ['office', 'lumberjack', 'tourist', 'hipster', 'construction', 'ceo'];

// ---------------------------------------------------------------- tracks (set coords: r = right, f = towards the camera)
// [t, r, f, ease]; ease 'jump' = hold the previous key until t, then jump (off-screen moves)
const FOX_PATH = [
  [0, 0, -0.42],
  [26.6, 0, -0.42],
  [26.85, 1.45, -0.02, 'in'],
  [27.5, 5.0, 0.28, 'lin'],
  [32.2, 19.5, 1.7, 'lin'],
  [32.21, -10.5, 0.4, 'jump'],
  [33.9, -10.5, 0.4],
  [34.65, 0.86, 0.22, 'out'],
  [37.7, 0.86, 0.22],
  [37.95, 2.4, 0.5, 'in'],
  [39.4, 12.5, 1.3, 'lin'],
  [39.41, -5.7, -0.25, 'jump'],
  [40.6, -5.7, -0.25],
  [44.0, -0.86, -0.28, 'io'],
  [45.55, -0.86, -0.28],
  [46.15, 0, -0.42, 'io'],
  [47, 0, -0.42],
];
const BEAR_PATH = [
  [15.0, 7.4, -3.4],
  [18.4, 2.9, -2.0, 'lin'],
  [19.55, 0.25, -1.45, 'out'],
  [26.6, 0.25, -1.45],
  [26.9, 0.5, -1.05, 'out'],
  [27.6, 2.2, -0.5, 'in'],
  [32.6, 17.0, 1.2, 'lin'],
  [32.61, -12.0, -0.6, 'jump'],
  [35.0, -12.0, -0.6],
  [36.3, -0.62, -0.78, 'out'],
  [37.75, -0.62, -0.78],
  [38.0, 0.3, -0.35, 'out'],
  [38.4, 1.8, 0.2, 'in'],
  [40.6, 10.5, 0.8, 'lin'],
];
function evalPath(keys, t, out) {
  if (t <= keys[0][0]) { out.r = keys[0][1]; out.f = keys[0][2]; out.v = 0; return out; }
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k[0]) {
      const p = keys[i - 1];
      if (k[3] === 'jump') { out.r = p[1]; out.f = p[2]; out.v = 0; return out; }
      const d = k[0] - p[0];
      const u = d > 0 ? (t - p[0]) / d : 1;
      const E = ease[k[3] || 'lin'];
      const e = E(u), e2 = E(Math.min(1, u + 0.01));
      out.r = lerp(p[1], k[1], e); out.f = lerp(p[2], k[2], e);
      out.v = (Math.hypot(k[1] - p[1], k[2] - p[2]) * (e2 - e)) / Math.max(1e-4, d * 0.01); // speed (u/s)
      out.dr = k[1] - p[1]; out.df = k[2] - p[2];
      return out;
    }
  }
  const l = keys[keys.length - 1];
  out.r = l[1]; out.f = l[2]; out.v = 0;
  return out;
}

// ---------------------------------------------------------------- shots
// cam(u, t) -> { yaw (rel. to Y0), pitch (deg), wupp, at: [r, y, f], sx, sy }
// sx / sy: where the focus sits on screen (fractions of the view, + = right / up);
// wide screens keep the subject right of the menu.
const SHOTS = [
  { id: 'A', t: 0, d: 6, cam: (u) => { const e = ease.io3(u); return { yaw: lerp(-0.32, -0.06, e), pitch: lerp(34, 15, e), wupp: lerp(0.024, 0.0172, e), at: [lerp(0, 0.1, e), lerp(0.55, 0.5, e), lerp(-0.3, -0.25, e)], sx: 0.16, sy: lerp(-0.02, 0.02, e) }; } },
  { id: 'B', t: 6, d: 6.2, cam: (u) => { const e = ease.io(u); return { yaw: lerp(0.34, 0.2, e), pitch: lerp(9, 10.5, e), wupp: lerp(0.0104, 0.0086, e), at: [0.02, 0.6, -0.38], sx: 0.14, sy: 0 }; } },
  { id: 'C', t: 12.2, d: 1.6, cam: (u) => ({ yaw: lerp(0.52, 0.46, u), pitch: 7, wupp: lerp(0.0054, 0.0047, ease.out(u)), at: [lerp(0.15, 0.24, u), 0.43, -0.02], sx: 0.1, sy: -0.06 }) },
  { id: 'D', t: 13.8, d: 5.2, cam: (u) => { const e = ease.io(u); return { yaw: lerp(-0.2, -0.06, e), pitch: 12, wupp: lerp(0.0116, 0.0094, e), at: [0.05, 0.62, -0.4], sx: 0.15, sy: 0 }; } },
  { id: 'E', t: 19.0, d: 4.0, sun: 'back', cam: (u, t) => ({ yaw: 0.1, pitch: lerp(8, 7, u), wupp: lerp(0.0074, 0.0067, ease.io(u)) * (t > 22.25 ? 1 - 0.14 * Math.exp(-(t - 22.25) * 5) - 0.07 * smooth((t - 22.25) / 0.2) : 1), at: [0, 0.74, -0.42], sx: 0.12, sy: -0.06 }) },
  { id: 'G', t: 23.0, d: 1.6, cam: (u, t) => ({ yaw: 0.62, pitch: lerp(4, 5.5, u), wupp: lerp(0.0128, 0.0114, ease.out(u)) * (1 - 0.08 * Math.exp(-Math.max(0, t - 23.45) * 4) * (t > 23.45 ? 1 : 0)), at: [0.1, 1.15, -0.9], sx: 0.12, sy: 0.06 }) },
  { id: 'H', t: 24.6, d: 2.9, cam: (u, t) => { const p = smooth((t - 26.55) / 0.85); return { yaw: lerp(0.05, -0.05, p), pitch: 11, wupp: 0.0102 + p * 0.002, at: [lerp(0.1, 3.4, ease.in(p)), 0.66, lerp(-0.6, -0.2, p)], sx: 0.14, sy: 0 }; } },
  { id: 'I', t: 27.5, d: 5.0, cam: (u) => ({ yaw: lerp(0.28, -0.16, ease.io(u)), pitch: lerp(13, 11, u), wupp: 0.0162, at: [lerp(5.6, 17.4, u), 0.7, lerp(0.5, 1.4, u)], sx: 0.2, sy: 0 }) },
  { id: 'J', t: 32.5, d: 7.0, cam: (u, t) => { const k = smooth((t - 35.5) / 0.5) * (1 - smooth((t - 36.2) / 0.4)); return { yaw: lerp(0.24, 0.19, u), pitch: 12, wupp: 0.0122 * (1 - 0.12 * k), at: [lerp(0.3, 0.5, k), 0.56, lerp(0.05, 0.15, k)], sx: 0.15, sy: 0 }; } },
  { id: 'K', t: 39.5, d: 7.5, cam: (u, t) => { const e = ease.io(smooth((t - 41.4) / 5.6)); return { yaw: lerp(0.19, -0.32, e), pitch: lerp(12, 34, e), wupp: lerp(0.0122, 0.024, e), at: [lerp(0.3, 0, e), lerp(0.56, 0.55, e), lerp(0.05, -0.3, e)], sx: lerp(0.15, 0.16, e), sy: lerp(0, -0.02, e) }; } },
];

// ---------------------------------------------------------------- comic sound words (sprites in the world)
const WORD_STYLE = {
  ting: { fill: '#ffffff', ink: '#3a2408', shade: '#ffd23a' },
  clink: { fill: '#fffbe0', ink: '#3a2408', shade: '#ffb84a' },
  mwaha: { fill: '#f4e6ff', ink: '#2a0a3a', shade: '#b46aff' },
  yipe: { fill: '#ffffff', ink: '#1a1418', shade: '#ff7a3a' },
  rawr: { fill: '#fff0e8', ink: '#2a0a0a', shade: '#ff3a2a' },
  zoom: { fill: '#ffffff', ink: '#10304a', shade: '#5ac0ff' },
  mwah: { fill: '#fff0f6', ink: '#5a1030', shade: '#ff6aa8' },
  heh: { fill: '#ffffff', ink: '#1a1418', shade: '#9ad84a' },
  gulp: { fill: '#ffffff', ink: '#1a1418', shade: '#8ac0ff' },
};
const wordTexCache = new Map();
function wordTexture(text, kind) {
  const key = kind + '|' + text;
  let e = wordTexCache.get(key);
  if (e) return e;
  const st = WORD_STYLE[kind] || WORD_STYLE.ting;
  const { w: W, h: H } = comicWordSize(text, { pad: 1, drop: 1 });
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  paintComicWord(cv.getContext('2d'), 0, 0, text, { fill: st.fill, shade: st.shade, ink: st.ink, pad: 1, drop: 1, style: 'drop' });
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  e = { tex, w: W, h: H };
  wordTexCache.set(key, e);
  return e;
}

export class HeistScene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.T = 0; // total running time (main.js reads it)
    this.t = 0; // time in the loop
  }

  // ============================================================ start / stop
  start() {
    if (this.active) return;
    const game = this.game;
    this.active = true;
    this.T = 0; this.t = 0; this.loopN = 0;
    this.group = new THREE.Group();
    this.group.name = 'HeistScene';
    game.scene.add(this.group);
    const rig = game.rig, R = game.renderer, U = R.postMat.uniforms, sky = game.sky;
    this._saved = {
      hour: game.state.hour, phase: game.state.phase,
      wupp: rig.wupp, wuppGoal: rig.wuppGoal, minWupp: rig.minWupp, yaw: rig.yaw, yawGoal: rig.yawGoal,
      pitch: rig.pitch, pitchGoal: rig.pitchGoal, dist: rig.dist, target: rig.target.clone(), goal: rig.goal.clone(),
      freeBounds: rig.freeBounds, follow: rig.follow, viewGuard: rig.viewGuard,
      bloomStrength: R.bloomStrength, threshold: R.brightPass.mat.uniforms.threshold.value,
      u: {}, glint: game.world.waterUniforms?.uGlint?.value?.clone?.(), foxVisible: game.fox.rig.root.visible,
      skyOwn: Object.prototype.hasOwnProperty.call(sky, 'update') ? sky.update : null,
      extOwn: Object.prototype.hasOwnProperty.call(sky, 'setShadowExtent') ? sky.setShadowExtent : null,
      fishVisible: game.fish.batch?.mesh?.visible,
      hutVisible: game.world.hut ? game.world.hut.visible : null,
      smokeOwn: Object.prototype.hasOwnProperty.call(game.particles, 'smoke') ? game.particles.smoke : null,
    };
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) this._saved.u[k] = U[k].value;
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) this._saved.u[k] = U[k].value.clone();

    // --- high noon: bright, warm, saturated, crisp
    game.state.hour = 12.6;
    game.state.phase = 'day';
    game.fox.rig.root.visible = false; // our own Reynard acts instead
    if (game.fish.batch?.mesh) game.fish.batch.mesh.visible = false;
    R.bloomStrength = 0.3;
    R.brightPass.mat.uniforms.threshold.value = 0.9;
    U.haze.value = 0.1;
    U.hazeColor.value.set(0.86, 0.94, 1.0);
    U.vignette.value = 0.2;
    U.vignetteColor.value.set(0.62, 0.52, 0.48);
    U.saturation.value = 1.16;
    U.grade.value.set(1.06, 1.0, 0.93);
    U.lift.value.set(0.01, 0.014, 0.034);
    U.contrast.value = 1.07;
    U.outlineTint.value.set(0.3, 0.26, 0.32);
    game.world.waterUniforms?.uGlint?.value?.set?.(0xfffbe8);
    rig.viewGuard = null; // the title directs the camera itself (no auto-dodging of hills)
    rig.freeBounds = true;
    rig.follow = null;
    rig.minWupp = Math.min(rig.minWupp, 0.004);

    // the set's frame: R0 = right in the base view, F0 = towards the camera
    this.S = new THREE.Vector3(SET.x, 0, SET.z);
    this.R0 = new THREE.Vector3(Math.cos(Y0), 0, -Math.sin(Y0));
    this.F0 = new THREE.Vector3(Math.sin(Y0), 0, Math.cos(Y0));
    this.sunDir = new THREE.Vector3();
    this._sunFor('front');

    this._patchSky();
    // the cottage is hidden (it would stand in front of the camera): no chimney smoke from thin air
    const parts = game.particles, smoke0 = this._saved.smokeOwn || Object.getPrototypeOf(parts).smoke;
    parts.smoke = function (x, y, z, ...rest) { if (Math.hypot(x - 77.8, z - 41.8) < 3 && y > 2.5) return; return smoke0.call(this, x, y, z, ...rest); };
    this.sky = makeNoonSky();
    this.group.add(this.sky);
    this._hideForeground(true);
    this._buildSet();
    this._buildFox();
    this.words = [];
    this._timers = [];
    this._resetLoop(true);
    this._buildEvents();
    const q = new URLSearchParams(location.search);
    if (q.has('heist')) this.seek(+q.get('heist') || 0);
    this._camera(0);
    if (typeof window !== 'undefined') window.__title = this; // test hook
  }

  stop() {
    if (!this.active) return;
    const game = this.game, s = this._saved;
    this.active = false;
    const rig = game.rig, R = game.renderer, U = R.postMat.uniforms, sky = game.sky;
    if (s.skyOwn) sky.update = s.skyOwn; else delete sky.update;
    if (s.extOwn) sky.setShadowExtent = s.extOwn; else delete sky.setShadowExtent;
    if (s.smokeOwn) game.particles.smoke = s.smokeOwn; else delete game.particles.smoke;
    game.state.hour = s.hour; game.state.phase = s.phase;
    game.fox.rig.root.visible = s.foxVisible;
    if (game.fish.batch?.mesh) game.fish.batch.mesh.visible = s.fishVisible ?? true;
    if (game.world.hut && s.hutVisible != null) game.world.hut.visible = s.hutVisible;
    R.bloomStrength = s.bloomStrength;
    R.brightPass.mat.uniforms.threshold.value = s.threshold;
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) U[k].value = s.u[k];
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) U[k].value.copy(s.u[k]);
    if (s.glint) game.world.waterUniforms.uGlint.value.copy(s.glint);
    rig.viewGuard = s.viewGuard;
    rig.freeBounds = s.freeBounds; rig.follow = s.follow; rig.minWupp = s.minWupp;
    rig.wupp = s.wupp; rig.wuppGoal = s.wuppGoal; rig.yaw = s.yaw; rig.yawGoal = s.yawGoal;
    rig.pitch = s.pitch; rig.pitchGoal = s.pitchGoal; rig.dist = s.dist;
    rig.target.copy(s.target); rig.goal.copy(s.goal);
    rig.shake = 0;
    this._hideForeground(false);
    for (const w of this.words) { this.group.remove(w.sprite); w.sprite.material.dispose(); }
    this.words.length = 0;
    this._dropBear();
    this.bills?.dispose();
    this.fox.dispose();
    this.sky.dispose();
    game.scene.remove(this.group);
    this.group = null;
    disposeHeistProps();
  }

  // Trees, boulders and reeds between the camera and the set, or in the chase lane, are
  // flagged removed while the title is up (the cottage too), and the tall meadow clutter
  // (tall grass, fireweed, lupines) is thinned out of the stage, the lane and the
  // foreground so the low camera sees the actors; stop() restores all of it.
  _hideForeground(on) {
    const world = this.game.world;
    if (on) {
      const S = this.S, R = this.R0, F = this.F0;
      const rf = (x, z) => { const dx = x - S.x, dz = z - S.z; return [dx * R.x + dz * R.z, dx * F.x + dz * F.z]; };
      this._hidden = [];
      for (const d of world.decos) {
        if (d.removed) continue;
        const [r, f] = rf(d.x + 0.5, d.z + 0.5);
        if (f > -3.0 && f < 44 && r > -26 && r < 32) { d.removed = true; this._hidden.push(d); }
      }
      this._hiddenClutter = [];
      const tall = /^(tallgrass|fireweed|lupine|aster|fern|swampgrass|glowcap)/;
      for (const c of world.clutter || []) {
        if (c.removed) continue;
        const [r, f] = rf(c.x, c.z);
        const stage = Math.abs(r) < 3.6 && f > -2.8 && f < 2.2;
        const lane = r > -8 && r < 23 && f > -1.6 && f < 2.8;
        const front = f >= 2.2 && f < 16 && r > -12 && r < 24;
        let name = '';
        try { name = world.clutterSprite(c, 0) || ''; } catch { /* */ }
        if (stage || ((lane || front) && tall.test(name))) { c.removed = true; this._hiddenClutter.push(c); }
      }
      if (world.hut) world.hut.visible = false;
    } else {
      for (const d of this._hidden || []) d.removed = false;
      for (const c of this._hiddenClutter || []) c.removed = false;
      this._hidden = null;
      this._hiddenClutter = null;
    }
    try { world.buildDecos(); } catch { /* keep going */ }
    try { world.buildClutter(); } catch (e) { console.warn('[title] clutter', e); }
  }

  at(r, f, y = 0, out = new THREE.Vector3()) { const S = this.S, R = this.R0, F = this.F0; return out.set(S.x + R.x * r + F.x * f, y, S.z + R.z * r + F.z * f); }
  groundY(x, z) {
    const g = this.game.grid;
    try { const tx = Math.floor(x), tz = Math.floor(z); return g.isWater(tx, tz) ? -0.1 : (g.surfaceAtVisual?.(x, z) ?? g.surfaceY(tx, tz)); } catch { return 0; }
  }

  // ============================================================ sky + light
  _sunFor(kind) {
    const R = this.R0, F = this.F0;
    if (kind === 'back') {
      // behind the bear (away from the camera), so its shadow falls over Reynard
      const el = 50 * DEG, h = Math.cos(el);
      this.sunDir.set((-F.x + R.x * 0.12) * h, Math.sin(el), (-F.z + R.z * 0.12) * h).normalize();
    } else {
      // high over the camera's left shoulder: short crisp shadows falling back and to the right
      const el = 60 * DEG, h = Math.cos(el);
      const hx = -R.x * 0.55 + F.x * 0.8, hz = -R.z * 0.55 + F.z * 0.8, l = Math.hypot(hx, hz);
      this.sunDir.set((hx / l) * h, Math.sin(el), (hz / l) * h).normalize();
    }
    this.sunKind = kind;
  }

  _patchSky() {
    const sky = this.game.sky;
    const orig = this._saved.skyOwn || Object.getPrototypeOf(sky).update;
    const origExt = this._saved.extOwn || Object.getPrototypeOf(sky).setShadowExtent;
    const basis = new THREE.Object3D();
    const Rv = new THREE.Vector3(), Uv = new THREE.Vector3(), p = new THREE.Vector3();
    sky.update = (hour, time, focus, yaw) => {
      orig.call(sky, hour, time, focus, yaw);
      const dir = this.sunDir;
      sky.state.sunDir.copy(dir);
      // the shadow camera, snapped to its texels along our sun (as Sky.update does)
      const sc = sky.sun.shadow.camera;
      const texel = (sc.right - sc.left) / sky.sun.shadow.mapSize.x;
      basis.position.set(0, 0, 0); basis.up.set(0, 1, 0);
      basis.lookAt(-dir.x, -dir.y, -dir.z);
      basis.updateMatrixWorld(true);
      const e = basis.matrixWorld.elements;
      Rv.set(e[0], e[1], e[2]); Uv.set(e[4], e[5], e[6]);
      p.set(focus.x, 0, focus.z);
      const ra = p.dot(Rv), ua = p.dot(Uv);
      p.addScaledVector(Rv, Math.round(ra / texel) * texel - ra).addScaledVector(Uv, Math.round(ua / texel) * texel - ua);
      sky.sun.target.position.copy(p);
      sky.sun.position.set(p.x + dir.x * 90, p.y + dir.y * 90, p.z + dir.z * 90);
      sky.sun.target.updateMatrixWorld();
      // bright, a touch warm; a cool blue sky fill in the shade
      sky.sun.color.setHex(0xfff1d8);
      sky.sun.intensity = 2.95;
      sky.hemi.color.setHex(0xb4d2ff);
      sky.hemi.groundColor.setHex(0x80894a);
      sky.hemi.intensity = this.sunKind === 'back' ? 1.32 : 1.06; // (backlit shot: a stronger sky fill)
      // the noon grade, warmed and saturated; a few cloud shadows, no light shafts
      const P = sky.post;
      P.fresh = true;
      P.mul.set(1.04, 1.0, 0.95);
      P.sat = 1.12; P.con = 1.06;
      P.cloud = 0.5; P.shaft = 0; P.glow = 0;
      P.high.set(1.03, 1.0, 0.95);
    };
    // crisper shadows in the close-ups (the game keeps at least 18 tiles of shadow map)
    sky.setShadowExtent = (ext) => {
      const sc = sky.sun.shadow.camera, e = clamp(ext * 1.1, 7, 40);
      if (Math.abs(sc.right - e) > 0.25) { sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix(); }
      void origExt;
    };
  }

  // ============================================================ the set
  _buildSet() {
    const g = this.group;
    const gy = this.groundY(this.S.x, this.S.z);
    this.setY = gy;
    const crate = makeCrateDesk();
    crate.group.position.set(this.S.x, gy, this.S.z);
    crate.group.rotation.y = Y0;
    g.add(crate.group);
    this.crate = crate;
    this.crateTop = gy + crate.top;
    const money = makeDeskMoney();
    money.group.position.set(0, crate.top, 0.01);
    crate.group.add(money.group);
    this.money = money;
    this.sack = makeSack();
    this._parkSack();
    g.add(this.sack);
    // the coin he drops (and comes back for)
    this.coin = new THREE.Mesh(coinGeometry(), voxelMaterial());
    this.coin.castShadow = true;
    this.coin.visible = false;
    g.add(this.coin);
    // loose bills
    this.bills = new BillFlurry(g, {
      max: 16,
      groundAt: (x, z) => {
        // on the crate top, or the grass
        const S = this.S, dx = x - S.x, dz = z - S.z;
        const r = dx * this.R0.x + dz * this.R0.z, f = dx * this.F0.x + dz * this.F0.z;
        if (Math.abs(r) < 0.32 && Math.abs(f) < 0.2) return this.crateTop + 0.01;
        return this.groundY(x, z) + 0.005;
      },
    });
  }

  _parkSack() {
    const s = this.sack;
    if (s.parent && s.parent !== this.group) s.removeFromParent();
    if (!s.parent) this.group.add(s);
    const p = this.at(SACK_SPOT[0], SACK_SPOT[1]);
    s.position.set(p.x, this.groundY(p.x, p.z), p.z);
    s.rotation.set(0, Y0 + 0.5, 0);
    s.scale.setScalar(1);
    s.visible = true;
  }

  _holdSack() {
    const s = this.sack;
    s.setKind('full');
    s.removeFromParent();
    s.position.set(0, -0.26, 0.02);
    s.rotation.set(0, 0, 0);
    s.scale.setScalar(0.9 / FOX_SCALE);
    this.fox.holdBoth(s);
    s.visible = true;
  }

  // ============================================================ Reynard
  _buildFox() {
    const fox = (this.fox = new FoxRig({ shadows: true }));
    fox.setOutfit?.('tycoon');
    fox.root.scale.setScalar(FOX_SCALE);
    this.group.add(fox.root);
    fox.onEvent = (n) => this._foxEvent(n);
    // a bundle of bills for the left paw (lick & flick)
    const bundle = new THREE.Mesh(billBundleGeometry(3), voxelMaterial());
    bundle.rotation.set(0.2, 0, Math.PI / 2);
    bundle.position.set(0, -0.02, 0.03);
    bundle.scale.setScalar(1 / FOX_SCALE);
    bundle.visible = false;
    fox.armL.grip.add(bundle);
    this.bundle = bundle;
    this.defs = {};
    for (const n of ['count_coins', 'laugh_evil', 'horror', 'run', 'tiptoe', 'greedy', 'walk', 'idle', 'cower']) this.defs[n] = borrow(fox, n);
    Object.assign(this.defs, HEIST_ANIMS);
    this.foxSt = { r: FOX_SPOT[0], f: FOX_SPOT[1], heading: Y0, face: null, look: null };
    this.anim('count_coins', 0);
  }

  anim(name, fade = 0.2, o = {}) {
    const def = this.defs[name];
    if (!def) { this.fox.play(name, { fade, ...o }); return; }
    playDef(this.fox, name, def, { fade, ...o });
    this.bundle.visible = name === 'lick_count';
  }

  // ============================================================ the bear
  _spawnBear() {
    this._dropBear();
    const type = BEAR_CAST[this.loopN % BEAR_CAST.length];
    const def = BEAR_TYPES[type] || BEAR_TYPES.office;
    const bear = new BearRig(BEAR_TYPES[type] ? type : 'office', def);
    try { bear.personalize(11.3 + this.loopN * 3.7); } catch { /* */ }
    bear.onEvent = (n) => this._bearEvent(n);
    this.group.add(bear.root);
    this.bear = bear;
    this.bearSt = { heading: Y0 + 2.4, pose: 'walk', t01: 0 };
    this._bearPlace(0);
  }

  _dropBear() {
    if (!this.bear) return;
    try { this.bear.dispose(); } catch { this.bear.root.removeFromParent(); }
    this.bear = null;
  }

  _bearEvent(name) {
    if (name !== 'step' && name !== 'stomp') return;
    const p = this.bear.root.position;
    this._fx((P) => P.kick(p.x, p.y, p.z, 2));
    if (this.bearSt?.pose === 'run') this._sfx('thump', { volume: 0.12, pitch: rand(0.7, 0.85) });
  }

  // ============================================================ loop state
  _resetLoop(first = false) {
    this.money.reset();
    this.bills.fadeAll();
    this.coin.visible = false;
    this.coinSt = null;
    this.sack.setKind('open');
    if (this.fox._both?.obj) this.fox.holdBoth(null);
    this._parkSack();
    this._dropBear();
    this.fox.lookAt(null);
    this.fox.setExpression(null);
    this.fox.restoreMonocle?.();
    this.pours = null;
    this.carrying = false;
    this.billT = 0;
    this.stackI = 0;
    this._timers.length = 0;
    if (!first) this.loopN++;
    this.foxSt.face = null;
    this.ev = 0;
  }

  // the beat sheet: [time, fn], fired in order as the loop plays
  _buildEvents() {
    const fox = this.fox, F = this.F0, R = this.R0;
    const head = () => this.fox.headTop(new THREE.Vector3());
    const bearHead = () => (this.bear ? this.bear.headTop(new THREE.Vector3()) : this.at(0.25, -1.45, 2.4));
    const word = (text, kind, pos, o) => this._word(text, kind, pos.x, pos.y, pos.z, o);
    const E = (this.events = [
      [0.0, () => { this.anim('count_coins', 0.25); this.foxSt.face = null; }],
      // B: lick the thumb, flick through the bills; then the coin flip + bite test
      [6.0, () => this.anim('lick_count', 0.25)],
      [9.65, () => this.anim('count_coins', 0.3)],
      // C: the insert: a coin drops onto the stack, CLINK, the top glints
      [12.25, () => this._dropOnStack(1, 0.42)],
      [13.0, () => this._glintStack(1, true)],
      // D: hug the heap, then the evil laugh (the bear wanders in behind)
      [13.8, () => this.anim('hug_pile', 0.25)],
      [15.0, () => this._spawnBear()],
      [16.35, () => this.anim('laugh_evil', 0.2)],
      // E: the shadow falls; oblivious counting, a glance, the double take
      [19.25, () => this.anim('count_coins', 0.35)],
      [19.4, () => this.bear?.setFace('hungry', { hold: 3.5 })],
      [20.45, () => { fox.lookAt(bearHead()); fox.setExpression('confused', { hold: 0.5 }); }],
      [20.95, () => { fox.lookAt(null); }],
      [21.7, () => { this.anim('freeze', 0.08); this._sfx('heartbeat', { volume: 0.25 }); const h = head(); this._fx((P) => P.sprite('sweat', h.x + 0.1, h.y - 0.15, h.z, { vy: 0.4, life: 0.7, size: 0.1 })); }],
      [22.25, () => {
        fox.lookAt(bearHead());
        this.anim('horror', 0.06);
        fox.popHat?.(1.0, 2);
        const h = head();
        word('YIPE!', 'yipe', h.add(R.clone().multiplyScalar(0.18)).setY(h.y + 0.12), { size: 1.0, life: 1.0 });
        this._fx((P) => P.sprite('bang', h.x + R.x * 0.3, h.y + 0.1, h.z + R.z * 0.3, { vy: 1, life: 0.8, size: 0.24 }));
        this._sfx('fox_startle', { volume: 0.45 });
        this.game.rig.shake = Math.max(this.game.rig.shake || 0, 0.35);
      }],
      // G: the reveal: the bear rears up and ROARS
      [23.05, () => { this.bear?.setFace('roar', { hold: 1.4 }); }],
      [23.45, () => {
        const h = bearHead();
        word('RAWR!', 'rawr', h.setY(h.y + 0.35), { size: 1.6, life: 1.3 });
        this._sfx('roar', { volume: 0.5, pitch: 0.95 });
        this.game.rig.shake = Math.max(this.game.rig.shake || 0, 0.9);
        this.anim('cower', 0.12);
      }],
      // H: the scoop, the windup, ZOOM
      [24.62, () => { fox.lookAt(null); this.anim('scoop', 0.1); this.bear?.setFace('shocked', { hold: 2 }); this._sfx('swish', { volume: 0.3 }); }],
      [25.32, () => { this.sack.setKind('full'); this._fx((P) => P.puff(this.sack.position.x, this.sack.position.y + 0.2, this.sack.position.z, 6, 0.2)); this._sfx('pop_in', { volume: 0.25 }); }],
      [25.58, () => { this._holdSack(); this.anim('windup', 0.12); this._sfx('whoosh', { volume: 0.2, pitch: 1.4 }); }],
      [26.6, () => {
        this.anim('run', 0.08);
        this.carrying = true; this.billT = 0;
        const p = fox.root.position;
        word('ZOOM!', 'zoom', new THREE.Vector3(p.x - R.x * 0.3, p.y + 0.9, p.z - R.z * 0.3), { size: 1.05, life: 0.9 });
        this._fx((P) => P.puff(p.x, p.y + 0.1, p.z, 9, 0.3));
        this._sfx('whoosh', { volume: 0.35 });
        this._dropCoin();
      }],
      [26.62, () => { if (this.bearSt) this.bearSt.lunge = 26.62; this.bear?.setFace('chomp_open', { hold: 0.5 }); }],
      [27.6, () => { this.bear?.setFace('hungry', { hold: 6 }); }],
      [29.4, () => { fox.lookAt(bearHead()); fox.setExpression('horror', { hold: 1.0 }); }],
      [30.4, () => { fox.lookAt(null); }],
      [32.2, () => { this.carrying = false; fox.holdBoth(null); this.sack.visible = false; this._parkSack(); this.sack.visible = false; }],
      // J: the coin gag
      [33.2, () => this._glintCoin()],
      [33.9, () => { this.anim('run', 0.05); this._sfx('whoosh', { volume: 0.3, pitch: 1.2 }); }],
      [34.66, () => {
        this.anim('pick_kiss', 0.06);
        const p = fox.root.position;
        this._fx((P) => { P.dust(p.x, p.y, p.z, 4); P.kick(p.x, p.y, p.z, 3, this.R0); });
        this._sfx('kick', { volume: 0.2, pitch: 1.3 });
      }],
      [35.65, () => { const h = head(); word('MWAH!', 'mwah', h.setY(h.y + 0.05), { size: 0.9, life: 1.0 }); this._fx((P) => P.hearts(h.x, h.y - 0.1, h.z, 2)); this._sfx('heart', { volume: 0.25, pitch: 1.2 }); }],
      [35.0, () => this._sfx('footsteps', { volume: 0.15 })],
      [36.3, () => { this.bear?.setFace('happy', { hold: 1.5 }); this.game.rig.shake = Math.max(this.game.rig.shake || 0, 0.25); this._sfx('thump', { volume: 0.25, pitch: 0.7 }); }],
      [36.45, () => { this.anim('freeze', 0.08); }],
      [36.8, () => {
        this.anim('sheepish', 0.15);
        fox.lookAt(this.game.rig.camera.position.clone());
        const h = head();
        word('HEH...', 'heh', h.setY(h.y + 0.08).addScaledVector(R, 0.2), { size: 0.8, life: 1.0 });
      }],
      [37.7, () => {
        fox.lookAt(null);
        this.anim('run', 0.06);
        const p = fox.root.position;
        word('ZOOM!', 'zoom', new THREE.Vector3(p.x - R.x * 0.2, p.y + 0.8, p.z - R.z * 0.2), { size: 0.95, life: 0.8 });
        this._fx((P) => P.puff(p.x, p.y + 0.1, p.z, 8, 0.28));
        this._sfx('whoosh', { volume: 0.35 });
      }],
      [37.75, () => { if (this.bearSt) this.bearSt.lunge = 37.75; this.bear?.setFace('chomp_open', { hold: 0.4 }); }],
      [38.3, () => { this.bear?.setFace('angry', { hold: 3 }); }],
      // K: the reset
      [39.75, () => this.bills.fling(this.S.x + R.x * 0.05, this.crateTop + 1.9, this.S.z + R.z * 0.05, 0.05, -0.1, 0.02, { life: 6.5 })],
      [40.6, () => this._dropBear()],
      [40.6, () => { this._holdSack(); this.anim('tiptoe', 0.1); }],
      [44.0, () => { this.foxSt.face = Y0 + 1.0; this.anim('pour', 0.2); }],
      [45.55, () => { fox.holdBoth(null); this.sack.setKind('open'); this._parkSack(); this.foxSt.face = null; this.anim('walk', 0.2); this._fx((P) => P.dust(this.sack.position.x, this.sack.position.y, this.sack.position.z, 3)); this._sfx('thump', { volume: 0.18 }); }],
      [46.15, () => { this.anim('greedy', 0.25); }],
      [46.85, () => { this.anim('count_coins', 0.3); }],
    ]);
    E.sort((a, b) => a[0] - b[0]);
  }

  // ============================================================ the clock
  /** Jump to loop time t (tests / ?heist=t): replays the loop silently from the start. */
  seek(t) {
    t = clamp(t, 0, LOOP - 0.01);
    this._resetLoop(true);
    this.t = 0; this.ev = 0;
    this.silent = true;
    while (this.t < t - 1e-4) this._step(Math.min(1 / 30, t - this.t));
    this.silent = false;
    this._camera(0);
  }

  update(dt) {
    if (!this.active) return;
    dt = clamp(dt || 0, 0, 0.1);
    let left = this.hold ? 0 : dt; // (hold: tests freeze the clock on a frame)
    while (left > 1e-6) { const s = Math.min(left, 1 / 30); this._step(s); left -= s; }
    const game = this.game;
    game.fox.rig.root.visible = false;
    game.state.phase = 'day';
    game.state.hour = 12.6;
    try { game.world.sim.update(dt * 0.5, game.wind); } catch { /* */ }
    this._camera(dt);
    this._updateWords(dt);
  }

  _step(dt) {
    this.T += dt;
    let t = this.t + dt;
    const E = this.events;
    if (t >= LOOP) {
      while (this.ev < E.length) E[this.ev++][1]();
      this._resetLoop();
      t -= LOOP;
    }
    while (this.ev < E.length && E[this.ev][0] <= t) E[this.ev++][1]();
    this.t = t;
    // timers
    for (let i = this._timers.length - 1; i >= 0; i--) { const tm = this._timers[i]; tm.t -= dt; if (tm.t <= 0) { this._timers.splice(i, 1); tm.fn(); } }
    this._updateFox(dt);
    this._updateBear(dt);
    this._updateProps(dt);
    this.bills.update(dt);
    this._ambient(dt);
  }

  _later(t, fn) { this._timers.push({ t, fn }); }

  // ------------------------------------------------------------ Reynard on his path
  _updateFox(dt) {
    const fox = this.fox, st = this.foxSt, t = this.t;
    const k = evalPath(FOX_PATH, t, this._pk || (this._pk = {}));
    const p = this.at(k.r, k.f);
    const moving = k.v > 0.25;
    let want = st.face ?? Y0;
    if (moving) want = Math.atan2(this.R0.x * k.dr + this.F0.x * k.df, this.R0.z * k.dr + this.F0.z * k.df);
    st.heading = angLerp(st.heading, want, 1 - Math.exp(-dt * (moving ? 14 : 8)));
    // the run cycle reads better a touch faster than the ground speed at a dash
    const cur = fox._cur;
    if (cur && (cur.name === 'run' || cur.name === 'walk' || cur.name === 'tiptoe')) cur.speed = moving ? clamp(k.v / (cur.name === 'run' ? 3.2 : cur.name === 'walk' ? 1.1 : 1.0), 0.8, 2.4) : 1;
    fox.root.position.set(p.x, this.groundY(p.x, p.z), p.z);
    fox.root.rotation.set(0, st.heading, 0);
    // bills escape from the sack while he runs with it
    if (this.carrying) {
      this.billT -= dt;
      if (this.billT <= 0) {
        this.billT = rand(0.14, 0.26);
        const s = this.sack;
        s.updateWorldMatrix(true, false);
        const q = s.localToWorld(new THREE.Vector3(0, 0.5, 0));
        const back = -1.2;
        this.bills.fling(q.x, q.y + 0.05, q.z, this.R0.x * back + rand(-0.4, 0.4), rand(1.1, 1.8), this.R0.z * back + rand(-0.4, 0.4), { life: LOOP });
        if (Math.random() < 0.3) this._sfx('paper', { volume: 0.1, pitch: rand(1.1, 1.5) });
      }
    }
    fox.update(dt);
  }

  _foxEvent(name) {
    const fox = this.fox, P = this.game.particles, R = this.R0;
    if (name === 'step') {
      const p = fox.root.position;
      const fast = fox._cur?.name === 'run' || fox._cur?.name === 'windup';
      if (fast) this._fx((Pp) => Pp.kick(p.x, p.y, p.z, fox._cur?.name === 'windup' ? 3 : 2, fox._cur?.name === 'windup' ? null : new THREE.Vector3(Math.sin(this.foxSt.heading), 0, Math.cos(this.foxSt.heading))));
      if (Math.random() < 0.3) this._sfx('step', { volume: 0.08, pitch: rand(1.3, 1.6) });
    } else if (name === 'catch') {
      // a counted coin goes onto a stack
      const i = this.stackI++ % 3;
      const m = this.money.stacks[i];
      if (m.n < 10) this.money.setStack(i, m.n + 1);
      const q = this.money.stackTop(i);
      this._fx((Pp) => Pp.sparkle(q.x, q.y, q.z, 3, 0xfff2a0));
      this._sfx('coin', { volume: 0.12, pitch: rand(1.4, 1.7) });
    } else if (name === 'coin') this._sfx('coin', { volume: 0.06, pitch: 2 });
    else if (name === 'flick') {
      // a bill flicks off the bundle and lands on the felt
      fox.armL.grip.updateWorldMatrix(true, false);
      const q = fox.armL.grip.getWorldPosition(new THREE.Vector3());
      const to = this.at(0.12 + rand(-0.06, 0.06), rand(-0.06, 0.08), this.crateTop);
      this.bills.fling(q.x, q.y + 0.03, q.z, (to.x - q.x) * 1.6, rand(0.7, 1.0), (to.z - q.z) * 1.6, { life: Math.max(1, 24.75 - this.t) }); // swept up with the rest in the scoop
      this._sfx('paper', { volume: 0.12, pitch: rand(1.3, 1.7) });
    } else if (name === 'lick') this._sfx('nibble', { volume: 0.08, pitch: 1.6 });
    else if (name === 'squeeze') {
      const h = this.at(-0.06, 0, this.crateTop + 0.25);
      this._fx((Pp) => Pp.hearts(h.x, h.y, h.z, 1));
      if (Math.random() < 0.5) this._sfx('heart', { volume: 0.12, pitch: rand(1, 1.3) });
    } else if (name === 'mwaha') {
      const h = fox.headTop();
      this._word('MWAHAHA!', 'mwaha', h.x + R.x * 0.15, h.y + 0.15, h.z + R.z * 0.15, { size: 1.0, life: 2.0 });
      this._sfx('fox_laugh', { volume: 0.4 });
    } else if (name === 'sweep') {
      // the money flies off the felt into the sack, a few coins at a time
      const s = this.sack.position;
      for (let i = 0; i < 2; i++) {
        const a = this.at(rand(-0.2, 0.25), rand(-0.12, 0.12), this.crateTop + 0.05);
        this._arcCoin(a, new THREE.Vector3(s.x, s.y + 0.36, s.z), rand(0.3, 0.42));
      }
      this._scoopK = (this._scoopK || 0) + 1;
      const k = this._scoopK;
      const M = this.money;
      if (k === 3) M.bundles[0].visible = false;
      if (k === 5) { M.stacks[0].visible = false; M.stacks[2].visible = false; }
      if (k === 7) M.bundles[1].visible = false;
      if (k === 8) M.stacks[1].visible = false;
      M.heap.scale.setScalar(Math.max(0.01, 1 - k / 10));
      if (k >= 10) { M.heap.visible = false; this._scoopK = 0; }
      if (Math.random() < 0.6) this._sfx('coin', { volume: 0.1, pitch: rand(1.2, 1.8) });
    } else if (name === 'grab') {
      this.coin.visible = false;
      this.coinSt = null;
      this._sfx('coin', { volume: 0.25, pitch: 1.5 });
    } else if (name === 'pour') {
      this.pours = { t: 0 };
      this._sfx('coins', { volume: 0.3 });
    }
    void P;
  }

  // ------------------------------------------------------------ the bear on its path
  _bearPlace(dt) {
    const B = this.bear, st = this.bearSt, t = this.t;
    const k = evalPath(BEAR_PATH, t, this._bk || (this._bk = {}));
    const p = this.at(k.r, k.f);
    const moving = k.v > 0.2;
    let want = Y0;
    if (moving) want = Math.atan2(this.R0.x * k.dr + this.F0.x * k.df, this.R0.z * k.dr + this.F0.z * k.df);
    else if (t > 36 && t < 38) want = Y0 + 0.75; // looming behind him at the coin
    st.heading = angLerp(st.heading, want, dt > 0 ? 1 - Math.exp(-dt * (moving ? 8 : 5)) : 1);
    B.root.position.set(p.x, this.groundY(p.x, p.z), p.z);
    B.root.rotation.set(0, st.heading, 0);
    // pose for this moment
    let pose = 'idle', params = { inWater: false };
    if (st.lunge != null && t >= st.lunge && t - st.lunge < 0.34) { pose = 'lunge'; params = { t01: (t - st.lunge) / 0.34 }; }
    else if (t >= 23.0 && t < 24.5) { pose = 'roar'; params = { t01: (t - 23.0) / 1.5 }; }
    else if (moving) { pose = k.v > 2 ? 'run' : 'walk'; params = { speed: k.v, inWater: false }; }
    st.pose = pose;
    B.pose(pose, dt, params);
    B.update(dt);
  }
  _updateBear(dt) { if (this.bear) this._bearPlace(dt); }

  // ------------------------------------------------------------ props: coins in flight, the dropped coin, the pour
  _arcCoin(a, b, T) {
    // a coin sprite thrown from a to b in T seconds (ballistic)
    const g = 9;
    const vx = (b.x - a.x) / T, vz = (b.z - a.z) / T, vy = (b.y - a.y) / T + 0.5 * g * T;
    this._fx((P) => P.fx.spawn('coin', a.x, a.y, a.z, { vx, vy, vz, grav: g, life: T, size: 0.07, fps: 14, flags: 0 }));
  }

  _dropOnStack(i, h) {
    // the insert: a coin falls onto the middle stack from just above the frame
    const q = this.money.stackTop(i);
    this.coinFall = { i, t: 0, y0: q.y + h, x: q.x, z: q.z };
    const m = this.fallCoin || (this.fallCoin = new THREE.Mesh(coinGeometry(), voxelMaterial()));
    m.castShadow = true;
    if (!m.parent) this.group.add(m);
    m.visible = true;
    m.position.set(q.x, q.y + h, q.z);
  }

  _glintStack(i, big) {
    const q = this.money.stackTop(i);
    this._fx((P) => {
      P.fx.spawn('sparkle', q.x - this.R0.x * 0.02, q.y + 0.02, q.z - this.R0.z * 0.02, { life: 0.7, size: big ? 0.16 : 0.08, fps: 8, flags: FX.POP | FX.FADE, emissive: 2, bright: true });
      P.fx.spawn('glow', q.x, q.y + 0.01, q.z, { life: 0.45, size: big ? 0.12 : 0.06, flags: FX.POP | FX.FADE, emissive: 2, bright: true });
    });
    if (big) {
      this._word('TING!', 'ting', q.x + this.R0.x * 0.12, q.y + 0.14, q.z + this.R0.z * 0.12, { size: 0.55, life: 0.9 });
      this._sfx('star_pop', { volume: 0.3, pitch: 1.5 });
    }
  }

  _dropCoin() {
    // one coin bounces out of the sack as he zooms off
    const s = this.sack;
    s.updateWorldMatrix(true, false);
    const a = s.localToWorld(new THREE.Vector3(0, 0.5, 0));
    const b = this.at(COIN_SPOT[0], COIN_SPOT[1]);
    b.y = this.groundY(b.x, b.z) + 0.012;
    this.coinSt = { t: 0, a, b, T: 0.55 };
    this.coin.visible = true;
    this.coin.position.copy(a);
  }

  _glintCoin() {
    const c = this.coin.position;
    this._fx((P) => {
      P.fx.spawn('sparkle', c.x, c.y + 0.04, c.z, { life: 0.8, size: 0.13, fps: 8, flags: FX.POP | FX.FADE, emissive: 2, bright: true });
      P.fx.spawn('glow', c.x, c.y + 0.02, c.z, { life: 0.5, size: 0.1, flags: FX.POP | FX.FADE, emissive: 2, bright: true });
    });
    this._word('TING!', 'ting', c.x + this.R0.x * 0.15, c.y + 0.22, c.z + this.R0.z * 0.15, { size: 0.6, life: 0.9 });
    this._sfx('star_pop', { volume: 0.3, pitch: 1.6 });
  }

  _updateProps(dt) {
    // the insert's falling coin
    const cf = this.coinFall;
    if (cf) {
      cf.t += dt;
      const m = this.fallCoin;
      const u = clamp(cf.t / 0.32, 0, 1);
      m.position.set(cf.x, lerp(cf.y0, cf.y0 - 0.42 + 0.0, u * u), cf.z);
      m.rotation.set(Math.sin(cf.t * 30) * 0.5 * (1 - u), cf.t * 9, 0);
      if (u >= 1) {
        m.visible = false;
        this.coinFall = null;
        const st = this.money.stacks[cf.i];
        this.money.setStack(cf.i, st.n + 1);
        const q = this.money.stackTop(cf.i);
        this._word('CLINK', 'clink', q.x - this.R0.x * 0.16, q.y + 0.1, q.z - this.R0.z * 0.16, { size: 0.5, life: 0.7 });
        this._fx((P) => P.sparkle(q.x, q.y, q.z, 4, 0xfff6c0));
        this._sfx('coin', { volume: 0.3, pitch: 1.4 });
      }
    }
    // the dropped coin bouncing to the grass
    const cs = this.coinSt;
    if (cs) {
      cs.t += dt;
      const u = clamp(cs.t / cs.T, 0, 1);
      const c = this.coin;
      const bounce = u < 0.7 ? Math.sin((u / 0.7) * Math.PI) * 0.45 : Math.sin(((u - 0.7) / 0.3) * Math.PI) * 0.08;
      c.position.set(lerp(cs.a.x, cs.b.x, u), lerp(cs.a.y, cs.b.y, u) + bounce, lerp(cs.a.z, cs.b.z, u));
      c.rotation.set(u < 1 ? cs.t * 14 : 0, cs.t * 3, 0);
      if (u >= 1) { this.coinSt = null; c.position.copy(cs.b); c.rotation.set(0, 0.6, 0); this._sfx('coin', { volume: 0.15, pitch: 1.9 }); }
    }
    // the pour: coins stream from the sack onto the felt, the money grows back
    const po = this.pours;
    if (po) {
      po.t += dt;
      const s = this.sack;
      s.updateWorldMatrix(true, false);
      const a = s.localToWorld(new THREE.Vector3(0, 0.46, 0.08));
      if (po.t < 0.85 && Math.random() < dt * 22) this._arcCoin(a, this.at(rand(-0.2, 0.25), rand(-0.1, 0.1), this.crateTop + 0.04), rand(0.2, 0.32));
      const M = this.money, u = clamp((po.t - 0.15) / 0.75, 0, 1);
      M.heap.visible = u > 0.02;
      M.heap.scale.setScalar(Math.max(0.05, ease.out(u)));
      if (u > 0.35 && !M.bundles[0].visible) { M.bundles[0].visible = true; this._sfx('paper', { volume: 0.12 }); }
      if (u > 0.55 && !M.stacks[0].visible) { M.stacks[0].visible = M.stacks[2].visible = true; this._sfx('coin', { volume: 0.15, pitch: 1.3 }); }
      if (u > 0.75 && !M.bundles[1].visible) M.bundles[1].visible = true;
      if (u > 0.9 && !M.stacks[1].visible) M.stacks[1].visible = true;
      if (po.t > 1.0) { this.pours = null; [5, 3, 4].forEach((n, i) => M.setStack(i, n)); }
    }
  }

  // ------------------------------------------------------------ ambient life at noon
  _ambient(dt) {
    if (this.silent) return;
    const P = this.game.particles, S = this.S;
    // sun glints on the pond behind the set
    this.glintT = (this.glintT ?? 0) - dt;
    while (this.glintT <= 0) {
      this.glintT += 0.06;
      const p = this.at(rand(-8, 1), rand(-9, -1.4));
      if (!this.game.grid.isWater(Math.floor(p.x), Math.floor(p.z))) continue;
      P.fx.spawn(Math.random() < 0.2 ? 'sparkle' : 'glint', p.x, -0.07, p.z, { life: rand(0.25, 0.55), size: rand(0.035, 0.07), fps: 10, flags: FX.POP | FX.FADE, emissive: 1.4, tint: [1.2, 1.15, 1.0], bright: true });
    }
    // pollen and seed fluff drifting in the warm air
    this.moteT = (this.moteT ?? 0.5) - dt;
    if (this.moteT <= 0) {
      this.moteT = rand(0.25, 0.5);
      const p = this.at(rand(-5, 6), rand(-2.5, 1.5), rand(0.2, 1.6));
      P.fx.spawn(Math.random() < 0.5 ? 'pollen' : 'seed', p.x, p.y, p.z, { vx: this.R0.x * 0.12 + rand(-0.05, 0.05), vy: rand(-0.02, 0.06), vz: this.R0.z * 0.12 + rand(-0.05, 0.05), life: rand(3, 5), size: rand(0.03, 0.05), flags: FX.FADE | FX.WOBBLE, emissive: 0.5 });
    }
    void S;
  }

  // ============================================================ the camera director
  _shot(t) {
    let s = SHOTS[0];
    for (const x of SHOTS) if (t >= x.t) s = x;
    return s;
  }

  _camera(dt) {
    const game = this.game, rig = game.rig, R = game.renderer;
    const t = this.t;
    const s = this._shot(t);
    const c = s.cam(clamp((t - s.t) / s.d, 0, 1), t);
    // light for this shot (a cut can cheat the sun)
    const sunK = s.sun || 'front';
    if (sunK !== this.sunKind) this._sunFor(sunK);
    const aspect = (R.rtW || 16) / (R.rtH || 9);
    const wide = aspect > 1.25, tall = aspect < 0.95;
    const yaw = Y0 + c.yaw, pitch = c.pitch * DEG;
    const wupp = c.wupp * (tall ? 1.3 : aspect < 1.25 ? 1.12 : 1);
    rig.yaw = rig.yawGoal = yaw;
    rig.pitch = rig.pitchGoal = pitch;
    rig.wupp = rig.wuppGoal = wupp;
    const W = (R.rtW || 400) * wupp, H = (R.rtH || 300) * wupp;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const focus = this.at(c.at[0], c.at[2], this.setY + c.at[1], this._fv || (this._fv = new THREE.Vector3()));
    const sx = wide ? c.sx : 0, syy = (c.sy || 0) + (tall ? -0.08 : 0);
    // screen right (cy, 0, -sy), screen up (-sy*sp, cp, -cy*sp)
    const tx = focus.x - cy * sx * W + sy * sp * syy * H;
    const ty = focus.y - cp * syy * H;
    const tz = focus.z + sy * sx * W + cy * sp * syy * H;
    rig.goal.set(tx, ty, tz);
    rig.target.set(tx, ty, tz);
    // the eye sits just far enough back that the screen's bottom edge still sees ground: whatever
    // stands further towards the camera (the forest across the meadow) is behind the eye, culled
    rig.dist = ((H / 2) * cp + 0.7) / Math.max(0.05, sp) + 0.8;
    // the sky curtain behind the focus, with parallax from the orbit and pan
    const pan = (tx - this.S.x) * this.R0.x + (tz - this.S.z) * this.R0.z;
    this.sky.place(rig, R, { dist: SKY_D, yawRel: c.yaw, pan, time: this.T });
    void dt;
  }

  // ------------------------------------------------------------ comic words
  _word(text, kind, x, y, z, { size = 1, life = 1.1 } = {}) {
    if (this.silent) return;
    const e = wordTexture(text, kind);
    const mat = new THREE.SpriteMaterial({ map: e.tex, transparent: true, alphaTest: 0.5, depthTest: false, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 60;
    sp.position.set(x, y, z);
    this.group.add(sp);
    this.words.push({ sprite: sp, t: 0, life, size, w: e.w, h: e.h, rot: rand(-0.12, 0.12), y0: y });
  }

  _updateWords(dt) {
    const wupp = this.game.rig.wupp;
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      const u = w.t / w.life;
      if (u >= 1) { this.group.remove(w.sprite); w.sprite.material.dispose(); this.words.splice(i, 1); continue; }
      const pop = w.t < 0.16 ? 1.35 * Math.sin((w.t / 0.16) * Math.PI * 0.5) : 1 + 0.35 * Math.exp(-(w.t - 0.16) * 12) * Math.cos((w.t - 0.16) * 30);
      const out = u > 0.8 ? 1 - smooth((u - 0.8) / 0.2) : 1;
      // words keep a steady size on screen whatever the zoom (one word pixel = 2 low-res pixels at size 1)
      const k = wupp * 1.0 * w.size * pop * out;
      w.sprite.scale.set(w.w * k, w.h * k, 1);
      w.sprite.material.rotation = w.rot;
      w.sprite.position.y = w.y0 + w.t * 0.18 * (wupp / 0.012);
    }
  }

  // ------------------------------------------------------------ helpers
  _fx(fn) { if (this.silent) return; try { fn(this.game.particles); } catch { /* fx are optional */ } }
  _sfx(name, o) { if (this.silent) return; try { this.game.audio.play(name, o); } catch { /* audio is optional */ } }
}

export { LOOP as HEIST_LOOP, SHOTS as HEIST_SHOTS, MONEY_V, CRATE_V };
