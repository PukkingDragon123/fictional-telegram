// [v26 feast] The 5 PM feast with a free camera + the feast event director.
//
//   game.feast.active          true from the opening shot (doors burst open) to the evening
//   game.feast.free            the camera has been handed to the player
//   game.feast.raise(id, a?)   start an event by hand (tests); returns the instance
//   game.feast.focus(inst?)    = click an event icon (newest pending one by default)
//   game.feast.choose(id)      = click a choice on the open card
//   game.feast.dayLog          [{ id, name, choice, coins, rating }] (reset every morning)
//
// Flow: Cinematic.startFeast -> begin() (feast-cam: normal UI hidden, minimal
// overlay) -> the opening shot -> handOver() (free camera, bounds = the area the
// bears use) -> the director raises events -> Cinematic.finish -> end().
// Events live in src/game/feastEvents/*.js (format: src/game/feastEvents/README.md).
import * as THREE from 'three';
import { FeastCtx, isBear, isStructure } from './ctx.js';
import { FeastUI } from '../../ui/FeastUI.js';
import { MEADOW, OFFICE } from '../../world/worldgen.js';
import { KIND } from '../../world/grid.js';
import { clamp, pick } from '../../core/rng.js';
import { BEAR_TYPES } from '../../data/bears.js';
import { shoreNear } from './kit.js';

const MODS = import.meta.glob('../feastEvents/*.js', { eager: true });
const CAM_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', 'e', 'z', 'x', '+', '=', '-', '_', 'pageup', 'pagedown', 'shift']);
const SLOW = 0.35; // world time scale during a close-up
let instId = 1;
const _up = new THREE.Vector3();

export class FeastSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.free = false;
    this.events = [];
    this.focusInst = null;
    this.highlights = [];
    this.dayLog = [];
    this.recent = [];
    this.today = {};
    this.nextT = 10;
    this.stragglers = [];
    this.camGoal = null;
    this.ui = null;
    this.defs = [];
    this.byId = {};
    for (const [path, m] of Object.entries(MODS)) {
      for (const d of m.EVENTS || []) {
        if (!d?.id) continue;
        if (this.byId[d.id]) { console.warn('[feast] duplicate event id', d.id, path); continue; }
        this.defs.push(d);
        this.byId[d.id] = d;
      }
    }
    game.on('day', () => this.onDay());
  }

  // ------------------------------------------------------------ save data
  get st() {
    const s = (this.game.state.feast ||= {});
    s.seen ||= {};
    s.stats ||= { handled: 0, expired: 0 };
    if (s.autoCam == null) s.autoCam = false;
    if (s.bonusBears == null) s.bonusBears = 0;
    return s;
  }

  onLoad() { void this.st; }
  onNewGame() { void this.st; }

  onDay() {
    this.dayLog = [];
    this.today = {};
    const st = this.st;
    const game = this.game;
    // an influencer's video went viral: extra bears today
    const n = st.bonusBears | 0;
    st.bonusBears = 0;
    const w = game.wave;
    if (n > 0 && w && !w.dayOff && w.bears?.length) {
      const types = Object.keys(BEAR_TYPES).filter((id) => { const d = BEAR_TYPES[id]; return d.weight > 0 && !d.boss && !d.bloodmoon && (d.fromDay ?? 1) <= game.state.day; });
      let t = Math.max(...w.bears.map((b) => b.delay || 0)) + 1.5;
      for (let i = 0; i < n; i++) {
        const type = pick(types.length ? types : ['office']);
        w.bears.push({ type, wants: [...(BEAR_TYPES[type].wants || [])], prefer: null, delay: t });
        t += 1 + Math.random() * 1.5;
      }
      setTimeout(() => game.notify?.(`That influencer's video went viral: ${n} extra bear${n > 1 ? 's' : ''} tonight!`, 'excited'), 4200);
    }
  }

  // ------------------------------------------------------------ feast lifecycle
  ensureUI() {
    if (!this.ui && document.getElementById('ui')) {
      try { this.ui = new FeastUI(this.game, this); } catch (e) { console.error('[feast] ui', e); }
    }
    return this.ui;
  }

  // Cinematic.startFeast: doors burst open, normal UI goes away
  begin() {
    const game = this.game;
    this.active = true;
    this.free = false;
    this.events.length = 0;
    this.highlights.length = 0;
    this.focusInst = null;
    this.deferComplete = false;
    this.following = null;
    this.today = this.today || {};
    this.nextT = 9 + Math.random() * 3;
    document.body.classList.add('feast-cam', 'feast-intro');
    this.ensureUI()?.show(true);
    this.prevBounds = { ...game.rig.bounds };
    this.bounds = this.computeBounds();
    game.emit('feastStart', {});
  }

  // the opening shot is over: the camera is the player's
  handOver() {
    if (!this.active || this.free) return;
    const game = this.game;
    this.free = true;
    document.body.classList.remove('feast-intro');
    game.rig.setBounds(this.bounds);
    this.ui?.onHandOver();
    if (!this.st.tipShown) { this.st.tipShown = 1; this.ui?.hint('Free camera! Drag to look around, pinch or scroll to zoom. Tap the pop-up icons to deal with trouble.', 6); }
  }

  // Cinematic.finish (the evening)
  end() {
    if (!this.active) return;
    const game = this.game;
    for (const inst of [...this.events]) this.abort(inst);
    this.events.length = 0;
    this.focusInst = null;
    for (const h of this.highlights) this.ui?.removeIcon(h);
    this.highlights.length = 0;
    this.active = false;
    this.free = false;
    this.following = null;
    this.camGoal = null;
    if (game.rig.follow && game.rig.follow.def) game.rig.follow = null;
    if (this.prevBounds) game.rig.setBounds(this.prevBounds);
    document.body.classList.remove('feast-cam', 'feast-intro', 'feast-focus');
    this.ui?.show(false);
    const n = this.dayLog.length;
    if (n) {
      const coins = this.dayLog.reduce((a, e) => a + (e.coins || 0), 0);
      game.emit('feastEnd', { log: this.dayLog });
      if (n >= 2) setTimeout(() => game.notify?.(`Feast incidents: ${n}. ${coins >= 0 ? 'Net +' : 'Net '}${coins} coins. What a night!`, coins >= 0 ? 'happy' : 'info'), 1500);
    } else game.emit('feastEnd', { log: this.dayLog });
  }

  // Game.onWaveComplete: keep the feast going while an event is in a close-up
  holdEvening() {
    if (this.focusInst) { this.deferComplete = true; return true; }
    return false;
  }

  // the area the bears use: the office trail down to every pond + the builds
  computeBounds() {
    const game = this.game, g = game.grid;
    let x0 = MEADOW.x0, x1 = MEADOW.x1, z0 = Math.min(MEADOW.z0, OFFICE.z - 1), z1 = MEADOW.z1;
    for (const p of game.world.trail || []) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    for (let z = 0; z < g.h; z++)
      for (let x = 0; x < g.w; x++) {
        const i = z * g.w + x;
        if (!g.meadow[i] || g.kind[i] !== KIND.WATER) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
    for (const s of game.structures.list) { if (!s.built) continue; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x + 1); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z + 1); }
    const h = game.rig.hardBounds || { minX: 0, maxX: g.w, minZ: 0, maxZ: g.h };
    return { minX: clamp(x0 - 3, h.minX, h.maxX), maxX: clamp(x1 + 3, h.minX, h.maxX), minZ: clamp(z0 - 2, h.minZ, h.maxZ), maxZ: clamp(z1 + 3, h.minZ, h.maxZ) };
  }

  // ------------------------------------------------------------ who's around
  customers() {
    return this.game.bears.list.filter((b) => b.visible && !b.removed && !b.hostile && !b.blood && !b.def.boss && !b.bossFight
      && b.state !== 'queued' && b.state !== 'commute' && b.state !== 'commuteUp' && b.goal?.kind !== 'leave' && b.state !== 'walkDirect');
  }

  isBusy(a) {
    if (!a) return false;
    for (const e of this.events) if (e.actor === a || e.ctx?.puppets.has(a)) return true;
    return false;
  }

  // a customer that is free to act in an event
  pickBear(filter = null, { land = null } = {}) {
    const g = this.game.grid;
    const wet = (b) => g.isWater(Math.floor(b.x), Math.floor(b.z));
    const ok = this.customers().filter((b) => !b.script && !b.feastEvent && !b.angry && !b.jump && !b.eat && !b.lunch
      && !['eat', 'yummy', 'toss', 'pay', 'smash', 'stomp', 'snack', 'feast'].includes(b.state) && !this.isBusy(b)
      && (!filter || filter(b)));
    if (land == null) return ok.length ? pick(ok) : null;
    const dry = ok.filter((b) => land === !wet(b));
    if (dry.length || land === false) return dry.length ? pick(dry) : null;
    // nobody on land: a swimmer wades to the nearest shore first (raise() walks it there before setup)
    for (const b of ok.sort(() => Math.random() - 0.5)) {
      const s = shoreNear(this.game, b.x, b.z, 4);
      if (s) { b._feastShore = s; return b; }
    }
    return null;
  }

  pickBears(n, filter = null, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const b = this.pickBear((x) => !out.includes(x) && (!filter || filter(x, out)), opts);
      if (!b) return null;
      out.push(b);
    }
    return out;
  }

  nearBears(x, z, r = 4, filter = null) {
    return this.customers().filter((b) => Math.hypot(b.x - x, b.z - z) <= r && (!filter || filter(b)));
  }

  builtOf(types) {
    const fn = typeof types === 'function' ? types : (s) => (Array.isArray(types) ? types : [types]).includes(s.type);
    return this.game.structures.list.filter((s) => s.built && !s.removed && fn(s));
  }

  isBossDay() { return !!this.game.bearEvents?.boss?.isBossDay?.(this.game.state.day); }
  isBloodMoon() { return !!this.game.bearEvents?.moon?.siege; }

  // ------------------------------------------------------------ director
  gap() {
    const day = this.game.state.day;
    const A = this.customers().length;
    let g = 25 - Math.min(1, Math.max(0, day - 2) / 14) * 10;
    g *= clamp(9 / Math.max(3, A), 0.65, 1.4);
    g *= 0.75 + Math.random() * 0.5;
    if (this.isBossDay()) g *= 1.7;
    if (this.isBloodMoon()) g *= 2.5;
    return clamp(g, 11, 45);
  }

  maxOpen() {
    if (this.isBloodMoon() || this.isBossDay()) return 1;
    const A = this.customers().length;
    return Math.max(1, Math.min(this.game.state.day < 4 ? 2 : 3, Math.ceil(A / 3)));
  }

  candidates() {
    const game = this.game, day = game.state.day;
    const boss = this.isBossDay(), blood = this.isBloodMoon();
    return this.defs.filter((d) => {
      if ((d.minDay ?? 2) > day) return false;
      if ((this.today[d.id] || 0) >= (d.maxPerDay ?? 1)) return false;
      if (this.recent.slice(-2).includes(d.id)) return false;
      if (this.events.some((e) => e.def === d)) return false;
      if (blood && d.kind !== 'facility' && d.kind !== 'beaver') return false;
      if (boss && d.boss === false) return false;
      try { return !d.when || !!d.when(game, this); } catch (e) { console.warn('[feast] when', d.id, e); return false; }
    });
  }

  tryRaise() {
    const open = this.events.length;
    if (open >= this.maxOpen()) return false;
    if (this.customers().length < 1 && !this.isBloodMoon()) return false;
    const list = this.candidates();
    for (let tries = 0; tries < 6 && list.length; tries++) {
      let tot = 0;
      const w = list.map((d) => { const x = (d.weight ?? 5) * (this.st.seen[d.id] ? 1 : 1.8); tot += x; return x; });
      let r = Math.random() * tot, i = 0;
      for (; i < list.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
      const d = list[i];
      if (this.raise(d.id)) return true;
      list.splice(i, 1);
    }
    return false;
  }

  // start an event (tests: __game.feast.raise('karen'))
  raise(id, actor = null) {
    const game = this.game;
    const def = this.byId[id];
    if (!def) { console.warn('[feast] unknown event', id); return null; }
    if (game.state.phase !== 'rush') { console.warn('[feast] raise: not during the feast'); return null; }
    let a = actor;
    for (const b of game.bears.list) b._feastShore = null;
    try { a = a || def.pick?.(game, this) || null; } catch (e) { console.warn('[feast] pick', id, e); a = null; }
    if (!a) return null;
    const inst = { uid: instId++, id, def, actor: a, state: 'pending', t: 0, ttl: def.ttl ?? 24, kind: def.kind || 'bear' };
    inst.ctx = new FeastCtx(this, inst);
    if (isBear(a)) a.feastEvent = inst;
    this.events.push(inst);
    this.today[id] = (this.today[id] || 0) + 1;
    this.recent.push(id);
    if (this.recent.length > 6) this.recent.shift();
    this.st.seen[id] = (this.st.seen[id] || 0) + 1;
    const doSetup = () => { inst.ready = true; if (inst.state === 'done') return; try { def.setup?.(inst.ctx); } catch (e) { console.error('[feast] setup', id, e); } };
    const shore = isBear(a) ? a._feastShore : null;
    if (shore) {
      // a swimmer wades out first
      a._feastShore = null;
      inst.ctx.walk(a, shore.x, shore.z, { speed: 2 }).then(doSetup);
    } else doSetup();
    this.ensureUI()?.addIcon(inst);
    game.audio.play('feast_pop', { volume: 0.55 });
    game.emit('feastEvent', { id, inst });
    return inst;
  }

  // ------------------------------------------------------------ the close-up
  focus(inst = null) {
    inst = inst || [...this.events].reverse().find((e) => e.state === 'pending' && e.ready) || null;
    if (!inst || inst.state !== 'pending' || !inst.ready || this.focusInst || !this.free) return false;
    const game = this.game, rig = game.rig;
    this.focusInst = inst;
    inst.state = 'focus';
    this.following = null;
    rig.follow = null;
    this.preFocus = { wupp: rig.wuppGoal };
    rig.freeBounds = true;
    game.inputLocked = true;
    game.timeScale = SLOW;
    if (game.cine) { game.cine.fast = false; game.cine.shot = { kind: 'close', bear: this.cutTarget(inst.actor), t: 0 }; }
    this.ui?.setFast(false);
    document.body.classList.add('feast-focus');
    this.ui?.burstIcon(inst);
    game.audio.play('feast_whoosh', { volume: 0.5 });
    inst.ctx.focused = true;
    this.runFocus(inst);
    return true;
  }

  // Game.render cuts foliage around the close-up's subject
  cutTarget(a) {
    if (isBear(a)) return a;
    const p = new THREE.Vector3();
    const c = this.focusInst?.ctx || this.events[0]?.ctx;
    if (c) c.at(a, 0, p);
    return { x: p.x, z: p.z, visible: true, def: { scale: 1 } };
  }

  async runFocus(inst) {
    const ctx = inst.ctx, def = inst.def;
    try {
      ctx.cam(inst.actor, { zoom: def.zoom ?? 0.015 });
      await ctx.wait(0.5);
      if (def.scene) await def.scene(ctx);
      if (!ctx.aborted) {
        let choices = [];
        try { choices = def.choices?.(ctx) || []; } catch (e) { console.error('[feast] choices', def.id, e); }
        if (choices.length) {
          const pickId = await this.ui.showCard(inst, choices);
          ctx.choice = pickId;
          game_audio(this.game, 'feast_click');
          inst.state = 'resolving';
          if (!ctx.aborted) await def.resolve?.(ctx, pickId);
        }
      }
    } catch (e) { console.error('[feast] event', def.id, e); }
    this.finishInst(inst, ctx.choice || 'none');
    this.unfocus(inst);
  }

  unfocus(inst) {
    const game = this.game, rig = game.rig;
    if (this.focusInst !== inst) return;
    this.focusInst = null;
    this.camGoal = null;
    game.timeScale = 1;
    document.body.classList.remove('feast-focus');
    if (game.cine) game.cine.shot = { kind: 'free', t: 0 };
    if (this.active) {
      game.inputLocked = !this.free;
      rig.freeBounds = !this.free;
      rig.goal.y = 0;
      if (this.preFocus) rig.wuppGoal = Math.max(rig.wuppGoal, Math.min(0.06, this.preFocus.wupp));
      rig.clampGoal();
    }
    if (this.deferComplete) { this.deferComplete = false; if (game.state.phase === 'rush') game.onWaveComplete(); }
  }

  choose(id) { return this.ui?.pickChoice(id) || false; }

  expire(inst) {
    if (inst.state !== 'pending') return;
    inst.state = 'resolving';
    const ctx = inst.ctx;
    ctx.expired = true;
    this.ui?.fizzleIcon(inst);
    this.game.audio.play('feast_expire', { volume: 0.4 });
    const def = inst.def;
    let ch = def.expire;
    if (!ch) { try { const c = def.choices?.(ctx) || []; ch = c[c.length - 1]?.id; } catch { ch = null; } }
    ctx.choice = ch || 'expired';
    (async () => {
      try { if (ch) await def.resolve?.(ctx, ch); } catch (e) { console.error('[feast] expire', def.id, e); }
      this.finishInst(inst, 'expired');
    })();
  }

  // quietly drop an event (its actor left, the feast ended...)
  abort(inst) {
    const ctx = inst.ctx;
    ctx.aborted = true;
    if (this.focusInst === inst) { this.ui?.closeCard(); this.unfocus(inst); }
    this.finishInst(inst, inst.state === 'pending' ? 'missed' : ctx.choice || 'missed', true);
  }

  finishInst(inst, choice, quiet = false) {
    if (inst.state === 'done') return;
    const ctx = inst.ctx, def = inst.def;
    const wasPending = inst.state === 'pending';
    inst.state = 'done';
    try { def.cleanup?.(ctx); } catch (e) { console.warn('[feast] cleanup', def.id, e); }
    ctx.dispose();
    if (isBear(inst.actor) && inst.actor.feastEvent === inst) inst.actor.feastEvent = null;
    const i = this.events.indexOf(inst);
    if (i >= 0) this.events.splice(i, 1);
    this.ui?.removeIcon(inst);
    if (quiet && wasPending) return;
    const entry = { id: def.id, name: def.name, choice, coins: Math.round(ctx.coins), rating: Math.round(ctx.ratingDelta * 100) / 100, icon: def.icon };
    this.dayLog.push(entry);
    const s = this.st.stats;
    if (choice === 'expired') s.expired++; else s.handled++;
    this.game.emit('feastResolved', entry);
  }

  // crew beavers still running home after their event ended
  straggle(c) {
    this.stragglers.push(c);
    c.target = null;
    c.leave();
  }

  // ------------------------------------------------------------ highlights (not events)
  // something worth seeing (boss intro, rampage): a small pop-up icon; tapping it follows the bear
  highlight(b, { kind = 'rampage', ttl = 7 } = {}) {
    if (!this.free || !b?.visible) return;
    if (this.highlights.some((h) => h.actor === b)) return;
    if (this.highlights.length >= 3) { const old = this.highlights.shift(); this.ui?.removeIcon(old); }
    const h = { uid: instId++, highlight: true, kind, actor: b, t: 0, ttl, state: 'pending', def: { icon: kind === 'boss' ? 'fe_boss' : kind === 'golden' ? 'fe_golden' : 'fe_rampage', name: '' } };
    this.highlights.push(h);
    this.ensureUI()?.addIcon(h);
    this.game.audio.play('feast_pop', { volume: 0.3, pitch: 1.3 });
  }

  peek(h) {
    const b = h.actor;
    const i = this.highlights.indexOf(h);
    if (i >= 0) this.highlights.splice(i, 1);
    this.ui?.burstIcon(h);
    this.ui?.removeIcon(h);
    if (!b?.visible) return;
    this.follow(b, 0.022);
  }

  follow(b, zoom = null) {
    const rig = this.game.rig;
    this.following = b;
    rig.follow = b;
    if (zoom) rig.wuppGoal = Math.min(rig.wuppGoal, zoom);
    this.game.audio.play('feast_whoosh', { volume: 0.3, pitch: 1.3 });
    this.ui?.setFollow(b);
  }

  unfollow() {
    if (!this.following) return;
    if (this.game.rig.follow === this.following) this.game.rig.follow = null;
    this.following = null;
    this.ui?.setFollow(null);
  }

  // ------------------------------------------------------------ camera (close-ups)
  camTo(ctx, who, { zoom = 0.017, dy = 0, dx = 0, dz = 0, track = false } = {}) {
    this.camGoal = { ctx, who, zoom, dy, dx, dz, track, set: false };
  }

  updateCam() {
    const c = this.camGoal;
    if (!c || !this.focusInst) return;
    const rig = this.game.rig;
    const card = this.ui?.card;
    if (!c.set || c.track || !!card !== !!c.shifted) {
      const p = c.ctx.mid(c.who);
      rig.goal.set(p.x + c.dx, p.y + c.dy, p.z + c.dz);
      c.set = true;
      c.shifted = !!card;
      if (card) {
        // the choice card covers the bottom of the screen: frame the subject higher up
        card.h ||= card.el.getBoundingClientRect().height || 280;
        const R = this.game.renderer;
        const k = (card.h * 0.55 + 10) * c.zoom * (R.dpr || 1) / (R.pixelScale || 1);
        _up.setFromMatrixColumn(rig.camera.matrixWorld, 1);
        rig.goal.addScaledVector(_up, -k);
      }
    }
    rig.wuppGoal = c.zoom;
    const cs = this.game.cine?.shot;
    if (cs && cs.kind === 'close' && isBear(c.who)) cs.bear = c.who;
  }

  // ------------------------------------------------------------ input (Input.js routes here during the feast)
  onTap(sx, sy) {
    if (!this.free || this.focusInst) return;
    const b = this.game.ui?.pickBear?.(sx, sy);
    if (b && b !== this.following) { this.follow(b, 0.026); return; }
    this.unfollow();
  }

  // during the opening shot / a close-up a tap skips ahead
  onLockedTap() {
    if (this.active && !this.free) { this.game.cine?.skipIntro?.(); return true; }
    return false;
  }

  // true = handled (camera keys are left to Input)
  onKey(k, e) {
    const locked = !this.free || !!this.focusInst;
    if (CAM_KEYS.has(k) && !locked) return false;
    if (!this.free) { if (k === ' ' || k === 'enter' || k === 'escape') { e?.preventDefault?.(); this.game.cine?.skipIntro?.(); } return true; }
    if (this.ui?.cardOpen()) {
      if (/^[1-3]$/.test(k)) this.ui.pickIndex(+k - 1);
      return true;
    }
    if (this.focusInst) { if (k === ' ' || k === 'enter') { e?.preventDefault?.(); this.game.ui?.advanceBubble?.(); } return true; }
    if (k === 'f') this.ui?.setFast(!this.game.cine?.fast);
    else if (k === 'c') this.ui?.setAutoCam(!this.st.autoCam);
    else if (k === 'escape') this.unfollow();
    else if (k === ' ' || k === 'enter' || k === 'tab') {
      e?.preventDefault?.();
      const inst = this.events.find((x) => x.state === 'pending');
      if (inst) this.focus(inst);
    }
    return true;
  }

  // screen point coins fly to / from (UI.flyCoins)
  coinTarget() { return this.active ? this.ui?.coinTarget() || null : null; }

  // Reynard's corner notes become a little ticker line (UI.notify)
  onNotify(text, mood) { if (this.active) { this.ui?.ticker(text, mood); return true; } return false; }

  // ------------------------------------------------------------ frame hooks
  update(simDt, dt) {
    const game = this.game;
    for (let i = this.stragglers.length - 1; i >= 0; i--) { const c = this.stragglers[i]; c.tick(dt); if (c.dead) this.stragglers.splice(i, 1); }
    if (!this.active) return;
    if (game.state.phase !== 'rush') return;
    // event clocks: the close-up in real time, everything else in game time
    for (const inst of [...this.events]) {
      const ctx = inst.ctx;
      ctx.tick(ctx.focused ? dt : simDt);
      if (inst.state === 'pending') {
        inst.t += simDt;
        if (!this.actorOk(inst.actor)) { this.abort(inst); continue; }
        if (inst.t >= inst.ttl) this.expire(inst);
      }
    }
    for (let i = this.highlights.length - 1; i >= 0; i--) {
      const h = this.highlights[i];
      h.t += dt;
      if (h.t > h.ttl || !h.actor.visible) { this.ui?.removeIcon(h); this.highlights.splice(i, 1); }
    }
    if (this.following && (!this.following.visible || game.rig.follow !== this.following)) { this.following = null; this.ui?.setFollow(null); }
    this.updateCam();
    if (this.free && !this.focusInst) {
      this.nextT -= simDt;
      if (this.nextT <= 0) {
        const ok = this.tryRaise();
        this.nextT = ok ? this.gap() : 3 + Math.random() * 2;
      }
    }
    this.ui?.update(dt);
  }

  actorOk(a) {
    if (isBear(a)) return a.visible && !a.removed && (a.script || a.goal?.kind !== 'leave');
    if (isStructure(a)) return !a.removed && a.built;
    return true;
  }

  render(dt) { if (this.active) this.ui?.render(dt); }
}

function game_audio(game, name) { game.audio.play(name, { volume: 0.5 }); }
