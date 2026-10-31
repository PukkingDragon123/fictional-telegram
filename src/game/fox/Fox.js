// [v30 reynard] Reynard in the world: the fox avatar by the pond. He path-walks
// (walks short trips, runs long ones, eases in and out, banks into turns), lives
// a daily routine (src/game/fox/foxRoutine.js) whenever nobody else is driving
// him, fetches parcels, reacts to the game, goes to bed.
//
// Control contract (others code against these, lazily: game.fox?.control?.()):
//   const h = game.fox.control(owner, { pose })  take him off his routine; h.release() gives him back
//   await game.fox.walkTo(x, z, { run, jog, cover, speed })  path-walks there (true = arrived, false = cut short)
//   game.fox.face(x, z, { instant })            turn to look at a point
//   await game.fox.play(anim, { loop, fade, speed, onDone })   FoxRig.play (resolves when a one-shot ends)
//   game.fox.stop()                             stop walking now
//   game.fox.say(text, opts)                    a speech bubble over his head
//   game.fox.controlled / .owner / .routine.now (what he's up to)
// Old calls keep working: react, carryEggs, goToBed, wakeUp, goToward, handPos, and
// setting fox.target = { x, z } directly (it is path-walked too).
import * as THREE from 'three';
import { FoxRig } from '../../entities/foxRig.js';
import { HUT } from '../../world/worldgen.js';
import { angleDiff, damp } from '../../core/rng.js';
import { FoxPath } from './foxPath.js';
import { FoxRoutine } from './foxRoutine.js';

export const GAIT = { walk: 1.7, jog: 2.9, run: 4.4, cover: 4.0 };
const GAIT_ANIM = { walk: 'walk', jog: 'jog', run: 'run', cover: 'run_cover' };
const MOOD_ANIM = { throw: 'throw', cheer: 'cheer', panic: 'panic', greedy: 'greedy' };
const FIDGETS = ['look_around', 'scratch_ear', 'pocket_watch', 'adjust_hat', 'idle_scheme', 'polish_monocle', 'stretch', 'laugh_evil', 'sneeze', 'think', 'count_coins', 'look_around', 'scratch_ear'];
const PORCH = { x0: HUT.x + 1.0, x1: HUT.x + 2.0, z0: HUT.z + 2.05, z1: HUT.z + 2.95 };

export class Fox {
  constructor(game) {
    this.game = game;
    this.rig = new FoxRig({ shadows: true });
    this.rig.root.scale.setScalar(0.85);
    this.rig.root.rotation.order = 'YXZ';
    this.anim = null;
    this.fidgetT = 8;
    game.scene.add(this.rig.root);
    this.home = { x: HUT.x + 1.5, z: HUT.z + 3.55 };
    this.door = { x: HUT.x + 1.5, z: HUT.z + 2.4 };
    this.x = this.home.x; this.z = this.home.z; this.y = 0.12;
    this.heading = Math.PI / 2;
    this.target = null;
    this.mood = 'idle'; // idle | throw | cheer | panic | greedy
    this.moodT = 0;
    this.time = 0;
    this.phase = 0;
    // movement
    this.speed = 0;
    this._pts = new Float32Array(96);
    this._np = 0; this._wp = 0;
    this._tgtRef = null; // the target object the current path was planned for
    this._gait = 'walk'; this._gaitReq = null; this._spReq = 0;
    this._rest = 0; // path length left after the current waypoint
    this._walkRes = null;
    this._rTarget = null; // a target the routine set (anything else = someone else wants him)
    this._turnV = 0; this._bank = 0;
    this._faceH = null;
    // control
    this._ctl = [];
    this._forced = null; this._forcedRes = null; this._forcedLoop = false;
    this.routine = new FoxRoutine(this);
  }

  get pather() { return (this._path ||= new FoxPath(this.game)); }

  // ================================================================ control contract
  get controlled() { return this._ctl.length > 0; }
  get owner() { return this._ctl.length ? this._ctl[this._ctl.length - 1].owner : null; }

  control(owner = 'someone', { pose = null } = {}) {
    const h = { owner, released: false, release: () => this._release(h) };
    this._ctl.push(h);
    this.routine.interrupt('control');
    if (this.target && this.target === this._rTarget) this.stop();
    this._rTarget = null;
    this._faceH = null;
    if (pose) this.play(pose, { loop: true });
    return h;
  }

  _release(h) {
    if (h.released) return;
    h.released = true;
    const i = this._ctl.indexOf(h);
    if (i >= 0) this._ctl.splice(i, 1);
    if (!this._ctl.length) {
      this._clearForced();
      this._faceH = null;
      this.routine.resume(1.2);
    }
  }

  walkTo(x, z, { run, jog, cover, speed } = {}) {
    this._endWalk(false);
    this._clearForced();
    const gait = cover ? 'cover' : run === true ? 'run' : jog ? 'jog' : run === false ? 'walk' : null;
    const t = { x, z };
    this.target = t;
    this._plan(t, gait, speed || 0);
    if (!this._ctl.length) this.routine.interrupt('walkTo');
    return new Promise((res) => { this._walkRes = res; if (!this.target) this._endWalk(true); });
  }

  face(x, z, { instant = false } = {}) {
    this._faceH = Math.atan2(z - this.z, x - this.x);
    if (instant) this.heading = this._faceH;
    return this;
  }

  play(anim, opts = {}) {
    const r = this.rig;
    if (!r.anims.includes(anim)) { console.warn('Fox.play: unknown animation', anim); return Promise.resolve(false); }
    this._clearForced();
    return new Promise((res) => {
      this._forced = anim;
      this._forcedRes = res;
      this.anim = anim;
      const user = opts.onDone;
      r.play(anim, {
        loop: opts.loop, fade: opts.fade ?? 0.2, speed: opts.speed ?? 1, restart: true,
        onDone: () => {
          try { user?.(r); } catch (e) { console.warn(e); }
          if (this._forced === anim && !this._forcedLoop) { this._forced = null; this._forcedRes = null; }
          res(true);
        },
      });
      this._forcedLoop = !!r._cur?.loop;
    });
  }

  stop() {
    this.target = null;
    this._np = 0;
    this._endWalk(false);
    return this;
  }

  say(text, { dur = 2.2, mood = 'happy', size = 's', key = 'foxr', voice = 'fox' } = {}) {
    return this.game.say?.({ getWorldPos: (v) => v.set(this.x, this.y + 1.75, this.z) }, text, { voice, mood, dur, size, key });
  }

  _clearForced() {
    const res = this._forcedRes;
    this._forced = null; this._forcedRes = null;
    if (res) res(false);
  }

  _endWalk(ok) {
    const res = this._walkRes;
    this._walkRes = null;
    if (res) res(ok);
  }

  // ================================================================ legacy API
  handPos() {
    return { x: this.x + Math.cos(this.heading) * 0.3, y: this.y + 1.0, z: this.z + Math.sin(this.heading) * 0.3 };
  }

  // walk toward the shore near a point (for feeding), stay on land
  goToward(x, z) {
    const g = this.game.grid;
    const dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    this.heading = Math.atan2(dz, dx);
    if (d < 5) return;
    // walk along the ray until the next tile is water
    let tx = this.x, tz = this.z;
    const steps = Math.floor(d / 0.25);
    for (let i = 1; i < steps; i++) {
      const px = this.x + (dx / d) * i * 0.25, pz = this.z + (dz / d) * i * 0.25;
      const ix = Math.floor(px), iz = Math.floor(pz);
      if (!g.inb(ix, iz) || g.isWater(ix, iz) || g.deco[iz * g.w + ix] >= 0 || (g.occ[iz * g.w + ix] !== -1 && g.occ[iz * g.w + ix] !== -2)) break;
      if (Math.hypot(x - px, z - pz) < 3) { tx = px; tz = pz; break; }
      tx = px; tz = pz;
    }
    this.target = { x: tx, z: tz };
  }

  // fetch an egg crate from a parcel and toss the eggs into the pond
  carryEggs(px, pz, items) {
    (this.errands ||= []).push({ px, pz, items, stage: 'fetch', t: 0 });
    this.routine.interrupt('errand');
  }

  crateMesh() {
    if (this._crate) return this._crate;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), new THREE.MeshLambertMaterial({ color: 0xd8b070 }));
    const straw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.22), new THREE.MeshLambertMaterial({ color: 0xf0d890 }));
    straw.position.y = 0.11;
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf6f0dc }));
    egg.position.set(0.03, 0.15, 0); egg.scale.set(1, 1.25, 1);
    g.add(box, straw, egg);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(1.15);
    this._crate = g;
    return g;
  }

  // a clear pet-shop bag of pond water with a fish inside (live fish orders)
  fishBagMesh() {
    if (this._bag) return this._bag;
    const g = new THREE.Group();
    const water = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x8ad4f4, transparent: true, opacity: 0.55 }));
    water.scale.set(1, 1.15, 1);
    water.position.y = 0.14;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.8 }));
    knot.position.y = 0.34;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10), new THREE.MeshLambertMaterial({ color: 0xff5a7a }));
    tie.rotation.x = Math.PI / 2; tie.position.y = 0.31;
    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.03), new THREE.MeshLambertMaterial({ color: 0xff9a3a }));
    fish.position.set(0, 0.13, 0);
    fish.name = 'fish';
    g.add(water, knot, tie, fish);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._bag = g;
    return g;
  }

  updateErrands(dt) {
    const E = this.errands;
    if (!E?.length || this.bed) return;
    const e = E[0];
    const game = this.game;
    const live = e.items.some((it) => it.kind === 'fish');
    const crate = live ? this.fishBagMesh() : this.crateMesh();
    if (live) { const f = crate.getObjectByName('fish'); if (f) { f.position.x = Math.sin(this.time * 5) * 0.04; f.rotation.y = Math.sin(this.time * 5) > 0 ? 0 : Math.PI; } }
    e.t += dt;
    if (e.stage === 'fetch') {
      if (!this.target || e.t > 8) { if (!this.target || e.t - (e.re || 0) > 4) { e.re = e.t; this.target = { x: e.px, z: e.pz + 0.5 }; } }
      if (Math.hypot(this.x - e.px, this.z - (e.pz + 0.5)) < 0.45 || e.t > 10) {
        e.stage = 'carry'; e.t = 0;
        game.audio.play('grab', { volume: 0.4 });
        // balanced on top of his hat, so you can see it from any side
        game.scene.add(crate);
        e.w = game.fish.randomWaterPoint() || { x: this.x, z: this.z - 3 };
        this.goToward(e.w.x, e.w.z);
        if (!this.target) this.target = { x: this.x, z: this.z };
        this._gaitReq = 'walk'; // careful with the eggs
        this.say(live ? 'Fishies! Hold still...' : e.items.length > 1 ? `${e.items.length} eggs! Careful...` : 'Careful... careful...', { dur: 1.8, key: 'foxerr' });
      }
    } else if (e.stage === 'carry') {
      crate.visible = true;
      const top = this.rig.headTop ? this.rig.headTop(this._crateV || (this._crateV = new THREE.Vector3())) : { x: this.x, y: this.y + 1.6, z: this.z };
      crate.position.set(top.x, top.y + 0.02 + Math.abs(Math.sin(this.time * 9)) * 0.03, top.z);
      crate.rotation.set(0, Math.PI / 2 - this.heading, Math.sin(this.time * 4.5) * 0.08);
      if (!this.target || e.t > 12) {
        e.stage = 'throw'; e.t = 0;
        this.stop();
        this.heading = Math.atan2(e.w.z - this.z, e.w.x - this.x);
        this.react('throw', 0.9);
      }
    } else if (e.stage === 'throw') {
      if (e.t > 0.35 && !e.thrown) {
        e.thrown = true;
        game.scene.remove(crate);
        game.audio.play('whoosh', { volume: 0.35, pitch: 1.2 });
        game.delivery.dropEggs(this.x, this.y + 0.5, this.z, e.items, e.w);
      }
      if (e.t > 1) { E.shift(); this.react('cheer', 1); }
    }
  }

  react(mood, t = 1.2) {
    if (this.bed) return;
    this.mood = mood;
    this.moodT = t;
  }

  // bedtime: walk home, yawn, go inside; zzz from the hut window
  goToBed() {
    this.routine.interrupt('bed');
    this._clearForced();
    this.bed = { stage: 'walk', t: 0 };
    this.target = { x: this.home.x, z: this.home.z - 0.2 };
    this.mood = 'idle';
    this.asleep = false;
  }

  wakeUp() {
    this.bed = null;
    this.asleep = false;
    this.rig.root.visible = true;
    this.stop();
    this.x = this.home.x; this.z = this.home.z + 0.3;
    this.heading = Math.PI / 2;
    this.mood = 'cheer'; this.moodT = 1.2;
    this.game.particles.puff(this.x, 0.2, this.z, 6, 0.25);
    this.game.audio.play('fox_yawn', { volume: 0.4 });
    this.routine.newDay();
  }

  updateBed(dt) {
    const b = this.bed;
    b.t += dt;
    if (b.stage === 'walk') {
      if (!this.target || b.t > 9) { b.stage = 'yawn'; b.t = 0; this.stop(); this.game.audio.play('fox_yawn', { volume: 0.45 }); this.game.ui?.foxBubble?.('*yaaawn*'); }
    } else if (b.stage === 'yawn') {
      this.heading = Math.PI / 2;
      if (b.t > 1.6) { b.stage = 'enter'; b.t = 0; this.target = { x: this.door.x, z: this.door.z }; this._gaitReq = 'walk'; }
    } else if (b.stage === 'enter') {
      if (b.t > 0.9) {
        b.stage = 'asleep'; b.t = 0;
        this.rig.root.visible = false;
        this.asleep = true;
        this.stop();
        this.game.audio.play('fox_snore', { volume: 0.35 });
      }
    } else if (b.stage === 'asleep') {
      if (b.t > 1.3) {
        b.t = 0;
        this.game.particles.zzz(HUT.x + 2.3, 2.3, HUT.z + 2.9);
        if (Math.random() < 0.5) this.game.audio.play('fox_snore', { volume: 0.25 });
      }
    }
  }

  // ================================================================ movement
  _plan(t, gait = null, speed = 0) {
    this._tgtRef = t;
    this._wp = 0;
    let n = 0;
    try { n = this.pather.find(this.x, this.z, t.x, t.z); } catch (e) { console.warn('[fox] path', e); n = 0; }
    const P = this.pather.pts;
    if (n > 0) { for (let i = 0; i < n * 2; i++) this._pts[i] = P[i]; }
    else { this._pts[0] = t.x; this._pts[1] = t.z; n = 1; } // no path: the old straight walk (stops at water)
    this._np = n;
    let len = Math.hypot(this._pts[0] - this.x, this._pts[1] - this.z);
    for (let i = 1; i < n; i++) len += Math.hypot(this._pts[i * 2] - this._pts[i * 2 - 2], this._pts[i * 2 + 1] - this._pts[i * 2 - 1]);
    this._len = len;
    this._restCalc();
    const req = gait || this._gaitReq;
    this._gaitReq = null;
    this._gait = req || (len > 6 ? 'run' : len > 3.2 ? 'jog' : 'walk');
    this._spReq = speed;
  }

  _restCalc() {
    let r = 0;
    for (let i = this._wp + 1; i < this._np; i++) r += Math.hypot(this._pts[i * 2] - this._pts[i * 2 - 2], this._pts[i * 2 + 1] - this._pts[i * 2 - 1]);
    this._rest = r;
  }

  _move(dt) {
    const t = this.target;
    if (!t) { this._np = 0; this.speed = Math.max(0, this.speed - dt * 10); return false; }
    if (t !== this._tgtRef) {
      // someone set fox.target directly (feeding, forage, tutorial...): path-walk it
      if (t !== this._rTarget && !this._walkRes) this.routine.interrupt('target');
      const keep = this._walkRes ? this._gait : null;
      this._plan(t, keep, this._spReq);
    }
    const g = this.game.grid;
    let i = this._wp;
    let wx = this._pts[i * 2], wz = this._pts[i * 2 + 1];
    let dx = wx - this.x, dz = wz - this.z, d = Math.hypot(dx, dz);
    const last = i >= this._np - 1;
    if (d < (last ? 0.08 : 0.3)) {
      if (last) { this.target = null; this._np = 0; this.speed *= 0.3; this._endWalk(true); return false; }
      this._wp = ++i;
      this._restCalc();
      wx = this._pts[i * 2]; wz = this._pts[i * 2 + 1];
      dx = wx - this.x; dz = wz - this.z; d = Math.hypot(dx, dz) || 1e-4;
    }
    const rem = d + this._rest;
    const base = this._spReq || GAIT[this._gait] || GAIT.walk;
    // ease out at the end (a couple of braking steps), ease in at the start
    const vMax = Math.min(base, Math.sqrt(2 * 7 * rem) + 0.35);
    const want = Math.atan2(dz, dx);
    const diff = angleDiff(this.heading, want);
    const align = Math.max(0.12, Math.cos(Math.min(Math.abs(diff), 1.5)));
    const goal = vMax * align;
    this.speed += Math.max(-dt * 14, Math.min(dt * (this._gait === 'walk' ? 5 : 9), goal - this.speed));
    const turnRate = this.speed > 3 ? 7 : 11;
    const dh = diff * Math.min(1, dt * turnRate);
    this.heading += dh;
    this._turnV = dt > 0 ? dh / dt : 0;
    const st = Math.min(d, this.speed * dt);
    const nx = this.x + (dx / d) * st, nz = this.z + (dz / d) * st;
    if (!g.isWater(Math.floor(nx), Math.floor(nz)) || this._onDeck(nx, nz)) { this.x = nx; this.z = nz; }
    else { this.target = null; this._np = 0; this.speed = 0; this._endWalk(false); return false; }
    return true;
  }

  _onDeck(x, z) {
    const s = this.game.grid.structAt(Math.floor(x), Math.floor(z));
    return !!(s && (s.type === 'platform' || s.type === 'dam'));
  }

  // can the daily routine drive him right now?
  free() {
    const game = this.game, st = game.state;
    if (this._ctl.length || this.bed || this.errands?.length || this.asleep) return false;
    if (game.titleMode || !game.started || game.tutorial?.active || game.intro?.active || game.cutscene?.active) return false;
    const ph = st.phase;
    return ph === 'day' || ph === 'rush' || ph === 'evening' || ph === 'report' || ph === 'morning' || ph === 'dawn';
  }

  // ================================================================ per frame
  update(dt) {
    this.time += dt;
    const g = this.game.grid;
    if (this.bed) this.updateBed(dt);
    this.updateErrands(dt);
    this.moodT -= dt;
    if (this.moodT <= 0 && this.mood !== 'idle') this.mood = 'idle';
    const free = this.free();
    try { this.routine.update(dt, free); } catch (e) { console.warn('[fox] routine', e); this.routine.interrupt('error'); }
    // nobody's driving and no routine (tutorial, title...): drift home like he always did
    if (!free && !this._ctl.length && !this.target && this.mood === 'idle' && !this.bed && !this.errands?.length && !this._forced) {
      const far = Math.hypot(this.home.x - this.x, this.home.z - this.z);
      if (far > 1 && Math.random() < dt * 0.15) this.target = { x: this.home.x, z: this.home.z };
    }
    const moving = this._move(dt);
    if (!moving) this._turnV *= Math.max(0, 1 - dt * 8);
    const onPorch = this.x > PORCH.x0 && this.x < PORCH.x1 && this.z > PORCH.z0 && this.z < PORCH.z1;
    const gy = onPorch ? 0.2 : g.surfaceY(Math.floor(this.x), Math.floor(this.z)) + (Math.hypot(this.x - this.home.x, this.z - this.home.z) < 0.9 ? 0.12 : 0);
    this.y = damp(this.y, gy, 12, dt);
    // stationary: turn to face what he was asked to (a quick step-turn when it's a big turn)
    let turning = false;
    if (!moving && this._faceH != null) {
      const df = angleDiff(this.heading, this._faceH);
      this.heading += df * Math.min(1, dt * 7);
      turning = Math.abs(df) > 0.7;
    }
    // pose
    const r = this.rig;
    this._bank = damp(this._bank, Math.max(-0.14, Math.min(0.14, -this._turnV * this.speed * 0.02)), 8, dt);
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.set(0, Math.PI / 2 - this.heading, this._bank);
    const R = this.routine;
    let want = 'idle', loco = false;
    if (this.bed?.stage === 'yawn') want = 'yawn';
    else if (moving) {
      loco = true;
      const ga = this._gait;
      want = ga === 'walk' || this.speed < 2.0 ? 'walk' : this.speed < 3.3 && ga !== 'cover' ? 'jog' : GAIT_ANIM[ga];
    } else if (this._forced) want = this._forced;
    else if (this.mood !== 'idle' && MOOD_ANIM[this.mood]) want = MOOD_ANIM[this.mood];
    else if (turning && (!R.anim || R.animLoop)) { want = 'walk'; loco = true; }
    else if (R.anim) want = R.anim;
    else if (this.game.state.phase === 'rush' && !free) want = 'count_coins';
    else {
      // idle variety: look about, scratch an ear, check the watch, fix the hat, scheme...
      this.fidgetT -= dt;
      if (this.fidget && r.current === this.fidget && !r._cur?.done) want = this.fidget;
      else if (this.fidget && this.anim === this.fidget) this.fidget = null;
      if (this.fidgetT <= 0) {
        this.fidgetT = 8 + Math.random() * 10;
        const cold = R.cold;
        this.fidget = cold && Math.random() < 0.5 ? 'shiver' : FIDGETS[Math.floor(Math.random() * FIDGETS.length)];
        want = this.fidget;
      }
    }
    if (want !== this.anim && !(want === this._forced && r.current === want)) {
      const fade = loco && (this.anim === 'walk' || this.anim === 'jog' || this.anim === 'run' || this.anim === 'run_cover') ? 0.28 : loco ? 0.18 : this.anim === 'walk' || this.anim === 'run' || this.anim === 'jog' ? 0.3 : 0.2;
      if (want === R.anim) r.play(want, { fade, loop: R.animLoop, onDone: R.onAnimDone, restart: true });
      else r.play(want, { fade });
      this.anim = want;
    }
    // cadence follows the ground speed (no foot sliding)
    if (loco && r._cur && r._cur.name === want) {
      const ref = want === 'walk' ? GAIT.walk : want === 'jog' ? GAIT.jog : want === 'run' ? GAIT.run : want === 'run_cover' ? GAIT.cover : 1;
      r._cur.speed = moving ? Math.max(0.55, Math.min(1.35, this.speed / ref)) : 0.8;
    }
    r.update(dt);
    if (!moving && this.mood === 'idle' && !this.target && this._faceH == null && !R.active && Math.hypot(this.x - this.home.x, this.z - this.home.z) < 0.5) {
      // face the pond / camera
      this.heading += angleDiff(this.heading, Math.PI / 2 + Math.sin(this.time * 0.3) * 0.6) * Math.min(1, dt * 2);
    }
  }
}
