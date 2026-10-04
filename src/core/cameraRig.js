// Orthographic camera with pan / zoom / 45-degree rotation, snapped to the
// low-res pixel grid for stable pixel art.
import * as THREE from 'three';
import { clamp, damp, angleDiff } from './rng.js';

const _v = new THREE.Vector3();
const _R = new THREE.Vector3();
const _U = new THREE.Vector3();
const _F = new THREE.Vector3();

export class CameraRig {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 260);
    this.target = new THREE.Vector3(28, 0, 32);
    this.goal = this.target.clone();
    this.yaw = 0;
    this.yawGoal = 0;
    this.pitch = THREE.MathUtils.degToRad(44);
    this.dist = 110;
    this.wupp = 0.045; // world units per low-res pixel
    this.wuppGoal = 0.045;
    this.minWupp = 0.011;
    this.maxWupp = 0.14;
    this.subpixel = new THREE.Vector2();
    this.bounds = { minX: 10, maxX: 50, minZ: 8, maxZ: 56 };
    this.shake = 0;
    this.follow = null; // optional {x,z} object to follow
    this._rt = { w: 1, h: 1 };
    // [v20 map] edge of the world: `hardBounds` always holds (even in free /
    // cutscene modes), `viewHalfMax` caps how far from the centre the widest
    // zoom can see (tiles), and panning past `bounds` rubber-bands then springs
    // back with a small bounce. `edgePush` = { x, z, k } for the edge vignette.
    this.hardBounds = null;
    this.viewHalfMax = 0;
    this._raw = new THREE.Vector2();
    this._rawOn = false;
    this._panT = 1;
    this._sv = new THREE.Vector2();
    this._anchor = null;
    this.edgePush = { x: 0, z: 0, k: 0 };
  }

  setBounds(b) { this.bounds = b; }

  // Pan by CSS-pixel deltas (drag). dpr/pixelScale convert to world units.
  panPixels(dx, dy, renderer) {
    const wuppCss = this.wupp * (renderer.dpr || 1) / renderer.pixelScale;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // right vector on ground and forward vector on ground
    const rx = cy, rz = -sy;
    const fx = -sy, fz = -cy;
    const gx = dx * wuppCss, gy = dy * wuppCss / Math.sin(this.pitch);
    this._pan(-(rx * gx - fx * gy), -(rz * gx - fz * gy));
  }

  panWorld(dx, dz) {
    this._pan(dx, dz);
  }

  // Move in camera-relative directions (keyboard): forward/right in world units
  panRelative(fwd, right) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this._pan(cy * right - sy * fwd, -sy * right - cy * fwd);
  }

  // [v20 map] user pan: past the edge it gets heavier (rubber band), and
  // springs back once you let go (see update)
  _pan(dx, dz) {
    this.follow = null;
    if (this.freeBounds) { this.goal.x += dx; this.goal.z += dz; this.clampGoal(); return; }
    if (!this._rawOn) { this._raw.set(this.goal.x, this.goal.z); this._rawOn = true; }
    this._raw.x += dx; this._raw.y += dz;
    const b = this.bounds;
    this.goal.x = this._rub(this._raw.x, b.minX, b.maxX);
    this.goal.z = this._rub(this._raw.y, b.minZ, b.maxZ);
    this._panT = 0;
    this._anchor = null;
    this._sv.set(0, 0);
  }

  rubberR() { return 0.8 + this.wupp * 26; }

  _rub(v, lo, hi) {
    const R = this.rubberR();
    if (v < lo) return lo - R * (1 - 1 / (1 + (lo - v) / R));
    if (v > hi) return hi + R * (1 - 1 / (1 + (v - hi) / R));
    return v;
  }

  clampGoal() {
    this._rawOn = false;
    this._anchor = null;
    if (this.freeBounds) { this.clampHard(); return; }
    const b = this.bounds;
    this.goal.x = clamp(this.goal.x, b.minX, b.maxX);
    this.goal.z = clamp(this.goal.z, b.minZ, b.maxZ);
  }

  // [v20 map] never past the edge of the world, whatever set the goal
  clampHard() {
    const h = this.hardBounds;
    if (!h) return;
    this.goal.x = clamp(this.goal.x, h.minX, h.maxX);
    this.goal.z = clamp(this.goal.z, h.minZ, h.maxZ);
  }

  // [v20 map] widest zoom that keeps the view inside the valley
  wuppCap() {
    if (!this.viewHalfMax || this.freeBounds) return Infinity;
    const span = Math.hypot(this._rt.w, this._rt.h / Math.max(0.3, Math.sin(this.pitch)));
    return (2 * this.viewHalfMax) / Math.max(1, span);
  }

  zoom(factor) {
    this.wuppGoal = clamp(this.wuppGoal * factor, this.minWupp, Math.min(this.maxWupp, Math.max(this.minWupp, this.wuppCap())));
  }

  // zoom keeping the ground point under the cursor in place
  zoomAt(factor, cssX, cssY, renderer) {
    const before = this.wuppGoal;
    this.zoom(factor);
    const k = this.wuppGoal / before;
    if (Math.abs(k - 1) < 1e-4 || !renderer) return;
    const p = this.screenToGround(cssX, cssY, renderer, 0, new THREE.Vector3());
    if (!Number.isFinite(p.x)) return;
    // the camera moves from the cursor's point towards the current centre by the zoom ratio
    const gx = this.follow ? this.follow.x : this.goal.x, gz = this.follow ? this.follow.z : this.goal.z;
    if (this.follow) return; // tracking something: zoom on it instead
    this.goal.x = p.x + (gx - p.x) * k;
    this.goal.z = p.z + (gz - p.z) * k;
    this.clampGoal();
  }

  rotate(steps) {
    this.yawGoal += steps * Math.PI / 4;
  }

  lookAt(x, z, instant = false) {
    this.goal.set(x, 0, z);
    this.clampGoal();
    if (instant) this.target.copy(this.goal);
  }

  update(dt, renderer) {
    if (!(dt >= 0)) dt = 0;
    const rtW = renderer.rtW, rtH = renderer.rtH;
    this._rt.w = rtW; this._rt.h = rtH;
    if (this.follow) {
      this.goal.x = this.follow.x;
      this.goal.z = this.follow.z;
      this.clampGoal();
    }
    // [v20 map] the edge of the world
    this.updateEdge(dt);
    const k = this.freeBounds ? 6 : 10;
    this.target.x = damp(this.target.x, this.goal.x, k, dt);
    this.target.y = damp(this.target.y, this.goal.y, k, dt);
    this.target.z = damp(this.target.z, this.goal.z, k, dt);
    this.yaw += angleDiff(this.yaw, this.yawGoal) * (1 - Math.exp(-9 * dt));
    if (Math.abs(angleDiff(this.yaw, this.yawGoal)) < 0.0005) this.yaw = this.yawGoal;
    this.wupp = Math.exp(damp(Math.log(this.wupp), Math.log(this.wuppGoal), 12, dt));
    if (!Number.isFinite(this.wupp)) this.wupp = this.wuppGoal;
    if (!Number.isFinite(this.target.x) || !Number.isFinite(this.target.z)) this.target.copy(this.goal);

    if (this.pitchGoal != null) this.pitch = damp(this.pitch, this.pitchGoal, 6, dt);
    const cam = this.camera;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let tx = this.target.x, tz = this.target.z;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const a = this.shake * this.shake * 0.35;
      tx += (Math.random() - 0.5) * a;
      tz += (Math.random() - 0.5) * a;
    }
    cam.position.set(
      tx + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      tz + Math.cos(this.yaw) * cp * this.dist,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, this.target.y, tz);
    cam.updateMatrixWorld(true);

    // Snap to texel grid in view space
    const e = cam.matrixWorld.elements;
    _R.set(e[0], e[1], e[2]);
    _U.set(e[4], e[5], e[6]);
    const w = this.wupp;
    const px = cam.position.dot(_R) / w;
    const py = cam.position.dot(_U) / w;
    const fx = px - Math.round(px);
    const fy = py - Math.round(py);
    cam.position.addScaledVector(_R, -fx * w).addScaledVector(_U, -fy * w);
    this.subpixel.set(fx, fy);

    const hw = (rtW * w) / 2, hh = (rtH * w) / 2;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  // [v20 map] rubber-band release + spring back, zoom cap, hard bounds
  updateEdge(dt) {
    const cap = this.wuppCap();
    if (this.wuppGoal > cap) this.wuppGoal = Math.max(this.minWupp, cap);
    if (this.wupp > cap * 1.02) this.wupp = Math.max(this.minWupp, cap * 1.02);
    const ep = this.edgePush;
    if (this.freeBounds) { this._rawOn = false; this._anchor = null; this.clampHard(); ep.k = 0; return; }
    const b = this.bounds, g = this.goal;
    this._panT += dt;
    if (this._rawOn && this._panT > 0.12) this._rawOn = false; // let go
    const cx = clamp(g.x, b.minX, b.maxX), cz = clamp(g.z, b.minZ, b.maxZ);
    const ox = g.x - cx, oz = g.z - cz;
    const R = this.rubberR();
    ep.x = ox; ep.z = oz; ep.k = Math.min(1, Math.hypot(ox, oz) / R);
    if (!this._rawOn) {
      // spring back to the edge: slightly under-damped, so it settles with a soft bounce
      if (!this._anchor && (ox || oz)) { this._anchor = new THREE.Vector2(cx, cz); this._sv.set(0, 0); }
      const a = this._anchor;
      if (a) {
        const K = 90, C = 2 * 0.42 * Math.sqrt(K);
        const st = Math.min(dt, 0.05), n = Math.max(1, Math.ceil(st / 0.008)), h = st / n;
        for (let i = 0; i < n; i++) {
          this._sv.x += (-K * (g.x - a.x) - C * this._sv.x) * h;
          this._sv.y += (-K * (g.z - a.y) - C * this._sv.y) * h;
          g.x += this._sv.x * h; g.z += this._sv.y * h;
        }
        if (Math.hypot(g.x - a.x, g.z - a.y) < 0.002 && this._sv.length() < 0.01) { g.x = a.x; g.z = a.y; this._anchor = null; }
      }
    }
    this.clampHard();
  }

  // Screen (CSS px relative to canvas) -> world ray
  screenRay(cssX, cssY, renderer, outRay) {
    const dpr = renderer.dpr || 1;
    const lowX = (cssX * dpr) / renderer.pixelScale + this.subpixel.x + 1;
    const lowY = ((renderer.H - cssY * dpr)) / renderer.pixelScale + this.subpixel.y + 1;
    const ndcX = (lowX / renderer.rtW) * 2 - 1;
    const ndcY = (lowY / renderer.rtH) * 2 - 1;
    const cam = this.camera;
    const ray = outRay || new THREE.Ray();
    ray.origin.set(ndcX, ndcY, -1).unproject(cam);
    _F.set(0, 0, -1).transformDirection(cam.matrixWorld);
    ray.direction.copy(_F);
    return ray;
  }

  // Intersect screen point with horizontal plane y = h
  screenToGround(cssX, cssY, renderer, h = 0, out = new THREE.Vector3()) {
    const ray = this.screenRay(cssX, cssY, renderer);
    const t = (h - ray.origin.y) / ray.direction.y;
    return out.copy(ray.origin).addScaledVector(ray.direction, t);
  }

  // World -> CSS px (relative to canvas)
  worldToScreen(p, renderer, out = { x: 0, y: 0, visible: true }) {
    _v.copy(p).project(this.camera);
    const lowX = ((_v.x + 1) / 2) * renderer.rtW - 1 - this.subpixel.x;
    const lowY = ((_v.y + 1) / 2) * renderer.rtH - 1 - this.subpixel.y;
    const dpr = renderer.dpr || 1;
    out.x = (lowX * renderer.pixelScale) / dpr;
    out.y = (renderer.H - lowY * renderer.pixelScale) / dpr;
    out.visible = _v.z > -1 && _v.z < 1;
    return out;
  }
}
