// [v26 uiscale] The camera pad (zoom / turn / home buttons) finds a free spot: on phones, phone landscape
// and iPad portrait the default bottom-left corner sits on the toolbar or the food shelf.
//
//   autoPlaceCamPad(pad)   (UI.buildCamPad) -> stop()
//
// Tries, in order: the CSS spot (unchanged on desktop / iPad landscape), then on top of each bottom-docked
// piece (toolbar, food shelf, egg tray, blueprint sheet), left side first, then the right; each as the usual
// block, one row, or one column. The first spot clear of every HUD piece wins (else the least covered one).
// Re-checks when the HUD pieces move (food shelf shown / hidden, blueprint, resize).
const OBSTACLES = ['#toolbar', '.fp.fp-on', '.qn', '.qn-peek', '.hud2', '.bigclock-host', '#b-menu', '.eggtray', '.bp-sheet', '.fsm-strip'];
const DOCKED = ['#toolbar', '.fp.fp-on', '.eggtray', '.bp-sheet'];
const GAP = 6, MARGIN = 10;
const MODES = ['', 'cp-row', 'cp-col'];

let cssDone = false;
function injectCSS() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.id = 'tbme-campad-layout';
  st.textContent = `
.campad.cp-row { align-items: center; }
.campad.cp-row .cp-zoom { flex-direction: row; }
.campad.cp-col { flex-direction: column; align-items: flex-start; }
.campad.cp-col .cp-rot { flex-direction: column; }`;
  document.head.appendChild(st);
}

function rectOf(el) {
  if (!el || !el.isConnected) return null;
  for (let p = el; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
  }
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2 ? r : null;
}
const rects = (sels) => sels.map((s) => rectOf(document.querySelector(s))).filter(Boolean);
const overlap = (a, list) => list.reduce((t, b) => t
  + Math.max(0, Math.min(a.right, b.right + GAP) - Math.max(a.left, b.left - GAP))
  * Math.max(0, Math.min(a.bottom, b.bottom + GAP) - Math.max(a.top, b.top - GAP)), 0);

export function autoPlaceCamPad(pad) {
  if (!pad || typeof window === 'undefined') return () => {};
  injectCSS();
  let sig = '';
  const apply = (c) => {
    pad.classList.remove('cp-row', 'cp-col');
    if (c.mode) pad.classList.add(c.mode);
    pad.style.bottom = c.bottom == null ? '' : `${c.bottom}px`;
    pad.style.left = c.side === 'right' ? 'auto' : '';
    pad.style.right = c.side === 'right' ? `calc(${MARGIN}px + var(--safe-r, 0px))` : '';
  };
  const layout = () => {
    const H = window.innerHeight, W = window.innerWidth;
    const obs = rects(OBSTACLES);
    const bottoms = [null, ...new Set(rects(DOCKED).map((r) => Math.round(H - r.top + GAP)).sort((a, b) => a - b))];
    let best = null;
    for (const side of ['left', 'right']) for (const bottom of bottoms) for (const mode of MODES) {
      const c = { side, bottom, mode };
      apply(c);
      const r = pad.getBoundingClientRect();
      const out = Math.max(0, -r.top) + Math.max(0, r.bottom - H) + Math.max(0, -r.left) + Math.max(0, r.right - W);
      const cost = overlap(r, obs) + out * 1000;
      if (!best || cost < best.cost) best = { ...c, cost };
      if (cost === 0) { pad.dataset.spot = `${side} ${bottom ?? 'css'} ${mode || 'block'}`; return; }
    }
    if (best) { apply(best); pad.dataset.spot = `${best.side} ${best.bottom ?? 'css'} ${best.mode || 'block'} (least covered)`; }
  };
  const check = () => {
    if (!pad.isConnected) return;
    if (getComputedStyle(pad).display === 'none') return;
    const s = [window.innerWidth, window.innerHeight, document.body.className,
      ...OBSTACLES.map((q) => { const r = rectOf(document.querySelector(q)); return r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}` : '-'; })].join('|');
    if (s === sig) return;
    sig = s;
    layout();
  };
  const iv = setInterval(check, 400);
  const onResize = () => { sig = ''; check(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(check);
  return () => { clearInterval(iv); window.removeEventListener('resize', onResize); };
}
