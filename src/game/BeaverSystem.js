// Beaver helpers: live in lodges, swim/waddle to blueprints and build them,
// repair smashed things, and head home at night.
import * as THREE from 'three';
import { BeaverRig } from '../entities/critterModels.js';
import { WATER_Y } from '../world/grid.js';
import { angleDiff, damp } from '../core/rng.js';

export class BeaverSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.time = 0;
  }

  count() { return this.list.length; }

  onLodgeBuilt(lodge) {
    const n = (lodge.def.beavers || 2) + this.game.mods.beaverBonus;
    const have = this.list.filter((b) => b.lodge === lodge).length;
    for (let i = have; i < n; i++) this.spawn(lodge);
  }

  refreshCounts() {
    for (const s of this.game.structures.list) if (s.type === 'lodge' && s.built) this.onLodgeBuilt(s);
  }

  spawn(lodge) {
    const rig = new BeaverRig();
    this.group.add(rig.root);
    const b = {
      lodge, rig, x: lodge.x + 0.5 + (Math.random() - 0.5) * 0.6, z: lodge.z + 0.5 + (Math.random() - 0.5) * 0.6, y: 0,
      heading: Math.random() * 6.28, state: 'idle', job: null, t: Math.random() * 2, phase: 0, moving: false, wander: null,
    };
    this.list.push(b);
    this.game.particles.splash(b.x, b.z, 6, 0.6);
    return b;
  }

  clear() {
    for (const b of this.list) this.group.remove(b.rig.root);
    this.list.length = 0;
  }

  removeForLodge(lodge) {
    for (const b of [...this.list]) {
      if (b.lodge !== lodge) continue;
      if (b.job) b.job.assigned = null;
      this.group.remove(b.rig.root);
      this.list.splice(this.list.indexOf(b), 1);
    }
  }

  pendingJobs() {
    return this.game.structures.list.filter((s) => !s.built && s.def.builder === 'beaver');
  }

  findJob(b) {
    const structs = this.game.structures;
    let best = null, bd = Infinity;
    for (const s of structs.list) {
      if (s.built || s.def.builder !== 'beaver' || (s.assigned && s.assigned !== b)) continue;
      const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return { kind: 'build', s: best };
    // repairs
    for (const s of structs.list) {
      if (!s.built || s.hp >= s.maxHp || s.maxHp >= 90 || (s.assigned && s.assigned !== b)) continue;
      const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { kind: 'repair', s: best } : null;
  }

  update(dt) {
    this.time += dt;
    const game = this.game;
    const g = game.grid;
    const speedMult = game.mods.buildSpeed;
    for (const b of this.list) {
      b.moving = false;
      if (b.lodge.removed) continue;
      if (b.state === 'idle') {
        b.t -= dt;
        if (b.t <= 0) {
          b.t = 0.6 + Math.random() * 0.6;
          const job = this.findJob(b);
          if (job) {
            b.job = job;
            job.s.assigned = b;
            b.state = 'go';
          } else if (!b.wander || Math.random() < 0.3) {
            const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.6;
            b.wander = { x: b.lodge.x + 0.5 + Math.cos(a) * r, z: b.lodge.z + 0.5 + Math.sin(a) * r };
          }
        }
        if (b.wander) this.moveToward(b, b.wander.x, b.wander.z, dt, 0.8, 0.3);
      } else if (b.state === 'go') {
        const s = b.job.s;
        if (s.removed || (b.job.kind === 'build' && s.built)) { this.release(b); continue; }
        if (this.moveToward(b, s.x + 0.5, s.z + 0.5, dt, 3.6 * speedMult ** 0.5, 0.55)) {
          b.state = 'work'; b.t = 0; b.cloudT = 0;
          game.audio.play('build_cloud', { volume: 0.4, pitch: 0.95 + Math.random() * 0.15 });
        }
      } else if (b.state === 'work') {
        const s = b.job.s;
        if (s.removed) { this.release(b); continue; }
        b.heading += angleDiff(b.heading, Math.atan2(s.z + 0.5 - b.z, s.x + 0.5 - b.x)) * Math.min(1, dt * 6);
        b.t += dt;
        b.cloudT = (b.cloudT || 0) - dt;
        if (b.cloudT <= 0) {
          // cartoon fight cloud: whacks, planks and nails flying everywhere
          b.cloudT = 0.09;
          game.particles.buildCloud(s.x + 0.5, game.structures.baseY(s), s.z + 0.5, b.job.kind === 'build' ? 1 : 0.7);
        }
        if (b.t > 0.22) {
          b.t = 0;
          game.audio.play(Math.random() < 0.5 ? 'hammer' : 'nail', { volume: 0.2, pitch: 0.9 + Math.random() * 0.5 });
          if (Math.random() < 0.3) game.particles.word(['pow', 'bonk', 'bam'][Math.floor(Math.random() * 3)], s.x + 0.5 + (Math.random() - 0.5), game.structures.baseY(s) + 1.1, s.z + 0.5, { size: 0.22, life: 0.6 });
          if (Math.random() < 0.25) game.audio.play('saw', { volume: 0.15 });
        }
        if (b.job.kind === 'build') {
          s.progress += (dt * speedMult) / s.def.buildTime;
          if (s.progress >= 1) {
            game.structures.onBuilt(s);
            game.onStructureBuilt(s);
            s.popT = 0.45; // squash & stretch pop-in
            this.release(b);
            b.cheerT = 0.8;
          }
        } else {
          game.structures.repair(s, dt * 1.5 * speedMult);
          if (s.hp >= s.maxHp) this.release(b);
        }
      }
      // night: go home
      if (game.state.phase === 'night' && b.state === 'idle') b.wander = { x: b.lodge.x + 0.5, z: b.lodge.z + 0.5 };
      // y: swim in water, waddle on land
      const tx = Math.floor(b.x), tz = Math.floor(b.z);
      const inWater = g.isWater(tx, tz);
      const s = g.structAt(tx, tz);
      let gy = inWater ? WATER_Y - 0.42 : g.surfaceY(tx, tz);
      if (s && s.type === 'platform' && s.built) gy = 0.62;
      else if (s && (s.type === 'dam' || s.type === 'gate' || s.type === 'lodge') && s.built) gy = WATER_Y + 0.2;
      b.y = damp(b.y, gy, 10, dt);
      b.inWater = inWater;
    }
  }

  release(b) {
    if (b.job && b.job.s.assigned === b) b.job.s.assigned = null;
    b.job = null;
    b.state = 'idle';
    b.t = 0.2;
    b.wander = null;
  }

  // returns true when within `stopAt` of target
  moveToward(b, x, z, dt, speed, stopAt) {
    const dx = x - b.x, dz = z - b.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt) return true;
    const step = Math.min(d - stopAt * 0.9, speed * (b.inWater ? 0.85 : 1) * dt);
    b.x += (dx / d) * step;
    b.z += (dz / d) * step;
    b.heading += angleDiff(b.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 8);
    b.moving = true;
    b.phase += dt * 14;
    if (b.inWater && Math.random() < dt * 4) this.game.particles.ripple(b.x, b.z, 0.35, 0.8, 0.25);
    return false;
  }

  render() {
    for (const b of this.list) {
      const r = b.rig;
      let hop = 0;
      if (b.moving && !b.inWater) hop = Math.abs(Math.sin(b.phase)) * 0.12;
      if (b.cheerT > 0) { b.cheerT -= 1 / 60; hop = Math.abs(Math.sin(b.cheerT * 12)) * 0.3; }
      r.root.position.set(b.x, b.y + hop, b.z);
      r.root.rotation.set(0, Math.PI / 2 - b.heading, 0);
      const sq = b.moving ? 1 + Math.sin(b.phase * 2) * 0.08 : 1;
      r.root.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      r.root.visible = b.state !== 'work' || Math.sin(this.time * 30) > 0.2;
      if (b.state === 'work') {
        r.body.rotation.x = Math.sin(this.time * 22) * 0.18;
        r.tail.rotation.x = -0.3 + Math.abs(Math.sin(this.time * 11)) * 0.7;
      } else if (b.moving) {
        r.body.rotation.z = Math.sin(b.phase) * 0.12;
        r.body.rotation.x = 0.08;
        r.tail.rotation.x = Math.sin(b.phase * 0.5) * 0.25;
      } else {
        r.body.rotation.set(0, 0, 0);
        r.tail.rotation.x = Math.sin(this.time * 2) * 0.1;
      }
    }
  }

  serialize() { return this.list.length; }
}

function structuresTop(game, s) {
  return game.structures.baseY(s) + 0.5;
}
