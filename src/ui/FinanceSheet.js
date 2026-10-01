// End-of-day ledger: a clipboard with handwritten lines, a grade stamp,
// stickers and Reynard's signature.
//
//   showFinanceSheet(root, report, opts) -> Promise<void>
import './ceremony.css';
import { hasSprite } from './sprites.js';
import {
  esc, clamp, fmtInt, mkSfx, mkIcon, frameCls, glyph, bindInput, Seq, shake, PixelFX,
  gridCanvas, outline, spriteCopy, spriteSize, rng,
} from './EggHatch.js';

const GRADES = {
  'A+': { id: 'Aplus', col: '#2d8a3c', sfx: 'grade_good', stamp2: 'approved', fox: 'laugh' },
  A: { id: 'A', col: '#2d8a3c', sfx: 'grade_good', stamp2: 'approved', fox: 'greedy' },
  B: { id: 'B', col: '#2c5cb0', sfx: 'grade_good', stamp2: 'paid', fox: 'smug' },
  C: { id: 'C', col: '#b06a18', sfx: null, stamp2: 'paid', fox: 'wink' },
  D: { id: 'D', col: '#c0392b', sfx: 'grade_bad', stamp2: 'seeme', fox: 'worried' },
  F: { id: 'F', col: '#c0392b', sfx: 'grade_bad', stamp2: 'seeme', fox: 'angry' },
};
const STAMP2 = {
  approved: { text: 'APPROVED', col: '#2d8a3c' },
  paid: { text: 'PAID', col: '#c0392b' },
  seeme: { text: 'SEE ME', col: '#c0392b' },
  overdue: { text: 'OVERDUE', col: '#c0392b' },
};
// fallback looks for sticker ids that sprites.js may not have yet
const STICKER_FB = {
  sticker_star: { icon: 'star', bg: '#ffd23f' }, sticker_smiley: { text: ':)', bg: '#ffe066' },
  sticker_paw: { icon: 'bear_happy', bg: '#e8c89a' }, sticker_fish: { icon: 'fish', bg: '#9ad8ff' },
  sticker_heart: { icon: 'heart', bg: '#ffb0c0' }, sticker_maple: { icon: 'maple', bg: '#ffc2a0' },
  sticker_wow: { text: 'WOW!', bg: '#ff7ac0', burst: true }, sticker_good: { text: 'GOOD!', bg: '#7cd05a', burst: true },
  sticker_thumb: { icon: 'hand', bg: '#a8dcff' }, sticker_crown: { icon: 'trophy', bg: '#ffe27a' },
  sticker_rainbow: { text: '', bg: 'rainbow' }, sticker_coffee: { text: 'Zzz', bg: '#c8a070' },
  sticker_bear: { icon: 'bear', bg: '#e0b888' }, sticker_egg: { icon: 'egg', bg: '#fff3c0' },
};
const IDLE_STAMP_MS = 4000, IDLE_DONE_MS = 60000;

export function showFinanceSheet(root, report, opts = {}) {
  if (!root) return Promise.resolve();
  return new Promise((resolve) => {
    let s;
    try { s = new Ledger(root, report || {}, opts, resolve); s.start(); } catch (e) {
      console.error('[FinanceSheet]', e);
      try { s && s.destroy(); } catch { /* ignore */ }
      resolve();
    }
  });
}

// ---------------------------------------------------------------- pixel bits
const px = (rows, pal) => rows.map((r) => [...r].map((c) => (c === '.' ? null : pal[c] || c)));
function penCanvas(scale) {
  const rows = [
    '.............kk',
    '............kRk',
    '...........kRrk',
    '..........kRrk.',
    '.........kyyk..',
    '........kRrk...',
    '.......kRrk....',
    '......kRrk.....',
    '.....kRrk......',
    '....kssk.......',
    '...kSsk........',
    '..kwSk.........',
    '.kwk...........',
    'kk.............',
  ];
  const g = px(rows, { k: '#1a1420', R: '#c24a5c', r: '#7a2236', y: '#ffd23f', s: '#c8ccdc', S: '#8a8ea6', w: '#ffffff' });
  return gridCanvas(g, scale);
}
function clipCanvas(scale) {
  const W = 40, H = 17;
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  for (let y = 0; y < 7; y++) for (let x = 12; x < 28; x++) if (!(y === 0 && (x === 12 || x === 27))) put(x, y, y < 2 ? '#eef0f8' : y < 4 ? '#c8ccdc' : '#a4a8be');
  for (let y = 2; y < 5; y++) for (let x = 16; x < 24; x++) g[y][x] = null;
  for (let y = 6; y < H; y++) for (let x = 1; x < W - 1; x++) {
    if ((y === 6 || y === H - 1) && (x === 1 || x === W - 2)) continue;
    put(x, y, y < 8 ? '#f4f6fc' : y < 11 ? '#cfd3e2' : y < 14 ? '#a0a4bc' : '#737790');
  }
  for (let x = 3; x < W - 3; x++) put(x, 14, '#5e6278');
  for (const rx of [5, 33]) { put(rx, 10, '#ffffff'); put(rx + 1, 10, '#6e7288'); put(rx, 11, '#6e7288'); put(rx + 1, 11, '#3a3e52'); }
  return gridCanvas(outline(g), scale);
}
function paperclipCanvas(scale) {
  const rows = [
    '..kkkk..',
    '.k....k.',
    'k..kk..k',
    'k.k..k.k',
    'k.k..k.k',
    'k.k..k.k',
    'k.k..k.k',
    'k.k..k.k',
    'k.k..k.k',
    'k.k....k',
    'k.k....k',
    'k.k....k',
    'k......k',
    '.k....k.',
    '..kkkk..',
  ];
  return gridCanvas(px(rows, { k: '#8a8ea6' }), scale);
}
function coffeeCanvas(scale) {
  const N = 30, c = N / 2 - 0.5;
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  const R = rng(77);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const rr = 12 + Math.sin(a * 3) * 0.6;
    if (d > rr - 1.6 && d < rr + 0.6) {
      const al = 0.16 + 0.1 * Math.sin(a * 2 + 1) + (R() < 0.15 ? -0.08 : 0);
      if (al > 0.05 && !(a > 0.6 && a < 1.3)) g[y][x] = `rgba(130,78,36,${al.toFixed(2)})`;
    } else if (d < rr - 1.6 && R() < 0.05) g[y][x] = 'rgba(130,78,36,0.05)';
  }
  return gridCanvas(g, scale);
}
let speckURL = null;
function speckleMask() {
  if (speckURL) return speckURL;
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = '#000';
  x.fillRect(0, 0, 48, 48);
  const R = rng(9);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 150; i++) { const s = R() < 0.8 ? 1 : 2; x.fillRect((R() * 48) | 0, (R() * 48) | 0, s, s); }
  speckURL = `url(${c.toDataURL()})`;
  return speckURL;
}

// signature: a loopy "Reynard" + flourish, in a 210x66 box
const SIG_PATH = [
  'M 12 54 C 13 42, 15 24, 19 9',
  'C 44 1, 52 27, 21 29',
  'C 31 31, 33 47, 45 47',
  'C 51 46, 57 39, 53 36 C 48 34, 46 46, 57 47',
  'C 61 47, 63 38, 63 37 C 63 45, 67 48, 71 39 C 71 51, 71 62, 64 62 C 59 62, 61 53, 73 48',
  'C 77 45, 79 38, 79 38 C 79 43, 79 47, 80 47 C 81 41, 85 37, 88 38 C 90 39, 89 45, 91 47',
  'C 95 48, 99 41, 102 38 C 97 35, 92 43, 96 46 C 99 48, 102 43, 103 38 C 102 43, 103 47, 107 47',
  'C 109 46, 110 39, 111 38 C 112 41, 114 39, 117 39 C 118 42, 118 46, 121 47',
  'C 125 48, 129 41, 132 39 C 127 35, 122 43, 126 46 C 129 48, 133 43, 136 11 C 136 25, 134 41, 140 47',
  'C 158 54, 124 61, 66 60 C 44 60, 28 59, 22 63',
].join(' ');
const SIG_DOT = 'M 157 22 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0';

// doodles in the margin (blue ballpoint, crisp)
const DOODLES = {
  fish: '<path d="M3 12 C 7 5, 15 5, 19 12 C 15 19, 7 19, 3 12 Z M19 12 L 25 7 L 24 12 L 25 17 Z"/><path d="M7 11 h1.5 v1.5 h-1.5z" fill="currentColor"/>',
  star: '<path d="M14 3 L 17 10 L 25 11 L 19 16 L 21 24 L 14 20 L 7 24 L 9 16 L 3 11 L 11 10 Z"/>',
  heart: '<path d="M14 23 C 4 16, 3 9, 8 6 C 11 4, 13 6, 14 9 C 15 6, 17 4, 20 6 C 25 9, 24 16, 14 23 Z"/>',
  spiral: '<path d="M14 14 C 14 12, 17 12, 17 14 C 17 18, 11 18, 11 14 C 11 8, 20 8, 20 14 C 20 21, 8 21, 8 14 C 8 5, 23 5, 23 14"/>',
  coins: '<path d="M6 20 h14 M6 17 h14 M6 14 h14 M7 14 v9 M19 14 v9 M7 23 h12"/><path d="M13 3 v8 M10 5 C 10 3, 16 3, 16 5 C 16 7, 10 7, 10 9 C 10 11, 16 11, 16 9"/>',
  bear: '<path d="M8 9 C 4 9, 4 4, 8 5 M20 9 C 24 9, 24 4, 20 5 M14 5 C 6 5, 5 12, 6 16 C 8 23, 20 23, 22 16 C 23 12, 22 5, 14 5 Z M11 12 h1 M17 12 h1 M12 17 C 13 18, 15 18, 16 17"/>',
};

class Ledger {
  constructor(root, report, opts, resolve) {
    this.root = root;
    this.r = report;
    this.opts = opts;
    this.resolve = resolve;
    this.sfx = mkSfx(opts);
    this.icon = mkIcon(opts);
    this.auto = opts.autoAdvance === false ? 0 : Number(opts.autoAdvance) || 1;
    this.seq = new Seq();
    this.state = 'init';
    this.speed = 1;
    this.penN = 0;
    this.penX = 0; this.penY = 0;
    this.grade = GRADES[String(report.grade || 'C').toUpperCase()] ? String(report.grade).toUpperCase() : 'C';
    this.G = GRADES[this.grade];
    this.graceUntil = 0;
  }

  // ------------------------------------------------------------------ DOM
  hw(parts, cls = '') {
    const R = Math.random;
    const ch = (c) => `<i class="lc" style="--r:${((R() * 2 - 1) * 5).toFixed(1)}deg;--y:${((R() * 2 - 1) * 1.2).toFixed(1)}px">${esc(c)}</i>`;
    let out = '';
    for (const p of [].concat(parts)) {
      if (p == null || p === '') continue;
      if (typeof p === 'object') { out += `<i class="lc lx">${p.html}</i>`; continue; }
      for (const w of String(p).split(/( +)/)) {
        if (!w) continue;
        out += /^ +$/.test(w) ? ' ' : `<span class="lw">${[...w].map(ch).join('')}</span>`;
      }
    }
    return `<span class="ledger-hw ${cls}">${out}</span>`;
  }

  money(n, kind) {
    const v = Math.round(Number(n) || 0);
    if (kind === 'note' && !v) return '-';
    const sign = v > 0 ? '+' : v < 0 ? '−' : '';
    return `${sign}${fmtInt(v)}`;
  }

  build() {
    const r = this.r;
    const lines = Array.isArray(r.lines) ? r.lines : [];
    const net = Number.isFinite(Number(r.net)) ? Number(r.net) : lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    this.net = net;
    const rowsH = lines.map((l, i) => {
      const amt = Number(l.amount) || 0;
      const kind = l.kind || (amt < 0 ? 'expense' : amt > 0 ? 'income' : 'note');
      return `<div class="ledger-row k-${esc(kind)}" data-i="${i}">
        <span class="ledger-ico">${l.icon ? this.icon(l.icon, 2) : ''}</span>
        ${this.hw(l.label || '', 'ledger-lbl')}
        <span class="ledger-dots"></span>
        ${this.hw(this.money(amt, kind), `ledger-amt ${kind === 'note' ? 'note' : amt < 0 ? 'neg' : 'pos'}`)}
      </div>`;
    }).join('');
    const fmt1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '-');
    const rb = Number(r.ratingBefore), ra = Number(r.ratingAfter);
    const up = ra >= rb;
    const stat = (icon, label, val, cls = '') => `<div class="ledger-stat ${cls}"><span class="ledger-sico">${this.icon(icon, 1)}</span><span class="ledger-slbl">${label}</span>${val}</div>`;
    const statsH = [
      stat('bear', 'Bears served', this.hw(String(r.served ?? 0), 'ledger-sval')),
      stat('bear_happy', 'Happy bears', this.hw(String(r.happy ?? 0), 'ledger-sval')),
      stat('bear_angry', 'Rampages', this.hw(String(r.rampages ?? 0), `ledger-sval ${Number(r.rampages) > 0 ? 'neg' : 'pos'}`)),
      stat('fish', 'Fish eaten', this.hw(String(r.fishEaten ?? 0), 'ledger-sval')),
      stat('egg', 'Fish born', this.hw(String(r.fishBorn ?? 0), 'ledger-sval')),
      stat('star', 'Avg. stars', this.hw([fmt1(r.avgStars), ' ', { html: this.icon('star', 1) }], 'ledger-sval')),
      Number.isFinite(rb) && Number.isFinite(ra)
        ? stat('chart', 'Rating', this.hw([rb.toFixed(1), ' ', { html: glyph('arrow', 2) }, ' ', ra.toFixed(1), ' ', { html: `<span class="${up ? 'pos' : 'neg'}">${glyph(up ? 'up' : 'down', 2)}</span>` }], `ledger-sval ${up ? 'pos' : 'neg'}`), 'wide')
        : '',
    ].join('');
    const stickers = (Array.isArray(r.stickers) ? r.stickers : []).filter((s) => s && s.id).slice(0, 5);
    this.stickers = stickers;
    const stkH = stickers.map((s, i) => `<div class="ledger-stk" data-i="${i}"><div class="ledger-stkimg">${this.stickerHTML(s.id)}</div>${s.caption ? this.hw(s.caption, 'ledger-cap') : ''}</div>`).join('');
    const doodles = ['fish', 'star', 'coins', 'heart', 'bear', 'spiral'];
    const R = rng((Number(r.day) || 1) * 31);
    const dd = doodles.sort(() => R() - 0.5).slice(0, 4).map((k, i) => `<svg class="ledger-doodle d${i}" viewBox="0 0 28 28" width="28" height="28" style="--r:${((R() * 2 - 1) * 16).toFixed(0)}deg" shape-rendering="crispEdges" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">${DOODLES[k]}</svg>`).join('');
    const netLbl = net >= 0 ? 'Net profit' : 'Net loss';
    const day = r.day != null ? `Day ${r.day}` : 'Today';
    const date = r.weekday ? `${day} (${r.weekday})` : day;
    const s2 = this.pickStamp2(net);
    return `
      <div class="ledger-back"></div>
      <div class="ledger-stage">
        <div class="ledger-board ${frameCls('wood')}">
          <div class="ledger-clipw"></div>
          <div class="ledger-pclip"></div>
          <div class="ledger-paper ${frameCls('paper_ledger')}">
            <div class="ledger-sheet">
              <div class="ledger-deco"><i class="ledger-coffee"></i>${dd}</div>
              <header class="ledger-head">
                <div class="ledger-h1"><span class="ledger-logo">${this.icon('fox_smug', 1)}</span><span>DAILY LEDGER</span><span class="ledger-no">No. ${String(r.day ?? 0).padStart(3, '0')}</span></div>
                <div class="ledger-h2"><span class="ledger-firm">Reynard's Fish Emporium</span><span class="ledger-sep">·</span><span class="ledger-date">${this.hw(date, 'ledger-dt')}</span></div>
              </header>
              <div class="ledger-cols"><span>Item</span><span>Amount</span></div>
              <div class="ledger-lines">${rowsH || `<div class="ledger-row k-note">${this.hw('A quiet day. Nothing to report.', 'ledger-lbl')}</div>`}</div>
              <div class="ledger-total ${net < 0 ? 'neg' : 'pos'}">
                <i class="ledger-rule"></i>
                ${this.hw(netLbl, 'ledger-tlbl')}
                <span class="ledger-tamt">${this.hw(this.money(net), `ledger-amt big ${net < 0 ? 'neg' : 'pos'}`)}<i class="ledger-ul u1"></i><i class="ledger-ul u2"></i></span>
                ${s2 ? `<div class="ledger-stamp2" data-k="${s2}">${this.stamp2HTML(s2)}</div>` : ''}
              </div>
              <div class="ledger-mid">
                <div class="ledger-stats">${statsH}</div>
                <div class="ledger-grade">
                  <div class="ledger-glbl">GRADE</div>
                  <div class="ledger-gslot"><div class="ledger-stamp">${this.stampHTML()}</div></div>
                  <div class="ledger-tapstamp"><span>Tap to<br>stamp!</span></div>
                </div>
                <div class="ledger-stkrow">${stkH}</div>
              </div>
              <div class="ledger-foot">
                ${r.comment ? `<div class="ledger-note ${frameCls('sticky_note')}"><i class="ledger-tape"></i><span class="ledger-nfox">${this.icon(`fox_${this.G.fox}`, 1)}</span>${this.hw(r.comment, 'ledger-ntext')}</div>` : '<div class="ledger-note empty"></div>'}
                <div class="ledger-sig">
                  <svg class="ledger-sigsvg" viewBox="0 0 170 66" width="170" height="66" fill="none" stroke-linecap="round" stroke-linejoin="round"><path class="ledger-sigp" d="${SIG_PATH}"/><path class="ledger-sigd" d="${SIG_DOT}"/></svg>
                  <div class="ledger-sigline">Reynard, Proprietor</div>
                </div>
              </div>
              <canvas class="ledger-ink"></canvas>
              <div class="ledger-pen"></div>
            </div>
          </div>
          <div class="ledger-gowrap"><button type="button" class="cer-btn big ledger-go ${frameCls('button_green')}" data-cer-own>Good night ${glyph('arrow', 2)}</button></div>
        </div>
      </div>
      <canvas class="ledger-fx"></canvas>
      <div class="ledger-hint">Tap to write faster</div>`;
  }

  pickStamp2(net) {
    const o = this.r.stamp2;
    if (o === false || o === null) return null;
    if (o && STAMP2[o]) return o;
    if (this.grade === 'D' || this.grade === 'F') return 'seeme';
    if (net < 0) return 'overdue';
    return this.G.stamp2;
  }

  stampHTML() {
    const name = `stamp_${this.G.id}`;
    if (hasSprite(name)) {
      const { w, h } = spriteSize(name);
      const s = clamp(Math.round(92 / Math.max(w, h)), 1, 8);
      return this.icon(name, s);
    }
    return `<div class="ledger-stampfb" style="--sc:${this.G.col};--speck:${speckleMask()}"><i class="ring"></i><b>${esc(this.grade)}</b><small>GRADE</small></div>`;
  }

  stamp2HTML(k) {
    const name = `stamp_${k}`;
    if (hasSprite(name)) {
      const { w, h } = spriteSize(name);
      const s = clamp(Math.round(88 / Math.max(w, h)), 1, 6);
      return this.icon(name, s);
    }
    const S = STAMP2[k];
    return `<div class="ledger-stamp2fb" style="--sc:${S.col};--speck:${speckleMask()}">${esc(S.text)}</div>`;
  }

  stickerHTML(id) {
    if (hasSprite(id)) {
      const { w, h } = spriteSize(id);
      const s = clamp(Math.round(58 / Math.max(w, h)), 1, 6);
      return this.icon(id, s);
    }
    const f = STICKER_FB[id] || { icon: 'sparkle', bg: '#ffe27a' };
    const inner = f.icon ? this.icon(f.icon, 3) : `<b>${esc(f.text || '')}</b>`;
    return `<div class="ledger-stkfb ${f.burst ? 'burst' : ''} ${f.bg === 'rainbow' ? 'rainbow' : ''}" style="--sb:${f.bg}">${inner}</div>`;
  }

  start() {
    const el = document.createElement('div');
    el.className = 'ledger-ov cer-ov';
    el.tabIndex = -1;
    el.dataset.grade = this.G.id;
    el.innerHTML = this.build();
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = {
      stage: q('.ledger-stage'), board: q('.ledger-board'), paper: q('.ledger-paper'), sheet: q('.ledger-sheet'),
      pen: q('.ledger-pen'), ink: q('.ledger-ink'), fx: q('.ledger-fx'), hint: q('.ledger-hint'),
      grade: q('.ledger-grade'), stamp: q('.ledger-stamp'), tapstamp: q('.ledger-tapstamp'), stamp2: q('.ledger-stamp2'),
      total: q('.ledger-total'), go: q('.ledger-go'), gowrap: q('.ledger-gowrap'), note: q('.ledger-note'),
      sig: q('.ledger-sig'), sigp: q('.ledger-sigp'), sigd: q('.ledger-sigd'), sigsvg: q('.ledger-sigsvg'),
    };
    // pixel art bits
    const pen = penCanvas(3);
    pen.className = 'px';
    this.penH = pen.height;
    this.$.pen.appendChild(hasSprite('pen') ? spriteCopy('pen', 3) : pen);
    this.penH = this.$.pen.firstChild.height || this.penH;
    const clip = clipCanvas(3); clip.className = 'px ledger-clip';
    q('.ledger-clipw').appendChild(clip);
    const pc = hasSprite('paperclip') ? spriteCopy('paperclip', 3) : paperclipCanvas(3);
    pc.className = 'px';
    q('.ledger-pclip').appendChild(pc);
    const cof = coffeeCanvas(3); cof.className = 'px';
    q('.ledger-coffee').appendChild(cof);
    this.root.appendChild(el);
    this.fx = new PixelFX(this.$.fx);
    this.unbind = bindInput(el, { onTap: () => this.tap(), onSkip: () => this.skipAll() });
    this.$.go.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('click'); this.close(); });
    this.onResize = () => { this.fx.resize(); this.sizeInk(); };
    window.addEventListener('resize', this.onResize);
    if (this.opts.signal && this.opts.signal.addEventListener) this.opts.signal.addEventListener('abort', () => this.close(true), { once: true });
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    this.sizeInk();
    this.last = performance.now();
    const tick = (t) => {
      if (this.state === 'dead') return;
      const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      this.fx.step(dt); this.fx.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    requestAnimationFrame(() => el.classList.add('on'));
    this.run();
  }

  sizeInk() {
    const c = this.$.ink, s = this.$.sheet;
    const w = s.scrollWidth, h = s.scrollHeight;
    if (c.width === w && c.height === h) return;
    let old = null;
    if (c.width && c.height) { old = document.createElement('canvas'); old.width = c.width; old.height = c.height; old.getContext('2d').drawImage(c, 0, 0); }
    c.width = w; c.height = h;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    if (old) c.getContext('2d').drawImage(old, 0, 0);
  }

  // ------------------------------------------------------------------ input
  tap() {
    const now = performance.now();
    switch (this.state) {
      case 'intro': this.seq.fast(); break;
      case 'writing':
        if (this.speed < 4) { this.speed = 4; this.$.hint.textContent = 'Tap again to finish'; }
        else { this.seq.fast(); this.$.hint.classList.remove('on'); }
        break;
      case 'await': this.stampNow(); break;
      case 'deco': if (now > this.graceUntil) this.seq.fast(); break;
      case 'done': if (now > this.graceUntil) this.close(); break;
      default: break;
    }
  }

  skipAll() {
    if (this.state === 'done') { this.close(); return; }
    this.skipping = true;
    this.seq.fast();
    if (this.state === 'await') this.stampNow();
  }

  // ------------------------------------------------------------------ pen
  penTo(el, dx = 1) {
    const pr = this.$.sheet.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    this.movePen(r.right - pr.left + dx, r.bottom - pr.top - 3);
  }
  movePen(x, y, ms) {
    const dist = Math.hypot(x - this.penX, y - this.penY);
    const t = this.seq.ff ? 0 : ms ?? (dist > 50 ? Math.min(260, 90 + dist * 0.4) : 45);
    const p = this.$.pen;
    p.style.transition = `transform ${t}ms ${dist > 50 ? 'cubic-bezier(.45,0,.2,1)' : 'linear'}`;
    p.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - this.penH)}px)`;
    this.penX = x; this.penY = y;
  }
  penRest() {
    const s = this.$.sheet;
    this.$.pen.classList.remove('writing');
    this.$.pen.classList.add('rest');
    const g = this.$.grade.getBoundingClientRect(), sr = s.getBoundingClientRect();
    const x = g.left - sr.left + g.width * 0.3, y = g.bottom - sr.top + 44;
    this.movePen(x, y, 380);
  }
  follow(el) {
    const p = this.$.paper;
    if (p.scrollHeight <= p.clientHeight + 2) return;
    const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.bottom > pr.bottom - 24) p.scrollTo({ top: p.scrollTop + (r.bottom - pr.bottom) + 60, behavior: this.seq.ff ? 'auto' : 'smooth' });
    else if (r.top < pr.top + 10) p.scrollTo({ top: p.scrollTop - (pr.top - r.top) - 40, behavior: this.seq.ff ? 'auto' : 'smooth' });
  }

  async write(el, { slow = 1, pen = true } = {}) {
    if (!el) return;
    const chars = el.querySelectorAll('.lc');
    this.$.pen.classList.add('writing');
    this.$.pen.classList.remove('rest');
    for (const c of chars) {
      if (this.state === 'dead') return;
      c.classList.add('on');
      if (this.seq.ff) continue;
      if (pen) this.penTo(c);
      if (++this.penN % 3 === 0) this.sfx('pen', { pitch: 0.85 + Math.random() * 0.4, volume: 0.6 });
      await this.seq.sleep((this.charMs * slow) / this.speed);
    }
    if (this.seq.ff) chars.forEach((c) => c.classList.add('on'));
  }

  // ------------------------------------------------------------------ sequence
  async run() {
    const seq = this.seq, $ = this.$;
    this.state = 'intro';
    const nChars = this.el.querySelectorAll('.ledger-head .lc, .ledger-lines .lc, .ledger-total .lc, .ledger-stats .lc').length;
    this.charMs = clamp(6500 / Math.max(1, nChars), 14, 42);
    this.sfx('paper');
    seq.anim($.board, [
      { transform: 'translateY(110vh) rotate(-8deg)' },
      { transform: 'translateY(-14px) rotate(1.2deg)', offset: 0.75 },
      { transform: 'translateY(0) rotate(0deg)' },
    ], { duration: 620, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    // the pen flies in from the right
    const sw = $.sheet.clientWidth;
    this.penX = sw + 120; this.penY = 60;
    $.pen.style.transform = `translate(${sw + 120}px, ${60 - this.penH}px)`;
    await seq.sleep(640);
    if (this.state === 'dead') return;
    this.sizeInk();
    this.state = 'writing';
    seq.slow();
    if (!this.skipping) $.hint.classList.add('on');
    // date
    await this.write(this.el.querySelector('.ledger-date'), { slow: 1.1 });
    // lines
    const rows = [...this.el.querySelectorAll('.ledger-lines .ledger-row')];
    for (const row of rows) {
      if (this.state === 'dead') return;
      this.follow(row);
      const ico = row.querySelector('.ledger-ico');
      ico.classList.add('on');
      if (!seq.ff) seq.anim(ico, [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.35) rotate(8deg)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
      await this.write(row.querySelector('.ledger-lbl'));
      row.querySelector('.ledger-dots').classList.add('on');
      await this.write(row.querySelector('.ledger-amt'), { slow: 1.4 });
      await seq.sleep(90 / this.speed);
    }
    // total
    this.follow($.total);
    $.total.classList.add('ruled');
    this.sfx('pen', { pitch: 0.7 });
    await seq.sleep(260 / this.speed);
    await this.write($.total.querySelector('.ledger-tlbl'));
    await this.write($.total.querySelector('.ledger-amt'), { slow: 1.7 });
    const amtEl = $.total.querySelector('.ledger-tamt');
    for (const u of amtEl.querySelectorAll('.ledger-ul')) {
      const r = u.getBoundingClientRect(), pr = $.sheet.getBoundingClientRect();
      if (!seq.ff) { this.movePen(r.left - pr.left, r.bottom - pr.top, 120); await seq.sleep(130 / this.speed); }
      u.classList.add('on');
      if (!seq.ff) {
        this.sfx('pen', { pitch: 0.6, volume: 0.8 });
        this.movePen(r.right - pr.left, r.bottom - pr.top, 240 / this.speed);
        await seq.sleep(260 / this.speed);
      }
    }
    // stats
    const stats = [...this.el.querySelectorAll('.ledger-stat')];
    for (const st of stats) {
      this.follow(st);
      st.classList.add('on');
      await this.write(st.querySelector('.ledger-sval'), { slow: 1.2 });
      await seq.sleep(60 / this.speed);
    }
    if (this.state === 'dead') return;
    // waiting for the stamp
    seq.slow();
    $.hint.classList.remove('on');
    this.penRest();
    this.follow($.grade);
    this.state = 'await';
    $.grade.classList.add('ready');
    if (this.skipping) { this.stampNow(); return; }
    this.awaitT = seq.after(IDLE_STAMP_MS, () => this.stampNow());
  }

  async stampNow() {
    if (this.state !== 'await') return;
    const seq = this.seq, $ = this.$;
    this.state = 'stamping';
    if (this.awaitT) seq.cancel(this.awaitT);
    $.grade.classList.remove('ready');
    const tilt = -6 - Math.random() * 9;
    $.stamp.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
    $.stamp.classList.add('on');
    const a = seq.anim($.stamp, [
      { transform: `translate(-50%, -50%) translateY(-150px) scale(2.8) rotate(${tilt - 18}deg)`, opacity: 0 },
      { transform: `translate(-50%, -50%) translateY(-60px) scale(1.9) rotate(${tilt - 6}deg)`, opacity: 0.9, offset: 0.45 },
      { transform: `translate(-50%, -50%) scale(1.22, 0.78) rotate(${tilt}deg)`, opacity: 1, offset: 0.62 },
      { transform: `translate(-50%, -50%) scale(0.94, 1.06) rotate(${tilt}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(-50%, -50%) scale(1) rotate(${tilt}deg)`, opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' });
    await seq.sleep(520 * 0.62);
    if (this.state === 'dead') return;
    this.impact($.stamp, this.G.col, 1);
    if (this.G.sfx) seq.after(260, () => this.sfx(this.G.sfx));
    await seq.sleep(520 * 0.38 + 120);
    if (a) { try { a.finish(); a.commitStyles(); a.cancel(); } catch { /* keep the filled animation */ } }
    if (this.state === 'dead') return;
    this.deco();
  }

  impact(el, col, power) {
    const $ = this.$;
    this.sfx('stamp', { pitch: power < 1 ? 1.2 : 1 });
    if (!this.seq.ff) {
      shake(this.seq, $.stage, 10 * power, 380 * power);
      this.seq.anim($.board, [{ transform: 'scale(1)' }, { transform: `scale(${1 - 0.012 * power}, ${1 - 0.02 * power})` }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    }
    // ink splatter on the paper
    const sr = $.sheet.getBoundingClientRect(), r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - sr.left, cy = r.top + r.height / 2 - sr.top;
    const ctx = $.ink.getContext('2d');
    const R = Math.random;
    ctx.fillStyle = col;
    const n = Math.round(26 * power);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = (r.width * 0.42) + R() * r.width * 0.55 * power;
      const s = R() < 0.25 ? 4 : 2;
      ctx.globalAlpha = 0.45 + R() * 0.45;
      ctx.fillRect(Math.round((cx + Math.cos(a) * d) / 2) * 2, Math.round((cy + Math.sin(a) * d) / 2) * 2, s, s);
      if (R() < 0.3) { ctx.fillRect(Math.round((cx + Math.cos(a) * (d + 5)) / 2) * 2, Math.round((cy + Math.sin(a) * (d + 5)) / 2) * 2, 2, 2); }
    }
    ctx.globalAlpha = 1;
    if (!this.seq.ff) {
      this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, Math.round(18 * power), { colors: [col], speed: 520 * power, g: 900, drag: 3, life: 0.45, jitter: r.width * 0.6 });
      if (this.G.id === 'Aplus' && power >= 1) this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, 26, { type: 'spark', colors: ['#ffe27a', '#ffffff'], speed: 520, g: 120, drag: 2, life: 0.9, size: [1, 2], jitter: r.width * 0.5 });
    }
  }

  async deco() {
    const seq = this.seq, $ = this.$;
    this.state = 'deco';
    this.graceUntil = performance.now() + 300;
    // secondary stamp (PAID / APPROVED / SEE ME ...)
    if ($.stamp2) {
      await seq.sleep(220);
      $.stamp2.classList.add('on');
      const t2 = 10 + Math.random() * 8;
      seq.anim($.stamp2, [
        { transform: `scale(2.4) rotate(${t2 + 12}deg)`, opacity: 0 },
        { transform: `scale(0.9, 1.1) rotate(${t2}deg)`, opacity: 1, offset: 0.6 },
        { transform: `scale(1) rotate(${t2}deg)`, opacity: 1 },
      ], { duration: 320, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' });
      await seq.sleep(190);
      if (this.state === 'dead') return;
      this.impact($.stamp2, getComputedStyle($.stamp2).getPropertyValue('--sc') || '#c0392b', 0.5);
      await seq.sleep(200);
    }
    // stickers
    const stks = [...this.el.querySelectorAll('.ledger-stk')];
    for (let i = 0; i < stks.length; i++) {
      if (this.state === 'dead') return;
      const s = stks[i];
      this.follow(s);
      await seq.sleep(i ? 140 : 260);
      const tilt = (Math.random() * 2 - 1) * 16;
      s.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
      s.classList.add('on');
      const img = s.querySelector('.ledger-stkimg');
      seq.anim(img, [
        { transform: `translateY(-40px) scale(1.9) rotate(${tilt + 24}deg)`, opacity: 0 },
        { transform: `translateY(0) scale(0.88, 1.08) rotate(${tilt - 2}deg)`, opacity: 1, offset: 0.62 },
        { transform: `scale(1.05) rotate(${tilt + 1}deg)`, offset: 0.82 },
        { transform: `scale(1) rotate(${tilt}deg)`, opacity: 1 },
      ], { duration: 360, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
      await seq.sleep(220);
      if (!seq.ff) {
        this.sfx('sticker', { pitch: 0.9 + i * 0.1 });
        const r = img.getBoundingClientRect();
        this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, 8, { type: 'spark', colors: ['#ffffff', '#ffe27a'], speed: 260, g: 100, drag: 2.5, life: 0.5, jitter: r.width * 0.7 });
      }
      await this.write(s.querySelector('.ledger-cap'), { slow: 0.8 });
    }
    // fox's note
    if ($.note && !$.note.classList.contains('empty')) {
      this.follow($.note);
      await seq.sleep(160);
      $.note.classList.add('on');
      this.sfx('paper', { pitch: 1.2 });
      seq.anim($.note, [{ transform: 'translateY(-26px) rotate(-9deg) scale(1.15)', opacity: 0 }, { transform: 'translateY(2px) rotate(-1deg) scale(0.98)', opacity: 1, offset: 0.7 }, { transform: 'rotate(-2deg) scale(1)', opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'both' });
      await seq.sleep(260);
      await this.write($.note.querySelector('.ledger-ntext'), { slow: 0.7 });
    }
    // signature
    if (this.state === 'dead') return;
    this.follow($.sig);
    await this.sign();
    if (this.state === 'dead') return;
    // pen leaves, button appears
    const sw = $.sheet.clientWidth;
    this.$.pen.classList.remove('writing');
    this.movePen(sw + 140, this.penY - 120, 420);
    seq.slow();
    this.state = 'done';
    this.graceUntil = performance.now() + 500;
    $.gowrap.classList.add('on');
    seq.anim($.go, [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: 'ease-out' });
    this.sfx('chip', { pitch: 1.3 });
    if (this.auto) seq.after(IDLE_DONE_MS * this.auto, () => this.close());
  }

  async sign() {
    const seq = this.seq, $ = this.$;
    const p = $.sigp, d = $.sigd;
    let L = 0;
    try { L = p.getTotalLength(); } catch { L = 0; }
    $.sig.classList.add('on');
    if (!L || seq.ff) { p.style.strokeDasharray = 'none'; d.style.opacity = '1'; return; }
    p.style.strokeDasharray = `${L} ${L}`;
    p.style.strokeDashoffset = `${L}`;
    const box = $.sigsvg.getBoundingClientRect(), sr = $.sheet.getBoundingClientRect();
    const k = box.width / 170;
    const ox = box.left - sr.left, oy = box.top - sr.top;
    this.$.pen.classList.add('writing');
    const dur = 1500;
    const t0 = performance.now();
    let n = 0;
    await new Promise((res) => {
      const step = () => {
        if (this.state === 'dead') { res(); return; }
        const t = seq.ff ? 1 : Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const len = L * (0.15 * t + 0.85 * e);
        p.style.strokeDashoffset = `${L - len}`;
        try {
          const pt = p.getPointAtLength(len);
          this.$.pen.style.transition = 'none';
          this.$.pen.style.transform = `translate(${Math.round(ox + pt.x * k)}px, ${Math.round(oy + pt.y * k - this.penH)}px)`;
          this.penX = ox + pt.x * k; this.penY = oy + pt.y * k;
        } catch { /* ignore */ }
        if (++n % 7 === 0 && !seq.ff) this.sfx('pen', { pitch: 0.7 + Math.random() * 0.5, volume: 0.5 });
        if (t >= 1) { res(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    p.style.strokeDasharray = 'none';
    // the monocle dot
    if (!seq.ff) {
      const bb = d.getBBox();
      this.movePen(ox + (bb.x + bb.width) * k, oy + (bb.y + bb.height) * k, 160);
      await seq.sleep(170);
    }
    d.style.opacity = '1';
    if (!seq.ff) this.sfx('pen', { pitch: 1.4 });
    await seq.sleep(120);
  }

  // ------------------------------------------------------------------ teardown
  async close(immediate = false) {
    if (this.state === 'closing' || this.state === 'dead') return;
    this.state = 'closing';
    this.seq.fast();
    if (!immediate) {
      this.sfx('paper', { pitch: 0.9 });
      this.el.classList.add('closing');
      try {
        this.$.board.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-16px) rotate(-1deg)', offset: 0.25 }, { transform: 'translateY(105vh) rotate(6deg)' }], { duration: 420, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 400));
    }
    this.destroy();
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
