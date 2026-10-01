// Reynard the fox (in-world avatar) and ambient life: loons on the pond,
// Canada geese flying over, fireflies, falling maple leaves, chimney smoke,
// and the office whistle steam at 5 PM.
import * as THREE from 'three';
import { FoxRig } from '../entities/foxRig.js';
import { SpriteBatch, SPRITE_UNIFORMS } from '../core/spriteBatch.js';
import { WATER_Y } from '../world/grid.js';
import { HUT, OFFICE, MEADOW } from '../world/worldgen.js';
import { angleDiff, damp } from '../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export class Fox {
  constructor(game) {
    this.game = game;
    this.rig = new FoxRig({ shadows: true });
    this.rig.root.scale.setScalar(0.85);
    this.anim = null;
    this.fidgetT = 8;
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
    if (this.bed) return;
    this.mood = mood;
    this.moodT = t;
  }

  // bedtime: walk home, yawn, go inside; zzz from the hut window
  goToBed() {
    this.bed = { stage: 'walk', t: 0 };
    this.target = { x: this.home.x, z: this.home.z - 0.2 };
    this.mood = 'idle';
    this.asleep = false;
  }

  wakeUp() {
    this.bed = null;
    this.asleep = false;
    this.rig.root.visible = true;
    this.x = this.home.x; this.z = this.home.z + 0.3;
    this.heading = Math.PI / 2;
    this.mood = 'cheer'; this.moodT = 1.2;
    this.game.particles.puff(this.x, 0.2, this.z, 6, 0.25);
    this.game.audio.play('fox_yawn', { volume: 0.4 });
  }

  updateBed(dt) {
    const b = this.bed;
    b.t += dt;
    if (b.stage === 'walk') {
      if (!this.target || b.t > 7) { b.stage = 'yawn'; b.t = 0; this.game.audio.play('fox_yawn', { volume: 0.45 }); this.game.ui?.foxBubble?.('*yaaawn*'); }
    } else if (b.stage === 'yawn') {
      this.heading = Math.PI / 2;
      if (b.t > 1.6) { b.stage = 'enter'; b.t = 0; this.target = { x: HUT.x + 1.5, z: HUT.z + 2.4 }; }
    } else if (b.stage === 'enter') {
      if (b.t > 0.9) {
        b.stage = 'asleep'; b.t = 0;
        this.rig.root.visible = false;
        this.asleep = true;
        this.game.audio.play('fox_snore', { volume: 0.35 });
      }
    } else if (b.stage === 'asleep') {
      if (b.t > 1.3) {
        b.t = 0;
        this.game.particles.zzz(HUT.x + 2.3, 2.3, HUT.z + 2.9);
        if (Math.random() < 0.5) this.game.audio.play('fox_snore', { volume: 0.25 });
      }
    }
  }

  update(dt) {
    this.time += dt;
    const g = this.game.grid;
    if (this.bed) this.updateBed(dt);
    this.moodT -= dt;
    if (this.moodT <= 0 && this.mood !== 'idle') this.mood = 'idle';
    let moving = false;
    const phase = this.game.state.phase;
    if (!this.target && this.mood === 'idle' && !this.bed) {
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
    // pose: pick an animation for the expressive fox rig
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.set(0, Math.PI / 2 - this.heading, 0);
    let want = 'idle', opts = {};
    if (this.bed?.stage === 'yawn') want = 'yawn';
    else if (moving) { want = this.target && Math.hypot(this.target.x - this.x, this.target.z - this.z) > 2.5 ? 'run' : 'walk'; }
    else if (this.mood === 'throw') want = 'throw';
    else if (this.mood === 'cheer') want = 'cheer';
    else if (this.mood === 'panic') want = 'panic';
    else if (this.mood === 'greedy') want = 'greedy';
    else if (phase === 'rush') want = 'count_coins';
    else {
      // idle fidgets: scheming, monocle polishing, the odd sneeze
      this.fidgetT -= dt;
      if (this.fidget && r.current === this.fidget && !r._cur?.done) want = this.fidget;
      else if (this.fidget && this.anim === this.fidget) this.fidget = null;
      if (this.fidgetT <= 0) {
        this.fidgetT = 9 + Math.random() * 12;
        this.fidget = ['idle_scheme', 'polish_monocle', 'stretch', 'laugh_evil', 'sneeze', 'think', 'count_coins'][Math.floor(Math.random() * 7)];
        want = this.fidget;
      }
    }
    if (want !== this.anim) {
      r.play(want, { fade: 0.15, ...opts });
      this.anim = want;
    }
    r.update(dt);
    if (!moving && this.mood === 'idle' && !this.target && Math.hypot(this.x - this.home.x, this.z - this.home.z) < 0.5) {
      // face the pond / camera
      this.heading += angleDiff(this.heading, Math.PI / 2 + Math.sin(this.time * 0.3) * 0.6) * Math.min(1, dt * 2);
    }
  }
}

// ---------------------------------------------------------------- critters
// All ambient wildlife is drawn as 2D pixel sprites from the nature atlas in
// one batch: loons and mallards on the pond, songbirds hopping and pecking in
// the meadow (they scatter when someone walks up), butterflies and bees over
// the flowers, dragonflies over the water, frogs croaking on the shore,
// squirrels darting between trees, moths at night, and V-flocks of geese.
const SONGBIRDS = ['bluejay', 'cardinal', 'chickadee', 'robin', 'grayjay', 'crow'];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Ambient {
  constructor(game) {
    this.game = game;
    this.time = 0;
    const nat = game.world.natureFrames();
    this.frames = nat.frames;
    this.batch = new SpriteBatch(nat.tex, { max: 256, lit: true, castShadow: true, receiveShadow: true, renderOrder: 13, name: 'critters' });
    game.scene.add(this.batch.mesh);
    this.loons = [];
    for (let i = 0; i < 2; i++) this.loons.push({ kind: 'loon', x: 0, z: 0, heading: Math.random() * 6, dive: 0, call: 0, t: 5 + Math.random() * 10, placed: false, seed: Math.random() * 10 });
    for (let i = 0; i < 2; i++) this.loons.push({ kind: 'mallard', x: 0, z: 0, heading: Math.random() * 6, dive: 0, call: 0, t: 3 + Math.random() * 6, placed: false, seed: Math.random() * 10 });
    this.birds = [];
    for (let i = 0; i < 7; i++) this.birds.push(this.newBird(true));
    this.flutter = [];
    for (let i = 0; i < 6; i++) this.flutter.push({ kind: i < 4 ? (i % 2 ? 'monarch' : 'bluebutterfly') : 'bee', x: rand(MEADOW.x0 + 6, MEADOW.x1 - 6), y: 0.8, z: rand(MEADOW.z0 + 5, MEADOW.z1 - 5), tx: 0, tz: 0, t: 0, seed: Math.random() * 9 });
    this.dragons = [];
    for (let i = 0; i < 3; i++) this.dragons.push({ x: 30, z: 36, y: 0.5, vx: 0, vz: 0, t: 0, placed: false, seed: Math.random() * 9 });
    this.frogs = [];
    for (let i = 0; i < 3; i++) this.frogs.push({ x: 0, z: 0, placed: false, t: rand(2, 8), croak: 0, jump: 0, seed: Math.random() * 9 });
    this.squirrels = [{ x: 0, z: 0, tx: 0, tz: 0, placed: false, t: 2, run: 0, seed: 1 }];
    this.flock = null;
    this.flockT = 25 + Math.random() * 20;
    this.mapleSpots = [];
    game.world.decos.forEach((d) => { if (d.type === 'maple' && !d.far) this.mapleSpots.push(d); });
    this.treeSpots = game.world.decos.filter((d) => !d.far && d.type !== 'boulder' && d.x > MEADOW.x0 + 2 && d.x < MEADOW.x1 - 2 && d.z > MEADOW.z0 + 1 && d.z < MEADOW.z1 - 1 && ['maple','birch','pine','spruce'].includes(d.type));
    this.flowerSpots = game.world.clutter.filter((c) => c.type !== 'tuft' && c.type !== 'fern' && c.x > MEADOW.x0 + 2 && c.x < MEADOW.x1 - 2 && c.z > MEADOW.z0 + 1 && c.z < MEADOW.z1 - 1);
    this.shore = [];
    this.shoreT = 0;
    this.whistleT = 0;
  }

  onRushStart() { this.whistleT = 3; }

  newBird(initial) {
    return { sp: pick(SONGBIRDS), x: 0, z: 0, y: 0, state: initial ? 'land' : 'away', t: initial ? rand(0, 6) : rand(8, 25), vx: 0, vz: 0, vy: 0, face: 1, seed: Math.random() * 9, hop: 0, placed: false };
  }

  meadowPoint() {
    const g = this.game.grid;
    for (let k = 0; k < 20; k++) {
      const x = rand(MEADOW.x0 + 4, MEADOW.x1 - 4), z = rand(MEADOW.z0 + 4, MEADOW.z1 - 3);
      const i = Math.floor(z) * g.w + Math.floor(x);
      if (!g.isWater(Math.floor(x), Math.floor(z)) && g.occ[i] < 0 && g.deco[i] < 0) return { x, z };
    }
    return null;
  }

  scanShore() {
    const g = this.game.grid;
    this.shore.length = 0;
    for (let z = MEADOW.z0 + 1; z < MEADOW.z1 - 1; z++)
      for (let x = MEADOW.x0 + 2; x < MEADOW.x1 - 2; x++) {
        if (g.isWater(x, z) || g.occ[z * g.w + x] >= 0 || g.deco[z * g.w + x] >= 0) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.isWater(x + dx, z + dz)) { this.shore.push({ x: x + 0.5 + dx * 0.3, z: z + 0.5 + dz * 0.3, wx: x + dx + 0.5, wz: z + dz + 0.5 }); break; }
      }
  }

  placeLoon(l) {
    const p = this.game.fish.randomWaterPoint(-1);
    if (!p) return false;
    l.x = p.x; l.z = p.z; l.placed = true;
    return true;
  }

  // nearest walker (fox, bear, beaver) distance
  threat(x, z) {
    const game = this.game;
    let d = Math.hypot(game.fox.x - x, game.fox.z - z);
    for (const b of game.bears.list) if (b.visible) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
    for (const b of game.beavers.list) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
    return d;
  }

  draw(name, frameIdx, x, y, z, o = {}) {
    const fr = this.frames[name];
    if (!fr || !fr.length) return;
    const f = fr[((frameIdx % fr.length) + fr.length) % fr.length];
    this.batch.push(f, x, y, z, { texels: 24, ...o });
  }

  // flip the right-facing art when moving left on screen
  faceOf(vx, vz, prev) {
    const r = SPRITE_UNIFORMS.uCamRight.value;
    const d = vx * r.x + vz * r.z;
    if (Math.abs(d) < 1e-3) return prev;
    return d > 0 ? 1 : -1;
  }

  update(dt) {
    this.time += dt;
    const game = this.game;
    const g = game.grid;
    const parts = game.particles;
    const night = game.sky.state.night;
    const hour = game.state.hour;
    const T = this.time;
    const B = this.batch;
    B.clear();
    this.shoreT -= dt;
    if (this.shoreT <= 0) { this.shoreT = 12; this.scanShore(); }

    // ---- loons and mallards paddle, dive and call
    for (const l of this.loons) {
      if (!l.placed && !this.placeLoon(l)) continue;
      l.t -= dt;
      if (l.dive > 0) {
        l.dive -= dt;
        if (l.dive > l.diveLen - 0.45 && l.kind === 'loon') this.draw('loon_dive', Math.floor((l.diveLen - l.dive) / 0.15), l.x, WATER_Y - 0.06, l.z, { flip: l.face < 0 });
        if (l.dive <= 0) {
          this.placeLoon(l);
          parts.ripple(l.x, l.z, 0.7, 1.2, 0.35);
          if ((hour > 18.5 || hour < 7) && Math.random() < 0.5) game.audio.play('loon', { volume: 0.35 });
        }
        continue;
      }
      if (l.t <= 0) {
        l.t = 8 + Math.random() * 14;
        const r = Math.random();
        if (l.kind === 'loon' && r < 0.3) { l.diveLen = l.dive = 3 + Math.random() * 3; parts.splash(l.x, l.z, 5, 0.5); continue; }
        if (l.kind === 'loon' && r < 0.45) { l.call = 1.6; if (Math.random() < 0.4) game.audio.play('loon', { volume: 0.25 }); }
        l.heading += (Math.random() - 0.5) * 2;
      }
      const sp = l.kind === 'mallard' ? 0.45 : 0.35;
      const vx = Math.cos(l.heading) * sp, vz = Math.sin(l.heading) * sp;
      const nx = l.x + vx * dt, nz = l.z + vz * dt;
      if (g.fishPassable(Math.floor(nx), Math.floor(nz)) && !this.nearBear(nx, nz)) { l.x = nx; l.z = nz; }
      else l.heading += Math.PI * 0.6 + Math.random();
      if (Math.random() < dt * 0.5) parts.ripple(l.x - Math.cos(l.heading) * 0.3, l.z - Math.sin(l.heading) * 0.3, 0.3, 0.9, 0.2);
      l.face = this.faceOf(vx, vz, l.face || 1);
      const bob = Math.sin(T * 1.8 + l.seed) * 0.015;
      if (l.call > 0) { l.call -= dt; this.draw(`${l.kind}_call`, Math.floor(T * 3), l.x, WATER_Y - 0.06 + bob, l.z, { flip: l.face < 0 }); }
      else this.draw(`${l.kind}_swim`, Math.floor(T * 2.2 + l.seed), l.x, WATER_Y - 0.06 + bob, l.z, { flip: l.face < 0 });
    }

    // ---- songbirds: hop, peck, scatter
    const dayish = night < 0.55;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.t -= dt;
      if (b.state === 'away') {
        if (b.t <= 0 && dayish) {
          const p = this.meadowPoint();
          if (p) {
            // fly in from off to the side and land on the target
            const a = Math.random() * Math.PI * 2;
            b.tx = p.x; b.tz = p.z;
            b.x = p.x + Math.cos(a) * 14; b.z = p.z + Math.sin(a) * 14; b.y = 7;
            b.state = 'in'; b.sp = pick(SONGBIRDS);
          } else b.t = 5;
        }
        continue;
      }
      if (b.state === 'in') {
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        const sp = 5;
        if (d < 0.15) { b.state = 'land'; b.y = 0; b.t = rand(1, 3); }
        else { b.x += (dx / d) * Math.min(d, sp * dt); b.z += (dz / d) * Math.min(d, sp * dt); b.y = Math.min(7, d * 0.5); b.face = this.faceOf(dx, dz, b.face); }
      } else if (b.state === 'out') {
        b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt; b.vy += dt * 1.5;
        if (b.y > 12) { b.state = 'away'; b.t = rand(10, 30); }
      } else {
        // on the ground
        const th = this.threat(b.x, b.z);
        if (th < 1.8 || !dayish) {
          const a = Math.atan2(b.z - game.fox.z, b.x - game.fox.x) + rand(-0.6, 0.6);
          b.state = 'out'; b.vx = Math.cos(a) * 4; b.vz = Math.sin(a) * 4; b.vy = 2.5; b.face = this.faceOf(b.vx, b.vz, b.face);
          parts.feathers?.(b.x, 0.2 + g.groundAt(b.x, b.z), b.z, 2);
          if (Math.random() < 0.5) game.audio.play('bird_chirp', { volume: 0.25, pitch: rand(0.9, 1.3) });
          continue;
        }
        if (b.hop > 0) {
          b.hop -= dt;
          b.x += b.vx * dt; b.z += b.vz * dt;
          b.y = Math.sin(Math.max(0, b.hop) / 0.25 * Math.PI) * 0.12;
          if (b.hop <= 0) { b.y = 0; b.state = 'land'; }
        } else if (b.t <= 0) {
          const r = Math.random();
          if (r < 0.45) {
            const a = Math.random() * Math.PI * 2;
            b.vx = Math.cos(a) * 1.2; b.vz = Math.sin(a) * 1.2; b.hop = 0.25; b.face = this.faceOf(b.vx, b.vz, b.face);
            const nx = Math.floor(b.x + b.vx * 0.25), nz = Math.floor(b.z + b.vz * 0.25);
            if (g.isWater(nx, nz) || g.occ[nz * g.w + nx] >= 0) b.hop = 0;
            b.state = 'hop';
          } else if (r < 0.8) b.state = 'peck';
          else { b.state = 'idle'; if (Math.random() < 0.3) game.audio.play('bird_chirp', { volume: 0.12, pitch: rand(0.9, 1.4) }); }
          b.t = rand(0.5, 2.2);
        }
      }
      if (b.state === 'away') continue;
      const gy = g.groundAt(b.x, b.z);
      const y = Math.max(gy, b.y > 0.2 ? Math.max(gy, 0) + b.y : gy + b.y);
      const fl = { flip: b.face < 0 };
      if (b.state === 'in' || b.state === 'out') this.draw(`${b.sp}_fly`, Math.floor(T * 12 + b.seed), b.x, y, b.z, { ...fl, ay: 0.5 });
      else if (b.state === 'hop') this.draw(`${b.sp}_hop`, b.hop > 0.12 ? 1 : 0, b.x, y, b.z, fl);
      else if (b.state === 'peck') this.draw(`${b.sp}_peck`, Math.floor(T * 5 + b.seed), b.x, y, b.z, fl);
      else this.draw(`${b.sp}_idle`, Math.floor(T * 1.5 + b.seed), b.x, y, b.z, fl);
    }

    // ---- butterflies and bees drift between flowers (moths by night)
    for (const f of this.flutter) {
      f.t -= dt;
      if (f.t <= 0 && this.flowerSpots.length) {
        const s = pick(this.flowerSpots);
        f.tx = s.x; f.tz = s.z; f.t = rand(3, 8);
      }
      const bee = f.kind === 'bee';
      const sp = bee ? 1.6 : 0.9;
      const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { f.x += (dx / d) * Math.min(d, sp * dt) + Math.sin(T * 3 + f.seed) * dt * 0.5; f.z += (dz / d) * Math.min(d, sp * dt) + Math.cos(T * 2.3 + f.seed) * dt * 0.5; }
      f.face = this.faceOf(dx, dz, f.face || 1);
      const gy = Math.max(0, g.groundAt(f.x, f.z));
      const hover = d < 0.3 ? 0.35 : 0.7 + Math.sin(T * 2 + f.seed) * 0.2;
      const kind = night > 0.5 ? (bee ? null : 'moth') : f.kind;
      if (!kind) continue;
      this.draw(kind, Math.floor(T * (bee ? 14 : 7) + f.seed), f.x, gy + hover + Math.sin(T * 6 + f.seed) * 0.05, f.z, { flip: f.face < 0, ay: 0.5, emissive: night > 0.5 ? 0.2 : 0 });
    }

    // ---- dragonflies dart over the water
    for (const d of this.dragons) {
      if (night > 0.6) break;
      if (!d.placed) { const p = this.game.fish.randomWaterPoint(-1); if (!p) continue; d.x = p.x; d.z = p.z; d.placed = true; }
      d.t -= dt;
      if (d.t <= 0) {
        const p = this.game.fish.randomWaterPoint(-1);
        if (p && Math.hypot(p.x - d.x, p.z - d.z) < 6) { d.vx = (p.x - d.x) * 1.4; d.vz = (p.z - d.z) * 1.4; }
        else { d.vx = 0; d.vz = 0; }
        d.t = Math.random() < 0.5 ? 0.6 : rand(1.5, 3);
      }
      const k = Math.exp(-dt * 3);
      d.x += d.vx * dt; d.z += d.vz * dt; d.vx *= k; d.vz *= k;
      d.face = this.faceOf(d.vx, d.vz, d.face || 1);
      if (Math.abs(d.vx) + Math.abs(d.vz) < 0.2 && Math.random() < dt * 0.4) parts.ripple(d.x, d.z, 0.2, 0.6, 0.15);
      this.draw('dragonfly', Math.floor(T * 20), d.x, WATER_Y + 0.4 + Math.sin(T * 4 + d.seed) * 0.06, d.z, { flip: d.face < 0, ay: 0.5 });
    }

    // ---- frogs on the shore croak, and plop into the water when startled
    for (const f of this.frogs) {
      if (!f.placed) {
        if (!this.shore.length) continue;
        const s = pick(this.shore);
        Object.assign(f, { x: s.x, z: s.z, wx: s.wx, wz: s.wz, placed: true, jump: 0, face: Math.random() < 0.5 ? 1 : -1 });
      }
      if (f.jump > 0) {
        f.jump -= dt;
        const t = 1 - f.jump / 0.4;
        const x = f.x + (f.wx - f.x) * t, z = f.z + (f.wz - f.z) * t;
        this.draw('frog_jump', t < 0.5 ? 0 : 1, x, Math.max(g.groundAt(x, z), WATER_Y) + Math.sin(t * Math.PI) * 0.35, z, { flip: f.face < 0 });
        if (f.jump <= 0) { parts.splash(f.wx, f.wz, 4, 0.35); game.audio.play('splash', { volume: 0.12, pitch: 1.6 }); f.placed = false; f.hidden = rand(6, 14); }
        continue;
      }
      if (f.hidden > 0) { f.hidden -= dt; if (f.hidden > 0) { f.placed = false; continue; } }
      if (this.threat(f.x, f.z) < 1.6) { f.jump = 0.4; f.face = this.faceOf(f.wx - f.x, f.wz - f.z, f.face); continue; }
      f.t -= dt;
      if (f.t <= 0) { f.t = rand(3, 9); f.croak = 0.8; if (Math.random() < 0.5) game.audio.play('frog_croak', { volume: 0.18, pitch: rand(0.85, 1.15) }); }
      const gy = g.groundAt(f.x, f.z);
      if (f.croak > 0) { f.croak -= dt; this.draw('frog_croak', Math.floor(T * 6), f.x, gy, f.z, { flip: f.face < 0 }); }
      else this.draw('frog_idle', Math.floor(T * 0.8 + f.seed), f.x, gy, f.z, { flip: f.face < 0 });
    }

    // ---- squirrels dash from tree to tree
    for (const q of this.squirrels) {
      if (!this.treeSpots.length || night > 0.6) break;
      if (!q.placed) { const d = pick(this.treeSpots); q.x = d.x + 0.5; q.z = d.z + 0.9; q.placed = true; }
      q.t -= dt;
      if (q.run <= 0 && (q.t <= 0 || this.threat(q.x, q.z) < 1.5)) {
        const d = pick(this.treeSpots);
        if (Math.hypot(d.x - q.x, d.z - q.z) < 9) { q.tx = d.x + 0.5; q.tz = d.z + 0.9; q.run = 1; }
        q.t = rand(4, 10);
      }
      if (q.run > 0) {
        const dx = q.tx - q.x, dz = q.tz - q.z, d = Math.hypot(dx, dz);
        if (d < 0.1) q.run = 0;
        else { q.x += (dx / d) * Math.min(d, 3.2 * dt); q.z += (dz / d) * Math.min(d, 3.2 * dt); q.face = this.faceOf(dx, dz, q.face || 1); }
        this.draw('squirrel_run', Math.floor(T * 10), q.x, g.groundAt(q.x, q.z) + Math.abs(Math.sin(T * 14)) * 0.06, q.z, { flip: q.face < 0 });
      } else this.draw('squirrel_idle', Math.floor(T * 1.3), q.x, g.groundAt(q.x, q.z), q.z, { flip: q.face < 0 });
    }

    // ---- geese flock
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
    if (this.flock) {
      const f = this.flock;
      f.t += dt;
      f.x += Math.cos(f.dir) * dt * 3.4;
      f.z += Math.sin(f.dir) * dt * 3.4;
      if (f.t > f.honked * 2.3 && f.honked < 6) { f.honked++; game.audio.play('honk', { volume: 0.22, pitch: 0.9 + Math.random() * 0.3 }); }
      const face = this.faceOf(Math.cos(f.dir), Math.sin(f.dir), 1);
      for (let i = 0; i < f.count; i++) {
        const row = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? 1 : -1;
        const bx = f.x - Math.cos(f.dir) * row * 0.9 - Math.sin(f.dir) * side * row * 0.8;
        const bz = f.z - Math.sin(f.dir) * row * 0.9 + Math.cos(f.dir) * side * row * 0.8;
        this.draw('goose_fly', Math.floor(T * 6 + i * 0.7), bx, 9 + Math.sin(T * 2 + i) * 0.15, bz, { flip: face < 0, ay: 0.5, scale: 1.4 });
      }
      if (f.x < -20 || f.x > g.w + 20) this.flock = null;
    }
    B.commit();

    // fireflies at night over the meadow
    if (night > 0.4 && Math.random() < dt * 6 * night) {
      const x = MEADOW.x0 + 4 + Math.random() * (MEADOW.x1 - MEADOW.x0 - 8), z = MEADOW.z0 + 3 + Math.random() * (MEADOW.z1 - MEADOW.z0 - 6);
      if (!g.isWater(Math.floor(x), Math.floor(z))) parts.firefly(x, 0.4 + Math.random() * 1.2, z);
    }
    // falling maple leaves
    if (this.mapleSpots.length && Math.random() < dt * 2.2) {
      const d = this.mapleSpots[Math.floor(Math.random() * this.mapleSpots.length)];
      const cols = [[0xc0392b, 0xd9482f, 0xe0603a], [0xe07b24, 0xf0902c, 0xe8a030], [0xe8a93a, 0xf3c14b, 0xd65a28]][d.variant % 3];
      parts.leaf(d.x + 0.5 + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, d.z + 0.5 + (Math.random() - 0.5) * 2, cols[Math.floor(Math.random() * 3)]);
    }
    // chimney smoke (the hut, plus any landmark cabins out in the woods)
    if (Math.random() < dt * 3) parts.smoke(HUT.x + 0.75, 3.1, HUT.z + 0.75, night > 0.5 ? 0x8a8aa0 : 0xc8c4c0);
    for (const sp of game.world.smokePoints || []) if (Math.random() < dt * 2) parts.smoke(sp[0], sp[1], sp[2], night > 0.5 ? 0x8a8aa0 : 0xc8c4c0);
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
