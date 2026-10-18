// [v27 knobs] Hand-made pixel sliders. A carved wooden rail with ruler notches every
// 10%, warm honey filling the groove up to a chunky brass knob (it squishes when
// grabbed), a little value tag that pops above the knob while you drag, and a
// speaker / note at the left whose sound waves follow the value (0 = muted; tap
// it to mute / unmute). Painted at whole device pixels (pxCrisp.js): crisp on iPad.
//
// The original <input type=range> stays the source of truth: the widget reads
// min / max / step / value from it, writes input.value and dispatches real 'input'
// and 'change' events on it, so every existing handler keeps working. It follows
// programmatic changes too (input.value = x repaints the knob).
//
//   const s = pxSlider(input, { texel?, width?, icon?: 'auto'|'speaker'|'note'|'none',
//                               sfx?(name, opts), format?(v) -> string, label? });
//   s.refresh(); s.el; s.destroy();
//   upgradeSliders(root, opts?) -> [sliders]  every input[type=range] under root not yet upgraded
import './pxSlider.css';
import { INK, FONTS, text, measure, wood } from './titleArt.js';
import { texelPx, artCanvas, blit, pattern, trackDpr } from './pxCrisp.js';

const H = 17; // canvas rows (texels)
const RAIL = { top: 4, bot: 13 }; // ink rows of the rail; lips 5-6 / 11-12, groove 7-10
const KNOB = { w: 9, h: 15, y: 1 };
const PAL = {
  honey: ['#b8661a', '#ffe38a', '#f7b63a', '#e0921f'], // groove rows 7..10 when filled
  shine: ['#d88a2a', '#fff6c8', '#ffd76a', '#f0a830'],
  carve: ['#24120a', '#3c2312', '#4a2c16', '#5e3a1e'], // groove rows when empty
  brass: { hi: '#fff0b0', l: '#f6d377', b: '#dcaa42', s: '#b07d26', d: '#7f5718' },
};
const WOOD = { base: [150, 98, 56], dark: [112, 70, 38], light: [190, 134, 82] };

// ---- icons (10 rows, drawn at rows 4..13); waves: '1' '2' '3', ink parts '#'
const SPEAKER = [
  '......##.....3..',
  '.....#h#..2...3.',
  '....#hc#...2..3.',
  '####hcc#.1..2..3',
  '#hc#ccc#..1.2..3',
  '#cd#ccd#..1.2..3',
  '####ccd#.1..2..3',
  '....#dd#...2..3.',
  '.....#d#..2...3.',
  '......##.....3..',
];
const NOTE = [
  '...###.......3..',
  '...#c##...2...3.',
  '...#cc##...2..3.',
  '...#c#c#.1..2..3',
  '...#c##...1.2..3',
  '...#c#....1.2..3',
  '.###c#...1..2..3',
  '#hccc#.....2..3.',
  '#cccd#....2...3.',
  '.####........3..',
];
const MUTE = [ // red cross where the waves were
  '##...##',
  '.##.##.',
  '..###..',
  '.##.##.',
  '##...##',
];
const ICON_W = 16;

const fmtDefault = (v, inp) => `${Math.round(v)}${+inp.min >= 0 ? '%' : ''}`;
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const nativeNum = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'valueAsNumber');
const defaultSfx = (n, o) => { const a = typeof window !== 'undefined' && window.__game?.audio; a?.play?.(n, { volume: 0.4, ...(o || {}) }); };
// brass knob: column shades (left = lit) and a mixer for the grooves
const KNOB_COLS = ['#f0c862', '#fff0b0', '#f8da84', '#e8b850', '#d6a23c', '#b8862e', '#8f6420'];
const mix = (hex, k) => { // k < 0 darker, k > 0 lighter
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const t = k < 0 ? 0 : 255, f = Math.abs(k);
  return `rgb(${c.map((v) => Math.round(v + (t - v) * f)).join(',')})`;
};

function guessLabel(input) {
  const a = input.getAttribute('aria-label');
  if (a) return a;
  const own = input.labels && [...input.labels].map((l) => l.textContent.trim()).find(Boolean);
  if (own) return own;
  const row = input.closest('label, .stg-row');
  const lab = row?.querySelector('.stg-lab');
  if (lab) return lab.textContent.trim();
  const prev = input.parentElement?.previousElementSibling;
  if (prev && prev.textContent.trim().length < 40) return prev.textContent.trim();
  return 'Slider';
}
function guessIcon(input, label) {
  const min = input.min === '' ? 0 : +input.min;
  if (min !== 0) return 'none';
  const k = `${input.id} ${input.dataset.k || ''} ${label}`.toLowerCase();
  if (k.includes('music')) return 'note';
  if (/sound|sfx|volume|amb|audio/.test(k)) return 'speaker';
  return 'none';
}

export function pxSlider(input, opts = {}) {
  if (!input || input.type !== 'range') return null;
  if (input._pxs) return input._pxs;
  const label = opts.label || guessLabel(input);
  const iconKind = !opts.icon || opts.icon === 'auto' ? guessIcon(input, label) : opts.icon;
  const icon = iconKind === 'note' ? NOTE : iconKind === 'speaker' ? SPEAKER : null;
  const sfx = typeof opts.sfx === 'function' ? opts.sfx : opts.sfx === false ? null : defaultSfx;
  const format = typeof opts.format === 'function' ? opts.format : fmtDefault;
  const play = (n, o) => { if (sfx) { try { sfx(n, o); } catch { /* optional */ } } };

  const el = document.createElement('span');
  el.className = 'pxs';
  el.tabIndex = input.disabled ? -1 : 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-orientation', 'horizontal');
  el.innerHTML = '<canvas class="pxs-cv" aria-hidden="true"></canvas>';
  if (opts.width) el.style.width = typeof opts.width === 'number' ? `${opts.width}px` : opts.width;
  const cv = el.querySelector('.pxs-cv');
  const tagCv = document.createElement('canvas');
  tagCv.className = 'pxs-tag';
  tagCv.setAttribute('aria-hidden', 'true');
  // the widget goes BEFORE the input: code that reads input.nextElementSibling (value labels) keeps working
  input.before(el);
  input.classList.add('pxs-src');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');

  const st = {
    t: texelPx(opts.texel ?? (Math.min(innerWidth, innerHeight * 1.6) < 820 ? 2 : 3)),
    W: 0, base: null, art: null, hover: false, grab: false, spring: 0, shimmer: -99, activeUntil: 0,
    raf: 0, tagUntil: 0, lastTick: null, startV: 0, grabOff: 0, last: null, destroyed: false,
  };
  st.tBase = opts.texel ?? null;

  const num = () => {
    const min = input.min === '' ? 0 : +input.min, max = input.max === '' ? 100 : +input.max;
    const step = input.step === 'any' ? 0 : (+input.step || 1);
    return { min, max: max > min ? max : min + 1, step };
  };
  const val = () => +nativeValue.get.call(input);
  const frac = () => { const { min, max } = num(); return Math.min(1, Math.max(0, (val() - min) / (max - min))); };

  // ---- geometry (texels)
  const geo = () => {
    const x0 = icon ? ICON_W + 3 : 1; // rail start
    const x1 = st.W - 2; // rail end
    const c0 = x0 + 4, c1 = Math.max(c0 + 1, x1 - 4); // knob centre range
    return { x0, x1, c0, c1 };
  };
  const knobX = () => { const g = geo(); return g.c0 + Math.round(frac() * (g.c1 - g.c0)); };

  // ---- static art: rail, groove, notches
  function paintBase() {
    const W = st.W;
    const { c, g } = artCanvas(W, H);
    const G = geo();
    const { x0, x1 } = G;
    const top = RAIL.top, bot = RAIL.bot, rh = bot - top + 1;
    // soft shadow under the rail
    g.fillStyle = 'rgba(40,18,6,.22)'; g.fillRect(x0 + 2, bot + 1, x1 - x0 - 1, 1);
    // ink rail with chamfered ends
    g.fillStyle = INK;
    g.fillRect(x0 + 1, top, x1 - x0 - 1, rh); g.fillRect(x0, top + 1, 1, rh - 2); g.fillRect(x1, top + 1, 1, rh - 2);
    wood(g, x0 + 1, top + 1, x1 - x0 - 1, rh - 2, 17 + W, WOOD);
    // inner corners stay ink: rounder ends
    g.fillStyle = INK;
    g.fillRect(x0 + 1, top + 1, 1, 1); g.fillRect(x1 - 1, top + 1, 1, 1); g.fillRect(x0 + 1, bot - 1, 1, 1); g.fillRect(x1 - 1, bot - 1, 1, 1);
    // the carved groove (rows top+3 .. bot-3), its ends rounded
    const gx0 = x0 + 3, gx1 = x1 - 3;
    for (let r = 0; r < 4; r++) { g.fillStyle = PAL.carve[r]; g.fillRect(gx0, top + 3 + r, gx1 - gx0 + 1, 1); }
    g.fillStyle = PAL.carve[0]; g.fillRect(gx0 - 1, top + 4, 1, 2); g.fillRect(gx1 + 1, top + 4, 1, 2);
    // lit edge under the groove, dark lip above it
    g.fillStyle = 'rgba(255,230,180,.35)'; g.fillRect(gx0, bot - 2, gx1 - gx0 + 1, 1);
    // notches every 10%: carved into the top lip, ruler ticks under the rail
    for (let i = 0; i <= 10; i++) {
      const x = G.c0 + Math.round((i / 10) * (G.c1 - G.c0));
      const big = i % 5 === 0;
      g.fillStyle = 'rgba(42,22,12,.55)'; g.fillRect(x, top + 1, 1, big ? 2 : 1);
      g.fillStyle = big ? INK : 'rgba(42,22,12,.62)'; g.fillRect(x, bot + 1, 1, big ? 3 : 2);
    }
    st.base = c;
  }

  // ---- the brass knob (frame: 'n' normal, 'q' squished while held, 's' spring on release)
  function paintKnob(g, kc, frame, hot) {
    const w = frame === 'q' ? 11 : frame === 's' ? 7 : KNOB.w;
    const h = frame === 'q' ? 13 : frame === 's' ? 16 : KNOB.h;
    const y0 = frame === 's' ? 0 : H - 1 - h; // sits on the bottom row
    const x0 = kc - (w >> 1);
    // drop shadow on the rail
    g.fillStyle = 'rgba(30,12,4,.35)';
    g.fillRect(x0 + 2, y0 + 2, w - 1, h - 1);
    // ink body, chamfered corners
    g.fillStyle = INK;
    g.fillRect(x0 + 1, y0, w - 2, h); g.fillRect(x0, y0 + 1, w, h - 2);
    // a brass cylinder: lit from the left, grip grooves across
    const n = w - 2;
    const grooves = new Set([y0 + 4, y0 + 7, y0 + 10].filter((y) => y < y0 + h - 4));
    for (let i = 0; i < n; i++) {
      const base = KNOB_COLS[Math.round((i / Math.max(1, n - 1)) * (KNOB_COLS.length - 1))];
      for (let y = y0 + 1; y < y0 + h - 1; y++) {
        let k = hot ? 0.12 : 0;
        if (y === y0 + 1) k += 0.35; // top cap
        else if (y === y0 + 2) k += 0.15;
        else if (y >= y0 + h - 3) k -= y === y0 + h - 2 ? 0.45 : 0.22; // underside
        else if (grooves.has(y)) k -= 0.42;
        else if (grooves.has(y - 1)) k += 0.3;
        g.fillStyle = k ? mix(base, Math.max(-0.9, Math.min(0.9, k))) : base;
        g.fillRect(x0 + 1 + i, y, 1, 1);
      }
    }
    g.fillStyle = INK; g.fillRect(x0 + 1, y0 + 1, 1, 1); g.fillRect(x0 + w - 2, y0 + 1, 1, 1);
    // the pointer: a little ink notch at the top centre
    g.fillStyle = INK; g.fillRect(kc, y0 + 1, 1, 2);
    // a sparkle on the cap
    g.fillStyle = '#ffffff'; g.fillRect(x0 + 2, y0 + 2, 1, 1);
  }

  function paintIcon(g, f) {
    if (!icon) return;
    const muted = f <= 0;
    const waves = muted ? 0 : f < 0.34 ? 1 : f < 0.67 ? 2 : 3;
    const y0 = RAIL.top;
    const pal = { '#': INK, h: '#fff3c4', c: '#e8bf62', d: '#b0802c' };
    for (let k = 1; k <= 3; k++) pal[String(k)] = k <= waves ? INK : muted ? null : 'rgba(42,22,12,.16)';
    pattern(g, icon, 0, y0, pal);
    if (muted) pattern(g, MUTE, 9, y0 + 2, { '#': '#c8341f' });
  }

  function paintTag() {
    const str = format(val(), input);
    const bm = measure(FONTS.big, str);
    const tw = bm.w + 7, th = bm.h + 5, ph = 3;
    const { c, g } = artCanvas(tw + 1, th + ph + 1);
    // shadow
    g.fillStyle = 'rgba(30,12,4,.3)'; g.fillRect(2, 2, tw - 1, th - 1);
    // card
    g.fillStyle = INK; g.fillRect(1, 0, tw - 2, th); g.fillRect(0, 1, tw, th - 2);
    g.fillStyle = '#fbf3dc'; g.fillRect(1, 1, tw - 2, th - 2);
    g.fillStyle = '#ffffff'; g.fillRect(2, 1, tw - 4, 1);
    g.fillStyle = '#dcc89c'; g.fillRect(1, th - 2, tw - 2, 1);
    // pointer down at the knob
    const mx = tw >> 1;
    g.fillStyle = INK; g.fillRect(mx - 2, th - 1, 5, 1); g.fillRect(mx - 1, th, 3, 1); g.fillRect(mx, th + 1, 1, 1);
    g.fillStyle = '#dcc89c'; g.fillRect(mx - 1, th - 1, 3, 1); g.fillRect(mx, th, 1, 1);
    text(g, FONTS.big, str, 4, 2, { fill: INK, shade: INK, outline: false, drop: 0 });
    blit(c, st.t, tagCv);
    st.tagW = tw;
  }

  // ---- paint everything
  function render() {
    st.raf = 0;
    if (st.destroyed) return;
    if (!st.base) return;
    const W = st.W;
    if (!st.art || st.art.width !== W) st.art = artCanvas(W, H).c;
    const g = st.art.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.drawImage(st.base, 0, 0);
    const G = geo();
    const f = frac();
    const kc = knobX();
    // honey up to the knob
    const gx0 = G.x0 + 3, fillTo = Math.min(G.x1 - 3, kc);
    if (fillTo >= gx0 && (f > 0 || kc > gx0)) {
      for (let r = 0; r < 4; r++) { g.fillStyle = PAL.honey[r]; g.fillRect(gx0, RAIL.top + 3 + r, fillTo - gx0 + 1, 1); }
      g.fillStyle = PAL.honey[0]; g.fillRect(gx0 - 1, RAIL.top + 4, 1, 2);
      // a few bubbles in the honey
      g.fillStyle = 'rgba(255,250,220,.75)';
      for (let i = 0, x = gx0 + 4; x < fillTo - 2; i++, x += 6 + ((i * 7 + 3) % 9)) g.fillRect(x, RAIL.top + 4 + ((i * 5) % 3), 1, 1);
      // shimmer: a bright band sliding along while you play with it
      if (st.shimmer > -10) {
        for (let d = 0; d < 3; d++) {
          const x = Math.round(st.shimmer) - d;
          if (x < gx0 || x > fillTo) continue;
          for (let r = 0; r < 4; r++) { g.fillStyle = PAL.shine[r]; g.fillRect(x, RAIL.top + 3 + r, 1, 1); }
        }
      }
    }
    paintIcon(g, f);
    const frame = st.spring > performance.now() ? 's' : st.grab ? 'q' : 'n';
    paintKnob(g, kc, frame, st.hover || st.grab);
    blit(st.art, st.t, cv);
    // keep the canvas on whole texels inside the widget
    const hostH = el.clientHeight || H * st.t;
    const top = Math.max(0, Math.floor((hostH - H * st.t) / 2 / st.t) * st.t);
    cv.style.top = `${top}px`;
    // the tag
    const showTag = (st.grab || st.tagUntil > performance.now()) && el.isConnected;
    if (showTag) {
      clearTimeout(st.tagRm);
      const key = `${val()}|${st.t}`;
      if (st.tagKey !== key) { st.tagKey = key; paintTag(); }
      const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      const snap = (v) => Math.round(v * d) / d;
      tagCv.style.left = `${snap(r.left + (kc - (st.tagW >> 1)) * st.t)}px`;
      tagCv.style.top = `${snap(r.top - parseFloat(tagCv.style.height || '0') + st.t)}px`;
      if (!tagCv.isConnected) { document.body.appendChild(tagCv); void tagCv.offsetWidth; } // so it pops
      tagCv.classList.add('is-on');
    } else if (tagCv.classList.contains('is-on')) {
      tagCv.classList.remove('is-on');
      clearTimeout(st.tagRm);
      st.tagRm = setTimeout(() => { if (!tagCv.classList.contains('is-on')) tagCv.remove(); }, 250);
    }
    if (!el.isConnected && st.seen) { tagCv.remove(); return; }
    if (el.isConnected) st.seen = true;
    // ARIA
    const v = val();
    el.setAttribute('aria-valuemin', String(num().min));
    el.setAttribute('aria-valuemax', String(num().max));
    el.setAttribute('aria-valuenow', String(v));
    el.setAttribute('aria-valuetext', format(v, input));
    el.classList.toggle('is-off', input.disabled);
    el.tabIndex = input.disabled ? -1 : 0;
    // animate while something moves
    const now = performance.now();
    if (st.shimmer > -10 && st.shimmer < fillTo + 4) st.shimmer += 1.2;
    else if (st.activeUntil > now && st.grab) st.shimmer = gx0 - 2;
    else st.shimmer = -99;
    if (st.shimmer > -10 || st.spring > now || st.tagUntil > now) queue();
  }
  function queue() { if (!st.raf && !st.destroyed) st.raf = requestAnimationFrame(render); }

  function layout() {
    const w = el.clientWidth;
    if (!w) return;
    st.t = texelPx(st.tBase ?? (Math.min(innerWidth, innerHeight * 1.6) < 820 ? 2 : 3));
    const W = Math.max(40, Math.floor(w / st.t));
    el.style.setProperty('--pxs-t', `${st.t}px`);
    el.style.minHeight = `${Math.max(44, H * st.t)}px`;
    if (W !== st.W || !st.base || st.baseT !== st.t) { st.W = W; st.baseT = st.t; paintBase(); }
    render();
  }

  // ---- write a new value (snap, events, tick sound)
  function setValue(v, { change = false, quiet = false } = {}) {
    const { min, max, step } = num();
    if (step) v = min + Math.round((v - min) / step) * step;
    v = Math.min(max, Math.max(min, v));
    const dec = String(step).split('.')[1]?.length || 0;
    v = +v.toFixed(dec);
    const old = val();
    if (v !== old) {
      nativeValue.set.call(input, String(v));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const tick = Math.floor(((v - min) / (max - min)) * 10 + 1e-6);
      if (!quiet && tick !== st.lastTick) { st.lastTick = tick; play('set_tick', { pitch: 0.8 + ((v - min) / (max - min)) * 0.5 }); }
      st.activeUntil = performance.now() + 900;
      if (st.shimmer < -10) st.shimmer = geo().x0 + 1;
    }
    if (change && val() !== st.startV) input.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }

  // ---- pointer
  const toTex = (e) => (e.clientX - cv.getBoundingClientRect().left) / st.t;
  const fromTex = (xt) => {
    const G = geo(), { min, max } = num();
    const p = Math.min(1, Math.max(0, (xt - G.c0) / (G.c1 - G.c0)));
    return min + p * (max - min);
  };
  let pid = null;
  el.addEventListener('pointerdown', (e) => {
    if (input.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); // no text selection, no label activation, no focus theft
    e.stopPropagation();
    el.classList.add('is-pfocus');
    el.focus({ preventScroll: true });
    const xt = toTex(e);
    const G = geo();
    st.lastTick = Math.floor(frac() * 10 + 1e-6);
    if (icon && xt < G.x0 - 1) { // tap the speaker: mute / unmute
      const { min, max } = num();
      st.startV = val();
      if (val() > min) { st.unmute = val(); setValue(min, { change: true, quiet: true }); } else setValue(st.unmute ?? (min + max) / 2, { change: true, quiet: true });
      play('click', { volume: 0.6 });
      st.tagUntil = performance.now() + 700;
      render();
      return;
    }
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch { /* old browsers */ }
    st.grab = true;
    st.startV = val();
    const kc = knobX();
    st.grabOff = Math.abs(xt - kc) <= 6 ? xt - kc : 0; // on the knob: keep the hold point; on the rail: jump
    el.classList.add('is-grab');
    play('set_tick', { pitch: 0.7, volume: 0.6 });
    setValue(fromTex(xt - st.grabOff));
  });
  el.addEventListener('pointermove', (e) => {
    if (st.grab && e.pointerId === pid) { setValue(fromTex(toTex(e) - st.grabOff)); return; }
    if (e.pointerType === 'mouse') {
      const xt = toTex(e), G = geo();
      const onKnob = Math.abs(xt - knobX()) <= 5;
      el.style.cursor = icon && xt < G.x0 - 1 ? 'pointer' : onKnob ? 'grab' : 'pointer';
      if (onKnob !== st.hover) { st.hover = onKnob; render(); }
    }
  });
  const end = (e) => {
    if (!st.grab || (e && e.pointerId !== pid)) return;
    st.grab = false; pid = null;
    el.classList.remove('is-grab');
    st.spring = performance.now() + 110;
    st.tagUntil = performance.now() + 450;
    if (val() !== st.startV) input.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('pointerleave', () => { if (st.hover) { st.hover = false; render(); } });
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

  // ---- keyboard
  el.addEventListener('keydown', (e) => {
    el.classList.remove('is-pfocus');
    if (input.disabled) return;
    const { min, max, step } = num();
    const s = step || (max - min) / 100;
    const big = Math.max(s, (max - min) / 10);
    let v = null;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') v = val() + s;
    else if (k === 'ArrowLeft' || k === 'ArrowDown') v = val() - s;
    else if (k === 'PageUp') v = val() + big;
    else if (k === 'PageDown') v = val() - big;
    else if (k === 'Home') v = min;
    else if (k === 'End') v = max;
    if (v == null) return;
    e.preventDefault(); e.stopPropagation();
    st.startV = val();
    st.lastTick = Math.floor(frac() * 10 + 1e-6);
    st.tagUntil = performance.now() + 900;
    setValue(v, { change: true });
  });
  el.addEventListener('focus', () => render());
  el.addEventListener('blur', () => el.classList.remove('is-pfocus'));

  // ---- follow programmatic changes: input.value = x / valueAsNumber = x / attribute edits
  try {
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return nativeValue.get.call(this); },
      set(v) { nativeValue.set.call(this, v); queue(); },
    });
    if (nativeNum) {
      Object.defineProperty(input, 'valueAsNumber', {
        configurable: true,
        get() { return nativeNum.get.call(this); },
        set(v) { nativeNum.set.call(this, v); queue(); },
      });
    }
  } catch { /* exotic browsers: the events below still keep it in sync */ }
  const onEv = () => queue();
  input.addEventListener('input', onEv);
  input.addEventListener('change', onEv);
  // a <label for> click focuses the hidden input: hand the focus to the widget
  const onFocusSrc = () => { if (!input.disabled) el.focus({ preventScroll: true }); };
  input.addEventListener('focus', onFocusSrc);
  let mo = null;
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => queue());
    mo.observe(input, { attributes: true, attributeFilter: ['min', 'max', 'step', 'value', 'disabled'] });
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => layout()); ro.observe(el); }
  // repaint on a new devicePixelRatio; forget the widget once it has left the page
  const offDpr = trackDpr(() => { if (st.destroyed || (st.seen && !el.isConnected)) return false; st.base = null; layout(); return true; });

  const api = {
    el, input,
    refresh: () => { st.base = null; layout(); },
    set: (v) => setValue(+v, { change: true }),
    destroy() {
      if (st.destroyed) return;
      st.destroyed = true;
      ro?.disconnect(); mo?.disconnect(); offDpr();
      input.removeEventListener('input', onEv); input.removeEventListener('change', onEv); input.removeEventListener('focus', onFocusSrc);
      delete input.value; delete input.valueAsNumber;
      input.classList.remove('pxs-src'); input.removeAttribute('aria-hidden'); input.tabIndex = 0;
      el.remove(); tagCv.remove();
      delete input._pxs;
    },
  };
  input._pxs = api;
  layout();
  if (!st.base) requestAnimationFrame(layout);
  return api;
}

export function upgradeSliders(root = document, opts = {}) {
  const out = [];
  if (!root?.querySelectorAll) return out;
  for (const inp of root.querySelectorAll('input[type="range"]')) {
    if (inp._pxs) continue;
    try { const s = pxSlider(inp, opts); if (s) out.push(s); } catch (e) { console.warn('pxSlider', e); }
  }
  return out;
}
