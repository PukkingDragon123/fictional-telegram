// End-of-day report: a real ruled ledger page clipped to a clipboard on a
// wooden desk, rendered chunky (1 texel = 3 CSS px). Pen lines write
// themselves in, a receipt is stapled on, the grade gets stamped with ink
// splatter, stickers peel on, Reynard signs.
//
//   showFinanceSheet(root, report, opts) -> Promise<void>
//     report: { day, weekday, lines:[{label, amount, icon, kind}], net, served, happy, rampages,
//               fishEaten, fishBorn, avgStars, ratingBefore, ratingAfter, grade, stickers:[{id, caption}],
//               comment, stamp2? }
//     opts:   { icon(name, scale) -> html, sfx(name, {volume, pitch}), autoAdvance, signal }
import { hasSprite, spriteCanvas } from './sprites.js';
import {
  esc, clamp, fmtInt, mkSfx, mkIcon, bindInput, Seq, shake, PixelFX, gridCanvas, outline, rng,
} from './EggHatch.js';
import { injectPaperCSS, paperTexture, deco, decoCanvas, arrowSVG, PX } from './paper.js';

const GRADES = {
  'A+': { id: 'Aplus', col: '#2d8a3c', sfx: 'grade_good', stamp2: 'approved', fox: 'laugh' },
  A: { id: 'A', col: '#2d8a3c', sfx: 'grade_good', stamp2: 'approved', fox: 'greedy' },
  B: { id: 'B', col: '#2c5cb0', sfx: 'grade_good', stamp2: 'paid', fox: 'smug' },
  C: { id: 'C', col: '#b06a18', sfx: null, stamp2: 'paid', fox: 'wink' },
  D: { id: 'D', col: '#c0392b', sfx: 'grade_bad', stamp2: 'seeme', fox: 'worried' },
  F: { id: 'F', col: '#c0392b', sfx: 'grade_bad', stamp2: 'seeme', fox: 'angry' },
};
const STAMP2 = {
  approved: { text: 'OK!', col: '#2d8a3c' }, paid: { text: 'PAID', col: '#c0392b' },
  seeme: { text: 'SEE ME', col: '#c0392b' }, overdue: { text: 'OVERDUE', col: '#c0392b' },
};
const IDLE_STAMP_MS = 2600, IDLE_DONE_MS = 60000;
const INK = '#27479a';
const WD = { monday: 'MON', tuesday: 'TUE', wednesday: 'WED', thursday: 'THU', friday: 'FRI', saturday: 'SAT', sunday: 'SUN' };

// layout constants (CSS px at scale 1; multiples of PX)
const PW = 360, HEAD = 84, ROW = 36, NET = 78, FOOT = 144, PAD_B = 18, MARGIN_T = 18; // margin line at texel 18
const BOARD_PAD_T = 54, BOARD_PAD_X = 21, BOARD_PAD_B = 21;

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
function barcode(seed) {
  const R = rng(seed);
  let h = '';
  for (let i = 0; i < 26; i++) h += `<i style="width:${R() < 0.35 ? 6 : 3}px;margin-right:${R() < 0.5 ? 3 : 6}px"></i>`;
  return `<div class="fs-bar">${h}</div>`;
}
function lampCanvas(w, h) {
  // dithered lamp-light vignette at 1/4 screen res
  const tw = Math.max(8, Math.ceil(w / 4)), th = Math.max(8, Math.ceil(h / 4));
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  const d = x.createImageData(tw, th), p = d.data;
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cx = tw * 0.5, cy = th * 0.38, R = Math.hypot(tw, th) * 0.5;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const r = Math.hypot((i - cx) / 1.1, j - cy) / R;
    const t = clamp((r - 0.32) * 1.5, 0, 1);
    const th0 = (B[(j & 3) * 4 + (i & 3)] + 0.5) / 16;
    const k = (j * tw + i) * 4;
    if (th0 < t) { p[k] = 14; p[k + 1] = 7; p[k + 2] = 3; p[k + 3] = 120; } else if (th0 < t * 1.6) { p[k] = 14; p[k + 1] = 7; p[k + 2] = 3; p[k + 3] = 50; } else if (r < 0.3 && th0 < (0.3 - r) * 0.9) { p[k] = 255; p[k + 1] = 214; p[k + 2] = 140; p[k + 3] = 40; }
  }
  x.putImageData(d, 0, 0);
  return c;
}

// signature: a loopy "Reynard" + flourish, in a 170x66 box
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
    const g = String(report.grade || 'C').toUpperCase();
    this.grade = GRADES[g] ? g : 'C';
    this.G = GRADES[this.grade];
    this.graceUntil = 0;
    this.s = 1;
  }

  // ------------------------------------------------------------------ DOM
  hw(text, cls = '') {
    const R = Math.random;
    const out = [...String(text)].map((c) => (c === ' ' ? '<i class="fs-c fs-sp"> </i>'
      : `<i class="fs-c" style="--r:${((R() * 2 - 1) * 4).toFixed(1)}deg;--y:${((R() * 2 - 1) * 1).toFixed(1)}px">${esc(c)}</i>`)).join('');
    return `<span class="fs-hw ${cls}">${out}</span>`;
  }

  money(n) {
    const v = Math.round(Number(n) || 0);
    if (!v) return '–';
    return `${v > 0 ? '+' : '−'}${fmtInt(v)}`;
  }

  pickStamp2(net) {
    const o = this.r.stamp2;
    if (o === false || o === null) return null;
    if (o && STAMP2[o]) return o;
    if (this.grade === 'D' || this.grade === 'F') return 'seeme';
    if (net < 0) return 'overdue';
    return this.G.stamp2;
  }

  spriteBig(name, scale, fallback) {
    if (hasSprite(name)) return this.icon(name, scale);
    return fallback;
  }

  build() {
    const r = this.r;
    const lines = (Array.isArray(r.lines) ? r.lines : []).slice(0, 12);
    const net = Number.isFinite(Number(r.net)) ? Number(r.net) : lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    this.net = net;
    const rows = lines.length ? lines : [{ label: 'Quiet day', amount: 0, icon: 'fish', kind: 'note' }];
    this.nRows = rows.length;
    this.paperH = HEAD + ROW * rows.length + NET + FOOT + PAD_B;
    const rowsH = rows.map((l, i) => {
      const amt = Number(l.amount) || 0;
      const kind = l.kind || (amt < 0 ? 'expense' : amt > 0 ? 'income' : 'note');
      const cls = kind === 'note' || !amt ? 'note' : amt < 0 ? 'neg' : 'pos';
      return `<div class="fs-row k-${esc(kind)}" data-i="${i}" title="${esc(l.label || '')}">
        <span class="fs-ico">${l.icon ? this.icon(l.icon, 2) : ''}</span>
        <span class="fs-lead"><span class="fs-lbl">${esc(l.label || '')}</span></span>
        ${this.hw(this.money(amt), `fs-amt ${cls}`)}
      </div>`;
    }).join('');
    const day = r.day != null ? `Day ${r.day}` : 'Today';
    const wd = WD[String(r.weekday || '').toLowerCase()] || String(r.weekday || '').slice(0, 3).toUpperCase();
    const s2 = this.pickStamp2(net);
    this.s2 = s2;
    // receipt (stats): icon + number
    const fmt1 = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v).toFixed(1) : '–');
    const rb = Number(r.ratingBefore), ra = Number(r.ratingAfter);
    const up = ra >= rb;
    const rc = (icon, val, title, cls = '') => `<div class="fs-rc ${cls}" title="${esc(title)}"><span>${this.icon(icon, 1)}</span><i></i><b>${esc(val)}</b></div>`;
    const rec = [
      rc('bear', `${r.served ?? 0}`, 'Bears served'),
      rc('bear_happy', `${r.happy ?? 0}`, 'Happy bears'),
      rc('bear_angry', `${r.rampages ?? 0}`, 'Rampages', Number(r.rampages) > 0 ? 'neg' : ''),
      rc('fish', `${r.fishEaten ?? 0}`, 'Fish eaten'),
      rc('egg', `+${r.fishBorn ?? 0}`, 'Fish born'),
      rc('star', fmt1(r.avgStars), 'Average stars'),
    ].join('');
    const rating = Number.isFinite(rb) && Number.isFinite(ra)
      ? `<div class="fs-rc fs-rate ${up ? 'pos' : 'neg'}" title="Rating"><span>${this.icon('chart', 1)}</span><b>${rb.toFixed(1)}</b><em>${arrowSVG('right', 2)}</em><b>${ra.toFixed(1)}</b><em class="fs-updn">${up ? '▲' : '▼'}</em></div>` : '';
    // stickers
    const stickers = (Array.isArray(r.stickers) ? r.stickers : []).filter((s) => s && s.id).slice(0, 4);
    this.stickers = stickers;
    const SLOTS = [[302, 2, 12], [168, this.paperH - 40, -8], [-30, this.paperH - 118, -12], [-26, HEAD + ROW * rows.length + 4, 9]];
    const stkH = stickers.map((s, i) => {
      const [x, y, rot] = SLOTS[i];
      const inner = hasSprite(s.id) ? this.icon(s.id, 3) : `<b class="fs-stkfb">${esc((s.caption || '★').slice(0, 6))}</b>`;
      return `<div class="fs-stk" data-cer-own data-i="${i}" title="${esc(s.caption || '')}" style="left:${x}px;top:${y}px;--r:${rot}deg">${inner}<i class="fs-peel"></i></div>`;
    }).join('');
    const fox = `fox_${this.G.fox}`;
    const stamp2 = s2 ? (hasSprite(`stamp_${s2}`) ? this.icon(`stamp_${s2}`, 2) : `<b class="fs-s2fb" style="--sc:${STAMP2[s2].col}">${esc(STAMP2[s2].text)}</b>`) : '';
    const gradeStamp = hasSprite(`stamp_${this.G.id}`) ? this.icon(`stamp_${this.G.id}`, 3) : `<b class="fs-gfb" style="--sc:${this.G.col}">${esc(this.grade)}</b>`;
    return `
      <div class="fs-desk paper paper--wood"></div>
      <canvas class="fs-lamp"></canvas>
      <div class="fs-scene">
        <div class="fs-mug">${deco('mug')}</div>
        <div class="fs-board">
          <div class="fs-paper" style="height:${this.paperH}px">
            <div class="fs-head">
              ${s2 ? `<div class="fs-stamp2" data-k="${s2}">${stamp2}</div>` : ''}
              <div class="fs-date">${this.hw(day, 'fs-day')}<span class="fs-wd">${esc(wd)}</span></div>
            </div>
            <div class="fs-rows">${rowsH}</div>
            <div class="fs-net ${net < 0 ? 'neg' : 'pos'}">
              <span class="fs-netico">${this.icon('coins', 2)}</span>
              ${this.hw(this.money(net).replace('–', '0'), `fs-amt big ${net < 0 ? 'neg' : 'pos'}`)}
            </div>
            <div class="fs-foot">
              <div class="fs-sig"><span class="fs-sigx">×</span><i class="fs-sigline"></i></div>
              <div class="fs-grade" data-cer-own>
                <div class="fs-gslot"></div>
                <div class="fs-gstamp">${gradeStamp}</div>
                <div class="fs-tapme">${this.icon('cursor_hand', 2)}</div>
              </div>
            </div>
            <canvas class="fs-ink"></canvas>
            <div class="fs-stks">${stkH}</div>
          </div>
          <div class="fs-clip"></div>
        </div>
        <div class="fs-receipt pp-wig">
          <div class="fs-staple">${deco('staple')}</div>
          <div class="fs-rhead">${this.icon('fox_smug', 1)}<span>★ ★ ★</span></div>
          ${rec}${rating}
          ${barcode((Number(r.day) || 1) * 7)}
        </div>
        ${r.comment ? `<div class="fs-note pp-wig"><div class="fs-tape">${deco('tape', { variant: ['mint', 'pink', 'yellow'][(Number(r.day) || 0) % 3] })}</div><span class="fs-nfox">${this.icon(fox, 2)}</span>${this.hw(r.comment, 'fs-ntext')}</div>` : ''}
        <div class="fs-pencil">${deco('pencil', { len: 58 })}</div>
        <button type="button" class="fs-go" data-cer-own aria-label="Good night">${this.icon('moon', 2)}${arrowSVG('right', 3)}</button>
        <div class="fs-pen"></div>
      </div>
      <canvas class="fs-fx"></canvas>`;
  }

  start() {
    injectPaperCSS();
    const el = document.createElement('div');
    el.className = 'fs-ov';
    el.tabIndex = -1;
    el.dataset.grade = this.G.id;
    el.innerHTML = this.build();
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = {
      scene: q('.fs-scene'), board: q('.fs-board'), paper: q('.fs-paper'), ink: q('.fs-ink'), pen: q('.fs-pen'), fx: q('.fs-fx'), lamp: q('.fs-lamp'),
      grade: q('.fs-grade'), gstamp: q('.fs-gstamp'), stamp2: q('.fs-stamp2'), net: q('.fs-net'), go: q('.fs-go'), note: q('.fs-note'),
      receipt: q('.fs-receipt'), sig: q('.fs-sig'), mug: q('.fs-mug'), pencil: q('.fs-pencil'), date: q('.fs-date'), clip: q('.fs-clip'),
    };
    // textures
    const tH = this.paperH / PX;
    this.$.paper.style.backgroundImage = `url(${paperTexture('notebook', PW, this.paperH, {
      rules: ROW / PX, ruleTop: (HEAD + ROW) / PX, margin: MARGIN_T, stains: 1, edge: 0.2, edgeW: 6, seed: (Number(this.r.day) || 1) * 13,
    })})`;
    const bw = PW + BOARD_PAD_X * 2, bh = this.paperH + BOARD_PAD_T + BOARD_PAD_B;
    this.$.board.style.cssText = `width:${bw}px;height:${bh}px;background-image:url(${paperTexture('board', bw, bh, { edge: 0.6, edgeW: 4, seed: 3 })})`;
    this.bw = bw; this.bh = bh;
    const ink = this.$.ink;
    ink.width = PW / PX; ink.height = tH;
    this.ictx = ink.getContext('2d');
    // pixel art bits
    const clip = clipCanvas(PX); clip.className = 'px';
    this.$.clip.appendChild(clip);
    const pen = hasSprite('pen') ? (() => { const c = spriteCanvas('pen', PX); const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; })() : decoCanvas('pencil');
    pen.className = 'px';
    this.$.pen.appendChild(pen);
    this.penH = pen.height;
    this.root.appendChild(el);
    this.fx = new PixelFX(this.$.fx);
    this.unbind = bindInput(el, { onTap: () => this.tap(), onSkip: () => this.skipAll() });
    this.$.go.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('click'); this.close(); });
    this.$.grade.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tap(); });
    this.bindStickers();
    this.onResize = () => { this.fx.resize(); this.layout(); };
    window.addEventListener('resize', this.onResize);
    if (this.opts.signal && this.opts.signal.addEventListener) this.opts.signal.addEventListener('abort', () => this.close(true), { once: true });
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    const rr = this.$.receipt;
    rr.style.backgroundImage = `url(${paperTexture('receipt', rr.offsetWidth, rr.offsetHeight, { torn: 'tb', seed: 8 })})`;
    if (this.$.note) { const n = this.$.note; n.style.backgroundImage = `url(${paperTexture('sticky', n.offsetWidth, n.offsetHeight, { sticky: 1, seed: 9 })})`; }
    this.layout();
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

  // ------------------------------------------------------------------ layout
  place(el, x, y, extra = '') {
    if (!el) return;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    if (extra) el.style.cssText += extra;
  }
  layout() {
    const vw = innerWidth, vh = innerHeight, $ = this.$;
    const tall = vw / vh < 0.9;
    const bw = this.bw, bh = this.bh;
    const rh = $.receipt.offsetHeight || 300, nh = $.note ? $.note.offsetHeight : 0;
    let W, H;
    const bx = tall ? 24 : 70, by = 24;
    this.place($.board, bx, by);
    if (!tall) {
      W = bx + bw + 210;
      const rx = bx + bw - 22, ry = by + 92;
      this.place($.receipt, rx, ry); $.receipt.style.setProperty('--rot', '3.5deg');
      const ny = ry + rh + 26;
      if ($.note) { this.place($.note, rx + 12, ny); $.note.style.setProperty('--rot', '-4deg'); }
      this.place($.mug, W - 128, -34);
      const bottom = Math.max(by + bh, ny + nh);
      this.place($.pencil, bx - 112, by + bh * 0.55); $.pencil.style.setProperty('--rot', '78deg');
      H = Math.max(by + bh + 24, bottom + 70);
      this.place($.go, W - 132, H - 70);
      $.mug.style.display = '';
    } else {
      W = bx * 2 + bw;
      const ry = by + bh - 34;
      this.place($.receipt, bx + bw - 176, ry); $.receipt.style.setProperty('--rot', '4deg');
      if ($.note) { this.place($.note, bx - 6, ry + 18); $.note.style.setProperty('--rot', '-5deg'); }
      this.place($.mug, W - 92, -58);
      const bottom = Math.max(ry + rh, ry + 18 + nh);
      this.place($.pencil, bx + 170, bottom + 24); $.pencil.style.setProperty('--rot', '-8deg');
      H = bottom + 76;
      this.place($.go, bx + 30, bottom + 18);
    }
    const fit = Math.min((vw - 12) / W, (vh - 12) / H);
    let s = fit;
    for (const c of [5 / 3, 4 / 3, 1]) if (fit >= c) { s = c; break; }
    this.s = s;
    $.scene.style.width = `${W}px`; $.scene.style.height = `${H}px`;
    $.scene.style.left = `${Math.round((vw - W * s) / 2)}px`;
    $.scene.style.top = `${Math.round((vh - H * s) / 2)}px`;
    $.scene.style.transform = `scale(${s})`;
    // lamp vignette
    const lc = lampCanvas(vw, vh), L = $.lamp;
    L.width = lc.width; L.height = lc.height;
    L.getContext('2d').drawImage(lc, 0, 0);
  }

  // element rect in scene coords
  loc(el) {
    const sr = this.$.scene.getBoundingClientRect(), r = el.getBoundingClientRect(), s = this.s;
    return { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s, r: (r.right - sr.left) / s, b: (r.bottom - sr.top) / s };
  }
  // paper texel -> scene coords
  p2s(tx, ty) {
    return { x: this.$.board.offsetLeft + BOARD_PAD_X + tx * PX, y: this.$.board.offsetTop + BOARD_PAD_T + ty * PX };
  }

  bindStickers() {
    for (const s of this.el.querySelectorAll('.fs-stk')) {
      let sx = 0, sy = 0, ox = 0, oy = 0, id = null;
      s.dataset.dx = '0'; s.dataset.dy = '0';
      s.addEventListener('pointerdown', (e) => {
        if (!s.classList.contains('on')) return;
        e.stopPropagation();
        id = e.pointerId;
        try { s.setPointerCapture(id); } catch { /* ignore */ }
        sx = e.clientX; sy = e.clientY; ox = Number(s.dataset.dx); oy = Number(s.dataset.dy);
        s.classList.add('drag');
        this.sfx('sticker', { pitch: 1.4, volume: 0.4 });
      });
      s.addEventListener('pointermove', (e) => {
        if (e.pointerId !== id) return;
        const dx = clamp(ox + (e.clientX - sx) / this.s, -70, 70), dy = clamp(oy + (e.clientY - sy) / this.s, -70, 70);
        s.dataset.dx = dx; s.dataset.dy = dy;
        s.style.translate = `${dx}px ${dy}px`;
      });
      const up = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        s.classList.remove('drag');
        this.sfx('pop_in', { pitch: 1.5, volume: 0.35 });
      };
      s.addEventListener('pointerup', up);
      s.addEventListener('pointercancel', up);
    }
  }

  // ------------------------------------------------------------------ input
  tap() {
    const now = performance.now();
    switch (this.state) {
      case 'intro': this.seq.fast(); break;
      case 'writing':
        if (this.speed < 4) this.speed = 4;
        else this.seq.fast();
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
  movePen(x, y, ms) {
    const dist = Math.hypot(x - this.penX, y - this.penY);
    const t = this.seq.ff ? 0 : ms ?? (dist > 50 ? Math.min(260, 90 + dist * 0.4) : 40);
    const p = this.$.pen;
    p.style.transition = `transform ${t}ms ${dist > 50 ? 'cubic-bezier(.45,0,.2,1)' : 'linear'}`;
    p.style.transform = `translate(${Math.round(x - 3)}px, ${Math.round(y - this.penH + 3)}px)`;
    this.penX = x; this.penY = y;
  }
  penTo(el) {
    const r = this.loc(el);
    if (!r.w && !r.h) return;
    this.movePen(r.r, r.b - 4);
  }

  async write(el, { slow = 1, pen = true } = {}) {
    if (!el) return;
    const chars = el.querySelectorAll('.fs-c');
    this.$.pen.classList.add('writing');
    for (const c of chars) {
      if (this.state === 'dead') return;
      c.classList.add('on');
      if (this.seq.ff) continue;
      if (pen) this.penTo(c);
      if (++this.penN % 2 === 0) this.sfx('pen', { pitch: 0.85 + Math.random() * 0.4, volume: 0.55 });
      await this.seq.sleep((this.charMs * slow) / this.speed);
    }
    if (this.seq.ff) chars.forEach((c) => c.classList.add('on'));
  }

  // chunky ink line on the paper (texel coords), drawn progressively by the pen
  async inkLine(pts, { col = INK, ms = 300, w = 1 } = {}) {
    const ctx = this.ictx;
    ctx.fillStyle = col;
    const seg = [];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let k = 0; k <= n; k++) seg.push([Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n)]);
    }
    const dot = ([x, y]) => { ctx.fillRect(x, y, w, w); };
    if (this.seq.ff || ms <= 0) { seg.forEach(dot); return; }
    const t0 = performance.now();
    let done = 0, n = 0;
    await new Promise((res) => {
      const step = () => {
        if (this.state === 'dead') { res(); return; }
        const t = this.seq.ff ? 1 : Math.min(1, (performance.now() - t0) / (ms / this.speed));
        const upto = Math.round(seg.length * t);
        for (; done < upto; done++) dot(seg[done]);
        const p = seg[Math.max(0, upto - 1)];
        const sp = this.p2s(p[0], p[1]);
        this.$.pen.style.transition = 'none';
        this.movePen(sp.x, sp.y, 0);
        if (++n % 6 === 0 && !this.seq.ff) this.sfx('pen', { pitch: 0.7 + Math.random() * 0.4, volume: 0.5 });
        if (t >= 1) { res(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    for (; done < seg.length; done++) dot(seg[done]);
  }

  // ------------------------------------------------------------------ sequence
  async run() {
    const seq = this.seq, $ = this.$;
    this.state = 'intro';
    const nChars = this.el.querySelectorAll('.fs-head .fs-c, .fs-rows .fs-c, .fs-net .fs-c').length;
    this.charMs = clamp(3200 / Math.max(1, nChars), 28, 70);
    this.sfx('paper');
    seq.anim($.board, [
      { transform: 'translateY(110vh) rotate(-9deg)' },
      { transform: 'translateY(-16px) rotate(1.4deg)', offset: 0.72 },
      { transform: 'translateY(3px) rotate(-.4deg)', offset: 0.88 },
      { transform: 'translateY(0) rotate(0deg)' },
    ], { duration: 680, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    seq.anim($.mug, [{ transform: 'translate(120px,-120px) rotate(40deg)' }, { transform: 'translate(-4px,3px) rotate(-4deg)', offset: 0.7 }, { transform: 'none' }], { duration: 760, delay: 120, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    seq.anim($.pencil, [{ transform: 'translateX(60vw) rotate(var(--rot))' }, { transform: 'rotate(var(--rot))' }], { duration: 700, delay: 200, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    const sw = this.$.scene.offsetWidth;
    this.penX = sw + 80; this.penY = 80;
    $.pen.style.transform = `translate(${sw + 80}px, ${80 - this.penH}px)`;
    await seq.sleep(700);
    if (this.state === 'dead') return;
    this.state = 'writing';
    seq.slow();
    // date in the corner
    await this.write($.date.querySelector('.fs-day'), { slow: 1.4 });
    $.date.classList.add('on');
    this.sfx('stamp', { pitch: 2, volume: 0.25 });
    // lines: icon pops, amount is written
    for (const row of this.el.querySelectorAll('.fs-row')) {
      if (this.state === 'dead') return;
      const ico = row.querySelector('.fs-ico');
      ico.classList.add('on');
      row.classList.add('on');
      if (!seq.ff) {
        seq.anim(ico, [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.35) rotate(8deg)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
        this.sfx('pop_in', { pitch: 1.3 + Math.random() * 0.3, volume: 0.3 });
      }
      await seq.sleep(110 / this.speed);
      await this.write(row.querySelector('.fs-amt'), { slow: 1.2 });
      await seq.sleep(70 / this.speed);
    }
    // the total: two ruled lines, then the big number
    const tW = PW / PX, top = (HEAD + ROW * this.nRows) / PX;
    await this.inkLine([[MARGIN_T + 6, top + 2], [tW - 5, top + 1]], { ms: 320 });
    await this.inkLine([[MARGIN_T + 8, top + 4], [tW - 6, top + 4]], { ms: 260 });
    $.net.classList.add('on');
    if (!seq.ff) seq.anim($.net.querySelector('.fs-netico'), [{ transform: 'scale(0)' }, { transform: 'scale(1.4) rotate(-10deg)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 300 });
    await this.write($.net.querySelector('.fs-amt'), { slow: 1.8 });
    // underline the net twice
    const amt = this.loc($.net.querySelector('.fs-amt')), pp = this.loc($.paper);
    const ux0 = (amt.x - pp.x) / PX, ux1 = (amt.r - pp.x) / PX, uy = (amt.b - pp.y) / PX;
    await this.inkLine([[ux0, uy + 1], [ux1, uy]], { ms: 200, col: this.net < 0 ? '#c23a2c' : '#237a34' });
    await this.inkLine([[ux0 + 2, uy + 3], [ux1 - 1, uy + 3]], { ms: 180, col: this.net < 0 ? '#c23a2c' : '#237a34' });
    if (this.state === 'dead') return;
    // the receipt gets stapled on
    await this.receiptIn();
    if (this.state === 'dead') return;
    // waiting for the stamp
    seq.slow();
    this.$.pen.classList.remove('writing');
    const g = this.loc($.grade);
    this.movePen(g.x - 30, g.b + 30, 380);
    this.state = 'await';
    $.grade.classList.add('ready');
    if (this.skipping) { this.stampNow(); return; }
    this.awaitT = seq.after(IDLE_STAMP_MS, () => this.stampNow());
  }

  async receiptIn() {
    const seq = this.seq, $ = this.$;
    $.receipt.classList.add('on');
    if (!seq.ff) {
      this.sfx('paper', { pitch: 1.3 });
      const a = seq.anim($.receipt, [
        { transform: 'translate(40vw, -30px) rotate(30deg)' },
        { transform: 'translate(-6px, 4px) rotate(calc(var(--rot) - 3deg))', offset: 0.7 },
        { transform: 'rotate(var(--rot))' },
      ], { duration: 460, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      await seq.sleep(360);
      this.sfx('stamp', { pitch: 2.2, volume: 0.45 });
      const st = $.receipt.querySelector('.fs-staple');
      seq.anim(st, [{ transform: 'translateY(-14px) scale(1.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 120, fill: 'backwards' });
      shake(seq, $.receipt, 3, 160);
      if (a) await seq.sleep(120);
    }
    for (const rc of $.receipt.querySelectorAll('.fs-rc')) {
      rc.classList.add('on');
      if (!seq.ff) { this.sfx('tick', { pitch: 1.6, volume: 0.3 }); await seq.sleep(80 / this.speed); }
    }
  }

  async stampNow() {
    if (this.state !== 'await') return;
    const seq = this.seq, $ = this.$;
    this.state = 'stamping';
    if (this.awaitT) seq.cancel(this.awaitT);
    $.grade.classList.remove('ready');
    const tilt = -6 - Math.random() * 9;
    const st = $.gstamp;
    st.classList.add('on');
    const a = seq.anim(st, [
      { transform: `translate(-50%, -50%) translateY(-150px) scale(2.6) rotate(${tilt - 18}deg)`, opacity: 0 },
      { transform: `translate(-50%, -50%) translateY(-60px) scale(1.8) rotate(${tilt - 6}deg)`, opacity: 0.9, offset: 0.45 },
      { transform: `translate(-50%, -50%) scale(1.22, .78) rotate(${tilt}deg)`, opacity: 1, offset: 0.62 },
      { transform: `translate(-50%, -50%) scale(.94, 1.06) rotate(${tilt}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(-50%, -50%) scale(1) rotate(${tilt}deg)`, opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' });
    await seq.sleep(520 * 0.62);
    if (this.state === 'dead') return;
    this.impact(st, this.G.col, 1);
    if (this.G.sfx) seq.after(240, () => this.sfx(this.G.sfx));
    await seq.sleep(520 * 0.38 + 120);
    if (a) { try { a.finish(); a.commitStyles(); a.cancel(); } catch { /* keep */ } }
    if (this.state === 'dead') return;
    this.deco();
  }

  impact(el, col, power) {
    const $ = this.$;
    this.sfx('stamp', { pitch: power < 1 ? 1.2 : 1 });
    if (!this.seq.ff) {
      shake(this.seq, $.scene, 9 * power, 360 * power);
      this.seq.anim($.board, [{ transform: 'scale(1)' }, { transform: `scale(${1 - 0.01 * power}, ${1 - 0.018 * power})` }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    }
    // chunky ink splatter on the page (texel res)
    const r = this.loc(el), pp = this.loc($.paper);
    const cx = (r.x + r.w / 2 - pp.x) / PX, cy = (r.y + r.h / 2 - pp.y) / PX, rad = r.w / PX / 2;
    const ctx = this.ictx, R = Math.random;
    ctx.fillStyle = col;
    const n = Math.round(30 * power);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = rad * 0.85 + R() * rad * 0.7 * power;
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      ctx.globalAlpha = 0.55 + R() * 0.4;
      const s = R() < 0.2 ? 2 : 1;
      ctx.fillRect(x, y, s, s);
      if (R() < 0.35) ctx.fillRect(Math.round(cx + Math.cos(a) * (d + 2)), Math.round(cy + Math.sin(a) * (d + 2)), 1, 1);
      if (R() < 0.15) { for (let k = 1; k < 3; k++) ctx.fillRect(Math.round(cx + Math.cos(a) * (d - k)), Math.round(cy + Math.sin(a) * (d - k)), 1, 1); }
    }
    ctx.globalAlpha = 1;
    if (!this.seq.ff) {
      const sr = el.getBoundingClientRect();
      this.fx.burst(sr.left + sr.width / 2, sr.top + sr.height / 2, Math.round(18 * power), { colors: [col], speed: 520 * power, g: 900, drag: 3, life: 0.45, jitter: sr.width * 0.6 });
      if (this.G.id === 'Aplus' && power >= 1) this.fx.burst(sr.left + sr.width / 2, sr.top + sr.height / 2, 30, { type: 'spark', colors: ['#ffe27a', '#ffffff'], speed: 540, g: 120, drag: 2, life: 0.9, size: [1, 2], jitter: sr.width * 0.5 });
    }
  }

  async deco() {
    const seq = this.seq, $ = this.$;
    this.state = 'deco';
    if (this.skipping) seq.fast();
    this.graceUntil = performance.now() + 300;
    if ($.stamp2) {
      await seq.sleep(200);
      $.stamp2.classList.add('on');
      const t2 = -12 + Math.random() * 8;
      seq.anim($.stamp2, [
        { transform: `translateY(-50%) scale(2.4) rotate(${t2 + 14}deg)`, opacity: 0 },
        { transform: `translateY(-50%) scale(.9, 1.1) rotate(${t2}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translateY(-50%) scale(1) rotate(${t2}deg)`, opacity: 1 },
      ], { duration: 320, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' });
      await seq.sleep(190);
      if (this.state === 'dead') return;
      this.impact($.stamp2, STAMP2[this.s2]?.col || '#c0392b', 0.5);
      await seq.sleep(180);
    }
    // stickers peel on
    const stks = [...this.el.querySelectorAll('.fs-stk')];
    for (let i = 0; i < stks.length; i++) {
      if (this.state === 'dead') return;
      const s = stks[i];
      await seq.sleep(i ? 150 : 240);
      s.classList.add('on');
      seq.anim(s, [
        { transform: 'translateY(-46px) scale(1.7) rotate(calc(var(--r) + 26deg))', opacity: 0 },
        { transform: 'translateY(0) scale(.86, 1.1) rotate(calc(var(--r) - 3deg))', opacity: 1, offset: 0.6 },
        { transform: 'scale(1.05) rotate(calc(var(--r) + 1deg))', offset: 0.82 },
        { transform: 'scale(1) rotate(var(--r))', opacity: 1 },
      ], { duration: 380, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
      await seq.sleep(200);
      if (!seq.ff) {
        this.sfx('sticker', { pitch: 0.9 + i * 0.1 });
        const r = s.getBoundingClientRect();
        this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, 9, { type: 'spark', colors: ['#ffffff', '#ffe27a'], speed: 260, g: 100, drag: 2.5, life: 0.5, jitter: r.width * 0.6 });
      }
    }
    // fox's note
    if ($.note) {
      await seq.sleep(160);
      $.note.classList.add('on');
      this.sfx('paper', { pitch: 1.2 });
      seq.anim($.note, [{ transform: 'translateY(-40px) rotate(-14deg) scale(1.2)', opacity: 0 }, { transform: 'translateY(3px) rotate(calc(var(--rot) + 2deg)) scale(.98)', opacity: 1, offset: 0.7 }, { transform: 'rotate(var(--rot)) scale(1)', opacity: 1 }], { duration: 340, easing: 'ease-out', fill: 'both' });
      await seq.sleep(280);
      await this.write($.note.querySelector('.fs-ntext'), { slow: 0.6 });
    }
    if (this.state === 'dead') return;
    await this.sign();
    if (this.state === 'dead') return;
    // pen leaves, button appears
    const sw = this.$.scene.offsetWidth;
    this.$.pen.classList.remove('writing');
    this.movePen(sw + innerWidth / this.s, this.penY - 200, 520);
    seq.slow();
    this.state = 'done';
    this.graceUntil = performance.now() + 500;
    $.go.classList.add('on');
    seq.anim($.go, [{ transform: 'scale(.2) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1.15) rotate(4deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 340, easing: 'ease-out' });
    this.sfx('chip', { pitch: 1.3 });
    if (this.auto) seq.after(IDLE_DONE_MS * this.auto, () => this.close());
  }

  async sign() {
    const seq = this.seq, $ = this.$;
    $.sig.classList.add('on');
    // sample the path once
    if (!this.sigPts) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
      svg.style.position = 'absolute';
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', SIG_PATH);
      svg.appendChild(p);
      this.el.appendChild(svg);
      const pts = [];
      try {
        const L = p.getTotalLength();
        for (let l = 0; l <= L; l += 1.2) { const q = p.getPointAtLength(l); pts.push([q.x, q.y]); }
      } catch { /* no svg geometry */ }
      svg.remove();
      this.sigPts = pts;
    }
    const sr = this.loc($.sig), pp = this.loc($.paper);
    const ox = (sr.x - pp.x) / PX + 4, oy = (sr.y - pp.y) / PX + 2;
    const k = 52 / 170;
    const pts = this.sigPts.map(([x, y]) => [ox + x * k, oy + y * k]);
    if (!pts.length) return;
    this.$.pen.classList.add('writing');
    await this.inkLine(pts, { ms: 1300, col: INK });
    // monocle dot
    const dx = Math.round(ox + 157 * k), dy = Math.round(oy + 22 * k);
    if (!seq.ff) { const sp = this.p2s(dx, dy); this.movePen(sp.x, sp.y, 160); await seq.sleep(170); }
    this.ictx.fillStyle = INK;
    this.ictx.fillRect(dx - 1, dy - 1, 2, 2);
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
      const kf = [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-16px) rotate(-1deg)', offset: 0.25 }, { transform: 'translateY(110vh) rotate(6deg)' }];
      try {
        this.$.board.animate(kf, { duration: 440, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
        for (const e of [this.$.receipt, this.$.note, this.$.go, this.$.pencil]) if (e) e.animate([{ translate: '0 0' }, { translate: '0 110vh' }], { duration: 460, delay: 40, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 430));
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
