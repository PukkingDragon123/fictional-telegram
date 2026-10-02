// Fish simulation: swimming (steering + wall avoidance), feeding on pellets,
// seaweed and bugs, fleeing bears, courtship between a male and a female ->
// eggs -> fry -> adults, genetics (size, morphs, traits) and cross-breeding
// discoveries. Rendered as 2D pixel sprites (src/art/fishArt.js) in one batch.
import * as THREE from 'three';
import { SPECIES_BY_ID, HYBRIDS, MORPHS, MUTATIONS, RARITIES } from '../data/species.js';
import { SpriteBatch, pixelTexture } from '../core/spriteBatch.js';
import { fishAtlas, FISH_TPU } from './fishSprites.js';
import { rollGenes, breedGenes, valueMult, mealMult } from './genes.js';
import { FISH_Y, WATER_Y } from '../world/grid.js';
import { angleDiff, clamp } from '../core/rng.js';
import { FOOD_ITEMS } from '../data/foods.js';

const HUNGER_RATE = 1 / 150; // per second -> starving after ~150 s
export const GROW_TIME = 70; // seconds from fry to adult
const DATE_TIME = 7; // breeding stage 1: the date
const FERT_TIME = 6; // stage 3: dad hovering over the clutch
const SPOIL_TIME = 90; // unfertilized clutches fizzle out
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

let nextId = 1;

export class FishSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.eggs = [];
    this.byId = new Map();
    this.hash = new Map();
    this.time = 0;
    this.atlas = fishAtlas();
    this.tex = pixelTexture(this.atlas.canvas);
    this.batch = new SpriteBatch(this.tex, { max: 700, lit: true, castShadow: true, receiveShadow: false, renderOrder: 12, name: 'fish' });
    game.scene.add(this.batch.mesh);
    // tossed bones, eggs etc. (same atlas)
    this.bones = [];
    this.marks = null; // marker batch on the FX atlas (tags / love), created lazily
  }

  get count() { return this.list.length; }

  countBySpecies() {
    const out = {};
    for (const f of this.list) out[f.sp.id] = (out[f.sp.id] || 0) + 1;
    return out;
  }

  // ------------------------------------------------------------ spawning
  spawn(speciesId, x, z, { adult = true, heading = Math.random() * TAU, splash = false, hunger = 0.2, g = null, golden = false } = {}) {
    const sp = SPECIES_BY_ID[speciesId];
    if (!sp) return null;
    const genes = g || rollGenes(speciesId, this.game.mods);
    if (golden && genes.morph === 'normal') genes.morph = 'golden';
    const f = {
      id: nextId++, sp, g: genes, x, z, y: FISH_Y,
      heading, speed: 0, wanderT: 0, wanderH: heading,
      age: adult ? GROW_TIME : 0, adult,
      hunger, loveT: 10 + Math.random() * 12, bugBoost: 0,
      state: 'wander', mate: null, courtT: 0, target: null, thinkT: Math.random() * 0.3,
      phase: Math.random() * TAU, amp: 0.05, seed: Math.random() * 100,
      fleeT: 0, jump: null, dead: false, region: this.game.grid.regionAt(x, z),
      born: this.game.state?.day || 1, flip: Math.random() < 0.5, tagged: false, love: 0, held: false, name: null,
      fed: 0, luck: 0, growT: 0, // fed = the "well fed" meter: full (1) = ready to breed
    };
    this.list.push(f);
    this.byId.set(f.id, f);
    if (splash) {
      this.game.particles.splash(x, z, 10, 0.8);
      this.game.audio.play('splash', { volume: 0.5, pitch: 1.2 + Math.random() * 0.3 });
    }
    return f;
  }

  get golden() { return false; }

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

  randomWaterPoint(region = -1) {
    const g = this.game.grid;
    const tiles = [];
    for (let z = 0; z < g.h; z++)
      for (let x = 0; x < g.w; x++) {
        if (!g.fishPassable(x, z) || !g.meadow[z * g.w + x]) continue;
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
    for (const a of h.values()) a.length = 0;
    const W = this.game.grid.w;
    for (const f of this.list) {
      const k = Math.floor(f.z) * W + Math.floor(f.x);
      let a = h.get(k);
      if (!a) h.set(k, (a = []));
      a.push(f);
    }
  }

  bucket(tx, tz) { return this.hash.get(tz * this.game.grid.w + tx); }

  onTopologyChanged() {
    const g = this.game.grid;
    for (const f of this.list) {
      f.region = g.regionAt(f.x, f.z);
      if (f.region < 0 && !f.held) {
        const p = this.nearestWater(f.x, f.z);
        if (p) { f.x = p.x; f.z = p.z; f.region = g.regionAt(p.x, p.z); }
      }
    }
    for (const e of this.eggs) e.region = g.regionAt(e.x, e.z);
  }

  nearestWater(x, z) {
    const g = this.game.grid;
    let best = null, bd = Infinity;
    for (let dz = -5; dz <= 5; dz++)
      for (let dx = -5; dx <= 5; dx++) {
        const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
        if (!g.fishPassable(tx, tz)) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = { x: tx + 0.5, z: tz + 0.5 }; }
      }
    return best || this.randomWaterPoint();
  }

  compatible(a, b) {
    if (a.g.sex === b.g.sex) return null;
    if (a.sp.id === b.sp.id) return a.sp.id;
    return HYBRIDS[`${a.sp.id}|${b.sp.id}`] || null;
  }

  hasTrait(f, t) { return f.g.traits.includes(t); }

  // only adults with a full "well fed" meter fall in love
  eligibleForLove(f) {
    return f.adult && !f.held && f.fed >= 1 && f.hunger < 0.75 && f.loveT <= 0 && f.state !== 'flee' && f.state !== 'court' && !f.jump;
  }

  // a bite of food: hunger down, "well fed" meter up, plus the food's extras
  feedFish(f, item, scale = 1) {
    const game = this.game;
    const F = FOOD_ITEMS[item]?.fish || FOOD_ITEMS.pellets.fish;
    const glut = this.hasTrait(f, 'glutton') ? 1.6 : 1;
    f.hunger = Math.max(0, f.hunger - (F.fill ?? 0.3) * scale * game.mods.foodMult / glut);
    const was = f.fed;
    f.fed = Math.min(1, f.fed + (F.love ?? 0.3) * scale * (this.hasTrait(f, 'fertile') ? 1.25 : 1));
    if (F.happy) f.love = Math.min(1, f.love + F.happy * scale);
    if (F.grow) f.growT = Math.max(f.growT || 0, F.grow * scale);
    if (F.luck) f.luck = Math.min(1, (f.luck || 0) + F.luck * scale);
    if (was < 1 && f.fed >= 1) this.readyFx(f);
  }

  // cute "full belly, ready for love!" pop
  readyFx(f) {
    const game = this.game;
    if (!f.adult || f.tank && !f.tank.built) return;
    const y = WATER_Y + 0.35;
    game.particles.hearts(f.x, y, f.z, 4);
    game.particles.sparkle(f.x, y, f.z, 6, 0xffb0d0);
    game.ui?.floatTextAt?.(f.x, 0.75, f.z, '♥ Ready!', '#ffb0d8');
    game.audio.play('heart', { volume: 0.3, pitch: 1.5 });
    game.emit('fishReady', f);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const game = this.game;
    this.time += dt;
    this.rebuildHash();
    const phase = game.state.phase;
    const canBreed = (phase === 'day' || phase === 'evening' || phase === 'night') && this.population() < this.capacity();
    const night = phase === 'night';
    const mods = game.mods;
    const bears = game.bears ? game.bears.inWater() : [];
    const food = game.food;
    const sim = game.world.sim;

    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      if (f.dead) continue;
      const sp = f.sp;
      if (f.love > 0) f.love = Math.max(0, f.love - dt / 240);
      if (f.fed > 0) f.fed = Math.max(0, f.fed - dt * (f.hunger > 0.7 ? 1 / 90 : 1 / 420));
      if (f.growT > 0) f.growT -= dt;
      const loved = f.love > 0.2 ? 1 + mods.nurtureMult : 1;
      const hardy = this.hasTrait(f, 'hardy');
      const hungerK = (this.hasTrait(f, 'glutton') ? 2 : 1) * (hardy ? 0.7 : 1);
      f.hunger = Math.min(1, f.hunger + dt * HUNGER_RATE * hungerK * (f.adult ? 1 : 0.8) * (night ? 0.3 : 1));
      const aura = game.bugs ? game.bugs.auraAt(f.x, f.z) : null;
      if (!f.adult) {
        f.age += dt * sp.growth * mods.growthMult * (f.hunger < 0.7 ? 1 : 0.35) * (hardy ? 1.5 : 1) * loved * (1 + (aura ? aura.growth : 0) + (f.bugGrow > 0 ? 0.3 : 0) + (f.growT > 0 ? 1 : 0));
        if (f.age >= GROW_TIME) { f.adult = true; game.onFishGrew?.(f); }
      }
      f.loveT -= dt * (f.bugBoost > 0 ? 1.8 : 1) * (1 + game.structures.aeratorBoost(f.x, f.z)) * (this.hasTrait(f, 'fertile') ? 1.5 : 1) * (loved > 1 ? 1.5 : 1) * (night ? 0.5 : 1) * (1 + (aura ? aura.breed : 0));
      f.bugBoost = Math.max(0, f.bugBoost - dt);
      if (f.bugGrow > 0) f.bugGrow -= dt;
      if (f.held) { f.phase += dt * 22; continue; }
      if (f.tank) { this.game.tanks?.updateFish(f, dt); continue; }
      if (f.jump) { this.updateJump(f, dt); continue; }

      const maxSpeed = 0.9 * sp.speed * (f.adult ? 1 : 1.15);
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
        targetSpeed = maxSpeed * (this.hasTrait(f, 'speedy') ? 2.4 : 1.8);
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
        if (f.dateT > 0) {
          // stage 1, the date: they swim little loops around each other
          f.dateT -= dt;
          desired = Math.atan2(dz, dx) + Math.PI * 0.42;
          targetSpeed = maxSpeed * 0.55;
          turnRate = 5;
          if (Math.random() < dt * 2.4) game.particles.hearts(f.x, WATER_Y + 0.25 + Math.random() * 0.2, f.z, 1);
          if (f.id < m.id && Math.random() < dt * 0.9) game.particles.sparkle((f.x + m.x) / 2, WATER_Y + 0.3, (f.z + m.z) / 2, 1, 0xffc0e0);
          if (f.dateT <= 0 && f.id < m.id) this.mate(f, m);
          else if (m.region !== f.region) { f.state = 'wander'; f.mate = null; m.mate = null; f.dateT = m.dateT = 0; if (m.state === 'court') m.state = 'wander'; }
        } else {
          f.courtT -= dt;
          if (d < 0.6) {
            f.dateT = m.dateT = DATE_TIME;
            // first look: a cartoon heart pops between them
            const cx = (f.x + m.x) / 2, cz = (f.z + m.z) / 2;
            game.particles.word('smooch', cx, WATER_Y + 0.55, cz, { size: 0.3, life: 1.2, vy: 0.7 });
            game.particles.hearts(cx, WATER_Y + 0.35, cz, 5);
            game.audio.play('heart', { volume: 0.4, pitch: 1.2 });
            game.emit('fishDate', { a: f, b: m });
          }
          else if (f.courtT <= 0 || m.region !== f.region) { f.state = 'wander'; f.mate = null; m.mate = null; if (m.state === 'court') m.state = 'wander'; }
        }
      } else if (f.state === 'fertilize' && f.eggs && !f.eggs.dead) {
        // stage 3: dad swims over the clutch and fertilizes it
        const e = f.eggs;
        const dx = e.x - f.x, dz = e.z - f.z;
        const d = Math.hypot(dx, dz);
        desired = Math.atan2(dz, dx) + (d < 0.4 ? Math.PI * 0.5 : 0);
        targetSpeed = maxSpeed * (d > 0.6 ? 1 : 0.3);
        turnRate = 5;
        f.fertT = (f.fertT || 0) + dt;
        if (d < 0.55) {
          e.fertP = (e.fertP || 0) + dt;
          if (Math.random() < dt * 4) game.particles.bubbles(e.x, e.y + 0.1, e.z, 1);
          if (e.fertP >= FERT_TIME) this.fertilize(e, f);
        }
        if (f.fertT > 45 || e.stage !== 'laid') { f.state = 'wander'; f.eggs = null; f.fertT = 0; }
      } else {
        if (f.state === 'court' || f.state === 'fertilize') f.state = 'wander';
        // scared off mid-job? dad goes back to his eggs
        if (f.eggs && f.eggs.stage === 'laid' && !f.eggs.dead && (f.fertT || 0) < 45 && f.fleeT <= 0) f.state = 'fertilize';
        f.thinkT -= dt;
        if (f.thinkT <= 0) {
          f.thinkT = 0.35 + Math.random() * 0.3;
          f.target = null;
          if ((f.hunger > 0.22 || (f.fed < 1 && f.adult)) && !night) {
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
          if (!f.target && canBreed && this.eligibleForLove(f) && Math.random() < 0.6) this.findMate(f);
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
            else if (d < 0.3) {
              food.eatPellet(t.ref);
              this.feedFish(f, t.ref.item || 'pellets');
              f.target = null;
              f.thinkT = 0.2;
              game.particles.bubbles(f.x, f.y + 0.1, f.z, 1);
              sim.disturb(f.x, f.z, 0.12, 0.05);
              if (Math.random() < 0.35) game.audio.play('nibble', { volume: 0.25, pitch: 0.9 + Math.random() * 0.5 });
            }
          } else if (t.kind === 'weed') {
            if (d < 0.6) {
              if (game.structures.consume(t.ref, 0.18)) {
                f.hunger = Math.max(0, f.hunger - 0.2 * mods.foodMult);
                const was = f.fed;
                f.fed = Math.min(1, f.fed + 0.08);
                if (was < 1 && f.fed >= 1) this.readyFx(f);
                game.particles.bubbles(f.x, f.y + 0.1, f.z, 1);
              }
              f.target = null;
              f.thinkT = 1.2 + Math.random();
              f.heading += Math.PI * 0.8;
            }
          }
        } else {
          f.wanderT -= dt;
          if (f.wanderT <= 0) {
            f.wanderT = 1.5 + Math.random() * 3;
            f.wanderH = f.heading + (Math.random() - 0.5) * 2.4;
            f.cruise = 0.3 + Math.random() * 0.45;
            // shy fish drift towards cover
            if (this.hasTrait(f, 'shy')) {
              const cover = game.structures.nearestShelter?.(f.x, f.z, 6);
              if (cover) f.wanderH = Math.atan2(cover.z + 0.5 - f.z, cover.x + 0.5 - f.x);
            }
          }
          desired = f.wanderH;
          targetSpeed = maxSpeed * (f.cruise || 0.4) * (night ? 0.35 : 1);
          turnRate = 1.6;
        }
      }

      // --- separation
      let sx = 0, sz = 0;
      const ftx = Math.floor(f.x), ftz = Math.floor(f.z);
      for (let bz = -1; bz <= 1; bz++)
        for (let bx = -1; bx <= 1; bx++) {
          const a = this.bucket(ftx + bx, ftz + bz);
          if (!a) continue;
          for (let j = 0; j < a.length; j++) {
            const o = a[j];
            if (o === f || o === f.mate) continue;
            const dx = f.x - o.x, dz = f.z - o.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < 0.36 && d2 > 1e-6) { const d = Math.sqrt(d2); sx += dx / d * (0.6 - d); sz += dz / d * (0.6 - d); }
          }
        }
      if (sx || sz) desired = blendAngle(desired, Math.atan2(sz, sx), Math.min(0.5, Math.hypot(sx, sz) * 1.5));

      // --- wall avoidance (probe ahead)
      const probe = 0.6 + f.speed * 0.4;
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
      f.phase += dt * (4 + f.speed * 9);
      f.y = FISH_Y + Math.sin(this.time * 0.8 + f.seed) * 0.05 + (f.adult ? 0 : 0.1);
      if (f.speed > 1.3 && Math.random() < dt * 4) sim.wake(f.x, f.z, f.speed, 0.14, dt);
      if (f.love > 0.3 && Math.random() < dt * 0.25) game.particles.hearts(f.x, WATER_Y + 0.25, f.z, 1);
    }

    // eggs: laid -> fertilized (by dad) -> incubating -> ready; every egg waits for a tap
    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i];
      this.tickEgg(e, dt, i);
    }
    this.updateBones(dt);
  }

  // one egg clutch, any stage
  tickEgg(e, dt, i = this.eggs.indexOf(e)) {
    const game = this.game;
    e.stage ||= 'incubate';
    if (e.stage === 'laid') {
      e.age = (e.age || 0) + dt;
      if (Math.random() < dt * 0.4) game.particles.bubbles(e.x, e.y + 0.05, e.z, 1);
      // nobody came to fertilize it: it fizzles away
      if (e.age > SPOIL_TIME) {
        if (i >= 0) this.eggs.splice(i, 1);
        e.dead = true;
        game.particles.bubbles(e.x, e.y + 0.1, e.z, 6);
      }
      return;
    }
    if (!e.ready) e.t -= dt * (1 + (game.bugs ? game.bugs.auraAt(e.x, e.z).hatch : 0));
    if (Math.random() < dt * 0.6) game.particles.bubbles(e.x, e.y + 0.05, e.z, 1);
    if (e.t <= 0 && !e.ready) { e.ready = true; e.t = 0; game.audio.play('egg_crack', { volume: 0.4, pitch: 1.3 }); game.emit('eggReady', e); }
    if (e.ready) { e.t = 0; if (Math.random() < dt * 3) game.particles.sparkle(e.x, WATER_Y + 0.15, e.z, 1, 0xfff2a0); }
  }

  fertilize(e, dad) {
    const game = this.game;
    e.stage = 'incubate';
    e.t = game.quickEggs ? 6 : 80 + Math.random() * 40;
    e.total = e.t;
    e.fertP = FERT_TIME;
    if (dad) { dad.state = 'wander'; dad.eggs = null; dad.fertT = 0; }
    game.particles.sparkle(e.x, WATER_Y + 0.2, e.z, 8, 0xd8ffa0);
    game.audio.play('heart', { volume: 0.35, pitch: 1.3 });
    game.emit('eggFertilized', e);
  }

  findMate(f) {
    let best = null, bd = 6 * 6;
    for (const o of this.list) {
      if (o === f || o.region !== f.region || !this.eligibleForLove(o)) continue;
      const kid = this.compatible(f, o);
      if (!kid) continue;
      const dx = o.x - f.x, dz = o.z - f.z;
      let d = dx * dx + dz * dz;
      if (o.sp.id !== f.sp.id) d *= 1.6;
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      f.state = best.state = 'court';
      f.mate = best; best.mate = f;
      f.courtT = best.courtT = 10;
      f.target = best.target = null;
    }
  }

  mate(a, b) {
    const game = this.game;
    const mods = game.mods;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    a.state = b.state = 'wander';
    a.mate = b.mate = null;
    a.dateT = b.dateT = 0;
    const cd = (sp) => (130 + Math.random() * 70) / (sp.breed * mods.breedMult);
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
    const count = 1 + (Math.random() < 0.25 ? 1 : 0) + mods.clutchBonus;
    const g = game.grid;
    const nurtured = a.love > 0.2 || b.love > 0.2;
    const genes = [];
    const aura = game.bugs ? game.bugs.auraAt(mx, mz) : null;
    // mutation luck from fancy food (Royal Pearls, clovers, moonberries...)
    const foodLuck = ((a.luck || 0) + (b.luck || 0)) * 0.5;
    for (let k = 0; k < count; k++) genes.push(breedGenes(kid, a, b, mods, { nurtured, sizeBoost: aura ? aura.size : 0, luckBoost: (aura ? aura.luck : 0) + foodLuck * 1.5 }));
    // they need a good meal before the next time
    a.fed = b.fed = 0;
    a.luck = b.luck = 0;
    // stage 2: mum lays the clutch; dad has to come and fertilize it (stage 3)
    const mom = a.g?.sex === 'F' ? a : b.g?.sex === 'F' ? b : a;
    const dad = mom === a ? b : a;
    const ex = mom.x, ez = mom.z;
    const egg = { x: ex, z: ez, y: g.groundAt(ex, ez) + 0.02, species: kid, count, genes, t: 0, total: 110, hybrid, region: mom.region, parents: [a.sp.id, b.sp.id], stage: 'laid', age: 0, fertP: 0 };
    this.eggs.push(egg);
    if (dad && !dad.dead) { dad.state = 'fertilize'; dad.eggs = egg; dad.fertT = 0; dad.mate = null; }
    game.particles.bubbles(ex, egg.y + 0.1, ez, 6);
    game.particles.hearts(mx, WATER_Y + 0.3, mz, 8);
    game.particles.word('love', mx, WATER_Y + 0.7, mz, { size: 0.36, life: 1.4, vy: 0.8 });
    game.particles.sparkle(mx, WATER_Y + 0.4, mz, 10, 0xffc0e0);
    game.world.sim.disturb(mx, mz, 0.25, 0.12);
    game.audio.play('heart', { volume: 0.45 });
    game.emit('fishMated', { a, b, egg: null });
    game.stats.courtships++;
  }

  hatch(e) {
    const game = this.game;
    const sp = SPECIES_BY_ID[e.species];
    const room = this.capacity() - this.list.length;
    if (room <= 0) { game.particles.bubbles(e.x, e.y + 0.1, e.z, 3); return; }
    const n = Math.min(e.count, room);
    const born = [];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      let x = e.x + Math.cos(a) * 0.2, z = e.z + Math.sin(a) * 0.2;
      if (!this.passable(x, z, -1)) { x = e.x; z = e.z; }
      if (!this.passable(x, z, -1)) {
        const p = this.nearestWater(x, z);
        if (!p) continue;
        x = p.x; z = p.z;
      }
      const f = this.spawn(e.species, x, z, { adult: false, hunger: 0.35, g: e.genes?.[k] });
      if (f) born.push(f);
    }
    game.particles.bubbles(e.x, e.y + 0.1, e.z, 5);
    game.particles.shells(e.x, e.y + 0.15, e.z, 6);
    game.audio.play('hatch', { volume: 0.35 });
    const special = born.find((f) => f.g.morph !== 'normal');
    game.ui?.floatTextAt(e.x, 0.25, e.z, `+${born.length} fry`, special ? '#ffe070' : '#b8ffb0');
    game.stats.hatched += born.length;
    game.onFishBorn(sp, e, born);
    if (e.bought) game.onEggHatched?.(e, born);
  }

  hatchNow(e) {
    const i = this.eggs.indexOf(e);
    if (i < 0) return [];
    this.eggs.splice(i, 1);
    const before = this.list.length;
    this.hatch(e);
    return this.list.slice(before);
  }

  // place a bought egg in the pond (it hatches after its timer)
  addBoughtEgg(species, genes, t, at = null) {
    const p = at || this.randomWaterPoint();
    if (!p) return null;
    if (this.game.quickEggs) t = Math.min(t, 10);
    const rarity = Math.max(0, Math.min(4, genes.stars - 1));
    const hex = RARITIES[rarity].color.replace('#', '');
    const col = [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255].map((v) => 0.6 + v * 0.6);
    const e = { x: p.x, z: p.z, y: this.game.grid.groundAt(p.x, p.z) + 0.02, species, count: 1, genes: [genes], t, total: t, bought: true, stage: 'incubate', rarity, rarityColor: col, region: this.game.grid.regionAt(p.x, p.z) };
    this.eggs.push(e);
    this.game.particles.splash(p.x, p.z, 8, 0.6);
    return e;
  }

  // flashy trails for mutated fish
  mutationFx(f, mu) {
    const P = this.game.particles;
    const r = Math.random();
    const y = Math.max(f.y, WATER_Y) + 0.15;
    switch (mu.fx) {
      case 'flame': if (r < 0.04) P.smoke(f.x, WATER_Y + 0.05, f.z, 0xff8a40); break;
      case 'bigflame': if (r < 0.1) P.smoke(f.x, WATER_Y + 0.05, f.z, r < 0.05 ? 0xff4020 : 0xffb040); break;
      case 'sparkle': if (r < 0.04) P.sparkle(f.x, y, f.z, 1, 0xfff2a0); break;
      case 'stars': if (r < 0.05) P.sparkle(f.x, y, f.z, 1, r < 0.025 ? 0xc0a0ff : 0x80e0ff); break;
      case 'sprinkles': if (r < 0.04) P.confetti?.(f.x, y, f.z, 2); break;
      case 'frost': if (r < 0.03) P.sparkle(f.x, y, f.z, 1, 0xc8f4ff); break;
      case 'stink': if (r < 0.02) P.smoke(f.x, WATER_Y + 0.05, f.z, 0x90c060); break;
      case 'wow': if (r < 0.004) P.word?.('wow', f.x, y + 0.3, f.z, { size: 0.2, life: 0.9 }); else if (r < 0.03) P.sparkle(f.x, y, f.z, 1, 0xffd060); break;
      case 'stomp': if (r < 0.01) this.game.world.sim.disturb(f.x, f.z, 0.4, 0.2); break;
      default: break;
    }
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
    f.phase += dt * 20;
    if (t >= 0.5 && !j.ate) {
      j.ate = true;
      if (!j.bug.dead) {
        const bsp = this.game.food.eatBug(j.bug);
        if (bsp?.effect === 'growth') f.bugGrow = 40;
        f.hunger = Math.max(0, f.hunger - 0.45 * this.game.mods.foodMult);
        const wasFed = f.fed;
        f.fed = Math.min(1, f.fed + 0.3);
        if (wasFed < 1 && f.fed >= 1) this.readyFx(f);
        f.bugBoost = 30;
        this.game.particles.sparkle(f.x, f.y + 0.1, f.z, 4, 0xd8ffa0);
        this.game.audio.play('nibble', { volume: 0.4, pitch: 1.3 });
      }
    }
    if (t >= 1) {
      f.jump = null;
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
      if (f.region !== region || f.jump || f.tagged || f.held || f.tank) continue;
      if (this.game.structures.isSheltered(f.x, f.z, f)) continue;
      const dx = f.x - x, dz = f.z - z;
      let d = dx * dx + dz * dz;
      if (prefer && f.sp.id !== prefer) d = d * 4 + 60;
      if (!f.adult) d *= 1.8;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  catchable(f) { return !f.dead && !f.jump && !f.tagged && !f.held && !f.tank; }

  mealValue(f) { return f.sp.meal * mealMult(f.g) * (f.adult ? 1 : 0.35); }
  coinValue(f) { return f.sp.meal * f.sp.value * valueMult(f.g) * (f.adult ? 1 : 0.35); }

  worldSize(f) {
    const fr = this.atlas.frame(f.sp.id, f.g.morph, 0, false);
    const grow = f.adult ? 1 : 0.55 + 0.45 * (f.age / GROW_TIME);
    return { w: (fr.w / FISH_TPU) * f.g.size * grow, h: (fr.h / FISH_TPU) * f.g.size * grow };
  }

  // ------------------------------------------------------------ bones (tossed by bears)
  tossBone(f, x, y, z, vx, vy, vz) {
    const L = f.sp.size;
    const name = L > 1.45 ? 'bones_l' : L > 1.05 ? 'bones_m' : 'bones_s';
    this.bones.push({ name, x, y, z, vx, vy, vz, rot: 0, spin: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6), life: 26, rest: false, flip: Math.random() < 0.5, water: false });
  }

  updateBones(dt) {
    const game = this.game;
    for (let i = this.bones.length - 1; i >= 0; i--) {
      const b = this.bones[i];
      b.life -= dt;
      if (b.life <= 0) { this.bones.splice(i, 1); continue; }
      if (b.rest) { if (b.water) b.y = WATER_Y + 0.02 + game.world.sim.heightAt(b.x, b.z) * 0.1; continue; }
      b.vy -= 11 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.rot += b.spin * dt;
      const gy = game.grid.surfaceY(Math.floor(b.x), Math.floor(b.z));
      const wet = gy < WATER_Y;
      const floor = wet ? WATER_Y + 0.02 : gy + 0.03;
      if (b.y <= floor && b.vy < 0) {
        if (wet) {
          game.particles.splash(b.x, b.z, 6, 0.5);
          b.rest = true; b.water = true; b.rot = 0; b.y = floor; b.life = Math.min(b.life, 10);
        } else if (Math.abs(b.vy) > 2) {
          b.vy *= -0.4; b.vx *= 0.6; b.vz *= 0.6; b.y = floor; b.spin *= 0.5;
          game.audio.play('bone_clatter', { volume: 0.3, pitch: 0.9 + Math.random() * 0.3 });
        } else {
          b.rest = true; b.y = floor; b.rot = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------ render
  render() {
    const B = this.batch;
    B.clear();
    const game = this.game;
    const camR = game.rig.camera.matrixWorld.elements;
    const rx = camR[0], rz = camR[2];
    const sim = game.world.sim;
    const water = game.sky.state.waterShallow;
    const wt = [0.72 + water.r * 0.3, 0.84 + water.g * 0.25, 0.92 + water.b * 0.2];
    const o = {};
    const slope = { x: 0, z: 0 };
    for (const f of this.list) {
      if (f.dead) continue;
      const fry = !f.adult && f.age < GROW_TIME * 0.35;
      let frame;
      if (f.held) frame = 4;
      else frame = Math.floor(f.phase / (Math.PI / 2)) % 4;
      if (fry) frame %= 2;
      const fr = this.atlas.frame(f.sp.id, f.g.morph, frame, fry);
      if (!fr) continue;
      // face the direction of travel on screen (with hysteresis)
      const sd = Math.cos(f.heading) * rx + Math.sin(f.heading) * rz;
      if (sd > 0.12) f.flip = false; else if (sd < -0.12) f.flip = true;
      const grow = f.adult ? 1 : fry ? 1 : 0.62 + 0.38 * (f.age / GROW_TIME);
      const mu = f.g.mut ? MUTATIONS[f.g.mut] : null;
      const scale = f.g.size * grow * (mu ? mu.scale : 1);
      o.texels = FISH_TPU; o.scale = scale; o.mode = 0; o.ax = 0.5; o.ay = 0.5;
      o.flip = f.flip; o.sway = 0; o.phase = f.seed; o.bend = f.held ? 0 : Math.min(1.2, 0.35 + f.speed * 0.5);
      o.alpha = f.g.morph === 'ghost' ? 0.62 : 1;
      o.emissive = f.g.morph === 'golden' || f.g.morph === 'rainbow' ? 0.25 : f.g.morph === 'ghost' ? 0.35 : 0;
      o.rot = f.held ? Math.sin(f.phase) * 0.5 : f.jump ? (f.flip ? 1 : -1) * Math.cos(Math.min(1, f.jump.t) * Math.PI) * 0.9 : 0;
      let x = f.x, z = f.z, y = f.y;
      const under = !f.held && !f.jump && y < WATER_Y;
      if (under) {
        sim.slopeAt(x, z, slope);
        x += slope.x * 0.06; z += slope.z * 0.06;
        const k = clamp((WATER_Y - y) / 0.9, 0, 1) * 0.7;
        o.tint = [1 + (wt[0] - 1) * k, 1 + (wt[1] - 1) * k, 1 + (wt[2] - 1) * k];
      } else o.tint = null;
      if (f.tank) { o.scale = (o.scale ?? 1) * 0.36; o.tint = [0.88, 0.96, 1.04]; o.sway = 0; }
      if (mu && mu.fx !== 'none') {
        const t = mu.tint, base = o.tint || [1, 1, 1];
        o.tint = [base[0] * t[0], base[1] * t[1], base[2] * t[2]];
        if (mu.fx === 'shiny' || mu.fx === 'galaxy' || mu.fx === 'stars' || mu.fx === 'sparkle') o.emissive = Math.max(o.emissive, 0.2);
        this.mutationFx(f, mu);
      }
      B.push(fr, x, y, z, o);
      if (f.g.morph !== 'normal' && Math.random() < 0.02) {
        if (f.g.morph === 'golden' || f.g.morph === 'rainbow') game.particles.sparkle(f.x, f.y + 0.2, f.z, 1, f.g.morph === 'golden' ? 0xfff2a0 : 0xd8c8ff);
      }
    }
    // egg clutches on the pond floor (bought eggs are bigger and glow by rarity)
    const eggFr = this.atlas.extra('eggs');
    for (const e of this.eggs) {
      const wob = e.t < 4 ? Math.sin(this.time * 18 + e.x) * 0.15 : Math.sin(this.time * 3 + e.x) * 0.04;
      if (e.bought) {
        const c = e.rarityColor || [1, 1, 1];
        const pulse = 1 + Math.sin(this.time * 4 + e.x) * 0.05 + (e.ready ? 0.15 + Math.abs(Math.sin(this.time * 9)) * 0.2 : e.t < 4 ? Math.abs(Math.sin(this.time * 14)) * 0.15 : 0);
        B.push(eggFr, e.x, e.y + 0.03, e.z, { texels: FISH_TPU, scale: 1.6 * pulse, mode: 1, ax: 0.5, ay: 0.5, rot: wob, tint: c, emissive: e.rarity >= 2 ? 0.3 : 0.1 });
      } else {
        // laid (not fertilized yet) = pale pink, incubating = clear, ready = bouncing glow
        const pulse = e.ready ? 1.15 + Math.abs(Math.sin(this.time * 9)) * 0.25 : 1;
        const tint = e.stage === 'laid' ? [1.15, 0.85, 0.95] : [0.9, 0.95, 1];
        B.push(eggFr, e.x, e.y + 0.02, e.z, { texels: FISH_TPU, mode: e.tank ? 2 : 1, ax: 0.5, ay: 0.5, rot: wob, tint, scale: (e.tank ? 0.6 : 1) * pulse, emissive: e.ready ? 0.25 : 0 });
      }
    }
    // bones
    for (const b of this.bones) {
      const fr = this.atlas.extra(b.name);
      B.push(fr, b.x, b.y, b.z, { texels: FISH_TPU, mode: b.rest && !b.water ? 1 : b.rest ? 1 : 2, ax: 0.5, ay: 0.5, rot: b.rot, flip: b.flip, alpha: b.life < 3 ? b.life / 3 : 1 });
    }
    B.commit();
    this.renderMarks();
  }

  // little floating markers above tagged / loved fish (FX atlas)
  renderMarks() {
    const game = this.game;
    const P = game.particles;
    if (!this.marks) {
      this.marks = new SpriteBatch(P.tex, { max: 128, lit: false, renderOrder: 22, name: 'fishmarks' });
      game.scene.add(this.marks.mesh);
    }
    const M = this.marks;
    M.clear();
    const tagFr = P.atlas.frames.tagmark?.[0] || P.atlas.frames.heart_s[0];
    const loveFr = P.atlas.frames.heart_s[0];
    for (const f of this.list) {
      if (!f.tagged && f.love < 0.2) continue;
      const bob = Math.sin(this.time * 3 + f.seed) * 0.04;
      if (f.tagged) M.push(tagFr, f.x, WATER_Y + 0.32 + bob, f.z, { mode: 2, ax: 0.5, ay: 0, h: 0.2, w: 0.2 * tagFr.w / tagFr.h, emissive: 0.1 });
      else M.push(loveFr, f.x, WATER_Y + 0.3 + bob, f.z, { mode: 2, ax: 0.5, ay: 0, h: 0.13, w: 0.13 * loveFr.w / loveFr.h });
    }
    M.commit();
  }

  // ------------------------------------------------------------ save
  serialize() {
    return {
      fish: this.list.map((f) => [f.sp.id, +f.x.toFixed(2), +f.z.toFixed(2), f.adult ? 1 : 0, +f.age.toFixed(1), +f.hunger.toFixed(2), f.g, f.tagged ? 1 : 0, +f.love.toFixed(2), f.name || 0, f.tank ? [f.tank.x, f.tank.z] : 0, +(f.fed || 0).toFixed(2), +(f.luck || 0).toFixed(2)]),
      eggs: this.eggs.map((e) => [e.species, +e.x.toFixed(2), +e.z.toFixed(2), e.count, +e.t.toFixed(1), e.genes, e.hybrid ? 1 : 0, e.bought ? 1 : 0, +(e.total || 0).toFixed(1), e.stage === 'laid' ? 0 : 1, e.ready ? 1 : 0, e.tank ? [e.tank.x, e.tank.z] : 0]),
    };
  }

  load(data) {
    this.list.length = 0;
    this.byId.clear();
    this.eggs.length = 0;
    this.bones.length = 0;
    const tankAt = (xz) => (xz ? this.game.structures.list.find((s) => s.def.tank && s.x === xz[0] && s.z === xz[1]) : null);
    for (const [id, x, z, adult, age, hunger, g, tagged, love, name, tk, fed = 0.5, luck = 0] of data.fish || []) {
      const genes = g && typeof g === 'object' ? g : rollGenes(id, this.game.mods);
      const tank = tankAt(tk);
      const f = tank ? this.spawn(id, x, z, { adult: !!adult, hunger, g: genes }) : this.spawn(id, x, z, { adult: !!adult, hunger, g: genes });
      if (f) { f.age = age; f.tagged = !!tagged; f.love = love || 0; f.name = name || null; f.fed = fed; f.luck = luck; if (tank) this.game.tanks?.put(f, tank, { quiet: true }); }
    }
    for (const [species, x, z, count, t, genes, hybrid, bought, total, fert = 1, ready = 0, tk = 0] of data.eggs || []) {
      if (bought && Array.isArray(genes) && !tk) { const e = this.addBoughtEgg(species, genes[0], t, { x, z }); if (e) { e.total = total || t; if (ready) e.ready = true; } continue; }
      const gs = Array.isArray(genes) ? genes : [rollGenes(species, this.game.mods)];
      const e = { species, x, z, y: this.game.grid.groundAt(x, z) + 0.02, count, t, total: total || 110, genes: gs, hybrid: !!hybrid, region: this.game.grid.regionAt(x, z), stage: fert ? 'incubate' : 'laid', age: 0, ready: !!ready };
      const tank = tankAt(tk);
      if (tank) { e.tank = tank; e.y = this.game.tanks?.floorY(tank) ?? e.y; e.region = -1; }
      this.eggs.push(e);
    }

    this.onTopologyChanged();
  }
}

function blendAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

export { MORPHS };
