// Bears: nightly waves of hungry office workers. They run down the mountain
// trail, cannonball into the pond, chase fish, snack on honey/syrup/berries/
// seaweed, pay coins + leave reviews, or rampage and smash stuff.
import * as THREE from 'three';
import { BEAR_TYPES, FIRST_NAMES, DEPARTMENTS, WANT_INFO, REVIEWS, WANT_COMPLAINTS } from '../data/bears.js';
import { SPECIES_BY_ID } from '../data/species.js';
import { BearRig } from '../entities/bearModels.js';
import { buildFishGeometry } from '../entities/fishModels.js';
import { WATER_Y, KIND } from '../world/grid.js';
import { pick, clamp, angleDiff, damp } from '../core/rng.js';

const COIN_PER_MEAL = 7;
const heldFishGeo = new Map();
function heldGeo(sp, golden) {
  const k = sp.id + (golden ? '*' : '');
  if (!heldFishGeo.has(k)) heldFishGeo.set(k, buildFishGeometry(sp, golden).geo);
  return heldFishGeo.get(k);
}

let nextId = 1;
const PATIENCE_STATES = new Set(['walk', 'hunt', 'search', 'walkDirect']);
const CLOSING_STATES = new Set(['walk', 'hunt', 'search']);

export class BearSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.trail = game.world.trail;
    this.trailLen = [0];
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      this.trailLen.push(this.trailLen[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2], (b[1] - a[1]) * 0.5));
    }
    this.trailTotal = this.trailLen[this.trailLen.length - 1];
    const end = this.trail[this.trail.length - 1];
    this.entryTile = [Math.floor(end[0]), Math.floor(end[2])];
    this.fieldCache = new Map();
    this.time = 0;
    this.waveActive = false;
  }

  get grid() { return this.game.grid; }

  // ------------------------------------------------------------ waves
  planWave(day) {
    const game = this.game;
    const dow = (day - 1) % 7;
    if (dow === 6) return { dayOff: true, bears: [] };
    const r = game.state.rating;
    const ratingF = r >= 4.5 ? 1.3 : r >= 4 ? 1.15 : r >= 3 ? 1 : r >= 2 ? 0.85 : 0.7;
    let n = 3 + day * 0.8 + Math.max(0, day - 10) * 0.45;
    n = Math.round(n * ratingF * game.mods.bearMult);
    n = clamp(n, 3, 64);
    const types = Object.entries(BEAR_TYPES).filter(([, d]) => d.weight > 0 && d.fromDay <= day);
    const bears = [];
    const species = game.availableSpecies();
    const addBear = (typeId, extra = {}) => {
      const d = BEAR_TYPES[typeId];
      const b = { type: typeId, wants: [...(d.wants || [])], prefer: null, ...extra };
      if (!extra.prefer && day >= 4 && species.length > 1 && Math.random() < 0.18 && !d.boss) b.prefer = pick(species);
      bears.push(b);
      return b;
    };
    if (dow === 5 && day >= 6) {
      // Saturday family picnic: parents + cubs
      const fams = Math.max(2, Math.round(n / 2.5));
      for (let i = 0; i < fams; i++) {
        addBear(pick(['office', 'tourist', 'intern', 'office']).replace('tourist', day >= 9 ? 'tourist' : 'office'));
        const cubs = 1 + (Math.random() < 0.5 ? 1 : 0);
        for (let c = 0; c < cubs; c++) addBear('cub');
      }
    } else {
      for (let i = 0; i < n; i++) {
        let tot = 0;
        for (const [, d] of types) tot += d.weight;
        let x = Math.random() * tot;
        let id = 'office';
        for (const [tid, d] of types) { x -= d.weight; if (x <= 0) { id = tid; break; } }
        addBear(id);
      }
      if (day >= 7 && Math.random() < 0.3) {
        const best = species.slice().sort((a, b) => SPECIES_BY_ID[b].value - SPECIES_BY_ID[a].value)[0];
        addBear('critic', { prefer: best });
      }
      if (dow === 4 && day >= 5) {
        const best = species.slice().sort((a, b) => SPECIES_BY_ID[b].value * SPECIES_BY_ID[b].meal - SPECIES_BY_ID[a].value * SPECIES_BY_ID[a].meal)[0];
        const wants = game.isUnlocked('r_bees') ? ['honey'] : [];
        addBear('ceo', { prefer: best, wants });
      }
    }
    // stagger arrivals in little groups
    let t = 0.5;
    bears.sort(() => Math.random() - 0.5);
    const ceo = bears.findIndex((b) => b.type === 'ceo');
    if (ceo >= 0) bears.push(bears.splice(ceo, 1)[0]);
    for (const b of bears) {
      b.delay = t;
      t += Math.random() < 0.35 ? 0.35 : 1.1 + Math.random() * 1.6;
      if (b.type === 'ceo') b.delay += 3;
    }
    return { dayOff: false, bears };
  }

  startWave(plan) {
    for (const p of plan.bears) this.spawnBear(p);
    this.waveActive = true;
  }

  // A couple of bears sneak out on their lunch break (mid-day customers).
  planLunch(day) {
    if (day < 2 || (day - 1) % 7 >= 5) return [];
    const types = Object.entries(BEAR_TYPES).filter(([, d]) => d.weight > 0 && d.fromDay <= day && !d.boss && d.item !== 'lunchbox');
    const n = day >= 6 ? 2 : 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const [type, d] = types[Math.floor(Math.random() * types.length)];
      out.push({ type, wants: [...(d.wants || [])], prefer: null, delay: 0.5 + i * 2.5, lunch: true });
    }
    return out;
  }

  startLunch(list) {
    for (const p of list) {
      const b = this.spawnBear(p);
      b.lunch = true;
      b.appetite = Math.max(1, b.appetite - 1);
    }
  }

  spawnBear(p) {
    const def = BEAR_TYPES[p.type];
    const [a0, a1] = def.appetite;
    const b = {
      id: nextId++, typeId: p.type, def, name: pick(FIRST_NAMES), dept: def.critic ? 'The Bear Street Journal' : p.type === 'ceo' ? 'Chairman' : pick(DEPARTMENTS),
      x: this.trail[0][0], y: this.trail[0][1], z: this.trail[0][2], heading: Math.PI / 2, speed: 0,
      state: 'queued', t: p.delay, appetite: a0 + Math.floor(Math.random() * (a1 - a0 + 1)), eaten: 0, coins: 0, tips: 0,
      wants: p.wants.map((k) => ({ kind: k, done: false })), prefer: p.prefer,
      patience: def.patience * this.game.mods.patienceMult, maxPatience: def.patience * this.game.mods.patienceMult,
      trailD: 0, path: null, pathI: 0, goal: null, fish: null, struct: null,
      rampLeft: 0, angry: false, inWater: false, region: -1, phase: Math.random() * 6, gotGolden: false, preferMiss: 0,
      rig: null, visible: false, flip: Math.random() < 0.55, jump: null, searchT: 0, stuckT: 0, lastX: 0, lastZ: 0, bubble: null,
    };
    if (p.type === 'cub') b.appetite = 1;
    this.list.push(b);
    return b;
  }

  activeCount() { return this.list.filter((b) => b.state !== 'queued').length; }
  remaining() { return this.list.length; }

  inWater() {
    const out = this._inWater || (this._inWater = []);
    out.length = 0;
    for (const b of this.list) if (b.visible && b.inWater && !b.jump) out.push(b);
    return out;
  }

  // ------------------------------------------------------------ helpers
  tileOf(b) { return [Math.floor(b.x), Math.floor(b.z)]; }
  tileIdx(x, z) { return z * this.grid.w + x; }

  fieldFrom(x, z) {
    return this.grid.bearField([this.tileIdx(x, z)]);
  }

  // backtrack a path from goal tile to the bear using a field computed from the bear
  pathTo(field, gx, gz) {
    const g = this.grid;
    if (!g.inb(gx, gz) || !isFinite(field[this.tileIdx(gx, gz)])) return null;
    const path = [[gx, gz]];
    let cx = gx, cz = gz, guard = 0;
    while (field[this.tileIdx(cx, cz)] > 0 && guard++ < 400) {
      const n = g.descend(field, cx, cz);
      if (!n) break;
      [cx, cz] = n;
      path.push([cx, cz]);
    }
    path.reverse();
    path.shift(); // drop the tile we're on
    return path;
  }

  groundY(b, x = b.x, z = b.z) {
    const g = this.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.inb(tx, tz)) return 0;
    const i = this.tileIdx(tx, tz);
    if (g.kind[i] === KIND.WATER) return Math.max(g.height[i], WATER_Y - 0.95 * b.def.scale);
    return g.height[i];
  }

  satisfaction(b) {
    const fishPart = Math.min(1, b.eaten / b.appetite);
    if (!b.wants.length) return fishPart;
    const w = b.wants.filter((x) => x.done).length / b.wants.length;
    return fishPart * 0.7 + w * 0.3;
  }

  // ------------------------------------------------------------ decisions
  decide(b) {
    const g = this.grid;
    const [bx, bz] = this.tileOf(b);
    const field = this.fieldFrom(bx, bz);
    b.goal = null; b.fish = null; b.struct = null; b.path = null;
    if (b.angry) return this.decideSmash(b, field);
    // 1) fish
    if (b.eaten < b.appetite) {
      const fishSys = this.game.fish;
      let best = null, bs = Infinity;
      for (const f of fishSys.list) {
        if (f.jump || this.game.structures.isSheltered(f.x, f.z)) continue;
        const d = field[this.tileIdx(Math.floor(f.x), Math.floor(f.z))];
        if (!isFinite(d)) continue;
        let s = d;
        if (b.prefer && f.sp.id !== b.prefer) s += 25;
        if (!f.adult) s += 6;
        s += Math.random() * 3;
        if (s < bs) { bs = s; best = f; }
      }
      if (best) {
        if (b.inWater && best.region === b.region) { b.fish = best; b.state = 'hunt'; return; }
        const path = this.pathTo(field, Math.floor(best.x), Math.floor(best.z));
        if (path) { b.goal = { kind: 'fish' }; b.fish = best; b.path = path; b.pathI = 0; b.state = 'walk'; return; }
      }
    }
    // 2) wants
    for (const w of b.wants) {
      if (w.done) continue;
      const cand = this.game.structures.list.filter((s) => s.built && s.def.food && s.def.food.kind === w.kind && s.stock >= 1);
      let best = null, bp = null, bd = Infinity;
      for (const s of cand) {
        const spot = this.approachTile(field, s);
        if (!spot) continue;
        if (spot.d < bd) { bd = spot.d; best = s; bp = spot; }
      }
      if (best) {
        b.goal = { kind: 'snack', want: w }; b.struct = best;
        b.path = this.pathTo(field, bp.x, bp.z) || [];
        b.pathI = 0; b.state = 'walk';
        return;
      }
    }
    // 3) nothing left to do
    if (b.eaten >= b.appetite && b.wants.every((w) => w.done)) { this.beginPay(b); return; }
    if (b.eaten >= b.appetite && this.satisfaction(b) >= 0.55 && b.patience < b.maxPatience * 0.6) { this.beginPay(b); return; }
    b.state = 'search';
    b.searchT = 1.5 + Math.random();
    b.searchH = Math.random() * Math.PI * 2;
  }

  // tile the bear should stand on to use / smash structure s
  approachTile(field, s) {
    const g = this.grid;
    const own = this.tileIdx(s.x, s.z);
    if (g.bearPassable(s.x, s.z) && isFinite(field[own])) return { x: s.x, z: s.z, d: field[own] };
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = s.x + dx, nz = s.z + dz;
      if (!g.inb(nx, nz)) continue;
      const d = field[this.tileIdx(nx, nz)];
      if (isFinite(d) && (!best || d < best.d)) best = { x: nx, z: nz, d };
    }
    return best;
  }

  decideSmash(b, field) {
    if (b.rampLeft <= 0) return this.beginLeave(b);
    const targets = this.game.structures.smashTargets();
    let best = null, bp = null, bd = Infinity;
    for (const s of targets) {
      const spot = this.approachTile(field, s);
      if (!spot) continue;
      const d = spot.d + (s.def.blocksFish ? -4 : 0); // bears love breaking dams
      if (d < bd) { bd = d; best = s; bp = spot; }
    }
    if (!best) { b.rampLeft = 0; b.state = 'stomp'; b.t = 1.8; return; }
    b.goal = { kind: 'smash' }; b.struct = best;
    b.path = this.pathTo(field, bp.x, bp.z) || [];
    b.pathI = 0; b.state = 'walk';
  }

  startRampage(b) {
    const game = this.game;
    b.angry = true;
    b.rampLeft = Math.max(1, (b.def.rampage || 1) - game.mods.rampageReduce);
    if (Math.random() < game.mods.calmChance) {
      b.rampLeft = 0;
      game.ui?.floatText(b, 'Took a deep breath...', '#b8e0ff');
    }
    b.rig?.setMaterial('angry');
    game.audio.play('roar', { volume: 0.8, pitch: 1.1 - b.def.scale * 0.15 });
    game.rig.shake = Math.max(game.rig.shake, 0.7);
    game.particles.sprite('anger', b.x, b.y + 2.6 * b.def.scale, b.z, { vy: 0.6, life: 1.4, size: 0.5 });
    game.onRampage(b);
    this.decide(b);
  }

  beginPay(b) {
    b.state = 'pay';
    b.t = 1.5;
    b.paid = false;
    b.path = null;
  }

  // One shared field from the trail entry, reused by every bear heading home.
  entryField() {
    const g = this.grid;
    if (this._entryVer !== g.version || !this._entryField) {
      const [ex, ez] = this.entryTile;
      this._entryField = g.bearField([this.tileIdx(ex, ez)], this._entryField);
      this._entryVer = g.version;
    }
    return this._entryField;
  }

  beginLeave(b) {
    if (!b.review) this.finishReview(b);
    const g = this.grid;
    const field = this.entryField();
    let [cx, cz] = this.tileOf(b);
    b.path = null;
    if (isFinite(field[this.tileIdx(cx, cz)])) {
      const path = [];
      let guard = 0;
      while (field[this.tileIdx(cx, cz)] > 0 && guard++ < 400) {
        const n = g.descend(field, cx, cz);
        if (!n) break;
        [cx, cz] = n;
        path.push([cx, cz]);
      }
      b.path = path;
    }
    b.goal = { kind: 'leave' };
    b.pathI = 0;
    b.state = b.path ? 'walk' : 'walkDirect';
    if (b.bubble) b.bubbleFade = true;
  }

  finishReview(b) {
    const game = this.game;
    const sat = this.satisfaction(b);
    let stars = b.angry ? 0 : sat >= 0.97 ? 5 : sat >= 0.8 ? 4 : sat >= 0.6 ? 3 : sat >= 0.4 ? 2 : 1;
    if (!b.angry && b.gotGolden) stars = Math.min(5, stars + 1);
    if (!b.angry && b.prefer && b.preferMiss > 0 && stars > 3) stars--;
    let text = pick(REVIEWS[stars]);
    const missing = b.wants.find((w) => !w.done);
    if (missing && stars <= 3) text = pick(WANT_COMPLAINTS[missing.kind]);
    else if (b.prefer && b.preferMiss > 0 && stars <= 3) text = `${pick(WANT_COMPLAINTS.species)} (wanted ${SPECIES_BY_ID[b.prefer].name})`;
    if (b.gotGolden && !b.angry) text = 'A GOLDEN fish?! ' + text;
    const review = { stars, text, name: b.name, dept: b.dept, type: b.typeId, weight: b.def.reviewWeight || 1, day: game.state.day };
    b.review = review;
    game.addReview(review, b);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    const game = this.game;
    const rushOver = game.state.hour >= 19.6;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (b.state === 'queued') {
        b.t -= dt;
        if (b.t <= 0) {
          b.state = 'commute';
          b.trailD = 0;
          this.show(b);
          if (Math.random() < 0.4) game.audio.play('growl', { volume: 0.25, pitch: 1.1 });
        }
        continue;
      }
      if (rushOver && !b.angry && CLOSING_STATES.has(b.state) && b.goal?.kind !== 'leave' && b.goal?.kind !== 'smash') {
        // closing time: everyone wraps up, staggered so they don't all decide in one frame
        if (!b.closing) { b.closing = true; b.patience = Math.min(b.patience, 0.2 + ((b.id * 0.37) % 1) * 3); }
      }
      this.step(b, dt);
      if (b.removed) {
        this.hide(b);
        this.list.splice(i, 1);
      }
    }
    // separation between bears
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.visible || a.jump || a.state === 'commute' || a.state === 'commuteUp') continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const c = this.list[j];
        if (!c.visible || c.jump || c.state === 'commute' || c.state === 'commuteUp') continue;
        const dx = c.x - a.x, dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        const r = 0.55 * (a.def.scale + c.def.scale);
        if (d2 < r * r && d2 > 1e-5) {
          const d = Math.sqrt(d2), push = (r - d) * 0.5;
          const px = (dx / d) * push, pz = (dz / d) * push;
          if (this.grid.bearPassable(Math.floor(a.x - px), Math.floor(a.z - pz))) { a.x -= px; a.z -= pz; }
          if (this.grid.bearPassable(Math.floor(c.x + px), Math.floor(c.z + pz))) { c.x += px; c.z += pz; }
        }
      }
    }
    if (this.waveActive && this.list.length === 0) {
      this.waveActive = false;
      game.onWaveComplete();
    }
  }

  step(b, dt) {
    const game = this.game;
    const g = this.grid;
    b.t -= dt;
    if (!b.angry && PATIENCE_STATES.has(b.state) && b.goal?.kind !== 'leave') {
      b.patience -= dt * (b.state === 'search' ? 1.6 : 1);
      if (b.patience <= 0) {
        b.patience = 0;
        if (this.satisfaction(b) >= 0.55) this.beginPay(b);
        else this.startRampage(b);
      }
    }
    if (b.jump) { this.updateJump(b, dt); return; }
    let moving = false;
    const scale = b.def.scale;
    switch (b.state) {
      case 'commute': {
        b.trailD += dt * 5.2 * b.def.speed;
        moving = true;
        if (b.trailD >= this.trailTotal) {
          b.trailD = this.trailTotal;
          const end = this.trail[this.trail.length - 1];
          b.x = end[0]; b.z = end[2]; b.y = end[1];
          this.decide(b);
        } else this.placeOnTrail(b, dt);
        break;
      }
      case 'commuteUp': {
        b.trailD -= dt * 3.6 * b.def.speed;
        moving = true;
        if (b.trailD <= 0) { b.removed = true; return; }
        this.placeOnTrail(b, dt, true);
        break;
      }
      case 'walk': moving = this.followPath(b, dt); break;
      case 'walkDirect': {
        const end = this.trail[this.trail.length - 1];
        moving = this.moveToward(b, end[0], end[2], dt, 2.2, true);
        if (Math.hypot(end[0] - b.x, end[2] - b.z) < 0.3) { b.state = 'commuteUp'; b.trailD = this.trailTotal; }
        break;
      }
      case 'hunt': {
        const f = b.fish;
        if (!f || f.dead || f.region !== b.region || game.structures.isSheltered(f.x, f.z)) {
          b.fish = game.fish.nearestFor(b.x, b.z, b.region, b.prefer);
          if (!b.fish) { this.decide(b); break; }
        }
        const t = b.fish;
        const dist = Math.hypot(t.x - b.x, t.z - b.z);
        b.lungeCd = (b.lungeCd || 0) - dt;
        if (b.lunge > 0) {
          // pounce! a quick dash at where the fish is heading
          b.lunge -= dt;
          const px = t.x + Math.cos(t.heading) * t.speed * 0.2, pz = t.z + Math.sin(t.heading) * t.speed * 0.2;
          if (!this.moveToward(b, px, pz, dt, 6.5, false)) b.lunge = 0;
          if (dist < 0.75 * scale + 0.35) { b.lunge = 0; this.catchFish(b, t); break; }
          if (b.lunge <= 0) { game.particles.splash(b.x, b.z, 8, 0.7); b.lungeCd = 0.9 + Math.random() * 0.6; }
          moving = true;
          break;
        }
        if (dist < 1.9 && b.lungeCd <= 0) {
          b.lunge = 0.32;
          game.particles.splash(b.x, b.z, 6, 0.6);
          if (Math.random() < 0.5) game.audio.play('splash', { volume: 0.3, pitch: 0.8 });
          break;
        }
        const blocked = !this.moveToward(b, t.x, t.z, dt, 2.4 * b.def.speed, false);
        moving = true;
        if (blocked) { this.decide(b); break; }
        if (dist < 0.6 * scale + 0.3) this.catchFish(b, t);
        break;
      }
      case 'eat': {
        if (!b.chomped1 && b.t < 0.95) { b.chomped1 = true; game.audio.play('chomp', { volume: 0.6, pitch: 1.15 - scale * 0.2 }); }
        if (!b.chomped2 && b.t < 0.45) {
          b.chomped2 = true;
          game.audio.play('chomp', { volume: 0.55, pitch: 1.05 - scale * 0.2 });
          game.particles.debris(b.x + Math.sin(b.heading) * 0.5, b.y + 1.4 * scale, b.z + Math.cos(b.heading) * 0.5, 4, [0xe8e0d0, 0xffffff, 0xc8c0b0]);
        }
        if (b.t <= 0) {
          b.rig.hold(null);
          b.chomped1 = b.chomped2 = false;
          if (b.eaten >= b.appetite) this.decide(b);
          else { b.state = 'hunt'; b.fish = null; }
        }
        break;
      }
      case 'snack': {
        if (b.t <= 0) {
          const s = b.struct;
          if (s && !s.removed && game.structures.consume(s, 1)) {
            b.goal.want.done = true;
            const info = WANT_INFO[b.goal.want.kind];
            b.tips += info.bonus * b.def.pay;
            game.audio.play('review_good', { volume: 0.25, pitch: 1.4 });
            game.particles.sprite('heart', b.x, b.y + 2.4 * scale, b.z, { vy: 0.7, life: 1, size: 0.3 });
            if (b.goal.want.kind === 'honey') game.audio.play('bees', { volume: 0.3 });
          }
          this.decide(b);
        }
        break;
      }
      case 'search': {
        moving = true;
        b.searchT -= dt;
        const hx = b.x + Math.cos(b.searchH) * 0.5, hz = b.z + Math.sin(b.searchH) * 0.5;
        if (!this.moveToward(b, hx, hz, dt, 1.4, false)) b.searchH += Math.PI * 0.7;
        if (b.searchT <= 0) { this.decide(b); if (b.state === 'search') b.searchT = 2; }
        if (Math.random() < dt * 0.4) game.particles.sprite('question', b.x, b.y + 2.5 * scale, b.z, { vy: 0.4, life: 1, size: 0.35 });
        break;
      }
      case 'smash': {
        if (!b.smashed && b.t < 0.45) {
          b.smashed = true;
          const s = b.struct;
          if (s && !s.removed) {
            game.structures.damage(s, 3);
            game.rig.shake = Math.max(game.rig.shake, 0.5);
            game.audio.play('smash', { volume: 0.55 });
          }
        }
        if (b.t <= 0) {
          b.smashed = false;
          b.rampLeft--;
          this.decide(b);
        }
        break;
      }
      case 'stomp': {
        moving = true;
        if (Math.random() < dt * 2) game.particles.sprite('anger', b.x, b.y + 2.5 * scale, b.z, { vy: 0.5, life: 0.9, size: 0.4 });
        if (b.t <= 0) this.beginLeave(b);
        break;
      }
      case 'pay': {
        if (!b.paid && b.t < 1.1) {
          b.paid = true;
          this.finishReview(b);
          if (!b.angry) {
            const stars = b.review ? b.review.stars : 3;
            const tip = stars >= 5 ? 0.25 : stars >= 4 ? 0.1 : 0;
            const tm = game.mods.tipMult;
            const total = Math.round((b.coins * (1 + tip * tm) + b.tips * tm) * game.mods.payMult);
            game.earn(total, b);
          }
        }
        if (b.t <= 0) this.beginLeave(b);
        break;
      }
    }
    // stuck detection
    if (moving && (b.state === 'walk' || b.state === 'hunt')) {
      const md = Math.hypot(b.x - b.lastX, b.z - b.lastZ);
      b.stuckT = md < 0.02 ? b.stuckT + dt : Math.max(0, b.stuckT - dt);
      if (b.stuckT > 2.5) { b.stuckT = 0; if (b.goal?.kind === 'leave') b.state = 'walkDirect'; else this.decide(b); }
    }
    b.lastX = b.x; b.lastZ = b.z;
    // water state
    const tx = Math.floor(b.x), tz = Math.floor(b.z);
    const wasWater = b.inWater;
    b.inWater = g.isWater(tx, tz) && b.state !== 'commute' && b.state !== 'commuteUp';
    b.region = b.inWater ? g.region[this.tileIdx(tx, tz)] : -1;
    if (b.inWater && b.region < 0) {
      // standing in a gate/dam gap: use neighbour region
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = g.inb(tx + dx, tz + dz) ? g.region[this.tileIdx(tx + dx, tz + dz)] : -1;
        if (r >= 0) { b.region = r; break; }
      }
    }
    if (b.state !== 'commute' && b.state !== 'commuteUp') {
      const gy = this.groundY(b);
      b.y = damp(b.y, gy, wasWater === b.inWater ? 14 : 8, dt);
    }
    if (moving) {
      b.phase += dt * (b.inWater ? 7 : 11) * (0.6 + b.speed * 0.25);
      if (b.inWater && Math.random() < dt * 3) game.particles.ripple(b.x, b.z, 0.7 * scale, 1, 0.3);
      if (!b.inWater && (b.state === 'commute' || b.state === 'walk') && Math.random() < dt * 4) game.particles.dust(b.x, b.y, b.z, 1);
    }
    b.moving = moving;
  }

  placeOnTrail(b, dt, up = false) {
    const d = b.trailD;
    let i = 1;
    while (i < this.trailLen.length - 1 && this.trailLen[i] < d) i++;
    const a = this.trail[i - 1], c = this.trail[i];
    const seg = this.trailLen[i] - this.trailLen[i - 1] || 1;
    const t = clamp((d - this.trailLen[i - 1]) / seg, 0, 1);
    const nx = a[0] + (c[0] - a[0]) * t, nz = a[2] + (c[2] - a[2]) * t;
    const ny = a[1] + (c[1] - a[1]) * t;
    // lateral offset so bears don't overlap perfectly
    const off = ((b.id * 37) % 7 - 3) * 0.12;
    const dx = c[0] - a[0], dz = c[2] - a[2];
    const L = Math.hypot(dx, dz) || 1;
    const px = nx + (-dz / L) * off, pz = nz + (dx / L) * off;
    const h = up ? Math.atan2(-dz, -dx) : Math.atan2(dz, dx);
    b.heading = b.heading + angleDiff(b.heading, h) * Math.min(1, dt * 10);
    b.x = px; b.z = pz;
    b.y = damp(b.y, ny, 12, dt);
    b.speed = 3;
  }

  // move toward a point; returns false if blocked
  moveToward(b, tx, tz, dt, speed, ignoreBlock) {
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return true;
    const sp = speed * (b.inWater ? 0.75 : 1) * (b.angry ? 1.25 : 1);
    const step = Math.min(d, sp * dt);
    const nx = b.x + (dx / d) * step, nz = b.z + (dz / d) * step;
    const h = Math.atan2(dz, dx);
    b.heading = b.heading + angleDiff(b.heading, h) * Math.min(1, dt * 9);
    b.speed = sp;
    const g = this.grid;
    const ctx = Math.floor(b.x), ctz = Math.floor(b.z), ntx = Math.floor(nx), ntz = Math.floor(nz);
    if (!ignoreBlock && (ntx !== ctx || ntz !== ctz) && !g.bearPassable(ntx, ntz)) return false;
    // leap into water / hop out
    if ((ntx !== ctx || ntz !== ctz) && !ignoreBlock) {
      const fromWater = g.isWater(ctx, ctz), toWater = g.isWater(ntx, ntz);
      // land inside the tile we just checked (never hop over a dam or fence)
      const lx = Math.min(ntx + 0.85, Math.max(ntx + 0.15, nx + (dx / d) * 0.5));
      const lz = Math.min(ntz + 0.85, Math.max(ntz + 0.15, nz + (dz / d) * 0.5));
      if (!fromWater && toWater) { this.startJump(b, lx, lz, true); return true; }
      if (fromWater && !toWater) { this.startJump(b, lx, lz, false); return true; }
    }
    b.x = nx; b.z = nz;
    return true;
  }

  followPath(b, dt) {
    const g = this.grid;
    if (!b.path || b.pathI >= b.path.length) { this.arrive(b); return false; }
    const [tx, tz] = b.path[b.pathI];
    const cx = tx + 0.5, cz = tz + 0.5;
    const speed = (b.goal?.kind === 'leave' ? 2.2 : 2.7) * b.def.speed;
    if (!g.bearPassable(tx, tz)) { if (b.goal?.kind === 'leave') this.beginLeave(b); else this.decide(b); return false; }
    // chasing fish: if we're in the fish's water region, hunt directly
    if (b.goal?.kind === 'fish' && b.inWater && b.fish && !b.fish.dead && b.fish.region === b.region) {
      b.state = 'hunt';
      return true;
    }
    const ok = this.moveToward(b, cx, cz, dt, speed, false);
    if (!ok) { this.decide(b); return false; }
    if (Math.hypot(cx - b.x, cz - b.z) < 0.18) b.pathI++;
    return true;
  }

  arrive(b) {
    const kind = b.goal?.kind;
    if (kind === 'fish') { this.decide(b); return; }
    if (kind === 'snack') {
      b.state = 'snack'; b.t = 1.5;
      if (b.struct) b.heading = Math.atan2(b.struct.z + 0.5 - b.z, b.struct.x + 0.5 - b.x);
      return;
    }
    if (kind === 'smash') {
      b.state = 'smash'; b.t = 0.9; b.smashed = false;
      if (b.struct) b.heading = Math.atan2(b.struct.z + 0.5 - b.z, b.struct.x + 0.5 - b.x);
      return;
    }
    if (kind === 'leave') { b.state = 'commuteUp'; b.trailD = this.trailTotal; return; }
    this.decide(b);
  }

  catchFish(b, f) {
    const game = this.game;
    const meal = game.fish.mealValue(f);
    const miss = b.prefer && f.sp.id !== b.prefer;
    b.eaten += meal * (miss ? 0.6 : 1);
    if (miss) b.preferMiss++;
    b.coins += game.fish.coinValue(f) * COIN_PER_MEAL * b.def.pay * game.mods.fishValueMult;
    if (f.golden) b.gotGolden = true;
    game.fish.remove(f);
    game.stats.fishEaten++;
    b.rig.hold(heldGeo(f.sp, f.golden));
    b.state = 'eat';
    b.t = 1.25;
    b.fish = null;
    game.particles.splash(f.x, f.z, 10, 0.8);
    game.audio.play('splash', { volume: 0.4 });
  }

  startJump(b, tx, tz, intoWater) {
    const g = this.grid;
    const y1 = intoWater ? Math.max(g.surfaceY(Math.floor(tx), Math.floor(tz)), WATER_Y - 0.95 * b.def.scale) : g.surfaceY(Math.floor(tx), Math.floor(tz));
    const dist = Math.hypot(tx - b.x, tz - b.z);
    b.jump = { t: 0, dur: intoWater ? 0.7 : 0.4, x0: b.x, z0: b.z, y0: b.y, x1: tx, z1: tz, y1, h: intoWater ? 1.3 + dist * 0.25 : 0.6, into: intoWater, flip: intoWater && b.flip };
    if (intoWater) this.game.audio.play('jump', { volume: 0.4, pitch: 1.2 - b.def.scale * 0.2 });
  }

  updateJump(b, dt) {
    const j = b.jump;
    j.t += dt / j.dur;
    const t = Math.min(1, j.t);
    b.x = j.x0 + (j.x1 - j.x0) * t;
    b.z = j.z0 + (j.z1 - j.z0) * t;
    b.y = j.y0 + (j.y1 - j.y0) * t + Math.sin(t * Math.PI) * j.h;
    if (t >= 1) {
      b.jump = null;
      const game = this.game;
      if (j.into) {
        game.particles.bigSplash(b.x, b.z);
        game.audio.play('bigsplash', { volume: 0.75, pitch: 1.15 - b.def.scale * 0.2 });
        game.rig.shake = Math.max(game.rig.shake, 0.25 * b.def.scale);
        game.stats.cannonballs++;
      } else {
        game.particles.splash(b.x, b.z, 8, 0.6);
      }
    }
  }

  // ------------------------------------------------------------ render
  show(b) {
    if (b.rig) return;
    b.rig = new BearRig(b.typeId, b.def);
    this.group.add(b.rig.root);
    b.visible = true;
    this.game.ui?.attachBearBubble(b);
  }

  hide(b) {
    if (b.rig) this.group.remove(b.rig.root);
    b.visible = false;
    this.game.ui?.detachBearBubble(b);
  }

  render(dt) {
    // big waves: drop bear shadows to keep draw calls in check
    let vis = 0;
    for (const b of this.list) if (b.visible) vis++;
    const shadows = vis <= 24;
    for (const b of this.list) {
      if (!b.visible || !b.rig) continue;
      const r = b.rig;
      if (r.shadows !== shadows) { r.shadows = shadows; for (const m of r.meshes) m.castShadow = shadows; }
      r.root.position.set(b.x, b.y, b.z);
      r.root.rotation.set(0, Math.PI / 2 - b.heading, 0);
      const sw = Math.sin(b.phase);
      let legA = 0, armA = 0, armRA = 0, bob = 0, lean = 0, armSpread = 0;
      if (b.moving) {
        const amp = b.inWater ? 0.45 : 0.8;
        legA = sw * amp;
        armA = -sw * amp * 0.8;
        armRA = -sw * amp * 0.35;
        bob = Math.abs(Math.cos(b.phase)) * 0.07;
        lean = b.state === 'commute' ? 0.22 : 0.1;
      } else {
        bob = Math.sin(this.time * 2 + b.id) * 0.015;
      }
      if (b.lunge > 0) {
        armA = armRA = -1.9;
        lean = 0.45;
        legA = 0.5;
      } else if (b.state === 'eat' || b.state === 'snack') {
        armA = armRA = -2.1 + Math.sin(this.time * 18) * 0.12;
        bob = Math.abs(Math.sin(this.time * 9)) * 0.04;
        lean = -0.05;
      } else if (b.state === 'pay') {
        armRA = -1.4;
        armA = -0.4;
        lean = -0.05;
      } else if (b.state === 'smash') {
        const k = clamp(1 - b.t / 0.9, 0, 1);
        armA = armRA = k < 0.5 ? -2.8 * (k / 0.5) : -2.8 + (k - 0.5) * 5.2;
        lean = k < 0.5 ? -0.15 : 0.3;
      } else if (b.angry && (b.moving || b.state === 'stomp')) {
        armA = -2.4 + Math.sin(this.time * 14) * 0.5;
        armRA = -2.4 - Math.sin(this.time * 14) * 0.5;
        armSpread = 0.4;
      } else if (b.state === 'search') {
        armA = -0.3; armRA = -0.3;
      }
      let flipX = 0;
      if (b.jump) {
        const t = Math.min(1, b.jump.t);
        if (b.jump.into) {
          armA = armRA = -2.9;
          legA = 0.9;
          if (b.jump.flip) flipX = t * Math.PI * 2;
          else flipX = t * 1.35;
        }
      }
      r.legL.rotation.x = legA;
      r.legR.rotation.x = -legA;
      r.armL.rotation.x = armA;
      r.armR.rotation.x = armRA;
      r.armL.rotation.z = -armSpread;
      r.armR.rotation.z = armSpread;
      r.body.position.y = bob;
      r.body.rotation.x = lean;
      r.root.rotateX(flipX);
      if (!b.angry && r.matState === 'angry') r.setMaterial('normal');
    }
  }

  // ------------------------------------------------------------ misc
  clear() {
    for (const b of this.list) this.hide(b);
    this.list.length = 0;
    this.waveActive = false;
  }
}
