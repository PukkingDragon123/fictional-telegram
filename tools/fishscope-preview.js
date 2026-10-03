// Fish Scope preview: the scientist Reynard bust (as in the scope) + a full-body turntable.
// window.__step(seconds, dt) advances everything for screenshots; ?pose=scribble|peer&yaw=0.5
import * as THREE from 'three';
import { createScopeFox, attachClipboard } from '../src/ui/FishScope.js';
import { stepFoxTalks } from '../src/ui/FoxTalk3D.js';
import { FoxRig } from '../src/entities/foxRig.js';

const Q = new URLSearchParams(location.search);
const foxes = [createScopeFox(document.getElementById('b1')), createScopeFox(document.getElementById('b2'))].filter(Boolean);
const pose = (p) => foxes.forEach((f) => f.pose(p));
if (Q.get('pose')) pose(Q.get('pose'));

// full body
const cv = document.getElementById('full');
const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
r.setSize(160, 120, false);
r.setClearColor(0x0b2630);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.4));
const key = new THREE.DirectionalLight(0xfff0d6, 2.2); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
const fox = new FoxRig({ shadows: false });
fox.setOutfit('scientist');
scene.add(fox.root);
fox.root.rotation.y = +(Q.get('yaw') || 0.5);
attachClipboard(fox);
const fpose = (p) => { fox.holdProp(p === 'scribble' ? 'pencil' : 'magnifier'); fox.play(p === 'scribble' ? 'sci_scribble' : 'sci_peer'); };
fpose(Q.get('pose') || 'peer');
const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 50);
cam.position.set(0, 1.0, 5.2); cam.lookAt(0, 0.62, 0);
function frame(dt) { fox.update(dt); r.render(scene, cam); }

const ui = document.getElementById('ui');
for (const p of ['peer', 'scribble']) { const b = document.createElement('button'); b.textContent = p; b.onclick = () => { pose(p); fpose(p); }; ui.appendChild(b); }
for (const e of ['excited', 'focused', 'love', 'shocked', 'greedy']) { const b = document.createElement('button'); b.textContent = e; b.onclick = () => foxes.forEach((f) => f.say('Hmm, fascinating specimen!', e)); ui.appendChild(b); }
const rot = document.createElement('button'); rot.textContent = 'turn'; rot.onclick = () => { fox.root.rotation.y += 0.8; }; ui.appendChild(rot);

let last = performance.now();
(function loop() { const n = performance.now(); frame(Math.min(0.1, (n - last) / 1000)); last = n; requestAnimationFrame(loop); })();
window.__step = (sec = 0.5, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) { stepFoxTalks(dt, { force: true }); frame(dt); } };
window.__seek = window.__step;
window.__fox = { foxes, fox, pose, fpose };
