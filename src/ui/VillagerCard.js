// VillagerCard: the dialogue + shop card for the pond's villagers. A paper
// sheet in the house style (tape, stamps, pixel fonts) with a polaroid of the
// villager, a typewriter speech bubble, an offers list, an optional gift box
// and a friendship row.
//
//   const card = openVillager(root, { npc, name, title, lines, offers, gift, hearts, sfx, icon, onClose })
//     npc     'dale' | 'granny' | 'hoot' | 'rocco' | 'shellby' | 'clover' | 'otis' | 'hazel' | 'chip' | 'pip'
//     lines   ['Hello there!', 'Want some *tea*? {coin}']   ("*x*" emphasis, "{sprite}" inline icon)
//     offers  [{ icon, title, desc, tag, locked, onClick }]  (locked = reason string -> greyed, not clickable)
//     gift    { ready, label, onClaim }                      (wiggles when ready, confetti on open)
//     hearts  0..5 (halves ok)
//     sfx(name, opts)  icon(name, scale) -> '<img>' HTML   onClose() once, whenever it goes away
//   card.close()             animate away (calls onClose)
//   card.setLines(lines)     replace the dialogue, typing restarts from the first line
//   card.update({ offers, gift, hearts, lines, topics, choices })   refresh parts in place
//   card.el                  the overlay element
//   [v19 npc] conversation:
//     topics  [{ id, label, isNew, done, on }] tabs under the bubble; onTopic(id, card) when one is tapped
//     card.setChoices([{ label, hint, onPick(choice, card) }])   2-3 answer buttons (keys 1-3)
//     card.reward('+1 friendship')   little green tag under the hearts
//     card.portrait            the live 3D portrait (NpcTalk3D: talk / play / mood / hop) or null
//   The polaroid is the neighbour's real 3D rig (NpcTalk3D), talking while a line types.
//
//   villagerPortrait(npc, { scale = 3 }) -> HTMLCanvasElement
//     a still 3D render (36 x 36 px, scaled by an integer) for icons / the encyclopedia.
//
// Overlay: position absolute, inset 0, z-index 58 inside `root` (give root a size,
// e.g. the fixed #ui layer). All art is procedural.
import './fonts.css';
import './villager.css';
import { paperTexture, tape, injectPaperCSS, PX } from './paper.js';
import { createNpcTalk, npcSnapshot } from './NpcTalk3D.js'; // [v19 npc]

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ===========================================================================
// tiny pixel-art kit (art px buffer -> canvas)
// ===========================================================================
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function rgba(h) {
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
}
const toHex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const A = rgba(a), B = rgba(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

// sphere-ish shading for an ellipse (light from the top-left); ramp dark -> light
function sph(ramp, x, y, nx, ny, bias = 0) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  let l = -0.42 * nx - 0.6 * ny + 0.68 * nz + bias + (bay(x, y) - 0.5) * 0.16;
  const th = ramp.length >= 5 ? [0.06, 0.36, 0.7, 0.92] : ramp.length === 4 ? [0.12, 0.48, 0.86] : ramp.length === 3 ? [0.25, 0.8] : [0.5];
  let i = 0;
  while (i < th.length && i < ramp.length - 1 && l > th[i]) i++;
  return ramp[i];
}

class Art {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); this.post = []; }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.p[y * this.w + x] = c;
    return this;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.p[y * this.w + x]; }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j, i, j) : c);
    return this;
  }
  // filled ellipse; c = colour | ramp (shaded) | fn(x, y, nx, ny, d)
  ell(cx, cy, rx, ry, c, o = {}) {
    const R = Math.max(rx, ry) + 1, cs = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      let dx = x - cx, dy = y - cy;
      if (o.rot) { const t = dx * cs + dy * sn; dy = -dx * sn + dy * cs; dx = t; }
      const nx = dx / rx, ny = dy / ry, d = nx * nx + ny * ny;
      if (d > 1.06) continue;
      if (o.clip && !o.clip(x, y)) continue;
      const col = typeof c === 'function' ? c(x, y, nx, ny, d) : Array.isArray(c) ? sph(c, x, y, Math.min(1, nx), Math.min(1, ny), o.bias || 0) : c;
      if (col !== undefined) this.set(x, y, col);
    }
    return this;
  }
  // stamp rows of characters through a palette ('.' / ' ' = skip, pal value null = erase)
  rows(x0, y0, rows, pal) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.' || ch === ' ' || !(ch in pal)) continue; this.set(x0 + i, y0 + j, pal[ch]); } });
    return this;
  }
  // same rows, also mirrored around the vertical axis (x -> w-1-x)
  rowsM(x0, y0, rows, pal, flip = null) {
    this.rows(x0, y0, rows, pal);
    const W = Math.max(...rows.map((r) => r.length));
    const m = rows.map((r) => r.padEnd(W, '.').split('').reverse().join(''));
    this.rows(this.w - x0 - W, y0, m, flip || pal);
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, typeof c === 'function' ? c(x0, y0) : c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  // recolour existing pixels inside a rect through fn(col, x, y)
  tint(x, y, w, h, fn) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = this.get(x + i, y + j); if (c) { const n = fn(c, x + i, y + j); if (n !== undefined) this.set(x + i, y + j, n); } }
    return this;
  }
  // 1 art px outline around the silhouette, darkened from the neighbouring colour
  outline(ink = '#1c0f0a', amt = 0.74, skipBottom = false) {
    const out = this.p.slice(), W = this.w, H = this.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.p[y * W + x]) continue;
      let n = null;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const c = this.get(x + dx, y + dy);
        if (c && rgba(c)[3] > 160) { n = c; break; }
      }
      if (n && !(skipBottom && y === H - 1)) out[y * W + x] = mixHex(n, ink, amt);
    }
    this.p = out;
    return this;
  }
  canvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const x = c.getContext('2d');
    for (let y = 0; y < this.h; y++) for (let i = 0; i < this.w; i++) {
      const col = this.p[y * this.w + i];
      if (!col) continue;
      const v = rgba(col);
      x.fillStyle = `rgba(${v[0]},${v[1]},${v[2]},${(v[3] / 255).toFixed(3)})`;
      x.fillRect(i * scale, y * scale, scale, scale);
    }
    return c;
  }
}

export const VILLAGERS = {
  dale: { name: 'Dale', title: 'Daisy Beer guy', bg: ['#9fd0e8', '#c4e6f4'], pitch: 0.92, shop: 'Stuff in the cooler', gift: ['#f2c83c', '#3e9e52'] },
  granny: { name: 'Granny Ribbit', title: 'Swamp herbalist', bg: ['#8fb87a', '#b8d8a0'], pitch: 1.25, shop: "Granny's remedies", gift: ['#a092e0', '#f08aa8'] },
  hoot: { name: 'Professor Hoot', title: 'Park ranger', bg: ['#d8b878', '#ecd8a8'], pitch: 0.8, shop: 'Ranger services', gift: ['#869034', '#ffd23f'] },
  rocco: { name: 'Rocco', title: 'Totally legit merchant', bg: ['#4a4068', '#6a5a8a'], pitch: 1.08, shop: 'Totally legit goods', gift: ['#2e2a36', '#ffd23f'] },
  shellby: { name: 'Grandpa Shellby', title: 'Oldest pond resident', bg: ['#7cc2ee', '#b0e0f8'], pitch: 0.7, shop: 'Old treasures', gift: ['#3c88d8', '#d9453b'] },
  clover: { name: 'Clover', title: 'Gardener next door', bg: ['#a8d88a', '#d4f0b8'], pitch: 1.3, shop: 'From the garden', gift: ['#f08a1a', '#6cc04a'] },
  otis: { name: 'Otis', title: 'Fisherman', bg: ['#7cbce0', '#b8e0f4'], pitch: 1.0, shop: 'Off the dock', gift: ['#3c88d8', '#ffd23f'] },
  hazel: { name: 'Hazel', title: 'Baker', bg: ['#f0c8a0', '#fbe6cc'], pitch: 1.2, shop: 'Fresh from the oven', gift: ['#e04a64', '#fff3d8'] },
  chip: { name: 'Chip', title: 'Carpenter', bg: ['#d8b07a', '#f0d8a8'], pitch: 1.35, shop: 'The workshop', gift: ['#c8402a', '#d8b07a'] },
  pip: { name: 'Pip', title: 'Lumber trader', bg: ['#e8b878', '#f8e0b0'], pitch: 1.4, shop: 'Lumber counter', gift: ['#c8402a', '#3a2a1a'] },
  flint: { name: 'Flint', title: 'Prospector', bg: ['#a8a0b0', '#d8d0c8'], pitch: 0.75, shop: 'The quarry', gift: ['#e0a838', '#4866a2'] }, // [F&S mining]
};
export const VILLAGER_IDS = Object.keys(VILLAGERS);

// [v19 npc] portraits are the neighbours' real 3D rigs (NpcTalk3D); the old 2D bust art is gone.
// villagerPortrait() is kept for callers that want a still: one outlined 3D render, ~12 px per `scale`.
export function villagerPortrait(npc, { scale = 3 } = {}) {
  const s = Math.max(1, Math.round(scale));
  const src = npcSnapshot(npc, { w: 36, h: 36 });
  const c = document.createElement('canvas');
  c.width = 36 * s; c.height = 36 * s;
  if (src) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); }
  c.style.imageRendering = 'pixelated';
  return c;
}

// ===========================================================================
// small UI art: hearts, gift box, speech pill, tail, close X
// ===========================================================================
const uiCache = new Map();
const cachedURL = (key, make) => {
  let u = uiCache.get(key);
  if (!u) { u = make(); uiCache.set(key, u); }
  return u;
};
const HEART = ['.rr...rr.', 'rRRr.rrrr', 'rRrrrrrrr', 'rrrrrrrrd', '.rrrrrrd.', '..rrrrd..', '...rrd...', '....r....'];
function heartURL(kind) {
  return cachedURL('heart' + kind, () => {
    const g = new Art(11, 10);
    const full = { r: '#e04a64', R: '#ffb6be', d: '#a8283e' };
    const empty = { r: '#e6d4b0', R: '#f4e8cc', d: '#d4c098' };
    g.rows(1, 1, HEART, kind === 'full' ? full : empty);
    if (kind === 'half') g.rows(1, 1, HEART.map((r) => r.slice(0, 5)), full);
    g.outline('#2a1a14', kind === 'empty' ? 0.55 : 0.7);
    return g.canvas(1).toDataURL();
  });
}
// the B&W pill used by the in-game bubbles (border-image 9-slice, slices 3/3/4)
const PILL = ['..kkk..', '.kwwwk.', 'kwwwwwk', 'kwwwwwk', 'kwwwwwk', '.kwwwk.', '.gkkkg.', '..ggg..'];
const pillURL = () => cachedURL('pill', () => { const g = new Art(7, 8); g.rows(0, 0, PILL, { k: '#161114', w: '#ffffff', g: '#161114a8' }); return g.canvas(1).toDataURL(); });
const tailURL = () => cachedURL('tail', () => {
  const g = new Art(8, 7);
  g.rows(0, 0, ['k.......', 'kk......', 'kwk.....', 'kwwk....', 'kwwwk...', 'kwwwwk..', 'kwwwwwk.'], { k: '#161114', w: '#ffffff' });
  return g.canvas(1).toDataURL();
});
const moreURL = () => cachedURL('more', () => { const g = new Art(9, 6); g.rows(0, 0, ['wwwwwwwww', 'wkkkkkkkw', 'wwkkkkkww', '.wwkkkww.', '..wwkww..', '...www...'], { k: '#161114', w: '#ffffff' }); return g.canvas(1).toDataURL(); });
function pxSVG(rows, col = 'currentColor', s = 3) {
  let d = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg width="${rows[0].length * s}" height="${rows.length * s}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true"><path fill="${col}" d="${d}"/></svg>`;
}
const STAR_SVG = pxSVG(['...#...', '...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'], 'currentColor', 2);
const X_ROWS = ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'];
const LOCK_ROWS = ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'];

// gift: body + lid as separate art so the lid can fly off
function giftArt(cols, open) {
  const [A, R] = cols;
  const Ar = [mixHex(A, '#1a0e0a', 0.42), mixHex(A, '#1a0e0a', 0.2), A, mixHex(A, '#ffffff', 0.3)];
  const Rr = [mixHex(R, '#1a0e0a', 0.35), R, mixHex(R, '#ffffff', 0.4)];
  const body = new Art(26, 18);
  body.rect(2, 2, 22, 15, (x, y) => {
    let c = x < 4 ? Ar[3] : x > 21 ? Ar[0] : y > 14 ? Ar[1] : Ar[2];
    if ((x + (y % 6 < 3 ? 0 : 3)) % 6 === 0 && y % 3 === 1 && x > 3 && x < 22) c = Ar[3];
    if (x >= 11 && x <= 14) c = x === 11 ? Rr[2] : x === 14 ? Rr[0] : Rr[1];
    return c;
  });
  if (open) {
    body.rect(3, 2, 20, 2, (x, y) => (y === 2 ? '#2a1610' : '#4a2a18'));
    body.rect(11, 2, 4, 1, Rr[0]);
  }
  body.outline('#1c0f0a', 0.7);
  const lid = new Art(28, 14);
  lid.rect(1, 7, 26, 5, (x, y) => {
    let c = y === 7 ? Ar[3] : y === 11 ? Ar[0] : Ar[2];
    if (x >= 12 && x <= 15) c = x === 12 ? Rr[2] : x === 15 ? Rr[0] : Rr[1];
    return c;
  });
  // bow
  lid.ell(9.5, 4.5, 4, 2.6, Rr, { rot: -0.35 });
  lid.ell(18.5, 4.5, 4, 2.6, Rr, { rot: 0.35 });
  lid.ell(9.8, 4.6, 1.6, 0.8, Rr[0], { rot: -0.35 });
  lid.ell(18.2, 4.6, 1.6, 0.8, Rr[0], { rot: 0.35 });
  lid.rows(12, 4, ['.RR.', 'RrrR', '.rr.'], { R: Rr[2], r: Rr[1] });
  lid.outline('#1c0f0a', 0.7);
  return { body: body.canvas(1).toDataURL(), lid: lid.canvas(1).toDataURL(), bw: 26, bh: 18, lw: 28, lh: 14 };
}

// ===========================================================================
// text: "*em*" and "{sprite}" tokens -> per-character spans
// ===========================================================================
const PAUSE = { '.': 0.2, '!': 0.18, '?': 0.2, ',': 0.1, '…': 0.26, ':': 0.1, ';': 0.1 };
function buildText(el, text, icon) {
  el.innerHTML = '';
  const chars = [];
  let em = false;
  String(text ?? '').split('\n').forEach((line, li) => {
    if (li) el.appendChild(document.createElement('br'));
    for (const w of line.split(/( +)/)) {
      if (!w) continue;
      if (/^ +$/.test(w)) { el.appendChild(document.createTextNode(' ')); chars.push({ el: null, ch: ' ' }); continue; }
      const we = document.createElement('span');
      we.className = 'vc-w';
      const re = /\{([a-z0-9_]+)\}|\*|./gi;
      let m;
      while ((m = re.exec(w))) {
        if (m[0] === '*') { em = !em; continue; }
        const c = document.createElement('span');
        c.className = 'vc-ch' + (em ? ' vc-em' : '');
        if (m[1]) {
          let h = '';
          try { h = icon ? String(icon(m[1], 2) || '') : ''; } catch { h = ''; }
          c.classList.add('vc-ico');
          c.innerHTML = h || esc(m[1]);
          chars.push({ el: c, ch: '' });
        } else {
          c.textContent = m[0];
          chars.push({ el: c, ch: m[0] });
        }
        we.appendChild(c);
      }
      el.appendChild(we);
    }
  });
  return chars;
}

// ===========================================================================
// the card
// ===========================================================================
const stack = [];
let keyBound = false;
function onKey(e) {
  const top = stack[stack.length - 1];
  if (!top) return;
  top.key(e);
}

export function openVillager(root, o = {}) {
  injectPaperCSS();
  const npc = VILLAGERS[o.npc] ? o.npc : 'dale';
  const V = VILLAGERS[npc];
  const icon = (n, s = 2) => { try { return typeof o.icon === 'function' ? String(o.icon(n, s) || '') : ''; } catch { return ''; } };
  const sfx = (n, x) => { try { if (typeof o.sfx === 'function') o.sfx(n, x); } catch { /* audio optional */ } };
  const R = Math.random;
  const rot = 0; // [v19 npc] the sheet rests square: a rotated sheet resamples the text + portrait (blurry)
  root = root || document.body;

  const ov = document.createElement('div');
  ov.className = `vc-ov vc-npc-${npc}`;
  ov.innerHTML = `
    <div class="vc-dim"></div>
    <div class="vc-stage">
      <div class="vc-sheet" role="dialog" aria-modal="true" aria-label="${esc(o.name || V.name)}" style="--rot:${rot.toFixed(2)}deg">
        ${tape(['mint', 'pink', 'yellow', 'blue'][(R() * 4) | 0], (R() * 2 - 1) * 5, { cls: 'vc-tape' })}
        <button type="button" class="vc-x" aria-label="Close">${pxSVG(X_ROWS)}</button>
        <div class="vc-head">
          <div class="vc-photo" style="--pb1:${V.bg[0]};--pb2:${V.bg[1]}">
            <div class="vc-por"></div>
            ${tape('plain', -38, { cls: 'vc-ptape', w: 16 })}
          </div>
          <div class="vc-id">
            <h2 class="vc-name"></h2>
            <div class="vc-title"></div>
            <div class="vc-hearts"></div>
          </div>
        </div>
        <div class="vc-talk" tabindex="0" role="button" aria-label="Next">
          <i class="vc-tail"></i>
          <div class="vc-text" aria-live="polite"></div>
          <i class="vc-more"></i>
        </div>
        <div class="vc-chs" hidden></div>
        <div class="vc-tops" hidden></div>
        <div class="vc-body">
          <div class="vc-offs"></div>
          <div class="vc-giftw"></div>
        </div>
        <div class="vc-fx"></div>
      </div>
    </div>`;
  const $ = (s) => ov.querySelector(s);
  const sheet = $('.vc-sheet'), stage = $('.vc-stage'), dim = $('.vc-dim');
  const por = $('.vc-por'), talk = $('.vc-text'), talkBox = $('.vc-talk'), offs = $('.vc-offs'), giftw = $('.vc-giftw'), fx = $('.vc-fx');
  talkBox.style.setProperty('--pill', `url(${pillURL()})`);
  $('.vc-tail').style.backgroundImage = `url(${tailURL()})`;
  $('.vc-more').style.backgroundImage = `url(${moreURL()})`;
  $('.vc-name').textContent = o.name || V.name;
  $('.vc-title').textContent = o.title || V.title;

  const st = {
    lines: [], li: 0, chars: [], shown: 0, revealed: 0, typed: true, prevCh: ' ',
    frame: -1, mouthT: 0, mouth: false, blinkT: 0, nextBlink: 1.5 + R() * 2, talking: false,
    closed: false, raf: 0, last: 0, gift: null, giftOpened: false, offers: [],
  };
  // [v19 npc] live 3D portrait of the neighbour's own rig
  let p3 = null;
  try { p3 = createNpcTalk(por, { npc, frame: 'bust' }); } catch (e) { console.warn('villager portrait', e); }
  if (!p3) { por.classList.add('vc-flat'); por.textContent = (o.name || V.name).slice(0, 1); }

  // ---------------------------------------------------------------- hearts
  const setHearts = (h) => {
    const el = $('.vc-hearts');
    if (h == null) { el.hidden = true; return; }
    el.hidden = false;
    const v = clamp(Math.round((+h || 0) * 2) / 2, 0, 5);
    el.setAttribute('aria-label', `Friendship ${v} of 5`);
    el.title = `Friendship ${v}/5`;
    const prev = el._v;
    el.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const k = v >= i + 1 ? 'full' : v >= i + 0.5 ? 'half' : 'empty';
      const pop = prev != null && v > prev && i + 1 > prev && i < v ? ' vc-hpop' : '';
      return `<img class="vc-heart${pop}" src="${heartURL(k)}" width="22" height="20" alt="" draggable="false" style="--d:${i * 70}ms">`;
    }).join('');
    if (prev != null && v > prev) sfx('heart', { volume: 0.4 });
    el._v = v;
  };

  // ---------------------------------------------------------------- dialogue
  const measureLines = () => {
    // reserve the tallest line so the card doesn't jump while typing
    const probe = document.createElement('div');
    probe.className = 'vc-text vc-probe';
    probe.style.width = talk.clientWidth + 'px';
    talkBox.appendChild(probe);
    let mh = 0;
    for (const l of st.lines) { buildText(probe, l, icon); probe.querySelectorAll('.vc-ch').forEach((c) => c.classList.add('on')); mh = Math.max(mh, probe.offsetHeight); }
    probe.remove();
    talk.style.minHeight = mh ? mh + 'px' : '';
  };
  const showLine = (i) => {
    st.li = i;
    st.chars = buildText(talk, st.lines[i] || '', icon);
    st.shown = 0; st.revealed = 0; st.typed = !st.chars.length; st.prevCh = ' ';
    try { p3?.talk(String(st.lines[i] || '').replace(/\{[^}]*\}|\*/g, '')); } catch { /* ignore */ }
    talkBox.classList.remove('vc-ready', 'vc-last');
    if (REDUCED()) { st.shown = st.chars.length; }
    kick();
  };
  const finishTyping = () => { st.shown = st.chars.length + 1; };
  const advance = () => {
    if (st.closed) return;
    if (!st.typed) { finishTyping(); return; }
    if (st.li < st.lines.length - 1) { sfx('page', { volume: 0.35, pitch: 1.1 + R() * 0.2 }); showLine(st.li + 1); }
    else { talkBox.classList.remove('vc-nudge'); void talkBox.offsetWidth; talkBox.classList.add('vc-nudge'); }
  };
  const setLines = (lines) => {
    st.lines = (Array.isArray(lines) ? lines : lines ? [String(lines)] : []).map(String);
    if (!st.lines.length) st.lines = [''];
    measureLines();
    showLine(0);
  };
  talkBox.addEventListener('click', (e) => { e.stopPropagation(); advance(); });

  // ---------------------------------------------------------------- offers
  const tagCls = (t) => {
    const s = String(t || '').toUpperCase();
    if (s === 'NEW' || s === 'HOT' || s === 'SALE') return 'vc-t-red';
    if (s === 'UNLOCKED' || s === 'OWNED' || s === 'DONE') return 'vc-t-green';
    if (s.includes('★') || s === 'STAR' || s === 'RARE') return 'vc-t-gold';
    return 'vc-t-blue';
  };
  const setOffers = (list) => {
    st.offers = Array.isArray(list) ? list : [];
    if (!st.offers.length) { offs.innerHTML = ''; offs.hidden = true; return; }
    offs.hidden = false;
    offs.innerHTML = `<div class="vc-sec"><span>${esc(o.shopTitle || V.shop)}</span></div>` + st.offers.map((f, i) => {
      const ic = icon(f.icon, 2) || `<i class="vc-noico">?</i>`;
      const lk = f.locked ? (typeof f.locked === 'string' ? f.locked : 'Locked') : '';
      return `<button type="button" class="vc-off${lk ? ' vc-locked' : ''}" data-i="${i}" style="--r:${((i % 2 ? 1 : -1) * (0.3 + ((i * 37) % 7) / 10)).toFixed(2)}deg;--d:${i * 60}ms"${lk ? ' aria-disabled="true"' : ''}>
        <span class="vc-oi">${ic}</span>
        <span class="vc-ot"><b>${esc(f.title)}</b>${f.desc ? `<small>${esc(f.desc)}</small>` : ''}${lk ? `<em>${pxSVG(LOCK_ROWS, 'currentColor', 2)}<span>${esc(lk)}</span></em>` : ''}</span>
        ${f.tag ? `<span class="vc-tag ${tagCls(f.tag)}">${esc(f.tag).replace(/★/g, STAR_SVG)}</span>` : ''}
      </button>`;
    }).join('');
  };
  offs.addEventListener('click', (e) => {
    const b = e.target.closest('.vc-off');
    if (!b) return;
    e.stopPropagation();
    const f = st.offers[+b.dataset.i];
    if (!f) return;
    if (f.locked) {
      sfx('error', { volume: 0.4 });
      b.classList.remove('vc-nope'); void b.offsetWidth; b.classList.add('vc-nope');
      return;
    }
    sfx('click');
    b.classList.remove('vc-press'); void b.offsetWidth; b.classList.add('vc-press');
    try { f.onClick?.(f, api); } catch (err) { console.error(err); }
  });
  offs.addEventListener('pointerover', (e) => {
    const b = e.target.closest?.('.vc-off');
    if (b && !b.contains(e.relatedTarget) && !b.classList.contains('vc-locked')) sfx('hover', { volume: 0.25 });
  });

  // ---------------------------------------------------------------- [v19 npc] topics + choices
  const tops = $('.vc-tops'), chs = $('.vc-chs');
  st.topics = []; st.choices = [];
  const setTopics = (list) => {
    st.topics = Array.isArray(list) ? list : [];
    tops.hidden = !st.topics.length;
    tops.innerHTML = st.topics.map((t, i) => `<button type="button" class="vc-top${t.on ? ' is-on' : ''}${t.isNew ? ' is-new' : ''}${t.done ? ' is-done' : ''}" data-i="${i}" style="--d:${i * 40}ms">${esc(t.label)}${t.isNew ? '<i>NEW</i>' : ''}</button>`).join('');
  };
  tops.addEventListener('click', (e) => {
    const b = e.target.closest('.vc-top');
    if (!b) return;
    e.stopPropagation();
    const t = st.topics[+b.dataset.i];
    if (!t) return;
    sfx('page', { volume: 0.3, pitch: 1.2 });
    tops.querySelectorAll('.vc-top').forEach((x) => x.classList.toggle('is-on', x === b));
    b.classList.remove('is-new'); b.querySelector('i')?.remove();
    try { o.onTopic?.(t.id, api); } catch (err) { console.error(err); }
  });
  const setChoices = (list) => {
    st.choices = Array.isArray(list) ? list : [];
    chs.hidden = !st.choices.length;
    chs.innerHTML = st.choices.map((c, i) => `<button type="button" class="vc-chb" data-i="${i}" style="--d:${i * 70}ms"><b>${i + 1}</b><span>${esc(c.label)}</span>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`).join('');
    requestAnimationFrame(scrollHint);
  };
  chs.addEventListener('click', (e) => {
    const b = e.target.closest('.vc-chb');
    if (!b) return;
    e.stopPropagation();
    const c = st.choices[+b.dataset.i];
    if (!c) return;
    sfx('click');
    setChoices([]);
    try { c.onPick?.(c, api); } catch (err) { console.error(err); }
  });
  // a little paper tag under the hearts: "+1 friendship", "+20 coins"
  const reward = (text) => {
    const id = $('.vc-id');
    const t = document.createElement('span');
    t.className = 'vc-rew';
    t.textContent = text;
    id.appendChild(t);
    anim(t, [{ transform: 'translateY(6px)', opacity: 0 }, { transform: 'none', opacity: 1, offset: 0.15 }, { transform: 'none', opacity: 1, offset: 0.8 }, { transform: 'translateY(-8px)', opacity: 0 }], { duration: REDUCED() ? 1600 : 2400, fill: 'forwards' });
    setTimeout(() => t.remove(), 2500);
  };

  // ---------------------------------------------------------------- gift
  const setGift = (g) => {
    st.gift = g || null;
    if (!g) { giftw.innerHTML = ''; giftw.hidden = true; return; }
    giftw.hidden = false;
    const art = giftArt(V.gift, st.giftOpened);
    const ready = !!g.ready && !st.giftOpened;
    giftw.innerHTML = `
      <div class="vc-gift${ready ? ' vc-ready' : ''}${st.giftOpened ? ' vc-opened' : ''}">
        <button type="button" class="vc-gbox" aria-label="${esc(ready ? 'Open gift' : g.label || 'Gift')}"${ready ? '' : ' tabindex="-1"'}>
          <img class="vc-gbody" src="${art.body}" width="${art.bw * 3}" height="${art.bh * 3}" alt="" draggable="false">
          <img class="vc-glid" src="${art.lid}" width="${art.lw * 3}" height="${art.lh * 3}" alt="" draggable="false">
          <i class="vc-gsp s1"></i><i class="vc-gsp s2"></i><i class="vc-gsp s3"></i>
        </button>
        <div class="vc-gt"><b>${esc(st.giftOpened ? 'Thank you, dear!' : g.label || 'A little something')}</b><small>${st.giftOpened ? 'Gift claimed' : ready ? 'Tap to open!' : 'Come back later'}</small></div>
      </div>`;
    if (st.giftOpened) giftw.querySelector('.vc-gt b').textContent = { dale: 'Cheers, buddy!', granny: 'Enjoy, dearie!', hoot: 'Splendid!', rocco: "Don't tell nobody.", shellby: 'Heh. For you, sprout.', clover: 'Fresh from the garden!', otis: 'Straight off the dock!', hazel: 'Still warm, sweetie!', chip: 'Tok-tok! Enjoy!', pip: 'On the house, partner!', flint: 'Don\'t spend it all.' }[npc] || 'Thank you!';
  };
  giftw.addEventListener('click', async (e) => {
    const b = e.target.closest('.vc-gbox');
    if (!b) return;
    e.stopPropagation();
    const g = st.gift;
    if (!g || st.giftOpened) return;
    if (!g.ready) {
      sfx('error', { volume: 0.3 });
      const w = giftw.querySelector('.vc-gift');
      w.classList.remove('vc-nope'); void w.offsetWidth; w.classList.add('vc-nope');
      return;
    }
    st.giftOpened = true;
    const w = giftw.querySelector('.vc-gift');
    w.classList.remove('vc-ready');
    w.classList.add('vc-opening');
    sfx('paper', { volume: 0.5, pitch: 1.2 });
    await sleep(REDUCED() ? 0 : 380);
    if (st.closed) return;
    sfx('pop_in', { volume: 0.7 });
    confetti(b);
    const lid = giftw.querySelector('.vc-glid');
    anim(lid, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${R() < 0.5 ? -40 : 40}px,-70px) rotate(${R() < 0.5 ? -40 : 40}deg)`, opacity: 1, offset: 0.6 }, { transform: 'translate(0,-40px) rotate(0)', opacity: 0 }], { duration: REDUCED() ? 1 : 700, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });
    const art = giftArt(V.gift, true);
    giftw.querySelector('.vc-gbody').src = art.body;
    await sleep(REDUCED() ? 0 : 520);
    if (st.closed) return;
    setGift(g);
    try { g.onClaim?.(g, api); } catch (err) { console.error(err); }
  });
  function confetti(from) {
    if (REDUCED()) return;
    const fr = fx.getBoundingClientRect(), br = from.getBoundingClientRect();
    const cx = br.left + br.width / 2 - fr.left, cy = br.top + br.height * 0.35 - fr.top;
    const cols = ['#e04a64', '#ffd23f', '#3c88d8', '#6cc04a', '#a092e0', '#ffffff', '#f08a1a'];
    for (let i = 0; i < 44; i++) {
      const p = document.createElement('i');
      p.className = 'vc-conf';
      const w = R() < 0.5 ? 9 : 6, h = R() < 0.4 ? 12 : 6;
      p.style.cssText = `left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;background:${cols[i % cols.length]}`;
      fx.appendChild(p);
      const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.4, d = 80 + R() * 140;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      const k = anim(p, [
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px)) rotate(${(R() * 360) | 0}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${(dx * 1.3).toFixed(0)}px), calc(-50% + ${(dy + 140).toFixed(0)}px)) rotate(${(R() * 900) | 0}deg)`, opacity: 0 },
      ], { duration: 900 + R() * 600, easing: 'cubic-bezier(.15,.7,.5,1)', fill: 'forwards' });
      if (k) k.finished.then(() => p.remove(), () => p.remove()); else p.remove();
    }
  }

  // ---------------------------------------------------------------- loop: typing + portrait
  function kick() { if (!st.raf && !st.closed) { st.last = performance.now(); st.raf = requestAnimationFrame(tick); } }
  function tick(now) {
    st.raf = 0;
    if (st.closed) return;
    const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
    st.last = now;
    const n = st.chars.length;
    let talking = false;
    if (!st.typed) {
      st.shown += dt * 34;
      while (st.revealed < Math.min(n, Math.floor(st.shown))) {
        const c = st.chars[st.revealed++];
        if (c.el) c.el.classList.add('on');
        // babble rhythm: one soft blip per word
        if (c.ch && /[a-z0-9]/i.test(c.ch) && !/[a-z0-9']/i.test(st.prevCh || ' ')) sfx('click', { volume: 0.14, pitch: V.pitch * (0.85 + R() * 0.4) });
        st.prevCh = c.ch;
        const p = PAUSE[c.ch];
        if (p && st.revealed < n && !REDUCED() && st.shown < n) st.shown -= p * 34;
      }
      talking = st.revealed < n && !PAUSE[st.chars[Math.max(0, st.revealed - 1)]?.ch];
      if (st.revealed >= n) {
        st.typed = true;
        talkBox.classList.add('vc-ready');
        talkBox.classList.toggle('vc-last', st.li >= st.lines.length - 1);
      }
    }
    if (!talking && st.typed) { if (st.wasTalking) p3?.stopTalk(); st.wasTalking = false; st.raf = 0; return; }
    st.wasTalking = talking;
    st.raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- keys + dismissal
  const entry = {
    key(e) {
      if (st.closed) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); api.close(); return; }
      if (/^[1-3]$/.test(e.key) && st.choices?.length) { const b = chs.querySelector(`.vc-chb[data-i="${+e.key - 1}"]`); if (b) { e.preventDefault(); b.click(); return; } }
      if (e.key === ' ' || e.key === 'Enter') {
        if (t && t.closest && t.closest('.vc-off,.vc-gbox,.vc-x,.vc-top,.vc-chb')) return;
        e.preventDefault();
        advance();
      }
    },
  };
  stack.push(entry);
  if (!keyBound) { window.addEventListener('keydown', onKey, true); keyBound = true; }
  $('.vc-x').addEventListener('click', (e) => { e.stopPropagation(); sfx('click'); api.close(); });
  dim.addEventListener('click', () => api.close());
  stage.addEventListener('click', (e) => { if (e.target === stage) api.close(); });

  // ---------------------------------------------------------------- texture sized to the sheet
  let tw = 0, th = 0;
  const seed = (R() * 1000) | 0;
  const retex = () => {
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    if (!w || !h || (Math.abs(w - tw) < PX * 2 && Math.abs(h - th) < PX * 2)) return;
    const reflow = tw && Math.abs(w - tw) >= PX * 2;
    tw = w; th = h;
    if (reflow) measureLines();
    sheet.style.backgroundImage = `url(${paperTexture('parchment', w, h, { edge: 0.5, edgeW: 8, seed, dogear: 7, creases: [0.62] })})`;
  };
  // fade hint when the body has more below (the scrollbar is hidden)
  const body = $('.vc-body');
  const scrollHint = () => body.classList.toggle('vc-more-below', body.scrollHeight - body.scrollTop - body.clientHeight > 6);
  body.addEventListener('scroll', scrollHint, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { retex(); scrollHint(); }) : null;

  // ---------------------------------------------------------------- api
  const api = {
    el: ov,
    close() {
      if (st.closed) return;
      st.closed = true;
      cancelAnimationFrame(st.raf); st.raf = 0;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      ov.classList.add('vc-closing');
      sfx('whoosh', { volume: 0.4 });
      const sx = R() < 0.5 ? -1 : 1;
      const a = REDUCED() ? anim(sheet, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
        : anim(sheet, [
          { transform: `rotate(${rot}deg)` },
          { transform: `translate(${-sx * 8}px, -12px) rotate(${rot - sx * 2}deg)`, offset: 0.22 },
          { transform: `translate(${sx * 30}vw, 100vh) rotate(${rot + sx * 26}deg)` },
        ], { duration: 420, easing: 'cubic-bezier(.5,0,.85,.4)', fill: 'forwards' });
      anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' });
      fin(a, 420).then(() => {
        ro?.disconnect();
        try { p3?.dispose(); } catch { /* ignore */ }
        ov.remove();
        try { o.onClose?.(); } catch (err) { console.error(err); }
      });
    },
    setLines(lines) { if (!st.closed) setLines(lines); },
    setTopics(list) { if (!st.closed) setTopics(list); },
    setChoices(list) { if (!st.closed) setChoices(list); },
    reward(text) { if (!st.closed) reward(text); },
    get portrait() { return p3; },
    get closed() { return st.closed; },
    update(p = {}) {
      if (st.closed) return;
      if ('offers' in p) setOffers(p.offers);
      if ('gift' in p) { if (p.gift && p.gift.ready) st.giftOpened = false; setGift(p.gift); }
      if ('hearts' in p) setHearts(p.hearts);
      if ('topics' in p) setTopics(p.topics);
      if ('choices' in p) setChoices(p.choices);
      if ('lines' in p) setLines(p.lines);
      requestAnimationFrame(scrollHint);
    },
  };

  root.appendChild(ov);
  setHearts(o.hearts);
  setOffers(o.offers);
  setGift(o.gift);
  setTopics(o.topics);
  setChoices(o.choices);
  retex();
  ro?.observe(sheet);
  ro?.observe(offs);
  requestAnimationFrame(scrollHint);
  setLines(o.lines || ['…']);
  const fontsReady = document.fonts?.ready;
  if (fontsReady) fontsReady.then(() => { if (!st.closed) measureLines(); }).catch(() => {});

  // enter: slide up from below and settle
  ov.classList.add('vc-on');
  sfx('page', { volume: 0.5 });
  if (!REDUCED()) {
    const side = R() < 0.5 ? -1 : 1;
    anim(sheet, [
      { transform: `translate(${side * 24}vw, 100vh) rotate(${side * 18}deg)` },
      { transform: `translate(0, -12px) rotate(${-rot * 1.6}deg)`, offset: 0.58 },
      { transform: `translate(0, 3px) rotate(${rot * 2}deg)`, offset: 0.76 },
      { transform: `rotate(${rot}deg)` },
    ], { duration: 660, easing: 'cubic-bezier(.25,.9,.35,1)', fill: 'backwards' });
  }
  return api;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const fin = (a, ms) => (a ? Promise.race([a.finished.catch(() => {}), sleep(ms + 200)]) : sleep(ms));
