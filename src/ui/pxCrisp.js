// [v27 knobs] Crisp pixel canvases for UI widgets (pxSlider.js, ynButtons.js).
//
// Art is painted at 1 canvas px = 1 art texel into a small "art" canvas, then
// blown up by a WHOLE number of device pixels per texel into the canvas that is
// shown, which is displayed at exactly its device size. Nothing is ever scaled by
// the browser, so iPad Safari (which may smooth scaled backgrounds / border-images)
// shows hard pixel edges too.
//
//   texelPx(css)            CSS px per texel nearest `css` that is whole device px
//   artCanvas(w, h)         a fresh texel canvas + its 2D context
//   blit(art, t, out?)      draws `art` into `out` (created when missing) at t CSS px
//                           per texel; sets out's pixel size and CSS size
import { crispPx, dpr } from './uiScale.js';

export const texelPx = (css) => crispPx(css);

export function artCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return { c, g: c.getContext('2d') };
}

export function blit(art, t, out = document.createElement('canvas')) {
  const r = dpr(), k = Math.max(1, Math.round(t * r));
  const W = art.width * k, H = art.height * k;
  if (out.width !== W) out.width = W;
  if (out.height !== H) out.height = H;
  out.style.width = `${W / r}px`;
  out.style.height = `${H / r}px`;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  g.drawImage(art, 0, 0, W, H);
  return out;
}

/** rgb triple or css string -> css string */
export const css = (c) => (Array.isArray(c) ? `rgb(${c[0]},${c[1]},${c[2]})` : c);

/** paint a pattern (array of strings) with a palette { ch: color }; '.' / missing = skip */
export function pattern(g, rows, x0, y0, pal) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

// every live widget repaints when the device pixel ratio changes (browser zoom, moving
// the window to another screen)
const live = new Set();
let lastR = 0, bound = false;
export function trackDpr(fn) {
  live.add(fn);
  if (!bound && typeof window !== 'undefined') {
    bound = true; lastR = dpr();
    window.addEventListener('resize', () => {
      const r = dpr();
      if (r === lastR) return;
      lastR = r;
      for (const f of [...live]) { try { if (f() === false) live.delete(f); } catch { live.delete(f); } }
    });
  }
  return () => live.delete(fn);
}
