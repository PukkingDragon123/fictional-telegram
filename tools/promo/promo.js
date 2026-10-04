// Compositor for the promo art: lays the bold typography, burst, arrow and cut-out
// outlines over the renders made by capture.mjs (tools/promo/renders/*.png).
//   promo.html?kind=thumb   630 x 500 CSS px  (screenshot at DPR 1 and 2)
//   promo.html?kind=banner  960 x 240 CSS px  (screenshot at DPR 1 and 2)
// Sets window.__ready once fonts + images are in.
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'thumb';
const bust = '?t=' + (Q.get('t') || Date.now());
const R = (f) => `./renders/${f}${bust}`;
const stage = document.getElementById('stage');

function el(tag, cls, css = {}, parent = stage) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e.style, css);
  parent.appendChild(e);
  return e;
}

// text-shadow ring: every whole-px offset within radius r (slightly squared corners = chunky pixel look)
function ring(r, color, dx = 0, dy = 0) {
  const out = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) out.push(`${x + dx}px ${y + dy}px 0 ${color}`);
  return out.join(',');
}

// Layered title text: drop shadow, outer outline, inner outline, gradient fill.
function bigText(parent, lines, o) {
  const box = el('div', 'txt', { left: o.x + 'px', top: o.y + 'px', fontSize: o.size + 'px', transform: `rotate(${o.rot || 0}deg)`, transformOrigin: o.origin || 'left top', textAlign: o.align || 'left' }, parent);
  lines.forEach((t, i) => {
    const L = el('div', 'l', { fontSize: (o.sizes?.[i] || o.size) + 'px', marginTop: i ? (o.gap ?? 0) + 'px' : 0, marginLeft: (o.indent?.[i] || 0) + 'px', letterSpacing: (o.track ?? 0) + 'px' }, box);
    const R1 = o.outline, R2 = o.outline + (o.outer || 0);
    if (o.shadow) el('span', 'sh', { color: o.shadow.color, textShadow: ring(R2, o.shadow.color, o.shadow.x, o.shadow.y) + (o.shadow.glow ? ',' + o.shadow.glow : ''), transform: `translate(${o.shadow.x}px, ${o.shadow.y}px)` }, L).textContent = t;
    if (o.outer) el('span', 'ou', { color: o.outerColor, textShadow: ring(R2, o.outerColor) }, L).textContent = t;
    el('span', 'ol', { color: o.outlineColor, textShadow: ring(R1, o.outlineColor) }, L).textContent = t;
    const f = el('span', 'fill', { backgroundImage: o.fill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }, L);
    f.textContent = t;
    if (o.shine) { const s = el('span', 'shine', { color: 'transparent', backgroundImage: o.shine, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', mixBlendMode: 'screen' }, L); s.textContent = t; }
  });
  return box;
}

// cut-out of the render along an actor mask, with stacked drop-shadow outlines + glow
function cutout(bgUrl, maskUrl, filters, extra = {}) {
  const w = el('div', 'cut', { filter: filters.join(' '), ...extra });
  el('div', '', { backgroundImage: `url(${bgUrl})`, WebkitMaskImage: `url(${maskUrl})`, maskImage: `url(${maskUrl})`, filter: 'saturate(1.22) contrast(1.07) brightness(1.03)' }, w);
  return w;
}
const outline = (px, c) => [`drop-shadow(${px}px 0 0 ${c})`, `drop-shadow(-${px}px 0 0 ${c})`, `drop-shadow(0 ${px}px 0 ${c})`, `drop-shadow(0 -${px}px 0 ${c})`];

function burst(cx, cy, r, { rays = 18, a = 'rgba(255,236,150,0.55)', b = 'rgba(255,170,60,0)', rot = 0, fade = 0.95 } = {}) {
  const stops = [];
  for (let i = 0; i < rays; i++) { const s = (i / rays) * 360, m = s + 360 / rays / 2; stops.push(`${a} ${s}deg ${m}deg`, `${b} ${m}deg ${s + 360 / rays}deg`); }
  return el('div', 'burst', {
    left: cx - r + 'px', top: cy - r + 'px', width: r * 2 + 'px', height: r * 2 + 'px',
    background: `conic-gradient(from ${rot}deg, ${stops.join(',')})`,
    WebkitMaskImage: `radial-gradient(circle, #000 0%, rgba(0,0,0,.85) 30%, rgba(0,0,0,0) ${fade * 100}%)`,
    maskImage: `radial-gradient(circle, #000 0%, rgba(0,0,0,.85) 30%, rgba(0,0,0,0) ${fade * 100}%)`,
  });
}

// chunky red arrow (SVG path along a curve) with a white + dark outline
function arrow(d, { w = 16, head = 34, color = '#ff2a2a', x = 0, y = 0, width = 300, height = 200, rot = 0 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', width); svg.setAttribute('height', height);
  Object.assign(svg.style, { position: 'absolute', left: x + 'px', top: y + 'px', transform: `rotate(${rot}deg)`, filter: 'drop-shadow(0 5px 0 rgba(40,10,30,.55))' });
  stage.appendChild(svg);
  const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
  const defs = mk('defs', {});
  const m = document.createElementNS(ns, 'marker');
  // the head is drawn by hand below (markers do not take outlines well)
  defs.appendChild(m);
  const path = mk('path', { d, fill: 'none', stroke: 'none' });
  const L = path.getTotalLength();
  const tip = path.getPointAtLength(L), pre = path.getPointAtLength(L - 2);
  const ang = Math.atan2(tip.y - pre.y, tip.x - pre.x);
  const back = path.getPointAtLength(L - head * 0.8);
  const hx = (a, r) => [tip.x + Math.cos(ang + a) * r, tip.y + Math.sin(ang + a) * r];
  const p1 = hx(Math.PI - 0.62, head), p2 = hx(Math.PI + 0.62, head);
  const tri = `M${tip.x + Math.cos(ang) * 4},${tip.y + Math.sin(ang) * 4} L${p1[0]},${p1[1]} L${back.x},${back.y} L${p2[0]},${p2[1]} Z`;
  const shaft = path.getAttribute('d');
  const shaftLen = L - head * 0.6;
  for (const [c, add] of [['#2a0f1e', 13], ['#ffffff', 8], [color, 0]]) {
    mk('path', { d: shaft, fill: 'none', stroke: c, 'stroke-width': w + add, 'stroke-linecap': 'round', 'stroke-dasharray': `${shaftLen} 9999` });
    mk('path', { d: tri, fill: c, stroke: c, 'stroke-width': add, 'stroke-linejoin': 'round' });
  }
  // a glossy streak
  mk('path', { d: shaft, fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': w * 0.28, 'stroke-linecap': 'round', 'stroke-dasharray': `${shaftLen * 0.55} 9999`, transform: `translate(0,-${w * 0.2})` });
  return svg;
}

const FILL_GOLD = 'linear-gradient(180deg, #fff9c4 0%, #ffe14a 30%, #ffb52e 62%, #ff7a1e 100%)';
const SHINE = 'linear-gradient(180deg, rgba(255,255,255,.0) 0%, rgba(255,255,255,0) 100%)';

// ------------------------------------------------------------------ the cover
function thumb() {
  const W = 630, H = 500;
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  el('div', 'bg', { backgroundImage: `url(${R('thumb.png')})` });
  // warm glow + rays behind the bear
  burst(438, 230, 330, { rays: 20, a: 'rgba(255,230,140,0.42)', rot: 4, fade: 0.9 });
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 60% 45% at 70% 46%, rgba(255,120,60,.22), rgba(255,120,60,0) 70%)', mixBlendMode: 'screen' });
  // bottom + top darkening so the type pops
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(36,10,48,.55) 0%, rgba(36,10,48,0) 30%, rgba(36,10,48,0) 74%, rgba(30,8,36,.72) 100%)' });
  // the bear: white outline + angry red glow
  cutout(R('thumb.png'), R('thumb-bear.png'), [...outline(2, '#fff'), 'drop-shadow(0 0 7px rgba(255,40,40,.95))', 'drop-shadow(0 0 16px rgba(255,60,30,.6))']);
  // Reynard: thick white outline, gold rim glow
  cutout(R('thumb.png'), R('thumb-fox.png'), [...outline(3, '#fff'), ...outline(2, '#fff'), 'drop-shadow(0 0 8px rgba(255,220,90,.95))', 'drop-shadow(0 0 22px rgba(255,170,50,.55))']);
  // the arrow at the bear
  arrow('M 16 120 C 40 60, 90 30, 150 44', { x: 238, y: 158, width: 220, height: 170, w: 14, head: 30 });
  // !?
  bigText(stage, ['!?'], { x: 196, y: 186, size: 104.17, rot: 14, outline: 5, outlineColor: '#2a0f1e', outer: 4, outerColor: '#fff',
    fill: 'linear-gradient(180deg, #fff6a0 0%, #ffd23a 45%, #ff5a2a 100%)', shadow: { x: 0, y: 6, color: 'rgba(42,15,30,.7)' } });
  // title
  bigText(stage, ['THE BEAR', 'MUST EAT'], { x: 14, y: 4, size: 83.33, sizes: [72.92, 104.17], gap: -12, indent: [6, 0], rot: -4, origin: 'left top',
    outline: 5, outlineColor: '#3a1408', outer: 4, outerColor: '#fff6e0', fill: FILL_GOLD,
    shadow: { x: 0, y: 8, color: 'rgba(40,8,40,.75)', glow: '0 0 26px rgba(255,140,60,.6)' } });
  // tagline ribbon
  const tag = el('div', '', { left: '50%', bottom: '14px', transform: 'translateX(-50%) rotate(-2deg)', padding: '7px 18px 9px', background: 'linear-gradient(180deg, #ff4d6d, #d0204a)', border: '3px solid #2a0f1e', borderRadius: '10px', boxShadow: '0 0 0 3px #fff6e0, 0 6px 0 3px rgba(40,8,40,.7)' });
  bigText(tag, ['a cozy incremental / tycoon'], { x: 0, y: 0, size: 31.25, outline: 3, outlineColor: '#2a0f1e', fill: 'linear-gradient(180deg,#ffffff,#ffe9c0)' }).style.position = 'relative';
}

// ------------------------------------------------------------------ the banner
function banner() {
  const W = 960, H = 240;
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  el('div', 'bg', { backgroundImage: `url(${R('banner.png')})` });
  // party glow over the dance floor
  burst(380, 30, 420, { rays: 26, a: 'rgba(255,226,150,0.16)', rot: 8, fade: 0.8 });
  // rage glow on the right
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 30% 70% at 85% 60%, rgba(255,40,40,.22), rgba(255,40,40,0) 70%)', mixBlendMode: 'screen' });
  // left panel for the type
  el('div', '', { inset: 0, background: 'linear-gradient(90deg, rgba(30,8,40,.88) 0%, rgba(30,8,40,.72) 21%, rgba(30,8,40,0) 32%)' });
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(30,8,40,0) 70%, rgba(30,8,40,.45) 100%)' });
  cutout(R('banner.png'), R('banner-b1+b2+b3+b4.png'), [...outline(1, '#2a0f1e'), 'drop-shadow(0 0 4px rgba(255,40,40,1))', 'drop-shadow(0 0 10px rgba(255,50,30,.7))']);
  cutout(R('banner.png'), R('banner-fox.png'), [...outline(2, '#fff'), 'drop-shadow(0 0 6px rgba(255,220,90,.95))', 'drop-shadow(0 0 14px rgba(255,170,50,.6))']);
  // comic RAWR at the bears
  bigText(stage, ['RAWR!'], { x: 806, y: 8, size: 41.67, rot: 8, outline: 3, outlineColor: '#2a0f1e', outer: 3, outerColor: '#fff',
    fill: 'linear-gradient(180deg, #ffe46a 0%, #ff8a2a 55%, #ff2a2a 100%)', shadow: { x: 0, y: 4, color: 'rgba(42,15,30,.7)' } });
  // title + tagline
  bigText(stage, ['THE BEAR', 'MUST EAT'], { x: 18, y: 20, size: 62.5, sizes: [50, 66.67], gap: -6, indent: [4, 0], rot: -3,
    outline: 4, outlineColor: '#3a1408', outer: 3, outerColor: '#fff6e0', fill: FILL_GOLD,
    shadow: { x: 0, y: 6, color: 'rgba(40,8,40,.8)', glow: '0 0 20px rgba(255,140,60,.55)' } });
  const tag = el('div', '', { left: '22px', top: '170px', transform: 'rotate(-2deg)', padding: '4px 12px 6px', background: 'linear-gradient(180deg, #ff4d6d, #d0204a)', border: '2px solid #2a0f1e', borderRadius: '8px', boxShadow: '0 0 0 2px #fff6e0, 0 4px 0 2px rgba(40,8,40,.7)' });
  bigText(tag, ['a cozy incremental / tycoon'], { x: 0, y: 0, size: 20.83, outline: 2, outlineColor: '#2a0f1e', fill: 'linear-gradient(180deg,#ffffff,#ffe9c0)' }).style.position = 'relative';
}

const SCENES = { thumb, banner };
SCENES[kind]?.();

// ready once fonts and every image are in
const urls = [...stage.querySelectorAll('*')].flatMap((e) => [e.style.backgroundImage, e.style.maskImage, e.style.webkitMaskImage]).filter(Boolean).flatMap((s) => [...s.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]));
Promise.all([document.fonts.ready, document.fonts.load("40px 'TBME Title'"), ...[...new Set(urls)].map((u) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = u; }))])
  .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  .then(() => { window.__ready = true; });
