// Animated 2D pixel faces for the critter rigs (moose, deer, beaver). Two
// small canvases per face, drawn texel by texel and redrawn only when the face
// state changes (same approach as foxFace.js):
//   eyes  - head front: eyes, brows, blush, tears
//   mouth - snout / muzzle front: mouth shapes (+ the beaver's buck teeth)
// 4 texels per 0.05 voxel so features line up with the voxel heads.
import { pixTex } from './critterKit.js';

const BASE_PAL = {
  k: '#2a1520', // ink
  K: '#5a2e2a', // soft ink
  w: '#fffaf0', // sclera
  W: '#e2d6dc', // sclera shade
  p: '#1e1018', // pupil / bead eye
  i: '#6a3a24', // iris (bead eyes: lower glow)
  I: '#9a5a34', // iris light
  h: '#ffffff', // highlight
  m: '#8a2434', // mouth
  M: '#4a0f22', // mouth deep
  t: '#ff8a9c', // tongue
  T: '#dc5270', // tongue shade
  e: '#ffffff', // teeth
  E: '#e6dccc', // teeth shade
  r: '#ff7a92', // blush
  R: '#ffb3c2', // blush light
  s: '#8fd8ff', // tears
  S: '#e8f9ff', // tear light
  d: '#3a8ad8', // tear dark
  H: '#ff4468', // heart
  L: '#ffb0c0', // heart light
  D: '#b01c3c', // heart dark
  f: '#8a5a32', // fur (lids)
  F: '#6a4024', // fur dark (lid line)
  b: '#4a2a1a', // brows
};

class Pix {
  constructor(w, h, pal) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h);
    this.keys = Object.keys(pal);
    this.idx = {};
    this.keys.forEach((k, i) => (this.idx[k] = i + 1));
    this.css = [null, ...this.keys.map((k) => pal[k])];
  }
  clear() { this.d.fill(0); }
  set(x, y, ch) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = ch ? this.idx[ch] : 0;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  is(x, y, ch) { return this.get(x, y) === this.idx[ch]; }
  rows(rows, x0, y0, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j];
      for (let i = 0; i < r.length; i++) {
        const ch = r[flip ? r.length - 1 - i : i];
        if (ch === '.' || ch === ' ') continue;
        this.set(x0 + i, y0 + j, ch === '_' ? null : ch);
      }
    }
  }
  line(x0, y0, x1, y1, ch, thick = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let t = 0; t < thick; t++) this.set(x0, y0 + t, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // filled ellipse with optional outline char; centre at texel corners
  oval(cx, cy, rx, ry, fill, edge, clip) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (clip && !clip(x, y)) continue;
        const ein = edge && ((x + 1.5 - cx) / rx) ** 2 + dy * dy > 1 || edge && ((x - 0.5 - cx) / rx) ** 2 + dy * dy > 1 ||
          edge && dx * dx + ((y + 1.5 - cy) / ry) ** 2 > 1 || edge && dx * dx + ((y - 0.5 - cy) / ry) ** 2 > 1;
        this.set(x, y, ein ? edge : typeof fill === 'function' ? fill(x, y, dx, dy) : fill);
      }
  }
  paint(ctx) {
    ctx.clearRect(0, 0, this.w, this.h);
    const d = this.d, w = this.w;
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < w) {
        const c = d[y * w + x];
        if (!c) { x++; continue; }
        let x1 = x + 1;
        while (x1 < w && d[y * w + x1] === c) x1++;
        ctx.fillStyle = this.css[c];
        ctx.fillRect(x, y, x1 - x, 1);
        x = x1;
      }
    }
  }
}

const HEART = ['.kk.kk.', 'kHLkHHk', 'kHHHHHk', 'kHHHHDk', '.kHHDk.', '..kDk..', '...k...'];
const HEART_BIG = ['.kkk.kkk.', 'kHLHkHHHk', 'kHLHHHHHk', 'kHHHHHHDk', '.kHHHHDk.', '..kHHDk..', '...kDk...', '....k....'];

// ------------------------------------------------------------------ eyes
// style 'bead': big glossy chibi ovals.  style 'toon': white sclera + pupil (goofy).
function drawEye(P, cx, cy, side, kind, st, C) {
  const rx = C.rx, ry = C.ry;
  const lx = Math.round((st.lookX || 0) * (C.style === 'toon' ? 1.6 : 1)), ly = Math.round((st.lookY || 0) * 1.2);
  if (st.blink) kind = 'closed';
  const shut = (fn, th = 2) => {
    for (let x = -rx; x <= rx; x += 0.5) {
      const y = fn(x);
      for (let k = 0; k < th; k++) P.set(cx + x, cy + y + k, 'k');
    }
  };
  switch (kind) {
    case 'happy': return shut((x) => -1 + (x * x) / (rx * rx) * 2.6 - 1.3);
    case 'closed': return shut((x) => 1 + (x * x) / (rx * rx) * -1.2 + (Math.abs(x) > rx * 0.7 ? 0 : 0));
    case 'sleep': return shut((x) => 0.5 + (1 - (x * x) / (rx * rx)) * 1.6, 2);
    case 'shut': { // >< squeeze
      const s = side;
      P.line(cx - s * rx * 0.9, cy - ry * 0.55, cx + s * rx * 0.5, cy, 'k', 2);
      P.line(cx + s * rx * 0.5, cy, cx - s * rx * 0.9, cy + ry * 0.55, 'k', 2);
      return;
    }
    case 'heart': P.rows(rx >= 4 ? HEART_BIG : HEART, cx - (rx >= 4 ? 4.5 : 3.5), cy - 4); return;
  }
  if (C.style === 'toon') {
    // sclera + pupil
    const wide = kind === 'wide';
    const Rx = rx * (wide ? 1.15 : 1), Ry = ry * (wide ? 1.15 : 1);
    P.oval(cx, cy, Rx, Ry, (x, y, dx, dy) => (dy > 0.55 ? 'W' : 'w'), 'k');
    const pr = wide ? 1 : 1.6;
    const px = cx + lx - side * 0.3, py = cy + ly + (kind === 'half' ? 1 : 0.3);
    P.oval(px, py, pr + 0.4, pr + 0.9, 'p');
    P.set(px - 1, py - 1.5, 'h');
    if (kind === 'half' || kind === 'focused' || kind === 'sleepy') {
      const lid = kind === 'sleepy' ? 0.35 : kind === 'half' ? -0.05 : -0.3;
      for (let y = Math.floor(cy - Ry - 1); y <= cy + Ry; y++)
        for (let x = Math.floor(cx - Rx - 1); x <= cx + Rx; x++) {
          const xo = (x + 0.5 - cx) * side; // + toward outer corner
          const top = cy + Ry * lid + (kind === 'focused' ? -xo * 0.35 : 0);
          if (y < top && P.get(x, y)) P.set(x, y, 'f');
          else if (y < top + 1 && P.get(x, y)) P.set(x, y, 'F');
        }
    }
    return;
  }
  // bead style
  const wide = kind === 'wide';
  if (wide) {
    P.oval(cx, cy, rx + 0.6, ry + 0.4, 'w', 'k');
    P.oval(cx + lx, cy + ly + 0.5, 1.4, 1.8, 'p');
    P.set(cx + lx - 1, cy + ly - 0.8, 'h');
    return;
  }
  const lid = kind === 'half' ? cy - ry * 0.1 : kind === 'sleepy' ? cy + ry * 0.25 : kind === 'focused' ? cy - ry * 0.35 : -99;
  const clip = (x, y) => {
    if (lid < -50) return true;
    const xo = (x + 0.5 - cx) * side;
    return y >= lid + (kind === 'focused' ? -xo * 0.45 : 0);
  };
  const ox = cx + lx * 0.6, oy = cy + ly * 0.5;
  P.oval(ox, oy, rx, ry, (x, y, dx, dy) => (dy > 0.62 && Math.abs(dx) < 0.55 ? 'I' : dy > 0.28 ? 'i' : 'p'), 'k', clip);
  const hx = Math.floor(ox - rx * 0.5), hy = Math.floor(oy - ry * 0.6);
  const hl = (x, y) => { if (clip(x, y) && P.get(x, y) && !P.is(x, y, 'k')) P.set(x, y, 'h'); };
  const big = kind === 'shiny' ? 2 : 1;
  for (let a = 0; a <= big; a++) for (let b = 0; b <= big; b++) hl(hx + a, hy + b);
  if (rx >= 4) { hl(hx + big + 1, hy + 1); hl(hx + 1, hy + big + 1); }
  hl(Math.floor(ox + rx * 0.35), Math.floor(oy + ry * 0.25)); hl(Math.floor(ox + rx * 0.35), Math.floor(oy + ry * 0.25) + 1);
  if (kind === 'shiny') { hl(Math.floor(ox + rx * 0.35) - 1, Math.floor(oy + ry * 0.3)); hl(hx + 4, hy + 4); }
  if (lid > -50) {
    // lid line
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx; x++) {
      const xo = (x + 0.5 - cx) * side;
      const y = Math.floor(lid + (kind === 'focused' ? -xo * 0.45 : 0));
      if (Math.abs((x + 0.5 - cx) / (rx + 0.6)) <= 1) { P.set(x, y, 'k'); P.set(x, y - 1, kind === 'sleepy' ? 'k' : null); }
    }
  }
  if (C.lash && kind !== 'sleepy') {
    // a little outer lash flick
    const ex = cx + side * (rx + 0.3), ey = (lid > -50 ? lid : cy - ry * 0.55);
    P.set(ex, ey, 'k'); P.set(ex + side, ey - 1, 'k');
  }
}

const BROWS = {
  up: (x) => -0.5 * x * x * 0.08 - 0.6,
  angry: (x, xo) => xo * 0.42 + 0.6,
  worried: (x, xo) => -xo * 0.4,
  flat: () => 0,
  raised: (x) => -1.6 + x * x * 0.03,
};
function drawBrow(P, cx, cy, side, kind, C) {
  const fn = BROWS[kind];
  if (!fn) return;
  const y0 = cy - C.ry - 2.6;
  const w = C.rx * 0.85;
  for (let x = -w; x <= w; x += 0.5) {
    const xo = x * side;
    const y = y0 + fn(x, xo);
    P.set(cx + x, y, 'b'); P.set(cx + x, y + 1, 'b');
  }
}

function drawOverlays(P, st, C) {
  if (st.blush) {
    for (const b of C.blush) {
      const w = C.blushW || 4;
      for (let x = -w; x <= w; x++)
        for (let y = -1; y <= 1; y++) {
          if (Math.abs(x) === w && y !== 0) continue;
          if (P.get(b.x + x, b.y + y)) continue;
          P.set(b.x + x, b.y + y, (x + y) % 3 === 0 && st.blush > 1 ? 'R' : 'r');
        }
      if (st.blush > 1) for (let x = -w + 1; x <= w - 1; x += 2) P.set(b.x + x, b.y - 1, 'R');
    }
  }
  if (st.tear) {
    const tt = Math.floor((st.t || 0) * 10);
    for (const [i, e] of C.eyes.entries()) {
      const side = i === 0 ? -1 : 1;
      const x = e.x + side * (C.rx - 1);
      const y0 = e.y + C.ry * 0.4;
      if (st.tear >= 2) {
        // streams shooting out sideways (belly laugh)
        for (let k = 0; k < 7; k++) {
          const ph = (k + tt) % 7;
          const px = x + side * (1 + ph * 0.8), py = y0 + ph * 0.9 + ph * ph * 0.05;
          P.set(px, py, ph % 3 === 0 ? 'S' : 's');
          if (ph > 2) P.set(px, py + 1, 'd');
        }
      } else {
        P.set(x, y0, 's'); P.set(x, y0 + 1, 's'); P.set(x - side, y0 + 1, 'S'); P.set(x, y0 + 2, 'd');
      }
    }
  }
}

// ------------------------------------------------------------------ mouths
// Mouth canvas: C.mw x C.mh texels, mouth anchor at (C.mx, C.my) = under the nose.
function drawMouth(P, kind, st, C) {
  const cx = C.mx, cy = C.my;
  const beaver = C.mstyle === 'beaver';
  const hw = C.mHalf || 4;
  const teeth = () => {
    if (!beaver) return;
    const tw = 2, th = kind === 'open' || kind === 'laugh' || kind === 'yell' ? 4 : 4;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? cx - tw - 0.5 : cx + 0.5;
      for (let y = cy; y < cy + th; y++)
        for (let x = x0; x < x0 + tw; x++) P.set(x, y, y === cy + th - 1 ? 'E' : 'e');
      for (let y = cy; y <= cy + th; y++) P.set(s < 0 ? x0 - 1 : x0 + tw, y, 'k');
      for (let x = x0 - 1; x <= x0 + tw; x++) P.set(x, cy + th, 'k');
    }
    P.line(cx, cy, cx, cy + th, 'k');
  };
  const wline = (amp = 1.6, w = hw) => {
    // ":3" mouth, two small arcs from the philtrum
    for (const s of [-1, 1])
      for (let x = 0; x <= w; x += 0.5) {
        const u = x / w;
        P.set(cx + s * x - (s < 0 ? 1 : 0), cy + Math.sin(u * Math.PI) * amp, 'k');
      }
  };
  const arc = (amp, w = hw, y0 = cy, ch = 'k') => {
    for (let x = -w; x <= w; x += 0.5) P.set(cx + x - 0.5, y0 + amp * (1 - (x * x) / (w * w)), ch);
  };
  const openD = (w, h, tongue = true) => {
    // flat-top, rounded bottom
    for (let y = 0; y <= h; y++)
      for (let x = -w; x <= w; x++) {
        const u = x / (w + 0.5), v = y / (h + 0.5);
        if (u * u + v * v > 1) continue;
        const edge = (x - 1) ** 2 / (w + 0.5) ** 2 + v * v > 1 || (x + 1) ** 2 / (w + 0.5) ** 2 + v * v > 1 || u * u + ((y + 1) / (h + 0.5)) ** 2 > 1 || y === 0;
        let c = edge ? 'k' : y < 2 ? 'M' : 'm';
        if (!edge && tongue && y >= h - 2 && Math.abs(x) <= w * 0.6) c = y === h - 2 ? 'T' : 't';
        P.set(cx + x - 0.5, cy + y, c);
      }
    if (!beaver && C.mstyle !== 'deer') for (let x = -w + 1; x <= w - 1; x++) P.set(cx + x - 0.5, cy + 1, 'e');
  };
  const ov = (rx, ry, oy = 1.5) => P.oval(cx, cy + oy + ry, rx, ry, (x, y, dx, dy) => (dy > 0.3 ? 'm' : 'M'), 'k');
  switch (kind) {
    case 'smile': if (beaver || C.mstyle === 'deer') wline(1.6); else arc(2.2, hw + 1); break;
    case 'grin': openD(hw, 3, true); break;
    case 'open': case 'laugh': openD(hw + 1, kind === 'laugh' ? 5 : 4, true); break;
    case 'yell': ov(hw * 0.6 + 0.5, 3, 1); break;
    case 'o': ov(1.6, 2, 1.5); break;
    case 'sip': ov(1, 1, 1.5); break;
    case 'flat': P.line(cx - hw * 0.5, cy + 2, cx + hw * 0.5 - 1, cy + 2, 'k'); break;
    case 'frown': arc(-1.8, hw * 0.7, cy + 3.5); break;
    case 'blep': wline(1.4); P.set(cx + 1, cy + 2, 't'); P.set(cx + 2, cy + 2, 't'); P.set(cx + 1, cy + 3, 'T'); P.set(cx + 2, cy + 3, 't'); P.set(cx + 3, cy + 3, 'k'); P.set(cx, cy + 3, 'k'); P.set(cx + 1, cy + 4, 'k'); P.set(cx + 2, cy + 4, 'k'); break;
    case 'chew1': wline(1, hw * 0.6); break;
    case 'chew2': ov(1.4, 1.4, 1); break;
    case 'cheeky': wline(2.2, hw); break;
    default: wline(1.6);
  }
  if (beaver) teeth();
}

// ------------------------------------------------------------------ class
/** Config: { w, h, eyes: [{x, y} (viewer-left first)], rx, ry, style: 'bead'|'toon', lash, blush: [{x, y}], blushW, mw, mh, mx, my, mstyle, mHalf, pal } */
export class CritterFace {
  constructor(cfg) {
    // smaller, cuter eyes on the big chibi heads
    cfg = { ...cfg, rx: (cfg.rx || 4) * 0.7, ry: (cfg.ry || 4) * 0.7 };
    this.cfg = cfg;
    const pal = { ...BASE_PAL, ...(cfg.pal || {}) };
    const mk = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return { c, ctx: c.getContext('2d'), tex: pixTex(c), pix: new Pix(w, h, pal), key: '' };
    };
    this.eyes = mk(cfg.w, cfg.h);
    this.mouth = mk(cfg.mw, cfg.mh);
  }
  /** st: { eyes, brows, mouth, blush, tear, lookX, lookY, blink, t } */
  update(st) {
    const C = this.cfg;
    const ft = st.tear >= 2 ? Math.floor((st.t || 0) * 10) : 0;
    const lx = Math.round((st.lookX || 0) * 2) / 2, ly = Math.round((st.lookY || 0) * 2) / 2;
    const ek = `${st.eyes}|${st.brows}|${st.blush}|${st.tear}|${lx}|${ly}|${st.blink ? 1 : 0}|${ft}`;
    if (ek !== this.eyes.key) {
      this.eyes.key = ek;
      const P = this.eyes.pix;
      P.clear();
      const s2 = { ...st, lookX: lx, lookY: ly };
      C.eyes.forEach((e, i) => {
        const side = i === 0 ? -1 : 1;
        drawEye(P, e.x, e.y, side, st.eyes || 'open', s2, C);
        if (st.eyes !== 'heart') drawBrow(P, e.x, e.y, side, st.brows, C);
      });
      drawOverlays(P, st, C);
      P.paint(this.eyes.ctx);
      this.eyes.tex.needsUpdate = true;
    }
    const mk = `${st.mouth}`;
    if (mk !== this.mouth.key) {
      this.mouth.key = mk;
      const P = this.mouth.pix;
      P.clear();
      drawMouth(P, st.mouth || 'smile', st, C);
      P.paint(this.mouth.ctx);
      this.mouth.tex.needsUpdate = true;
    }
  }
  dispose() { this.eyes.tex.dispose(); this.mouth.tex.dispose(); }
}

/** Shared expression table; characters extend it. */
export const BASE_EXPRS = {
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 1, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'flat', blush: 0, tear: 0 },
  love: { eyes: 'heart', brows: null, mouth: 'grin', blush: 2, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  laugh: { eyes: 'shut', brows: 'up', mouth: 'laugh', blush: 1, tear: 2 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  sip: { eyes: 'happy', brows: null, mouth: 'sip', blush: 1, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  worried: { eyes: 'open', brows: 'worried', mouth: 'frown', blush: 0, tear: 0 },
  asleep: { eyes: 'sleep', brows: null, mouth: 'chew2', blush: 1, tear: 0 },
  // [v20 npc rigs] the fox's mood set, so dialogue moods (NpcTalk3D.mood) land on every neighbour
  sad: { eyes: 'half', brows: 'worried', mouth: 'frown', blush: 0, tear: 1 },
  angry: { eyes: 'focused', brows: 'angry', mouth: 'yell', blush: 0, tear: 0 },
  excited: { eyes: 'shiny', brows: 'up', mouth: 'open', blush: 1, tear: 0 },
  scared: { eyes: 'wide', brows: 'worried', mouth: 'yell', blush: 0, tear: 0 },
  think: { eyes: 'half', brows: 'raised', mouth: 'flat', blush: 0, tear: 0 },
  shout: { eyes: 'wide', brows: 'angry', mouth: 'yell', blush: 0, tear: 0 },
  tsk: { eyes: 'half', brows: 'flat', mouth: 'frown', blush: 0, tear: 0 },
  content: { eyes: 'happy', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  yum: { eyes: 'happy', brows: 'up', mouth: 'blep', blush: 1, tear: 0 },
};
