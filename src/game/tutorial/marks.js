// [v33 tut] Pixel marks for the day-1 tour.
//
// World marks: a bouncing pixel arrow over a thing in the pond / on the land, a dashed "marching
// ants" ring flat on the ground or water around it, and an optional paper luggage tag with a word.
// They follow their target every frame (a fish swims, the arrow swims with it). Drawn on one
// low-res canvas at the world's own pixel size (3 CSS px per art px), so they read as part of the
// pixel picture: hard edges, an ink outline, no blur.
//
// UI marks: a pointing pixel arrow + a stepped gold outline on a DOM element. They sit above
// everything (the Fish Scope, e-Buy, the lab tree), which the TeacherOverlay's chalk can't reach.
//
//   const M = new TourMarks(game);
//   const h = M.spot(fish, { label: 'BOY', color: 'blue' });   // ring + arrow + tag; h.stop()
//   M.ring([x, z], { r: 1.2 }); M.arrow(egg);
//   const u = M.ui('.fsc-call[data-k="hunger"]');                  // u.stop()
//   M.clear(); M.dispose();
//
// Targets: fish / bears / beavers (x, z, y), eggs ({ x, y, z }), structures ({ x, z, def }: the tile
// centre), [x, z] (ground height looked up), { getWorldPos(v) }, or () => any of those.
import * as THREE from 'three';
import { WATER_Y } from '../../world/grid.js';
import '../../ui/teacher.css'; // the tags / arrows / outline styles

const S = 3; // CSS px per art px (the world renders at pixelScale 3)
const US = 2; // UI arrows: CSS px per art px (the UI's 2x pixel art)
const INK = '#1a1420';
const PALS = {
  gold: { a: '#ffd23a', b: '#fff3b0', c: '#e08a1a' },
  blue: { a: '#6ac8ff', b: '#dff4ff', c: '#2a74c8' },
  pink: { a: '#ff8ac8', b: '#ffe0f0', c: '#d0447e' },
  green: { a: '#8ae05a', b: '#e2ffc8', c: '#3c9a2c' },
  red: { a: '#ff6a4a', b: '#ffe0d0', c: '#c0302a' },
};
// a chunky down arrow, hand placed (k ink, w highlight, y body, o shade)
const ARROW = [
  '...kkkkk...',
  '...kwyyk...',
  '...kwyok...',
  '...kyyok...',
  'kkkkyyokkkk',
  'kwwyyyyyook',
  '.kwyyyyyok.',
  '..kwyyyok..',
  '...kyyok...',
  '....kyk....',
  '.....k.....',
];
const _v = new THREE.Vector3();
const TAU = Math.PI * 2;

function arrowCanvas(pal, scale, dir = 'down') {
  const rows = ARROW;
  const h = rows.length, w = rows[0].length;
  const rot = dir === 'up' || dir === 'down' ? 0 : 1;
  const cw = rot ? h : w, ch = rot ? w : h;
  const c = document.createElement('canvas');
  c.width = (cw + 1) * scale; c.height = (ch + 1) * scale;
  const x = c.getContext('2d');
  const col = { k: INK, w: pal.b, y: pal.a, o: pal.c };
  const at = (i, j) => {
    // i: column, j: row in the down arrow -> the drawn orientation
    if (dir === 'down') return [i, j];
    if (dir === 'up') return [i, h - 1 - j];
    if (dir === 'right') return [j, i];
    return [h - 1 - j, i]; // left
  };
  // dithered drop shadow first (1 art px down-right), then the arrow
  for (let pass = 0; pass < 2; pass++)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = rows[j][i];
        if (k === '.') continue;
        const [px, py] = at(i, j);
        if (pass === 0) { if ((px + py) & 1) continue; x.fillStyle = 'rgba(26,20,32,0.55)'; x.fillRect((px + 1) * scale, (py + 1) * scale, scale, scale); }
        else { x.fillStyle = col[k]; x.fillRect(px * scale, py * scale, scale, scale); }
      }
  return c;
}

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
  if (t.def && typeof t.x === 'number' && game.structures?.baseY) { // a structure: its tile centre
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
    this.t = 0;
    this._raf = 0;
    this._last = 0;
    this._tick = (now) => this.frame(now);
  }

  // ---------------------------------------------------------------- world marks
  /** ring + arrow (+ a tag when `label` is set). o: { r (world units), color, label, arrow, ring, y (lift for the arrow) } */
  spot(target, o = {}) { return this._add(target, { ring: true, arrow: true, ...o }); }
  ring(target, o = {}) { return this._add(target, { ring: true, arrow: false, ...o }); }
  arrow(target, o = {}) { return this._add(target, { ring: false, arrow: true, ...o }); }

  _add(target, o) {
    this._build();
    const m = {
      target, ring: o.ring, arrow: o.arrow !== false && o.arrow, r: o.r ?? 0.55, lift: o.lift ?? 0.55,
      pal: PALS[o.color] || PALS.gold, color: o.color || 'gold', t: 0, dead: false, label: null, seed: Math.random() * 10,
    };
    if (o.label) {
      const el = document.createElement('div');
      el.className = `tutm-tag tutm-${m.color}`;
      el.innerHTML = `<i></i><span>${o.label}</span>`;
      this.layer.appendChild(el);
      m.label = el;
    }
    if (m.arrow) m.arrowCv = this._arrowFor(m.color, 'down', S);
    this.list.push(m);
    this.game.audio?.play?.('pop_in', { volume: 0.25, pitch: 1.5 });
    this._wake();
    const h = { stop: () => { m.dead = true; m.label?.remove(); this._wake(); }, mark: m };
    return h;
  }

  _arrowFor(color, dir, scale) {
    const k = color + dir + scale;
    (this._arrows ||= {});
    return this._arrows[k] || (this._arrows[k] = arrowCanvas(PALS[color] || PALS.gold, scale === S ? 1 : scale, dir));
  }

  // ---------------------------------------------------------------- UI marks
  /** a pointing arrow on a DOM element (Element | css selector | () => Element). o: { color, side: 'auto'|'top'|'bottom'|'left'|'right' } */
  ui(target, o = {}) {
    this._build();
    const el = document.createElement('div');
    el.className = 'tutm-uiarrow';
    this.top.appendChild(el);
    const m = { target, el, side: o.side || 'auto', color: o.color || 'gold', dir: null, dead: false, hot: null };
    this.uiList.push(m);
    this._wake();
    return { stop: () => { m.dead = true; el.remove(); m.hot?.classList.remove('tutm-hot'); this._wake(); } };
  }

  clear() {
    for (const m of this.list) { m.dead = true; m.label?.remove(); }
    for (const m of this.uiList) { m.dead = true; m.el.remove(); m.hot?.classList.remove('tutm-hot'); }
    this._wake();
  }

  dispose() {
    this.clear();
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.cv?.remove(); this.layer?.remove(); this.top?.remove();
    this.cv = null;
  }

  // ---------------------------------------------------------------- loop
  _build() {
    if (this.cv) return;
    const cv = (this.cv = document.createElement('canvas'));
    cv.className = 'tutm-world';
    document.body.appendChild(cv);
    this.cx = cv.getContext('2d');
    const layer = (this.layer = document.createElement('div'));
    layer.className = 'tutm-layer';
    document.body.appendChild(layer);
    const top = (this.top = document.createElement('div'));
    top.className = 'tutm-top';
    document.body.appendChild(top);
  }

  _wake() {
    if (this._raf || !this.cv) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  frame(now) {
    this._raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this.t += dt;
    this.list = this.list.filter((m) => !m.dead);
    this.uiList = this.uiList.filter((m) => !m.dead);
    this._drawWorld(dt);
    this._placeUI();
    if (this.list.length || this.uiList.length) this._raf = requestAnimationFrame(this._tick);
    else this.cx?.clearRect(0, 0, this.cv.width, this.cv.height);
  }

  _drawWorld(dt) {
    const cv = this.cv, game = this.game;
    const W = Math.ceil(innerWidth / S), H = Math.ceil(innerHeight / S);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W; cv.height = H;
      cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px';
    }
    const x = this.cx;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, W, H);
    const hide = !!(game.lab?.active || document.body.classList.contains('lab-mode') || game.classroom?.active || document.querySelector('.fsc'));
    const rig = game.overrideRig || game.rig;
    const R = game.renderer;
    const step = Math.floor(this.t / 0.11); // stepped animation (no smooth tweening)
    for (const m of this.list) {
      m.t += dt;
      const p = worldOf(game, m.target, m.p || (m.p = { x: 0, y: 0, z: 0 }));
      if (!p || hide) { if (m.label) m.label.style.display = 'none'; continue; }
      const c = rig.worldToScreen(_v.set(p.x, p.y, p.z), R);
      if (!c.visible) { if (m.label) m.label.style.display = 'none'; continue; }
      const cx = Math.round(c.x / S), cy = Math.round(c.y / S);
      // the ring's size on screen: project a point r away along the camera's right vector
      const pop = m.t < 0.08 ? 0.55 : m.t < 0.16 ? 1.18 : m.t < 0.24 ? 0.94 : 1;
      let rx = 8;
      if (m.ring) {
        const e = rig.camera.matrixWorld.elements;
        const q = rig.worldToScreen(_v.set(p.x + e[0] * m.r, p.y + e[1] * m.r, p.z + e[2] * m.r), R);
        rx = Math.max(5, Math.round(Math.hypot(q.x - c.x, q.y - c.y) / S * pop));
        const ry = Math.max(3, Math.round(rx * Math.max(0.28, Math.sin(rig.pitch || 0.77))));
        this._ring(x, cx, cy, rx, ry, m.pal, step + m.seed);
      }
      let topY = cy - (m.ring ? Math.round(rx * Math.max(0.28, Math.sin(rig.pitch || 0.77))) : 0);
      if (m.arrow) {
        // stand the arrow over the thing (lifted a little in the world), bobbing in 4 steps
        const up = rig.worldToScreen(_v.set(p.x, p.y + m.lift, p.z), R);
        const ay = Math.min(topY, Math.round(up.y / S));
        const bob = [0, 1, 2, 1][(step + Math.floor(m.seed)) % 4];
        const a = m.arrowCv;
        const ax = cx - Math.floor(a.width / 2) + 1, ayy = ay - a.height - 1 - bob - (m.t < 0.16 ? 4 : 0);
        x.drawImage(a, ax, ayy);
        topY = ayy;
      }
      if (m.label) {
        m.label.style.display = '';
        m.label.style.transform = `translate(${cx * S}px, ${(topY - 2) * S}px) translate(-50%, -100%)`;
      }
    }
  }

  // a dashed ellipse (marching ants) with an ink outline and four little corner sparks
  _ring(x, cx, cy, rx, ry, pal, ph) {
    const pad = 3;
    const r0 = (rx + ry) / 2;
    for (let j = -ry - pad; j <= ry + pad; j++)
      for (let i = -rx - pad; i <= rx + pad; i++) {
        const e = Math.sqrt((i / rx) ** 2 + (j / ry) ** 2);
        const d = Math.abs(e - 1) * r0; // ~ pixel distance from the ellipse
        if (d > 2.2) continue;
        if (d > 1.05) { x.fillStyle = INK; x.fillRect(cx + i, cy + j, 1, 1); continue; }
        const a = Math.atan2(j / ry, i / rx);
        const seg = Math.floor(((a + Math.PI) / TAU) * Math.max(8, Math.round(r0 / 2)) + ph * 0.5) & 1;
        x.fillStyle = seg ? pal.a : pal.b;
        x.fillRect(cx + i, cy + j, 1, 1);
      }
    // sparks at the four ends, blinking in turn
    const k = Math.floor(ph) % 4;
    const pts = [[rx + 3, 0], [0, -ry - 3], [-rx - 3, 0], [0, ry + 3]];
    const [sx, sy] = pts[k];
    x.fillStyle = pal.b;
    x.fillRect(cx + sx, cy + sy - 1, 1, 3); x.fillRect(cx + sx - 1, cy + sy, 3, 1);
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
      const dir = { top: 'down', bottom: 'up', left: 'right', right: 'left' }[side];
      if (m.dir !== dir) {
        m.dir = dir;
        m.el.innerHTML = '';
        const c = this._arrowFor(m.color, dir, US);
        const img = document.createElement('img');
        img.src = c.toDataURL();
        img.width = c.width; img.height = c.height;
        m.el.appendChild(img);
        m.el.dataset.dir = dir;
        m.w = c.width; m.h = c.height;
      }
      m.el.style.display = '';
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let X = cx - m.w / 2, Y = r.top - m.h - 2;
      if (side === 'bottom') Y = r.bottom + 2;
      else if (side === 'left') { X = r.left - m.w - 2; Y = cy - m.h / 2; }
      else if (side === 'right') { X = r.right + 2; Y = cy - m.h / 2; }
      m.el.style.transform = `translate(${Math.round(X)}px, ${Math.round(Y)}px)`;
    }
  }
}
