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
import { voxelMaterial, VoxelModel as VM } from '../../src/core/voxel.js';
import { fishCanvasFor, FISH_TPU } from '../../src/game/fishSprites.js';
import { WATER_Y } from '../../src/world/grid.js';
import { makeBigCrate } from '../../src/entities/deliveryVan.js';
import { makePackage } from '../../src/entities/critterProps.js';

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
      // looping GIF: two little gasps per loop (hop, stretch, head back) on top of the trembling
      if (rig.__promoPhase != null) {
        const g = Math.max(0, Math.sin(rig.__promoPhase * Math.PI * 4)) ** 2;
        p.y += g * 1.4; p.sq *= 1 + g * 0.07; p.hRx -= g * 0.1; p.tPuff = (p.tPuff || 1) + g * 0.3;
      }
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

export function fishSprite(id, scale = 1.3, rot = 0, dir = 1) {
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
  S.camYaw = yaw;
  rig.yaw = rig.yawGoal = yaw;
  rig.pitch = rig.pitchGoal = pitch;
  rig.minWupp = Math.min(rig.minWupp, wupp);
  rig.wupp = rig.wuppGoal = wupp;
  const hh0 = (rr.rtH * wupp) / 2;
  rig.dist = Math.max(24, (hh0 * Math.cos(pitch) + 0.8) / Math.sin(pitch));
  rig.goal.set(focus.x, (focus.y || 0) + 0.35, focus.z);
  rig.target.copy(rig.goal);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const SKY_D = cam.skyD ?? 3.4;
  if (T.skyMesh) {
    T.skyMesh.position.set(focus.x - sy * SKY_D, focus.y || 0, focus.z - cy * SKY_D);
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

// Clear world decos / clutter (trees, reeds, flowers) whose base lands inside screen rects
// [sx0, sy0, sx1, sy1], so the cast is not hidden behind plants. Undone on the next setup.
function clearRects(T, rects) {
  const w = T.game.world, g = T.game.grid, cam = T.game.rig.camera;
  for (const d of S.cleared || []) d.removed = false;
  S.cleared = [];
  if (rects?.length) {
    const v = new THREE.Vector3();
    const test = (x, z) => {
      v.set(x, g.groundAt(x, z), z).project(cam);
      const sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
      return rects.some((r) => sx >= r[0] && sx <= r[2] && sy >= r[1] && sy <= r[3]);
    };
    for (const d of w.decos) if (!d.removed && test(d.x + 0.5, d.z + 0.5)) { d.removed = true; S.cleared.push(d); }
    for (const c of w.clutter || []) if (!c.removed && test(c.x, c.z)) { c.removed = true; S.cleared.push(c); }
  }
  try { w.buildDecos(); w.buildClutter(); } catch (e) { console.warn('promo decos', e); }
}

// ------------------------------------------------------------------ actors
function add(o, name) {
  S.actors.push({ obj: o });
  if (name) S.named[name] = o;
  return o;
}
function facing(T, off = 0) { return (S.camYaw ?? Math.atan2(-T.fwd.x, -T.fwd.z)) + off; } // +Z towards the camera

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
  clearRects(T, o.clear);
  const B = o.bear || {};
  const bp = ground(T, B.sx ?? 0.66, B.sy ?? 0.66, WATER_Y);
  bp.y -= B.sink ?? 0.8;
  const bear = placeBear(T, B.type || 'office', bp, { rot: B.rot ?? -0.25, pose: B.pose || 'roar', t01: B.t01 ?? 0.62, scale: B.scale ?? 2.0, seed: B.seed ?? 3.7 });
  add(bear.root, 'bear');
  if (o.loop && B.loop) S.drivers.push(loopBear(bear, { pose: B.pose || 'roar', ...B.loop }));
  const F = o.fox || {};
  const fp = front(T, F.sx ?? 0.27, F.sy ?? 1.05, F.d ?? 5);
  const fox = placeFox(T, fp, { scale: F.scale ?? 3.3, rot: F.rot ?? 0.3, anim: null, shadow: false });
  shockedFox(fox, F.pose || {});
  for (let k = 0; k < 1.6; k += 1 / 30) fox.update(1 / 30);
  add(fox.root, 'fox');
  if (o.loop) S.drivers.push((dt, ph) => { fox.__promoPhase = ph; fox.update(dt); });
  for (const f of o.fish || []) {
    const m = fishSprite(f.id, f.s ?? 1.5, f.rot ?? 0, f.dir ?? 1);
    m.position.copy(ground(T, f.sx, f.sy, WATER_Y)).add(new THREE.Vector3(0, f.y ?? 0, 0));
    T.group.add(m);
    add(m);
    if (o.loop && f.arc) S.drivers.push(loopFish(T, m, f));
  }
  S.splashAt = [{ x: bp.x, z: bp.z, n: o.splash ?? 3 }];
  if (o.loop) for (const L of o.loopFx || []) S.drivers.push(loopFx(T, L));
  return C;
};

// Itch banner: the neighbours dance by the pond around a party, Reynard busting a
// move; suited bears charge in from the right, one smashing the picnic table.
SCENES.banner = (T, o) => {
  const C = { yaw: o.yaw ?? facing(T, o.yawOff ?? 0), pitch: o.pitch ?? 17, wupp: o.wupp ?? 0.016, focus: o.focusWorld ? new THREE.Vector3(o.focusWorld[0], T.game.grid.groundAt(o.focusWorld[0], o.focusWorld[1]), o.focusWorld[1]) : T._at(o.camR ?? 0, o.camF ?? 0), sun: o.sun || [-0.3, 0.6], skyD: o.skyD };
  applyCamera(T, C);
  clearRects(T, o.clear);
  for (const a of o.cast || []) {
    let obj;
    const p = a.front != null ? front(T, a.sx, a.sy, a.front) : a.h != null ? ground(T, a.sx, a.sy, a.h) : ground(T, a.sx, a.sy);
    if (a.lift) p.y += a.lift;
    let rig = null;
    if (a.kind === 'fox') { rig = placeFox(T, p, a); obj = rig.root; }
    else if (a.kind === 'bear') { rig = placeBear(T, a.type, p, a); obj = rig.root; }
    else if (a.kind === 'prop') obj = placeProp(T, a.type, p, a);
    else if (a.kind === 'fish') { obj = fishSprite(a.id, a.s ?? 1.3, a.rot ?? 0, a.dir ?? 1); obj.position.copy(p); T.group.add(obj); }
    else { rig = placeNpc(T, a.cls, p, a); obj = rig.root; }
    add(obj, a.name);
    if (o.loop && a.loop) {
      if (a.kind === 'fox') S.drivers.push(loopFox(rig, { anim: a.anim, ...a.loop }));
      else if (a.kind === 'bear') S.drivers.push(loopBear(rig, { pose: a.pose, ...a.loop }));
      else if (a.kind === 'fish') S.drivers.push(loopFish(T, obj, a));
      else if (rig) S.drivers.push(loopNpc(rig, { anim: a.anim, ...a.loop }));
    }
  }
  if (o.loop) for (const L of o.loopFx || []) S.drivers.push(loopFx(T, L));
  S.splashAt = (o.splashes || []).map((s) => { const p = ground(T, s.sx, s.sy, WATER_Y); return { x: p.x, z: p.z, n: s.n ?? 2, power: s.power }; });
  return C;
};

// ------------------------------------------------------------------ Fiverr gig art (tools/promo/fiverr.*)
// Extra voxel props built with the game's VoxelModel: a dragon, a sword, game
// controllers, a grass block and an open delivery box.

const vmat = () => voxelMaterial();
function vmesh(v, scale, pivot = [0, 0, 0], glow = false) {
  const m = new THREE.Mesh(v.build({ pivot, scale, ao: !glow }), glow ? new THREE.MeshBasicMaterial({ vertexColors: true }) : vmat());
  m.castShadow = !glow;
  return m;
}
const hsh = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const DRAGON_PAL = {
  red: { R: 0xc8322a, RD: 0x8a1a22, RL: 0xe8503a, MEM: 0x7a1a3a, MEMD: 0x4a0a22 },
  green: { R: 0x3a9a4a, RD: 0x1f6a34, RL: 0x6ac85a, MEM: 0x2a6a5a, MEMD: 0x16423a },
  blue: { R: 0x3a6ad8, RD: 0x2442a0, RL: 0x6a9af0, MEM: 0x4a3a9a, MEMD: 0x2a1a6a },
};
export function makeDragon({ color = 'red', breath = 1 } = {}) {
  const v = new VM();
  const { R, RD, RL, MEM, MEMD } = DRAGON_PAL[color] || DRAGON_PAL.red;
  const BELLY = 0xf2c25a, BELLYD = 0xd89a3a, HORN = 0xf4e6c8, EYE = 0xfff27a;
  const scale = (x, y, z) => { const h = hsh(x, y, z); return h < 0.18 ? RD : h > 0.88 ? RL : R; };
  // body + belly plates
  v.ellipsoid(0, 11, 0, 6.5, 6, 9.5, (x, y, z) => (z > 0 && y < 10 && Math.abs(x) < 4 ? ((y + 40) % 2 ? BELLY : BELLYD) : scale(x, y, z)));
  // neck rising to the head
  for (let i = 0; i <= 8; i++) { const t = i / 8; v.ellipsoid(0, 13 + t * 12, 6 + t * 7, 3.6 - t * 0.8, 3.6 - t * 0.6, 3.4, (x, y, z) => (z > 6 + t * 7 + 1 ? BELLY : scale(x, y, z))); }
  // head, snout, open jaw, teeth, eyes, nostrils, horns, spikes
  v.ellipsoid(0, 27, 15, 4.6, 4.2, 4.6, scale);
  v.box(-3, 25, 17, 3, 28, 24, scale);
  v.box(-3, 21, 16, 3, 22, 23, scale);
  for (let x = -3; x <= 3; x += 2) { v.set(x, 24, 23, 0xffffff); v.set(x, 23, 22, 0xffffff); }
  v.box(-2, 23, 18, 2, 24, 23, 0x5a0a14); // mouth inside
  for (const sx of [-1, 1]) {
    v.box(sx * 3, 28, 18, sx * 4, 29, 19, EYE); v.set(sx * 4, 29, 19, 0x1a0a0a);
    v.set(sx * 2, 28, 24, 0x3a0a0a);
    for (let k = 0; k < 7; k++) v.set(sx * (2 + Math.round(k * 0.35)), 30 + k, 13 - k, k > 4 ? 0xffffff : HORN);
  }
  for (let i = 0; i < 9; i++) v.box(0, 17 + i * 0.6 + (i % 2), 4 - i * 1.6, 0, 18 + i * 0.6 + (i % 2), 4 - i * 1.6, HORN);
  // legs with claws
  for (const [lx, lz] of [[-4, 5], [4, 5], [-4, -5], [4, -5]]) { v.box(lx - 1, 2, lz - 1, lx + 1, 7, lz + 1, scale); v.box(lx - 1, 0, lz, lx + 1, 1, lz + 2, RD); v.set(lx, 0, lz + 3, HORN); }
  // tail curling back, spade tip
  for (let i = 0; i <= 14; i++) { const t = i / 14; v.ellipsoid(Math.sin(t * 2.4) * 5, 9 - t * 5, -8 - t * 15, 3.2 - t * 2.4, 3 - t * 2.2, 2.4, scale); }
  v.box(Math.round(Math.sin(2.4) * 5) - 2, 3, -25, Math.round(Math.sin(2.4) * 5) + 2, 5, -23, RD);
  // bat wings: arm bone shoulder -> wrist -> tip, two fingers fanning down, scalloped membrane
  const inPoly = (pts, x, y) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
  const SH = [3, 19], WR = [13, 35], TIP = [25, 41], F2 = [25, 25], F3 = [17, 15];
  const wingPoly = [SH, WR, TIP, [23, 33], F2, [20, 19], F3, [9, 15], [3, 13]];
  const bones = [[SH, WR], [WR, TIP], [WR, F2], [WR, F3]];
  const onBone = (x, y) => bones.some(([p, q]) => { const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / L2)); return Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy) < 0.9; });
  // one flat wing (2 voxels thick), mirrored and swept back as separate meshes so the sheet has no steps
  const wv = new VM();
  for (let x = 0; x <= 24; x++) for (let y = 12; y <= 43; y++) {
    const bone = onBone(x + 2, y);
    if (!bone && !inPoly(wingPoly, x + 2.5, y + 0.5)) continue;
    const c = bone ? RD : hsh(x, y, 5) < 0.12 ? MEMD : MEM;
    wv.set(x, y, 0, c); wv.set(x, y, -1, c);
  }
  wv.set(23, 42, 0, HORN); wv.set(23, 43, 0, HORN); // wing claw
  const g = new THREE.Group();
  g.add(vmesh(v, 0.1));
  for (const sx of [-1, 1]) {
    const w = vmesh(wv, 0.1);
    w.position.set(sx * 0.3, 0, -0.2);
    w.scale.x = sx;
    w.rotation.y = sx * 0.45; // swept back
    w.rotation.z = sx * 0.12;
    g.add(w);
  }
  // fire breath: a cone of glowing cubes out of the mouth (+z)
  const fire = new VM();
  for (let i = 0; i < 420 * breath; i++) {
    const u = hsh(i, 1, 7), r = hsh(i, 2, 9) * (1 + u * 7), a = hsh(i, 3, 5) * Math.PI * 2;
    const z = 24 + u * 24 * breath, x = Math.round(Math.cos(a) * r), y = Math.round(23 + Math.sin(a) * r * 0.8 + u * 9);
    fire.set(x, y, Math.round(z), u < 0.25 ? 0xfff6c0 : u < 0.5 ? 0xffd23a : u < 0.75 ? 0xff8a1a : 0xe83a1a);
  }
  if (breath > 0) { const fm = vmesh(fire, 0.1, [0, 0, 0], true); g.add(fm); g.userData.fire = fm; }
  return g;
}

export function makeSword() {
  const v = new VM();
  // blade along -y from the hand (grip at the origin), like the game's held props
  for (let y = -44; y <= -9; y++) for (let x = -2; x <= 2; x++) {
    const tip = y < -40 ? Math.abs(x) <= (y + 44) * 0.5 : true;
    if (tip) v.set(x, y, 0, x === 0 ? 0xffffff : Math.abs(x) === 2 ? 0x8aa0c0 : 0xd8e4f4);
  }
  for (let x = -7; x <= 7; x++) for (let z = -1; z <= 1; z++) v.set(x, -8, z, Math.abs(x) > 5 ? 0xffd23a : 0xc89020);
  for (let y = -7; y <= 2; y++) v.set(0, y, 0, y % 2 ? 0x6a3a8a : 0x4a2a6a);
  v.ellipsoid(0, 4, 0, 1.6, 1.6, 1.6, 0xff3a5a);
  return vmesh(v, 0.025);
}

export function makeGamepad(body = 0x6a4ac8, bodyD = 0x4a2a98) {
  const v = new VM();
  // rounded bar with two grips hanging down (24 x 14 voxels)
  const inside = (x, y) => {
    const ax = Math.abs(x);
    if (y >= 4 && y <= 12 && ax <= 9) return !(ax >= 8 && (y === 12 || y === 4) && ax === 9);
    return Math.hypot(ax - 8, y - 4) <= 4.6;
  };
  for (let x = -13; x <= 13; x++) for (let y = -2; y <= 12; y++) for (let z = 0; z <= 3; z++) if (inside(x, y)) v.set(x, y, z, z === 3 ? body : bodyD);
  for (const [x, y] of [[-7, 8], [-8, 8], [-6, 8], [-7, 9], [-7, 7], [-9, 8], [-5, 8], [-7, 10], [-7, 6]]) v.set(x, y, 4, 0xf4f4f8);
  for (const [x, y, c] of [[7, 10, 0xffd23a], [9, 8, 0xff3a4a], [7, 6, 0x3ad86a], [5, 8, 0x3aa0ff]]) { v.set(x, y, 4, c); v.set(x, y, 5, c); }
  v.set(-2, 9, 4, 0xd8d0f0); v.set(-1, 9, 4, 0xd8d0f0); v.set(1, 9, 4, 0xd8d0f0); v.set(2, 9, 4, 0xd8d0f0);
  for (const sx of [-1, 1]) { v.set(sx * 3, 5, 4, 0x2a2a3a); v.set(sx * 3, 6, 4, 0x2a2a3a); v.set(sx * 4, 5, 4, 0x2a2a3a); v.set(sx * 4, 6, 4, 0x2a2a3a); }
  return vmesh(v, 0.05, [0, 5, 1.5]);
}

export function makeGrassBlock() {
  const v = new VM(), N = 10;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
    const h = hsh(x, y, z), edge = x === 0 || z === 0 || x === N - 1 || z === N - 1;
    let c = h < 0.25 ? 0x6b4a30 : h < 0.55 ? 0x8a6340 : 0x7b5636;
    if (y === N - 1) c = h < 0.3 ? 0x7ccc52 : 0x5cab3c;
    else if (y >= N - 3 && edge && h < 0.75 - (N - 1 - y) * 0.3) c = 0x5cab3c;
    v.set(x, y, z, c);
  }
  return vmesh(v, 0.08, [N / 2, N / 2, N / 2]);
}

// an open cardboard delivery box with folded-back flaps and packing tape
export function makeOpenBox() {
  const v = new VM();
  const W = 13, D = 10, H = 12;
  const card = (x, y, z) => { const h = hsh(x, y, z); return h < 0.15 ? 0xb07e44 : h > 0.9 ? 0xd8aa6a : 0xc8955a; };
  for (let x = -W; x <= W; x++) for (let y = 0; y <= H; y++) for (let z = -D; z <= D; z++) {
    const wall = Math.abs(x) === W || Math.abs(z) === D || y === 0;
    if (!wall) continue;
    let c = card(x, y, z);
    if (z === D && Math.abs(x) <= 1) c = 0xe8d8a0; // tape
    if (y === H) c = 0xa06a34;
    v.set(x, y, z, z === D || x === W ? c : 0x8a5a2a);
  }
  // flaps folded outwards
  for (let i = 1; i <= 8; i++) for (let x = -W; x <= W; x++) { v.set(x, H + Math.round(i * 0.6), D + i, card(x, i, 1)); v.set(x, H + Math.round(i * 0.6), -D - i, card(x, i, 2)); }
  for (let i = 1; i <= 7; i++) for (let z = -D; z <= D; z++) { v.set(W + i, H + Math.round(i * 0.7), z, card(i, z, 3)); v.set(-W - i, H + Math.round(i * 0.7), z, card(i, z, 4)); }
  // a red FRAGILE-ish label + a "this way up" arrow
  for (let x = 4; x <= 10; x++) for (let y = 4; y <= 7; y++) v.set(x, y, D + 1, y === 4 || y === 7 ? 0xa01a1a : 0xe83a3a);
  for (const [x, y] of [[-8, 8], [-9, 7], [-7, 7], [-8, 7], [-8, 6], [-8, 5], [-8, 4]]) v.set(x, y, D + 1, 0x3a2414);
  return vmesh(v, 0.07);
}

function sceneCam(T, o, def) {
  const C = { yaw: facing(T, o.yawOff ?? 0), pitch: o.pitch ?? def.pitch, wupp: o.wupp ?? def.wupp, focus: T._at(o.camR ?? def.camR, o.camF ?? def.camF), sun: o.sun || def.sun, skyD: o.skyD };
  applyCamera(T, C);
  clearRects(T, o.clear);
  return C;
}
// put an object in front of everything at screen point (sx, sy), lifted / scaled / turned
function placeAt(T, obj, a) {
  const p = a.ground ? ground(T, a.sx, a.sy, a.h ?? null) : front(T, a.sx, a.sy, a.d ?? 5);
  p.y += a.y ?? 0;
  obj.position.copy(p);
  obj.rotation.set(a.rx ?? 0, facing(T, a.rot ?? 0), a.rz ?? 0, 'YXZ');
  obj.scale.setScalar(a.scale ?? 1);
  T.group.add(obj);
  return add(obj, a.name);
}
function heroFox(T, a) {
  const fox = new FoxRig({ shadows: false });
  if (a.outfit) fox.setOutfit(a.outfit);
  fox.play(a.anim || 'cheer', { fade: 0 });
  for (let k = 0; k < (a.t ?? 0.45); k += 1 / 60) fox.update(1 / 60);
  if (a.expr) { fox.setExpression(a.expr, { hold: 99 }); fox.update(1 / 60); }
  if (a.sword) { const sw = makeSword(); sw.scale.setScalar(a.swordScale ?? 1); sw.rotation.set(a.swordRot?.[0] ?? 0, a.swordRot?.[1] ?? 0, a.swordRot?.[2] ?? 0); fox.hold(sw); fox.update(1 / 60); }
  if (a.package) { const pk = makePackage('box'); pk.scale.setScalar(a.package); pk.rotation.set(0.3, 0, 0.2); fox.hold(pk); fox.update(1 / 60); }
  placeAt(T, fox.root, a);
  return fox;
}
function heroBear(T, a) {
  const b = makeBear(a.type || 'office', a.seed ?? 3.7);
  for (let k = 0; k < (a.time ?? 0.5); k += 1 / 30) b.pose(a.pose || 'idle', 1 / 30, { t01: a.t01 ?? 0.5, speed: a.speed ?? 0 });
  if (a.face) b.setFace(a.face, { hold: 99 });
  b.pose(a.pose || 'idle', 1 / 30, { t01: a.t01 ?? 0.5, speed: a.speed ?? 0 });
  placeAt(T, b.root, a);
  return b;
}
function heroDuck(T, a) {
  const d = new C3.Duck({ sex: a.sex || 'm', breed: a.breed || 'mallard' });
  d.play(a.anim || 'happy', { fade: 0 });
  for (let k = 0; k < (a.t ?? 0.5); k += 1 / 60) d.update(1 / 60);
  placeAt(T, d.root, a);
  return d;
}
function heroNpc(T, a) {
  const r = new C3[a.cls]({ shadows: true });
  r.play(a.anim || 'happy', { fade: 0 });
  for (let k = 0; k < (a.t ?? 0.6); k += 1 / 60) r.update(1 / 60);
  placeAt(T, r.root, a);
  return r;
}
// extra builders from other tools (tools/video/props3d.js)
export function registerProps(m) { Object.assign(PROP, m); }
const PROP = { dragon: (a) => makeDragon({ breath: a.breath ?? 1 }), dragon2: () => makeDragon({ color: 'green', breath: 0 }), dragon3: () => makeDragon({ color: 'blue', breath: 0 }), sword: makeSword, gamepad: () => makeGamepad(), gamepad2: () => makeGamepad(0xe8443a, 0xa82a2a), gamepad3: () => makeGamepad(0x3ab0e8, 0x2a78b0), block: makeGrassBlock, box: makeOpenBox, crate: () => makeBigCrate('live') };
function castList(T, list) {
  for (const a of list || []) {
    let rig = null;
    if (a.kind === 'fox') rig = heroFox(T, a);
    else if (a.kind === 'bear') rig = heroBear(T, a);
    else if (a.kind === 'duck') rig = heroDuck(T, a);
    else if (a.kind === 'npc') rig = heroNpc(T, a);
    if (rig && a.name) (S.rigs ||= {})[a.name] = rig;
    // o.live (video): keep the rigs moving every frame
    if (rig && a.live) S.drivers.push(rig.pose ? (dt) => rig.pose(a.pose || 'idle', dt, { speed: a.speed ?? 0 }) : (dt) => rig.update(dt));
    else if (a.kind === 'fish') { const m = fishSprite(a.id, a.s ?? 1.5, a.rz ?? 0, a.dir ?? 1); m.position.copy(front(T, a.sx, a.sy, a.d ?? 5)); T.group.add(m); add(m, a.name); }
    else if (PROP[a.kind]) placeAt(T, PROP[a.kind](a), a);
  }
}
for (const k of ['gig', 'tiers', 'extras', 'box']) {
  SCENES[k] = (T, o) => {
    const C = sceneCam(T, o, { pitch: 17, wupp: 0.0135, camR: 0.6, camF: -0.6, sun: [-0.2, 0.62] });
    castList(T, o.cast);
    S.splashAt = (o.splashes || []).map((s) => { const p = ground(T, s.sx, s.sy, WATER_Y); return { x: p.x, z: p.z, n: s.n ?? 2, power: s.power }; });
    return C;
  };
}

// ------------------------------------------------------------------ driver
export async function setup(kind, o = {}) {
  const T = window.__title;
  if (!T) throw new Error('no title scene');
  S.cfg = o;
  for (const a of S.actors) a.obj.removeFromParent();
  S.actors = []; S.named = {}; S.t = 0; S.drivers = [];
  S.loopOn = !!o.loop;
  for (const el of document.querySelectorAll('body > *:not(canvas)')) el.style.visibility = 'hidden';
  hideTitleCast(T);
  T.gag = null; T.gagT = 1e9; T.beatT = 1e9; T.flyT = 1e9;
  const game = T.game;
  game.state.hour = o.hour ?? 18.25;
  // pixel density -> pixel scale (the banner wants exactly 2 screen px per low-res px)
  if (o.px && game.renderer.pixelDensity !== o.px) { game.renderer.pixelDensity = o.px; game.resize(); }
  // daylight: undo the title screen's sunset grade + sky patch (o.hour sets the time of day)
  if (o.daylight && T._saved) {
    const sv = T._saved, R = game.renderer, U = R.postMat.uniforms;
    game.sky.update = sv.skyOwn || Object.getPrototypeOf(game.sky).update;
    R.bloomStrength = sv.bloomStrength; R.brightPass.mat.uniforms.threshold.value = sv.threshold;
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) U[k].value = sv.u[k];
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) U[k].value.copy(sv.u[k]);
    if (T.skyMesh) T.skyMesh.visible = false;
  }
  if (o.haze != null) game.renderer.postMat.uniforms.haze.value = o.haze;
  if (o.bloom != null) game.renderer.bloomStrength = o.bloom;
  const cam = SCENES[kind](T, o);
  // optional soft fill light from the camera so faces read against the low sun
  if (S.fill) { S.fill.removeFromParent(); S.fill.target.removeFromParent(); S.fill = null; }
  if (o.fill) {
    const L = (S.fill = new THREE.DirectionalLight(o.fillColor ?? 0xffe0d0, o.fill));
    const c = game.rig.camera.position, t = game.rig.target;
    L.position.copy(c); L.target.position.copy(t);
    game.scene.add(L, L.target);
  }
  S.cam = cam;
  T._updateCamera = () => applyCamera(T, cam);
  T.update = (dt) => {
    dt = Math.min(dt || 0, 0.05);
    S.t += dt;
    game.state.hour = o.hour ?? 18.25;
    game.state.phase = 'day';
    game.fox.rig.root.visible = false;
    T.skyUniforms.uTime.value = o.skyT ?? 3;
    if (!S.loopOn) {
      for (const d of S.drivers) d(dt, 0);
      if (o.glints !== false) T._ambientFx(dt);
      T._updateWords(dt);
      game.world.sim.update(dt * 0.5, game.wind);
    }
    applyCamera(T, cam);
  };
  applyCamera(T, cam);
  if (o.loop) loopMode(game);
  return true;
}

// ------------------------------------------------------------------ looping (animated GIF) mode
// o.loop = { frames: N, period: P (s) }. Every animated thing gets a driver (dt, phase) that is
// periodic in P; frame(i) steps all drivers by P / N. prepLoop() runs one full period first so
// springs / follow-through settle and the sequence wraps seamlessly.
// Random game systems (particles, ambient critters, the water sim) are frozen; the world clock
// swings back and forth (sin) so water and plants move but still loop.
function loopMode(game) {
  if (!game.__promoRender) {
    const orig = game.render.bind(game);
    game.__promoRender = orig;
    game.render = (dt) => { if (S.loopOn && S.gameTime != null) game.time = S.gameTime; orig(dt); };
    game.__promoAmbient = game.ambient.update.bind(game.ambient);
    game.ambient.update = (dt) => { if (!S.loopOn) game.__promoAmbient(dt); };
    const P = game.particles, pu = P.update.bind(P);
    P.update = (dt) => { if (!S.loopOn) pu(dt); };
  }
  const P = game.particles;
  for (const m of [P.fx.batch.mesh, P.decals.batch.mesh, P.lit.mesh, P.glow.mesh]) m.visible = false;
  S.gameTime = S.cfg.loop.timeBase ?? 100;
}

export function prepLoop() { const N = S.cfg.loop.frames; for (let i = 0; i < N; i++) frame(i); }

export function frame(i) {
  const L = S.cfg.loop, N = L.frames, dt = L.period / N, ph = (i % N) / N;
  S.phase = ph;
  for (const d of S.drivers) d(dt, ph);
  S.gameTime = (L.timeBase ?? 100) + (L.timeAmp ?? 0.5) * Math.sin(2 * Math.PI * ph);
  return ph;
}

// a looping critter anim, `cycles` full plays per GIF loop, starting `off` (0..1) into it
function loopNpc(rig, L) {
  const P = S.cfg.loop.period;
  rig.play(L.anim, { fade: 0, loop: true, restart: true });
  const cur = rig._cur, dur = cur.def.dur || L.dur || 2;
  cur.speed = (dur * (L.cycles || 1)) / P;
  cur.t = (L.off || 0) * dur;
  return (dt) => rig.update(dt);
}
// Reynard: FoxRig loops keep counting past `dur`, so wrap the clock ourselves
function loopFox(fox, L) {
  const P = S.cfg.loop.period;
  fox.play(L.anim, { fade: 0, loop: true, restart: true });
  const cur = fox._cur, dur = cur.def.dur || L.dur || 2.16;
  cur.speed = (dur * (L.cycles || 1)) / P;
  cur.t = (L.off || 0) * dur;
  return (dt) => { while (cur.t >= dur) cur.t -= dur; fox.update(dt); };
}
// bears: one-shot poses sweep t01 over `range` once per loop; gaits set the stride phase directly
function loopBear(b, L) {
  return (dt, ph) => {
    const u = (ph + (L.off || 0)) % 1;
    if (L.strides) { b.phase = u * L.strides * Math.PI * 2; b.pose(L.pose, dt, { speed: L.speed ?? 3 }); return; }
    const r = L.range || [0, 1];
    const w = L.pingpong ? 0.5 - 0.5 * Math.cos(u * Math.PI * 2) : u;
    b.pose(L.pose, dt, { t01: r[0] + (r[1] - r[0]) * w });
  };
}
// a fish leaping out of the pond along an arc (sx, sy) -> (sx2, sy2), height h, `rate` leaps per loop
function loopFish(T, m, f) {
  const a = ground(T, f.sx, f.sy, WATER_Y), b = ground(T, f.arc[0], f.arc[1], WATER_Y);
  const h = f.arc[2] ?? 1.2, dir = f.dir ?? 1, rate = f.rate ?? 1;
  const w = Math.abs(m.scale.x), hh = m.scale.y;
  return (dt, ph) => {
    const u = (ph * rate + (f.off || 0)) % 1;
    m.position.lerpVectors(a, b, u);
    m.position.y = WATER_Y - 0.15 + Math.sin(u * Math.PI) * h;
    m.material.rotation = Math.cos(u * Math.PI) * 0.9 * dir;
    m.scale.set(w * dir, hh, 1);
  };
}
// loopable particle effects built from small voxel cubes (deterministic, seeded)
function seeded(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const CONFETTI = [0xff5c5c, 0xffd23a, 0x5cccff, 0x7aff8a, 0xff8ae0, 0xffffff];
function loopFx(T, L) {
  const g = new THREE.Group();
  T.group.add(g);
  add(g);
  const r = seeded(L.seed || 7);
  const c = L.wx != null ? new THREE.Vector3(L.wx, T.game.grid.groundAt(L.wx, L.wz), L.wz) : L.h != null ? ground(T, L.sx, L.sy, L.h) : ground(T, L.sx, L.sy);
  const parts = [];
  const n = L.n || 30;
  for (let i = 0; i < n; i++) {
    let mat, geo;
    if (L.type === 'confetti') {
      mat = new THREE.MeshBasicMaterial({ color: CONFETTI[i % CONFETTI.length], side: THREE.DoubleSide });
      geo = new THREE.PlaneGeometry(L.size || 0.09, (L.size || 0.09) * 0.6);
    } else if (L.type === 'smoke') {
      mat = new THREE.MeshLambertMaterial({ color: L.color ?? [0x9a94a0, 0x8a8490, 0xb0aab4][i % 3], transparent: true, opacity: 0.85, depthWrite: false });
      geo = new THREE.BoxGeometry(1, 1, 1);
    } else if (L.type === 'sparks') {
      mat = new THREE.MeshBasicMaterial({ color: [0xfff4a0, 0xffd040, 0xff9a20, 0xffffff][i % 4] });
      const s = (L.size || 0.05) * (0.6 + r() * 0.8);
      geo = new THREE.BoxGeometry(s, s, s);
    } else {
      mat = new THREE.MeshBasicMaterial({ color: L.color ?? [0xffffff, 0xbfeaff, 0x8fd8f8, 0xe8fbff][i % 4] });
      const s = (L.size || 0.08) * (0.6 + r() * 0.8);
      geo = new THREE.BoxGeometry(s, s, s);
    }
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    parts.push({ m, a: r() * Math.PI * 2, sp: 0.4 + r() * 0.6, up: 0.6 + r() * 0.6, off: r(), spin: (r() - 0.5) * 20, dx: (r() - 0.5) * 2, dz: (r() - 0.5) * 2 });
  }
  const rate = L.rate || 2;
  return (dt, ph) => {
    for (const p of parts) {
      const u = (ph * rate + p.off) % 1;
      if (L.type === 'confetti') {
        const W = L.spread || 3, H = L.fall || 2.5;
        p.m.position.set(c.x + p.dx * W + Math.sin((u * 2 + p.off) * Math.PI * 2) * 0.15, c.y + (L.top || 2.6) - u * H, c.z + p.dz * W * 0.4);
        p.m.rotation.set(u * p.spin, u * p.spin * 0.7, p.off * 6);
      } else if (L.type === 'smoke') { // puffs rising, swelling, thinning out
        const sz = (L.size || 0.35) * (0.4 + u * 1.4) * (0.7 + p.sp * 0.5);
        p.m.position.set(c.x + (L.drift || 0.4) * u + p.dx * 0.12, c.y + (L.y || 0) + u * (L.rise || 1.6), c.z + p.dz * 0.12 - (L.driftZ || 0) * u);
        p.m.scale.setScalar(sz);
        p.m.rotation.set(p.off * 3 + u, p.off * 5 + u * 0.7, 0);
        p.m.material.opacity = 0.85 * (1 - u) ** 1.2;
      } else if (L.type === 'sparks') { // a burst of embers from the strike point
        const R = (L.radius || 0.5) * p.sp, Hh = (L.height || 0.6) * p.up;
        p.m.position.set(c.x + Math.cos(p.a) * R * u, c.y + (L.y || 0) + 4 * u * (0.7 - u) * Hh, c.z + Math.sin(p.a) * R * u);
        p.m.scale.setScalar(Math.max(0.05, 1 - u));
      } else { // splash: droplets thrown up and out, falling back
        const R = (L.radius || 0.9) * p.sp, Hh = (L.height || 1.4) * p.up, r0 = (L.r0 || 0) * (0.85 + p.sp * 0.3);
        p.m.position.set(c.x + Math.cos(p.a) * (r0 + R * u), c.y + 4 * u * (1 - u) * Hh, c.z + Math.sin(p.a) * (r0 + R * u));
        p.m.scale.setScalar(Math.max(0.05, 1 - u * 0.7));
      }
    }
  };
}

// splash bursts at the configured spots (call right before the screenshot)
export function splash(k = 1) {
  const T = window.__title, P = T.game.particles;
  for (const s of S.splashAt || []) for (let i = 0; i < (s.n ?? 2) * k; i++) P.splash(s.x + (Math.random() - 0.5) * 0.7, s.z + (Math.random() - 0.5) * 0.7, 22, s.power ?? 1.5);
  // extra particle bursts: { name: 'confetti' | 'notes' | 'debris' | 'stars' | ..., sx, sy, h?, y?, args: [] }
  for (const f of S.cfg?.fx || []) {
    const p = f.h != null ? ground(T, f.sx, f.sy, f.h) : ground(T, f.sx, f.sy);
    P[f.name](p.x, p.y + (f.y ?? 0), p.z, ...(f.args || []));
  }
}

export function fx(name, ...args) { return window.__title.game.particles[name](...args); }

// screen point -> world (for particles from capture scripts)
export function worldAt(sx, sy, h = null) { return ground(window.__title, sx, sy, h); }

// Silhouette of the named actors as a white-on-transparent PNG at the renderer's
// low-res size (same camera). Everything else is drawn black so it still occludes
// (the water surface by a stand-in plane); custom-shader meshes and sprites are skipped.
export function mask(names) {
  const T = window.__title, game = T.game, R = game.renderer, r = R.renderer, cam = game.rig.camera;
  const keep = new Set();
  for (const n of names) S.named[n]?.traverse((o) => keep.add(o));
  const scene = game.scene;
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const saved = [];
  scene.traverse((o) => {
    if (o === scene) return;
    saved.push([o, o.visible, o.material]);
    if (o.isSprite || o.isPoints || o.isLine) { o.visible = false; return; }
    if (!o.isMesh) return;
    if (keep.has(o)) { o.material = white; return; }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.isShaderMaterial || m.isRawShaderMaterial || o.isInstancedMesh || o.geometry?.isInstancedBufferGeometry) { o.visible = false; return; }
    o.material = black;
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), black);
  water.position.set(cam.position.x, WATER_Y, cam.position.z);
  scene.add(water);
  const bg = scene.background, fog = scene.fog;
  scene.background = new THREE.Color(0, 0, 0);
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
  scene.remove(water);
  scene.background = bg; scene.fog = fog;
  for (const [o, v, m] of saved) { o.visible = v; if (m !== undefined) o.material = m; }
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
