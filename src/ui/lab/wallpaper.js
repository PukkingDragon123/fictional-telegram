// [v31 lab] The lab desktop's wallpaper (src/ui/LabTree.js): northern lights over a
// pine-lined lake in the Canadian wilds (where the pond is), as pixel art. Every gradient
// is an ordered (Bayer 4x4) dither between hand-picked colours: no smooth blends, no blur.
// Painted at 1 art px = 2 css px into one canvas via ImageData: the still layers (sky,
// stars, two mountain ranges, the pines) are built once per size; each frame (~8 fps)
// adds the moving aurora curtains, twinkles a few stars and mirrors the sky in the lake.
//
//   const wall = new Wallpaper(canvas);  wall.fit(cssW, cssH);  wall.draw(seconds);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SKY = ['#05061a', '#080a26', '#0d1033', '#141541', '#1e1a52', '#2c1f5e'].map(rgb);
const LAKE = ['#0a0f2e', '#070a22', '#050719', '#030411'].map(rgb);
const GREEN = ['#0c3a3a', '#13665a', '#22a874', '#4fe08e', '#a8ffc8', '#eafff2'].map(rgb); // dim -> bright
const VIOLET = ['#241a52', '#42308a', '#7a4cc8', '#c08af0', '#f0d4ff'].map(rgb);
const PINKISH = ['#3a1a4a', '#6e2a6a', '#b84a8a', '#f08ab8'].map(rgb);
const STARS = ['#ffffff', '#bfe8ff', '#ffd2ec', '#fff2b0', '#c8ffd8'].map(rgb);
const FAR = rgb('#141a40'), FAR_LIT = rgb('#2a3470'), SNOW = rgb('#8e9ad0');
const NEAR = rgb('#0b0f2a'), NEAR_LIT = rgb('#18204a');
const PINE = rgb('#05071a'), PINE_LIT = rgb('#0e1636'), SHORE = rgb('#1c2a5e');

function rngOf(seed) {
  let s = seed >>> 0 || 7;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export class Wallpaper {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.last = -1;
  }

  fit(cssW, cssH) {
    const w = Math.max(16, Math.ceil(cssW / 2)), h = Math.max(16, Math.ceil(cssH / 2));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.cv.width = w;
    this.cv.height = h;
    this.cv.style.width = `${w * 2}px`;
    this.cv.style.height = `${h * 2}px`;
    this.img = this.ctx.createImageData(w, h);
    this._build();
    this.last = -1;
  }

  // the still layers + a "sky" mask (where the aurora may paint)
  _build() {
    const { w, h } = this;
    const R = rngOf(0x5eed + w * 31 + h);
    const hy = Math.round(h * 0.72); // the shore
    this.hy = hy;
    const base = new Uint8ClampedArray(w * h * 4);
    const sky = new Uint8Array(w * h);
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; base[i] = c[0]; base[i + 1] = c[1]; base[i + 2] = c[2]; base[i + 3] = 255; };
    // sky: a dithered ramp down to a violet glow over the hills
    for (let y = 0; y < hy; y++) {
      const t = (y / hy) * (SKY.length - 1);
      for (let x = 0; x < w; x++) {
        const k = Math.min(SKY.length - 1, Math.floor(t + bayer(x, y)));
        put(x, y, SKY[k]);
        sky[y * w + x] = 1;
      }
    }
    // stars (static; a few twinkle per frame)
    this.stars = [];
    const n = Math.round((w * hy) / 170);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(R() * w), y = Math.floor(R() * hy * 0.86);
      const c = STARS[Math.floor(R() * STARS.length)];
      const big = R() < 0.08;
      this.stars.push({ x, y, c, big, ph: R() * 6.28, sp: 0.6 + R() * 2 });
      put(x, y, c);
      if (big) { put(x - 1, y, SKY[1]); put(x + 1, y, SKY[1]); }
    }
    // far mountains (snow on the peaks), then the near range
    const ridge = (amp, base0, f1, f2, ph) => {
      const r = [];
      let jit = 0;
      for (let x = 0; x < w; x++) {
        if (R() < 0.3) jit = Math.round((R() - 0.5) * 2);
        r.push(Math.round(base0 - amp * (0.55 + 0.3 * Math.sin(x * f1 + ph) + 0.15 * Math.sin(x * f2 + ph * 2.3)) + jit));
      }
      return r;
    };
    const far = ridge(h * 0.2, hy - 2, 0.021, 0.083, R() * 6);
    const near = ridge(h * 0.1, hy, 0.034, 0.12, R() * 6);
    for (let x = 0; x < w; x++) {
      for (let y = far[x]; y < hy; y++) {
        const peak = far[x] < far[Math.max(0, x - 1)] && far[x] <= far[Math.min(w - 1, x + 1)];
        const depth = y - far[x];
        const c = depth < 2 && far[x] < hy - h * 0.18 ? SNOW : depth < 3 || (peak && depth < 5) ? FAR_LIT : (x + y) % 2 && depth < 6 ? FAR_LIT : FAR;
        put(x, y, c);
        sky[y * w + x] = 0;
      }
      for (let y = near[x]; y < hy; y++) {
        put(x, y, y - near[x] < 1 ? NEAR_LIT : NEAR);
        sky[y * w + x] = 0;
      }
    }
    // a line of pines along the shore
    for (let x = -4; x < w + 4;) {
      const th = 6 + Math.floor(R() * 12), cx = x;
      for (let r = 0; r < th; r++) {
        const half = Math.floor(r / 2.4) + (r === th - 1 ? 0 : 0);
        const y = hy - th + r;
        for (let dx = -half; dx <= half; dx++) {
          put(cx + dx, y, dx === -half && r % 3 === 2 ? PINE_LIT : PINE);
          if (cx + dx >= 0 && cx + dx < w && y >= 0) sky[y * w + cx + dx] = 0;
        }
      }
      put(cx, hy - 1, PINE);
      x += 3 + Math.floor(R() * 6);
    }
    for (let x = 0; x < w; x++) put(x, hy, SHORE);
    // lake (behind the reflection)
    for (let y = hy + 1; y < h; y++) {
      const t = ((y - hy) / Math.max(1, h - hy)) * (LAKE.length - 1);
      for (let x = 0; x < w; x++) put(x, y, LAKE[Math.min(LAKE.length - 1, Math.floor(t + bayer(x, y)))]);
    }
    this.base = base;
    this.sky = sky;
  }

  // one aurora curtain: a bright lower edge with rays fading upward, swaying slowly
  _curtain(buf, t, o) {
    const { w, h, sky } = this;
    for (let x = 0; x < w; x++) {
      const X = x + o.dx;
      const edge = Math.round(h * o.y + Math.sin(X * o.f1 + t * o.s1) * h * o.a1 + Math.sin(X * o.f2 - t * o.s2) * h * o.a2);
      const len = h * (o.len + 0.06 * Math.sin(X * 0.031 + t * 0.6));
      const glow = Math.max(0, 0.55 + 0.45 * Math.sin(X * o.f3 - t * o.s3)) * (0.7 + 0.3 * Math.sin(X * 0.57 + o.ph) * Math.sin(X * 0.13 + t * 0.8));
      if (glow < 0.08) continue;
      const P = o.pal;
      for (let y = Math.max(0, Math.floor(edge - len)); y <= edge + 1 && y < h; y++) {
        if (!sky[y * w + x]) continue;
        const k = (edge - y) / len; // 0 at the lower edge, 1 at the top of the rays
        let v = glow * (k < 0 ? 0.6 : Math.pow(1 - Math.min(1, k), 1.6));
        if (k >= 0 && k < 0.05) v = Math.min(1, v + 0.25);
        const lvl = Math.floor(v * (P.length) + bayer(x, y) - 0.5);
        if (lvl < 0) continue;
        const c = P[Math.min(P.length - 1, lvl)];
        const i = (y * w + x) * 4;
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      }
    }
  }

  draw(t) {
    if (!this.base) return;
    if (REDUCED) t = 4.2;
    const tick = Math.floor(t * 8);
    if (tick === this.last) return;
    if (REDUCED && this.last >= 0) return;
    this.last = tick;
    const { w, h, hy } = this;
    const buf = this.img.data;
    buf.set(this.base);
    const tt = tick / 8;
    this._curtain(buf, tt, { y: 0.34, len: 0.26, a1: 0.07, a2: 0.025, f1: 0.016, f2: 0.051, f3: 0.009, s1: 0.35, s2: 0.6, s3: 0.25, dx: 0, ph: 1.3, pal: GREEN });
    this._curtain(buf, tt, { y: 0.22, len: 0.16, a1: 0.05, a2: 0.02, f1: 0.022, f2: 0.07, f3: 0.013, s1: 0.28, s2: 0.5, s3: 0.32, dx: 310, ph: 4.1, pal: VIOLET });
    this._curtain(buf, tt, { y: 0.46, len: 0.1, a1: 0.03, a2: 0.02, f1: 0.03, f2: 0.09, f3: 0.017, s1: 0.4, s2: 0.7, s3: 0.4, dx: 900, ph: 2.2, pal: PINKISH });
    // twinkle
    for (const s of this.stars) {
      const on = Math.sin(tt * s.sp + s.ph) > -0.6;
      const i = (s.y * w + s.x) * 4;
      const c = on ? s.c : SKY[1];
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
      if (s.big && on && Math.sin(tt * s.sp * 0.5 + s.ph) > 0.7) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const X = s.x + dx, Y = s.y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= hy) continue;
          const j = (Y * w + X) * 4;
          buf[j] = c[0] >> 1; buf[j + 1] = c[1] >> 1; buf[j + 2] = c[2] >> 1;
        }
      }
    }
    // the lake mirrors the sky: rippled, darkened, every other row broken up
    for (let y = hy + 1; y < h; y++) {
      const my = hy - (y - hy) * 1.15;
      if (my < 0) break;
      const sy = Math.floor(my);
      const rip = Math.round(Math.sin(y * 0.9 + tt * 2.2) * (1 + (y - hy) * 0.04));
      const fade = 0.62 - ((y - hy) / (h - hy)) * 0.3;
      for (let x = 0; x < w; x++) {
        if ((x + y) % 2 && (y - hy) % 3 === 0) continue;
        const sx = Math.min(w - 1, Math.max(0, x + rip));
        const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
        const lake0 = buf[di], lake1 = buf[di + 1], lake2 = buf[di + 2];
        const f = bayer(x, y) < fade ? 0.55 : 0.3;
        buf[di] = lake0 + (buf[si] - lake0) * f;
        buf[di + 1] = lake1 + (buf[si + 1] - lake1) * f;
        buf[di + 2] = lake2 + (buf[si + 2] - lake2) * f;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
