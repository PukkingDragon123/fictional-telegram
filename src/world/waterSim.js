// Height-field water: a damped 2D wave equation over the meadow, 4 cells per
// tile, reflecting off shores/dams. Splashes, swimming fish, cannonballing
// bears, falling food and bugs push the surface; the result is uploaded as a
// small texture (height + slope) that the water shader uses for normals,
// glints, foam and gentle vertex displacement, and that floating things
// (lily pads, pellets, bones, ducks) sample to bob on the waves.
import * as THREE from 'three';
import { KIND } from './grid.js';

const STEP = 1 / 24;

export class WaterSim {
  constructor(grid, bounds, res = 4) {
    this.grid = grid;
    this.b = bounds; // { x0, x1, z0, z1 } in tiles
    this.res = res;
    this.W = (bounds.x1 - bounds.x0) * res;
    this.H = (bounds.z1 - bounds.z0) * res;
    const n = this.W * this.H;
    this.h = new Float32Array(n);
    this.v = new Float32Array(n);
    this.mask = new Uint8Array(n);
    this.cells = new Int32Array(0);
    this.data = new Uint8Array(n * 4);
    this.tex = new THREE.DataTexture(this.data, this.W, this.H, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this.acc = 0;
    this.time = 0;
    this.K = 0.2; // wave stiffness (speed^2), < 0.5 for stability
    this.damp = 0.986;
    this.blocked = null; // optional (x, z) => bool for dams/lodges
    this.refreshMask();
  }

  refreshMask() {
    const { grid, res, W, H, b } = this;
    const cells = [];
    for (let cz = 0; cz < H; cz++)
      for (let cx = 0; cx < W; cx++) {
        const tx = b.x0 + Math.floor(cx / res), tz = b.z0 + Math.floor(cz / res);
        const i = cz * W + cx;
        const water = grid.inb(tx, tz) && grid.kind[tz * grid.w + tx] === KIND.WATER && !(this.blocked && this.blocked(tx, tz));
        this.mask[i] = water ? 1 : 0;
        if (water) cells.push(i);
        else { this.h[i] = 0; this.v[i] = 0; }
      }
    this.cells = Int32Array.from(cells);
  }

  // world -> cell coords
  cellOf(x, z) { return [(x - this.b.x0) * this.res, (z - this.b.z0) * this.res]; }

  // Push the surface down (amount > 0) or up (< 0) in a soft disc.
  disturb(x, z, radius = 0.4, amount = 0.3) {
    const [cx, cz] = this.cellOf(x, z);
    const r = Math.max(0.6, radius * this.res);
    const x0 = Math.max(1, Math.floor(cx - r)), x1 = Math.min(this.W - 2, Math.ceil(cx + r));
    const z0 = Math.max(1, Math.floor(cz - r)), z1 = Math.min(this.H - 2, Math.ceil(cz + r));
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++) {
        const k = j * this.W + i;
        if (!this.mask[k]) continue;
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / r;
        if (d >= 1) continue;
        const f = 0.5 + 0.5 * Math.cos(d * Math.PI);
        this.h[k] -= amount * f;
      }
  }

  // Continuous wake behind a moving thing (call every frame while moving).
  wake(x, z, speed, size = 0.3, dt = 1 / 60) {
    if (speed < 0.05) return;
    this.disturb(x, z, size, Math.min(0.08, speed * 0.02) * dt * 60);
  }

  heightAt(x, z) {
    const [fx, fz] = this.cellOf(x, z);
    const i = Math.floor(fx - 0.5), j = Math.floor(fz - 0.5);
    if (i < 0 || j < 0 || i >= this.W - 1 || j >= this.H - 1) return 0;
    const tx = fx - 0.5 - i, tz = fz - 0.5 - j;
    const W = this.W, h = this.h;
    const a = h[j * W + i], b2 = h[j * W + i + 1], c = h[(j + 1) * W + i], d = h[(j + 1) * W + i + 1];
    return (a * (1 - tx) + b2 * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  // surface slope at a point (for refraction wobble of things under water)
  slopeAt(x, z, out = { x: 0, z: 0 }) {
    const e = 0.5 / this.res;
    out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  }

  update(dt, windy = 1) {
    this.time += dt;
    this.acc = Math.min(this.acc + dt, STEP * 4);
    let stepped = false;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(windy);
      stepped = true;
    }
    if (stepped) this.upload();
  }

  step(windy) {
    const { h, v, mask, cells, W, K, damp } = this;
    const n = cells.length;
    // ambient breeze ripples
    if (n && windy > 0) {
      for (let k = 0; k < 2; k++) {
        const c = cells[(Math.random() * n) | 0];
        h[c] -= (Math.random() - 0.4) * 0.05 * windy;
      }
    }
    for (let q = 0; q < n; q++) {
      const i = cells[q];
      const hc = h[i];
      const l = mask[i - 1] ? h[i - 1] : hc;
      const r = mask[i + 1] ? h[i + 1] : hc;
      const u = mask[i - W] ? h[i - W] : hc;
      const d = mask[i + W] ? h[i + W] : hc;
      v[i] = (v[i] + (l + r + u + d - 4 * hc) * K) * damp;
    }
    for (let q = 0; q < n; q++) {
      const i = cells[q];
      h[i] = (h[i] + v[i]) * 0.9995;
    }
  }

  upload() {
    const { h, mask, W, data, cells } = this;
    // clear only water cells (land cells stay at 128/128/128)
    for (let q = 0; q < cells.length; q++) {
      const i = cells[q];
      const hc = h[i];
      const dx = (mask[i + 1] ? h[i + 1] : hc) - (mask[i - 1] ? h[i - 1] : hc);
      const dz = (mask[i + W] ? h[i + W] : hc) - (mask[i - W] ? h[i - W] : hc);
      const o = i * 4;
      data[o] = clamp8(128 + hc * 160);
      data[o + 1] = clamp8(128 + dx * 220);
      data[o + 2] = clamp8(128 + dz * 220);
      data[o + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }

  resetLand() {
    // after a topology change, neutralise non-water texels
    const { data, mask } = this;
    for (let i = 0; i < mask.length; i++) if (!mask[i]) { const o = i * 4; data[o] = data[o + 1] = data[o + 2] = 128; data[o + 3] = 255; }
    this.tex.needsUpdate = true;
  }
}

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
