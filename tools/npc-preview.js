// NPC preview: every neighbour rig side by side with Reynard for scale.
//   (default) lineup              all NPCs + the fox, each cycling its anims (&anim=talk to pin one, &showreel=0)
//     &zoom=close|game|face       camera (game = the in-game default zoom, pixel renderer)
//     &chars=hoot,pip             subset     &exprs=1 cycle expressions too     &fox=0 hide Reynard
//     &world=1                    scale each rig to its in-game CAST height (as Villagers does: none, rigs are authored to size)
//   ?char=pip                     one NPC with buttons (anims, expressions, talk, mood, camera)
//   ?mode=faces&char=hoot         every expression of one NPC
//   ?mode=heads                   head-ratio overlay: prints each rig's head / total height
//   window.__test()               plays every anim + expression of every NPC, returns errors / heights / head ratios
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';
import * as C3 from '../src/entities/critters3d.js';
import { FoxRig } from '../src/entities/foxRig.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || (params.has('char') ? 'rig' : 'lineup');
const num = (k, d) => (params.has(k) ? +params.get(k) : d);
const STEP = 1 / 60;
const errors = [];
addEventListener('error', (e) => errors.push(String(e.message)));
const _ce = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); _ce(...a); };

// same order as the map, left to right; height = Villagers CAST height
const NPCS = {
  pip: { cls: 'ChipmunkTrader', name: 'Pip', h: 1.25, reel: ['idle', 'talk', 'wave', 'count_logs', 'stuff_cheeks', 'haggle', 'walk', 'happy', 'laugh'] },
  chip: { cls: 'WoodpeckerCarpenter', name: 'Chip', h: 1.45, reel: ['idle', 'talk', 'wave', 'peck_wood', 'measure', 'saw', 'inspect', 'hammer', 'walk', 'happy'] },
  hazel: { cls: 'HedgehogBaker', name: 'Hazel', h: 1.5, reel: ['idle', 'talk', 'wave', 'roll_dough', 'taste', 'curl_up', 'walk', 'happy', 'laugh'] },
  clover: { cls: 'BunnyGardener', name: 'Clover', h: 1.6, reel: ['idle', 'talk', 'wave', 'water_plants', 'dig', 'sniff', 'walk', 'happy', 'laugh'] },
  otis: { cls: 'OtterFisher', name: 'Otis', h: 1.45, reel: ['idle', 'talk', 'wave', 'cast_line', 'hold_fish', 'juggle_pebble', 'walk', 'happy', 'laugh'] },
  hoot: { cls: 'OwlRanger', name: 'Hoot', h: 1.6, reel: ['idle', 'talk', 'wave', 'binoculars', 'head_turn', 'write_notes', 'walk', 'happy', 'laugh'] },
  granny: { cls: 'FrogGranny', name: 'Granny', h: 1.4, reel: ['idle', 'talk', 'wave', 'tongue_catch', 'laugh', 'walk', 'happy'] },
  rocco: { cls: 'RaccoonMerchant', name: 'Rocco', h: 1.4, reel: ['idle', 'talk', 'wave', 'count_coins', 'rummage', 'show_item', 'walk', 'happy', 'laugh'] },
  shellby: { cls: 'TurtleElder', name: 'Shellby', h: 1.3, reel: ['idle', 'talk', 'wave', 'sip_tea', 'doze', 'walk', 'happy', 'laugh'] },
  dale: { cls: 'DeerGuy', name: 'Dale', h: 1.9, reel: ['idle', 'talk', 'wave', 'laugh', 'cheers', 'drink', 'walk'] },
};
const make = (k) => { const Cls = C3[NPCS[k].cls]; return Cls ? new Cls() : null; };

// ------------------------------------------------------------------ scene
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
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
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 });
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
{
  const rnd = mulberry(7), v = new VoxelModel(), R = 70;
  for (let x = -R; x < R; x++) for (let z = -R / 2; z < R / 2; z++) { const h = rnd(); v.set(x, -1, z, h < 0.12 ? 0x78a441 : h > 0.9 ? 0x6a9438 : 0x6e993b); }
  const g = new THREE.Mesh(v.build({ pivot: [0, 0, 0], scale: 0.1 }), voxelMaterial());
  g.receiveShadow = true;
  scene.add(g);
}

const actors = [];
function addActor(key, x, z, anim) {
  const rig = key === 'fox' ? new FoxRig() : make(key);
  if (!rig) { errors.push('no rig ' + key); return null; }
  rig.root.position.set(x, 0, z);
  rig.root.rotation.y = THREE.MathUtils.degToRad(num('face', 0));
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(rig.root);
  const reel = key === 'fox' ? ['idle', 'talk', 'wave'].filter((n) => rig.anims.includes?.(n) ?? true) : NPCS[key].reel.filter((n) => rig.anims.includes(n));
  const a = { key, rig, reel, reelI: -1, reelT: 0, showreel: params.get('showreel') !== '0' && !anim };
  if (anim) rig.play(anim, { loop: true, fade: 0 });
  actors.push(a);
  return a;
}
const sim = (rig, s) => { for (let t = 0; t < s - 1e-6; t += STEP) rig.update(Math.min(STEP, s - t)); };

function visibleBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || o.isSprite || !shown(o) || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}
/** Head share of the total height: bottom of the head joint's meshes to the top of everything. */
function headRatio(rig) {
  const all = visibleBox(rig.root);
  const head = rig.head || rig.j?.head || rig.joints?.head;
  if (!head) return null;
  const hb = visibleBox(head);
  return +((all.max.y - hb.min.y) / (all.max.y - all.min.y)).toFixed(3);
}

// ------------------------------------------------------------------ cameras
const cams = {
  face: { wupp: 0.0017, y: 1.0, pitch: 6 },
  close: { wupp: 0.0042, y: 0.7, pitch: 12 },
  game: { wupp: 0.016, y: 0.3, pitch: 44 },
};
const labelEl = document.getElementById('label');
const labels = [];
let main = null;
const setCam = (name, extra = {}) => {
  const c = { ...(cams[name] || cams.close), ...extra };
  cam.wupp = cam.wuppGoal = num('wupp', c.wupp);
  cam.pitch = THREE.MathUtils.degToRad(num('pitch', c.pitch));
  cam.target.y = cam.goal.y = num('cy', c.y);
};
cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 0));
cam.goal.set(num('cx', 0), 0, num('cz', 0));
cam.target.copy(cam.goal);

const charKey = NPCS[params.get('char')] ? params.get('char') : 'pip';
if (mode === 'lineup' || mode === 'heads') {
  const keys = (params.get('chars') || Object.keys(NPCS).join(',')).split(',').filter((k) => NPCS[k]);
  if (params.get('fox') !== '0') keys.unshift('fox');
  const gap = num('gap', 1.0);
  keys.forEach((k, i) => {
    const a = addActor(k, (i - (keys.length - 1) / 2) * gap, 0, params.get('anim'));
    if (!a) return;
    a.exprCycle = params.get('exprs') === '1';
    if (mode === 'heads') { a.showreel = false; sim(a.rig, 0.5); a.frozen = params.get('freeze') !== '0'; }
    labels.push({ a, text: k === 'fox' ? 'Reynard' : NPCS[k].name });
  });
  const zoom = params.get('zoom') || 'close';
  if (zoom === 'close') setCam('close', { wupp: (keys.length * gap + 0.4) / (innerWidth / 3) });
  else setCam(zoom);
  if (mode === 'heads') {
    const rows = actors.map((a) => `${a.key}: h ${visibleBox(a.rig.root).max.y.toFixed(2)} head ${headRatio(a.rig)}`);
    labelEl.innerHTML = 'head ratio<small>' + rows.join('<br>') + '</small>';
  }
} else if (mode === 'faces') {
  const tmp = make(charKey);
  const ex = tmp.expressions;
  tmp.dispose();
  const gap = 0.9;
  ex.forEach((e, i) => {
    const a = addActor(charKey, (i - (ex.length - 1) / 2) * gap, 0, 'idle');
    a.rig.setExpression(e);
    sim(a.rig, 0.4);
    a.frozen = true;
    labels.push({ a, text: e });
  });
  setCam('face', { wupp: (ex.length * gap + 0.2) / (innerWidth / 3), y: NPCS[charKey].h * 0.7 });
  labelEl.innerHTML = `${NPCS[charKey].name}<small>expressions</small>`;
} else {
  main = addActor(charKey, 0, 0, params.get('anim'));
  if (params.get('expr')) main.rig.setExpression(params.get('expr'));
  if (params.has('t')) sim(main.rig, num('t', 0));
  main.showreel = params.get('showreel') === '1';
  const z = params.get('zoom') || 'close';
  setCam(z, z === 'close' ? { wupp: 0.0024, y: NPCS[charKey].h * 0.5 } : z === 'face' ? { y: NPCS[charKey].h * 0.72 } : {});
}
let frozen = params.get('freeze') === '1';

// ------------------------------------------------------------------ automated check
window.__test = () => {
  const out = { errors: [...errors], ran: 0, heights: {}, head: {}, anims: {} };
  for (const k of Object.keys(NPCS)) {
    let rig;
    try { rig = make(k); } catch (e) { out.errors.push(k + ' ctor ' + e.message); continue; }
    scene.add(rig.root);
    sim(rig, 0.5);
    out.heights[k] = +visibleBox(rig.root).max.y.toFixed(3);
    out.head[k] = headRatio(rig);
    out.anims[k] = rig.anims.length;
    for (const an of rig.anims) {
      try {
        rig.play(an, { fade: 0.2 });
        sim(rig, (rig._ANIMS[an].dur || 3) + 0.6);
        let bad = false;
        rig.root.traverse((o) => { if (!Number.isFinite(o.position.x + o.position.y + o.position.z + o.rotation.x + o.rotation.y + o.rotation.z + o.scale.x)) bad = true; });
        if (bad) out.errors.push(k + ':' + an + ' NaN');
        out.ran++;
      } catch (e) { out.errors.push(k + ':' + an + ' ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
    }
    for (const ex of rig.expressions) {
      try { rig.setExpression(ex); sim(rig, 0.2); } catch (e) { out.errors.push(k + ' expr ' + ex + ' ' + e.message); }
    }
    rig.setExpression(null);
    rig.dispose();
  }
  return out;
};

// ------------------------------------------------------------------ UI
const ui = document.getElementById('ui');
if (params.get('ui') === '0' || mode !== 'rig') ui.classList.add('hide');
const btn = (parent, text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; parent.appendChild(b); return b; };
const section = (title) => { const h = document.createElement('h3'); h.textContent = title; ui.appendChild(h); const d = document.createElement('div'); ui.appendChild(d); return d; };
if (main) {
  const s0 = section('Character');
  for (const k of Object.keys(NPCS)) btn(s0, NPCS[k].name, () => { params.set('char', k); params.delete('anim'); location.search = params.toString(); }).classList.toggle('on', k === charKey);
  const s1 = section('Animations');
  for (const an of main.rig.anims) btn(s1, an, () => { main.showreel = false; main.rig.play(an, { restart: true }); });
  const s2 = section('Expressions (again = auto)');
  for (const e of main.rig.expressions) btn(s2, e, () => main.rig.setExpression(main.rig._userExpr === e ? null : e));
  const s3 = section('Camera');
  btn(s3, 'face', () => setCam('face', { y: NPCS[charKey].h * 0.72 }));
  btn(s3, 'close', () => setCam('close', { wupp: 0.0024, y: NPCS[charKey].h * 0.5 }));
  btn(s3, 'game', () => setCam('game'));
  btn(s3, 'rotate 45', () => { cam.yawGoal += Math.PI / 4; });
  const s4 = section('Toys');
  btn(s4, 'showreel', () => { main.showreel = !main.showreel; main.reelT = 0; });
  btn(s4, 'freeze', () => { frozen = !frozen; });
  btn(s4, 'lineup', () => { location.search = ''; });
  btn(s4, 'faces', () => { location.search = 'mode=faces&char=' + charKey; });
}

// ------------------------------------------------------------------ loop
function stepActor(a, dt) {
  if (a.frozen) return;
  if (a.showreel && a.reel.length) {
    a.reelT -= dt;
    if (a.reelT <= 0) {
      a.reelI = (a.reelI + 1) % a.reel.length;
      const an = a.reel[a.reelI];
      a.rig.play(an, { fade: 0.25, restart: true });
      const d = a.key === 'fox' ? 3 : a.rig._ANIMS?.[an]?.dur;
      a.reelT = Math.max(2.4, Math.min(6, d || 3.5));
      if (a.exprCycle && a.rig.expressions) { const ex = a.rig.expressions; a.rig.setExpression(ex[(a.reelI * 3) % ex.length], { hold: a.reelT }); }
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
  if (main) labelEl.innerHTML = `${NPCS[charKey].name}: ${main.rig.current}<small>${main.rig._userExpr || 'auto face'}</small>`;
  for (const L of labels) {
    if (!L.el) {
      L.el = document.createElement('div');
      L.el.style.cssText = 'position:fixed;font:bold 12px Trebuchet MS;color:#fff4e0;text-shadow:0 1px 0 #3a2150,0 0 4px #3a2150;transform:translateX(-50%);pointer-events:none;white-space:nowrap;text-align:center';
      document.body.appendChild(L.el);
    }
    L.el.innerHTML = L.text + (mode === 'lineup' && params.get('zoom') !== 'game' ? '<br><small>' + (L.a.rig.current || '') + '</small>' : '');
    tmp.copy(L.a.rig.root.position); tmp.y -= 0.05;
    const s = cam.worldToScreen(tmp, pr);
    L.el.style.left = s.x + 'px'; L.el.style.top = s.y + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__v = { actors, scene, cam, pr, THREE, sim, setCam, NPCS, headRatio, visibleBox };
window.__ready = true;
