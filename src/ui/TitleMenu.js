// TitleMenu: the title screen's menu, made of things that live in the valley.
// A wooden logo board hangs on two ropes (somebody took a bite out of its
// corner), and a little trail signpost holds arrow planks: New game / Continue
// (with the save's day), plus a tin sound tag nailed to the post. Everything is
// pixel art painted on canvases (the logo and labels come straight from the
// TBME Goofy bitmap glyphs: crisp, no font loading, there on the first frame).
//
//   const m = showTitleMenu(root, {
//     hasSave, saveDay,             // show "Continue" (and "DAY 12" under it)
//     onStart(choice),              // 'continue' | 'new' (after the exit animation, ~0.35 s)
//     sfx(name, opts),              // optional: audio.play-style ('hover', 'click', 'paper')
//     onSound(on), isMuted(),       // optional: the sound tag
//   });
//   m.close();                      // animated, idempotent
import './titlemenu.css';
import { GOOFY_HI, GOOFY_BIG, GOOFY_SMALL, goofyBitmap } from './goofyFont.js';

const INK = '#2a160c';
function h1(n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.className = 'tm-px'; return c; }

// text from bitmap glyphs: 1 px ink outline + a drop, two-tone fill
function text(ctx, font, str, x, y, { fill, shade, ink = INK, split = 0.55, drop = 1, outline = true }) {
  const bm = goofyBitmap(font, str), px = [];
  bm.rows.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '#') px.push(u, v); });
  ctx.fillStyle = ink;
  if (outline) for (let i = 0; i < px.length; i += 2) ctx.fillRect(x + px[i] - 1, y + px[i + 1] - 1, 3, 3 + drop);
  const cut = Math.round(bm.h * split);
  for (let i = 0; i < px.length; i += 2) { ctx.fillStyle = px[i + 1] < cut ? fill : shade; ctx.fillRect(x + px[i], y + px[i + 1], 1, 1); }
  return bm;
}
const measure = (font, str) => goofyBitmap(font, str);

// wood planks with grain, knots and a lit top edge
function wood(ctx, x0, y0, w, h, seed, { base = [168, 104, 58], dark = [122, 72, 38], light = [206, 146, 88] } = {}) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const g = Math.sin((x + seed * 13) * 0.21 + Math.sin(y * 0.9 + seed) * 1.6 + Math.sin(x * 0.05 + seed) * 3);
    let c = base;
    if (g > 0.86) c = dark; else if (g < -0.9 && h1(x * 3 + y * 7 + seed) > 0.4) c = light;
    if (y === 0) c = light;
    if (y === h - 1) c = dark;
    if (h1(x * 1.3 + y * 17.1 + seed) > 0.985) c = dark;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x0 + x, y0 + y, 1, 1);
  }
}
function nail(ctx, x, y) { ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 1, 4, 4); ctx.fillStyle = '#d8dde6'; ctx.fillRect(x, y, 2, 2); ctx.fillStyle = '#8a909e'; ctx.fillRect(x + 1, y + 1, 1, 1); }

function logoBoard() {
  const l1 = 'THE BEAR', l2 = 'MUST EAT';
  const b1 = measure(GOOFY_HI, l1), b2 = measure(GOOFY_HI, l2);
  const W = Math.max(b1.w, b2.w) + 22, H = b1.h + b2.h + 18;
  const c = cv(W, H), g = c.getContext('2d');
  // three planks + outline
  const ph = [Math.floor(H / 3), Math.floor(H / 3), H - 2 * Math.floor(H / 3)];
  let y = 0;
  for (let i = 0; i < 3; i++) { wood(g, 0, y, W, ph[i], i * 5 + 3); y += ph[i]; }
  g.fillStyle = INK;
  for (let i = 1; i < 3; i++) g.fillRect(1, ph[0] * i - (i === 2 ? 0 : 0), W - 2, 1);
  g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, 1, H); g.fillRect(W - 1, 0, 1, H);
  g.fillStyle = 'rgba(255,230,180,0.35)'; g.fillRect(1, 1, W - 2, 1);
  // a bite out of the bottom-right corner
  const bites = [[W - 4, H - 1, 5], [W - 1, H - 7, 4.5], [W - 10, H + 1, 3.6]];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    let inB = false, edge = false;
    for (const [bx, by, r] of bites) { const d = Math.hypot(xx - bx, yy - by); if (d < r) inB = true; else if (d < r + 1.2) edge = true; }
    if (inB) g.clearRect(xx, yy, 1, 1); else if (edge) { g.fillStyle = INK; g.fillRect(xx, yy, 1, 1); }
  }
  // tooth marks
  g.fillStyle = INK; g.fillRect(W - 16, H - 3, 1, 2); g.fillRect(W - 6, H - 13, 2, 1);
  nail(g, 9, 4); nail(g, W - 12, 4);
  text(g, GOOFY_HI, l1, Math.round((W - b1.w) / 2), 7, { fill: '#ffe08a', shade: '#ffb84a' });
  text(g, GOOFY_HI, l2, Math.round((W - b2.w) / 2) + 1, 9 + b1.h, { fill: '#ffc070', shade: '#ff8a3a' });
  return c;
}

// an arrow plank for the signpost; label in chunky caps, optional small second line
function arrowPlank(label, sub, { tint = null, seed = 1 } = {}) {
  const b = measure(GOOFY_BIG, label), s = sub ? measure(GOOFY_SMALL, sub) : null;
  const W = Math.max(56, b.w + 24, s ? s.w + 24 : 0), H = sub ? 20 : 15, tip = Math.ceil(H / 2);
  const c = cv(W, H), g = c.getContext('2d');
  wood(g, 0, 0, W, H, seed, tint || undefined);
  // the pointed right end
  for (let y = 0; y < H; y++) {
    const cut = Math.abs(y - (H - 1) / 2) / ((H - 1) / 2) * tip;
    g.clearRect(W - Math.ceil(cut), y, Math.ceil(cut), 1);
    g.fillStyle = INK; g.fillRect(W - Math.ceil(cut) - 1, y, 1, 1);
  }
  g.fillStyle = INK; g.fillRect(0, 0, W - tip, 1); g.fillRect(0, H - 1, W - tip, 1); g.fillRect(0, 0, 1, H);
  nail(g, 3, Math.floor(H / 2) - 1);
  text(g, GOOFY_BIG, label, 9, sub ? 3 : 4, { fill: '#fff4dc', shade: '#ffd8a0' });
  if (s) text(g, GOOFY_SMALL, sub, 10, 13, { fill: '#ffe2a8', shade: '#ffe2a8', drop: 0 });
  return c;
}

function soundTag(on) {
  const c = cv(15, 15), g = c.getContext('2d');
  // a tin plate with a rolled rim
  g.fillStyle = INK; g.fillRect(1, 0, 13, 15); g.fillRect(0, 1, 15, 13);
  g.fillStyle = '#9aa6b4'; g.fillRect(1, 1, 13, 13);
  g.fillStyle = '#c8d2dc'; g.fillRect(2, 2, 11, 1); g.fillRect(2, 2, 1, 10);
  g.fillStyle = '#6a7686'; g.fillRect(2, 12, 11, 1); g.fillRect(12, 3, 1, 10);
  const SP = on ? ['...k.....', '..kk..k..', 'kkkk...k.', 'kkkk.k..k', 'kkkk.k..k', 'kkkk...k.', '..kk..k..', '...k.....']
    : ['...k.....', '..kk.....', 'kkkk.r.r.', 'kkkk..r..', 'kkkk..r..', 'kkkk.r.r.', '..kk.....', '...k.....'];
  SP.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') { g.fillStyle = row[x] === 'r' ? '#d8402e' : INK; g.fillRect(3 + x, 4 + y, 1, 1); } });
  return c;
}

function postTile() {
  const c = cv(7, 24), g = c.getContext('2d');
  wood(g, 0, 0, 7, 24, 9, { base: [138, 88, 50], dark: [98, 60, 34], light: [176, 120, 70] });
  g.fillStyle = INK; g.fillRect(0, 0, 1, 24); g.fillRect(6, 0, 1, 24);
  g.fillStyle = 'rgba(255,200,140,0.45)'; g.fillRect(5, 0, 1, 24); // the sun on its right side
  return c;
}

export function showTitleMenu(root, { hasSave = false, saveDay = null, onStart, sfx, onSound, isMuted } = {}) {
  root = root || document.body;
  const play = (name, o) => { try { sfx?.(name, o); } catch { /* optional */ } };
  let soundOn = !(isMuted?.() ?? false);
  const S = window.innerWidth < 560 || window.innerHeight < 520 ? 2 : 3;

  const logo = logoBoard();
  const logo_h = (k) => logo.height * k;
  const el = document.createElement('div');
  el.className = 'tm';
  el.style.setProperty('--s', `${S}px`);
  el.style.setProperty('--bh', `${logo_h(S)}px`);
  logo.style.width = `${logo.width * S}px`;
  logo.style.height = `${logo.height * S}px`;
  el.innerHTML = `
    <div class="tm-sign" style="--w:${logo.width * S}px">
      <i class="tm-rope tm-rope--l"></i><i class="tm-rope tm-rope--r"></i>
      <h1 class="tm-logo" aria-label="The Bear Must Eat"></h1>
    </div>
    <nav class="tm-post" aria-label="Menu">
      <i class="tm-pole"></i>
      <div class="tm-planks"></div>
      <button class="tm-snd" aria-label="Sound" title="Sound"></button>
    </nav>
    <div class="tm-credit">Font: TBME Goofy, made from Chewy by Font Diner / Sideshow (Apache 2.0)</div>`;
  el.querySelector('.tm-logo').appendChild(logo);
  const pole = postTile();
  el.querySelector('.tm-pole').style.backgroundImage = `url(${pole.toDataURL()})`;
  const planks = el.querySelector('.tm-planks');
  const btn = (choice, label, sub, seed, tint) => {
    const b = document.createElement('button');
    b.className = 'tm-btn';
    b.dataset.c = choice;
    b.setAttribute('aria-label', label + (sub ? ` (${sub})` : ''));
    const paint = (lb, sb, tn) => {
      const c = arrowPlank(lb, sb, { seed, tint: tn });
      c.style.width = `${c.width * S}px`; c.style.height = `${c.height * S}px`;
      b.replaceChildren(c);
    };
    paint(label, sub, tint);
    b.repaint = paint;
    planks.appendChild(b);
    return b;
  };
  const GREEN = { base: [78, 140, 74], dark: [52, 100, 54], light: [120, 184, 102] };
  if (hasSave) btn('continue', 'CONTINUE', saveDay ? `DAY ${saveDay}` : null, 4, GREEN);
  btn('new', 'NEW GAME', null, 7, hasSave ? null : GREEN);
  root.appendChild(el);

  const snd = el.querySelector('.tm-snd');
  const paintSnd = () => {
    const c = soundTag(soundOn);
    c.style.width = `${c.width * S}px`; c.style.height = `${c.height * S}px`;
    snd.replaceChildren(c);
    snd.classList.toggle('is-off', !soundOn);
  };
  paintSnd();
  snd.addEventListener('click', (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    paintSnd();
    snd.classList.remove('tm-pop'); void snd.offsetWidth; snd.classList.add('tm-pop');
    try { onSound?.(soundOn); } catch { /* optional */ }
    if (soundOn) play('click');
  });

  let closed = false, armed = null;
  const choose = (choice) => {
    if (closed) return;
    play('click');
    close();
    setTimeout(() => onStart?.(choice), 340);
  };
  for (const b of el.querySelectorAll('.tm-btn')) {
    b.addEventListener('pointerenter', () => play('hover', { volume: 0.6 }));
    b.addEventListener('click', () => {
      const c = b.dataset.c;
      if (c === 'new' && hasSave && armed !== b) {
        // starting over wipes the save: ask once, right on the plank
        armed = b;
        play('paper');
        b.classList.add('is-armed');
        b.repaint('SURE?', 'TAP AGAIN', { base: [196, 72, 52], dark: [140, 44, 34], light: [236, 120, 86] });
        setTimeout(() => {
          if (armed !== b || closed) return;
          armed = null;
          b.classList.remove('is-armed');
          b.repaint('NEW GAME', null, null);
        }, 3000);
        return;
      }
      choose(c);
    });
  }
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const b = el.querySelector('.tm-btn');
      if (b && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); b.click(); }
    }
  };
  window.addEventListener('keydown', onKey);

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    el.classList.add('tm--out');
    setTimeout(() => el.remove(), 420);
  }
  return { close, el };
}
