// Preview for src/entities/landmarkModels.js + restaurantModels.js: every model
// on a grass pad sized to its footprint, animated parts running, seat markers.
// URL flags: ?set=landmark|restaurant  &night=1  &only=type,type  &zoom=0.02  &yaw=deg  &row=12  &seats=1
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { voxelMaterial } from '../src/core/voxel.js';
import { landmarkModel, LANDMARK_TYPES } from '../src/entities/landmarkModels.js';
import { restaurantModel, RESTAURANT_TYPES } from '../src/entities/restaurantModels.js';

const params = new URLSearchParams(location.search);
const SET = params.get('set') || 'landmark';
const build = SET === 'restaurant' ? restaurantModel : landmarkModel;
const types = params.get('only') ? params.get('only').split(',') : SET === 'restaurant' ? RESTAURANT_TYPES : LANDMARK_TYPES;
const ROW = +(params.get('row') || (SET === 'restaurant' ? 12 : 11));
const GAP = 1;

const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(44);
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);

const hemi = new THREE.HemisphereLight(0xfff0dc, 0x5a6a8a, 1.3);
const sun = new THREE.DirectionalLight(0xffe0b8, 2.0);
sun.position.set(-8, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 60 });
scene.add(hemi, sun, sun.target);

const mat = voxelMaterial();
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const grassMat = new THREE.MeshLambertMaterial({ color: 0x6aa040 });
const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a8ac0, transparent: true, opacity: 0.6, depthWrite: false });
const seatMat = new THREE.MeshBasicMaterial({ color: 0xff40c0 });

// shelf-pack the models into rows (tile units)
const built = types.map((type, i) => ({ type, m: build(type, { seed: i + 1 }) })).filter((b) => b.m);
const rowsArr = [];
let cur = { items: [], w: 0, d: 0 };
for (const b of built) {
  const fp = b.m.footprint || { w: 1, d: 1 };
  if (cur.items.length && cur.w + fp.w > ROW) { rowsArr.push(cur); cur = { items: [], w: 0, d: 0 }; }
  cur.items.push(b); cur.w += fp.w + GAP; cur.d = Math.max(cur.d, fp.d);
}
if (cur.items.length) rowsArr.push(cur);
const totalD = rowsArr.reduce((s, r) => s + r.d + GAP, -GAP);
const maxW = Math.max(...rowsArr.map((r) => r.w - GAP));

const animated = [];
const labels = [];
const seatMarkers = [];
let maxH = 0;
let zc = -totalD / 2;
for (const row of rowsArr) {
  let xc = -(row.w - GAP) / 2;
  for (const { type, m } of row.items) {
    const fp = m.footprint || { w: 1, d: 1 };
    const cx = xc + fp.w / 2, cz = zc + row.d - fp.d / 2; // align rows at the front
    xc += fp.w + GAP;
    const tile = new THREE.Group();
    tile.position.set(cx, 0, cz);
    scene.add(tile);
    const water = type === 'dock' || type === 'riverbridge';
    if (water) {
      // land at the ends, water under the middle tile(s)
      const landD = type === 'dock' ? 1 : 1;
      const mk = (d, z, mtl, h = 0.2) => { const g = new THREE.Mesh(new THREE.BoxGeometry(fp.w + 0.1, h, d), mtl); g.position.set(0, -h / 2, z); g.receiveShadow = true; tile.add(g); };
      mk(landD, -fp.d / 2 + landD / 2, grassMat);
      if (type === 'riverbridge') mk(landD, fp.d / 2 - landD / 2, grassMat);
      const wd = type === 'dock' ? fp.d - landD + 0.6 : fp.d - 2;
      const wz = type === 'dock' ? -fp.d / 2 + landD + wd / 2 : 0;
      const w = new THREE.Mesh(new THREE.BoxGeometry(fp.w + 1.2, 0.02, wd), waterMat);
      w.position.set(0, -0.25, wz); w.renderOrder = 2; tile.add(w);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(fp.w + 1.2, 0.1, wd), new THREE.MeshLambertMaterial({ color: 0x7a6a4a }));
      bed.position.set(0, -0.85, wz); tile.add(bed);
    } else {
      const g = new THREE.Mesh(new THREE.BoxGeometry(fp.w + 0.1, 0.2, fp.d + 0.1), grassMat);
      g.position.y = -0.1; g.receiveShadow = true;
      tile.add(g);
    }
    const mesh = (vm, material, pivot = [0.5, 0, 0.5]) => {
      const me = new THREE.Mesh(vm.build({ pivot, scale: 0.1 }), material);
      me.castShadow = material === mat; me.receiveShadow = material === mat;
      return me;
    };
    tile.add(mesh(m.body, mat));
    if (m.glow) tile.add(mesh(m.glow, glowMat));
    maxH = Math.max(maxH, (m.body.maxY + 1) * 0.1);
    for (const p of m.parts || []) {
      const holder = new THREE.Group();
      holder.position.set((p.pivot[0] - 0.5) * 0.1, p.pivot[1] * 0.1, (p.pivot[2] - 0.5) * 0.1);
      if (p.model) holder.add(mesh(p.model, mat, p.pivot));
      if (p.glow) holder.add(mesh(p.glow, glowMat, p.pivot));
      tile.add(holder);
      animated.push({ p, holder, base: holder.position.clone() });
    }
    for (const s of m.seats || []) {
      const mk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), seatMat);
      mk.rotation.x = Math.PI / 2; // point along the facing direction
      const g = new THREE.Group();
      g.position.set(s.x, (s.y || 0) + 0.05, s.z);
      g.rotation.y = s.yaw;
      g.add(mk);
      tile.add(g);
      seatMarkers.push(g);
    }
    const el = document.createElement('div');
    el.textContent = `${type} ${fp.w}x${fp.d}`;
    document.getElementById('labels').appendChild(el);
    labels.push({ el, pos: new THREE.Vector3(cx, -0.1, cz + fp.d / 2 + 0.05) });
  }
  zc += row.d + GAP;
}

// noise helper for buzzy neon
const hashN = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
function animate(time) {
  for (const { p, holder, base } of animated) {
    const t = time * (p.speed || 1) + (p.phase || 0);
    const ax = p.axis || (p.anim === 'rotateY' ? 'y' : 'z');
    holder.rotation.set(0, 0, 0); holder.scale.set(1, 1, 1); holder.position.copy(base); holder.visible = true;
    const amp = p.amp ?? 1;
    if (p.anim === 'spin' || p.anim === 'rotateY') holder.rotation[ax] = t;
    else if (p.anim === 'sway') holder.rotation[ax] = Math.sin(t) * 0.15 * amp;
    else if (p.anim === 'wave') { holder.rotation.y = Math.sin(t) * 0.18; holder.scale.x = 1 - Math.abs(Math.sin(t * 0.7)) * 0.08; }
    else if (p.anim === 'bob') { holder.position.y = base.y + Math.sin(t) * 0.03 * amp; holder.rotation.z = Math.sin(t * 0.8) * 0.06 * amp; }
    else if (p.anim === 'flicker') { const f = Math.sin(t) * 0.5 + Math.sin(t * 2.3 + 1) * 0.3; holder.scale.set(1 - f * 0.05, 1 + f * 0.15, 1 - f * 0.05); }
    else if (p.anim === 'blink') { const k = Math.floor(t * 8); holder.visible = !(hashN(k) < 0.12 || (hashN(Math.floor(t * 0.5)) < 0.2 && k % 2)); }
  }
}

let night = params.get('night') === '1';
function setNight(v) {
  night = v;
  hemi.intensity = v ? 0.35 : 1.3; sun.intensity = v ? 0.35 : 2.0;
  hemi.color.set(v ? 0x8a9ad8 : 0xfff0dc); sun.color.set(v ? 0x9ab0ff : 0xffe0b8);
  scene.background.set(v ? 0x141828 : 0x2a3a2a);
  document.getElementById('day').classList.toggle('on', !v);
  document.getElementById('night').classList.toggle('on', v);
}
setNight(night);
document.getElementById('day').onclick = () => setNight(false);
document.getElementById('night').onclick = () => setNight(true);
const go = (set) => { params.set('set', set); params.delete('only'); location.search = params.toString(); };
document.getElementById('setL').onclick = () => go('landmark');
document.getElementById('setR').onclick = () => go('restaurant');
document.getElementById(SET === 'restaurant' ? 'setR' : 'setL').classList.add('on');
let showSeats = params.get('seats') !== '0';
const applySeats = () => { for (const s of seatMarkers) s.visible = showSeats; document.getElementById('seats').classList.toggle('on', showSeats); };
applySeats();
document.getElementById('seats').onclick = () => { showSeats = !showSeats; applySeats(); };
let spin = false;
document.getElementById('rot').onclick = () => { spin = !spin; };

function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  const extentW = maxW + 0.6, extentH = totalD * Math.sin(rig.pitch) + maxH * Math.cos(rig.pitch) + 0.8;
  const z = +(params.get('zoom') || 0) || Math.max(extentW / pr.lowW, extentH / pr.lowH) * 1.2;
  rig.wupp = rig.wuppGoal = z;
  rig.target.set(0, maxH * 0.5, 0); rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = (+(params.get('yaw') || 0) * Math.PI) / 180;
}
addEventListener('resize', resize);
resize();

const v = new THREE.Vector3();
let last = performance.now(), time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (spin) rig.yawGoal += dt * 0.4;
  animate(time);
  rig.update(dt, pr);
  pr.render(scene, rig);
  for (const l of labels) {
    v.copy(l.pos).project(rig.camera);
    l.el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
    l.el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__lm = { scene, rig, pr, animate };
