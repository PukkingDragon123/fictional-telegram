// Bear looks preview (v18): a grid of procedurally generated bears of every type
// at game zoom (pixel renderer), with labels, a close-up zoom, poses and rerolls.
// URL: ?n=40&seed=7&type=all|<typeId>&zoom=game|close|far&pose=idle|walk|cheer|wave|eat&labels=0&ui=0&bosses=1
// Console: __bp.reroll(seed), __bp.set({ type, zoom, pose, labels }), __bp.bears (list of { typeId, look, def })
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { BEAR_TYPES } from '../src/data/bears.js';
import { BearRig, POSE_DURATION } from '../src/entities/bearRig.js';
import { makeBearLook, lookDef, describeLook, ACCESSORIES } from '../src/entities/bearLook.js';
import { mulberry32 } from '../src/core/rng.js';

const Q = new URLSearchParams(location.search);
const S = {
  n: +(Q.get('n') || 40),
  seed: +(Q.get('seed') || 18),
  type: Q.get('type') || 'all',
  zoom: Q.get('zoom') || 'game',
  pose: Q.get('pose') || 'idle',
  labels: Q.get('labels') !== '0',
  bosses: Q.get('bosses') === '1',
  classic: Q.get('classic') === '1', // the old per-type look (no procedural look) for comparison
};
const ZOOM = { far: 0.06, game: 0.045, close: 0.016 };
const POSES = ['idle', 'walk', 'cheer', 'wave', 'eat', 'eat_gulp', 'eat_fancy', 'smash'];

const everyday = () => Object.keys(BEAR_TYPES).filter((t) => {
  const d = BEAR_TYPES[t];
  if (S.bosses) return true;
  return !(d.boss && d.hp) && !d.bloodmoon;
});

// ------------------------------------------------------------------ stage
function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = mulberry32(5);
  const cols = ['#6f9e3c', '#679535', '#77a643', '#6b9a38', '#628f33', '#7aab47'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(30, 30);
  return t;
}
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec6e6);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ map: grassTexture() }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const sun = new THREE.DirectionalLight(0xffcf98, 2.55);
sun.position.set(-6, 10, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 0.5, far: 60 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xb8d4ff, 0x646838, 1.08));

const cv = document.getElementById('cv');
const R = new PixelRenderer(cv);
const cam = new CameraRig();
cam.bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }; cam.minWupp = 0.002; cam.maxWupp = 1;
cam.pitch = THREE.MathUtils.degToRad(+(Q.get('pitch') || 40));
cam.yaw = cam.yawGoal = +(Q.get('yaw') || 0);

// ------------------------------------------------------------------ bears
let bears = [];
const labels = document.getElementById('labels');
function clear() {
  for (const b of bears) { scene.remove(b.rig.root); b.rig.dispose(); b.lab?.remove(); }
  bears = [];
}
function build() {
  clear();
  const r = mulberry32(S.seed * 7919 + 13);
  const pool = S.type === 'all' ? everyday() : [S.type];
  // every type at least once (shuffled), then random picks
  const ids = [];
  const sh = pool.slice().sort(() => r() - 0.5);
  for (let i = 0; i < S.n; i++) ids.push(i < sh.length ? sh[i] : pool[Math.floor(r() * pool.length)]);
  const cols = Math.max(4, Math.round(Math.sqrt(S.n * 1.8)));
  const rows = Math.ceil(S.n / cols);
  const gx = 2.6, gz = 3.6;
  ids.forEach((typeId, i) => {
    const base = BEAR_TYPES[typeId];
    const look = S.classic ? null : makeBearLook(typeId, base, (r() * 4294967296) >>> 0);
    const def = look ? lookDef(base, look) : base;
    const rig = new BearRig(typeId, def);
    rig.personalize(i * 7.31 + S.seed);
    const sc = Math.max(1, base.scale);
    const c = i % cols, rw = Math.floor(i / cols);
    rig.root.position.set((c - (cols - 1) / 2) * gx, 0, (rw - (rows - 1) / 2) * gz + (sc > 1.2 ? -0.4 : 0));
    rig.root.rotation.y = 0;
    scene.add(rig.root);
    const lab = document.createElement('div');
    lab.className = 'lab';
    const acc = look ? look.accessories.map((a) => ACCESSORIES[a.kind]?.name).join(', ') : '';
    lab.dataset.short = `<b>${base.name}</b>`;
    lab.dataset.long = `<b>${base.name}</b>${def.variantName ? ` <i>${def.variantName}</i>` : ''}<br>${look ? look.fur.name + (look.furPattern.kind !== 'none' ? ' · ' + look.furPattern.kind : '') : 'classic'}${acc ? '<br>' + acc : ''}`;
    lab.innerHTML = S.zoom === 'close' ? lab.dataset.long : lab.dataset.short;
    labels.appendChild(lab);
    bears.push({ typeId, look, def, rig, lab, i, t: -i * 0.17 });
  });
  layout();
  info();
}

// ------------------------------------------------------------------ ui
const ui = document.getElementById('ui');
if (Q.get('ui') === '0') ui.classList.add('hidden');
function btn(label, on, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  if (on) b.classList.add('on');
  b.onclick = fn;
  ui.appendChild(b);
  return b;
}
function lbl(t) { const s = document.createElement('span'); s.className = 'lbl'; s.textContent = t; ui.appendChild(s); }
function refreshUI() {
  ui.innerHTML = '';
  btn('Reroll', false, () => { S.seed = (Math.random() * 1e6) | 0; build(); });
  lbl('type');
  const sel = document.createElement('select');
  for (const t of ['all', ...Object.keys(BEAR_TYPES)]) { const o = document.createElement('option'); o.value = t; o.textContent = t; if (t === S.type) o.selected = true; sel.appendChild(o); }
  sel.onchange = () => { S.type = sel.value; build(); };
  ui.appendChild(sel);
  lbl('zoom');
  for (const z of Object.keys(ZOOM)) btn(z, S.zoom === z, () => { S.zoom = z; layout(); refreshUI(); });
  lbl('pose');
  for (const p of POSES) btn(p, S.pose === p, () => { S.pose = p; for (const b of bears) b.t = -b.i * 0.17; refreshUI(); });
  lbl('');
  btn('labels', S.labels, () => { S.labels = !S.labels; labels.style.display = S.labels ? '' : 'none'; refreshUI(); });
  btn('bosses', S.bosses, () => { S.bosses = !S.bosses; build(); refreshUI(); });
  btn('classic', S.classic, () => { S.classic = !S.classic; build(); refreshUI(); });
  btn('spin', S.spin, () => { S.spin = !S.spin; refreshUI(); });
}
labels.style.display = S.labels ? '' : 'none';
const card = document.getElementById('card');
cv.addEventListener('click', (e) => {
  if (drag && drag.moved > 6) return;
  // nearest bear to the click on screen
  let best = null, bd = 1e9;
  for (const b of bears) {
    const s = cam.worldToScreen(b.rig.root.position.clone().add(new THREE.Vector3(0, 1, 0)), R);
    const d = Math.hypot(s.x - e.offsetX, s.y - e.offsetY);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best || bd > 80) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  card.innerHTML = `<h3>${best.def.name}${best.def.variantName ? ' — ' + best.def.variantName : ''}</h3>${describeLook(best.look)}\n\n${JSON.stringify(best.look, (k, v) => (typeof v === 'number' && v > 255 && k !== 'seed' ? '#' + v.toString(16).padStart(6, '0') : v), 1)}`;
});
function info() {
  document.getElementById('info').textContent = `${bears.length} bears · seed ${S.seed} · ${S.type} · ${S.zoom} zoom (wupp ${ZOOM[S.zoom]}) · click a bear for its look`;
}

// ------------------------------------------------------------------ layout / loop
function layout() {
  const W = innerWidth, H = innerHeight - (ui.classList.contains('hidden') ? 0 : ui.offsetHeight);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  R.pixelDensity = Math.hypot(W, H) / (760 * 2);
  R.resize(W, H, 1);
  cam.wupp = cam.wuppGoal = +(Q.get('wupp') || ZOOM[S.zoom]);
  if (!layout.done) { cam.lookAt(+(Q.get('cx') || 0), +(Q.get('cz') || 0), true); layout.done = true; }
  cam.target.y = 0.8;
  for (const b of bears) b.lab.innerHTML = S.zoom === 'close' ? b.lab.dataset.long : b.lab.dataset.short;
}
// drag to pan, wheel to zoom
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
  cam.panPixels(dx, dy, R); cam.target.copy(cam.goal); cam.target.y = 0.8;
});
addEventListener('pointerup', () => { setTimeout(() => { drag = null; }, 0); });
cv.addEventListener('wheel', (e) => { e.preventDefault(); cam.wupp = cam.wuppGoal = Math.min(0.12, Math.max(0.008, cam.wupp * (e.deltaY > 0 ? 1.15 : 0.87))); }, { passive: false });
addEventListener('resize', layout);

const _v = new THREE.Vector3();
function simulate(dt) {
  for (const b of bears) {
    b.t += dt;
    const rig = b.rig;
    const p = S.pose;
    if (S.spin) rig.root.rotation.y += dt * 0.8;
    if (p === 'walk') rig.pose('walk', dt, { speed: 1.4 });
    else if (POSE_DURATION[p]) {
      const dur = POSE_DURATION[p] + 0.6;
      const tt = ((b.t % dur) + dur) % dur;
      if (tt > POSE_DURATION[p]) rig.pose('idle', dt);
      else rig.pose(p, dt, { t01: tt / POSE_DURATION[p] });
    } else rig.pose(p, dt);
    rig.update(dt);
  }
}
function render() {
  cam.update(0, R);
  R.render(scene, cam);
  if (S.labels) for (const b of bears) {
    const s = cam.worldToScreen(_v.copy(b.rig.root.position), R);
    b.lab.style.left = s.x + 'px'; b.lab.style.top = (s.y + 6) + 'px';
  }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) simulate(dt);
  render();
  requestAnimationFrame(frame);
}

refreshUI();
build();
if (Q.has('t')) { S.paused = true; for (let i = 0; i < +Q.get('t') * 60; i++) simulate(1 / 60); render(); }
requestAnimationFrame(frame);

window.__bp = {
  S, get bears() { return bears; }, THREE, cam, R,
  reroll(seed = (Math.random() * 1e6) | 0) { S.seed = seed; build(); },
  set(o) { Object.assign(S, o); if (o.type !== undefined || o.n || o.bosses !== undefined || o.classic !== undefined || o.seed !== undefined) build(); layout(); refreshUI(); labels.style.display = S.labels ? '' : 'none'; },
  step(sec) { for (let i = 0; i < sec * 60; i++) simulate(1 / 60); render(); },
};
