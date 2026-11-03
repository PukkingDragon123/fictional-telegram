// [v31 dialogue] The dialogue box: every conversation line (cutscenes, the tour, Reynard's tips) is said
// in one fixed place, never as loose words floating around the screen.
//
// A hand-made pixel panel (dark walnut frame, brass rivets, a dithered inner shade), the speaker's
// portrait (a live render of their real rig, src/ui/faces3d.js) in a sunken frame, a name plate in
// their colour, and the line typed in beside it by the kinetic text engine (src/ui/kinetic/floatText.js),
// so shouts still shake, whispers waver and the CEO's phone still crackles, inside the box.
// It sits at the bottom of the screen (over the letterbox bar in cutscenes), or at the top when the
// thing to tap is down there. The panel art is drawn on its own crisp canvas under the text layer.
//
//   const h = sayLine({ name, color, portrait, text, style, voice, pos })   portrait: a faceCanvas spec
//      -> the floatText handle ({ typed, done, wait(on), skip(), dismiss() }); the box stays up until
//         hideDialogue() or the next line
//   hideDialogue()
//   noticePanel(getRect) -> remove()      a plain panel behind other text (quest news), art px rect
import { floatAt, floatSize } from './floatText.js';
import { faceCanvas } from '../faces3d.js';

const OUT = '#120a06';
const WOOD = ['#3a2416', '#4e321f', '#6a4529', '#86592f'];
const FILL = ['#1c1420', '#241a28', '#2c2130'];
const BRASS = ['#6a4a18', '#b8862a', '#e8c25a', '#fff0b0'];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dz = (x, y, k) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < k;

let cv = null, g = null, S = 3, CW = 0, CH = 0, raf = 0;
let box = null; // { name, color, portrait, pos, t0, out }
const notices = new Set();
const pcache = new Map();

function layer() {
  if (cv && cv.isConnected) return true;
  if (typeof document === 'undefined' || !document.body) return false;
  cv = document.createElement('canvas');
  cv.className = 'kt-dialogue';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:71;image-rendering:pixelated;image-rendering:crisp-edges';
  document.body.appendChild(cv);
  g = cv.getContext('2d');
  return true;
}
function fit() {
  const z = floatSize();
  if (z.W !== CW || z.H !== CH || z.S !== S || !cv.width) {
    S = z.S; CW = z.W; CH = z.H;
    cv.width = CW; cv.height = CH;
    cv.style.width = CW * S + 'px'; cv.style.height = CH * S + 'px';
    g.imageSmoothingEnabled = false;
  }
}
const barsOn = () => document.body.classList.contains('cine');

/** where the box goes (art px) */
function boxRect(pos) {
  const w = Math.min(CW - 16, 252), h = 50;
  const x = Math.round((CW - w) / 2);
  const bar = barsOn() ? Math.ceil(CH * 0.11) : 0;
  const y = pos === 'top' ? Math.max(6, bar - 22) + 4 : CH - h - Math.max(6, bar - 30);
  return { x, y, w, h };
}

// ------------------------------------------------------------------ the panel art
function panel(x, y, w, h, { nameW = 0, nameCol = null, portrait = null, out = 0 } = {}) {
  const R = (c, a, b, cw, ch) => { g.fillStyle = c; g.fillRect(a, b, cw, ch); };
  // a hard dithered drop shadow
  for (let py = y + 3; py < y + h + 3; py++) for (let px = x + 3; px < x + w + 3; px++) if (dz(px, py, 0.55)) R('rgba(0,0,0,0.5)', px, py, 1, 1);
  // ink outline with cut corners
  R(OUT, x + 2, y, w - 4, h); R(OUT, x, y + 2, w, h - 4); R(OUT, x + 1, y + 1, w - 2, h - 2);
  // the walnut frame: lit top, dark bottom, grain flecks
  R(WOOD[1], x + 1, y + 2, w - 2, h - 4); R(WOOD[1], x + 2, y + 1, w - 4, h - 2);
  R(WOOD[2], x + 2, y + 1, w - 4, 1); R(WOOD[3], x + 3, y + 1, w - 10, 1);
  R(WOOD[0], x + 2, y + h - 2, w - 4, 1);
  for (let i = 0; i < w; i += 7) { R(WOOD[2], x + 3 + i, y + 2 + ((i * 7) % 3), 2, 1); R(WOOD[0], x + 5 + i, y + h - 4 + ((i * 3) % 2), 2, 1); }
  // the inside: deep plum, dithered shade under the top lip, a lit bottom lip
  const ix = x + 4, iy = y + 4, iw = w - 8, ih = h - 8;
  R(OUT, ix - 1, iy - 1, iw + 2, ih + 2);
  R(FILL[1], ix, iy, iw, ih);
  for (let py = iy; py < iy + 4; py++) for (let px = ix; px < ix + iw; px++) if (dz(px, py, 0.5 - (py - iy) * 0.12)) R(FILL[0], px, py, 1, 1);
  for (let px = ix; px < ix + iw; px++) if (dz(px, iy + ih - 1, 0.5)) R(FILL[2], px, iy + ih - 1, 1, 1);
  // brass rivets in the corners
  const riv = (rx, ry) => { R(OUT, rx - 1, ry - 1, 4, 4); R(BRASS[1], rx, ry, 2, 2); R(BRASS[3], rx, ry, 1, 1); R(BRASS[0], rx + 1, ry + 1, 1, 1); };
  riv(x + 2, y + 2); riv(x + w - 4, y + 2); riv(x + 2, y + h - 4); riv(x + w - 4, y + h - 4);
  // the portrait: a sunken frame with the rig's face
  if (portrait) {
    const px = ix + 3, py = iy + 3, ps = ih - 6;
    R(OUT, px - 1, py - 1, ps + 2, ps + 2);
    R(WOOD[0], px, py, ps, ps);
    R('#3a2c3e', px + 1, py + 1, ps - 2, ps - 2);
    for (let yy = py + 1; yy < py + ps - 1; yy++) for (let xx = px + 1; xx < px + ps - 1; xx++) if (dz(xx, yy, 0.25)) R('#45364a', xx, yy, 1, 1);
    const pc = portraitCanvas(portrait, ps - 2);
    if (pc) g.drawImage(pc, px + 1, py + 1);
    R(BRASS[2], px - 1, py + ps, ps + 2, 1);
  }
  // the name plate on the top edge
  if (nameW && nameCol) {
    const nx = x + (portrait ? 46 : 10), ny = y - 6;
    R(OUT, nx - 1, ny - 1, nameW + 10, 11);
    R(nameCol, nx, ny, nameW + 8, 9);
    R('rgba(255,255,255,0.35)', nx, ny, nameW + 8, 1);
    R('rgba(0,0,0,0.3)', nx, ny + 8, nameW + 8, 1);
  }
  void out;
}

function portraitCanvas(spec, size) {
  const key = JSON.stringify(spec) + '@' + size;
  if (pcache.has(key)) return pcache.get(key);
  let c = null;
  try { c = faceCanvas({ frame: 'bust', ...spec }, size, size); } catch { c = null; }
  if (c) pcache.set(key, c);
  return c;
}

function loop() {
  raf = 0;
  if (!layer()) return;
  fit();
  g.clearRect(0, 0, CW, CH);
  for (const n of notices) { const r = n(); if (r) panel(r.x, r.y, r.w, r.h); }
  if (box) {
    const r = boxRect(box.pos);
    // slides up a few pixels as it opens
    const age = (performance.now() - box.t0) / 1000;
    const dy = age < 0.06 ? 6 : age < 0.12 ? 3 : age < 0.18 ? 1 : 0;
    panel(r.x, r.y + (box.pos === 'top' ? -dy : dy), r.w, r.h, { nameW: box.nameW, nameCol: box.color, portrait: box.portrait });
  }
  if (box || notices.size) raf = requestAnimationFrame(loop);
  else g.clearRect(0, 0, CW, CH);
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

// ------------------------------------------------------------------ lines
let current = null, nameItem = null;
const TINY_W = 4; // tiny caps advance (3 px + gap)
/** say a line in the box (replaces the previous one) */
export function sayLine({ name = '', color = '#ff9a3c', portrait = null, text = '', style = 'say', voice = null, pos = 'bottom' } = {}) {
  if (!layer()) return null;
  fit();
  hideTok++;
  current?.dismiss();
  nameItem?.dismiss();
  const nm = String(name || '').toUpperCase();
  const nameW = nm.length * TINY_W;
  const same = box && box.name === nm && box.pos === pos;
  box = { name: nm, color, portrait, pos, nameW, t0: same ? box.t0 : performance.now() };
  kick();
  const r0 = () => boxRect(pos);
  const hasP = !!portrait;
  const tx = () => r0().x + (hasP ? 52 : 12);
  const maxW = () => r0().w - (hasP ? 52 : 12) - 10;
  if (nm) nameItem = floatAt({ text: nm, style: 'say', k: 1, hold: true, look: { font: 'tiny', k: 1, fill: '#1a1016', out: color, speed: 400, track: 1, maxW: 400 }, prio: 0, fixed: () => [r0().x + (hasP ? 46 : 10) + 4, r0().y - 6] });
  current = floatAt({
    text, style, k: 1, hold: true, voice, color, align: 'left', prio: 0,
    look: { font: style === 'think' ? 'script' : 'body', k: 1, maxW: maxW() },
    fixed: () => [tx(), r0().y + 7],
  });
  return current;
}
let hideTok = 0;
/** take the box away after `ms` unless another line arrives first */
export function hideDialogueSoon(ms = 350) {
  const tok = ++hideTok;
  setTimeout(() => { if (tok === hideTok) hideDialogue(); }, ms);
}
export function hideDialogue() {
  current?.dismiss(); current = null;
  nameItem?.dismiss(); nameItem = null;
  box = null;
  kick();
}
export function dialogueUp() { return !!box; }

/** a plain panel behind something else (quest news): rect() -> { x, y, w, h } in art px */
export function noticePanel(rect) {
  if (!layer()) return () => {};
  fit();
  notices.add(rect);
  kick();
  return () => { notices.delete(rect); kick(); };
}
