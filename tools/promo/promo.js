// Compositor for the promo art: lays the bold typography, burst, arrow and cut-out
// outlines over the renders made by capture.mjs (tools/promo/renders/*.png).
//   promo.html?kind=thumb   630 x 500 CSS px  (screenshot at DPR 1 and 2)
//   promo.html?kind=banner  960 x 240 CSS px  (screenshot at DPR 1 and 2)
//   &anim=<name>&n=<frames>  animated: renders/anim/<name>-fNN.png (+ -<mask>-fNN.png);
//                            window.setFrame(i) swaps the frame and moves the overlays
// Sets window.__ready once fonts + images are in.
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'thumb';
const bust = '?t=' + (Q.get('t') || Date.now());
const ANIM_NAME = Q.get('anim'), NF = +(Q.get('n') || 1);
const pad = (i) => String(i).padStart(2, '0');
// 'thumb.png' / 'thumb-fox.png' -> the still render or frame i of the animated one
function R(f, i = 0) {
  if (!ANIM_NAME) return `./renders/${f}${bust}`;
  const rest = f.replace(/\.png$/, '').replace(/^[^-]+/, ''); // '' or '-fox'
  return `./renders/anim/${ANIM_NAME}${rest}-f${pad(i)}.png${bust}`;
}
const stage = document.getElementById('stage');
const ANIM = []; // (phase 0..1) => void, run by setFrame
const TAU = Math.PI * 2;

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
function cutout(bgFile, maskFile, filters, extra = {}) {
  const w = el('div', 'cut', { filter: filters.join(' '), ...extra });
  const d = el('div', '', { backgroundImage: `url(${R(bgFile)})`, WebkitMaskImage: `url(${R(maskFile)})`, maskImage: `url(${R(maskFile)})`, filter: 'saturate(1.22) contrast(1.07) brightness(1.03)' }, w);
  d.dataset.src = bgFile; d.dataset.mask = maskFile;
  return w;
}
function bgLayer(file) { const d = el('div', 'bg', { backgroundImage: `url(${R(file)})` }); d.dataset.src = file; return d; }
// overlay motion helpers (all identity at phase 0, so the stills are unchanged)
function animate(e, fn) { const base = e.style.transform || ''; ANIM.push((ph) => { e.style.transform = base + ' ' + fn(ph); }); return e; }
const wob = (ph, k = 1, a = 1) => Math.sin(ph * TAU * k) * a;
window.setFrame = (i) => {
  const urls = [];
  for (const d of stage.querySelectorAll('[data-src]')) { const u = R(d.dataset.src, i); urls.push(u); d.style.backgroundImage = `url(${u})`; }
  for (const d of stage.querySelectorAll('[data-mask]')) { const u0 = R(d.dataset.mask, i); urls.push(u0); const u = `url(${u0})`; d.style.webkitMaskImage = u; d.style.maskImage = u; }
  const ph = (i % NF) / NF;
  for (const f of ANIM) f(ph);
  // resolves once every image of this frame is decoded (capture waits on it: no half-loaded frames)
  return Promise.all(urls.map((u) => { const im = new Image(); im.src = u; return im.decode().catch(() => {}); }));
};
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
  bgLayer('thumb.png');
  // warm glow + rays behind the bear (turn one ray-step per loop)
  animate(burst(438, 230, 330, { rays: 20, a: 'rgba(255,230,140,0.42)', rot: 4, fade: 0.9 }), (ph) => `rotate(${ph * 18}deg)`);
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 60% 45% at 70% 46%, rgba(255,120,60,.22), rgba(255,120,60,0) 70%)', mixBlendMode: 'screen' });
  // bottom + top darkening so the type pops
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(36,10,48,.55) 0%, rgba(36,10,48,0) 30%, rgba(36,10,48,0) 74%, rgba(30,8,36,.72) 100%)' });
  // the bear: white outline + angry red glow
  cutout('thumb.png', 'thumb-bear.png', [...outline(2, '#fff'), 'drop-shadow(0 0 7px rgba(255,40,40,.95))', 'drop-shadow(0 0 16px rgba(255,60,30,.6))']);
  // Reynard: thick white outline, gold rim glow
  cutout('thumb.png', 'thumb-fox.png', [...outline(3, '#fff'), ...outline(2, '#fff'), 'drop-shadow(0 0 8px rgba(255,220,90,.95))', 'drop-shadow(0 0 22px rgba(255,170,50,.55))']);
  // the arrow at the bear
  animate(arrow('M 16 120 C 40 60, 90 30, 150 44', { x: 238, y: 158, width: 220, height: 170, w: 14, head: 30 }), (ph) => `translate(${(1 - Math.cos(ph * TAU * 2)) * 4}px, ${-(1 - Math.cos(ph * TAU * 2)) * 2}px)`);
  // !? (pulses with the gasps)
  const shock = bigText(stage, ['!?'], { x: 196, y: 186, size: 104.17, rot: 14, outline: 5, outlineColor: '#2a0f1e', outer: 4, outerColor: '#fff',
    fill: 'linear-gradient(180deg, #fff6a0 0%, #ffd23a 45%, #ff5a2a 100%)', shadow: { x: 0, y: 6, color: 'rgba(42,15,30,.7)' } });
  shock.style.transformOrigin = '50% 60%';
  animate(shock, (ph) => { const g = Math.max(0, Math.sin(ph * TAU * 2)) ** 2; return `scale(${1 + g * 0.16}) rotate(${wob(ph, 4, 3) * g}deg)`; });
  // title (bounces + wobbles)
  animate(bigText(stage, ['THE BEAR', 'MUST EAT'], { x: 14, y: 4, size: 83.33, sizes: [72.92, 104.17], gap: -12, indent: [6, 0], rot: -4, origin: 'left top',
    outline: 5, outlineColor: '#3a1408', outer: 4, outerColor: '#fff6e0', fill: FILL_GOLD,
    shadow: { x: 0, y: 8, color: 'rgba(40,8,40,.75)', glow: '0 0 26px rgba(255,140,60,.6)' } }), (ph) => `translateY(${-Math.abs(Math.sin(ph * TAU)) * 5}px) rotate(${wob(ph, 1, 1.2)}deg) scale(${1 + Math.abs(Math.sin(ph * TAU)) * 0.02})`);
}

// ------------------------------------------------------------------ the banner
function banner() {
  const W = 960, H = 240;
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  bgLayer('banner.png');
  // party glow over the dance floor
  animate(burst(380, 30, 420, { rays: 26, a: 'rgba(255,226,150,0.16)', rot: 8, fade: 0.8 }), (ph) => `rotate(${ph * 360 / 26}deg)`);
  // rage glow on the right
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 30% 70% at 85% 60%, rgba(255,40,40,.22), rgba(255,40,40,0) 70%)', mixBlendMode: 'screen' });
  // left panel for the type
  el('div', '', { inset: 0, background: 'linear-gradient(90deg, rgba(30,8,40,.88) 0%, rgba(30,8,40,.72) 21%, rgba(30,8,40,0) 32%)' });
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(30,8,40,0) 70%, rgba(30,8,40,.45) 100%)' });
  cutout('banner.png', 'banner-b1+b2+b3+b4.png', [...outline(1, '#2a0f1e'), 'drop-shadow(0 0 4px rgba(255,40,40,1))', 'drop-shadow(0 0 10px rgba(255,50,30,.7))']);
  cutout('banner.png', 'banner-fox.png', [...outline(2, '#fff'), 'drop-shadow(0 0 6px rgba(255,220,90,.95))', 'drop-shadow(0 0 14px rgba(255,170,50,.6))']);
  // comic RAWR at the bears
  const rawr = bigText(stage, ['RAWR!'], { x: 806, y: 8, size: 41.67, rot: 8, outline: 3, outlineColor: '#2a0f1e', outer: 3, outerColor: '#fff',
    fill: 'linear-gradient(180deg, #ffe46a 0%, #ff8a2a 55%, #ff2a2a 100%)', shadow: { x: 0, y: 4, color: 'rgba(42,15,30,.7)' } });
  rawr.style.transformOrigin = '50% 50%';
  animate(rawr, (ph) => { const g = Math.max(0, Math.sin(ph * TAU * 2)); return `scale(${1 + g * 0.12}) translate(${wob(ph, 8, 1.5) * g}px, ${wob(ph, 6, 1) * g}px)`; });
  // title
  animate(bigText(stage, ['THE BEAR', 'MUST EAT'], { x: 18, y: 20, size: 62.5, sizes: [50, 66.67], gap: -6, indent: [4, 0], rot: -3,
    outline: 4, outlineColor: '#3a1408', outer: 3, outerColor: '#fff6e0', fill: FILL_GOLD,
    shadow: { x: 0, y: 6, color: 'rgba(40,8,40,.8)', glow: '0 0 20px rgba(255,140,60,.55)' } }), (ph) => `translateY(${-Math.abs(Math.sin(ph * TAU)) * 3}px) rotate(${wob(ph, 1, 1)}deg)`);
}

// ------------------------------------------------------------------ "Flint & Steel" update art
const FILL_HOT = 'linear-gradient(180deg, #ffffff 0%, #fff2a0 22%, #ffc030 50%, #ff7a1a 78%, #e8401a 100%)';
// the update badge: riveted steel plate in a hazard-stripe frame, hot-metal lettering, red UPDATE tag
function badge(parent, { x, y, w, rot = -5, size = 41.67, sub = 25, pad = 10 }) {
  const b = el('div', '', { left: x + 'px', top: y + 'px', width: w + 'px', transform: `rotate(${rot}deg)`, transformOrigin: '50% 50%',
    padding: `${pad}px`, borderRadius: '10px', boxSizing: 'border-box',
    background: 'repeating-linear-gradient(135deg, #f2c230 0 9px, #26262c 9px 18px)',
    boxShadow: '0 0 0 3px #1a1016, 0 0 0 6px #fff6e0, 0 7px 0 5px rgba(30,8,30,.7), 0 0 26px rgba(255,150,40,.7)' }, parent);
  const plate = el('div', '', { position: 'relative', borderRadius: '6px', padding: `${pad * 0.5}px ${pad}px ${pad * 0.8}px`, textAlign: 'center', overflow: 'hidden',
    background: 'linear-gradient(180deg, #8c92aa 0%, #5e6478 45%, #3a3a46 100%)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,.35), inset 0 -3px 0 rgba(0,0,0,.35), 0 0 0 2px #1a1016' }, b);
  for (const [l, t] of [[5, 5], [null, 5], [5, null], [null, null]]) el('div', '', { position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #fff, #b8924c 50%, #6a4a20)', left: l != null ? l + 'px' : null, right: l == null ? '5px' : null, top: t != null ? t + 'px' : null, bottom: t == null ? '5px' : null }, plate);
  const t1 = bigText(plate, ['FLINT & STEEL'], { x: 0, y: 0, size, outline: Math.max(2, Math.round(size / 14)), outlineColor: '#2a0f0a', fill: FILL_HOT, shadow: { x: 0, y: Math.round(size / 12), color: 'rgba(20,6,10,.7)', glow: '0 0 14px rgba(255,120,30,.8)' } });
  Object.assign(t1.style, { position: 'relative', display: 'inline-block' });
  const tag = el('div', '', { display: 'inline-block', marginTop: '2px', padding: '2px 12px 4px', background: 'linear-gradient(180deg, #ff4d4d, #c81e2e)', borderRadius: '6px', boxShadow: '0 0 0 2px #1a1016, 0 3px 0 2px rgba(20,6,10,.6)', transform: 'rotate(2deg)' }, plate);
  const t2 = bigText(tag, ['UPDATE!'], { x: 0, y: 0, size: sub, outline: 2, outlineColor: '#2a0f1e', fill: 'linear-gradient(180deg,#ffffff,#ffe9c0)' });
  t2.style.position = 'relative';
  // a light sweep across the plate
  const sweep = el('div', '', { position: 'absolute', top: '-20%', bottom: '-20%', width: '30%', left: '-40%', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.45), rgba(255,255,255,0))', transform: 'skewX(-20deg)', mixBlendMode: 'screen' }, plate);
  ANIM.push((ph) => { sweep.style.left = (-40 + ((ph * 1.0) % 1) * 180) + '%'; });
  animate(b, (ph) => { const g = Math.max(0, Math.sin(ph * TAU * 2)) ** 3; return `scale(${1 + g * 0.05})`; });
  return b;
}

function fsthumb() {
  const W = 630, H = 500;
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  bgLayer('thumb.png');
  animate(burst(330, 210, 360, { rays: 20, a: 'rgba(255,214,120,0.30)', rot: 2, fade: 0.9 }), (ph) => `rotate(${ph * 18}deg)`);
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 30% 30% at 88% 46%, rgba(255,120,30,.35), rgba(255,120,30,0) 70%)', mixBlendMode: 'screen' });
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(30,10,30,.7) 0%, rgba(30,10,30,.25) 30%, rgba(30,10,30,0) 45%, rgba(30,10,30,0) 76%, rgba(26,8,26,.75) 100%)' });
  cutout('thumb.png', 'thumb-flint.png', [...outline(2, '#fff'), 'drop-shadow(0 0 6px rgba(255,200,80,.95))', 'drop-shadow(0 0 14px rgba(255,140,40,.6))']);
  cutout('thumb.png', 'thumb-fox.png', [...outline(3, '#fff'), ...outline(2, '#fff'), 'drop-shadow(0 0 8px rgba(255,220,90,.95))', 'drop-shadow(0 0 22px rgba(255,170,50,.55))']);
  // excited "!!" next to Reynard
  const ex = bigText(stage, ['!!'], { x: 232, y: 232, size: 83.33, rot: 12, outline: 4, outlineColor: '#2a0f1e', outer: 3, outerColor: '#fff', fill: 'linear-gradient(180deg, #fff6a0 0%, #ffd23a 45%, #ff5a2a 100%)', shadow: { x: 0, y: 5, color: 'rgba(42,15,30,.7)' } });
  ex.style.transformOrigin = '30% 70%';
  animate(ex, (ph) => { const g = Math.max(0, Math.sin(ph * TAU * 2)) ** 2; return `scale(${1 + g * 0.18}) rotate(${wob(ph, 4, 4) * g}deg)`; });
  // title + badge
  animate(bigText(stage, ['THE BEAR', 'MUST EAT'], { x: 12, y: 2, size: 62.5, sizes: [52.08, 72.92], gap: -8, indent: [4, 0], rot: -4,
    outline: 4, outlineColor: '#3a1408', outer: 3, outerColor: '#fff6e0', fill: FILL_GOLD,
    shadow: { x: 0, y: 6, color: 'rgba(40,8,40,.75)', glow: '0 0 22px rgba(255,140,60,.6)' } }), (ph) => `translateY(${-Math.abs(Math.sin(ph * TAU)) * 4}px) rotate(${wob(ph, 1, 1)}deg)`);
  badge(stage, { x: 330, y: 22, w: 286, rot: 6, size: 37.5, sub: 25 });
}

function fsbanner() {
  const W = 960, H = 240;
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  bgLayer('banner.png');
  animate(burst(600, 20, 420, { rays: 26, a: 'rgba(255,214,130,0.14)', rot: 6, fade: 0.8 }), (ph) => `rotate(${ph * 360 / 26}deg)`);
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 14% 40% at 86% 45%, rgba(255,120,30,.35), rgba(255,120,30,0) 70%)', mixBlendMode: 'screen' });
  el('div', '', { inset: 0, background: 'linear-gradient(90deg, rgba(26,10,26,.9) 0%, rgba(26,10,26,.74) 24%, rgba(26,10,26,0) 34%)' });
  cutout('banner.png', 'banner-flint.png', [...outline(1, '#fff'), 'drop-shadow(0 0 4px rgba(255,200,80,.95))', 'drop-shadow(0 0 9px rgba(255,140,40,.6))']);
  cutout('banner.png', 'banner-fox.png', [...outline(2, '#fff'), 'drop-shadow(0 0 6px rgba(255,220,90,.95))', 'drop-shadow(0 0 14px rgba(255,170,50,.6))']);
  animate(bigText(stage, ['THE BEAR', 'MUST EAT'], { x: 16, y: 6, size: 50, sizes: [41.67, 58.33], gap: -6, indent: [3, 0], rot: -3,
    outline: 3, outlineColor: '#3a1408', outer: 3, outerColor: '#fff6e0', fill: FILL_GOLD,
    shadow: { x: 0, y: 5, color: 'rgba(40,8,40,.8)', glow: '0 0 18px rgba(255,140,60,.55)' } }), (ph) => `translateY(${-Math.abs(Math.sin(ph * TAU)) * 3}px) rotate(${wob(ph, 1, 1)}deg)`);
  badge(stage, { x: 14, y: 116, w: 262, rot: -3, size: 29.17, sub: 18.75, pad: 7 });
}


// ================================================================== [v4] "Cinematic Update" (kinds cinethumb, cinebanner)
// A pixel-exact canvas compositor. The render frames are the game's low-res image shown at 2x, so
// they are sampled back to one canvas pixel per game pixel (630x500 / 960x240). Everything on top is
// drawn into that same grid: Alagard lettering rasterised on its own 16 px grid and scaled by whole
// numbers, outlines, rim light, god rays and shadows as hard or ordered-dither pixels (no blur, no
// smooth gradient, no rotation). The canvas is shown with image-rendering: pixelated, so the DPR 2
// screenshot is an exact 2x.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y, a) => a > BAYER[((y & 3) << 2) | (x & 3)];
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hash2 = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const loadImg = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; });

// RGBA pixel buffer with clipped writes
class Px {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 1) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (a >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; } else { d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a; }
    d[i + 3] = 255;
  }
  add(x, y, c) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4, d = this.d; d[i] += c[0]; d[i + 1] += c[1]; d[i + 2] += c[2]; }
  block(x, y, U, c, a = 1) { for (let j = 0; j < U; j++) for (let i = 0; i < U; i++) this.set(x + i, y + j, c, a); }
  copy() { const p = new Px(this.w, this.h); p.d.set(this.d); return p; }
}

// a 2x screenshot of the low-res game frame -> one pixel per game pixel (finds the 2x2 block phase:
// the renderer's 1 px snap margin shifts the grid)
function sampleRender(img, W, H) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const src = x.getImageData(0, 0, img.width, img.height).data, SW = img.width, k = Math.round(img.width / W);
  let best = [0, 0], bs = -1;
  for (const oy of [0, 1]) for (const ox of [0, 1]) {
    let s = 0;
    for (let y = 8; y < H - 8; y += 5) for (let xx = 8; xx < W - 8; xx += 5) {
      const i = ((y * k + oy) * SW + xx * k + ox) * 4, j = i + 4, l = i + SW * 4;
      if (src[i] === src[j] && src[i + 1] === src[j + 1] && src[i + 2] === src[j + 2] && src[i] === src[l] && src[i + 1] === src[l + 1] && src[i + 2] === src[l + 2]) s++;
    }
    if (s > bs) { bs = s; best = [ox, oy]; }
  }
  const out = new Px(W, H);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const sx = Math.min(SW - 1, xx * k + best[0]), sy = Math.min(img.height - 1, y * k + best[1]);
    const i = (sy * SW + sx) * 4, o = (y * W + xx) * 4;
    out.d[o] = src[i]; out.d[o + 1] = src[i + 1]; out.d[o + 2] = src[i + 2]; out.d[o + 3] = 255;
  }
  return out;
}
function maskOf(img, W, H) {
  const m = new Uint8Array(W * H);
  if (!img) return m;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}
// pixels within radius r of the mask (disc, slightly squared: chunky)
function dilate(m, W, H, r) {
  const out = new Uint8Array(W * H), offs = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) offs.push([x, y]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (const [dx, dy] of offs) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) out[Y * W + X] = 1; }
  }
  return out;
}

// ------------------------------------------------------------------ Alagard on its pixel grid
let GLYPH = null;
function glyph(ch) {
  if (!GLYPH) {
    const c = document.createElement('canvas'); c.width = 40; c.height = 26;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.font = '16px Alagard'; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    GLYPH = { x, cache: {} };
  }
  if (GLYPH.cache[ch]) return GLYPH.cache[ch];
  const x = GLYPH.x;
  x.clearRect(0, 0, 40, 26); x.fillText(ch, 4, 18);
  const d = x.getImageData(0, 0, 40, 26).data, px = [];
  // y relative to the cap line (baseline 18, 11 px caps): caps are rows 0..10, descenders 11..13
  for (let y = 0; y < 26; y++) for (let i = 0; i < 40; i++) if (d[(y * 40 + i) * 4 + 3] > 127) px.push([i - 4, y - 7]);
  return (GLYPH.cache[ch] = { adv: Math.round(x.measureText(ch).width), px });
}
// lines [{ text, x, y, track? }] (units) -> letters [{ ch, x, y, px, i }]
function layout(lines) {
  const out = [];
  for (const L of lines) {
    let pen = L.x;
    for (const ch of L.text) { const g = glyph(ch); if (ch !== ' ') out.push({ ch, x: pen, y: L.y, px: g.px, i: out.length, adv: g.adv }); pen += g.adv + (L.track ?? 0); }
    L.w = pen - L.x - (L.track ?? 0);
  }
  return out;
}

// Lettering on the unit grid, then blitted at U output px per unit. style: fill (colour per glyph row
// 0..13), hi / lo (top / bottom edge bevel), ext (extrusion colours, 1 per unit of depth), outline,
// outer (second ring), shadow { dx, dy, c, a }. per(letter) -> { dx, dy, hide, flash, col } per frame.
// glint(x, y) -> 0..1 highlight on the fill (units, title space).
function drawLetters(F, letters, ox, oy, U, st, per = () => null, glint = null) {
  const placed = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const L of letters) {
    const s = (per && per(L)) || {};
    if (s.hide) continue;
    const lx = L.x + (s.dx || 0), ly = L.y + (s.dy || 0);
    placed.push([L, lx, ly, s]);
    for (const [dx, dy] of L.px) { x0 = Math.min(x0, lx + dx); x1 = Math.max(x1, lx + dx); y0 = Math.min(y0, ly + dy); y1 = Math.max(y1, ly + dy); }
  }
  if (!placed.length) return;
  const ext = st.ext || [], sh = st.shadow;
  const P = 3 + ext.length + (st.outer ? 1 : 0) + (sh ? Math.max(Math.abs(sh.dx), Math.abs(sh.dy)) : 0);
  const bx = x0 - P, by = y0 - P, bw = x1 - x0 + 1 + 2 * P, bh = y1 - y0 + 1 + 2 * P;
  const kind = new Uint8Array(bw * bh), col = new Array(bw * bh);
  const at = (x, y) => (x < 0 || y < 0 || x >= bw || y >= bh ? 0 : kind[y * bw + x]);
  for (const [L, lx, ly, s] of placed) for (const [dx, dy] of L.px) {
    const x = lx + dx - bx, y = ly + dy - by, i = y * bw + x;
    kind[i] = 1;
    col[i] = s.flash ? (st.flash || [255, 255, 255]) : (s.col || st.fill)[Math.max(0, Math.min((s.col || st.fill).length - 1, dy))];
  }
  // bevel + glint on the face
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x;
    if (kind[i] !== 1) continue;
    if (st.hi && !at(x, y - 1)) col[i] = mixc(col[i], st.hi, st.hiK ?? 0.7);
    else if (st.lo && !at(x, y + 1)) col[i] = mixc(col[i], st.lo, st.loK ?? 0.5);
    if (glint) { const g = glint(x + bx, y + by); if (g > 0) col[i] = mixc(col[i], st.glintC || [255, 255, 240], g); }
  }
  // extrusion (depth below the face)
  for (let k = 1; k <= ext.length; k++) for (let y = bh - 1; y >= 0; y--) for (let x = 0; x < bw; x++) {
    const i = y * bw + x;
    if (kind[i] !== 1 || y + k >= bh) continue;
    const j = (y + k) * bw + x;
    if (!kind[j]) { kind[j] = 2; col[j] = ext[k - 1]; }
  }
  // outlines (8-neighbour rings)
  const ringPass = (from, to, c) => {
    const add = [];
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (kind[y * bw + x]) continue;
      let hit = false;
      for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) { const k = at(x + i, y + j); if (k && k <= from) { hit = true; break; } }
      if (hit) add.push(y * bw + x);
    }
    for (const i of add) { kind[i] = to; col[i] = c; }
  };
  if (st.outline) ringPass(2, 3, st.outline);
  if (st.outer) ringPass(3, 4, st.outer);
  // hard drop shadow
  if (sh) {
    const add = [];
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!kind[y * bw + x]) continue;
      const X = x + sh.dx, Y = y + sh.dy;
      if (X >= 0 && Y >= 0 && X < bw && Y < bh && !kind[Y * bw + X]) add.push(Y * bw + X);
    }
    for (const i of add) if (!kind[i]) { kind[i] = 5; col[i] = sh.c; }
  }
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x, k = kind[i];
    if (!k) continue;
    const a = k === 5 ? (sh.a ?? 1) : 1;
    if (a < 1 && sh.dither) { if (dither(x + bx, y + by, a)) F.block(ox + (x + bx) * U, oy + (y + by) * U, U, col[i]); }
    else F.block(ox + (x + bx) * U, oy + (y + by) * U, U, col[i], a);
  }
}

// a pixel sprite from strings ('.' = clear) + palette, drawn at U px per pixel
function sprite(F, rows, pal, ox, oy, U = 1, a = 1, ring = null) {
  const on = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && !!pal[rows[y][x]];
  if (ring) for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) F.block(ox + x * U, oy + y * U, U, ring);
  }
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (c) F.block(ox + x * U, oy + y * U, U, c, a); } });
}
// 4-point twinkle star (units), size 0..3
function star(F, x, y, U, s, c = [255, 255, 236], c2 = [255, 214, 90]) {
  if (s <= 0) return;
  F.block(x, y, U, c);
  for (let k = 1; k <= s; k++) { const cc = k === s ? c2 : c; F.block(x + k * U, y, U, cc); F.block(x - k * U, y, U, cc); F.block(x, y + k * U, U, cc); F.block(x, y - k * U, U, cc); }
  if (s >= 2) { F.block(x + U, y + U, U, c2); F.block(x - U, y - U, U, c2); F.block(x + U, y - U, U, c2); F.block(x - U, y + U, U, c2); }
}

// ------------------------------------------------------------------ cinematic palettes + pieces
// gold lettering: 5 hand-picked bands down the glyph rows (cap line = row 0), bevel on the edges
const band = (spec) => { const out = []; for (const [n, h] of spec) for (let i = 0; i < n; i++) out.push(rgb(h)); return out; };
const ST_TITLE = {
  fill: band([[1, '#fffbe4'], [2, '#ffeb7a'], [3, '#ffd23e'], [3, '#ffaa2c'], [2, '#f47f20'], [3, '#cc561c']]),
  hi: rgb('#fffff2'), hiK: 0.55, lo: rgb('#a8401a'), loK: 0.35,
  ext: [rgb('#b4461a'), rgb('#7e2c14')], outline: rgb('#2a0b10'),
  shadow: { dx: 1, dy: 2, c: rgb('#1e0a22'), a: 0.72 }, glintC: rgb('#fffff8'),
};
const ST_SHOUT = {
  fill: band([[2, '#ffffff'], [2, '#fff59a'], [3, '#ffd23a'], [2, '#ff8a2a'], [2, '#ff4a2a'], [3, '#d02a26']]),
  hi: rgb('#ffffff'), hiK: 0.6, ext: [rgb('#9a1e1c')], outline: rgb('#2a0b10'), outer: rgb('#fff6e0'),
  shadow: { dx: 1, dy: 1, c: rgb('#1e0a22'), a: 0.6 },
};
const ST_BADGE_GOLD = { fill: band([[1, '#fffbe4'], [2, '#ffe773'], [3, '#ffcc3a'], [3, '#ffa42a'], [5, '#e8721e']]), hi: rgb('#fffff2'), hiK: 0.7, ext: [rgb('#7e2c14')], outline: rgb('#0e080c'), glintC: rgb('#ffffff') };
const ST_BADGE_WHITE = { fill: band([[2, '#ffffff'], [4, '#fbf2e2'], [3, '#eadcc4'], [5, '#cdb89c']]), ext: [rgb('#5a4a52')], outline: rgb('#0e080c') };

// the title bouncing letter by letter: a hop of H units, landing with a 1-unit rebound
function hopAt(ph, i, o) {
  const u = (ph - (o.start + i * o.stagger)) / o.dur;
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.72) { const v = u / 0.72; return -Math.round(o.H * 4 * v * (1 - v)); }
  const v = (u - 0.72) / 0.28; return -Math.round(1.4 * 4 * v * (1 - v));
}
// a glint band sweeping the title between phases a..b (units: x + y * slope)
const glintAt = (ph, a, b, x0, x1, w = 3, slope = 0.55) => {
  if (ph < a || ph > b) return null;
  const pos = x0 + (x1 - x0) * ((ph - a) / (b - a));
  return (x, y) => { const d = x + y * slope - pos; return d >= 0 && d < w ? (d < w / 2 ? 0.95 : 0.6) : d >= -1 && d < 0 ? 0.4 : 0; };
};

// comic burst behind a shout: jagged star polygon on the unit grid, white face, gold rim, dark outline
function burstShape(F, cx, cy, rx, ry, U, spikes, seed, pop = 0) {
  const pts = [];
  for (let k = 0; k < spikes * 2; k++) {
    const a = (k / (spikes * 2)) * Math.PI * 2 + seed;
    const r = k % 2 ? 0.62 + hash2(k, seed * 100) * 0.12 : 1.0 + hash2(k + 9, seed * 50) * 0.14 + pop;
    pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]);
  }
  const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const R = Math.ceil(Math.max(rx, ry) * 1.3) + 2, m = new Map();
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (inside(x + 0.5, y + 0.5)) m.set(x + ',' + y, 1);
  const on = (x, y) => m.has(x + ',' + y);
  const C = [rgb('#2a0b10'), rgb('#ff9a2a'), rgb('#ffd75e'), rgb('#fff1b0')];
  for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
    let c = null;
    if (on(x, y)) {
      const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
      const edge2 = !on(x - 2, y) || !on(x + 2, y) || !on(x, y - 2) || !on(x, y + 2);
      c = edge ? C[1] : edge2 ? C[2] : C[3];
    } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1)) c = C[0];
    if (c) F.block(cx + x * U, cy + y * U, U, c);
  }
}

// clapperboard (16 x 15), hand-placed; open or snapped shut
const CLAP_PAL = { k: rgb('#141016'), w: rgb('#f6eedc'), g: rgb('#6a6070'), y: rgb('#ffc84a'), d: rgb('#2c2430') };
const CLAP_BODY = [
  'kkkkkkkkkkkkkkkk',
  'kwwwkkkwwwkkkwwk',
  'kkwwwkkkwwwkkkwk',
  'kkkkkkkkkkkkkkkk',
  'kddddddddddddddk',
  'kdwwwwwdwwwwwwdk',
  'kddddddddddddddk',
  'kdwwwdwwwwwdwwdk',
  'kddddddddddddddk',
  '.kkkkkkkkkkkkkk.',
];
const CLAP_SHUT = ['................', '.kkkkkkkkkkkkkk.', 'kywwwkkkwwwkkkwk', 'kkkwwwkkkwwwkkkk', '.kkkkkkkkkkkkkk.'];
const CLAP_OPEN = ['.........kkkkkk.', '.....kkkkwwwkkwk', '..kkkwwwkkkwwwkk', 'kykwwwkkkkkkk...', '.kkk............'];

// film strip plate: perforated bands that roll one unit a frame, the update name in the gate
function filmStrip(F, x0, y0, B, fi, opts) {
  const W = F.w, len = opts.x1 != null ? Math.round((opts.x1 - x0) / B) : Math.ceil((W - x0) / B) + 2, S = 30;
  const C = { edge: rgb('#4a3a40'), band: rgb('#1a1418'), line: rgb('#0a0608'), gate: rgb('#2a1e26'), gate2: rgb('#33252e'), hole: rgb('#ffe7b0'), holeT: rgb('#d9a85c'), cut: rgb('#0a0608') };
  // shadow under the strip
  for (let y = 0; y < 3; y++) for (let x = 0; x < len; x++) if (dither(x, y, 0.55)) F.block(x0 + (x + 1) * B, y0 + (S + y) * B, B, rgb('#140818'), 0.85);
  for (let y = 0; y < S; y++) for (let x = 0; x < len; x++) {
    let c;
    if (y === 0) c = C.edge;
    else if (y <= 5 || y >= S - 6 && y <= S - 2) {
      c = C.band;
      const hy = y <= 5 ? y - 1 : y - (S - 6), hx = (((x + fi) % 8) + 8) % 8; // holes 4 x 3 every 8 units, rolling
      if (hy >= 1 && hy <= 3 && hx >= 2 && hx <= 5) { const corner = (hy === 1 || hy === 3) && (hx === 2 || hx === 5); if (!corner) c = hy === 1 ? C.holeT : C.hole; }
    } else if (y === 6 || y === S - 7) c = C.line;
    else if (y === S - 1) c = C.line;
    else c = (x + fi) % 64 === 0 ? C.line : C.gate;
    F.block(x0 + x * B, y0 + y * B, B, c);
  }
  // the cut end: a dark notched edge
  for (let y = -1; y <= S; y++) { F.block(x0 - B, y0 + y * B, B, C.cut); if (opts.x1 != null) F.block(x0 + len * B, y0 + y * B, B, C.cut); }
  // (the ring is drawn under both parts first, so the stick and the slate share one gold outline)
  sprite(F, CLAP_BODY, {}, x0 + 5 * B, y0 + 12 * B, B);
  const top = opts.shut ? CLAP_SHUT : CLAP_OPEN, gold = rgb('#e8a83a');
  sprite(F, top, CLAP_PAL, x0 + 5 * B, y0 + 7 * B, B, 1, gold);
  sprite(F, CLAP_BODY, CLAP_PAL, x0 + 5 * B, y0 + 12 * B, B, 1, gold);
  sprite(F, top, CLAP_PAL, x0 + 5 * B, y0 + 7 * B, B);
  const L1 = layout([{ text: opts.word1, x: 0, y: 0 }]), L2 = layout([{ text: opts.word2, x: 0, y: 0 }]);
  const tx = x0 + 26 * B, ty = y0 + 10 * B;
  drawLetters(F, L1, tx, ty, B, ST_BADGE_GOLD, null, opts.glint);
  drawLetters(F, L2, tx + (L1[L1.length - 1].x + L1[L1.length - 1].adv + 6) * B, ty, B, ST_BADGE_WHITE);
}

// dithered god rays out of the sun, golden and additive
function godRays(F, sx, sy, o) {
  const { W, H } = { W: F.w, H: F.h }, n = o.rays || 14, R = o.R || 420;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - sx, dy = y - sy, r = Math.hypot(dx, dy);
    if (r > R || r < (o.r0 || 18)) continue;
    const a = Math.atan2(dy, dx) / (Math.PI * 2) * n + (o.rot || 0);
    const f = a - Math.floor(a);
    if (f > (o.width || 0.42)) continue;
    const k = (1 - r / R) ** 1.6 * (o.k || 0.5) * (o.mask ? o.mask(x, y) : 1);
    if (dither(x, y, k)) F.add(x, y, o.c || [34, 22, 6]);
  }
}
function sunOf(F, fallback) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < F.h * 0.6; y++) for (let x = 0; x < F.w; x++) { const i = (y * F.w + x) * 4; if (F.d[i] > 250 && F.d[i + 1] > 240 && F.d[i + 2] > 200) { sx += x; sy += y; n++; } }
  return n > 30 ? [Math.round(sx / n), Math.round(sy / n)] : fallback;
}
// warm golden grade (saturation, contrast, lift the warm channels), dithered dark vignette
function grade(F, o) {
  const d = F.d, s = o.sat ?? 1.15, ct = o.con ?? 1.06;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    r = l + (r - l) * s; g = l + (g - l) * s; b = l + (b - l) * s;
    r = (r - 128) * ct + 128 + (o.warm ?? 6); g = (g - 128) * ct + 128 + (o.warm ?? 6) * 0.45; b = (b - 128) * ct + 128 - (o.warm ?? 6) * 0.4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}
function vignette(F, keep, o) {
  const c = o.c || rgb('#1c0a22');
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    if (keep && keep[y * F.w + x]) continue;
    const u = x / F.w - 0.5, v = y / F.h - 0.5;
    let a = Math.max(0, Math.hypot(u * (o.ax ?? 1.1), v * (o.ay ?? 1.0)) - (o.r ?? 0.42)) * (o.k ?? 1.4);
    if (o.bottom) a = Math.max(a, (y / F.h - o.bottom[0]) / (1 - o.bottom[0]) * o.bottom[1]);
    if (o.top) a = Math.max(a, (o.top[0] - y / F.h) / o.top[0] * o.top[1]);
    a = Math.min(o.max ?? 0.7, a);
    if (a > 0 && dither(x, y, a)) F.set(x, y, c, o.depth ?? 0.55);
  }
}
// rim + glow rings around a cut-out mask (all hard pixels)
function rings(F, m, W, H, spec) {
  let inner = m;
  for (const s of spec) {
    const d = dilate(m, W, H, s.r);
    for (let i = 0; i < W * H; i++) {
      if (!d[i] || inner[i]) continue;
      const x = i % W, y = (i / W) | 0;
      if (s.only && !s.only(x, y)) continue;
      if (s.dither == null || dither(x, y, s.dither)) F.set(x, y, s.c, s.a ?? 1);
    }
    inner = d;
  }
}

// ------------------------------------------------------------------ frame pipeline
const CINE = { scene: null };
const since = (ph, t0) => (((ph - t0) % 1) + 1) % 1;
const lazy = (f) => { let v; return () => (v ??= f()); }; // layouts wait for Alagard to load
function cineStage(W, H, scene) {
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  const cv = el('canvas', 'px', { width: W + 'px', height: H + 'px' });
  cv.width = W; cv.height = H;
  Object.assign(CINE, { cv, ctx: cv.getContext('2d'), W, H, scene });
}
async function cineFrame(i) {
  const S = CINE.scene, W = CINE.W, H = CINE.H;
  const [bg, ...masks] = await Promise.all([loadImg(R(S.bg, i)), ...S.masks.map((m) => loadImg(R(m, i)))]);
  const F = sampleRender(bg, W, H);
  S.draw(F, masks.map((im) => maskOf(im, W, H)), (i % NF) / NF, i);
  CINE.ctx.putImageData(new ImageData(F.d, W, H), 0, 0);
}
// a shout word punching in letter by letter at t0 (one letter a frame, white flash, drop of 2 units),
// shaking while it is held, gone at t1
const shoutPer = (ph, fi, t0, t1) => (L) => {
  const s = since(ph, t0 + L.i / NF);
  if (s > since(t1, t0 + L.i / NF) || since(ph, t0) > since(t1, t0)) return { hide: true };
  const age = Math.round(s * NF);
  if (age === 0) return { flash: true, dy: -2 };
  if (age === 1) return { dy: 1 };
  const h = hash2(fi * 13 + 5, L.i * 31 + 7), v = hash2(fi * 7 + 1, L.i * 17 + 3);
  return { dx: h < 0.3 ? -1 : h > 0.7 ? 1 : 0, dy: v < 0.3 ? -1 : v > 0.7 ? 1 : 0 };
};
// title sparkles: [x, y] in output px, phase they pop, 5-frame twinkle
function sparkles(F, list, ph, U) {
  for (const [x, y, p0] of list) {
    const age = Math.round(since(ph, p0) * NF);
    const s = [1, 2, 3, 2, 1][age];
    if (s) star(F, x, y, U, s);
  }
}

// ------------------------------------------------------------------ the cover (630 x 500)
function cinethumb() {
  const W = 630, H = 500;
  const U = 4, TX = 14, TY = 12; // title: Alagard at 4 px a font pixel (44 px caps)
  const T = lazy(() => layout([{ text: 'The Bear', x: 0, y: 0 }, { text: 'Must Eat', x: 7, y: 15 }]));
  const SH = lazy(() => layout([{ text: 'FOOOOD!!', x: 0, y: 0 }])), SU = 3;
  // the loop (3.2 s): the hero bear leaps at 0 yelling FOOOOD!!, a glint crosses the title, he hits the
  // water at 0.52 (the clapper snaps) and the title bounces letter by letter off the splash
  const HOP = { start: 0.53, stagger: 0.025, dur: 0.15, H: 3 };
  cineStage(W, H, {
    bg: 'thumb.png', masks: ['thumb-fox.png', 'thumb-b1+b2+b3.png'],
    draw(F, [fox, bears], ph, fi) {
      grade(F, { sat: 1.12, con: 1.05, warm: 5 });
      const sun = sunOf(F, [390, 120]);
      godRays(F, sun[0], sun[1], { rays: 18, R: 560, k: 0.36, width: 0.4, rot: 0.15, mask: (x, y) => (fox[y * W + x] ? 0 : 1) });
      vignette(F, fox, { r: 0.46, k: 1.2, bottom: [0.8, 0.85], top: [0.16, 0.45], max: 0.8 });
      rings(F, bears, W, H, [{ r: 1, c: rgb('#ffd98a') }]);
      rings(F, fox, W, H, [{ r: 2, c: rgb('#fff2cf') }, { r: 4, c: rgb('#ffc24a'), dither: 0.5 }]);
      // title: letter-by-letter hop wave, then a glint sweep
      drawLetters(F, T(), TX, TY, U, ST_TITLE, (L) => ({ dy: hopAt(ph, L.i, HOP) }), glintAt(ph, 0.2, 0.5, -12, 92, 4));
      sparkles(F, [[TX + 2 * U, TY - 2 * U, 0.3], [TX + 64 * U, TY + 2 * U, 0.42], [TX + 74 * U, TY + 17 * U, 0.12], [TX + 31 * U, TY + 14 * U, 0.85]], ph, 2);
      // FOOOOD!! as the hero bear leaps
      const sx = 374, sy = 18, t0 = 0.03, t1 = 0.5;
      if (since(ph, t0) <= since(t1, t0)) burstShape(F, sx + 33 * SU, sy + 6 * SU, 34, 12, SU, 11, 0.3, Math.round(since(ph, t0) * NF) < 2 ? 0.25 : 0);
      drawLetters(F, SH(), sx, sy, SU, ST_SHOUT, shoutPer(ph, fi, t0, t1));
      // the update plate: a film strip rolling in from the right
      filmStrip(F, 236, 422, 2, fi, { word1: 'CINEMATIC', word2: 'UPDATE', shut: since(ph, 0.52) < 0.06, glint: glintAt(ph, 0.62, 0.92, -10, 95, 2) });
    },
  });
}

// ------------------------------------------------------------------ the banner (960 x 240)
function cinebanner() {
  const W = 960, H = 240;
  const U = 4, TX = 16, TY = 12;
  const T = lazy(() => layout([{ text: 'The Bear', x: 0, y: 0 }, { text: 'Must Eat', x: 7, y: 15 }]));
  const S1 = lazy(() => layout([{ text: 'FOOOOD!!', x: 0, y: 0 }])), S2 = lazy(() => layout([{ text: 'OFF WORK!', x: 0, y: 0 }])), SU = 2;
  const HOP = { start: 0.53, stagger: 0.025, dur: 0.15, H: 3 };
  cineStage(W, H, {
    bg: 'banner.png', masks: ['banner-fox.png', 'banner-b1+b2+b3.png'],
    draw(F, [fox, bears], ph, fi) {
      grade(F, { sat: 1.12, con: 1.05, warm: 5 });
      const sun = sunOf(F, [560, 40]);
      godRays(F, sun[0], sun[1], { rays: 22, R: 620, k: 0.34, width: 0.4, rot: 0.1, mask: (x, y) => (fox[y * W + x] ? 0 : 1) });
      // the type panel on the left, dithered into the scene
      for (let y = 0; y < H; y++) for (let x = 0; x < 420; x++) { const a = x < 300 ? 0.8 : 0.8 * (1 - (x - 300) / 120); if (dither(x, y, a) && !fox[y * W + x]) F.set(x, y, rgb('#1a0a20'), 0.62); }
      vignette(F, fox, { r: 0.5, ax: 1.0, ay: 0.55, k: 1.2, bottom: [0.82, 0.7], max: 0.7 });
      rings(F, bears, W, H, [{ r: 1, c: rgb('#ffd98a') }]);
      rings(F, fox, W, H, [{ r: 2, c: rgb('#fff2cf') }, { r: 3, c: rgb('#ffc24a'), dither: 0.5 }]);
      drawLetters(F, T(), TX, TY, U, ST_TITLE, (L) => ({ dy: hopAt(ph, L.i, HOP) }), glintAt(ph, 0.2, 0.5, -12, 92, 4));
      sparkles(F, [[TX + 2 * U, TY - 2 * U, 0.3], [TX + 64 * U, TY + 2 * U, 0.42], [TX + 74 * U, TY + 17 * U, 0.12], [TX + 31 * U, TY + 14 * U, 0.85]], ph, 2);
      // OFF WORK! by the tower while the hero bear flies (clear of his face), then FOOOOD!! as the next one leaps
      const o1 = [772, 18], o2 = [456, 12];
      if (since(ph, 0.03) <= since(0.5, 0.03)) burstShape(F, o1[0] + 40 * SU, o1[1] + 6 * SU, 46, 12, SU, 12, 1.1, Math.round(since(ph, 0.03) * NF) < 2 ? 0.25 : 0);
      drawLetters(F, S2(), o1[0], o1[1], SU, ST_SHOUT, shoutPer(ph, fi, 0.03, 0.5));
      if (since(ph, 0.6) <= since(0.98, 0.6)) burstShape(F, o2[0] + 33 * SU, o2[1] + 6 * SU, 40, 12, SU, 11, 0.3, Math.round(since(ph, 0.6) * NF) < 2 ? 0.25 : 0);
      drawLetters(F, S1(), o2[0], o2[1], SU, ST_SHOUT, shoutPer(ph, fi, 0.6, 0.98));
      filmStrip(F, 12, 156, 2, fi, { x1: 392, word1: 'CINEMATIC', word2: 'UPDATE', shut: since(ph, 0.52) < 0.06, glint: glintAt(ph, 0.62, 0.92, -10, 95, 2) });
    },
  });
}
// ================================================================== [v5] "Dig & Dive Update" (kinds ddthumb, ddbanner)
// Same pixel-exact canvas pipeline as the Cinematic art, with two renders per picture (&parts=a,b):
// THE DIG (Bonebed Bluff, golden hour) and THE DIVE (under Loon Lake), merged along an animated
// pixel waterline (cover) or a comic split (banner). The hero is the game's own Primordial Vial
// sprite of the Sabre-tooth salmon, rotated RotSprite-style (EPX x8, nearest back to 1x) so its
// pixels stay on one grid, scaled by a whole number.
const PARTS = (Q.get('parts') || '').split(',').filter(Boolean);
const partURL = (part, mask, i) => `./renders/anim/${part}${mask ? '-' + mask : ''}-f${pad(i)}.png${bust}`;
const ST_DIG = {
  fill: band([[1, '#fffbe4'], [2, '#ffe98a'], [3, '#ffc844'], [3, '#f29a2e'], [2, '#d8721e'], [3, '#a8501a']]),
  hi: rgb('#fffff0'), hiK: 0.6, lo: rgb('#8a3a14'), loK: 0.35,
  ext: [rgb('#9a4216'), rgb('#62260e')], outline: rgb('#1c0a06'),
  shadow: { dx: 1, dy: 2, c: rgb('#140608'), a: 0.72 }, glintC: rgb('#fffff6'),
};
const ST_DIVE = {
  fill: band([[1, '#f4ffff'], [2, '#c8f8ff'], [3, '#82e6f6'], [3, '#3cc4e2'], [2, '#1e96c6'], [3, '#146aa2']]),
  hi: rgb('#ffffff'), hiK: 0.6, lo: rgb('#0c3e6a'), loK: 0.35,
  ext: [rgb('#0e4e78'), rgb('#08304e')], outline: rgb('#040c18'),
  shadow: { dx: 1, dy: 2, c: rgb('#040a14'), a: 0.72 }, glintC: rgb('#ffffff'),
};
const ST_AMP = { ...ST_DIG, fill: band([[2, '#ffffff'], [3, '#f6efe0'], [4, '#e4d6bc'], [5, '#c4ae8e']]), hi: rgb('#ffffff'), lo: rgb('#7a6a5a'), ext: [rgb('#6a5848'), rgb('#3e3028')] };
const ST_KICK = { fill: band([[1, '#fffbe4'], [2, '#ffe773'], [3, '#ffcc3a'], [3, '#ffa42a'], [5, '#e8721e']]), hi: rgb('#fffff2'), hiK: 0.7, outline: rgb('#0e080c'), shadow: { dx: 1, dy: 1, c: rgb('#0a0610'), a: 0.7 } };

// ------------------------------------------------------------------ sprite helpers
// pixels of a canvas as { w, h, px: Uint32Array (0 = clear) }
function spritePixels(cv) {
  const x = cv.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, cv.width, cv.height).data;
  const px = new Uint32Array(cv.width * cv.height);
  for (let i = 0; i < px.length; i++) px[i] = d[i * 4 + 3] > 127 ? (0xff000000 | (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2]) >>> 0 : 0;
  return { w: cv.width, h: cv.height, px };
}
// Scale2x (EPX): doubles a sprite, keeping its edges as pixel diagonals
function epx(s) {
  const W = s.w * 2, H = s.h * 2, o = new Uint32Array(W * H), g = (x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? 0 : s.px[y * s.w + x]);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const P = g(x, y), A = g(x, y - 1), B = g(x + 1, y), C = g(x - 1, y), D = g(x, y + 1);
    o[(2 * y) * W + 2 * x] = C === A && C !== D && A !== B ? A : P;
    o[(2 * y) * W + 2 * x + 1] = A === B && A !== C && B !== D ? B : P;
    o[(2 * y + 1) * W + 2 * x] = D === C && D !== B && C !== A ? C : P;
    o[(2 * y + 1) * W + 2 * x + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return { w: W, h: H, px: o };
}
// RotSprite-style rotation (radians, + = clockwise on screen), result at 1x
const ROT_CACHE = new Map();
function rotSprite(key, s, ang) {
  const q = Math.round(ang / (Math.PI / 48)), k2 = key + '|' + q;
  if (ROT_CACHE.has(k2)) return ROT_CACHE.get(k2);
  const a = q * (Math.PI / 48), c = Math.cos(a), sn = Math.sin(a);
  const big = s.big || (s.big = epx(epx(epx(s))));
  const W = Math.ceil(Math.abs(s.w * c) + Math.abs(s.h * sn)) + 2, H = Math.ceil(Math.abs(s.w * sn) + Math.abs(s.h * c)) + 2;
  const o = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - W / 2, dy = y + 0.5 - H / 2;
    const sx = dx * c + dy * sn + s.w / 2, sy = -dx * sn + dy * c + s.h / 2;
    const X = Math.floor(sx * 8), Y = Math.floor(sy * 8);
    if (X >= 0 && Y >= 0 && X < big.w && Y < big.h) o[y * W + x] = big.px[Y * big.w + X];
  }
  const r = { w: W, h: H, px: o };
  ROT_CACHE.set(k2, r);
  return r;
}
// draw a sprite centred at (cx, cy), k output px per sprite px; flip = mirror; tint(x, y, rgb) -> rgb
function drawSprite(F, s, cx, cy, k, { flip = false, tint = null, outline = null } = {}) {
  const x0 = Math.round(cx - (s.w * k) / 2), y0 = Math.round(cy - (s.h * k) / 2);
  const at = (x, y) => (x < 0 || y < 0 || x >= s.w || y >= s.h ? 0 : s.px[y * s.w + (flip ? s.w - 1 - x : x)]);
  if (outline) for (let y = -1; y <= s.h; y++) for (let x = -1; x <= s.w; x++) {
    if (at(x, y)) continue;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) F.block(x0 + x * k, y0 + y * k, k, outline);
  }
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = at(x, y);
    if (!v) continue;
    let c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    if (tint) c = tint(x0 + x * k, y0 + y * k, c);
    F.block(x0 + x * k, y0 + y * k, k, c);
  }
}
// a part render into the picture at (ox, oy), only where keep(x, y)
function blitPart(F, P, ox, oy, keep = null) {
  for (let y = 0; y < P.h; y++) {
    const Y = y + oy;
    if (Y < 0 || Y >= F.h) continue;
    for (let x = 0; x < P.w; x++) {
      const X = x + ox;
      if (X < 0 || X >= F.w || (keep && !keep(X, Y))) continue;
      const i = (y * P.w + x) * 4, o = (Y * F.w + X) * 4;
      F.d[o] = P.d[i]; F.d[o + 1] = P.d[i + 1]; F.d[o + 2] = P.d[i + 2]; F.d[o + 3] = 255;
    }
  }
}
// a part's mask in picture coordinates (clipped by keep)
function maskAt(m, pw, ph, W, H, ox, oy, keep = null) {
  const out = new Uint8Array(W * H);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    if (!m[y * pw + x]) continue;
    const X = x + ox, Y = y + oy;
    if (X < 0 || Y < 0 || X >= W || Y >= H || (keep && !keep(X, Y))) continue;
    out[Y * W + X] = 1;
  }
  return out;
}
// clusters of a mask (the amber nuggets in the bluff): centres of ~cell x cell boxes that hold pixels
function spotsOf(m, W, H, cell = 6) {
  const out = [], seen = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    const k = Math.floor(x / cell) + ',' + Math.floor(y / cell);
    if (seen.has(k)) continue;
    seen.add(k); out.push([x, y]);
  }
  return out;
}
// water drops / foam bits flying out of a splash (age 0..1), pixel blocks
function splashFx(F, x, y, age, seed, { n = 26, R = 46, Hh = 70, k = 2, gravity = 1, keep = null } = {}) {
  if (age < 0 || age > 1) return;
  const C = [rgb('#ffffff'), rgb('#e4fbff'), rgb('#a6ecfa'), rgb('#5ccbe6')];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.08 + 0.84 * hash2(i, seed)), v = 0.45 + 0.55 * hash2(i + 50, seed);
    const t = age;
    const px = x + Math.cos(a) * R * v * t, py = y + Math.sin(a) * Hh * v * t * 2 + Hh * gravity * t * t * 1.4;
    if (py > y + 4) continue;
    const sz = (hash2(i + 9, seed) < 0.3 ? k + 1 : k) - (t > 0.7 ? 1 : 0);
    if (sz <= 0) continue;
    const X = Math.round(px), Y = Math.round(py);
    if (keep && !keep(X, Y)) continue;
    F.block(X, Y, sz, C[i % 4]);
  }
  // the foam crown on the surface: white spikes rising and falling
  const crown = Math.sin(Math.min(1, age * 1.6) * Math.PI);
  for (let j = -7; j <= 7; j++) {
    const h = Math.round(crown * (10 - Math.abs(j) * 1.1) * (0.7 + 0.6 * hash2(j + 20, seed)));
    for (let q = 0; q < h; q++) F.set(Math.round(x + j * 2.4), Math.round(y - q), q > h - 3 ? C[0] : C[1]);
  }
}

// ------------------------------------------------------------------ the frame pipeline for part renders
const DD = { spec: null, prep: null, fish: null };
function ddStage(W, H, spec) {
  Object.assign(stage.style, { width: W + 'px', height: H + 'px' });
  const cv = el('canvas', 'px', { width: W + 'px', height: H + 'px' });
  cv.width = W; cv.height = H;
  Object.assign(DD, { cv, ctx: cv.getContext('2d'), W, H, spec });
  // the hero: the game's Sabre-tooth salmon, Primordial Vial morph, 5 swim frames
  DD.prep = import('../../src/game/fishSprites.js').then((FS) => {
    DD.fish = [0, 1, 2, 3, 4].map((f) => spritePixels(FS.fishCanvasFor(spec.hero || 'sabertooth', { morph: 'ancient', frame: f, scale: 1 })));
  });
}
async function ddFrame(i) {
  const S = DD.spec, W = DD.W, H = DD.H;
  const loads = [];
  for (const p of S.parts) { loads.push(loadImg(partURL(p.name, null, i))); for (const m of p.masks || []) loads.push(loadImg(partURL(p.name, m, i))); }
  const imgs = await Promise.all(loads);
  let k = 0;
  const parts = S.parts.map((p) => {
    const img = imgs[k++];
    const px = img ? sampleRender(img, p.w, p.h) : new Px(p.w, p.h);
    const masks = {};
    for (const m of p.masks || []) masks[m] = maskOf(imgs[k++], p.w, p.h);
    return { ...p, px, masks };
  });
  const F = new Px(W, H);
  S.draw(F, parts, (i % NF) / NF, i);
  DD.ctx.putImageData(new ImageData(F.d, W, H), 0, 0);
}
const fishFrame = (fi) => DD.fish[Math.floor(fi / 2) % 5];
// the leap: { x, y, ang, s } along an underwater run-up, an arc through the air and a dive back in
function leapPath(ph, L) {
  const s = since(ph, L.t0) / L.dur;
  if (s > 1) return null;
  const [ax, ay] = L.from, [bx, by] = L.breach, [ex, ey] = L.entry, [zx, zy] = L.to, a = L.air[0], b = L.air[1];
  if (s < a) { const u = s / a; return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u, ang: Math.atan2(by - ay, bx - ax), s, under: true }; }
  if (s <= b) {
    const u = (s - a) / (b - a);
    const x = bx + (ex - bx) * u, y = by + (ey - by) * u - L.peak * 4 * u * (1 - u);
    return { x, y, ang: Math.atan2((ey - by) - L.peak * 4 * (1 - 2 * u), ex - bx), s, under: false };
  }
  const u = (s - b) / (1 - b);
  return { x: ex + (zx - ex) * u, y: ey + (zy - ey) * u, ang: Math.atan2(zy - ey, zx - ex), s, under: true };
}
// the "UPDATE" kicker: a riveted dark plate with a gold rim, the word in gold
function kickerPlate(F, x, y, U, word, style, glint) {
  const L = layout([{ text: word, x: 0, y: 0 }]), w = (L[L.length - 1].x + L[L.length - 1].adv) * U, h = 11 * U;
  const x0 = x - 3 * U, y0 = y - 2 * U, x1 = x + w + 2 * U, y1 = y + h + 2 * U;
  const C = { k: rgb('#0a0610'), r: rgb('#e8a83a'), R: rgb('#fff0b0'), p: rgb('#1c2238'), q: rgb('#262e4a') };
  for (let Y = y0 - 1; Y <= y1 + 1; Y++) for (let X = x0 - 1; X <= x1 + 1; X++) {
    const edge = Y === y0 - 1 || Y === y1 + 1 || X === x0 - 1 || X === x1 + 1;
    const rim = Y === y0 || Y === y1 || X === x0 || X === x1;
    if ((Y === y0 - 1 || Y === y1 + 1) && (X === x0 - 1 || X === x1 + 1)) continue;
    F.set(X, Y, edge ? C.k : rim ? (Y === y0 || X === x0 ? C.R : C.r) : ((X + Y) & 3) === 0 ? C.q : C.p);
  }
  for (const [X, Y] of [[x0 + 2, y0 + 2], [x1 - 2, y0 + 2], [x0 + 2, y1 - 2], [x1 - 2, y1 - 2]]) { F.set(X, Y, C.R); F.set(X + 1, Y, C.r); F.set(X, Y + 1, C.r); }
  drawLetters(F, L, x, y, U, style, null, glint);
  return [x0, y0, x1, y1];
}
// sun motes: 1 px specks drifting up through the warm light (loop-periodic)
function motes(F, n, box, ph, keep, seed = 3) {
  const C = [rgb('#fff6c8'), rgb('#ffe08a'), rgb('#ffd060')];
  for (let i = 0; i < n; i++) {
    const u = (ph + hash2(i, seed)) % 1;
    const x = Math.round(box[0] + hash2(i + 7, seed) * (box[2] - box[0]) + Math.sin((u + hash2(i, 9)) * TAU) * 6);
    const y = Math.round(box[3] - u * (box[3] - box[1]));
    if (keep && !keep(x, y)) continue;
    const tw = Math.sin(u * TAU * 3 + i) > -0.3;
    if (tw) F.set(x, y, C[i % 3]);
    if (tw && i % 5 === 0) { F.set(x + 1, y, C[2], 0.6); F.set(x - 1, y, C[2], 0.6); F.set(x, y - 1, C[2], 0.6); F.set(x, y + 1, C[2], 0.6); }
  }
}
// gold glints popping on the amber in the bluff (spots from its glow mask)
function amberGlints(F, spots, ph, U = 1) {
  if (!spots.length) return;
  const N = Math.min(7, spots.length);
  for (let k = 0; k < N; k++) {
    const s = spots[Math.floor(hash2(k, 77) * spots.length)];
    const age = Math.round(since(ph, k / N + 0.03) * NF);
    const size = [1, 2, 3, 2, 1][age];
    if (size) star(F, s[0], s[1], U, size, [255, 255, 236], [255, 196, 60]);
  }
}

// ------------------------------------------------------------------ the cover (630 x 500)
// The Dig above the waterline, the Dive below. "The Bear Must Eat" + "DIG &" (amber gold) over the
// dig, the "UPDATE" kicker + "DIVE" (lake teal) over the dive. The sabre-tooth races up past Reynard,
// breaks the surface, arcs over the yard in slow motion and dives back in behind "DIVE".
// Loop (3.2 s): breach at ~0.32, the title hops letter by letter off the splash, entry at ~0.69.
function ddthumb() {
  const W = 630, H = 500;
  const [dig, dive] = PARTS.length ? PARTS : ['ddThumbDig', 'ddThumbDive'];
  const yW0 = (x) => 264 - (x - 315) * 0.03;
  const yW = (x, ph) => Math.round(yW0(x) + 2.2 * Math.sin((x / 37 + ph) * TAU) + 1.2 * Math.sin((x / 13 - ph * 2) * TAU));
  const LEAP = { t0: 0.1, dur: 0.82, from: [176, 560], breach: [262, yW0(262) + 6], entry: [454, yW0(454) + 6], to: [552, 560], air: [0.27, 0.73], peak: 150 };
  const tB = LEAP.t0 + LEAP.air[0] * LEAP.dur, tE = LEAP.t0 + LEAP.air[1] * LEAP.dur;
  const TT = lazy(() => layout([{ text: 'The Bear Must Eat', x: 0, y: 0 }]));
  const T1 = lazy(() => layout([{ text: 'DIG &', x: 0, y: 0 }]));
  const T2 = lazy(() => layout([{ text: 'DIVE', x: 0, y: 0 }]));
  const HOP = { start: tB + 0.02, stagger: 0.03, dur: 0.15, H: 2 };
  ddStage(W, H, {
    hero: 'sabertooth',
    parts: [{ name: dig, w: 630, h: 310, ox: 0, oy: 0, masks: ['snapp', 'bluffGlow'] }, { name: dive, w: 630, h: 280, ox: 0, oy: 220, masks: ['fox'] }],
    draw(F, [Pd, Pv], ph, fi) {
      const above = (x, y) => y < yW(x, ph);
      grade(Pd.px, { sat: 1.12, con: 1.05, warm: 6 });
      grade(Pv.px, { sat: 1.22, con: 1.06, warm: -5 });
      blitPart(F, Pv.px, Pv.ox, Pv.oy);
      blitPart(F, Pd.px, Pd.ox, Pd.oy, above);
      // above the waterline: warm god rays from the low sun (upper left), sun motes, amber glints
      godRays(F, -60, -40, { rays: 16, R: 760, k: 0.34, width: 0.4, rot: 0.08, mask: (x, y) => (above(x, y) ? 1 : 0) });
      const snapp = maskAt(Pd.masks.snapp, Pd.w, Pd.h, W, H, Pd.ox, Pd.oy, above);
      const glow = maskAt(Pd.masks.bluffGlow, Pd.w, Pd.h, W, H, Pd.ox, Pd.oy, above);
      const fox = maskAt(Pv.masks.fox, Pv.w, Pv.h, W, H, Pv.ox, Pv.oy, (x, y) => !above(x, y));
      rings(F, snapp, W, H, [{ r: 1, c: rgb('#fff2cf') }]);
      rings(F, fox, W, H, [{ r: 1, c: rgb('#e6fdff') }]);
      vignette(F, null, { r: 0.52, k: 1.0, top: [0.2, 0.55], bottom: [0.9, 0.45], max: 0.6 });
      motes(F, 34, [250, 140, 630, 270], ph, above);
      amberGlints(F, spotsOf(glow, W, H, 7), ph, 1);
      // the waterline: dark edge, a pale foam crest, a dithered shimmer band under it
      for (let x = 0; x < W; x++) {
        const y = yW(x, ph);
        F.set(x, y - 2, rgb('#ffffff'), 0.55);
        F.set(x, y - 1, rgb('#f2fdff'));
        F.set(x, y, rgb('#9ee6f6'));
        F.set(x, y + 1, rgb('#0c3a52'));
        for (let q = 2; q < 7; q++) if (dither(x, y + q, 0.35 - q * 0.05)) F.set(x, y + q, rgb('#bff2fb'), 0.5);
      }
      // the hero leap
      const f = leapPath(ph, LEAP);
      if (f) {
        const s = rotSprite('sabre' + (Math.floor(fi / 2) % 5), fishFrame(fi), f.ang);
        const tint = (x, y, c) => (y >= yW(x, ph) ? mixc(c, [52, 150, 176], 0.26) : c);
        drawSprite(F, s, f.x, f.y, 3, { tint, outline: rgb('#0a0a14') });
        // a bubble trail under water
        if (f.under) for (let b = 1; b <= 4; b++) { const bx = Math.round(f.x - Math.cos(f.ang) * (40 + b * 14) + Math.sin(fi + b) * 3), by = Math.round(f.y - Math.sin(f.ang) * (40 + b * 14)); if (by > yW(bx, ph) + 3) { F.set(bx, by, rgb('#e8fdff')); F.set(bx + 1, by, rgb('#7ad8ee')); } }
      }
      splashFx(F, LEAP.breach[0], yW0(LEAP.breach[0]) - 1, since(ph, tB) / 0.24, 11, { n: 30, R: 54, Hh: 64, k: 3 });
      splashFx(F, LEAP.entry[0], yW0(LEAP.entry[0]) - 1, since(ph, tE) / 0.24, 23, { n: 30, R: 54, Hh: 70, k: 3 });
      // titles
      drawLetters(F, TT(), 16, 10, 2, ST_KICK, null, glintAt(ph, 0.55, 0.85, -10, 150, 3));
      drawLetters(F, T1(), 12, 38, 6, ST_DIG, (L) => ({ dy: hopAt(ph, L.i, HOP), col: L.ch === '&' ? ST_AMP.fill : null }), glintAt(ph, 0.02, 0.3, -12, 60, 3));
      sparkles(F, [[14, 40, 0.06], [12 + 22 * 6, 44, 0.2], [12 + 40 * 6, 96, 0.5], [12 + 9 * 6, 112, 0.78]], ph, 2);
      kickerPlate(F, 630 - 14 - 59 * 2, 362, 2, 'UPDATE', ST_KICK, glintAt(ph, 0.8, 1.0, -10, 70, 2));
      const bob = (L) => { const w = Math.sin((ph * 2 - L.i * 0.18) * TAU); return { dy: w > 0.75 ? -1 : w < -0.75 ? 1 : 0 }; };
      drawLetters(F, T2(), 630 - 12 - 35 * 6, 394, 6, ST_DIVE, bob, glintAt(ph, 0.4, 0.7, -12, 50, 3));
      sparkles(F, [[630 - 14, 398, 0.33], [630 - 12 - 35 * 6 + 8, 452, 0.62]], ph, 2);
    },
  });
}

// ------------------------------------------------------------------ the banner (960 x 240)
// The waterline runs across at ~118. Left: "The Bear Must Eat", "DIG &" above the water, "DIVE" + the
// UPDATE plate below it. Right: the yard and Snapp above, the farms, Chief and the diver below; the
// sabre-tooth leaps right to left across the middle (mirrored sprite, 2x).
const mirror = (s) => { const px = new Uint32Array(s.w * s.h); for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) px[y * s.w + x] = s.px[y * s.w + s.w - 1 - x]; return { w: s.w, h: s.h, px }; };
function ddbanner() {
  const W = 960, H = 240;
  const [dig, dive] = PARTS.length ? PARTS : ['ddBannerDig', 'ddBannerDive'];
  const yW0 = (x) => 118 + (x - 480) * 0.008;
  const yW = (x, ph) => Math.round(yW0(x) + 1.8 * Math.sin((x / 41 + ph) * TAU) + 1.0 * Math.sin((x / 15 - ph * 2) * TAU));
  const LEAP = { t0: 0.1, dur: 0.82, from: [790, 300], breach: [662, yW0(662) + 4], entry: [440, yW0(440) + 4], to: [330, 300], air: [0.27, 0.73], peak: 92 };
  const tB = LEAP.t0 + LEAP.air[0] * LEAP.dur, tE = LEAP.t0 + LEAP.air[1] * LEAP.dur;
  const TT = lazy(() => layout([{ text: 'The Bear Must Eat', x: 0, y: 0 }]));
  const T1 = lazy(() => layout([{ text: 'DIG &', x: 0, y: 0 }]));
  const T2 = lazy(() => layout([{ text: 'DIVE', x: 0, y: 0 }]));
  const HOP = { start: tB + 0.02, stagger: 0.03, dur: 0.15, H: 2 };
  let fishL = null;
  ddStage(W, H, {
    hero: 'sabertooth',
    parts: [{ name: dig, w: 960, h: 140, ox: 0, oy: 0, masks: ['snapp', 'bluffGlow'] }, { name: dive, w: 960, h: 140, ox: 0, oy: 100, masks: ['fox'] }],
    draw(F, [Pd, Pv], ph, fi) {
      fishL ||= DD.fish.map(mirror);
      const above = (x, y) => y < yW(x, ph);
      grade(Pd.px, { sat: 1.12, con: 1.05, warm: 6 });
      grade(Pv.px, { sat: 1.22, con: 1.06, warm: -5 });
      blitPart(F, Pv.px, Pv.ox, Pv.oy);
      blitPart(F, Pd.px, Pd.ox, Pd.oy, above);
      godRays(F, -80, -60, { rays: 18, R: 900, k: 0.3, width: 0.4, rot: 0.1, mask: (x, y) => (above(x, y) ? 1 : 0) });
      const snapp = maskAt(Pd.masks.snapp, Pd.w, Pd.h, W, H, Pd.ox, Pd.oy, above);
      const glow = maskAt(Pd.masks.bluffGlow, Pd.w, Pd.h, W, H, Pd.ox, Pd.oy, above);
      const fox = maskAt(Pv.masks.fox, Pv.w, Pv.h, W, H, Pv.ox, Pv.oy, (x, y) => !above(x, y));
      rings(F, snapp, W, H, [{ r: 1, c: rgb('#fff2cf') }]);
      rings(F, fox, W, H, [{ r: 1, c: rgb('#e6fdff') }]);
      // the type side: a dithered dark panel on the left, both halves
      for (let y = 0; y < H; y++) for (let x = 0; x < 380; x++) { const a = x < 250 ? 0.62 : 0.62 * (1 - (x - 250) / 130); if (dither(x, y, a)) F.set(x, y, above(x, y) ? rgb('#1c0a14') : rgb('#04121e'), 0.55); }
      vignette(F, null, { r: 0.5, ax: 1.0, ay: 0.5, k: 1.1, max: 0.55 });
      motes(F, 40, [380, 10, 960, 112], ph, above);
      amberGlints(F, spotsOf(glow, W, H, 7), ph, 1);
      for (let x = 0; x < W; x++) {
        const y = yW(x, ph);
        F.set(x, y - 2, rgb('#ffffff'), 0.55);
        F.set(x, y - 1, rgb('#f2fdff'));
        F.set(x, y, rgb('#9ee6f6'));
        F.set(x, y + 1, rgb('#0c3a52'));
        for (let q = 2; q < 6; q++) if (dither(x, y + q, 0.32 - q * 0.05)) F.set(x, y + q, rgb('#bff2fb'), 0.5);
      }
      const f = leapPath(ph, LEAP);
      if (f) {
        let a = f.ang - Math.PI; if (a < -Math.PI) a += TAU;
        const fr = Math.floor(fi / 2) % 5;
        const s = rotSprite('sabreL' + fr, fishL[fr], a);
        const tint = (x, y, c) => (y >= yW(x, ph) ? mixc(c, [52, 150, 176], 0.26) : c);
        drawSprite(F, s, f.x, f.y, 2, { tint, outline: rgb('#0a0a14') });
        if (f.under) for (let b = 1; b <= 4; b++) { const bx = Math.round(f.x - Math.cos(f.ang) * (28 + b * 10) + Math.sin(fi + b) * 2), by = Math.round(f.y - Math.sin(f.ang) * (28 + b * 10)); if (by > yW(bx, ph) + 3) { F.set(bx, by, rgb('#e8fdff')); F.set(bx + 1, by, rgb('#7ad8ee')); } }
      }
      splashFx(F, LEAP.breach[0], yW0(LEAP.breach[0]) - 1, since(ph, tB) / 0.24, 11, { n: 24, R: 38, Hh: 44, k: 2 });
      splashFx(F, LEAP.entry[0], yW0(LEAP.entry[0]) - 1, since(ph, tE) / 0.24, 23, { n: 24, R: 38, Hh: 48, k: 2 });
      drawLetters(F, TT(), 18, 9, 2, ST_KICK, null, glintAt(ph, 0.55, 0.85, -10, 150, 3));
      drawLetters(F, T1(), 16, 36, 4, ST_DIG, (L) => ({ dy: hopAt(ph, L.i, HOP), col: L.ch === '&' ? ST_AMP.fill : null }), glintAt(ph, 0.02, 0.3, -12, 60, 3));
      sparkles(F, [[18, 37, 0.06], [16 + 22 * 4, 40, 0.2], [16 + 40 * 4, 74, 0.5]], ph, 2);
      const bob = (L) => { const w = Math.sin((ph * 2 - L.i * 0.18) * TAU); return { dy: w > 0.75 ? -1 : w < -0.75 ? 1 : 0 }; };
      drawLetters(F, T2(), 30, 136, 4, ST_DIVE, bob, glintAt(ph, 0.4, 0.7, -12, 50, 3));
      kickerPlate(F, 30 + 35 * 4 + 18, 153, 2, 'UPDATE', ST_KICK, glintAt(ph, 0.8, 1.0, -10, 70, 2));
      sparkles(F, [[30 + 35 * 4 + 2, 140, 0.33], [34, 182, 0.62]], ph, 2);
    },
  });
}
const SCENES = { thumb, banner, fsthumb, fsbanner, cinethumb, cinebanner, ddthumb, ddbanner };
SCENES[kind]?.();
if (CINE.scene) window.setFrame = (i) => cineFrame(i);
if (DD.spec) window.setFrame = (i) => ddFrame(i);

// ready once fonts and every image are in
const urls = [];
if (ANIM_NAME) for (let i = 0; i < NF; i++) for (const d of stage.querySelectorAll('[data-src],[data-mask]')) { if (d.dataset.src) urls.push(R(d.dataset.src, i)); if (d.dataset.mask) urls.push(R(d.dataset.mask, i)); }
window.__imgs = [];
urls.push(...[...stage.querySelectorAll('*')].flatMap((e) => [e.style.backgroundImage, e.style.maskImage, e.style.webkitMaskImage]).filter(Boolean).flatMap((s) => [...s.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1])));
Promise.all([document.fonts.ready, document.fonts.load("40px 'TBME Title'"), (CINE.scene || DD.spec) && document.fonts.load('16px Alagard'), ...[...new Set(urls)].map((u) => new Promise((res) => { const i = new Image(); window.__imgs.push(i); i.onload = i.onerror = res; i.src = u; }))])
  .then(() => DD.prep)
  .then(() => (CINE.scene ? cineFrame(0) : DD.spec ? ddFrame(0) : null))
  .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  .then(() => { window.__ready = true; });
