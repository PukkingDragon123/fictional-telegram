// In-page shot director for the promo video + trailer (tools/video/render.mjs drives it).
//
//   const D = await import('/tools/video/director.js');
//   await D.setup('shots_promo', 'pip_intro', params);   // stage the shot in the live game
//   ...__vclock.start()...
//   D.frame(i); await __vclock.tick(1000 / 30); <screenshot>   // per frame
//   D.log()                                                   // { audio: [...], meta }
//
// A shot module (tools/video/shots_*.js) exports SHOTS = { name: { dur, async setup(c), update?(c, t, dt) } }.
// `c` (the shot context, see Ctx below) has the game, cue scheduling (c.at), camera helpers,
// actors, speech bubbles, the title-card overlay and the audio log (every game SFX / babble
// with its time, plus external SFX cues for the mix).
import * as THREE from 'three';
import { Overlay } from './overlay.js';

const W = window;
export const D = (W.__dir ||= { audio: [], shot: null, ctx: null });
export const FPS = 30;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
export const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
export const easeIn = (x) => clamp(x, 0, 1) ** 3;
export const D2R = Math.PI / 180;

// ------------------------------------------------------------------ CSS: hide the game UI, keep the bubbles
const CSS = `
body.vid-noui #ui > *:not(.bb-layer):not(.vid-keep),
body.vid-noui > *:not(#game):not(#ui):not(#vid-ov):not(.vid-keep):not(.bt-black):not(.bt-iris) { opacity: 0 !important; visibility: hidden !important; transition: none !important; animation: none !important; }
body.vid-noui .vid-keep { opacity: 1 !important; visibility: visible !important; }
body.vid-nocursor * { cursor: none !important; }
#vid-ov { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; overflow: hidden; }
`;
function installCSS() {
  if (document.getElementById('vid-css')) return;
  const s = document.createElement('style');
  s.id = 'vid-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------ audio log
// Wraps the audio proxy so every play() / babble() is recorded with its time
// (seconds since the shot's frame 0). The live AudioContext stays locked (silent):
// tools/video/sfx.mjs renders the log offline with the game's own synth.
function hookAudio(game) {
  const A = game.audio;
  if (A.__vidHooked) return;
  A.__vidHooked = true;
  const now = () => (D.t0 == null ? -1 : (performance.now() - D.t0) / 1000);
  const play = A.play, babble = A.babble;
  A.play = (name, o = {}) => {
    if (D.t0 != null && !D.muteGame) D.audio.push({ t: +now().toFixed(4), kind: 'sfx', name, vol: o.volume ?? 1, pitch: o.pitch ?? 1, pan: o.pan ?? 0, delay: o.delay ?? 0 });
    return play.call(A, name, o);
  };
  A.babble = (voice, text, o = {}) => {
    if (D.t0 != null && !D.muteGame && !D.noVoice) D.audio.push({ t: +now().toFixed(4), kind: 'babble', voice, text: String(text), vol: o.volume ?? 1, pitch: o.pitch ?? 1, cps: o.cps ?? 16 });
    return babble.call(A, voice, text, o);
  };
}

// ------------------------------------------------------------------ camera
// Sets the rig exactly (no damping): x/z/y focus, yaw (rad), pitch (deg), wupp (world units / low-res px).
export function setCam(rig, { x, z, y = 0, yaw = 0, pitch = 40, wupp = 0.03, dist = null }) {
  rig.freeBounds = true; rig.follow = null; rig.hardBounds = null; rig.viewHalfMax = 0;
  rig.goal.set(x, y, z); rig.target.copy(rig.goal);
  rig.yaw = rig.yawGoal = yaw;
  rig.pitch = rig.pitchGoal = pitch * D2R;
  rig.minWupp = 0.0002; rig.maxWupp = 2;
  rig.wupp = rig.wuppGoal = wupp;
  if (dist != null) rig.dist = dist;
  rig.shake = 0;
}
// keyframed camera path: keys = [{ t, x, z, y?, yaw, pitch, wupp, ease? }], interpolated with
// smootherstep per segment (wupp in log space, yaw shortest way)
export function camAt(keys, t) {
  if (t <= keys[0].t) return { ...keys[0] };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { ...last };
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const u0 = (t - a.t) / (b.t - a.t);
  const e = b.ease || 'smooth';
  const u = e === 'linear' ? u0 : e === 'in' ? easeIn(u0) : e === 'out' ? easeOut(u0) : e === 'expo' ? (2 ** (10 * u0) - 1) / 1023 : smoother(u0);
  let dy = (b.yaw ?? 0) - (a.yaw ?? 0);
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return {
    x: lerp(a.x, b.x, u), z: lerp(a.z, b.z, u), y: lerp(a.y ?? 0, b.y ?? 0, u),
    yaw: (a.yaw ?? 0) + dy * u, pitch: lerp(a.pitch, b.pitch, u),
    wupp: Math.exp(lerp(Math.log(a.wupp), Math.log(b.wupp), u)),
  };
}

// lift a game UI element (e.g. the big clock) out of the hidden HUD, styled `css`
export function keepUI(sel, css = {}) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) { console.warn('[dir] no UI element', sel); return null; }
  document.body.appendChild(el);
  el.classList.add('vid-keep');
  Object.assign(el.style, css);
  return el;
}

// bigger speech bubbles for video (art-pixel scale; the game uses 2). Affects bubbles created afterwards.
export function bubbleScale(game, s = 3) {
  const B = game.ui?.bubbles;
  if (!B) return;
  B.S = s;
  B.layer.style.setProperty('--px', s + 'px');
}

// ------------------------------------------------------------------ the shot context
class Ctx {
  constructor(game, shot, params) {
    this.game = game;
    this.g = game;
    this.shot = shot;
    this.p = params || {};
    this.dur = shot.dur;
    this.cues = [];
    this.updaters = [];
    this.actors = [];
    this.t = 0;
    this.ov = new Overlay(document.getElementById('vid-ov'));
    this.THREE = THREE;
  }
  // run fn once when the shot clock reaches t
  at(t, fn) { this.cues.push({ t, fn, done: false }); this.cues.sort((a, b) => a.t - b.t); return this; }
  // run fn(t, dt) every frame (before the game updates)
  every(fn) { this.updaters.push(fn); return this; }
  // an external SFX for the mix (files in promo/video/sfx-lib, see tools/video/mix.py)
  sfx(name, o = {}) { D.audio.push({ t: +(this.t + (o.delay || 0)).toFixed(4), kind: 'ext', name, vol: o.vol ?? 1, rate: o.rate ?? 1 }); }
  // a game SFX rendered with the game's synth (logged directly, the live context is locked)
  gsfx(name, o = {}) { this.game.audio.play(name, o); }
  cam(o) { setCam(this.game.rig, o); }
  path(keys) { this.every((t) => this.cam(camAt(keys, t))); return this; }
  // speech bubble above an anchor ({ getWorldPos } | Vector3 | () => vec)
  say(anchor, text, o = {}) { return this.game.say(anchor, text, { size: 'm', ...o }); }
  // anchor above a rig root (h = height above its feet, world units)
  above(obj, h = 1.6) {
    const root = obj.root || obj;
    return { getWorldPos: (p) => { root.getWorldPosition(p); p.y += h * (root.scale?.y || 1); return p; } };
  }
  noUI(on = true) { document.body.classList.toggle('vid-noui', on); }
  bubbles(s = 3) { bubbleScale(this.game, s); }
  // no speech bubbles at all (and so no babble voices): the game's bubble layer answers with a dummy
  noTalk() {
    const B = this.game.ui?.bubbles;
    if (B) { B.say = () => ({ done: Promise.resolve(), close() {}, setText() {}, el: document.createElement('div') }); B.clear?.(); }
    if (this.game.ui) this.game.ui.bearSay = () => {};
    D.noVoice = true;
  }
  // keep the villagers' random chatter out of the shot
  quietVillagers() { for (const v of this.game.villagers?.list || []) v.t = 1e9; }
  ground(x, z) { return this.game.grid.groundAt(x, z); }
  // step the simulation (no rendering) before frame 0
  presim(sec, dt = 1 / 30) { const g = this.game; for (let t = 0; t < sec; t += dt) { g.update(dt); g.ui?.update?.(dt); } }
}

// ------------------------------------------------------------------ driver
export async function setup(modName, shotName, params = {}) {
  installCSS();
  let ov = document.getElementById('vid-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'vid-ov'; document.body.appendChild(ov); }
  document.body.classList.add('vid-nocursor');
  const game = W.__game;
  hookAudio(game);
  // preview renders skip the GPU work on frames that are not captured
  const R = game.renderer;
  if (!R.__vidWrapped) {
    const r0 = R.render.bind(R); R.render = (...a) => { if (!D.skipRender) r0(...a); };
    const f0 = R.setFogEnabled.bind(R); R.setFogEnabled = (on) => f0(on && !D.noFog); // the zones' fog banks: off unless a shot wants them
    R.__vidWrapped = true;
  }
  D.noFog = true;
  const mod = await import(`/tools/video/${modName}.js`);
  const shot = mod.SHOTS[shotName];
  if (!shot) throw new Error('no shot ' + shotName);
  const c = new Ctx(game, shot, params);
  D.ctx = c; D.shot = shot; D.audio = []; D.t0 = null; D.name = shotName;
  try { await document.fonts.load('62px "TBME Title"'); } catch { /* ignore */ }
  await shot.setup(c);
  return { dur: c.dur, frames: Math.round(c.dur * FPS) };
}

// call right after __vclock.start(): the shot clock starts here
// (frame i's screenshot shows the game after tick i, i.e. at t0 + (i + 1) / FPS: shift the log by one frame)
export function start() { D.t0 = performance.now() + 1000 / FPS; return D.t0; }

export function frame(i) {
  const c = D.ctx;
  const t = i / FPS, dt = 1 / FPS;
  c.t = t;
  for (const q of c.cues) {
    if (q.done || q.t > t + 1e-6) continue;
    q.done = true;
    try { q.fn(c, t); } catch (e) { console.error('[dir] cue', q.t, e); }
  }
  for (const f of c.updaters) { try { f(t, dt, c); } catch (e) { console.error('[dir] updater', e); } }
  try { c.shot.update?.(c, t, dt); } catch (e) { console.error('[dir] update', e); }
  c.ov.update(t);
  return t;
}

export function log() { return { name: D.name, dur: D.ctx?.dur, audio: D.audio }; }
