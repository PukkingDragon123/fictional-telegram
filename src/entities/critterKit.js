// Shared toolkit for the voxel critter rigs (moose courier, deer guy, ducks,
// beaver): voxel helpers, the grain material, keyframe helpers, springs and a
// small rig base class with crossfaded procedural animations, jiggle springs
// on fixed substeps, a 2D pixel face and events. Same conventions as
// foxRig.js: 1 voxel = 0.05 units, root at the feet, facing +Z.
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';

export { VoxelModel };
export const VS = 0.05; // world units per voxel
export const FV = 0.025; // fine voxels (small props, details, ducks)

// ------------------------------------------------------------------ math
export const TAU = Math.PI * 2;
export const { sin, cos, abs, min, max, PI, floor, sqrt, atan2, acos } = Math;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const EASE = {
  lin: (x) => x,
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  io: (x) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x)),
  in3: (x) => x * x * x,
  out3: (x) => 1 - (1 - x) ** 3,
  back: (x) => { const c = 1.8; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; },
  el: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-9 * x) * sin((x * 10 - 0.75) * (TAU / 3)) + 1),
  step: (x) => (x < 1 ? 0 : 1),
};
/** Keyframes [[t, v, ease?], ...]; the ease applies to the segment ending at a key. */
export function K(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t <= k[0]) {
      const p = keys[i - 1];
      const u = k[0] > p[0] ? (t - p[0]) / (k[0] - p[0]) : 1;
      return p[1] + (k[1] - p[1]) * EASE[k[2] || 'io'](u);
    }
  }
  return keys[keys.length - 1][1];
}
/** 0 -> 1 between a and a+ra, back to 0 between b and b+rb. */
export const win = (t, a, b, ra = 0.12, rb = 0.12) => smooth((t - a) / ra) * (1 - smooth((t - b) / rb));
export const pulse = (t, a, d) => (t >= a && t < a + d ? sin(((t - a) / d) * PI) : 0);
export const once = (s, key, cond, fn) => { if (cond && !s[key]) { s[key] = true; fn(); } };
/** True once each time t crosses `at` (mod period). */
export function beat(s, key, t, period, at = 0) {
  const k = floor((t - at) / period);
  const hit = s[key] !== undefined && k > s[key];
  s[key] = k;
  return hit;
}
/**
 * Planar two-bone IK about X (bones hang along -Y at rx = 0; negative rx swings forward).
 * (dy, dz): target relative to the upper joint in its parent frame (voxels).
 * bend +1 = knee (joint points forward), -1 = elbow (joint points back).
 */
export function ik2(L1, L2, dy, dz, bend = 1, out = [0, 0]) {
  let d = Math.hypot(dy, dz);
  d = clamp(d, abs(L1 - L2) + 0.05, (L1 + L2) * 0.999);
  const rt = atan2(-dz, -dy);
  const A = acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const B = acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  out[0] = rt - A * bend;
  out[1] = (PI - B) * bend;
  return out;
}
/** Bring a point (y, z) from an outer frame into a child frame along [[oy, oz, rx], ...] links (X rotations only). */
export function intoChain(y, z, chain, out = [0, 0]) {
  for (const [oy, oz, rx] of chain) {
    y -= oy; z -= oz;
    const c = cos(-rx), s = sin(-rx);
    const ny = y * c - z * s, nz = y * s + z * c;
    y = ny; z = nz;
  }
  out[0] = y; out[1] = z;
  return out;
}

// ------------------------------------------------------------------ voxels
export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const tone = (x, y, z, base, dark, light, pd = 0.1, pl = 0.09) => {
  const h = hash3(x, y, z);
  return h < pd ? dark : h > 1 - pl ? light : base;
};
/** Rounded box with voxel indices x0..x1 etc. (inclusive), edge radius r. */
export function rbox(v, x0, x1, y0, y1, z0, z1, r, col) {
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  const hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2, hz = (z1 - z0 + 1) / 2;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        const qx = abs(x + 0.5 - cx) - (hx - r), qy = abs(y + 0.5 - cy) - (hy - r), qz = abs(z + 0.5 - cz) - (hz - r);
        const d = Math.hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, qy, qz), 0) - r;
        if (d <= 0.02) {
          const c = typeof col === 'function' ? col(x, y, z) : col;
          if (c != null) v.set(x, y, z, c);
        }
      }
}
/** Ellipsoid on voxel centres: centre (cx, cy, cz) in voxel-corner units, radii in voxels. */
export function ell(v, cx, cy, cz, rx, ry, rz, col) {
  for (let x = floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    for (let y = floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
        if (dx * dx + dy * dy + dz * dz <= 1.0) {
          const c = typeof col === 'function' ? col(x, y, z) : col;
          if (c != null) v.set(x, y, z, c);
        }
      }
}
/** Mirror every voxel across x = -0.5 (left <-> right). */
export function mirrorX(v) {
  const o = new VoxelModel();
  o.merge(v);
  const out = new VoxelModel();
  for (const [k, c] of o.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    out.set(-1 - x, y, z, c);
  }
  return out;
}
/** Build a model into geometry; remembers the grain offset for the pivot. */
export function buildGeo(model, pivot = [0, 0, 0], scale = VS) {
  const g = model.build({ pivot, scale });
  const fr = (n) => ((n % 1) + 1) % 1;
  g.userData.grain = pivot.map(fr); // local * freq + frac(pivot) lands on voxel cells
  g.userData.scale = scale;
  return g;
}
/** Ref-counted lazy geometry cache: const cache = geoCache(() => ({...})); cache.get(); cache.release(). */
export function geoCache(build) {
  let G = null, refs = 0;
  return {
    get() { if (!G) G = build(); refs++; return G; },
    release() {
      refs--;
      if (refs <= 0 && G) {
        for (const k in G) G[k].dispose?.();
        G = null; refs = 0;
      }
    },
  };
}

// ------------------------------------------------------------------ material
// Lambert + per-voxel grain aligned to the voxel grid (offset for half-voxel pivots).
const matCache = new Map();
export function grainMaterial(scale = VS, off = [0, 0, 0], amount = 0.08, emissive = 0) {
  const key = `${scale},${off.join(',')},${amount},${emissive}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive });
  const o = new THREE.Vector3(...off);
  const freq = (1 / scale).toFixed(2);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGrainOff = { value: o };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCrPos;\nvarying vec3 vCrNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrPos = position;\nvCrNor = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uGrainOff;
varying vec3 vCrPos;
varying vec3 vCrNor;
float crHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vCrNor);
  vec3 g = vCrPos * ${freq} + uGrainOff;
  vec2 cell = an.y > 0.5 ? g.xz : (an.x > 0.5 ? g.zy : g.xy);
  float gn = crHash(floor(cell + 0.001));
  diffuseColor.rgb *= 1.0 + (gn - 0.5) * ${amount.toFixed(3)};
}`);
  };
  m.customProgramCacheKey = () => 'critgrain' + freq + '_' + amount;
  matCache.set(key, m);
  return m;
}
/** Grain material matching a geometry built with buildGeo. */
export const matFor = (geo, amount = 0.08, emissive = 0) => grainMaterial(geo.userData.scale || VS, geo.userData.grain || [0, 0, 0], amount, emissive);
/** A standalone voxel prop mesh. */
export function voxMesh(model, pivot, scale = VS, { shadows = true, amount = 0.08 } = {}) {
  const geo = buildGeo(model, pivot, scale);
  const m = new THREE.Mesh(geo, matFor(geo, amount));
  m.castShadow = shadows; m.receiveShadow = false;
  return m;
}

// ------------------------------------------------------------------ springs
/** Damped spring on one value. */
export class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(target, force, dt) { this.v += (this.k * (target - this.x) - this.c * this.v + force) * dt; this.x += this.v * dt; return this.x; }
}

// ------------------------------------------------------------------ pixel sprites
export function spriteTexture(rows, pal) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || !pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  return pixTex(c);
}
export function pixTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const SPRITE_PAL = { k: '#2a1520', w: '#ffffff', b: '#bfe6ff', B: '#6aa8e8', r: '#ff4468', R: '#ffb0c0', D: '#b01c3c', y: '#ffe066', Y: '#fff8c8' };
export const ZZZ_ROWS = ['kkkkkk', 'kwwwwk', 'kkkwkk', '.kwkk.', 'kwkkkk', 'kwwwwk', 'kkkkkk'];
export const HEART_ROWS = ['.kk.kk.', 'kRrkrrk', 'krrrrrk', 'krrrrDk', '.krrDk.', '..kDk..', '...k...'];
export const SPARK_ROWS = ['...k...', '..kyk..', 'kkyYykk', 'kyYYYyk', 'kkyYykk', '..kyk..', '...k...'];
export const DROP_ROWS = ['..k..', '.kbk.', 'kbwbk', 'kbbBk', '.kkk.'];
const spriteCache = new Map();
export function spriteMat(rows) {
  let m = spriteCache.get(rows);
  if (!m) { m = new THREE.SpriteMaterial({ map: spriteTexture(rows, SPRITE_PAL), alphaTest: 0.5 }); spriteCache.set(rows, m); }
  return m;
}

// ------------------------------------------------------------------ rig base
const CH = 7; // channels per joint: rx, ry, rz, x, y, z, s(squash)
function mkJ() { return { rx: 0, ry: 0, rz: 0, x: 0, y: 0, z: 0, s: 1 }; }

/**
 * Base class. Subclasses build joints with this.joint(), declare scalars, call
 * this._init(ANIMS, EXPRS, 'idle') at the end of the constructor.
 * Animation defs: { loop, dur, expr, next, nextFade, fn(t, p, f, s, rig, dt), enter(s, rig), exit(s, rig) }.
 * p.<joint>.{rx, ry, rz, x, y, z, s} (voxels / radians), p.k.<scalar>, p.vis.<flag>, p.hand.
 * f: face request { expr, eyes, mouth, brows, blush, tear, look: [x, y], blink }.
 */
export class CritterRig {
  constructor(name, { shadows = true } = {}) {
    this.root = new THREE.Group();
    this.root.name = name;
    this.shadows = shadows;
    this._joints = [];
    this._meshes = [];
    this._owned = []; // disposables
    this._scalars = {}; // name -> default
    this._jiggles = [];
    this._probes = new Map();
    this.onEvent = null; // (name, rig, data) => void
    this.time = 0;
  }

  // --- building
  joint(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x * VS, y * VS, z * VS);
    parent.add(g);
    this._joints.push({ name, g, rest: g.position.clone() });
    this[name] = g;
    return g;
  }
  mesh(geo, parent, { x = 0, y = 0, z = 0, shadow = true, mat = null } = {}) {
    const m = new THREE.Mesh(geo, mat || matFor(geo));
    m.castShadow = this.shadows && shadow;
    m.position.set(x, y, z);
    parent.add(m);
    this._meshes.push(m);
    return m;
  }
  scalar(name, def = 0) { this._scalars[name] = def; }
  /** Secondary spring adding to joint channel `ch`; force = gain . root-local acceleration of `probe`. */
  jiggle(joint, ch, { k = 160, c = 9, ax = 0, ay = 0, az = 0, yaw = 0, max: mx = 0.8, probe = 'mover' } = {}) {
    const ji = this._joints.findIndex((j) => j.name === joint);
    if (ji < 0) throw new Error('jiggle: no joint ' + joint);
    if (!this._probes.has(probe)) this._probes.set(probe, { g: this[probe], p: new THREE.Vector3(), v: new THREE.Vector3(), a: new THREE.Vector3(), yaw: 0, wy: 0, ay: 0, init: false });
    this._jiggles.push({ ji, ch, sp: new Spring(k, c), ax, ay, az, yaw, mx, pr: this._probes.get(probe) });
  }
  facePlane(tex, parent, wTex, hTex, x, y, z, texPerVoxel = 4) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.16 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry((wTex / texPerVoxel) * VS, (hTex / texPerVoxel) * VS), mat);
    m.position.set(x * VS, y * VS, z * VS + 0.0016);
    parent.add(m);
    this._owned.push(mat, m.geometry);
    return m;
  }
  sprite(rows, scale, parent) {
    const s = new THREE.Sprite(spriteMat(rows));
    s.scale.setScalar(scale);
    s.visible = false;
    parent.add(s);
    return s;
  }

  _init(anims, exprs, first = 'idle') {
    this._ANIMS = anims;
    this._EXPRS = exprs;
    this.anims = Object.keys(anims);
    this.expressions = Object.keys(exprs);
    this._scalarNames = Object.keys(this._scalars);
    this._n = this._joints.length * CH + this._scalarNames.length;
    this._aFrom = new Float32Array(this._n); this._aCur = new Float32Array(this._n); this._aOut = new Float32Array(this._n);
    this._p = { k: {}, vis: {}, hand: null };
    for (const j of this._joints) this._p[j.name] = mkJ();
    this._f = {};
    this._fadeT = 1; this._fadeDur = 0;
    this._cur = null;
    this._userExpr = null; this._userHoldT = 0;
    this._blinkT = 2; this._blinkPh = -1;
    this.play(first, { fade: 0 });
    this.update(0);
  }

  // --- public API
  play(name, { loop, fade = 0.2, speed = 1, onDone, restart = false } = {}) {
    const def = this._ANIMS[name];
    if (!def) { console.warn(this.root.name + ': unknown animation', name); return this; }
    const cur = this._cur;
    if (cur && cur.name === name && cur.loop && !restart && (loop ?? def.loop)) {
      cur.speed = speed;
      if (onDone) cur.onDone = onDone;
      return this;
    }
    if (cur && cur.def.exit) cur.def.exit(cur.state, this, name);
    this._aFrom.set(this._aOut);
    this._fadeT = 0;
    this._fadeDur = Math.max(0, fade);
    this._cur = { name, def, t: 0, loop: loop ?? !!def.loop, speed, onDone, state: {}, done: false };
    if (def.enter) def.enter(this._cur.state, this);
    return this;
  }
  get current() { return this._cur ? this._cur.name : null; }
  setExpression(name, { hold = 0 } = {}) {
    if (name && !this._EXPRS[name]) { console.warn(this.root.name + ': unknown expression', name); return this; }
    this._userExpr = name || null;
    this._userHoldT = hold;
    return this;
  }
  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    for (const o of this._owned) o.dispose?.();
    if (this.face) this.face.dispose();
    if (this._geoCache) this._geoCache.release();
  }

  // --- update: fixed small substeps keep the jiggle springs stable on slow frames
  update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
    if (dt <= 1 / 50) { this._step(dt); return; }
    let left = dt;
    while (left > 1e-5) { const s = Math.min(left, 1 / 60); this._step(s); left -= s; }
  }

  _emit(name, data) { if (this.onEvent) this.onEvent(name, this, data); }

  _step(dt) {
    this.time += dt;
    const cur = this._cur, def = cur.def;
    cur.t += dt * cur.speed;
    let t = cur.t;
    if (!cur.loop && def.dur && t > def.dur) t = def.dur;
    if (this._userExpr && this._userHoldT > 0) { this._userHoldT -= dt; if (this._userHoldT <= 0) this._userExpr = null; }
    // 1) pose
    const p = this._p, f = this._f;
    this._resetPose(p);
    f.expr = f.eyes = f.mouth = f.brows = f.blush = f.tear = f.look = null; f.blink = true;
    def.fn(t, p, f, cur.state, this, dt);
    // 2) flatten + crossfade
    const A = this._aCur;
    let i = 0;
    for (const j of this._joints) { const q = p[j.name]; A[i++] = q.rx; A[i++] = q.ry; A[i++] = q.rz; A[i++] = q.x; A[i++] = q.y; A[i++] = q.z; A[i++] = q.s; }
    for (const n of this._scalarNames) A[i++] = p.k[n];
    const O = this._aOut;
    if (this._fadeT < this._fadeDur) {
      this._fadeT += dt;
      const w = smooth(this._fadeT / this._fadeDur), F = this._aFrom;
      for (let k = 0; k < this._n; k++) O[k] = F[k] + (A[k] - F[k]) * w;
    } else O.set(A);
    // 3) apply
    i = 0;
    for (const j of this._joints) {
      const g = j.g;
      g.rotation.set(O[i], O[i + 1], O[i + 2], 'YXZ');
      g.position.set(j.rest.x + O[i + 3] * VS, j.rest.y + O[i + 4] * VS, j.rest.z + O[i + 5] * VS);
      const s = O[i + 6], is = 1 / sqrt(Math.max(0.2, s));
      g.scale.set(is, s, is);
      i += CH;
    }
    this.k = {};
    for (const n of this._scalarNames) this.k[n] = O[i++];
    // 4) secondary motion
    this._secondary(dt);
    // 5) subclass extras (wheels, props, sprites) + face
    this._post(p, dt, O);
    this._updateFace(dt, f, def);
    // 6) finished one-shots
    if (!cur.loop && def.dur && cur.t >= def.dur && !cur.done && this._cur === cur) {
      cur.done = true;
      if (cur.onDone) cur.onDone(this);
      if (this._cur === cur && def.next !== null) this.play(typeof def.next === 'function' ? def.next(this) : def.next || 'idle', { fade: def.nextFade ?? 0.3 });
    }
  }

  _post() {}

  _resetPose(p) {
    for (const j of this._joints) { const q = p[j.name]; q.rx = q.ry = q.rz = q.x = q.y = q.z = 0; q.s = 1; }
    for (const n of this._scalarNames) p.k[n] = this._scalars[n];
    for (const k in p.vis) p.vis[k] = false;
    p.hand = p.handL = p.handR = null;
  }
  /** Blend two pose builders inside an animation: fa(p) at w = 0, fb(p) at w = 1. Hands / props come from the dominant side. */
  mixPose(p, w, fa, fb) {
    const A = this._mixA || (this._mixA = new Float32Array(this._n));
    this._resetPose(p); fa(p);
    let i = 0;
    for (const j of this._joints) { const q = p[j.name]; A[i++] = q.rx; A[i++] = q.ry; A[i++] = q.rz; A[i++] = q.x; A[i++] = q.y; A[i++] = q.z; A[i++] = q.s; }
    for (const n of this._scalarNames) A[i++] = p.k[n];
    const hL = p.handL, hR = p.handR, vis = { ...p.vis };
    this._resetPose(p); fb(p);
    i = 0;
    for (const j of this._joints) {
      const q = p[j.name];
      q.rx = A[i] + (q.rx - A[i]) * w; i++; q.ry = A[i] + (q.ry - A[i]) * w; i++; q.rz = A[i] + (q.rz - A[i]) * w; i++;
      q.x = A[i] + (q.x - A[i]) * w; i++; q.y = A[i] + (q.y - A[i]) * w; i++; q.z = A[i] + (q.z - A[i]) * w; i++; q.s = A[i] + (q.s - A[i]) * w; i++;
    }
    for (const n of this._scalarNames) { p.k[n] = A[i] + (p.k[n] - A[i]) * w; i++; }
    if (w < 0.5) { p.handL = hL; p.handR = hR; for (const k in p.vis) p.vis[k] = false; Object.assign(p.vis, vis); }
  }

  _secondary(dt) {
    if (!this._jiggles.length) return;
    this.root.updateWorldMatrix(true, false);
    const rq = this.root.getWorldQuaternion(_q).invert();
    const ryaw = this.root.getWorldDirection(_v2);
    const yawNow = atan2(ryaw.x, ryaw.z);
    for (const pr of this._probes.values()) {
      pr.g.updateWorldMatrix(true, false);
      pr.g.getWorldPosition(_v1);
      if (!pr.init || dt <= 0) { pr.p.copy(_v1); pr.v.set(0, 0, 0); pr.a.set(0, 0, 0); pr.yaw = yawNow; pr.wy = 0; pr.ay = 0; pr.init = true; continue; }
      const nv = _v3.subVectors(_v1, pr.p).divideScalar(dt);
      if (nv.lengthSq() > 400) nv.setLength(20);
      pr.a.subVectors(nv, pr.v).divideScalar(dt);
      if (pr.a.lengthSq() > 3600) pr.a.setLength(60);
      pr.v.copy(nv);
      pr.p.copy(_v1);
      pr.a.applyQuaternion(rq);
      let dy = yawNow - pr.yaw;
      dy = ((dy + PI) % TAU + TAU) % TAU - PI;
      const wy = dy / dt;
      pr.ay = clamp((wy - pr.wy) / dt, -200, 200);
      pr.wy = wy; pr.yaw = yawNow;
    }
    const keys = ['rotation', 'rotation', 'rotation'];
    for (const J of this._jiggles) {
      const pr = J.pr;
      const force = -(J.ax * pr.a.x + J.ay * pr.a.y + J.az * pr.a.z) - J.yaw * pr.ay;
      const x = clamp(J.sp.step(0, force, dt), -J.mx, J.mx);
      const g = this._joints[J.ji].g;
      if (J.ch === 'rx') g.rotation.x += x;
      else if (J.ch === 'ry') g.rotation.y += x;
      else if (J.ch === 'rz') g.rotation.z += x;
      else if (J.ch === 's') { const s = g.scale.y * (1 + x); g.scale.set(g.scale.x / sqrt(1 + x), s, g.scale.z / sqrt(1 + x)); }
      else if (J.ch === 'y') g.position.y += x * VS;
    }
    void keys;
  }

  _updateFace(dt, f, def) {
    if (!this.face) return;
    const E = this._EXPRS;
    const base = E[this._userExpr || f.expr || def.expr || 'neutral'] || E.neutral;
    const st = this._fst || (this._fst = {});
    Object.assign(st, base);
    if (this._userExpr && E[this._userExpr]) {
      // a user expression wins over the animation's eye/mouth overrides except for closed blinks
      if (f.mouth && !E[this._userExpr].mouthLock) st.mouth = f.mouth;
    } else {
      if (f.eyes) st.eyes = f.eyes;
      if (f.mouth) st.mouth = f.mouth;
      if (f.brows) st.brows = f.brows;
    }
    if (f.blush != null) st.blush = f.blush;
    if (f.tear != null) st.tear = f.tear;
    st.lookX = f.look ? f.look[0] : 0; st.lookY = f.look ? f.look[1] : 0;
    // blink
    this._blinkT -= dt;
    if (this._blinkT <= 0 && this._blinkPh < 0) this._blinkPh = 0;
    if (this._blinkPh >= 0) {
      this._blinkPh += dt;
      if (this._blinkPh > 0.14) { this._blinkPh = -1; this._blinkT = 1.6 + hash3(floor(this.time * 10), 3, 7) * 3; }
    }
    st.blink = f.blink && this._blinkPh >= 0 && (st.eyes === 'open' || st.eyes === 'half' || st.eyes === 'wide' || st.eyes === 'focused');
    st.t = this.time;
    this.face.update(st);
  }
}
const _q = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// ------------------------------------------------------------------ pose helpers
/**
 * Arm FK: side +1 = left (+X), -1 = right. fwd: forward swing (rad), out: outward
 * raise, tw: twist, el: elbow bend (forward), names: [upper, fore].
 */
export function arm(p, names, side, fwd = 0, out = 0, el = 0, tw = 0) {
  const u = p[names[0]], f = p[names[1]];
  u.rx = -fwd; u.rz = out * side; u.ry = tw * side;
  f.rx = -el;
}
export function legFK(p, names, side, fwd = 0, out = 0, kn = 0) {
  const u = p[names[0]], f = p[names[1]];
  u.rx = -fwd; u.rz = out * side;
  f.rx = kn;
}

// ------------------------------------------------------------------ 3D arm IK (port of foxRig solveArm)
const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3(), _E = new THREE.Vector3();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _eu = new THREE.Euler();
/**
 * Two-bone IK in the parent (chest) frame, all in voxels. Upper hangs along -Y at rest;
 * the forearm bends with negative rx. S: shoulder joint, T: wrist target, pole: elbow hint.
 * Writes Euler YXZ into p[nU] and rx into p[nF]; w blends with the existing FK values.
 */
export function armIK(p, nU, nF, S, T, L1, L2, pole, w = 1) {
  _S.set(S[0], S[1], S[2]); _T.set(T[0], T[1], T[2]);
  _D.subVectors(_T, _S);
  let dist = _D.length();
  dist = clamp(dist, abs(L1 - L2) + 0.3, (L1 + L2) * 0.995);
  const dir = _D.normalize();
  _P.set(pole[0], pole[1], pole[2]);
  _P.addScaledVector(dir, -_P.dot(dir));
  if (_P.lengthSq() < 1e-6) _P.set(0, 0, -1).addScaledVector(dir, -dir.z);
  _P.normalize();
  const a = acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
  _E.copy(_S).addScaledVector(dir, L1 * cos(a)).addScaledVector(_P, L1 * sin(a));
  _ay.subVectors(_S, _E).normalize();
  _az.copy(_S).addScaledVector(dir, dist).sub(_E);
  _az.addScaledVector(_ay, -_az.dot(_ay));
  if (_az.lengthSq() < 1e-6) _az.copy(_P).negate();
  _az.normalize();
  _ax.crossVectors(_ay, _az).normalize();
  _az.crossVectors(_ax, _ay);
  _m4.makeBasis(_ax, _ay, _az);
  _qq.setFromRotationMatrix(_m4);
  _eu.setFromQuaternion(_qq, 'YXZ');
  const b = acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1));
  const u = p[nU], f = p[nF];
  u.rx = lerp(u.rx, _eu.x, w); u.ry = lerp(u.ry, _eu.y, w); u.rz = lerp(u.rz, _eu.z, w);
  f.rx = lerp(f.rx, -(PI - b), w);
}

// ------------------------------------------------------------------ hands (fine voxels)
/** Cartoon hand, pivot at the wrist (top centre); fingers hang along -Y, palm faces inward, front = +Z. */
export function handModel(kind, side, skin, dark) {
  const v = new VoxelModel();
  const col = (x, y, z) => tone(x, y, z, skin, dark, skin, 0.12, 0);
  const sx = (x) => (side < 0 ? -1 - x : x);
  const put = (x, y, z, c) => v.set(sx(x), y, z, c);
  if (kind === 'open') {
    for (let x = -2; x <= 1; x++) for (let y = -5; y <= -1; y++) for (let z = -1; z <= 0; z++) put(x, y, z, col(x, y, z));
    for (let x = -2; x <= 1; x += 1) put(x, -6, z0(x), col(x, -6, 0));
    put(-3, -2, 0, col(0, 0, 0)); put(-4, -1, 0, col(0, 1, 0)); // thumb out
    put(-1, -6, 0, null);
    return v;
  }
  rbox(v, -2, 1, -5, -1, -2, 1, 1.1, col);
  if (side < 0) { const o = mirrorX(v); v.vox = o.vox; }
  if (kind === 'point') { for (let y = -9; y <= -5; y++) put(0, y, 0, col(0, y, 0)); put(0, -9, 0, dark); }
  if (kind === 'thumb') { for (let z = 2; z <= 4; z++) put(-1, -2, z, col(0, z, 0)); put(-1, -1, 4, col(0, 1, 0)); }
  if (kind === 'relax') { put(-3, -3, 1, col(0, 0, 1)); }
  if (kind === 'fist') { put(-3, -2, 1, col(0, 0, 1)); put(-3, -3, 1, dark); }
  return v;
}
const z0 = () => 0;
