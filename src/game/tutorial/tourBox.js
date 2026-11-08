// [v33 tut2] The tour's dialogue box: the classroom's own speech box (src/game/Classroom.js _buildUI /
// _say, styled by src/ui/classroom.css: the wood-framed slate, Reynard's live 3D portrait, the name
// plate, the typed chalk text and the bouncing ▼), out in the world. Every line Reynard says during
// the day-1 tour goes here (the tour's talk, his lines in its Director scenes, the Fish Scope lesson).
//
//   const box = new TourBox(game);
//   await box.say('Tap the <b>e-Buy</b> button!', { mood: 'excited', target: el });     // stays up, resolves once typed
//   await box.say('Read me, then tap.', { wait: true });                                // resolves on a tap / Enter
//   box.hide(); box.dispose();
//
// It sits at the bottom of the screen and moves to the top when the thing being taught (target: an
// Element, a selector, 'sel:<selector>', a screen point { x, y }, a world thing, or () => any of those)
// would be under it. It steps out of the way while e-Buy or a class is on screen.
// A waiting line can always be tapped on (a clear layer over everything, Enter / Space too) and moves
// on by itself after `auto` seconds, so it never blocks the tour.
import '../../ui/classroom.css';
import { slateURL } from '../../ui/Chalkboard.js';
import { createFoxTalk } from '../../ui/FoxTalk3D.js';
import { FACE3D } from '../../ui/faceHook.js';
import { spriteImg, hasSprite } from '../../ui/sprites.js';
import { worldOf } from './marks.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the tour's moods (and the Director's line styles) -> FoxTalk3D expressions
const EXPR = {
  normal: 'teacher', say: 'teacher', teacher: 'teacher', happy: 'happy', excited: 'excited', scared: 'worried', worried: 'worried',
  scheming: 'scheming', whisper: 'scheming', smug: 'smug', angry: 'angry', sad: 'sad', laugh: 'laugh', greedy: 'greedy',
  focused: 'focused', shocked: 'shocked', shout: 'alarmed', think: 'think', proud: 'proud',
};
const PORTRAIT = { smug: 'smug', greedy: 'greedy', shocked: 'shocked', laugh: 'laugh', angry: 'angry', worried: 'worried', happy: 'laugh', excited: 'laugh', teacher: 'smug', scheming: 'greedy', focused: 'smug', proud: 'smug', sad: 'worried', alarmed: 'shocked', think: 'worried' };

/** the line's text as [{ text, bold }] (accepts <b>..</b>, **..** and *..*; other tags dropped) */
function segments(text) {
  const s = String(text).replace(/<b>(.*?)<\/b>/g, '\u0001$1\u0001').replace(/\*\*(.+?)\*\*/g, '\u0001$1\u0001').replace(/\*(.+?)\*/g, '\u0001$1\u0001').replace(/<[^>]+>/g, '');
  return s.split('\u0001').map((t, i) => ({ text: t, bold: i % 2 === 1 })).filter((p) => p.text);
}

export class TourBox {
  constructor(game, { name = 'REYNARD' } = {}) {
    this.game = game;
    this.name = name;
    this.el = null;
    this.type = null;
    this._wait = null;
    this.visible = false;
    this.place = 'bottom';
  }

  get waiting() { return !!this._wait; }

  _build() {
    if (this.el) return;
    const el = (this.el = document.createElement('div'));
    el.className = 'cls-ui tut-box';
    el.innerHTML = `
      <div class="cls-hit tut-box-hit tch-wait hidden" data-h="hit"></div>
      <div class="cls-say hidden" data-h="say">
        <div class="cls-portrait" data-h="portrait"></div>
        <div class="cls-body"><div class="cls-name">${esc(this.name)}</div><div class="cls-text" data-h="text"></div></div>
        <div class="cls-next" data-h="next">▼</div>
      </div>`;
    document.body.appendChild(el);
    try { this.q('say').style.backgroundImage = `url(${slateURL(96, 40, 9)})`; } catch { /* no canvas */ }
    const adv = (e) => {
      if (this.game.director?.active) return; // a scene: the Director's own tap handler moves the line on
      e.preventDefault(); e.stopPropagation();
      this.game.audio?.unlock?.();
      this.advance();
    };
    this.q('hit').addEventListener('pointerdown', adv);
    this.q('say').addEventListener('pointerdown', adv);
    for (const ev of ['click', 'pointerup']) { this.q('say').addEventListener(ev, (e) => e.stopPropagation()); this.q('hit').addEventListener(ev, (e) => e.stopPropagation()); }
    this._onKey = (e) => {
      if (!this.visible || !this._wait || this.game.director?.active) return;
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.advance(); }
    };
    window.addEventListener('keydown', this._onKey, true);
  }
  q(h) { return this.el?.querySelector(`[data-h="${h}"]`); }

  /**
   * Show a line. o: { mood, wait (tap to go on), target (keep the box off it), place ('top' | 'bottom'), auto (s) }
   * Resolves once it's typed (wait: false; the line stays up) or once it's tapped away (wait: true).
   */
  say(text, { mood = 'normal', wait = false, target = null, place = null, auto = null } = {}) {
    this._build();
    this._release();
    const box = this.q('say');
    this.target = target;
    this.forcePlace = place;
    this.visible = true;
    this._placeNow();
    const fresh = box.classList.contains('hidden');
    box.classList.remove('hidden');
    if (fresh) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; }
    this.el.classList.remove('gone');
    // the portrait: the live 3D talking bust (the classroom's), or his painted face
    const ex = EXPR[mood] || 'teacher';
    const pEl = this.q('portrait');
    if (this._ftk === undefined) this._ftk = createFoxTalk(pEl, { outfit: 'default', game: this.game });
    if (this._ftk) this._ftk.setExpression(ex);
    else {
      const url = FACE3D.url?.({ who: 'fox', expr: ex, outfit: 'default', frame: 'bust' }, 96, 96);
      const port = PORTRAIT[ex] || 'smug';
      pEl.innerHTML = url ? `<img src="${url}" width="96" height="96" alt="" draggable="false" style="image-rendering:pixelated">` : (hasSprite('fox_' + port) ? spriteImg('fox_' + port, 3) : '');
    }
    pEl.classList.remove('bop'); void pEl.offsetWidth; pEl.classList.add('bop');
    // the text, every letter its own span (typed in like the classroom's)
    const host = this.q('text');
    host.innerHTML = '';
    const atoms = [];
    for (const seg of segments(text)) {
      const wrap = seg.bold ? document.createElement('b') : host;
      if (seg.bold) host.appendChild(wrap);
      for (const word of seg.text.split(/( )/)) {
        if (!word) continue;
        const w = document.createElement('span');
        w.className = word === ' ' ? 'cls-sp' : 'cls-w';
        for (const ch of word) { const s = document.createElement('span'); s.className = 'cls-ch'; s.textContent = ch; w.appendChild(s); atoms.push(s); }
        wrap.appendChild(w);
      }
    }
    const plain = segments(text).map((p) => p.text).join('');
    this.q('next').classList.remove('on');
    let typedRes;
    const typed = new Promise((r) => { typedRes = r; });
    this.type = { atoms, i: 0, acc: 0, done: !atoms.length, res: typedRes, cps: 46, t0: performance.now() };
    if (this.type.done) typedRes();
    try { if (plain.trim()) this.game.audio?.babble?.('fox', plain); } catch { /* ignore */ }
    try { this._ftk?.talk(plain, { cps: 16 }); } catch { /* ignore */ }
    this._loop();
    if (!wait) return typed;
    // a waiting line: tap anywhere (outside a scene: the clear layer), Enter / Space, or `auto` seconds
    const done = new Promise((res) => {
      const w = (this._wait = { res, typed: false });
      typed.then(() => { if (this._wait === w) { w.typed = true; this.q('next')?.classList.add('on'); } });
      const secs = auto ?? Math.max(14, Math.min(30, 6 + plain.length * 0.12));
      w.timer = setTimeout(() => { if (this._wait === w) this._finishWait(); }, secs * 1000);
    });
    if (!this.game.director?.active) this.q('hit').classList.remove('hidden');
    return done;
  }

  /** a tap: finish typing, or move on from a waiting line */
  advance() {
    const t = this.type;
    if (t && !t.done) { this._finishType(); if (this._wait) return; }
    if (this._wait && (this._wait.typed || performance.now() - (t?.t0 || 0) > 250)) this._finishWait();
  }
  /** finish whatever is on (tests, the old teacher.skip()) */
  skip() { this._finishType(); this._finishWait(); }

  _finishType() {
    const t = this.type;
    if (!t || t.done) return;
    for (const a of t.atoms) a.classList.add('on');
    t.i = t.atoms.length; t.done = true; t.res();
    if (this._wait) { this._wait.typed = true; this.q('next')?.classList.add('on'); }
  }
  _finishWait() {
    const w = this._wait;
    if (!w) return;
    this._wait = null;
    clearTimeout(w.timer);
    this.q('next')?.classList.remove('on');
    this.q('hit')?.classList.add('hidden');
    w.res();
  }
  _release() { this._finishType(); this._finishWait(); }

  hide() {
    this._release();
    this.visible = false;
    this.target = null;
    try { this._ftk?.stopTalk(); } catch { /* ignore */ }
    if (!this.el) return;
    this.q('say')?.classList.add('hidden');
    this.q('hit')?.classList.add('hidden');
  }

  dispose() {
    this.hide();
    if (this._onKey) window.removeEventListener('keydown', this._onKey, true);
    this._onKey = null;
    try { this._ftk?.dispose(); } catch { /* ignore */ }
    this._ftk = undefined;
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.el?.remove();
    this.el = null;
  }

  // ---------------------------------------------------------------- typing + keeping clear of the lesson
  _loop() {
    if (this._raf) return;
    let last = performance.now(), placeT = 0;
    const step = (now) => {
      this._raf = 0;
      if (!this.el || !this.visible) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = this.type;
      if (t && !t.done) {
        t.acc += dt * t.cps;
        while (t.acc >= 1 && t.i < t.atoms.length) { t.atoms[t.i++].classList.add('on'); t.acc -= 1; }
        if (t.i >= t.atoms.length) { t.done = true; t.res(); }
      }
      placeT -= dt;
      if (placeT <= 0) { placeT = 0.3; this._placeNow(); }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  _placeNow() {
    const el = this.el;
    if (!el) return;
    const game = this.game;
    // e-Buy fills the screen (its own hand points at Buy It Now), a class has its own box
    el.classList.toggle('away', !!(game.ui?.ebuy || game.classroom?.active));
    const box = this.q('say');
    const h = (box && box.offsetHeight) || 124;
    const scene = !!game.director?.active;
    let side = this.forcePlace || 'bottom';
    if (!this.forcePlace) {
      const r = this._rect(this.target);
      if (r) {
        const W = innerWidth, H = innerHeight, bw = Math.min(760, W - 24), bx0 = (W - bw) / 2, bx1 = bx0 + bw;
        const pad = scene ? H * 0.11 : 14;
        const hits = (y0, y1) => r.right > bx0 && r.left < bx1 && r.bottom > y0 - 16 && r.top < y1 + 16;
        const bottomHit = hits(H - pad - h, H - pad), topHit = hits(pad, pad + h);
        if (bottomHit && !topHit) side = 'top';
      }
    }
    if (side !== this.place || !el.classList.contains(side)) { this.place = side; el.classList.toggle('top', side === 'top'); el.classList.toggle('bottom', side !== 'top'); }
  }

  /** the screen rect of a target (null if it has none) */
  _rect(t) {
    if (typeof t === 'function') { try { t = t(); } catch { t = null; } }
    if (!t) return null;
    if (typeof t === 'string') { try { t = document.querySelector(t.startsWith('sel:') ? t.slice(4) : t); } catch { t = null; } }
    if (t instanceof Element) { if (!t.isConnected) return null; const r = t.getBoundingClientRect(); return r.width || r.height ? r : null; }
    if (typeof t.x === 'number' && typeof t.y === 'number' && typeof t.z !== 'number' && !t.sp) return { left: t.x - 30, right: t.x + 30, top: t.y - 30, bottom: t.y + 30 };
    const p = worldOf(this.game, t);
    if (!p) return null;
    try {
      const q = this.game.ui.screenOf(p.x, p.y, p.z);
      return { left: q.x - 50, right: q.x + 50, top: q.y - 80, bottom: q.y + 30 };
    } catch { return null; }
  }
}
