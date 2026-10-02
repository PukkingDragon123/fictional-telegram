// Stand-alone preview for src/game/Classroom.js with a minimal fake game.
// Buttons play each lesson. URL flags: ?lesson=breeding (auto-start)
// &manual=1 (no real-time loop: drive with window.__step(sec, dt) for screenshots)
// &night=1.
import * as THREE from 'three';
import '../src/ui/fonts.css';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import audio from '../src/audio/audio.js';
import { Classroom, LESSON_IDS } from '../src/game/Classroom.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
const baseRig = new CameraRig();
baseRig.freeBounds = true;
baseRig.goal.set(0, 0, 0); baseRig.target.set(0, 0, 0); baseRig.wupp = baseRig.wuppGoal = 0.02;

// "the game" behind the classroom: a little pond so enter/leave is visible
const base = new THREE.Scene();
base.background = new THREE.Color(0x86c6e8);
base.add(new THREE.HemisphereLight(0xffffff, 0x446644, 2));
const grass = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0x6aa84a }));
grass.position.y = -0.2; base.add(grass);
const pond = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.05, 24), new THREE.MeshLambertMaterial({ color: 0x3a8ad8 }));
pond.position.y = 0.01; base.add(pond);

const game = {
  renderer: pr, rig: baseRig, audio, ui: null,
  state: { paused: false, hour: 10.5, phase: 'day' },
  inputLocked: false, overrideScene: null, overrideRig: null,
};
const cls = new Classroom(game);
const manual = params.get('manual') === '1';
if (manual) cls.selfDrive = false;

const bar = document.getElementById('bar');
for (const id of LESSON_IDS) {
  const b = document.createElement('button');
  b.textContent = id;
  b.onclick = () => { audio.unlock(); run(id); };
  bar.appendChild(b);
}
const skip = document.createElement('button'); skip.textContent = 'skip'; skip.onclick = () => cls.skip(); bar.appendChild(skip);
const info = document.getElementById('info');
let lastResult = null;
function run(id) { cls.lesson(id).then((r) => { lastResult = r; info.textContent = `${id}: ${JSON.stringify(r)} paused=${game.state.paused} locked=${game.inputLocked} override=${!!game.overrideScene}`; }); }

function resize() { pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1)); }
addEventListener('resize', resize);
resize();

function render(dt) {
  if (game.overrideScene) pr.render(game.overrideScene, game.overrideRig || baseRig);
  else { baseRig.update(dt, pr); pr.render(base, baseRig); }
}
function step(dt) { cls.update(dt); render(dt); }

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!manual) step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (params.get('lesson')) run(params.get('lesson'));

window.__cls = cls;
window.__game = game;
window.__result = () => lastResult;
// advance the cutscene by `sec` seconds in `dt` steps, then render one frame
window.__step = async (sec, dt = 1 / 30) => {
  for (let t = 0; t < sec - 1e-6; t += dt) {
    cls.update(dt);
    for (let k = 0; k < 12; k++) await null; // let awaited lesson steps continue between ticks
  }
  render(dt);
  return cls.clock;
};
window.__click = () => cls._advance();
window.__render = () => render(0);
