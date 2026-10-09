// LabFox (v26): Reynard on the lab computer. The real voxel rig
// (src/entities/foxRig.js) in his lab coat ('scientist'), rendered tiny (72x88 px)
// into ONE small WebGL canvas with a 1px ink outline and upscaled with nearest
// filtering, so he reads as a chunky pixel-art sprite. He hops from node to node
// on the research map (src/ui/LabTree.js): onto what you select or what is being
// researched, points at things, guides you with short lines (what to research
// next and why, how a locked section opens, rush prices, "bench free!"), types on
// a little holo keyboard while a job runs, cheers when it finishes and dozes off
// when nothing happens.
//
//   const fox = new LabFox(tree);   // tree: a LabTree (view, toScreen(), cam, nodes, jobs...)
//   fox.update(dt);                 // every frame; the 3D render runs at ~24 fps
//   fox.onSelect(N) / onSection(S) / onStart(N) / onDone(N) / onRush(N, mode) / onUnlock(S) / onDenied(N, why)
//   fox.hitTest(clientX, clientY) -> bool; fox.poke(); fox.say(text, { expr, ms }); fox.destroy();
//
// The renderer, scene and rig are built on the first lab visit and reused on the next
// ones (they live in POOL); a visit only adds / removes the canvas.
import * as THREE from 'three';
import { FoxRig, FOX_KEYBOARD_Z, FOX_DESK_HEIGHT, FOX_SEAT_SURFACE } from '../entities/foxRig.js';
import * as Guide from './lab/guide.js';

const AW = 72; // art canvas (px)
const AH = 88;
const VIEW_H = 2.05; // world units visible top to bottom
const FPS = 24;
const TINT = 0.0; // 0 = full colour, 1 = green phosphor ramp
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = Guide.pick;

// ------------------------------------------------------------------ shared renderer
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// 1px ink outline + darkened depth creases (like FoxTalk3D), optional phosphor tint
const POST_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 size;
uniform vec3 ink;
uniform float cNear;
uniform float cFar;
uniform float tint;
uniform vec3 g0; uniform vec3 g1; uniform vec3 g2; uniform vec3 g3;
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
    if (tint > 0.0) {
      float l = pow(dot(col, vec3(0.299, 0.587, 0.114)), 0.4545);
      vec3 g = l < 0.2 ? g0 : l < 0.42 ? g1 : l < 0.68 ? g2 : g3;
      col = mix(col, g, tint);
    }
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}
`;

let POOL = null;

function holoKeyboard() {
  const g = new THREE.Group();
  g.name = 'holoKeyboard';
  const c = document.createElement('canvas');
  c.width = 24; c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#0d3a1c'; x.fillRect(0, 0, 24, 8);
  x.fillStyle = '#52e47e';
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) x.fillRect(1 + k * 3 + (r % 2), 1 + r * 2, 2, 1);
  x.fillRect(6, 7, 12, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.17), [
    new THREE.MeshBasicMaterial({ color: 0x1f7d3d }), new THREE.MeshBasicMaterial({ color: 0x1f7d3d }),
    new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ color: 0x0d3a1c }),
    new THREE.MeshBasicMaterial({ color: 0x52e47e }), new THREE.MeshBasicMaterial({ color: 0x1f7d3d }),
  ]);
  g.add(top);
  // a thin glowing stand (it hovers)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: 0x1f7d3d }));
  beam.position.set(0, -0.17, 0);
  g.add(beam);
  g.position.set(0, FOX_DESK_HEIGHT - 0.05, FOX_KEYBOARD_Z + 0.06);
  g.visible = false;
  return g;
}

function pool() {
  if (POOL) return POOL.failed ? null : POOL;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no gl');
    renderer.setPixelRatio(1);
    renderer.setSize(AW, AH, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'lt-foxcv';
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe4c4, 0x5a4a6a, 1.4));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.3); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xc6ffd0, 0.6); fill.position.set(2.5, 0.4, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8effa8, 2.2); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
    const rig = new FoxRig({ shadows: false });
    rig.setOutfit('scientist');
    scene.add(rig.root);
    const kb = holoKeyboard();
    rig.root.add(kb);
    const cam = new THREE.PerspectiveCamera(18, AW / AH, 0.5, 40);
    const rt = new THREE.WebGLRenderTarget(AW, AH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(AW, AH);
    const col = (h) => new THREE.Color(h);
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, size: { value: new THREE.Vector2(AW, AH) },
        ink: { value: new THREE.Color(0x03140a) }, cNear: { value: cam.near }, cFar: { value: cam.far }, tint: { value: TINT },
        g0: { value: col('#03160b') }, g1: { value: col('#1f7d3d') }, g2: { value: col('#52e47e') }, g3: { value: col('#d0ffd8') },
      },
      depthTest: false, depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const post = new THREE.Mesh(geo, mat);
    post.frustumCulled = false;
    const postScene = new THREE.Scene();
    postScene.add(post);
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    POOL = { renderer, scene, rig, kb, cam, rt, post, postScene, postCam, owner: null };
    return POOL;
  } catch (e) {
    console.warn('LabFox: WebGL unavailable, no lab fox', e);
    POOL = { failed: true };
    return null;
  }
}

/** for tests: switch the phosphor tint (0..1) */
export function setLabFoxTint(k) { if (POOL && !POOL.failed) POOL.post.material.uniforms.tint.value = k; }

const _v = new THREE.Vector3();
const CAM_OFF = new THREE.Vector3(0, 1.0, 6.4);
const CAM_LOOK = new THREE.Vector3(0, 0.84, 0);

// ------------------------------------------------------------------ the fox
export class LabFox {
  constructor(tree) {
    this.tree = tree;
    const P = pool();
    if (!P) throw new Error('no WebGL');
    this.P = P;
    if (P.owner && P.owner !== this) { try { P.owner.destroy(); } catch { /* ignore */ } }
    P.owner = this;
    this.rig = P.rig;
    this.alive = true;
    this.t = 0;
    this.acc = 1;
    this.wx = 0; // feet, tree-world px
    this.wy = 0;
    this.at = null; // node he stands on
    this.mode = 'stand'; // stand | type | nap | cheer
    this.hop = null;
    this.pending = null;
    this.idleT = 0;
    this.lastAct = 0;
    this.yaw = 0.3;
    this.yawGoal = 0.3;
    this.squash = { x: 0, v: 0 };
    this.say1 = null; // { text, n, hold, prio }
    this._typeT = 0;
    this._wanderT = rnd(12, 18);
    this.visible = false;
    // DOM: the canvas inside a positioned wrapper + the speech line
    const el = (this.el = document.createElement('div'));
    el.className = 'lt-fox';
    el.appendChild(P.renderer.domElement);
    const bub = (this.bub = document.createElement('div'));
    bub.className = 'lt-say';
    bub.hidden = true;
    tree.view.appendChild(el);
    tree.view.appendChild(bub);
    // rig: lab coat, idle, no leftovers from the last visit
    const rig = this.rig;
    rig.setOutfit('scientist');
    rig.holdProp?.(null);
    rig.setAim?.(null);
    rig.lookAt(null);
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, this.yaw, 0);
    rig.root.scale.set(1, 1, 1);
    rig.play('idle', { fade: 0 });
    rig.setExpression(null);
    P.kb.visible = false;
    rig.onEvent = (name) => this._rigEvent(name);
    this._frame();
    this._scale();
    // arrival: drop in from the top onto whatever is worth talking about
    const g = Guide.greeting(tree);
    const N = g.at || tree.sel || tree.nodes[0];
    if (N) {
      const [x, y] = this._spot(N);
      this.wx = x; this.wy = y;
      this._drop(N, () => {
        this.rig.play('wave_hello', { loop: false, onDone: () => this._base() });
        this.say(g.line, { expr: 'smug', prio: 2 });
        if (g.sec) this.tree._dirty = true;
      });
    }
    this.update(0);
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    this.el.remove();
    this.bub.remove();
    if (this.P.owner === this) this.P.owner = null;
    this.rig.onEvent = null;
    this.rig.stopTalking?.();
  }

  // ---------------------------------------------------------------- geometry
  // where to stand on a node: its top edge, near the right end (the name stays readable)
  _spot(N) { return [N.x + N.w - 30, N.y]; }

  // camera follows the rig root; the feet project to a fixed art pixel (ax, ay)
  _frame() {
    const P = this.P, cam = P.cam, r = this.rig.root.position;
    cam.position.set(r.x + CAM_OFF.x, r.y + CAM_OFF.y, r.z + CAM_OFF.z);
    // fit VIEW_H vertically
    cam.fov = (2 * Math.atan((VIEW_H / 2) / CAM_OFF.z) * 180) / Math.PI;
    cam.updateProjectionMatrix();
    cam.lookAt(r.x + CAM_LOOK.x, r.y + CAM_LOOK.y, r.z + CAM_LOOK.z);
    cam.updateMatrixWorld();
    _v.copy(r).project(cam);
    this.ax = (_v.x * 0.5 + 0.5) * AW;
    this.ay = (0.5 - _v.y * 0.5) * AH;
    _v.set(r.x, r.y + 1, r.z).project(cam);
    this.ppu = Math.abs(this.ay - (0.5 - _v.y * 0.5) * AH); // art px per world unit
  }

  // css px per art px: chunky on desktop, 1:1 on phones / far zoom
  _scale() {
    const T = this.tree;
    const z = T.cam.z;
    const s = T._compact ? 1 : z < 0.62 ? 1 : 2;
    if (s !== this.s) {
      this.s = s;
      const cv = this.P.renderer.domElement;
      cv.style.width = AW * s + 'px';
      cv.style.height = AH * s + 'px';
    }
    return s;
  }

  // ---------------------------------------------------------------- API
  say(text, { expr = null, prio = 1, ms = 0 } = {}) {
    if (!text || this.tree.quiet()) return;
    if (this.say1 && this.say1.prio > prio && this.say1.left > 0.8) return;
    const hold = ms ? ms / 1000 : clamp(1.6 + text.length * 0.05, 2.2, 7);
    this.say1 = { text, n: 0, left: hold, prio };
    this.bub.textContent = '';
    this.bub.hidden = false;
    if (this.mode !== 'nap') {
      this.rig.talk(text, { cps: 18 });
      if (expr) this.rig.setExpression(expr, { hold: Math.min(hold, 3) });
    }
    this.tree._sfx('fox');
  }

  onSelect(N) {
    this._touch();
    this._goTo(N, () => {
      const st = this.tree.st(N);
      if (st === 'run') { this._type(N); this.say(Guide.nodeLine(this.tree, N, st), { expr: 'greedy', prio: 2 }); return; }
      this._stand();
      const line = Guide.nodeLine(this.tree, N, st);
      if (st === 'avail') { this._face(1); this._anim('point'); this.say(line, { expr: 'scheming', prio: 2 }); }
      else if (st === 'locked' || st === 'sealed') { this._anim('shrug'); this.say(line, { expr: 'tsk', prio: 2 }); }
      else if (st === 'zone') { this._anim('think'); this.say(line, { expr: 'confused', prio: 2 }); }
      else this.say(line, { expr: 'proud', prio: 2 });
    });
  }

  onSection(S, denied = false) {
    this._touch();
    const N = S.nodes[0];
    const line = Guide.sectionLine(this.tree, S);
    const go = () => {
      this._stand();
      const k = this.tree.secKey(S);
      if (k.canUnlock) { this._face(1); this._anim('point'); this.say(line, { expr: 'greedy', prio: 2 }); }
      else { this._anim(denied ? 'facepalm' : 'shrug'); this.say(line, { expr: denied ? 'angry' : 'tsk', prio: 2 }); }
    };
    if (N) this._goTo(N, go); else go();
  }

  onStart(N) {
    this._touch();
    if (this.mode === 'nap') this._wake();
    this._goTo(N, () => { this._type(N); this.say(pick(Guide.QUIPS.start), { expr: 'scheming', prio: 1 }); });
  }

  onDone(N) {
    this._touch();
    if (this.mode === 'nap') this._wake();
    const cheer = () => {
      this.mode = 'cheer';
      this.P.kb.visible = false;
      this.rig.play('cheer', { loop: false, onDone: () => { if (this.mode === 'cheer') this._stand(); } });
      this.tree._sfx('foxyay');
      this.say(`${pick(Guide.QUIPS.done)} ${N.d.name} is done.`, { expr: 'laugh', prio: 3 });
      // then: a free bench? say so and point at a good next project
      this.tree._later(() => {
        const T = this.tree;
        if (!this.alive || T.jobs.length >= T.slots()) return;
        const B = Guide.bestNext(T);
        if (B) this.say(`${pick(Guide.QUIPS.free)} ${B.d.name} next? ${cap(Guide.whyLine(T, B))}.`, { expr: 'scheming', prio: 2 });
      }, 3200);
    };
    const near = this.at === N || Math.hypot(this.wx - N.x - N.w, this.wy - N.y) < 260;
    if (near) { this._goTo(N, cheer); } else cheer();
  }

  onRush(N, mode) {
    this._touch();
    this._anim('count_coins');
    this.say(pick(mode === 'now' ? Guide.QUIPS.rushnow : Guide.QUIPS.rush), { expr: 'greedy', prio: 2 });
  }

  onUnlock(S) {
    this._touch();
    const N = S.nodes.find((n) => this.tree.st(n) === 'avail') || S.nodes[0];
    const go = () => {
      this.mode = 'cheer';
      this.rig.play('cheer', { loop: false, onDone: () => { if (this.mode === 'cheer') this._stand(); } });
      this.tree._sfx('foxyay');
      this.say(`${pick(Guide.QUIPS.unlock)} ${S.b.name}: ${S.nodes.length} new projects.`, { expr: 'excited', prio: 3 });
    };
    if (N) this._goTo(N, go, { far: true }); else go();
  }

  onDenied(N, why = '') {
    this._touch();
    if (/bench busy/i.test(why)) { this._anim('shrug'); this.say('The bench is busy. Rush the running job, or wait. Your call.', { expr: 'tsk', prio: 2 }); return; }
    if (/coin/i.test(why)) { this._anim('facepalm'); this.say(pick(Guide.QUIPS.denied), { expr: 'sad', prio: 2 }); return; }
    this._anim('shrug');
    this.say(Guide.nodeLine(this.tree, N, this.tree.st(N)), { expr: 'tsk', prio: 2 });
  }

  poke() {
    this._touch();
    if (this.mode === 'nap') { this._wake(); this.say(pick(Guide.QUIPS.wake), { expr: 'embarrassed', prio: 2 }); return; }
    this.squash.v -= 3;
    this._anim(pick(['laugh_evil', 'polish_monocle', 'shrug', 'wave']));
    this.say(pick(Guide.QUIPS.poke), { expr: pick(['smug', 'wink', 'greedy', 'happy']), prio: 2 });
  }

  /** is the client point on the fox? */
  hitTest(cx, cy) {
    if (!this.visible || !this._rect) return false;
    const r = this.tree.view.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top, R = this._rect;
    return x > R.x + R.w * 0.25 && x < R.x + R.w * 0.75 && y > R.y + R.h * 0.12 && y < R.y + R.h * 0.95;
  }

  // ---------------------------------------------------------------- behaviour
  _touch() { this.idleT = 0; this._wanderT = rnd(14, 22); }

  _base() {
    if (this.mode === 'type') this.rig.play('sit_type', { loop: true, fade: 0.2 });
    else if (this.mode === 'nap') this.rig.play('sit_doze', { loop: true, fade: 0.3 });
    else this.rig.play('idle', { loop: true, fade: 0.25 });
  }

  _anim(name) {
    if (this.mode !== 'stand' || this.hop) return;
    if (!this.rig.anims.includes(name)) return;
    this.rig.play(name, { loop: false, fade: 0.15, restart: true, onDone: () => { if (this.mode === 'stand' && !this.hop) this._base(); } });
  }

  _stand() {
    this.mode = 'stand';
    this.P.kb.visible = false;
    this._base();
  }

  _type(N) {
    this.at = N;
    this.mode = 'type';
    this.P.kb.visible = true;
    this.yawGoal = 0.35;
    this.rig.play('sit_type', { loop: true, fade: 0.2 });
  }

  _nap() {
    this.mode = 'nap';
    this.P.kb.visible = true;
    this.yawGoal = 0.3;
    this.rig.play('sit_doze', { loop: true, fade: 0.4 });
    this.rig.setExpression(null);
  }

  _wake() {
    this.mode = 'stand';
    this.P.kb.visible = false;
    this.rig.play('wake_startle', { loop: false, onDone: () => { if (this.mode === 'stand' && !this.hop) this._base(); } });
    this.tree._sfx('fox');
  }

  _face(dir) { this.yawGoal = dir > 0 ? 0.95 : -0.95; }

  // hop over to N (or act right away when already there); `then` runs on landing
  _goTo(N, then, { far = false } = {}) {
    if (!N) { then?.(); return; }
    if (this.hop) { this.pending = { N, then }; return; }
    const [tx, ty] = this._spot(N);
    if (this.at === N && Math.abs(this.wx - tx) < 2 && Math.abs(this.wy - ty) < 2) { this.lastAct = this.t; then?.(); return; }
    if (this.mode === 'nap') this._wake();
    this.P.kb.visible = false;
    this.mode = 'stand';
    const T = this.tree;
    const [sx0, sy0] = T.toScreen(this.wx, this.wy), [sx1, sy1] = T.toScreen(tx, ty);
    const vw = T.view.clientWidth, vh = T.view.clientHeight;
    const off0 = sx0 < -60 || sx0 > vw + 60 || sy0 < -40 || sy0 > vh + 140;
    const d = Math.hypot(sx1 - sx0, sy1 - sy0);
    if (REDUCED) { this.wx = tx; this.wy = ty; this.at = N; then?.(); return; }
    if (off0 || d > 900 || far) { this._drop(N, then); return; }
    const dur = clamp(0.32 + Math.sqrt(d) * 0.018, 0.36, 0.8);
    this.hop = { kind: 'hop', x0: this.wx, y0: this.wy, x1: tx, y1: ty, t: -0.1, T: dur, h: clamp(36 + d * 0.22, 36, 170), N, then };
    if (Math.abs(sx1 - sx0) > 6) this._face(sx1 > sx0 ? 1 : -1);
    this.squash.v -= 2.2; // crouch
    this.rig.play('idle', { loop: true, fade: 0.1 });
  }

  // fall in from above the screen onto N
  _drop(N, then) {
    const [tx, ty] = this._spot(N);
    this.wx = tx; this.wy = ty;
    this.at = null;
    this.mode = 'stand';
    this.P.kb.visible = false;
    const [, sy] = this.tree.toScreen(tx, ty);
    this.hop = { kind: 'drop', x0: tx, y0: ty, x1: tx, y1: ty, t: 0, T: 0.42, h: Math.max(160, sy + 40), N, then };
    this.rig.play('panic', { loop: true, fade: 0.05 });
  }

  _land() {
    const H = this.hop;
    this.hop = null;
    this.wx = H.x1; this.wy = H.y1;
    this.at = H.N;
    this.squash.v -= H.kind === 'drop' ? 4.2 : 3;
    this.tree._sfx('land');
    this.yawGoal = this.yawGoal > 0 ? 0.3 : -0.3;
    this.mode = 'stand';
    this.rig.play('idle', { loop: true, fade: 0.15 });
    this.lastAct = this.t;
    const then = H.then;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this._goTo(p.N, p.then);
      return;
    }
    then?.();
  }

  _brain(dt) {
    const T = this.tree;
    this.idleT += dt;
    if (this.hop || this.mode === 'cheer') return;
    const talking = this.say1 && this.say1.left > 0;
    // a job runs: go type on it
    const jobs = T.jobs;
    if (jobs.length && this.mode !== 'type' && this.idleT > 2.5 && !talking) {
      const j = jobs.find((x) => x.n) || null;
      if (j) { this._goTo(j.n, () => this._type(j.n)); return; }
    }
    if (this.mode === 'type' && this.at && T.st(this.at) !== 'run') {
      // the job he typed on is gone (finished elsewhere / rushed): next one, or stand
      const j = jobs.find((x) => x.n);
      if (j) this._goTo(j.n, () => this._type(j.n)); else this._stand();
      return;
    }
    if (!jobs.length && this.mode === 'stand' && !talking) {
      if (this.idleT > 32) { this._nap(); return; }
      this._wanderT -= dt;
      if (this._wanderT <= 0) {
        this._wanderT = rnd(16, 26);
        const B = Guide.bestNext(T);
        if (B && !T.quiet()) {
          this._goTo(B, () => { this._face(1); this._anim('point'); this.say(`Psst. ${B.d.name}: ${Guide.whyLine(T, B)}.`, { expr: 'scheming', prio: 0 }); });
        } else this._anim(pick(['think', 'polish_monocle', 'yawn']));
      }
    }
  }

  _rigEvent(name) {
    if (name === 'type' || name === 'enter') {
      const t = this.t;
      if (t - this._typeT > 1.6 && this.visible) { this._typeT = t; this.tree._sfx('type'); }
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.alive) return;
    const T = this.tree;
    this.t += dt;
    this._brain(dt);
    // hop / drop
    let offY = 0, lift = 0;
    const H = this.hop;
    if (H) {
      H.t += dt;
      if (H.kind === 'drop') {
        const u = clamp(H.t / H.T, 0, 1);
        offY = -H.h * (1 - u * u);
        lift = (1 - u * u) * 2;
        if (u >= 1) this._land();
      } else if (H.t >= 0) {
        const u = clamp(H.t / H.T, 0, 1);
        const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        this.wx = H.x0 + (H.x1 - H.x0) * e;
        this.wy = H.y0 + (H.y1 - H.y0) * u;
        offY = -Math.sin(u * Math.PI) * H.h;
        lift = Math.sin(u * Math.PI) * 1.2;
        if (!H.launched) { H.launched = true; this.squash.v += 4; this.tree._sfx('hop'); this.rig.play('run', { loop: true, fade: 0.08, speed: 1.4 }); }
        if (u >= 1) this._land();
      }
    }
    // squash & stretch spring
    const sq = this.squash;
    const st = Math.min(dt, 1 / 30);
    for (let k = 0; k < dt - 1e-6; k += st) {
      const h = Math.min(st, dt - k);
      sq.v += (-180 * sq.x - 12 * sq.v) * h;
      sq.x += sq.v * h;
    }
    sq.x = clamp(sq.x, -0.32, 0.32);
    // yaw
    let dy = this.yawGoal - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 9);
    // speech
    const S1 = this.say1;
    if (S1) {
      if (S1.n < S1.text.length) {
        S1.n = Math.min(S1.text.length, S1.n + dt * 48);
        const vis = S1.text.slice(0, Math.ceil(S1.n));
        if (this.bub.textContent !== vis) this.bub.textContent = vis;
      } else S1.left -= dt;
      if (S1.left <= 0) { this.say1 = null; this.bub.hidden = true; }
    }
    // placement on screen
    const s = this._scale();
    const z = T.cam.z;
    const [fx, fy] = T.toScreen(this.wx, this.wy);
    const sitDrop = this.mode === 'type' || this.mode === 'nap' ? FOX_SEAT_SURFACE * this.ppu * s * 0.86 : 0;
    const x = Math.round(fx - this.ax * s), y = Math.round(fy - this.ay * s + offY + sitDrop);
    const vw = T.view.clientWidth, vh = T.view.clientHeight;
    const w = AW * s, h = AH * s;
    const vis = z >= 0.3 && x + w > -20 && x < vw + 20 && y + h > -20 && y < vh + 20;
    if (vis !== this.visible) { this.visible = vis; this.el.style.visibility = vis ? '' : 'hidden'; if (!vis) this.bub.hidden = true; else if (this.say1) this.bub.hidden = false; }
    this._rect = { x, y, w, h };
    if (x !== this._px || y !== this._py) { this._px = x; this._py = y; this.el.style.transform = `translate(${x}px, ${y}px)`; }
    // 3D: the rig root follows the screen motion (in world units) so ears / tail / coat flop
    const rig = this.rig;
    const k3 = 1 / (this.ppu * s);
    rig.root.position.set(fx * k3, (-fy - offY) * k3 + lift * 0.05, 0);
    rig.root.rotation.y = this.yaw;
    const sy = 1 + sq.x, sxz = 1 / Math.sqrt(Math.max(0.4, sy));
    rig.root.scale.set(sxz, sy, sxz);
    // render at ~24 fps (only while on screen)
    this.acc += dt;
    if (this.acc >= 1 / FPS - 0.002) {
      const adt = Math.min(0.12, this.acc);
      this.acc = 0;
      rig.update(adt);
      if (vis) this._render();
    }
    // the speech line sits over his head (or under his feet near the top edge)
    if (vis && this.say1 && !this.bub.hidden) {
      rig.headTop(_v);
      _v.project(this.P.cam);
      const hx = x + (_v.x * 0.5 + 0.5) * AW * s, hy = y + (0.5 - _v.y * 0.5) * AH * s;
      const bw = this.bub.offsetWidth || 200, bh = this.bub.offsetHeight || 40;
      let bx = clamp(hx - bw * 0.35, 6, vw - bw - 6);
      let by = hy - bh - 14;
      const below = by < 6;
      if (below) by = Math.min(vh - bh - 6, y + h + 10);
      bx = Math.round(bx); by = Math.round(by);
      if (bx !== this._bx || by !== this._by || below !== this._bb) {
        this._bx = bx; this._by = by; this._bb = below;
        this.bub.style.transform = `translate(${bx}px, ${by}px)`;
        this.bub.classList.toggle('is-below', below);
        this.bub.style.setProperty('--tail', `${Math.round(clamp(hx - bx - 5, 10, bw - 22))}px`);
      }
    }
  }

  _render() {
    const P = this.P, r = P.renderer;
    this._frame();
    r.setRenderTarget(P.rt);
    r.clear();
    r.render(P.scene, P.cam);
    r.setRenderTarget(null);
    r.clear();
    r.render(P.postScene, P.postCam);
  }
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
