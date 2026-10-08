// Devlog director: plays one day (days.js) at 1080x1920 for TikTok / Reels, timed to that day's
// voice-over (vo/<day>.json, made by vo.py). Background: recorded clips (tools/video/clips/<name>)
// with punch-ins, follow-zooms, wipes and splits. On top: captions synced word by word to the
// narration in the game's own pixel font, and pixel-art stickers (arrow, ring, tags, a comment
// reply, a HUD, the 5 PM clock, a pixel-by-pixel drawing of the banana fish, the end card).
// Runs under virtual time (tools/video/vtime.js): render.mjs calls __dir.frame(i) and screenshots.
// Every overlay is driven from frame time, so frames are reproducible. Sounds are logged to
// window.__audioLog (seconds) and mixed offline with the voice-over (render.mjs).
import { DAYS, FPS, voHelper } from './days.js';
import { iconURL } from '../../portfolio/icons.js';
import { fishCanvas } from '../../src/art/fishArt.js';
import { FoxHost } from './foxhost.js';

const Q = new URLSearchParams(location.search);
const DAY = Q.get('day') || 'day01';
const VO = await fetch(`./vo/${DAY}.json`).then((r) => r.json());
const V = voHelper(VO);
const D = DAYS[DAY](V);
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

// a shot longer than its clip: up to ~45% over, it plays a little slower to fit; beyond that it
// holds the last frame (xform pushes in slowly while it holds)
function fitSpeed(s) {
  if (s._fit != null) return s._fit;
  const m = META[s.clip], sp = s.speed ?? 1;
  if (!m || s.still != null || s.loop || !s.dur) return sp;
  const avail = m.frames - 1 - (s.from || 0), need = s.dur * FPS * sp;
  return (s._fit = need > avail && need <= avail * 1.45 ? avail / (s.dur * FPS) : sp);
}
function frameOf(s, t) {
  const m = META[s.clip];
  const n = m ? m.frames : 1e9;
  let k = s.still != null ? s.still : Math.floor((s.from || 0) + (t - s.at) * FPS * fitSpeed(s));
  if (s.loop && k >= n) k = (s.from || 0) + ((k - (s.from || 0)) % (n - (s.from || 0)));
  return Math.max(0, Math.min(n - 1, k));
}
const FULL = { x: 0, y: 0, w: W, h: H };
// cover-fit + zoom + pan (or keep a clip anchor centred: `focus`)
function xform(s, t, r = FULL, iw = 1080, ih = 1920) {
  const u = (t - s.at) / s.dur;
  let z = typeof s.zoom === 'number' ? s.zoom : s.zoom ? (Array.isArray(s.zoom[0]) ? keyed(s.zoom, t - s.at) : lerp(s.zoom[0], s.zoom[1], ease(u))) : 1;
  if (s.punch) z *= 1 + s.punch * (1 - ease((t - s.at) / 0.28));
  const mm = META[s.clip];
  if (mm && s.still == null && !s.loop) { const over = (s.from || 0) / FPS + (t - s.at) * fitSpeed(s) - (mm.frames - 1) / FPS; if (over > 0) z *= 1 + 0.035 * (over / fitSpeed(s)); }
  const base = Math.max(r.w / iw, r.h / ih) * z;
  const dw = iw * base, dh = ih * base;
  let p = [0.5, 0.5];
  if (s.pan) p = Array.isArray(s.pan[0][1]) ? keyed(s.pan, t - s.at) : [lerp(s.pan[0][0], s.pan[1][0], ease(u)), lerp(s.pan[0][1], s.pan[1][1], ease(u))];
  if (s.focus) {
    const a = rawAnchor(s, t, s.focus);
    if (a) {
      const fx = clamp01((r.w / 2 - a[0] * base) / (r.w - dw || -1)), fy = clamp01((r.h * (s.focusY ?? 0.45) - a[1] * base) / (r.h - dh || -1));
      const k = typeof s.focusK === 'number' ? s.focusK : 1;
      p = [lerp(p[0], fx, k), lerp(p[1], fy, k)];
      s._fp = s._fp ? [lerp(s._fp[0], p[0], 0.25), lerp(s._fp[1], p[1], 0.25)] : p;
      p = s._fp;
    }
  }
  return { x: r.x + (r.w - dw) * p[0], y: r.y + (r.h - dh) * p[1], s: base, dw, dh };
}
async function drawClip(s, t, r = FULL) {
  if (s.color) { g.fillStyle = s.color; g.fillRect(r.x, r.y, r.w, r.h); return; }
  const im = await img(frameURL(s.clip, frameOf(s, t)));
  if (!im) return;
  const X = xform(s, t, r, im.naturalWidth, im.naturalHeight);
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.imageSmoothingEnabled = X.s < 1.6; // big punch-ins keep the pixels crisp
  if (s.blur) g.filter = `blur(${s.blur}px)`;
  g.drawImage(im, X.x, X.y, X.dw, X.dh);
  g.filter = 'none';
  if (s.dim) { g.fillStyle = `rgba(12,8,18,${s.dim})`; g.fillRect(r.x, r.y, r.w, r.h); }
  g.restore();
}
// a pin board of reference photos (tools/devlog/refs/), polaroids popping in one by one; a missing
// photo falls back to a frame of the game (alt: clip name) or a fish sprite (alt: species id)
let corkCv = null;
function cork() {
  if (corkCv) return corkCv;
  corkCv = document.createElement('canvas'); corkCv.width = 360; corkCv.height = 640;
  const x = corkCv.getContext('2d');
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#6b4a30'; x.fillRect(0, 0, 360, 640);
  for (let i = 0; i < 9000; i++) { x.fillStyle = ['#5e3f28', '#7a5638', '#83603f', '#563a25'][Math.floor(rnd() * 4)]; x.fillRect(Math.floor(rnd() * 360), Math.floor(rnd() * 640), 1 + Math.floor(rnd() * 2), 1); }
  return corkCv;
}
async function photoOf(it) {
  const im = await img(`./${it.src}`);
  if (im) return im;
  if (META[it.alt] || /^g|^dl_/.test(it.alt || '')) return img(frameURL(it.alt, 60));
  if (it.alt) { const c = fishCanvas(it.alt, { frame: 1, scale: 8 }); const b = document.createElement('canvas'); b.width = 520; b.height = 480; const x = b.getContext('2d'); x.fillStyle = '#3d7f9a'; x.fillRect(0, 0, 520, 480); x.imageSmoothingEnabled = false; x.drawImage(c, (520 - c.width) / 2, (480 - c.height) / 2); return b; }
  return null;
}
const boardSfx = new Set();
async function drawBoard(s, t) {
  g.imageSmoothingEnabled = false;
  g.drawImage(cork(), 0, 0, W, H);
  const items = s.board.filter((it) => t >= it.at);
  for (const [k, it] of items.entries()) {
    if (!boardSfx.has(it)) { boardSfx.add(it); sfx('paper', { volume: 0.45 }); sfx('pop_in', { volume: 0.3, pitch: 0.9 }); }
    const lt = t - it.at, u = backOut(lt / 0.28), sc = 0.4 + 0.6 * u;
    const pw = 580, ph = 640, iw = 530, ih = 470;
    g.save();
    g.translate(it.x, it.y);
    g.rotate(((it.rot || 0) * Math.PI) / 180);
    g.scale(sc, sc);
    g.fillStyle = 'rgba(20,10,6,0.45)'; g.fillRect(-pw / 2 + 14, -ph / 2 + 18, pw, ph);
    g.fillStyle = '#fbf6ea'; g.fillRect(-pw / 2, -ph / 2, pw, ph);
    const ph0 = await photoOf(it);
    g.save();
    g.beginPath(); g.rect(-iw / 2, -ph / 2 + 25, iw, ih); g.clip();
    g.fillStyle = '#222'; g.fillRect(-iw / 2, -ph / 2 + 25, iw, ih);
    if (ph0) {
      const w0 = ph0.naturalWidth || ph0.width, h0 = ph0.naturalHeight || ph0.height;
      const z = Math.max(iw / w0, ih / h0) * (1.04 + 0.05 * Math.min(1, lt / 6));
      g.imageSmoothingEnabled = true;
      g.drawImage(ph0, -w0 * z / 2, -ph / 2 + 25 + ih / 2 - h0 * z / 2, w0 * z, h0 * z);
    }
    g.restore();
    g.fillStyle = '#1b1420'; g.font = "56px 'TBME Goofy'"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(it.label || '', 0, ph / 2 - 72);
    g.fillStyle = 'rgba(240,228,180,0.85)'; g.fillRect(-70, -ph / 2 - 22, 140, 44); // tape
    if (k < items.length - 1) { g.fillStyle = 'rgba(30,18,10,0.18)'; g.fillRect(-pw / 2, -ph / 2, pw, ph); }
    g.restore();
  }
}
async function drawShot(s, t) {
  g.globalAlpha = s.fade ? clamp01((t - s.at) / s.fade) : 1;
  if (s.wipe) {
    const A = { ...s.a, at: s.at, dur: s.dur }, B = { ...s.b, at: s.at, dur: s.dur };
    const x = keyed(s.x, t - s.at);
    await drawClip(A, t);
    g.save(); g.beginPath(); g.rect(x, 0, W - x, H); g.clip();
    await drawClip(B, t);
    g.restore();
    g.fillStyle = '#1b1420'; g.fillRect(x - 9, 0, 18, H);
    g.fillStyle = '#fffaf0'; g.fillRect(x - 4, 0, 8, H);
  } else if (s.board) {
    await drawBoard(s, t);
  } else if (s.stack) {
    const gap = 16, hh = (H - gap) / 2;
    g.fillStyle = '#1b1420'; g.fillRect(0, 0, W, H);
    await drawClip({ ...s.stack[0], at: s.at, dur: s.dur }, t, { x: 0, y: 0, w: W, h: hh });
    await drawClip({ ...s.stack[1], at: s.at, dur: s.dur }, t, { x: 0, y: hh + gap, w: W, h: hh });
  } else await drawClip(s, t);
  g.globalAlpha = 1;
}
const live = (t) => D.shots.filter((s) => t >= s.at && t < s.at + s.dur);
function mainShot(t) { const l = live(t).filter((s) => s.clip); return l[l.length - 1]; }
function rawAnchor(s, t, name) {
  const m = META[s.clip];
  return m?.anchors?.[frameOf(s, t)]?.[name] || null;
}
function anchor(name, t) {
  const s = mainShot(t);
  const a = s && rawAnchor(s, t, name);
  if (!a) return null;
  const X = xform(s, t);
  return [X.x + a[0] * X.s, X.y + a[1] * X.s];
}
function hudVal(t) { const s = mainShot(t); const m = s && META[s.clip]; return m?.anchors?.[frameOf(s, t)]?._hud || {}; }

// ---------------------------------------------------------------- captions (word by word)
const CHUNKS = [];
// a phrase (up to its punctuation) is split into as few chunks as fit ~17 characters / 4 words,
// balanced so nothing is left dangling ("They / cannonball in," not "They cannonball / in,")
const MAXC = 17, MAXW = 4;
const clen = (ws) => ws.reduce((a, x) => a + x.w.length, 0) + ws.length - 1;
function splitPhrase(ws) {
  const n = Math.max(Math.ceil(clen(ws) / MAXC), Math.ceil(ws.length / MAXW));
  if (n <= 1) return [ws];
  if (n >= 4) { const out = []; let cur = []; for (const w of ws) { if (cur.length && (clen([...cur, w]) > MAXC || cur.length >= MAXW)) { out.push(cur); cur = []; } cur.push(w); } if (cur.length) out.push(cur); return out; }
  let best = null, bs = 1e9;
  const score = (parts) => Math.max(...parts.map(clen)) + (parts.some((q) => q.length > MAXW) ? 100 : 0);
  for (let i = 1; i < ws.length; i++) {
    if (n === 2) { const parts = [ws.slice(0, i), ws.slice(i)]; const sc = score(parts); if (sc < bs) { bs = sc; best = parts; } continue; }
    for (let j = i + 1; j < ws.length; j++) { const parts = [ws.slice(0, i), ws.slice(i, j), ws.slice(j)]; const sc = score(parts); if (sc < bs) { bs = sc; best = parts; } }
  }
  return best || [ws];
}
for (const id of VO.order) {
  let phrase = [];
  const flush = () => { for (const ws of splitPhrase(phrase)) CHUNKS.push({ words: ws, t0: ws[0].t0, t1: ws[ws.length - 1].t1 }); phrase = []; };
  for (const [w, t0, t1] of VO.lines[id].words) {
    phrase.push({ w: w.replace(/[,;]$/, ''), t0, t1 });
    if (/[,.!?;:]$/.test(w)) flush();
  }
  if (phrase.length) flush();
}
CHUNKS.forEach((c, i) => { const nx = CHUNKS[i + 1]; c.until = Math.min(c.t1 + 0.55, nx ? nx.t0 : c.t1 + 0.55); });
const cap = document.createElement('div');
cap.id = 'cap';
cap.className = 'ol';
ui.appendChild(cap);
let capY = D.capY ?? 1200, capChunk = -1, capWord = -1;
function updateCaptions(t) {
  if (D.fox) { cap.style.display = 'none'; return; }
  const i = CHUNKS.findIndex((c) => t >= c.t0 - 0.02 && t < c.until);
  if (i < 0 || D.noCaptions?.some(([a, b]) => t >= a && t < b)) { cap.style.display = 'none'; capChunk = -1; return; }
  const c = CHUNKS[i];
  if (i !== capChunk) {
    capChunk = i; capWord = -1;
    cap.innerHTML = c.words.map((w) => `<span>${w.w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
  }
  const wi = c.words.findIndex((w, k) => t >= w.t0 - 0.03 && (t < w.t1 || k === c.words.length - 1));
  if (wi !== capWord) {
    capWord = wi;
    [...cap.children].forEach((sp, k) => sp.classList.toggle('on', k === wi));
  }
  cap.style.display = 'block';
  cap.style.top = capY + 'px';
  const k = 0.86 + 0.14 * backOut((t - c.t0) / 0.12);
  cap.style.transform = `scale(${k})`;
}

// ---------------------------------------------------------------- pixel bits
function pixelCanvas(rows, pal) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
  return c;
}
const ARROW = pixelCanvas([
  '...kkkkk...', '...kwwwk...', '...kwwwk...', '...kwwwk...', 'kkkkwwwkkkk', 'kwwwwwwwwwk', '.kwwwwwwwk.', '..kwwwwwk..', '...kwwwk...', '....kwk....', '.....k.....',
], { k: '#1b1420', w: '#ffd84a' }).toDataURL();
const PENCIL = pixelCanvas([
  '.........kk', '........kpk', '.......kyyk', '......kyyk.', '.....kyyk..', '....kyyk...', '...kyyk....', '..kwyk.....', '.kwwk......', 'kkkk.......',
], { k: '#1b1420', y: '#ffd84a', p: '#ff7aa8', w: '#f3e3c8' }).toDataURL();

const CHECK = pixelCanvas([
  '.........kk', '........kgk', '.......kggk', 'kk....kggk.', 'kgk..kggk..', 'kggkkggk...', '.kgggggk....', '..kgggk.....', '...kkk......',
].map((r) => r.slice(0, 11)), { k: '#1b1420', g: '#3fbf6a' }).toDataURL();
const el = (tag, cls, parent = ui) => { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; };
function pop(e, lt, dur, { inT = 0.18, outT = 0.14, from = 0.5, base = '', rot = 0 } = {}) {
  let k = 1, o = 1;
  if (lt < inT) { const u = lt / inT; k = from + (1 - from) * backOut(u); o = clamp01(u * 3); }
  if (dur != null && lt > dur - outT) { const u = clamp01((lt - (dur - outT)) / outT); o *= 1 - u; k *= 1 - 0.12 * u; }
  e.style.opacity = o;
  e.style.transform = `${base} rotate(${rot}deg) scale(${k})`;
}
const OV = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const H_ = {
  hook(c) {
    const e = el('div', 'hook');
    e.innerHTML = c.hook.split('\n').map((l) => `<div class="pp">${esc(l)}</div>`).join('');
    return { e, update(lt) { if (lt < 0.2 && c.instant) { e.style.opacity = 1; e.style.transform = 'none'; return; } pop(e, lt, c.dur, { from: 0.7 }); } };
  },
  badge(c) {
    const e = el('div', 'badge pp');
    e.textContent = c.badge;
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.3 }); } };
  },
  tag(c) {
    const e = el('div', 'tag pp' + (c.style ? ' ' + c.style : ''));
    e.textContent = c.tag;
    e.style.left = (c.x ?? 44) + 'px'; e.style.top = (c.y ?? 300) + 'px';
    if (c.size) e.style.fontSize = c.size + 'px';
    if (c.sound !== false) sfx('pop_in', { volume: 0.25, pitch: 1.3 });
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.4, rot: c.rot || 0 }); } };
  },
  // a bobbing pixel arrow over a clip anchor (or a point), with an optional label
  arrow(c) {
    const a = el('img', 'arrow px');
    a.src = ARROW;
    const l = c.label ? el('div', 'label ol') : null;
    if (l) l.textContent = c.label;
    sfx('pop_in', { volume: 0.3, pitch: 1.15 });
    let last = null;
    return {
      e: a, e2: l,
      update(lt, t) {
        let p = Array.isArray(c.arrow) ? c.arrow : null;
        if (!p) { const q = anchor(c.arrow, t); if (q) last = q; p = last; }
        if (!p) { a.style.opacity = 0; if (l) l.style.opacity = 0; return; }
        const bob = Math.abs(Math.sin(lt * 7)) * 18;
        const x = p[0] + (c.dx || 0), y = p[1] + (c.dy ?? -30) - bob;
        a.style.left = x + 'px'; a.style.top = y + 'px';
        pop(a, lt, c.dur, { base: 'translate(-50%, -100%)', from: 0.3 });
        if (l) {
          l.style.left = x + (c.lx ?? 0) + 'px'; l.style.top = y - 100 + (c.ly ?? 0) + 'px';
          pop(l, lt - 0.08, c.dur, { base: 'translate(-50%, -100%)', from: 0.4 });
        }
      },
    };
  },
  // a pixel ring drawn on around an anchor
  ring(c) {
    const R = c.r || 150, px = 6, n = Math.ceil((R * 2) / px) + 4;
    const cv = el('canvas', 'ring px');
    cv.width = n; cv.height = n;
    cv.style.width = n * px + 'px'; cv.style.height = n * px + 'px';
    const x = cv.getContext('2d');
    let last = null;
    sfx('pop_in', { volume: 0.25, pitch: 0.9 });
    return {
      e: cv,
      update(lt, t) {
        let p = Array.isArray(c.ring) ? c.ring : null;
        if (!p) { const q = anchor(c.ring, t); if (q) last = q; p = last; }
        if (!p) return;
        const u = clamp01(lt / 0.3);
        x.clearRect(0, 0, n, n);
        const r = R / px, cx = n / 2, cy = n / 2;
        for (let a = 0; a < u * Math.PI * 2; a += 0.02) {
          const wob = 1 + 0.04 * Math.sin(a * 3 + 1);
          const X = Math.round(cx + Math.cos(a - 1.6) * r * wob * (c.sx ?? 1)), Y = Math.round(cy + Math.sin(a - 1.6) * r * wob * (c.sy ?? 0.8));
          x.fillStyle = '#1b1420'; x.fillRect(X - 1, Y - 1, 4, 4);
        }
        for (let a = 0; a < u * Math.PI * 2; a += 0.02) {
          const wob = 1 + 0.04 * Math.sin(a * 3 + 1);
          const X = Math.round(cx + Math.cos(a - 1.6) * r * wob * (c.sx ?? 1)), Y = Math.round(cy + Math.sin(a - 1.6) * r * wob * (c.sy ?? 0.8));
          x.fillStyle = '#ff4d6d'; x.fillRect(X, Y, 2, 2);
        }
        cv.style.left = p[0] + (c.dx || 0) - (n * px) / 2 + 'px';
        cv.style.top = p[1] + (c.dy || 0) - (n * px) / 2 + 'px';
        cv.style.opacity = c.dur != null && lt > c.dur - 0.15 ? 1 - clamp01((lt - (c.dur - 0.15)) / 0.15) : 1;
      },
    };
  },
  // "Reply to comment": the comment that asked for this
  comment(c) {
    const e = el('div', 'comment pp');
    e.style.top = (c.y ?? 330) + 'px';
    e.innerHTML = `<div class="who"><span class="av"><i></i></span><span>Reply to comment</span></div><div class="txt">${esc(c.comment)}</div>`;
    sfx('pop_in', { volume: 0.45 });
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.4, rot: -2 }); } };
  },
  // a time card ("10 SECONDS LATER")
  card(c) {
    const e = el('div', 'card ol');
    e.textContent = c.card;
    sfx('whoosh', { volume: 0.35 });
    return { e, update(lt) { pop(e, lt, c.dur, { from: 0.6 }); } };
  },
  hud(c) {
    const e = el('div', 'hud');
    if (c.y) e.style.top = c.y + 'px';
    return {
      e,
      update(lt, t) {
        const v = hudVal(t);
        e.textContent = c.hud.map((k) => `${k.toUpperCase().padEnd(6, ' ')} ${v[k] ?? 0}`).join('\n');
        e.style.opacity = c.dur != null && lt > c.dur - 0.1 ? 0 : 1;
      },
    };
  },
  clock(c) {
    const e = el('div', 'clock pp');
    let prev = null;
    return {
      e,
      update(lt, t) {
        const v = hudVal(t).clock || '4:59 PM';
        if (v !== prev) { e.textContent = v; if (prev && /5:00/.test(v)) sfx('bell', { volume: 0.4 }); prev = v; }
        e.style.background = /5:0/.test(v) && lt % 0.5 < 0.25 ? '#ffd84a' : '#fffaf0';
        pop(e, lt, c.dur, { base: 'translateX(-50%)', from: 0.6 });
      },
    };
  },
  // drawing a sprite pixel by pixel in a little editor: outline traced first, then fills, then details
  draw(c) {
    const e = el('div', 'draw');
    const src = fishCanvas(c.draw, { frame: 0, scale: 1 });
    const sw = src.width, sh = src.height;
    const data = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    const px = [];
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (data[i + 3] < 128) continue;
      const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
      px.push({ x, y, col: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`, lum });
    }
    const cx = sw / 2, cy = sh / 2;
    // outline traced around the sprite, then the base colours swept across, then shading/details, then highlights
    const outline = px.filter((p) => p.lum < 60).sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const band = (p) => (p.lum > 205 ? 2 : p.lum > 130 ? 0 : 1);
    const fills = px.filter((p) => p.lum >= 60).sort((a, b) => band(a) - band(b) || (a.x + a.y * 0.4) - (b.x + b.y * 0.4));
    const order = [...outline, ...fills];
    const scale = Math.floor(Math.min(820 / sw, 520 / sh));
    const cv = el('canvas', null, e);
    cv.width = sw; cv.height = sh;
    cv.style.width = sw * scale + 'px'; cv.style.height = sh * scale + 'px';
    const ox = Math.round((870 - sw * scale) / 2), oy = Math.round(64 + (636 - sh * scale) / 2);
    cv.style.left = ox + 'px'; cv.style.top = oy + 'px';
    const grid = el('canvas', null, e);
    grid.width = sw * scale; grid.height = sh * scale;
    Object.assign(grid.style, { left: ox + 'px', top: oy + 'px' });
    const gx = grid.getContext('2d');
    gx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i <= sw; i++) gx.fillRect(i * scale, 0, 1, sh * scale);
    for (let j = 0; j <= sh; j++) gx.fillRect(0, j * scale, sw * scale, 1);
    const ctx = cv.getContext('2d');
    const bar = el('div', 'bar', e);
    bar.textContent = `${c.file || c.draw + '.png'}   ${sw}x${sh}`;
    const cols = [...new Set(order.map((p) => p.col))].slice(0, 12);
    const pal = el('div', 'pal', e);
    const sws = cols.map((cc) => { const i = el('i', null, pal); i.style.background = cc; return i; });
    const pen = el('img', 'px', e);
    pen.src = PENCIL;
    Object.assign(pen.style, { position: 'absolute', width: '88px', height: '80px' });
    const tagEl = el('div', 'tag pp dark', e);
    Object.assign(tagEl.style, { position: 'absolute', right: '24px', bottom: '24px', fontSize: '48px' });
    tagEl.textContent = c.speed || 'x10';
    let shown = 0, tick = 0;
    const drawT = c.drawT || (c.dur - 0.8);
    return {
      e,
      update(lt) {
        pop(e, lt, c.dur, { from: 0.85 });
        const n = Math.min(order.length, Math.floor(order.length * clamp01((lt - 0.25) / drawT)));
        for (; shown < n; shown++) { const p = order[shown]; ctx.fillStyle = p.col; ctx.fillRect(p.x, p.y, 1, 1); }
        const p = order[Math.max(0, shown - 1)];
        if (p) {
          pen.style.left = ox + p.x * scale + scale * 0.5 + 'px';
          pen.style.top = oy + p.y * scale - 70 + scale * 0.5 + 'px';
          const ci = cols.indexOf(p.col);
          sws.forEach((s, k) => s.classList.toggle('on', k === ci));
        }
        pen.style.display = n > 0 && n < order.length ? 'block' : 'none';
        if (n < order.length && n > 0 && lt - tick > 0.09) { tick = lt; sfx('click', { volume: 0.1, pitch: 1.4 + ((n * 13) % 7) * 0.05 }); }
      },
    };
  },
  // a checklist that ticks off each thing as the voice names it: { list: [[t, 'text'], ...] }
  list(c) {
    const e = el('div', 'list pp');
    e.style.left = (c.x ?? 44) + 'px'; e.style.top = (c.y ?? 560) + 'px';
    const rows = c.list.map(([t, txt]) => { const r = el('div', 'li', e); r.innerHTML = `<img class="px" src="${CHECK}"><span>${esc(txt)}</span>`; r.style.display = 'none'; return { t, r, on: false }; });
    return {
      e,
      update(lt, t) {
        pop(e, lt, c.dur, { from: 0.6 });
        for (const R of rows) {
          if (t >= R.t && !R.on) { R.on = true; R.r.style.display = 'flex'; sfx('pop_in', { volume: 0.3, pitch: 1.2 + rows.indexOf(R) * 0.08 }); }
          if (R.on) { const u = clamp01((t - R.t) / 0.16); R.r.style.transform = `scale(${0.6 + 0.4 * backOut(u)})`; }
        }
      },
    };
  },
  end(c) {
    const e = el('div', 'end');
    e.innerHTML = `<div class="bx">${c.icon ? `<img class="px" src="${iconURL(c.icon, 10)}">` : ''}<div class="t1 ol">${esc(c.end[0])}</div>${c.end[1] ? `<div class="t2 ol">${esc(c.end[1])}</div>` : ''}</div>`;
    const bx = e.querySelector('.bx');
    sfx('pop_in', { volume: 0.4 });
    return { e, update(lt) { e.style.background = `rgba(12,8,18,${0.5 * clamp01(lt / 0.25)})`; pop(bx, lt, c.dur, { base: 'translateX(-50%)', from: 0.5 }); } };
  },
  flash(c) {
    const e = el('div', 'flash');
    return { e, update(lt) { e.style.opacity = 1 - clamp01(lt / c.flash); if (lt > c.flash) e.style.display = 'none'; } };
  },
};

// ---------------------------------------------------------------- the fox host + his speech bubble
// Reynard (foxhost.js) says every line in a comic bubble over his head, typed out word by word
// as the voice says it: lowercase, no full stops, like someone typed it. *word* = shouted.
const host = D.fox ? new FoxHost(document.getElementById('fox'), {
  beats: D.fox,
  lines: VO.order.map((id) => ({ t0: VO.lines[id].t0, t1: VO.lines[id].t1, text: VO.lines[id].text })),
  sfx: (name, o) => sfx(name, o),
}) : null;
const BCH = [];
// one bubble per sentence; short punchy sentences ride together ("every. single. fish."), long
// ones split in two at the most even point, preferring a comma
const blen = (ws) => ws.reduce((a, x) => a + x.w.length, 0) + ws.length - 1;
function splitSentence(ws) {
  if (blen(ws) <= 40 || ws.length < 3) return [ws];
  let best = null, bs = 1e9;
  for (let i = 1; i < ws.length; i++) {
    const A = ws.slice(0, i), B = ws.slice(i);
    const sc = Math.max(blen(A), blen(B)) - (/,$/.test(A[A.length - 1].raw) ? 12 : 0) + (A.length < 2 || B.length < 2 ? 8 : 0);
    if (sc < bs) { bs = sc; best = [A, B]; }
  }
  return best.flatMap(splitSentence);
}
for (const id of VO.order) {
  const sents = [];
  let cur = [];
  for (const [raw, t0, t1] of VO.lines[id].words) {
    const bare = raw.replace(/\*/g, '');
    const b2 = bare.replace(/[,;:]+$/, '');
    let w = /^[A-Z]{2,}[.,!?]*$/.test(bare) ? bare.replace(/[.,;:]+$/, '') : /^(\w\.)+$/.test(b2) ? b2.toLowerCase() : bare.toLowerCase().replace(/[.,;:]+$/, ''); // keep "p.m." and "CEO"
    if (/\.\.\.$/.test(bare)) w += '...';
    cur.push({ w, t0, t1, em: /\*/.test(raw), raw: bare });
    if (/[.!?]$/.test(bare) && !/^(\w\.)+$/.test(b2)) { sents.push(cur); cur = []; }
  }
  if (cur.length) sents.push(cur);
  let acc = [];
  for (const sn of sents.flatMap(splitSentence)) {
    if (acc.length && blen([...acc, ...sn]) > 24) { BCH.push(acc); acc = []; }
    acc = [...acc, ...sn];
    if (blen(acc) > 16) { BCH.push(acc); acc = []; }
  }
  if (acc.length) BCH.push(acc);
}
BCH.forEach((c, i) => { BCH[i] = { words: c, t0: c[0].t0, t1: c[c.length - 1].t1 }; });
BCH.forEach((c, i) => { const nx = BCH[i + 1]; c.until = Math.min(c.t1 + 0.7, nx ? nx.t0 - 0.02 : c.t1 + 0.7); });
const bub = document.createElement('div');
bub.className = 'bubble';
bub.style.display = 'none';
ui.appendChild(bub);
const TAIL = pixelCanvas(['kkkkkkkkkkkkkk', 'kwwwwwwwwwwwk.', '.kwwwwwwwwwk..', '..kwwwwwwwk...', '...kwwwwwk....', '....kwwwk.....', '.....kwk......', '......k.......'], { k: '#1b1420', w: '#fffaf0' }).toDataURL();
let bubI = -1, bubW = -1, bubT0 = 0, bubTail = null;
function updateBubble(t) {
  const i = BCH.findIndex((c) => t >= c.t0 - 0.06 && t < c.until);
  const head = host && host.head;
  if (i < 0 || !head || D.noCaptions?.some(([a, b]) => t >= a && t < b)) { bub.style.display = 'none'; bubI = -1; return; }
  const c = BCH[i];
  if (i !== bubI) {
    bubI = i; bubW = -1; bubT0 = t;
    bub.innerHTML = c.words.map((w) => `<span class="${w.em ? 'em' : ''}">${esc(w.w)}</span>`).join(' ') + `<img class="tail" src="${TAIL}">`;
    bubTail = bub.querySelector('.tail');
    bub.style.display = 'block';
  }
  const spans = [...bub.children].filter((e) => e.tagName === 'SPAN');
  const wi = c.words.findIndex((w, k) => t >= w.t0 - 0.03 && (t < w.t1 || k === c.words.length - 1));
  c.words.forEach((w, k) => {
    spans[k].classList.toggle('said', t >= w.t0 - 0.05);
    spans[k].classList.toggle('now', k === wi);
    spans[k].style.transform = w.em && t >= w.t0 - 0.05 && t < w.t1 + 0.3 ? `translate(${Math.round(Math.sin(t * 60) * 3)}px, ${Math.round(Math.cos(t * 47) * 3)}px) scale(1.1)` : '';
  });
  const bw = bub.offsetWidth, bh = bub.offsetHeight;
  const left = Math.round(Math.max(30, Math.min(1050 - bw, head.x - bw * 0.35)));
  const top = Math.round(Math.max(160, head.y - 70 - bh));
  bub.style.left = left + 'px';
  bub.style.top = top + 'px';
  bubTail.style.left = Math.round(Math.max(24, Math.min(bw - 66, head.x - left - 21))) + 'px';
  const k = 0.7 + 0.3 * backOut((t - bubT0) / 0.14);
  bub.style.transformOrigin = `${head.x - left}px 110%`;
  bub.style.transform = `scale(${k}) rotate(${Math.sin(bubI * 2.3) * 1.4}deg)`;
}

// ---------------------------------------------------------------- cues
const fired = new Set();
function fire(t) {
  D.cues.forEach((c, i) => {
    if (fired.has(i) || t + 1e-6 < c.at) return;
    fired.add(i);
    if (c.sfx) sfx(c.sfx, c);
    if (c.music !== undefined) LOG.push({ t: c.at, kind: 'music', mood: c.music, fade: c.fade ?? 1.0, volume: c.volume ?? 0.6 });
    if (c.capY != null) capY = c.capY;
    const kind = Object.keys(H_).find((k) => c[k] !== undefined);
    if (!kind) return;
    try { const o = H_[kind](c); o.c = c; o.t0 = c.at; OV.push(o); } catch (e) { console.error('cue', c, e); }
  });
}
function updateOverlays(t) {
  for (let i = OV.length - 1; i >= 0; i--) {
    const o = OV[i], lt = t - o.t0;
    if (o.c.dur != null && lt > o.c.dur) { o.e?.remove(); o.e2?.remove(); OV.splice(i, 1); continue; }
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
    const sh = D.cues.find((c) => c.shake && t >= c.at && t < c.at + c.shake);
    g.save();
    if (sh) { const k = 1 - (t - sh.at) / sh.shake, a = (sh.amp ?? 22) * k; g.translate(Math.round(Math.sin(i * 2.1) * a), Math.round(Math.cos(i * 1.7) * a * 0.8)); }
    for (const s of live(t)) await drawShot(s, t);
    g.restore();
    for (const s of D.shots) if (s.clip && t + 0.4 >= s.at && t < s.at + s.dur) img(frameURL(s.clip, frameOf(s, t + 1 / FPS)));
    updateOverlays(t);
    updateCaptions(t);
    if (host) host.frame(t, 1 / FPS);
    updateBubble(t);
    window.__vt?.step(1000 / FPS);
  },
};
Promise.all([document.fonts.load("96px 'TBME Goofy'"), metaReady]).then(() => { window.__ready = true; });
