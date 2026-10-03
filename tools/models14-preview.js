// Preview for the v14 build models (src/entities/extra/facilityModels.js +
// woodworkModels.js): every model on a grass pad sized to its footprint, next to
// the restaurant picnic table and the decor gnome for scale. Animated parts run
// through root.userData.update(dt, t).
// URL flags: ?only=type,type  &cols=8  &zoom=0.02  &yaw=deg  &pitch=deg  &night=1
//            &still=1 (no RAF loop; drive with window.__seek(t))  &refs=0 (hide scale refs)
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { voxelMaterial } from '../src/core/voxel.js';
import { restaurantModel } from '../src/entities/restaurantModels.js';
import { decorModel } from '../src/entities/decorModels.js';

const mods = import.meta.glob('../src/entities/extra/*Models.js', { eager: true });
const MODELS = {};
const FOOT = {};
for (const m of Object.values(mods)) {
  Object.assign(MODELS, m.STRUCTURE_MODELS || {});
  Object.assign(FOOT, m.FACILITY_FOOTPRINTS || {}, m.WOODWORK_FOOTPRINTS || {});
}
const params = new URLSearchParams(location.search);
const ORDER = [
  'tipjar', 'pricesign', 'waitbench', 'stressbin', 'prboard', 'franchise',
  'tagrack', 'feedsilo', 'shovelshed', 'whispershell', 'toolbox', 'gearstation', 'beaverbed',
  'wd_stool', 'wd_table', 'wd_bench', 'wd_rocker', 'wd_shelf', 'wd_barrel', 'wd_crate', 'wd_planter', 'wd_birdhouse', 'wd_arch',
  'an_chair', 'an_table', 'an_clock', 'an_lamp', 'an_cart',
];
let types = params.get('only') ? params.get('only').split(',') : ORDER.filter((t) => MODELS[t]);
const refs = params.get('refs') !== '0';
if (refs) types = ['@picnic', '@gnome', ...types];
const ROW_W = +(params.get('cols') || 9); // row width in tiles (approx)
const GAP = +(params.get('gap') || 0.8);
const ROW_GAP = +(params.get('rowgap') || 1.3); // extra depth between rows so tall builds don't hide the next row

const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(+(params.get('pitch') || 44));
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
// same light rig as world/sky.js in the afternoon
const hemi = new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(-7, 12, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 50 });
scene.add(hemi, sun, sun.target);

const grassMat = new THREE.MeshLambertMaterial({ color: 0x6aa040 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function refModel(kind) {
  const g = new THREE.Group();
  const m = kind === '@picnic' ? restaurantModel('picnictable', { seed: 1 }) : decorModel('gnome', { seed: 1 });
  const add = (vm, mat) => { const me = new THREE.Mesh(vm.build({ pivot: [0.5, 0, 0.5], scale: 0.1 }), mat); me.castShadow = me.receiveShadow = mat !== glowMat; g.add(me); };
  add(m.body, voxelMaterial());
  if (m.glow) add(m.glow, glowMat);
  return { root: g, fp: kind === '@picnic' ? { w: 2, d: 1 } : { w: 1, d: 1 }, label: kind === '@picnic' ? 'picnic table (ref)' : 'gnome (ref)' };
}

// flow the tiles into rows
const items = [];
let cx = 0, cz = 0, rowD = 0;
const rows = [];
let row = [];
for (const t of types) {
  const fp = t.startsWith('@') ? (t === '@picnic' ? { w: 2, d: 1 } : { w: 1, d: 1 }) : FOOT[t] || { w: 1, d: 1 };
  if (cx > 0 && cx + fp.w > ROW_W) { rows.push({ row, w: cx - GAP, d: rowD }); row = []; cx = 0; rowD = 0; }
  row.push({ t, fp, x: cx });
  cx += fp.w + GAP; rowD = Math.max(rowD, fp.d);
}
if (row.length) rows.push({ row, w: cx - GAP, d: rowD });
const totalD = rows.reduce((s, r) => s + r.d + ROW_GAP, -ROW_GAP);
const totalW = Math.max(...rows.map((r) => r.w));
const labels = [];
for (const r of rows) {
  for (const it of r.row) {
    const x = it.x - r.w / 2 + it.fp.w / 2;
    const z = cz - totalD / 2 + r.d / 2;
    const tile = new THREE.Group();
    tile.position.set(x, 0, z);
    scene.add(tile);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(it.fp.w + 0.1, 0.2, it.fp.d + 0.1), grassMat);
    pad.position.y = -0.1; pad.receiveShadow = true;
    tile.add(pad);
    let root, label = it.t;
    if (it.t.startsWith('@')) { const rm = refModel(it.t); root = rm.root; label = rm.label; }
    else {
      try { root = MODELS[it.t]({ variant: +(params.get('variant') || 0), seed: items.length + 1, preview: false }); } catch (e) { console.error(it.t, e); root = new THREE.Group(); label += ' (ERR)'; }
      root.traverse((o) => { if (o.isMesh && !o.userData.glow && !o.userData.glass) { o.castShadow = true; o.receiveShadow = true; } });
    }
    tile.add(root);
    // ?seats=1: a little red cone at every seat (tip = seat surface, pointing the way the bear faces)
    if (params.get('seats') === '1') for (const st of root.userData?.seats || []) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0xff3050 }));
      m.position.set(st.x, st.y + 0.06, st.z); m.rotation.x = Math.PI; tile.add(m);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), m.material);
      a.position.set(st.x + Math.sin(st.yaw) * 0.08, st.y + 0.13, st.z + Math.cos(st.yaw) * 0.08); a.rotation.y = st.yaw; tile.add(a);
    }
    items.push({ t: it.t, root });
    const el = document.createElement('div');
    el.textContent = label;
    if (it.t.startsWith('@')) el.className = 'ref';
    document.getElementById('labels').appendChild(el);
    labels.push({ el, pos: new THREE.Vector3(x, -0.1, z + it.fp.d / 2 + 0.12) });
  }
  cz += r.d + ROW_GAP;
}

let night = params.get('night') === '1';
function setNight(v) {
  night = v;
  hemi.intensity = v ? 0.35 : 1.1; sun.intensity = v ? 0.35 : 2.4;
  hemi.color.set(v ? 0x8a9ad8 : 0xc4dcff); sun.color.set(v ? 0x9ab0ff : 0xfff4e0);
  scene.background.set(v ? 0x141828 : 0x2a3a2a);
}
setNight(night);
document.getElementById('night').onclick = () => setNight(!night);
let spin = false, paused = false;
document.getElementById('rot').onclick = () => { spin = !spin; };
document.getElementById('pause').onclick = () => { paused = !paused; };

function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  // fit the real bounds (screen-up = (0, cos p, -sin p) at yaw 0)
  const b = new THREE.Box3();
  for (const it of items) b.expandByObject(it.root);
  b.expandByPoint(new THREE.Vector3(-totalW / 2, 0, -totalD / 2)).expandByPoint(new THREE.Vector3(totalW / 2, 0, totalD / 2 + 0.4));
  const cp = Math.cos(rig.pitch), sp = Math.sin(rig.pitch);
  let lo = Infinity, hi = -Infinity;
  for (const y of [b.min.y, b.max.y]) for (const zz of [b.min.z, b.max.z]) { const s = y * cp - zz * sp; lo = Math.min(lo, s); hi = Math.max(hi, s); }
  const extH = hi - lo;
  const z = +(params.get('zoom') || 0) || Math.max((totalW + 0.6) / pr.lowW, extH / pr.lowH) * 1.06;
  rig.wupp = rig.wuppGoal = z;
  // put the middle of that screen extent at the centre: move the target along screen-up
  const mid = (lo + hi) / 2;
  rig.target.set(0, mid * cp, -mid * sp); rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = (+(params.get('yaw') || 0) * Math.PI) / 180;
}
addEventListener('resize', resize);
resize();

const v = new THREE.Vector3();
let time = 0;
function draw(dt) {
  for (const it of items) it.root.userData.update?.(dt, time);
  rig.update(dt, pr);
  pr.render(scene, rig);
  for (const l of labels) {
    v.copy(l.pos).project(rig.camera);
    l.el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
    l.el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
  }
}
const still = params.get('still') === '1';
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!paused) time += dt;
  if (spin) rig.yawGoal += dt * 0.4;
  draw(dt);
  requestAnimationFrame(frame);
}
if (!still) requestAnimationFrame(frame);
else draw(0);
window.__seek = (t) => { time = t; draw(0); return true; };
window.__models14 = { scene, rig, pr, items, MODELS };
window.__ready = true;
