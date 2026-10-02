// Bear eating styles in isolation: a bear on a little grass + pond stage eats a
// fish (real fish atlas sprite) or a duck with every BearEat style. Real
// Particles (blood, feathers, comic words) and sounds (click once to unlock).
// See eat-preview.html for URL flags; window.__seek(t) scrubs deterministically.
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { updateSpriteUniforms, pixelTexture } from '../src/core/spriteBatch.js';
import { BEAR_TYPES } from '../src/data/bears.js';
import { SPECIES } from '../src/data/species.js';
import { BearRig } from '../src/entities/bearRig.js';
import { Duck } from '../src/entities/critters3d.js';
import { makeFishPrey, makeDuckPrey } from '../src/entities/preyFx.js';
import { startEat, EAT_STYLES_ALL } from '../src/game/BearEat.js';
import { Particles } from '../src/game/Particles.js';
import { fishAtlas } from '../src/game/fishSprites.js';
import audio from '../src/game/audioProxy.js';

const Q = new URLSearchParams(location.search);
const S = {
  style: Q.get('style') || 'gulp', type: Q.get('type') || 'office', prey: Q.get('prey') || 'rainbow',
  zoom: Q.get('zoom') || 'close', paused: Q.has('t') || Q.has('strip'), water: Q.get('water') === '1', speed: +(Q.get('speed') || 1),
};
const WATER_Y = -0.1;

// ------------------------------------------------------------------ stage
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec6e6);
const gtex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = Math.sin(x * 12.9 + y * 78.2) * 43758.5 % 1; g.fillStyle = ['#6f9e3c', '#679535', '#77a643', '#628f33'][Math.floor(Math.abs(n) * 4)]; g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 20); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ map: gtex }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const pond = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshLambertMaterial({ color: 0x4aa6c6, transparent: true, opacity: 0.85 }));
pond.rotation.x = -Math.PI / 2; pond.position.set(0, 0.01, 6); scene.add(pond);
const sun = new THREE.DirectionalLight(0xffcf98, 2.5);
sun.position.set(-6, 10, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
scene.add(sun, sun.target, new THREE.HemisphereLight(0xb8d4ff, 0x646838, 1.1));

const cv = document.getElementById('c');
const R = new PixelRenderer(cv);
const cam = new CameraRig();
cam.bounds = { minX: -99, maxX: 99, minZ: -99, maxZ: 99 }; cam.minWupp = 0.002; cam.maxWupp = 1;
cam.pitch = THREE.MathUtils.degToRad(+(Q.get('pitch') || 30));
cam.yaw = cam.yawGoal = +(Q.get('yaw') || 0);

// a tiny stand-in for the Game: what BearEat and preyFx touch
const particles = new Particles(scene);
particles.groundAt = () => 0;
const atlas = fishAtlas();
const game = { scene, particles, audio, fish: { atlas, tex: pixelTexture(atlas.canvas) }, rig: cam, grid: null };
addEventListener('pointerdown', () => audio.unlock(), { once: true });

// ------------------------------------------------------------------ bear + snack
let bear = null, eat = null, duck = null, T = 0;
function build() {
  if (eat) { eat.dispose(); eat = null; }
  if (duck) { duck.dispose(); duck = null; }
  if (bear) { bear.dispose(); }
  bear = new BearRig(S.type, BEAR_TYPES[S.type]);
  bear.personalize(3.3);
  bear.root.position.set(0, S.water ? WATER_Y - 0.95 * BEAR_TYPES[S.type].scale : 0, 0);
  scene.add(bear.root);
  bear.onEvent = (n) => eat?.onRigEvent(n);
  restart();
}
function restart() {
  for (const pool of [particles.fx, particles.decals]) pool.list.length = 0;
  for (const pool of [particles.lit, particles.glow]) pool.list && (pool.list.length = 0);
  if (eat) { eat.dispose(); eat = null; }
  if (duck) { duck.dispose(); duck = null; }
  let prey;
  if (S.prey === 'duck') {
    duck = new Duck({ sex: Math.random() < 0.5 ? 'm' : 'f' });
    duck.root.scale.setScalar(1.4);
    scene.add(duck.root);
    prey = makeDuckPrey(duck, S.style);
  } else prey = makeFishPrey(game, { id: S.prey, size: 1, adult: true }, S.style);
  eat = startEat(game, { rig: bear, style: S.style, prey, speed: S.speed, groundAt: () => ({ y: S.water ? WATER_Y : 0, water: S.water }) });
  T = 0;
  bear.pose('idle', 0);
}

function simulate(dt) {
  T += dt;
  if (eat && !eat.done) {
    eat.update(dt);
    bear.pose(eat.pose, dt, eat.poseParams);
  } else {
    bear.pose('idle', dt, { inWater: S.water });
    if (eat && T > eat.duration + 0.8 && !S.paused) restart();
  }
  duck?.update(dt);
  particles.update(dt);
}

function render() {
  const sc = BEAR_TYPES[S.type].scale;
  const H = innerHeight - (ui.classList.contains('hidden') ? 0 : ui.offsetHeight);
  cam.wupp = cam.wuppGoal = (S.zoom === 'game' ? 0.04 : 0.0105 * Math.max(0.8, sc)) * (720 / H) * (S.zoom === 'game' ? 0.72 : 1);
  cam.lookAt(0, 0.4, true);
  cam.target.y = (S.water ? 0.2 : 1.1) * sc;
  cam.update(0, R);
  updateSpriteUniforms(cam.camera, { time: T });
  R.render(scene, cam);
  info.textContent = `${S.type} · ${S.style} · ${eat ? eat.pose : '-'} ${T.toFixed(2)}s / ${eat ? eat.duration.toFixed(2) : 0} · face ${bear.faceNow}`;
  slider.value = eat ? Math.min(1, T / eat.duration) : 0;
}

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui'), info = document.getElementById('info');
if (Q.get('ui') === '0') ui.classList.add('hidden');
function row(label, items, get, set) {
  const r = document.createElement('div'); r.className = 'row';
  const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label; r.appendChild(l);
  const btns = items.map(([k, text]) => { const b = document.createElement('button'); b.textContent = text; b.onclick = () => { set(k); refresh(); }; r.appendChild(b); return [k, b]; });
  r.refresh = () => { for (const [k, b] of btns) b.classList.toggle('on', get() === k); };
  ui.appendChild(r);
  return r;
}
const rows = [
  row('style', EAT_STYLES_ALL.map((s) => [s, s]), () => S.style, (k) => { S.style = k; restart(); }),
  row('prey', [['duck', 'DUCK'], ...['rainbow', 'bluegill', 'perch', 'sockeye', 'pike', 'sturgeon', 'goldfish', 'catfish'].map((s) => [s, s])], () => S.prey, (k) => { S.prey = k; restart(); }),
  row('bear', Object.keys(BEAR_TYPES).map((t) => [t, t]), () => S.type, (k) => { S.type = k; build(); }),
  row('view', [['close', 'close-up'], ['game', 'game zoom'], ['water', 'in water'], ['pause', 'pause']], () => S.zoom, (k) => {
    if (k === 'water') { S.water = !S.water; build(); } else if (k === 'pause') S.paused = !S.paused; else S.zoom = k;
  }),
];
const srow = document.createElement('div'); srow.className = 'row';
const slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = 1; slider.step = 0.001;
slider.oninput = () => { S.paused = true; seek(+slider.value * eat.duration); };
srow.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: 'time' }), slider);
ui.appendChild(srow);
function refresh() { for (const r of rows) r.refresh(); }
void SPECIES;

// deterministic scrub: replay from the start at 60 fps
function seek(t) {
  S.paused = true;
  restart();
  const dt = 1 / 60;
  for (let s = 0; s < t - 1e-6; s += dt) simulate(Math.min(dt, t - s));
  render();
  return { t: T, pose: eat?.pose, face: bear.faceNow };
}

// contact sheet: frames between from..to in a grid (?strip=from,to,n,cols)
function filmstrip({ from = 0, to = 3, n = 12, cols = 6, crop = 0.6 } = {}) {
  S.paused = true;
  const cw = Math.round(cv.width * crop), ch = Math.round(cv.height * crop);
  const sx = Math.round((cv.width - cw) / 2), sy = Math.round((cv.height - ch) * 0.45);
  const cellW = Math.floor(innerWidth / cols), cellH = Math.round(cellW * ch / cw);
  const sheet = document.createElement('canvas');
  sheet.width = cellW * cols; sheet.height = cellH * Math.ceil(n / cols);
  const g = sheet.getContext('2d');
  g.imageSmoothingEnabled = false;
  restart();
  for (let i = 0; i < n; i++) {
    const target = from + (to - from) * i / Math.max(1, n - 1);
    while (T < target - 1e-6) simulate(Math.min(1 / 60, target - T));
    render();
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    g.drawImage(cv, sx, sy, cw, ch, x, y, cellW, cellH);
    g.fillStyle = 'rgba(20,14,26,0.8)'; g.fillRect(x, y, 170, 15);
    g.fillStyle = '#fff4e4'; g.font = '11px monospace';
    g.fillText(`${T.toFixed(2)}s ${eat.pose} ${bear.faceNow}`, x + 3, y + 11);
  }
  sheet.style.cssText = 'position:fixed;left:0;top:0;z-index:10;image-rendering:pixelated';
  document.body.appendChild(sheet);
  return { w: sheet.width, h: sheet.height };
}

function layout() {
  const H = innerHeight - (ui.classList.contains('hidden') ? 0 : ui.offsetHeight);
  cv.style.width = innerWidth + 'px'; cv.style.height = H + 'px';
  R.pixelDensity = Math.hypot(innerWidth, H) / (760 * +(Q.get('ps') || 2));
  R.resize(innerWidth, H, 1);
}
addEventListener('resize', layout);

build();
layout();
refresh();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) simulate(dt);
  render();
  requestAnimationFrame(frame);
}
if (Q.has('strip')) { const [a, b, n, c] = Q.get('strip').split(',').map(Number); filmstrip({ from: a, to: b, n: n || 12, cols: c || 6, crop: +(Q.get('crop') || 0.6) }); }
else if (Q.has('t')) seek(+Q.get('t'));
requestAnimationFrame(frame);

window.__seek = seek;
window.__strip = filmstrip;
window.__set = (o) => { const rebuild = o.type || o.water !== undefined; Object.assign(S, o); if (rebuild) build(); else restart(); refresh(); layout(); };
Object.defineProperty(window, '__eat', { get: () => eat });
window.__bear = () => bear;
