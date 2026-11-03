// [v31 guide] Reynard's guide: the classroom-free stand-in for src/ui/TeacherOverlay.js, with the same
// interface so the tour (src/game/Tutorial.js) and the after-tour lessons (src/game/ext/lessons.js)
// can use either. No screen-running teacher, no chalk: Reynard speaks in the kinetic pixel text
// (src/ui/kinetic/floatText.js) and whatever he is talking about gets an animated pixel marker
// (pulsing corner brackets, a bobbing arrow, a burst when it lands).
//
// Where the words go: next to the thing he points at (above it, or under it near the top of the
// screen), else over Reynard's head out at the pond, else as a subtitle at the bottom.
//
//   show() / hide() / goTo(target) / aim(target)          -> Promises (instant)
//   say(html, { wait, dur, mood }) -> Promise              wait: tap / Space / Enter continues
//   circle(target, { color }) / underline / tick / star / cross / pulse(target) -> marks
//   arrow(from, to) / doodle(name, at)                     -> a marker / a floating glyph
//   clearChalk() -> Promise                                -> every mark goes
//   skip() / busy / visible / waiting / dispose()
// Targets: 'tool:<id>' (toolbar), 'sel:<css>', 'clock', an Element, { x, y } in CSS px, or a
// function returning one of those (re-read every frame, so marks follow moving things).
import { floatMarker } from './floatText.js';
import { sayLine, hideDialogue, hideDialogueSoon } from './dialogue.js'; // [v31 dialogue]

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const MOOD_STYLE = {
  normal: 'say', happy: 'happy', excited: 'excited', smug: 'say', wink: 'happy', proud: 'happy', shout: 'shout', angry: 'angry',
  scared: 'scared', think: 'think', whisper: 'whisper', scheming: 'whisper', sad: 'sad',
};
const FOX = '#ff9a3c';

/** resolve a guide target to a CSS px rect (or null) */
export function targetRect(target) {
  let t = target;
  if (typeof t === 'function') { try { t = t(); } catch { return null; } }
  if (!t) return null;
  let el = null;
  if (t instanceof Element) el = t;
  else if (typeof t === 'string') {
    if (t.startsWith('sel:')) el = document.querySelector(t.slice(4));
    else if (t.startsWith('tool:')) { const k = t.slice(5); el = document.querySelector(`#toolbar [data-panel="${k}"], #toolbar [data-tool="${k}"]`); }
    else if (t === 'clock') el = document.querySelector('#clockwrap, .bigclock-host');
  } else if (typeof t.x === 'number' && typeof t.y === 'number') {
    const w = t.w || 30, h = t.h || 30;
    return { left: t.x - w / 2, top: t.y - h / 2, width: w, height: h };
  }
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height, el };
}

export class KineticGuide {
  constructor({ game } = {}) {
    this.game = game;
    this.marks = [];
    this.pulsed = new Set();
    this.target = null;
    this.line = null;
    this._waiting = false;
    this._adv = null;
    this._onKey = (e) => {
      if (!this._waiting) return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this._adv?.(); }
    };
    this._onPtr = (e) => {
      if (!this._waiting) return;
      e.stopPropagation();
      e.preventDefault?.();
      this._adv?.();
    };
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('pointerdown', this._onPtr, true);
  }

  get visible() { return true; }
  get busy() { return this._waiting; }
  get waiting() { return this._waiting; }

  show() { return Promise.resolve(); }
  hide() { this.clearLine(); return this.clearChalk(); }
  goTo(target) { this.target = target || null; return wait(0.05); }
  aim(target) { this.target = target || null; }

  // ------------------------------------------------------------------ marks
  mark(target, o = {}) {
    if (!target) return Promise.resolve();
    const stop = floatMarker(() => { const r = targetRect(target); return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null; }, o);
    this.marks.push(stop);
    const r = targetRect(target);
    if (r?.el && !this.pulsed.has(r.el)) { r.el.classList.add('pulse'); this.pulsed.add(r.el); }
    return wait(0.12);
  }
  circle(target, o) { return this.mark(target, o); }
  underline(target, o) { return this.mark(target, o); }
  tick(target, o) { return this.mark(target, { ...o, color: 'green', arrow: false }); }
  cross(target, o) { return this.mark(target, { ...o, color: 'pink', arrow: false }); }
  star(target, o) { return this.mark(target, { ...o, color: 'yellow' }); }
  pulse(target, o) { this.mark(target, o); return () => this.clearChalk(); }
  arrow(from, to, o) { return this.mark(to || from, o); }
  doodle(name, at) {
    void name; void at; // [v31 dialogue] no loose floating glyphs
    return wait(0.1);
  }
  clearChalk() {
    for (const s of this.marks) s();
    this.marks = [];
    for (const el of this.pulsed) el.classList.remove('pulse');
    this.pulsed.clear();
    return Promise.resolve();
  }

  // ------------------------------------------------------------------ words
  // where the line floats: by the target, over Reynard, or a subtitle
  anchor() {
    const g = this.game;
    return () => {
      const W = innerWidth, H = innerHeight;
      const r = this.target ? targetRect(this.target) : null;
      if (r) {
        const cx = Math.max(140, Math.min(W - 140, r.left + r.width / 2));
        // the words go above the mark (and its arrow), or below it near the top
        return r.top < H * 0.3 ? [cx, r.top + r.height + 120] : [cx, r.top - 46];
      }
      const f = g?.fox;
      const inRoom = g?.lab?.active || g?.ui?.panel || document.body.classList.contains('lt-pc');
      if (f && f.rig?.root?.visible && !inRoom && g.rig) {
        const p = g.ui?.screenOf?.(f.x, f.y + 1.85, f.z);
        if (p?.visible && p.x > 40 && p.x < W - 40 && p.y > 60 && p.y < H - 40) return [p.x, p.y];
      }
      return [W / 2, H * 0.84];
    };
  }

  clearLine() { if (this.line) { this.line.dismiss(); this.line = null; } hideDialogue(); }
  /** the box goes to the top when the thing to tap sits low on the screen */
  boxPos() {
    const r = this.target ? targetRect(this.target) : null;
    return r && r.top + r.height / 2 > innerHeight * 0.55 ? 'top' : 'bottom';
  }

  say(html, { wait: w = true, dur = null, mood = 'normal' } = {}) {
    const g = this.game;
    this.clearLine();
    const text = String(html ?? '').replace(/<(?!\/?b>)[^>]+>/g, '');
    const style = MOOD_STYLE[mood] || 'say';
    const plain = text.replace(/<[^>]+>/g, '');
    const ms = (dur || Math.min(7, 2 + plain.length * 0.055)) * 1000;
    if (mood === 'excited' || mood === 'shout') g?.fox?.react?.('cheer', 1.2);
    const h = sayLine({ name: 'Reynard', color: FOX, portrait: { who: 'fox' }, text, style, voice: 'fox', pos: this.boxPos() });
    if (!h) return Promise.resolve();
    this.line = h;
    if (!w) {
      setTimeout(() => { if (this.line === h) { h.dismiss(); this.line = null; hideDialogueSoon(300); } }, ms);
      return wait(Math.min(1.2, ms / 1000));
    }
    return new Promise((res) => {
      let typed = false;
      h.typed.then(() => { typed = true; h.wait(true); });
      this._waiting = true;
      this._adv = () => {
        if (!typed) { h.skip(); return; }
        this._waiting = false;
        this._adv = null;
        h.dismiss();
        if (this.line === h) { this.line = null; hideDialogueSoon(400); }
        g?.audio?.play?.('click', { volume: 0.3 });
        res();
      };
    });
  }

  skip() { this._adv?.(); }
  dispose() {
    this.clearChalk();
    this.clearLine();
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('pointerdown', this._onPtr, true);
  }
}
