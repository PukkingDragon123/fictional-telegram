// VillagerCard: the dialogue + shop card for the pond's villagers. A paper
// sheet in the house style (tape, stamps, pixel fonts) with a polaroid of the
// villager, a typewriter speech bubble, an offers list, an optional gift box
// and a friendship row.
//
//   const card = openVillager(root, { npc, name, title, lines, offers, gift, hearts, sfx, icon, onClose })
//     npc     'dale' | 'granny' | 'hoot' | 'rocco' | 'shellby'
//     lines   ['Hello there!', 'Want some *tea*? {coin}']   ("*x*" emphasis, "{sprite}" inline icon)
//     offers  [{ icon, title, desc, tag, locked, onClick }]  (locked = reason string -> greyed, not clickable)
//     gift    { ready, label, onClaim }                      (wiggles when ready, confetti on open)
//     hearts  0..5 (halves ok)
//     sfx(name, opts)  icon(name, scale) -> '<img>' HTML   onClose() once, whenever it goes away
//   card.close()             animate away (calls onClose)
//   card.setLines(lines)     replace the dialogue, typing restarts from the first line
//   card.update({ offers, gift, hearts, lines })   refresh parts in place
//   card.el                  the overlay element
//
//   villagerPortrait(npc, { scale = 3, frame = 0 }) -> HTMLCanvasElement
//     32x32 art px bust on transparent; frame 0 idle, 1 talk, 2 blink.
//
// Overlay: position absolute, inset 0, z-index 58 inside `root` (give root a size,
// e.g. the fixed #ui layer). All art is procedural.
import './fonts.css';
import './villager.css';
import { paperTexture, tape, injectPaperCSS, PX } from './paper.js';

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ===========================================================================
// tiny pixel-art kit (art px buffer -> canvas)
// ===========================================================================
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
function rgba(h) {
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
}
const toHex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const A = rgba(a), B = rgba(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

// sphere-ish shading for an ellipse (light from the top-left); ramp dark -> light
function sph(ramp, x, y, nx, ny, bias = 0) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  let l = -0.42 * nx - 0.6 * ny + 0.68 * nz + bias + (bay(x, y) - 0.5) * 0.16;
  const th = ramp.length >= 5 ? [0.06, 0.36, 0.7, 0.92] : ramp.length === 4 ? [0.12, 0.48, 0.86] : ramp.length === 3 ? [0.25, 0.8] : [0.5];
  let i = 0;
  while (i < th.length && i < ramp.length - 1 && l > th[i]) i++;
  return ramp[i];
}

class Art {
  constructor(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); this.post = []; }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.p[y * this.w + x] = c;
    return this;
  }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.p[y * this.w + x]; }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === 'function' ? c(x + i, y + j, i, j) : c);
    return this;
  }
  // filled ellipse; c = colour | ramp (shaded) | fn(x, y, nx, ny, d)
  ell(cx, cy, rx, ry, c, o = {}) {
    const R = Math.max(rx, ry) + 1, cs = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      let dx = x - cx, dy = y - cy;
      if (o.rot) { const t = dx * cs + dy * sn; dy = -dx * sn + dy * cs; dx = t; }
      const nx = dx / rx, ny = dy / ry, d = nx * nx + ny * ny;
      if (d > 1.06) continue;
      if (o.clip && !o.clip(x, y)) continue;
      const col = typeof c === 'function' ? c(x, y, nx, ny, d) : Array.isArray(c) ? sph(c, x, y, Math.min(1, nx), Math.min(1, ny), o.bias || 0) : c;
      if (col !== undefined) this.set(x, y, col);
    }
    return this;
  }
  // stamp rows of characters through a palette ('.' / ' ' = skip, pal value null = erase)
  rows(x0, y0, rows, pal) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.' || ch === ' ' || !(ch in pal)) continue; this.set(x0 + i, y0 + j, pal[ch]); } });
    return this;
  }
  // same rows, also mirrored around the vertical axis (x -> w-1-x)
  rowsM(x0, y0, rows, pal, flip = null) {
    this.rows(x0, y0, rows, pal);
    const W = Math.max(...rows.map((r) => r.length));
    const m = rows.map((r) => r.padEnd(W, '.').split('').reverse().join(''));
    this.rows(this.w - x0 - W, y0, m, flip || pal);
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, typeof c === 'function' ? c(x0, y0) : c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  // recolour existing pixels inside a rect through fn(col, x, y)
  tint(x, y, w, h, fn) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = this.get(x + i, y + j); if (c) { const n = fn(c, x + i, y + j); if (n !== undefined) this.set(x + i, y + j, n); } }
    return this;
  }
  // 1 art px outline around the silhouette, darkened from the neighbouring colour
  outline(ink = '#1c0f0a', amt = 0.74, skipBottom = false) {
    const out = this.p.slice(), W = this.w, H = this.h;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.p[y * W + x]) continue;
      let n = null;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const c = this.get(x + dx, y + dy);
        if (c && rgba(c)[3] > 160) { n = c; break; }
      }
      if (n && !(skipBottom && y === H - 1)) out[y * W + x] = mixHex(n, ink, amt);
    }
    this.p = out;
    return this;
  }
  canvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const x = c.getContext('2d');
    for (let y = 0; y < this.h; y++) for (let i = 0; i < this.w; i++) {
      const col = this.p[y * this.w + i];
      if (!col) continue;
      const v = rgba(col);
      x.fillStyle = `rgba(${v[0]},${v[1]},${v[2]},${(v[3] / 255).toFixed(3)})`;
      x.fillRect(i * scale, y * scale, scale, scale);
    }
    return c;
  }
}

// ===========================================================================
// PORTRAITS (32 x 32 art px)
// ===========================================================================
const PORTRAIT = {
  // ------------------------------------------------------------ Dale: deer, Daisy Beer cap, polo, can in hand
  dale(g, f) {
    const FUR = ['#8e5428', '#b06e38', '#c98448', '#dea064'];
    const CRM = ['#dcc4a0', '#eedcbe', '#faf0dc', '#fffaf0'];
    const POLO = ['#1f5a30', '#2e8040', '#3e9e52', '#5ab868'];
    const CAP = ['#b27414', '#e6a81c', '#ffd22e', '#ffe680'];
    const ANT = ['#a88e5a', '#cdb486', '#ead8ae', '#faf0d2'];
    // shoulders + polo
    g.ell(15.5, 34, 15.5, 9.2, POLO);
    g.rect(15, 27, 2, 5, POLO[0]);
    g.set(15, 29, '#f8f4e8'); g.set(16, 31, '#f8f4e8');
    // neck
    g.rect(12, 20, 8, 7, (x, y) => (y > 24 ? FUR[0] : FUR[1]));
    // collar
    g.rowsM(10, 24, ['wwwww', '.wwww', '..www', '...ww', '....w'], { w: '#f8f4e8' });
    g.rowsM(10, 25, ['.s', '..s', '...s'], { s: '#dcd8c8' });
    // antlers poking out of the cap
    g.rowsM(3, 1, ['AA..A..', 'aa.aA..', '.a.aa..', '.aaaa..', '..aaa..', '...aa..', '...aaa.', '....aa.'], { a: ANT[2], A: ANT[3] });
    // ears (behind head)
    g.ell(5, 13.5, 4.6, 2.3, FUR, { rot: 0.38 });
    g.ell(26, 13.5, 4.6, 2.3, FUR, { rot: -0.38 });
    g.ell(5.3, 13.6, 2.8, 0.9, '#f0b8a4', { rot: 0.38 });
    g.ell(25.7, 13.6, 2.8, 0.9, '#f0b8a4', { rot: -0.38 });
    // head
    g.ell(15.5, 16.2, 8.6, 7.6, FUR);
    // pale rings under the eyes
    g.rowsM(10, 17, ['.ccc'], { c: FUR[3] });
    // muzzle
    g.ell(15.5, 20.4, 4.8, 3.4, CRM);
    // nose + mouth
    g.rows(14, 17, ['.hn.', 'nnnn', '.nn.'], { n: '#2a1e22', h: '#6e5c62' });
    if (f.talk) g.rows(13, 21, ['.kkkk.', 'kmmmmk', '.kttk.'], { k: '#6a3c1a', m: '#5a1e22', t: '#e0606a' });
    else g.rows(13, 21, ['k....k', '.kkkk.'], { k: '#7a4a24' });
    // eyes: chill, half-lidded
    if (f.blink) g.rowsM(11, 15, ['dd.'], { d: '#5a3418' });
    else g.rowsM(11, 14, ['dd', 'wk', 'kk'], { d: '#6a3c1a', k: '#1e1418', w: '#ffffff' }, { d: '#6a3c1a', k: '#1e1418', w: '#1e1418' });
    if (!f.blink) { g.set(19, 15, '#ffffff'); g.set(20, 15, '#1e1418'); }
    // blush
    g.rowsM(9, 18, ['pp'], { p: '#e8907a' });
    // cap: mesh sides, yellow front panel, daisy logo, brim
    g.ell(15.5, 11.2, 8.5, 6.6, (x, y, nx, ny) => {
      if (y > 10) return undefined;
      if (Math.abs(x - 15.5) <= 4.6) return sph(CAP, x, y, nx * 0.5, ny * 0.8);
      return (x + y) % 2 ? '#f6f4ec' : '#d6d2c4';
    });
    g.rows(15, 4, ['bb'], { b: CAP[1] });
    g.rows(14, 6, ['.ww.', 'wyyw', 'wyyw', '.ww.'], { w: '#ffffff', y: '#f08a1a' });
    g.ell(15.5, 11.4, 9, 1.6, (x, y) => (y <= 10 ? CAP[3] : y === 11 ? CAP[2] : CAP[1]));
    g.tint(8, 13, 16, 1, (c) => (FUR.includes(c) ? FUR[1] : undefined));
    // Daisy Beer can + hoof
    g.ell(26.5, 32, 4, 4.5, FUR);
    g.rows(23, 21, ['.sSs.', 'yYYYy', 'wWWWw', 'wWoWw', 'wWWWw', 'yYYYy', '.sss.'], { s: '#8c92aa', S: '#eef0f8', y: '#e6a81c', Y: '#ffd22e', w: '#d6d8e4', W: '#ffffff', o: '#f08a1a' });
    g.rows(22, 24, ['hh', 'hh', 'h.'], { h: '#3a2a26' });
    g.rows(27, 25, ['hh', 'hh'], { h: '#3a2a26' });
  },

  // ------------------------------------------------------------ Granny Ribbit: frog, spectacles, straw hat, lilac shawl
  granny(g, f) {
    const SK = ['#1f4a30', '#2f6f4a', '#3f8f5f', '#6cc08a', '#9edca0'];
    const STRAW = ['#86581c', '#b27e2a', '#d6a444', '#ecc66c', '#fae6a4'];
    const LIL = ['#3e2e6a', '#5c4896', '#7e6ac0', '#a092e0', '#c4baf2'];
    // straw hat (behind the eye bumps)
    g.ell(15.5, 8.4, 14.2, 2.9, (x, y, nx, ny) => {
      const c = sph(STRAW, x, y, nx * 0.5, ny * 0.9);
      return (x + y * 2) % 5 === 0 ? STRAW[Math.max(0, STRAW.indexOf(c) - 1)] : c;
    });
    g.ell(16.5, 5.6, 6.6, 4.6, (x, y, nx, ny) => {
      if (y > 7) return undefined;
      const c = sph(STRAW, x, y, nx, ny);
      return (x * 2 + y) % 5 === 0 ? STRAW[Math.max(0, STRAW.indexOf(c) - 1)] : c;
    });
    g.tint(9, 6, 16, 2, (c, x, y) => (STRAW.includes(c) ? (y === 6 ? LIL[3] : LIL[2]) : undefined));
    g.rows(19, 3, ['.w.w.', 'wwyww', '.wyw.', 'w.w.w'], { w: '#ffffff', y: '#ffcc34' });
    // head
    g.ell(15.5, 19.2, 11.4, 6.6, SK);
    // eye bumps
    g.ell(10, 12.6, 4.4, 4.1, SK);
    g.ell(21, 12.6, 4.4, 4.1, SK);
    // chin
    g.ell(15.5, 23.4, 7.6, 2.4, ['#a8c070', '#c8dc8c', '#e0ecb0'], { bias: 0.3 });
    // eyes
    for (const ex of [10, 21]) {
      if (f.blink) {
        g.ell(ex, 12.6, 2.6, 2.6, SK[3]);
        g.rows(ex - 2, 12, ['k...k', '.kkk.'], { k: '#1f3f2c' });
      } else {
        g.ell(ex, 12.6, 2.6, 2.6, (x, y) => (y >= 14 ? '#e8e4d0' : '#fffaf0'));
        g.rows(ex - 1, 12, ['wk', 'kk', 'kk'], { k: '#1e1418', w: '#ffffff' });
        g.rows(ex - 1, 12, ['.k'], { k: '#1e1418' });
        g.set(ex - 1, 12, '#ffffff');
      }
    }
    // spectacles
    for (const ex of [10, 21]) {
      for (let y = 7; y <= 18; y++) for (let x = ex - 5; x <= ex + 5; x++) {
        const d = Math.hypot(x - ex, y - 12.6);
        if (d > 2.85 && d <= 3.75) g.set(x, y, d > 3.4 ? '#7a4a12' : '#c88a1c');
      }
      g.set(ex + 1, 10, '#ffffff'); g.set(ex + 2, 11, '#ffffff');
    }
    g.rows(14, 12, ['bbbb'], { b: '#b0761a' });
    g.rows(3, 12, ['bb'], { b: '#b0761a' });
    g.rows(27, 12, ['bb'], { b: '#b0761a' });
    // nostrils, blush
    g.set(14, 17, SK[0]); g.set(17, 17, SK[0]);
    g.rowsM(6, 19, ['pp'], { p: '#f08aa8' });
    // wide smile
    if (f.talk) g.rows(8, 20, ['k..............k', '.kmmmmmmmmmmmmk.', '..kmmmmttttmmk..', '...kkkkkkkkkk...'], { k: '#1f3f2c', m: '#80202e', t: '#f08aa8' });
    else g.rows(8, 20, ['k..............k', '.kkkkkkkkkkkkkk.'], { k: '#1f3f2c' });
    // lilac shawl, knitted
    g.ell(15.5, 34.2, 16, 9.6, (x, y, nx, ny) => {
      const c = sph(LIL, x, y, nx, ny);
      const i = LIL.indexOf(c);
      return (x + (y % 2 ? 2 : 0)) % 4 === 0 ? LIL[Math.max(0, i - 1)] : c;
    });
    g.rows(13, 25, ['.kk..kk.', 'kLLkkLLk', '.kLLLLk.', '..kLLk..'], { k: LIL[1], L: LIL[3] });
    g.rows(15, 26, ['rR', 'rr'], { r: '#b0303a', R: '#ff8a7a' });
    g.rows(12, 29, ['f.f..f.f'], { f: LIL[3] });
  },

  // ------------------------------------------------------------ Professor Hoot: great horned owl, ranger hat, binoculars
  hoot(g, f) {
    const FE = ['#2e2016', '#4a3424', '#6a4c34', '#8c6848', '#b08c68'];
    const DISC = ['#a06a36', '#c28a4c', '#dcaa6a', '#f0cf98'];
    const HAT = ['#5a3a12', '#86581c', '#b27e2a', '#d6a444'];
    const SHIRT = ['#434a1c', '#626a26', '#869034', '#aab44c'];
    // shirt
    g.ell(15.5, 34.6, 15.6, 9.6, SHIRT);
    g.rowsM(9, 25, ['ssss', '.sss', '..ss'], { s: SHIRT[3] });
    // chest + white bib
    g.ell(15.5, 25.5, 6.4, 3.6, ['#c8bea6', '#e4dccb', '#f6f1e6']);
    // head with barring
    g.ell(15.5, 16.6, 10.7, 8.7, (x, y, nx, ny) => {
      const c = sph(FE, x, y, nx, ny);
      return y % 3 === 0 && bay(x, y) > 0.45 ? FE[Math.max(0, FE.indexOf(c) - 1)] : c;
    });
    // facial discs
    g.ell(11, 16.6, 5, 4.7, DISC);
    g.ell(20, 16.6, 5, 4.7, DISC);
    // V brows
    g.rowsM(7, 11, ['kk.....', '.kkk...', '...kkk.', '.....kk'], { k: FE[0] });
    // eyes
    for (const ex of [11, 20]) {
      if (f.blink) {
        g.ell(ex, 16.6, 3, 3, FE[3]);
        g.rows(ex - 2, 16, ['kkkkk'], { k: FE[0] });
      } else {
        g.ell(ex, 16.6, 3, 3, ['#b27414', '#e0a01e', '#ffcc34', '#ffe478']);
        g.ell(ex, 16.9, 1.5, 1.5, '#1a1018');
        g.set(ex - 1, 16, '#ffffff');
      }
    }
    // beak
    if (f.talk) g.rows(14, 18, ['.bb.', 'bBBb', 'mmmm', '.bb.'], { b: '#4a4a56', B: '#8a8a94', m: '#5a1e22' });
    else g.rows(14, 18, ['.bb.', 'bBBb', '.bB.', '.bb.', '..b.'], { b: '#4a4a56', B: '#8a8a94' });
    // binoculars
    g.rows(10, 25, ['.aaaa..aaaa.', 'abbbaddabbba', 'abaaa..aaaba', 'allLa..alLla', '.aaaa..aaaa.'], { a: '#2e2a36', b: '#5e5868', d: '#1a1820', l: '#4e9cd8', L: '#b8e6fa' });
    g.rows(8, 23, ['s', 's', '.s'], { s: '#6a4128' });
    g.rows(23, 23, ['s', 's', 's'], { s: '#6a4128' });
    // ranger badge
    g.rows(6, 27, ['.y.', 'yYy', 'y.y'], { y: '#e5a320', Y: '#ffe98a' });
    // campaign hat
    g.ell(15.5, 8.6, 13, 2.3, (x, y) => (y <= 7 ? HAT[3] : y === 8 ? HAT[2] : HAT[1]));
    g.rows(10, 1, [
      '...hhhhhh...',
      '..hHhkkhHh..',
      '.hHHhkkhHHh.',
      '.hHhhhhhhHh.',
      'hHhhhhhhhhhh',
      'dddddddddddd',
      'dddddddddddd',
    ], { h: HAT[2], H: HAT[3], k: HAT[1], d: '#3b2414' });
    // ear tufts through the brim
    g.rowsM(4, 0, ['TT.....', 'tTT....', 'ttTT...', 'tdtTT..', '.tdttt.', '..tdttt', '...tttt'], { t: FE[3], T: FE[4], d: FE[2] });
  },

  // ------------------------------------------------------------ Rocco: raccoon, bandit mask, flat cap, gold tooth
  rocco(g, f) {
    const FUR = ['#2c2c30', '#4a4a50', '#707076', '#9a9aa0', '#c4c4c8'];
    const WH = ['#b8b4ac', '#dcd8d0', '#f4f0e8'];
    const TW = ['#3a2414', '#5a3a22', '#7a5434', '#9a7048'];
    const COAT = ['#2e2a24', '#4a4034', '#6a5a44', '#8a7658'];
    const MASK = '#1c1a22';
    // trench coat + popped collar
    g.ell(15.5, 35, 16, 10, COAT);
    g.rows(12, 25, ['wwwwwwww', '.wwwwww.', '..wwww..', '...ww...'], { w: WH[1] });
    g.rows(13, 27, ['g....g', '.g..g.', '..gg..'], { g: '#ffd23f' });
    g.rowsM(4, 21, ['...cc', '..ccc', '.cccC', 'ccccC', 'cccC.', 'ccC..'], { c: COAT[3], C: COAT[1] });
    // ears
    for (const ex of [7.5, 23.5]) { g.ell(ex, 8.6, 3.3, 3.3, FUR); g.ell(ex, 9, 1.7, 1.7, MASK); }
    // head + cheek fluff
    g.ell(15.5, 17.2, 10.2, 7.6, FUR);
    g.ell(6.2, 20.6, 3, 2, FUR, { rot: 0.4 });
    g.ell(24.8, 20.6, 3, 2, FUR, { rot: -0.4 });
    g.rowsM(2, 21, ['ww.', '.ww'], { w: WH[1] });
    // nose bridge stripe
    g.rect(15, 10, 2, 6, FUR[1]);
    // white brows
    g.ell(11, 12.8, 3.4, 1.3, WH);
    g.ell(20, 12.8, 3.4, 1.3, WH);
    // bandit mask
    g.ell(10.6, 16.2, 4.8, 2.5, MASK, { rot: 0.25 });
    g.ell(20.4, 16.2, 4.8, 2.5, MASK, { rot: -0.25 });
    // muzzle + nose
    g.ell(15.5, 21.2, 5, 3, WH);
    g.rows(14, 19, ['hnnn', '.nn.'], { n: '#141218', h: '#5a5a62' });
    // shifty eyes (glancing right)
    if (f.blink) g.rowsM(8, 16, ['llll'], { l: '#8a8a94' });
    else {
      g.rows(8, 15, ['.www', 'wwkk'], { w: '#f4f0e8', k: '#141218' });
      g.rows(19, 15, ['.www', 'wwkk'], { w: '#f4f0e8', k: '#141218' });
    }
    // smirk + gold tooth + toothpick
    if (f.talk) g.rows(12, 21, ['......k', 'kkkkkk.', 'kwgwwk.', '.kmmk..'], { k: '#2a2430', w: '#ffffff', g: '#ffd23f', m: '#5a1e22' });
    else g.rows(12, 21, ['......k', 'k....k.', '.kkkk..', '...g...'], { k: '#2a2430', g: '#ffd23f' });
    g.line(19, 23, 24, 21, '#dcaa6a');
    g.set(24, 21, '#f0cf98');
    // flat cap (tweed)
    const tweed = (x, y, nx, ny) => {
      const c = sph(TW, x, y, nx, ny);
      return x % 3 === 0 || y % 3 === 1 ? TW[Math.max(0, TW.indexOf(c) - 1)] : c;
    };
    g.ell(15.2, 9.8, 9.8, 4.8, tweed, { clip: (x, y) => y <= 9 });
    g.ell(13.8, 10.6, 8.8, 1.7, (x, y) => (y <= 10 ? TW[2] : TW[1]));
    g.set(15, 5, TW[0]); g.set(16, 5, TW[0]);
    g.tint(7, 12, 18, 1, (c) => (FUR.includes(c) ? FUR[1] : WH.includes(c) ? WH[0] : undefined));
  },

  // ------------------------------------------------------------ Grandpa Shellby: old snapping turtle, mossy shell, tea
  shellby(g, f) {
    const SK = ['#2e2c1a', '#4a472a', '#6a663e', '#8a8454', '#aaa270'];
    const SH = ['#1f1a10', '#3a3018', '#544628', '#6e5c34'];
    const MOSS = ['#26422a', '#345a34', '#4c7a40', '#6e9c52', '#9cc070'];
    const BEAK = ['#3a2c1a', '#6e5a3a', '#b49c70', '#d8c49a'];
    const BROW = ['#b4b0a4', '#dcd8cc', '#f8f6ee'];
    // mossy shell
    g.ell(15.5, 32.5, 16.6, 11.8, (x, y, nx, ny) => {
      const c = sph(SH, x, y, nx, ny);
      const mossy = y < 25.5 - Math.abs(nx) * 3 + (bay(x + 2, y) - 0.5) * 2.2;
      if (mossy) return sph(MOSS, x, y, nx, ny, 0.12);
      return c;
    });
    // scute seams
    g.line(8, 31, 9, 25, SH[0]); g.line(23, 31, 22, 25, SH[0]);
    g.line(2, 28, 8, 28, SH[0]); g.line(23, 28, 29, 28, SH[0]);
    g.rows(4, 19, ['.g.', 'gGg', '.k.'], { g: '#7cbe46', G: '#c2e274', k: '#46963c' });
    g.rows(26, 22, ['r', 'm'], { r: '#d9453b', m: '#f4f0e4' });
    // wrinkly neck
    g.rect(10, 18, 12, 8, (x, y) => (y % 2 === 0 && x > 10 && x < 21 ? SK[1] : SK[2]));
    // head
    g.ell(15.5, 13.6, 8.6, 7.4, SK);
    for (const [x, y] of [[10, 9], [20, 8], [12, 7], [22, 11], [9, 13]]) g.set(x, y, SK[1]);
    // eyes + heavy lids + bags
    g.rowsM(10, 11, ['.rr.', 'r..r', 'r..r', '.rr.'], { r: '#b8ae78' });
    if (f.blink) g.rowsM(11, 13, ['kk'], { k: SK[0] });
    else {
      g.rowsM(11, 12, ['wk', 'kk'], { w: '#ffffff', k: '#16140e' }, { w: '#16140e', k: '#16140e' });
      g.set(20, 12, '#ffffff');
    }
    g.rowsM(10, 15, ['.ll.'], { l: SK[1] });
    // bushy white eyebrows drooping outward
    g.rowsM(6, 9, ['...WWWW', '.WWWWWw', 'wWw....', 'w......'], { W: BROW[2], w: BROW[0] });
    g.rowsM(9, 10, ['..WW'], { W: BROW[1] });
    // hooked beak
    if (f.talk) g.rows(11, 16, ['.kBBBBBBk.', 'kBbbbbbbBk', 'kmmmmmmmmk', '.kmmttmmk.', '..kBbbBk..', '...kkkk...'], { B: BEAK[3], b: BEAK[2], k: BEAK[0], m: '#3a1414', t: '#a04848' });
    else {
      g.rows(11, 16, ['.kBBBBBBk.', 'kBbbbbbbBk', '.kbbbbbbk.', '..kbbbbk..', '...kbbk...', '....kk....'], { B: BEAK[3], b: BEAK[2], k: BEAK[0] });
      g.rowsM(8, 17, ['kk.'], { k: SK[0] });
    }
    g.set(14, 17, BEAK[0]); g.set(17, 17, BEAK[0]);
    // tea cup + saucer, held in a claw
    g.rows(21, 24, ['.wwwwww..', 'wttttttw.', 'wWWWWWWwhh', '.wBBBBw..h', '..wwww.hh', '.ssssss..'], { w: '#e8e6dc', W: '#ffffff', t: '#a0521a', B: '#3c88d8', h: '#e8e6dc', s: '#cfd2de' });
    g.rows(19, 26, ['ss', 'sc', 's.'], { s: SK[3], c: '#e8dcc0' });
  },
};
// steam over the tea (drawn after the outline: soft, no ink)
const POST = {
  shellby(g, f) {
    const st = f.talk ? [[23, 22], [24, 21], [24, 20], [25, 19]] : [[24, 22], [23, 21], [23, 20], [24, 19]];
    for (const [x, y] of st) g.set(x, y, '#ffffffb0');
    g.set(f.talk ? 26 : 26, 21, '#ffffff70');
  },
};

export const VILLAGERS = {
  dale: { name: 'Dale', title: 'Daisy Beer guy', bg: ['#9fd0e8', '#c4e6f4'], pitch: 0.92, shop: 'Stuff in the cooler', gift: ['#f2c83c', '#3e9e52'] },
  granny: { name: 'Granny Ribbit', title: 'Swamp herbalist', bg: ['#8fb87a', '#b8d8a0'], pitch: 1.25, shop: "Granny's remedies", gift: ['#a092e0', '#f08aa8'] },
  hoot: { name: 'Professor Hoot', title: 'Park ranger', bg: ['#d8b878', '#ecd8a8'], pitch: 0.8, shop: 'Ranger services', gift: ['#869034', '#ffd23f'] },
  rocco: { name: 'Rocco', title: 'Totally legit merchant', bg: ['#4a4068', '#6a5a8a'], pitch: 1.08, shop: 'Totally legit goods', gift: ['#2e2a36', '#ffd23f'] },
  shellby: { name: 'Grandpa Shellby', title: 'Oldest pond resident', bg: ['#7cc2ee', '#b0e0f8'], pitch: 0.7, shop: 'Old treasures', gift: ['#3c88d8', '#d9453b'] },
};
export const VILLAGER_IDS = Object.keys(PORTRAIT);

const porCache = new Map();
function portraitArt(npc, frame) {
  const id = PORTRAIT[npc] ? npc : 'dale';
  const key = id + frame;
  if (porCache.has(key)) return porCache.get(key);
  const g = new Art(32, 32);
  const f = { talk: frame === 1, blink: frame === 2 };
  PORTRAIT[id](g, f);
  g.outline('#1c0f0a', 0.74, true);
  POST[id]?.(g, f);
  const c = g.canvas(1);
  porCache.set(key, c);
  return c;
}
function scaledCanvas(src, scale, cls) {
  const c = document.createElement('canvas');
  c.width = src.width * scale; c.height = src.height * scale;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  if (cls) c.className = cls;
  return c;
}
export function villagerPortrait(npc, { scale = 3, frame = 0 } = {}) {
  const c = scaledCanvas(portraitArt(npc, clamp(frame | 0, 0, 2)), Math.max(1, Math.round(scale)));
  c.style.imageRendering = 'pixelated';
  return c;
}

// ===========================================================================
// small UI art: hearts, gift box, speech pill, tail, close X
// ===========================================================================
const uiCache = new Map();
const cachedURL = (key, make) => {
  let u = uiCache.get(key);
  if (!u) { u = make(); uiCache.set(key, u); }
  return u;
};
const HEART = ['.rr...rr.', 'rRRr.rrrr', 'rRrrrrrrr', 'rrrrrrrrd', '.rrrrrrd.', '..rrrrd..', '...rrd...', '....r....'];
function heartURL(kind) {
  return cachedURL('heart' + kind, () => {
    const g = new Art(11, 10);
    const full = { r: '#e04a64', R: '#ffb6be', d: '#a8283e' };
    const empty = { r: '#e6d4b0', R: '#f4e8cc', d: '#d4c098' };
    g.rows(1, 1, HEART, kind === 'full' ? full : empty);
    if (kind === 'half') g.rows(1, 1, HEART.map((r) => r.slice(0, 5)), full);
    g.outline('#2a1a14', kind === 'empty' ? 0.55 : 0.7);
    return g.canvas(1).toDataURL();
  });
}
// the B&W pill used by the in-game bubbles (border-image 9-slice, slices 3/3/4)
const PILL = ['..kkk..', '.kwwwk.', 'kwwwwwk', 'kwwwwwk', 'kwwwwwk', '.kwwwk.', '.gkkkg.', '..ggg..'];
const pillURL = () => cachedURL('pill', () => { const g = new Art(7, 8); g.rows(0, 0, PILL, { k: '#161114', w: '#ffffff', g: '#161114a8' }); return g.canvas(1).toDataURL(); });
const tailURL = () => cachedURL('tail', () => {
  const g = new Art(8, 7);
  g.rows(0, 0, ['k.......', 'kk......', 'kwk.....', 'kwwk....', 'kwwwk...', 'kwwwwk..', 'kwwwwwk.'], { k: '#161114', w: '#ffffff' });
  return g.canvas(1).toDataURL();
});
const moreURL = () => cachedURL('more', () => { const g = new Art(9, 6); g.rows(0, 0, ['wwwwwwwww', 'wkkkkkkkw', 'wwkkkkkww', '.wwkkkww.', '..wwkww..', '...www...'], { k: '#161114', w: '#ffffff' }); return g.canvas(1).toDataURL(); });
function pxSVG(rows, col = 'currentColor', s = 3) {
  let d = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg width="${rows[0].length * s}" height="${rows.length * s}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true"><path fill="${col}" d="${d}"/></svg>`;
}
const STAR_SVG = pxSVG(['...#...', '...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'], 'currentColor', 2);
const X_ROWS = ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'];
const LOCK_ROWS = ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'];

// gift: body + lid as separate art so the lid can fly off
function giftArt(cols, open) {
  const [A, R] = cols;
  const Ar = [mixHex(A, '#1a0e0a', 0.42), mixHex(A, '#1a0e0a', 0.2), A, mixHex(A, '#ffffff', 0.3)];
  const Rr = [mixHex(R, '#1a0e0a', 0.35), R, mixHex(R, '#ffffff', 0.4)];
  const body = new Art(26, 18);
  body.rect(2, 2, 22, 15, (x, y) => {
    let c = x < 4 ? Ar[3] : x > 21 ? Ar[0] : y > 14 ? Ar[1] : Ar[2];
    if ((x + (y % 6 < 3 ? 0 : 3)) % 6 === 0 && y % 3 === 1 && x > 3 && x < 22) c = Ar[3];
    if (x >= 11 && x <= 14) c = x === 11 ? Rr[2] : x === 14 ? Rr[0] : Rr[1];
    return c;
  });
  if (open) {
    body.rect(3, 2, 20, 2, (x, y) => (y === 2 ? '#2a1610' : '#4a2a18'));
    body.rect(11, 2, 4, 1, Rr[0]);
  }
  body.outline('#1c0f0a', 0.7);
  const lid = new Art(28, 14);
  lid.rect(1, 7, 26, 5, (x, y) => {
    let c = y === 7 ? Ar[3] : y === 11 ? Ar[0] : Ar[2];
    if (x >= 12 && x <= 15) c = x === 12 ? Rr[2] : x === 15 ? Rr[0] : Rr[1];
    return c;
  });
  // bow
  lid.ell(9.5, 4.5, 4, 2.6, Rr, { rot: -0.35 });
  lid.ell(18.5, 4.5, 4, 2.6, Rr, { rot: 0.35 });
  lid.ell(9.8, 4.6, 1.6, 0.8, Rr[0], { rot: -0.35 });
  lid.ell(18.2, 4.6, 1.6, 0.8, Rr[0], { rot: 0.35 });
  lid.rows(12, 4, ['.RR.', 'RrrR', '.rr.'], { R: Rr[2], r: Rr[1] });
  lid.outline('#1c0f0a', 0.7);
  return { body: body.canvas(1).toDataURL(), lid: lid.canvas(1).toDataURL(), bw: 26, bh: 18, lw: 28, lh: 14 };
}

// ===========================================================================
// text: "*em*" and "{sprite}" tokens -> per-character spans
// ===========================================================================
const PAUSE = { '.': 0.2, '!': 0.18, '?': 0.2, ',': 0.1, '…': 0.26, ':': 0.1, ';': 0.1 };
function buildText(el, text, icon) {
  el.innerHTML = '';
  const chars = [];
  let em = false;
  String(text ?? '').split('\n').forEach((line, li) => {
    if (li) el.appendChild(document.createElement('br'));
    for (const w of line.split(/( +)/)) {
      if (!w) continue;
      if (/^ +$/.test(w)) { el.appendChild(document.createTextNode(' ')); chars.push({ el: null, ch: ' ' }); continue; }
      const we = document.createElement('span');
      we.className = 'vc-w';
      const re = /\{([a-z0-9_]+)\}|\*|./gi;
      let m;
      while ((m = re.exec(w))) {
        if (m[0] === '*') { em = !em; continue; }
        const c = document.createElement('span');
        c.className = 'vc-ch' + (em ? ' vc-em' : '');
        if (m[1]) {
          let h = '';
          try { h = icon ? String(icon(m[1], 2) || '') : ''; } catch { h = ''; }
          c.classList.add('vc-ico');
          c.innerHTML = h || esc(m[1]);
          chars.push({ el: c, ch: '' });
        } else {
          c.textContent = m[0];
          chars.push({ el: c, ch: m[0] });
        }
        we.appendChild(c);
      }
      el.appendChild(we);
    }
  });
  return chars;
}

// ===========================================================================
// the card
// ===========================================================================
const stack = [];
let keyBound = false;
function onKey(e) {
  const top = stack[stack.length - 1];
  if (!top) return;
  top.key(e);
}

export function openVillager(root, o = {}) {
  injectPaperCSS();
  const npc = VILLAGERS[o.npc] ? o.npc : 'dale';
  const V = VILLAGERS[npc];
  const icon = (n, s = 2) => { try { return typeof o.icon === 'function' ? String(o.icon(n, s) || '') : ''; } catch { return ''; } };
  const sfx = (n, x) => { try { if (typeof o.sfx === 'function') o.sfx(n, x); } catch { /* audio optional */ } };
  const R = Math.random;
  const rot = (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.9);
  root = root || document.body;

  const ov = document.createElement('div');
  ov.className = `vc-ov vc-npc-${npc}`;
  ov.innerHTML = `
    <div class="vc-dim"></div>
    <div class="vc-stage">
      <div class="vc-sheet" role="dialog" aria-modal="true" aria-label="${esc(o.name || V.name)}" style="--rot:${rot.toFixed(2)}deg">
        ${tape(['mint', 'pink', 'yellow', 'blue'][(R() * 4) | 0], (R() * 2 - 1) * 5, { cls: 'vc-tape' })}
        <button type="button" class="vc-x" aria-label="Close">${pxSVG(X_ROWS)}</button>
        <div class="vc-head">
          <div class="vc-photo" style="--pb1:${V.bg[0]};--pb2:${V.bg[1]}">
            <canvas class="vc-por" width="32" height="32"></canvas>
            ${tape('plain', -38, { cls: 'vc-ptape', w: 16 })}
          </div>
          <div class="vc-id">
            <h2 class="vc-name"></h2>
            <div class="vc-title"></div>
            <div class="vc-hearts"></div>
          </div>
        </div>
        <div class="vc-talk" tabindex="0" role="button" aria-label="Next">
          <i class="vc-tail"></i>
          <div class="vc-text" aria-live="polite"></div>
          <i class="vc-more"></i>
        </div>
        <div class="vc-body">
          <div class="vc-offs"></div>
          <div class="vc-giftw"></div>
        </div>
        <div class="vc-fx"></div>
      </div>
    </div>`;
  const $ = (s) => ov.querySelector(s);
  const sheet = $('.vc-sheet'), stage = $('.vc-stage'), dim = $('.vc-dim');
  const por = $('.vc-por'), talk = $('.vc-text'), talkBox = $('.vc-talk'), offs = $('.vc-offs'), giftw = $('.vc-giftw'), fx = $('.vc-fx');
  talkBox.style.setProperty('--pill', `url(${pillURL()})`);
  $('.vc-tail').style.backgroundImage = `url(${tailURL()})`;
  $('.vc-more').style.backgroundImage = `url(${moreURL()})`;
  $('.vc-name').textContent = o.name || V.name;
  $('.vc-title').textContent = o.title || V.title;

  const st = {
    lines: [], li: 0, chars: [], shown: 0, revealed: 0, typed: true, prevCh: ' ',
    frame: -1, mouthT: 0, mouth: false, blinkT: 0, nextBlink: 1.5 + R() * 2, talking: false,
    closed: false, raf: 0, last: 0, gift: null, giftOpened: false, offers: [],
  };
  const pctx = por.getContext('2d');
  const drawFrame = (f) => {
    if (f === st.frame) return;
    st.frame = f;
    pctx.clearRect(0, 0, 32, 32);
    pctx.drawImage(portraitArt(npc, f), 0, 0);
  };
  drawFrame(0);

  // ---------------------------------------------------------------- hearts
  const setHearts = (h) => {
    const el = $('.vc-hearts');
    if (h == null) { el.hidden = true; return; }
    el.hidden = false;
    const v = clamp(Math.round((+h || 0) * 2) / 2, 0, 5);
    el.setAttribute('aria-label', `Friendship ${v} of 5`);
    el.title = `Friendship ${v}/5`;
    const prev = el._v;
    el.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const k = v >= i + 1 ? 'full' : v >= i + 0.5 ? 'half' : 'empty';
      const pop = prev != null && v > prev && i + 1 > prev && i < v ? ' vc-hpop' : '';
      return `<img class="vc-heart${pop}" src="${heartURL(k)}" width="22" height="20" alt="" draggable="false" style="--d:${i * 70}ms">`;
    }).join('');
    if (prev != null && v > prev) sfx('heart', { volume: 0.4 });
    el._v = v;
  };

  // ---------------------------------------------------------------- dialogue
  const measureLines = () => {
    // reserve the tallest line so the card doesn't jump while typing
    const probe = document.createElement('div');
    probe.className = 'vc-text vc-probe';
    probe.style.width = talk.clientWidth + 'px';
    talkBox.appendChild(probe);
    let mh = 0;
    for (const l of st.lines) { buildText(probe, l, icon); probe.querySelectorAll('.vc-ch').forEach((c) => c.classList.add('on')); mh = Math.max(mh, probe.offsetHeight); }
    probe.remove();
    talk.style.minHeight = mh ? mh + 'px' : '';
  };
  const showLine = (i) => {
    st.li = i;
    st.chars = buildText(talk, st.lines[i] || '', icon);
    st.shown = 0; st.revealed = 0; st.typed = !st.chars.length; st.prevCh = ' ';
    talkBox.classList.remove('vc-ready', 'vc-last');
    if (REDUCED()) { st.shown = st.chars.length; }
    kick();
  };
  const finishTyping = () => { st.shown = st.chars.length + 1; };
  const advance = () => {
    if (st.closed) return;
    if (!st.typed) { finishTyping(); return; }
    if (st.li < st.lines.length - 1) { sfx('page', { volume: 0.35, pitch: 1.1 + R() * 0.2 }); showLine(st.li + 1); }
    else { talkBox.classList.remove('vc-nudge'); void talkBox.offsetWidth; talkBox.classList.add('vc-nudge'); }
  };
  const setLines = (lines) => {
    st.lines = (Array.isArray(lines) ? lines : lines ? [String(lines)] : []).map(String);
    if (!st.lines.length) st.lines = [''];
    measureLines();
    showLine(0);
  };
  talkBox.addEventListener('click', (e) => { e.stopPropagation(); advance(); });

  // ---------------------------------------------------------------- offers
  const tagCls = (t) => {
    const s = String(t || '').toUpperCase();
    if (s === 'NEW' || s === 'HOT' || s === 'SALE') return 'vc-t-red';
    if (s === 'UNLOCKED' || s === 'OWNED' || s === 'DONE') return 'vc-t-green';
    if (s.includes('★') || s === 'STAR' || s === 'RARE') return 'vc-t-gold';
    return 'vc-t-blue';
  };
  const setOffers = (list) => {
    st.offers = Array.isArray(list) ? list : [];
    if (!st.offers.length) { offs.innerHTML = ''; offs.hidden = true; return; }
    offs.hidden = false;
    offs.innerHTML = `<div class="vc-sec"><span>${esc(o.shopTitle || V.shop)}</span></div>` + st.offers.map((f, i) => {
      const ic = icon(f.icon, 2) || `<i class="vc-noico">?</i>`;
      const lk = f.locked ? (typeof f.locked === 'string' ? f.locked : 'Locked') : '';
      return `<button type="button" class="vc-off${lk ? ' vc-locked' : ''}" data-i="${i}" style="--r:${((i % 2 ? 1 : -1) * (0.3 + ((i * 37) % 7) / 10)).toFixed(2)}deg;--d:${i * 60}ms"${lk ? ' aria-disabled="true"' : ''}>
        <span class="vc-oi">${ic}</span>
        <span class="vc-ot"><b>${esc(f.title)}</b>${f.desc ? `<small>${esc(f.desc)}</small>` : ''}${lk ? `<em>${pxSVG(LOCK_ROWS, 'currentColor', 2)}<span>${esc(lk)}</span></em>` : ''}</span>
        ${f.tag ? `<span class="vc-tag ${tagCls(f.tag)}">${esc(f.tag).replace(/★/g, STAR_SVG)}</span>` : ''}
      </button>`;
    }).join('');
  };
  offs.addEventListener('click', (e) => {
    const b = e.target.closest('.vc-off');
    if (!b) return;
    e.stopPropagation();
    const f = st.offers[+b.dataset.i];
    if (!f) return;
    if (f.locked) {
      sfx('error', { volume: 0.4 });
      b.classList.remove('vc-nope'); void b.offsetWidth; b.classList.add('vc-nope');
      return;
    }
    sfx('click');
    b.classList.remove('vc-press'); void b.offsetWidth; b.classList.add('vc-press');
    try { f.onClick?.(f, api); } catch (err) { console.error(err); }
  });
  offs.addEventListener('pointerover', (e) => {
    const b = e.target.closest?.('.vc-off');
    if (b && !b.contains(e.relatedTarget) && !b.classList.contains('vc-locked')) sfx('hover', { volume: 0.25 });
  });

  // ---------------------------------------------------------------- gift
  const setGift = (g) => {
    st.gift = g || null;
    if (!g) { giftw.innerHTML = ''; giftw.hidden = true; return; }
    giftw.hidden = false;
    const art = giftArt(V.gift, st.giftOpened);
    const ready = !!g.ready && !st.giftOpened;
    giftw.innerHTML = `
      <div class="vc-gift${ready ? ' vc-ready' : ''}${st.giftOpened ? ' vc-opened' : ''}">
        <button type="button" class="vc-gbox" aria-label="${esc(ready ? 'Open gift' : g.label || 'Gift')}"${ready ? '' : ' tabindex="-1"'}>
          <img class="vc-gbody" src="${art.body}" width="${art.bw * 3}" height="${art.bh * 3}" alt="" draggable="false">
          <img class="vc-glid" src="${art.lid}" width="${art.lw * 3}" height="${art.lh * 3}" alt="" draggable="false">
          <i class="vc-gsp s1"></i><i class="vc-gsp s2"></i><i class="vc-gsp s3"></i>
        </button>
        <div class="vc-gt"><b>${esc(st.giftOpened ? 'Thank you, dear!' : g.label || 'A little something')}</b><small>${st.giftOpened ? 'Gift claimed' : ready ? 'Tap to open!' : 'Come back later'}</small></div>
      </div>`;
    if (st.giftOpened) giftw.querySelector('.vc-gt b').textContent = { dale: 'Cheers, buddy!', granny: 'Enjoy, dearie!', hoot: 'Splendid!', rocco: "Don't tell nobody.", shellby: 'Heh. For you, sprout.' }[npc];
  };
  giftw.addEventListener('click', async (e) => {
    const b = e.target.closest('.vc-gbox');
    if (!b) return;
    e.stopPropagation();
    const g = st.gift;
    if (!g || st.giftOpened) return;
    if (!g.ready) {
      sfx('error', { volume: 0.3 });
      const w = giftw.querySelector('.vc-gift');
      w.classList.remove('vc-nope'); void w.offsetWidth; w.classList.add('vc-nope');
      return;
    }
    st.giftOpened = true;
    const w = giftw.querySelector('.vc-gift');
    w.classList.remove('vc-ready');
    w.classList.add('vc-opening');
    sfx('paper', { volume: 0.5, pitch: 1.2 });
    await sleep(REDUCED() ? 0 : 380);
    if (st.closed) return;
    sfx('pop_in', { volume: 0.7 });
    confetti(b);
    const lid = giftw.querySelector('.vc-glid');
    anim(lid, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${R() < 0.5 ? -40 : 40}px,-70px) rotate(${R() < 0.5 ? -40 : 40}deg)`, opacity: 1, offset: 0.6 }, { transform: 'translate(0,-40px) rotate(0)', opacity: 0 }], { duration: REDUCED() ? 1 : 700, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });
    const art = giftArt(V.gift, true);
    giftw.querySelector('.vc-gbody').src = art.body;
    await sleep(REDUCED() ? 0 : 520);
    if (st.closed) return;
    setGift(g);
    try { g.onClaim?.(g, api); } catch (err) { console.error(err); }
  });
  function confetti(from) {
    if (REDUCED()) return;
    const fr = fx.getBoundingClientRect(), br = from.getBoundingClientRect();
    const cx = br.left + br.width / 2 - fr.left, cy = br.top + br.height * 0.35 - fr.top;
    const cols = ['#e04a64', '#ffd23f', '#3c88d8', '#6cc04a', '#a092e0', '#ffffff', '#f08a1a'];
    for (let i = 0; i < 44; i++) {
      const p = document.createElement('i');
      p.className = 'vc-conf';
      const w = R() < 0.5 ? 9 : 6, h = R() < 0.4 ? 12 : 6;
      p.style.cssText = `left:${cx}px;top:${cy}px;width:${w}px;height:${h}px;background:${cols[i % cols.length]}`;
      fx.appendChild(p);
      const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.4, d = 80 + R() * 140;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      const k = anim(p, [
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px)) rotate(${(R() * 360) | 0}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${(dx * 1.3).toFixed(0)}px), calc(-50% + ${(dy + 140).toFixed(0)}px)) rotate(${(R() * 900) | 0}deg)`, opacity: 0 },
      ], { duration: 900 + R() * 600, easing: 'cubic-bezier(.15,.7,.5,1)', fill: 'forwards' });
      if (k) k.finished.then(() => p.remove(), () => p.remove()); else p.remove();
    }
  }

  // ---------------------------------------------------------------- loop: typing + portrait
  function kick() { if (!st.raf && !st.closed) { st.last = performance.now(); st.raf = requestAnimationFrame(tick); } }
  function tick(now) {
    st.raf = 0;
    if (st.closed) return;
    const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
    st.last = now;
    const n = st.chars.length;
    let talking = false;
    if (!st.typed) {
      st.shown += dt * 34;
      while (st.revealed < Math.min(n, Math.floor(st.shown))) {
        const c = st.chars[st.revealed++];
        if (c.el) c.el.classList.add('on');
        // babble rhythm: one soft blip per word
        if (c.ch && /[a-z0-9]/i.test(c.ch) && !/[a-z0-9']/i.test(st.prevCh || ' ')) sfx('click', { volume: 0.14, pitch: V.pitch * (0.85 + R() * 0.4) });
        st.prevCh = c.ch;
        const p = PAUSE[c.ch];
        if (p && st.revealed < n && !REDUCED() && st.shown < n) st.shown -= p * 34;
      }
      talking = st.revealed < n && !PAUSE[st.chars[Math.max(0, st.revealed - 1)]?.ch];
      if (st.revealed >= n) {
        st.typed = true;
        talkBox.classList.add('vc-ready');
        talkBox.classList.toggle('vc-last', st.li >= st.lines.length - 1);
      }
    }
    if (talking) {
      st.mouthT -= dt;
      if (st.mouthT <= 0) { st.mouth = !st.mouth; st.mouthT = 0.08 + R() * 0.07; }
    } else st.mouth = false;
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) { st.blinkT = 0.13; st.nextBlink = 2.2 + R() * 3.2; }
    if (st.blinkT > 0) st.blinkT -= dt;
    drawFrame(st.blinkT > 0 ? 2 : st.mouth ? 1 : 0);
    st.raf = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- keys + dismissal
  const entry = {
    key(e) {
      if (st.closed) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); api.close(); return; }
      if (e.key === ' ' || e.key === 'Enter') {
        if (t && t.closest && t.closest('.vc-off,.vc-gbox,.vc-x')) return;
        e.preventDefault();
        advance();
      }
    },
  };
  stack.push(entry);
  if (!keyBound) { window.addEventListener('keydown', onKey, true); keyBound = true; }
  $('.vc-x').addEventListener('click', (e) => { e.stopPropagation(); sfx('click'); api.close(); });
  dim.addEventListener('click', () => api.close());
  stage.addEventListener('click', (e) => { if (e.target === stage) api.close(); });

  // ---------------------------------------------------------------- texture sized to the sheet
  let tw = 0, th = 0;
  const seed = (R() * 1000) | 0;
  const retex = () => {
    const w = sheet.offsetWidth, h = sheet.offsetHeight;
    if (!w || !h || (Math.abs(w - tw) < PX * 2 && Math.abs(h - th) < PX * 2)) return;
    const reflow = tw && Math.abs(w - tw) >= PX * 2;
    tw = w; th = h;
    if (reflow) measureLines();
    sheet.style.backgroundImage = `url(${paperTexture('parchment', w, h, { edge: 0.5, edgeW: 8, seed, dogear: 7, creases: [0.62] })})`;
  };
  // fade hint when the body has more below (the scrollbar is hidden)
  const body = $('.vc-body');
  const scrollHint = () => body.classList.toggle('vc-more-below', body.scrollHeight - body.scrollTop - body.clientHeight > 6);
  body.addEventListener('scroll', scrollHint, { passive: true });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { retex(); scrollHint(); }) : null;

  // ---------------------------------------------------------------- api
  const api = {
    el: ov,
    close() {
      if (st.closed) return;
      st.closed = true;
      cancelAnimationFrame(st.raf); st.raf = 0;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      ov.classList.add('vc-closing');
      sfx('whoosh', { volume: 0.4 });
      const sx = R() < 0.5 ? -1 : 1;
      const a = REDUCED() ? anim(sheet, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
        : anim(sheet, [
          { transform: `rotate(${rot}deg)` },
          { transform: `translate(${-sx * 8}px, -12px) rotate(${rot - sx * 2}deg)`, offset: 0.22 },
          { transform: `translate(${sx * 30}vw, 100vh) rotate(${rot + sx * 26}deg)` },
        ], { duration: 420, easing: 'cubic-bezier(.5,0,.85,.4)', fill: 'forwards' });
      anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' });
      fin(a, 420).then(() => {
        ro?.disconnect();
        ov.remove();
        try { o.onClose?.(); } catch (err) { console.error(err); }
      });
    },
    setLines(lines) { if (!st.closed) setLines(lines); },
    update(p = {}) {
      if (st.closed) return;
      if ('offers' in p) setOffers(p.offers);
      if ('gift' in p) { if (p.gift && p.gift.ready) st.giftOpened = false; setGift(p.gift); }
      if ('hearts' in p) setHearts(p.hearts);
      if ('lines' in p) setLines(p.lines);
      requestAnimationFrame(scrollHint);
    },
  };

  root.appendChild(ov);
  setHearts(o.hearts);
  setOffers(o.offers);
  setGift(o.gift);
  retex();
  ro?.observe(sheet);
  ro?.observe(offs);
  requestAnimationFrame(scrollHint);
  setLines(o.lines || ['…']);
  const fontsReady = document.fonts?.ready;
  if (fontsReady) fontsReady.then(() => { if (!st.closed) measureLines(); }).catch(() => {});

  // enter: slide up from below and settle
  ov.classList.add('vc-on');
  sfx('page', { volume: 0.5 });
  if (!REDUCED()) {
    const side = R() < 0.5 ? -1 : 1;
    anim(sheet, [
      { transform: `translate(${side * 24}vw, 100vh) rotate(${side * 18}deg)` },
      { transform: `translate(0, -12px) rotate(${-rot * 1.6}deg)`, offset: 0.58 },
      { transform: `translate(0, 3px) rotate(${rot * 2}deg)`, offset: 0.76 },
      { transform: `rotate(${rot}deg)` },
    ], { duration: 660, easing: 'cubic-bezier(.25,.9,.35,1)', fill: 'backwards' });
  }
  return api;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const fin = (a, ms) => (a ? Promise.race([a.finished.catch(() => {}), sleep(ms + 200)]) : sleep(ms));
