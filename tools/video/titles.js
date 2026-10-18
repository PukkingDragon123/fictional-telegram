// Overlay track renderer for the post pass (tools/video/titles.mjs drives it):
// kinetic title text, creator-style word-by-word captions and blurred foreground
// parallax sprites, drawn as DOM on a transparent page at the OUTPUT resolution and
// screenshotted per frame (omitBackground), then composited over the game frames by
// tools/video/build2.py. Everything is a pure function of the timeline time t.
//
//   window.__setTrack(items, { w, h, scale })   build the elements
//   window.__at(t) -> bool                       pose everything for time t; false = nothing visible
//
// items (times in timeline seconds):
//   { type: 'card', lines: ['BREED.'], t0, t1, x, y, size, anim, fill, ... }      (overlay.js card options)
//   { type: 'text', text, t0, t1, x, y, size, color, ... }                          (overlay.js text)
//   { type: 'caption', words: [{ w: 'YOU', t }, ...], t1, x, y, size, color, hi: ['NPC'], hiColor, maxW }
//   { type: 'fg', sprite: 'cattail_0', frame, px, t0, t1, from: [x, y], to: [x, y], blur, dark, opacity, flip, ease }
import '../../src/ui/fonts.css';
import { Overlay, FILL_GOLD, FILL_HOT, FILL_ICE, FILL_PINK, FILL_GREEN, FILL_WHITE, ring } from './overlay.js';
import { natureCanvas } from '../../src/art/natureArt.js';

const FILLS = { gold: FILL_GOLD, hot: FILL_HOT, ice: FILL_ICE, pink: FILL_PINK, green: FILL_GREEN, white: FILL_WHITE };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeOutBack = (x, s = 2.2) => { x = clamp(x, 0, 1) - 1; return 1 + x * x * ((s + 1) * x + s); };

const root = document.getElementById('root');
let ov = null, live = [];

function el(tag, css = {}, parent = root) {
  const e = document.createElement(tag);
  Object.assign(e.style, css);
  parent.appendChild(e);
  return e;
}

// creator-style caption: words pop in one by one (scale overshoot + tiny drop), thick outline
function caption(it, S, parent) {
  const box = el('div', { position: 'absolute', left: (it.x ?? 0.5) * 100 + '%', top: (it.y ?? 0.5) * 100 + '%', transform: 'translate(-50%,-50%)', width: (it.maxW ?? 0.9) * 100 + '%', textAlign: 'center', lineHeight: '1.08', fontFamily: "'TBME Title', sans-serif", fontSize: (it.size ?? 92) * S + 'px', whiteSpace: 'normal', opacity: 0 }, parent);
  const R = Math.max(2, Math.round((it.outline ?? 9) * S));
  const words = it.words.map((wd) => {
    const hi = (it.hi || []).includes(wd.w.replace(/[^A-Za-z0-9!?']/g, '')) || wd.hi;
    const span = el('span', { display: 'inline-block', margin: `0 ${0.16 * (it.size ?? 92) * S}px`, color: hi ? (it.hiColor || '#ffd23a') : (it.color || '#ffffff'), textShadow: ring(R, '#120a14') + `, 0 ${R + 2 * S}px 0 #120a14`, transformOrigin: '50% 80%', opacity: 0 }, box);
    span.textContent = wd.w;
    return { span, t: wd.t };
  });
  return {
    t0: it.words[0]?.t ?? 0, t1: it.t1,
    update(t) {
      const on = t >= this.t0 - 0.001 && t < this.t1 + (it.outDur ?? 0.12);
      box.style.opacity = on ? '1' : '0';
      if (!on) return false;
      const out = t > this.t1 ? clamp((t - this.t1) / (it.outDur ?? 0.12), 0, 1) : 0;
      for (const w of words) {
        const u = t - w.t;
        if (u < 0) { w.span.style.opacity = '0'; continue; }
        const k = easeOutBack(u / 0.16, 3.0);
        const sc = (0.45 + 0.55 * k) * (1 - out * 0.4);
        w.span.style.opacity = String(clamp(u / 0.03, 0, 1) * (1 - out));
        w.span.style.transform = `translateY(${((1 - clamp(u / 0.12, 0, 1)) * -0.18 * (it.size ?? 92) * S).toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${(it.wobble ?? 0) * Math.sin(u * 9 + w.t * 7) * Math.exp(-u * 2)}deg)`;
      }
      return true;
    },
  };
}

// a blurred, darkened nature sprite drifting across the frame close to the "lens"
function fgSprite(it, S, H, parent) {
  const cv = natureCanvas(it.sprite, it.frame || 0, 1);
  const img = el('img', { position: 'absolute', left: '0', top: '0', imageRendering: 'pixelated', transformOrigin: '50% 100%', opacity: 0 }, parent);
  img.src = cv.toDataURL();
  const px = (it.px ?? 18) * S; // screen px per sprite texel
  img.style.width = cv.width * px + 'px';
  img.style.height = cv.height * px + 'px';
  img.style.filter = `blur(${(it.blur ?? 6) * S}px) brightness(${it.dark ?? 0.35}) saturate(${it.sat ?? 0.8})`;
  return {
    t0: it.t0, t1: it.t1,
    update(t, W) {
      if (t < it.t0 || t > it.t1) { img.style.opacity = '0'; return false; }
      let u = (t - it.t0) / Math.max(1e-6, it.t1 - it.t0);
      if (it.ease === 'smooth') u = smooth(u);
      const x = (it.from[0] + (it.to[0] - it.from[0]) * u) * W - (cv.width * px) / 2;
      const y = (it.from[1] + (it.to[1] - it.from[1]) * u) * H - cv.height * px;
      const fade = Math.min(1, (t - it.t0) / (it.fadeIn ?? 0.001), (it.t1 - t) / (it.fadeOut ?? 0.001));
      img.style.opacity = String((it.opacity ?? 1) * clamp(fade, 0, 1));
      img.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scaleX(${it.flip ? -1 : 1})`;
      return true;
    },
  };
}

window.__setTrack = (items, { w, h, scale = 1 }) => {
  root.innerHTML = '';
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: w + 'px', height: h + 'px', overflow: 'hidden' });
  // fg sprites sit under the text
  const fgLayer = el('div', { position: 'absolute', inset: '0' });
  const ovLayer = el('div', { position: 'absolute', inset: '0' });
  const capLayer = el('div', { position: 'absolute', inset: '0' });
  ov = new Overlay(ovLayer);
  live = [];
  const S = scale;
  for (const it of items) {
    if (it.type === 'fg') { live.push(fgSprite(it, S, h, fgLayer)); continue; }
    if (it.type === 'caption') { live.push(caption(it, S, capLayer)); continue; }
    const o = { ...it };
    if (typeof o.fill === 'string' && FILLS[o.fill]) o.fill = FILLS[o.fill];
    for (const k of ['size', 'subSize', 'ribbonSize', 'outline', 'outer', 'gap']) if (o[k] != null) o[k] *= S;
    if (o.sizes) o.sizes = o.sizes.map((v) => v * S);
    if (o.shadow && typeof o.shadow === 'object') o.shadow = { ...o.shadow, x: (o.shadow.x || 0) * S, y: (o.shadow.y || 0) * S };
    const card = it.type === 'text' ? ov.text(o.text, o) : ov.card(o.lines, o);
    live.push({ t0: it.t0 ?? 0, t1: (it.t1 ?? 1e9) + (it.outDur ?? 0.3), card, update: () => true });
  }
  return live.length;
};

window.__at = (t) => {
  const W = root.clientWidth;
  let any = false;
  ov?.update(t);
  for (const L of live) {
    if (L.card) { if (t >= L.t0 && t <= L.t1) any = true; continue; }
    if (L.update(t, W)) any = true;
  }
  return any;
};
window.__ready = true;
