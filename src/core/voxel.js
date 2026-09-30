// Voxel model builder: set coloured voxels, then mesh them into a single
// BufferGeometry with hidden-face culling and baked ambient occlusion.
import * as THREE from 'three';

export const VOXEL = 0.1; // world units per voxel (1 tile = 10 voxels)

const _c = new THREE.Color();
const colorCache = new Map();
export function linearRGB(hex) {
  let v = colorCache.get(hex);
  if (!v) {
    _c.setHex(hex);
    v = [_c.r, _c.g, _c.b];
    colorCache.set(hex, v);
  }
  return v;
}

const key = (x, y, z) => (x + 512) | ((y + 512) << 10) | ((z + 512) << 20);

// Each face: normal + 4 corners in CCW order when seen from outside.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO_CURVE = [0.56, 0.72, 0.86, 1.0];

// Shade multipliers baked per face direction on top of real lighting; keeps
// voxel silhouettes readable even in flat light.
const FACE_TINT = [0.96, 0.96, 1.0, 0.78, 0.98, 0.98];

export class VoxelModel {
  constructor() {
    this.vox = new Map();
    this.minX = Infinity; this.minY = Infinity; this.minZ = Infinity;
    this.maxX = -Infinity; this.maxY = -Infinity; this.maxZ = -Infinity;
  }

  set(x, y, z, color) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (color == null || color === false) {
      this.vox.delete(key(x, y, z));
      return this;
    }
    this.vox.set(key(x, y, z), color);
    if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    return this;
  }

  get(x, y, z) {
    return this.vox.get(key(x, y, z));
  }

  has(x, y, z) {
    return this.vox.has(key(x, y, z));
  }

  // Inclusive box. `color` may be a function (x,y,z) => hex|null.
  box(x0, y0, z0, x1, y1, z1, color) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          this.set(x, y, z, typeof color === 'function' ? color(x, y, z) : color);
    return this;
  }

  // Filled ellipsoid centred at (cx,cy,cz) with radii in voxels.
  ellipsoid(cx, cy, cz, rx, ry, rz, color) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const dx = (x - cx) / (rx + 0.01), dy = (y - cy) / (ry + 0.01), dz = (z - cz) / (rz + 0.01);
          const d = dx * dx + dy * dy + dz * dz;
          if (d <= 1) this.set(x, y, z, typeof color === 'function' ? color(x, y, z, d) : color);
        }
    return this;
  }

  // Cylinder along Y.
  cylinder(cx, y0, cz, r, h, color) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz <= r * r + 0.3)
          for (let y = y0; y < y0 + h; y++)
            this.set(x, y, z, typeof color === 'function' ? color(x, y, z) : color);
      }
    return this;
  }

  line(x0, y0, z0, x1, y1, z1, color, thick = 0) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
      if (thick > 0) this.box(Math.round(x - thick), Math.round(y - thick), Math.round(z - thick), Math.round(x + thick), Math.round(y + thick), Math.round(z + thick), color);
      else this.set(x, y, z, color);
    }
    return this;
  }

  // Recolour existing voxels with fn(x,y,z,color) => color
  paint(fn) {
    for (const [k, c] of this.vox) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      const nc = fn(x, y, z, c);
      if (nc == null) this.vox.delete(k);
      else this.vox.set(k, nc);
    }
    return this;
  }

  // Copy all voxels of another model with an offset.
  merge(other, ox = 0, oy = 0, oz = 0) {
    for (const [k, c] of other.vox) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      this.set(x + ox, y + oy, z + oz, c);
    }
    return this;
  }

  /**
   * Mesh the voxels with hidden-face culling, baked ambient occlusion and
   * greedy merging of coplanar faces that share colour + uniform AO.
   * @param {object} o
   * @param {number[]} [o.pivot] pivot in voxel units (subtracted before scaling)
   * @param {number} [o.scale] world units per voxel
   * @param {boolean} [o.ao] bake ambient occlusion (default true)
   * @param {boolean} [o.greedy] merge faces (default true)
   */
  build(o = {}) {
    const pivot = o.pivot || [0, 0, 0];
    const s = o.scale ?? VOXEL;
    const ao = o.ao !== false;
    const greedy = o.greedy !== false;
    const pos = [], nor = [], col = [], idx = [];
    let vi = 0;
    const vox = this.vox;
    const groups = new Map();
    const bright = [1, 1, 1, 1];
    const d = [0, 0, 0], e = [0, 0, 0];
    const emit = (f, ox, oy, oz, w, h, rgb, b) => {
      const F = FACES[f];
      const axis = f >> 1;
      const ua = axis === 0 ? 1 : 0, va = axis === 2 ? 1 : 2;
      const o3 = [ox, oy, oz];
      const tint = FACE_TINT[f];
      for (let ci = 0; ci < 4; ci++) {
        const c = F.c[ci];
        const p = [o3[0] + c[0], o3[1] + c[1], o3[2] + c[2]];
        p[ua] = o3[ua] + c[ua] * w;
        p[va] = o3[va] + c[va] * h;
        pos.push((p[0] - pivot[0]) * s, (p[1] - pivot[1]) * s, (p[2] - pivot[2]) * s);
        nor.push(F.n[0], F.n[1], F.n[2]);
        const k = b[ci] * tint;
        col.push(rgb[0] * k, rgb[1] * k, rgb[2] * k);
      }
      if (b[0] + b[2] > b[1] + b[3]) idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
      else idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    };
    for (const [k, hex] of vox) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
        if (vox.has(key(nx, ny, nz))) continue;
        let aoIdx = 3;
        if (ao) {
          let minOcc = 3, maxOcc = 0;
          for (let ci = 0; ci < 4; ci++) {
            const c = F.c[ci];
            d[0] = d[1] = d[2] = 0; e[0] = e[1] = e[2] = 0;
            let first = true;
            for (let a = 0; a < 3; a++) {
              if (F.n[a] !== 0) continue;
              const dir = c[a] === 1 ? 1 : -1;
              if (first) { d[a] = dir; first = false; } else e[a] = dir;
            }
            const s1 = vox.has(key(nx + d[0], ny + d[1], nz + d[2])) ? 1 : 0;
            const s2 = vox.has(key(nx + e[0], ny + e[1], nz + e[2])) ? 1 : 0;
            const cc = vox.has(key(nx + d[0] + e[0], ny + d[1] + e[1], nz + d[2] + e[2])) ? 1 : 0;
            const occ = s1 && s2 ? 3 : s1 + s2 + cc;
            bright[ci] = AO_CURVE[3 - occ];
            if (occ < minOcc) minOcc = occ;
            if (occ > maxOcc) maxOcc = occ;
          }
          if (minOcc === maxOcc) aoIdx = 3 - minOcc;
          else aoIdx = -1;
        } else bright[0] = bright[1] = bright[2] = bright[3] = 1;
        if (greedy && aoIdx >= 0) {
          const axis = f >> 1;
          const layer = axis === 0 ? x : axis === 1 ? y : z;
          const u = axis === 0 ? y : x, v = axis === 2 ? y : z;
          const gk = f * 4096 + layer + 512;
          let g = groups.get(gk);
          if (!g) groups.set(gk, (g = []));
          g.push(u, v, hex * 4 + aoIdx);
        } else {
          emit(f, x, y, z, 1, 1, linearRGB(hex), bright);
        }
      }
    }
    // greedy merge per (face direction, layer)
    const ub = [1, 1, 1, 1];
    for (const [gk, arr] of groups) {
      const f = Math.floor(gk / 4096);
      const layer = (gk % 4096) - 512;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < arr.length; i += 3) {
        if (arr[i] < u0) u0 = arr[i]; if (arr[i] > u1) u1 = arr[i];
        if (arr[i + 1] < v0) v0 = arr[i + 1]; if (arr[i + 1] > v1) v1 = arr[i + 1];
      }
      const W = u1 - u0 + 1, H = v1 - v0 + 1;
      const grid = new Float64Array(W * H).fill(-1);
      for (let i = 0; i < arr.length; i += 3) grid[(arr[i + 1] - v0) * W + (arr[i] - u0)] = arr[i + 2];
      const axis = f >> 1;
      for (let vv = 0; vv < H; vv++)
        for (let uu = 0; uu < W; uu++) {
          const kk = grid[vv * W + uu];
          if (kk < 0) continue;
          let w = 1;
          while (uu + w < W && grid[vv * W + uu + w] === kk) w++;
          let h = 1;
          outer: while (vv + h < H) {
            for (let i = 0; i < w; i++) if (grid[(vv + h) * W + uu + i] !== kk) break outer;
            h++;
          }
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid[(vv + j) * W + uu + i] = -1;
          const hex = Math.floor(kk / 4), aoI = kk % 4;
          ub[0] = ub[1] = ub[2] = ub[3] = AO_CURVE[aoI];
          const uc = u0 + uu, vc = v0 + vv;
          const ox = axis === 0 ? layer : uc;
          const oy = axis === 1 ? layer : axis === 0 ? uc : vc;
          const oz = axis === 2 ? layer : vc;
          emit(f, ox, oy, oz, w, h, linearRGB(hex), ub);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(vi > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Adds subtle per-voxel "grain" (object space) so greedy-merged faces still
// read as individual voxels. Works for instanced meshes too.
export function addGrain(mat, amount = 0.13) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;\nvarying vec3 vGrainNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainPos = position;\nvGrainNor = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGrainPos;
varying vec3 vGrainNor;
float grainHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vGrainNor);
  vec2 cell = an.y > 0.5 ? vGrainPos.xz : (an.x > 0.5 ? vGrainPos.zy : vGrainPos.xy);
  float gn = grainHash(floor(cell * 10.0 + 0.001));
  diffuseColor.rgb *= 1.0 + (gn - 0.5) * ${amount.toFixed(3)};
}`);
  };
  mat.customProgramCacheKey = () => 'grain' + amount;
  return mat;
}

// Shared vertex-coloured material used by most voxel meshes.
let sharedMat = null;
export function voxelMaterial() {
  if (!sharedMat) sharedMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }));
  return sharedMat;
}

// Shade helpers for quick palette variation
export function shade(hex, f) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

export function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
