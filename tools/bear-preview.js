// Bear rig preview: a big close-up of one bear plus a lineup of every type at
// game zoom, with pose / face / type buttons and an eating showreel.
// URL: ?pose=eat&type=boss&zoom=close|lineup|both|sheet&face=love&reel=1
//      &water=1&speed=1.6&paused=1&t=0.5&ps=2&yaw=-0.4&pitch=28&wupp=0.009&ui=0&mat=angry&rot=0.3
// Console: __prev.step(seconds), __prev.set({ pose, type, face, reel, water, zoom })
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { BEAR_TYPES } from '../src/data/bears.js';
import { BearRig, BEAR_POSES, FACE_EXPRESSIONS, POSE_DURATION, preloadBearGeometries } from '../src/entities/bearRig.js';

const Q = new URLSearchParams(location.search);
const TYPES = Object.keys(BEAR_TYPES);
const S = {
  pose: Q.get('pose') || 'idle',
  type: Q.get('type') || 'office',
  face: Q.get('face') || null,
  zoom: Q.get('zoom') || 'both',
  reel: Q.has('reel') ? Q.get('reel') === '1' : !Q.has('pose'),
  water: Q.get('water') === '1',
  speed: +(Q.get('speed') ?? 1.8),
  paused: Q.get('paused') === '1',
  ts: +(Q.get('ts') || 1),
  mat: Q.get('mat') || 'normal',
  rot: +(Q.get('rot') || 0),
  sync: Q.get('sync') === '1',
};
const WATER_Y = -0.1;

// ------------------------------------------------------------------ stage
function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const cols = ['#6f9e3c', '#679535', '#77a643', '#6b9a38', '#628f33', '#7aab47'];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const n = hash(x >> 1, y >> 1, 3) * 0.6 + hash(x, y, 9) * 0.4;
      g.fillStyle = cols[Math.floor(n * cols.length)];
      g.fillRect(x, y, 1, 1);
    }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash(i, 1, 5) * 32), y = Math.floor(hash(i, 2, 5) * 32);
    g.fillStyle = '#86b84e'; g.fillRect(x, y, 1, 1); g.fillStyle = '#577f2c'; g.fillRect(x, (y + 1) % 32, 1, 1);
  }
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(hash(i, 7, 1) * 30) + 1, y = Math.floor(hash(i, 8, 1) * 30) + 1;
    g.fillStyle = ['#ffe070', '#ffffff', '#f49ab4', '#b8a0ff', '#ffffff'][i];
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const n = hash(x >> 2, y >> 1, 11);
      g.fillStyle = n > 0.93 ? '#cdf2ff' : n > 0.75 ? '#5fb9d6' : '#4aa6c6';
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GRASS = grassTexture(), WATER = waterTexture();

function makeStage(w, d, pond) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ec6e6);
  // ground with a pond hole (pond = {x0, x1, z0, z1})
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(w / 2, d / 2); shape.lineTo(-w / 2, d / 2); shape.lineTo(-w / 2, -d / 2);
  const hole = new THREE.Path();
  // shape y maps to -z after rotateX(-PI/2)
  hole.moveTo(pond.x0, -pond.z1); hole.lineTo(pond.x0, -pond.z0); hole.lineTo(pond.x1, -pond.z0); hole.lineTo(pond.x1, -pond.z1); hole.lineTo(pond.x0, -pond.z1);
  shape.holes.push(hole);
  const gg = new THREE.ShapeGeometry(shape);
  gg.rotateX(-Math.PI / 2);
  const gm = GRASS.clone(); gm.repeat.set(0.5, 0.5); gm.needsUpdate = true;
  const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ map: gm }));
  ground.receiveShadow = true;
  scene.add(ground);
  // pond: sandy floor, soil walls, translucent water
  const pw = pond.x1 - pond.x0, pd = pond.z1 - pond.z0, cx = (pond.x0 + pond.x1) / 2, cz = (pond.z0 + pond.z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshLambertMaterial({ color: 0x8a7a50 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, -2.2, cz); scene.add(floor);
  const wallM = new THREE.MeshLambertMaterial({ color: 0x5a4430, side: THREE.DoubleSide });
  for (const [x, z, ww, ry] of [[cx, pond.z0, pw, 0], [cx, pond.z1, pw, 0], [pond.x0, cz, pd, Math.PI / 2], [pond.x1, cz, pd, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, 2.2), wallM);
    m.position.set(x, -1.1, z); m.rotation.y = ry; scene.add(m);
  }
  const wt = WATER.clone(); wt.repeat.set(pw / 2, pd / 2); wt.needsUpdate = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshLambertMaterial({ map: wt, transparent: true, opacity: 0.8, depthWrite: false }));
  water.rotation.x = -Math.PI / 2; water.position.set(cx, WATER_Y, cz); water.renderOrder = 5;
  scene.add(water);
  // warm 5 PM sun + bluish sky light
  const sun = new THREE.DirectionalLight(0xffcf98, 2.55);
  sun.position.set(-6, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 0.5; sc.far = 60;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x646838, 1.08));
  return { scene, sun, water, pond };
}

// ------------------------------------------------------------------ fish prop
function fishCanvas(stage) {
  // 24x11 pixel trout, stage 0 = whole, 1/2 = bitten, 3 = bone
  const W = 24, H = 11;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  if (stage < 3) {
    for (let x = 0; x < W; x++) {
      const t = x / (W - 1);
      const tail = x < 5;
      const hh = tail ? 1 + (4 - x) * 0.9 : Math.sin(Math.PI * (0.1 + 0.85 * ((x - 5) / (W - 6)))) * 3.9 + 0.8;
      for (let y = 0; y < H; y++) {
        const dy = y - 5;
        if (Math.abs(dy) > hh) continue;
        let col = dy < -1 ? '#4f7a3a' : dy > 1.5 ? '#f4e4c0' : '#e0874a';
        if (tail) col = '#8a6a3a';
        if (!tail && dy === 0) col = '#f06a7a';
        if (!tail && hash(x, y, 4) > 0.83 && dy < 1) col = '#2a3a22';
        if (Math.abs(dy) >= hh - 0.9) col = '#3a2a1a';
        P(x, y, col);
      }
      void t;
    }
    P(20, 4, '#ffffff'); P(21, 4, '#1a1010'); P(22, 6, '#3a2a1a');
    // bites out of the back
    const bite = (bx, by, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - bx) ** 2 + (y - by) ** 2 < r * r) g.clearRect(x, y, 1, 1); };
    if (stage >= 1) bite(13, -0.5, 3.2);
    if (stage >= 2) { bite(9, 11, 3.2); bite(16, 11.5, 2.8); }
  } else {
    // leftover bone: head, spine, ribs, tail
    for (let x = 4; x <= 18; x++) P(x, 5, '#f4efe0');
    for (let x = 6; x <= 17; x += 2) { P(x, 3, '#e8e0cc'); P(x, 4, '#f4efe0'); P(x, 6, '#f4efe0'); P(x, 7, '#e8e0cc'); }
    for (let y = 2; y <= 8; y++) for (let x = 18; x <= 22; x++) if ((x - 20) ** 2 + (y - 5) ** 2 < 7) P(x, y, (x + y) % 3 ? '#e0874a' : '#c86a3a');
    P(21, 4, '#1a1010');
    for (let y = 1; y <= 9; y++) if (Math.abs(y - 5) >= 1) P(Math.round(1 + Math.abs(y - 5) * 0.5), y, '#8a6a3a');
    P(2, 5, '#8a6a3a'); P(3, 5, '#f4efe0');
  }
  return c;
}
const FISH_FRAMES = [0, 1, 2, 3].map((s) => {
  const t = new THREE.CanvasTexture(fishCanvas(s));
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
});

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _qq = new THREE.Quaternion();
function makeFishQuad() {
  const mat = new THREE.MeshLambertMaterial({ map: FISH_FRAMES[0], alphaTest: 0.5, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(24 / 26, 11 / 26), mat);
  m.userData.wiggle = 1;
  m.onBeforeRender = (r, sc, camera) => {
    m.matrixWorld.decompose(_p, _q, _s);
    const wig = Math.sin(performance.now() / 70) * 0.3 * (m.userData.wiggle ?? 1);
    _q.copy(camera.quaternion).multiply(_qq.setFromAxisAngle(_z, wig + (m.userData.tilt || 0)));
    m.matrixWorld.compose(_p, _q, _s);
  };
  m.userData.setStage = (s) => { mat.map = FISH_FRAMES[Math.min(3, s)]; };
  m.userData.dispose = () => { m.geometry.dispose(); mat.dispose(); };
  return m;
}

// ------------------------------------------------------------------ particles
class Bits {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    this.mats = new Map();
  }
  mat(c) { if (!this.mats.has(c)) this.mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return this.mats.get(c); }
  burst(p, n, colors, { speed = 2.2, up = 2.2, life = 0.6, size = 1, grav = 9, dir = null } = {}) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, this.mat(colors[i % colors.length]));
      m.position.copy(p);
      m.scale.setScalar(size * (0.7 + Math.random() * 0.6));
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * Math.random(), up * (0.5 + Math.random() * 0.8), Math.sin(a) * speed * Math.random());
      if (dir) v.add(dir);
      this.scene.add(m);
      this.list.push({ m, v, life, t: 0, grav });
    }
  }
  flyer(obj, v, spin) { this.scene.add(obj); this.list.push({ m: obj, v, life: 1.4, t: 0, grav: 9, spin, keep: true }); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.t += dt;
      b.v.y -= b.grav * dt;
      b.m.position.addScaledVector(b.v, dt);
      if (b.spin) b.m.userData.tilt = (b.m.userData.tilt || 0) + b.spin * dt;
      if (b.m.position.y < 0.03 && !b.keep) { b.m.position.y = 0.03; b.v.multiplyScalar(0.3); }
      if (b.t > b.life) { this.scene.remove(b.m); if (b.keep) b.m.userData.dispose?.(); this.list.splice(i, 1); }
    }
  }
}

// ------------------------------------------------------------------ views
const closeCv = document.getElementById('close'), lineCv = document.getElementById('line');
const closeWrap = document.getElementById('closeWrap'), lineWrap = document.getElementById('lineWrap');
const closeStage = makeStage(40, 40, { x0: 2.6, x1: 12, z0: -6, z1: 5 });
const lineStage = makeStage(80, 40, { x0: -30, x1: 30, z0: 2.2, z1: 7 });
const closeR = new PixelRenderer(closeCv), lineR = new PixelRenderer(lineCv);
const closeCam = new CameraRig(), lineCam = new CameraRig();
for (const c of [closeCam, lineCam]) { c.bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }; c.minWupp = 0.002; c.maxWupp = 1; }
closeCam.pitch = THREE.MathUtils.degToRad(+(Q.get('pitch') || 24));
closeCam.yaw = closeCam.yawGoal = +(Q.get('yaw') ?? -0.42);
lineCam.pitch = THREE.MathUtils.degToRad(+(Q.get('lpitch') || 44));
const bitsClose = new Bits(closeStage.scene), bitsLine = new Bits(lineStage.scene);

preloadBearGeometries(BEAR_TYPES);

// ------------------------------------------------------------------ bears
function makeBear(type, seed) {
  const r = new BearRig(type, BEAR_TYPES[type]);
  r.personalize(seed);
  return r;
}
let closeBear = null;
const line = [];
function buildClose() {
  if (closeBear) { closeStage.scene.remove(closeBear.rig.root); closeBear.rig.dispose(); }
  const rig = makeBear(S.type, 3.3);
  closeStage.scene.add(rig.root);
  closeBear = { rig, home: new THREE.Vector3(0, 0, 0), bits: bitsClose, stage: closeStage, i: 0, t: 0, reel: newReel(), fish: null, bubble: null, wrap: closeWrap, cam: closeCam, R: closeR };
}
function buildLine() {
  for (const b of line) { lineStage.scene.remove(b.rig.root); b.rig.dispose(); }
  line.length = 0;
  const sheet = S.zoom === 'sheet';
  const ids = sheet ? FACE_EXPRESSIONS : TYPES;
  ids.forEach((id, i) => {
    const type = sheet ? S.type : id;
    const rig = makeBear(type, i * 7.31 + 1);
    let x, y = 0, z;
    if (sheet) { x = (i % 4 - 1.5) * 1.62; y = (3 - Math.floor(i / 4)) * 2.3 * BEAR_TYPES[type].scale; z = 0; }
    else if (S.zoom === 'lineup') { x = (i - (ids.length - 1) / 2) * 2.45; z = 0; }
    else { const row = i < 6 ? 0 : 1; const n = row ? ids.length - 6 : 6; x = ((row ? i - 6 : i) - (n - 1) / 2) * 2.5; z = row ? -2.3 : 0.2; }
    const home = new THREE.Vector3(x, y, z);
    rig.root.position.copy(home);
    lineStage.scene.add(rig.root);
    const b = { rig, home, bits: bitsLine, stage: lineStage, i, t: -i * 0.23, reel: newReel(-i * 0.23), fish: null, bubble: null, face: sheet ? id : null, wrap: lineWrap, cam: lineCam, R: lineR };
    if (sheet) rig.setFace(id);
    line.push(b);
  });
}

// ------------------------------------------------------------------ showreel
const REEL = [['idle', 0.55], ['lunge', 0.34], ['grab', 0.36], ['eat', 1.4], ['yummy', 0.9], ['toss', 0.5], ['idle', 0.75]];
function newReel(t0 = 0) { return { k: 0, t: t0, fishStage: 0 }; }

function bubble(b, text, dur = 0.8) {
  if (!b.wrap) return;
  if (!b.bubble) { b.bubble = document.createElement('div'); b.bubble.className = 'bubble'; b.wrap.appendChild(b.bubble); }
  b.bubble.textContent = text;
  b.bubble.style.display = 'block';
  b.bubbleT = dur;
}

function spawnGroundFish(b) {
  if (b.fish) { b.stage.scene.remove(b.fish); b.fish.userData.dispose(); }
  const f = makeFishQuad();
  f.scale.setScalar(BEAR_TYPES[b.rig.typeId].scale * 0.9);
  f.position.copy(b.home).add(new THREE.Vector3(0, 0.22, 1.25 * BEAR_TYPES[b.rig.typeId].scale));
  f.userData.wiggle = 2.2;
  b.stage.scene.add(f);
  b.fish = f;
}

function handleEvents(b) {
  const rig = b.rig;
  for (const e of rig.events) {
    if (e === 'chomp') {
      const p = rig.mouthPos(new THREE.Vector3());
      b.bits.burst(p, 7, [0xd83030, 0xffffff, 0xe0874a, 0xb01818], { speed: 1.8, up: 1.6, life: 0.55 });
      if (rig.held?.userData.setStage) rig.held.userData.setStage(rig.chomps);
      if (b === closeBear) bubble(b, rig.chomps === 3 ? 'CHOMP!!' : 'chomp!', 0.35);
    } else if (e === 'release' && rig.held) {
      // the bone flies over the shoulder
      const p = rig.handPos('R', new THREE.Vector3());
      const bone = rig.held;
      bone.getWorldScale(_s);
      rig.held = null;
      bone.parent.remove(bone);
      bone.position.copy(p);
      bone.scale.copy(_s);
      bone.visible = true;
      const back = new THREE.Vector3(0.6, 0, -2.2).applyQuaternion(rig.root.quaternion);
      b.bits.flyer(bone, new THREE.Vector3(back.x, 4.2, back.z), -14);
    } else if (e === 'land') {
      const p = rig.root.position.clone(); p.y = WATER_Y + 0.05;
      b.bits.burst(p, 18, [0xcdf2ff, 0xffffff, 0x8ad8f0], { speed: 3, up: 4.5, life: 0.8 });
    } else if (e === 'coins') {
      const p = rig.handPos('R', new THREE.Vector3()); p.y += 0.3;
      b.bits.burst(p, 9, [0xf2c230, 0xffe070, 0xd8a020], { speed: 1.4, up: 4, life: 1.0 });
    } else if (e === 'slam' || e === 'stomp') {
      const p = rig.root.position.clone(); p.y = 0.05;
      b.bits.burst(p, e === 'slam' ? 12 : 4, [0xb8a078, 0xd8c8a0, 0x9a8a60], { speed: 2.4, up: 1.2, life: 0.5 });
    }
  }
}

function runReel(b, dt) {
  const R = b.reel;
  const rig = b.rig;
  R.t += dt;
  if (R.t < 0) { rig.pose('idle', dt); return; }
  let [name, dur] = REEL[R.k];
  while (R.t >= dur) {
    R.t -= dur;
    R.k = (R.k + 1) % REEL.length;
    [name, dur] = REEL[R.k];
    if (name === 'lunge') spawnGroundFish(b);
    if (name === 'yummy' && b === closeBear) bubble(b, 'YUMMY!', 0.9);
    if (R.k === REEL.length - 1) rig.hold(null);
  }
  if (R.k === 0 && !b.fish && !rig.held) spawnGroundFish(b);
  const t01 = Math.min(1, R.t / dur);
  // grab: take the fish from the ground into the paws
  if (name === 'grab' && t01 > 0.42 && b.fish) {
    const f = b.fish; b.fish = null;
    f.position.set(0, 0, 0); f.scale.setScalar(0.92); f.userData.wiggle = 1.4;
    f.userData.setStage(0);
    rig.hold(f);
  }
  if (b.fish && name === 'lunge') b.fish.userData.wiggle = 3;
  if (rig.held && name === 'eat') rig.held.userData.wiggle = rig.chomps >= 3 ? 0 : 0.9;
  if (rig.held && name === 'toss') rig.held.userData.wiggle = 0;
  rig.pose(name, dt, { t01, speed: 0 });
}

// ------------------------------------------------------------------ pose driving
const loopT = new WeakMap();
function drivePose(b, dt) {
  const rig = b.rig;
  let lt = (loopT.get(b) ?? b.t) + dt;
  loopT.set(b, lt);
  const name = S.pose;
  const water = S.water || name === 'swim';
  const scale = BEAR_TYPES[rig.typeId].scale * rig.P.size;
  const pondZ = (b.stage.pond.z0 + b.stage.pond.z1) / 2;
  if (name === 'cannonball') {
    // hop from the bank into the pond, splash, paddle, repeat
    const dur = POSE_DURATION.cannonball, cyc = dur + 1.4;
    const k = ((lt % cyc) + cyc) % cyc;
    const p0 = b.stage === closeStage ? new THREE.Vector3(1.2, 0, 0) : new THREE.Vector3(b.home.x, 0, b.home.z);
    const p1 = b.stage === closeStage ? new THREE.Vector3(5.2, WATER_Y - 0.95 * scale, 0) : new THREE.Vector3(b.home.x, WATER_Y - 0.95 * scale, pondZ);
    if (k < dur) {
      const t = k / dur;
      rig.root.position.lerpVectors(p0, p1, t);
      rig.root.position.y = p0.y + (p1.y - p0.y) * t + Math.sin(t * Math.PI) * (1.5 + 0.3 * scale);
      rig.root.rotation.y = b.stage === closeStage ? Math.PI / 2 : 0;
      rig.pose('cannonball', dt, { t01: t });
    } else {
      rig.root.position.copy(p1);
      rig.pose('swim', dt, { speed: 0.4, inWater: true });
    }
    return;
  }
  if (water) {
    const p = b.stage === closeStage ? new THREE.Vector3(5.2, 0, 0) : new THREE.Vector3(b.home.x, 0, pondZ);
    p.y = WATER_Y - 0.95 * scale;
    rig.root.position.copy(p);
  } else rig.root.position.copy(b.home);
  rig.root.rotation.y = S.rot;
  if (POSE_DURATION[name]) {
    const dur = POSE_DURATION[name], cyc = dur + 0.45;
    const k = ((lt % cyc) + cyc) % cyc;
    rig.pose(name, dt, { t01: Math.min(1, k / dur), speed: 0, inWater: water });
  } else {
    const moving = ['walk', 'run', 'sad', 'search', 'angry_stomp'].includes(name);
    rig.pose(name, dt, { speed: moving ? S.speed * (name === 'run' ? 1.8 : 1) : 0, inWater: water });
  }
}

function stepBear(b, dt) {
  if (S.reel && S.zoom !== 'sheet') runReel(b, dt);
  else drivePose(b, dt);
  handleEvents(b);
  if (S.face && !(S.zoom === 'sheet' && b !== closeBear)) b.rig.setFace(S.face);
  if (b.bubble) {
    b.bubbleT -= dt;
    if (b.bubbleT <= 0) b.bubble.style.display = 'none';
  }
}

// ------------------------------------------------------------------ layout
function layout() {
  const W = innerWidth;
  const H = innerHeight - (ui.classList.contains('hidden') ? 0 : ui.offsetHeight);
  document.getElementById('stage').style.height = H + 'px';
  const mode = S.zoom;
  let cw = 0, lw = 0;
  if (mode === 'close') cw = W;
  else if (mode === 'lineup' || mode === 'sheet') lw = W;
  else { cw = Math.round(W * 0.42); lw = W - cw; }
  closeWrap.style.display = cw ? 'block' : 'none';
  lineWrap.style.display = lw ? 'block' : 'none';
  const ps = +(Q.get('ps') || 2);
  for (const [R, cv, wrap, w] of [[closeR, closeCv, closeWrap, cw], [lineR, lineCv, lineWrap, lw]]) {
    if (!w) continue;
    wrap.style.width = w + 'px'; wrap.style.height = H + 'px';
    cv.style.width = w + 'px'; cv.style.height = H + 'px';
    R.pixelDensity = Math.hypot(w, H) / (760 * ps);
    R.resize(w, H, 1);
  }
  // cameras
  const cs = BEAR_TYPES[S.type].scale;
  closeCam.wupp = closeCam.wuppGoal = +(Q.get('wupp') || (0.0068 * Math.max(0.75, cs) * 720 / H) * (mode === "close" ? 1.25 : 1.4));
  if (mode === 'sheet') lineCam.wupp = lineCam.wuppGoal = +(Q.get('lwupp') || 10.6 * Math.max(0.72, BEAR_TYPES[S.type].scale) / (H / ps));
  else lineCam.wupp = lineCam.wuppGoal = +(Q.get('lwupp') || (mode === 'lineup' ? 0.045 : Math.max(0.03, 16.5 / (lw / ps))));
  if (mode === 'sheet') lineCam.pitch = THREE.MathUtils.degToRad(+(Q.get('lpitch') || 6));
  else lineCam.pitch = THREE.MathUtils.degToRad(+(Q.get('lpitch') || 44));
}
addEventListener('resize', layout);

function aimCameras(dt) {
  if (closeBear) {
    const r = closeBear.rig.root.position;
    const cs = BEAR_TYPES[S.type].scale;
    const tx = S.pose === 'cannonball' && !S.reel ? 3.2 : r.x;
    closeCam.lookAt(tx, r.z, true);
    const focus = Q.get('focus');
    closeCam.target.y = Math.max(r.y, WATER_Y - 0.9 * cs) + (focus === 'head' ? 1.45 : focus === 'feet' ? 0.4 : 1.02) * cs;
  }
  if (S.zoom === 'sheet') { lineCam.lookAt(0, 0, true); lineCam.target.y = 7.0 * BEAR_TYPES[S.type].scale; }
  else { lineCam.lookAt(0, S.water || S.pose === 'swim' || S.pose === 'cannonball' ? 2 : -0.6, true); lineCam.target.y = 0.8; }
  closeCam.update(dt, closeR);
  lineCam.update(dt, lineR);
}

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui');
if (Q.get('ui') === '0') ui.classList.add('hidden');
function syncURL() {
  const p = new URLSearchParams(location.search);
  p.set('pose', S.pose); p.set('type', S.type); p.set('zoom', S.zoom); p.set('reel', S.reel ? '1' : '0');
  if (S.face) p.set('face', S.face); else p.delete('face');
  if (S.water) p.set('water', '1'); else p.delete('water');
  history.replaceState(null, '', '?' + p.toString());
}
function row(label, items, get, set) {
  const r = document.createElement('div');
  r.className = 'row';
  const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label; r.appendChild(l);
  const btns = [];
  for (const [k, text] of items) {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = () => { set(k); refresh(); syncURL(); };
    r.appendChild(b);
    btns.push([k, b]);
  }
  r.refresh = () => { for (const [k, b] of btns) b.classList.toggle('on', get() === k); };
  ui.appendChild(r);
  return r;
}
const rows = [
  row('pose', [['__reel', 'SHOWREEL'], ...BEAR_POSES.map((p) => [p, p])], () => (S.reel ? '__reel' : S.pose), (k) => {
    if (k === '__reel') { S.reel = true; for (const b of [closeBear, ...line]) { b.reel = newReel(b === closeBear ? 0 : -b.i * 0.23); b.rig.hold(null); } }
    else { S.reel = false; S.pose = k; for (const b of [closeBear, ...line]) { b.rig.hold(null); if (b.fish) { b.stage.scene.remove(b.fish); b.fish = null; } } }
  }),
  row('face', [[null, 'auto'], ...FACE_EXPRESSIONS.map((f) => [f, f])], () => S.face, (k) => { S.face = k; for (const b of [closeBear, ...line]) if (!k) b.rig.setFace(null); }),
  row('type', TYPES.map((t) => [t, t]), () => S.type, (k) => { S.type = k; buildClose(); if (S.zoom === 'sheet') buildLine(); layout(); }),
  row('view', [['both', 'both'], ['close', 'close-up'], ['lineup', 'lineup'], ['sheet', 'face sheet']], () => S.zoom, (k) => { S.zoom = k; buildLine(); layout(); }),
  row('misc', [['water', 'water'], ['pause', 'pause'], ['angry', 'angry mat'], ['flash', 'flash']], () => null, (k) => {
    if (k === 'water') S.water = !S.water;
    if (k === 'pause') S.paused = !S.paused;
    if (k === 'angry' || k === 'flash') { S.mat = S.mat === k ? 'normal' : k; for (const b of [closeBear, ...line]) b.rig.setMaterial(S.mat); }
  }),
];
function refresh() { for (const r of rows) r.refresh(); }
{
  const r = rows[4];
  const l = document.createElement('span'); l.textContent = ' speed'; l.style.color = 'var(--dim)'; r.appendChild(l);
  const s = document.createElement('input'); s.type = 'range'; s.min = 0; s.max = 4; s.step = 0.1; s.value = S.speed;
  s.oninput = () => { S.speed = +s.value; }; r.appendChild(s);
  const l2 = document.createElement('span'); l2.textContent = ' slow-mo'; l2.style.color = 'var(--dim)'; r.appendChild(l2);
  const s2 = document.createElement('input'); s2.type = 'range'; s2.min = 0.1; s2.max = 1; s2.step = 0.05; s2.value = S.ts;
  s2.oninput = () => { S.ts = +s2.value; }; r.appendChild(s2);
}

// ------------------------------------------------------------------ loop
buildClose();
buildLine();
layout();
refresh();
if (S.mat !== 'normal') for (const b of [closeBear, ...line]) b.rig.setMaterial(S.mat);
const info = document.getElementById('info');

function simulate(dt) {
  if (S.zoom !== 'lineup' && S.zoom !== 'sheet') stepBear(closeBear, dt);
  if (S.zoom !== 'close') for (const b of line) stepBear(b, dt);
  bitsClose.update(dt); bitsLine.update(dt);
}

function render(dt) {
  aimCameras(dt);
  if (S.zoom !== 'lineup' && S.zoom !== 'sheet') closeR.render(closeStage.scene, closeCam);
  if (S.zoom !== 'close') lineR.render(lineStage.scene, lineCam);
  // speech bubbles
  for (const b of [closeBear, ...line]) {
    if (!b.bubble || b.bubble.style.display === 'none') continue;
    const s = b.cam.worldToScreen(b.rig.headTop(new THREE.Vector3()), b.R);
    b.bubble.style.left = s.x + 'px'; b.bubble.style.top = s.y + 'px';
  }
  const rg = closeBear.rig;
  info.textContent = `${S.type} · ${S.reel ? 'showreel' : S.pose} · face ${rg.faceNow} · chomps ${rg.chomps} · ${rg.tris} tris · calls ${closeR.renderer.info.render.calls}`;
}

let last = performance.now();
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) simulate(real * S.ts);
  render(S.paused ? 0 : real);
  requestAnimationFrame(frame);
}

// deterministic stepping for screenshots
function step(sec, fps = 60) {
  const dt = 1 / fps;
  for (let t = 0; t < sec - 1e-6; t += dt) simulate(dt);
  render(0);
  return { face: closeBear.rig.faceNow, chomps: closeBear.rig.chomps, events: closeBear.rig.events.slice() };
}
// Contact sheet of the close-up view: frames at evenly spaced times.
// ?strip=0,2.4,16,8  (from, to, frames, columns) or __prev.filmstrip({...})
function filmstrip({ from = 0, to = 2, n = 12, cols = 6, crop = 0.62, cropY = 0.5 } = {}) {
  S.paused = true;
  const cv = closeCv;
  const cw = Math.round(cv.width * crop), ch = Math.round(cv.height * crop);
  const sx = Math.round((cv.width - cw) / 2), sy = Math.round((cv.height - ch) * cropY);
  const rowsN = Math.ceil(n / cols);
  const cellW = Math.floor(innerWidth / cols), cellH = Math.round(cellW * ch / cw);
  const sheet = document.createElement('canvas');
  sheet.width = cellW * cols; sheet.height = cellH * rowsN;
  const g = sheet.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#2a2034'; g.fillRect(0, 0, sheet.width, sheet.height);
  let t = 0;
  step(from);
  t = from;
  for (let i = 0; i < n; i++) {
    const target = n === 1 ? from : from + (to - from) * i / (n - 1);
    if (target > t) step(target - t);
    t = target;
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    g.drawImage(cv, sx, sy, cw, ch, x, y, cellW, cellH);
    const rg = closeBear.rig;
    g.fillStyle = 'rgba(20,14,26,0.8)'; g.fillRect(x, y, 150, 16);
    g.fillStyle = '#fff4e4'; g.font = '11px monospace';
    g.fillText(`${t.toFixed(2)}s ${rg.cur} ${rg.faceNow}${rg.cur === 'eat' ? ' c' + rg.chomps : ''}`, x + 3, y + 12);
    g.strokeStyle = '#140e1a'; g.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);
  }
  sheet.style.cssText = 'position:fixed;left:0;top:0;z-index:10;image-rendering:pixelated';
  document.body.appendChild(sheet);
  return { w: sheet.width, h: sheet.height };
}
if (Q.has('strip')) {
  const [a, b, n, c] = Q.get('strip').split(',').map(Number);
  filmstrip({ from: a || 0, to: b || 2, n: n || 12, cols: c || 6, crop: +(Q.get('crop') || 0.62), cropY: +(Q.get('cropy') || 0.5) });
} else if (Q.has('t')) { S.paused = true; step(+Q.get('t')); }
requestAnimationFrame(frame);

window.__prev = {
  S, step, filmstrip, closeBear: () => closeBear, line, BEAR_TYPES, THREE,
  set(o) {
    Object.assign(S, o);
    if (o.type) buildClose();
    if (o.zoom || (o.type && S.zoom === 'sheet')) buildLine();
    if (o.pose && o.reel === undefined) S.reel = false;
    if (o.reel) for (const b of [closeBear, ...line]) { b.reel = newReel(b === closeBear ? 0 : -b.i * 0.23); b.rig.hold(null); }
    if (o.mat) for (const b of [closeBear, ...line]) b.rig.setMaterial(o.mat);
    for (const b of [closeBear, ...line]) loopT.set(b, 0);
    layout(); refresh();
  },
  tris() { return Object.fromEntries(TYPES.map((t) => [t, new BearRig(t, BEAR_TYPES[t]).tris])); },
};
