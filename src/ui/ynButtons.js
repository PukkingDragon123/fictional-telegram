// [v27 knobs] One look for every yes / no choice: chunky painted planks.
// YES is a green plank with a stamped check badge, NO a brick-red plank with a
// cross badge. Hand-made pixel art (wood grain, bevel, a lip that squashes when
// pressed, a soft drop shadow), painted at whole device pixels (pxCrisp.js) so
// they stay crisp on iPad / phones. The label is drawn with the game's goofy
// bitmap font; the real text stays in the button for screen readers.
//
//   ynButton(btn, 'yes' | 'no', { label?, size?: 'l' | 'm' | 's', texel? })
//       repaints `btn` (keeps its listeners, id and classes; adds .yn .yn--yes/no)
//   ynPair(yesBtn, noBtn, { size?, texel?, keys?, enter?, esc?, fit? }) -> { dispose }
//       both + optional keys (Y / Enter = yes, N / Esc = no; never while typing),
//       and fit: shrinks the texel size when the pair is wider than its row
//   ynRow(el)  marks a container as a centered row of planks
import './yn.css';
import { INK, FONTS, text, measure, wood } from './titleArt.js';
import { texelPx, artCanvas, blit, css, pattern, trackDpr } from './pxCrisp.js';

// ---------------------------------------------------------------- badges (hand-placed pixels)
// '#' ink, 'h' highlight, 'c' cream, 'd' cream shade; glyph: 'G' mark
const BADGE_L = [
  '......#####......',
  '....##hhccc##....',
  '...#hhcccccdd#...',
  '..#hcccccccccd#..',
  '.#hcccccccccccd#.',
  '.#hcccccccccccd#.',
  '#hcccccccccccccd#',
  '#hcccccccccccccd#',
  '#ccccccccccccccd#',
  '#ccccccccccccccd#',
  '#cccccccccccccdd#',
  '.#ccccccccccccd#.',
  '.#cccccccccccdd#.',
  '..#cccccccccdd#..',
  '...#dccccccdd#...',
  '....##ddddd##....',
  '......#####......',
];
const BADGE_S = [
  '...#####...',
  '.##hcccc##.',
  '.#hcccccd#.',
  '#hcccccccd#',
  '#ccccccccd#',
  '#ccccccccd#',
  '#ccccccccd#',
  '#cccccccdd#',
  '.#cccccdd#.',
  '.##ddddd##.',
  '...#####...',
];
const CHECK_L = [
  '.................',
  '.................',
  '.................',
  '.................',
  '............GGG..',
  '...........GGG...',
  '..........GGG....',
  '..GGG....GGG.....',
  '..GGGG..GGG......',
  '...GGGGGGG.......',
  '....GGGGG........',
  '.....GGG.........',
  '......G..........',
];
const CROSS_L = [
  '.................',
  '.................',
  '.................',
  '.................',
  '...GGG.....GGG...',
  '...GGGG...GGGG...',
  '....GGGG.GGGG....',
  '.....GGGGGGG.....',
  '......GGGGG......',
  '.....GGGGGGG.....',
  '....GGGG.GGGG....',
  '...GGGG...GGGG...',
  '...GGG.....GGG...',
];
const CHECK_S = [
  '...........',
  '...........',
  '........G..',
  '.......GG..',
  '......GG...',
  '.G...GG....',
  '.GG.GG.....',
  '..GGG......',
  '...G.......',
];
const CROSS_S = [
  '...........',
  '...........',
  '..GG...GG..',
  '..GGG.GGG..',
  '...GGGGG...',
  '....GGG....',
  '...GGGGG...',
  '..GGG.GGG..',
  '..GG...GG..',
];

const KINDS = {
  yes: {
    wood: { base: [88, 162, 70], dark: [62, 126, 52], light: [130, 202, 98] },
    lip: '#3c7c30', lipD: '#2a5c22', line: 'rgba(24,60,18,.38)',
    fill: '#fff8e2', shade: '#e2f4c4', mark: '#3c9a30', markD: '#1f5e1a', glyph: { l: CHECK_L, s: CHECK_S },
  },
  no: {
    wood: { base: [178, 80, 56], dark: [138, 54, 40], light: [214, 118, 86] },
    lip: '#7e3020', lipD: '#5c2016', line: 'rgba(70,16,8,.38)',
    fill: '#fff4dc', shade: '#ffd9bc', mark: '#cc3e2a', markD: '#7e1c12', glyph: { l: CROSS_L, s: CROSS_S },
  },
};
// t: CSS px per texel (default); padY/padX/gap in texels; thick = the lip under the face
const SIZES = {
  l: { font: FONTS.hi, badge: BADGE_L, g: 'l', t: 2, padX: 5, padY: 2, gap: 3, thick: 3, shadow: 2 },
  m: { font: FONTS.big, badge: BADGE_S, g: 's', t: 3, padX: 4, padY: 3, gap: 3, thick: 2, shadow: 2 },
  s: { font: FONTS.big, badge: BADGE_S, g: 's', t: 2, padX: 3, padY: 2, gap: 2, thick: 2, shadow: 1 },
};
const BADGE_PAL = { '#': INK, h: '#ffffff', c: '#fbf3dc', d: '#dcc89c' };

function seedOf(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 997; return h; }

/** paint one plank frame into a texel canvas. down: the pressed frame */
function paintPlank(kind, label, S, down) {
  const K = KINDS[kind] || KINDS.yes;
  const str = String(label).toUpperCase();
  const bm = measure(S.font, str);
  const B = S.badge.length;
  const textW = bm.w + 2, textH = bm.h + 3; // ink outline all round + 1 drop
  const innerH = Math.max(textH, B);
  const faceH = innerH + S.padY * 2;
  const W = 1 + S.padX + B + S.gap + textW + S.padX + 1;
  const th = S.thick, sh = S.shadow;
  const H = 1 + faceH + th + 1; // ink top, face, lip, ink bottom
  const { c, g } = artCanvas(W + sh, H + sh);
  const oy = down ? th - 1 : 0; // pressed: the face sinks into its lip
  const lip = down ? 1 : th;
  const h = faceH + lip + 2;
  const inside = (x, y) => { // the plank outline with 1-texel chamfered corners
    if (x < 0 || y < 0 || x >= W || y >= h) return false;
    const cx = x === 0 || x === W - 1, cy = y === 0 || y === h - 1;
    return !(cx && cy);
  };
  // drop shadow (rest: down-right; pressed: almost none)
  const so = down ? 1 : sh;
  g.fillStyle = 'rgba(28,10,4,.38)';
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) if (inside(x, y)) g.fillRect(x + so, y + oy + so, 1, 1);
  // ink body
  g.fillStyle = INK;
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) if (inside(x, y)) g.fillRect(x, y + oy, 1, 1);
  // painted wood face
  const fy = oy + 1;
  wood(g, 1, fy, W - 2, faceH, seedOf(str) + (kind === 'yes' ? 3 : 11), K.wood);
  const L = css(K.wood.light), D = css(K.wood.dark);
  g.fillStyle = L; g.fillRect(1, fy, W - 2, 1); g.fillRect(1, fy, 1, faceH - 1);
  g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(2, fy, W - 5, 1);
  g.fillStyle = D; g.fillRect(W - 2, fy + 1, 1, faceH - 1);
  // stamped frame line inset on the face
  g.fillStyle = K.line;
  g.fillRect(3, fy + 2, W - 6, 1); g.fillRect(3, fy + faceH - 3, W - 6, 1);
  g.fillRect(3, fy + 3, 1, faceH - 6); g.fillRect(W - 4, fy + 3, 1, faceH - 6);
  // rounder corners: ink on the inner corner texels
  g.fillStyle = INK;
  g.fillRect(1, fy, 1, 1); g.fillRect(W - 2, fy, 1, 1);
  g.fillRect(1, oy + h - 2, 1, 1); g.fillRect(W - 2, oy + h - 2, 1, 1);
  // the lip (plank thickness) under the face
  const ly = fy + faceH;
  g.fillStyle = K.lip; g.fillRect(2, ly, W - 4, lip);
  g.fillStyle = K.lipD; if (lip > 1) g.fillRect(2, ly + lip - 1, W - 4, 1);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(2, ly, W - 4, 1);
  // badge + mark
  const bx = 1 + S.padX, by = fy + S.padY + Math.floor((innerH - B) / 2);
  const shadowRows = S.badge.map((r) => r.replace(/[^.]/g, 's'));
  pattern(g, shadowRows, bx + 1, by + 1, { s: 'rgba(20,8,4,.35)' });
  pattern(g, S.badge, bx, by, BADGE_PAL);
  const gl = K.glyph[S.g];
  // the mark's shadow one texel down, then the mark
  const markRows = gl.map((r) => r.replace(/G/g, 'g'));
  pattern(g, markRows, bx, by + 1, { g: K.markD });
  pattern(g, gl, bx, by, { G: K.mark });
  // highlight pixels on the mark (top-left of each run)
  g.fillStyle = 'rgba(255,255,255,.45)';
  gl.forEach((row, y) => { const i = row.indexOf('G'); if (i >= 0 && y % 2 === 0) g.fillRect(bx + i, by + y, 1, 1); });
  // label
  const tx = bx + B + S.gap + 1, ty = fy + S.padY + Math.floor((innerH - textH) / 2) + 1;
  text(g, S.font, str, tx, ty, { fill: K.fill, shade: K.shade, ink: INK, split: 0.55, drop: 1 });
  return c;
}

const live = new WeakSet();

function paint(btn) {
  const st = btn._yn;
  const S = SIZES[st.size] || SIZES.l;
  const art = btn.querySelector('.yn-art');
  if (!art) return;
  let up = art.querySelector('.yn-up'), dn = art.querySelector('.yn-dn');
  if (!up) { up = document.createElement('canvas'); up.className = 'yn-up'; art.appendChild(up); }
  if (!dn) { dn = document.createElement('canvas'); dn.className = 'yn-dn'; art.appendChild(dn); }
  blit(paintPlank(st.kind, st.txt, S, false), st.t, up);
  blit(paintPlank(st.kind, st.txt, S, true), st.t, dn);
  btn.style.setProperty('--yn-t', `${st.t}px`);
}

export function ynButton(btn, kind = 'yes', { label, size = 'l', texel } = {}) {
  if (!btn) return btn;
  const txt = String(label ?? btn.dataset.ynLabel ?? btn.textContent ?? '').replace(/\s+/g, ' ').trim() || (kind === 'yes' ? 'Yes' : 'No');
  btn.dataset.ynLabel = txt;
  const S = SIZES[size] || SIZES.l;
  btn._yn = { kind: kind === 'no' ? 'no' : 'yes', txt, size, t: texelPx(texel ?? S.t), base: texel ?? S.t };
  btn.classList.add('yn', `yn--${btn._yn.kind}`);
  btn.classList.remove('btn', 'red', 'green', 'gold');
  if (btn.tagName === 'BUTTON') btn.type = 'button';
  btn.setAttribute('aria-label', txt);
  btn.innerHTML = '<span class="yn-art" aria-hidden="true"></span><span class="yn-sr"></span>';
  btn.querySelector('.yn-sr').textContent = txt;
  paint(btn);
  if (!live.has(btn)) {
    live.add(btn);
    // pressed frame for touch too (iOS Safari skips :active without a touch listener)
    const down = (on) => btn.classList.toggle('is-down', on && !btn.disabled);
    btn.addEventListener('pointerdown', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') down(true); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) btn.addEventListener(ev, () => down(false));
    btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') down(true); });
    btn.addEventListener('keyup', () => down(false));
    let seen = false;
    trackDpr(() => {
      if (btn.isConnected) { seen = true; btn._yn.t = texelPx(btn._yn.base); paint(btn); return true; }
      return !seen;
    });
  }
  return btn;
}

/** marks `el` as a centered row of planks */
export function ynRow(el) { el?.classList.add('yn-row'); return el; }

/** a press you can see, then the click (keyboard shortcuts) */
function pressClick(b) {
  b.classList.add('is-down');
  setTimeout(() => { b.classList.remove('is-down'); b.click(); }, 90);
}

export function ynPair(yes, no, { size = 'l', texel, keys = false, enter = true, esc = true, fit = true, yesLabel, noLabel } = {}) {
  ynButton(yes, 'yes', { size, texel, label: yesLabel });
  ynButton(no, 'no', { size, texel, label: noLabel });
  yes?.style.setProperty('--yn-i', '0');
  no?.style.setProperty('--yn-i', '1');
  if (yes?.parentElement && yes.parentElement === no?.parentElement) ynRow(yes.parentElement);
  let off = null;
  if (keys && yes && no) {
    const onKey = (e) => {
      if (!yes.isConnected) { off?.(); return; }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      const k = String(e.key || '').toLowerCase();
      if (k === 'enter' && t && t.tagName === 'BUTTON' && t !== yes) return; // Enter on a focused button presses that button
      let b = null;
      if (k === 'y' || (enter && k === 'enter')) b = yes;
      else if (k === 'n' || (esc && k === 'escape')) b = no;
      if (!b || b.disabled || b.closest('.bye')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      pressClick(b);
    };
    window.addEventListener('keydown', onKey, true);
    off = () => { window.removeEventListener('keydown', onKey, true); off = null; };
  }
  if (fit && yes && no) {
    const S = SIZES[size] || SIZES.l;
    const t0 = texel ?? S.t;
    const cands = [...new Set([t0, t0 * 0.75, t0 * 0.5].map((t) => texelPx(t)))].sort((a, b) => b - a);
    const doFit = () => {
      const row = yes.parentElement;
      if (!row || !row.isConnected) return;
      const cs = getComputedStyle(row);
      const avail = row.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      if (!(avail > 0)) return;
      const gap = parseFloat(cs.columnGap) || 0;
      const others = [...row.children].filter((c) => c !== yes && c !== no && c.offsetWidth).reduce((s, c) => s + c.offsetWidth + gap, 0);
      for (const t of cands) {
        if (t > texelPx(t0)) continue;
        for (const b of [yes, no]) { b._yn.base = t; b._yn.t = t; paint(b); }
        if (yes.offsetWidth + no.offsetWidth + gap + others <= avail + 0.5) break;
      }
    };
    if (yes.isConnected) doFit(); else requestAnimationFrame(doFit);
  }
  return { dispose: () => off?.() };
}

// ---------------------------------------------------------------- the "Are you sure?" card
const SWEAT = [
  '...#...',
  '..#b#..',
  '..#b#..',
  '.#hbb#.',
  '#hbbbb#',
  '#hbbbd#',
  '#bbbdd#',
  '.#bdd#.',
  '..###..',
];
let sweatCache = null;
function sweatImg(t) {
  const { c, g } = artCanvas(7, 9);
  pattern(g, SWEAT, 0, 0, { '#': '#1d3550', b: '#8fd4f6', h: '#ffffff', d: '#4f9fd0' });
  const out = blit(c, t);
  return { url: out.toDataURL(), w: parseFloat(out.style.width), h: parseFloat(out.style.height) };
}
const escHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** body of a confirm card: Reynard's worried face pinned up, the question, YES / NO planks
 *  (ids #cf-yes / #cf-no). `text` is HTML (as before); `face` is an <img> (sprites.js spriteImg). */
export function confirmHTML(text, { yes = 'Yes', no = 'Cancel', face = '', title = 'Are you sure?' } = {}) {
  const t = texelPx(3);
  if (!sweatCache || sweatCache.t !== t) sweatCache = { t, ...sweatImg(t) };
  const sw = sweatCache;
  return `<div class="cf-card">
      <div class="cf-pic">${face}<img class="cf-sweat" src="${sw.url}" style="width:${sw.w}px;height:${sw.h}px" alt="" draggable="false"></div>
      <div class="cf-say"><h2>${title}</h2><p>${text}</p></div>
    </div>
    <div class="btns cf-btns"><button id="cf-yes">${escHTML(yes)}</button><button id="cf-no">${escHTML(no)}</button></div>`;
}
