// [v33 kit] Polish for the hotbar (#toolbar, built by UI.buildDOM): the wooden bar with the gold-framed
// icon slots keeps its look; this adds the feel.
//   - hover: the slot lifts a little, a soft tick, its name on the game's tooltip frame
//   - press: the icon squashes, the slot sinks; release springs it back (the click sound is UI.click)
//   - the active slot: its icon bobs, a pixel sparkle twinkles in the corner
//   - the icons come alive (src/ui/kit/iconAnim.js): the hammer taps, the potion bubbles, the heart beats, the
//     eggs wobble, the tag swings, the trophy glints, a page flutters, the glove waves... on hover, when
//     picked, and now and then one at a time while idle
//   - a new slot (a quest / research unlock after load) appears with a ceremony
//
//   const hb = new Hotbar(ui, TOOLS)
//   hb.introduce(feature) -> Promise   the slot appears with a ceremony: the bar makes room, the screen dims
//                                      around it (dithered iris), it pops in with dust and sparkles, a NEW!
//                                      tag, sounds. Unlocks the feature quietly if it isn't open yet.
//                                      Resolves when the ceremony is over. (UI.kitIntroduce)
//   hb.spotlight(feature, on)          a pulsing ring + bob + name tag on one slot (UI.kitSpotlight)
//
// Selectors the rest of the game uses are untouched: #toolbar .tool[data-tool] / [data-panel] /
// [data-feature], classes .locked .active .pulse.
import './hotbar.css';
import { iconAnim, iconFactor } from './iconAnim.js';

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PX = 2; // the hotbar icons are drawn at 2 css px per art px (ico(name, 2)): particles match

// tiny particle sprites, painted once
const SPR = {
  star: [['...y...', '...y...', '..yYy..', 'yyYWYyy', '..yYy..', '...y...', '...y...'], { y: '#e5a320', Y: '#ffe98a', W: '#ffffff' }],
  spark: [['.y.', 'yWy', '.y.'], { y: '#ffe98a', W: '#ffffff' }],
  dust: [['.dd.', 'dDDd', 'dDDd', '.dd.'], { d: '#a88a6a', D: '#e2c992' }],
  dust2: [['dd', 'dD'], { d: '#a88a6a', D: '#e2c992' }],
  chip: [['ww', 'Ww'], { w: '#a86d38', W: '#dcaa6a' }],
};
const sprURL = new Map();
function sprite(name) {
  if (sprURL.has(name)) return sprURL.get(name);
  const [rows, pal] = SPR[name] || SPR.spark;
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  sprURL.set(name, out);
  return out;
}

export class Hotbar {
  constructor(ui, TOOLS = []) {
    this.ui = ui;
    this.game = ui.game;
    this.bar = document.getElementById('toolbar');
    this.defs = new Map(TOOLS.map((t) => [t.feature, t]));
    this.timers = new Set();
    this.parts = [];
    this.queue = Promise.resolve();
    this.bar.classList.add('hb');
    const fx = (this.fx = document.createElement('div'));
    fx.className = 'hb-fx';
    fx.innerHTML = '<canvas class="hb-dim"></canvas><div class="hb-label f-tooltip"><b></b><kbd></kbd><small></small></div>';
    document.body.appendChild(fx);
    this.$dim = fx.querySelector('.hb-dim');
    this.$label = fx.querySelector('.hb-label');
    this.slots = new Map();
    for (const b of this.bar.querySelectorAll('.tool')) {
      const t = this.defs.get(b.dataset.feature) || {};
      // the name lives on our pixel tooltip, not the browser's
      b.setAttribute('aria-label', b.getAttribute('title') || t.title || '');
      b.dataset.name = t.label || b.dataset.feature;
      b.dataset.key = t.key || '';
      b.removeAttribute('title');
      if (!b.querySelector('.hb-tw')) b.insertAdjacentHTML('beforeend', '<i class="hb-tw"></i>');
      b.querySelector('.hb-tw').style.backgroundImage = `url(${sprite('spark').url})`;
      const s = { el: b, feature: b.dataset.feature, icon: t.icon, img: b.querySelector('img.px'), locked: b.classList.contains('locked'), active: b.classList.contains('active') };
      s.known = !s.locked;
      this.slots.set(b, s);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') this._hover(s, true); });
      b.addEventListener('pointerleave', () => this._hover(s, false));
      b.addEventListener('pointerdown', (e) => this._down(s, e));
      b.addEventListener('pointerup', () => this._up(s));
      b.addEventListener('pointercancel', () => this._up(s, true));
    }
    // sparks off the slot you clicked (after the toolbar's own handler)
    this.bar.addEventListener('click', (e) => {
      const s = this.slots.get(e.target.closest?.('.tool'));
      if (s && !s.locked) this._burst(s, 'spark', 4, { spread: 1.8, up: 1.1, at: 0.25 });
    });
    this.mo = new MutationObserver((ms) => { for (const m of ms) this._onClass(m.target); });
    for (const s of this.slots.values()) this.mo.observe(s.el, { attributes: true, attributeFilter: ['class'] });
    this.ready = true;
    // now and then one icon does its little thing (never two at once, never while you look elsewhere)
    this.idleT = 4;
    this._idleI = setInterval(() => this._idle(), 1000);
  }

  // ------------------------------------------------------------ icon animations
  _anim(s) {
    if (!s.img || s.animT || s.locked || reduced()) return;
    const A = iconAnim(s.icon, iconFactor(s.icon, s.img));
    if (!A) return;
    const src0 = s.img.getAttribute('src');
    let i = 0;
    const step = () => {
      if (i >= A.seq.length || !s.img.isConnected) { s.img.setAttribute('src', src0); s.animT = 0; return; }
      const [f, ms] = A.seq[i++];
      s.img.setAttribute('src', f ? A.frames[f] : src0);
      s.animT = setTimeout(step, ms || 1);
    };
    step();
  }
  _idle() {
    if (document.hidden || this.ceremony || !this.bar.isConnected || this.bar.classList.contains('empty')) return;
    if (--this.idleT > 0) return;
    this.idleT = 3 + Math.floor(Math.random() * 4);
    const cs = getComputedStyle(this.bar);
    if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return;
    const L = [...this.slots.values()].filter((s) => !s.locked && !s.animT && s.el.offsetParent && this.labelFor !== s);
    if (!L.length) return;
    // the tool in your hand fidgets a bit more often
    const act = L.find((s) => s.active);
    this._anim(act && Math.random() < 0.3 ? act : L[(Math.random() * L.length) | 0]);
  }

  el(feature) { for (const s of this.slots.values()) if (s.feature === feature || s.el.dataset.tool === feature || s.el.dataset.panel === feature) return s.el; return null; }
  _slot(feature) { const b = this.el(feature); return b ? this.slots.get(b) : null; }
  sfx(n, o) { try { this.game.audio?.play(n, { volume: 0.3, ...(o || {}) }); } catch { /* optional */ } }
  later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }
  _bump(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ------------------------------------------------------------ pointer
  _hover(s, on) {
    if (on && !s.locked) {
      this.sfx('hover', { volume: 0.12 });
      this._anim(s);
      clearTimeout(this.lblT);
      this.lblT = setTimeout(() => this._label(s), 220);
    } else if (!on) {
      clearTimeout(this.lblT);
      if (this.labelFor === s && !s.spot) this._hideLabel();
    }
  }
  _down(s, e) {
    if (s.locked || (e.button && e.button !== 0)) return;
    s.el.classList.add('hb-down');
    if (e.pointerType === 'touch') { this._label(s); clearTimeout(this.lblT); this.lblT = setTimeout(() => { if (!s.spot) this._hideLabel(); }, 1100); }
  }
  _up(s, cancel = false) {
    if (!s.el.classList.contains('hb-down')) return;
    s.el.classList.remove('hb-down');
    if (!cancel) this._bump(s.el, 'hb-spring');
  }

  // ------------------------------------------------------------ the name tooltip (the game's tooltip frame)
  _label(s, { title = null, sub = null } = {}) {
    if (!s.el.offsetParent) return;
    const L = this.$label;
    L.querySelector('b').textContent = title || s.el.dataset.name || '';
    L.querySelector('kbd').textContent = !title && s.el.dataset.key && s.el.dataset.key !== '0' ? s.el.dataset.key : '';
    L.querySelector('small').textContent = sub || '';
    L.classList.toggle('new', !!title);
    this.labelFor = s;
    const r = s.el.getBoundingClientRect();
    L.style.left = `${Math.round(r.left + r.width / 2)}px`;
    L.style.top = `${Math.round(r.top - 6)}px`;
    this._bump(L, 'on');
  }
  _hideLabel() { this.$label.classList.remove('on'); this.labelFor = null; }

  // ------------------------------------------------------------ state
  _onClass(b) {
    const s = this.slots.get(b);
    if (!s) return;
    const locked = b.classList.contains('locked'), active = b.classList.contains('active');
    if (locked !== s.locked) {
      s.locked = locked;
      if (!locked && !s.known && this.ready) {
        // a new tool after load (quest / research): gather this tick's unlocks; several at once is a save
        // loading or the tour being skipped, not a reward, and gets no ceremony
        (this.fresh ||= []).push(s);
        clearTimeout(this.freshT);
        this.freshT = this.later(() => this._freshFlush(), 260);
      }
      if (!locked) s.known = true;
    }
    if (active !== s.active) {
      s.active = active;
      if (active && this.ready && !s.cer) { this._bump(b, 'hb-lift'); this._anim(s); }
    }
  }
  _freshFlush() {
    const list = (this.fresh || []).filter((s) => !s.locked && !s.cer);
    this.fresh = [];
    if (!list.length || list.length > 2 || document.body.classList.contains('at-title')) return;
    for (const s of list) this.introduce(s.feature, true);
  }

  // ------------------------------------------------------------ particles (hard pixels at the icon scale)
  _origin(s, at = 0.4) {
    const r = s.el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * at };
  }
  _spawn(name, x, y, vx, vy, { g = 0.1, life = 30 } = {}) {
    if (reduced() || this.parts.length > 60) return;
    const sp = sprite(name);
    const im = document.createElement('img');
    im.className = 'hb-part';
    im.src = sp.url;
    im.style.width = `${sp.w * PX}px`;
    im.style.height = `${sp.h * PX}px`;
    im.style.transform = 'translate(-999px, -999px)';
    this.fx.appendChild(im);
    this.parts.push({ im, x, y, vx, vy, g, life, t: 0, w: sp.w * PX, h: sp.h * PX });
    if (!this.raf) this.raf = requestAnimationFrame(() => this._tick());
  }
  _tick() {
    this.raf = 0;
    this.parts = this.parts.filter((p) => {
      p.t++;
      p.vy += p.g; p.x += p.vx; p.y += p.vy;
      if (p.t >= p.life) { p.im.remove(); return false; }
      // whole px, snapped to the icon's 2 px grid
      const X = Math.round((p.x - p.w / 2) / PX) * PX, Y = Math.round((p.y - p.h / 2) / PX) * PX;
      p.im.style.transform = `translate(${X}px, ${Y}px)`;
      if (p.t > p.life * 0.7) p.im.style.opacity = p.t % 4 < 2 ? '1' : '0';
      return true;
    });
    if (this.parts.length) this.raf = requestAnimationFrame(() => this._tick());
  }
  _burst(s, name, n, { spread = 1, up = 1, at = 0.4 } = {}) {
    const o = this._origin(s, at);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7 * spread + (Math.random() - 0.5) * 0.4;
      this._spawn(name, o.x, o.y, Math.cos(a) * 1.6 * spread, Math.sin(a) * 2 * up - 0.6, { g: 0.12, life: 22 + ((Math.random() * 10) | 0) });
    }
  }

  // ------------------------------------------------------------ the ceremony
  introduce(feature, auto = false) {
    const s = this._slot(feature);
    if (!s) return Promise.resolve();
    // the tour unlocking a feature and then introducing it gets one ceremony, not two
    if (s.introP && performance.now() - s.introAt < 8000) return s.introP;
    if (auto && this.game.tutorial?.active) return Promise.resolve(); // the tour introduces its own
    s.introAt = performance.now();
    const run = () => this._introduce(s).catch((e) => { console.warn('hotbar introduce', e); });
    this.queue = this.queue.then(run, run);
    s.introP = this.queue;
    return this.queue;
  }
  async _introduce(s) {
    const g = this.game;
    this.ceremony = s;
    s.cer = true;
    s.known = true;
    const wasEmpty = this.bar.classList.contains('empty');
    s.el.classList.add('hb-cer', 'hb-hide');
    if (this.bar.scrollWidth <= this.bar.clientWidth + 1) this.bar.classList.add('hb-cering'); // the pop may overshoot the bar
    try {
      if (!g.isOpen?.(s.feature)) g.unlockFeature?.(s.feature, { quiet: true });
      this.ui.refreshUnlocks?.();
      s.el.classList.remove('tool-new', 'unlock-pop');
      if (wasEmpty) { this.sfx('whoosh', { volume: 0.3 }); await wait(500); }
      // 1) the bar makes room
      this._bump(s.el, 'hb-grow');
      this.sfx('whoosh', { volume: 0.2 });
      await wait(260);
      // 2) lights down around the slot
      this._dim(s, true);
      this.sfx('spotlight', { volume: 0.35 });
      await wait(320);
      // 3) it pops in: dust, a thump
      s.el.classList.remove('hb-hide');
      this._bump(s.el, 'hb-pop');
      this.sfx('pop_in', { volume: 0.4 });
      this.later(() => { this.sfx('drop', { volume: 0.3 }); this._burst(s, 'dust', 6, { spread: 2.4, up: 0.5, at: 0.85 }); }, 160);
      await wait(420);
      // 4) sparkles + a NEW! tag
      this.sfx('star_pop', { volume: 0.3 });
      this.later(() => this.sfx('fanfare_small', { volume: 0.25 }), 80);
      for (let i = 0; i < 8; i++) this.later(() => this._burst(s, i % 2 ? 'spark' : 'star', 1, { spread: 2.6, up: 1.4, at: 0.3 }), i * 45);
      this._label(s, { title: 'NEW!', sub: s.el.dataset.name });
      await wait(1200);
      if (!s.spot) this._hideLabel();
      this._dim(s, false);
      await wait(240);
    } finally {
      s.el.classList.remove('hb-cer', 'hb-hide', 'hb-grow', 'hb-pop');
      this.bar.classList.remove('hb-cering');
      s.cer = false;
      if (this.ceremony === s) this.ceremony = null;
      this._dim(null, false, true);
      if (s.spot) this._label(s);
    }
  }

  // a dithered iris: the screen darkens around the slot in hard 2 px checks
  _dim(s, on, now = false) {
    const cv = this.$dim;
    clearInterval(this._dimI);
    if (!on) {
      if (now || !cv.classList.contains('on')) { cv.classList.remove('on'); return; }
      let lv = 3;
      this._dimI = setInterval(() => { lv--; if (lv <= 0) { clearInterval(this._dimI); cv.classList.remove('on'); return; } this._paintDim(this._dimAt, lv, 1); }, 60);
      return;
    }
    const r = s.el.getBoundingClientRect();
    this._dimAt = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) * 0.85 };
    cv.classList.add('on');
    let step = 0;
    this._paintDim(this._dimAt, 1, 4);
    this._dimI = setInterval(() => { step++; this._paintDim(this._dimAt, Math.min(3, 1 + step), Math.max(1, 4 - step)); if (step >= 3) clearInterval(this._dimI); }, 70);
  }
  _paintDim(at, level, grow) {
    const k = PX, cv = this.$dim;
    const W = Math.ceil(innerWidth / k), H = Math.ceil(innerHeight / k);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = `${W * k}px`; cv.style.height = `${H * k}px`; }
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H), d = new Uint32Array(img.data.buffer);
    const dark = ((0xb4 << 24) | (0x14 << 16) | (0x0a << 8) | 0x10) >>> 0; // ABGR: rgba(16,10,20,.7)
    const cx = at.x / k, cy = at.y / k, R0 = (at.r / k) * grow;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dd = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.1);
      let on;
      if (dd < R0) on = false;
      else if (dd < R0 + 3) on = level >= 2 && (x + y) % 2 === 0 && (x % 2 === 0 || level >= 3);
      else if (dd < R0 + 7) on = level >= 2 ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0;
      else on = level >= 3 ? (x + y) % 2 === 0 || x % 2 === 0 : level >= 2 ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0;
      if (on) d[y * W + x] = dark;
    }
    g.putImageData(img, 0, 0);
  }

  /** a pulsing ring + bob + name tag on one slot (the tutorial says "this one") */
  spotlight(feature, on = true) {
    const s = this._slot(feature);
    if (!s) return;
    on = !!on;
    if (!!s.spot === on) return;
    s.spot = on;
    s.el.classList.toggle('hb-spot', on);
    if (on) { this._label(s); this.sfx('spotlight', { volume: 0.18 }); this._burst(s, 'star', 2, { spread: 2, at: 0.3 }); }
    else if (this.labelFor === s) this._hideLabel();
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    clearInterval(this._idleI);
    this.mo?.disconnect();
    cancelAnimationFrame(this.raf);
    this.fx.remove();
  }
}
