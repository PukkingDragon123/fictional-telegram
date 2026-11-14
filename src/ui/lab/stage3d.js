// [v33 lab4] The 3D behind the research computer: real voxel scenes rendered by the game's
// own PixelRenderer (pixel pass + ink outline), seen through the transparent parts of the
// Lab UI (the desktop and each app's view).
//   - the desktop: Reynard's lab room (LabMode's scene: src/entities/labScene.js), slow drift
//   - fish topics: the Dive's underwater lake (src/entities/diveScene.js) with the topic's
//     researched fish swimming in it (the game's own fish, src/game/dive/life.js FishPack);
//     each topic looks at its own stretch of the lake. Fish shy from the cursor (or come and
//     look when it is still), plants bend away from it, a click pops a burst of bubbles,
//     a new fish dives in with a splash when its research is done
//   - other topics: the lab room from their own angle (until they get their own diorama)
// Each scene is built ONCE (module cache) and only rendered while its view is on screen,
// at a capped rate (the desktop ~12 fps, world views ~10 fps, an aquarium ~18 fps). The Game skips its
// own render while the Lab is open (body.lt-pc), so this owns the canvas meanwhile.
//
//   const S = new Stage3D(game); S.desk(); S.app(branchId, species[]); S.focusSpecies(sp, dark);
//   S.setView(cssRect); S.pointer(x, y); S.click(x, y); S.splash(sp); S.tick(dt, t); S.dispose();
import * as THREE from 'three';
import { CameraRig } from '../../core/cameraRig.js';
import { buildDiveScene, SURF, bedH } from '../../entities/diveScene.js';
import { DiveLife, FishPack } from '../../game/dive/life.js';
import { buildNatureAtlas } from '../../art/natureArt.js';
import { CROPS, stagesFor } from '../../data/crops.js';
import { pixTex } from '../../entities/critterKit.js';
import { spriteCanvas, hasSprite } from '../sprites.js';
import { KIND } from '../../world/grid.js';

// ------------------------------------------------------------ the card's inset (a second little view)
// The project card shows the selected thing in action in a small window of the same canvas:
// the scene is rendered from a second camera into a low-res target, ink-outlined like the
// game's own pass, and blitted into the card's rect with a scissor. Everything in it is the
// game's own: the Dive's lake and fish for fish, the real world (terrain, grass, trees, light)
// with the real structure model / crop stage sprites / icon for the rest.
const INK_VERT = `varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const INK_FRAG = `#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform float cNear; uniform float cFar;
varying vec2 vUv;
float Z(vec2 o) { return mix(cNear, cFar, texture2D(tDepth, vUv + o).x); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  float z = Z(vec2(0.0));
  float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
  vec3 col = c.rgb;
  if (z - zn > 0.35) col = mix(col, ink, 0.75);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
let NAT = null;
const natureAtlas = () => { if (!NAT) { try { NAT = buildNatureAtlas(); } catch { NAT = { canvas: null, frames: {} }; } } return NAT; };
const SPR_TEX = new Map();
function natSprite(name) {
  let m = SPR_TEX.get(name);
  if (m !== undefined) return m;
  m = null;
  const A = natureAtlas(), f = A.frames?.[name]?.[0];
  if (f && A.canvas) {
    const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
    c.getContext('2d').drawImage(A.canvas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    m = { mat: new THREE.SpriteMaterial({ map: pixTex(c), alphaTest: 0.5, fog: false }), w: f.w, h: f.h };
  }
  SPR_TEX.set(name, m);
  return m;
}
function iconSprite(name) {
  const k = 'i:' + name;
  let m = SPR_TEX.get(k);
  if (m !== undefined) return m;
  m = null;
  try {
    if (hasSprite(name)) { const c = spriteCanvas(name, 1); m = { mat: new THREE.SpriteMaterial({ map: pixTex(c), alphaTest: 0.5, fog: false, depthTest: false }), w: c.width, h: c.height }; }
  } catch { m = null; }
  SPR_TEX.set(k, m);
  return m;
}

const { sin, cos, max, min, abs, hypot, PI } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// where each fish topic looks in the lake (x centre, y centre, world units across the screen)
const TANK_VIEW = {
  panfish: { x: -7.5, y: 2.6, wu: 16, z: -0.8 },
  trout: { x: -19.5, y: 3.0, wu: 15, z: -0.6 },
  salmon: { x: 4.5, y: 2.3, wu: 17, z: -0.8 },
  biggame: { x: 19.5, y: 0.6, wu: 18, z: -0.8 },
  breed: { x: -12.5, y: 2.8, wu: 14, z: -0.6 },
  dive: { x: -1, y: 2.0, wu: 22, z: -0.8 },
};

// the other topics look at the real place in the game world (its own voxel diorama):
// x, z = the spot, w = world units across the view; 'home' = wherever the player's pond is
const WORLD_VIEW = {
  pond: { at: 'home', w: 22 }, decor: { at: 'home', w: 14, dz: 2 }, defense: { at: 'home', w: 26 }, snack: { x: 79.5, z: 44.5, w: 12 }, diner: { at: 'home', w: 16, dx: 4 },
  garden: { x: 57.5, z: 79, w: 13 }, beaver: { x: 107.5, z: 41.5, w: 15 }, woodwork: { x: 80.5, z: 74, w: 12 }, gizmo: { x: 78.5, z: 42.5, w: 10 },
  industry: { x: 48, z: 13.5, w: 16 }, dig: { x: 95.5, z: 138.6, w: 15 }, resort: { at: 'home', w: 18, dx: -5 }, weather: { x: 25, z: 26, w: 20 },
  expedition: { x: 37, z: 205, w: 22 },
};

let DIVE = null; // { sc, life } built once
function diveSet() {
  if (DIVE) return DIVE;
  const sc = buildDiveScene({ wreck: 'old' });
  const life = new DiveLife(sc, { whiskers: false, seed: 9 });
  // the lake's own schools stay home: the tank shows the topic's fish
  for (const s of life.schools || []) if (s.pack?.mesh) s.pack.mesh.visible = false;
  for (const l of life.lurk || []) if (l.pack?.mesh) l.pack.mesh.visible = false;
  const group = new THREE.Group();
  sc.scene.add(group);
  DIVE = { sc, life, group, packs: new Map() };
  return DIVE;
}

export class Stage3D {
  constructor(game) {
    this.g = game;
    this.r = game?.renderer || null;
    this.ok = !!(this.r && typeof this.r.render === 'function');
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.rig.minWupp = 0.0005; this.rig.maxWupp = 2;
    this.mode = null;
    this.view = null; // css rect the subject should sit in
    this.ptr = { x: 0, y: 0, on: false, vx: 0, vy: 0, t: 0, still: 0 };
    this.world = new THREE.Vector3(0, -99, 0);
    this.fish = [];
    this.hero = null;
    this.focus = null;
    this.t = 0;
    this._acc = 0;
    this._v = new THREE.Vector3();
    this._ray = new THREE.Ray();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  // ------------------------------------------------------------ views
  desk() {
    if (!this.ok) return false;
    this.focusUV = null;
    const L = this.g.lab;
    try { L?.build?.(); } catch (e) { console.warn('lab scene', e); }
    if (!L?.scene || !L.lab) { this.mode = null; return false; }
    this._clearFish();
    this.mode = 'desk';
    this.scene = L.scene;
    const a = L.lab.anchors.camOverview;
    // a little closer than the overview: the room fills the screen behind the desktop
    this.base = { target: a.target.clone(), w: (a.fit?.w || 8) * 0.6, h: (a.fit?.h || 5) * 0.6, yaw: a.yaw || 0, pitch: a.pitch ?? THREE.MathUtils.degToRad(40) };
    try { L.lab.setNight?.((this.g.sky?.state?.night || 0) > 0.4); } catch { /* ignore */ }
    if (!L.active && L.fox) { try { L.fox.play('sit_type', { loop: true, fade: 0 }); } catch { /* ignore */ } }
    this.fps = 12;
    this._frame(true, 1.5);
    return true;
  }

  // a topic app: fish topics get the lake, the rest the lab from another angle
  app(id, species = []) {
    if (!this.ok) return false;
    this.focus = null; this.focusUV = null;
    const V = TANK_VIEW[id];
    if (V) {
      let D = null;
      try { D = diveSet(); } catch (e) { console.warn('dive scene', e); return this.desk(); }
      this.mode = 'tank';
      this.scene = D.sc.scene;
      this.D = D;
      this.V = V;
      const pitch = 0.21;
      this.base = { target: new THREE.Vector3(V.x, V.y, V.z), w: V.wu, h: V.wu * 0.5, yaw: 0, pitch, tank: true };
      this.fps = 18;
      this._setFish(species, true);
      this._frame(true);
      return true;
    }
    const WV = WORLD_VIEW[id];
    if (WV && this.g.scene) {
      const g = this.g;
      let x = WV.x, z = WV.z;
      if (WV.at === 'home') { x = (g.rig?.target?.x ?? 66) + (WV.dx || 0); z = (g.rig?.target?.z ?? 38) + (WV.dz || 0); }
      let y = 0;
      try { y = g.grid?.surfaceY?.(Math.floor(x), Math.floor(z)) || 0; } catch { y = 0; }
      this._clearFish();
      this.mode = 'world';
      this.scene = g.scene;
      this.base = { target: new THREE.Vector3(x, Math.max(0, y), z), w: WV.w, h: WV.w * 0.56, yaw: g.rig?.yaw || 0, pitch: g.rig?.pitch || THREE.MathUtils.degToRad(44), world: true };
      this.rig.dist = g.rig?.dist || 110;
      this.fps = 10;
      this._frame(true);
      return true;
    }
    const ok = this.desk();
    if (ok) {
      const L = this.g.lab.lab.anchors;
      const pick = L.camOverview;
      this.base = { target: pick.target.clone(), w: (pick.fit?.w || 8) * 0.82, h: (pick.fit?.h || 5) * 0.82, yaw: (pick.yaw || 0) + 0.12, pitch: pick.pitch ?? THREE.MathUtils.degToRad(40) };
      this._frame(true);
    }
    return ok;
  }

  // the css rect of the transparent window the scene shows through
  setView(rect) { this.view = rect; }

  // ------------------------------------------------------------ fish
  _clearFish() {
    for (const f of this.fish) f.pack.mesh.visible = false;
    this.fish = [];
    if (this.hero) this.hero.pack.mesh.visible = false;
    this.hero = null;
  }

  _pack(sp, n, scale) {
    const D = this.D, key = `${sp}|${n}|${scale}`;
    let p = D.packs.get(key);
    if (!p) { p = new FishPack(D.group, sp, n, { scale }); D.packs.set(key, p); }
    p.mesh.visible = !!p.ok;
    return p.ok ? p : null;
  }

  _setFish(list, reset) {
    if (this.mode !== 'tank') return;
    const sig = list.join('|');
    if (!reset && sig === this._fishSig) return;
    this._fishSig = sig;
    const old = new Map(this.fish.map((f) => [f.sp, f]));
    for (const f of this.fish) f.pack.mesh.visible = false;
    this.fish = [];
    const V = this.V;
    list.slice(0, 8).forEach((sp, k) => {
      const n = list.length > 5 ? 2 : 3;
      const pack = this._pack(sp, n, 0.62);
      if (!pack) return;
      const was = old.get(sp);
      const ind = was?.ind || Array.from({ length: n }, (_, i) => ({
        x: V.x + (Math.random() - 0.5) * V.wu * 0.7, y: V.y + (Math.random() - 0.5) * 2.4, z: -1.6 + Math.random() * 2.6,
        vx: 0, vy: 0, h: Math.random() < 0.5 ? 0 : PI, tx: 0, ty: 0, tz: 0, t: Math.random() * 3, dive: 0, k: i,
      }));
      this.fish.push({ sp, pack, ind, home: k });
    });
  }

  setFish(list) { this._setFish(list, false); }

  // the selected project: its fish comes to the front; the camera leans toward it
  focusSpecies(sp) {
    if (this.mode !== 'tank') { this.focus = null; return; }
    if (!sp) { if (this.hero) this.hero.pack.mesh.visible = false; this.hero = null; this.focus = null; return; }
    if (this.hero?.sp !== sp) {
      if (this.hero) this.hero.pack.mesh.visible = false;
      const pack = this._pack(sp, 1, 1.05);
      this.hero = pack ? { sp, pack, x: this.V.x - this.V.wu * 0.3, y: this.V.y + 0.8, z: 2.2, h: 0, t: 0 } : null;
    }
    this.focus = this.hero ? { x: this.hero.x, y: this.hero.y } : null;
  }

  // a project in a non-fish app: lean the camera a little toward a spot (0..1 across the view)
  lean(u, v) { this.focusUV = { u: clamp(u, 0, 1), v: clamp(v, 0, 1) }; }

  splash(sp) {
    if (this.mode !== 'tank') return;
    const f = this.fish.find((q) => q.sp === sp);
    const V = this.V;
    const x = V.x + (Math.random() - 0.5) * V.wu * 0.4;
    if (f) { const i = f.ind[0]; i.x = x; i.y = SURF + 0.4; i.z = 0.4; i.dive = 1; i.vy = -2.6; }
    try { this.D.life.bubble(x, SURF - 0.4, 0.4, 16, 2); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ input
  pointer(x, y) {
    const p = this.ptr;
    const now = performance.now();
    if (p.on) { const dt = Math.max(1, now - p.t); p.vx = (x - p.x) / dt; p.vy = (y - p.y) / dt; }
    p.x = x; p.y = y; p.on = true; p.t = now;
    if (hypot(p.vx, p.vy) > 0.05) p.still = 0;
  }
  leave() { this.ptr.on = false; }
  click(x, y) {
    if (this.mode !== 'tank') return;
    const w = this._pick(x, y);
    if (!w) return;
    try { this.D.life.bubble(w.x, w.y, 0.5, 9, 1); } catch { /* ignore */ }
    for (const f of this.fish) for (const i of f.ind) { const d = hypot(i.x - w.x, i.y - w.y); if (d < 3.2) { i.vx += ((i.x - w.x) / (d + 0.1)) * 3; i.vy += ((i.y - w.y) / (d + 0.1)) * 1.4; } }
  }
  _pick(x, y) {
    try {
      const ray = this.rig.screenRay(x, y, this.r, this._ray);
      const hit = ray.intersectPlane(this._plane, this._v);
      return hit ? { x: hit.x, y: hit.y } : null;
    } catch { return null; }
  }

  // ------------------------------------------------------------ camera
  _frame(instant, wide = 1) {
    const r = this.r, rig = this.rig, b = this.base;
    const lw = Math.max(1, r.lowW || 320), lh = Math.max(1, r.lowH || 180);
    const wupp = max(b.w / lw, b.h / lh) * wide;
    rig.goal.copy(b.target);
    rig.wuppGoal = wupp;
    rig.yawGoal = b.yaw;
    rig.pitchGoal = b.pitch;
    rig.dist = b.tank ? 30 : rig.dist;
    if (instant) { rig.target.copy(b.target); rig.wupp = wupp; rig.yaw = b.yaw; rig.pitch = b.pitch; }
  }
  // the opening push-in: start wider and settle
  pushIn() { if (this.mode) { this._frame(true, 1.6); this._frame(false, 1); } }

  // ------------------------------------------------------------ per frame
  tick(dt, t) {
    if (!this.ok || !this.mode || document.hidden) return;
    this._acc += dt;
    if (this._acc < 1 / this.fps) return;
    const step = Math.min(0.1, this._acc);
    this._acc = 0;
    this.t += step;
    const rig = this.rig, b = this.base, p = this.ptr;
    p.still += step;
    // pointer parallax: a few degrees of yaw / pitch (ortho: depth layers slide past each other)
    const W = window.innerWidth || 1, Hh = window.innerHeight || 1;
    const px = p.on ? (p.x / W) * 2 - 1 : 0, py = p.on ? (p.y / Hh) * 2 - 1 : 0;
    const drift = sin(this.t * 0.13) * 0.035;
    rig.yawGoal = b.yaw + (b.world ? px * 0.02 + drift * 0.3 : px * 0.07 + drift);
    rig.pitchGoal = b.pitch + py * 0.03;
    // the subject: the scene's centre, eased toward the focused thing
    const g = rig.goal.copy(b.target);
    if (this.focus) { g.x += (this.focus.x - b.target.x) * 0.35; g.y += (this.focus.y - b.target.y) * 0.25; }
    else if (this.focusUV && !b.tank) { const k = b.w * 0.12; g.x += (this.focusUV.u - 0.5) * k * cos(b.yaw); g.z -= (this.focusUV.u - 0.5) * k * sin(b.yaw); g.z += (this.focusUV.v - 0.5) * k * 0.6; }
    g.x += sin(this.t * 0.11) * (b.tank ? 0.5 : b.world ? 0.4 : 0.08);
    g.y += sin(this.t * 0.17) * (b.tank ? 0.12 : 0.03);
    if (this.mode === 'tank') this._tank(step);
    else if (this.mode === 'desk') this._desk(step);
    rig.update(step, this.r);
    this._offset();
    try {
      this.r.setFogEnabled?.(false);
      this.r.render(this.scene, rig);
      if (this.inset) this._renderInset(step);
    } catch (e) { console.warn('lab 3d', e); this.ok = false; }
  }

  // shift the projection so the subject sits in the middle of the view rect (whole low-res px)
  _offset() {
    const v = this.view, r = this.r, cam = this.rig.camera;
    if (!v) return;
    const W = window.innerWidth, Hh = window.innerHeight;
    const ps = (r.pixelScale || 3) / (r.dpr || 1); // css px per low-res px
    const dx = Math.round(((v.x + v.w / 2) - W / 2) / ps), dy = Math.round(((v.y + v.h / 2) - Hh / 2) / ps);
    const w = this.rig.wupp;
    cam.left -= dx * w; cam.right -= dx * w;
    cam.top += dy * w; cam.bottom += dy * w;
    cam.updateProjectionMatrix();
  }

  _desk(dt) {
    const L = this.g.lab;
    if (!L || L.active) return; // LabMode animates its own room while it is on
    try { L.lab?.update?.(dt, this.t); } catch { /* ignore */ }
    try { L.fox?.update?.(dt); } catch { /* ignore */ }
  }

  _tank(dt) {
    const D = this.D, V = this.V, p = this.ptr;
    const w = p.on ? this._pick(p.x, p.y) : null;
    if (w) this.world.set(w.x, w.y, 0.2); else this.world.set(0, -99, 0);
    const fast = hypot(p.vx, p.vy) > 0.25 && p.still < 0.4;
    for (const f of this.fish) {
      f.ind.forEach((i, k) => {
        i.t -= dt;
        if (i.dive) {
          i.vy += 1.6 * dt; i.y += i.vy * dt;
          if (i.vy >= 0 || i.y < V.y) i.dive = 0;
        } else {
          if (i.t <= 0) { i.t = 2 + Math.random() * 3; i.tx = V.x + (Math.random() - 0.5) * V.wu * 0.75; i.ty = clamp(V.y + (Math.random() - 0.5) * 3, bedH(i.x, i.z) + 0.6, SURF - 0.8); i.tz = -1.8 + Math.random() * 2.8; }
          let ax = (i.tx - i.x) * 0.5, ay = (i.ty - i.y) * 0.5, az = (i.tz - i.z) * 0.4;
          if (w) {
            const dx = i.x - w.x, dy = i.y - w.y, d = hypot(dx, dy) + 0.01;
            if (fast && d < 3.4) { ax += (dx / d) * 5.5; ay += (dy / d) * 2.4; }
            else if (!fast && p.still > 1.2 && d < 5 && d > 1.4) { ax -= (dx / d) * 0.9; ay -= (dy / d) * 0.5; } // curious
          }
          i.vx += ax * dt; i.vy += ay * dt; i.vz = (i.vz || 0) + az * dt;
          const sp = hypot(i.vx, i.vy), mx = 1.6;
          if (sp > mx) { i.vx *= mx / sp; i.vy *= mx / sp; }
          i.vx *= 1 - dt * 0.6; i.vy *= 1 - dt * 0.9; i.vz *= 1 - dt;
          i.x += i.vx * dt; i.y += i.vy * dt; i.z = clamp(i.z + i.vz * dt, -2.2, 1.6);
          i.y = clamp(i.y, bedH(i.x, i.z) + 0.35, SURF - 0.5);
        }
        if (abs(i.vx) > 0.05) i.h = i.vx > 0 ? 0 : PI;
        f.pack.set(k, i.x, i.y + sin(this.t * 2 + k) * 0.04, i.z, i.h);
      });
      f.pack.flush();
    }
    const h = this.hero;
    if (h) {
      h.t += dt;
      const tx = V.x + sin(h.t * 0.25) * V.wu * 0.28, ty = V.y + 1.1 + sin(h.t * 0.7) * 0.25;
      const vx = (tx - h.x) * 0.8;
      h.x += vx * dt; h.y += (ty - h.y) * dt;
      if (abs(vx) > 0.02) h.h = vx > 0 ? 0 : PI;
      h.pack.set(0, h.x, h.y, 2.2, h.h);
      h.pack.flush();
      this.focus = { x: h.x, y: h.y };
    }
    try { D.sc.update(dt, this.t, this.world); } catch { /* ignore */ }
    try { D.life.update(dt, this.t, this.world); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ the card inset
  // spec: { kind: 'fish', sp, dark } | { kind: 'build', id, icon } | { kind: 'crop', id } | { kind: 'icon', name } | null
  setInset(spec) {
    const key = spec ? `${spec.kind}|${spec.sp || spec.id || spec.name}|${spec.dark ? 1 : 0}` : '';
    if (key === this._insetKey) return;
    this._insetKey = key;
    this._clearInset();
    this.inset = spec ? { ...spec, t: 0 } : null;
    if (!spec || !this.ok) return;
    try {
      if (spec.kind === 'fish') this._insetFish(spec);
      else this._insetShow(spec);
    } catch (e) { console.warn('lab inset', e); this.inset = null; }
  }
  setInsetRect(rect) { if (this.inset) this.inset.rect = rect; }

  _clearInset() {
    const I = this.inset;
    if (!I) return;
    if (I.pack) I.pack.mesh.visible = false;
    if (I.group) I.group.removeFromParent();
    this.inset = null;
  }

  _insetFish(spec) {
    const D = diveSet();
    this.D = this.D || D;
    const I = this.inset;
    const V = this.V || TANK_VIEW.panfish;
    // a kelpy stretch of the lake just past the app's own view
    I.scene = D.sc.scene;
    I.at = { x: V.x + V.wu * 0.62, y: V.y + 0.3, z: 0.6 };
    I.wu = 4.6;
    I.pitch = 0.2; I.yaw = 0;
    const pack = this._pack(spec.sp, 1, 1.15);
    if (pack) {
      I.pack = pack;
      if (spec.dark) { // a dark silhouette: the same sprite, inked over in the shader
        if (!pack._dark) {
          const m = pack.mat.clone();
          for (const k of Object.keys(pack.mat.uniforms)) m.uniforms[k] = pack.mat.uniforms[k];
          m.fragmentShader = m.fragmentShader.replace(/}\s*$/, '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.03, 0.06, 0.07), 0.9);\n}');
          pack._dark = m; pack._lit = pack.mat;
        }
        pack.mesh.material = pack._dark;
      } else if (pack._lit) pack.mesh.material = pack._lit;
      I.fish = { x: I.at.x, y: I.at.y, z: 1.8, h: 0, dir: 1, turn: 0, t: 0 };
    }
  }

  // a showroom spot in the real world near the player's pond: flat grass, nothing on it
  _spot() {
    if (this._spotP) return this._spotP;
    const g = this.g, G = g.grid;
    const cx = Math.round(g.rig?.target?.x ?? 66), cz = Math.round(g.rig?.target?.z ?? 38);
    let best = null;
    if (G) for (let r = 7; r < 20 && !best; r++) for (let a = 0; a < 24 && !best; a++) {
      const x = Math.round(cx + Math.cos(a / 24 * Math.PI * 2) * r), z = Math.round(cz + Math.sin(a / 24 * Math.PI * 2) * r);
      let ok = true;
      const h0 = G.surfaceY(x, z);
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) {
        const X = x + dx, Z = z + dz;
        if (!G.inb(X, Z)) { ok = false; break; }
        const i = G.idx(X, Z);
        if (G.kind[i] !== KIND.GRASS || G.occ[i] >= 0 || G.deco[i] >= 0 || Math.abs(G.height[i] - h0) > 0.05) ok = false;
      }
      if (ok) best = { x: x + 0.5, y: h0, z: z + 0.5 };
    }
    this._spotP = best || { x: cx + 0.5, y: 0, z: cz + 8.5 };
    return this._spotP;
  }

  _insetShow(spec) {
    const g = this.g, I = this.inset;
    if (!g.scene) { this.inset = null; return; }
    const S = this._spot();
    const grp = new THREE.Group();
    grp.position.set(S.x, S.y, S.z);
    I.group = grp; I.scene = g.scene; I.at = { x: S.x, y: S.y + 0.45, z: S.z };
    I.pitch = g.rig?.pitch ?? 0.7; I.yaw = g.rig?.yaw || 0;
    I.wu = 3.6;
    if (spec.kind === 'build') {
      let obj = null;
      try { obj = g.structures?.previewObject?.(spec.id) || null; } catch (e) { console.warn('lab inset model', e); obj = null; }
      if (obj) {
        const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
        const turn = new THREE.Group();
        obj.position.x -= (box.min.x + box.max.x) / 2; obj.position.z -= (box.min.z + box.max.z) / 2; obj.position.y -= box.min.y;
        turn.add(obj);
        grp.add(turn);
        I.turn = turn;
        I.wu = Math.max(3.2, Math.max(size.x, size.z, size.y * 1.2) * 2.4);
        I.at.y = S.y + size.y * 0.42;
      } else spec = { kind: 'icon', name: spec.icon || 'hammer' };
    }
    if (spec.kind === 'crop') {
      I.stages = (stagesFor(spec.id) || []).map((n) => natSprite(n)).filter(Boolean);
      I.produce = iconSprite(CROPS[spec.id]?.item || spec.id);
      I.plants = [-0.75, 0, 0.75].map((dx) => { const sp = new THREE.Sprite(); sp.center.set(0.5, 0); sp.position.set(dx, 0.02, dx * 0.2); grp.add(sp); return sp; });
      if (I.produce) { I.pop = new THREE.Sprite(I.produce.mat); I.pop.center.set(0.5, 0.5); I.pop.visible = false; grp.add(I.pop); }
      I.wu = 3.4;
    }
    if (spec.kind === 'icon') {
      const m = iconSprite(spec.name) || iconSprite('flask');
      if (m) { I.iconSp = new THREE.Sprite(m.mat); I.iconSp.center.set(0.5, 0); I.iconSp.scale.set(m.w / 14, m.h / 14, 1); grp.add(I.iconSp); }
      I.wu = 2.8;
    }
    g.scene.add(grp);
  }

  _insetUpdate(dt) {
    const I = this.inset;
    const nowT = performance.now() / 1000; // wall clock: the loops keep their pace even on a slow frame
    I.t0 = I.t0 ?? nowT;
    dt = Math.min(0.25, Math.max(0, nowT - (I.tl ?? nowT)));
    I.tl = nowT;
    I.t = nowT - I.t0;
    if (I.fish && I.pack) {
      const f = I.fish, half = I.wu * 0.32;
      f.t += dt;
      if (f.turn > 0) f.turn -= dt;
      else f.x += f.dir * (this.inset.dark ? 0.25 : 0.55) * dt;
      if (f.x > I.at.x + half && f.dir > 0) { f.dir = -1; f.turn = 0.4; }
      if (f.x < I.at.x - half && f.dir < 0) { f.dir = 1; f.turn = 0.4; }
      f.y = I.at.y + sin(f.t * 0.9) * 0.25;
      I.pack.set(0, f.x, f.y, f.z, f.dir > 0 ? 0 : PI);
      I.pack.flush();
      if (Math.random() < dt * 0.8) { try { this.D.life.bubble(f.x + f.dir * 0.4, f.y + 0.1, f.z, 2, 1); } catch { /* ignore */ } }
    }
    if (I.turn) I.turn.rotation.y = I.t * 0.45;
    if (I.plants) { // seed .. ripe on a loop, then the produce pops out
      const L = 6.4, u = I.t % L, st = u < 0.8 ? -1 : Math.min(3, Math.floor((u - 0.8) / 1.2));
      I.plants.forEach((sp, i) => {
        const s = st < 0 ? null : I.stages[Math.min(I.stages.length - 1, Math.max(0, st - (i === 1 ? 0 : (u % 1.2 < 0.3 ? 1 : 0))))];
        sp.visible = !!s;
        if (s) { if (sp.material !== s.mat) sp.material = s.mat; const pop = (u - 0.8) % 1.2 < 0.12 ? 1.15 : 1; sp.scale.set((s.w / 16) * pop, (s.h / 16) * pop, 1); }
      });
      if (I.pop) {
        const k = (u - 5.2) / 1.2;
        I.pop.visible = k > 0;
        if (k > 0) { I.pop.position.set(0, 0.7 + k * 1.1 + sin(k * PI) * 0.3, 0.1); I.pop.scale.set(I.produce.w / 16, I.produce.h / 16, 1); }
      }
    }
    if (I.iconSp) I.iconSp.position.y = 0.15 + sin(I.t * 2.2) * 0.08;
  }

  _renderInset(dt) {
    const I = this.inset;
    if (!I || !I.rect || !I.scene || I.rect.w < 8 || I.rect.h < 8) return;
    const R = this.r.renderer;
    if (!R) return;
    this._insetUpdate(dt);
    const px = 2; // css px per inset pixel
    const iw = Math.max(8, Math.round(I.rect.w / px)), ih = Math.max(8, Math.round(I.rect.h / px));
    if (!this.irt || this.irt.width !== iw || this.irt.height !== ih) {
      this.irt?.dispose();
      this.irt = new THREE.WebGLRenderTarget(iw, ih, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.irt.depthTexture = new THREE.DepthTexture(iw, ih);
      if (!this.ink) {
        const mat = new THREE.ShaderMaterial({ vertexShader: INK_VERT, fragmentShader: INK_FRAG, depthTest: false, depthWrite: false, uniforms: { tColor: { value: null }, tDepth: { value: null }, size: { value: new THREE.Vector2() }, ink: { value: new THREE.Color(0x1a0e06) }, cNear: { value: 1 }, cFar: { value: 260 } } });
        const q = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        q.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        q.frustumCulled = false;
        const sc = new THREE.Scene(); sc.add(q);
        this.ink = { mat, scene: sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
      }
      this.ink.mat.uniforms.tColor.value = this.irt.texture;
      this.ink.mat.uniforms.tDepth.value = this.irt.depthTexture;
      this.ink.mat.uniforms.size.value.set(iw, ih);
    }
    const rig = this.irig || (this.irig = new CameraRig());
    rig.freeBounds = true; rig.minWupp = 0.0005; rig.maxWupp = 2;
    const w = I.wu / iw;
    rig.goal.set(I.at.x + (I.fish ? (I.fish.x - I.at.x) * 0.35 : 0), I.at.y, I.at.z);
    rig.wuppGoal = w; rig.yawGoal = I.yaw + (I.fish ? sin(I.t * 0.2) * 0.04 : 0); rig.pitchGoal = I.pitch;
    if (!I._snap) { I._snap = 1; rig.target.copy(rig.goal); rig.wupp = w; rig.yaw = rig.yawGoal; rig.pitch = I.pitch; }
    rig.dist = I.fish ? 30 : (this.g.rig?.dist || 110);
    rig.update(dt, this.r);
    const cam = rig.camera;
    cam.left = -(iw * w) / 2; cam.right = (iw * w) / 2; cam.top = (ih * w) / 2; cam.bottom = -(ih * w) / 2;
    cam.updateProjectionMatrix();
    this.ink.mat.uniforms.cNear.value = cam.near; this.ink.mat.uniforms.cFar.value = cam.far;
    const prevAuto = R.autoClear, prevShadow = R.shadowMap.autoUpdate;
    R.setRenderTarget(this.irt);
    R.autoClear = true;
    R.shadowMap.autoUpdate = false; // the main pass just drew the shadow map: reuse it, never redraw the world's shadows for a thumbnail
    R.render(I.scene, cam);
    R.shadowMap.autoUpdate = prevShadow;
    R.setRenderTarget(null);
    const buf = R.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2()));
    const k = buf.x / Math.max(1, window.innerWidth);
    const x = Math.round(I.rect.x * k), y = Math.round(buf.y - (I.rect.y + I.rect.h) * k), ww = Math.round(I.rect.w * k), hh = Math.round(I.rect.h * k);
    R.setScissorTest(true);
    R.setScissor(x, y, ww, hh);
    R.setViewport(x, y, ww, hh);
    R.autoClear = false;
    R.render(this.ink.scene, this.ink.cam);
    R.setScissorTest(false);
    R.setViewport(0, 0, buf.x, buf.y);
    R.autoClear = prevAuto;
  }

  dispose() {
    this._clearFish();
    this._clearInset();
    this._insetKey = '';
    this.mode = null;
  }
}
