// Critters preview (moose courier, deer guy, ducks, beaver).
//   ?char=beaver|moose|deer|duck|duckF  &anim=chop &expr=happy &zoom=close|mid|far|game &yaw=30 &t=1.2 &freeze=1 &ui=0
//   &showreel=1                       cycle every animation of the character
//   ?mode=strip&char=beaver&anim=chop&n=8&dt=0.1&t0=0   filmstrip (frozen frames side by side)
//   ?mode=lineup&zoom=game            every character side by side, each on its showreel
//   ?mode=props                       packages, lawn chairs, can, cooler
import * as THREE from 'three';
import * as M from '../src/entities/critters3d.js';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'rig';
const num = (k, d) => (params.has(k) ? +params.get(k) : d);
const STEP = 1 / 60;

// ------------------------------------------------------------------ characters
const CHARS = {
  beaver: { make: () => new M.BeaverRig(), h: 0.65, reel: { idle: 5.4, run: 2.2, chop: 3, carry_log: 3, hammer: 2.8, eat_berry: 4.8, cheer: 2.5, sleep: 4, swim: 3.3, plow: 3, wave: 2.4 } },
  moose: { make: () => M.MooseCourier && new M.MooseCourier(), h: 1.7, reel: { ride: 3, ring_bell: 1.6, brake: 1.6, hop_off: 1.8, wave: 2.4, thumbs_up: 2, toss_package: 2.2, hop_on: 1.8, ride_away: 3 } },
  deer: { make: () => M.DeerGuy && new M.DeerGuy(), h: 1.35, reel: { idle: 4, drink: 3, wave: 2.4, cheers: 2.4, laugh: 3.2, point_laugh: 3, sit_chair: 4, stand: 1.6 } },
  duck: { make: () => M.Duck && new M.Duck({ sex: 'm' }), h: 0.35, reel: { waddle: 3, peck: 2.4, quack: 2, flap: 2, swim: 3, chase_flee: 2.5, sit: 3 } },
  duckF: { make: () => M.Duck && new M.Duck({ sex: 'f' }), h: 0.35, reel: { waddle: 3, peck: 2.4, quack: 2, flap: 2, swim: 3, chase_flee: 2.5, sit: 3 } },
};
const charKey = CHARS[params.get('char')] ? params.get('char') : 'beaver';

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
      if (Math.abs(x) < 10 && Math.abs(z) < 10) continue;
      if (rnd() < 0.65) { v.set(x, 0, z, 0x5f8f33); v.set(x, 1, z, 0x6fa03c); v.set(x + 1, 0, z, 0x6fa03c); }
      else { const pc = [0xff8fb0, 0xffe066, 0xffffff, 0xb48cff][Math.floor(rnd() * 4)]; v.set(x, 0, z, 0x4f8a34); v.set(x, 1, z, 0xffd23f); v.set(x + 1, 1, z, pc); v.set(x - 1, 1, z, pc); v.set(x, 1, z + 1, pc); v.set(x, 1, z - 1, pc); }
    }
  }, 0.05);
  scene.add(deco);
  return g;
}
const EXTRAS = {
  tree: () => vox((v) => {
    for (let y = 0; y < 22; y++) for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      const nib = y >= 5 && y <= 8 ? 1.4 : 0;
      if (r > 4 - nib) continue;
      v.set(x, y, z, r > 3.2 - nib ? ((x * 3 + y + z) % 4 === 0 ? 0x5a3a22 : 0x6e4a2c) : 0xe8c890);
    }
    for (let x = -8; x <= 7; x++) for (let y = 20; y < 30; y++) for (let z = -8; z <= 7; z++) {
      if (Math.hypot(x + 0.5, (y - 25) * 1.3, z + 0.5) > 7.5) continue;
      v.set(x, y, z, (x + y + z) % 5 === 0 ? 0x4c9a3c : 0x3e8a34);
    }
  }, 0.05),
  water: () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.024, 2.4), new THREE.MeshLambertMaterial({ color: 0x3aa0d8, transparent: true, opacity: 0.78 }));
    m.position.y = -0.006;
    m.userData.float = true;
    return m;
  },
  chair: () => (M.makeLawnChair ? M.makeLawnChair() : new THREE.Group()),
  cooler: () => (M.makeCooler ? M.makeCooler() : new THREE.Group()),
};
// which extras each animation wants: [name, x, z, yaw]
function extrasFor(ck, anim) {
  if (ck === 'beaver' && anim === 'chop') return [['tree', 0, (M.BEAVER_CHOP_DIST || 0.34) + 0.18, 0]];
  if ((ck === 'beaver' || ck.startsWith('duck')) && anim === 'swim') return [['water', 0, 0, 0]];
  if (ck === 'deer' && (anim === 'sit_chair' || anim === 'stand' || params.get('seated') === '1')) return [['chair', 0, 0, 0], ['cooler', 0.62, 0.15, -0.4]];
  return [];
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
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
const ground = makeGround(scene);

const actors = []; // { rig, ck, extras: [], reel, reelI, reelT, label }
const particles = [];
const pGeo = new THREE.BoxGeometry(1, 1, 1);
const pMats = new Map();
function spawnBits(pos, n, color, speed = 1.4, size = 0.025, up = 1.6) {
  let mat = pMats.get(color);
  if (!mat) { mat = new THREE.MeshLambertMaterial({ color }); pMats.set(color, mat); }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, mat);
    m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
    m.position.copy(pos);
    scene.add(m);
    particles.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * speed, up * (0.6 + Math.random() * 0.8), (Math.random() - 0.3) * speed), spin: Math.random() * 10, life: 1.2 });
  }
}
const flying = []; // tossed packages
function onEvent(a) {
  return (name, rig, data) => {
    if (params.has('events')) console.log('event', name);
    const L = (x, y, z) => rig.root.localToWorld(new THREE.Vector3(x, y, z));
    if (name === 'chop_hit') spawnBits(L(0, 0.16, (M.BEAVER_CHOP_DIST || 0.34) - 0.02), 3, Math.random() < 0.5 ? 0xe8c890 : 0xc89a5a);
    if (name === 'hammer_hit') spawnBits(L(-0.05, 0.02, M.BEAVER_HAMMER_DIST || 0.3), 4, 0xb89a78, 0.9, 0.02, 0.8);
    if (name === 'splash') spawnBits(L(0, 0.02, -0.2), 4, 0xbfe8ff, 0.6, 0.02, 1.2);
    if (name === 'toss' && data && data.object) {
      scene.add(data.object);
      flying.push({ o: data.object, v: data.velocity.clone(), life: 3, spin: (Math.random() - 0.5) * 6 });
    }
  };
}
function addActor(ck, x, z, anim) {
  const C = CHARS[ck];
  const rig = C.make();
  if (!rig) return null;
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = THREE.MathUtils.degToRad(num('face', 0));
  scene.add(rig.root);
  const a = { rig, ck, extras: [], reel: Object.entries(C.reel), reelI: -1, reelT: 0, home: new THREE.Vector3(x, 0, z) };
  rig.onEvent = onEvent(a);
  if (rig.hold && ck === 'moose' && M.makePackage) rig.hold(M.makePackage(params.get('pkg') || 'box'));
  actors.push(a);
  playOn(a, anim || rig.anims[0], 0);
  return a;
}
function playOn(a, anim, fade = 0.25) {
  a.rig.play(anim, { fade, restart: true });
  for (const e of a.extras) scene.remove(e);
  a.extras = extrasFor(a.ck, anim).map(([n, x, z, yaw]) => {
    const o = EXTRAS[n]();
    const ry = a.rig.root.rotation.y;
    o.position.add(new THREE.Vector3(a.rig.root.position.x + x * Math.cos(ry) + z * Math.sin(ry), 0, a.rig.root.position.z - x * Math.sin(ry) + z * Math.cos(ry)));
    o.rotation.y = yaw + ry;
    scene.add(o);
    return o;
  });
  if (a.ck === 'moose' && anim === 'toss_package' && M.makePackage && !a.rig.held) a.rig.hold(M.makePackage(['box', 'egg_crate', 'envelope'][Math.floor(Math.random() * 3)]), 'basket');
}
const sim = (rig, seconds) => { for (let t = 0; t < seconds - 1e-6; t += STEP) rig.update(Math.min(STEP, seconds - t)); };

// ------------------------------------------------------------------ cameras
const H = CHARS[charKey].h;
const cams = {
  face: { wupp: 0.0024 * H / 1.25, y: H * 0.78, pitch: 8 },
  close: { wupp: 0.004 * H / 1.25, y: H * 0.55, pitch: 12 },
  mid: { wupp: 0.008 * H / 1.25, y: H * 0.5, pitch: 22 },
  far: { wupp: 0.016, y: 0.3, pitch: 35 },
  game: { wupp: 0.045, y: 0.2, pitch: 44 },
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
  const n = num('n', 8), dtS = num('dt', 0.15), t0 = num('t0', 0), gap = num('gap', H * 0.9 + 0.15);
  for (let i = 0; i < n; i++) {
    const a = addActor(charKey, (i - (n - 1) / 2) * gap, 0, anim);
    if (params.get('expr')) a.rig.setExpression(params.get('expr'));
    a.rig.play(anim, { fade: 0, restart: true });
    sim(a.rig, t0 + i * dtS);
    a.frozen = true;
    labels.push({ a, text: (t0 + i * dtS).toFixed(2) + 's' });
  }
  cams.strip = { wupp: (n * gap + 0.2) / (innerWidth / 3) * 1.0, y: H * 0.5, pitch: 14 };
  setCam(params.get('zoom') || 'strip');
  labelEl.innerHTML = `${charKey}: ${anim}<small>filmstrip, dt ${dtS}s</small>`;
} else if (mode === 'lineup') {
  const keys = (params.get('chars') || 'moose,deer,beaver,duck,duckF').split(',');
  let x = -1.4;
  const xs = { moose: 1.3, deer: 0.9, beaver: 0.6, duck: 0.4, duckF: 0.4 };
  for (const k of keys) {
    const a = addActor(k, x, 0, params.get('anim') || null);
    if (a) { a.showreel = params.get('showreel') !== '0'; labels.push({ a, text: k }); }
    x += xs[k] || 0.8;
  }
  cams.lineup = { wupp: 0.008, y: 0.6, pitch: 20 };
  setCam(params.get('zoom') || 'lineup');
} else if (mode === 'props') {
  const items = [];
  if (M.makePackage) for (const k of ['box', 'egg_crate', 'envelope']) items.push(M.makePackage(k));
  if (M.makeLawnChair) items.push(M.makeLawnChair(), M.makeLawnChair('blue'));
  if (M.makeDaisyBeerCan) items.push(M.makeDaisyBeerCan());
  if (M.makeCooler) items.push(M.makeCooler());
  let x = -(items.length - 1) * 0.3;
  for (const o of items) { o.position.x = x; x += 0.6; scene.add(o); }
  cams.props = { wupp: 0.0035, y: 0.25, pitch: 25 };
  setCam(params.get('zoom') || 'props');
} else {
  main = addActor(charKey, 0, 0, params.get('anim'));
  main.showreel = params.get('showreel') === '1';
  if (params.get('expr')) main.rig.setExpression(params.get('expr'));
  if (params.has('t')) sim(main.rig, num('t', 0));
  setCam(camName);
}
let frozen = params.get('freeze') === '1';
window.__crit = { actors, scene, cam, pr, THREE, sim, setCam, M };

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui');
if (params.get('ui') === '0' || mode !== 'rig') ui.classList.add('hide');
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
  if (charKey === 'moose' && M.makePackage) for (const k of ['box', 'egg_crate', 'envelope']) btn(s4, 'hold ' + k, () => main.rig.hold(M.makePackage(k), 'basket'));
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
    }
  }
  a.rig.update(dt);
  // moose: the rig reports ground speed; move the root so the wheels roll true
  if (a.rig.speed !== undefined) {
    a.rig.root.position.z += a.rig.speed * dt;
    if (a.rig.root.position.z > a.home.z + 2.5) { a.rig.root.position.z = a.home.z - 2.5; for (const e of a.extras) e.position.z -= 5; }
  }
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
      for (let i = particles.length - 1; i >= 0; i--) {
        const P = particles[i];
        P.v.y -= 7 * STEP; P.m.position.addScaledVector(P.v, STEP); P.m.rotation.x += P.spin * STEP; P.life -= STEP;
        if (P.m.position.y < 0.01) { P.m.position.y = 0.01; P.v.multiplyScalar(0.3); P.spin = 0; }
        if (P.life <= 0) { scene.remove(P.m); particles.splice(i, 1); }
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const F = flying[i];
        F.v.y -= 9.8 * STEP; F.o.position.addScaledVector(F.v, STEP); F.o.rotation.x += F.spin * STEP; F.life -= STEP;
        if (F.o.position.y < 0) { F.o.position.y = 0; F.v.set(0, 0, 0); F.spin = 0; }
        if (F.life <= 0) { scene.remove(F.o); flying.splice(i, 1); }
      }
    }
    if (acc > STEP * 8) acc = 0;
  }
  if (main && main.rig.speed !== undefined && mode === 'rig') { cam.goal.z = main.rig.root.position.z; cam.target.z = cam.goal.z; }
  cam.update(real, pr);
  pr.render(scene, cam);
  if (main) labelEl.innerHTML = `${charKey}: ${main.rig.current}<small>${main.showreel ? 'showreel' : main.rig._userExpr || 'auto face'}</small>`;
  for (const L of labels) {
    if (!L.el) {
      L.el = document.createElement('div');
      L.el.style.cssText = 'position:fixed;font:bold 12px Trebuchet MS;color:#fff4e0;text-shadow:0 1px 0 #3a2150,0 0 4px #3a2150;transform:translateX(-50%);pointer-events:none';
      document.body.appendChild(L.el);
    }
    L.el.textContent = L.text + (mode === 'lineup' ? ': ' + L.a.rig.current : '');
    tmp.copy(L.a.rig.root.position); tmp.y -= 0.05;
    const s = cam.worldToScreen(tmp, pr);
    L.el.style.left = s.x + 'px'; L.el.style.top = s.y + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__ready = true;
