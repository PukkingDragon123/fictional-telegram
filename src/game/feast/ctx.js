// [v26 feast] FeastCtx: everything a feast event's setup / scene / resolve can
// use (see src/game/feastEvents/README.md). One per running event. Its clock is
// real time while the event is in a close-up (the world runs in slow motion
// around it) and game time otherwise (expired events play out in the world).
import * as THREE from 'three';
import { Puppet } from './puppet.js';
import { CrewBeaver, crewHome } from './crew.js';
import { makeProp } from '../../entities/feastProps.js';
import { clamp } from '../../core/rng.js';

export const isBear = (a) => !!(a && a.def && a.appetite !== undefined && a.wants !== undefined);
export const isStructure = (a) => !!(a && a.def && typeof a.type === 'string' && a.built !== undefined && a.hp !== undefined);

let uid = 1;

export class FeastCtx {
  constructor(feast, inst) {
    this.feast = feast;
    this.game = feast.game;
    this.inst = inst;
    this.def = inst.def;
    this.actor = inst.actor;
    this.bear = isBear(inst.actor) ? inst.actor : null;
    this.s = isStructure(inst.actor) ? inst.actor : null;
    this.data = {};
    this.expired = false;
    this.focused = false;
    this.aborted = false;
    this.choice = null;
    this.uid = uid++;
    this.puppets = new Map();
    this.props = [];
    this.crewList = [];
    this.timers = [];
    this.anims = [];
    this.time = 0;
    this.coins = 0;
    this.ratingDelta = 0;
  }

  get fx() { return this.game.particles; }

  // ------------------------------------------------------------ clock
  wait(sec) {
    if (this.aborted || !(sec > 0)) return Promise.resolve();
    return new Promise((resolve) => this.timers.push({ t: sec, resolve }));
  }

  // run fn(dt, t) every tick of the event clock until it returns false
  anim(fn) {
    if (this.aborted) return Promise.resolve();
    return new Promise((resolve) => this.anims.push({ fn, resolve, t: 0 }));
  }

  tick(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const w = this.timers[i];
      w.t -= dt;
      if (w.t <= 0 || this.aborted) { this.timers.splice(i, 1); w.resolve(); }
    }
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      let on = false;
      try { on = !this.aborted && a.fn(dt, a.t) !== false; } catch (e) { console.warn('[feast] anim', e); }
      if (!on) { this.anims.splice(i, 1); a.resolve(); }
    }
    for (const p of this.puppets.values()) p.step(dt);
    for (const c of this.crewList) c.tick(dt);
    for (const p of this.props) if (!p.dead) p.update?.(dt, this.time);
  }

  // ------------------------------------------------------------ where things are
  // world point above `who` (bear head, structure top, beaver head, prop, point) + dy
  at(who, dy = 0, out = new THREE.Vector3()) {
    const game = this.game;
    if (!who) return out.copy(game.rig.target);
    if (who === 'cam') return out.copy(game.rig.target);
    if (who.isObject3D) { who.getWorldPosition(out); out.y += dy; return out; }
    if (who.obj?.isObject3D) { who.obj.getWorldPosition(out); out.y += (who.top || 0) + dy; return out; }
    if (who instanceof CrewBeaver) return out.set(who.x, who.y + 0.95 + dy, who.z);
    if (isBear(who)) return out.set(who.x, who.y + 2.25 * who.def.scale + dy, who.z);
    if (isStructure(who)) {
      const [w, d] = who.def.size || [1, 1];
      return out.set(who.x + w / 2, game.structures.baseY(who) + (who.def.feastH ?? 1.3) + dy, who.z + d / 2);
    }
    if (who.rig && who.x != null) return out.set(who.x, (who.y || 0) + 0.9 + dy, who.z);
    const y = who.y ?? Math.max(-0.1, game.grid.surfaceY(Math.floor(who.x), Math.floor(who.z)));
    return out.set(who.x, y + dy, who.z);
  }

  // the middle of `who` (camera framing)
  mid(who, out = new THREE.Vector3()) {
    if (isBear(who)) return out.set(who.x, Math.max(-0.2, who.y) + 1.25 * who.def.scale, who.z);
    if (who instanceof CrewBeaver) return out.set(who.x, who.y + 0.4, who.z);
    if (isStructure(who)) return this.at(who, -((who.def.feastH ?? 1.3) * 0.6), out);
    if (who?.rig && who.x != null && !who.isObject3D) return out.set(who.x, (who.y || 0) + 0.4, who.z);
    return this.at(who, 0, out);
  }

  // ------------------------------------------------------------ camera (close-ups only)
  cam(who, opts = {}) { if (this.focused && !this.aborted) this.feast.camTo(this, who, opts); }
  track(who, opts = {}) { if (this.focused && !this.aborted) this.feast.camTo(this, who, { ...opts, track: true }); }
  shake(k = 0.4) { this.game.rig.shake = Math.max(this.game.rig.shake, k); }

  // ------------------------------------------------------------ bears
  hold(b) {
    if (!b || this.aborted) return null;
    let p = this.puppets.get(b);
    if (p && !p.done) return p;
    if (b.script && !(b.script instanceof Puppet && b.script.ctx === this)) {
      try { b.script.cancel?.(); } catch { /* theirs */ }
      if (b.script) return null;
    }
    if (b.eat) { b.eat.dispose?.(); b.eat = null; b.rig?.hold(null); b.heldFish = null; }
    if (b.eatLeft) { b.eatLeft.dispose?.(); b.eatLeft = null; }
    b.jump = null;
    p = new Puppet(this, b);
    b.feastEvent = this.inst;
    this.puppets.set(b, p);
    return p;
  }

  pose(b, name, { face = null, t01 = null, restart = false, hold = 0 } = {}) {
    const p = this.hold(b);
    if (!p) return;
    p.pose = name || 'idle';
    p.t01 = t01;
    if (restart && b.rig) b.rig.cur = null;
    if (face) this.face(b, face, hold);
  }

  face(b, expr, hold = 0) { b?.rig?.setFace?.(expr, { hold: hold || 999 }); }

  walk(b, x, z, { speed = 1.6, pose = 'walk' } = {}) {
    const p = this.hold(b);
    if (!p || this.aborted) return Promise.resolve();
    if (p.walk) p.walk.resolve?.();
    return new Promise((resolve) => { p.walk = { x, z, speed, pose, resolve }; });
  }

  turn(b, who) { const p = this.hold(b); if (p) { p.turnTo = who; p.heading = null; } }
  faceCam(b) {
    const p = this.hold(b);
    if (!p) return;
    const yaw = this.game.rig.yawGoal;
    p.turnTo = null;
    p.heading = Math.atan2(Math.cos(yaw), Math.sin(yaw));
  }
  heading(b, h) { const p = this.hold(b); if (p) { p.turnTo = null; p.heading = h; } }

  release(b, then = 'decide') {
    const p = this.puppets.get(b);
    if (!p) return;
    this.puppets.delete(b);
    p.release(then);
  }

  // ------------------------------------------------------------ talk + fx
  say(who, text, { mood = 'normal', dur = null, voice = null, wait = true, size = 's', emote = null, item = null } = {}) {
    if (this.aborted || !who) return Promise.resolve();
    const d = dur ?? Math.min(4.6, 1.5 + String(text).length * 0.05);
    const v = voice ?? (isBear(who) ? (who.def.boss ? 'ceo' : who.def.scale < 0.7 ? 'cub' : 'bear') : 'bear');
    const key = isBear(who) ? 'bear' + who.id : who instanceof CrewBeaver ? 'crew' + this.uid + '_' + this.crewList.indexOf(who) : 'feast' + this.uid;
    const anchor = { getWorldPos: (vv) => this.at(who, 0.3, vv) };
    // the bubble lives on screen time; scenes wait on the event clock
    const k = this.focused ? 1 : Math.max(1, this.game.cine?.fast ? 3 : 1);
    this.game.ui?.say?.(anchor, text, { voice: v === 'beaver' ? 'cub' : v, mood, dur: d / k + 0.3, key, size, emote, item });
    if (isBear(who) && this.game.ui?.says) this.game.ui.says.set(who.id, { t: d, h: null });
    return wait ? this.wait(d) : Promise.resolve();
  }

  word(text, who, opts = {}) { if (!this.aborted) this.feast.ui?.word(text, this.at(who, opts.dy ?? 0.2), opts); }
  float(text, who, color = '#fff') { const p = this.at(who, 0.3); this.game.ui?.floatTextAt(p.x, p.y, p.z, text, color); }
  sfx(name, opts = {}) { this.game.audio.play(name, { volume: 0.5, ...opts }); }

  // ------------------------------------------------------------ props
  prop(name, opts = {}) {
    if (this.aborted) return null;
    let h;
    try { h = makeProp(name, opts); } catch (e) { console.warn('[feast] prop', name, e); return null; }
    if (!h) return null;
    if (!opts.keep) this.props.push(h);
    if (opts.x != null) this.place(h, opts.x, opts.y ?? 0, opts.z);
    return h;
  }

  place(h, x, y, z) {
    const o = h?.obj || h;
    if (!o) return h;
    this.game.scene.add(o);
    o.position.set(x, y, z);
    return h;
  }

  attach(h, b, slot = 'hand') {
    const o = h?.obj || h;
    const r = b?.rig;
    if (!o || !r) return h;
    let parent = r.handAnchorR;
    if (slot === 'handL') parent = r.handAnchorL;
    else if (slot === 'hold') parent = r.holdAnchor;
    else if (slot === 'mouth') parent = r.mouthAnchor;
    else if (slot === 'top') parent = r.topAnchor;
    else if (slot === 'head') parent = headAnchor(r);
    o.position.set(0, 0, 0);
    parent.add(o);
    return h;
  }

  drop(h) {
    if (!h) return;
    const o = h.obj || h;
    o.parent?.remove(o);
    h.dead = true;
    try { h.dispose?.(); } catch { /* */ }
    const i = this.props.indexOf(h);
    if (i >= 0) this.props.splice(i, 1);
  }

  // ------------------------------------------------------------ helpers
  async crew({ from = null, near = null, hat } = {}) {
    if (this.aborted) return null;
    const n = near ? this.at(near, 0) : this.at(this.actor, 0);
    const home = from || crewHome(this.game, n.x, n.z);
    const c = new CrewBeaver(this, { x: home.x + (Math.random() - 0.5) * 0.6, z: home.z + (Math.random() - 0.5) * 0.6, hat });
    this.crewList.push(c);
    return c;
  }

  // ------------------------------------------------------------ economy
  canPay(n) { return this.game.state.coins >= n; }

  pay(n, who = null) {
    n = Math.round(n);
    if (n <= 0) return true;
    const game = this.game;
    if (game.state.coins < n) { game.audio.play('error', { volume: 0.4 }); return false; }
    game.spend(n, 'feast');
    this.coins -= n;
    if (who && !this.aborted) {
      const p = this.at(who, 0.2);
      this.feast.ui?.flyCoinsOut(p, n);
      game.ui?.floatTextAt(p.x, p.y + 0.2, p.z, `-${n}`, '#ffb0a0');
    }
    return true;
  }

  earn(n, who = null) {
    n = Math.round(n);
    if (n <= 0) return;
    const game = this.game;
    this.coins += n;
    if (isBear(who) && who.visible) { game.earn(n, who, { bills: 0, tips: n, snacks: 0 }); return; }
    game.earnMisc(n, 'tips');
    if (who) {
      const p = this.at(who, 0.2);
      game.particles.coins(p.x, p.y, p.z, Math.min(14, 3 + Math.floor(n / 4)));
      this.feast.ui?.flyCoinsIn(p, n);
      game.ui?.floatTextAt(p.x, p.y + 0.2, p.z, `+${n}`, '#ffd23a');
    }
  }

  review(b, stars, text, { weight = null } = {}) {
    if (!b) return null;
    const game = this.game;
    const before = game.state.rating;
    const r = { stars: clamp(Math.round(stars), 0, 5), text, name: b.name, dept: b.dept, type: b.typeId, weight: weight ?? b.def.reviewWeight ?? 1, day: game.state.day, feast: this.def.id };
    game.addReview(r, b);
    b.review = r;
    b.noReview = true;
    this.ratingDelta += game.state.rating - before;
    return r;
  }

  rating(delta) {
    const st = this.game.state;
    const before = st.rating;
    st.rating = clamp(st.rating + delta, 0, 5);
    st.bestRating = Math.max(st.bestRating, st.rating);
    this.ratingDelta += st.rating - before;
    const p = this.at(this.actor, 0.6);
    this.game.ui?.floatTextAt(p.x, p.y, p.z, `${delta > 0 ? '+' : ''}${delta.toFixed(1)} rating`, delta > 0 ? '#c8ff9a' : '#ff9a8a');
  }

  patience(b, k) { if (b) b.patience = clamp(b.patience + k * b.maxPatience, 0, b.maxPatience); }

  // ------------------------------------------------------------ end
  dispose() {
    for (const w of this.timers) w.resolve();
    this.timers.length = 0;
    for (const a of this.anims) a.resolve();
    this.anims.length = 0;
    for (const [b, p] of this.puppets) p.release('decide');
    this.puppets.clear();
    for (const h of this.props) { h.dead = true; const o = h.obj || h; o.parent?.remove(o); try { h.dispose?.(); } catch { /* */ } }
    this.props.length = 0;
    for (const c of this.crewList) if (!c.dead) this.feast.straggle(c);
    this.crewList.length = 0;
  }
}

// an anchor at the centre of a bear's head (wigs, party hats, blankets on the shoulders...)
export function headAnchor(rig) {
  if (rig._feastHead) return rig._feastHead;
  const i = rig.bones.findIndex((b) => b.name === 'head');
  rig._feastHead = rig._anchor(i, 0, 23.5, 0.3);
  return rig._feastHead;
}
