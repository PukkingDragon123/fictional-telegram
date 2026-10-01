// Unboxing ceremony: a Moose Express parcel drops in, you tap it until the
// tape rips, the flaps burst open and the order pops out onto an e-Buy receipt.
//
//   playUnbox(root, items, { icon, sfx, art, label, reduced, autoAdvance, signal }) -> Promise<void>
//
//   items: [{ name, image, iconName, qty, rarity, sub, kind }]
//     image    data URL string | <canvas> | null   (drawn pixelated)
//     iconName sprite name for icon() when there is no image
//     qty      shown as "x3" (hidden when 1 / missing)
//     rarity   0..4 optional (common..legendary), tints the row + rays
//     sub      short line under the name ("Goes to Build > Parcels")
//     kind     'item' | 'egg' | 'bird' | 'upgrade' (fallback art when no image/icon)
//   icon(name, scale) -> html      same contract as EggHatch / the game's ico()
//   sfx(name, { volume, pitch })   uses: paper pop_in whoosh click buy coins egg_crack levelup drop
//   art(item) -> canvas | dataURL | html string | null   optional custom art hook
//   label    order name, printed on the shipping label and the receipt
//   reduced  force reduced motion (default: prefers-reduced-motion)
//   autoAdvance  false = never auto-tap an idle box (default: auto-tap after a while)
//   signal   AbortSignal: closes the overlay
//
// Resolves once the overlay has closed (Nice!, tap anywhere when done, Esc, or abort).
// The overlay is position:fixed, z-index 210 (above the other ceremonies at 200).
import './fonts.css';
import './ceremony.css';
import './unbox.css';
import {
  clamp, esc, reducedMotion, rgba, mkSfx, mkIcon, frameCls, glyph, bindInput, Seq, shake,
  PixelFX, Rays, outline, gridCanvas, copyCanvas, eggCanvas,
} from './EggHatch.js';
import { injectPaperCSS, stamp as paperStamp, tape as paperTape } from './paper.js';
import { RARITIES } from '../data/species.js';

const IDLE_TAP_MS = 7000;
const KIND_ICON = { item: 'tag', bird: 'birdhouse', upgrade: 'bolt', egg: 'egg' };
const CONFETTI = ['#f0505a', '#ff9a3a', '#3a7ae0', '#ffc22e', '#6cc04a', '#ffffff'];
const WARM = { color: '#ffd98a', glow: '#fff4c8' };

// ===========================================================================
// the parcel (procedural pixel art)
// ===========================================================================
const BW = 60, BH = 56;
const FX0 = 9, FX1 = 50, FY0 = 26, FY1 = 53; // front face
const TY0 = 15, TY1 = 25; // top face rows (trapezoid, 4px inset at the back)
const tIn = (y) => Math.round(((TY1 - y) / (TY1 - TY0)) * 4);
const TX0 = 26, TX1 = 33; // tape columns
const LBL = { x0: 11, x1: 33, y0: 36, y1: 51 }; // shipping label
const LBL_TXT = { x0: 13, x1: 31, y0: 40, y1: 46 }; // DOM text area on the label
const MOUTH_ROW = 21; // centre of the opening (rays / items come from here)
const CB = {
  out: '#2a1608', fr: '#c4915c', frD: '#ae7c4a', frDD: '#946639', frL: '#d8a874', edge: '#e6bc86',
  top: '#e2b47c', topL: '#ecc48e', topD: '#cc9c64', seam: '#7a4e2a',
  in1: '#a87648', in2: '#6e4628', in3: '#46291a', inner: '#e6c294', innerD: '#c79a68', rim: '#f0cc98', hinge: '#6a4224',
  tape: '#ffd22e', tapeD: '#e2a816', tapeL: '#fff08a', tapeF: '#f2c020', navy: '#26325e', red: '#e0402e', resid: '#dab07c',
  lbl: '#fbf6ea', lblD: '#d8ccb4', ink: '#3a2a20', stamp: '#d23a30', print: '#7a4a26',
};
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAY[((y & 3) << 2) | (x & 3)];
function h2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hexToRgb(h) { const v = parseInt(h.slice(1, 7), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function blank() { return Array.from({ length: BH }, () => new Array(BW).fill(null)); }
const inQuad = (px, py, q) => {
  // convex quad, any winding
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4];
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
  }
  return true;
};

function tapePx(x, y, front) {
  // Moose Express tape: yellow, navy chevrons, a red dot now and then
  const u = x - TX0;
  if (u === 0 || u === 7) return front ? CB.tapeD : mixHex(CB.tapeD, CB.tape, 0.4);
  const k = ((y % 7) + 7) % 7;
  if ((k === 1 && (u === 2 || u === 5)) || (k === 2 && (u === 3 || u === 4))) return CB.navy;
  if (k === 5 && u === 3 + ((y / 7) & 1)) return CB.red;
  if (u === 1 && !front) return CB.tapeL;
  return front ? CB.tapeF : CB.tape;
}

function drawFront(g, { tape = 'full', glow } = {}) {
  for (let y = FY0; y <= FY1; y++) for (let x = FX0; x <= FX1; x++) {
    let c = CB.fr;
    const v = (y - FY0) / (FY1 - FY0);
    if (v > 0.55 && bay(x, y) < (v - 0.55) * 1.6) c = CB.frD;
    if (h2(x, y, 3) < 0.035) c = CB.frD;
    if (h2(x, y, 9) < 0.012) c = CB.frL;
    if (x <= FX0 + 1) c = x === FX0 ? CB.frDD : CB.frD;
    if (x === FX1) c = CB.frD;
    if (y >= FY1 - 1) c = y === FY1 ? CB.frDD : CB.frD;
    if (y === FY0) c = CB.edge;
    g[y][x] = c;
  }
  // "this way up" arrows, printed
  const AR = ['..#.....#..', '.###...###.', '#####.#####', '..#.....#..', '..#.....#..', '###########'];
  AR.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') g[28 + j][38 + i] = h2(i, j, 5) < 0.15 ? CB.fr : CB.print; });
  // handle slot
  for (let x = 14; x <= 21; x++) { g[29][x] = CB.frDD; g[30][x] = x === 14 || x === 21 ? CB.frDD : CB.in3; g[31][x] = CB.frL; }
  // shipping label
  for (let y = LBL.y0; y <= LBL.y1; y++) for (let x = LBL.x0; x <= LBL.x1; x++) {
    const edge = x === LBL.x0 || x === LBL.x1 || y === LBL.y0 || y === LBL.y1;
    let c = edge ? CB.lblD : CB.lbl;
    if (!edge && y >= LBL.y1 - 3 && bay(x, y) < 0.18) c = '#eee6d4';
    g[y][x] = c;
  }
  g[LBL.y1][LBL.x1] = CB.fr; g[LBL.y1 - 1][LBL.x1] = CB.lblD; // a corner peeling off
  for (let x = LBL.x0 + 1; x < LBL.x1; x++) { g[LBL.y0 + 1][x] = CB.navy; g[LBL.y0 + 2][x] = CB.navy; }
  for (let x = LBL.x0 + 2; x < LBL.x1 - 1; x += 3) g[LBL.y0 + 1][x] = '#ffd22e';
  g[LBL.y0 + 2][LBL.x1 - 2] = CB.red; g[LBL.y0 + 1][LBL.x1 - 2] = CB.red;
  // barcode
  for (let x = LBL.x0 + 2; x <= LBL.x1 - 2; x++) if (h2(x, 1, 77) < 0.62) for (let y = LBL.y1 - 4; y <= LBL.y1 - 2; y++) g[y][x] = CB.ink;
  // Moose Express postmark: ring + moose head
  const scx = 43, scy = 42.5;
  for (let y = 35; y <= 50; y++) for (let x = 35; x <= 51; x++) {
    const d = Math.hypot(x + 0.5 - scx - 0.5, y + 0.5 - scy);
    if (d >= 5.4 && d <= 6.6 && h2(x, y, 31) > 0.16 && x <= FX1 - 1) g[y][x] = mixHex(g[y][x] || CB.fr, CB.stamp, 0.85);
  }
  const MH = ['#.#.....#.#', '###.....###', '.###...###.', '...#####...', '...#.#.#...', '....###....', '....###....'];
  MH.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#' && h2(i, j, 41) > 0.08) g[39 + j][38 + i] = mixHex(CB.fr, CB.stamp, 0.85); });
  // tape down the front
  if (tape === 'full') {
    for (let y = FY0; y <= FY0 + 8; y++) for (let x = TX0; x <= TX1; x++) {
      if (y === FY0 + 8 && (x + 1) % 2) continue; // zig-zag cut end
      g[y][x] = tapePx(x, y, true);
    }
  } else if (tape === 'peeled') {
    for (let y = FY0; y <= FY0 + 8; y++) for (let x = TX0; x <= TX1; x++) g[y][x] = h2(x, y, 4) < 0.3 ? CB.fr : CB.resid;
    for (let y = FY0; y <= FY0 + 1; y++) for (let x = TX0; x <= TX1; x++) g[y][x] = tapePx(x, y, true);
    // the peeled strip curls off to the right
    for (let k = 0; k < 7; k++) for (let w = 0; w < 4; w++) {
      const x = TX0 + 3 + k + w, y = FY0 + 2 + Math.round(k * 0.7) - (w >> 1);
      if (y < FY0 + 2) continue;
      g[y][x] = w === 0 ? CB.tapeD : w === 3 ? CB.tapeL : CB.tape;
    }
  } else if (tape === 'gone') {
    for (let y = FY0; y <= FY0 + 8; y++) for (let x = TX0; x <= TX1; x++) g[y][x] = h2(x, y, 4) < 0.35 ? CB.fr : CB.resid;
  }
  if (glow) {
    // light leaking where the flaps meet the front
    g[FY0][29] = glow; g[FY0][30] = glow;
  }
}

function drawTopClosed(g, stage, glow) {
  for (let y = TY0; y <= TY1; y++) {
    const i = tIn(y);
    for (let x = FX0 + i; x <= FX1 - i; x++) {
      let c = y <= TY0 + 1 ? CB.topD : CB.top;
      if (y >= TY1 - 2 && bay(x, y) < 0.35) c = CB.topL;
      if (x === FX0 + i || x === FX1 - i) c = CB.topD;
      if (h2(x, y, 6) < 0.03) c = CB.topD;
      // flap seam (mostly under the tape)
      if (x === 29 || x === 30) c = CB.seam;
      g[y][x] = c;
    }
  }
  // the flaps bulge up a little once the tape gives
  if (stage >= 2) {
    for (let x = 22; x <= 37; x++) g[TY0 - 1][x] = x === 22 || x === 37 ? CB.topD : CB.top;
    for (let x = 25; x <= 34; x++) g[TY0 - 2][x] = CB.topD;
  }
  // tape along the seam
  const y0 = stage >= 2 ? TY0 - 2 : TY0;
  for (let y = y0; y <= TY1; y++) for (let x = TX0; x <= TX1; x++) {
    if (y < TY0 && (x === TX0 || x === TX1)) continue;
    g[y][x] = tapePx(x, y, false);
  }
  if (stage >= 1 && glow) {
    // torn: a jagged split down the middle of the tape with light behind it
    const yTop = stage >= 2 ? y0 : TY1 - 3;
    for (let y = yTop; y <= TY1; y++) {
      const j = (y * 7) % 3 === 0 ? 1 : 0;
      g[y][29 - j] = glow; g[y][30 + (1 - j)] = glow;
      if (stage >= 2 && y % 2 === 0) { g[y][28 - j] = CB.tapeL; g[y][31 + (1 - j)] = CB.tapeL; }
      if (stage >= 2 && (y + 1) % 4 === 0) g[y][29] = '#ffffff';
    }
  }
}

function drawOpen(g, glow) {
  // back flap (inner side showing), standing up
  for (let y = 5; y <= TY0 - 1; y++) {
    const i = Math.round(((TY0 - 1 - y) / (TY0 - 6)) * 2);
    for (let x = FX0 + 4 + i; x <= FX1 - 4 - i; x++) {
      let c = CB.inner;
      if (y === TY0 - 1) c = CB.hinge;
      else if (y >= TY0 - 3 || bay(x, y) < (y - 5) / 22) c = CB.innerD;
      if (y === 5) c = CB.rim;
      g[y][x] = c;
    }
  }
  // side flaps (outer side + half the tape), splayed outward
  const flap = (q, tapeEdge, mirror) => {
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      if (!inQuad(x + 0.5, y + 0.5, q)) continue;
      let c = CB.topD;
      if (bay(x, y) < 0.25) c = CB.top;
      if (h2(x, y, 12) < 0.04) c = CB.frD;
      const d = tapeEdge(x + 0.5, y + 0.5);
      if (d < 2.4) {
        c = d < 1 ? CB.tapeD : CB.tape;
        if (((y + (mirror ? 1 : 0)) % 5 === 2) && d >= 1) c = CB.navy;
        if (d >= 1.6 && (y % 2 === (mirror ? 0 : 1))) c = CB.topD; // torn edge
      }
      g[y][x] = c;
    }
  };
  // left: hinge (9,25)-(13,15), outer (1,20)-(4,9)
  const L = [[FX0 + 0.5, TY1 + 1], [FX0 + 4.5, TY0], [4, 8], [0.5, 20]];
  const R = L.map(([x, y]) => [BW - x, y]);
  const distLine = (ax, ay, bx, by) => (px, py) => Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / Math.hypot(bx - ax, by - ay);
  flap(L, distLine(L[2][0], L[2][1], L[3][0], L[3][1]), false);
  flap(R, distLine(R[2][0], R[2][1], R[3][0], R[3][1]), true);
  // the opening: inner back wall, dark floor, glow from what's inside
  for (let y = TY0; y <= TY1; y++) {
    const i = tIn(y);
    for (let x = FX0 + i; x <= FX1 - i; x++) {
      const v = (y - TY0) / (TY1 - TY0);
      let c = v < 0.42 ? (bay(x, y) < v * 1.6 ? CB.in1 : CB.innerD) : v < 0.7 ? (bay(x, y) < (v - 0.42) * 3 ? CB.in2 : CB.in1) : CB.in2;
      if (x <= FX0 + i + 1 || x >= FX1 - i - 1) c = CB.hinge;
      if (y === TY0) c = CB.hinge;
      if (y === TY1) c = CB.rim;
      if (glow && y > TY0 && y < TY1 && x > FX0 + i + 1 && x < FX1 - i - 1) {
        const dx = (x + 0.5 - 30) / 15, dy = (y + 0.5 - MOUTH_ROW) / 4.2;
        const d = dx * dx + dy * dy;
        if (d < 1 && bay(x, y) < (1 - d) * 1.25) c = d < 0.25 ? '#ffffff' : glow;
      }
      g[y][x] = c;
    }
  }
  drawFront(g, { tape: 'gone' });
  // front flap folded forward over the top of the front face
  for (let y = FY0; y <= FY0 + 4; y++) {
    const i = y - FY0 >= 3 ? 1 : 0;
    for (let x = FX0 - 1 + i; x <= FX1 + 1 - i; x++) {
      let c = y === FY0 ? CB.rim : CB.inner;
      if (y >= FY0 + 3) c = CB.innerD;
      if (y === FY0 + 4) c = CB.hinge;
      g[y][x] = c;
    }
  }
  // tape stub left on the front flap
  for (let x = TX0; x <= TX1; x++) { g[FY0 + 1][x] = tapePx(x, FY0 + 1, true); g[FY0 + 2][x] = (x % 2) ? CB.tapeF : CB.inner; }
}

const BOX_CACHE = new Map();
function boxCanvas(state, scale, glow) {
  const key = `${state}|${scale}|${glow}`;
  let c = BOX_CACHE.get(key);
  if (!c) {
    const g = blank();
    if (state === 'open') drawOpen(g, glow);
    else {
      const st = state | 0;
      drawTopClosed(g, st, glow);
      drawFront(g, { tape: st >= 1 ? 'peeled' : 'full', glow: st >= 1 ? glow : null });
    }
    c = gridCanvas(outline(g, CB.out), scale);
    BOX_CACHE.set(key, c);
  }
  return copyCanvas(c);
}

// packing peanuts for the particle system (already at fx-pixel scale)
const PEANUTS = [
  ['.##', '###', '##.'],
  ['##.', '###', '.##'],
  ['.#.', '###', '##.', '.#.'],
];
const peanutCache = new Map();
function peanut(i, u) {
  const key = `${i}|${u}`;
  let c = peanutCache.get(key);
  if (!c) {
    const rows = PEANUTS[i % PEANUTS.length];
    const g = rows.map((r, y) => [...r].map((ch, x) => (ch === '#' ? (y === rows.length - 1 || x === r.length - 1 ? '#d9ceb4' : '#f6f0e0') : null)));
    const pad = g.map((r) => [null, ...r, null]);
    const W = pad[0].length;
    const full = [new Array(W).fill(null), ...pad, new Array(W).fill(null)];
    c = gridCanvas(outline(full, '#5a4632'), u);
    peanutCache.set(key, c);
  }
  return c;
}

// ===========================================================================
// public
// ===========================================================================
export function playUnbox(root, items, opts = {}) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!root) return Promise.resolve();
  return new Promise((resolve) => {
    let u;
    try { u = new Unbox(root, list, opts, resolve); u.start(); } catch (e) {
      console.error('[Unbox]', e);
      try { u && u.destroy(); } catch { /* ignore */ }
      resolve();
    }
  });
}

class Unbox {
  constructor(root, items, opts, resolve) {
    this.root = root;
    this.opts = opts || {};
    this.items = items.map((it) => ({
      ...it,
      name: String(it.name ?? 'Something nice'),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      rarity: it.rarity == null || it.rarity === '' ? null : clamp(Math.round(Number(it.rarity) || 0), 0, 4),
    }));
    this.resolve = resolve;
    this.sfx = mkSfx(this.opts);
    this.icon = mkIcon(this.opts);
    this.reduced = this.opts.reduced != null ? !!this.opts.reduced : reducedMotion();
    this.auto = this.opts.autoAdvance === false ? 0 : 1;
    this.seq = new Seq();
    this.state = 'init';
    this.stage = 0;
    this.graceUntil = 0;
    this.raf = 0;
    this.open = false;
    const best = this.items.reduce((m, it) => (it.rarity != null && it.rarity > m ? it.rarity : m), -1);
    this.best = best;
    const R = best >= 1 ? RARITIES[best] : WARM;
    this.look = { color: R.color, glow: R.glow };
    this.leak = best >= 2 ? R.glow : '#fff6c8';
  }

  start() {
    injectPaperCSS();
    const el = document.createElement('div');
    el.className = 'ub-ov cer-ov' + (this.reduced ? ' ub-reduced' : '');
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Unboxing your order');
    const label = this.opts.label ? String(this.opts.label) : this.items.length === 1 ? this.items[0].name : 'Your order';
    this.label = label;
    el.innerHTML = `
      <div class="ub-back"></div>
      <div class="ub-world">
        <canvas class="ub-rays"></canvas>
        <div class="ub-glow"></div>
        <div class="ub-shadow"></div>
        <div class="ub-pos">
          <div class="ub-drop"><div class="ub-wob"><div class="ub-shk">
            <div class="ub-lbl"><span>${esc(label)}</span></div>
          </div></div></div>
        </div>
        <div class="ub-banner"><span>Special delivery!</span></div>
        <div class="ub-prompt"><div class="ub-tap">TAP!</div><div class="ub-pips"></div><div class="ub-hand">${this.icon('hand', 3)}</div></div>
      </div>
      <canvas class="ub-fx"></canvas>
      <canvas class="ub-fx ub-fx2"></canvas>
      <div class="ub-rcpt paper paper--receipt paper--zig" data-cer-own>
        ${paperTape('yellow', -4, { cls: 'ub-rtape', w: 34 })}
        <div class="ub-rh">
          <div class="ub-logo" aria-label="e-Buy"><span class="l1">e</span><span class="l2">-</span><span class="l3">B</span><span class="l4">u</span><span class="l5">y</span></div>
          <div class="ub-rt">Order delivered</div>
          <div class="ub-ro">${esc(label)}</div>
        </div>
        <div class="ub-dash"></div>
        <div class="ub-rows"></div>
        <div class="ub-dash"></div>
        <div class="ub-rf"><span class="ub-tot"></span><span class="ub-via">${this.icon('moose', 1)} Moose Express</span></div>
        <div class="ub-stampslot"></div>
        <div class="ub-nicewrap"><button type="button" class="ub-nice cer-btn big ${frameCls('button_green')}">Nice! ${glyph('check', 3)}</button></div>
      </div>
      <canvas class="ub-fly-cv" hidden></canvas>
      <div class="ub-fly"></div>
      <div class="ub-top">
        <div class="ub-brand">${this.icon('moose', 2)}<span>Moose Express</span></div>
        <button type="button" class="ub-skip cer-btn ${frameCls('button_green')}" data-cer-own>Skip ${glyph('skip', 2)}</button>
      </div>
      <div class="ub-foot"><span>Tap anywhere to close</span></div>
      <div class="ub-flash"></div>`;
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = {
      world: q('.ub-world'), rays: q('.ub-rays'), glow: q('.ub-glow'), shadow: q('.ub-shadow'), pos: q('.ub-pos'),
      drop: q('.ub-drop'), wob: q('.ub-wob'), shk: q('.ub-shk'), lbl: q('.ub-lbl'), banner: q('.ub-banner'),
      prompt: q('.ub-prompt'), tap: q('.ub-tap'), pips: q('.ub-pips'), fx: q('.ub-fx'), fx2: q('.ub-fx2'), rcpt: q('.ub-rcpt'),
      rows: q('.ub-rows'), tot: q('.ub-tot'), stamp: q('.ub-stampslot'), nice: q('.ub-nice'), fly: q('.ub-fly'),
      skip: q('.ub-skip'), foot: q('.ub-foot'), flash: q('.ub-flash'),
    };
    el.style.setProperty('--rc', this.look.color);
    el.style.setProperty('--rg', this.look.glow);
    this.root.appendChild(el);
    this.fx = new PixelFX(this.$.fx); // under the receipt: peanuts, confetti, box sparkles
    this.fxTop = new PixelFX(this.$.fx2); // over the receipt: landing sparkles, flight trails
    this.rays = new Rays(this.$.rays);
    this.rays.color = this.look.color; this.rays.glow = this.look.glow;
    this.rays.n = this.best >= 3 ? 14 : 10; this.rays.n2 = this.best >= 2 ? 7 : 0;
    this.rays.target = 0; this.rays.speed = 0.25;
    this.buildRows();
    this.layout();
    this.setBox('0');
    this.unbind = bindInput(el, { onTap: (src, e) => this.tap(src, e), onSkip: () => this.skip() });
    this.$.skip.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('click'); this.skip(); });
    this.$.nice.addEventListener('click', (e) => { e.stopPropagation(); if (this.state === 'done') { this.sfx('click'); this.close(); } else this.skip(); });
    // taps on the receipt (outside the button) still advance / close
    this.$.rcpt.addEventListener('pointerdown', (e) => { if (e.button > 0 || (e.target.closest && e.target.closest('.ub-nice'))) return; this.tap('pointer', e); });
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    const sig = this.opts.signal;
    if (sig && typeof sig.addEventListener === 'function') sig.addEventListener('abort', () => this.close(true), { once: true });
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    requestAnimationFrame(() => el.classList.add('on'));
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
    this.intro();
  }

  // ------------------------------------------------------------------ layout
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.phone = W < 640;
    this.wide = W >= 700 && W > H * 1.1;
    this.el.classList.toggle('wide', this.wide);
    this.fx.resize(); this.fxTop.resize();
    this.rays.size(Math.hypot(W, H) * 1.05, this.phone ? 5 : 6);
    const s = clamp(Math.floor(Math.min((H * (this.wide ? 0.4 : 0.3)) / BH, (W * (this.wide ? 0.34 : 0.66)) / BW)), 3, 8);
    if (s !== this.s) {
      this.s = s;
      if (this.boxState) this.setBox(this.boxState, true);
    }
    const el = this.el;
    el.style.setProperty('--s', `${s}px`);
    el.style.setProperty('--bw', `${BW * s}px`);
    el.style.setProperty('--bh', `${BH * s}px`);
    // closed: centre stage. open: beside (wide) or under (tall) the receipt.
    this.closedPos = { x: Math.round(W / 2), y: Math.round(H * (this.phone ? 0.62 : 0.66)) };
    const rw = Math.min(400, this.wide ? Math.round(W * 0.42) : W - 28);
    el.style.setProperty('--rw', `${rw}px`);
    if (this.wide) {
      const gap = Math.max(24, Math.round(W * 0.04));
      const total = BW * s * 0.8 + gap + rw;
      const left = Math.round((W - total) / 2);
      this.openPos = { x: Math.round(left + (BW * s * 0.8) / 2), y: Math.round(H * 0.8) };
      el.style.setProperty('--rx', `${Math.round(left + BW * s * 0.8 + gap + rw / 2)}px`);
      el.style.setProperty('--rmax', `${H - 60}px`);
    } else {
      const safeB = 18;
      this.openPos = { x: Math.round(W / 2), y: H - safeB };
      const boxTop = this.openPos.y - (BH - 8) * s; // top of the open flaps
      el.style.setProperty('--rx', '50%');
      el.style.setProperty('--rmax', `${Math.max(240, boxTop - 72 + 12)}px`);
    }
    this.placeBox(this.open ? this.openPos : this.closedPos, false);
  }

  placeBox(p, animate) {
    const el = this.el;
    if (!animate) el.classList.add('ub-snap');
    el.style.setProperty('--px', `${p.x}px`);
    el.style.setProperty('--py', `${p.y}px`);
    el.style.setProperty('--my', `${p.y - (BH - MOUTH_ROW) * this.s}px`);
    if (!animate) { void el.offsetWidth; el.classList.remove('ub-snap'); }
  }

  setBox(state, keepAnim) {
    this.boxState = state;
    const cv = boxCanvas(state, this.s, this.leak);
    cv.className = 'ub-box';
    const old = this.$.shk.querySelector('.ub-box');
    if (old) old.replaceWith(cv); else this.$.shk.prepend(cv);
    this.$.lbl.style.display = '';
    void keepAnim;
  }

  mouth() {
    // once open the box glides to openPos: aim at where it is going, not where it is
    if (this.open) return { x: this.openPos.x, y: this.openPos.y - (BH - MOUTH_ROW) * this.s, k: this.s };
    const r = this.$.shk.getBoundingClientRect();
    const k = r.width / BW || this.s;
    return { x: r.left + 30 * k, y: r.top + MOUTH_ROW * k, k };
  }

  // ------------------------------------------------------------------ frame loop
  tick(t) {
    if (this.state === 'dead') return;
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.rays.step(dt); this.rays.draw();
    if (this.open && this.state !== 'closing' && !this.reduced) {
      this.sparkT = (this.sparkT || 0) - dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.18 + Math.random() * 0.3;
        const m = this.mouth();
        this.fx.add({ type: 'spark', x: m.x + (Math.random() - 0.5) * 26 * m.k, y: m.y - Math.random() * 10 * m.k, vy: -40 - Math.random() * 60, life: 0.8, s: 1 + ((Math.random() * 2) | 0), color: this.look.glow });
      }
    }
    this.fx.step(dt); this.fx.draw();
    this.fxTop.step(dt); this.fxTop.draw();
    this.raf = requestAnimationFrame((tt) => this.tick(tt));
  }

  // ------------------------------------------------------------------ input
  tap() {
    const now = performance.now();
    switch (this.state) {
      case 'intro': this.seq.fast(); break;
      case 'idle': this.hit(); break;
      case 'items': if (now > this.graceUntil) this.seq.fast(); break;
      case 'done': if (now > this.graceUntil) { this.sfx('click'); this.close(); } break;
      default: break;
    }
  }

  armIdle(ms, fn) {
    if (this.idleTimer) this.seq.cancel(this.idleTimer);
    this.idleTimer = 0;
    if (!this.auto) return;
    this.idleTimer = this.seq.after(ms, fn);
  }

  // ------------------------------------------------------------------ phases
  async intro() {
    const seq = this.seq, s = this.s;
    this.state = 'intro';
    const fall = this.closedPos.y + 60;
    if (this.reduced) {
      this.$.drop.style.transform = 'none';
      seq.anim(this.$.drop, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'both' });
      this.$.banner.classList.add('on');
      await seq.sleep(250);
    } else {
      this.sfx('whoosh', { pitch: 0.9 });
      const dur = 820, land = 0.56;
      seq.anim(this.$.drop, [
        { transform: `translateY(${-fall}px) rotate(-8deg) scale(0.9, 1.12)`, easing: 'cubic-bezier(.5,0,.9,.4)' },
        { transform: 'translateY(0) rotate(0deg) scale(1.22, 0.78)', offset: land, easing: 'cubic-bezier(.2,.8,.4,1)' },
        { transform: 'translateY(-26px) rotate(2deg) scale(0.94, 1.08)', offset: 0.76, easing: 'cubic-bezier(.6,0,.9,.5)' },
        { transform: 'translateY(0) rotate(0deg) scale(1.08, 0.93)', offset: 0.9 },
        { transform: 'translateY(0) rotate(0deg) scale(1, 1)' },
      ], { duration: dur, fill: 'both' });
      seq.anim(this.$.shadow, [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.2, 0.9)', opacity: 1, offset: land },
        { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 0.75, offset: 0.76 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ], { duration: dur, fill: 'both' });
      await seq.sleep(dur * land);
      if (this.state === 'dead') return;
      this.sfx('drop', { pitch: 0.8 });
      const fy = this.closedPos.y - s * 2;
      for (let k = 0; k < 22; k++) {
        const dir = k % 2 ? 1 : -1;
        this.fx.add({ type: 'dust', x: this.closedPos.x + dir * (BW * s * 0.3 + Math.random() * 24), y: fy - Math.random() * 8, vx: dir * (140 + Math.random() * 280), vy: -30 - Math.random() * 80, g: 60, drag: 3, life: 0.5 + Math.random() * 0.4, s: 2 + ((Math.random() * 2) | 0), color: rgba('#fff8e8', 0.55) });
      }
      shake(seq, this.$.world, 6, 300);
      this.$.banner.classList.add('on');
      await seq.sleep(dur * (1 - land));
    }
    if (this.state === 'dead') return;
    this.$.drop.style.transform = 'none';
    seq.slow();
    this.state = 'idle';
    this.renderPips();
    this.$.prompt.classList.add('on');
    this.wiggleLoop();
    this.armIdle(IDLE_TAP_MS, () => this.autoTap());
  }

  autoTap() {
    if (this.state !== 'idle') return;
    this.hit();
    if (this.state === 'idle') this.armIdle(1300, () => this.autoTap());
  }

  renderPips() {
    const n = this.reduced ? 1 : 3;
    let h = '';
    for (let k = 0; k < n; k++) h += `<i class="${k < this.stage ? 'used' : ''}"></i>`;
    this.$.pips.innerHTML = h;
    this.$.tap.textContent = this.reduced ? 'TAP TO OPEN' : ['TAP!', 'RIP IT!', 'ONE MORE!'][this.stage] || 'TAP!';
  }

  wiggleLoop() {
    if (this.wigTimer) this.seq.cancel(this.wigTimer);
    if (this.reduced) return;
    const go = () => {
      if (this.state !== 'idle') return;
      const m = 4 + this.stage * 3;
      const hop = 10 + this.stage * 6;
      this.seq.anim(this.$.wob, [
        { transform: 'translateY(0) rotate(0deg) scale(1, 1)' },
        { transform: 'translateY(0) rotate(0deg) scale(1.08, 0.92)', offset: 0.12 },
        { transform: `translateY(${-hop}px) rotate(${-m}deg) scale(0.95, 1.06)`, offset: 0.34 },
        { transform: `translateY(0) rotate(${m * 0.6}deg) scale(1.06, 0.94)`, offset: 0.56 },
        { transform: `translateY(${-hop * 0.4}px) rotate(${-m * 0.4}deg) scale(1, 1)`, offset: 0.72 },
        { transform: 'translateY(0) rotate(0deg) scale(1.03, 0.97)', offset: 0.88 },
        { transform: 'translateY(0) rotate(0deg) scale(1, 1)' },
      ], { duration: 640, easing: 'ease-in-out' });
      this.seq.after(350, () => { if (this.state === 'idle') this.sfx('drop', { volume: 0.35, pitch: 1.3 + this.stage * 0.1 }); });
      this.wigTimer = this.seq.after(1300 - this.stage * 300 + Math.random() * 300, go);
    };
    this.wigTimer = this.seq.after(450, go);
  }

  hit() {
    if (this.state !== 'idle') return;
    this.stage++;
    if (this.stage >= 3 || this.reduced) { this.burst(); return; }
    this.armIdle(IDLE_TAP_MS, () => this.autoTap());
    this.sfx('paper', { pitch: 1.1 + this.stage * 0.15 });
    this.sfx('drop', { volume: 0.7, pitch: 0.9 + this.stage * 0.12 });
    this.setBox(String(this.stage));
    this.renderPips();
    const m = 5 + this.stage * 5;
    this.seq.anim(this.$.shk, [
      { transform: 'translate(0,0) rotate(0deg) scale(1)' },
      { transform: `translate(${-m}px,0) rotate(${-m * 0.7}deg) scale(1.08, 0.92)` },
      { transform: `translate(${m}px,-6px) rotate(${m * 0.7}deg) scale(0.95, 1.07)` },
      { transform: `translate(${-m * 0.7}px,0) rotate(${-m * 0.4}deg)` },
      { transform: `translate(${m * 0.4}px,0) rotate(${m * 0.25}deg)` },
      { transform: 'translate(0,0) rotate(0deg) scale(1)' },
    ], { duration: 360 + this.stage * 40, easing: 'ease-out' });
    const mo = this.mouth();
    const seamY = mo.y + (TY1 - MOUTH_ROW - 2) * mo.k;
    this.fx.burst(mo.x, seamY, 8 + this.stage * 6, { colors: [CB.tape, CB.tapeL, CB.tapeD], speed: 480, g: 1300, drag: 0.8, life: 0.9, size: [1, 2], spread: Math.PI * 1.1 });
    this.fx.burst(mo.x, seamY, 3 + this.stage * 3, { type: 'spark', colors: [this.look.glow], speed: 240, g: 0, drag: 2.5, life: 0.6, size: [1, 2] });
    for (let k = 0; k < this.stage * 2; k++) this.fx.add({ type: 'img', img: peanut(k, this.fx.u), x: mo.x + (Math.random() - 0.5) * 20, y: seamY, vx: (Math.random() - 0.5) * 360, vy: -420 - Math.random() * 260, g: 1400, drag: 0.6, life: 1.4 });
    this.el.style.setProperty('--leak', String(this.stage));
    this.rays.target = 0.12 * this.stage; this.rays.speed += 0.3;
    if (this.stage === 2) shake(this.seq, this.$.world, 4, 220);
  }

  async burst() {
    const seq = this.seq;
    this.state = 'burst';
    if (this.idleTimer) seq.cancel(this.idleTimer);
    if (this.wigTimer) seq.cancel(this.wigTimer);
    this.$.prompt.classList.remove('on');
    this.$.banner.classList.remove('on');
    this.$.wob.getAnimations().forEach((a) => a.cancel());
    if (!this.reduced) {
      this.sfx('egg_crack', { pitch: 0.8 });
      seq.anim(this.$.shk, [
        { transform: 'scale(1, 1)' }, { transform: 'scale(1.16, 0.8) translateY(4px)', offset: 0.6 }, { transform: 'scale(1.22, 0.74) translateY(6px)' },
      ], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      await seq.sleep(200);
      if (this.state === 'dead') return;
    }
    this.sfx('whoosh', { pitch: 1.1 });
    this.sfx('pop_in', { pitch: 0.8 });
    this.setBox('open');
    this.open = true;
    this.el.classList.add('opened');
    seq.anim(this.$.flash, [{ opacity: this.reduced ? 0.25 : 0.85 }, { opacity: 0 }], { duration: this.reduced ? 300 : 420, easing: 'ease-out' });
    if (!this.reduced) {
      seq.anim(this.$.shk, [
        { transform: 'scale(1.22, 0.74) translateY(6px)' }, { transform: 'scale(0.9, 1.16) translateY(-18px)', offset: 0.35 },
        { transform: 'scale(1.05, 0.95)', offset: 0.7 }, { transform: 'scale(1, 1)' },
      ], { duration: 520, easing: 'ease-out', fill: 'forwards' });
      shake(seq, this.$.world, 9, 420);
      const m = this.mouth();
      const u = this.fx.u;
      for (let k = 0; k < 34; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = 520 + Math.random() * 520;
        this.fx.add({ type: 'img', img: peanut(k, u), x: m.x + (Math.random() - 0.5) * 30 * m.k, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1500, drag: 0.5, life: 1.3 + Math.random() * 0.7 });
      }
      this.fx.burst(m.x, m.y, 60, { type: 'conf', colors: CONFETTI, speed: 760, g: 520, drag: 1.6, life: 2.2, spread: 2.2, flutter: 70 });
      this.fx.burst(m.x, m.y, 16, { colors: [CB.fr, CB.top, CB.tape], color2: CB.out, speed: 600, g: 1600, drag: 0.7, life: 1, size: [1, 2], spread: 2.4 });
      this.fx.burst(m.x, m.y, 18, { type: 'spark', colors: [this.look.glow, '#ffffff'], speed: 380, g: 0, drag: 2.2, life: 0.8, size: [1, 3] });
      this.fx.ring(m.x, m.y, rgba(this.look.glow, 0.85), { r0: 20 * m.k, speed: 620, life: 0.5 });
    }
    this.rays.target = this.best >= 3 ? 0.6 : 0.5; this.rays.speed = 0.3;
    await seq.sleep(this.reduced ? 150 : 560);
    if (this.state === 'dead') return;
    // slide the box aside and pull out the receipt
    this.placeBox(this.openPos, !this.reduced);
    this.sfx('paper');
    this.$.rcpt.classList.add('on');
    this.renderTotals();
    await seq.sleep(this.reduced ? 200 : 620);
    if (this.state === 'dead') return;
    this.state = 'items';
    this.graceUntil = performance.now() + 250;
    for (let i = 0; i < this.items.length; i++) {
      if (this.state !== 'items') return;
      const landed = this.flyItem(i);
      const hero = !this.reduced && !seq.ff && (this.items[i].rarity ?? 0) >= 3;
      if (hero) { await landed; continue; }
      await seq.sleep(this.reduced ? 120 : this.items.length > 5 ? 230 : 380);
      if (i === this.items.length - 1) await landed;
    }
    if (this.state !== 'items') return;
    await seq.sleep(this.reduced ? 100 : 250);
    this.finish();
  }

  // ------------------------------------------------------------------ receipt
  artNode(item, px) {
    const kind = item.kind || 'item';
    let src = item.image;
    if (!src && typeof this.opts.art === 'function') { try { src = this.opts.art(item); } catch { src = null; } }
    const wrap = document.createElement('span');
    wrap.className = 'ub-art';
    if (typeof src === 'string' && src) {
      if (/^\s*</.test(src)) wrap.innerHTML = src;
      else { const im = new Image(); im.src = src; im.alt = ''; im.draggable = false; wrap.appendChild(im); }
    } else if (src && typeof src.getContext === 'function') {
      wrap.appendChild(copyCanvas(src));
    } else if (kind === 'egg' && !item.iconName) {
      wrap.appendChild(eggCanvas(item.rarity ?? 0, 0, Math.max(1, Math.floor(px / 26))));
    } else {
      const name = item.iconName || KIND_ICON[kind] || 'tag';
      wrap.innerHTML = this.icon(name, Math.max(1, Math.floor(px / 16)));
    }
    return wrap;
  }

  buildRows() {
    const box = this.$.rows;
    box.innerHTML = '';
    this.rowEls = this.items.map((it) => {
      const R = it.rarity != null ? RARITIES[it.rarity] : null;
      const row = document.createElement('div');
      row.className = `ub-row${R ? ` t${it.rarity}` : ''}`;
      if (R) { row.style.setProperty('--rc', R.color); row.style.setProperty('--rg', R.glow); }
      const qty = it.qty > 1 ? `<span class="ub-q">x${it.qty}</span>` : '';
      const tag = R && it.rarity > 0 ? `<i class="ub-rar">${esc(R.name)}</i>` : '';
      row.innerHTML = `<span class="ub-ic"></span><span class="ub-txt"><span class="ub-nm">${esc(it.name)}${tag}</span>${it.sub ? `<span class="ub-sub">${esc(it.sub)}</span>` : ''}</span>${qty}`;
      row.querySelector('.ub-ic').appendChild(this.artNode(it, 32));
      box.appendChild(row);
      return row;
    });
  }

  renderTotals() {
    const n = this.items.reduce((a, it) => a + it.qty, 0);
    this.$.tot.textContent = n === 1 ? '1 item' : `${n} items`;
  }

  flyItem(i) {
    const it = this.items[i], row = this.rowEls[i];
    const seq = this.seq;
    row.classList.add('on');
    // keep the row in view inside a long receipt
    const box = this.$.rows;
    if (box.scrollHeight > box.clientHeight) {
      const top = row.offsetTop - box.offsetTop;
      if (top + row.offsetHeight > box.scrollTop + box.clientHeight || top < box.scrollTop) box.scrollTop = Math.max(0, top - box.clientHeight + row.offsetHeight + 6);
    }
    const land = () => {
      if (this.state === 'dead') return;
      row.classList.add('got');
      const ic = row.querySelector('.ub-ic').getBoundingClientRect();
      const r = it.rarity ?? 0;
      this.sfx('pop_in', { pitch: 1 + i * 0.07 });
      if (!this.reduced) {
        this.fxTop.burst(ic.left + ic.width / 2, ic.top + ic.height / 2, 8 + r * 4, { type: 'spark', colors: [it.rarity != null ? RARITIES[r].glow : '#fff6c8', '#ffffff'], speed: 260, g: 0, drag: 3, life: 0.55, size: [1, 2] });
        if (r >= 3) this.fxTop.ring(ic.left + ic.width / 2, ic.top + ic.height / 2, rgba(RARITIES[r].glow, 0.9), { r0: 10, speed: 300, life: 0.45 });
        seq.anim(row.querySelector('.ub-ic'), [{ transform: 'scale(1.5)' }, { transform: 'scale(0.85)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
      }
      if (r >= 3 && (this.reduced || seq.ff)) this.sfx('levelup', { volume: 0.7 });
    };
    if (this.reduced || seq.ff) { land(); return Promise.resolve(); }
    const m = this.mouth();
    const ic = row.querySelector('.ub-ic').getBoundingClientRect();
    const size = Math.round(clamp(16 * m.k, 56, 96));
    const fl = document.createElement('div');
    fl.className = 'ub-flyer' + (it.rarity != null ? ` t${it.rarity}` : '');
    if (it.rarity != null) { fl.style.setProperty('--rg', RARITIES[it.rarity].glow); }
    fl.style.width = fl.style.height = `${size}px`;
    fl.appendChild(this.artNode(it, size));
    this.$.fly.appendChild(fl);
    let x0 = m.x + (Math.random() - 0.5) * 10 * m.k, y0 = m.y;
    const x1 = ic.left + ic.width / 2, y1 = ic.top + ic.height / 2;
    const end = ic.width / size;
    const glowCol = it.rarity != null ? RARITIES[it.rarity].glow : '#fff6c8';
    const hero = (it.rarity ?? 0) >= 3;
    // a trail of sparkles while it flies
    const trail = setInterval(() => {
      if (this.state === 'dead') { clearInterval(trail); return; }
      const r = fl.getBoundingClientRect();
      if (r.width) this.fxTop.add({ type: 'spark', x: r.left + r.width / 2, y: r.top + r.height / 2, life: 0.4, s: 1, color: glowCol });
    }, 60);
    const tf = (x, y, sc, rot = 0) => `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
    const wait = (an, ms) => (an ? Promise.race([an.finished.catch(() => {}), new Promise((r) => setTimeout(r, ms + 600))]) : Promise.resolve());
    const run = async () => {
      let s0 = 0.3;
      if (hero) {
        // epic / legendary: rise out of the box and show off before filing itself
        let hy = y0 - 250;
        if (!this.wide) { // in the gap between the receipt and the box when there is one
          const rb = this.$.rcpt.getBoundingClientRect().bottom, bt = this.openPos.y - (BH - 5) * this.s;
          hy = Math.min(y0 - 120, Math.max(rb + size * 1.1 + 12, (rb + bt) / 2 - size * 1.4));
        }
        hy = Math.max(110, hy);
        const hx = this.wide ? x0 : this.W / 2;
        const R = RARITIES[it.rarity];
        this.sfx('whoosh', { pitch: 0.9 });
        const up = seq.anim(fl, [
          { transform: tf(x0, y0, 0.3) },
          { transform: tf(hx, hy - 16, 2.5), offset: 0.7, easing: 'cubic-bezier(.3,1.5,.5,1)' },
          { transform: tf(hx, hy, 2.2) },
        ], { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
        await wait(up, 560);
        if (this.state === 'dead') return;
        fl.classList.add('hero');
        this.sfx('levelup');
        this.fxTop.ring(hx, hy, rgba(R.glow, 0.9), { r0: size * 0.6, speed: 520, life: 0.5 });
        this.fxTop.burst(hx, hy, 26, { type: 'spark', colors: [R.glow, '#ffffff', R.color], speed: 420, g: 0, drag: 2.4, life: 0.8, size: [1, 3] });
        this.fx.burst(hx, hy, 30, { type: 'conf', colors: [R.color, R.glow, '#ffffff'], speed: 520, g: 420, drag: 1.6, life: 1.8, spread: Math.PI * 2, flutter: 60 });
        const tag = document.createElement('div');
        tag.className = 'ub-herotag';
        tag.style.left = `${hx}px`; tag.style.top = `${hy + size * 1.1 + 6}px`;
        tag.style.setProperty('--rc', R.color);
        tag.innerHTML = `<b>${esc(R.name)}!</b><span>${esc(it.name)}</span>`;
        this.$.fly.appendChild(tag);
        await seq.sleep(900);
        tag.remove();
        fl.classList.remove('hero');
        if (this.state === 'dead') return;
        x0 = hx; y0 = hy; s0 = 2.2;
      }
      const apex = Math.min(y0, y1) - (hero ? 40 : this.wide ? 120 : 70);
      const cx = this.wide ? (x0 * 0.65 + x1 * 0.35) : (x0 + x1) / 2 + (i % 2 ? 60 : -60);
      const kf = [];
      const N = 12, spin = (i % 2 ? 1 : -1) * (180 + Math.random() * 180);
      for (let k = 0; k <= N; k++) {
        const t = k / N, a = 1 - t;
        const x = a * a * x0 + 2 * a * t * cx + t * t * x1;
        const y = a * a * y0 + 2 * a * t * apex + t * t * y1;
        const sc = hero ? s0 + (end - s0) * t ** 1.3 : t < 0.18 ? s0 + (t / 0.18) * 1.05 : 1.35 + (end - 1.35) * ((t - 0.18) / 0.82) ** 1.4;
        const rot = t < 0.8 ? spin * (1 - t / 0.8) * 0.25 : 0;
        kf.push({ transform: tf(x, y, sc, rot), offset: t });
      }
      this.sfx('whoosh', { pitch: 1.4 + i * 0.05, volume: 0.5 });
      const dur = 640;
      await wait(seq.anim(fl, kf, { duration: dur, easing: 'cubic-bezier(.3,.1,.55,1)', fill: 'forwards' }), dur);
    };
    return run().then(() => { clearInterval(trail); fl.remove(); land(); });
  }

  finish() {
    if (this.state === 'dead' || this.state === 'closing' || this.state === 'done') return;
    this.state = 'done';
    this.graceUntil = performance.now() + 450;
    this.seq.slow();
    this.$.stamp.innerHTML = paperStamp('Delivered', '#2f7f3a', -9, { anim: !this.reduced, cls: 'ub-stamp' });
    this.sfx('buy');
    this.seq.after(this.reduced ? 0 : 260, () => this.sfx('coins', { volume: 0.6 }));
    this.el.classList.add('done');
  }

  // ------------------------------------------------------------------ skip / close
  skip() {
    if (this.state === 'done') { this.close(); return; }
    if (this.state === 'closing' || this.state === 'dead') return;
    const seq = this.seq;
    seq.fast();
    for (const id of seq.timers) clearTimeout(id);
    seq.timers.clear();
    this.idleTimer = 0; this.wigTimer = 0;
    this.state = 'skipping';
    this.$.drop.style.transform = 'none';
    for (const k of ['drop', 'wob', 'shk', 'shadow']) this.$[k].getAnimations().forEach((a) => a.cancel());
    this.$.fly.innerHTML = '';
    this.$.prompt.classList.remove('on');
    this.$.banner.classList.remove('on');
    this.setBox('open');
    this.open = true;
    this.el.classList.add('opened');
    this.placeBox(this.openPos, false);
    this.rays.target = 0.5;
    this.$.rcpt.classList.add('on', 'ub-instant');
    this.renderTotals();
    this.rowEls.forEach((r) => r.classList.add('on', 'got'));
    seq.slow();
    this.state = 'items';
    this.finish();
  }

  close(now) {
    if (this.state === 'closing' || this.state === 'dead') return;
    this.state = 'closing';
    this.seq.fast();
    this.el.classList.add('closing');
    if (now) { this.destroy(); return; }
    setTimeout(() => this.destroy(), 360);
  }

  destroy() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.seq.kill();
    cancelAnimationFrame(this.raf);
    if (this.unbind) this.unbind();
    window.removeEventListener('resize', this.onResize);
    if (this.el) this.el.remove();
    this.resolve();
  }
}

// exposed for previews / tests
export const __unboxDev = { boxCanvas, BW, BH };
