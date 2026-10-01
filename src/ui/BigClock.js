// BigClock: the one and only time UI. A big, cute, round pixel-art clock with
// little alarm bells. No text.
//
//   const clock = new BigClock(container, { onSpeed, sfx, icon });
//   clock.update(dt, { hour, phase, day, weekday, speed, paused,
//                      sections: [{ from, to, kind: 'work'|'lunch'|'rush'|'night'|'off' }] });
//   clock.setVisible(on); clock.destroy();
//
// Dial: a 24-hour "day dial": noon at the top, midnight at the bottom (morning
// on the left, evening on the right), so the whole day's schedule fits once
// around the rim as coloured arcs with a tiny pictogram each:
//   work = soft green + fish, lunch = orange + fork/knife,
//   rush = red + bear paw, night = navy + moon, off = sky + sun.
// The short hand is the day hand (one turn a day); the long hand sweeps once an hour.
//
// Moods: calm smile -> (rush < 2h) worried pulse -> (< 1h) wobble -> (< 15min until
// a bit after the start) RING: bells shake, hammer flails, motion lines.
// paused: sleepy face + floating z's. weekday 0 / 'sun' / phase 'off': sun face.
// Click: speed 1x -> 2x -> 3x -> 1x (chevrons on a little plate under the clock), squash, onSpeed(n).
// Size: 68 art px dial at 2x (~144 CSS px) on desktop, 44 art px (~96 px) on phones.
import './bigclock.css';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const INK = '#2a1a14';
const C = {
  face: '#fff8e8',
  faceSh: '#f1e2c4',
  case: '#dcae5a',
  caseHi: '#f6dc96',
  caseSh: '#a87632',
  caseDk: '#7a5020',
  none: '#eadcc0',
  noneSh: '#d8c6a4',
  blush: '#f59aa8',
  hand: INK,
  minute: '#d9453b',
  sweat: '#7cc4f0',
  sun: '#ffd23f',
  sunHi: '#fff1a0',
  sunSh: '#f0a020',
  ray: '#ff9d2e',
  white: '#ffffff',
};
const KIND = {
  work: ['#93d68a', '#6bb468', INK],
  lunch: ['#f8a94c', '#da832c', INK],
  rush: ['#ee5a4e', '#c23b3a', '#fff8e8'],
  night: ['#36437e', '#262f5e', '#fff1a0'],
  off: ['#bfe3f4', '#93c6e0', INK],
};
const PICTO = {
  work: ['.kkk.k', 'k.kkkk', '.kkk.k'],
  lunch: ['k.k.k', 'kkk.k', '.k.kk', '.k..k', '.k..k'],
  rush: ['k.k.k', '.....', '.kkk.', 'kkkkk', '.kkk.'],
  night: ['.kkk', 'kk..', 'kk..', 'kk..', '.kkk'],
  off: ['k.k.k', '.kkk.', 'kkkkk', '.kkk.', 'k.k.k'],
};
const PICTO_S = {
  work: ['.kk.k', 'kkkkk', '.kk.k'],
  lunch: ['k.k.k', 'kkk.k', '.k..k', '.k..k'],
  rush: ['k.k', '...', 'kkk', 'kkk'],
  night: ['.kk', 'k..', 'k..', '.kk'],
  off: ['.k.', 'kkk', '.k.'],
};
const Z = ['kkk', '..k', '.k.', 'k..', 'kkk'];

// join touching sections of the same kind (incl. across midnight) for separators / badges
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
    if (f.kind === l.kind && Math.abs(mod24(l.to) - mod24(f.from)) < 1e-6) {
      f.from = l.from;
      out.pop();
    }
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
const mod24 = (h) => ((h % 24) + 24) % 24;

export class BigClock {
  constructor(container, { onSpeed, sfx, icon } = {}) {
    this.onSpeed = onSpeed || (() => {});
    this.sfx = sfx || (() => {});
    this.icon = icon;
    this.t = 0;
    this.speed = 1;
    this.st = { hour: 9, sections: [], speed: 1, paused: false };
    this.el = document.createElement('div');
    this.el.className = 'bclock';
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
    this._ringed = false;
    this._bellT = 0;
    this._lastMode = '';
  }

  _resize() {
    const small = !!this._mq?.matches;
    this.D = small ? 44 : 68;
    this.S = 2;
    this.W = this.D + 16;
    this.H = this.D + 22;
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

  setVisible(on) {
    this.el.classList.toggle('bclock-hidden', !on);
  }

  destroy() {
    this._mq?.removeEventListener?.('change', this._onMq);
    this.el.remove();
  }

  update(dt, st = {}) {
    dt = clamp(+dt || 0, 0, 0.1);
    this.t += dt;
    if (this._pipPop > 0) this._pipPop -= dt;
    const prev = this.st;
    this.st = { ...prev, ...st };
    if (st.speed != null) this.speed = st.speed;
    const s = this.st;
    const hour = mod24(s.hour ?? 0);
    const sections = s.sections || [];
    const wd = s.weekday;
    this.dayOff = wd === 0 || (typeof wd === 'string' && /^sun/i.test(wd)) || s.phase === 'off' || s.phase === 'dayoff' || !!s.dayOff ||
      (sections.length > 0 && sections.every((x) => x.kind === 'off'));
    // minutes until rush (game hours)
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
      if (mode === 'ring') {
        this._bellT = 0;
        this.sfx('bell');
      }
      this._lastMode = mode;
    }
    if (mode === 'ring') {
      this._bellT += dt;
      if (this._bellT > 0.9) {
        this._bellT = 0;
        this.sfx('bell', { volume: 0.6 });
      }
    }
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
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H - R - 8;
    this.cx = cx;
    this.cy = cy;
    const ringW = D >= 56 ? 8 : 6;
    const caseW = D >= 56 ? 3 : 2;
    const rOut = R - caseW; // ring outer radius
    const rIn = rOut - ringW;
    this.rIn = rIn;
    this.rOut = rOut;
    const px = (x, y, col) => {
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    };
    const dayOff = this.dayOff;
    const merged = mergeSections(sections);
    // feet
    for (const sx of [-1, 1]) {
      const fx = Math.round(cx + sx * R * 0.62), fy = Math.round(cy + R * 0.78);
      for (let y = 0; y < 4; y++)
        for (let x = -2; x <= 2; x++) {
          const edge = y === 3 || Math.abs(x) === 2;
          px(fx + x + sx * y * 0.5, fy + y, edge ? INK : C.caseSh);
        }
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const r = Math.hypot(dx, dy);
        if (r > R + 0.5) {
          // sun rays
          if (dayOff && r <= R + 6) {
            const a = Math.atan2(dy, dx);
            const k = (Math.cos(a * 12) + 1) / 2;
            if (r <= R + 0.5 + k * 5.5) px(x, y, r > R + k * 5.5 - 0.6 || k < 0.25 ? INK : C.ray);
          }
          continue;
        }
        const lit = (-dx - dy) / (R * 1.4); // top-left light
        const dith = (x + y) & 1;
        if (r > R - 0.7) {
          px(x, y, INK);
        } else if (r > rOut) {
          // case
          const col = dayOff ? (lit > 0.35 ? C.sunHi : lit < -0.35 && dith ? C.sunSh : C.sun) : lit > 0.4 ? C.caseHi : lit < -0.3 ? (lit < -0.6 || dith ? C.caseSh : C.case) : C.case;
          px(x, y, col);
        } else if (r > rOut - 1 || (r <= rIn + 0.5 && r > rIn - 0.5)) {
          px(x, y, INK);
        } else if (r > rIn) {
          // schedule ring
          if (dayOff) {
            px(x, y, lit < -0.3 && dith ? C.sunSh : C.sun);
            continue;
          }
          const ang = (Math.atan2(dx, -dy) + TAU) % TAU;
          const hr = mod24((ang / TAU) * 24 + 12);
          const sec = secAt(sections, hr);
          let base = C.none, sh = C.noneSh;
          if (sec && KIND[sec.kind]) [base, sh] = KIND[sec.kind];
          // separator lines at section starts
          let sep = false;
          for (const q of merged) {
            const a = ((q.from - 12) / 24) * TAU;
            const da = Math.abs(((ang - a + TAU * 1.5) % TAU) - Math.PI);
            if (da * r < 0.55) sep = true;
          }
          const rr = (r - rIn) / ringW;
          px(x, y, sep ? INK : rr < 0.28 || (lit < -0.2 && dith) ? sh : base);
        } else {
          // face
          px(x, y, dayOff ? (lit < -0.45 && dith ? C.sunSh : C.sun) : lit < -0.45 && dith ? C.faceSh : C.face);
        }
      }
    // ticks every 3h on the face edge
    if (!dayOff)
      for (let h = 0; h < 24; h += 3) {
        const a = ((h - 12) / 24) * TAU;
        const big = h % 6 === 0;
        const rr = rIn - 2.2;
        const x = Math.round(cx + Math.sin(a) * rr - 0.5), y = Math.round(cy - Math.cos(a) * rr - 0.5);
        px(x, y, INK);
        if (big && D >= 56) {
          const x2 = Math.round(cx + Math.sin(a) * (rr - 1) - 0.5), y2 = Math.round(cy - Math.cos(a) * (rr - 1) - 0.5);
          px(x2, y2, INK);
        }
      }
    // pictogram badges on each section (round, outlined, in the section colour)
    if (!dayOff)
      for (const q of merged) {
        const p = PICTO[q.kind];
        if (!p) continue;
        let len = q.to - q.from;
        if (len <= 0) len += 24;
        const mid = q.from + len / 2;
        const rm = (rIn + rOut) / 2;
        const a = ((mid - 12) / 24) * TAU;
        const [base, , fg] = KIND[q.kind];
        const bcx = cx + Math.sin(a) * rm, bcy = cy - Math.cos(a) * rm;
        const br = D >= 56 ? 5.2 : 4.2;
        for (let y = Math.floor(bcy - br - 1); y <= bcy + br + 1; y++)
          for (let x = Math.floor(bcx - br - 1); x <= bcx + br + 1; x++) {
            const d = Math.hypot(x + 0.5 - bcx, y + 0.5 - bcy);
            if (d <= br - 0.6) px(x, y, base);
            else if (d <= br + 0.5) px(x, y, INK);
          }
        let rows = p;
        if (D < 56) rows = PICTO_S[q.kind];
        const w = rows[0].length, h = rows.length;
        const ox = Math.round(bcx - w / 2), oy = Math.round(bcy - h / 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === 'k') px(ox + x, oy + y, fg);
      }
    this._face = c;
    return c;
  }

  _draw() {
    const g = this.ctx;
    const W = this.W, H = this.H, D = this.D, R = D / 2;
    const face = this._faceLayer();
    const cx = this.cx, cy = this.cy;
    const t = this.t;
    const mode = this.mode || 'calm';
    const big = D >= 56;
    g.clearRect(0, 0, W, H);
    const px = (x, y, col) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    };
    const rows = (r, ox, oy, pal) => {
      for (let y = 0; y < r.length; y++) for (let x = 0; x < r[y].length; x++) if (pal[r[y][x]]) px(ox + x, oy + y, pal[r[y][x]]);
    };

    // ---- bells + hammer (behind the body)
    const ring = mode === 'ring';
    const fr = Math.floor(t * 18);
    for (const sx of [-1, 1]) {
      const sh = ring ? (fr % 2 ? 1 : -1) * sx : 0;
      const bx = cx + sx * R * 0.66 + sh, by = cy - R * 0.74 - (ring && fr % 4 < 2 ? 1 : 0);
      this._bell(px, bx, by, big ? 6 : 4, sx);
      if (ring) {
        // motion lines: three little dashes fanning out from each bell, flickering outwards
        const far = fr % 2 ? 1 : 0;
        const L = big ? 3 : 2;
        const fan = [[0.96, 0.28], [0.7, -0.7], [0.28, -0.96]]; // out, up-out, up
        const r0 = (big ? 8 : 6) + far;
        for (const [ux, uy] of fan) for (let k = 0; k < L; k++) px(bx + sx * ux * (r0 + k), by - 1 + uy * (r0 + k), INK);
      }
    }
    // hammer between the bells
    {
      const hx = cx + (ring ? (fr % 2 ? 3 : -3) : 0), hy = cy - R - (big ? 3 : 2);
      for (let y = 0; y < (big ? 4 : 3); y++) px(cx, cy - R - y + 1, INK);
      for (let x = -1; x <= 1; x++) for (let y = 0; y < 2; y++) px(hx + x, hy + y - 1, x === 0 && y === 0 && !ring ? C.caseHi : INK);
    }

    g.drawImage(face, 0, 0);

    // ---- face expression
    const ey = Math.round(cy + R * 0.02), ex = Math.max(4, Math.round(R * 0.3));
    const my = Math.round(cy + R * 0.3);
    const pal = { k: INK, w: C.white, p: C.blush, b: C.sweat, r: '#e04040' };
    const blink = mode !== 'sleep' && Math.floor(t * 10) % 37 === 0;
    const blush = () => {
      if (!big) return;
      rows(['pp'], cx - ex - 4, ey + 3, pal);
      rows(['pp'], cx + ex + 3, ey + 3, pal);
    };
    if (mode === 'sun') {
      rows(['.k.', 'k.k'], cx - ex - 1, ey, pal);
      rows(['.k.', 'k.k'], cx + ex - 1, ey, pal);
      rows(['k...k', '.kkk.'], cx - 2, my, pal);
      blush();
    } else if (mode === 'sleep') {
      const se = big ? ['k..k', '.kk.'] : ['kk'];
      rows(se, cx - ex - (big ? 2 : 1), ey, pal);
      rows(se, cx + ex - (big ? 1 : 0), ey, pal);
      rows(big ? ['.k.', 'k.k', '.k.'] : ['k'], cx - (big ? 1 : 0), my, pal);
      blush();
      // floating z's (white-outlined so they read over anything), drifting up-right
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.45 + i / 3) % 1;
        if (p > 0.92) continue;
        const zx = Math.round(cx + R * 0.45 + p * (big ? 10 : 7) + Math.sin(p * 7 + i) * 1.2);
        const zy = Math.round(cy - R * 0.62 - p * (big ? 22 : 15));
        const zr = p < 0.3 ? ['kk', '.k', 'kk'] : Z;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) rows(zr, zx + dx, zy + dy, { k: C.white });
        rows(zr, zx, zy, { k: INK });
      }
    } else if (mode === 'ring') {
      rows(big ? ['kk..', '..kk', 'kk..'] : ['k..', '.k.', 'k..'], cx - ex - (big ? 2 : 1), ey - 1, pal);
      rows(big ? ['..kk', 'kk..', '..kk'] : ['..k', '.k.', '..k'], cx + ex - 1, ey - 1, pal);
      const o = fr % 2;
      rows(big ? ['.kkk.', 'kwwwk', 'krrrk', '.kkk.'] : ['kkk', 'krk', 'kkk'], cx - (big ? 2 : 1), my - 1 + o, pal);
      rows(['b', 'bb'], cx + ex + 3, ey - 3, { b: C.sweat });
    } else if (mode === 'wobble') {
      rows(['kk', 'kk'], cx - ex - 1, ey, pal);
      rows(['kk', 'kk'], cx + ex, ey, pal);
      rows(['.k.', 'k.k', '.k.'], cx - 1, my, pal);
      rows(['.b', 'bb', 'bb'], cx + ex + 3, ey - 3, { b: C.sweat });
    } else if (mode === 'pulse' || mode === 'busy') {
      rows(['k..', '.k.'], cx - ex - 1, ey - 2, pal); // worried brows
      rows(['..k', '.k.'], cx + ex - 1, ey - 2, pal);
      rows(blink ? ['kk'] : ['k', 'k'], cx - ex, ey + 1, pal);
      rows(blink ? ['kk'] : ['k', 'k'], cx + ex, ey + 1, pal);
      rows(['.kkk.', 'k...k'], cx - 2, my, pal);
      if (mode === 'pulse') rows(['.b', 'bb'], cx + ex + 3, ey - 2, { b: C.sweat });
    } else {
      // calm / night
      const eye = blink ? ['kk'] : big ? ['kk', 'kk', 'kk'] : ['k', 'k'];
      rows(eye, cx - ex - 1, ey - 1, pal);
      rows(eye, cx + ex - (big ? 1 : 0), ey - 1, pal);
      rows(big ? ['k...k', '.kkk.'] : ['k.k', '.k.'], cx - (big ? 2 : 1), my, pal);
      blush();
    }

    // ---- speed plate under the clock: 1-3 chevrons
    if (mode !== 'sleep') {
      const sp = clamp(this.st.speed || this.speed || 1, 1, 3);
      const chev = big ? ['k..', 'kk.', 'kkk', 'kk.', 'k..'] : ['k.', 'kk', 'k.'];
      const cw = chev[0].length + (big ? 0 : 0);
      const pw = big ? 17 : 12, ph = big ? 9 : 7;
      const pop = this._pipPop > 0.18 ? 1 : 0;
      const x0 = Math.round(cx - pw / 2), y0 = Math.round(cy + R - (big ? 3 : 2)) - pop;
      for (let y = 0; y < ph; y++)
        for (let x = 0; x < pw; x++) {
          const corner = (x === 0 || x === pw - 1) && (y === 0 || y === ph - 1);
          if (corner) continue;
          const edge = x === 0 || x === pw - 1 || y === 0 || y === ph - 1;
          px(x0 + x, y0 + y, edge ? INK : y === 1 ? C.caseHi : y === ph - 2 ? C.caseSh : C.case);
        }
      const colr = sp === 1 ? INK : sp === 2 ? '#c2501c' : C.minute;
      const tot = sp * cw;
      const ox = Math.round(cx - tot / 2), oy = y0 + Math.round((ph - chev.length) / 2);
      for (let i = 0; i < sp; i++) rows(chev, ox + i * cw, oy, { k: colr });
    }

    // ---- hands
    const hour = mod24(this.st.hour ?? 0);
    const ah = ((hour - 12) / 24) * TAU;
    const am = (hour % 1) * TAU;
    const rIn = this.rIn;
    this._hand(px, cx, cy, ah, rIn * 0.62, 2, INK);
    this._hand(px, cx, cy, am, rIn * 0.9, 1, C.minute, INK);
    // center cap
    rows(big ? ['.kk.', 'kwkk', 'kkkk', '.kk.'] : ['kk', 'kk'], cx - (big ? 2 : 1), cy - (big ? 2 : 1), pal);
  }

  _bell(px, bx, by, r, sx) {
    for (let y = -r; y <= 1; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x / (r + 0.5), (y + 0.4) / (r + 0.5));
        if (y > 0 && Math.abs(x) <= r + 1) {
          px(bx + x, by + y, Math.abs(x) === r + 1 || y === 1 ? INK : C.caseSh);
          continue;
        }
        if (d > 1.12) continue;
        const edge = d > 0.86;
        const lit = (-x - y) / r;
        px(bx + x, by + y, edge ? INK : lit > 0.6 ? C.caseHi : lit < -0.5 ? C.caseSh : C.case);
      }
    px(bx, by - r - 1, INK);
  }

  _hand(px, cx, cy, a, L, w, col, outline) {
    const sx = Math.sin(a), sy = -Math.cos(a);
    const n = Math.ceil(L * 2);
    const pts = new Set();
    for (let i = -2; i <= n; i++) {
      const d = (i / n) * L;
      const x = cx + sx * d, y = cy + sy * d;
      if (w >= 2) {
        // thicker: perpendicular spread
        for (let o = -0.5; o <= 0.5; o += 0.5) pts.add(`${Math.floor(x - sy * o)},${Math.floor(y + sx * o)}`);
      } else pts.add(`${Math.floor(x)},${Math.floor(y)}`);
    }
    for (const p of pts) {
      const [x, y] = p.split(',').map(Number);
      px(x, y, col);
    }
    if (outline) {
      const x = Math.floor(cx + sx * L), y = Math.floor(cy + sy * L);
      px(x, y, outline);
    }
  }
}

