// DeliveryTracker: Moose Express parcel tags hanging on the left edge of the
// screen, under the coin HUD. One paper luggage tag per e-Buy order with an
// animated chibi moose (packing / riding / ringing the bell / thumbs up), the
// phase, a countdown and a little road with the moose heading for the mailbox.
//
//   const tr = new DeliveryTracker(root, { icon, sfx, onClick })
//   tr.update([{ id, label, phase: 'packing'|'riding'|'arriving'|'delivered', eta, progress, count }])
//       call as often as you like (~4x/s): the DOM is diffed, animations never restart.
//       eta = seconds remaining, progress = 0..1 overall. A 'delivered' tag slides away
//       ~1.5 s later (and stays gone even if the order is still reported); an order that
//       disappears from the list slides away at once.
//   tr.destroy()
//   onClick(id)  - the whole tag is a button (the game flies the camera to the moose).
//
// Layer: .dt (position absolute; left 14px; top 116px; z-index 18) inside `root`.
// Max 3 tags, then a "+N more" slip. All art is procedural (pixel strings + canvas).
import './fonts.css';
import './tracker.css';
import { paperTexture, injectPaperCSS, PX } from './paper.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const PHASES = ['packing', 'riding', 'arriving', 'delivered'];
const LABEL = { packing: 'Packing…', riding: 'On the road', arriving: 'Almost there!', delivered: 'Delivered!' };
const MAX_TAGS = 3;
const S = 2; // css px per art px for the moose

// ===========================================================================
// pixel kit
// ===========================================================================
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function rgba(h) {
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
}
const mixHex = (a, b, t) => { const A = rgba(a), B = rgba(b); return '#' + A.slice(0, 3).map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function sph(ramp, x, y, nx, ny) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const l = -0.42 * nx - 0.6 * ny + 0.68 * nz + (bay(x, y) - 0.5) * 0.16;
  const th = ramp.length >= 4 ? [0.12, 0.48, 0.86] : ramp.length === 3 ? [0.3, 0.82] : [0.5];
  let i = 0;
  while (i < th.length && i < ramp.length - 1 && l > th[i]) i++;
  return ramp[i];
}
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h && c) this.p[y * this.w + x] = c; return this; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.p[y * this.w + x]; }
  ell(cx, cy, rx, ry, c, o = {}) {
    const R = Math.max(rx, ry) + 1, cs = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      let dx = x - cx, dy = y - cy;
      if (o.rot) { const t = dx * cs + dy * sn; dy = -dx * sn + dy * cs; dx = t; }
      const nx = dx / rx, ny = dy / ry;
      if (nx * nx + ny * ny > 1.06) continue;
      if (o.clip && !o.clip(x, y)) continue;
      this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny) : Array.isArray(c) ? sph(c, x, y, Math.min(1, nx), Math.min(1, ny)) : c);
    }
    return this;
  }
  rows(x0, y0, rows, pal) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch !== '.' && ch !== ' ' && pal[ch]) this.set(x0 + i, y0 + j, pal[ch]); } });
    return this;
  }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      this.set(x, y, c);
      if (w > 1) this.set(x + 0.5, y, c);
    }
    return this;
  }
  ring(cx, cy, r0, r1, c) {
    for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r0 && d <= r1) this.set(x, y, typeof c === 'function' ? c(x, y, d) : c);
    }
    return this;
  }
  outline(ink = '#1c0f0a', amt = 0.74) {
    const out = this.p.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.p[y * this.w + x]) continue;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const c = this.get(x + dx, y + dy);
        if (c && rgba(c)[3] > 160) { out[y * this.w + x] = mixHex(c, ink, amt); break; }
      }
    }
    this.p = out;
    return this;
  }
  draw(ctx, ox = 0, oy = 0) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.p[y * this.w + x];
      if (!c) continue;
      const v = rgba(c);
      ctx.fillStyle = `rgba(${v[0]},${v[1]},${v[2]},${(v[3] / 255).toFixed(3)})`;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

// ===========================================================================
// the chibi moose (24 x 24 art px per frame)
// ===========================================================================
const C = {
  fur: ['#4a2a18', '#603820', '#7a4a2a', '#94603a'],
  muz: ['#8e6240', '#a87850', '#c89c70'],
  ant: ['#cdb486', '#eedcae', '#fbf3dc'],
  cap: ['#1a2244', '#26325e', '#3a4a80'], band: '#ffd22e', badge: '#e0402e',
  vest: ['#244ea8', '#2f62c8', '#4a80e0'], stripe: '#fff070',
  red: ['#80202e', '#d9453b', '#f07a52'],
  tire: '#2a2430', rim: '#8c92aa', spoke: '#c4c8d8', hub: '#eef0f8',
  kraft: ['#8a5a30', '#b8885c', '#d4a878', '#ecc898'], tape: '#f4ead0', tapeD: '#d8c8a0',
  hoof: '#2e2422', eye: '#160e10', blush: '#e07060', bell: ['#b0661a', '#ffd23f', '#fff6b0'],
};
const PAL = {
  a: C.ant[1], A: C.ant[2], b: C.ant[0],
  f: C.fur[2], F: C.fur[3], d: C.fur[1], D: C.fur[0],
  m: C.muz[1], M: C.muz[2], o: C.muz[0], n: '#3a2014',
  k: C.eye, w: '#ffffff', p: C.blush, t: '#f07888',
  c: C.cap[1], C: C.cap[2], q: C.cap[0], y: C.band, r: C.badge,
  v: C.vest[1], V: C.vest[2], u: C.vest[0], s: C.stripe, h: C.hoof,
};
// front-view head (16 x 14), eyes looking ahead / down
const HEAD_F = [
  'AA.AA......AA.AA',
  'aaaaa.cCcc.aaaaa',
  '.aaab.cccc.baaa.',
  '...bbqyyyyqbb...',
  'ee..ffFFffff..ee',
  'eeefFFffffffdeee',
  '...fFkffffkfd...',
  '...ffkffffkfd...',
  '...pfffffffdp...',
  '....mmMMmmmo....',
  '...mMMmmmmmmo...',
  '...mmnmmmmnmo...',
  '....omMmmmmo....',
  '.....oooooo.....',
];
const HEAD_F_DOWN = HEAD_F.map((r, y) => (y === 6 ? '...fFFffffffd...' : y === 7 ? '...ffkffffkfd...' : y === 8 ? '...pfkffffkdp...' : r));
// side-view head facing right (15 x 12)
const HEAD_S = [
  '.AA.AA.........',
  '.aaaaa..qcc....',
  '..aaab.cCCCcc..',
  '....bbqyyyyyqq.',
  '..ee.fffffffq..',
  '.eeefFFfffkff..',
  '...efFffffkffmm',
  '....fffffffmmMm',
  '....dffffmmmmMm',
  '.....dfffmmmmmn',
  '......ddoommmo.',
  '.......dd......',
];
function drawHeadF(g, x, y, down) {
  g.rows(x, y, down ? HEAD_F_DOWN : HEAD_F, { ...PAL, e: C.fur[2] });
}
function drawHeadS(g, x, y) { g.rows(x, y, HEAD_S, { ...PAL, e: C.fur[1] }); }
function wheel(g, cx, cy, ang) {
  g.ring(cx, cy, 2.6, 3.7, C.tire);
  g.ring(cx, cy, 2.0, 2.6, C.rim);
  for (let k = 0; k < 4; k++) {
    const a = ang + (k * Math.PI) / 2;
    for (let r = 0.8; r <= 2.1; r += 0.5) g.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, C.spoke);
  }
  g.set(cx, cy, C.hub);
}
// two-bone leg from hip to foot (knee bends forward)
function leg(g, hx, hy, fx, fy, col, L = 4.2) {
  const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), L * 2 - 0.01);
  const a = Math.atan2(dy, dx), b = Math.acos(d / (2 * L));
  const kx = hx + Math.cos(a - b) * L, ky = hy + Math.sin(a - b) * L;
  g.line(hx, hy, kx, ky, col, 2); g.line(kx, ky, fx, fy, col, 2);
  g.set(fx, fy, C.hoof); g.set(fx + 1, fy, C.hoof);
}
function bike(g, crankAng, wheelAng) {
  const RW = [5.5, 19.5], FW = [18.5, 19.5], CR = [11.5, 19.5];
  wheel(g, RW[0], RW[1], wheelAng);
  wheel(g, FW[0], FW[1], wheelAng + 0.4);
  const fr = C.red[1], frd = C.red[0];
  g.line(RW[0], RW[1], CR[0], CR[1], frd);      // chain stay
  g.line(RW[0], RW[1], 9, 14, frd);             // seat stay
  g.line(CR[0], CR[1], 9, 14, fr);              // seat tube
  g.line(9, 14, 15.5, 14, fr);                  // top tube
  g.line(CR[0], CR[1], 15.5, 15, fr);           // down tube
  g.line(15.5, 13, FW[0], FW[1], fr);           // fork
  g.line(15.5, 13, 17.5, 11.5, frd);            // stem
  g.set(18, 11.5, '#2a2430'); g.set(19, 11.5, '#2a2430'); // grip
  g.rows(7, 13, ['qqqq'], { q: '#3a2a26' });    // saddle
  g.line(2, 14.5, 8, 14.5, C.rim);              // rack
  // parcel on the rack
  g.rows(1, 10, ['kkkkkk', 'KkTkkK', 'TTTTTT', 'KkTkkk'], { k: C.kraft[2], K: C.kraft[1], T: C.tape });
  // crank + chainring
  g.ring(CR[0], CR[1], 0, 1.3, '#5e5868');
  g.set(CR[0] + Math.cos(crankAng) * 2, CR[1] + Math.sin(crankAng) * 2, '#3a3440');
}
function riderBody(g, bob) {
  g.ell(10.6, 10.6 + bob, 2.8, 3.3, C.vest, { rot: 0.45 });
  g.line(8.6, 11.8 + bob, 12, 9.4 + bob, C.stripe);
  g.set(12.4, 9 + bob, C.band); // badge
}

function frameRiding(i) {
  const g = new Pix(24, 24);
  const cr = (i / 4) * Math.PI * 2, bob = i % 2 ? 1 : 0;
  // far leg (behind the bike)
  leg(g, 9.6, 12.8 + bob, 11.5 + Math.cos(cr + Math.PI) * 2, 19.5 + Math.sin(cr + Math.PI) * 2, C.fur[0]);
  bike(g, cr, -cr * 0.9);
  riderBody(g, bob);
  drawHeadS(g, 8, 1 + bob);
  // near leg + arm to the grip
  leg(g, 9.8, 13 + bob, 11.5 + Math.cos(cr) * 2, 19.5 + Math.sin(cr) * 2, C.fur[3]);
  g.line(11.4, 10.8 + bob, 17.6, 12, C.fur[3], 2);
  g.set(18, 11.5, C.hoof); g.set(18, 12.5, C.hoof);
  g.outline();
  return { g, post: (p) => {
    // speed lines + dust, no ink outline
    const sh = (i * 3) % 8;
    for (const [y, len, x0] of [[5, 4, 0], [9, 3, 3], [15, 3, 0]]) for (let k = 0; k < len; k++) p.set(((x0 + sh + k) % 9) - 1, y + (i % 2), '#3b241466');
    p.set(1 - (i % 2), 22, '#c8b89888'); p.set(0, 21 + (i % 2), '#c8b89866');
  } };
}
function frameArriving(i) {
  const g = new Pix(24, 24);
  leg(g, 9.6, 12.8, 11.5 - 2, 19.5, C.fur[0]);
  bike(g, 0, 0.3);
  riderBody(g, 0);
  drawHeadS(g, 8, 1);
  leg(g, 9.8, 13, 13.5, 21.5, C.fur[3]);
  // bell on the bars + near arm flicking it
  g.rows(20, 12, ['.b.', 'bBb'], { b: C.bell[1], B: C.bell[2] });
  g.line(11.4, 10.8, 18, 11.6, C.fur[3], 2);
  g.set(19, 12 - i, C.hoof); g.set(18, 11.5, C.hoof);
  // "!" pops up behind him
  g.rows(2, i ? 1 : 2, ['rr', 'RR', 'RR', 'RR', '..', 'RR'], { r: C.red[2], R: C.red[1] });
  g.outline();
  return { g, post: (p) => {
    const ln = '#3b2414aa';
    if (i === 0) { p.set(23, 12, ln); p.set(23, 15, ln); }
    else { p.set(23, 11, ln); p.set(23, 13, ln); p.set(23, 15, ln); p.set(22, 16, ln); }
  } };
}
function framePacking(i) {
  const g = new Pix(24, 24);
  drawHeadF(g, 3, 1, true);
  // box: top face + front face
  const K = C.kraft;
  for (let y = 12; y <= 22; y++) for (let x = 3; x <= 20; x++) {
    let c = y <= 13 ? (y === 12 ? K[3] : K[2]) : (x === 3 || x === 20 ? K[0] : y === 22 ? K[0] : K[1]);
    if (y > 13 && (x + y * 3) % 7 === 0) c = K[0];
    if (y === 13 && x >= 11 && x <= 12) c = K[0];
    g.set(x, y, c);
  }
  // tape strip down the front, growing per frame
  const end = [15, 18, 21][i];
  for (let y = 12; y <= end; y++) { g.set(11, y, C.tape); g.set(12, y, y === end ? C.tapeD : C.tape); }
  // fragile label + Moose Express sticker
  g.rows(5, 16, ['wwwww', 'wkkkw', 'wkkww', 'wwwww'], { w: '#fffaf0', k: '#9a8a74' });
  g.rows(15, 18, ['yyy', 'yRy'], { y: C.band, R: C.badge });
  // hooves: left resting on the box, right working the tape gun
  g.rows(2, 11, ['hh', 'hh'], { h: C.hoof });
  g.rows(13, end - 1, ['RRR.', 'RgggT', '.RR.'], { R: C.red[1], g: '#d8dce8', T: C.tapeD });
  g.rows(16, end - 2, ['ff', 'hh'], { f: C.fur[2], h: C.hoof });
  g.outline();
  return { g, post: (p) => {
    const ln = '#3b2414aa';
    p.set(19, end - 2 + (i % 2), ln); p.set(20, end - 1, ln); p.set(19, end + 1, ln);
    if (i === 2) { p.set(21, end, ln); p.set(22, end - 2, ln); }
  } };
}
function frameDelivered(i) {
  const g = new Pix(24, 24);
  // open box with flaps out
  const K = C.kraft;
  g.rows(13, 13, ['KK.......KK', '.KK.....KK.', '..kkkkkkk..'], { K: K[3], k: K[2] });
  for (let y = 16; y <= 22; y++) for (let x = 14; x <= 22; x++) g.set(x, y, x === 14 || x === 22 || y === 22 ? K[0] : y === 16 ? '#4a2a18' : K[1]);
  g.rows(17, 18, ['yyy', 'yRy'], { y: C.band, R: C.badge });
  // moose (front), right arm up: thumbs up
  g.ell(7.5, 19.6, 4.4, 4.2, C.vest);
  g.rows(4, 19, ['sssssss'], { s: C.stripe });
  drawHeadF(g, 0, 3 - i, false);
  g.rows(6, 15 - i, ['k..k', '.kk.'], { k: '#5a2414' });
  g.line(10.5, 18, 12.2, 14.4 - i, C.fur[3], 2);
  g.rows(11, 9 - i, ['.h.', '.h.', 'hhh', 'hhh', 'hh.'], { h: C.hoof });
  g.outline();
  return { g, post: (p) => {
    const sp = (x, y, big) => { p.set(x, y, '#ffffff'); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, '#ffd23f'); if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) p.set(x + dx, y + dy, '#ffe98acc'); };
    if (i === 0) { sp(18, 10, true); sp(21, 4, false); sp(15, 4, false); }
    else { sp(20, 7, false); sp(16, 4, true); sp(22, 11, false); }
  } };
}
const FRAMES = { packing: [framePacking, 3, 0.75], riding: [frameRiding, 4, 0.42], arriving: [frameArriving, 2, 0.5], delivered: [frameDelivered, 2, 0.7] };

// strip of frames -> data URL (scaled by S)
const stripCache = new Map();
function strip(phase) {
  if (stripCache.has(phase)) return stripCache.get(phase);
  const [fn, n, dur] = FRAMES[phase];
  const c = document.createElement('canvas');
  c.width = 24 * n * S; c.height = 24 * S;
  const tmp = document.createElement('canvas');
  tmp.width = 24 * n; tmp.height = 24;
  const tx = tmp.getContext('2d');
  for (let i = 0; i < n; i++) {
    const { g, post } = fn(i);
    post?.(g);
    g.draw(tx, i * 24, 0);
  }
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(tmp, 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), n, dur, w: 24 * S, h: 24 * S };
  stripCache.set(phase, out);
  return out;
}

// small road pieces: moose-head marker, mailbox (flag down / up), parcel start
const MINI_HEAD = [
  'aa.......aa',
  'aab.qq.baa.',
  '.bbqyyqbb..',
  '..fFffffd..',
  '..fkffkfd..',
  '..mmMMmmo..',
  '..mnmmnmo..',
  '...oooooo..',
];
function miniURL(kind) {
  const key = 'mini' + kind;
  if (stripCache.has(key)) return stripCache.get(key);
  let g;
  if (kind === 'head') {
    g = new Pix(13, 10);
    g.rows(1, 1, MINI_HEAD.map((r) => r.slice(0, 11)), PAL);
  } else if (kind === 'parcel') {
    g = new Pix(9, 8);
    g.rows(1, 1, ['kkkkkkk', 'KkkTkkK', 'TTTTTTT', 'KkkTkkK', 'KKKKKKK'], { k: C.kraft[2], K: C.kraft[1], T: C.tape });
  } else {
    const up = kind === 'mail-up';
    g = new Pix(13, 14);
    g.rows(1, 1, [
      up ? '.......rR...' : '............',
      up ? '..ggggrRR...' : '..gggg......',
      '.gGGGGGg....',
      'gGGGGGGGg...',
      'dGGGGGGGg' + (up ? '...' : 'rRR'),
      'dGGGGGGGg' + (up ? '...' : '..R'),
      'dGGGGGGGg...',
      'dddddddd....',
      '...ww.......',
      '...wW.......',
      '...wW.......',
      '..wwWW......',
    ], { g: '#8c92aa', G: '#c4c8d8', d: '#5e6478', r: C.red[1], R: C.red[2], w: '#8a5a2a', W: '#a86d38' });
  }
  g.outline('#1c0f0a', 0.7);
  const c = document.createElement('canvas');
  c.width = g.w * S; c.height = g.h * S;
  const tmp = document.createElement('canvas'); tmp.width = g.w; tmp.height = g.h;
  g.draw(tmp.getContext('2d'));
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(tmp, 0, 0, c.width, c.height);
  const out = { url: c.toDataURL(), w: c.width, h: c.height };
  stripCache.set(key, out);
  return out;
}

// paper luggage tag: notched left corners, brass grommet, dashed inner border (texel res)
const TAG_W = 210, TAG_H = 105;
const tagCache = new Map();
function tagBG(seed, cb) {
  let e = tagCache.get(seed);
  if (e) { if (e.url) cb(e.url); else e.wait.push(cb); return; }
  e = { url: null, wait: [cb] };
  tagCache.set(seed, e);
  const tw = TAG_W / PX, th = TAG_H / PX;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, 0, tw, th);
    const d = x.getImageData(0, 0, tw, th), p = d.data;
    const N = 5, gx = 6, gy = Math.floor(th / 2);
    const inside = (i, j) => {
      if (i < 0 || j < 0 || i >= tw || j >= th) return false;
      if (i < N - j || i < N - (th - 1 - j)) return false;            // notched left corners
      if ((i === tw - 1 && (j === 0 || j === th - 1))) return false;    // nicked right corners
      if (Math.hypot(i - gx, j - gy) < 1.7) return false;              // hole
      return true;
    };
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const k = (j * tw + i) * 4;
      if (!inside(i, j)) { p[k + 3] = 0; continue; }
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
      const r = Math.hypot(i - gx, j - gy);
      if (edge && r > 2.4) { p[k] = 59; p[k + 1] = 36; p[k + 2] = 20; continue; }
      if (r < 3.3) { const lit = i - gx + (j - gy) < 0; const col = lit ? [246, 230, 172] : [141, 108, 50]; p[k] = col[0]; p[k + 1] = col[1]; p[k + 2] = col[2]; continue; }
      if (j === th - 2) { p[k] *= 0.84; p[k + 1] *= 0.82; p[k + 2] *= 0.8; }
      // perforation between the stub and the body, dashed inner border
      const perf = i === 12 && j > 1 && j < th - 2 && j % 2 === 0;
      const inner = ((j === 2 || j === th - 3) && i > 13 && i < tw - 2) || (i === tw - 3 && j > 2 && j < th - 3);
      if (perf) { p[k] *= 0.7; p[k + 1] *= 0.66; p[k + 2] *= 0.62; }
      if (inner && (i + j) % 3 !== 0) { p[k] = p[k] * 0.55 + 192 * 0.45; p[k + 1] = p[k + 1] * 0.55 + 64 * 0.45; p[k + 2] = p[k + 2] * 0.55 + 56 * 0.45; }
    }
    x.putImageData(d, 0, 0);
    e.url = c.toDataURL();
    const w = e.wait; e.wait = [];
    w.forEach((f) => f(e.url));
  };
  img.src = paperTexture('book', TAG_W, TAG_H, { seed: 5 + seed * 17, edge: 0.3, edgeW: 3 });
}

const CHECK_SVG = (() => {
  const rows = ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'];
  let d = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg width="21" height="18" viewBox="0 0 7 6" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
})();
const fmtEta = (s) => {
  if (s == null || !Number.isFinite(+s)) return '--:--';
  s = Math.max(0, Math.ceil(+s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// ===========================================================================
// component
// ===========================================================================
export class DeliveryTracker {
  constructor(root, { icon, sfx, onClick } = {}) {
    injectPaperCSS();
    this.root = root || document.body;
    this.icon = icon;
    this._sfx = sfx;
    this.onClick = onClick;
    this.map = new Map(); // id -> entry
    this.gone = new Set(); // delivered ids already dismissed
    this.n = 0;
    this.el = document.createElement('div');
    this.el.className = 'dt';
    this.el.setAttribute('aria-label', 'Moose Express deliveries');
    this.list = document.createElement('div');
    this.list.className = 'dt-list';
    this.more = document.createElement('div');
    this.more.className = 'dt-more';
    this.more.hidden = true;
    this.el.append(this.list, this.more);
    this.el.style.setProperty('--mk', `url(${miniURL('head').url})`);
    this.root.appendChild(this.el);
    for (const p of PHASES) strip(p); // warm the cache
    this._onClick = (e) => {
      const t = e.target.closest?.('.dt-tag');
      if (!t || t.classList.contains('dt-out')) return;
      this.sfx('click', { volume: 0.5 });
      t.classList.remove('dt-tap'); void t.offsetWidth; t.classList.add('dt-tap');
      try { this.onClick?.(t.dataset.id); } catch (err) { console.error(err); }
    };
    this.list.addEventListener('click', this._onClick);
    this.dead = false;
  }

  sfx(n, o) { try { this._sfx?.(n, o); } catch { /* optional */ } }

  update(orders) {
    if (this.dead) return;
    const list = Array.isArray(orders) ? orders.filter((o) => o && o.id != null) : [];
    const seen = new Set();
    for (const o of list) {
      const id = String(o.id);
      seen.add(id);
      const phase = PHASES.includes(o.phase) ? o.phase : 'packing';
      if (this.gone.has(id)) { if (phase === 'delivered') continue; this.gone.delete(id); }
      let e = this.map.get(id);
      if (!e) e = this._create(id);
      if (e.leaving) continue;
      e.order = list.indexOf(o);
      e.rank = phase === 'delivered' ? -1 : Number.isFinite(+o.eta) ? +o.eta : 1e9;
      this._apply(e, o, phase);
    }
    for (const e of this.map.values()) {
      if (e.leaving || seen.has(e.id)) continue;
      if (e.phase === 'delivered' && e.timer) continue; // let the "Delivered!" moment play out
      this._leave(e);
    }
    this._layout();
  }

  destroy() {
    this.dead = true;
    for (const e of this.map.values()) clearTimeout(e.timer);
    this.map.clear();
    this.list.removeEventListener('click', this._onClick);
    this.el.remove();
  }

  // ------------------------------------------------------------ internals
  _create(id) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'dt-tag dt-hidden';
    el.dataset.id = id;
    const seed = this.n++ % 3;
    const rot = ((this.n * 7) % 5 - 2) * 0.6;
    el.style.setProperty('--r', `${rot.toFixed(1)}deg`);
    el.innerHTML = `
      <i class="dt-string"></i>
      <span class="dt-paper"></span>
      <span class="dt-ico"><span class="dt-win"><img class="dt-strip" alt="" draggable="false"></span></span>
      <span class="dt-txt">
        <span class="dt-lbl"><span class="dt-name"></span><b class="dt-cnt"></b></span>
        <span class="dt-ph"></span>
        <span class="dt-eta"></span>
      </span>
      <span class="dt-road">
        <img class="dt-start" src="${miniURL('parcel').url}" alt="" draggable="false">
        <i class="dt-line"><i class="dt-done"></i></i>
        <i class="dt-mk"><img src="${miniURL('head').url}" alt="" draggable="false"></i>
        <img class="dt-box" src="${miniURL('mail').url}" alt="" draggable="false">
      </span>
      <span class="dt-stamp" aria-hidden="true">${CHECK_SVG}</span>
      <span class="dt-thx">Enjoy!</span>`;
    const q = (s) => el.querySelector(s);
    const e = {
      id, el, phase: null, eta: null, rank: 0, prog: -1, label: null, count: null, leaving: false, timer: 0, visible: false, order: 0,
      $: { paper: q('.dt-paper'), strip: q('.dt-strip'), win: q('.dt-win'), name: q('.dt-name'), cnt: q('.dt-cnt'), ph: q('.dt-ph'), eta: q('.dt-eta'), done: q('.dt-done'), mk: q('.dt-mk'), box: q('.dt-box'), road: q('.dt-road') },
    };
    tagBG(seed, (u) => { e.$.paper.style.backgroundImage = `url(${u})`; });
    this.list.appendChild(el);
    this.map.set(id, e);
    return e;
  }

  _apply(e, o, phase) {
    const $ = e.$;
    const label = String(o.label ?? 'Parcel');
    if (label !== e.label) { e.label = label; $.name.textContent = label; e.el.setAttribute('aria-label', `${label}: ${LABEL[phase]}`); }
    const cnt = Math.max(0, Math.round(+o.count || 0));
    if (cnt !== e.count) { e.count = cnt; $.cnt.textContent = cnt > 1 ? `×${cnt}` : ''; }
    if (phase !== e.phase) {
      const first = e.phase == null;
      e.phase = phase;
      const st = strip(phase);
      $.strip.src = st.url;
      $.strip.width = st.w * st.n; $.strip.height = st.h;
      $.strip.style.setProperty('--n', st.n);
      $.strip.style.setProperty('--dur', `${st.dur}s`);
      for (const p of PHASES) e.el.classList.toggle('dt-p-' + p, p === phase);
      $.ph.textContent = LABEL[phase];
      e.el.setAttribute('aria-label', `${e.label}: ${LABEL[phase]}`);
      $.box.src = miniURL(phase === 'delivered' ? 'mail-up' : 'mail').url;
      if (!first) {
        this._pulse(e.el, 'dt-bump');
        this._pulse($.ph, 'dt-stampin');
        this._pulse($.win, 'dt-swap');
        this.sfx(phase === 'delivered' ? 'stamp' : phase === 'arriving' ? 'bell' : 'paper', { volume: phase === 'arriving' ? 0.25 : 0.35, pitch: phase === 'arriving' ? 1.8 : 1.2 });
      }
      if (phase === 'delivered') {
        clearTimeout(e.timer);
        e.timer = setTimeout(() => { e.timer = 0; this._leave(e); this._layout(); }, 1500);
      } else if (e.timer) { clearTimeout(e.timer); e.timer = 0; }
    }
    const eta = phase === 'delivered' ? '' : fmtEta(o.eta);
    if (eta !== e.eta) { e.eta = eta; $.eta.textContent = eta; }
    let prog = phase === 'delivered' ? 1 : clamp(+o.progress || 0, 0, 1);
    prog = Math.round(prog * 200) / 200;
    if (prog !== e.prog) {
      e.prog = prog;
      e.el.style.setProperty('--p', prog.toFixed(3));
    }
  }

  _layout() {
    // soonest arrivals first (a fresh "Delivered!" is always on top), stable by list order
    const live = [...this.map.values()].filter((e) => !e.leaving).sort((a, b) => a.rank - b.rank || a.order - b.order);
    const vis = new Set(live.slice(0, MAX_TAGS));
    // keep DOM order = list order (only touch the DOM if it actually differs)
    const cur = [...this.list.children];
    const desired = live.map((e) => e.el);
    const curLive = cur.filter((c) => desired.includes(c));
    if (curLive.some((c, i) => c !== desired[i])) {
      for (const el of desired) this.list.appendChild(el);
    }
    for (const e of live) {
      const on = vis.has(e);
      if (on && !e.visible) {
        e.visible = true;
        e.el.classList.remove('dt-hidden');
        this._pulse(e.el, 'dt-in');
        this.sfx('paper', { volume: 0.3, pitch: 1.4 });
      } else if (!on && e.visible) {
        e.visible = false;
        e.el.classList.add('dt-hidden');
        e.el.classList.remove('dt-in');
      }
    }
    const extra = live.length - vis.size;
    if (extra > 0) {
      const t = `+${extra} more`;
      if (this.more.textContent !== t) { this.more.textContent = t; if (!this.more.hidden) this._pulse(this.more, 'dt-bump'); }
      if (this.more.hidden) { this.more.hidden = false; this._pulse(this.more, 'dt-in'); }
    } else this.more.hidden = true;
  }

  _leave(e) {
    if (e.leaving) return;
    e.leaving = true;
    clearTimeout(e.timer); e.timer = 0;
    if (e.phase === 'delivered') this.gone.add(e.id);
    const el = e.el;
    const done = () => { el.remove(); if (this.map.get(e.id) === e) this.map.delete(e.id); };
    if (!e.visible || REDUCED()) { done(); return; }
    this.sfx('whoosh', { volume: 0.2, pitch: 1.3 });
    el.style.height = el.offsetHeight + 'px';
    el.classList.add('dt-out');
    setTimeout(() => { el.classList.add('dt-collapse'); }, 540);
    setTimeout(done, 820);
  }

  _pulse(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el['_t' + cls]);
    el['_t' + cls] = setTimeout(() => el.classList.remove(cls), 900);
  }
}

// dev: every frame as canvases (used by the preview's art sheet)
export function __trackerArt(scale = 6) {
  const out = [];
  for (const p of PHASES) {
    const [fn, n] = FRAMES[p];
    for (let i = 0; i < n; i++) {
      const { g, post } = fn(i);
      post?.(g);
      const c = document.createElement('canvas');
      c.width = 24 * scale; c.height = 24 * scale;
      const t = document.createElement('canvas'); t.width = 24; t.height = 24;
      g.draw(t.getContext('2d'));
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, c.width, c.height);
      out.push(c);
    }
  }
  for (const k of ['head', 'parcel', 'mail', 'mail-up']) { const i = new Image(); i.src = miniURL(k).url; i.style.cssText = 'width:auto;height:' + (scale * 7) + 'px;image-rendering:pixelated;background:#e9d7ae'; out.push(i); }
  return out;
}
