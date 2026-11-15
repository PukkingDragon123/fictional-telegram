// [v33 title] THE POND TIMES: the title menu's newspaper of recent updates.
//
//   paperProp({ S })                 the folded paper tacked to the signpost (a canvas, pixel art)
//   openPondTimes({ sfx, onClose })  the open paper over the title: { close() }
//
// The open paper is a sheet of newsprint painted on the pixel grid (fibres, a fold cross, worn
// edges, a coffee ring), its text set in the game's pixel fonts (TBME Goofy, the masthead in Alagard),
// with halftone pictures printed from the game's own art (3D face renders, sprites, fish). One issue
// per major update, newest first: flip the pages (arrow tabs, arrow keys, a swipe), click a headline
// to read its feature list, Esc / tap outside / the FOLD tab to put it away.
import './pondtimes.css';
import { ISSUES } from './pondTimesIssues.js';
import { INK, cv, scaleEl, measure, text as bmText } from './titleArt.js';
import { GOOFY_SMALL } from './goofyFont.js';
import { pxTextCanvas } from './kinetic/pxfont.js';

const PAPER = '#ece5d2', PAPER_L = '#f6f0e0', PAPER_D = '#d9d0b8', PAPER_DD = '#bfb398', NEWS_INK = '#1f1b1d', GREY_INK = '#7a7068';
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const h1 = (n) => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ the folded paper on the menu
/** a folded newspaper tacked to the post: masthead, the newest headline, a photo, fake columns */
export function paperProp({ headline = ISSUES[0].lead.kicker } = {}) {
  const W = 66, H = 48;
  const c = cv(W, H), g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // a dithered drop shadow (down-right), then the sheet: a slight trapezoid (it hangs from the pin)
  for (let y = 5; y < H; y++) for (let x = 5; x < W; x++) if (x > 6 + (y - 5) * 0.02 && y < H - 1 && (x + y) % 2 === 0) px(x, y, 'rgba(30,12,16,0.55)');
  const L = (y) => 2 + Math.round(y * 0.03), R = (y) => W - 5 - Math.round(y * 0.02);
  for (let y = 2; y < H - 4; y++) for (let x = L(y); x <= R(y); x++) {
    const b = bay(x, y), f = h1(x * 7.1 + y * 3.3);
    let col = f < 0.05 ? PAPER_D : f > 0.95 ? PAPER_L : PAPER;
    if (x > R(y) - 3) col = x === R(y) ? PAPER_DD : b < 0.5 ? PAPER_D : PAPER; // the folded edge: page stack
    if (y > H - 8 && b < (y - (H - 8)) / 6) col = PAPER_D; // aged bottom
    px(x, y, col);
  }
  // the fold crease across the middle
  for (let x = L(24); x <= R(24); x++) { px(x, 24, PAPER_DD); px(x, 25, PAPER_L); }
  // the corner curl (bottom right)
  for (let k = 0; k < 6; k++) for (let j = 0; j <= k; j++) px(R(H - 5) - 5 + k, H - 5 - 5 + j + (5 - k), j === k ? PAPER_DD : PAPER_L);
  // masthead, rules
  const mast = measure(GOOFY_SMALL, 'POND TIMES');
  const mx = Math.round((L(4) + R(4)) / 2 - mast.w / 2);
  bmText(g, GOOFY_SMALL, 'POND TIMES', mx, 4, { fill: NEWS_INK, outline: false, drop: 0 });
  for (let x = L(12) + 2; x <= R(12) - 4; x++) { px(x, 12, NEWS_INK); if (x % 2) px(x, 14, NEWS_INK); }
  // the newest headline (red ink "NEW" tag + the kicker)
  const hl = String(headline).split(' ').slice(0, 2).join(' ');
  const hb = measure(GOOFY_SMALL, hl);
  bmText(g, GOOFY_SMALL, hl, Math.max(L(17) + 3, Math.round((L(17) + R(17)) / 2 - hb.w / 2)), 16, { fill: '#a8241e', outline: false, drop: 0 });
  // a little photo (halftone fish) and columns of fake type
  const pX = L(30) + 3, pY = 28;
  rect(pX, pY, 16, 12, NEWS_INK); rect(pX + 1, pY + 1, 14, 10, PAPER);
  const FISH = ['..kk....', '.kkkk.k.', 'kkokkkkk', '.kkkk.k.', '..kk....'];
  FISH.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.' && (row[i] === 'o' || bay(i, j) < 0.8)) px(pX + 4 + i, pY + 3 + j, row[i] === 'o' ? PAPER : NEWS_INK); });
  for (let y = pY; y < H - 7; y += 2) for (let x = pX + 19; x <= R(y) - 5; x++) if (h1(x * 1.7 + y * 5.1) > 0.22 && (x - pX) % 13 !== 0) px(x, y, GREY_INK);
  for (let y = pY + 14; y < H - 7; y += 2) for (let x = pX; x < pX + 16; x++) if (h1(x * 2.3 + y * 1.9) > 0.25) px(x, y, GREY_INK);
  // ink outline round the sheet
  for (let y = 2; y < H - 4; y++) { px(L(y) - 1, y, INK); px(R(y) + 1, y, INK); }
  for (let x = L(2) - 1; x <= R(2) + 1; x++) px(x, 1, INK);
  for (let x = L(H - 5) - 1; x <= R(H - 5) + 1; x++) px(x, H - 4, INK);
  // the push pin at the top, its little shadow
  const pin = ['.krk.', 'krwrk', 'krrrk', '.kkk.', '..k..'];
  const P = { k: INK, r: '#d8402e', w: '#ffb0a0' };
  pin.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (P[row[i]]) px(Math.round(W / 2) - 4 + i, j, P[row[i]]); });
  px(Math.round(W / 2) - 1, 5, 'rgba(30,12,16,0.5)');
  return c;
}

// ------------------------------------------------------------------ halftone printing of the game's art
/** print a source canvas as two-ink newsprint halftone (ordered dither), w x h art px */
function halftone(src, w, h) {
  const out = cv(w, h, 'ptm-px');
  if (!src) return out;
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const tg = t.getContext('2d', { willReadFrequently: true });
  tg.imageSmoothingEnabled = false;
  const k = Math.min(w / src.width, h / src.height);
  const dw = Math.max(1, Math.round(src.width * k)), dh = Math.max(1, Math.round(src.height * k));
  tg.drawImage(src, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
  const d = tg.getImageData(0, 0, w, h).data;
  const og = out.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 128) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const b = bay(x, y);
    // three steps: solid ink in the darks, grey dots in the mids, paper in the lights
    if (l < 0.22 + b * 0.18) og.fillStyle = NEWS_INK;
    else if (l < 0.55 + b * 0.3) og.fillStyle = (x + y) % 2 ? GREY_INK : '#a89c8c';
    else if (l < 0.85 && b < 0.25) og.fillStyle = '#c8bca8';
    else continue;
    og.fillRect(x, y, 1, 1);
  }
  return out;
}

let ART = null;
async function loadArt() {
  if (ART) return ART;
  const [sp, fishM, faces] = await Promise.all([
    import('./sprites.js').catch(() => null), import('../game/fishSprites.js').catch(() => null), import('./faces3d.js').catch(() => null),
  ]);
  ART = {
    src(pic, size = 64) {
      try {
        if (pic.face && faces) { const c = faces.faceCanvas(pic.face, size, size); if (c) return c; }
        if (pic.icon && sp) return sp.spriteCanvas(pic.icon, 4);
        if (pic.fish && fishM) return fishM.fishCanvasFor(pic.fish, { scale: 2 });
      } catch (e) { console.warn('[pond times] art', e); }
      return null;
    },
  };
  return ART;
}

// ------------------------------------------------------------------ the newsprint sheet
function newsprint(w, h, seed) {
  const c = cv(w, h, 'ptm-px'), g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  const put = (x, y, hex) => { const i = (y * w + x) * 4; d[i] = parseInt(hex.slice(1, 3), 16); d[i + 1] = parseInt(hex.slice(3, 5), 16); d[i + 2] = parseInt(hex.slice(5, 7), 16); d[i + 3] = 255; };
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const b = bay(x, y), f = h1(x * 12.9898 + y * 78.233 + seed);
    let col = null;
    if (f < 0.03) col = PAPER_D; else if (f > 0.975) col = PAPER_L; // fibres
    // aged, yellowed edges in dithered steps
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (e < 10 && b < (10 - e) / 14) col = e < 3 ? PAPER_DD : PAPER_D;
    // the fold cross: a lit side and a shaded side
    if (x === cx) col = PAPER_DD; else if (x === cx + 1) col = PAPER_L;
    if (y === cy && Math.abs(x - cx) > 1) col = PAPER_DD; else if (y === cy + 1 && Math.abs(x - cx) > 1) col = PAPER_L;
    // worn deckle: a few pixels bitten out of the edge
    if (e === 0 && h1(x * 3.1 + y * 7.7 + seed) < 0.3) { const i = (y * w + x) * 4; d[i + 3] = 0; continue; }
    if (col) put(x, y, col);
  }
  // a coffee ring, somewhere in the corner
  const rx = Math.round(w * (0.78 + h1(seed) * 0.12)), ry = Math.round(h * (0.12 + h1(seed + 1) * 0.1)), rr = Math.max(8, Math.round(w * 0.035));
  for (let a = 0; a < 360; a += 0.5) {
    const x = Math.round(rx + Math.cos(a * Math.PI / 180) * rr), y = Math.round(ry + Math.sin(a * Math.PI / 180) * rr * 0.92);
    if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && h1(a * 0.3) > 0.25) put(x, y, '#cdb48c');
  }
  g.putImageData(id, 0, 0);
  return c;
}

// ------------------------------------------------------------------ the open paper
export function openPondTimes({ sfx, onClose } = {}) {
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  let page = 0, busy = false, closed = false;
  const el = document.createElement('div');
  el.className = 'ptm';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'The Pond Times');
  el.innerHTML = `
    <div class="ptm-dim"></div>
    <div class="ptm-sheet">
      <div class="ptm-page" tabindex="-1"></div>
    </div>
    <button class="ptm-tab ptm-prev" aria-label="Newer issue"><span>&lsaquo; NEWER</span></button>
    <button class="ptm-tab ptm-next" aria-label="Older issue"><span>OLDER &rsaquo;</span></button>
    <button class="ptm-fold" aria-label="Fold the paper">FOLD</button>`;
  document.body.appendChild(el);
  const sheet = el.querySelector('.ptm-sheet'), pageEl = el.querySelector('.ptm-page');
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  let P = 2;
  // size the sheet on whole art pixels and paint its newsprint
  function layout() {
    P = vw() >= 1500 && vh() >= 900 ? 3 : 2;
    const W = Math.floor(Math.min(vw() - 24, 1080) / P) * P, H = Math.floor(Math.min(vh() - (vw() < 600 ? 70 : 64), 900) / P) * P;
    sheet.style.width = `${W}px`; sheet.style.height = `${H}px`;
    el.style.setProperty('--P', `${P}px`);
    const tex = newsprint(W / P, H / P, page * 17 + 3);
    sheet.style.backgroundImage = `url(${tex.toDataURL()})`;
    sheet.style.backgroundSize = `${W}px ${H}px`;
    el.classList.toggle('ptm--narrow', W < 700);
  }

  function pic(spec, w, h, cls = '') {
    const wrap = document.createElement('span');
    wrap.className = 'ptm-pic ' + cls;
    const src = ART?.src(spec, 96);
    wrap.appendChild(scaleEl(halftone(src, w, h), P));
    return wrap;
  }

  function render() {
    const I = ISSUES[page];
    const narrow = el.classList.contains('ptm--narrow');
    const mast = pxTextCanvas('The Pond Times', { font: 'alagard', color: NEWS_INK });
    mast.className = 'ptm-mast-c';
    mast.style.width = `${mast.width * P * (narrow ? 1 : 2)}px`; mast.style.height = `${mast.height * P * (narrow ? 1 : 2)}px`;
    pageEl.innerHTML = `
      <header class="ptm-head">
        <div class="ptm-ear ptm-ear--l"><b>WEATHER</b><span class="ptm-wx"></span><small>${esc(I.weather.text)}</small></div>
        <div class="ptm-mast"></div>
        <div class="ptm-ear ptm-ear--r"><b>No. ${I.no}</b><small>${esc(I.edition)}</small><small>Price: ${esc(I.price)}</small></div>
      </header>
      <div class="ptm-dateline"><span>${esc(I.date)}</span><span>${esc(I.edition.toUpperCase())}</span><span>Page ${page + 1} of ${ISSUES.length}</span></div>
      <section class="ptm-lead">
        <div class="ptm-lead-pic"></div>
        <div class="ptm-lead-t"><small class="ptm-kicker">${esc(I.lead.kicker)}</small><h2>${esc(I.lead.title)}</h2><p class="ptm-cap">${esc(I.lead.caption)}</p></div>
      </section>
      <div class="ptm-cols">
        ${I.stories.map((s, i) => `<article class="ptm-story${i === 0 ? ' open' : ''}" data-i="${i}">
          <h3 tabindex="0" role="button" aria-expanded="${i === 0}">${esc(s.h)}</h3>
          <p class="ptm-lede">${esc(s.lede)}</p>
          <ul>${s.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </article>`).join('')}
        <aside class="ptm-side">
          ${I.ads.map((a) => `<div class="ptm-ad"><span class="ptm-ad-i" data-icon="${esc(a.icon)}"></span><b>${esc(a.h)}</b><small>${esc(a.t)}</small></div>`).join('')}
        </aside>
      </div>
      <section class="ptm-comic" aria-label="Comic strip">
        <b class="ptm-comic-t">REYNARD &amp; FRIENDS</b>
        <div class="ptm-panels">${I.comic.map((p) => `<div class="ptm-panel"><span class="ptm-bal">${esc(p.say)}</span><span class="ptm-face"></span></div>`).join('')}</div>
      </section>`;
    pageEl.querySelector('.ptm-mast').appendChild(mast);
    pageEl.querySelector('.ptm-wx').appendChild(pic({ icon: I.weather.icon }, 14, 14, 'ptm-pic--wx'));
    pageEl.querySelector('.ptm-lead-pic').appendChild(pic(I.lead.pic, narrow ? 64 : 96, narrow ? 56 : 84, 'ptm-pic--lead'));
    pageEl.querySelectorAll('.ptm-story').forEach((a) => {
      const s = I.stories[+a.dataset.i];
      if (s.pic) a.insertBefore(pic(s.pic, 40, 32), a.querySelector('.ptm-lede'));
    });
    pageEl.querySelectorAll('.ptm-ad-i').forEach((n) => n.appendChild(pic({ icon: n.dataset.icon }, 16, 16, 'ptm-pic--ad')));
    pageEl.querySelectorAll('.ptm-panel').forEach((n, i) => n.querySelector('.ptm-face').appendChild(pic(I.comic[i].face, 40, 40, 'ptm-pic--face')));
    el.querySelector('.ptm-prev').disabled = page === 0;
    el.querySelector('.ptm-next').disabled = page === ISSUES.length - 1;
    pageEl.scrollTop = 0;
  }

  // headlines expand / fold their feature lists
  pageEl.addEventListener('click', (e) => {
    const h = e.target.closest?.('.ptm-story h3');
    if (!h) return;
    const a = h.parentElement, on = !a.classList.contains('open');
    a.classList.toggle('open', on);
    h.setAttribute('aria-expanded', String(on));
    play('page', { volume: 0.35, pitch: 1.3 });
  });
  pageEl.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.ptm-story h3')) { e.preventDefault(); e.target.click(); } });

  // flipping: the sheet turns in stepped frames, the new page is printed under it
  function flip(dir) {
    const n = page + dir;
    if (busy || n < 0 || n >= ISSUES.length) return;
    busy = true;
    play('page', { volume: 0.5 });
    sheet.classList.remove('ptm-in-l', 'ptm-in-r');
    sheet.classList.add(dir > 0 ? 'ptm-out-l' : 'ptm-out-r');
    setTimeout(() => {
      page = n;
      layout(); render();
      sheet.classList.remove('ptm-out-l', 'ptm-out-r');
      sheet.classList.add(dir > 0 ? 'ptm-in-r' : 'ptm-in-l');
      setTimeout(() => { busy = false; sheet.classList.remove('ptm-in-l', 'ptm-in-r'); }, 260);
    }, 220);
  }
  el.querySelector('.ptm-prev').addEventListener('click', () => flip(-1));
  el.querySelector('.ptm-next').addEventListener('click', () => flip(1));
  for (const b of el.querySelectorAll('.ptm-tab, .ptm-fold')) b.addEventListener('pointerenter', () => play('hover', { volume: 0.4 }));
  el.querySelector('.ptm-fold').addEventListener('click', () => close());
  el.querySelector('.ptm-dim').addEventListener('click', () => close());
  // a swipe flips too (phones)
  let sx = null;
  sheet.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  sheet.addEventListener('pointerup', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 70) flip(e.clientX < sx ? 1 : -1); sx = null; });
  const onKey = (e) => {
    if (closed) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); flip(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); flip(-1); }
  };
  window.addEventListener('keydown', onKey, true);
  const onResize = () => { layout(); render(); };
  window.addEventListener('resize', onResize);

  layout();
  loadArt().then(() => { if (!closed) render(); });
  render(); // (text first, the pictures print as soon as the art is ready)
  play('paper', { volume: 0.55 });
  requestAnimationFrame(() => el.classList.add('ptm--in'));
  pageEl.focus({ preventScroll: true });

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    play('paper', { volume: 0.45, pitch: 1.15 });
    el.classList.remove('ptm--in');
    el.classList.add('ptm--out');
    setTimeout(() => el.remove(), 380);
    try { onClose?.(); } catch (e) { console.warn(e); }
  }
  return { close, el, flip, get page() { return page; } };
}
