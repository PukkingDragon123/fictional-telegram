// [v26 power] Fabrication by beavers. Crafting no longer pops items into an inventory:
// every fabrication building (Smelter, Machine Shop, Circuit Fab, Assembly Bench) has a job
// queue (orders) plus "keep N stocked" targets. A beaver on shift (game.staff.task with the
// 'fab' skill, else the fallback apprentice in Crew.js):
//   1. fetches the inputs from storage (carrying a visible ore / ingot prop) -> the hopper
//   2. works the machine (anims + sparks / steam); needs grid power, slower in a brownout,
//      faster with skill
//   3. the product appears on the bench, then the beaver carries it to storage
// Belts shortcut it: inputs that roll in by belt skip the fetch, products go onto an
// outgoing belt instead of being carried. Full storage stops the machine (a "full" badge).
//
// Machine record (Industry.rec(s), saved in state.ind.m): q (order queue of recipe ids),
// keep ({ rid: target }), h (hopper), o (bench), job ({ rid, p }), t (inputs in transit),
// d (products in transit), why (status), want (needs power now), made.
import * as THREE from 'three';
import { RECIPES, RECIPES_FOR, KEEP_DEFAULT, KEEP_STEPS } from '../../data/structuresIndustry.js';
import { RES_INFO } from '../Resources.js';
import { Crew } from './Crew.js';
import { Badges } from './badges.js';

// where the beaver stands to work (model-local x, z; the machine is centred on 0)
const SPOT = { smelter: [-0.25, 1.18], shop: [-0.55, 1.18], circuitfab: [0.1, 1.18], assembly: [-0.3, 0.72] };
// where finished goods sit on the bench (model-local x, y, z)
const BENCH = { smelter: [0.62, 0.3, 0.55], shop: [0.62, 0.32, 0.68], circuitfab: [0.55, 0.42, 0.62], assembly: [0.55, 0.5, 0.05] };
const WATCHDOG = 120; // s: a staff task that never reports back is written off
// the work anim a staff beaver plays at each machine (src/entities/beaverChibi.js anims)
const WORK_ANIM = { smelter: 'weld', shop: 'hammer', circuitfab: 'type', assembly: 'weld' };
const STAFF_PHASES = new Set(['day', 'rush']); // staff beavers clock off after the feast
const sum = (o) => { let n = 0; for (const v of Object.values(o || {})) n += v; return n; };

export class Fab {
  constructor(ind) {
    this.ind = ind;
    this.game = ind.game;
    this.crew = new Crew(this);
    this.rts = new Map(); // key -> runtime { pend, token, since }
    this.benches = new Map(); // key -> { g, sig }
    this.badges = new Badges(this.game);
    this.group = new THREE.Group();
    this.group.name = 'fabBench';
    this.game.scene.add(this.group);
    this.token = 1;
    this.working = false;
  }

  key(s) { return `${s.type}@${s.x},${s.z}`; }
  isFab(s) { return !!s?.def?.ind?.fab && !s.removed; }
  center(s) { return this.ind.center(s); }
  near(x, z, r = 20) { const t = this.game.rig?.target; return !t || (Math.abs(x - t.x) < r && Math.abs(z - t.z) < r); }
  workSpot(s) {
    const sp = SPOT[s.def.ind.machine] || [0, (s.def.size?.[1] || 1) / 2 + 0.2];
    const p = this.ind.local(s, sp[0], 0, sp[1]);
    return { x: p.x, z: p.z };
  }
  door(s) { return this.workSpot(s); }
  // who does the physical jobs: hired staff when the staff system is there, else the crew
  staff() { const st = this.game.staff; return typeof st?.task === 'function' ? st : null; }
  provider() { return this.staff() || this.crew; }
  rt(s) { const k = this.key(s); let r = this.rts.get(k); if (!r) { r = { pend: null, token: 0, since: 0 }; this.rts.set(k, r); } return r; }
  workers(s) {
    const st = this.staff();
    if (st) { try { return st.workersAt?.(s) || []; } catch { return []; } }
    return this.crew.workersAt(s);
  }
  workerName(s) { const w = this.workers(s)[0]; return w?.name || null; }
  speed(s) {
    const st = this.staff();
    let k = 1;
    if (st) { try { const b = st.boost?.(s); if (b != null) k = Math.max(0.5, b || 1); } catch { /* staff's */ } }
    const m = this.game.mods || {};
    return k * (1 + (m.indWorkSpeed || 0) + (m.indPowerSpeed || 0));
  }

  // ------------------------------------------------------------ recipes
  recipes(s) { return RECIPES_FOR[s.def.ind.machine] || []; }
  outId(rid) { return Object.keys(RECIPES[rid].out)[0]; }
  keepOf(r, rid) { const v = r.keep?.[rid]; return v == null ? KEEP_DEFAULT : v; }
  cycleKeep(r, rid) {
    r.keep ||= {};
    const cur = this.keepOf(r, rid);
    const i = KEEP_STEPS.indexOf(cur);
    r.keep[rid] = KEEP_STEPS[(i + 1) % KEEP_STEPS.length];
  }
  order(s, rid, n = 1) {
    const r = this.ind.rec(s);
    r.q ||= [];
    for (let i = 0; i < n && r.q.length < 12; i++) r.q.push(rid);
  }
  cancel(s, i) { const r = this.ind.rec(s); if (r.q && i >= 0 && i < r.q.length) r.q.splice(i, 1); }
  // what is still missing for rid (hopper + in transit count), and whether storage has it
  missing(r, rid) {
    const out = {};
    for (const [id, n] of Object.entries(RECIPES[rid].in)) {
      const have = (r.h[id] || 0) + (r.t?.[id] || 0);
      if (have < n) out[id] = n - have;
    }
    return out;
  }
  available(r, rid) {
    const res = this.game.res;
    return Object.entries(this.missing(r, rid)).every(([id, n]) => (res?.count(id) || 0) >= n);
  }
  roomFor(s, rid) {
    if (this.ind.outBelts(s).length) return true;
    const st = this.game.storage;
    const id = this.outId(rid), n = RECIPES[rid].out[id];
    return st ? st.canStore(id, n) : true;
  }
  // the next recipe: the order queue first, else whatever is furthest below its keep target
  next(s, r) {
    while (r.q?.length && !RECIPES[r.q[0]]) r.q.shift();
    if (r.q?.length) return { rid: r.q[0], order: true };
    let best = null, bk = Infinity;
    for (const rid of this.recipes(s)) {
      const target = this.keepOf(r, rid);
      if (!target) continue;
      const have = this.game.res?.count(this.outId(rid)) || 0;
      if (have >= target) continue;
      const ready = Object.entries(RECIPES[rid].in).every(([id, n]) => (r.h[id] || 0) >= n);
      if (!ready && !this.available(r, rid)) continue;
      const k = have / target - (ready ? 1 : 0);
      if (k < bk) { bk = k; best = rid; }
    }
    return best ? { rid: best } : null;
  }
  // the recipe a belt / chute should feed (Industry.accepts + the Supply Chute)
  feedRecipe(s, r) {
    if (r.job) return null;
    const n = this.next(s, r);
    if (n) return n.rid;
    return null;
  }
  wantsInput(s, r, id) {
    const list = r.q?.length ? [r.q[0]] : this.recipes(s).filter((rid) => this.keepOf(r, rid) > 0);
    return list.some((rid) => RECIPES[rid]?.in[id] && (r.h[id] || 0) < RECIPES[rid].in[id] * 2);
  }

  // ------------------------------------------------------------ the tick (Industry.update, per machine)
  migrate(r) {
    if (typeof r.job === 'string') { r.job = RECIPES[r.job] ? { rid: r.job, p: r.p || 0 } : null; }
    if (r.r && r.r !== 'auto' && !r.keep && RECIPES[r.r]) { r.keep = {}; for (const rid of Object.keys(RECIPES)) if (RECIPES[rid].machine === RECIPES[r.r].machine) r.keep[rid] = rid === r.r ? 40 : 0; }
    if (r.r) delete r.r;
    r.q ||= [];
    r.h ||= {}; r.o ||= {};
  }
  tick(s, r, sdt, working, pw) {
    this.migrate(r);
    const game = this.game;
    const rt = this.rt(s);
    r.running = false;
    r.want = false;
    r.dark = false;
    if (rt.pend && this.staff() && game.time - rt.since > WATCHDOG) this.lost(s, r, rt);
    if (r.off) { r.why = 'off'; return { on: false, lamp: 'off' }; }
    if (!working || (this.staff() && !STAFF_PHASES.has(game.state.phase))) { r.why = 'closed'; return { on: false, lamp: 'idle' }; }
    const P = this.provider();
    const st = game.storage;
    const c = this.door(s);
    // 1. finished goods on the bench: onto a belt, else a beaver carries them to storage
    if (sum(r.o) > 0) {
      const belts = this.ind.outBelts(s);
      if (belts.length) this.ind.flushOut(s, r, true);
      else if (!rt.pend) {
        const id = Object.keys(r.o).find((k) => r.o[k] > 0);
        const dest = st ? st.nearestWithRoom(id, c.x, c.z) : null;
        if (st && !dest) { r.why = 'full'; return { on: false, lamp: 'warn' }; }
        const n = st ? Math.min(r.o[id], st.room(dest, id)) : r.o[id];
        r.o[id] -= n; if (r.o[id] <= 0) delete r.o[id];
        r.d = { [id]: n };
        const tok = this.begin(rt, 'deliver');
        const ok = P.task(s, {
          kind: 'deliver', dur: 0.5, anim: 'pickup', carry: { item: id, to: dest || s }, title: `${RES_INFO[id]?.name || id} to storage`,
          onDone: () => { if (rt.token !== tok) return; this.end(rt); this.store(s, r, dest); },
          onFail: () => { if (rt.token !== tok) return; this.end(rt); for (const [k, v] of Object.entries(r.d || {})) r.o[k] = (r.o[k] || 0) + v; r.d = null; },
        });
        if (!ok) { this.end(rt); r.o[id] = (r.o[id] || 0) + n; r.d = null; r.why = 'nobeaver'; return { on: false, lamp: 'warn' }; }
        r.why = 'deliver';
        return { on: false, lamp: 'idle' };
      }
    }
    // 2. a job on the machine: the beaver works it while there's power
    if (r.job) {
      const R = RECIPES[r.job.rid];
      if (!R) { r.job = null; return { on: false, lamp: 'idle' }; }
      r.want = true;
      if (pw < 0.15) { r.why = 'nopower'; r.dark = true; if (rt.pend !== 'fab') return { on: false, lamp: 'warn' }; }
      if (!rt.pend) {
        const sp = this.speed(s);
        const est = Math.max(1, (R.time * (1 - (r.job.p || 0))) / (sp * Math.max(0.3, pw)));
        const tok = this.begin(rt, 'fab');
        const ok = P.task(s, {
          kind: 'fab', dur: est, anim: WORK_ANIM[s.def.ind.machine] || 'hammer', title: R.name,
          until: () => !r.job || r.job.p >= 1 || !this.working,
          onDone: () => { if (rt.token === tok) this.end(rt); },
          onFail: () => { if (rt.token === tok) this.end(rt); },
        });
        if (!ok) { this.end(rt); r.why = 'nobeaver'; return { on: false, lamp: 'warn' }; }
      }
      if (rt.pend === 'fab' && pw >= 0.15 && sdt > 0) {
        // the beaver has to be there (staff walk over first)
        const ws = this.workers(s), w = ws[0];
        const here = this.staff() ? ws.some((x) => x.agent?.sx?.st === 'task_work') : !w || w.x == null || Math.hypot(w.x - c.x, w.z - c.z) < 1.6;
        if (here) {
          r.job.p = (r.job.p || 0) + (sdt * this.speed(s) * pw) / R.time;
          r.running = true;
          r.why = pw < 0.999 ? 'brown' : 'run';
          this.machineFx(s, sdt);
        } else r.why = 'walk';
      }
      if (r.job.p >= 1) this.finish(s, r);
      return { on: r.running, lamp: r.running ? 'on' : r.why === 'nopower' ? 'warn' : 'idle' };
    }
    if (rt.pend) { r.why = rt.pend === 'fetch' ? 'fetch' : r.why; return { on: false, lamp: 'idle' }; }
    // 3. what next?
    const nx = this.next(s, r);
    if (!nx) {
      r.cur = null;
      // an order we can't make (yet): say what's missing
      r.why = r.q?.length ? 'noinput' : 'idle';
      return { on: false, lamp: 'idle' };
    }
    const rid = nx.rid;
    r.cur = rid;
    const R = RECIPES[rid];
    if (!this.roomFor(s, rid)) { r.why = 'full'; return { on: false, lamp: 'warn' }; }
    // work to do but no power: nobody hauls ore to a dead machine (the plug flashes)
    if (pw < 0.15) { r.why = 'nopower'; r.dark = true; return { on: false, lamp: 'warn' }; }
    const miss = this.missing(r, rid);
    if (!Object.keys(miss).length) {
      // everything is in the hopper: start when there's power
      r.want = true;
      if (pw < 0.15) { r.why = 'nopower'; return { on: false, lamp: 'warn' }; }
      for (const [id, n] of Object.entries(R.in)) { r.h[id] -= n; if (r.h[id] <= 0) delete r.h[id]; }
      r.job = { rid, p: 0 };
      if (nx.order) r.q.shift();
      game.audio?.play(s.def.ind.machine === 'smelter' ? 'ind_pour' : 'ind_clank', { volume: this.near(c.x, c.z) ? 0.25 : 0, pitch: 1.2 });
      return { on: false, lamp: 'on' };
    }
    // fetch: one trip to the storage holding the most of what's missing
    if (!st) { r.why = 'noinput'; return { on: false, lamp: 'idle' }; }
    let src = null, best = 0;
    for (const id of Object.keys(miss)) {
      const cand = st.nearestWithStock(id, c.x, c.z);
      if (!cand) continue;
      let k = 0;
      for (const [j, n] of Object.entries(miss)) k += Math.min(n, st.stock(cand, j));
      const score = k * 10 - st.dist(cand, c.x, c.z);
      if (k > 0 && (!src || score > best)) { src = cand; best = score; }
    }
    if (!src) { r.why = 'noinput'; return { on: false, lamp: 'idle' }; }
    const bundle = {};
    let main = null, mainN = 0;
    for (const [id, n] of Object.entries(miss)) {
      const k = st.takeFrom(src, id, n);
      if (k > 0) { bundle[id] = k; if (k > mainN) { main = id; mainN = k; } }
    }
    if (!main) { r.why = 'noinput'; return { on: false, lamp: 'idle' }; }
    r.t = { ...(r.t || {}) };
    for (const [id, k] of Object.entries(bundle)) r.t[id] = (r.t[id] || 0) + k;
    const tok = this.begin(rt, 'fetch');
    const at = src.site ? st.door(src) : src;
    const ok = P.task(s, {
      kind: 'fetch', at, dur: 0.6, anim: 'pickup', carry: { item: main, to: s }, title: `Fetch ${RES_INFO[main]?.name || main}`,
      onDone: () => { if (rt.token !== tok) return; this.end(rt); this.arrive(r, bundle); },
      onFail: () => { if (rt.token !== tok) return; this.end(rt); this.giveBack(s, r, bundle, src); },
    });
    if (!ok) { this.end(rt); this.giveBack(s, r, bundle, src); r.why = 'nobeaver'; return { on: false, lamp: 'warn' }; }
    r.why = 'fetch';
    return { on: false, lamp: 'idle' };
  }
  begin(rt, kind) { rt.pend = kind; rt.token = this.token++; rt.since = this.game.time; return rt.token; }
  end(rt) { rt.pend = null; rt.token = 0; }
  arrive(r, bundle) {
    for (const [id, k] of Object.entries(bundle)) {
      r.h[id] = (r.h[id] || 0) + k;
      if (r.t?.[id]) { r.t[id] -= k; if (r.t[id] <= 0) delete r.t[id]; }
    }
    if (r.t && !Object.keys(r.t).length) r.t = null;
  }
  giveBack(s, r, bundle, src) {
    const st = this.game.storage;
    for (const [id, k] of Object.entries(bundle)) {
      if (r.t?.[id]) { r.t[id] -= k; if (r.t[id] <= 0) delete r.t[id]; }
      const back = st && src && !src.removed ? st.put(src, id, k) : 0;
      if (back < k) this.game.res?.add(id, k - back, s.x + 0.5, s.z + 0.5);
    }
    if (r.t && !Object.keys(r.t).length) r.t = null;
  }
  // the delivery arrived at the storage door
  store(s, r, dest) {
    const st = this.game.storage;
    const d = r.d || {};
    r.d = null;
    for (const [id, n] of Object.entries(d)) {
      let k = st && dest && !dest.removed ? st.put(dest, id, n) : 0;
      if (k < n) k += this.game.res?.add(id, n - k, dest?.x, dest?.z) || 0;
      const p = dest && st ? st.center(dest) : this.center(s);
      const y = dest && st ? st.topY(dest) : this.ind.baseY(s) + 1.4;
      if (this.near(p.x, p.z)) this.game.ui?.floatTextAt?.(p.x, y, p.z, `+${n} ${RES_INFO[id]?.name || id}`, '#c8ff9a');
      this.game.emit('fabStored', { s, id, n, dest });
    }
  }
  // a staff task that never came back: whatever it carried goes into storage
  lost(s, r, rt) {
    if (rt.pend === 'fetch' && r.t) { for (const [id, k] of Object.entries(r.t)) this.game.res?.add(id, k, s.x + 0.5, s.z + 0.5); r.t = null; }
    if (rt.pend === 'deliver' && r.d) { for (const [id, k] of Object.entries(r.d)) this.game.res?.add(id, k, s.x + 0.5, s.z + 0.5); r.d = null; }
    this.end(rt);
  }
  finish(s, r) {
    const game = this.game;
    const R = RECIPES[r.job.rid];
    const I = this.ind.st;
    for (const [id, n] of Object.entries(R.out)) { r.o[id] = (r.o[id] || 0) + n; I.made[id] = (I.made[id] || 0) + n; }
    r.made = (r.made || 0) + 1;
    r.job = null;
    const p = this.benchPos(s);
    if (this.near(p.x, p.z)) {
      game.audio?.play(s.def.ind.machine === 'smelter' ? 'ind_pour' : 'ind_clank', { volume: 0.35 });
      game.particles.sparkle(p.x, p.y + 0.15, p.z, 6, s.def.ind.machine === 'smelter' ? 0xffa040 : 0xfff0a0);
      game.particles.puff(p.x, p.y + 0.1, p.z, 4, 0.18);
    }
    for (const w of this.workers(s)) if (w.rig && w.cheerT != null) w.cheerT = 0.9;
    game.emit('indMade', { s, out: R.out });
  }

  // ------------------------------------------------------------ FX
  benchPos(s) {
    const b = BENCH[s.def.ind.machine] || [0.5, 0.35, 0.5];
    return this.ind.local(s, b[0], b[1], b[2]);
  }
  machineFx(s, dt) {
    const game = this.game;
    const c = this.center(s);
    if (!this.near(c.x, c.z, 26)) return;
    const m = s.def.ind.machine;
    if (m === 'smelter') {
      this.ind.smoke(s, 1);
      if (Math.random() < dt * 2.5) { const p = this.ind.local(s, 0.6, 0.45, 0.55); game.particles.fx.spawn('smoke', p.x, p.y, p.z, { vx: 0, vy: 0.7, vz: 0, drag: 0.4, life: 1.2, size: 0.16, flags: 16 | 1024, tint: [1.15, 1.15, 1.15] }); }
      if (Math.random() < dt * 1.5) { const p = this.ind.local(s, -0.25, 0.3, 0.3); game.particles.sparkle(p.x, p.y, p.z, 2, 0xff9a30); }
    } else if (m === 'shop') {
      this.ind.smoke(s, 0.45);
      if (Math.random() < dt * 3) { const p = this.ind.local(s, -0.65, 0.45, -0.55); game.particles.sparkle(p.x, p.y, p.z, 2, 0xffd060); }
    } else if (m === 'circuitfab') {
      if (Math.random() < dt * 4) { const p = this.ind.local(s, 0.05, 0.62, 0.35); game.particles.sparkle(p.x, p.y, p.z, 1, 0xbfe8ff); }
      if (Math.random() < dt * 1.2) { const p = this.ind.local(s, 0.05, 0.66, 0.35); game.particles.fx.spawn('smoke', p.x, p.y, p.z, { vx: 0.05, vy: 0.4, vz: 0, drag: 0.5, life: 1, size: 0.08, flags: 16 | 1024 | 64, tint: [1.1, 1.1, 1.1] }); }
    } else {
      if (Math.random() < dt * 2.5) { const p = this.ind.local(s, 0.15, 0.55, 0.15); game.particles.sparkle(p.x, p.y, p.z, 2, 0xffe08a); }
    }
  }
  // beaver at work (Crew): a clank now and then
  workFx(s, b, dt) {
    if (Math.random() < dt * 1.4 && this.near(b.x, b.z, 18)) this.game.audio?.play(Math.random() < 0.5 ? 'hammer' : 'nail', { volume: 0.12, pitch: 1.1 + Math.random() * 0.3 });
  }

  // the bench: products wait here for the beaver (visible props, up to 3)
  renderBench(s, r) {
    const k = this.key(s);
    let B = this.benches.get(k);
    const sig = Object.entries(r.o || {}).filter(([, n]) => n > 0).map(([id, n]) => `${id}${Math.min(3, n)}`).join(',');
    if (!B) { B = { g: new THREE.Group(), sig: '' }; this.group.add(B.g); this.benches.set(k, B); }
    B.alive = true;
    if (B.sig !== sig) {
      B.sig = sig;
      for (const ch of [...B.g.children]) B.g.remove(ch);
      let i = 0;
      for (const [id, n] of Object.entries(r.o || {})) for (let j = 0; j < Math.min(3, n) && i < 4; j++, i++) {
        const m = this.game.storage?.makeProp?.(id);
        if (!m) continue;
        m.position.set((i % 2) * 0.16 - 0.08, Math.floor(i / 2) * 0.09, (i % 2) * 0.05);
        m.rotation.y = i * 0.7;
        B.g.add(m);
      }
    }
    const p = this.benchPos(s);
    B.g.position.set(p.x, p.y, p.z);
    B.g.visible = !!sig && !this.game.overrideScene;
  }

  // ------------------------------------------------------------ per frame (from Industry.update)
  frame(list, sdt, dt, working) {
    this.working = working;
    const useCrew = !this.staff();
    for (const B of this.benches.values()) B.alive = false;
    for (const s of list) {
      if (!this.isFab(s) || !s.built) continue;
      const r = this.ind.rec(s);
      if (useCrew) this.crew.ensure(s);
      this.renderBench(s, r);
      // badges: full storage, nobody on shift
      const c = this.center(s);
      const y = this.ind.baseY(s) + ((s.def.size?.[0] || 1) > 1 ? 2.1 : 1.45);
      if (r.why === 'full') this.badges.set('full:' + this.key(s), 'st_full', c.x + 0.35, y, c.z);
      else if (r.why === 'nobeaver' && !useCrew) this.badges.set('crew:' + this.key(s), 'beaver', c.x, y, c.z, { blink: true, size: 0.4 });
    }
    for (const [k, B] of this.benches) if (!B.alive) { this.group.remove(B.g); this.benches.delete(k); }
    if (useCrew) this.crew.update(dt, sdt, working);
    else if (this.crew.list.length) this.crew.clear();
    this.crew.render(dt);
    this.badges.frame(dt);
  }
  onLoad() {
    this.crew.clear();
    this.rts.clear();
    for (const B of this.benches.values()) this.group.remove(B.g);
    this.benches.clear();
    this.badges.clear();
    // things that were in a beaver's arms when the game was saved
    const I = this.ind.st;
    for (const r of Object.values(I.m || {})) {
      if (r.t) { for (const [id, k] of Object.entries(r.t)) r.h ? (r.h[id] = (r.h[id] || 0) + k) : null; r.t = null; }
      if (r.d) { for (const [id, k] of Object.entries(r.d)) r.o ? (r.o[id] = (r.o[id] || 0) + k) : null; r.d = null; }
    }
  }
  // a machine went away: its hopper, bench and anything in transit go back to storage
  dropMachine(r, x, z) {
    for (const bag of [r.h, r.o, r.t, r.d]) for (const [id, n] of Object.entries(bag || {})) if (n > 0) this.game.res?.add(id, n, x, z);
    if (r.job && RECIPES[r.job.rid]) for (const [id, n] of Object.entries(RECIPES[r.job.rid].in)) this.game.res?.add(id, n, x, z);
  }
}
