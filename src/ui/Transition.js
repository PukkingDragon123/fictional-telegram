// Chunky pixel transitions drawn on one full-screen canvas.
//   wipe(kind, mid)  - cover the screen with blocks, run mid(), uncover
//   flash(kind)      - a quick pass that never fully covers (camera snaps)
//   dayCard(text)    - a paper "DAY 3" card that drops in and flips away
// kinds: 'blocks' (diagonal), 'iris' (centre out), 'zoom' (edges in), 'rain' (columns)
const INK = '#1a1420';
const PAPER = '#f3e7cf';

export class Transition {
  constructor() {
    const c = document.createElement('canvas');
    c.className = 'px-trans';
    Object.assign(c.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: 80, pointerEvents: 'none', imageRendering: 'pixelated' });
    document.body.appendChild(c);
    this.c = c;
    this.ctx = c.getContext('2d');
    this.runs = [];
    this.raf = 0;
  }

  // order value 0..1 for block (i,j) in a grid of (w,h)
  order(kind, i, j, w, h) {
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    const n = ((i * 73856093) ^ (j * 19349663)) % 97 / 97 * 0.12;
    if (kind === 'iris') return Math.hypot((i - cx) / cx, (j - cy) / cy) / 1.42 * 0.88 + n;
    if (kind === 'zoom') return (1 - Math.max(Math.abs(i - cx) / cx, Math.abs(j - cy) / cy)) * 0.88 + n;
    if (kind === 'rain') return (j / h) * 0.55 + ((i * 37) % 11) / 11 * 0.33 + n;
    return ((i / w) + (j / h)) / 2 * 0.88 + n;
  }

  start(run) {
    this.runs.push(run);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  tick = (now) => {
    const c = this.c, ctx = this.ctx;
    const W = Math.ceil(window.innerWidth / 3), H = Math.ceil(window.innerHeight / 3);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    ctx.clearRect(0, 0, W, H);
    for (const r of this.runs) {
      r.t0 ??= now;
      const t = (now - r.t0) / 1000;
      r.draw(ctx, W, H, t);
    }
    this.runs = this.runs.filter((r) => !r.done);
    this.raf = this.runs.length ? requestAnimationFrame(this.tick) : 0;
    if (!this.raf) ctx.clearRect(0, 0, W, H);
  };

  blocks(ctx, W, H, kind, cover, color, B = 8) {
    const w = Math.ceil(W / B), h = Math.ceil(H / B);
    ctx.fillStyle = color;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const o = this.order(kind, i, j, w, h);
        const k = Math.max(0, Math.min(1, (cover - o) * 8));
        if (k <= 0) continue;
        const s = Math.ceil(B * k);
        ctx.fillRect(i * B + ((B - s) >> 1), j * B + ((B - s) >> 1), s, s);
      }
    }
  }

  wipe(kind = 'blocks', mid = null, { inDur = 0.45, hold = 0.12, outDur = 0.5, color = INK } = {}) {
    return new Promise((resolve) => {
      let fired = false;
      const fire = () => { if (fired) return; fired = true; try { mid?.(); } catch (e) { console.warn(e); } };
      // rAF stalls in background tabs: never let the scene change depend on it
      setTimeout(fire, inDur * 1000 + 400);
      setTimeout(() => { if (!run.done) { run.done = true; resolve(); } }, (inDur + hold + outDur) * 1000 + 1500);
      const run = {
        draw: (ctx, W, H, t) => {
          if (t >= inDur) fire();
          const cover = t < inDur ? t / inDur : t < inDur + hold ? 1 : 1 - (t - inDur - hold) / outDur;
          this.blocks(ctx, W, H, kind, Math.max(0, cover) * 1.15, color);
          if (t > inDur + hold + outDur && !run.done) { run.done = true; resolve(); }
        },
      };
      this.start(run);
    });
  }

  flash(kind = 'zoom', { dur = 0.42, color = PAPER, peak = 0.45 } = {}) {
    const run = {
      draw: (ctx, W, H, t) => {
        const u = t / dur;
        const cover = Math.sin(Math.min(1, u) * Math.PI) * peak;
        this.blocks(ctx, W, H, kind, cover, color, 6);
        if (u >= 1) run.done = true;
      },
    };
    this.start(run);
  }

  dayCard(title, sub = '') {
    const el = document.createElement('div');
    el.className = 'daycard';
    el.innerHTML = `<b>${title}</b>${sub ? `<i>${sub}</i>` : ''}`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1900);
    setTimeout(() => el.remove(), 2500);
  }
}
