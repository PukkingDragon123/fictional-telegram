// BigClock: the one and only time UI. [v26 evening] An antique brass alarm clock: a patinated,
// engraved bezel (verdigris specks, dents) with the day's schedule as thin enamel inlays (work,
// lunch, the 5 PM feast with a tiny bear-head pip, night with a moon pip), an ivory enamel dial
// with fine ticks and Roman numerals, slim blued hands (fleur-de-lis hour hand), a sub-dial for
// the weather / season (game.seasons) or a running seconds hand, a day/date window, the blood-
// moon pip, glass glare, and twin bells that rattle at 5 PM. No face, no text.
//
//   const clock = new BigClock(container, { onSpeed, sfx, icon, game });
//   clock.update(dt, { hour, phase, day, weekday, speed, paused,
//                      sections: [{ from, to, kind: 'work'|'lunch'|'rush'|'night'|'off' }] });
//   clock.setVisible(on); clock.destroy();
//
// Dial: a 24-hour "day dial": noon at the top, midnight at the bottom. The hour hand turns
// once a day, the minute hand sweeps once an hour.
// Moods (CSS): calm -> (feast < 2h) pulse -> (< 1h) wobble -> (< 15 min until just after the
// start) RING: the bells rattle, the hammer flails. paused: the z's drift off the bells.
// weekday 0 / 'sun' / phase 'off': the inlay turns sky blue (day off).
// Click: speed 1x -> 2x -> 3x -> 1x (chevrons on the brass plate under the clock), onSpeed(n).
// Size: 72 art px dial at 2x on desktop, 48 px on phones.
import './bigclock.css';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mod24 = (h) => ((h % 24) + 24) % 24;

const INK = '#2a1a14';
// [v26 evening] antique: patinated brass, ivory enamel, blued steel; the schedule as thin enamel inlays
const C = {
  enamel: '#f1e6cb', enamelSh: '#e4d5b0', enamelDk: '#cdbb92', crack: '#d6c69e', tick: '#3a2a1c', tickL: '#8a7458',
  brass: '#b08a42', brassHi: '#ecd28c', brassLt: '#cfac62', brassSh: '#86642c', brassDk: '#54401c', verd: '#6f8f74', verdL: '#8fae92', dent: '#634a22',
  steel: '#2a3a6e', steelHi: '#5a72b8', red: '#9a2a22', white: '#fbf6e8',
  sun: '#e8b83a', sunSh: '#b8862a', moonRed: '#c8302a', moonDk: '#5a0e10',
};
const KIND = { // thin inlays: [colour, shade]
  work: ['#6f8a5c', '#56704a'], lunch: ['#c08a46', '#9a6c34'], rush: ['#8e2c26', '#6a1e1a'],
  night: ['#2e3864', '#222a4c'], off: ['#7aa4c4', '#5a86a8'],
};
// tiny engraved glyphs (Roman numerals, the date window)
const GL = {
  I: ['k', 'k', 'k', 'k', 'k'], V: ['k.k', 'k.k', 'k.k', 'k.k', '.k.'], X: ['k.k', 'k.k', '.k.', 'k.k', 'k.k'],
  0: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], 1: ['.k', 'kk', '.k', '.k', '.k'], 2: ['kkk', '..k', 'kkk', 'k..', 'kkk'], 3: ['kkk', '..k', '.kk', '..k', 'kkk'],
  4: ['k.k', 'k.k', 'kkk', '..k', '..k'], 5: ['kkk', 'k..', 'kkk', '..k', 'kkk'], 6: ['kkk', 'k..', 'kkk', 'k.k', 'kkk'], 7: ['kkk', '..k', '.k.', '.k.', '.k.'],
  8: ['kkk', 'k.k', 'kkk', 'k.k', 'kkk'], 9: ['kkk', 'k.k', 'kkk', '..k', 'kkk'],
  M: ['k...k', 'kk.kk', 'k.k.k', 'k...k', 'k...k'], W: ['k...k', 'k...k', 'k.k.k', 'kk.kk', 'k...k'],
  O: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], N: ['k..k', 'kk.k', 'k.kk', 'k..k', 'k..k'], T: ['kkk', '.k.', '.k.', '.k.', '.k.'], U: ['k.k', 'k.k', 'k.k', 'k.k', 'kkk'],
  E: ['kkk', 'k..', 'kk.', 'k..', 'kkk'], D: ['kk.', 'k.k', 'k.k', 'k.k', 'kk.'], H: ['k.k', 'k.k', 'kkk', 'k.k', 'k.k'], F: ['kkk', 'k..', 'kk.', 'k..', 'k..'],
  R: ['kk.', 'k.k', 'kk.', 'k.k', 'k.k'], S: ['kkk', 'k..', 'kkk', '..k', 'kkk'], A: ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'],
};
// weather glyphs for the sub-dial (7x7): s = sun, c = cloud, b = drop/blue, y = bolt, w = white
const WX = {
  clear: ['...s...', '.s.s.s.', '..sss..', 'sssssss', '..sss..', '.s.s.s.', '...s...'],
  heat: ['.s.s.s.', '..sss..', 'ssrrrss', '.srrrs.', 'ssrrrss', '..sss..', '.s.s.s.'],
  rain: ['..ccc..', '.ccccc.', 'ccccccc', '.......', '.b.b.b.', 'b.b.b..', '.......'],
  storm: ['..ccc..', '.ccccc.', 'ccccccc', '...yy..', '..yy...', '...y...', '..y....'],
  snow: ['...w...', '.w.w.w.', '..www..', 'wwwwwww', '..www..', '.w.w.w.', '...w...'],
  fog: ['.......', 'ccccc..', '.......', '..ccccc', '.......', 'ccccc..', '.......'],
  wind: ['.......', 'cccc.c.', '....c..', 'cccccc.', '.......', 'ccc.c..', '...c...'],
};
const WXPAL = { s: '#f0a020', r: '#e0402a', c: '#7a8aa8', b: '#3a7ad8', y: '#f0c020', w: '#5a8ad0' };
const SEASON_TINT = { spring: '#cdeeb0', summer: '#ffe9a0', autumn: '#f6c08a', winter: '#dceaff' };
const Z = ['kkk', '..k', '.k.', 'k..', 'kkk'];

function mergeSections(list) {
  const a = list.map((x) => ({ ...x })).sort((p, q) => p.from - q.from);
  const out = [];
  for (const x of a) {
    const l = out[out.length - 1];
    if (l && l.kind === x.kind && Math.abs(mod24(l.to) - mod24(x.from)) < 1e-6) l.to = x.to;
    else out.push(x);
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (f.kind === l.kind && Math.abs(mod24(l.to) - mod24(f.from)) < 1e-6) { f.from = l.from; out.pop(); }
  }
  return out;
}
function secAt(sections, h) {
  for (const s of sections) {
    const a = s.from, b = s.to;
    if (a <= b ? h >= a && h < b : h >= a || h < b) return s;
  }
  return null;
}

export class BigClock {
  constructor(container, { onSpeed, sfx, icon, game } = {}) {
    this.onSpeed = onSpeed || (() => {});
    this.sfx = sfx || (() => {});
    this.icon = icon;
    this.game = game || null;
    this.t = 0;
    this.speed = 1;
    this.st = { hour: 9, sections: [], speed: 1, paused: false };
    this.el = document.createElement('div');
    this.el.className = 'bclock bclock-vintage bclock-antique';
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'bclock-btn';
    this.btn.setAttribute('aria-label', 'Game speed');
    this.cv = document.createElement('canvas');
    this.cv.className = 'bclock-cv';
    this.btn.appendChild(this.cv);
    this.el.appendChild(this.btn);
    container.appendChild(this.el);
    this.ctx = this.cv.getContext('2d');
    this._mq = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px), (max-height: 520px)') : null;
    this._onMq = () => this._resize();
    this._mq?.addEventListener?.('change', this._onMq);
    this._resize();
    this.btn.addEventListener('click', () => this._click());
    this._bellT = 0;
    this._lastMode = '';
    this._glintT = 3;
    this._extraT = 0;
  }

  _resize() {
    const small = !!this._mq?.matches;
    this.D = small ? 48 : 72;
    this.S = 2;
    this.W = this.D + 18;
    this.H = this.D + 26;
    this.cv.width = this.W;
    this.cv.height = this.H;
    this.cv.style.width = this.W * this.S + 'px';
    this.cv.style.height = this.H * this.S + 'px';
    this._faceKey = '';
    this._draw();
  }

  _click() {
    const n = ((this.st.speed || this.speed) % 3) + 1;
    this.speed = n;
    this.st.speed = n;
    this.sfx('click', { pitch: 0.9 + n * 0.15 });
    this.btn.classList.remove('bclock-squash');
    void this.btn.offsetWidth;
    this.btn.classList.add('bclock-squash');
    this._pipPop = 0.35;
    this.onSpeed(n);
    this._draw();
  }

  setVisible(on) { this.el.classList.toggle('bclock-hidden', !on); }

  destroy() {
    this._mq?.removeEventListener?.('change', this._onMq);
    this.el.remove();
  }

  // weather / season / blood moon, read from the game now and then (all optional)
  _readExtras() {
    const g = this.game, s = this.st;
    const x = { wx: null, season: null, label: '', moon: null };
    try {
      const se = g?.seasons;
      if (se) { x.wx = se.weather || null; x.season = se.season || null; const f = se.forecast?.(2); x.tomorrow = f?.[1]?.weather || null; x.label = `${f?.[0]?.label || se.weather || ''}${Number.isFinite(se.temp) ? ` ${Math.round(se.temp)}°C` : ''}`; }
      const m = g?.bearEvents?.moon;
      if (m?.daysUntil && s.day != null) x.moon = { tonight: !!m.isBloodDay?.(s.day), days: m.daysUntil(s.day) };
    } catch { /* optional */ }
    this.extra = x;
    const t = `${x.label ? x.label + ' · ' : ''}${x.moon?.tonight ? 'Blood moon tonight' : x.moon && x.moon.days > 0 ? `Blood moon in ${x.moon.days} day${x.moon.days > 1 ? 's' : ''}` : ''}`;
    if (t !== this._title) { this._title = t; this.btn.title = t ? `${t} (click: game speed)` : 'Game speed'; }
  }

  update(dt, st = {}) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.t += dt;
    if (this._pipPop > 0) this._pipPop -= dt;
    this.st = { ...this.st, ...st };
    if (st.speed != null) this.speed = st.speed;
    const s = this.st;
    this._extraT -= dt;
    if (this._extraT <= 0) { this._extraT = 0.5; this._readExtras(); }
    const hour = mod24(s.hour ?? 0);
    const sections = s.sections || [];
    const wd = s.weekday;
    this.dayOff = wd === 0 || (typeof wd === 'string' && /^sun/i.test(wd)) || s.phase === 'off' || s.phase === 'dayoff' || !!s.dayOff ||
      (sections.length > 0 && sections.every((x) => x.kind === 'off'));
    let toRush = Infinity;
    for (const x of sections) {
      if (x.kind !== 'rush') continue;
      let d = x.from - hour;
      if (d < -12) d += 24;
      if (d > 12) d -= 24;
      if (d > -0.25 && d < toRush) toRush = d;
    }
    if (s.phase === 'rush' && toRush === Infinity) toRush = -0.1;
    let mode = 'calm';
    if (s.paused) mode = 'sleep';
    else if (this.dayOff) mode = 'sun';
    else if (toRush <= 0.25 && toRush > -0.25) mode = 'ring';
    else if (toRush <= 1) mode = 'wobble';
    else if (toRush <= 2) mode = 'pulse';
    else if (secAt(sections, hour)?.kind === 'rush') mode = 'busy';
    else if (secAt(sections, hour)?.kind === 'night') mode = 'night';
    if (mode !== this._lastMode) {
      this.el.classList.remove('bclock-pulse', 'bclock-wobble', 'bclock-ring');
      if (mode === 'pulse' || mode === 'wobble' || mode === 'ring') this.el.classList.add('bclock-' + mode);
      if (mode === 'ring') { this._bellT = 0; this.sfx('bell'); }
      this._lastMode = mode;
    }
    if (mode === 'ring') {
      this._bellT += dt;
      if (this._bellT > 0.9) { this._bellT = 0; this.sfx('bell', { volume: 0.6 }); }
    }
    this._glintT -= dt;
    if (this._glintT < -0.6) this._glintT = 6 + Math.random() * 5;
    this.mode = mode;
    this._draw();
  }

  // ------------------------------------------------------------------ drawing
  _faceLayer() {
    const s = this.st;
    const sections = s.sections || [];
    const key = `${this.D}|${this.dayOff ? 1 : 0}|` + sections.map((x) => `${x.from},${x.to},${x.kind}`).join(';');
    if (key === this._faceKey) return this._face;
    this._faceKey = key;
    const W = this.W, H = this.H, D = this.D, R = D / 2;
    const c = this._face || document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - R - 9;
    this.cx = cx; this.cy = cy;
    const big = D >= 64;
    const bez = big ? 7 : 5, inl = big ? 2 : 1;
    const rOut = R - bez, rIn = rOut - inl;
    this.rIn = rIn; this.rOut = rOut;
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const hsh = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const dayOff = this.dayOff;
    // feet
    for (const sx of [-1, 1]) {
      const fx = Math.round(cx + sx * R * 0.6), fy = Math.round(cy + R * 0.8);
      for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) px(fx + x + Math.round(sx * y * 0.6), fy + y, y === 4 || Math.abs(x) === 2 ? '#2a1c10' : x * sx < 0 ? C.brassLt : C.brassSh);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
      if (r > R + 0.5) continue;
      const lit = (-dx - dy) / (R * 1.4), ang = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
      const h = hsh(x, y);
      if (r > R - 0.7) { px(x, y, '#2a1c10'); continue; }
      if (r > rOut) {
        // patinated brass bezel: worn bright where hands touch it, a beaded groove, engraved scroll, verdigris + dents
        const u = (r - rOut) / bez;
        let col = lit > 0.5 ? C.brassHi : lit > 0.15 ? C.brassLt : lit < -0.5 ? C.brassDk : lit < -0.15 ? C.brassSh : C.brass;
        if (u > 0.4 && u < 0.62) col = Math.floor(ang / (Math.PI * 2) * (big ? 72 : 48)) % 2 ? (lit > 0 ? C.brassSh : C.brassDk) : (lit > 0 ? C.brassLt : C.brassSh);
        else if (u >= 0.62 && big && Math.sin(ang * 36 + u * 9) > 0.55) col = lit > 0 ? C.brass : C.brassDk; // engraved scroll
        if (h < 0.045) col = h < 0.02 ? C.verd : C.verdL;
        else if (h > 0.985) col = C.dent;
        px(x, y, col); continue;
      }
      if (r > rIn - 0.5) {
        // thin enamel inlay: the day's schedule (work / lunch / the feast / night)
        const hr = (((ang / (Math.PI * 2)) * 24 + 12) % 24 + 24) % 24;
        const sec = dayOff ? { kind: 'off' } : secAt(sections, hr);
        const k = sec && KIND[sec.kind];
        px(x, y, k ? (lit < -0.2 && (x + y) & 1 ? k[1] : k[0]) : C.brassSh);
        continue;
      }
      // ivory enamel, aged toward the edge, a few hairline crazing cracks
      let col = r > rIn - 2.5 ? C.enamelSh : lit < -0.45 && (x + y) & 1 ? C.enamelDk : lit < -0.25 ? C.enamelSh : C.enamel;
      if (big && Math.abs(Math.sin(dx * 0.9 + dy * 0.35) * 6 - dy * 0.4) < 0.18 && r > rIn * 0.55) col = C.crack;
      px(x, y, col);
    }
    // a hairline chapter circle, then minute ticks (every 15 min of the day), hour ticks, Roman numerals
    const tickR = rIn - 1.6;
    const steps = big ? 96 : 24;
    for (let i = 0; i < steps; i++) {
      const hr = (i / steps) * 24, a = ((hr - 12) / 24) * Math.PI * 2;
      const hour = Math.abs(hr - Math.round(hr)) < 1e-6, three = hour && Math.round(hr) % 3 === 0;
      const len = three ? (big ? 3 : 2) : hour ? 2 : 1;
      for (let k = 0; k < len; k++) {
        const rr = tickR - k;
        px(Math.round(cx + Math.sin(a) * rr - 0.5), Math.round(cy - Math.cos(a) * rr - 0.5), hour ? C.tick : C.tickL);
      }
    }
    for (let h = 0; h < 24; h += 3) {
      if (!big && h % 6) continue;
      const a = ((h - 12) / 24) * Math.PI * 2;
      const num = ['XII', 'III', 'VI', 'IX'][(h % 12) / 3];
      const glyphs = [...num].map((ch) => GL[ch]);
      const w = glyphs.reduce((s2, gl) => s2 + gl[0].length + 1, -1);
      const rn = tickR - (big ? 6.5 : 4.5);
      if (h === 0 && big) continue; // the date window lives there
      const nx = Math.round(cx + Math.sin(a) * rn - w / 2), ny = Math.round(cy - Math.cos(a) * rn - 2.5);
      let ox = nx;
      for (const gl of glyphs) { gl.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (row[xx] === 'k') px(ox + xx, ny + yy, C.tick); }); ox += gl[0].length + 1; }
    }
    // tiny inlaid pips on the bezel: a bear head at the feast, a moon in the night
    const pip = (hr, rows, col) => {
      const a = ((hr - 12) / 24) * Math.PI * 2, rr = rOut + bez * 0.5;
      const bx = Math.round(cx + Math.sin(a) * rr), by = Math.round(cy - Math.cos(a) * rr);
      rows.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (row[xx] !== '.') px(bx - (row.length >> 1) + xx, by - (rows.length >> 1) + yy, row[xx] === 'k' ? '#2a1c10' : col); });
    };
    if (!dayOff) {
      const rush = sections.find((q) => q.kind === 'rush'), night = mergeSections(sections).find((q) => q.kind === 'night');
      if (rush) pip(rush.from, big ? ['b.b', 'bbb', '.b.'] : ['b.b', 'bbb'], '#e8c8a0');
      if (night) { let len = night.to - night.from; if (len <= 0) len += 24; pip((night.from + len / 2) % 24, big ? ['.mm', 'm..', 'm..', '.mm'] : ['mm', 'm.'], '#f4e6a8'); }
    }
    this._face = c;
    return c;
  }

  _draw() {
    const g = this.ctx;
    const W = this.W, H = this.H, D = this.D, R = D / 2;
    const face = this._faceLayer();
    const cx = this.cx, cy = this.cy, t = this.t, mode = this.mode || 'calm', big = D >= 64;
    const x0 = this.extra || {};
    g.clearRect(0, 0, W, H);
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const rows = (r, ox, oy, pal) => { for (let y = 0; y < r.length; y++) for (let x = 0; x < r[y].length; x++) if (pal[r[y][x]]) px(ox + x, oy + y, pal[r[y][x]]); };

    // ---- twin bells + hammer (behind the case), rattling at the feast
    const ring = mode === 'ring', fr = Math.floor(t * 18);
    for (const sx of [-1, 1]) {
      const sh = ring ? (fr % 2 ? 1 : -1) * sx : 0;
      const bx = cx + sx * R * 0.62 + sh, by = cy - R * 0.78 - (ring && fr % 4 < 2 ? 1 : 0);
      for (let k = 0; k < 4; k++) px(cx + sx * (R * 0.5 - k), cy - R * 0.62 - k * 0.6, C.brassDk);
      this._bell(px, bx, by, big ? 7 : 5);
      if (ring) for (const [ux, uy] of [[0.96, 0.28], [0.7, -0.7], [0.28, -0.96]]) for (let k = 0; k < (big ? 3 : 2); k++) px(bx + sx * ux * ((big ? 9 : 7) + (fr % 2) + k), by - 1 + uy * ((big ? 9 : 7) + (fr % 2) + k), '#2a1c10');
    }
    {
      const hx = cx + (ring ? (fr % 2 ? 3 : -3) : 0), hy = cy - R - (big ? 4 : 3);
      for (let y = 0; y < (big ? 5 : 4); y++) px(cx, cy - R - y + 1, C.brassDk);
      for (let x = -1; x <= 1; x++) for (let y = 0; y < 2; y++) px(hx + x, hy + y - 1, x === 0 && y === 0 && !ring ? C.brassHi : '#2a1c10');
      if (big) for (const [dx, dy] of [[-2, -2], [-1, -3], [0, -3], [1, -3], [2, -2]]) px(cx + dx, hy - 2 + dy, C.brassSh);
    }
    g.drawImage(face, 0, 0);

    // ---- sub-dial: the weather (seasons) or a little running seconds hand
    const sdy = Math.round(cy - R * (big ? 0.26 : 0.3)), sdr = big ? 5 : 4;
    for (let y = -sdr - 1; y <= sdr + 1; y++) for (let x = -sdr - 1; x <= sdr + 1; x++) {
      const d = Math.hypot(x, y);
      if (d <= sdr - 0.5) px(cx + x, sdy + y, x0.season ? SEASON_TINT[x0.season] : C.enamelSh); else if (d <= sdr + 0.6) px(cx + x, sdy + y, C.brassSh);
    }
    if (x0.wx || this.dayOff) {
      const gl = WX[x0.wx || 'clear'] || WX.clear;
      if (big) rows(gl.slice(1, 6).map((r) => r.slice(1, 6)), cx - 2, sdy - 2, WXPAL);
      else rows(gl.filter((_, i) => i % 2 === 0).map((r) => r.split('').filter((_, i) => i % 2 === 0).join('')), cx - 2, sdy - 2, WXPAL);
    } else {
      const sa = ((Date.now() / 1000) % 60) / 60 * Math.PI * 2;
      for (let k = 0; k <= sdr - 1; k++) px(cx + Math.sin(sa) * k, sdy - Math.cos(sa) * k, C.red);
      px(cx, sdy, C.tick);
    }
    // ---- the date window
    {
      const wd = typeof this.st.weekday === 'string' ? this.st.weekday.slice(0, 3).toUpperCase() : '';
      const dayN = String(this.st.day ?? '');
      const txt = big ? `${wd}${wd ? ' ' : ''}${dayN}` : dayN;
      const glyphs = [...txt].map((ch) => (ch === ' ' ? null : GL[ch])).filter((gl, i, a) => gl || a[i] === null);
      let w = 0;
      for (const gl of glyphs) w += gl ? gl[0].length + 1 : 2;
      w = Math.max(5, w - 1);
      const wy = Math.round(cy + R * (big ? 0.4 : 0.36)), wx0 = Math.round(cx - w / 2);
      for (let y = -2; y <= 6; y++) for (let x = -2; x <= w + 1; x++) {
        const edge = y === -2 || y === 6 || x === -2 || x === w + 1;
        px(wx0 + x, wy + y, edge ? C.brassSh : y === -1 ? '#ddd2b8' : C.white);
      }
      let ox = wx0;
      for (const gl of glyphs) {
        if (!gl) { ox += 2; continue; }
        gl.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) if (row[xx] === 'k') px(ox + xx, wy + yy, ox - wx0 > (big ? 12 : -1) ? C.red : C.tick); });
        ox += gl[0].length + 1;
      }
    }
    // ---- blood-moon pip on the bezel (lower right): a red moon + one dot per day to go
    if (x0.moon && (x0.moon.tonight || x0.moon.days <= 6)) {
      const a = 0.62 * Math.PI, rr = R - (big ? 3.5 : 2.5);
      const mx = Math.round(cx + Math.sin(a) * rr), my = Math.round(cy - Math.cos(a) * rr);
      const hot = x0.moon.tonight || x0.moon.days <= 1, on = !hot || Math.floor(t * 3) % 2 === 0, mr = big ? 3 : 2;
      for (let y = -mr - 1; y <= mr + 1; y++) for (let x = -mr - 1; x <= mr + 1; x++) {
        const d = Math.hypot(x, y);
        if (d <= mr + 0.4) px(mx + x, my + y, (x + 1.4) ** 2 + (y - 0.6) ** 2 < (mr - 0.5) ** 2 ? C.moonDk : on ? C.moonRed : '#802020');
        else if (d <= mr + 1.3) px(mx + x, my + y, '#2a1c10');
      }
      if (!x0.moon.tonight) for (let i = 0; i < x0.moon.days; i++) { const aa = a - (i + 1) * (big ? 0.11 : 0.15); px(cx + Math.sin(aa) * rr, cy - Math.cos(aa) * rr, i === 0 && hot ? C.moonRed : C.moonDk); }
    }
    // ---- slim blued hands: the hour hand with a fleur-de-lis spade, a thin minute hand with a counterweight
    const hour = mod24(this.st.hour ?? 0);
    const ah = ((hour - 12) / 24) * Math.PI * 2, am = (hour % 1) * Math.PI * 2, rIn = this.rIn;
    this._hand(px, cx, cy, ah, rIn * 0.58, 1, C.steel);
    this._spade(px, cx, cy, ah, rIn * 0.58, big);
    this._hand(px, cx, cy, am + Math.PI, rIn * 0.2, 1, C.steel);
    const cwx = cx - Math.sin(am) * rIn * 0.2, cwy = cy + Math.cos(am) * rIn * 0.2;
    rows(['.s.', 'sSs', '.s.'], cwx - 1, cwy - 1, { s: C.steel, S: C.steelHi });
    this._hand(px, cx, cy, am, rIn * 0.86, 1, '#1a1420');
    rows(big ? ['.yy.', 'yYyy', 'yyyy', '.yy.'] : ['yy', 'yy'], cx - (big ? 2 : 1), cy - (big ? 2 : 1), { y: C.brass, Y: C.brassHi });

    // ---- the glass: a soft crescent of glare, a faint band, an occasional sweeping glint
    const gr = this.rOut - 1;
    for (let a = -2.5; a <= -1.0; a += 0.05) { const rr = gr - 2; px(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 'rgba(255,255,240,0.5)'); }
    if (big) for (let k = -6; k <= 6; k++) { const xx = cx - gr * 0.35 + k, yy = cy - gr * 0.35 - k; px(xx, yy, 'rgba(255,255,255,0.18)'); px(xx + 1, yy, 'rgba(255,255,255,0.1)'); }
    if (this._glintT < 0) {
      const k = clamp(-this._glintT / 0.6, 0, 1), off = -R + k * D * 1.4;
      for (let i = -R; i <= R; i++) { const x = cx + i, y = cy - i + off; if (Math.hypot(x - cx, y - cy) < gr) { px(x, y, 'rgba(255,255,255,0.45)'); px(x + 1, y, 'rgba(255,255,255,0.25)'); } }
    }
    // ---- paused: the escapement stops; little z's drift off the bells
    if (mode === 'sleep') for (let i = 0; i < 3; i++) {
      const p = (t * 0.45 + i / 3) % 1;
      if (p > 0.92) continue;
      const zx = Math.round(cx + R * 0.55 + p * (big ? 10 : 7)), zy = Math.round(cy - R * 0.7 - p * (big ? 20 : 14));
      const zr = p < 0.3 ? ['kk', '.k', 'kk'] : Z;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) rows(zr, zx + dx, zy + dy, { k: C.white });
      rows(zr, zx, zy, { k: '#2a1c10' });
    }
    // ---- engraved brass speed plate: 1-3 chevrons
    if (mode !== 'sleep') {
      const sp = clamp(this.st.speed || this.speed || 1, 1, 3);
      const chev = big ? ['k..', 'kk.', 'kkk', 'kk.', 'k..'] : ['k.', 'kk', 'k.'];
      const cw = chev[0].length, pw = big ? 17 : 12, ph = big ? 9 : 7;
      const pop = this._pipPop > 0.18 ? 1 : 0;
      const bx0 = Math.round(cx - pw / 2), by0 = Math.round(cy + R - (big ? 3 : 2)) - pop;
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        if ((x === 0 || x === pw - 1) && (y === 0 || y === ph - 1)) continue;
        const edge = x === 0 || x === pw - 1 || y === 0 || y === ph - 1;
        px(bx0 + x, by0 + y, edge ? '#2a1c10' : y === 1 ? C.brassHi : y === ph - 2 ? C.brassSh : C.brass);
      }
      const colr = sp === 1 ? C.brassDk : sp === 2 ? '#8a3a18' : C.red;
      const ox = Math.round(cx - (sp * cw) / 2), oy = by0 + Math.round((ph - chev.length) / 2);
      for (let i = 0; i < sp; i++) rows(chev, ox + i * cw, oy, { k: colr });
    }
  }

  _bell(px, bx, by, r) {
    for (let y = -r; y <= 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x / (r + 0.5), (y + 0.4) / (r + 0.5));
      if (y > 0 && Math.abs(x) <= r + 1) { px(bx + x, by + y, Math.abs(x) === r + 1 || y === 1 ? '#2a1c10' : C.brassSh); continue; }
      if (d > 1.12) continue;
      const edge = d > 0.86, lit = (-x - y) / r;
      px(bx + x, by + y, edge ? '#2a1c10' : lit > 0.55 ? C.brassHi : lit > 0.15 ? C.brassLt : lit < -0.5 ? C.brassSh : (x * 7 + y * 3) % 11 === 0 ? C.verd : C.brass);
    }
    px(bx, by - r - 1, INK);
  }

  _hand(px, cx, cy, a, L, w, col, hi) {
    const sx = Math.sin(a), sy = -Math.cos(a);
    const n = Math.ceil(L * 2);
    const pts = new Map();
    for (let i = -1; i <= n; i++) {
      const d = (i / n) * L, x = cx + sx * d, y = cy + sy * d;
      if (w >= 2) for (let o = -0.5; o <= 0.5; o += 0.5) pts.set(`${Math.floor(x - sy * o)},${Math.floor(y + sx * o)}`, o > 0 && hi ? hi : col);
      else pts.set(`${Math.floor(x)},${Math.floor(y)}`, col);
    }
    for (const [p, c] of pts) { const [x, y] = p.split(',').map(Number); px(x, y, c); }
  }

  // a little open diamond (spade) near the tip of the hour hand
  _spade(px, cx, cy, a, L, big) {
    // a small open diamond near the tip with two little curls (a fleur-de-lis at this size)
    const sx = Math.sin(a), sy = -Math.cos(a), r = big ? 2.2 : 1.5, d = L - r - 0.5;
    const mx = cx + sx * d, my = cy + sy * d;
    for (let i = 0; i < 18; i++) {
      const t2 = (i / 18) * Math.PI * 2, u = Math.cos(t2) * r * 1.3, v = Math.sin(t2) * r * 0.8;
      px(Math.floor(mx + sx * u - sy * v), Math.floor(my + sy * u + sx * v), C.steel);
    }
    if (big) for (const side of [-1, 1]) px(Math.floor(mx - sx * (r + 0.8) - sy * side * 1.6), Math.floor(my - sy * (r + 0.8) + sx * side * 1.6), C.steelHi);
  }

}
