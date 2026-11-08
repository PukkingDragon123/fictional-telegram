// [v33 tut] Marks for the day-1 tour, made from the game's own art.
//
// World marks: the tutorial's bouncing pixel hand (the `cursor_hand` icon, the same pointer
// UI.pointAt uses) hanging over a thing in the pond / on the land, the game's own water-ripple rings
// (the `ring_l` FX the food plops make) pulsing around it, and an optional name tag in the egg-tag
// style. They follow their target every frame (a fish swims, the hand swims with it).
//
// UI marks: the same hand pointing at a DOM element, above everything (the Fish Scope, e-Buy, the lab
// tree, which the TeacherOverlay can't reach), and a gold outline on the element.
//
//   const M = new TourMarks(game);
//   const h = M.spot(fish, { label: 'BOY', color: 'blue' });   // hand + ripples + tag; h.stop()
//   M.ring([x, z], { r: 1.2 }); M.arrow(egg);
//   const u = M.ui('.fsc-call[data-k="hunger"]', { label: 'TAP!' });  // u.stop()
//   M.clear(); M.dispose();
//
// Targets: fish / bears / beavers (x, z, y), eggs ({ x, y, z }), structures ({ x, z, def }: the tile
// centre), [x, z] (ground height looked up), { getWorldPos(v) }, or () => any of those.
import * as THREE from 'three';
import { WATER_Y } from '../../world/grid.js';
import { FX } from '../Particles.js';
import { spriteURL, hasSprite } from '../../ui/sprites.js';
import '../../ui/teacher.css'; // the tags / hands / outline styles

const HAND = 3; // the pointer's scale (UI.pointAt draws it at ico('cursor_hand', 3))
const TINT = { gold: [1.3, 1.15, 0.6], blue: [0.75, 0.95, 1.3], pink: [1.35, 0.8, 1.05], green: [0.85, 1.3, 0.75], red: [1.4, 0.7, 0.6] };
const TAGC = { gold: '#ffd23a', blue: '#6ac8ff', pink: '#ff8ac8', green: '#8ae05a', red: '#ff6a4a' };
const _v = new THREE.Vector3();

const handHTML = () => (hasSprite('cursor_hand') ? `<img class="px" src="${spriteURL('cursor_hand', HAND)}" alt="" draggable="false">` : '<b>▼</b>');

/** where a target is in the world right now ({ x, y, z } or null) */
export function worldOf(game, t, out = { x: 0, y: 0, z: 0 }) {
  if (typeof t === 'function') t = t();
  if (!t) return null;
  if (t.dead || t.removed) return null;
  if (Array.isArray(t)) {
    const g = game.grid;
    let y = 0;
    try { const tx = Math.floor(t[0]), tz = Math.floor(t[1]); y = g.isWater(tx, tz) ? WATER_Y : g.surfaceY(tx, tz); } catch { y = 0; }
    out.x = t[0]; out.y = t[2] ?? y; out.z = t[1];
    return out;
  }
  if (typeof t.getWorldPos === 'function') { t.getWorldPos(_v); out.x = _v.x; out.y = _v.y; out.z = _v.z; return out; }
  if (t.def && typeof t.x === 'number' && game.structures?.baseY) { // a structure: its footprint centre
    const sz = Array.isArray(t.def.size) ? t.def.size : [1, 1];
    out.x = t.x + sz[0] / 2; out.z = t.z + sz[1] / 2;
    try { out.y = game.structures.baseY(t); } catch { out.y = 0; }
    return out;
  }
  if (typeof t.x === 'number' && typeof t.z === 'number') {
    out.x = t.x; out.z = t.z;
    out.y = typeof t.y === 'number' ? t.y : 0;
    if (t.sp && t.g) out.y = Math.max(WATER_Y - 0.05, t.y || WATER_Y); // a fish: mark it at the surface
    return out;
  }
  return null;
}

export class TourMarks {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.uiList = [];
    this._raf = 0;
    this._last = 0;
    this._tick = (now) => this.frame(now);
  }

  // ---------------------------------------------------------------- world marks
  /** hand + ripples (+ a tag when `label` is set). o: { r (ripple size, world units), color, label, arrow, ring, lift } */
  spot(target, o = {}) { return this._add(target, { ring: true, arrow: true, ...o }); }
  ring(target, o = {}) { return this._add(target, { ring: true, arrow: false, ...o }); }
  arrow(target, o = {}) { return this._add(target, { ring: false, arrow: true, ...o }); }

  _add(target, o) {
    this._build();
    const color = TINT[o.color] ? o.color : 'gold';
    const m = { target, ring: !!o.ring, arrow: o.arrow !== false && !!o.arrow, r: o.r ?? 0.55, lift: o.lift ?? 0.5, color, t: 0, ringT: 0, dead: false, hand: null, label: null };
    if (m.arrow) {
      const el = document.createElement('div');
      el.className = 'tutm-hand';
      el.innerHTML = handHTML();
      this.layer.appendChild(el);
      m.hand = el;
    }
    if (o.label) {
      const el = document.createElement('div');
      el.className = 'tutm-tag';
      el.style.setProperty('--rc', TAGC[color]);
      el.textContent = o.label;
      this.layer.appendChild(el);
      m.label = el;
    }
    this.list.push(m);
    this.game.audio?.play?.('pop_in', { volume: 0.25, pitch: 1.5 });
    this._wake();
    return { stop: () => { m.dead = true; m.hand?.remove(); m.label?.remove(); this._wake(); }, mark: m };
  }

  // ---------------------------------------------------------------- UI marks
  /** the pointing hand on a DOM element (Element | css selector | () => Element). o: { side: 'auto'|'top'|'bottom'|'left'|'right', label } */
  ui(target, o = {}) {
    this._build();
    const el = document.createElement('div');
    el.className = 'tutm-uihand';
    el.innerHTML = handHTML() + (o.label ? `<b class="tutm-tag tutm-uitag">${o.label}</b>` : '');
    this.top.appendChild(el);
    const m = { target, el, side: o.side || 'auto', dead: false, hot: null };
    this.uiList.push(m);
    this._wake();
    return { stop: () => { m.dead = true; el.remove(); m.hot?.classList.remove('tutm-hot'); this._wake(); } };
  }

  clear() {
    for (const m of this.list) { m.dead = true; m.hand?.remove(); m.label?.remove(); }
    for (const m of this.uiList) { m.dead = true; m.el.remove(); m.hot?.classList.remove('tutm-hot'); }
    this._wake();
  }

  dispose() {
    this.clear();
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.layer?.remove(); this.top?.remove();
    this.layer = null;
  }

  // ---------------------------------------------------------------- loop
  _build() {
    if (this.layer) return;
    const layer = (this.layer = document.createElement('div'));
    layer.className = 'tutm-layer';
    document.body.appendChild(layer);
    const top = (this.top = document.createElement('div'));
    top.className = 'tutm-top';
    document.body.appendChild(top);
  }

  _wake() {
    if (this._raf || !this.layer) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  frame(now) {
    this._raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this.list = this.list.filter((m) => !m.dead);
    this.uiList = this.uiList.filter((m) => !m.dead);
    this._placeWorld(dt);
    this._placeUI();
    if (this.list.length || this.uiList.length) this._raf = requestAnimationFrame(this._tick);
  }

  _placeWorld(dt) {
    const game = this.game;
    const hide = !!(game.lab?.active || document.body.classList.contains('lab-mode') || game.classroom?.active || document.querySelector('.fsc'));
    const rig = game.overrideRig || game.rig;
    const R = game.renderer;
    for (const m of this.list) {
      m.t += dt;
      const p = worldOf(game, m.target, m.p || (m.p = { x: 0, y: 0, z: 0 }));
      const off = () => { if (m.hand) m.hand.style.display = 'none'; if (m.label) m.label.style.display = 'none'; };
      if (!p || hide) { off(); continue; }
      // the ripples: the game's own water rings, pulsing out from the thing
      m.ringT -= dt;
      if (m.ring && m.ringT <= 0) {
        m.ringT = 0.75;
        const F = game.particles?.fx;
        try { F?.spawn('ring_l', p.x, Math.max(p.y, WATER_Y) + 0.015, p.z, { life: 1.1, size: m.r * 0.9, flags: FX.FLAT | FX.FADE | FX.GROW, tint: TINT[m.color], bright: true }); } catch { /* ignore */ }
      }
      const c = rig.worldToScreen(_v.set(p.x, p.y, p.z), R);
      if (!c.visible) { off(); continue; }
      const up = rig.worldToScreen(_v.set(p.x, p.y + m.lift, p.z), R);
      let topY = Math.min(c.y - 10, up.y);
      if (m.hand) {
        m.hand.style.display = '';
        m.hand.style.left = Math.round(c.x) + 'px';
        m.hand.style.top = Math.round(topY) + 'px';
        topY -= (m.hand.offsetHeight || 54) + 4;
      }
      if (m.label) {
        m.label.style.display = '';
        m.label.style.left = Math.round(c.x) + 'px';
        m.label.style.top = Math.round(topY) + 'px';
      }
    }
  }

  _placeUI() {
    for (const m of this.uiList) {
      let el = m.target;
      if (typeof el === 'function') { try { el = el(); } catch { el = null; } }
      if (typeof el === 'string') el = document.querySelector(el);
      if (!(el instanceof Element) || !el.isConnected) { m.el.style.display = 'none'; continue; }
      if (m.hot !== el) { m.hot?.classList.remove('tutm-hot'); m.hot = el; el.classList.add('tutm-hot'); }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { m.el.style.display = 'none'; continue; }
      let side = m.side;
      if (side === 'auto') side = r.top > 90 ? 'top' : 'bottom';
      m.el.dataset.side = side;
      m.el.style.display = '';
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // like UI.pointAt: the hand hangs above pointing down (flipped), or sits below pointing up
      const P = { top: [cx, r.top - 6], bottom: [cx, r.bottom + 6], left: [r.left - 6, cy], right: [r.right + 6, cy] }[side];
      m.el.style.left = Math.round(P[0]) + 'px';
      m.el.style.top = Math.round(P[1]) + 'px';
    }
  }
}
