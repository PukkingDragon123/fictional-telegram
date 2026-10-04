// Promo stage: takes over the running title-screen diorama (window.__title) and
// poses the real game rigs for the itch.io cover / banner. Driven by capture.mjs:
//   const S = await import('/tools/promo/stage.js');
//   await S.setup('thumb' | 'banner', opts);   // poses everything (actors frozen on a good frame)
//   S.mask(['fox'])                            // low-res white-on-transparent silhouette PNG (data URL)
// Everything lives inside the game page, so the world, water, sky curtain,
// lighting, outlines and pixel renderer are the game's own.
import * as THREE from 'three';
import { FoxRig } from '../../src/entities/foxRig.js';
import { BearRig } from '../../src/entities/bearRig.js';
import { BEAR_TYPES } from '../../src/data/bears.js';
import * as C3 from '../../src/entities/critters3d.js';
import { restaurantModel } from '../../src/entities/restaurantModels.js';
import { picnicModel } from '../../src/entities/structureModels.js';
import { voxelMaterial } from '../../src/core/voxel.js';
import { fishCanvasFor, FISH_TPU } from '../../src/game/fishSprites.js';
import { WATER_Y } from '../../src/world/grid.js';

const D2R = Math.PI / 180;
const S = (window.__promo ||= { actors: [], t: 0, cfg: null, named: {} });

// ------------------------------------------------------------------ cast helpers
function hideTitleCast(T) {
  for (const o of [T.fox?.root, T.deer?.root, T.foxChair?.base, T.deerChair?.base, T.cooler, T.floatCan, T.dfly, T.fishMesh]) if (o) o.visible = false;
  for (const d of T.ducks || []) d.d.root.visible = false;
  if (T.school?.batch?.mesh) T.school.batch.mesh.visible = false;
  for (const c of T.chicks || []) if (c.c?.root) c.c.root.visible = false;
}

// Reynard gasping with one paw clapped over his mouth: wraps the 'horror' anim
// (gasp, lean back, puffed tail) and re-aims the arms per rig.__promoPose.
export function shockedFox(fox, o = {}) {
  fox.play('horror', { fade: 0 });
  const def = fox._cur.def;
  if (!def.__promo) {
    const orig = def.fn;
    def.fn = function (t, p, f, s, rig) {
      orig.call(this, t, p, f, s, rig);
      const P = rig.__promoPose;
      if (!P) return;
      const w = Math.min(1, Math.max(0, (t - 0.1) / 0.16));
      p.ik(p.aR, P.mx, P.my, P.mz, 1, -0.9, -0.2, w);
      p.aR.st = P.st ?? 1.6;
      p.aR.shZ = (P.shZ ?? 3) * w; p.aR.shY = (P.shY ?? 1.2) * w;
      p.aR.wx = (P.wx ?? -1.3) * w; p.aR.wz = (P.wz ?? 0) * w;
      p.pawR = P.rpaw || 'open';
      if (P.left) {
        p.ik(p.aL, P.left[0], P.left[1], P.left[2], 1, -0.9, 0.1, w);
        p.aL.st = 1.6; p.aL.shZ = (P.lshZ ?? 0) * w; p.aL.shY = (P.lshY ?? 0) * w;
        p.aL.wx = (P.lwx ?? -1.2) * w; p.aL.wz = (P.lwz ?? 0.5) * w; p.pawL = P.lpaw || 'open';
      }
      if (P.lean != null) p.lean = P.lean;
      if (P.hRx != null) p.hRx += P.hRx;
      if (P.hRy != null) p.hRy += P.hRy;
      if (P.hRz != null) p.hRz += P.hRz;
      if (P.calm) { p.x = 0; }
      if (P.eyes) { f.eyeL = f.eyeR = P.eyes; }
      if (P.mouth) f.mouth = P.mouth;
      if (P.brow) f.browL = f.browR = P.brow;
      if (P.look) f.look = P.look;
      if (P.ears != null) { p.eL.fl = p.eR.fl = P.ears; }
      if (P.tail) { p.tPuff = P.tail; p.tLift = 0.9; }
      f.sweat = P.sweat ?? 2;
    };
    def.__promo = true;
  }
  fox.__promoPose = { mx: -1.8, my: 9.4, mz: 12, ...o };
  return fox;
}

export function makeBear(type, seed = 3.7) {
  const def = BEAR_TYPES[type];
  const b = new BearRig(type, def);
  b.personalize(seed);
  return b;
}

// a restaurant / structure voxel model as a plain Object3D (body + glowing bits + static parts)
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
export function propModel(type) {
  const g = new THREE.Group();
  if (type === 'picnic') {
    const m = new THREE.Mesh(picnicModel().build({ pivot: [0.5, 0, 0.5], scale: 0.1 }), voxelMaterial());
    m.castShadow = true;
    g.add(m);
    return g;
  }
  const m = restaurantModel(type, { seed: 1 });
  if (!m) return g;
  const body = new THREE.Mesh(m.body.build({ pivot: [0.5, 0, 0.5], scale: 0.1 }), voxelMaterial());
  body.castShadow = true;
  g.add(body);
  if (m.glow) g.add(new THREE.Mesh(m.glow.build({ pivot: [0.5, 0, 0.5], scale: 0.1, ao: false }), glowMat));
  for (const pt of m.parts || []) {
    const h = new THREE.Group();
    h.position.set((pt.pivot[0] - 0.5) * 0.1, pt.pivot[1] * 0.1, (pt.pivot[2] - 0.5) * 0.1);
    if (pt.model) { const mm = new THREE.Mesh(pt.model.build({ pivot: pt.pivot, scale: 0.1 }), voxelMaterial()); mm.castShadow = true; h.add(mm); }
    if (pt.glow) h.add(new THREE.Mesh(pt.glow.build({ pivot: pt.pivot, scale: 0.1, ao: false }), glowMat));
    g.add(h);
  }
  return g;
}

function fishSprite(id, scale = 1.3, rot = 0, dir = 1) {
  const cv = fishCanvasFor(id, { scale: 1 });
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
  m.scale.set((cv.width / FISH_TPU) * scale * dir, (cv.height / FISH_TPU) * scale, 1);
  m.material.rotation = rot;
  m.renderOrder = 12;
  return m;
}

// ------------------------------------------------------------------ camera + screen-space placement
function applyCamera(T, cam) {
  const game = T.game, rig = game.rig, rr = game.renderer;
  const { focus, wupp, yaw } = cam, pitch = cam.pitch * D2R;
  rig.freeBounds = true; rig.follow = null;
  rig.yaw = rig.yawGoal = yaw;
  rig.pitch = rig.pitchGoal = pitch;
  rig.minWupp = Math.min(rig.minWupp, wupp);
  rig.wupp = rig.wuppGoal = wupp;
  const hh0 = (rr.rtH * wupp) / 2;
  rig.dist = Math.max(24, (hh0 * Math.cos(pitch) + 0.8) / Math.sin(pitch));
  rig.goal.set(focus.x, 0.35, focus.z);
  rig.target.copy(rig.goal);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const SKY_D = cam.skyD ?? 3.4;
  if (T.skyMesh) {
    T.skyMesh.position.set(focus.x - sy * SKY_D, 0, focus.z - cy * SKY_D);
    T.skyMesh.rotation.set(0, yaw, 0);
    const hh = rr.rtH * wupp * 0.5, viewW = rr.rtW * wupp;
    const topH = (hh + 0.35 * Math.cos(pitch) - SKY_D * Math.sin(pitch)) / Math.cos(pitch);
    T.skyUniforms.uTop.value = Math.max(0.8, topH);
    const sun = cam.sun || [-0.08, 0.58];
    T.skyUniforms.uSun.value.set(viewW * sun[0], Math.max(0.5, topH * sun[1]));
    T.skyUniforms.uPx.value = wupp;
  }
  rig.update(0, rr);
}

const _ray = new THREE.Raycaster();
// the view ray through a screen point (sx, sy in 0..1, y down)
function ray(T, sx, sy) {
  _ray.setFromCamera(new THREE.Vector2(sx * 2 - 1, 1 - sy * 2), T.game.rig.camera);
  return _ray.ray;
}
// where that ray meets the horizontal plane y = h (default: the ground / water surface there)
function ground(T, sx, sy, h = null) {
  const r = ray(T, sx, sy), g = T.game.grid;
  let y = h ?? 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    const t = (y - r.origin.y) / r.direction.y;
    p.copy(r.origin).addScaledVector(r.direction, t);
    if (h != null) break;
    const tx = Math.floor(p.x), tz = Math.floor(p.z);
    y = g.inb(tx, tz) && g.isWater(tx, tz) ? WATER_Y : Math.max(WATER_Y, g.groundAt(p.x, p.z));
  }
  return p;
}
// a point on that ray `d` units past the near plane (ortho: same spot on screen, in front of everything)
function front(T, sx, sy, d = 6) {
  const r = ray(T, sx, sy);
  return r.origin.clone().addScaledVector(r.direction, d);
}

// ------------------------------------------------------------------ actors
function add(o, name) {
  S.actors.push({ obj: o });
  if (name) S.named[name] = o;
  return o;
}
function facing(T, off = 0) { return Math.atan2(-T.fwd.x, -T.fwd.z) + off; } // +Z towards the camera

function placeFox(T, pos, { scale = 0.85, rot = 0, anim = 'idle', t = 1, shadow = true, expr = null, outfit = null } = {}) {
  const fox = new FoxRig({ shadows: shadow });
  fox.root.scale.setScalar(scale);
  fox.root.position.copy(pos);
  fox.root.rotation.y = facing(T, rot);
  if (outfit) fox.setOutfit(outfit);
  T.group.add(fox.root);
  if (anim) fox.play(anim, { fade: 0 });
  if (expr) fox.setExpression(expr, { hold: 99 });
  for (let k = 0; k < t; k += 1 / 30) fox.update(1 / 30);
  return fox;
}

function placeNpc(T, cls, pos, { rot = 0, anim = 'happy', t = 0.6, scale = 1, expr = null } = {}) {
  const rig = new C3[cls]({ shadows: true });
  rig.root.position.copy(pos);
  rig.root.rotation.y = facing(T, rot);
  rig.root.scale.multiplyScalar(scale);
  T.group.add(rig.root);
  rig.play(anim, { fade: 0 });
  if (expr && rig.setExpression) rig.setExpression(expr, { hold: 99 });
  for (let k = 0; k < t; k += 1 / 60) rig.update(1 / 60);
  return rig;
}

function placeBear(T, type, pos, { rot = 0, pose = 'idle', t01 = 0.5, speed = 0, time = 0.5, scale = 1, seed = 3.7, face = null } = {}) {
  const b = makeBear(type, seed);
  b.root.position.copy(pos);
  b.root.rotation.y = facing(T, rot);
  b.root.scale.multiplyScalar(scale);
  T.group.add(b.root);
  for (let k = 0; k < time; k += 1 / 30) b.pose(pose, 1 / 30, { t01, speed });
  if (face) b.setFace(face, { hold: 99 });
  b.pose(pose, 1 / 30, { t01, speed });
  return b;
}

function placeProp(T, type, pos, { rot = 0, scale = 1, tilt = null } = {}) {
  const g = propModel(type);
  g.position.copy(pos);
  g.rotation.set(tilt ? tilt[0] : 0, facing(T, rot), tilt ? tilt[1] : 0, 'YXZ');
  g.scale.setScalar(scale);
  T.group.add(g);
  return g;
}

// ------------------------------------------------------------------ scenes
const SCENES = {};

// Itch cover: Reynard huge in front, gasping with a paw over his mouth; a suited
// bear erupts from the pond behind him, fish flying.
SCENES.thumb = (T, o) => {
  const C = { yaw: facing(T, o.yawOff ?? 0), pitch: o.pitch ?? 17, wupp: o.wupp ?? 0.0135, focus: T._at(o.camR ?? 0.6, o.camF ?? -1.2), sun: o.sun || [-0.2, 0.62] };
  applyCamera(T, C);
  const B = o.bear || {};
  const bp = ground(T, B.sx ?? 0.66, B.sy ?? 0.66, WATER_Y);
  bp.y -= B.sink ?? 0.8;
  add(placeBear(T, B.type || 'office', bp, { rot: B.rot ?? -0.25, pose: B.pose || 'roar', t01: B.t01 ?? 0.62, scale: B.scale ?? 2.0, seed: B.seed ?? 3.7 }).root, 'bear');
  const F = o.fox || {};
  const fp = front(T, F.sx ?? 0.27, F.sy ?? 1.05, F.d ?? 5);
  const fox = placeFox(T, fp, { scale: F.scale ?? 3.3, rot: F.rot ?? 0.3, anim: null, shadow: false });
  shockedFox(fox, F.pose || {});
  for (let k = 0; k < 1.6; k += 1 / 30) fox.update(1 / 30);
  add(fox.root, 'fox');
  for (const f of o.fish || []) {
    const m = fishSprite(f.id, f.s ?? 1.5, f.rot ?? 0, f.dir ?? 1);
    m.position.copy(ground(T, f.sx, f.sy, WATER_Y)).add(new THREE.Vector3(0, f.y ?? 0, 0));
    T.group.add(m);
    add(m);
  }
  S.splashAt = [{ x: bp.x, z: bp.z, n: o.splash ?? 3 }];
  return C;
};

// Itch banner: the neighbours dance by the pond around a party, Reynard busting a
// move; suited bears charge in from the right, one smashing the picnic table.
SCENES.banner = (T, o) => {
  const C = { yaw: facing(T, o.yawOff ?? 0), pitch: o.pitch ?? 17, wupp: o.wupp ?? 0.016, focus: T._at(o.camR ?? 0, o.camF ?? 0), sun: o.sun || [-0.3, 0.6] };
  applyCamera(T, C);
  for (const a of o.cast || []) {
    let obj;
    const p = a.front != null ? front(T, a.sx, a.sy, a.front) : a.h != null ? ground(T, a.sx, a.sy, a.h) : ground(T, a.sx, a.sy);
    if (a.lift) p.y += a.lift;
    if (a.kind === 'fox') obj = placeFox(T, p, a).root;
    else if (a.kind === 'bear') obj = placeBear(T, a.type, p, a).root;
    else if (a.kind === 'prop') obj = placeProp(T, a.type, p, a);
    else if (a.kind === 'fish') { obj = fishSprite(a.id, a.s ?? 1.3, a.rot ?? 0, a.dir ?? 1); obj.position.copy(p); T.group.add(obj); }
    else obj = placeNpc(T, a.cls, p, a).root;
    add(obj, a.name);
  }
  S.splashAt = (o.splashes || []).map((s) => { const p = ground(T, s.sx, s.sy, WATER_Y); return { x: p.x, z: p.z, n: s.n ?? 2 }; });
  return C;
};

// ------------------------------------------------------------------ driver
export async function setup(kind, o = {}) {
  const T = window.__title;
  if (!T) throw new Error('no title scene');
  S.cfg = o;
  for (const a of S.actors) a.obj.removeFromParent();
  S.actors = []; S.named = {}; S.t = 0;
  for (const el of document.querySelectorAll('body > *:not(canvas)')) el.style.visibility = 'hidden';
  hideTitleCast(T);
  T.gag = null; T.gagT = 1e9; T.beatT = 1e9; T.flyT = 1e9;
  const game = T.game;
  game.state.hour = o.hour ?? 18.25;
  const cam = SCENES[kind](T, o);
  T._updateCamera = () => applyCamera(T, cam);
  T.update = (dt) => {
    dt = Math.min(dt || 0, 0.05);
    S.t += dt;
    game.state.hour = o.hour ?? 18.25;
    game.state.phase = 'day';
    game.fox.rig.root.visible = false;
    T.skyUniforms.uTime.value = o.skyT ?? 3;
    if (o.glints !== false) T._ambientFx(dt);
    T._updateWords(dt);
    game.world.sim.update(dt * 0.5, game.wind);
    applyCamera(T, cam);
  };
  applyCamera(T, cam);
  return true;
}

// splash bursts at the configured spots (call right before the screenshot)
export function splash(k = 1) {
  const P = window.__title.game.particles;
  for (const s of S.splashAt || []) for (let i = 0; i < (s.n ?? 2) * k; i++) P.splash(s.x + (Math.random() - 0.5) * 0.7, s.z + (Math.random() - 0.5) * 0.7, 22, 1.5);
}

export function fx(name, ...args) { return window.__title.game.particles[name](...args); }

// screen point -> world (for particles from capture scripts)
export function worldAt(sx, sy, h = null) { return ground(window.__title, sx, sy, h); }

// Silhouette of the named actors as a white-on-transparent PNG at the renderer's
// low-res size (same camera, everything else hidden).
export function mask(names) {
  const T = window.__title, game = T.game, R = game.renderer, r = R.renderer, cam = game.rig.camera;
  const keep = names.map((n) => S.named[n]).filter(Boolean);
  const scene = game.scene;
  const vis = [];
  scene.traverse((o) => { if (o !== scene) vis.push([o, o.visible]); });
  scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) o.visible = false; });
  for (const k of keep) { k.traverse((o) => { o.visible = true; }); let p = k.parent; while (p) { p.visible = true; p = p.parent; } }
  const bg = scene.background, ov = scene.overrideMaterial, fog = scene.fog;
  scene.background = new THREE.Color(0, 0, 0);
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  scene.fog = null;
  const W = R.rtW, H = R.rtH;
  const rt = new THREE.WebGLRenderTarget(W, H);
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 1);
  r.clear();
  r.render(scene, cam);
  const px = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  r.setRenderTarget(null);
  rt.dispose();
  scene.background = bg; scene.overrideMaterial = ov; scene.fog = fog;
  for (const [o, v] of vis) o.visible = v;
  // crop the 1px snap margin, flip Y
  const w = R.lowW, h = R.lowH;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const id = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((H - 2 - y) * W + (x + 1)) * 4, di = (y * w + x) * 4;
    id.data[di] = id.data[di + 1] = id.data[di + 2] = 255;
    id.data[di + 3] = px[si] > 127 ? 255 : 0;
  }
  ctx.putImageData(id, 0, 0);
  return cv.toDataURL('image/png');
}
