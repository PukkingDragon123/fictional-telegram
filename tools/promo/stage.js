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
import { WATER_Y, KIND } from '../../src/world/grid.js';
// [F&S] mining + industry art
import * as MM from '../../src/entities/extra/miningModels.js';
import * as IM from '../../src/entities/extra/industryModels.js';
// [v7 family] power + storage for the Flint & Steel plate
import * as PM from '../../src/entities/extra/powerModels.js';
import * as SM from '../../src/entities/extra/storageModels.js';
// [v4 cinematic] the Bear St. office tower
import { officeModel } from '../../src/world/buildings.js';
// [v5 dig & dive] Bonebed Bluff (Prof. Snapp) and the underwater scene under Loon Lake
import { SnapperProf } from '../../src/entities/critterSnapper.js';
import { makeBluff, makeLabHut, makeFieldTent, makeTrench, makeSieveBench, makeDisplayCase, makeRibcage, makeFindMini, makeSiteMound } from '../../src/entities/digModels.js';
import { BONEBED } from '../../src/data/digSites.js';
import { buildDiveScene, uwMat } from '../../src/entities/diveScene.js';
import { diveGeo, gearModel, farmModel } from '../../src/entities/diveModels.js';
import { FishPack } from '../../src/game/dive/life.js';
import { ChiefBuff } from '../../src/entities/critterDuck2.js';
import { NoodlesOtter } from '../../src/entities/critterOtter2.js';
import { CameraRig } from '../../src/core/cameraRig.js';
import { VS as KVS, FV as KFV, pixTex } from '../../src/entities/critterKit.js';
import { FARMS } from '../../src/data/dive.js';

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
      if (!P.cheeks) {
        p.ik(p.aR, P.mx, P.my, P.mz, 1, -0.9, -0.2, w);
        p.aR.st = P.st ?? 1.6;
        p.aR.shZ = (P.shZ ?? 3) * w; p.aR.shY = (P.shY ?? 1.2) * w;
        p.aR.wx = (P.wx ?? -1.3) * w; p.aR.wz = (P.wz ?? 0) * w;
        p.pawR = P.rpaw || 'open';
      }
      if (P.expr) f.expr = P.expr;
      if (P.blush != null) f.blush = P.blush;
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
        const g = Math.max(0, Math.sin((rig.__promoPhase * (P.gasps ?? 2) + (P.gaspOff ?? 0)) * Math.PI * 2)) ** 2;
        p.y += g * (P.hop ?? 1.4); p.sq *= 1 + g * 0.07; p.hRx -= g * 0.1; p.tPuff = (p.tPuff || 1) + g * 0.3;
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
  S.camYaw = yaw;
  rig.yaw = rig.yawGoal = yaw;
  rig.pitch = rig.pitchGoal = pitch;
  rig.minWupp = Math.min(rig.minWupp, wupp);
  rig.wupp = rig.wuppGoal = wupp;
  const hh0 = (rr.rtH * wupp) / 2;
  rig.dist = Math.max(24, (hh0 * Math.cos(pitch) + 0.8) / Math.sin(pitch));
  rig.goal.set(focus.x, (focus.y || 0) + 0.35 + (cam.lookUp || 0), focus.z); // [v4] lookUp: tilt the frame up (more sky), the sky curtain stays put
  rig.target.copy(rig.goal);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const SKY_D = cam.skyD ?? 3.4;
  if (T.skyMesh) {
    T.skyMesh.position.set(focus.x - sy * SKY_D, focus.y || 0, focus.z - cy * SKY_D);
    T.skyMesh.rotation.set(0, yaw, 0);
    const hh = rr.rtH * wupp * 0.5, viewW = rr.rtW * wupp;
    const topH = (hh + (0.35 + (cam.lookUp || 0)) * Math.cos(pitch) - SKY_D * Math.sin(pitch)) / Math.cos(pitch);
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
function clearRects(T, rects, worldRects = null) {
  const w = T.game.world, g = T.game.grid, cam = T.game.rig.camera;
  for (const d of S.cleared || []) d.removed = false;
  S.cleared = [];
  // [v5] world rects [x0, z0, x1, z1] (tiles): everything standing in them goes, and forest tiles
  // turn to grass (the trees of the big forest grow from the tile kind), like BeaverSystem.clearInstant
  let landChanged = false;
  for (const [i, kind, meadow] of S.landEdits || []) { g.kind[i] = kind; g.meadow[i] = meadow; landChanged = true; }
  S.landEdits = [];
  for (const [x0, z0, x1, z1] of worldRects || []) {
    const inR = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    for (const d of w.decos) if (!d.removed && inR(d.x + 0.5, d.z + 0.5)) { d.removed = true; S.cleared.push(d); }
    for (const c of w.clutter || []) if (!c.removed && inR(c.x, c.z)) { c.removed = true; S.cleared.push(c); }
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
      if (!g.inb(x, z)) continue;
      const i = z * g.w + x;
      if (g.isWater(x, z)) continue;
      if (g.kind[i] === KIND.FOREST || !g.meadow[i]) { S.landEdits.push([i, g.kind[i], g.meadow[i]]); if (g.kind[i] === KIND.FOREST) g.kind[i] = KIND.GRASS; g.meadow[i] = 1; landChanged = true; }
    }
  }
  if (landChanged) { try { w.rebuildTerrain(); } catch (e) { console.warn('promo terrain', e); } }
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

// ------------------------------------------------------------------ [F&S] mining + industry cast kinds
// All take world coords (wx, wz) or screen (sx, sy) like the rest of the cast; `ry` = absolute yaw.
const yawOf = (T, a) => (a.ry != null ? a.ry : facing(T, a.rot || 0));
function machineDriver(obj) { return (dt) => { S.clock = (S.clock || 0) + dt; obj.userData.update?.(dt, S.clock); }; }
const FS_KINDS = {
  // any model factory: make = 'mine.makeMineEntrance' | 'ind.ind_smelter' | ...
  model(T, p, a, o) {
    const [lib, fn] = a.make.split('.');
    const L = lib === 'mine' ? MM : IM;
    const obj = lib === 'ind' ? IM.STRUCTURE_MODELS[fn]({ seed: 1 }) : lib === 'pow' ? PM.STRUCTURE_MODELS[fn]({ seed: 1 }) : lib === 'sto' ? SM.STRUCTURE_MODELS[fn]({ seed: 1 }) : L[fn](...(a.args || []));
    // [v7] power gear: battery charge, turbine spin (whole turns a loop, so it wraps seamlessly)
    if (a.charge != null) obj.userData.setCharge?.(a.charge, a.chargeDir ?? 1);
    if (a.contents) obj.userData.setContents?.(a.contents, a.cap ?? 100);
    if (o.loop && a.spins) S.drivers.push((dt, ph) => { const st = obj.userData.st; if (st) st.spin = ph * Math.PI * 2 * a.spins; });
    obj.position.copy(p); obj.rotation.y = yawOf(T, a); if (a.scale) obj.scale.setScalar(a.scale);
    obj.traverse((m) => { if (m.isMesh && !m.userData.glow) m.castShadow = true; });
    if (a.st) Object.assign(obj.userData.st || {}, a.st);
    if (a.load) obj.userData.setLoad?.(a.load);
    if (a.left != null) obj.userData.setLeft?.(a.left);
    if (a.fill != null) obj.userData.setFill?.(a.fill);
    if (a.meals != null) obj.userData.setMeals?.(a.meals);
    if (a.dig != null) obj.userData.dig?.(a.dig);
    T.group.add(obj);
    if (obj.userData.update) { const d = machineDriver(obj); for (let k = 0; k < 2; k += 1 / 30) d(1 / 30); if (o.loop) S.drivers.push(d); }
    if (o.loop && a.digLoop) S.drivers.push((dt, ph) => obj.userData.dig?.(0.5 - 0.5 * Math.cos(ph * Math.PI * 2 * (a.digLoop || 1))));
    return obj;
  },
  // a mine cart rolling out of the mine and back along (wx,wz) -> (wx2,wz2)
  cart(T, p, a, o) {
    const c = MM.makeMineCart();
    c.userData.setLoad(a.load || 'gold');
    const q = new THREE.Vector3(a.wx2, 0, a.wz2); q.y = T.game.grid.groundAt(q.x, q.z);
    c.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    if (a.scale) c.scale.setScalar(a.scale);
    c.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    T.group.add(c);
    const set = (ph) => { const u = 0.5 - 0.5 * Math.cos((ph + (a.off || 0)) * Math.PI * 2); c.position.lerpVectors(p, q, u); c.position.y += a.lift || 0; c.userData.spin(u * (p.distanceTo(q) / 0.1)); };
    set(0);
    if (o.loop) S.drivers.push((dt, ph) => set(ph));
    return c;
  },
  // rail between two points
  rail(T, p, a) {
    const q = new THREE.Vector3(a.wx2, 0, a.wz2);
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const m = MM.makeRail(len);
    m.position.copy(p); m.position.y += a.lift || 0;
    m.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    T.group.add(m);
    return m;
  },
  // conveyor: n belt tiles from (wx,wz) along yaw ry, items riding it (loop-seamless spacing)
  belt(T, p, a, o) {
    const g = new THREE.Group();
    g.position.copy(p); g.rotation.y = a.ry ?? 0;
    T.group.add(g);
    const n = a.n || 4;
    for (let i = 0; i < n; i++) {
      const b = IM.STRUCTURE_MODELS.ind_belt({ seed: i });
      b.position.set(0, 0, i); b.userData.st.on = true; b.userData.st.k = 1.04;
      g.add(b);
      const d = machineDriver(b); for (let k = 0; k < 2; k += 1 / 30) d(1 / 30); if (o.loop) S.drivers.push(d);
    }
    const ids = a.items || ['coal', 'copper', 'iron', 'gold'];
    const per = a.per || 2, total = n * per, items = [];
    for (let i = 0; i < total; i++) { const it = IM.makeBeltItem(ids[i % ids.length]); it.scale.setScalar(a.itemScale || 1.4); g.add(it); items.push(it); }
    const set = (ph) => items.forEach((it, i) => { const z = ((i / total + ph * (a.laps || 1) / n) % 1) * n - 0.5; it.position.set(0, 0.27, z); });
    set(0);
    if (o.loop) S.drivers.push((dt, ph) => set(ph));
    return g;
  },
  // beaver miner: pickaxe in the paw, drill helmet, chopping at the rock
  beaver(T, p, a, o) {
    const r = new C3.BeaverRig({ shadows: true });
    r.root.position.copy(p); r.root.rotation.y = yawOf(T, a); r.root.scale.multiplyScalar(a.scale || 1);
    const pick = new THREE.Mesh(MM.beaverPickGeo(), MM.MINING_MAT());
    pick.rotation.x = Math.PI / 2; pick.position.set(0, -0.05, 0.02); pick.castShadow = true;
    r.gripR?.add(pick);
    if (r.props?.mallet) r.props.mallet.visible = false;
    const helm = new THREE.Mesh(MM.beaverHelmetGeo(), MM.MINING_MAT());
    r.hat?.add(helm); if (r.hatMesh) r.hatMesh.visible = false;
    T.group.add(r.root);
    r.play(a.anim || 'chop', { fade: 0 });
    for (let k = 0; k < 1; k += 1 / 60) r.update(1 / 60);
    if (r.props?.mallet) r.props.mallet.visible = false;
    if (o.loop) S.drivers.push(loopNpc(r, { anim: a.anim || 'chop', dur: 0.32, cycles: a.cycles || 4, off: a.off || 0, ...(a.loop || {}) }));
    return r.root;
  },
  // Flint the badger, swinging his pick (looping the two swings)
  badger(T, p, a, o) {
    const r = new C3.BadgerProspector({ shadows: true });
    r.root.position.copy(p); r.root.rotation.y = yawOf(T, a); r.root.scale.multiplyScalar(a.scale || 1);
    T.group.add(r.root);
    r.play(a.anim || 'swing_pick', { fade: 0 });
    for (let k = 0; k < (a.t ?? 1.25); k += 1 / 60) r.update(1 / 60);
    if (o.loop) S.drivers.push(loopNpc(r, { anim: a.anim || 'swing_pick', range: a.range || [0.95, 2.0], cycles: a.cycles || 2 }));
    return r.root;
  },
};

// ------------------------------------------------------------------ [v4 cinematic] the 5 PM feast
// Cast kinds for the Cinematic Update art: the office tower as a far landmark, bears streaming
// down to the pond, bears on cannonball arcs into it (each with its own splash, timed to the
// impact). Points are [sx, sy] (screen fractions, on the ground / water), [sx, sy, h] (that screen
// point at height h) or { wx, wz, y? } (world).
function pointOf(T, q, onWater = false) {
  if (!Array.isArray(q) && q.at) { const v = T._at(q.at[0], q.at[1]); v.y = q.y ?? Math.max(WATER_Y, T.game.grid.groundAt(v.x, v.z)) + (q.h ?? 0); return v; }
  if (!Array.isArray(q)) { const v = new THREE.Vector3(q.wx, 0, q.wz); v.y = q.y ?? Math.max(WATER_Y, T.game.grid.groundAt(q.wx, q.wz)); return v; }
  if (q.length >= 3) return ground(T, q[0], q[1], q[2]);
  return onWater ? ground(T, q[0], q[1], WATER_Y) : ground(T, q[0], q[1]);
}
const wrap01 = (u) => ((u % 1) + 1) % 1;
const CINE_KINDS = {
  // Bear St. Holdings, forced perspective: a small copy of the real tower (src/world/buildings.js)
  // sunk behind the far treeline so it reads as the office up on the mountain. s = voxel size.
  office(T, p, a) {
    const m = officeModel(), s = a.s ?? 0.03;
    const g = new THREE.Group();
    const body = new THREE.Mesh(m.body.build({ scale: s }), voxelMaterial());
    const glow = new THREE.Mesh(m.glow.build({ scale: s, ao: false }), new THREE.MeshBasicMaterial({ vertexColors: true, color: a.glow ?? 0xffffff }));
    body.castShadow = !!a.shadow;
    g.add(body, glow);
    g.position.copy(p); g.position.y -= a.sink ?? 0;
    g.rotation.y = yawOf(T, a);
    T.group.add(g);
    g.updateMatrixWorld(true);
    S.spots.whistle = new THREE.Vector3(12.5 * s, 46 * s, -4.5 * s).applyMatrix4(g.matrixWorld);
    S.spots.door = new THREE.Vector3(-0.5 * s, 1 * s, 10 * s).applyMatrix4(g.matrixWorld);
    S.spots.roof = new THREE.Vector3(0, 48 * s, 0).applyMatrix4(g.matrixWorld);
    return g;
  },
  // a bear running from `from` to `to` (rate laps per loop, off = phase offset); hidden outside [0, vis]
  runner(T, p, a, o) {
    const b = makeBear(a.type || 'office', a.seed ?? 3.7);
    b.root.scale.multiplyScalar(a.scale ?? 0.4);
    T.group.add(b.root);
    const A = pointOf(T, a.from), B = pointOf(T, a.to);
    b.root.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + (a.yawOff ?? 0);
    if (a.face) b.setFace(a.face, { hold: 999 });
    const set = (ph, dt) => {
      const u = wrap01(ph * (a.rate ?? 1) + (a.off ?? 0));
      b.root.visible = u <= (a.vis ?? 1);
      b.root.position.lerpVectors(A, B, u);
      if (!a.flat) b.root.position.y = Math.max(WATER_Y, T.game.grid.groundAt(b.root.position.x, b.root.position.z)) + (a.lift ?? 0);
      b.phase = u * (a.strides ?? 3) * Math.PI * 2;
      b.pose(a.pose || 'run', dt, { speed: a.speed ?? 3 });
    };
    for (let k = 0; k < 1; k += 1 / 30) set(a.still ?? 0.3, 1 / 30);
    if (o.loop) S.drivers.push((dt, ph) => set(ph, dt));
    return b.root;
  },
  // a bear cannonballing from `from` into the pond at (sx, sy) / (wx, wz): airborne for `air` of the
  // loop (slow motion), then the splash (auto: burst + crown + rings, timed to the impact) and gone.
  cannon(T, p, a, o) {
    const sc = a.scale ?? 0.8;
    const b = makeBear(a.type || 'office', a.seed ?? 3.7);
    b.root.scale.multiplyScalar(sc);
    T.group.add(b.root);
    const A = pointOf(T, a.from);
    const W = a.to ? pointOf(T, a.to, true) : a.wx != null ? pointOf(T, { wx: a.wx, wz: a.wz, y: WATER_Y }) : ground(T, a.sx, a.sy, WATER_Y);
    W.y = WATER_Y;
    const B = W.clone(); B.y = WATER_Y - (a.depth ?? 0.9) * sc;
    const H = a.arc ?? 1.6, air = a.air ?? 0.45, off = a.off ?? 0, dive = a.dive ?? 0.05;
    b.root.rotation.order = 'YXZ';
    b.root.rotation.y = facing(T, a.rot ?? 0);
    if (a.face) b.setFace(a.face, { hold: 999 });
    const set = (ph, dt) => {
      const u = wrap01(ph + off);
      if (u >= air + dive) { b.root.visible = false; return; }
      b.root.visible = true;
      const k = u / air;
      if (k <= 1) {
        b.root.position.lerpVectors(A, B, k);
        b.root.position.y += Math.sin(k * Math.PI) * H;
      } else { // under the surface, into the splash
        b.root.position.copy(B); b.root.position.y -= (k - 1) * 6 * sc;
      }
      const t01 = (a.t01 ?? [0.02, 0.95]), tt = Math.min(1, t01[0] + (t01[1] - t01[0]) * Math.min(1, k) ** (a.slowTuck ?? 1));
      b.pose('cannonball', dt, { t01: tt, flip: a.flip ?? 'tuck' }); // explicit: the bear's own personality may flip
      // lean back into the tuck so the face (cheeks puffed, eyes on the water) stays to camera
      const tuck = Math.min(1, Math.max(0, (tt - 0.08) / 0.18));
      const l0 = a.leanFrom ?? 0, lk = tuck * tuck * (3 - 2 * tuck);
      b.root.rotation.x = (a.lean ?? 0) * (l0 + (1 - l0) * lk) + (a.tilt ?? 0) * Math.sin(k * Math.PI);
      b.root.rotation.z = (a.roll ?? 0) * (k - 0.5);
    };
    for (let k = 0; k < 1; k += 1 / 30) set(a.still ?? 0.3, 1 / 30);
    if (o.loop) {
      S.drivers.push((dt, ph) => set(ph, dt));
      if (a.splash !== false) {
        const at = wrap01(air - off), Sp = a.splash || {};
        const big = Sp.k ?? sc;
        for (const L of [
          { type: 'burst', at, dur: Sp.dur ?? 0.4, n: Sp.n ?? 50, radius: 1.5 * big, height: 1.2 * big, size: 0.12 * big, seed: (a.seed ?? 3) * 7 + 1 },
          { type: 'burst', at, dur: Sp.dur ?? 0.4, n: Sp.crown ?? 44, radius: 0.35 * big, r0: 0.5 * big, height: 1.7 * big, size: 0.17 * big, lag: 0.4, seed: (a.seed ?? 3) * 7 + 2 },
          { type: 'burst', at, dur: Sp.dur ?? 0.4, n: Sp.plume ?? 26, radius: 0.18 * big, r0: 0.05, height: 2.5 * big, size: 0.2 * big, lag: 0.6, seed: (a.seed ?? 3) * 7 + 4 },
          { type: 'ring', at, dur: 0.5, n: 26, r0: 0.4 * big, r1: 2.0 * big, size: 0.1 * big, seed: 5 },
          { type: 'ring', at: wrap01(at + 0.08), dur: 0.45, n: 20, r0: 0.3 * big, r1: 1.4 * big, size: 0.08 * big, seed: 6 },
          ...(Sp.coins ? [{ type: 'coins', at, dur: Sp.dur ?? 0.5, n: Sp.coins, radius: 1.3 * big, height: 3.0 * big, size: 0.16 * big, seed: (a.seed ?? 3) * 7 + 3 }] : []),
        ]) S.drivers.push(loopFx(T, { ...L, ...(Sp.over || {}), pos: [W.x, WATER_Y, W.z] }));
      }
    }
    return b.root;
  },
};

// ------------------------------------------------------------------ [v5] "Dig & Dive": Bonebed Bluff
// The yard digsite.js builds when the fog lifts (the bluff face, Snapp's lab hut, tent, glass case,
// sieve bench, trenches, the giant ribcage, flagged dig mounds), placed at BONEBED like
// Villagers.makeProps does, and Prof. Snapp himself. Cast kinds; the trees on the yard go with
// o.clearWorld (tile rects).
const DD_KINDS = {
  digyard(T, p, a) {
    const B = BONEBED, g = T.game.grid, grp = new THREE.Group();
    const gy = (x, z) => g.groundAt(x, z);
    const put = (obj, q, ry = 0, dy = 0) => { obj.position.set(q.x, gy(q.x, q.z) + dy, q.z); obj.rotation.y = ry; grp.add(obj); obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return obj; };
    let low = 99;
    for (let x = B.bluff.x - 4.4; x <= B.bluff.x + 4.4; x += 0.5) low = Math.min(low, gy(x, B.bluff.z + 0.6));
    const bluff = makeBluff();
    bluff.position.set(B.bluff.x, low - 0.12, B.bluff.z);
    grp.add(bluff);
    S.named.bluffGlow = bluff.userData.glow;
    const skip = new Set(a.skip || []);
    if (!skip.has('hut')) put(makeLabHut(), B.hut, 0.12);
    if (!skip.has('tent')) put(makeFieldTent(), B.tent, -0.35);
    if (!skip.has('case')) {
      const C = put(makeDisplayCase(), B.case, 0.25);
      (a.finds || ['ammonite', 'trilobite', 'amber', 'sabrefang', 'dinoegg', 'raptorclaw', 'sharktooth', 'amberbug', 'fishskull']).forEach((id, k) => {
        if (!C.userData.slots?.[k]) return;
        const m = makeFindMini(id); m.position.copy(C.userData.slots[k]); m.rotation.y = (k % 3 - 1) * 0.25; m.scale.setScalar(0.85); C.add(m);
      });
    }
    if (!skip.has('bench')) put(makeSieveBench(), B.bench, -0.2);
    if (!skip.has('trench')) B.trench.forEach((Tr, k) => put(makeTrench(Tr.w, Tr.d, k), Tr, k ? 0.3 : -0.08));
    if (!skip.has('ribs')) put(makeRibcage(), B.ribs, -0.35, -0.04);
    if (!skip.has('mounds')) for (const h of a.mounds || B.home) put(makeSiteMound('fresh', h.group || 'bone'), h, h.ry || 0);
    T.group.add(grp);
    return grp;
  },
  // Prof. Ambrose Snapp: anim scrubbed over a window of it (range, pingpong) or played `cycles` times a loop
  snapp(T, p, a, o) {
    const r = new SnapperProf({ shadows: true });
    r.root.position.copy(p); r.root.rotation.set(a.lean ?? 0, yawOf(T, a), 0, 'YXZ'); r.root.scale.multiplyScalar(a.scale || 1); // lean < 0: face tipped up to the camera
    T.group.add(r.root);
    r.play(a.anim || 'loupe', { fade: 0 });
    if (a.expr) r.setExpression?.(a.expr, { hold: 99 });
    for (let k = 0; k < (a.t ?? 1.5); k += 1 / 60) r.update(1 / 60);
    if (o.loop) S.drivers.push(loopNpc(r, { anim: a.anim || 'loupe', ...(a.loop || {}) }));
    S.named.snappRig = r;
    return r.root;
  },
};

// one-shot effects inside the loop: everything starts at phase `at`, lasts `dur` (fractions of the loop)
const SPLASH_COLS = [0xffffff, 0xfff6dc, 0xd8f6ff, 0x9fe2f8, 0xffffff, 0xbfeeff];
const COIN_COLS = [0xffd84a, 0xffe98a, 0xe8a828, 0xfff2b0];
function fxCenter(T, L) {
  if (L.pos) return new THREE.Vector3(L.pos[0], L.pos[1], L.pos[2]);
  if (L.spot) { const v = S.spots[L.spot]?.clone() || new THREE.Vector3(); return v; }
  return L.wx != null ? new THREE.Vector3(L.wx, T.game.grid.groundAt(L.wx, L.wz), L.wz) : L.h != null ? ground(T, L.sx, L.sy, L.h) : ground(T, L.sx, L.sy);
}
// [v5] pixel bubbles (outlined rings with a highlight), 4 sizes, one texel = L.px world units
const BUB2 = [
  ['.kk.', 'kwbk', 'kbbk', '.kk.'],
  ['.kkk.', 'kwwbk', 'kw.bk', 'kb.bk', '.kkk.'],
  ['..kkk..', '.kwwbk.', 'kwb..bk', 'kw...bk', 'kb...bk', '.kbbbk.', '..kkk..'],
  ['...kkkk...', '..kwwbbk..', '.kwb...bk.', 'kwb.....bk', 'kw......bk', 'kb......bk', 'kb.....bbk', '.kb...bbk.', '..kbbbbk..', '...kkkk...'],
];
let BUB2_MATS = null;
function bub2Mats() {
  if (BUB2_MATS) return BUB2_MATS;
  const pal = { k: '#2a8aa8', w: '#ffffff', b: '#a8ecfa' };
  BUB2_MATS = BUB2.map((rows) => {
    const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { x.fillStyle = pal[r[i]]; x.fillRect(i, j, 1, 1); } });
    return new THREE.SpriteMaterial({ map: pixTex(c), alphaTest: 0.5, fog: false, depthWrite: false });
  });
  return BUB2_MATS;
}
const CINE_FX = {
  // [v5] a column of bubbles wobbling up from a point (a vent, a snorkel), `rate` waves a loop
  bubbles(T, L) {
    const g = new THREE.Group(); (S.fxParent || T.group).add(g); add(g);
    const r = seeded(L.seed || 21), c = fxCenter(T, L), n = L.n || 8, parts = [], M = bub2Mats();
    const sizes = L.sizes || [0, 1, 1, 2, 2, 3];
    for (let i = 0; i < n; i++) {
      const k = sizes[Math.floor(r() * sizes.length)];
      const m = new THREE.Sprite(M[k]);
      m.scale.setScalar(BUB2[k].length * (L.px ?? 0.02));
      m.renderOrder = 20;
      g.add(m);
      parts.push({ m, off: i / n + r() * (0.6 / n), dx: (r() - 0.5) * (L.spread ?? 0.3), dz: (r() - 0.5) * (L.spread ?? 0.3) * 0.5, wob: r() * 6, sp: 0.75 + r() * 0.5 });
    }
    return (dt, ph) => {
      for (const p of parts) {
        const u = wrap01(ph * (L.rate || 1) + p.off);
        const y = c.y + u * (L.rise ?? 2.5) * p.sp;
        p.m.visible = y < (L.top ?? 1e9);
        p.m.position.set(c.x + p.dx * (0.4 + u) + Math.sin(u * Math.PI * 2 * (L.wobN ?? 2) + p.wob) * (L.wob ?? 0.06), y, c.z + p.dz);
      }
    };
  },
  // droplets thrown up and out under gravity (crown + spray)
  burst(T, L) {
    const g = new THREE.Group(); (S.fxParent || T.group).add(g); add(g);
    const r = seeded(L.seed || 7), c = fxCenter(T, L), n = L.n || 40, parts = [];
    const cols = L.colors || SPLASH_COLS;
    for (let i = 0; i < n; i++) {
      const s = (L.size || 0.1) * (0.55 + r() * 0.9);
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: cols[i % cols.length] }));
      g.add(m);
      parts.push({ m, a: r() * Math.PI * 2, vr: 0.35 + r() * 0.65, vy: 0.55 + r() * 0.45, d: r() * 0.12, rx: r() * 6, ry: r() * 6 });
    }
    return (dt, ph) => {
      const t = wrap01(ph - L.at) / (L.dur || 0.4);
      for (const p of parts) {
        const k = t - p.d * (L.lag ?? 1);
        if (t > 1 || k < 0) { p.m.visible = false; continue; }
        const R = (L.r0 || 0) + (L.radius || 1) * p.vr * (1 - (1 - k) ** 2);
        const y = c.y + (L.height || 1.5) * p.vy * 4 * k * (1 - k);
        p.m.visible = y > c.y - 0.05 || k < 0.5;
        p.m.position.set(c.x + Math.cos(p.a) * R, Math.max(c.y - 0.05, y), c.z + Math.sin(p.a) * R * (L.flatZ ?? 1));
        p.m.scale.setScalar(Math.max(0.15, 1 - k * 0.75));
        p.m.rotation.set(p.rx + k * 4, p.ry + k * 3, 0);
      }
    };
  },
  // gold coins flung out of a briefcase, spinning
  coins(T, L) {
    const g = new THREE.Group(); (S.fxParent || T.group).add(g); add(g);
    const r = seeded(L.seed || 9), c = fxCenter(T, L), n = L.n || 10, parts = [];
    for (let i = 0; i < n; i++) {
      const s = (L.size || 0.14) * (0.8 + r() * 0.4);
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s * 0.28), new THREE.MeshBasicMaterial({ color: COIN_COLS[i % COIN_COLS.length] }));
      g.add(m);
      parts.push({ m, a: r() * Math.PI * 2, vr: 0.3 + r() * 0.7, vy: 0.6 + r() * 0.4, d: r() * 0.1, spin: 6 + r() * 10 });
    }
    return (dt, ph) => {
      const t = wrap01(ph - L.at) / (L.dur || 0.5);
      for (const p of parts) {
        const k = t - p.d;
        if (t > 1 || k < 0) { p.m.visible = false; continue; }
        const R = (L.radius || 1) * p.vr * k;
        const y = c.y + (L.height || 2) * p.vy * 4 * k * (1 - k);
        p.m.visible = y > c.y - 0.05;
        p.m.position.set(c.x + Math.cos(p.a) * R, y, c.z + Math.sin(p.a) * R);
        p.m.rotation.set(0.3, k * p.spin, 0);
      }
    };
  },
  // foam ring spreading on the water
  ring(T, L) {
    const g = new THREE.Group(); (S.fxParent || T.group).add(g); add(g);
    const r = seeded(L.seed || 5), c = fxCenter(T, L), n = L.n || 24, parts = [];
    for (let i = 0; i < n; i++) {
      const s = (L.size || 0.08) * (0.7 + r() * 0.6);
      const m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s * 0.5, s), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xf4fcff : 0xbfeeff }));
      g.add(m);
      parts.push({ m, a: (i / n) * Math.PI * 2 + r() * 0.2, j: 0.85 + r() * 0.3 });
    }
    return (dt, ph) => {
      const t = wrap01(ph - L.at) / (L.dur || 0.5);
      for (const p of parts) {
        if (t > 1) { p.m.visible = false; continue; }
        p.m.visible = true;
        const R = ((L.r0 || 0.3) + ((L.r1 || 1.6) - (L.r0 || 0.3)) * (1 - (1 - t) ** 2)) * p.j;
        p.m.position.set(c.x + Math.cos(p.a) * R, c.y + 0.02, c.z + Math.sin(p.a) * R);
        p.m.rotation.y = -p.a;
        p.m.scale.setScalar(Math.max(0.1, 1 - t));
      }
    };
  },
  // steam / smoke puffs: like 'smoke' but opaque cubes that shrink away (crisp pixels, no alpha)
  steam(T, L) {
    const g = new THREE.Group(); (S.fxParent || T.group).add(g); add(g);
    const r = seeded(L.seed || 17), c = fxCenter(T, L), n = L.n || 10, parts = [];
    const cols = L.colors || [0xffffff, 0xfff2e0, 0xf0e4e8];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: cols[i % cols.length], emissive: L.emissive ?? 0x403020 }));
      g.add(m);
      parts.push({ m, off: i / n + r() * 0.03, dx: (r() - 0.5), dz: (r() - 0.5), sp: 0.7 + r() * 0.6, rx: r() * 3 });
    }
    return (dt, ph) => {
      for (const p of parts) {
        const u = wrap01(ph * (L.rate || 1) + p.off);
        const sz = (L.size || 0.3) * p.sp * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5 + 0.2) * (1 - u ** 3);
        p.m.position.set(c.x + (L.drift || 0.4) * u + p.dx * (L.spread ?? 0.15), c.y + u * (L.rise || 1.4), c.z + p.dz * (L.spread ?? 0.15));
        p.m.scale.setScalar(Math.max(0.001, sz));
        p.m.rotation.set(p.rx + u, p.rx * 1.3 + u * 0.7, 0);
      }
    };
  },
};

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
  const C = { lookUp: o.lookUp, yaw: o.yaw ?? facing(T, o.yawOff ?? 0), pitch: o.pitch ?? 17, wupp: o.wupp ?? 0.016, focus: o.focusWorld ? new THREE.Vector3(o.focusWorld[0], T.game.grid.groundAt(o.focusWorld[0], o.focusWorld[1]), o.focusWorld[1]) : T._at(o.camR ?? 0, o.camF ?? 0), sun: o.sun || [-0.3, 0.6], skyD: o.skyD };
  applyCamera(T, C);
  clearRects(T, o.clear, o.clearWorld);
  for (const a of o.cast || []) {
    let obj;
    const p = a.at ? (() => { const v = T._at(a.at[0], a.at[1]); v.y = Math.max(WATER_Y, T.game.grid.groundAt(v.x, v.z)); return v; })()
      : a.wx != null ? new THREE.Vector3(a.wx, T.game.grid.groundAt(a.wx, a.wz), a.wz)
      : a.front != null ? front(T, a.sx, a.sy, a.front) : a.h != null ? ground(T, a.sx, a.sy, a.h) : ground(T, a.sx, a.sy);
    if (a.lift) p.y += a.lift;
    let rig = null;
    if (FS_KINDS[a.kind]) { obj = FS_KINDS[a.kind](T, p, a, o); add(obj, a.name); continue; }
    if (CINE_KINDS[a.kind]) { obj = CINE_KINDS[a.kind](T, p, a, o); add(obj, a.name); continue; }
    if (DD_KINDS[a.kind]) { obj = DD_KINDS[a.kind](T, p, a, o); add(obj, a.name); continue; }
    if (a.kind === 'fox' && a.shock) {
      rig = placeFox(T, p, { ...a, anim: null, shadow: false });
      shockedFox(rig, a.shock);
      for (let k = 0; k < 1.6; k += 1 / 30) rig.update(1 / 30);
      add(rig.root, a.name);
      if (o.loop) { const r = rig; S.drivers.push((dt, ph) => { r.__promoPhase = ph; r.update(dt); }); }
      continue;
    }
    if (a.kind === 'fox') { rig = placeFox(T, p, a); obj = rig.root; }
    else if (a.kind === 'bear') {
      rig = placeBear(T, a.type, p, a); obj = rig.root;
      if (a.pick) { const m = new THREE.Mesh(MM.beaverPickGeo(), MM.MINING_MAT()); const g = new THREE.Group(); g.add(m); m.rotation.set(a.pick.rx ?? 0, a.pick.ry ?? 0, a.pick.rz ?? 0); g.scale.setScalar(a.pick.s ?? 2.2); rig.hold(g); rig.handAnchorR.add(g); g.position.set(a.pick.x ?? 0, a.pick.y ?? 0, a.pick.z ?? 0); }
    }
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

// ------------------------------------------------------------------ [v5] "Dig & Dive": under Loon Lake
// SCENES.dive swaps in the dive mode's own diorama (src/entities/diveScene.js) through
// game.overrideScene / overrideRig, like DiveMode does, with its own camera (o.cam). Cast in the
// dive scene's coordinates: { x, z } and y (absolute) or by (height above the lake bed).
//   diver   Reynard in dive gear (mask + snorkel + top hat, or the brass helmet + tanks; flippers),
//           kicking on the spot (loop-periodic version of DiveMode.animateDiver)
//   chief / noodles   Chief Buff / Noodles the otter, any of their anims looped
//   farm    a farm model on the bed; `stock` = { sp, n } circles inside the net (the game's FishPack)
//   school  a FishPack circling an ellipse (rx, ry, rz), `laps` a loop
//   ancient a prehistoric fish (the Primordial Vial morph) gliding from `from` to `to`, swim frames
const DIVE_KINDS = {
  diver(T, sc, p, a, o) {
    const g = new THREE.Group(); sc.scene.add(g);
    const F = new FoxRig({ shadows: false }), k = a.scale ?? 0.8;
    F.setOutfit?.('default');
    F.root.scale.setScalar(k); F.root.position.set(0, -6 * KVS * k, 0);
    g.add(F.root);
    F.play('idle', { loop: true, fade: 0 });
    if (a.expr) F.setExpression?.(a.expr, { hold: 99 });
    const mk = (kind) => { const geo = diveGeo('gear_' + kind, () => gearModel(kind), { scale: KFV }); return new THREE.Mesh(geo, uwMat(geo)); };
    const tip = new THREE.Object3D(), helmet = a.gear === 'helmet';
    if (!helmet) {
      const mask = mk('mask'); mask.position.set(0, 6.9 * KVS, 8.2 * KVS); mask.scale.setScalar(1.1); F.head.add(mask);
      const sn = mk('snorkel'); sn.position.set(7.4 * KVS, 4.0 * KVS, 2.6 * KVS); sn.rotation.set(0.15, 0, -0.1); F.head.add(sn);
      tip.position.set(0.5 * KFV, 27 * KFV, 0.5 * KFV); sn.add(tip);
    } else {
      const hm = mk('helmet'); hm.position.set(0, 6.4 * KVS, 1.0 * KVS); hm.scale.setScalar(1.22); F.head.add(hm);
      tip.position.set(0, 20 * KFV, -6 * KFV); hm.add(tip);
      const tk = mk('tanks'); tk.position.set(0, -1 * KVS, -6.4 * KVS); F.chest.add(tk);
    }
    if (a.flippers !== false) for (const Lg of [F.legL, F.legR]) { const fl = mk('flipper'); fl.position.set(0, -3.1 * KVS, 0.4 * KVS); Lg.kn.add(fl); }
    const facing = a.facing ?? 1, swim = a.swim ?? 0.8, P = o.loop?.period || 3.2;
    const w = (n) => (2 * Math.PI * n) / P; // angular speed of n whole cycles a loop
    const yaw = (facing > 0 ? Math.PI / 2 - 0.42 * (1 - swim * 0.6) : -Math.PI / 2 + 0.42 * (1 - swim * 0.6)) + (a.yawOff ?? 0);
    const pitch = a.pitch ?? 0.18 + 1.02 * swim;
    const e = new THREE.Euler();
    const set = (grp, x, y, z, ord = 'XYZ') => { e.set(x, y, z, ord); grp.quaternion.setFromEuler(e); };
    const pose = (dt, ph) => {
      const t = ph * P;
      g.position.set(p.x, p.y + Math.sin(w(1) * t) * (a.bob ?? 0.06), p.z);
      g.rotation.set(pitch + Math.sin(w(1) * t + 1) * 0.04, yaw, Math.sin(w(1) * t) * 0.05, 'YXZ');
      F.update(dt);
      const kf = w(a.kicks ?? 4), amp = 0.25 + 0.3 * swim;
      set(F.legL.th, Math.sin(t * kf) * amp + 0.15, 0, 0.12); set(F.legR.th, Math.sin(t * kf + Math.PI) * amp + 0.15, 0, -0.12);
      set(F.legL.kn, 0.25 + Math.max(0, Math.sin(t * kf + 0.9)) * 0.55, 0, 0); set(F.legR.kn, 0.25 + Math.max(0, Math.sin(t * kf + Math.PI + 0.9)) * 0.55, 0, 0);
      if (a.arms === 'back') { set(F.armL.sh, 0.35, 0, 0.25); set(F.armR.sh, 0.35, 0, -0.25); set(F.armL.el, -0.2, 0, 0); set(F.armR.el, -0.2, 0, 0); }
      else if (a.arms === 'reach') { // both paws out in front, grabbing for something
        const r = Math.sin(t * w(2)) * 0.12;
        set(F.armL.sh, -2.5 + r, 0, 0.25); set(F.armR.sh, -2.5 - r, 0, -0.25); set(F.armL.el, -0.25, 0, 0); set(F.armR.el, -0.25, 0, 0);
      } else {
        const q = t * w(a.strokes ?? 2);
        set(F.armL.sh, -1.3 + Math.sin(q) * 0.7 * (0.4 + swim), 0, 0.35 + Math.cos(q) * 0.2); set(F.armR.sh, -1.3 + Math.sin(q + Math.PI) * 0.7 * (0.4 + swim), 0, -0.35 - Math.cos(q + Math.PI) * 0.2);
        set(F.armL.el, -0.6 - Math.max(0, Math.cos(q)) * 0.6, 0, 0); set(F.armR.el, -0.6 - Math.max(0, Math.cos(q + Math.PI)) * 0.6, 0, 0);
      }
      set(F.head, -pitch * 0.85 + 0.1 + (a.headUp ?? 0), a.headYaw ?? 0, 0);
      F.tail.forEach((sg, i) => set(sg, 0.25 - pitch * 0.2, Math.sin(t * w(2) - i * 0.9) * (0.25 + swim * 0.25), 0, 'YXZ'));
      if (helmet) { F.hat.visible = false; F.earL.visible = F.earR.visible = false; }
      F.monocle.visible = false; F.chainGroup.visible = false;
    };
    pose(1 / 30, a.still ?? 0.3);
    g.updateMatrixWorld(true);
    S.spots.snorkel = tip.getWorldPosition(new THREE.Vector3());
    if (o.loop) S.drivers.push(pose);
    return g;
  },
  chief(T, sc, p, a, o) { return DIVE_KINDS._npc(new ChiefBuff({ shadows: false }), sc, p, a, o, 'swim', 0.85, -0.3); },
  noodles(T, sc, p, a, o) { return DIVE_KINDS._npc(new NoodlesOtter({ shadows: false }), sc, p, a, o, 'idle', 0.9, 0); },
  _npc(r, sc, p, a, o, anim0, k0, dy) {
    const g = new THREE.Group(); g.add(r.root);
    r.root.scale.setScalar(a.scale ?? k0); r.root.position.set(0, dy, 0);
    g.position.copy(p); g.rotation.set(a.rx ?? 0, a.ry ?? Math.PI / 2, a.rz ?? 0, 'YXZ');
    sc.scene.add(g);
    r.play(a.anim || anim0, { fade: 0 });
    if (a.expr) r.setExpression?.(a.expr, { hold: 99 });
    for (let k = 0; k < (a.t ?? 1); k += 1 / 60) r.update(1 / 60);
    if (o.loop) {
      const L = loopNpc(r, { anim: a.anim || anim0, ...(a.loop || {}) });
      S.drivers.push((dt, ph) => { g.position.y = p.y + Math.sin(ph * Math.PI * 2 + (a.bobOff ?? 0)) * (a.bob ?? 0.06); L(dt, ph); });
    }
    return g;
  },
  farm(T, sc, p, a, o) {
    const d = FARMS[a.type] || FARMS.pen;
    const geo = diveGeo('farm_' + a.type, () => farmModel(a.type), { scale: KVS });
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(geo, uwMat(geo, { emissive: a.type === 'feeder' ? 0x110a00 : 0 })));
    grp.position.set(p.x, sc.bedH(p.x, p.z) - 0.04, p.z); grp.rotation.y = a.ry || 0;
    sc.scene.add(grp);
    if (a.stock) {
      const st = a.stock, n = st.n || 6;
      const fp = new FishPack(sc.scene, st.sp, n, { scale: st.pxPer ? st.pxPer * FISH_TPU * (o.cam?.wupp ?? 0.02) : st.scale ?? 1 });
      const q0 = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2, r: 0.4 + (i % 3) * 0.22, y: 0.5 + (i % 4) * 0.35 }));
      const set = (ph) => {
        q0.forEach((q, i) => {
          const ang = q.a + ph * Math.PI * 2 * (st.laps ?? 1);
          const R = q.r * (d.r / 1.3) * 0.85;
          fp.set(i, grp.position.x + Math.cos(ang) * R, grp.position.y + q.y * (d.r / 1.3) + Math.sin(ph * Math.PI * 4 + i) * 0.06, grp.position.z + Math.sin(ang) * R * 0.8, ang + Math.PI / 2);
        });
        fp.flush();
      };
      set(0);
      if (o.loop) S.drivers.push((dt, ph) => set(ph));
    }
    return grp;
  },
  school(T, sc, p, a, o) {
    const n = a.n || 8, fp = new FishPack(sc.scene, a.sp || 'perch', n, { scale: a.pxPer ? a.pxPer * FISH_TPU * (o.cam?.wupp ?? 0.02) : a.fscale ?? 1 });
    const r = seeded(a.seed || 5);
    const q0 = Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, dr: 0.75 + r() * 0.5, dy: (r() - 0.5) * 0.6, dz: (r() - 0.5) * 0.6 }));
    const dir = a.dir ?? 1;
    const set = (ph) => {
      q0.forEach((q, i) => {
        const ang = q.a + dir * ph * Math.PI * 2 * (a.laps ?? 1);
        const x = p.x + Math.cos(ang) * (a.rx ?? 2) * q.dr, z = p.z + Math.sin(ang) * (a.rz ?? 1) * q.dr;
        fp.set(i, x, p.y + q.dy + Math.sin(ang * 2) * (a.ry ?? 0.2), z + q.dz, dir > 0 ? ang + Math.PI / 2 : ang - Math.PI / 2);
      });
      fp.flush();
    };
    set(0);
    if (o.loop) S.drivers.push((dt, ph) => set(ph));
    return fp.mesh || new THREE.Group();
  },
  ancient(T, sc, p, a, o) {
    const frames = [0, 1, 2, 3, 4].map((f) => {
      const cv = fishCanvasFor(a.id || 'sabertooth', { morph: 'ancient', frame: f, scale: 1 });
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      return { tex, w: cv.width, h: cv.height };
    });
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0].tex, alphaTest: 0.5, fog: false, color: a.tint ?? 0xffffff }));
    m.renderOrder = 15;
    sc.scene.add(m);
    const A = new THREE.Vector3(...(a.from || [p.x - 4, p.y, p.z])), B = new THREE.Vector3(...(a.to || [p.x + 4, p.y, p.z]));
    const dir = Math.sign(B.x - A.x) || 1, k = a.px ?? (a.pxPer ?? 1) * (o.cam?.wupp ?? 0.02), N = o.loop?.frames || 40;
    const set = (ph) => {
      const u = wrap01(ph * (a.laps ?? 1) + (a.off ?? 0));
      m.position.lerpVectors(A, B, u);
      m.position.y += Math.sin(u * Math.PI * 2 * (a.bobN ?? 2)) * (a.bob ?? 0.1);
      const f = frames[Math.floor(Math.round(ph * N) / (a.frameStep ?? 2)) % 5];
      m.material.map = f.tex;
      m.scale.set(f.w * k * dir, f.h * k, 1);
      m.visible = a.vis == null || u <= a.vis;
    };
    set(a.still ?? 0.3);
    if (o.loop) S.drivers.push((dt, ph) => set(ph));
    return m;
  },
};

SCENES.dive = (T, o) => {
  const game = T.game, R = game.renderer;
  const sc = (S.dive = buildDiveScene({ wreck: o.wreck || 'old' }));
  const D = o.cam || {};
  const rig = (S.diveRig = new CameraRig());
  rig.freeBounds = true; rig.minWupp = 0.001; rig.maxWupp = 1;
  rig.yaw = rig.yawGoal = D.yaw ?? 0;
  rig.pitch = rig.pitchGoal = (D.pitch ?? 12) * D2R;
  rig.dist = D.dist ?? 30;
  rig.wupp = rig.wuppGoal = D.wupp ?? 0.02;
  rig.goal.set(D.x ?? 0, D.y ?? 2.7, D.z ?? -0.8); rig.target.copy(rig.goal);
  rig.update(0, R);
  game.overrideScene = sc.scene; game.overrideRig = rig;
  S.fxParent = sc.scene;
  const P = (a) => new THREE.Vector3(a.x ?? 0, a.y != null ? a.y : sc.bedH(a.x ?? 0, a.z ?? 0) + (a.by ?? 0), a.z ?? 0);
  let diverP = null;
  for (const a of o.cast || []) {
    const fn = DIVE_KINDS[a.kind];
    if (!fn) continue;
    const obj = fn(T, sc, P(a), a, o);
    if (a.kind === 'diver') diverP = obj.position;
    add(obj, a.name);
  }
  const tb = o.loop?.timeBase ?? 100, amp = o.diveAmp ?? 1.2;
  const step = (dt, ph) => { sc.update(dt, tb + amp * Math.sin(2 * Math.PI * ph), diverP); rig.wupp = rig.wuppGoal; rig.update(0, R); };
  step(0, o.still ?? 0);
  if (o.loop) { S.drivers.push(step); for (const L of o.loopFx || []) S.drivers.push(loopFx(T, L)); }
  return { dive: true };
};

// ------------------------------------------------------------------ [v7] the 3D title logo on a key colour
// SCENES.logo: the title helper's logo (src/game/title/logo3d.js buildTitleLogo) alone in its own scene
// (game.overrideScene, like the dive) on a flat key colour, golden-hour light, fitted to the frame; post
// effects that vary per pixel (vignette, bloom, haze) are switched off so the key stays flat and the
// compositor (promo.js famTitle) can cut the logo out. o.logo = { voxel, pitch (deg), fill (0..1 of the
// frame), key (hex), sun }. The logo animates with its own clock (water, sway, fish); o.logoStill freezes it.
SCENES.logo = async (T, o) => {
  const game = T.game, R = game.renderer;
  const { buildTitleLogo } = await import('../../src/game/title/logo3d.js');
  const L = o.logo || {};
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(L.key ?? 0xff00ff);
  scene.add(new THREE.HemisphereLight(L.sky ?? 0xffe4d0, L.ground ?? 0x5a4a3a, L.hemiI ?? 1.35));
  const sun = new THREE.DirectionalLight(L.sun ?? 0xffd6a0, L.sunI ?? 2.4);
  sun.position.set(-6, 9, 8);
  scene.add(sun);
  const logo = buildTitleLogo(game, { voxel: L.voxel ?? 0.068, sfx: () => {}, style: L.style }); // [v7.2] style: building | rock | berry
  scene.add(logo.group);
  S.named.logo = logo.group;
  S.logoObj = logo;
  logo.intro?.(); // it starts hidden and rises out of the ground
  // past the intro (3 s: letters grow in, the falls start), its own fish off (the compositor leaps fish in a loop)
  const noFish = () => { if (L.fish === false) logo.group.traverse((q) => { if (q.isSprite && !q.userData.letterFish) q.visible = false; }); };
  for (let k = 0; k < (L.warm ?? 4); k += 1 / 30) { logo.update?.(1 / 30); noFish(); }
  const rig = (S.diveRig = new CameraRig());
  rig.freeBounds = true; rig.minWupp = 0.0005; rig.maxWupp = 1;
  rig.yaw = rig.yawGoal = 0;
  rig.pitch = rig.pitchGoal = (L.pitch ?? 14) * D2R;
  rig.dist = 40;
  // fit: the logo's own fit (fitTilt centres it for a view `rel` rad above, extent = its size in voxels),
  // else its bounding box as this camera sees it
  const fill = L.fill ?? 0.94, vox = L.voxel ?? 0.068;
  let c = new THREE.Vector3(), hW, hH;
  if (logo.fitTilt && logo.extent) {
    logo.fitTilt(rig.pitch);
    const e = logo.extent(rig.pitch);
    hW = e.w * vox; hH = e.h * vox;
    logo.group.updateMatrixWorld(true);
    logo.group.getWorldPosition(c);
  } else {
    const box = new THREE.Box3().setFromObject(logo.group), size = box.getSize(new THREE.Vector3());
    box.getCenter(c);
    hW = size.x; hH = size.y * Math.cos(rig.pitch) + size.z * Math.sin(rig.pitch);
  }
  rig.wupp = rig.wuppGoal = Math.max(hW / (R.lowW * fill), hH / (R.lowH * fill));
  rig.goal.set(c.x + (L.dx ?? 0), c.y + (L.dy ?? 0), c.z); rig.target.copy(rig.goal);
  rig.update(0, R);
  game.overrideScene = scene; game.overrideRig = rig;
  const U = R.postMat.uniforms;
  for (const k of ['vignette', 'haze']) if (U[k]) U[k].value = 0;
  R.bloomStrength = 0;
  S.dive = { dispose() { logo.dispose?.(); } };
  const P = o.loop?.period || 3.2;
  if (o.loop) S.drivers.push((dt) => { if (!o.logoStill) logo.update?.(dt); noFish(); rig.update(0, R); });
  return { dive: true };
};

// ------------------------------------------------------------------ driver
export async function setup(kind, o = {}) {
  const T = window.__title;
  if (!T) throw new Error('no title scene');
  S.cfg = o;
  for (const a of S.actors) a.obj.removeFromParent();
  S.actors = []; S.named = {}; S.t = 0; S.drivers = []; S.spots = {};
  // [v5] leave a previous dive scene
  if (S.dive) { const g0 = window.__title?.game; if (g0) { g0.overrideScene = null; g0.overrideRig = null; } try { S.dive.dispose(); } catch { /* */ } S.dive = null; S.diveRig = null; }
  S.fxParent = null;
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
  // [v4 cinematic] post uniforms ({ haze: 0.2, grade: [1.1, 1, 0.9], ... }) and light overrides on top of the scene's sky
  for (const [k, v] of Object.entries(o.post || {})) { const u = game.renderer.postMat.uniforms[k]; if (!u) continue; if (Array.isArray(v)) u.value.set(...v); else u.value = v; }
  if (game.sky.update.__cineBase) game.sky.update = game.sky.update.__cineBase;
  if (o.light) {
    const base = game.sky.update, sky = game.sky, L = o.light;
    const f = (...args) => {
      base.apply(sky, args);
      if (L.sun != null) sky.sun.color.setHex(L.sun);
      if (L.sunI != null) sky.sun.intensity = L.sunI;
      if (L.hemi != null) sky.hemi.color.setHex(L.hemi);
      if (L.ground != null) sky.hemi.groundColor.setHex(L.ground);
      if (L.hemiI != null) sky.hemi.intensity = L.hemiI;
    };
    f.__cineBase = base;
    game.sky.update = f;
  }
  const cam = await SCENES[kind](T, o);
  // optional soft fill light from the camera so faces read against the low sun
  if (S.fill) { S.fill.removeFromParent(); S.fill.target.removeFromParent(); S.fill = null; }
  if (o.fill) {
    const L = (S.fill = new THREE.DirectionalLight(o.fillColor ?? 0xffe0d0, o.fill));
    const c = game.rig.camera.position, t = game.rig.target;
    L.position.copy(c); L.target.position.copy(t);
    game.scene.add(L, L.target);
  }
  // [v4 cinematic] golden rim light from behind the action (back-lit by the low sun)
  if (S.rim) { S.rim.removeFromParent(); S.rim.target.removeFromParent(); S.rim = null; }
  if (o.rim) {
    const L = (S.rim = new THREE.DirectionalLight(o.rim.color ?? 0xffc060, o.rim.i ?? 1.2));
    const t = game.rig.target, yw = S.camYaw ?? 0, d = o.rim.dir || [0.4, 0.6, 1];
    const right = new THREE.Vector3(Math.cos(yw), 0, -Math.sin(yw)), fwd = new THREE.Vector3(-Math.sin(yw), 0, -Math.cos(yw));
    L.position.copy(t).addScaledVector(right, d[0] * 20).addScaledVector(fwd, d[2] * 20); L.position.y += d[1] * 20;
    L.target.position.copy(t);
    game.scene.add(L, L.target);
  }
  const camOK = !cam?.dive; // [v5] the dive scene runs its own rig
  T._updateCamera = () => { if (camOK) applyCamera(T, cam); };
  T.update = (dt) => {
    dt = Math.min(dt || 0, 0.05);
    S.t += dt;
    game.state.hour = o.hour ?? 18.25;
    game.state.phase = 'day';
    game.fox.rig.root.visible = false;
    T.skyUniforms.uTime.value = o.skyT ?? 3;
    if (!S.loopOn) {
      if (o.glints !== false) T._ambientFx(dt);
      T._updateWords(dt);
      game.world.sim.update(dt * 0.5, game.wind);
    }
    if (camOK) applyCamera(T, cam);
  };
  if (camOK) applyCamera(T, cam);
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
  if (L.range) { // scrub a time window of the anim, `cycles` times per loop
    const cur = rig._cur; cur.speed = 0;
    return (dt, ph) => {
      let u = (ph * (L.cycles || 1) + (L.off || 0)) % 1;
      if (L.pingpong) u = 0.5 - 0.5 * Math.cos(u * Math.PI * 2); // [v5] there and back: no jump at the wrap
      cur.t = L.range[0] + (L.range[1] - L.range[0]) * u; rig.update(dt);
    };
  }
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
  if (CINE_FX[L.type]) return CINE_FX[L.type](T, L);
  const g = new THREE.Group();
  (S.fxParent || T.group).add(g);
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
  const T = window.__title, game = T.game, R = game.renderer, r = R.renderer, cam = (game.overrideRig || game.rig).camera;
  const keep = new Set();
  for (const n of names) S.named[n]?.traverse((o) => keep.add(o));
  const scene = game.overrideScene || game.scene; // [v5] the dive scene renders through the override
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
  if (!game.overrideScene) scene.add(water);
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
