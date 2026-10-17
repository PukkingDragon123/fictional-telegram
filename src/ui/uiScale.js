// [v26 uiscale] Pixel-art scale helpers: one rule for every screen.
//
// Art pixels must land on WHOLE device pixels, or some art pixels come out one
// device pixel wider than their neighbours (pixel art looks smeared / stretched)
// and canvases get resampled (blurry). With devicePixelRatio 2 (iPad) a 2 CSS px
// texel is 4 device px (crisp); a 4/3 zoom of it is 5.33 (smeared). Browser
// zoom, Windows display scaling and Safari page zoom give fractional ratios too.
//
//   dpr()                         devicePixelRatio (1 when unknown)
//   crispScale(fit, texel, o)     the largest scale <= fit at which one texel
//                                 (`texel` CSS px at scale 1) is a whole number of
//                                 device px; o = { min, max }. Below one device px
//                                 per texel it returns the plain fit.
//   crispPx(cssPerTexel)          CSS px per texel nearest to the ask that is a
//                                 whole number of device px (>= 1 device px)
//   viewSize()                    { w, h } of the layout viewport in CSS px: what
//                                 position:fixed; inset:0 covers. Stable under iOS
//                                 Safari pinch-zoom (innerWidth/innerHeight there
//                                 report the zoomed visual viewport).
//   lockPageZoom()                stops iOS Safari pinch / double-tap zooming the
//                                 whole page (it ignores user-scalable=no): a zoomed
//                                 page magnifies and blurs the whole UI.
export const dpr = () => (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);

export function crispScale(fit, texel = 1, { min = 0, max = Infinity, ratio = dpr() } = {}) {
  const per = Math.max(1e-6, texel * ratio); // device px per texel at scale 1
  const n = Math.floor(fit * per + 1e-6);
  const s = n >= 1 ? n / per : fit;
  return Math.min(max, Math.max(min, s));
}

export function crispPx(cssPerTexel, ratio = dpr()) {
  return Math.max(1, Math.round(cssPerTexel * ratio)) / ratio;
}

export function viewSize() {
  if (typeof window === 'undefined') return { w: 800, h: 600 };
  const de = document.documentElement;
  const w = (de && de.clientWidth) || window.innerWidth || 800;
  const h = (de && de.clientHeight) || window.innerHeight || 600;
  return { w, h };
}

let zoomLocked = false;
export function lockPageZoom() {
  if (zoomLocked || typeof document === 'undefined') return;
  zoomLocked = true;
  // Safari's own pinch events (iPad / iPhone / trackpad): never zoom the page
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, stop, { passive: false });
  // a two-finger touch that starts on a UI element would zoom the page too
  // (pointer events still reach the game's own pinch-to-zoom on the canvas)
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
    document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });
  }
}
