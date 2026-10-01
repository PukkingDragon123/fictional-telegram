// Preview for src/entities/decorModels.js: every decor model on its own tile
// (water types on a water tile), animated parts running.
// URL flags: ?night=1  &only=type,type  &zoom=0.02  &yaw=deg  &cols=7
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { voxelMaterial } from '../src/core/voxel.js';
import { decorModel, DECOR_TYPES, WATER_DECOR } from '../src/entities/decorModels.js';

const params = new URLSearchParams(location.search);
const types = params.get('only') ? params.get('only').split(',') : DECOR_TYPES;
const COLS = +(params.get('cols') || Math.min(7, types.length));
const GAP = +(params.get("gap") || 2);
const DEPTH = 10;

const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(40);
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);

const hemi = new THREE.HemisphereLight(0xfff0dc, 0x5a6a8a, 1.3);
const sun = new THREE.DirectionalLight(0xffe0b8, 2.0);
sun.position.set(-6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 40 });
scene.add(hemi, sun, sun.target);

const mat = voxelMaterial();
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const grassMat = new THREE.MeshLambertMaterial({ color: 0x6aa040 });
const dirtMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
const sandMat = new THREE.MeshLambertMaterial({ color: 0xc8b080 });
const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a8ac0, transparent: true, opacity: 0.55, depthWrite: false });

const B = { pivot: [0.5, 0, 0.5], scale: 0.1 };
const animated = [];
const labels = [];
const rows = Math.ceil(types.length / COLS);
types.forEach((type, i) => {
  const cx = ((i % COLS) - (COLS - 1) / 2) * GAP;
  const cz = (Math.floor(i / COLS) - (rows - 1) / 2) * GAP;
  const water = WATER_DECOR.has(type);
  const tile = new THREE.Group();
  tile.position.set(cx, 0, cz);
  scene.add(tile);
  // ground / water tile
  if (water) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), sandMat);
    floor.position.y = -DEPTH * 0.1 - 0.05; floor.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.3, DEPTH * 0.1 + 0.1, 1.3), dirtMat);
    rim.position.y = -DEPTH * 0.05 - 0.06; rim.scale.set(1, 1, 1);
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 1.2), waterMat);
    w.position.y = -0.01; w.renderOrder = 2;
    tile.add(floor, w);
  } else {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 1.2), grassMat);
    g.position.y = -0.1; g.receiveShadow = true;
    tile.add(g);
  }
  const m = decorModel(type, { seed: i + 1, depth: DEPTH });
  const root = new THREE.Group();
  if (water) root.position.y = -DEPTH * 0.1;
  tile.add(root);
  const mesh = (vm, material, pivot = B.pivot) => {
    const me = new THREE.Mesh(vm.build({ pivot, scale: 0.1 }), material);
    me.castShadow = material === mat; me.receiveShadow = material === mat;
    return me;
  };
  root.add(mesh(m.body, mat));
  if (m.glow) root.add(mesh(m.glow, glowMat));
  for (const p of m.parts || []) {
    const holder = new THREE.Group();
    holder.position.set((p.pivot[0] - 0.5) * 0.1, p.pivot[1] * 0.1, (p.pivot[2] - 0.5) * 0.1);
    if (p.model) holder.add(mesh(p.model, mat, p.pivot));
    if (p.glow) holder.add(mesh(p.glow, glowMat, p.pivot));
    root.add(holder);
    animated.push({ p, holder, base: holder.position.clone() });
  }
  const el = document.createElement('div');
  el.textContent = type;
  document.getElementById('labels').appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(cx, -0.1, cz + 0.62) });
});

function animate(time) {
  for (const { p, holder, base } of animated) {
    const t = time * (p.speed || 1) + (p.phase || 0);
    const ax = p.axis || (p.anim === 'rotateY' ? 'y' : 'z');
    holder.rotation.set(0, 0, 0); holder.scale.set(1, 1, 1); holder.position.copy(base);
    if (p.anim === 'spin' || p.anim === 'rotateY') holder.rotation[ax] = t;
    else if (p.anim === 'sway') holder.rotation[ax] = Math.sin(t) * 0.15;
    else if (p.anim === 'wave') { holder.rotation.y = Math.sin(t) * 0.18; holder.scale.x = 1 - Math.abs(Math.sin(t * 0.7)) * 0.08; }
    else if (p.anim === 'bob') { holder.position.y = base.y + Math.sin(t) * 0.03; holder.rotation.z = Math.sin(t * 0.8) * 0.06; }
    else if (p.anim === 'flicker') { const f = Math.sin(t) * 0.5 + Math.sin(t * 2.3 + 1) * 0.3; holder.scale.set(1 - f * 0.05, 1 + f * 0.15, 1 - f * 0.05); }
  }
}

let night = params.get('night') === '1';
function setNight(v) {
  night = v;
  hemi.intensity = v ? 0.35 : 1.3; sun.intensity = v ? 0.35 : 2.0;
  hemi.color.set(v ? 0x8a9ad8 : 0xfff0dc); sun.color.set(v ? 0x9ab0ff : 0xffe0b8);
  scene.background.set(v ? 0x141828 : 0x2a3a2a);
}
setNight(night);
document.getElementById('night').onclick = () => setNight(!night);
let spin = false;
document.getElementById('rot').onclick = () => { spin = !spin; };

const extentW = COLS * GAP, extentH = rows * GAP * Math.sin(rig.pitch) + 1.4;
function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  const z = +(params.get('zoom') || 0) || Math.max(extentW / pr.lowW, extentH / pr.lowH) * 1.05;
  rig.wupp = rig.wuppGoal = z;
  rig.target.set(0, 0.3, 0); rig.goal.copy(rig.target);
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
window.__decor = { scene, rig, pr, animate };
