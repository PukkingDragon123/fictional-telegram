// [v26 evening] Reynard's home PC: a chunky beige "REYNARD 386SX" with a CRT, running
// BOOKS.EXE in an old blue-screen OS. Shows a day as graphs (money in vs out by category,
// coins over the last days, the rating line, bears / fish / extras), the full ledger
// (line items, reviews, stickers, grade), and in browse mode the history (pick a day,
// all-time graphs). Pure DOM + small pixel canvases; no game imports.
//
//   const pc = openHomePC(root, {
//     mode: 'evening' | 'browse', history: [entry...] (oldest first), index (selected entry),
//     sfx(name, opts), icon(name, scale) -> html,
//     onBed(), onClose(), onPage(name),
//   });
//   pc.highlight('out:builds' | 'in:bills' | 'net' | 'coins' | 'rating' | 'bears' | 'fish' | 'extra', sec)
//   pc.glitch(k)        the screen jolts / tears (desk slam)
//   pc.page('day' | 'ledger' | 'all'); pc.select(index)
//   pc.monitorRect() / pc.freeRect()   CSS px rects (to frame Reynard next to it)
//   pc.close() -> Promise (CRT power-off), pc.destroy()
//
// entry: see src/game/ext/homePC.js (record) for the fields.
import './homepc.css';
import { hasSprite, spriteImg } from './sprites.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');
const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const WD3 = (w) => String(w || '').slice(0, 3).toUpperCase();
const GRADE_COL = { 'A+': '#5aec6a', A: '#5aec6a', B: '#5ae0e8', C: '#ffe85a', D: '#ff9a4a', F: '#ff5a5a' };
const PAL = { bg: '#1c2aa0', ink: '#0a0c2a', grey: '#b8b8c8', white: '#f4f4ff', cyan: '#5ae0e8', yellow: '#ffe85a', green: '#5aec6a', red: '#ff5a5a', orange: '#ff9a4a', dim: '#5a66c8', magenta: '#f07af0' };

function ico(name, scale = 1, cls = '') {
  if (!name || !hasSprite(name)) return '';
  return spriteImg(name, scale, cls);
}

// ------------------------------------------------------------------ tiny pixel charts
function pxCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.className = 'hpc-cv';
  return c;
}
function line(g, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  g.fillStyle = col;
  for (let n = 0; n < 400; n++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
// line chart: values (nulls skipped), k = 0..1 drawn so far, opts { lo, hi, col, fill, mark, zero, ticks }
function drawLine(cv, vals, k, o = {}) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const pad = { l: 2, r: 4, t: 4, b: 3 };
  const vs = vals.filter((v) => v != null && Number.isFinite(v));
  let lo = o.lo ?? Math.min(...vs, 0), hi = o.hi ?? Math.max(...vs, 1);
  if (hi - lo < 1e-6) hi = lo + 1;
  const X = (i) => pad.l + (vals.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (vals.length - 1)) * (W - pad.l - pad.r));
  const Y = (v) => H - pad.b - ((v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  // grid: dotted rows
  g.fillStyle = 'rgba(160,170,255,0.22)';
  for (let r = 0; r <= 4; r++) { const y = Math.round(pad.t + (r / 4) * (H - pad.t - pad.b)); for (let x = 0; x < W; x += 3) g.fillRect(x, y, 1, 1); }
  if (o.zero && lo < 0 && hi > 0) { g.fillStyle = 'rgba(244,244,255,0.5)'; const y = Math.round(Y(0)); for (let x = 0; x < W; x += 2) g.fillRect(x, y, 1, 1); }
  const n = vals.length;
  const upto = k * (n - 1);
  const pts = [];
  for (let i = 0; i < n; i++) if (vals[i] != null && Number.isFinite(vals[i])) pts.push([i, X(i), Y(vals[i])]);
  // dithered fill under the line
  if (o.fill) {
    g.fillStyle = o.fill;
    for (let j = 1; j < pts.length; j++) {
      const [i0, x0, y0] = pts[j - 1], [i1, x1, y1] = pts[j];
      if (i0 > upto) break;
      const xe = i1 > upto ? x0 + (x1 - x0) * ((upto - i0) / (i1 - i0)) : x1;
      for (let x = Math.ceil(x0); x <= xe; x++) {
        const y = y0 + (y1 - y0) * ((x - x0) / Math.max(1e-6, x1 - x0));
        for (let yy = Math.ceil(y) + 1; yy < H - pad.b; yy++) if ((x + yy) % 2 === 0) g.fillRect(x, yy, 1, 1);
      }
    }
  }
  for (let j = 1; j < pts.length; j++) {
    const [i0, x0, y0] = pts[j - 1], [i1, x1, y1] = pts[j];
    if (i0 > upto) break;
    const f = i1 > upto ? (upto - i0) / (i1 - i0) : 1;
    line(g, x0, y0, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, o.col || PAL.yellow);
    line(g, x0, y0 + 1, x0 + (x1 - x0) * f, y0 + 1 + (y1 - y0) * f, o.col2 || o.col || PAL.yellow);
  }
  for (const [i, x, y] of pts) {
    if (i > upto + 1e-6) break;
    const last = i === n - 1;
    g.fillStyle = last && o.mark ? o.mark : o.col || PAL.yellow;
    const r = last ? 2 : 1;
    g.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2 + 1, r * 2 + 1);
    if (last) { g.fillStyle = PAL.ink; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  }
  return { lo, hi, X, Y };
}
// column chart (net per day): positive green up, negative red down from a zero line
function drawCols(cv, vals, k, sel = -1) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const n = Math.max(1, vals.length);
  const m = Math.max(1, ...vals.map((v) => Math.abs(v || 0)));
  const z = Math.round(H / 2);
  g.fillStyle = 'rgba(244,244,255,0.45)';
  for (let x = 0; x < W; x += 2) g.fillRect(x, z, 1, 1);
  const cw = W / n;
  vals.forEach((v, i) => {
    const h = Math.round(((Math.abs(v || 0) / m) * (H / 2 - 2)) * clamp(k * 1.4 - i / n * 0.4, 0, 1));
    const x0 = Math.round(i * cw + cw * 0.18), w = Math.max(1, Math.round(cw * 0.64));
    g.fillStyle = v >= 0 ? PAL.green : PAL.red;
    if (v >= 0) g.fillRect(x0, z - h, w, h); else g.fillRect(x0, z + 1, w, h);
    if (i === sel) { g.fillStyle = PAL.white; g.fillRect(x0, v >= 0 ? z - h - 2 : z + h + 2, w, 1); }
  });
}
// bear pictograms: one little head per bear served, coloured by how it went
const BEAR_PX = ['.k.k.', 'kbbbk', 'kebek', 'kbnbk', '.kkk.'];
function drawBears(cv, served, happy, rampages) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const n = Math.min(served + rampages, 24);
  const per = Math.max(1, Math.floor((W + 1) / 6));
  for (let i = 0; i < n; i++) {
    const kind = i < rampages ? 'r' : i < rampages + happy ? 'h' : 'o';
    const col = kind === 'r' ? PAL.red : kind === 'h' ? PAL.green : PAL.grey;
    const ox = (i % per) * 6, oy = Math.floor(i / per) * 6;
    if (oy + 5 > H) break;
    BEAR_PX.forEach((row, y) => { for (let x = 0; x < 5; x++) { const ch = row[x]; if (ch === '.') continue; g.fillStyle = ch === 'k' ? PAL.ink : ch === 'e' ? PAL.ink : ch === 'n' ? '#3a2a20' : col; g.fillRect(ox + x, oy + y, 1, 1); } });
  }
}

// ------------------------------------------------------------------ the PC
class HomePC {
  constructor(root, opts) {
    this.root = root;
    this.o = opts;
    this.mode = opts.mode || 'browse';
    this.hist = (opts.history || []).slice();
    this.index = clamp(opts.index ?? this.hist.length - 1, 0, Math.max(0, this.hist.length - 1));
    this.pg = 'day';
    this.raf = 0;
    this.anims = [];
    this.closed = false;
    this._build();
    this._layout();
    this._onResize = () => this._layout();
    addEventListener('resize', this._onResize);
    this._onKey = (e) => this._key(e);
    addEventListener('keydown', this._onKey, true);
    this.boot();
  }

  get entry() { return this.hist[this.index] || null; }
  sfx(n, o) { try { this.o.sfx?.(n, o); } catch { /* optional */ } }

  // ---------------------------------------------------------------- DOM
  _build() {
    const el = document.createElement('div');
    el.className = 'hpc';
    el.dataset.mode = this.mode;
    el.innerHTML = `
      <div class="hpc-mon">
        <div class="hpc-glass">
          <div class="hpc-screen">
            <div class="hpc-menu"></div>
            <div class="hpc-body"></div>
            <div class="hpc-status"></div>
          </div>
          <div class="hpc-tear"></div>
          <div class="hpc-scan"></div>
          <div class="hpc-glare"></div>
          <div class="hpc-beam"></div>
        </div>
        <div class="hpc-chin">
          <span class="hpc-brand">REYNARD <b>386</b>SX</span>
          <span class="hpc-note">BUY LOW. SELL FISH.</span>
          <span class="hpc-knobs"><i></i><i></i></span>
          <i class="hpc-led"></i>
          <button class="hpc-pwr" data-a="power" aria-label="Power"></button>
        </div>
      </div>`;
    this.root.appendChild(el);
    this.el = el;
    this.$mon = el.querySelector('.hpc-mon');
    this.$screen = el.querySelector('.hpc-screen');
    this.$menu = el.querySelector('.hpc-menu');
    this.$body = el.querySelector('.hpc-body');
    this.$status = el.querySelector('.hpc-status');
    el.addEventListener('click', (e) => this._click(e));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    let lastHover = 0;
    el.addEventListener('pointerover', (e) => {
      const b = e.target.closest?.('[data-a]');
      if (!b || b.contains(e.relatedTarget)) return;
      const now = performance.now();
      if (now - lastHover > 80) { lastHover = now; this.sfx('tick', { volume: 0.12 }); }
    });
  }

  _layout() {
    const vw = innerWidth, vh = innerHeight;
    const wide = vw >= 720 && vw / vh >= 1.05;
    let w, h, x, y;
    if (wide) {
      w = Math.min(Math.round(vw * 0.6), 860);
      h = Math.min(vh - 40, Math.round(w * 0.84));
      x = Math.max(14, Math.round(vw * 0.03));
      y = Math.round((vh - h) / 2);
    } else {
      w = vw - 16;
      h = Math.min(Math.round(vh * 0.64), Math.round(w * 1.55));
      x = 8; y = 8;
    }
    this.wide = wide;
    this.rect = { x, y, w, h };
    const s = this.$mon.style;
    s.left = `${x}px`; s.top = `${y}px`; s.width = `${w}px`; s.height = `${h}px`;
    this.el.classList.toggle('hpc-narrow', !wide);
    this.el.classList.toggle('hpc-tiny', w < 430);
  }

  monitorRect() { return { ...this.rect }; }
  freeRect() {
    const vw = innerWidth, vh = innerHeight, r = this.rect;
    if (this.wide) return { x: r.x + r.w, y: 0, w: vw - r.x - r.w, h: vh };
    return { x: 0, y: r.y + r.h, w: vw, h: vh - r.y - r.h };
  }

  // ---------------------------------------------------------------- flow
  boot() {
    this.el.classList.add('hpc-boot');
    this.sfx('crt_on', { volume: 0.4 });
    this.render();
    clearTimeout(this._bootTO);
    this._bootTO = setTimeout(() => { this.el.classList.remove('hpc-boot'); this.el.classList.add('hpc-on'); }, 620);
  }

  close() {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    this.sfx('crt_off', { volume: 0.4 });
    this.el.classList.add('hpc-off');
    return new Promise((res) => setTimeout(() => { this.destroy(); res(); }, 560));
  }

  destroy() {
    this.closed = true;
    cancelAnimationFrame(this.raf); this.raf = 0;
    clearTimeout(this._bootTO); clearTimeout(this._hiTO); clearTimeout(this._glTO);
    removeEventListener('resize', this._onResize);
    removeEventListener('keydown', this._onKey, true);
    this.el?.remove();
  }

  page(name) {
    if (!['day', 'ledger', 'all'].includes(name) || name === this.pg) return;
    this.pg = name;
    this.sfx('beep', { volume: 0.25, pitch: name === 'ledger' ? 1.2 : 1 });
    this.render();
    this.o.onPage?.(name);
  }

  select(i) {
    i = clamp(i, 0, this.hist.length - 1);
    if (i === this.index) return;
    this.index = i;
    this.sfx('chip', { volume: 0.3 });
    this.render();
  }

  // ---------------------------------------------------------------- input
  _click(e) {
    const t = e.target.closest('[data-a]');
    if (!t || this.closed) return;
    const a = t.dataset.a;
    e.stopPropagation();
    if (a === 'detail') { this.sfx('click', { volume: 0.35 }); this.page('ledger'); }
    else if (a === 'graphs') { this.sfx('click', { volume: 0.35 }); this.page('day'); }
    else if (a === 'all') { this.sfx('click', { volume: 0.35 }); this.page('all'); }
    else if (a === 'bed') { this.sfx('click', { volume: 0.4 }); this.o.onBed?.(); }
    else if (a === 'close' || a === 'power') { this.sfx('click', { volume: 0.35 }); this.o.onClose?.(); }
    else if (a === 'prev') this.select(this.index - 1);
    else if (a === 'next') this.select(this.index + 1);
    else if (a === 'pick') { this.select(+t.dataset.i); if (this.pg === 'all') this.page('day'); }
  }

  _key(e) {
    if (this.closed) return;
    const k = e.key;
    let used = true;
    if (k === 'Escape') { if (this.pg !== 'day') this.page('day'); else this.o.onClose?.(); }
    else if (k === 'F2' || k === 'd' || k === 'D') this.page(this.pg === 'ledger' ? 'day' : 'ledger');
    else if ((k === 'F10' || k === 'Enter') && this.mode === 'evening') this.o.onBed?.();
    else if (k === 'ArrowLeft' && this.mode === 'browse') this.select(this.index - 1);
    else if (k === 'ArrowRight' && this.mode === 'browse') this.select(this.index + 1);
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }

  // ---------------------------------------------------------------- effects
  highlight(key, sec = 2.2) {
    if (!key || this.closed) return;
    for (const n of this.el.querySelectorAll('.hpc-hi')) n.classList.remove('hpc-hi');
    const n = this.el.querySelector(`[data-k="${CSS.escape(key)}"]`);
    if (!n) return;
    n.classList.add('hpc-hi');
    n.scrollIntoView?.({ block: 'nearest' });
    clearTimeout(this._hiTO);
    this._hiTO = setTimeout(() => n.classList.remove('hpc-hi'), sec * 1000);
  }

  glitch(k = 1) {
    if (this.closed) return;
    this.el.classList.remove('hpc-glitch'); void this.el.offsetWidth;
    this.el.classList.add('hpc-glitch');
    this.el.style.setProperty('--gk', String(k));
    clearTimeout(this._glTO);
    this._glTO = setTimeout(() => this.el.classList.remove('hpc-glitch'), 480);
  }

  // ---------------------------------------------------------------- render
  render() {
    const e = this.entry;
    this._menu(e);
    this._status();
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.anims = [];
    if (!e) { this.$body.innerHTML = `<div class="hpc-empty">NO RECORDS YET.<br>COME BACK AFTER YOUR FIRST DAY OF BUSINESS.</div>`; return; }
    if (this.pg === 'ledger') this._ledger(e);
    else if (this.pg === 'all') this._all();
    else this._day(e);
    this.$body.scrollTop = 0;
    this._loop();
  }

  _menu(e) {
    const browse = this.mode === 'browse';
    const day = e ? `DAY ${e.d} · ${WD3(e.wd)}` : 'NO DATA';
    const tabs = browse
      ? `<span class="hpc-tabs"><button data-a="graphs" class="${this.pg === 'day' ? 'on' : ''}"><u>D</u>AY</button><button data-a="detail" class="${this.pg === 'ledger' ? 'on' : ''}"><u>L</u>EDGER</button><button data-a="all" class="${this.pg === 'all' ? 'on' : ''}"><u>A</u>LL-TIME</button></span>`
      : `<span class="hpc-title">NIGHTLY REPORT</span>`;
    const pick = browse && e
      ? `<span class="hpc-pick"><button data-a="prev" ${this.index <= 0 ? 'disabled' : ''} aria-label="Previous day">◀</button><b>${day}</b><button data-a="next" ${this.index >= this.hist.length - 1 ? 'disabled' : ''} aria-label="Next day">▶</button></span>`
      : `<b class="hpc-day">${day}</b>`;
    this.$menu.innerHTML = `<span class="hpc-logo">≡ BOOKS.EXE</span>${tabs}${pick}`;
  }

  _status() {
    const btn = (a, label, cls = '') => `<button class="hpc-btn ${cls}" data-a="${a}"><span>${label}</span></button>`;
    let h = '';
    if (this.mode === 'evening') {
      h = this.pg === 'ledger' ? btn('graphs', '◀ Back to graphs') : btn('detail', 'View full detail');
      h += btn('bed', 'Go to bed', 'go');
    } else {
      h = this.pg === 'ledger' ? btn('graphs', '◀ Graphs') : btn('detail', 'Full detail');
      h += btn('close', 'Log off', 'go');
    }
    this.$status.innerHTML = h;
  }

  // a framed DOS panel
  panel(title, inner, { k = '', cls = '' } = {}) {
    return `<section class="hpc-pan ${cls}" ${k ? `data-k="${esc(k)}"` : ''}><h3><span>${esc(title)}</span></h3>${inner}</section>`;
  }

  _day(e) {
    const ins = (e.inc || []).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
    const outs = (e.exp || []).filter((c) => c.v > 0).sort((a, b) => b.v - a.v);
    const max = Math.max(1, ...ins.map((c) => c.v), ...outs.map((c) => c.v));
    const row = (c, kind) => `<div class="hpc-row ${kind}" data-k="${kind}:${esc(c.k)}">
        <span class="hpc-lab">${ico(c.icon, 1)}<em>${esc(c.label)}</em></span>
        <span class="hpc-bar"><i style="--w:${Math.max(2, Math.round((c.v / max) * 100))}%"></i></span>
        <b>${kind === 'in' ? '+' : '−'}${fmt(c.v)}</b></div>`;
    const rows = [...ins.map((c) => row(c, 'in')), ...outs.map((c) => row(c, 'out'))].join('') ||
      `<div class="hpc-quiet">${e.off ? 'DAY OFF. NO BEARS, NO BILLS.' : 'NOT A SINGLE COIN MOVED TODAY.'}</div>`;
    const net = e.net || 0;
    const money = this.panel('MONEY IN / OUT', `<div class="hpc-rows">${rows}</div>
      <div class="hpc-net ${net >= 0 ? 'up' : 'down'}" data-k="net"><span>NET</span><b data-count="${net}">${sgn(0)}</b><i>${net >= 0 ? '▲' : '▼'}</i></div>`, { k: 'money', cls: 'hpc-money' });
    // coins + rating over the last days
    const last = this.hist.slice(Math.max(0, this.index - 13), this.index + 1);
    const coins = this.panel('COINS', `<div class="hpc-chart" data-chart="coins"></div><div class="hpc-axis"><span>D${last[0]?.d ?? e.d}</span><b>${fmt(e.coins)}</b><span>D${e.d}</span></div>`, { k: 'coins', cls: 'hpc-coins' });
    const dr = Math.round(((e.r1 ?? 0) - (e.r0 ?? 0)) * 10) / 10;
    const stars = (v) => { let s = ''; for (let i = 1; i <= 5; i++) s += v >= i - 0.25 ? '★' : '☆'; return s; };
    const rating = this.panel('RATING', `<div class="hpc-chart" data-chart="rating"></div><div class="hpc-axis"><span class="hpc-stars">${stars(e.r1 ?? 0)}</span><b class="${dr > 0 ? 'up' : dr < 0 ? 'down' : ''}">${(e.r1 ?? 0).toFixed(1)} ${dr ? `(${dr > 0 ? '+' : '−'}${Math.abs(dr).toFixed(1)})` : ''}</b></div>`, { k: 'rating', cls: 'hpc-rating' });
    // tiles
    const bears = this.panel('BEARS', e.off ? '<div class="hpc-quiet">SUNDAY. CLOSED.</div>' : `<div class="hpc-pict" data-chart="bears"></div>
      <div class="hpc-kv"><span>Served</span><b>${fmt(e.served)}</b><span class="g">Happy</span><b class="g">${fmt(e.happy)}</b><span class="r">Rampages</span><b class="r">${fmt(e.rampages)}</b></div>`, { k: 'bears', cls: 'hpc-tile' });
    const fishMax = Math.max(1, e.eaten || 0, e.born || 0);
    const fish = this.panel('FISH', `<div class="hpc-mini"><span>Eaten</span><i class="r" style="--w:${Math.round(((e.eaten || 0) / fishMax) * 100)}%"></i><b>${fmt(e.eaten)}</b></div>
      <div class="hpc-mini"><span>Born</span><i class="g" style="--w:${Math.round(((e.born || 0) / fishMax) * 100)}%"></i><b>${fmt(e.born)}</b></div>
      <div class="hpc-kv one"><span>In the pond</span><b>${fmt(e.fish)}${e.cap ? ` / ${fmt(e.cap)}` : ''}</b></div>`, { k: 'fish', cls: 'hpc-tile' });
    const ex = [];
    if (e.fac != null) ex.push(`<span>Resort</span><b class="${e.fac > 0 ? 'g' : ''}">${e.fac > 0 ? '+' : ''}${fmt(e.fac)}</b>`);
    if (e.events) ex.push(`<span>Events</span><b>${fmt(e.events.length)}${e.events.some((v) => v.ok === false) ? ` <em class="r">(${e.events.filter((v) => v.ok === false).length} bad)</em>` : ''}</b>`);
    if (e.staff) ex.push(`<span>Staff</span><b>${fmt(e.staff.n)}${e.staff.hurt ? ` <em class="r">(${e.staff.hurt} hurt)</em>` : ''}</b>`);
    if (e.blood) ex.push('<span class="r">Blood moon</span><b class="r">survived</b>');
    if (!ex.length) ex.push(`<span>Stars avg</span><b>${(e.stars || 0).toFixed(1)}</b>`, `<span>Coins</span><b>${fmt(e.coins)}</b>`);
    const extra = this.panel(e.fac != null || e.events || e.staff ? 'RESORT & CREW' : 'MISC', `<div class="hpc-kv">${ex.join('')}</div>`, { k: 'extra', cls: 'hpc-tile' });
    const grade = `<div class="hpc-grade" data-k="grade" style="--gc:${GRADE_COL[e.grade] || PAL.white}"><span>GRADE</span><b>${esc(e.grade || '?')}</b></div>`;
    this.$body.innerHTML = `<div class="hpc-day-grid">${money}<div class="hpc-side">${grade}${coins}${rating}</div>${bears}${fish}${extra}</div>`;
    // charts
    const cc = this.$body.querySelector('[data-chart="coins"]');
    const rc = this.$body.querySelector('[data-chart="rating"]');
    const bc = this.$body.querySelector('[data-chart="bears"]');
    const cv1 = pxCanvas(96, 30), cv2 = pxCanvas(96, 30);
    cc.appendChild(cv1); rc.appendChild(cv2);
    const coinVals = last.map((x) => x.coins), rateVals = last.map((x) => x.r1);
    this.anims.push({ dur: 0.9, fn: (k) => drawLine(cv1, coinVals, k, { col: PAL.yellow, fill: 'rgba(255,232,90,0.35)', mark: PAL.white }) });
    this.anims.push({ dur: 0.9, delay: 0.15, fn: (k) => drawLine(cv2, rateVals, k, { lo: 0, hi: 5, col: PAL.cyan, fill: 'rgba(90,224,232,0.3)', mark: dr < 0 ? PAL.red : PAL.white }) });
    if (bc) { const cv3 = pxCanvas(60, 12); bc.appendChild(cv3); drawBears(cv3, e.served || 0, e.happy || 0, e.rampages || 0); }
    // bars grow + the net counts up
    requestAnimationFrame(() => this.$body.querySelector('.hpc-day-grid')?.classList.add('grown'));
    const nb = this.$body.querySelector('[data-count]');
    if (nb) this.anims.push({ dur: 0.8, delay: 0.2, fn: (k) => { nb.textContent = sgn(Math.round(net * k)); } });
  }

  _ledger(e) {
    const lines = [...(e.inc || []).filter((c) => c.v > 0).map((c) => ({ ...c, s: 1 })), ...(e.exp || []).filter((c) => c.v > 0).map((c) => ({ ...c, s: -1 }))];
    const tr = lines.map((c) => `<tr class="${c.s > 0 ? 'in' : 'out'}"><td>${ico(c.icon, 1)}</td><td>${esc(c.label)}</td><td>${c.s > 0 ? '+' : '−'}${fmt(c.v)}</td></tr>`).join('')
      || '<tr><td></td><td>A quiet day at the pond</td><td>0</td></tr>';
    const stars = (n) => '★'.repeat(clamp(Math.round(n), 0, 5)) + '☆'.repeat(5 - clamp(Math.round(n), 0, 5));
    const revs = (e.reviews || []).map((r) => `<li class="${r.s >= 4 ? 'g' : r.s <= 2 ? 'r' : ''}"><span class="hpc-rs">${stars(r.s)}</span><q>${esc(r.t || '...')}</q><cite>${esc(r.n || 'A bear')}${r.dept ? `, ${esc(r.dept)}` : ''}</cite></li>`).join('');
    const stick = (e.stickers || []).map((s) => `<span class="hpc-stk">${ico(s.id, 2)}<em>${esc(s.caption)}</em></span>`).join('');
    const ev = (e.events || []).map((v) => `<li class="${v.ok === false ? 'r' : 'g'}">${ico(v.icon, 1)}${esc(v.name)}${v.note ? ` <em>${esc(v.note)}</em>` : ''}</li>`).join('');
    const disc = (e.disc || []).length ? `<p class="hpc-disc">New species: <b>${(e.disc || []).map(esc).join(', ')}</b></p>` : '';
    this.$body.innerHTML = `<div class="hpc-ledger">
      ${this.panel(`LEDGER · DAY ${e.d} · ${String(e.wd || '').toUpperCase()}`, `<table class="hpc-tab">${tr}
        <tr class="sum"><td></td><td>Money in</td><td>+${fmt(e.inTotal)}</td></tr>
        <tr class="sum"><td></td><td>Money out</td><td>−${fmt(e.outTotal)}</td></tr>
        <tr class="net ${e.net >= 0 ? 'in' : 'out'}"><td></td><td>NET</td><td>${sgn(e.net)}</td></tr></table>
        <div class="hpc-kv wide"><span>Coins at closing</span><b>${fmt(e.coins)}</b><span>Rating</span><b>${(e.r0 ?? 0).toFixed(1)} → ${(e.r1 ?? 0).toFixed(1)}</b><span>Bears served</span><b>${fmt(e.served)} (${fmt(e.happy)} happy, ${fmt(e.rampages)} rampages)</b><span>Avg stars</span><b>${(e.stars || 0).toFixed(1)}</b><span>Fish eaten / born</span><b>${fmt(e.eaten)} / ${fmt(e.born)}</b>${e.fac != null ? `<span>Resort income</span><b>+${fmt(e.fac)}</b>` : ''}</div>${disc}`, { cls: 'hpc-lines' })}
      <div class="hpc-ledger-side">
        <div class="hpc-grade big" style="--gc:${GRADE_COL[e.grade] || PAL.white}"><span>GRADE</span><b>${esc(e.grade || '?')}</b>${e.comment ? `<q>${esc(e.comment)}</q>` : ''}</div>
        ${stick ? this.panel('STICKERS', `<div class="hpc-stks">${stick}</div>`) : ''}
        ${ev ? this.panel('EVENTS', `<ul class="hpc-evs">${ev}</ul>`) : ''}
      </div>
      ${this.panel('REVIEWS', revs ? `<ul class="hpc-revs">${revs}</ul>` : '<div class="hpc-quiet">NO REVIEWS. NO BEARS. NO PROBLEMS?</div>', { cls: 'hpc-reviews' })}
    </div>`;
  }

  _all() {
    const H = this.hist;
    const nets = H.map((x) => x.net || 0);
    const best = H.reduce((a, b) => (!a || (b.net || 0) > (a.net || 0) ? b : a), null);
    const worst = H.reduce((a, b) => (!a || (b.net || 0) < (a.net || 0) ? b : a), null);
    const totIn = H.reduce((s, x) => s + (x.inTotal || 0), 0), totOut = H.reduce((s, x) => s + (x.outTotal || 0), 0);
    const served = H.reduce((s, x) => s + (x.served || 0), 0), ramp = H.reduce((s, x) => s + (x.rampages || 0), 0);
    const gp = { 'A+': 4.3, A: 4, B: 3, C: 2, D: 1, F: 0 };
    const gpa = H.length ? H.reduce((s, x) => s + (gp[x.grade] ?? 2), 0) / H.length : 0;
    const strip = H.map((x, i) => `<button class="hpc-chip ${i === this.index ? 'on' : ''} ${(x.net || 0) >= 0 ? 'up' : 'down'}" data-a="pick" data-i="${i}" title="Day ${x.d}"><b>${esc(x.grade || '?')}</b><span>${x.d}</span></button>`).join('');
    this.$body.innerHTML = `<div class="hpc-all">
      ${this.panel('NET PER DAY', `<div class="hpc-chart wide" data-chart="nets"></div>`, { k: 'nets', cls: 'hpc-wide' })}
      ${this.panel('COINS, ALL TIME', `<div class="hpc-chart wide" data-chart="coins"></div><div class="hpc-axis"><span>D${H[0]?.d ?? 1}</span><b>${fmt(H[H.length - 1]?.coins)}</b><span>D${H[H.length - 1]?.d ?? 1}</span></div>`, { cls: 'hpc-half' })}
      ${this.panel('RATING, ALL TIME', `<div class="hpc-chart wide" data-chart="rating"></div><div class="hpc-axis"><span>0</span><b>${(H[H.length - 1]?.r1 ?? 0).toFixed(1)} ★</b><span>5</span></div>`, { cls: 'hpc-half' })}
      ${this.panel('RECORDS', `<div class="hpc-kv wide">
        <span>Days on the books</span><b>${fmt(H.length)}</b>
        <span>Money in / out</span><b><em class="g">+${fmt(totIn)}</em> / <em class="r">−${fmt(totOut)}</em></b>
        <span>Best day</span><b class="g">${best ? `Day ${best.d}: ${sgn(best.net)}` : '-'}</b>
        <span>Worst day</span><b class="r">${worst ? `Day ${worst.d}: ${sgn(worst.net)}` : '-'}</b>
        <span>Bears served</span><b>${fmt(served)} (${fmt(ramp)} rampages)</b>
        <span>Grade average</span><b>${gpa >= 3.5 ? 'A' : gpa >= 2.5 ? 'B' : gpa >= 1.5 ? 'C' : gpa >= 0.5 ? 'D' : 'F'}</b></div>`, { cls: 'hpc-wide' })}
      ${this.panel('PICK A DAY', `<div class="hpc-strip">${strip}</div>`, { cls: 'hpc-wide' })}
    </div>`;
    const put = (sel, w, h) => { const c = pxCanvas(w, h); this.$body.querySelector(sel)?.appendChild(c); return c; };
    const n1 = put('[data-chart="nets"]', 200, 44), c1 = put('[data-chart="coins"]', 120, 44), r1 = put('[data-chart="rating"]', 120, 44);
    this.anims.push({ dur: 0.9, fn: (k) => drawCols(n1, nets, k, this.index) });
    this.anims.push({ dur: 1.0, fn: (k) => drawLine(c1, H.map((x) => x.coins), k, { col: PAL.yellow, fill: 'rgba(255,232,90,0.35)', mark: PAL.white }) });
    this.anims.push({ dur: 1.0, delay: 0.1, fn: (k) => drawLine(r1, H.map((x) => x.r1), k, { lo: 0, hi: 5, col: PAL.cyan, fill: 'rgba(90,224,232,0.3)', mark: PAL.white }) });
    this.$body.querySelector('.hpc-chip.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }

  _loop() {
    const t0 = performance.now();
    const step = (now) => {
      if (this.closed) return;
      const t = (now - t0) / 1000;
      let live = false;
      for (const a of this.anims) {
        const u = clamp((t - (a.delay || 0)) / a.dur, 0, 1);
        if (a.u !== u) { a.u = u; try { a.fn(1 - (1 - u) * (1 - u)); } catch (err) { console.warn('homepc chart', err); a.u = 1; } }
        if (u < 1) live = true;
      }
      this.raf = live ? requestAnimationFrame(step) : 0;
    };
    this.raf = requestAnimationFrame(step);
  }
}

export function openHomePC(root, opts = {}) {
  return new HomePC(root || document.body, opts);
}
