// Beaver crew: live in lodges and do all the heavy lifting. They build
// blueprints, repair smashed things, and clear the forest. Clearing means
// chopping trees, rolling away rocks and plowing weeds, and every cleared tile
// becomes your land and pays out in wood money. They only work when PAID:
// every job costs one "pay" credit, and credits come from food you leave at
// the Beaver Snack Bar (each serving pays a few jobs). No pay, no work: the
// crew walks a picket line with "NO PAY NO WORK" signs until you stock it.
// (They build their own snack bar for free, and start with a signing bonus.)
import * as THREE from 'three';
import * as OLD from '../entities/critterModels.js';
import { WATER_Y, KIND } from '../world/grid.js';
import { BIOME, LANDMARKS } from '../world/worldgen.js';
import { angleDiff, damp } from '../core/rng.js';
import { SpriteBatch } from '../core/spriteBatch.js';
import { TreeFall, FALL } from './TreeFall.js';

const mods = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = mods['../entities/critters3d.js'] || null;

// how long one beaver gnaws at a tree (s, before tool upgrades / research):
// trees are a real job now, they come down in stages and then FALL (TreeFall.js)
export const TREE_CHOP_TIME = 30;
export const FOREST_CHOP_TIME = 36;
export const HAUL_SPEED = 2.6; // a beaver with a log on its shoulder (run is 3.8)
export const GARAGE_CAP = 40; // logs per Wood Garage (def.woodCap overrides)
// what clearing each kind of thing takes and pays
export const CLEAR = {
  forest: { time: FOREST_CHOP_TIME, pay: 5, anim: 'chop', label: 'wood' },
  tree: { time: TREE_CHOP_TIME, pay: 4, anim: 'chop', label: 'wood' },
  boulder: { time: 3.6, pay: 3, anim: 'hammer', label: 'stone' },
  weed: { time: 1.2, pay: 1, anim: 'plow', label: 'weeds' },
  clutter: { time: 0.9, pay: 1, anim: 'plow', label: 'flowers' },
};
import { FOOD_ITEMS, STORAGE } from '../data/foods.js';
export const SIGNING_BONUS = 10; // free jobs for a brand-new crew
const farmMods = import.meta.glob('../entities/farmModels.js', { eager: true });
const FM = farmMods['../entities/farmModels.js'] || null;

// beaver tool levels: what each upgrade lets the crew tear down
export const BEAVER_LEVELS = [
  null,
  { name: 'Teeth', icon: 'beaver', desc: 'Weeds, small trees, the forest edge' },
  { name: 'Steel Teeth + Pickaxe', icon: 'hammer', desc: 'Boulders and swamp trees', price: 150 },
  { name: 'Chainsaw + Dynamite', icon: 'bolt', desc: 'Giant mushrooms, mountain rocks', price: 420 },
  { name: 'Golden Hard Hats', icon: 'crown', desc: 'Everything, twice as fast', price: 900 },
];

export class BeaverSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.time = 0;
    this.clears = new Map(); // tile index -> clear job
    this.markers = null;
    this.rebuildT = 0;
    this.dirtyLand = false;
    this.sulkNagT = 0;
    // felled trees, lying trunks and logs on the ground (hauled to Wood Garages)
    this.fall = new TreeFall(game);
    game.treeFall = this.fall;
    this.garageT = 0;
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

  makeRig() {
    if (C3?.BeaverRig) {
      try { return new C3.BeaverRig(); } catch (e) { console.warn('BeaverRig failed', e); }
    }
    return new OLD.BeaverRig();
  }

  spawn(lodge) {
    const rig = this.makeRig();
    this.group.add(rig.root);
    const b = {
      lodge, rig, x: lodge.x + 0.5 + (Math.random() - 0.5) * 0.6, z: lodge.z + 0.5 + (Math.random() - 0.5) * 0.6, y: 0,
      heading: Math.random() * 6.28, state: 'idle', job: null, t: Math.random() * 2, phase: 0, moving: false, wander: null,
      jobs: 0, hungry: false, anim: null, seed: Math.random() * 9,
    };
    rig.onEvent = (name) => this.onRigEvent(b, name);
    this.list.push(b);
    this.game.particles.splash(b.x, b.z, 6, 0.6);
    this.game.emit('beavers', this.list.length);
    return b;
  }

  clear() {
    for (const b of this.list) this.group.remove(b.rig.root);
    this.list.length = 0;
    this.clears.clear();
    this.fall.clear();
    this.renderMarkers();
  }

  removeForLodge(lodge) {
    for (const b of [...this.list]) {
      if (b.lodge !== lodge) continue;
      if (b.job) this.unassign(b.job);
      this.dropCarried(b);
      this.group.remove(b.rig.root);
      this.list.splice(this.list.indexOf(b), 1);
    }
  }

  // ------------------------------------------------------------ clearing
  // what (if anything) on this tile can be cleared
  clearKind(x, z) {
    const g = this.game.grid;
    if (!g.inb(x, z)) return null;
    const i = z * g.w + x;
    if (g.occ[i] === -2) return null;
    if (g.deco[i] >= 0) {
      const d = this.game.world.decos[g.deco[i]];
      if (!d || d.removed) return null;
      if (d.type === 'greatwillow') return null;
      if (d.type === 'boulder') return 'boulder';
      if (d.type === 'weed') return 'weed';
      return 'tree';
    }
    if (g.kind[i] === KIND.FOREST && z >= 21) return 'forest';
    // flowers, tufts, ferns, pebbles... anything small goes too
    if (g.kind[i] !== KIND.WATER && g.occ[i] < 0 && this.game.world.hasClutter?.(x, z)) return 'clutter';
    return null;
  }

  // tool level needed to clear this tile
  levelFor(x, z, k = this.clearKind(x, z)) {
    const g = this.game.grid;
    const i = z * g.w + x;
    const bio = g.biome ? g.biome[i] : 0;
    if (k === 'weed' || k === 'tree' || k === 'clutter') return 1;
    if (k === 'boulder') return g.kind[i] === KIND.ROCK || z < 21 ? 3 : 2;
    if (k === 'forest') return bio === BIOME.MUSHROOM ? 3 : bio === BIOME.SWAMP ? 2 : 1;
    return 1;
  }

  level() { return this.game.state.beaverLevel || 1; }

  // forest/decos must touch your land (or a tile already queued for clearing)
  canClear(x, z) {
    const g = this.game.grid;
    const k = this.clearKind(x, z);
    if (!k) return { ok: false, reason: 'nothing' };
    const i = z * g.w + x;
    if (this.clears.has(i)) return { ok: false, reason: 'queued' };
    if (this.game.zones?.fogAt(x, z) > 0.45) return { ok: false, reason: 'fog' };
    const need = this.levelFor(x, z, k);
    if (need > this.level()) return { ok: false, reason: 'level', need, kind: k };
    if (g.meadow[i] || this.game.land?.ownsTile(i)) return { ok: true, kind: k };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!g.inb(nx, nz)) continue;
      const ni = nz * g.w + nx;
      if (g.meadow[ni] || this.clears.has(ni)) return { ok: true, kind: k };
    }
    return { ok: false, reason: 'far' };
  }

  queueClear(x, z) {
    const c = this.canClear(x, z);
    if (!c.ok) return c;
    const g = this.game.grid;
    const i = z * g.w + x;
    this.clears.set(i, { i, x, z, kind: c.kind, progress: 0, assigned: null, order: this.clears.size, markT: this.time });
    this.renderMarkers();
    return c;
  }

  // marked things flash red for 2 s, then get construction tape + fences
  // (cheap shared models from farmModels.js) until the beavers clear them
  updateTape(dt) {
    const game = this.game;
    const g = game.grid;
    this.tapeT = (this.tapeT || 0) - dt;
    if (!this.tapeGroup) { this.tapeGroup = new THREE.Group(); this.tapeGroup.name = 'constructionTape'; game.scene.add(this.tapeGroup); this.tapes = new Map(); }
    for (const [i, m] of this.tapes) {
      const c = this.clears.get(i);
      if (!c) {
        this.tapes.delete(i);
        const gone = () => { this.tapeGroup.remove(m.root); try { m.dispose?.(); } catch { /* ignore */ } };
        if (m.close) { (this.closing ||= new Set()).add(m); m.close(() => { this.closing.delete(m); gone(); }); } else gone();
        continue;
      }
      try { m.update?.(dt, this.time); m.setProgress?.(c.progress); } catch { /* ignore */ }
    }
    for (const m of this.closing || []) { try { m.update?.(dt, this.time); } catch { /* ignore */ } }
    if (this.tapeT > 0) return;
    this.tapeT = 0.2;
    let freshChanged = false;
    const fresh = [];
    const pend = new Set(game.ui?.contract?.tiles || []); // [v19 buildings] unpaid picks stay red (no tape yet)
    for (const c of this.clears.values()) {
      const age = this.time - (c.markT ?? -9);
      if (age < 2 || pend.has(c.i)) { fresh.push(c.i); continue; }
      if (!c.taped) { c.taped = true; freshChanged = true; }
      if (this.tapes.has(c.i)) continue;
      let m = null;
      try { m = FM?.makeConstructionMarker?.({ seed: c.i, kind: c.kind }) || null; } catch (e) { m = null; }
      if (!m) m = fallbackTape(c.i);
      m.root.position.set(c.x + 0.5, g.height[c.i], c.z + 0.5);
      this.tapeGroup.add(m.root);
      this.tapes.set(c.i, m);
      if (this.time - (c.markT ?? 0) < 3) game.particles.puff?.(c.x + 0.5, g.height[c.i] + 0.2, c.z + 0.5, 3, 0.25);
    }
    const key = fresh.join(',');
    if (key !== this.freshKey || freshChanged) { this.freshKey = key; game.world.setMarked?.(fresh); this.renderMarkers(true); }
  }

  cancelClear(x, z) {
    const g = this.game.grid;
    const i = z * g.w + x;
    const j = this.clears.get(i);
    if (!j) return false;
    if (j.assigned) { const b = j.assigned; this.release(b); }
    this.clears.delete(i);
    this.renderMarkers();
    return true;
  }

  // a clear job is reachable once one of its neighbours is your land
  reachable(j) {
    const g = this.game.grid;
    if (g.meadow[j.i] || this.game.land?.ownsTile(j.i)) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = j.x + dx, nz = j.z + dz;
      if (g.inb(nx, nz) && g.meadow[nz * g.w + nx]) return true;
    }
    return false;
  }

  // a villager's homestead appears when the fog lifts: clear it in one go (no pay)
  clearInstant(x, z) {
    const game = this.game;
    const g = game.grid;
    const w = game.world;
    if (!g.inb(x, z)) return false;
    const i = z * g.w + x;
    if (g.isWater(x, z) || g.occ[i] === -2 || g.occ[i] >= 0) return false;
    let did = false;
    if (g.kind[i] === KIND.FOREST) { g.kind[i] = KIND.GRASS; did = true; this.dirtyLand = true; }
    if (g.deco[i] >= 0) { const d = w.decos[g.deco[i]]; if (d) d.removed = true; g.deco[i] = -1; did = true; this.dirtyDecos = true; }
    if (!g.meadow[i]) { g.meadow[i] = 1; did = true; this.dirtyLand = true; }
    if (did) { w.landVersion++; this.rebuildT = 0; }
    return did;
  }

  finishClear(j, from = null) {
    const game = this.game;
    const g = game.grid;
    const w = game.world;
    const i = j.i;
    const cx = j.x + 0.5, cz = j.z + 0.5;
    const gy = g.height[i];
    const def = CLEAR[j.kind];
    // trees topple (TreeFall does the crash, TIMBER! and the logs)
    if (j.kind === 'forest' || j.kind === 'tree') this.fall.fell(i, from || { x: cx - 0.6, z: cz }, j.kind === 'forest' ? FALL.logsForest : FALL.logsTree);
    if (j.kind === 'forest') {
      g.kind[i] = KIND.GRASS;
      g.meadow[i] = 1;
      w.clutter.push({ type: 'stump', x: cx + (Math.random() - 0.5) * 0.3, z: cz + (Math.random() - 0.5) * 0.3, y: gy, rot: Math.random() * 6 });
      if (Math.random() < 0.6) w.clutter.push({ type: 'tuft', x: cx + 0.3, z: cz - 0.2, y: gy, rot: Math.random() * 6 });
      w.landVersion++;
      this.dirtyLand = true;
      game.particles.debris(cx, gy + 0.3, cz, 8, [0xc8a06a, 0x8a6a44, 0xe0c090]);
    } else if (j.kind === 'clutter') {
      w.removeClutter(j.x, j.z);
      g.meadow[i] = 1;
      w.landVersion++;
      this.dirtyLand = true;
      game.particles.debris(cx, gy + 0.2, cz, 8, [0xd84a6a, 0xf0d040, 0x6a8a3a, 0x9a7aca]);
      game.audio.play('pet', { volume: 0.4, pitch: 1.3 });
    } else {
      const d = w.decos[g.deco[i]];
      if (d) d.removed = true;
      g.deco[i] = -1;
      g.meadow[i] = 1;
      w.landVersion++;
      this.dirtyDecos = true;
      if (j.kind === 'tree') { game.particles.debris(cx, gy + 0.3, cz, 8, [0xc8a06a, 0x8a6a44, 0xe0c090]); w.clutter.push({ type: 'stump', x: cx, z: cz, y: gy, rot: 0 }); this.dirtyLand = true; }
      else if (j.kind === 'boulder') game.particles.debris(cx, gy + 0.4, cz, 14, [0x9c918c, 0x8b817c, 0x6a625e]);
      else game.particles.debris(cx, gy + 0.2, cz, 10, [0x5a7a2a, 0x8a6a3a, 0x6a8a3a]);
      if (j.kind !== 'tree') game.audio.play(j.kind === 'weed' ? 'pet' : 'demolish', { volume: 0.45 });
    }
    game.particles.puff(cx, gy + 0.3, cz, 8, 0.35);
    const pay = Math.round(def.pay * (game.mods.clearPayMult || 1));
    game.particles.coins(cx, gy + 0.8, cz, Math.min(6, pay));
    game.earnMisc?.(pay, 'clearing');
    game.ui?.floatTextAt(cx, gy + 1.4, cz, `+${pay}`, '#ffe9a0');
    // (wood comes from the logs now: beavers haul them to a Wood Garage)
    game.stats.cleared = (game.stats.cleared || 0) + 1;
    this.clears.delete(i);
    this.renderMarkers();
    game.checkLandmarks?.();
    game.emit('cleared', j);
  }

  // ------------------------------------------------------------ jobs
  unassign(job) {
    if (job.kind === 'mine' || job.kind === 'orehaul') { this.game.mining?.unassignJob(job); return; } // [F&S mining] vein jobs + ore sacks
    if (job.kind === 'haul') { if (job.log && job.log.claim) job.log.claim = null; return; }
    if (job.kind === 'clear') { if (job.c.assigned) job.c.assigned = null; }
    else if (job.s && job.s.assigned) job.s.assigned = null;
  }

  findJob(b) {
    const game = this.game;
    const structs = game.structures;
    let best = null, bd = Infinity;
    for (const s of structs.list) {
      if (s.built || s.def.builder !== 'beaver' || (s.assigned && s.assigned !== b)) continue;
      const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return { kind: 'build', s: best };
    for (const s of structs.list) {
      if (!s.built || s.hp >= s.maxHp || s.maxHp >= 90 || (s.assigned && s.assigned !== b)) continue;
      const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return { kind: 'repair', s: best };
    let bc = null;
    for (const c of this.clears.values()) {
      if (c.assigned || !this.reachable(c)) continue;
      const d = Math.hypot(c.x + 0.5 - b.x, c.z + 0.5 - b.z) + c.order * 0.05;
      if (d < bd) { bd = d; bc = c; }
    }
    if (bc) return { kind: 'clear', c: bc };
    return this.game.mining?.findBeaverJob?.(b) || null; // [F&S mining] marked ore veins
  }

  // ------------------------------------------------------------ pay
  get credit() { return this.game.state.beaverCredit ?? 0; }
  set credit(v) { this.game.state.beaverCredit = Math.max(0, v); }

  // every job costs pay, except building their own snack bar
  needsPay(job) { return !(job.kind === 'build' && job.s.def.freeLabour); }

  bars() { return this.game.structures.list.filter((s) => s.built && !s.removed && STORAGE[s.type]?.for === 'beaver'); }

  // a stocked Beaver Snack Bar to get paid at
  snackBar(b) {
    let best = null, bd = Infinity;
    for (const s of this.bars()) {
      if (this.game.foodStore.stored(s) < 1) continue;
      const d = Math.hypot(s.x + 0.5 - b.x, s.z + 0.5 - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // the player just stocked a snack bar: strikers cheer and head over
  onPaid() {
    for (const b of this.list) if (b.strike) { b.strike = false; b.cheerT = 0.8; b.t = Math.random() * 0.4; }
    this.strikeT = 0;
  }

  get striking() { return this.list.some((b) => b.strike); }

  jobTarget(job) {
    if (job.kind === 'mine') return this.game.mining.jobTarget(job); // [F&S mining]
    if (job.kind === 'clear') return { x: job.c.x + 0.5, z: job.c.z + 0.5 };
    return { x: job.s.x + 0.5, z: job.s.z + 0.5 };
  }

  update(dt) {
    this.time += dt;
    const game = this.game;
    const g = game.grid;
    const speedMult = game.mods.buildSpeed;
    const night = game.state.phase === 'night' || game.state.phase === 'bedtime';
    let sulking = 0;
    for (const b of this.list) {
      b.moving = false;
      if (b.lodge.removed) continue;
      if (b.state === 'idle') {
        b.t -= dt;
        if (b.t <= 0) {
          b.t = 0.5 + Math.random() * 0.5;
          if (!night) {
            const job = this.findJob(b);
            // hauling logs is free (part of the job): do it when the paid work
            // can't start, and take turns with chopping so logs don't pile up
            const haul = (!job || job.kind === 'clear' || job.kind === 'mine' || (this.needsPay(job) && this.credit < 1)) ? this.findHaul(b) : null; // [F&S mining] mine jobs take turns with hauling too
            if (haul && (!job || (this.needsPay(job) && this.credit < 1) || b.lastJob === 'clear' || b.lastJob === 'mine')) {
              this.startHaul(b, haul);
            } else if (job && this.needsPay(job) && this.credit < 1) {
              // unpaid: grab a snack at the bar if there's food, else strike
              const bar = this.snackBar(b);
              if (bar) { b.state = 'snack'; b.snack = bar; b.wander = null; b.strike = false; }
              else if (!b.strike) { b.strike = true; b.wander = null; b.picket = Math.random() * 6.28; }
            } else if (job) {
              if (this.needsPay(job)) { this.credit = this.credit - 1; job.paidCredit = true; }
              b.job = job;
              b.lastJob = job.kind;
              if (job.kind === 'mine') this.game.mining.claimJob(b, job); // [F&S mining]
              else if (job.kind === 'clear') job.c.assigned = b; else job.s.assigned = b;
              if (job.kind === 'clear' && (job.c.kind === 'tree' || job.c.kind === 'forest')) job.stand = this.chopSpot(b, job.c);
              b.state = 'go';
              b.sulk = false;
              b.strike = false;
            } else if (b.strike) {
              b.strike = false;
            } else if (!b.wander || Math.random() < 0.3) {
              const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.8;
              b.wander = { x: b.lodge.x + 0.5 + Math.cos(a) * r, z: b.lodge.z + 0.5 + Math.sin(a) * r };
            }
          } else if (night) b.wander = { x: b.lodge.x + 0.5, z: b.lodge.z + 0.5 };
        }
        if (b.strike && b.state === 'idle') {
          // the picket line: a slow little loop by the snack bar (or lodge)
          const home = this.bars()[0] || b.lodge;
          b.picket = (b.picket || 0) + dt * 0.55;
          const px = home.x + 0.5 + Math.cos(b.picket) * 1.3, pz = home.z + 0.5 + Math.sin(b.picket) * 1.3;
          this.moveToward(b, px, pz, dt, 0.8, 0.05);
          sulking++;
          if (Math.random() < dt * 0.05) game.say?.({ getWorldPos: (v) => v.set(b.x, b.y + 1.1, b.z) }, ['NO PAY, NO WORK!', 'Pay up, fox!', 'Snacks first!', 'We want carrots!'][Math.floor(Math.random() * 4)], { mood: 'angry', dur: 1.8, size: 's', key: 'beaverstrike' + (this.list.indexOf(b) % 2) });
        } else if (b.wander) this.moveToward(b, b.wander.x, b.wander.z, dt, 0.9, 0.3);
        if (b.sulk) sulking++;
      } else if (b.state === 'snack') {
        const s = b.snack;
        if (!s || s.removed || game.foodStore.stored(s) < 1) { b.state = 'idle'; b.t = 0.3; continue; }
        if (this.moveToward(b, s.x + 0.5, s.z + 0.5, dt, 3.4, 0.6)) { b.state = 'munch'; b.t = 0; game.audio.play('nibble', { volume: 0.35, pitch: 1.4 }); }
      } else if (b.state === 'munch') {
        b.t += dt;
        if (Math.random() < dt * 5) game.particles.debris(b.x, b.y + 0.4, b.z, 1, [0xf07a1a, 0x7ad04a, 0xc03050]);
        if (b.t > 1.6) {
          // one serving = this many paid jobs for the whole crew
          const item = game.foodStore.takeFrom(b.snack, (id, F) => F?.beaver?.jobs || 0);
          const jobs = item ? FOOD_ITEMS[item]?.beaver?.jobs || 1 : 0;
          if (jobs) {
            this.credit = this.credit + jobs;
            b.sulk = false;
            game.particles.hearts(b.x, b.y + 0.7, b.z, 2);
            game.particles.coins?.(b.x, b.y + 0.8, b.z, Math.min(5, jobs));
            game.ui?.floatTextAt(b.x, b.y + 1.2, b.z, `Paid! +${jobs} job${jobs > 1 ? 's' : ''}`, '#c8ff9a');
            game.audio.play('bear_yum', { volume: 0.2, pitch: 2.2 });
            game.emit('beaverPaid', { b, item, jobs });
          }
          b.state = 'idle'; b.t = 0.4; b.snack = null; b.cheerT = 0.6;
        }
      } else if (b.state === 'haul') {
        this.updateHaul(b, dt, speedMult);
      } else if (b.state === 'go') {
        const job = b.job;
        if (job.kind === 'mine' && !this.game.mining?.jobValid(job)) { this.release(b); continue; } // [F&S mining]
        if (job.kind !== 'clear' && job.kind !== 'mine' && (job.s.removed || (job.kind === 'build' && job.s.built))) { this.release(b); continue; }
        if (job.kind === 'clear' && !this.clears.has(job.c.i)) { this.release(b); continue; }
        const tg = job.stand || this.jobTarget(job);
        const stop = job.stand ? 0.06 : job.kind === 'clear' ? 0.7 : 0.55;
        if (this.moveToward(b, tg.x, tg.z, dt, 3.8 * speedMult ** 0.5, stop)) {
          b.state = 'work'; b.t = 0; b.cloudT = 0;
          if (job.kind !== 'clear') game.audio.play('build_cloud', { volume: 0.4, pitch: 0.95 + Math.random() * 0.15 });
        }
      } else if (b.state === 'work') {
        const job = b.job;
        const tg = this.jobTarget(job);
        b.heading += angleDiff(b.heading, Math.atan2(tg.z - b.z, tg.x - b.x)) * Math.min(1, dt * 6);
        b.t += dt;
        if (job.kind === 'mine') { // [F&S mining] hacking at an ore vein
          if (this.game.mining.workBeaver(b, job, dt)) { if (this.game.mining.jobValid(job) || job.progress >= 1) this.paid(b); this.release(b); }
        } else if (job.kind === 'clear') {
          const c = job.c;
          if (!this.clears.has(c.i)) { this.release(b); continue; }
          c.progress += (dt * speedMult * (this.game.mods.clearSpeed || 1) * (1 + 0.35 * (this.level() - 1))) / CLEAR[c.kind].time;
          const woody = c.kind === 'tree' || c.kind === 'forest';
          if (woody) {
            // the tree leaves the static batch: it shakes harder, gets a notch, creaks
            this.fall.setProgress(c.i, c.progress, b);
            // five stages, each with a big CHOP! and a shower of chips
            const step = Math.min(5, Math.floor(c.progress * 6));
            if (step > (c.chop || 0)) {
              c.chop = step;
              const gy = g.height[c.i];
              game.particles.debris(tg.x, gy + 0.35, tg.z, 8, [0xc8a06a, 0x8a6a44, 0xe0c090, 0x2b5634]);
              game.particles.word?.('chop', tg.x + (Math.random() - 0.5) * 0.4, gy + 1.1 + step * 0.06, tg.z, { size: 0.22 + step * 0.02, life: 0.7 });
              game.audio.play('chip', { volume: 0.35, pitch: 0.7 });
              this.fall.bite(c.i, 2);
            }
          }
          b.chipT = (b.chipT || 0) - dt;
          // rigged beavers chip on every bite of the chop anim (onRigEvent)
          if (b.chipT <= 0 && woody && b.rig.play) b.chipT = 0.5;
          else if (b.chipT <= 0) {
            b.chipT = 0.28;
            const gy = g.height[c.i];
            if (c.kind === 'weed') game.particles.dust(tg.x, gy + 0.1, tg.z, 2);
            else game.particles.debris(tg.x, gy + 0.5, tg.z, 3, c.kind === 'boulder' ? [0x9c918c, 0x8b817c] : [0xc8a06a, 0x8a6a44, 0xe0c090]);
            game.audio.play(c.kind === 'boulder' ? 'hammer' : c.kind === 'weed' ? 'dig' : 'chip', { volume: 0.18, pitch: 0.9 + Math.random() * 0.4 });
            if (Math.random() < 0.15) game.particles.word?.(['bonk', 'pow'][Math.floor(Math.random() * 2)], tg.x, gy + 1.1, tg.z, { size: 0.2, life: 0.5 });
          }
          if (c.progress >= 1) {
            this.finishClear(c, b);
            this.paid(b);
            this.release(b);
          }
        } else {
          const s = job.s;
          if (s.removed) { this.release(b); continue; }
          b.cloudT = (b.cloudT || 0) - dt;
          if (b.cloudT <= 0) {
            b.cloudT = 0.09;
            game.particles.buildCloud(s.x + 0.5, game.structures.baseY(s), s.z + 0.5, job.kind === 'build' ? 1 : 0.7);
          }
          if (b.t > 0.22) {
            b.t = 0;
            game.audio.play(Math.random() < 0.5 ? 'hammer' : 'nail', { volume: 0.2, pitch: 0.9 + Math.random() * 0.5 });
            if (Math.random() < 0.3) game.particles.word(['pow', 'bonk', 'bam'][Math.floor(Math.random() * 3)], s.x + 0.5 + (Math.random() - 0.5), game.structures.baseY(s) + 1.1, s.z + 0.5, { size: 0.22, life: 0.6 });
            if (Math.random() < 0.25) game.audio.play('saw', { volume: 0.15 });
          }
          if (job.kind === 'build') {
            s.progress += (dt * speedMult) / s.def.buildTime;
            if (s.progress >= 1) {
              game.structures.onBuilt(s);
              game.onStructureBuilt(s);
              s.popT = 0.45;
              game.particles.word?.('built', s.x + 0.5, game.structures.baseY(s) + 1.4, s.z + 0.5, { size: 0.3, life: 1 });
              game.particles.stars?.(s.x + 0.5, game.structures.baseY(s) + 0.9, s.z + 0.5, 8);
              game.audio.play('pop_in', { volume: 0.5 });
              this.paid(b);
              this.release(b);
            }
          } else {
            game.structures.repair(s, dt * 1.5 * speedMult);
            if (s.hp >= s.maxHp) this.release(b);
          }
        }
      }
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
    // on strike: the fox nags (rarely) and the snack bar shows a picket sign
    this.sulkNagT -= dt;
    if (sulking && this.sulkNagT <= 0) {
      this.sulkNagT = 45;
      const bars = this.bars();
      game.notify?.(bars.length ? 'Beavers on STRIKE! Stock the Beaver Snack Bar with produce (Food tool).' : 'Beavers on STRIKE! Build a Beaver Snack Bar and stock it with food.', 'warn');
      game.emit('beaverStrike', this.list.length);
    }
    const strike = sulking > 0;
    if (strike !== this.wasStriking) {
      this.wasStriking = strike;
      for (const s of this.bars()) s.farmRig?.setState?.(strike ? 'strike' : 'idle');
    }
    this.updateTape(dt);
    this.fall.update(dt);
    this.updateGarages(dt);
    // batched world rebuilds after clearing
    this.rebuildT -= dt;
    if ((this.dirtyLand || this.dirtyDecos) && this.rebuildT <= 0) {
      this.rebuildT = 0.8;
      game.world.buildDecos();
      if (this.dirtyLand) { game.world.rebuildTerrain(); game.world.buildClutter(); }
      this.dirtyLand = this.dirtyDecos = false;
      game.onTopologyChanged();
      game.onLandChanged?.();
    }
  }

  // a job got finished (it was paid for when it started)
  paid(b) {
    b.jobs++;
    if (b.job) b.job.done = true;
    b.cheerT = 0.8;
  }

  onRigEvent(b, name) {
    if (name === 'step' && Math.random() < 0.3) this.game.particles.dust(b.x, b.y + 0.02, b.z, 1);
    if (name === 'chop_hit') this.bite(b);
  }

  // one bite into a trunk: wood chips + sawdust fly off the notch, the tree jolts
  bite(b) {
    const c = b.state === 'work' && b.job?.kind === 'clear' ? b.job.c : null;
    if (!c || (c.kind !== 'tree' && c.kind !== 'forest')) return;
    const game = this.game;
    const gy = this.game.grid.height[c.i];
    const tx = c.x + 0.5, tz = c.z + 0.5;
    // chips spray back past the beaver's cheeks
    const nx = (b.x + tx) / 2, nz = (b.z + tz) / 2;
    game.particles.debris(nx, gy + 0.25, nz, 2 + (Math.random() < c.progress ? 1 : 0), [0xe0c090, 0xc8a06a, 0xf0dcb0, 0x8a6a44]);
    if (Math.random() < 0.5) game.particles.dust(nx, gy, nz, 1);
    game.audio.play('chip', { volume: 0.14 + c.progress * 0.1, pitch: 0.95 + Math.random() * 0.35 - c.progress * 0.25 });
    this.fall.bite(c.i, 1);
  }

  // where to stand to gnaw a tree: beside the trunk on screen (camera left or
  // right, whichever side the beaver comes from) so you can see the notch, and
  // the tree falls the other way
  chopSpot(b, c) {
    const cam = this.game.rig?.camera;
    let rx = 1, rz = 0;
    if (cam) { const e = cam.matrixWorld.elements; rx = e[0]; rz = e[2]; const n = Math.hypot(rx, rz) || 1; rx /= n; rz /= n; }
    const tx = c.x + 0.5, tz = c.z + 0.5;
    const side = (b.x - tx) * rx + (b.z - tz) * rz < 0 ? -1 : 1;
    // nudged a hair towards the camera so the beaver isn't hidden by the trunk
    const x = tx + rx * side * 0.4 - rz * 0.12, z = tz + rz * side * 0.4 + rx * 0.12;
    const g = this.game.grid;
    if (!g.inb(Math.floor(x), Math.floor(z)) || g.isWater(Math.floor(x), Math.floor(z))) return null;
    return { x, z };
  }

  // ------------------------------------------------------------ hauling logs
  garages() { return this.game.structures.list.filter((s) => s.type === 'woodgarage' && s.built && !s.removed); }
  garageKey(s) { return s.x + ',' + s.z; }
  garageCap(s) { return s.def.woodCap || GARAGE_CAP; }
  garageStock(s) { return this.game.state.woodGarages?.[this.garageKey(s)] || 0; }
  garageRoom(s, except = null) {
    let inbound = 0;
    for (const o of this.list) if (o !== except && o.state === 'haul' && o.job?.garage === s) inbound++;
    return this.garageCap(s) - this.garageStock(s) - inbound;
  }
  garageDoor(s) { return { x: s.x + 1, z: s.z + 2.2 }; }

  pickGarage(b) {
    let best = null, bd = Infinity;
    for (const s of this.garages()) {
      if (this.garageRoom(s, b) < 1) continue;
      const d = this.garageDoor(s), dd = Math.hypot(d.x - b.x, d.z - b.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    return best;
  }

  findHaul(b) {
    const ore = () => this.game.mining?.findOreHaul?.(b) || null; // [F&S mining] ore sacks -> Ore Shed
    if (!this.fall.logs.length) return ore();
    const garage = this.pickGarage(b);
    if (!garage) return ore();
    const log = this.fall.nearestLog(b.x, b.z);
    return log ? { kind: 'haul', log, garage, phase: 'fetch' } : ore();
  }

  startHaul(b, job) {
    if (job.kind === 'orehaul') this.game.mining.startHaul(b, job); else // [F&S mining]
    job.log.claim = b;
    b.job = job;
    b.lastJob = 'haul';
    b.state = 'haul';
    b.t = 0;
    b.wander = null;
    b.strike = false;
    b.sulk = false;
  }

  dropCarried(b) {
    if (!b.carry) return;
    if (b.carry.ore) { this.game.mining?.dropOre(b); return; } // [F&S mining]
    this.fall.putLog(b.x + Math.cos(b.heading) * 0.3, b.z + Math.sin(b.heading) * 0.3, -b.heading);
    b.carry = null;
  }

  updateHaul(b, dt, speedMult) {
    if (b.job?.kind === 'orehaul') { this.game.mining.updateOreHaul(b, dt, speedMult); return; } // [F&S mining]
    const game = this.game;
    const job = b.job;
    const run = 3.8 * speedMult ** 0.5;
    if (job.phase === 'fetch') {
      const log = job.log;
      if (!this.fall.logs.includes(log)) { this.release(b); return; }
      if (this.moveToward(b, log.x, log.z, dt, run, 0.38)) { job.phase = 'pick'; b.t = 0; }
    } else if (job.phase === 'pick') {
      // a heave: grab it, hoist it onto the shoulder
      b.t += dt;
      b.heading += angleDiff(b.heading, Math.atan2(job.log.z - b.z, job.log.x - b.x)) * Math.min(1, dt * 8);
      if (b.t >= 0.45) {
        const log = job.log;
        if (!this.fall.takeLog(log)) { this.release(b); return; }
        b.carry = { variant: log.variant };
        job.log = null;
        game.particles.dust(log.x, log.gy, log.z, 3);
        game.audio.play('grab', { volume: 0.3, pitch: 0.8 });
        b.cheerT = 0;
        job.phase = 'carry';
        if (!job.garage || job.garage.removed || this.garageRoom(job.garage, b) < 1) job.garage = this.pickGarage(b);
        if (!job.garage) { this.dropCarried(b); this.release(b); }
      }
    } else if (job.phase === 'carry') {
      let s = job.garage;
      if (!s || s.removed || !s.built) { s = job.garage = this.pickGarage(b); if (!s) { this.dropCarried(b); this.release(b); return; } }
      const d = this.garageDoor(s);
      if (this.moveToward(b, d.x, d.z, dt, HAUL_SPEED * speedMult ** 0.3, 0.3)) { job.phase = 'drop'; b.t = 0; }
    } else if (job.phase === 'drop') {
      b.t += dt;
      const s = job.garage;
      b.heading += angleDiff(b.heading, Math.atan2(s.z + 1 - b.z, s.x + 1 - b.x)) * Math.min(1, dt * 8);
      if (b.t >= 0.35) {
        // full after all (someone else got there first)? find another or set it down
        if (this.garageCap(s) - this.garageStock(s) < 1) {
          job.garage = this.pickGarage(b);
          if (job.garage) { job.phase = 'carry'; return; }
          this.dropCarried(b); this.release(b); return;
        }
        this.stockLog(s, b);
        b.carry = null;
        this.release(b);
        b.cheerT = 0.35;
      }
    }
  }

  stockLog(s, b) {
    const game = this.game;
    const G = (game.state.woodGarages ||= {});
    const k = this.garageKey(s);
    G[k] = (G[k] || 0) + 1;
    const d = this.garageDoor(s);
    const gy = game.structures.baseY?.(s) ?? 0;
    game.workshop?.addWood(1, d.x, d.z - 0.4);
    game.particles.puff(d.x, gy + 0.2, d.z - 0.5, 5, 0.25);
    game.particles.debris(d.x, gy + 0.4, d.z - 0.6, 3, [0xc8a06a, 0x8a6a44]);
    game.audio.play('drop', { volume: 0.35, pitch: 0.75 + Math.random() * 0.15 });
    s.extraModel?.userData?.setStock?.(G[k], this.garageCap(s));
    game.stats.logsStocked = (game.stats.logsStocked || 0) + 1;
    game.emit('logStocked', { garage: s, total: G[k], beaver: b });
  }

  // keep each garage's pile in step with the wood stock (Chip spends it, Pip
  // buys it) and nag once when logs pile up with nowhere to go
  updateGarages(dt) {
    this.garageT -= dt;
    if (this.garageT > 0) return;
    this.garageT = 0.5;
    const game = this.game;
    const st = game.state;
    const G = (st.woodGarages ||= {});
    const gs = this.garages();
    const live = new Set(gs.map((s) => this.garageKey(s)));
    for (const k of Object.keys(G)) if (!live.has(k) && game.structures.list.length) delete G[k];
    let over = gs.reduce((n, s) => n + this.garageStock(s), 0) - Math.floor(st.wood || 0);
    while (over > 0) {
      let big = null;
      for (const s of gs) if (!big || this.garageStock(s) > this.garageStock(big)) big = s;
      if (!big || !this.garageStock(big)) break;
      const take = Math.min(over, this.garageStock(big));
      G[this.garageKey(big)] -= take;
      over -= take;
    }
    for (const s of gs) s.extraModel?.userData?.setStock?.(this.garageStock(s), this.garageCap(s));
    // logs waiting with nowhere to go
    const waiting = this.fall.logs.some((l) => l.landed && !l.claim);
    if (!waiting) { this.fullHinted = false; return; }
    if (!gs.length) {
      if (!st.hintWoodGarage) { st.hintWoodGarage = true; game.notify?.('Build a Wood Garage! The beavers need somewhere to stack the logs.', 'info'); game.emit('needWoodGarage'); }
    } else if (!gs.some((s) => this.garageRoom(s) > 0) && !this.fullHinted) {
      this.fullHinted = true;
      game.notify?.('Wood Garages are full! Build another, or sell logs to Pip.', 'warn');
    }
  }

  release(b) {
    if (b.carry && (b.job?.kind === 'haul' || b.job?.kind === 'orehaul')) this.dropCarried(b); // [F&S mining] orehaul
    if (b.job) {
      this.unassign(b.job);
      if (b.job.paidCredit && !b.job.done) this.credit = this.credit + 1; // cancelled: refund the pay
    }
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

  // flat X markers on tiles queued for clearing
  renderMarkers(fromTape = false) {
    const game = this.game;
    const pend = new Set(game.ui?.contract?.tiles || []); // [v19 buildings]
    if (!fromTape) game.world.setMarked?.([...this.clears.values()].filter((c) => this.time - (c.markT ?? -9) < 2 || pend.has(c.i)).map((c) => c.i));
    const P = game.particles;
    if (!P?.tex) return;
    if (!this.markers) {
      this.markers = new SpriteBatch(P.tex, { max: 2048, lit: false, renderOrder: 21, name: 'clearmarks' });
      game.scene.add(this.markers.mesh);
    }
    const M = this.markers;
    M.clear();
    const fr = P.atlas.frames.tagmark?.[0] || P.atlas.frames.ring?.[0];
    const g = game.grid;
    for (const c of this.clears.values()) {
      if (this.time - (c.markT ?? -9) >= 2) continue; // the tape takes over
      const y = g.height[c.i] + (c.kind === 'forest' || c.kind === 'tree' ? 2.2 : 0.8);
      M.push(fr, c.x + 0.5, y, c.z + 0.5, { mode: 2, ax: 0.5, ay: 0, h: 0.32, w: 0.32 * fr.w / fr.h, tint: this.reachable(c) ? [1, 0.85, 0.4] : [0.7, 0.7, 0.75] });
    }
    M.commit();
  }

  render(dt = 1 / 60) {
    for (const b of this.list) {
      const r = b.rig;
      r.root.position.set(b.x, b.y, b.z);
      r.root.rotation.set(0, Math.PI / 2 - b.heading, 0);
      if (r.play) {
        let want = 'idle';
        if (b.carry) want = 'carry_log';
        else if (b.state === 'haul' && b.job?.phase === 'pick') want = 'chop';
        else if (b.state === 'work') want = b.job?.kind === 'clear' ? CLEAR[b.job.c.kind].anim : 'hammer';
        else if (b.state === 'munch') want = 'eat_berry';
        else if (b.strike) want = 'carry_log';
        else if (b.moving) want = b.inWater ? 'swim' : 'run';
        else if (b.cheerT > 0) want = 'cheer';
        else if (b.sulk) want = 'idle';
        else if (this.game.state.phase === 'night') want = 'sleep';
        if (b.cheerT > 0) b.cheerT -= dt;
        if (want !== b.anim) { r.play(want, { loop: true, fade: 0.15 }); b.anim = want; }
        r.update(dt);
        this.strikeSign(b);
        continue;
      }
      // legacy voxel beaver: hand-animated
      let hop = 0;
      if (b.moving && !b.inWater) hop = Math.abs(Math.sin(b.phase)) * 0.12;
      if (b.cheerT > 0) { b.cheerT -= dt; hop = Math.abs(Math.sin(b.cheerT * 12)) * 0.3; }
      r.root.position.y = b.y + hop;
      const sq = b.moving ? 1 + Math.sin(b.phase * 2) * 0.08 : 1;
      r.root.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      if (b.state === 'work' || b.state === 'munch') {
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

  // strikers hold a "NO PAY NO WORK" picket sign over their heads (where the log goes)
  strikeSign(b) {
    const r = b.rig;
    if (!r.logJ) return;
    if (b.strike && !b.sign) {
      let sign = null;
      try { sign = FM?.makeStrikeSign?.() || null; } catch { sign = null; }
      if (!sign) {
        sign = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.6), new THREE.MeshLambertMaterial({ color: 0xf4ead0 }));
        board.position.y = 6;
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
        stick.position.y = 2;
        sign.add(board, stick);
      } else {
        // models are in world units; the beaver joint is in voxels
        const ws = new THREE.Vector3();
        r.root.updateMatrixWorld(true);
        r.logJ.getWorldScale(ws);
        sign.scale.setScalar(1 / Math.max(1e-3, ws.x));
      }
      r.logJ.add(sign);
      b.sign = sign;
    }
    if (b.sign) b.sign.visible = !!b.strike;
    if (b.strike && r.props?.log) r.props.log.visible = false;
  }

  serialize() {
    // logs on the ground live in state.groundLogs; count the ones being carried too
    this.fall.saveLogs();
    for (const b of this.list) if (b.carry && !b.carry.ore) this.game.state.groundLogs.push([+b.x.toFixed(2), +b.z.toFixed(2), 0, b.carry.variant || 0]);
    return { n: this.list.length, clears: [...this.clears.values()].map((c) => [c.x, c.z]) };
  }

  loadClears(list) {
    for (const [x, z] of list || []) {
      const g = this.game.grid;
      const k = this.clearKind(x, z);
      if (k) this.clears.set(z * g.w + x, { i: z * g.w + x, x, z, kind: k, progress: 0, assigned: null, order: this.clears.size, markT: -99 });
    }
    this.fall.loadLogs();
    this.renderMarkers();
  }
}

// a stand-in construction marker: 4 posts and yellow/black tape around the tile
let TAPE_MATS = null;
function fallbackTape(seed) {
  if (!TAPE_MATS) {
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 2;
    const cx = cv.getContext('2d');
    for (let x = 0; x < 8; x++) { cx.fillStyle = x % 4 < 2 ? '#ffd23a' : '#1a1420'; cx.fillRect(x, 0, 1, 2); }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
    TAPE_MATS = { tape: new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), post: new THREE.MeshLambertMaterial({ color: 0xff7a1a }), postG: new THREE.BoxGeometry(0.06, 0.4, 0.06), tapeG: new THREE.PlaneGeometry(0.9, 0.06) };
  }
  const M = TAPE_MATS;
  const root = new THREE.Group();
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) {
    const p = new THREE.Mesh(M.postG, M.post);
    p.position.set(x, 0.2, z); p.castShadow = true;
    root.add(p);
  }
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Mesh(M.tapeG, M.tape);
    const a = (k * Math.PI) / 2;
    t.position.set(Math.cos(a) * 0.45, 0.32, Math.sin(a) * 0.45);
    t.rotation.y = a + Math.PI / 2;
    root.add(t);
  }
  root.rotation.y = (seed % 4) * 0.08;
  return { root, update() {}, setProgress() {}, dispose() {} };
}
