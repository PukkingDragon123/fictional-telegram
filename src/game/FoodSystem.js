// Fish food (thrown by the fox or dispensed by feeders: pixel sprites per food
// kind that arc, land, float, drift and sink, see src/game/fx/foodFx.js) and flying
// bugs (dragonflies) spawned by cattails, lily pads and bug hotels.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';
import { WATER_Y } from '../world/grid.js';
import { FOOD_ITEMS } from '../data/foods.js';
import { FX } from './Particles.js';
import { SpriteBatch, pixelTexture } from '../core/spriteBatch.js';
import { foodAtlas, foodFrames, foodStyle, FOOD_PHYS, FOOD_TPU } from './fx/foodFx.js'; // [v30 feeding]

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class FoodSystem {
  constructor(game) {
    this.game = game;
    this.pellets = [];
    this.flying = []; // handfuls in the air
    this.bugs = [];
    // [v30 feeding] food pieces are little pixel sprites (src/game/fx/foodFx.js)
    this.foodTex = pixelTexture(foodAtlas().canvas);
    this.foodBatch = new SpriteBatch(this.foodTex, { max: 700, lit: true, castShadow: false, receiveShadow: false, renderOrder: 14, name: 'food' });
    game.scene.add(this.foodBatch.mesh);
    // dragonfly model
    const dv = new VoxelModel();
    const body = [0x2a6ad0, 0x3a8ae8, 0x48b0f0, 0x2a5ab0, 0x1a3a80];
    for (let x = -2; x <= 2; x++) dv.set(x, 0, 0, body[x + 2]);
    dv.set(3, 0, 0, 0x1a2a50);
    dv.set(0, 0, 1, 0xd8f0ff); dv.set(0, 0, 2, 0xd8f0ff); dv.set(0, 0, -1, 0xd8f0ff); dv.set(0, 0, -2, 0xd8f0ff);
    dv.set(1, 0, 1, 0xc0e0ff); dv.set(1, 0, -1, 0xc0e0ff); dv.set(1, 0, 2, 0xc0e0ff); dv.set(1, 0, -2, 0xc0e0ff);
    this.bugMesh = new THREE.InstancedMesh(dv.build({ pivot: [0.5, 0.5, 0.5], scale: 0.07, ao: false }), voxelMaterial(), 200);
    this.bugMesh.count = 0;
    this.bugMesh.frustumCulled = false;
    this.bugMesh.castShadow = true;
    game.scene.add(this.bugMesh);
    this.time = 0;
  }

  // Throw a handful from (fx,fy,fz) (Reynard's paw, a feeder) to target (tx,tz).
  // [v30 feeding] every piece flies its own arc: they leave the paw one after
  // another, spin, land scattered with a plop ring, float, drift and sink.
  throwHandful(fx, fy, fz, tx, tz, n = 6, spread = 0.55, item = 'pellets') {
    const dist = Math.hypot(tx - fx, tz - fz);
    const dur = 0.42 + Math.min(0.5, dist * 0.04);
    const items = [];
    const style = foodStyle(item);
    const heavy = style === 'berry' || style === 'chunk' || style === 'drop' ? 0.85 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      items.push({
        tx: tx + Math.cos(a) * r, tz: tz + Math.sin(a) * r, delay: i * 0.035 + Math.random() * 0.03,
        dur: dur * (0.9 + Math.random() * 0.2), h: (1.1 + Math.random() * 0.6) * heavy, rot: Math.random() * 6.28,
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8), v: (Math.random() * 8) | 0, done: false,
        ox: (Math.random() - 0.5) * 0.12, oz: (Math.random() - 0.5) * 0.12,
      });
    }
    this.flying.push({ fx, fy, fz, t: 0, items, item, landed: 0, left: n, plopped: false });
  }

  dropPellet(x, z, y = WATER_Y, item = 'pellets', o = null) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.isWater(tx, tz)) return null;
    const style = foodStyle(item);
    const ph = FOOD_PHYS[style] || FOOD_PHYS.kibble;
    const floor = g.surfaceY(tx, tz) + 0.05;
    const p = {
      x, z, y, floor, life: 26, eaten: false, region: g.regionAt(x, z), seed: Math.random() * 10, item,
      style, st: y <= floor + 0.01 ? 'rest' : 'float', ft: ph.float[0] + Math.random() * (ph.float[1] - ph.float[0]),
      vx: o?.vx || 0, vz: o?.vz || 0, rot: o?.rot ?? Math.random() * 6.28, spin: o?.spin || 0, v: o?.v ?? ((Math.random() * 8) | 0), ringT: 0.8 + Math.random() * 2,
    };
    if (p.st === 'rest') p.y = floor;
    this.pellets.push(p);
    return p;
  }

  nearestPellet(x, z, r, region) {
    let best = null, bd = r * r;
    for (const p of this.pellets) {
      if (p.eaten || p.region !== region) continue;
      const dx = p.x - x, dz = p.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  eatPellet(p) { p.eaten = true; }

  // --- bugs (the BugSystem owns them now; these stay for older callers)
  spawnBug(source) {
    if (this.game.bugs) return this.game.bugs.spawnFrom(source);
    return this.spawnBugLegacy(source);
  }

  spawnBugLegacy(source) {
    const a = Math.random() * Math.PI * 2;
    const b = {
      source, x: source.x + 0.5 + Math.cos(a), z: source.z + 0.5 + Math.sin(a), y: 0.6 + Math.random() * 0.6,
      ang: a, r: 0.8 + Math.random() * 1.6, spd: (0.9 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
      dipT: 3 + Math.random() * 6, dipping: 0, dead: false, targeted: false, heading: 0, seed: Math.random() * 10,
    };
    this.bugs.push(b);
    return b;
  }

  nearestDippingBug(x, z, r, region) {
    if (this.game.bugs) return this.game.bugs.nearestDipping(x, z, r, region);
    let best = null, bd = r * r;
    for (const b of this.bugs) {
      if (b.dead || b.targeted || b.dipping <= 0 || b.y > WATER_Y + 0.5) continue;
      if (this.game.grid.regionAt(b.x, b.z) !== region) continue;
      const dx = b.x - x, dz = b.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  eatBug(b) {
    if (this.game.bugs && b.sp) return this.game.bugs.eat(b, 'fish');
    b.dead = true;
    b.source.bugCount = Math.max(0, (b.source.bugCount || 1) - 1);
    this.game.stats.bugsEaten++;
  }

  update(dt) {
    this.time += dt;
    const game = this.game;
    const parts = game.particles;
    // [v30 feeding] flying handfuls: each piece lands on its own
    const F = parts.fx;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const h = this.flying[i];
      h.t += dt;
      for (const it of h.items) {
        if (it.done || h.t < it.delay + it.dur) continue;
        it.done = true;
        h.left--;
        // scatter: a little skid along the throw direction
        const dx = it.tx - h.fx, dz = it.tz - h.fz, dl = Math.hypot(dx, dz) || 1;
        const sk = 0.25 + Math.random() * 0.25;
        const p = this.dropPellet(it.tx, it.tz, WATER_Y, h.item, { vx: (dx / dl) * sk + it.ox, vz: (dz / dl) * sk + it.oz, rot: it.rot, spin: it.spin * 0.3, v: it.v });
        if (p) {
          h.landed++;
          F.spawn('ring_l', it.tx, WATER_Y + 0.012, it.tz, { life: 0.55, size: 0.16 + Math.random() * 0.06, flags: FX.FLAT | FX.FADE | FX.GROW, tint: [0.75, 0.9, 1], bright: true });
          if (Math.random() < 0.55) F.spawn('drop_s', it.tx, WATER_Y + 0.03, it.tz, { vx: (Math.random() - 0.5) * 0.5, vy: 0.9 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.5, grav: 8, life: 0.4, size: 0.045, flags: FX.WATER, bright: true });
          parts.sim?.disturb(it.tx, it.tz, 0.1, 0.05);
          if (!h.plopped) { h.plopped = true; game.audio.play('plop', { volume: 0.5, pitch: 0.95 + Math.random() * 0.3 }); }
        } else parts.dust(it.tx, game.grid.surfaceY(Math.floor(it.tx), Math.floor(it.tz)) + 0.05, it.tz, 2);
      }
      if (h.left <= 0) this.flying.splice(i, 1);
    }
    // pieces float, drift, then sink (each kind its own way) & expire
    const sim = parts.sim;
    let n = 0;
    for (const p of this.pellets) {
      if (p.eaten) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      const ph = FOOD_PHYS[p.style] || FOOD_PHYS.kibble;
      p.rot += p.spin * dt;
      p.spin *= 1 - Math.min(1, dt * 2);
      if (p.st === 'float') {
        const sx = p.x + p.vx * dt, sz = p.z + p.vz * dt;
        if (game.grid.isWater(Math.floor(sx), Math.floor(sz))) { p.x = sx; p.z = sz; } else { p.vx = -p.vx * 0.5; p.vz = -p.vz * 0.5; }
        const dk = 1 - Math.min(1, dt * 1.6);
        p.vx = p.vx * dk + Math.sin(this.time * 0.7 + p.seed) * dt * 0.03;
        p.vz = p.vz * dk + Math.cos(this.time * 0.6 + p.seed * 1.3) * dt * 0.03;
        p.y = WATER_Y + 0.012 + (sim ? sim.heightAt(p.x, p.z) * 0.1 : 0) + Math.sin(this.time * 2.4 * ph.bob + p.seed) * 0.006;
        p.ft -= dt;
        p.ringT -= dt;
        if (p.ringT <= 0) { p.ringT = 1.6 + Math.random() * 2.4; if (this.pellets.length < 60) F.spawn('ring_l', p.x, WATER_Y + 0.012, p.z, { life: 0.7, size: 0.12, flags: FX.FLAT | FX.FADE | FX.GROW, tint: [0.7, 0.85, 0.95], bright: true }); }
        if (p.ft <= 0) { p.st = 'sink'; p.sv = 0; }
      } else if (p.st === 'sink') {
        p.sv = Math.min(ph.sink, (p.sv || 0) + dt * ph.sink * 2);
        p.y -= p.sv * dt;
        if (ph.flutter) { p.x += Math.sin(this.time * 2.2 + p.seed) * dt * 0.05; p.z += Math.cos(this.time * 1.9 + p.seed) * dt * 0.04; p.rot = Math.sin(this.time * 3 + p.seed) * 0.7; }
        if (p.y <= p.floor) { p.y = p.floor; p.st = 'rest'; }
      }
      this.pellets[n++] = p;
    }
    this.pellets.length = n;

    // bugs
    for (const b of this.bugs) {
      if (b.dead) continue;
      b.ang += b.spd * dt * 0.9;
      const cx = b.source.x + 0.5, cz = b.source.z + 0.5;
      const tx = cx + Math.cos(b.ang) * b.r + Math.sin(this.time * 1.7 + b.seed) * 0.4;
      const tz = cz + Math.sin(b.ang) * b.r + Math.cos(this.time * 1.3 + b.seed) * 0.4;
      b.dipT -= dt;
      let ty = 0.7 + Math.sin(this.time * 2 + b.seed) * 0.2;
      if (b.dipT <= 0) { b.dipping = 1.6; b.dipT = 4 + Math.random() * 7; }
      if (b.dipping > 0) {
        b.dipping -= dt;
        ty = WATER_Y + 0.12;
        if (Math.random() < dt * 2) parts.ripple(b.x, b.z, 0.2, 0.6, 0.3);
      } else b.targeted = false;
      const dx = tx - b.x, dz = tz - b.z;
      b.heading = Math.atan2(dz, dx);
      b.x += dx * Math.min(1, dt * 2.5);
      b.z += dz * Math.min(1, dt * 2.5);
      b.y += (ty - b.y) * Math.min(1, dt * 2.5);
    }
    this.bugs = this.bugs.filter((b) => !b.dead && !b.source.removed);
  }

  render() {
    // [v30 feeding] food pieces: pixel sprites, tinted toward the water as they sink
    const B = this.foodBatch;
    B.clear();
    const o = this._ro || (this._ro = { texels: FOOD_TPU, mode: 2, ax: 0.5, ay: 0.5, rot: 0, alpha: 1, tint: [1, 1, 1], flip: false });
    const water = this.game.sky?.state?.waterShallow;
    const wt = water ? [0.62 + water.r * 0.35, 0.78 + water.g * 0.28, 0.9 + water.b * 0.2] : [0.7, 0.85, 0.95];
    const t = this.time;
    for (const p of this.pellets) {
      const fr = foodFrames(p.item);
      let vi = p.v % fr.length;
      if (p.style === 'worm' && p.st !== 'rest') vi = Math.floor(t * 5 + p.seed) % fr.length;
      const f = fr[vi % fr.length];
      const depth = Math.max(0, WATER_Y - p.y);
      const k = Math.min(1, depth / 0.35) * 0.75;
      o.tint[0] = 1 + (wt[0] - 1) * k; o.tint[1] = 1 + (wt[1] - 1) * k; o.tint[2] = 1 + (wt[2] - 1) * k;
      o.alpha = p.life < 2 ? p.life / 2 : 1 - Math.min(0.45, depth * 0.9);
      o.rot = p.style === 'berry' || p.style === 'drop' ? Math.sin(p.rot) * 0.25 : p.rot;
      o.flip = (p.v & 1) === 1;
      B.push(f, p.x, p.y, p.z, o);
    }
    for (const h of this.flying) {
      for (const it of h.items) {
        if (it.done || h.t < it.delay) continue;
        const u = Math.min(1, (h.t - it.delay) / it.dur);
        const x = h.fx + (it.tx - h.fx) * u, z = h.fz + (it.tz - h.fz) * u;
        const y = h.fy + (WATER_Y - h.fy) * u + Math.sin(u * Math.PI) * it.h;
        const fr = foodFrames(h.item);
        o.tint[0] = o.tint[1] = o.tint[2] = 1;
        o.alpha = 1;
        o.rot = it.rot + it.spin * (h.t - it.delay);
        o.flip = (it.v & 1) === 1;
        B.push(fr[it.v % fr.length], x, y, z, o);
      }
    }
    B.commit();
    // bugs
    const bm = this.bugMesh;
    let k = 0;
    for (const b of this.bugs) {
      if (b.dead || k >= 200) continue;
      _e.set(0, -b.heading, 0);
      _q.setFromEuler(_e);
      _p.set(b.x, b.y, b.z);
      const flap = 0.75 + 0.25 * Math.sin(this.time * 40 + b.seed * 7);
      _s.set(1, 1, flap);
      _m.compose(_p, _q, _s);
      bm.setMatrixAt(k++, _m);
    }
    bm.count = k;
    bm.instanceMatrix.needsUpdate = true;
  }

  serialize() {
    return { pellets: this.pellets.slice(0, 80).map((p) => [+p.x.toFixed(2), +p.z.toFixed(2), +p.life.toFixed(1), p.item || 'pellets']) };
  }

  load(d) {
    this.pellets.length = 0;
    for (const [x, z, life, item] of d?.pellets || []) {
      const p = this.dropPellet(x, z, this.game.grid.surfaceY(Math.floor(x), Math.floor(z)) + 0.05, FOOD_ITEMS[item] ? item : 'pellets');
      if (p) p.life = life;
    }
  }
}
