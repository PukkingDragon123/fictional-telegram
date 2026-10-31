// [v30 research] Reynard at his lab computer: the "researching" view of the lab
// computer's detail panel (src/ui/LabTree.js). A tiny 3D diorama: the real fox rig
// (src/entities/foxRig.js) in his lab coat on a chair at a wooden desk, typing
// (`sit_type`) at a beige CRT whose green screen shows the project and its progress,
// a brass desk lamp, a steaming mug, a bubbling flask, papers, a plant and a plank
// wall with a shelf. Little reactions: a coffee sip now and then, scheming, a big
// "MWAHA, arms up" (`sit_laugh`) when the job finishes, a jolt on a rush.
// He never leaves the chair (no walking around the research screen).
//
// Rendered small (2 CSS px per art px) with an ink outline into ONE shared offscreen
// WebGL context, then blown up by a whole number of device px onto a 2D canvas (crisp).
//
//   const wb = new Workbench(canvasEl);   // throws without WebGL
//   wb.fit(cssW, cssH); wb.setJob({ title, art, k }); wb.react('start'|'rush'|'done');
//   wb.update(dt);   // every frame while shown (renders at ~24 fps)
//   wb.destroy();
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FoxRig, FOX_DESK_HEIGHT } from '../../entities/foxRig.js';
import { dpr } from '../uiScale.js';

const FPS = 24;
const CSS_PX = 2; // css px per art px
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const POST_VERT = `varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform float cNear; uniform float cFar;
varying vec2 vUv;
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  float z = Z(vec2(0.0));
  float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
  vec3 col = c.rgb;
  if (z - zn > 0.12) col = mix(col, ink, 0.72);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ voxel-ish props
// boxes: [w, h, d, x, y, z, color, rotY?] -> one merged, vertex-coloured mesh
function boxMesh(list, mat) {
  const geos = [];
  const col = new THREE.Color();
  for (const [w, h, d, x, y, z, c, ry] of list) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    col.set(c);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  for (const g of geos) g.dispose();
  return m;
}

const WOOD = 0x9a6038, WOOD_D = 0x6e4024, WOOD_L = 0xc08050, PLANK = [0x7a4a2a, 0x845230, 0x70442a, 0x8a5634];
const BEIGE = 0xe0d4b4, BEIGE_D = 0xb8aa88, BRASS = 0xd8a040, BRASS_D = 0x9a6a20;

function buildRoom(mat) {
  const L = [];
  const DY = FOX_DESK_HEIGHT; // 0.8
  // floor (warm boards) + back wall planks + a shelf
  L.push([5, 0.06, 4, 0.3, -0.03, 0.2, 0x5c3a24]);
  for (let i = 0; i < 9; i++) L.push([0.06, 0.004, 4, -1.7 + i * 0.5, 0.002, 0.2, 0x4a2e1c]);
  for (let i = 0; i < 8; i++) L.push([5, 0.3, 0.08, 0.3, 0.15 + i * 0.31, -1.1, PLANK[i % 4]]);
  L.push([1.5, 0.05, 0.28, 0.75, 1.95, -0.95, WOOD_L], [0.05, 0.12, 0.2, 0.15, 1.88, -0.98, WOOD_D], [0.05, 0.12, 0.2, 1.35, 1.88, -0.98, WOOD_D]);
  // jars + books on the shelf
  const jar = [0x6ad08a, 0xe8a040, 0x8ac8e8, 0xd86a5a];
  for (let i = 0; i < 4; i++) L.push([0.13, 0.18 + (i % 2) * 0.05, 0.13, 0.3 + i * 0.17, 2.07 + (i % 2) * 0.025, -0.95, jar[i]], [0.14, 0.03, 0.14, 0.3 + i * 0.17, 2.18 + (i % 2) * 0.05, -0.95, BRASS_D]);
  const bk = [0x3a6aa8, 0xa83a3a, 0x3a8a5a, 0xc8a040, 0x6a4a9a];
  for (let i = 0; i < 5; i++) L.push([0.06, 0.24 - (i % 3) * 0.03, 0.2, 1.0 + i * 0.065, 2.09 - (i % 3) * 0.015, -0.95, bk[i]]);
  // a framed "evil plan" sheet on the wall
  L.push([0.62, 0.48, 0.03, -0.7, 1.55, -1.04, 0x5a3a20], [0.54, 0.4, 0.035, -0.7, 1.55, -1.03, 0xf2ead6]);
  for (let i = 0; i < 4; i++) L.push([0.36 - (i % 2) * 0.1, 0.025, 0.04, -0.72, 1.66 - i * 0.07, -1.02, 0x5a5a7a]);
  L.push([0.12, 0.12, 0.04, -0.52, 1.44, -1.02, 0xd84a3a]);
  // the desk (top at 0.8): top, apron, legs, a drawer
  L.push([1.9, 0.07, 0.78, 0.35, DY - 0.035, 0.62, WOOD], [1.9, 0.02, 0.78, 0.35, DY + 0.001, 0.62, WOOD_L]);
  L.push([1.84, 0.12, 0.06, 0.35, DY - 0.13, 0.26, WOOD_D]);
  for (const [x, z] of [[-0.55, 0.3], [1.25, 0.3], [-0.55, 0.95], [1.25, 0.95]]) L.push([0.08, DY - 0.07, 0.08, x, (DY - 0.07) / 2, z, WOOD_D]);
  L.push([0.5, 0.14, 0.04, 0.85, DY - 0.15, 0.24, WOOD_L], [0.1, 0.03, 0.03, 0.85, DY - 0.15, 0.22, BRASS]);
  // chair under him (seat 0.5)
  L.push([0.56, 0.06, 0.5, 0, 0.47, -0.05, 0x8a3a2a], [0.6, 0.04, 0.54, 0, 0.43, -0.05, WOOD_D]);
  L.push([0.56, 0.5, 0.06, 0, 0.78, -0.33, 0x8a3a2a], [0.6, 0.06, 0.08, 0, 1.05, -0.33, WOOD_D]);
  for (const [x, z] of [[-0.25, 0.17], [0.25, 0.17], [-0.25, -0.28], [0.25, -0.28]]) L.push([0.06, 0.42, 0.06, x, 0.21, z, WOOD_D]);
  // keyboard (sit_type types at z 0.36)
  L.push([0.56, 0.035, 0.2, 0.02, DY + 0.02, 0.4, BEIGE_D], [0.52, 0.02, 0.16, 0.02, DY + 0.045, 0.4, BEIGE]);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) L.push([0.055, 0.012, 0.035, -0.15 + k * 0.058 + (r % 2) * 0.02, DY + 0.06, 0.35 + r * 0.045, r === 2 && k > 1 && k < 5 ? 0xcfc4a4 : 0xf2ead8]);
  // mouse + pad
  L.push([0.26, 0.01, 0.22, 0.5, DY + 0.006, 0.42, 0x2a6a4a], [0.07, 0.04, 0.1, 0.5, DY + 0.03, 0.42, BEIGE]);
  // papers + a clipboard + a pencil
  L.push([0.3, 0.012, 0.38, -0.42, DY + 0.008, 0.55, 0xf4ecd8, 0.25], [0.28, 0.012, 0.36, -0.4, DY + 0.02, 0.52, 0xfff8e8, -0.12]);
  for (let i = 0; i < 4; i++) L.push([0.18, 0.004, 0.02, -0.4, DY + 0.028, 0.45 + i * 0.05, 0x7a8aa8, -0.12]);
  L.push([0.02, 0.02, 0.22, -0.28, DY + 0.03, 0.62, 0xe8b830, 0.6]);
  // the lamp: base, two arms, a brass shade
  L.push([0.2, 0.04, 0.2, 1.05, DY + 0.02, 0.85, BRASS_D], [0.035, 0.42, 0.035, 1.05, DY + 0.24, 0.85, BRASS], [0.035, 0.035, 0.32, 1.05, DY + 0.45, 0.72, BRASS]);
  L.push([0.24, 0.12, 0.2, 1.05, DY + 0.42, 0.56, BRASS], [0.2, 0.02, 0.16, 1.05, DY + 0.355, 0.56, 0xfff2b0]);
  // a mug (energy brew) by the keyboard
  L.push([0.11, 0.13, 0.11, -0.4, DY + 0.065, 0.3, 0xe85a3a], [0.09, 0.01, 0.09, -0.4, DY + 0.131, 0.3, 0x5a3418], [0.03, 0.07, 0.03, -0.47, DY + 0.07, 0.3, 0xe85a3a]);
  // a flask (green, bubbling) on a stand
  L.push([0.16, 0.02, 0.16, 0.75, DY + 0.01, 0.92, BRASS_D], [0.13, 0.12, 0.13, 0.75, DY + 0.08, 0.92, 0xbfe8d8], [0.05, 0.12, 0.05, 0.75, DY + 0.2, 0.92, 0xbfe8d8]);
  L.push([0.11, 0.08, 0.11, 0.75, DY + 0.065, 0.92, 0x3fdc6a]);
  // a potted plant at the desk corner
  L.push([0.16, 0.14, 0.16, -0.62, DY + 0.07, 0.86, 0xb85a30], [0.17, 0.02, 0.17, -0.62, DY + 0.14, 0.86, 0x8a3a20]);
  for (const [dx, dy, dz, h] of [[0, 0.22, 0, 0.18], [0.06, 0.2, 0.03, 0.12], [-0.06, 0.19, -0.02, 0.12], [0.02, 0.27, -0.05, 0.1]]) L.push([0.07, h, 0.07, -0.62 + dx, DY + dy, 0.86 + dz, 0x4aa04a]);
  // the CRT: case, bezel, a vent, a stand
  L.push([0.3, 0.05, 0.26, 0.28, DY + 0.025, 0.8, BEIGE_D]);
  return boxMesh(L, mat);
}

// monitor (separate: it turns to the camera a little) with a canvas screen
function buildMonitor(mat, screenTex) {
  const g = new THREE.Group();
  const box = boxMesh([
    [0.62, 0.5, 0.5, 0, 0, 0, BEIGE], [0.66, 0.06, 0.52, 0, 0.27, 0, BEIGE_D], [0.5, 0.36, 0.2, 0, 0, 0.32, BEIGE_D],
    [0.06, 0.06, 0.02, 0.22, -0.2, -0.255, 0x3fdc6a], [0.12, 0.02, 0.02, -0.15, -0.2, -0.255, BEIGE_D],
  ], mat);
  g.add(box);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: screenTex }));
  scr.position.set(0, 0.01, -0.252);
  scr.rotation.y = Math.PI;
  g.add(scr);
  return g;
}

// ------------------------------------------------------------------ shared GL pool
let POOL = null;
function pool() {
  if (POOL) return POOL.failed ? null : POOL;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no gl');
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x1a120e, 1);
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1a120e, 5.5, 9);
    scene.add(new THREE.HemisphereLight(0xffd8a8, 0x3a2a3a, 1.15));
    const key = new THREE.DirectionalLight(0xffe2b8, 1.4); key.position.set(-2, 3, 3); scene.add(key);
    const lamp = new THREE.PointLight(0xffb860, 3.2, 3.2, 1.4); lamp.position.set(1.05, FOX_DESK_HEIGHT + 0.3, 0.56); scene.add(lamp);
    const crt = new THREE.PointLight(0x5aff88, 2.0, 2.2, 1.5); crt.position.set(0.2, FOX_DESK_HEIGHT + 0.3, 0.45); scene.add(crt);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    scene.add(buildRoom(mat));
    // screen canvas
    const sc = document.createElement('canvas');
    sc.width = 64; sc.height = 48;
    const stex = new THREE.CanvasTexture(sc);
    stex.magFilter = stex.minFilter = THREE.NearestFilter;
    stex.colorSpace = THREE.SRGBColorSpace;
    const mon = buildMonitor(mat, stex);
    mon.position.set(0.3, FOX_DESK_HEIGHT + 0.3, 0.86);
    mon.rotation.y = -0.55;
    scene.add(mon);
    // lamp glow cone (additive) + steam + bubbles
    const fx = new THREE.Group();
    scene.add(fx);
    const steamMat = [];
    const steam = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xfff4e4, transparent: true, opacity: 0.5, depthWrite: false });
      steamMat.push(m);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), m);
      fx.add(s); steam.push(s);
    }
    const bubMat = new THREE.MeshBasicMaterial({ color: 0xd8ffd8 });
    const bubs = [];
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), bubMat); fx.add(b); bubs.push(b); }
    const rig = new FoxRig({ shadows: false });
    rig.setOutfit('scientist');
    scene.add(rig.root);
    const cam = new THREE.PerspectiveCamera(24, 1.6, 0.5, 30);
    const rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(16, 16);
    const post = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, size: { value: new THREE.Vector2(16, 16) }, ink: { value: new THREE.Color(0x1a0c10) }, cNear: { value: cam.near }, cFar: { value: cam.far } },
    }));
    post.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    post.frustumCulled = false;
    const postScene = new THREE.Scene();
    postScene.add(post);
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    POOL = { renderer, scene, rig, cam, rt, post, postScene, postCam, sc, sctx: sc.getContext('2d'), stex, steam, steamMat, bubs, lamp, crt, owner: null, w: 0, h: 0 };
    return POOL;
  } catch (e) {
    console.warn('Workbench: no WebGL', e);
    POOL = { failed: true };
    return null;
  }
}

const CAM_POS = new THREE.Vector3(-1.75, 1.62, 2.75);
const CAM_LOOK = new THREE.Vector3(0.22, 0.98, 0.42);

export class Workbench {
  constructor(canvas) {
    const P = pool();
    if (!P) throw new Error('no WebGL');
    if (P.owner && P.owner !== this) { try { P.owner.destroy(); } catch { /* ignore */ } }
    P.owner = this;
    this.P = P;
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.alive = true;
    this.t = 0;
    this.acc = 1;
    this.job = { title: '', art: null, k: 0 };
    this.mode = 'type';
    this.nextIdle = 6 + Math.random() * 5;
    const rig = (this.rig = P.rig);
    rig.setOutfit('scientist');
    rig.holdProp?.(null);
    rig.lookAt(null);
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    rig.play('sit_type', { loop: true, fade: 0 });
    rig.setExpression(null);
    this.aw = 0; this.ah = 0;
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this.P.owner === this) this.P.owner = null;
  }

  /** css box -> art size (2 css px per art px, whole device px) */
  fit(cssW, cssH) {
    const r = dpr();
    const u = Math.max(1, Math.round(CSS_PX * r));
    const aw = Math.max(32, Math.floor((cssW * r) / u)), ah = Math.max(24, Math.floor((cssH * r) / u));
    if (aw === this.aw && ah === this.ah && u === this.u) return;
    this.aw = aw; this.ah = ah; this.u = u;
    this.cv.width = aw * u; this.cv.height = ah * u;
    this.cv.style.width = `${(aw * u) / r}px`;
    this.cv.style.height = `${(ah * u) / r}px`;
    this.acc = 1;
  }

  setJob(j) { Object.assign(this.job, j); }

  react(kind) {
    const rig = this.rig;
    const back = () => { if (this.alive && this.mode !== 'done') { this.mode = 'type'; rig.play('sit_type', { loop: true, fade: 0.25 }); } };
    if (kind === 'done') {
      this.mode = 'done';
      rig.play('sit_laugh', { loop: false, restart: true, fade: 0.12 });
      rig.setExpression('laugh', { hold: 2.4 });
    } else if (kind === 'rush') {
      this.mode = 'react';
      rig.play('sit_scheme', { loop: true, fade: 0.1 });
      rig.setExpression('greedy', { hold: 1.4 });
      this._backT = 1.6;
      this._back = back;
    } else if (kind === 'start') {
      this.mode = 'type';
      rig.play('sit_type', { loop: true, fade: 0.15, restart: true });
      rig.setExpression('scheming', { hold: 1.5 });
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.alive || !this.aw) return;
    const P = this.P;
    if (P.owner !== this) return;
    this.t += dt;
    const rig = this.rig;
    // idle reactions while typing
    if (this._backT != null) { this._backT -= dt; if (this._backT <= 0) { this._backT = null; this._back?.(); } }
    if (this.mode === 'type' && !REDUCED) {
      this.nextIdle -= dt;
      if (this.nextIdle <= 0) {
        this.nextIdle = 8 + Math.random() * 7;
        const r = Math.random();
        if (r < 0.5) {
          this.mode = 'react';
          rig.play('sit_sip', { loop: false, fade: 0.2, onDone: () => { if (this.mode === 'react') { this.mode = 'type'; rig.play('sit_type', { loop: true, fade: 0.25 }); } } });
        } else {
          this.mode = 'react';
          rig.play('sit_scheme', { loop: true, fade: 0.2 });
          this._backT = 2.2;
          this._back = () => { if (this.mode === 'react') { this.mode = 'type'; rig.play('sit_type', { loop: true, fade: 0.25 }); } };
        }
      }
    }
    rig.update(dt);
    this.acc += dt;
    if (this.acc < 1 / FPS) return;
    const step = this.acc;
    this.acc = 0;
    this._fx(step);
    if (this.t - (this._scrT || -1) > 0.16) { this._scrT = this.t; this._screen(); }
    this._render();
  }

  _fx() {
    const P = this.P, t = this.t, DY = FOX_DESK_HEIGHT;
    // steam from the mug
    for (let i = 0; i < P.steam.length; i++) {
      const s = P.steam[i];
      const ph = (t * 0.45 + i / P.steam.length) % 1;
      s.position.set(-0.4 + Math.sin(t * 2 + i * 1.7) * 0.03 * (1 + ph), DY + 0.16 + ph * 0.42, 0.3 + Math.cos(t * 1.3 + i) * 0.02);
      s.scale.setScalar(0.8 + ph * 1.6);
      P.steamMat[i].opacity = 0.5 * (1 - ph) * Math.min(1, ph * 6);
    }
    // bubbles in the flask
    for (let i = 0; i < P.bubs.length; i++) {
      const b = P.bubs[i];
      const ph = (t * 0.8 + i * 0.27) % 1;
      b.position.set(0.75 + Math.sin(i * 2.1 + t * 3) * 0.03, DY + 0.04 + ph * 0.28, 0.92 + Math.cos(i * 1.3) * 0.03);
      b.visible = ph < 0.92;
    }
    // the lamp breathes a little, the CRT flickers
    P.lamp.intensity = 3.0 + Math.sin(t * 1.7) * 0.15;
    P.crt.intensity = 1.8 + (Math.sin(t * 23) > 0.96 ? 0.6 : 0) + (this.mode === 'done' ? Math.abs(Math.sin(t * 9)) * 1.6 : 0);
  }

  // the CRT: a tiny green terminal with the project, a progress bar and scrolling code
  _screen() {
    const P = this.P, c = P.sctx, W = P.sc.width, H = P.sc.height, t = this.t;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#062012';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#0c3a1e';
    for (let y = 1; y < H; y += 2) c.fillRect(0, y, W, 1);
    // scrolling code lines
    const off = Math.floor(t * 6);
    for (let i = 0; i < 6; i++) {
      const s = (off + i) * 2654435761 >>> 0;
      const len = 6 + (s % 22);
      c.fillStyle = i === 5 ? '#b8ffc8' : '#2fa858';
      c.fillRect(3 + ((s >> 5) % 3) * 3, 24 + i * 3 - 0, len, 1);
    }
    // the project icon, top-left
    const a = this.job.art;
    if (a && (a.width || a.naturalWidth)) {
      const aw = a.naturalWidth || a.width, ah = a.naturalHeight || a.height;
      const s = Math.max(1, Math.floor(Math.min(18 / aw, 16 / ah)));
      try { c.drawImage(a, 4, 3, aw * s, ah * s); } catch { /* ignore */ }
    } else {
      c.fillStyle = '#52e47e'; c.fillRect(6, 5, 10, 10);
    }
    // percent digits as blocks + a bar
    const k = Math.max(0, Math.min(1, this.job.k || 0));
    c.fillStyle = '#0a2a16'; c.fillRect(25, 6, 35, 9);
    c.fillStyle = this.mode === 'done' ? (Math.floor(t * 8) % 2 ? '#d8ffd8' : '#52e47e') : '#3fdc6a';
    c.fillRect(26, 7, Math.round(33 * k), 7);
    c.fillStyle = '#b8ffc8';
    c.fillRect(26 + Math.round(33 * k) - 1, 7, 1, 7);
    // blinking cursor
    if (Math.floor(t * 2) % 2) { c.fillStyle = '#b8ffc8'; c.fillRect(4, 42, 3, 2); }
    P.stex.needsUpdate = true;
  }

  _render() {
    const P = this.P, r = P.renderer, aw = this.aw, ah = this.ah;
    if (P.w !== aw || P.h !== ah) {
      P.w = aw; P.h = ah;
      r.setSize(aw, ah, false);
      P.rt.setSize(aw, ah);
      P.post.material.uniforms.size.value.set(aw, ah);
    }
    const cam = P.cam;
    cam.aspect = aw / ah;
    // wide boxes: pull back a bit so the desk fits; tall boxes: a bit closer
    const k = Math.max(0.85, Math.min(1.25, 1.6 / cam.aspect));
    cam.position.copy(CAM_LOOK).addScaledVector(_d.copy(CAM_POS).sub(CAM_LOOK), k);
    cam.lookAt(CAM_LOOK);
    cam.updateProjectionMatrix();
    r.setRenderTarget(P.rt);
    r.clear();
    r.render(P.scene, cam);
    r.setRenderTarget(null);
    r.render(P.postScene, P.postCam);
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.drawImage(r.domElement, 0, 0, aw, ah, 0, 0, this.cv.width, this.cv.height);
  }
}
const _d = new THREE.Vector3();
