// [v26 demo] The DEMO ribbon: a red cloth banner with swallowtail ends, nailed
// across the bottom of the title's logo board (src/ui/TitleMenu.js, untouched:
// we find its `.tm-sign` and add to it). Pixel art at the menu's own scale (--s).
import { GOOFY_BIG, goofyBitmap } from '../ui/goofyFont.js';

const INK = '#2a160c';

function ribbonCanvas() {
  const bm = goofyBitmap(GOOFY_BIG, 'DEMO');
  const T = 9; // tail length
  const BW = bm.w + 16, BH = 15, DROP = 4;
  const W = BW + T * 2 - 4, H = BH + DROP + 1;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  // the tails, behind: darker cloth, a V cut into the outer end
  for (const side of [0, 1]) {
    const x0 = side ? W - T - 2 : 0, y0 = DROP, h = BH - 2;
    for (let y = 0; y < h; y++) {
      const notch = Math.round((1 - Math.abs(y - (h - 1) / 2) / ((h - 1) / 2)) * 4);
      for (let x = 0; x < T + 2; x++) {
        const fromOut = side ? T + 1 - x : x;
        if (fromOut < notch) continue;
        const edge = y === 0 || y === h - 1 || fromOut === notch;
        px(x0 + x, y0 + y, edge ? INK : y < 2 ? '#b83a2c' : y > h - 4 ? '#6e1e1a' : '#962c24');
      }
    }
  }
  // the folds where the band tucks under (dark triangles)
  for (let k = 0; k < DROP + 1; k++) {
    px(T - 2 + k, BH - 1 + Math.min(k, DROP) - k, '#4a1410');
    px(W - T + 1 - k, BH - 1 + Math.min(k, DROP) - k, '#4a1410');
  }
  // the band
  const bx = T - 2;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const edge = y === 0 || y === BH - 1 || x === 0 || x === BW - 1;
    let col = edge ? INK : y === 1 ? '#f07a5a' : y < 4 ? '#de5a40' : y > BH - 4 ? '#a83426' : '#c8462f';
    // stitching, two rows of dashes just inside the edges
    if (!edge && (y === 2 || y === BH - 3) && x > 1 && x < BW - 2 && (x >> 1) % 2 === 0) col = y === 2 ? '#ffc8a0' : '#e8907a';
    px(bx + x, y, col);
  }
  // DEMO, cream letters with an ink outline and a drop
  const tx = bx + Math.round((BW - bm.w) / 2), ty = Math.round((BH - bm.h) / 2);
  const on = [];
  bm.rows.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '#') on.push(u, v); });
  g.fillStyle = INK;
  for (let i = 0; i < on.length; i += 2) g.fillRect(tx + on[i] - 1, ty + on[i + 1] - 1, 3, 4);
  for (let i = 0; i < on.length; i += 2) px(tx + on[i], ty + on[i + 1], on[i + 1] < bm.h * 0.55 ? '#fff4dc' : '#ffd08a');
  // a brass tack in each end of the band
  for (const nx of [bx + 3, bx + BW - 5]) { g.fillStyle = INK; g.fillRect(nx - 1, 5, 4, 4); g.fillStyle = '#f2c860'; g.fillRect(nx, 6, 2, 2); g.fillStyle = '#9a6a1e'; g.fillRect(nx + 1, 7, 1, 1); }
  return c;
}

const CSS = `
.tm-demo { position: absolute; right: calc(var(--s) * 20); bottom: calc(var(--s) * -9); z-index: 2; pointer-events: none;
  transform: rotate(-6deg); transform-origin: 50% 30%;
  filter: drop-shadow(calc(var(--s) * 2) calc(var(--s) * 2) 0 rgba(40, 12, 36, .42));
  animation: tm-demo-slap .42s cubic-bezier(.5, 0, .8, .4) 1.5s both; }
.tm-demo canvas { display: block; image-rendering: pixelated; }
@keyframes tm-demo-slap {
  0% { transform: rotate(-22deg) scale(1.9); opacity: 0; }
  60% { transform: rotate(-4deg) scale(.92, 1.08); opacity: 1; }
  100% { transform: rotate(-6deg) scale(1); }
}
@media (prefers-reduced-motion: reduce) { .tm-demo { animation: none; } }`;

function decorate(sign) {
  if (!sign || sign.querySelector('.tm-demo')) return;
  if (!document.getElementById('tm-demo-css')) {
    const st = document.createElement('style');
    st.id = 'tm-demo-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const s = parseFloat(getComputedStyle(sign).getPropertyValue('--s')) || 3;
  const c = ribbonCanvas();
  c.style.width = `${c.width * s}px`;
  c.style.height = `${c.height * s}px`;
  const el = document.createElement('div');
  el.className = 'tm-demo';
  el.setAttribute('aria-label', 'Demo');
  el.appendChild(c);
  sign.appendChild(el);
}

// the menu comes and goes (and may be rebuilt): ribbon every logo board that shows up
export function watchTitle() {
  const scan = () => document.querySelectorAll('.tm-sign').forEach(decorate);
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(document.body, { childList: true, subtree: true });
  // once the game is running the title is gone for good
  const stop = setInterval(() => { if (window.__game?.running) { mo.disconnect(); clearInterval(stop); } }, 2000);
}
