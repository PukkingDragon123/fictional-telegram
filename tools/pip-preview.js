// Pip the chipmunk preview: the ChipmunkTrader rig at his lumber mill (placed as
// Villagers.makeProps would), next to Reynard and Chip for scale, plus the
// lumber cart and the trade card.
//   (default) home            Pip at the mill + parked cart + signpost, Reynard + Chip beside; showreel
//   ?mode=lineup              Reynard, Pip, Chip side by side (no props)
//   ?mode=strip&anim=count_logs&n=8&dt=0.5&t0=0.5     filmstrip (frozen frames side by side)
//   ?mode=faces               every expression side by side
//   ?mode=props               the mill + the cart on their own
//   ?mode=cart                Pip pushing the cart down a path (the root moves)
//   ?mode=trade               the trade card over the home scene (&wood=23&price=12)
//   ?char=pip &anim=haggle &expr=happy &zoom=face|close|mid|far|game &yaw=20 &t=1.2 &freeze=1 &ui=0
//   window.__test()           plays every anim (+ loop, onDone, expressions), returns errors / heights / events
//   window.__step(seconds)    advance all actors;  window.__seek(t) restart the current anims at t
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';
import * as P from '../src/entities/npcProps.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || (params.has('char') ? 'rig' : 'home');
const num = (k, d) => (params.has(k) ? +params.get(k) : d);
const STEP = 1 / 60;
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
async function load(path, name) {
  try { return (await import(/* @vite-ignore */ path))[name]; } catch (e) { errors.push('load ' + name + ': ' + e.message); return null; }
}
const Pip = await load('../src/entities/critterChipmunk.js', 'ChipmunkTrader');
const Woody = await load('../src/entities/critterWoodpecker.js', 'WoodpeckerCarpenter');
const Fox = await load('../src/entities/foxRig.js', 'FoxRig');
const P4 = await import('../src/entities/npcProps4.js').catch((e) => { errors.push('props4: ' + e.message); return {}; });
const CK = await import('../src/entities/critterChipmunk.js').catch(() => ({}));

const CHARS = {
  pip: { make: () => Pip && new Pip(), h: 1.1, name: 'Pip', sign: 'LUMBER', isNew: true,
    reel: [['idle', 7], ['wave', 2.6], ['talk', 6.4], ['laugh', 3.6], ['walk', 2.4], ['happy', 2.2], ['count_logs', 6.4], ['stuff_cheeks', 5.2], ['haggle', 4.8], ['cart_rest', 5]],
    props: [['mill', 0.45, -0.7, 0], ['cart', 1.5, 0.55, -0.6]] },
  woodpecker: { make: () => Woody && new Woody(), h: 1.3, name: 'Chip (scale)', reel: [['idle', 6]], props: [] },
  fox: { make: () => Fox && new Fox(), h: 1.6, name: 'Reynard (scale)', reel: [['idle', 6]], props: [] },
};
const charKey = CHARS[params.get('char')] ? params.get('char') : 'pip';
const PROPS = { mill: () => P4.makeLumberMill(), cart: () => P4.makeLumberCart() };

// ------------------------------------------------------------------ scenery
function vox(build, scale = 0.1) {
  const v = new VoxelModel(); build(v);
  const m = new THREE.Mesh(v.build({ pivot: [0, 0, 0], scale }), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeGround(scene, R = 60) {
  const rnd = mulberry(7);
  const g = vox((v) => { for (let x = -R; x < R; x++) for (let z = -R; z < R; z++) { const h = rnd(); v.set(x, -1, z, mode === 'cart' && Math.abs(x) < 4 ? (h < 0.3 ? 0xb08a5a : 0xc49a64) : h < 0.12 ? 0x78a441 : h > 0.9 ? 0x6a9438 : 0x6e993b); } });
  g.castShadow = false; scene.add(g);
}

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const pr = new PixelRenderer(canvas);
pr.pixelDensity = num('density', 1);
const cam = new CameraRig();
cam.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
cam.minWupp = 0.0003; cam.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc4e8);
const sun = new THREE.DirectionalLight(0xffe6c4, 2.35);
sun.position.set(4, 9, 7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
makeGround(scene);

const actors = [], events = [], updaters = [];
function addActor(ck, x, z, anim, { props = true, sign = false, yaw = num('face', 0) } = {}) {
  const C = CHARS[ck];
  const rig = C.make();
  if (!rig) return null;
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = THREE.MathUtils.degToRad(yaw);
  scene.add(rig.root);
  const a = { rig, ck, reel: C.reel, reelI: -1, reelT: 0 };
  rig.onEvent = (name, r, d) => events.push(ck + ':' + name + (d != null ? '=' + d : ''));
  const place = (o, px, pz, pyaw) => { o.position.set(x + px, 0, z + pz); o.rotation.y = pyaw; scene.add(o); if (o.userData.update) updaters.push(o.userData.update); return o; };
  if (props) for (const [n, px, pz, pyaw] of C.props) { try { place(PROPS[n](), px, pz, pyaw); } catch (e) { errors.push('prop ' + n + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]); } }
  if (sign && C.sign) place(P.makeSignpost(C.sign), -1.4, 1.1, 0.2);
  actors.push(a);
  playOn(a, anim || 'idle', 0);
  return a;
}
function playOn(a, anim, fade = 0.25) { a.rig.play(anim, { fade, restart: true }); }
const sim = (rig, seconds) => { for (let t = 0; t < seconds - 1e-6; t += STEP) rig.update(Math.min(STEP, seconds - t)); };

const H = CHARS[charKey].h;
const cams = {
  face: { wupp: 0.0019, y: 0.85, pitch: 6 },
  close: { wupp: 0.0034 * H / 1.1, y: H * 0.5, pitch: 12 },
  mid: { wupp: 0.006, y: 0.5, pitch: 22 },
  far: { wupp: 0.012, y: 0.4, pitch: 32 },
  game: { wupp: 0.016, y: 0.3, pitch: 44 },
};
const setCam = (name) => {
  const c = cams[name] || cams.close;
  cam.wupp = cam.wuppGoal = num('wupp', c.wupp);
  cam.pitch = THREE.MathUtils.degToRad(num('pitch', c.pitch));
  cam.target.y = cam.goal.y = num('cy', c.y);
};
cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 20));
cam.goal.set(num('cx', 0), 0, num('cz', 0)); cam.target.copy(cam.goal);

const labelEl = document.getElementById('label');
const labels = [];
let main = null, cartWalker = null;
if (mode === 'strip') {
  const anim = params.get('anim') || 'idle';
  const n = num('n', 8), dtS = num('dt', 0.15), t0 = num('t0', 0), gap = num('gap', 1.0);
  for (let i = 0; i < n; i++) {
    const a = addActor(charKey, (i - (n - 1) / 2) * gap, 0, anim, { props: false });
    if (params.get('expr')) a.rig.setExpression(params.get('expr'));
    sim(a.rig, t0 + i * dtS);
    a.frozen = true;
    labels.push({ a, text: (t0 + i * dtS).toFixed(2) + 's' });
  }
  cams.strip = { wupp: (n * gap + 0.2) / (innerWidth / 3), y: H * 0.5, pitch: 12 };
  setCam(params.get('zoom') || 'strip');
  labelEl.innerHTML = `${charKey}: ${anim}<small>filmstrip, dt ${dtS}s</small>`;
} else if (mode === 'faces') {
  const tmp = CHARS[charKey].make();
  const ex = params.get('exprs') ? params.get('exprs').split(',') : tmp.expressions;
  tmp.dispose();
  const gap = num('gap', 0.62);
  ex.forEach((e, i) => {
    const a = addActor(charKey, (i - (ex.length - 1) / 2) * gap, 0, 'idle', { props: false });
    a.rig.setExpression(e); sim(a.rig, num('t', 0.4)); a.frozen = true;
    labels.push({ a, text: e });
  });
  cams.faces = { wupp: (ex.length * gap + 0.2) / (innerWidth / 3), y: 0.85, pitch: 6 };
  setCam(params.get('zoom') || 'faces');
} else if (mode === 'lineup') {
  const keys = (params.get('chars') || 'fox,pip,woodpecker').split(',');
  keys.forEach((k, i) => {
    const a = addActor(k, (i - (keys.length - 1) / 2) * num('gap', 1.1), 0, params.get('anim') || 'idle', { props: false });
    if (a) labels.push({ a, text: CHARS[k].name });
  });
  cams.lineup = { wupp: num('lw', 0.0068), y: 0.75, pitch: 14 };
  setCam(params.get('zoom') || 'lineup');
} else if (mode === 'props') {
  const items = [];
  try { items.push(P4.makeLumberMill()); items.push(P4.makeLumberCart()); } catch (e) { errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]); }
  const xs = [-0.6, 2.0];
  items.forEach((o, i) => { o.position.x = xs[i]; o.rotation.y = num('pry', 0); scene.add(o); if (o.userData.update) updaters.push(o.userData.update); });
  if (params.get('saw') === '1' && items[0]) items[0].userData.sawing = true;
  cams.props = { wupp: 0.0072, y: 0.7, pitch: 26 };
  setCam(params.get('zoom') || 'props');
} else if (mode === 'cart') {
  // Pip pushes his cart along a dirt path toward the camera, wraps round
  cartWalker = addActor('pip', 0, -3, 'push_cart', { props: false });
  cartWalker.speed = num('speed', CK.PIP_CART_SPEED || 0.55);
  cartWalker.rig.play('push_cart', { fade: 0, speed: cartWalker.speed / (CK.PIP_CART_SPEED || 0.55) });
  labels.push({ a: cartWalker, text: 'Pip' });
  cams.cart = { wupp: 0.0062, y: 0.5, pitch: 24 };
  setCam(params.get('zoom') || 'cart');
  cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 35));
} else if (mode === 'home' || mode === 'trade') {
  main = addActor('pip', 0, 0, params.get('anim'), { sign: true, yaw: num('face', 17.2) });
  main.showreel = params.get('showreel') !== '0' && !params.get('anim') && mode === 'home';
  if (params.has('t')) sim(main.rig, num('t', 0));
  if (params.get('friends') !== '0') {
    const f = addActor('fox', -1.4, 1.45, 'idle', { props: false, yaw: 20 });
    const c = addActor('woodpecker', 3.0, 1.6, 'idle', { props: false, yaw: -25 });
    if (f) labels.push({ a: f, text: 'Reynard' });
    if (c) labels.push({ a: c, text: 'Chip' });
  }
  labels.push({ a: main, text: 'Pip' });
  cams.home = { wupp: 0.0082, y: 0.9, pitch: 28 };
  cam.goal.set(num('cx', 0.4), 0, num('cz', 0)); cam.target.copy(cam.goal);
  setCam(params.get('zoom') || 'home');
} else {
  main = addActor(charKey, 0, 0, params.get('anim'), { props: params.get('props') === '1', sign: params.get('sign') === '1' });
  if (params.get('expr')) main.rig.setExpression(params.get('expr'));
  if (params.has('t')) sim(main.rig, num('t', 0));
  setCam(params.get('zoom') || 'close');
}
let frozen = params.get('freeze') === '1';

// ------------------------------------------------------------------ trade card
let trade = null;
async function openTrade() {
  const { openLumberTrade } = await import('../src/ui/LumberTrade.js');
  const box = document.getElementById('trade');
  box.style.display = 'block';
  let wood = num('wood', 23);
  const price = num('price', 12);
  trade = openLumberTrade(box, {
    wood, price, trend: num('trend', 1),
    chat: ['Logs, logs, lovely logs!', `Today: ${price} coins a log!`, 'Keep some for Chip, eh?'],
    onSell: (n) => { n = Math.min(n, wood); if (!n) return { ok: false, msg: 'No logs to sell!' }; wood -= n; trade.refresh({ wood }); return { ok: true, msg: `+${n * price} coins! Nice wood!`, coins: n * price }; },
    sfx: (n) => events.push('sfx:' + n),
    onClose: () => { trade = null; box.style.display = 'none'; },
  });
  window.__trade = trade;
}
if (mode === 'trade') openTrade();

// ------------------------------------------------------------------ automated check
function visibleTop(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || o.isSprite || !shown(o) || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(b);
  });
  return box.max.y;
}
window.__test = () => {
  const out = { errors: [...errors], ran: [], heights: {}, events: {} };
  const rig = CHARS.pip.make();
  if (!rig) { out.errors.push('no pip'); return out; }
  scene.add(rig.root);
  const ev = new Set();
  rig.onEvent = (n) => ev.add(n);
  sim(rig, 0.5);
  out.heights.pip = +visibleTop(rig.root).toFixed(3);
  const bad = () => { let b = false; rig.root.traverse((o) => { if (!Number.isFinite(o.position.x + o.position.y + o.position.z + o.rotation.x + o.rotation.y + o.rotation.z + o.scale.x)) b = true; }); return b; };
  for (const an of rig.anims) {
    try {
      rig.play(an, { fade: 0.2 });
      const d = rig._ANIMS[an].dur || 3;
      for (let t = 0; t < d + 0.6; t += STEP) { rig.update(STEP); if (bad()) { out.errors.push(an + ' NaN at ' + t.toFixed(2)); break; } }
      out.ran.push(an);
    } catch (e) { out.errors.push(an + ' ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  }
  for (const ex of rig.expressions) { try { rig.setExpression(ex); sim(rig, 0.2); } catch (e) { out.errors.push('expr ' + ex + ' ' + e.message); } }
  rig.setExpression(null);
  for (const an of rig.anims) {
    try { let done = false; rig.play(an, { loop: false, onDone: () => { done = true; rig.play('idle', { loop: true }); } }); sim(rig, (rig._ANIMS[an].dur || 0) + 0.5); if (rig._ANIMS[an].dur && !done) out.errors.push(an + ' no onDone'); } catch (e) { out.errors.push(an + ' (onDone) ' + e.message); }
  }
  for (const an of rig.anims) {
    if (!rig._ANIMS[an].dur) continue;
    rig.play(an, { loop: false, fade: 0 }); sim(rig, rig._ANIMS[an].dur + 1.0);
    const left = ['pencil', 'acornL', 'acornR', 'pad', 'cart'].filter((n) => rig[n].visible);
    if (left.length) out.errors.push(an + ' leaves visible: ' + left.join(','));
  }
  try { const c = rig.parkCart(scene); if (!c) out.errors.push('parkCart'); else scene.remove(c); } catch (e) { out.errors.push('parkCart ' + e.message); }
  out.events.pip = [...ev];
  rig.dispose();
  return out;
};

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui');
if (params.get('ui') === '0' || (mode !== 'rig' && mode !== 'home')) ui.classList.add('hide');
const btn = (parent, text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; parent.appendChild(b); return b; };
const section = (title) => { const h = document.createElement('h3'); h.textContent = title; ui.appendChild(h); const d = document.createElement('div'); ui.appendChild(d); return d; };
if (main) {
  const s1 = section('Pip: animations');
  for (const an of main.rig.anims) btn(s1, an, () => { main.showreel = false; playOn(main, an); });
  const s2 = section('Expressions (again = auto)');
  for (const e of main.rig.expressions) btn(s2, e, () => main.rig.setExpression(main.rig._userExpr === e ? null : e));
  const s3 = section('Camera');
  for (const c of Object.keys(cams)) btn(s3, c, () => setCam(c));
  btn(s3, '⟲ 45°', () => { cam.yawGoal += Math.PI / 4; });
  btn(s3, '⟳ 45°', () => { cam.yawGoal -= Math.PI / 4; });
  const s4 = section('Toys');
  btn(s4, 'trade card', () => { if (!trade) openTrade(); });
  btn(s4, 'showreel', () => { main.showreel = !main.showreel; main.reelT = 0; });
  btn(s4, 'freeze', () => { frozen = !frozen; });
  btn(s4, 'cart walk', () => { location.search = 'mode=cart'; });
  btn(s4, 'lineup', () => { location.search = 'mode=lineup'; });
  btn(s4, 'faces', () => { location.search = 'mode=faces'; });
  btn(s4, 'props', () => { location.search = 'mode=props'; });
}

// ------------------------------------------------------------------ loop
function stepActor(a, dt) {
  if (a.frozen) return;
  if (a.showreel) {
    a.reelT -= dt;
    if (a.reelT <= 0) { a.reelI = (a.reelI + 1) % a.reel.length; const [an, d] = a.reel[a.reelI]; playOn(a, an); a.reelT = d; }
  }
  if (a === cartWalker) {
    a.rig.root.position.z += a.speed * dt;
    if (a.rig.root.position.z > 2.5) a.rig.root.position.z = -3;
    cam.goal.z = cam.target.z = a.rig.root.position.z + 0.5;
  }
  a.rig.update(dt);
}
function stepAll(dt) { for (const a of actors) stepActor(a, dt); for (const u of updaters) u(dt); }
function resize() { const w = innerWidth, h = innerHeight; pr.resize(w, h, Math.min(2, devicePixelRatio || 1)); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
addEventListener('resize', resize);
resize();
let last = performance.now(), acc = 0;
const tmp = new THREE.Vector3();
window.__step = (sec) => { for (let t = 0; t < sec - 1e-6; t += STEP) stepAll(STEP); };
window.__seek = (sec) => { for (const a of actors) { if (a.frozen) continue; playOn(a, a.rig.current, 0); sim(a.rig, sec); } };
window.__play = (anim, t = 0) => { if (!main) return; main.showreel = false; main.rig.play(anim, { fade: 0, restart: true }); sim(main.rig, t); };
function frame(now) {
  const real = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!frozen) {
    acc += real;
    let n = 0;
    while (acc >= STEP && n < 8) { acc -= STEP; n++; stepAll(STEP); }
    if (acc > STEP * 8) acc = 0;
  }
  cam.update(real, pr);
  pr.render(scene, cam);
  if (main) labelEl.innerHTML = `Pip: ${main.rig.current}<small>${main.showreel ? 'showreel' : main.rig._userExpr || 'auto face'}</small>`;
  for (const L of labels) {
    if (!L.el) {
      L.el = document.createElement('div');
      L.el.style.cssText = 'position:fixed;font:bold 12px Trebuchet MS;color:#fff4e0;text-shadow:0 1px 0 #3a2150,0 0 4px #3a2150;transform:translateX(-50%);pointer-events:none;white-space:nowrap';
      document.body.appendChild(L.el);
    }
    L.el.textContent = L.text;
    tmp.copy(L.a.rig.root.position); tmp.y -= 0.05;
    const s = cam.worldToScreen(tmp, pr);
    L.el.style.left = s.x + 'px'; L.el.style.top = s.y + 'px';
    L.el.style.display = params.get('labels') === '0' || trade ? 'none' : '';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__v = { actors, scene, cam, pr, THREE, sim, setCam, P4, CHARS, events, main, openTrade };
window.__ready = true;
