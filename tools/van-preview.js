// Moose Express van preview: the whole delivery routine in isolation.
//   ?t=8.5            jump to a moment of the routine (deterministic re-sim)   &freeze=1 stop there
//   ?zoom=close|mid|game  &yaw=20 &pitch=30   camera   &follow=0 keep the camera on the parking spot
//   ?mode=turntable&doors=1&yaw=...           static van (doors / ramp open)
//   ?cargo=crate      unload one big crate instead of three parcels
//   window.__seek(t), window.__step(dt), window.__state()
import * as THREE from 'three';
import { DeliveryVan, makeBigCrate } from '../src/entities/deliveryVan.js';
import * as M from '../src/entities/critters3d.js';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? +params.get(k) : d);
const mode = params.get('mode') || 'show';
const STEP = 1 / 60;

// ------------------------------------------------------------------ scene
const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
pr.pixelDensity = num('density', 1);
const cam = new CameraRig();
cam.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
cam.minWupp = 0.0003; cam.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc4e8);
const sun = new THREE.DirectionalLight(0xffe6c4, 2.35);
sun.position.set(4, 9, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
{
  const v = new VoxelModel();
  let a = 7;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let x = -90; x < 90; x++) for (let z = -70; z < 70; z++) { const h = rnd(); v.set(x, -1, z, h < 0.12 ? 0x78a441 : h > 0.9 ? 0x6a9438 : 0x6e993b); }
  for (let x = -90; x < 90; x++) for (let z = -6; z < 6; z++) if (Math.abs(z + Math.sin(x * 0.2) * 1.5) < 4) v.set(x, -1, z, rnd() < 0.2 ? 0xb8925a : 0xc8a066); // a dirt lane
  const m = new THREE.Mesh(v.build({ scale: 0.1 }), voxelMaterial());
  m.receiveShadow = true;
  scene.add(m);
}

// ------------------------------------------------------------------ routine
const v3 = (x, z) => new THREE.Vector3(x, 0, z);
const arrive = new THREE.CatmullRomCurve3([v3(-11, -5), v3(-7, -3.2), v3(-3.2, -0.6), v3(0, 0)]);
const depart = new THREE.CatmullRomCurve3([v3(0, 0), v3(2.6, 0.1), v3(5.5, -1.6), v3(9, -6)]);
const T_ARRIVE = 5.2, T_HONK = 5.5, T_OPEN = 6.2;

let W = null; // world state
function build() {
  if (W) {
    W.van.dispose(); W.rig?.dispose();
    for (const p of W.parcels) scene.remove(p.obj);
  }
  const van = new DeliveryVan();
  scene.add(van.root);
  const rig = M.MooseCourier ? new M.MooseCourier() : null;
  if (rig) van.setDriver(rig);
  const crate = params.get('cargo') === 'crate';
  const parcels = (crate ? [{ kind: 'live', tx: 0, tz: -2.6 }] : [{ kind: 'box', tx: -0.55, tz: -2.45 }, { kind: 'egg_crate', tx: 0.1, tz: -2.75 }, { kind: 'box', tx: 0.6, tz: -2.4 }]).map((d) => {
    const obj = d.kind === 'live' ? makeBigCrate('live') : M.makePackage(d.kind);
    if (d.kind !== 'live') obj.scale.setScalar(1.6);
    obj.visible = false;
    scene.add(obj);
    return { ...d, obj, t: -1, state: 'hold', base: obj.scale.x };
  });
  W = { van, rig, parcels, t: 0, phase: 'drive', next: 0, honked: false, closeT: -1, leaveT: -1, waved: false };
  placeOnCurve(arrive, 0);
  van.snap();
  van.update(0);
}
function placeOnCurve(curve, u) {
  const p = curve.getPointAt(Math.min(1, u)), tg = curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
  W.van.root.position.copy(p);
  W.van.root.rotation.y = Math.atan2(tg.x, tg.z);
}
const ease = (x) => 1 - (1 - x) * (1 - x);

function sim(dt) {
  const w = W, van = w.van;
  w.t += dt;
  const t = w.t;
  if (w.phase === 'drive') {
    placeOnCurve(arrive, ease(Math.min(1, t / T_ARRIVE)));
    if (t >= T_ARRIVE) w.phase = 'park';
  } else if (w.phase === 'park') {
    if (!w.honked && t >= T_HONK) { w.honked = true; van.honk(); }
    if (t >= T_OPEN) { w.phase = 'open'; van.openBack(); }
  } else if (w.phase === 'open') {
    if (van.backReady) { w.phase = 'unload'; w.next = t + 0.25; w.rig?.play('drive_look', { fade: 0.3 }); }
  } else if (w.phase === 'unload') {
    const p = w.parcels.find((q) => q.state === 'hold');
    if (p && t >= w.next) { p.state = 'slide'; p.t = 0; p.obj.visible = true; w.next = t + 0.6; }
    if (!p && w.parcels.every((q) => q.state === 'rest') && w.closeT < 0) w.closeT = t + 0.4;
    if (w.closeT > 0 && t >= w.closeT) { w.phase = 'close'; van.closeBack(); w.rig?.play('drive', { fade: 0.3 }); }
  } else if (w.phase === 'close') {
    if (van.backShut) { w.phase = 'bye'; w.leaveT = t + 2.4; van.honk(); }
  } else if (w.phase === 'bye') {
    if (!w.waved && t > w.leaveT - 1.7) { w.waved = true; w.rig?.play('drive_wave', { fade: 0.2 }); }
    if (t >= w.leaveT) { w.phase = 'leave'; w.leaveStart = t; }
  } else if (w.phase === 'leave') {
    const u = (t - w.leaveStart) / 4.5;
    placeOnCurve(depart, Math.min(1, u * u));
  }
  for (const p of w.parcels) {
    if (p.state === 'slide') {
      p.t += dt;
      const k = Math.min(1, p.t / 1.0);
      van.unloadPoint(k, p.tx, p.tz, p.obj.position);
      p.obj.rotation.y = van.root.rotation.y + (1 - k) * 0.3 * Math.sign(p.tx || 1);
      p.obj.rotation.x = k > 0.3 && k < 0.62 ? -0.55 : 0;
      if (k >= 1) { p.state = 'land'; p.t = 0; }
    } else if (p.state === 'land') {
      p.t += dt;
      const s = 1 + Math.sin(p.t * 18) * 0.22 * Math.max(0, 1 - p.t * 2.2);
      p.obj.scale.set(p.base / Math.sqrt(s), p.base * s, p.base / Math.sqrt(s));
      if (p.t > 0.6) { p.state = 'rest'; p.obj.scale.setScalar(p.base); }
    }
  }
  van.update(dt);
}
function seek(t) { build(); while (W.t < t - 1e-6) sim(Math.min(STEP, t - W.t)); }

// ------------------------------------------------------------------ camera
const cams = {
  close: { wupp: 0.0075, y: 0.9, pitch: 26 },
  mid: { wupp: 0.012, y: 0.7, pitch: 34 },
  game: { wupp: 0.026, y: 0.3, pitch: 44 },
  far: { wupp: 0.04, y: 0.3, pitch: 44 },
};
const cfg = cams[params.get('zoom')] || cams.mid;
cam.wupp = cam.wuppGoal = num('wupp', cfg.wupp);
cam.pitch = THREE.MathUtils.degToRad(num('pitch', cfg.pitch));
cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 0));
cam.target.y = cam.goal.y = num('cy', cfg.y);
cam.goal.set(num('cx', -0.8), cam.goal.y, num('cz', -0.6));
cam.target.copy(cam.goal);
const follow = params.get('follow') === '1';

if (mode === 'turntable') {
  build();
  W.phase = 'still';
  W.van.root.position.set(0, 0, 0);
  W.van.root.rotation.y = THREE.MathUtils.degToRad(num('vyaw', 90));
  W.van.snap();
  if (params.get('doors') === '1') W.van.openBack();
  for (let i = 0; i < 200; i++) W.van.update(STEP);
  W.sim = false;
} else {
  seek(num('t', 0));
}

// ------------------------------------------------------------------ ui + loop
const bar = document.getElementById('bar');
const btn = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; bar.appendChild(b); };
btn('⟲ replay', () => seek(0));
for (const t of [3, 6.5, 8.5, 10.5, 13, 16]) btn(t + 's', () => seek(t));
btn('crate', () => { location.search = 'cargo=crate'; });
btn('close', () => { cam.wuppGoal = cams.close.wupp; });
btn('game zoom', () => { cam.wuppGoal = cams.game.wupp; });
btn('⟳ 45°', () => { cam.yawGoal -= Math.PI / 4; });
const labelEl = document.getElementById('label');
let frozen = params.get('freeze') === '1';
window.__seek = (t) => { if (mode !== 'turntable') seek(t); frozen = true; return W.phase; };
window.__step = (dt = STEP) => { let left = dt; while (left > 1e-6) { const h = Math.min(STEP, left); sim(h); left -= h; } return W.phase; };
window.__state = () => ({ t: +W.t.toFixed(2), phase: W.phase, doors: +W.van.doorT.toFixed(2), ramp: +W.van.rampT.toFixed(2), speed: +W.van.speed.toFixed(2), driver: W.rig?.current });

function resize() {
  const w = innerWidth, h = innerHeight;
  pr.resize(w, h, Math.min(2, devicePixelRatio || 1));
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
}
addEventListener('resize', resize);
resize();
let last = performance.now(), acc = 0;
function frame(now) {
  const real = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!frozen && mode !== 'turntable') {
    acc += real;
    let n = 0;
    while (acc >= STEP && n < 8) { acc -= STEP; n++; sim(STEP); }
    if (acc > STEP * 8) acc = 0;
  }
  if (follow) { cam.goal.x = W.van.root.position.x; cam.goal.z = W.van.root.position.z; }
  cam.update(frozen ? 1 : real, pr);
  pr.render(scene, cam);
  labelEl.innerHTML = `Moose Express van<small>${W.phase} · ${W.t.toFixed(1)}s · ${W.rig?.current || ''}</small>`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
