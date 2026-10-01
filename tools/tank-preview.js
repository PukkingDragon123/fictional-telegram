// Preview for src/entities/glassTank.js: a small tank on a grass tile (with a
// tile outline), a large one beside it, a few placeholder fish billboards in
// `interior`. URL: ?yaw=deg&zoom=0.01&night=1&fish=3&only=small
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { makeGlassTank } from '../src/entities/glassTank.js';

const params = new URLSearchParams(location.search);
const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
const hemi = new THREE.HemisphereLight(0xfff0dc, 0x5a6a8a, 1.3);
const sun = new THREE.DirectionalLight(0xffe0b8, 2.0);
sun.position.set(-6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
scene.add(hemi, sun, sun.target);

// grass ground with a checker of tiles + an outline on the tank's tile
const ground = new THREE.Group();
for (let x = -3; x <= 4; x++) for (let z = -2; z <= 2; z++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), new THREE.MeshLambertMaterial({ color: (x + z) & 1 ? 0x6aa040 : 0x62983c }));
  m.position.set(x, -0.1, z); m.receiveShadow = true; ground.add(m);
}
scene.add(ground);
const tileLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xfff0a0 }));
tileLine.rotation.x = -Math.PI / 2; tileLine.position.y = 0.003;
scene.add(tileLine);

const tanks = [];
const small = makeGlassTank({ size: 'small' });
scene.add(small.root);
tanks.push(small);
if (params.get('only') !== 'small') {
  const large = makeGlassTank({ size: 'large', seed: 3 });
  large.root.position.set(2.5, 0, 0);
  scene.add(large.root);
  tanks.push(large);
}

// placeholder fish: opaque (alphaTest) billboards like the game's fish batch
function fishTex(body, fin) {
  const rows = ['....ff....', '..bbbbb.f.', '.bbwkbbbff', 'bbbbbbbbf.', '.bbbbbb.f.', '...ff.....'];
  const c = document.createElement('canvas'); c.width = 10; c.height = 6;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; x.fillStyle = ch === 'b' ? body : ch === 'f' ? fin : ch === 'w' ? '#fff' : '#111'; x.fillRect(i, j, 1, 1); }));
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FISH_COL = [['#f08a2a', '#ffd070'], ['#e84a5a', '#ffb0b8'], ['#4aa0e8', '#b0e0ff'], ['#f2d040', '#fff6b0'], ['#9a6ae0', '#e0c8ff']];
const fishes = [];
function setFish(n) {
  for (const f of fishes) f.s.removeFromParent();
  fishes.length = 0;
  for (const tk of tanks) {
    tk.setFishCount(n);
    const I = tk.interior;
    for (let i = 0; i < n; i++) {
      const [b, f] = FISH_COL[i % FISH_COL.length];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fishTex(b, f), alphaTest: 0.5 }));
      s.scale.set(0.15, 0.09, 1);
      tk.root.add(s);
      fishes.push({ s, I, ph: i * 2.1, sp: 0.5 + (i % 3) * 0.15, y: I.y0 + ((i * 0.37) % 1) * (I.y1 - I.y0), z: I.z0 + (0.35 + ((i * 0.53) % 1) * 0.65) * (I.z1 - I.z0) });
    }
  }
  document.getElementById('info').textContent = `fish: ${n}`;
}
let nFish = +(params.get('fish') ?? 3);
setFish(nFish);
document.getElementById('more').onclick = () => setFish(++nFish);
document.getElementById('less').onclick = () => setFish(nFish = Math.max(0, nFish - 1));

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

function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  rig.wupp = rig.wuppGoal = +(params.get('zoom') || 0) || (tanks.length > 1 ? 5 : 2.2) / pr.lowW;
  rig.target.set(tanks.length > 1 ? 1.25 : 0, 0.4, 0); rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = (+(params.get('yaw') || 0) * Math.PI) / 180;
}
addEventListener('resize', resize);
resize();

let last = performance.now(), time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (spin) rig.yawGoal += dt * 0.4;
  for (const tk of tanks) tk.update(dt);
  for (const f of fishes) {
    const { I } = f;
    const u = Math.sin(time * f.sp + f.ph);
    f.s.position.set(I.x0 + 0.06 + (u * 0.5 + 0.5) * (I.x1 - I.x0 - 0.12), f.y + Math.sin(time * 1.7 + f.ph) * 0.01, f.z);
    f.s.material.map.repeat.x = Math.cos(time * f.sp + f.ph) > 0 ? 1 : -1;
    f.s.material.map.offset.x = f.s.material.map.repeat.x < 0 ? 1 : 0;
  }
  rig.update(dt, pr);
  pr.render(scene, rig);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__tank = { scene, rig, pr, tanks, setFish };
