// Preview for src/entities/farmModels.js: every farm build on its own grass
// tile (fill slider + state buttons each), a 5x5 field of marked tiles with
// construction markers around nature-atlas trees / rocks / weeds, and a beaver
// holding the strike sign. Rendered through the game's PixelRenderer.
// URL: ?only=snackbowl,pantry  &fill=0.6  &state=buggrinder:grinding,beaverbar:strike
//      &zoom=0.02 &yaw=45 &focus=pantry|field &field=0 &night=1 &paused=1 &t=3 &ui=0 &prog=0.5 &items=carrot,corn
// window.__step(dt) advances animation; window.__seek(t) jumps to time t (both re-render).
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { SpriteBatch, pixelTexture, updateSpriteUniforms } from '../src/core/spriteBatch.js';
import { buildNatureAtlas } from '../src/art/natureArt.js';
import * as FM from '../src/entities/farmModels.js';

const params = new URLSearchParams(location.search);
const only = params.get('only') ? params.get('only').split(',') : FM.FARM_TYPES;
const showField = params.get('field') !== '0';
const showModels = params.get('models') !== '0';
const startFill = params.has('fill') ? +params.get('fill') : 0.6;
const startItems = params.get('items') ? params.get('items').split(',') : undefined;
const stateArg = Object.fromEntries((params.get('state') || '').split(',').filter(Boolean).map((s) => s.split(':')));
const GAP = +(params.get('gap') || 1.6);

const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.pitch = THREE.MathUtils.degToRad(+(params.get('pitch') || 44));
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
const hemi = new THREE.HemisphereLight(0xc4dcff, 0x707e48, 1.55);
const sun = new THREE.DirectionalLight(0xfff7e6, 2.0);
sun.position.set(-7, 14, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 50 });
scene.add(hemi, sun, sun.target);

// ---------------------------------------------------------------- ground: grass tiles
const types = showModels ? only.filter((t) => FM.FARM_TYPES.includes(t)) : [];
const modelX = (i) => (i - (types.length - 1) / 2) * GAP;
const FIELD = { x0: -2, z0: -6.5, n: 5 }; // field tile (i, j) centre = (x0 + i, z0 + j)
{
  const tiles = [];
  for (let x = -6; x <= 6; x++) for (let z = -8; z <= 3; z++) tiles.push([x, z]);
  const geo = new THREE.BoxGeometry(1, 0.2, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const inst = new THREE.InstancedMesh(geo, mat, tiles.length);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  tiles.forEach(([x, z], i) => {
    m4.makeTranslation(x, -0.1, z);
    inst.setMatrixAt(i, m4);
    const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453 % 1;
    c.setHex((x + z) & 1 ? 0x6aa040 : 0x64993c).multiplyScalar(0.96 + Math.abs(h) * 0.08);
    inst.setColorAt(i, c);
  });
  inst.receiveShadow = true;
  scene.add(inst);
}

// ---------------------------------------------------------------- farm models
const models = [];
const labels = [];
function label(text, x, z) {
  const el = document.createElement('div');
  el.textContent = text;
  document.getElementById('labels').appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(x, -0.05, z) });
}
types.forEach((type, i) => {
  const m = FM.farmModel(type, { seed: +(params.get('seed') || 1) });
  if (!m) return;
  m.root.position.set(modelX(i), 0, 0);
  scene.add(m.root);
  m.setFill(startFill, startItems);
  if (stateArg[type]) m.setState(stateArg[type]);
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.35 }));
  line.rotation.x = -Math.PI / 2; line.position.set(modelX(i), 0.003, 0);
  if (params.get('grid') !== '0') scene.add(line);
  models.push({ type, m, fill: startFill, state: stateArg[type] || 'idle' });
  if (params.get('labels') !== '0') label(type, modelX(i), 0.55);
});

// ---------------------------------------------------------------- marker field
const markers = [];
let natB = null;
if (showField && FM.makeConstructionMarker) {
  const atlas = buildNatureAtlas();
  natB = new SpriteBatch(pixelTexture(atlas.canvas), { max: 256, lit: true, castShadow: true, receiveShadow: true, name: 'trees' });
  scene.add(natB.mesh);
  // what grows on each field tile (row by row, z0 -> z0 + 4) and which tiles are marked
  const LAYOUT = [
    'p p b . w',
    'p p s . m',
    '. s p b .',
    'w . . m m',
    'b w . m p',
  ].map((r) => r.split(' '));
  const MARK = [
    '1 1 1 . 1',
    '1 1 1 . 1',
    '. 1 . 1 .',
    '1 . . 1 1',
    '1 1 . 1 .',
  ].map((r) => r.split(' '));
  const SPR = { p: 'pine_0', s: 'spruce_1', m: 'maple_red', b: 'boulder_0', w: 'weed_1' };
  const KIND = { p: 'tree', s: 'tree', m: 'tree', b: 'boulder', w: 'weed' };
  const marked = (i, j) => MARK[j]?.[i] === '1';
  for (let j = 0; j < FIELD.n; j++) for (let i = 0; i < FIELD.n; i++) {
    const ch = LAYOUT[j][i];
    const x = FIELD.x0 + i, z = FIELD.z0 + j;
    if (SPR[ch]) {
      const f = atlas.frames[SPR[ch]]?.[0];
      if (f) natB.push(f, x + ((i * 7 + j * 3) % 5 - 2) * 0.04, 0, z + ((i * 3 + j * 5) % 5 - 2) * 0.03, { texels: 24, scale: ch === 'b' ? 1 : 1.05, sway: ch === 'b' ? 0 : 0.5, phase: i + j });
    }
    if (!marked(i, j)) continue;
    // tape only on the sides that don't touch another marked tile (bits: 1 +x, 2 -x, 4 +z, 8 -z)
    const edges = (marked(i + 1, j) ? 0 : 1) | (marked(i - 1, j) ? 0 : 2) | (marked(i, j + 1) ? 0 : 4) | (marked(i, j - 1) ? 0 : 8);
    const mk = FM.makeConstructionMarker({ seed: i * 5 + j * 11 + 1, kind: KIND[ch] || 'tile', edges });
    mk.root.position.set(x, 0, z);
    scene.add(mk.root);
    markers.push({ mk, i, j, delay: (i + j) * 0.12 });
  }
  natB.commit();
  label('construction markers (5x5 field)', FIELD.x0 + 2, FIELD.z0 + 4.6);
}
// a beaver-sized stand-in holding the strike sign
let strike = null;
if (FM.makeStrikeSign && showField && params.get('beaver') !== '0') {
  strike = FM.makeStrikeSign();
  const holder = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 3, 8), new THREE.MeshLambertMaterial({ color: 0x8c5530 }));
  body.position.y = 0.27; body.castShadow = true;
  holder.add(body);
  strike.position.set(0.16, 0.3, 0.06);
  holder.add(strike);
  holder.position.set(FIELD.x0 + 5.6, 0, FIELD.z0 + 4);
  scene.add(holder);
  label('strike sign', FIELD.x0 + 5.6, FIELD.z0 + 4.45);
}

// ---------------------------------------------------------------- UI
const ui = document.getElementById('ui');
if (params.get('ui') === '0') ui.classList.add('hide');
const row = (html) => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = html; ui.appendChild(d); return d; };
const btn = (parent, text, fn, on = false) => { const b = document.createElement('button'); b.textContent = text; if (on) b.classList.add('on'); b.onclick = fn; parent.appendChild(b); return b; };
for (const e of models) {
  const r = row(`<b>${e.type}</b>`);
  const sl = document.createElement('input');
  sl.type = 'range'; sl.min = 0; sl.max = 1; sl.step = 0.01; sl.value = e.fill;
  sl.oninput = () => { e.fill = +sl.value; e.m.setFill(e.fill, startItems); };
  r.appendChild(sl);
  const bs = [];
  for (const st of e.m.states || ['idle']) bs.push(btn(r, st, () => { e.state = st; e.m.setState(st); bs.forEach((b) => b.classList.toggle('on', b.textContent === st)); }, st === e.state));
  if (e.type === 'buggrinder') btn(r, 'zap!', () => e.m.zap());
}
{
  const r = row('<b>markers</b>');
  const sl = document.createElement('input');
  sl.type = 'range'; sl.min = 0; sl.max = 1; sl.step = 0.01; sl.value = +(params.get('prog') || 0);
  sl.oninput = () => markers.forEach((o) => o.mk.setProgress(+sl.value));
  r.appendChild(sl);
  btn(r, 'respawn', () => { for (const o of markers) { o.mk.root.removeFromParent(); o.mk.dispose(); } location.reload(); });
}
{
  const r = row('<b>view</b>');
  btn(r, 'night', () => setNight(!night));
  btn(r, '⟲45', () => { rig.yawGoal -= Math.PI / 4; });
  btn(r, '⟳45', () => { rig.yawGoal += Math.PI / 4; });
  btn(r, 'zoom+', () => { rig.wuppGoal *= 0.8; });
  btn(r, 'zoom-', () => { rig.wuppGoal *= 1.25; });
  btn(r, 'pause', () => { paused = !paused; });
}
if (params.has('prog')) markers.forEach((o) => o.mk.setProgress(+params.get('prog')));

let night = params.get('night') === '1';
function setNight(v) {
  night = v;
  hemi.intensity = v ? 0.8 : 1.55; sun.intensity = v ? 0.55 : 2.0;
  hemi.color.set(v ? 0x40508a : 0xc4dcff); hemi.groundColor.set(v ? 0x1e2232 : 0x707e48);
  sun.color.set(v ? 0x8fa8ff : 0xfff7e6);
  scene.background.set(v ? 0x141828 : 0x2a3a2a);
}
setNight(night);

// ---------------------------------------------------------------- camera
function focusPoint() {
  const f = params.get('focus');
  if (f === 'field') return [FIELD.x0 + 2, FIELD.z0 + 2, 5.6];
  const i = types.indexOf(f);
  if (i >= 0) return [modelX(i), 0, 1.6];
  const span = types.length ? types.length * GAP : 6;
  return showField && types.length ? [0, -2.5, Math.max(span, 8.5)] : showField ? [FIELD.x0 + 2, FIELD.z0 + 2, 6] : [0, 0, span + 0.4];
}
function resize() {
  pr.resize(innerWidth, innerHeight, 1);
  const [fx, fz, span] = focusPoint();
  rig.wupp = rig.wuppGoal = +(params.get('zoom') || 0) || span / pr.lowW * 1.05;
  rig.target.set(fx, 0.35, fz); rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = (+(params.get('yaw') || 0) * Math.PI) / 180;
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- loop
let time = +(params.get('t') || 0);
let paused = params.get('paused') === '1';
const v3 = new THREE.Vector3();
function tick(dt) {
  time += dt;
  for (const e of models) e.m.update(dt, time);
  for (const o of markers) if (time >= o.delay || paused) o.mk.update(dt, time);
  rig.update(Math.max(dt, 1 / 60), pr);
  updateSpriteUniforms(rig.camera, { time, wind: 1, sunDir: sun.position.clone().normalize() });
}
function draw() {
  pr.render(scene, rig);
  for (const l of labels) {
    v3.copy(l.pos).project(rig.camera);
    l.el.style.left = ((v3.x + 1) / 2) * innerWidth + 'px';
    l.el.style.top = ((1 - v3.y) / 2) * innerHeight + 'px';
  }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) tick(dt);
  draw();
  requestAnimationFrame(frame);
}
tick(0);
requestAnimationFrame(frame);
// ?decals=1: every 2D decal texture, scaled up, for pixel-art review
if (params.get('decals') === '1' && FM.FARM_DECALS) {
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;inset:0;background:#3a3040;overflow:auto;display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-content:flex-start;z-index:5';
  const S = +(params.get('dscale') || 6);
  for (const k of FM.FARM_DECALS) {
    const c = FM.farmDecalCanvas(k);
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:3px;align-items:flex-start';
    const big = document.createElement('canvas');
    big.width = c.width * S; big.height = c.height * S;
    big.style.cssText = `width:${big.width}px;height:${big.height}px;image-rendering:pixelated`;
    const g = big.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#6a8a50'; g.fillRect(0, 0, big.width, big.height);
    g.drawImage(c, 0, 0, big.width, big.height);
    const t = document.createElement('span'); t.textContent = `${k} ${c.width}x${c.height}`;
    box.append(big, t);
    sheet.appendChild(box);
  }
  document.body.appendChild(sheet);
}
window.__step = (dt = 1 / 30, n = 1) => { for (let i = 0; i < n; i++) tick(dt); draw(); return time; };
window.__seek = (t) => { const d = t - time; if (d > 0) { const n = Math.ceil(d / (1 / 30)); for (let i = 0; i < n; i++) tick(d / n); } draw(); return time; };
window.__farm = { scene, rig, pr, models, markers, strike, FM, setNight, pause: (v = true) => { paused = v; } };
