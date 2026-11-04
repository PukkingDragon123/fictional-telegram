// [v32 dive] game.dive: THE DIVE. Loon Lake, Noodles' catch, Chief Buff's lessons, the
// underwater scene (DiveMode) and the fish farms down there (DiveFarms).
//
// The story (game.state.dive.story / .pending, queued Director scenes, see scenes.js):
//   day 3+     a bottle floats into the pond (bottle_in) -> quest dv_bottle (decrypt Loon Lake, Lake Trail)
//   Lake Trail researched -> the Loon Lake fog lifts (Noodles) -> noodles_in -> dv_catch
//   dv_catch done   -> buff_in (Chief's dive school opens, snorkel)     -> dv_lesson1
//   dv_lesson1 done -> flippers                                          -> dv_lesson2
//   dv_lesson2 done -> farm_talk                                         -> dv_farm
//   dv_farm done    -> helmet_talk                                       -> dv_helmet
//   dv_helmet done  -> graduation                                        -> dv_whiskers
//   dv_whiskers done -> whiskers_out
// Noodles' catch: one a day, three tiers (data/dive.js CATCHES), a noodling scene, the fish go
// up the river by Moose Express (genes tagged wild: 'noodles' -> 'diveCatchHome' when unboxed).
//
// State: game.state.dive = { gear: [], farms: [], nextId, story: {}, pending: [], catchDay, catches,
//   harvests, pearls, dives, hoops, litter, seenWreck, seenWhiskers }
// Debug (console): __game.dive.debugUnlock(), .debugEnter(), .debugFarms(), .play('buff_in'), .hire('creel', { free: true })
import * as THREE from 'three';
import { LAKE, CATCHES, CATCH_BY_ID, GEAR, GEAR_ORDER, FARMS, DIVE_QUEST_IDS, DIVE_ZONES } from '../../data/dive.js';
import { RESEARCH } from '../../data/research.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import { rollGenes, rarityOf } from '../genes.js';
import { WATER_Y } from '../../world/grid.js';
import { DiveMode } from './DiveMode.js';
import { DiveFarms } from './farms.js';
import { DIVE_SCENES } from './scenes.js';
import { makeLakeCamp, makeDiveDock, makeDiveShack, makeDiveBuoy, makeReedClump, makeLakeLily } from '../../entities/diveModels.js';

const NEXT_SCENE = { dv_catch: 'buff_in', dv_lesson1: 'flippers', dv_lesson2: 'farm_talk', dv_farm: 'helmet_talk', dv_helmet: 'graduation', dv_whiskers: 'whiskers_out' };
const pickW = (list) => { let x = Math.random() * list.reduce((a, [, w]) => a + w, 0); for (const [id, w] of list) { x -= w; if (x <= 0) return id; } return list[0][0]; };
const _v = new THREE.Vector3();

export class DiveSystem {
  constructor(game) {
    this.game = game;
    this.mode = new DiveMode(this);
    this.farms = new DiveFarms(this);
    this.t = 2;
    this.lake = null; // world props we animate (buoy)
    game.on('zone', (Z) => this.onZone(Z));
    game.on('questDone', (q) => this.onQuestDone(q));
    game.on('research', (r) => this.onResearch(r));
    // a new morning: the farms grew overnight (once per day: loading a save also starts a day)
    game.on('day', () => { try { const S = this.S, d = game.state.day; if (S.grownDay !== d) { const first = S.grownDay == null; S.grownDay = d; if (!first) this.farms.night(); } } catch (e) { console.warn('[dive] night', e); } });
    game.on('fishArrived', (f) => this.onFishArrived(f));
    if (typeof window !== 'undefined') window.__dive = this;
  }

  // ------------------------------------------------------------------ state
  get S() {
    const st = this.game.state;
    if (!st.dive || typeof st.dive !== 'object') st.dive = {};
    const S = st.dive;
    if (!Array.isArray(S.gear)) S.gear = [];
    if (!Array.isArray(S.farms)) S.farms = [];
    if (!Array.isArray(S.pending)) S.pending = [];
    S.story ||= {};
    S.nextId ||= 1;
    return S;
  }
  get active() { return this.mode.active; }
  onNewGame() { this.game.state.dive = {}; this.S; }
  onLoad() {
    const S = this.S;
    for (const f of S.farms) S.nextId = Math.max(S.nextId, (f.id || 0) + 1);
    // the zones follow the story (old saves, debug)
    const res = this.game.state.research || [];
    if (res.includes('r_dv_trail') && !this.zoneOpen('lake') && S.story.noodles_in) this.openZone('lake', true);
    if (S.story.buff_in && !this.zoneOpen('diveschool')) this.openZone('diveschool', true);
    this.requeue();
  }

  zoneDef(id) { return DIVE_ZONES.find((Z) => Z.id === id) || null; }
  zoneOpen(id) { return !!this.game.zones?.isOpen?.(id); }
  openZone(id, quiet = false) {
    const Z = this.zoneDef(id);
    if (!Z || this.zoneOpen(id)) return;
    this.game.zones.reveal(Z, { x: Z.cx, z: Z.cz + 2 }, { quiet });
    if (quiet) { try { this.game.villagers?.revealed(Z); } catch { /* ignore */ } }
  }
  sectionOpen() { try { return this.game.sectionOpen('dive'); } catch { return false; } }
  has(id) { return (this.game.state.research || []).includes(id); }
  questActive(id) { return (this.game.quests?.S?.active || []).includes(id); }
  questDone(id) { return (this.game.quests?.S?.done || []).includes(id); }
  stepDone(qid, k) { return !!this.game.quests?.S?.prog?.[qid]?.[k]; }

  // ------------------------------------------------------------------ gear
  gear() {
    const S = this.S;
    if (this.has('r_dv_tanks') && this.has('r_dv_helmet')) return GEAR.tanks;
    if (this.has('r_dv_helmet') && S.gear.includes('snorkel')) return GEAR.helmet;
    if (S.gear.includes('flippers')) return GEAR.flippers;
    if (S.gear.includes('snorkel')) return GEAR.snorkel;
    return null;
  }
  giveGear(id) {
    const S = this.S;
    if (S.gear.includes(id)) return;
    S.gear.push(id);
    this.game.emit('diveGear', { id });
    this.game.save?.();
  }

  // ------------------------------------------------------------------ the story
  queue(id, opts = {}) {
    const S = this.S;
    if (S.story[id] || !DIVE_SCENES[id]) return;
    if (!S.pending.includes(id)) S.pending.push(id);
    this.game.director?.queue((c) => this.runScene(id, c, opts), { id: 'dv_' + id });
  }
  requeue() { for (const id of [...this.S.pending]) this.game.director?.queue((c) => this.runScene(id, c), { id: 'dv_' + id }); }
  async runScene(id, c, opts) {
    const S = this.S;
    if (S.story[id] && id !== 'catch') return;
    if (id !== 'catch') { S.story[id] = true; S.pending = S.pending.filter((x) => x !== id); }
    await DIVE_SCENES[id](c, this, opts);
    this.game.save?.();
  }
  /** play any scene now (debug) */
  play(id, opts) { const S = this.S; delete S.story[id]; return this.game.director?.play((c) => this.runScene(id, c, opts), { id: 'dv_' + id }); }

  onZone(Z) {
    if (Z?.id === 'lake') {
      // NpcScenes has no arrival for Noodles: ours is a Director scene
      const ns = this.game.state.npcScenes;
      if (ns) { ns.queue = (ns.queue || []).filter((z) => z !== 'lake' && z !== 'diveschool'); (ns.arrive ||= {}).noodles = 1; }
      this.queue('noodles_in');
    }
    if (Z?.id === 'diveschool') { const ns = this.game.state.npcScenes; if (ns) { ns.queue = (ns.queue || []).filter((z) => z !== 'diveschool'); (ns.arrive ||= {}).buff = 1; } }
  }
  onQuestDone(q) {
    const next = NEXT_SCENE[q?.id];
    if (next) this.queue(next);
  }
  onResearch(r) {
    if (!r?.id?.startsWith?.('r_dv_')) return;
    const g = this.game;
    if (r.id === 'r_dv_helmet') setTimeout(() => g.notify?.('The brass helmet is ready at Chief Buff\'s! Long dives, and the Deep Hole.', 'excited', { dur: 4 }), 1200);
    if (r.id === 'r_dv_tanks') setTimeout(() => g.notify?.('Twin air tanks! Very long dives now.', 'excited', { dur: 3.5 }), 1200);
  }
  onFishArrived(f) {
    if (f?.g?.wild !== 'noodles') return;
    const S = this.S;
    if (S.catchHome === S.catches) return;
    S.catchHome = S.catches;
    this.game.emit('diveCatchHome', { species: f.sp?.id });
  }
  onSurfaced() { /* quests ticked by events; scenes are queued by questDone */ }
  onBuilt(f) { this.game.notify?.(`${FARMS[f.type].name} built on the lake bed!`, 'happy', { dur: 3 }); }

  /** which lesson the next dive runs (Chief swims along for the first ones) */
  lessonNow() {
    if (this.questActive('dv_lesson1')) return 'lesson1';
    if (this.questActive('dv_lesson2')) return 'lesson2';
    if (this.questActive('dv_farm') && this.has('r_dv_pen')) return 'farm';
    if (this.questActive('dv_helmet') && this.gear()?.deep) return 'helmet';
    return 'free';
  }
  /** the lesson card shown while diving: the active dive quest's steps */
  lessonCard() {
    const Q = this.game.quests;
    if (!Q) return null;
    const id = DIVE_QUEST_IDS.find((x) => this.questActive(x));
    if (!id) return null;
    const q = Q.view?.().find((x) => x.id === id);
    if (!q) return null;
    return { title: q.title, sub: id.startsWith('dv_lesson') || id === 'dv_farm' || id === 'dv_helmet' ? 'Chief Buff\'s orders' : 'Loon Lake', steps: q.steps };
  }
  whiskersHere() { return this.questActive('dv_whiskers') || this.questDone('dv_whiskers'); }

  // ------------------------------------------------------------------ Noodles' catch
  catchReady() { return this.S.catchDay !== this.game.state.day; }
  rollCatch(tier) {
    const T = CATCH_BY_ID[tier];
    const g = this.game, out = [];
    for (let i = 0; i < T.n; i++) {
      let sp = pickW(T.pool), whiskers = false;
      if (T.whiskers && i === 0 && Math.random() < T.whiskers) { sp = 'catfish'; whiskers = true; }
      const genes = rollGenes(sp, g.mods, { luck: T.luck });
      genes.wild = 'noodles';
      if (whiskers) { genes.morph = 'golden'; genes.size = 1.32; genes.stars = 5; genes.traits = ['sparkly'].filter((t) => t); }
      const rarity = rarityOf(genes.stars || 1);
      out.push({ species: sp, genes, whiskers, golden: genes.morph === 'golden', rare: rarity >= 2 });
    }
    return out;
  }
  hire(tier, { free = false } = {}) {
    const g = this.game, T = CATCH_BY_ID[tier];
    if (!T) return false;
    if (!free && !this.catchReady()) { g.notify?.('Noodles already went noodling today. Come back tomorrow!', 'no'); return false; }
    if (!free && T.research && !this.has(T.research)) { g.notify?.(`Research ${T.name} in the Lab first.`, 'no'); return false; }
    if (!free && !g.spend(T.price, 'shop')) return false;
    const S = this.S;
    S.catchDay = g.state.day;
    S.catches = (S.catches || 0) + 1;
    const fish = this.rollCatch(tier);
    S.lastCatch = fish.map((f) => f.species);
    g.director?.play((c) => this.runScene('catch', c, { tier, fish }), { id: 'dv_catch_' + S.catches }).then(() => {
      g.delivery?.order(fish.map((f) => ({ kind: 'fish', species: f.species, genes: f.genes })), { label: 'Noodles\' catch' });
      g.notify?.('Noodles\' catch is on its way by Moose Express!', 'happy', { dur: 3.5 });
    });
    g.emit('diveCatch', { tier, fish: fish.map((f) => f.species), seen: !!S.seenWhiskers });
    g.save?.();
    return true;
  }

  // ------------------------------------------------------------------ villager hooks
  cardOffers(v, panel) {
    const g = this.game, out = [];
    if (v.id === 'noodles') {
      for (const T of CATCHES) {
        const locked = T.research && !this.has(T.research);
        const today = !this.catchReady();
        out.push({
          icon: T.icon, title: `${T.name} (${T.price} coins)`, desc: locked ? 'Research The Big Noodle in the Lab' : today ? 'Already went noodling today. Tomorrow!' : T.desc,
          tag: locked ? 'LOCKED' : today ? 'TOMORROW' : 'HIRE', onClick: locked || today ? undefined : panel(() => this.hire(T.id)),
        });
      }
    }
    if (v.id === 'buff') {
      const G = this.gear();
      if (G) out.push({ icon: 'dv_surface', title: 'Go diving!', desc: `${G.name}: ${Math.round(G.air)} s of air${G.deep ? ', the Deep Hole too' : ''}`, tag: 'DIVE', onClick: panel(() => this.mode.enter()) });
      else out.push({ icon: 'dv_mask', title: 'Dive lessons', desc: 'Chief has gear for recruits who earn it.', tag: 'SOON' });
      const L = this.lessonCard();
      if (L) out.push({ icon: 'book', title: L.title, desc: (L.steps.find((s) => !s.done) || {}).text || 'Report to the Chief!', tag: 'LESSON' });
    }
    void g;
    return out;
  }

  /** Villagers.makeProps: the camp (Noodles) / the dock, shack and dive flag (Chief) */
  props(v, put, grp) {
    const g = this.game;
    if (v.id === 'noodles') {
      // each piece of the camp sits on its own patch of ground
      const camp = makeLakeCamp();
      for (const part of [...camp.children]) { const { x, z } = part.position; part.position.set(0, 0, 0); const w = new THREE.Group(); w.add(part); put(w, x, z, 0); }
      // reeds along the waterline nearby
      let n = 0;
      const gr = g.grid;
      for (let dz = -3; dz <= 5 && n < 14; dz++) for (let dx = -6; dx <= 8 && n < 14; dx++) {
        const x = Math.floor(v.x) + dx, z = Math.floor(v.z) + dz;
        if (!gr.isWater(x, z)) continue;
        let land = false;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (gr.inb(x + a, z + b) && !gr.isWater(x + a, z + b)) land = true;
        if (!land || (x * 7 + z * 13) % 3 === 0) continue;
        if (Math.abs(x + 0.5 - LAKE.dock.x) < 1.2) continue;
        const r = makeReedClump(x * 31 + z);
        r.position.set(x + 0.5 + ((x * 13) % 5) * 0.06 - 0.12, -0.62, z + 0.5);
        r.rotation.y = (x + z) * 0.9;
        grp.add(r);
        n++;
      }
      // lily pads drifting in the shallows of the basin
      for (const [x, z] of [[84.6, 156.4], [85.4, 157.2], [86.8, 156.1], [83.6, 157.6], [87.6, 158.4], [92.6, 156.2], [93.4, 157.0], [85.9, 159.1]]) {
        if (!gr.isWater(Math.floor(x), Math.floor(z))) continue;
        const p = makeLakeLily(Math.floor(x * 7 + z));
        p.position.set(x, WATER_Y + 0.01, z);
        p.rotation.y = x * 1.7 + z;
        p.castShadow = false;
        grp.add(p);
      }
    }
    if (v.id === 'buff') {
      const shack = makeDiveShack();
      put(shack, -1.1, -1.25, 0);
      const dock = makeDiveDock(LAKE.dock.len);
      dock.position.set(LAKE.dock.x, WATER_Y + 0.22, LAKE.dock.z);
      grp.add(dock);
      const buoy = makeDiveBuoy();
      buoy.position.set(LAKE.buoy.x, WATER_Y, LAKE.buoy.z);
      grp.add(buoy);
      this.lake = { buoy, flag: buoy.userData.flag };
    }
  }

  /** world tap on the dive flag buoy (Input.tap hook) */
  tapAt(sx, sy) {
    const g = this.game;
    if (!this.lake?.buoy || this.mode.active || !this.zoneOpen('diveschool')) return false;
    const b = this.lake.buoy;
    for (const y of [0.1, 0.5]) {
      const p = g.rig.worldToScreen(_v.set(b.position.x, b.position.y + y, b.position.z), g.renderer);
      if (Math.hypot(p.x - sx, p.y - sy) < 30) {
        if (!this.gear()) { g.notify?.('That\'s Chief Buff\'s dive flag. Talk to him first!', 'thinking'); return true; }
        this.mode.enter();
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ loop
  update(simDt, dt) {
    const g = this.game;
    if (this.mode.active) { this.mode.update(dt); return; }
    this.farms.tick(simDt);
    // the buoy bobs, the flag flutters
    if (this.lake?.buoy) {
      const t = g.time || 0, b = this.lake.buoy;
      b.position.y = WATER_Y - 0.05 + Math.sin(t * 1.7) * 0.04;
      b.rotation.z = Math.sin(t * 1.3) * 0.08; b.rotation.x = Math.sin(t * 1.1 + 1) * 0.06;
      if (this.lake.flag) this.lake.flag.rotation.y = Math.sin(t * 5) * 0.25 + Math.sin(t * 9.3) * 0.08;
    }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    const st = g.state, S = this.S;
    if (g.titleMode || !g.started || !(st.tutorialDone || g.skipTutorial) || g.tutorial?.active) return;
    // the bottle (the start of it all)
    if (!S.story.bottle_in && !S.pending.includes('bottle_in') && st.day >= 3 && st.phase === 'day' && st.hour >= 9 && st.hour < 15.5 && !this.has('r_dv_trail')) this.queue('bottle_in');
    // the Lake Trail opens Loon Lake
    if (this.has('r_dv_trail') && !this.zoneOpen('lake') && !g.zones?.busy && g.director?.quiet?.() && (st.phase === 'day' || st.phase === 'morning')) {
      this.openZone('lake');
      g.emit('diveLake', {});
    }
    // safety: a story beat whose quest is done but whose scene never ran (old saves)
    for (const [qid, sc] of Object.entries(NEXT_SCENE)) if (this.questDone(qid) && !S.story[sc] && !S.pending.includes(sc)) this.queue(sc);
  }

  // ------------------------------------------------------------------ debug
  /** skip the story: open the lake + dive school, all gear and dive research, no scenes */
  debugUnlock({ research = true } = {}) {
    const g = this.game, S = this.S;
    for (const id of ['bottle_in', 'noodles_in', 'buff_in', 'flippers', 'farm_talk', 'helmet_talk', 'graduation', 'whiskers_out']) S.story[id] = true;
    S.pending = [];
    this.openZone('lake', true);
    this.openZone('diveschool', true);
    this.giveGear('snorkel'); this.giveGear('flippers');
    try { g.unlockSection?.('dive', { free: true }); } catch { /* ignore */ }
    if (research) for (const r of RESEARCH) if (r.branch === 'dive') g.research(r.id);
    g.state.coins = Math.max(g.state.coins, 5000);
    g.save?.();
    return this.gear();
  }
  debugEnter() { const g = this.game; if (g.state.phase !== 'day') g.state.phase = 'day'; return this.mode.enter({ instant: true }); }
  /** a few farms in every state (for screenshots) */
  debugFarms() {
    const S = this.S, F = this.farms;
    S.farms = [];
    const mk = (type, x, z) => F.build(type, x, z, { free: true, scene: { obstacles: [] } });
    const a = mk('pen', -7.6, -0.4), b = mk('pen', -1.4, 0.6), c = mk('cage', 5.4, -1.8);
    mk('nursery', -4.6, -3.4); mk('feeder', 1.8, -3.6); const m = mk('mussels', 7.6, 1.3);
    if (a) { a.stock = { sp: 'perch', n: 6, t: 260, need: 260 }; }
    if (b) { b.stock = { sp: 'whitefish', n: 6, t: 120, need: 260 }; }
    if (c) { c.stock = { sp: 'pike', n: 3, t: 100, need: 420 }; }
    if (m) m.pearl = 2;
    if (this.has('r_dv_hatchery')) { const h = F.build('hatchery', 0, 0, { free: true, scene: null }); if (h) h.eggs = 1; }
    this.game.save?.();
    return S.farms.length;
  }
}
