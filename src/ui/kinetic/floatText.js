// [v31 kinetic] Kinetic floating text, borrowed from Project Zealandia (refactored-garbanzo
// src/ui/v12/float.ts) and ported to The Bear Must Eat: no boxes, no bubbles. The words float in
// the world by whoever says them, type in letter by letter and MOVE by how they are said.
//
// Everything is drawn into ONE low-res overlay canvas on a pixel grid (1 canvas px = 1 art px,
// shown at a whole-number scale with image-rendering: pixelated) in Zealandia's bitmap fonts
// (src/ui/kinetic/pxfont.js: 'body' / 'bold' / 'tiny' / the 'script' marker hand). Every glyph has
// a hard 1 px dark ring and a drop pixel so it reads over grass, water, snow or night, and every
// letter moves by whole pixels.
//
// Styles (how a line is said):
//   say      a gentle rise-and-settle as each letter lands
//   shout    big chunky letters that punch in, shake, burst marks at the corners, a camera kick
//   whisper  small, faint, wavering
//   scared   pale letters that tremble and stutter as they type
//   happy    a bouncy wave              laugh    a bigger, faster bounce
//   excited  hops + a warm colour       angry    red-hot letters that jitter, a growl in the shake
//   sad      slow typing, letters droop and sag
//   think    the marker hand, the whole thought drifts, little dots rise from the head
//   radio    phosphor green, crackling flicker (phone calls from the office tower)
//   notice   small, drifts up and dissolves
//   spooky   letters drift on their own, flicker and fade (night and secrets)
//   gold     glittering gold letters with a travelling shine (rare finds, big money)
//
// API
//   bindFloat(game)                            once (UI does it); projection, audio, camera kick
//   floatText({ text, at, style, name, color, voice, hold, ms, speed, k, kind, cine, offsetY })
//        at: () => [cssX, cssY] | THREE.Vector3-like {x,y,z} | { getWorldPos(v) } | [cssX, cssY]
//        -> handle { typed, done, isTyped(), skip(), wait(on), dismiss(), alive() }
//   floatTitle({ title, kicker, sub, style, y, hold, ms, k, color, color2, depth })   big title cards
//   floatCaption(text, { ms, hold })           narration at the bottom (the marker hand)
//   clearFloats(pred?)                         take lines away (pred(item) -> bool)
//   skipAllFloats()                            type out whatever is typing
//
// Markup: *emphasis*, _aside_, <b>keyword</b>, <br> / \n line breaks, ♥ ★ ♪ ✓ as painted glyphs.
import { Vector3 } from 'three';
import { pxMeasure, pxTextBuf } from './pxfont.js';

const OUT = '#120a06';
const rgb = (h) => {
  let s = String(h).replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hx2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export function mixHex(a, b, k) {
  const A = rgb(a), B = rgb(b);
  return '#' + hx2(A[0] + (B[0] - A[0]) * k) + hx2(A[1] + (B[1] - A[1]) * k) + hx2(A[2] + (B[2] - A[2]) * k);
}
const nameCol = (c) => { const [r, g, b] = rgb(c); const l = (r * 3 + g * 4 + b) / 8; return mixHex(c, '#ffffff', l < 90 ? 0.55 : l < 150 ? 0.35 : 0.15); };
const tintCol = (c) => mixHex(mixHex(c, '#ffffff', 0.68), '#fff6e4', 0.28);
const hash = (a, b) => {
  let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
};
const now = () => performance.now() / 1000;
let reduced = false;
try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* */ }

// ---------------------------------------------------------------- game binding
let game = null;
const _v = new Vector3();
export function bindFloat(g) { game = g; }

// ---------------------------------------------------------------- the overlay canvas
let cv = null, g = null;
let S = 3, CW = 0, CH = 0;
function layer() {
  if (cv && cv.isConnected) return true;
  if (typeof document === 'undefined' || !document.body) return false;
  cv = document.createElement('canvas');
  cv.className = 'kt-float';
  cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:72;image-rendering:pixelated;image-rendering:crisp-edges';
  document.body.appendChild(cv);
  g = cv.getContext('2d');
  CW = CH = 0;
  return !!g;
}
/** the art-pixel scale: 3 at 1280x720, 2 on phones, more on big screens (always a whole number) */
export function floatScale() {
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  return Math.max(2, Math.min(6, Math.round(Math.min(w / 427, h / 240))));
}
function fitLayer() {
  const s = floatScale();
  const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
  const w = Math.max(1, Math.ceil(vw / s)), h = Math.max(1, Math.ceil(vh / s));
  if (w !== CW || h !== CH || s !== S || !cv.width) {
    S = s; CW = w; CH = h;
    cv.width = w; cv.height = h;
    cv.style.width = w * s + 'px';
    cv.style.height = h * s + 'px';
    g.imageSmoothingEnabled = false;
  }
}

// ---------------------------------------------------------------- sprites (cached canvases)
const sprites = new Map();
function sprite(key, make) {
  let s = sprites.get(key);
  if (!s) { s = make(); sprites.set(key, s); }
  return s;
}
const bufSpr = (b) => ({ c: b.toCanvas(1), w: b.w, h: b.h });
// a glyph's letter pixels (origin: 1 px left of the glyph, 3 px above its cap line)
const fillSpr = (font, ch, col) => sprite(`f|${font}|${ch}|${col}`, () => bufSpr(pxTextBuf(ch, { font, color: col, pad: 1, bounce: false })));
// the glyph's dark ring and drop pixel, same origin
const silSpr = (font, ch, col) => sprite(`o|${font}|${ch}|${col}`, () => bufSpr(pxTextBuf(ch, { font, color: col, outline: col, shadow: col, bounce: false })));
function rowsSpr(key, rows, pal) {
  return sprite('r|' + key, () => {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const p = pal[r[i]]; if (p) { x.fillStyle = p; x.fillRect(i, j, 1, 1); } } });
    return { c, w, h };
  });
}
const MORE = ['kkkkkkk', 'kccccck', '.kccck.', '..kck..', '...k...'];
const PHONE = [
  '.kkkkk...', 'kgggggk..', 'kgdddgk..', 'kgdddgk..', 'kgggggk..', 'kgLgLgk..', 'kgggggk..', 'kgLgLgk..', 'kgggggk..', '.kkkkk...',
];
const DOT = (r) => {
  const n = Math.round(r * 2 + 3), rows = [];
  for (let y = 0; y < n; y++) {
    let s = '';
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - (n - 1) / 2, y - (n - 1) / 2);
      s += d <= r + 0.2 ? 'c' : d <= r + 1.25 ? 'k' : '.';
    }
    rows.push(s);
  }
  return rows;
};
// painted glyphs for the symbols lines use
const ICONS = {
  heart: { rows: ['.kk.kk.', 'krrkrrk', 'krwrrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'], pal: { k: OUT, r: '#ff4a6a', w: '#ffd0da' } },
  star: { rows: ['...k...', '..kyk..', 'kkkykkk', 'kyyyyyk', '.kyyyk.', '.kykyk.', 'kk...kk'], pal: { k: OUT, y: '#ffd84a' } },
  note: { rows: ['...kkk', '...kwk', '...k.k', '...k.k', 'kkkk.k', 'kwwk.k', 'kkkk..'], pal: { k: OUT, w: '#fff6e4' } },
  check: { rows: ['.....kk', '....kgk', 'kk.kgk.', 'kgkgk..', '.kgk...', '..k....'], pal: { k: OUT, g: '#8af07a' } },
  coin: { rows: ['.kkkk.', 'kyyyyk', 'kyWyyk', 'kyyyyk', 'kyyyok', '.kkkk.'], pal: { k: OUT, y: '#ffd04a', W: '#fffbe0', o: '#d08a1a' } },
  fish: { rows: ['..kkk..k', '.kbbbkkb', 'kbwbbbbk', 'kbbbbbbk', '.kbbbkkb', '..kkk..k'], pal: { k: OUT, b: '#6ac8ff', w: '#ffffff' } },
};
const ICON_OF = { '♥': 'heart', '❤': 'heart', '★': 'star', '♪': 'note', '♫': 'note', '✓': 'check', '✔': 'check', '¢': 'coin', '¤': 'fish' };
const iconSpr = (name) => rowsSpr('i' + name, ICONS[name].rows, ICONS[name].pal);

// ---------------------------------------------------------------- text -> tokens
// marks: 0 plain, 1 emphasis, 2 keyword, 3 aside
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', times: '×' };
export function parseFloatText(src) {
  const s = String(src ?? '')
    .replace(/\*([^*]+)\*?/g, '\u0001$1\u0002')
    .replace(/(^|[\s(“"'‘])_([^_]+)_?/g, '$1\u0005$2\u0006');
  const out = [];
  const stack = [0];
  const mark = () => stack[stack.length - 1];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\u0001') { stack.push(1); continue; }
    if (c === '\u0005') { stack.push(3); continue; }
    if (c === '\u0002' || c === '\u0006') { if (stack.length > 1) stack.pop(); continue; }
    if (c === '<') {
      const j = s.indexOf('>', i);
      if (j < 0) { out.push({ t: 'c', ch: c, mark: mark() }); continue; }
      const tag = s.slice(i + 1, j).trim().toLowerCase();
      i = j;
      if (/^br\b/.test(tag)) { out.push({ t: 'nl', ch: '\n', mark: 0 }); continue; }
      if (/^(b|strong|mark)\b/.test(tag)) { stack.push(2); continue; }
      if (/^em\b/.test(tag)) { stack.push(1); continue; }
      if (/^i\b/.test(tag)) { stack.push(3); continue; }
      if (/^\/(b|strong|mark|em|i)\b/.test(tag)) { if (stack.length > 1) stack.pop(); continue; }
      continue;
    }
    let ch = c;
    if (c === '&') {
      const j = s.indexOf(';', i);
      if (j > i && j - i < 9) { const v = ENT[s.slice(i + 1, j)]; if (v !== undefined) { ch = v; i = j; } }
    } else if (c >= '\ud800' && c <= '\udbff') { i++; continue; } // emoji: never drawn
    if (ch === '\n') { out.push({ t: 'nl', ch, mark: 0 }); continue; }
    if (ch === ' ' || ch === '\t' || ch === ' ') { out.push({ t: 'sp', ch: ' ', mark: mark() }); continue; }
    if (ICON_OF[ch]) { out.push({ t: 'icon', ch: ICON_OF[ch], mark: mark() }); continue; }
    if (/[​-‏️]/.test(ch)) continue;
    out.push({ t: 'c', ch, mark: mark() });
  }
  return out.filter((t, k) => !(t.t === 'sp' && out[k - 1]?.t === 'sp'));
}
const plainOf = (toks) => toks.map((t) => (t.t === 'icon' ? '*' : t.t === 'nl' ? ' ' : t.ch)).join('');

// ---------------------------------------------------------------- looks
// font metrics: [cap, descender, line height]
const FM = { body: [6, 2, 11], bold: [6, 2, 11], tiny: [5, 1, 8], script: [8, 3, 14] };
function lookFor(style, speaker, plainLen) {
  const L = { font: 'body', k: 1, fill: '#fff6e4', out: OUT, em: '#ff7a52', kw: '#ffe066', aside: '#b8ac98', speed: 46, maxW: 168, track: 0, depth: 0 };
  const tint = speaker ? tintCol(speaker) : null;
  switch (style) {
    case 'say': if (tint) L.fill = tint; break;
    case 'shout':
      L.font = 'bold'; L.k = plainLen <= 26 ? 2 : 1; L.speed = 62; L.maxW = L.k === 2 ? 200 : 176;
      L.fill = tint ? mixHex(tint, '#ffffff', 0.35) : '#ffffff'; L.em = '#ff5a3a';
      break;
    case 'angry': L.font = 'bold'; L.fill = '#ffb4a0'; L.em = '#ff4020'; L.kw = '#ffd040'; L.speed = 56; break;
    case 'excited': L.font = 'bold'; L.fill = tint ? mixHex(tint, '#fff0a0', 0.4) : '#fff0a8'; L.speed = 58; break;
    case 'whisper': L.fill = '#aeb6c6'; L.out = '#1a1c26'; L.em = '#d8a090'; L.kw = '#d8cc90'; L.aside = '#7e8494'; L.speed = 34; L.maxW = 150; break;
    case 'scared': L.fill = '#dce8ff'; L.speed = 40; break;
    case 'happy': L.fill = tint ? mixHex(tint, '#fff2b0', 0.35) : '#fff2c0'; L.speed = 50; break;
    case 'laugh': L.fill = '#fff0a0'; L.speed = 54; break;
    case 'sad': L.fill = '#a9bde0'; L.out = '#0c1018'; L.speed = 26; break;
    case 'think': L.font = 'script'; L.fill = '#e4dcff'; L.speed = 40; L.maxW = 160; break;
    case 'radio': L.fill = '#9dffd8'; L.out = '#03120c'; L.kw = '#ffe45a'; L.em = '#ffb070'; L.aside = '#4fae90'; L.speed = 52; L.maxW = 170; break;
    case 'notice': L.fill = '#fff1cc'; L.speed = 80; L.maxW = 180; break;
    case 'spooky': L.fill = '#c8ffe8'; L.out = '#06120e'; L.em = '#7affc0'; L.speed = 28; break;
    case 'gold': L.font = 'bold'; L.fill = '#ffd84a'; L.em = '#fff6c0'; L.kw = '#fffbe0'; L.speed = 50; break;
    case 'caption': L.font = 'script'; L.fill = '#f6ecd4'; L.speed = 40; L.maxW = 280; break;
  }
  return L;
}

// ---------------------------------------------------------------- items
let items = [];
let nextId = 1;
let raf = 0;
let lastT = 0;

function advOf(font, ch) {
  return sprite(`a|${font}|${ch}`, () => ({ c: null, w: pxMeasure(ch + 'l', font) - pxMeasure('l', font), h: 0 })).w;
}
function tokW(t, L) {
  if (t.t === 'icon') return (iconSpr(t.ch).w + 1) * L.k;
  return (advOf(L.font, t.ch) + L.track) * L.k;
}
function layoutToks(toks, L, maxW) {
  const gl = [];
  let x = 0, row = 0, i = 0, n = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === 'nl') { row++; x = 0; i++; continue; }
    if (t.t === 'sp') {
      if (x > 0) { const w = tokW(t, L); gl.push({ ...t, x, row, w, born: -1, i: n++ }); x += w; }
      i++;
      continue;
    }
    let j = i, ww = 0;
    while (j < toks.length && toks[j].t !== 'sp' && toks[j].t !== 'nl') { ww += tokW(toks[j], L); j++; }
    if (x > 0 && x + ww > maxW) { row++; x = 0; }
    for (let k = i; k < j; k++) {
      const w = tokW(toks[k], L);
      if (x > 0 && x + w > maxW && ww > maxW) { row++; x = 0; }
      gl.push({ ...toks[k], x, row, w, born: -1, i: n++ });
      x += w;
    }
    i = j;
  }
  const rows = row + 1;
  const rowW = new Array(rows).fill(0);
  for (const q of gl) if (q.t !== 'sp') rowW[q.row] = Math.max(rowW[q.row], q.x + q.w - (q.t === 'c' ? L.k : 0));
  return { gl: gl.filter((q) => !(q.t === 'sp' && q.x >= rowW[q.row])), rows, rowW };
}
const pend = () => { let r; const p = new Promise((res) => (r = res)); return [p, r]; };

function make(o) {
  const toks = parseFloatText(o.text);
  const L = { ...lookFor(o.style, o.color, plainOf(toks).length), ...(o.look || {}) };
  if (o.speed) L.speed *= o.speed;
  if (o.k) L.k = o.k;
  const lead = o.style === 'radio' ? 12 : 0;
  const maxW = Math.max(60, Math.min(o.maxW || L.maxW * L.k, Math.floor((CW || 420) * (o.kind === 'title' ? 0.94 : 0.7)) - lead));
  const lay = layoutToks(toks, L, maxW);
  const [fm0, fm1, fm2] = FM[L.font];
  const lh = fm2 * L.k;
  let name = null, nameW = 0;
  if (o.name) {
    const nl = layoutToks(parseFloatText(String(o.name).toUpperCase()), { ...L, font: 'tiny', k: 1, track: 1 }, 999);
    name = nl.gl; nameW = nl.rowW[0] || 0;
  }
  const textW = Math.max(0, ...lay.rowW);
  const nameH = name ? 9 : 0;
  const W = Math.max(textW + lead, nameW);
  const H = nameH + (lay.rows - 1) * lh + (fm0 + fm1) * L.k + 3 + L.depth;
  const [typed, resTyped] = pend();
  const [done, resDone] = pend();
  const it = {
    id: nextId++, kind: o.kind || 'line', style: o.style || 'say', look: L, gl: lay.gl, rows: lay.rows, rowW: lay.rowW, W, H, lh,
    name, nameW, nameCol: o.color ? nameCol(o.color) : '#fff1cc', nameH, lead,
    anchor: o.anchor || null, align: o.align || 'center', prio: o.prio ?? 5, cine: !!o.cine,
    t0: now() + (o.delay || 0), pre: o.pre || 0, shown: 0, pause: 0, typedAt: -1, hold: !!o.hold, ttl: o.ttl ?? 2.6,
    outAt: -1, stag: 0.01, waiting: false, rise: o.rise || 0, offsetY: o.offsetY || 0,
    px: 0, py: 0, off: 0, placed: false, vis: false, ax: 0, ay: 0,
    resTyped, resDone, typed, done, isTyped: false, gone: false, fixed: o.fixed || null, group: o.group || 0,
    voice: o.voice || null, voiced: false, vol: o.vol,
  };
  if (!it.gl.length) { it.isTyped = true; it.typedAt = now(); resTyped(); }
  return it;
}

function add(it) {
  if (!layer()) { it.isTyped = true; it.resTyped(); it.gone = true; it.resDone(); return it; }
  fitLayer();
  items.push(it);
  if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
  return it;
}

function leave(it, fast = false) {
  if (it.outAt >= 0 || it.gone) return;
  const n = Math.max(1, it.gl.length);
  it.outAt = now();
  it.stag = fast ? Math.min(0.008, 0.1 / n) : Math.min(0.02, 0.36 / n);
  it.waiting = false;
  if (!it.isTyped) { it.isTyped = true; it.resTyped(); }
}
function skipItem(it) {
  if (it.isTyped) return;
  const t = now();
  let j = 0;
  for (const q of it.gl) if (q.born < 0) q.born = t + (j++) * 0.004;
  it.shown = it.gl.length;
  it.pre = 0;
}
function handle(it) {
  return {
    id: it.id,
    width: it.W,
    height: it.H,
    typed: it.typed,
    done: it.done,
    isTyped: () => it.isTyped,
    skip: () => skipItem(it),
    wait: (on) => { it.waiting = on; },
    dismiss: () => leave(it, it.kind === 'line'),
    alive: () => !it.gone && it.outAt < 0,
  };
}

// ---------------------------------------------------------------- anchors
/** anything -> () => [cssX, cssY] | null */
export function toAnchor(a, lift = 0) {
  if (!a) return null;
  if (typeof a === 'function') return a;
  if (Array.isArray(a)) return () => a;
  const project = (x, y, z) => {
    if (!game?.rig || !game.renderer) return null;
    const rig = game.overrideRig || game.rig;
    _v.set(x, y + lift, z);
    const p = rig.worldToScreen(_v, game.renderer);
    return p.visible ? [p.x, p.y] : null;
  };
  if (typeof a.getWorldPos === 'function') return () => { a.getWorldPos(_v); return project(_v.x, _v.y, _v.z); };
  if (typeof a.x === 'number' && typeof a.z === 'number') return () => project(a.x, a.y || 0, a.z);
  return null;
}

// ---------------------------------------------------------------- the frame
const barsOn = () => typeof document !== 'undefined' && document.body.classList.contains('cine');
const topMargin = () => (barsOn() ? Math.ceil(CH * 0.11) + 3 : 4);
const botMargin = () => (barsOn() ? Math.ceil(CH * 0.11) + 3 : 4);
const panelUp = () => {
  const u = game?.ui;
  return !!(u && (u.panel || document.querySelector('#ui .modal-wrap:not(.hidden)')));
};

function loop(ms) {
  raf = 0;
  const dt = Math.min(0.25, Math.max(0, (ms - lastT) / 1000));
  lastT = ms;
  if (!cv || !cv.isConnected) { if (!layer()) { items = []; return; } }
  fitLayer();
  const t = now();
  tick(t, dt);
  placeAll(t, dt);
  g.clearRect(0, 0, CW, CH);
  for (const it of items) drawItem(it, t);
  items = items.filter((it) => !it.gone);
  if (items.length) raf = requestAnimationFrame(loop);
  else g.clearRect(0, 0, CW, CH);
}

const PUNCT_LONG = /[.!?…]/, PUNCT_SHORT = /[,;:—–]/;
function tick(t, dt) {
  for (const it of items) {
    if (it.gone || t < it.t0) continue;
    if (!it.isTyped) {
      if (it.pre > 0) { it.pre -= dt; continue; }
      if (!it.voiced) { it.voiced = true; voice(it); }
      if (it.pause > 0) { it.pause -= dt; continue; }
      const before = Math.floor(it.shown);
      let sp = it.look.speed;
      if (it.style === 'scared' && hash(it.id, Math.floor(it.shown)) < 0.18) sp *= 0.35;
      if (it.style === 'radio' && hash(it.id * 7, Math.floor(t * 6)) < 0.12) sp *= 0.2;
      it.shown = Math.min(it.gl.length, it.shown + dt * sp);
      const n = Math.floor(it.shown);
      for (let k = before; k < n; k++) {
        const q = it.gl[k];
        if (q.born < 0) q.born = t;
        if (k === n - 1) {
          const nx = it.gl[k + 1];
          if (PUNCT_LONG.test(q.ch) && (!nx || nx.t === 'sp')) it.pause = it.style === 'sad' ? 0.36 : it.style === 'scared' ? 0.3 : 0.18;
          else if (PUNCT_SHORT.test(q.ch)) it.pause = 0.08;
        }
      }
      if (it.shown >= it.gl.length) {
        for (const q of it.gl) if (q.born < 0) q.born = t;
        it.isTyped = true;
        it.typedAt = t;
        it.resTyped();
      }
    } else if (it.typedAt < 0) it.typedAt = t;
    if (it.outAt < 0 && it.isTyped && !it.hold && t - it.typedAt > it.ttl) leave(it);
    if (it.outAt >= 0 && t > it.outAt + it.gl.length * it.stag + 0.14) { it.gone = true; it.resDone(); }
  }
}

// one babble per line, its syllables timed to the typing
function voice(it) {
  if (!it.voice || !game?.audio?.babble) return;
  const st = it.style;
  const text = plainOf(it.gl);
  const vol = it.vol ?? (st === 'shout' || st === 'angry' ? 0.5 : st === 'whisper' ? 0.14 : st === 'radio' ? 0.26 : st === 'spooky' ? 0.18 : 0.34);
  const pitch = st === 'shout' || st === 'angry' ? 0.9 : st === 'whisper' ? 1.08 : st === 'radio' ? 1.25 : st === 'sad' ? 0.88 : st === 'scared' ? 1.14 : st === 'excited' || st === 'happy' ? 1.06 : 1;
  try { game.audio.babble(it.voice, text, { volume: vol, pitch, cps: Math.max(8, Math.min(30, it.look.speed * 0.42)) }); } catch { /* */ }
}

const hit = (r, x, y, w, h, pad = 2) => x < r.x + r.w + pad && x + w + pad > r.x && y < r.y + r.h + pad && y + h + pad > r.y;

function natural(it, t) {
  if (it.fixed) return it.fixed(it);
  const a = it.anchor ? it.anchor() : null;
  if (!a) {
    if (it.kind === 'bark') return null;
    return [Math.round(CW / 2 - it.W / 2), topMargin() + 6];
  }
  const ax = a[0] / S, ay = a[1] / S + it.offsetY;
  it.ax = ax; it.ay = ay;
  const drift = it.rise && it.typedAt >= 0 ? Math.min(16, (t - it.typedAt) * it.rise) : 0;
  const gap = it.kind === 'notice' ? 8 : it.style === 'think' ? 12 : 4;
  return [Math.round(ax - it.W / 2), Math.round(ay - it.H - gap - drift)];
}

function placeAll(t, dt) {
  const top = topMargin(), bot = CH - botMargin();
  const placed = [];
  const order = items.filter((it) => !it.gone).sort((a, b) => a.prio - b.prio || b.id - a.id);
  const hideWorld = panelUp();
  for (const it of order) {
    if (t < it.t0 && it.kind !== 'title') { it.vis = false; continue; }
    if (hideWorld && !it.cine && it.kind !== 'title' && it.kind !== 'toast') { it.vis = false; continue; }
    const nat = natural(it, t);
    if (!nat) { it.vis = false; continue; }
    let [x, y] = nat;
    x = Math.max(3, Math.min(CW - it.W - 3, x));
    const ny = Math.max(top, Math.min(bot - it.H, y));
    y = ny;
    if (it.kind !== 'title' && !it.fixed) {
      // stack above whatever is in the way (below it once there's no room above)
      let guard = 0, down = false, r;
      while ((r = placed.find((p) => hit(p, x, y, it.W, it.H))) && guard++ < 12) {
        const up = r.y - it.H - 2;
        if (!down && up >= top) y = up;
        else { down = true; y = r.y + r.h + 2; }
      }
    }
    const off = y - ny;
    if (!it.placed || it.kind === 'title') { it.off = off; it.placed = true; }
    else { it.off += (off - it.off) * Math.min(1, dt * 14); if (Math.abs(off - it.off) < 0.5) it.off = off; }
    it.px = x;
    it.py = Math.max(top, Math.min(bot - it.H, Math.round(ny + it.off)));
    it.vis = true;
    if (it.kind !== 'title' && it.outAt < 0) placed.push({ x: it.px, y: it.py, w: it.W, h: it.H });
  }
}

// ---------------------------------------------------------------- drawing
function motion(it, q, t) {
  const o = { dx: 0, dy: 0, hide: false, col: null };
  if (q.born < 0 || t < q.born) { o.hide = true; return o; }
  const age = t - q.born, i = q.i;
  if (it.outAt >= 0) {
    const tj = it.outAt + i * it.stag;
    if (t > tj + 0.1) { o.hide = true; return o; }
    if (t > tj) o.dy -= t > tj + 0.05 ? 2 : 1;
  }
  if (reduced) return o;
  const k = it.look.k;
  if (it.kind === 'title') {
    // big letters drop in from above and land with a little bounce
    o.dy += age < 0.04 ? -5 * k : age < 0.08 ? -2 * k : age < 0.13 ? k : 0;
    if (it.style === 'shout' && t - it.t0 < 1.2) { const f = Math.floor(t * 16); o.dx += hash(i, f) < 0.25 ? -1 : hash(i, f) > 0.75 ? 1 : 0; }
    if (it.style === 'gold') { const sh = ((t * 1.4) % 2.2) * (it.gl.length + 6) - 3; if (Math.abs(i - sh) < 1) o.col = '#fffbe0'; }
    if (it.style === 'happy') o.dy -= Math.sin(t * 5 - i * 0.5) > 0.6 ? 1 : 0;
    if (it.style === 'spooky') { o.dy += Math.round(Math.sin(t * 1.6 + i * 0.9) * 1.4); if (hash(i, Math.floor(t * 9)) < 0.04) o.hide = true; }
    return o;
  }
  const f = Math.floor(t * 18);
  switch (it.style) {
    case 'shout': {
      o.dy += age < 0.035 ? -3 * k : age < 0.07 ? -k : age < 0.11 ? k : 0;
      const loud = t - it.t0 < 0.9 || it.typedAt < 0 || (t * 0.8) % 1 < 0.1;
      if (loud) { o.dx += hash(i, f) < 0.33 ? -1 : hash(i, f) > 0.66 ? 1 : 0; o.dy += hash(i + 99, f) < 0.3 ? -1 : hash(i + 99, f) > 0.7 ? 1 : 0; }
      break;
    }
    case 'angry': {
      o.dy += age < 0.04 ? -2 : age < 0.09 ? 1 : 0;
      const ff = Math.floor(t * 14);
      if (hash(i * 7, ff) < 0.4) o.dx += hash(i, ff) < 0.5 ? -1 : 1;
      if (age < 0.08) o.col = '#ffffff';
      break;
    }
    case 'excited':
      o.dy -= Math.round(Math.abs(Math.sin(t * 7 - i * 0.6)) * 2);
      if (age < 0.06) o.dy -= 2;
      break;
    case 'whisper':
      o.dy += Math.round(Math.sin(t * 2.4 + i * 0.55) * 1.1);
      if (age < 0.12) o.col = '#4a5060';
      break;
    case 'scared': {
      const ff = Math.floor(t * 22);
      o.dx += hash(i * 3, ff) < 0.3 ? -1 : hash(i * 3, ff) > 0.7 ? 1 : 0;
      o.dy += hash(i * 5 + 1, ff) < 0.25 ? -1 : hash(i * 5 + 1, ff) > 0.8 ? 1 : 0;
      o.dy += age < 0.05 ? 1 : 0;
      break;
    }
    case 'happy':
      o.dy -= Math.sin(t * 5.5 - i * 0.45) > 0.55 ? 1 : 0;
      if (age < 0.06) o.dy -= 2; else if (age < 0.11) o.dy -= 1;
      break;
    case 'laugh':
      o.dy -= Math.round(Math.abs(Math.sin(t * 9 - i * 0.7)) * 3);
      if (age < 0.08) o.dy -= 2;
      break;
    case 'sad':
      o.dy += age < 0.5 ? -1 : age < 1.1 ? 0 : 1;
      break;
    case 'think':
      o.dy += Math.sin(t * 2 + i * 0.3) > 0.75 ? -1 : 0;
      o.dy += age < 0.1 ? 1 : 0;
      break;
    case 'radio': {
      const ff = Math.floor(t * 20);
      if (hash(i, ff) < 0.05) o.hide = true;
      else if (hash(i + 31, ff) < 0.06) o.dx += hash(i, ff + 1) < 0.5 ? -1 : 1;
      if (age < 0.06) o.col = '#ffffff';
      break;
    }
    case 'spooky':
      o.dy += Math.round(Math.sin(t * 1.6 + i * 0.9) * 1.4);
      o.dx += Math.round(Math.sin(t * 1.1 + i * 1.7) * 0.8);
      if (hash(i, Math.floor(t * 9)) < 0.05) o.hide = true;
      if (age < 0.3) o.col = '#ffffff';
      break;
    case 'gold': {
      o.dy += age < 0.04 ? -2 : age < 0.09 ? -1 : 0;
      const sh = ((t * 1.6) % 2) * (it.gl.length + 6) - 3;
      if (Math.abs(i - sh) < 1) o.col = '#fffbe0';
      break;
    }
    default: // say, notice, caption, toast
      o.dy += age < 0.04 ? 2 : age < 0.08 ? 1 : age < 0.13 ? -1 : 0;
  }
  return o;
}
function drift(it, t) {
  if (reduced) return [0, 0];
  if (it.style === 'think' || it.style === 'spooky') return [Math.round(Math.sin(t * 0.8 + it.id) * 1), Math.round(Math.sin(t * 1.5 + it.id) * 1.5)];
  if (it.style === 'sad') return [0, Math.sin(t * 1.1 + it.id) > 0.3 ? 1 : 0];
  if (it.style === 'radio') { const p = Math.floor(t * 0.7 + it.id); if ((t * 0.7 + it.id) % 1 < 0.06 && hash(p, it.id) < 0.6) return [hash(p, 3) < 0.5 ? -2 : 2, 0]; }
  return [0, 0];
}
function colOf(it, q) {
  const L = it.look;
  return q.mark === 1 ? L.em : q.mark === 2 ? L.kw : q.mark === 3 ? L.aside : L.fill;
}

function drawGlyphs(it, gl, bx, by, L, rowOff, t, pass, colFn, anim = true) {
  const k = L.k;
  for (const q of gl) {
    if (q.t === 'sp') continue;
    const m = anim ? motion(it, q, t) : { dx: 0, dy: 0, hide: q.born < 0 || t < q.born || (it.outAt >= 0 && t > it.outAt + 0.06), col: null };
    if (m.hide) continue;
    const gx = bx + rowOff(q.row) + q.x + m.dx, gy = by + q.row * it.lh + m.dy;
    if (q.t === 'icon') {
      if (pass === 0) continue;
      const sp = iconSpr(q.ch);
      const cap = FM[L.font][0] * k;
      g.drawImage(sp.c, gx, gy + Math.round(cap / 2 - (sp.h * k) / 2), sp.w * k, sp.h * k);
      continue;
    }
    if (pass === 0) {
      const s = silSpr(L.font, q.ch, L.out);
      g.drawImage(s.c, gx - k, gy - 3 * k, s.w * k, s.h * k);
      if (L.depth) for (let d = 1; d <= L.depth; d++) g.drawImage(s.c, gx - k, gy - 3 * k + d, s.w * k, s.h * k);
    } else {
      const c = m.col ?? colFn(q);
      const s = fillSpr(L.font, q.ch, c);
      g.drawImage(s.c, gx - k, gy - 3 * k, s.w * k, s.h * k);
      if (L.fill2 && !m.col && c === L.fill) {
        const s2 = fillSpr(L.font, q.ch, L.fill2);
        const split = 3 + Math.ceil(FM[L.font][0] / 2);
        g.drawImage(s2.c, 0, split, s2.w, s2.h - split, gx - k, gy - 3 * k + split * k, s2.w * k, (s2.h - split) * k);
      }
    }
  }
}

function burst(x, y, dir, k) {
  const px = [];
  for (let i = 0; i < 3 + k; i++) px.push([x + dir * i, y]);
  for (let i = 1; i < 3 + k; i++) px.push([x + dir * (i - 1), y - i]);
  for (let i = 2; i < 4 + k; i++) px.push([x, y - i - 1]);
  g.fillStyle = OUT;
  for (const [a, b] of px) g.fillRect(a - 1, b - 1, 3, 3);
  g.fillStyle = '#ffe066';
  for (const [a, b] of px) g.fillRect(a, b, 1, 1);
}
// four-point twinkles around gold text
function twinkle(x, y, ph) {
  const s = ph < 0.33 ? 1 : ph < 0.66 ? 2 : 1;
  g.fillStyle = OUT;
  g.fillRect(x - s - 1, y - 1, s * 2 + 3, 3); g.fillRect(x - 1, y - s - 1, 3, s * 2 + 3);
  g.fillStyle = '#fffbe0';
  g.fillRect(x - s, y, s * 2 + 1, 1); g.fillRect(x, y - s, 1, s * 2 + 1);
}

function drawItem(it, t) {
  if (!it.vis || t < it.t0) return;
  const L = it.look;
  const [ddx, ddy] = drift(it, t);
  const bx = it.px + ddx, by = it.py + ddy;
  const inner = it.W - it.lead;
  const rowOff = (row) => it.lead + (it.align === 'center' ? Math.floor((inner - it.rowW[row]) / 2) : 0);
  const ty = by + it.nameH + 1;
  if (it.name) {
    const nx = Math.min(bx + it.W - it.nameW, bx + rowOff(0));
    const NL = { ...L, font: 'tiny', k: 1, track: 1 };
    for (const q of it.name) if (q.born < 0) q.born = it.t0;
    for (const pass of [0, 1]) drawGlyphs(it, it.name, nx, by + 1, NL, () => 0, t, pass, () => it.nameCol, false);
  }
  const gone = it.outAt >= 0 && t > it.outAt + 0.05;
  if (it.style === 'radio' && !gone) {
    const on = Math.floor(t * 2.5) % 2 === 0;
    const r = rowsSpr('phone' + (on ? 1 : 0), PHONE, { k: OUT, g: '#2f7a5e', d: on ? '#9dffd8' : '#173c2e', L: '#173c2e' });
    const rx = bx + rowOff(0) - 12;
    g.drawImage(r.c, rx, ty - 3);
    if (!reduced) for (let s = 0; s < 3; s++) {
      const h1 = hash(it.id + s * 13, Math.floor(t * 14));
      if (h1 < 0.45) { g.fillStyle = h1 < 0.2 ? '#ffffff' : '#9dffd8'; g.fillRect(rx + 2 + Math.floor(hash(s, Math.floor(t * 14)) * 6) - 2, ty - 5 - Math.floor(h1 * 8), 1, 1); }
    }
  }
  // the typing dots while a line is about to start
  if (!it.isTyped && it.shown < 1 && it.pre > 0 && it.kind === 'line') {
    const d = rowsSpr('tdot', DOT(1), { c: '#fff6e4', k: OUT });
    const cx = bx + Math.floor(it.W / 2) - 10;
    for (let n = 0; n < 3; n++) g.drawImage(d.c, cx + n * 7, ty + 1 - (reduced ? 0 : Math.max(0, Math.round(Math.sin(t * 9 - n * 0.9) * 2))));
  }
  const colFn = (q) => colOf(it, q);
  drawGlyphs(it, it.gl, bx, ty, L, rowOff, t, 0, colFn);
  drawGlyphs(it, it.gl, bx, ty, L, rowOff, t, 1, colFn);
  if ((it.style === 'shout' || it.style === 'angry') && it.outAt < 0 && !reduced) {
    const since = t - it.t0;
    if (since < 0.7 || (t * 0.8) % 1 < 0.1) {
      const k = L.k;
      burst(bx - 3 - k, ty - 1, -1, k);
      burst(bx + it.W + 2 + k, ty - 1, 1, k);
    }
  }
  if (it.style === 'gold' && it.outAt < 0 && !reduced) {
    for (let s = 0; s < 3; s++) {
      const ph = (t * 1.3 + s * 0.37) % 1;
      const hx = hash(it.id * 3 + s, Math.floor(t * 1.3 + s * 0.37));
      twinkle(Math.round(bx + hx * it.W), Math.round(ty - 3 + hash(s, Math.floor(t * 1.3 + s * 0.37)) * (it.H - it.nameH)), ph);
    }
  }
  if (it.style === 'think' && it.anchor && it.outAt < 0) {
    const fx = it.ax, fy = it.ay - 1;
    const tx = bx + Math.floor(it.W / 2), tyy = by + it.H + 1;
    for (let d = 0; d < 3; d++) {
      const kk = 0.25 + d * 0.27;
      const sp = rowsSpr('dot' + d, DOT(d === 0 ? 0 : d === 1 ? 1 : 1.5), { c: '#e4dcff', k: OUT });
      const bob = reduced ? 0 : Math.round(Math.sin(t * 3 - d * 0.9) * 1);
      if (t - it.t0 < d * 0.12) continue;
      g.drawImage(sp.c, Math.round(fx + (tx - fx) * kk - sp.w / 2), Math.round(fy + (tyy - fy) * kk - sp.h / 2) + bob);
    }
  }
  if (it.waiting && it.isTyped && it.outAt < 0) {
    const last = it.gl[it.gl.length - 1];
    const row = last ? last.row : 0;
    const ar = rowsSpr('more', MORE, { k: OUT, c: '#ffe066' });
    const bob = Math.floor(t * 3) % 2;
    g.drawImage(ar.c, bx + rowOff(row) + it.rowW[row] + 3, ty + row * it.lh + FM[L.font][0] * L.k - 4 + bob);
  }
}

// ---------------------------------------------------------------- public API
/** a floating line (dialogue by a speaker, a bark, a notice) */
const DUMMY = { id: 0, width: 0, height: 0, typed: Promise.resolve(), done: Promise.resolve(), isTyped: () => true, skip() {}, wait() {}, dismiss() {}, alive: () => false };
export function floatText(o = {}) {
  if (game?.titleMode && !o.force) return DUMMY; // never over the title diorama
  if (layer()) fitLayer();
  const style = o.style || 'say';
  const kind = o.kind || (o.hold ? 'line' : 'bark');
  const it = make({
    kind, style, text: o.text, anchor: toAnchor(o.at, o.lift || 0), name: o.name, color: o.color, voice: o.voice, vol: o.vol,
    speed: o.speed, k: o.k, hold: !!o.hold, ttl: o.ms != null ? o.ms / 1000 : undefined, pre: o.pre, delay: o.delay,
    prio: o.prio, cine: o.cine, rise: o.rise ?? (kind === 'notice' ? 6 : 0), offsetY: o.offsetY, maxW: o.maxW, look: o.look,
    fixed: o.fixed,
  });
  add(it);
  if ((style === 'shout' || style === 'angry') && !reduced && game?.rig && o.kick !== false) game.rig.shake = Math.max(game.rig.shake || 0, style === 'shout' ? 0.18 : 0.12);
  return handle(it);
}

/**
 * a big title card: an optional small kicker above, the title in chunky letters that drop in with a
 * bounce and an extruded shadow, an optional marker-hand line below. Shares one exit.
 *   y: 0..1 of the screen height for the title's top (default 0.2)
 */
export function floatTitle(o = {}) {
  if (game?.titleMode && !o.force) return { done: Promise.resolve(), typed: Promise.resolve(), dismiss() {}, skip() {}, alive: () => false };
  if (!layer()) return { done: Promise.resolve(), typed: Promise.resolve(), dismiss() {}, skip() {}, alive: () => false };
  fitLayer();
  const style = o.style || 'shout';
  // big for a word, smaller as the title grows (two chunky rows read as one dark slab)
  const len = String(o.title || '').length;
  const k = o.k || Math.max(2, (len <= 9 ? 4 : len <= 15 ? 3 : 2) - (CW < 300 ? 1 : 0));
  const yk = o.y ?? 0.2;
  const ttl = o.ms != null ? o.ms / 1000 : 2.6;
  const group = nextId + 1000;
  const parts = [];
  const fill = o.color || (style === 'gold' ? '#ffd84a' : style === 'spooky' ? '#c8ffe8' : '#fff6e4');
  const look = { font: 'bold', k, fill, fill2: o.color2 || mixHex(fill, style === 'gold' ? '#c87a1a' : '#e0a050', 0.45), out: OUT, depth: o.depth ?? Math.max(2, k - 1), speed: o.speed || 26, track: 1, maxW: 9999 };
  let kick = null, sub = null;
  const tIt = make({ kind: 'title', style, text: String(o.title || '').toUpperCase(), hold: !!o.hold, ttl, look, k, group, delay: o.kicker ? 0.25 : 0, prio: 0, fixed: () => [Math.round(CW / 2 - tIt.W / 2), Math.round(CH * yk) + (kick ? kick.H + 3 : 0)] });
  if (o.kicker) {
    kick = make({ kind: 'title', style: 'say', text: String(o.kicker).toUpperCase(), hold: !!o.hold, ttl: ttl + 0.4, k: 2, look: { font: 'tiny', k: 2, fill: o.kickerColor || '#ffe066', speed: 40, track: 1, maxW: 9999 }, group, prio: 0, fixed: () => [Math.round(CW / 2 - kick.W / 2), Math.round(CH * yk)] });
    parts.push(kick);
  }
  parts.push(tIt);
  if (o.sub) {
    sub = make({ kind: 'title', style: 'say', text: o.sub, hold: !!o.hold, ttl: ttl - 0.2, k: 1, look: { font: 'script', k: 1, fill: o.subColor || '#f6ecd4', speed: 40, maxW: 9999 }, delay: 0.5 + String(o.title || '').length / 26, group, prio: 0, fixed: () => [Math.round(CW / 2 - sub.W / 2), Math.round(CH * yk) + (kick ? kick.H + 3 : 0) + tIt.H + 3] });
    parts.push(sub);
  }
  for (const p of parts) add(p);
  if (!reduced && game?.rig && style === 'shout') setTimeout(() => { game.rig.shake = Math.max(game.rig.shake || 0, 0.25); }, (o.kicker ? 250 : 0) + 60);
  const all = Promise.all(parts.map((p) => p.done)).then(() => {});
  return {
    typed: Promise.all(parts.map((p) => p.typed)).then(() => {}),
    done: all,
    dismiss: () => parts.forEach((p) => leave(p)),
    skip: () => parts.forEach(skipItem),
    alive: () => parts.some((p) => !p.gone && p.outAt < 0),
  };
}

/** narration at the bottom of the screen in the marker hand */
export function floatCaption(text, o = {}) {
  if (!layer()) return handle(make({ kind: 'caption', text: '' }));
  fitLayer();
  const it = make({ kind: 'caption', style: o.style || 'caption', text, hold: !!o.hold, ttl: o.ms != null ? o.ms / 1000 : 3, look: { ...(o.k ? { k: o.k } : {}) }, prio: 1, cine: true,
    fixed: () => [Math.round(CW / 2 - it.W / 2), CH - botMargin() - it.H - (barsOn() ? -Math.ceil(CH * 0.11) + Math.ceil((CH * 0.11 - it.H) / 2) + 3 : 6)] });
  add(it);
  return handle(it);
}

/** a stamp-like line pinned to a screen spot (quest toasts): fixed: () => [artX, artY] */
export function floatAt(o = {}) {
  if (layer()) fitLayer();
  const it = make({ kind: 'toast', style: o.style || 'say', text: o.text, hold: !!o.hold, ttl: o.ms != null ? o.ms / 1000 : 3, k: o.k, look: o.look, prio: o.prio ?? 2, delay: o.delay, name: o.name, color: o.color, fixed: o.fixed });
  add(it);
  return handle(it);
}

export function clearFloats(pred) {
  for (const it of items) if (!pred || pred(it)) leave(it, true);
}
export function skipAllFloats() { for (const it of items) skipItem(it); }
/** art-pixel size of the layer (for callers placing fixed text) */
export function floatSize() { if (layer()) fitLayer(); return { W: CW, H: CH, S }; }
export function floatMeasure(text, { font = 'body', k = 1 } = {}) { return pxMeasure(String(text), font) * k; }

// debug: window.__float.floatText({ text: 'HEY!', style: 'shout', at: [640, 300] })
try { window.__float = { floatText, floatTitle, floatCaption, floatAt, clearFloats }; } catch { /* */ }
