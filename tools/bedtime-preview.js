// Stand-alone preview for src/game/Bedtime.js with a minimal fake game (a moonlit pond behind).
//   ?play=1      auto-start          &manual=1   no real-time loop: drive with window.__step(sec, dt)
//   buttons: play, skip, reveal (fades the black away after play resolved)
import * as THREE from 'three';
import '../src/ui/fonts.css';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import audio from '../src/audio/audio.js';
import { Bedtime } from '../src/game/Bedtime.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
const baseRig = new CameraRig();
baseRig.freeBounds = true;
baseRig.goal.set(0, 0, 0); baseRig.target.set(0, 0, 0); baseRig.wupp = baseRig.wuppGoal = 0.02;

// "the game" behind: a moonlit pond, so restore + reveal are visible
const base = new THREE.Scene();
base.background = new THREE.Color(0x1a2450);
base.add(new THREE.HemisphereLight(0x8aa0ff, 0x223322, 1.2));
const grass = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0x2f5a3a }));
grass.position.y = -0.2; base.add(grass);
const pond = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.05, 24), new THREE.MeshLambertMaterial({ color: 0x24508a }));
pond.position.y = 0.01; base.add(pond);

const game = {
  renderer: pr, rig: baseRig, audio, ui: null,
  state: { paused: false, hour: 22, phase: 'bedtime' },
  inputLocked: false, overrideScene: null, overrideRig: null,
};
const bed = new Bedtime(game);
const manual = params.get('manual') === '1';
if (manual) bed.selfDrive = false;

const bar = document.getElementById('bar');
const info = document.getElementById('info');
let lastResult = null;
const btn = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; bar.appendChild(b); return b; };
btn('play', () => { audio.unlock?.(); run(); });
btn('skip', () => bed.skip());
btn('reveal', () => bed.reveal({ dur: 1.4 }));
function run() {
  bed.play().then((r) => {
    lastResult = r;
    info.textContent = `bedtime: ${JSON.stringify(r)} paused=${game.state.paused} locked=${game.inputLocked} override=${!!game.overrideScene} black=${!!bed.black}`;
  });
}

function resize() { pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1)); }
addEventListener('resize', resize);
resize();
function render(dt) {
  pr.setFogEnabled?.(!game.overrideScene);
  if (game.overrideScene) pr.render(game.overrideScene, game.overrideRig || baseRig);
  else { baseRig.update(dt, pr); pr.render(base, baseRig); }
}
function step(dt) { bed.update(dt); render(dt); }
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!manual) step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (params.get('play') === '1') run();

window.__bed = bed;
window.__game = game;
window.__result = () => lastResult;
window.__step = async (sec, dt = 1 / 30) => {
  for (let t = 0; t < sec - 1e-6; t += dt) {
    bed.update(dt);
    for (let k = 0; k < 12; k++) await null; // let awaited steps continue between ticks
  }
  render(dt);
  return bed.clock;
};
window.__render = () => render(0);
