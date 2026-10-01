// Livestock preview: ducks (mallard / pekin / wood), geese (canada / snow), ducklings + goslings, nests.
//   (default) ?mode=lineup          every breed / sex / chick + nests, each on its showreel (&anim=swim: all play one anim)
//   ?mode=grid&char=goose:canada:m  every animation of one character side by side
//   ?mode=rig&char=duck:wood:m&anim=dive   one character with a UI (&showreel=1)
//   ?mode=strip&char=goose:snow:f&anim=chase&n=8&dt=0.08   filmstrip of frozen frames
//   ?mode=nests                     duck + goose nests with 0..6 eggs, brooding, golden eggs
//   ?mode=family                    a little farm-pond scene
//   common: &zoom=close|mid|far|game &yaw=30 &pitch=20 &t=1.2 &freeze=1 &ui=0 &wupp=0.004
//   window.__selftest() runs every animation of every rig for a few seconds and reports problems.
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';
import * as DuckM from '../src/entities/critterDuck.js';

const tryImport = async (p) => { try { return await import(p); } catch (e) { console.warn('preview: cannot load', p, e.message); return {}; } };
const GooseM = await tryImport('../src/entities/critterGoose.js');
const ChickM = await tryImport('../src/entities/critterChick.js');
const NestM = await tryImport('../src/entities/critterNest.js');

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || (params.has('char') ? 'rig' : 'lineup');
const num = (k, d) => (params.has(k) ? +params.get(k) : d);
const STEP = 1 / 60;

// ------------------------------------------------------------------ characters
const CHARS = {};
const reelOf = (anims, dflt = 2.6, special = {}) => Object.fromEntries(anims.map((a) => [a, special[a] ?? dflt]));
for (const breed of DuckM.DUCK_BREEDS || ['mallard'])
  for (const sex of ['m', 'f'])
    CHARS[`duck:${breed}:${sex}`] = { sp: 'duck', make: () => new DuckM.Duck({ sex, breed }), h: 0.39, w: 0.42, nest: 'duck' };
if (GooseM.Goose)
  for (const breed of GooseM.GOOSE_BREEDS)
    for (const sex of ['m', 'f'])
      CHARS[`goose:${breed}:${sex}`] = { sp: 'goose', make: () => new GooseM.Goose({ sex, breed }), h: 0.62, w: 0.62, nest: 'goose' };
if (ChickM.Chick)
  for (const [kind, breeds] of Object.entries(ChickM.CHICK_BREEDS))
    for (const breed of breeds)
      CHARS[`chick:${kind}:${breed}`] = { sp: 'chick', make: () => new ChickM.Chick({ kind, breed }), h: kind === 'gosling' ? 0.3 : 0.22, w: kind === 'gosling' ? 0.3 : 0.24 };
const charKey = CHARS[params.get('char')] ? params.get('char') : Object.keys(CHARS)[0];
const WATER_ANIMS = new Set(['swim', 'dive']);

// ------------------------------------------------------------------ scenery
function vox(build, scale = 0.1, pivot = [0, 0, 0]) {
  const v = new VoxelModel();
  build(v);
  const m = new THREE.Mesh(v.build({ pivot, scale }), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeGround(scene, R = 60) {
  const rnd = mulberry(7);
  const g = vox((v) => {
    for (let x = -R; x < R; x++)
      for (let z = -R; z < R; z++) {
        const h = rnd();
        v.set(x, -1, z, h < 0.12 ? 0x78a441 : h > 0.9 ? 0x6a9438 : 0x6e993b);
      }
  }, 0.1);
  g.castShadow = false;
  scene.add(g);
  const deco = vox((v) => {
    for (let i = 0; i < 500; i++) {
      const x = Math.round((rnd() - 0.5) * R * 3.6), z = Math.round((rnd() - 0.5) * R * 3.6);
      if (Math.abs(x) < 70 && Math.abs(z) < 40 && rnd() < 0.8) continue;
      if (rnd() < 0.7) { v.set(x, 0, z, 0x5f8f33); v.set(x, 1, z, 0x6fa03c); v.set(x + 1, 0, z, 0x6fa03c); }
      else { const pc = [0xff8fb0, 0xffe066, 0xffffff, 0xb48cff][Math.floor(rnd() * 4)]; v.set(x, 0, z, 0x4f8a34); v.set(x, 1, z, 0xffd23f); v.set(x + 1, 1, z, pc); v.set(x - 1, 1, z, pc); v.set(x, 1, z + 1, pc); v.set(x, 1, z - 1, pc); }
    }
  }, 0.05);
  scene.add(deco);
}
const waterMat = new THREE.MeshLambertMaterial({ color: 0x3aa0d8, transparent: true, opacity: 0.8 });
function makeWater(w = 0.9, d = 0.9) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), waterMat);
  m.position.y = -0.006; // top just above the grass
  m.receiveShadow = true;
  return m;
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
sun.position.set(4, 9, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
makeGround(scene);

// ------------------------------------------------------------------ actors
const actors = []; // { rig, key, x, z, extras, reel, reelI, reelT, showreel, label, frozen }
const nests = [];
const particles = [];
const pGeo = new THREE.BoxGeometry(1, 1, 1);
const pMats = new Map();
function spawnBits(pos, n, color, speed = 1.0, size = 0.018, up = 1.2) {
  let mat = pMats.get(color);
  if (!mat) { mat = new THREE.MeshLambertMaterial({ color }); pMats.set(color, mat); }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, mat);
    m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    m.position.copy(pos);
    scene.add(m);
    particles.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * speed, up * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * speed), spin: Math.random() * 10, life: 0.9 });
  }
}
const evCount = {};
function onEvent(a) {
  return (name, rig) => {
    evCount[name] = (evCount[name] || 0) + 1;
    if (params.has('events')) console.log('event', a.key, name);
    const L = (x, y, z) => rig.root.localToWorld(new THREE.Vector3(x, y, z));
    if (name === 'splash') spawnBits(L(0, 0.02, 0.1), 5, 0xbfe8ff, 0.7, 0.016, 1.1);
    if (name === 'flap' && Math.random() < 0.08) spawnBits(L(0, 0.2, 0), 1, 0xf4f0e6, 0.6, 0.012, 0.6);
  };
}
function addActor(key, x, z, anim, { yaw = num('face', 0), showreel = false, loopAll = false } = {}) {
  const C = CHARS[key];
  const rig = C.make();
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = THREE.MathUtils.degToRad(yaw);
  scene.add(rig.root);
  const a = { rig, key, C, x, z, extras: [], reel: Object.entries(reelOf(rig.anims, 2.8, { eat: 1.2, happy: 1.6, dive: 3.4, brood: 4, sleep: 3.2, idle: 3.5 })), reelI: -1, reelT: 0, showreel, loopAll };
  rig.onEvent = onEvent(a);
  actors.push(a);
  playOn(a, anim && rig.anims.includes(anim) ? anim : rig.anims[0], 0);
  return a;
}
function playOn(a, anim, fade = 0.25) {
  a.rig.play(anim, { fade, restart: true, loop: a.loopAll ? true : undefined });
  for (const e of a.extras) { scene.remove(e.root || e); e.dispose?.(); }
  a.extras = [];
  if (WATER_ANIMS.has(anim)) {
    const w = makeWater(a.C.w * 1.9, a.C.w * 1.9);
    w.position.x += a.x; w.position.z += a.z;
    scene.add(w); a.extras.push(w);
  }
  if (anim === 'brood' && a.C.nest && NestM.makeNest) {
    const n = NestM.makeNest(a.C.nest);
    n.setEggs(a.C.nest === 'goose' ? 4 : 6);
    n.setBrooding(true);
    n.root.position.set(a.x, 0, a.z);
    n.root.rotation.y = a.rig.root.rotation.y;
    scene.add(n.root);
    a.extras.push(n);
    nests.push(n);
  }
}
const sim = (rig, seconds) => { for (let t = 0; t < seconds - 1e-6; t += STEP) rig.update(Math.min(STEP, seconds - t)); };

// ------------------------------------------------------------------ cameras
const H = CHARS[charKey] ? CHARS[charKey].h : 0.4;
const cams = {
  face: { wupp: 0.0016 * H / 0.4, y: H * 0.78, pitch: 8 },
  close: { wupp: 0.0026 * H / 0.4, y: H * 0.5, pitch: 14 },
  mid: { wupp: 0.005 * H / 0.4, y: H * 0.5, pitch: 22 },
  far: { wupp: 0.012, y: 0.3, pitch: 35 },
  game: { wupp: 0.03, y: 0.2, pitch: 44 },
};
let camName = params.get('zoom') || 'close';
const setCam = (name) => {
  camName = cams[name] ? name : 'close';
  const c = cams[camName];
  cam.wupp = cam.wuppGoal = num('wupp', c.wupp);
  cam.pitch = THREE.MathUtils.degToRad(num('pitch', c.pitch));
  cam.target.y = cam.goal.y = num('cy', c.y);
};
cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 25));
cam.goal.set(num('cx', 0), 0, num('cz', 0));
cam.target.copy(cam.goal);

const labelEl = document.getElementById('label');
const labels = []; // { obj (Object3D), text, fn? }
let main = null;
function tag(obj, text, dy = -0.05) { labels.push({ obj, text, dy }); }

if (mode === 'strip') {
  const anim = params.get('anim') || 'idle';
  const n = num('n', 8), dtS = num('dt', 0.15), t0 = num('t0', 0), gap = num('gap', CHARS[charKey].w * 1.05 + 0.05);
  for (let i = 0; i < n; i++) {
    const a = addActor(charKey, (i - (n - 1) / 2) * gap, 0, anim, { loopAll: true });
    a.rig.play(anim, { fade: 0, restart: true, loop: true });
    sim(a.rig, t0 + i * dtS);
    a.frozen = true;
    tag(a.rig.root, (t0 + i * dtS).toFixed(2) + 's');
  }
  cams.strip = { wupp: (n * gap + 0.2) / (innerWidth / 3), y: H * 0.5, pitch: 14 };
  setCam(params.get('zoom') || 'strip');
  labelEl.innerHTML = `${charKey}: ${anim}<small>filmstrip, dt ${dtS}s</small>`;
} else if (mode === 'grid') {
  const probe = CHARS[charKey].make();
  const anims = probe.anims.filter((a) => a !== 'honk' || !probe.anims.includes('quack') || charKey.startsWith('goose') || true);
  probe.dispose();
  const cols = num('cols', Math.ceil(Math.sqrt(anims.length * 1.6)));
  const gx = CHARS[charKey].w * 1.25 + 0.08, gz = CHARS[charKey].w * 1.25 + 0.08;
  anims.forEach((an, i) => {
    const cx = (i % cols) - (cols - 1) / 2, rz = Math.floor(i / cols);
    const a = addActor(charKey, cx * gx, rz * gz, an, { loopAll: true });
    tag(a.rig.root, an);
  });
  const rows = Math.ceil(anims.length / cols);
  cam.goal.z = cam.target.z = num('cz', ((rows - 1) * gz) / 2);
  cams.grid = { wupp: (cols * gx + 0.2) / (innerWidth / 3.2), y: H * 0.3, pitch: 30 };
  setCam(params.get('zoom') || 'grid');
  labelEl.innerHTML = `${charKey}<small>${anims.length} animations</small>`;
} else if (mode === 'lineup') {
  const keys = Object.keys(CHARS);
  const rowsOf = { duck: 0, goose: 1, chick: 2 };
  const xs = [0, 0, 0];
  const pos = keys.map((k) => { const r = rowsOf[CHARS[k].sp]; const x = xs[r]; xs[r] += CHARS[k].w + 0.12; return [k, r, x]; });
  for (const [k, r, x] of pos) {
    const a = addActor(k, x - xs[r] / 2 + CHARS[k].w / 2, [0.75, 0, 1.35][r], params.get('anim'), { showreel: !params.get('anim') && params.get('showreel') !== '0', loopAll: !!params.get('anim') });
    tag(a.rig.root, k.split(':').slice(1).join(' '));
  }
  if (NestM.makeNest) {
    [['duck', 3, -0.5], ['goose', 5, 0.4], ['duck', 6, 1.3]].forEach(([kind, eggs, x], i) => {
      const n = NestM.makeNest(kind);
      n.setEggs(eggs);
      if (i === 1) n.setGolden(1, true);
      if (i === 2) n.setBrooding(true);
      n.root.position.set(x, 0, 2.05);
      scene.add(n.root); nests.push(n);
      tag(n.root, kind + ' nest');
    });
  }
  cams.lineup = { wupp: 0.0046, y: 0.25, pitch: 30 };
  cam.goal.z = cam.target.z = num('cz', 1.0);
  setCam(params.get('zoom') || 'lineup');
} else if (mode === 'nests') {
  if (NestM.makeNest) {
    ['duck', 'goose'].forEach((kind, r) => {
      for (let n = 0; n <= 6; n++) {
        const N = NestM.makeNest(kind);
        N.setEggs(n);
        if (n === 5) N.setGolden(2, true);
        if (n === 6) N.setBrooding(true);
        if (n === 4) N.setHatching?.(0, true);
        N.root.position.set((n - 3) * (kind === 'goose' ? 1.0 : 0.75), 0, r * 1.1);
        scene.add(N.root); nests.push(N);
        tag(N.root, `${kind} ${n}${n === 5 ? ' gold' : n === 6 ? ' brood' : n === 4 ? ' hatching' : ''}`);
      }
      const egg = NestM.makeEggMesh(kind);
      egg.position.set(3.9 * (kind === 'goose' ? 1.0 : 0.75), 0, r * 1.1);
      scene.add(egg);
      const up = NestM.makeEggMesh(kind, { upright: true, golden: true });
      up.position.set(4.3 * (kind === 'goose' ? 1.0 : 0.75), 0, r * 1.1);
      scene.add(up);
    });
  }
  cams.nests = { wupp: 0.0058, y: 0.05, pitch: 38 };
  cam.goal.z = cam.target.z = 0.55;
  setCam(params.get('zoom') || 'nests');
} else if (mode === 'family') {
  const pond = makeWater(2.6, 1.6); pond.position.set(-0.6, 0, -0.9); scene.add(pond);
  const put = (k, x, z, anim, yaw = 0) => { const a = addActor(k, x, z, anim, { yaw, loopAll: true }); return a; };
  if (NestM.makeNest) { const n = NestM.makeNest('duck'); n.setEggs(5); n.root.position.set(0.9, 0, 0.1); scene.add(n.root); nests.push(n); }
  put('duck:mallard:f', 0.9, 0.1, 'brood', -30);
  put('duck:mallard:m', 0.35, 0.55, 'quack', 20);
  put('duck:pekin:f', -0.3, 0.5, 'peck', 60);
  put('duck:wood:m', -1.1, -0.9, 'swim', 80);
  put('duck:pekin:m', -0.4, -1.1, 'dive', -60);
  if (CHARS['goose:canada:m']) {
    put('goose:canada:m', 1.7, -0.3, 'honk', -40);
    put('goose:snow:f', -1.1, 0.25, 'idle', 35);
    put('chick:duckling:mallard', 0.25, 0.1, 'follow', 90);
    put('chick:duckling:mallard', 0.05, 0.05, 'peck', 70);
    put('chick:duckling:pekin', -0.15, 0.2, 'peep', 120);
    put('chick:gosling:canada', 1.3, -0.05, 'idle', -50);
    put('chick:gosling:snow', -0.85, 0.65, 'sleep', 10);
  }
  cams.family = { wupp: 0.0048, y: 0.15, pitch: 30 };
  setCam(params.get('zoom') || 'family');
} else {
  main = addActor(charKey, 0, 0, params.get('anim'));
  main.showreel = params.get('showreel') === '1';
  if (params.has('t')) sim(main.rig, num('t', 0));
  setCam(camName);
}
let frozen = params.get('freeze') === '1';
window.__live = { actors, nests, scene, cam, pr, THREE, sim, setCam, CHARS, evCount };

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui');
if (params.get('ui') === '0' || mode !== 'rig') ui.classList.add('hide');
const btn = (parent, text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; parent.appendChild(b); return b; };
const section = (title) => { const h = document.createElement('h3'); h.textContent = title; ui.appendChild(h); const d = document.createElement('div'); ui.appendChild(d); return d; };
if (main) {
  const s0 = section('Character');
  for (const k of Object.keys(CHARS)) btn(s0, k.split(':').slice(1).join(' '), () => { params.set('char', k); params.delete('anim'); location.search = params.toString(); }).classList.toggle('on', k === charKey);
  const s1 = section('Animations');
  for (const an of main.rig.anims) btn(s1, an, () => { main.showreel = false; playOn(main, an); });
  const s2 = section('Expressions (again = auto)');
  for (const e of main.rig.expressions) btn(s2, e, () => main.rig.setExpression(main.rig._userExpr === e ? null : e));
  const s3 = section('Camera');
  for (const c of Object.keys(cams)) btn(s3, c, () => setCam(c));
  btn(s3, '⟲ 45°', () => { cam.yawGoal += Math.PI / 4; });
  btn(s3, '⟳ 45°', () => { cam.yawGoal -= Math.PI / 4; });
  const s4 = section('Pages');
  btn(s4, 'grid of all anims', () => { location.search = `mode=grid&char=${charKey}`; });
  btn(s4, 'filmstrip of current', () => { location.search = `mode=strip&char=${charKey}&anim=${main.rig.current}&n=6&dt=0.15&face=40&yaw=0&pitch=12`; });
  btn(s4, 'lineup', () => { location.search = ''; });
  btn(s4, 'nests', () => { location.search = 'mode=nests'; });
  btn(s4, 'family', () => { location.search = 'mode=family'; });
  btn(s4, 'showreel', () => { main.showreel = !main.showreel; main.reelT = 0; });
  btn(s4, 'freeze', () => { frozen = !frozen; });
}

// ------------------------------------------------------------------ self test
window.__selftest = () => {
  const report = { rigs: 0, anims: 0, errors: [], events: {}, heights: {} };
  const bad = (o) => { let b = false; o.traverse((n) => { n.updateMatrixWorld(); for (const e of n.matrixWorld.elements) if (!Number.isFinite(e)) b = true; }); return b; };
  const bb = new THREE.Box3();
  for (const key of Object.keys(CHARS)) {
    const probe = CHARS[key].make();
    const anims = probe.anims.slice();
    probe.update(0.1);
    probe.root.updateMatrixWorld(true);
    bb.makeEmpty();
    probe.root.traverseVisible((o) => { if (o.isMesh) bb.expandByObject(o); });
    report.heights[key] = [+bb.max.y.toFixed(3), +(bb.max.z - bb.min.z).toFixed(3), +(bb.max.x - bb.min.x).toFixed(3)];
    probe.dispose();
    report.rigs++;
    for (const an of anims) {
      for (const loop of [undefined, true]) {
        const rig = CHARS[key].make();
        const ev = {};
        rig.onEvent = (n) => { ev[n] = (ev[n] || 0) + 1; };
        try {
          rig.play('idle', { fade: 0 }); rig.update(0.3);
          rig.play(an, { fade: 0.2, loop });
          for (let i = 0; i < 240; i++) rig.update(i % 17 === 0 ? 0.09 : STEP);
          for (const e of [0.05, 0.1, 0.0]) rig.update(e);
          rig.setExpression(rig.expressions[1] || null); rig.update(0.2); rig.setExpression(null);
          if (bad(rig.root)) report.errors.push(`${key} ${an}: non-finite matrix`);
          if (loop === undefined && !rig.current) report.errors.push(`${key} ${an}: no current anim`);
        } catch (e) { report.errors.push(`${key} ${an}: ${e.message}`); }
        rig.dispose();
        report.anims++;
        report.events[key.split(':')[0] + ' ' + an] = Object.keys(ev).join(',');
      }
    }
  }
  if (NestM.makeNest)
    for (const kind of ['duck', 'goose']) {
      try {
        const n = NestM.makeNest(kind);
        for (let k = 0; k <= 7; k++) { n.setEggs(k, k === 3 ? { colors: [0xc8e0f0, null, 0xf0d0d8] } : undefined); n.update(0.1); }
        n.setGolden(0, true); n.setBrooding(true); n.setHatching?.(1, true);
        for (let i = 0; i < 200; i++) n.update(STEP);
        n.setGolden(0, false); n.setBrooding(false); n.setEggs(0); n.update(0.1);
        if (bad(n.root)) report.errors.push(`nest ${kind}: non-finite`);
        n.dispose();
        const e = NestM.makeEggMesh(kind); e.geometry?.computeBoundingBox?.();
      } catch (e) { report.errors.push(`nest ${kind}: ${e.message}`); }
    }
  return report;
};

// ------------------------------------------------------------------ loop
function stepActor(a, dt) {
  if (a.frozen) return;
  if (a.showreel) {
    a.reelT -= dt;
    if (a.reelT <= 0) {
      a.reelI = (a.reelI + 1) % a.reel.length;
      const [an, d] = a.reel[a.reelI];
      playOn(a, an);
      a.reelT = d;
    }
  }
  a.rig.update(dt);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  pr.resize(w, h, Math.min(2, devicePixelRatio || 1));
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
}
addEventListener('resize', resize);
resize();
let last = performance.now(), acc = 0;
const tmp = new THREE.Vector3();
function frame(now) {
  const real = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!frozen) {
    acc += real;
    let n = 0;
    while (acc >= STEP && n < 8) {
      acc -= STEP; n++;
      for (const a of actors) stepActor(a, STEP);
      for (const N of nests) N.update(STEP);
      for (let i = particles.length - 1; i >= 0; i--) {
        const P = particles[i];
        P.v.y -= 6 * STEP; P.m.position.addScaledVector(P.v, STEP); P.m.rotation.x += P.spin * STEP; P.life -= STEP;
        if (P.m.position.y < 0.01) { P.m.position.y = 0.01; P.v.multiplyScalar(0.3); P.spin = 0; }
        if (P.life <= 0) { scene.remove(P.m); particles.splice(i, 1); }
      }
    }
    if (acc > STEP * 8) acc = 0;
  }
  cam.update(real, pr);
  pr.render(scene, cam);
  if (main) labelEl.innerHTML = `${charKey}: ${main.rig.current}<small>${main.showreel ? 'showreel' : main.rig._userExpr || 'auto face'}</small>`;
  for (const L of labels) {
    if (!L.el) { L.el = document.createElement('div'); L.el.className = 'tag'; document.body.appendChild(L.el); }
    const a = actors.find((x) => x.rig.root === L.obj);
    L.el.textContent = L.text + (mode === 'lineup' && a ? ': ' + a.rig.current : '');
    L.obj.getWorldPosition(tmp); tmp.y += L.dy;
    const s = cam.worldToScreen(tmp, pr);
    L.el.style.left = s.x + 'px'; L.el.style.top = s.y + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
