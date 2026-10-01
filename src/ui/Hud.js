// Top-left HUD: one compact cluster.
//   - a coin counter on a paper price-tag hanging from a string (swings on change, digits roll)
//   - 5 rating stars (half stars) under it
//   - a tiny heart with "charm %" (only when > 0)
//
//   const hud = new Hud(container, { icon, sfx, onCoins, onRating, onCharm })
//   hud.set({ coins, rating, charm })      // any subset
//   hud.coinTarget() -> { x, y }           // screen point coins fly to
//   hud.flash('coins' | 'rating' | 'charm')
//   hud.setVisible(on, part?)              // part: 'coins' | 'rating' | 'charm' (omit = all)
//   hud.destroy()
import './hud.css';
import { spriteImg } from './sprites.js';
import { paperTexture, PX } from './paper.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fmt = (n) => Math.round(Math.max(0, Number(n) || 0)).toLocaleString('en-US');

// price-tag shape at texel resolution: notched top corners, outline, grommet hole
const tagCache = new Map();
function tagURL(tw, th) {
  const key = `${tw}x${th}`;
  if (tagCache.has(key)) return tagCache.get(key);
  const base = new Image();
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  const out = { url: null, c };
  // paper body from the kit (manila/book paper), then cut the shape
  const src = paperTexture('book', tw * PX, th * PX, { seed: 5, edge: 0.35, edgeW: 3 });
  tagCache.set(key, out);
  base.onload = () => {
    x.imageSmoothingEnabled = false;
    x.drawImage(base, 0, 0, tw, th);
    const d = x.getImageData(0, 0, tw, th), p = d.data;
    const N = 5, cx = Math.floor(tw / 2), cy = 4;
    const inside = (i, j) => {
      if (i < 0 || j < 0 || i >= tw || j >= th) return false;
      if (j < N && (i < N - j || i > tw - 1 - (N - j))) return false;
      if (Math.hypot(i - cx, j - cy) < 1.6) return false; // hole
      return true;
    };
    const ink = [59, 36, 20];
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const k = (j * tw + i) * 4;
      if (!inside(i, j)) { p[k + 3] = 0; continue; }
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
      const r = Math.hypot(i - cx, j - cy);
      if (edge && r > 2.4) { p[k] = ink[0]; p[k + 1] = ink[1]; p[k + 2] = ink[2]; continue; }
      if (r < 3.2) { // brass grommet
        const lit = (i - cx) + (j - cy) < 0;
        const col = lit ? [246, 230, 172] : [141, 108, 50];
        p[k] = col[0]; p[k + 1] = col[1]; p[k + 2] = col[2];
        continue;
      }
      // bottom shade line + dashed inner border
      if (j === th - 2) { p[k] *= 0.82; p[k + 1] *= 0.8; p[k + 2] *= 0.78; }
      const inner = (i === 2 || i === tw - 3 || j === th - 3 || (j === N + 1 && i > 2 && i < tw - 3)) && (i + j) % 3 !== 0 && j > N;
      if (inner) { p[k] = p[k] * 0.55 + 192 * 0.45; p[k + 1] = p[k + 1] * 0.55 + 64 * 0.45; p[k + 2] = p[k + 2] * 0.55 + 56 * 0.45; }
    }
    x.putImageData(d, 0, 0);
    out.url = c.toDataURL();
    for (const f of out.wait || []) f(out.url);
    out.wait = null;
  };
  base.src = src;
  return out;
}

export class Hud {
  constructor(container, opts = {}) {
    this.opts = opts;
    this.icon = typeof opts.icon === 'function' ? opts.icon : (n, s) => spriteImg(n, s);
    this.sfx = (n, o) => { if (typeof opts.sfx === 'function') { try { opts.sfx(n, o); } catch { /* optional */ } } };
    this.v = { coins: 0, rating: 0, charm: 0 };
    this.shown = { coins: false, rating: false, charm: false };
    this.ang = 0; this.vel = 0; this.raf = 0;
    const el = document.createElement('div');
    el.className = 'hud2';
    el.innerHTML = `
      <div class="hud2-hang">
        <i class="hud2-string"></i>
        <div class="hud2-tag" role="status" aria-label="Coins">
          <span class="hud2-coin">${this.icon('coin', 2)}</span>
          <span class="hud2-num"></span>
          <i class="hud2-glint"></i>
        </div>
      </div>
      <div class="hud2-row">
        <div class="hud2-stars" aria-label="Rating"></div>
        <div class="hud2-charm" aria-label="Charm"><span class="hud2-heart">${this.icon('heart', 1)}</span><b></b></div>
      </div>`;
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.$ = { hang: q('.hud2-hang'), tag: q('.hud2-tag'), num: q('.hud2-num'), coin: q('.hud2-coin'), stars: q('.hud2-stars'), charm: q('.hud2-charm'), charmV: q('.hud2-charm b'), heart: q('.hud2-heart'), row: q('.hud2-row') };
    this.$.stars.innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="hud2-star" data-i="${i}"></span>`).join('');
    this.starEls = [...this.$.stars.children];
    this.starState = [];
    if (opts.onCoins) { this.$.tag.classList.add('ia'); this.$.tag.addEventListener('click', () => opts.onCoins()); }
    if (opts.onRating) { this.$.stars.classList.add('ia'); this.$.stars.addEventListener('click', () => opts.onRating()); }
    if (opts.onCharm) { this.$.charm.classList.add('ia'); this.$.charm.addEventListener('click', () => opts.onCharm()); }
    this.$.tag.addEventListener('pointerenter', () => this.kick(0.12));
    container.appendChild(el);
    this.renderCoins(0, true);
    this.renderStars(0);
  }

  // --------------------------------------------------------------- public
  set(s = {}) {
    if (s.coins != null && Math.round(s.coins) !== Math.round(this.v.coins)) {
      const d = s.coins - this.v.coins;
      this.v.coins = s.coins;
      this.renderCoins(s.coins);
      this.kick(clamp(Math.abs(d) / 400, 0.12, 0.5) * (d > 0 ? 1 : -1));
      if (d < 0) this.pulse(this.$.num, 'hud2-down');
    }
    if (s.rating != null && Math.abs(s.rating - this.v.rating) > 1e-3) {
      this.v.rating = s.rating;
      this.renderStars(s.rating);
    }
    if (s.charm != null) {
      const c = Math.max(0, Math.round(s.charm));
      if (c !== this.v.charm) {
        this.v.charm = c;
        this.$.charmV.textContent = `${c}%`;
        this.$.charm.title = `Charm ${c}%`;
      }
      this.updateCharmVis();
    }
  }

  coinTarget() {
    const r = this.$.coin.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  flash(kind) {
    if (kind === 'coins') {
      this.kick(this.vel >= 0 ? 0.35 : -0.35);
      this.pulse(this.$.coin, 'hud2-bop');
      this.pulse(this.$.tag, 'hud2-shine');
    } else if (kind === 'rating') {
      this.starEls.forEach((s, i) => { s.style.animationDelay = `${i * 60}ms`; this.pulse(s, 'hud2-hop'); });
    } else if (kind === 'charm') {
      this.pulse(this.$.heart, 'hud2-beat');
      this.pulse(this.$.charmV, 'hud2-bop');
    }
  }

  setVisible(on, part) {
    const parts = part ? [part] : ['coins', 'rating', 'charm'];
    for (const p of parts) {
      if (this.shown[p] === !!on) continue;
      this.shown[p] = !!on;
      if (p === 'coins') {
        this.show(this.$.hang, on, 'hud2-drop', 'hud2-lift');
        if (on) setTimeout(() => this.kick(0.3), 380);
      }
      else if (p === 'rating') {
        this.show(this.$.stars, on, 'hud2-pop', 'hud2-out');
        if (on) this.starEls.forEach((s, i) => { s.style.animationDelay = `${120 + i * 70}ms`; this.pulse(s, 'hud2-in'); });
      } else this.updateCharmVis();
    }
  }

  destroy() { cancelAnimationFrame(this.raf); this.el.remove(); }

  // --------------------------------------------------------------- internals
  show(el, on, inCls, outCls) {
    el.classList.remove(inCls, outCls, 'hud2-hidden');
    void el.offsetWidth;
    el.classList.add(on ? inCls : outCls);
    if (!on) {
      const t = setTimeout(() => { if (el.classList.contains(outCls)) el.classList.add('hud2-hidden'); }, 300);
      el._t = t;
    }
  }
  updateCharmVis() {
    const want = this.shown.charm && this.v.charm > 0;
    if (want === !!this.charmOn) return;
    this.charmOn = want;
    this.show(this.$.charm, want, 'hud2-pop', 'hud2-out');
  }
  pulse(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el['_p' + cls]);
    el['_p' + cls] = setTimeout(() => el.classList.remove(cls), 900);
  }

  renderCoins(n, instant = false) {
    const s = fmt(n), num = this.$.num;
    const cells = [...s];
    // rebuild when the layout (digit count / commas) changes
    if (this.coinFmt !== s.replace(/\d/g, '0')) {
      this.coinFmt = s.replace(/\d/g, '0');
      num.innerHTML = cells.map((c) => (/\d/.test(c)
        ? `<span class="hud2-reel"><span class="hud2-strip">${'0123456789'.split('').map((d) => `<i>${d}</i>`).join('')}</span></span>`
        : `<span class="hud2-sep">${c}</span>`)).join('');
      this.reels = [...num.querySelectorAll('.hud2-strip')];
      this.reels.forEach((r) => { r.style.transition = 'none'; });
      this.retag();
      instant = true;
    }
    const digits = cells.filter((c) => /\d/.test(c)).map(Number);
    this.reels.forEach((r, i) => {
      if (instant) r.style.transition = 'none';
      else r.style.transition = `transform ${380 + (this.reels.length - i) * 60}ms cubic-bezier(.3,1.5,.5,1)`;
      r.style.transform = `translateY(${-digits[i] * 10}%)`;
    });
    if (instant) requestAnimationFrame(() => this.reels.forEach((r) => { r.style.transition = ''; }));
  }
  retag() {
    requestAnimationFrame(() => {
      const t = this.$.tag;
      const w = t.offsetWidth, h = t.offsetHeight;
      if (!w || !h) return;
      const tw = Math.round(w / PX), th = Math.round(h / PX);
      const o = tagURL(tw, th);
      const apply = (u) => { t.style.backgroundImage = `url(${u})`; };
      if (o.url) apply(o.url); else (o.wait = o.wait || []).push(apply);
    });
  }

  renderStars(r) {
    const v = clamp(Math.round(r * 2) / 2, 0, 5);
    this.starEls.forEach((s, i) => {
      const k = v >= i + 1 ? 'star' : v >= i + 0.5 ? 'star_half' : 'star_empty';
      if (this.starState[i] !== k) {
        const was = this.starState[i];
        this.starState[i] = k;
        s.innerHTML = this.icon(k, 1);
        s.dataset.k = k;
        if (was) { s.style.animationDelay = '0ms'; this.pulse(s, k === 'star_empty' ? 'hud2-drop1' : 'hud2-hop'); }
      }
    });
    this.$.stars.title = `Rating ${(Math.round(r * 10) / 10).toFixed(1)}`;
  }

  // swing: damped spring on the tag's angle (radians)
  kick(v) {
    this.vel += v * 4;
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.step(t)); }
  }
  step(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    dt = clamp(dt, 0, 0.05);
    // substep for stability on slow frames
    const n = Math.max(1, Math.ceil(dt / 0.008));
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      const acc = -60 * Math.sin(this.ang) - 4.2 * this.vel;
      this.vel += acc * h;
      this.ang += this.vel * h;
    }
    this.ang = clamp(this.ang, -0.7, 0.7);
    this.$.tag.style.transform = `rotate(${(this.ang * 57.3).toFixed(2)}deg)`;
    if (Math.abs(this.ang) < 0.002 && Math.abs(this.vel) < 0.01) {
      this.ang = 0; this.vel = 0; this.$.tag.style.transform = ''; this.raf = 0;
      return;
    }
    this.raf = requestAnimationFrame((tt) => this.step(tt));
  }
}
