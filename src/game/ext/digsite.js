// [v32 dig] game.digsite: THE DIG (half of the Dig & Dive update).
// (The file is digsite.js, not dig.js: game.dig is already the pond-digging tool.)
//
//  - PROFESSOR SNAPP, an old alligator snapping turtle paleontologist, lives at BONEBED
//    BLUFF (zone 'bonebed', east Old Wood above Fern Brook, tiles ~86..104 x 129..147).
//    The fog lifts with the research "Survey the Bluff" (The Dig section, src/data/ext/dig.js);
//    his arrival is a Director scene (src/game/dig/scenes.js). Rig: src/entities/critterSnapper.js.
//  - FOSSIL SITES: flagged mounds (src/game/dig/sites.js). Tap one: the dig tray minigame
//    (src/ui/dig/DigGame.js). Finds come out crusted: Snapp's LAB BENCH cleans and
//    identifies them (src/ui/dig/LabBench.js), then sell / display (his glass case) / keep.
//  - THE QUESTLINE: src/data/digQuests.js, each beat a scene; Survey Maps reveals more sites.
//  - THE PRIMORDIAL VIAL: 1 amber + 3 fossils at the bench. Fish Scope -> Vial: the fish
//    becomes its PREHISTORIC form (morph 'ancient', own sprites: src/game/dig/ancientFish.js),
//    worth 6x, bears freak out and rave (5 stars), Ancient Bloodlines passes it on.
//
// State: game.state.dig = { arrived, pend: [scene ids], seen: [scene ids], sites: {}, items: [{ uid, id, cond, clean, shown, from, day }],
//   uid, found: { id: n }, vials, brewed, ancient: [species], cleanedAmber, mapDay, mapN, ticketDay, firstAncient }
// API (UI / other systems): tapAt(sx, sy), props(v, put), intro(v), onTap(v), cardOffers(v, panel),
//   crate() item(uid) clean(uid) sell(uid) display(uid) undisplay(uid) displayed() kept(id) displayRoom()
//   vialPlan() brew() vials() canVial(f) scopeButton(f) feedVial(f)
// Debug (console): __game.digsite.debugUnlock(level 1..4), debugFinds(n), debugDig(id?), debugBench(),
//   debugVial(n), debugAncient(speciesId?), debugScene(id), debugSites(), focusBluff()
// Events: digFind, labClean, digDisplay, vialBrewed, fishAncient, bearAteAncient, digZone
import * as THREE from 'three';
import { BONEBED, DIG_ZONE } from '../../data/digSites.js';
import { FIND_BY_ID, FINDS, findValue, VIAL_RECIPE, condOf } from '../../data/digFinds.js';
import { SNAPP } from '../../data/digDialogue.js';
import { DIG_QUESTS, DIG_CHAIN } from '../../data/digQuests.js';
import { ZONE_BY_ID } from '../../data/zones.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import { DigSites } from '../dig/sites.js';
import { arrival, BEATS, snappLiving, vialScene } from '../dig/scenes.js';
import { ancientName, archetypeOf } from '../dig/ancientFish.js';
import { makeBluff, makeLabHut, makeFieldTent, makeTrench, makeSieveBench, makeDisplayCase, makeFindMini, makeRibcage } from '../../entities/digModels.js';
import { openDigGame } from '../../ui/dig/DigGame.js';
import { openLabBench, labBenchOpen } from '../../ui/dig/LabBench.js';
import { injectDigCSS } from '../../ui/dig/digCss.js';
import { KIND } from '../../world/grid.js';
import '../../data/digDialogue.js';

const ID = 'snapp', ZONE = 'bonebed';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (s, o) => s.replace(/\{(\w)\}/g, (_, k) => o[k] ?? '');
const hasAnim = (r, n) => !!r?.anims?.includes?.(n);
const _v = new THREE.Vector3();
const CASE_SLOTS = 9;

export function install(game) { return new DigSite(game); }

class DigSite {
  constructor(game) {
    this.game = game;
    this.sites = new DigSites(this);
    this.busy = false;
    this.mutterT = 14;
    this.refreshT = 0.5;
    this.barkT = 6;
    this.fxT = 1;
    game.on?.('research', (r) => this.onResearch(r));
    game.on?.('day', () => this.morning());
    game.on?.('zone', (Z) => { if (Z?.id === ZONE) { this.sites.refresh(); this.sites.sync(); game.emit?.('digZone', Z); } });
    game.on?.('questDone', (q) => this.onQuestDone(q));
    game.on?.('fishMated', (d) => this.onMated(d));
    this.wrapBears();
    try { injectDigCSS(); } catch { /* no DOM (tests) */ }
  }

  get S() {
    const st = this.game.state;
    const S = (st.dig && typeof st.dig === 'object') ? st.dig : (st.dig = {});
    S.pend ||= []; S.seen ||= []; S.sites ||= {}; S.items ||= []; S.found ||= {}; S.ancient ||= [];
    S.uid ||= 1; S.vials ||= 0;
    return S;
  }
  has(id) { return (this.game.state.research || []).includes(id); }
  zoneOpen() { return !!this.game.zones?.isOpen?.(ZONE); }
  get v() { return this.game.villagers?.get?.(ID) || null; }

  // ------------------------------------------------------------------ lifecycle
  onNewGame() { this.reset(); }
  onLoad() {
    this.reset();
    this.sites.refresh();
    this.sites.sync(true);
    this.refreshCase();
  }
  reset() { this.busy = false; for (const m of this.sites.meshes.values()) m.obj.removeFromParent(); this.sites.meshes.clear(); }

  update(simDt, dt) {
    const game = this.game;
    if (game.titleMode || !game.started) return;
    // Survey the Bluff is done: lift the fog (at a quiet moment), like Flint's quarry
    if (this.has('r_dig_survey') && !this.zoneOpen()) {
      this.surveyT = (this.surveyT ?? 1) - dt;
      if (this.surveyT <= 0) {
        this.surveyT = 2.5;
        const Z = ZONE_BY_ID[ZONE];
        if (Z && this.quiet() && !game.zones?.busy) { this.S.arrivePending = true; game.zones.reveal(Z, { x: Z.cx, z: Z.cz + 4 }); }
      }
    }
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 3; this.sites.refresh(); this.sites.sync(); }
    this.sites.update(dt || 0);
    this.yardTick(dt || 0);
    // scenes waiting for a quiet moment
    const D = game.director;
    if (D && !D.active && !this.busy && this.zoneOpen()) {
      if (this.S.arrivePending && !this.S.arrived && this.v?.rig && D.quiet()) this.playArrival();
      else if (this.S.pend.length && D.quiet()) this.playPending();
    }
    this.bearTick(dt || 0);
    this.ancientFx(dt || 0);
  }
  quiet() {
    const g = this.game;
    return !g.cutscene?.active && !g.lab?.active && !g.tutorial?.active && !g.homes?.active && !g.cine?.active && !g.classroom?.active && !g.npcScenes?.busy && !g.ui?.panel && !g.director?.active && (g.state.phase === 'day' || g.state.phase === 'morning') && !labBenchOpen() && !this.digOpen;
  }

  // ------------------------------------------------------------------ research + mornings
  onResearch(r) {
    const game = this.game;
    if (r?.id === 'r_dig_maps') setTimeout(() => { this.sites.refresh(); this.sites.sync(); }, 1500);
    if (r?.id === 'r_dig_vial') game.notify?.('Primordial Vial researched! Brew one at Snapp\'s bench: 1 amber + 3 fossils.', 'excited', { dur: 4.5 });
    if (r?.id === 'r_dig_amber') game.notify?.('Amber Studies: amber turns up in digs now. Look for a golden glint!', 'excited', { dur: 4 });
  }
  morning() {
    const game = this.game, S = this.S;
    this.sites.refresh();
    this.sites.sync();
    // museum tickets
    if (this.has('r_dig_museum') && S.ticketDay !== game.state.day) {
      S.ticketDay = game.state.day;
      const c = this.ticketCoins(), n = this.displayed().length;
      if (c > 0) setTimeout(() => { game.earnMisc?.(c, 'tips'); game.notify?.(fmt(pick(SNAPP.tickets), { c, n }), 'info', { dur: 4.5 }); }, 7000);
    }
  }
  ticketCoins() { return this.displayed().reduce((a, it) => a + 4 + (FIND_BY_ID[it.id]?.r || 0) * 6 + (it.cond === 0 ? 3 : 0), 0); }
  announceSite(s) {
    const game = this.game;
    setTimeout(() => game.notify?.(fmt(pick(SNAPP.newSite), { s: s.name }), 'excited', { dur: 4.5 }), 2500);
  }

  // ------------------------------------------------------------------ the yard (Villagers.makeProps hook)
  props(v, put) {
    const B = BONEBED, g = this.game.grid;
    // the trees go where the yard is (the homestead only clears an oval round Snapp)
    const Bv = this.game.beavers;
    const homes = (this.game.villagers.homeTiles ||= new Set());
    for (let z = B.clear.z0; z <= B.clear.z1; z++) for (let x = B.clear.x0; x <= B.clear.x1; x++) {
      const i = z * g.w + x;
      if (!g.inb(x, z) || g.kind[i] === KIND.WATER) continue;
      Bv?.clearInstant?.(x, z);
      homes.add(i);
    }
    const at = (o, p, ry = 0, dy = 0) => { put(o, p.x - v.x, p.z - v.z, ry); o.position.y += dy; return o; };
    // the bluff stands on the lowest ground along its foot (its base reaches below)
    let low = 99;
    for (let x = B.bluff.x - 4.4; x <= B.bluff.x + 4.4; x += 0.5) low = Math.min(low, g.groundAt(x, B.bluff.z + 0.6));
    const bluff = makeBluff();
    put(bluff, B.bluff.x - v.x, B.bluff.z - v.z, 0);
    bluff.position.y = low - 0.12;
    const hut = at(makeLabHut(), B.hut, 0.12);
    at(makeFieldTent(), B.tent, -0.35);
    this.caseObj = at(makeDisplayCase(), B.case, 0.25);
    this.benchObj = at(makeSieveBench(), B.bench, -0.2);
    B.trench.forEach((T, k) => at(makeTrench(T.w, T.d, k), T, k ? 0.3 : -0.08));
    at(makeRibcage(), B.ribs, -0.35, -0.04);
    this.hut = hut;
    this.yard = { hut, bluff };
    if (v.rig) { v.rig.onEvent = (name) => this.onSnappEvent(v, name); v.rig.root.rotation.y = 0.75; } // a three-quarter view: the spiky shell shows
    this.refreshCase();
    return hut;
  }
  /** the glass case shows what is on display */
  refreshCase() {
    const C = this.caseObj;
    if (!C) return;
    for (const m of C.userData.minis || []) m.removeFromParent();
    C.userData.minis = [];
    const shown = this.displayed().slice(0, CASE_SLOTS);
    shown.forEach((it, k) => {
      const m = makeFindMini(it.id);
      m.position.copy(C.userData.slots[k]);
      m.rotation.y = (k % 3 - 1) * 0.25;
      m.scale.setScalar(0.85);
      C.add(m);
      C.userData.minis.push(m);
    });
  }
  onSnappEvent(v, name) {
    const game = this.game;
    if (Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) > 18 || game.overrideScene) return;
    if (name === 'tink') game.audio?.play?.('dig_tink', { volume: 0.25 });
    else if (name === 'chomp') game.audio?.play?.('dig_chomp', { volume: 0.35 });
    else if (name === 'brush') { game.audio?.play?.('dig_brush', { volume: 0.2 }); game.particles?.dust?.(v.x, v.y + 0.1, v.z + 0.5, 2); }
    else if (name === 'huff') game.particles?.puff?.(v.x, v.y + 1.1, v.z + 0.4, 3, 0.2);
    else if (name === 'step') game.particles?.dust?.(v.x, v.y + 0.05, v.z, 1);
  }
  yardTick(dt) {
    const v = this.v, game = this.game;
    if (!v?.rig || !this.zoneOpen()) return;
    // smoke from the hut's stove pipe
    if (this.hut && (this.smT = (this.smT ?? 0) - dt) <= 0) {
      this.smT = 0.9;
      const near = Math.hypot(this.hut.position.x - game.rig.target.x, this.hut.position.z - game.rig.target.z) < 22;
      if (near && !game.overrideScene) { _v.copy(this.hut.userData.smoke); this.hut.localToWorld(_v); game.particles?.puff?.(_v.x, _v.y, _v.z, 1, 0.22); }
    }
    // the amber in the bluff pulses
    const gl = this.yard?.bluff?.userData?.glow;
    if (gl) gl.material.color?.setScalar?.(0.85 + 0.15 * Math.sin(performance.now() / 600));
    // a grumble now and then
    this.mutterT -= dt;
    if (this.mutterT <= 0) {
      this.mutterT = 18 + Math.random() * 16;
      const near = Math.hypot(v.x - game.rig.target.x, v.z - game.rig.target.z) < 14;
      if (near && !game.overrideScene && !game.cutscene?.active && !game.director?.active && this.S.arrived) game.villagers.sayLine(v, pick(SNAPP.idle), { dur: 2.8 });
    }
  }

  // ------------------------------------------------------------------ Villagers hooks
  /** Zones.reveal -> Villagers.intro: his real hello is the arrival scene */
  async intro(v) {
    const st = this.game.villagers.vstate(v);
    st.met = true;
    this.S.arrivePending = true;
    v.rig?.play?.('brush', { loop: false, restart: true });
  }
  onTap(v) {
    if (this.busy || this.game.director?.active) return true;
    if (!this.S.arrived && this.zoneOpen()) { this.playArrival(); return true; }
    return false;
  }
  cardOffers(v, panel) {
    const crate = this.crate().length;
    const out = [];
    out.push({ icon: 'dig_survey', title: 'Lab bench', desc: crate ? `${crate} crusted find${crate > 1 ? 's' : ''} to clean and identify` : 'Clean, identify, sell, display', tag: crate ? 'NEW' : 'OPEN', onClick: panel(() => this.openBench('bench')) });
    out.push({ icon: 'dig_museum', title: 'Display case', desc: `${this.displayed().length}/${CASE_SLOTS} on display${this.has('r_dig_museum') ? ` · ${this.ticketCoins()} coins a day` : ''}`, tag: 'OPEN', onClick: panel(() => this.openBench('collection')) });
    if (this.has('r_dig_vial')) out.push({ icon: 'dig_vial', title: 'Primordial Vial', desc: `${this.S.vials} vial${this.S.vials === 1 ? '' : 's'} · 1 amber + 3 fossils`, tag: 'BREW', onClick: panel(() => this.openBench('vial')) });
    return out;
  }

  // ------------------------------------------------------------------ scenes
  actorV() { const v = this.v; if (v && !v.rig) this.game.villagers.ensure?.(v); return v; }
  playArrival() {
    const v = this.actorV(), D = this.game.director;
    if (!v?.rig || !D || this.busy) return;
    this.S.arrivePending = false;
    this.S.arrived = true;
    this.busy = true;
    const holdT = v.t; v.t = 1e9;
    D.play((c) => arrival(c, this, v), { id: 'snapp_arrive' }).catch((e) => console.warn('[dig] arrival', e)).finally(() => {
      this.busy = false; v.t = holdT;
      if (v.rig) v.rig.root.rotation.y = 0.75;
      if (!this.questActive('dg_grunt') && !this.questDone('dg_grunt')) this.game.quests?.start?.('dg_grunt');
      this.sites.refresh(); this.sites.sync();
      this.game.save?.();
    });
  }
  questActive(id) { return (this.game.quests?.S?.active || []).includes(id); }
  questDone(id) { return (this.game.quests?.S?.done || []).includes(id); }
  onQuestDone(q) {
    const sc = DIG_CHAIN[q?.id];
    if (!sc) return;
    const S = this.S;
    if (!S.seen.includes(sc) && !S.pend.includes(sc)) S.pend.push(sc);
    if (q.id === 'dg_living') { S.vials += 2; this.game.notify?.('Snapp left you two Primordial Vials. And a very old trowel.', 'excited', { dur: 4 }); }
  }
  playPending() {
    const S = this.S, D = this.game.director;
    const id = S.pend[0];
    const next = { snapp_amber: 'dg_amber', snapp_maps: 'dg_maps', snapp_vial: 'dg_vial', snapp_living: 'dg_living' }[id];
    const done = () => { S.pend = S.pend.filter((x) => x !== id); if (!S.seen.includes(id)) S.seen.push(id); if (next && !this.questActive(next) && !this.questDone(next)) this.game.quests?.start?.(next); this.game.save?.(); };
    if (id === 'snapp_living') {
      const f = this.fishList().find((x) => x.g?.morph === 'ancient');
      if (!f) { done(); return; }
      this.busy = true;
      D.play((c) => snappLiving(c, this, f), { id }).catch((e) => console.warn('[dig]', id, e)).finally(() => { this.busy = false; done(); });
      return;
    }
    const v = this.actorV(), fn = BEATS[id];
    if (!fn || !v?.rig) { done(); return; }
    this.busy = true;
    const holdT = v.t; v.t = 1e9;
    D.play((c) => fn(c, this, v), { id }).catch((e) => console.warn('[dig]', id, e)).finally(() => { this.busy = false; v.t = holdT; if (v.rig) v.rig.root.rotation.y = 0.75; done(); });
  }
  focusBluff() {
    const g = this.game;
    if (!this.zoneOpen()) { g.zones?.showHint?.(ZONE_BY_ID[ZONE]); return; }
    g.ui?.stopTracking?.();
    const s = this.sites.list.find((x) => x.find && !x.away) || this.sites.list.find((x) => x.find);
    const p = s || BONEBED.view;
    g.rig.lookAt(p.x, p.z + 0.6 - (g.zones?.hOff?.(p.x, p.z) || 0));
    g.rig.wuppGoal = 0.026;
  }

  // ------------------------------------------------------------------ taps + the dig
  tapAt(sx, sy) {
    const game = this.game;
    if (this.digOpen || labBenchOpen()) return true;
    const s = this.sites.pick(sx, sy);
    if (s) { this.openDig(s); return true; }
    // the prep bench / display case in the yard
    if (this.zoneOpen() && game.rig && game.renderer) {
      for (const [obj, tab, y] of [[this.benchObj, 'bench', 0.5], [this.caseObj, 'collection', 0.8]]) {
        if (!obj?.parent || Math.hypot(obj.position.x - game.rig.target.x, obj.position.z - game.rig.target.z) > 24) continue;
        obj.getWorldPosition(_v); _v.y += y;
        const q = game.rig.worldToScreen(_v, game.renderer);
        const R = Math.max(26, Math.min(70, 0.4 / (game.rig.wupp || 0.045)));
        if (q.visible !== false && (q.x - sx) ** 2 + (q.y - sy) ** 2 < R * R) { this.openBench(tab); return true; }
      }
    }
    return false;
  }
  openDig(s) {
    const game = this.game;
    if (!s.find) { game.notify?.(s.away ? 'Dug out. Snapp\'s map will show a new site soon.' : 'Dug out. Something new will wash out of the bluff in a day or two.', 'info', { dur: 3 }); game.audio?.play?.('click', { volume: 0.3 }); return; }
    if (game.state.phase === 'night') { game.notify?.('Too dark to dig. Snapp would never forgive a cracked bone.', 'no', { dur: 3 }); return; }
    if (game.director?.active || game.cutscene?.active) return;
    if (!this.S.arrived && !s.away) { this.playArrival(); return; }
    this.digOpen = true;
    const v = this.v;
    const near = v && Math.hypot(v.x - s.x, v.z - s.z) < 8;
    this.dig = openDigGame(game, {
      find: s.find, siteName: s.name || 'Dig site', has: (id) => this.has(id),
      tip: near ? pick(SNAPP.siteHints) : '',
      onDone: (res) => { this.digOpen = false; this.dig = null; if (res) this.dug(s, res); },
    });
  }
  dug(s, res) {
    const game = this.game, S = this.S;
    const F = FIND_BY_ID[res.find];
    const it = { uid: S.uid++, id: res.find, cond: res.cond, clean: false, shown: false, from: s.name || 'Dig site', day: game.state.day };
    S.items.push(it);
    this.sites.dug(s);
    game.emit?.('digFind', { id: F.id, kind: F.kind, r: F.r, cond: res.cond, away: !!s.away, site: s.id });
    game.particles?.dust?.(s.x, game.grid.groundAt(s.x, s.z) + 0.2, s.z, 6);
    game.particles?.sparkle?.(s.x, game.grid.groundAt(s.x, s.z) + 0.4, s.z, 8, F.kind === 'amber' ? 0xffc040 : 0xfff2c0);
    const C = condOf(res.cond);
    const v = this.v;
    if (v?.rig && Math.hypot(v.x - s.x, v.z - s.z) < 10) {
      setTimeout(() => game.villagers.sayLine(v, pick(SNAPP.dug[C.id] || SNAPP.dug.good), { dur: 3.4 }), 400);
      v.rig.play(res.cond === 0 ? 'happy' : res.cond >= 2 ? 'grumble' : 'loupe', { loop: false, restart: true, onDone: () => v.rig.play('idle', { loop: true }) });
    }
    game.save?.();
  }

  // ------------------------------------------------------------------ the bench (inventory)
  openBench(tab = 'bench') {
    if (!this.zoneOpen()) return;
    return openLabBench(this, { tab });
  }
  crate() { return this.S.items.filter((it) => !it.clean); }
  item(uid) { return this.S.items.find((it) => it.uid === uid) || null; }
  clean(uid) {
    const it = this.item(uid);
    if (!it || it.clean) return false;
    it.clean = true;
    const S = this.S;
    S.found[it.id] = (S.found[it.id] || 0) + 1;
    const F = FIND_BY_ID[it.id];
    if (F.kind === 'amber') S.cleanedAmber = (S.cleanedAmber || 0) + 1;
    this.game.emit?.('labClean', { id: it.id, kind: F.kind, r: F.r });
    this.game.save?.();
    return true;
  }
  sell(uid) {
    const it = this.item(uid);
    if (!it?.clean) return 0;
    const c = findValue(it.id, it.cond);
    this.S.items = this.S.items.filter((x) => x !== it);
    this.game.earnMisc?.(c, 'tips');
    this.game.audio?.play?.('coins', { volume: 0.45 });
    if (it.shown) this.refreshCase();
    this.game.save?.();
    return c;
  }
  displayed() { return this.S.items.filter((it) => it.clean && it.shown); }
  displayRoom() { return this.displayed().length < CASE_SLOTS; }
  kept(id) { return this.S.items.filter((it) => it.clean && !it.shown && (!id || it.id === id)); }
  display(uid) {
    const it = this.item(uid);
    if (!it?.clean || it.shown || !this.displayRoom()) return false;
    it.shown = true;
    this.refreshCase();
    this.game.emit?.('digDisplay', { id: it.id });
    this.game.audio?.play?.('place', { volume: 0.35 });
    this.game.save?.();
    return true;
  }
  undisplay(uid) { const it = this.item(uid); if (!it?.shown) return false; it.shown = false; this.refreshCase(); this.game.save?.(); return true; }
  vials() { return this.S.vials || 0; }
  vialPlan() {
    const kept = this.kept().sort((a, b) => findValue(a.id, a.cond) - findValue(b.id, b.cond));
    const amber = kept.find((it) => FIND_BY_ID[it.id].kind === 'amber') || null;
    const fossils = kept.filter((it) => FIND_BY_ID[it.id].kind === 'fossil').slice(0, VIAL_RECIPE.fossil);
    return { amber, fossils, ok: !!amber && fossils.length >= VIAL_RECIPE.fossil && this.has('r_dig_vial') };
  }
  brew() {
    const R = this.vialPlan();
    if (!R.ok) return false;
    const use = new Set([R.amber.uid, ...R.fossils.map((f) => f.uid)]);
    this.S.items = this.S.items.filter((it) => !use.has(it.uid));
    this.S.vials++;
    this.S.brewed = (this.S.brewed || 0) + 1;
    this.game.audio?.play?.('dig_brew', { volume: 0.5 });
    this.game.emit?.('vialBrewed', {});
    this.game.save?.();
    return true;
  }

  // ------------------------------------------------------------------ the vial (Fish Scope)
  canVial(f) { return !!f && !f.dead && f.adult && !f.tank && f.g?.morph !== 'ancient' && this.S.vials > 0; }
  /** Fish Scope insert: the button (or '') */
  scopeButton(f) {
    if (!this.has('r_dig_vial') && !this.S.vials) return '';
    const ok = this.canVial(f);
    const why = f?.g?.morph === 'ancient' ? 'Already prehistoric' : !f?.adult ? 'Only grown-up fish' : f?.tank ? 'Take it out of the tank first' : !this.S.vials ? 'Brew a vial at Snapp\'s bench' : `Feed the Primordial Vial (${this.S.vials} left)`;
    return `<button class="fsc-btn vial" data-a="vial" ${ok ? '' : 'disabled'} title="${why}">${this.game.ui?.icon?.('dig_vial', 2) || ''}<span>Vial${ok ? ' x' + this.S.vials : ''}</span></button>`;
  }
  feedVial(f) {
    const game = this.game, D = game.director;
    if (!this.canVial(f) || !D) return false;
    this.S.vials--;
    const sp = f.sp;
    const change = () => {
      if (f.dead) return;
      const g = f.g;
      g.ancient = { from: g.morph, day: game.state.day, arch: archetypeOf(sp.id) };
      g.morph = 'ancient';
      g.stars = Math.min(5, Math.max(g.stars || 1, 4));
      const st = game.state;
      const mk = `${sp.id}:ancient`;
      if (!st.morphsSeen.includes(mk)) st.morphsSeen.push(mk);
      const first = !this.S.ancient.includes(sp.id);
      if (first) this.S.ancient.push(sp.id);
      game.emit?.('fishAncient', { species: sp.id, first, fish: f });
      if (!this.S.firstAncient) this.S.firstAncient = game.state.day;
    };
    this.busy = true;
    D.play((c) => vialScene(c, this, f, change), { id: 'snapp_vialfx' }).catch((e) => { console.warn('[dig] vial', e); }).finally(() => {
      this.busy = false;
      if (f.g?.morph !== 'ancient') change();
      game.save?.();
    });
    return true;
  }
  fishList() { return (this.game.fish?.list || []).filter((f) => !f.dead); }
  /** a land tile on the bank near (x, z), for Snapp's pond visit */
  bankNear(x, z) {
    const g = this.game.grid;
    let best = null, bd = 1e9;
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
      const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
      if (!g.inb(tx, tz) || g.isWater(tx, tz) || g.occ[tz * g.w + tx] !== -1 || g.deco[tz * g.w + tx] >= 0) continue;
      const d = Math.hypot(dx, dz) + (dz < 0 ? 2 : 0); // prefer the camera side
      if (d < bd) { bd = d; best = { x: tx + 0.5, z: tz + 0.5 }; }
    }
    return best;
  }
  /** Ancient Bloodlines: prehistoric parents pass the form on more often */
  onMated(d) {
    const a = d?.a, b = d?.b;
    if (!a || !b) return;
    const anc = (a.g?.morph === 'ancient') + (b.g?.morph === 'ancient');
    if (!anc || !this.has('r_dig_blood')) return;
    const egg = this.game.fish?.eggs?.[this.game.fish.eggs.length - 1];
    if (!egg?.genes) return;
    for (const g of egg.genes) if (g.morph !== 'ancient' && Math.random() < 0.3 * anc) { g.morph = 'ancient'; g.stars = Math.max(g.stars || 1, 4); }
  }
  ancientFx(dt) {
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.7;
    const game = this.game, t = game.rig?.target;
    if (!t || game.overrideScene) return;
    for (const f of this.fishList()) {
      if (f.g?.morph !== 'ancient' || Math.abs(f.x - t.x) > 20 || Math.abs(f.z - t.z) > 20 || Math.random() > 0.35) continue;
      game.particles?.bubbles?.(f.x, (f.y ?? -0.3) + 0.1, f.z, 1);
      if (Math.random() < 0.4) game.particles?.sparkle?.(f.x, (f.y ?? -0.3) + 0.25, f.z, 1, 0xffc860);
    }
  }

  // ------------------------------------------------------------------ bears and prehistoric fish
  wrapBears() {
    const B = this.game.bears;
    if (!B || B.__digWrapped) return;
    B.__digWrapped = true;
    const catchFish = B.catchFish?.bind(B), finish = B.finishReview?.bind(B);
    if (catchFish) B.catchFish = (b, f) => {
      const anc = f?.g?.morph === 'ancient';
      catchFish(b, f);
      if (!anc) return;
      b.gotGolden = true; b.gotAncient = true;
      if (this.has('r_dig_blood')) b.coins += (this.game.fish?.coinValue?.(f) || 0) * 0.25 * (b.def?.pay || 1) * 7;
      try { B.say?.(b, pick(SNAPP.bears), 'emo_happy_face', null, 2.6); } catch { /* ignore */ }
      this.game.emit?.('bearAteAncient', { b, species: f.sp?.id });
    };
    if (finish) B.finishReview = (b) => {
      finish(b);
      if (b?.gotAncient && b.review && !b.angry && !b.review.skip) {
        b.review.stars = 5;
        b.review.text = SNAPP.bearReview + String(b.review.text || '').replace('A GOLDEN fish?! ', '');
      }
    };
  }
  bearTick(dt) {
    this.barkT -= dt;
    if (this.barkT > 0) return;
    this.barkT = 5 + Math.random() * 5;
    const game = this.game, B = game.bears;
    const anc = this.fishList().filter((f) => f.g?.morph === 'ancient');
    if (!anc.length || !B?.list?.length) return;
    for (const b of B.list) {
      if (!b.visible || b.angry || b.saidAncient || b.state === 'eat') continue;
      const f = anc.find((x) => Math.hypot(x.x - b.x, x.z - b.z) < 4.5);
      if (!f) continue;
      b.saidAncient = true;
      try { B.say?.(b, pick(SNAPP.bears), 'emo_happy_face', null, 2.4); } catch { /* ignore */ }
      return;
    }
  }

  // ------------------------------------------------------------------ debug helpers (console)
  /** 1: survey done + Snapp met · 2: + brushes, amber, maps, lamp · 3: + vial research · 4: everything */
  debugUnlock(level = 4) {
    const g = this.game, st = g.state;
    const add = (ids) => { for (const id of ids) if (!st.research.includes(id)) { st.research.push(id); g.emit('research', { id }); } };
    st.sections = [...new Set([...(st.sections || []), 'dig'])];
    if (!(st.zones || []).includes('tower')) st.zones.push('tower');
    add(['r_dig_survey']);
    if (!this.zoneOpen()) { st.zones.push(ZONE); g.villagers?.revealed?.(ZONE_BY_ID[ZONE]); g.zones?.rebuild?.(); }
    const v = this.v; if (v) g.villagers.vstate(v).met = true;
    this.S.arrived = true; this.S.arrivePending = false;
    if (level >= 2) add(['r_dig_brush', 'r_dig_amber', 'r_dig_maps', 'r_dig_lamp']);
    if (level >= 3) add(['r_dig_vial', 'r_dig_museum', 'r_dig_pick']);
    if (level >= 4) add(['r_dig_deep', 'r_dig_blood']);
    g.refreshMods?.();
    this.sites.refresh(); this.sites.sync(true);
    g.save?.();
    return this.debugSites();
  }
  /** n random cleaned finds in the drawer (+ amber) */
  debugFinds(n = 6, clean = true) {
    const S = this.S;
    const ids = FINDS.map((f) => f.id);
    for (let k = 0; k < n; k++) {
      const id = k === 0 ? 'amberbug' : ids[Math.floor(Math.random() * ids.length)];
      S.items.push({ uid: S.uid++, id, cond: Math.floor(Math.random() * 3), clean, shown: false, from: 'Debug Bluff', day: this.game.state.day });
      if (clean) S.found[id] = (S.found[id] || 0) + 1;
    }
    return S.items.length;
  }
  debugDig(id = null) {
    const s = this.sites.list.find((x) => x.find) || this.sites.list[0];
    if (!s) return 'no site (debugUnlock first)';
    if (id) s.find = id; else if (!s.find) s.find = 'ammonite';
    this.openDig(s);
    return s;
  }
  debugBench(tab = 'bench') { return this.openBench(tab); }
  debugVial(n = 1) { this.S.vials += n; return this.S.vials; }
  /** feed a vial to an adult fish (of a species) now; spawns one if needed */
  debugAncient(speciesId = null, { scene = true } = {}) {
    const g = this.game;
    let f = this.fishList().find((x) => x.adult && !x.tank && x.g?.morph !== 'ancient' && (!speciesId || x.sp.id === speciesId));
    if (!f && speciesId && g.fish?.spawn) { const o = this.fishList()[0] || { x: 24.5, z: 33.5 }; f = g.fish.spawn(speciesId, o.x, o.z, { adult: true }); }
    if (!f) return 'no adult fish' + (speciesId ? ' of ' + speciesId : '');
    if (!scene) { f.g.morph = 'ancient'; return f; }
    this.S.vials = Math.max(1, this.S.vials);
    this.feedVial(f);
    return f;
  }
  debugScene(id) {
    const v = this.actorV(), D = this.game.director;
    if (id === 'arrival') { this.S.arrived = false; return this.playArrival(); }
    if (id === 'snapp_living') { const f = this.fishList().find((x) => x.g?.morph === 'ancient') || this.fishList()[0]; return D.play((c) => snappLiving(c, this, f), { id }); }
    return D.play((c) => BEATS[id](c, this, v), { id });
  }
  debugSites() { return this.sites.list.map((s) => `${s.id} ${s.name} @${s.x.toFixed(1)},${s.z.toFixed(1)} ${s.find || '(dug)'}`); }
}

export { DIG_QUESTS, DIG_ZONE, ancientName };
