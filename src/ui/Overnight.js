// Morning summary: "While you slept…" on a night-to-sunrise sky.
//
//   showOvernight(root, data, opts) -> Promise<void>
import './ceremony.css';
import { hasSprite } from './sprites.js';
import { RARITIES as DEFAULT_RARITIES } from '../data/species.js';
import {
  esc, clamp, mkSfx, mkIcon, frameCls, glyph, bindInput, Seq, PixelFX, gridCanvas, outline,
  spriteCopy, eggCanvas, eggHalves, fishFrames, rng,
} from './EggHatch.js';

const MAX_EGGS = 8;
const IDLE_DONE_MS = 45000;

export function showOvernight(root, data, opts = {}) {
  if (!root) return Promise.resolve();
  return new Promise((resolve) => {
    let s;
    try { s = new Overnight(root, data || {}, opts, resolve); s.start(); } catch (e) {
      console.error('[Overnight]', e);
      try { s && s.destroy(); } catch { /* ignore */ }
      resolve();
    }
  });
}

// ---------------------------------------------------------------- pixel art
function moonCanvas(scale) {
  const N = 20, c = 9.5;
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c), d2 = Math.hypot(x - c - 5, y - c + 3);
    if (d <= 8.6 && d2 > 7.2) {
      const l = (x - c) * -0.5 + (y - c) * -0.4;
      g[y][x] = l > 2.5 ? '#fffbe6' : d > 7.4 || d2 < 8.2 ? '#e8d9a8' : '#fff3c4';
    }
  }
  for (const [x, y] of [[5, 8], [6, 12], [8, 15]]) if (g[y][x]) g[y][x] = '#d9c690';
  return gridCanvas(outline(g, '#2a2a52'), scale);
}
function sunCanvas(scale) {
  const N = 30, c = 14.5;
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d <= 8.5) g[y][x] = d < 5 ? '#fff6c0' : d < 7.2 ? '#ffe070' : '#ffc23a';
    else if (d < 13.5 && d > 10) {
      const k = ((a / (Math.PI * 2)) * 12 + 12) % 1;
      if (k < 0.28 || k > 0.92) g[y][x] = d < 12 ? '#ffd04a' : '#ffae30';
    }
  }
  for (const [x, y] of [[11, 11], [12, 11], [11, 12]]) g[y][x] = '#ffffff';
  return gridCanvas(outline(g, '#b8561c'), scale);
}
function horizonCanvas(w, h, pal, seed) {
  const g = Array.from({ length: h }, () => Array(w).fill(null));
  const R = rng(seed);
  const lake = Math.round(h * 0.34);
  const hillY = (x, amp, f, ph, base) => Math.round(base - amp * (0.6 + 0.4 * Math.sin(x * f + ph)) - amp * 0.3 * Math.sin(x * f * 2.7 + ph * 2));
  // far hills
  for (let x = 0; x < w; x++) { const top = hillY(x, h * 0.2, 0.045, 1, h - lake - 2); for (let y = top; y < h - lake; y++) g[y][x] = pal.far; }
  // pines, far row then near row
  const pine = (px, base, ht, col) => {
    for (let j = 0; j < ht; j++) {
      const y = base - j;
      const half = Math.max(0, Math.round(((ht - j) / ht) * (ht * 0.32)) - (j % 3 === 2 ? 1 : 0));
      for (let i = -half; i <= half; i++) if (y >= 0 && px + i >= 0 && px + i < w) g[y][px + i] = col;
    }
    if (base + 1 < h) g[base + 1][px] = col;
  };
  for (let x = 2; x < w; x += 3 + ((R() * 4) | 0)) pine(x, hillY(x, h * 0.2, 0.045, 1, h - lake - 2) + 2, 5 + ((R() * 6) | 0), pal.mid);
  const near = h - lake;
  for (let x = 0; x < w; x++) { const top = hillY(x, h * 0.08, 0.09, 4, near); for (let y = top; y < near; y++) g[y][x] = pal.near; }
  for (let x = 1; x < w; x += 4 + ((R() * 5) | 0)) pine(x, hillY(x, h * 0.08, 0.09, 4, near) + 1, 8 + ((R() * 9) | 0), pal.near);
  // lake with reflection lines
  for (let y = h - lake; y < h; y++) for (let x = 0; x < w; x++) g[y][x] = y === h - lake ? pal.shore : pal.lake;
  for (let k = 0; k < w * 0.5; k++) {
    const y = h - lake + 2 + ((R() * (lake - 3)) | 0), x = (R() * w) | 0, L = 2 + ((R() * 5) | 0);
    for (let i = 0; i < L && x + i < w; i++) g[y][x + i] = pal.glint;
  }
  return gridCanvas(g, 1);
}
const PAL_NIGHT = { far: '#1d2350', mid: '#161b40', near: '#0e1230', shore: '#26305e', lake: '#141a3e', glint: '#3a4a8a' };
const PAL_DAWN = { far: '#6a4e8a', mid: '#4a3a70', near: '#2e2650', shore: '#f0a070', lake: '#8a6aa0', glint: '#ffd8a0' };

class Overnight {
  constructor(root, data, opts, resolve) {
    this.root = root;
    this.d = data;
    this.opts = opts;
    this.resolve = resolve;
    this.sfx = mkSfx(opts);
    this.icon = mkIcon(opts);
    this.rar = opts.rarities && opts.rarities.length >= 5 ? opts.rarities : DEFAULT_RARITIES;
    this.auto = opts.autoAdvance === false ? 0 : Number(opts.autoAdvance) || 1;
    this.seq = new Seq();
    this.state = 'init';
    this.p = 0; // night -> sunrise progress
    this.pGoal = 0;
    this.pSpeed = 1 / 4.2;
    this.graceUntil = 0;
  }

  build() {
    const d = this.d;
    const produced = (Array.isArray(d.produced) ? d.produced : []).filter(Boolean);
    const hatched = (Array.isArray(d.hatched) ? d.hatched : []).filter(Boolean);
    this.hatched = hatched;
    const prodH = produced.length
      ? produced.map((p, i) => {
        const n = Number(p.amount) || 0;
        return `<div class="night-res" data-i="${i}" data-n="${n}"><span class="night-ri">${p.icon ? this.icon(p.icon, 2) : ''}</span><span class="night-rl">${esc(p.label || '')}</span><b class="night-rv">${n > 0 ? '+0' : glyph('check', 2)}</b></div>`;
      }).join('')
      : '<div class="night-res none">The pond slept too. Nothing to collect.</div>';
    const shown = hatched.slice(0, MAX_EGGS);
    const eggsH = shown.map((h, i) => {
      const R = this.rar[clamp(h.rarity | 0, 0, 4)];
      return `<div class="night-egg" data-i="${i}" style="--rc:${R.color};--rg:${R.glow}"><div class="night-eggbox"><div class="night-eggart"></div><div class="night-eggfish"></div><div class="night-eggh"></div></div><div class="night-en">${esc(h.name || '')}</div></div>`;
    }).join('') + (hatched.length > MAX_EGGS ? `<div class="night-more">+${hatched.length - MAX_EGGS}</div>` : '');
    const grew = Number(d.grew) || 0;
    const day = d.day != null ? `Day ${d.day}` : '';
    const sub = [day, d.weekday].filter(Boolean).join(' · ');
    return `
      <div class="night-sky"></div>
      <div class="night-dawn"></div>
      <canvas class="night-stars"></canvas>
      <div class="night-moon"></div>
      <div class="night-sunglow"></div>
      <div class="night-sun"></div>
      <div class="night-hz"><canvas class="night-hz-n"></canvas><canvas class="night-hz-d"></canvas></div>
      <canvas class="night-fx"></canvas>
      <div class="night-wrap">
        <div class="night-card ${frameCls('parchment')}">
          <div class="night-head">
            <span class="night-hico"><span class="night-hmoon">${this.icon('moon', 2)}</span><i class="night-z">z</i><i class="night-z z2">z</i></span>
            <div><div class="night-title">While you slept…</div>${sub ? `<div class="night-sub">${esc(sub)}</div>` : ''}</div>
          </div>
          <div class="night-sec"><span>Overnight</span></div>
          <div class="night-resl">${prodH}</div>
          ${shown.length ? `<div class="night-sec"><span>Hatched</span></div><div class="night-eggs">${eggsH}</div>` : ''}
          ${grew > 0 ? `<div class="night-grew" data-n="${grew}"><span class="night-ri">${this.icon('fish', 2)}</span><span>Fish grew up:</span><b class="night-gv">0</b></div>` : ''}
          ${d.quote ? `<div class="night-fox"><div class="night-face">${this.foxFace(d.expr || 'sleepy')}</div><div class="night-bubble"><span class="night-q"></span></div></div>` : ''}
          <div class="night-go"><button type="button" class="cer-btn big ${frameCls('button_green')}" data-cer-own>Start the day ${hasSprite('sun') ? this.icon('sun', 2) : glyph('sun', 2)}</button></div>
        </div>
      </div>`;
  }

  foxFace(expr) { return this.icon(hasSprite(`fox_${expr}`) ? `fox_${expr}` : 'fox_smug', 2); }

  start() {
    const el = document.createElement('div');
    el.className = 'night-ov cer-ov';
    el.tabIndex = -1;
    el.innerHTML = this.build();
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = {
      dawn: q('.night-dawn'), stars: q('.night-stars'), moon: q('.night-moon'), sun: q('.night-sun'), sunglow: q('.night-sunglow'),
      hz: q('.night-hz'), hzn: q('.night-hz-n'), hzd: q('.night-hz-d'), fx: q('.night-fx'), wrap: q('.night-wrap'), card: q('.night-card'),
      go: q('.night-go'), btn: q('.night-go button'), fox: q('.night-fox'), q: q('.night-q'), face: q('.night-face'), hmoon: q('.night-hmoon'),
    };
    // sky art
    const moon = hasSprite('moon') ? spriteCopy('moon', 4) : moonCanvas(4);
    moon.className = 'px';
    this.$.moon.appendChild(moon);
    const sun = hasSprite('sunrise') ? spriteCopy('sunrise', 4) : hasSprite('sun') ? spriteCopy('sun', 5) : sunCanvas(4);
    sun.className = 'px';
    this.$.sun.appendChild(sun);
    this.sunH = sun.height;
    if (!hasSprite('moon')) this.$.hmoon.innerHTML = '';
    if (!hasSprite('moon')) { const m = moonCanvas(2); m.className = 'px'; this.$.hmoon.appendChild(m); }
    this.root.appendChild(el);
    this.fx = new PixelFX(this.$.fx);
    this.layout();
    this.unbind = bindInput(el, { onTap: () => this.tap(), onSkip: () => this.tap(true) });
    this.$.btn.addEventListener('click', (e) => { e.stopPropagation(); this.sfx('click'); this.close(); });
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    if (this.opts.signal && this.opts.signal.addEventListener) this.opts.signal.addEventListener('abort', () => this.close(true), { once: true });
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    this.last = performance.now();
    this.t = 0;
    const tick = (t) => {
      if (this.state === 'dead') return;
      const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      this.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    requestAnimationFrame(() => el.classList.add('on'));
    this.run();
  }

  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    this.W = W; this.H = H;
    this.fx.resize();
    // stars on a 1/3 res canvas
    const u = W < 640 ? 3 : 4;
    const sw = Math.ceil(W / u), sh = Math.ceil(H / u);
    this.$.stars.width = sw; this.$.stars.height = sh;
    const R = rng(1234);
    this.starList = [];
    const n = Math.round((sw * sh) / 260);
    for (let i = 0; i < n; i++) this.starList.push({ x: (R() * sw) | 0, y: (R() * sh * 0.78) | 0, b: 0.35 + R() * 0.65, ph: R() * 6.3, sp: 1 + R() * 2.5, big: R() < 0.07 });
    // horizon
    const hh = Math.ceil((H * (W < 640 ? 0.2 : 0.26)) / u);
    const hn = horizonCanvas(sw, hh, PAL_NIGHT, 99), hd = horizonCanvas(sw, hh, PAL_DAWN, 99);
    for (const [cv, src] of [[this.$.hzn, hn], [this.$.hzd, hd]]) {
      cv.width = sw; cv.height = hh;
      cv.getContext('2d').drawImage(src, 0, 0);
    }
    this.$.hz.style.height = `${hh * u}px`;
    this.hzH = hh * u;
    this.el.style.setProperty('--hz', `${hh * u}px`);
  }

  step(dt) {
    this.t += dt;
    if (this.p < this.pGoal) this.p = Math.min(this.pGoal, this.p + dt * this.pSpeed);
    const p = this.p, e = p * p * (3 - 2 * p);
    this.$.dawn.style.opacity = e.toFixed(3);
    this.$.hzd.style.opacity = e.toFixed(3);
    // stars
    const c = this.$.stars.getContext('2d');
    c.clearRect(0, 0, this.$.stars.width, this.$.stars.height);
    const fade = Math.max(0, 1 - e * 1.3);
    if (fade > 0) {
      for (const s of this.starList) {
        const a = s.b * (0.55 + 0.45 * Math.sin(this.t * s.sp + s.ph)) * fade;
        if (a < 0.04) continue;
        c.globalAlpha = a;
        c.fillStyle = s.big ? '#fff6d0' : '#dfe8ff';
        c.fillRect(s.x, s.y, 1, 1);
        if (s.big && a > 0.5) { c.globalAlpha = a * 0.6; c.fillRect(s.x - 1, s.y, 3, 1); c.fillRect(s.x, s.y - 1, 1, 3); }
      }
      c.globalAlpha = 1;
    }
    // moon sets, sun rises
    this.$.moon.style.transform = `translate(${Math.round(-e * this.W * 0.06)}px, ${Math.round(e * this.H * 0.12)}px)`;
    this.$.moon.style.opacity = String(Math.max(0, 1 - e * 1.1).toFixed(3));
    // from fully hidden behind the hills to about half peeking over them
    const sh = this.sunH || 120;
    const hidden = sh + this.hzH * 0.1, peek = sh * 0.42;
    const ease = 1 - Math.pow(1 - Math.min(1, e * 1.05), 3);
    this.$.sun.style.transform = `translate(-50%, ${Math.round(hidden + (peek - hidden) * ease)}px)`;
    this.$.sunglow.style.opacity = (e * 0.95).toFixed(3);
    this.fx.step(dt); this.fx.draw();
  }

  // ------------------------------------------------------------------ input
  tap(skip) {
    const now = performance.now();
    if (this.state === 'done') { if (now > this.graceUntil || skip) this.close(); return; }
    if (this.state === 'intro' || this.state === 'play') {
      this.seq.fast();
      this.pSpeed = 1.6;
      this.pGoal = 1;
    }
  }

  // ------------------------------------------------------------------ sequence
  async run() {
    const seq = this.seq, $ = this.$;
    this.state = 'intro';
    seq.anim($.card, [{ transform: 'translateY(-40px) scale(.96)', opacity: 0 }, { transform: 'translateY(6px) scale(1.01)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 200, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
    await seq.sleep(520);
    if (this.state === 'dead') return;
    this.state = 'play';
    this.pGoal = 1;
    seq.after(700, () => { if (!seq.ff) this.sfx('sunrise'); });
    // resources count up
    for (const row of this.el.querySelectorAll('.night-res')) {
      if (this.state === 'dead') return;
      row.classList.add('on');
      if (!seq.ff) seq.anim(row, [{ transform: 'translateX(-14px)', opacity: 0 }, { transform: 'translateX(2px)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
      const ico = row.querySelector('.night-ri');
      if (ico && !seq.ff) seq.anim(ico, [{ transform: 'scale(0)' }, { transform: 'scale(1.4)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
      const n = Number(row.dataset.n) || 0;
      const v = row.querySelector('.night-rv');
      if (n > 0 && v) await this.countUp(v, n, '+');
      else { if (v && !seq.ff) seq.anim(v, [{ transform: 'scale(0)' }, { transform: 'scale(1.3)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 280 }); if (!seq.ff) this.sfx('click', { volume: 0.4 }); await seq.sleep(200); }
      await seq.sleep(110);
    }
    // eggs hatch one after another
    const eggs = [...this.el.querySelectorAll('.night-egg')];
    const more = this.el.querySelector('.night-more');
    eggs.forEach((eg, i) => {
      const h = this.hatched[i];
      const tier = clamp(h.rarity | 0, 0, 4);
      const cv = eggCanvas(tier, 0, 2, this.rar[tier].glow);
      cv.className = 'px';
      eg.querySelector('.night-eggart').appendChild(cv);
      eg.classList.add('on');
      if (!seq.ff) seq.anim(eg, [{ transform: 'translateY(-20px) scale(.4)', opacity: 0 }, { transform: 'translateY(0) scale(1.1, .9)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 320, delay: i * 60, easing: 'ease-out', fill: 'backwards' });
    });
    if (more) more.classList.add('on');
    if (eggs.length) await seq.sleep(360 + eggs.length * 60);
    const hatchings = eggs.map((eg, i) => new Promise((res) => seq.after(seq.ff ? 0 : i * 420, () => this.hatchMini(eg, this.hatched[i], i).then(res))));
    if (seq.ff) this.el.querySelectorAll('.night-egg').forEach((eg, i) => this.finishMini(eg, this.hatched[i]));
    await Promise.race([Promise.all(hatchings), new Promise((r) => setTimeout(r, 1200 + eggs.length * 600))]);
    if (this.state === 'dead') return;
    // fish grew up
    const grew = this.el.querySelector('.night-grew');
    if (grew) {
      grew.classList.add('on');
      if (!seq.ff) seq.anim(grew, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      await this.countUp(grew.querySelector('.night-gv'), Number(grew.dataset.n) || 0, '');
      await seq.sleep(120);
    }
    // the fox wakes up and talks
    if ($.fox) {
      $.fox.classList.add('on');
      if (!seq.ff) seq.anim($.fox, [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'ease-out' });
      await seq.sleep(240);
      await this.typeQuote(String(this.d.quote || ''));
      $.face.innerHTML = this.foxFace(this.d.exprAfter || 'smug');
      if (!seq.ff) seq.anim($.face, [{ transform: 'scale(1)' }, { transform: 'scale(1.15, .9)' }, { transform: 'scale(1)' }], { duration: 240 });
    }
    if (this.state === 'dead') return;
    // ready: the header moon becomes a sun
    this.el.classList.add('awake');
    const sunI = hasSprite('sun') ? spriteCopy('sun', 2) : sunCanvas(1);
    sunI.className = 'px';
    $.hmoon.replaceChildren(sunI);
    if (!seq.ff) seq.anim($.hmoon, [{ transform: 'rotate(-90deg) scale(.3)' }, { transform: 'rotate(10deg) scale(1.2)', offset: 0.7 }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });
    this.pGoal = 1;
    this.pSpeed = Math.max(this.pSpeed, 0.5);
    $.go.classList.add('on');
    seq.anim($.btn, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'ease-out' });
    seq.slow();
    this.state = 'done';
    this.graceUntil = performance.now() + 450;
    if (this.auto) seq.after(IDLE_DONE_MS * this.auto, () => this.close());
  }

  async countUp(el, n, prefix) {
    if (!el) return;
    const seq = this.seq;
    if (seq.ff || n <= 0) { el.textContent = `${prefix}${n}`; return; }
    const steps = Math.min(n, 8);
    for (let k = 1; k <= steps; k++) {
      const v = Math.round((n * k) / steps);
      el.textContent = `${prefix}${v}`;
      if (k === steps || k % 2 === 1) this.sfx('coin', { pitch: 1 + k * 0.06, volume: 0.5 });
      seq.anim(el, [{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 120 });
      await seq.sleep(60);
      if (seq.ff) { el.textContent = `${prefix}${n}`; return; }
    }
  }

  async typeQuote(text) {
    const q = this.$.q, seq = this.seq;
    if (seq.ff) { q.textContent = text; return; }
    for (let i = 1; i <= text.length; i++) {
      q.textContent = text.slice(0, i);
      if (seq.ff) { q.textContent = text; return; }
      const ch = text[i - 1];
      await seq.sleep(ch === '.' || ch === '!' || ch === '?' ? 120 : ch === ',' ? 70 : 22);
    }
  }

  async hatchMini(eg, h, i) {
    const seq = this.seq;
    if (!eg || this.state === 'dead') return;
    if (seq.ff) { this.finishMini(eg, h); return; }
    const tier = clamp(h.rarity | 0, 0, 4), R = this.rar[tier];
    const art = eg.querySelector('.night-eggart');
    seq.anim(art, [{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }], { duration: 300, easing: 'ease-in-out' });
    await seq.sleep(260);
    for (const st of [1, 2]) {
      if (seq.ff || this.state === 'dead') { this.finishMini(eg, h); return; }
      const cv = eggCanvas(tier, st, 2, R.glow);
      cv.className = 'px';
      art.replaceChildren(cv);
      this.sfx('egg_crack', { pitch: 1.1 + st * 0.15 + i * 0.03, volume: 0.7 });
      seq.anim(art, [{ transform: 'translateX(-3px) rotate(-6deg)' }, { transform: 'translateX(3px) rotate(6deg)' }, { transform: 'none' }], { duration: 160 });
      await seq.sleep(190);
    }
    if (seq.ff || this.state === 'dead') { this.finishMini(eg, h); return; }
    // burst
    const r = art.getBoundingClientRect();
    const [a, b] = eggHalves(tier, 2, R.glow);
    a.className = 'px'; b.className = 'px';
    const hb = eg.querySelector('.night-eggh');
    hb.replaceChildren(a, b);
    art.replaceChildren();
    seq.anim(a, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(-16px,-22px) rotate(-50deg)', opacity: 1, offset: 0.4 }, { transform: 'translate(-24px,10px) rotate(-120deg)', opacity: 0 }], { duration: 620, easing: 'ease-out', fill: 'forwards' });
    seq.anim(b, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: 'translate(14px,-8px) rotate(30deg)', opacity: 1, offset: 0.35 }, { transform: 'translate(22px,14px) rotate(90deg)', opacity: 0 }], { duration: 620, easing: 'ease-out', fill: 'forwards' });
    this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, 10 + tier * 5, { type: 'spark', colors: [R.glow, '#ffffff', R.color], speed: 260 + tier * 40, g: 120, drag: 2.2, life: 0.7, size: [0, 1], jitter: 10 });
    this.fx.burst(r.left + r.width / 2, r.top + r.height / 2, 6 + tier * 3, { type: 'conf', colors: [R.color, R.glow, '#ffffff'], speed: 320, g: 500, drag: 2, life: 0.9, jitter: 8 });
    this.showMiniFish(eg, h, true);
    await seq.sleep(360);
  }

  showMiniFish(eg, h, anim) {
    const box = eg.querySelector('.night-eggfish');
    if (box.childElementCount) return;
    const ff = fishFrames(this.opts.fishCanvas, h.speciesId, h.morph, 64, 34, { min: 1, max: 3, n: 1 });
    const c = ff.frames[0];
    c.className = 'px';
    box.appendChild(c);
    eg.classList.add('hatched');
    if (anim) this.seq.anim(box, [{ transform: 'translateY(10px) scale(.2)', opacity: 0 }, { transform: 'translateY(-8px) scale(1.25)', opacity: 1, offset: 0.55 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 420, easing: 'ease-out' });
  }

  finishMini(eg, h) {
    if (!eg || !h) return;
    eg.querySelector('.night-eggart').replaceChildren();
    eg.querySelector('.night-eggh').replaceChildren();
    this.showMiniFish(eg, h, false);
  }

  // ------------------------------------------------------------------ teardown
  async close(immediate = false) {
    if (this.state === 'closing' || this.state === 'dead') return;
    this.state = 'closing';
    this.seq.fast();
    if (!immediate) {
      this.pGoal = 1; this.pSpeed = 3;
      this.el.classList.add('flare');
      try { this.$.card.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30px) scale(.96)', opacity: 0 }], { duration: 380, easing: 'ease-in', fill: 'forwards' }); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 260));
      this.el.classList.add('closing');
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
    this.resolve();
  }
}
