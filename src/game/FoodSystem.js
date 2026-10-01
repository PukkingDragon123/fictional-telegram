// Fish food pellets (thrown by the fox or dispensed by feeders) and flying
// bugs (dragonflies) spawned by cattails, lily pads and bug hotels.
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';
import { WATER_Y } from '../world/grid.js';

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
    const pv = new VoxelModel();
    pv.set(0, 0, 0, 0xb8742e);
    this.pelletMesh = new THREE.InstancedMesh(pv.build({ pivot: [0.5, 0.5, 0.5], scale: 0.075, ao: false }), voxelMaterial(), 600);
    this.pelletMesh.count = 0;
    this.pelletMesh.frustumCulled = false;
    this.pelletMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    game.scene.add(this.pelletMesh);
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

  // Throw a handful of pellets from (fx,fy,fz) to target (tx,tz).
  throwHandful(fx, fy, fz, tx, tz, n = 6, spread = 0.55) {
    const dur = 0.45 + Math.min(0.5, Math.hypot(tx - fx, tz - fz) * 0.04);
    const items = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      items.push({ tx: tx + Math.cos(a) * r, tz: tz + Math.sin(a) * r, delay: i * 0.02 });
    }
    this.flying.push({ fx, fy, fz, t: 0, dur, items, h: 1.4 + Math.random() * 0.4 });
  }

  dropPellet(x, z, y = WATER_Y) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.isWater(tx, tz)) return null;
    const p = { x, z, y, floor: g.surfaceY(tx, tz) + 0.05, life: 26, eaten: false, region: g.regionAt(x, z), seed: Math.random() * 10 };
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
    // flying handfuls
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const h = this.flying[i];
      h.t += dt;
      if (h.t >= h.dur) {
        this.flying.splice(i, 1);
        let landed = 0;
        for (const it of h.items) {
          if (this.dropPellet(it.tx, it.tz)) landed++;
          parts.ripple(it.tx, it.tz, 0.35, 0.8, 0.3);
        }
        if (landed) game.audio.play('plop', { volume: 0.55, pitch: 0.9 + Math.random() * 0.3 });
        else parts.dust(h.items[0].tx, 0.05, h.items[0].tz, 4);
      }
    }
    // pellets sink & expire
    let n = 0;
    for (const p of this.pellets) {
      if (p.eaten) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.y > p.floor) p.y = Math.max(p.floor, p.y - dt * 0.16);
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
    const pm = this.pelletMesh;
    let n = 0;
    const col = pm.instanceColor.array;
    for (const p of this.pellets) {
      if (n >= 600) break;
      _m.makeTranslation(p.x, p.y, p.z);
      pm.setMatrixAt(n, _m);
      const k = 0.85 + ((p.seed * 13) % 1) * 0.3;
      col[n * 3] = 0.72 * k; col[n * 3 + 1] = 0.42 * k; col[n * 3 + 2] = 0.18 * k;
      n++;
    }
    for (const h of this.flying) {
      const t = Math.min(1, h.t / h.dur);
      for (const it of h.items) {
        if (n >= 600) break;
        const x = h.fx + (it.tx - h.fx) * t, z = h.fz + (it.tz - h.fz) * t;
        const y = h.fy + (WATER_Y - h.fy) * t + Math.sin(t * Math.PI) * h.h;
        _m.makeTranslation(x, y, z);
        pm.setMatrixAt(n, _m);
        col[n * 3] = 0.72; col[n * 3 + 1] = 0.42; col[n * 3 + 2] = 0.18;
        n++;
      }
    }
    pm.count = n;
    pm.instanceMatrix.needsUpdate = true;
    pm.instanceColor.needsUpdate = true;
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
    return { pellets: this.pellets.slice(0, 80).map((p) => [+p.x.toFixed(2), +p.z.toFixed(2), +p.life.toFixed(1)]) };
  }

  load(d) {
    this.pellets.length = 0;
    for (const [x, z, life] of d?.pellets || []) {
      const p = this.dropPellet(x, z, this.game.grid.surfaceY(Math.floor(x), Math.floor(z)) + 0.05);
      if (p) p.life = life;
    }
  }
}
