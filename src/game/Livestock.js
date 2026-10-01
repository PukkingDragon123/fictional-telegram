// Livestock: ducks & geese. They paddle and waddle around your land, hunt
// bugs (and pellets floating by) when hungry, sleep in their nest at night.
// Fed hens lay eggs in their nest: fertile eggs hatch into ducklings/goslings
// (who follow mum and grow up), or you tap the nest to collect & sell them.
// Bug-farm circles boost growth, laying, size and luck (golden eggs!).
// Geese charge at rampaging bears and send them packing.
import * as THREE from 'three';
import { WATER_Y } from '../world/grid.js';
import { MEADOW, HUT } from '../world/worldgen.js';
import { BREEDS, KIND_INFO, HUNGER_TIME, GOLDEN_EGG, DUCK_NAMES, GOOSE_NAMES } from '../data/livestock.js';
import { STRUCTURES } from '../data/structures.js';

const c3 = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = c3['../entities/critters3d.js'] || {};

const rand = (a, b) => a + Math.random() * (b - a);
const LIVESTOCK_SCALE = 1.8; // the voxel ducks are tiny next to the fox; farm birds read better chunky
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Livestock {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.nextId = 1;
    this.time = 0;
  }

  // ------------------------------------------------------------ rigs
  makeRig(b) {
    const adult = b.age >= 1;
    let rig = null;
    try {
      if (!adult && C3.Chick) rig = new C3.Chick({ kind: b.kind === 'goose' ? 'gosling' : 'duckling', breed: b.breed });
      else if (b.kind === 'goose' && C3.Goose) rig = new C3.Goose({ sex: b.sex, breed: b.breed });
      else if (C3.Duck) rig = new C3.Duck({ sex: b.sex, breed: b.kind === 'duck' ? b.breed : 'mallard' });
    } catch (e) { console.warn('livestock rig', e); }
    if (!rig) {
      const root = new THREE.Group();
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: b.kind === 'goose' ? 0x6a5a4a : 0x9a8a5a }));
      m.position.y = 0.16; m.castShadow = true; root.add(m);
      rig = { root, play() {}, update() {}, dispose() {}, current: 'idle', anims: {} };
    }
    // fallbacks: a duck rig standing in for a goose / a baby is just scaled
    let sc = b.size * LIVESTOCK_SCALE;
    if (b.kind === 'goose' && !C3.Goose) sc *= 1.45;
    if (!adult && !C3.Chick) sc *= 0.55;
    rig.root.scale.setScalar(sc);
    return rig;
  }

  attach(b) {
    if (b.rig) { this.group.remove(b.rig.root); b.rig.dispose?.(); }
    b.rig = this.makeRig(b);
    b.rig.root.position.set(b.x, b.y, b.z);
    b.anim = null;
    this.group.add(b.rig.root);
  }

  anim(b, name, loop = true) {
    const r = b.rig;
    if (!r) return;
    const A = r.anims;
    const has = !A || (Array.isArray(A) ? A.includes(name) : !!A[name]);
    const n = has ? name : name === 'eat' ? 'peck' : name === 'brood' ? 'sit' : name === 'chase' ? 'waddle' : name === 'honk' ? (A && (Array.isArray(A) ? A.includes('quack') : A.quack) ? 'quack' : 'idle') : name === 'peep' ? 'idle' : name === 'sleep' ? 'sit' : 'idle';
    if (b.anim === n && loop) return;
    b.anim = n;
    r.play?.(n, { loop, fade: 0.18, onDone: loop ? undefined : () => { b.anim = null; } });
  }

  // ------------------------------------------------------------ population
  spawn(breed, { sex = null, age = 1, x = null, z = null, nest = null, name = null, size = null, golden = false } = {}) {
    const B = BREEDS[breed];
    if (!B) return null;
    const g = this.game.grid;
    const p = x != null ? { x, z } : this.homePoint();
    const b = {
      id: this.nextId++, breed, kind: B.kind, sex: sex || (Math.random() < 0.5 ? 'm' : 'f'), age, hunger: 0.25,
      size: size ?? +rand(0.9, 1.12).toFixed(2), golden, name: name || this.freshName(B.kind),
      x: p.x, z: p.z, y: g.groundAt(p.x, p.z), heading: Math.random() * 6.28, speed: 0, state: 'wander', t: rand(0.5, 2),
      tx: p.x, tz: p.z, layT: rand(30, 60), boost: {}, chaseCD: 0, nest: null, mom: null, happy: 0.6,
    };
    b.nest = nest || this.findNest(b);
    this.list.push(b);
    this.attach(b);
    this.game.emit('livestock', b);
    return b;
  }

  // e-Buy delivery: the crate pops open next to the hut
  spawnBought(breed, sex) {
    const d = this.game.delivery.dropPoint;
    const b = this.spawn(breed, { sex, age: 1, x: d.x + rand(-0.6, 0.6), z: d.z + rand(-0.4, 0.4) });
    if (b) {
      this.game.particles.confetti(b.x, b.y + 0.6, b.z, 16);
      this.anim(b, 'happy', false);
      if (!b.nest) this.game.notify(`${BREEDS[breed].name} has no nest! Build a ${STRUCTURES[KIND_INFO[b.kind].nest].name}.`, 'warn');
    }
    return b;
  }

  freshName(kind) {
    const pool = kind === 'goose' ? GOOSE_NAMES : DUCK_NAMES;
    const used = new Set(this.list.map((b) => b.name));
    const free = pool.filter((n) => !used.has(n));
    return free.length ? pick(free) : `${pick(pool)} ${this.nextId}`;
  }

  nests(kind = null) {
    return this.game.structures.list.filter((s) => !s.removed && s.built && s.def.nest && (!kind || s.def.nest.kind === kind));
  }

  residents(s) { return this.list.filter((b) => b.nest === s && b.age >= 1); }

  findNest(b) {
    let best = null, bd = 1e9;
    for (const s of this.nests(b.kind)) {
      if (this.residents(s).length >= s.def.nest.cap) continue;
      const d = (s.x + 0.5 - b.x) ** 2 + (s.z + 0.5 - b.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  count(kind = null) { return this.list.filter((b) => !kind || b.kind === kind).length; }

  // ------------------------------------------------------------ places
  walkable(x, z) {
    const g = this.game.grid;
    const ix = Math.floor(x), iz = Math.floor(z);
    if (!g.inb(ix, iz)) return false;
    const i = iz * g.w + ix;
    if (!g.meadow[i] || g.occ[i] === -2) return false;
    if (g.deco[i] >= 0) return false;
    const s = this.game.structures.structureAtTile(ix, iz);
    if (s && s.def.blocksBear && !s.def.nest) return false;
    return true;
  }

  homePoint() {
    const g = this.game.grid;
    for (let k = 0; k < 40; k++) {
      const x = rand(MEADOW.x0 + 6, MEADOW.x1 - 6), z = rand(MEADOW.z0 + 6, MEADOW.z1 - 4);
      if (this.walkable(x, z) && g.isWater(Math.floor(x), Math.floor(z))) return { x, z };
    }
    return { x: HUT.x + 1.5, z: HUT.z + 5 };
  }

  wanderPoint(b) {
    const g = this.game.grid;
    const cx = b.mom ? b.mom.x : b.nest ? b.nest.x + 0.5 : b.x;
    const cz = b.mom ? b.mom.z : b.nest ? b.nest.z + 0.5 : b.z;
    const R = b.mom ? 1.4 : 7;
    const wantWater = Math.random() < 0.6;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!this.walkable(x, z)) continue;
      if (k < 8 && g.isWater(Math.floor(x), Math.floor(z)) !== wantWater) continue;
      return { x, z };
    }
    return { x: b.x, z: b.z };
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const game = this.game;
    this.time += dt;
    const g = game.grid;
    const night = game.sky.state.night;
    const bugs = game.bugs;
    for (const b of this.list) {
      const info = KIND_INFO[b.kind];
      const adult = b.age >= 1;
      const aura = bugs ? bugs.auraAt(b.x, b.z) : {};
      for (const k of Object.keys(b.boost)) { b.boost[k] -= dt; if (b.boost[k] <= 0) delete b.boost[k]; }
      b.hunger = clamp(b.hunger + dt / HUNGER_TIME * (night ? 0.4 : 1) * (adult ? 1 : 1.2), 0, 1);
      b.happy = clamp(b.happy + dt * (b.hunger < 0.5 ? 0.004 : -0.006) + dt * (aura.charm || 0) * 0.004, 0, 1);
      b.chaseCD = Math.max(0, b.chaseCD - dt);
      // grow up
      if (!adult) {
        const k = (1 + (aura.growth || 0) + (b.boost.growth ? 0.4 : 0)) * (b.hunger < 0.7 ? 1 : 0.3);
        b.age += dt / info.grow * k;
        if (b.age >= 1) this.growUp(b);
      }
      if (b.mom && (!this.list.includes(b.mom) || b.age >= 1)) b.mom = null;
      if (b.nest && b.nest.removed) b.nest = null;
      if (!b.nest && adult && Math.random() < dt * 0.2) b.nest = this.findNest(b);
      // lay eggs
      if (adult && b.sex === 'f' && b.nest && !night && b.hunger < 0.6 && b.state !== 'brood') {
        b.layT -= dt * (1 + (aura.breed || 0) + (b.boost.breed ? 0.5 : 0)) * (0.6 + b.happy * 0.6);
        const eggs = (b.nest.eggs ||= []);
        if (b.layT <= 0 && eggs.length < b.nest.def.nest.eggs) { b.state = 'toNest'; b.t = 25; this.target(b, b.nest.x + 0.5, b.nest.z + 0.5); }
      }
      this.think(b, dt, night, adult);
      this.move(b, dt, g, info);
      b.rig.root.position.set(b.x, b.y, b.z);
      b.rig.root.rotation.y = Math.PI / 2 - b.heading; // rigs face +Z
      b.rig.update?.(dt);
    }
    this.updateNests(dt);
  }

  target(b, x, z) { b.tx = x; b.tz = z; }

  think(b, dt, night, adult) {
    const game = this.game;
    b.t -= dt;
    // geese vs rampaging bears
    if (adult && b.kind === 'goose' && b.chaseCD <= 0 && b.state !== 'chase') {
      for (const bear of game.bears.list) {
        if (!bear.visible || !bear.angry || bear.def.boss) continue;
        if (Math.hypot(bear.x - b.x, bear.z - b.z) < 9) { b.state = 'chase'; b.prey = bear; b.t = 12; game.audio.play('honk', { volume: 0.5 }); game.say(this.anchor(b), 'HONK!!', { mood: 'angry', dur: 1.2, size: 's' }); break; }
      }
    }
    switch (b.state) {
      case 'chase': {
        const bear = b.prey;
        if (!bear || !bear.visible || !bear.angry || b.t <= 0) { b.state = 'wander'; b.prey = null; b.chaseCD = 15; break; }
        this.target(b, bear.x, bear.z);
        if (Math.hypot(bear.x - b.x, bear.z - b.z) < 1.3) {
          if (game.bears.scareOff?.(bear)) { game.stats.geeseChases = (game.stats.geeseChases || 0) + 1; game.emit('gooseChase', b); }
          b.state = 'wander'; b.prey = null; b.chaseCD = 20;
          this.anim(b, 'honk', false);
          game.audio.play('honk', { volume: 0.6, pitch: 1.1 });
        }
        return;
      }
      case 'toNest': {
        const s = b.nest;
        if (!s) { b.state = 'wander'; break; }
        if (Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z) < 0.35 || b.t <= 0) {
          b.state = 'brood'; b.t = 4; b.x = s.x + 0.5; b.z = s.z + 0.5; b.y = s.obj ? s.obj.position.y : b.y;
          this.anim(b, 'brood');
        }
        return;
      }
      case 'brood': {
        if (b.t <= 0) {
          this.layEgg(b);
          b.state = 'wander'; b.t = 1;
        }
        return;
      }
      case 'sleep': {
        if (!night) { b.state = 'wander'; b.t = 0.5; }
        return;
      }
      case 'eat': {
        if (b.t <= 0) { b.state = 'wander'; b.t = rand(0.5, 1.5); }
        return;
      }
      case 'bug': {
        const bug = b.bug;
        if (!bug || bug.dead || b.t <= 0) { if (bug && bug.targeted === b) bug.targeted = null; b.bug = null; b.state = 'wander'; break; }
        this.target(b, bug.x, bug.z);
        if (Math.hypot(bug.x - b.x, bug.z - b.z) < 0.32) {
          const sp = game.bugs.eat(bug, b);
          b.bug = null;
          if (sp) this.fed(b, sp);
          b.state = 'eat'; b.t = 0.9;
          this.anim(b, 'eat', false);
        }
        return;
      }
      default: break;
    }
    // wander: hungry -> hunt bugs / pellets, night -> bed, else potter about
    if (night && adult && b.state !== 'sleep') {
      if (b.nest && Math.hypot(b.nest.x + 0.5 - b.x, b.nest.z + 0.5 - b.z) > 0.5) this.target(b, b.nest.x + 0.5, b.nest.z + 0.5);
      else { b.state = 'sleep'; this.anim(b, 'sleep'); return; }
    }
    if (b.hunger > 0.3 && b.t <= 0 && game.bugs) {
      const g = game.grid;
      const swimming = g.isWater(Math.floor(b.x), Math.floor(b.z));
      const bug = game.bugs.nearestFor(b.x, b.z, b.hunger > 0.7 ? 11 : 7, { swimming }) || game.bugs.nearestFor(b.x, b.z, 6, { swimming: !swimming });
      if (bug) { b.state = 'bug'; b.bug = bug; bug.targeted = b; b.t = 10; return; }
      if (swimming) {
        const p = game.food.nearestPellet(b.x, b.z, 3, g.regionAt(b.x, b.z));
        if (p && Math.hypot(p.x - b.x, p.z - b.z) < 0.3) { game.food.eatPellet(p); b.hunger = Math.max(0, b.hunger - 0.06); this.anim(b, 'eat', false); b.state = 'eat'; b.t = 0.6; return; }
        if (p) { this.target(b, p.x, p.z); b.t = 1; return; }
      }
    }
    if (b.t <= 0 || Math.hypot(b.tx - b.x, b.tz - b.z) < 0.2) {
      b.t = b.mom ? rand(0.6, 1.4) : rand(2, 6);
      if (!b.mom && Math.random() < 0.25) { b.t = rand(1.5, 3); this.target(b, b.x, b.z); this.anim(b, Math.random() < 0.5 ? 'peck' : 'idle', Math.random() < 0.5); if (Math.random() < 0.2) this.call(b); return; }
      const p = this.wanderPoint(b);
      this.target(b, p.x, p.z);
    }
  }

  call(b) {
    const goose = b.kind === 'goose';
    this.game.audio.play('honk', { volume: goose ? 0.3 : 0.18, pitch: goose ? 1 : b.age < 1 ? 2.4 : 1.7 });
    this.anim(b, b.age < 1 ? 'peep' : 'honk', false);
  }

  fed(b, sp) {
    b.hunger = Math.max(0, b.hunger - sp.food * 1.8);
    if (sp.effect) b.boost[sp.effect] = 90;
    b.happy = Math.min(1, b.happy + 0.08);
    this.game.particles.sparkle(b.x, b.y + 0.4, b.z, 3, 0xd8ffa0);
    this.game.audio.play('nibble', { volume: 0.3, pitch: 1.5 });
  }

  move(b, dt, g, info) {
    const busy = b.state === 'brood' || b.state === 'sleep' || b.state === 'eat';
    const dx = b.tx - b.x, dz = b.tz - b.z;
    const d = Math.hypot(dx, dz);
    const wet = g.isWater(Math.floor(b.x), Math.floor(b.z));
    let want = 0;
    if (!busy && d > 0.08) {
      want = (wet ? info.swim : info.speed) * (b.state === 'chase' ? 2.6 : b.state === 'bug' ? 1.5 : 1) * (b.age < 1 ? 0.85 : 1);
      const h = Math.atan2(dz, dx);
      let dh = h - b.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      b.heading += dh * Math.min(1, dt * 7);
    }
    b.speed += (want - b.speed) * Math.min(1, dt * 5);
    if (b.speed > 0.01) {
      const st = Math.min(b.speed * dt, d);
      const nx = b.x + Math.cos(b.heading) * st, nz = b.z + Math.sin(b.heading) * st;
      if (this.walkable(nx, nz)) { b.x = nx; b.z = nz; }
      else { b.t = 0; b.tx = b.x; b.tz = b.z; b.speed = 0; }
    }
    const nowWet = g.isWater(Math.floor(b.x), Math.floor(b.z));
    const gy = nowWet ? WATER_Y : g.groundAt(b.x, b.z);
    b.y += (gy - b.y) * Math.min(1, dt * 10);
    if (nowWet !== wet && Math.random() < 0.7) this.game.particles.splash(b.x, b.z, 4, 0.4);
    if (busy) return;
    if (b.state === 'chase') this.anim(b, 'chase');
    else if (b.speed > 0.15) this.anim(b, nowWet ? 'swim' : (b.age < 1 && b.mom ? 'follow' : 'waddle'));
    else if (!b.anim || b.anim === 'swim' || b.anim === 'waddle' || b.anim === 'follow' || b.anim === 'chase') this.anim(b, nowWet ? 'swim' : 'idle');
    if (nowWet && b.speed > 0.2 && Math.random() < dt * 2) this.game.world.sim?.wake?.(b.x, b.z, b.speed, 0.08, dt);
  }

  growUp(b) {
    b.age = 1;
    b.mom = null;
    b.nest = this.findNest(b);
    this.attach(b);
    this.game.particles.confetti(b.x, b.y + 0.6, b.z, 18);
    this.game.audio.play('levelup', { volume: 0.35, pitch: 1.4 });
    this.game.say(this.anchor(b), `${b.name} is all grown up!`, { mood: 'happy', dur: 2.2, size: 's' });
    this.game.emit('livestockGrew', b);
  }

  // ------------------------------------------------------------ nests & eggs
  layEgg(b) {
    const game = this.game;
    const s = b.nest;
    if (!s) return;
    const eggs = (s.eggs ||= []);
    if (eggs.length >= s.def.nest.eggs) return;
    const info = KIND_INFO[b.kind];
    const aura = game.bugs ? game.bugs.auraAt(s.x + 0.5, s.z + 0.5) : {};
    const fertile = this.list.some((o) => o.kind === b.kind && o.sex === 'm' && o.age >= 1);
    const luck = (aura.luck || 0) + (b.boost.luck ? 0.4 : 0);
    const golden = Math.random() < GOLDEN_EGG.chance * (1 + luck * 4) * (b.golden ? 3 : 1);
    const big = (aura.size || 0) + (b.boost.size ? 0.3 : 0);
    eggs.push({ breed: b.breed, kind: b.kind, fertile, golden, t: info.incubate, total: info.incubate, size: clamp(b.size + rand(-0.06, 0.08) + big * 0.18, 0.85, 1.45) });
    b.layT = info.layEvery * rand(0.85, 1.25);
    b.hunger = Math.min(1, b.hunger + 0.1);
    this.nestVisual(s);
    game.particles.sparkle(s.x + 0.5, game.grid.groundAt(s.x + 0.5, s.z + 0.5) + 0.3, s.z + 0.5, golden ? 10 : 4, golden ? 0xffd040 : 0xfff2c0);
    game.audio.play('pop_in', { volume: 0.3, pitch: 1.4 });
    if (golden) game.notify(`${b.name} laid a GOLDEN egg!`, 'excited');
    game.emit('eggLaid', { bird: b, nest: s, golden });
  }

  nestVisual(s) {
    const n = s.nestRig;
    if (!n) return;
    const eggs = s.eggs || [];
    try { n.setEggs?.(eggs.length); eggs.forEach((e, i) => n.setGolden?.(i, !!e.golden)); } catch { /* ignore */ }
  }

  updateNests(dt) {
    const game = this.game;
    for (const s of this.nests()) {
      s.nestRig?.update?.(dt);
      const eggs = s.eggs || [];
      if (!eggs.length) continue;
      const aura = game.bugs ? game.bugs.auraAt(s.x + 0.5, s.z + 0.5) : {};
      const brooding = this.list.some((b) => b.nest === s && b.state === 'brood');
      s.nestRig?.setBrooding?.(brooding);
      eggs.forEach((e, i) => s.nestRig?.setHatching?.(i, e.fertile && e.t < 6));
      for (let i = eggs.length - 1; i >= 0; i--) {
        const e = eggs[i];
        if (!e.fertile) continue;
        e.t -= dt * (1 + (aura.hatch || 0));
        if (e.t <= 0) {
          eggs.splice(i, 1);
          this.hatch(s, e);
        }
      }
    }
  }

  hatch(s, e) {
    const game = this.game;
    const x = s.x + 0.5 + rand(-0.3, 0.3), z = s.z + 0.5 + rand(-0.3, 0.3);
    const mom = this.list.find((b) => b.nest === s && b.sex === 'f' && b.age >= 1) || null;
    const b = this.spawn(e.breed, { age: 0, x, z, nest: s, size: e.size, golden: e.golden });
    if (!b) return;
    b.mom = mom;
    this.nestVisual(s);
    game.particles.confetti(x, game.grid.groundAt(x, z) + 0.4, z, 14);
    game.audio.play('egg_crack', { volume: 0.4, pitch: 1.5 });
    game.say(this.anchor(b), `Peep! A ${e.golden ? 'GOLDEN ' : ''}${KIND_INFO[b.kind].baby.toLowerCase()}!`, { mood: 'excited', dur: 2, size: 's' });
    game.emit('livestockHatched', b);
  }

  eggValue(e) { return Math.round(BREEDS[e.breed].eggValue * e.size * (e.golden ? GOLDEN_EGG.mult : 1)); }

  // tap a nest: sell everything in it
  collect(s) {
    const game = this.game;
    const eggs = s.eggs || [];
    if (!eggs.length) return 0;
    const total = eggs.reduce((a, e) => a + this.eggValue(e), 0);
    s.eggs = [];
    this.nestVisual(s);
    game.earnMisc(total, 'eggs');
    game.stats.eggsSold = (game.stats.eggsSold || 0) + eggs.length;
    game.ui?.floatTextAt?.(s.x + 0.5, 1.1, s.z + 0.5, `+${total}`, '#ffd84a');
    game.audio.play('coins', { volume: 0.5 });
    game.emit('eggsCollected', { nest: s, n: eggs.length, total });
    return total;
  }

  beauty() {
    let b = 0;
    for (const x of this.list) b += x.age >= 1 ? 0.6 * (0.5 + x.happy) : 0.4;
    return Math.min(12, b);
  }

  anchor(b) { return { getWorldPos: (v) => v.set(b.x, b.y + (b.kind === 'goose' ? 1.25 : 0.95) * b.size * (b.age < 1 ? 0.6 : 1), b.z) }; }

  // structure removed / built hooks
  onNestBuilt(s) {
    for (const b of this.list) if (!b.nest && b.kind === s.def.nest.kind && b.age >= 1) b.nest = this.findNest(b);
  }

  // ------------------------------------------------------------ e-Buy
  ebuyListings(L) {
    const game = this.game;
    const seller = { duck: { name: 'Quack Shack', stars: 4.8 }, goose: { name: 'HonkHaus', stars: 4.6 } };
    for (const [id, B] of Object.entries(BREEDS)) {
      const ok = game.isUnlocked(B.unlock);
      const locked = ok ? null : { reason: game.lockReason(B.unlock) || 'Coming soon', icon: 'map' };
      const k = KIND_INFO[B.kind].name;
      L.push({ id: 'bird_pair_' + id, cat: 'farm', kind: 'bird', breed: id, pair: true, title: `${B.name} PAIR!! ${k === 'Goose' ? 'gander + goose' : 'drake + hen'} (they lay EGGS)`, sub: `${B.name} pair`, price: Math.round(B.price * 1.8), oldPrice: B.price * 5, badges: id === 'mallard' ? ['hot'] : [], seller: { ...seller[B.kind], sold: 120 + id.length * 31 }, locked, eta: 'Moose Express', desc: B.desc });
      L.push({ id: 'bird_hen_' + id, cat: 'farm', kind: 'bird', breed: id, sex: 'f', title: `${B.name} hen - lays eggs daily*`, sub: `${B.name} hen`, price: B.price, oldPrice: B.price * 3, badges: [], seller: { ...seller[B.kind], sold: 80 + id.length * 17 }, locked, eta: 'Moose Express', desc: B.desc });
    }
  }

  listingIcon(l) { return l.kind === 'bird' ? 'egg' : null; }

  // ------------------------------------------------------------ save
  serialize() {
    const nests = this.nests().filter((s) => s.eggs?.length).map((s) => ({ x: s.x, z: s.z, eggs: s.eggs }));
    return {
      birds: this.list.map((b) => ({ breed: b.breed, sex: b.sex, age: +b.age.toFixed(3), hunger: +b.hunger.toFixed(2), size: b.size, golden: b.golden, name: b.name, x: +b.x.toFixed(2), z: +b.z.toFixed(2), happy: +b.happy.toFixed(2), nest: b.nest ? [b.nest.x, b.nest.z] : null })),
      nests,
    };
  }

  clear() {
    for (const b of this.list) { this.group.remove(b.rig.root); b.rig.dispose?.(); }
    this.list.length = 0;
  }

  load(d) {
    this.clear();
    if (!d) return;
    const at = (xz) => (xz ? this.game.structures.list.find((s) => s.x === xz[0] && s.z === xz[1] && s.def.nest) : null);
    for (const n of d.nests || []) { const s = at([n.x, n.z]); if (s) { s.eggs = n.eggs; } }
    for (const o of d.birds || []) {
      const b = this.spawn(o.breed, { sex: o.sex, age: o.age, x: o.x, z: o.z, nest: at(o.nest), name: o.name, size: o.size, golden: o.golden });
      if (b) { b.hunger = o.hunger ?? 0.3; b.happy = o.happy ?? 0.6; }
    }
    for (const s of this.nests()) this.nestVisual(s);
  }
}
