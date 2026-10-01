// The feast cutscene: at 5 PM the player loses control and a little camera
// director takes over. Shots: the office doors bursting open, following the
// lead bear down the switchback trail, a slow-motion first cannonball, then
// close-ups of the juiciest moments (chomps, golden fish, rampages) with
// coworkers chatting in speech bubbles, and wide shots of the whole pond in
// between. Ends when the last customer has left the pond.
import { OFFICE } from '../world/worldgen.js';
import { CHATTER } from '../data/bears.js';
import { pick } from '../core/rng.js';

export class Cinematic {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.fast = false;
    this.shot = null;
    this.t = 0;
    this.focusQueue = [];
    this.chatT = 3;
    this.seen = new Set();
  }

  get rig() { return this.game.rig; }

  startFeast() {
    const game = this.game;
    const rig = this.rig;
    this.active = true;
    this.fast = false;
    this.seen.clear();
    this.focusQueue.length = 0;
    this.chatT = 4;
    game.inputLocked = true;
    game.ui?.closePanel?.();
    game.ui?.setCinematic?.(true);
    this.saved = { x: rig.goal.x, z: rig.goal.z, wupp: rig.wuppGoal, yaw: rig.yawGoal };
    rig.follow = null;
    rig.freeBounds = true;
    this.cut('office');
  }

  cut(kind, opts = {}) {
    const rig = this.rig;
    this.shot = { kind, t: 0, ...opts };
    const g = this.game;
    switch (kind) {
      case 'office':
        rig.goal.set(OFFICE.x, OFFICE.h - 1.5, OFFICE.z + 3.5);
        rig.target.copy(rig.goal);
        rig.wupp = rig.wuppGoal = 0.032;
        g.ui?.cineTitle?.('5:00 PM', 'OFF WORK!');
        g.rig.shake = 0.6;
        break;
      case 'trail':
        rig.wuppGoal = 0.036;
        break;
      case 'splash':
        rig.wuppGoal = 0.026;
        g.timeScale = 0.3;
        g.audio.play('cinema', { volume: 0.5 });
        break;
      case 'close': {
        // a hard cut: snap straight onto the bear, tight
        rig.wupp = rig.wuppGoal = opts.zoom || 0.016;
        const b = opts.bear;
        if (b) { rig.goal.set(b.x, Math.max(0, b.y) + 0.8 * b.def.scale, b.z); rig.target.copy(rig.goal); }
        break;
      }
      case 'wide':
        rig.wuppGoal = 0.05;
        break;
      default: break;
    }
  }

  // bears worth looking at
  activeBears() {
    return this.game.bears.list.filter((b) => b.visible && b.state !== 'queued');
  }

  onChomp(b) {
    if (!this.active || this.seen.has(b.id + ':' + b.eatenCount)) return;
  }

  onRampage(b) {
    if (!this.active) return;
    this.focusQueue.unshift({ kind: 'rampage', bear: b });
  }

  onTap() { /* taps are ignored during the feast (no control!) */ }

  toggleFast(v) { this.fast = v ?? !this.fast; }

  chatter(b) {
    const bears = this.game.bears;
    const others = this.activeBears().filter((o) => o !== b && !o.angry && Math.hypot(o.x - b.x, o.z - b.z) < 6);
    if (!others.length) return false;
    const o = pick(others);
    const [a, r] = pick(CHATTER);
    bears.say(b, a, null, null, 2.6);
    setTimeout(() => { if (o.visible) bears.say(o, r, null, null, 2.6); }, 1500);
    return true;
  }

  update(dt) {
    if (!this.active) return;
    const game = this.game;
    const rig = this.rig;
    const sh = this.shot;
    sh.t += dt;
    const bears = this.activeBears();
    // global chatter now and then
    this.chatT -= dt * (this.fast ? 3 : 1);
    if (this.chatT <= 0 && bears.length > 1) {
      this.chatT = 4.5 + Math.random() * 4;
      const talker = pick(bears.filter((b) => b.inWater || b.state === 'eat' || b.state === 'yummy') || bears) || pick(bears);
      if (talker) this.chatter(talker);
    }
    switch (sh.kind) {
      case 'office': {
        if (sh.t > 2.8 || (bears.length && sh.t > 1.6)) {
          const lead = bears.find((b) => b.state === 'commute');
          if (lead) this.cut('trail', { bear: lead });
          else if (sh.t > 4) this.cut('wide');
        }
        break;
      }
      case 'trail': {
        const b = sh.bear;
        if (!b || !b.visible) { this.cut('wide'); break; }
        rig.goal.set(b.x, b.y, b.z);
        if (b.jump && b.jump.into) { this.cut('splash', { bear: b }); break; }
        if (sh.t > 9 || (b.state !== 'commute' && !b.jump && sh.t > 1)) this.cut('wide');
        break;
      }
      case 'splash': {
        const b = sh.bear;
        if (b) rig.goal.set(b.x, Math.max(0, b.y * 0.5), b.z);
        if (sh.t > 0.55) game.timeScale = 1;
        if (sh.t > 2.2) this.cut('wide');
        break;
      }
      case 'close': {
        const b = sh.bear;
        if (!b || !b.visible) { this.cut('wide'); break; }
        rig.goal.set(b.x, Math.max(0, b.y) + 0.8 * b.def.scale, b.z);
        if (!sh.chatted && sh.t > 0.8) { sh.chatted = true; if (Math.random() < 0.7) this.chatter(b); }
        if (sh.t > (sh.dur || 3)) this.cut('wide');
        break;
      }
      case 'wide': {
        // frame the crowd
        if (bears.length) {
          let x = 0, z = 0, n = 0;
          for (const b of bears) { if (b.state === 'commute' || b.state === 'commuteUp') continue; x += b.x; z += b.z; n++; }
          if (n) rig.goal.set(x / n, 0, z / n);
        }
        if (sh.t > 1.6) {
          const q = this.focusQueue.shift();
          if (q && q.bear.visible) { this.cut('close', { bear: q.bear, dur: 3, zoom: 0.018 }); break; }
          const eater = bears.find((b) => b.state === 'eat' && !this.seen.has(b.id + ':' + b.eaten.toFixed(1)));
          if (eater && sh.t > 2.2) {
            this.seen.add(eater.id + ':' + eater.eaten.toFixed(1));
            this.cut('close', { bear: eater, dur: 3.2 });
            break;
          }
          const angry = bears.find((b) => b.angry && b.state === 'smash');
          if (angry && sh.t > 2.2) { this.cut('close', { bear: angry, dur: 2.4, zoom: 0.02 }); break; }
        }
        break;
      }
      default: break;
    }
    if (game.state.phase !== 'rush') this.finish();
  }

  finish() {
    if (!this.active) return;
    const game = this.game;
    const rig = this.rig;
    this.active = false;
    this.fast = false;
    game.timeScale = 1;
    game.inputLocked = false;
    rig.freeBounds = false;
    rig.goal.y = 0;
    const s = this.saved;
    if (s) { rig.goal.set(s.x, 0, s.z); rig.clampGoal(); rig.wuppGoal = s.wupp; rig.yawGoal = s.yaw; }
    game.ui?.setCinematic?.(false);
  }
}
