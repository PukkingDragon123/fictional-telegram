// CorpClock: the scary "BEAR ST. HOLDINGS" employee time clock at the top of
// the HUD. A pixel-art office wall clock (canvas), a schedule strip
// (CLOCK IN | WORK | LUNCH | WORK | OFF WORK) with a sliding NOW marker, and
// a red LED countdown that escalates from calm corporate grey to hazard-tape
// panic as 5 PM approaches, then "OFF WORK!", "FEEDING TIME" and "CLOSED".
//
//   const clock = new CorpClock(container, { onBell, sfx, icon });
//   clock.update(dt, { hour, phase, day, weekday, dayOff, secondsToRush, lunchStart, lunchEnd, open, close });
//   clock.setVisible(bool); clock.destroy();
import './corpclock.css';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (h) => {
  const t = Math.round((((h % 24) + 24) % 24) * 60);
  return `${pad2(Math.floor(t / 60) % 24)}:${pad2(t % 60)}`;
};

// ---------------------------------------------------------------- pixel glyphs
function pixSVG(rows, pal, scale = 2, cls = '') {
  const w = rows[0].length, h = rows.length;
  let r = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) if (row[x] !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[row[x]]}"/>`;
  });
  return `<svg class="${cls}" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
const PAW = ['.k.k.k.', 'kbkbkbk', '.k.k.k.', '.kkkkk.', 'kbbbbbk', 'kbbbbbk', '.kkkkk.'];
const pawSVG = (col, scale = 1, cls = 'cclock-paw') => pixSVG(PAW, { k: '#1a1420', b: col }, scale, cls);
const SMILE = pixSVG(['.kkkkk.', 'kyyyyyk', 'kykykyk', 'kyyyyyk', 'kkyyykk', 'kykkkyk', '.kkkkk.'], { k: '#1a1420', y: '#ffd23f' }, 1, 'cclock-smile');

// 7-segment LED digits (5x9 cells, 1px segments)
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
function segRect(s, x, y) {
  switch (s) {
    case 'a': return [x + 1, y, 3, 1];
    case 'b': return [x + 4, y + 1, 1, 3];
    case 'c': return [x + 4, y + 5, 1, 3];
    case 'd': return [x + 1, y + 8, 3, 1];
    case 'e': return [x, y + 5, 1, 3];
    case 'f': return [x, y + 1, 1, 3];
    default: return [x + 1, y + 4, 3, 1];
  }
}
function ledWidth(text) {
  let w = 1;
  for (const ch of text) w += ch === ':' ? 2 : 6;
  return w;
}
function drawLED(ctx, text, ghost, on, off, colon) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  let x = 1;
  for (let i = 0; i < ghost.length; i++) {
    const g = ghost[i], ch = text[i] ?? ' ';
    if (g === ':') {
      ctx.fillStyle = ch === ':' && colon ? on : off;
      ctx.fillRect(x, 3, 1, 1);
      ctx.fillRect(x, 7, 1, 1);
      x += 2;
      continue;
    }
    const segs = SEGS[ch] ?? '';
    for (const s of 'abcdefg') {
      ctx.fillStyle = segs.includes(s) ? on : off;
      const [rx, ry, rw, rh] = segRect(s, x, 1);
      ctx.fillRect(rx, ry, rw, rh);
    }
    x += 6;
  }
}

// ---------------------------------------------------------------- dial
const DIAL_THEMES = {
  day: { face: '#f6f2e6', shade: '#e2dccb', tick: '#1a1420', hand: '#1a1420', sec: '#dc3b2e', logo: '#c9c2b2', lunch: '#cfe8c0', red: '#e0483a' },
  warm: { face: '#fff4dc', shade: '#efdcb4', tick: '#1a1420', hand: '#1a1420', sec: '#e02a1e', logo: '#d8c49c', lunch: '#d8e8b8', red: '#f03020' },
  alarm: { face: '#ffe6de', shade: '#f4c4b6', tick: '#2a0c0c', hand: '#1a0808', sec: '#ff1e10', logo: '#e8b0a4', lunch: '#e8d8c0', red: '#ff2010' },
  night: { face: '#8d96ab', shade: '#747c92', tick: '#262a3a', hand: '#262a3a', sec: '#8a3a44', logo: '#7a8298', lunch: '#8d96ab', red: '#8a4450' },
};
function dialFace(N, theme) {
  const T = DIAL_THEMES[theme] || DIAL_THEMES.day;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const c = (N - 1) / 2;
  const R = c + 0.45;
  const put = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  const rimW = N >= 40 ? 3 : 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;
      if (d > R - 1) { put(x, y, '#1a1420'); continue; }
      if (d > R - 1 - rimW) {
        const l = (-dx - dy) / (Math.SQRT2 * (d || 1)); // light from the top-left
        put(x, y, l > 0.55 ? '#eceef5' : l > 0.05 ? '#aeb2c6' : l > -0.5 ? '#7c809a' : '#4e4c62');
        continue;
      }
      if (d > R - 2 - rimW) { put(x, y, '#2a2838'); continue; }
      put(x, y, d > R - 4 - rimW ? T.shade : T.face);
    }
  }
  const rf = R - 2 - rimW; // face radius
  // lunch arc (12 -> 1 o'clock) and the 5 o'clock OFF WORK marker
  for (let a = 0; a <= 30; a += 1.5) {
    const t = (a / 360) * Math.PI * 2;
    for (let r = rf - 2.6; r <= rf - 0.8; r += 0.5) put(Math.round(c + Math.sin(t) * r), Math.round(c - Math.cos(t) * r), T.lunch);
  }
  // hour ticks
  for (let h = 0; h < 12; h++) {
    const t = (h / 12) * Math.PI * 2, s = Math.sin(t), co = -Math.cos(t);
    const big = h % 3 === 0;
    const r0 = rf - 1, r1 = big ? rf - (N >= 40 ? 5 : 4) : rf - (N >= 40 ? 3 : 2);
    const col = h === 5 ? T.red : T.tick;
    for (let r = r1; r <= r0; r += 0.5) {
      const x = Math.round(c + s * r), y = Math.round(c + co * r);
      put(x, y, col);
      if (big || h === 5) { if (Math.abs(s) > Math.abs(co)) put(x, y + 1, col); else put(x + 1, y, col); }
    }
  }
  // tiny bear-paw logo under the pivot
  if (N >= 40) {
    const lx = Math.round(c) - 2, ly = Math.round(c) + 6;
    for (const [x, y] of [[0, 0], [2, 0], [4, 0], [1, 2], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [1, 4], [2, 4], [3, 4]]) put(lx + x, ly + y, T.logo);
  }
  return cv;
}
function bline(ctx, x0, y0, x1, y1, col, thick) {
  ctx.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const horiz = dx > -dy;
  let err = dx + dy, x = x0, y = y0;
  for (let i = 0; i < 64; i++) {
    ctx.fillRect(x, y, 1, 1);
    if (thick) ctx.fillRect(horiz ? x : x + 1, horiz ? y + 1 : y, 1, 1);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// ---------------------------------------------------------------- component
const STAGE_TEXT = {
  calm: 'BEARS AT WORK',
  lunch: 'LUNCH BREAK',
  amber: 'CLOCK-OUT SOON',
  red: 'BEARS INCOMING',
  critical: 'BEARS INCOMING',
  offwork: 'OFF WORK!',
  feeding: 'FEEDING TIME',
  closed: 'OFFICE CLOSED',
  morning: 'GOOD MORNING',
  sunday: 'OFFICE CLOSED',
  over: 'SHUT DOWN',
};

export class CorpClock {
  constructor(container, opts = {}) {
    this.container = container;
    this.o = opts;
    this._alive = true;
    this._visible = true;
    this._timers = new Set();
    this._last = {};
    this._faces = new Map();
    this._stage = null;
    this._prevPhase = null;
    this._lastHour = null;
    this._running = false;
    this._tickAcc = 0;
    this._beatAcc = 0;
    this._clockSec = 0;
    this._offT = 0;
    this._compact = false;
    this._build();
  }

  // ------------------------------------------------------------ DOM
  _icon(name, scale) { try { return this.o.icon ? String(this.o.icon(name, scale) || '') : ''; } catch { return ''; } }
  _sfx(name, opts) { try { this.o.sfx?.(name, opts); } catch { /* ignore */ } }

  _build() {
    const root = document.createElement('div');
    root.className = 'cclock cclock--calm';
    root.setAttribute('role', 'timer');
    root.innerHTML = `
      <div class="cclock-plaque"><i></i><span>${pawSVG('#6a4a1c')}BEAR ST. HOLDINGS</span><i></i></div>
      <div class="cclock-case">
        <div class="cclock-dialwrap"><canvas class="cclock-dial" width="43" height="43"></canvas></div>
        <div class="cclock-main">
          <div class="cclock-top">
            <span class="cclock-status"><span class="cclock-sico"></span><span class="cclock-stext">BEARS AT WORK</span></span>
            <span class="cclock-date"></span>
          </div>
          <div class="cclock-strip">
            <span class="cclock-cap cclock-in" title="09:00 clock in">IN</span>
            <span class="cclock-segs">
              <span class="cclock-seg cclock-w1"><span>WORK</span></span>
              <span class="cclock-seg cclock-lunch">${this._icon('lunch', 1)}<span>LUNCH</span></span>
              <span class="cclock-seg cclock-w2"><span>WORK</span></span>
              <span class="cclock-past"></span>
              <span class="cclock-now"><i></i></span>
              <span class="cclock-off"><span>${this._icon('sun', 1)}SUNDAY · NO BEARS</span></span>
            </span>
            <span class="cclock-cap cclock-out" title="17:00 off work">${pawSVG('#8a5a2a')}${this._icon('warning', 1)}</span>
          </div>
          <div class="cclock-ticks"><span class="t0"></span><span class="t1"></span><span class="t2"></span><span class="t3"></span></div>
          <div class="cclock-bot">
            <div class="cclock-led">
              <span class="cclock-ledl">OFF WORK IN</span>
              <span class="cclock-ledv"><canvas class="cclock-seg7" width="36" height="11"></canvas><b class="cclock-word"></b></span>
            </div>
            <button class="cclock-bell" type="button" title="Ring the bell: open early (B)">${this._icon('bell', 1)}<span>OPEN<br>EARLY</span></button>
          </div>
        </div>
        <span class="cclock-stripes" aria-hidden="true"></span>
      </div>
      <div class="cclock-tape" aria-hidden="true"><span></span></div>
      <div class="cclock-stamp" aria-hidden="true"></div>
      <div class="cclock-flash" aria-hidden="true"></div>`;
    this.container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.$dial = $('.cclock-dial');
    this.dctx = this.$dial.getContext('2d');
    this.$status = $('.cclock-status');
    this.$sico = $('.cclock-sico');
    this.$stext = $('.cclock-stext');
    this.$date = $('.cclock-date');
    this.$segs = $('.cclock-segs');
    this.$w1 = $('.cclock-w1');
    this.$lunch = $('.cclock-lunch');
    this.$w2 = $('.cclock-w2');
    this.$past = $('.cclock-past');
    this.$now = $('.cclock-now');
    this.$ticks = [...root.querySelectorAll('.cclock-ticks span')];
    this.$ledl = $('.cclock-ledl');
    this.$seg7 = $('.cclock-seg7');
    this.sctx = this.$seg7.getContext('2d');
    this.$word = $('.cclock-word');
    this.$bell = $('.cclock-bell');
    this.$tape = $('.cclock-tape span');
    this.$stamp = $('.cclock-stamp');
    this.$tape.innerHTML = Array(8).fill(`${this._icon('warning', 1)}<b>BEARS INCOMING</b>`).join('');
    this.$bell.addEventListener('click', (e) => {
      e.stopPropagation();
      try { this.o.onBell?.(); } catch (err) { console.error(err); }
    });
    // full-screen red edge vignette (outside any transformed ancestor)
    this.$vig = document.createElement('div');
    this.$vig.className = 'cclock-vignette';
    this.$vig.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.$vig);
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._measure());
      this._ro.observe(root);
    }
    this._measure();
  }

  _measure() {
    if (!this._alive) return;
    const compact = this.root.clientWidth > 0 && this.root.clientWidth < 330;
    if (compact === this._compact && this._N) return;
    this._compact = compact;
    this.root.classList.toggle('is-compact', compact);
    this._N = compact ? 31 : 43;
    this.$dial.width = this.$dial.height = this._N;
    this._dialKey = null;
    this._ledKey = null;
    this._scheduleKey = null;
    if (this._state) this._render(this._state);
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (this._alive) fn(); }, ms);
    this._timers.add(t);
  }

  _set(key, v, fn) {
    if (this._last[key] === v) return false;
    this._last[key] = v;
    fn(v);
    return true;
  }

  // ------------------------------------------------------------ public API
  update(dt, s = {}) {
    if (!this._alive) return;
    dt = Math.max(0, Math.min(0.25, +dt || 0));
    const st = {
      hour: +s.hour || 0,
      phase: s.phase || 'day',
      day: s.day ?? 1,
      weekday: s.weekday || 'Monday',
      dayOff: !!s.dayOff,
      secondsToRush: +s.secondsToRush || 0,
      l0: s.lunchStart ?? 12,
      l1: s.lunchEnd ?? 13,
      open: s.open ?? 9,
      close: s.close ?? 17,
    };
    this._state = st;
    // is the game clock moving? (paused -> the second hand stops too)
    if (dt > 0) this._running = this._lastHour !== null && st.hour !== this._lastHour;
    this._lastHour = st.hour;

    // phase transitions
    const prev = this._prevPhase;
    if (prev && prev !== st.phase) {
      if (prev === 'day' && st.phase === 'rush') this._offWork();
      if ((prev === 'morning' || prev === 'night') && st.phase === 'day' && !st.dayOff) this._clockIn();
    }
    this._prevPhase = st.phase;
    if (this._offT > 0) this._offT = Math.max(0, this._offT - dt);

    const left = st.close - st.hour;
    let stage;
    if (st.phase === 'gameover') stage = 'over';
    else if (st.phase === 'rush') stage = this._offT > 0 ? 'offwork' : 'feeding';
    else if (st.phase === 'evening' || st.phase === 'night') stage = 'closed';
    else if (st.phase === 'morning') stage = 'morning';
    else if (st.dayOff) stage = 'sunday';
    else if (left > 2) stage = 'calm';
    else if (left > 1) stage = 'amber';
    else if (left > 0.25) stage = 'red';
    else stage = 'critical';
    if (stage !== this._stage) {
      const was = this._stage;
      this._stage = stage;
      this.root.classList.remove(`cclock--${was || 'calm'}`);
      this.root.classList.add(`cclock--${stage}`);
      this.$vig.className = `cclock-vignette${stage === 'critical' ? ' is-on' : stage === 'red' ? ' is-dim' : ''}`;
      if (stage === 'offwork') this.$vig.classList.add('is-flash');
      if (was && stage === 'red' && (was === 'amber' || was === 'calm')) this._sfx('warning', { volume: 0.45 });
      this._tickAcc = 0;
      this._beatAcc = 0;
    }

    // ticking: the second hand steps every real second while the clock runs
    // (twice a second in the final 15 minutes); audible from 2 h before 5 PM
    const ticking = this._running && st.phase !== 'gameover';
    if (ticking) {
      const period = stage === 'critical' ? 0.5 : 1;
      this._tickAcc += dt;
      if (this._tickAcc >= period) {
        this._tickAcc %= period;
        this._clockSec = (this._clockSec + 1) % 60;
        if (stage === 'amber' || stage === 'red' || stage === 'critical') {
          const vol = stage === 'amber' ? 0.28 : stage === 'red' ? 0.4 : 0.55;
          this._sfx('tick', { volume: vol, pitch: this._clockSec % 2 ? 0.82 : 1 });
        }
      }
      if (stage === 'critical') {
        this._beatAcc += dt;
        if (this._beatAcc >= 0.8) { this._beatAcc -= 0.8; this._sfx('heartbeat', { volume: 0.6 }); }
      }
    }
    this._render(st);
  }

  setVisible(v) {
    this._visible = !!v;
    this.root.style.display = v ? '' : 'none';
    this.$vig.style.display = v ? '' : 'none';
  }

  destroy() {
    if (!this._alive) return;
    this._alive = false;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._ro?.disconnect();
    this.root.remove();
    this.$vig.remove();
  }

  // ------------------------------------------------------------ events
  _offWork() {
    this._offT = 2.6;
    this._sfx('alarm', { volume: 0.75 });
    this._stampShow('OFF WORK!', 'is-red', 2500);
    this._fx(this.root, 'is-alarm', 2600);
  }

  _clockIn() {
    this._stampShow('CLOCK IN', 'is-blue', 1500);
  }

  _stampShow(text, cls, ms) {
    const s = this.$stamp;
    s.textContent = text;
    s.className = 'cclock-stamp';
    void s.offsetWidth;
    s.className = `cclock-stamp is-on ${cls}`;
    this._later(() => { s.className = 'cclock-stamp'; }, ms);
  }

  _fx(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    this._later(() => el.classList.remove(cls), ms);
  }

  // ------------------------------------------------------------ render
  _render(st) {
    const stage = this._stage;
    // schedule strip geometry (lunch gets a minimum share so it stays readable)
    const skey = `${st.open}|${st.l0}|${st.l1}|${st.close}`;
    if (skey !== this._scheduleKey) {
      this._scheduleKey = skey;
      let a = Math.max(0.01, st.l0 - st.open), b = Math.max(0.01, st.l1 - st.l0), c = Math.max(0.01, st.close - st.l1);
      const tot = a + b + c;
      let pa = (a / tot) * 100, pb = (b / tot) * 100, pc = (c / tot) * 100;
      if (pb < 22) { const k = (100 - 22) / (pa + pc); pa *= k; pc *= k; pb = 22; }
      this._geo = { pa, pb, pc };
      this.$w1.style.flexBasis = `${pa}%`;
      this.$lunch.style.flexBasis = `${pb}%`;
      this.$w2.style.flexBasis = `${pc}%`;
      const hrs = [st.open, st.l0, st.l1, st.close];
      const pos = [0, pa, pa + pb, 100];
      this.$ticks.forEach((el, i) => {
        el.textContent = this._compact ? String(Math.floor(hrs[i] % 24)) : hhmm(hrs[i]);
        el.style.left = `${pos[i]}%`;
      });
    }
    // now marker
    const g = this._geo;
    const h = st.hour;
    let p;
    if (st.phase === 'rush' || st.phase === 'evening' || st.phase === 'night' || st.phase === 'gameover') p = 100;
    else if (st.phase === 'morning') p = 0;
    else if (h <= st.open) p = 0;
    else if (h < st.l0) p = ((h - st.open) / (st.l0 - st.open)) * g.pa;
    else if (h < st.l1) p = g.pa + ((h - st.l0) / (st.l1 - st.l0)) * g.pb;
    else if (h < st.close) p = g.pa + g.pb + ((h - st.l1) / (st.close - st.l1)) * g.pc;
    else p = 100;
    const pr = `${Math.round(p * 10) / 10}%`;
    this._set('now', pr, (v) => { this.$now.style.left = v; this.$past.style.width = v; });
    const lunchNow = st.phase === 'day' && !st.dayOff && h >= st.l0 && h < st.l1;
    this._set('lunch', lunchNow, (v) => this.root.classList.toggle('is-lunch', v));
    // status line + date
    const statusKey = lunchNow && (stage === 'calm' || stage === 'amber') ? 'lunch' : stage;
    this._set('status', statusKey, (k) => {
      const ico = { calm: 'briefcase', lunch: 'lunch', amber: 'clock', red: 'warning', critical: 'warning', offwork: 'alarm', feeding: 'fish', closed: 'moon', morning: 'sun', sunday: 'sun', over: 'cross' }[k];
      this.$sico.innerHTML = ico ? this._icon(ico, 1) : '';
      this.$stext.innerHTML = k === 'sunday' ? `OFFICE CLOSED ${SMILE} SUNDAY` : esc(STAGE_TEXT[k] || '');
    });
    const wd = String(st.weekday || '').slice(0, 3).toUpperCase();
    this._set('date', `${wd}|${st.day}|${this._compact}`, () => { this.$date.textContent = this._compact ? `${wd} · D${st.day}` : `${wd} · DAY ${st.day}`; });
    this._set('aria', `${stage}|${Math.floor(h * 4)}`, () => this.root.setAttribute('aria-label', `Bear St. Holdings clock: ${hhmm(h)}, ${STAGE_TEXT[stage] || ''}`));
    // bell
    this._set('bell', st.phase === 'day' && !st.dayOff, (v) => this.$bell.classList.toggle('is-hidden', !v));
    // LED
    this._renderLED(st, stage);
    // dial
    const dk = `${this._N}|${Math.floor(h * 60)}|${this._clockSec}|${this._dialTheme(stage)}`;
    if (dk !== this._dialKey) { this._dialKey = dk; this._drawDial(st, stage); }
  }

  _renderLED(st, stage) {
    let label, text = null, word = null, ghost = '8:88:88', tone = 'red';
    const secLeft = (60 - this._clockSec) % 60;
    if (stage === 'calm' || stage === 'amber' || stage === 'red' || stage === 'critical') {
      const mins = Math.max(0, Math.floor((st.close - st.hour) * 60));
      text = `${Math.min(9, Math.floor(mins / 60))}:${pad2(mins % 60)}:${pad2(mins > 0 ? secLeft : 0)}`;
      label = this._compact ? 'OFF IN' : 'OFF WORK IN';
    } else if (stage === 'offwork') {
      text = '0:00:00';
      label = 'OFF WORK';
    } else if (stage === 'feeding') {
      ghost = '88:88';
      text = hhmm(st.hour);
      label = this._compact ? 'FEEDING' : 'FEEDING TIME';
      tone = 'amber';
    } else if (stage === 'morning') {
      ghost = '88:88';
      text = hhmm(st.open);
      label = 'CLOCK IN';
      tone = 'amber';
    } else if (stage === 'sunday') {
      word = 'DAY OFF';
      label = this._compact ? 'NO BEARS' : 'BEARS AT HOME';
      tone = 'green';
    } else if (stage === 'closed') {
      word = 'CLOSED';
      label = 'OFFICE';
      tone = 'dim';
    } else {
      word = 'SHUT DOWN';
      label = 'STATUS';
    }
    const colon = stage === 'offwork' ? this._offT % 0.5 < 0.25 : this._clockSec % 2 === 0 || !this._running;
    this._set('ledl', label, (v) => { this.$ledl.textContent = v; });
    this._set('word', word || '', (v) => { this.$word.textContent = v; this.root.classList.toggle('is-word', !!v); });
    if (!word) {
      const key = `${text}|${ghost}|${tone}|${colon}`;
      if (key !== this._ledKey) {
        this._ledKey = key;
        const w = ledWidth(ghost);
        if (this.$seg7.width !== w) { this.$seg7.width = w; this.$seg7.style.width = `${w * 2}px`; }
        const on = tone === 'amber' ? '#ffc23a' : '#ff3a26';
        const off = tone === 'amber' ? '#3a2408' : '#3a0b08';
        drawLED(this.sctx, text.padStart(ghost.length, ' '), ghost, on, off, colon);
      }
    }
    this._set('tone', tone, (v) => { this.root.dataset.led = v; });
  }

  _dialTheme(stage) {
    if (stage === 'closed' || stage === 'over') return 'night';
    if (stage === 'red' || stage === 'critical' || stage === 'offwork') return 'alarm';
    if (stage === 'amber') return 'warm';
    return 'day';
  }

  _drawDial(st, stage) {
    const N = this._N, ctx = this.dctx;
    const theme = this._dialTheme(stage);
    const fk = `${N}|${theme}`;
    let face = this._faces.get(fk);
    if (!face) { face = dialFace(N, theme); this._faces.set(fk, face); }
    const T = DIAL_THEMES[theme];
    ctx.clearRect(0, 0, N, N);
    ctx.drawImage(face, 0, 0);
    const c = (N - 1) / 2;
    let h = ((st.hour % 24) + 24) % 24;
    if (stage === 'offwork') h = st.close;
    const turn = (t, len) => [Math.round(c + Math.sin(t * Math.PI * 2) * len), Math.round(c - Math.cos(t * Math.PI * 2) * len)];
    const [hx, hy] = turn((h % 12) / 12, N * 0.22);
    const [mx, my] = turn(h % 1, N * 0.34);
    bline(ctx, c, c, hx, hy, T.hand, true);
    bline(ctx, c, c, mx, my, T.hand, N >= 40);
    if (stage !== 'over') {
      const sec = this._clockSec / 60;
      const [sx, sy] = turn(sec, N * 0.39);
      const [tx, ty] = turn(sec + 0.5, N * 0.1);
      bline(ctx, tx, ty, sx, sy, T.sec, false);
    }
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(c - 1, c - 1, 3, 3);
    ctx.fillStyle = T.sec;
    ctx.fillRect(c, c, 1, 1);
  }
}
