// Reynard the fox (in-world avatar) and ambient life: loons on the pond,
// Canada geese flying over, fireflies, falling maple leaves, chimney smoke,
// and the office whistle steam at 5 PM.
import * as THREE from 'three';
import { FoxRig, loonGeometry, gooseGeometry } from '../entities/critterModels.js';
import { voxelMaterial } from '../core/voxel.js';
import { WATER_Y } from '../world/grid.js';
import { HUT, OFFICE } from '../world/worldgen.js';
import { angleDiff, damp } from '../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class Fox {
  constructor(game) {
    this.game = game;
    this.rig = new FoxRig();
    game.scene.add(this.rig.root);
    this.home = { x: HUT.x + 1.5, z: HUT.z + 3.55 };
    this.x = this.home.x; this.z = this.home.z; this.y = 0.12;
    this.heading = Math.PI / 2;
    this.target = null;
    this.mood = 'idle'; // idle | throw | cheer | panic | greedy
    this.moodT = 0;
    this.time = 0;
    this.phase = 0;
  }

  handPos() {
    return { x: this.x + Math.cos(this.heading) * 0.3, y: this.y + 1.0, z: this.z + Math.sin(this.heading) * 0.3 };
  }

  // walk toward the shore near a point (for feeding), stay on land
  goToward(x, z) {
    const g = this.game.grid;
    const dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    this.heading = Math.atan2(dz, dx);
    if (d < 5) return;
    // walk along the ray until the next tile is water
    let tx = this.x, tz = this.z;
    const steps = Math.floor(d / 0.25);
    for (let i = 1; i < steps; i++) {
      const px = this.x + (dx / d) * i * 0.25, pz = this.z + (dz / d) * i * 0.25;
      const ix = Math.floor(px), iz = Math.floor(pz);
      if (!g.inb(ix, iz) || g.isWater(ix, iz) || g.deco[iz * g.w + ix] >= 0 || (g.occ[iz * g.w + ix] !== -1 && g.occ[iz * g.w + ix] !== -2)) break;
      if (Math.hypot(x - px, z - pz) < 3) { tx = px; tz = pz; break; }
      tx = px; tz = pz;
    }
    this.target = { x: tx, z: tz };
  }

  react(mood, t = 1.2) {
    this.mood = mood;
    this.moodT = t;
  }

  update(dt) {
    this.time += dt;
    const g = this.game.grid;
    this.moodT -= dt;
    if (this.moodT <= 0 && this.mood !== 'idle') this.mood = 'idle';
    let moving = false;
    const phase = this.game.state.phase;
    if (!this.target && this.mood === 'idle') {
      const far = Math.hypot(this.home.x - this.x, this.home.z - this.z);
      if (far > 1 && Math.random() < dt * 0.15) this.target = { ...this.home };
    }
    if (this.target) {
      const dx = this.target.x - this.x, dz = this.target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) this.target = null;
      else {
        const sp = Math.min(d, dt * 4.2);
        const nx = this.x + (dx / d) * sp, nz = this.z + (dz / d) * sp;
        if (!g.isWater(Math.floor(nx), Math.floor(nz))) { this.x = nx; this.z = nz; }
        else this.target = null;
        this.heading += angleDiff(this.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 12);
        moving = true;
      }
    }
    this.y = damp(this.y, g.surfaceY(Math.floor(this.x), Math.floor(this.z)) + (Math.hypot(this.x - this.home.x, this.z - this.home.z) < 0.9 ? 0.12 : 0), 12, dt);
    // pose
    const r = this.rig;
    if (moving) this.phase += dt * 16;
    const sw = moving ? Math.sin(this.phase) : 0;
    let armL = -sw * 0.7, armR = sw * 0.7, bob = moving ? Math.abs(Math.cos(this.phase)) * 0.06 : Math.sin(this.time * 2.2) * 0.012;
    let hop = 0;
    if (this.mood === 'throw') { const k = Math.max(0, this.moodT / 0.4); armR = -2.6 * k; }
    else if (this.mood === 'cheer') { armL = armR = -2.8 + Math.sin(this.time * 18) * 0.25; hop = Math.abs(Math.sin(this.time * 9)) * 0.25; }
    else if (this.mood === 'panic') { armL = -2.6 + Math.sin(this.time * 22) * 0.6; armR = -2.6 - Math.sin(this.time * 22) * 0.6; hop = Math.abs(Math.sin(this.time * 14)) * 0.1; }
    else if (this.mood === 'greedy' || (phase === 'rush' && !moving)) { armL = -1.2 + Math.sin(this.time * 10) * 0.25; armR = -1.2 - Math.sin(this.time * 10) * 0.25; }
    r.root.position.set(this.x, this.y + hop, this.z);
    r.root.rotation.set(0, Math.PI / 2 - this.heading, 0);
    r.legL.rotation.x = sw * 0.8;
    r.legR.rotation.x = -sw * 0.8;
    r.armL.rotation.x = armL;
    r.armR.rotation.x = armR;
    r.body.position.y = bob;
    if (!moving && this.mood === 'idle' && !this.target && Math.hypot(this.x - this.home.x, this.z - this.home.z) < 0.5) {
      // face the pond / camera
      this.heading += angleDiff(this.heading, Math.PI / 2 + Math.sin(this.time * 0.3) * 0.6) * Math.min(1, dt * 2);
    }
  }
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.time = 0;
    // loons
    const lg = loonGeometry();
    this.loonMesh = new THREE.InstancedMesh(lg, voxelMaterial(), 3);
    this.loonMesh.castShadow = true;
    this.loonMesh.count = 0;
    this.loonMesh.frustumCulled = false;
    game.scene.add(this.loonMesh);
    this.loons = [];
    for (let i = 0; i < 2; i++) this.loons.push({ x: 0, z: 0, heading: Math.random() * 6, dive: 0, t: 5 + Math.random() * 10, placed: false, seed: Math.random() * 10 });
    // geese (two wing frames)
    this.gooseUp = new THREE.InstancedMesh(gooseGeometry(true), voxelMaterial(), 16);
    this.gooseDn = new THREE.InstancedMesh(gooseGeometry(false), voxelMaterial(), 16);
    for (const m of [this.gooseUp, this.gooseDn]) { m.castShadow = true; m.count = 0; m.frustumCulled = false; game.scene.add(m); }
    this.flock = null;
    this.flockT = 25 + Math.random() * 20;
    this.mapleSpots = [];
    game.world.decos.forEach((d) => { if (d.type === 'maple' && !d.far) this.mapleSpots.push(d); });
    this.whistleT = 0;
  }

  onRushStart() { this.whistleT = 3; }

  placeLoon(l) {
    const p = this.game.fish.randomWaterPoint(-1);
    if (!p) return false;
    l.x = p.x; l.z = p.z; l.placed = true;
    return true;
  }

  update(dt) {
    this.time += dt;
    const game = this.game;
    const g = game.grid;
    const parts = game.particles;
    const night = game.sky.state.night;
    const hour = game.state.hour;
    // loons paddle and dive
    let n = 0;
    for (const l of this.loons) {
      if (!l.placed && !this.placeLoon(l)) continue;
      l.t -= dt;
      if (l.dive > 0) {
        l.dive -= dt;
        if (l.dive <= 0) {
          this.placeLoon(l);
          parts.ripple(l.x, l.z, 0.7, 1.2, 0.35);
          if ((hour > 18.5 || hour < 7) && Math.random() < 0.5) game.audio.play('loon', { volume: 0.35 });
        }
        continue;
      }
      if (l.t <= 0) {
        l.t = 8 + Math.random() * 14;
        if (Math.random() < 0.35) { l.dive = 3 + Math.random() * 3; parts.splash(l.x, l.z, 5, 0.5); continue; }
        l.heading += (Math.random() - 0.5) * 2;
      }
      const nx = l.x + Math.cos(l.heading) * dt * 0.35, nz = l.z + Math.sin(l.heading) * dt * 0.35;
      if (g.fishPassable(Math.floor(nx), Math.floor(nz)) && !this.nearBear(nx, nz)) { l.x = nx; l.z = nz; }
      else l.heading += Math.PI * 0.6 + Math.random();
      if (Math.random() < dt * 0.5) parts.ripple(l.x - Math.cos(l.heading) * 0.3, l.z - Math.sin(l.heading) * 0.3, 0.3, 0.9, 0.2);
      _e.set(0, -l.heading, 0);
      _q.setFromEuler(_e);
      _p.set(l.x, WATER_Y - 0.03 + Math.sin(this.time * 1.8 + l.seed) * 0.015, l.z);
      _m.compose(_p, _q, _s.set(0.9, 0.9, 0.9));
      this.loonMesh.setMatrixAt(n++, _m);
    }
    this.loonMesh.count = n;
    this.loonMesh.instanceMatrix.needsUpdate = true;

    // geese flock
    this.flockT -= dt;
    if (!this.flock && this.flockT <= 0 && night < 0.5) {
      const fromWest = Math.random() < 0.5;
      const z0 = 18 + Math.random() * 30;
      const count = 5 + Math.floor(Math.random() * 5);
      const dir = fromWest ? 0 : Math.PI;
      const tilt = (Math.random() - 0.5) * 0.5;
      this.flock = { x: fromWest ? -10 : g.w + 10, z: z0, dir: dir + tilt, count, t: 0, honked: 0 };
      this.flockT = 50 + Math.random() * 60;
    }
    let ku = 0, kd = 0;
    if (this.flock) {
      const f = this.flock;
      f.t += dt;
      f.x += Math.cos(f.dir) * dt * 3.4;
      f.z += Math.sin(f.dir) * dt * 3.4;
      if (f.t > f.honked * 2.3 && f.honked < 6) { f.honked++; game.audio.play('honk', { volume: 0.22, pitch: 0.9 + Math.random() * 0.3 }); }
      for (let i = 0; i < f.count; i++) {
        const row = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? 1 : -1;
        const bx = f.x - Math.cos(f.dir) * row * 0.9 - Math.sin(f.dir) * side * row * 0.8;
        const bz = f.z - Math.sin(f.dir) * row * 0.9 + Math.cos(f.dir) * side * row * 0.8;
        const flap = Math.sin(this.time * 7 + i * 0.9) > 0;
        _e.set(0, -f.dir, 0);
        _q.setFromEuler(_e);
        _p.set(bx, 11 + Math.sin(this.time * 2 + i) * 0.15, bz);
        _m.compose(_p, _q, _s.set(1.2, 1.2, 1.2));
        if (flap) this.gooseUp.setMatrixAt(ku++, _m); else this.gooseDn.setMatrixAt(kd++, _m);
      }
      if (f.x < -20 || f.x > g.w + 20) this.flock = null;
    }
    this.gooseUp.count = ku; this.gooseDn.count = kd;
    this.gooseUp.instanceMatrix.needsUpdate = true; this.gooseDn.instanceMatrix.needsUpdate = true;

    // fireflies at night over the meadow
    if (night > 0.4 && Math.random() < dt * 6 * night) {
      const x = 12 + Math.random() * 36, z = 24 + Math.random() * 28;
      if (!g.isWater(Math.floor(x), Math.floor(z))) parts.firefly(x, 0.4 + Math.random() * 1.2, z);
    }
    // falling maple leaves
    if (this.mapleSpots.length && Math.random() < dt * 2.2) {
      const d = this.mapleSpots[Math.floor(Math.random() * this.mapleSpots.length)];
      const cols = [[0xc0392b, 0xd9482f, 0xe0603a], [0xe07b24, 0xf0902c, 0xe8a030], [0xe8a93a, 0xf3c14b, 0xd65a28]][d.variant % 3];
      parts.leaf(d.x + 0.5 + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, d.z + 0.5 + (Math.random() - 0.5) * 2, cols[Math.floor(Math.random() * 3)]);
    }
    // chimney smoke
    if (Math.random() < dt * 3) parts.smoke(HUT.x + 0.75, 3.1, HUT.z + 0.75, night > 0.5 ? 0x8a8aa0 : 0xc8c4c0);
    // lab flask bubbles
    if (Math.random() < dt * 1.5) game.particles.glow.spawn(HUT.x + 1.95, 2.75, HUT.z + 0.35, 0, 0.5, 0, 0.8, 0.05, 0x7cff9a, 0, 0.5, 32);
    // office whistle steam
    if (this.whistleT > 0) {
      this.whistleT -= dt;
      for (let i = 0; i < 3; i++) parts.smoke(OFFICE.x + 3.2, OFFICE.h + 11.9, OFFICE.z - 1.1, 0xffffff);
    }
  }

  nearBear(x, z) {
    for (const b of this.game.bears.inWater()) if (Math.hypot(b.x - x, b.z - z) < 2.5) return true;
    return false;
  }
}
