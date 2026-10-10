// Bubbles: black-and-white cartoony pixel-art comic speech bubbles anchored
// above characters. Replaces text popups / notifications.
//
//   const bubbles = new Bubbles(root, { project, sfx, babble, icon, scale });
//     project(vec3) -> { x, y, visible }   world -> CSS px (viewport) projection
//     sfx(name, opts)                       optional ('pop_in', 'plop', 'click', 'hover')
//     babble(voice, text) -> seconds        optional voice; typing speed syncs to it
//     icon(name, scale) -> HTML string      optional inline icons (emote, item, {name} tokens)
//     scale                                 optional art-pixel scale (default 2)
//
//   const h = bubbles.say(anchor, text, opts)
//     anchor: { getWorldPos(outVec3) } | THREE.Vector3 | () => ({ x, y, visible? })
//     text:   plain text; "{fish}" inserts an inline icon, "*word*" emphasises, "\n" breaks
//     opts:   { voice, mood, emote, item, dur, wait, choices: [{ label, icon, value }],
//               size: 's'|'m'|'l', key, offsetY }
//     h = { done: Promise<value|undefined>, close(), setText(t), el }
//   bubbles.update(dt)   call every frame
//   bubbles.clear(pred?) close all (or those where pred({ key, anchor, opts, text }) is true)
//   bubbles.busy         any bubble waiting for input
//   bubbles.destroy()
//
//   pixelArrowButton(dir = 'left', { size = 2 }) -> HTMLButtonElement   B&W pixel arrow, no text
//
// Rendering: every bubble owns one small canvas at *art* resolution (1 canvas px
// = 1 art px) that is CSS-scaled by `scale` with image-rendering: pixelated, so
// outlines stay perfectly crisp at 2x / 3x. The silhouette is a boolean mask
// (rounded rect / spiky star / cloud + tail) that is dilated for the outline and
// offset for a dithered drop shadow. Everything is built lazily.
import { Vector3 } from 'three';
import './fonts.css';
import './bubbles.css';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const INK = [22, 17, 20];
const PAPER = [255, 255, 255];
const MARGIN = 9; // art px around the body inside the canvas (spikes, cloud puffs, outline, shadow)
const TAIL_DEF = 7; // default tail length, art px
const TAIL_MAX = 34;

const MOODS = ['normal', 'happy', 'angry', 'shout', 'think', 'whisper', 'scared', 'excited'];
const VARIANT = { shout: 'shout', think: 'think', whisper: 'whisper', scared: 'scared' };
const MOOD_SIZE = { shout: 'l', whisper: 's' };
const PAUSE = { '.': 0.16, '!': 0.16, '?': 0.16, ',': 0.08, '…': 0.2 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ============================================================================
// SHAPES (art-pixel masks)
// ============================================================================
// geometry g: { variant, bw, bh, tipDx, tailLen, frame, seed }
function shapeFn(g) {
  const { bw, bh, variant } = g;
  const R = Math.min(variant === 'whisper' ? 4 : 5, Math.floor(bh / 2));
  const tail = tailFn(g, R);

  if (variant === 'shout') {
    const poly = spikePoly(g);
    return (px, py) => inPoly(poly, px, py) || tail(px, py);
  }
  if (variant === 'think') {
    const circ = cloudCircles(g);
    const c = 6;
    return (px, py) => {
      if (px > c && px < bw - c && py > c && py < bh - c) return true;
      for (let i = 0; i < circ.length; i++) {
        const k = circ[i];
        const dx = px - k[0], dy = py - k[1];
        if (dx * dx + dy * dy <= k[2] * k[2]) return true;
      }
      return tail(px, py);
    };
  }
  if (variant === 'scared') {
    // wobbly edge that changes every frame (3 frames cycle)
    const ph = g.frame * 2.1 + 0.7;
    const k = Math.max(5, Math.round((bw + bh) / 7));
    return (px, py) => {
      const th = Math.atan2((py - bh / 2) / bh, (px - bw / 2) / bw);
      const w = Math.round(Math.sin(th * k + ph) * 0.85 + Math.sin(th * (k + 3) - ph * 1.7) * 0.45);
      return rr(px, py, bw, bh, R, w) || tail(px, py);
    };
  }
  return (px, py) => rr(px, py, bw, bh, R, 0) || tail(px, py);
}

function rr(px, py, bw, bh, R, w) {
  if (px < -w || px > bw + w || py < -w || py > bh + w) return false;
  const r = R + w;
  const dx = Math.max(R - px, 0, px - (bw - R));
  const dy = Math.max(R - py, 0, py - (bh - R));
  return dx * dx + dy * dy <= r * r + 0.3;
}

function tailFn(g, R) {
  const { bw, bh, tipDx, tailLen, variant } = g;
  if (tailLen < 2) return () => false;
  const lim = Math.max(0, bw / 2 - R - 5);
  const tipX = bw / 2 + tipDx;
  const baseX = bw / 2 + clamp(tipDx * 0.45, -lim, lim);
  if (variant === 'think') {
    // three little bubbles drifting down towards the speaker
    const dots = [
      [0.3, 3.2],
      [0.66, 2.3],
      [1.0, 1.5],
    ].map(([t, r]) => [baseX + (tipX - baseX) * t, bh + 2 + (tailLen - 2) * t - r * 0.3, r]);
    return (px, py) => {
      for (const d of dots) {
        const dx = px - d[0], dy = py - d[1];
        if (dx * dx + dy * dy <= d[2] * d[2]) return true;
      }
      return false;
    };
  }
  const HW = variant === 'shout' ? 5 : variant === 'whisper' ? 3 : 4;
  const curl = variant === 'shout' ? 0 : 1;
  return (px, py) => {
    if (py < bh - 3 || py > bh + tailLen) return false;
    const t = clamp((py - bh) / tailLen, 0, 1);
    // ease so the tail leaves the body leaning and ends pointing at the speaker
    const e = curl ? t * (2 - t) : t;
    const cx = baseX + (tipX - baseX) * e;
    const hw = HW * Math.pow(1 - t, 1.15) + 0.5;
    return Math.abs(px - cx) <= hw;
  };
}

function spikePoly(g) {
  const { bw, bh } = g;
  const a = bw / 2, b = bh / 2;
  const r = rng(g.seed);
  const per = Math.PI * (a + b);
  const n = Math.max(9, Math.round(per / 10));
  const pts = [];
  const off = r() * 0.5;
  for (let i = 0; i < n * 2; i++) {
    const th = ((i + off) / (n * 2)) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 0.5);
    const y = b * Math.sign(s) * Math.pow(Math.abs(s), 0.5);
    if (i % 2 === 0) {
      const L = 3.5 + r() * 3.5;
      const nx = x / (a * a), ny = y / (b * b);
      const nl = Math.hypot(nx, ny) || 1;
      pts.push([a + x + (nx / nl) * L, b + y + (ny / nl) * L]);
    } else {
      pts.push([a + x * 0.97, b + y * 0.95]);
    }
  }
  return pts;
}
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function cloudCircles(g) {
  const { bw, bh } = g;
  const r = rng(g.seed);
  const c = 6;
  const L = c, T = c, Rr = bw - c, B = bh - c;
  const out = [];
  const side = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / 10));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 6 + r() * 1.8]);
    }
  };
  side(L, T, Rr, T);
  side(Rr, T, Rr, B);
  side(Rr, B, L, B);
  side(L, B, L, T);
  return out;
}

// Render a bubble silhouette into `cv` (resized to fit). Returns body offset (art px).
function drawBubble(cv, g) {
  const M = MARGIN;
  const W = g.bw + M * 2;
  const H = g.bh + M + Math.max(M, g.tailLen + 5);
  // the bubble wasn't measurable yet (hidden / not laid out): try again next frame
  if (!(W > 0 && H > 0 && Number.isFinite(W) && Number.isFinite(H))) return false;
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const inside = shapeFn(g);
  const N = W * H;
  const mask = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const py = y - M + 0.5;
    for (let x = 0; x < W; x++) if (inside(x - M + 0.5, py)) mask[y * W + x] = 1;
  }
  const O = g.variant === 'whisper' ? 1 : 2;
  const offs = [];
  for (let dy = -O; dy <= O; dy++) for (let dx = -O; dx <= O; dx++) if ((dx || dy) && dx * dx + dy * dy <= O * O + 0.5) offs.push([dx, dy]);
  const line = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      for (const [dx, dy] of offs) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) {
          line[i] = 1;
          break;
        }
      }
    }
  if (g.variant === 'whisper') {
    // dashes: 3 on / 2 off, measured along the dominant edge direction
    const cx = M + g.bw / 2, cy = M + g.bh / 2;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!line[i]) continue;
        const horiz = Math.abs(y - cy) / g.bh > Math.abs(x - cx) / g.bw;
        const s = horiz ? x : y;
        if (y > M + g.bh + 1) continue; // keep the tail solid-ish
        if (s % 5 >= 3) line[i] = 0;
      }
  }
  const img = new ImageData(W, H);
  const d = img.data;
  const solid = (i) => mask[i] || line[i];
  const SX = 1, SY = 2; // shadow offset
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      let c = null, a = 255;
      if (line[i]) c = INK;
      else if (mask[i]) {
        c = PAPER;
        // soft dithered inner shade along the lower-right inside edge
        const j = (y + 2) * W + x + 1;
        if (y + 2 < H && x + 1 < W && line[j] && !line[(y + 1) * W + x] && ((x + y) & 1) === 0 && g.variant !== 'whisper') {
          c = [214, 214, 222];
        }
      } else if (x >= SX && y >= SY && solid((y - SY) * W + x - SX) && ((x + y) & 1) === 0) {
        c = INK;
        a = 200;
      }
      if (c) {
        d[o] = c[0];
        d[o + 1] = c[1];
        d[o + 2] = c[2];
        d[o + 3] = a;
      }
    }
  // gloss tick in the top-left (classic cartoon bubble shine)
  if (g.variant === 'normal' || g.variant === 'scared') {
    const gx = M + 3, gy = M + 2;
    const tick = [[1, 0], [2, 0], [3, 0], [0, 1], [0, 2]];
    for (const [tx, ty] of tick) {
      const i = (gy + ty) * W + gx + tx;
      if (mask[i] && !line[i]) {
        d[i * 4] = INK[0];
        d[i * 4 + 1] = INK[1];
        d[i * 4 + 2] = INK[2];
        d[i * 4 + 3] = 255;
      }
    }
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  return { W, H };
}

// ---------------------------------------------------------------- small pixel art
const _cache = new Map();
function cached(key, make) {
  let v = _cache.get(key);
  if (!v) _cache.set(key, (v = make()));
  return v;
}
function pixURL(rows, pal, S) {
  const h = rows.length, w = rows[0].length;
  const c = canvas(w * S, h * S);
  const x = c.getContext('2d');
  for (let y = 0; y < h; y++)
    for (let i = 0; i < w; i++) {
      const k = rows[y][i];
      if (k === '.' || !pal[k]) continue;
      x.fillStyle = pal[k];
      x.fillRect(i * S, y * S, S, S);
    }
  return c.toDataURL();
}
const PAL = { k: 'rgb(22,17,20)', w: '#fff', g: 'rgba(22,17,20,.78)' };
const ARROW_DOWN = ['wwwwwwwww', 'wkkkkkkkw', 'wwkkkkkww', '.wwkkkww.', '..wwkww..', '...www...'];
// pill 9-slice: 7 wide x 8 tall art px, slices 3 (top/left/right) and 4 (bottom: outline + shadow)
const PILL_SH = ['..kkk..', '.kwwwk.', 'kwwwwwk', 'kwwwwwk', 'kwwwwwk', '.kwwwk.', '.gkkkg.', '..ggg..'];
function pillURL(S, inv) {
  // drawn at 1 image px per art px: border-image slices (3/4) are in image px and
  // the browser scales it by --px with image-rendering: pixelated
  void S;
  return cached(`pill${inv ? 'i' : ''}`, () => {
    const pal = inv ? { k: PAL.k, w: PAL.k, g: PAL.g } : PAL;
    return pixURL(PILL_SH, pal, 1);
  });
}
function puffURL(S, big) {
  return cached(`puff${S}${big}`, () => {
    const r = big ? 6 : 4;
    const n = r * 2 + 3;
    const rows = [];
    for (let y = 0; y < n; y++) {
      let s = '';
      for (let x = 0; x < n; x++) {
        const dx = x - n / 2 + 0.5, dy = y - n / 2 + 0.5;
        const dd = dx * dx + dy * dy;
        s += dd <= r * r ? (dx + dy > r * 0.6 && (x + y) % 2 ? 'g' : 'w') : dd <= (r + 1.2) * (r + 1.2) ? 'k' : '.';
      }
      rows.push(s);
    }
    return pixURL(rows, { k: PAL.k, w: '#fff', g: '#c9c9d2' }, S);
  });
}

// ============================================================================
// ARROW BUTTON
// ============================================================================
const ARROW_L = ['...k....', '..kk....', '.kkkkkkk', 'kkkkkkkk', '.kkkkkkk', '..kk....', '...k....'];
function rot(rows, dir) {
  const h = rows.length, w = rows[0].length;
  const at = (x, y) => rows[y][x];
  const out = [];
  if (dir === 'left') return rows;
  if (dir === 'right') return rows.map((r) => r.split('').reverse().join(''));
  for (let x = 0; x < w; x++) {
    let s = '';
    for (let y = 0; y < h; y++) s += dir === 'up' ? at(x, h - 1 - y) : at(w - 1 - x, y);
    out.push(s);
  }
  return out;
}
export function pixelArrowButton(dir = 'left', { size = 2 } = {}) {
  const S = Math.max(1, Math.round(size));
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `bb-arrowbtn bb-arrow-${dir}`;
  b.setAttribute('aria-label', dir === 'left' ? 'Back' : dir === 'right' ? 'Next' : dir);
  b.style.setProperty('--px', S + 'px');
  b.style.setProperty('--pill', `url(${pillURL(S, false)})`);
  b.style.setProperty('--pill-i', `url(${pillURL(S, true)})`);
  const rows = rot(ARROW_L, dir);
  const a = cached(`arr${dir}${S}`, () => pixURL(rows, PAL, S));
  const ai = cached(`arr${dir}${S}i`, () => pixURL(rows, { k: '#fff' }, S));
  b.innerHTML = `<span class="bb-arrowbtn-in" style="width:${rows[0].length * S}px;height:${rows.length * S}px;--a:url(${a});--ai:url(${ai})"></span>`;
  return b;
}

// ============================================================================
// BUBBLES
// ============================================================================
let _uid = 1;

export class Bubbles {
  constructor(root, { project, sfx, babble, icon, scale } = {}) {
    this.root = root;
    this.project = project || (() => ({ x: 0, y: 0, visible: false }));
    this.sfx = sfx || (() => {});
    this.babble = babble || null;
    this.icon = icon || (() => '');
    this.S = Math.max(1, Math.round(scale || 2));
    this.list = [];
    this._v = new Vector3();
    this._z = 10;
    this.layer = document.createElement('div');
    this.layer.className = 'bb-layer';
    this.layer.style.setProperty('--px', this.S + 'px');
    this.layer.style.setProperty('--pill', `url(${pillURL(this.S, false)})`);
    this.layer.style.setProperty('--pill-i', `url(${pillURL(this.S, true)})`);
    this.layer.style.setProperty('--more', `url(${cached('more' + this.S, () => pixURL(ARROW_DOWN, PAL, this.S))})`);
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    root.appendChild(this.layer);
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => es.forEach((e) => e.target._bb && this._measure(e.target._bb))) : null;
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    if (document.fonts?.load) {
      Promise.all([document.fonts.load(`32px 'TBME Body'`), document.fonts.load(`36px 'TBME Title'`)])
        .then(() => this.list.forEach((b) => this._measure(b)))
        .catch(() => {});
    }
  }

  get busy() {
    return this.list.some((b) => b.wait && !b.closing);
  }

  say(anchor, text, opts = {}) {
    const mood = MOODS.includes(opts.mood) ? opts.mood : 'normal';
    if (opts.key != null) {
      const old = this.list.find((b) => b.key === opts.key && !b.closing);
      if (old) this._close(old, undefined, true);
    }
    const S = this.S;
    const b = {
      id: _uid++,
      key: opts.key,
      anchor,
      opts,
      mood,
      variant: VARIANT[mood] || 'normal',
      size: opts.size || MOOD_SIZE[mood] || 'm',
      wait: !!opts.wait,
      choices: Array.isArray(opts.choices) && opts.choices.length ? opts.choices : null,
      offsetY: opts.offsetY || 0,
      seed: (Math.random() * 1e9) | 0,
      t: 0,
      shown: 0,
      chars: [],
      text: '',
      closing: false,
      typed: false,
      init: false,
      x: 0,
      y: 0,
      frame: 0,
      frameT: 0,
      jitT: 0.4,
      geomKey: '',
      bw: 20,
      bh: 12,
    };
    if (b.choices) b.wait = true;
    let resolve;
    b.done = new Promise((r) => (resolve = r));
    b.resolve = resolve;

    const el = document.createElement('div');
    el.className = `bb bb-v-${b.variant} bb-m-${mood} bb-s-${b.size}` + (b.wait ? ' bb-wait' : '');
    if (opts.key) el.dataset.key = opts.key; // [v26 lead] lets CSS hide the corner-fox notes during the feast camera / cutscenes
    el.style.zIndex = String(++this._z);
    el.innerHTML =
      `<div class="bb-bob" style="animation-delay:${(-Math.random() * 3).toFixed(2)}s"><div class="bb-pop">` +
      `<canvas class="bb-bg"></canvas>` +
      `<div class="bb-body"><div class="bb-content"><div class="bb-row">` +
      (opts.emote ? `<span class="bb-emote">${this.icon(opts.emote, S)}</span>` : '') +
      `<div class="bb-text"></div>` +
      (opts.item ? `<span class="bb-item">${this.icon(opts.item, S)}</span>` : '') +
      `</div>` +
      (b.choices ? `<div class="bb-choices"></div>` : '') +
      `</div></div>` +
      (b.wait && !b.choices ? `<i class="bb-more"></i>` : '') +
      `</div></div>`;
    b.el = el;
    b.pop = el.querySelector('.bb-pop');
    b.cv = el.querySelector('.bb-bg');
    b.body = el.querySelector('.bb-body');
    b.content = el.querySelector('.bb-content');
    b.textEl = el.querySelector('.bb-text');
    b.more = el.querySelector('.bb-more');
    b.content._bb = b;
    if (b.choices) {
      const row = el.querySelector('.bb-choices');
      b.choices.forEach((c, i) => {
        const p = document.createElement('button');
        p.type = 'button';
        p.className = 'bb-pill';
        p.style.setProperty('--d', i * 0.06 + 's');
        p.innerHTML = (c.icon ? `<span class="bb-pill-ico">${this.icon(c.icon, S)}</span>` : '') + (c.label ? `<span>${esc(c.label)}</span>` : '');
        p.addEventListener('pointerenter', () => this.sfx('hover', { volume: 0.4 }));
        p.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!b.typed) return this._finishTyping(b);
          this.sfx('click');
          p.classList.add('bb-picked');
          this._close(b, c.value);
        });
        row.appendChild(p);
      });
    }
    el.addEventListener('pointerdown', (e) => {
      if (!b.wait || b.closing) return;
      e.stopPropagation();
    });
    el.addEventListener('click', (e) => {
      if (!b.wait || b.closing) return;
      e.stopPropagation();
      this._advance(b);
    });

    this.layer.appendChild(el);
    this._setText(b, text);
    this._ro?.observe(b.content);
    this.list.push(b);
    this.sfx('pop_in', { volume: mood === 'whisper' ? 0.3 : 0.6, pitch: mood === 'shout' ? 0.8 : 1 + Math.random() * 0.15 });
    if (REDUCED) el.classList.add('bb-reduced');

    const handle = {
      done: b.done,
      el,
      close: () => this._close(b, undefined),
      setText: (t) => this._setText(b, t),
    };
    b.handle = handle;
    this._place(b, 0, true);
    return handle;
  }

  _setText(b, text) {
    b.text = String(text ?? '');
    b.textEl.innerHTML = '';
    b.chars = [];
    let i = 0;
    let em = false;
    const lines = b.text.split('\n');
    lines.forEach((line, li) => {
      if (li) b.textEl.appendChild(document.createElement('br'));
      const words = line.split(/( +)/);
      for (const w of words) {
        if (!w) continue;
        if (/^ +$/.test(w)) {
          const sp = document.createElement('span');
          sp.className = 'bb-sp';
          sp.textContent = ' ';
          b.textEl.appendChild(sp);
          b.chars.push({ el: null, ch: ' ' });
          continue;
        }
        const wEl = document.createElement('span');
        wEl.className = 'bb-w';
        const re = /\{([a-z0-9_]+)\}|\*|./gi;
        let m;
        while ((m = re.exec(w))) {
          if (m[0] === '*') {
            em = !em;
            continue;
          }
          const c = document.createElement('span');
          c.className = 'bb-ch' + (em ? ' bb-em' : '');
          c.style.setProperty('--i', i++);
          if (m[1]) {
            c.classList.add('bb-ico');
            c.innerHTML = `<span>${this.icon(m[1], this.S)}</span>`;
          } else {
            const inner = document.createElement('span');
            inner.textContent = m[0];
            c.appendChild(inner);
          }
          wEl.appendChild(c);
          b.chars.push({ el: c, ch: m[1] ? '' : m[0] });
        }
        b.textEl.appendChild(wEl);
      }
    });
    b.shown = 0;
    b.revealed = 0;
    b.typed = false;
    b.t = 0;
    b.el.classList.remove('bb-ready');
    const n = b.chars.length;
    let cps = b.mood === 'whisper' ? 22 : b.mood === 'shout' || b.mood === 'excited' ? 40 : 30;
    if (b.opts.voice && this.babble && b.text) {
      try {
        const secs = this.babble(b.opts.voice, b.text.replace(/\{[a-z0-9_]+\}|\*/gi, ''));
        if (secs > 0.05) cps = clamp(n / secs, 14, 70);
      } catch (e) {
        /* ignore */
      }
    }
    if (REDUCED) cps = 1e4;
    b.cps = cps;
    const typeT = n / cps;
    b.dur = b.opts.dur != null ? b.opts.dur : 1.2 + 0.05 * n;
    b.dur = Math.max(b.dur, typeT + 0.6);
    this._measure(b);
  }

  _measure(b) {
    if (b.closing) return;
    const S = this.S;
    const cw = b.content.offsetWidth, ch = b.content.offsetHeight;
    if (!cw || !ch) return;
    const ax = Math.ceil(cw / S), ay = Math.ceil(ch / S);
    let bw, bh;
    if (b.variant === 'shout') {
      bw = Math.round(ax * 1.22 + 10);
      bh = Math.round(ay * 1.3 + 9);
    } else if (b.variant === 'think') {
      bw = ax + 16;
      bh = ay + 12;
    } else {
      const px = b.size === 's' ? 4 : 5, py = b.size === 's' ? 2 : 3;
      bw = ax + px * 2;
      bh = ay + py * 2;
    }
    bh = Math.max(bh, 11);
    bw = Math.max(bw, bh + 4);
    b.bw = bw;
    b.bh = bh;
    b.body.style.width = bw * S + 'px';
    b.body.style.height = bh * S + 'px';
    b.content.style.left = Math.floor((bw - ax) / 2) * S + 'px';
    b.content.style.top = Math.floor((bh - ay) / 2) * S + 'px';
    b.geomKey = '';
  }

  _advance(b) {
    if (!b.typed) return this._finishTyping(b);
    if (b.choices) return;
    this.sfx('click', { volume: 0.5 });
    this._close(b, undefined);
  }

  _finishTyping(b) {
    b.shown = b.chars.length;
  }

  _key(e) {
    const w = this.list.filter((b) => b.wait && !b.closing);
    if (!w.length) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const b = w[w.length - 1];
    if (e.code === 'Space' || e.key === 'Enter') {
      if (b.choices && b.typed) {
        const f = b.el.querySelector('.bb-pill:focus');
        if (!f) return;
        return; // let the focused button handle it natively
      }
      e.preventDefault();
      this._advance(b);
    } else if (b.choices && /^[1-9]$/.test(e.key)) {
      const c = b.choices[+e.key - 1];
      if (!c) return;
      e.preventDefault();
      if (!b.typed) return this._finishTyping(b);
      this.sfx('click');
      this._close(b, c.value);
    }
  }

  _close(b, value, instant = false) {
    if (b.closing) return;
    b.closing = true;
    b.resolve(value);
    this._ro?.unobserve(b.content);
    const el = b.el;
    if (instant || REDUCED) {
      el.remove();
      this.list = this.list.filter((x) => x !== b);
      return;
    }
    el.classList.add('bb-out');
    this.sfx('plop', { volume: 0.35, pitch: 1.3 });
    setTimeout(() => {
      this._poof(b);
      el.remove();
      this.list = this.list.filter((x) => x !== b);
    }, 150);
  }

  _poof(b) {
    const S = this.S;
    const cx = b.x + (b.bw * S) / 2, cy = b.y + (b.bh * S) / 2;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const big = i % 2 === 0;
      const p = document.createElement('i');
      p.className = 'bb-puff';
      const sz = (big ? 15 : 11) * S;
      const rx = (b.bw * S) / 2 * 0.55, ry = (b.bh * S) / 2 * 0.55;
      p.style.cssText = `left:${Math.round(cx + Math.cos(a) * rx - sz / 2)}px;top:${Math.round(cy + Math.sin(a) * ry - sz / 2)}px;width:${sz}px;height:${sz}px;background-image:url(${puffURL(S, big ? 1 : 0)});--dx:${Math.round(Math.cos(a) * 7) * S}px;--dy:${Math.round(Math.sin(a) * 5 - 3) * S}px;animation-delay:${(Math.random() * 0.05).toFixed(3)}s`;
      this.layer.appendChild(p);
      setTimeout(() => p.remove(), 520);
    }
  }

  clear(pred) {
    for (const b of this.list.slice()) {
      if (b.closing) continue;
      if (!pred || pred({ key: b.key, anchor: b.anchor, opts: b.opts, text: b.text, handle: b.handle })) this._close(b, undefined);
    }
  }

  destroy() {
    window.removeEventListener('keydown', this._onKey);
    this._ro?.disconnect();
    for (const b of this.list) b.resolve(undefined);
    this.list = [];
    this.layer.remove();
  }

  // ---------------------------------------------------------------- per frame
  _anchorPos(b) {
    const a = b.anchor;
    let p = null;
    try {
      if (typeof a === 'function') p = a();
      else if (a && typeof a.getWorldPos === 'function') {
        a.getWorldPos(this._v);
        p = this.project(this._v);
      } else if (a && a.isVector3) p = this.project(a);
      else if (a && typeof a.x === 'number' && typeof a.y === 'number' && a.z === undefined) p = a;
    } catch (e) {
      p = null;
    }
    if (!p) return { x: 0, y: 0, visible: false };
    return { x: p.x - this._rx, y: p.y - this._ry, visible: p.visible !== false };
  }

  update(dt) {
    dt = clamp(+dt || 0, 0, 0.1);
    const r = this.root.getBoundingClientRect();
    this._rx = r.left;
    this._ry = r.top;
    this._W = this.root.clientWidth || innerWidth;
    this._H = this.root.clientHeight || innerHeight;
    const live = this.list.filter((b) => !b.closing);
    for (const b of live) this._tick(b, dt);
    this._layout(live, dt);
  }

  _tick(b, dt) {
    b.t += dt;
    const n = b.chars.length;
    if (b.shown < n) {
      b.shown += dt * b.cps;
      while (b.revealed < Math.min(n, Math.floor(b.shown))) {
        const c = b.chars[b.revealed++];
        if (c.el) c.el.classList.add('on');
        const p = PAUSE[c.ch];
        if (p && b.revealed < n && !REDUCED) b.shown -= p * b.cps;
      }
    } else if (b.revealed < n) {
      while (b.revealed < n) b.chars[b.revealed++].el?.classList.add('on');
    }
    if (!b.typed && b.revealed >= n) {
      b.typed = true;
      b.typedAt = b.t;
      b.el.classList.add('bb-ready');
    }
    if (b.mood === 'angry' && b.typed) {
      b.jitT -= dt;
      if (b.jitT <= 0) {
        b.jitT = 0.25 + Math.random() * 0.6;
        const cs = b.chars.filter((c) => c.el);
        const c = cs[(Math.random() * cs.length) | 0];
        if (c) {
          c.el.classList.remove('jit');
          void c.el.offsetWidth;
          c.el.classList.add('jit');
        }
      }
    }
    if (b.variant === 'scared') {
      b.frameT += dt;
      if (b.frameT > 0.09) {
        b.frameT = 0;
        b.frame = (b.frame + 1) % 3;
      }
    }
    if (!b.wait && b.t >= b.dur && b.typed) this._close(b, undefined);
  }

  _layout(live, dt) {
    const S = this.S;
    const W = this._W, H = this._H;
    const pad = 4;
    const arr = [];
    for (const b of live) {
      const a = this._anchorPos(b);
      b.ax = a.x;
      b.ay = a.y - b.offsetY;
      b.vis = a.visible;
      b.el.classList.toggle('bb-hidden', !a.visible);
      if (!a.visible) continue;
      const w = b.bw * S, h = b.bh * S;
      b.w = w;
      b.h = h;
      b.tx = b.ax - w / 2;
      b.ty = b.ay - TAIL_DEF * S - h - (b.variant === 'think' ? 3 * S : 0);
      arr.push(b);
    }
    // de-overlap: older bubbles get pushed up (stack), side-by-side ones nudge apart
    const g = 3 * S;
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < arr.length; i++)
        for (let j = i + 1; j < arr.length; j++) {
          const A = arr[i], B = arr[j];
          const ox = Math.min(A.tx + A.w, B.tx + B.w) - Math.max(A.tx, B.tx) + g;
          const oy = Math.min(A.ty + A.h, B.ty + B.h) - Math.max(A.ty, B.ty) + g;
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy * 0.8) {
            const s = A.tx + A.w / 2 < B.tx + B.w / 2 || (A.tx === B.tx && A.id < B.id) ? -1 : 1;
            A.tx += (s * ox) / 2;
            B.tx -= (s * ox) / 2;
          } else {
            // older (A) goes above newer (B)
            if (A.ty + A.h / 2 <= B.ty + B.h / 2) A.ty -= oy;
            else B.ty -= oy;
          }
        }
    }
    const k = 1 - Math.exp(-dt * 14);
    for (const b of arr) {
      b.tx = clamp(b.tx, pad, Math.max(pad, W - b.w - pad));
      b.ty = clamp(b.ty, pad + MARGIN * S * 0.3, Math.max(pad, H - b.h - pad));
      if (!b.init) {
        b.x = b.tx;
        b.y = b.ty;
        b.init = true;
      } else {
        b.x += (b.tx - b.x) * k;
        b.y += (b.ty - b.y) * k;
      }
      this._place(b, dt);
    }
  }

  _place(b, dt, first) {
    const S = this.S;
    if (first) {
      // provisional placement before the first update()
      this._rx ??= this.root.getBoundingClientRect().left;
      this._ry ??= this.root.getBoundingClientRect().top;
      const a = this._anchorPos(b);
      b.x = a.x - (b.bw * S) / 2;
      b.y = a.y - b.offsetY - TAIL_DEF * S - b.bh * S;
      b.ax = a.x;
      b.ay = a.y - b.offsetY;
    }
    const x = Math.round(b.x / S) * S, y = Math.round(b.y / S) * S;
    const tipDx = b.ax != null ? clamp(Math.round((b.ax - (x + (b.bw * S) / 2)) / S), -(b.bw / 2) - 14, b.bw / 2 + 14) : 0;
    let tailLen = b.ay != null ? Math.round((b.ay - (y + b.bh * S)) / S) : TAIL_DEF;
    tailLen = !Number.isFinite(tailLen) ? TAIL_DEF : tailLen < 3 ? 0 : Math.min(tailLen, TAIL_MAX);
    const key = `${b.bw},${b.bh},${tipDx},${tailLen},${b.frame}`;
    if (key !== b.geomKey) {
      const got = Number.isFinite(tipDx) ? drawBubble(b.cv, { variant: b.variant, bw: b.bw, bh: b.bh, tipDx, tailLen, frame: b.frame, seed: b.seed }) : false;
      if (!got) return; // not measurable yet: retry next frame
      b.geomKey = key;
      const { W, H } = got;
      b.cv.style.width = W * S + 'px';
      b.cv.style.height = H * S + 'px';
      b.cv.style.left = -MARGIN * S + 'px';
      b.cv.style.top = -MARGIN * S + 'px';
      const ox = (b.bw / 2 + tipDx) * S, oy = (b.bh + Math.max(tailLen, 2)) * S;
      b.pop.style.transformOrigin = `${ox}px ${oy}px`;
      b.el.querySelector('.bb-bob').style.transformOrigin = `${ox}px ${oy}px`;
    }
    b.el.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
}
