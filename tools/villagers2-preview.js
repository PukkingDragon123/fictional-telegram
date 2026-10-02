// Meadow villagers preview: Clover (bunny gardener), Otis (otter fisher), Hazel
// (hedgehog baker) with their homestead props, next to Professor Hoot and
// Reynard for scale.
//   (default) lineup          everyone with their prop; the new three cycle their anims
//   ?char=bunny|otter|hedgehog|owl|fox &anim=dig &expr=happy &zoom=face|close|mid|far|game &yaw=20 &t=1.2 &freeze=1 &ui=0
//   &showreel=1               cycle every animation of that character; &props=1 shows its prop
//   ?mode=strip&char=bunny&anim=dig&n=8&dt=0.5&t0=0     filmstrip (frozen frames side by side)
//   ?mode=faces&char=otter    every expression side by side (frozen idle)
//   ?mode=props               the three homestead props (+ signposts)
//   window.__test()           plays every anim of every new character (+ loop + expressions), returns errors / heights / events
//   window.__step(seconds)    advance all actors by fixed 1/60 steps
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';
import * as P from '../src/entities/npcProps.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || (params.has('char') ? 'rig' : 'lineup');
const num = (k, d) => (params.has(k) ? +params.get(k) : d);
const STEP = 1 / 60;
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));

async function load(path, name) {
  try { return (await import(/* @vite-ignore */ path))[name]; } catch (e) { console.warn('missing', name, e.message); errors.push('load ' + name + ': ' + e.message); return null; }
}
const Bunny = await load('../src/entities/critterBunny.js', 'BunnyGardener');
const Otter = await load('../src/entities/critterOtter.js', 'OtterFisher');
const Hog = await load('../src/entities/critterHedgehog.js', 'HedgehogBaker');
const Owl = await load('../src/entities/critterOwl.js', 'OwlRanger');
const Fox = await load('../src/entities/foxRig.js', 'FoxRig');
const P2 = await import('../src/entities/npcProps2.js').catch((e) => { errors.push('props2: ' + e.message); return {}; });

// ------------------------------------------------------------------ characters
// reel: [anim, seconds]; props: [maker, dx, dz, yaw] relative to the character (same as the Villagers.js offsets)
const CHARS = {
  bunny: { make: () => Bunny && new Bunny(), h: 1.3, name: 'Clover', sign: "CLOVER'S\nGARDEN", isNew: true,
    reel: [['idle', 6], ['wave', 2.6], ['talk', 4], ['laugh', 2.6], ['walk', 2.6], ['happy', 2.1], ['water_plants', 5.4], ['dig', 5.8], ['sniff', 3.8]],
    props: [['garden', 1.15, -0.45, -0.25]] },
  otter: { make: () => Otter && new Otter(), h: 1.3, name: 'Otis', sign: 'GONE\nFISHIN', isNew: true,
    reel: [['idle', 6], ['wave', 2.6], ['talk', 4], ['laugh', 2.6], ['walk', 2.6], ['happy', 2.1], ['cast_line', 7], ['hold_fish', 4], ['juggle_pebble', 5], ['float_back', 7]],
    props: [['dock', 0.85, 0.0, Math.PI]] },
  hedgehog: { make: () => Hog && new Hog(), h: 1.15, name: 'Hazel', sign: "HAZEL'S\nBAKERY", isNew: true,
    reel: [['idle', 6], ['wave', 2.6], ['talk', 4], ['laugh', 2.6], ['walk', 2.6], ['happy', 2.1], ['roll_dough', 6], ['taste', 4.6], ['curl_up', 4]],
    props: [['bakery', 1.1, -0.55, -0.3]] },
  owl: { make: () => Owl && new Owl(), h: 1.3, name: 'Professor Hoot (scale)', reel: [['idle', 6]], props: [] },
  fox: { make: () => Fox && new Fox(), h: 1.6, name: 'Reynard (scale)', reel: [['idle', 6]], props: [] },
};
const NEW = ['bunny', 'otter', 'hedgehog'];
const charKey = CHARS[params.get('char')] ? params.get('char') : 'bunny';
const PROPS = { garden: () => P2.makeGardenPatch(), dock: () => P2.makeFishingDock(), bakery: () => P2.makeBakeryCart() };

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
    for (let i = 0; i < 400; i++) {
      const x = Math.round((rnd() - 0.5) * R * 3.6), z = Math.round((rnd() - 0.5) * R * 3.6);
      if (Math.abs(x) < 14 && Math.abs(z) < 14) continue;
      if (rnd() < 0.65) { v.set(x, 0, z, 0x5f8f33); v.set(x, 1, z, 0x6fa03c); v.set(x + 1, 0, z, 0x6fa03c); }
      else { const pc = [0xff8fb0, 0xffe066, 0xffffff, 0xb48cff][Math.floor(rnd() * 4)]; v.set(x, 0, z, 0x4f8a34); v.set(x, 1, z, 0xffd23f); v.set(x + 1, 1, z, pc); v.set(x - 1, 1, z, pc); v.set(x, 1, z + 1, pc); v.set(x, 1, z - 1, pc); }
    }
  }, 0.05);
  scene.add(deco);
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
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
makeGround(scene);

const actors = [];
const events = [];
function addActor(ck, x, z, anim, { props = true, sign = false, yaw = num('face', 0) } = {}) {
  const C = CHARS[ck];
  const rig = C.make();
  if (!rig) return null;
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = THREE.MathUtils.degToRad(yaw);
  scene.add(rig.root);
  const a = { rig, ck, reel: C.reel, reelI: -1, reelT: 0, extras: [] };
  rig.onEvent = (name) => { events.push(ck + ':' + name); if (params.has('events')) console.log('event', ck, name); };
  const place = (o, px, pz, pyaw) => {
    const ry = rig.root.rotation.y;
    o.position.set(x + px * Math.cos(ry) + pz * Math.sin(ry), 0, z - px * Math.sin(ry) + pz * Math.cos(ry));
    o.rotation.y = pyaw + ry;
    scene.add(o);
    return o;
  };
  if (props) for (const [n, px, pz, pyaw] of C.props) { try { a.extras.push(place(PROPS[n](), px, pz, pyaw)); } catch (e) { errors.push('prop ' + n + ': ' + e.message); } }
  // the otter casts into the dock's pond (same snippet the game can use)
  for (const o of a.extras) if (o.userData.cast && rig.castTarget) {
    scene.updateMatrixWorld(true);
    rig.castTarget.copy(o.localToWorld(o.userData.cast.clone()));
    rig.root.worldToLocal(rig.castTarget);
  }
  if (sign && C.sign) a.extras.push(place(P.makeSignpost(C.sign), -0.6, 0.55, 0.3));
  actors.push(a);
  playOn(a, anim || rig.anims[0], 0);
  return a;
}
function playOn(a, anim, fade = 0.25) {
  a.rig.play(anim, { fade, restart: true });
}
const sim = (rig, seconds) => { for (let t = 0; t < seconds - 1e-6; t += STEP) rig.update(Math.min(STEP, seconds - t)); };

// ------------------------------------------------------------------ cameras
const H = CHARS[charKey].h;
const cams = {
  face: { wupp: 0.0022 * H / 1.25, y: H * 0.8, pitch: 6 },
  close: { wupp: 0.0036 * H / 1.25, y: H * 0.55, pitch: 12 },
  mid: { wupp: 0.006 * H / 1.25, y: H * 0.5, pitch: 22 },
  far: { wupp: 0.012, y: 0.4, pitch: 32 },
  game: { wupp: 0.016, y: 0.3, pitch: 44 },
};
let camName = params.get('zoom') || 'close';
const setCam = (name) => {
  camName = cams[name] ? name : 'close';
  const c = cams[camName];
  cam.wupp = cam.wuppGoal = num('wupp', c.wupp);
  cam.pitch = THREE.MathUtils.degToRad(num('pitch', c.pitch));
  cam.target.y = cam.goal.y = num('cy', c.y);
};
cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 20));
cam.goal.set(num('cx', 0), 0, num('cz', 0));
cam.target.copy(cam.goal);

const labelEl = document.getElementById('label');
const labels = [];
let main = null;
if (mode === 'strip') {
  const anim = params.get('anim') || 'idle';
  const n = num('n', 8), dtS = num('dt', 0.15), t0 = num('t0', 0), gap = num('gap', 0.85);
  for (let i = 0; i < n; i++) {
    const a = addActor(charKey, (i - (n - 1) / 2) * gap, 0, anim, { props: false });
    if (params.get('expr')) a.rig.setExpression(params.get('expr'));
    if (params.get('from')) { playOn(a, params.get('from'), 0); sim(a.rig, num('fromT', 2)); }
    playOn(a, anim, params.get('from') ? 0.25 : 0);
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
  const gap = num('gap', 0.75);
  ex.forEach((e, i) => {
    const a = addActor(charKey, (i - (ex.length - 1) / 2) * gap, 0, params.get('anim') || 'idle', { props: false });
    a.rig.setExpression(e);
    sim(a.rig, num('t', 0.4));
    a.frozen = true;
    labels.push({ a, text: e });
  });
  cams.faces = { wupp: (ex.length * gap + 0.2) / (innerWidth / 3), y: H * 0.8, pitch: 6 };
  setCam(params.get('zoom') || 'faces');
  labelEl.innerHTML = `${charKey}<small>expressions</small>`;
} else if (mode === 'lineup') {
  const keys = (params.get('chars') || 'fox,bunny,otter,hedgehog,owl').split(',');
  const gap = num('gap', 2.9);
  keys.forEach((k, i) => {
    const a = addActor(k, (i - (keys.length - 1) / 2) * gap, 0, params.get('anim') || null, { sign: params.get('signs') !== '0', props: params.get('props') !== '0' });
    if (!a) return;
    a.showreel = CHARS[k].isNew && params.get('showreel') !== '0';
    a.exprCycle = params.get('exprs') === '1';
    a.reelI = Math.floor(num('reel0', 0)) - 1;
    labels.push({ a, text: CHARS[k].name });
  });
  cams.lineup = { wupp: num('lw', 0.0135), y: 0.6, pitch: 24 };
  setCam(params.get('zoom') || 'lineup');
} else if (mode === 'props') {
  const items = [];
  const tryP = (fn) => { try { const o = fn(); if (o) items.push(o); } catch (e) { errors.push(e.message); } };
  tryP(() => P2.makeGardenPatch()); tryP(() => P2.makeFishingDock()); tryP(() => P2.makeBakeryCart());
  tryP(() => P.makeSignpost("CLOVER'S\nGARDEN")); tryP(() => P.makeSignpost('GONE\nFISHIN'));
  const xs = [-2.4, -0.6, 1.2, 2.5, 3.2];
  items.forEach((o, i) => { o.position.x = xs[i]; o.rotation.y = num('pry', 0); scene.add(o); });
  cams.props = { wupp: 0.0075, y: 0.4, pitch: 26 };
  setCam(params.get('zoom') || 'props');
} else {
  main = addActor(charKey, 0, 0, params.get('from') || params.get('anim'), { props: params.get('props') === '1', sign: params.get('sign') === '1' });
  if (params.get('from')) { sim(main.rig, num('fromT', 1.5)); playOn(main, params.get('anim') || main.rig.anims[0]); }
  main.showreel = params.get('showreel') === '1';
  if (params.get('expr')) main.rig.setExpression(params.get('expr'));
  if (params.has('t')) sim(main.rig, num('t', 0));
  setCam(camName);
}
let frozen = params.get('freeze') === '1';

// ------------------------------------------------------------------ automated check
function visibleTop(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || o.isSprite || !shown(o) || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box.max.y;
}
function bodyBox(rig) {
  // head top without hat / ears (head mesh) for the speech-bubble height
  rig.root.updateMatrixWorld(true);
  const b = new THREE.Box3();
  if (rig.headMesh) { if (!rig.headMesh.geometry.boundingBox) rig.headMesh.geometry.computeBoundingBox(); b.copy(rig.headMesh.geometry.boundingBox).applyMatrix4(rig.headMesh.matrixWorld); }
  return +b.max.y.toFixed(3);
}
window.__height = (i = 0) => visibleTop(actors[i].rig.root);
window.__test = (only) => {
  const out = { errors: [...errors], ran: [], heights: {}, heads: {}, events: {} };
  for (const ck of only ? [only] : NEW) {
    const rig = CHARS[ck].make();
    if (!rig) { out.errors.push('no ' + ck); continue; }
    scene.add(rig.root);
    const ev = new Set();
    rig.onEvent = (n) => ev.add(n);
    sim(rig, 0.5);
    out.heights[ck] = +visibleTop(rig.root).toFixed(3);
    out.heads[ck] = bodyBox(rig);
    for (const an of rig.anims) {
      try {
        rig.play(an, { fade: 0.2 });
        const d = rig._ANIMS[an].dur || 3;
        sim(rig, d + 0.6);
        let bad = false;
        rig.root.traverse((o) => { if (!Number.isFinite(o.position.x + o.position.y + o.position.z + o.rotation.x + o.rotation.y + o.rotation.z + o.scale.x)) bad = true; });
        if (bad) out.errors.push(ck + ':' + an + ' NaN');
        out.ran.push(ck + ':' + an);
      } catch (e) { out.errors.push(ck + ':' + an + ' ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
    }
    for (const ex of rig.expressions) {
      try { rig.setExpression(ex); sim(rig, 0.2); } catch (e) { out.errors.push(ck + ' expr ' + ex + ' ' + e.message); }
    }
    rig.setExpression(null);
    for (const an of rig.anims) {
      try { rig.play(an, { loop: true, fade: 0.1 }); sim(rig, (rig._ANIMS[an].dur || 2) * 2.3); } catch (e) { out.errors.push(ck + ':' + an + ' (loop) ' + e.message); }
    }
    // Villagers.js style: one-shot with onDone -> idle
    for (const an of rig.anims) {
      try { let done = false; rig.play(an, { loop: false, onDone: () => { done = true; rig.play('idle', { loop: true }); } }); sim(rig, (rig._ANIMS[an].dur || 0) + 0.5); if (rig._ANIMS[an].dur && !done) out.errors.push(ck + ':' + an + ' no onDone'); } catch (e) { out.errors.push(ck + ':' + an + ' (onDone) ' + e.message); }
    }
    out.events[ck] = [...ev];
    rig.dispose();
  }
  return out;
};

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui');
if (params.get('ui') === '0' || (mode !== 'rig' && mode !== 'lineup')) ui.classList.add('hide');
const btn = (parent, text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; parent.appendChild(b); return b; };
const section = (title) => { const h = document.createElement('h3'); h.textContent = title; ui.appendChild(h); const d = document.createElement('div'); ui.appendChild(d); return d; };
if (main) {
  const s0 = section('Character');
  for (const k of Object.keys(CHARS)) btn(s0, k, () => { params.set('char', k); params.delete('anim'); location.search = params.toString(); }).classList.toggle('on', k === charKey);
  const s1 = section('Animations');
  for (const an of main.rig.anims) btn(s1, an, () => { main.showreel = false; playOn(main, an); });
  if (main.rig.expressions) {
    const s2 = section('Expressions (again = auto)');
    for (const e of main.rig.expressions) btn(s2, e, () => main.rig.setExpression(main.rig._userExpr === e ? null : e));
  }
  const s3 = section('Camera');
  for (const c of Object.keys(cams)) btn(s3, c, () => setCam(c));
  btn(s3, '⟲ 45°', () => { cam.yawGoal += Math.PI / 4; });
  btn(s3, '⟳ 45°', () => { cam.yawGoal -= Math.PI / 4; });
  const s4 = section('Toys');
  btn(s4, 'showreel', () => { main.showreel = !main.showreel; main.reelT = 0; });
  btn(s4, 'freeze', () => { frozen = !frozen; });
  btn(s4, 'props', () => { params.set('props', params.get('props') === '1' ? '0' : '1'); location.search = params.toString(); });
  btn(s4, 'lineup', () => { location.search = ''; });
  btn(s4, 'faces', () => { location.search = 'mode=faces&char=' + charKey; });
  btn(s4, 'all props', () => { location.search = 'mode=props'; });
} else if (mode === 'lineup') {
  // one row of anim buttons per new villager
  for (const a of actors) {
    if (!CHARS[a.ck].isNew) continue;
    const s = section(CHARS[a.ck].name);
    btn(s, 'reel', () => { a.showreel = !a.showreel; a.reelT = 0; });
    for (const an of a.rig.anims) btn(s, an, () => { a.showreel = false; playOn(a, an); });
    btn(s, 'solo', () => { location.search = 'char=' + a.ck + '&props=1'; });
  }
  const s3 = section('View');
  btn(s3, 'freeze', () => { frozen = !frozen; });
  btn(s3, '⟲ 45°', () => { cam.yawGoal += Math.PI / 4; });
  btn(s3, '⟳ 45°', () => { cam.yawGoal -= Math.PI / 4; });
  btn(s3, 'props', () => { location.search = 'mode=props'; });
}

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
      if (a.exprCycle) { const ex = a.rig.expressions; a.rig.setExpression(ex[(a.reelI * 3) % ex.length], { hold: d }); }
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
window.__step = (sec) => { for (let t = 0; t < sec; t += STEP) for (const a of actors) stepActor(a, STEP); };
window.__seek = (sec) => { for (const a of actors) { if (a.frozen) continue; playOn(a, a.rig.current, 0); sim(a.rig, sec); } };
function frame(now) {
  const real = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!frozen) {
    acc += real;
    let n = 0;
    while (acc >= STEP && n < 8) { acc -= STEP; n++; for (const a of actors) stepActor(a, STEP); }
    if (acc > STEP * 8) acc = 0;
  }
  cam.update(real, pr);
  pr.render(scene, cam);
  if (main) labelEl.innerHTML = `${CHARS[charKey].name}: ${main.rig.current}<small>${main.showreel ? 'showreel' : main.rig._userExpr || 'auto face'}</small>`;
  for (const L of labels) {
    if (!L.el) {
      L.el = document.createElement('div');
      L.el.style.cssText = 'position:fixed;font:bold 12px Trebuchet MS;color:#fff4e0;text-shadow:0 1px 0 #3a2150,0 0 4px #3a2150;transform:translateX(-50%);pointer-events:none;white-space:nowrap';
      document.body.appendChild(L.el);
    }
    L.el.textContent = L.text + (mode === 'lineup' && CHARS[L.a.ck].isNew ? ': ' + L.a.rig.current : '');
    tmp.copy(L.a.rig.root.position); tmp.y -= 0.05;
    const s = cam.worldToScreen(tmp, pr);
    L.el.style.left = s.x + 'px'; L.el.style.top = s.y + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__v = { actors, scene, cam, pr, THREE, sim, setCam, P, P2, CHARS, events };
window.__ready = true;
