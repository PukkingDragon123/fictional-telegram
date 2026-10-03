// Matchmaker: "arranged breeding". A vintage dating-agency corkboard where the
// player pins a mum (left) and a dad (right) and reads the predicted baby off
// a match report (star odds, colour + mutation chances, size, traits and a big
// heart-shaped PERFECT GENES meter) before booking the date.
//
// Purely presentational: every number comes from the caller.
//
//   const mm = openMatchmaker(root, {
//     fish,        // [{ id, name, speciesId, speciesName, sex: 'M'|'F', stars 1..5, rarity 0..4,
//                  //    morph: {id,name}, mut: {id,name,color}|null, size: {label, mult},
//                  //    traits: [{id,name,icon,good}], fed 0..1, adult, ready, why, art: () => canvas }]
//     preselect,   // optional fish id to start in its slot
//     predict,     // (mumId, dadId) => { ok, why?, stars: [p1..p5], morphs: [{id,name,p}],
//                  //    muts: [{id,name,color,p}], size: {min,max,avg,label}, traits: [{id,name,icon,good,p}],
//                  //    perfect: p, hybrid?: {speciesName} }
//     onArrange,   // (mumId, dadId) => { ok, msg }
//     icon,        // (name, scale) => '<img>' html
//     sfx,         // (name, opts) => void
//     onClose,     // called once, whenever it goes away
//   })
//   mm.close()          animate away (calls onClose)
//   mm.refresh(fish)    swap in a new fish list (keeps the pinned pair when they still exist)
//   mm.el               the overlay element
//
// Overlay: position absolute, inset 0, z-index 58 inside `root` (give root a
// size, e.g. the fixed #ui layer). Esc or the X closes it.
import './fonts.css';
import './matchmaker.css';
import { paperTexture, injectPaperCSS, deco, stamp, handwriting, PX } from './paper.js';
import { spriteCanvas, hasSprite } from './sprites.js';

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (p) => { const v = (Number(p) || 0) * 100; return v <= 0 ? '0%' : v < 1 ? '<1%' : v > 99 && v < 100 ? '99%' : `${Math.round(v)}%`; };
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };

// rarity colours, same order as RARITIES in data/species.js (kept local: no data imports)
const RAR = [
  { id: 'common', name: 'Common', c: '#a89f8a' },
  { id: 'uncommon', name: 'Uncommon', c: '#4f9e3a' },
  { id: 'rare', name: 'Rare', c: '#2f78c8' },
  { id: 'epic', name: 'Epic', c: '#8e44cf' },
  { id: 'legendary', name: 'Legendary', c: '#e09a10' },
];

// ===========================================================================
// pixel bits
// ===========================================================================
// crisp pixel glyphs as svg (the pixel fonts have no ♀ ♂)
const GLYPHS = {
  F: ['.###.', '#...#', '#...#', '#...#', '.###.', '..#..', '#####', '..#..', '..#..'],
  M: ['....####', '......##', '.....#.#', '....#...', '.###....', '#...#...', '#...#...', '#...#...', '.###....'],
  X: ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'],
  H: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
};
export function glyphSVG(name, px = 2, cls = '') {
  const rows = GLYPHS[name];
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  let d = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += `M${x} ${y}h1v1h-1z`; }));
  return `<svg class="mm-gl ${cls}" width="${w * px}" height="${h * px}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}
const sexGlyph = (sex, px = 2) => glyphSVG(sex === 'M' ? 'M' : 'F', px, sex === 'M' ? 'mm-gl--m' : 'mm-gl--f');

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

// heart mask (texel grid), cached
const HW = 30, HH = 27;
let heartMask = null;
function getHeartMask() {
  if (heartMask) return heartMask;
  const m = new Uint8Array(HW * HH);
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const x = ((i + 0.5) - HW / 2) / (HW / 2) * 1.17;
    const y = 1.22 - ((j + 0.5) / HH) * 2.32;
    const a = x * x + y * y - 1;
    if (a * a * a - x * x * y * y * y <= 0) m[j * HW + i] = 1;
  }
  heartMask = m;
  return m;
}
const HEART_FILL = ['#6e1232', '#a8204a', '#d83a62', '#f2607e', '#ff92aa'];
const HEART_GOLD = ['#7a4a08', '#b87a10', '#e8a820', '#ffd040', '#fff09a'];
// draw the meter: p = fill 0..1, t = time for the sloshing surface
function drawHeart(cv, p, t, gold) {
  const ctx = cv.getContext('2d');
  const m = getHeartMask(), img = ctx.createImageData(HW, HH), d = img.data;
  const R = gold ? HEART_GOLD : HEART_FILL;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ramp = R.map(hex), ink = hex('#3b1424'), e1 = hex('#f6e8d2'), e2 = hex('#e4cdb0'), e3 = hex('#cfb294'), foam = hex(gold ? '#fff8d0' : '#ffd6e0');
  // fill line by area, so 30% looks like 30% even in the narrow tip
  let lvl = HH;
  if (p >= 0.999) lvl = -2;
  else if (p > 0) {
    const rows = [];
    let tot = 0;
    for (let j = 0; j < HH; j++) { let n = 0; for (let i = 0; i < HW; i++) n += m[j * HW + i]; rows.push(n); tot += n; }
    let acc = 0;
    const tgt = p * tot;
    for (let j = HH - 1; j >= 0; j--) {
      if (acc + rows[j] >= tgt) { lvl = j + 1 - (tgt - acc) / Math.max(1, rows[j]); break; }
      acc += rows[j];
    }
  }
  const ins = (i, j) => i >= 0 && j >= 0 && i < HW && j < HH && m[j * HW + i];
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const k = (j * HW + i) * 4;
    let c = null;
    if (ins(i, j)) {
      const edge = !ins(i - 1, j) || !ins(i + 1, j) || !ins(i, j - 1) || !ins(i, j + 1);
      const wave = p > 0.01 && p < 0.99 ? Math.sin(i * 0.55 + t * 3.2) * 0.7 + Math.sin(i * 0.23 - t * 1.7) * 0.5 : 0;
      const surf = lvl + wave;
      const nx = (i - HW / 2) / (HW / 2), ny = (j - HH * 0.45) / (HH / 2);
      if (edge) c = ink;
      else if (j >= surf) {
        // liquid: lit from the top-left, darker at the bottom-right rim
        let l = 2.6 - nx * 0.9 - ny * 1.1 + (bay(i, j) - 0.5) * 0.9;
        if (j < surf + 1) c = foam;
        else c = ramp[clamp(Math.floor(l), 0, ramp.length - 2)];
        // little bubbles rising
        const bx = (i * 7 + 3) % 11, by = Math.floor((j + t * 6 + i * 3) % 9);
        if (bx === 0 && by === 0 && j > surf + 2) c = ramp[ramp.length - 1];
      } else {
        const l = 1.6 - nx * 0.6 - ny * 0.9 + (bay(i, j) - 0.5) * 0.8;
        c = l > 1.6 ? e1 : l > 0.8 ? e2 : e3;
      }
      // glossy highlight on the left lobe
      if (!edge && ((i === 6 && j >= 5 && j <= 7) || (i === 7 && j === 4) || (i === 8 && j === 4) || (i === 5 && j === 8))) c = [255, 255, 255];
    } else {
      const near = ins(i - 1, j) || ins(i + 1, j) || ins(i, j - 1) || ins(i, j + 1);
      if (near) c = ink;
    }
    if (c) { d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
}

// the Cupid-fox rubber stamp: a double ring, Reynard inked in, a heart arrow
let cupidURL = null;
function cupidStamp() {
  if (cupidURL) return cupidURL;
  const S = 46, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S), d = img.data;
  const put = (i, j, a = 255) => { if (i < 0 || j < 0 || i >= S || j >= S) return; const k = (j * S + i) * 4; d[k] = 176; d[k + 1] = 34; d[k + 2] = 58; d[k + 3] = Math.max(d[k + 3], a); };
  const cx = S / 2 - 0.5, cy = S / 2 - 0.5;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const r = Math.hypot(i - cx, j - cy);
    if ((r > 21 && r <= 22.6) || (r > 18.2 && r <= 19.2)) put(i, j);
  }
  if (hasSprite('fox_wink')) {
    // line-art pass: only the dark outline / hat / eyes take ink, the fur stays paper
    const f = spriteCanvas('fox_wink', 1), fd = f.getContext('2d').getImageData(0, 0, f.width, f.height).data;
    const ox = Math.round(cx - f.width / 2) + 1, oy = Math.round(cy - f.height / 2) - 2;
    const lum = (i, j) => { const k = (j * f.width + i) * 4; return fd[k + 3] < 128 ? 1 : (fd[k] * 0.3 + fd[k + 1] * 0.55 + fd[k + 2] * 0.15) / 255; };
    for (let j = 0; j < Math.min(f.height, 25); j++) for (let i = 0; i < f.width; i++) {
      const k = (j * f.width + i) * 4;
      if (fd[k + 3] < 128) continue;
      const l = lum(i, j);
      if (l < 0.3) put(ox + i, oy + j);
      else if (l < 0.62 && (i + j) % 2 === 0 && fd[k] > fd[k + 2] + 60) put(ox + i, oy + j, 200); // orange fur: halftone
    }
    // a little smile line under the cut
    for (let i = 11; i < 21; i++) put(ox + i, oy + 25);
  }
  // heart pierced by an arrow at the bottom of the ring
  const hr = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  hr.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') put(20 + i, 33 + j); }));
  for (let k = 0; k < 17; k++) put(15 + k, 38 - Math.round(k * 0.4));
  [[31, 31], [30, 30], [32, 32], [30, 32]].forEach(([i, j]) => put(i, j));
  [[14, 37], [14, 39], [13, 38], [13, 40]].forEach(([i, j]) => put(i, j));
  x.putImageData(img, 0, 0);
  cupidURL = c.toDataURL();
  return cupidURL;
}

// size an element's background to a paper texture of its own size
function skin(el, kind, opts) {
  let tw = 0, th = 0;
  const go = () => {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h || (Math.abs(w - tw) < PX * 2 && Math.abs(h - th) < PX * 2)) return;
    tw = w; th = h;
    el.style.backgroundImage = `url(${paperTexture(kind, w, h, opts)})`;
  };
  go();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(go);
  ro.observe(el);
  return () => ro.disconnect();
}

// copy a fish's art canvas into a fresh canvas (one canvas can't live in two places)
function portrait(f, boxW, boxH) {
  let src = null;
  try { src = f.art?.(); } catch { src = null; }
  const cv = document.createElement('canvas');
  cv.className = 'mm-fishart';
  if (!src || !src.width) { cv.width = 1; cv.height = 1; return cv; }
  cv.width = src.width; cv.height = src.height;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0);
  // integer upscale that fits the box (fall back to a plain fit for huge art)
  const k = Math.min(boxW / src.width, boxH / src.height);
  const s = k >= 1 ? Math.floor(k) : k;
  cv.style.width = `${Math.round(src.width * s)}px`;
  cv.style.height = `${Math.round(src.height * s)}px`;
  return cv;
}

// ===========================================================================
// main
// ===========================================================================
export function openMatchmaker(root, o = {}) {
  injectPaperCSS();
  const sfx = (n, x) => { try { o.sfx?.(n, x); } catch { /* optional */ } };
  const icon = (n, s = 1) => { try { return o.icon?.(n, s) || ''; } catch { return ''; } };
  const R = Math.random;
  let fish = Array.isArray(o.fish) ? o.fish.slice() : [];
  const byId = () => new Map(fish.map((f) => [f.id, f]));
  const pair = { F: null, M: null };
  let active = 'F';
  let closed = false;
  const cleanups = [];
  // texture observers per re-rendered region, disposed on the next render
  const scoped = { F: [], M: [], pick: [] };
  const flush = (k) => { scoped[k].forEach((f) => { try { f(); } catch { /* */ } }); scoped[k] = []; };

  const ov = document.createElement('div');
  ov.className = 'mm-ov';
  ov.innerHTML = `
    <div class="mm-dim"></div>
    <div class="mm-stage">
      <div class="mm-board paper--wood" role="dialog" aria-modal="true" aria-label="Matchmaker">
        <div class="mm-cork">
          <svg class="mm-yarn" aria-hidden="true"></svg>
          <header class="mm-head">
            <div class="mm-ribbon"><i class="mm-rib-l"></i><span class="mm-rib-t">Cupid &amp; Fox <small>Matchmakers</small></span><i class="mm-rib-r"></i></div>
          </header>
          <button type="button" class="mm-x" aria-label="Close">${glyphSVG('X', 3)}</button>
          <div class="mm-main">
            <section class="mm-slot mm-slot--f" data-sex="F"></section>
            <section class="mm-mid"><div class="mm-report"></div><img class="mm-cupid" src="${cupidStamp()}" alt="" draggable="false"></section>
            <section class="mm-slot mm-slot--m" data-sex="M"></section>
          </div>
          <div class="mm-pick">
            <div class="mm-ptabs">
              <button type="button" class="mm-ptab mm-ptab--f" data-sex="F">${sexGlyph('F')}<span>Mums</span><b class="mm-pn"></b></button>
              <button type="button" class="mm-ptab mm-ptab--m" data-sex="M">${sexGlyph('M')}<span>Dads</span><b class="mm-pn"></b></button>
            </div>
            <div class="mm-prow"></div>
          </div>
          <div class="mm-fx"></div>
        </div>
      </div>
    </div>`;
  const board = ov.querySelector('.mm-board'), cork = ov.querySelector('.mm-cork');
  const slotEl = { F: ov.querySelector('.mm-slot--f'), M: ov.querySelector('.mm-slot--m') };
  const report = ov.querySelector('.mm-report'), prow = ov.querySelector('.mm-prow'), fx = ov.querySelector('.mm-fx');
  const yarn = ov.querySelector('.mm-yarn');
  root.appendChild(ov);
  cleanups.push(skin(cork, 'cork', { edge: 0.5, edgeW: 6, seed: 23 }));
  cleanups.push(skin(report, 'cream', { edge: 0.3, edgeW: 5, dogear: 6, seed: 31 }));

  // ---------------------------------------------------------------- slots
  const why = (f) => (f && !f.ready ? (f.why || (f.adult === false ? 'Still a fry' : 'Not ready')) : '');
  function chipsHTML(f, compact) {
    const out = [];
    const morph = f.morph && f.morph.id !== 'normal' ? f.morph : null;
    out.push(`<span class="mm-chip mm-chip--morph${morph ? ' mm-chip--fancy' : ''}">${esc(f.morph?.name || 'Wild Type')}</span>`);
    if (f.mut) out.push(`<span class="mm-chip mm-chip--mut" style="--c:${esc(f.mut.color || '#ffd040')}">${esc(f.mut.name)}</span>`);
    if (f.size && !compact) out.push(`<span class="mm-chip mm-chip--size">${esc(f.size.label || '')}${f.size.mult ? ` ×${(+f.size.mult).toFixed(1)}` : ''}</span>`);
    return out.join('');
  }
  function starsHTML(n, max = 5) {
    let s = '';
    for (let i = 1; i <= max; i++) s += icon(i <= n ? 'star' : 'star_empty', 1);
    return `<span class="mm-stars">${s}</span>`;
  }
  function traitsHTML(f, compact) {
    if (!f.traits?.length) return `<span class="mm-none">No traits</span>`;
    return f.traits.map((t) => `<span class="mm-trait${t.good === false ? ' mm-bad' : ''}" title="${esc(t.name)}">${icon(t.icon, 1)}${compact ? '' : `<i>${esc(t.name)}</i>`}</span>`).join('');
  }
  function fedHTML(f) {
    const v = clamp(Number(f.fed) || 0, 0, 1), n = Math.round(v * 8);
    const col = v < 0.34 ? 'lo' : v < 0.67 ? 'mid' : 'hi';
    let seg = '';
    for (let i = 0; i < 8; i++) seg += `<i class="${i < n ? 'on' : ''}"></i>`;
    return `<span class="mm-fed mm-fed--${col}" title="Fed ${Math.round(v * 100)}%">${icon('food', 1)}<span class="mm-fedbar">${seg}</span></span>`;
  }

  function renderSlot(sex) {
    flush(sex);
    const el = slotEl[sex], f = pair[sex] ? byId().get(pair[sex]) : null;
    el.classList.toggle('mm-active', active === sex);
    el.classList.toggle('mm-filled', !!f);
    const lbl = sex === 'F' ? 'Mum' : 'Dad';
    if (!f) {
      el.innerHTML = `
        <div class="mm-prof mm-prof--empty">
          <span class="mm-tab">${sexGlyph(sex)}<b>${lbl}</b></span>
          <div class="mm-pol mm-pol--ghost"><div class="mm-por"><span class="mm-who">?</span></div><span class="mm-rar">${glyphSVG('H', 2, 'mm-ghosth')}</span></div>
          <div class="mm-hint">${sex === 'F' ? 'Pin a lady' : 'Pin a gent'}</div>
          <div class="mm-hint2">${sexGlyph(sex)}<span>Pick one below</span></div>
        </div>`;
    } else {
      const rar = RAR[clamp(f.rarity | 0, 0, 4)];
      const w = why(f);
      el.innerHTML = `
        <div class="mm-prof" style="--rc:${rar.c}">
          ${deco('pushpin', { cls: 'mm-pin', px: 2 })}
          <span class="mm-tab">${sexGlyph(sex)}<b>${lbl}</b></span>
          <button type="button" class="mm-unpin" aria-label="Unpin">${glyphSVG('X', 2)}</button>
          <div class="mm-pol"><div class="mm-por"></div><span class="mm-rar">${esc(rar.name)}</span></div>
          <div class="mm-nm">${esc(f.name || f.speciesName)}</div>
          <div class="mm-sp">${esc(f.speciesName || '')}</div>
          ${starsHTML(f.stars | 0)}
          <div class="mm-chips">${chipsHTML(f)}</div>
          <div class="mm-traits">${traitsHTML(f)}</div>
          <div class="mm-fedrow"><span class="mm-fedl">Fed</span>${fedHTML(f)}</div>
          ${w ? `<div class="mm-nr">${stamp('Not ready', '#b8283c', -6, { anim: false })}<span>${esc(w)}</span></div>` : ''}
        </div>`;
      const por = el.querySelector('.mm-por');
      por.appendChild(portrait(f, por.clientWidth - 12 || 160, por.clientHeight - 10 || 80));
      el.querySelector('.mm-unpin').addEventListener('click', (e) => { e.stopPropagation(); sfx('paper', { pitch: 1.2 }); pair[sex] = null; active = sex; renderAll(); });
    }
    if (!f) {
      // "who's that fish?" silhouette from the best candidate of this sex
      const cand = fish.filter((x) => x.sex === sex).sort((a, b) => (b.ready - a.ready) || (b.stars - a.stars))[0];
      const por = el.querySelector('.mm-por');
      if (cand) { const c = portrait(cand, por.clientWidth - 30 || 150, por.clientHeight - 30 || 80); c.classList.add('mm-sil'); por.prepend(c); }
    }
    const prof = el.querySelector('.mm-prof');
    scoped[sex].push(skin(prof, f ? 'parchment' : 'cream', f ? { edge: 0.45, edgeW: 5, seed: sex === 'F' ? 41 : 43, stains: f.ready ? 0 : 1 } : { edge: 0.2, seed: 47 }));
  }
  for (const sex of ['F', 'M']) {
    slotEl[sex].addEventListener('click', () => { if (active !== sex) { active = sex; sfx('click'); renderAll(); } });
  }

  // ---------------------------------------------------------------- picker
  function renderPicker() {
    const list = fish.filter((f) => f.sex === active).sort((a, b) => (b.ready - a.ready) || (b.stars - a.stars) || (b.rarity - a.rarity));
    ov.querySelectorAll('.mm-ptab').forEach((t) => {
      const s = t.dataset.sex;
      t.classList.toggle('on', s === active);
      t.querySelector('.mm-pn').textContent = fish.filter((f) => f.sex === s).length;
    });
    flush('pick');
    prow.innerHTML = '';
    if (!list.length) {
      prow.innerHTML = `<div class="mm-empty">${active === 'F' ? 'No lady fish in the pond yet.' : 'No gentleman fish in the pond yet.'}</div>`;
      return;
    }
    list.forEach((f, i) => {
      const rar = RAR[clamp(f.rarity | 0, 0, 4)];
      const w = why(f);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mm-card${pair[active] === f.id ? ' mm-sel' : ''}${w ? ' mm-nready' : ''}`;
      b.style.setProperty('--r', `${((i * 37) % 7 - 3) * 0.6}deg`);
      b.style.setProperty('--rc', rar.c);
      b.dataset.id = f.id;
      b.innerHTML = `
        ${deco('pushpin', { cls: 'mm-cpin', px: 1 })}
        <div class="mm-cpor"></div>
        <div class="mm-cnm"><span>${esc(f.name || f.speciesName)}</span></div>
        ${starsHTML(f.stars | 0)}
        <div class="mm-chips">${chipsHTML(f, true)}</div>
        <div class="mm-crow"><span class="mm-csz">${esc(f.size?.label || '')}</span><span class="mm-traits">${traitsHTML(f, true)}</span></div>
        ${fedHTML(f)}
        ${w ? `<div class="mm-cwhy">${esc(w)}</div>` : ''}
        ${pair[active] === f.id ? `<span class="mm-cstamp">${stamp('Pinned', '#b8283c', -12, { anim: false })}</span>` : ''}`;
      b.querySelector('.mm-cpor').appendChild(portrait(f, 128, 44));
      b.addEventListener('click', () => pick(f.id));
      prow.appendChild(b);
      scoped.pick.push(skin(b, 'postcard', { edge: 0.3, edgeW: 3, seed: 51 + (i % 3) }));
    });
  }
  ov.querySelectorAll('.mm-ptab').forEach((t) => t.addEventListener('click', () => { if (active !== t.dataset.sex) { active = t.dataset.sex; sfx('page'); renderAll(); prow.scrollLeft = 0; } }));
  // mouse wheel scrolls the strip sideways
  prow.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { prow.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

  function pick(id) {
    const f = byId().get(id);
    if (!f) return;
    const sex = f.sex === 'M' ? 'M' : 'F';
    if (pair[sex] === id) return;
    pair[sex] = id;
    sfx('pop_in', { pitch: sex === 'F' ? 1.15 : 0.95 });
    // hop to the other slot if it is still empty
    const other = sex === 'F' ? 'M' : 'F';
    active = pair[other] ? sex : other;
    renderAll(sex);
  }

  // ---------------------------------------------------------------- report
  let meter = null; // { cv, p, target, raf }
  let lastPred = null;
  function renderReport() {
    const mumId = pair.F, dadId = pair.M;
    stopMeter();
    let pred = null;
    if (mumId && dadId) {
      try { pred = o.predict?.(mumId, dadId) || null; } catch (e) { console.error(e); pred = { ok: false, why: 'Something went wrong' }; }
    }
    lastPred = pred;
    const head = `<div class="mm-rhead"><span class="mm-hpin">${icon('heart', 2)}</span><span>Match report</span></div>`;
    let body = '', ok = false;
    if (!pred) {
      const need = !mumId && !dadId ? 'Pin a mum and a dad' : !mumId ? 'Now pin a mum' : 'Now pin a dad';
      body = `
        <div class="mm-wait">
          <div class="mm-heart mm-heart--idle"><canvas width="${HW}" height="${HH}"></canvas><b class="mm-hpct">?</b></div>
          <div class="mm-wtxt">${handwriting(need, { color: '#9c2a48' })}</div>
          <div class="mm-wsub">See the baby's odds before the date.</div>
        </div>`;
    } else if (!pred.ok) {
      body = `
        <div class="mm-wait mm-no">
          <div class="mm-broken">${icon('heart_broken', 4)}</div>
          ${stamp('No match', '#b8283c', -7)}
          <div class="mm-wtxt">${handwriting(pred.why || 'They are not compatible', { color: '#9c2a48' })}</div>
        </div>`;
    } else {
      ok = true;
      body = predHTML(pred);
    }
    const go = `<div class="mm-rfoot"><button type="button" class="mm-go"${ok ? '' : ' disabled'}>${icon('heart', 1)}<span>Arrange the date</span>${icon('heart', 1)}</button></div>`;
    report.innerHTML = `${head}<div class="mm-rbody">${body}</div>${go}<div class="mm-res"></div>`;
    const cv = report.querySelector('.mm-heart canvas');
    if (cv) startMeter(cv, ok ? clamp(Number(pred.perfect) || 0, 0, 1) : 0, ok && pred.perfect >= 0.999);
    report.querySelector('.mm-go').addEventListener('click', arrange);
    if (ok && !REDUCED()) {
      report.querySelectorAll('.mm-bar i').forEach((b, i) => anim(b, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.12)', offset: 0.7 }, { transform: 'scaleY(1)' }], { duration: 420, delay: 120 + i * 60, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' }));
      report.querySelectorAll('.mm-pchip').forEach((b, i) => anim(b, [{ transform: 'scale(0) rotate(-12deg)' }, { transform: 'scale(1)' }], { duration: 320, delay: 300 + i * 40, easing: 'cubic-bezier(.3,1.6,.5,1)', fill: 'backwards' }));
    }
  }

  function predHTML(p) {
    const st = (p.stars || []).slice(0, 5);
    while (st.length < 5) st.push(0);
    const mx = Math.max(0.0001, ...st);
    const best = st.indexOf(mx);
    const exp = st.reduce((a, v, i) => a + v * (i + 1), 0) / Math.max(0.0001, st.reduce((a, v) => a + v, 0));
    const eggR = RAR[clamp(Math.round(exp) - 1, 0, 4)].id;
    const bars = st.map((v, i) => `
      <div class="mm-bar${i === best ? ' mm-best' : ''}${i === 4 ? ' mm-five' : ''}">
        <b>${pct(v)}</b><span class="mm-btrack"><i style="height:${Math.max(v > 0 ? 6 : 0, Math.round((v / mx) * 100))}%"></i></span><em>${i + 1}${icon('star', 1)}</em>
      </div>`).join('');
    const top = (arr, n) => (arr || []).slice().sort((a, b) => b.p - a.p).filter((x) => x.p > 0).slice(0, n);
    const morphs = top(p.morphs, 3).map((m) => `<span class="mm-pchip${m.id !== 'normal' ? ' mm-chip--fancy' : ''}">${esc(m.name)}<b>${pct(m.p)}</b></span>`).join('') || '<span class="mm-none">Wild type</span>';
    const muts = top(p.muts, 3).map((m) => `<span class="mm-pchip mm-chip--mut" style="--c:${esc(m.color || '#ffd040')}">${esc(m.name)}<b>${pct(m.p)}</b></span>`).join('') || '<span class="mm-none">None likely</span>';
    const traits = top(p.traits, 4).map((t) => `<span class="mm-ptrait${t.good === false ? ' mm-bad' : ''}">${icon(t.icon, 1)}<i>${esc(t.name)}</i><b>${pct(t.p)}</b></span>`).join('') || '<span class="mm-none">No traits passed on</span>';
    // size ruler: map the multiplier onto a fixed scale so pairs are comparable
    const sz = p.size || {};
    const lo = Math.min(0.5, sz.min ?? 1), hi = Math.max(2, sz.max ?? 1);
    const at = (v) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
    const a = at(sz.min ?? 1), b2 = at(sz.max ?? 1), av = at(sz.avg ?? ((sz.min ?? 1) + (sz.max ?? 1)) / 2);
    const nums = sz.min != null ? `×${(+sz.min).toFixed(1)}–${(+sz.max).toFixed(1)}` : '';
    return `
      <div class="mm-baby">
        <div class="mm-lcol">
          <div class="mm-heart"><canvas width="${HW}" height="${HH}"></canvas><b class="mm-hpct">${pct(p.perfect)}</b></div>
          <div class="mm-hlbl">Perfect genes</div>
          <div class="mm-egg mm-egg--${eggR}">${icon(`egg_${eggR}_0`, 3)}<span class="mm-eggq">?</span></div>
          ${p.hybrid ? `<div class="mm-hyb" title="Hybrid! The baby will be a ${esc(p.hybrid.speciesName)}">${icon('dna', 1)}<span><i>Hybrid!</i><b>${esc(p.hybrid.speciesName)}</b></span></div>` : ''}
        </div>
        <div class="mm-rcol">
          <div class="mm-sec mm-sec--row mm-sec--stars"><h4>Baby<br>stars</h4><div class="mm-bars">${bars}</div></div>
          <div class="mm-sec mm-sec--row"><h4>Colour</h4><div class="mm-pchips">${morphs}</div></div>
          <div class="mm-sec mm-sec--row"><h4>Mutation</h4><div class="mm-pchips">${muts}</div></div>
          <div class="mm-sec mm-sec--row"><h4>Size</h4>
            <div class="mm-ruler"><span class="mm-rtrack"><i class="mm-rrange" style="left:${a}%;width:${Math.max(2, b2 - a)}%"></i><i class="mm-ravg" style="left:${av}%"></i></span><span class="mm-rlbl"><b>${esc(sz.label || '')}</b> <i>${nums}</i></span></div>
          </div>
          <div class="mm-sec mm-sec--row"><h4>Traits</h4><div class="mm-pchips">${traits}</div></div>
        </div>
      </div>`;
  }

  function startMeter(cv, target, gold) {
    // time based (not per-frame) so it lands on the value even at a low frame rate
    const m = { cv, target, gold, raf: 0, t0: performance.now() };
    meter = m;
    const DUR = 900;
    const tick = () => {
      if (meter !== m || closed) return;
      const el = performance.now() - m.t0, k = Math.min(1, el / DUR);
      const e = 1 - Math.pow(1 - k, 3) * Math.cos(k * 4) ; // ease out with a little slosh
      drawHeart(cv, clamp(target * e, 0, 1), el / 1000, gold);
      m.raf = requestAnimationFrame(tick);
    };
    if (REDUCED()) { drawHeart(cv, target, 0, gold); return; }
    drawHeart(cv, 0, 0, gold);
    m.raf = requestAnimationFrame(tick);
    if (target > 0) setTimeout(() => { if (meter === m) sfx('heartbeat', { volume: 0.4 + target * 0.4 }); }, 180);
  }
  function stopMeter() { if (meter) cancelAnimationFrame(meter.raf); meter = null; }

  // ---------------------------------------------------------------- arrange
  let resT = 0;
  function arrange(e) {
    e?.stopPropagation();
    if (!pair.F || !pair.M || !lastPred?.ok) { sfx('error'); return; }
    let res = null;
    try { res = o.onArrange?.(pair.F, pair.M) || { ok: true, msg: '' }; } catch (err) { console.error(err); res = { ok: false, msg: 'Something went wrong' }; }
    const box = report.querySelector('.mm-res');
    clearTimeout(resT);
    box.innerHTML = `<div class="mm-resin">${stamp(res.ok ? 'Date booked!' : 'No dice', res.ok ? '#c0304a' : '#5a4632', res.ok ? -9 : 7, { cls: 'mm-bigstamp' })}${res.msg ? `<div class="mm-rmsg">${handwriting(res.msg, { color: res.ok ? '#9c2a48' : '#3b2414', delay: 260, speed: 1.6 })}</div>` : ''}</div>`;
    box.classList.add('on');
    setTimeout(() => sfx('stamp'), 140);
    if (res.ok) {
      sfx('heart');
      setTimeout(() => sfx('heart', { pitch: 1.25 }), 220);
      const btn = report.querySelector('.mm-go');
      burst(btn, 16);
      const ht = report.querySelector('.mm-heart');
      if (ht) burst(ht, 10);
      anim(ht, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(.92)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 600 });
    } else {
      sfx('error');
      anim(report, [{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320 });
    }
    resT = setTimeout(() => {
      const box = report.querySelector('.mm-res');
      const inn = box?.querySelector('.mm-resin');
      if (!inn) return;
      const a = anim(inn, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 380, fill: 'forwards' });
      const done = () => { box.classList.remove('on'); box.innerHTML = ''; };
      if (a) a.onfinish = done; else done();
    }, 3200);
  }

  // hearts + sparkles fly out of an element
  function burst(el, n) {
    if (!el || REDUCED()) return;
    const cr = cork.getBoundingClientRect(), r = el.getBoundingClientRect();
    const ox = r.left - cr.left + r.width / 2, oy = r.top - cr.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'mm-pt';
      const kind = i % 4 === 3 ? 'sparkle' : 'heart';
      s.innerHTML = icon(kind, R() < 0.35 ? 2 : 1);
      s.style.left = `${ox}px`; s.style.top = `${oy}px`;
      fx.appendChild(s);
      const a = -Math.PI / 2 + (R() * 2 - 1) * 1.25, v = 120 + R() * 170;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v, rot = (R() * 2 - 1) * 50;
      const kf = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        kf.push({ transform: `translate(-50%,-50%) translate(${(dx * t).toFixed(1)}px, ${(dy * t + 260 * t * t).toFixed(1)}px) rotate(${(rot * t).toFixed(1)}deg) scale(${(k === 0 ? 0.3 : 1 - t * 0.35).toFixed(2)})`, opacity: t > 0.75 ? (1 - t) * 4 : 1 });
      }
      const an = anim(s, kf, { duration: 900 + R() * 400, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      if (an) an.onfinish = () => s.remove(); else setTimeout(() => s.remove(), 1200);
    }
  }

  // ---------------------------------------------------------------- yarn
  // red string from each pinned profile's pin to the heart, sagging a little
  function layoutYarn() {
    if (closed) return;
    const cr = cork.getBoundingClientRect();
    yarn.setAttribute('width', cr.width); yarn.setAttribute('height', cr.height);
    yarn.setAttribute('viewBox', `0 0 ${Math.round(cr.width)} ${Math.round(cr.height)}`);
    const ht = report.querySelector('.mm-hpin');
    if (!ht) { yarn.innerHTML = ''; return; }
    const hr = ht.getBoundingClientRect();
    const hx = hr.left - cr.left + hr.width / 2, hy = hr.top - cr.top + hr.height * 0.45;
    let d = '';
    for (const sex of ['F', 'M']) {
      const pin = slotEl[sex].querySelector('.mm-pin');
      if (!pin) continue;
      const pr = pin.getBoundingClientRect();
      const px = pr.left - cr.left + pr.width * 0.42, py = pr.top - cr.top + pr.height * 0.45;
      const mx = (px + hx) / 2, my = Math.max(py, hy) + 26;
      d += `M${px.toFixed(0)} ${py.toFixed(0)} Q${mx.toFixed(0)} ${my.toFixed(0)} ${hx.toFixed(0)} ${hy.toFixed(0)}`;
    }
    yarn.innerHTML = d ? `<path d="${d}" class="mm-ys"/><path d="${d}" class="mm-y"/><path d="${d}" class="mm-yh"/>` : '';
  }
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => requestAnimationFrame(layoutYarn)); ro.observe(cork); }

  // ---------------------------------------------------------------- render
  function renderAll(dropped) {
    renderSlot('F'); renderSlot('M');
    renderPicker();
    renderReport();
    if (dropped && !REDUCED()) {
      const prof = slotEl[dropped].querySelector('.mm-prof');
      const s = dropped === 'F' ? -1 : 1;
      anim(prof, [
        { transform: `translateY(-40px) rotate(${s * -8}deg) scale(1.08)`, opacity: 0 },
        { transform: `translateY(6px) rotate(${s * 2}deg) scale(.98, 1.02)`, opacity: 1, offset: 0.6 },
        { transform: 'none' },
      ], { duration: 420, easing: 'cubic-bezier(.3,1.3,.5,1)' });
      setTimeout(() => sfx('paper', { pitch: 1.1 }), 200);
    }
    requestAnimationFrame(layoutYarn);
    setTimeout(layoutYarn, 450);
  }

  // preselect
  if (o.preselect != null) {
    const f = byId().get(o.preselect);
    if (f) { const sex = f.sex === 'M' ? 'M' : 'F'; pair[sex] = f.id; active = sex === 'F' ? 'M' : 'F'; }
  }
  renderAll();

  // ---------------------------------------------------------------- open / close
  sfx('paper', { pitch: 0.9 });
  requestAnimationFrame(() => ov.classList.add('mm-on'));
  if (!REDUCED()) {
    anim(board, [
      { transform: 'translateY(100vh) rotate(6deg)' },
      { transform: 'translateY(-14px) rotate(-1.2deg)', offset: 0.62 },
      { transform: 'translateY(4px) rotate(.5deg)', offset: 0.8 },
      { transform: 'none' },
    ], { duration: 640, easing: 'cubic-bezier(.25,.9,.35,1)' });
    anim(ov.querySelector('.mm-cupid'), [{ transform: 'rotate(-14deg) scale(2.4)', opacity: 0 }, { transform: 'rotate(-14deg) scale(.94)', opacity: 0.9, offset: 0.7 }, { transform: 'rotate(-14deg) scale(1)', opacity: 0.85 }], { duration: 360, delay: 620, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'backwards' });
    setTimeout(() => { if (!closed) sfx('stamp', { volume: 0.5 }); }, 700);
    setTimeout(layoutYarn, 680); // the board was moving while the string was first laid out
  }

  const onKey = (e) => { if (e.key === 'Escape' && !closed) { e.preventDefault(); e.stopImmediatePropagation(); api.close(); } };
  window.addEventListener('keydown', onKey, true);
  ov.querySelector('.mm-x').addEventListener('click', (e) => { e.stopPropagation(); sfx('click'); api.close(); });
  ov.querySelector('.mm-dim').addEventListener('click', () => api.close());
  ov.querySelector('.mm-stage').addEventListener('click', (e) => { if (e.target === e.currentTarget) api.close(); });

  const api = {
    el: ov,
    async close() {
      if (closed) return;
      closed = true;
      stopMeter();
      clearTimeout(resT);
      window.removeEventListener('keydown', onKey, true);
      ov.classList.add('mm-closing');
      sfx('whoosh', { volume: 0.45 });
      if (!REDUCED()) {
        const a = anim(board, [{ transform: 'none' }, { transform: 'translateY(-16px) rotate(-1deg)', offset: 0.25 }, { transform: 'translateY(105vh) rotate(5deg)' }], { duration: 420, easing: 'cubic-bezier(.5,0,.85,.4)', fill: 'forwards' });
        if (a) await Promise.race([a.finished.catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
      }
      if (ro) ro.disconnect();
      cleanups.forEach((f) => { try { f(); } catch { /* */ } });
      ['F', 'M', 'pick'].forEach(flush);
      ov.remove();
      try { o.onClose?.(); } catch (e) { console.error(e); }
    },
    refresh(newFish) {
      if (closed) return;
      if (Array.isArray(newFish)) fish = newFish.slice();
      const m = byId();
      for (const s of ['F', 'M']) if (pair[s] && !m.has(pair[s])) pair[s] = null;
      // keep the result stamp up across a refresh triggered by onArrange
      const res = report.querySelector('.mm-res');
      const keep = res && res.classList.contains('on') ? res.innerHTML : '';
      const sl = prow.scrollLeft;
      renderAll();
      prow.scrollLeft = sl;
      if (keep) { const r2 = report.querySelector('.mm-res'); r2.innerHTML = keep; r2.classList.add('on'); r2.querySelectorAll('.pp-stamp--in,.pp-hw').forEach((x) => { x.style.animation = 'none'; x.style.clipPath = 'none'; }); }
    },
  };
  return api;
}
