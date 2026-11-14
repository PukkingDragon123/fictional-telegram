// [v33 lab4] The project card's preview: the unlocked thing IN ACTION, in a little live scene.
//   - buildings / structures: the game's real voxel model (StructureSystem.previewObject) on a
//     grassy voxel island with a few pines, on a slow turntable, rendered with an ink outline
//     in ONE shared offscreen WebGL context at 2 css px per art px, blitted crisp to the card
//   - crops / plants: a raised garden bed where the seed drops in, sprouts, grows through the
//     game's own stage sprites (the nature atlas), ripens with a sparkle and gets harvested
//     (the produce pops out), on a loop
//   - anything else: the game icon on a velvet stand under a stepped spotlight, bobbing
// Only the selected project's preview animates (the card calls draw() ~15 fps while shown).
//
//   const P = new Preview(canvas, game, iconCanvasFn); P.fit(w, h); P.show(spec); P.draw(t, dt);
//   spec: { kind: 'build', id } | { kind: 'crop', id, item } | { kind: 'icon', name }
import * as THREE from 'three';
import { buildNatureAtlas } from '../../art/natureArt.js';
import { CROPS, stagesFor } from '../../data/crops.js';
import { canvas as mkCanvas, OAK, BRASS, plank } from './wood.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const INK = '#1a0e06';

// ------------------------------------------------------------------ the ink outline pass (as the game's)
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
  if (z - zn > 0.09) col = mix(col, ink, 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

let POOL = null;
function pool() {
  if (POOL) return POOL.failed ? null : POOL;
  try {
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no gl');
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x9ad4f0, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9ad4f0);
    scene.fog = new THREE.Fog(0x9ad4f0, 9, 16);
    scene.add(new THREE.HemisphereLight(0xfff2d8, 0x4a6a3a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.8); sun.position.set(-3, 6, 4); scene.add(sun);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    scene.add(island(mat));
    const holder = new THREE.Group();
    scene.add(holder);
    const cam = new THREE.PerspectiveCamera(26, 1.5, 0.5, 40);
    const rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    rt.depthTexture = new THREE.DepthTexture(16, 16);
    const post = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, size: { value: new THREE.Vector2(16, 16) }, ink: { value: new THREE.Color(0x1a0e06) }, cNear: { value: cam.near }, cFar: { value: cam.far } },
    }));
    post.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    post.frustumCulled = false;
    const postScene = new THREE.Scene();
    postScene.add(post);
    POOL = { renderer, scene, holder, cam, rt, post, postScene, postCam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), models: new Map(), w: 0, h: 0 };
    return POOL;
  } catch (e) {
    console.warn('lab preview: no WebGL', e);
    POOL = { failed: true };
    return null;
  }
}

// a grassy voxel island with dirt sides, tufts, flowers, stones and three little pines behind
function island(mat) {
  const geos = [];
  const col = new THREE.Color();
  const box = (w, h, d, x, y, z, c) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    col.set(c);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    geos.push(g);
  };
  const R = rnd(31), S = 0.25, N = 9;
  for (let i = -N; i <= N; i++) for (let k = -N; k <= N; k++) {
    const d = Math.hypot(i, k);
    if (d > N + 0.3) continue;
    const top = (i + k) % 2 ? 0x6ab04a : 0x62a644;
    const tint = R() < 0.2 ? 0x76bc54 : R() < 0.15 ? 0x5a9a3e : top;
    const h = d > N - 1.2 ? 0.5 : 0.62;
    box(S, h, S, i * S, -h / 2, k * S, tint);
    box(S * 0.98, 0.3, S * 0.98, i * S, -h - 0.15, k * S, d > N - 1.5 ? 0x7a5230 : 0x8a5e36);
  }
  for (let t = 0; t < 26; t++) { const a = R() * Math.PI * 2, r = 0.9 + R() * 1.2; box(0.06, 0.12 + R() * 0.08, 0.06, Math.cos(a) * r, 0.06, Math.sin(a) * r, R() < 0.5 ? 0x4a8a34 : 0x86c860); }
  for (let t = 0; t < 7; t++) { const a = R() * Math.PI * 2, r = 1.1 + R() * 1.0; box(0.07, 0.07, 0.07, Math.cos(a) * r, 0.1, Math.sin(a) * r, [0xffd23f, 0xff7ac0, 0xffffff][t % 3]); box(0.03, 0.08, 0.03, Math.cos(a) * r, 0.04, Math.sin(a) * r, 0x3e7a2e); }
  for (let t = 0; t < 4; t++) { const a = R() * Math.PI * 2, r = 1.5 + R() * 0.6; box(0.16, 0.1, 0.12, Math.cos(a) * r, 0.04, Math.sin(a) * r, 0x9a948a); }
  for (const [x, z, s] of [[-1.5, -1.4, 1], [1.7, -1.2, 0.85], [0.2, -2.0, 1.15]]) {
    box(0.12 * s, 0.4 * s, 0.12 * s, x, 0.2 * s, z, 0x6a4424);
    for (let l = 0; l < 4; l++) { const w = (0.7 - l * 0.15) * s; box(w, 0.22 * s, w, x, (0.45 + l * 0.2) * s, z, l % 2 ? 0x2f6a48 : 0x28583e); }
  }
  const merged = mergeGeos(geos);
  return new THREE.Mesh(merged, mat);
}
function mergeGeos(list) {
  let n = 0;
  for (const g of list) n += g.toNonIndexed().attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colr = new Float32Array(n * 3);
  let o = 0;
  for (const g0 of list) {
    const g = g0.toNonIndexed();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    colr.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose(); g0.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return m;
}

// ------------------------------------------------------------------ 2D scenes
let NAT = null;
function nature() { if (!NAT) { try { NAT = buildNatureAtlas(); } catch { NAT = { canvas: null, frames: {} }; } } return NAT; }
function natFrame(name) {
  const A = nature(), f = A.frames?.[name]?.[0];
  if (!f || !A.canvas) return null;
  return { cv: A.canvas, ...f };
}
const BG = new Map();
// the garden backdrop: dithered sky, a picket fence, a hedge, and a raised oak bed of tilled soil
function gardenBG(W, H) {
  const key = `g|${W}x${H}`;
  let c = BG.get(key);
  if (c) return c;
  c = mkCanvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true });
  const p = (col, X, Y, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
  const sky = ['#8ccaf0', '#9ed4f2', '#b2def4', '#c8e8f4', '#dcf0f0'].map(hex);
  const hz = Math.round(H * 0.42);
  for (let y = 0; y < hz; y++) for (let X = 0; X < W; X++) { const k = y / hz; const s = sky[Math.max(0, Math.min(4, Math.floor(k * 5 + bay(X, y))))]; p(`rgb(${s})`, X, y); }
  // a cloud
  for (const [cx, cy, r] of [[W * 0.22, H * 0.14, 7], [W * 0.27, H * 0.11, 9], [W * 0.33, H * 0.15, 6]]) for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)) * 1.6); p(y > r * 0.3 ? '#e4f0fa' : '#ffffff', Math.round(cx - w), Math.round(cy + y * 0.6), w * 2, 1); }
  // hedge
  const R = rnd(4);
  for (let X = 0; X < W; X++) { const h = 10 + Math.round(Math.sin(X * 0.21) * 2 + Math.sin(X * 0.07) * 3); for (let y = hz - h; y < hz + 4; y++) p(((X * 3 + y * 5) % 7 < 2) ? '#2f7a3a' : (R() < 0.08 ? '#5cb85a' : '#3e9046'), X, y); p('#1e5a2a', X, hz + 3); }
  // fence
  for (let X = 4; X < W; X += 11) { p(INK, X, hz - 8, 6, 16); p('#f6f0e2', X + 1, hz - 7, 4, 15); p('#d8cfbc', X + 4, hz - 7, 1, 15); p(INK, X + 2, hz - 9, 2, 1); }
  for (const y of [hz - 4, hz + 3]) { p(INK, 0, y, W, 3); p('#f0e8d6', 0, y + 1, W, 1); }
  // grass strip
  for (let y = hz + 6; y < H; y++) for (let X = 0; X < W; X++) p(((X + y) % 5 === 0) ? '#5aa844' : '#6ab850', X, y);
  // the raised bed
  const bx = Math.round(W * 0.1), bw = Math.round(W * 0.8), by = Math.round(H * 0.6), bh = Math.round(H * 0.3);
  for (let y = by; y < by + bh; y++) for (let X = bx; X < bx + bw; X++) {
    const furrow = (y - by) % 6 < 2;
    const s = furrow ? '#4a2c16' : (((X * 7 + y * 3) % 11) === 0 ? '#7a4e2a' : '#5e3a1e');
    p(s, X, y);
  }
  const side = plank(bw + 8, 9, { ramp: OAK, seed: 13, screws: true, grooveIn: 0 });
  x.drawImage(side, bx - 4, by + bh - 2);
  p(INK, bx - 4, by - 1, bw + 8, 1); p('#c48c50', bx - 4, by, 3, bh - 2); p('#c48c50', bx + bw + 1, by, 3, bh - 2);
  c.bed = { x: bx, y: by, w: bw, h: bh };
  BG.set(key, c);
  return c;
}
// the plinth backdrop: dark velvet with a stepped spotlight and a brass-edged stand
function plinthBG(W, H) {
  const key = `p|${W}x${H}`;
  let c = BG.get(key);
  if (c) return c;
  c = mkCanvas(W, H);
  const x = c.getContext('2d', { willReadFrequently: true });
  const p = (col, X, Y, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
  const vel = ['#2a1420', '#341a28', '#3e2030', '#4a283a', '#583246', '#6a3e54'].map(hex);
  const cx = W / 2, cy = H * 0.44;
  for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
    const d = Math.hypot((X - cx) / (W * 0.42), (y - cy) / (H * 0.55));
    const v = 0.95 - d * 0.8 + ((X % 3 === 0) ? 0.03 : 0);
    p(`rgb(${vel[Math.max(0, Math.min(5, Math.floor(v * 6 + bay(X, y))))]})`, X, y);
  }
  const sy = Math.round(H * 0.74), sw = Math.round(W * 0.42), sx = Math.round(cx - sw / 2);
  p(INK, sx - 1, sy - 1, sw + 2, H - sy + 1);
  for (let y = sy; y < H; y++) for (let X = sx; X < sx + sw; X++) p(`rgb(${OAK[Math.max(0, Math.min(7, Math.floor(5.5 - (y - sy) * 0.25 + bay(X, y) + ((X - sx) / sw) * 1.2)))]})`, X, y);
  for (let X = sx; X < sx + sw; X++) { p(`rgb(${BRASS[5]})`, X, sy); p(`rgb(${BRASS[3]})`, X, sy + 1); }
  c.stand = sy;
  BG.set(key, c);
  return c;
}

export class Preview {
  constructor(cv, game, iconFn) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.g = game;
    this.iconFn = iconFn; // (name, scale) -> canvas
    this.spec = null;
    this.W = 0; this.H = 0;
    this.t0 = 0;
    this.fx = [];
    this.R = rnd(9);
  }

  fit(w, h) {
    w = Math.max(60, Math.floor(w)); h = Math.max(40, Math.floor(h));
    if (w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.cv.width = w; this.cv.height = h;
    this.cv.style.width = `${w}px`; this.cv.style.height = `${h}px`;
  }

  show(spec, dark = false) {
    const key = spec ? `${spec.kind}|${spec.id || spec.name}` : '';
    this.dark = dark;
    if (key === this.key) return;
    this.key = key;
    this.spec = spec;
    this.t0 = -1;
    this.fx = [];
    if (spec?.kind === 'build') this._model(spec.id);
  }

  // the 3D model of a structure, cached per type
  _model(id) {
    const P = pool();
    if (!P) { this.spec = { kind: 'icon', name: this.spec.icon || 'hammer' }; return; }
    for (const c of [...P.holder.children]) P.holder.remove(c);
    let m = P.models.get(id);
    if (m === undefined) {
      m = null;
      try {
        const obj = this.g?.structures?.previewObject?.(id);
        if (obj) {
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3());
          const s = 1.7 / Math.max(0.3, size.x, size.z, size.y * 0.85);
          const wrap = new THREE.Group();
          obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
          wrap.add(obj);
          wrap.scale.setScalar(s);
          wrap.userData.h = size.y * s;
          m = wrap;
        }
      } catch (e) { console.warn('lab preview model', id, e); m = null; }
      P.models.set(id, m);
    }
    if (!m) { this.spec = { kind: 'icon', name: this.spec.icon || 'hammer' }; return; }
    P.holder.add(m);
    this.modelH = m.userData.h || 1;
  }

  draw(t, dt) {
    if (!this.spec || !this.W) return;
    if (this.t0 < 0) this.t0 = t;
    const k = this.spec.kind;
    if (k === 'build') this._draw3D(t - this.t0);
    else if (k === 'crop') this._drawCrop(t - this.t0, dt);
    else this._drawIcon(t - this.t0, dt);
  }

  // ---- 3D: the model on its island, slowly turning, at 2 css px per art px
  _draw3D(t) {
    const P = pool();
    if (!P) return;
    const aw = Math.ceil(this.W / 2), ah = Math.ceil(this.H / 2);
    if (P.w !== aw || P.h !== ah) {
      P.w = aw; P.h = ah;
      P.renderer.setSize(aw, ah, false);
      P.rt.setSize(aw, ah);
      P.post.material.uniforms.size.value.set(aw, ah);
    }
    const cam = P.cam, a = 0.7 + t * 0.32, r = 5.6, h = Math.max(0.8, this.modelH);
    cam.aspect = aw / ah;
    cam.position.set(Math.sin(a) * r, 2.6 + h * 0.4, Math.cos(a) * r);
    cam.lookAt(0, h * 0.42, 0);
    cam.updateProjectionMatrix();
    const R = P.renderer;
    R.setRenderTarget(P.rt);
    R.clear();
    R.render(P.scene, cam);
    R.setRenderTarget(null);
    R.render(P.postScene, P.postCam);
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.drawImage(R.domElement, 0, 0, aw, ah, 0, 0, aw * 2, ah * 2);
    if (this.dark) { c.fillStyle = 'rgba(20,12,8,.55)'; c.fillRect(0, 0, this.W, this.H); }
  }

  // ---- 2D: plant, sprout, grow, ripen, harvest (a 7 s loop)
  _drawCrop(t, dt) {
    const W = this.W, H = this.H, c = this.ctx;
    const bg = gardenBG(W, H), B = bg.bed;
    c.imageSmoothingEnabled = false;
    c.drawImage(bg, 0, 0);
    const id = this.spec.id;
    const names = stagesFor(id) || [];
    const LOOP = 7.2, u = t % LOOP;
    const stage = u < 1 ? -1 : u < 2.2 ? 0 : u < 3.4 ? 1 : u < 4.6 ? 2 : 3;
    const xs = [0.3, 0.5, 0.7].map((f) => Math.round(B.x + B.w * f));
    const gy = B.y + Math.round(B.h * 0.55);
    const scale = H >= 140 ? 3 : 2;
    xs.forEach((x, i) => {
      // the seed drops in (staggered), then the stage sprite grows with a little squash
      const st = stage < 0 ? -1 : Math.max(0, stage - (i === 1 ? 0 : 1) + (u > 4.6 ? 1 : 0));
      if (stage < 0 || (u < 1.4 && i !== 1)) {
        const k = Math.min(1, (u - i * 0.15) / 0.8);
        if (k > 0) { c.fillStyle = '#c89a5a'; c.fillRect(x - 1, Math.round(gy - 30 + 30 * k), 2, 2); c.fillStyle = INK; c.fillRect(x - 1, Math.round(gy - 28 + 30 * k), 2, 1); }
        return;
      }
      const name = names[Math.min(3, st)];
      const f = name ? natFrame(name) : null;
      if (!f) return;
      const local = (u - (st + 1) * 1.2) % 1.2;
      const pop = local < 0.15 ? 1 + (0.15 - local) * 1.5 : 1;
      const w = f.w * scale, h = Math.round(f.h * scale * pop);
      c.drawImage(f.cv, f.x, f.y, f.w, f.h, Math.round(x - w / 2), gy - h + 2, w, h);
    });
    // ripe: sparkles; harvest at the end: the produce pops out of the middle plant
    if (stage === 3 && Math.floor(t * 6) % 2 === 0) for (let s = 0; s < 3; s++) { const sx = xs[s] + ((s * 7 + Math.floor(t * 3)) % 9) - 4, sy = gy - 20 - ((s * 5) % 12); c.fillStyle = '#fff6c0'; c.fillRect(sx, sy, 1, 1); c.fillRect(sx - 1, sy + 1, 3, 1); c.fillRect(sx, sy + 2, 1, 1); }
    if (u > 6.2) {
      const k = (u - 6.2) / 1.0;
      const icon = this.iconFn?.(CROPS[id]?.item || this.spec.item || id, scale);
      if (icon) {
        const x = xs[1] - icon.width / 2, y = gy - 20 - k * 30 - Math.sin(k * Math.PI) * 10;
        c.drawImage(icon, Math.round(x), Math.round(y));
      }
      if (this.fx.length < 10 && k < 0.2) for (let i = 0; i < 6; i++) this.fx.push({ x: xs[1], y: gy - 6, vx: (this.R() - 0.5) * 50, vy: -30 - this.R() * 30, t: 0 });
    }
    this._fx(dt, '#7a4e2a');
    if (this.dark) { c.fillStyle = 'rgba(20,12,8,.5)'; c.fillRect(0, 0, W, H); }
  }

  // ---- fallback: the game's icon on a velvet stand, bobbing under a spotlight
  _drawIcon(t, dt) {
    const W = this.W, H = this.H, c = this.ctx;
    const bg = plinthBG(W, H);
    c.imageSmoothingEnabled = false;
    c.drawImage(bg, 0, 0);
    const scale = H >= 140 ? 4 : 3;
    const icon = this.iconFn?.(this.spec.name, scale);
    if (icon) {
      const bob = Math.round(Math.sin(t * 2.2) * 2);
      const x = Math.round(W / 2 - icon.width / 2), y = Math.round(bg.stand - icon.height - 6 + bob);
      c.fillStyle = 'rgba(10,4,2,.45)';
      const sw = Math.round(icon.width * (0.7 - bob * 0.03));
      c.fillRect(Math.round(W / 2 - sw / 2), bg.stand - 2, sw, 2);
      if (this.dark) { c.globalAlpha = 1; c.filter = 'brightness(0)'; }
      c.drawImage(icon, x, y);
      c.filter = 'none';
    }
    if (!this.dark && Math.floor(t * 5) % 2 === 0) for (let s = 0; s < 4; s++) { const a = t * 0.8 + s * 1.57, sx = Math.round(W / 2 + Math.cos(a) * W * 0.22), sy = Math.round(H * 0.42 + Math.sin(a) * H * 0.18); c.fillStyle = '#fff6c0'; c.fillRect(sx, sy, 1, 1); c.fillRect(sx - 1, sy + 1, 3, 1); c.fillRect(sx, sy + 2, 1, 1); }
    this._fx(dt, '#ffd23f');
  }

  _fx(dt, col) {
    if (!this.fx.length) return;
    const c = this.ctx, keep = [];
    for (const p of this.fx) { p.t += dt; if (p.t > 0.7) continue; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; c.fillStyle = col; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); keep.push(p); }
    this.fx = keep;
  }
}
