// Preview for src/entities/extra/woodGarageModel.js: three Wood Garages
// (stock 0 / 14 / 40, variants 0-2) on grass pads, plus loose ground logs
// (makeLogGeometry) for scale. Buttons add / remove logs on the middle one.
// URL flags: ?zoom=0.01 &yaw=deg &pitch=deg &still=1 (drive with window.__seek(t))
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { voxelMaterial } from '../src/core/voxel.js';
import { STRUCTURE_MODELS, makeLogGeometry } from '../src/entities/extra/woodGarageModel.js';

const params = new URLSearchParams(location.search);
const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(+(params.get('pitch') || 44));
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
const hemi = new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(-7, 12, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 50 });
scene.add(hemi, sun, sun.target);
const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 4), new THREE.MeshLambertMaterial({ color: 0x6aa040 }));
pad.position.y = -0.1; pad.receiveShadow = true;
scene.add(pad);
const garages = [0, 14, 40].map((n, i) => {
  const g = STRUCTURE_MODELS.woodgarage({ variant: i, seed: i + 1, stock: n, cap: 40 });
  g.position.set(-2.6 + i * 2.6, 0, -0.4);
  g.traverse((o) => { if (o.isMesh && !o.userData.glow) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  return { g, n };
});
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(makeLogGeometry({ len: 0.7, r: 2.6, variant: i }), voxelMaterial());
  m.position.set(-3 + i * 0.9, 0.13, 1.4 + (i % 2) * 0.2); m.rotation.y = i * 0.5; m.castShadow = m.receiveShadow = true;
  scene.add(m);
}
const mid = garages[1];
document.getElementById('add').onclick = () => { mid.n = Math.min(40, mid.n + 1); mid.g.userData.setStock(mid.n, 40); };
document.getElementById('sub').onclick = () => { mid.n = Math.max(0, mid.n - 5); mid.g.userData.setStock(mid.n, 40); };
let spin = false;
document.getElementById('rot').onclick = () => { spin = !spin; };
function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  rig.wupp = rig.wuppGoal = +(params.get('zoom') || 0) || 8.6 / pr.lowW;
  rig.target.set(0, 0.5, 0.2); rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = (+(params.get('yaw') || 0) * Math.PI) / 180;
}
addEventListener('resize', resize);
resize();
let time = 0;
function draw(dt) {
  for (const { g } of garages) g.userData.update?.(dt, time);
  rig.update(dt, pr);
  pr.render(scene, rig);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  time += dt;
  if (spin) rig.yawGoal += dt * 0.4;
  draw(dt);
  requestAnimationFrame(frame);
}
if (params.get('still') !== '1') requestAnimationFrame(frame);
else draw(0);
window.__seek = (t) => { const dt = t - time; time = t; draw(Math.max(0, dt)); return true; };
window.__garages = garages;
window.__ready = true;
