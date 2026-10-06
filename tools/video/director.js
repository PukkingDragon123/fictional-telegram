// Gig video director: plays a timeline of recorded clips (tools/video/clips/<name>/fNNNN.jpg)
// on a background canvas and drives the game's own UI over it: Reynard climbing into
// the corner (FoxNotifier) with speech bubbles + babble (Bubbles), the chunky pixel
// wipes (Transition), the "new area" scroll (ZoneBanner), the parcel unboxing (Unbox)
// and paper stamps. Runs under virtual time (vtime.js): capture.mjs calls
// window.__dir.frame(i) and screenshots after each one.
// Every sound the timeline makes is logged to window.__audioLog (virtual seconds) and
// mixed offline afterwards (mix.js).
import '../../src/ui/fonts.css';
import { Bubbles } from '../../src/ui/Bubbles.js';
import { FoxNotifier } from '../../src/ui/FoxNotifier.js';
import { Transition } from '../../src/ui/Transition.js';
import { showZoneBanner } from '../../src/ui/ZoneBanner.js';
import { playUnbox } from '../../src/ui/Unbox.js';
import { injectPaperCSS } from '../../src/ui/paper.js';
import audio from '../../src/audio/audio.js';
import { TIMELINES, FPS } from './timeline.js';
import * as FX from './overlays.js';

const Q = new URLSearchParams(location.search);
const TL = TIMELINES[Q.get('tl') || 'main'];
const W = 1280, H = 720;
const bg = document.getElementById('bg');
const g = bg.getContext('2d');
const ui = document.getElementById('ui');
injectPaperCSS();

// ---------------------------------------------------------------- sound log
const LOG = (window.__audioLog = []);
const now = () => performance.now() / 1000;
const sfx = (name, o = {}) => { LOG.push({ t: now(), kind: 'sfx', name, volume: o.volume ?? 0.5, pitch: o.pitch ?? 1 }); };
const CPS = 24; // a touch quicker than in-game chatter
const babble = (voice, text, o = {}) => {
  let d = 0;
  o = { cps: CPS, ...o };
  try { d = +audio.babble(voice, String(text), o) || 0; } catch { /* audio optional */ }
  if (!d) d = String(text).length / (o.cps || CPS);
  LOG.push({ t: now(), kind: 'babble', voice, text: String(text), cps: o.cps || CPS, pitch: o.pitch ?? 1, volume: o.volume ?? 0.5, d });
  return d;
};
try { audio.setMuted?.(true); } catch { /* fine */ }

// ---------------------------------------------------------------- game UI pieces
const trans = new Transition();
const bubbles = new Bubbles(ui, { sfx, babble, scale: 3 });
const notifier = new FoxNotifier(document.body, { sfx, babble: (t, o) => babble('fox', t, { volume: 0.5, ...(o || {}) }), size: 340, zIndex: 70, right: 10 });
notifier.holdWhile = () => bubbles.list.some((b) => b.key === 'notify' && !b.closing);
let lastT = 0;
const loop = (t) => { const dt = Math.min(0.1, (t - lastT) / 1000 || 0); lastT = t; bubbles.update(dt); FX.update(dt); requestAnimationFrame(loop); };
requestAnimationFrame(loop);

// ---------------------------------------------------------------- clip frames
const cache = new Map();
function img(src) {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((res) => { const i = new Image(); i.onload = () => i.decode().then(() => res(i), () => res(i)); i.onerror = () => res(null); i.src = src; });
    cache.set(src, p);
    if (cache.size > 90) cache.delete(cache.keys().next().value);
  }
  return p;
}
const frameURL = (clip, k) => `./clips/${clip}/f${String(k).padStart(4, '0')}.jpg`;
// per-frame anchors recorded with the clips (e.g. Reynard's head on screen)
const META = {};
const metaReady = Promise.all([...new Set(TL.shots.filter((s) => s.clip && s.anchors).map((s) => s.clip))].map((c) =>
  fetch(`./clips/${c}/meta.json`).then((r) => r.json()).then((m) => { META[c] = m; }).catch(() => {})));
let curT = 0;
function shotXform(s, u, iw = W, ih = H) {
  const z = s.zoom ? s.zoom[0] + (s.zoom[1] - s.zoom[0]) * ease(u) : 1;
  const p = s.pan ? [lerp(s.pan[0][0], s.pan[1][0], ease(u)), lerp(s.pan[0][1], s.pan[1][1], ease(u))] : [0.5, 0.5];
  const base = Math.max(W / iw, H / ih) * z;
  const dw = iw * base, dh = ih * base;
  return { x: (W - dw) * p[0], y: (H - dh) * p[1], s: base, dw, dh };
}
function anchorFn(name, dy = 0) {
  let last = { x: W / 2, y: H / 3 };
  return () => {
    const s = TL.shots.find((q) => q.anchors && curT >= q.at && curT < q.at + q.dur);
    const m = s && META[s.clip];
    if (!m) return last;
    const k = Math.min(m.anchors.length - 1, Math.floor((s.from || 0) + (curT - s.at) * FPS * (s.speed ?? 1)));
    const a = m.anchors[k]?.[name];
    if (!a) return last;
    const X = shotXform(s, (curT - s.at) / s.dur);
    last = { x: X.x + a[0] * X.s, y: X.y + a[1] * X.s + dy };
    return last;
  };
}

// background layers: [{ clip, at, dur, from, speed, zoom:[z0,z1], pan:[[x0,y0],[x1,y1]], fade, still, hold }]
async function drawBg(t) {
  const live = TL.shots.filter((s) => t >= s.at && t < s.at + s.dur);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  for (const s of live) {
    const u = (t - s.at) / s.dur;
    const n = s.frames ?? 1e9;
    let k = s.still ? 0 : Math.floor((s.from || 0) + (t - s.at) * FPS * (s.speed ?? 1));
    k = Math.min(k, n - 1);
    const im = await img(s.src || frameURL(s.clip, k));
    if (!im) continue;
    const X = shotXform(s, u, im.naturalWidth, im.naturalHeight);
    g.globalAlpha = s.fade ? Math.min(1, (t - s.at) / s.fade) : 1;
    g.imageSmoothingEnabled = !s.pixel;
    g.drawImage(im, X.x, X.y, X.dw, X.dh);
    g.globalAlpha = 1;
    if (s.dim) { g.fillStyle = `rgba(20,10,30,${s.dim})`; g.fillRect(0, 0, W, H); }
  }
  // prefetch upcoming frames
  for (const s of TL.shots) if (!s.still && !s.src && t + 0.5 >= s.at && t < s.at + s.dur) {
    const k = Math.floor((s.from || 0) + (t + 1 / FPS - s.at) * FPS * (s.speed ?? 1));
    if (k < (s.frames ?? 1e9)) img(frameURL(s.clip, k));
  }
}
const ease = (u) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;

// ---------------------------------------------------------------- cues
const ctx = { ui, trans, bubbles, notifier, sfx, babble, W, H };
FX.bind(ctx);
const fired = new Set();
let unboxAbort = null;
function fire(t) {
  TL.cues.forEach((c, i) => {
    if (fired.has(i) || t + 1e-6 < c.at) return;
    fired.add(i);
    try { run(c); } catch (e) { console.error('cue', c, e); }
  });
}
function run(c) {
  if (c.sfx) sfx(c.sfx, c);
  if (c.music !== undefined) LOG.push({ t: now(), kind: 'music', mood: c.music, fade: c.fade ?? 1.5, volume: c.volume ?? 0.6 });
  if (c.wipe) trans.wipe(c.wipe, null, c.opts || {});
  if (c.flash) trans.flash(c.flash, c.opts || {});
  if (c.notify) {
    const d = c.dur ?? Math.min(6, 2.2 + c.notify.length * 0.05);
    notifier.show({ mood: c.mood || 'info', dur: d + 0.6 });
    notifier.talk(c.notify);
    bubbles.say(() => notifier.anchor(), c.notify, { voice: 'fox', mood: c.bubble || 'normal', dur: d, key: 'notify', size: c.size || 'm' });
  }
  if (c.unnotify) notifier.hide({ wave: !!c.wave });
  if (c.say) bubbles.say(c.anchor ? anchorFn(c.anchor, c.dy || 0) : () => ({ x: c.x, y: c.y }), c.say, { voice: c.voice || 'fox', mood: c.bubble || 'normal', dur: c.dur ?? 3, key: c.key, size: c.size || 'm' });
  if (c.zone) {
    showZoneBanner(ui, { ...c.zone, sfx });
    if (c.stamp) Promise.resolve().then(() => Promise.resolve()).then(() => { const s = ui.querySelector('.zb:last-of-type .zb-stamp'); if (s) s.textContent = c.stamp; });
  }
  if (c.unbox) { unboxAbort = new AbortController(); playUnbox(ui, c.unbox.items.map((it) => ({ ...it, image: ART[it.art] || null })), { ...c.unbox, sfx, autoAdvance: false, signal: unboxAbort.signal }); }
  if (c.unboxClose) unboxAbort?.abort();
  if (c.tap) tap(c.tap);
  if (c.fx) FX.fire(c.fx, ctx);
}
// a click at a screen point (the unboxing box wants taps)
function tap([x, y]) {
  const el = document.elementFromPoint(x, y) || document.body;
  const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new MouseEvent('mousedown', o));
  el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
}

// ---------------------------------------------------------------- driver
window.__dir = {
  length: Math.round(TL.length * FPS),
  async frame(i) {
    const t = i / FPS;
    curT = t;
    fire(t);
    await drawBg(t);
    window.__vt.step(1000 / FPS);
  },
};
// ---------------------------------------------------------------- unboxing art
// cut-outs from the promo renders (the dragon, Reynard) + the portfolio's pixel icons
const ART = {};
async function cutout(src, mask, pad = 6) {
  const [a, b] = await Promise.all([img(src), img(mask)]);
  if (!a || !b) return null;
  const w = a.naturalWidth, h = a.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(b, 0, 0, w, h);
  x.globalCompositeOperation = 'source-in';
  x.drawImage(a, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) if (d[(j * w + i) * 4 + 3] > 20) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  const o = document.createElement('canvas'); o.width = x1 - x0 + pad * 2; o.height = y1 - y0 + pad * 2;
  o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
const artReady = (async () => {
  const { iconURL } = await import('../../portfolio/icons.js');
  ART.dragon = await cutout('../promo/renders/gig.png', '../promo/renders/gig-dragon+dragon2.png');
  ART.fox = await cutout('../promo/renders/tiers.png', '../promo/renders/tiers-fox.png');
  for (const n of ['heart', 'speaker', 'brackets', 'gamepad', 'star', 'fish']) ART[n] = iconURL(n, 6);
})().catch((e) => console.error('art', e));
Promise.all([document.fonts.load("32px 'TBME Body'"), document.fonts.load("36px 'TBME Title'"), metaReady, artReady]).then(() => { window.__ready = true; });
