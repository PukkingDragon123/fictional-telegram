// [v33 bubble] Status bubbles: round soap-bubble pixel art floating over the pond's breeding states.
//
//   eggs     laid (waiting for dad) -> fertilizing (droplet, fill rises) -> incubating (egg, fill rises,
//            timer) -> ready (pulses, sparkles, "TAP!")
//   dates    a couple swimming to each other (heart pulses, little hearts rise) -> on the date (fill rises)
//   fry      a baby fish growing up (small bubble, fill = how grown)
//
// Every bubble is one tiny canvas at art resolution (1 canvas px = 1 art px) CSS-scaled by an integer with
// image-rendering: pixelated: a pixel ellipse outline, a stepped soap-film rim (the bottom band wears the
// egg's rarity colour, --rc), a dithered sheen, a hand-placed shine, a stepped liquid fill with a moving
// 1 px wave and a hand-drawn icon. It wobbles and bobs in whole art pixels; hover grows + jiggles it; a tap
// pops it (ring breaks, droplets fly, a splash) and then runs the old tap action (UI.tapPondEgg for eggs,
// so a ready egg still hatches); the bubble re-inflates a moment later.
//
//   const sb = new StatusBubbles(ui);  sb.update(dt) every frame (UI.updateEggTags)
//   window.__statusBubbles (debug)
// Elements keep the `eggtag` class so every "hide the egg tags" rule (cutscenes, lab, classroom...) still applies.
import './statusBubbles.css';
import { GROW_TIME, breedTime } from '../game/FishSystem.js';
import { RARITIES } from '../data/species.js';

const W = 36, C = 18; // canvas art size, bubble centre
const INK = [26, 20, 32];
const WHITE = [255, 255, 255];
const FILM = { top: [255, 186, 222], left: [205, 186, 255], right: [176, 255, 220], bottom: [150, 232, 255] };
const SHEEN = [214, 242, 255];
// [deep, surface] per state
const FILL = {
  laid: [[255, 150, 190], [255, 210, 228]],
  fert: [[96, 196, 255], [196, 238, 255]],
  inc: [[255, 200, 90], [255, 236, 168]],
  ready: [[255, 186, 40], [255, 236, 128]],
  date: [[255, 104, 150], [255, 186, 210]],
  court: [[255, 104, 150], [255, 186, 210]],
  fry: [[96, 214, 160], [190, 255, 216]],
};
const WAVE = [0, 0, 1, 1, 0, 0, -1, -1];

// hand-drawn icons (K ink; others below)
const ICONS = {
  heart: [
    '.KK...KK.',
    'KwpK.KppK',
    'KwppKpppK',
    'KpppppppK',
    '.KppppPK.',
    '..KppPK..',
    '...KPK...',
    '....K....',
  ],
  egg: [
    '...KK...',
    '..KwcK..',
    '.KwcccK.',
    '.KwccdK.',
    'KccccssK',
    'KcdcccsK',
    'KccccdsK',
    'KcccsssK',
    '.KsccsK.',
    '..KKKK..',
  ],
  drop: [
    '...K...',
    '..KbK..',
    '..KbK..',
    '.KwbbK.',
    'KwbbbbK',
    'KbbbbBK',
    'KbbbBBK',
    '.KbBBK.',
    '..KKK..',
  ],
  fry: [
    '..KKKK.....',
    '.KwgggK..KK',
    'KgEggggKKgK',
    'KggggGGggK.',
    '.KGGGGKKgK.',
    '..KKKK..KK.',
  ],
};
const ICOL = {
  K: INK, w: WHITE, p: [255, 96, 140], P: [214, 52, 102], c: [255, 246, 222], s: [226, 204, 164], d: [190, 150, 96],
  b: [92, 186, 255], B: [44, 120, 214], g: [255, 170, 80], G: [214, 116, 44], E: INK,
};
// hand-placed shine for a radius-10 bubble (offsets from the centre), scaled for other sizes
const SHINE = [[-7, -2], [-7, -3], [-6, -4], [-6, -5], [-5, -6], [-4, -6], [-3, -7]];
const SHINE2 = [[-6, -2], [-6, -3], [-5, -4], [-5, -5], [-4, -5]];
const DOT = [[-3, -4], [-2, -4], [-3, -3]];
const GLINT = [[5, 5], [6, 4]];
const MINI_HEART = [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]];

const hexRGB = (h) => { const s = String(h || '#d8d2c0').replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };

function paint(ctx, img, o) {
  const d = img.data;
  d.fill(0);
  const put = (x, y, c, a = 255) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= W) return;
    const i = (y * W + x) * 4;
    if (a >= 255 || d[i + 3] === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; return; }
    const t = a / 255; // stepped alphas only: no smooth gradients
    d[i] = d[i] + (c[0] - d[i]) * t; d[i + 1] = d[i + 1] + (c[1] - d[i + 1]) * t; d[i + 2] = d[i + 2] + (c[2] - d[i + 2]) * t; d[i + 3] = Math.max(d[i + 3], a);
  };
  const R = o.R, F = o.frame;
  if (o.pop >= 0) { popFrame(put, R, o.pop, o.rc); ctx.putImageData(img, 0, 0); return; }
  const rx = R * (1 + o.ax), ry = R * (1 - o.ax);
  const cx = C, cy = C;
  const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(W - 1, Math.ceil(cy + ry + 1));
  const ins = (x, y) => { const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry; return u * u + v * v <= 1; };
  const kind = (x, y) => {
    if (!ins(x, y)) return 0;
    if (!ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)) return 1; // outline
    if (!ins(x - 2, y) || !ins(x + 2, y) || !ins(x, y - 2) || !ins(x, y + 2)) return 2; // rim
    return 3;
  };
  // fill surface (stepped, 1 art px per step)
  const inner = Math.max(1, 2 * ry - 3);
  const lvl = Math.max(0, Math.min(1, o.level || 0));
  const top = cy + ry - 1.5 - lvl * inner;
  const fc = FILL[o.state] || FILL.inc;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const k = kind(x, y);
      if (!k) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (k === 1) { put(x, y, INK); continue; }
      const ang = Math.atan2(dy, dx) * 180 / Math.PI; // y down: 90 = bottom
      if (k === 2) {
        const c = ang > 35 && ang < 145 ? o.rc : ang <= -35 && ang >= -145 ? FILM.top : (ang >= 145 || ang <= -145) ? FILM.left : FILM.right;
        put(x, y, c, 230);
      } else {
        put(x, y, SHEEN, 64);
        const nd = Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
        if (nd > 0.62 && ((x + y) & 1) === 0) put(x, y, ang > 0 ? FILM.bottom : FILM.top, 96); // dithered soap sheen
      }
      if (lvl > 0) {
        const s = Math.round(top + (lvl < 0.97 ? WAVE[(x + F) & 7] * 0.6 : 0));
        if (y > s) put(x, y, fc[0], k === 2 ? 210 : 190);
        else if (y === s) put(x, y, fc[1], 235);
      }
    }
  }
  // shine (hand-placed clusters, scaled to the size)
  const sc = R / 10;
  const P = (list, c, a) => { for (const [px, py] of list) put(Math.round(cx + px * sc * (1 + o.ax)), Math.round(cy + py * sc * (1 - o.ax)), c, a); };
  P(SHINE2, SHEEN, 220); P(SHINE, WHITE); P(DOT, WHITE); P(GLINT, WHITE, 200);
  // icon (jiggles a pixel while hovered)
  const ic = ICONS[o.icon];
  if (ic) {
    const ih = ic.length, iw = ic[0].length;
    const ox = Math.round(cx - iw / 2) + (o.hover ? WAVE[(F * 2) & 7] : 0), oy = Math.round(cy - ih / 2) - (o.small ? 0 : 1);
    for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) { const ch = ic[j][i]; if (ch !== '.') put(ox + i, oy + j, ICOL[ch] || INK); }
    if (o.state === 'fert') { // a tiny sparkle beside the droplet
      const sx = ox + iw + 1, sy = oy + 1, on = F & 2;
      put(sx, sy, WHITE); if (on) { put(sx - 1, sy, [255, 240, 150]); put(sx + 1, sy, [255, 240, 150]); put(sx, sy - 1, [255, 240, 150]); put(sx, sy + 1, [255, 240, 150]); }
    }
  }
  // ready: twinkles hop around the bubble
  if (o.state === 'ready') {
    const spots = [[-1, -1.05], [1.1, -0.5], [0.95, 0.9], [-1.15, 0.55], [0.15, -1.3], [-0.4, 1.25]];
    for (let k = 0; k < spots.length; k++) {
      if (((F >> 1) + k) % 3 !== 0) continue;
      const sx = Math.round(cx + spots[k][0] * (R + 2)), sy = Math.round(cy + spots[k][1] * (R + 2));
      const big = (F + k) & 1;
      put(sx, sy, WHITE);
      const arm = [255, 226, 96];
      put(sx - 1, sy, arm); put(sx + 1, sy, arm); put(sx, sy - 1, arm); put(sx, sy + 1, arm);
      if (big) { put(sx - 2, sy, arm, 200); put(sx + 2, sy, arm, 200); put(sx, sy - 2, arm, 200); put(sx, sy + 2, arm, 200); }
    }
  }
  // courting: little hearts float up out of the top
  if (o.state === 'court' || o.state === 'date') {
    for (let k = 0; k < 2; k++) {
      const ph = (F + k * 5) % 10;
      const hx = Math.round(cx + (k ? 3 : -5) + (ph > 5 ? 1 : 0)), hy = Math.round(cy - ry - 1 - ph);
      if (hy < 0) continue;
      for (const [px, py] of MINI_HEART) put(hx + px, hy + py, ph > 7 ? [255, 186, 210] : [255, 96, 140], ph > 7 ? 170 : 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

// the pop: the ring breaks, bits fly, droplets fall
function popFrame(put, R, f, rc) {
  const cx = C, cy = C;
  const ring = (r, keep, c) => {
    const n = Math.max(12, Math.round(r * 6.3));
    for (let k = 0; k < n; k++) { if (!keep(k)) continue; const a = (k / n) * Math.PI * 2; put(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), c); }
  };
  if (f === 0) {
    ring(R + 1, (k) => k % 3 !== 0, INK);
    ring(R, (k) => k % 3 === 1, WHITE);
  } else if (f === 1) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.4;
      const c = k % 2 ? FILM.top : FILM.bottom;
      put(Math.round(cx + Math.cos(a) * (R + 3)), Math.round(cy + Math.sin(a) * (R + 3)), INK);
      put(Math.round(cx + Math.cos(a) * (R + 4)), Math.round(cy + Math.sin(a) * (R + 4)), c);
    }
  } else if (f === 2) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.8;
      put(Math.round(cx + Math.cos(a) * (R + 6)), Math.round(cy + Math.sin(a) * (R + 6)), k % 3 ? WHITE : rc);
    }
    for (let k = -1; k <= 1; k++) put(cx + k * 4, cy + R + 2 + (k & 1), FILM.bottom);
  } else {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 1.1;
      put(Math.round(cx + Math.cos(a) * (R + 8)), Math.round(cy + Math.sin(a) * (R + 7) + 2), FILM.bottom, 200);
    }
    for (let k = -1; k <= 1; k++) put(cx + k * 5, cy + R + 5, FILM.bottom, 200);
  }
}

const POP_FRAME = 0.07, POP_GONE = 1.0, POP_BACK = 1.32;
const INFLATE = [0.35, 0.6, 0.85, 1.12, 1];

export class StatusBubbles {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.map = new Map();
    this.t = 0;
    this.sfxT = 0;
    if (typeof window !== 'undefined') window.__statusBubbles = this;
  }

  sfx(name, o) { try { this.game.audio?.play(name, o); } catch { /* ignore */ } }

  // what should float over the pond right now
  wanted() {
    const game = this.game, out = [];
    const fishSys = game.fish;
    for (const e of fishSys.eggs || []) {
      if (e.dead) continue;
      const stage = e.ready ? 'ready' : e.stage === 'laid' ? (e.fertP > 0 ? 'fert' : 'laid') : 'inc';
      const best = Math.max(...(e.genes || [{ stars: 1 }]).map((g) => g?.stars || 1));
      let level = 0, cap = '';
      if (stage === 'fert') { level = e.fertP / breedTime(game, 12); cap = `${Math.min(99, Math.round(level * 100))}%`; } // FishSystem FERT_TIME
      else if (stage === 'inc') { level = 1 - e.t / Math.max(1, e.total || e.t || 1); cap = `${Math.floor(e.t / 60)}:${String(Math.ceil(e.t) % 60).padStart(2, '0')}`; }
      else if (stage === 'ready') { level = 1; cap = 'TAP!'; }
      else level = 0.2; // laid: a little pink puddle while it waits for dad
      out.push({
        key: e, kind: 'egg', state: stage, level, cap, count: e.count > 1 ? e.count : 0, R: 10,
        icon: stage === 'fert' ? 'drop' : 'egg', rarity: e.rarity ?? Math.max(0, Math.min(4, best - 1)),
        pos: () => (e.tank ? this.ui.screenOf(e.tank.x + 0.5, (game.structures.baseY?.(e.tank) || 0) + 1.15, e.tank.z + 0.5) : this.ui.screenOf(e.x, 0.45, e.z)),
      });
    }
    let fry = 0;
    for (const f of fishSys.list || []) {
      if (f.dead || f.held) continue;
      const m = f.mate;
      if (m && !m.dead && f.id < m.id && (f.state === 'court' || f.dateT > 0) && !f.tank) {
        const dating = f.dateT > 0;
        out.push({ key: f, kind: 'date', state: dating ? 'date' : 'court', dateT: f.dateT, level: 0, cap: '', count: 0, R: 10, icon: 'heart', rcol: [255, 120, 170], mate: m,
          pos: () => this.ui.screenOf((f.x + m.x) / 2, 0.62, (f.z + m.z) / 2) });
      } else if (!f.adult && !f.tank && fry < 10) {
        fry++;
        out.push({ key: f, kind: 'fry', state: 'fry', level: Math.max(0.06, Math.min(1, f.age / GROW_TIME)), cap: '', count: 0, R: 7, small: true, icon: 'fry', rcol: [120, 230, 190],
          pos: () => this.ui.screenOf(f.x, 0.42, f.z) });
      }
    }
    return out;
  }

  make(w) {
    const el = document.createElement('div');
    el.className = `eggtag sbub sb-${w.kind}`;
    el.innerHTML = '<canvas></canvas><span class="sbub-hit"></span><b class="sbub-cap"></b><i class="sbub-n"></i>';
    const cv = el.querySelector('canvas');
    cv.width = W; cv.height = W;
    const ctx = cv.getContext('2d');
    const b = { el, cv, ctx, img: ctx.createImageData(W, W), kind: w.kind, w, hover: false, popT: -1, ph: Math.random() * 6.28, key: '', cap: null, S: 0, dateMax: 0 };
    const hit = el.querySelector('.sbub-hit');
    hit.addEventListener('pointerenter', () => {
      b.hover = true;
      if (b.popT < 0 && this.t - this.sfxT > 0.12) { this.sfxT = this.t; this.sfx('bubble', { volume: 0.16, pitch: 1.5 + Math.random() * 0.3 }); }
    });
    hit.addEventListener('pointerleave', () => { b.hover = false; });
    hit.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    hit.addEventListener('click', (ev) => { ev.stopPropagation(); this.tap(b); });
    this.ui.overlay.appendChild(el);
    return b;
  }

  // tap: pop + splash, then the tap action (egg info line / hatch, a date / growing line)
  tap(b) {
    const ui = this.ui, game = this.game, w = b.w;
    if (ui.busy || game.inputLocked) return;
    if (b.popT >= 0 && b.popT < POP_GONE) return;
    b.popT = 0;
    this.sfx('bubble', { volume: 0.5, pitch: 1.9 + Math.random() * 0.2 });
    this.sfx('water_drip', { volume: 0.22, pitch: 1.3 });
    const o = w.key;
    if (w.kind === 'egg' && !o.tank) try { game.particles.splash(o.x, o.z, 4, 0.35); } catch { /* ignore */ }
    if (w.kind === 'date') this.sfx('heart', { volume: 0.25, pitch: 1.4 });
    setTimeout(() => {
      if (w.kind === 'egg') { ui.tapPondEgg(o); return; }
      const nm = (f) => f.name || f.sp?.name || 'Fish';
      let line = '';
      if (w.kind === 'date') {
        const m = o.mate;
        if (!m) return;
        line = o.dateT > 0 ? `${nm(o)} & ${nm(m)}: on a date! ${Math.round(this.dateProg(b) * 100)}%` : `${nm(o)} & ${nm(m)} are in love!`;
      } else line = `${o.name ? o.name + ': ' : 'Fry: '}${Math.round(Math.min(1, o.age / GROW_TIME) * 100)}% grown`;
      ui.say({ getWorldPos: (v) => v.set(o.x, 0.5, o.z) }, line, { dur: 1.6, key: 'sbub', size: 's' });
    }, 180);
  }

  dateProg(b) {
    const t = b.w.dateT || 0;
    if (t > b.dateMax) b.dateMax = t;
    return b.dateMax > 0 ? 1 - t / b.dateMax : 0;
  }

  update(dt) {
    const game = this.game, ui = this.ui;
    this.t += dt;
    const list = this.wanted();
    const seen = new Set();
    const S = innerHeight >= 1000 ? 3 : 2;
    const hideAll = !!game.lab?.active;
    const F = Math.floor(this.t * 8);
    for (const w of list) {
      let b = this.map.get(w.key);
      if (b && b.kind !== w.kind) { b.el.remove(); this.map.delete(w.key); b = null; }
      if (!b) { b = this.make(w); this.map.set(w.key, b); }
      seen.add(w.key);
      b.w = w;
      if (w.kind === 'date') w.level = w.state === 'date' ? this.dateProg(b) : 0;
      else b.dateMax = 0;
      const p = w.pos();
      if (p.visible === false || hideAll) { if (b.el.style.display !== 'none') b.el.style.display = 'none'; continue; }
      if (b.el.style.display === 'none') b.el.style.display = '';
      if (b.S !== S) {
        b.S = S;
        b.cv.style.width = b.cv.style.height = `${W * S}px`;
        b.el.style.setProperty('--s', `${S}px`);
      }
      // pop / re-inflate clock
      let pop = -1, inflate = 1;
      if (b.popT >= 0) {
        b.popT += dt;
        if (b.popT < POP_FRAME * 4) pop = Math.floor(b.popT / POP_FRAME);
        else if (b.popT < POP_GONE) pop = 9; // gone for a moment
        else if (b.popT < POP_BACK) inflate = INFLATE[Math.min(INFLATE.length - 1, Math.floor(((b.popT - POP_GONE) / (POP_BACK - POP_GONE)) * INFLATE.length))];
        else b.popT = -1;
      }
      // size: hover grows it, ready / courting pulse it
      let R = w.R + (b.hover ? 2 : 0);
      if (w.state === 'ready' && (F >> 2) % 2 === 0) R += 1;
      if (w.state === 'court' && (F % 6) < 2) R += 1;
      R = Math.max(2, Math.round(R * inflate));
      // wobble (a stepped squash) and bob, in whole art pixels
      const wf = b.hover ? Math.floor(this.t * 14) : Math.floor(this.t * (w.state === 'ready' ? 7 : 4) + b.ph);
      const amp = b.hover ? 0.13 : w.state === 'ready' ? 0.08 : 0.05;
      const ax = [0, amp, 0, -amp][wf & 3];
      const bob = Math.round(Math.sin(this.t * 2.1 + b.ph) * 1.6);
      const rc = w.rcol || hexRGB((RARITIES[w.rarity] || RARITIES[0]).color);
      const lvlStep = Math.round((w.level || 0) * 24);
      const key = `${w.state}|${R}|${ax}|${lvlStep}|${pop}|${b.hover ? F : F >> 1}|${rc}`;
      if (key !== b.key) {
        b.key = key;
        if (pop === 9) b.ctx.clearRect(0, 0, W, W);
        else paint(b.ctx, b.img, { R, ax, level: lvlStep / 24, state: w.state, icon: w.icon, rc, frame: F, hover: b.hover, pop, small: w.small });
      }
      if (b.rc !== rc) { b.rc = rc; b.el.style.setProperty('--rc', `rgb(${rc.join(',')})`); }
      // caption + count
      const capTxt = pop >= 0 ? '' : w.cap;
      if (capTxt !== b.cap) {
        b.cap = capTxt;
        const cap = b.el.querySelector('.sbub-cap');
        cap.classList.toggle('tap', capTxt === 'TAP!');
        cap.innerHTML = capTxt === 'TAP!' ? [...capTxt].map((ch, i) => `<span style="animation-delay:${i * 90}ms">${ch}</span>`).join('') : capTxt;
      }
      const nTxt = w.count && pop < 0 ? `×${w.count}` : '';
      if (b.n !== nTxt) { b.n = nTxt; b.el.querySelector('.sbub-n').textContent = nTxt; }
      b.el.classList.toggle('ready', w.state === 'ready');
      b.el.classList.toggle('popped', pop >= 0);
      // the bubble's bottom sits a little above the anchor
      const x = Math.round(p.x - C * S), y = Math.round(p.y - (C + w.R + 3) * S + bob * S);
      const tf = `translate(${x}px, ${y}px)`;
      if (b.tf !== tf) { b.tf = tf; b.el.style.transform = tf; }
    }
    for (const [k, b] of this.map) if (!seen.has(k)) { b.el.remove(); this.map.delete(k); }
  }

  clear() { for (const b of this.map.values()) b.el.remove(); this.map.clear(); }
}
