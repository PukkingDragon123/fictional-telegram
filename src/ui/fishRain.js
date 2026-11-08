// [v33 menu] FISH on the title menu: it rains fish. Every press drops a dozen of the game's own fish (their
// real sprites, any species, the odd golden or albino) from above the screen. They tumble, bounce, squash
// when they land, pile up on the floor and flop about. Grab one to fling it. Fish stay until the game starts.
//
//   const rain = fishRain({ sfx });  rain.drop(12);  rain.destroy();
import { SPECIES } from '../data/species.js';
import { fishCanvasFor } from '../game/fishSprites.js';

const SC = 3; // sprite scale (CSS px per art px)
const MAX = 140;
const G = 2200; // gravity, CSS px / s^2
const MORPHS = ['normal', 'normal', 'normal', 'normal', 'normal', 'golden', 'albino', 'calico', 'melanistic', 'rainbow'];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function fishRain({ sfx = () => {} } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'fish-rain';
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:40;pointer-events:none;image-rendering:pixelated';
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const fit = () => {
    dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
  };
  fit();
  addEventListener('resize', fit);

  const ids = SPECIES.map((s) => s.id);
  const art = new Map();
  const sprite = (id, morph, frame) => {
    const k = `${id}|${morph}|${frame}`;
    if (!art.has(k)) { let c = null; try { c = fishCanvasFor(id, { morph, frame, scale: SC }); } catch { c = null; } art.set(k, c); }
    return art.get(k);
  };

  const fish = [];
  let last = performance.now(), raf = 0, dead = false, grab = null;

  function drop(n = 12) {
    for (let i = 0; i < n; i++) {
      const id = pick(ids), morph = pick(MORPHS);
      const img = sprite(id, morph, 0);
      if (!img) continue;
      const w = img.width, h = img.height;
      fish.push({
        id, morph, w, h, r: Math.max(8, (w + h) * 0.22),
        x: rand(w, W - w), y: -h - rand(0, 900), vx: rand(-120, 120), vy: rand(0, 200),
        a: rand(0, Math.PI * 2), va: rand(-8, 8), flip: Math.random() < 0.5,
        squash: 0, flop: rand(1, 4), frame: 0, ft: 0, landed: false,
      });
    }
    while (fish.length > MAX) fish.shift();
    sfx('splash', { volume: 0.25, pitch: 1.3 });
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  function step(dt) {
    for (const f of fish) {
      if (f === grab?.f) continue;
      f.vy += G * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt;
      f.squash = Math.max(0, f.squash - dt * 5);
      // floor and walls
      const floor = H - f.r * 0.7;
      if (f.y > floor) {
        if (f.vy > 500) { f.squash = Math.min(1, f.vy / 1800); if (Math.random() < 0.35) sfx('fish_flop', { volume: 0.18, pitch: rand(0.8, 1.3) }); }
        f.y = floor; f.vy *= -0.32; f.vx *= 0.86; f.va = f.va * 0.6 + f.vx * 0.01;
        if (!f.landed) { f.landed = true; f.frame = 4; f.ft = 0.4; }
      }
      if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx) * 0.5; }
      if (f.x > W - f.r) { f.x = W - f.r; f.vx = -Math.abs(f.vx) * 0.5; }
      // resting: lie on a side, and every few seconds a big comedic flop
      const resting = f.y >= floor - 2 && Math.abs(f.vy) < 120;
      if (resting) {
        const tgt = Math.round(f.a / Math.PI) * Math.PI;
        f.a += (tgt - f.a) * Math.min(1, dt * 6); f.va *= 0.9;
        f.flop -= dt;
        if (f.flop <= 0) {
          f.flop = rand(1.2, 5);
          f.vy = -rand(350, 820); f.vx += rand(-160, 160); f.va = rand(-10, 10);
          f.frame = 4; f.ft = 0.5;
          if (Math.random() < 0.4) f.flip = !f.flip;
          if (Math.random() < 0.5) sfx('fish_flop', { volume: 0.2, pitch: rand(0.85, 1.4) });
        }
      }
      if (f.ft > 0) { f.ft -= dt; if (f.ft <= 0) f.frame = 0; }
      else if (!resting) f.frame = Math.floor(performance.now() / 90 + f.r) % 4; // wiggle in the air
    }
    // fish pile up: push overlapping fish apart
    for (let i = 0; i < fish.length; i++) {
      const p = fish[i];
      for (let j = i + 1; j < fish.length; j++) {
        const q = fish[j];
        const dx = q.x - p.x, dy = q.y - p.y, rr = (p.r + q.r) * 0.82;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.01) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (rr - d) / 2;
        if (p !== grab?.f) { p.x -= nx * push; p.y -= ny * push; }
        if (q !== grab?.f) { q.x += nx * push; q.y += ny * push; }
        const rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (rv < 0) { const k = -rv * 0.65; p.vx -= nx * k; p.vy -= ny * k; q.vx += nx * k; q.vy += ny * k; }
      }
    }
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    for (const f of fish) {
      const img = sprite(f.id, f.morph, f.frame);
      if (!img) continue;
      const sq = f.squash;
      g.save();
      g.translate(Math.round(f.x), Math.round(f.y));
      g.rotate(f.a);
      g.scale((f.flip ? -1 : 1) * (1 + sq * 0.35), 1 - sq * 0.3);
      g.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
      g.restore();
    }
  }

  function loop(now) {
    raf = 0;
    if (dead) return;
    if (!document.body.classList.contains('at-title')) { destroy(); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const n = dt > 0.02 ? 2 : 1;
    for (let i = 0; i < n; i++) step(dt / n);
    draw();
    if (fish.length) raf = requestAnimationFrame(loop);
  }

  // grab and fling
  const hit = (x, y) => { for (let i = fish.length - 1; i >= 0; i--) { const f = fish[i]; if ((f.x - x) ** 2 + (f.y - y) ** 2 < (f.r * 1.1) ** 2) return f; } return null; };
  const onDown = (e) => {
    const f = hit(e.clientX, e.clientY);
    if (!f) return;
    e.stopPropagation(); e.preventDefault();
    grab = { f, x: e.clientX, y: e.clientY, t: performance.now(), vx: 0, vy: 0 };
    f.frame = 4; f.ft = 9;
    sfx('fish_flop', { volume: 0.25, pitch: 1.5 });
  };
  const onMove = (e) => {
    if (!grab) return;
    const now = performance.now(), dt = Math.max(0.008, (now - grab.t) / 1000);
    grab.vx = (e.clientX - grab.x) / dt; grab.vy = (e.clientY - grab.y) / dt;
    grab.f.x = e.clientX; grab.f.y = e.clientY; grab.f.vx = 0; grab.f.vy = 0;
    grab.x = e.clientX; grab.y = e.clientY; grab.t = now;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  const onUp = () => {
    if (!grab) return;
    const f = grab.f;
    f.vx = Math.max(-3000, Math.min(3000, grab.vx)); f.vy = Math.max(-3000, Math.min(3000, grab.vy));
    f.va = f.vx * 0.01; f.ft = 0.3; f.landed = false;
    grab = null;
  };
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);

  function destroy() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', fit);
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    cv.remove();
  }

  return { drop, destroy, get count() { return fish.length; } };
}
