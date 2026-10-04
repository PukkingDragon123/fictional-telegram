// [F&S mining] The mining layer of "Flint & Steel".
//
//  - ORE VEINS: glittering outcrops on the rock of the north mountain (and in the
//    walls of Flint's Quarry). Tap one to mark it: beavers with pickaxes (research
//    r_mine_pick, faster + iron/gold with r_mine_helmet, crystal with r_mine_crystal)
//    walk up, mine a sack of ore (one paid beaver job each), and haul the sacks to an
//    Ore Shed like logs to a Wood Garage. Every stocked sack goes into game.res.
//    Veins run dry and grow back a little every morning.
//  - THE BEAR MINE (r_mine_mine): dig a mine into the quarry wall and HIRE worker bears
//    (hard hats, hi-vis, lunchboxes). They walk in, dig, walk out with ore and dump it in
//    the ore bin (-> game.res). They eat lunch at the canteen: send lunch runs from your
//    food (Lunch Pail Line r_mine_lunch does it by itself) or they go on STRIKE.
//    Machines (Ore Drill, Ore Cart Rail, Steam Excavator) make the mine dig more.
//  - FLINT: the badger prospector of the quarry. Mountain Survey (r_mine_survey, Lab)
//    lifts his fog; his rig events (clank, fizz...) get their sounds here.
//
// State: game.state.mining = { v: { veinId: [left, marked] }, sacks: [[x, z, kind, n, veinId]],
//   mine: { built, buildT, workers: [{ id, seed, name, hunger, strike, trips }], meals,
//   machines: { drill, rail, excavator }, dug, dugDay, dugToday }, regrowDay, hints: {} }
//
// API used by other systems:
//   beavers: findBeaverJob(b, maxD) jobValid(job) jobTarget(job) unassignJob(job) claimJob(b, job)
//            workBeaver(b, job, dt) findOreHaul(b) startHaul(b, job) updateOreHaul(b, dt, speedMult) dropOre(b)
//   industry / auto-haulers: sackList() -> [{ x, z, kind, n, claim, ref }], takeSack(sack) -> { kind, n } | null
//   UI (src/ui/MiningUI.js): veins, mineInfo(), buildMine(), hire(), fire(i), lunchRun(), buildMachine(id), sellOre(id, n)
//   tapAt(sx, sy) -> boolean (Input.js)
// Events: veinMarked veinMined oreStocked mineStarted mineBuilt mineHired lunchRun mineMachine mineOre mineStrike oreSold needOreShed
import * as THREE from 'three';
import { KIND } from '../world/grid.js';
import { QUARRY, QUARRY_VEINS } from '../world/quarry.js';
import { ZONE_BY_ID } from '../data/zones.js';
import { FOOD_ITEMS, STORAGE } from '../data/foods.js';
import { BEAR_TYPES, FIRST_NAMES } from '../data/bears.js';
import { makeBearLook, lookDef } from '../entities/bearLook.js';
import { BearRig } from '../entities/bearRig.js';
import { hash2, angleDiff, damp } from '../core/rng.js';
import { RES_INFO } from './Resources.js';
import * as MM from '../entities/extra/miningModels.js';
import { HAUL_SPEED } from './BeaverSystem.js';
import { MiningUI } from '../ui/MiningUI.js';

const farmMods = import.meta.glob('../entities/farmModels.js', { eager: true });
const FM = farmMods['../entities/farmModels.js'] || null;

// what each vein kind holds, gives per job, and what it needs
export const VEIN_KINDS = {
  stone: { cap: 12, n: 3, tier: 1, time: 9 },
  coal: { cap: 10, n: 3, tier: 1, time: 10 },
  copper: { cap: 8, n: 2, tier: 1, time: 11 },
  iron: { cap: 8, n: 2, tier: 2, time: 12 },
  gold: { cap: 4, n: 1, tier: 2, time: 14 },
  crystal: { cap: 3, n: 1, tier: 3, time: 16 },
};
export const TIER_NODE = { 1: 'r_mine_pick', 2: 'r_mine_helmet', 3: 'r_mine_crystal' };
export const TIER_NAME = { 1: 'Beaver Pickaxes', 2: 'Drill Helmets', 3: 'Gentle Dynamite' };
const SACK_MAX_PER_VEIN = 3;

// the Bear Mine
export const MINE = {
  buildCost: 250, buildTime: 24, // coins, sim seconds of scaffolding
  slots: 3, // worker bears (+ mods.mineSlots)
  hireBase: 60, hireStep: 30,
  trip: 20, // sim seconds a worker digs inside before a load comes out
  mealsCap: 24,
  drain: 0.6, // hunger lost per work day
  meal: 0.7, // one lunch pail
  strikeAt: 0.2,
};
export const MACHINES = {
  drill: { name: 'Ore Drill', icon: 'drill', node: 'r_mine_drill', coins: 300, res: { copper: 10, stone: 10 }, desc: 'The crew digs 50% faster, and deeper: more iron and gold.' },
  rail: { name: 'Ore Cart Rail', icon: 'minecart', node: 'r_mine_rail', coins: 450, res: { iron: 12, stone: 20 }, desc: 'Carts roll the ore to the bin. Trips 40% faster, nobody walks.' },
  excavator: { name: 'Steam Excavator', icon: 'excavator', node: 'r_mine_excavator', coins: 900, res: { iron: 20, gold: 4 }, desc: 'Digs as much as the whole crew, and finds crystals. Needs one bear on shift.' },
};
const ORE_TABLE = { stone: 30, coal: 28, copper: 22, iron: 14, gold: 4, crystal: 0 };
const WORKER_LINES = {
  work: ['Another day, another rock.', 'Hard hat? Check. Lunch? Hopefully.', 'Dig dig dig.', 'This one\'s shiny!', 'My back. My poor back.'],
  eat: ['Lunch! Finally!', 'Meatloaf AGAIN? ...I love it.', 'Best part of the shift.', 'Mmm, crunchy.'],
  strike: ['NO LUNCH, NO ORE!', 'We want lunch pails!', 'On strike! Feed us!', 'Empty tummy, empty mine!'],
  hired: ['Reporting for duty, boss!', 'Where do I dig?', 'I brought my own lunchbox. It\'s empty.'],
  happy: ['Lunch is served!', 'Ooh, pails!', 'Back to work, fellas!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WORKER_SCALE = 0.78; // worker bears a touch smaller than the customers, to fit the quarry
const _v = new THREE.Vector3();

export class Mining {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'mining';
    game.scene.add(this.group);
    this.time = 0;
    this.veins = [];
    this.byId = new Map();
    this.sackMeshes = new Map();
    this.workers = [];
    this.carts = [];
    this.site = null;
    this.hintT = 3;
    this.buildVeins();
    this.ui = new MiningUI(this);
    game.on('day', () => this.onDay());
    game.on('research', (r) => this.onResearch(r));
  }

  // ------------------------------------------------------------------ state
  get S() {
    const st = this.game.state;
    const S = (st.mining && typeof st.mining === 'object') ? st.mining : (st.mining = {});
    S.v ||= {}; S.sacks ||= []; S.hints ||= {};
    S.mine ||= { built: 0, buildT: null, workers: [], meals: 0, machines: {}, dug: 0, dugToday: 0, dugDay: 0 };
    S.mine.machines ||= {}; S.mine.workers ||= [];
    return S;
  }
  has(id) { return (this.game.state.research || []).includes(id); }
  tierOk(tier) { return this.has(TIER_NODE[tier]); }
  quarryOpen() { return !!this.game.zones?.isOpen('quarry'); }

  // ------------------------------------------------------------------ veins
  buildVeins() {
    const g = this.game.grid;
    const { w } = g;
    const Q = QUARRY;
    const out = [];
    const add = (x, z, kind, inQuarry = false) => {
      const id = 'v' + out.length;
      out.push({ id, x, z, kind, quarry: inQuarry, i: z * w + x, assigned: null, obj: null });
    };
    // the quarry's back wall + sides
    for (const [x, z, kind] of QUARRY_VEINS) add(x, z, kind, true);
    // the mountain: rock tiles, spaced out, richer the higher they sit
    const cands = [];
    for (let z = 6; z <= 20; z++)
      for (let x = 7; x < w - 7; x++) {
        const i = z * w + x;
        const k = g.kind[i];
        if (k !== KIND.ROCK && k !== KIND.SNOW && !(k === KIND.FOREST && z < 21)) continue;
        // the camera aims at y = 0 and stops at z = 9: only spots it can frame
        if (z + 0.5 - g.height[i] * 1.04 < 4) continue;
        if (x >= 62 && x <= 78 && z <= 10) continue; // the office plateau
        if (x >= Q.x0 - 3 && x <= Q.x1 + 3 && z >= Q.z0 - 3 && z <= Q.z1 + 4) continue;
        if (g.deco[i] >= 0 || g.meadow[i] || g.isWater(x, z)) continue;
        let near = false; // never next to the trail
        for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2; dx++) { const j = (z + dz) * w + x + dx; if (g.kind[j] === KIND.TRAIL) { near = true; break; } }
        if (near) continue;
        cands.push([hash2(x, z, 4401) * (k === KIND.FOREST ? 1.6 : 1), x, z, g.height[i]]);
      }
    cands.sort((a, b) => a[0] - b[0]);
    const placed = [];
    for (const [, x, z, h] of cands) {
      if (placed.length >= 22) break;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 6)) continue;
      placed.push([x, z]);
      const t = hash2(x, z, 4403);
      const kind = h >= 8 ? (t < 0.4 ? 'crystal' : t < 0.75 ? 'gold' : 'iron')
        : h >= 5 ? (t < 0.35 ? 'iron' : t < 0.55 ? 'gold' : t < 0.8 ? 'copper' : 'coal')
          : (t < 0.3 ? 'coal' : t < 0.6 ? 'copper' : t < 0.8 ? 'stone' : 'iron');
      add(x, z, kind);
    }
    // a sightline: no tall trees right in front of (south of) a mountain vein
    let cut = 0;
    const W = this.game.world;
    for (const v of out) {
      if (v.quarry) continue;
      for (let dz = 0; dz <= 2; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = v.x + dx, z = v.z + dz;
        if (!g.inb(x, z) || (dx === 0 && dz === 0)) continue;
        const j = z * w + x;
        if (g.deco[j] >= 0) { const d = W.decos[g.deco[j]]; if (d) d.removed = true; g.deco[j] = -1; cut++; }
      }
    }
    if (cut) W.buildDecos?.();
    // the highest spots always hold the treasure
    const top = out.filter((v) => !v.quarry).sort((a, b) => g.height[b.i] - g.height[a.i]).slice(0, 3);
    top.forEach((v, k) => { v.kind = ['crystal', 'gold', 'crystal'][k]; });
    this.veins = out;
    for (const v of out) this.byId.set(v.id, v);
  }
  veinState(v) {
    const S = this.S;
    let a = S.v[v.id];
    if (!Array.isArray(a)) a = S.v[v.id] = [VEIN_KINDS[v.kind].cap, 0];
    return a;
  }
  left(v) { return this.veinState(v)[0]; }
  veinCap(v) { return VEIN_KINDS[v.kind].cap; }
  marked(v) { return !!this.veinState(v)[1]; }
  veinPos(v) { const g = this.game.grid; return { x: v.x + 0.5, y: g.height[v.i], z: v.z + 0.5 }; }
  sacksAt(v) { let n = 0; for (const s of this.S.sacks) if (s[4] === v.id) n++; return n; }

  toggleMark(v, on = !this.marked(v)) {
    const a = this.veinState(v);
    a[1] = on ? 1 : 0;
    if (!on && v.assigned) this.game.beavers.release(v.assigned);
    this.game.emit('veinMarked', { v, on });
    return on;
  }

  // why beavers can't mine this vein right now ('' = they can)
  veinBlock(v) {
    const K = VEIN_KINDS[v.kind];
    if (!this.tierOk(K.tier)) return `Needs ${TIER_NAME[K.tier]} (research)`;
    if (this.left(v) <= 0) return 'Picked clean. It grows back a little every morning.';
    if (this.sacksAt(v) >= SACK_MAX_PER_VEIN) return 'Sacks are piling up: build an Ore Shed!';
    if (!this.game.beavers.list.length) return 'No beavers yet: build a Beaver Lodge.';
    return '';
  }

  onDay() {
    const S = this.S, day = this.game.state.day;
    if (S.regrowDay === day) return;
    const first = S.regrowDay == null;
    S.regrowDay = day;
    const M = S.mine;
    if (M.dugDay !== day) { M.dugDay = day; M.dugToday = 0; }
    if (first) return;
    const k = 0.5 * (1 + (this.game.mods.veinRegrow || 0));
    for (const v of this.veins) {
      const a = this.veinState(v), cap = VEIN_KINDS[v.kind].cap;
      if (a[0] < cap) a[0] = Math.min(cap, a[0] + Math.ceil(cap * k));
    }
  }

  onResearch(r) {
    if (!r) return;
    if (r.id === 'r_mine_survey') this.surveyT = 1.5;
    if (r.id === 'r_mine_pick' && !this.S.hints.pick) {
      this.S.hints.pick = 1;
      setTimeout(() => this.game.notify('Beaver Pickaxes! Tap a glittering ore vein on the mountain to mark it for mining.', 'excited', { dur: 5 }), 400);
    }
    if (r.id === 'r_mine_lunch') this.siteDirty = true;
  }

  // ------------------------------------------------------------------ beaver jobs (BeaverSystem hooks)
  findBeaverJob(b, maxD = Infinity) {
    if (!this.has('r_mine_pick')) return null;
    let best = null, bd = maxD;
    for (const v of this.veins) {
      if (!this.marked(v) || (v.assigned && v.assigned !== b) || this.veinBlock(v)) continue;
      const p = this.veinPos(v);
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return null;
    return { kind: 'mine', v: best, stand: this.standSpot(best, b), at: this.veinPos(best) };
  }
  standSpot(v, b) {
    const g = this.game.grid;
    const p = this.veinPos(v);
    // in front of the outcrop (camera side), a little to the side the beaver comes from
    const side = b && b.x < p.x ? -1 : 1;
    for (const [dx, dz] of [[side * 0.32, 0.5], [-side * 0.32, 0.5], [side * 0.55, 0.1], [0, 0.55]]) {
      const x = p.x + dx, z = p.z + dz;
      if (!g.isWater(Math.floor(x), Math.floor(z))) return { x, z };
    }
    return { x: p.x, z: p.z + 0.5 };
  }
  jobValid(job) { return !!job.v && this.marked(job.v) && this.left(job.v) > 0; }
  jobTarget(job) { return job.at || this.veinPos(job.v); }
  unassignJob(job) {
    if (job.kind === 'mine' && job.v && job.v.assigned) job.v.assigned = null;
    if (job.kind === 'orehaul' && job.sack) job.sack.claim = null;
  }
  claimJob(b, job) { if (job.kind === 'mine') job.v.assigned = b; }

  // one tick of a beaver hacking at a vein; true when a sack is done (or the job is gone)
  workBeaver(b, job, dt) {
    const game = this.game;
    const v = job.v;
    if (!this.jobValid(job)) return true;
    const K = VEIN_KINDS[v.kind];
    const speed = (game.mods.buildSpeed || 1) * (1 + (game.mods.mineSpeed || 0)) * (1 + 0.2 * ((game.state.beaverLevel || 1) - 1));
    job.progress = (job.progress || 0) + (dt * speed) / K.time;
    const p = this.veinPos(v);
    job.chipT = (job.chipT || 0) - dt;
    if (job.chipT <= 0) {
      job.chipT = 0.36;
      const C = MM.ORE_COL[v.kind];
      const hx = (b.x + p.x) / 2, hz = (b.z + p.z) / 2;
      game.particles.debris(hx, p.y + 0.35, hz, 3, [...C.a, 0x8e8690, 0x7e7680]);
      if (Math.random() < 0.5) game.particles.sparkle?.(hx, p.y + 0.4, hz, 2, C.glint);
      if (this.near(p.x, p.z, 22)) game.audio.play('pick_clank', { volume: 0.18, pitch: 0.9 + Math.random() * 0.3 });
      if (Math.random() < 0.12) game.particles.word?.(pick(['pow', 'bonk', 'bam']), p.x, p.y + 1.0, p.z, { size: 0.2, life: 0.5 });
      v.shake = 0.18;
    }
    if (job.progress < 1) return false;
    // a sack of ore drops out of the rock
    const a = this.veinState(v);
    const n = Math.min(a[0], K.n);
    a[0] -= n;
    if (n > 0) {
      const sx = p.x + (b.x - p.x) * 0.6 + (Math.random() - 0.5) * 0.3, sz = p.z + 0.45 + Math.random() * 0.25;
      this.S.sacks.push([+sx.toFixed(2), +sz.toFixed(2), v.kind, n, v.id]);
      game.particles.puff(sx, p.y + 0.2, sz, 5, 0.3);
      game.particles.debris(p.x, p.y + 0.5, p.z, 8, MM.ORE_COL[v.kind].a);
      if (v.kind === 'gold' || v.kind === 'crystal') { game.particles.sparkle?.(p.x, p.y + 0.6, p.z, 10, MM.ORE_COL[v.kind].glint); game.particles.word?.('gold', p.x, p.y + 1.2, p.z, { size: 0.28 }); }
      game.ui?.floatTextAt?.(p.x, p.y + 1.1, p.z, `+${n} ${RES_INFO[v.kind].name}`, '#fff0b0');
      game.audio.play('ore_drop', { volume: 0.3 });
      game.emit('veinMined', { v, n });
      game.stats.veinsMined = (game.stats.veinsMined || 0) + 1;
    }
    if (a[0] <= 0) { a[1] = 0; game.particles.puff(p.x, p.y + 0.3, p.z, 10, 0.5); }
    return true;
  }

  // ------------------------------------------------------------------ ore sacks + hauling
  sheds() { return this.game.structures.list.filter((s) => s.type === 'oreshed' && s.built && !s.removed); }
  shedDoor(s) { return { x: s.x + 1, z: s.z + 2.15 }; }
  sackList() {
    return this.S.sacks.map((s) => ({ x: s[0], z: s[1], kind: s[2], n: s[3], claim: s.claim || null, ref: s }));
  }
  takeSack(sack) {
    const ref = sack?.ref || sack;
    const i = this.S.sacks.indexOf(ref);
    if (i < 0 || ref.claim) return null;
    this.S.sacks.splice(i, 1);
    return { kind: ref[2], n: ref[3] };
  }
  findOreHaul(b) {
    const S = this.S;
    if (!S.sacks.length) return null;
    const sheds = this.sheds();
    if (!sheds.length) return null;
    let best = null, bd = Infinity;
    for (const s of S.sacks) {
      if (s.claim) continue;
      const d = Math.hypot(s[0] - b.x, s[1] - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    let shed = null, sd = Infinity;
    for (const s of sheds) { const d = this.shedDoor(s), dd = Math.hypot(d.x - best[0], d.z - best[1]); if (dd < sd) { sd = dd; shed = s; } }
    return { kind: 'orehaul', sack: best, shed, phase: 'fetch' };
  }
  startHaul(b, job) { if (job.sack) job.sack.claim = b; }
  dropOre(b) {
    if (!b.carry?.ore) return;
    this.S.sacks.push([+(b.x + Math.cos(b.heading) * 0.3).toFixed(2), +(b.z + Math.sin(b.heading) * 0.3).toFixed(2), b.carry.ore, b.carry.n || 1, null]);
    b.carry = null;
  }
  updateOreHaul(b, dt, speedMult) {
    const game = this.game, B = game.beavers;
    const job = b.job;
    const run = 3.8 * speedMult ** 0.5;
    if (job.phase === 'fetch') {
      const s = job.sack;
      if (!this.S.sacks.includes(s)) { B.release(b); return; }
      if (B.moveToward(b, s[0], s[1], dt, run, 0.32)) { job.phase = 'pick'; b.t = 0; }
    } else if (job.phase === 'pick') {
      b.t += dt;
      b.heading += angleDiff(b.heading, Math.atan2(job.sack[1] - b.z, job.sack[0] - b.x)) * Math.min(1, dt * 8);
      if (b.t >= 0.45) {
        const s = job.sack;
        const i = this.S.sacks.indexOf(s);
        if (i < 0) { B.release(b); return; }
        this.S.sacks.splice(i, 1);
        s.claim = null;
        b.carry = { ore: s[2], n: s[3] };
        job.sack = null;
        game.particles.dust(s[0], game.grid.groundAt(s[0], s[1]), s[1], 3);
        game.audio.play('grab', { volume: 0.3, pitch: 0.7 });
        job.phase = 'carry';
        if (!job.shed || job.shed.removed) job.shed = this.sheds()[0] || null;
        if (!job.shed) { this.dropOre(b); B.release(b); }
      }
    } else if (job.phase === 'carry') {
      let s = job.shed;
      if (!s || s.removed || !s.built) { s = job.shed = this.sheds()[0] || null; if (!s) { this.dropOre(b); B.release(b); return; } }
      const d = this.shedDoor(s);
      if (B.moveToward(b, d.x, d.z, dt, HAUL_SPEED * speedMult ** 0.3, 0.3)) { job.phase = 'drop'; b.t = 0; }
    } else if (job.phase === 'drop') {
      b.t += dt;
      const s = job.shed;
      b.heading += angleDiff(b.heading, Math.atan2(s.z + 1 - b.z, s.x + 1 - b.x)) * Math.min(1, dt * 8);
      if (b.t >= 0.35) {
        const d = this.shedDoor(s), gy = game.structures.baseY?.(s) ?? 0;
        const c = b.carry;
        b.carry = null;
        if (c?.ore) {
          game.res.add(c.ore, c.n || 1, d.x, d.z - 0.5);
          game.ui?.floatTextAt?.(d.x, gy + 1.2, d.z - 0.5, `+${c.n || 1} ${RES_INFO[c.ore].name}`, '#fff0b0');
          game.particles.puff(d.x, gy + 0.2, d.z - 0.5, 5, 0.25);
          game.particles.debris(d.x, gy + 0.4, d.z - 0.6, 4, MM.ORE_COL[c.ore].a);
          game.audio.play('ore_drop', { volume: 0.35 });
          game.emit('oreStocked', { kind: c.ore, n: c.n || 1, shed: s });
        }
        B.release(b);
        b.cheerT = 0.35;
      }
    }
  }

  // beaver look: a pickaxe while mining, drill helmets after the research, a sack on the shoulder
  patchBeaver(b) {
    const r = b.rig;
    if (!r?.gripR || !r._post || r._fsMine) return;
    r._fsMine = true;
    const pickM = new THREE.Mesh(MM.beaverPickGeo(), MM.MINING_MAT());
    pickM.rotation.x = Math.PI / 2; pickM.position.set(0, -0.05, 0.02); pickM.visible = false; pickM.castShadow = true;
    r.gripR.add(pickM);
    const helm = new THREE.Mesh(MM.beaverHelmetGeo(), MM.MINING_MAT());
    helm.visible = false; helm.castShadow = true;
    r.hat?.add(helm);
    let sack = null, sackKind = null;
    const orig = r._post.bind(r);
    r._post = (p, dt, O) => {
      orig(p, dt, O);
      const mining = b.state === 'work' && b.job?.kind === 'mine';
      pickM.visible = mining;
      if (mining && r.props?.mallet) r.props.mallet.visible = false;
      const helmet = this.has('r_mine_helmet');
      helm.visible = helmet;
      if (r.hatMesh) r.hatMesh.visible = !helmet;
      const ore = b.carry?.ore || null;
      if (ore) {
        if (r.props?.log) r.props.log.visible = false;
        if (!sack || sackKind !== ore) {
          if (sack) sack.parent?.remove(sack);
          sack = MM.makeOreSack(ore);
          sackKind = ore;
          const ws = new THREE.Vector3();
          r.root.updateMatrixWorld(true);
          r.logJ.getWorldScale(ws);
          sack.scale.setScalar(1.3 / Math.max(1e-3, ws.x));
          sack.position.y = -0.1 / Math.max(1e-3, ws.x);
          r.logJ.add(sack);
        }
        sack.visible = true;
      } else if (sack) sack.visible = false;
    };
  }

  // ------------------------------------------------------------------ the Bear Mine
  slots() { return MINE.slots + Math.floor(this.game.mods.mineSlots || 0); }
  hirePrice() { return MINE.hireBase + MINE.hireStep * this.S.mine.workers.length; }
  mealsCap() { return Math.max(8, Math.min(MINE.mealsCap, 4 + 4 * this.S.mine.workers.length)); }
  machine(id) { return !!this.S.mine.machines[id]; }

  mineInfo() {
    const M = this.S.mine;
    return {
      unlocked: this.has('r_mine_mine'), open: this.quarryOpen(), built: !!M.built, building: M.buildT != null && !M.built,
      buildLeft: M.buildT, buildTime: MINE.buildTime, buildCost: MINE.buildCost, workers: M.workers, slots: this.slots(), hirePrice: this.hirePrice(),
      meals: M.meals, mealsCap: this.mealsCap(), lunchFood: this.lunchFoodCount(), autoLunch: this.has('r_mine_lunch'),
      machines: Object.fromEntries(Object.keys(MACHINES).map((k) => [k, { ...MACHINES[k], id: k, built: this.machine(k), unlocked: this.has(MACHINES[k].node) }])),
      dug: M.dug || 0, dugToday: M.dugDay === this.game.state.day ? M.dugToday || 0 : 0, striking: M.workers.filter((w) => w.strike).length,
    };
  }

  buildMine() {
    const game = this.game, M = this.S.mine;
    if (!this.has('r_mine_mine')) return { ok: false, msg: 'Research The Bear Mine first.' };
    if (M.built || M.buildT != null) return { ok: false, msg: 'Already digging!' };
    if (!game.canAfford(MINE.buildCost)) return { ok: false, msg: 'Not enough coins.' };
    game.spend(MINE.buildCost, 'build');
    M.buildT = MINE.buildTime;
    this.siteDirty = true;
    game.audio.play('build', { volume: 0.5 });
    game.emit('mineStarted');
    game.save();
    return { ok: true };
  }

  hire() {
    const game = this.game, M = this.S.mine;
    if (!M.built) return { ok: false, msg: 'Dig the mine first.' };
    if (M.workers.length >= this.slots()) return { ok: false, msg: 'No more bunks. Research Double Shift.' };
    const price = this.hirePrice();
    if (!game.canAfford(price)) return { ok: false, msg: 'Not enough coins.' };
    game.spend(price, 'build');
    const seed = (Math.random() * 4294967296) >>> 0;
    const name = FIRST_NAMES[seed % FIRST_NAMES.length];
    const w = { id: 'w' + (M.nextId = (M.nextId || 0) + 1), seed, name, hunger: 1, strike: false, trips: 0 };
    M.workers.push(w);
    const ent = this.spawnWorker(w, true);
    if (ent) setTimeout(() => this.say(ent, pick(WORKER_LINES.hired), 'happy'), 300);
    game.audio.play('coins', { volume: 0.4 });
    game.emit('mineHired', w);
    game.save();
    return { ok: true, w };
  }

  fire(i) {
    const M = this.S.mine;
    const w = M.workers[i];
    if (!w) return false;
    M.workers.splice(i, 1);
    const e = this.workers.find((x) => x.w === w);
    if (e) this.despawnWorker(e);
    this.game.save();
    return true;
  }

  // food a lunch run can take: bear food in your food inventory, then pantries / snack bowls
  lunchFoodCount() {
    let n = 0;
    const inv = this.game.state.food || {};
    for (const [id, c] of Object.entries(inv)) if (FOOD_ITEMS[id]?.bear?.meal && FOOD_ITEMS[id].kind !== 'bag') n += Math.floor(c);
    for (const s of this.pantries()) n += this.game.foodStore.stored(s);
    return n;
  }
  pantries() { return this.game.structures.list.filter((s) => s.built && !s.removed && STORAGE[s.type]?.for === 'bear'); }
  takeMeals(want) {
    const game = this.game;
    let got = 0;
    const inv = game.state.food || {};
    const ids = Object.keys(inv).filter((id) => FOOD_ITEMS[id]?.bear?.meal && FOOD_ITEMS[id].kind !== 'bag').sort((a, b) => (inv[b] || 0) - (inv[a] || 0));
    for (const id of ids) {
      while (got < want && game.foodStore.count(id) > 0) { game.foodStore.take(id, 1); got++; }
      if (got >= want) break;
    }
    for (const s of this.pantries()) {
      while (got < want && game.foodStore.stored(s) > 0) { if (!game.foodStore.takeFrom(s)) break; got++; }
      if (got >= want) break;
    }
    return got;
  }
  lunchRun({ auto = false } = {}) {
    const game = this.game, M = this.S.mine;
    if (!M.built) return { ok: false, msg: 'Dig the mine first.' };
    const room = this.mealsCap() - M.meals;
    if (room <= 0) return { ok: false, msg: 'The canteen is full!' };
    const got = this.takeMeals(Math.min(room, auto ? Math.max(1, M.workers.length * 2 - M.meals) : room));
    if (!got) return { ok: false, msg: auto ? '' : 'No bear food! Harvest crops, or stock a pantry.' };
    M.meals += got;
    this.pail = { t: 0, n: got };
    const C = QUARRY.canteen;
    const y = this.game.grid.groundAt(C.x, C.z);
    if (!auto || this.near(C.x, C.z, 30)) {
      game.audio.play('lunch_bell', { volume: auto ? 0.25 : 0.45 });
      game.particles.puff(C.x, y + 0.9, C.z, 8, 0.3);
      game.particles.hearts?.(C.x, y + 1.4, C.z, 3);
    }
    game.ui?.floatTextAt?.(C.x, y + 1.6, C.z, `+${got} lunch pail${got > 1 ? 's' : ''}`, '#c8ff9a');
    // strikers cheer and go eat
    for (const e of this.workers) if (e.w.strike) { e.mode = 'toEat'; this.say(e, pick(WORKER_LINES.happy), 'happy'); }
    game.emit('lunchRun', { n: got, auto });
    game.save();
    return { ok: true, n: got };
  }

  buildMachine(id) {
    const game = this.game, D = MACHINES[id], M = this.S.mine;
    if (!D) return { ok: false };
    if (!M.built) return { ok: false, msg: 'Dig the mine first.' };
    if (M.machines[id]) return { ok: false, msg: 'Already built.' };
    if (!this.has(D.node)) return { ok: false, msg: 'Research it first.' };
    if (!game.canAfford(D.coins)) return { ok: false, msg: 'Not enough coins.' };
    if (!game.res.hasAll(D.res)) return { ok: false, msg: `Needs ${game.res.billText(D.res)}.` };
    game.spend(D.coins, 'build');
    game.res.takeAll(D.res);
    M.machines[id] = 1;
    this.siteDirty = true;
    this.machinePop = { id, t: 0 };
    game.audio.play('levelup', { volume: 0.5 });
    game.emit('mineMachine', id);
    game.save();
    return { ok: true };
  }

  // Flint buys raw ore (a fair price, he says)
  sellOre(id, n) {
    const game = this.game;
    const info = RES_INFO[id];
    if (!info || info.kind !== 'ore') return { ok: false };
    n = Math.min(n, game.res.count(id));
    if (n <= 0 || !game.res.take(id, n)) return { ok: false, msg: 'None to sell.' };
    const coins = Math.max(1, Math.round(n * info.value));
    game.earnMisc(coins, 'trade');
    game.audio.play('coins', { volume: 0.45 });
    game.emit('oreSold', { id, n, coins });
    return { ok: true, coins };
  }

  rollOre(rnd = Math.random) {
    const T = { ...ORE_TABLE };
    if (this.machine('drill')) { T.iron += 10; T.gold += 4; T.copper += 4; }
    if (this.machine('excavator')) T.crystal += 2;
    let tot = 0;
    for (const v of Object.values(T)) tot += v;
    let x = rnd() * tot;
    for (const [k, v] of Object.entries(T)) { x -= v; if (x <= 0) return k; }
    return 'stone';
  }
  addOre(kind, n, x, z, label = true) {
    const game = this.game, M = this.S.mine;
    game.res.add(kind, n, x, z);
    M.dug = (M.dug || 0) + n;
    if (M.dugDay !== game.state.day) { M.dugDay = game.state.day; M.dugToday = 0; }
    M.dugToday += n;
    if (label && this.siteVisible && this.near(x, z, 30)) game.ui?.floatTextAt?.(x, game.grid.groundAt(x, z) + 1.4, z, `+${n} ${RES_INFO[kind].name}`, kind === 'gold' || kind === 'crystal' ? '#fff3a0' : '#f0e6d8');
    game.emit('mineOre', { kind, n });
  }

  // ------------------------------------------------------------------ worker bears (runtime)
  spawnWorker(w, fresh = false) {
    if (this.workers.some((e) => e.w === w)) return null;
    let rig = null;
    try {
      const def0 = BEAR_TYPES.construction;
      w.look ||= makeBearLook('construction', def0, w.seed);
      rig = new BearRig('construction', lookDef(def0, w.look));
      rig.personalize?.(w.seed % 997);
    } catch (e) { console.warn('worker bear', e); return null; }
    const Q = QUARRY;
    const e = { w, rig, x: Q.mine.x + (Math.random() - 0.5), z: Q.mine.z + 0.4, y: 0, heading: Math.PI / 2, mode: 'inside', t: 2 + Math.random() * 6, moving: false, sayT: 5 + Math.random() * 20, carry: null };
    if (fresh) { e.mode = 'walkIn'; e.x = Q.canteen.x; e.z = Q.canteen.z + 1.2; }
    e.y = this.game.grid.groundAt(e.x, e.z);
    if (w.strike) { e.mode = 'toStrike'; e.x = Q.mine.x; }
    rig.root.visible = false;
    rig.root.scale.setScalar(WORKER_SCALE);
    this.group.add(rig.root);
    this.workers.push(e);
    return e;
  }
  despawnWorker(e) {
    this.group.remove(e.rig.root);
    try { e.rig.dispose?.(); } catch { /* ignore */ }
    this.workers.splice(this.workers.indexOf(e), 1);
  }
  say(e, text, mood = 'happy') {
    if (!e?.rig?.root.visible) return;
    this.game.say({ getWorldPos: (p) => p.set(e.x, e.y + 2.2, e.z) }, text, { voice: 'bear', mood, dur: 2.4, size: 's', key: 'mineb' + e.w.id });
  }
  moveTo(e, x, z, dt, speed = 1.5, stop = 0.15) {
    const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
    if (d <= stop) { e.moving = false; return true; }
    const step = Math.min(d - stop * 0.9, speed * dt);
    e.x += (dx / d) * step; e.z += (dz / d) * step;
    e.heading += angleDiff(e.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 7);
    e.moving = step > 1e-4;
    return false;
  }
  workHours() {
    const st = this.game.state;
    return (st.phase === 'day' || st.phase === 'rush') && st.hour >= 9 && st.hour < 18;
  }
  tripTime() {
    let t = MINE.trip;
    if (this.machine('drill')) t /= 1.5;
    if (this.machine('rail')) t /= 1.4;
    return t;
  }

  updateWorkers(simDt, dt) {
    const game = this.game, M = this.S.mine, Q = QUARRY;
    const g = game.grid;
    if (!M.built) return;
    for (const w of M.workers) if (!this.workers.some((e) => e.w === w)) this.spawnWorker(w);
    const work = this.workHours();
    const lunchTime = game.state.hour >= 12 && game.state.hour < 13.2;
    const dayLen = game.dayLength?.() || 180;
    const entrance = { x: Q.mine.x, z: Q.mine.z + 0.35 };
    const sdt = simDt || 0;
    for (const e of this.workers) {
      const w = e.w;
      // hunger drains while the shift runs
      if (work && sdt > 0 && !w.strike) w.hunger = Math.max(0, w.hunger - (sdt / dayLen) * MINE.drain);
      if (!w.strike && w.hunger <= MINE.strikeAt && M.meals <= 0 && work) {
        w.strike = true;
        if (e.mode === 'inside') { e.x = entrance.x; e.z = entrance.z; }
        e.mode = 'toStrike';
        if (M.strikeNag !== game.state.day) { M.strikeNag = game.state.day; game.notify('The mine bears are on STRIKE! Send them a lunch run (tap the mine).', 'warn', { dur: 5 }); game.emit('mineStrike'); }
      }
      if (w.strike && M.meals > 0 && e.mode !== 'eat' && e.mode !== 'toEat') e.mode = 'toEat';
      const hungry = w.hunger < 0.8 && M.meals > 0 && (lunchTime || w.hunger < 0.35);
      e.moving = false;
      switch (e.mode) {
        case 'inside': {
          if (!work) break;
          if (hungry) { e.mode = 'toEat'; e.x = entrance.x; e.z = entrance.z; break; }
          e.t -= sdt;
          if (e.t <= 0) {
            const kind = this.rollOre();
            const n = 2 + (Math.random() < 0.4 ? 1 : 0);
            w.trips++;
            if (this.machine('rail') && this.rail) {
              this.launchCart(kind, n);
              e.t = this.tripTime() * (0.85 + Math.random() * 0.3);
            } else {
              e.carry = { kind, n };
              e.mode = 'toBin';
              e.x = entrance.x; e.z = entrance.z;
              this.holdSack(e, kind);
            }
          }
          break;
        }
        case 'walkIn': case 'toMine':
          if (this.moveTo(e, entrance.x, entrance.z, sdt || dt * 0.5, 1.6)) {
            e.mode = 'inside'; e.t = this.tripTime() * (0.85 + Math.random() * 0.3);
            if (this.siteVisible) game.particles.dust(e.x, e.y, e.z, 3);
          }
          break;
        case 'toBin': {
          if (this.moveTo(e, Q.bin.x - 0.2, Q.bin.z - 0.85, sdt, 1.4)) { e.mode = 'dump'; e.t = 0.6; e.heading = Math.atan2(Q.bin.z - e.z, Q.bin.x - e.x); }
          break;
        }
        case 'dump':
          e.t -= sdt;
          if (e.t <= 0) {
            const c = e.carry; e.carry = null; this.holdSack(e, null);
            if (c) {
              this.addOre(c.kind, c.n, Q.bin.x, Q.bin.z);
              const y = g.groundAt(Q.bin.x, Q.bin.z);
              if (this.siteVisible) game.particles.debris(Q.bin.x, y + 1.0, Q.bin.z, 6, MM.ORE_COL[c.kind].a);
              if (this.siteVisible && this.near(Q.bin.x, Q.bin.z, 25)) game.audio.play('ore_drop', { volume: 0.3 });
              this.binFill = Math.min(1, (this.binFill || 0) + 0.12);
            }
            e.mode = hungry ? 'toEat' : 'toMine';
          }
          break;
        case 'toEat': {
          const seats = this.site?.canteen?.userData.seats || [[0, -0.4]];
          const k = this.workers.indexOf(e) % seats.length;
          const sx = Q.canteen.x + seats[k][0], sz = Q.canteen.z + seats[k][1] * 1.6;
          if (this.moveTo(e, sx, sz, sdt || dt, 1.5, 0.08)) {
            if (M.meals > 0) { M.meals--; e.mode = 'eat'; e.t = 6; e.heading = Math.atan2(Q.canteen.z - e.z, Q.canteen.x - e.x); this.say(e, pick(WORKER_LINES.eat), 'happy'); }
            else e.mode = w.strike ? 'strike' : 'toMine';
          }
          break;
        }
        case 'eat':
          e.t -= sdt || dt * 0.3;
          if (this.siteVisible && Math.random() < (sdt || dt) * 2) game.particles.debris(e.x, e.y + 1.6, e.z, 1, [0xf07a1a, 0x7ad04a, 0xc03050]);
          if (e.t <= 0) {
            w.hunger = Math.min(1, w.hunger + MINE.meal);
            w.strike = false;
            if (this.siteVisible) game.particles.hearts?.(e.x, e.y + 2.4, e.z, 2);
            e.mode = 'toMine';
          }
          break;
        case 'toStrike': {
          const sx = Q.canteen.x + (this.workers.indexOf(e) % 3 - 1) * 1.4, sz = Q.canteen.z + 1.7 + Math.floor(this.workers.indexOf(e) / 3) * 0.9;
          if (this.moveTo(e, sx, sz, sdt || dt, 1.5)) { e.mode = 'strike'; e.picket = Math.random() * 6; }
          break;
        }
        case 'strike': {
          if (!w.strike) { e.mode = 'toMine'; break; }
          e.picket = (e.picket || 0) + (sdt || dt * 0.3) * 0.5;
          const sx = Q.canteen.x + (this.workers.indexOf(e) % 3 - 1) * 1.4 + Math.cos(e.picket) * 0.35, sz = Q.canteen.z + 1.7 + Math.floor(this.workers.indexOf(e) / 3) * 0.9 + Math.sin(e.picket) * 0.2;
          this.moveTo(e, sx, sz, sdt || dt * 0.3, 0.7, 0.05);
          e.sayT -= dt;
          if (e.sayT <= 0) { e.sayT = 6 + Math.random() * 8; if (this.near(e.x, e.z, 20)) this.say(e, pick(WORKER_LINES.strike), 'angry'); }
          break;
        }
        default: e.mode = 'toMine';
      }
      // chatter now and then
      if (e.mode !== 'strike' && e.mode !== 'inside') { e.sayT -= dt; if (e.sayT <= 0) { e.sayT = 18 + Math.random() * 25; if (this.near(e.x, e.z, 14) && Math.random() < 0.5) this.say(e, pick(WORKER_LINES.work)); } }
      e.y = damp(e.y, g.groundAt(e.x, e.z), 10, dt);
    }
  }
  holdSack(e, kind) {
    try {
      if (!kind) { if (e.sackKind) e.rig.hold(null); e.sackKind = null; return; }
      if (e.sackKind === kind) return;
      const m = MM.makeOreSack(kind);
      e.rig.hold(m);
      e.rig.root.updateMatrixWorld(true);
      const s = new THREE.Vector3();
      m.parent?.getWorldScale(s);
      m.scale.setScalar(2.4 / Math.max(1e-3, s.x));
      e.sackKind = kind;
    } catch { /* optional */ }
  }
  renderWorkers(dt) {
    const showSite = this.siteVisible;
    for (const e of this.workers) {
      const r = e.rig;
      const vis = showSite && e.mode !== 'inside';
      r.root.visible = vis;
      if (!vis) continue;
      r.root.position.set(e.x, e.y, e.z);
      r.root.rotation.set(0, Math.PI / 2 - e.heading, 0);
      let pose = 'idle';
      const o = { speed: e.moving ? 1.5 : 0 };
      if (e.moving) pose = 'walk';
      else if (e.mode === 'eat') pose = 'eat';
      else if (e.mode === 'dump') pose = 'toss';
      else if (e.mode === 'strike') pose = (Math.floor(this.time * 0.4 + (e.w.seed % 7)) % 3 === 0) ? 'angry_stomp' : 'sad';
      if (e.mode === 'strike' && !e.sign) {
        try { e.sign = FM?.makeStrikeSign?.() || null; } catch { e.sign = null; }
        if (e.sign) { r.hold(e.sign); r.root.updateMatrixWorld(true); const s = new THREE.Vector3(); e.sign.parent?.getWorldScale(s); e.sign.scale.setScalar(2.2 / Math.max(1e-3, s.x)); e.sackKind = null; }
      } else if (e.mode !== 'strike' && e.sign) { r.hold(null); e.sign = null; if (e.carry) this.holdSack(e, e.carry.kind); }
      r.pose(pose, Math.max(1e-4, dt), o);
      r.update?.(dt);
    }
  }

  // the ore cart: rolls down the rail, tips into the bin, rolls back
  launchCart(kind, n) {
    const c = this.carts.find((x) => x.state === 'idle');
    if (!c) { this.addOre(kind, n, QUARRY.bin.x, QUARRY.bin.z); return; }
    c.state = 'out'; c.t = 0; c.kind = kind; c.n = n;
    c.obj.userData.setLoad(kind);
    if (this.siteVisible && this.near(QUARRY.mine.x, QUARRY.mine.z, 25)) this.game.audio.play('cart_roll', { volume: 0.25 });
  }
  updateCarts(simDt) {
    const R = this.rail;
    if (!R) return;
    for (const c of this.carts) {
      const sp = 1.6;
      if (c.state === 'out') { c.u += (simDt * sp) / R.len; if (c.u >= 1) { c.u = 1; c.state = 'tip'; c.t = 0; } }
      else if (c.state === 'tip') {
        c.t += simDt;
        c.obj.userData.body.rotation.x = Math.sin(Math.min(1, c.t / 0.8) * Math.PI) * 0.9;
        if (c.t > 0.4 && c.kind) {
          this.addOre(c.kind, c.n, QUARRY.bin.x, QUARRY.bin.z);
          if (this.siteVisible) this.game.particles.debris(QUARRY.bin.x, this.game.grid.groundAt(QUARRY.bin.x, QUARRY.bin.z) + 0.9, QUARRY.bin.z, 6, MM.ORE_COL[c.kind].a);
          if (this.siteVisible && this.near(QUARRY.bin.x, QUARRY.bin.z, 25)) this.game.audio.play('ore_drop', { volume: 0.28 });
          this.binFill = Math.min(1, (this.binFill || 0) + 0.12);
          c.kind = null; c.obj.userData.setLoad(null);
        }
        if (c.t >= 0.9) { c.state = 'back'; c.obj.userData.body.rotation.x = 0; }
      } else if (c.state === 'back') { c.u -= (simDt * sp) / R.len; if (c.u <= 0) { c.u = 0; c.state = 'idle'; } }
      const x = R.x0 + (R.x1 - R.x0) * c.u, z = R.z0 + (R.z1 - R.z0) * c.u;
      c.obj.position.set(x, this.game.grid.groundAt(x, z) + 0.02, z);
      c.obj.visible = c.state !== 'idle' || c === this.carts[0];
      c.spin = (c.spin || 0) + (c.state === 'out' ? 1 : c.state === 'back' ? -1 : 0) * simDt * sp * 8;
      c.obj.userData.spin(c.spin);
    }
  }

  // ------------------------------------------------------------------ the quarry site (models)
  buildSite() {
    const game = this.game, Q = QUARRY;
    const M = this.S.mine;
    if (this.site) { this.group.remove(this.site.root); this.site = null; }
    this.carts.length = 0; this.rail = null;
    const root = new THREE.Group();
    root.name = 'mineSite';
    const gy = (x, z) => game.grid.groundAt(x, z);
    const put = (obj, x, z, ry = 0) => { obj.position.set(x, gy(x, z), z); obj.rotation.y = ry; root.add(obj); return obj; };
    const site = { root };
    if (M.built && !this.S.hints.tidy) {
      // the crew tidies the site: no weeds on the rails
      this.S.hints.tidy = 1;
      const W = game.world;
      for (let z = Q.z0; z <= Q.z1; z++) for (let x = Q.mine.x - 4 | 0; x <= Q.x1; x++) if (W.hasClutter?.(x, z)) W.removeClutter(x, z);
      W.buildClutter?.();
    }
    if (M.built) site.mine = put(MM.makeMineEntrance(), Q.mine.x, Q.mine.z);
    else if (M.buildT != null) site.scaffold = put(MM.makeMineScaffold(), Q.mine.x, Q.mine.z);
    else site.adit = put(MM.makeOldAdit(), Q.mine.x, Q.mine.z);
    if (M.built) {
      site.canteen = put(MM.makeCanteen(), Q.canteen.x, Q.canteen.z);
      site.bin = put(MM.makeOreBin(), Q.bin.x, Q.bin.z);
      if (this.has('r_mine_lunch')) site.pailLine = put(MM.makePailLine(), Q.canteen.x + 1.25, Q.canteen.z + 0.9);
      if (this.machine('drill')) site.drill = put(MM.makeOreDrill(), Q.drill.x, Q.drill.z);
      if (this.machine('excavator')) site.excavator = put(MM.makeExcavator(), Q.excavator.x, Q.excavator.z, 0.35);
      if (this.machine('rail')) {
        const x0 = Q.mine.x, z0 = Q.mine.z + 0.6, x1 = Q.bin.x - 0.25, z1 = Q.bin.z - 0.85;
        const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
        const rail = MM.makeRail(len);
        rail.position.set(x0, gy(x0, z0) + 0.01, z0); rail.rotation.y = ang;
        root.add(rail);
        this.rail = { x0, z0, x1, z1, len, ang };
        for (let i = 0; i < 2; i++) {
          const obj = MM.makeMineCart();
          obj.rotation.y = ang;
          root.add(obj);
          this.carts.push({ obj, u: 0, state: 'idle', kind: null });
        }
      }
    }
    root.traverse((o) => { if (o.isMesh && !o.userData.glow) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(root);
    this.site = site;
    this.siteDirty = false;
  }

  updateSite(simDt, dt) {
    const game = this.game, Q = QUARRY, M = this.S.mine;
    const site = this.site;
    if (!site) return;
    const t = this.time;
    const working = !!M.built && M.workers.some((w) => !w.strike) && this.workHours();
    site.mine?.userData.update?.(dt, t);
    if (site.canteen) site.canteen.userData.setMeals(M.meals);
    if (site.bin) { this.binFill = Math.max(0, (this.binFill || 0) - (simDt || 0) * 0.01); site.bin.userData.setFill(this.binFill || 0); }
    if (site.drill) {
      site.drill.userData.update(dt, t, working);
      this.chuffT = (this.chuffT || 0) - dt;
      if (working && this.chuffT <= 0 && this.siteVisible) {
        this.chuffT = 0.9;
        const c = site.drill.userData.chimney;
        game.particles.smoke(Q.drill.x + c.x, game.grid.groundAt(Q.drill.x, Q.drill.z) + c.y, Q.drill.z + c.z);
        if (Math.random() < 0.25) game.particles.debris(Q.drill.x, game.grid.groundAt(Q.drill.x, Q.drill.z) + 0.2, Q.drill.z, 2, MM.ORE_COL.stone.a);
        if (this.near(Q.drill.x, Q.drill.z, 16) && Math.random() < 0.3) game.audio.play('steam_chuff', { volume: 0.18 });
      }
    }
    if (site.excavator) this.updateExcavator(simDt, dt, working);
    if (site.pailLine) {
      const P = site.pailLine.userData;
      const pl = this.pail;
      if (pl) {
        pl.t += dt / 2.6;
        P.pail.visible = pl.t < 1;
        P.pail.position.set(0, 1.3 - 0.4 * Math.sin(Math.min(1, pl.t) * Math.PI), 0.1 + (1 - pl.t) * 2.6);
        P.wheel.rotation.z += dt * 6;
        if (pl.t >= 1) this.pail = null;
      } else P.pail.visible = false;
    }
    if (this.machinePop) {
      if (!this.machinePop.done) {
        this.machinePop.done = true;
        const at = Q[this.machinePop.id === 'rail' ? 'bin' : this.machinePop.id] || Q.mine;
        const y = game.grid.groundAt(at.x, at.z);
        game.particles.confetti(at.x, y + 1.2, at.z, 30);
        game.particles.word?.('built', at.x, y + 2.2, at.z, { size: 0.32, life: 1.2 });
      }
      this.machinePop.t += dt;
      if (this.machinePop.t > 1) this.machinePop = null;
    }
    // building the mine: scaffold, dust, hammering
    if (M.buildT != null && !M.built) {
      M.buildT -= simDt || 0;
      this.dustT = (this.dustT || 0) - dt;
      if (this.dustT <= 0 && this.siteVisible) {
        this.dustT = 0.25;
        const y = game.grid.groundAt(Q.mine.x, Q.mine.z);
        game.particles.buildCloud(Q.mine.x + (Math.random() - 0.5) * 1.6, y + 0.3, Q.mine.z + 0.4, 1.1);
        if (this.near(Q.mine.x, Q.mine.z, 20) && Math.random() < 0.4) game.audio.play(Math.random() < 0.5 ? 'hammer' : 'pick_clank', { volume: 0.2 });
      }
      if (M.buildT <= 0) {
        M.built = 1; M.buildT = null;
        this.siteDirty = true;
        const y = game.grid.groundAt(Q.mine.x, Q.mine.z);
        game.particles.confetti(Q.mine.x, y + 1.6, Q.mine.z, 40);
        game.particles.word?.('built', Q.mine.x, y + 2.4, Q.mine.z, { size: 0.36, life: 1.3 });
        game.audio.play('fanfare', { volume: 0.5 });
        game.notify('The Bear Mine is open! Hire worker bears (tap the mine).', 'excited', { dur: 4.5 });
        game.emit('mineBuilt');
        game.save();
      }
    }
  }

  updateExcavator(simDt, dt, working) {
    const game = this.game, Q = QUARRY, ex = this.site.excavator;
    const E = (this.exc ||= { t: 0 });
    const run = working;
    if (run) E.t += (simDt || 0) / 12; // one dig cycle = 12 sim s
    const u = E.t % 1;
    // down -> scoop -> lift + swing -> dump -> back
    const k = u < 0.25 ? u / 0.25 : u < 0.4 ? 1 : u < 0.7 ? 1 - (u - 0.4) / 0.3 : 0;
    const swing = u < 0.4 ? 0 : u < 0.7 ? (u - 0.4) / 0.3 : u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15;
    ex.userData.dig(k, u > 0.3 && u < 0.78);
    ex.userData.body.rotation.y = swing * 1.1;
    const cyc = Math.floor(E.t);
    if (run && cyc !== E.last) {
      if (E.last != null) {
        const kind = Math.random() < 0.06 ? 'crystal' : this.rollOre();
        this.addOre(kind, 3 + (Math.random() < 0.5 ? 1 : 0), Q.excavator.x, Q.excavator.z + 0.6);
      }
      E.last = cyc;
    }
    this.excSmokeT = (this.excSmokeT || 0) - dt;
    if (run && this.excSmokeT <= 0 && this.siteVisible) {
      this.excSmokeT = 0.55;
      const c = ex.userData.chimney;
      const y = game.grid.groundAt(Q.excavator.x, Q.excavator.z);
      game.particles.smoke(Q.excavator.x + c.x, y + c.y, Q.excavator.z + c.z);
      if (this.near(Q.excavator.x, Q.excavator.z, 16) && Math.random() < 0.25) game.audio.play('steam_chuff', { volume: 0.2, pitch: 0.8 });
    }
  }

  // ------------------------------------------------------------------ vein models + sacks
  updateVeinModels(dt) {
    const game = this.game;
    const t = game.rig.target, cam = game.rig.camera;
    for (const v of this.veins) {
      const p = this.veinPos(v);
      const near = Math.abs(p.x - t.x) < 46 && Math.abs(p.z - t.z) < 38 && !(game.zones?.fogAt(v.x, v.z) > 0.45);
      if (!near) { if (v.obj) v.obj.visible = false; if (v.marker) v.marker.visible = false; continue; }
      if (!v.obj) {
        v.obj = MM.makeVein(v.kind, (hash2(v.x, v.z, 9) * 1000) | 0);
        v.obj.position.set(p.x, p.y, p.z);
        v.obj.rotation.y = (hash2(v.x, v.z, 3) - 0.5) * 0.8;
        v.obj.scale.setScalar(v.quarry ? 0.95 : 1.3);
        this.group.add(v.obj);
      }
      v.obj.visible = true;
      const left = this.left(v) / VEIN_KINDS[v.kind].cap;
      if (v.lastLeft !== left) { v.lastLeft = left; v.obj.userData.setLeft(left); }
      v.obj.userData.camQ = cam.quaternion;
      v.obj.userData.update(dt, this.time + v.x);
      if (left > 0 && Math.random() < dt * (v.kind === 'gold' || v.kind === 'crystal' ? 0.9 : 0.35)) game.particles.sparkle?.(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.35 + Math.random() * 0.3, p.z + 0.2, 1, MM.ORE_COL[v.kind].glint);
      if (v.shake > 0) { v.shake = Math.max(0, v.shake - dt); v.obj.position.x = p.x + Math.sin(this.time * 70) * v.shake * 0.08; } else v.obj.position.x = p.x;
      // marked veins: a bobbing pickaxe badge
      const mk = this.marked(v) && this.left(v) > 0;
      if (mk && !v.marker) { v.marker = this.makeMarker(); this.group.add(v.marker); }
      if (v.marker) {
        v.marker.visible = mk;
        if (mk) v.marker.position.set(p.x, p.y + 1.25 + Math.sin(this.time * 3 + v.x) * 0.08, p.z);
      }
    }
  }
  makeMarker() {
    const m = new THREE.Sprite(this.markerMat());
    m.scale.set(0.42, 0.42, 1);
    m.renderOrder = 22;
    return m;
  }
  markerMat() {
    if (this._mm) return this._mm;
    const cv = document.createElement('canvas');
    cv.width = 20; cv.height = 20;
    const ctx = cv.getContext('2d');
    // a pickaxe on a round yellow badge
    ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(10, 10, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(10, 10, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b5a2b'; for (let i = 0; i < 9; i++) ctx.fillRect(6 + i * 0.8, 14 - i, 2, 2);
    ctx.fillStyle = '#c8d0dc'; ctx.fillRect(5, 5, 10, 2); ctx.fillRect(4, 6, 2, 2); ctx.fillRect(14, 6, 2, 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    this._mm = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    return this._mm;
  }
  renderSacks() {
    const S = this.S, game = this.game;
    const live = new Set();
    for (const s of S.sacks) {
      live.add(s);
      let m = this.sackMeshes.get(s);
      if (!m) { m = MM.makeOreSack(s[2]); m.scale.setScalar(1.6); m.rotation.y = (s[0] * 7.1 + s[1] * 3.3) % 6.28; this.group.add(m); this.sackMeshes.set(s, m); }
      m.position.set(s[0], game.grid.groundAt(s[0], s[1]), s[1]);
    }
    for (const [s, m] of this.sackMeshes) if (!live.has(s)) { this.group.remove(m); this.sackMeshes.delete(s); }
  }

  // ------------------------------------------------------------------ taps
  near(x, z, r = 20) { const t = this.game.rig.target; return Math.abs(x - t.x) < r && Math.abs(z - t.z) < r; }
  screen(x, y, z) { return this.game.rig.worldToScreen(_v.set(x, y, z), this.game.renderer); }
  tapAt(sx, sy) {
    const game = this.game;
    if (!game.rig || !game.renderer) return false;
    const wupp = game.rig.wupp || 0.045;
    const R = Math.max(18, Math.min(70, 0.45 / wupp * (game.renderer.pixelScale || 2) / (game.renderer.dpr || 1)));
    let best = null, bd = R * R;
    const test = (x, y, z, hit, k = 1) => { const q = this.screen(x, y, z); if (q.visible === false) return; const d = ((q.x - sx) ** 2 + (q.y - sy) ** 2) * k; if (d < bd) { bd = d; best = hit; } };
    for (const v of this.veins) {
      if (!v.obj?.visible) continue;
      const p = this.veinPos(v);
      test(p.x, p.y + 0.35, p.z, { kind: 'vein', v });
    }
    if (this.site && this.siteVisible) {
      const Q = QUARRY, gy = (x, z) => game.grid.groundAt(x, z);
      for (const [k, at, y, w] of [['mine', Q.mine, 0.8, 2.6], ['canteen', Q.canteen, 0.6, 1.8], ['bin', Q.bin, 0.6, 1.4], ['drill', Q.drill, 1.0, 1.4], ['excavator', Q.excavator, 0.8, 2]]) {
        if (k === 'mine' ? !(this.site.mine || this.site.scaffold || this.site.adit) : !this.site[k]) continue;
        test(at.x, gy(at.x, at.z) + y, at.z, { kind: 'site', what: k }, 1 / (w * w));
      }
    }
    for (const e of this.workers) if (e.rig.root.visible) test(e.x, e.y + 1.4, e.z, { kind: 'site', what: 'worker', e }, 0.6);
    if (!best) return false;
    if (best.kind === 'vein') this.ui.openVein(best.v);
    else this.ui.openMine(best.what === 'drill' || best.what === 'excavator' ? 'machines' : best.what === 'canteen' ? 'lunch' : 'crew');
    game.audio.play('pop_in', { volume: 0.3 });
    return true;
  }

  // ------------------------------------------------------------------ Flint (rig events, props, card)
  onFlintEvent(v, name) {
    const game = this.game;
    if (!this.near(v.x, v.z, 18) || game.overrideScene) return;
    if (name === 'clank') { game.audio.play('pick_clank', { volume: 0.35 }); game.particles.debris(v.x + 0.3, v.y + 0.1, v.z + 0.4, 5, [0x8e8690, 0x9e96a0, 0xffcc34]); }
    else if (name === 'chomp') game.audio.play('crunch', { volume: 0.3 });
    else if (name === 'fizz') game.audio.play('fuse_fizz', { volume: 0.3 });
    else if (name === 'pfft') { game.audio.play('pfft', { volume: 0.4 }); game.particles.puff(v.x + 0.3, v.y + 0.7, v.z + 0.2, 6, 0.3); }
  }
  /** Villagers.makeProps hook: Flint's shack (its door is his home's door). */
  flintProps(v, put) {
    const Q = QUARRY;
    put(MM.makeFlintShack(), Q.shack.x - v.x, Q.shack.z - v.z, 0.1);
    if (v.rig) v.rig.onEvent = (name) => this.onFlintEvent(v, name);
    this.flint = v;
  }
  /** Villagers.open hook: extra offers on Flint's card (open the mine / sell ore). */
  cardOffers(panel) {
    const info = this.mineInfo();
    const out = [];
    out.push({ icon: 'mine', title: 'The Bear Mine', desc: info.built ? `${info.workers.length} bear${info.workers.length === 1 ? '' : 's'} digging · ${info.meals} lunch pails` : info.unlocked ? 'Dig a mine in the quarry' : 'Research The Bear Mine first', tag: 'OPEN', onClick: panel(() => this.ui.openMine('crew')) });
    out.push({ icon: 'res_gold', title: 'Sell ore to Flint', desc: 'Raw ore for coins. "Fair price." Mostly.', tag: 'OPEN', onClick: panel(() => this.ui.openMine('trade')) });
    return out;
  }

  // ------------------------------------------------------------------ load / update
  onLoad() {
    const M = this.S.mine;
    for (const e of [...this.workers]) this.despawnWorker(e);
    for (const [, m] of this.sackMeshes) this.group.remove(m);
    this.sackMeshes.clear();
    for (const v of this.veins) { v.assigned = null; v.lastLeft = null; }
    this.siteDirty = true;
    if (M.built) for (const w of M.workers) this.spawnWorker(w);
    for (const s of this.S.sacks) { s.claim = null; if (s.length < 5) s.push(null); }
    this.binFill = 0;
    this.exc = null;
    this.pail = null;
    this.ui?.refreshStrip?.(true);
  }

  update(simDt, dt) {
    const game = this.game;
    this.time += dt;
    // the survey finished: lift Flint's fog (waits for a quiet moment)
    if (this.has('r_mine_survey') && !this.quarryOpen() && !game.titleMode && game.started) {
      this.surveyT = (this.surveyT ?? 1) - dt;
      if (this.surveyT <= 0) {
        this.surveyT = 3;
        const quiet = !game.zones?.busy && !game.cutscene?.active && !game.lab?.active && !game.tutorial?.active && !game.homes?.active && !game.cine?.active && !game.classroom?.active && !game.npcScenes?.busy && !game.ui?.panel && game.state.phase === 'day';
        const Z = ZONE_BY_ID.quarry;
        if (quiet && Z) game.zones.reveal(Z, { x: Z.cx, z: Z.cz + 4 });
      }
    }
    this.siteVisible = this.quarryOpen() && this.near(QUARRY.cx, QUARRY.cz, 46) && !game.overrideScene;
    if (this.quarryOpen() && (this.siteDirty || !this.site)) this.buildSite();
    if (this.site) this.site.root.visible = this.siteVisible;
    for (const b of game.beavers.list) if (b.rig && !b.rig._fsMine) this.patchBeaver(b);
    this.updateVeinModels(dt);
    this.renderSacks();
    this.updateWorkers(simDt, dt);
    this.updateCarts(simDt || 0);
    this.updateSite(simDt, dt);
    this.renderWorkers(dt);
    // auto lunch: the pail line tops the canteen up every so often
    const M = this.S.mine;
    if (M.built && this.has('r_mine_lunch') && M.workers.length) {
      this.autoT = (this.autoT ?? 5) - (simDt || 0);
      if (this.autoT <= 0) { this.autoT = 20; if (M.meals < M.workers.length * 2) this.lunchRun({ auto: true }); }
    }
    // a nudge when sacks pile up with no Ore Shed
    this.hintT -= dt;
    if (this.hintT <= 0) {
      this.hintT = 3;
      const S = this.S;
      if (S.sacks.length && !this.sheds().length && !S.hints.shed) { S.hints.shed = 1; game.notify('Ore sacks are piling up! Build an Ore Shed (Build > Industry) and the beavers will haul them home.', 'info', { dur: 5 }); game.emit('needOreShed'); }
    }
    this.ui.update(dt);
  }
}
