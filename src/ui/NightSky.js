// [v26 evening] The sky over the valley, as a full-screen pixel-art vignette (one low-res canvas):
//   'night'  the view drifts up out of Reynard's window, past the treeline, to the stars:
//            a time-lapse (the stars wheel round the pole star leaving trails, the moon
//            arcs over, fireflies blink over the meadow, a shooting star)
//   'dawn'   the stars fade, the view sinks back to the valley as the sun pops over the
//            ridge and the light sweeps across it (left to right), geese fly over, then it
//            dives into the lit window of Reynard's hut (ends on a warm flash)
//
//   const sky = new NightSky();   await sky.play('night', { dur: 4 });   sky.skip();   sky.destroy();
// The canvas stays up (last frame) after play() resolves, until destroy().
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, k) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

const NIGHT = { top: '#070b22', mid: '#14204a', hor: '#2a3a6e', mtn: '#1c2550', mtnL: '#232e60', snow: '#5a68a0', hill: '#10183a', pine: '#0b1230', floor: '#0d1430', floorL: '#121a3c', pond: '#1a2a60', wall: '#2a1a14', roof: '#3a1418', win: '#ffd07a', fg: '#070a18' };
const DAWN = { top: '#2a3070', mid: '#b05a80', hor: '#ffb070' };
const DAY = { top: '#74ade6', mid: '#a8d0f0', hor: '#ffe8c0', mtn: '#7a88c0', mtnL: '#a4b0e0', snow: '#ffffff', hill: '#3a7a3a', pine: '#2a6634', floor: '#6aa84a', floorL: '#7cbc56', pond: '#4a8ad8', wall: '#8a5532', roof: '#c8402a', win: '#fff0b0', fg: '#3a7a2a' };

export class NightSky {
  constructor() {
    const c = document.createElement('canvas');
    c.className = 'ns-sky';
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 93, pointerEvents: 'none', imageRendering: 'pixelated', background: '#05060f' });
    document.body.appendChild(c);
    this.cv = c;
    this.ctx = c.getContext('2d');
    this.buf = document.createElement('canvas');
    this.trail = document.createElement('canvas');
    this.raf = 0;
    this._resize();
  }

  _resize() {
    const S = Math.max(2, Math.round(innerHeight / 180));
    const W = Math.ceil(innerWidth / S), H = Math.ceil(innerHeight / S);
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    for (const c of [this.cv, this.buf, this.trail]) { c.width = W; c.height = H; }
    const R = rng(1234567);
    this.stars = [];
    for (let i = 0; i < 230; i++) this.stars.push({ r: Math.sqrt(R()) * Math.hypot(W, H) * 0.9, a: R() * Math.PI * 2, b: R(), p: R() * 6.28 });
    this.ridge = []; this.hills = []; this.pines = [];
    const peaks = [[0.12, 0.47], [0.3, 0.42], [0.47, 0.52], [0.7, 0.44], [0.9, 0.5]];
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let y = 0.66;
      for (const [px, py] of peaks) y = Math.min(y, py + Math.abs(u - px) * 1.15 + Math.sin(x * 0.9) * 0.004);
      this.ridge.push(Math.round((y + Math.sin(u * 23) * 0.012) * H));
      this.hills.push(Math.round((0.73 + Math.sin(u * 7.3 + 1) * 0.025 + Math.sin(u * 17) * 0.008) * H));
    }
    for (let x = 2; x < W; x += 3 + Math.floor(R() * 4)) this.pines.push({ x, h: 5 + Math.floor(R() * 6) });
    this.flies = [];
    for (let i = 0; i < 28; i++) this.flies.push({ x: R() * W, y: 0.76 + R() * 0.18, p: R() * 6.28, s: 0.5 + R() });
    this.hut = { x: Math.round(W * 0.6), y: Math.round(H * 0.86) };
    this.trail.getContext('2d').clearRect(0, 0, W, H);
  }

  play(kind = 'night', { dur = kind === 'night' ? 4.2 : 4.0 } = {}) {
    this.kind = kind; this.dur = dur; this.t = 0; this.theta = 0; this._skip = false; this._ext = 0;
    this.trail.getContext('2d').clearRect(0, 0, this.W, this.H);
    cancelAnimationFrame(this.raf);
    return new Promise((res) => {
      this._res = res;
      let last = performance.now();
      const step = (now) => {
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!this._res) { this.raf = 0; return; }
        if (now - this._ext > 250) this._advance(dt); // nobody drives us from outside: self-drive
        this.raf = this._res ? requestAnimationFrame(step) : 0;
      };
      this.raf = requestAnimationFrame(step);
      this._advance(0);
    });
  }

  /** drive it from outside (Bedtime._tick) instead of its own rAF */
  update(dt) { this._ext = performance.now(); this._advance(dt); }

  _advance(dt) {
    if (!this._res) return;
    this.t = this._skip ? this.dur : this.t + dt;
    this._resize();
    try { this.draw(dt); } catch (e) { console.warn('NightSky', e); this.t = this.dur; }
    if (this.t >= this.dur) { const r = this._res; this._res = null; r(); }
  }

  skip() { this._skip = true; }
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; const r = this._res; this._res = null; r?.(); this.cv.remove(); }

  // ------------------------------------------------------------------ drawing
  draw(dt) {
    const { W, H, t } = this;
    const g = this.buf.getContext('2d');
    const night = this.kind === 'night';
    // timeline -> parameters
    let cy, dawnK = 0, dayK = 0, starA = 1, sunY = null, sweep = -99, zoom = 1, flash = 0, spin, trails;
    if (night) {
      cy = 0.42 * smooth(t / 1.7);
      spin = 0.04 + 0.55 * smooth((t - 0.8) / 1.6);
      trails = t > 0.9;
    } else {
      cy = 0.42 * (1 - smooth((t - 0.3) / 1.8));
      dawnK = smooth(t / 1.3); dayK = smooth((t - 1.9) / 1.3);
      starA = 1 - smooth(t / 1.4);
      spin = 0.25 * (1 - smooth(t / 1.0));
      trails = t < 0.9;
      sunY = H * (0.7 - 0.32 * smooth((t - 0.6) / 2.2));
      sweep = -12 + (W + 30) * smooth((t - 1.1) / 1.8);
      zoom = 1 + 9 * Math.pow(smooth((t - 3.0) / 1.0), 2);
      flash = smooth((t - 3.6) / 0.4);
    }
    this.theta += spin * dt;
    const skyOff = cy * H * 0.18;
    // sky: dithered bands, night -> dawn -> day
    const col = (k) => {
      const n = k < 0.5 ? mixc(NIGHT.top, NIGHT.mid, k * 2) : mixc(NIGHT.mid, NIGHT.hor, (k - 0.5) * 2);
      if (!dawnK) return n;
      const d = k < 0.5 ? mixc(DAWN.top, DAWN.mid, k * 2) : mixc(DAWN.mid, DAWN.hor, (k - 0.5) * 2);
      const y = k < 0.5 ? mixc(DAY.top, DAY.mid, k * 2) : mixc(DAY.mid, DAY.hor, (k - 0.5) * 2);
      return dayK > 0 ? mixRGB(d, y, dayK) : mixRGB(n, d, dawnK);
    };
    for (let y = 0; y < H; y++) {
      const k = clamp((y + skyOff - H * 0.05) / (H * 0.95), 0, 1);
      const band = Math.floor(k * 10) / 10, next = Math.min(1, band + 0.1), f = k * 10 - Math.floor(k * 10);
      g.fillStyle = col(band);
      g.fillRect(0, y, W, 1);
      if (f > 0.5) { g.fillStyle = col(next); for (let x = (y & 1); x < W; x += 2) g.fillRect(x, y, 1, 1); }
    }
    // stars wheeling round the pole star, with trails
    const pole = { x: W * 0.66, y: H * 0.16 + skyOff };
    const tg = this.trail.getContext('2d');
    tg.globalCompositeOperation = 'destination-out';
    tg.fillStyle = `rgba(0,0,0,${trails ? 0.05 : 0.35})`;
    tg.fillRect(0, 0, W, H);
    tg.globalCompositeOperation = 'source-over';
    for (const s of this.stars) {
      const a = s.a + this.theta;
      const x = Math.round(pole.x + Math.cos(a) * s.r), y = Math.round(pole.y + Math.sin(a) * s.r * 0.92);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const tw = 0.6 + 0.4 * Math.sin(this.t * 3 + s.p);
      const al = starA * tw * (s.b > 0.85 ? 1 : 0.65);
      if (al <= 0.02) continue;
      const c = s.b > 0.9 ? '255,240,200' : s.b > 0.6 ? '230,236,255' : '170,184,255';
      tg.fillStyle = `rgba(${c},${al * 0.8})`; tg.fillRect(x, y, 1, 1);
      g.fillStyle = `rgba(${c},${al})`; g.fillRect(x, y, 1, 1);
      if (s.b > 0.96 && tw > 0.8) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
    }
    g.drawImage(this.trail, 0, 0);
    if (starA > 0.1) { g.fillStyle = `rgba(255,255,230,${starA})`; g.fillRect(Math.round(pole.x) - 1, Math.round(pole.y), 3, 1); g.fillRect(Math.round(pole.x), Math.round(pole.y) - 1, 1, 3); }
    // the moon arcs over (night), sinks away (dawn)
    const ma = night ? 0.15 + this.t * 0.06 : 0.42 + this.t * 0.18;
    const mx = W * (0.18 + ma * 0.5), my = H * (0.42 - Math.sin(ma * 2.4) * 0.22) + skyOff + (night ? 0 : this.t * H * 0.06);
    if (starA > 0.05 || night) this.moon(g, Math.round(mx), Math.round(my), night ? 1 : starA);
    // shooting star
    const sh = (this.t - 2.4) / 0.45;
    if (night && sh > 0 && sh < 1) for (let k = 0; k < 9; k++) { g.fillStyle = `rgba(255,255,255,${1 - k / 9})`; g.fillRect(Math.round(W * 0.2 + sh * W * 0.35 - k * 2), Math.round(H * 0.12 + sh * H * 0.16 - k), 2, 1); }
    // the sun pops over the ridge (dawn)
    if (sunY != null) this.sun(g, Math.round(W * 0.27), Math.round(sunY + cy * H * 0.35), dawnK);
    // valley layers, parallax, lit by the sweep (dawn)
    const lit = (x) => x < sweep - 2 || (x < sweep + 2 && ((x + Math.floor(this.t * 20)) & 1));
    const P = (x) => (lit(x) ? DAY : NIGHT);
    const o1 = cy * H * 0.45, o2 = cy * H * 0.7, o3 = cy * H * 0.95;
    for (let x = 0; x < W; x++) {
      const p = P(x), y0 = this.ridge[x] + o1;
      g.fillStyle = p.mtn; g.fillRect(x, y0, 1, H);
      if (y0 < H * 0.52 + o1) { g.fillStyle = p.snow; g.fillRect(x, y0, 1, 2 + (x % 3 === 0 ? 1 : 0)); }
      else if (lit(x) && x % 2) { g.fillStyle = p.mtnL; g.fillRect(x, y0, 1, 1); }
    }
    for (let x = 0; x < W; x++) { const p = P(x); g.fillStyle = p.hill; g.fillRect(x, this.hills[x] + o2, 1, H); }
    for (const pn of this.pines) {
      const p = P(pn.x), by = this.hills[pn.x] + o2;
      g.fillStyle = p.pine;
      for (let k = 0; k < pn.h; k++) { const w = Math.floor((k + 1) / 2.2); g.fillRect(pn.x - w, by - pn.h + k, w * 2 + 1, 1); }
    }
    const fy = Math.round(H * 0.8 + o3);
    for (let x = 0; x < W; x++) { const p = P(x); g.fillStyle = (x + fy) % 7 ? p.floor : p.floorL; g.fillRect(x, fy, 1, H); }
    this.pond(g, Math.round(W * 0.3), Math.round(H * 0.88 + o3), lit, night, mx);
    this.house(g, this.hut.x, Math.round(this.hut.y + o3), lit(this.hut.x), night);
    // fireflies over the meadow
    if (night || this.t < 1.2) for (const f of this.flies) {
      const on = Math.sin(this.t * 2.2 * f.s + f.p) > 0.2;
      if (!on) continue;
      const x = Math.round(f.x + Math.sin(this.t * 0.7 + f.p) * 4), y = Math.round(f.y * H + o3 + Math.cos(this.t * 0.9 + f.p) * 2);
      g.fillStyle = '#e8ff7a'; g.fillRect(x, y, 1, 1);
      g.fillStyle = 'rgba(232,255,122,0.35)'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
    }
    // foreground reeds
    for (let x = 0; x < W; x += 2) { const p = P(x), h = 3 + ((x * 7) % 5); g.fillStyle = p.fg; g.fillRect(x, H - h + Math.round(o3 * 0.2), 1, h); }
    // geese heading south over the sunrise
    if (!night && this.t > 1.5 && this.t < 3.6) {
      const gx = W * (1.1 - (this.t - 1.5) / 2.1 * 1.3), gy = H * 0.3 + skyOff;
      g.fillStyle = '#2a2030';
      for (let i = 0; i < 5; i++) { const x = Math.round(gx + i * 5), y = Math.round(gy + Math.abs(i - 2) * 3), fl = Math.floor(this.t * 8 + i) % 2; g.fillRect(x - 2, y - fl, 2, 1); g.fillRect(x, y, 1, 1); g.fillRect(x + 1, y - fl, 2, 1); }
    }
    // to the screen (zoom = the dive into the hut window)
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    if (zoom > 1.001) {
      const fx = this.hut.x + 3, fyy = this.hut.y + o3 - 6;
      const w = W / zoom, h = H / zoom;
      ctx.drawImage(this.buf, clamp(fx - w / 2, 0, W - w), clamp(fyy - h / 2, 0, H - h), w, h, 0, 0, W, H);
    } else ctx.drawImage(this.buf, 0, 0);
    if (flash > 0) { ctx.fillStyle = `rgba(255,236,190,${flash})`; ctx.fillRect(0, 0, W, H); }
  }

  moon(g, x, y, a) {
    const R = 6;
    g.fillStyle = `rgba(244,230,168,${0.12 * a})`;
    for (let yy = -R - 4; yy <= R + 4; yy++) for (let xx = -R - 4; xx <= R + 4; xx++) { const d = Math.hypot(xx, yy); if (d > R && d < R + 4 && ((xx + yy) & 1)) g.fillRect(x + xx, y + yy, 1, 1); }
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
      if (xx * xx + yy * yy > R * R) continue;
      if ((xx + 4) ** 2 + (yy - 2) ** 2 < (R - 1) ** 2) continue;
      g.fillStyle = xx + yy < -3 ? `rgba(255,251,224,${a})` : `rgba(244,230,168,${a})`;
      g.fillRect(x + xx, y + yy, 1, 1);
    }
  }

  sun(g, x, y, k) {
    const R = 7, t = this.t;
    for (let yy = -R - 6; yy <= R + 6; yy++) for (let xx = -R - 6; xx <= R + 6; xx++) {
      const d = Math.hypot(xx, yy);
      if (d <= R) g.fillStyle = d < R - 2 ? '#fff6c4' : '#ffd23f';
      else if (d <= R + 6 && Math.round(Math.atan2(yy, xx) / (Math.PI / 6) + t * 2) % 2 === 0 && ((xx + yy) & 1)) g.fillStyle = `rgba(255,200,110,${0.8 * k})`;
      else continue;
      g.fillRect(x + xx, y + yy, 1, 1);
    }
  }

  pond(g, cx, cy, lit, night, mx) {
    const rx = Math.round(this.W * 0.14), ry = 5;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x / rx) ** 2 + (y / ry) ** 2 > 1) continue;
      g.fillStyle = lit(cx + x) ? DAY.pond : NIGHT.pond;
      g.fillRect(cx + x, cy + y, 1, 1);
    }
    // the moon's reflection (night) / sun glints (day)
    const rx0 = night ? Math.round(clamp(mx, cx - rx + 4, cx + rx - 4)) : cx - 6;
    for (let y = -ry + 1; y < ry; y += 2) {
      const w = night ? 3 - Math.abs(y) / 2 : 2;
      if (!night && !lit(cx)) continue;
      g.fillStyle = night ? '#f4e6a8' : '#ffffff';
      g.fillRect(rx0 + Math.round(Math.sin(this.t * 3 + y) * 1.5) - Math.floor(w / 2), cy + y, Math.max(1, Math.round(w)), 1);
    }
  }

  house(g, x, y, lit, night) {
    const p = lit ? DAY : NIGHT;
    g.fillStyle = p.wall; g.fillRect(x - 9, y - 10, 19, 10);
    g.fillStyle = p.roof;
    for (let k = 0; k < 7; k++) g.fillRect(x - 11 + k, y - 11 - k, 23 - k * 2, 1);
    g.fillRect(x + 4, y - 18, 3, 6); // chimney
    g.fillStyle = night ? NIGHT.win : lit ? '#ffe8a0' : '#ffc870';
    g.fillRect(x + 1, y - 7, 5, 4); g.fillRect(x - 6, y - 7, 4, 4);
    g.fillStyle = p.wall; g.fillRect(x + 3, y - 7, 1, 4); g.fillRect(x + 1, y - 5, 5, 1);
    g.fillStyle = lit ? '#5a381c' : '#1a0e08'; g.fillRect(x - 1, y - 6, 2, 6);
    if (night) for (let i = 0; i < 4; i++) { const k = (this.t * 0.4 + i / 4) % 1; g.fillStyle = `rgba(150,150,180,${0.5 * (1 - k)})`; g.fillRect(Math.round(x + 5 + Math.sin(k * 6 + i) * 2 + k * 4), Math.round(y - 19 - k * 14), 2, 2); }
  }
}

function mixRGB(a, b, k) {
  const pa = a.match(/\d+/g).map(Number), pb = b.match(/\d+/g).map(Number);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
}
