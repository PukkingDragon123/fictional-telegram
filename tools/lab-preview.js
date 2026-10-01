// Preview for src/entities/labScene.js: renders Reynard's lab through the
// game's PixelRenderer with a stand-in capsule for the fox.
// URL flags: ?cam=overview|screen|fox  &night=1  &bed=1  &yaw=0  &density=1
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { buildLab, LAB_BACKGROUND, FOX_SEAT_HEIGHT } from '../src/entities/labScene.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
pr.pixelDensity = +(params.get('density') || 1);
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(40);

const scene = new THREE.Scene();
scene.background = new THREE.Color(LAB_BACKGROUND);
const lab = buildLab();
scene.add(lab.group);

// ---- stand-in fox: orange capsule with a top hat and a nose showing its facing
const fox = new THREE.Group();
{
  const orange = new THREE.MeshLambertMaterial({ color: 0xe0662a });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), orange);
  body.position.y = FOX_SEAT_HEIGHT + 0.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), orange);
  head.position.set(0, FOX_SEAT_HEIGHT + 0.85, 0.02);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0xf6ead8 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, FOX_SEAT_HEIGHT + 0.82, 0.25);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 10), new THREE.MeshLambertMaterial({ color: 0x151518 }));
  hat.position.set(0, FOX_SEAT_HEIGHT + 1.12, 0);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), hat.material);
  brim.position.set(0, FOX_SEAT_HEIGHT + 1.0, 0);
  for (const m of [body, head, nose, hat, brim]) { m.castShadow = true; m.receiveShadow = true; fox.add(m); }
  lab.group.add(fox);
}
let inBed = params.get('bed') === '1';
function placeFox() {
  const a = inBed ? lab.anchors.foxBed : lab.anchors.foxSeat;
  fox.position.copy(a.position);
  fox.rotation.set(0, a.rotationY, 0);
  if (inBed) {
    // lying down: tip the stand-in over onto its side along its facing
    fox.position.y -= FOX_SEAT_HEIGHT - 0.12;
    fox.rotation.set(Math.PI / 2, a.rotationY, 0, 'YXZ');
  }
  document.getElementById('bed').textContent = inBed ? 'Fox: bed' : 'Fox: desk';
}
placeFox();

// ---- camera anchors
let useYaw = params.get('yaw') !== '0';
let current = 'camOverview';
const camMap = { overview: 'camOverview', screen: 'camScreen', fox: 'camFox' };
if (params.get('cam')) current = camMap[params.get('cam')] || current;
// debug: ?focus=x,y,z,height  frames an arbitrary spot (height = world units visible vertically)
if (params.get('focus')) {
  const [x, y, z, h] = params.get('focus').split(',').map(Number);
  lab.anchors.camDebug = { target: new THREE.Vector3(x, y, z), fit: { w: h * 1.78, h }, yaw: +(params.get('yawdeg') || 0) * Math.PI / 180 };
  current = 'camDebug';
}
const goal = { target: new THREE.Vector3(), wupp: 0.02, yaw: 0 };
function wuppFor(a) {
  return Math.max(a.fit.w / pr.lowW, a.fit.h / pr.lowH);
}
function setCam(name, instant = false) {
  current = name;
  const a = lab.anchors[name];
  goal.target.copy(a.target);
  goal.wupp = wuppFor(a);
  goal.yaw = useYaw ? a.yaw || 0 : 0;
  if (instant) {
    rig.target.copy(goal.target); rig.goal.copy(goal.target);
    rig.wupp = rig.wuppGoal = goal.wupp;
    rig.yaw = rig.yawGoal = goal.yaw;
  }
  for (const b of document.querySelectorAll('[data-cam]')) b.classList.toggle('on', b.dataset.cam === name);
}

let night = params.get('night') === '1';
lab.setNight(night);
document.getElementById('night').classList.toggle('on', night);

function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  setCam(current, true);
}
addEventListener('resize', resize);
resize();

for (const b of document.querySelectorAll('[data-cam]')) b.onclick = () => setCam(b.dataset.cam);
document.getElementById('night').onclick = (e) => { night = !night; lab.setNight(night); e.target.classList.toggle('on', night); };
document.getElementById('bed').onclick = () => { inBed = !inBed; placeFox(); };
document.getElementById('yaw').onclick = (e) => { useYaw = !useYaw; e.target.textContent = 'Yaw hints: ' + (useYaw ? 'on' : 'off'); setCam(current); };

let tris = 0;
lab.group.traverse((o) => { if (o.isMesh && o.geometry.index) tris += o.geometry.index.count / 3; });
const info = document.getElementById('info');

let last = performance.now();
let time = +(params.get('t') || 0);
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  time += dt;
  // ease camera toward the goal (rig.update handles x/z damping, we do y, zoom and yaw)
  rig.goal.x = goal.target.x; rig.goal.z = goal.target.z;
  rig.target.y += (goal.target.y - rig.target.y) * (1 - Math.exp(-8 * dt));
  rig.wuppGoal = goal.wupp;
  rig.yawGoal = goal.yaw;
  lab.update(dt, time);
  lab.drawIdleScreen(time);
  rig.update(dt, pr);
  pr.render(scene, rig);
  info.textContent = `build ${lab.group.userData.buildMs.toFixed(0)} ms | ${Math.round(tris / 1000)}k tris | low-res ${pr.lowW}x${pr.lowH} | zoom ${(rig.wupp * 100).toFixed(3)}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__lab = { lab, rig, pr, scene, setCam, fox, THREE, goal, setNight: (v) => { night = v; lab.setNight(v); } };
