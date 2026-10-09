// The feast camera. At 5 PM the office doors burst open (a short, skippable
// opening shot), then [v26 feast] the camera is handed to the player: free pan /
// zoom / rotate over the whole area the bears use, the normal UI hidden, a
// minimal feast overlay, and pop-up event icons (src/game/feast/FeastSystem.js).
// The old camera director is still here as the optional "Auto-cam": following
// the lead bear down the switchback trail, slow-motion cannonballs, close-ups
// of the juiciest moments (chomps, golden fish, rampages) and wide shots of the
// pond. It yields the moment the player touches the camera. Coworkers chat in
// speech bubbles either way. Ends when the last customer has left the pond.
//
// API used elsewhere: active, fast, shot, startFeast(wave), cut(kind, opts),
// focusQueue.unshift({ kind, bear }), onRampage(b), onChomp(b), onTap(),
// toggleFast(v), update(dt), finish(). With a free camera, cut() / focusQueue
// requests from other systems become pop-up highlights instead of hard cuts.
import { OFFICE } from '../world/worldgen.js';
import { CHATTER } from '../data/bears.js';
import { pick, clamp } from '../core/rng.js';

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
    this.intro = false; // [v26 feast] the opening shot is playing
    this.autoCam = false; // [v26 feast] the director drives the camera
    this.userT0 = 0;
  }

  get rig() { return this.game.rig; }
  get feast() { return this.game.feast || null; }

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
    this.intro = true;
    this.autoCam = this.feast ? !!this.feast.st.autoCam : true;
    this.feast?.begin();
    this.cut('office');
  }

  // [v26 feast] a tap / key during the opening shot
  skipIntro() {
    if (this.intro && this.shot && this.shot.t > 0.3) this.endIntro();
  }

  // [v26 feast] the doors are open: hand the camera over
  endIntro() {
    const game = this.game, rig = this.rig, f = this.feast;
    this.intro = false;
    if (!f) { this.cut('wide'); return; }
    game.inputLocked = false;
    rig.freeBounds = false;
    const s = this.saved;
    f.handOver();
    rig.goal.set(s.x, 0, s.z);
    rig.clampGoal();
    rig.wuppGoal = clamp(s.wupp * 1.1, 0.034, 0.06);
    this.shot = { kind: 'free', t: 0 };
    this.userT0 = rig.userCamT || 0;
    if (this.autoCam) { rig.freeBounds = true; this.cut('wide'); }
  }

  // [v26 feast] Auto-cam toggle (the feast overlay button)
  setAutoCam(on) {
    on = !!on;
    this.autoCam = on;
    if (this.feast) this.feast.st.autoCam = on;
    if (!this.active || this.intro) return;
    if (on) { this.userT0 = this.rig.userCamT || 0; this.rig.freeBounds = true; this.cut('wide'); }
    else { this.shot = { kind: 'free', t: 0 }; this.game.timeScale = this.feast?.focusInst ? this.game.timeScale : 1; this.rig.freeBounds = !!this.feast?.focusInst; this.rig.goal.y = 0; this.rig.clampGoal(); }
  }

  directing() { return !this.feast || (this.autoCam && !this.feast.focusInst && !this.intro); }

  cut(kind, opts = {}) {
    const rig = this.rig;
    const f = this.feast;
    // [v26 feast] free camera: other systems' hard cuts become pop-up highlights
    if (f && !this.intro && kind !== 'office') {
      if (f.focusInst) return;
      if (!this.autoCam) {
        if (opts.bear?.visible) f.highlight(opts.bear, { kind: opts.bear.def?.boss ? 'boss' : 'rampage' });
        return;
      }
    }
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
        // tracking shot on the lead bear, a little ahead of it
        rig.wuppGoal = 0.022;
        if (opts.bear) { rig.goal.set(opts.bear.x, opts.bear.y + 0.6, opts.bear.z); rig.target.copy(rig.goal); }
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

  // taps while the input is locked (the opening shot, a close-up)
  onTap() { this.feast?.onLockedTap?.(); }

  toggleFast(v) { this.fast = v ?? !this.fast; }

  chatter(b) {
    const bears = this.game.bears;
    const others = this.activeBears().filter((o) => o !== b && !o.angry && !o.script && Math.hypot(o.x - b.x, o.z - b.z) < 6);
    if (!others.length) return false;
    const o = pick(others);
    const [a, r] = pick(CHATTER);
    bears.say(b, a, null, null, 2.6);
    setTimeout(() => { if (o.visible && !o.script) bears.say(o, r, null, null, 2.6); }, 1500);
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
      const free = bears.filter((b) => !b.script);
      const talker = pick(free.filter((b) => b.inWater || b.state === 'eat' || b.state === 'yummy')) || pick(free);
      if (talker) this.chatter(talker);
    }
    if (this.intro && this.feast) {
      // [v26 feast] the doors burst open, then the camera is yours
      if (sh.t > 2.9 || (bears.length && sh.t > 2.2)) this.endIntro();
    } else if (this.directing()) {
      // auto-cam yields the moment the player touches the camera
      if (this.feast && (rig.userCamT || 0) > this.userT0) { this.setAutoCam(false); this.feast.ui?.syncButtons?.(); }
      else this.direct(sh, bears);
    } else {
      // [v26 feast] free camera: rampages / boss moments queued by other systems pop up as highlights
      while (this.focusQueue.length) {
        const q = this.focusQueue.shift();
        if (q.bear?.visible && !this.feast?.focusInst) this.feast?.highlight(q.bear, { kind: q.bear.def?.boss ? 'boss' : 'rampage' });
      }
    }
    if (game.state.phase !== 'rush') this.finish();
  }

  // the old camera director (auto-cam)
  direct(sh, bears) {
    const game = this.game;
    const rig = this.rig;
    switch (sh.kind) {
      case 'free':
        this.cut('wide');
        break;
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
        const ahead = 1.2;
        rig.goal.set(b.x + Math.cos(b.heading) * ahead, b.y + 0.6, b.z + Math.sin(b.heading) * ahead);
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
  }

  finish() {
    if (!this.active) return;
    const game = this.game;
    const rig = this.rig;
    this.feast?.end(); // [v26 feast]
    this.active = false;
    this.intro = false;
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
