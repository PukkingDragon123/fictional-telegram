// Devlog sandbox: "prototype" builds of The Bear Must Eat, staged for the day-by-day devlog
// videos (tools/devlog). A greybox world (prototype-grid ground, a blue pond, a box for the
// office, cone trees) with pill-shaped bears, sphere fish and a cube fox; the voxel editor
// turntable where Reynard gets built voxel by voxel; the real rigs dropped into the greybox;
// and the same little scene through the game's own pixel-art renderer.
// One shot per page load: sandbox.html?shot=d1_walk. It runs under virtual time
// (tools/video/vtime.js) and every random number comes from one seeded generator, so a shot
// records identically every time, and shots that share a simulation (d3_door / d3_rush /
// d3_empty) just fast-forward into it.
import * as THREE from 'three';
import { VoxelModel } from '../../src/core/voxel.js';
import { FoxRig } from '../../src/entities/foxRig.js';
import { BearRig } from '../../src/entities/bearRig.js';
import { BEAR_TYPES } from '../../src/data/bears.js';
import { PixelRenderer } from '../../src/core/pixelRenderer.js';
import { CameraRig } from '../../src/core/cameraRig.js';
import { mulberry32 } from '../../src/core/rng.js';

// remember which voxels each mesh was built from: Reynard's voxel-by-voxel build reads them back
const VOX = new WeakMap();
const build0 = VoxelModel.prototype.build;
VoxelModel.prototype.build = function (o = {}) {
  const g = build0.call(this, o);
  VOX.set(g, { vox: this.vox, pivot: o.pivot || [0, 0, 0], s: o.scale ?? 0.1 });
  return g;
};

const Q = new URLSearchParams(location.search);
const SHOT = Q.get('shot') || 'd1_orbit';
const W = innerWidth, H = innerHeight;
const canvas = document.getElementById('c');
const rand = mulberry32(+(Q.get('seed') || 11));
const rr = (a, b) => a + rand() * (b - a);
const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const back = (u) => { u = clamp01(u); const c = 1.9; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
const adiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// sounds: the clip recorder taps __sbAudio.play (tools/video/clips.mjs AUDIO_TAP)
const AUD = (window.__sbAudio = { play() {} });
const sfx = (name, o = {}) => AUD.play(name, { volume: 0.4, ...o });

// ------------------------------------------------------------------ scene + renderers
const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);
const persp = new THREE.PerspectiveCamera(48, W / H, 0.1, 400);
let renderer = null, pixel = null, rig = null, orthoPlain = false;
function plainRenderer(pr = 1) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(pr);
  r.setSize(W, H, false);
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

const hemi = new THREE.HemisphereLight(0xe2ecff, 0x7e7b72, 1.25);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(-14, 26, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 90 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);

function gradientTex(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const MATS = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o }));
  return MATS.get(k);
}
function mesh(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  parent.add(o);
  return o;
}
const box = (w, h, d, color, parent, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat(color), parent, x, y, z);

// ------------------------------------------------------------------ text sprites
function textCanvas(text, { font = "500 40px 'JB Mono'", color = '#fff', bg = null, pad = 12, stroke = null }) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const fs = +font.match(/(\d+)px/)[1];
  c.width = Math.ceil(g.measureText(text).width + pad * 2 + (stroke ? stroke[1] : 0));
  c.height = Math.ceil(fs * 1.3 + pad);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 8);
    g.fill();
  }
  if (stroke) {
    g.lineJoin = 'round';
    g.lineWidth = stroke[1];
    g.strokeStyle = stroke[0];
    g.strokeText(text, c.width / 2, c.height / 2 + fs * 0.06);
  }
  g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2 + fs * 0.06);
  return c;
}
function sprite(c, { px = null, world = 0.5, top = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: !top, depthWrite: false, sizeAttenuation: px == null }));
  const asp = c.width / c.height;
  // constant screen size: view height = scale * distance -> scale = px * 2 tan(fov/2) / H
  const h = px != null ? (px * 2 * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2))) / H : world;
  sp.scale.set(h * asp, h, 1);
  sp.userData.base = sp.scale.clone();
  sp.center.set(0.5, 0);
  sp.renderOrder = 60;
  return sp;
}
// the little dark debug tags a dev hangs over things
const debugLabel = (text, px = 30) => sprite(textCanvas(text, { font: "500 34px 'JB Mono'", color: '#e9f1ff', bg: 'rgba(16,18,24,0.78)', pad: 14 }), { px });

// ------------------------------------------------------------------ fx
const FX = [];
function fxUpdate(dt) { for (let i = FX.length - 1; i >= 0; i--) if (!FX[i](dt)) FX.splice(i, 1); }
const dropGeo = new THREE.SphereGeometry(1, 8, 6);
// v2 (the pixel-art square prototype): everything is boxes, and the pop-ups use the game's font
let SQUARES = false;
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const dropOf = () => (SQUARES ? cubeGeo : dropGeo);
const POP_FONT = () => (SQUARES ? "64px 'TBME Body'" : "900 64px 'Nunito'");
const ringGeo = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);
let WATER_Y = 0.03;
function splash(x, z, { n = 12, power = 1, sound = true } = {}) {
  if (sound) sfx('splash', { volume: 0.3, pitch: rr(0.88, 1.15) });
  const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, rm);
  ring.position.set(x, WATER_Y + 0.015, z);
  world.add(ring);
  let t = 0;
  FX.push((dt) => {
    t += dt;
    const k = 0.4 + t * 2.6;
    ring.scale.set(k, 1, k);
    rm.opacity = 0.9 * (1 - t / 0.8);
    if (t > 0.8) { ring.removeFromParent(); return false; }
    return true;
  });
  for (let i = 0; i < n; i++) {
    const a = rr(0, TAU), sp = rr(0.8, 2.2) * power, r = rr(0.06, 0.13);
    const d = new THREE.Mesh(dropOf(), mat('#eef6ff', { roughness: 0.3 }));
    d.scale.setScalar(r);
    d.position.set(x, WATER_Y + 0.1, z);
    world.add(d);
    const v = V3(Math.cos(a) * sp, rr(3, 5.6) * power, Math.sin(a) * sp);
    FX.push((dt) => {
      v.y -= 15 * dt;
      d.position.addScaledVector(v, dt);
      if (d.position.y < WATER_Y) { d.removeFromParent(); return false; }
      return true;
    });
  }
}
function poof(pos, { n = 16, size = 1 } = {}) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshStandardMaterial({ color: i % 3 ? 0xffffff : 0xdfe3ea, roughness: 1, transparent: true, opacity: 1, depthWrite: false });
    const d = new THREE.Mesh(dropOf(), m);
    const r = rr(0.16, 0.32) * size;
    d.position.copy(pos).add(V3(rr(-0.2, 0.2), rr(0, 0.9), rr(-0.2, 0.2)).multiplyScalar(size));
    world.add(d);
    const v = V3(rr(-1, 1), rr(0.2, 1.3), rr(-1, 1)).normalize().multiplyScalar(rr(1.2, 2.6) * size);
    let t = 0;
    FX.push((dt) => {
      t += dt;
      v.multiplyScalar(Math.exp(-dt * 4));
      d.position.addScaledVector(v, dt);
      d.scale.setScalar(r * (0.5 + 0.9 * back(t / 0.25)) * (1 - 0.5 * clamp01((t - 0.25) / 0.4)));
      m.opacity = 1 - clamp01((t - 0.2) / 0.4);
      if (t > 0.6) { d.removeFromParent(); return false; }
      return true;
    });
  }
}
// a word or number that pops up over something and floats away
function popup(text, pos, { color = '#ffe14a', stroke = '#2a2216', size = 0.62, life = 1.1, rise = 0.8, font = POP_FONT() } = {}) {
  const sp = sprite(textCanvas(text, { font, color, stroke: [stroke, 12], pad: 10 }), { world: size });
  sp.position.copy(pos);
  world.add(sp);
  const b = sp.userData.base.clone(), y0 = pos.y;
  let t = 0;
  FX.push((dt) => {
    t += dt;
    const k = back(t / 0.22);
    sp.scale.set(b.x * k, b.y * k, 1);
    sp.position.y = y0 + rise * (1 - Math.exp(-t * 2.2));
    sp.material.opacity = 1 - clamp01((t - life + 0.3) / 0.3);
    if (t > life) { sp.removeFromParent(); return false; }
    return true;
  });
  return sp;
}

// ------------------------------------------------------------------ greybox world
const POND = { x: 0, z: 2.5, rx: 6.2, rz: 4.3 };
const pondW = (a) => 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 5 + 2.2);
function pondPoints(scale = 1, n = 72) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, w = pondW(a) * scale;
    pts.push(new THREE.Vector2(Math.cos(a) * POND.rx * w, Math.sin(a) * POND.rz * w));
  }
  return pts;
}
// shape space (x, y) -> world (x, -z): a world point's angle on the wobbly ellipse
function pondR(x, z) {
  const ex = (x - POND.x) / POND.rx, ez = (z - POND.z) / POND.rz;
  return Math.hypot(ex, ez) / pondW(Math.atan2(-ez, ex));
}
const inPond = (x, z, m = 0) => pondR(x, z) < 1 - m;
function pondEdge(x) { const u = Math.min(0.98, Math.abs(x - POND.x) / POND.rx); return POND.z - POND.rz * Math.sqrt(1 - u * u); }
function flatShape(pts, y, m, parent) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  g.rotateX(-Math.PI / 2);
  const o = new THREE.Mesh(g, m);
  o.position.set(POND.x, y, POND.z);
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function gridTexture() {
  const px = 256, cells = 4, c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = '#d3d6dc'; g.fillRect(0, 0, px, px);
  const s = px / cells;
  g.fillStyle = '#cbced5';
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) if ((i + j) % 2) g.fillRect(i * s, j * s, s, s);
  g.fillStyle = '#b9bdc6';
  for (let i = 0; i < cells; i++) { g.fillRect(i * s, 0, 2, px); g.fillRect(0, i * s, px, 2); }
  g.fillStyle = '#a3a8b2';
  g.fillRect(0, 0, 4, px); g.fillRect(0, 0, px, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const OFFICE_Z = -17;
const DOOR = V3(0, 0, OFFICE_Z + 2.5);
let door = null;
function greybox({ flat = false, labels = true } = {}) {
  scene.background = gradientTex(flat ? '#86b6e6' : '#93aac4', flat ? '#e9f1f6' : '#dfe5ec');
  scene.fog = new THREE.Fog(flat ? 0xe9f1f6 : 0xdfe5ec, 46, 95);
  const G = new THREE.Group();
  world.add(G);
  // ground
  let gm;
  if (flat) gm = mat('#8cbd62');
  else { const t = gridTexture(); t.repeat.set(24, 24); gm = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 96).rotateX(-Math.PI / 2), gm);
  ground.receiveShadow = true;
  G.add(ground);
  // pond: a bank ring + the water
  flatShape(pondPoints(1.1), 0.012, mat(flat ? '#dcc78f' : '#a6abb3'), G);
  flatShape(pondPoints(1), WATER_Y, mat(flat ? '#4aa6dd' : '#4f9fda', { roughness: 0.35 }), G);
  // the office: a box with windows and a roll-up door
  const off = new THREE.Group();
  off.position.set(0, 0, OFFICE_Z);
  G.add(off);
  box(11, 4.8, 5, '#b9bec6', off, 0, 2.4, 0);
  box(11.4, 0.3, 5.4, '#a5aab3', off, 0, 4.95, 0);
  const winM = mat(flat ? '#a8c6e2' : '#a2b4c7', { roughness: 0.4 });
  for (let r = 0; r < 2; r++) for (let c = -2; c <= 2; c++) if (!(r === 0 && c === 0)) mesh(new THREE.PlaneGeometry(1.3, 0.9), winM, off, c * 2.1, 1.75 + r * 1.55, 2.505);
  mesh(new THREE.PlaneGeometry(1.8, 2.5), mat('#1b1d22'), off, 0, 1.25, 2.503);
  door = mesh(new THREE.PlaneGeometry(1.8, 2.5), mat('#5b616b'), off, 0, 1.25, 2.51);
  if (labels) { const l = debugLabel('office (placeholder)', 30); l.position.set(0, 5.6, 0); off.add(l); }
  // the commute: a debug path (dashes + waypoints) from the door down to the pond
  const nodes = [V3(0, 0, OFFICE_Z + 3), V3(0, 0, -9.5), V3(0, 0, pondEdge(0) - 0.6)];
  const dashM = flat ? mat('#d7bd84') : mat('#f2c230', { emissive: 0x3a2a00 });
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1], len = a.distanceTo(b);
    if (flat) {
      const p = mesh(new THREE.BoxGeometry(1.6, 0.02, len + 1.4), dashM, G, (a.x + b.x) / 2, 0.01, (a.z + b.z) / 2);
      p.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      continue;
    }
    for (let d = 0.3; d < len - 0.2; d += 0.8) {
      const p = a.clone().lerp(b, d / len);
      const m = mesh(new THREE.BoxGeometry(0.15, 0.025, 0.42), dashM, G, p.x, 0.02, p.z);
      m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      m.castShadow = false;
    }
  }
  if (!flat) nodes.forEach((n, i) => {
    mesh(new THREE.SphereGeometry(0.16, 12, 8), dashM, G, n.x, 0.16, n.z);
    if (labels) { const l = debugLabel('wp' + i, 24); l.position.set(n.x + 0.6, 0.25, n.z); G.add(l); }
  });
  // trees + rocks, kept off the pond, the path and the office
  const trees = [];
  for (let k = 0; k < 400 && trees.length < 34; k++) {
    const x = rr(-17, 17), z = rr(-27, 14);
    if (pondR(x, z) < 1.45) continue;
    if (Math.abs(x) < 2.6 && z > -15 && z < -1) continue;
    if (Math.abs(x) < 7.2 && z > OFFICE_Z - 3.5 && z < OFFICE_Z + 3.4) continue;
    if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 2.4)) continue;
    trees.push([x, z, rr(0.8, 1.25)]);
  }
  const coneM = mat(flat ? '#5f9c52' : '#7f9f79'), trunkM = mat(flat ? '#8a6446' : '#8c7a6b');
  for (const [x, z, s] of trees) {
    mesh(new THREE.CylinderGeometry(0.13 * s, 0.17 * s, 0.7 * s, 7), trunkM, G, x, 0.35 * s, z);
    mesh(new THREE.ConeGeometry(1.0 * s, 2.5 * s, 7), coneM, G, x, 0.7 * s + 1.25 * s, z).rotation.y = rr(0, TAU);
  }
  for (let i = 0; i < 9; i++) {
    const a = rr(0, TAU), r = 1.12 + rr(0, 0.12);
    const x = POND.x + Math.cos(a) * POND.rx * r * pondW(a), z = POND.z - Math.sin(a) * POND.rz * r * pondW(a);
    if (Math.abs(x) < 2.6 && z < POND.z) continue;
    const s = rr(0.28, 0.55);
    const m = mesh(new THREE.DodecahedronGeometry(s, 0), mat('#9ca1a8'), G, x, s * 0.45, z);
    m.rotation.set(rr(0, 3), rr(0, 3), 0);
  }
  return G;
}
function setDoor(u) {
  if (!door) return;
  u = clamp01(u);
  door.scale.y = Math.max(0.001, 1 - u);
  door.position.y = 2.5 - 1.25 * (1 - u);
}

// ------------------------------------------------------------------ placeholder characters
function pillBear(color = '#8b5a3c') {
  const g = new THREE.Group();
  mesh(new THREE.CapsuleGeometry(0.42, 0.64, 6, 16), mat(color), g, 0, 0.74, 0);
  const ear = new THREE.SphereGeometry(0.14, 12, 8);
  mesh(ear, mat(color), g, 0.25, 1.4, -0.02);
  mesh(ear, mat(color), g, -0.25, 1.4, -0.02);
  mesh(new THREE.SphereGeometry(0.15, 14, 10), mat('#d8b48c'), g, 0, 1.06, 0.37).scale.set(1.15, 0.8, 0.85);
  const eye = new THREE.SphereGeometry(0.045, 10, 8), em = mat('#15161a', { roughness: 0.3 });
  mesh(eye, em, g, 0.14, 1.22, 0.36);
  mesh(eye, em, g, -0.14, 1.22, 0.36);
  const tie = mesh(new THREE.BoxGeometry(0.12, 0.4, 0.04), mat('#c0392b'), g, 0, 0.72, 0.425);
  tie.rotation.x = -0.1;
  return g;
}
// the square prototype's actors: a brown box is a bear, an orange box is the fox
function cubeBear(color = '#8b5a3c') {
  const g = new THREE.Group();
  mesh(cubeGeo, mat(color), g, 0, 0.62, 0).scale.set(0.95, 1.24, 0.8);
  return g;
}
function cubeFox() {
  const g = new THREE.Group();
  mesh(cubeGeo, mat('#e8833a'), g, 0, 0.55, 0).scale.set(0.8, 1.1, 0.7);
  return g;
}
function boxFox() {
  const g = new THREE.Group(), o = '#e8833a';
  box(0.6, 0.95, 0.45, o, g, 0, 0.48, 0);
  box(0.52, 0.44, 0.44, o, g, 0, 1.18, 0);
  box(0.22, 0.15, 0.2, '#f2e2cf', g, 0, 1.12, 0.3);
  box(0.07, 0.07, 0.04, '#15161a', g, 0, 1.18, 0.405);
  for (const s of [-1, 1]) {
    mesh(new THREE.ConeGeometry(0.1, 0.26, 4), mat(o), g, 0.16 * s, 1.52, 0).rotation.y = Math.PI / 4;
    box(0.06, 0.06, 0.03, '#15161a', g, 0.12 * s, 1.27, 0.225);
  }
  const tail = box(0.2, 0.2, 0.62, o, g, 0, 0.42, -0.46);
  tail.rotation.x = 0.55;
  return g;
}
function makeBear(type, seed) {
  const b = new BearRig(type, BEAR_TYPES[type]);
  b.personalize(seed);
  b.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return b;
}
function makeFox() {
  const f = new FoxRig({ shadows: true });
  f.play('idle', { fade: 0 });
  return f;
}

// ------------------------------------------------------------------ fish
const fishGeo = new THREE.SphereGeometry(0.27, 16, 12);
const tailGeo = new THREE.ConeGeometry(0.16, 0.3, 10).rotateX(Math.PI / 2);
const FISH_COLORS = ['#f39a33', '#f7c548', '#ec6a45', '#f39a33'];
const fishes = [];
let fishMode = 'wander', clumpAt = null, breed = 0, maxFish = 40, fishBoxX = 0; // fishBoxX: keep them in a portrait frame
class Fish {
  constructor(x, z, { baby = false, color } = {}) {
    this.p = new THREE.Vector2(x, z);
    this.a = rr(0, TAU); this.turn = 0;
    this.v = rr(0.6, 1.0);
    this.grow = baby ? 0.42 : 1;
    this.love = rr(1.2, 4);
    this.alive = true; this.dead = 0; this.claimed = null;
    this.wob = rr(0, TAU);
    const g = (this.mesh = new THREE.Group());
    if (SQUARES) {
      const m = mat(color || ['#f39a33', '#f7c548', '#ec6a45'][(rand() * 3) | 0], { roughness: 0.6 });
      mesh(cubeGeo, m, g).scale.set(0.42, 0.14, 0.42);
      this.tail = new THREE.Group();
      g.add(this.tail);
      world.add(g);
      this.place(0);
      return;
    }
    const m = mat(color || FISH_COLORS[(rand() * FISH_COLORS.length) | 0], { roughness: 0.55 });
    const b = mesh(fishGeo, m, g);
    b.scale.set(0.9, 0.76, 1.18);
    this.tail = mesh(tailGeo, m, g, 0, 0, -0.36);
    const eye = new THREE.SphereGeometry(0.045, 8, 6), em = mat('#15161a', { roughness: 0.3 });
    mesh(eye, em, g, 0.17, 0.07, 0.19);
    mesh(eye, em, g, -0.17, 0.07, 0.19);
    world.add(g);
    this.place(0);
  }
  place(t) {
    const s = this.grow * (this.alive ? 1 : Math.max(0, 1 - this.dead / 0.18));
    this.mesh.scale.setScalar(Math.max(0.001, s));
    this.mesh.position.set(this.p.x, WATER_Y + 0.08 + Math.sin(this.wob + t * 3.4) * 0.025, this.p.y);
    this.mesh.rotation.y = this.a;
    this.tail.rotation.y = Math.sin(t * 13 + this.wob) * 0.45;
  }
  die() { this.alive = false; this.dead = 0; }
}
function spawnFish(n, { r = 0.8 } = {}) {
  for (let i = 0; i < n; i++) {
    let x, z, k = 0;
    const rx = fishBoxX ? Math.min(POND.rx * r, fishBoxX) : POND.rx * r;
    do { x = POND.x + rr(-1, 1) * rx; z = POND.z + rr(-1, 1) * POND.rz * r; k++; } while (!inPond(x, z, 0.22) && k < 50);
    fishes.push(new Fish(x, z));
  }
}
function updateFish(dt, t) {
  for (const f of fishes) {
    if (!f.alive) {
      f.dead += dt;
      f.place(t);
      if (f.dead > 0.3) f.mesh.visible = false;
      continue;
    }
    if (f.grow < 1) f.grow = Math.min(1, f.grow + dt * 0.12);
    f.turn += (rand() - 0.5) * dt * 7;
    f.turn *= Math.exp(-dt * 1.6);
    f.a += f.turn * dt;
    let speed = f.v;
    if (fishMode === 'clump' && clumpAt) {
      // the bug: everyone heads for the same corner and jitters there
      const to = Math.atan2(clumpAt.x - f.p.x, clumpAt.y - f.p.y);
      f.a += adiff(f.a, to) * Math.min(1, dt * 5);
      const d = f.p.distanceTo(clumpAt);
      if (d < 1.4) { f.a += rr(-2.6, 2.6); speed = 1.6; }
      else speed = 1.9;
    } else {
      // stay in the pond: turn back towards the middle near the bank
      const r = pondR(f.p.x, f.p.y);
      if (r > 0.72) f.a += adiff(f.a, Math.atan2(POND.x - f.p.x, POND.z - f.p.y)) * Math.min(1, dt * 3.2 * (r - 0.6) * 4);
      else if (fishBoxX && Math.abs(f.p.x - POND.x) > fishBoxX) f.a += adiff(f.a, Math.atan2(POND.x - f.p.x, POND.z - f.p.y)) * Math.min(1, dt * 4);
      // personal space
      for (const o of fishes) {
        if (o === f || !o.alive) continue;
        const dx = f.p.x - o.p.x, dz = f.p.y - o.p.y, d2 = dx * dx + dz * dz;
        if (d2 < 0.5 && d2 > 1e-6) f.a += adiff(f.a, Math.atan2(dx, dz)) * Math.min(1, dt * 2.4);
      }
    }
    f.p.x += Math.sin(f.a) * speed * dt;
    f.p.y += Math.cos(f.a) * speed * dt;
    if (!inPond(f.p.x, f.p.y, 0.12)) {
      // pushed against the bank: slide back inside
      const ex = f.p.x - POND.x, ez = f.p.y - POND.z, k = (1 - 0.12) / pondR(f.p.x, f.p.y);
      f.p.x = POND.x + ex * k; f.p.y = POND.z + ez * k;
    }
    f.love -= dt * breed;
    f.place(t);
  }
  // babies: two grown-ups bump into each other while both are in the mood
  if (breed > 0 && fishMode === 'wander') {
    const live = fishes.filter((f) => f.alive);
    if (live.length < maxFish) {
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.love > 0 || b.love > 0 || a.grow < 1 || b.grow < 1) continue;
        if (a.p.distanceTo(b.p) > 0.95) continue;
        a.love = rr(3.5, 6); b.love = rr(3.5, 6);
        const m = a.p.clone().add(b.p).multiplyScalar(0.5);
        popup('♥', V3(m.x, 0.45, m.y), { color: '#ff6fa3', stroke: '#5a1030', size: 0.7, life: 1.2, rise: 0.9, font: "900 80px 'Nunito', 'DejaVu Sans'" });
        sfx('heart', { volume: 0.35 });
        const baby = new Fish(m.x, m.y, { baby: true });
        fishes.push(baby);
        sfx('pop_in', { volume: 0.25, pitch: 1.4 });
        return;
      }
    }
  }
}
const fishAlive = () => fishes.filter((f) => f.alive).length;

// ------------------------------------------------------------------ bears
let coins = 0, popScale = 1;
const bears = [];
class Bear {
  constructor(o = {}) {
    this.o = o;
    this.kind = o.kind || 'pill';
    this.root = new THREE.Group();
    world.add(this.root);
    this.pos = V3(o.x ?? DOOR.x, 0, o.z ?? DOOR.z);
    this.yaw = o.yaw ?? 0;
    this.phase = rr(0, TAU);
    this.y = 0; this.vy = 0;
    this.t = 0;
    this.start = o.start ?? 0;
    this.state = o.start != null ? 'wait' : o.state || 'idle';
    this.path = (o.path || []).map((p) => p.clone());
    this.speed = o.speed ?? 1.8;
    this.mode = o.mode || 'hunt';
    this.eaten = 0; this.target = null; this.sq = 0; this.sqv = 0;
    this.inWater = false;
    if (this.kind === 'pill') { this.body = pillBear(o.color); this.root.add(this.body); }
    else if (this.kind === 'cube') { this.body = cubeBear(o.color); this.root.add(this.body); }
    else { this.rig = makeBear(o.type || 'office', o.seed ?? rr(1, 9)); this.root.add(this.rig.root); }
    if (o.label) { this.label = debugLabel(o.label, 28); this.label.position.y = 1.85; this.root.add(this.label); }
    this.root.visible = this.state !== 'wait';
    bears.push(this);
    this.place(0);
  }
  turnTo(a, dt, k = 10) { this.yaw += adiff(this.yaw, a) * (1 - Math.exp(-k * dt)); }
  kick(v) { this.sqv += v; }
  update(dt) {
    this.t += dt;
    const s = this.state;
    if (s === 'wait') {
      if (this.t >= this.start) { this.state = 'walk'; this.t = 0; this.root.visible = true; }
      return this.place(dt);
    }
    if (s === 'walk') {
      const tg = this.path[0];
      if (!tg) { this.arrive(); return this.place(dt); }
      const dx = tg.x - this.pos.x, dz = tg.z - this.pos.z, d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.pos.x = tg.x; this.pos.z = tg.z;
        this.path.shift();
        if (!this.path.length) this.arrive();
      } else {
        this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
        this.turnTo(Math.atan2(dx, dz), dt);
      }
      if (this.mode === 'through') this.inWater = false;
    } else if (s === 'hop') {
      const u = clamp01(this.t / this.hop.dur);
      this.hopU = u;
      this.pos.lerpVectors(this.hop.a, this.hop.b, u);
      this.y = lerp(0, this.sink(), u) + 4 * this.hop.h * u * (1 - u);
      this.turnTo(this.hop.yaw, dt);
      if (u >= 1) {
        this.state = 'swim'; this.t = 0; this.inWater = true; this.y = this.sink();
        splash(this.pos.x, this.pos.z, { n: this.kind === 'pill' ? 12 : 16, power: 1 });
        this.kick(-5);
      }
    } else if (s === 'swim') {
      if (!this.target || !this.target.alive) this.target = this.pickFish();
      if (!this.target) {
        this.state = 'confused'; this.t = 0;
        this.q = sprite(textCanvas('?', { font: "900 80px 'Nunito'", color: '#ffffff', stroke: ['#22252c', 14], pad: 10 }), { world: 0.8 * popScale });
        world.add(this.q);
        sfx('pop_in', { volume: 0.18, pitch: rr(1.3, 1.6) });
      }
      else {
        const f = this.target, dx = f.p.x - this.pos.x, dz = f.p.y - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.62) this.eat(f);
        else {
          const sp = (this.o.swim ?? 1.9) * dt;
          this.pos.x += (dx / d) * Math.min(sp, d); this.pos.z += (dz / d) * Math.min(sp, d);
          this.turnTo(Math.atan2(dx, dz), dt, 7);
        }
      }
    } else if (s === 'eat') {
      if (this.t > (this.kind === 'pill' ? 0.55 : 1.0)) { this.state = 'swim'; this.t = 0; }
    } else if (s === 'confused') {
      this.yaw += Math.sin(this.t * 2.2) * dt * 1.6;
      if (this.q) {
        const k = back(this.t / 0.25), b = this.q.userData.base;
        this.q.scale.set(b.x * k, b.y * k, 1);
        this.q.position.copy(this.head()).add(V3(0, 0.15 + Math.sin(this.t * 3.1) * 0.08, 0));
      }
    }
    // keep a little personal space
    for (const o of bears) {
      if (o === this || o.state === 'wait' || o.inWater !== this.inWater || this.state === 'hop' || o.state === 'hop') continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      const min = this.inWater ? 1.25 : 0.8;
      if (d < min && d > 1e-4) { const k = ((min - d) / d) * 0.5 * Math.min(1, dt * 8); this.pos.x += dx * k; this.pos.z += dz * k; }
    }
    this.place(dt);
  }
  sink() { return this.kind === 'pill' ? -0.62 : this.kind === 'cube' ? -0.6 : WATER_Y - 0.95 * (BEAR_TYPES[this.o.type || 'office'].scale || 1); }
  arrive() {
    if (this.mode === 'hunt' && inPond(this.pos.x, this.pos.z, -0.25)) {
      const to = V3(POND.x - this.pos.x, 0, POND.z + 0.6 - this.pos.z).normalize();
      this.hop = { a: this.pos.clone(), b: this.pos.clone().addScaledVector(to, this.o.hopLen ?? 2.0), dur: this.kind === 'pill' ? 0.55 : 0.7, h: this.kind === 'pill' ? 1.0 : 1.2, yaw: Math.atan2(to.x, to.z) };
      this.state = 'hop'; this.t = 0;
      sfx(this.kind === 'pill' ? 'jump' : 'whoosh', { volume: 0.22, pitch: rr(0.95, 1.2) });
    } else { this.state = 'idle'; this.t = 0; }
  }
  pickFish() {
    let best = null, bd = 1e9;
    for (const f of fishes) {
      if (!f.alive || (f.claimed && f.claimed !== this && f.claimed.target === f)) continue;
      const d = Math.hypot(f.p.x - this.pos.x, f.p.y - this.pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) best.claimed = this;
    return best;
  }
  eat(f) {
    f.die();
    this.target = null;
    this.eaten++;
    coins += 5;
    this.state = 'eat'; this.t = 0;
    this.kick(6);
    sfx('chomp', { volume: 0.45, pitch: rr(0.9, 1.15) });
    sfx('coin', { volume: 0.3, pitch: rr(1, 1.2) });
    popup('+5', this.head().add(V3(0, 0.15, 0)), { size: 0.6 * popScale });
  }
  head() { return V3(this.pos.x, this.y + (this.kind === 'pill' ? 1.6 : this.kind === 'cube' ? 1.45 : 2.0), this.pos.z); }
  place(dt) {
    // squash spring
    this.sqv += (-this.sq * 160 - this.sqv * 11) * dt;
    this.sq += this.sqv * dt;
    const s = this.state;
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.y = this.yaw;
    if (this.kind === 'pill' || this.kind === 'cube') {
      const b = this.body;
      if (s === 'walk') {
        this.phase += dt * this.speed * 5.2;
        b.position.y = Math.abs(Math.sin(this.phase)) * 0.12;
        b.rotation.z = Math.sin(this.phase) * 0.08;
        b.rotation.x = 0.07 + (this.speed > 2.5 ? 0.12 : 0);
      } else if (s === 'swim' || s === 'eat' || s === 'confused') {
        this.phase += dt * 3;
        b.position.y = Math.sin(this.phase) * 0.04;
        b.rotation.z = Math.sin(this.phase * 0.7) * 0.05;
        b.rotation.x = s === 'swim' ? 0.18 : 0;
      } else if (s === 'hop') {
        b.rotation.x = lerp(-0.3, 0.6, this.hopU || 0);
        b.position.y = 0; b.rotation.z = 0;
      } else {
        this.phase += dt * 2.2;
        b.position.y = 0; b.rotation.z = 0; b.rotation.x = 0;
      }
      const k = this.sq * 0.06;
      b.scale.set(1 + k, Math.max(0.6, 1 - k * 1.6) * (s === 'idle' ? 1 + Math.sin(this.phase) * 0.015 : 1), 1 + k);
    } else if (dt > 0) {
      const o = { speed: 0, inWater: this.inWater };
      let name = this.inWater ? 'swim' : 'idle';
      if (s === 'walk') { name = this.speed > 2.6 ? 'run' : 'walk'; o.speed = this.speed; }
      else if (s === 'hop') { name = 'cannonball'; o.t01 = this.hopU || 0; }
      else if (s === 'swim') { name = 'swim'; o.speed = 1.6; }
      else if (s === 'eat') name = 'eat';
      else if (s === 'confused') name = 'idle';
      else if (s === 'cheer') name = 'cheer';
      this.rig.pose(name, dt, o);
    }
  }
}
// the commute: door -> down the path -> spread out along the near bank
function commute(i, n, { spread = 4.4, jitter = 0.5 } = {}) {
  const x = n > 1 ? lerp(-spread, spread, (i + rr(-0.3, 0.3)) / (n - 1)) : 0;
  return [V3(DOOR.x + rr(-0.3, 0.3), 0, DOOR.z + 0.6), V3(rr(-jitter, jitter), 0, -9.4), V3(x * 0.45, 0, -5.4), V3(x, 0, pondEdge(x) - 0.45)];
}

// ------------------------------------------------------------------ editor turntable
function editorStage({ bg = '#2a2d33' } = {}) {
  scene.background = new THREE.Color(bg);
  scene.fog = null;
  const g = new THREE.Group();
  world.add(g);
  const grid = new THREE.GridHelper(14, 56, 0x5b6371, 0x3a3f48);
  grid.position.y = 0.002;
  g.add(grid);
  const table = new THREE.Group();
  g.add(table);
  mesh(new THREE.CylinderGeometry(1.08, 1.12, 0.08, 56), mat('#4a4f58'), table, 0, 0.04, 0);
  mesh(new THREE.TorusGeometry(1.1, 0.012, 6, 64).rotateX(Math.PI / 2), mat('#7d8696', { emissive: 0x222833 }), table, 0, 0.081, 0);
  const top = new THREE.Group();
  top.position.y = 0.08;
  table.add(top);
  hemi.intensity = 1.35;
  sun.position.set(-3, 6, 5);
  sun.intensity = 2.5;
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
  sun.shadow.camera.updateProjectionMatrix();
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2);
  rim.position.set(3, 3, -4);
  scene.add(rim);
  return { g, table, top };
}
// the posed rig as a cloud of voxel cubes (in `parent` space), revealed bottom-up by build(u)
function voxelCloud(fox, parent, dur = 5.8) {
  fox.root.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  const inv = parent.matrixWorld.clone().invert();
  const items = [];
  const Mx = new THREE.Matrix4(), T = new THREE.Matrix4();
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  for (const m of fox._meshes) {
    const src = VOX.get(m.geometry);
    if (!src || !shown(m)) continue;
    const base = inv.clone().multiply(m.matrixWorld);
    for (const [k, hex] of src.vox) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      T.makeTranslation((x + 0.5 - src.pivot[0]) * src.s, (y + 0.5 - src.pivot[1]) * src.s, (z + 0.5 - src.pivot[2]) * src.s);
      Mx.multiplyMatrices(base, T).scale(V3(src.s, src.s, src.s));
      const p = V3().setFromMatrixPosition(Mx);
      items.push({ m: Mx.clone(), p, hex, key: 0 });
    }
  }
  const layer = 0.0625;
  for (const it of items) it.key = Math.round(it.p.y / layer) * 100 + (it.p.x + it.p.z * 0.6) * 4 + rand() * 3;
  items.sort((a, b) => a.key - b.key);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), items.length);
  im.castShadow = true;
  const c = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0), tmp = new THREE.Matrix4();
  items.forEach((it, i) => { im.setColorAt(i, c.setHex(it.hex)); im.setMatrixAt(i, zero); });
  im.instanceColor.needsUpdate = true;
  parent.add(im);
  // cursor + slice plane, like a voxel editor
  const cursor = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  cursor.scale.setScalar(0.072);
  parent.add(cursor);
  const slice = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
  parent.add(slice);
  let shownN = 0;
  const POP = Math.max(8, Math.ceil((items.length / (dur * 30)) * 5)); // ~5 frames per pop
  return {
    count: items.length, im, cursor, slice,
    build(u) {
      const n = Math.floor(items.length * clamp01(u));
      const from = Math.max(0, Math.min(shownN, n) - POP);
      for (let i = from; i < items.length && i < n + 1; i++) {
        const age = n - i;
        if (i >= n) { im.setMatrixAt(i, zero); continue; }
        const k = age >= POP ? 1 : back(age / POP) * 1.0;
        tmp.copy(items[i].m).scale(V3(k, k, k));
        im.setMatrixAt(i, tmp);
      }
      for (let i = n; i < Math.min(items.length, shownN); i++) im.setMatrixAt(i, zero);
      shownN = n;
      im.instanceMatrix.needsUpdate = true;
      const last = items[Math.max(0, n - 1)];
      if (last) { cursor.position.copy(last.p); slice.position.y = last.p.y; }
      cursor.visible = slice.visible = n > 0 && n < items.length;
    },
  };
}

// ------------------------------------------------------------------ cameras
// keys: { t, p:[x,y,z], l:[x,y,z] | fn(t) -> Vector3, fov, cut }
function camAt(keys, t) {
  const get = (k) => ({ p: V3(...k.p), l: typeof k.l === 'function' ? k.l(t) : V3(...k.l), fov: k.fov ?? 48 });
  if (t <= keys[0].t) return get(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) {
      if (b.cut) return get(a);
      const u = ease((t - a.t) / (b.t - a.t)), A = get(a), B = get(b);
      return { p: A.p.lerp(B.p, u), l: A.l.lerp(B.l, u), fov: lerp(A.fov, B.fov, u) };
    }
  }
  return get(keys[keys.length - 1]);
}
const follow = (getPos, off, lag = 3) => {
  let cur = null;
  return { at(dt) { const p = getPos(); if (!cur) cur = p.clone(); else cur.lerp(p, 1 - Math.exp(-lag * dt)); return cur.clone().add(off); } };
};

// ------------------------------------------------------------------ shots
// Each shot builds its scene and returns { cam(t, dt) -> {p,l,fov} | keys, update(t, dt), anchors, hud }.
const SHOTS = {};
const fox = { rig: null, cube: null, pos: V3(1.6, 0, -2.75) };
function cubeFoxAt(p = fox.pos, label = true) {
  fox.cube = boxFox();
  fox.cube.position.copy(p);
  world.add(fox.cube);
  if (label) { const l = debugLabel('fox (cube for now)', 28); l.position.y = 1.85; fox.cube.add(l); }
  return fox.cube;
}

// Day 1: the greybox + one very determined pill
function day1(cam) {
  greybox();
  cubeFoxAt();
  spawnFish(0);
  const b = new Bear({ start: 0.3, label: 'bear_01', speed: 1.95, mode: 'through', path: [V3(0, 0, DOOR.z + 0.6), V3(0.5, 0, -9.4), V3(fox.pos.x - 0.05, 0, fox.pos.z - 0.2), V3(fox.pos.x + 0.4, 0, 3.2), V3(fox.pos.x + 0.6, 0, 7.8)] });
  return { cam, update(t, dt) { b.update(dt); }, anchors: { bear: () => b.head(), fox: () => fox.pos.clone().add(V3(0, 1.5, 0)), office: () => V3(0, 5.2, OFFICE_Z), pond: () => V3(POND.x, 0, POND.z), door: () => DOOR.clone().add(V3(0, 1.3, 0)) }, bear: b };
}
SHOTS.d1_orbit = () => {
  const s = day1([{ t: 0, p: [-14, 16, 15], l: [0, 0, -5.5], fov: 50 }, { t: 7, p: [8, 18.5, 17], l: [0, 0, -5], fov: 50 }]);
  // the pill just stands on the path, looking hopeful
  Object.assign(s.bear, { state: 'idle', path: [] });
  s.bear.pos.set(1.0, 0, -8.2);
  s.bear.yaw = 0.25;
  s.bear.root.visible = true;
  return s;
};
SHOTS.d1_walk = () => {
  const s = day1(null);
  const f = follow(() => s.bear.root.visible ? s.bear.pos.clone().add(V3(0, 0.7, 0)) : DOOR.clone(), V3(0, 0, 0), 2.5);
  s.cam = (t, dt) => { const l = f.at(dt); return { p: l.clone().add(V3(3.6, 6.2, 10.4)), l: l.clone().add(V3(0, 0, 1.2)), fov: 46 }; };
  return s;
};
SHOTS.d1_bug = () => {
  const s = day1([{ t: 4.6, p: [4.6, 3.0, 4.2], l: [1.4, 0.7, -3.4], fov: 46 }, { t: 7.2, p: [4.6, 3.0, 4.2], l: [1.4, 0.7, -3.4], fov: 46 }, { t: 10.6, p: [5.4, 3.5, 5.6], l: [2.2, 0.5, 3.2], fov: 46 }]);
  return s;
};

// Day 2: fish that swim, fall in love, and (briefly) all go to one corner
function day2(mode) {
  greybox({ labels: false });
  fishBoxX = 2.9;
  spawnFish(mode === 'fixed' ? 14 : 12);
  breed = mode === 'clump' ? 0 : 1;
  for (const f of fishes) f.love = rr(0.5, mode === 'fixed' ? 2.2 : 3.5);
  clumpAt = new THREE.Vector2(POND.x + 2.2, pondEdge(2.2) + 0.55);
  return {
    cam: [{ t: 0, p: [0, 10.5, 11.2], l: [0, 0, 2.4], fov: 46 }, { t: 7, p: [0, 9.2, 9.8], l: [0, 0, 2.5], fov: 46 }],
    update(t, dt) {
      if (mode === 'clump') fishMode = t > 0.5 ? 'clump' : 'wander';
      updateFish(dt, t);
    },
    anchors: { clump: () => V3(clumpAt.x, 0.2, clumpAt.y), pond: () => V3(POND.x, 0, POND.z) },
    hud: () => ({ fish: fishAlive() }),
  };
}
SHOTS.d2_fish = () => day2('wander');
SHOTS.d2_bug = () => day2('clump');
SHOTS.d2_fixed = () => day2('fixed');

// Day 3: 5:00 PM. one simulation, three cameras (d3_door / d3_rush / d3_empty skip into it)
function day3(cam, { kind = 'pill', n = 12, fish = 14, speed = 3.6, gap = 0.34 } = {}) {
  greybox({ labels: false });
  spawnFish(fish);
  breed = 0;
  const list = [];
  for (let i = 0; i < n; i++) {
    const order = [5, 7, 3, 9, 1, 6, 10, 4, 0, 8, 2, 11][i % 12];
    list.push(new Bear({ kind, type: ['office', 'intern', 'office', 'accountant', 'office', 'intern'][i % 6], start: 1.6 + i * gap, speed, path: commute(order % n, n) }));
  }
  let rang = false;
  return {
    cam,
    update(t, dt) {
      if (t >= 1.2 && !rang) { rang = true; sfx('bell', { volume: 0.5 }); }
      setDoor((t - 1.25) / 0.5);
      for (const b of list) b.update(dt);
      updateFish(dt, t);
    },
    anchors: { door: () => DOOR.clone().add(V3(0, 1.3, 0)), pond: () => V3(POND.x, 0, POND.z), last: () => list[list.length - 1].head(), lost: () => list[4].head() },
    hud: () => {
      const m = T < 1.2 ? 16 * 60 + 59 : 17 * 60 + Math.floor((T - 1.2) / 1.6);
      return { coins, fish: fishAlive(), clock: `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} PM` };
    },
    list,
  };
}
SHOTS.d3_door = () => day3([{ t: 0, p: [0, 2.9, -6.6], l: [0, 1.9, -14.5], fov: 54 }, { t: 6, p: [0, 3.2, -5.6], l: [0, 1.5, -13.5], fov: 54 }]);
SHOTS.d3_rush = () => (popScale = 1.7) && day3([{ t: 2.4, p: [0, 23, 15.5], l: [0, 0, -5.2], fov: 50 }, { t: 12, p: [0, 20, 14.5], l: [0, 0, -3.2], fov: 50 }]);
SHOTS.d3_empty = () => day3([{ t: 0, p: [0.4, 10.5, 13.2], l: [0, 0, 1.6], fov: 46 }, { t: 24, p: [0.6, 8.6, 10.8], l: [0.2, 0.2, 1.8], fov: 46 }]);

// Day 4: Reynard, voxel by voxel
SHOTS.d4_build = () => {
  const E = editorStage();
  const f = makeFox();
  for (let k = 0; k < 12; k++) f.update(1 / 30);
  E.top.add(f.root);
  const cloud = voxelCloud(f, E.top, 5.8);
  f.root.visible = false;
  let swapped = false;
  return {
    cam: [{ t: 0, p: [0, 1.75, 6.9], l: [0, 1.08, 0], fov: 34 }, { t: 9, p: [0, 1.6, 6.1], l: [0, 1.1, 0], fov: 34 }],
    update(t, dt) {
      E.table.rotation.y = -TAU * (1 - ease((t - 0.2) / 6.6)) + (t > 6.8 ? Math.sin((t - 6.8) * 0.8) * 0.12 : 0);
      cloud.build((t - 0.4) / 5.8);
      if (t > 0.4 && t < 6.2 && Math.floor(t * 9) !== Math.floor((t - dt) * 9)) sfx('click', { volume: 0.12, pitch: rr(1.2, 1.6) });
      if (t >= 6.6 && !swapped) {
        swapped = true;
        cloud.im.visible = false;
        f.root.visible = true;
        f.play('wave_hello', { fade: 0 });
        f.setExpression('happy', { hold: 3 });
        sfx('pop_in', { volume: 0.5 });
        sfx('star_pop', { volume: 0.35 });
      }
      if (swapped) f.update(dt);
    },
    anchors: { head: () => { const v = V3(); f.headTop(v); return v; } },
    hud: () => ({ voxels: Math.min(cloud.count, Math.floor(cloud.count * clamp01((T - 0.4) / 5.8))) }),
  };
};
SHOTS.d4_anims = () => {
  const E = editorStage();
  const f = makeFox();
  E.top.add(f.root);
  const seq = [['greedy', 'greedy'], ['laugh_evil', 'mwaha'], ['panic', 'shocked'], ['think', 'scheming'], ['facepalm', 'tsk'], ['cheer', 'excited'], ['dance', 'happy']];
  let cur = -1;
  return {
    cam: [{ t: 0, p: [0, 1.7, 6.4], l: [0, 1.05, 0], fov: 34 }, { t: 9, p: [0, 1.6, 5.8], l: [0, 1.08, 0], fov: 34 }],
    update(t, dt) {
      E.table.rotation.y = Math.sin(t * 0.6) * 0.25;
      const i = Math.min(seq.length - 1, Math.floor(t / 1.15));
      if (i !== cur) { cur = i; f.play(seq[i][0], { fade: 0.15, restart: true }); f.setExpression(seq[i][1], { hold: 1.15 }); }
      f.update(dt);
    },
    anchors: { head: () => { const v = V3(); f.headTop(v); return v; } },
    hud: () => ({ anim: seq[Math.max(0, cur)][0] }),
  };
};
SHOTS.d4_swap = () => {
  greybox({ labels: false });
  cubeFoxAt(fox.pos, false);
  spawnFish(10);
  breed = 0;
  const f = makeFox();
  f.root.position.copy(fox.pos);
  f.root.rotation.y = 0.35;
  f.root.scale.setScalar(0.9);
  f.root.visible = false;
  world.add(f.root);
  let done = false, counting = false;
  return {
    cam: [{ t: 0, p: [4.0, 2.6, 2.2], l: [1.5, 0.8, -2.8], fov: 44 }, { t: 6, p: [3.6, 2.3, 1.2], l: [1.5, 0.85, -2.8], fov: 44 }],
    update(t, dt) {
      if (t > 1.4 && !done) {
        done = true;
        poof(fox.pos.clone().add(V3(0, 0.5, 0)), { n: 16, size: 0.55 });
        sfx('pop_in', { volume: 0.55 }); sfx('whoosh', { volume: 0.3 });
        fox.cube.visible = false;
        f.root.visible = true;
        f.play('cheer', { fade: 0 });
        f.setExpression('proud', { hold: 2.5 });
      }
      if (done && t > 3.2 && !counting) { counting = true; f.play('count_coins', { fade: 0.3 }); }
      if (done) f.update(dt);
      updateFish(dt, t);
    },
    anchors: { fox: () => fox.pos.clone().add(V3(0, 1.6, 0)) },
  };
};

// Day 5: the bears get bodies
SHOTS.d5_turn = () => {
  const E = editorStage();
  const b = makeBear('office', 3.7);
  E.top.add(b.root);
  const seq = [['idle', 1.0], ['walk', 2.0], ['eat', 1.5], ['roar', 1.5], ['cheer', 2.2]];
  return {
    cam: [{ t: 0, p: [0, 1.75, 7.2], l: [0, 1.15, 0], fov: 36 }, { t: 9, p: [0, 1.7, 6.5], l: [0, 1.15, 0], fov: 36 }],
    update(t, dt) {
      E.table.rotation.y = -0.5 + t * 0.35;
      let k = 0, acc = 0;
      for (; k < seq.length - 1; k++) { if (t < acc + seq[k][1]) break; acc += seq[k][1]; }
      const name = seq[k][0];
      b.pose(name, dt, { speed: name === 'walk' ? 1.6 : 0 });
    },
    anchors: { head: () => { const v = V3(); b.headTop(v); return v; } },
  };
};
SHOTS.d5_lineup = () => {
  const E = editorStage({ bg: '#2a2d33' });
  E.table.visible = false;
  const types = ['grandma', 'construction', 'ceo', 'tourist', 'office', 'lumberjack', 'intern', 'janitor', 'cub'];
  const list = types.map((ty, i) => {
    const b = makeBear(ty, 2 + i * 1.3);
    const r = Math.floor(i / 3), c = i % 3;
    b.root.position.set((c - 1) * 1.45 + (r === 1 ? 0.2 : 0), 0, (r - 1) * 1.5);
    b.root.rotation.y = -0.15 * (c - 1);
    b.root.visible = false;
    world.add(b.root);
    return { b, at: 0.35 + i * 0.42, s: b.root.scale.x };
  });
  return {
    cam: [{ t: 0, p: [0, 6.2, 14.2], l: [0, 1.0, 0], fov: 40 }, { t: 7, p: [0, 5.8, 13.2], l: [0, 1.0, 0], fov: 40 }],
    update(t, dt) {
      for (const it of list) {
        const u = (t - it.at) / 0.3;
        if (u < 0) continue;
        if (!it.b.root.visible) { it.b.root.visible = true; sfx('pop_in', { volume: 0.35, pitch: 0.9 + list.indexOf(it) * 0.06 }); }
        it.b.root.scale.setScalar(it.s * Math.max(0.001, back(u)));
        it.b.pose(t > 4.4 ? 'cheer' : 'idle', dt, {});
      }
    },
  };
};
SHOTS.d5_world = () => {
  greybox({ labels: false });
  spawnFish(14);
  breed = 0;
  const f = makeFox();
  f.root.position.copy(fox.pos);
  f.root.rotation.y = 0.2;
  f.root.scale.setScalar(0.9);
  world.add(f.root);
  const types = ['office', 'intern', 'construction', 'office', 'grandma', 'tourist'];
  const list = types.map((ty, i) => new Bear({ kind: 'voxel', type: ty, seed: 3 + i, start: i * 0.55, speed: 1.9, path: commute([2, 4, 0, 5, 1, 3][i], 6, { spread: 3.6 }), hopLen: 2.2 }));
  const fl = follow(() => list[1].pos.clone(), V3(0, 0, 0), 1.2);
  return {
    cam: (t, dt) => { const l = fl.at(dt); l.y = 0.6; l.z = Math.min(l.z, 1.0); return { p: l.clone().add(V3(-2.5, 6.8, 9.5)), l, fov: 46 }; },
    update(t, dt) { for (const b of list) b.update(dt); updateFish(dt, t); f.update(dt); },
    anchors: { bear: () => list[1].head(), fox: () => fox.pos.clone().add(V3(0, 1.6, 0)) },
  };
};

// Day 6: the same scene, then through the game's pixel renderer (one variant per shot)
function day6(variant) {
  greybox({ flat: true, labels: false });
  scene.fog = null; // the ortho camera sits 110 units out
  spawnFish(14);
  breed = 0;
  const f = makeFox();
  f.root.position.copy(fox.pos);
  f.root.rotation.y = 0.15;
  f.root.scale.setScalar(0.9);
  world.add(f.root);
  const types = ['office', 'intern', 'construction', 'grandma', 'tourist'];
  const list = types.map((ty, i) => new Bear({ kind: 'voxel', type: ty, seed: 5 + i, start: i * 0.7, speed: 1.9, path: commute([1, 3, 0, 4, 2][i], 5, { spread: 3.6 }), hopLen: 2.2 }));
  rig = new CameraRig();
  rig.freeBounds = true;
  rig.follow = null;
  rig.yaw = rig.yawGoal = 0;
  rig.pitch = THREE.MathUtils.degToRad(44);
  rig.pitchGoal = null;
  rig.wupp = rig.wuppGoal = 0.022;
  rig.minWupp = 0.001;
  const cam = (t) => {
    const u = ease(t / 8);
    const tg = V3(lerp(0.6, 1.1, u), 0, lerp(-3.0, -1.8, u));
    rig.target.copy(tg); rig.goal.copy(tg);
    rig.wupp = rig.wuppGoal = lerp(0.022, 0.02, u);
    return null;
  };
  return {
    variant, cam,
    update(t, dt) { for (const b of list) b.update(dt); updateFish(dt, t); f.update(dt); },
    anchors: { fox: () => fox.pos.clone().add(V3(0, 1.6, 0)), bear: () => list[0].head() },
  };
}
for (const v of ['plain', 'low', 'outline', 'pixel']) SHOTS['d6_' + v] = () => day6(v);

// ------------------------------------------------------------------ v2: the square prototype, in pixel art
// The same little world, but every placeholder is a box (ground and pond are 1x1 tiles) and it
// all goes through the game's own PixelRenderer + CameraRig, like the real game.
function checkerTex(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 2, 2);
  g.fillStyle = b; g.fillRect(1, 0, 1, 1); g.fillRect(0, 1, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function tiles(cells, h, colorA, colorB, y) {
  const m = new THREE.InstancedMesh(cubeGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), cells.length);
  const M = new THREE.Matrix4(), c = new THREE.Color();
  cells.forEach(([x, z], i) => {
    M.makeScale(1, h, 1).setPosition(x + 0.5, y - h / 2, z + 0.5);
    m.setMatrixAt(i, M);
    m.setColorAt(i, c.set((x + z) & 1 ? colorA : colorB));
  });
  m.receiveShadow = true;
  world.add(m);
  return m;
}
function squareWorld({ labels = false } = {}) {
  SQUARES = true;
  scene.background = new THREE.Color('#6f8f5c');
  scene.fog = null;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checkerTex('#93b26f', '#89a967'), roughness: 0.95 }));
  ground.material.map.repeat.set(48, 48);
  ground.receiveShadow = true;
  world.add(ground);
  // the pond and its bank, tile by tile
  const water = [], bank = [];
  for (let x = -12; x < 12; x++) for (let z = -6; z < 12; z++) {
    const cx = x + 0.5, cz = z + 0.5;
    if (inPond(cx, cz)) water.push([x, z]);
    else if (pondR(cx, cz) < 1.16) bank.push([x, z]);
  }
  tiles(bank, 0.06, '#d8c38a', '#d0bb82', 0.015);
  tiles(water, 0.06, '#3f86d4', '#3a7fcc', WATER_Y);
  // the path: door -> pond
  const path = [];
  for (let z = OFFICE_Z + 3; z < pondEdge(0) - 0.4; z++) for (const x of [-1, 0]) path.push([x, z]);
  tiles(path, 0.04, '#c9ae7a', '#c2a774', 0.012);
  // the office: a big box, a door box, window boxes
  const off = new THREE.Group();
  off.position.set(0, 0, OFFICE_Z);
  world.add(off);
  box(11, 4.8, 5, '#a9adb5', off, 0, 2.4, 0);
  for (let r = 0; r < 2; r++) for (let c = -2; c <= 2; c++) if (!(r === 0 && c === 0)) box(1.2, 0.9, 0.1, '#7f97b0', off, c * 2.1, 1.75 + r * 1.55, 2.53);
  box(1.8, 2.5, 0.05, '#1b1d22', off, 0, 1.25, 2.51);
  door = box(1.8, 2.5, 0.1, '#5b616b', off, 0, 1.25, 2.55);
  // trees (a green box on a brown box) and rocks (grey boxes)
  const placed = [];
  for (let k = 0; k < 500 && placed.length < 30; k++) {
    const x = Math.round(rr(-16, 16)) + 0.5, z = Math.round(rr(-26, 14)) + 0.5;
    if (pondR(x, z) < 1.5) continue;
    if (Math.abs(x) < 2.6 && z > -15 && z < -1) continue;
    if (Math.abs(x) < 7.2 && z > OFFICE_Z - 3.5 && z < OFFICE_Z + 3.4) continue;
    if (placed.some((t) => Math.hypot(t[0] - x, t[1] - z) < 2.4)) continue;
    placed.push([x, z]);
    const s2 = [1, 1, 1.4][(rand() * 3) | 0];
    box(0.42, 0.8, 0.42, '#7a5636', world, x, 0.4, z);
    box(1.5 * s2, 1.5 * s2, 1.5 * s2, ['#4f8f45', '#5a9a4c', '#468540'][(rand() * 3) | 0], world, x, 0.8 + 0.75 * s2, z);
  }
  for (let i = 0; i < 8; i++) {
    const a = rr(0, TAU), r = 1.2;
    const x = Math.round(POND.x + Math.cos(a) * POND.rx * r) + 0.5, z = Math.round(POND.z - Math.sin(a) * POND.rz * r) + 0.5;
    if (Math.abs(x) < 2.6 && z < POND.z) continue;
    const k = rr(0.45, 0.7);
    box(k, k * 0.8, k, '#8f949b', world, x, k * 0.4, z);
  }
  void labels;
}
// a heart made of pixels (the fish "falling in love")
function heartSprite() {
  const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') { g.fillStyle = '#ff5d8f'; g.fillRect(x + 1, y + 1, 1, 1); } }));
  return c;
}
function pixelPop(canvas, pos, { size = 0.6, life = 1.1, rise = 0.8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(size * (canvas.width / canvas.height), size, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 60;
  sp.position.copy(pos);
  world.add(sp);
  const b = sp.scale.clone(), y0 = pos.y;
  let t0 = 0;
  FX.push((dt) => {
    t0 += dt;
    const k = back(t0 / 0.22);
    sp.scale.set(b.x * k, b.y * k, 1);
    sp.position.y = y0 + rise * (1 - Math.exp(-t0 * 2.2));
    sp.material.opacity = 1 - clamp01((t0 - life + 0.3) / 0.3);
    if (t0 > life) { sp.removeFromParent(); return false; }
    return true;
  });
}
// the game's camera: { t, x, z, y, yaw, pitch (deg), wupp } keys (eased), or a function of time
function rigKeysAt(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) {
      const u = b.cut ? 0 : ease((t - a.t) / (b.t - a.t));
      const o = {};
      for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'wupp']) o[k] = lerp(a[k] ?? 0, b[k] ?? 0, u);
      return o;
    }
  }
  return keys[keys.length - 1];
}
function rigShot(S) {
  rig = new CameraRig();
  rig.freeBounds = true;
  rig.follow = null;
  rig.minWupp = 0.0005;
  rig.maxWupp = 1;
  S.pixel = true;
  S.rigAt = (t, dt) => (typeof S.rigCam === 'function' ? S.rigCam(t, dt) : rigKeysAt(S.rigCam, t));
  return S;
}
function applyRig(k) {
  rig.target.set(k.x, k.y ?? 0, k.z);
  rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = k.yaw ?? 0;
  rig.pitch = THREE.MathUtils.degToRad(k.pitch ?? 44);
  rig.pitchGoal = null;
  rig.wupp = rig.wuppGoal = k.wupp ?? 0.03;
}
const squareFox = { pos: V3(1.6, 0, -2.75), obj: null };
function squareFoxAt() {
  SQUARES = true;
  squareFox.obj = cubeFox();
  squareFox.obj.position.copy(squareFox.pos);
  world.add(squareFox.obj);
  return squareFox.obj;
}
const sqAnchors = (extra = {}) => ({ fox: () => squareFox.pos.clone().add(V3(0, 1.3, 0)), office: () => V3(0, 5.2, OFFICE_Z), pond: () => V3(POND.x, 0, POND.z), door: () => DOOR.clone().add(V3(0, 1.3, 0)), ...extra });

// day 1: one brown box walks to the pond, through the fox, and onto the water
function q1(rigCam) {
  squareWorld();
  squareFoxAt();
  const b = new Bear({ kind: 'cube', start: 0.3, speed: 1.95, mode: 'through', path: [V3(-0.5, 0, DOOR.z + 0.6), V3(0.1, 0, -9.4), V3(squareFox.pos.x - 0.05, 0, squareFox.pos.z - 0.2), V3(squareFox.pos.x + 0.4, 0, 3.2), V3(squareFox.pos.x + 0.6, 0, 7.8)] });
  return rigShot({ rigCam, update(t, dt) { b.update(dt); }, anchors: sqAnchors({ bear: () => b.head() }), bear: b });
}
SHOTS.q1_wide = () => {
  const S = q1([{ t: 0, x: 0, z: -6, yaw: -0.25, pitch: 44, wupp: 0.05 }, { t: 7, x: 0.5, z: -4.5, yaw: 0.2, pitch: 44, wupp: 0.044 }]);
  Object.assign(S.bear, { state: 'idle', path: [] });
  S.bear.pos.set(1.0, 0, -8.2);
  S.bear.yaw = 0.25;
  S.bear.root.visible = true;
  return S;
};
SHOTS.q1_walk = () => {
  const S = q1(null);
  let cur = null;
  S.rigCam = (t, dt) => {
    const p = S.bear.root.visible ? S.bear.pos.clone() : DOOR.clone();
    if (!cur) cur = p.clone(); else cur.lerp(p, 1 - Math.exp(-2.5 * dt));
    return { x: cur.x + 0.3, z: cur.z + 1.6, yaw: 0.15, pitch: 40, wupp: 0.022 };
  };
  return S;
};
SHOTS.q1_bug = () => q1([{ t: 4.6, x: 1.6, z: -1.6, yaw: 0.35, pitch: 38, wupp: 0.016 }, { t: 7.2, x: 1.6, z: -1.6, yaw: 0.35, pitch: 38, wupp: 0.016 }, { t: 10.6, x: 2.1, z: 2.6, yaw: 0.35, pitch: 38, wupp: 0.019 }]);

// day 2: square fish
function q2(mode) {
  squareWorld();
  fishBoxX = 2.9;
  spawnFish(mode === 'fixed' ? 14 : 12);
  breed = mode === 'clump' ? 0 : 1;
  for (const f of fishes) f.love = rr(0.5, mode === 'fixed' ? 2.2 : 3.5);
  clumpAt = new THREE.Vector2(POND.x + 2.2, pondEdge(2.2) + 0.55);
  return rigShot({
    rigCam: [{ t: 0, x: 0, z: 2.3, yaw: 0, pitch: 50, wupp: 0.02 }, { t: 7, x: 0.2, z: 2.2, yaw: 0, pitch: 50, wupp: 0.018 }],
    update(t, dt) {
      if (mode === 'clump') fishMode = t > 0.5 ? 'clump' : 'wander';
      updateFish(dt, t);
    },
    anchors: { clump: () => V3(clumpAt.x, 0.2, clumpAt.y), pond: () => V3(POND.x, 0, POND.z) },
    hud: () => ({ fish: fishAlive() }),
  });
}
SHOTS.q2_fish = () => q2('wander');
SHOTS.q2_bug = () => q2('clump');
SHOTS.q2_fixed = () => q2('fixed');

// day 3: 5 PM, boxes everywhere
function q3(rigCam) {
  squareWorld();
  spawnFish(14);
  breed = 0;
  const list = [];
  for (let i = 0; i < 12; i++) {
    const order = [5, 7, 3, 9, 1, 6, 10, 4, 0, 8, 2, 11][i];
    list.push(new Bear({ kind: 'cube', start: 1.6 + i * 0.34, speed: 3.6, path: commute(order, 12) }));
  }
  let rang = false;
  return rigShot({
    rigCam,
    update(t, dt) {
      if (t >= 1.2 && !rang) { rang = true; sfx('bell', { volume: 0.5 }); }
      setDoor((t - 1.25) / 0.5);
      for (const b of list) b.update(dt);
      updateFish(dt, t);
    },
    anchors: { door: () => DOOR.clone().add(V3(0, 1.3, 0)), pond: () => V3(POND.x, 0, POND.z) },
    hud: () => {
      const m = T < 1.2 ? 16 * 60 + 59 : 17 * 60 + Math.floor((T - 1.2) / 1.6);
      return { coins, fish: fishAlive(), clock: `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} PM` };
    },
  });
}
SHOTS.q3_door = () => q3([{ t: 0, x: 0, z: -11.5, yaw: 0, pitch: 30, wupp: 0.02 }, { t: 6, x: 0, z: -10.5, yaw: 0, pitch: 32, wupp: 0.019 }]);
SHOTS.q3_rush = () => (popScale = 1.6) && q3([{ t: 2.4, x: 0, z: -5.5, yaw: 0, pitch: 46, wupp: 0.05 }, { t: 12, x: 0, z: -2.5, yaw: 0, pitch: 46, wupp: 0.04 }]);
SHOTS.q3_empty = () => q3([{ t: 0, x: 0, z: 2.3, yaw: 0, pitch: 46, wupp: 0.026 }, { t: 24, x: 0, z: 2.3, yaw: 0, pitch: 46, wupp: 0.022 }]);

// day 4: Reynard, built from voxels, through the pixel renderer
function editorPix() {
  const E = editorStage();
  SQUARES = true;
  return E;
}
SHOTS.q4_build = () => {
  const E = editorPix();
  const f = makeFox();
  for (let k = 0; k < 12; k++) f.update(1 / 30);
  E.top.add(f.root);
  const cloud = voxelCloud(f, E.top, 5.8);
  f.root.visible = false;
  let swapped = false;
  return rigShot({
    rigCam: [{ t: 0, x: 0, y: 1.05, z: 0, yaw: 0, pitch: 16, wupp: 0.0085 }, { t: 9, x: 0, y: 1.08, z: 0, yaw: 0, pitch: 14, wupp: 0.0076 }],
    update(t, dt) {
      E.table.rotation.y = -TAU * (1 - ease((t - 0.2) / 6.6)) + (t > 6.8 ? Math.sin((t - 6.8) * 0.8) * 0.12 : 0);
      cloud.build((t - 0.4) / 5.8);
      if (t > 0.4 && t < 6.2 && Math.floor(t * 9) !== Math.floor((t - dt) * 9)) sfx('click', { volume: 0.12, pitch: rr(1.2, 1.6) });
      if (t >= 6.6 && !swapped) {
        swapped = true;
        cloud.im.visible = false;
        f.root.visible = true;
        f.play('wave_hello', { fade: 0 });
        f.setExpression('happy', { hold: 3 });
        sfx('pop_in', { volume: 0.5 });
        sfx('star_pop', { volume: 0.35 });
      }
      if (swapped) f.update(dt);
    },
    hud: () => ({ voxels: Math.min(cloud.count, Math.floor(cloud.count * clamp01((T - 0.4) / 5.8))) }),
  });
};
SHOTS.q4_anims = () => {
  const E = editorPix();
  const f = makeFox();
  E.top.add(f.root);
  const seq = [['greedy', 'greedy'], ['laugh_evil', 'mwaha'], ['panic', 'shocked'], ['think', 'scheming'], ['facepalm', 'tsk'], ['cheer', 'excited'], ['dance', 'happy']];
  let cur = -1;
  return rigShot({
    rigCam: [{ t: 0, x: 0, y: 1.05, z: 0, yaw: 0, pitch: 14, wupp: 0.0078 }, { t: 9, x: 0, y: 1.08, z: 0, yaw: 0, pitch: 14, wupp: 0.007 }],
    update(t, dt) {
      E.table.rotation.y = Math.sin(t * 0.6) * 0.25;
      const i = Math.min(seq.length - 1, Math.floor(t / 1.15));
      if (i !== cur) { cur = i; f.play(seq[i][0], { fade: 0.15, restart: true }); f.setExpression(seq[i][1], { hold: 1.15 }); }
      f.update(dt);
    },
    hud: () => ({ anim: seq[Math.max(0, cur)][0] }),
  });
};
SHOTS.q4_swap = () => {
  squareWorld();
  squareFoxAt();
  spawnFish(10);
  breed = 0;
  const f = makeFox();
  f.root.position.copy(squareFox.pos);
  f.root.rotation.y = 0.35;
  f.root.scale.setScalar(0.9);
  f.root.visible = false;
  world.add(f.root);
  let done = false, counting = false;
  return rigShot({
    rigCam: [{ t: 0, x: 1.6, z: -2.2, yaw: 0.2, pitch: 34, wupp: 0.0105 }, { t: 6, x: 1.6, z: -2.4, yaw: 0.2, pitch: 34, wupp: 0.0095 }],
    update(t, dt) {
      if (t > 1.4 && !done) {
        done = true;
        poof(squareFox.pos.clone().add(V3(0, 0.5, 0)), { n: 16, size: 0.55 });
        sfx('pop_in', { volume: 0.55 }); sfx('whoosh', { volume: 0.3 });
        squareFox.obj.visible = false;
        f.root.visible = true;
        f.play('cheer', { fade: 0 });
        f.setExpression('proud', { hold: 2.5 });
      }
      if (done && t > 3.2 && !counting) { counting = true; f.play('count_coins', { fade: 0.3 }); }
      if (done) f.update(dt);
      updateFish(dt, t);
    },
    anchors: sqAnchors(),
  });
};

// day 5: the bears
SHOTS.q5_turn = () => {
  const E = editorPix();
  const b = makeBear('office', 3.7);
  E.top.add(b.root);
  const seq = [['idle', 1.0], ['walk', 2.0], ['eat', 1.5], ['roar', 1.5], ['cheer', 2.2]];
  return rigShot({
    rigCam: [{ t: 0, x: 0, y: 1.15, z: 0, yaw: 0, pitch: 14, wupp: 0.0088 }, { t: 9, x: 0, y: 1.15, z: 0, yaw: 0, pitch: 14, wupp: 0.008 }],
    update(t, dt) {
      E.table.rotation.y = -0.5 + t * 0.35;
      let k = 0, acc = 0;
      for (; k < seq.length - 1; k++) { if (t < acc + seq[k][1]) break; acc += seq[k][1]; }
      const name = seq[k][0];
      b.pose(name, dt, { speed: name === 'walk' ? 1.6 : 0 });
    },
  });
};
SHOTS.q5_lineup = () => {
  const E = editorPix();
  E.table.visible = false;
  const types = ['grandma', 'construction', 'ceo', 'tourist', 'office', 'lumberjack', 'intern', 'janitor', 'cub'];
  const list = types.map((ty, i) => {
    const b = makeBear(ty, 2 + i * 1.3);
    const r = Math.floor(i / 3), c = i % 3;
    b.root.position.set((c - 1) * 1.45 + (r === 1 ? 0.2 : 0), 0, (r - 1) * 1.5);
    b.root.rotation.y = -0.15 * (c - 1);
    b.root.visible = false;
    world.add(b.root);
    return { b, at: 0.35 + i * 0.42, s: b.root.scale.x };
  });
  return rigShot({
    rigCam: [{ t: 0, x: 0.1, y: 0.9, z: 0, yaw: 0, pitch: 26, wupp: 0.0165 }, { t: 7, x: 0.1, y: 0.9, z: 0, yaw: 0, pitch: 26, wupp: 0.0155 }],
    update(t, dt) {
      for (const it of list) {
        const u = (t - it.at) / 0.3;
        if (u < 0) continue;
        if (!it.b.root.visible) { it.b.root.visible = true; sfx('pop_in', { volume: 0.35, pitch: 0.9 + list.indexOf(it) * 0.06 }); }
        it.b.root.scale.setScalar(it.s * Math.max(0.001, back(u)));
        it.b.pose(t > 4.4 ? 'cheer' : 'idle', dt, {});
      }
    },
  });
};
// the brown boxes on the path poof into real bears, who then do the commute
SHOTS.q5_swap = () => {
  squareWorld();
  spawnFish(14);
  breed = 0;
  const f = makeFox();
  f.root.position.copy(squareFox.pos);
  f.root.rotation.y = 0.2;
  f.root.scale.setScalar(0.9);
  world.add(f.root);
  const types = ['office', 'intern', 'construction', 'grandma', 'tourist'];
  const boxes = [], real = [];
  types.forEach((ty, i) => {
    const p = commute([2, 4, 0, 3, 1][i], 5, { spread: 3.6 });
    const b0 = new Bear({ kind: 'cube', x: p[1].x + (i - 2) * 0.9, z: -9.6 + i * 1.1, path: [] });
    b0.yaw = 0;
    boxes.push(b0);
    const b1 = new Bear({ kind: 'voxel', type: ty, seed: 3 + i, x: b0.pos.x, z: b0.pos.z, path: p.slice(2), speed: 1.9, hopLen: 2.2 });
    b1.root.visible = false;
    b1.state = 'hold';
    real.push(b1);
  });
  let popped = false;
  return rigShot({
    rigCam: [{ t: 0, x: 0.3, z: -8.0, yaw: 0, pitch: 40, wupp: 0.02 }, { t: 1.6, x: 0.3, z: -8.0, yaw: 0, pitch: 40, wupp: 0.02 }, { t: 5.5, x: 0.6, z: -2.0, yaw: 0, pitch: 42, wupp: 0.026 }, { t: 9, x: 0.6, z: 0.6, yaw: 0, pitch: 44, wupp: 0.026 }],
    update(t, dt) {
      if (t > 1.0 && !popped) {
        popped = true;
        boxes.forEach((b0, i) => {
          poof(b0.pos.clone().add(V3(0, 0.6, 0)), { n: 10, size: 0.5 });
          b0.root.visible = false;
          real[i].root.visible = true;
          real[i].state = 'walk';
        });
        sfx('pop_in', { volume: 0.55 }); sfx('whoosh', { volume: 0.3 });
      }
      for (const b of real) if (b.state !== 'hold') b.update(dt); else b.place(dt);
      updateFish(dt, t);
      f.update(dt);
    },
    anchors: sqAnchors({ bear: () => real[2].head() }),
  });
};

// ------------------------------------------------------------------ main
// fonts first: the debug labels and pop-ups are drawn into canvases when the shot is built
await Promise.all([document.fonts.load("500 34px 'JB Mono'"), document.fonts.load("900 64px 'Nunito'"), document.fonts.load("64px 'TBME Body'")]).catch(() => {});
const S = SHOTS[SHOT]?.();
if (!S) throw new Error('no shot ' + SHOT);
let T = 0;
if (S.pixel) {
  pixel = new PixelRenderer(canvas);
  pixel.resize(W, H, 1);
  renderer = pixel.renderer;
} else if (S.variant) {
  if (S.variant === 'plain') { renderer = plainRenderer(1); orthoPlain = true; }
  else {
    pixel = new PixelRenderer(canvas);
    pixel.resize(W, H, 1);
    renderer = pixel.renderer;
    const u = pixel.postMat.uniforms;
    if (S.variant !== 'pixel') {
      u.outlineAmt.value = S.variant === 'outline' ? 0.55 : 0;
      u.highlightAmt.value = S.variant === 'outline' ? 0.12 : 0;
      u.vignette.value = 0; u.saturation.value = 1; u.contrast.value = 1; u.haze.value = 0;
      u.grade.value.set(1, 1, 1); u.lift.value.set(0, 0, 0);
      pixel.bloomOn = false;
    }
  }
} else renderer = plainRenderer(+(Q.get('pr') || 1));

function applyCam(dt) {
  if (S.pixel) {
    applyRig(S.rigAt(T, dt));
    rig.update(dt, pixel);
    return rig.camera;
  }
  if (S.variant) {
    S.cam(T);
    if (pixel) rig.update(dt, pixel);
    else {
      // same framing as the pixel renderer's low-res view, drawn plainly
      const sc = Math.max(1, Math.round(Math.hypot(W, H) / 760));
      rig.update(dt, { rtW: Math.ceil(W / sc), rtH: Math.ceil(H / sc) });
    }
    return rig.camera;
  }
  const c = typeof S.cam === 'function' ? S.cam(T, dt) : camAt(S.cam, T);
  persp.position.copy(c.p);
  persp.lookAt(c.l);
  if (persp.fov !== c.fov) { persp.fov = c.fov; persp.updateProjectionMatrix(); }
  persp.updateMatrixWorld(true);
  return persp;
}
function render(dt) {
  const cam = applyCam(dt);
  if (pixel) pixel.render(scene, rig);
  else renderer.render(scene, cam);
  return cam;
}
function simulate(dt) {
  T += dt;
  S.update?.(T, dt);
  fxUpdate(dt);
}
let cam = null;
const skip = +(Q.get('skip') || 0);
for (let i = 0; i < Math.round(skip * 30); i++) { simulate(1 / 30); if (typeof S.cam === 'function' || typeof S.rigCam === 'function') applyCam(1 / 30); }

const proj = V3();
window.__sb = {
  ready: false,
  playing: false,
  play() { this.playing = true; },
  get t() { return T; },
  meta() {
    const out = {};
    if (cam && S.anchors) for (const [k, fn] of Object.entries(S.anchors)) {
      proj.copy(fn()).project(cam);
      out[k] = [Math.round((proj.x + 1) * 0.5 * W), Math.round((1 - proj.y) * 0.5 * H)];
    }
    out._hud = { coins, fish: fishAlive(), t: +T.toFixed(3), ...(S.hud ? S.hud() : {}) };
    return out;
  },
};
let last = null;
function loop(ts) {
  const dt = last == null ? 1 / 30 : Math.min(0.1, (ts - last) / 1000);
  last = ts;
  if (window.__sb.playing) simulate(dt);
  cam = render(window.__sb.playing ? dt : 0);
  requestAnimationFrame(loop);
}
cam = render(0);
window.__sb.ready = true;
requestAnimationFrame(loop);
