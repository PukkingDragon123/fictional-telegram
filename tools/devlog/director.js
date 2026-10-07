// Devlog director: plays one day's timeline (days.js) at 1080x1920 for TikTok / Reels.
// Background: recorded clips (tools/video/clips/<name>/fNNNN.jpg) with zooms, wipes and
// splits. On top, the stuff a person adds in a phone editor: the white-box hook, outlined
// captions, red handwriting with arrows and circles, a notebook page being drawn, a code
// editor typing, debug overlays (stats box, HUD, a little tweak panel), stickers, an end card.
// Runs under virtual time (tools/video/vtime.js); render.mjs calls __dir.frame(i) and
// screenshots. Every overlay is driven from frame time, so frames are reproducible.
// All sounds go to window.__audioLog (seconds) and are mixed offline (tools/video/mix.js).
import { DAYS, FPS } from './days.js';
import { buildPage } from './doodles.js';
import { SNIPPETS } from './snippets.js';

const Q = new URLSearchParams(location.search);
const D = DAYS[Q.get('day') || 'day01'];
const W = 1080, H = 1920;
const bg = document.getElementById('bg');
const g = bg.getContext('2d');
const ui = document.getElementById('ui');

// ---------------------------------------------------------------- sound log
const LOG = (window.__audioLog = []);
let T = 0;
const sfx = (name, o = {}) => LOG.push({ t: +(T + (o.delay || 0)).toFixed(4), kind: 'sfx', name, volume: o.volume ?? 0.45, pitch: o.pitch ?? 1 });

// ---------------------------------------------------------------- easing
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const backOut = (u) => { u = clamp01(u); const c = 1.7; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
// value along [[t, v], ...] keys (eased between keys)
function keyed(keys, t) {
  if (!Array.isArray(keys[0])) return keys;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t < t1) {
      const u = ease((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((v, k) => lerp(v, v1[k], u)) : lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------------- clip frames
const cache = new Map();
function img(src) {
  let p = cache.get(src);
  if (!p) {
    p = new Promise((res) => { const i = new Image(); i.onload = () => i.decode().then(() => res(i), () => res(i)); i.onerror = () => res(null); i.src = src; });
    cache.set(src, p);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
  }
  return p;
}
const frameURL = (clip, k) => `../video/clips/${clip}/f${String(k).padStart(4, '0')}.jpg`;
const META = {};
const clipsUsed = new Set();
const collect = (s) => { if (!s) return; if (s.clip) clipsUsed.add(s.clip); if (s.a) collect(s.a); if (s.b) collect(s.b); for (const q of s.stack || []) collect(q); };
D.shots.forEach(collect);
const metaReady = Promise.all([...clipsUsed].map((c) => fetch(`../video/clips/${c}/meta.json`).then((r) => r.json()).then((m) => { META[c] = m; }).catch(() => { console.error('no meta', c); })));

// which frame of a clip a shot shows at video time t
function frameOf(s, t) {
  const m = META[s.clip];
  const n = m ? m.frames : 1e9;
  let k = s.still != null ? s.still : Math.floor((s.from || 0) + (t - s.at) * FPS * (s.speed ?? 1));
  if (s.loop && k >= n) k = (s.from || 0) + ((k - (s.from || 0)) % (n - (s.from || 0)));
  return Math.max(0, Math.min(n - 1, k));
}
// cover-fit + zoom + pan of an iw x ih frame into rect r
function xform(s, t, r, iw = 1080, ih = 1920) {
  const u = (t - s.at) / s.dur;
  // zoom: [z0, z1] across the shot, or keys [[t, z], ...]; pan: [[x0, y0], [x1, y1]] or keys [[t, [x, y]], ...]
  let z = typeof s.zoom === 'number' ? s.zoom : s.zoom ? (Array.isArray(s.zoom[0]) ? keyed(s.zoom, t - s.at) : lerp(s.zoom[0], s.zoom[1], ease(u))) : 1;
  if (s.punch) z *= 1 + s.punch * (1 - ease((t - s.at) / 0.28));
  let p = [0.5, 0.5];
  if (s.pan) p = Array.isArray(s.pan[0][1]) ? keyed(s.pan, t - s.at) : [lerp(s.pan[0][0], s.pan[1][0], ease(u)), lerp(s.pan[0][1], s.pan[1][1], ease(u))];
  const base = Math.max(r.w / iw, r.h / ih) * z;
  const dw = iw * base, dh = ih * base;
  return { x: r.x + (r.w - dw) * p[0], y: r.y + (r.h - dh) * p[1], s: base, dw, dh };
}
const FULL = { x: 0, y: 0, w: W, h: H };
async function drawClip(s, t, r = FULL) {
  if (s.color) { g.fillStyle = s.color; g.fillRect(r.x, r.y, r.w, r.h); return; }
  const im = await img(frameURL(s.clip, frameOf(s, t)));
  if (!im) return;
  const X = xform(s, t, r, im.naturalWidth, im.naturalHeight);
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  if (s.blur) g.filter = `blur(${s.blur}px)`;
  g.drawImage(im, X.x, X.y, X.dw, X.dh);
  g.filter = 'none';
  if (s.dim) { g.fillStyle = `rgba(10,8,16,${s.dim})`; g.fillRect(r.x, r.y, r.w, r.h); }
  g.restore();
}
async function drawShot(s, t) {
  const fade = s.fade ? clamp01((t - s.at) / s.fade) : 1;
  g.globalAlpha = fade;
  if (s.wipe) {
    // A full, B to the right of the divider (both share the shot clock)
    const A = { ...s.a, at: s.at, dur: s.dur }, B = { ...s.b, at: s.at, dur: s.dur };
    const x = keyed(s.x, t - s.at);
    await drawClip(A, t);
    g.save(); g.beginPath(); g.rect(x, 0, W - x, H); g.clip();
    await drawClip(B, t);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 7, 0, 14, H);
    g.fillStyle = '#fff'; g.fillRect(x - 4, 0, 8, H);
  } else if (s.stack) {
    const gap = s.gap ?? 12, hh = (H - gap) / 2;
    g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, W, H);
    await drawClip({ ...s.stack[0], at: s.at, dur: s.dur }, t, { x: 0, y: 0, w: W, h: hh });
    await drawClip({ ...s.stack[1], at: s.at, dur: s.dur }, t, { x: 0, y: hh + gap, w: W, h: hh });
  } else await drawClip(s, t);
  g.globalAlpha = 1;
}
const live = (t) => D.shots.filter((s) => t >= s.at && t < s.at + s.dur);
// the main (topmost plain) shot's per-frame meta: anchors in screen space, hud values
function mainShot(t) { const l = live(t).filter((s) => s.clip); return l[l.length - 1]; }
function anchor(name, t) {
  const s = mainShot(t);
  const m = s && META[s.clip];
  const a = m?.anchors?.[frameOf(s, t)]?.[name];
  if (!a) return null;
  const X = xform(s, t, FULL);
  return [X.x + a[0] * X.s, X.y + a[1] * X.s];
}
function hudVal(t) { const s = mainShot(t); const m = s && META[s.clip]; return m?.anchors?.[frameOf(s, t)]?._hud || {}; }

// ---------------------------------------------------------------- overlays
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, cls, parent = ui) => { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; };
function pop(e, lt, dur, { inT = 0.2, outT = 0.16, from = 0.55, base = '', rot = 0 } = {}) {
  let k = 1, o = 1;
  if (lt < inT) { const u = lt / inT; k = from + (1 - from) * backOut(u); o = clamp01(u * 3); }
  if (dur != null && lt > dur - outT) { const u = clamp01((lt - (dur - outT)) / outT); o *= 1 - u; k *= 1 - 0.1 * u; }
  e.style.opacity = o;
  e.style.transform = `${base} rotate(${rot}deg) scale(${k})`;
}
const OV = [];
const add = (o) => { OV.push(o); return o; };

// a hand-drawn stroke path with a white under-stroke, drawn on over `draw` seconds
function inkPath(svg, color = '#ff2d55', w = 9) {
  const under = document.createElementNS(NS, 'path'), top = document.createElementNS(NS, 'path');
  for (const [p, c, sw] of [[under, '#fff', w + 8], [top, color, w]]) {
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', c); p.setAttribute('stroke-width', sw);
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('pathLength', '1'); p.setAttribute('stroke-dasharray', '1 1'); p.setAttribute('stroke-dashoffset', '1');
    svg.appendChild(p);
  }
  return { set(d, u) { for (const p of [under, top]) { p.setAttribute('d', d); p.setAttribute('stroke-dashoffset', String(1 - clamp01(u))); } } };
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function wobblyEllipse(cx, cy, rx, ry) {
  const a0 = rnd() * 6.28, pts = [];
  for (let i = 0; i <= 26; i++) {
    const a = a0 + (i / 22) * Math.PI * 2, w = 1 + (rnd() - 0.5) * 0.06 + i * 0.004;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return 'M' + pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L');
}
function arrowPath(x1, y1, x2, y2, bend = 0.22) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const mx = (x1 + x2) / 2 + nx * L * bend, my = (y1 + y2) / 2 + ny * L * bend;
  const a = Math.atan2(y2 - my, x2 - mx), h = 34;
  const h1 = [x2 - Math.cos(a - 0.55) * h, y2 - Math.sin(a - 0.55) * h], h2 = [x2 - Math.cos(a + 0.55) * h, y2 - Math.sin(a + 0.55) * h];
  return { body: `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`, head: `M${h1[0].toFixed(1)},${h1[1].toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${h2[0].toFixed(1)},${h2[1].toFixed(1)}` };
}

const H_ = {
  hook(c) {
    const e = el('div', 'hook');
    e.innerHTML = c.hook.split('\n').map((l) => `<div>${l}</div>`).join('');
    return { e, update(lt) { if (c.instant && lt < 0.2) { e.style.opacity = 1; e.style.transform = 'translateX(-50%)'; return; } pop(e, lt, c.dur, { base: 'translateX(-50%)', from: 0.7 }); } };
  },
  badge(c) {
    const e = el('div', 'badge');
    e.textContent = c.badge;
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.4 }); } };
  },
  cap(c) {
    const e = el('div', 'cap' + (c.style ? ' ' + c.style : ''));
    e.innerHTML = c.cap.replace(/\n/g, '<br>');
    e.style.top = (c.y ?? 1250) + 'px';
    if (c.pop !== false) sfx('pop_in', { volume: 0.16, pitch: 1.5 });
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.6, rot: c.rot || 0 }); } };
  },
  note(c) {
    // red handwriting + an arrow to a point (or a clip anchor that moves)
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ink');
    ui.appendChild(svg);
    const arr = c.to || c.anchor ? [inkPath(svg), inkPath(svg)] : null;
    const e = el('div', 'note' + (c.dark ? ' dark' : ''));
    e.textContent = c.note;
    e.style.left = c.x + 'px'; e.style.top = c.y + 'px';
    if (c.size) e.style.fontSize = c.size + 'px';
    sfx('pen', { volume: 0.22 });
    let last = null;
    return {
      e, svg,
      update(lt, t) {
        const w = clamp01(lt / (0.25 + c.note.length * 0.03));
        e.style.clipPath = `inset(-30px ${(1 - w) * 100}% -30px -30px)`;
        e.style.transform = `rotate(${c.rot ?? -4}deg)`;
        const out = c.dur != null && lt > c.dur - 0.18 ? clamp01((lt - (c.dur - 0.18)) / 0.18) : 0;
        e.style.opacity = svg.style.opacity = 1 - out;
        if (!arr) return;
        let tgt = c.to;
        if (c.anchor) { const a = anchor(c.anchor, t); if (a) last = [a[0] + (c.dx || 0), a[1] + (c.dy || 0)]; tgt = last; }
        if (!tgt) return;
        const r = e.getBoundingClientRect();
        const sx = c.from ? c.from[0] : r.left + r.width / 2, sy = c.from ? c.from[1] : (tgt[1] > r.top ? r.bottom + 6 : r.top - 6);
        const P = arrowPath(sx, sy, tgt[0], tgt[1], c.bend ?? 0.22);
        const u = clamp01((lt - 0.15) / 0.35);
        arr[0].set(P.body, u);
        arr[1].set(P.head, clamp01((lt - 0.5) / 0.12));
      },
      remove() { svg.remove(); },
    };
  },
  circle(c) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ink');
    ui.appendChild(svg);
    const ink = inkPath(svg, c.color || '#ff2d55', 10);
    const [rx, ry] = c.r || [120, 90];
    let d = null, last = null;
    sfx('pen', { volume: 0.2, pitch: 1.2 });
    return {
      svg,
      update(lt, t) {
        let p = Array.isArray(c.circle) ? c.circle : null;
        if (!p) { const a = anchor(c.circle, t); if (a) last = [a[0] + (c.dx || 0), a[1] + (c.dy || 0)]; p = last; }
        if (!p) return;
        if (!d || c.follow !== false) { seed = 7 + (c.seed || 0); d = wobblyEllipse(p[0], p[1], rx, ry); }
        ink.set(d, lt / 0.4);
        svg.style.opacity = c.dur != null && lt > c.dur - 0.18 ? 1 - clamp01((lt - (c.dur - 0.18)) / 0.18) : 1;
      },
      remove() { svg.remove(); },
    };
  },
  sketch(c) {
    const desk = el('div', 'desk');
    const paper = el('div', 'paper');
    for (const y of [140, 590, 1040]) { const h = el('div', 'hole', paper); h.style.top = y + 'px'; }
    const page = buildPage(c.sketch);
    paper.appendChild(page.svg);
    page.measure();
    const speed = page.total / (c.draw || page.total);
    const starts = page.starts().map((s) => s / speed);
    let nextPen = 0;
    return {
      e: paper, desk,
      update(lt) {
        page.update(lt * speed);
        while (nextPen < starts.length && starts[nextPen] <= lt) { if (nextPen % 2 === 0) sfx('pen', { volume: 0.18, pitch: 0.9 + (nextPen % 5) * 0.06 }); nextPen++; }
        const z = 1 + 0.05 * ease(lt / (c.dur || 4));
        paper.style.transform = `rotate(${c.rot ?? -1.6}deg) scale(${z})`;
        const out = c.dur != null && lt > c.dur - 0.2 ? clamp01((lt - (c.dur - 0.2)) / 0.2) : 0;
        paper.style.opacity = desk.style.opacity = 1 - out;
      },
      remove() { desk.remove(); },
    };
  },
  code(c) {
    const S = SNIPPETS[c.code];
    const e = el('div', 'code');
    e.style.top = (c.y ?? 520) + 'px';
    e.innerHTML = `<div class="bar"><i class="dot" style="background:#ff5f57"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><span class="tab">${S.file}</span></div><pre></pre>`;
    const pre = e.querySelector('pre');
    const total = S.lines.reduce((a, l) => a + l.reduce((b, tk) => b + tk[1].length, 0) + 1, 0);
    const cps = c.cps || total / (c.type || 2.6);
    let lastN = -1, tick = 0;
    return {
      e,
      update(lt) {
        pop(e, lt, c.dur, { from: 0.85 });
        const n = Math.floor(Math.max(0, lt - 0.25) * cps);
        if (n !== lastN) {
          let left = n, html = '';
          S.lines.forEach((l, i) => {
            if (left < 0) return;
            let row = `<span class="ln">${(S.start || 1) + i}</span>`;
            for (const [cls, txt] of l) {
              if (left <= 0) break;
              const part = txt.slice(0, left);
              left -= part.length;
              row += cls ? `<span class="${cls}">${esc(part)}</span>` : esc(part);
            }
            if (left >= 0) { html += row + (left === 0 || i === S.lines.length - 1 ? '<span class="cur"></span>' : '') + '\n'; left -= 1; }
          });
          pre.innerHTML = html;
          lastN = n;
        }
        if (n < total && lt - tick > 0.16) { tick = lt; sfx('typing', { volume: 0.2, pitch: 0.9 + ((n * 7) % 5) * 0.05 }); }
      },
    };
  },
  stats(c) {
    const e = el('div', 'stats');
    e.style.left = (c.x ?? 34) + 'px'; e.style.top = (c.y ?? 300) + 'px';
    e.innerHTML = '<div class="tx"></div><div class="gr"></div>';
    const tx = e.querySelector('.tx'), gr = e.querySelector('.gr');
    const bars = [];
    for (let i = 0; i < 40; i++) bars.push(el('i', null, gr));
    return {
      e,
      update(lt) {
        const k = Math.floor(lt * 4);
        const f = (i) => 57 + ((i * 7919 + (c.seed || 3)) % 5) - (c.low && i % 9 === 0 ? 14 : 0);
        tx.textContent = `${f(k)} FPS (${Math.min(f(k), 55)}-61)`;
        bars.forEach((b, i) => { b.style.height = `${(f(k + i - 40) / 61) * 100}%`; });
        e.style.opacity = c.dur != null && lt > c.dur - 0.1 ? 0 : 1;
      },
    };
  },
  hud(c) {
    const e = el('div', 'hud');
    e.style.top = (c.y ?? 430) + 'px';
    if (c.x != null) e.style.left = c.x + 'px';
    return {
      e,
      update(lt, t) {
        const v = hudVal(t);
        e.textContent = c.hud.map((k) => (typeof k === 'function' ? k(v, lt) : `${k}: ${v[k] ?? 0}`)).join('\n');
        e.style.opacity = c.dur != null && lt > c.dur - 0.1 ? 0 : 1;
      },
    };
  },
  clock(c) {
    const e = el('div', 'clock');
    let prev = null;
    return {
      e,
      update(lt, t) {
        const v = hudVal(t).clock || c.text || '4:59 PM';
        if (v !== prev) { e.textContent = v; if (prev) { e.style.background = '#ffe14a'; } prev = v; }
        pop(e, lt, c.dur, { base: 'translateX(-50%)', from: 0.6 });
        if (/5:00/.test(v)) e.style.background = lt % 0.5 < 0.25 ? '#ffe14a' : '#fff';
      },
    };
  },
  panel(c) {
    const P = c.panel;
    const e = el('div', 'panel');
    if (P.top != null) e.style.top = P.top + 'px';
    e.innerHTML = `<div class="ttl">${P.title || 'Controls'}</div>` + P.rows.map((r) => `<div class="row"><b>${r.label}</b>${r.dd != null ? '<span class="dd"></span>' : '<span class="sl"><i></i></span><span class="v"></span>'}</div>`).join('');
    const rows = [...e.querySelectorAll('.row')];
    return {
      e,
      update(lt, t) {
        pop(e, lt, c.dur, { from: 0.9 });
        P.rows.forEach((r, i) => {
          if (r.dd != null) { rows[i].querySelector('.dd').textContent = typeof r.dd === 'function' ? r.dd(hudVal(t), lt) : r.dd; return; }
          const v = typeof r.v === 'function' ? r.v(lt) : r.v;
          rows[i].querySelector('.sl i').style.width = `${clamp01((v - (r.min ?? 0)) / ((r.max ?? 1) - (r.min ?? 0))) * 100}%`;
          rows[i].querySelector('.v').textContent = v.toFixed(r.dp ?? 2);
        });
      },
    };
  },
  tag(c) {
    const e = el('div', 'tag' + (c.style ? ' ' + c.style : ''));
    e.textContent = c.tag;
    e.style.left = (c.x ?? 40) + 'px'; e.style.top = (c.y ?? 300) + 'px';
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.5, rot: c.rot || 0 }); } };
  },
  vxui(c) {
    const e = el('div', 'vxui');
    const cols = ['#e8833a', '#f4f1ea', '#6a3fa0', '#2a2333', '#f2c230', '#c0392b', '#4a2d1f', '#9aa3b3', '#ffb07a', '#3a2a5a'];
    e.innerHTML = `<div class="top">reynard.vox &nbsp;·&nbsp; voxel editor</div><div class="pal">${cols.map((cc, i) => `<i style="background:${cc}"${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div><div class="bot"></div>`;
    const bot = e.querySelector('.bot'), sw = [...e.querySelectorAll('.pal i')];
    return {
      e,
      update(lt, t) {
        const v = hudVal(t).voxels || 0;
        const layer = Math.min(36, Math.floor(v / 95));
        bot.textContent = v ? `layer ${layer} / 36   ·   voxels ${v.toLocaleString('en-US')}` : 'ready';
        const k = Math.floor(lt * 3.3) % sw.length;
        sw.forEach((s, i) => s.classList.toggle('on', i === [0, 0, 2, 2, 3, 0, 1, 4, 0, 5][k]));
        e.style.opacity = c.dur != null && lt > c.dur - 0.12 ? 0 : 1;
      },
    };
  },
  end(c) {
    const e = el('div', 'end');
    e.innerHTML = `<div class="bx"><div class="t1">${c.end[0]}</div>${c.end[1] ? `<div class="t2">${c.end[1]}</div>` : ''}</div>`;
    const bx = e.querySelector('.bx');
    sfx('pop_in', { volume: 0.4 });
    return { e, update(lt) { e.style.background = `rgba(8,8,12,${0.45 * clamp01(lt / 0.3)})`; pop(bx, lt, c.dur, { base: 'translateX(-50%)', from: 0.5 }); } };
  },
  flash(c) {
    const e = el('div', 'flash');
    return { e, update(lt) { e.style.opacity = 1 - clamp01(lt / c.flash); if (lt > c.flash) e.style.display = 'none'; } };
  },
  sticker(c) {
    const e = el('div', 'sticker');
    e.textContent = c.sticker;
    e.style.left = c.x + 'px'; e.style.top = c.y + 'px';
    if (c.size) e.style.fontSize = c.size + 'px';
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.2, rot: (c.rot || 0) + Math.sin(lt * 9) * 4 }); } };
  },
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---------------------------------------------------------------- cues
const fired = new Set();
function fire(t) {
  D.cues.forEach((c, i) => {
    if (fired.has(i) || t + 1e-6 < c.at) return;
    fired.add(i);
    if (c.sfx) sfx(c.sfx, c);
    if (c.music !== undefined) LOG.push({ t: c.at, kind: 'music', mood: c.music, fade: c.fade ?? 1.2, volume: c.volume ?? 0.55 });
    const kind = Object.keys(H_).find((k) => c[k] !== undefined);
    if (!kind) return;
    try {
      const o = H_[kind](c);
      o.c = c; o.t0 = c.at;
      if (o.e && c.z) o.e.style.zIndex = c.z;
      add(o);
    } catch (e) { console.error('cue', c, e); }
  });
}
function updateOverlays(t) {
  for (let i = OV.length - 1; i >= 0; i--) {
    const o = OV[i], lt = t - o.t0;
    if (o.c.dur != null && lt > o.c.dur) {
      o.e?.remove(); o.svg?.remove(); o.remove?.();
      OV.splice(i, 1);
      continue;
    }
    o.update(lt, t);
  }
}

// ---------------------------------------------------------------- driver
window.__dir = {
  length: Math.round(D.length * FPS),
  async frame(i) {
    const t = i / FPS;
    T = t;
    fire(t);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (const s of live(t)) await drawShot(s, t);
    // prefetch the next frame of every shot that is about to play
    for (const s of D.shots) if (s.clip && t + 0.4 >= s.at && t < s.at + s.dur) img(frameURL(s.clip, frameOf(s, t + 1 / FPS)));
    updateOverlays(t);
    window.__vt?.step(1000 / FPS);
  },
};
Promise.all([document.fonts.load("900 60px 'Nunito'"), document.fonts.load("800 48px 'Nunito'"), document.fonts.load("700 70px 'Caveat'"), document.fonts.load("500 30px 'JB Mono'"), document.fonts.load("60px 'Noto Color Emoji'"), metaReady])
  .then(() => { window.__ready = true; });
