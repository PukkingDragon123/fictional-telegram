// Reynard preview.
//   ?mode=sheet            2D face sheet (&what=mouths, &names=a,b, &scale=6)
//   (default)              3D rig: ?anim=wake_startle&expr=smug&zoom=face|close|mid|far|game&yaw=30&pitch=20
//                          &t=1.2 (seek)  &freeze=1  &speed=0.5  &showreel=1  &talk=Hello!  &look=1  &ui=0
//   ?mode=strip&anim=cheer&n=8&dt=0.15&t0=0   filmstrip of one animation (frozen frames side by side)
//   ?mode=grid             every expression on its own fox (close-up grid)
import * as THREE from 'three';
import { FoxFace, expressionState, EXPRESSION_NAMES, FACE_W, FACE_H, MOUTH_W, MOUTH_H, MOUTH_KINDS } from '../src/entities/foxFace.js';
import { FoxRig, FOX_SEAT_HEIGHT, FOX_DESK_HEIGHT, FOX_KEYBOARD_Z } from '../src/entities/foxRig.js';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { VoxelModel, voxelMaterial } from '../src/core/voxel.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'rig';
const num = (k, d) => (params.has(k) ? +params.get(k) : d);

if (mode === 'sheet') faceSheet();
else rigPreview();

// ------------------------------------------------------------------ 2D face sheet
function faceSheet() {
  document.getElementById('c').style.display = 'none';
  document.getElementById('ui').style.display = 'none';
  const sheet = document.getElementById('sheet');
  sheet.style.display = 'block';
  const S = num('scale', 5), t = num('t', 0);
  let names = params.get('what') === 'mouths' ? MOUTH_KINDS : EXPRESSION_NAMES;
  if (params.get('names')) names = params.get('names').split(',');
  for (const name of names) {
    const face = new FoxFace();
    const st = params.get('what') === 'mouths' ? { ...expressionState('neutral'), mouth: name } : expressionState(name);
    st.mono = true;
    st.glintT = st.glint ? 0.5 : 0;
    face.update(st, t);
    const cell = document.createElement('div');
    cell.className = 'cell';
    const cv = document.createElement('canvas');
    cv.width = FACE_W * S; cv.height = FACE_H * S;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#e0662a'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#f8eedc'; g.fillRect(0, 26 * S, cv.width, 22 * S);
    g.drawImage(face.face.c, 0, 0, FACE_W * S, FACE_H * S);
    const mx = 16 * S, my = 28 * S;
    g.fillStyle = '#6a3a20'; g.fillRect(mx - S, my - S, (MOUTH_W + 2) * S, (MOUTH_H + 1) * S);
    g.fillStyle = '#f8eedc'; g.fillRect(mx, my, MOUTH_W * S, MOUTH_H * S);
    g.fillStyle = '#e0662a'; g.fillRect(mx, my, MOUTH_W * S, 4 * S);
    g.fillStyle = '#2a1a22'; g.fillRect(mx + 8 * S, my, 8 * S, 8 * S);
    g.drawImage(face.mouth.c, mx, my, MOUTH_W * S, MOUTH_H * S);
    g.strokeStyle = 'rgba(255,210,63,0.9)'; g.lineWidth = S * 1.2;
    g.beginPath(); g.arc(15 * S, 19 * S, 8.5 * S, 0, Math.PI * 2); g.stroke();
    cell.appendChild(cv);
    const lab = document.createElement('div');
    lab.textContent = name;
    cell.appendChild(lab);
    sheet.appendChild(cell);
  }
}

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

function makeScenery(scene) {
  const g = new THREE.Group();
  scene.add(g);
  const rnd = mulberry(11);
  // grass patch (voxel tiles with a little colour noise)
  const ground = vox((v) => {
    for (let x = -40; x < 40; x++)
      for (let z = -40; z < 40; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > 40) continue;
        const h = rnd();
        const c = d > 37 ? 0x5c8a34 : h < 0.12 ? 0x78a441 : h > 0.9 ? 0x6a9438 : 0x6e993b;
        v.set(x, -1, z, c);
        if (d > 37.5) v.set(x, -2, z, 0x6a4a2a);
      }
  }, 0.1);
  ground.castShadow = false;
  g.add(ground);
  // flowers and tufts (0.05 voxels)
  const deco = vox((v) => {
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, r = 16 + rnd() * 58;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      const k = rnd();
      if (k < 0.6) {
        v.set(x, 0, z, 0x5f8f33); v.set(x, 1, z, 0x6fa03c);
        if (rnd() < 0.6) { v.set(x + 1, 0, z, 0x6fa03c); v.set(x + 1, 1, z + 1, 0x7aab45); }
        if (rnd() < 0.5) v.set(x - 1, 0, z + 1, 0x5f8f33);
      } else {
        const pc = [0xff8fb0, 0xffe066, 0xffffff, 0xb48cff, 0xff9a6a][Math.floor(rnd() * 5)];
        v.set(x, 0, z, 0x4f8a34); v.set(x, 1, z, 0x4f8a34); v.set(x, 2, z, 0xffd23f);
        v.set(x + 1, 2, z, pc); v.set(x - 1, 2, z, pc); v.set(x, 2, z + 1, pc); v.set(x, 2, z - 1, pc);
      }
    }
  }, 0.05);
  g.add(deco);
  // cozy lab corner (shown for the sit animations)
  const lab = new THREE.Group();
  g.add(lab);
  const S = 0.025;
  const chair = vox((v) => {
    const top = Math.round(FOX_SEAT_HEIGHT / S) - 1;
    for (let x = -8; x <= 7; x++) for (let z = -10; z <= 5; z++) { v.set(x, top, z, 0x3a3048); v.set(x, top - 1, z, 0x2a2236); }
    for (let x = -7; x <= 6; x++) for (let y = top + 1; y <= top + 20; y++) { v.set(x, y, -11, y > top + 17 ? 0x4a3d5c : 0x3a3048); v.set(x, y, -12, 0x2a2236); }
    for (let y = 2; y < top - 1; y++) { v.set(-1, y, -3, 0x8a8aa0); v.set(0, y, -3, 0x9a9ab0); v.set(-1, y, -2, 0x7a7a90); v.set(0, y, -2, 0x8a8aa0); }
    for (let k = -8; k <= 7; k++) { v.set(k, 1, -3, 0x5a5a6a); v.set(-1, 1, k - 3, 0x5a5a6a); }
    for (const [x, z] of [[-8, -3], [7, -3], [-1, -11], [-1, 5]]) v.set(x, 0, z, 0x1a1a22);
  }, S);
  lab.add(chair);
  const desk = vox((v) => {
    const top = Math.round(FOX_DESK_HEIGHT / S) - 1;
    const z0 = Math.round((FOX_KEYBOARD_Z - 0.12) / S), z1 = z0 + 26;
    for (let x = -26; x <= 25; x++) for (let z = z0; z <= z1; z++) { v.set(x, top, z, (x + z) % 7 === 0 ? 0x8a5a32 : 0x9a6a3a); v.set(x, top - 1, z, 0x7a4a2a); }
    for (const x of [-26, 25]) for (let y = 0; y < top - 1; y++) for (let z = z0; z <= z0 + 1; z++) { v.set(x, y, z, 0x7a4a2a); v.set(x, y, z1 - (z - z0), 0x7a4a2a); }
    // keyboard
    const kz = Math.round(FOX_KEYBOARD_Z / S);
    for (let x = -9; x <= 8; x++) for (let z = kz - 3; z <= kz + 3; z++) v.set(x, top + 1, z, (x + z) % 2 ? 0xd8d0c0 : 0xc8c0b0);
    for (let x = -9; x <= 8; x += 2) for (let z = kz - 2; z <= kz + 2; z += 2) v.set(x, top + 2, z, 0xf0ead8);
    // CRT monitor
    const mz = z1 - 8;
    for (let x = -12; x <= 11; x++) for (let y = top + 1; y <= top + 20; y++) for (let z = mz - 4; z <= mz + 6; z++) {
      const edge = x === -12 || x === 11 || y === top + 1 || y === top + 20;
      v.set(x, y, z, z === mz - 4 && !edge ? ((y + x) % 3 === 0 ? 0x4affa0 : 0x1a4a3a) : 0xd8ccb0);
    }
    // mug
    for (let y = top + 1; y <= top + 5; y++) for (let x = 16; x <= 19; x++) for (let z = z0 + 4; z <= z0 + 7; z++) v.set(x, y, z, 0xdc4136);
  }, S);
  lab.add(desk);
  const glow = new THREE.PointLight(0x6affc0, 0.6, 2.2);
  glow.position.set(0, FOX_DESK_HEIGHT + 0.3, FOX_KEYBOARD_Z + 0.2);
  lab.add(glow);
  lab.visible = false;
  return { group: g, lab, ground };
}

// ------------------------------------------------------------------ 3D preview
function rigPreview() {
  const canvas = document.getElementById('c');
  const pr = new PixelRenderer(canvas);
  pr.pixelDensity = num('density', 1);
  const cam = new CameraRig();
  cam.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  cam.minWupp = 0.0005; cam.maxWupp = 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc4e8);
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.35);
  sun.position.set(4, 9, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 0.5; sc.far = 40;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.01;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1));
  const scenery = makeScenery(scene);
  if (params.has('haze') && pr.postMat.uniforms.haze) pr.postMat.uniforms.haze.value = num('haze', 0);

  const foxes = [];
  const labels = [];
  const labelEl = document.getElementById('label');
  let main = null;
  const STEP = 1 / 60;
  const pellets = [];
  const pelletGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
  const pelletMat = new THREE.MeshLambertMaterial({ color: 0xd9a55a });

  const spawnFox = (x, z) => {
    const f = new FoxRig({ shadows: true });
    f.root.position.set(x, 0, z);
    scene.add(f.root);
    foxes.push(f);
    return f;
  };
  const sim = (f, seconds) => { for (let t = 0; t < seconds - 1e-6; t += STEP) f.update(Math.min(STEP, seconds - t)); };

  const cams = {
    face: { wupp: 0.0017, y: 1.0, pitch: 8 },
    close: { wupp: 0.0026, y: 0.95, pitch: 12 },
    mid: { wupp: 0.0062, y: 0.78, pitch: 20 },
    far: { wupp: 0.018, y: 0.5, pitch: 35 },
    game: { wupp: 0.045, y: 0.4, pitch: 44 },
  };
  let camName = params.get('zoom') || 'mid';
  const camBtns = {};
  const setCam = (name) => {
    camName = cams[name] ? name : 'mid';
    const c = cams[camName];
    cam.wupp = cam.wuppGoal = num('wupp', c.wupp);
    cam.pitch = THREE.MathUtils.degToRad(num('pitch', c.pitch));
    cam.target.y = cam.goal.y = num('cy', c.y);
    for (const [k, b] of Object.entries(camBtns)) b.classList.toggle('on', k === camName);
  };
  cam.yaw = cam.yawGoal = THREE.MathUtils.degToRad(num('yaw', 0));
  cam.goal.set(num('cx', 0), 0, num('cz', 0));
  cam.target.copy(cam.goal);

  // --- modes
  if (mode === 'strip') {
    const anim = params.get('anim') || 'wake_startle';
    const n = num('n', 8), dtS = num('dt', 0.2), t0 = num('t0', 0), gap = num('gap', 1.25);
    for (let i = 0; i < n; i++) {
      const f = spawnFox((i - (n - 1) / 2) * gap, 0);
      if (params.get('expr')) f.setExpression(params.get('expr'));
      if (anim.startsWith('sit') || anim === 'wake_startle' || params.get('lab') === '1') {
        const lab = scenery.lab.clone(); lab.visible = true; lab.position.copy(f.root.position); scene.add(lab);
      }
      if (params.get('from')) { f.play(params.get('from'), { fade: 0 }); sim(f, num('fromT', 1)); }
      f.play(anim, { fade: params.get('from') ? 0.2 : 0 });
      sim(f, t0 + i * dtS);
      labels.push({ f, text: (t0 + i * dtS).toFixed(2) + 's' });
    }
    scenery.ground.scale.set(Math.max(1, (n * gap) / 7), 1, 1);
    cams.strip = { wupp: (n * gap + 0.4) / 640, y: 0.72, pitch: 16 };
    setCam(params.get('zoom') || 'strip');
    labelEl.innerHTML = `${anim}<small>filmstrip, dt ${dtS}s</small>`;
  } else if (mode === 'grid') {
    const names = params.get('names') ? params.get('names').split(',') : EXPRESSION_NAMES;
    const cols = num('cols', 6), gx = 0.95, gz = 1.4;
    names.forEach((name, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const f = spawnFox((c - (cols - 1) / 2) * gx, r * gz);
      f.setExpression(name);
      f.play(params.get('anim') || 'idle', { fade: 0 });
      sim(f, 0.5);
      labels.push({ f, text: name });
    });
    const rows = Math.ceil(names.length / cols);
    cam.goal.set(0, 0, (rows - 1) * gz * 0.5); cam.target.copy(cam.goal);
    cams.grid = { wupp: 0.0095, y: 0.9, pitch: 14 };
    setCam(params.get('zoom') || 'grid');
  } else {
    main = spawnFox(0, 0);
    main.onEvent = (name) => {
      if (name === 'release') {
        for (let i = 0; i < 9; i++) {
          const m = new THREE.Mesh(pelletGeo, pelletMat);
          main.armR.grip.getWorldPosition(m.position);
          scene.add(m);
          pellets.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.2, 2 + Math.random() * 1.2, 2.4 + Math.random() * 1.2), life: 1.6 });
        }
      }
      if (params.has('events')) console.log('event', name);
    };
    setCam(camName);
  }
  window.__fox = { foxes, main, scene, cam, pr, THREE, sim, setCam };

  // --- UI
  const ui = document.getElementById('ui');
  if (params.get('ui') === '0' || mode !== 'rig') ui.classList.add('hide');
  let showreel = params.get('showreel') === '1';
  let frozen = params.get('freeze') === '1';
  let lookMouse = params.get('look') === '1';
  const lookTarget = new THREE.Vector3(0, 1, 3);
  const speed = num('speed', 1);
  const btn = (parent, text, fn) => {
    const b = document.createElement('button');
    b.textContent = text; b.onclick = fn; parent.appendChild(b);
    return b;
  };
  const section = (title) => {
    const h = document.createElement('h3'); h.textContent = title; ui.appendChild(h);
    const d = document.createElement('div'); ui.appendChild(d); return d;
  };
  const animBtns = {}, exprBtns = {};
  const refresh = () => {
    if (!main) return;
    for (const [k, b] of Object.entries(animBtns)) b.classList.toggle('on', k === main.current);
    for (const [k, b] of Object.entries(exprBtns)) b.classList.toggle('on', k === main._userExpr);
    labelEl.innerHTML = `${main.current}<small>${showreel ? 'showreel' : main._userExpr || 'auto face'}</small>`;
  };
  const playAnim = (name) => {
    main.play(name, { restart: true, speed });
    scenery.lab.visible = name.startsWith('sit') || name === 'wake_startle';
    refresh();
  };
  let reelI = -1, reelT = 0;
  if (main) {
    const s1 = section('Animations');
    for (const a of main.anims) animBtns[a] = btn(s1, a, () => { showreel = false; playAnim(a); });
    const s2 = section('Expressions (click again = auto)');
    for (const e of main.expressions) exprBtns[e] = btn(s2, e, () => { main.setExpression(main._userExpr === e ? null : e); refresh(); });
    const s3 = section('Camera');
    for (const c of Object.keys(cams)) camBtns[c] = btn(s3, c, () => setCam(c));
    btn(s3, '⟲ 45°', () => { cam.yawGoal += Math.PI / 4; });
    btn(s3, '⟳ 45°', () => { cam.yawGoal -= Math.PI / 4; });
    const s4 = section('Talk');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = params.get('talk') || 'Welcome, my furry friend, to the finest fish pond in all of Canada!';
    s4.appendChild(inp);
    btn(s4, 'talk', () => main.talk(inp.value));
    btn(s4, 'stop', () => main.stopTalking());
    const s5 = section('Toys');
    const lb = btn(s5, 'look at mouse', () => { lookMouse = !lookMouse; lb.classList.toggle('on', lookMouse); main.lookAt(lookMouse ? lookTarget : null); });
    let fish = null;
    btn(s5, 'hold fish', () => {
      if (fish) { main.hold(null); fish = null; return; }
      fish = new THREE.Group();
      const v = new VoxelModel();
      for (let x = -3; x <= 3; x++) for (let y = -1; y <= 1; y++) if (Math.abs(y) + Math.abs(x) * 0.3 < 1.6) v.set(x, y, 0, y > 0 ? 0x6ab0e0 : 0xc8e0f0);
      v.set(4, 0, 0, 0x3c88d8); v.set(5, 1, 0, 0x3c88d8); v.set(5, -1, 0, 0x3c88d8); v.set(-2, 0, 1, 0x1a1420);
      const m = new THREE.Mesh(v.build({ scale: 0.03 }), voxelMaterial());
      m.rotation.z = Math.PI / 2; m.position.y = -0.05;
      fish.add(m); main.hold(fish);
    });
    btn(s5, 'pop hat', () => main.popHat());
    btn(s5, 'drop monocle', () => main.dropMonocle());
    btn(s5, 'restore monocle', () => main.restoreMonocle());
    const sr = btn(s5, 'showreel', () => { showreel = !showreel; sr.classList.toggle('on', showreel); reelT = 0; reelI = -1; });
    const fz = btn(s5, 'freeze', () => { frozen = !frozen; fz.classList.toggle('on', frozen); });
    if (showreel) sr.classList.add('on');
    if (frozen) fz.classList.add('on');
    // initial state from the URL
    if (params.get('expr')) main.setExpression(params.get('expr'));
    if (params.get('from')) { main.play(params.get('from'), { fade: 0 }); sim(main, num('fromT', 1)); }
    playAnim(params.get('anim') || 'idle');
    if (params.get('talk')) main.talk(params.get('talk'));
    if (lookMouse) { main.lookAt(lookTarget); lb.classList.add('on'); }
    if (params.has('t')) sim(main, num('t', 0));
    canvas.addEventListener('pointermove', (e) => {
      cam.screenToGround(e.clientX, e.clientY, pr, 0.9, lookTarget);
      lookTarget.z = Math.max(lookTarget.z, 0.6);
    });
    setCam(camName);
  }

  // --- showreel
  const REEL = [
    ['idle', null, 4], ['idle_scheme', null, 3.5], ['greedy', null, 3], ['count_coins', null, 4.8], ['laugh_evil', null, 3.2],
    ['walk', null, 2.5], ['run', null, 2], ['tiptoe', null, 3.2], ['throw', null, 1.2], ['cheer', null, 1.6], ['dance', null, 4.4],
    ['panic', null, 2.5], ['point', null, 1.6], ['shrug', null, 1.5], ['facepalm', null, 2.2], ['wave', null, 1.8], ['bow', null, 2.6],
    ['talk', 'talk:Ah, a customer! Welcome to the finest fish pond in the land.', 4.5], ['think', null, 3], ['polish_monocle', null, 3.6], ['sneeze', null, 2.2],
    ['yawn', null, 2.8], ['stretch', null, 3], ['sleep_lie', null, 4], ['sit', null, 3], ['sit_type', null, 4], ['sit_sip', null, 3.6],
    ['sit_doze', null, 6.4], ['wake_startle', null, 3.1], ['sit_talk', 'talk:Oh! Ahem. I was merely... resting my eyes.', 3.5], ['sit_laugh', null, 2.8],
    ['angry_stomp', null, 1.9], ['dizzy', null, 2.5], ['faint', null, 3],
  ];
  function stepReel(dt) {
    reelT -= dt;
    if (reelT > 0) return;
    reelI = (reelI + 1) % REEL.length;
    const [a, extra, d] = REEL[reelI];
    main.setExpression(null);
    playAnim(a);
    if (extra && extra.startsWith('talk:')) main.talk(extra.slice(5));
    reelT = d;
    labelEl.innerHTML = `${a}<small>showreel ${reelI + 1}/${REEL.length}</small>`;
  }

  // --- loop (fixed 60 Hz simulation steps, render as fast as the GPU allows)
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
        if (main) {
          if (showreel) stepReel(STEP);
          main.update(STEP);
        } else if (mode === 'grid') for (const f of foxes) f.update(STEP);
        for (let i = pellets.length - 1; i >= 0; i--) {
          const P = pellets[i];
          P.v.y -= 9.8 * STEP; P.m.position.addScaledVector(P.v, STEP); P.life -= STEP;
          if (P.m.position.y < 0.02) { P.m.position.y = 0.02; P.v.set(0, 0, 0); }
          if (P.life <= 0) { scene.remove(P.m); pellets.splice(i, 1); }
        }
      }
      if (acc > STEP * 8) acc = 0;
    }
    cam.update(real, pr);
    pr.render(scene, cam);
    for (const L of labels) {
      if (!L.el) {
        L.el = document.createElement('div');
        L.el.style.cssText = 'position:fixed;font:bold 12px Trebuchet MS;color:#fff4e0;text-shadow:0 1px 0 #3a2150,0 0 4px #3a2150;transform:translateX(-50%);pointer-events:none';
        L.el.textContent = L.text;
        document.body.appendChild(L.el);
      }
      tmp.copy(L.f.root.position); tmp.y -= 0.08;
      const s = cam.worldToScreen(tmp, pr);
      L.el.style.left = s.x + 'px'; L.el.style.top = s.y + 'px';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
