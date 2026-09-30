// Voxel particles (lit + glowing), expanding ripple rings, and camera-facing
// pixel-art sprite particles (hearts, stars, notes...). All instanced.
import * as THREE from 'three';
import { WATER_Y } from '../world/grid.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

class VoxelPool {
  constructor(scene, max, material) {
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    const n = max;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.flags = new Uint8Array(n); // 1 = water-kill, 2 = float on water, 4 = flat(leaf), 8 = blink, 16 = grow, 32 = wobble, 64 = ground bounce
    this.rot = new Float32Array(n); this.spin = new Float32Array(n);
    this.alive = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0, drag = 0, flags = 0, spin = 0) {
    if (this.alive >= this.max) return -1;
    const i = this.alive++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    _c.set(color);
    this.r[i] = _c.r; this.g[i] = _c.g; this.b[i] = _c.b;
    this.flags[i] = flags; this.rot[i] = Math.random() * 6.28; this.spin[i] = spin;
    return i;
  }

  kill(i) {
    const j = --this.alive;
    if (i === j) return;
    for (const a of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.size, this.grav, this.drag, this.r, this.g, this.b, this.flags, this.rot, this.spin])
      a[i] = a[j];
  }

  update(dt, time, onWaterHit, groundAt) {
    for (let i = 0; i < this.alive; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const f = this.flags[i];
      const d = 1 - Math.min(1, this.drag[i] * dt);
      this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      if (f & 32) { this.vx[i] += Math.sin(time * 3 + i) * dt * 0.8; this.vz[i] += Math.cos(time * 2.6 + i * 1.3) * dt * 0.8; }
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      if (f & 1) {
        if (this.vy[i] < 0 && this.py[i] < WATER_Y && this.py[i] > WATER_Y - 0.4) {
          if (onWaterHit && Math.random() < 0.3) onWaterHit(this.px[i], this.pz[i]);
          this.kill(i); i--; continue;
        }
      }
      if (f & 2) {
        // floats: stop at water surface / ground
        const gy = groundAt ? groundAt(this.px[i], this.pz[i]) : 0;
        const floor = gy < WATER_Y ? WATER_Y + 0.01 : gy + 0.02;
        if (this.py[i] <= floor) { this.py[i] = floor; this.vy[i] = 0; this.vx[i] *= 0.9; this.vz[i] *= 0.9; this.grav[i] = 0; this.spin[i] *= 0.8; }
      }
      if (f & 64) {
        const gy = groundAt ? Math.max(groundAt(this.px[i], this.pz[i]), WATER_Y) : 0;
        if (this.py[i] < gy + this.size[i] * 0.5 && this.vy[i] < 0) { this.py[i] = gy + this.size[i] * 0.5; this.vy[i] *= -0.45; this.vx[i] *= 0.7; this.vz[i] *= 0.7; }
      }
    }
    const mesh = this.mesh;
    const col = mesh.instanceColor.array;
    for (let i = 0; i < this.alive; i++) {
      const t = this.life[i] / this.maxLife[i];
      const f = this.flags[i];
      let s = this.size[i];
      if (f & 16) s *= 1 + (1 - t) * 2.2;
      s *= Math.min(1, t * 4);
      if (f & 8) s *= 0.55 + 0.45 * Math.sin(time * 6 + i * 2.1) > 0.25 ? 1 : 0.35;
      _p.set(this.px[i], this.py[i], this.pz[i]);
      if (f & 4) { _s.set(s, s * 0.25, s * 0.8); _e.set(Math.sin(this.rot[i]) * 0.6, this.rot[i], 0); _q.setFromEuler(_e); }
      else { _s.set(s, s, s); _q.setFromAxisAngle(_p.set(0, 1, 0), this.rot[i]); _p.set(this.px[i], this.py[i], this.pz[i]); }
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      col[i * 3] = this.r[i]; col[i * 3 + 1] = this.g[i]; col[i * 3 + 2] = this.b[i];
    }
    mesh.count = this.alive;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

// --------------------------------------------------------------- sprites
const SPRITE_DEFS = {
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  star: ['...#...', '..###..', '#######', '.#####.', '.##.##.', '##...##'],
  note: ['..####', '..#..#', '..#..#', '###.##', '###.##'],
  zzz: ['####', '..#.', '.#..', '####'],
  bang: ['##', '##', '##', '##', '..', '##'],
  anger: ['#.#.#', '.#.#.', '#...#', '.#.#.', '#.#.#'],
  sparkle: ['..#..', '..#..', '##.##', '..#..', '..#..'],
  drop: ['..#..', '.###.', '#####', '#####', '.###.'],
  coin: ['.###.', '##.##', '#.#.#', '##.##', '.###.'],
  question: ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'],
  honey: ['.###.', '#####', '#####', '.###.'],
  fish: ['.##..#', '######', '.##..#'],
};
const SPRITE_COLORS = {
  heart: ['#ff5a8a', '#ffb0c8'], star: ['#ffd23a', '#fff2a0'], note: ['#ffffff', '#c8f0ff'], zzz: ['#cfe0ff', '#ffffff'],
  bang: ['#ff4a3a', '#ffe060'], anger: ['#ff3a2a', '#ff8a6a'], sparkle: ['#fff6c0', '#ffffff'], drop: ['#8ad0ff', '#ffffff'],
  coin: ['#ffc83a', '#fff0a0'], question: ['#ffffff', '#ffe080'], honey: ['#f0a020', '#ffd060'], fish: ['#8ac8ff', '#ffffff'],
};

function buildAtlas() {
  const names = Object.keys(SPRITE_DEFS);
  const cell = 10;
  const cols = 4;
  const rows = Math.ceil(names.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * cell; cv.height = rows * cell;
  const ctx = cv.getContext('2d');
  const uv = {};
  names.forEach((n, i) => {
    const rowsDef = SPRITE_DEFS[n];
    const h = rowsDef.length, w = rowsDef[0].length;
    const ox = (i % cols) * cell + Math.floor((cell - w) / 2), oy = Math.floor(i / cols) * cell + Math.floor((cell - h) / 2);
    const [c1, c2] = SPRITE_COLORS[n];
    // outline
    ctx.fillStyle = '#1a1420';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rowsDef[y][x] === '#') ctx.fillRect(ox + x - 1, oy + y - 1, 3, 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rowsDef[y][x] === '#') {
      ctx.fillStyle = y === 0 || (y === 1 && x < w / 2) ? c2 : c1;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
    uv[n] = [(i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows, 1 / cols, 1 / rows];
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, uv };
}

class SpritePool {
  constructor(scene, max) {
    this.max = max;
    const { tex, uv } = buildAtlas();
    this.uv = uv;
    const geo = new THREE.PlaneGeometry(1, 1);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    inst.attributes.position = geo.attributes.position;
    inst.attributes.uv = geo.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aUV = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.aPos, this.aUV, this.aSize]) a.setUsage(THREE.DynamicDrawUsage);
    inst.setAttribute('iPos', this.aPos);
    inst.setAttribute('iUV', this.aUV);
    inst.setAttribute('iSize', this.aSize);
    inst.instanceCount = 0;
    this.geo = inst;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iUV; attribute float iSize;
        varying vec2 vUv;
        void main() {
          vUv = iUV.xy + uv * iUV.zw;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = iPos + (right * position.x + up * position.y) * iSize;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec2 vUv;
        void main() { vec4 c = texture2D(map, vUv); if (c.a < 0.5) discard; gl_FragColor = c; }`,
    });
    this.mesh = new THREE.Mesh(inst, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.list = [];
  }

  spawn(name, x, y, z, { vy = 0.8, life = 1.2, size = 0.35, vx = 0, vz = 0, wobble = 0 } = {}) {
    if (this.list.length >= this.max) return;
    this.list.push({ name, x, y, z, vx, vy, vz, life, maxLife: life, size, wobble, seed: Math.random() * 10 });
  }

  update(dt, time) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += (p.vx + Math.sin(time * 4 + p.seed) * p.wobble) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= 1 - dt * 0.8;
      L[n++] = p;
    }
    L.length = n;
    const pos = this.aPos.array, uvs = this.aUV.array, sz = this.aSize.array;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      const t = p.life / p.maxLife;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const u = this.uv[p.name] || this.uv.star;
      uvs[i * 4] = u[0]; uvs[i * 4 + 1] = u[1]; uvs[i * 4 + 2] = u[2]; uvs[i * 4 + 3] = u[3];
      const pop = t > 0.85 ? 1 + (t - 0.85) * 3 : 1;
      sz[i] = p.size * Math.min(1, t * 5) * pop;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aUV.needsUpdate = this.aSize.needsUpdate = true;
  }
}

// --------------------------------------------------------------- ripples
class RipplePool {
  constructor(scene, max) {
    this.max = max;
    const geo = new THREE.RingGeometry(0.86, 1, 20, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.list = [];
  }
  spawn(x, z, size = 1, life = 1.2, strength = 0.35) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, z, size, life, maxLife: life, strength });
  }
  update(dt) {
    const L = this.list;
    let n = 0;
    for (const r of L) { r.life -= dt; if (r.life > 0) L[n++] = r; }
    L.length = n;
    const col = this.mesh.instanceColor.array;
    for (let i = 0; i < n; i++) {
      const r = L[i];
      const t = 1 - r.life / r.maxLife;
      const s = r.size * (0.2 + t * 0.9);
      _m.makeScale(s, 1, s);
      _m.setPosition(r.x, WATER_Y + 0.012, r.z);
      this.mesh.setMatrixAt(i, _m);
      const a = (1 - t) * r.strength;
      col[i * 3] = a; col[i * 3 + 1] = a; col[i * 3 + 2] = a;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// --------------------------------------------------------------- facade
export class Particles {
  constructor(scene) {
    this.lit = new VoxelPool(scene, 2600, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.lit.mesh.castShadow = false;
    this.glow = new VoxelPool(scene, 700, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.sprites = new SpritePool(scene, 220);
    this.ripples = new RipplePool(scene, 220);
    this.time = 0;
    this.groundAt = null;
  }

  update(dt) {
    this.time += dt;
    const hit = (x, z) => this.ripples.spawn(x, z, 0.25, 0.6, 0.25);
    this.lit.update(dt, this.time, hit, this.groundAt);
    this.glow.update(dt, this.time, hit, this.groundAt);
    this.sprites.update(dt, this.time);
    this.ripples.update(dt);
  }

  ripple(x, z, size = 1, life = 1.2, strength = 0.35) { this.ripples.spawn(x, z, size, life, strength); }
  sprite(name, x, y, z, opts) { this.sprites.spawn(name, x, y, z, opts); }

  splash(x, z, n = 14, power = 1) {
    const L = this.lit;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random() * 1.2) * power;
      L.spawn(x, WATER_Y + 0.05, z, Math.cos(a) * sp, (2 + Math.random() * 2.5) * power, Math.sin(a) * sp,
        0.7 + Math.random() * 0.5, 0.05 + Math.random() * 0.06 * power, Math.random() < 0.5 ? 0xffffff : 0xbfe8f0, 9, 0.5, 1);
    }
    this.ripple(x, z, 0.8 * power, 1.1, 0.4);
    this.ripple(x, z, 1.4 * power, 1.6, 0.25);
  }

  bigSplash(x, z) {
    this.splash(x, z, 46, 1.7);
    const L = this.lit;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      L.spawn(x + Math.cos(a) * 0.3, WATER_Y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * 0.4, 5 + Math.random() * 2.5, Math.sin(a) * 0.4,
        1.0, 0.12 + Math.random() * 0.08, 0xeaf8ff, 11, 0.3, 1);
    }
    this.ripple(x, z, 2.6, 2.2, 0.35);
  }

  bubbles(x, y, z, n = 3) {
    for (let i = 0; i < n; i++)
      this.lit.spawn(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, 0, 0.5 + Math.random() * 0.4, 0,
        Math.max(0.2, (WATER_Y - y) / 0.6), 0.04 + Math.random() * 0.03, 0xe8fbff, -0.2, 0.5, 32);
  }

  coins(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 1.8;
      this.lit.spawn(x, y, z, Math.cos(a) * sp, 4 + Math.random() * 3, Math.sin(a) * sp, 1.1 + Math.random() * 0.4, 0.13, Math.random() < 0.3 ? 0xfff0a0 : 0xffc83a, 14, 0.2, 64, 12);
    }
  }

  debris(x, y, z, n = 14, colors = [0x8f5b2e, 0x6b4a2f, 0xc49060]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      this.lit.spawn(x, y, z, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, 1 + Math.random() * 0.8, 0.07 + Math.random() * 0.1,
        colors[Math.floor(Math.random() * colors.length)], 12, 0.3, 64, 8);
    }
  }

  dust(x, y, z, n = 3, color = 0xcdbf9a) {
    for (let i = 0; i < n; i++)
      this.lit.spawn(x + (Math.random() - 0.5) * 0.3, y + 0.05, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6,
        0.5 + Math.random() * 0.3, 0.08 + Math.random() * 0.06, color, 0, 2, 16);
  }

  smoke(x, y, z, color = 0xb8b4b0) {
    this.lit.spawn(x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1, 0.15 + Math.random() * 0.1, 0.6 + Math.random() * 0.3, (Math.random() - 0.5) * 0.1,
      2.2 + Math.random(), 0.1 + Math.random() * 0.05, color, 0, 0.3, 16);
  }

  leaf(x, y, z, color) {
    this.lit.spawn(x, y, z, (Math.random() - 0.5) * 0.4, -0.35 - Math.random() * 0.2, (Math.random() - 0.5) * 0.4, 14 + Math.random() * 8, 0.11, color, 0, 0.1, 2 | 4 | 32, 1.2);
  }

  sparkle(x, y, z, n = 6, color = 0xfff2a0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.9;
      this.glow.spawn(x, y, z, Math.cos(a) * sp, 0.8 + Math.random() * 1.2, Math.sin(a) * sp, 0.6 + Math.random() * 0.5, 0.06, color, 1.5, 1.5, 0);
    }
  }

  firefly(x, y, z) {
    this.glow.spawn(x, y, z, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.3, 6 + Math.random() * 5, 0.06, 0xd8ff6a, 0, 0.2, 8 | 32);
  }

  confetti(x, y, z, n = 40) {
    const cols = [0xff5a5a, 0xffd23a, 0x5ad0ff, 0x7aff8a, 0xff8ae0, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      this.glow.spawn(x, y, z, Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp, 1.6 + Math.random(), 0.08, cols[i % cols.length], 5, 1.2, 4 | 32, 5);
    }
  }
}
