// TitleWorld: the title screen. A golden-hour diorama of the valley: the stone
// mountain with the Bear St. office on its shoulder, the switchback trail, the
// layered forest, the meadow and Reynard's pond.
//
// The backdrop is painted in pixel art by index.html's inline script before any
// module loads (window.__tbmePaint: the first frame the player sees). This module
// shows the very same layers as unlit planes on the low-res pixel grid (1 texel =
// 1 low-res pixel, so the hand-over from the painted canvas is pixel exact) and
// brings the scene to life on top: drifting clouds, multiplane parallax, mist,
// god rays, glittering water, office lights, birds, fireflies, falling leaves,
// and the cast (titleCast.js): Reynard on his dock rubbing his paws, and at five
// o'clock the whistle, the doors bursting open and bears in suits pouring down
// the trail to cannonball into the pond.
//
//   const T = new TitleWorld(renderer, { audio });   // renderer: the shared PixelRenderer
//   T.start();  each frame: T.update(dt); T.render();
//   T.onCalm = () => {}   // fired once the intro has settled (good moment for heavy work)
//   T.gameReady = true    // lets the five o'clock whistle blow
//   T.stop();             // removes everything, restores the renderer's post settings
// window.__title = T while it runs (T.active).
import * as THREE from 'three';
import { PixelPoints } from './pixelPoints.js';
import { waterMaterial, mistMaterial, raysMaterial, RINGS } from './titleShaders.js';
import { TitleCast } from './titleCast.js';
import { WUPP, ORDER } from './titleConst.js';

export { WUPP, ORDER };
const Z_LAYER = -180; // layers sit far back (and write that depth, so they never get outlined)
const DRIFT = { amp: 9, period: 64 }; // multiplane camera drift (px at parallax 1)
const POST = { bloomStrength: 0.5, threshold: 0.8, vignette: 0.3, vignetteColor: [0.42, 0.26, 0.5], saturation: 1.04, grade: [1.03, 1.0, 0.96], lift: [0.012, 0.004, 0.026], contrast: 1.03, haze: 0, outlineTint: [0.34, 0.22, 0.38] };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };


export class TitleWorld {
  constructor(renderer, { paint = null, audio = null } = {}) {
    this.R = renderer;
    this.paint = paint || (typeof window !== 'undefined' ? window.__tbmePaint : null);
    this.audio = audio;
    this.active = false;
    this.t = 0;
    this.phase = 'off';
    this.gameReady = false;
    this.onCalm = null;
    this.onPhase = null;
  }

  // ============================================================ lifecycle
  start() {
    if (this.active) return;
    this.active = true;
    this.t = 0;
    this.phase = 'intro';
    this.scene = new THREE.Scene();
    this.scene.name = 'TitleWorld';
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.cam.position.set(0, 0, 200);
    this.cam.lookAt(0, 0, 0);
    this.rig = { camera: this.cam, subpixel: new THREE.Vector2(0, 0) };
    // light for the 3D cast: a low golden sun from the right, a warm rim from behind, lilac sky fill
    const hemi = new THREE.HemisphereLight(0xd8b0d0, 0x6a5440, 1.35);
    const sun = new THREE.DirectionalLight(0xffc896, 2.3);
    sun.position.set(6, 3.2, 4.5);
    const rim = new THREE.DirectionalLight(0xffa860, 1.5);
    rim.position.set(4, 2.5, -6);
    this.scene.add(hemi, sun, rim);
    this._savePost();
    this._applyPost(0);
    this.R.setFogEnabled(false);
    this.dyn = { clouds: [], mists: [], rays: null, water: null };
    this._build(true);
    this.cast = new TitleCast(this);
    this.cast.start();
    if (typeof window !== 'undefined') window.__title = this;
    this._frames = 0;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.phase = 'off';
    try { this.cast?.dispose(); } catch (e) { console.warn(e); }
    this.cast = null;
    this._disposeLayers();
    for (const p of this.points || []) p.dispose();
    this.points = null;
    this._restorePost();
    document.getElementById('tbme-paint')?.remove();
    if (typeof window !== 'undefined' && window.__title === this) window.__title = null;
    this.scene = null;
  }

  // ============================================================ layers (from the painter)
  _build(first) {
    const R = this.R;
    const lw = R.lowW, lh = R.lowH;
    this.lw = lw; this.lh = lh;
    const P = this.paint;
    let L = null;
    if (P) {
      const f = P.first;
      L = first && f && f.L && f.L.lw === lw && f.L.lh === lh ? f.L : P.paint(lw, lh);
    } else L = fallbackLayers(lw, lh);
    this.L = L;
    this._disposeLayers();
    this.layerGroup = new THREE.Group();
    this.scene.add(this.layerGroup);
    this.layers = {};
    const cam = this.cam, rtW = lw + 2, rtH = lh + 2;
    cam.left = -rtW * WUPP / 2; cam.right = rtW * WUPP / 2; cam.top = rtH * WUPP / 2; cam.bottom = -rtH * WUPP / 2;
    cam.updateProjectionMatrix();
    // the sky fills the frame plus the render target's 1 px margin
    this._addLayer('sky', L.sky, -2, -2, 0, ORDER.sky, { pad: 2 });
    for (const ly of L.layers || []) {
      if (ly.name === 'water') this._addWater(ly);
      else this._addLayer(ly.name, ly.c, -L.M, ly.y, ly.par, ORDER[ly.name] ?? 7);
    }
    // clouds drift (wrapping strips)
    for (const n of ['cloudsHigh', 'cloudsLow']) {
      const ly = this.layers[n];
      if (!ly) continue;
      ly.tex.wrapS = THREE.RepeatWrapping;
      ly.tex.needsUpdate = true;
      ly.drift = n === 'cloudsHigh' ? 0.6 : 1.1; // px per second
    }
    this._buildFx();
  }

  _addLayer(name, canvas, x0, y0, par, order, { pad = 0 } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const cw = canvas.width, ch = canvas.height;
    const geo = new THREE.PlaneGeometry((cw + pad * 2) * WUPP, (ch + pad * 2) * WUPP);
    if (pad) { // stretch the edge texels over the margin
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (cw + pad * 2) - pad) / cw, (uv.getY(i) * (ch + pad * 2) - pad) / ch);
    }
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, depthTest: false, depthWrite: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    const ly = { name, mesh, tex, par, x0: x0 - pad, y0: y0 - pad, w: cw + pad * 2, h: ch + pad * 2, off: 0, offY: 0, uvOff: 0 };
    this._place(ly);
    this.layerGroup.add(mesh);
    this.layers[name] = ly;
    return ly;
  }

  _addWater(lyD) {
    const tex = new THREE.CanvasTexture(lyD.c);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const cw = lyD.c.width, ch = lyD.c.height;
    const mat = waterMaterial(tex, cw, ch);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cw * WUPP, ch * WUPP), mat);
    mesh.renderOrder = ORDER.water;
    mesh.frustumCulled = false;
    const ly = { name: 'water', mesh, tex, par: lyD.par, x0: -this.L.M, y0: lyD.y, w: cw, h: ch, off: 0, offY: 0 };
    this._place(ly);
    this.layerGroup.add(mesh);
    this.layers.water = ly;
    this.dyn.water = { mat, ringI: 0 };
    mat.uniforms.uSunX.value = this.L.sun.x + this.L.M;
  }

  // world position of a painted pixel coordinate (x right, y down, origin top-left of the frame)
  wx(x) { return (x - this.lw / 2) * WUPP; }
  wy(y) { return (this.lh / 2 - y) * WUPP; }

  _place(ly) {
    ly.mesh.position.set(this.wx(ly.x0 + ly.w / 2 + ly.off), this.wy(ly.y0 + ly.h / 2 + ly.offY), Z_LAYER);
  }

  _disposeLayers() {
    if (!this.layerGroup) return;
    this.scene.remove(this.layerGroup);
    this.layerGroup.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.uniforms?.map?.value?.dispose?.();
      o.material.dispose();
    });
    this.layerGroup = null;
  }

  // ============================================================ effects
  _buildFx() {
    const L = this.L, lw = this.lw, lh = this.lh, M = L.M, g = this.layerGroup;
    const W = lw + M * 2;
    const mist = (name, y0, h, order, par, opts) => {
      const mat = mistMaterial(W, h, opts);
      mat.uniforms.uSunX.value = L.sun.x + M;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W * WUPP, h * WUPP), mat);
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      const ly = { name, mesh, par, x0: -M, y0, w: W, h, off: 0, offY: 0, mat, base: opts.density ?? 1 };
      mat.uniforms.uDensity.value = 0;
      this._place(ly);
      g.add(mesh);
      this.layers[name] = ly;
      this.dyn.mists.push(ly);
    };
    const tall = L.tall;
    mist('mistBase', L.f3 - (tall ? 22 : 20), tall ? 26 : 24, ORDER.mistBase, 0.3, { color: 0xffd0a6, shade: 0xc08a9c, seed: 1, speed: 0.6, density: 0.9 });
    mist('mistFar', L.f3 + 2, Math.max(12, Math.round((L.f2 - L.f3) * 0.9)), ORDER.mistFar, 0.45, { color: 0xffc89c, shade: 0xb07c96, seed: 2, speed: 0.9, density: 0.85 });
    mist('mistNear', L.f2 - 9, 13, ORDER.mistNear, 0.62, { color: 0xffd2a0, shade: 0xd8a088, seed: 3, speed: 1.2, density: 0.55 });
    // god rays from the sun across the haze between the mountain and the woods
    const rh = Math.max(20, L.f2 - 4);
    const rmat = raysMaterial(W, rh, { strength: 0.2 });
    rmat.uniforms.uSun.value.set(L.sun.x + M, L.sun.y);
    const rmesh = new THREE.Mesh(new THREE.PlaneGeometry(W * WUPP, rh * WUPP), rmat);
    rmesh.renderOrder = ORDER.rays;
    rmesh.frustumCulled = false;
    const rly = { name: 'rays', mesh: rmesh, par: 0.3, x0: -M, y0: 0, w: W, h: rh, off: 0, offY: 0, mat: rmat };
    rmat.uniforms.uK.value = 0;
    this._place(rly);
    g.add(rmesh);
    this.layers.rays = rly;
    this.dyn.rays = rly;
    // particle systems
    for (const p of this.points || []) { p.mesh.parent?.remove(p.mesh); p.dispose(); }
    this.pt = {
      birds: new PixelPoints(96, { order: ORDER.birds }),
      office: new PixelPoints(420, { order: ORDER.office }),
      low: new PixelPoints(160, { order: ORDER.low }),
      splash: new PixelPoints(260, { order: ORDER.splash }),
      top: new PixelPoints(160, { order: ORDER.top }),
      motes: new PixelPoints(80, { order: ORDER.rays, additive: true }),
    };
    this.points = Object.values(this.pt);
    for (const p of this.points) this.scene.add(p.mesh);
    if (!this.fx) this.fx = { birds: [], flies: [], leaves: [], motes: [], steam: [], drops: [], lights: [], blink: 0 };
    this._initAmbient();
  }

  _initAmbient() {
    const L = this.L, lw = this.lw, fx = this.fx;
    // birds: two loose flocks
    fx.birds.length = 0;
    for (let f = 0; f < 2; f++) {
      const n = f ? 3 : 5, y = L.hy * (f ? 0.38 : 0.22) + rand(-6, 6), x = f ? -40 : lw * 0.15, v = f ? 7 : 5.5;
      for (let i = 0; i < n; i++) fx.birds.push({ x: x - i * 7 - Math.abs(i - n / 2) * 2, y: y + Math.abs(i - (n - 1) / 2) * 3, v, ph: rand(0, 6), f });
    }
    // fireflies around the pond and the woods' edge
    fx.flies.length = 0;
    const P = L.pond;
    for (let i = 0; i < (L.tall ? 18 : 22); i++) {
      const nearPond = i % 2 === 0;
      fx.flies.push({
        x: nearPond ? P.x + rand(-P.rx * 1.1, P.rx * 1.1) : rand(0, lw), y: nearPond ? P.y + rand(-P.ry * 1.8, P.ry * 2) : L.f2 + rand(-6, 14),
        ph: rand(0, 20), sp: rand(0.4, 1), top: i % 5 === 0,
      });
    }
    // dust motes in the sun
    fx.motes.length = 0;
    for (let i = 0; i < 40; i++) fx.motes.push({ x: rand(lw * 0.3, lw), y: rand(L.hy * 0.5, L.f2), ph: rand(0, 9), sp: rand(0.5, 1.5) });
    // office windows: which are lit (some go dark at five)
    fx.lights = (L.office?.windows || []).map((w) => ({ x: w[0], y: w[1], on: w[2] > 0, flick: rand(4, 30) }));
  }

  // ============================================================ post grade
  _savePost() {
    const R = this.R, U = R.postMat.uniforms;
    this._post = { bloomStrength: R.bloomStrength, threshold: R.brightPass.mat.uniforms.threshold.value, u: {} };
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) this._post.u[k] = U[k].value;
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) this._post.u[k] = U[k].value.clone();
  }

  _restorePost() {
    const R = this.R, U = R.postMat.uniforms, s = this._post;
    if (!s) return;
    R.bloomStrength = s.bloomStrength;
    R.brightPass.mat.uniforms.threshold.value = s.threshold;
    for (const k of ['haze', 'vignette', 'saturation', 'contrast', 'outlineAmt', 'highlightAmt']) U[k].value = s.u[k];
    for (const k of ['hazeColor', 'vignetteColor', 'grade', 'lift', 'outlineTint']) U[k].value.copy(s.u[k]);
  }

  // k = 0: neutral (the WebGL frame equals the painted canvas), 1: the title grade
  _applyPost(k) {
    const R = this.R, U = R.postMat.uniforms;
    const l = (a, b) => a + (b - a) * k;
    R.bloomStrength = l(0, POST.bloomStrength);
    R.brightPass.mat.uniforms.threshold.value = POST.threshold;
    U.haze.value = 0;
    U.vignette.value = l(0, POST.vignette);
    U.vignetteColor.value.set(...POST.vignetteColor);
    U.saturation.value = l(1, POST.saturation);
    U.contrast.value = l(1, POST.contrast);
    U.grade.value.set(l(1, POST.grade[0]), l(1, POST.grade[1]), l(1, POST.grade[2]));
    U.lift.value.set(l(0, POST.lift[0]), l(0, POST.lift[1]), l(0, POST.lift[2]));
    U.outlineTint.value.set(...POST.outlineTint);
    U.outlineAmt.value = 0.5;
    U.highlightAmt.value = 0.1;
  }

  // ============================================================ frame
  resize() {
    if (!this.active) return;
    if (this.R.lowW === this.lw && this.R.lowH === this.lh) return;
    this._build(false);
    this.cast?.relayout();
  }

  update(dt) {
    if (!this.active) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    // intro: the grade warms up, the mist rolls in, the rays come out
    const k = smooth((t - 0.35) / 2.4);
    this._applyPost(k);
    for (const m of this.dyn.mists) m.mat.uniforms.uDensity.value = m.base * smooth((t - 0.2) / 3);
    if (this.dyn.rays) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1);
      this.dyn.rays.mat.uniforms.uK.value = 0.22 * pulse * smooth((t - 0.6) / 3);
      this.dyn.rays.mat.uniforms.uTime.value = t;
    }
    for (const m of this.dyn.mists) m.mat.uniforms.uTime.value = t;
    if (this.dyn.water) this.dyn.water.mat.uniforms.uTime.value = t;
    // phases: intro -> quiet (the calm before five) -> rush
    if (this.phase === 'intro' && t > 2.6) this._setPhase('quiet');
    else if (this.phase === 'quiet') {
      this.quietT = (this.quietT || 0) + dt;
      if ((this.gameReady && this.quietT > 1.2) || this.quietT > 14) this._setPhase('rush');
    }
    // multiplane drift: each layer steps by whole pixels
    const drift = DRIFT.amp * Math.sin((t / DRIFT.period) * Math.PI * 2) * smooth(t / 6);
    const bob = Math.sin((t / (DRIFT.period * 0.7)) * Math.PI * 2) * smooth(t / 6);
    this.drift = drift;
    for (const ly of Object.values(this.layers)) {
      const off = Math.round(drift * ly.par), offY = Math.round(bob * ly.par * 1.2);
      if (ly.drift) {
        const u = Math.floor(t * ly.drift);
        if (u !== ly.uvOff) { ly.uvOff = u; ly.tex.offset.x = -u / ly.tex.image.width; }
      }
      if (off !== ly.off || offY !== ly.offY) { ly.off = off; ly.offY = offY; this._place(ly); }
    }
    this._updateFx(dt);
    this.cast?.update(dt);
  }

  // parallax offset (px) of the layer a point belongs to
  offOf(name) { const ly = this.layers?.[name]; return ly ? [ly.off, ly.offY] : [0, 0]; }

  _setPhase(p) {
    if (this.phase === p) return;
    this.phase = p;
    if (p === 'quiet') { try { this.onCalm?.(); } catch (e) { console.warn(e); } }
    if (p === 'rush') this.cast?.whistle();
    try { this.onPhase?.(p); } catch (e) { console.warn(e); }
  }

  // a splash at painted (x, y): rings on the water + droplets
  splash(x, y, power = 1) {
    const w = this.dyn.water, wl = this.layers.water;
    if (w && wl) {
      const R = w.mat.uniforms.uRings.value[w.ringI++ % RINGS];
      R.set(x - wl.x0 - wl.off, y - wl.y0 - wl.offY, this.t, 0.75 + power * 0.35);
      const R2 = w.mat.uniforms.uRings.value[w.ringI++ % RINGS];
      R2.set(x - wl.x0 - wl.off, y - wl.y0 - wl.offY, this.t + 0.35, 0.55 + power * 0.25);
    }
    const n = Math.round(14 + power * 14);
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const v = rand(14, 44) * (0.6 + power * 0.5);
      this.fx.drops.push({ x: x + rand(-3, 3), y: y - 1, vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v, life: rand(0.5, 1.1), y0: y, big: Math.random() < 0.3 });
    }
  }

  steam(x, y, n = 10) {
    for (let i = 0; i < n; i++) this.fx.steam.push({ x: x + rand(-1, 1), y, vx: rand(-3, 6), vy: rand(-22, -12), life: rand(0.8, 1.8), age: 0, s: Math.random() < 0.5 ? 2 : 3 });
  }

  _updateFx(dt) {
    const L = this.L, lw = this.lw, lh = this.lh, t = this.t, fx = this.fx, pt = this.pt;
    // birds: drifting flocks, wings flapping (3 px each)
    pt.birds.begin();
    const [cox] = this.offOf('cloudsLow');
    for (const b of fx.birds) {
      b.x += b.v * dt;
      if (b.x > lw + 30) { b.x = -30 - rand(0, 80); b.y = L.hy * (b.f ? 0.38 : 0.22) + rand(-8, 8); }
      const flap = Math.sin(t * 7 + b.ph) > 0;
      const x = Math.round(b.x + cox), y = Math.round(b.y + Math.sin(t * 0.8 + b.ph) * 1.5);
      const c = 0x4a3048;
      pt.birds.add(x, y, c);
      pt.birds.add(x - 1, y + (flap ? -1 : 0), c); pt.birds.add(x + 1, y + (flap ? -1 : 0), c);
      if (!b.f) { pt.birds.add(x - 2, y + (flap ? -1 : 1), c); pt.birds.add(x + 2, y + (flap ? -1 : 1), c); }
    }
    pt.birds.end(lw, lh);
    // office: window lights (flickering on and off), drawn on the mountain layer's grid
    const [mox, moy] = this.offOf('mountain');
    pt.office.begin();
    const rush = this.phase === 'rush';
    for (const w of fx.lights) {
      w.flick -= dt;
      if (w.flick < 0) { w.flick = rush ? rand(0.6, 6) : rand(6, 40); w.on = rush ? Math.random() < 0.45 : Math.random() < 0.8; }
      if (!w.on) pt.office.add(w.x + mox, w.y + moy, 0x4a4062, 2);
      else pt.office.add(w.x + mox, w.y + moy, 0xffd27a, 2, 1.25);
    }
    // steam puffs (the five o'clock whistle)
    for (let i = fx.steam.length - 1; i >= 0; i--) {
      const s = fx.steam[i];
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy *= 1 - dt * 1.2;
      if (s.age > s.life) { fx.steam.splice(i, 1); continue; }
      const u = s.age / s.life, sz = u < 0.25 ? s.s - 1 : u > 0.75 ? Math.max(1, s.s - 1) : s.s;
      pt.office.add(Math.round(s.x + mox), Math.round(s.y + moy), u > 0.6 ? 0xe8d8e0 : 0xffffff, sz, 1.1);
    }
    this.cast?.drawOffice?.(pt.office, mox, moy);
    pt.office.end(lw, lh);
    // fireflies + motes
    const [gox, goy] = this.offOf('meadow');
    pt.low.begin(); pt.top.begin(); pt.motes.begin();
    const dusk = smooth((t - 1.5) / 4);
    for (const f of fx.flies) {
      const blink = Math.sin(t * f.sp * 2.1 + f.ph);
      if (blink < 0.2 || dusk < 0.1) continue;
      const x = Math.round(f.x + Math.sin(t * 0.5 * f.sp + f.ph) * 6 + gox), y = Math.round(f.y + Math.sin(t * 0.7 + f.ph * 2) * 3 + goy);
      (f.top ? pt.top : pt.low).add(x, y, blink > 0.8 ? 0xf8ffb0 : 0xc8f070, 1, 1 + blink * 0.9);
    }
    const [rox] = this.offOf('rays');
    for (const m of fx.motes) {
      const tw = Math.sin(t * m.sp + m.ph);
      if (tw < 0.4) continue;
      const x = Math.round(m.x + Math.sin(t * 0.3 * m.sp + m.ph) * 5 + rox), y = Math.round(m.y + Math.sin(t * 0.21 + m.ph) * 4 - ((t * 2 * m.sp) % 30));
      pt.motes.add(x, y, 0xffd8a0, 1, 0.22 * tw * dusk);
    }
    // falling leaves from the near woods and the framing trees
    if (Math.random() < dt * 1.6 && fx.leaves.length < 40) {
      const front = Math.random() < 0.35;
      fx.leaves.push({ x: rand(-10, lw + 10), y: front ? rand(lh * 0.1, lh * 0.5) : rand(L.f2 - 40, L.f2 - 10), vx: rand(-8, -2), vy: rand(6, 12), ph: rand(0, 6), front,
        c: [0xe8742a, 0xf2b234, 0xd04a2a, 0xffd25a][Math.floor(rand(0, 4))], life: rand(4, 9), age: 0 });
    }
    for (let i = fx.leaves.length - 1; i >= 0; i--) {
      const l = fx.leaves[i];
      l.age += dt; l.x += (l.vx + Math.sin(t * 2 + l.ph) * 10) * dt; l.y += l.vy * dt;
      if (l.age > l.life || l.y > lh + 4) { fx.leaves.splice(i, 1); continue; }
      const P2 = l.front ? pt.top : pt.low, o = l.front ? this.offOf('front') : [gox, goy];
      P2.add(Math.round(l.x + o[0]), Math.round(l.y + o[1]), l.c, l.front && Math.sin(t * 6 + l.ph) > 0 ? 2 : 1);
    }
    // splash droplets
    pt.splash.begin();
    for (let i = fx.drops.length - 1; i >= 0; i--) {
      const d = fx.drops[i];
      d.life -= dt; d.vy += 90 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.life < 0 || (d.vy > 0 && d.y > d.y0 + 2)) { fx.drops.splice(i, 1); continue; }
      pt.splash.add(Math.round(d.x + gox), Math.round(d.y + goy), d.big ? 0xffffff : 0xbfe8ff, d.big ? 2 : 1, 1.15);
    }
    this.cast?.drawFx?.(pt, gox, goy);
    for (const p of [pt.low, pt.top, pt.motes, pt.splash]) p.end(lw, lh);
  }

  render() {
    if (!this.active) return;
    this.R.setFogEnabled(false);
    this.R.render(this.scene, this.rig);
    // once the live scene has drawn a couple of frames, drop the painted first frame
    if (++this._frames === 3) {
      const pc = document.getElementById('tbme-paint');
      if (pc) pc.remove();
    }
  }
}

// no painter (tools / previews): a flat dusk gradient so the cast still has a stage
function fallbackLayers(lw, lh) {
  const c = document.createElement('canvas');
  c.width = lw; c.height = lh;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, lh);
  gr.addColorStop(0, '#33396e'); gr.addColorStop(0.55, '#f9926f'); gr.addColorStop(0.6, '#2c464a'); gr.addColorStop(1, '#3c4c34');
  g.fillStyle = gr; g.fillRect(0, 0, lw, lh);
  const hy = Math.round(lh * 0.585);
  return { lw, lh, tall: lh > lw * 1.15, hy, M: 16, sun: { x: lw * 0.86, y: lh * 0.43, r: 8 }, f3: hy + 11, f2: hy + 36, sky: c, layers: [],
    pond: { x: lw * 0.6, y: lh * 0.85, rx: lw * 0.2, ry: 12 }, fox: { x: lw * 0.7, y: lh * 0.92 }, dock: { x: lw * 0.7, y0: lh * 0.88, y1: lh * 0.92, w: 10 },
    gapX: lw * 0.37, trail: [], trailPts: [], office: null, meadowPath: null };
}
