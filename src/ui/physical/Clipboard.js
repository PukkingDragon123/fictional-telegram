// [v33 paper] Clipboard: a physical, reusable pixel-art clipboard for UI that should feel
// like a real object, not a panel. A pressed-board backing, a steel spring clip, a stack
// of paper sheets (one per page), sticky index tabs, a dog-eared corner, a pencil lying
// on the board that really ticks the boxes, a coffee ring here and there. Pages flip up
// over the clip with a stepped pixel page-lift and curl (hard pixel frames, no 3D CSS).
//
//   const cb = new Clipboard({ root, sfx, onClose, onDispose(pageEl), onFlip(page, i), w, h, tabs })
//   cb.setPages([{ id, tab, color, title, sectionStart, paper, seed, coffee, render(el, ctx) }])
//   cb.open(id?)          open on a page (or flip to it when already open)
//   cb.show(id|index)     flip to a page (stepped page-lift animation)
//   cb.next() / cb.prev() / cb.refresh() / cb.close(silent) / cb.turnTo(pages, id)
//   cb.isOpen, cb.page, cb.pageEl, cb.P (CSS px per art px), cb.el
//   Flip: tap a tab or a dog-eared corner, swipe, or the arrow keys / PageUp / PageDown.
//
// Drawing helpers (all crisp pixel art at cb.P):
//   cb.hand(text, o)      pencil handwriting (pixel script font)       o: { color, maxW (CSS px), align, write }
//   cb.print(text, o)     printed form text (the game's pixel font)    o: { color, size: 's'|'l', cls, html }
//   cb.title(text, o)     a page title (game title face + pencil squiggle)
//   cb.stamp(text, color, o)  worn rubber stamp, pixel-rotated          o: { rot, font, frame, thunk }
//   cb.gauge(v, color, o) colored-pencil gauge                          o: { w, h }
//   cb.tickBox(on, o)     printed box (+ pencil tick)                   o: { cross, dim }
//   cb.tick(box) / cb.erase(box) -> Promise   the pencil ticks / rubs out a box
//   cb.tape(o) / cb.coffee(seed) / cb.sticky(html|node, o)
import './clipboard.css';
import { paperTexture } from '../paper.js';
import { pxTextCanvas } from '../kinetic/pxfont.js';
import { viewSize } from '../uiScale.js';
import { artPx, Pix, showCanvas, hexc, bay } from './pix.js';
import * as A from './clipArt.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const BACK = A.PAPER_BACK;
const INK = A.INK;
const SHADOW = hexc('#2a1c10');

let dimURL = null, hlURL = null, sqURL = null;
const dimTile = () => (dimURL ||= A.paintDim().url());
const hlTile = () => (hlURL ||= A.paintHighlight(8, 8).url());
// a repeating pencil squiggle for underlines (10 x 4 art px)
const squigTile = () => sqURL || (sqURL = (() => { const q = new Pix(10, 4), c = hexc('#e0763a'); for (let x = 0; x < 10; x++) { const y = 1 + Math.round(Math.sin((x / 10) * Math.PI * 2) * 1.1); q.set(x, y, c); if (x % 5 !== 2) q.set(x, y + 1, c, 130); } return q.url(); })());

export class Clipboard {
  constructor(o = {}) {
    this.o = o;
    this.pages = [];
    this.index = -1;
    this.el = null;
    this.cur = null;
    this.busy = false;
    this.queued = null;
    this.P = artPx();
  }
  get root() { return this.o.root || document.body; }
  get isOpen() { return !!this.el; }
  get page() { return this.pages[this.index] || null; }
  get pageEl() { return this.cur; }
  sfx(n, o = {}) { try { this.o.sfx?.(n, o); } catch { /* optional */ } }
  indexOf(id) {
    if (typeof id === 'number') return id;
    return this.pages.findIndex((p) => p.id === id);
  }

  // ------------------------------------------------------------------ pages
  setPages(pages) {
    const id = this.page?.id;
    this.pages = pages || [];
    if (!this.el) return;
    let i = this.pages.findIndex((p) => p.id === id);
    if (i < 0) i = Math.max(0, Math.min(this.index, this.pages.length - 1));
    this.index = i;
    this._tabs();
    this._stack();
    this._corners();
  }

  open(id) {
    let i = this.indexOf(id ?? 0);
    if (i < 0) i = 0;
    if (this.el) return this.show(i);
    this._build();
    this.index = i;
    this.cur = this._renderPage(i);
    this._tabs();
    this._stack();
    this._corners();
    this.sfx('paper', { volume: 0.5, pitch: 1.05 });
    setTimeout(() => this.el && this.sfx('tick', { volume: 0.35, pitch: 0.7 }), 300); // the clip snaps shut
    return Promise.resolve(true);
  }

  show(id, { anim = true } = {}) {
    const i = this.indexOf(id);
    if (i < 0 || i >= this.pages.length) return Promise.resolve(false);
    if (!this.el) return this.open(i);
    if (i === this.index && !this.busy) { this.refresh(); return Promise.resolve(true); }
    if (this.busy) { this.queued = i; return Promise.resolve(true); }
    return this._flipTo(i, anim);
  }
  next() { if (this.index < this.pages.length - 1) return this.show(this.index + 1); this._nudge(); return Promise.resolve(false); }
  prev() { if (this.index > 0) return this.show(this.index - 1); this._nudge(); return Promise.resolve(false); }

  /** Re-render the current page in place (after a change), keeping its scroll. */
  refresh() {
    if (!this.el || !this.cur) return;
    const old = this.cur, sc = old.querySelector('.pc-page-in')?.scrollTop || 0;
    this.cur = this._renderPage(this.index, old);
    const ni = this.cur.querySelector('.pc-page-in');
    if (ni) ni.scrollTop = sc;
    this._dispose(old);
    this._tabs();
    this._stack();
    this._corners();
  }

  close(silent = false) {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('pointerup', this._onUp, true);
    const pages = [...el.querySelectorAll('.pc-page')];
    const done = () => { for (const p of pages) this._dispose(p); el.remove(); };
    if (silent || REDUCED) done();
    else {
      el.classList.add('pc-bye');
      this.sfx('paper', { volume: 0.35, pitch: 0.85 });
      setTimeout(done, 260);
    }
    this.cur = null;
    this.busy = false;
    this.queued = null;
    try { this.o.onClose?.(); } catch (e) { console.error('[clipboard] onClose', e); }
  }

  // ------------------------------------------------------------------ build
  _build() {
    const P = (this.P = artPx());
    const { w: vw, h: vh } = viewSize();
    const tabs = this.o.tabs !== false;
    const narrow = vw < 700;
    const tabOut = tabs ? (narrow ? 22 : 34) : 0;
    const BW = Math.floor(Math.min(this.o.w || 880, vw - 20 - tabOut * P) / P);
    const BH = Math.floor(Math.min(this.o.h || 640, vh - 16) / P);
    this.BW = BW; this.BH = BH; this.tabOut = tabOut;
    // the sheet sits under the clip, a margin of board around it
    this.sx = 9; this.sy = 14;
    this.sw = BW - this.sx - 12;
    this.sh = BH - this.sy - 15;
    const board = A.paintBoard(BW, BH, { seed: this.o.seed || 3 });
    const clipC = A.paintClip(false), clipO = A.paintClip(true);
    const knob = A.paintCloseKnob();
    const ov = document.createElement('div');
    ov.className = 'pc-ov' + (this.o.cls ? ' ' + this.o.cls : '');
    ov.style.setProperty('--P', P + 'px');
    ov.style.setProperty('--dim', `url(${dimTile()})`);
    ov.style.setProperty('--hl', `url(${hlTile()})`); // highlighter swipe tile (hover rows)
    ov.style.setProperty('--squig', `url(${squigTile()})`); // pencil squiggle (underlines)
    ov.innerHTML = `<div class="pc-dim"></div><div class="pc-stage" role="dialog" aria-modal="true" aria-label="${(this.o.label || 'Clipboard').replace(/"/g, '')}">
      <div class="pc-tabs"></div><div class="pc-stackw"></div><div class="pc-sheets"></div>
      <button type="button" class="pc-corner pc-next" aria-label="Next page"></button><button type="button" class="pc-corner pc-prev" aria-label="Previous page"></button>
      <div class="pc-clip"></div><div class="pc-pencil"></div>
      <button type="button" class="pc-x" aria-label="Close"></button></div>`;
    const stage = ov.querySelector('.pc-stage');
    stage.style.width = (BW + tabOut + board.sh) * P + 'px';
    stage.style.height = (BH + board.sh) * P + 'px';
    const bc = showCanvas(board.pix, P, 'pc-board');
    stage.prepend(bc);
    // spring clip, centred at the top (protrudes above the board)
    const clip = ov.querySelector('.pc-clip');
    clip.append(showCanvas(clipC, P, 'pc-clip-c'), showCanvas(clipO, P, 'pc-clip-o'));
    this._place(clip, Math.round(BW / 2 - clipC.w / 2), -7);
    // close knob, top right of the board
    const x = ov.querySelector('.pc-x');
    x.append(showCanvas(knob, P));
    this._place(x, BW - knob.w - 3, 2);
    // sheets
    const sheets = ov.querySelector('.pc-sheets');
    this._place(sheets, this.sx, this.sy);
    sheets.style.width = this.sw * P + 'px';
    sheets.style.height = this.sh * P + 'px';
    const curl = document.createElement('canvas');
    curl.className = 'pc-px pc-curl';
    curl.width = this.sw; curl.height = this.sh;
    curl.style.width = this.sw * P + 'px'; curl.style.height = this.sh * P + 'px';
    sheets.appendChild(curl);
    this.curl = curl;
    this.curlG = curl.getContext('2d');
    this.curlImg = this.curlG.createImageData(this.sw, this.sh);
    // the pencil, lying on the board's bottom edge
    const pen = ov.querySelector('.pc-pencil');
    this.pen = { el: pen, rest: A.paintPencil(0, { len: 46 }), write: A.paintPencil(45, { len: 40 }), rub: A.paintPencil(-135, { len: 40 }) };
    for (const k of ['rest', 'write', 'rub']) { const c = showCanvas(this.pen[k].pix, P, 'pc-pen-' + k); this.pen[k].cv = c; pen.appendChild(c); }
    this._penRest();
    this.el = ov;
    this.stage = stage;
    this.sheets = sheets;
    this.tabsEl = ov.querySelector('.pc-tabs');
    this.stackEl = ov.querySelector('.pc-stackw');
    this.cNext = ov.querySelector('.pc-next');
    this.cPrev = ov.querySelector('.pc-prev');
    this._paintCorners();
    // input
    ov.addEventListener('pointerdown', (e) => e.stopPropagation());
    ov.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    ov.querySelector('.pc-dim').addEventListener('click', () => this.close());
    x.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('click', { volume: 0.4 }); this.close(); });
    x.addEventListener('pointerenter', () => this.sfx('hover', { volume: 0.25 }));
    this.cNext.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });
    this.cPrev.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
    for (const c of [this.cNext, this.cPrev]) c.addEventListener('pointerenter', () => this.sfx('paper', { volume: 0.12, pitch: 1.6 }));
    this.tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('.pc-tab');
      if (!b) return;
      e.stopPropagation();
      this.sfx('sticker', { volume: 0.25, pitch: 1.4 });
      this.show(+b.dataset.i);
    });
    this.tabsEl.addEventListener('pointerover', (e) => { const b = e.target.closest('.pc-tab'); if (b && b !== this._hovTab) { this._hovTab = b; this.sfx('hover', { volume: 0.18, pitch: 1.3 }); } });
    // swipe to flip (mouse drag or touch)
    sheets.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') this._sw = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; });
    this._onUp = (e) => {
      const s = this._sw;
      this._sw = null;
      if (!s || s.id !== e.pointerId || !this.el) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y, ad = Math.max(Math.abs(dx), Math.abs(dy));
      if (ad < 46 || performance.now() - s.t > 900) return;
      this._swiped = true;
      setTimeout(() => (this._swiped = false), 60);
      if (Math.abs(dx) > Math.abs(dy)) (dx < 0 ? this.next() : this.prev());
      else (dy < 0 ? this.next() : this.prev());
    };
    window.addEventListener('pointerup', this._onUp, true);
    sheets.addEventListener('click', (e) => {
      if (this._swiped) { e.stopPropagation(); e.preventDefault(); return; }
      if (this.busy) { e.stopPropagation(); e.preventDefault(); return; }
      try { this.o.onClick?.(e, this); } catch (err) { console.error('[clipboard] click', err); }
    }, true);
    this._onKey = (e) => {
      if (!this.el) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key;
      let hit = true;
      if (k === 'Escape') this.close();
      else if (k === 'ArrowRight' || k === 'PageDown' || k === 'ArrowDown') this.next();
      else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'ArrowUp') this.prev();
      else hit = false;
      if (hit) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', this._onKey, true);
    this.root.appendChild(ov);
  }
  _place(el, x, y) { el.style.left = x * this.P + 'px'; el.style.top = y * this.P + 'px'; }

  _paintCorners() {
    const P = this.P;
    for (const [btn, flip] of [[this.cNext, false], [this.cPrev, true]]) {
      btn.innerHTML = '';
      btn.append(showCanvas(A.paintDogEar(12, { flip }), P, 'pc-de-s'), showCanvas(A.paintDogEar(17, { flip }), P, 'pc-de-b'));
    }
  }
  _corners() {
    if (!this.el) return;
    const P = this.P, sx = this.sx, sy = this.sy, sw = this.sw, sh = this.sh;
    const hasN = this.index < this.pages.length - 1, hasP = this.index > 0;
    this.cNext.hidden = !hasN;
    this.cPrev.hidden = !hasP;
    this.cNext.style.left = (sx + sw - 17) * P + 'px';
    this.cNext.style.top = (sy + sh - 17) * P + 'px';
    this.cPrev.style.left = sx * P + 'px';
    this.cPrev.style.top = (sy + sh - 17) * P + 'px';
  }
  _stack() {
    if (!this.el) return;
    const n = Math.min(3, this.pages.length - 1 - this.index);
    this.stackEl.innerHTML = '';
    if (n <= 0) return;
    const c = showCanvas(A.paintStack(this.sw, this.sh, n), this.P, 'pc-stack');
    this.stackEl.appendChild(c);
    this._place(this.stackEl, this.sx, this.sy);
  }
  _tabs() {
    const box = this.tabsEl;
    if (!box) return;
    box.innerHTML = '';
    if (this.o.tabs === false || this.pages.length < 2) return;
    const P = this.P, step = 14, top = this.sy + 22;
    const avail = this.sh - 30;
    let list = this.pages.map((p, i) => i).filter((i) => this.pages[i].tab);
    if (list.length * step > avail) list = list.filter((i) => i === this.index || this.pages[i].sectionStart);
    if (list.length * step > avail) list = list.slice(0, Math.floor(avail / step));
    const narrow = this.tabOut < 34;
    list.forEach((i, k) => {
      const pg = this.pages[i], on = i === this.index;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pc-tab' + (on ? ' on' : '') + (i < this.index ? ' past' : '');
      b.dataset.i = i;
      b.title = pg.title || pg.tab;
      b.setAttribute('aria-label', pg.title || pg.tab);
      const label = String(pg.tab || '').toUpperCase().slice(0, narrow ? 4 : 8);
      b.appendChild(showCanvas(A.paintTab(label, pg.color || 'yellow', { on, w: narrow ? 36 : 52 }), P));
      b.style.left = (this.sx + this.sw - 8 + (on ? 3 : 0)) * P + 'px';
      b.style.top = (top + k * step) * P + 'px';
      box.appendChild(b);
    });
  }

  // ------------------------------------------------------------------ one sheet
  _renderPage(i, before = null) {
    const pg = this.pages[i], P = this.P;
    const el = document.createElement('div');
    el.className = 'pc-page' + (pg.cls ? ' ' + pg.cls : '');
    el.dataset.id = pg.id;
    const tex = paperTexture(pg.paper || 'cream', this.sw * P, this.sh * P, { px: P, seed: pg.seed ?? 3 + i * 7, edge: 0.22, edgeW: 5, ...(pg.paperOpts || {}) });
    el.style.backgroundImage = `url(${tex})`;
    el.innerHTML = '<div class="pc-page-deco"></div><div class="pc-page-in"></div>';
    const deco = el.firstChild;
    if (pg.coffee) {
      const cf = pg.coffee === true ? {} : pg.coffee;
      const c = this.coffee(cf.seed ?? i + 2, cf.r);
      c.style.left = (cf.x ?? this.sw - 46) * P + 'px';
      c.style.top = (cf.y ?? -6) * P + 'px';
      deco.appendChild(c);
    }
    if (this.pages.length > 1) {
      const f = this.print(`${i + 1} / ${this.pages.length}`, { cls: 'pc-folio' });
      deco.appendChild(f);
    }
    if (before) this.sheets.insertBefore(el, before); else this.sheets.insertBefore(el, this.curl);
    try { pg.render?.(el.querySelector('.pc-page-in'), { cb: this, page: pg, el, P }); } catch (e) { console.error('[clipboard] page', pg.id, e); }
    return el;
  }
  _dispose(el) {
    if (!el) return;
    const pg = this.pages.find((p) => p.id === el.dataset.id);
    try { pg?.dispose?.(el); this.o.onDispose?.(el); } catch (e) { console.error('[clipboard] dispose', e); }
    el.remove();
  }

  // ------------------------------------------------------------------ the page flip
  /** Swap in a new page list and turn forward to `id` (e.g. after the current page is gone). */
  turnTo(pages, id) {
    if (!this.el) { this.pages = pages || []; return this.open(id); }
    if (this.busy) { this.setPages(pages); return this.show(id); }
    this.pages = pages || [];
    const i = Math.max(0, this.indexOf(id));
    return this._flipTo(i, true, 1);
  }
  async _flipTo(i, anim, forceDir = 0) {
    this.busy = true;
    const dir = forceDir || (i > this.index ? 1 : -1);
    const from = this.cur;
    const to = this._renderPage(i);
    this.index = i;
    this.cur = to;
    this._tabs();
    this._corners();
    if (!anim || REDUCED) {
      this._dispose(from);
      this._stack();
      this.busy = false;
      this._afterFlip();
      return true;
    }
    this.sfx('page', { volume: 0.55, pitch: 0.92 + Math.random() * 0.16 });
    this.el.classList.add('pc-flipping');
    const top = dir > 0 ? from : to, under = dir > 0 ? to : from;
    top.style.zIndex = '3';
    under.style.zIndex = '2';
    const T = [0.06, 0.16, 0.28, 0.42, 0.57, 0.71, 0.84, 0.95, 1.01];
    const seq = dir > 0 ? T : [...T].reverse().concat([0]);
    if (dir < 0) this._frame(top, 1.01);
    for (const t of seq) {
      this._frame(top, t);
      await wait(t > 0.3 && t < 0.8 ? 38 : 48);
      if (!this.el) return false;
    }
    this._frame(top, 0);
    top.style.zIndex = '';
    under.style.zIndex = '';
    this._dispose(from);
    this._stack();
    this.el.classList.remove('pc-flipping');
    this.el.classList.add('pc-snap');
    setTimeout(() => this.el?.classList.remove('pc-snap'), 160);
    this.sfx('tick', { volume: 0.22, pitch: 0.75 });
    this.busy = false;
    this._afterFlip();
    return true;
  }
  _afterFlip() {
    try { this.o.onFlip?.(this.page, this.index); } catch (e) { console.error('[clipboard] onFlip', e); }
    if (this.queued != null) {
      const q = this.queued;
      this.queued = null;
      if (q !== this.index && q < this.pages.length) this._flipTo(q, true);
    }
  }
  _nudge() {
    if (!this.el || this.busy) return;
    this.el.classList.remove('pc-nudge');
    void this.el.offsetWidth;
    this.el.classList.add('pc-nudge');
    this.sfx('paper', { volume: 0.15, pitch: 1.8 });
  }

  // one stepped frame: the page is lifted from its bottom-right corner up to the fold line,
  // its back curls over the front, and it throws a dithered shadow on the sheet below.
  _frame(el, t) {
    const W = this.sw, H = this.sh, P = this.P, g = this.curlG;
    if (t <= 0) { el.style.clipPath = ''; el.style.visibility = ''; g.clearRect(0, 0, W, H); return; }
    if (t >= 1) { el.style.visibility = 'hidden'; el.style.clipPath = ''; g.clearRect(0, 0, W, H); return; }
    el.style.visibility = '';
    const a = 0.66 + (0.08 - 0.66) * t;
    const nx = Math.sin(a), ny = Math.cos(a);
    const D = t * (W * nx + H * ny);
    const S = (x, y) => (x - W) * nx + (y - H) * ny + D;
    const R = [[0, 0], [W, 0], [W, H], [0, H]], poly = [];
    for (let k = 0; k < 4; k++) {
      const p0 = R[k], p1 = R[(k + 1) % 4], s0 = S(p0[0], p0[1]), s1 = S(p1[0], p1[1]);
      if (s0 <= 0) poly.push(p0);
      if ((s0 <= 0) !== (s1 <= 0)) { const u = s0 / (s0 - s1); poly.push([p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u]); }
    }
    el.style.clipPath = poly.length >= 3 ? `polygon(${poly.map(([x, y]) => `${(x * P).toFixed(1)}px ${(y * P).toFixed(1)}px`).join(',')})` : 'polygon(0 0,0 0,0 0)';
    const img = this.curlImg, d = img.data;
    d.fill(0);
    const k = 0.52, sh = 2 + Math.round(4 * (1 - t));
    const put = (i, c, al = 255) => { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = al; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const qx = x + 0.5, qy = y + 0.5, v = S(qx, qy), i = (y * W + x) * 4;
      if (v >= 0) {
        if (v < 1) put(i, INK);
        else if (v < 1 + sh && ((x + y) & 1) === 0) put(i, SHADOW, v < 3 ? 150 : 95);
        continue;
      }
      const dd = -v, m = dd + dd / k;
      const sx = qx + nx * m, sy = qy + ny * m;
      if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
      if (sx < 1 || sy < 1 || sx > W - 1 || sy > H - 1) { put(i, INK); continue; }
      // the roll of the curl: a dark lip, a lit crest, then the flat back with a little falloff
      let c;
      const far = Math.min(sx - 1, sy - 1, W - 1 - sx, H - 1 - sy); // distance to the lifted sheet's free edge
      if (dd < 1.4) c = BACK[0];
      else if (dd < 2.6) c = BACK[2];
      else if (dd < 5.2) c = BACK[5];
      else if (dd < 7.4) c = bay(x, y) < 0.5 ? BACK[5] : BACK[4];
      else if (dd < 12) c = BACK[4];
      else if (dd < 18) c = bay(x, y) < 0.5 ? BACK[3] : BACK[4];
      else c = bay(x, y) < 0.15 ? BACK[2] : BACK[3];
      if (far < 3 && dd > 3) c = BACK[1]; // the shaded free edge
      put(i, c);
    }
    g.putImageData(img, 0, 0);
  }

  // ------------------------------------------------------------------ the pencil
  _penShow(kind, x, y) {
    const pen = this.pen;
    if (!pen) return;
    for (const k of ['rest', 'write', 'rub']) pen[k].cv.style.display = k === kind ? 'block' : 'none';
    this._place(pen.el, Math.round(x), Math.round(y));
  }
  _penRest() { this._penShow('rest', 26, this.BH - 12); }
  // art px position of an element's top-left on the stage
  _artPos(el) {
    const r = el.getBoundingClientRect(), s = this.stage.getBoundingClientRect();
    return [Math.round((r.left - s.left) / this.P), Math.round((r.top - s.top) / this.P)];
  }
  async _penTo(kind, tx, ty, steps = 3) {
    const pen = this.pen, sp = pen[kind];
    const cx = parseFloat(pen.el.style.left) / this.P, cy = parseFloat(pen.el.style.top) / this.P;
    const ex = tx - sp.tip[0], ey = ty - sp.tip[1];
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      this._penShow(kind, cx + (ex - cx) * u, cy + (ey - cy) * u - Math.sin(u * Math.PI) * 10);
      await wait(26);
    }
  }
  /** The pencil ticks a tickBox() canvas. */
  async tick(box) {
    if (!this.el || !box) return;
    const [bx, by] = this._artPos(box);
    const path = A.TICK_PATH;
    if (REDUCED) { this._drawBox(box, path.length); return; }
    this.busy = true;
    await this._penTo('write', bx + path[0][0], by + path[0][1]);
    this.sfx('pen', { volume: 0.45 });
    for (let n = 1; n <= path.length; n++) {
      this._drawBox(box, n);
      const [px, py] = path[n - 1];
      this._penShow('write', bx + px - this.pen.write.tip[0], by + py - this.pen.write.tip[1]);
      await wait(n < 4 ? 30 : 18);
      if (!this.el) return;
    }
    await wait(60);
    await this._penTo('write', bx + 16, by - 8, 2);
    this._penRest();
    this.busy = false;
  }
  /** The pencil turns round and rubs a tick out. */
  async erase(box) {
    if (!this.el || !box) return;
    const [bx, by] = this._artPos(box);
    if (REDUCED) { this._drawBox(box, 0); return; }
    this.busy = true;
    const rub = this.pen.rub;
    const at = (x, y) => this._penShow('rub', x - rub.end[0], y - rub.end[1]);
    // hop over with the eraser end down
    const cx = parseFloat(this.pen.el.style.left) / this.P, cy = parseFloat(this.pen.el.style.top) / this.P;
    for (let s = 1; s <= 3; s++) { const u = s / 3; this._penShow('rub', cx + (bx + 6 - rub.end[0] - cx) * u, cy + (by + 6 - rub.end[1] - cy) * u - Math.sin(u * Math.PI) * 10); await wait(26); }
    this.sfx('paper', { volume: 0.4, pitch: 1.5 });
    const n = A.TICK_PATH.length;
    for (let f = 0; f < 7; f++) {
      at(bx + 5 + (f % 2 ? 4 : 0), by + 5 + (f % 3 === 1 ? 1 : 0));
      this._drawBox(box, Math.max(0, Math.round(n * (1 - (f + 1) / 6))));
      if (f === 3) this.sfx('paper', { volume: 0.3, pitch: 1.7 });
      await wait(40);
      if (!this.el) return;
    }
    this._crumbs(bx + 7, by + 9);
    this._drawBox(box, 0);
    this._penRest();
    this.busy = false;
  }
  _drawBox(box, n) {
    const o = box._o || {};
    const p = A.paintTickBox({ ...o, ticks: n });
    box.getContext('2d').putImageData(new ImageData(p.d, p.w, p.h), 0, 0);
  }
  _crumbs(x, y) {
    const P = this.P;
    for (let k = 0; k < 5; k++) {
      const c = document.createElement('i');
      c.className = 'pc-crumb';
      c.style.cssText = `left:${(x + k * 2 - 4) * P}px;top:${y * P}px;width:${P * (k % 2 ? 1 : 2)}px;height:${P}px;--dx:${(k - 2) * 3 * P}px;--dy:${(4 + (k % 3) * 2) * P}px;animation-delay:${k * 20}ms`;
      this.stage.appendChild(c);
      setTimeout(() => c.remove(), 600);
    }
  }

  // ------------------------------------------------------------------ drawing helpers
  hand(text, o = {}) {
    // o.maxW is in CSS px; the bitmap font wraps in art px
    const c = pxTextCanvas(String(text ?? ''), { font: 'script', color: o.color || A.GRAPHITE, bleed: o.bleed || (o.color ? undefined : A.GRAPHITE_LT), scale: this.P, maxW: o.maxW ? Math.max(24, Math.floor(o.maxW / this.P)) : undefined, maxLines: o.maxLines, align: o.align });
    c.classList.add('pc-hand');
    if (o.write && !REDUCED) { c.classList.add('pc-write'); c.style.setProperty('--n', Math.max(3, Math.min(14, String(text).length))); }
    return c;
  }
  /** Printed form text in the game's pixel font (DOM, so it stays the game's own face). */
  print(text, o = {}) {
    const e = document.createElement('span');
    e.className = 'pc-pr' + (o.cls ? ' ' + o.cls : '') + (o.size ? ' pc-pr-' + o.size : '');
    if (o.color) e.style.color = o.color;
    if (o.html) e.innerHTML = o.html; else e.textContent = String(text ?? '');
    return e;
  }
  /** A page title in the game's title face with a pencil squiggle under it. */
  title(text, o = {}) {
    const e = document.createElement('div');
    e.className = 'pc-ttl';
    if (o.color) e.style.color = o.color;
    if (o.html) e.innerHTML = o.html; else e.textContent = String(text ?? '');
    const sq = new Pix(Math.max(24, Math.min(140, Math.round(String(text ?? '').length * 6.5))), 4);
    const c = hexc(o.line || '#e0763a');
    for (let x = 0; x < sq.w; x++) { const y = 1 + Math.round(Math.sin(x * 0.45) * 0.9); sq.set(x, y, c); if (x % 5 !== 0) sq.set(x, y + 1, c, 140); }
    e.appendChild(showCanvas(sq, this.P, 'pc-squig'));
    return e;
  }
  stamp(text, color = '#b8282c', o = {}) {
    const c = showCanvas(A.paintStamp(String(text), color, { rot: o.rot ?? -8, font: o.font || 'bold', frame: o.frame || 'double', seed: o.seed ?? String(text).length * 7 }), this.P, 'pc-stamp' + (o.thunk ? ' pc-thunk' : ''));
    return c;
  }
  pips(n, max = 5, o = {}) { return showCanvas(A.paintPips(n, max, o), this.P, 'pc-pips'); }
  gauge(v, color = 'green', o = {}) { return showCanvas(A.paintGauge(v, color, { w: o.w || 36, h: o.h || 8, seed: o.seed || 1 }), this.P, 'pc-gauge'); }
  tickBox(on, o = {}) {
    const box = showCanvas(A.paintTickBox({ ticks: on ? A.TICK_PATH.length : 0, cross: o.cross, dim: o.dim }), this.P, 'pc-box');
    box._o = { cross: o.cross, dim: o.dim };
    return box;
  }
  tape(o = {}) { return showCanvas(A.paintTape(o.w || 24, o.h || 8, { color: o.color, seed: o.seed || 3 }), this.P, 'pc-tape'); }
  coffee(seed = 2, r = 17) { return showCanvas(A.paintCoffee(r, seed), this.P, 'pc-coffee'); }
  /** A sticky note with tape, holding html / a node. */
  sticky(content, o = {}) {
    const P = this.P, w = o.w || 92, h = o.h || 34;
    const el = document.createElement(o.button ? 'button' : 'div');
    if (o.button) el.type = 'button';
    el.className = 'pc-sticky' + (o.cls ? ' ' + o.cls : '');
    el.style.width = w * P + 'px';
    el.style.minHeight = h * P + 'px';
    el.style.backgroundImage = `url(${paperTexture('sticky', w * P, h * P, { px: P, sticky: 1, seed: o.seed || 4 })})`;
    const t = this.tape({ w: 20, seed: o.seed || 4 });
    t.classList.add('pc-sticky-tape');
    el.appendChild(t);
    const inner = document.createElement('div');
    inner.className = 'pc-sticky-in';
    if (typeof content === 'string') inner.innerHTML = content; else if (content) inner.appendChild(content);
    el.appendChild(inner);
    return el;
  }
}

/** A plain Pix (for page painters that want their own art). */
export { Pix };
