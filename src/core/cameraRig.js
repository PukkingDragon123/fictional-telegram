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
    this.goal.x -= rx * gx - fx * gy;
    this.goal.z -= rz * gx - fz * gy;
    this.clampGoal();
    this.follow = null;
  }

  panWorld(dx, dz) {
    this.goal.x += dx; this.goal.z += dz;
    this.clampGoal();
    this.follow = null;
  }

  // Move in camera-relative directions (keyboard): forward/right in world units
  panRelative(fwd, right) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.goal.x += cy * right - sy * fwd;
    this.goal.z += -sy * right - cy * fwd;
    this.clampGoal();
    this.follow = null;
  }

  clampGoal() {
    if (this.freeBounds) return;
    const b = this.bounds;
    this.goal.x = clamp(this.goal.x, b.minX, b.maxX);
    this.goal.z = clamp(this.goal.z, b.minZ, b.maxZ);
  }

  zoom(factor) {
    this.wuppGoal = clamp(this.wuppGoal * factor, this.minWupp, this.maxWupp);
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
    const rtW = renderer.rtW, rtH = renderer.rtH;
    this._rt.w = rtW; this._rt.h = rtH;
    if (this.follow) {
      this.goal.x = this.follow.x;
      this.goal.z = this.follow.z;
      this.clampGoal();
    }
    const k = this.freeBounds ? 6 : 10;
    this.target.x = damp(this.target.x, this.goal.x, k, dt);
    this.target.y = damp(this.target.y, this.goal.y, k, dt);
    this.target.z = damp(this.target.z, this.goal.z, k, dt);
    this.yaw += angleDiff(this.yaw, this.yawGoal) * (1 - Math.exp(-9 * dt));
    if (Math.abs(angleDiff(this.yaw, this.yawGoal)) < 0.0005) this.yaw = this.yawGoal;
    this.wupp = Math.exp(damp(Math.log(this.wupp), Math.log(this.wuppGoal), 12, dt));

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
