import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { SPECIES } from '../src/data/species.js';
import { buildFishGeometry, fishMaterial } from '../src/entities/fishModels.js';

const params = new URLSearchParams(location.search);
const what = params.get('what') || 'fish';
const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
pr.pixelDensity = +(params.get('density') || 1.6);
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(+(params.get('pitch') || 35));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a4a5a);
const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(3, 8, 5); scene.add(sun);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x3a6a70 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.6; scene.add(floor);
const items = [];
if (what === 'fish') {
  const cols = 6;
  SPECIES.forEach((s, i) => {
    for (const golden of [false, true]) {
      if (golden && i % 5) continue;
      const { geo } = buildFishGeometry(s, golden);
      const m = new THREE.InstancedMesh(geo, fishMaterial(), 1);
      geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array([i]), 1));
      geo.setAttribute('iAmp', new THREE.InstancedBufferAttribute(new Float32Array([0.0]), 1));
      m.setMatrixAt(0, new THREE.Matrix4().makeRotationY(-0.5));
      const g = new THREE.Group(); g.add(m);
      const idx = golden ? SPECIES.length + Math.floor(i / 5) : i;
      g.position.set((idx % cols) * 2.2 - cols * 1.1, 0, Math.floor(idx / cols) * 1.6 - 2.5);
      scene.add(g); items.push(g);
    }
  });
} else if (what === 'bears') {
  const { BEAR_TYPES } = await import('../src/data/bears.js');
  const { BearRig } = await import('../src/entities/bearModels.js');
  const ids = Object.keys(BEAR_TYPES);
  ids.forEach((id, i) => {
    const rig = new BearRig(id, BEAR_TYPES[id]);
    rig.root.position.set((i % 6) * 2.4 - 6, -0.6, Math.floor(i / 6) * 3 - 1.5);
    rig.root.rotation.y = +(params.get('rot') || 0.5);
    rig.armR.rotation.x = -0.4; rig.legL.rotation.x = 0.4; rig.legR.rotation.x = -0.4;
    scene.add(rig.root); items.push(rig.root);
  });
}
function resize() { pr.resize(innerWidth, innerHeight, 1); canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px'; }
addEventListener('resize', resize); resize();
rig.wupp = rig.wuppGoal = +(params.get('zoom') || 0.02);
rig.goal.set(0, 0, 0); rig.target.set(0, 0, 0);
let last = performance.now();
function frame(now) { const dt = (now - last) / 1000; last = now; rig.update(dt, pr); pr.render(scene, rig); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
window.__prev = { scene, rig, pr, items, THREE };
