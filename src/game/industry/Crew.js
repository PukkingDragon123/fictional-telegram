// [v26 power] Fallback fabrication crew: when there is no staff system (game.staff.task),
// every fabrication building gets one apprentice beaver from Flint's union. It does the
// same physical jobs a hired staff beaver would, through the same call:
//
//   crew.task(s, { kind, at?, dur, anim?, until?, carry?: { item, to }, onDone, onFail? }) -> bool
//     walk to `at` (a storage / { x, z }; default: the machine s), work `dur` seconds
//     (or until until() is true) with the anim, then carry `item` (a visible prop) to
//     `carry.to` and call onDone().
//   crew.workersAt(s) -> [beaver]   crew.skillAt(s) -> 1..5
import * as THREE from 'three';
import { angleDiff, damp } from '../../core/rng.js';

const c3 = import.meta.glob('../../entities/critters3d.js', { eager: true });
const C3 = c3['../../entities/critters3d.js'] || null;

const NAMES = ['Rivet', 'Sprocket', 'Tinker', 'Gizmo', 'Widget', 'Ratchet', 'Dynamo', 'Solder', 'Flux', 'Gasket', 'Piston', 'Cog'];
const WALK = 2.3, CARRY = 1.9;
const LINES = {
  fetch: ['One armful, coming up!', 'Heavy heavy heavy.', 'Got it!', 'Back in a jiffy.'],
  work: ['Hot hot hot!', 'Mind the sparks!', 'Tap tap tap.', 'Nearly there...', 'This is my favourite part.'],
  done: ['Fresh off the bench!', 'Ta-da!', 'Another one!', 'Shiny!'],
  dark: ['Who turned the power off?', 'No juice, no job.', 'Is it plugged in?'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Crew {
  constructor(fab) {
    this.fab = fab;
    this.game = fab.game;
    this.group = new THREE.Group();
    this.group.name = 'fabCrew';
    this.game.scene.add(this.group);
    this.list = []; // { key, s, rig, x, z, y, heading, task, anim, prop, propId, name, sayT }
    this.n = 0;
  }

  byKey(k) { return this.list.find((b) => b.key === k) || null; }
  ensure(s) {
    const k = this.fab.key(s);
    let b = this.byKey(k);
    if (b) { b.s = s; return b; }
    if (!C3?.BeaverRig) return null;
    let rig = null;
    try { rig = new C3.BeaverRig({ hat: this.n % 2 ? 'orange' : 'yellow' }); } catch (e) { console.warn('crew beaver', e); return null; }
    const p = this.fab.workSpot(s);
    b = { key: k, s, rig, x: p.x, z: p.z + 0.2, y: this.game.grid.groundAt(p.x, p.z), heading: -Math.PI / 2, task: null, anim: null, prop: null, propId: null, name: NAMES[this.n % NAMES.length], sayT: 4 + Math.random() * 8, moving: false };
    this.n++;
    rig.root.scale.setScalar(1);
    this.group.add(rig.root);
    this.list.push(b);
    this.game.particles.puff(b.x, b.y + 0.2, b.z, 6, 0.25);
    return b;
  }
  drop(b) {
    if (b.task) this.fail(b);
    this.group.remove(b.rig.root);
    try { b.rig.dispose?.(); } catch { /* ignore */ }
    this.list.splice(this.list.indexOf(b), 1);
  }
  clear() { for (const b of [...this.list]) this.drop(b); }
  workersAt(s) { const b = this.byKey(this.fab.key(s)); return b ? [b] : []; }
  skillAt() { return 2; }

  task(s, o) {
    const b = this.ensure(s);
    if (!b || b.task) return false;
    b.task = { ...o, phase: 'go', t: 0 };
    if (o.kind === 'fetch' && Math.random() < 0.25) this.say(b, pick(LINES.fetch));
    return true;
  }
  fail(b) {
    const t = b.task;
    b.task = null;
    this.hold(b, null);
    try { t?.onFail?.(); } catch (e) { console.warn('crew fail', e); }
  }
  point(target, s) {
    if (!target) return this.fab.workSpot(s);
    if (target.def?.depot) return this.game.storage?.door?.(target) || { x: target.x + 0.5, z: target.z + 1.2 };
    if (target.def) return this.fab.workSpot(target);
    return { x: target.x, z: target.z };
  }

  // a carried prop over the head (where the log goes)
  hold(b, id) {
    const r = b.rig;
    if (b.propId === id) return;
    if (b.prop) { b.prop.parent?.remove(b.prop); b.prop = null; }
    b.propId = id;
    if (!id || !r.logJ) return;
    const m = this.game.storage?.makeProp?.(id) || null;
    if (!m) return;
    const ws = new THREE.Vector3();
    r.root.updateMatrixWorld(true);
    r.logJ.getWorldScale(ws);
    m.scale.multiplyScalar(1.15 / Math.max(1e-3, ws.x));
    m.position.y = -0.04 / Math.max(1e-3, ws.x);
    r.logJ.add(m);
    b.prop = m;
  }
  say(b, text, mood = 'happy') {
    if (!this.fab.near(b.x, b.z, 16)) return;
    this.game.say?.({ getWorldPos: (v) => v.set(b.x, b.y + 1.0, b.z) }, text, { mood, dur: 1.8, size: 's', key: 'crew' + b.key });
  }
  move(b, tx, tz, dt, speed) {
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.06) { b.moving = false; return true; }
    const st = Math.min(d, speed * dt);
    b.x += (dx / d) * st; b.z += (dz / d) * st;
    b.heading += angleDiff(b.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 9);
    b.moving = st > 1e-5;
    return d - st < 0.06;
  }
  face(b, tx, tz, dt) { b.heading += angleDiff(b.heading, Math.atan2(tz - b.z, tx - b.x)) * Math.min(1, dt * 8); }

  update(dt, sdt, working) {
    const game = this.game;
    // drop beavers whose machine is gone
    for (const b of [...this.list]) if (!b.s || b.s.removed || !this.fab.isFab(b.s)) this.drop(b);
    for (const b of this.list) {
      const s = b.s;
      b.moving = false;
      const t = b.task;
      const tdt = sdt > 0 ? sdt : 0;
      if (!t) {
        // home: the work spot, facing the machine
        const p = this.fab.workSpot(s);
        if (!this.move(b, p.x, p.z, tdt || dt * 0.6, WALK)) { /* walking back */ } else { const c = this.fab.center(s); this.face(b, c.x, c.z, dt); }
      } else if (t.phase === 'go') {
        const p = this.point(t.at, s);
        if (this.move(b, p.x, p.z, tdt, WALK)) { t.phase = 'work'; t.t = 0; }
      } else if (t.phase === 'work') {
        const tg = t.at ? this.point(t.at, s) : this.fab.center(s);
        const c = t.at?.def ? (game.storage?.center?.(t.at) || tg) : this.fab.center(s);
        this.face(b, c.x, c.z, dt);
        t.t += tdt;
        const done = t.until ? !!t.until() : t.t >= (t.dur || 0.5);
        if (t.kind === 'fab' && tdt > 0 && !done) this.fab.workFx(s, b, tdt);
        if (done && (t.until || t.t >= (t.dur || 0.5))) {
          if (t.carry?.item) { this.hold(b, t.carry.item); t.phase = 'carry'; game.audio?.play('grab', { volume: 0.22, pitch: 1.1 }); }
          else this.finish(b);
        }
      } else if (t.phase === 'carry') {
        const p = this.point(t.carry.to, s);
        if (this.move(b, p.x, p.z, tdt, CARRY)) {
          game.particles.dust(b.x, b.y + 0.05, b.z, 2);
          game.audio?.play('crate_drop', { volume: 0.18, pitch: 1.4 });
          this.finish(b);
        }
      }
      b.y = damp(b.y, game.grid.groundAt(b.x, b.z), 10, dt);
      // chatter
      b.sayT -= dt;
      if (b.sayT <= 0) {
        b.sayT = 14 + Math.random() * 16;
        const r = this.fab.ind.rec(s);
        if (r.why === 'nopower') this.say(b, pick(LINES.dark), 'worried');
        else if (t?.kind === 'fab' && Math.random() < 0.6) this.say(b, pick(LINES.work));
      }
    }
    void working;
  }
  finish(b) {
    const t = b.task;
    b.task = null;
    this.hold(b, null);
    if (t?.kind === 'fab') { b.cheerT = 0.9; if (Math.random() < 0.3) this.say(b, pick(LINES.done)); }
    try { t?.onDone?.(); } catch (e) { console.warn('crew task', e); }
  }

  render(dt) {
    const night = ['night', 'bedtime', 'dawn', 'report'].includes(this.game.state.phase);
    const hide = !!this.game.overrideScene;
    for (const b of this.list) {
      const r = b.rig;
      r.root.visible = !hide;
      r.root.position.set(b.x, b.y, b.z);
      r.root.rotation.set(0, Math.PI / 2 - b.heading, 0);
      if (!r.play) continue;
      const t = b.task;
      let want = 'idle';
      if (b.prop) want = 'carry_log';
      else if (b.moving) want = 'run';
      else if (t?.phase === 'work') want = t.kind === 'fab' ? (this.fab.ind.rec(b.s).running ? 'hammer' : 'idle') : 'chop';
      else if (b.cheerT > 0) want = 'cheer';
      else if (night) want = 'sleep';
      if (b.cheerT > 0) b.cheerT -= dt;
      if (want !== b.anim) { r.play(want, { loop: true, fade: 0.15 }); b.anim = want; }
      r.update(dt);
      if (b.prop && r.props?.log) r.props.log.visible = false;
    }
  }
}
