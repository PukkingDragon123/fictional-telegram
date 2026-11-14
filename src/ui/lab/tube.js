// [v30 research] The GREEN LIQUID research tube: a glass tube with brass end caps that
// fills left to right with bubbling, sloshing green liquid (a wobbling meniscus at the
// front, bubbles that rise and pop, a glass glint, a green glow). Used ONLY for research
// progress (the lab computer's detail panel and its bench cards, src/ui/LabTree.js).
//
// Pixel art: painted at "art" resolution into a small offscreen canvas, then blown up
// by a whole number of device px per art px onto the visible canvas (crisp on iPad).
//
//   const tube = new Tube(canvasEl, { cssPx: 2, h: 18 });   // art px height
//   tube.fit(cssWidth);          // sizes the canvas (call on resize)
//   tube.draw(t, k, { done, slosh, glow });   // t seconds, k = 0..1 progress
//   tube.splash(1);              // a slosh kick (rush), decays by itself
import { dpr } from '../uiScale.js';

// palette
const C = {
  ink: '#0b1410', glassD: '#123026', glass: '#173a2e', glassL: '#24503f', tick: '#3f7a5e', tickL: '#6fae8a',
  liqD: '#147a32', liq: '#28b84a', liqM: '#46d862', liqL: '#8ef58a', foam: '#d6ffc8', bub: '#c8ffd0', bubD: '#5fe07a',
  brassD: '#6a4214', brass: '#c88a2c', brassM: '#e2a83e', brassL: '#ffe08a', bolt: '#4a2c0c',
  glint: 'rgba(255,255,255,0.55)', glint2: 'rgba(255,255,255,0.22)',
};
const CAP = 5; // brass cap width (art px)
const frac = (x) => x - Math.floor(x);

/**
 * Paint a tube at art resolution. (x, y) = top-left, w x h art px (h >= 9).
 * state: { t, k, done, slosh, glow }
 */
export function paintTube(ctx, x, y, w, h, { t = 0, k = 0, done = false, slosh = 0, glow = 1 } = {}) {
  const R = (cx, cy, cw, ch, col) => { if (cw > 0 && ch > 0) { ctx.fillStyle = col; ctx.fillRect(x + cx, y + cy, cw, ch); } };
  const gx0 = CAP, gx1 = w - CAP; // glass span
  const L = gx1 - gx0; // inner length incl. outline columns
  const iy0 = 2, iy1 = h - 2; // interior rows [iy0, iy1)
  const ih = iy1 - iy0;
  // --- glass body: outline + interior
  R(gx0, 0, L, 1, C.ink); R(gx0, h - 1, L, 1, C.ink);
  R(gx0, 1, L, 1, C.glassL); R(gx0, h - 2, L, 1, C.glassD);
  R(gx0, iy0, L, ih, C.glass);
  // faint inner shading: the bottom third darker
  R(gx0, iy1 - Math.max(1, Math.round(ih / 3)), L, Math.max(1, Math.round(ih / 3)), C.glassD);
  // --- liquid
  const kk = Math.max(0, Math.min(1, k));
  const fillW = Math.round(kk * L);
  if (fillW > 0) {
    const amp = 0.6 + slosh * 2.2;
    const lvl = iy0 + 1; // surface row at rest (a 1 px air gap under the glass top)
    for (let cx = 0; cx < fillW; cx++) {
      const X = gx0 + cx;
      // travelling surface waves (two frequencies) + slosh
      const wv = Math.sin(cx * 0.45 - t * 5.2) * 0.5 + Math.sin(cx * 0.17 + t * 2.3) * 0.5;
      let top = lvl + Math.round((wv * amp + amp) * 0.5);
      // the meniscus: the liquid climbs the glass right at the front edge
      const fromFront = fillW - 1 - cx;
      if (fromFront < 2 && kk < 1) top -= 1;
      top = Math.max(iy0, Math.min(iy1 - 2, top));
      R(X, top, 1, iy1 - top, C.liq);
      R(X, iy1 - Math.max(1, Math.round(ih * 0.35)), 1, Math.max(1, Math.round(ih * 0.35)), C.liqD);
      R(X, top, 1, 1, C.liqL);
      if (top + 1 < iy1) R(X, top + 1, 1, 1, C.liqM);
      // a few foam specks riding the surface
      if (frac(Math.sin(cx * 12.9898 + Math.floor(t * 3) * 7.1) * 43758.5) > 0.86) R(X, top, 1, 1, C.foam);
    }
    // the front edge: a bright wobbling meniscus line
    if (kk < 1) {
      const fx = gx0 + fillW - 1;
      for (let ry = iy0; ry < iy1; ry++) {
        const bulge = Math.round(Math.sin(t * 7 + ry * 0.9) * (0.5 + slosh));
        const mid = Math.abs(ry - (iy0 + ih / 2)) < ih / 3 ? 1 : 0; // convex front
        const ex = fx + mid + bulge;
        if (ex >= gx0 && ex < gx1) R(ex, ry, 1, 1, ry === iy0 ? C.foam : C.liqL);
      }
    }
    // bubbles: rise from the bottom, pop under the surface
    const n = Math.max(3, Math.round(fillW / 7));
    for (let i = 0; i < n; i++) {
      const sd = frac(Math.sin(i * 78.233 + 1.7) * 43758.5453);
      const sp = 0.45 + frac(sd * 7.31) * 0.7;
      const ph = frac(t * sp + sd);
      const bx = gx0 + 1 + Math.floor(frac(sd * 3.77 + Math.floor(t * sp + sd) * 0.618) * Math.max(1, fillW - 3));
      if (bx >= gx0 + fillW - 1) continue;
      const by = Math.round(iy1 - 1 - ph * (ih - 1)) + 0;
      const big = sd > 0.62 && ih >= 8;
      if (ph > 0.9) { // pop: a little sparkle at the surface
        R(bx - 1, iy0 + 1, 1, 1, C.foam); R(bx + 1, iy0 + 1, 1, 1, C.foam);
        continue;
      }
      const wob = Math.round(Math.sin(t * 6 + i) * 0.6);
      if (big) { R(bx + wob, by - 1, 2, 1, C.bub); R(bx + wob - 1, by, 1, 1, C.bub); R(bx + wob + 2, by, 1, 1, C.bubD); R(bx + wob, by + 1, 2, 1, C.bubD); }
      else R(bx + wob, by, 1, 1, C.bub);
    }
  }
  // --- graduation ticks along the top (every 10%, longer at 25/50/75)
  for (let i = 1; i < 10; i++) {
    const tx = gx0 + Math.round((L * i) / 10);
    R(tx, iy0, 1, i === 5 ? 3 : 2, i * 10 <= kk * 100 ? C.foam : C.tickL);
  }
  for (const q of [0.25, 0.75]) R(gx0 + Math.round(L * q), iy0, 1, 3, kk >= q ? C.foam : C.tick);
  // --- glass glints (over the liquid)
  ctx.fillStyle = C.glint;
  ctx.fillRect(x + gx0 + 3, y + iy0, Math.max(0, Math.min(L - 6, Math.round(L * 0.18))), 1);
  ctx.fillStyle = C.glint2;
  ctx.fillRect(x + gx0 + Math.round(L * 0.3), y + iy0, Math.round(L * 0.4), 1);
  const gp = frac(t * 0.18);
  if (gp < 0.25) { ctx.fillStyle = C.glint; ctx.fillRect(x + gx0 + Math.round(gp * 4 * L), y + iy0 + 1, 3, 1); }
  // --- brass end caps (chamfered pixel corners, a bolt)
  for (const side of [0, 1]) {
    const cx = side ? w - CAP : 0;
    R(cx + 1, 0, CAP - 2, 1, C.ink); R(cx + 1, h - 1, CAP - 2, 1, C.ink);
    R(cx, 1, 1, h - 2, C.ink); R(cx + CAP - 1, 1, 1, h - 2, C.ink);
    R(cx + 1, 1, CAP - 2, h - 2, C.brass);
    R(cx + 1, 1, CAP - 2, 1, C.brassL);
    R(cx + 1, 2, 1, h - 4, C.brassM);
    R(cx + 1, h - 2, CAP - 2, 1, C.brassD);
    R(cx + CAP - 2, 2, 1, h - 4, C.brassD);
    const by = Math.floor(h / 2) - 1;
    R(cx + 2, by, 1, 2, C.bolt);
    R(cx + 2, 3, 1, 1, C.brassL); R(cx + 2, h - 4, 1, 1, C.bolt);
  }
  // done: a bright flash over the liquid
  if (done) {
    const f = 0.5 + 0.5 * Math.sin(t * 14);
    ctx.fillStyle = `rgba(220,255,200,${(0.12 + 0.2 * f) * glow})`;
    ctx.fillRect(x + gx0, y + iy0, L, ih);
  }
}

// green glow around the filled part (stepped, pixel-art halo)
function paintGlow(ctx, x, y, w, h, k, t, done) {
  const L = w - CAP * 2;
  const fw = Math.round(Math.max(0, Math.min(1, k)) * L);
  if (fw <= 0) return;
  const p = 0.75 + 0.25 * Math.sin(t * 2.6);
  const a = (done ? 0.3 : 0.16) * p;
  ctx.fillStyle = `rgba(90,255,120,${a})`;
  ctx.fillRect(x + CAP, y - 1, fw, h + 2);
  ctx.fillStyle = `rgba(90,255,120,${a * 0.5})`;
  ctx.fillRect(x + CAP + 1, y - 2, Math.max(0, fw - 2), h + 4);
}

export class Tube {
  /** @param {HTMLCanvasElement} canvas  @param {{ cssPx?: number, h?: number }} o */
  constructor(canvas, { cssPx = 2, h = 18 } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cssPx = cssPx; // css px per art px (rounded to whole device px)
    this.ah = h; // art height of the tube
    this.pad = 3; // art px around it (glow)
    this.art = document.createElement('canvas');
    this.actx = this.art.getContext('2d');
    this.slosh = 0;
    this.aw = 0;
  }

  fit(cssW) {
    const r = dpr();
    const u = Math.max(1, Math.round(this.cssPx * r)); // device px per art px
    const aw = Math.max(24, Math.floor((cssW * r) / u));
    if (aw === this.aw && u === this.u) return;
    this.aw = aw; this.u = u;
    const AH = this.ah + this.pad * 2;
    this.art.width = aw; this.art.height = AH;
    this.cv.width = aw * u; this.cv.height = AH * u;
    this.cv.style.width = `${(aw * u) / r}px`;
    this.cv.style.height = `${(AH * u) / r}px`;
  }

  splash(v = 1) { this.slosh = Math.min(1.5, this.slosh + v); }

  draw(t, k, { done = false, dt = 1 / 30 } = {}) {
    if (!this.aw) return;
    this.slosh *= Math.pow(0.12, dt);
    const a = this.actx, W = this.aw, H = this.art.height, p = this.pad;
    a.clearRect(0, 0, W, H);
    paintGlow(a, 0, p, W, this.ah, k, t, done);
    paintTube(a, 0, p, W, this.ah, { t, k, done, slosh: this.slosh });
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.drawImage(this.art, 0, 0, this.cv.width, this.cv.height);
  }
}

/** css height of a tube with art height h at cssPx (for layout) */
export function tubeHeight(h = 18, cssPx = 2) { return (h + 6) * cssPx; }
