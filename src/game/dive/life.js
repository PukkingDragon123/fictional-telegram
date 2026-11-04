// [v32 dive] Life under Loon Lake: fish schools (the game's own voxel fish, wiggling),
// lurkers (a pike in the weeds, a sturgeon and channel cats in the Deep Hole, Old Whiskers
// near the barge), a crayfish that guards its log, a painted turtle paddling about, a loon
// that dives in now and then, and the bubbles (pixel sprites that wobble up and pop at the
// surface). Everything shies away from the diver.
//
//   const L = new DiveLife(sceneHandle, { whiskers: true })
//   L.update(dt, t, diver)   L.bubble(x, y, z, n, size)   L.whiskersSeen(diver) -> bool   L.dispose()
import * as THREE from 'three';
import { SPECIES_BY_ID } from '../../data/species.js';
import { fishAtlas, FISH_TPU } from '../fishSprites.js';
import { diveGeo, crayfishModel, turtleModel } from '../../entities/diveModels.js';
import { uwMat, UW, SURF, X0, X1, DEEP_X } from '../../entities/diveScene.js';
import { FV, VS, pixTex } from '../../entities/critterKit.js';
import { VoxelModel } from '../../core/voxel.js';

const { sin, cos, abs, max, min, PI, atan2, hypot, floor } = Math;
const TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ fish: the game's own pixel fish art
// Each fish is a camera-facing quad cut from the fish atlas (src/art/fishArt.js: 5 swim frames per
// species and morph), flipped by heading, darkened with depth and fogged in dithered steps like the
// rest of the scene. One InstancedMesh per species pack.
let ATLAS = null, ATLAS_TEX = null;
function atlas() {
  if (!ATLAS) { ATLAS = fishAtlas(); ATLAS_TEX = pixTex(ATLAS.canvas); ATLAS_TEX.flipY = true; ATLAS_TEX.needsUpdate = true; }
  return ATLAS;
}
const FISH_VERT = /* glsl */ `
attribute float aPhase;
attribute float aFlip;
uniform float uTime;
uniform vec4 uRects[5];
uniform vec2 uSize;
uniform vec2 uTex;
varying vec2 vUv;
varying vec3 vWp;
varying float vView;
void main() {
  float f = mod(floor(uTime * 9.0 + aPhase), 5.0);
  vec4 R = uRects[0];
  if (f > 0.5) R = uRects[1];
  if (f > 1.5) R = uRects[2];
  if (f > 2.5) R = uRects[3];
  if (f > 3.5) R = uRects[4];
  vec2 sz = uSize * vec2(R.z, R.w) / max(vec2(uRects[0].z, uRects[0].w), vec2(1.0));
  float u = aFlip > 0.5 ? 1.0 - uv.x : uv.x;
  vUv = vec2((R.x + u * R.z) / uTex.x, 1.0 - (R.y + (1.0 - uv.y) * R.w) / uTex.y);
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * sz;
  vWp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vView = -c.z;
  gl_Position = projectionMatrix * c;
}`;
const FISH_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uSurf;
uniform vec3 uFog;
uniform float uGold;
varying vec2 vUv;
varying vec3 vWp;
varying float vView;
float uwB(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float uwBay(vec2 a) { return uwB(0.5 * a) * 0.25 + uwB(a); }
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 col = t.rgb;
  float bay = uwBay(gl_FragCoord.xy);
  float d = clamp((uSurf - vWp.y) / 10.0, 0.0, 1.0);
  float dk = floor(d * 4.0 + bay) / 4.0;
  col *= mix(vec3(1.0), vec3(0.42, 0.62, 0.74), dk * 0.75 * (1.0 - uGold * 0.6));
  float ff = smoothstep(31.5, 47.0, vView);
  ff = floor(ff * 5.0 + bay * 0.94) / 5.0;
  col = mix(col, uFog, ff);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** A group of fish drawn as one InstancedMesh of billboards: positions + headings set per frame. */
export class FishPack {
  constructor(parent, id, n, { scale = 1, golden = false } = {}) {
    const A = atlas();
    const morph = golden ? 'golden' : 'normal';
    const rects = [0, 1, 2, 3, 4].map((f) => A.frame(id, morph, f, false));
    this.ok = !!rects[0];
    this.n = n;
    if (!this.ok) return;
    const r0 = rects[0];
    this.w = (r0.w / FISH_TPU); this.h = (r0.h / FISH_TPU);
    this.len = this.w * scale;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(n).map(() => Math.random() * 5), 1);
    this.flip = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    geo.setAttribute('aPhase', this.phase);
    geo.setAttribute('aFlip', this.flip);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FISH_VERT, fragmentShader: FISH_FRAG,
      uniforms: {
        uTime: UW.uTime, uSurf: UW.uSurf, uMap: { value: ATLAS_TEX },
        uRects: { value: rects.map((r) => new THREE.Vector4(r.x, r.y, r.w, r.h)) },
        uSize: { value: new THREE.Vector2(this.w * scale, this.h * scale) },
        uTex: { value: new THREE.Vector2(A.canvas.width, A.canvas.height) },
        uFog: { value: new THREE.Color(0x174652) }, uGold: { value: golden ? 1 : 0 },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.scaleK = scale;
    parent.add(this.mesh);
    this._m = new THREE.Matrix4();
  }
  set scale(k) { if (this.ok) this.mat.uniforms.uSize.value.set(this.w * k, this.h * k); }
  set(i, x, y, z, heading) {
    if (!this.ok) return;
    this._m.makeTranslation(x, y, z);
    this.mesh.setMatrixAt(i, this._m);
    const c = Math.cos(heading);
    if (Math.abs(c) > 0.15) this.flip.array[i] = c < 0 ? 1 : 0;
  }
  flush() { if (!this.ok) return; this.mesh.instanceMatrix.needsUpdate = true; this.flip.needsUpdate = true; }
  dispose() { this.mesh?.removeFromParent(); this.geo?.dispose(); this.mat?.dispose(); this.mesh?.dispose?.(); }
}

// ------------------------------------------------------------------ bubbles (pixel sprites)
const BUB_ROWS = [
  ['.kk.', 'kwbk', 'kbbk', '.kk.'],
  ['..kkk..', '.kwwbk.', 'kwb..bk', 'kb...bk', 'kb...bk', '.kbbbk.', '..kkk..'],
  ['...kkkk...', '..kwwbbk..', '.kwb...bk.', 'kwb.....bk', 'kb......bk', 'kb......bk', 'kb.....bbk', '.kb...bbk.', '..kbbbbk..', '...kkkk...'],
];
const BUB_PAL = { k: '#2a7a9a', w: '#ffffff', b: '#9ae4f4' };
const POP_ROWS = ['k.k.k', '.....', 'k...k', '.....', 'k.k.k'];
let bubMats = null;
function bubbleMats() {
  if (bubMats) return bubMats;
  const mk = (rows) => {
    const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue; x.fillStyle = BUB_PAL[ch] || '#fff'; x.fillRect(i, j, 1, 1); } });
    return new THREE.SpriteMaterial({ map: pixTex(c), alphaTest: 0.5, fog: false });
  };
  bubMats = { b: BUB_ROWS.map(mk), pop: mk(POP_ROWS) };
  return bubMats;
}

// ------------------------------------------------------------------ the loon (a quick voxel bird)
function loonModel() {
  const v = new VoxelModel();
  for (let x = -14; x <= 12; x++) for (let y = -5; y <= 5; y++) for (let z = -5; z <= 5; z++) {
    const u = (x + 14) / 26;
    const r = 5 * Math.sin(PI * (0.1 + u * 0.85));
    if (hypot(y * 1.1, z) > r) continue;
    const back = y > 0;
    const chk = ((x + 40) % 3 === 0) && ((z + 40) % 2 === 0);
    v.set(x, y, z, back ? (chk ? 0xf6f6f0 : 0x1a1c22) : 0xf2f2ec);
  }
  for (let x = 10; x <= 17; x++) for (let y = 1; y <= 7; y++) for (let z = -2; z <= 2; z++) if (hypot((x - 14) * 0.8, y - 4, z * 1.2) < 3.4) v.set(x, y, z, 0x14161c);
  for (let x = 13; x <= 15; x++) for (const z of [-3, 3]) v.set(x, 1, z, (x & 1) ? 0xf6f6f0 : 0x14161c); // the necklace
  for (const z of [-2, 2]) v.set(16, 5, z, 0xd8302a); // red eye
  for (let x = 18; x <= 23; x++) { v.set(x, 4 - (x > 21 ? 1 : 0), 0, 0x2a2a30); v.set(x, 3, 0, 0x3a3a42); }
  for (let x = -16; x <= -12; x++) for (const z of [-2, 2]) v.set(x, -2, z, 0x1a1c22); // feet trailing
  return v;
}

// ------------------------------------------------------------------ the life system
export class DiveLife {
  constructor(S, { whiskers = false, seed = 3 } = {}) {
    this.S = S;
    this.group = new THREE.Group();
    S.scene.add(this.group);
    const R = rnd(seed);
    // schools: species, count, home box, scale, speed
    const SCH = [
      { id: 'cisco', n: 14, cx: -6, cy: 3.6, cz: -1.2, rx: 9, ry: 1.0, rz: 2.2, scale: 0.55, spd: 0.18 },
      { id: 'perch', n: 7, cx: 2.5, cy: 1.8, cz: 0.2, rx: 6, ry: 0.7, rz: 1.8, scale: 0.6, spd: 0.13 },
      { id: 'bluegill', n: 5, cx: -20, cy: 4.6, cz: 0.4, rx: 3.2, ry: 0.6, rz: 1.5, scale: 0.6, spd: 0.16 },
      { id: 'whitefish', n: 6, cx: 18, cy: 0.4, cz: -1.0, rx: 6, ry: 1.2, rz: 1.8, scale: 0.65, spd: 0.1 },
      { id: 'pumpkinseed', n: 5, cx: 8, cy: 3.6, cz: -1.4, rx: 3, ry: 0.6, rz: 1.2, scale: 0.6, spd: 0.15 },
    ];
    this.schools = SCH.map((d, k) => {
      const pack = new FishPack(this.group, d.id, d.n, { scale: d.scale });
      const fish = [];
      for (let i = 0; i < d.n; i++) fish.push({ ox: (R() - 0.5) * 3.4, oy: (R() - 0.5) * 1.3, oz: (R() - 0.5) * 1.8, ph: R() * TAU, wob: R() * TAU, x: d.cx, y: d.cy, z: d.cz, h: 0, sc: 0 });
      return { d, pack, fish, t: R() * 50, x: d.cx, y: d.cy, z: d.cz, k };
    });
    // lurkers
    const LUR = [
      { id: 'pike', x: -10.5, y: 2.0, z: -4.4, scale: 1.25, roam: 2.2, spd: 0.05 },
      { id: 'sturgeon', x: 19, y: -2.4, z: -0.6, scale: 1.4, roam: 5.5, spd: 0.08 },
      { id: 'catfish', x: 15.5, y: -1.6, z: 0.8, scale: 1.1, roam: 3, spd: 0.07 },
      { id: 'catfish', x: 23.5, y: -1.9, z: -2.2, scale: 1.0, roam: 2.5, spd: 0.06 },
      { id: 'bass', x: -14.5, y: 1.6, z: 1.5, scale: 1.0, roam: 1.5, spd: 0.05 },
    ];
    this.lurk = LUR.map((d) => ({ d, pack: new FishPack(this.group, d.id, 1, { scale: d.scale }), t: R() * 30, x: d.x, y: d.y, z: d.z, h: 0, flee: 0 }));
    if (whiskers) {
      // Old Whiskers: a golden channel catfish the size of a canoe, slowly circling the barge
      const b = S.anchors.barge;
      this.whisk = { pack: new FishPack(this.group, 'catfish', 1, { scale: 2.8, golden: true }), t: 0, x: b.x, y: b.y - 0.6, z: b.z + 2, h: 0, cx: b.x, cy: b.y - 0.8, cz: b.z + 1.8 };
    }
    // the crayfish by the log
    const L = S.anchors.log;
    this.cray = null;
    if (L) {
      const g = new THREE.Group();
      const mk = (part) => { const geo = diveGeo('cray_' + part, () => crayfishModel(part), { scale: FV * 0.9 }); return new THREE.Mesh(geo, uwMat(geo)); };
      const body = mk('body'); g.add(body);
      const cl = mk('clawL'), cr = mk('clawR');
      cl.position.set(7 * FV * 0.9, 2 * FV, 2.4 * FV * 0.9); cr.position.set(7 * FV * 0.9, 2 * FV, -2.4 * FV * 0.9);
      g.add(cl, cr);
      this.group.add(g);
      this.cray = { g, cl, cr, home: { x: L.x, z: L.z }, x: L.x + 0.6, z: L.z + 0.5, h: PI, t: 0, mode: 'walk', tx: L.x + 1.2, tz: L.z + 0.8, raise: 0 };
    }
    // the painted turtle
    {
      const g = new THREE.Group();
      const mk = (part) => { const geo = diveGeo('turt_' + part, () => turtleModel(part), { scale: FV * 1.1 }); return new THREE.Mesh(geo, uwMat(geo)); };
      const shell = mk('shell'); g.add(shell);
      const head = mk('head'); head.position.set(14 * FV * 1.1, 0.5 * FV, 0); g.add(head);
      const fl = mk('flipL'), fr = mk('flipR'), ll = mk('legL'), lr = mk('legR');
      fl.position.set(7 * FV * 1.1, 0, 9 * FV * 1.1); fr.position.set(7 * FV * 1.1, 0, -9 * FV * 1.1);
      ll.position.set(-9 * FV * 1.1, 0, 7 * FV * 1.1); lr.position.set(-9 * FV * 1.1, 0, -7 * FV * 1.1);
      g.add(fl, fr, ll, lr);
      this.group.add(g);
      this.turtle = { g, fl, fr, ll, lr, head, t: R() * 40, x: -2, y: 4, z: -1 };
    }
    // the loon
    {
      const geo = diveGeo('loon', loonModel, { scale: FV * 1.3 });
      const m = new THREE.Mesh(geo, uwMat(geo));
      m.visible = false;
      this.group.add(m);
      this.loon = { m, t: 0, next: 18 + R() * 14, on: false, x: 0, y: SURF, z: -1, dir: 1 };
    }
    // drifting motes (pollen, silt, tiny critters): single crisp pixels catching the light
    {
      const N = 170, pos = new Float32Array(N * 3), seed = new Float32Array(N);
      for (let i = 0; i < N; i++) { const x = X0 + R() * (X1 - X0), z = -6 + R() * 9; pos[i * 3] = x; pos[i * 3 + 1] = S.bedH(x, z) + 0.2 + R() * (SURF - S.bedH(x, z) - 0.3); pos[i * 3 + 2] = z; seed[i] = R(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: UW.uTime, uSurf: UW.uSurf },
        vertexShader: `attribute float aSeed; uniform float uTime; varying float vK; varying float vY; uniform float uSurf;
          void main() { vec3 p = position; float t = uTime * (0.15 + aSeed * 0.2) + aSeed * 40.0;
            p.x += sin(t * 0.7) * 0.5 + uTime * 0.04 * (aSeed - 0.3); p.y += sin(t) * 0.25; p.z += cos(t * 0.6) * 0.3;
            vK = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 30.0); vY = p.y;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSeed > 0.82 ? 2.0 : 1.0; }`,
        fragmentShader: `varying float vK; varying float vY; uniform float uSurf;
          void main() { if (vK < 0.35) discard; float d = clamp((uSurf - vY) / 9.0, 0.0, 1.0); gl_FragColor = vec4(mix(vec3(0.85, 0.96, 0.9), vec3(0.45, 0.65, 0.7), d), 1.0); }`,
      });
      this.motes = new THREE.Points(g, m);
      this.motes.frustumCulled = false;
      this.group.add(this.motes);
    }
    // bubbles
    this.bubbles = [];
    this.pops = [];
    this.ventT = 0;
  }

  /** a puff of bubbles at a point (size 0..2) */
  bubble(x, y, z, n = 3, size = 1) {
    const M = bubbleMats();
    for (let i = 0; i < n; i++) {
      if (this.bubbles.length > 140) break;
      const sz = clamp(size + (Math.random() < 0.3 ? -1 : 0), 0, 2);
      const s = new THREE.Sprite(M.b[sz]);
      const px = [0.05, 0.085, 0.12][sz];
      s.scale.setScalar(px);
      s.position.set(x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.1, z + (Math.random() - 0.5) * 0.15);
      this.group.add(s);
      this.bubbles.push({ s, vy: 0.55 + sz * 0.2 + Math.random() * 0.3, ph: Math.random() * TAU, t: 0, delay: i * 0.06 });
    }
  }

  whiskersNear(diver, r = 4.2) {
    const w = this.whisk;
    return !!w && hypot(w.x - diver.x, w.y - diver.y) < r;
  }

  update(dt, t, diver) {
    const S = this.S;
    // ---- schools
    for (const sc of this.schools) {
      const d = sc.d;
      sc.t += dt * d.spd;
      const tx = d.cx + sin(sc.t * 1.0) * d.rx, ty = d.cy + sin(sc.t * 2.3 + sc.k) * d.ry, tz = d.cz + sin(sc.t * 1.7 + sc.k) * d.rz;
      const vx = cos(sc.t) * d.rx * d.spd, vz = cos(sc.t * 1.7 + sc.k) * 1.7 * d.rz * d.spd;
      sc.x = tx; sc.y = ty; sc.z = tz;
      const head = atan2(vz, vx);
      sc.fish.forEach((f, i) => {
        f.wob += dt * (0.6 + (i % 3) * 0.2);
        let x = tx + f.ox + sin(f.wob) * 0.25, y = ty + f.oy + sin(f.wob * 1.3) * 0.12, z = tz + f.oz + cos(f.wob * 0.8) * 0.2;
        // scatter away from the diver
        const dx = x - diver.x, dy = y - diver.y, dz = (z - diver.z) * 0.6, dd = hypot(dx, dy, dz);
        f.sc = max(f.sc - dt * 0.5, dd < 1.8 ? (1.8 - dd) / 1.8 : 0);
        if (f.sc > 0.01) { const k = f.sc * 1.6 / max(0.3, dd); x += dx * k; y += dy * k * 0.6; z += dz * k; }
        y = clamp(y, S.bedH(x, z) + 0.25, SURF - 0.25);
        const dxm = x - f.x, dzm = z - f.z;
        const h = abs(dxm) + abs(dzm) > 0.002 ? atan2(dzm, dxm) : head;
        let dh = h - f.h; dh = atan2(sin(dh), cos(dh));
        f.h += dh * min(1, dt * 5);
        f.x = x; f.y = y; f.z = z;
        f.ph += dt * (9 + f.sc * 14);
        sc.pack.set(i, x, y, z, f.h, 0, f.ph, 0.035 + f.sc * 0.04);
      });
      sc.pack.flush();
    }
    // ---- lurkers: slow patrols, a burst away when the diver comes close
    for (const L of this.lurk) {
      const d = L.d;
      L.t += dt * d.spd;
      let tx = d.x + sin(L.t) * d.roam, ty = d.y + sin(L.t * 1.9) * 0.3, tz = d.z + sin(L.t * 0.7) * 0.8;
      const dd = hypot(L.x - diver.x, L.y - diver.y);
      L.flee = max(L.flee - dt * 0.4, dd < 2.2 ? 1 : 0);
      if (L.flee > 0) { tx = L.x + Math.sign(L.x - diver.x || 1) * 2; ty = L.y + Math.sign(L.y - diver.y || 1) * 0.5; }
      const k = min(1, dt * (0.8 + L.flee * 2));
      const nx = L.x + (tx - L.x) * k, nz = L.z + (tz - L.z) * k;
      const mx = nx - L.x, mz = nz - L.z;
      if (abs(mx) + abs(mz) > 0.0005) { let dh = atan2(mz, mx) - L.h; dh = atan2(sin(dh), cos(dh)); L.h += dh * min(1, dt * 3); }
      L.x = nx; L.z = nz; L.y += (ty - L.y) * k;
      L.y = clamp(L.y, S.bedH(L.x, L.z) + 0.3, SURF - 0.4);
      L.ph = (L.ph || 0) + dt * (4 + L.flee * 10);
      L.pack.set(0, L.x, L.y, L.z, L.h, 0, L.ph, 0.03 + L.flee * 0.05);
      L.pack.flush();
    }
    // ---- Old Whiskers
    const W = this.whisk;
    if (W) {
      W.t += dt * 0.12;
      const x = W.cx + cos(W.t) * 3.2, z = W.cz + sin(W.t) * 1.2, y = W.cy + sin(W.t * 2.1) * 0.25;
      const h = atan2(z - W.z, x - W.x);
      W.x = x; W.y = y; W.z = z; W.h = h;
      W.ph = (W.ph || 0) + dt * 3;
      W.pack.set(0, x, y, z, h, 0, W.ph, 0.025);
      W.pack.flush();
      if (Math.random() < dt * 0.4) this.bubble(x + cos(h) * 1.1, y + 0.2, z + sin(h) * 1.1, 2, 1);
    }
    // ---- the crayfish: potters about near its log, claws up when the diver comes, scuttles home backwards
    const C = this.cray;
    if (C) {
      C.t += dt;
      const dd = hypot(C.x - diver.x, (S.bedH(C.x, C.z) - diver.y) * 0.8);
      const scared = dd < 1.6;
      C.raise += ((scared ? 1 : 0) - C.raise) * min(1, dt * 6);
      if (scared) { C.tx = C.home.x; C.tz = C.home.z; }
      else if (hypot(C.tx - C.x, C.tz - C.z) < 0.05 && Math.random() < dt * 0.5) { C.tx = C.home.x + (Math.random() - 0.3) * 2.2; C.tz = C.home.z + (Math.random() - 0.5) * 1.4; }
      const dx = C.tx - C.x, dz = C.tz - C.z, dl = hypot(dx, dz);
      if (dl > 0.02) {
        const sp = (scared ? 0.9 : 0.25) * dt;
        C.x += dx / dl * min(sp, dl); C.z += dz / dl * min(sp, dl);
        const want = scared ? atan2(-dz, -dx) : atan2(dz, dx);
        let dh = want - C.h; dh = atan2(sin(dh), cos(dh)); C.h += dh * min(1, dt * 4);
      }
      const y = S.bedH(C.x, C.z);
      C.g.position.set(C.x, y + 0.02 + abs(sin(C.t * 14)) * 0.01 * (dl > 0.02 ? 1 : 0), C.z);
      C.g.rotation.set(0, -C.h, -C.raise * 0.25);
      const snap = sin(C.t * 9) * 0.2 * C.raise;
      C.cl.rotation.set(0, -0.3 - snap, C.raise * 0.9); C.cr.rotation.set(0, 0.3 + snap, C.raise * 0.9);
    }
    // ---- the turtle: lazy figure-eights, up to the surface for air, flippers rowing
    const T = this.turtle;
    if (T) {
      T.t += dt * 0.09;
      const x = -4 + sin(T.t) * 15, y = 3.2 + sin(T.t * 2) * 1.8, z = -2.2 + sin(T.t * 3) * 1.2;
      const vx = x - T.x, vy = y - T.y;
      T.x = x; T.y = y; T.z = z;
      const dir = vx >= 0 ? 1 : -1;
      T.g.position.set(x, y, z);
      T.g.rotation.set(0, dir > 0 ? 0 : PI, Math.atan2(vy, abs(vx) + 1e-4) * 0.8);
      const row = sin(T.t * 60);
      T.fl.rotation.set(row * 0.6, 0.3 + row * 0.4, 0); T.fr.rotation.set(-row * 0.6, -0.3 - row * 0.4, 0);
      T.ll.rotation.set(0, -row * 0.3, 0); T.lr.rotation.set(0, row * 0.3, 0);
      T.head.rotation.set(0, sin(T.t * 7) * 0.2, 0.1);
      if (y > SURF - 0.6 && Math.random() < dt * 2) this.bubble(x + dir * 0.4, y, z, 1, 0);
    }
    // ---- the loon dives in after the cisco now and then
    const N = this.loon;
    if (N) {
      N.t += dt;
      if (!N.on && N.t > N.next) {
        const cs = this.schools[0];
        N.on = true; N.t = 0; N.dir = Math.random() < 0.5 ? 1 : -1;
        N.x = cs.x - N.dir * 7; N.z = cs.z; N.tx = cs.x; N.ty = cs.y; N.y = SURF;
        this.bubble(N.x, SURF - 0.2, N.z, 8, 2);
      }
      if (N.on) {
        const u = N.t / 4.2;
        const x = N.x + N.dir * u * 14, y = SURF - sin(min(1, u) * PI) * (SURF - N.ty + 0.5), z = N.z;
        N.m.visible = u < 1;
        N.m.position.set(x, y, z);
        const vy = -cos(min(1, u) * PI);
        N.m.rotation.set(0, N.dir > 0 ? 0 : PI, Math.atan2(vy * (SURF - N.ty) * PI / 4.2, 14 / 4.2) * 0.9);
        if (Math.random() < dt * 8) this.bubble(x - N.dir * 0.4, y, z, 1, 0);
        // the school bolts
        const cs = this.schools[0];
        if (hypot(x - cs.x, y - cs.y) < 3) for (const f of cs.fish) f.sc = max(f.sc, 0.8);
        if (u >= 1) { N.on = false; N.t = 0; N.next = 30 + Math.random() * 30; N.m.visible = false; this.bubble(x, SURF - 0.2, z, 6, 2); }
      }
    }
    // ---- vents puff
    this.ventT -= dt;
    if (this.ventT <= 0) {
      this.ventT = 0.35 + Math.random() * 0.5;
      const v = S.anchors.vents[floor(Math.random() * S.anchors.vents.length)];
      if (v) this.bubble(v.x, v.y + 0.1, v.z, 1 + floor(Math.random() * 2), floor(Math.random() * 2));
    }
    // ---- bubbles rise, wobble, pop at the surface
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      if (b.t < b.delay) continue;
      b.vy = min(1.4, b.vy + dt * 0.4);
      b.s.position.y += b.vy * dt;
      b.s.position.x += sin(b.t * 7 + b.ph) * dt * 0.25;
      if (b.s.position.y > SURF - 0.04) {
        b.s.removeFromParent();
        this.bubbles.splice(i, 1);
        if (this.pops.length < 30) { const p = new THREE.Sprite(bubbleMats().pop); p.scale.setScalar(0.1); p.position.copy(b.s.position); this.group.add(p); this.pops.push({ p, t: 0 }); }
      }
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]; p.t += dt;
      p.p.scale.setScalar(0.1 + p.t * 0.25);
      if (p.t > 0.25) { p.p.removeFromParent(); this.pops.splice(i, 1); }
    }
    void X0; void X1; void DEEP_X; void VS;
  }

  dispose() {
    for (const s of this.schools) s.pack.dispose();
    this.motes?.geometry.dispose(); this.motes?.material.dispose();
    for (const L of this.lurk) L.pack.dispose();
    this.whisk?.pack.dispose();
    this.group.removeFromParent();
  }
}
