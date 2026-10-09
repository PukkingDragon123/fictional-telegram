// [v26 staff] game.staff: the beaver staff. Every beaver is a staff member with a
// name, a procedural chibi look, traits, a personality, skills, a job and a home.
//
// The lodge crew (BeaverSystem) still does the builds / clearing / hauling: a
// staff member with job = null IS a crew beaver, and BeaverSystem drives it.
// Everything else (going to a job building, lunch at the snack bar, going home at
// night, getting hurt, the stretcher crew) is driven here: a beaver agent with
// b.ctl set is skipped by BeaverSystem.update/render (two marked lines there).
//
// Contract (design_v26.md):
//   list, keyOf(s), byKey(key), assign(id, s|null), workersAt(s), boost(s),
//   task(s, { kind, dur, anim?, at?, carry?: { item, to }, onDone, onFail? }),
//   injure(id|beaver, cause), rescue(id) -> { ok, cost }, nearby(x, z, r)
//   events: 'staffHired', 'staffHurt', 'staffRescued'
import * as THREE from 'three';
import { STRUCTURES } from '../../data/structures.js';
import { STORAGE } from '../../data/foods.js';
import { WATER_Y } from '../../world/grid.js';
import { MEADOW } from '../../world/worldgen.js';
import { angleDiff, damp } from '../../core/rng.js';
import { rollBeaver, SKILLS, TRAITS, outfitFor, staffLine, firstName } from '../../data/staffGen.js';
import { StaffMember } from './member.js';
import { Candidates } from './candidates.js';
import { Rescue } from './rescue.js';
import { Popups } from './popups.js';

const rigMods = import.meta.glob('../../entities/beaverChibi.js', { eager: true });
const RIG = rigMods['../../entities/beaverChibi.js'] || null;
const uiMods = import.meta.glob('../../ui/StaffUI.js', { eager: true });
const UIMOD = uiMods['../../ui/StaffUI.js'] || null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const WORK_PHASES = new Set(['day', 'rush']);
const LUNCH0 = 12, LUNCH1 = 13;
export const XP_FOR = (lvl) => Math.round(40 * Math.pow(lvl, 1.35));
export const MAX_LEVEL = 10;

// default work anims by skill (a def's jobs.anim wins)
const SKILL_ANIM = { build: 'hammer', chop: 'hammer', haul: 'carry', serve: 'serve', fab: 'weld', mine: 'hammer', care: 'fold' };

function freshState() {
  return { v: 1, next: 1, list: [], cands: [], homes: {}, slots: {}, day: 0, seen: {}, log: [] };
}

export class StaffSystem {
  constructor(game) {
    this.game = game;
    this._S = null;
    this.time = 0;
    this.keyCache = new Map();
    this.keyT = 0;
    this.boostCache = new Map();
    this.rigs = new Set(); // every chibi rig we made (GC'd when orphaned)
    this.barkT = 0;
    this.hitT = new Map();
    this.cands = new Candidates(this);
    this.rescues = new Rescue(this);
    this.pops = new Popups(this);
    this.group = new THREE.Group();
    this.group.name = 'staff';
    game.scene.add(this.group);
    // existing buildings join in: the lodge is a home, the snack bar takes a cook, the wood garage log stackers
    const patch = (id, o) => { const d = STRUCTURES[id]; if (d) for (const [k, v] of Object.entries(o)) if (!d[k]) d[k] = v; };
    patch('lodge', { home: { beds: 3, comfort: 1 } });
    patch('beaverbar', { jobs: { slots: 1, skill: 'serve', title: 'Snack Cook', outfit: 'chef', anim: 'serve' } });
    patch('woodgarage', { jobs: { slots: 2, skill: 'haul', title: 'Log Stacker', anim: 'carry', logs: true } });
    game.on('day', () => this.onDay());
    game.on('structureMoved', (e) => this.onMoved(e));
    game.on('research', (r) => { if (r?.id === 'r_st_tent') game.unlockFeature?.('staff'); });
  }

  // ------------------------------------------------------------------ state
  get S() {
    const st = this.game.state;
    if (!st.staff || typeof st.staff !== 'object') st.staff = freshState();
    if (st.staff !== this._S) this._sync(st.staff);
    return this._S;
  }
  _sync(raw) {
    const f = freshState();
    for (const k of Object.keys(f)) if (raw[k] == null) raw[k] = f[k];
    raw.list = (Array.isArray(raw.list) ? raw.list : []).filter(Boolean).map((d) => (d instanceof StaffMember ? d : new StaffMember(d)));
    let mx = 0;
    for (const r of raw.list) mx = Math.max(mx, r.id | 0);
    raw.next = Math.max(raw.next | 0, mx + 1);
    raw.cands = (raw.cands || []).filter((c) => c && c.look);
    this._S = raw;
    this.cands.reset();
    this.rescues.reset();
  }
  /** Staff members ({ id, name, look, traits, personality, skills, level, xp, mood, energy, job, home, hurt, x, z, rig }). */
  get list() { return this.S.list; }
  get(id) {
    if (id == null) return null;
    if (id instanceof StaffMember) return id;
    if (typeof id === 'object') return id.staff || (id.agent ? id : null);
    const n = +id;
    return this.S.list.find((r) => r.id === n) || null;
  }

  // ------------------------------------------------------------------ buildings
  keyOf(s) { return s ? `${s.type}@${s.x},${s.z}` : null; }
  byKey(key) {
    if (!key) return null;
    let s = this.keyCache.get(key);
    if (s && !s.removed && this.keyOf(s) === key) return s;
    s = this.game.structures.list.find((o) => !o.removed && this.keyOf(o) === key) || null;
    if (s) this.keyCache.set(key, s);
    return s;
  }
  jobsDef(s) { return s?.def?.jobs || null; }
  homeDef(s) { return s?.def?.home || null; }
  slotsOf(s) { const J = this.jobsDef(s); return J ? (J.slots || 1) + (this.S.slots[this.keyOf(s)] || 0) : 0; }
  bedsOf(s) {
    const H = this.homeDef(s);
    if (!H) return 0;
    const up = this.S.homes[this.keyOf(s)];
    return (H.beds || 1) + (up?.beds || 0) + (s.type === 'lodge' ? Math.max(0, this.game.mods?.beaverBonus || 0) : 0);
  }
  comfortOf(s) { const H = this.homeDef(s); if (!H) return 0; return (H.comfort || 0) + (this.S.homes[this.keyOf(s)]?.comfort || 0); }
  assignedTo(s) { const k = this.keyOf(s); return this.S.list.filter((r) => r.job === k); }
  residents(s) { const k = this.keyOf(s); return this.S.list.filter((r) => r.home === k); }
  /** Beavers working at s right now (on shift, at the building, not hurt). */
  workersAt(s) {
    const k = this.keyOf(s);
    return this.S.list.filter((r) => r.job === k && !r.hurt && r.agent && r.agent.sx && (r.agent.sx.st === 'work' || r.agent.sx.st === 'break' || r.agent.sx.st.startsWith('task')));
  }
  jobBuildings() { return this.game.structures.list.filter((s) => s.built && !s.removed && this.jobsDef(s)); }
  homes() { return this.game.structures.list.filter((s) => s.built && !s.removed && this.homeDef(s)); }
  freeBeds(s) { return this.bedsOf(s) - this.residents(s).length; }
  tents() { return this.game.structures.list.filter((s) => s.type === 'st_tent' && s.built && !s.removed); }
  firstAids() {
    return this.game.structures.list.filter((s) => s.built && !s.removed && (s.type === 'firstaid' || s.def.firstAid || s.def.jobs?.skill === 'care'));
  }
  fp(s) { const [w, d] = s.def.size || [1, 1]; return { w, d }; }
  door(s) {
    const { w, d } = this.fp(s);
    if (s.type === 'lodge') return { x: s.x + 0.5, z: s.z + 0.5 };
    return { x: s.x + w / 2, z: s.z + d + 0.18 };
  }
  workSpot(s, i = 0, n = 1) {
    const { w, d } = this.fp(s);
    const gap = Math.min(0.55, (w + 0.4) / Math.max(1, n));
    const x = s.x + w / 2 + (i - (n - 1) / 2) * gap;
    return { x, z: s.z + d + 0.34, face: -Math.PI / 2 };
  }

  // output multiplier for a building with `jobs` (0 if required and nobody is there)
  boost(s) {
    if (!s) return 1;
    const J = this.jobsDef(s);
    if (!J) return 1;
    const k = this.keyOf(s);
    const c = this.boostCache.get(k);
    if (c && this.time - c.t < 0.25) return c.v;
    const ws = this.workersAt(s);
    const slots = Math.max(1, this.slotsOf(s));
    let q = 0;
    for (const r of ws) q += this.quality(r, J.skill);
    q = Math.min(1.5, q / slots);
    let v;
    if (J.required) v = ws.length ? clamp(0.4 + 1.1 * q, 0.5, 2.2) : 0;
    else v = clamp(1 + 0.85 * q, 1, 2.2);
    this.boostCache.set(k, { t: this.time, v });
    return v;
  }
  /** How good this beaver is at a skill right now (0..~1.4). */
  quality(r, skill) {
    const sk = r.skills[skill] || 1;
    let q = 0.2 * sk + 0.045 * (r.level - 1);
    q *= 0.75 + 0.4 * clamp(r.mood / 100, 0, 1);
    if (r.energy < 25) q *= 0.7;
    for (const t of r.traits) q *= TRAITS[t]?.boost || 1;
    const h = this.byKey(r.home);
    q *= 1 + 0.035 * (h ? this.comfortOf(h) : -1);
    const ph = this.game.state.phase, hr = this.game.state.hour;
    if (r.has('nightowl')) q *= ph === 'rush' ? TRAITS.nightowl.evening : hr < 11 ? TRAITS.nightowl.morning : 1;
    if (r.unpaid > 0) q *= 0.8;
    return clamp(q, 0, 1.45);
  }

  // ------------------------------------------------------------------ hiring + records
  newId() { return this.S.next++; }
  createRecord(profile, extra = {}) {
    const r = new StaffMember({ ...profile, id: this.newId(), level: 1, xp: 0, mood: 72, energy: 100, hiredDay: this.game.state.day, ...extra });
    this.S.list.push(r);
    return r;
  }
  /** Hire a candidate profile (from the interview tent). Returns the record. */
  hire(profile, { x, z, rig = null } = {}) {
    const game = this.game;
    const rec = this.createRecord({ ...profile }, { origin: 'hire', job: null });
    delete rec.st; delete rec.day;
    const home = this.findFreeHome(rec);
    rec.home = home ? this.keyOf(home) : null;
    const t = this.tents()[0];
    const p = x != null ? { x, z } : t ? this.door(t) : { x: MEADOW.x0 + 20, z: MEADOW.z0 + 10 };
    const b = this.makeAgent(rec, p.x, p.z, rig);
    b.sx = { st: 'cheer', t: 1.6 };
    this.takeControl(b);
    game.particles?.confetti?.(p.x, (b.y || 0) + 0.8, p.z, 24);
    game.audio.play('st_hired', { volume: 0.5 });
    this.bark(rec, 'hire', 2.4, true);
    game.emit('staffHired', rec);
    game.unlockFeature?.('staff');
    if (!home) game.notify?.(`${firstName(rec)} has no bed! Build a Beaver Burrow (Build > Beaver) or they sleep outside and get grumpy.`, 'warn');
    return rec;
  }
  findFreeHome(rec) {
    let best = null, bd = Infinity;
    const p = rec.agent ? { x: rec.x, z: rec.z } : this.tents()[0] || { x: MEADOW.x0 + 20, z: MEADOW.z0 + 10 };
    for (const s of this.homes()) {
      if (this.freeBeds(s) <= 0) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z) - this.comfortOf(s) * 3;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  setHome(id, s) {
    const r = this.get(id);
    if (!r) return false;
    if (!s) { r.home = null; return true; }
    if (!this.homeDef(s)) return false;
    const k = this.keyOf(s);
    if (r.home === k) return true;
    if (this.freeBeds(s) <= 0) { this.lastReason = 'No free bed there'; return false; }
    r.home = k;
    if (r.agent && r.origin === 'hire') this.anchorFor(r);
    return true;
  }
  /** Give a beaver a job at s (a building whose def has `jobs`), or null = back to the crew. Homes work too. */
  assign(id, s) {
    const r = this.get(id);
    if (!r) return false;
    if (s && !this.jobsDef(s) && this.homeDef(s)) return this.setHome(r, s);
    if (s && !this.jobsDef(s)) { this.lastReason = 'No jobs there'; return false; }
    const k = s ? this.keyOf(s) : null;
    if (k === r.job) return true;
    if (s && this.assignedTo(s).filter((o) => o !== r).length >= this.slotsOf(s)) { this.lastReason = 'All slots are taken'; return false; }
    const b = r.agent;
    if (b?.task) this.failTask(b);
    r.job = k;
    this.boostCache.clear();
    if (b) {
      this.dressFor(r);
      if (b.sx && (b.sx.st === 'work' || b.sx.st === 'break' || b.sx.st === 'go')) b.sx = { st: 'idle', t: 0.2 };
    }
    this.game.emit('staffAssigned', { staff: r, s });
    return true;
  }
  /** Let a beaver go (hired staff only). */
  fire(id) {
    const r = this.get(id);
    if (!r || r.origin !== 'hire') return false;
    this.leave(r, 'fired');
    return true;
  }
  leave(r, why = 'quit') {
    const b = r.agent;
    this.bark(r, 'quit', 2.6, true);
    if (b) {
      if (b.task) this.failTask(b);
      this.takeControl(b);
      const e = this.edgePoint(b.x, b.z);
      b.sx = { st: 'leave', tx: e.x, tz: e.z, t: 0 };
    }
    r.job = null; r.home = null; r.gone = why;
    this.S.list.splice(this.S.list.indexOf(r), 1);
    this.S.log.unshift({ day: this.game.state.day, name: r.name, why });
    if (this.S.log.length > 12) this.S.log.length = 12;
    this.game.emit('staffLeft', { staff: r, why });
  }

  // ------------------------------------------------------------------ rigs + agents
  /** A fresh chibi rig for a profile / record (falls back to the old BeaverRig). */
  newRig(p, outfit = null) {
    let rig = null;
    if (RIG?.BeaverChibi) {
      try { rig = new RIG.BeaverChibi({ look: p?.look || {}, outfit: outfit || this.outfitOf(p), seed: p?.seed || 1 }); } catch (e) { if (!this._rigErr) { this._rigErr = 1; console.error('[staff] rig', e); } rig = null; }
    }
    if (!rig) rig = this.game.beavers.makeRig();
    this.rigs.add(rig);
    return rig;
  }
  outfitOf(r) {
    if (!r) return 'overalls';
    if (r.hurt && r.hurt.state === 'recover') return outfitFor(null);
    const s = this.byKey(r.job);
    return s ? outfitFor(this.jobsDef(s)) : outfitFor(null);
  }
  dressFor(r) { const rig = r.rig; if (rig?.setOutfit) rig.setOutfit(this.outfitOf(r)); }
  anchorFor(r) {
    const b = r.agent;
    if (!b) return null;
    if (r.origin === 'lodge') {
      const L = this.byKey(r.lodge);
      if (L) { b.lodge = L; return L; }
    }
    if (!b.lodge || b.lodge.type !== 'anchor') b.lodge = { type: 'anchor', x: 0, z: 0, removed: false, built: true };
    const h = this.byKey(r.home), t = this.tents()[0];
    const p = h ? this.door(h) : t ? this.door(t) : { x: MEADOW.x0 + 20, z: MEADOW.z0 + 10 };
    b.lodge.x = p.x - 0.5; b.lodge.z = p.z - 0.5;
    return b.lodge;
  }
  link(rec, b) {
    if (rec.agent && rec.agent !== b) this.unlinkAgent(rec.agent);
    rec.agent = b;
    b.staff = rec;
    b.rig.agent = b;
    b.rig.staff = rec;
    if (b.rig._fsMine === undefined && b.rig.isChibi) b.rig._fsMine = true; // our rig draws its own pick + ore sack
    if (rec._x || rec._z) { b.x = rec._x; b.z = rec._z; }
    this.dressFor(rec);
    if (b.rig.setLook && b.rig.lookSeed !== rec.seed) b.rig.setLook(rec.look, rec.seed);
    this.anchorFor(rec);
  }
  unlinkAgent(b) { if (b?.staff) { b.staff = null; } }
  /** A BeaverSystem-shaped beaver for a hired record (pushed into game.beavers.list). */
  makeAgent(rec, x, z, rig = null) {
    const B = this.game.beavers;
    rig ||= this.newRig(rec);
    if (rig.root.parent) rig.root.parent.remove(rig.root);
    B.group.add(rig.root);
    const b = {
      lodge: null, rig, x, z, y: 0, heading: Math.random() * 6.28, state: 'idle', job: null, t: 0.5, phase: 0, moving: false, wander: null,
      jobs: 0, hungry: false, anim: null, seed: Math.random() * 9,
    };
    rig.onEvent = (name) => B.onRigEvent(b, name);
    B.list.push(b);
    rec._x = x; rec._z = z;
    this.link(rec, b);
    b.y = this.groundAt(x, z).gy;
    B.game.emit('beavers', B.list.length);
    return b;
  }
  /** BeaverSystem.spawn hook: a lodge beaver gets an identity (an old lodge record, or a new crew member). */
  adopt(b, lodge) {
    try {
      const S = this.S;
      if (this._pending) { const r = this._pending; this._pending = null; this.link(r, b); return; }
      const lk = lodge && lodge.type && lodge.type !== 'anchor' ? this.keyOf(lodge) : null;
      let rec = S.list.find((r) => r.origin === 'lodge' && r.lodge === lk && !r.agent);
      if (!rec) {
        rec = this.createRecord(rollBeaver({ origin: 'lodge', quality: 0.25 }), { origin: 'lodge', lodge: lk, home: lk, job: null });
        delete rec.answer;
      }
      // the old BeaverRig: swap in a chibi
      if (!b.rig.isChibi && RIG?.BeaverChibi) {
        const old = b.rig;
        const rig = this.newRig(rec);
        if (rig.isChibi) {
          const parent = old.root.parent;
          if (parent) { parent.remove(old.root); parent.add(rig.root); }
          rig.onEvent = old.onEvent;
          try { old.dispose?.(); } catch { /* ignore */ }
          b.rig = rig;
        }
      }
      this.link(rec, b);
    } catch (e) { console.error('[staff] adopt', e); }
  }
  /** BeaverSystem.removeForLodge hook: lodge starters move out with their lodge. */
  release(b) {
    const r = b?.staff;
    if (!r) return;
    const i = this.S.list.indexOf(r);
    if (i >= 0 && r.origin === 'lodge') this.S.list.splice(i, 1);
    else if (r.origin !== 'lodge') {
      // a hired beaver living in the lodge: keep it, it just lost its bed
      r.home = null;
      r.agent = null;
      this._respawn = true;
    }
    this.rescues.forget(r);
  }
  removeAgent(b) {
    const B = this.game.beavers;
    const i = B.list.indexOf(b);
    if (i >= 0) B.list.splice(i, 1);
    if (b.rig?.root.parent) b.rig.root.parent.remove(b.rig.root);
    if (b.staff?.agent === b) b.staff.agent = null;
    B.game.emit('beavers', B.list.length);
  }
  // rigs whose beaver is gone (new game, load, quit): free them
  gcRigs() {
    for (const rig of this.rigs) {
      if (rig.root.parent || rig._keep) continue;
      this.rigs.delete(rig);
      try { rig.dispose?.(); } catch { /* ignore */ }
    }
  }

  // ------------------------------------------------------------------ control
  takeControl(b) {
    if (b.ctl) return;
    const B = this.game.beavers;
    try { if (b.job || b.carry) B.release(b); } catch { /* ignore */ }
    if (b.strike) b.strike = false;
    if (b.sign) b.sign.visible = false;
    b.ctl = 'staff';
    b.state = 'idle';
    b.sx ||= { st: 'idle', t: 0 };
  }
  giveBack(b) {
    if (!b.ctl) return;
    b.ctl = null;
    b.state = 'idle'; b.t = 0.2; b.wander = null; b.job = null; b.sx = null; b.anim = null;
    b.rig.root.visible = true;
    b.rig.root.scale.setScalar(this.sizeOf(b.staff));
    this.dropProp(b);
  }
  sizeOf(r) { return r?.look?.size || 1; }
  shiftStart(r) {
    let h = 9 + ((r.id * 37) % 10) / 22; // 9:00 - 9:25
    if (r.has('nightowl')) h += 0.45;
    if (r.has('hardworker')) h -= 0.1;
    return h;
  }
  lunchSlot(r) { return r.id % 2 ? [LUNCH0, LUNCH0 + 0.5] : [LUNCH0 + 0.5, LUNCH1]; }
  isLunch(r) {
    const st = this.game.state;
    if (st.phase !== 'day' || r._lunchDay === st.day) return false;
    const [a, b] = this.lunchSlot(r);
    return st.hour >= a && st.hour < b;
  }
  wantCtl(r) {
    const b = r.agent;
    const st = this.game.state;
    if (r.hurt || r.train || r.gone) return true;
    const sx = b.sx?.st;
    if (sx === 'exit' || sx === 'cheer' || sx === 'eat' || sx === 'leave' || sx === 'enter' || (sx && sx.startsWith('task'))) return true;
    if (!WORK_PHASES.has(st.phase)) return true;
    if (sx === 'inside' || sx === 'sleepout') return true; // still in bed: walks out at its shift start
    if (r.job && this.byKey(r.job)) return true;
    if (this.isLunch(r)) return true;
    if (sx === 'lunchgo') return true;
    return false;
  }

  // ------------------------------------------------------------------ update
  update(simDt, dt) {
    const game = this.game;
    if (!game.started) return;
    const S = this.S;
    this.time += dt;
    this.ui ||= this.makeUI();
    this.keyT -= dt;
    if (this.keyT <= 0) { this.keyT = 1; this.validateKeys(); }
    if (this._respawn) { this._respawn = false; this.spawnMissing(); }
    if (S.day !== game.state.day) this.onDay();
    this.barkT -= dt;
    for (const r of [...S.list]) {
      const b = r.agent;
      if (!b) continue;
      const want = this.wantCtl(r);
      if (want && !b.ctl) this.takeControl(b);
      else if (!want && b.ctl && (!b.sx || b.sx.st === 'idle' || b.sx.st === 'go' || b.sx.st === 'work' || b.sx.st === 'break')) this.giveBack(b);
      if (b.ctl) this.drive(r, b, simDt, dt);
      else this.crewTick(r, b, simDt);
      if (b.moving) { r._x = b.x; r._z = b.z; }
    }
    // beavers that quit / left: walk off the map
    for (const b of this.game.beavers.list) if (b.ctl && !b.staff && b.sx?.st === 'leave') this.driveLeave(b, simDt);
    this.cands.update(simDt, dt);
    this.rescues.update(simDt, dt);
    this.bearHits(simDt);
    this.gcT = (this.gcT || 0) - dt;
    if (this.gcT <= 0) { this.gcT = 3; this.gcRigs(); }
  }

  makeUI() {
    if (!this.game.ui || !UIMOD?.StaffUI) return null;
    try { return new UIMOD.StaffUI(this); } catch (e) { console.error('[staff] ui', e); return null; }
  }

  // stale building keys (sold / smashed / stored): jobs and homes fall back
  validateKeys() {
    this.keyCache.clear();
    for (const r of this.S.list) {
      if (r.job && !this.byKey(r.job)) { r.job = null; this.dressFor(r); }
      if (r.home && !this.byKey(r.home)) { r.home = null; if (r.agent) this.anchorFor(r); }
    }
  }
  onMoved({ s, from }) {
    if (!s || !from) return;
    const old = `${s.type}@${from[0]},${from[1]}`, nk = this.keyOf(s);
    const S = this.S;
    for (const r of S.list) {
      if (r.job === old) r.job = nk;
      if (r.home === old) r.home = nk;
      if (r.lodge === old) r.lodge = nk;
      if (r.agent) this.anchorFor(r);
    }
    for (const o of [S.homes, S.slots]) if (o[old] != null) { o[nk] = o[old]; delete o[old]; }
    this.keyCache.clear();
  }
  // hired beavers whose agent went missing (their lodge was sold): bring them back
  spawnMissing() {
    for (const r of this.S.list) {
      if (r.agent || r.origin === 'lodge') continue;
      const p = this.homeSpot(r);
      const b = this.makeAgent(r, p.x, p.z);
      this.takeControl(b);
      b.sx = { st: 'idle', t: 0.3 };
    }
  }

  // ------------------------------------------------------------------ the day
  onDay() {
    const game = this.game;
    const S = this.S;
    const day = game.state.day;
    if (S.day === day) return;
    const first = !S.day;
    S.day = day;
    if (first) return;
    // wages (hired staff only; the lodge crew is paid in snacks)
    let owed = 0, paid = 0, n = 0;
    for (const r of S.list) if (r.origin === 'hire' && !r.train && r.wage > 0) owed += r.wage;
    if (owed > 0) {
      const can = game.state.coins >= owed;
      for (const r of S.list) {
        if (r.origin !== 'hire' || !(r.wage > 0)) continue;
        if (game.state.coins >= r.wage) {
          game.state.coins -= r.wage; paid += r.wage; n++;
          r.unpaid = 0; r.mood = Math.min(100, r.mood + 2);
        } else { r.unpaid = (r.unpaid || 0) + 1; r.mood -= 18; }
      }
      if (paid) {
        if (game.day?.expense) game.day.expense.wages = (game.day.expense.wages || 0) + paid;
        game.emit('coins', { delta: -paid });
      }
      if (paid) game.notify?.(`Payday: ${paid} coins in wages to ${n} beaver${n > 1 ? 's' : ''}.${can ? '' : ' Some went unpaid!'}`, can ? 'info' : 'warn');
      else game.notify?.('No coins for wages! The staff are NOT happy.', 'warn');
    }
    for (const r of [...S.list]) {
      // the night's sleep
      const h = this.byKey(r.home);
      const comfort = h ? this.comfortOf(h) : -1;
      if (!r.hurt) r.energy = clamp((h ? 80 + comfort * 7 : 62) + (r.energy > 50 ? 6 : 0), 0, 100);
      let dm = h ? comfort * 2.2 - 1 : -9;
      if (r.has('neatfreak')) dm *= TRAITS.neatfreak.comfort;
      dm += (TRAITS[r.traits.find((t) => TRAITS[t].mood)]?.mood || 0) * 2;
      if (r.unpaid) dm -= 4;
      r.mood = clamp(r.mood + dm + (70 - r.mood) * 0.08, 0, 100);
      if (r.bandage > 0) r.bandage--;
      // recovery
      if (r.hurt && r.hurt.state === 'recover' && day >= (r.hurt.until || 0)) {
        r.hurt = null; r.bandage = 1; r.energy = Math.max(r.energy, 70);
        if (r.agent) { r.agent.sx = { st: 'inside', t: 0 }; this.dressFor(r); }
      } else if (r.hurt && (r.hurt.state === 'down' || r.hurt.state === 'limp')) {
        // nobody came: they dragged themselves home overnight
        r.hurt.state = 'recover'; r.hurt.until = day + 1;
        if (r.agent) this.rescues.sendInside(r);
      }
      // training done
      if (r.train && day >= r.train.until) {
        const k = r.train.skill;
        r.skills[k] = Math.min(5, (r.skills[k] || 1) + 1);
        r.train = null; r.mood = Math.min(100, r.mood + 6);
        game.notify?.(`${firstName(r)} is back from training: ${k.toUpperCase()} ${r.skills[k]}!`, 'happy');
        if (r.agent) { r.agent.rig.root.visible = true; const p = this.homeSpot(r); r.agent.x = p.x; r.agent.z = p.z; r.agent.sx = { st: 'inside', t: 0 }; }
      }
      // unhappy for days: they quit (hired staff)
      if (r.mood < 22) r.sadDays = (r.sadDays || 0) + 1; else r.sadDays = Math.max(0, (r.sadDays || 0) - 1);
      if (r.origin === 'hire' && r.sadDays >= 3 && !r.hurt) {
        game.notify?.(`${r.name} quit! (Too unhappy for too long.)`, 'warn');
        this.leave(r, 'quit');
      }
      r._lunchDay = 0;
    }
    this.cands.onDay(day);
    this.boostCache.clear();
  }

  // a crew beaver (BeaverSystem drives it): xp + energy while it works
  crewTick(r, b, dt) {
    if (!dt) return;
    const working = b.state === 'work' || b.state === 'haul' || b.state === 'go';
    if (working) {
      r.energy = clamp(r.energy - dt * 0.22 * (r.has('hardworker') ? 0.85 : 1), 0, 100);
      if (b.state === 'work') this.gainXp(r, dt * 0.16);
    } else r.energy = clamp(r.energy + dt * 0.05, 0, 100);
    if (b.state === 'work' && Math.random() < dt * 0.02) this.bark(r, r.energy < 20 ? 'tired' : 'work', 1.6);
  }

  gainXp(r, v) {
    for (const t of r.traits) if (t === 'hardworker') v *= 1.15; else if (t === 'lazy') v *= 0.85;
    r.xp += v;
    r.stats.worked = (r.stats.worked || 0) + v;
    while (r.level < MAX_LEVEL && r.xp >= XP_FOR(r.level)) {
      r.xp -= XP_FOR(r.level);
      r.level++;
      const job = this.jobsDef(this.byKey(r.job));
      const pref = job?.skill || 'build';
      const pool = (r.skills[pref] || 1) < 5 ? [pref] : SKILLS.filter((k) => (r.skills[k] || 1) < 5);
      const k = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      if (k) r.skills[k] = Math.min(5, (r.skills[k] || 1) + 1);
      r.mood = Math.min(100, r.mood + 10);
      const b = r.agent;
      if (b) {
        this.game.particles?.confetti?.(b.x, (b.y || 0) + 0.8, b.z, 20);
        this.game.ui?.floatTextAt?.(b.x, (b.y || 0) + 1.2, b.z, `LEVEL ${r.level}!${k ? ` +1 ${k.toUpperCase()}` : ''}`, '#fff2a0');
        this.game.audio.play('levelup', { volume: 0.35, pitch: 1.3 });
        b.celebT = 1.4;
        this.bark(r, 'levelup', 2, true);
      }
      this.game.emit('staffLevel', { staff: r, skill: k });
    }
  }

  // ------------------------------------------------------------------ driving a beaver
  groundAt(x, z) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.inb(tx, tz)) return { gy: 0, inWater: false };
    const inWater = g.isWater(tx, tz);
    const s = g.structAt?.(tx, tz);
    let gy = inWater ? WATER_Y - 0.42 : g.surfaceY(tx, tz);
    if (s && s.type === 'platform' && s.built) gy = 0.62;
    else if (s && (s.type === 'dam' || s.type === 'gate' || s.type === 'lodge') && s.built) gy = WATER_Y + 0.2;
    return { gy, inWater };
  }
  speedOf(r, base = 1) {
    let v = base * (r?.has?.('speedy') ? TRAITS.speedy.speed : 1);
    if (r && r.energy < 20) v *= 0.8;
    return v;
  }
  move(b, x, z, dt, speed, stop = 0.08) { return this.game.beavers.moveToward(b, x, z, dt, speed, stop); }
  homeSpot(r) {
    const h = this.byKey(r.home);
    if (h) return this.door(h);
    const t = this.tents()[0];
    if (t) { const d = this.door(t); return { x: d.x + 1.1 + (r.id % 3) * 0.35, z: d.z + 0.4 + (r.id % 2) * 0.3 }; }
    return { x: MEADOW.x0 + 18 + (r.id % 5) * 0.5, z: MEADOW.z0 + 8 };
  }
  edgePoint(x, z) {
    // walk out into the forest: away from the meadow centre
    const cx = (MEADOW.x0 + MEADOW.x1) / 2, cz = (MEADOW.z0 + MEADOW.z1) / 2;
    let dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const g = this.game.grid;
    let px = x, pz = z;
    for (let k = 0; k < 40; k++) {
      px += dx; pz += dz;
      const tx = Math.floor(px), tz = Math.floor(pz);
      if (!g.inb(tx, tz)) break;
      if (!g.meadow[tz * g.w + tx] && !g.isWater(tx, tz) && k > 3) { px += dx * 2; pz += dz * 2; break; }
    }
    return { x: clamp(px, 2, g.w - 2), z: clamp(pz, 2, g.h - 2) };
  }

  drive(r, b, dt, rdt) {
    const game = this.game;
    const st = game.state;
    if (!b.sx) b.sx = { st: 'idle', t: 0 };
    const sx = b.sx;
    sx.t = (sx.t || 0) + dt;
    b.moving = false;
    if ((b.state === 'haul' || b.job) && sx.st !== 'work') this.stopHaul(b);
    if (r.hurt) { this.rescues.drive(r, b, dt); if (sx.st !== 'stretcher') this.settle(b, rdt); return; }
    if (r.train) { this.driveAway(r, b, dt); this.settle(b, rdt); return; }
    const night = !WORK_PHASES.has(st.phase) || (st.phase === 'day' && st.hour < this.shiftStart(r) && (sx.st === 'inside' || sx.st === 'sleepout'));
    if (b.task && sx.st.startsWith('task')) { this.driveTask(r, b, dt); this.settle(b, rdt); return; }
    switch (sx.st) {
      case 'cheer':
        if (sx.t > 1.6) b.sx = { st: 'idle', t: 0 };
        break;
      case 'inside': {
        b.rig.root.visible = false;
        if (!night && !(st.phase === 'day' && st.hour < this.shiftStart(r))) {
          const p = this.homeSpot(r);
          b.x = p.x; b.z = p.z + 0.12;
          b.heading = Math.PI / 2;
          b.rig.root.visible = true;
          b.sx = { st: 'exit', t: 0 };
          game.particles?.dust?.(b.x, this.groundAt(b.x, b.z).gy, b.z, 2);
        } else {
          r.energy = clamp(r.energy + dt * 0.25, 0, 100);
          // Zzz from the home every few seconds
          sx.zT = (sx.zT || Math.random() * 3) - dt;
          if (sx.zT <= 0) { sx.zT = 2.6 + Math.random() * 2.5; const p = this.homeSpot(r); if (this.near(p.x, p.z)) game.particles?.zzz?.(p.x + 0.2, this.groundAt(p.x, p.z).gy + 0.9, p.z - 0.3); }
        }
        break;
      }
      case 'exit':
        if (sx.t > 1.1) b.sx = { st: 'idle', t: 0 };
        break;
      case 'enter':
        if (sx.t > 0.45) { b.sx = { st: 'inside', t: 0 }; b.rig.root.visible = false; }
        break;
      case 'sleepout':
        r.energy = clamp(r.energy + dt * 0.15, 0, 100);
        if (!night) b.sx = { st: 'idle', t: 0 };
        sx.zT = (sx.zT || 1) - dt;
        if (sx.zT <= 0) { sx.zT = 3 + Math.random() * 2; if (this.near(b.x, b.z)) game.particles?.zzz?.(b.x + 0.1, (b.y || 0) + 0.5, b.z); }
        break;
      case 'eat': {
        b.heading += angleDiff(b.heading, Math.PI / 2) * Math.min(1, dt * 4);
        const dur = 4.2 * (r.has('foodie') ? TRAITS.foodie.lunch : 1);
        if (sx.t > dur) {
          r._lunchDay = st.day;
          r.energy = clamp(r.energy + 18, 0, 100);
          r.mood = clamp(r.mood + (sx.bar ? (r.has('foodie') ? 8 : 4) : (r.has('foodie') ? -8 : -3)), 0, 100);
          if (sx.bar && !sx.bar.removed && Math.random() < 0.5) { try { game.foodStore.takeFrom(sx.bar, (id, F) => F?.beaver?.jobs || 0); } catch { /* ignore */ } }
          if (sx.bar) game.particles?.hearts?.(b.x, (b.y || 0) + 0.7, b.z, 1);
          b.sx = { st: 'idle', t: 0 };
        }
        break;
      }
      case 'lunchgo': {
        const p = sx.bar ? this.door(sx.bar) : { x: b.x, z: b.z };
        if (sx.bar && (sx.bar.removed)) { b.sx = { st: 'idle', t: 0 }; break; }
        if (this.move(b, p.x + sx.ox, p.z + sx.oz, dt, 2.6 * this.speedOf(r), 0.12)) b.sx = { st: 'eat', t: 0, bar: sx.bar };
        break;
      }
      case 'leave': this.driveLeave(b, dt); break;
      case 'go': {
        if (this.move(b, sx.tx, sx.tz, dt, (sx.run ? 3.4 : 2.4) * this.speedOf(r), 0.1)) {
          const next = sx.next || 'idle';
          b.sx = { st: next, t: 0, ...(sx.nextData || {}) };
        }
        break;
      }
      case 'work': this.driveWork(r, b, dt); break;
      case 'break':
        r.energy = clamp(r.energy + dt * 1.1, 0, 100);
        if (sx.t > (sx.dur || 5)) b.sx = { st: 'work', t: 0 };
        break;
      default: this.plan(r, b, night); break;
    }
    this.settle(b, rdt);
  }

  // what to do next (idle beaver under our control)
  plan(r, b, night) {
    const st = this.game.state;
    const sx = b.sx;
    if (night) {
      // home to bed
      const h = this.byKey(r.home);
      if (h) {
        const d = this.door(h);
        if (Math.hypot(d.x - b.x, d.z - b.z) < 0.25) { b.sx = { st: 'enter', t: 0 }; return; }
        // far away in the dead of night: they're home already
        if (st.phase === 'night' || st.phase === 'dawn' || st.phase === 'morning') { b.x = d.x; b.z = d.z; b.sx = { st: 'inside', t: 0 }; b.rig.root.visible = false; return; }
        b.sx = { st: 'go', tx: d.x, tz: d.z, next: 'enter', run: Math.hypot(d.x - b.x, d.z - b.z) > 6 };
        return;
      }
      const p = this.homeSpot(r);
      if (Math.hypot(p.x - b.x, p.z - b.z) < 0.3) { b.sx = { st: 'sleepout', t: 0 }; return; }
      if (st.phase === 'night' || st.phase === 'dawn' || st.phase === 'morning') { b.x = p.x; b.z = p.z; b.sx = { st: 'sleepout', t: 0 }; return; }
      b.sx = { st: 'go', tx: p.x, tz: p.z, next: 'sleepout' };
      return;
    }
    if (this.isLunch(r)) {
      const bar = this.lunchBar(b);
      const k = r.id % 4;
      b.sx = { st: 'lunchgo', t: 0, bar, ox: bar ? (k - 1.5) * 0.32 : 0, oz: bar ? 0.25 + (k % 2) * 0.15 : 0 };
      return;
    }
    const s = this.byKey(r.job);
    if (s) {
      const team = this.assignedTo(s);
      const i = Math.max(0, team.indexOf(r));
      const p = this.workSpot(s, i, Math.max(team.length, 1));
      if (Math.hypot(p.x - b.x, p.z - b.z) < 0.14) { b.sx = { st: 'work', t: 0, s, face: p.face }; return; }
      b.sx = { st: 'go', tx: p.x, tz: p.z, next: 'work', nextData: { s, face: p.face }, run: Math.hypot(p.x - b.x, p.z - b.z) > 5 };
      return;
    }
    // crew time: hand back to BeaverSystem (update() does it when wantCtl says so); meanwhile mill about
    sx.t = 0;
  }
  lunchBar(b) {
    let best = null, bd = Infinity;
    for (const s of this.game.structures.list) {
      if (!s.built || s.removed || STORAGE[s.type]?.for !== 'beaver') continue;
      const stocked = this.game.foodStore?.stored?.(s) >= 1;
      const d = Math.hypot(s.x - b.x, s.z - b.z) - (stocked ? 30 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    if (best && !(this.game.foodStore?.stored?.(best) >= 1)) return null;
    return best;
  }
  driveWork(r, b, dt) {
    const sx = b.sx;
    const s = sx.s && !sx.s.removed && this.keyOf(sx.s) === r.job ? sx.s : null;
    if (!s) { b.sx = { st: 'idle', t: 0 }; return; }
    const J = this.jobsDef(s);
    // Log Stackers: fetch logs lying around and stack them in the garage (BeaverSystem's haul code)
    if (J.logs && this.haulLogs(r, b, s, dt)) return;
    const team = this.assignedTo(s);
    const p = this.workSpot(s, Math.max(0, team.indexOf(r)), Math.max(1, team.length));
    if (Math.hypot(p.x - b.x, p.z - b.z) > 0.3) { b.sx = { st: 'go', tx: p.x, tz: p.z, next: 'work', nextData: { s, face: p.face } }; return; }
    b.heading += angleDiff(b.heading, sx.face ?? -Math.PI / 2) * Math.min(1, dt * 5);
    sx.anim = J.anim || SKILL_ANIM[J.skill] || 'hammer';
    r.energy = clamp(r.energy - dt * 0.2 * (r.has('hardworker') ? 0.85 : 1), 0, 100);
    this.gainXp(r, dt * 0.17);
    // little work FX at the building
    sx.fxT = (sx.fxT || Math.random()) - dt;
    if (sx.fxT <= 0 && this.near(b.x, b.z)) {
      sx.fxT = 1.4 + Math.random() * 1.6;
      const gy = this.groundAt(b.x, b.z).gy;
      const P = this.game.particles;
      if (sx.anim === 'weld') P?.sparkle?.(b.x + Math.cos(b.heading) * 0.25, gy + 0.3, b.z + Math.sin(b.heading) * 0.25, 4, 0xfff0a0);
      else if (sx.anim === 'sweep') P?.dust?.(b.x + Math.cos(b.heading) * 0.3, gy, b.z + Math.sin(b.heading) * 0.3, 2);
      else if (sx.anim === 'hammer') P?.word?.(Math.random() < 0.5 ? 'bonk' : 'pow', b.x, gy + 0.9, b.z, { size: 0.18, life: 0.5 });
      else if (sx.anim === 'serve' && Math.random() < 0.4) P?.sparkle?.(b.x, gy + 0.6, b.z, 2);
    }
    // breaks
    const T = TRAITS;
    let br = 1;
    for (const t of r.traits) br *= T[t]?.breaks || 1;
    if (r.energy < 25) br *= 2;
    sx.breakT ??= (22 + Math.random() * 20) / br;
    sx.breakT -= dt;
    if (sx.breakT <= 0) {
      b.sx = { st: 'break', t: 0, dur: 3 + Math.random() * 3 * (r.has('lazy') ? 2 : 1), s, face: sx.face };
      if (Math.random() < 0.35) this.bark(r, r.energy < 25 ? 'tired' : 'idle', 1.8);
      return;
    }
    if (Math.random() < dt * 0.01) this.bark(r, 'work', 1.6);
  }
  haulLogs(r, b, s, dt) {
    const B = this.game.beavers, sx = b.sx;
    if (b.state === 'haul' && b.job) {
      B.updateHaul(b, dt * this.speedOf(r) * (r.has('strong') ? 1.15 : 1), this.game.mods.buildSpeed || 1);
      if (b.state !== 'haul') { b.job = null; b.state = 'idle'; this.gainXp(r, 1.2); }
      r.energy = clamp(r.energy - dt * 0.22, 0, 100);
      return true;
    }
    sx.haulT = (sx.haulT ?? 0.5) - dt;
    if (sx.haulT > 0) return false;
    sx.haulT = 1.2;
    if (s.type !== 'woodgarage' || B.garageRoom(s, b) < 1) return false;
    const log = B.fall.nearestLog(b.x, b.z, (l) => Math.hypot(l.x - s.x, l.z - s.z) < 22);
    if (!log) return false;
    B.startHaul(b, { kind: 'haul', log, garage: s, phase: 'fetch' });
    return true;
  }
  /** Stop a haul / crew job this beaver was doing (drops what it carries). */
  stopHaul(b) {
    if (b.state === 'haul' || b.job) { try { this.game.beavers.release(b); } catch { /* ignore */ } }
  }
  driveLeave(b, dt) {
    const sx = b.sx;
    if (!sx) return;
    if (this.move(b, sx.tx, sx.tz, dt, 2.6, 0.2) || sx.t > 30) {
      this.game.particles?.puff?.(b.x, b.y || 0, b.z, 6, 0.25);
      this.removeAgent(b);
    }
    sx.t = (sx.t || 0) + dt;
    this.settle(b, dt);
  }
  driveAway(r, b, dt) {
    // off to training: walk into the forest, then vanish until it's done
    const sx = b.sx;
    if (sx.st !== 'away' && sx.st !== 'awaygo') { const e = this.edgePoint(b.x, b.z); b.sx = { st: 'awaygo', tx: e.x, tz: e.z, t: 0 }; return; }
    if (sx.st === 'awaygo' && (this.move(b, sx.tx, sx.tz, dt, 2.6, 0.2) || sx.t > 25)) { b.sx = { st: 'away', t: 0 }; this.game.particles?.puff?.(b.x, b.y || 0, b.z, 5, 0.2); }
    if (b.sx.st === 'away') b.rig.root.visible = false;
  }
  settle(b, dt) {
    const g = this.groundAt(b.x, b.z);
    b.inWater = g.inWater;
    b.y = damp(b.y || 0, g.gy, 10, Math.max(dt, 1 / 120));
  }

  // ------------------------------------------------------------------ tasks
  /**
   * A physical job for a beaver working at s: walk to opts.at (or s), work there (anim) for dur seconds,
   * optionally carry opts.carry.item to opts.carry.to, then onDone(). False if nobody can take it now.
   */
  task(s, opts = {}) {
    if (!s) return false;
    const k = this.keyOf(s);
    const now = this.game.state;
    if (!WORK_PHASES.has(now.phase)) return false;
    const cand = this.S.list.filter((r) => r.job === k && r.agent && !r.hurt && !r.train && !r.agent.task && r.agent.ctl && r.agent.sx
      && (r.agent.sx.st === 'work' || r.agent.sx.st === 'break' || r.agent.sx.st === 'go' || r.agent.sx.st === 'idle'));
    if (!cand.length) return false;
    cand.sort((a, b) => this.quality(b, this.jobsDef(s)?.skill) - this.quality(a, this.jobsDef(s)?.skill));
    const r = cand[0], b = r.agent;
    const at = opts.at ? this.pointOf(opts.at, true) : this.workSpot(s, 0, 1);
    b.task = { s, kind: opts.kind || 'work', dur: Math.max(0.2, opts.dur ?? 3), anim: opts.anim || null, at, carry: opts.carry || null, onDone: opts.onDone, onFail: opts.onFail, t: 0 };
    b.sx = { st: 'task_go', t: 0 };
    return true;
  }
  pointOf(o, front = false) {
    if (!o) return null;
    if (o.def) { const p = front ? this.workSpot(o, 0, 1) : this.door(o); return { x: p.x, z: p.z, s: o }; }
    return { x: +o.x, z: +o.z };
  }
  driveTask(r, b, dt) {
    const T = b.task, sx = b.sx;
    const P = this.game.particles;
    if (!T || (T.s && T.s.removed) || this.keyOf(T.s) !== r.job) { this.failTask(b); return; }
    if (sx.st === 'task_go') {
      if (this.move(b, T.at.x, T.at.z, dt, 2.8 * this.speedOf(r), 0.12)) b.sx = { st: 'task_work', t: 0 };
    } else if (sx.st === 'task_work') {
      const tgt = T.at.s ? this.door(T.at.s) : T.s ? this.door(T.s) : null;
      if (tgt) b.heading += angleDiff(b.heading, Math.atan2(tgt.z - 0.6 - b.z, tgt.x - b.x)) * Math.min(1, dt * 5);
      sx.anim = T.anim || SKILL_ANIM[this.jobsDef(T.s)?.skill] || 'hammer';
      const sp = 0.6 + 0.4 * this.quality(r, this.jobsDef(T.s)?.skill || 'fab');
      T.t += dt * sp;
      sx.fxT = (sx.fxT || 0) - dt;
      if (sx.fxT <= 0 && this.near(b.x, b.z)) { sx.fxT = 0.8; P?.sparkle?.(b.x, (b.y || 0) + 0.45, b.z, 2, 0xfff2b0); }
      this.gainXp(r, dt * 0.2);
      if (T.t >= T.dur) {
        if (T.carry && T.carry.to) {
          this.holdProp(b, T.carry.item);
          const to = this.pointOf(T.carry.to);
          T.to = to;
          b.sx = { st: 'task_carry', t: 0 };
        } else this.finishTask(b);
      }
    } else if (sx.st === 'task_carry') {
      const to = T.to;
      if (!to || (to.s && to.s.removed)) { this.failTask(b); return; }
      const p = to.s ? this.door(to.s) : to;
      if (this.move(b, p.x, p.z, dt, 2.1 * this.speedOf(r) * (r.has('strong') ? 1.15 : 1), 0.22)) b.sx = { st: 'task_drop', t: 0 };
    } else if (sx.st === 'task_drop') {
      if (sx.t > 0.45) { this.dropProp(b); P?.dust?.(b.x, b.y || 0, b.z, 2); this.finishTask(b); }
    }
  }
  finishTask(b) {
    const T = b.task;
    b.task = null;
    b.sx = { st: 'idle', t: 0 };
    try { T?.onDone?.(b.staff); } catch (e) { console.error('[staff] task onDone', e); }
  }
  failTask(b) {
    const T = b.task;
    if (!T) return;
    b.task = null;
    this.dropProp(b);
    if (b.sx && b.sx.st?.startsWith('task')) b.sx = { st: 'idle', t: 0 };
    try { T.onFail?.(b.staff); } catch (e) { console.error('[staff] task onFail', e); }
  }
  holdProp(b, item) {
    this.dropProp(b);
    let m = null;
    try { m = item ? this.game.storage?.makeProp?.(item) || null : null; } catch { m = null; }
    if (!m) m = this.crateProp();
    const rig = b.rig;
    const j = rig.carryJ || rig.logJ || rig.root;
    // models are in world units; the joint may be scaled
    const ws = new THREE.Vector3();
    rig.root.updateMatrixWorld(true);
    j.getWorldScale(ws);
    m.scale.multiplyScalar(1 / Math.max(1e-3, ws.x));
    j.add(m);
    b.prop = m;
    b.carryItem = item || 'crate';
  }
  dropProp(b) {
    if (!b?.prop) return;
    b.prop.parent?.remove(b.prop);
    b.prop = null;
    b.carryItem = null;
  }
  crateProp() {
    if (!this._crateGeo) {
      this._crateGeo = new THREE.BoxGeometry(0.22, 0.16, 0.18);
      this._crateMat = new THREE.MeshLambertMaterial({ color: 0xb48452 });
    }
    const m = new THREE.Mesh(this._crateGeo, this._crateMat);
    m.position.y = 0.08;
    m.castShadow = true;
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  // ------------------------------------------------------------------ injuries
  /** Knock a beaver over (id, record or BeaverSystem beaver). cause: 'bear' | 'overwork' | 'fall' | ... */
  injure(target, cause = 'bear') {
    const r = this.get(target);
    if (!r || r.hurt || !r.agent || r.train) return false;
    const b = r.agent;
    if (b.sx?.st === 'inside' || b.sx?.st === 'away' || b.sx?.st === 'leave') return false;
    if (b.task) this.failTask(b);
    this.takeControl(b);
    this.dropProp(b);
    b.rig.root.visible = true;
    r.hurt = { cause, state: 'down', day: this.game.state.day, t: 0, paid: false };
    r.hurt.cost = this.rescueCost(r);
    r.mood = clamp(r.mood - 12, 0, 100);
    r.stats.hurt = (r.stats.hurt || 0) + 1;
    b.sx = { st: 'down', t: 0 };
    this.rescues.knock(r, b, cause);
    this.game.emit('staffHurt', { staff: r, cause });
    return true;
  }
  rescueCost(r) {
    const day = this.game.state.day || 1;
    const k = 1 + (this.game.mods?.staffRescue || 0);
    return Math.round(clamp((120 + day * 6 + (r.level - 1) * 28) * k, 90, 400) / 5) * 5;
  }
  /** Pay for the stretcher crew. */
  rescue(id) {
    const r = this.get(id);
    if (!r?.hurt || (r.hurt.state !== 'down' && r.hurt.state !== 'limp')) return { ok: false, cost: 0 };
    const cost = r.hurt.cost || this.rescueCost(r);
    if (this.game.state.coins < cost) { this.game.notify?.(`A rescue costs ${cost} coins!`, 'no'); this.game.audio.play('error', { volume: 0.4 }); return { ok: false, cost }; }
    this.game.spend(cost, 'rescue');
    r.hurt.paid = true;
    r.stats.rescued = (r.stats.rescued || 0) + 1;
    this.rescues.start(r);
    this.game.emit('staffRescued', { staff: r, cost });
    return { ok: true, cost };
  }
  /** Beavers near a point (not hurt, not indoors). */
  nearby(x, z, rad = 1, { all = false } = {}) {
    const out = [];
    for (const r of this.S.list) {
      const b = r.agent;
      if (!b || (!all && r.hurt)) continue;
      const st = b.sx?.st;
      if (st === 'inside' || st === 'away' || !b.rig.root.visible) continue;
      if (Math.hypot(b.x - x, b.z - z) <= rad) out.push(r);
    }
    return out;
  }
  // rampaging bears knock beavers over
  bearHits(dt) {
    if (!dt) return;
    const game = this.game;
    for (const bear of game.bears?.list || []) {
      if (!bear.visible || !bear.angry || bear.goal?.kind === 'leave') continue;
      const R = 0.55 + 0.35 * (bear.def?.scale || 1);
      for (const r of this.nearby(bear.x, bear.z, R)) {
        const key = `${bear.id ?? bear.name}:${r.id}`;
        const last = this.hitT.get(key) || -99;
        if (this.time - last < 8) continue;
        this.hitT.set(key, this.time);
        let p = 0.55;
        for (const t of r.traits) p *= TRAITS[t]?.hurt || 1;
        if (Math.random() < p) {
          if (this.injure(r, 'bear')) {
            const b = r.agent;
            const dx = b.x - bear.x, dz = b.z - bear.z, d = Math.hypot(dx, dz) || 1;
            b.knock = { vx: (dx / d) * 2.2, vz: (dz / d) * 2.2, vy: 2.6, t: 0 };
            game.particles?.word?.('bonk', b.x, (b.y || 0) + 0.9, b.z, { size: 0.26 });
          }
        } else if (r.agent) { this.bark(r, 'bear', 1.6, true); r.mood = clamp(r.mood - (r.has('nervous') ? 6 : 2), 0, 100); }
      }
    }
    if (this.hitT.size > 300) this.hitT.clear();
  }

  // ------------------------------------------------------------------ speech
  bark(r, kind, dur = 1.8, force = false) {
    if (!r?.agent || (!force && this.barkT > 0)) return;
    const b = r.agent;
    if (!b.rig.root.visible || !this.near(b.x, b.z, 18)) return;
    const text = staffLine(r, kind);
    if (!text) return;
    this.barkT = 7 + Math.random() * 5;
    this.game.say?.({ getWorldPos: (v) => v.set(b.x, (b.y || 0) + 0.95 * this.sizeOf(r), b.z) }, text, { mood: kind === 'hurt' || kind === 'sad' || kind === 'quit' ? 'angry' : 'happy', dur, size: 's', key: 'staff' + r.id });
  }
  near(x, z, r = 26) {
    const t = this.game.rig?.target;
    if (!t) return true;
    return Math.hypot(t.x - x, t.z - z) < r + (this.game.rig.wupp || 0.04) * 200;
  }

  // ------------------------------------------------------------------ render
  render(dt) {
    if (!this.game.started) return;
    this.rescues.render(dt); // the stretcher sets the patient's height first
    for (const r of this.S.list) {
      const b = r.agent;
      if (!b || !b.ctl) continue;
      this.pose(r, b, dt);
    }
    // quitters still walking off
    for (const b of this.game.beavers.list) if (b.ctl && !b.staff) this.pose(null, b, dt);
    this.cands.render(dt);
    this.pops.update(dt);
  }
  animFor(r, b) {
    const sx = b.sx || {};
    const st = sx.st;
    if (r?.hurt) return this.rescues.animFor(r, b);
    if (b.celebT > 0) return 'celebrate';
    if (b.state === 'haul') return b.carry ? 'carry_log' : b.job?.phase === 'pick' ? 'pickup' : b.moving ? 'run' : 'idle';
    if (b.carryItem) return b.moving ? 'carry' : 'carry_idle';
    switch (st) {
      case 'cheer': return 'cheer';
      case 'exit': return 'stretch';
      case 'enter': return 'walk';
      case 'sleepout': return 'sleep';
      case 'eat': return 'eat_berry';
      case 'break': return r?.energy < 25 ? 'sit' : (r?.id % 3 === 0 ? 'stretch' : 'sit');
      case 'work': return sx.anim || 'hammer';
      case 'task_work': return sx.anim || 'hammer';
      case 'task_carry': return 'carry';
      case 'task_drop': return 'idle';
      default: break;
    }
    if (b.moving) return b.inWater ? 'swim' : (st === 'go' && sx.run) || st === 'leave' || st === 'awaygo' ? 'run' : 'walk';
    return 'idle';
  }
  pose(r, b, dt) {
    const rig = b.rig;
    if (!rig) return;
    if (b.celebT > 0) b.celebT -= dt;
    // knocked flying by a bear
    if (b.knock) {
      const k = b.knock;
      k.t += dt;
      b.x += k.vx * dt; b.z += k.vz * dt;
      k.vx *= Math.exp(-dt * 2.5); k.vz *= Math.exp(-dt * 2.5);
      k.h = Math.max(0, (k.h || 0) + k.vy * dt);
      k.vy -= 9 * dt;
      if (k.h <= 0 && k.t > 0.1) { b.knock = null; this.game.particles?.dust?.(b.x, b.y || 0, b.z, 4); }
    }
    const s = this.sizeOf(r || b.staff);
    rig.root.position.set(b.x, (b.y || 0) + (b.knock?.h || 0), b.z);
    rig.root.rotation.set(0, Math.PI / 2 - b.heading, 0);
    const st = b.sx?.st;
    if (st === 'enter') {
      const k = Math.max(0.05, 1 - (b.sx.t || 0) / 0.45);
      rig.root.scale.setScalar(s * k);
    } else rig.root.scale.setScalar(s);
    if (!rig.root.visible) return;
    if (rig.play) {
      const want = this.animFor(r, b);
      if (want !== b.anim) { rig.play(rig.anims?.includes(want) ? want : 'idle', { fade: 0.18 }); b.anim = want; }
      rig.update(dt);
    }
  }

  // ------------------------------------------------------------------ hooks
  onNewGame() { this.S; }
  onLoad() {
    const S = this.S;
    this.cands.reset();
    this.rescues.reset();
    // lodge starters whose lodge is gone moved out; hired beavers come back
    for (const r of [...S.list]) {
      if (r.origin === 'lodge' && !r.agent && !this.byKey(r.lodge)) S.list.splice(S.list.indexOf(r), 1);
    }
    for (const r of S.list) {
      if (r.agent || r.origin === 'lodge') continue;
      const p = { x: r._x || this.homeSpot(r).x, z: r._z || this.homeSpot(r).z };
      const b = this.makeAgent(r, p.x, p.z);
      this.takeControl(b);
      b.sx = { st: 'idle', t: 0 };
      if (r.train) { b.sx = { st: 'away', t: 0 }; b.rig.root.visible = false; }
    }
    for (const r of S.list) {
      if (r.hurt && r.agent) this.rescues.restore(r);
    }
    if (S.list.length || this.tents().length || this.game.state.research?.includes?.('r_st_tent')) this.game.unlockFeature?.('staff', { quiet: true });
    if (!S.day) S.day = this.game.state.day;
    this.cands.restore();
  }
}
