// [v31 cine] The 5 PM opener, super cinematic. Replaces the single office shot at the start of
// every feast (src/game/Cinematic.js startFeast -> the intro). About five and a half seconds, a tap
// skips it, then the camera is handed to the player as before.
//
//   A  0.0s  extreme close-up on the rooftop steam whistle: steam blasts, TOOOOOT! shakes the frame
//   B  1.2s  cut to the facade clock: the day's title card drops in letter by letter (OFF WORK!,
//            TGIF!!! on Fridays), the camera eases back down the tower
//   C  2.7s  low on the lobby doors, the world in slow motion: the first bears burst out
//   D  4.0s  a crane shot sweeping down the trail to the pond, time back to full speed
// The office model is voxels at 0.25 world units placed at OFFICE (src/world/buildings.js).
import { OFFICE } from '../../world/worldgen.js';
import { floatText, floatTitle, clearFloats } from '../../ui/kinetic/floatText.js';

const VS = 0.25;
const W = (vx, vy, vz) => ({ x: OFFICE.x + vx * VS, y: OFFICE.h + vy * VS, z: OFFICE.z + vz * VS });
const WHISTLE = W(12.5, 45, -4.5);
const CLOCK = W(0, 27, 8);
const DOORS = W(-0.5, 2, 9);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a, b, k) => a + (b - a) * k;

const DAY_TITLE = {
  Monday: ['MONDAY', 'OFF WORK!', 'shout'],
  Tuesday: ['TUESDAY', 'OFF WORK!', 'shout'],
  Wednesday: ['HUMP DAY', 'OFF WORK!', 'shout'],
  Thursday: ['THURSDAY', 'OFF WORK!', 'shout'],
  Friday: ['FRIDAY', 'TGIF!!!', 'gold'],
  Saturday: ['SATURDAY', 'OVERTIME!', 'shout'],
  Sunday: ['SUNDAY', 'BRUNCH!', 'happy'],
};

export class FeastOpener {
  constructor(game, end) {
    this.game = game;
    this.end = end; // { x, z, wupp }: where the crane lands (the player's camera)
    this.t = 0;
    this.beat = '';
    this.done = false;
    this.steamT = 0;
    this.barked = false;
  }

  get rig() { return this.game.rig; }

  set(goal, wupp, yaw) {
    const r = this.rig;
    r.goal.set(goal.x, goal.y, goal.z);
    r.target?.copy?.(r.goal);
    r.wupp = r.wuppGoal = wupp;
    if (yaw != null) { r.yaw = r.yawGoal = yaw; }
  }

  update(dt) {
    if (this.done) return true;
    const g = this.game, r = this.rig;
    this.t += Math.min(0.1, dt);
    const t = this.t;
    // ---- A: the whistle (TOOOOOT!)
    if (t < 1.2) {
      if (this.beat !== 'A') {
        this.beat = 'A';
        this.yaw0 = r.yawGoal;
        this.set({ x: WHISTLE.x - 0.6, y: WHISTLE.y - 1.2, z: WHISTLE.z + 0.8 }, 0.0105, this.yaw0 + 0.35);
        r.shake = Math.max(r.shake || 0, 0.55);
        floatText({ text: 'TOOOOOOT!', at: { x: WHISTLE.x, y: WHISTLE.y + 0.6, z: WHISTLE.z }, style: 'shout', k: 2, ms: 900, cine: true, prio: 1, kick: false });
      }
      // a slow push and steam blasting out of the whistle
      r.wuppGoal = lerp(0.0105, 0.0094, t / 1.2);
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.07;
        try { g.particles.puff(WHISTLE.x + (Math.random() - 0.5) * 0.2, WHISTLE.y + 0.5, WHISTLE.z, 2, 0.32 + Math.random() * 0.12); } catch { /* */ }
        if (Math.random() < 0.5) try { g.particles.smoke(WHISTLE.x, WHISTLE.y + 0.8, WHISTLE.z); } catch { /* */ }
      }
      return false;
    }
    // ---- B: the clock and the day's title
    if (t < 2.7) {
      if (this.beat !== 'B') {
        this.beat = 'B';
        clearFloats((it) => it.cine);
        this.set({ x: CLOCK.x, y: CLOCK.y - 1.4, z: CLOCK.z }, 0.021, this.yaw0);
        const name = g.weekday?.() || 'Monday';
        const [kick, title, style] = DAY_TITLE[name] || DAY_TITLE.Monday;
        this.title = floatTitle({ kicker: `5:00 PM · ${kick}`, title, style, y: 0.15, ms: 2300 });
        g.audio?.play?.('bell', { volume: 0.35 });
      }
      const k = ease((t - 1.2) / 1.5);
      r.goal.y = lerp(CLOCK.y - 1.4, DOORS.y + 2.6, k);
      r.wuppGoal = lerp(0.021, 0.026, k);
      return false;
    }
    // ---- C: the doors burst open, slow motion
    if (t < 4.0) {
      if (this.beat !== 'C') {
        this.beat = 'C';
        this.set({ x: DOORS.x + 1.2, y: DOORS.y + 0.6, z: DOORS.z + 1.6 }, 0.0165, this.yaw0 - 0.25);
        g.timeScale = 0.45;
        r.shake = Math.max(r.shake || 0, 0.35);
        try { g.particles.dust(DOORS.x, DOORS.y - 0.4, DOORS.z, 10); } catch { /* */ }
        try { g.audio?.play?.('footsteps', { volume: 0.5, pitch: 0.8 }); } catch { /* */ }
      }
      if (!this.barked) {
        const b = g.bears?.list?.find((x) => x.visible && x.state !== 'queued');
        if (b) {
          this.barked = true;
          floatText({ text: Math.random() < 0.5 ? 'FOOOOOD!!' : 'FISH O\'CLOCK!', at: { getWorldPos: (v) => v.set(b.x, b.y + 2.3 * (b.def?.scale || 1), b.z) }, style: 'shout', ms: 1300, cine: true, voice: 'bear', kick: false });
        }
      }
      r.wuppGoal = lerp(0.0165, 0.0185, (t - 2.7) / 1.3);
      return false;
    }
    // ---- D: the crane down to the pond
    if (t < 5.6) {
      if (this.beat !== 'D') {
        this.beat = 'D';
        g.timeScale = 1;
        this.from = { x: r.goal.x, y: r.goal.y, z: r.goal.z, w: r.wuppGoal, yaw: r.yawGoal };
      }
      const k = ease((t - 4.0) / 1.6);
      const E = this.end;
      r.goal.x = lerp(this.from.x, E.x, k);
      r.goal.z = lerp(this.from.z, E.z, k);
      r.goal.y = lerp(this.from.y, 0, k);
      r.wuppGoal = lerp(this.from.w, E.wupp, k);
      r.yawGoal = lerp(this.from.yaw, E.yaw ?? this.yaw0, k);
      return false;
    }
    this.stop();
    return true;
  }

  stop() {
    if (this.done) return;
    this.done = true;
    this.game.timeScale = 1;
    this.title?.dismiss?.();
    clearFloats((it) => it.cine);
  }
}
