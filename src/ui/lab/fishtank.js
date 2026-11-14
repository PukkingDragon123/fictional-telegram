// [v33 lab4] The fish card's tank: a detailed little 2D pixel-art aquarium (1 art px per CSS px)
// on the project card of a fish topic (src/ui/LabTree.js). A brass rim with rivets and a lid
// lip, a carved oak stand, glass with reflections and a front glint, back water in dithered
// bands, coloured gravel, swaying plants (2 frames), driftwood, an airstone bubbler, stepped
// caustic shimmer (4 frames) - and the selected fish swimming with its real swim frames,
// turning at the glass. A locked fish is a dark silhouette in murky water.
// Static layers are painted once per size and cached; a frame is a few drawImage calls
// (the caller runs it at ~12 fps, only while the card is on screen).
//
//   const T = new FishTank(canvas, (species, frame) => canvas);
//   T.fit(cssW, cssH); T.set(species, { dark }); T.draw(t, dt);
import { canvas, OAK, BRASS, shadeOf, plank } from './wood.js';

const LAYERS = new Map();
const INK = [26, 14, 6];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.47);
const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function px(ctx) {
  const p = (c, x, y, w = 1, h = 1) => { ctx.fillStyle = typeof c === 'string' ? c : `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
  return p;
}

// geometry shared by the layers
function geo(W, H) {
  const rim = 5, base = 9, glass = 2;
  return { rim, base, glass, x0: glass, x1: W - glass, y0: rim, y1: H - base, floor: H - base - 9 };
}

function layers(W, H, murky) {
  const key = `${W}x${H}|${murky ? 1 : 0}`;
  let L = LAYERS.get(key);
  if (L) return L;
  if (LAYERS.size > 8) LAYERS.clear();
  const G = geo(W, H), R = rnd(77 + W);
  // ---- back: water bands, a far rock ridge, gravel bed, driftwood, the airstone
  const back = canvas(W, H), bx = back.getContext('2d', { willReadFrequently: true }), p = px(bx);
  const water = murky ? ['#1c2a26', '#20302c', '#243630', '#283c34', '#2c4038'].map(hex) : ['#9cd8d8', '#7cc6cc', '#60b2bc', '#4c9eae', '#3a8aa0', '#2e7890'].map(hex);
  for (let y = G.y0; y < G.y1; y++) for (let x = G.x0; x < G.x1; x++) {
    const k = (y - G.y0) / (G.y1 - G.y0);
    p(water[Math.max(0, Math.min(water.length - 1, Math.floor(k * water.length + bay(x, y))))], x, y);
  }
  // far ridge (hazy)
  const haze = murky ? '#2a3a34' : '#5aa4ae';
  for (let x = G.x0; x < G.x1; x++) { const h = 6 + Math.round(Math.sin(x * 0.11) * 3 + Math.sin(x * 0.31) * 1.5); p(haze, x, G.floor - h, 1, h); }
  // driftwood
  if (!murky) {
    const dx = Math.round(W * 0.58);
    for (let i = 0; i < 26; i++) { const y = G.floor - 2 - Math.round(i * 0.35); p('#3a2410', dx + i, y - 1, 1, 4); p(i % 5 ? '#6a4628' : '#8a5e36', dx + i, y, 1, 2); }
    p('#3a2410', dx + 10, G.floor - 12, 2, 8); p('#6a4628', dx + 11, G.floor - 11, 1, 6);
  }
  // gravel bed: coloured pebbles, darker under, a lit top edge
  const gcol = murky ? ['#3a3a32', '#2e2e28', '#46463c'] : ['#c8a878', '#a88858', '#e0c898', '#8aa0a8', '#c87a5a', '#e8e0c8'];
  for (let y = G.floor; y < G.y1; y++) for (let x = G.x0; x < G.x1; x++) p(gcol[(x * 7 + y * 13 + ((x * y) >> 2)) % gcol.length], x, y);
  for (let x = G.x0; x < G.x1; x++) { if ((x * 5) % 7 < 3) p(murky ? '#56564a' : '#f6ecd0', x, G.floor); p(murky ? '#22221e' : '#6a5838', x, G.y1 - 1); }
  for (let i = 0; i < W / 3; i++) { const x = G.x0 + Math.floor(R() * (G.x1 - G.x0 - 2)), y = G.floor + 1 + Math.floor(R() * 7); p(murky ? '#1e1e1a' : '#5a4a30', x + 1, y + 1); p(gcol[i % gcol.length], x, y, 2, 1); }
  // airstone + its hose up the back corner
  const ax = G.x0 + 8;
  p('#1a1a1a', ax - 1, G.floor - 3, 7, 4); p(murky ? '#3a3e40' : '#8a96a0', ax, G.floor - 3, 5, 3); p(murky ? '#4a4e50' : '#c0c8d0', ax, G.floor - 3, 2, 1);
  for (let y = G.y0; y < G.floor - 3; y++) p(murky ? '#2a3a38' : '#d0eef0', ax + 2, y, 1, 1);
  // ---- plants: two sway frames, in front of the back, behind the fish front
  const plants = [0, 1].map((f) => {
    const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }), q = px(x);
    const greens = murky ? ['#1e2e22', '#26382a', '#2e4232'] : ['#1e6a34', '#2e8a44', '#4cb05a', '#8ad87a'];
    const strands = [[G.x0 + 3, 0.7], [G.x0 + 16, 0.5], [G.x1 - 6, 0.8], [G.x1 - 14, 0.55], [G.x1 - 24, 0.35]];
    strands.forEach(([sx, k], si) => {
      const h = Math.round((G.floor - G.y0) * k);
      for (let y = 0; y < h; y++) {
        const sw = Math.round(Math.sin(y / 7 + si + f * 1.1) * (y / h) * 2);
        q(INK, sx + sw - 1, G.floor - y, 3, 1);
        q(greens[1], sx + sw, G.floor - y, 1, 1);
        if (y % 4 === 2) { const s = (y >> 2) % 2 ? 1 : -1; q(INK, sx + sw + (s > 0 ? 1 : -4), G.floor - y - 1, 4, 3); q(greens[2], sx + sw + (s > 0 ? 1 : -3), G.floor - y, 3, 1); q(greens[3] || greens[2], sx + sw + (s > 0 ? 2 : -2), G.floor - y - 1, 1, 1); }
      }
    });
    return c;
  });
  // ---- caustics: 4 stepped frames of light squiggles (on the gravel and the upper water)
  const caus = [0, 1, 2, 3].map((f) => {
    const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }), q = px(x);
    if (murky) return c;
    const r = rnd(300 + f * 17);
    for (let i = 0; i < W / 4; i++) {
      const cx = G.x0 + Math.floor(r() * (G.x1 - G.x0 - 6)), cy = G.floor + Math.floor(r() * 6);
      for (let k = 0; k < 4; k++) q('rgba(255,250,220,.7)', cx + k, cy + ((k + f) % 3 === 0 ? 1 : 0));
    }
    for (let i = 0; i < W / 6; i++) { const cx = G.x0 + Math.floor(r() * (G.x1 - G.x0)), cy = G.y0 + 2 + Math.floor(r() * r() * (G.floor - G.y0) * 0.6); q('rgba(255,255,255,.35)', cx, cy, 2, 1); }
    return c;
  });
  // ---- front: the glass (side glints, a diagonal glare), the brass rim, the oak stand
  const front = canvas(W, H), fx = front.getContext('2d', { willReadFrequently: true }), fp = px(fx);
  for (let y = G.y0; y < G.y1; y++) { fp('rgba(220,248,255,.55)', G.x0, y); fp('rgba(220,248,255,.35)', G.x1 - 1, y); }
  fp(INK, 0, G.y0, G.glass, G.y1 - G.y0); fp(INK, W - G.glass, G.y0, G.glass, G.y1 - G.y0);
  for (let i = 0; i < 18; i++) { const x = Math.round(W * 0.16) + i, y = G.y0 + 3 + Math.round(i * 0.9); if (y < G.floor - 2) { fp('rgba(255,255,255,.45)', x, y, 2, 1); } }
  for (let i = 0; i < 10; i++) { const x = Math.round(W * 0.2) + i, y = G.y0 + 3 + Math.round(i * 0.9); if (y < G.floor - 2) fp('rgba(255,255,255,.25)', x + 4, y, 1, 1); }
  // the water line under the lid
  for (let x = G.x0; x < G.x1; x++) fp(x % 3 ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.25)', x, G.y0 + 1);
  // brass rim with rivets
  for (let y = 0; y < G.rim; y++) for (let x = 0; x < W; x++) {
    const e = y === 0 || y === G.rim - 1 || x === 0 || x === W - 1;
    fp(e ? INK : BRASS[Math.max(0, Math.min(7, Math.floor(6.2 - y * 1.1 + bay(x, y))))], x, y);
  }
  for (let x = 6; x < W - 4; x += 14) { fp(INK, x, 2, 2, 2); fp(BRASS[7], x, 2); }
  // the oak stand (a little plank with a groove) and its feet
  const st = plank(W, G.base, { ramp: OAK, seed: 9, screws: false, grooveIn: 0 });
  fx.drawImage(st, 0, H - G.base);
  for (const x of [3, W - 7]) { fp(INK, x, H - 2, 4, 2); fp(BRASS[4], x + 1, H - 2, 2, 1); }
  L = { back, plants, caus, front, G };
  LAYERS.set(key, L);
  return L;
}

const TINT = new Map();
function silhouette(src, col, key) {
  let c = TINT.get(key);
  if (c) return c;
  if (TINT.size > 60) TINT.clear();
  c = canvas(src.width, src.height);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = col;
  x.fillRect(0, 0, c.width, c.height);
  TINT.set(key, c);
  return c;
}

export class FishTank {
  constructor(cv, frameFn) {
    this.cv = cv;
    this.ctx = cv.getContext('2d', { willReadFrequently: true });
    this.frameFn = frameFn;
    this.W = 0; this.H = 0;
    this.sp = null; this.dark = false;
    this.f = { x: 40, y: 30, dir: 1, v: 9, turn: 0 };
    this.bub = [];
    this.R = rnd(5);
  }
  fit(w, h) {
    w = Math.max(60, Math.floor(w)); h = Math.max(40, Math.floor(h));
    if (w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.cv.width = w; this.cv.height = h;
    this.cv.style.width = `${w}px`; this.cv.style.height = `${h}px`;
    this.f.x = w * 0.45;
  }
  set(sp, { dark = false } = {}) {
    if (sp !== this.sp) { this.f.x = this.W * (0.3 + this.R() * 0.3); this.f.dir = this.R() < 0.5 ? -1 : 1; }
    this.sp = sp; this.dark = dark;
  }
  draw(t, dt) {
    const W = this.W, H = this.H;
    if (!W || !this.sp) return;
    const L = layers(W, H, this.dark), G = L.G, c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, H);
    c.drawImage(L.back, 0, 0);
    c.drawImage(L.caus[Math.floor(t * 5) % 4], 0, 0);
    // the fish: real swim frames, turns at the glass (a beat of a squeeze while it turns)
    let img = null;
    try { img = this.frameFn(this.sp, Math.floor(t * 7) % 4); } catch { img = null; }
    if (img) {
      const f = this.f, s = img.width * 2 <= W * 0.42 && img.height * 2 <= (G.floor - G.y0) * 0.7 ? 2 : 1;
      const w = img.width * s, h = img.height * s;
      if (f.turn > 0) f.turn -= dt;
      else f.x += f.dir * (this.dark ? 4 : 9 + s * 2) * dt;
      if (f.x > G.x1 - w / 2 - 3 && f.dir > 0) { f.dir = -1; f.turn = 0.35; }
      if (f.x < G.x0 + w / 2 + 3 && f.dir < 0) { f.dir = 1; f.turn = 0.35; }
      const midY = G.y0 + (G.floor - G.y0) * 0.48;
      const y = Math.round(midY - h / 2 + Math.sin(t * 1.7) * 2);
      const X = Math.round(f.x - w / 2);
      const src = this.dark ? silhouette(img, '#0c1412', `${this.sp}|${Math.floor(t * 7) % 4}`) : img;
      const squeeze = f.turn > 0 ? Math.max(0.35, Math.abs(f.turn - 0.175) / 0.175) : 1;
      const ww = Math.max(2, Math.round(w * squeeze));
      c.save();
      if (f.dir < 0) { c.translate(X + w / 2 + ww / 2, y); c.scale(-1, 1); c.drawImage(src, 0, 0, ww, h); }
      else c.drawImage(src, Math.round(X + (w - ww) / 2), y, ww, h);
      c.restore();
      if (this.dark) { // a little pixel '?' over the silhouette
        c.fillStyle = 'rgba(210,230,220,.7)';
        const qx = Math.round(X + w / 2 - 1), qy = y - 8;
        for (const [a, b] of [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [1, 4]]) c.fillRect(qx + a, qy + b, 1, 1);
      }
    }
    c.drawImage(L.plants[Math.floor(t * 1.3) % 2], 0, 0);
    // bubbles from the airstone (and a few from the fish)
    if (!this.dark && this.bub.length < 14 && this.R() < dt * 6) this.bub.push({ x: G.x0 + 10 + this.R() * 3, y: G.floor - 4, v: 10 + this.R() * 8, r: this.R() < 0.3 ? 2 : 1 });
    const keep = [];
    for (const b of this.bub) {
      b.y -= b.v * dt; b.x += Math.sin(t * 4 + b.y * 0.3) * 0.12;
      if (b.y < G.y0 + 2) continue;
      if (b.r > 1) { c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(Math.round(b.x), Math.round(b.y), 2, 2); c.fillStyle = 'rgba(120,200,220,.9)'; c.fillRect(Math.round(b.x) + 1, Math.round(b.y) + 1, 1, 1); }
      else { c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
      keep.push(b);
    }
    this.bub = keep;
    c.drawImage(L.front, 0, 0);
  }
}

// [v33 lab4] the stat icons on the fish card (tiny pixel glyphs as data-URL SVG images)
export function glyph(rows, pal, scale = 1, cls = 'lt-g') {
  const w = rows[0].length, h = rows.length;
  let r = '';
  rows.forEach((row, y) => { for (let x = 0; x < w; x++) { const ch = row[x]; if (ch !== '.') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; } });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${r}</svg>`;
  return `<img class="${cls}" width="${w * scale}" height="${h * scale}" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="" aria-hidden="true">`;
}
export { shadeOf };
