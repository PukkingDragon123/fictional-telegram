// [v26 menu] SleepyFox3D: the real Reynard rig (src/entities/foxRig.js), asleep in
// his pajamas, rendered small and pixelated with an ink outline into a canvas.
// The title's save boxes put him next to them, snoring.
//
//   const fox = createSleepyFox(el, { ps: 3, sfx });   // null if WebGL is unavailable
//   fox.poke();      // he grumbles in his sleep and twitches
//   fox.dispose();
//
// Own small WebGL context (released on dispose), ~20 fps, paused while hidden.
import * as THREE from 'three';
import { FoxRig, FOX_BED } from '../entities/foxRig.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// 1 px ink outline around the silhouette + darkened depth creases
const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 size;
uniform vec3 ink;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float Z(vec2 o) { return texture2D(tDepth, vUv + o).x; }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    gl_FragColor = n > 0.5 ? vec4(ink, 1.0) : vec4(0.0);
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > 0.004) col = mix(col, ink, 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}
`;

const _c = new THREE.Vector3();
const ZROWS = ['kkkkkk', 'kwwwBk', 'kkkwBk', '.kwBk.', 'kwBkkk', 'kwwwwk', 'kkkkkk'];
function zArt() {
  const c = document.createElement('canvas');
  c.width = 6; c.height = 7;
  const g = c.getContext('2d');
  const P = { k: '#2a1626', w: '#ffffff', B: '#9ccff2' };
  ZROWS.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (P[r[x]]) { g.fillStyle = P[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}

// a cardboard box for a bed, a pillow and a striped quilt (pixel textures, lit like the rig)
function pixTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeBed() {
  const g = new THREE.Group();
  const H = FOX_BED.height, z0 = -0.3, z1 = -FOX_BED.head - 0.32, L = z0 - z1, W = 0.78;
  const card = pixTex(16, 16, (x, w, h) => {
    const C = ['#c99558', '#bf8b4f', '#d3a064'];
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { x.fillStyle = C[(i * 7 + y * 3 + ((i * y) % 5)) % 3]; x.fillRect(i, y, 1, 1); }
  });
  const side = pixTex(32, 12, (x, w, h) => {
    x.fillStyle = '#b8844a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#a5723f'; for (let i = 0; i < w; i += 3) x.fillRect(i, (i * 5) % h, 1, 1);
    x.fillStyle = '#e7c37c'; x.fillRect(14, 0, 4, 5); // tape
    x.fillStyle = '#7a4e2a'; for (const ax of [4, 9]) { x.fillRect(ax, 4, 1, 5); x.fillRect(ax - 1, 5, 3, 1); x.fillRect(ax - 2, 6, 5, 1); }
  });
  const mBox = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), [
    new THREE.MeshLambertMaterial({ map: side }), new THREE.MeshLambertMaterial({ map: side }),
    new THREE.MeshLambertMaterial({ map: card }), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }),
    new THREE.MeshLambertMaterial({ map: side }), new THREE.MeshLambertMaterial({ map: side }),
  ]);
  mBox.position.set(0, H / 2, (z0 + z1) / 2);
  g.add(mBox);
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xf4efe4 }));
  pillow.position.set(0, H + 0.06, -FOX_BED.head - 0.08);
  g.add(pillow);
  const quilt = pixTex(8, 16, (x, w, h) => {
    for (let y = 0; y < h; y++) { x.fillStyle = (y >> 1) % 2 ? '#f4e6c4' : '#d8402e'; x.fillRect(0, y, w, 1); }
    x.fillStyle = '#ffd84a'; x.fillRect(3, 2, 2, 2); x.fillRect(3, 10, 2, 2);
  });
  const q = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.05, 0.62), new THREE.MeshLambertMaterial({ map: quilt }));
  q.position.set(0, H + 0.2, -0.62);
  q.rotation.x = -0.12;
  g.add(q);
  // the quilt hangs over the box edges
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.6), new THREE.MeshLambertMaterial({ map: quilt }));
    f.position.set(sx * (W / 2 + 0.03), H + 0.09, -0.62);
    g.add(f);
  }
  return g;
}

export function createSleepyFox(el, { ps = 3, sfx = null, outfit = 'pajamas', fps = 20, yaw = -0.35, pitch = 0.85 } = {}) {
  let r;
  try {
    r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!r.getContext()) throw new Error('no gl');
  } catch (e) { console.warn('SleepyFox3D: no WebGL', e); return null; }
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  r.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());

  const wrap = document.createElement('div');
  wrap.className = 'sfx3-wrap';
  wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges';
  wrap.appendChild(cv);
  const zl = document.createElement('div');
  zl.style.cssText = 'position:absolute;inset:0;overflow:visible';
  wrap.appendChild(zl);
  el.appendChild(wrap);
  const ctx2 = cv.getContext('2d');

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.4));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.1); key.position.set(-1.8, 3, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb070, 1.8); rim.position.set(2.6, 1.6, -2.4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xb8a0ff, 0.5); fill.position.set(2, 0.6, 2.4); scene.add(fill);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const rig = new FoxRig({ shadows: false });
  rig.setOutfit(outfit);
  rig.root.rotation.y = yaw;
  pivot.add(rig.root);
  const bed = makeBed();
  bed.rotation.y = yaw;
  pivot.add(bed);
  rig.play('sleep_bed', { fade: 0 });
  for (let i = 0; i < 4; i++) rig.update(0.25);

  // frame him: an orthographic camera from the front, a little above
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  // frame the bed, with the sleeper on top of it (the rig's hidden FX sprites would skew a full bound)
  const box = new THREE.Box3().setFromObject(bed);
  box.max.y += 0.5; box.expandByScalar(0.06);
  const ctr = box.getCenter(new THREE.Vector3());
  cam.position.set(ctr.x, ctr.y + Math.sin(pitch) * 6, ctr.z + Math.cos(pitch) * 6);
  cam.lookAt(ctr);
  cam.updateMatrixWorld();

  const rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(2, 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x150910) } },
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const post = new THREE.Mesh(tri, mat);
  post.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(post);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let W = 0, H = 0;
  function fit() {
    const cw = el.clientWidth || 240, ch = el.clientHeight || 150;
    const w = Math.max(16, Math.round(cw / ps)), h = Math.max(16, Math.round(ch / ps));
    if (w === W && h === H) return;
    W = w; H = h;
    cv.width = w; cv.height = h;
    rt.setSize(w, h);
    r.setSize(w, h, false);
    mat.uniforms.size.value.set(w, h);
    // fit the sleeping fox (plus room for his Zzz) into the view
    // fit the bed + fox (bounding box corners in camera space) with room above for the Zzz
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(cam.matrixWorldInverse);
      x0 = Math.min(x0, _c.x); x1 = Math.max(x1, _c.x); y0 = Math.min(y0, _c.y); y1 = Math.max(y1, _c.y);
    }
    y1 += (y1 - y0) * 0.12;
    const a = w / h, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hh = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / a) * 1.04;
    cam.left = cx - hh * a; cam.right = cx + hh * a; cam.top = cy + hh; cam.bottom = cy - hh;
    cam.updateProjectionMatrix();
  }

  const zart = zArt();
  const zs = [];
  const head = new THREE.Vector3();
  function spawnZ(big = 1) {
    const c = document.createElement('canvas');
    c.width = 6; c.height = 7;
    c.getContext('2d').drawImage(zart, 0, 0);
    const s = ps * (zs.length % 2 ? 1 : 1.5) * big;
    c.style.cssText = `position:absolute;left:0;top:0;width:${6 * s}px;height:${7 * s}px;image-rendering:pixelated;opacity:0`;
    zl.appendChild(c);
    rig.headTop(head);
    head.project(cam);
    zs.push({ c, t: 0, x: (head.x * 0.5 + 0.5) * el.clientWidth + 6, y: (0.5 - head.y * 0.5) * el.clientHeight - 4, s, ph: Math.random() * 6 });
    if (zs.length > 8) { zs[0].c.remove(); zs.shift(); }
  }

  let dead = false, raf = 0, last = performance.now(), acc = 0, T = 0, zT = 0.6, snoreT = 2.2, poked = 0;
  function step(dt) {
    T += dt;
    rig.update(dt);
    // breathing squash on the pivot + a jolt after a poke
    poked = Math.max(0, poked - dt * 2.4);
    const j = Math.sin(poked * 18) * poked * 0.12;
    pivot.scale.set(1 - j * 0.5, 1 + j, 1 - j * 0.5);
    fit();
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.render(postScene, postCam);
    ctx2.clearRect(0, 0, W, H);
    ctx2.drawImage(r.domElement, 0, 0);
    // drifting Zzz
    zT -= dt;
    if (zT <= 0) { zT = 1.3; spawnZ(); }
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      z.t += dt;
      const u = z.t / 3.2;
      if (u >= 1) { z.c.remove(); zs.splice(i, 1); continue; }
      const x = z.x + u * 34 + Math.sin(z.t * 2.4 + z.ph) * 6, y = z.y - u * 58;
      const a = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1;
      z.c.style.transform = `translate(${Math.round(x / ps) * ps}px,${Math.round(y / ps) * ps}px) rotate(${(Math.sin(z.t * 1.7 + z.ph) * 0.25).toFixed(2)}rad) scale(${(0.7 + u * 0.6).toFixed(2)})`;
      z.c.style.opacity = a.toFixed(2);
    }
    // a soft snore on every other breath (sleep_bed breathes on sin(t * 1.5))
    snoreT -= dt;
    if (snoreT <= 0) { snoreT = (Math.PI * 2 / 1.5) * 2; try { sfx?.('bed_snore', { volume: 0.18 }); } catch { /* optional */ } }
  }
  function loop(now) {
    raf = 0;
    if (dead) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    if (!document.hidden && el.isConnected && acc >= 1 / fps - 0.003) { step(Math.min(0.1, acc)); acc = 0; }
    raf = requestAnimationFrame(loop);
  }
  step(0);
  raf = requestAnimationFrame(loop);

  return {
    el: wrap,
    rig,
    step,
    poke() {
      if (dead) return;
      poked = 1;
      for (let i = 0; i < 3; i++) setTimeout(() => !dead && spawnZ(1.3), i * 140);
      try { sfx?.('bed_mumble', { volume: 0.35 }); } catch { /* optional */ }
    },
    dispose() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      rig.dispose?.();
      bed.traverse((o) => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
      rt.depthTexture.dispose(); rt.dispose();
      mat.dispose(); tri.dispose();
      r.dispose();
      r.forceContextLoss?.();
      wrap.remove();
    },
  };
}
