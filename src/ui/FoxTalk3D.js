// FoxTalk3D: a live 3D Reynard bust for dialogue boxes. The real FoxRig is
// rendered small, outlined and upscaled pixelated into a canvas inside `el`; he
// lip-flaps while a line plays, pulls a face per expression and gets cartoon FX
// (sweat drops, anger veins, hearts, "!", "?", $$$, Zzz, notes...) as pixel
// sprites around his head.
//
//   import { createFoxTalk } from './FoxTalk3D.js';
//   const ft = createFoxTalk(portraitEl, { outfit: 'teacher', game });   // null if WebGL is unavailable
//   ft.setExpression('shocked');   // face + body gag + auto FX ("!", shock lines, jump)
//   ft.talk('Class! Is your fish happy?');   // mouth flaps + head bobs, squash on the new line
//   ft.fx('hearts');               // any FX by hand
//   ft.dispose();
//
// - ONE shared offscreen WebGLRenderer for every instance: each instance renders its
//   own scene into it and copies the pixels into its own 2D canvas, so any number of
//   portraits cost a single WebGL context.
// - One shared rAF loop at ~30 fps; an instance only updates while its element is on
//   screen (IntersectionObserver: display:none / offscreen / detached all pause it).
// - Nothing is built at import time.
import * as THREE from 'three';
import { FoxRig, FOX_OUTFITS } from '../entities/foxRig.js';
import { EYE_R, EYE_L, FACE_W, FACE_H } from '../entities/foxFace.js';

const VS = 0.05; // world units per rig voxel
const FPS = 30;

// ------------------------------------------------------------------ expressions
// name -> rig face, optional body gag (one-shot `anim` or looping `base`), auto FX and
// an optional repeat interval for ambient FX while the face holds.
const EXPR = {
  neutral: { e: 'neutral' },
  smug: { e: 'smug', fx: 'glint' },
  teacher: { e: 'teacher', fx: 'glint' },
  greedy: { e: 'greedy', base: 'greedy', fx: 'dollars', every: 2.2 },
  scheming: { e: 'scheming', fx: 'dollars', every: 2.8 },
  yum: { e: 'yum', fx: 'hearts', every: 2.6 },
  shocked: { e: 'shocked', fx: 'shock' },
  alarmed: { e: 'alarmed', fx: 'shock' },
  laugh: { e: 'laugh', fx: 'notes', every: 1.3 },
  happy: { e: 'happy', fx: 'blush' },
  wink: { e: 'wink', fx: 'blush' },
  angry: { e: 'angry', anim: 'angry_stomp', fx: 'anger', every: 1.6 },
  worried: { e: 'worried', fx: 'sweat', every: 2.2 },
  scared: { e: 'cower', base: 'cower', fx: 'sweat', every: 1.4 },
  sleepy: { e: 'sleepy', anim: 'yawn', fx: 'zzz', every: 1.6 },
  excited: { e: 'excited', fx: 'sparkle', every: 1.8 },
  proud: { e: 'proud', fx: 'sparkle' },
  love: { e: 'love', fx: 'hearts', every: 1.5 },
  confused: { e: 'confused', anim: 'shrug', fx: 'question', every: 3 },
  think: { e: 'confused', base: 'think', fx: 'question', every: 3.5 },
  focused: { e: 'focused' },
  determined: { e: 'determined', fx: 'glint' },
  magnifique: { e: 'magnifique', fx: 'sparkle' },
  sad: { e: 'sad', fx: 'sweat' },
  embarrassed: { e: 'embarrassed', fx: 'blush' },
  evil_grin: { e: 'evil_grin', fx: 'dollars' },
  mwaha: { e: 'mwaha', anim: 'laugh_evil', fx: 'notes' },
  dizzy: { e: 'dizzy', fx: 'question' },
  horror: { e: 'horror', fx: 'shock' },
  cower: { e: 'cower', base: 'cower', fx: 'sweat', every: 1.4 },
  tsk: { e: 'tsk' },
  dreamy: { e: 'dreamy', fx: 'hearts' },
  ko: { e: 'ko', fx: 'zzz' },
};
// friendly aliases used around the game
const ALIAS = {
  info: 'teacher', warn: 'alarmed', no: 'tsk', nervous: 'worried', fear: 'scared', panic: 'alarmed', surprised: 'shocked',
  mad: 'angry', money: 'greedy', sly: 'scheming', cool: 'smug', joy: 'happy', grin: 'happy', wow: 'excited',
  heart: 'love', hungry: 'yum', cry: 'sad', bored: 'sleepy', sleep: 'sleepy', thinking: 'think', idle: 'neutral',
};
export const FOX_TALK_EXPRESSIONS = Object.keys(EXPR);
export const FOX_TALK_FX = ['sweat', 'anger', 'steam', 'sparkle', 'stars', 'hearts', 'shock', 'question', 'dollars', 'blush', 'notes', 'zzz', 'glint', 'bounce', 'jump'];

// ------------------------------------------------------------------ pixel sprites
const PAL = {
  k: '#2a1626', w: '#ffffff', B: '#c4ecff', b: '#62b8f2', d: '#2f6cc0',
  r: '#ec3c3c', R: '#a01e2c', o: '#ff8a3a',
  p: '#ff6a9c', P: '#ffb6d0', m: '#c42e68',
  y: '#ffdc3c', Y: '#fff6b0', g: '#e09a18',
  G: '#5cd24c', n: '#2a8a3a', N: '#b8f29a',
  s: '#f4f2fa', S: '#c6c0d8', v: '#6a3ea0', V: '#a77ad8',
};
const ROWS = {
  sweat: ['...k...', '..kBk..', '..kBk..', '.kBwBk.', '.kBwbk.', 'kBBbbdk', 'kbbbbdk', '.kbddk.', '..kkk..'],
  heart: ['.kk...kk.', 'kPpk.kppk', 'kPwppppmk', 'kpppppppk', '.kppppmk.', '..kppmk..', '...kmk...', '....k....'],
  twinkle: ['...k...', '..kYk..', '.kkYkk.', 'kYYwYYk', '.kkYkk.', '..kYk..', '...k...'],
  star: ['....k....', '...kYk...', '...kyk...', 'kkkkyykkk', 'kYYyyyygk', '.kyyyyyk.', '..kyyygk.', '.kyygkygk', '.kgk.kkgk', '.kk....kk'],
  bang: ['.kkk.', 'kwrrk', 'krrRk', 'krrRk', 'krrRk', 'krrRk', '.kRk.', '.kRk.', '..k..', '.kkk.', 'krrRk', '.kkk.'],
  question: ['.kkkkk..', 'kYyyyyk.', 'kykkkyyk', 'kk..kyyk', '...kyygk', '..kyygk.', '..kygk..', '..kkk...', '..kkk...', '..kyk...', '..kkk...'],
  dollar: ['...k...', '.kkGkk.', 'kNGGGGk', 'kGkGkkk', 'kGGGGk.', '.kGGGnk', 'kkkGkGk', 'kGGGGnk', '.kkGkk.', '...k...'],
  zed: ['kkkkkkk', 'kwwwwBk', 'kkkkwBk', '..kwBk.', '.kwBkkk', 'kwwwwBk', 'kkkkkkk'],
  note: ['...kk...', '...kVk..', '...kvVk.', '...kvkVk', '...kvk.k', '.kkkvk..', 'kVvvvk..', 'kvvvvk..', '.kkkk...'],
  vein: ['...kk.kk...', '...kr.rk...', '.kkkr.rkkk.', 'krrrk.krrrk', '.kkk...kkk.', '...........', '.kkk...kkk.', 'krrrk.krrrk', '.kkkr.rkkk.', '...kr.rk...', '...kk.kk...'],
  puff: ['..kkk...', '.kssskk.', 'ksssssSk', 'kssSssSk', '.kSSSSk.', '..kkkk..'],
};
const _art = {};
function art(name) {
  if (_art[name]) return _art[name];
  let c;
  if (name === 'blush') {
    // pink oval with "///" hatching, no outline
    const W = 11, H = 5;
    c = document.createElement('canvas'); c.width = W; c.height = H;
    const x2 = c.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2);
      if (dx * dx + dy * dy > 1.05) continue;
      x2.fillStyle = (x + y) % 3 === 0 ? PAL.m : PAL.p;
      x2.globalAlpha = (x + y) % 3 === 0 ? 1 : 0.75;
      x2.fillRect(x, y, 1, 1);
    }
  } else if (name === 'burst') {
    // shock lines: dashes radiating in 12 directions around a hole for the head
    const S = 49, cx = 24, cy = 24;
    c = document.createElement('canvas'); c.width = S; c.height = S;
    const x2 = c.getContext('2d');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      const r0 = 16 + (i % 2) * 2, r1 = r0 + 6 + (i % 3);
      for (let r = r0; r <= r1; r += 0.5) {
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        x2.fillStyle = PAL.k; x2.fillRect(x, y, 1, 1);
        if (r < r1 - 1) { x2.fillStyle = PAL.w; x2.fillRect(x + (Math.abs(Math.sin(a)) > 0.7 ? 1 : 0), y + (Math.abs(Math.sin(a)) > 0.7 ? 0 : 1), 1, 1); }
      }
    }
  } else {
    const rows = ROWS[name];
    c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
    const x2 = c.getContext('2d');
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = PAL[row[x]]; if (col) { x2.fillStyle = col; x2.fillRect(x, y, 1, 1); } } });
  }
  _art[name] = c;
  return c;
}

// ------------------------------------------------------------------ shared renderer
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// 1px ink outline around the silhouette + darkened depth creases (same look as FoxNotifier)
const POST_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 size;
uniform vec3 ink;
uniform float cNear;
uniform float cFar;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    gl_FragColor = n > 0.5 ? vec4(ink, 1.0) : vec4(0.0);
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > 0.09) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}
`;

const POOL = { renderer: null, failed: false, post: null, postScene: null, postCam: null, insts: new Set(), raf: 0, last: 0, acc: 0 };

function pool() {
  if (POOL.renderer) return POOL;
  if (POOL.failed) return null;
  try {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!r.getContext()) throw new Error('no gl');
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    POOL.renderer = r;
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x150910) }, cNear: { value: 0.1 }, cFar: { value: 20 } },
      depthTest: false, depthWrite: false,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    POOL.post = new THREE.Mesh(g, mat);
    POOL.post.frustumCulled = false;
    POOL.postScene = new THREE.Scene();
    POOL.postScene.add(POOL.post);
    POOL.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
    return POOL;
  } catch (e) {
    console.warn('FoxTalk3D: WebGL unavailable, using pixel portraits', e);
    POOL.failed = true;
    return null;
  }
}

function releasePool() {
  if (POOL.insts.size || !POOL.renderer) return;
  cancelAnimationFrame(POOL.raf); POOL.raf = 0;
  POOL.post.geometry.dispose(); POOL.post.material.dispose();
  POOL.renderer.dispose();
  POOL.renderer.forceContextLoss?.();
  POOL.renderer = null;
}

function startLoop() {
  if (POOL.raf || typeof requestAnimationFrame === 'undefined') return;
  POOL.last = performance.now();
  const tick = (now) => {
    POOL.raf = 0;
    if (!POOL.insts.size) return;
    const dt = Math.min(0.1, Math.max(0, (now - POOL.last) / 1000));
    POOL.last = now;
    POOL.acc += dt;
    if (POOL.acc >= 1 / FPS - 0.004) { stepFoxTalks(Math.min(0.1, POOL.acc)); POOL.acc = 0; }
    POOL.raf = requestAnimationFrame(tick);
  };
  POOL.raf = requestAnimationFrame(tick);
}

/** Advance + render every visible portrait by dt seconds (the shared loop calls this; tests can too). */
export function stepFoxTalks(dt, { force = false } = {}) {
  for (const inst of POOL.insts) inst._step(dt, force);
}
/** True when a 3D portrait can be made (WebGL works). Creates the shared context on first call. */
export function foxTalkSupported() { return !!pool(); }

let _css = false;
function injectCSS() {
  if (_css || typeof document === 'undefined') return;
  _css = true;
  const s = document.createElement('style');
  s.id = 'foxtalk3d-css';
  s.textContent = `
.ftk { position: relative; width: 100%; height: 100%; pointer-events: none; }
.ftk-clip { position: absolute; inset: 0; overflow: hidden; }
.ftk-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; image-rendering: crisp-edges; transform-origin: 50% 100%; }
.ftk-fx { position: absolute; inset: 0; overflow: visible; z-index: 2; }
.ftk-fx canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; will-change: transform, opacity; }
`;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------ instance
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

// head-local anchor points (voxels): eyes, cheeks, temples, crown
const EYE_Y = FACE_H / 4 - EYE_R.y / 4;
const HEAD_PTS = {
  eyeR: [EYE_R.x / 4 - FACE_W / 8, EYE_Y, 6.6], eyeL: [EYE_L.x / 4 - FACE_W / 8, EYE_Y, 6.6],
  cheekR: [-4.6, 3.2, 6.4], cheekL: [4.6, 3.2, 6.4],
  templeR: [-7.2, 8.5, 2], templeL: [7.2, 8.5, 2],
  center: [0, 6, 3], chin: [0, 0, 6],
};

class FoxTalk {
  constructor(el, { outfit, size, game, pixelScale, fxScale = 2, turn = 0.32 } = {}) {
    this.el = el;
    this.game = game || null;
    this.size = size || 0;
    // CSS px per rendered pixel: 3 device px on hi-dpi (matches the world's pixelRenderer), 2 otherwise
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.ps = pixelScale || (dpr >= 2 ? 3 : 2) / dpr;
    this.fs = fxScale; // CSS px per FX sprite pixel
    this.turn = turn;
    this._expr = 'teacher';
    this._def = EXPR.teacher;
    this._everyT = 0;
    this._fx = [];
    this._onscreen = true;
    this._dead = false;
    this._pendingTalk = false;
    this._sq = { x: 0, v: 0 };
    this._jump = { t: -1, h: 0.2, T: 0.5 };
    this._camT = null;
    this._time = 0;
    injectCSS();
    // DOM
    const wrap = (this.wrap = document.createElement('div'));
    wrap.className = 'ftk';
    wrap.innerHTML = '<div class="ftk-clip"><canvas class="ftk-cv"></canvas></div><div class="ftk-fx"></div>';
    this.cv = wrap.querySelector('.ftk-cv');
    this.ctx = this.cv.getContext('2d');
    this.fxEl = wrap.querySelector('.ftk-fx');
    el.appendChild(wrap);
    // scene
    const scene = (this.scene = new THREE.Scene());
    scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.3); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffc6a0, 0.55); fill.position.set(2.5, 0.4, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd27a, 2.6); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff9fd0, 1.4); rim2.position.set(-2.6, 1.2, -2.2); scene.add(rim2);
    // pivot at the hips so squash & stretch reads on the bust (the feet are off-frame)
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, 0.36, 0);
    scene.add(this.pivot);
    const rig = (this.rig = new FoxRig({ shadows: false }));
    rig.root.position.set(0, -0.36, 0);
    rig.root.rotation.y = turn;
    this.pivot.add(rig.root);
    const o = outfit || game?.fox?.rig?.outfit || 'default';
    rig.setOutfit(FOX_OUTFITS.includes(o) ? o : 'default');
    this.cam = new THREE.PerspectiveCamera(20, 1, 0.5, 20);
    rig.play('idle', { fade: 0 });
    rig.update(0.5);
    this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(2, 2);
    this._n = 0;
    this._resize();
    this._frameCam(1);
    rig.lookAt(this.cam.position);
    // pause offscreen / hidden
    if (typeof IntersectionObserver !== 'undefined') {
      this._io = new IntersectionObserver((ents) => { for (const e of ents) this._onscreen = e.isIntersecting; if (this._onscreen) startLoop(); });
      this._io.observe(wrap);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(wrap);
    }
    POOL.insts.add(this);
    this.setExpression('teacher', { fx: false });
    this._step(0, true);
    startLoop();
  }

  // ---------------------------------------------------------------- API
  setExpression(name, { fx = true } = {}) {
    if (this._dead) return this;
    let key = ALIAS[name] || name || 'neutral';
    let def = EXPR[key];
    if (!def) def = this.rig.expressions.includes(key) ? { e: key } : EXPR.neutral;
    const changed = key !== this._expr;
    this._expr = key; this._def = def;
    this.rig.setExpression(def.e);
    this._everyT = def.every || 0;
    if (changed || fx) {
      if (def.anim && this.rig.anims.includes(def.anim)) {
        this.rig.play(def.anim, { loop: false, fade: 0.2, restart: true, onDone: () => this._base(0.3) });
        this._oneShot = true;
      } else { this._oneShot = false; this._base(0.25); }
    }
    if (fx && def.fx) this.fx(def.fx);
    return this;
  }

  talk(text, { cps = 16 } = {}) {
    if (this._dead) return 0;
    const d = this.rig.talk(String(text || ''), { cps });
    this._talking = d > 0;
    this.bounce();
    if (!this._oneShot) this._base(0.2);
    return d;
  }

  stopTalk() {
    if (this._dead) return this;
    this.rig.stopTalking();
    this._talking = false;
    if (!this._oneShot) this._base(0.3);
    return this;
  }

  setOutfit(name) { if (!this._dead) this.rig.setOutfit(FOX_OUTFITS.includes(name) ? name : 'default'); return this; }

  /** Squash & bounce (new line). */
  bounce(k = 1) { this._sq.v -= 2.6 * k; return this; }

  /** Cartoon effect by name (see FOX_TALK_FX). */
  fx(kind) {
    if (this._dead) return this;
    const S = this._spawn.bind(this);
    switch (kind) {
      case 'sweat':
        S('sweat', { at: 'templeL', ox: 2, oy: 4, vy: 10, life: 1.4, grow: 0.6, wob: 0 });
        if (Math.random() < 0.5) S('sweat', { at: 'templeR', ox: -2, oy: 6, vy: 9, life: 1.2, delay: 0.25, scale: 0.8 });
        break;
      case 'anger':
        S('vein', { at: 'templeL', ox: -2, oy: -6, life: 1.6, pulse: 7, grow: 0.5, follow: true });
        this.fx('steam');
        this._sq.v += 1.2;
        break;
      case 'steam':
        for (let i = 0; i < 4; i++) {
          const L = i % 2 === 0;
          S('puff', { at: L ? 'templeL' : 'templeR', ox: L ? 2 : -2, oy: -2, vx: (L ? 1 : -1) * rnd(14, 24), vy: rnd(-26, -16), life: 0.8, delay: i * 0.12, grow: 1.2, fade: 0.5 });
        }
        break;
      case 'sparkle':
        S('twinkle', { at: 'eyeR', life: 0.9, pop: true, spin: 0, follow: true, scale: 0.8 });
        S('twinkle', { at: 'eyeL', life: 0.9, pop: true, follow: true, scale: 0.8, delay: 0.08 });
        this.fx('stars');
        break;
      case 'stars':
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.6;
          S(i % 2 ? 'twinkle' : 'star', { at: 'center', vx: Math.cos(a) * 46, vy: Math.sin(a) * 46 - 8, ay: 40, life: 0.95, delay: i * 0.05, pop: true, spinV: rnd(-3, 3) });
        }
        break;
      case 'hearts':
        for (let i = 0; i < 3; i++) S('heart', { at: 'top', ox: rnd(-16, 16), oy: 2, vx: rnd(-6, 6), vy: rnd(-28, -20), life: 1.5, delay: i * 0.22, wob: 9, pop: true, scale: i === 1 ? 1 : 0.8 });
        break;
      case 'shock':
        S('bang', { at: 'top', ox: 14, oy: -6, life: 1.1, pop: true, follow: true, shake: 1.5 });
        S('burst', { at: 'center', life: 0.55, pop: true, follow: true, flicker: true, scale: 1 });
        this.jump(0.2);
        break;
      case 'question':
        S('question', { at: 'top', ox: 14, oy: -4, life: 1.7, pop: true, follow: true, rock: 0.35 });
        if (Math.random() < 0.6) S('question', { at: 'top', ox: -10, oy: 0, life: 1.3, pop: true, follow: true, rock: 0.3, delay: 0.3, scale: 0.7 });
        break;
      case 'dollars':
        S('dollar', { at: 'eyeR', vx: -26, vy: -40, ay: 70, life: 1.0, pop: true, spinV: -2 });
        S('dollar', { at: 'eyeL', vx: 26, vy: -44, ay: 70, life: 1.0, pop: true, spinV: 2, delay: 0.1 });
        S('dollar', { at: 'top', ox: 0, oy: 4, vy: -30, life: 1.1, pop: true, delay: 0.3, scale: 0.8 });
        break;
      case 'blush':
        S('blush', { at: 'cheekR', life: 2.2, fadeIn: 0.25, follow: true, fade: 0.6 });
        S('blush', { at: 'cheekL', life: 2.2, fadeIn: 0.25, follow: true, fade: 0.6 });
        break;
      case 'notes':
        for (let i = 0; i < 3; i++) {
          const L = i % 2 === 0;
          S('note', { at: L ? 'templeR' : 'templeL', ox: L ? -4 : 4, vx: (L ? -1 : 1) * rnd(12, 20), vy: rnd(-30, -22), life: 1.3, delay: i * 0.25, wob: 6, pop: true, spinV: (L ? -1 : 1) * 0.8 });
        }
        break;
      case 'zzz':
        for (let i = 0; i < 3; i++) S('zed', { at: 'top', ox: 10, oy: 0, vx: 16, vy: -20, life: 1.6, delay: i * 0.45, wob: 5, grow: 1.1, scale: 0.55 });
        break;
      case 'glint':
        S('twinkle', { at: 'eyeR', ox: 3, oy: -3, life: 0.6, pop: true, follow: true, scale: 0.7, spinV: 4 });
        break;
      case 'bounce': this.bounce(); break;
      case 'jump': this.jump(); break;
      default: break;
    }
    startLoop();
    return this;
  }

  jump(h = 0.2) { this._jump.t = 0; this._jump.h = h; this._sq.v += 2.2; return this; }

  dispose() {
    if (this._dead) return;
    this._dead = true;
    POOL.insts.delete(this);
    this._io?.disconnect(); this._ro?.disconnect();
    this.rig.dispose();
    this.rt.depthTexture.dispose(); this.rt.dispose();
    this.wrap.remove();
    this._fx.length = 0;
    releasePool();
  }

  // ---------------------------------------------------------------- internals
  _base(fade) {
    const d = this._def || EXPR.neutral;
    const want = d.base && this.rig.anims.includes(d.base) ? d.base : this._talking ? 'talk' : 'idle';
    this._oneShot = false;
    if (this.rig.current !== want) this.rig.play(want, { loop: true, fade });
  }

  _resize() {
    const css = this.size || this.wrap.clientWidth || this.el.clientWidth || 96;
    const n = Math.max(24, Math.round(css / this.ps));
    if (n === this._n) return;
    this._n = n; this._css = css;
    this.cv.width = n; this.cv.height = n;
    this.rt.setSize(n, n);
  }

  // follow the head as the animation moves it (but not our own squash/jump, so those read)
  _frameCam(k) {
    const rig = this.rig;
    rig.neck.getWorldPosition(_v);
    this.pivot.worldToLocal(_v);
    _v.add(PIVOT_BASE);
    _v.x *= 0.6; // stay mostly centred on him; sway only a bit
    const T = (this._camT ||= _v.clone());
    T.lerp(_v, k);
    const c = this.cam;
    c.position.set(T.x + 0.06, T.y + 0.42, T.z + 3.7);
    c.lookAt(T.x + 0.04, T.y + 0.3, T.z);
    c.updateMatrixWorld();
  }

  _headPt(name, out) {
    const rig = this.rig;
    if (name === 'top') { rig.headTop(out); out.y -= 0.05; }
    else {
      const p = HEAD_PTS[name] || HEAD_PTS.center;
      rig.head.updateWorldMatrix(true, false);
      out.set(p[0] * VS, p[1] * VS, p[2] * VS);
      rig.head.localToWorld(out);
    }
    out.project(this.cam);
    const W = this._css || 96;
    out.set((out.x * 0.5 + 0.5) * W, (0.5 - out.y * 0.5) * W, 0);
    return out;
  }

  _spawn(name, o = {}) {
    const c = document.createElement('canvas');
    const src = art(name);
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    const ps = this.fs * (o.scale || 1);
    c.style.width = src.width * ps + 'px';
    c.style.height = src.height * ps + 'px';
    c.style.opacity = '0';
    this.fxEl.appendChild(c);
    const p = { c, w: src.width * ps, h: src.height * ps, t: -(o.delay || 0), o, x: 0, y: 0, base: null };
    this._fx.push(p);
    if (this._fx.length > 40) this._killFx(this._fx[0]);
  }

  _killFx(p) {
    p.c.remove();
    const i = this._fx.indexOf(p);
    if (i >= 0) this._fx.splice(i, 1);
  }

  _updateFx(dt) {
    const ps = this.fs;
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const p = this._fx[i], o = p.o;
      p.t += dt;
      if (p.t < 0) continue;
      const life = o.life || 1;
      if (p.t >= life) { this._killFx(p); continue; }
      if (!p.base || o.follow) p.base = this._headPt(o.at || 'center', p.base || new THREE.Vector3());
      const t = p.t, u = t / life;
      const x = p.base.x + (o.ox || 0) * ps / 2 + (o.vx || 0) * t + (o.wob ? Math.sin(t * 7 + i) * o.wob : 0);
      const y = p.base.y + (o.oy || 0) * ps / 2 + (o.vy || 0) * t + 0.5 * (o.ay || 0) * t * t;
      let s = 1 + (o.grow || 0) * u;
      if (o.pop) s *= t < 0.12 ? 0.3 + (t / 0.12) * 1.0 : t < 0.24 ? 1.3 - ((t - 0.12) / 0.12) * 0.3 : 1;
      if (o.pulse) s *= 1 + Math.max(0, Math.sin(t * o.pulse)) * 0.22;
      let a = 1;
      const fade = o.fade ?? 0.3;
      if (life - t < fade) a = (life - t) / fade;
      if (o.fadeIn && t < o.fadeIn) a = Math.min(a, t / o.fadeIn);
      if (o.flicker) a *= (Math.floor(t * 20) % 2) ? 1 : 0.35;
      let rot = (o.spinV || 0) * t;
      if (o.rock) rot += Math.sin(t * 5) * o.rock;
      const sx = o.shake && t < 0.4 ? Math.sin(t * 70) * o.shake * ps : 0;
      // snap to the art pixel grid so the sprites stay as chunky as the render
      const X = Math.round((x - p.w / 2 + sx) / ps) * ps, Y = Math.round((y - p.h / 2) / ps) * ps;
      p.c.style.transform = `translate(${X}px,${Y}px) rotate(${rot.toFixed(3)}rad) scale(${s.toFixed(3)})`;
      p.c.style.opacity = a.toFixed(3);
    }
  }

  _step(dt, force) {
    if (this._dead) return;
    if (!force && !this._onscreen) return;
    const rig = this.rig;
    this._time += dt;
    // back to idle body once the line is said
    if (this._talking && !rig.talking) { this._talking = false; if (!this._oneShot) this._base(0.35); }
    // ambient repeats while the face holds
    if (this._def.every && dt > 0) {
      this._everyT -= dt;
      if (this._everyT <= 0) { this._everyT = this._def.every * rnd(0.85, 1.2); this.fx(this._def.fx); }
    }
    // squash spring + jump arc on the pivot
    const sq = this._sq, d = Math.min(dt, 1 / 30);
    for (let t = 0; t < dt - 1e-6; t += d) {
      const h = Math.min(d, dt - t);
      sq.v += (-170 * sq.x - 11 * sq.v) * h;
      sq.x += sq.v * h;
    }
    sq.x = clamp(sq.x, -0.3, 0.3);
    let jy = 0;
    const J = this._jump;
    if (J.t >= 0) {
      J.t += dt;
      const u = J.t / J.T;
      if (u >= 1) { J.t = -1; sq.v -= 2.4; } // landing squash
      else jy = Math.sin(u * Math.PI) * J.h;
    }
    const sy = 1 + sq.x, sxz = 1 / Math.sqrt(Math.max(0.4, sy));
    this.pivot.scale.set(sxz, sy, sxz);
    this.pivot.position.set(PIVOT_BASE.x, PIVOT_BASE.y + jy, PIVOT_BASE.z);
    rig.update(dt);
    this._frameCam(1 - Math.exp(-dt * 5));
    this._render();
    this._updateFx(dt);
  }

  _render() {
    const P = pool();
    if (!P) return;
    const r = P.renderer, n = this._n;
    const sz = r.getSize(_sz);
    if (sz.x !== n || sz.y !== n) r.setSize(n, n, false);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    const U = P.post.material.uniforms;
    U.tColor.value = this.rt.texture; U.tDepth.value = this.rt.depthTexture;
    U.size.value.set(n, n); U.cNear.value = this.cam.near; U.cFar.value = this.cam.far;
    r.render(P.postScene, P.postCam);
    // copy out of the shared context right away (same task, so no preserveDrawingBuffer needed)
    this.ctx.clearRect(0, 0, n, n);
    this.ctx.drawImage(r.domElement, 0, 0);
  }
}
const PIVOT_BASE = new THREE.Vector3(0, 0.36, 0);
const _sz = new THREE.Vector2();

/**
 * Mount a live talking 3D Reynard into `el` (fills it; give `el` a size).
 * Returns null when WebGL is unavailable, so callers can keep their pixel portrait.
 * @param {HTMLElement} el
 * @param {{ outfit?: string, size?: number, game?: object, pixelScale?: number, turn?: number }} opts
 */
export function createFoxTalk(el, opts = {}) {
  if (!el || !pool()) return null;
  let inst;
  try { inst = new FoxTalk(el, opts); } catch (e) { console.warn('FoxTalk3D failed', e); return null; }
  return {
    setExpression: (name, o) => { inst.setExpression(name, o); },
    talk: (text, o) => inst.talk(text, o),
    stopTalk: () => { inst.stopTalk(); },
    setOutfit: (name) => { inst.setOutfit(name); },
    fx: (kind) => { inst.fx(kind); },
    bounce: () => { inst.bounce(); },
    dispose: () => inst.dispose(),
    get rig() { return inst.rig; },
    get expression() { return inst._expr; },
    get el() { return inst.wrap; },
  };
}

if (typeof window !== 'undefined') window.__foxTalkStep = stepFoxTalks;

export default createFoxTalk;
