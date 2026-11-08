// [v33 kit] Reynard's leather tool roll: the hotbar (#toolbar) as a physical object.
//
// A leather roll unrolled along the bottom of the screen: the rolled-up end on the left, a tie strap
// with a brass buckle on the right, and a stitched pocket per tool. Each tool is a hand-painted pixel
// object standing in its pocket (src/ui/kit/kitArt.js). Hover lifts it and plays its own little
// reaction; a press squashes it; the active tool is pulled out and lit; a locked pocket is stitched
// shut with a brass padlock (shown once the tour is over); a new tool is sewn in with a ceremony.
//
// The buttons keep the selectors the rest of the game uses:
//   #toolbar .tool[data-tool] / [data-panel] / [data-feature], classes .locked .active .pulse
//
//   kitMarkup(TOOLS)            -> the toolbar's inner HTML (UI.buildDOM)
//   const kit = new ToolKit(ui, TOOLS)
//   kit.introduce(feature)      -> Promise   the slot is sewn in with a ceremony (pop-in, dust, sparkle,
//                                            spotlight, sounds); unlocks the feature (quietly) if it
//                                            wasn't open yet. Resolves when the ceremony is over.
//   kit.spotlight(feature, on)  a pulsing dithered spotlight + bob + name label on one slot
//   kit.layout()                re-fit the pixel scale (resize)
//   kit.el(feature)             the slot's button
import './kit.css';
import { KIT, toolFrames, sleeveCanvas, sewnCanvas, mouthCanvas, glowCanvas, sheetURL, rollCanvas, strapCanvas, pxSprite } from './kitArt.js';
import { dpr } from '../uiScale.js';
import { CHAPTERS } from '../../data/questline.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const urlCache = new Map();
const urlOf = (key, mk) => { let u = urlCache.get(key); if (!u) { u = mk().toDataURL(); urlCache.set(key, u); } return u; };

// what each pocket holds, for the hover label
const NAME = { feed: 'Food scoop', hand: 'Carry net', tag: 'DO NOT EAT tags', pet: 'Petting feather', ebuy: 'e-Buy catalogue', build: 'Build', clear: 'Clear land', lab: 'Lab', match: 'Matchmaker', dex: 'Field guide', reviews: 'Restaurant', staff: 'Staff roster' };
// per-tool hover reaction: [frame, dy] steps (frames: 0 rest, 1 tilt L, 2 tilt R, 3 squash, 4 stretch) + particles
const REACT = {
  feed: { seq: [[4, -3], [1, -4], [2, -3], [0, -2]], fx: 'pellets' },
  hand: { seq: [[1, -2], [2, -3], [1, -2], [0, -2]] },
  tag: { seq: [[2, -3], [1, -2], [2, -2], [0, -2]] },
  pet: { seq: [[1, -2], [2, -3], [1, -2], [2, -2], [0, -2]], fx: 'heart' },
  ebuy: { seq: [[4, -4], [3, -1], [0, -2]], fx: 'coin' },
  build: { seq: [[1, -3], [3, -1], [2, -3], [0, -2]], fx: 'chips' },
  clear: { seq: [[2, -4], [1, -1], [3, 0], [0, -2]], fx: 'chips' },
  lab: { seq: [[4, -3], [0, -2], [3, -1], [0, -2]], fx: 'bubbles' },
  match: { seq: [[4, -4], [3, -1], [0, -2]], fx: 'heart' },
  dex: { seq: [[1, -2], [2, -2], [0, -2]], fx: 'spark' },
  reviews: { seq: [[1, -3], [2, -3], [0, -2]], fx: 'star' },
  staff: { seq: [[2, -3], [1, -2], [0, -2]], fx: 'spark' },
};
const keyOf = (t) => (t.tool === 'nurture' ? 'pet' : t.feature || t.tool || t.panel);

// how a locked pocket opens: the quest / chapter / research that unlocks it
function lockHint(feature) {
  for (const C of CHAPTERS) {
    for (const q of C.quests) if ((q.unlock || []).includes(feature) || (q.reward?.unlock || []).includes(feature)) return `Quest: ${q.title}`;
    if ((C.reward?.unlock || []).includes(feature)) return `Finish "${C.title}"`;
  }
  if (feature === 'staff') return 'Research: Staff Tent';
  return 'Keep playing';
}

// ---------------------------------------------------------------- markup
export function kitMarkup(TOOLS) {
  const btn = (t) => {
    const k = keyOf(t);
    const dig = t.key ? t.key % 10 : null;
    const name = t.label || NAME[k] || k;
    return `<button class="tool${t.tool === 'feed' ? ' active' : ''}" data-feature="${esc(t.feature)}" ${t.tool ? `data-tool="${esc(t.tool)}"` : `data-panel="${esc(t.panel)}"`} data-kit="${esc(k)}" data-name="${esc(name)}" data-key="${t.key || ''}" aria-label="${esc(t.title)}">`
      + '<span class="kit-slot">'
      + '<i class="kit-glow"></i><i class="kit-mouth"></i>'
      + '<span class="kit-lift"><canvas class="kit-tool" width="26" height="36"></canvas><i class="kit-twinkle"></i></span>'
      + `<img class="kit-sleeve" alt="" draggable="false" data-dig="${dig ?? ''}">`
      + '<img class="kit-sewn" alt="" draggable="false">'
      + '<i class="kit-ring"></i>'
      + (t.tool === 'feed' ? '<i class="kit-gauge"><b id="bag"></b></i>' : '')
      + (t.tool === 'tag' ? '<em class="kit-tagn" id="tagcnt"></em>' : '')
      + '</span></button>';
  };
  return `<i class="kit-roll" aria-hidden="true"></i><div class="kit-row">${TOOLS.map(btn).join('')}</div><i class="kit-strap" aria-hidden="true"></i>`;
}

// ---------------------------------------------------------------- component
export class ToolKit {
  constructor(ui, TOOLS = []) {
    this.ui = ui;
    this.game = ui.game;
    this.bar = document.getElementById('toolbar');
    this.bar.classList.add('kit');
    this.defs = new Map(TOOLS.map((t) => [t.feature, t]));
    this.timers = new Set();
    this.parts = [];
    this.queue = Promise.resolve();
    this.k = 2;
    this._paintStatic();
    // the fx layer: hover labels, particles, the ceremony spotlight (outside the toolbar so nothing clips)
    const fx = (this.fx = document.createElement('div'));
    fx.className = 'kit-fx';
    fx.innerHTML = '<canvas class="kit-dim"></canvas><div class="kit-label"><b></b><kbd></kbd><small></small></div>';
    document.body.appendChild(fx);
    this.$dim = fx.querySelector('.kit-dim');
    this.$label = fx.querySelector('.kit-label');
    this.slots = new Map();
    for (const b of this.bar.querySelectorAll('.tool')) this._initSlot(b);
    // class changes from anywhere (UI.onTool, refreshUnlocks, pulse, pointAt...) drive the look
    this.mo = new MutationObserver((ms) => { for (const m of ms) this._onClass(m.target); });
    for (const s of this.slots.values()) this.mo.observe(s.el, { attributes: true, attributeFilter: ['class'] });
    // a locked pocket answers with a rattle instead of reaching the toolbar's click handler
    this.bar.addEventListener('click', (e) => {
      const b = e.target.closest?.('.tool');
      if (b && b.classList.contains('locked')) { e.stopImmediatePropagation(); e.preventDefault(); this._rattle(this.slots.get(b)); }
    }, true);
    this.onResize = () => this.layout();
    addEventListener('resize', this.onResize);
    this.layout();
    this.sync(true);
    this.ready = true;
    // the tour ending shows the stitched-shut pockets; a lifted tool moves its label
    this._pollI = setInterval(() => {
      const st = this.game.state || {};
      const sewn = !!(st.tutorialDone || this.game.skipTutorial) && !this.game.tutorial?.active && !this.game.tutorialOnly;
      if (sewn !== this.bar.classList.contains('kit-showsewn')) this.sync();
      if (this.labelFor) this._placeLabel();
    }, 600);
  }

  el(feature) { for (const s of this.slots.values()) if (s.feature === feature || s.k === feature || s.el.dataset.tool === feature || s.el.dataset.panel === feature) return s.el; return null; }
  _slot(feature) { const b = this.el(feature); return b ? this.slots.get(b) : null; }
  sfx(n, o) { try { this.game.audio?.play(n, { volume: 0.3, ...(o || {}) }); } catch { /* optional */ } }
  later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }

  _paintStatic() {
    const roll = this.bar.querySelector('.kit-roll'), strap = this.bar.querySelector('.kit-strap'), row = this.bar.querySelector('.kit-row');
    if (roll) roll.style.backgroundImage = `url(${urlOf('roll', rollCanvas)})`;
    if (strap) strap.style.backgroundImage = `url(${urlOf('strap', strapCanvas)})`;
    if (row) row.style.backgroundImage = `url(${sheetURL()})`;
  }

  _initSlot(b) {
    const k = b.dataset.kit;
    const s = { el: b, k, feature: b.dataset.feature, cv: b.querySelector('.kit-tool'), lift: b.querySelector('.kit-lift'), frames: toolFrames(k) || toolFrames('feed'), frame: -1, dy: 0, seqT: 0, hover: false, locked: b.classList.contains('locked'), active: b.classList.contains('active') };
    s.ctx = s.cv.getContext('2d');
    const dig = b.querySelector('.kit-sleeve').dataset.dig;
    b.querySelector('.kit-sleeve').src = urlOf('sleeve' + dig, () => sleeveCanvas(dig === '' ? null : +dig));
    b.querySelector('.kit-sewn').src = urlOf('sewn', sewnCanvas);
    b.querySelector('.kit-mouth').style.backgroundImage = `url(${urlOf('mouth', mouthCanvas)})`;
    b.querySelector('.kit-glow').style.backgroundImage = `url(${urlOf('glow', glowCanvas)})`;
    b.querySelector('.kit-twinkle').style.backgroundImage = `url(${urlOf('spr_spark', () => pxSprite('spark'))})`;
    b.querySelector('.kit-ring').style.backgroundImage = `url(${urlOf('ring', ringCanvas)})`;
    this._draw(s, 0);
    this._setDy(s, this._rest(s));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') this._hover(s, true); });
    b.addEventListener('pointerleave', () => this._hover(s, false));
    b.addEventListener('pointerdown', (e) => this._press(s, e));
    b.addEventListener('pointerup', () => this._release(s));
    b.addEventListener('pointercancel', () => this._release(s, true));
    b.removeAttribute('title');
    this.slots.set(b, s);
  }

  // ------------------------------------------------------------ scale
  layout() {
    const r = dpr();
    const vw = innerWidth, vh = innerHeight;
    const open = [...this.slots.values()].filter((s) => this._shown(s)).length || 1;
    const artW = KIT.ROLL_W + open * KIT.SLOT_W + KIT.STRAP_W;
    // ~2 css px per art px at 1280x720, scaled with the screen; never taller than ~19% of it, never wider than it
    const want = Math.min(vw / 640, vh / 360);
    const fitW = (vw - 12) / artW, fitH = (vh * 0.19) / KIT.H;
    let k = Math.min(want, fitW, fitH, 4);
    // whole device px per art px
    const dev = Math.max(1, Math.floor(k * r + 1e-6));
    k = dev / r;
    if (k * r < 1) k = 1 / r;
    if (k !== this.k || !this._laid) {
      this.k = k;
      this._laid = true;
      this.bar.style.setProperty('--k', `${k}px`);
      this.fx.style.setProperty('--k', `${k}px`);
    }
    this.bar.classList.toggle('kit-scroll', artW * k > vw - 8);
  }

  // ------------------------------------------------------------ state
  _shown(s) { return !s.locked || this.bar.classList.contains('kit-showsewn'); }
  _rest(s) { return s.active ? -KIT.LIFT : s.hover ? -2 : 0; }
  _draw(s, f) {
    if (s.frame === f) return;
    s.frame = f;
    s.ctx.clearRect(0, 0, KIT.TOOL_W, KIT.TOOL_H);
    s.ctx.drawImage(s.frames[f] || s.frames[0], 0, 0);
  }
  _setDy(s, dy) { if (s.dy !== dy) { s.dy = dy; s.cv.style.setProperty('--dy', dy); } }
  // play a [frame, dy, ms?] sequence, then settle at rest
  _play(s, seq, step = 70, done) {
    clearTimeout(s.seqT);
    let i = 0;
    const next = () => {
      if (i >= seq.length) { this._draw(s, 0); this._setDy(s, this._rest(s)); s.seqT = 0; done?.(); return; }
      const [f, dy, ms] = seq[i++];
      this._draw(s, f);
      this._setDy(s, dy);
      s.seqT = setTimeout(next, ms || step);
    };
    if (reduced()) { i = seq.length; }
    next();
  }

  // the tour hides pockets you don't have yet; afterwards they show, stitched shut
  sync(first = false) {
    const g = this.game, st = g.state || {};
    const showSewn = !!(st.tutorialDone || g.skipTutorial) && !g.tutorial?.active && !g.tutorialOnly;
    this.bar.classList.toggle('kit-showsewn', showSewn);
    for (const s of this.slots.values()) {
      s.locked = s.el.classList.contains('locked');
      s.active = s.el.classList.contains('active');
      if (s.locked) s.el.dataset.hint = lockHint(s.feature);
    }
    if (first) for (const s of this.slots.values()) s.known = !s.locked;
    this.layout();
  }

  _onClass(b) {
    const s = this.slots.get(b);
    if (!s) return;
    const locked = b.classList.contains('locked'), active = b.classList.contains('active');
    if (locked !== s.locked) {
      s.locked = locked;
      if (!locked && !s.known && this.ready && !this.ceremony) {
        // a quiet unlock (quest / research): the pocket is sewn in, short version
        s.known = true;
        this.later(() => { if (!this.ceremony && !s.cer) this._popIn(s); }, 80);
      }
      if (!locked) s.known = true;
      this.sync();
    }
    if (active !== s.active) {
      s.active = active;
      if (active) {
        // pulled out of the pocket: stretch up, overshoot, settle
        this._play(s, [[3, 0, 50], [4, -3], [4, -7], [0, -KIT.LIFT - 1], [0, -KIT.LIFT]], 55);
        if (this.ready && !s.cer) this.sfx('grab', { volume: 0.18 });
        this._burst(s, 'spark', 3);
      } else {
        this._play(s, [[4, -3], [3, 1, 60], [0, 0]], 60);
      }
    }
  }

  // ------------------------------------------------------------ pointer
  _hover(s, on) {
    if (s.hover === on) return;
    s.hover = on;
    if (on) {
      this._showLabel(s);
      if (s.locked) { this._rattle(s, true); return; }
      if (s.cer) return;
      this.sfx('hover', { volume: 0.14 });
      const R = REACT[s.k] || REACT.dex;
      this._play(s, R.seq.map(([f, dy]) => [f, dy + (s.active ? -KIT.LIFT : 0)]), 75);
      if (R.fx) this.later(() => s.hover && this._toolFx(s, R.fx), 90);
    } else {
      if (!s.spot) this._hideLabel(s);
      if (!s.seqT && !s.cer) this._setDy(s, this._rest(s));
    }
  }
  _press(s, e) {
    if (s.locked || s.cer) return;
    s.down = true;
    clearTimeout(s.seqT); s.seqT = 0;
    this._draw(s, 3);
    this._setDy(s, this._rest(s) + 1);
    s.el.classList.add('kit-down');
    if (e.pointerType === 'touch') { this._showLabel(s); clearTimeout(s.lblT); s.lblT = setTimeout(() => { if (!s.spot) this._hideLabel(s); }, 1100); }
  }
  _release(s, cancel = false) {
    if (!s.down) return;
    s.down = false;
    s.el.classList.remove('kit-down');
    if (cancel) { this._draw(s, 0); this._setDy(s, this._rest(s)); return; }
    // the active change (if any) plays its own lift; otherwise spring back
    this.later(() => { if (!s.seqT) this._play(s, [[4, this._rest(s) - 2], [0, this._rest(s)]], 60); }, 0);
    this._burst(s, 'dust2', 3, { spread: 1.2, up: 0.6 });
  }
  _rattle(s, soft = false) {
    if (!s) return;
    const lock = s.el.querySelector('.kit-sewn');
    lock.classList.remove('kit-rattle'); void lock.offsetWidth; lock.classList.add('kit-rattle');
    if (!soft) { this.sfx('error', { volume: 0.22 }); this._showLabel(s); clearTimeout(s.lblT); s.lblT = setTimeout(() => { if (!s.hover) this._hideLabel(s); }, 1600); }
    else this.sfx('tick', { volume: 0.12 });
  }

  // ------------------------------------------------------------ label
  _showLabel(s, { title = null, sub = null } = {}) {
    const L = this.$label;
    const name = s.el.dataset.name || s.k;
    L.querySelector('b').textContent = title || (s.locked ? 'Sewn shut' : name);
    L.querySelector('kbd').textContent = !s.locked && !title && s.el.dataset.key && s.el.dataset.key !== '0' ? s.el.dataset.key : '';
    L.querySelector('small').textContent = sub || (s.locked ? s.el.dataset.hint || '' : '');
    L.classList.toggle('locked', s.locked && !title);
    L.classList.toggle('new', !!title);
    this.labelFor = s;
    this._placeLabel();
    L.classList.remove('on'); void L.offsetWidth; L.classList.add('on');
  }
  _placeLabel() {
    const s = this.labelFor;
    if (!s) return;
    const r = s.el.getBoundingClientRect();
    if (!r.width) return;
    const k = this.k;
    const top = r.top + (KIT.TOOL_Y + (s.active ? -KIT.LIFT : 0)) * k;
    const L = this.$label;
    L.style.left = `${Math.round(r.left + r.width / 2)}px`;
    L.style.top = `${Math.round(top)}px`;
  }
  _hideLabel(s) { if (this.labelFor === s) { this.$label.classList.remove('on'); this.labelFor = null; } }

  // ------------------------------------------------------------ particles (whole art px, hard pixels)
  _origin(s, ax = 13, ay = 10) {
    const r = s.el.getBoundingClientRect(), k = this.k;
    return { x: r.left + (KIT.TOOL_X + ax) * k, y: r.top + (KIT.TOOL_Y + ay + s.dy) * k };
  }
  _spawn(name, x, y, vx, vy, { g = 0.05, life = 40, fade = true } = {}) {
    if (reduced()) return;
    const c = pxSprite(name);
    const im = document.createElement('img');
    im.className = 'kit-part';
    im.src = urlOf('spr_' + name, () => c);
    im.style.width = `${c.width * this.k}px`;
    im.style.height = `${c.height * this.k}px`;
    this.fx.appendChild(im);
    this.parts.push({ im, x: x / this.k, y: y / this.k, vx, vy, g, life, t: 0, fade, w: c.width, h: c.height });
    if (!this.raf) this.raf = requestAnimationFrame((t) => this._tick(t));
  }
  _tick() {
    this.raf = 0;
    const k = this.k;
    this.parts = this.parts.filter((p) => {
      p.t++;
      p.vy += p.g; p.x += p.vx; p.y += p.vy;
      if (p.t >= p.life) { p.im.remove(); return false; }
      const X = Math.round(p.x - p.w / 2) * k, Y = Math.round(p.y - p.h / 2) * k;
      p.im.style.transform = `translate(${X}px, ${Y}px)`;
      if (p.fade && p.t > p.life * 0.7) p.im.style.opacity = (p.t % 4 < 2) ? '1' : '0';
      return true;
    });
    if (this.parts.length) this.raf = requestAnimationFrame((t) => this._tick(t));
  }
  _burst(s, name, n, { spread = 1, up = 1, ay = 12 } = {}) {
    const o = this._origin(s, 13, ay);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7 * spread + (Math.random() - 0.5) * 0.4;
      this._spawn(name, o.x, o.y, Math.cos(a) * 0.7 * spread, Math.sin(a) * 0.9 * up - 0.3, { g: 0.04, life: 22 + (Math.random() * 10) | 0 });
    }
  }
  _toolFx(s, fx) {
    const o = this._origin(s, 13, 4);
    if (fx === 'pellets') { for (let i = 0; i < 3; i++) this._spawn('pellet', o.x + (i - 1) * 3 * this.k, o.y, (i - 1) * 0.35, -0.9 - Math.random() * 0.4, { g: 0.08, life: 26 }); this.sfx('scoop', { volume: 0.12 }); }
    else if (fx === 'heart') { this._spawn('heart', o.x + 4 * this.k, o.y, 0.15, -0.45, { g: -0.004, life: 36 }); this.sfx('pet', { volume: 0.12 }); }
    else if (fx === 'coin') { this._spawn('coin', o.x, o.y, 0.3, -1.1, { g: 0.07, life: 28 }); this.sfx('coin', { volume: 0.1 }); }
    else if (fx === 'bubbles') { for (let i = 0; i < 3; i++) this.later(() => this._spawn('bubble', o.x + ((i % 2) * 2 - 1) * 2 * this.k, o.y, 0, -0.35, { g: -0.003, life: 30 }), i * 120); this.sfx('bubble', { volume: 0.1 }); }
    else if (fx === 'chips') { for (let i = 0; i < 3; i++) this._spawn('chip', o.x, o.y + 3 * this.k, (i - 1) * 0.6, -0.7, { g: 0.08, life: 22 }); this.sfx('tick', { volume: 0.12 }); }
    else if (fx === 'star') { this._spawn('star', o.x, o.y, 0, -0.4, { g: 0, life: 24 }); this.sfx('star_pop', { volume: 0.08 }); }
    else this._spawn('spark', o.x + 5 * this.k, o.y, 0, -0.2, { g: 0, life: 20 });
  }

  // ------------------------------------------------------------ appear
  // short sew-in for quiet unlocks: the pocket grows in, the tool drops into it
  async _popIn(s) {
    if (!this._visible()) return;
    s.cer = true;
    s.el.classList.add('kit-grow');
    this.sfx('pop_in', { volume: 0.3 });
    await wait(240);
    this._play(s, [[4, -16], [4, -9], [3, 1, 80], [4, -2], [0, this._rest(s)]], 55);
    await wait(170);
    this.sfx('drop', { volume: 0.25 });
    this._burst(s, 'dust', 4, { spread: 1.6, up: 0.4, ay: 20 });
    await wait(260);
    this._burst(s, 'star', 2, { spread: 1.4 });
    s.el.classList.remove('kit-grow');
    s.cer = false;
  }
  _visible() {
    const b = this.bar;
    if (!b.isConnected || b.classList.contains('empty')) return false;
    const cs = getComputedStyle(b);
    return cs.visibility !== 'hidden' && +cs.opacity > 0.05;
  }

  /** the full ceremony (tutorial): returns a Promise that resolves when it is over */
  introduce(feature) {
    const run = () => this._introduce(feature).catch((e) => { console.warn('kit introduce', e); });
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
  async _introduce(feature) {
    const s = this._slot(feature);
    if (!s) return;
    const g = this.game;
    this.ceremony = s;
    s.cer = true;
    s.known = true;
    const wasEmpty = this.bar.classList.contains('empty');
    s.el.classList.add('kit-cer', 'kit-hidden');
    try {
      if (!g.isOpen?.(s.feature)) g.unlockFeature?.(s.feature, { quiet: true });
      this.ui.refreshUnlocks?.();
      if (s.el.classList.contains('locked')) s.el.classList.remove('locked'); // skipTutorial / odd states: show it anyway
      this.sync();
      if (wasEmpty) { this.sfx('whoosh', { volume: 0.3 }); await wait(520); }
      // 1) the roll makes room
      s.el.classList.add('kit-grow');
      this.sfx('whoosh', { volume: 0.22 });
      await wait(260);
      // 2) lights down, a spotlight on the pocket
      this._dim(s, true);
      this.sfx('spotlight', { volume: 0.35 });
      await wait(300);
      // 3) the pocket is stitched on
      s.el.classList.remove('kit-hidden');
      s.el.classList.add('kit-stitching');
      for (let i = 0; i < 6; i++) {
        s.el.style.setProperty('--st', i + 1);
        if (i % 2 === 0) this.sfx('tick', { volume: 0.2, pitch: 1 + i * 0.08 });
        const o = this._origin(s, 1 + i * 5, 19);
        this._spawn('thread', o.x, o.y, 0, -0.2, { g: 0, life: 10 });
        await wait(75);
      }
      s.el.classList.remove('kit-stitching');
      // 4) the tool drops in from above
      s.el.classList.add('kit-drop');
      this.sfx('whoosh', { volume: 0.18 });
      this._play(s, [[4, -34, 40], [4, -26, 40], [4, -17, 40], [4, -8, 40], [3, 2, 90], [4, -4, 70], [0, 1, 60], [0, 0]], 50);
      await wait(200);
      s.el.classList.remove('kit-drop');
      this.sfx('drop', { volume: 0.35 });
      this.sfx('pop_in', { volume: 0.35 });
      this._burst(s, 'dust', 6, { spread: 2.2, up: 0.5, ay: 20 });
      await wait(260);
      // 5) sparkle + its name
      this.sfx('star_pop', { volume: 0.3 });
      this.later(() => this.sfx('fanfare_small', { volume: 0.25 }), 80);
      for (let i = 0; i < 7; i++) this.later(() => this._burst(s, i % 2 ? 'spark' : 'star', 1, { spread: 2.6, up: 1.3, ay: 6 }), i * 40);
      this._showLabel(s, { title: 'NEW!', sub: s.el.dataset.name });
      this._play(s, REACT[s.k]?.seq || REACT.dex.seq, 80);
      await wait(1100);
      if (!s.spot) this._hideLabel(s);
      this._dim(s, false);
      await wait(260);
    } finally {
      s.el.classList.remove('kit-cer', 'kit-hidden', 'kit-grow', 'kit-stitching', 'kit-drop');
      s.el.style.removeProperty('--st');
      s.cer = false;
      if (this.ceremony === s) this.ceremony = null;
      this._dim(null, false, true);
      this._draw(s, 0);
      this._setDy(s, this._rest(s));
    }
  }

  // the ceremony spotlight: the screen dithers dark around the pocket (an iris that closes in)
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
    this._dimAt = { x: r.left + r.width / 2, y: r.top + r.height * 0.55, r: Math.max(r.width, r.height) * 0.75 };
    cv.classList.add('on');
    let step = 0;
    this._paintDim(this._dimAt, 1, 4);
    this._dimI = setInterval(() => { step++; this._paintDim(this._dimAt, Math.min(3, 1 + step), Math.max(1, 4 - step)); if (step >= 3) clearInterval(this._dimI); }, 70);
  }
  _paintDim(at, level, grow) {
    const k = this.k, cv = this.$dim;
    const W = Math.ceil(innerWidth / k), H = Math.ceil(innerHeight / k);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = `${W * k}px`; cv.style.height = `${H * k}px`; }
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H), d = new Uint32Array(img.data.buffer);
    const dark = (0xb4 << 24) | (0x14 << 16) | (0x0a << 8) | 0x10; // ABGR: rgba(16,10,20,.7)
    const cx = at.x / k, cy = at.y / k, R0 = (at.r / k) * grow;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dd = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15);
      let on;
      if (dd < R0) on = false;
      else if (dd < R0 + 3) on = level >= 2 && (x + y) % 2 === 0 && (x % 2 === 0 || level >= 3);
      else if (dd < R0 + 7) on = level >= 2 ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0;
      else on = level >= 3 ? (x + y) % 2 === 0 || (x % 2 === 0) : level >= 2 ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0;
      if (on) d[y * W + x] = dark;
    }
    g.putImageData(img, 0, 0);
  }

  /** a pulsing spotlight on one pocket (the tutorial says "this one") */
  spotlight(feature, on = true) {
    const s = this._slot(feature);
    if (!s) return;
    on = !!on;
    if (s.spot === on) return;
    s.spot = on;
    s.el.classList.toggle('kit-spot', on);
    if (on) { this._showLabel(s); this.sfx('spotlight', { volume: 0.18 }); this._burst(s, 'star', 2, { spread: 2 }); }
    else if (!s.hover) this._hideLabel(s);
  }

  update() { if (this.labelFor) this._placeLabel(); }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.mo?.disconnect();
    clearInterval(this._pollI);
    removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.raf);
    this.fx.remove();
  }
}

// a dithered ring of light for kitSpotlight (pulses by swapping two CSS steps)
function ringCanvas() {
  const W = 40, H = 40;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    let col = null;
    if (d > 15 && d <= 17) col = '#fff3b0';
    else if (d > 17 && d <= 19 && (x + y) % 2 === 0) col = '#ffd23f';
    else if (d > 12.5 && d <= 15 && (x + y) % 2 === 0) col = '#ffe98a';
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}
