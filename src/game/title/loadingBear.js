// [v33 title] The loading screen's 3D scene: on black, under one hard warm spotlight, one of the game's
// real bears (BearRig, in its outfit) holds a big voxel salmon (the game's own fish voxels, the
// chinook) and eats it from the tail to the head with its real 'eat' chomps. How much salmon is
// left is the loading progress. A tap makes it take a bite. A finished salmon: that bear turns and
// walks off, the next one (another outfit) walks in with a fresh salmon. No text: motion, crumbs
// (the game's voxel debris particles) and sound only. index.html's inline loader draws the black
// and the "42%" until this is up, then just the "%" on top of it.
//
// Rendered by the game's own PixelRenderer (pixel grid + ink outline) on its own scene and camera
// while the game boots; it stops itself as soon as the title or the game starts drawing
// (window.__tbmeLoader.real >= 0.95).
//
//   const L = startLoadingBear(renderer, { audio });   L.stop()
import * as THREE from 'three';
import { CameraRig } from '../../core/cameraRig.js';
import { BearRig } from '../../entities/bearRig.js';
import { BEAR_TYPES } from '../../data/bears.js';
import { SPECIES } from '../../data/species.js';
import { fishVoxels } from '../../entities/fishModels.js';
import { Particles } from '../Particles.js';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';

const CAST = ['office', 'ceo', 'construction', 'chef', 'lumberjack', 'hipster', 'tourist', 'cowboy', 'pirate', 'boss'];
const FV = 0.05; // salmon voxel size (world units): ~0.65x the bear's height, held across the chest
const FLESH = 0xf08a84, FLESH_D = 0xc85a5a, BONE = 0xefe6d0;

export function startLoadingBear(renderer, { audio = null } = {}) {
  const S = window.__tbmeLoader;
  if (!S || S.done) return { stop() {} };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  // light: one hard warm key from above front left, a cool rim from behind, almost no fill
  const key = new THREE.SpotLight(0xffe2b8, 150, 30, 0.42, 0.0, 1.6);
  key.position.set(-2.4, 7.5, 5.2);
  key.target.position.set(0.2, 0.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 1.6);
  rim.position.set(1.5, 3, -6);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x302838, 0x000000, 0.35));
  // the spotlight's pool on the floor: crisp stepped rings, ordered-dithered at each step (no smooth
  // gradient), and a stepped shadow blob under the bear
  const floorU = { uBear: { value: new THREE.Vector2() } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShaderMaterial({
    uniforms: floorU,
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec2 uBear; varying vec2 vP;
      float bay(vec2 a) { a = floor(a); float b2 = fract(a.x * 0.5 + a.y * a.y * 0.75); vec2 c = floor(a * 0.5); return fract(c.x * 0.5 + c.y * c.y * 0.75) * 0.25 + b2; }
      void main() {
        vec2 p = vP - vec2(0.15, 0.2);
        float d = length(p * vec2(1.0, 1.25)) / 2.6 + (bay(gl_FragCoord.xy) - 0.5) * 0.12;
        vec3 c = d < 0.45 ? vec3(0.27, 0.19, 0.14) : d < 0.7 ? vec3(0.17, 0.11, 0.08) : d < 0.9 ? vec3(0.08, 0.05, 0.04) : vec3(0.0);
        float sh = length((vP - uBear) * vec2(1.0, 1.6)) + (bay(gl_FragCoord.xy) - 0.5) * 0.08;
        if (sh < 0.62) c *= sh < 0.45 ? 0.35 : 0.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const P = new Particles(scene);
  P.groundAt = () => 0;

  const rig = new CameraRig();
  rig.freeBounds = true; rig.minWupp = 0.0005; rig.maxWupp = 1;
  const CAMY = 0.5; // a 3/4 front view
  rig.yaw = rig.yawGoal = CAMY;
  rig.pitch = rig.pitchGoal = 0.2;
  rig.dist = 40;
  rig.target.set(0, 1.2, 0); rig.goal.copy(rig.target);
  const fitZoom = () => { const h = renderer.rtH || 300, w = renderer.rtW || 400; rig.wupp = rig.wuppGoal = Math.max(4.3 / Math.max(80, h), 3.4 / Math.max(80, w)); }; // the bear ~55% of the screen height
  fitZoom();

  // ---- the salmon: the chinook's own voxels, cut from the tail as it is eaten
  // a king salmon in the species' own colours (src/data/species.js chinook), built like the classroom's fish
  const spec = SPECIES.find((s) => s.id === 'chinook') || SPECIES[0];
  const c = spec.colors || { back: 0x3a5a6a, side: 0xc8d4dc, belly: 0xf4f6f8, fin: 0x6a7a80, accent: 0x1a2024 };
  const full = fishVoxels({
    L: 30, H: 11, W: 6, shape: 'fusiform', back: c.back, side: c.side, belly: c.belly, fin: c.fin,
    pattern: [{ type: 'spots', yMin: 0.1, density: 0.16, color: c.accent, seed: 3 }, { type: 'stripe', y: -0.05, width: 0.5, color: 0xe8a0a0, blotchy: true }],
    dorsal: 'short', tail: 'fork', eye: 0x101418,
  });
  const X0 = full.minX, X1 = full.maxX;
  function salmonGeo(e) {
    const cut = Math.round(X0 + e * (X1 - X0 + 1));
    const v = new VoxelModel();
    for (const [k, c] of full.vox) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      if (x < cut) continue;
      v.set(x, y, z, x === cut ? ((y + z) & 1 ? FLESH : FLESH_D) : c); // the bitten face shows pink flesh
    }
    // the spine sticks out of the bite
    if (cut > X0 + 1 && cut <= X1 - 1) { const cy = Math.round((full.minY + full.maxY) / 2), cz = Math.round((full.minZ + full.maxZ) / 2); for (let x = cut - 3; x < cut; x++) v.set(x, cy, cz, BONE); }
    if (!v.vox.size) return null;
    return v.build({ pivot: [cut, (full.minY + full.maxY + 1) / 2, (full.minZ + full.maxZ + 1) / 2], scale: FV });
  }
  let fishMesh = null, e = 0;
  function newFish() {
    e = 0;
    fishMesh = new THREE.Mesh(salmonGeo(0), voxelMaterial());
    fishMesh.castShadow = true;
    const g = new THREE.Group();
    g.add(fishMesh);
    // the bitten end at the mouth, the rest of the fish sticking out to the bear's left (screen right)
    fishMesh.rotation.set(0, Math.PI, 0.1); // across the chest, the bitten end at the mouth
    return g;
  }
  function eatSlice(amount) {
    if (!fishMesh || e >= 1) return;
    e = Math.min(1, e + amount);
    const g = salmonGeo(e);
    fishMesh.geometry.dispose();
    if (g) fishMesh.geometry = g; else fishMesh.visible = false;
    // crumbs: chunks of salmon flying off the bite
    const p = new THREE.Vector3();
    fishMesh.getWorldPosition(p);
    P.debris(p.x, p.y + 0.05, p.z + 0.1, 5, [0x3e5a78, FLESH, 0xd8ccc4, FLESH_D, 0x9ab0c0]);
    try { audio?.play?.(Math.random() < 0.5 ? 'chomp' : 'crunch', { volume: 0.35, pitch: 0.9 + Math.random() * 0.3 }); } catch { /* */ }
  }

  // ---- the bears
  let bi = 0, bear = null, phase = 'walkin', bx = -5, cycle = -1, cycleSpeed = 1, bank = 0, lastShown = 0, turn = Math.PI / 2;
  function newBear() {
    const type = CAST.filter((t) => BEAR_TYPES[t])[bi % CAST.length] || 'office';
    bear?.dispose();
    bear = new BearRig(type, BEAR_TYPES[type]);
    try { bear.personalize(7.7 + bi * 3.1); } catch { /* */ }
    bear.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(bear.root);
    bear.hold(newFish());
    bear.onEvent = (n) => { if (n === 'chomp' && phase === 'eat') eatSlice(Math.min(0.11, Math.max(0.045, bank))); };
    bx = -3.6; phase = 'walkin'; turn = Math.PI / 2; cycle = -1; bank = 0;
  }
  newBear();

  S.onTap = () => {
    if (phase === 'eat') { bank += 0.09; if (cycle < 0) { cycle = 0; cycleSpeed = 1.5; } else cycleSpeed = 1.8; }
    else if (bear) bear.sp?.squash?.kick?.(-2);
  };
  S.scene3d = true;
  document.documentElement.classList.add('tbme-loading'); // (index.html: everything but the game canvas hidden meanwhile)
  const cover = document.getElementById('tbme-paint');
  if (cover) cover.style.visibility = 'hidden';

  let last = performance.now(), dead = false, raf = 0;
  const _post = {};
  function frame(now) {
    if (dead) return;
    if (S.done || S.real >= 0.95) { stop(); return; } // the title / the game draw now
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    // progress -> salmon: about one salmon per load, plus whatever the taps add
    const shown = S.shown || 0;
    bank += Math.max(0, shown - lastShown) * 1.0;
    lastShown = shown;
    if (phase === 'walkin') {
      bx += Math.min(2.2 * dt, -bx);
      if (bx >= -0.02) { bx = 0; phase = 'turn'; }
      bear.pose('walk', dt, { speed: 2.2 });
    } else if (phase === 'turn') {
      turn = Math.max(CAMY * 0.85, turn - dt * 5); // face the camera to eat
      bear.pose('idle', dt, {});
      if (turn <= CAMY * 0.85 + 0.001) phase = 'eat';
    } else if (phase === 'eat') {
      if (cycle < 0 && bank > 0.05) { cycle = 0; cycleSpeed = 1; }
      if (cycle >= 0) {
        cycle += dt * cycleSpeed / 1.4;
        bear.pose('eat', dt, { t01: Math.min(1, cycle) });
        if (cycle >= 1) { cycle = -1; bank = Math.max(0, bank - 0.02); }
      } else bear.pose('idle', dt, {});
      if (e >= 1 && cycle < 0) {
        phase = 'leave'; turn = 0; bear.hold(null); fishMesh = null;
        bear.setFace?.('love', { hold: 2 });
        try { audio?.play?.('burp', { volume: 0.3 }); } catch { /* */ }
      }
    } else if (phase === 'leave') {
      turn = Math.max(-Math.PI / 2, turn - dt * 5);
      if (turn <= -Math.PI / 2 + 0.01) { bx += 2.4 * dt; bear.pose('walk', dt, { speed: 2.4 }); } else bear.pose('idle', dt, {});
      if (bx > 4.2) { bi++; newBear(); }
    }
    bear.root.position.set(bx, 0, 0);
    floorU.uBear.value.set(bx, 0);
    bear.root.rotation.y = turn;
    bear.update(dt);
    P.update(dt);
    fitZoom();
    rig.update(dt, renderer);
    // render on pure black: no haze bands, no lifted shadows (restored right after, the game owns them)
    const U = renderer.postMat.uniforms;
    _post.haze = U.haze.value; _post.lift = U.lift.value.clone(); _post.vig = U.vignette.value;
    U.haze.value = 0; U.lift.value.set(0, 0, 0); U.vignette.value = 0.5;
    const fit = renderer.shadowFit;
    renderer.shadowFit = false;
    try { renderer.render(scene, rig); } catch (err) { console.warn('[loader 3d]', err); stop(); return; }
    renderer.shadowFit = fit;
    U.haze.value = _post.haze; U.lift.value.copy(_post.lift); U.vignette.value = _post.vig;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function stop() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    S.scene3d = false; S.onTap = null;
    try { bear?.dispose(); } catch { /* */ }
    scene.traverse((o) => { if (o.geometry && o !== fishMesh) o.geometry.dispose?.(); });
    fishMesh?.geometry?.dispose();
    key.shadow.map?.dispose();
  }
  return { stop };
}
