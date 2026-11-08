// [v31 cine] The Director (game.director): cinematic talk scenes on the real world.
//
// Letterbox bars, the HUD tucked away, the camera framing whoever speaks (push-ins, reverse
// shots, slow drifts), and every line floating by the speaker in the kinetic pixel text borrowed
// from Project Zealandia (src/ui/kinetic/floatText.js): shouts punch and shake, whispers waver,
// scared lines tremble, phone calls from the office tower crackle. Bears walk in as real rigged
// actors (StageBear), Reynard is directed through game.fox.cine.
//
//   game.director.play(async (c) => {
//     const gary = c.bear('office', { at: [x, z], name: 'Gary' });
//     await c.bars(true);
//     await c.shot(gary, { zoom: 0.018 });
//     await c.say(gary, 'Is this the break room?', { style: 'scared' });
//     await c.say(c.fox, 'This is a *fish pond*.', { anim: 'talk' });
//   }, { pause: true, skippable: true, id: 'intern' })
//
// Scenes queue up (queue(fn, opts)) and start only when nothing else is on (tutorial, other
// cutscenes, the lab, panels, the feast). A tap / Space / Enter advances a line; Esc or SKIP ends
// the scene (the script keeps running instantly to its end, so state changes still happen).
import { BearRig } from '../../entities/bearRig.js';
import { makeBearLook, lookDef } from '../../entities/bearLook.js';
import { BEAR_TYPES, FIRST_NAMES } from '../../data/bears.js';
import { HUT, OFFICE } from '../../world/worldgen.js';
import { angleDiff, damp, clamp } from '../../core/rng.js';
import { bindFloat, floatText, floatTitle, floatCaption, clearFloats, skipAllFloats } from '../../ui/kinetic/floatText.js';
import { questToastBusy } from '../../ui/QuestToast.js';
import { Words3D } from './words3d.js'; // [v32 cine] floating 3D voxel words

const ease = { inout: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2), out: (t) => 1 - (1 - t) ** 3, in: (t) => t * t * t, linear: (t) => t };
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

// speaker colours (the name tag and a light tint on the words)
export const CAST_COLOR = { fox: '#ff9a3c', bear: '#c89a6a', cub: '#ffc890', ceo: '#bfe6ff', critic: '#d8b4ff', intern: '#9de08a', grandma: '#ffb4c8', gymbro: '#b8f060', janitor: '#8ad0c8', narrator: '#f6ecd4' };
const VOICE_OF = { cub: 'cub', foreman_cub: 'cub', ceo: 'ceo', boss: 'ceo', shareholder: 'ceo', tycoon: 'ceo', spirit: 'ceo', ursa: 'ceo' };

// ------------------------------------------------------------------ comic bubbles
// how a line is said -> the Bubbles mood (src/ui/Bubbles.js: normal happy angry shout think whisper scared excited sad)
const MOOD_OF = { say: 'normal', shout: 'shout', angry: 'angry', whisper: 'whisper', scared: 'scared', happy: 'happy', laugh: 'excited', excited: 'excited', sad: 'sad', think: 'think', radio: 'normal', spooky: 'whisper', gold: 'excited' };
const VOICES = new Set(['fox', 'bear', 'cub', 'ceo', 'otter', 'duck', 'turtle']);
const bubbleVoice = (who) => (VOICES.has(who?.voice) ? who.voice : who?.kind === 'fox' ? 'fox' : 'bear');
// a voice with no body on screen (the CEO on the phone, Reynard narrating a shot) talks from the
// top of the screen, with its name in front of the line
function bubbleAnchor(who, tall = false) {
  // (a question with reply buttons is a tall bubble: it hangs from lower down so it stays on screen)
  if (who?.kind === 'spot') return () => ({ x: Math.round(innerWidth / 2), y: Math.round(innerHeight * (tall ? 0.5 : 0.3)), visible: true });
  return who;
}
const bubbleText = (who, text) => {
  const t = String(text).replace(/<\/?b>/g, '*'); // bubbles emphasise with *word*
  return who?.kind === 'spot' && who.name ? `*${who.name}:* ${t}` : t;
};

// ------------------------------------------------------------------ actors
// a bear on the stage: a real rig, walked and posed by the scene (not a customer: no AI, no review)
export class StageBear {
  constructor(game, type, { at = [HUT.x + 4, HUT.z + 6], heading = 0, name, seed, scale } = {}) {
    this.game = game;
    this.kind = 'bear';
    this.type = BEAR_TYPES[type] ? type : 'office';
    const def0 = BEAR_TYPES[this.type];
    const s = seed ?? ((Math.random() * 4294967296) >>> 0);
    this.look = makeBearLook(this.type, def0, s);
    this.def = lookDef(def0, this.look);
    this.rig = new BearRig(this.type, this.def);
    try { this.rig.personalize(s * 7.31); } catch { /* */ }
    if (scale) this.rig.root.scale.multiplyScalar(scale);
    this.scaleK = scale || 1;
    game.scene.add(this.rig.root);
    this.x = at[0]; this.z = at[1];
    this.y = this.groundY();
    this.heading = heading;
    this.pose = 'idle';
    this.poseT = 0;
    this.oneShot = null;
    this.walk = null;
    this.faceTo = null;
    this.spd = 0;
    this.name = name || FIRST_NAMES[s % FIRST_NAMES.length];
    this.color = CAST_COLOR[this.type] || CAST_COLOR.bear;
    this.voice = VOICE_OF[this.type] || 'bear';
    this.removed = false;
  }
  groundY() {
    const g = this.game.grid;
    try {
      const tx = Math.floor(this.x), tz = Math.floor(this.z);
      const y = g.surfaceY(tx, tz);
      return g.isWater?.(tx, tz) ? y - 0.35 : y;
    } catch { return 0; }
  }
  get headY() { return this.y + 2.15 * (this.def.scale || 1) * this.scaleK; }
  /** [v31 dialogue] the dialogue box portrait: a render of this very bear */
  portrait(expr) { return { who: 'bear', type: this.type, def: this.def, ...(expr ? { expr } : {}) }; }
  getWorldPos(v) { return v.set(this.x, this.headY, this.z); }
  walkTo(x, z, { run = false, speed } = {}) {
    this.walk?.res?.(false);
    if (this.dir?.skipped) { this.x = x; this.z = z; this.walk = null; return Promise.resolve(true); } // a skipped scene doesn't wait for legs
    return new Promise((res) => { this.walk = { x, z, speed: speed || (run ? 4.2 : 1.8), run, res }; });
  }
  /** a pose for a while (one-shots end by themselves) */
  act(pose, secs = 1.2) { this.oneShot = { pose, t: secs }; this.poseT = 0; }
  hold(pose) { this.pose = pose; this.oneShot = null; }
  face(expr, hold = 2) { try { this.rig.setFace?.(expr, { hold }); } catch { /* */ } }
  lookAt(x, z) { this.faceTo = Math.atan2(z - this.z, x - this.x); }
  update(dt) {
    if (this.removed) return;
    let moving = false;
    const w = this.walk;
    if (w) {
      const dx = w.x - this.x, dz = w.z - this.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, w.speed * dt);
      if (d > 0.05) {
        this.x += (dx / d) * step; this.z += (dz / d) * step;
        this.heading += angleDiff(this.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 9);
        moving = true;
      }
      if (d - step <= 0.05) { this.walk = null; w.res?.(true); }
    } else if (this.faceTo != null) {
      this.heading += angleDiff(this.heading, this.faceTo) * Math.min(1, dt * 7);
    }
    this.y = damp(this.y, this.groundY(), 12, dt);
    this.spd = damp(this.spd, moving ? w.speed : 0, 10, dt);
    let pose = this.pose;
    if (moving) pose = w.run ? 'run' : 'walk';
    else if (this.oneShot) { this.oneShot.t -= dt; pose = this.oneShot.pose; if (this.oneShot.t <= 0) this.oneShot = null; }
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.set(0, Math.PI / 2 - this.heading, 0);
    try { r.pose(pose, dt, { speed: moving ? this.spd : 0, inWater: false }); r.update?.(dt); } catch { /* */ }
  }
  dispose() {
    if (this.removed) return;
    this.removed = true;
    this.walk?.res?.(false);
    this.game.scene.remove(this.rig.root);
    try { this.rig.ownMat?.dispose?.(); } catch { /* */ }
  }
}

// Reynard as an actor (game.fox, directed through fox.cine)
class FoxActor {
  constructor(game) { this.game = game; this.kind = 'fox'; this.name = 'Reynard'; this.color = CAST_COLOR.fox; this.voice = 'fox'; }
  get f() { return this.game.fox; }
  get x() { return this.f.x; }
  get z() { return this.f.z; }
  get y() { return this.f.y; }
  get headY() { return this.f.y + 1.75; }
  getWorldPos(v) { return v.set(this.f.x, this.f.y + 1.75, this.f.z); }
  portrait() { return { who: 'fox' }; }
  take() { this.f.cine ||= { anim: null, face: null }; this.f.target = null; this.f.mood = 'idle'; }
  release() { if (this.f) { this.f.cine = null; this.f.anim = null; } }
  act(anim, secs) {
    this.take();
    this.f.cine.anim = anim;
    if (secs) { const tok = (this._tok = (this._tok || 0) + 1); setTimeout(() => { if (this._tok === tok && this.f.cine) this.f.cine.anim = null; }, secs * 1000); }
  }
  hold(anim) { this.take(); this.f.cine.anim = anim; this._tok = (this._tok || 0) + 1; }
  lookAt(x, z) { this.take(); this.f.cine.face = Math.atan2(z - this.f.z, x - this.f.x); }
  face() { /* the fox rig picks its expression from the animation */ }
  walkTo(x, z) {
    this.take();
    this.f.cine.anim = null;
    this.f.target = { x, z };
    return new Promise((res) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.game.director?.skipped && this.f.target) { this.f.x = x; this.f.z = z; this.f.target = null; }
        if (!this.f.target || performance.now() - t0 > 9000) return res(true);
        setTimeout(tick, 60);
      };
      tick();
    });
  }
  place(x, z, heading) { this.f.x = x; this.f.z = z; if (heading != null) this.f.heading = heading; }
}

// a point that can speak (the office tower on the phone, a voice off screen)
export const spot = (x, y, z, name, color, voice) => ({
  kind: 'spot', x, y, z, name, color, voice, getWorldPos: (v) => v.set(x, y, z), act() {}, hold() {}, lookAt() {}, face() {},
  // [v31 dialogue] who's talking: Reynard off screen, or the CEO on the phone
  portrait: (expr) => (voice === 'fox' ? { who: 'fox' } : voice === 'ceo' ? { who: 'bear', type: 'ceo', ...(expr ? { expr } : {}) } : voice === 'bear' ? { who: 'bear', type: 'office' } : null),
});

// ------------------------------------------------------------------ the director
export class Director {
  constructor(game) {
    this.game = game;
    bindFloat(game);
    this.active = false;
    this.queueList = [];
    this.actors = [];
    this.checkT = 1;
    this.fox = new FoxActor(game);
    this._onKey = (e) => this.onKey(e);
    this._onPtr = (e) => this.onPtr(e);
  }

  get busy() { return this.active; }

  /** may a queued scene start now? */
  quiet() {
    const g = this.game, st = g.state;
    if (g.titleMode || !g.started) return false;
    if (g.tutorial?.active || g.cutscene?.active || g.cine?.active || g.lab?.active || g.classroom?.active || g.homes?.active) return false;
    if (g.ui?.panel || document.querySelector('#ui .modal-wrap:not(.hidden)') || document.body.classList.contains('lab-mode') || document.body.classList.contains('pc-mode')) return false;
    if (g.bossFight?.active || g.bloodMoon?.active) return false;
    if (st.phase !== 'day' && st.phase !== 'morning') return false;
    if (g.lessons?.busy || g.npcScenes?.busy || g.pipVisit?.busy) return false;
    if (questToastBusy()) return false; // let the notebook's news finish first
    return true;
  }

  queue(fn, opts = {}) {
    if (opts.id && this.queueList.some((q) => q.opts.id === opts.id)) return;
    this.queueList.push({ fn, opts });
  }

  update(dt) {
    for (const a of this.actors) a.update?.(dt);
    if (this.words?.length) this.words = this.words.filter((w) => w.update(Math.min(0.1, dt))); // [v32 cine]
    if (this.active || !this.queueList.length) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.8;
    if (!this.quiet()) return;
    const q = this.queueList.shift();
    this.play(q.fn, q.opts).catch((e) => console.warn('[director]', e));
  }

  // ---------------------------------------------------------------- running a scene
  async play(fn, { pause = true, skippable = true, bars = true, id = null } = {}) {
    if (this.active) { this.queue(fn, { pause, skippable, bars, id }); return false; }
    const g = this.game, rig = g.rig;
    this.active = true;
    this.skipped = false;
    this.adv = null;
    this.sceneId = id;
    this.center = null;
    const saved = {
      paused: g.state.paused, locked: g.inputLocked, x: rig.goal.x, y: rig.goal.y, z: rig.goal.z, wupp: rig.wuppGoal, yaw: rig.yawGoal,
      pitch: rig.pitchGoal, follow: rig.follow, free: rig.freeBounds, csActive: g.cutscene?.active,
    };
    if (pause) g.state.paused = true;
    g.inputLocked = true;
    rig.follow = null;
    rig.freeBounds = true;
    if (g.cutscene) g.cutscene.active = true; // other systems hold their own scenes while this one runs
    g.ui?.closePanel?.();
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('pointerdown', this._onPtr, true);
    this.showSkip(skippable);
    const c = this.ctx();
    let ok = true;
    try {
      if (bars) await c.bars(true);
      await fn(c);
    } catch (e) {
      ok = false;
      console.warn('[director] scene', id, e);
    } finally {
      window.removeEventListener('keydown', this._onKey, true);
      window.removeEventListener('pointerdown', this._onPtr, true);
      this.showSkip(false);
      clearFloats((it) => it.cine);
      g.ui?.bubbles?.clear?.((b) => b.key === 'cine' || b.key === 'cinebark');
      for (const w of this.words || []) if (w.scene) w.dismiss(); // [v32 cine] a scene's 3D words fly off with it
      for (const a of this.actors.slice()) if (!a.keep) a.dispose?.();
      this.actors = this.actors.filter((a) => a.keep && !a.removed);
      this.fox.release();
      g.timeScale = 1;
      document.body.classList.remove('cutscene-on');
      if (!g.cine?.active) document.body.classList.remove('cine');
      g.ui?.hud?.cineui?.classList?.add?.('hidden');
      rig.goal.set(saved.x, saved.y || 0, saved.z);
      rig.wuppGoal = saved.wupp;
      rig.yawGoal = saved.yaw;
      if (saved.pitch != null && rig.pitchGoal != null) rig.pitchGoal = saved.pitch;
      rig.follow = saved.follow;
      rig.freeBounds = saved.free;
      rig.clampGoal?.();
      g.state.paused = saved.paused;
      g.inputLocked = saved.locked;
      if (g.cutscene) g.cutscene.active = !!saved.csActive;
      this.active = false;
      this.sceneId = null;
      g.emit?.('sceneEnd', { id, skipped: this.skipped });
    }
    return ok;
  }

  /** [v32 cine] floating 3D voxel words in the world (src/game/cine/words3d.js): returns the word */
  words3d(text, opts = {}) {
    try {
      const w = new Words3D(this.game, text, opts);
      (this.words ||= []).push(w);
      return w;
    } catch (e) { console.warn('[words3d]', e); return null; }
  }

  showSkip(on) {
    let b = this.skipEl;
    if (!b && on) {
      b = this.skipEl = document.createElement('button');
      b.type = 'button';
      b.className = 'dir-skip';
      b.textContent = 'SKIP ▸▸';
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.skip(); }, true);
      document.body.appendChild(b);
      if (!document.getElementById('dir-skip-css')) {
        const st = document.createElement('style');
        st.id = 'dir-skip-css';
        st.textContent = `.dir-skip{position:fixed;right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(11vh + 10px);z-index:74;pointer-events:auto;cursor:pointer;
          font-family:var(--font-title);font-size:18px;color:#fff6e4;background:#1a1420;border:3px solid #fff6e4;box-shadow:3px 3px 0 #000;padding:2px 10px 4px;image-rendering:pixelated;opacity:.85}
          .dir-skip:hover{opacity:1;transform:translateY(-1px)} .dir-skip:active{transform:translateY(1px);box-shadow:1px 1px 0 #000}`;
        document.head.appendChild(st);
      }
    }
    if (b) b.style.display = on ? '' : 'none';
  }

  skip() {
    if (!this.active || this.skipped) return;
    this.skipped = true;
    // walkers arrive at once
    for (const a of this.actors) if (a.walk) { const w = a.walk; a.x = w.x; a.z = w.z; a.walk = null; w.res?.(true); }
    skipAllFloats();
    clearFloats((it) => it.cine);
    try { this.game.audio?.stopBabble?.(); } catch { /* */ }
    this.adv?.();
  }
  onKey(e) {
    if (!this.active) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.skip(); return; }
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'e' || e.key === 'E') { e.preventDefault(); e.stopPropagation(); this.adv?.(); }
  }
  onPtr(e) {
    if (!this.active) return;
    if (e.target?.closest?.('.dir-skip, .bb-pill, .tut-skiptag, .tut-choice')) return; // [v32 cine] reply buttons take their own clicks // [v33 tut] + the tour's SKIP tag and its planks
    e.stopPropagation();
    this.adv?.();
  }

  // ---------------------------------------------------------------- the script's toolbox
  ctx() {
    const D = this, g = this.game, rig = g.rig;
    const live = () => !D.skipped;
    const c = {
      game: g,
      fox: D.fox,
      get skipped() { return D.skipped; },
      wait: (s) => (live() ? Promise.race([wait(s), new Promise((r) => { const prev = D.adv; D.adv = () => { prev?.(); r(); }; })]) : Promise.resolve()),
      /** pure wait that taps don't cut short */
      beat: (s) => (live() ? wait(s) : Promise.resolve()),
      sfx: (n, o) => { if (live()) g.audio?.play?.(n, { volume: 0.5, ...(o || {}) }); },
      shake: (a = 0.4) => { if (live()) rig.shake = Math.max(rig.shake || 0, a); },
      slowmo: (k = 0.3) => { g.timeScale = k; },
      fx: (name, ...args) => { if (!live()) return; try { g.particles?.[name]?.(...args); } catch { /* */ } },
      /** the two-shot's middle: lines drift the camera a little toward whoever speaks */
      center: (x, z) => { D.center = x == null ? null : { x, z }; },
      bars: async (on) => {
        document.body.classList.toggle('cine', on);
        document.body.classList.toggle('cutscene-on', on);
        if (on) await wait(0.35);
      },
      /** a bear actor */
      bear: (type, o) => { const b = new StageBear(g, type, o); b.dir = D; D.actors.push(b); return b; },
      spot,
      /** frame an actor or a point: zoom = world units per pixel (smaller = closer) */
      shot: (who, { zoom = 0.02, yaw, dur = 1.1, cut = false, dx = 0, dz = 0, ease: ez = 'inout', lift = 0 } = {}) => {
        const at = () => {
          if (!who) return { x: rig.goal.x, z: rig.goal.z };
          if (Array.isArray(who)) return { x: who[0], z: who[1] };
          return { x: who.x + dx, z: who.z + dz };
        };
        const p0 = at();
        const from = { x: rig.goal.x, z: rig.goal.z, y: rig.goal.y || 0, wupp: rig.wuppGoal, yaw: rig.yawGoal };
        const ty = lift;
        if (cut || !live()) {
          rig.goal.set(p0.x, ty, p0.z); rig.target?.copy?.(rig.goal);
          rig.wupp = rig.wuppGoal = zoom;
          if (yaw != null) rig.yaw = rig.yawGoal = yaw;
          return Promise.resolve();
        }
        const E = ease[ez] || ease.inout;
        const t0 = performance.now();
        return new Promise((res) => {
          const step = () => {
            const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
            const e = E(k);
            const p = at();
            rig.goal.x = from.x + (p.x - from.x) * e;
            rig.goal.z = from.z + (p.z - from.z) * e;
            rig.goal.y = from.y + (ty - from.y) * e;
            rig.wuppGoal = from.wupp + (zoom - from.wupp) * e;
            if (yaw != null) rig.yawGoal = from.yaw + angleDiff(from.yaw, yaw) * e;
            if (k >= 1 || D.skipped) res(); else requestAnimationFrame(step);
          };
          step();
          setTimeout(res, dur * 1000 + 500);
        });
      },
      /** keep the camera on a moving actor until the returned stop() */
      follow: (who, { zoom } = {}) => {
        let on = true;
        if (zoom) rig.wuppGoal = zoom;
        const step = () => { if (!on || !D.active) return; rig.goal.x = damp(rig.goal.x, who.x, 6, 1 / 60); rig.goal.z = damp(rig.goal.z, who.z, 6, 1 / 60); requestAnimationFrame(step); };
        step();
        return () => { on = false; };
      },
      /** slow push-in during a line (dramatic beats) */
      push: (k = 0.85, dur = 2) => {
        if (!live()) return;
        const z0 = rig.wuppGoal, z1 = z0 * k, t0 = performance.now();
        const step = () => { const t = Math.min(1, (performance.now() - t0) / (dur * 1000)); rig.wuppGoal = z0 + (z1 - z0) * ease.out(t); if (t < 1 && D.active && !D.skipped) requestAnimationFrame(step); };
        step();
      },
      /**
       * a line of dialogue by `who`, in the kinetic text. Waits for a tap (or `auto` seconds).
       *   style  say | shout | whisper | scared | happy | laugh | excited | angry | sad | think | radio | spooky | gold
       *   anim   the speaker's animation while talking (fox anims / bear poses), face: a bear face
       */
      say: async (who, text, { style = 'say', anim, face, auto, ms, shake, sfx, name, close } = {}) => {
        if (!live()) return;
        const isFox = who === D.fox || who?.kind === 'fox';
        const talkAnim = anim || (isFox ? (style === 'shout' || style === 'angry' ? 'angry_stomp' : style === 'think' ? 'think' : style === 'laugh' ? 'laugh_evil' : style === 'scared' ? 'cower' : 'talk') : (style === 'shout' || style === 'angry' ? 'roar' : style === 'happy' || style === 'excited' || style === 'laugh' ? 'cheer' : style === 'sad' ? 'sad' : 'talk'));
        if (who?.act) {
          if (isFox) who.hold(talkAnim);
          else who.act(talkAnim, 99);
        }
        if (face && who?.face) who.face(face, 3);
        // [v32 cine] close: a close-up on the speaker (zoom in world units per px; shouts push in harder)
        if (close && typeof who?.x === 'number' && who.kind !== 'spot') {
          const zc = typeof close === 'number' ? close : 0.0105;
          const hard = style === 'shout' || style === 'angry';
          const dx = D.center ? (D.center.x - who.x) * 0.18 : 0, dz = D.center ? (D.center.z - who.z) * 0.18 : 0;
          c.shot([who.x + dx, who.z + dz], { zoom: hard ? zc * 0.8 : zc, dur: hard ? 0.35 : 0.8, ease: 'out', lift: (typeof who.y === 'number' ? who.y : 0) + 0.55 });
        } else
        // shot / reverse shot: the frame leans toward the speaker
        if (D.center && typeof who?.x === 'number' && who.kind !== 'spot') {
          const C0 = D.center;
          c.shot([C0.x + (who.x - C0.x) * 0.38, C0.z + (who.z - C0.z) * 0.38], { zoom: rig.wuppGoal, dur: 0.9, ease: 'out', lift: rig.goal.y || 0 });
        }
        if (shake) c.shake(shake);
        if (sfx) c.sfx(sfx);
        // the game's own comic speech bubble over whoever talks (a voice off screen: top of the screen)
        const h = g.say(bubbleAnchor(who), bubbleText(who, text), { voice: style === 'think' ? null : bubbleVoice(who), mood: MOOD_OF[style] || 'normal', wait: true, key: 'cine', size: style === 'whisper' ? 's' : 'm' });
        if (!h) return;
        // a tap types the rest, the next tap moves on (the bubble's own advance)
        await new Promise((res) => {
          let over = false;
          const finish = () => { if (!over) { over = true; res(); } };
          h.done.then(finish);
          const adv = () => {
            if (D.skipped) { h.close(); finish(); return; }
            const B = g.ui?.bubbles, b = B?.list?.find((x) => x.handle === h);
            if (b && B._advance) B._advance(b); else { h.close(); finish(); }
          };
          D.adv = adv;
          if (auto != null) setTimeout(() => { if (D.adv === adv) { h.close(); finish(); } }, auto * 1000);
        });
        D.adv = null;
        if (who?.act && !isFox) who.oneShot = null;
        if (isFox) who.hold(null);
        await wait(ms ?? 0.12);
      },
      /** a line that doesn't wait (barks over action): a short comic bubble */
      bark: (who, text, { style = 'say', ms = 1.8 } = {}) => {
        if (!live()) return null;
        return g.say(bubbleAnchor(who), bubbleText(who, text), { voice: bubbleVoice(who), mood: MOOD_OF[style] || 'normal', dur: ms, key: 'cinebark', size: 's' });
      },
      title: (o) => (live() ? floatTitle({ cine: true, ...o }) : null),
      /**
       * [v32 cine] floating 3D voxel words in the world. at: [x, z] | actor | { x, y, z }; y: height above
       * the ground (default 2.4); pal: gold | red | green | blue | amber | white | pink; ms; hold
       */
      words3d: (text, { at, y = 2.4, ...o } = {}) => {
        if (!live()) return null;
        let pos;
        if (Array.isArray(at)) pos = { x: at[0], y: (g.grid?.groundAt?.(at[0], at[1]) || 0) + y, z: at[1] };
        else if (at && typeof at.getWorldPos === 'function') { const v = at.getWorldPos(new (rig.goal.constructor)()); pos = { x: v.x, y: v.y + y * 0.4, z: v.z }; }
        else if (at && typeof at.x === 'number') pos = { x: at.x, y: at.y ?? y, z: at.z };
        else pos = { x: rig.goal.x, y: (rig.goal.y || 0) + y, z: rig.goal.z };
        const w = D.words3d(text, { at: pos, ...o });
        if (w) w.scene = true;
        return w;
      },
      /**
       * [v32 cine] a question the player answers: a comic bubble with reply buttons (tap one, or press
       * 1-9). Resolves to the chosen value (the first one if the scene is skipped).
       *   const v = await c.ask(c.fox, 'Pop quiz!', [{ label: 'Snacks', value: 'ok' }, ...])
       */
      ask: async (who, text, choices, { style = 'say', anim } = {}) => {
        const first = choices?.[0]?.value;
        if (!live()) return first;
        const isFox = who === D.fox || who?.kind === 'fox';
        if (who?.act) { if (isFox) who.hold(anim || 'talk'); else who.act(anim || 'talk', 99); }
        const h = g.say(bubbleAnchor(who, true), bubbleText(who, text), { voice: bubbleVoice(who), mood: MOOD_OF[style] || 'normal', choices: choices.map((x) => ({ label: x.label, value: x.value, icon: x.icon })), key: 'cine', size: 'm' });
        if (!h) return first;
        D.adv = () => {
          const B = g.ui?.bubbles, b = B?.list?.find((x) => x.handle === h);
          if (D.skipped) { h.close(); return; }
          if (b && !b.typed) B._finishTyping?.(b);
        };
        const v = await h.done;
        D.adv = null;
        if (who?.act && !isFox) who.oneShot = null;
        if (isFox) who.hold(null);
        g.audio?.play?.('click', { volume: 0.4 });
        return v === undefined ? first : v;
      },
      caption: (text, o) => (live() ? floatCaption(text, o) : null),
      /** a big title that waits until it has played */
      card: async (o) => { if (!live()) return; const h = floatTitle({ cine: true, ...o }); await Promise.race([h.done, c.wait((o.ms || 2600) / 1000 + 1.2)]); },
      dip: async (on) => {
        const el = D.dipEl || (D.dipEl = Object.assign(document.createElement('div'), { className: 'dir-dip' }));
        if (!el.isConnected) {
          el.style.cssText = 'position:fixed;inset:0;background:#0b0a10;opacity:0;pointer-events:none;transition:opacity .25s steps(4);z-index:71';
          document.body.appendChild(el);
        }
        el.style.opacity = on ? '1' : '0';
        await wait(0.28);
      },
      /** money, items, unlocks given by a scene */
      give: (R) => { try { g.quests?.pay?.(R); } catch { /* */ } },
      flag: (k, v = true) => { (g.state.flags ||= {})[k] = v; },
      hut: HUT,
      office: OFFICE,
    };
    return c;
  }
}

export { clamp };
