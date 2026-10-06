// Compositor for the Fiverr gig images (1280 x 769): lays the chunky TBME type,
// sunbursts, arrows, price cards and cut-out outlines over the renders made by
// capture.mjs (tools/promo/renders/<kind>.png + <kind>-<actors>.png masks).
//   fiverr.html?kind=gig | tiers | extras | box
// Sets window.__ready once fonts + images are in.
import { iconURL } from '../../portfolio/icons.js';

const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'gig';
const bust = '?t=' + (Q.get('t') || Date.now());
const R = (f) => `./renders/${f}${bust}`;
const stage = document.getElementById('stage');
const W = 1280, H = 769;
// TBME Goofy is drawn on a 20 px em: sizes in whole font pixels stay crisp
const FS = (n) => n * 20.8333;

function el(tag, cls, css = {}, parent = stage) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (!css.position && ['left', 'top', 'right', 'bottom', 'inset'].some((k) => k in css)) e.style.position = 'absolute';
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

// Layered title text: drop shadow, outer outline, inner outline, gradient fill (o.fills per line)
function bigText(parent, lines, o) {
  const box = el('div', 'txt', { left: o.x + 'px', top: o.y + 'px', fontSize: o.size + 'px', transform: `rotate(${o.rot || 0}deg)`, transformOrigin: o.origin || 'left top', textAlign: o.align || 'left' }, parent);
  if (o.pos) box.style.position = o.pos;
  lines.forEach((t, i) => {
    const L = el('div', 'l', { fontSize: (o.sizes?.[i] || o.size) + 'px', marginTop: i ? (o.gap ?? 0) + 'px' : 0, marginLeft: (o.indent?.[i] || 0) + 'px', letterSpacing: (o.track ?? 0) + 'px' }, box);
    const R1 = o.outline, R2 = o.outline + (o.outer || 0);
    if (o.shadow) el('span', 'sh', { color: o.shadow.color, textShadow: ring(R2, o.shadow.color, o.shadow.x, o.shadow.y) + (o.shadow.glow ? ',' + o.shadow.glow : ''), transform: `translate(${o.shadow.x}px, ${o.shadow.y}px)` }, L).textContent = t;
    if (o.outer) el('span', 'ou', { color: o.outerColor, textShadow: ring(R2, o.outerColor) }, L).textContent = t;
    el('span', 'ol', { color: o.outlineColor, textShadow: ring(R1, o.outlineColor) }, L).textContent = t;
    const fill = o.fills?.[i] || o.fill;
    const f = el('span', 'fill', fill.startsWith('#') ? { color: fill } : { backgroundImage: fill, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }, L);
    f.textContent = t;
  });
  return box;
}

// plain one-colour text with a thin outline (card copy)
function txt(parent, t, { x = 0, y = 0, size = FS(1), color = '#3a1c10', outline = 0, outlineColor = '#2a0f1e', width = null, align = 'left', lh = 1.15, pos = 'absolute' } = {}) {
  const e = el('div', 'txt', { position: pos, left: x + 'px', top: y + 'px', fontSize: size + 'px', color, textAlign: align, lineHeight: lh }, parent);
  if (width) { e.style.width = width + 'px'; e.style.whiteSpace = 'normal'; }
  if (outline) e.style.textShadow = ring(outline, outlineColor);
  e.textContent = t;
  return e;
}

// cut-out of the render along an actor mask, with stacked drop-shadow outlines + glow
function cutout(bgFile, maskFile, filters) {
  const w = el('div', 'cut', { filter: filters.join(' ') });
  el('div', '', { backgroundImage: `url(${R(bgFile)})`, WebkitMaskImage: `url(${R(maskFile)})`, maskImage: `url(${R(maskFile)})`, filter: 'saturate(1.22) contrast(1.07) brightness(1.03)' }, w);
  return w;
}
const bgLayer = (file) => el('div', 'bg', { backgroundImage: `url(${R(file)})` });
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
  Object.assign(svg.style, { position: 'absolute', left: x + 'px', top: y + 'px', transform: `rotate(${rot}deg)`, filter: 'drop-shadow(0 6px 0 rgba(40,10,30,.55))' });
  stage.appendChild(svg);
  const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
  const path = mk('path', { d, fill: 'none', stroke: 'none' });
  const L = path.getTotalLength();
  const tip = path.getPointAtLength(L), pre = path.getPointAtLength(L - 2);
  const ang = Math.atan2(tip.y - pre.y, tip.x - pre.x);
  const back = path.getPointAtLength(L - head * 0.8);
  const hx = (a, r) => [tip.x + Math.cos(ang + a) * r, tip.y + Math.sin(ang + a) * r];
  const p1 = hx(Math.PI - 0.62, head), p2 = hx(Math.PI + 0.62, head);
  const tri = `M${tip.x + Math.cos(ang) * 4},${tip.y + Math.sin(ang) * 4} L${p1[0]},${p1[1]} L${back.x},${back.y} L${p2[0]},${p2[1]} Z`;
  const shaftLen = L - head * 0.6;
  for (const [c, add] of [['#2a0f1e', 13], ['#ffffff', 8], [color, 0]]) {
    mk('path', { d, fill: 'none', stroke: c, 'stroke-width': w + add, 'stroke-linecap': 'round', 'stroke-dasharray': `${shaftLen} 9999` });
    mk('path', { d: tri, fill: c, stroke: c, 'stroke-width': add, 'stroke-linejoin': 'round' });
  }
  mk('path', { d, fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': w * 0.28, 'stroke-linecap': 'round', 'stroke-dasharray': `${shaftLen * 0.55} 9999`, transform: `translate(0,-${w * 0.2})` });
  return svg;
}

// rounded ribbon / pill holding a line of type
function pill(t, { x, y, size = FS(1.5), bg = 'linear-gradient(180deg, #ff4d6d, #d0204a)', rot = -2, pad = '8px 22px 11px', center = false, fill = 'linear-gradient(180deg,#ffffff,#ffe9c0)', parent = stage, b = 3 } = {}) {
  const p = el('div', '', { left: x + 'px', top: y + 'px', transform: `${center ? 'translateX(-50%) ' : ''}rotate(${rot}deg)`, padding: pad, background: bg, border: `${b}px solid #2a0f1e`, borderRadius: '12px', boxShadow: `0 0 0 ${b}px #fff6e0, 0 7px 0 ${b}px rgba(40,8,40,.7)` }, parent);
  bigText(p, [t], { x: 0, y: 0, size, outline: 3, outlineColor: '#2a0f1e', fill, pos: 'relative' });
  return p;
}

// cream paper card with the game's dark ink border
function card(x, y, w, h, { bg = 'linear-gradient(180deg, #fff8e6 0%, #fbe8c2 100%)', b = 4, r = 16, glow = null } = {}) {
  return el('div', '', { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', boxSizing: 'border-box', background: bg, border: `${b}px solid #2a0f1e`, borderRadius: r + 'px',
    boxShadow: `0 0 0 ${b}px #fff6e0, 0 9px 0 ${b}px rgba(40,8,40,.65)${glow ? ', 0 0 34px 6px ' + glow : ''}` });
}
const icon = (name, scale, css, parent = stage) => { const i = el('img', 'px', css, parent); i.src = iconURL(name, scale); return i; };

const FILL_GOLD = 'linear-gradient(180deg, #fff9c4 0%, #ffe14a 30%, #ffb52e 62%, #ff7a1e 100%)';
const FILL_WHITE = 'linear-gradient(180deg, #ffffff 0%, #fff3d6 100%)';
const TITLE = { outline: 6, outlineColor: '#3a1408', outer: 5, outerColor: '#fff6e0', fill: FILL_GOLD, shadow: { x: 0, y: 9, color: 'rgba(40,8,40,.78)', glow: '0 0 30px rgba(255,140,60,.6)' } };
const HERO_GLOW = [...outline(4, '#fff'), ...outline(2, '#fff'), 'drop-shadow(0 0 10px rgba(255,220,90,.95))', 'drop-shadow(0 0 26px rgba(255,170,50,.55))'];
const PROP_GLOW = [...outline(3, '#fff'), 'drop-shadow(0 0 8px rgba(140,210,255,.9))'];
const RAGE_GLOW = [...outline(3, '#fff'), 'drop-shadow(0 0 8px rgba(255,40,40,1))', 'drop-shadow(0 0 22px rgba(255,60,30,.6))'];

// ------------------------------------------------------------------ 1. gig thumbnail
function gig() {
  bgLayer('gig.png');
  burst(930, 470, 640, { rays: 22, a: 'rgba(255,220,130,0.36)', rot: 6, fade: 0.9 });
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 40% 45% at 74% 64%, rgba(255,80,40,.28), rgba(255,80,40,0) 70%)', mixBlendMode: 'screen' });
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(36,10,48,.62) 0%, rgba(36,10,48,0) 36%, rgba(36,10,48,0) 78%, rgba(30,8,36,.72) 100%)' });
  cutout('gig.png', 'gig-pad1+pad2+pad3+blk.png', PROP_GLOW);
  cutout('gig.png', 'gig-dragon+dragon2.png', RAGE_GLOW);
  cutout('gig.png', 'gig-fox.png', HERO_GLOW);
  bigText(stage, ["I'LL MAKE YOUR", '3D GAME!'], { ...TITLE, x: 494, y: 40, size: FS(3), sizes: [FS(3.5), FS(8)], fills: [FILL_WHITE, FILL_GOLD], gap: -18, indent: [52, 0], rot: -4 });
  const rawr = bigText(stage, ['RAWR!'], { x: 1040, y: 292, size: FS(3), rot: 10, outline: 4, outlineColor: '#2a0f1e', outer: 3, outerColor: '#fff', fill: 'linear-gradient(180deg, #ffe46a 0%, #ff8a2a 55%, #ff2a2a 100%)', shadow: { x: 0, y: 5, color: 'rgba(42,15,30,.7)' } });
  rawr.style.transformOrigin = '50% 50%';
  arrow('M 120 14 C 70 40, 30 90, 20 168', { x: 432, y: 262, width: 160, height: 200, w: 15, head: 32 });
  pill('JavaScript • Three.js • Pixel Art • Minecraft Mods', { x: 640, y: 694, size: FS(1.5), center: true, rot: -1.5 });
}

// ------------------------------------------------------------------ 2. pricing tiers
const TIERS = [
  { key: 'duck', name: 'DUCK TIER', level: 'BASIC', price: '$75', color: '#3aa8e0', dark: '#1a6aa0',
    desc: 'Good prototype 3D JavaScript mini game with the main mechanic and custom assets',
    feats: ['3-day delivery', '1 level', '1 plugin', 'Design + animation', 'Source code included', '1 revision'] },
  { key: 'fox', name: 'FOX TIER', level: 'STANDARD', price: '$150', color: '#ff8a2a', dark: '#c0501a',
    desc: 'Detailed 3D JavaScript game with custom gameplay systems, characters and art',
    feats: ['5-day delivery', '2 levels', '2 plugins', 'Design + animation', 'Source code included', '2 revisions'] },
  { key: 'bear', name: 'BEAR TIER', level: 'PREMIUM', price: '$350', color: '#b04ad8', dark: '#6a2a98',
    desc: 'Full custom Steam-style game with original characters / OCs, custom assets and detailed progression',
    feats: ['10-day delivery', '3 levels', '3 plugins', 'Design + animation', 'Source code included', '3 revisions'] },
];
function check(parent, x, y, s = 3) {
  const c = el('div', '', { left: x + 'px', top: y + 'px', width: 7 * s + 'px', height: 7 * s + 'px', background: '#4cc05a', border: '2px solid #2a0f1e', borderRadius: '5px', boxSizing: 'border-box' }, parent);
  txt(c, '✓', { x: 1, y: -3, size: FS(1), color: '#fff' });
  return c;
}
function tiers() {
  bgLayer('tiers.png');
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(36,10,48,.25) 0%, rgba(36,10,48,.1) 30%, rgba(30,8,36,.72) 52%, rgba(30,8,36,.85) 100%)' });
  const CW = 392, GAP = 22, X0 = (W - CW * 3 - GAP * 2) / 2, TOP = 304, CH = 392;
  TIERS.forEach((t, i) => {
    const x = X0 + i * (CW + GAP);
    burst(x + CW / 2, 190, 230, { rays: 16, a: 'rgba(255,230,150,0.32)', rot: i * 7, fade: 0.85 });
    const c = card(x, TOP, CW, CH, { glow: t.color + '88' });
    // header band in the tier colour
    const head = el('div', '', { left: 0, top: 0, right: 0, height: '56px', background: `linear-gradient(180deg, ${t.color}, ${t.dark})`, borderRadius: '11px 11px 0 0', borderBottom: '4px solid #2a0f1e' }, c);
    bigText(head, [t.name], { x: 16, y: 6, size: FS(2), outline: 3, outlineColor: '#2a0f1e', fill: FILL_WHITE });
    txt(head, t.level, { x: CW - 24, y: 17, size: FS(1), color: '#fff', outline: 2, align: 'right' }).style.transform = 'translateX(-100%)';
    bigText(c, [t.price], { x: 16, y: 62, size: FS(4), outline: 4, outlineColor: '#3a1408', fill: FILL_GOLD, shadow: { x: 0, y: 4, color: 'rgba(40,8,40,.35)' } });
    txt(c, t.desc, { x: 18, y: 150, size: FS(1), width: CW - 36, lh: 1.12, color: '#4a2a18' });
    el('div', '', { left: '18px', right: '18px', top: '230px', height: '3px', background: 'rgba(90,50,30,.22)' }, c);
    t.feats.forEach((f, k) => {
      const yy = 244 + k * 23.5;
      check(c, 18, yy + 2, 2.6);
      txt(c, f, { x: 48, y: yy - 1, size: FS(1), color: '#2a1408' });
    });
  });
  cutout('tiers.png', 'tiers-duck.png', HERO_GLOW);
  cutout('tiers.png', 'tiers-fox.png', HERO_GLOW);
  cutout('tiers.png', 'tiers-bear.png', HERO_GLOW);
  pill('✓ All tiers include a functional game!', { x: 640, y: 708, size: FS(1.5), center: true, rot: -1 });
}

// ------------------------------------------------------------------ 3. extras
function extras() {
  bgLayer('extras.png');
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(36,10,48,.55) 0%, rgba(36,10,48,0) 34%, rgba(36,10,48,0) 80%, rgba(30,8,36,.6) 100%)' });
  // speed lines behind the runners
  for (let i = 0; i < 9; i++) el('div', '', { left: 20 + (i * 53) % 160 + 'px', top: 330 + i * 42 + 'px', width: 150 + (i * 37) % 120 + 'px', height: '7px', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.85))', borderRadius: '4px' });
  cutout('extras.png', 'extras-bear.png', RAGE_GLOW);
  cutout('extras.png', 'extras-fox.png', HERO_GLOW);
  bigText(stage, ['NEED IT', 'FASTER?'], { ...TITLE, x: 26, y: 14, size: FS(5), sizes: [FS(4), FS(5.5)], fills: [FILL_WHITE, FILL_GOLD], gap: -14, indent: [10, 0], rot: -4 });
  // price list
  const X = 650, CW = 600;
  const A = card(X, 22, CW, 470);
  const head = (parent, t, sub, color, dark) => {
    const h = el('div', '', { left: 0, top: 0, right: 0, height: '60px', background: `linear-gradient(180deg, ${color}, ${dark})`, borderRadius: '11px 11px 0 0', borderBottom: '4px solid #2a0f1e' }, parent);
    bigText(h, [t], { x: 18, y: 8, size: FS(2), outline: 3, outlineColor: '#2a0f1e', fill: FILL_WHITE });
    if (sub) txt(h, sub, { x: CW - 26, y: 20, size: FS(1), color: '#fff', outline: 2 }).style.transform = 'translateX(-100%)';
  };
  head(A, 'EXTRA-FAST DELIVERY', 'per tier', '#ff4d6d', '#c0204a');
  const rows = [['DUCK TIER', 'Basic', 'in 1 day', '+$10'], ['FOX TIER', 'Standard', 'in 2 days', '+$25'], ['BEAR TIER', 'Premium', 'in 3 days', '+$35']];
  rows.forEach(([n, lvl, d, p], i) => {
    const y = 76 + i * 128;
    if (i) el('div', '', { left: '18px', right: '18px', top: y - 8 + 'px', height: '3px', background: 'rgba(90,50,30,.25)' }, A);
    bigText(A, [n], { x: 142, y: y + 16, size: FS(2), outline: 3, outlineColor: '#3a1408', fill: FILL_WHITE });
    txt(A, lvl + ' • ' + d, { x: 146, y: y + 68, size: FS(1.25), color: '#4a2a18' });
    bigText(A, [p], { x: CW - 24, y: y + 20, size: FS(3.5), outline: 4, outlineColor: '#3a1408', fill: FILL_GOLD, shadow: { x: 0, y: 4, color: 'rgba(40,8,40,.35)' } }).style.transform = 'translateX(-100%)';
  });
  const B = card(X, 512, CW, 230);
  head(B, 'ADDITIONAL LEVEL', 'any tier', '#4cc05a', '#2a8a3a');
  bigText(B, ['+1 LEVEL'], { x: 142, y: 92, size: FS(2), outline: 3, outlineColor: '#3a1408', fill: FILL_WHITE });
  txt(B, 'adds +1 day to delivery', { x: 146, y: 144, size: FS(1.25), color: '#4a2a18' });
  bigText(B, ['+$5'], { x: CW - 24, y: 92, size: FS(3.5), outline: 4, outlineColor: '#3a1408', fill: FILL_GOLD, shadow: { x: 0, y: 4, color: 'rgba(40,8,40,.35)' } }).style.transform = 'translateX(-100%)';
  cutout('extras.png', 'extras-duck+fox2+bear2+blk.png', [...outline(2, '#fff'), 'drop-shadow(0 3px 0 rgba(40,8,40,.5))']);
}

// ------------------------------------------------------------------ 4. what you get
function box() {
  bgLayer('box.png');
  burst(640, 470, 700, { rays: 26, a: 'rgba(255,230,150,0.4)', rot: 3, fade: 0.88 });
  el('div', '', { inset: 0, background: 'radial-gradient(ellipse 34% 40% at 50% 66%, rgba(255,200,80,.35), rgba(255,200,80,0) 70%)', mixBlendMode: 'screen' });
  el('div', '', { inset: 0, background: 'linear-gradient(180deg, rgba(36,10,48,.6) 0%, rgba(36,10,48,0) 28%, rgba(36,10,48,0) 82%, rgba(30,8,36,.6) 100%)' });
  cutout('box.png', 'box-box+bear+fox+duck+pad1+pad2+blk+dragon+sword+frog+owl+deer+racc.png', HERO_GLOW);
  bigText(stage, ["WHAT YOU'LL GET"], { ...TITLE, x: 640, y: 10, size: FS(4.5), rot: -2, origin: 'center top' }).style.transform = 'translateX(-50%) rotate(-2deg)';
  const LBL = (t, x, y, rot, bg) => pill(t, { x, y, size: FS(1.5), rot, bg, pad: '6px 16px 9px' });
  LBL('✓ ANIMATED CHARACTERS', 18, 134, -3, 'linear-gradient(180deg, #ff8a2a, #c0501a)');
  LBL('✓ 3D MODELS', 958, 116, 3, 'linear-gradient(180deg, #3aa8e0, #1a6aa0)');
  LBL('✓ 2D PIXEL ART', 24, 318, -2, 'linear-gradient(180deg, #4cc05a, #2a8a3a)');
  LBL('✓ SOUND FX + MUSIC', 900, 384, 2, 'linear-gradient(180deg, #b04ad8, #6a2a98)');
  // pixel art samples (the portfolio's own icons)
  ['heart', 'star', 'gamepad', 'bell'].forEach((n, i) => icon(n, 4, { left: 34 + i * 70 + 'px', top: 384 + (i % 2) * 14 + 'px', filter: 'drop-shadow(0 4px 0 rgba(40,8,40,.6))' }));
  // sound: speaker + notes
  icon('speaker', 6, { left: '940px', top: '458px', filter: 'drop-shadow(0 4px 0 rgba(40,8,40,.6))' });
  ['♪', '♫', '♪'].forEach((n, i) => bigText(stage, [n], { x: 1036 + i * 54, y: 446 + (i % 2) * 26, size: FS(3), rot: -10 + i * 12, outline: 3, outlineColor: '#2a0f1e', fill: FILL_GOLD }));
  // source code window
  const cw = card(924, 560, 340, 186, { bg: '#1e1a2e', r: 12 });
  const bar = el('div', '', { left: 0, top: 0, right: 0, height: '34px', background: 'linear-gradient(180deg, #ff4d6d, #c0204a)', borderRadius: '8px 8px 0 0', borderBottom: '3px solid #2a0f1e' }, cw);
  ['#fff6e0', '#ffd23a', '#5cdc6a'].forEach((c, i) => el('div', '', { left: 12 + i * 20 + 'px', top: '10px', width: '12px', height: '12px', borderRadius: '50%', background: c, border: '2px solid #2a0f1e', boxSizing: 'border-box' }, bar));
  bigText(bar, ['✓ SOURCE CODE'], { x: 84, y: 2, size: FS(1.5), outline: 3, outlineColor: '#2a0f1e', fill: FILL_WHITE });
  const code = [
    [['#c792ea', 'import'], ['#fff6e0', ' * as THREE '], ['#c792ea', 'from'], ['#c3e88d', " 'three'"], ['#fff6e0', ';']],
    [['#c792ea', 'const'], ['#fff6e0', ' hero = '], ['#82aaff', 'new'], ['#ffcb6b', ' Fox'], ['#fff6e0', '();']],
    [['#fff6e0', 'hero.'], ['#82aaff', 'play'], ['#fff6e0', '('], ['#c3e88d', "'victory'"], ['#fff6e0', ');']],
    [['#fff6e0', 'world.'], ['#82aaff', 'add'], ['#fff6e0', '(hero, dragon);']],
    [['#fff6e0', 'sfx.'], ['#82aaff', 'play'], ['#fff6e0', '('], ['#c3e88d', "'level_up'"], ['#fff6e0', ');']],
  ];
  code.forEach((line, i) => {
    const L = el('div', 'txt', { left: '16px', top: 44 + i * 26 + 'px', fontSize: FS(1) + 'px' }, cw);
    for (const [c, t] of line) el('span', '', { color: c }, L).textContent = t;
  });
}

const SCENES = { gig, tiers, extras, box };
SCENES[kind]?.();

// ready once fonts and every image are in
const urls = [...stage.querySelectorAll('*')].flatMap((e) => [e.style.backgroundImage, e.style.maskImage, e.style.webkitMaskImage]).filter(Boolean).flatMap((s) => [...s.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]));
window.__imgs = [];
Promise.all([document.fonts.ready, document.fonts.load("40px 'TBME Title'"), ...[...new Set(urls)].map((u) => new Promise((res) => { const i = new Image(); window.__imgs.push(i); i.onload = i.onerror = res; i.src = u; }))])
  .then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  .then(() => { window.__ready = true; });
