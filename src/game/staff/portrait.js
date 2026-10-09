// [v26 staff] Live 3D portraits of staff beavers for the UI (interview resumes,
// staff cards, the rescue card) + cached static snapshots for the roster.
// Same approach as src/ui/NpcTalk3D.js: one shared offscreen WebGLRenderer, the
// rig rendered small with an ink outline and copied into a 2D canvas shown at an
// exact integer number of device pixels per rendered pixel (crisp at any DPR).
//
//   const p = createBeaverPortrait(el, { profile, outfit, anim: 'idle', frame: 'bust'|'full', turn })
//   p.play(anim) / p.talk(text) / p.mood(expr) / p.dispose()
//   beaverSnapshot(profile, { w, h, outfit, anim, frame }) -> <canvas> (cached)
import * as THREE from 'three';

const rigMods = import.meta.glob('../../entities/beaverChibi.js', { eager: true });
const RIG = rigMods['../../entities/beaverChibi.js'] || null;
const FPS = 20;

const POST_VERT = `varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform float cNear; uniform float cFar;
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
    if (z - zn > 0.07) col = mix(col, ink, 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}`;

const POOL = { r: null, failed: false, post: null, scene: null, cam: null, insts: new Set(), raf: 0, last: 0, acc: 0 };
function pool() {
  if (POOL.r) return POOL;
  if (POOL.failed || typeof document === 'undefined') return null;
  try {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true });
    if (!r.getContext()) throw new Error('no gl');
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, tDepth: { value: null }, size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x1c0f0a) }, cNear: { value: 0.1 }, cFar: { value: 30 } },
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    POOL.post = new THREE.Mesh(g, mat); POOL.post.frustumCulled = false;
    POOL.scene = new THREE.Scene(); POOL.scene.add(POOL.post);
    POOL.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    r.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    POOL.r = r;
    return POOL;
  } catch (e) {
    console.warn('beaver portrait: WebGL unavailable', e);
    POOL.failed = true;
    return null;
  }
}
function release() {
  if (POOL.insts.size || !POOL.r || POOL.keep) return;
  clearTimeout(POOL.relT);
  POOL.relT = setTimeout(() => {
    if (POOL.insts.size || !POOL.r || POOL.keep) return;
    cancelAnimationFrame(POOL.raf); POOL.raf = 0;
    POOL.post.geometry.dispose(); POOL.post.material.dispose();
    POOL.r.dispose(); POOL.r.forceContextLoss?.(); POOL.r = null;
  }, 5000);
}
function loop() {
  if (POOL.raf || typeof requestAnimationFrame === 'undefined') return;
  POOL.last = performance.now();
  const tick = (now) => {
    POOL.raf = 0;
    if (!POOL.insts.size) return;
    const dt = Math.min(0.1, Math.max(0, (now - POOL.last) / 1000));
    POOL.last = now; POOL.acc += dt;
    if (POOL.acc >= 1 / FPS - 0.004) { stepBeaverPortraits(Math.min(0.1, POOL.acc)); POOL.acc = 0; }
    POOL.raf = requestAnimationFrame(tick);
  };
  POOL.raf = requestAnimationFrame(tick);
}
export function stepBeaverPortraits(dt, { force = false } = {}) { for (const i of POOL.insts) i._step(dt, force); }

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe8cc, 0x6a4a7a, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.2); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffc6a0, 0.6); fill.position.set(2.5, 0.4, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd27a, 2.0); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
}
function makeRig(profile, outfit) {
  if (!RIG?.BeaverChibi) return null;
  return new RIG.BeaverChibi({ look: profile?.look || {}, outfit: outfit || 'overalls', seed: profile?.seed || 1, shadows: false });
}
const _sz = new THREE.Vector2();
function renderInto(P, scene, cam, rt, w, h) {
  const r = P.r;
  r.getSize(_sz);
  if (_sz.x < w || _sz.y < h) r.setSize(Math.max(w, _sz.x), Math.max(h, _sz.y), false);
  r.setRenderTarget(rt);
  r.clear();
  r.render(scene, cam);
  r.setRenderTarget(null);
  const U = P.post.material.uniforms;
  U.tColor.value = rt.texture; U.tDepth.value = rt.depthTexture;
  U.size.value.set(w, h); U.cNear.value = cam.near; U.cFar.value = cam.far;
  r.setViewport(0, r.getSize(_sz).y - h, w, h);
  r.setScissorTest(false);
  r.clear();
  r.render(P.scene, P.cam);
  r.setViewport(0, 0, _sz.x, _sz.y);
}
// framing: head-and-shoulders ('bust') or the whole beaver ('full')
function frameCam(cam, frame, aspect) {
  const top = 0.92, head = 0.5;
  let cy, span;
  if (frame === 'full') { span = top * 1.18; cy = top * 0.5; }
  else if (frame === 'half') { span = top * 0.78; cy = top - span / 2 + 0.03; }
  else { span = 0.62; cy = head - 0.02; }
  const fov = (cam.fov * Math.PI) / 180;
  const vis = aspect < 1 ? span / aspect : span;
  const d = vis / 2 / Math.tan(fov / 2);
  cam.position.set(0.02, cy + d * 0.1, d);
  cam.lookAt(0, cy, 0);
  cam.near = Math.max(0.05, d - 2); cam.far = d + 3;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

class Portrait {
  constructor(el, { profile, outfit = 'overalls', anim = 'idle', frame = 'bust', turn = 0.32, ps = 1 } = {}) {
    this.el = el; this.frame = frame; this.ps = ps;
    this.rig = makeRig(profile, outfit);
    if (!this.rig) throw new Error('no beaver rig');
    this.wrap = document.createElement('div');
    this.wrap.className = 'bvp-wrap';
    this.wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    this.cv = document.createElement('canvas');
    this.cv.style.cssText = 'position:absolute;left:50%;bottom:0;display:block;image-rendering:pixelated';
    this.ctx = this.cv.getContext('2d');
    this.wrap.appendChild(this.cv);
    el.appendChild(this.wrap);
    this.scene = new THREE.Scene();
    lights(this.scene);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.pivot.add(this.rig.root);
    this.rig.root.rotation.y = turn;
    this.cam = new THREE.PerspectiveCamera(18, 1, 0.3, 30);
    this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(2, 2);
    this.base = this.rig.anims.includes(anim) ? anim : 'idle';
    this.rig.play(this.base, { fade: 0 });
    this.rig.update(0.3);
    this.talkT = 0; this.hopT = -1; this._chk = 0; this._dead = false;
    if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => { this._key = ''; this._resize(); }); this._ro.observe(this.wrap); }
    this._resize();
    POOL.insts.add(this);
    this._step(0, true);
    loop();
  }
  _resize() {
    const P = pool();
    if (!P) return;
    const w = this.wrap.clientWidth || this.el.clientWidth || 80, h = this.wrap.clientHeight || this.el.clientHeight || 80;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const r = this.wrap.getBoundingClientRect();
    const sc = this.wrap.offsetWidth ? Math.max(0.5, Math.round((r.width / this.wrap.offsetWidth) * 2) / 2) : 1;
    const dev = dpr * sc;
    const k = Math.max(1, Math.round(dev * this.ps));
    const nw = Math.max(16, Math.ceil((w * dev) / k)), nh = Math.max(16, Math.ceil((h * dev) / k));
    const key = `${nw}x${nh}x${k}x${dev}`;
    if (key === this._key) return;
    this._key = key;
    this.nw = nw; this.nh = nh;
    this.cv.width = nw; this.cv.height = nh;
    this.cv.style.width = `${(nw * k) / dev}px`;
    this.cv.style.height = `${(nh * k) / dev}px`;
    this.cv.style.marginLeft = `${-(nw * k) / dev / 2}px`;
    this.rt.setSize(nw, nh);
    this.cam.aspect = nw / nh;
    frameCam(this.cam, this.frame, this.cam.aspect);
  }
  play(name, { loop = false } = {}) {
    if (this._dead || !this.rig.anims.includes(name)) return this;
    this.rig.play(name, { loop, restart: true, fade: 0.2, onDone: loop ? undefined : () => this._back() });
    return this;
  }
  setBase(name) { if (this.rig.anims.includes(name)) { this.base = name; this._back(); } return this; }
  _back() { if (!this._dead) this.rig.play(this.talkT > 0 ? 'talk' : this.base, { loop: true, fade: 0.25 }); }
  talk(text) {
    if (this._dead) return 0;
    const dur = Math.min(6, 0.6 + String(text || '').length * 0.05);
    this.talkT = dur;
    this.rig.play('talk', { loop: true, fade: 0.15 });
    this.hop(0.5);
    return dur;
  }
  mood(name) { try { this.rig.setExpression(name && this.rig.expressions.includes(name) ? name : null); } catch { /* ignore */ } return this; }
  hop(k = 1) { this.hopT = 0; this.hopK = k; return this; }
  setOutfit(o) { this.rig.setOutfit?.(o); return this; }
  _step(dt, force) {
    if (this._dead) return;
    if (++this._chk % 8 === 1 || force) {
      const w = this.wrap;
      let on = w.isConnected && w.offsetParent !== null;
      if (on) { const r = w.getBoundingClientRect(); on = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; }
      this._on = on;
      if (on && this._chk % 24 === 1) this._resize();
    }
    if (!force && !this._on) return;
    if (this.talkT > 0) { this.talkT -= dt; if (this.talkT <= 0 && this.rig.current === 'talk') this.rig.play(this.base, { loop: true, fade: 0.3 }); }
    let y = 0, sy = 1;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const u = this.hopT / 0.36;
      if (u >= 1) this.hopT = -1;
      else { y = Math.sin(u * Math.PI) * 0.03 * this.hopK; sy = 1 + Math.sin(u * Math.PI * 2) * 0.04 * this.hopK; }
    }
    this.pivot.position.y = y;
    this.pivot.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.rig.update(dt);
    const P = pool();
    if (!P) return;
    renderInto(P, this.scene, this.cam, this.rt, this.nw, this.nh);
    this.ctx.clearRect(0, 0, this.nw, this.nh);
    this.ctx.drawImage(P.r.domElement, 0, 0, this.nw, this.nh, 0, 0, this.nw, this.nh);
  }
  dispose() {
    if (this._dead) return;
    this._dead = true;
    POOL.insts.delete(this);
    this._ro?.disconnect();
    try { this.rig.dispose(); } catch { /* ignore */ }
    this.rt.depthTexture.dispose(); this.rt.dispose();
    this.wrap.remove();
    release();
  }
}

/** Mount a live 3D portrait of a beaver profile into `el` (give el a size + position). Null without WebGL. */
export function createBeaverPortrait(el, opts = {}) {
  if (!el || !pool() || !RIG?.BeaverChibi) return null;
  let i;
  try { i = new Portrait(el, opts); } catch (e) { console.warn('beaver portrait', e); release(); return null; }
  return {
    play: (n, o) => { i.play(n, o); }, talk: (t) => i.talk(t), mood: (n) => { i.mood(n); }, hop: (k) => { i.hop(k); },
    setBase: (n) => { i.setBase(n); }, setOutfit: (o) => { i.setOutfit(o); }, dispose: () => i.dispose(),
    get rig() { return i.rig; }, get canvas() { return i.cv; },
  };
}

const SNAP = new Map();
/** One static, outlined render of a beaver (cached by look + outfit + size). */
export function beaverSnapshot(profile, { w = 48, h = 48, outfit = 'overalls', anim = 'idle', frame = 'bust', turn = 0.32, t = 0.6 } = {}) {
  const key = `${profile?.seed}:${JSON.stringify(profile?.look || {})}:${outfit}:${w}x${h}:${frame}:${anim}`;
  if (SNAP.has(key)) return SNAP.get(key);
  const P = pool();
  if (!P || !RIG?.BeaverChibi) return null;
  let out = null;
  POOL.keep = true;
  try {
    const rig = makeRig(profile, outfit);
    const scene = new THREE.Scene(); lights(scene);
    scene.add(rig.root);
    rig.root.rotation.y = turn;
    if (rig.anims.includes(anim)) rig.play(anim, { fade: 0 });
    rig.update(t);
    const cam = new THREE.PerspectiveCamera(18, w / h, 0.3, 30);
    frameCam(cam, frame, w / h);
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    renderInto(P, scene, cam, rt, w, h);
    out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(P.r.domElement, 0, 0, w, h, 0, 0, w, h);
    out.style.imageRendering = 'pixelated';
    rt.depthTexture.dispose(); rt.dispose();
    rig.dispose();
  } catch (e) { console.warn('beaverSnapshot', e); out = null; }
  POOL.keep = false;
  release();
  if (SNAP.size > 200) SNAP.clear();
  SNAP.set(key, out);
  return out;
}

if (typeof window !== 'undefined') window.__beaverPortraitStep = stepBeaverPortraits;
