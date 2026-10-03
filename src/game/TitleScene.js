// TitleScene: the cozy, majestic title-screen diorama.
//
// Golden-hour sunset over the pond. Reynard lounges in a striped lawn chair
// standing IN the shallows (legs in the water, little ripples), sipping a Daisy
// Beer next to a bobbing cooler. His buddy, the Daisy Beer delivery deer, sits
// in a second chair beside him. Every ~15-25 s a gag plays:
//   ducks paddle up and peck Reynard's tail -> he leaps out of the chair, panics
//   and chases them around the shallows (splashes, ripples, fist shaking) ->
//   the ducks flap off quacking -> the deer laughs so hard he slaps his knee and
//   nearly tips over backwards -> Reynard stomps back, sits, grumbles and sips.
// Between gags: clinking cans, a contented sigh, fireflies, a leaping fish, a
// dragonfly that lands on the top hat, dust motes and sun glints on the water.
//
//   const title = new TitleScene(game);
//   title.start();          // actors into game.scene, camera / hour / lighting set
//   title.update(dt);       // per frame, real dt (also steps the water sim)
//   title.stop();           // everything removed, lighting / camera / sky restored
//
// Lighting: a low sun from the left (long shadows), a painted sunset sky
// "curtain" with sun disc, clouds and backlit treelines behind the diorama,
// stronger bloom + warm/pink grade (renderer uniforms are restored on stop()).
// Nothing heavy happens at import time.
import * as THREE from 'three';
import { FoxRig, FOX_SEAT_SURFACE } from '../entities/foxRig.js';
import { DeerGuy, Duck, Chick, makeLawnChair, makeDaisyBeerCan, makeCooler, LAWN_CHAIR_SEAT } from '../entities/critters3d.js';
import { BearRig } from '../entities/bearRig.js';
import { BEAR_TYPES } from '../data/bears.js';
import { makeDuckPrey, makeFishPrey } from '../entities/preyFx.js';
import { startEat } from './BearEat.js';
import { SpriteBatch } from '../core/spriteBatch.js';
import { fishCanvasFor, FISH_TPU } from './fishSprites.js';
import { WATER_Y } from '../world/grid.js';
import { FX } from './Particles.js';
import { comicWordSize, paintComicWord } from '../ui/goofyText.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const angLerp = (a, b, t) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };

// ---------------------------------------------------------------- layout
const YAW = -Math.PI * 0.75; // camera in the north-west, looking south-east across the pond
const SEAT = { x: 72.25, z: 35.45 }; // Reynard's chair (a shallow tile on the south-east shore)
const SCALE = 0.85; // same scale as the in-game fox
const CHAIR_Y = -0.25; // chair feet below the water surface (WATER_Y = -0.1)
const FOX_ROT = 0.3; // chair facing offsets from "towards the camera" (radians)
const DEER_ROT = -0.42;
const PITCH = 17; // degrees
const SUN_EL = 0.3; // sun elevation (radians): long shadows
const SKY_D = 3.4; // distance of the sky curtain behind the focus point

// ---------------------------------------------------------------- sky curtain
const SKY_VERT = /* glsl */ `
varying vec3 vL;
void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SKY_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uSun;
uniform float uPx;
uniform float uTop;
varying vec3 vL;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float n11(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float b = 0.0;
  b += mod(q.x + q.y * 2.0, 4.0) == 0.0 ? 0.0 : 0.0;
  int i = int(q.x) + int(q.y) * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  for (int k = 0; k < 16; k++) if (k == i) b = m[k];
  return (b + 0.5) / 16.0;
}
// conifer treeline silhouette height at x (cells of width w, heights hmin..hmax)
float pines(float x, float w, float hmin, float hmax, float seed) {
  float h = 0.0;
  for (int k = -1; k <= 1; k++) {
    float c = floor(x / w) + float(k);
    float r = h11(c * 1.73 + seed);
    if (r < 0.12) continue;
    float cx = (c + 0.3 + 0.4 * h11(c + seed * 3.1)) * w;
    float th = mix(hmin, hmax, h11(c * 7.1 + seed));
    float d = abs(x - cx);
    float hw = w * 0.62;
    // tiered spruce: a triangle with little notches
    float y = th * (1.0 - d / hw);
    y -= step(0.5, fract((th - y) / (th * 0.22))) * 0.06 * th * (d / hw);
    h = max(h, y);
  }
  return h;
}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec2 p = vL.xy;
  vec2 fc = gl_FragCoord.xy;
  float dith = bayer(fc) - 0.5;
  // banded, dithered sunset gradient (height above the horizon, world units)
  float sk = 11.0 / max(uTop, 0.5); // sky features scale with the visible sky height
  float y = p.y * sk + dith * 0.55;
  vec3 c0 = vec3(1.00, 0.86, 0.52), c1 = vec3(1.00, 0.66, 0.40), c2 = vec3(0.98, 0.50, 0.46), c3 = vec3(0.86, 0.40, 0.58), c4 = vec3(0.52, 0.32, 0.62), c5 = vec3(0.26, 0.22, 0.50);
  float yb = floor(y / 0.42) * 0.42; // chunky bands
  vec3 col = c0;
  col = mix(col, c1, smoothstep(0.6, 2.2, yb));
  col = mix(col, c2, smoothstep(2.2, 4.0, yb));
  col = mix(col, c3, smoothstep(4.0, 6.2, yb));
  col = mix(col, c4, smoothstep(6.2, 9.0, yb));
  col = mix(col, c5, smoothstep(9.0, 13.0, yb));
  // sun glow (warmer + brighter towards the sun)
  vec2 ds = (p - uSun) * vec2(0.8, 1.0) * sk;
  float dsun = length(ds);
  float glow = exp(-dsun * 0.3);
  float gq = floor((glow + dith * 0.12) * 7.0) / 7.0;
  col = mix(col, vec3(1.0, 0.82, 0.5), gq * 0.75);
  col += vec3(0.25, 0.14, 0.04) * gq;
  // clouds: long stratus streaks, pink-lit undersides, violet tops
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float cy = 3.6 + fk * 1.9 + 0.5 * h11(fk * 9.0);
    float sx = p.x * sk * (0.16 + 0.05 * fk) * 0.6 + uTime * (0.02 + 0.008 * fk) + fk * 13.0;
    float thick = (n11(sx) * 0.9 + n11(sx * 2.7) * 0.45 - 0.62) * (0.9 + 0.25 * fk);
    float dy = p.y * sk - cy - (n11(sx * 0.5 + 4.0) - 0.5) * 0.7;
    if (thick > 0.0 && abs(dy) < thick) {
      float u = clamp(dy / max(thick, 0.001) * 0.5 + 0.5, 0.0, 1.0); // 0 = underside
      vec3 lit = mix(vec3(1.0, 0.72, 0.52), vec3(1.0, 0.9, 0.7), glow);
      vec3 cc = mix(lit, mix(vec3(0.74, 0.44, 0.66), vec3(0.5, 0.36, 0.64), fk / 3.0), step(0.38 + dith * 0.25, u));
      if (u < 0.16) cc = mix(cc, vec3(1.1, 0.95, 0.72), 0.6 + glow * 0.5);
      col = mix(col, cc, 0.92);
    }
  }
  // the sun disc, sliced by thin cloud lines
  float r = 1.6;
  if (dsun < r) {
    vec3 sc = mix(vec3(2.4, 2.0, 1.25), vec3(1.9, 1.25, 0.6), smoothstep(0.0, r, dsun + dith * 0.3));
    float slice = step(0.82, fract((p.y - uSun.y) * sk * 1.3 + 0.35)) * step(-r * 0.9, (p.y - uSun.y) * sk) * step((p.y - uSun.y) * sk, 0.1);
    col = mix(sc, col * 1.1, slice * 0.8);
  }
  // birds: tiny "v" shapes drifting
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 b = vec2(mod(uTime * (0.25 + fk * 0.05) + fk * 5.0, 20.0) - 10.0 + uSun.x * 0.5, (6.6 + fk * 0.9 + sin(uTime * 0.7 + fk) * 0.2) / sk);
    vec2 q = (p - b) / (uPx * 1.0);
    float flap = step(0.0, sin(uTime * 6.0 + fk * 2.0));
    if (abs(q.y + abs(q.x) * (flap > 0.5 ? -0.7 : 0.25)) < 0.75 && abs(q.x) < 3.2) col = mix(col, vec3(0.32, 0.18, 0.32), 0.85);
  }
  // distant mountains, hazy in the warm light
  float mx = p.x * 0.11;
  float mh = 1.25 + 0.9 * n11(mx) + 0.45 * n11(mx * 2.3 + 7.0) + 0.15 * abs(fract(mx * 3.0) - 0.5);
  float ym = p.y * sk / 3.7;
  if (ym < mh) {
    vec3 mc = mix(vec3(0.84, 0.48, 0.6), vec3(0.98, 0.66, 0.6), glow * 0.8);
    if (ym > mh - 0.18 && dith > -0.2) mc = mix(mc, vec3(1.0, 0.82, 0.62), 0.5 + glow * 0.4);
    // snow caps on the tallest peaks
    if (mh > 2.25 && ym > mh - 0.3) mc = mix(mc, vec3(1.0, 0.86, 0.78), 0.55);
    col = mc;
  }
  // far forest (pink-violet) and near forest (deep plum), backlit rims
  float hf = 0.45 + 0.2 * n11(p.x * 0.3) + pines(p.x, 0.36, 0.35, 0.8, 3.0);
  if (p.y < hf) {
    vec3 fc2 = mix(vec3(0.6, 0.36, 0.5), vec3(0.72, 0.42, 0.5), glow);
    if (p.y > hf - 0.05) fc2 = mix(fc2, vec3(1.0, 0.7, 0.5), 0.5 + glow * 0.5);
    col = fc2;
  }
  float hn = 0.12 + 0.15 * n11(p.x * 0.5 + 11.0) + pines(p.x + 0.31, 0.3, 0.3, 0.95, 17.0);
  if (p.y < hn) {
    vec3 nc = vec3(0.30, 0.17, 0.28);
    if (p.y > hn - 0.04) nc = mix(nc, vec3(0.95, 0.55, 0.42), 0.35 + glow * 0.6);
    // a few twinkly windows / fireflies in the dark woods
    float fx = floor(p.x / (uPx * 2.0)), fy = floor(p.y / (uPx * 2.0));
    float tw = h11(fx * 3.7 + fy * 11.3);
    if (tw > 0.996 && p.y < hn - 0.3) nc = vec3(1.4, 1.2, 0.5) * (0.6 + 0.4 * sin(uTime * 2.0 + tw * 90.0));
    col = nc;
  }
  gl_FragColor = vec4(srgb(max(col, 0.0)), 1.0);
}
`;

// ---------------------------------------------------------------- comic word sprites
const WORD_STYLE = {
  quack: { fill: '#ffffff', ink: '#1a1418', shade: '#ffd23a' },
  haw: { fill: '#ffffff', ink: '#1a1418', shade: '#8ad84a' },
  grr: { fill: '#ffffff', ink: '#1a1418', shade: '#ff5a3a' },
  ahh: { fill: '#ffffff', ink: '#1a1418', shade: '#ff9ac0' },
  clink: { fill: '#ffffff', ink: '#1a1418', shade: '#ffe066' },
  splash: { fill: '#ffffff', ink: '#1a1418', shade: '#6ad0ff' },
  yelp: { fill: '#ffffff', ink: '#1a1418', shade: '#ff7a3a' },
  rawr: { fill: '#fff0e8', ink: '#2a0a0a', shade: '#ff3a2a' },
  eat: { fill: '#fff6dc', ink: '#2a1208', shade: '#ff9a3a' },
  gulp: { fill: '#fff0e0', ink: '#2a1208', shade: '#ff6a4a' },
  burp: { fill: '#f0ffe0', ink: '#14280a', shade: '#8ad84a' },
  slurp: { fill: '#ffe8f4', ink: '#2a0a1a', shade: '#ff6ab0' },
};
// BearEat word ids -> title comic words (the title has its own big pixel font)
const EAT_WORDS = {
  gulp: ['GULP!', 'gulp'], rip: ['RIIIP!', 'rawr'], slurp: ['SLUUURP', 'slurp'], shloop: ['SHLOOP!', 'slurp'], tada: ['TA-DA!', 'clink'],
  ting: ['TING!', 'clink'], mmm: ['MMM...', 'slurp'], pop: ['POP!', 'eat'], crunch: ['CRUNCH!', 'eat'], ding: ['DING!', 'clink'],
  chomp: ['CHOMP!', 'eat'], munch: ['MUNCH', 'eat'], nom: ['NOM', 'eat'], yum: ['YUMMY!', 'slurp'],
};
// eating styles in the order the title bear shows them off (3 ducks + a fish per visit)
const STYLE_DECK = ['gulp', 'rip', 'toss', 'fancy', 'slurp', 'shake', 'chomp'];
const FISH_STYLES = ['slurp', 'crunch', 'gulp', 'chomp'];
const BEAR_CAST = ['office', 'boss', 'lumberjack', 'ceo', 'hipster', 'construction', 'tourist'];
const wordTexCache = new Map();
function wordTexture(text, kind) {
  const key = kind + '|' + text;
  let e = wordTexCache.get(key);
  if (e) return e;
  const st = WORD_STYLE[kind] || WORD_STYLE.quack;
  // TBME Goofy straight from its bitmap glyphs (crisp, no font loading): a fat
  // ink outline, a 1 px shade drop, then the fill
  const { w: W, h: H } = comicWordSize(text, { pad: 1, drop: 1 });
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  paintComicWord(ctx, 0, 0, text, { fill: st.fill, shade: st.shade, ink: st.ink, pad: 1, drop: 1, style: 'drop' });
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  e = { tex, w: W, h: H };
  wordTexCache.set(key, e);
  return e;
}

// ---------------------------------------------------------------- tiny dragonfly
function makeDragonfly() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x2ab0c8, emissive: 0x0a3a44 });
  const eye = new THREE.MeshLambertMaterial({ color: 0x1a3a7a });
  const wingM = new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.55, depthWrite: false });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.2), body);
  b.position.z = -0.05;
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.04), eye);
  h.position.z = 0.06;
  g.add(b, h);
  g.wings = [];
  for (const [x, z] of [[1, 0.02], [-1, 0.02], [1, -0.03], [-1, -0.03]]) {
    const piv = new THREE.Group();
    piv.position.set(x * 0.01, 0.015, z);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.03), wingM);
    w.position.x = x * 0.065;
    piv.add(w);
    piv.side = x;
    g.add(piv);
    g.wings.push(piv);
  }
  return g;
}

// ---------------------------------------------------------------- the scene
export class TitleScene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.T = 0;
  }

  // ============================================================ start / stop
  start() {
    if (this.active) return;
    const game = this.game;
    this.active = true;
    this.T = 0;
    this.group = new THREE.Group();
    this.group.name = 'TitleScene';
    game.scene.add(this.group);

    // --- remember what we touch
    const rig = game.rig, R = game.renderer, U = R.postMat.uniforms, wu = game.world.waterUniforms;
    this._saved = {
      hour: game.state.hour, phase: game.state.phase,
      wupp: rig.wupp, wuppGoal: rig.wuppGoal, minWupp: rig.minWupp, yaw: rig.yaw, yawGoal: rig.yawGoal,
      pitch: rig.pitch, pitchGoal: rig.pitchGoal, dist: rig.dist, target: rig.target.clone(), goal: rig.goal.clone(), freeBounds: rig.freeBounds, follow: rig.follow,
      bloomStrength: R.bloomStrength, threshold: R.brightPass.mat.uniforms.threshold.value,
      u: {}, glint: wu.uGlint.value.clone(), foxVisible: game.fox.rig.root.visible,
      skyOwn: Object.prototype.hasOwnProperty.call(game.sky, 'update') ? game.sky.update : null,
    };
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) this._saved.u[k] = U[k].value;
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) this._saved.u[k] = U[k].value.clone();

    // --- golden hour
    game.state.hour = 18.25;
    game.state.phase = 'day';
    game.fox.rig.root.visible = false; // our own Reynard lounges instead
    this._saved.fishVisible = game.fish.batch?.mesh?.visible;
    if (game.fish.batch?.mesh) game.fish.batch.mesh.visible = false; // big 2D fish read oddly at this low angle

    // --- majestic grade: bloom, warm pink haze, purple vignette
    R.bloomStrength = 0.78;
    R.brightPass.mat.uniforms.threshold.value = 0.74;
    U.haze.value = 0.3;
    U.hazeColor.value.set(1.0, 0.7, 0.58);
    U.vignette.value = 0.4;
    U.vignetteColor.value.set(0.42, 0.24, 0.5);
    U.saturation.value = 1.08;
    U.grade.value.set(1.1, 1.0, 0.88);
    U.lift.value.set(0.035, 0.012, 0.045);
    U.contrast.value = 1.06;
    U.outlineTint.value.set(0.4, 0.26, 0.4);
    wu.uGlint.value.set(0xffe2a0);

    // --- sky: low sun from the left of the view, pink light, warm water
    this._patchSky();

    // --- camera
    rig.freeBounds = true;
    rig.follow = null;
    rig.dist = 24; // keep the (low-pitched) camera inside the meadow, not inside the hills
    rig.minWupp = Math.min(rig.minWupp, 0.008);
    rig.yaw = rig.yawGoal = YAW;
    rig.pitch = THREE.MathUtils.degToRad(PITCH);
    rig.pitchGoal = rig.pitch;
    rig.wupp = rig.wuppGoal = 0.017;
    this._camFocus = new THREE.Vector3(SEAT.x, 0, SEAT.z);
    this._updateCamera(0, true);

    this._buildSky();
    this._buildActors();
    this._hideForeground(true);
    this._initBeats();
    if (typeof window !== 'undefined') window.__title = this; // test hook (tools / Playwright)
  }

  stop() {
    if (!this.active) return;
    const game = this.game, s = this._saved;
    this.active = false;
    const rig = game.rig, R = game.renderer, U = R.postMat.uniforms;
    // restore the world
    if (s.skyOwn) game.sky.update = s.skyOwn; else delete game.sky.update;
    game.state.hour = s.hour; game.state.phase = s.phase;
    game.fox.rig.root.visible = s.foxVisible;
    if (game.fish.batch?.mesh) game.fish.batch.mesh.visible = s.fishVisible ?? true;
    R.bloomStrength = s.bloomStrength;
    R.brightPass.mat.uniforms.threshold.value = s.threshold;
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) U[k].value = s.u[k];
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) U[k].value.copy(s.u[k]);
    game.world.waterUniforms.uGlint.value.copy(s.glint);
    rig.freeBounds = s.freeBounds; rig.follow = s.follow; rig.minWupp = s.minWupp;
    rig.wupp = s.wupp; rig.wuppGoal = s.wuppGoal; rig.yaw = s.yaw; rig.yawGoal = s.yawGoal;
    rig.pitch = s.pitch; rig.pitchGoal = s.pitchGoal; rig.dist = s.dist;
    rig.target.copy(s.target); rig.goal.copy(s.goal);
    this._hideForeground(false);
    // remove our actors
    for (const w of this.words) { this.group.remove(w.sprite); w.sprite.material.dispose(); }
    this.words.length = 0;
    this._endBear();
    this.school?.batch.dispose();
    for (const c of this.chicks || []) c.c.dispose();
    this.fox.dispose();
    for (const d of [this.deer, ...this.ducks]) d.dispose?.();
    game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o === this.skyMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
    this.fishMesh?.material?.map?.dispose?.();
    this.group = null;
  }

  // Trees between the camera and the diorama would block the view at this low
  // pitch: hide them (temporarily flagged as removed) while the title is up.
  // stop() un-flags exactly those again, so call it before game.load().
  _hideForeground(on) {
    const world = this.game.world;
    if (on) {
      const R = this.right, F = this.fwd, s = this.seatPos;
      this._hidden = [];
      for (const d of world.decos) {
        if (d.removed) continue;
        const dx = d.x + 0.5 - s.x, dz = d.z + 0.5 - s.z;
        const f = dx * F.x + dz * F.z, r = dx * R.x + dz * R.z;
        if (f < -0.8 && f > -26 && r > -9 - f * 0.25 && r < 7 - f * 0.25) { d.removed = true; this._hidden.push(d); }
      }
    } else {
      for (const d of this._hidden || []) d.removed = false;
      this._hidden = null;
    }
    try { world.buildDecos(); } catch { /* keep going */ }
  }

  // ============================================================ sky + lighting
  _patchSky() {
    const game = this.game, sky = game.sky;
    const orig = this._saved.skyOwn || Object.getPrototypeOf(sky).update;
    const dir = new THREE.Vector3();
    const col = new THREE.Color();
    sky.update = (hour, time, focus, yaw) => {
      orig.call(sky, hour, time, focus, yaw);
      // sun from the left of the view, a touch behind the scene, low and golden
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const rx = cy, rz = -sy; // screen-right on the ground
      const fx = -sy, fz = -cy; // view forward on the ground
      const h = Math.cos(SUN_EL);
      dir.set((-rx * 0.86 + fx * 0.2 - fx * 0.32) * h, Math.sin(SUN_EL), (-rz * 0.86 + fz * 0.2 - fz * 0.32) * h).normalize();
      sky.state.sunDir.copy(dir);
      const p = sky.sun.target.position;
      sky.sun.position.set(p.x + dir.x * 90, p.y + dir.y * 90, p.z + dir.z * 90);
      sky.sun.color.setHex(0xffc488);
      sky.sun.intensity = 2.9;
      sky.hemi.color.setHex(0xd8a8c8);
      sky.hemi.groundColor.setHex(0x7a5a40);
      sky.hemi.intensity = 1.25;
      sky.state.skyTint.setHex(0xffc49a);
      sky.state.waterShallow.lerp(col.setHex(0x58a0a0), 0.6);
      sky.state.waterDeep.lerp(col.setHex(0x4a5a98), 0.6);
      sky.state.night = 0;
    };
  }

  _buildSky() {
    this.skyUniforms = { uTime: { value: 0 }, uSun: { value: new THREE.Vector2(-5.2, 3.6) }, uPx: { value: 0.03 }, uTop: { value: 3 } };
    const geo = new THREE.PlaneGeometry(90, 40, 1, 1);
    geo.translate(0, 40 / 2 - 3, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.skyUniforms });
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -10;
    this.group.add(this.skyMesh);
  }

  // ============================================================ actors
  _buildActors() {
    const g = this.group;
    const cy = Math.cos(YAW), sy = Math.sin(YAW);
    this.right = new THREE.Vector3(cy, 0, -sy);
    this.fwd = new THREE.Vector3(-sy, 0, -cy);
    const R = this.right, F = this.fwd;
    const at = (base, r, f) => new THREE.Vector3(base.x + R.x * r + F.x * f, 0, base.z + R.z * r + F.z * f);
    const seat = new THREE.Vector3(SEAT.x, 0, SEAT.z);
    this.seatPos = seat;

    // chairs on a tilt pivot at the back legs (so they can rock / tip over)
    const mkChair = (color, pos, rot) => {
      const base = new THREE.Group();
      base.position.set(pos.x, CHAIR_Y, pos.z);
      base.rotation.y = rot;
      base.scale.setScalar(SCALE);
      const tilt = new THREE.Group();
      tilt.position.z = -0.2;
      const content = new THREE.Group();
      content.position.z = 0.2;
      tilt.add(content);
      base.add(tilt);
      const chair = makeLawnChair(color);
      content.add(chair);
      // leg extensions down to the pond floor (the chair stands on the bottom)
      const legMat = new THREE.MeshLambertMaterial({ color: 0x9aa0ae });
      for (const [x, z] of [[-0.275, 0.225], [0.25, 0.225], [-0.275, -0.2], [0.25, -0.2]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.6, 0.025), legMat);
        leg.position.set(x, -0.3, z);
        content.add(leg);
      }
      g.add(base);
      return { base, tilt, content, chair, rx: 0, vx: 0, rot };
    };
    const faceRot = YAW; // +Z facing the camera
    this.foxChair = mkChair('green', seat, faceRot + FOX_ROT);
    const deerPos = at(seat, 1.38, 0.12);
    this.deerChair = mkChair('yellow', deerPos, faceRot + DEER_ROT);

    // Reynard
    const fox = (this.fox = new FoxRig({ shadows: true }));
    fox.root.scale.setScalar(SCALE);
    g.add(fox.root);
    // Daisy Beer instead of the green energy can, in his paw at all times
    const daisy = makeDaisyBeerCan();
    daisy.position.set(-0.012, 0.1, -0.012);
    fox.props.can.material = new THREE.MeshBasicMaterial({ visible: false });
    fox.props.can.add(daisy);
    this.foxCan = makeDaisyBeerCan();
    this.foxCan.position.set(-0.012, 0.03, -0.002);
    fox.hold(this.foxCan);
    fox.play('sit', { fade: 0 });
    fox.onEvent = (name) => this._foxEvent(name);
    this.foxSt = { mode: 'seated', x: seat.x, z: seat.z, y: 0, rot: faceRot + FOX_ROT, t: 0 };
    this._placeFoxSeated();

    // the deer buddy, seated
    const deer = (this.deer = new DeerGuy({ shadows: true }));
    this.deerChair.content.add(deer.root);
    deer.play('sit_chair', { fade: 0 });
    deer.seated = true;
    deer.onEvent = (name) => this._deerEvent(name);

    // the cooler floats between them, bobbing
    this.cooler = makeCooler();
    this.cooler.scale.setScalar(SCALE);
    const cp = at(seat, 0.7, 0.35);
    this.cooler.position.set(cp.x, WATER_Y - 0.12, cp.z);
    this.cooler.rotation.y = faceRot + 0.25;
    this.coolerBase = cp;
    g.add(this.cooler);
    // a spare can bobbing near the cooler
    this.floatCan = makeDaisyBeerCan();
    this.floatCan.scale.setScalar(SCALE);
    const fc = at(seat, 0.95, -0.45);
    this.floatCan.position.set(fc.x, WATER_Y, fc.z);
    this.floatCan.rotation.set(Math.PI / 2, 0, 0.6);
    this.floatCanBase = fc;
    g.add(this.floatCan);

    // ducks: a drake and two hens paddling about
    this.ducks = [];
    const homes = [at(seat, -2.2, -2.3), at(seat, -1.4, -3.0), at(seat, -3.0, -1.8)];
    ['m', 'f', 'f'].forEach((sex, i) => {
      const d = new Duck({ sex });
      d.root.scale.setScalar(SCALE * (i === 0 ? 1.45 : 1.32)); // a bit chunkier than life so they read
      g.add(d.root);
      d.play('swim', { fade: 0 });
      const h = homes[i];
      const st = { d, x: h.x, z: h.z, y: WATER_Y, heading: Math.random() * TAU, home: h, tx: h.x, tz: h.z, mode: 'paddle', t: Math.random() * 3, spd: 0, vy: 0, i };
      d.onEvent = (name) => this._duckEvent(st, name);
      this.ducks.push(st);
    });

    // dragonfly + leaping fish
    this.dfly = makeDragonfly();
    this.dfly.visible = false;
    this.dfly.scale.setScalar(1.15);
    g.add(this.dfly);
    this.dflySt = null;
    try {
      const cv = fishCanvasFor('sockeye', { scale: 1 });
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.fishMesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
      this.fishMesh.userData.w = (cv.width / FISH_TPU) * 1.1;
      this.fishMesh.userData.h = (cv.height / FISH_TPU) * 1.1;
      this.fishMesh.visible = false;
      this.fishMesh.renderOrder = 12;
      g.add(this.fishMesh);
    } catch { this.fishMesh = null; }
    this.fishSt = null;
    this.words = [];
    this._buildSchool();
    this.chicks = [];
  }

  _placeFoxSeated() {
    const c = this.foxChair;
    c.base.updateMatrixWorld(true);
    const p = new THREE.Vector3(0, LAWN_CHAIR_SEAT - FOX_SEAT_SURFACE, 0.02);
    c.content.localToWorld(p);
    this.fox.root.position.copy(p);
    this.fox.root.rotation.set(c.tilt.rotation.x, c.rot, 0, 'YXZ');
    const st = this.foxSt;
    st.x = p.x; st.z = p.z; st.y = p.y; st.rot = c.rot;
  }

  // ============================================================ timeline
  _initBeats() {
    this.gag = null;
    this.gagT = new URLSearchParams(location.search).has('gag') ? 1.5 : rand(5.5, 7); // first gag (the bear!) comes soon
    this.gagN = 0; this.bearN = 0; this.deckI = 0;
    this.punch = 0; this.punchHold = 0;
    this.beatT = 3.5;
    this.lastBeat = '';
    this.glintT = 0;
    this.moteT = 0;
    this.flyT = 6;
    this.legT = 0;
    this.sipQueued = false;
  }

  update(dt) {
    if (!this.active) return;
    dt = clamp(dt || 0, 0, 0.1);
    let left = dt;
    while (left > 1e-6) {
      const s = Math.min(left, 1 / 30);
      this._step(s);
      left -= s;
    }
    const game = this.game;
    game.fox.rig.root.visible = false;
    game.state.phase = 'day';
    game.world.sim.update(dt * 0.5, game.wind);
    this._updateCamera(dt);
  }

  _step(dt) {
    this.T += dt;
    const T = this.T;
    const game = this.game;
    game.state.hour = 18.25 + Math.sin(T * 0.04) * 0.06;
    this.skyUniforms.uTime.value = T;
    this.skyUniforms.uPx.value = game.rig.wupp;

    // --- gag scheduler + idle beats
    if (this.gag) this._runGag(dt);
    else {
      this.gagT -= dt;
      if (this.gagT <= 0) this._startGag();
      else {
        this.beatT -= dt;
        if (this.beatT <= 0 && this.foxSt.mode === 'seated') this._idleBeat();
      }
    }

    this._updateFox(dt);
    this._updateDeer(dt);
    this._updateDucks(dt);
    this._updateProps(dt);
    this._updateDragonfly(dt);
    this._updateFish(dt);
    this._updateSchool(dt);
    this._updateChicks(dt);
    this._updateCan(dt);
    this.punch += (this.punchHold - this.punch) * (1 - Math.exp(-dt * (this.punch > this.punchHold ? 1.4 : 3)));
    this._updateWords(dt);
    this._ambientFx(dt);
  }

  // ------------------------------------------------------------ idle beats
  _idleBeat() {
    const opts = ['cheers', 'sigh', 'sip', 'fish', 'fireflies', 'deer_drink', 'scheme', 'dragonfly'].filter((b) => b !== this.lastBeat);
    if (this.dflySt) opts.splice(opts.indexOf('dragonfly'), 1);
    const b = opts[Math.floor(Math.random() * opts.length)];
    this.lastBeat = b;
    this.beatT = rand(3.5, 6);
    const fox = this.fox, deer = this.deer, P = this.game.particles;
    if (b === 'cheers') {
      deer.play('cheers', { fade: 0.25 });
      this._later(0.15, () => fox.play('sit_sip', { fade: 0.25 }));
    } else if (b === 'sip') fox.play('sit_sip', { fade: 0.25 });
    else if (b === 'sigh') {
      fox.setExpression('happy', { hold: 2.2 });
      const h = fox.headTop();
      this._word('ahh~', 'ahh', h.x, h.y + 0.05, h.z, { size: 1, life: 1.8 });
      P.hearts(h.x, h.y, h.z, 1);
      this._sfx('heart', { volume: 0.15, pitch: 0.8 });
    } else if (b === 'deer_drink') deer.play('drink', { fade: 0.25 });
    else if (b === 'scheme') { fox.play('sit_scheme', { fade: 0.3 }); this._later(3.2, () => { if (fox.current === 'sit_scheme') fox.play('sit', { fade: 0.3 }); }); }
    else if (b === 'fish') this._leapFish();
    else if (b === 'fireflies') { for (let i = 0; i < 8; i++) this._firefly(); }
    else if (b === 'dragonfly') this._startDragonfly();
  }

  _later(t, fn) { (this._timers ||= []).push({ t, fn }); }

  // ------------------------------------------------------------ the gag
  _startGag() {
    // alternate: the bear jumpscare (first), then the duck peck gag
    if (this.gagN++ % 2 === 0 && this.ducks.every((d) => d.mode !== 'gone' && d.mode !== 'away' && d.mode !== 'land')) return this._startBearGag();
    const fox = this.fox;
    this.gag = { phase: 'approach', t: 0 };
    // ducks gather at Reynard's tail
    this.ducks.forEach((st, i) => {
      st.mode = 'approach';
      st.slot = i;
    });
    if (fox.current !== 'sit') fox.play('sit', { fade: 0.3 });
  }

  _tailTip(out = new THREE.Vector3()) {
    const t = this.fox.tail[2];
    t.updateWorldMatrix(true, false);
    return out.set(0, 0, -0.2).applyMatrix4(t.matrixWorld);
  }

  _runGag(dt) {
    if (this.gag.kind === 'bear') return this._runBearGag(dt);
    const G = this.gag, fox = this.fox, deer = this.deer, P = this.game.particles;
    G.t += dt;
    const R = this.right, F = this.fwd;
    if (G.phase === 'approach') {
      // deer notices first and smirks
      if (G.t > 2.2 && !G.smirk) { G.smirk = true; deer.setExpression?.('happy', { hold: 2 }); }
      const arrived = this.ducks.every((d) => d.mode === 'peck');
      if (arrived || G.t > 9) { G.phase = 'peck'; G.t = 0; }
    } else if (G.phase === 'peck') {
      if (G.t > 0.9 && !G.yelp) {
        G.yelp = true;
        // CHOMP: Reynard jumps out of his skin
        fox.setExpression('shocked', { hold: 1.2 });
        fox.play('panic', { fade: 0.08 });
        fox.dropMonocle?.();
        const h = fox.headTop();
        this._word('YELP!', 'yelp', h.x, h.y + 0.15, h.z, { size: 1.2, life: 1.1 });
        P.sprite('bang', h.x + R.x * 0.25, h.y, h.z + R.z * 0.25, { vy: 1, life: 0.9, size: 0.35 });
        this._sfx('fox_startle', { volume: 0.4 });
        const st = this.foxSt;
        const tip = this._tailTip();
        st.mode = 'leap'; st.t = 0;
        st.from = new THREE.Vector3(st.x, st.y, st.z);
        const C = this._chaseCenter();
        st.to = new THREE.Vector3(lerp(st.x, C.x, 0.55) - F.x * 0.2, -0.2, lerp(st.z, C.z, 0.55) - F.z * 0.2);
        this.foxChair.vx -= 4.5; // the chair rocks
        for (const d of this.ducks) { d.mode = 'scatter'; d.t = 0; d.d.play('chase_flee', { fade: 0.1 }); }
        this._word('QUACK!', 'quack', tip.x - R.x * 0.3, 0.5, tip.z - R.z * 0.3, { size: 1, life: 1 });
        this._sfx('honk', { volume: 0.3, pitch: 1.7 });
        G.phase = 'panic'; G.t = 0;
      }
    } else if (G.phase === 'panic') {
      if (G.t > 1.25) {
        G.phase = 'chase'; G.t = 0;
        fox.setExpression('angry', { hold: 6 });
        fox.play('run', { fade: 0.15 });
        this.foxSt.mode = 'chase';
        this.foxSt.ang = this._chaseAngleOf(this.foxSt.x, this.foxSt.z);
        this.ducks.forEach((d, i) => { d.mode = 'flee'; d.ang = this.foxSt.ang + 0.9 + i * 0.32; d.d.play('chase_flee', { fade: 0.15 }); });
        deer.play('point_laugh', { fade: 0.2 });
        this._later(1.4, () => deer.play('laugh', { fade: 0.25 }));
      }
    } else if (G.phase === 'chase') {
      // the deer nearly tips over backwards laughing
      if (G.t > 2.2 && !G.tip) { G.tip = true; this.deerChair.vx -= 3.4; this._word('HAW HAW!', 'haw', ...this._headOf(deer), { size: 1, life: 1.6 }); this._sfx('honk', { volume: 0.2, pitch: 0.8 }); }
      if (G.t > 3.4 && !G.tip2) { G.tip2 = true; this.deerChair.vx -= 3.0; }
      if (G.t > 4.6) {
        G.phase = 'shake'; G.t = 0;
        this.foxSt.mode = 'stand';
        fox.play('angry_stomp', { fade: 0.15 });
        this._word('GRR!', 'grr', ...this._headOf(fox, 0.1), { size: 1.1, life: 1.2 });
        // the ducks take off, quacking
        this.ducks.forEach((d, i) => { d.mode = 'fly'; d.t = -i * 0.18; d.vy = 0; d.d.play('flap', { fade: 0.1 }); });
        this._later(0.35, () => { const d = this.ducks[0]; this._word('QUACK!', 'quack', d.x, d.y + 0.5, d.z, { size: 0.9, life: 0.9 }); this._sfx('honk', { volume: 0.28, pitch: 1.8 }); });
        this._later(0.8, () => { const d = this.ducks[1]; this._word('QUACK!', 'quack', d.x, d.y + 0.5, d.z, { size: 0.8, life: 0.9 }); this._sfx('honk', { volume: 0.22, pitch: 2.0 }); });
      }
    } else if (G.phase === 'shake') {
      if (G.t > 0.3 && G.t < 1.6 && Math.random() < dt * 5) { const h = this._headOf(fox, 0.02); P.sprite('anger', h[0] + rand(-0.15, 0.15), h[1], h[2], { vy: 0.5, life: 0.7, size: 0.22 }); }
      if (G.t > 1.85) {
        G.phase = 'return'; G.t = 0;
        fox.play('walk', { fade: 0.2 });
        fox.setExpression('tsk', { hold: 4 });
        this.foxSt.mode = 'walkback';
        fox.restoreMonocle?.();
      }
    } else if (G.phase === 'return') {
      if (this.foxSt.mode === 'seated') {
        G.phase = 'settle'; G.t = 0;
        fox.play('sit', { fade: 0.2 });
        fox.setExpression('tsk', { hold: 1.6 });
        this.foxChair.vx += 2.5;
        P.splash(this.foxSt.x, this.foxSt.z, 6, 0.5);
      }
    } else if (G.phase === 'settle') {
      if (G.t > 1.2 && !G.calm) { G.calm = true; deer.play('sit_chair', { fade: 0.4 }); }
      if (G.t > 1.8 && !G.sip) { G.sip = true; fox.play('sit_sip', { fade: 0.3 }); }
      if (G.t > 5.6) {
        this.gag = null;
        this.gagT = rand(15, 22);
        this.beatT = rand(2.5, 4);
        fox.restoreMonocle?.();
        // the ducks come back later: they land far out with a splash
        this.ducks.forEach((d, i) => { d.mode = 'away'; d.t = 3 + i * 1.3; });
      }
    }
  }

  _headOf(rig, dy = 0) {
    if (rig.headTop) { const h = rig.headTop(); return [h.x, h.y + 0.12 + dy, h.z]; }
    const p = new THREE.Vector3();
    (rig.head || rig.root).getWorldPosition(p);
    return [p.x, p.y + 0.45 + dy, p.z];
  }

  _chaseCenter() {
    const s = this.seatPos, R = this.right, F = this.fwd;
    return new THREE.Vector3(s.x + R.x * 0.45 - F.x * 2.35, 0, s.z + R.z * 0.45 - F.z * 2.35);
  }
  _chasePoint(a, out = new THREE.Vector3()) {
    const C = this._chaseCenter(), R = this.right, F = this.fwd;
    const ca = Math.cos(a) * 1.7, sa = Math.sin(a) * 0.65;
    return out.set(C.x + R.x * ca + F.x * sa, 0, C.z + R.z * ca + F.z * sa);
  }
  _chaseAngleOf(x, z) {
    const C = this._chaseCenter(), R = this.right, F = this.fwd;
    const dx = x - C.x, dz = z - C.z;
    return Math.atan2((dx * F.x + dz * F.z) / 0.65, (dx * R.x + dz * R.z) / 1.7);
  }

  // ------------------------------------------------------------ fox
  _updateFox(dt) {
    const fox = this.fox, st = this.foxSt, P = this.game.particles;
    st.t += dt;
    if (st.mode === 'seated') {
      this._placeFoxSeated();
    } else if (st.mode === 'leap') {
      const u = clamp(st.t / 0.55, 0, 1);
      const p = new THREE.Vector3().lerpVectors(st.from, st.to, u);
      p.y += Math.sin(u * Math.PI) * 0.75;
      fox.root.position.copy(p);
      st.x = p.x; st.z = p.z; st.y = p.y;
      if (u >= 1 && !st.landed) {
        st.landed = true;
        P.splash(p.x, p.z, 16, 0.9);
        this._word('SPLASH!', 'splash', p.x, 0.55, p.z, { size: 0.9, life: 0.9 });
        this._sfx('splash', { volume: 0.4 });
      }
      if (u >= 1) { st.mode = 'stand'; st.landed = false; }
    } else if (st.mode === 'stand') {
      fox.root.position.y = lerp(fox.root.position.y, -0.2, 1 - Math.exp(-dt * 8));
      if (Math.random() < dt * 3) this.game.world.sim.disturb(st.x + rand(-0.15, 0.15), st.z + rand(-0.15, 0.15), 0.18, 0.05);
      const d = this.ducks[0];
      if (d && this.gag?.phase === 'panic') st.rot = angLerp(st.rot, Math.atan2(d.x - st.x, d.z - st.z), 1 - Math.exp(-dt * 6));
    } else if (st.mode === 'chase') {
      st.ang += dt * 1.55;
      const p = this._chasePoint(st.ang);
      const dx = p.x - st.x, dz = p.z - st.z;
      if (dx * dx + dz * dz > 1e-6) st.rot = angLerp(st.rot, Math.atan2(dx, dz), 1 - Math.exp(-dt * 10));
      st.x = p.x; st.z = p.z;
      fox.root.position.set(st.x, -0.2, st.z);
      this.game.world.sim.wake(st.x, st.z, 2.4, 0.3, dt);
    } else if (st.mode === 'walkback') {
      // wade back to the front of the chair, then hop in
      const c = this.foxChair;
      const front = new THREE.Vector3(0, 0, 0.55);
      c.content.localToWorld(front);
      const dx = front.x - st.x, dz = front.z - st.z, d = Math.hypot(dx, dz);
      if (!st.hop) {
        if (d > 0.06) {
          const sp = Math.min(d, dt * 1.05);
          st.x += (dx / d) * sp; st.z += (dz / d) * sp;
          st.rot = angLerp(st.rot, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8));
          fox.root.position.set(st.x, -0.2, st.z);
          this.game.world.sim.wake(st.x, st.z, 1.2, 0.25, dt);
        } else {
          st.hop = { t: 0, from: new THREE.Vector3(st.x, -0.2, st.z), r0: st.rot };
          fox.play('sit', { fade: 0.25 });
        }
      } else {
        const h = st.hop;
        h.t += dt;
        const u = clamp(h.t / 0.5, 0, 1);
        c.base.updateMatrixWorld(true);
        const to = new THREE.Vector3(0, LAWN_CHAIR_SEAT - FOX_SEAT_SURFACE, 0.02);
        c.content.localToWorld(to);
        const p = new THREE.Vector3().lerpVectors(h.from, to, smooth(u));
        p.y += Math.sin(u * Math.PI) * 0.35;
        st.rot = angLerp(h.r0 + Math.PI, c.rot, smooth(u * 1.4));
        fox.root.position.copy(p);
        st.x = p.x; st.z = p.z;
        if (u >= 1) { st.hop = null; st.mode = 'seated'; }
      }
    }
    else if (st.mode === 'hide') {
      // leapt out of the chair and cowering behind it on the bank
      const h = st.hide, u = clamp(st.t / 0.55, 0, 1);
      const p = new THREE.Vector3().lerpVectors(h.from, h.to, smooth(u));
      p.y += Math.sin(u * Math.PI) * 0.7;
      fox.root.position.copy(p);
      st.x = p.x; st.z = p.z; st.y = p.y;
      const B = this.gag?.bear;
      if (B) st.rot = angLerp(st.rot, Math.atan2(B.root.position.x - st.x, B.root.position.z - st.z), 1 - Math.exp(-dt * 6));
      if (u >= 1 && !h.landed) { h.landed = true; P.dust(p.x, p.y, p.z, 5); }
    }
    // shaking like a leaf
    if (this.fright > 0 && st.mode !== 'hide') { fox.root.position.x += Math.sin(this.T * 61) * 0.012 * this.fright; fox.root.position.z += Math.cos(this.T * 53) * 0.01 * this.fright; }
    if (st.mode !== 'seated') fox.root.rotation.set(0, st.rot, 0);
    // eyes follow the action
    const G = this.gag;
    if (G?.kind === 'bear' && G.bear) {
      this._look ||= new THREE.Vector3();
      G.bear.headTop(this._look);
      fox.lookAt(this._look);
    } else if (G && (G.phase === 'approach' || G.phase === 'peck' || G.phase === 'panic' || G.phase === 'chase')) {
      const d = this.ducks[0];
      this._look ||= new THREE.Vector3();
      this._look.set(d.x, d.y + 0.2, d.z);
      fox.lookAt(G.phase === 'approach' ? null : this._look);
    } else fox.lookAt(null);
    fox.update(dt);
  }

  _foxEvent(name) {
    const st = this.foxSt, P = this.game.particles;
    if (name === 'step' && st.mode !== 'seated') {
      const R = this.right;
      const side = (this._stepSide = -(this._stepSide || 1));
      const x = st.x + R.x * 0.08 * side, z = st.z + R.z * 0.08 * side;
      P.splash(x, z, 4, 0.45);
      if (Math.random() < 0.5) this._sfx('splash', { volume: 0.12, pitch: rand(1.1, 1.5) });
    } else if (name === 'stomp') {
      P.splash(st.x, st.z, 9, 0.7);
      this._sfx('splash', { volume: 0.22, pitch: 0.9 });
    } else if (name === 'zing') {
      const h = this.fox.headTop();
      P.sparkle(h.x, h.y - 0.1, h.z, 6, 0xffe680);
    } else if (name === 'gulp' && Math.random() < 0.5) this._sfx('bubble', { volume: 0.08, pitch: 0.7 });
  }

  // ------------------------------------------------------------ deer
  _updateDeer(dt) {
    // chair tilt springs (fox chair rocks when he leaps out / in, deer chair tips back laughing)
    for (const c of [this.foxChair, this.deerChair]) {
      const k = 38, damp = 3.6;
      c.vx += (-k * c.rx - damp * c.vx) * dt;
      c.rx += c.vx * dt;
      c.rx = clamp(c.rx, -0.62, 0.22);
      c.tilt.rotation.x = c.rx;
    }
    this.deer.update(dt);
  }

  _deerEvent(name) {
    const P = this.game.particles;
    if (name === 'clink') {
      // the cans clink between the two chairs
      const a = this._headOf(this.fox), b = this._headOf(this.deer);
      const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2 - 0.35, z = (a[2] + b[2]) / 2;
      P.sparkle(x, y, z, 7, 0xfff2a0);
      this._word('CLINK!', 'clink', x, y + 0.3, z, { size: 0.85, life: 1 });
      this._sfx('coin', { volume: 0.2, pitch: 1.6 });
    } else if (name === 'slap') {
      if (Math.random() < 0.4) this._sfx('pet', { volume: 0.12, pitch: 1.3 });
    } else if (name === 'ahh') {
      const h = this._headOf(this.deer);
      P.hearts(h[0], h[1], h[2], 1);
    }
  }

  // ------------------------------------------------------------ ducks
  _updateDucks(dt) {
    const R = this.right, F = this.fwd, P = this.game.particles, sim = this.game.world.sim;
    const tip = this._tailTip(this._tipV || (this._tipV = new THREE.Vector3()));
    for (const st of this.ducks) {
      const d = st.d;
      st.t += dt;
      if (st.mode === 'held') { d.update(dt); continue; } // in a bear's paws (preyFx moves it)
      if (st.mode === 'eaten') continue;
      if (st.mode === 'frozen') {
        // frozen in terror: flapping on the spot, bobbing
        st.y = WATER_Y - 0.03 + Math.abs(Math.sin(st.t * 9)) * 0.06;
        const B = this.gag?.bear;
        if (B) st.heading = angLerp(st.heading, Math.atan2(B.root.position.x - st.x, B.root.position.z - st.z) + Math.PI, 1 - Math.exp(-dt * 4));
        if (Math.random() < dt * 3) P.splash(st.x, st.z, 2, 0.3);
        this._placeDuck(st);
        continue;
      }
      if (st.mode === 'yank') {
        // snatched across the water into the bear's paws
        const y = st.yank, u = clamp((st.t - y.t0) / y.dur, 0, 1);
        this.gag.bear.holdAnchor.getWorldPosition(this._tmpY || (this._tmpY = new THREE.Vector3()));
        st.x = lerp(y.x, this._tmpY.x, smooth(u)); st.z = lerp(y.z, this._tmpY.z, smooth(u));
        st.y = lerp(WATER_Y, this._tmpY.y - 0.2, smooth(u)) + Math.sin(u * Math.PI) * 0.35;
        if (Math.random() < dt * 20 && u < 0.6) P.splash(st.x, st.z, 2, 0.4);
        this._placeDuck(st);
        continue;
      }
      if (st.mode === 'arrive') {
        // a new family paddles in from the right, the hen leading the ducklings
        st.tx = st.home.x; st.tz = st.home.z;
        if (Math.hypot(st.home.x - st.x, st.home.z - st.z) < 0.12) { st.mode = 'paddle'; st.t = 0; }
      }
      let tx = st.tx, tz = st.tz, spd = st.mode === 'arrive' ? 0.6 : 0.35;
      if (st.mode === 'paddle') {
        if (st.t > 4 || Math.hypot(st.tx - st.x, st.tz - st.z) < 0.15) {
          st.t = 0;
          const a = Math.random() * TAU, r = rand(0.2, 1.0);
          st.tx = st.home.x + Math.cos(a) * r; st.tz = st.home.z + Math.sin(a) * r;
        }
        tx = st.tx; tz = st.tz; spd = 0.22;
      } else if (st.mode === 'approach') {
        // sneak up from the water side of the chair, a little fan of beaks
        const off = [[-0.32, -0.12], [-0.22, -0.4], [-0.52, -0.32]][st.slot] || [0, 0];
        tx = tip.x + R.x * off[0] + F.x * off[1]; tz = tip.z + R.z * off[0] + F.z * off[1];
        spd = 0.85;
        if (Math.hypot(tx - st.x, tz - st.z) < 0.08) { st.mode = 'peck'; d.play('peck', { fade: 0.15 }); }
      } else if (st.mode === 'peck') {
        tx = st.x; tz = st.z; spd = 0;
        st.heading = angLerp(st.heading, Math.atan2(tip.x - st.x, tip.z - st.z), 1 - Math.exp(-dt * 8));
      } else if (st.mode === 'scatter') {
        // burst away from Reynard
        const fx = this.foxSt.x, fz = this.foxSt.z;
        const dx = st.x - fx, dz = st.z - fz, l = Math.hypot(dx, dz) || 1;
        tx = st.x + (dx / l) * 2 - F.x * 0.8; tz = st.z + (dz / l) * 2 - F.z * 0.8;
        spd = 1.1;
      } else if (st.mode === 'flee') {
        st.ang = (st.ang ?? 0) + dt * 1.62;
        const p = this._chasePoint(st.ang + (st.i === 1 ? 0.15 : 0), this._tmpV || (this._tmpV = new THREE.Vector3()));
        const dx = p.x - st.x, dz = p.z - st.z;
        if (dx * dx + dz * dz > 1e-6) st.heading = angLerp(st.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 12));
        st.x = p.x; st.z = p.z;
        sim.wake(st.x, st.z, 2, 0.2, dt);
        if (Math.random() < dt * 4) P.splash(st.x, st.z, 2, 0.3);
        if (Math.random() < dt * 0.8) P.feathers(st.x, st.y + 0.25, st.z, 1);
        st.y = WATER_Y - 0.03;
        this._placeDuck(st);
        continue;
      } else if (st.mode === 'fly') {
        if (st.t < 0) { this._placeDuck(st); continue; }
        // up, up and away towards the sunset
        st.vy = Math.min(st.vy + dt * 2.2, 1.4);
        st.y += st.vy * dt;
        const ax = -R.x * 0.9 + F.x * 0.55, az = -R.z * 0.9 + F.z * 0.55;
        st.x += ax * dt * 2.2; st.z += az * dt * 2.2;
        st.heading = angLerp(st.heading, Math.atan2(ax, az), 1 - Math.exp(-dt * 5));
        if (st.t < 0.4 && Math.random() < dt * 10) P.splash(st.x, st.z, 2, 0.35);
        if (st.y > 4.5) { st.mode = 'gone'; d.root.visible = false; }
        this._placeDuck(st);
        continue;
      } else if (st.mode === 'gone') continue;
      else if (st.mode === 'away') {
        if (st.t > 0) {
          // swoop back in from the sunny side and splash down
          st.t = 0;
          st.mode = 'land';
          st.from = new THREE.Vector3(st.home.x - R.x * 4 + F.x * 2, 3.2, st.home.z - R.z * 4 + F.z * 2);
          st.x = st.from.x; st.z = st.from.z; st.y = st.from.y;
          d.root.visible = true;
          d.play('flap', { fade: 0 });
        } else { st.t += 0; continue; }
      }
      if (st.mode === 'land') {
        const u = clamp(st.t / 2.2, 0, 1);
        st.x = lerp(st.from.x, st.home.x, u); st.z = lerp(st.from.z, st.home.z, u);
        st.y = lerp(st.from.y, WATER_Y, smooth(u * 1.05));
        st.heading = angLerp(st.heading, Math.atan2(st.home.x - st.from.x, st.home.z - st.from.z), 0.2);
        if (u >= 1) {
          st.mode = 'paddle'; st.t = 0; st.tx = st.x; st.tz = st.z;
          P.splash(st.x, st.z, 8, 0.6);
          d.play('swim', { fade: 0.2 });
          this._sfx('splash', { volume: 0.15, pitch: 1.4 });
        }
        this._placeDuck(st);
        continue;
      }
      // steer
      const dx = tx - st.x, dz = tz - st.z, dist = Math.hypot(dx, dz);
      if (dist > 0.02 && spd > 0) {
        const want = Math.atan2(dx, dz);
        st.heading = angLerp(st.heading, want, 1 - Math.exp(-dt * 3));
        const v = Math.min(dist, spd * dt) * Math.max(0.2, Math.cos(want - st.heading));
        st.x += Math.sin(st.heading) * v; st.z += Math.cos(st.heading) * v;
        if (st.mode !== 'paddle' || Math.random() < 0.3) sim.wake(st.x, st.z, spd * 2, 0.18, dt);
      }
      st.y = st.mode === 'peck' ? WATER_Y - 0.08 : st.mode === 'scatter' ? WATER_Y - 0.03 : WATER_Y + sim.heightAt(st.x, st.z) * 0.5;
      this._placeDuck(st);
    }
  }

  _placeDuck(st) {
    const d = st.d;
    d.root.position.set(st.x, st.y, st.z);
    d.root.rotation.y = st.heading;
    d.update(this._dt || 1 / 30);
  }

  _duckEvent(st, name) {
    const P = this.game.particles;
    if (name === 'peck') {
      if (Math.random() < 0.5) this._sfx('nibble', { volume: 0.18, pitch: 1.3 });
      const tip = this._tailTip();
      if (Math.random() < 0.4) P.sprite('sweat', tip.x, tip.y + 0.1, tip.z, { vy: 0.4, life: 0.5, size: 0.12 });
    } else if (name === 'paddle' && Math.random() < 0.3) this.game.world.sim.disturb(st.x, st.z, 0.15, 0.03);
  }

  // ------------------------------------------------------------ props: cooler, can, chair-leg ripples
  _updateProps(dt) {
    const T = this.T, sim = this.game.world.sim;
    const c = this.cooler, cb = this.coolerBase;
    c.position.set(cb.x + Math.sin(T * 0.4) * 0.03, WATER_Y - 0.13 + Math.sin(T * 1.7) * 0.015 + sim.heightAt(cb.x, cb.z) * 0.6, cb.z + Math.cos(T * 0.33) * 0.03);
    c.rotation.z = Math.sin(T * 1.3) * 0.04;
    c.rotation.x = Math.sin(T * 1.1 + 1) * 0.03;
    const f = this.floatCan, fb = this.floatCanBase;
    f.position.set(fb.x + Math.sin(T * 0.25) * 0.12, WATER_Y + 0.01 + Math.sin(T * 2.1) * 0.012 + sim.heightAt(fb.x, fb.z) * 0.6, fb.z + Math.cos(T * 0.2) * 0.1);
    f.rotation.y = T * 0.15;
    // lazy ripples around the chair legs
    this.legT -= dt;
    if (this.legT <= 0) {
      this.legT = rand(0.7, 1.3);
      for (const ch of [this.foxChair, this.deerChair]) {
        const p = new THREE.Vector3(rand(-0.3, 0.3), 0, Math.random() < 0.5 ? 0.22 : -0.2);
        ch.content.localToWorld(p);
        sim.disturb(p.x, p.z, 0.12, 0.035);
      }
      sim.disturb(cb.x, cb.z, 0.22, 0.03);
    }
    // timers
    if (this._timers) {
      for (let i = this._timers.length - 1; i >= 0; i--) {
        const tm = this._timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { this._timers.splice(i, 1); tm.fn(); }
      }
    }
  }

  // ------------------------------------------------------------ dragonfly: lands on the top hat
  _startDragonfly() {
    const R = this.right, F = this.fwd, s = this.seatPos;
    this.dflySt = { t: 0, phase: 'in', from: new THREE.Vector3(s.x - R.x * 3.5 - F.x * 1, 1.6, s.z - R.z * 3.5 - F.z * 1), p: new THREE.Vector3() };
    this.dfly.visible = true;
    this.dfly.position.copy(this.dflySt.from);
  }

  _updateDragonfly(dt) {
    const st = this.dflySt, df = this.dfly;
    if (!st) return;
    st.t += dt;
    const T = this.T;
    const hat = this.fox.headTop();
    const flap = st.phase === 'sit' ? Math.sin(T * 3) * 0.15 : Math.sin(T * 70) * 0.7;
    for (const w of df.wings) w.rotation.z = w.side * flap;
    if (this.foxSt.mode !== 'seated' && st.phase === 'sit') { st.phase = 'out'; st.t = 0; st.from = df.position.clone(); }
    if (st.phase === 'in') {
      const u = clamp(st.t / 3, 0, 1);
      const e = smooth(u);
      df.position.set(lerp(st.from.x, hat.x, e) + Math.sin(T * 5) * 0.08 * (1 - u), lerp(st.from.y, hat.y + 0.01, e) + Math.sin(T * 7) * 0.06 * (1 - u), lerp(st.from.z, hat.z, e));
      df.rotation.y = Math.atan2(hat.x - st.from.x, hat.z - st.from.z);
      if (u >= 1) { st.phase = 'sit'; st.t = 0; this.fox.setExpression('confused', { hold: 2.4 }); }
    } else if (st.phase === 'sit') {
      df.position.set(hat.x, hat.y + 0.01, hat.z);
      if (st.t > 4.5) { st.phase = 'out'; st.t = 0; st.from = df.position.clone(); this.fox.play('sit_sip', { fade: 0.3 }); }
    } else if (st.phase === 'out') {
      const R = this.right, F = this.fwd;
      df.position.x += (R.x * 1.4 - F.x * 0.4) * dt * 1.8;
      df.position.z += (R.z * 1.4 - F.z * 0.4) * dt * 1.8;
      df.position.y += dt * 0.5 + Math.sin(T * 6) * 0.01;
      df.rotation.y = Math.atan2(R.x, R.z);
      if (st.t > 3.5) { this.dflySt = null; df.visible = false; }
    }
  }

  // ------------------------------------------------------------ leaping fish
  _leapFish() {
    if (!this.fishMesh || this.fishSt) return;
    const R = this.right, F = this.fwd, s = this.seatPos;
    const a = new THREE.Vector3(s.x + R.x * rand(-3.2, -1.2) - F.x * rand(1.8, 3.4), WATER_Y, s.z + R.z * rand(-3.2, -1.2) - F.z * rand(1.8, 3.4));
    if (!this.game.grid.isWater(Math.floor(a.x), Math.floor(a.z))) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const b = new THREE.Vector3(a.x + R.x * 0.9 * dir, WATER_Y, a.z + R.z * 0.9 * dir);
    this.fishSt = { t: 0, a, b, dir };
    this.game.particles.splash(a.x, a.z, 6, 0.5);
    this._sfx('fish_flop', { volume: 0.12 });
  }

  _updateFish(dt) {
    const st = this.fishSt, m = this.fishMesh;
    if (!st) return;
    st.t += dt;
    const u = st.t / 0.85;
    if (u >= 1) {
      m.visible = false;
      this.fishSt = null;
      this.game.particles.splash(st.b.x, st.b.z, 8, 0.55);
      this.game.particles.sparkle(st.b.x, 0.1, st.b.z, 4, 0xfff6c0);
      this._sfx('plop', { volume: 0.18 });
      return;
    }
    m.visible = true;
    m.position.lerpVectors(st.a, st.b, u);
    m.position.y = WATER_Y + Math.sin(u * Math.PI) * 0.75 - 0.05;
    // nose up on the way out, nose down on the way back in
    m.material.rotation = Math.cos(u * Math.PI) * 0.9 * st.dir;
    m.scale.set(m.userData.w * st.dir, m.userData.h, 1);
  }

  // ------------------------------------------------------------ comic words
  _word(text, kind, x, y, z, { size = 1, life = 1.1 } = {}) {
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
      // pop in with overshoot, float up, shrink away
      const pop = w.t < 0.18 ? 1.35 * Math.sin((w.t / 0.18) * Math.PI * 0.5) : 1 + 0.35 * Math.exp(-(w.t - 0.18) * 12) * Math.cos((w.t - 0.18) * 30);
      const out = u > 0.82 ? 1 - smooth((u - 0.82) / 0.18) : 1;
      const k = wupp * 1.0 * w.size * pop * out;
      w.sprite.scale.set(w.w * k, w.h * k, 1);
      w.sprite.material.rotation = w.rot;
      w.sprite.position.y = w.y0 + w.t * 0.25;
    }
  }

  // ------------------------------------------------------------ light: glints, motes, fireflies
  _ambientFx(dt) {
    const game = this.game, P = game.particles, R = this.right, F = this.fwd, s = this.seatPos;
    this._dt = dt;
    // sun glints dancing on the pond, densest in the sunny (left) half
    this.glintT -= dt;
    while (this.glintT <= 0) {
      this.glintT += 0.035;
      const r = -Math.pow(Math.random(), 0.6) * 5.2 + 0.8, f = -rand(0.6, 4.6);
      const x = s.x + R.x * r + F.x * f, z = s.z + R.z * r + F.z * f;
      if (!game.grid.isWater(Math.floor(x), Math.floor(z))) continue;
      const big = Math.random() < 0.25;
      P.fx.spawn(big ? 'sparkle' : 'glint', x, WATER_Y + 0.03, z, {
        life: rand(0.25, 0.6), size: big ? rand(0.09, 0.13) : rand(0.035, 0.06), fps: big ? 10 : 0,
        flags: FX.POP | FX.FADE, emissive: 1.6, tint: [1.3, 1.08, 0.75], bright: true,
      });
    }
    // dust motes drifting in the golden light
    this.moteT -= dt;
    while (this.moteT <= 0) {
      this.moteT += 0.22;
      const r = rand(-3.5, 2.5), f = rand(-2.5, 1.2);
      P.fx.spawn('glint', s.x + R.x * r + F.x * f, rand(0.1, 1.9), s.z + R.z * r + F.z * f, {
        vx: rand(-0.06, 0.06) + R.x * 0.05, vy: rand(-0.02, 0.05), vz: rand(-0.06, 0.06) + R.z * 0.05,
        life: rand(3, 6), size: rand(0.018, 0.03), flags: FX.FADE | FX.WOBBLE, emissive: 1.2, tint: [1.25, 1.0, 0.7], bright: true,
      });
    }
    // a few fireflies always about, more as the evening goes on
    this.flyT -= dt;
    if (this.flyT <= 0) { this.flyT = rand(0.9, 1.8); this._firefly(); }
  }

  _firefly() {
    const R = this.right, F = this.fwd, s = this.seatPos;
    const r = rand(-4, 3), f = rand(-1, 1.6);
    this.game.particles.firefly(s.x + R.x * r + F.x * f, rand(0.25, 1.3), s.z + R.z * r + F.z * f);
  }

  // ------------------------------------------------------------ camera: slow orbit + push-in
  _updateCamera(dt, instant = false) {
    const rig = this.game.rig, T = this.T;
    const yaw = YAW + Math.sin(T * 0.045) * 0.09 + Math.sin(T * 0.017) * 0.05;
    rig.yaw = rig.yawGoal = yaw;
    rig.pitchGoal = THREE.MathUtils.degToRad(PITCH + Math.sin(T * 0.06) * 1.2);
    if (instant) rig.pitch = rig.pitchGoal;
    // push in over the first ~25 s, then breathe
    const push = smooth(T / 26);
    const rr = this.game.renderer;
    const tall = (rr.rtW || 16) / (rr.rtH || 9) < 1; // phones in portrait: closer in
    rig.wuppGoal = lerp(0.018, 0.0145, push) * (tall ? 0.72 : 1) * (1 + Math.sin(T * 0.07) * 0.025) * (1 - 0.2 * (this.punch || 0));
    // keep the near plane below the bottom of the screen at this low pitch
    const hh0 = ((rr.rtH || 300) * rig.wupp) / 2;
    rig.dist = Math.max(24, (hh0 * Math.cos(rig.pitch) + 0.8) / Math.sin(rig.pitch));
    if (instant) rig.wupp = rig.wuppGoal;
    // focus between the chairs, drifting a little towards the chase
    const s = this.seatPos || this._camFocus, R = this.right || new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
    const F = this.fwd || new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));
    let fx = s.x + R.x * 0.55 - F.x * 0.7, fz = s.z + R.z * 0.55 - F.z * 0.7;
    if (this.foxSt && this.foxSt.mode !== 'seated' && this.foxSt.mode !== 'hide') { fx = lerp(fx, this.foxSt.x, 0.25); fz = lerp(fz, this.foxSt.z, 0.25); }
    const B = this.gag?.bear;
    if (B && this.punch > 0.01) { const k = 0.45 * Math.min(1, this.punch); fx = lerp(fx, B.root.position.x, k); fz = lerp(fz, B.root.position.z, k); }
    // wide screens: push the diorama right so the menu sits on the left
    const renderer = this.game.renderer;
    const aspect = (renderer.rtW || 16) / (renderer.rtH || 9);
    const viewW = (renderer.rtW || 400) * rig.wupp;
    const shift = aspect > 1.25 ? -viewW * 0.17 : 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const k = instant ? 1 : 1 - Math.exp(-dt * 1.6);
    const gx = fx + cy * shift, gz = fz - sy * shift;
    this._camFocus.x = lerp(this._camFocus.x, gx, k);
    this._camFocus.z = lerp(this._camFocus.z, gz, k);
    rig.goal.set(this._camFocus.x, 0.35, this._camFocus.z);
    if (instant) rig.target.copy(rig.goal);
    // the sky curtain hangs behind the diorama, facing the camera
    if (this.skyMesh) {
      const tx = rig.target.x, tz = rig.target.z;
      this.skyMesh.position.set(tx - sy * SKY_D, 0, tz - cy * SKY_D);
      this.skyMesh.rotation.set(0, yaw, 0);
      // sun disc sits upper-left in the sky
      const hh = (renderer.rtH || 300) * rig.wupp * 0.5;
      const pitch = rig.pitch;
      const topH = (hh + 0.35 * Math.cos(pitch) - SKY_D * Math.sin(pitch)) / Math.cos(pitch);
      this.skyUniforms.uTop.value = Math.max(0.8, topH);
      this.skyUniforms.uSun.value.set(-viewW * 0.08 - shift * 0.5, Math.max(0.5, topH * 0.58));
    }
  }

  // ============================================================ the bear jumpscare
  // A suited bear ERUPTS out of the pond among the ducks (sting, RAWR!, splash,
  // camera punch-in), snatches them one by one and eats each with a different
  // BearEat style, snaps a leaping fish for dessert, burps up a single feather,
  // pats its belly and wades off into the reeds. Reynard leaps out of his chair
  // and cowers behind it, the deer screams into his hooves. Then a new duck
  // family paddles in, ducklings and all.
  _at(r, f, y = 0) { const s = this.seatPos, R = this.right, F = this.fwd; return new THREE.Vector3(s.x + R.x * r + F.x * f, y, s.z + R.z * r + F.z * f); }

  _startBearGag() {
    const game = this.game;
    const type = BEAR_CAST[this.bearN++ % BEAR_CAST.length];
    const def = BEAR_TYPES[type];
    const bear = new BearRig(type, def);
    bear.personalize(3.7 + this.bearN * 1.3);
    const E = this._at(-1.85, -2.75);
    const tx = Math.floor(E.x), tz = Math.floor(E.z);
    const floor = game.grid.isWater(tx, tz) ? game.grid.surfaceY(tx, tz) : -1;
    const sc = def.scale * bear.P.size;
    const waterY = Math.max(floor, WATER_Y - 0.62 * sc); // standing on a (cartoon) sandbar: belly up out of the water
    bear.root.position.set(E.x, waterY - 2.6 * sc, E.z);
    bear.root.rotation.y = YAW + 0.35;
    bear.root.visible = false;
    this.group.add(bear.root);
    bear.onEvent = (n) => this._bearEvent(n);
    const styles = [];
    for (let i = 0; i < 3; i++) styles.push(STYLE_DECK[(this.deckI + i) % STYLE_DECK.length]);
    this.deckI += 3;
    const fishStyle = FISH_STYLES[(this.bearN - 1) % FISH_STYLES.length];
    this.gag = { kind: 'bear', phase: 'lurk', t: 0, bear, E, waterY, sc, styles, fishStyle, i: 0, eat: null, prey: null, pose: 'idle', pt: 0 };
    for (const c of this.chicks) if (c.on) c.mode = 'flee';
  }

  // the bear's rig events -> the eat driver + splashes
  _bearEvent(name) {
    const G = this.gag;
    if (!G || G.kind !== 'bear') return;
    G.eat?.onRigEvent(name);
    const p = G.bear.root.position;
    if (name === 'step') { this.game.particles.splash(p.x, p.z, 4, 0.5); this.game.world.sim.disturb(p.x, p.z, 0.3, 0.1); }
    if (name === 'pat') this.game.world.sim.disturb(p.x, p.z, 0.4, 0.12);
  }

  _eatFx() {
    return {
      word: (id, x, y, z, size = 1) => { const w = EAT_WORDS[id] || ['NOM', 'eat']; this._word(w[0], w[1], x, y + 0.15, z, { size: 0.85 * size, life: 1 }); },
      sfx: (name, o) => this._sfx(name, { volume: 0.35, ...o }),
    };
  }

  _water() { const g = this.game.grid; return (x, z) => { const w = g.isWater(Math.floor(x), Math.floor(z)); return { y: w ? WATER_Y : g.surfaceY(Math.floor(x), Math.floor(z)), water: w }; }; }

  _scareFox() {
    const fox = this.fox, st = this.foxSt;
    this.fright = 1;
    this._dropCan();
    fox.dropMonocle?.();
    fox.popHat?.(1.2, 2);
    const has = (n) => fox.anims.includes(n);
    fox.setExpression(fox.expressions.includes('horror') ? 'horror' : 'shocked', { hold: 2.5 });
    fox.play(has('horror') ? 'horror' : 'panic', { fade: 0.06 });
    const h = fox.headTop();
    this._word('YIPE!', 'yelp', h.x, h.y + 0.2, h.z, { size: 1.1, life: 1.1 });
    this._sfx('fox_startle', { volume: 0.4 });
    // out of the chair, onto the bank behind it
    st.mode = 'hide'; st.t = 0;
    st.hide = { from: new THREE.Vector3(st.x, st.y, st.z), to: this._at(0.55, 1.15, 0), landed: false };
    this.foxChair.vx -= 5;
  }

  _runBearGag(dt) {
    const G = this.gag, game = this.game, P = game.particles, B = G.bear, fox = this.fox, deer = this.deer;
    G.t += dt;
    const E = G.E, sc = G.sc;
    let pose = G.pose, params = { inWater: true };
    const next = (phase) => { G.phase = phase; G.t = 0; };
    if (G.phase === 'lurk') {
      // something stirs under the ducks...
      if (Math.random() < dt * 9) P.bubbles(E.x + rand(-0.3, 0.3), WATER_Y - 0.25, E.z + rand(-0.3, 0.3), 1);
      if (Math.random() < dt * 4) game.world.sim.disturb(E.x, E.z, 0.35, 0.06);
      if (G.t > 0.8 && !G.q) { G.q = true; const h = this._headOf(deer); P.sprite('question', h[0], h[1], h[2], { vy: 0.4, life: 1.1, size: 0.3 }); deer.setExpression?.('worried', { hold: 1.2 }); }
      if (G.t > 1.5) {
        next('burst');
        B.root.visible = true;
        P.bigSplash(E.x, E.z);
        game.rig.shake = Math.max(game.rig.shake || 0, 0.9);
        this.punch = 1.35; this.punchHold = 0.45;
        this._sfx('jumpscare', { volume: 0.7 });
        this._sfx('roar', { volume: 0.55, pitch: 0.95 });
        this._sfx('bigsplash', { volume: 0.5 });
        this._scareFox();
        deer.play('horror', { fade: 0.08 });
        this.deerChair.vx -= 4.5;
        this.ducks.forEach((d) => { if (d.mode !== 'eaten') { d.mode = 'frozen'; d.t = 0; d.d.play('flap', { fade: 0.1 }); d.d.setExpression?.('panic'); } });
        this._later(0.35, () => { const h = B.headTop(); this._word('RAWR!', 'rawr', h.x, h.y + 0.25, h.z, { size: 1.7, life: 1.4 }); });
        this._later(0.5, () => this._word('QUACK?!', 'quack', E.x - this.right.x * 0.9, 0.6, E.z - this.right.z * 0.9, { size: 0.9, life: 1 }));
      }
    } else if (G.phase === 'burst') {
      // UP out of the water, roaring
      const u = clamp(G.t / 0.32, 0, 1);
      const k = 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2;
      B.root.position.y = G.waterY - 2.6 * sc * (1 - k);
      if (G.t < 0.4 && Math.random() < dt * 30) P.splash(E.x + rand(-0.4, 0.4), E.z + rand(-0.4, 0.4), 3, 1.1);
      pose = 'roar'; params = { t01: clamp(G.t / 1.5, 0, 1) };
      if (G.t > 1.6) next('grab');
    } else if (G.phase === 'grab') {
      // snatch the next duck (lunge + grab while it's yanked across the water)
      const st = this.ducks[G.i];
      if (G.t < dt * 1.5) {
        st.mode = 'yank'; st.t = 0; st.yank = { t0: 0, dur: 0.42, x: st.x, z: st.z };
        st.d.play('struggle', { fade: 0.08 });
        this._sfx('honk', { volume: 0.25, pitch: 1.9 });
        // a glance towards the victim, but keep the face (and that maw) to the camera
        G.turn = angLerp(YAW + 0.35, Math.atan2(st.x - B.root.position.x, st.z - B.root.position.z), 0.3);
      }
      B.root.rotation.y = angLerp(B.root.rotation.y, G.turn, 1 - Math.exp(-dt * 8));
      pose = G.t < 0.34 ? 'lunge' : 'grab'; params = { t01: G.t < 0.34 ? G.t / 0.34 : clamp((G.t - 0.34) / 0.36, 0, 1) };
      if (G.t > 0.46) {
        const style = G.styles[G.i];
        st.mode = 'held';
        const prey = makeDuckPrey(st.d, style);
        G.prey = prey;
        G.eat = startEat(game, { rig: B, style, prey, parent: this.group, groundAt: this._water(), fx: this._eatFx() });
        next('eat');
        this._reactTo(style);
      }
    } else if (G.phase === 'eat' || G.phase === 'fishEat') {
      B.root.rotation.y = angLerp(B.root.rotation.y, YAW + 0.35, 1 - Math.exp(-dt * 6));
      const done = G.eat.update(dt);
      pose = G.eat.pose; params = G.eat.poseParams;
      if (done) {
        G.eat.finish();
        if (G.phase === 'eat') {
          const st = this.ducks[G.i];
          G.prey.restore();
          st.d.root.visible = false;
          st.mode = 'eaten';
          G.eat.dispose(); G.prey.dispose();
          G.i++;
          next(G.i < this.ducks.length ? 'pause' : 'fish');
        } else { G.eat.dispose(); next('burp'); }
        G.eat = null; G.prey = null;
        pose = 'idle'; params = { inWater: true };
      }
    } else if (G.phase === 'pause') {
      pose = 'idle';
      if (G.t > 0.45) next('grab');
    } else if (G.phase === 'fish') {
      // a fish leaps right in front of it: snap!
      if (!G.leap) {
        const a = B.root.position.clone().addScaledVector(this.right, 1.5).addScaledVector(this.fwd, -0.6);
        a.y = WATER_Y;
        G.leap = { a };
        P.splash(a.x, a.z, 6, 0.6);
        this._sfx('fish_flop', { volume: 0.2 });
      }
      const u = clamp(G.t / 0.5, 0, 1), m = this.fishMesh;
      B.holdAnchor.getWorldPosition(this._tmpY || (this._tmpY = new THREE.Vector3()));
      if (m) {
        m.visible = u < 1;
        m.position.lerpVectors(G.leap.a, this._tmpY, u);
        m.position.y += Math.sin(u * Math.PI) * 0.9;
        m.material.rotation = Math.cos(u * Math.PI) * 0.9;
        m.scale.set(m.userData.w, m.userData.h, 1);
      }
      pose = G.t < 0.3 ? 'idle' : 'lunge'; params = { t01: clamp((G.t - 0.3) / 0.34, 0, 1), inWater: true };
      if (u >= 1 && G.t > 0.62) {
        const prey = makeFishPrey(game, { id: 'sockeye', size: 1.05, adult: true }, G.fishStyle);
        G.prey = prey;
        G.eat = startEat(game, { rig: B, style: G.fishStyle, prey, parent: this.group, groundAt: this._water(), fx: this._eatFx() });
        next('fishEat');
        this._reactTo(G.fishStyle);
      }
    } else if (G.phase === 'burp') {
      // BURP! a single feather floats down; pat pat
      pose = G.t < 0.9 ? 'yummy' : 'idle'; params = { t01: clamp(G.t / 0.9, 0, 1), inWater: true };
      if (G.t > 0.95 && !G.burp) {
        G.burp = true;
        const m = B.mouthPos();
        B.setFace('chomp_open', { hold: 0.35 });
        this._word('BURP!', 'burp', m.x, m.y + 0.35, m.z, { size: 1.3, life: 1.3 });
        this._sfx('burp', { volume: 0.55, pitch: 0.85 });
        P.fx.spawn('feather', m.x, m.y + 0.05, m.z, { vx: 0.25, vy: 1.2, grav: 0.55, drag: 1.6, life: 4.5, size: 0.2, spin: 2.5, flags: FX.WOBBLE | FX.FADE | FX.FLOAT });
      }
      if (G.t > 1.3) { pose = 'idle'; B.setFace('content', { hold: 1 }); }
      if (G.t > 2.3) { next('leave'); G.from = B.root.position.clone(); G.to = this._at(-6.2, -1.6); }
    } else if (G.phase === 'leave') {
      // waddles off to the reeds on the left bank and away
      const to = G.to, p = B.root.position;
      const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
      const sp = 1.15 * sc;
      B.root.rotation.y = angLerp(B.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-dt * 5));
      if (d > 0.05) { p.x += (dx / d) * Math.min(d, sp * dt); p.z += (dz / d) * Math.min(d, sp * dt); }
      const g = this._water()(p.x, p.z);
      const wet = g.water;
      p.y = lerp(p.y, wet ? G.waterY : g.y, 1 - Math.exp(-dt * 6));
      if (wet) game.world.sim.wake(p.x, p.z, 2, 0.3, dt);
      pose = 'walk'; params = { speed: sp, inWater: wet };
      if (G.t > 4.2 || d < 0.1) { this._endBear(); next('after'); }
    } else if (G.phase === 'after') {
      pose = null;
      if (G.t > 0.4 && !G.family) { G.family = true; this._duckFamily(); }
      if (G.t > 1.4 && !G.back) {
        G.back = true;
        this.fright = 0.4;
        fox.setExpression('worried', { hold: 2 });
        fox.play('walk', { fade: 0.2 });
        const st = this.foxSt;
        st.mode = 'walkback'; st.hop = { t: 0, from: new THREE.Vector3(st.x, st.y, st.z), r0: st.rot };
        fox.play('sit', { fade: 0.25 });
        fox.restoreMonocle?.();
      }
      if (G.t > 2.4 && !G.calm) { G.calm = true; deer.play('sit_chair', { fade: 0.4 }); this._restoreCan(); }
      if (G.t > 3.6 && !G.sip) { G.sip = true; this.fright = 0; fox.setExpression('tsk', { hold: 2 }); fox.play('sit_sip', { fade: 0.3 }); }
      if (G.t > 6) {
        this.gag = null;
        this.gagT = rand(14, 20);
        this.beatT = rand(2.5, 4);
        this.punchHold = 0;
      }
    }
    if (G.bear && pose && G.phase !== 'after') {
      B.pose(pose, dt, params);
      B.update(dt);
      if (G.phase === 'lurk') B.root.visible = false;
    }
    // the audience keeps reacting; nervous sweat
    if (this.fright > 0 && Math.random() < dt * 1.5) { const h = fox.headTop(); P.sprite('sweat', h.x + rand(-0.12, 0.12), h.y - 0.1, h.z, { vy: 0.5, life: 0.6, size: 0.14 }); }
  }

  // fox & deer react to each course: hide behind the paws for the gory ones
  _reactTo(style) {
    const fox = this.fox, deer = this.deer;
    const gory = style === 'rip' || style === 'shake' || style === 'crunch';
    const fa = gory ? 'cower' : 'horror';
    if (fox.anims.includes(fa)) fox.play(fa, { fade: 0.2, restart: true });
    deer.play(gory ? 'cower' : 'horror', { fade: 0.2 });
    if (!gory) this._later(1.2, () => { const h = this._headOf(deer); this._word(pick(['NOOO!', 'EEEK!', 'MY EYES!']), 'ahh', h[0], h[1], h[2], { size: 0.8, life: 1 }); });
    else this._later(0.6, () => { const h = this._headOf(fox, 0.05); this._word(pick(['GAH!', 'EEP!', 'OH NO']), 'yelp', h[0], h[1], h[2], { size: 0.8, life: 1 }); });
  }

  _endBear() {
    const G = this.gag;
    if (!G || G.kind !== 'bear' || !G.bear) return;
    if (G.eat) { G.prey?.restore?.(); G.eat.dispose(); G.prey?.dispose(); G.eat = null; G.prey = null; }
    for (const st of this.ducks) if (st.mode === 'held' || st.mode === 'yank') { st.mode = 'eaten'; st.d.root.visible = false; }
    G.bear.dispose();
    G.bear = null;
    if (this.fishMesh) this.fishMesh.visible = false;
  }

  // ------------------------------------------------------------ the new duck family (+ ducklings)
  _duckFamily() {
    const order = [1, 0, 2]; // the hen leads
    order.forEach((di, k) => {
      const st = this.ducks[di];
      const p = this._at(4.2 + k * 0.75, -3.0 - k * 0.25);
      st.x = p.x; st.z = p.z; st.y = WATER_Y; st.mode = 'arrive'; st.t = 0;
      st.heading = Math.atan2(-this.right.x, -this.right.z);
      st.d.root.visible = true;
      st.d.head.visible = true;
      st.d.setExpression?.(null);
      st.d.play('swim', { fade: 0 });
    });
    if (!this.chicks.length) {
      for (let k = 0; k < 3; k++) {
        const c = new Chick({ kind: 'duckling', breed: 'mallard' });
        c.root.scale.setScalar(SCALE * 1.35);
        this.group.add(c.root);
        c.play('swim', { fade: 0 });
        this.chicks.push({ c, k, x: 0, z: 0, heading: 0, on: false, mode: 'follow' });
      }
    }
    const hen = this.ducks[1];
    for (const ch of this.chicks) {
      ch.on = true; ch.mode = 'follow'; ch.c.root.visible = true;
      ch.x = hen.x + this.right.x * (0.35 + ch.k * 0.28); ch.z = hen.z + this.right.z * (0.35 + ch.k * 0.28); ch.heading = hen.heading;
    }
    this._later(0.8, () => { const h = this.ducks[1]; this._word('QUACK!', 'quack', h.x, h.y + 0.5, h.z, { size: 0.8, life: 0.9 }); this._sfx('honk', { volume: 0.2, pitch: 1.8 }); });
  }

  _updateChicks(dt) {
    const hen = this.ducks[1];
    this.chicks.forEach((ch, i) => {
      if (!ch.on) return;
      let tx, tz, spd;
      if (ch.mode === 'flee') {
        // paddle for their lives off to the right
        tx = ch.x + this.right.x * 2; tz = ch.z + this.right.z * 2; spd = 1.1;
        if (Math.hypot(ch.x - this.seatPos.x, ch.z - this.seatPos.z) > 7) { ch.on = false; ch.c.root.visible = false; return; }
      } else {
        // a little line behind mum
        const lead = i === 0 ? hen : this.chicks[i - 1];
        const hx = Math.sin(lead.heading), hz = Math.cos(lead.heading);
        tx = lead.x - hx * 0.27; tz = lead.z - hz * 0.27; spd = 0.75;
      }
      const dx = tx - ch.x, dz = tz - ch.z, d = Math.hypot(dx, dz);
      if (d > 0.04) {
        ch.heading = angLerp(ch.heading, Math.atan2(dx, dz), 1 - Math.exp(-dt * 6));
        const v = Math.min(d - 0.03, spd * dt * (ch.mode === 'flee' ? 1 : Math.min(1.6, d * 4)));
        ch.x += Math.sin(ch.heading) * v; ch.z += Math.cos(ch.heading) * v;
      }
      ch.c.root.position.set(ch.x, WATER_Y + Math.sin(this.T * 5 + i) * 0.006, ch.z);
      ch.c.root.rotation.y = ch.heading;
      ch.c.update(dt);
    });
  }

  // ------------------------------------------------------------ Reynard's beer can (dropped in fright)
  _dropCan() {
    if (this.canSt) return;
    const can = this.foxCan;
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    can.getWorldPosition(p); can.getWorldQuaternion(q);
    this.fox.hold(null);
    can.position.copy(p); can.quaternion.copy(q); can.scale.setScalar(SCALE);
    this.group.add(can);
    this.canSt = { v: new THREE.Vector3(rand(-0.6, 0.6), 1.6, rand(-0.6, 0.6)), spin: rand(8, 12), landed: false, t: 0 };
  }

  _updateCan(dt) {
    const st = this.canSt;
    if (!st) return;
    const c = this.foxCan;
    st.t += dt;
    if (!st.landed) {
      st.v.y -= 9 * dt;
      c.position.addScaledVector(st.v, dt);
      c.rotation.x += st.spin * dt;
      if (c.position.y < WATER_Y && st.v.y < 0) {
        st.landed = true;
        this.game.particles.splash(c.position.x, c.position.z, 6, 0.45);
        this._sfx('plop', { volume: 0.25 });
        c.rotation.set(Math.PI / 2, 0, rand(0, 6));
      }
    } else c.position.y = WATER_Y + 0.01 + this.game.world.sim.heightAt(c.position.x, c.position.z) * 0.6 + Math.sin(this.T * 2.3) * 0.008;
  }

  _restoreCan() {
    if (!this.canSt) return;
    this.canSt = null;
    this.foxCan.rotation.set(0, 0, 0);
    this.foxCan.scale.setScalar(1);
    this.foxCan.position.set(-0.012, 0.03, -0.002);
    this.fox.hold(this.foxCan);
  }

  // ------------------------------------------------------------ fish under the surface
  // A few pond fish drawn as one sprite batch just under the water (drawn before the
  // translucent water so they read as submerged), drifting in a loose school.
  _buildSchool() {
    const game = this.game;
    if (!game.fish?.tex || !game.fish.atlas) { this.school = null; return; }
    const batch = new SpriteBatch(game.fish.tex, { max: 16, lit: true, castShadow: false, receiveShadow: false, renderOrder: 9, name: 'titleFish' });
    this.group.add(batch.mesh);
    const ids = ['bluegill', 'perch', 'sockeye', 'brook', 'rainbow', 'goldfish', 'bluegill', 'perch', 'char'];
    const list = ids.map((id, i) => {
      const p = this._at(rand(-2.8, 2.4), rand(-4.6, -1.4));
      return { id, x: p.x, z: p.z, h: rand(0, TAU), sp: rand(0.25, 0.45), ph: rand(0, 4), y: WATER_Y - rand(0.1, 0.22), size: rand(0.42, 0.62), turn: rand(0.5, 3), i };
    });
    this.school = { batch, list, center: this._at(-0.4, -3), ct: 0 };
  }

  _updateSchool(dt) {
    const S = this.school;
    if (!S) return;
    const g = this.game.grid, atlas = this.game.fish.atlas;
    S.ct -= dt;
    if (S.ct <= 0) { S.ct = rand(4, 8); S.center = this._at(rand(-2.4, 2.4), rand(-4.4, -1.6)); }
    // keep clear of the bear while it's in the pond
    const B = this.gag?.bear;
    S.batch.clear();
    const cr = this.right;
    for (const f of S.list) {
      f.turn -= dt;
      const ox = S.center.x + Math.sin(f.i * 2.1) * 0.8, oz = S.center.z + Math.cos(f.i * 1.7) * 0.6;
      let want = Math.atan2(ox - f.x, oz - f.z);
      if (f.turn <= 0) { f.turn = rand(0.6, 2.4); f.wob = rand(-0.9, 0.9); }
      want += f.wob || 0;
      if (B) { const dx = f.x - B.root.position.x, dz = f.z - B.root.position.z; if (dx * dx + dz * dz < 2.5) want = Math.atan2(dx, dz); }
      f.h = angLerp(f.h, want, 1 - Math.exp(-dt * 1.2));
      const nx = f.x + Math.sin(f.h) * f.sp * dt, nz = f.z + Math.cos(f.h) * f.sp * dt;
      if (g.isWater(Math.floor(nx), Math.floor(nz))) { f.x = nx; f.z = nz; } else f.h += Math.PI * 0.5;
      f.ph += dt * (4 + f.sp * 6);
      const fr = atlas.frame(f.id, 'normal', Math.floor(f.ph) % 4, false);
      if (!fr) continue;
      const toRight = Math.sin(f.h) * cr.x + Math.cos(f.h) * cr.z;
      S.batch.push(fr, f.x, f.y, f.z, { texels: FISH_TPU, scale: f.size, mode: 0, ax: 0.5, ay: 0.5, flip: toRight < 0, bend: 0.5, phase: f.i * 1.3, tint: [0.5, 0.64, 0.74] });
    }
    S.batch.commit();
  }

  _sfx(name, o) {
    try { this.game.audio.play(name, o); } catch { /* audio is optional */ }
  }
}
