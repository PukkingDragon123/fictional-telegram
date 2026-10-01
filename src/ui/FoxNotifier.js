// FoxNotifier: Reynard climbs up into the bottom-right corner of the screen, peeks
// over the edge, says the thing, then climbs back down. Replaces toasts.
//
//   const fox = new FoxNotifier(document.body, { sfx: audio, babble: audio.babble });
//   await fox.show({ mood: 'no', dur: 4 });           // resolves once he's peeking
//   bubbles.say(() => fox.anchor(), 'Nope! Need beavers first.');
//   fox.talk('Nope! Need beavers first.');            // lip-flap + babble for the line
//   fox.hide();                                       // optional: auto-hides after `dur`
//
// - Owns a small transparent WebGL canvas fixed at the bottom-right (240 CSS px, 170 on
//   phones). Its bottom edge is the "screen edge" he holds on to. Pointer events are off
//   except on a hit box over the fox: clicking him sends him away early.
// - Renders at 1/pixelScale resolution into a render target, adds a 1px ink outline and
//   upscales nearest-neighbour (image-rendering: pixelated).
// - Self-driven: runs its own requestAnimationFrame loop only while he is visible or
//   animating, and renders nothing while hidden. Pass { autoUpdate: false } to drive it
//   from the game loop with update(dt) instead (update is then a no-op while hidden).
// - Queue-friendly: show() while he is already up only switches the mood pose; show()
//   while he climbs down makes him climb straight back up.
// - Nothing is built until the first show().
import * as THREE from 'three';
import { FoxRig, FOX_PEEK_EDGE, FOX_PEEK_REACH } from '../entities/foxRig.js';

const MOODS = {
  info: { anim: 'peek_idle', talk: 'peek_talk', expr: null },
  happy: { anim: 'peek_idle', talk: 'peek_talk', expr: 'happy' },
  no: { anim: 'peek_no', talk: null, expr: null },
  warn: { anim: 'peek_warn', talk: null, expr: null },
  excited: { anim: 'peek_excited', talk: null, expr: null },
};
export const FOX_NOTIFIER_MOODS = Object.keys(MOODS);

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
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

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class FoxNotifier {
  /**
   * @param {HTMLElement} container  element the fixed overlay is appended to (default document.body)
   * @param {object} opts
   *   sfx         audio object with play(name, opts) (or a function (name, opts))
   *   babble      (voice, text, opts) -> seconds; defaults to sfx.babble when present
   *   size        CSS px of the square canvas (default 240, phoneSize below 600px viewport width)
   *   pixelScale  CSS px per rendered pixel (default 2)
   *   zIndex      overlay z-index (default 60)
   *   right       gap from the right viewport edge in CSS px (default 4)
   *   autoUpdate  self-driven rAF loop (default true)
   */
  constructor(container = document.body, { sfx = null, babble = null, size = 240, phoneSize = 170, pixelScale = 2, zIndex = 60, right = 4, autoUpdate = true } = {}) {
    this.container = container || document.body;
    this.sfx = sfx;
    this.babble = babble || (sfx && typeof sfx.babble === 'function' ? sfx.babble.bind(sfx) : null);
    this.opts = { size, phoneSize, pixelScale, zIndex, right };
    this.autoUpdate = autoUpdate;
    this.state = 'hidden'; // hidden | climbing | up | leaving
    this.mood = 'info';
    this._dur = 4; this._hideT = Infinity; this._talkT = 0; this._pendingTalk = null;
    this._built = false;
    this._raf = 0; this._last = 0;
    this._anchor = { x: 0, y: 0, init: false };
    this._upWaiters = []; this._downWaiters = [];
    this._tick = this._tick.bind(this);
    this._onResize = () => this._resize();
  }

  get visible() { return this.state !== 'hidden'; }

  // ---------------------------------------------------------------- public API
  /** Climb up (or switch pose if already up). Resolves when he's in place. */
  show({ mood = 'info', dur = 4 } = {}) {
    this._build();
    this.mood = MOODS[mood] ? mood : 'info';
    this._dur = dur;
    this._hideT = dur > 0 ? dur : Infinity;
    if (this._talkT > 0) this._hideT = Math.max(this._hideT, this._talkT + 1.2);
    if (this.state === 'up') { this._applyMood(); return Promise.resolve(); }
    const p = new Promise((res) => this._upWaiters.push(res));
    if (this.state === 'climbing') return p;
    const from = this.state;
    this.state = 'climbing';
    this.wrap.style.display = 'block';
    this.hit.style.pointerEvents = 'auto';
    this.rig.setExpression(null);
    this.rig.play('climb_up', {
      fade: from === 'leaving' ? 0.2 : 0,
      restart: true,
      onDone: () => {
        if (this.state !== 'climbing') return;
        this.state = 'up';
        if (this._pendingTalk) { const t = this._pendingTalk; this._pendingTalk = null; this.talk(t.text, t.opts); }
        this._applyMood();
        const w = this._upWaiters; this._upWaiters = [];
        w.forEach((r) => r());
      },
    });
    this._start();
    return p;
  }

  /** Lip-flap (+ babble) for `text`; info/happy moods gesture with peek_talk meanwhile. Returns seconds. */
  talk(text, opts = {}) {
    if (!text) return 0;
    this._build();
    const cps = opts.cps || 16;
    let d = this.rig.talk(String(text), { cps });
    if (this.state === 'climbing') {
      // start once he's up, so the mouth doesn't move mid-climb
      this.rig.stopTalking();
      this._pendingTalk = { text, opts };
      return d;
    }
    if (this.babble) {
      try { d = Math.max(d, +this.babble('fox', String(text), { cps, ...(opts.babble || {}) }) || 0); } catch (e) { /* audio is optional */ }
    }
    this._talkT = d;
    this._hideT = Math.max(this._hideT, d + 1.2);
    if (this.state === 'up') this._applyMood();
    return d;
  }

  /** Climb down. { wave: true } waves goodbye first. Resolves when he's gone. */
  hide({ wave = false } = {}) {
    if (this.state === 'hidden') return Promise.resolve();
    const p = new Promise((res) => this._downWaiters.push(res));
    if (this.state === 'leaving') return p;
    const wasUp = this.state === 'up';
    this.state = 'leaving';
    this.hit.style.pointerEvents = 'none';
    this._pendingTalk = null;
    this._talkT = 0;
    this.rig.stopTalking();
    this.rig.setExpression(null);
    const w = this._upWaiters; this._upWaiters = [];
    w.forEach((r) => r());
    const down = () => {
      if (this.state !== 'leaving') return;
      this.rig.play('climb_down', {
        fade: 0.18,
        onDone: () => {
          if (this.state !== 'leaving') return;
          this.state = 'hidden';
          this.wrap.style.display = 'none';
          const d = this._downWaiters; this._downWaiters = [];
          d.forEach((r) => r());
        },
      });
    };
    if (wave && wasUp) this.rig.play('wave_bye', { fade: 0.2, onDone: down });
    else down();
    this._start();
    return p;
  }

  /** CSS-pixel viewport point just above his head (for the game's speech bubble). */
  anchor() {
    if (!this._built) {
      const s = this._cssSize();
      return { x: window.innerWidth - this.opts.right - s / 2, y: window.innerHeight - s * 0.8 };
    }
    if (!this._anchor.init) this._measureAnchor(1);
    return { x: this._anchor.x, y: this._anchor.y };
  }

  /** Advance + render. Called by the internal rAF loop unless autoUpdate is false. */
  update(dt) {
    if (!this._built || this.state === 'hidden') return;
    dt = clamp(dt || 0, 0, 0.1);
    if (this.state === 'up') {
      if (this._talkT > 0) {
        this._talkT -= dt;
        if (this._talkT <= 0) { this._talkT = 0; this._applyMood(); }
      }
      this._hideT -= dt;
      if (this._hideT <= 0) this.hide({ wave: true });
    }
    this.rig.update(dt);
    this._measureAnchor(1 - Math.exp(-dt * 12));
    if (!this._skipRender) this._render();
  }

  dispose() {
    cancelAnimationFrame(this._raf); this._raf = 0;
    window.removeEventListener('resize', this._onResize);
    if (!this._built) return;
    this.rig.dispose();
    this.rt.dispose(); this.rt.depthTexture.dispose();
    this.post.material.dispose(); this.post.geometry.dispose();
    this.renderer.dispose();
    this.wrap.remove();
    this._built = false;
  }

  // ---------------------------------------------------------------- internals
  _applyMood() {
    const m = MOODS[this.mood] || MOODS.info;
    const anim = this._talkT > 0 && m.talk ? m.talk : m.anim;
    this.rig.play(anim, { fade: 0.28 });
    this.rig.setExpression(m.expr);
  }

  _sfx(name, o) {
    const s = this.sfx;
    try { if (typeof s === 'function') s(name, o); else if (s && s.play) s.play(name, o); } catch (e) { /* optional */ }
  }

  _cssSize() { return window.innerWidth < 600 ? this.opts.phoneSize : this.opts.size; }

  _build() {
    if (this._built) return;
    this._built = true;
    const { zIndex, right } = this.opts;
    // DOM
    const wrap = (this.wrap = document.createElement('div'));
    wrap.className = 'fox-notifier';
    Object.assign(wrap.style, { position: 'fixed', right: right + 'px', bottom: '0px', pointerEvents: 'none', zIndex: String(zIndex), display: 'none' });
    const renderer = (this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }));
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    const cv = (this.canvas = renderer.domElement);
    Object.assign(cv.style, { display: 'block', imageRendering: 'pixelated', pointerEvents: 'none' });
    wrap.appendChild(cv);
    const hit = (this.hit = document.createElement('div'));
    Object.assign(hit.style, { position: 'absolute', left: '24%', width: '52%', top: '28%', bottom: '0', pointerEvents: 'none', cursor: 'pointer' });
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      if (this.state === 'up' || this.state === 'climbing') { this._sfx('click', { volume: 0.3, pitch: 1.3 }); this.hide(); }
    });
    wrap.appendChild(hit);
    this.container.appendChild(wrap);

    // scene
    const scene = (this.scene = new THREE.Scene());
    scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.3);
    key.position.set(-1.6, 2.6, 3.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffc6a0, 0.55);
    fill.position.set(2.5, 0.4, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd27a, 2.6); // warm golden rim from behind-right
    rim.position.set(2.4, 1.8, -2.6);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff9fd0, 1.4); // pink rim from behind-left
    rim2.position.set(-2.6, 1.2, -2.2);
    scene.add(rim2);

    const rig = (this.rig = new FoxRig({ shadows: false }));
    rig.root.position.set(0, -FOX_PEEK_EDGE, 0);
    rig.root.rotation.y = -0.2; // turned a little toward the play field
    scene.add(rig.root);
    rig.play('climb_down', { fade: 0 });
    rig.update(1.2); // start fully hidden
    rig.onEvent = (n) => {
      if (n === 'grab') this._sfx('plop', { volume: 0.22, pitch: 1.5 + Math.random() * 0.2 });
      else if (n === 'peek') this._sfx('bubble', { volume: 0.3, pitch: 1.25 });
      else if (n === 'slip') this._sfx('jump', { volume: 0.18, pitch: 0.75 });
    };

    const cam = (this.camera = new THREE.PerspectiveCamera(21, 1, 0.5, 20));
    // The canvas bottom ray grazes the paws on the edge; the camera sits a bit lower than his eyes.
    const E = new THREE.Vector3(0, -0.15, FOX_PEEK_REACH + 0.05);
    const dist = 4.6, up = 0.5;
    cam.position.set(0.02, up, E.z + dist);
    const pitch = THREE.MathUtils.degToRad(cam.fov / 2) + Math.atan2(E.y - up, dist);
    cam.rotation.set(pitch, 0, 0);
    cam.updateMatrixWorld();
    rig.lookAt(cam.position);

    // post (outline + upscale)
    this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x2b1631) },
        cNear: { value: cam.near }, cFar: { value: cam.far },
      },
      depthTest: false, depthWrite: false, transparent: false,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.post = new THREE.Mesh(g, mat);
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    if (!this._built) return;
    const css = this._cssSize();
    const n = Math.max(32, Math.round(css / this.opts.pixelScale));
    this._css = css;
    this.canvas.style.width = css + 'px';
    this.canvas.style.height = css + 'px';
    this.wrap.style.width = css + 'px';
    this.wrap.style.height = css + 'px';
    this.renderer.setSize(n, n, false);
    this.rt.setSize(n, n);
    this.post.material.uniforms.size.value.set(n, n);
    this._anchor.init = false;
  }

  _measureAnchor(k) {
    const v = this.rig.headTop(_tmp);
    v.y += 0.06;
    v.project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    const w = r.width || this._css, h = r.height || this._css;
    const left = r.width ? r.left : window.innerWidth - this.opts.right - w;
    const top = r.height ? r.top : window.innerHeight - h;
    const x = left + (v.x * 0.5 + 0.5) * w;
    const y = top + (0.5 - v.y * 0.5) * h;
    const A = this._anchor;
    if (!A.init || this.state === 'climbing' && k >= 1) { A.x = x; A.y = y; A.init = true; return; }
    A.x += (x - A.x) * k; A.y += (y - A.y) * k;
  }

  _render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }

  _start() {
    if (!this.autoUpdate || this._raf) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    this._raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this.update(dt);
    if (this.state !== 'hidden') this._raf = requestAnimationFrame(this._tick);
  }
}

const _tmp = new THREE.Vector3();

export default FoxNotifier;
