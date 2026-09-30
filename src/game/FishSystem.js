// Fish simulation: swimming (steering + wall avoidance), feeding on pellets,
// seaweed and bugs, fleeing bears, courtship -> eggs -> fry -> adults, and
// cross-breeding discoveries. Rendered with one InstancedMesh per species.
import * as THREE from 'three';
import { SPECIES_BY_ID, HYBRIDS, GOLDEN_MULT } from '../data/species.js';
import { buildFishGeometry, fishMaterial, fishUniforms } from '../entities/fishModels.js';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';
import { FISH_Y, WATER_Y } from '../world/grid.js';
import { angleDiff, clamp } from '../core/rng.js';

const HUNGER_RATE = 1 / 95; // per second -> starving after ~95 s
const GROW_TIME = 36; // seconds from fry to adult
const TAU = Math.PI * 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

let nextId = 1;

export class FishSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.eggs = [];
    this.byId = new Map();
    this.meshes = new Map();
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.hash = new Map();
    // egg cluster visuals
    const ev = new VoxelModel();
    const eggC = [0xffb070, 0xff9a5a, 0xffc890];
    const pts = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 1], [0, 1, 0], [-1, 0, 1]];
    pts.forEach((p, i) => ev.set(p[0], p[1], p[2], eggC[i % 3]));
    this.eggMesh = new THREE.InstancedMesh(ev.build({ pivot: [0.5, 0, 0.5], scale: 0.06 }), voxelMaterial(), 256);
    this.eggMesh.count = 0;
    this.eggMesh.frustumCulled = false;
    game.scene.add(this.eggMesh);
    this.time = 0;
  }

  get count() { return this.list.length; }

  countBySpecies() {
    const out = {};
    for (const f of this.list) out[f.sp.id] = (out[f.sp.id] || 0) + 1;
    return out;
  }

  // ------------------------------------------------------------ spawning
  spawn(speciesId, x, z, { adult = true, golden = false, heading = Math.random() * TAU, splash = false, hunger = 0.2 } = {}) {
    const sp = SPECIES_BY_ID[speciesId];
    if (!sp) return null;
    const f = {
      id: nextId++, sp, golden, x, z, y: FISH_Y,
      heading, speed: 0, wanderT: 0, wanderH: heading,
      age: adult ? GROW_TIME : 0, adult,
      hunger, loveT: 8 + Math.random() * 10, bugBoost: 0,
      state: 'wander', mate: null, courtT: 0, target: null, thinkT: Math.random() * 0.3,
      phase: Math.random() * TAU, amp: 0.05, seed: Math.random() * 100,
      fleeT: 0, jump: null, dead: false, region: this.game.grid.regionAt(x, z),
      born: this.game.state?.day || 1,
    };
    this.list.push(f);
    this.byId.set(f.id, f);
    if (splash) {
      this.game.particles.splash(x, z, 10, 0.8);
      this.game.audio.play('splash', { volume: 0.5, pitch: 1.2 + Math.random() * 0.3 });
    }
    return f;
  }

  remove(f) {
    if (f.dead) return;
    f.dead = true;
    this.byId.delete(f.id);
    const i = this.list.indexOf(f);
    if (i >= 0) this.list.splice(i, 1);
    if (f.mate) { f.mate.mate = null; f.mate.state = 'wander'; }
  }

  capacity() {
    const g = this.game;
    return Math.floor(g.grid.countWater() * 0.62 * g.mods.capacityMult) + g.mods.capacityBonus;
  }

  population() {
    let eggs = 0;
    for (const e of this.eggs) eggs += e.count;
    return this.list.length + eggs;
  }

  // Random point inside a fish region (or any water) for dropping fish.
  randomWaterPoint(region = -1) {
    const g = this.game.grid;
    const tiles = [];
    for (let z = 0; z < g.h; z++)
      for (let x = 0; x < g.w; x++) {
        if (!g.fishPassable(x, z)) continue;
        if (region >= 0 && g.region[z * g.w + x] !== region) continue;
        tiles.push([x, z]);
      }
    if (!tiles.length) return null;
    const [x, z] = tiles[Math.floor(Math.random() * tiles.length)];
    return { x: x + 0.2 + Math.random() * 0.6, z: z + 0.2 + Math.random() * 0.6 };
  }

  // ------------------------------------------------------------ helpers
  passable(x, z, region) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.fishPassable(tx, tz)) return false;
    return region < 0 || g.region[tz * g.w + tx] === region;
  }

  rebuildHash() {
    const h = this.hash;
    h.clear();
    const W = this.game.grid.w;
    for (const f of this.list) {
      const k = Math.floor(f.z) * W + Math.floor(f.x);
      let a = h.get(k);
      if (!a) h.set(k, (a = []));
      a.push(f);
    }
  }

  neighbors(x, z, cb) {
    const W = this.game.grid.w;
    const tx = Math.floor(x), tz = Math.floor(z);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = this.hash.get((tz + dz) * W + tx + dx);
        if (a) for (const o of a) cb(o);
      }
  }

  onTopologyChanged() {
    const g = this.game.grid;
    for (const f of this.list) {
      f.region = g.regionAt(f.x, f.z);
      if (f.region < 0) {
        // stranded (tile became land/dam): hop to the nearest water
        const p = this.nearestWater(f.x, f.z);
        if (p) { f.x = p.x; f.z = p.z; f.region = g.regionAt(p.x, p.z); }
      }
    }
    for (const e of this.eggs) e.region = g.regionAt(e.x, e.z);
  }

  nearestWater(x, z) {
    const g = this.game.grid;
    let best = null, bd = Infinity;
    for (let dz = -4; dz <= 4; dz++)
      for (let dx = -4; dx <= 4; dx++) {
        const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
        if (!g.fishPassable(tx, tz)) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { x: tx + 0.5, z: tz + 0.5 }; }
      }
    return best || this.randomWaterPoint();
  }

  compatible(a, b) {
    if (a.sp.id === b.sp.id) return a.sp.id;
    return HYBRIDS[`${a.sp.id}|${b.sp.id}`] || null;
  }

  eligibleForLove(f) {
    return f.adult && f.hunger < 0.55 && f.loveT <= 0 && f.state !== 'flee' && f.state !== 'court' && !f.jump;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const game = this.game;
    this.time += dt;
    this.rebuildHash();
    const phase = game.state.phase;
    const canBreed = phase === 'day' && this.population() < this.capacity();
    const night = phase === 'night';
    const mods = game.mods;
    const bears = game.bears ? game.bears.inWater() : [];
    const food = game.food;

    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      if (f.dead) continue;
      const sp = f.sp;
      // hunger & growth
      f.hunger = Math.min(1, f.hunger + dt * HUNGER_RATE * (f.adult ? 1 : 0.8) * (night ? 0.3 : 1));
      if (!f.adult) {
        f.age += dt * sp.growth * mods.growthMult * (f.hunger < 0.7 ? 1 : 0.35);
        if (f.age >= GROW_TIME) f.adult = true;
      }
      f.loveT -= dt * (f.bugBoost > 0 ? 1.8 : 1) * (1 + game.structures.aeratorBoost(f.x, f.z));
      f.bugBoost = Math.max(0, f.bugBoost - dt);

      if (f.jump) { this.updateJump(f, dt); continue; }

      const maxSpeed = 0.95 * sp.speed * (f.adult ? 1 : 1.15);
      let desired = f.heading;
      let targetSpeed = maxSpeed * 0.45;
      let turnRate = 2.6;

      // --- threats
      let threat = null, td = 3.4 * 3.4;
      for (const b of bears) {
        if (b.region !== f.region) continue;
        const dx = f.x - b.x, dz = f.z - b.z;
        const d = dx * dx + dz * dz;
        if (d < td) { td = d; threat = b; }
      }
      if (threat) {
        f.fleeT = 0.9;
        f.state = 'flee';
        if (f.mate) { f.mate.mate = null; if (f.mate.state === 'court') f.mate.state = 'wander'; f.mate = null; }
        desired = Math.atan2(f.z - threat.z, f.x - threat.x) + Math.sin(this.time * 4 + f.seed) * 0.7;
        targetSpeed = maxSpeed * 1.8;
        turnRate = 6;
      } else if (f.fleeT > 0) {
        f.fleeT -= dt;
        targetSpeed = maxSpeed * 1.4;
        if (f.fleeT <= 0) f.state = 'wander';
      } else if (f.state === 'court' && f.mate && !f.mate.dead) {
        const m = f.mate;
        const dx = m.x - f.x, dz = m.z - f.z;
        const d = Math.hypot(dx, dz);
        desired = Math.atan2(dz, dx);
        targetSpeed = maxSpeed * (d > 1 ? 1 : 0.5);
        turnRate = 4;
        f.courtT -= dt;
        if (d < 0.45 && f.id < m.id) this.mate(f, m);
        else if (f.courtT <= 0 || m.region !== f.region) { f.state = 'wander'; f.mate = null; m.mate = null; if (m.state === 'court') m.state = 'wander'; }
      } else {
        if (f.state === 'court') f.state = 'wander';
        // --- food
        f.thinkT -= dt;
        if (f.thinkT <= 0) {
          f.thinkT = 0.35 + Math.random() * 0.3;
          f.target = null;
          if (f.hunger > 0.22 && !night) {
            const pel = food.nearestPellet(f.x, f.z, 5.5, f.region);
            if (pel) f.target = { kind: 'pellet', ref: pel };
            else if (f.hunger > 0.4) {
              const weed = game.structures.nearestFood('seaweed', f.x, f.z, 7, f.region);
              if (weed) f.target = { kind: 'weed', ref: weed };
            }
            if (f.hunger > 0.3 && f.adult) {
              const bug = food.nearestDippingBug(f.x, f.z, 2.6, f.region);
              if (bug) { this.startJump(f, bug); continue; }
            }
          }
          // --- love
          if (!f.target && canBreed && this.eligibleForLove(f) && Math.random() < 0.6) {
            this.findMate(f);
          }
        }
        const t = f.target;
        if (t) {
          const tx = t.kind === 'weed' ? t.ref.x + 0.5 : t.ref.x;
          const tz = t.kind === 'weed' ? t.ref.z + 0.5 : t.ref.z;
          const dx = tx - f.x, dz = tz - f.z;
          const d = Math.hypot(dx, dz);
          desired = Math.atan2(dz, dx);
          targetSpeed = maxSpeed * (d > 0.8 ? 1.1 : 0.55);
          turnRate = 4.5;
          if (t.kind === 'pellet') {
            if (t.ref.eaten) f.target = null;
            else if (d < 0.28) {
              food.eatPellet(t.ref);
              f.hunger = Math.max(0, f.hunger - 0.34 * mods.foodMult);
              f.target = null;
              f.thinkT = 0.2;
              game.particles.bubbles(f.x, f.y + 0.1, f.z, 1);
              if (Math.random() < 0.35) game.audio.play('nibble', { volume: 0.25, pitch: 0.9 + Math.random() * 0.5 });
            }
          } else if (t.kind === 'weed') {
            if (d < 0.6) {
              if (game.structures.consume(t.ref, 0.18)) {
                f.hunger = Math.max(0, f.hunger - 0.2 * mods.foodMult);
                game.particles.bubbles(f.x, f.y + 0.1, f.z, 1);
              }
              f.target = null;
              f.thinkT = 1.2 + Math.random();
              f.heading += Math.PI * 0.8;
            }
          }
        } else {
          // wander
          f.wanderT -= dt;
          if (f.wanderT <= 0) {
            f.wanderT = 1.5 + Math.random() * 3;
            f.wanderH = f.heading + (Math.random() - 0.5) * 2.4;
            f.cruise = 0.3 + Math.random() * 0.45;
          }
          desired = f.wanderH;
          targetSpeed = maxSpeed * (f.cruise || 0.4) * (night ? 0.35 : 1);
          turnRate = 1.6;
        }
      }

      // --- separation
      let sx = 0, sz = 0;
      this.neighbors(f.x, f.z, (o) => {
        if (o === f || o === f.mate) return;
        const dx = f.x - o.x, dz = f.z - o.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.3 && d2 > 1e-6) { const d = Math.sqrt(d2); sx += dx / d * (0.55 - d); sz += dz / d * (0.55 - d); }
      });
      if (sx || sz) desired = blendAngle(desired, Math.atan2(sz, sx), Math.min(0.5, Math.hypot(sx, sz) * 1.5));

      // --- wall avoidance (probe ahead)
      const probe = 0.55 + f.speed * 0.4;
      const ax = f.x + Math.cos(desired) * probe, az = f.z + Math.sin(desired) * probe;
      if (!this.passable(ax, az, f.region)) {
        let found = false;
        for (let k = 1; k <= 6 && !found; k++)
          for (const sgn of [1, -1]) {
            const h = desired + sgn * k * 0.45;
            if (this.passable(f.x + Math.cos(h) * probe, f.z + Math.sin(h) * probe, f.region)) {
              desired = h; found = true; turnRate = Math.max(turnRate, 5); f.wanderH = h; break;
            }
          }
        if (!found) { desired = f.heading + Math.PI; turnRate = 8; }
      }

      // --- integrate
      const dh = angleDiff(f.heading, desired);
      const turn = clamp(dh, -turnRate * dt, turnRate * dt);
      f.heading += turn;
      f.turn = turn / Math.max(dt, 1e-4);
      f.speed += (targetSpeed - f.speed) * Math.min(1, dt * 3);
      const nx = f.x + Math.cos(f.heading) * f.speed * dt;
      const nz = f.z + Math.sin(f.heading) * f.speed * dt;
      if (this.passable(nx, nz, f.region)) { f.x = nx; f.z = nz; }
      else if (this.passable(nx, f.z, f.region)) f.x = nx;
      else if (this.passable(f.x, nz, f.region)) f.z = nz;
      else { f.heading += Math.PI * 0.6; f.speed *= 0.3; }
      // swim wiggle
      f.phase += dt * (5 + f.speed * 11);
      f.amp = 0.03 + Math.min(0.09, f.speed * 0.05) + Math.min(0.06, Math.abs(f.turn) * 0.02);
      f.y = FISH_Y + Math.sin(this.time * 0.8 + f.seed) * 0.05 + (f.adult ? 0 : 0.08);
    }

    // eggs
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      e.t -= dt;
      if (Math.random() < dt * 0.6) game.particles.bubbles(e.x, e.y + 0.05, e.z, 1);
      if (e.t <= 0) {
        this.eggs.splice(i, 1);
        this.hatch(e);
      }
    }
  }

  findMate(f) {
    let best = null, bd = 5.5 * 5.5;
    for (const o of this.list) {
      if (o === f || o.region !== f.region || !this.eligibleForLove(o)) continue;
      const kid = this.compatible(f, o);
      if (!kid) continue;
      const dx = o.x - f.x, dz = o.z - f.z;
      let d = dx * dx + dz * dz;
      if (o.sp.id !== f.sp.id) d *= 1.6; // prefer own species a little
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      f.state = best.state = 'court';
      f.mate = best; best.mate = f;
      f.courtT = best.courtT = 9;
      f.target = best.target = null;
    }
  }

  mate(a, b) {
    const game = this.game;
    const mods = game.mods;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    a.state = b.state = 'wander';
    a.mate = b.mate = null;
    const cd = (sp) => (26 + Math.random() * 14) / (sp.breed * mods.breedMult);
    a.loveT = cd(a.sp); b.loveT = cd(b.sp);
    a.hunger = Math.min(1, a.hunger + 0.12); b.hunger = Math.min(1, b.hunger + 0.12);
    a.heading += Math.PI * 0.7; b.heading -= Math.PI * 0.7;
    let kid = a.sp.id;
    let hybrid = false;
    if (a.sp.id !== b.sp.id) {
      const h = HYBRIDS[`${a.sp.id}|${b.sp.id}`];
      if (h && Math.random() < 0.3 * mods.hybridMult) { kid = h; hybrid = true; }
      else kid = Math.random() < 0.5 ? a.sp.id : b.sp.id;
    }
    const golden = Math.random() < 0.012 * mods.goldenMult || (a.golden && b.golden && Math.random() < 0.3);
    const count = 1 + (Math.random() < 0.55 ? 1 : 0) + mods.clutchBonus;
    const g = game.grid;
    const floor = g.groundAt(mx, mz);
    this.eggs.push({ x: mx, z: mz, y: floor + 0.02, species: kid, golden, count, t: 6 + Math.random() * 3, hybrid, region: a.region });
    game.particles.sprite('heart', mx, WATER_Y + 0.35, mz, { vy: 0.9, life: 1.4, size: 0.34 });
    setTimeout(() => game.particles.sprite('heart', mx + 0.2, WATER_Y + 0.3, mz, { vy: 0.7, life: 1.2, size: 0.24 }), 180);
    game.audio.play('heart', { volume: 0.45 });
    game.stats.courtships++;
  }

  hatch(e) {
    const game = this.game;
    const sp = SPECIES_BY_ID[e.species];
    for (let k = 0; k < e.count; k++) {
      const a = Math.random() * TAU;
      let x = e.x + Math.cos(a) * 0.2, z = e.z + Math.sin(a) * 0.2;
      if (!this.passable(x, z, -1)) { x = e.x; z = e.z; }
      if (!this.passable(x, z, -1)) {
        const p = this.nearestWater(x, z);
        if (!p) continue;
        x = p.x; z = p.z;
      }
      this.spawn(e.species, x, z, { adult: false, golden: e.golden && k === 0, hunger: 0.35 });
    }
    game.particles.bubbles(e.x, e.y + 0.1, e.z, 5);
    game.audio.play('hatch', { volume: 0.35 });
    game.stats.hatched += e.count;
    game.onFishBorn(sp, e);
  }

  // ------------------------------------------------------------ bug jumps
  startJump(f, bug) {
    bug.targeted = true;
    f.jump = { t: 0, dur: 0.75, x0: f.x, z0: f.z, x1: bug.x, z1: bug.z, bug };
    f.heading = Math.atan2(bug.z - f.z, bug.x - f.x);
    this.game.particles.splash(f.x, f.z, 6, 0.6);
    this.game.audio.play('splash', { volume: 0.35, pitch: 1.4 });
  }

  updateJump(f, dt) {
    const j = f.jump;
    j.t += dt / j.dur;
    const t = Math.min(1, j.t);
    f.x = j.x0 + (j.x1 - j.x0) * t;
    f.z = j.z0 + (j.z1 - j.z0) * t;
    f.y = FISH_Y + (WATER_Y + 0.9 - FISH_Y) * Math.sin(t * Math.PI);
    f.pitch = Math.cos(t * Math.PI) * 0.9;
    f.phase += dt * 20;
    f.amp = 0.08;
    if (t >= 0.5 && !j.ate) {
      j.ate = true;
      if (!j.bug.dead) {
        this.game.food.eatBug(j.bug);
        f.hunger = Math.max(0, f.hunger - 0.45 * this.game.mods.foodMult);
        f.bugBoost = 30;
        this.game.particles.sparkle(f.x, f.y + 0.1, f.z, 4, 0xd8ffa0);
        this.game.audio.play('nibble', { volume: 0.4, pitch: 1.3 });
      }
    }
    if (t >= 1) {
      f.jump = null;
      f.pitch = 0;
      if (!this.passable(f.x, f.z, f.region)) {
        const p = this.nearestWater(f.x, f.z);
        if (p) { f.x = p.x; f.z = p.z; f.region = this.game.grid.regionAt(p.x, p.z); }
      }
      this.game.particles.splash(f.x, f.z, 8, 0.7);
      this.game.audio.play('splash', { volume: 0.35, pitch: 1.25 });
    }
  }

  // Nearest catchable fish for a bear in a region (prefers a species).
  nearestFor(x, z, region, prefer = null, maxD = 30) {
    let best = null, bd = maxD * maxD;
    for (const f of this.list) {
      if (f.region !== region || f.jump) continue;
      if (this.game.structures.isSheltered(f.x, f.z)) continue;
      const dx = f.x - x, dz = f.z - z;
      let d = dx * dx + dz * dz;
      if (prefer && f.sp.id !== prefer) d = d * 4 + 60;
      if (!f.adult) d *= 1.8;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  mealValue(f) {
    return f.sp.meal * (f.adult ? 1 : 0.35);
  }

  coinValue(f) {
    return f.sp.meal * f.sp.value * (f.golden ? GOLDEN_MULT : 1) * (f.adult ? 1 : 0.35);
  }

  // ------------------------------------------------------------ render
  meshFor(sp, golden) {
    const key = sp.id + (golden ? '*' : '');
    let e = this.meshes.get(key);
    if (!e) {
      const { geo } = buildFishGeometry(sp, golden);
      const cap = 320;
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      const amp = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      phase.setUsage(THREE.DynamicDrawUsage); amp.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iPhase', phase);
      geo.setAttribute('iAmp', amp);
      const mesh = new THREE.InstancedMesh(geo, fishMaterial(), cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      mesh.count = 0;
      this.group.add(mesh);
      e = { mesh, phase, amp, cap, n: 0 };
      this.meshes.set(key, e);
    }
    return e;
  }

  render() {
    fishUniforms.uWaterColor.value.copy(this.game.sky.state.waterShallow);
    for (const e of this.meshes.values()) e.n = 0;
    const night = this.game.sky.state.night;
    for (const f of this.list) {
      const e = this.meshFor(f.sp, f.golden);
      if (e.n >= e.cap) continue;
      const grow = f.adult ? 1 : 0.42 + 0.58 * (f.age / GROW_TIME);
      const s = f.sp.size * grow;
      _e.set(0, -f.heading, 0);
      _e.z = (f.pitch || 0);
      _e.x = clamp(-(f.turn || 0) * 0.08, -0.4, 0.4);
      _q.setFromEuler(_e);
      _p.set(f.x, f.y, f.z);
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      e.mesh.setMatrixAt(e.n, _m);
      e.phase.array[e.n] = f.phase;
      e.amp.array[e.n] = f.amp / Math.max(0.5, s);
      e.n++;
    }
    for (const e of this.meshes.values()) {
      e.mesh.count = e.n;
      e.mesh.instanceMatrix.needsUpdate = true;
      e.phase.needsUpdate = true;
      e.amp.needsUpdate = true;
    }
    // eggs
    let n = 0;
    for (const eg of this.eggs) {
      if (n >= 256) break;
      const wob = 1 + Math.sin(this.time * 6 + eg.x) * 0.06 * (eg.t < 2 ? 3 : 1);
      _m.makeScale(wob, wob, wob);
      _m.setPosition(eg.x, eg.y, eg.z);
      this.eggMesh.setMatrixAt(n++, _m);
    }
    this.eggMesh.count = n;
    this.eggMesh.instanceMatrix.needsUpdate = true;
    // golden sparkle
    if (Math.random() < 0.15) {
      const golds = this.list.filter((f) => f.golden);
      if (golds.length) {
        const g = golds[Math.floor(Math.random() * golds.length)];
        this.game.particles.sparkle(g.x, g.y + 0.25, g.z, 1, 0xfff2a0);
      }
    }
    void night;
  }

  // ------------------------------------------------------------ save
  serialize() {
    return {
      fish: this.list.map((f) => [f.sp.id, +f.x.toFixed(2), +f.z.toFixed(2), f.adult ? 1 : 0, +f.age.toFixed(1), +f.hunger.toFixed(2), f.golden ? 1 : 0]),
      eggs: this.eggs.map((e) => [e.species, +e.x.toFixed(2), +e.z.toFixed(2), e.count, +e.t.toFixed(1), e.golden ? 1 : 0, e.hybrid ? 1 : 0]),
    };
  }

  load(data) {
    this.list.length = 0;
    this.byId.clear();
    this.eggs.length = 0;
    for (const [id, x, z, adult, age, hunger, golden] of data.fish || []) {
      const f = this.spawn(id, x, z, { adult: !!adult, golden: !!golden, hunger });
      if (f) f.age = age;
    }
    for (const [species, x, z, count, t, golden, hybrid] of data.eggs || []) {
      this.eggs.push({ species, x, z, y: this.game.grid.groundAt(x, z) + 0.02, count, t, golden: !!golden, hybrid: !!hybrid, region: this.game.grid.regionAt(x, z) });
    }
    this.onTopologyChanged();
  }
}

function blendAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}
