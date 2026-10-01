// Egg hatch ceremony: a Clash Royale style "chest opening", but it's a fish egg.
//
//   playEggHatch(root, eggs, opts) -> Promise<void>
//
// Also home of the small kit shared by the other ceremony screens
// (FinanceSheet.js, Overnight.js): frames, input, timeline, pixel particles,
// pixel glyphs and the fallback egg / fish drawings.
import './ceremony.css';
import { hasSprite, spriteCanvas, spriteImg } from './sprites.js';
import { RARITIES as DEFAULT_RARITIES, SPECIES_BY_ID } from '../data/species.js';

// ===========================================================================
// shared kit
// ===========================================================================
export const RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtInt = (n) => Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US');
export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function hexRgb(hex) {
  const h = String(hex || '#ffffff').replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
export function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export const luma = (hex) => { const [r, g, b] = hexRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

export function mkSfx(opts) {
  const f = opts && opts.sfx;
  return (name, o) => { if (typeof f === 'function') { try { f(name, o); } catch { /* sound is optional */ } } };
}

// icon(name, scale) -> html. Uses opts.icon, falls back to sprites.js. Unknown
// sprite names get a pixel glyph instead of the pink "?" placeholder.
export function mkIcon(opts) {
  const f = opts && typeof opts.icon === 'function' ? opts.icon : null;
  return (name, scale = 2, cls = '') => {
    if (!hasSprite(name) && GLYPH_FOR[name]) return glyph(GLYPH_FOR[name], scale, cls);
    if (f) { try { const h = f(name, scale); if (h) return cls ? `<span class="${cls}">${h}</span>` : String(h); } catch { /* fall through */ } }
    return spriteImg(name, scale, cls);
  };
}

// Canvas copy of a sprite (sprites.js caches its canvases: never put those in the DOM).
export function spriteCopy(name, scale) {
  const src = spriteCanvas(name, scale);
  return copyCanvas(src);
}
export function copyCanvas(src, w = src.width, h = src.height) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, w, h);
  return c;
}
export function spriteSize(name) {
  const c = spriteCanvas(name, 1);
  return { w: c.width, h: c.height };
}

// ---- optional 9-slice frames from src/ui/frames.js (resolved at build time;
// an empty glob when the file does not exist) -> .f-<name>, else our CSS.
const FRAME_MOD = import.meta.glob('./frames.js', { eager: true })['./frames.js'] || null;
let frameSet = null;
function scanFrameRules() {
  const set = new Set();
  const sheets = [...Array.from(document.styleSheets || []), ...Array.from(document.adoptedStyleSheets || [])];
  const walk = (rules) => {
    for (const r of Array.from(rules || [])) {
      if (r.selectorText) for (const m of r.selectorText.matchAll(/\.f-([A-Za-z0-9_]+)/g)) set.add(m[1]);
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const ss of sheets) { try { walk(ss.cssRules); } catch { /* cross-origin sheet */ } }
  return set;
}
export function frameCls(name) {
  if (frameSet === null) {
    frameSet = new Set();
    if (FRAME_MOD && typeof FRAME_MOD.injectFrameCSS === 'function') {
      try { FRAME_MOD.injectFrameCSS(); frameSet = scanFrameRules(); } catch { frameSet = new Set(); }
    }
  }
  return frameSet.has(name) ? `f-${name} cer-f` : `cer-fb-${name}`;
}

// ---- pixel glyphs (inline SVG, crisp, coloured by currentColor)
const GLYPHS = {
  male: ['....###', '.....##', '....#.#', '.###...', '#..#...', '#..#...', '.##....'],
  female: ['.###.', '#...#', '#...#', '#...#', '.###.', '..#..', '#####', '..#..'],
  arrow: ['...#....', '...##...', '#######.', '########', '#######.', '...##...', '...#....'],
  sun: ['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....'],
  check: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  cross: ['#...#', '##.##', '.###.', '##.##', '#...#'],
  spark: ['..#..', '..#..', '##.##', '..#..', '..#..'],
  size: ['.#.....#.', '##.....##', '#########', '##.....##', '.#.....#.'],
  gem: ['.#####.', '#.#.#.#', '#######', '.#####.', '..###..', '...#...'],
  up: ['..#..', '.###.', '#####', '..#..', '..#..'],
  down: ['..#..', '..#..', '#####', '.###.', '..#..'],
  dot: ['.##.', '####', '####', '.##.'],
  clover: ['.##.##.', '#######', '.#####.', '#######', '.##.##.', '...#...', '..#....'],
  shield: ['#######', '#######', '#######', '.#####.', '.#####.', '..###..', '...#...'],
  question: ['.###.', '#...#', '...#.', '..#..', '..#..', '.....', '..#..'],
  skip: ['#..#...', '##.##..', '#######', '##.##..', '#..#...'],
  zzz: ['####....', '..#.....', '.#......', '####.###', '.......#', '......#.', '.....###'],
  pen: ['......##', '.....###', '....###.', '...###..', '..###...', '.###....', '##......', '#.......'],
};
const GLYPH_FOR = { clover: 'clover', shield: 'shield', question: 'question', sun: 'sun', sunrise: 'sun', zzz: 'zzz' };
const glyphCache = new Map();
export function glyph(name, px = 2, cls = '') {
  const rows = GLYPHS[name] || GLYPHS.dot;
  let d = glyphCache.get(name);
  if (!d) {
    d = '';
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') d += `M${x} ${y}h1v1h-1z`; });
    glyphCache.set(name, d);
  }
  const w = rows[0].length, h = rows.length;
  return `<svg class="cer-g ${cls}" width="${w * px}" height="${h * px}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
}

// ---- input: tap / Space / Enter advance, Esc skips. Captures keys so the
// game underneath never sees them while an overlay is up.
export function bindInput(el, { onTap, onSkip }) {
  const isAdv = (e) => e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar' || e.code === 'Space';
  const key = (e) => {
    if (isAdv(e)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) onTap('key', e); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) (onSkip || onTap)('esc', e); }
  };
  const keyUp = (e) => { if (isAdv(e) || e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); } };
  const down = (e) => {
    if (e.button > 0) return;
    if (e.target && e.target.closest && e.target.closest('[data-cer-own]')) return;
    onTap('pointer', e);
  };
  window.addEventListener('keydown', key, true);
  window.addEventListener('keyup', keyUp, true);
  el.addEventListener('pointerdown', down);
  return () => {
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('keyup', keyUp, true);
    el.removeEventListener('pointerdown', down);
  };
}

// ---- timeline: sleeps + animations that a tap can fast-forward.
export class Seq {
  constructor() { this.ff = false; this.dead = false; this.sleeps = new Set(); this.anims = new Set(); this.timers = new Set(); }
  sleep(ms) {
    if (this.ff || this.dead || !(ms > 0)) return Promise.resolve();
    return new Promise((res) => {
      const e = { res, id: 0 };
      e.id = setTimeout(() => { this.sleeps.delete(e); res(); }, ms);
      this.sleeps.add(e);
    });
  }
  after(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.dead) fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  cancel(id) { clearTimeout(id); this.timers.delete(id); }
  anim(el, kf, o) {
    if (!el || typeof el.animate !== 'function' || this.dead) return null;
    let a;
    try { a = el.animate(kf, o); } catch { return null; }
    if (o && o.iterations === Infinity) return a;
    this.anims.add(a);
    a.finished.then(() => this.anims.delete(a), () => this.anims.delete(a));
    if (this.ff) { try { a.finish(); } catch { /* ignore */ } }
    return a;
  }
  fast() {
    this.ff = true;
    for (const e of this.sleeps) { clearTimeout(e.id); e.res(); }
    this.sleeps.clear();
    for (const a of Array.from(this.anims)) { try { a.finish(); } catch { /* ignore */ } }
  }
  slow() { this.ff = false; }
  kill() {
    this.dead = true;
    for (const e of this.sleeps) { clearTimeout(e.id); e.res(); }
    for (const id of this.timers) clearTimeout(id);
    this.sleeps.clear(); this.timers.clear();
    for (const a of Array.from(this.anims)) { try { a.cancel(); } catch { /* ignore */ } }
    this.anims.clear();
  }
}

// Wait for a WAAPI animation, but never longer than `ms` (hidden tabs etc.).
export function done(a, ms = 2000) {
  if (!a) return Promise.resolve();
  return Promise.race([a.finished.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);
}

// Screen shake on an element (integer pixel offsets).
export function shake(seq, el, mag = 8, ms = 400) {
  if (!el || reducedMotion() || mag <= 0) return null;
  const kf = [];
  const n = Math.max(4, Math.round(ms / 34));
  for (let i = 0; i <= n; i++) {
    const k = 1 - i / n;
    const m = mag * k * k;
    kf.push({ transform: i === n ? 'translate(0,0) rotate(0deg)' : `translate(${Math.round((Math.random() * 2 - 1) * m)}px, ${Math.round((Math.random() * 2 - 1) * m)}px) rotate(${((Math.random() * 2 - 1) * m * 0.08).toFixed(2)}deg)` });
  }
  return seq.anim(el, kf, { duration: ms, easing: 'linear' });
}

// ---- pixel particles on a full-screen canvas (squares snapped to a grid)
export class PixelFX {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ps = [];
    this.u = 4;
    this.resize();
  }
  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.cv.width = w; this.cv.height = h;
    this.w = w; this.h = h;
    this.u = w < 640 ? 3 : 4;
    this.ctx.imageSmoothingEnabled = false;
  }
  add(p) {
    if (this.ps.length > 700) return;
    this.ps.push({ t: 0, life: 1, vx: 0, vy: 0, g: 0, drag: 0, s: 1, type: 'sq', delay: 0, ...p });
  }
  // radial burst of n particles around (x, y)
  burst(x, y, n, o = {}) {
    const cols = o.colors || ['#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 400) * (0.35 + Math.random() * 0.75);
      this.add({
        x: x + (Math.random() - 0.5) * (o.jitter ?? 10), y: y + (Math.random() - 0.5) * (o.jitter ?? 10),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: o.g ?? 900, drag: o.drag ?? 1.4,
        life: (o.life ?? 1.2) * (0.6 + Math.random() * 0.6),
        s: o.size ? o.size[0] + Math.floor(Math.random() * (o.size[1] - o.size[0] + 1)) : 1,
        color: cols[(Math.random() * cols.length) | 0], color2: o.color2 || null,
        type: o.type || 'sq', spin: 6 + Math.random() * 10, phase: Math.random() * 6.3,
        delay: o.delay ? Math.random() * o.delay : 0, img: o.img || null, flutter: o.flutter ?? 0,
      });
    }
  }
  ring(x, y, color, o = {}) {
    this.add({ type: 'ring', x, y, color, r0: o.r0 ?? 20, speed: o.speed ?? 700, life: o.life ?? 0.55, s: o.s ?? 1 });
  }
  step(dt) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { ps.splice(i, 1); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.g * dt;
      p.x += p.vx * dt + (p.flutter ? Math.sin(p.t * 7 + p.phase) * p.flutter * dt : 0);
      p.y += p.vy * dt;
      if (p.tx !== undefined) { const k = 1 - Math.exp(-p.pull * dt); p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    }
  }
  draw() {
    const c = this.ctx, u = this.u;
    c.clearRect(0, 0, this.w, this.h);
    for (const p of this.ps) {
      if (p.delay > 0) continue;
      const k = p.t / p.life;
      c.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
      const x = Math.round(p.x / u) * u, y = Math.round(p.y / u) * u;
      if (p.type === 'sq') {
        c.fillStyle = p.color;
        c.fillRect(x, y, u * p.s, u * p.s);
        if (p.s > 1 && p.color2) { c.fillStyle = p.color2; c.fillRect(x, y + u * (p.s - 1), u * p.s, u); }
      } else if (p.type === 'conf') {
        const f = Math.cos(p.t * p.spin + p.phase);
        c.fillStyle = f > 0 ? p.color : (p.color2 || mix(p.color, '#000000', 0.3));
        const w = Math.abs(f) > 0.5 ? 2 : 1;
        c.fillRect(x, y, u * w, u * (3 - w));
      } else if (p.type === 'spark') {
        const L = Math.max(0, Math.round(Math.sin(Math.PI * k) * (p.s + 1)));
        c.fillStyle = p.color;
        c.fillRect(x - L * u, y, (2 * L + 1) * u, u);
        c.fillRect(x, y - L * u, u, (2 * L + 1) * u);
        c.fillStyle = '#ffffff';
        c.fillRect(x, y, u, u);
      } else if (p.type === 'dust') {
        const s = Math.max(1, Math.round(p.s * (0.6 + k)));
        c.fillStyle = p.color;
        c.fillRect(x - ((s * u) >> 1), y - ((s * u) >> 1), s * u, s * u);
      } else if (p.type === 'ring') {
        const r = p.r0 + p.speed * p.t * (1 - k * 0.4);
        const n = Math.max(12, Math.round((2 * Math.PI * r) / (u * 1.6)));
        c.fillStyle = p.color;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          c.fillRect(Math.round((p.x + Math.cos(a) * r) / u) * u, Math.round((p.y + Math.sin(a) * r) / u) * u, u * p.s, u * p.s);
        }
      } else if (p.type === 'img' && p.img) {
        c.drawImage(p.img, x - (p.img.width >> 1), y - (p.img.height >> 1));
      }
    }
    c.globalAlpha = 1;
  }
}

// ---- god rays on a small canvas, upscaled with pixelated rendering
export class Rays {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.a = 0; this.alpha = 0; this.target = 0; this.speed = 0.25; this.color = '#ffffff'; this.glow = '#ffffff'; this.n = 12; this.n2 = 0; }
  size(css, px) {
    const n = Math.max(32, Math.round(css / px));
    this.cv.width = this.cv.height = n;
    this.cv.style.width = this.cv.style.height = `${n * px}px`;
  }
  step(dt) {
    this.a += dt * this.speed;
    this.alpha += (this.target - this.alpha) * (1 - Math.exp(-dt * 3));
  }
  draw() {
    const c = this.ctx, W = this.cv.width, R = W / 2;
    c.clearRect(0, 0, W, W);
    if (this.alpha < 0.01) return;
    const layer = (n, a0, width, col, glow, al) => {
      const g = c.createRadialGradient(R, R, 0, R, R, R);
      g.addColorStop(0, rgba(glow, 0.9 * al));
      g.addColorStop(0.1, rgba(col, 0.62 * al));
      g.addColorStop(0.32, rgba(col, 0.26 * al));
      g.addColorStop(0.62, rgba(col, 0.07 * al));
      g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2, w = (Math.PI / n) * width;
        c.moveTo(R, R);
        c.arc(R, R, R, a - w, a + w);
        c.closePath();
      }
      c.fill();
    };
    layer(this.n, this.a, 0.5, this.color, this.glow, this.alpha);
    if (this.n2) layer(this.n2, -this.a * 1.7 + 0.3, 0.3, this.glow, '#ffffff', this.alpha * 0.55);
    const g2 = c.createRadialGradient(R, R, 0, R, R, R * 0.36);
    g2.addColorStop(0, rgba('#ffffff', 0.5 * this.alpha));
    g2.addColorStop(1, rgba(this.glow, 0));
    c.fillStyle = g2;
    c.fillRect(0, 0, W, W);
  }
}

// seeded random
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---- pixel grids -> canvas
const OUT = '#1a1420';
export function outline(g, col = OUT) {
  const H = g.length, W = g[0].length;
  const o = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ((x > 0 && g[y][x - 1]) || (x < W - 1 && g[y][x + 1]) || (y > 0 && g[y - 1][x]) || (y < H - 1 && g[y + 1][x])) o[y][x] = col;
  }
  return o;
}
export function gridCanvas(g, scale = 1) {
  const H = g.length, W = g[0].length;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const x = c.getContext('2d');
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const col = g[j][i];
    if (!col) continue;
    x.fillStyle = col;
    x.fillRect(i * scale, j * scale, scale, scale);
  }
  return c;
}

// ===========================================================================
// eggs: sprites (egg_<rarity>_<0..3>) when present, else a drawn fallback
// ===========================================================================
const EGG_W = 20, EGG_H = 26, ECX = 9.5, ECY = 15, ERX = 8.7, ERYT = 13.4, ERYB = 9.5;
const EGG_PALS = [
  { base: '#efe3c6', hi: '#fffaf0', lo: '#cdb58a', mark: '#b5864f', mark2: '#8f6636', inner: '#fff8e8' },
  { base: '#a3d97f', hi: '#e0facb', lo: '#62a44a', mark: '#3d8b3a', mark2: '#2a6a2e', inner: '#f2ffe6' },
  { base: '#88c3f5', hi: '#dcf1ff', lo: '#4a84d0', mark: '#2c56a8', mark2: '#ffffff', inner: '#eef8ff' },
  { base: '#b98af2', hi: '#efdcff', lo: '#7646c4', mark: '#f27acb', mark2: '#fff0fa', inner: '#f8f0ff' },
  { base: '#ffd23f', hi: '#fff7c2', lo: '#d88a12', mark: '#e0561e', mark2: '#ffffff', inner: '#fffbe6' },
];
const ZIG = [15, 14, 13, 14, 15, 14, 13, 12, 13, 14, 15, 14, 13, 14, 15, 14, 13, 12, 13, 14];
const inEgg = (x, y) => {
  const nx = (x - ECX) / ERX, cy = y + 0.5, ny = (cy - ECY) / (cy < ECY ? ERYT : ERYB);
  return nx * nx + ny * ny <= 1;
};

function eggGrid(tier, stage, glowCol) {
  const P = EGG_PALS[tier] || EGG_PALS[0];
  const R = rng(4242 + tier * 97);
  const g = [];
  for (let y = 0; y < EGG_H; y++) {
    const row = [];
    for (let x = 0; x < EGG_W; x++) {
      if (!inEgg(x, y)) { row.push(null); continue; }
      const nx = (x - ECX) / ERX, cy = y + 0.5, ny = (cy - ECY) / (cy < ECY ? ERYT : ERYB);
      const d = nx * nx + ny * ny;
      const l = nx * 0.62 + ny * 0.5 + d * 0.35;
      row.push(l > 0.66 ? P.lo : l < -0.3 ? P.hi : P.base);
    }
    g.push(row);
  }
  const put = (x, y, col) => {
    if (y < 0 || y >= EGG_H || x < 0 || x >= EGG_W || !g[y][x]) return;
    g[y][x] = g[y][x] === P.lo ? mix(col, '#000000', 0.22) : col;
  };
  // markings
  if (tier === 0) {
    for (let i = 0; i < 16; i++) { const x = 2 + ((R() * 16) | 0), y = 4 + ((R() * 19) | 0); if (x > 7 || y > 10) put(x, y, R() < 0.3 ? P.mark2 : P.mark); }
  } else if (tier === 1) {
    for (let i = 0; i < 7; i++) {
      const x = 3 + ((R() * 13) | 0), y = 5 + ((R() * 16) | 0);
      if (x < 8 && y < 10) continue;
      put(x, y, P.mark); put(x + 1, y, P.mark); put(x, y + 1, P.mark); put(x + 1, y + 1, P.mark2);
    }
  } else if (tier === 2) {
    for (let x = 0; x < EGG_W; x++) { const y = 14 + Math.round(Math.sin(x * 0.9) * 1.2); put(x, y, P.mark); put(x, y + 1, P.mark); }
    for (let x = 0; x < EGG_W; x++) { const y = 9 + Math.round(Math.sin(x * 0.9 + 2) * 1); if (x % 3 === 0) put(x, y, P.mark); }
    for (const [x, y] of [[12, 6], [8, 19], [14, 20], [4, 18], [15, 11]]) put(x, y, P.mark2);
  } else if (tier === 3) {
    const zz = [0, 1, 2, 1];
    for (let x = 0; x < EGG_W; x++) { put(x, 10 + zz[x % 4], P.mark); put(x, 17 + zz[(x + 2) % 4], P.mark); }
    for (const [x, y] of [[5, 14], [9, 14], [13, 14], [16, 14], [11, 6], [7, 21], [13, 21]]) { put(x, y, P.mark2); }
  } else {
    for (let x = 0; x < EGG_W; x++) for (let y = 12; y <= 17; y++) {
      const dx = Math.abs(((x + 2) % 6) - 3), dy = Math.abs(y - 14.5);
      if (dx + dy <= 2.6 && dx + dy > 1.4) put(x, y, P.mark);
      else if (dx + dy <= 1.4) put(x, y, P.mark2);
    }
    for (let x = 0; x < EGG_W; x++) { put(x, 11, P.lo); put(x, 18, P.lo); }
    for (const [x, y] of [[12, 6], [6, 21], [14, 21]]) { put(x, y, P.mark2); put(x - 1, y, P.hi); put(x + 1, y, P.hi); put(x, y - 1, P.hi); put(x, y + 1, P.hi); }
  }
  // specular highlight
  for (const [x, y] of [[6, 5], [5, 6], [6, 6], [5, 7], [5, 8]]) if (g[y][x]) g[y][x] = '#ffffff';
  // cracks
  const glow = glowCol || '#ffffff';
  if (stage >= 1) {
    for (const [x, y] of [[10, 2], [10, 3], [11, 4], [11, 5], [10, 6], [9, 7], [9, 8], [10, 9], [10, 10], [12, 6], [13, 7]]) if (g[y] && g[y][x]) g[y][x] = OUT;
    if (g[5][12]) g[5][12] = glow;
  }
  if (stage >= 2) {
    for (let x = 0; x < EGG_W; x++) { const y = ZIG[x]; if (g[y][x]) g[y][x] = OUT; if (x % 2 === 0 && g[y + 1] && g[y + 1][x]) g[y + 1][x] = glow; }
    for (const [x, y] of [[11, 3], [12, 4], [10, 8], [11, 9], [14, 8], [15, 9], [16, 9], [4, 16], [3, 17]]) if (g[y] && g[y][x]) g[y][x] = glow;
    for (const [x, y] of [[14, 7], [15, 8]]) if (g[y] && g[y][x]) g[y][x] = OUT;
  }
  return g;
}

function eggHalvesGrids(tier, glowCol) {
  const P = EGG_PALS[tier] || EGG_PALS[0];
  const g = eggGrid(tier, 0, glowCol);
  const top = g.map((r) => r.slice()), bot = g.map((r) => r.slice());
  for (let y = 0; y < EGG_H; y++) for (let x = 0; x < EGG_W; x++) {
    if (y >= ZIG[x]) top[y][x] = null;
    if (y < ZIG[x]) bot[y][x] = null;
    else if (y === ZIG[x] && bot[y][x]) bot[y][x] = P.inner;
  }
  return [outline(top), outline(bot)];
}

const EGG_CACHE = new Map();
export function eggHasSprites(tier) {
  const id = RARITY_IDS[tier] || 'common';
  return [0, 1, 2].every((s) => hasSprite(`egg_${id}_${s}`));
}
// natural size (pixels) of the egg art for a tier
export function eggNatural(tier) {
  if (eggHasSprites(tier)) return spriteSize(`egg_${RARITY_IDS[tier]}_0`);
  return { w: EGG_W, h: EGG_H };
}
// canvas for an egg stage 0..2 at an integer scale
export function eggCanvas(tier, stage, scale, glowCol) {
  tier = clamp(tier | 0, 0, 4);
  const id = RARITY_IDS[tier];
  if (eggHasSprites(tier)) return spriteCopy(`egg_${id}_${clamp(stage, 0, 2)}`, scale);
  const key = `${tier}:${stage}:${scale}:${glowCol}`;
  let c = EGG_CACHE.get(key);
  if (!c) { c = gridCanvas(outline(eggGrid(tier, stage, glowCol)), scale); EGG_CACHE.set(key, c); }
  return copyCanvas(c);
}
// the two burst halves (same size as the egg canvas, drawn at their rest spot)
export function eggHalves(tier, scale, glowCol) {
  tier = clamp(tier | 0, 0, 4);
  const id = RARITY_IDS[tier];
  if (eggHasSprites(tier) && hasSprite(`egg_${id}_3`)) return splitCanvas(spriteCopy(`egg_${id}_3`, scale));
  return eggHalvesGrids(tier, glowCol).map((gr) => gridCanvas(gr, scale));
}
// Split a "burst halves" sprite into two pieces along its biggest empty gap.
function splitCanvas(c) {
  const W = c.width, H = c.height;
  let data;
  try { data = c.getContext('2d').getImageData(0, 0, W, H).data; } catch { data = null; }
  const rowEmpty = (y) => { for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 20) return false; return true; };
  const colEmpty = (x) => { for (let y = 0; y < H; y++) if (data[(y * W + x) * 4 + 3] > 20) return false; return true; };
  const gap = (n, empty) => {
    let best = -1, bestLen = 0, run = 0;
    for (let i = Math.floor(n * 0.2); i < Math.ceil(n * 0.8); i++) {
      if (empty(i)) { run++; if (run > bestLen) { bestLen = run; best = i - ((run - 1) >> 1); } } else run = 0;
    }
    return best;
  };
  let axis = 'y', at = H >> 1;
  if (data) {
    const gy = gap(H, rowEmpty), gx = gap(W, colEmpty);
    if (gx >= 0 && gy < 0) { axis = 'x'; at = gx; } else if (gy >= 0) at = gy;
  }
  const piece = (first) => {
    const p = copyCanvas(c);
    const x = p.getContext('2d');
    if (axis === 'y') x.clearRect(0, first ? at : 0, W, first ? H - at : at);
    else x.clearRect(first ? at : 0, 0, first ? W - at : at, H);
    return p;
  };
  return [piece(true), piece(false)];
}

// ===========================================================================
// placeholder fish (used when no fishCanvas() is supplied / it throws)
// ===========================================================================
const hex6 = (n) => '#' + (Number(n) >>> 0).toString(16).padStart(6, '0').slice(-6);
const LONG = new Set(['pike', 'muskie', 'tigermuskie', 'burbot', 'sturgeon', 'pikeeye', 'walleye', 'chinook']);
const ROUND = new Set(['bluegill', 'pumpkinseed', 'goldfish', 'goldseed', 'bassgill', 'sunperch']);
function morphColor(col, morph, x, y) {
  switch (morph) {
    case 'albino': return mix(col, '#ffe6ea', 0.72);
    case 'melanistic': return mix(col, '#1c1822', 0.68);
    case 'golden': { const l = luma(col); return l > 0.66 ? '#fff3a3' : l > 0.4 ? '#ffd23f' : l > 0.22 ? '#e59a1f' : '#a5631b'; }
    case 'ghost': return mix(col, '#c8ecff', 0.66);
    case 'rainbow': { const h = ((x * 17 + y * 5) % 360); return `hsl(${h} 80% ${40 + luma(col) * 35}%)`; }
    case 'calico': { const r = (Math.sin(x * 1.7 + y * 2.3) + Math.sin(x * 0.6 - y)) ; return r > 0.9 ? '#e8743b' : r < -1.1 ? '#2a2430' : mix(col, '#fff8f0', 0.8); }
    default: return col;
  }
}
export function placeholderFishCanvas(speciesId, o = {}) {
  const sp = SPECIES_BY_ID[speciesId] || { colors: { back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8, accent: 0x16223a } };
  const C = sp.colors;
  const col = { back: hex6(C.back), side: hex6(C.side), belly: hex6(C.belly), fin: hex6(C.fin), accent: hex6(C.accent) };
  const morph = (o.morph && (o.morph.id || o.morph)) || 'normal';
  const frame = (o.frame | 0) % 4;
  const long = LONG.has(speciesId), round = ROUND.has(speciesId);
  const W = long ? 36 : 30, H = round ? 22 : 18;
  const cx = long ? 20 : 17, cy = H / 2, rx = long ? 13 : round ? 9.5 : 11, ry = round ? 7 : long ? 4.6 : 5.6;
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const R = rng(hashStr(speciesId));
  const wig = [0, 1, 0, -1][frame];
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
  // tail
  const tx = Math.round(cx - rx) + 1;
  for (let i = 0; i < 6; i++) for (let j = -2 - i; j <= 2 + i; j++) {
    if (i > 3 && Math.abs(j) < i - 3) continue;
    set(tx - i, Math.round(cy + j * 0.8 + wig * (i / 5)), col.fin);
  }
  // dorsal + lower fins
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3 - (i >> 1); j++) set(Math.round(cx - 2 + i), Math.round(cy - ry - j + 0.4), col.fin);
  for (let i = 0; i < 3; i++) set(Math.round(cx + 1 + i), Math.round(cy + ry + 0.2), col.fin);
  // body
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const c = ny < -0.35 ? col.back : ny > 0.4 ? col.belly : col.side;
    g[y][x] = c;
  }
  // markings
  for (let i = 0; i < 5; i++) {
    const x = Math.round(cx - rx * 0.5 + R() * rx * 1.1), y = Math.round(cy - ry * 0.5 + R() * ry * 0.9);
    if (g[y] && g[y][x]) g[y][x] = col.accent;
  }
  // gill line, eye, mouth
  const ex = Math.round(cx + rx * 0.62), ey = Math.round(cy - ry * 0.28);
  for (let j = -1; j <= 1; j++) if (g[ey + 1 + j] && g[ey + 1 + j][ex - 3]) g[ey + 1 + j][ex - 3] = mix(col.side, '#000000', 0.35);
  set(ex, ey, '#ffffff'); set(ex + 1, ey, morph === 'albino' ? '#d0303a' : '#1a1420'); set(ex, ey - 1, '#ffffff'); set(ex + 1, ey - 1, '#ffffff');
  set(Math.round(cx + rx) - 1, Math.round(cy + 1), mix(col.belly, '#000000', 0.4));
  // morph recolour + outline
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] && g[y][x] !== '#ffffff' && g[y][x] !== '#1a1420' && g[y][x] !== '#d0303a') g[y][x] = morphColor(g[y][x], morph, x, y);
  const scale = Math.max(1, Math.floor(o.scale || 1));
  const c = gridCanvas(outline(g), scale);
  if (morph === 'ghost') { const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-in'; x.fillStyle = 'rgba(0,0,0,0.78)'; x.fillRect(0, 0, c.width, c.height); }
  return c;
}

// Fish animation frames at an integer scale that fits maxW x maxH.
export function fishFrames(fishCanvas, speciesId, morph, maxW, maxH, { min = 2, max = 7, n = 4 } = {}) {
  const mId = (morph && (morph.id || morph)) || 'normal';
  let fn = typeof fishCanvas === 'function' ? fishCanvas : null;
  let base = null;
  if (fn) { try { base = fn(speciesId, { morph: mId, frame: 0, scale: 1 }); } catch { base = null; } }
  if (!base || !base.width) { fn = placeholderFishCanvas; base = placeholderFishCanvas(speciesId, { morph: mId, frame: 0, scale: 1 }); }
  const s = clamp(Math.floor(Math.min(maxW / base.width, maxH / base.height)), min, max);
  const frames = [];
  for (let f = 0; f < n; f++) {
    let c = null;
    try { c = fn(speciesId, { morph: mId, frame: f, scale: s }); } catch { c = null; }
    if (!c || !c.width) break;
    if (c.width !== base.width * s) c = copyCanvas(c, base.width * s, base.height * s);
    else c = copyCanvas(c);
    frames.push(c);
  }
  if (!frames.length) frames.push(copyCanvas(base, base.width * s, base.height * s));
  return { frames, w: base.width * s, h: base.height * s, scale: s };
}

// ===========================================================================
// playEggHatch
// ===========================================================================
const TIER = [
  { n: 12, n2: 0, conf: 46, spark: 10, shake: 0, build: 0, drop: 820, reveal: 'reveal_common', ring: 1 },
  { n: 12, n2: 0, conf: 64, spark: 14, shake: 3, build: 0, drop: 820, reveal: 'reveal_common', ring: 1 },
  { n: 14, n2: 7, conf: 86, spark: 20, shake: 6, build: 250, drop: 860, reveal: 'reveal_rare', ring: 1 },
  { n: 16, n2: 9, conf: 120, spark: 30, shake: 10, build: 900, drop: 920, reveal: 'reveal_epic', ring: 2 },
  { n: 18, n2: 12, conf: 180, spark: 46, shake: 18, build: 2000, drop: 1100, reveal: 'reveal_legendary', ring: 3 },
];
const SEX = { M: { g: 'male', name: 'Male', cls: 'm' }, F: { g: 'female', name: 'Female', cls: 'f' } };
const SIZE_NAME = { S: 'Small', M: 'Medium', L: 'Large', XL: 'X-Large' };
const IDLE_TAP_MS = 9000, READY_MS = 16000, SUMMARY_MS = 30000;

export function playEggHatch(root, eggs, opts = {}) {
  const list = (Array.isArray(eggs) ? eggs : [eggs]).filter(Boolean);
  if (!list.length || !root) return Promise.resolve();
  return new Promise((resolve) => {
    let h;
    try { h = new EggHatch(root, list, opts, resolve); h.start(); } catch (e) {
      console.error('[EggHatch]', e);
      try { h && h.destroy(); } catch { /* ignore */ }
      resolve();
    }
  });
}

class EggHatch {
  constructor(root, eggs, opts, resolve) {
    this.root = root;
    this.eggs = eggs.map((e) => ({ ...e, rarity: clamp(Math.round(Number(e.rarity) || 0), 0, 4) }));
    this.opts = opts;
    this.resolve = resolve;
    this.sfx = mkSfx(opts);
    this.icon = mkIcon(opts);
    this.rar = (opts.rarities && opts.rarities.length >= 5 ? opts.rarities : DEFAULT_RARITIES);
    this.auto = opts.autoAdvance === false ? 0 : Number(opts.autoAdvance) || 1;
    this.seq = new Seq();
    this.idx = -1;
    this.stage = 0;
    this.state = 'init';
    this.revealed = new Set();
    this.graceUntil = 0;
    this.idleT = 0;
    this.fish = null;
    this.raf = 0;
    this.last = 0;
  }

  // ------------------------------------------------------------------ setup
  start() {
    const el = document.createElement('div');
    el.className = 'egg-ov cer-ov';
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="egg-back"></div>
      <div class="egg-world">
        <canvas class="egg-rays"></canvas>
        <div class="egg-glow"></div>
        <div class="egg-beams"></div>
        <div class="egg-shadow"></div>
        <div class="egg-pos">
          <div class="egg-drop"><div class="egg-wob"><div class="egg-shk"></div></div></div>
          <div class="egg-halves"></div>
        </div>
        <div class="egg-fishpos"><div class="egg-fishpop"><div class="egg-fishbob"></div></div></div>
        <div class="egg-label"></div>
        <div class="egg-prompt"><div class="egg-tap">TAP!</div><div class="egg-pips"></div><div class="egg-hand">${this.icon('hand', 3)}</div></div>
        <div class="egg-news"></div>
      </div>
      <canvas class="egg-fx"></canvas>
      <div class="egg-card ${frameCls('parchment')}"></div>
      <div class="egg-top">
        <div class="egg-count"></div>
        <button type="button" class="egg-skip cer-btn ${frameCls('button_green')}" data-cer-own>Skip ${glyph('skip', 2)}</button>
      </div>
      <div class="egg-foot"><span class="egg-more"></span><span class="egg-cont">Tap to continue</span></div>
      <div class="egg-sum"></div>
      <div class="egg-flash"></div>`;
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = {
      world: q('.egg-world'), rays: q('.egg-rays'), glow: q('.egg-glow'), beams: q('.egg-beams'), shadow: q('.egg-shadow'),
      pos: q('.egg-pos'), drop: q('.egg-drop'), wob: q('.egg-wob'), shk: q('.egg-shk'), halves: q('.egg-halves'),
      fishpos: q('.egg-fishpos'), fishpop: q('.egg-fishpop'), fishbob: q('.egg-fishbob'),
      label: q('.egg-label'), prompt: q('.egg-prompt'), pips: q('.egg-pips'), news: q('.egg-news'),
      fx: q('.egg-fx'), card: q('.egg-card'), top: q('.egg-top'), count: q('.egg-count'), skip: q('.egg-skip'),
      foot: q('.egg-foot'), more: q('.egg-more'), sum: q('.egg-sum'), flash: q('.egg-flash'),
    };
    this.root.appendChild(el);
    this.fx = new PixelFX(this.$.fx);
    this.rays = new Rays(this.$.rays);
    this.layout();
    this.unbind = bindInput(el, { onTap: (src, e) => this.tap(src, e), onSkip: () => this.skip() });
    this.$.skip.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('click'); this.skip(); });
    this.$.card.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest && e.target.closest('.egg-chip[data-tip]');
      if (!chip) return;
      e.stopPropagation();
      const on = !chip.classList.contains('tip');
      this.$.card.querySelectorAll('.egg-chip.tip').forEach((c) => c.classList.remove('tip'));
      if (on) chip.classList.add('tip');
      this.sfx('click', { volume: 0.5 });
    });
    this.onResize = () => { this.layout(); };
    window.addEventListener('resize', this.onResize);
    if (opts_signal(this.opts)) this.opts.signal.addEventListener('abort', () => this.close(true), { once: true });
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    requestAnimationFrame(() => el.classList.add('on'));
    this.renderCount();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.tick(t));
    this.runEgg(0);
  }

  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.phone = W < 640;
    this.fx.resize();
    const px = this.phone ? 5 : 6;
    this.rays.size(Math.hypot(W, H) * 1.05, px);
    this.eggY = Math.round(H * (this.phone ? 0.44 : 0.47));
    this.el.style.setProperty('--ey', `${this.eggY}px`);
    if (this.state === 'ready' || this.state === 'reveal') this.placeReveal(false);
  }

  eggScale(tier) {
    const n = eggNatural(tier);
    const target = Math.min(this.H * (this.phone ? 0.24 : 0.3), this.W * 0.42);
    return clamp(Math.floor(target / n.h), 2, 12);
  }

  tick(t) {
    if (this.state === 'dead') return;
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.rays.step(dt); this.rays.draw();
    this.fx.step(dt); this.fx.draw();
    if (this.fish && this.fish.frames.length > 1) {
      this.fish.t += dt;
      const k = Math.floor(this.fish.t / 0.13) % this.fish.frames.length;
      if (k !== this.fish.k) {
        this.fish.k = k;
        const c = this.fish.cv.getContext('2d');
        c.clearRect(0, 0, this.fish.cv.width, this.fish.cv.height);
        c.drawImage(this.fish.frames[k], 0, 0);
      }
    }
    if (this.fish && this.fish.sparkT !== undefined && this.state !== 'summary') {
      this.fish.sparkT -= dt;
      if (this.fish.sparkT <= 0) {
        this.fish.sparkT = 0.25 + Math.random() * 0.5;
        const r = this.$.fishbob.getBoundingClientRect();
        if (r.width) this.fx.add({ type: 'spark', x: r.left + Math.random() * r.width, y: r.top + Math.random() * r.height, life: 0.7, s: 1 + ((Math.random() * 2) | 0), color: this.fish.sparkCol });
      }
    }
    this.raf = requestAnimationFrame((tt) => this.tick(tt));
  }

  // ------------------------------------------------------------------ input
  tap(src) {
    const now = performance.now();
    this.idleT = now;
    switch (this.state) {
      case 'intro': this.seq.fast(); break;
      case 'idle': this.crack(); break;
      case 'burst': break;
      case 'reveal': if (now > this.graceUntil) this.seq.fast(); break;
      case 'ready': if (now > this.graceUntil) this.next(); break;
      case 'summary': if (now > this.graceUntil) this.close(); break;
      default: break;
    }
  }

  armIdle(ms, fn) {
    if (this.idleTimer) this.seq.cancel(this.idleTimer);
    this.idleTimer = 0;
    if (!this.auto) return;
    this.idleTimer = this.seq.after(ms * this.auto, fn);
  }

  // ------------------------------------------------------------------ eggs
  renderCount() {
    const n = this.eggs.length;
    const cur = this.idx;
    const scale = this.phone ? 1 : 2;
    let h = '<div class="egg-dots">';
    this.eggs.forEach((e, i) => {
      const cls = i < cur || this.revealed.has(i) ? 'done' : i === cur ? 'cur' : '';
      h += `<span class="egg-dot ${cls}" style="--rc:${this.rar[e.rarity].color}"></span>`;
    });
    h += '</div>';
    if (n > 1) h += `<div class="egg-ctxt">Egg <b>${Math.max(1, Math.min(n, cur + 1))}</b> of <b>${n}</b></div>`;
    this.$.count.innerHTML = n > 1 ? h : '';
    // tiny egg canvases in the dots
    this.$.count.querySelectorAll('.egg-dot').forEach((d, i) => {
      const c = eggCanvas(this.eggs[i].rarity, 0, scale);
      c.className = 'px';
      d.appendChild(c);
    });
  }

  setRarityLook(r, first) {
    const R = this.rar[r], T = TIER[r];
    this.el.style.setProperty('--rc', R.color);
    this.el.style.setProperty('--rg', R.glow);
    this.el.dataset.tier = String(r);
    this.rays.color = R.color; this.rays.glow = R.glow; this.rays.n = T.n; this.rays.n2 = T.n2;
    this.rays.target = r >= 3 ? 0.55 : 0.45;
    this.rays.speed = 0.22 + r * 0.03;
    if (first) this.rays.alpha = 0;
  }

  async runEgg(i) {
    const seq = this.seq;
    if (this.state === 'dead') return;
    this.idx = i;
    this.stage = 0;
    this.state = 'intro';
    seq.slow();
    const egg = this.eggs[i];
    const r = egg.rarity, T = TIER[r], R = this.rar[r];
    this.renderCount();
    this.setRarityLook(r, i === 0);
    for (const k of ['drop', 'wob', 'shk', 'shadow', 'fishpop', 'fishpos', 'card', 'news']) this.$[k].getAnimations().forEach((a) => a.cancel());
    this.$.card.classList.remove('on');
    this.$.foot.classList.remove('on');
    this.$.news.innerHTML = '';
    this.$.halves.innerHTML = '';
    this.$.beams.innerHTML = '';
    this.$.fishbob.innerHTML = '';
    this.fish = null;
    this.el.classList.remove('burst', 'revealed');
    this.el.style.setProperty('--leak', '0');
    this.$.label.className = 'egg-label';
    this.$.label.innerHTML = `<span>${esc(R.name)} egg</span>`;

    // egg canvas
    this.scale = this.eggScale(r);
    this.eggCv = eggCanvas(r, 0, this.scale, R.glow);
    this.eggCv.className = 'egg-img px';
    this.$.shk.innerHTML = '';
    this.$.shk.appendChild(this.eggCv);
    const eh = this.eggCv.height, ew = this.eggCv.width;
    this.el.style.setProperty('--eh', `${eh}px`);
    this.el.style.setProperty('--ew', `${ew}px`);
    this.$.pos.style.opacity = '1';

    // build-up for the big ones
    if (T.build > 0) {
      const b = T.build;
      this.el.classList.add('charging');
      this.rays.target = 0.25; this.rays.speed = 1.6;
      this.sfx('whoosh', { pitch: r >= 4 ? 0.6 : 0.8 });
      const cx = this.W / 2, cy = this.eggY;
      const n = r >= 4 ? 70 : r >= 3 ? 34 : 14;
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.max(this.W, this.H) * (0.45 + Math.random() * 0.4);
        const dl = Math.random() * b / 1600;
        this.fx.add({ type: 'spark', x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, tx: cx, ty: cy, pull: 3 + Math.random() * 1.5, life: Math.max(0.5, b / 1000 - dl), delay: dl, s: 1 + ((Math.random() * 2) | 0), color: R.glow });
      }
      if (r >= 4) { shake(seq, this.$.world, 4, b); this.sfx('egg_wobble', { pitch: 0.5, volume: 0.8 }); }
      await seq.sleep(b);
      this.el.classList.remove('charging');
      this.rays.target = 0.5; this.rays.speed = 0.3 + r * 0.03;
    }
    if (this.state === 'dead') return;

    // drop in with squash & stretch
    const fall = Math.round(this.eggY + eh + 40);
    this.sfx('whoosh', { pitch: 1.2 - r * 0.08 });
    const dur = T.drop;
    const land = 0.58;
    seq.anim(this.$.drop, [
      { transform: `translateY(${-fall}px) scale(0.86, 1.18)`, easing: 'cubic-bezier(.5,0,.9,.4)' },
      { transform: 'translateY(0) scale(1.3, 0.7)', offset: land, easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: 'translateY(-22px) scale(0.9, 1.12)', offset: 0.76, easing: 'cubic-bezier(.6,0,.9,.5)' },
      { transform: 'translateY(0) scale(1.1, 0.92)', offset: 0.88 },
      { transform: 'translateY(0) scale(1, 1)' },
    ], { duration: dur, fill: 'both' });
    seq.anim(this.$.shadow, [
      { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.25, 0.9)', opacity: 1, offset: land },
      { transform: 'translate(-50%, -50%) scale(0.85)', opacity: 0.8, offset: 0.76 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    ], { duration: dur, fill: 'both' });
    await seq.sleep(dur * land);
    if (this.state === 'dead') return;
    // impact
    this.sfx('egg_wobble', { pitch: 0.7 - r * 0.05, volume: 0.9 });
    const fy = this.eggY + eh / 2;
    const dustN = 10 + r * 5;
    for (let k = 0; k < dustN; k++) {
      const dir = k % 2 ? 1 : -1;
      this.fx.add({ type: 'dust', x: this.W / 2 + dir * (ew * 0.3 + Math.random() * 20), y: fy - Math.random() * 8, vx: dir * (120 + Math.random() * 260), vy: -30 - Math.random() * 70, g: 60, drag: 3, life: 0.5 + Math.random() * 0.4, s: 2 + (Math.random() * 2 | 0), color: rgba('#fff8e8', 0.55) });
    }
    if (T.shake) shake(seq, this.$.world, T.shake * (r >= 4 ? 1.2 : 0.7), 260 + r * 90);
    if (r >= 3) this.fx.ring(this.W / 2, fy, rgba(R.glow, 0.8), { r0: ew * 0.4, speed: 520, life: 0.45 });
    this.$.label.classList.add('on');
    if (r >= 3) this.sfx('star_pop', { pitch: 0.6 });
    await seq.sleep(dur * (1 - land));
    if (this.state === 'dead') return;
    seq.slow();
    this.state = 'idle';
    this.renderPips();
    this.$.prompt.classList.add('on');
    this.wobbleLoop();
    this.armIdle(IDLE_TAP_MS, () => this.autoTap());
  }

  autoTap() {
    if (this.state !== 'idle') return;
    this.crack();
    if (this.state === 'idle') this.armIdle(1400, () => this.autoTap());
  }

  renderPips() {
    let h = '';
    for (let k = 0; k < 3; k++) h += `<i class="${k < this.stage ? 'used' : ''}"></i>`;
    this.$.pips.innerHTML = h;
    const words = ['TAP!', 'AGAIN!', 'ONE MORE!'];
    this.$.prompt.querySelector('.egg-tap').textContent = words[this.stage] || 'TAP!';
  }

  wobbleLoop() {
    if (this.wobTimer) this.seq.cancel(this.wobTimer);
    const go = () => {
      if (this.state !== 'idle') return;
      const m = 7 + this.stage * 4;
      this.seq.anim(this.$.wob, [
        { transform: 'rotate(0deg)' }, { transform: `rotate(${-m}deg)` }, { transform: `rotate(${m * 0.85}deg)` },
        { transform: `rotate(${-m * 0.5}deg)` }, { transform: `rotate(${m * 0.25}deg)` }, { transform: 'rotate(0deg)' },
      ], { duration: 620, easing: 'ease-in-out' });
      this.sfx('egg_wobble', { volume: 0.45, pitch: 1 + this.stage * 0.1 });
      this.wobTimer = this.seq.after(1500 - this.stage * 350 + Math.random() * 300, go);
    };
    this.wobTimer = this.seq.after(500, go);
  }

  crack() {
    if (this.state !== 'idle') return;
    const egg = this.eggs[this.idx];
    const r = egg.rarity, R = this.rar[r];
    this.stage++;
    if (this.stage >= 3) { this.burst(); return; }
    this.armIdle(IDLE_TAP_MS, () => this.autoTap());
    this.sfx('egg_crack', { pitch: 1 + (this.stage - 1) * 0.22 });
    // swap art
    const cv = eggCanvas(r, this.stage, this.scale, R.glow);
    cv.className = 'egg-img px';
    this.$.shk.replaceChildren(cv);
    this.eggCv = cv;
    this.renderPips();
    // shake harder each time
    const m = 6 + this.stage * 5;
    this.seq.anim(this.$.shk, [
      { transform: 'translate(0,0) rotate(0deg) scale(1)' },
      { transform: `translate(${-m}px,0) rotate(${-m}deg) scale(1.08, 0.94)` },
      { transform: `translate(${m}px,-4px) rotate(${m}deg) scale(0.96, 1.06)` },
      { transform: `translate(${-m * 0.7}px,0) rotate(${-m * 0.6}deg)` },
      { transform: `translate(${m * 0.5}px,0) rotate(${m * 0.4}deg)` },
      { transform: `translate(${-m * 0.2}px,0) rotate(${-m * 0.15}deg)` },
      { transform: 'translate(0,0) rotate(0deg) scale(1)' },
    ], { duration: 320 + this.stage * 40, easing: 'ease-out' });
    // shell bits + light leak
    const P = EGG_PALS[r];
    const rect = cv.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.55, cy = rect.top + rect.height * (this.stage === 1 ? 0.25 : 0.52);
    this.fx.burst(cx, cy, 8 + this.stage * 6, { colors: [P.base, P.hi, P.lo], color2: OUT, speed: 520, g: 1400, drag: 0.8, life: 0.9, size: [1, 2], spread: Math.PI * 1.3 });
    this.fx.burst(cx, cy, 4 + this.stage * 4, { type: 'spark', colors: [R.glow], speed: 260, g: 0, drag: 2.5, life: 0.6, size: [1, 2] });
    this.el.style.setProperty('--leak', String(this.stage));
    this.rays.target = 0.55 + this.stage * 0.15;
    this.rays.speed += 0.35;
    this.addBeams(this.stage === 1 ? 3 : 7);
    if (r >= 3 || this.stage === 2) shake(this.seq, this.$.world, (TIER[r].shake || 3) * 0.4 * this.stage, 220);
  }

  addBeams(n) {
    const box = this.$.beams;
    for (let k = box.childElementCount; k < n; k++) {
      const b = document.createElement('i');
      const a = (k / Math.max(1, n - 1) - 0.5) * 150 + (Math.random() - 0.5) * 24 + (k % 3 === 2 ? 180 : 0);
      b.style.setProperty('--a', `${a.toFixed(1)}deg`);
      b.style.setProperty('--d', `${(Math.random() * 0.6).toFixed(2)}s`);
      b.style.setProperty('--w', `${this.phone ? 6 + (k % 3) * 3 : 8 + (k % 3) * 4}px`);
      box.appendChild(b);
    }
  }

  async burst() {
    const seq = this.seq;
    this.state = 'burst';
    if (this.idleTimer) { seq.cancel(this.idleTimer); this.idleTimer = 0; }
    const egg = this.eggs[this.idx];
    const r = egg.rarity, R = this.rar[r], T = TIER[r], P = EGG_PALS[r];
    this.revealed.add(this.idx);
    this.$.prompt.classList.remove('on');
    this.$.label.classList.remove('on');
    const rect = this.eggCv.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height * 0.55;
    this.sfx('egg_burst', { pitch: 1 - r * 0.04 });
    seq.after(120, () => this.sfx(T.reveal));
    // flash
    seq.anim(this.$.flash, r >= 4
      ? [{ opacity: 1, background: '#ffffff' }, { opacity: 0.9, background: R.glow, offset: 0.25 }, { opacity: 0, background: R.color }]
      : [{ opacity: r >= 2 ? 1 : 0.85 }, { opacity: 0 }], { duration: r >= 4 ? 1100 : 520, easing: 'ease-out' });
    this.el.classList.add('burst');
    // halves fly apart
    this.$.shk.replaceChildren();
    const [a, b] = eggHalves(r, this.scale, R.glow);
    a.className = 'egg-half px'; b.className = 'egg-half px';
    this.$.halves.replaceChildren(a, b);
    const hw = this.W * (this.phone ? 0.34 : 0.22);
    seq.anim(a, [
      { transform: 'translate(-50%, -100%) translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(-50%, -100%) translate(${-hw * 0.6}px, ${-this.H * 0.22}px) rotate(-70deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(-50%, -100%) translate(${-hw}px, ${this.H * 0.35}px) rotate(-200deg)`, opacity: 0 },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.6,.6,1)', fill: 'both' });
    seq.anim(b, [
      { transform: 'translate(-50%, -100%) translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(-50%, -100%) translate(${hw * 0.5}px, ${-this.H * 0.08}px) rotate(40deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(-50%, -100%) translate(${hw}px, ${this.H * 0.4}px) rotate(160deg)`, opacity: 0 },
    ], { duration: 1150, easing: 'cubic-bezier(.2,.6,.6,1)', fill: 'both' });
    // particles
    const confCols = [R.color, R.glow, '#ffffff', r >= 4 ? '#ffd23f' : mix(R.color, '#ffffff', 0.45)];
    this.fx.burst(cx, cy, T.conf, { type: 'conf', colors: confCols, speed: 900 + r * 120, g: 520, drag: 1.9, life: 2.2 + r * 0.25, flutter: 60, jitter: 30 });
    this.fx.burst(cx, cy, 16 + r * 4, { colors: [P.base, P.hi, P.lo], color2: OUT, speed: 700, g: 1500, drag: 0.8, life: 1.1, size: [1, 2] });
    this.fx.burst(cx, cy, T.spark, { type: 'spark', colors: [R.glow, '#ffffff', R.color], speed: 620, g: 60, drag: 2.2, life: 1.1, size: [1, 3], jitter: 60 });
    for (let k = 0; k < T.ring; k++) seq.after(k * 120, () => this.fx.ring(cx, cy, rgba(k % 2 ? '#ffffff' : R.glow, 0.9), { r0: 20, speed: 900 + k * 200, life: 0.6 }));
    if (r >= 4) {
      // coin shower for legendaries
      const coin = spriteCopy('coin', this.phone ? 2 : 3);
      for (let k = 0; k < 36; k++) this.fx.add({ type: 'img', img: coin, x: Math.random() * this.W, y: -30 - Math.random() * 200, vx: (Math.random() - 0.5) * 80, vy: 200 + Math.random() * 250, g: 700, life: 2.4, delay: 0.2 + Math.random() * 0.9 });
      seq.after(300, () => this.sfx('star_pop', { pitch: 1.5 }));
    }
    if (T.shake) shake(seq, this.$.world, T.shake * 1.3, 300 + r * 120);
    this.rays.target = r >= 3 ? 0.85 : 0.7;
    this.rays.alpha = 1;
    this.rays.speed = 0.5;
    seq.after(900, () => { this.rays.speed = 0.22 + r * 0.04; this.rays.target = r >= 3 ? 0.6 : 0.5; });
    this.el.style.setProperty('--leak', '0');
    this.$.beams.innerHTML = '';
    // the fish
    this.makeFish(egg);
    seq.anim(this.$.fishpop, [
      { transform: 'translateY(40px) scale(0.1)', opacity: 0 },
      { transform: 'translateY(-36px) scale(1.35, 1.2)', opacity: 1, offset: 0.35 },
      { transform: 'translateY(8px) scale(0.9, 1.05)', offset: 0.58 },
      { transform: 'translateY(-6px) scale(1.06, 0.97)', offset: 0.78 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], { duration: 820, easing: 'ease-out', fill: 'both' });
    this.graceUntil = performance.now() + 650;
    await seq.sleep(r >= 4 ? 900 : 560);
    if (this.state === 'dead') return;
    this.reveal(egg);
  }

  makeFish(egg) {
    const maxW = Math.min(this.W * (this.phone ? 0.64 : 0.3), 340), maxH = this.H * (this.phone ? 0.2 : 0.26);
    const ff = fishFrames(this.opts.fishCanvas, egg.speciesId, egg.morph, maxW, maxH, { min: 3, max: this.phone ? 7 : 8 });
    const cv = document.createElement('canvas');
    cv.width = ff.w; cv.height = ff.h;
    cv.className = 'egg-fish px';
    cv.getContext('2d').drawImage(ff.frames[0], 0, 0);
    const morph = (egg.morph && (egg.morph.id || egg.morph)) || 'normal';
    const shiny = morph !== 'normal' || egg.rarity >= 3;
    this.$.fishbob.replaceChildren(cv);
    if (shiny) {
      const sh = document.createElement('div');
      sh.className = 'egg-shine';
      try {
        const url = `url(${ff.frames[0].toDataURL()})`;
        sh.style.webkitMaskImage = url; sh.style.maskImage = url;
        this.$.fishbob.appendChild(sh);
      } catch { /* tainted canvas */ }
    }
    this.$.fishbob.dataset.morph = morph;
    this.el.style.setProperty('--fw', `${ff.w}px`);
    this.el.style.setProperty('--fh', `${ff.h}px`);
    this.$.fishpos.style.transform = 'translate(-50%, -50%)';
    this.fish = { frames: ff.frames, cv, t: 0, k: 0, sparkT: egg.rarity >= 2 || morph !== 'normal' ? 0.4 : undefined, sparkCol: morph === 'golden' ? '#ffe27a' : this.rar[egg.rarity].glow };
  }

  // ------------------------------------------------------------------ reveal card
  buildCard(egg) {
    const R = this.rar[egg.rarity];
    const light = luma(R.color) > 0.62;
    const stars = clamp(Math.round(Number(egg.stars) || 1), 1, 5);
    const morph = egg.morph || { id: 'normal', name: 'Wild Type' };
    const mId = morph.id || morph;
    const mName = morph.name || (mId === 'normal' ? 'Wild Type' : String(mId));
    const chips = [];
    const sex = SEX[egg.sex];
    if (sex) chips.push(`<span class="egg-chip sex ${sex.cls}">${glyph(sex.g, 2)}${sex.name}</span>`);
    if (egg.size && egg.size.label) {
      const lbl = String(egg.size.label);
      const m = Number(egg.size.mult);
      const tip = `${SIZE_NAME[lbl] || lbl}${m ? ` · ×${m.toFixed(2).replace(/\.?0+$/, '')} body size` : ''}`;
      chips.push(`<span class="egg-chip size" data-tip="${esc(tip)}">${glyph('size', 2)}<b>${esc(lbl)}</b> size<i class="egg-tipbox">${esc(tip)}</i></span>`);
    }
    if (mId && mId !== 'normal') {
      const tip = `Colour morph${egg.morph && egg.morph.desc ? `: ${egg.morph.desc}` : ''}`;
      chips.push(`<span class="egg-chip morph m-${esc(mId)}" data-tip="${esc(tip)}">${glyph('gem', 2)}${esc(mName)}<i class="egg-tipbox">${esc(tip)}</i></span>`);
    }
    else chips.push('<span class="egg-chip wild">Wild type</span>');
    for (const t of egg.traits || []) {
      if (!t) continue;
      const ic = t.icon ? this.icon(t.icon, 1, 'egg-ti') : '';
      chips.push(`<span class="egg-chip trait ${t.good === false ? 'bad' : 'good'}" data-tip="${esc(t.desc || t.name)}">${ic}${esc(t.name || t.id)}<i class="egg-tipbox">${esc(t.desc || '')}</i></span>`);
    }
    let starsH = '';
    for (let k = 0; k < 5; k++) starsH += `<span class="egg-star" data-k="${k}">${this.icon('star_empty', this.phone ? 2 : 3)}</span>`;
    const val = Number(egg.value);
    return `
      <div class="egg-rib ${light ? 'dark' : ''} t${egg.rarity}"><span>${esc(R.name)}</span></div>
      <div class="egg-name">${esc(egg.speciesName || (SPECIES_BY_ID[egg.speciesId] || {}).name || 'Mystery fish')}</div>
      <div class="egg-latin">${esc(egg.latin || (SPECIES_BY_ID[egg.speciesId] || {}).latin || '')}</div>
      <div class="egg-starrow"><span class="egg-stars" data-n="${stars}">${starsH}</span>${val > 0 ? `<span class="egg-val">${this.icon('coin', 2)}<b>${fmtInt(val)}</b></span>` : ''}</div>
      <div class="egg-chips">${chips.join('')}</div>`;
  }

  placeReveal(animate) {
    const card = this.$.card;
    const cr = card.getBoundingClientRect();
    const topBar = (this.$.top.getBoundingClientRect().bottom || 50) + 8;
    const newsH = this.$.news.childElementCount ? (this.phone ? 34 : 40) : 0;
    const fishH = this.fish ? this.fish.cv.height : 100;
    let cardTop = cr.top;
    if (!(cardTop > 0)) cardTop = this.H * 0.55;
    let fy = Math.round((topBar + newsH + cardTop) / 2 + 4);
    fy = Math.max(topBar + newsH + fishH / 2, fy);
    const dy = fy - this.eggY;
    this.fishDY = dy;
    const tf = `translate(-50%, -50%) translateY(${dy}px)`;
    if (animate) this.seq.anim(this.$.fishpos, [{ transform: 'translate(-50%, -50%)' }, { transform: tf }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'both' });
    else { this.$.fishpos.getAnimations().forEach((a) => a.cancel()); this.$.fishpos.style.transform = tf; }
    this.$.news.style.top = `${Math.round(fy - fishH / 2 - newsH + 2)}px`;
    this.$.world.style.setProperty('--fy', `${fy}px`);
  }

  async reveal(egg) {
    const seq = this.seq;
    if (this.state === 'dead') return;
    this.state = 'reveal';
    const card = this.$.card;
    card.innerHTML = this.buildCard(egg);
    card.dataset.tier = String(egg.rarity);
    // news ribbons (NEW SPECIES / NEW MORPH)
    const news = [];
    if (egg.isNewSpecies) news.push('NEW SPECIES!');
    if (egg.isNewMorph) news.push('NEW MORPH!');
    this.$.news.innerHTML = news.map((t) => `<div class="egg-new ${frameCls('ribbon_green')}"><span>${t}</span></div>`).join('');
    card.classList.add('on');
    this.el.classList.add('revealed');
    this.placeReveal(true);
    this.sfx('whoosh', { pitch: 1.3 });
    seq.anim(card, [
      { transform: 'translate(-50%, 120%)', opacity: 0.4 },
      { transform: 'translate(-50%, -4%)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, 0)', opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'both' });
    const rib = card.querySelector('.egg-rib');
    seq.anim(rib, [{ transform: 'translateX(-50%) scale(2.4) rotate(-6deg)', opacity: 0 }, { transform: 'translateX(-50%) scale(0.92) rotate(1deg)', opacity: 1, offset: 0.7 }, { transform: 'translateX(-50%) scale(1) rotate(0deg)', opacity: 1 }], { duration: 420, delay: 260, easing: 'ease-out', fill: 'both' });
    await seq.sleep(560);
    if (this.state === 'dead') return;
    if (egg.rarity >= 3) {
      const rr = rib.getBoundingClientRect();
      this.fx.burst(rr.left + rr.width / 2, rr.top + rr.height / 2, 18 + egg.rarity * 6, { type: 'spark', colors: [this.rar[egg.rarity].glow, '#ffffff'], speed: 380, g: 80, drag: 2.4, life: 0.9, size: [1, 2], jitter: rr.width * 0.8 });
    }
    // NEW ribbons swoop in
    [...this.$.news.children].forEach((n, k) => {
      seq.anim(n, [{ transform: 'scale(0) rotate(-14deg)', opacity: 0 }, { transform: 'scale(1.18) rotate(3deg)', opacity: 1, offset: 0.65 }, { transform: 'scale(1) rotate(-2deg)', opacity: 1 }], { duration: 480, delay: k * 200, easing: 'ease-out', fill: 'both' });
      seq.after(k * 200 + 120, () => { if (!seq.ff) { this.sfx('star_pop', { pitch: 1.6 + k * 0.2 }); const nr = n.getBoundingClientRect(); this.fx.burst(nr.left + nr.width / 2, nr.top + nr.height / 2, 16, { type: 'spark', colors: ['#b8ff90', '#ffffff', '#ffe27a'], speed: 320, g: 120, drag: 2, life: 0.8, jitter: nr.width * 0.7 }); } });
    });
    // stars one by one
    const n = Number(card.querySelector('.egg-stars').dataset.n);
    const starEls = [...card.querySelectorAll('.egg-star')];
    for (let k = 0; k < n; k++) {
      await seq.sleep(k === 0 ? 120 : 190);
      if (this.state === 'dead') return;
      const s = starEls[k];
      s.innerHTML = this.icon('star', this.phone ? 2 : 3);
      s.classList.add('on');
      seq.anim(s, [{ transform: 'scale(0) rotate(-40deg)' }, { transform: 'scale(1.7) rotate(10deg)', offset: 0.55 }, { transform: 'scale(0.9)', offset: 0.8 }, { transform: 'scale(1) rotate(0deg)' }], { duration: 360, easing: 'ease-out' });
      if (!seq.ff) {
        this.sfx('star_pop', { pitch: 1 + k * 0.14 });
        const sr = s.getBoundingClientRect();
        this.fx.burst(sr.left + sr.width / 2, sr.top + sr.height / 2, 5 + k * 2, { type: 'spark', colors: ['#ffe27a', '#ffffff'], speed: 240, g: 200, drag: 2, life: 0.6, size: [0, 1] });
      }
    }
    if (n >= 5 && !seq.ff) {
      const row = card.querySelector('.egg-stars').getBoundingClientRect();
      this.fx.burst(row.left + row.width / 2, row.top + row.height / 2, 30, { type: 'conf', colors: ['#ffd23f', '#fff3a3', '#ffffff'], speed: 520, g: 700, drag: 2, life: 1.2, jitter: row.width });
    }
    card.querySelector('.egg-val')?.classList.add('on');
    // gene chips
    const chips = [...card.querySelectorAll('.egg-chip')];
    for (let k = 0; k < chips.length; k++) {
      await seq.sleep(k === 0 ? 180 : 140);
      if (this.state === 'dead') return;
      chips[k].classList.add('on');
      seq.anim(chips[k], [{ transform: 'translateY(10px) scale(0.5)', opacity: 0 }, { transform: 'translateY(-3px) scale(1.12)', opacity: 1, offset: 0.6 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      if (!seq.ff) this.sfx('chip', { pitch: 1 + k * 0.07 });
    }
    if (this.state === 'dead') return;
    seq.slow();
    // footer
    const left = this.eggs.length - 1 - this.idx;
    this.$.more.innerHTML = left > 0 ? `${eggCanvasHTML(this.eggs[this.idx + 1].rarity)}<b>${left}</b> more egg${left > 1 ? 's' : ''}` : (this.eggs.length > 1 ? 'Last one!' : '');
    this.$.foot.classList.add('on');
    this.$.foot.classList.toggle('solo', !(left > 0) && this.eggs.length <= 1);
    this.$.foot.querySelector('.egg-cont').textContent = left > 0 ? 'Tap for the next egg' : 'Tap to continue';
    this.state = 'ready';
    this.graceUntil = Math.max(this.graceUntil, performance.now() + 250);
    this.renderCount();
    this.armIdle(READY_MS, () => this.next());
  }

  async next() {
    if (this.state !== 'ready') return;
    const seq = this.seq;
    this.state = 'leaving';
    if (this.idleTimer) { seq.cancel(this.idleTimer); this.idleTimer = 0; }
    this.sfx('whoosh', { pitch: 1.1 });
    const more = this.idx + 1 < this.eggs.length;
    if (!more) { this.close(); return; }
    this.$.foot.classList.remove('on');
    this.$.card.querySelectorAll('.egg-chip.tip').forEach((c) => c.classList.remove('tip'));
    const a1 = seq.anim(this.$.card, [{ transform: 'translate(-50%, 0)', opacity: 1 }, { transform: 'translate(-50%, 130%)', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'both' });
    seq.anim(this.$.fishpop, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(20px) scale(1.1, 0.9)', opacity: 1, offset: 0.25 }, { transform: `translateY(${-this.H}px) scale(0.4, 1.4)`, opacity: 0 }], { duration: 480, easing: 'cubic-bezier(.5,0,.8,.3)', fill: 'both' });
    seq.anim(this.$.news, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'both' });
    await done(a1, 700);
    await seq.sleep(180);
    if (this.state === 'dead') return;
    this.$.card.getAnimations().forEach((a) => a.cancel());
    this.$.news.getAnimations().forEach((a) => a.cancel());
    this.$.card.classList.remove('on');
    this.runEgg(this.idx + 1);
  }

  // ------------------------------------------------------------------ skip -> summary grid
  skip() {
    if (this.state === 'summary' || this.state === 'closing' || this.state === 'dead') { if (this.state === 'summary') this.close(); return; }
    let from = this.idx;
    if (this.revealed.has(this.idx)) from = this.idx + 1;
    const rest = this.eggs.slice(Math.max(0, from));
    if (!rest.length) { this.close(); return; }
    this.showSummary(rest);
  }

  showSummary(rest) {
    const seq = this.seq;
    seq.fast();
    seq.slow();
    for (const id of seq.timers) clearTimeout(id);
    seq.timers.clear();
    this.idleTimer = 0; this.wobTimer = 0;
    this.state = 'summary';
    for (let k = 0; k < this.eggs.length; k++) this.revealed.add(k);
    this.idx = this.eggs.length - 1;
    this.renderCount();
    this.el.classList.add('summary');
    this.$.card.classList.remove('on');
    this.$.foot.classList.remove('on');
    this.$.prompt.classList.remove('on');
    this.$.label.classList.remove('on');
    this.fish = null;
    this.$.fishbob.innerHTML = '';
    this.$.shk.innerHTML = '';
    this.$.halves.innerHTML = '';
    this.$.news.innerHTML = '';
    this.$.beams.innerHTML = '';
    this.el.style.setProperty('--leak', '0');
    const best = rest.reduce((m, e) => Math.max(m, e.rarity), 0);
    this.setRarityLook(best, false);
    this.rays.target = 0.35;
    const cellMax = this.phone ? 84 : 110;
    let h = `<div class="egg-sumhead ${frameCls('ribbon_green')}"><span>${rest.length > 1 ? `${rest.length} new fish!` : 'New fish!'}</span></div><div class="egg-grid">`;
    rest.forEach((e, k) => {
      const R = this.rar[e.rarity];
      const mId = (e.morph && (e.morph.id || e.morph)) || 'normal';
      const stars = clamp(Math.round(Number(e.stars) || 1), 1, 5);
      let st = '';
      for (let s = 0; s < 5; s++) st += this.icon(s < stars ? 'star' : 'star_empty', 1);
      const badges = [e.isNewSpecies ? '<i class="egg-b new">NEW</i>' : '', e.isNewMorph ? '<i class="egg-b morph">MORPH</i>' : ''].join('');
      h += `<div class="egg-cell ${frameCls(e.rarity >= 4 ? 'slot_gold' : 'parchment')} t${e.rarity}" style="--rc:${R.color};--rg:${R.glow}" data-k="${k}">
        <div class="egg-cellfish"></div>${badges}
        <div class="egg-cellname">${esc(e.speciesName || (SPECIES_BY_ID[e.speciesId] || {}).name || '?')}</div>
        <div class="egg-cellmeta"><span class="egg-cr">${esc(R.name)}</span>${mId !== 'normal' ? `<span class="egg-cm m-${esc(mId)}">${esc((e.morph && e.morph.name) || mId)}</span>` : ''}</div>
        <div class="egg-cellstars">${st}</div></div>`;
    });
    h += `</div><div class="egg-sumfoot"><button type="button" class="cer-btn big ${frameCls('button_green')}" data-cer-own>Continue ${glyph('arrow', 2)}</button></div>`;
    this.$.sum.innerHTML = h;
    this.$.sum.classList.add('on');
    this.$.sum.querySelector('.egg-sumfoot button').addEventListener('click', (ev) => { ev.stopPropagation(); this.sfx('click'); this.close(); });
    const cells = [...this.$.sum.querySelectorAll('.egg-cell')];
    cells.forEach((cell, k) => {
      const e = rest[k];
      const ff = fishFrames(this.opts.fishCanvas, e.speciesId, e.morph, cellMax, cellMax * 0.6, { min: 1, max: 4, n: 1 });
      const c = ff.frames[0];
      c.className = 'px';
      cell.querySelector('.egg-cellfish').appendChild(c);
      seq.anim(cell, [{ transform: 'scale(0.3) translateY(30px)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 340, delay: 60 + k * 70, easing: 'ease-out', fill: 'backwards' });
      if (k < 12) seq.after(60 + k * 70, () => this.sfx(e.rarity >= 3 ? 'star_pop' : 'chip', { pitch: 1 + k * 0.05 }));
    });
    this.sfx('whoosh');
    this.graceUntil = performance.now() + 700;
    this.armIdle(SUMMARY_MS, () => this.close());
  }

  // ------------------------------------------------------------------ teardown
  async close(immediate = false) {
    if (this.state === 'closing' || this.state === 'dead') return;
    this.state = 'closing';
    if (this.idleTimer) this.seq.cancel(this.idleTimer);
    this.el.classList.add('closing');
    this.el.classList.remove('on');
    if (!immediate) {
      this.sfx('whoosh', { pitch: 0.9 });
      await new Promise((r) => setTimeout(r, 380));
    }
    this.destroy();
  }

  destroy() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.seq.kill();
    cancelAnimationFrame(this.raf);
    if (this.unbind) this.unbind();
    window.removeEventListener('resize', this.onResize);
    if (this.el) this.el.remove();
    this.fish = null;
    this.resolve();
  }
}

function opts_signal(o) { return o && o.signal && typeof o.signal.addEventListener === 'function'; }
function eggCanvasHTML(tier) {
  try { return `<img class="px egg-mini" src="${eggCanvas(tier, 0, 1).toDataURL()}" alt="">`; } catch { return ''; }
}
