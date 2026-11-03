// Effects: chunky voxel debris (dirt, wood chips) plus 2D pixel-sprite
// particles (droplets, cartoon blood, hearts, stars, coins, puffs, comic
// words, build clouds...) and flat decals (splats) that fade out later.
// Water hits disturb the height-field simulation so splashes make real waves.
//
// [v31 fx] A second pooled sprite system (`amb`) carries the ambient life from
// src/game/fx/ambientFx.js (pollen, seeds, sun motes, water glints, pond mist,
// embers, spindrift, waterfall spray), so it never evicts action effects. The
// action effects grew: cannonballs throw a water crown, splash rings, spray
// arcs and foam; hatching eggs burst into tumbling shell shards; debris throws
// wood chips / rock chips and kicks up dust; comic impacts (POW!, SMASH!...)
// flash a pixel starburst; spawnArc leaves a glittering trail. Unlit sprites
// take the time of day's light colour (lightTint). Pool caps follow the
// particles setting (the amb pool scales with the fx pool).
import * as THREE from 'three';
import { WATER_Y } from '../world/grid.js';
import { SpriteBatch, pixelTexture } from '../core/spriteBatch.js';
import { buildFxAtlas } from './fxAtlas.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

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
      if (f & 64) {
        const gy = groundAt ? Math.max(groundAt(this.px[i], this.pz[i]), WATER_Y) : 0;
        if (this.py[i] < gy + this.size[i] * 0.5 && this.vy[i] < 0) {
          if (gy <= WATER_Y + 0.001 && onWaterHit) { onWaterHit(this.px[i], this.pz[i]); this.kill(i); i--; continue; }
          this.py[i] = gy + this.size[i] * 0.5; this.vy[i] *= -0.45; this.vx[i] *= 0.7; this.vz[i] *= 0.7;
        }
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
      _p.set(this.px[i], this.py[i], this.pz[i]);
      _s.set(s, s, s); _q.setFromAxisAngle(UP, this.rot[i]);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      col[i * 3] = this.r[i]; col[i * 3 + 1] = this.g[i]; col[i * 3 + 2] = this.b[i];
    }
    mesh.count = this.alive;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
}

// --------------------------------------------------------------- 2D sprite particles
export const FX = {
  BOUNCE: 1, WATER: 2, FLOAT: 4, STICK: 8, FADE: 16, POP: 32, WOBBLE: 64, FLAT: 128, UPRIGHT: 256, SHRINK: 512, GROW: 1024, WATERSPLAT: 2048, ONCE: 4096,
};

class FxPool {
  constructor(scene, atlas, tex, max, { lit = false, renderOrder = 21 } = {}) {
    this.max = max;
    this.atlas = atlas;
    this.batch = new SpriteBatch(tex, { max, lit, castShadow: false, receiveShadow: lit, renderOrder, name: 'fx' });
    scene.add(this.batch.mesh);
    this.list = [];
    this.brightness = 1;
  }

  spawn(name, x, y, z, o = {}) {
    const fr = this.atlas.frames[name];
    if (!fr || !fr.length || !fr[0]) return null;
    if (this.list.length >= this.max) this.list.shift();
    const p = {
      fr, x, y, z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, grav: o.grav || 0, drag: o.drag || 0,
      life: o.life ?? 1, maxLife: o.life ?? 1, size: o.size || 0.2, fps: o.fps || 0, frame: o.frame || 0,
      rot: o.rot ?? 0, spin: o.spin || 0, flags: o.flags || 0, tint: o.tint || null, emissive: o.emissive || 0,
      seed: Math.random() * 10, onStick: o.onStick || null, bright: o.bright ?? false, flip: !!o.flip,
      alpha: o.alpha ?? 1, fin: o.fadeIn || 0, // [v31 fx] base alpha (ordered-dither see-through), fade-in seconds
    };
    this.list.push(p);
    return p;
  }

  update(dt, time, env) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const f = p.flags;
      const d = 1 - Math.min(1, p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.grav * dt;
      if (f & FX.WOBBLE) { p.vx += Math.sin(time * 3 + p.seed) * dt * 0.9; p.vz += Math.cos(time * 2.6 + p.seed * 1.3) * dt * 0.9; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (f & (FX.BOUNCE | FX.WATER | FX.FLOAT | FX.STICK)) {
        const gy = env.groundAt ? env.groundAt(p.x, p.z) : 0;
        const wet = gy < WATER_Y;
        const surf = wet ? WATER_Y + (env.waterAt ? env.waterAt(p.x, p.z) * 0.1 : 0) : gy;
        if (p.y <= surf + 0.01 && p.vy <= 0) {
          if (wet) {
            if (f & FX.FLOAT) { p.y = surf + 0.01; p.vy = 0; p.vx *= 0.92; p.vz *= 0.92; p.grav = 0; p.spin *= 0.85; }
            else if (f & (FX.WATER | FX.STICK)) {
              env.onWater?.(p.x, p.z, p.size, !!(f & FX.WATERSPLAT));
              continue;
            } else if (f & FX.BOUNCE) { env.onWater?.(p.x, p.z, p.size * 0.5, false); continue; }
          } else if (f & FX.STICK) {
            if (p.onStick) p.onStick(p.x, gy, p.z);
            continue;
          } else if (f & FX.BOUNCE) {
            p.y = surf + 0.01; p.vy *= -0.42; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.6;
            if (Math.abs(p.vy) < 0.25) { p.vy = 0; p.grav = 0; p.vx *= 0.5; p.vz *= 0.5; }
          } else if (f & FX.FLOAT) { p.y = surf + 0.01; p.vy = 0; p.grav = 0; p.vx *= 0.85; p.vz *= 0.85; }
        }
      }
      L[n++] = p;
    }
    L.length = n;
    const B = this.batch;
    B.clear();
    const amb = this.brightness;
    const lt = this.light; // [v31 fx] the hour's light colour (unlit sprites), null = white
    const opt = this._opt || (this._opt = { tint: [1, 1, 1] }); // [v31 fx] reused: no per-frame allocations
    const tint = opt.tint;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      const t = p.life / p.maxLife; // 1 -> 0
      const f = p.flags;
      let s = p.size;
      if (f & FX.POP) { const a = 1 - t; s *= a < 0.12 ? 0.4 + (a / 0.12) * 0.9 : a < 0.25 ? 1.3 - ((a - 0.12) / 0.13) * 0.3 : 1; }
      if (f & FX.SHRINK) s *= Math.min(1, t * 2.5);
      if (f & FX.GROW) s *= 0.6 + (1 - t) * 0.9;
      let fi = p.frame;
      if (p.fps > 0) fi = (f & FX.ONCE) ? Math.min(p.fr.length - 1, Math.floor((1 - t) * p.maxLife * p.fps)) : Math.floor(time * p.fps + p.seed * 3) % p.fr.length;
      const fr = p.fr[(fi | 0) % p.fr.length] || p.fr[0];
      if (!fr) continue;
      const k = p.bright || p.emissive ? 1 : amb;
      opt.w = s * fr.w / fr.h; opt.h = s;
      opt.mode = f & FX.FLAT ? 1 : f & FX.UPRIGHT ? 0 : 2;
      opt.ax = 0.5; opt.ay = opt.mode === 0 ? 0 : 0.5;
      opt.rot = p.rot;
      opt.alpha = (f & FX.FADE ? Math.min(1, t * 3) : 1) * p.alpha;
      if (p.fin > 0) opt.alpha *= Math.min(1, (p.maxLife - p.life) / p.fin);
      opt.emissive = p.emissive;
      opt.flip = p.flip;
      const lr = lt && !p.bright && !p.emissive ? lt[0] : 1, lg = lt && !p.bright && !p.emissive ? lt[1] : 1, lb = lt && !p.bright && !p.emissive ? lt[2] : 1;
      if (p.tint) { tint[0] = p.tint[0] * k * lr; tint[1] = p.tint[1] * k * lg; tint[2] = p.tint[2] * k * lb; }
      else { tint[0] = k * lr; tint[1] = k * lg; tint[2] = k * lb; }
      B.push(fr, p.x, p.y, p.z, opt);
    }
    B.commit();
  }
}

// [v31 fx] comic words that are hits: they get a starburst
const IMPACT = new Set(['pow', 'bonk', 'bam', 'smash', 'rawr', 'snap', 'chop', 'crunch']);
// what a debris palette is made of (by its first colour): warm browns = wood, greys = stone
function materialOf(hex) {
  if (typeof hex !== 'number') return null;
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 34) return 'stone';
  if (r > g && g > b && r - b > 50) return 'wood';
  return null;
}

// --------------------------------------------------------------- facade
export class Particles {
  constructor(scene) {
    this.lit = new VoxelPool(scene, 1600, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.lit.mesh.castShadow = false;
    this.glow = new VoxelPool(scene, 300, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.atlas = buildFxAtlas();
    this.tex = pixelTexture(this.atlas.canvas);
    this.fx = new FxPool(scene, this.atlas, this.tex, 1400, { renderOrder: 21 });
    this.decals = new FxPool(scene, this.atlas, this.tex, 260, { lit: true, renderOrder: 9 });
    this.amb = new FxPool(scene, this.atlas, this.tex, 480, { renderOrder: 20 }); // [v31 fx] ambient life (ambientFx.js)
    this.amb.batch.mesh.name = 'fxAmbient';
    this.time = 0;
    this.groundAt = null;
    this.sim = null; // WaterSim (set by the game)
    this.env = {
      groundAt: (x, z) => (this.groundAt ? this.groundAt(x, z) : 0),
      waterAt: (x, z) => (this.sim ? this.sim.heightAt(x, z) : 0),
      onWater: (x, z, size, bloody) => {
        this.sim?.disturb(x, z, Math.max(0.15, size * 0.8), 0.12 + size * 0.4);
        if (bloody) this.decal('splat_water', x, WATER_Y + 0.02, z, 0.35 + Math.random() * 0.25, 5 + Math.random() * 3, [1, 1, 1]);
        else if (Math.random() < 0.5) this.fx.spawn('drop_s', x, WATER_Y + 0.05, z, { vy: 1.2, grav: 7, life: 0.35, size: 0.06, vx: (Math.random() - 0.5), vz: (Math.random() - 0.5) });
      },
    };
  }

  setBrightness(b) { this.fx.brightness = b; this.amb.brightness = b; }
  // [v31 fx] the hour's light colour for unlit sprites ([r, g, b] near 1), null = white
  setLight(rgb) { this.fx.light = rgb; this.amb.light = rgb; }
  // [v31 fx] 0..1: the particles setting (the amb pool follows the fx pool's cap)
  quality() { const f = this.fx; return f.__baseMax ? Math.max(0.15, f.max / f.__baseMax) : 1; }

  update(dt) {
    this.time += dt;
    const hit = (x, z) => this.sim?.disturb(x, z, 0.18, 0.08);
    this.lit.update(dt, this.time, hit, this.groundAt);
    this.glow.update(dt, this.time, hit, this.groundAt);
    this.fx.update(dt, this.time, this.env);
    this.decals.update(dt, this.time, this.env);
    const q = this.quality();
    this.amb.max = Math.max(24, Math.round(480 * q));
    this.amb.update(dt, this.time, this.env);
  }

  // [v31 fx] ambient sprite (pollen, motes, mist...): its own pool, never evicts action effects
  ambSpawn(name, x, y, z, opts) { return this.amb.list.length < this.amb.max ? this.amb.spawn(name, x, y, z, opts) : null; }

  // ---- low level
  spawnFx(name, x, y, z, opts) { return this.fx.spawn(name, x, y, z, opts); }
  decal(name, x, y, z, size = 0.4, life = 20, tint = null) {
    return this.decals.spawn(name, x, y + 0.012, z, { size, life, flags: FX.FLAT | FX.FADE, rot: Math.random() * 6.28, tint });
  }

  // legacy ring ripple -> real waves in the simulation
  ripple(x, z, size = 1, life = 1.2, strength = 0.35) { this.sim?.disturb(x, z, size * 0.35, strength * 0.5); }

  // camera-facing icon particles (hearts, anger, question...)
  sprite(name, x, y, z, { vy = 0.8, life = 1.2, size = 0.35, vx = 0, vz = 0, wobble = 0 } = {}) {
    const map = { note: 'music', drop: 'drop' };
    this.fx.spawn(map[name] || name, x, y, z, { vx, vy, vz, drag: 0.8, life, size, flags: FX.POP | FX.FADE | (wobble ? FX.WOBBLE : 0), bright: true });
  }

  word(id, x, y, z, { size = 0.34, life = 1.1, vy = 1.1 } = {}) {
    this.fx.spawn('word_' + id, x, y, z, { vy, drag: 2.4, life, size, flags: FX.POP | FX.FADE, rot: (Math.random() - 0.5) * 0.35, bright: true });
    if (IMPACT.has(id)) this.impact(x, y - 0.5, z, size / 0.34); // [v31 fx]
  }

  // [v31 fx] a comic impact: a pixel starburst, flying stars and a few chips
  impact(x, y, z, k = 1) {
    this.fx.spawn('burst', x, y, z, { life: 0.32, size: 0.75 * k, fps: 10, flags: FX.ONCE, rot: Math.random() * 0.6 - 0.3, bright: true, emissive: 0.4 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      this.fx.spawn('star', x, y, z, { vx: Math.cos(a) * 2.2, vy: 1.6 + Math.random() * 1.2, vz: Math.sin(a) * 2.2, grav: 6, drag: 1.2, life: 0.7, size: 0.13 * k, spin: 9, flags: FX.POP | FX.FADE, bright: true });
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn('rockchip', x, y, z, { vx: Math.cos(a) * 1.8, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 1.8, grav: 12, life: 1.1, size: 0.07, fps: 9, spin: 8, flags: FX.BOUNCE | FX.FADE | FX.WATER });
    }
  }

  // ---- water
  splash(x, z, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random() * 1.3) * power;
      this.fx.spawn(Math.random() < 0.6 ? 'drop' : 'drop_s', x, WATER_Y + 0.05, z, {
        vx: Math.cos(a) * sp, vy: (2 + Math.random() * 2.6) * power, vz: Math.sin(a) * sp, grav: 9, drag: 0.4,
        life: 1.4, size: (0.07 + Math.random() * 0.06) * Math.min(1.6, power), flags: FX.WATER, bright: true,
      });
    }
    this.sim?.disturb(x, z, 0.3 + 0.25 * power, 0.35 * power);
    // [v31 fx] a splash ring on the water and a few foam flecks
    if (n >= 6) {
      this.fx.spawn('splashring', x, WATER_Y + 0.03, z, { life: 0.55, size: 0.5 + 0.35 * power, fps: 7.5, flags: FX.FLAT | FX.ONCE, rot: Math.random() * 6.28, bright: true });
      for (let i = 0; i < Math.min(4, n >> 2); i++) {
        const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.3 * power;
        this.fx.spawn('foam', x + Math.cos(a) * r, WATER_Y + 0.02, z + Math.sin(a) * r, { vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3, drag: 1.5, life: 1.2 + Math.random(), size: 0.05, flags: FX.FADE | FX.FLAT, rot: a, bright: true });
      }
    }
  }

  bigSplash(x, z) {
    this.splash(x, z, 44, 1.7);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn('drop', x + Math.cos(a) * 0.3, WATER_Y + 0.1, z + Math.sin(a) * 0.3, {
        vx: Math.cos(a) * 0.5, vy: 5 + Math.random() * 2.5, vz: Math.sin(a) * 0.5, grav: 11, drag: 0.3, life: 1.6, size: 0.15 + Math.random() * 0.08, flags: FX.WATER, bright: true,
      });
    }
    this.sim?.disturb(x, z, 1.1, 1.3);
    this.word('splash', x, 1.5, z, { size: 0.36 });
    // [v31 fx] the cannonball crown, two splash rings, droplet arcs flung wide, spray and foam
    this.fx.spawn('crown', x, WATER_Y - 0.05, z, { life: 0.62, size: 1.25, fps: 6.5, flags: FX.ONCE | FX.UPRIGHT, bright: true });
    this.fx.spawn('splashring', x, WATER_Y + 0.03, z, { life: 0.7, size: 1.5, fps: 5.7, flags: FX.FLAT | FX.ONCE, rot: Math.random() * 6.28, bright: true });
    this.fx.spawn('splashring', x, WATER_Y + 0.035, z, { life: 1.1, size: 2.6, fps: 3.6, flags: FX.FLAT | FX.ONCE, rot: Math.random() * 6.28, bright: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, sp = 2.4 + Math.random() * 1.6;
      this.fx.spawn(i & 1 ? 'drop' : 'spray', x + Math.cos(a) * 0.4, WATER_Y + 0.2, z + Math.sin(a) * 0.4, {
        vx: Math.cos(a) * sp, vy: 3.2 + Math.random() * 1.8, vz: Math.sin(a) * sp, grav: 10, drag: 0.25, life: 1.5, size: 0.08 + Math.random() * 0.05, flags: FX.WATER, bright: true,
      });
    }
    for (let i = 0; i < 4; i++) this.fx.spawn('mist', x + (Math.random() - 0.5) * 0.8, WATER_Y + 0.35 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.8, { vx: (Math.random() - 0.5) * 0.6, vy: 0.25, drag: 1, life: 1.1 + Math.random() * 0.4, size: 0.5 + Math.random() * 0.3, frame: i & 1, alpha: 0.7, flags: FX.FADE | FX.GROW, bright: true });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.9;
      this.fx.spawn('foam', x + Math.cos(a) * r, WATER_Y + 0.02, z + Math.sin(a) * r, { vx: Math.cos(a) * 0.5, vz: Math.sin(a) * 0.5, drag: 1.2, life: 2.2 + Math.random() * 1.5, size: 0.06, frame: i & 1, flags: FX.FADE | FX.FLAT, rot: a, bright: true });
    }
  }

  // [v31 fx] something tossed in an arc (eggs into the pond): a glittering dotted trail along it
  spawnArc(x0, y0, z0, x1, y1, z1) {
    const n = 9, top = Math.max(y0, y1) + 1.4;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const y = y0 + (y1 - y0) * t + 4 * (top - Math.max(y0, y1)) * t * (1 - t);
      this.fx.spawn(i % 3 ? 'mote' : 'sparkle', x, y, z, { life: 0.35 + t * 0.6, size: 0.1, fps: 8, frame: i % 4, vy: -0.2, flags: FX.FADE | FX.SHRINK, tint: [1, 0.96, 0.8], emissive: 0.7 });
    }
  }

  bubbles(x, y, z, n = 3) {
    for (let i = 0; i < n; i++)
      this.fx.spawn(Math.random() < 0.3 ? 'bubble_l' : 'bubble', x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2, {
        vy: 0.5 + Math.random() * 0.4, life: Math.max(0.2, (WATER_Y - y) / 0.6), size: 0.07 + Math.random() * 0.04, flags: FX.WOBBLE, bright: true,
      });
  }

  // ---- rewards
  coins(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 1.8;
      this.fx.spawn('coin', x, y, z, { vx: Math.cos(a) * sp, vy: 4 + Math.random() * 3, vz: Math.sin(a) * sp, grav: 14, drag: 0.2, life: 1.3 + Math.random() * 0.4, size: 0.2, fps: 10, flags: FX.BOUNCE | FX.FADE, bright: true, emissive: 0.2 });
    }
  }

  sparkle(x, y, z, n = 6, color = 0xfff2a0) {
    _c.set(color);
    const tint = [_c.r * 1.2, _c.g * 1.2, _c.b * 1.2];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.9;
      this.fx.spawn('sparkle', x, y, z, { vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 1.2, vz: Math.sin(a) * sp, grav: 1.5, drag: 1.5, life: 0.6 + Math.random() * 0.5, size: 0.14, fps: 8, flags: FX.FADE | FX.POP, tint, emissive: 0.8 });
    }
  }

  confetti(x, y, z, n = 40) {
    const cols = [[1, 0.36, 0.36], [1, 0.82, 0.23], [0.36, 0.8, 1], [0.48, 1, 0.54], [1, 0.54, 0.88], [1, 1, 1]];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      this.fx.spawn(Math.random() < 0.3 ? 'star' : 'petal', x, y, z, { vx: Math.cos(a) * sp, vy: 3 + Math.random() * 4, vz: Math.sin(a) * sp, grav: 5, drag: 1.2, life: 1.6 + Math.random(), size: 0.1 + Math.random() * 0.06, spin: (Math.random() - 0.5) * 12, flags: FX.WOBBLE | FX.FADE, tint: cols[i % cols.length], bright: true });
    }
  }

  hearts(x, y, z, n = 3) {
    for (let i = 0; i < n; i++)
      this.fx.spawn(i % 2 ? 'heart_s' : 'heart', x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, { vy: 0.7 + Math.random() * 0.5, drag: 0.8, life: 1.2 + Math.random() * 0.4, size: 0.22 + Math.random() * 0.1, flags: FX.POP | FX.FADE | FX.WOBBLE, bright: true });
  }

  stars(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.fx.spawn('star', x, y, z, { vx: Math.cos(a) * 1.4, vy: 1.2 + Math.random(), vz: Math.sin(a) * 1.4, grav: 3, drag: 1.5, life: 0.9, size: 0.18, spin: 6, flags: FX.POP | FX.FADE, bright: true, emissive: 0.3 });
    }
  }

  // ---- gore (cartoony!)
  blood(x, y, z, n = 10, dir = null, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random() * 1.6) * power;
      let vx = Math.cos(a) * sp, vz = Math.sin(a) * sp;
      if (dir) { vx = vx * 0.5 + dir.x * sp * 1.2; vz = vz * 0.5 + dir.z * sp * 1.2; }
      this.fx.spawn(Math.random() < 0.55 ? 'blood' : 'blood_s', x, y, z, {
        vx, vy: 1.5 + Math.random() * 2.5 * power, vz, grav: 10, drag: 0.4, life: 2, size: 0.07 + Math.random() * 0.07, flags: FX.STICK | FX.WATERSPLAT,
        onStick: (px, gy, pz) => { if (Math.random() < 0.6) this.decal(Math.random() < 0.7 ? 'splat_s' : 'splat', px, gy, pz, 0.14 + Math.random() * 0.2, 16 + Math.random() * 8); },
      });
    }
    // chunks of fish
    for (let i = 0; i < Math.ceil(n / 4); i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn('chunk', x, y, z, { vx: Math.cos(a) * 1.2, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 1.2, grav: 10, life: 2, size: 0.1, spin: 8, flags: FX.BOUNCE | FX.FADE | FX.WATER });
    }
  }

  // ---- building / ground
  debris(x, y, z, n = 14, colors = [0x8f5b2e, 0x6b4a2f, 0xc49060]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      this.lit.spawn(x, y, z, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, 1 + Math.random() * 0.8, 0.07 + Math.random() * 0.1,
        colors[Math.floor(Math.random() * colors.length)], 12, 0.3, 64, 8);
    }
    // [v31 fx] pixel chips by material (wood: chips + splinters, stone: rock chips), dust on big hits
    const kind = materialOf(colors[0]);
    if (kind) {
      const m = Math.min(8, Math.ceil(n * 0.6));
      for (let i = 0; i < m; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
        const nm = kind === 'wood' ? (i % 3 === 2 ? 'splinter' : 'chip') : 'rockchip';
        this.fx.spawn(nm, x, y, z, { vx: Math.cos(a) * sp, vy: 2.4 + Math.random() * 2.6, vz: Math.sin(a) * sp, grav: 11, drag: 0.3, life: 1.3 + Math.random() * 0.6, size: nm === 'splinter' ? 0.06 : 0.075, fps: nm === 'chip' || nm === 'rockchip' ? 10 + Math.random() * 6 : 0, spin: (Math.random() - 0.5) * 14, flags: FX.BOUNCE | FX.FADE | FX.WATER });
      }
    }
    if (n >= 6) this.kick(x, Math.max(0, y - 0.3), z, n >= 12 ? 3 : 2);
  }

  // [v31 fx] ground dust kicked up low and wide (feet, impacts)
  kick(x, y, z, n = 2, dir = null) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      let vx = Math.cos(a) * 0.5, vz = Math.sin(a) * 0.5;
      if (dir) { vx = -dir.x * 0.7 + vx * 0.4; vz = -dir.z * 0.7 + vz * 0.4; }
      this.fx.spawn('dustk', x + (Math.random() - 0.5) * 0.25, y + 0.06, z + (Math.random() - 0.5) * 0.25, { vx, vy: 0.18 + Math.random() * 0.2, vz, drag: 2.2, life: 0.55 + Math.random() * 0.3, size: 0.16 + Math.random() * 0.08, fps: 5, flags: FX.FADE | FX.ONCE, flip: Math.random() < 0.5 });
    }
  }

  dust(x, y, z, n = 3) {
    for (let i = 0; i < n; i++)
      this.fx.spawn('dust', x + (Math.random() - 0.5) * 0.3, y + 0.08, z + (Math.random() - 0.5) * 0.3, {
        vx: (Math.random() - 0.5) * 0.6, vy: 0.35 + Math.random() * 0.35, vz: (Math.random() - 0.5) * 0.6, drag: 2, life: 0.55 + Math.random() * 0.25, size: 0.16 + Math.random() * 0.1, fps: 5, flags: FX.FADE | FX.ONCE, flip: Math.random() < 0.5,
      });
    if (Math.random() < 0.35) this.fx.spawn('rockchip', x, y + 0.05, z, { vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 1.2, grav: 10, life: 0.7, size: 0.04, fps: 10, flags: FX.BOUNCE | FX.FADE }); // [v31 fx] a pebble flicked up
  }

  puff(x, y, z, n = 8, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.fx.spawn('dust', x, y, z, { vx: Math.cos(a) * 1.6, vy: 0.4 + Math.random() * 0.5, vz: Math.sin(a) * 1.6, drag: 3, life: 0.6, size: size * (0.7 + Math.random() * 0.5), fps: 5, flags: FX.FADE | FX.ONCE });
    }
  }

  smoke(x, y, z) {
    this.fx.spawn('smoke', x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1, { vx: 0.15 + Math.random() * 0.1, vy: 0.55 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.1, drag: 0.3, life: 2.4 + Math.random(), size: 0.18 + Math.random() * 0.08, flags: FX.FADE | FX.GROW | FX.WOBBLE });
  }

  // cartoon fight cloud while beavers build: returns nothing, spawn repeatedly
  buildCloud(x, y, z, scale = 1) {
    this.fx.spawn('cloud', x + (Math.random() - 0.5) * 0.15, y + 0.45 * scale, z + (Math.random() - 0.5) * 0.15, { life: 0.3, size: 0.8 * scale * (0.9 + Math.random() * 0.25), fps: 12, rot: (Math.random() - 0.5) * 0.3, flags: FX.POP, flip: Math.random() < 0.5 });
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn(Math.random() < 0.7 ? 'plank' : 'nail', x, y + 0.5 * scale, z, { vx: Math.cos(a) * 2, vy: 2.5 + Math.random() * 2, vz: Math.sin(a) * 2, grav: 10, life: 1, size: 0.1, spin: 14, flags: FX.BOUNCE | FX.FADE });
    }
    if (Math.random() < 0.18) this.fx.spawn('star', x + (Math.random() - 0.5) * 0.6, y + 0.9 * scale, z, { vy: 1, life: 0.5, size: 0.14, spin: 8, flags: FX.POP | FX.FADE, bright: true });
  }

  popIn(x, y, z, scale = 1) {
    this.puff(x, y + 0.1, z, 10, 0.3 * scale);
    this.stars(x, y + 0.6 * scale, z, 7);
    this.sparkle(x, y + 0.5 * scale, z, 8, 0xfff6c0);
  }

  leaf(x, y, z, color) {
    _c.set(color);
    this.fx.spawn('leaf', x, y, z, { vx: (Math.random() - 0.5) * 0.4, vy: -0.35 - Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.4, life: 14 + Math.random() * 8, size: 0.1, fps: 5 + Math.random() * 3, spin: (Math.random() - 0.5) * 3, flip: Math.random() < 0.5, flags: FX.FLOAT | FX.WOBBLE | FX.FADE, tint: [_c.r * 1.25, _c.g * 1.25, _c.b * 1.25] }); // [v31 fx] tumbling maple leaf
  }

  feathers(x, y, z, n = 4) {
    for (let i = 0; i < n; i++)
      this.fx.spawn('feather', x, y, z, { vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random(), vz: (Math.random() - 0.5) * 1.5, grav: 0.8, drag: 2, life: 2.5, size: 0.1, spin: 3, flags: FX.WOBBLE | FX.FADE | FX.FLOAT });
  }

  shells(x, y, z, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.spawn('shell', x, y, z, { vx: Math.cos(a) * 1.2, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * 1.2, grav: 8, life: 1.2, size: 0.07, spin: 10, flags: FX.BOUNCE | FX.FADE | FX.WATER });
    }
    // [v31 fx] the shell cracks open: jagged speckled shards tumble out, a little pop of light
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4, sp = 0.9 + Math.random() * 0.9;
      this.fx.spawn('shard', x, y + 0.05, z, { vx: Math.cos(a) * sp, vy: 1.8 + Math.random() * 1.4, vz: Math.sin(a) * sp, grav: 9, life: 1.6, size: 0.085, frame: i % 3, spin: (Math.random() - 0.5) * 16, flags: FX.BOUNCE | FX.FADE | FX.WATER });
    }
    this.fx.spawn('burst', x, y + 0.12, z, { life: 0.26, size: 0.4, fps: 12, flags: FX.ONCE, bright: true, emissive: 0.6 });
    this.sparkle(x, y + 0.15, z, 4, 0xfff6d0);
  }

  firefly(x, y, z) {
    this.fx.spawn('firefly', x, y, z, { vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.1, vz: (Math.random() - 0.5) * 0.3, life: 6 + Math.random() * 5, size: 0.12, fps: 1.6 + Math.random() * 1.4, flags: FX.WOBBLE | FX.FADE, emissive: 1.4, tint: [1, 1, 0.8] }); // [v31 fx] blinks, with a halo
  }

  zzz(x, y, z) {
    this.fx.spawn('zzz', x, y, z, { vx: 0.2, vy: 0.4, life: 1.8, size: 0.16, flags: FX.POP | FX.FADE | FX.WOBBLE, bright: true });
  }

  notes(x, y, z, n = 2) {
    for (let i = 0; i < n; i++) this.fx.spawn('music', x + (Math.random() - 0.5) * 0.3, y, z, { vx: (Math.random() - 0.5) * 0.4, vy: 0.6, life: 1.4, size: 0.2, flags: FX.POP | FX.FADE | FX.WOBBLE, bright: true });
  }
}
