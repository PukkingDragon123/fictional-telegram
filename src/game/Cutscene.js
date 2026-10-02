// Cutscenes on the real world: letterbox bars, the HUD tucked away, the camera
// gliding between shots, and a storybook caption card for each shot.
//
//   await game.cutscene.play({ shots: [
//     { at: { x, z }, wupp: 0.03, yaw: 0.4, pitch: 0.7, dur: 2.5, caption: 'Title', sub: 'line',
//       call: () => {}, sfx: 'whoosh', ease: 'inout', cut: false },
//   ], skippable: true });
// `at` can be a function (follow something). The game clock is paused and input
// locked while it plays; everything is restored afterwards. Tap SKIP to jump out.
import * as THREE from 'three';

const ease = { inout: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2), out: (t) => 1 - (1 - t) ** 3, linear: (t) => t };
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Cutscene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.el = null;
  }

  ensureDOM() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'cutscene';
    el.innerHTML = '<div class="cs-card"><b class="cs-title"></b><span class="cs-sub"></span></div><button class="cs-skip">SKIP ▸▸</button>';
    document.body.appendChild(el);
    el.querySelector('.cs-skip').addEventListener('click', (e) => { e.stopPropagation(); this.skipped = true; });
    this.el = el;
  }

  caption(title, sub) {
    const card = this.el.querySelector('.cs-card');
    if (!title && !sub) { card.classList.remove('on'); return; }
    this.el.querySelector('.cs-title').innerHTML = esc(title || '');
    this.el.querySelector('.cs-sub').innerHTML = esc(sub || '');
    card.classList.remove('on'); void card.offsetWidth; card.classList.add('on');
    this.game.audio.play('page', { volume: 0.3 });
  }

  async play({ shots = [], skippable = true, bars = true } = {}) {
    const game = this.game;
    if (this.active || !shots.length) return;
    this.ensureDOM();
    this.active = true;
    this.skipped = false;
    const rig = game.rig;
    const saved = { paused: game.state.paused, locked: game.inputLocked, x: rig.goal.x, z: rig.goal.z, wupp: rig.wuppGoal, yaw: rig.yawGoal, pitch: rig.pitchGoal ?? rig.pitch, follow: rig.follow, free: rig.freeBounds };
    game.state.paused = true;
    game.inputLocked = true;
    rig.follow = null;
    rig.freeBounds = true;
    if (bars) document.body.classList.add('cine', 'cutscene-on');
    this.el.classList.add('on');
    this.el.querySelector('.cs-skip').style.display = skippable ? '' : 'none';
    try {
      for (const sh of shots) {
        if (this.skipped) break;
        const from = { x: rig.goal.x, z: rig.goal.z, wupp: rig.wuppGoal, yaw: rig.yawGoal, pitch: rig.pitchGoal ?? rig.pitch };
        if (sh.sfx) game.audio.play(sh.sfx, { volume: 0.45 });
        if (sh.caption || sh.sub) this.caption(sh.caption, sh.sub); else if (sh.clear) this.caption(null);
        try { sh.call?.(); } catch (e) { console.warn('cutscene call', e); }
        const dur = Math.max(0.2, sh.dur ?? 2);
        const E = ease[sh.ease || 'inout'];
        const t0 = performance.now();
        await new Promise((res) => {
          const step = () => {
            const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
            const e = sh.cut ? 1 : E(Math.min(1, k * 1.25));
            const at = typeof sh.at === 'function' ? sh.at() : sh.at;
            if (at) { rig.goal.x = from.x + (at.x - from.x) * e; rig.goal.z = from.z + (at.z - from.z) * e; }
            if (sh.wupp) rig.wuppGoal = from.wupp + (sh.wupp - from.wupp) * e;
            if (sh.yaw != null) rig.yawGoal = from.yaw + (sh.yaw - from.yaw) * e;
            if (sh.pitch != null && rig.pitchGoal != null) rig.pitchGoal = from.pitch + (sh.pitch - from.pitch) * e;
            if (sh.cut && k === 0) { rig.target?.copy?.(rig.goal); rig.wupp = rig.wuppGoal; rig.yaw = rig.yawGoal; }
            if (k >= 1 || this.skipped) res(); else requestAnimationFrame(step);
          };
          step();
          setTimeout(res, dur * 1000 + 400); // never hang (hidden tabs)
        });
        if (sh.hold) await wait(sh.hold);
      }
    } finally {
      this.caption(null);
      this.el.classList.remove('on');
      document.body.classList.remove('cutscene-on');
      if (bars && !game.cine?.active) document.body.classList.remove('cine');
      rig.goal.set(saved.x, rig.goal.y, saved.z);
      rig.wuppGoal = saved.wupp;
      rig.yawGoal = saved.yaw;
      if (rig.pitchGoal != null) rig.pitchGoal = saved.pitch;
      rig.follow = saved.follow;
      rig.freeBounds = saved.free;
      rig.clampGoal?.();
      game.state.paused = saved.paused;
      game.inputLocked = saved.locked;
      this.active = false;
    }
  }

  // shots that end where they start (used by the tutorial for a quick look)
  static at(x, z) { return new THREE.Vector3(x, 0, z); }
}
