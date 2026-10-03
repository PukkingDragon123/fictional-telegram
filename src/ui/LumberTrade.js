// Pip's lumber counter: a little trade window built like a lumber-yard
// counter. A plank board hangs from ropes under a "PIP'S LUMBER" sign; Pip
// leans out of his booth window on the left (drawn pixel art, or your own
// canvas via chipEl), the log pile you have in stock sits in the middle, a
// chalk slate shows today's price per log and a tin cash box waits on the
// right. Pick 1 / 5 / 10 / ALL on the wooden tags and hit the big SELL stamp:
// logs roll over to Pip, the cash box pops open and coins fly out.
//
//   const t = openLumberTrade(root, {
//     wood, price,                       // logs in stock, today's coins per log
//     onSell(n) -> { ok, msg, coins },   // do the trade (you may call t.refresh inside)
//     icon?(name, scale) -> html,        // optional game icons (unused names fall back to built-in art)
//     sfx?(name, opts),                  // names: open close click hover coin coins buy error tock chip bell paper whoosh
//     chat?: [lines],                    // what Pip says when you poke him (cycles)
//     onClose?(),                        // the player closed it (X, Esc, the backdrop)
//     chipEl?,                           // element mounted in Pip's booth instead of the drawn portrait (64 x 76 art px)
//     coinTarget?,                       // element (or {x, y} in px) the coins fly to; default: top-right corner
//     trend?: -1 | 0 | 1,                // price arrow on the slate (optional)
//     onTalk?(text),                     // Pip started a line (babble voice / rig)
//   });
//   t.refresh({ wood, price, trend })    // any subset
//   t.say(text)                          // Pip says something
//   t.close()                            // remove at once (does NOT call onClose)
//   t.el                                 // the overlay element
//
// Drawn at a low "art pixel" size (256 x 184) and scaled by an integer, so the pixels stay crisp.
import './fonts.css';
import './lumbertrade.css';

const W = 256, H = 184;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const anim = (el, kf, o) => { try { return el?.animate(kf, o); } catch { return null; } };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

// ===========================================================================
// pixel pen
// ===========================================================================
class Pen {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d', { willReadFrequently: true });
  }
  r(x, y, w, h, c) { if (c && w > 0 && h > 0) { this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); } return this; }
  p(x, y, c) { return this.r(x, y, 1, 1, c); }
  el(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (Math.abs(dy) > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy), x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      if (x1 > x0) this.r(x0, y, x1 - x0, 1, c);
    }
    return this;
  }
  /** Fill each pixel of an ellipse through fn(x, y, dx, dy) -> colour. */
  elf(cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) { const c = fn(x, y, dx, dy); if (c) this.p(x, y, c); }
      }
    return this;
  }
  ln(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.p(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
    return this;
  }
  /** Wood plank: base fill, light top edge, dark bottom edge, grain streaks + knots. */
  plank(x, y, w, h, R, seed = 1) {
    const rnd = rng(seed);
    this.r(x, y, w, h, R[2]);
    for (let i = 0; i < (w * h) / 10; i++) { const gx = x + Math.floor(rnd() * w), gy = y + 1 + Math.floor(rnd() * (h - 2)); this.r(gx, gy, 2 + Math.floor(rnd() * 5), 1, rnd() < 0.6 ? R[1] : R[3]); }
    if (w > 30 && rnd() < 0.8) { const kx = x + 8 + Math.floor(rnd() * (w - 16)), ky = y + Math.floor(h / 2); this.el(kx, ky, 2, 1.2, R[0]).p(kx - 1, ky - 1, R[1]); }
    this.r(x, y, w, 1, R[4]); this.r(x, y + h - 1, w, 1, R[0]);
    return this;
  }
  /** 1px outline darkened from the neighbouring colour. */
  outline(k = 0.62) {
    const { w, h } = this, im = this.g.getImageData(0, 0, w, h), d = im.data, s = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] > 127) continue;
      let n = 0, r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        if (s[j + 3] > 127) { r += s[j]; g += s[j + 1]; b += s[j + 2]; n++; }
      }
      if (!n) continue;
      d[i] = (r / n) * (1 - k) + 42 * k; d[i + 1] = (g / n) * (1 - k) + 22 * k; d[i + 2] = (b / n) * (1 - k) + 18 * k; d[i + 3] = 255;
    }
    this.g.putImageData(im, 0, 0);
    return this;
  }
}
const WOOD = ['#4a2a16', '#6e4024', '#8e5a32', '#a87040', '#c48c52'];
const WOODL = ['#6a4426', '#9a6a3c', '#c08a52', '#d6a468', '#ecc488'];
const RED = ['#6a1a20', '#9a2a2e', '#c8403a', '#e0604a', '#f08a64'];

// ===========================================================================
// art
// ===========================================================================
let ART = null;
function art() {
  if (ART) return ART;
  ART = { board: paintBoard(), sign: paintSign(), slate: paintSlate(), box: paintBox(), lid: paintLid(), coin: paintCoin(), tag: paintTag(false), tagOn: paintTag(true), sell: paintSell(false), sellOff: paintSell(true), log: paintLog(), close: paintClose(), note: paintNote() };
  return ART;
}
function paintBoard() {
  const p = new Pen(W, H);
  const Y0 = 22;
  // ropes up to the sign
  for (const x of [40, 216]) for (let y = 0; y < Y0 + 2; y++) p.p(x + ((y >> 1) & 1), y, (y & 1) ? '#c8a870' : '#a88450');
  // the counter board: five planks, dark frame, iron corner brackets, nails
  p.r(2, Y0, W - 4, H - Y0 - 2, WOOD[0]);
  const ph = Math.floor((H - Y0 - 8) / 5);
  for (let i = 0; i < 5; i++) p.plank(5, Y0 + 3 + i * ph, W - 10, ph - 1, i % 2 ? WOOD : WOODL, 11 + i * 7);
  p.r(2, Y0, W - 4, 3, WOOD[1]).r(2, H - 5, W - 4, 3, WOOD[0]).r(2, Y0, 3, H - Y0 - 2, WOOD[1]).r(W - 5, Y0, 3, H - Y0 - 2, WOOD[0]);
  p.r(3, Y0, W - 6, 1, WOOD[3]);
  for (const [x, y] of [[2, Y0], [W - 12, Y0], [2, H - 12], [W - 12, H - 12]]) {
    p.r(x, y, 10, 10, '#3a3a46').r(x + 1, y + 1, 8, 8, '#5a5a6a').r(x + 1, y + 1, 8, 1, '#8a8a9a');
    p.p(x + 4, y + 4, '#2a2a30').p(x + 5, y + 5, '#9a9aaa');
  }
  for (let i = 0; i < 5; i++) for (const x of [9, W - 11, 128]) { const y = Y0 + 3 + i * ph + 4; p.p(x, y, '#3a3a42').p(x + 1, y, '#9a9aa8'); }
  // Pip's booth window (left): frame + sill; the portrait sits inside
  const bx = 9, by = 30, bw = 78, bh = 94;
  p.r(bx - 2, by - 2, bw + 4, bh + 4, WOOD[0]).r(bx - 1, by - 1, bw + 2, bh + 2, '#f2e6c8').r(bx, by, bw, bh, '#2e2420');
  // inside the booth: warm plank wall lit by a lantern, a shelf of log offcuts, a saw on a nail
  for (let x = bx; x < bx + bw; x++) for (let y = by; y < by + bh; y++) {
    const d = Math.hypot(x - (bx + 62), y - (by + 16)) / 70;
    const plk = (x - bx) % 9 === 0;
    p.p(x, y, plk ? '#2a1a12' : bayer(x, y) < 0.75 - d ? '#6a4228' : bayer(x, y) < 1.05 - d ? '#54341f' : '#3e2618');
  }
  p.r(bx, by + 34, bw, 3, WOODL[2]).r(bx, by + 34, bw, 1, WOODL[4]).r(bx, by + 37, bw, 1, '#1e120c');
  for (const [x, r] of [[bx + 5, 3.5], [bx + 12, 3], [bx + 66, 3.5], [bx + 72, 2.5]]) p.el(x, by + 34 - r, r, r, '#5c3c24').el(x, by + 34 - r, r - 1, r - 1, '#f0d098').p(Math.round(x), Math.round(by + 34 - r), '#a8723e');
  p.r(bx + 62, by + 2, 1, 6, '#1e120c').r(bx + 59, by + 8, 7, 2, '#3a3a46').r(bx + 60, by + 10, 5, 6, '#ffd070').r(bx + 61, by + 11, 3, 3, '#fff0b0').r(bx + 59, by + 16, 7, 1, '#3a3a46');
  for (let i = 0; i < 14; i++) p.p(bx + 4 + i, by + 8 + (i >> 2), i % 2 ? '#c8ccd4' : '#9aa2b0');
  p.r(bx + 2, by + 6, 3, 5, '#a8303a');
  p.r(bx - 4, by + bh, bw + 8, 5, WOODL[3]).r(bx - 4, by + bh, bw + 8, 1, WOODL[4]).r(bx - 4, by + bh + 4, bw + 8, 1, WOOD[0]);
  // little awning over the booth: red / cream stripes, scalloped
  for (let x = bx - 5; x < bx + bw + 5; x++) {
    const st = Math.floor((x - bx + 5) / 6) % 2;
    for (let y = by - 8; y < by - 1 + ((x - bx + 5) % 6 === 2 || (x - bx + 5) % 6 === 3 ? 2 : 0) + 1; y++) p.p(x, y, y === by - 8 ? '#7a1e22' : st ? RED[2] : '#f6ecd4');
  }
  // shelf lines for the middle column + a sawdust smudge
  p.r(96, 86, 82, 2, WOOD[0]).r(96, 86, 82, 1, WOOD[1]);
  const rnd = rng(5);
  for (let i = 0; i < 40; i++) p.p(100 + rnd() * 160, H - 9 - rnd() * 5, rnd() < 0.5 ? '#f2d8a4' : '#dcb880');
  return p.c;
}
function paintSign() {
  const w = 120, h = 22, p = new Pen(w, h);
  p.r(0, 0, w, h, WOOD[0]).plank(2, 2, w - 4, h - 4, WOODL, 3);
  p.r(2, 2, w - 4, 1, WOODL[4]);
  for (const x of [5, w - 7]) { p.p(x, 5, '#3a3a42').p(x + 1, 5, '#9a9aa8').p(x, h - 6, '#3a3a42').p(x + 1, h - 6, '#9a9aa8'); }
  // tiny log ends painted on both sides of the text
  for (const x of [14, w - 15]) p.el(x, 11, 4.5, 4.5, '#6e4024').el(x, 11, 3.4, 3.4, '#f0d098').el(x, 11, 1.5, 1.5, '#cfa264').p(x, 11, '#8e5a32');
  return p.c;
}
function paintSlate() {
  const w = 64, h = 54, p = new Pen(w, h);
  p.r(0, 0, w, h, WOOD[0]).r(1, 1, w - 2, h - 2, WOOD[3]).r(1, 1, w - 2, 1, WOOD[4]);
  p.r(4, 4, w - 8, h - 8, '#2f3f38');
  const rnd = rng(9);
  for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) if (bayer(x, y) < 0.12 + 0.1 * Math.sin(x * 0.2 + y * 0.1)) p.p(x, y, '#3a4c44');
  for (let i = 0; i < 14; i++) p.r(6 + rnd() * (w - 16), 6 + rnd() * (h - 14), 3 + rnd() * 6, 1, 'rgba(240,240,225,0.13)'); // old chalk smudges
  p.r(10, h - 4, 10, 2, '#f4f0e0').r(10, h - 3, 10, 1, '#c8c4b4'); // chalk stick on the ledge
  p.r(4, h - 5, w - 8, 1, WOOD[1]);
  // hanging nail + string
  p.ln(w / 2 - 10, 0, w / 2, -6, '#c8a870');
  return p.c;
}
function paintBox() {
  const w = 60, h = 34, p = new Pen(w, h + 2);
  p.r(2, 4, w - 4, h - 4, '#3e7a5a').r(2, 4, w - 4, 2, '#5aa078').r(w - 4, 4, 2, h - 4, '#2c5a42').r(2, h - 2, w - 4, 2, '#24483a');
  for (let x = 6; x < w - 6; x += 8) p.r(x, 10, 1, h - 14, '#2c5a42');
  p.r(2, 8, w - 4, 1, '#c89a3a').r(2, h - 6, w - 4, 1, '#c89a3a');
  // brass latch + keyhole + a painted coin
  p.r(w / 2 - 4, 6, 8, 9, '#e8c050').r(w / 2 - 4, 6, 8, 1, '#fff0a0').r(w / 2 - 4, 14, 8, 1, '#a07a20').p(w / 2 - 1, 9, '#3a2a10').p(w / 2 - 1, 10, '#3a2a10').p(w / 2, 11, '#3a2a10');
  p.el(12, h - 13, 4, 4, '#e8c050').el(12, h - 13, 2.5, 2.5, '#ffd84a').p(11, h - 15, '#fff6c0');
  p.r(0, h, w, 2, 'rgba(40,20,10,0.35)');
  return p.c;
}
function paintLid() {
  const w = 60, h = 10, p = new Pen(w, h);
  p.r(1, 2, w - 2, h - 2, '#4a8a68').r(1, 2, w - 2, 1, '#78bc92').r(1, h - 1, w - 2, 1, '#2c5a42');
  p.r(w / 2 - 8, 0, 16, 3, '#c89a3a').r(w / 2 - 8, 0, 16, 1, '#ffe080'); // handle
  return p.c;
}
function paintCoin() {
  const p = new Pen(9, 9);
  p.el(4.5, 4.5, 4.5, 4.5, '#9a6a12').el(4.5, 4.5, 3.6, 3.6, '#ffd23a').el(4.5, 4.5, 2.2, 2.2, '#f0b020');
  p.r(4, 3, 1, 3, '#fff2a0').p(2, 2, '#fff8d0').p(3, 2, '#fff8d0');
  return p.c;
}
function paintTag(on) {
  const w = 18, h = 20, p = new Pen(w, h);
  p.r(8, 0, 2, 3, '#c8a870');
  p.r(1, 3, w - 2, h - 4, on ? '#e8c890' : WOODL[3]).r(1, 3, w - 2, 1, on ? '#fff0c8' : WOODL[4]).r(1, h - 2, w - 2, 1, WOOD[1]);
  p.r(1, 3, 1, h - 4, WOODL[4]).r(w - 2, 3, 1, h - 4, WOOD[2]);
  p.r(8, 5, 2, 2, WOOD[0]); // string hole
  if (on) { p.r(2, h - 4, w - 4, 2, '#5aa04a'); }
  return p.c;
}
function paintSell(off) {
  const w = 80, h = 36, p = new Pen(w, h);
  const R = off ? ['#4a4440', '#6a625c', '#8a827a', '#a8a096', '#c4bcb0'] : RED;
  p.r(0, 3, w, h - 3, R[0]).r(1, 3, w - 2, h - 5, R[2]).r(1, 3, w - 2, 2, R[4]).r(1, h - 5, w - 2, 2, R[1]);
  p.r(4, 7, w - 8, h - 15, R[3]).r(5, 8, w - 10, h - 17, R[2]);
  for (let x = 6; x < w - 6; x += 3) p.p(x, 8, R[4]);
  p.r(0, h - 3, w, 3, 'rgba(40,16,10,0.4)');
  return p.c;
}
function paintLog() {
  const p = new Pen(12, 12);
  p.el(6, 6, 6, 6, '#5c3c24').el(6, 6, 4.8, 4.8, '#f0d098').el(6, 6, 2.9, 2.9, '#cfa264').el(6, 6, 2.2, 2.2, '#f6deae').el(6, 6, 1, 1, '#a8723e');
  p.p(2, 3, '#8a5a32').p(3, 2, '#8a5a32').p(4, 4, '#fae6b8');
  return p.c;
}
function paintClose() {
  const p = new Pen(16, 16);
  p.el(8, 8, 7.5, 7.5, WOOD[0]).el(8, 8, 6.5, 6.5, RED[2]).el(7, 7, 4, 4, RED[3]);
  for (let i = 0; i < 6; i++) { p.r(5 + i, 5 + i, 2, 1, '#fff4e0'); p.r(10 - i, 5 + i, 2, 1, '#fff4e0'); }
  return p.c;
}
function paintNote() {
  const w = 98, h = 46, p = new Pen(w, h);
  p.r(0, 2, w, h - 2, '#e8dcc0').r(0, 0, w - 2, h - 4, '#fbf4e2');
  for (let y = 10; y < h - 6; y += 7) p.r(4, y, w - 10, 1, '#d8e4ec');
  p.r(6, 0, 1, h - 4, '#f0b0b0');
  const rnd = rng(3);
  for (let i = 0; i < 60; i++) p.p(rnd() * (w - 2), rnd() * (h - 4), 'rgba(160,130,90,0.12)');
  // tail pointing left-up at Pip
  return p.c;
}
/** Pip's bust in his booth: sky, hills, then a chipmunk in a flat cap and flannel. frame: { blink, talk, hop } */
function paintPip({ blink = false, talk = 0 } = {}) {
  const w = 64, h = 76, bg = new Pen(w, h), p = new Pen(w, h);
  // flannel shoulders (buffalo check), suspenders, collar
  const plaid = (x, y) => { const a = Math.floor(x / 3) % 2, b = Math.floor(y / 3) % 2; return a && b ? '#3a2228' : a || b ? '#a8303a' : '#d8483e'; };
  p.elf(32, 80, 28, 22, (x, y) => plaid(x, y));
  for (const x of [20, 41]) p.r(x, 60, 3, 16, '#8a5232').r(x, 60, 1, 16, '#a86a42');
  p.r(30, 60, 4, 16, '#3a2228');
  for (let y = 62; y < 76; y += 4) p.p(31, y, '#f4ecd8');
  p.el(32, 58, 7, 4, '#faead2');
  p.r(24, 57, 6, 3, '#d8483e').r(34, 57, 6, 3, '#d8483e'); // collar points
  // acorn in the breast pocket
  p.r(42, 66, 8, 7, '#a8303a').r(42, 66, 8, 1, '#3a2228').el(46, 65, 2.5, 2, '#7a5232');
  // ears (peeking out under the cap)
  p.el(13, 26, 4, 4, '#d8874a').el(13, 26, 2, 2, '#f0a0a8').el(51, 26, 4, 4, '#d8874a').el(51, 26, 2, 2, '#f0a0a8');
  // head: orange fur, light from the top-left
  p.elf(32, 38, 19, 16, (x, y, dx, dy) => (dx + dy > 0.9 ? '#b86a32' : dx + dy < -0.9 ? '#eca468' : '#d8874a'));
  // face stripes: cream brow line, chocolate eye stripe, cream under
  for (const s of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const x = 32 + s * (5 + i);
      p.p(x, 31 - (i > 8 ? 1 : 0), '#faead2').p(x, 32 - (i > 8 ? 1 : 0), '#faead2');
      if (i > 3) { p.p(x, 35, '#4a2a1a').p(x, 36, '#4a2a1a').p(x, 37, '#6a3e24'); }
      if (i > 4) p.p(x, 39, '#faead2');
    }
  }
  p.r(30, 22, 4, 12, '#4a2a1a'); // dorsal stripe down the forehead
  // puffy cheeks + muzzle
  for (const x of [20, 44]) p.elf(x, 46, 8.5, 6.5, (xx, y, dx, dy) => (dy < -0.5 ? '#f2dcc0' : '#faead2'));
  p.el(20, 46, 3, 1.5, '#ffb3c2').el(44, 46, 3, 1.5, '#ffb3c2');
  p.el(32, 47, 7, 5, '#fff8ec');
  p.r(30, 42, 4, 2, '#7a3a3a').p(31, 42, '#b86868');
  if (talk) {
    p.el(32, 49, 3, 2.6 + talk, '#4a0f22').el(32, 50 + talk * 0.5, 2, 1.2, '#ff8a9c');
    p.r(31, 46, 2, 2, '#ffffff');
  } else {
    p.p(31, 45, '#2a1520').p(32, 45, '#2a1520').p(30, 46, '#2a1520').p(33, 46, '#2a1520').p(29, 46, '#2a1520').p(34, 46, '#2a1520');
    p.r(31, 46, 2, 3, '#ffffff').p(31, 48, '#d8ccc0').p(32, 48, '#d8ccc0');
  }
  // whiskers
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) for (let i = 0; i < 6; i++) p.p(32 + s * (9 + i), 44 + k * 2 + (k ? i * 0.3 : -i * 0.2), '#7a5a44');
  // big bead eyes with cream rings
  for (const ex of [24, 40]) {
    p.el(ex, 36, 5, 5.6, '#fff4e0');
    if (blink) p.r(ex - 3, 36, 7, 2, '#2a1520');
    else {
      p.elf(ex, 36, 3.8, 4.4, (x, y, dx, dy) => (dy > 0.55 ? '#8a5432' : dy > 0.2 ? '#3a1e12' : '#1e1018'));
      p.r(ex - 2, 33, 2, 2, '#ffffff').p(ex + 1, 38, '#ffffff');
    }
  }
  // tweed flat cap with a short brim
  p.elf(32, 24, 21, 8, (x, y) => ((x * 2 + y) % 5 === 0 ? '#6e6044' : (x + y * 3) % 11 === 0 ? '#c4b088' : '#8a7a5a'));
  p.r(11, 24, 42, 4, '#8a7a5a');
  for (let x = 11; x < 53; x++) if ((x + 1) % 4 === 0) p.p(x, 25, '#6e6044');
  p.r(13, 28, 38, 3, '#6e6044').r(15, 28, 34, 1, '#a8966e');
  p.r(30, 16, 4, 2, '#6e6044');
  // pencil behind his right ear (viewer left)
  for (let i = 0; i < 12; i++) { p.p(7 + i, 33 - i, '#f6c834'); p.p(8 + i, 33 - i, '#d8a420'); }
  p.p(6, 34, '#f08aa0').p(7, 34, '#f08aa0').p(19, 21, '#f2d0a0').p(20, 20, '#3a3a42');
  p.outline(0.6);
  bg.g.drawImage(p.c, 0, 0);
  return bg.c;
}
const pipFrames = new Map();
function pipFrame(blink, talk) {
  const k = `${blink ? 1 : 0}${talk}`;
  if (!pipFrames.has(k)) pipFrames.set(k, paintPip({ blink, talk }));
  return pipFrames.get(k);
}
/** The stock pile: up to 15 log ends stacked 5-4-3-2-1. */
function paintPile(n) {
  const w = 80, h = 50, p = new Pen(w, h);
  const L = art().log;
  if (n <= 0) {
    const rnd = rng(4);
    for (let i = 0; i < 30; i++) p.p(10 + rnd() * 60, h - 3 - rnd() * 4, rnd() < 0.5 ? '#f2d8a4' : '#c89a5c');
    p.ln(56, 14, 70, 4, 'rgba(255,255,255,0.5)'); // a cobweb strand, nothing here
    return p.c;
  }
  const shown = Math.min(15, n);
  let k = 0;
  for (let row = 0; row < 5 && k < shown; row++) {
    const cnt = 5 - row;
    for (let i = 0; i < cnt && k < shown; i++, k++) p.g.drawImage(L, 10 + row * 6 + i * 12, h - 13 - row * 10);
  }
  return p.c;
}
const DEFAULT_CHAT = ['Logs, logs, lovely logs!', 'Fresh-cut or dusty, I buy \'em all!', 'Keep a few for Chip, eh?', 'A fair price, partner. Fair-ish.'];

// ===========================================================================
// the window
// ===========================================================================
export function openLumberTrade(root, o = {}) {
  root = root || document.body;
  const sfx = (n, x) => { try { o.sfx?.(n, x); } catch { /* optional */ } };
  const S = { wood: Math.max(0, Math.floor(+o.wood || 0)), price: Math.max(0, Math.round(+o.price || 0)), trend: o.trend || 0, qty: 1, chatI: 0, busy: false, closed: false };
  const chat = (o.chat && o.chat.length ? o.chat : DEFAULT_CHAT).slice();
  const A = art();

  const el = document.createElement('div');
  el.className = 'lt';
  el.tabIndex = -1;
  el.innerHTML = '<div class="lt-dim"></div><div class="lt-stage"></div><div class="lt-fly"></div>';
  const stage = el.querySelector('.lt-stage'), fly = el.querySelector('.lt-fly');
  root.appendChild(el);
  const E = {};
  const add = (cls, x, y, w, h, html = '', tag = 'div') => {
    const d = document.createElement(tag);
    d.className = cls;
    Object.assign(d.style, { left: x + 'px', top: y + 'px' });
    if (w != null) d.style.width = w + 'px';
    if (h != null) d.style.height = h + 'px';
    if (html) d.innerHTML = html;
    stage.appendChild(d);
    return d;
  };
  const cv = (c, cls = '') => { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); k.className = cls; return k; };
  const coinHTML = () => { let h = ''; try { h = o.icon?.('coin', 1) || ''; } catch { h = ''; } return h || `<img class="lt-coin-ic" src="${A.coin.toDataURL()}" alt="">`; };

  // ---------------------------------------------------------------- build
  stage.appendChild(cv(A.board, 'lt-board'));
  E.sign = add('lt-sign', 68, 0, 120, 22);
  E.sign.appendChild(cv(A.sign));
  E.sign.insertAdjacentHTML('beforeend', '<span>PIP\'S LUMBER</span>');
  E.x = add('lt-x', W - 20, 4, 16, 16, '', 'button');
  E.x.appendChild(cv(A.close)); E.x.title = 'Close';
  // Pip's booth
  E.booth = add('lt-booth', 9, 30, 78, 94);
  E.pip = document.createElement('div'); E.pip.className = 'lt-pip';
  if (o.chipEl) { E.pip.appendChild(o.chipEl); E.pip.classList.add('lt-own'); }
  else { E.pipC = cv(pipFrame(false, 0)); E.pip.appendChild(E.pipC); }
  E.booth.appendChild(E.pip);
  E.note = add('lt-note', 6, 132, 98, 46);
  E.note.appendChild(cv(A.note));
  E.noteT = document.createElement('div'); E.noteT.className = 'lt-note-t'; E.note.appendChild(E.noteT);
  // stock pile
  add('lt-cap', 98, 26, 78, 10, 'IN STOCK');
  E.pile = add('lt-pile', 97, 36, 80, 50);
  E.stock = add('lt-stock', 140, 34, 38, 14);
  // quantity tags
  E.tags = [1, 5, 10, 'all'].map((q, i) => {
    const b = add('lt-tag', 98 + i * 20, 90, 18, 20, '', 'button');
    b.appendChild(cv(A.tag)); b.appendChild(cv(A.tagOn, 'on'));
    b.insertAdjacentHTML('beforeend', `<span>${q === 'all' ? 'ALL' : q}</span>`);
    b.dataset.q = q;
    b.addEventListener('click', () => pick(q, b));
    b.addEventListener('mouseenter', () => sfx('hover', { volume: 0.3 }));
    return b;
  });
  E.total = add('lt-total', 98, 113, 80, 14);
  E.sell = add('lt-sell', 98, 130, 80, 36, '', 'button');
  E.sellBg = cv(A.sell); E.sellOff = cv(A.sellOff, 'off');
  E.sell.append(E.sellBg, E.sellOff);
  E.sell.insertAdjacentHTML('beforeend', '<span>SELL!</span>');
  // price slate
  add('lt-cap', 184, 26, 64, 10, 'TODAY');
  E.slate = add('lt-slate', 184, 36, 64, 54);
  E.slate.appendChild(cv(A.slate));
  E.slateT = document.createElement('div'); E.slateT.className = 'lt-slate-t'; E.slate.appendChild(E.slateT);
  // cash box
  E.box = add('lt-box', 186, 120, 60, 36);
  E.box.appendChild(cv(A.box));
  E.lid = add('lt-lid', 186, 112, 60, 10);
  E.lid.appendChild(cv(A.lid));
  E.earned = add('lt-earned', 184, 160, 64, 14);
  S.earned = 0;

  // ---------------------------------------------------------------- state -> view
  const qtyN = () => (S.qty === 'all' ? S.wood : Math.min(S.qty, S.wood));
  function render() {
    E.pile.textContent = '';
    E.pile.appendChild(cv(paintPile(S.wood)));
    E.stock.innerHTML = S.wood ? `x${S.wood}` : '<i>empty</i>';
    const arrow = S.trend > 0 ? '<b class="up">&#9650;</b>' : S.trend < 0 ? '<b class="dn">&#9660;</b>' : '';
    E.slateT.innerHTML = `<div class="big">${S.price}${arrow}</div><div class="per">${coinHTML()} / log</div>`;
    for (const b of E.tags) {
      const q = b.dataset.q === 'all' ? 'all' : +b.dataset.q;
      b.classList.toggle('sel', q === S.qty);
      b.disabled = q !== 'all' && q > S.wood;
    }
    const n = qtyN();
    E.total.innerHTML = n ? `${n} x ${S.price} = <b>${n * S.price}</b> ${coinHTML()}` : '<i>no logs to sell</i>';
    const off = !n || S.busy;
    E.sell.classList.toggle('dis', !n);
    E.sell.disabled = off;
    E.earned.innerHTML = S.earned ? `+${S.earned} ${coinHTML()}` : '';
  }
  function pick(q, b) {
    if (S.busy) return;
    if (q !== 'all' && q > S.wood) { sfx('error', { volume: 0.4 }); return; }
    S.qty = q;
    sfx('tock', { volume: 0.5, pitch: q === 'all' ? 0.8 : 1 + (q / 20) });
    anim(b, [{ transform: 'rotate(-12deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'none' }], { duration: 420 });
    render();
  }

  // ---------------------------------------------------------------- Pip talks
  let talkTimer = 0, blinkTimer = 0;
  function setPip(blink, talk) { if (E.pipC) E.pipC.getContext('2d').drawImage(pipFrame(blink, talk), 0, 0); }
  function say(text) {
    if (S.closed) return;
    E.noteT.textContent = '';
    E.noteT.textContent = String(text || '');
    anim(E.noteT, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: Math.min(900, 30 * String(text).length + 150), easing: 'steps(12)' });
    anim(E.note, [{ transform: 'rotate(-2deg) translateY(-2px)' }, { transform: 'none' }], { duration: 260 });
    try { o.onTalk?.(text); } catch { /* optional */ }
    clearInterval(talkTimer);
    let k = 0;
    const flaps = Math.min(16, 3 + Math.floor(String(text).length / 3));
    talkTimer = setInterval(() => {
      if (S.closed) return clearInterval(talkTimer);
      k++;
      setPip(false, k >= flaps ? 0 : [1, 2, 0, 1, 0, 2][k % 6]);
      if (k >= flaps) clearInterval(talkTimer);
    }, 90);
    hop();
  }
  function hop() { anim(E.pip, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px) scaleY(1.04)' }, { transform: 'translateY(1px) scaleY(0.96)' }, { transform: 'none' }], { duration: 360, easing: 'ease-out' }); }
  function blinkLoop() {
    if (S.closed) return;
    setPip(true, 0);
    setTimeout(() => !S.closed && setPip(false, 0), 120);
    blinkTimer = setTimeout(blinkLoop, 2200 + Math.random() * 2600);
  }
  blinkTimer = setTimeout(blinkLoop, 1800);
  E.booth.addEventListener('click', () => { sfx('chip', { volume: 0.5, pitch: 1.4 }); say(chat[S.chatI++ % chat.length]); });

  // ---------------------------------------------------------------- selling
  function stageRect() { return stage.getBoundingClientRect(); }
  function unitPx() { return stageRect().width / W; }
  function artToPx(x, y) { const r = stageRect(), u = r.width / W; return { x: r.left + x * u, y: r.top + y * u }; }
  function flyImg(src, from, to, { ms = 700, delay = 0, arc = -60, spin = 0, size = 1 } = {}) {
    const u = unitPx(), rr = el.getBoundingClientRect();
    const img = cv(src, 'lt-flyer');
    img.style.width = src.width * u * size + 'px'; img.style.height = src.height * u * size + 'px';
    img.style.left = from.x - rr.left + 'px'; img.style.top = from.y - rr.top + 'px';
    fly.appendChild(img);
    const dx = to.x - from.x, dy = to.y - from.y;
    const kf = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; kf.push({ transform: `translate(${dx * t}px, ${dy * t + arc * 4 * t * (1 - t)}px) rotate(${spin * t}deg) scale(${1 - t * 0.2})`, opacity: t > 0.9 ? 0.4 : 1 }); }
    const a = anim(img, kf, { duration: ms, delay, easing: 'linear', fill: 'both' });
    const done = () => img.remove();
    if (a) a.onfinish = done; else setTimeout(done, ms + delay);
  }
  function coinTargetPt() {
    const t = o.coinTarget;
    if (t && typeof t.getBoundingClientRect === 'function') { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    if (t && Number.isFinite(t.x)) return t;
    const r = el.getBoundingClientRect();
    return { x: r.right - 60, y: r.top + 24 };
  }
  async function sell() {
    const n = qtyN();
    if (S.busy || S.closed) return;
    if (!n) { sfx('error', { volume: 0.45 }); shake(E.sell); say('No logs, no deal, partner!'); return; }
    S.busy = true;
    anim(E.sell, [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(3px) scale(1.04, 0.86)' }, { transform: 'translateY(-1px) scale(0.98, 1.04)' }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    sfx('stamp', { volume: 0.5 });
    let res = null;
    try { res = o.onSell ? o.onSell(n) : { ok: true, coins: n * S.price, msg: '' }; } catch (e) { console.warn('lumber sell', e); res = { ok: false, msg: 'Hmm, something jammed!' }; }
    if (res && typeof res.then === 'function') res = await res;
    if (S.closed) return;
    if (!res || !res.ok) {
      S.busy = false;
      sfx('error', { volume: 0.45 }); shake(E.sell);
      say(res?.msg || 'Can\'t do that one, partner.');
      render();
      return;
    }
    const coins = Number.isFinite(res.coins) ? res.coins : n * S.price;
    // logs roll from the pile over to Pip
    const from = artToPx(130, 60), to = artToPx(48, 100);
    const nl = Math.min(8, n);
    for (let i = 0; i < nl; i++) { flyImg(A.log, { x: from.x + (i % 3) * 8, y: from.y + (i % 2) * 6 }, to, { ms: 520, delay: i * 70, arc: -50, spin: -360 }); setTimeout(() => sfx('tock', { volume: 0.35, pitch: 0.9 + i * 0.05 }), i * 70 + 480); }
    setTimeout(() => hop(), nl * 70 + 420);
    // cash box pops, coins fly to the purse
    setTimeout(() => {
      if (S.closed) return;
      anim(E.lid, [{ transform: 'none' }, { transform: 'translate(-6px,-10px) rotate(-24deg)' }, { transform: 'translate(-6px,-10px) rotate(-22deg)', offset: 0.8 }, { transform: 'none' }], { duration: 1100, easing: 'ease-out' });
      anim(E.box, [{ transform: 'none' }, { transform: 'scale(1.06,0.92)' }, { transform: 'scale(0.97,1.05)' }, { transform: 'none' }], { duration: 300 });
      sfx('coins', { volume: 0.55 });
      const src = artToPx(214, 116), dst = coinTargetPt();
      const nc = clamp(Math.ceil(coins / 5), 3, 14);
      for (let i = 0; i < nc; i++) {
        const sx = src.x + (Math.random() - 0.5) * 30, sy = src.y;
        flyImg(A.coin, { x: sx, y: sy }, dst, { ms: 750 + Math.random() * 250, delay: i * 55, arc: -90 - Math.random() * 60, spin: 0, size: 1.4 });
        setTimeout(() => sfx('coin', { volume: 0.3, pitch: 1 + i * 0.04 }), i * 55 + 700);
      }
      const pop = add('lt-pop', 184, 104, 64, 14, `+${coins}`);
      anim(pop, [{ transform: 'translateY(4px) scale(0.6)', opacity: 0 }, { transform: 'translateY(-6px) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translateY(-16px)', opacity: 1, offset: 0.75 }, { transform: 'translateY(-22px)', opacity: 0 }], { duration: 1400, fill: 'forwards' });
      setTimeout(() => pop.remove(), 1500);
      S.earned += coins;
    }, nl * 70 + 300);
    // stock goes down (the host may already have called refresh inside onSell)
    if (!S.refreshed) S.wood = Math.max(0, S.wood - n);
    S.refreshed = false;
    if (S.qty !== 'all' && S.qty > S.wood) S.qty = S.wood >= 5 ? 5 : 1;
    say(res.msg || `${n} log${n > 1 ? 's' : ''}? Pleasure doin' business!`);
    setTimeout(() => { if (S.closed) return; S.busy = false; render(); }, nl * 70 + 700);
    render();
  }
  function shake(node) { anim(node, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 300 }); }
  E.sell.addEventListener('click', sell);
  E.sell.addEventListener('mouseenter', () => sfx('hover', { volume: 0.3 }));

  // ---------------------------------------------------------------- open / close / layout
  function layout() {
    const rw = el.clientWidth || innerWidth, rh = el.clientHeight || innerHeight;
    const u = Math.max(1, Math.min(4, Math.floor(Math.min((rw - 16) / W, (rh - 16) / H))));
    stage.style.transform = `translate(${Math.floor((rw - W * u) / 2)}px, ${Math.floor((rh - H * u) / 2)}px) scale(${u})`;
    el.style.setProperty('--u', u);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(layout) : null;
  ro?.observe(el);
  addEventListener('resize', layout);
  function onKey(e) {
    if (S.closed) return;
    if (e.key === 'Escape') { e.preventDefault(); userClose(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sell(); }
    else if (e.key === '1') pick(1, E.tags[0]);
    else if (e.key === '5') pick(5, E.tags[1]);
    else if (e.key === '0') pick(10, E.tags[2]);
    else if (e.key === 'a' || e.key === 'A') pick('all', E.tags[3]);
  }
  addEventListener('keydown', onKey);
  function close() {
    if (S.closed) return;
    S.closed = true;
    clearInterval(talkTimer); clearTimeout(blinkTimer);
    removeEventListener('keydown', onKey); removeEventListener('resize', layout);
    ro?.disconnect();
    el.remove();
  }
  function userClose() {
    if (S.closed) return;
    sfx('close', { volume: 0.4 });
    el.classList.add('lt-out');
    S.closing = true;
    setTimeout(() => { close(); try { o.onClose?.(); } catch (e) { console.warn(e); } }, 260);
  }
  E.x.addEventListener('click', userClose);
  el.querySelector('.lt-dim').addEventListener('click', userClose);

  layout();
  S.qty = S.wood >= 5 ? 5 : 1;
  render();
  sfx('open', { volume: 0.4 });
  setTimeout(() => sfx('bell', { volume: 0.35, pitch: 1.5 }), 380);
  setTimeout(() => say(S.wood ? chat[S.chatI++ % chat.length] : 'Got no logs? Chop a tree, partner!'), 450);
  requestAnimationFrame(() => el.focus?.({ preventScroll: true }));

  return {
    el,
    say,
    close,
    refresh(d = {}) {
      if (S.closed) return;
      if (d.wood != null) { S.wood = Math.max(0, Math.floor(+d.wood || 0)); if (S.busy) S.refreshed = true; }
      if (d.price != null) S.price = Math.max(0, Math.round(+d.price || 0));
      if (d.trend != null) S.trend = d.trend;
      if (S.qty !== 'all' && S.qty > S.wood) S.qty = S.wood >= 5 ? 5 : 1;
      render();
    },
  };
}
