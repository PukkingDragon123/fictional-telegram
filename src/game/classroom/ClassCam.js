// [v30 classroom] A small perspective "film camera" for the classroom cutscenes
// (src/game/Classroom.js). It quacks like CameraRig for the PixelRenderer
// (`camera`, `subpixel`, `worldToScreen`) so it can be `game.overrideRig`.
//
//   const cam = new ClassCam();
//   cam.cut({ pos: [x, y, z], look: [x, y, z] | () => Vector3, fov: 40 });
//   cam.move(shot, 2.5, 'inout');           // eased dolly / crane from the current pose
//   cam.shot.drift = [dx, dy, dz];          // slow push while the shot holds (units / s)
//   cam.shake = 1;                          // decays by itself
//   cam.update(dt, renderer);               // every frame
//
// The renderer's outline pass reads depth * (far - near) as if it were linear.
// For a perspective camera that is near * far / z^2 times the true depth step at
// distance z, so near is picked every frame as subjectDist^2 / far: outlines at
// the subject are exactly as thick as in the ortho game view.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inout: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  smooth: (t) => t * t * t * (t * (t * 6 - 15) + 10),
};
const vec = (a, out) => (a == null ? null : typeof a === 'function' ? out.copy(a()) : Array.isArray(a) ? out.set(a[0], a[1], a[2]) : out.copy(a));

export class ClassCam {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 40);
    this.subpixel = new THREE.Vector2(0, 0);
    this.far = 40;
    this.shake = 0;
    this.shot = null;
    this.t = 0;
    this.handheld = 1; // breathing sway
    // current pose
    this.pos = new THREE.Vector3(0, 2, 6);
    this.look = new THREE.Vector3(0, 1, 0);
    this.fov = 40;
    // move: from pose -> to shot
    this._from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    this._to = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    this._mv = null;
    this._drift = new THREE.Vector3();
    this._driftLook = new THREE.Vector3();
    this._lookFn = null;
    this._posFn = null;
    this.target = this.look; // CameraRig compat (some code reads rig.target)
  }

  /** Jump to a shot. shot = { pos, look, fov, drift, driftLook, hand } */
  cut(shot) {
    this.shot = shot;
    this._mv = null;
    this._posFn = typeof shot.pos === 'function' ? shot.pos : null;
    this._lookFn = typeof shot.look === 'function' ? shot.look : null;
    vec(shot.pos, this.pos); vec(shot.look, this.look);
    this.fov = shot.fov || 40;
    this._drift.set(0, 0, 0); this._driftLook.set(0, 0, 0);
    this.handheld = shot.hand ?? 1;
    this.t = 0;
    return this;
  }

  /** Ease from the current pose to `shot` over `dur` seconds. Resolves when there. */
  move(shot, dur = 1.5, ease = 'inout') {
    if (!dur || dur <= 0) { this.cut(shot); return Promise.resolve(); }
    this._mvRes?.();
    this._from.pos.copy(this.pos); this._from.look.copy(this.look); this._from.fov = this.fov;
    this.shot = shot;
    this._posFn = typeof shot.pos === 'function' ? shot.pos : null;
    this._lookFn = typeof shot.look === 'function' ? shot.look : null;
    vec(shot.pos, this._to.pos); vec(shot.look, this._to.look);
    this._to.fov = shot.fov || this.fov;
    this._drift.set(0, 0, 0); this._driftLook.set(0, 0, 0);
    this.handheld = shot.hand ?? 1;
    this.t = 0;
    return new Promise((res) => { this._mv = { t: 0, dur, ease: EASE[ease] || EASE.inout }; this._mvRes = res; });
  }

  finishMove() { if (this._mv) { this._mv.t = this._mv.dur; } }

  update(dt, renderer) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.t += dt;
    const sh = this.shot;
    if (this._mv) {
      const m = this._mv;
      m.t += dt;
      const k = m.ease(Math.min(1, m.t / m.dur));
      if (this._posFn) vec(this._posFn, this._to.pos);
      if (this._lookFn) vec(this._lookFn, this._to.look);
      this.pos.lerpVectors(this._from.pos, this._to.pos, k);
      this.look.lerpVectors(this._from.look, this._to.look, k);
      this.fov = this._from.fov + (this._to.fov - this._from.fov) * k;
      if (m.t >= m.dur) { this._mv = null; const r = this._mvRes; this._mvRes = null; r?.(); }
    } else if (sh) {
      // hold: follow a moving subject smoothly, drift slowly
      if (this._posFn) this.pos.lerp(vec(this._posFn, _v), 1 - Math.exp(-dt * 3));
      if (this._lookFn) this.look.lerp(vec(this._lookFn, _v), 1 - Math.exp(-dt * 4));
      if (sh.drift && this.t < (sh.driftFor ?? 6)) { this.pos.x += sh.drift[0] * dt; this.pos.y += sh.drift[1] * dt; this.pos.z += sh.drift[2] * dt; }
      if (sh.driftLook && this.t < (sh.driftFor ?? 6)) { this.look.x += sh.driftLook[0] * dt; this.look.y += sh.driftLook[1] * dt; this.look.z += sh.driftLook[2] * dt; }
      if (sh.zoom && this.t < (sh.driftFor ?? 6)) this.fov = Math.max(12, this.fov + sh.zoom * dt);
    }
    const cam = this.camera;
    cam.position.copy(this.pos);
    // handheld breathing + shake
    const hh = 0.006 * this.handheld;
    const T = performance.now() / 1000;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const s = this.shake * this.shake * 0.05;
    cam.position.x += Math.sin(T * 0.9) * hh + (Math.random() - 0.5) * s;
    cam.position.y += Math.sin(T * 1.3 + 1) * hh * 0.7 + (Math.random() - 0.5) * s;
    cam.lookAt(this.look);
    const dist = Math.max(0.3, this.pos.distanceTo(this.look));
    cam.fov = this.fov;
    cam.far = this.far;
    cam.near = Math.max(0.05, Math.min(dist * 0.8, (dist * dist) / this.far));
    if (renderer?.rtW) cam.aspect = renderer.rtW / Math.max(1, renderer.rtH);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // CameraRig-compatible projection (CSS px)
  worldToScreen(p, renderer, out = { x: 0, y: 0, visible: true }) {
    _v.copy(p).project(this.camera);
    const lowX = ((_v.x + 1) / 2) * renderer.rtW - 1;
    const lowY = ((_v.y + 1) / 2) * renderer.rtH - 1;
    const dpr = renderer.dpr || 1;
    out.x = (lowX * renderer.pixelScale) / dpr;
    out.y = (renderer.H - lowY * renderer.pixelScale) / dpr;
    out.visible = _v.z > -1 && _v.z < 1;
    return out;
  }

  /** Distance (along the view axis) that shows `height` world units over `frac` of the frame. */
  static fitDist(height, fov, frac = 1) { return height / frac / 2 / Math.tan((fov * Math.PI) / 360); }
}
