// [F&S industry] The "Flint & Steel" industry layer: crafting machines, conveyor
// belts, steam power, automation, hired worker bears and pollution.
//
// Builds: src/data/structuresIndustry.js (def.ind), models: src/entities/extra/
// industryModels.js, UI: src/ui/IndustryUI.js, research: r_ind_* nodes.
// Resources come from / go to the shared stockpile game.res (src/game/Resources.js);
// logs are the state.wood counter (Wood Garages).
//
// Rules in short
//   Smelter / Machine Shop run a recipe when STAFFED (a hired worker bear fetches
//   inputs from the stockpile) or POWERED (then inputs must arrive by belt or the
//   Load button). Output goes onto an outgoing belt, else into the stockpile.
//   Generators burn coal (else wood) from the stockpile while anything needs power;
//   with too little power everything powered slows down (brownout).
//   Belts carry items one way (s.rot); the end of a line feeds a machine that
//   wants the item, otherwise it tips into the stockpile. A Supply Chute pushes
//   whatever the machine at the end of its belt needs.
//   Pollution (0..100) drifts toward (emissions x 1.6 - clean-up). High pollution
//   murks the pond, makes fish sad (slower breeding) and bears grumpy (reviews).
//
// Hooks (wrapped on the game instance, no edits to shared files): zoneMods (smog
// breeding malus), addReview (smog reviews), tapStructure (machine cards, belts
// turn on tap), world.update (murky water).
//
// State (saved with game.state): state.ind = { m: { 'x,z': machine record }, w: [workers],
//   pol, nextW, belts: [[x, z, id, p]...], made: { id: n } }
import * as THREE from 'three';
import { RECIPES, RECIPES_FOR, WORKER, POLLUTION_TIERS } from '../data/structuresIndustry.js';
import { FOOD_ITEMS } from '../data/foods.js';
import { BEAR_TYPES } from '../data/bears.js';
import { WATER_Y } from '../world/grid.js';
import { FX } from './Particles.js';
import { makeDrone, makeBeltItem } from '../entities/extra/industryModels.js';
import { BearRig } from '../entities/bearRig.js';
import { makeBearLook, lookDef } from '../entities/bearLook.js';
import { IndustryUI } from '../ui/IndustryUI.js';
const MINING_MODELS = Object.values(import.meta.glob('../entities/extra/miningModels.js', { eager: true }))[0] || null;

const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // s.rot 0..3 -> belt direction (rotation.y = rot * 90deg)
const BELT_SPEED = 1.25; // tiles / s
const GAP = 0.3; // min spacing of items on a belt
const OUT_MAX = 6;
const WORK_PHASES = new Set(['day', 'rush', 'evening']);
const WORKER_NAMES = ['Big Sal', 'Dougie', 'Marge', 'Hank', 'Bev', 'Tiny', 'Lou', 'Gus', 'Barb', 'Kodiak Ken', 'Patty', 'Earl', 'Moe', 'Dot', 'Rocco Jr.', 'Ursula', 'Norm', 'Wanda'];
const TIER_MODS = { clean: null, hazy: { breedMult: -0.1 }, smoggy: { breedMult: -0.3 }, toxic: { breedMult: -0.55 } };
const SMOG_REVIEWS = [
  'Fish tasted like a tailpipe.', 'Could not see the pond for the smog.', 'My fur smells like coal now.', 'The water was brown. BROWN.',
  'Coughed through dinner. Two stars for the cough drops.', 'Lovely view of a smokestack.', 'The fish looked depressed. So am I.',
];
const VEND_LINES = ['Snack attack!', 'Ooh, exact change!', 'Vending machine? Fancy.', 'One for the road.', 'B4 please!'];
const MURK_SHALLOW = new THREE.Color(0x7e8640), MURK_DEEP = new THREE.Color(0x3c4626);
const key = (x, z) => x + ',' + z;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Industry {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'industry';
    game.scene.add(this.group);
    this.time = 0;
    this.items = new Map(); // belt key -> [{ id, p, mesh }]
    this.drones = new Map(); // dock key -> drone
    this.rigs = new Map(); // worker id -> BearRig
    this.sad = [];
    this.power = { supply: 0, demand: 0, ratio: 1, gens: 0 };
    this.emit = 0; this.clean = 0; this.target = 0;
    this.tier = 'clean';
    this.list = [];
    this.saveT = 0;
    this.lastBelt = null;
    this.ui = null;
    this.hook();
  }

  // ------------------------------------------------------------ state
  get st() {
    const s = this.game.state;
    if (!s.ind || typeof s.ind !== 'object') s.ind = {};
    const I = s.ind;
    I.m ||= {}; I.w ||= []; I.made ||= {};
    if (typeof I.pol !== 'number') I.pol = 0;
    I.nextW ||= 1;
    return I;
  }
  get res() { return this.game.res; }
  rec(s) {
    const m = this.st.m;
    const k = key(s.x, s.z);
    let r = m[k];
    if (!r || r.ty !== s.type) r = m[k] = { ty: s.type, r: 'auto', h: {}, o: {}, p: 0, cur: null, job: null, fuel: 0, off: false };
    return r;
  }
  unlocked() { return !!this.game.state.research?.includes('r_ind_smelter') || this.list.length > 0; }
  mod(k) { return this.game.mods?.[k] || 0; }

  // ------------------------------------------------------------ hooks into the game
  hook() {
    const game = this.game;
    // pollution mods (slower breeding) join the zone / facility mods
    const zm = game.zoneMods.bind(game);
    game.zoneMods = () => { const out = zm(); const tm = TIER_MODS[this.tier]; if (tm) out.push(tm); return out; };
    // smoggy days sour the reviews
    const ar = game.addReview.bind(game);
    game.addReview = (r, b) => { try { this.smogReview(r, b); } catch (e) { console.warn('smog review', e); } return ar(r, b); };
    // tap a machine: its card (belts turn)
    const ts = game.tapStructure.bind(game);
    game.tapStructure = (s) => (this.tap(s) ? true : ts(s));
    // murky water (after the world copies the sky's water colours)
    const wu = game.world.update.bind(game.world);
    game.world.update = (...a) => { wu(...a); this.tintWater(); };
    game.on('built', (s) => this.onBuilt(s));
    game.on('structureMoved', ({ s, from }) => this.onMoved(s, from));
    game.on('day', () => this.onDay());
  }

  onLoad() {
    // drop visuals, rebuild from the saved state
    for (const arr of this.items.values()) for (const it of arr) this.group.remove(it.mesh);
    this.items.clear();
    for (const d of this.drones.values()) this.dropDrone(d, false);
    this.drones.clear();
    for (const r of this.rigs.values()) { this.group.remove(r.root); r.dispose?.(); }
    this.rigs.clear();
    const I = this.st;
    for (const [x, z, id, p] of I.belts || []) this.beltItems(key(x, z)).push(this.makeItem(id, p));
    for (const s of this.machines()) if (s.def.ind.kind === 'filter') this.setFilterDepth(s);
    this.tier = this.tierOf().id;
    this.game.refreshMods?.();
  }

  // ------------------------------------------------------------ structures
  machines() {
    const out = [];
    for (const s of this.game.structures.list) if (s.def.ind && !s.removed) out.push(s);
    return out;
  }
  byTile(x, z) {
    const s = this.game.structures.structureAtTile(x, z);
    return s && s.def.ind && s.built && !s.removed ? s : null;
  }
  isBelt(s) { return s?.def.ind?.kind === 'belt'; }
  dirOf(s) { return DIRS[(((s.rot ?? 0) % 4) + 4) % 4]; }
  footprint(s) { return this.game.structures.footprint(s.type, s.x, s.z); }
  center(s) { const [w, d] = s.def.size || [1, 1]; return { x: s.x + w / 2, z: s.z + d / 2 }; }
  baseY(s) { return this.game.structures.baseY(s); }
  // world position of a model-local point (x, y, z) on s (follows its rotation)
  local(s, x, y, z) {
    const c = this.center(s);
    const a = s.obj ? s.obj.rotation.y : 0;
    const ca = Math.cos(a), sa = Math.sin(a);
    return { x: c.x + x * ca + z * sa, y: this.baseY(s) + y, z: c.z - x * sa + z * ca };
  }
  // belts that carry things away from s (the tile behind the belt is part of s)
  outBelts(s) {
    const out = [];
    const fp = new Set(this.footprint(s).map(([x, z]) => key(x, z)));
    for (const [fx, fz] of this.footprint(s)) for (const [dx, dz] of DIRS) {
      const b = this.byTile(fx + dx, fz + dz);
      if (!this.isBelt(b)) continue;
      const [bx, bz] = this.dirOf(b);
      if (fp.has(key(b.x - bx, b.z - bz)) && !out.includes(b)) out.push(b);
    }
    return out;
  }

  onBuilt(s) {
    if (!s?.def.ind) return;
    const game = this.game;
    if (this.isBelt(s)) this.orientBelt(s);
    if (s.def.ind.kind === 'filter') this.setFilterDepth(s);
    if (!this.st.tipBuilt && s.def.ind.kind === 'craft') {
      this.st.tipBuilt = 1;
      game.ui?.foxSay?.('A machine! Tap it to pick a recipe and hire a worker bear. Mind the smoke: fish and bears hate smog.', 'smug');
    }
  }
  setFilterDepth(s) {
    const d = WATER_Y - this.baseY(s);
    s.extraModel?.userData?.setDepth?.(Math.max(0.05, d));
  }
  // a new belt points along the drag, away from a machine, or along its neighbour
  orientBelt(s) {
    const now = performance.now();
    const last = this.lastBelt;
    this.lastBelt = { s, t: now };
    const setRot = (b, r) => { b.rot = r; if (b.obj) b.obj.rotation.y = (r * Math.PI) / 2; };
    if (last && now - last.t < 2500 && !last.s.removed && Math.abs(last.s.x - s.x) + Math.abs(last.s.z - s.z) === 1) {
      const r = DIRS.findIndex(([dx, dz]) => dx === s.x - last.s.x && dz === s.z - last.s.z);
      setRot(last.s, r); setRot(s, r);
      return;
    }
    // away from an adjacent machine / chute
    for (let r = 0; r < 4; r++) {
      const [dx, dz] = DIRS[r];
      const m = this.byTile(s.x - dx, s.z - dz);
      if (m && !this.isBelt(m) && m.def.ind.kind !== 'tree') { setRot(s, r); return; }
    }
    // continue a belt that points into this tile
    for (let r = 0; r < 4; r++) {
      const [dx, dz] = DIRS[r];
      const b = this.byTile(s.x - dx, s.z - dz);
      if (this.isBelt(b) && this.dirOf(b)[0] === dx && this.dirOf(b)[1] === dz) { setRot(s, r); return; }
    }
    if (s.rot == null) setRot(s, 0);
  }

  onMoved(s, from) {
    if (!s?.def.ind) return;
    const m = this.st.m;
    const ok = key(from[0], from[1]), nk = key(s.x, s.z);
    if (m[ok]) { m[nk] = m[ok]; delete m[ok]; }
    const arr = this.items.get(ok);
    if (arr) { for (const it of arr) { this.dump(it.id, s.x + 0.5, s.z + 0.5, 1, true); this.group.remove(it.mesh); } this.items.delete(ok); }
    for (const w of this.st.w) if (w.at === ok) w.at = nk;
    const d = this.drones.get(ok);
    if (d) { this.drones.delete(ok); this.drones.set(nk, d); }
    if (s.def.ind.kind === 'filter') this.setFilterDepth(s);
  }

  // removed machines: refund what they held, free their worker
  cleanup() {
    const I = this.st;
    const live = new Map();
    for (const s of this.list) live.set(key(s.x, s.z), s);
    for (const [k, r] of Object.entries(I.m)) {
      const s = live.get(k);
      if (s && s.type === r.ty) continue;
      const [x, z] = k.split(',').map(Number);
      for (const bag of [r.h, r.o]) for (const [id, n] of Object.entries(bag || {})) if (n > 0) this.dump(id, x + 0.5, z + 0.5, n, true);
      if (r.job) for (const [id, n] of Object.entries(RECIPES[r.job]?.in || {})) this.dump(id, x + 0.5, z + 0.5, n, true);
      delete I.m[k];
    }
    for (const w of I.w) if (w.at && !live.has(w.at)) w.at = null;
    for (const [k, arr] of this.items) {
      if (this.isBelt(live.get(k))) continue;
      for (const it of arr) { this.dump(it.id, 0, 0, 1, true); this.group.remove(it.mesh); }
      this.items.delete(k);
    }
    for (const [k, d] of this.drones) if (!live.has(k)) { this.dropDrone(d, true); this.drones.delete(k); }
    for (const [id, rig] of this.rigs) if (!I.w.some((w) => w.id === id && w.at)) { this.group.remove(rig.root); rig.dispose?.(); this.rigs.delete(id); }
  }

  // into the stockpile (logs into the wood count)
  dump(id, x, z, n = 1, quiet = false) {
    if (id === 'wood') { this.game.workshop?.addWood(n, quiet ? null : x, z); return; }
    this.res?.add(id, n, quiet ? undefined : x, quiet ? undefined : z);
  }
  stock(id) { return id === 'wood' ? Math.floor(this.game.state.wood || 0) : this.res?.count(id) || 0; }
  takeStock(id, n = 1) {
    if (id === 'wood') { const st = this.game.state; if ((st.wood || 0) < n) return false; st.wood -= n; this.game.emit('wood', st.wood); return true; }
    return !!this.res?.take(id, n);
  }

  // ------------------------------------------------------------ tap
  tap(s) {
    if (!s?.def.ind || !s.built) return false;
    if (this.game.tool?.kind && this.game.tool.kind !== 'feed') return false;
    if (s.def.ind.kind === 'tree') return false;
    if (this.isBelt(s)) {
      s.rot = ((s.rot ?? 0) + 1) % 4;
      if (s.obj) { s.obj.rotation.y = (s.rot * Math.PI) / 2; s.popT = 0.3; }
      this.game.audio.play('click', { volume: 0.4, pitch: 0.8 });
      this.game.particles.dust(s.x + 0.5, this.baseY(s) + 0.2, s.z + 0.5, 3);
      return true;
    }
    this.ensureUI()?.openMachine(s);
    return true;
  }
  ensureUI() {
    if (!this.ui && this.game.ui?.root) { try { this.ui = new IndustryUI(this); } catch (e) { console.warn('industry ui', e); } }
    return this.ui;
  }

  // ------------------------------------------------------------ workers
  workerAt(s) { const k = key(s.x, s.z); return this.st.w.find((w) => w.at === k) || null; }
  wage() { return Math.max(1, Math.round(WORKER.wage * (1 - this.mod('indWageCut')))); }
  hireCost() { return WORKER.hire; }
  hire(s) {
    const game = this.game;
    if (!s?.def.ind?.worker || this.workerAt(s)) return null;
    // an idle crew member first, else a new hire
    let w = this.st.w.find((x) => !x.at);
    if (!w) {
      if (!game.spend(this.hireCost(), 'builds')) return null;
      const used = new Set(this.st.w.map((x) => x.name));
      const name = WORKER_NAMES.find((n) => !used.has(n)) || `Bear #${this.st.nextW}`;
      w = { id: this.st.nextW++, name, seed: (Math.random() * 1e9) >>> 0, at: null, strike: false };
      this.st.w.push(w);
    }
    w.at = key(s.x, s.z);
    game.audio.play('ind_hire', { volume: 0.5 });
    const c = this.center(s);
    game.particles.popIn(c.x, this.baseY(s) + 0.4, c.z, 0.8);
    game.ui?.floatTextAt?.(c.x, this.baseY(s) + 1.8, c.z, `${w.name} clocks in!`, '#ffe08a');
    game.emit('indHire', { s, w });
    return w;
  }
  fire(w) {
    const i = this.st.w.indexOf(w);
    if (i < 0) return;
    this.st.w.splice(i, 1);
    const rig = this.rigs.get(w.id);
    if (rig) { this.group.remove(rig.root); rig.dispose?.(); this.rigs.delete(w.id); }
    this.game.audio.play('close', { volume: 0.4 });
  }

  onDay() {
    const game = this.game;
    const I = this.st;
    // 'day' also fires when a save is loaded: only a NEW day clears the air and costs wages
    const day = game.state.day;
    if (I.day === day) return;
    const first = I.day == null;
    I.day = day;
    if (first) return;
    I.pol = Math.max(0, I.pol * 0.8); // the air clears a little overnight
    if (!I.w.length) return;
    const total = I.w.length * this.wage();
    if (game.state.coins >= total) {
      game.state.coins -= total;
      if (game.day) game.day.expense.builds = (game.day.expense.builds || 0) + total;
      game.emit('coins', { delta: -total });
      for (const w of I.w) w.strike = false;
      game.ui?.toast?.(`Paid the crew: -${total} coins (${I.w.length} worker bear${I.w.length > 1 ? 's' : ''})`);
    } else {
      for (const w of I.w) w.strike = true;
      game.notify?.(`STRIKE! You couldn't pay ${total} coins of wages. The worker bears put down their tools.`, 'no');
    }
  }
  payStrike() {
    const game = this.game;
    const total = this.st.w.length * this.wage();
    if (!game.spend(total, 'builds')) return false;
    for (const w of this.st.w) w.strike = false;
    game.audio.play('coins', { volume: 0.4 });
    game.notify?.('Back pay sorted. The crew picks up their tools.', 'happy');
    return true;
  }

  // ------------------------------------------------------------ recipes / hoppers
  recipesOf(s) { return RECIPES_FOR[s.def.ind.machine] || []; }
  cap(rid, id) { return Math.max(4, (RECIPES[rid]?.in[id] || 0) * 2); }
  hasInputs(r, rid) { return Object.entries(RECIPES[rid].in).every(([id, n]) => (r.h[id] || 0) >= n); }
  canFromStock(r, rid) { return Object.entries(RECIPES[rid].in).every(([id, n]) => (r.h[id] || 0) + this.stock(id) >= n); }
  outStock(rid) { return this.stock(Object.keys(RECIPES[rid].out)[0]); }
  // which recipe the machine works on next
  chooseRecipe(s, r, staffed) {
    if (r.r !== 'auto') return RECIPES[r.r] ? r.r : null;
    const list = this.recipesOf(s);
    const by = (a, b) => this.outStock(a) - this.outStock(b);
    const ready = list.filter((rid) => this.hasInputs(r, rid)).sort(by);
    if (ready.length) return ready[0];
    if (staffed) { const can = list.filter((rid) => this.canFromStock(r, rid)).sort(by); if (can.length) return can[0]; }
    // partly loaded hopper: keep filling what is already started
    const part = list.filter((rid) => Object.keys(RECIPES[rid].in).some((id) => (r.h[id] || 0) > 0));
    return part[0] || null;
  }
  accepts(s, id) {
    const ind = s.def.ind;
    if (ind.kind === 'power') return (id === 'coal' || id === 'wood') && (this.rec(s).h[id] || 0) < 4;
    if (ind.kind !== 'craft') return false;
    const r = this.rec(s);
    const list = r.r === 'auto' ? this.recipesOf(s) : [r.r];
    return list.some((rid) => RECIPES[rid]?.in[id] && (r.h[id] || 0) < this.cap(rid, id));
  }
  insert(s, id) { const r = this.rec(s); r.h[id] = (r.h[id] || 0) + 1; }
  // Load button: fill the hopper from the stockpile for the chosen (or best) recipe
  loadFromStock(s) {
    const r = this.rec(s);
    const rid = this.chooseRecipe(s, r, true) || (r.r !== 'auto' ? r.r : this.recipesOf(s)[0]);
    let n = 0;
    for (const [id, need] of Object.entries(RECIPES[rid].in)) {
      while ((r.h[id] || 0) < need * 2 && this.takeStock(id, 1)) { r.h[id] = (r.h[id] || 0) + 1; n++; }
    }
    if (n) this.game.audio.play('crate_drop', { volume: 0.4 });
    return n;
  }

  // ------------------------------------------------------------ main loop
  update(simDt, dt) {
    const game = this.game;
    this.time += dt;
    this.list = this.machines();
    this.cleanT = (this.cleanT || 0) - dt;
    if (this.cleanT <= 0) { this.cleanT = 1; this.cleanup(); }
    const phase = game.state.phase;
    const working = WORK_PHASES.has(phase);
    const sdt = working ? simDt : 0;
    game._indSmokeDt = dt;
    if (!this.list.length && this.st.pol <= 0.01 && !this.st.w.length) { this.murk = 0; this.updateHud(dt); return; }
    // ---- power
    let supply = 0, demand = 0;
    const gens = [];
    for (const s of this.list) {
      if (!s.built) continue;
      const ind = s.def.ind;
      if (ind.kind === 'power') gens.push(s);
      else if (ind.power && !this.rec(s).off) demand += ind.power;
    }
    for (const s of gens) {
      const r = this.rec(s);
      if (r.off) { r.burning = false; continue; }
      // only as many boilers as the machines need (the rest bank their fire)
      if (supply >= demand) { r.burning = false; r.spare = demand > 0; continue; }
      r.spare = false;
      if (sdt > 0 && demand > 0) {
        if (r.fuel <= 0) {
          // belt-fed fuel first, then the stockpile (coal, else logs)
          for (const id of ['coal', 'wood']) {
            if ((r.h[id] || 0) > 0) { r.h[id]--; r.fuel += s.def.ind.burn[id]; r.fuelId = id; break; }
            if (this.takeStock(id, 1)) { r.fuel += s.def.ind.burn[id]; r.fuelId = id; break; }
          }
        }
        if (r.fuel > 0) r.fuel = Math.max(0, r.fuel - sdt);
      }
      r.burning = r.fuel > 0 && demand > 0 && working;
      if (r.burning) supply += s.def.ind.out;
    }
    const ratio = demand > 0 ? Math.min(1, supply / demand) : 1;
    const hadPower = this.power.supply > 0;
    this.power = { supply, demand, ratio: supply > 0 ? ratio : 0, gens: gens.length };
    if (!hadPower && supply > 0 && this.time > 3) game.audio.play('ind_power', { volume: 0.4 });
    // ---- machines
    let emit = 0, clean = 0, trees = 0;
    const pk = this.power.ratio * (1 + this.mod('indPowerSpeed'));
    for (const s of this.list) {
      const ind = s.def.ind;
      const st = s.extraModel?.userData?.st;
      if (!s.built) continue;
      if (ind.kind === 'tree') { trees++; continue; }
      const r = ind.kind === 'belt' ? null : this.rec(s);
      const powered = !!ind.power && !r?.off && pk > 0;
      let on = false, lamp = 'off';
      const lampOf = (x) => (r.off ? 'off' : x ? 'on' : 'warn');
      switch (ind.kind) {
        case 'craft': ({ on, lamp } = this.tickCraft(s, r, sdt, powered ? pk : 0, working)); break;
        case 'power': on = !!r.burning; lamp = r.off ? 'off' : on ? 'on' : demand > 0 && working && !r.spare ? 'warn' : 'idle'; if (on) this.smoke(s, 0.9); break;
        case 'belt': on = working; break;
        case 'loader': on = powered && working; lamp = lampOf(on); if (on) this.tickLoader(s, r, sdt * pk); break;
        case 'feeder': on = powered && working; lamp = lampOf(on); if (on) this.tickFeeder(s, r, sdt * pk); break;
        case 'harvester': on = powered && working; lamp = lampOf(on); if (on) this.tickHarvester(s, r, sdt * pk); break;
        case 'hauler': on = powered && working; lamp = lampOf(on); this.tickHauler(s, r, on ? sdt * pk : 0, dt); break;
        case 'vending': on = powered && working; lamp = lampOf(on); if (on) this.tickVending(s, r, sdt * pk); break;
        case 'scrubber': on = powered; lamp = lampOf(on); if (on) { clean += ind.clean * this.power.ratio; if (Math.random() < dt * 2) { const p = this.local(s, 0, 1.9, -0.05); game.particles.sparkle(p.x, p.y, p.z, 1, 0xd8ffe8); } } break;
        case 'filter': on = powered; lamp = lampOf(on); if (on) { clean += ind.clean * this.power.ratio; if (Math.random() < dt * 4) { const p = this.local(s, 0, 0, 0.45); game.particles.bubbles(p.x + (Math.random() - 0.5) * 0.3, WATER_Y - 0.3, p.z + (Math.random() - 0.5) * 0.3, 1); } } break;
        default: break;
      }
      if (ind.kind === 'craft') { if (r.running) emit += ind.pollute; }
      else if (ind.kind === 'power') { if (r.burning) emit += ind.pollute; }
      else if (on && ind.pollute) emit += ind.pollute;
      if (st) {
        st.on = on && (ind.kind !== 'belt' || sdt > 0) && (ind.kind !== 'craft' || r.running);
        st.k = ind.kind === 'craft' ? Math.max(0.4, r.speed || 1) : ind.kind === 'belt' ? 1 : 0.6 + 0.4 * this.power.ratio;
        st.lamp = lamp;
      }
    }
    // ---- belts
    this.tickBelts(sdt);
    // ---- workers (bear rigs at their machines)
    this.updateWorkers(dt, working);
    // ---- pollution
    for (const s of this.game.structures.list) if (s.built && (s.type === 'willow' || s.type === 'maple')) trees++;
    this.trees = trees;
    clean += Math.min(12, trees) * 2.5;
    emit *= Math.max(0.2, 1 + this.mod('indPollute'));
    this.emit = emit; this.clean = clean;
    this.target = Math.max(0, Math.min(100, emit * 1.6 - clean));
    const I = this.st;
    const tau = this.target > I.pol ? 35 : 60;
    if (simDt > 0) I.pol += (this.target - I.pol) * (1 - Math.exp(-simDt / tau));
    this.refreshTier();
    this.pollutionFx(simDt, dt);
    // mirror belt items into the save every second
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 1; this.snapshotBelts(); }
    this.updateHud(dt);
  }

  // ------------------------------------------------------------ crafting
  tickCraft(s, r, dt, pk, working) {
    const game = this.game;
    const w = this.workerAt(s);
    const staffed = !!w && !w.strike && working;
    r.staffed = staffed;
    const speed = (staffed ? 1 + this.mod('indWorkSpeed') : 0) + (pk > 0 ? 0.8 * pk : 0);
    r.speed = speed;
    r.running = false;
    if (r.off) { r.why = 'off'; return { on: false, lamp: 'off' }; }
    if (speed <= 0) { r.why = w?.strike ? 'strike' : 'nocrew'; return { on: false, lamp: 'warn' }; }
    if (!r.job) {
      const rid = this.chooseRecipe(s, r, staffed);
      r.cur = rid;
      // the worker fetches missing inputs from the stockpile, one armful at a time
      if (rid && staffed && dt > 0) {
        r.fetchT = (r.fetchT || 0) - dt;
        if (r.fetchT <= 0) {
          r.fetchT = 0.35;
          for (const [id, n] of Object.entries(RECIPES[rid].in)) {
            if ((r.h[id] || 0) >= n) continue;
            if (this.takeStock(id, 1)) { r.h[id] = (r.h[id] || 0) + 1; break; }
          }
        }
      }
      if (rid && this.hasInputs(r, rid) && this.outCount(r) < OUT_MAX) {
        for (const [id, n] of Object.entries(RECIPES[rid].in)) r.h[id] -= n;
        r.job = rid; r.p = 0;
      }
    }
    // push finished goods out (belt, else stockpile)
    this.flushOut(s, r);
    if (!r.job) { r.why = r.cur ? 'noinput' : 'nore'; return { on: false, lamp: 'idle' }; }
    r.running = dt > 0;
    r.why = 'run';
    if (dt > 0) {
      r.p += (dt * speed) / RECIPES[r.job].time;
      this.smoke(s, s.def.ind.machine === 'smelter' ? 1 : 0.45);
      if (s.def.ind.machine === 'shop' && Math.random() < dt * 1.6) { const p = this.local(s, -0.65, 0.45, -0.55); game.particles.sparkle(p.x, p.y, p.z, 2, 0xffd060); }
      if (r.p >= 1) this.finishJob(s, r);
    }
    return { on: true, lamp: 'on' };
  }
  outCount(r) { let n = 0; for (const v of Object.values(r.o)) n += v; return n; }
  finishJob(s, r) {
    const game = this.game;
    const R = RECIPES[r.job];
    for (const [id, n] of Object.entries(R.out)) { r.o[id] = (r.o[id] || 0) + n; this.st.made[id] = (this.st.made[id] || 0) + n; }
    r.job = null; r.p = 0;
    const smelt = s.def.ind.machine === 'smelter';
    const p = smelt ? this.local(s, 0.6, 0.35, 0.55) : this.local(s, -0.65, 0.45, -0.55);
    game.audio.play(smelt ? 'ind_pour' : 'ind_clank', { volume: 0.35 });
    game.particles.sparkle(p.x, p.y, p.z, 6, smelt ? 0xffa040 : 0xfff0a0);
    const w = this.workerAt(s);
    if (w) { const rig = this.rigs.get(w.id); if (rig) rig._cheer = 0.9; }
    game.emit('indMade', { s, out: R.out });
    this.flushOut(s, r, true);
  }
  flushOut(s, r, fx = false) {
    const ids = Object.keys(r.o).filter((id) => r.o[id] > 0);
    if (!ids.length) return;
    const outs = this.outBelts(s);
    for (const id of ids) {
      while (r.o[id] > 0) {
        const b = outs.find((bb) => this.roomAt(key(bb.x, bb.z), 0));
        if (b) { this.beltItems(key(b.x, b.z)).push(this.makeItem(id, 0)); r.o[id]--; continue; }
        if (outs.length) break; // the belt is backed up: wait
        const p = this.local(s, 0, 0.6, (s.def.size?.[1] || 1) * 0.5);
        this.dump(id, p.x, p.z, r.o[id], !fx);
        r.o[id] = 0;
      }
      if (r.o[id] <= 0) delete r.o[id];
    }
  }

  // ------------------------------------------------------------ belts
  beltItems(k) { let a = this.items.get(k); if (!a) { a = []; this.items.set(k, a); } return a; }
  makeItem(id, p) {
    const mesh = makeBeltItem(id);
    this.group.add(mesh);
    return { id, p, mesh };
  }
  roomAt(k, p0) {
    const a = this.items.get(k);
    if (!a) return true;
    for (const it of a) if (Math.abs(it.p - p0) < GAP) return false;
    return true;
  }
  tickBelts(dt) {
    const step = dt * BELT_SPEED;
    for (const s of this.list) {
      if (!this.isBelt(s) || !s.built) continue;
      const k = key(s.x, s.z);
      const a = this.items.get(k);
      if (!a || !a.length) continue;
      a.sort((p, q) => q.p - p.p); // front first
      const [dx, dz] = this.dirOf(s);
      for (let i = 0; i < a.length; i++) {
        const it = a[i];
        const limit = i === 0 ? 1 : a[i - 1].p - GAP;
        it.p = Math.min(Math.max(it.p, Math.min(it.p + step, limit)), 1);
        if (i === 0 && it.p >= 1 && step > 0 && this.handOff(s, it, dx, dz)) { a.splice(0, 1); i--; }
      }
      // place the meshes
      const y = this.baseY(s) + 0.22;
      for (const it of a) {
        it.mesh.position.set(s.x + 0.5 + dx * (it.p - 0.5), y, s.z + 0.5 + dz * (it.p - 0.5));
        it.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
  }
  // the front item reached the end of belt s
  handOff(s, it, dx, dz) {
    const nx = s.x + dx, nz = s.z + dz;
    const n = this.byTile(nx, nz);
    if (this.isBelt(n)) {
      const [ex, ez] = this.dirOf(n);
      if (ex === -dx && ez === -dz) return this.tip(s, it, nx, nz); // head-on: tip it off
      const p0 = ex === dx && ez === dz ? 0 : 0.5;
      if (!this.roomAt(key(nx, nz), p0)) return false;
      it.p = p0;
      this.beltItems(key(nx, nz)).push(it);
      return true;
    }
    if (n && this.accepts(n, it.id)) {
      this.insert(n, it.id);
      this.group.remove(it.mesh);
      if (Math.random() < 0.3) this.game.audio.play('click', { volume: 0.15, pitch: 0.6 + Math.random() * 0.2 });
      return true;
    }
    if (n && (n.def.ind.kind === 'craft' || n.def.ind.kind === 'power') && this.wants(n, it.id)) return false; // full right now: wait
    return this.tip(s, it, nx, nz);
  }
  wants(s, id) {
    if (s.def.ind.kind === 'power') return id === 'coal' || id === 'wood';
    const r = this.rec(s);
    const list = r.r === 'auto' ? this.recipesOf(s) : [r.r];
    return list.some((rid) => RECIPES[rid]?.in[id]);
  }
  tip(s, it, nx, nz) {
    this.group.remove(it.mesh);
    const x = nx + 0.5 - (nx - s.x) * 0.4, z = nz + 0.5 - (nz - s.z) * 0.4;
    this.dump(it.id, x, z);
    this.game.particles.dust(x, this.baseY(s) + 0.1, z, 2);
    return true;
  }
  snapshotBelts() {
    const out = [];
    for (const [k, a] of this.items) { const [x, z] = k.split(',').map(Number); for (const it of a) out.push([x, z, it.id, +it.p.toFixed(2)]); }
    this.st.belts = out;
  }
  // follow a belt line from b to the first non-belt tile (null: it just ends)
  traceEnd(b) {
    let cur = b;
    const seen = new Set();
    const path = [];
    for (let i = 0; i < 80 && cur; i++) {
      const k = key(cur.x, cur.z);
      if (seen.has(k)) return { end: null, path };
      seen.add(k); path.push(k);
      const [dx, dz] = this.dirOf(cur);
      const n = this.byTile(cur.x + dx, cur.z + dz);
      if (this.isBelt(n)) { cur = n; continue; }
      return { end: n || null, path };
    }
    return { end: null, path };
  }
  inTransit(path, id) {
    let n = 0;
    for (const k of path) for (const it of this.items.get(k) || []) if (it.id === id) n++;
    return n;
  }

  // ------------------------------------------------------------ automation
  tickLoader(s, r, dt) {
    r.tm = (r.tm || 0) - dt;
    if (r.tm > 0) return;
    r.tm = 0.7;
    r.target = null;
    for (const b of this.outBelts(s)) {
      if (!this.roomAt(key(b.x, b.z), 0)) { r.target = r.lastTarget || null; continue; }
      const { end, path } = this.traceEnd(b);
      if (!end || !end.def.ind) continue;
      r.target = r.lastTarget = end.def.name;
      let want = [];
      const er = this.rec(end);
      if (end.def.ind.kind === 'power') want = [['coal', 3], ['wood', 2]];
      else if (end.def.ind.kind === 'craft') {
        let rid = er.job && er.r === 'auto' ? null : er.r !== 'auto' ? er.r : null;
        if (!rid) {
          // auto: whatever the stockpile (plus the hopper) can complete, scarcest output first
          const list = this.recipesOf(end).filter((x) => this.canFromStock(er, x)).sort((a, c) => this.outStock(a) - this.outStock(c));
          rid = list[0] || null;
        }
        if (rid) want = Object.entries(RECIPES[rid].in).map(([id, n]) => [id, n * 2]);
      }
      for (const [id, n] of want) {
        if ((er.h[id] || 0) + this.inTransit(path, id) >= n) continue;
        if (!this.takeStock(id, 1)) continue;
        this.beltItems(key(b.x, b.z)).push(this.makeItem(id, 0));
        r.sent = (r.sent || 0) + 1;
        break;
      }
    }
  }

  tickFeeder(s, r, dt) {
    const game = this.game;
    const ind = s.def.ind;
    r.tm = (r.tm ?? 2) - dt;
    if (r.tm > 0) return;
    r.tm = ind.every;
    // food: the selected bag if fish eat it, else pellets, else any fish food you have
    const store = game.foodStore;
    let food = store.selected;
    if (!FOOD_ITEMS[food]?.fish || store.count(food) < 1) food = store.count('pellets') >= 1 ? 'pellets' : Object.keys(store.inv).find((id) => FOOD_ITEMS[id]?.fish && store.count(id) >= 1);
    if (!food) { r.why = 'nofood'; return; }
    // a hungry fish nearby
    const c = this.center(s);
    let target = null, best = Infinity;
    for (const f of game.fish.list) {
      if (f.tank || f.dead || f.held || f.hunger < 0.4) continue;
      const d = Math.hypot(f.x - c.x, f.z - c.z);
      if (d < ind.radius && d < best) { best = d; target = { x: f.x, z: f.z }; }
    }
    if (!target) { r.why = 'full'; return; }
    if (!store.take(food, 1)) return;
    r.why = 'run';
    const u = s.extraModel?.userData;
    if (u) { u.yawGoal = Math.atan2(target.x - c.x, target.z - c.z) - (s.obj ? s.obj.rotation.y : 0); u.recoil = 1; }
    const m = this.local(s, 0, 1.3, 0);
    game.food.throwHandful(m.x, m.y, m.z, target.x, target.z, 6, 0.55, food);
    game.particles.puff(m.x, m.y, m.z, 4, 0.15);
    game.audio.play('ind_pop', { volume: 0.35 });
    r.fed = (r.fed || 0) + 1;
  }

  tickHarvester(s, r, dt) {
    const game = this.game;
    const ind = s.def.ind;
    r.tm = (r.tm ?? 1.5) - dt;
    if (r.tm > 0) return;
    r.tm = ind.every;
    let best = null, bd = Infinity;
    for (const c of game.structures.list) {
      if (!c.built || c.removed || c.crop?.stage !== 3 || !c.crop.batch) continue;
      if (Math.abs(c.x - s.x) > ind.radius || Math.abs(c.z - s.z) > ind.radius) continue;
      const dd = Math.hypot(c.x - s.x, c.z - s.z);
      if (dd < bd) { bd = dd; best = c; }
    }
    if (!best) { r.why = 'waiting'; return; }
    r.why = 'run';
    const u = s.extraModel?.userData;
    const cc = this.center(s);
    if (u) { u.yawGoal = Math.atan2(best.x + 0.5 - cc.x, best.z + 0.5 - cc.z) - (s.obj ? s.obj.rotation.y : 0); u.reach = 1; }
    // harvest quietly (no harvest card pop-up)
    const ui = game.ui;
    const own = ui && Object.prototype.hasOwnProperty.call(ui, 'onHarvest');
    const keep = ui?.onHarvest;
    if (ui) ui.onHarvest = null;
    let items = null;
    try { items = game.harvest.harvest(best); } finally { if (ui) { if (own) ui.onHarvest = keep; else delete ui.onHarvest; } }
    if (items?.length) {
      const it = items[0];
      game.ui?.floatTextAt?.(best.x + 0.5, this.baseY(best) + 1, best.z + 0.5, `+${it.count} ${FOOD_ITEMS[it.id]?.name || it.id}`, '#c8ff9a');
      game.audio.play('harvest_pop', { volume: 0.35 });
      r.picked = (r.picked || 0) + it.count;
    }
  }

  // ---- the hauler drone: loose logs -> the nearest Wood Garage with room
  tickHauler(s, r, dt, rdt) {
    const game = this.game;
    const k = key(s.x, s.z);
    let d = this.drones.get(k);
    const home = this.local(s, 0, 0.35, 0);
    if (!d) {
      const m = makeDrone();
      m.root.position.set(home.x, home.y, home.z);
      this.group.add(m.root);
      d = { m, s, state: 'home', x: home.x, y: home.y, z: home.z, log: null, carry: null };
      this.drones.set(k, d);
    }
    d.s = s;
    d.rt = (d.rt || 0) + rdt * (dt > 0 || d.state !== 'home' ? 1 : 0.08);
    d.m.update(rdt, d.rt);
    const tf = game.treeFall;
    const fly = (tx, ty, tz, sp) => {
      const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z, L = Math.hypot(dx, dy, dz);
      const st = Math.min(L, sp * Math.max(dt, 0));
      if (L > 1e-4) { d.x += (dx / L) * st; d.y += (dy / L) * st; d.z += (dz / L) * st; }
      if (Math.hypot(dx, dz) > 0.05) {
        const want = Math.atan2(dx, dz);
        d.m.root.rotation.y += Math.atan2(Math.sin(want - d.m.root.rotation.y), Math.cos(want - d.m.root.rotation.y)) * Math.min(1, rdt * 4);
      }
      return L < 0.08;
    };
    const R = s.def.ind.radius;
    const garage = () => {
      let best = null, bd = Infinity;
      for (const g of game.beavers?.garages?.() || []) {
        if (game.beavers.garageRoom(g) < 1) continue;
        const door = game.beavers.garageDoor(g);
        const dd = Math.hypot(door.x - d.x, door.z - d.z);
        if (dd < bd) { bd = dd; best = g; }
      }
      return best;
    };
    const mining = game.mining?.sackList ? game.mining : null;
    const shed = () => {
      let best = null, bd = Infinity;
      for (const sh of mining?.sheds?.() || []) { const door = mining.shedDoor(sh); const dd = Math.hypot(door.x - d.x, door.z - d.z); if (dd < bd) { bd = dd; best = sh; } }
      return best;
    };
    if (d.state === 'home') {
      fly(home.x, home.y + (dt > 0 ? 0.08 : 0), home.z, 2.5);
      if (dt > 0) {
        r.tm = (r.tm || 0) - dt;
        if (r.tm <= 0) {
          r.tm = 1.2;
          // nearest loose log (needs a garage with room) or ore sack (mining; to an Ore Shed, else the dock)
          const g = garage();
          const log = g && tf ? tf.nearestLog(home.x, home.z, (l) => Math.hypot(l.x - home.x, l.z - home.z) < R) : null;
          let sack = null, sd = Infinity;
          for (const sk of mining?.sackList() || []) {
            if (sk.claim || sk.ref.claim) continue;
            const dd = Math.hypot(sk.x - home.x, sk.z - home.z);
            if (dd < R && dd < sd) { sd = dd; sack = sk; }
          }
          const ld = log ? Math.hypot(log.x - home.x, log.z - home.z) : Infinity;
          if (sack && sd <= ld) { sack.ref.claim = d; d.sack = sack; d.state = 'fetch'; r.why = 'run'; game.audio.play('ind_drone', { volume: 0.3 }); }
          else if (log) { log.claim = d; d.log = log; d.garage = g; d.state = 'fetch'; r.why = 'run'; game.audio.play('ind_drone', { volume: 0.3 }); }
          else r.why = !g && !mining?.sackList().length ? 'nogarage' : 'waiting';
        }
      }
    } else if (d.state === 'fetch') {
      const L = d.log, K = d.sack;
      const ok = K ? mining && mining.S.sacks.includes(K.ref) : L && tf && tf.logs.includes(L);
      if (!ok) { if (K) K.ref.claim = null; d.state = 'home'; d.log = null; d.sack = null; }
      else {
        const tx = K ? K.x : L.x, tz = K ? K.z : L.z;
        const ty = K ? game.grid.groundAt(tx, tz) : L.y;
        const far = Math.hypot(tx - d.x, tz - d.z) > 0.15;
        if (fly(tx, far ? Math.max(ty + 1.3, 1.5) : ty + 0.45, tz, dt > 0 ? 3.2 : 0) && !far) {
          if (K) {
            K.ref.claim = null;
            const got = mining.takeSack(K.ref);
            d.sack = null;
            if (!got) { d.state = 'home'; return; }
            d.ore = got;
            d.carry = this.sackModel(got.kind);
          } else {
            tf.takeLog(L);
            d.log = null;
            d.carry = makeBeltItem('wood');
            d.carry.scale.setScalar(1.6);
          }
          d.carry.position.set(0, -0.42, 0);
          d.m.root.add(d.carry);
          d.state = 'carry';
          game.particles.dust(tx, ty, tz, 3);
          game.audio.play('grab', { volume: 0.25, pitch: 1.2 });
        }
      }
    } else if (d.state === 'carry' && d.ore) {
      // ore: to the nearest Ore Shed's door, else straight onto the dock
      const sh = shed();
      const door = sh ? mining.shedDoor(sh) : { x: home.x, z: home.z + 0.3 };
      const gy = sh ? this.baseY(sh) : home.y - 0.35;
      const far = Math.hypot(door.x - d.x, door.z - 0.3 - d.z) > 0.15;
      if (fly(door.x, far ? gy + 1.8 : gy + 0.7, door.z - 0.3, dt > 0 ? 3 : 0) && !far) {
        const o = d.ore;
        game.res?.add(o.kind, o.n || 1, door.x, door.z - 0.5);
        game.ui?.floatTextAt?.(door.x, gy + 1.2, door.z - 0.5, `+${o.n || 1} ${this.res?.billText?.({ [o.kind]: 1 })?.replace(/^1 /, '') || o.kind}`, '#fff0b0');
        game.particles.puff(door.x, gy + 0.2, door.z - 0.5, 5, 0.25);
        game.emit('oreStocked', { kind: o.kind, n: o.n || 1, shed: sh, drone: true });
        d.ore = null;
        this.dropCarry(d);
        d.state = 'home';
        r.hauled = (r.hauled || 0) + 1;
      }
    } else if (d.state === 'carry') {
      let g = d.garage;
      if (!g || g.removed || game.beavers.garageRoom(g) < 1) g = d.garage = garage();
      if (!g) { tf?.putLog(home.x + 0.8, home.z + 0.4); this.dropCarry(d); d.state = 'home'; }
      else {
        const door = game.beavers.garageDoor(g);
        const gy = this.baseY(g);
        const far = Math.hypot(door.x - d.x, door.z - 0.3 - d.z) > 0.15;
        if (fly(door.x, far ? gy + 1.8 : gy + 0.7, door.z - 0.3, dt > 0 ? 3 : 0) && !far) {
          game.beavers.stockLog(g, null);
          this.dropCarry(d);
          d.state = 'home';
          r.hauled = (r.hauled || 0) + 1;
        }
      }
    }
    d.m.root.position.set(d.x, d.y + Math.sin(this.time * 6 + s.x) * (dt > 0 || d.state !== 'home' ? 0.02 : 0), d.z);
    d.m.root.rotation.z = d.state === 'home' ? 0 : Math.sin(this.time * 2) * 0.06;
  }
  // an ore sack for the drone's claw (mining's model when there is one)
  sackModel(kind) {
    try { const m = MINING_MODELS?.makeOreSack?.(kind); if (m) { m.scale.multiplyScalar(1.3); return m; } } catch { /* fall back */ }
    const m = makeBeltItem(kind);
    m.scale.setScalar(2);
    return m;
  }
  dropCarry(d) { if (d.carry) { d.m.root.remove(d.carry); d.carry = null; } }
  dropDrone(d, putBack) {
    if (d.log) d.log.claim = null;
    if (d.sack) d.sack.ref.claim = null;
    if (putBack && d.ore) this.res?.add(d.ore.kind, d.ore.n || 1);
    else if (putBack && d.carry && this.game.treeFall) this.game.treeFall.putLog(d.x, d.z);
    d.ore = null;
    this.dropCarry(d);
    this.group.remove(d.m.root);
  }

  tickVending(s, r, dt) {
    const game = this.game;
    r.tm = (r.tm || 0) - dt;
    if (r.tm > 0) return;
    r.tm = 0.6;
    const c = this.center(s);
    const R = s.def.ind.radius;
    const store = game.foodStore;
    for (const b of game.bears.list) {
      if (!b.visible || b.angry || b.vended || b.inWater || b.def?.boss || b.blood || b.noReview) continue;
      if (Math.hypot(b.x - c.x, b.z - c.z) > R) continue;
      if (!['walk', 'search', 'walkDirect'].includes(b.state)) continue;
      // something the bear wants first, else any snack in the pantry
      const open = (b.wants || []).filter((w) => !w.done);
      let item = null, want = null;
      for (const [id, n] of Object.entries(store.inv)) {
        const F = FOOD_ITEMS[id];
        if (!F?.bear || n < 1) continue;
        const w = open.find((x) => x.kind === F.snack);
        if (w) { item = id; want = w; break; }
        if (!item) item = id;
      }
      if (!item) { r.why = 'nofood'; return; }
      if (!store.take(item, 1)) return;
      const F = FOOD_ITEMS[item];
      b.vended = true;
      if (want) want.done = true;
      const meal = F.bear?.meal ?? 0.5;
      b.eaten = (b.eaten || 0) + meal * 0.6;
      b.snacks = (b.snacks || 0) + 1;
      const coins = Math.max(2, Math.round((3 + meal * 5 + (F.bear?.coins || 0)) * (game.mods.payMult || 1)));
      game.earnMisc(coins, 'snacks');
      game.particles.coins(c.x, this.baseY(s) + 1.2, c.z, 4);
      game.ui?.floatTextAt?.(c.x, this.baseY(s) + 1.9, c.z, `+${coins}`, '#ffe070');
      game.audio.play('ind_vend', { volume: 0.45 });
      game.bears.say?.(b, want ? `${F.name}! Just what I wanted.` : pick(VEND_LINES), null, null, 1.8);
      const u = s.extraModel?.userData; if (u) u.drop = 1;
      r.sold = (r.sold || 0) + 1;
      r.why = 'run';
      game.emit('indVend', { s, b, item, coins });
      return;
    }
  }

  // ------------------------------------------------------------ worker bears (visuals)
  workSpot(s) {
    // where the worker stands (model-local) and which way they face (local yaw)
    switch (s.def.ind.machine) {
      case 'smelter': return { p: [-0.25, 0, 0.62], yaw: Math.PI };
      case 'shop': return { p: [-0.62, 0, 0.05], yaw: Math.PI };
      default: return { p: [0, 0, 0.8], yaw: Math.PI };
    }
  }
  updateWorkers(dt, working) {
    const I = this.st;
    for (const w of I.w) {
      const s = w.at ? this.list.find((m) => key(m.x, m.z) === w.at) : null;
      let rig = this.rigs.get(w.id);
      if (!s || !s.built || !working) { if (rig) rig.root.visible = false; continue; }
      if (!rig) {
        try {
          const base = BEAR_TYPES.construction;
          const look = makeBearLook('construction', base, w.seed);
          rig = new BearRig('construction', lookDef(base, look));
          rig.personalize?.(w.id * 3.7);
          rig.root.scale.setScalar(0.55);
          this.group.add(rig.root);
          this.rigs.set(w.id, rig);
        } catch (e) { console.warn('worker rig', e); continue; }
      }
      rig.root.visible = true;
      const sp = this.workSpot(s);
      const p = this.local(s, sp.p[0], 0, sp.p[2]);
      rig.root.position.set(p.x, p.y, p.z);
      rig.root.rotation.y = (s.obj ? s.obj.rotation.y : 0) + sp.yaw;
      const r = this.rec(s);
      let pose = 'idle', o = {};
      if (w.strike) pose = 'sad';
      else if (rig._cheer > 0) { rig._cheer -= dt; pose = 'cheer'; }
      else if (r.running) {
        const k = Math.min(1.6, r.speed || 1);
        pose = s.def.ind.machine === 'smelter' ? 'toss' : 'smash';
        o = { t01: (this.time * 0.85 * k) % 1 };
      } else if (r.why === 'noinput' || r.why === 'nore') pose = 'search';
      try { rig.pose(pose, dt, o); rig.update?.(dt); } catch { /* a pose this rig lacks */ }
      if (w.strike) {
        w.sayT = (w.sayT ?? 3) - dt;
        if (w.sayT <= 0) { w.sayT = 9 + Math.random() * 6; this.game.say?.({ getWorldPos: (v) => v.set(p.x, p.y + 1.5, p.z) }, pick(['No pay, no play!', 'Union rules!', 'Wages first!']), { mood: 'angry', dur: 1.8, size: 's' }); }
      }
    }
  }

  // ------------------------------------------------------------ pollution
  tierOf(p = this.st.pol) { let t = POLLUTION_TIERS[0]; for (const T of POLLUTION_TIERS) if (p >= T.at) t = T; return t; }
  refreshTier() {
    const p = this.st.pol;
    // a little hysteresis so the tier doesn't flicker on a boundary
    const cur = POLLUTION_TIERS.find((t) => t.id === this.tier) || POLLUTION_TIERS[0];
    let t = this.tierOf(p);
    if (t.at < cur.at && p > cur.at - 3) t = cur;
    if (t.id === this.tier) return;
    const rising = POLLUTION_TIERS.indexOf(t) > POLLUTION_TIERS.indexOf(cur);
    this.tier = t.id;
    this.game.refreshMods?.();
    const game = this.game;
    const I = this.st;
    I.warned ||= {};
    if (rising && I.warned[t.id] !== game.state.day) {
      I.warned[t.id] = game.state.day;
      const msg = {
        hazy: 'The air is getting hazy. Fish are breeding a bit slower.',
        smoggy: 'SMOG! The pond is going murky, the fish are sad and bears are grumbling. Build scrubbers or plant trees!',
        toxic: 'TOXIC! The pond looks like soup. Fish barely breed and bears write angry reviews.',
      }[t.id];
      if (msg) game.notify?.(msg, t.id === 'hazy' ? 'info' : 'no');
      game.emit('indSmog', { tier: t.id });
    }
  }
  smogReview(r) {
    const p = this.st.pol;
    if (p < 45 || !r || r.skip || r.stars < 2) return;
    const chance = Math.min(0.7, (p - 35) / 90);
    if (Math.random() > chance) return;
    r.stars = Math.max(1, r.stars - 1);
    r.text = pick(SMOG_REVIEWS);
    r.smog = true;
  }
  tintWater() {
    const k = clamp01((this.st.pol - 18) / 67) * 0.8;
    this.murk = k;
    if (k <= 0.001) return;
    const wu = this.game.world.waterUniforms;
    wu.uShallow.value.lerp(MURK_SHALLOW, k);
    wu.uDeep.value.lerp(MURK_DEEP, k);
  }
  smoke(s, rate) {
    const fx = s.extraModel?.userData?.fx;
    if (!fx?.smoke) return;
    const game = this.game;
    const dark = 0.32 + 0.3 * (1 - clamp01(this.st.pol / 100));
    for (const [x, y, z] of fx.smoke) {
      if (Math.random() > (game._indSmokeDt || 0.016) * 7 * rate) continue;
      const p = this.local(s, x, y, z);
      game.particles.fx.spawn('smoke', p.x + (Math.random() - 0.5) * 0.12, p.y, p.z + (Math.random() - 0.5) * 0.12, {
        vx: 0.12 + Math.random() * 0.12, vy: 0.5 + Math.random() * 0.35, vz: (Math.random() - 0.5) * 0.12, drag: 0.25, life: 2.6 + Math.random() * 1.4,
        size: 0.24 + Math.random() * 0.12, flags: FX.FADE | FX.GROW | FX.WOBBLE, tint: [dark, dark * 0.96, dark * 0.94],
      });
    }
  }
  pollutionFx(simDt, dt) {
    const game = this.game;
    const p = this.st.pol;
    // fish breed slower: their love timers tick back up a little
    if (p > 20 && simDt > 0) {
      const slow = clamp01((p - 20) / 80) * 0.45 * simDt;
      for (const f of game.fish.list) if (f.adult && f.loveT > 0) f.loveT += slow;
    }
    this.updateSadFish(dt, p);
    // sludge on the water + coughing bears when it's really bad
    if (p > 60 && simDt > 0) {
      this.sludgeT = (this.sludgeT || 0) - simDt;
      if (this.sludgeT <= 0) {
        this.sludgeT = 2.5 - clamp01((p - 60) / 40) * 1.5;
        const w = game.fish.randomWaterPoint?.();
        if (w) game.particles.decal('smoke', w.x, WATER_Y + 0.01, w.z, 0.45 + Math.random() * 0.45, 14, [0.5, 0.47, 0.22]); // oily scum
      }
      this.coughT = (this.coughT ?? 6) - simDt;
      if (this.coughT <= 0) {
        this.coughT = 7 + Math.random() * 6;
        const vis = game.bears.list.filter((x) => x.visible && !x.inWater);
        if (vis.length) game.bears.say?.(pick(vis), pick(['*cough cough*', 'Is that... smog?', 'My eyes!', 'Smells like pennies.']), null, null, 1.8);
      }
    }
  }
  sadTexture() {
    if (this._sadTex) return this._sadTex;
    const rows = [
      '..oooooo..',
      '.obbbbbbo.',
      'obbbbbbbbo',
      'obkbbbbkbo',
      'obbbbbbbbo',
      'obbbkkbbbo',
      'obbkbbkbbo',
      '.obbbbbbo.',
      '..oooooo..',
      '....ot....',
      '.....o....',
    ];
    const cv = document.createElement('canvas');
    cv.width = rows[0].length; cv.height = rows.length;
    const c = cv.getContext('2d');
    const col = { o: '#2a1a14', b: '#c8d8f0', k: '#2a3a5a', t: '#7ab0e8' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) { c.fillStyle = col[ch]; c.fillRect(x, y, 1, 1); } }));
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._sadTex = tex;
    return tex;
  }
  updateSadFish(dt, p) {
    const want = p >= 45 ? Math.min(8, 2 + Math.floor((p - 45) / 8)) : 0;
    const game = this.game;
    while (this.sad.length < want) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sadTexture(), transparent: true, depthWrite: false }));
      sp.scale.set(0.28, 0.31, 1);
      sp.renderOrder = 22;
      this.group.add(sp);
      this.sad.push({ sp, f: null, t: 0 });
    }
    for (let i = this.sad.length - 1; i >= 0; i--) {
      const S = this.sad[i];
      if (i >= want) { this.group.remove(S.sp); S.sp.material.dispose(); this.sad.splice(i, 1); continue; }
      S.t -= dt;
      if (!S.f || S.f.dead || S.f.tank || !game.fish.list.includes(S.f) || S.t <= 0) {
        const pool = game.fish.list.filter((f) => !f.dead && !f.tank && !this.sad.some((o) => o.f === f));
        S.f = pool.length ? pick(pool) : null;
        S.t = 4 + Math.random() * 4;
      }
      S.sp.visible = !!S.f;
      if (S.f) {
        S.sp.position.set(S.f.x, WATER_Y + 0.42 + Math.sin(this.time * 2 + i) * 0.04, S.f.z);
        S.sp.material.opacity = Math.min(1, S.t * 2);
      }
    }
  }

  // ------------------------------------------------------------ HUD + summary (for the UI)
  updateHud(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    if (!this.unlocked() && this.st.pol <= 0.5) { this.ui?.hideHud?.(); return; }
    this.ensureUI()?.update();
  }
  summary() {
    const I = this.st;
    return { pol: I.pol, target: this.target, tier: this.tierOf(), emit: this.emit, clean: this.clean, trees: this.trees || 0, power: this.power, workers: I.w, wage: this.wage(), murk: this.murk || 0, made: I.made };
  }
  // what a machine is up to, in a few words (machine card)
  status(s) {
    const ind = s.def.ind;
    if (!s.built) return { text: 'Being built', mood: 'idle' };
    const r = ind.kind === 'belt' ? null : this.rec(s);
    if (r?.off) return { text: 'Switched off', mood: 'off' };
    if (!WORK_PHASES.has(this.game.state.phase)) return { text: 'Closed for the night', mood: 'idle' };
    const brown = ind.power && this.power.ratio > 0 && this.power.ratio < 0.999;
    switch (ind.kind) {
      case 'craft': {
        const w = this.workerAt(s);
        if (r.why === 'strike') return { text: `${w?.name || 'The crew'} is on strike (no pay)`, mood: 'bad' };
        if (r.why === 'nocrew') return { text: 'Needs a worker bear or power', mood: 'bad' };
        if (r.why === 'nore') return { text: 'No ore for any recipe', mood: 'bad' };
        if (r.why === 'noinput') return { text: r.staffed ? `Waiting for ${this.missing(r) || 'inputs'}` : 'Waiting for inputs (belt or Load)', mood: 'idle' };
        if (brown && !r.staffed) return { text: `Brownout: ${Math.round(this.power.ratio * 100)}% speed`, mood: 'idle' };
        return { text: `Making ${RECIPES[r.job]?.name || '...'}`, mood: 'good' };
      }
      case 'power':
        if (r.burning) return { text: `Burning ${r.fuelId === 'wood' ? 'logs' : 'coal'}: +${ind.out} power`, mood: 'good' };
        if (this.power.demand <= 0) return { text: 'Idle: nothing needs power', mood: 'idle' };
        if (r.spare) return { text: 'Standby: the other generators cover it', mood: 'idle' };
        return { text: 'No fuel! Needs coal or wood', mood: 'bad' };
      default:
        if (ind.power && this.power.ratio <= 0) return { text: this.power.gens ? 'No power: the generator needs fuel' : 'No power: build a Steam Generator', mood: 'bad' };
        if (r?.why === 'nofood') return { text: ind.kind === 'feeder' ? 'Out of fish food' : 'Out of snacks: harvest your garden', mood: 'bad' };
        if (r?.why === 'nogarage') return { text: 'Needs a Wood Garage with room (or ore sacks)', mood: 'bad' };
        if (brown) return { text: `Brownout: ${Math.round(this.power.ratio * 100)}% speed`, mood: 'idle' };
        if (ind.kind === 'loader') return r.target ? { text: `Supplying the ${r.target}`, mood: 'good' } : { text: 'Lay a belt from here to a machine', mood: 'idle' };
        if (ind.kind === 'harvester' && r?.why === 'waiting') return { text: 'Waiting for ripe crops', mood: 'idle' };
        if (ind.kind === 'hauler' && r?.why === 'waiting') return { text: 'Looking for loose logs and ore sacks', mood: 'idle' };
        if (ind.kind === 'feeder' && r?.why === 'full') return { text: 'Fish are full', mood: 'idle' };
        return { text: 'Working', mood: 'good' };
    }
  }
  missing(r) {
    const rid = r.cur;
    if (!rid) return null;
    const miss = Object.entries(RECIPES[rid].in).filter(([id, n]) => (r.h[id] || 0) + this.stock(id) < n).map(([id]) => this.res?.billText?.({ [id]: 1 })?.replace(/^1 /, '') || id);
    return miss.length ? miss.join(', ') : null;
  }
}
