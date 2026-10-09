// Stand-alone preview for the v26 evening pieces: Reynard's room with the home
// office (src/entities/bedroomScene.js + foxOffice.js), the fox rig in it.
//   window.__ev.shot('camOffice')  frame an anchor and render
//   window.__ev.fox / room / rig / step(sec)
import * as THREE from 'three';
import '../src/ui/fonts.css';
import '../src/ui/style.css';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { buildBedroom } from '../src/entities/bedroomScene.js';
import { FoxRig } from '../src/entities/foxRig.js';

const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
const rig = new CameraRig();
rig.freeBounds = true;
const room = buildBedroom();
const scene = new THREE.Scene();
scene.background = new THREE.Color(room.background);
scene.add(room.group);
const fox = new FoxRig({ shadows: true });
scene.add(fox.root);
const seat = room.anchors.seat;
fox.root.position.copy(seat.position);
fox.root.rotation.y = seat.rotationY;
fox.play('sit_type', { fade: 0 });

function resize() { pr.resize(innerWidth, innerHeight, 1); }
addEventListener('resize', resize);
resize();

let time = 0;
function frameAnchor(name) {
  const a = room.anchors[name];
  if (!a) return;
  const wupp = Math.max(a.fit.w / Math.max(1, pr.lowW), a.fit.h / Math.max(1, pr.lowH));
  rig.goal.copy(a.target); rig.target.copy(a.target);
  rig.wuppGoal = rig.wupp = wupp;
  rig.yawGoal = rig.yaw = a.yaw || 0;
  rig.pitchGoal = rig.pitch = a.pitch;
  rig.minWupp = 0.0003; rig.maxWupp = 1;
}
function step(sec, dt = 1 / 30) {
  for (let t = 0; t < sec - 1e-6; t += dt) {
    time += dt;
    fox.update(dt);
    room.update(dt, time);
  }
  rig.update(0.016, pr);
  pr.render(scene, rig);
}
frameAnchor('camRoom');
step(0.1);

window.__ev = {
  THREE, pr, rig, room, fox, scene, step, frameAnchor,
  shot(name, sec = 0.2) { frameAnchor(name); step(sec); },
};
