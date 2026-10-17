// [v26 menu] Player settings: one store, applied to the real systems.
//
//   import settings from './ui/settings.js';
//   settings.get('shadows'); settings.set('panSpeed', 1.5);   // persisted + applied at once
//   settings.bind({ audio, renderer, game });                  // main.js: renderer at boot, game once built
//   settings.onChange((key, value) => {});
//   textSpeed()                                                 // typewriter multiplier (Bubbles, teacher)
//
// Stored in localStorage 'tbme.settings.v1'. Sound (music / sfx / ambience volume,
// mute) lives in the audio engine's own keys ('tbme.volumes', 'tbme.muted') and the
// pixel size in 'tbme.px' (index.html reads it to paint the first frame at the right
// size), so the in-game sliders and this page never disagree.
//
// What each setting really does:
//   pixel     renderer.pixelDensity (0.7 chunky / 1 / 1.4 fine) + resize
//   shadows   WebGL shadow maps on / off (materials recompiled)
//   glow      the renderer's bloom pass on / off
//   particles particle pool caps x1 / x0.5 / x0.25 (debris, sprites, decals)
//   panSpeed  drag / pinch / WASD pan speed multiplier;  invertDrag  flips the drag
//   rotButtons  the on-screen turn buttons (Q / E still work)
//   textSpeed speech bubble typing speed (slow / normal / fast / instant)
//   reduceMotion  prefers-reduced-motion for every UI module that checks it (read at
//             load by some: full effect after a reload), no camera shake, CSS
//             animations cut short
const KEY = 'tbme.settings.v1';
export const SETTING_DEFAULTS = Object.freeze({
  shadows: true, glow: true, particles: 1, panSpeed: 1, invertDrag: false, rotButtons: true,
  textSpeed: 1, reduceMotion: false, lang: 'en',
});

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }

let S = { ...SETTING_DEFAULTS };
try { const o = JSON.parse(lsGet(KEY) || '{}'); for (const k of Object.keys(S)) if (o && typeof o[k] === typeof S[k]) S[k] = o[k]; } catch { /* defaults */ }

const subs = new Set();
const ctx = { audio: null, renderer: null, game: null };

// ---------------------------------------------------------------- reduce motion
// every module asks matchMedia('(prefers-reduced-motion: reduce)'): answer for them
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia.__tbme) {
  const real = window.matchMedia.bind(window);
  const mm = (q) => {
    const m = real(q);
    if (!S.reduceMotion || !/prefers-reduced-motion\s*:\s*reduce/.test(String(q))) return m;
    return { matches: true, media: m.media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false };
  };
  mm.__tbme = true;
  window.matchMedia = mm;
}

// ---------------------------------------------------------------- apply
function applyBody() {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle('tbme-reduce-motion', !!S.reduceMotion);
  document.body.classList.toggle('tbme-no-rotbtn', !S.rotButtons);
}
if (typeof document !== 'undefined') {
  if (document.body) applyBody(); else document.addEventListener('DOMContentLoaded', applyBody, { once: true });
  // the CSS for the two body classes (tiny; no stylesheet import needed for the boot path)
  const st = document.createElement('style');
  st.id = 'tbme-settings-css';
  st.textContent = `
body.tbme-no-rotbtn .campad .rl, body.tbme-no-rotbtn .campad .rr { display: none !important; }
body.tbme-reduce-motion *, body.tbme-reduce-motion *::before, body.tbme-reduce-motion *::after {
  animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; transition-delay: 0s !important; }`;
  (document.head || document.documentElement).appendChild(st);
}

function applyShadows(first = false) {
  const r = ctx.renderer?.renderer;
  if (!r) return;
  const want = !!S.shadows;
  if (r.shadowMap.enabled === want) return;
  r.shadowMap.enabled = want;
  if (!first && ctx.game?.scene) ctx.game.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
}
function applyRenderer(first = false) {
  const R = ctx.renderer;
  if (!R) return;
  R.bloomOn = !!S.glow;
  applyShadows(first);
}
const POOLS = ['lit', 'glow', 'fx', 'decals'];
function applyParticles() {
  const P = ctx.game?.particles;
  if (!P) return;
  for (const k of POOLS) {
    const pool = P[k];
    if (!pool || typeof pool.max !== 'number') continue;
    pool.__baseMax ??= pool.max;
    pool.max = Math.max(8, Math.floor(pool.__baseMax * (S.particles || 1)));
  }
}
function hookCamera() {
  const rig = ctx.game?.rig;
  if (!rig || rig.__tbmeSettings) return;
  rig.__tbmeSettings = true;
  const proto = Object.getPrototypeOf(rig);
  const pp = proto.panPixels, pr = proto.panRelative;
  if (typeof pp === 'function') rig.panPixels = function (dx, dy, r) { const k = S.panSpeed * (S.invertDrag ? -1 : 1); return pp.call(this, dx * k, dy * k, r); };
  if (typeof pr === 'function') rig.panRelative = function (f, rt) { return pr.call(this, f * S.panSpeed, rt * S.panSpeed); };
  // no camera shake with reduce motion
  let shake = rig.shake || 0;
  try {
    Object.defineProperty(rig, 'shake', { configurable: true, enumerable: true, get: () => shake, set: (v) => { shake = S.reduceMotion ? 0 : v; } });
  } catch { /* leave it */ }
}

function applyKey(k, first = false) {
  if (k === 'shadows' || k === 'glow') applyRenderer(first);
  else if (k === 'particles') applyParticles();
  else if (k === 'reduceMotion' || k === 'rotButtons') { applyBody(); if (S.reduceMotion && ctx.game?.rig) ctx.game.rig.shake = 0; }
}

// ---------------------------------------------------------------- audio + pixel proxies
function volumes() {
  const a = ctx.audio;
  if (a?.getVolumes) return a.getVolumes();
  try { return { master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6, ...(JSON.parse(lsGet('tbme.volumes') || '{}')) }; } catch { return { master: 0.8, sfx: 0.9, music: 0.5, ambience: 0.6 }; }
}

const settings = {
  get(k) {
    if (k === 'music' || k === 'sfx' || k === 'ambience' || k === 'master') return volumes()[k];
    if (k === 'muted') return ctx.audio?.isMuted ? !!ctx.audio.isMuted() : lsGet('tbme.muted') === '1';
    if (k === 'pixel') return ctx.renderer?.pixelDensity || +lsGet('tbme.px') || 1;
    if (k === 'fullscreen') return typeof document !== 'undefined' && !!document.fullscreenElement;
    return S[k];
  },
  set(k, v) {
    if (k === 'music' || k === 'sfx' || k === 'ambience' || k === 'master') { ctx.audio?.setVolumes?.({ [k]: +v }); }
    else if (k === 'muted') { ctx.audio?.unlock?.(); ctx.audio?.setMuted?.(!!v); }
    else if (k === 'pixel') {
      lsSet('tbme.px', String(v));
      if (ctx.renderer) { ctx.renderer.pixelDensity = +v; (ctx.game?.resize || ctx.resize)?.(); }
    } else if (k === 'fullscreen') {
      try {
        if (v && !document.fullscreenElement) document.documentElement.requestFullscreen?.()?.catch?.(() => {});
        else if (!v && document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
      } catch { /* not allowed here */ }
    } else if (k in SETTING_DEFAULTS) {
      S[k] = v;
      lsSet(KEY, JSON.stringify(S));
      applyKey(k);
    }
    for (const fn of subs) { try { fn(k, v); } catch (e) { console.warn(e); } }
  },
  all() { return { ...S, music: this.get('music'), sfx: this.get('sfx'), ambience: this.get('ambience'), muted: this.get('muted'), pixel: this.get('pixel') }; },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  /** hand over the systems to drive: { audio, renderer, resize, game } (any subset, any time) */
  bind(o = {}) {
    const first = !ctx.renderer && o.renderer;
    Object.assign(ctx, Object.fromEntries(Object.entries(o).filter(([, v]) => v)));
    if (o.renderer) applyRenderer(first);
    if (o.game) { applyParticles(); hookCamera(); applyRenderer(false); }
    applyBody();
  },
  get game() { return ctx.game; },
  /** every tip and every one of Reynard's lessons comes back: the running game and every save slot */
  resetTutorials(slotKeys = []) {
    const clear = (st) => {
      if (!st) return;
      st.tips = {};
      if (st.lessons) { st.lessons.seen = []; st.lessons.queue = []; st.lessons.last = -99; }
    };
    const g = ctx.game;
    if (g?.started && g.state) { clear(g.state); try { g.save(); } catch { /* ignore */ } }
    let n = 0;
    for (const key of slotKeys) {
      if (g?.started && key === g.saveKey) { n++; continue; }
      const raw = lsGet(key);
      if (!raw) continue;
      try { const d = JSON.parse(raw); clear(d.state); lsSet(key, JSON.stringify(d)); n++; } catch { /* leave it */ }
    }
    return n;
  },
};

/** typewriter speed multiplier for speech bubbles (Infinity-ish = instant) */
export function textSpeed() { return S.textSpeed || 1; }
if (typeof window !== 'undefined') window.__settings = settings;
export default settings;
