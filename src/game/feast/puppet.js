// [v26 feast] Puppet: the b.script a feast event puts on a bear while it acts in
// a scene. BearSystem.step calls update(b, dt) first and skips the bear's own AI
// while it returns true. The puppet itself is driven by the event's clock
// (FeastCtx.tick -> step(dt)): real time in a close-up (the world runs in slow
// motion around it), game time otherwise.
import { angleDiff, damp } from '../../core/rng.js';

export class Puppet {
  constructor(ctx, b) {
    this.ctx = ctx;
    this.b = b;
    this.done = false;
    this.walk = null; // { x, z, speed, pose, resolve }
    this.pose = 'idle';
    this.t01 = null;
    this.turnTo = null;
    this.heading = null; // fixed heading goal (radians)
    this.prevState = b.state;
    this.free = false; // true: someone else moves b (jumps, carried...); the puppet only keeps the AI off
    b.state = 'feast';
    b.path = null;
    b.lunge = 0;
    b.fish = null;
    b.script = this;
  }

  // b.script contract
  update() { return !this.done; }
  cancel() { this.release('decide'); }

  step(dt) {
    const b = this.b, game = this.ctx.game;
    if (this.done) return;
    if (b.removed || !b.rig) { this.done = true; return; }
    if (b.jump) { game.bears.updateJump(b, dt); b.poseOverride = b.jump?.into ? 'cannonball' : 'run'; b.poseT01 = b.jump ? Math.min(1, b.jump.t) : null; return; }
    let moving = false;
    const w = this.walk;
    if (w) {
      const dx = w.x - b.x, dz = w.z - b.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, w.speed * dt);
      if (d > 0.04) {
        b.x += (dx / d) * step; b.z += (dz / d) * step;
        b.heading += angleDiff(b.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 9);
        moving = true;
      }
      if (d - step <= 0.04) { this.walk = null; w.resolve?.(); }
    } else if (this.turnTo || this.heading != null) {
      let h = this.heading;
      if (this.turnTo) { const p = this.ctx.at(this.turnTo, 0); h = Math.atan2(p.z - b.z, p.x - b.x); }
      b.heading += angleDiff(b.heading, h) * Math.min(1, dt * 7);
    }
    b.speed = moving ? (w?.speed || 0) : 0;
    b.poseOverride = moving ? (w.pose || 'walk') : this.pose || 'idle';
    b.poseT01 = moving ? null : this.t01;
    if (!this.free) game.bears.ground(b, dt, moving);
    else b.moving = moving;
    // keep the idle status bubbles ("Hurry up!") off this bear while it acts
    const says = game.ui?.says;
    if (says && !says.has(b.id)) says.set(b.id, { t: 0.5, h: null });
  }

  release(then = 'decide') {
    if (this.done && this.released) return;
    this.done = true;
    this.released = true;
    const b = this.b, game = this.ctx.game;
    if (this.walk) { this.walk.resolve?.(); this.walk = null; }
    if (b.script === this) b.script = null;
    b.poseOverride = null;
    b.poseT01 = null;
    b.rig?.setFace?.('auto');
    if (b.feastEvent === this.ctx.inst) b.feastEvent = null;
    if (b.removed || !b.visible) return;
    if (b.jump) b.jump = null;
    b.patience = Math.max(b.patience, Math.min(b.maxPatience, b.patience + 8));
    const bears = game.bears;
    try {
      if (then === 'leave') bears.beginLeave(b);
      else if (then === 'rampage') bears.startRampage(b);
      else if (then === 'pay') bears.beginPay(b);
      else if (then === 'none') { /* the caller set a state */ }
      else bears.decide(b);
    } catch (e) { console.warn('[feast] release', e); b.state = this.prevState === 'feast' ? 'search' : this.prevState; }
  }
}

export function easeHeading(b, h, dt, k = 7) { b.heading += angleDiff(b.heading, h) * Math.min(1, dt * k); }
export { damp };
