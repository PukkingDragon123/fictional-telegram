// NpcTalk3D: live 3D portraits of the neighbours for every UI panel (villager
// card, Pip's lumber counter, Chip's workshop, zone banner, cutscene corners).
// The real rig (critters3d.js CAST class) is rendered small with an ink outline
// and copied into a 2D canvas that is shown at an exact integer number of DEVICE
// pixels per rendered pixel (image-rendering: pixelated), so it stays crisp at any
// DPR and inside integer-scaled pixel stages.
//
//   import { createNpcTalk, npcSnapshot, NPC_RIGS } from './NpcTalk3D.js';
//   const t = createNpcTalk(el, { npc: 'pip', frame: 'bust', ps: 1 });  // null without WebGL
//     frame  'bust' (head + shoulders) | 'half' (to the waist) | 'full'
//     scale  CSS transform scale of the ancestors (e.g. a pixel stage scaled by u) so the
//            device-pixel snap is exact; default 'auto' (measured, re-checked ~1.5 x a second)
//     ps     wanted CSS px (before `scale`) per rendered pixel; default 1 (chunkier: 2)
//     turn   yaw of the rig (radians, + = towards the viewer's left)
//   t.talk(text)          talk anim + mouth for the length of the line
//   t.play(anim, {loop})  any rig anim (falls back to idle when unknown)
//   t.mood(name)          rig expression (unknown names are ignored), null = auto
//   t.hop()               little squash-hop
//   t.dispose()
//   npcSnapshot(npc, { w, h, frame }) -> HTMLCanvasElement (one static render, w x h px)
//
// One shared offscreen WebGLRenderer for all portraits, one ~30 fps loop; portraits
// off screen (IntersectionObserver) pause.
import * as THREE from 'three';
import * as C3 from '../entities/critters3d.js';

export const NPC_RIGS = {
  dale: 'DeerGuy', granny: 'FrogGranny', hoot: 'OwlRanger', rocco: 'RaccoonMerchant', shellby: 'TurtleElder',
  clover: 'BunnyGardener', otis: 'OtterFisher', pip: 'ChipmunkTrader', chip: 'WoodpeckerCarpenter', hazel: 'HedgehogBaker',
  flint: 'BadgerProspector', // [F&S mining]
  longneck: 'LongneckElder', // [v26 turtle]
};
const FPS = 30;

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
    if (z - zn > 0.09) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}`;

const POOL = { r: null, failed: false, post: null, scene: null, cam: null, insts: new Set(), raf: 0, last: 0, acc: 0 };
function pool() {
  if (POOL.r) return POOL;
  if (POOL.failed || typeof document === 'undefined') return null;
  try {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
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
    console.warn('NpcTalk3D: WebGL unavailable', e);
    POOL.failed = true;
    return null;
  }
}
// the shared context lingers a few seconds, so closing one panel and opening the next
// (or a burst of snapshots) doesn't rebuild it
function release() {
  if (POOL.insts.size || !POOL.r || POOL.keep) return;
  clearTimeout(POOL.relT);
  POOL.relT = setTimeout(releaseNow, 4000);
}
function releaseNow() {
  if (POOL.insts.size || !POOL.r || POOL.keep) return;
  cancelAnimationFrame(POOL.raf); POOL.raf = 0;
  POOL.post.geometry.dispose(); POOL.post.material.dispose();
  POOL.r.dispose(); POOL.r.forceContextLoss?.(); POOL.r = null;
}
function loop() {
  if (POOL.raf || typeof requestAnimationFrame === 'undefined') return;
  POOL.last = performance.now();
  const tick = (now) => {
    POOL.raf = 0;
    if (!POOL.insts.size) return;
    const dt = Math.min(0.1, Math.max(0, (now - POOL.last) / 1000));
    POOL.last = now; POOL.acc += dt;
    if (POOL.acc >= 1 / FPS - 0.004) { stepNpcTalks(Math.min(0.1, POOL.acc)); POOL.acc = 0; }
    POOL.raf = requestAnimationFrame(tick);
  };
  POOL.raf = requestAnimationFrame(tick);
}
/** Advance + render every visible portrait (the shared loop calls this; tests may too). */
export function stepNpcTalks(dt, { force = false } = {}) { for (const i of POOL.insts) i._step(dt, force); }
export function npcTalkSupported() { return !!pool(); }

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.ntk { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.ntk canvas { position: absolute; left: 50%; bottom: 0; display: block; image-rendering: pixelated; image-rendering: crisp-edges; transform-origin: 50% 100%; }
`;
  document.head.appendChild(s);
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe8cc, 0x6a4a7a, 1.45));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.2); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffc6a0, 0.6); fill.position.set(2.5, 0.4, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd27a, 2.2); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
}

function makeRig(npc) {
  const Cls = C3[NPC_RIGS[npc]];
  if (!Cls) return null;
  const rig = new Cls({ shadows: false });
  rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return rig;
}
const hasAnim = (r, n) => !!r?.anims?.includes?.(n);
const _b = new THREE.Box3(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// per-rig framing tweaks: bust height multiplier, vertical nudge (in head heights)
// bust: k = share of the full height shown (from the top of the hat / ears down), dy = shift in body heights
const TWEAK = { hoot: { k: 0.7 }, rocco: { k: 0.66, dy: -0.1 }, shellby: { k: 0.74, dy: -0.04 }, clover: { k: 0.78 }, pip: { k: 0.72 } };
TWEAK.longneck = { head: 1.9, dy: -0.12 }; // [v26 turtle] bust framed on the head box itself (his head sits out in front on a long neck)

class NpcTalk {
  constructor(el, { npc, frame = 'bust', scale = 'auto', ps = 1, turn = 0.28, anim = 'idle', cover = false } = {}) {
    css();
    this.el = el; this.npc = npc; this.frame = frame; this.ps = ps; this.cover = cover;
    this.autoScale = scale === 'auto' || scale == null;
    this.scale = this.autoScale ? 1 : scale;
    this._chk = 0;
    this.rig = makeRig(npc);
    if (!this.rig) throw new Error('no rig for ' + npc);
    this.wrap = document.createElement('div');
    this.wrap.className = 'ntk';
    this.wrap.__ntk = this; // debug / tests
    this.cv = document.createElement('canvas');
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
    this.talkT = 0; this.base = hasAnim(this.rig, anim) ? anim : 'idle'; this.hopT = -1;
    this.rig.play(this.base, { fade: 0, loop: true });
    this.rig.update(0.4);
    this._measure();
    this._onscreen = true; this._dead = false;
    if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this.wrap); }
    this._resize();
    POOL.insts.add(this);
    this._step(0, true);
    loop();
  }

  // head box (idle pose) -> bust framing; whole body -> full framing
  _measure() {
    const r = this.rig;
    r.root.updateMatrixWorld(true);
    _b.makeEmpty();
    if (r.headMesh) _b.expandByObject(r.headMesh); // the skull only: ears / hats would zoom us out
    else (r.head || r.root).traverse((o) => { if (o.isMesh && o.visible) _b.expandByObject(o); });
    if (_b.isEmpty()) _b.setFromObject(r.root);
    _b.getCenter(_v); _b.getSize(_s);
    this.headC = _v.clone();
    this.headH = Math.max(0.12, _s.y);
    _b.setFromObject(r.root);
    this.bodyTop = _b.max.y;
    this.headTop = Math.max(this.headC.y + this.headH / 2, this.bodyTop);
  }

  _resize() {
    const P = pool();
    if (!P) return;
    const w = this.wrap.clientWidth || this.el.clientWidth || 96, h = this.wrap.clientHeight || this.el.clientHeight || 96;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    if (this.autoScale) this.scale = this._ancestorScale();
    const dev = dpr * this.scale; // device px per CSS px
    const k = Math.max(1, Math.round(dev * this.ps)); // device px per rendered px (integer -> crisp)
    // round UP so the portrait always fills its box (the clip hides a sliver)
    const nw = Math.max(16, Math.ceil((w * dev) / k)), nh = Math.max(16, Math.ceil((h * dev) / k));
    const key = `${nw}x${nh}x${k}x${dev}`;
    if (key === this._key) return;
    this._key = key;
    this.nw = nw; this.nh = nh;
    this.cv.width = nw; this.cv.height = nh;
    // exact CSS size = n * k device px
    this.cv.style.width = `${(nw * k) / dev}px`;
    this.cv.style.height = `${(nh * k) / dev}px`;
    this.cv.style.marginLeft = `${-(nw * k) / dev / 2}px`;
    this.rt.setSize(nw, nh);
    this.cam.aspect = nw / nh;
    this._frameCam();
  }

  // CSS transform scale applied by ancestors (pixel stages scaled by an integer); snapped so
  // rotations / mid-animation frames don't produce odd scales
  _ancestorScale() {
    const w = this.wrap.offsetWidth;
    if (!w) return this.scale || 1;
    const r = this.wrap.getBoundingClientRect().width / w;
    const k = Math.round(r * 2) / 2;
    return Math.max(0.5, Math.abs(r - Math.round(r)) < 0.12 ? Math.round(r) || 1 : k);
  }

  _frameCam() {
    const c = this.cam, T = TWEAK[this.npc] || {};
    let cy, span, hx = null, hz = 0;
    if (this.frame === 'bust' && T.head) { span = this.headH * T.head; cy = this.headC.y + (T.dy || 0) * this.headH; hx = this.headC.x; hz = this.headC.z; } // [v26 turtle]
    else if (this.frame === 'full') { span = this.headTop * 1.12; cy = this.headTop * 0.5; }
    else if (this.frame === 'half') { span = this.headTop * 0.72; cy = this.headTop * 1.04 - span / 2; } // [v20 npc rigs] chibi: small bodies, so a bit tighter
    else { span = this.headTop * (T.k || 0.74); cy = this.headTop * (1.05 + (T.dy || 0)) - span / 2; }
    // fit the span to the narrower side
    const fov = (c.fov * Math.PI) / 180;
    const vis = c.aspect < 1 ? span / c.aspect : span;
    const d = vis / 2 / Math.tan(fov / 2);
    const cx = hx ?? this.headC.x * 0.5; // [v26 turtle] hx/hz: head-box framing
    c.position.set(cx + 0.02, cy + d * 0.08, hz + d);
    c.lookAt(cx, cy, hz);
    c.near = Math.max(0.05, d - 2); c.far = d + 3;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  talk(text) {
    if (this._dead) return 0;
    const dur = Math.min(6, 0.6 + String(text || '').length * 0.055);
    this.talkT = dur;
    if (hasAnim(this.rig, 'talk') && (this.rig.current === this.base || this.rig.current === 'idle' || this.rig.current === 'talk')) this.rig.play('talk', { loop: true, fade: 0.15 });
    this.hop(0.5);
    return dur;
  }
  stopTalk() { this.talkT = 0.01; }
  play(name, { loop = false } = {}) {
    if (this._dead) return this;
    if (!hasAnim(this.rig, name)) return this;
    this.rig.play(name, { loop, restart: true, fade: 0.2, onDone: loop ? undefined : () => this._back() });
    return this;
  }
  mood(name) { if (this._dead) return this; try { this.rig.setExpression(name && this.rig.expressions.includes(name) ? name : null); } catch { /* ignore */ } return this; }
  hop(k = 1) { this.hopT = 0; this.hopK = k; return this; }
  setBase(name) { if (hasAnim(this.rig, name)) { this.base = name; this._back(); } return this; }
  _back() { if (this._dead) return; this.rig.play(this.talkT > 0 && hasAnim(this.rig, 'talk') ? 'talk' : this.base, { loop: true, fade: 0.3 }); }

  _step(dt, force) {
    if (this._dead) return;
    // on screen? (checked by hand every few frames: entry animations start off screen, panels hide us)
    if (++this._chk % 8 === 1 || force || !this._onscreen) {
      const w = this.wrap;
      let on = w.isConnected && w.offsetParent !== null;
      if (on) { const r = w.getBoundingClientRect(); on = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; }
      this._onscreen = on;
      if (on && this.autoScale && (this._chk % 24 === 1 || !this._seen)) this._resize();
      if (on) this._seen = true; // ancestor transforms change without a resize
    }
    if (!force && !this._onscreen) return;
    if (this.talkT > 0) { this.talkT -= dt; if (this.talkT <= 0 && this.rig.current === 'talk') this.rig.play(this.base, { loop: true, fade: 0.3 }); }
    let y = 0, sy = 1;
    if (this.hopT >= 0) {
      this.hopT += dt;
      const u = this.hopT / 0.36;
      if (u >= 1) this.hopT = -1;
      else { y = Math.sin(u * Math.PI) * 0.035 * this.hopK; sy = 1 + Math.sin(u * Math.PI * 2) * 0.04 * this.hopK; }
    }
    this.pivot.position.y = y;
    this.pivot.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    this.rig.update(dt);
    this._render();
  }

  _render() {
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
  r.setViewport(0, r.getSize(_sz).y - h, w, h); // draw into the top-left w x h corner
  r.setScissorTest(false);
  r.clear();
  r.render(P.scene, P.cam);
  r.setViewport(0, 0, _sz.x, _sz.y);
}

/**
 * Mount a live 3D portrait of neighbour `npc` into `el` (fills it; give `el` a size and position).
 * Returns null when WebGL or the rig is unavailable.
 */
export function createNpcTalk(el, opts = {}) {
  if (!el || !NPC_RIGS[opts.npc] || !pool()) return null;
  let i;
  try { i = new NpcTalk(el, opts); } catch (e) { console.warn('NpcTalk3D', opts.npc, e); release(); return null; }
  return {
    talk: (t) => i.talk(t), stopTalk: () => i.stopTalk(), play: (n, o) => { i.play(n, o); }, mood: (n) => { i.mood(n); },
    hop: (k) => { i.hop(k); }, setBase: (n) => { i.setBase(n); }, dispose: () => i.dispose(),
    resize: () => { i._key = ''; i._resize(); },
    get rig() { return i.rig; }, get el() { return i.wrap; }, get canvas() { return i.cv; },
  };
}

/** One static render (transparent canvas, w x h px, outlined) of a neighbour, for icons / the encyclopedia. */
const SNAP = new Map();
export function npcSnapshot(npc, { w = 40, h = 40, frame = 'bust', turn = 0.28, anim = 'idle', t = 0.6 } = {}) {
  const key = `${npc}:${w}x${h}:${frame}:${anim}`;
  if (SNAP.has(key)) return SNAP.get(key);
  const P = pool();
  if (!P || !NPC_RIGS[npc]) return null;
  let out = null;
  POOL.keep = true;
  try {
    const host = { clientWidth: w, clientHeight: h };
    const fake = Object.create(NpcTalk.prototype);
    Object.assign(fake, { npc, frame, scale: 1, ps: 1, el: host, wrap: host, talkT: 0, hopT: -1 });
    fake.rig = makeRig(npc);
    fake.scene = new THREE.Scene(); lights(fake.scene);
    fake.pivot = new THREE.Group(); fake.scene.add(fake.pivot); fake.pivot.add(fake.rig.root);
    fake.rig.root.rotation.y = turn;
    if (hasAnim(fake.rig, anim)) fake.rig.play(anim, { fade: 0 });
    fake.rig.update(t);
    fake._measure();
    fake.cam = new THREE.PerspectiveCamera(18, w / h, 0.3, 30);
    fake.nw = w; fake.nh = h;
    fake._frameCam();
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    renderInto(P, fake.scene, fake.cam, rt, w, h);
    out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(P.r.domElement, 0, 0, w, h, 0, 0, w, h);
    out.style.imageRendering = 'pixelated';
    rt.depthTexture.dispose(); rt.dispose();
    fake.rig.dispose();
  } catch (e) { console.warn('npcSnapshot', npc, e); out = null; }
  POOL.keep = false;
  release();
  SNAP.set(key, out);
  return out;
}

if (typeof window !== 'undefined') { window.__npcTalkStep = stepNpcTalks; window.__npcTalkPool = POOL; }
export default createNpcTalk;
