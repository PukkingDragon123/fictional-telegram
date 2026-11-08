// [v33 kit] The shared UI art-pixel scale: how many CSS px one art pixel of the
// hotbar / HUD objects takes. Integer steps only, never smoothed:
//
//   art px = max(1, round(min(innerWidth / 640, innerHeight / 360)))   (2 at 1280x720, 3 at 1920x1080)
//
//   uiArtPx()                 -> the current art px (an integer >= 1)
//   onUiArtPx(fn)             -> unsubscribe()   fn(px) once now and again whenever the scale changes
//                                (window resize / rotate, debounced to one call per frame)
//   applyUiArtPx(el, name)    -> unsubscribe()   keeps `--<name>` (default --px) = `${px}px` on el
//
// Used by src/ui/kit/ToolKit.js (the leather tool roll) and the HUD clock (src/ui/BigClock.js).
export function uiArtPx(w = typeof window !== 'undefined' ? window.innerWidth : 1280, h = typeof window !== 'undefined' ? window.innerHeight : 720) {
  return Math.max(1, Math.round(Math.min(w / 640, h / 360)));
}

const subs = new Set();
let last = 0, raf = 0, bound = false;
function fire() {
  raf = 0;
  const px = uiArtPx();
  if (px === last) return;
  last = px;
  for (const fn of [...subs]) { try { fn(px); } catch (e) { console.warn('uiArtPx listener', e); } }
}
function bind() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  last = uiArtPx();
  const on = () => { if (!raf) raf = requestAnimationFrame(fire); };
  window.addEventListener('resize', on);
  window.addEventListener('orientationchange', on);
}

export function onUiArtPx(fn) {
  bind();
  subs.add(fn);
  try { fn(uiArtPx()); } catch (e) { console.warn('uiArtPx listener', e); }
  return () => subs.delete(fn);
}

export function applyUiArtPx(el, name = 'px') {
  return onUiArtPx((px) => el?.style?.setProperty(`--${name}`, `${px}px`));
}
