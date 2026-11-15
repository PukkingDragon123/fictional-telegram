// [v33 title] THE POND TIMES: the title menu's newspaper of recent updates.
//
//   paperProp({ S })                 the folded paper tacked to the signpost (a canvas, pixel art)
//   openPondTimes({ sfx, onClose })  the open paper over the title: { close() }
//
// The open paper is a sheet of newsprint painted on the pixel grid (fibres, a fold cross, worn
// edges, a coffee ring), text in the game's pixel fonts (the masthead in Alagard). Two tabs:
// DEVLOG (every update, newest first: version, date, a headline, a summary, a few bullets) and
// FEEDBACK / REPORT A BUG (no backend: the report is copied to the clipboard, plus a mailto / itch.io
// link when FEEDBACK_EMAIL / ITCH_URL are set in pondTimesIssues.js; sent reports are kept in
// localStorage). Esc / tap outside / the FOLD stamp puts it away.
import './pondtimes.css';
import { anySave, lastSlot, slotMeta } from '../game/saveSlots.js';
import { ISSUES, FEEDBACK_EMAIL, ITCH_URL, GAME_VERSION } from './pondTimesIssues.js';
import { INK, cv, measure, text as bmText } from './titleArt.js';
import { GOOFY_SMALL } from './goofyFont.js';
import { pxTextCanvas } from './kinetic/pxfont.js';

const PAPER = '#ece5d2', PAPER_L = '#f6f0e0', PAPER_D = '#d9d0b8', PAPER_DD = '#bfb398', NEWS_INK = '#1f1b1d', GREY_INK = '#7a7068';
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const h1 = (n) => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ the folded paper on the menu
/** a folded newspaper tacked to the post: masthead, the newest headline, a photo, fake columns */
export function paperProp({ headline = 'DEVLOG ' + ISSUES[0].v } = {}) {
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

// ------------------------------------------------------------------ the open paper: a devlog + feedback
const REPORTS_KEY = 'tbme.feedbackSent';
function sentList() { try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]'); } catch { return []; } }
function gameInfo() {
  const info = { version: GAME_VERSION, browser: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x` };
  try { if (anySave()) { const m = slotMeta(lastSlot()); if (m) { info.day = m.day; info.coins = m.coins; } } } catch { /* no save */ }
  return info;
}

export function openPondTimes({ sfx, onClose } = {}) {
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  let tab = 'log', closed = false, kind = 'Bug';
  const el = document.createElement('div');
  el.className = 'ptm';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'The Pond Times devlog');
  el.innerHTML = `
    <div class="ptm-dim"></div>
    <div class="ptm-sheet"><div class="ptm-page" tabindex="-1"></div></div>
    <button class="ptm-fold" aria-label="Fold the paper">FOLD</button>`;
  document.body.appendChild(el);
  const sheet = el.querySelector('.ptm-sheet'), pageEl = el.querySelector('.ptm-page');
  let P = 2;
  function layout() {
    P = window.innerWidth >= 1500 && window.innerHeight >= 900 ? 3 : 2;
    const W = Math.floor(Math.min(window.innerWidth - 24, 760) / P) * P, H = Math.floor(Math.min(window.innerHeight - 40, 860) / P) * P;
    sheet.style.width = `${W}px`; sheet.style.height = `${H}px`;
    el.style.setProperty('--P', `${P}px`);
    const tex = newsprint(W / P, H / P, 3);
    sheet.style.backgroundImage = `url(${tex.toDataURL()})`;
    sheet.style.backgroundSize = `${W}px ${H}px`;
    el.classList.toggle('ptm--narrow', W < 600);
  }
  function head() {
    const mast = pxTextCanvas('The Pond Times', { font: 'alagard', color: NEWS_INK });
    const k = el.classList.contains('ptm--narrow') ? 1 : 2;
    mast.className = 'ptm-mast-c'; mast.style.width = `${mast.width * P * k / 2 * (k === 1 ? 2 : 1)}px`; mast.style.height = `${mast.height * P * k / 2 * (k === 1 ? 2 : 1)}px`;
    return mast;
  }
  function render() {
    const sent = sentList();
    pageEl.innerHTML = `
      <header class="ptm-head1"><div class="ptm-mast"></div><small>DEVLOG &amp; LETTERS TO THE EDITOR</small></header>
      <nav class="ptm-tabs" role="tablist">
        <button role="tab" data-t="log" aria-selected="${tab === 'log'}">DEVLOG</button>
        <button role="tab" data-t="fb" aria-selected="${tab === 'fb'}">FEEDBACK / REPORT A BUG</button>
      </nav>
      ${tab === 'log' ? `<div class="ptm-log">${ISSUES.map((I, i) => `
        <article class="ptm-entry">
          <div class="ptm-vh"><b class="ptm-ver">${esc(I.v)}</b><span>${esc(I.date)}</span>${i === 0 ? '<em class="ptm-new">NEW</em>' : ''}</div>
          <h3>${esc(I.title)}</h3>
          <p class="ptm-lede">${esc(I.sum)}</p>
          <ul>${I.list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </article>`).join('')}</div>` : `
      <form class="ptm-fb" autocomplete="off">
        <p class="ptm-lede">Found a bug? Have an idea? Love a fish? Write to the editor.</p>
        <div class="ptm-kinds" role="radiogroup" aria-label="Type">
          ${['Bug', 'Idea', 'Love it'].map((k) => `<button type="button" role="radio" data-k="${k}" aria-checked="${k === kind}">${k.toUpperCase()}</button>`).join('')}
        </div>
        <textarea class="ptm-text" rows="6" maxlength="2000" placeholder="What happened? What did you expect?"></textarea>
        <label class="ptm-check"><input type="checkbox" checked> <span class="ptm-box"></span> Include game info (version, browser, screen, day, coins)</label>
        <div class="ptm-actions">
          <button type="submit" class="ptm-send">COPY REPORT</button>
          ${FEEDBACK_EMAIL ? '<a class="ptm-link ptm-mail" href="#">Send by email</a>' : ''}
          ${ITCH_URL ? `<a class="ptm-link" href="${esc(ITCH_URL)}" target="_blank" rel="noopener">Open itch.io page</a>` : ''}
        </div>
        <p class="ptm-status" role="status"></p>
        ${sent.length ? `<div class="ptm-sent"><b>SENT</b><ul>${sent.slice(-5).reverse().map((r) => `<li><span class="ptm-stamp">SENT</span> ${esc(r.kind)}: ${esc(r.text.slice(0, 60))}${r.text.length > 60 ? '...' : ''}</li>`).join('')}</ul></div>` : ''}
      </form>`}`;
    pageEl.querySelector('.ptm-mast').appendChild(head());
    pageEl.querySelectorAll('.ptm-tabs button').forEach((b) => b.addEventListener('click', () => { if (tab !== b.dataset.t) { tab = b.dataset.t; play('page', { volume: 0.5 }); sheet.classList.add('ptm-in-r'); setTimeout(() => sheet.classList.remove('ptm-in-r'), 280); render(); } }));
    const form = pageEl.querySelector('.ptm-fb');
    if (!form) return;
    form.querySelectorAll('.ptm-kinds button').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; form.querySelectorAll('.ptm-kinds button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); play('click', { volume: 0.4 }); }));
    const report = () => {
      const txt = form.querySelector('.ptm-text').value.trim();
      const lines = [`[The Bear Must Eat] ${kind.toUpperCase()}`, '', txt || '(no text)'];
      if (form.querySelector('.ptm-check input').checked) {
        const I = gameInfo();
        lines.push('', '--- game info ---', `Version: ${I.version}`, `Browser: ${I.browser}`, `Screen: ${I.screen}`);
        if (I.day != null) lines.push(`Day: ${I.day}`, `Coins: ${I.coins}`);
      }
      return { txt, body: lines.join('\n') };
    };
    const status = form.querySelector('.ptm-status');
    const remember = (txt) => { try { const l = sentList(); l.push({ kind, text: txt, at: Date.now() }); localStorage.setItem(REPORTS_KEY, JSON.stringify(l.slice(-30))); } catch { /* storage off */ } };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { txt, body } = report();
      if (!txt) { status.textContent = 'Write something first!'; play('error', { volume: 0.4 }); return; }
      let ok = false;
      try { await navigator.clipboard.writeText(body); ok = true; } catch {
        try { const t = document.createElement('textarea'); t.value = body; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch { ok = false; }
      }
      remember(txt);
      play('stamp', { volume: 0.5 });
      render();
      const st = pageEl.querySelector('.ptm-status');
      if (st) st.textContent = ok ? `Copied! ${FEEDBACK_EMAIL ? 'Send it by email' : ITCH_URL ? 'Paste it in the itch.io comments' : 'Paste it wherever you talk to us'}. Thank you!` : 'Could not copy: select the text and copy it by hand.';
      if (!ok) { const t = pageEl.querySelector('.ptm-text'); if (t) { t.value = body; t.select(); } }
    });
    form.querySelector('.ptm-mail')?.addEventListener('click', (e) => {
      e.preventDefault();
      const { txt, body } = report();
      if (txt) remember(txt);
      location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('The Bear Must Eat: ' + kind)}&body=${encodeURIComponent(body)}`;
    });
  }
  el.querySelector('.ptm-fold').addEventListener('click', () => close());
  el.querySelector('.ptm-fold').addEventListener('pointerenter', () => play('hover', { volume: 0.4 }));
  el.querySelector('.ptm-dim').addEventListener('click', () => close());
  const onKey = (e) => { if (!closed && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);
  const onResize = () => { layout(); render(); };
  window.addEventListener('resize', onResize);
  layout(); render();
  play('paper', { volume: 0.55 });
  requestAnimationFrame(() => el.classList.add('ptm--in'));
  pageEl.focus({ preventScroll: true });
  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    play('paper', { volume: 0.45, pitch: 1.15 });
    el.classList.remove('ptm--in'); el.classList.add('ptm--out');
    setTimeout(() => el.remove(), 380);
    try { onClose?.(); } catch (e) { console.warn(e); }
  }
  return { close, el, tab: (t) => { tab = t; render(); } };
}
