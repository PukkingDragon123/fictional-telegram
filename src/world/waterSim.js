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
    // [v20 water] one byte per cell (height only; the shaders take slopes from
    // neighbouring texels) so the whole map fits in a small, cheap upload
    this.data = new Uint8Array(n).fill(128);
    this.tex = new THREE.DataTexture(this.data, this.W, this.H, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.unpackAlignment = 1;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this.acc = 0;
    this.time = 0;
    this.K = 0.14; // wave stiffness (speed^2), < 0.5 for stability [v20 water] slower waves (~2 tiles/s): fast swimmers out-run them and leave a V
    this.damp = 0.99; // [v20 water] rings travel a bit further (was 0.986)
    this.blocked = null; // optional (x, z) => bool for dams/lodges
    this.damp2 = new Float32Array(n); // [v20 water] per-cell damping: beaches soak up waves, open water rings on
    this.idle = false; // [v20 water] nothing moving: skip the solver and the upload
    this.breeze = 0; // [v20 water] random breeze kicks (the shader draws the wind ripples now)
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
    // [v20 water] cells touching the bank lose a little more energy each step
    const { mask, W: w } = this;
    for (const i of this.cells) {
      const edge = !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w];
      this.damp2[i] = edge ? this.damp * 0.975 : this.damp;
    }
    this.idle = false;
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
    this.idle = false; // [v20 water]
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
      if (this.idle) continue; // [v20 water]
      this.step(windy);
      stepped = true;
    }
    if (stepped) this.upload();
  }

  step(windy) {
    const { h, v, mask, cells, W, K, damp2 } = this;
    const n = cells.length;
    // ambient breeze ripples
    if (n && windy > 0 && this.breeze > 0) {
      for (let k = 0; k < this.breeze; k++) {
        const c = cells[(Math.random() * n) | 0];
        h[c] -= (Math.random() - 0.4) * 0.05 * windy;
      }
    }
    // [v20 water] reflective banks (mirror boundary), per-cell damping
    for (let q = 0; q < n; q++) {
      const i = cells[q];
      const hc = h[i];
      const l = mask[i - 1] ? h[i - 1] : hc;
      const r = mask[i + 1] ? h[i + 1] : hc;
      const u = mask[i - W] ? h[i - W] : hc;
      const d = mask[i + W] ? h[i + W] : hc;
      v[i] = (v[i] + (l + r + u + d - 4 * hc) * K) * damp2[i];
    }
    let mx = 0;
    for (let q = 0; q < n; q++) {
      const i = cells[q];
      const hv = (h[i] + v[i]) * 0.9995;
      h[i] = hv;
      const a = (hv < 0 ? -hv : hv) + Math.abs(v[i]);
      if (a > mx) mx = a;
    }
    // [v20 water] calm again: flatten and sleep until the next disturbance
    if (mx < 0.002 && this.breeze <= 0) {
      for (let q = 0; q < n; q++) { const i = cells[q]; h[i] = 0; v[i] = 0; }
      this.idle = true;
    }
  }

  // [v20 water] height only (128 = rest, 1 unit = 100 steps); land stays at 128
  upload() {
    const { h, data, cells } = this;
    for (let q = 0; q < cells.length; q++) {
      const i = cells[q];
      data[i] = clamp8(128.5 + h[i] * 100);
    }
    this.tex.needsUpdate = true;
  }

  resetLand() {
    // after a topology change, neutralise non-water texels
    const { data, mask } = this;
    for (let i = 0; i < mask.length; i++) if (!mask[i]) data[i] = 128;
    this.tex.needsUpdate = true;
  }
}

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
