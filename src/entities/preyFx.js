// The snack a bear is eating, as something its rig can hold (see BearRig.prey and
// the eat_* poses in bearRig.js; src/game/BearEat.js drives the whole thing).
//
//   const prey = makeFishPrey(game, fish, style);   // a fish from the pond (fish atlas sprite)
//   const prey = makeDuckPrey(duckRig, style);       // a Duck rig (title screen gag)
//   rig.hold(prey.root);  prey.sync(rig) after every rig.pose()  (BearEat does both)
//
// Prey: { kind, root, len (world length), sync(rig), onEvent(name), detachHead(parent, vel), update(dt),
//         setFree(on), dispose() }
// The fish is a camera-facing pixel strip (no rotation from its parent): it bends
// like a noodle, gets bites taken out of its pixels (ragged, cartoon-red edges),
// can lose its head (two pieces) or be eaten down to a clean skeleton. It is
// nudged towards the camera when the bear faces it, so it reads in the paws
// instead of clipping into the muzzle (orthographic camera: no visible change).
import * as THREE from 'three';
import { FISH_TPU } from '../game/fishSprites.js';

const SEG = 10;
const CUT_U = 0.68; // where 'rip' tears the head off (u: 0 tail .. 1 head)
const BONE_U = [0.17, 0.78]; // body span that turns to bone (head and tail fin stay)
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _R = new THREE.Vector3(), _U = new THREE.Vector3(), _B = new THREE.Vector3(), _m = new THREE.Matrix4();
const MEAT = [200, 40, 58], MEAT_L = [240, 96, 112], BONE = [244, 236, 216], BONE_D = [150, 132, 104];

// ------------------------------------------------------------------ fish pixels
function grabFrame(game, f) {
  const fs = game.fish;
  const fr = fs.atlas.frame(f.sp?.id ?? f.id, f.g?.morph || 'normal', 4, false);
  const src = fs.atlas.canvas.getContext('2d', { willReadFrequently: true }).getImageData(fr.x, fr.y, fr.w, fr.h);
  return { w: fr.w, h: fr.h, data: src.data };
}

// per-column silhouette (first / last opaque row)
function columns(F) {
  const top = new Int16Array(F.w).fill(-1), bot = new Int16Array(F.w).fill(-1);
  for (let x = 0; x < F.w; x++)
    for (let y = 0; y < F.h; y++)
      if (F.data[(y * F.w + x) * 4 + 3] > 127) { if (top[x] < 0) top[x] = y; bot[x] = y; }
  return { top, bot };
}

class FishPix {
  constructor(F) {
    this.F = F;
    this.col = columns(F);
    this.cv = document.createElement('canvas');
    this.cv.width = F.w; this.cv.height = F.h;
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(F.w, F.h);
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.key = '';
  }
  // keep columns [x0, x1) of the fish; ragged meat edges where it was torn / bitten;
  // bone: columns [b0, b1) become a spine with ribs
  draw(x0, x1, b0 = -1, b1 = -1) {
    const key = `${x0}|${x1}|${b0}|${b1}`;
    if (key === this.key) return;
    this.key = key;
    const { w, h, data } = this.F, o = this.img.data, { top, bot } = this.col;
    o.fill(0);
    const jag = (y) => ((y * 5 + 3) % 3) - 1; // -1..1 ragged tear
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i + 3] < 128) continue;
        const lo = x0 > 0 ? x0 + jag(y) : 0, hi = x1 < w ? x1 + jag(y + 1) : w;
        if (x < lo || x >= hi) continue;
        if (b0 >= 0 && x >= b0 && x < b1) continue;
        let c = [data[i], data[i + 1], data[i + 2]];
        if ((x1 < w && x >= hi - 1) || (x0 > 0 && x <= lo)) c = (y + x) % 2 ? MEAT : MEAT_L; // torn flesh
        o.set([c[0], c[1], c[2], 255], i);
      }
    if (b0 >= 0) {
      for (let x = Math.max(b0, x0); x < Math.min(b1, x1); x++) {
        if (top[x] < 0) continue;
        const mid = Math.round((top[x] + bot[x]) / 2);
        const put = (y, c) => { if (y >= 0 && y < h) o.set([c[0], c[1], c[2], 255], (y * w + x) * 4); };
        put(mid - 1, BONE_D); put(mid, BONE); put(mid + 1, BONE_D);
        if ((x - b0) % 2 === 0) for (let y = top[x] + 1; y < bot[x]; y++) if (Math.abs(y - mid) > 1) put(y, (y + x) % 3 ? BONE : [226, 214, 190]);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.needsUpdate = true;
  }
  dispose() { this.tex.dispose(); }
}

// camera-facing bendable strip; layout() writes world-oriented offsets each frame
function makeStrip(tex) {
  const g = new THREE.BufferGeometry();
  const n = (SEG + 1) * 2;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const idx = [];
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
  g.setIndex(idx);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.castShadow = false; // its matrix is set in onBeforeRender (the shadow pass would see a stale one)
  m.matrixAutoUpdate = false;
  return m;
}

// Lay a strip out on screen: tail at `o` (world), along screen direction (dx, dy), u in [u0, u1]
// of a w x h sprite; mirror = sprite drawn back-up when the head points left.
function layout(mesh, cam, o, dx, dy, mirror, w, h, u0, u1, st) {
  const e = cam.matrixWorld.elements;
  _R.set(e[0], e[1], e[2]).normalize(); _U.set(e[4], e[5], e[6]).normalize(); _B.set(e[8], e[9], e[10]).normalize();
  const nx = mirror ? dy : -dy, ny = mirror ? -dx : dx; // the fish's "up" (its back)
  const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal, uv = mesh.geometry.attributes.uv;
  const T = performance.now() / 1000;
  for (let i = 0; i <= SEG; i++) {
    const k = i / SEG, u = u0 + (u1 - u0) * k;
    let s = (u - st.uA) * w * st.stretch;
    // noodle wave + a flailing tail (bend grows away from the held point)
    const far = Math.abs(u - st.uA);
    const off = st.wave * h * 0.45 * Math.sin(u * 9 - T * 13) * far + st.wiggle * h * 0.22 * Math.sin(T * 15 + u * 3) * far * far * 2;
    const hh = h * 0.5 * st.thick;
    for (let j = 0; j < 2; j++) {
      const side = j ? hh : -hh;
      const a = s * dx + (side + off) * nx, b = s * dy + (side + off) * ny;
      pos.setXYZ(i * 2 + j, _R.x * a + _U.x * b, _R.y * a + _U.y * b, _R.z * a + _U.z * b);
      nor.setXYZ(i * 2 + j, _B.x, _B.y, _B.z);
      uv.setXY(i * 2 + j, u, j);
    }
  }
  pos.needsUpdate = true; nor.needsUpdate = true; uv.needsUpdate = true;
  mesh.matrixWorld.makeTranslation(o.x, o.y, o.z);
}

/**
 * A fish from the pond as a held, eatable sprite. f: a FishSystem fish ({ sp, g, adult }) or { id, morph, size }.
 * Options via style only change defaults; everything else follows rig.prey each frame.
 */
export function makeFishPrey(game, f, style = 'chomp') {
  const F = grabFrame(game, f);
  const size = (f.g?.size || f.size || 1) * (f.adult === false ? 0.6 : 1);
  const w = (F.w / FISH_TPU) * size, h = (F.h / FISH_TPU) * size;
  const body = new FishPix(F), headPix = new FishPix(F);
  const root = new THREE.Group();
  root.name = 'prey:fish';
  const mesh = makeStrip(body.tex);
  const holder = new THREE.Object3D(); // world anchor read by the strip
  root.add(holder);
  const st = { uA: 0.5, stretch: 1, thick: 1, wave: 0, wiggle: 1 };
  const state = { mirror: false, ctl: null, bias: 0, free: false, spin: 0, lipW: new THREE.Vector3(), feed: false, headOff: false, bones: [] };
  let head = null; // flying head piece { mesh, pos, vel, spin, rot, t, landed }
  root.add(mesh);
  mesh.onBeforeRender = (r, s, cam) => render(cam);

  function render(cam) {
    const c = state.ctl || { angle: 0, anchor: 0.5, eat: 0, show: 1 };
    holder.getWorldPosition(_p);
    const e = cam.matrixWorld.elements;
    _B.set(e[8], e[9], e[10]).normalize();
    _p.addScaledVector(_B, state.bias);
    const ripped = state.headOff;
    let uMin = 0, uMax = ripped ? CUT_U : 1, b0 = -1, b1 = -1;
    if (c.bone) { b0 = BONE_U[1] - c.eat * (BONE_U[1] - BONE_U[0]); b1 = BONE_U[1]; }
    else uMax *= 1 - (c.eat || 0);
    let dx, dy, mirror = state.mirror;
    let ang = state.free ? state.spin : (c.angle || 0) + (c.spin || 0);
    st.uA = (c.anchor ?? 0.5) * (c.bone ? 1 : uMax);
    if (state.feed && c.feed) {
      // tail on the anchor, head pointing at the lip; past the lip = inside the mouth
      _v.copy(state.lipW).sub(_p);
      _w.set(e[0], e[1], e[2]).normalize();
      const lx = _v.dot(_w); _w.set(e[4], e[5], e[6]).normalize();
      const ly = _v.dot(_w);
      const d = Math.hypot(lx, ly) || 1e-4;
      dx = lx / d; dy = ly / d;
      if (Math.abs(dx) > 0.2) mirror = dx < 0;
      uMax = Math.min(uMax, d / (w * st.stretch));
      st.uA = 0;
    } else {
      if (mirror) ang = Math.PI - ang;
      dx = Math.cos(ang); dy = Math.sin(ang);
    }
    const vis = c.show !== 0 && uMax > 0.02;
    mesh.visible = vis;
    if (!vis) return;
    body.draw(Math.round(uMin * F.w), Math.round(uMax * F.w), b0 >= 0 ? Math.round(b0 * F.w) : -1, b1 >= 0 ? Math.round(b1 * F.w) : -1);
    layout(mesh, cam, _p, dx, dy, mirror, w, h, uMin, uMax, st);
  }

  const prey = {
    kind: 'fish', root, len: w, h, style,
    // called right after the bear's pose: copy what the pose wants, pick the screen side of the head
    sync(rig) {
      const c = (state.ctl = rig.prey);
      st.stretch = c.stretch; st.thick = c.thick; st.wave = c.wave; st.wiggle = (c.wiggle ?? 1) * (state.free ? 1.5 : 0.6);
      if (c.headOff && !state.headOff) prey.onEvent('rip');
      state.feed = !!c.feed;
      if (c.feed && c.lip) rig.bones[2].localToWorld(state.lipW.set((c.lip.x) * 0.1, (c.lip.y - 10) * 0.1, (c.lip.z) * 0.1));
      // which way is the bear's right paw on screen (hysteresis so it never flickers)
      const cam = prey.camera;
      if (cam) {
        const e = cam.matrixWorld.elements;
        _R.set(e[0], e[1], e[2]); _B.set(e[8], e[9], e[10]);
        rig.root.getWorldQuaternion(_q);
        _v.set(1, 0, 0).applyQuaternion(_q); // bear right
        _w.set(0, 0, 1).applyQuaternion(_q); // bear forward
        const sr = _v.dot(_R);
        if (sr < -0.25) state.mirror = true; else if (sr > 0.25) state.mirror = false;
        else if (Math.abs(_w.dot(_R)) > 0.3) state.mirror = _w.dot(_R) < 0; // profile: head points where it looks
        // facing the camera: draw the snack in front of the muzzle (no visible shift in ortho)
        const sc = rig.def.scale * rig.P.size;
        state.bias = Math.max(0, _w.dot(_B)) * 0.75 * sc;
      }
    },
    camera: null,
    setFree(on) { state.free = on; if (on) state.spin = state.ctl?.angle || 0; },
    spinFree(dt) { state.spin += dt * 11; },
    onEvent(name) {
      if (name === 'rip' && !state.headOff) { state.headOff = true; }
    },
    // tear the head off as its own flying sprite in `parent` (world space). Returns its world position.
    detachHead(parent, vel) {
      state.headOff = true;
      if (head) return head.pos;
      headPix.draw(Math.round(CUT_U * F.w), F.w);
      const m = makeStrip(headPix.tex);
      parent.add(m);
      holder.getWorldPosition(_p);
      const along = (CUT_U - st.uA + (1 - CUT_U) / 2) * w;
      const dir = state.mirror ? -1 : 1;
      const cam = prey.camera;
      if (cam) { const e = cam.matrixWorld.elements; _R.set(e[0], e[1], e[2]).normalize(); _p.addScaledVector(_R, along * dir); }
      head = { mesh: m, pos: _p.clone(), vel: vel.clone(), rot: 0, spin: (dir > 0 ? -1 : 1) * 14, t: 0, landed: false, mirror: state.mirror };
      m.onBeforeRender = (r, s, c) => {
        const a = head.rot;
        layout(m, c, head.pos, Math.cos(a) * (head.mirror ? -1 : 1), Math.sin(a), head.mirror, w, h, CUT_U, 1, { uA: (CUT_U + 1) / 2, stretch: 1, thick: 1, wave: 0, wiggle: 0 });
      };
      return head.pos;
    },
    // flying pieces: gravity, a bounce / splash, fade away. groundAt(x, z) -> { y, water }
    update(dt, groundAt, onLand) {
      if (!head) return;
      head.t += dt;
      if (!head.landed) {
        head.vel.y -= 11 * dt;
        head.pos.addScaledVector(head.vel, dt);
        head.rot += head.spin * dt;
        const g = groundAt ? groundAt(head.pos.x, head.pos.z) : { y: 0, water: false };
        if (head.pos.y <= g.y + 0.06 && head.vel.y < 0) {
          if (!g.water && Math.abs(head.vel.y) > 2.2) { head.vel.y *= -0.35; head.vel.x *= 0.5; head.vel.z *= 0.5; head.spin *= 0.4; onLand?.(head.pos, g.water, true); }
          else { head.landed = true; head.pos.y = g.y + (g.water ? 0.01 : 0.06); head.rot = Math.round(head.rot / Math.PI) * Math.PI; onLand?.(head.pos, g.water, false); }
        }
      } else if (head.t > 3.5) {
        head.mesh.visible = Math.floor(head.t * 10) % 2 === 0;
        if (head.t > 4.4) { head.mesh.parent?.remove(head.mesh); head.mesh.geometry.dispose(); head.mesh.material.dispose(); head = null; }
      }
    },
    get headPiece() { return head; },
    dispose() {
      root.parent?.remove(root);
      mesh.geometry.dispose(); mesh.material.dispose(); body.dispose();
      if (head) { head.mesh.parent?.remove(head.mesh); head.mesh.geometry.dispose(); head.mesh.material.dispose(); head = null; }
      headPix.dispose();
    },
  };
  // the rig disposes held objects through userData.dispose (rig.hold(null))
  root.userData.dispose = () => prey.dispose();
  root.userData.prey = prey;
  return prey;
}

// ------------------------------------------------------------------ duck
// Wraps an existing Duck rig (critterDuck.js). The duck's root goes inside our
// root; it is turned so its beak points along rig.prey.angle in the bear's front
// plane, shrinks as it is eaten, stretches like a noodle when slurped, and its
// head can pop off (a cloned head flies away, the real one is just hidden).
const DUCK_LEN = 0.42, DUCK_MID = 0.17; // body length / height of the body centre (unscaled)
export function makeDuckPrey(duck, style = 'gulp', { scale = null } = {}) {
  const root = new THREE.Group();
  root.name = 'prey:duck';
  const pivot = new THREE.Group();
  root.add(pivot);
  const s0 = scale ?? duck.root.scale.x;
  const home = { parent: duck.root.parent, pos: duck.root.position.clone(), rot: duck.root.rotation.clone(), scale: duck.root.scale.clone() };
  pivot.add(duck.root);
  duck.root.position.set(0, 0, 0);
  duck.root.rotation.set(0, 0, 0);
  duck.root.scale.setScalar(s0);
  const len = DUCK_LEN * s0;
  let head = null, ctl = null, free = false, spin = 0, lipW = new THREE.Vector3(), feed = false, playing = '';
  const play = (n) => { if (playing !== n && duck.anims.includes(n)) { playing = n; duck.play(n, { fade: 0.08 }); } };
  play(duck.anims.includes('struggle') ? 'struggle' : 'chase_flee');
  duck.setExpression?.('panic');
  const prey = {
    kind: 'duck', root, len, duck, style, camera: null,
    sync(rig) {
      ctl = rig.prey;
      feed = !!ctl.feed;
      if (feed && ctl.lip) rig.bones[2].localToWorld(lipW.set(ctl.lip.x * 0.1, (ctl.lip.y - 10) * 0.1, ctl.lip.z * 0.1));
      // undo the anchor's world scale so the duck keeps its size
      root.parent?.getWorldScale(_v);
      const k = 1 / Math.max(1e-3, _v.x);
      const eat = ctl.bone ? ctl.eat * 0.9 : ctl.eat;
      const shrink = Math.max(0.05, 1 - 0.8 * eat);
      const str = ctl.stretch * (1 + (ctl.wave || 0) * 0.35);
      if (!free) {
        root.scale.setScalar(k);
        // beak along the angle in the bear's front plane (x right, y up)
        const a = ctl.angle + (ctl.spin || 0);
        pivot.rotation.set(0, 0, a, 'XYZ');
        duck.root.rotation.set(0, Math.PI / 2, 0);
        duck.root.scale.set(s0 * shrink / Math.sqrt(str), s0 * shrink / Math.sqrt(str), s0 * shrink * str);
        // anchor: 0 = tail end, 1 = beak end on the hold point
        const along = ((ctl.anchor ?? 0.5) - 0.5) * len * shrink * str;
        duck.root.position.set(-along, -DUCK_MID * s0 * shrink, 0);
        if (feed) {
          // dangled by the feet over the maw and dropped in: shrink as it passes the lip
          root.getWorldPosition(_p);
          const d = _p.y - lipW.y;
          const f = Math.min(1, Math.max(0, d / Math.max(0.05, len)));
          duck.root.scale.multiplyScalar(Math.max(0.05, f));
          pivot.rotation.set(0, 0, -Math.PI / 2);
          duck.root.position.set(len * 0.45 * f, -DUCK_MID * s0 * f, 0);
        }
      }
      root.visible = ctl.show !== 0 && (!feed || true);
      play(free ? 'flap' : duck.anims.includes('struggle') ? 'struggle' : 'chase_flee');
    },
    setFree(on) { free = on; if (on) { spin = 0; root.scale.setScalar(1); pivot.rotation.set(0, 0, 0); duck.root.rotation.set(0, 0, 0); duck.root.scale.setScalar(s0); duck.root.position.set(0, -DUCK_MID * s0, 0); } },
    spinFree(dt) { spin += dt * 9; pivot.rotation.set(spin, 0, 0); },
    onEvent() {},
    // the head pops off (cartoon!): hide the real one, fling a clone. Returns its world position.
    detachHead(parent, vel) {
      if (head) return head.obj.position;
      duck.head.updateWorldMatrix(true, true);
      const obj = duck.head.clone(true);
      duck.head.matrixWorld.decompose(_p, _q, _w);
      obj.position.copy(_p); obj.quaternion.copy(_q); obj.scale.copy(_w);
      parent.add(obj);
      duck.head.visible = false;
      head = { obj, vel: vel.clone(), t: 0, landed: false, sp: new THREE.Vector3((Math.random() - 0.5) * 16, 10, (Math.random() - 0.5) * 6) };
      return obj.position;
    },
    update(dt, groundAt, onLand) {
      if (!head) return;
      head.t += dt;
      const o = head.obj;
      if (!head.landed) {
        head.vel.y -= 11 * dt;
        o.position.addScaledVector(head.vel, dt);
        o.rotation.x += head.sp.x * dt; o.rotation.y += head.sp.y * dt; o.rotation.z += head.sp.z * dt;
        const g = groundAt ? groundAt(o.position.x, o.position.z) : { y: 0, water: false };
        if (o.position.y <= g.y + 0.03 && head.vel.y < 0) {
          if (Math.abs(head.vel.y) > 2.2) { head.vel.y *= -0.4; head.vel.x *= 0.6; head.vel.z *= 0.6; head.sp.multiplyScalar(0.5); onLand?.(o.position, g.water, true); }
          else { head.landed = true; o.position.y = g.y - (g.water ? 0.02 : 0); onLand?.(o.position, g.water, false); }
        }
      } else {
        o.position.y += Math.sin(head.t * 3) * 0.0006; // bob
        if (head.t > 3.5) {
          o.visible = Math.floor(head.t * 10) % 2 === 0;
          if (head.t > 4.4) { o.parent?.remove(o); head = null; }
        }
      }
    },
    // put the duck back together and hand its root back where it came from (title loop reuse)
    restore() {
      duck.head.visible = true;
      if (head) { head.obj.parent?.remove(head.obj); head = null; }
      const r = duck.root;
      r.parent?.remove(r);
      if (home.parent) home.parent.add(r);
      r.position.copy(home.pos); r.rotation.copy(home.rot); r.scale.copy(home.scale);
      duck.setExpression?.(null);
    },
    dispose() {
      if (head) { head.obj.parent?.remove(head.obj); head = null; }
      root.parent?.remove(root);
    },
  };
  root.userData.prey = prey;
  return prey;
}

export { CUT_U };
