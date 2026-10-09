// [v26 feast] The minimal feast overlay (the normal UI is hidden by body.feast-cam):
//   - a wooden strip (clock, bears left, coins tonight) + a ticker for Reynard's notes
//   - Auto-cam + x3 fast-forward buttons, the follow tag, hints, "tap to skip"
//   - world-anchored event icons (pixel badges: pop-in, wobble, pulse ring, countdown
//     pips) with edge-of-screen arrows when they are off screen
//   - the choice card (wood + parchment, 2-3 choices with costs, a rubber stamp)
//   - comic words, flying coins, the timing mini-game
import './feast.css';
import * as THREE from 'three';
import { spriteImg, spriteCanvas, hasSprite, spriteURL } from './sprites.js';
import { comicWordSize, paintComicWord } from './goofyText.js';
import { isBear } from '../game/feast/ctx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (n, s = 2, cls = '') => (hasSprite(n) ? spriteImg(n, s, cls) : '');
const KIND_COL = {
  customer: { ring: ['#7a4a12', '#e5a320', '#ffd23f', '#fff3a3'], fill: '#fffaf0' },
  bear: { ring: ['#4e1422', '#b0303a', '#d9453b', '#f07a52'], fill: '#fffaf0' },
  facility: { ring: ['#16304e', '#28699a', '#3a8cbc', '#a4dcee'], fill: '#f2f8fb' },
  beaver: { ring: ['#173628', '#2a723e', '#46963c', '#c2e274'], fill: '#f6fbef' },
  highlight: { ring: ['#6a2410', '#cc5a1c', '#ee7e2a', '#ffd08a'], fill: '#fff6e8' },
};
const INK = '#2a1a14';
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- pixel art
function badgeCanvas(glyph, kind) {
  const W = 30, H = 34;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const col = KIND_COL[kind] || KIND_COL.bear;
  const cx = 14.5, cy = 13.5, R = 13.4;
  const inside = (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= R * R) return true;
    // the tail
    if (y >= 22 && y <= 30) { const half = (30 - y) * 0.62; return Math.abs(x + 0.5 - cx) <= half; }
    return false;
  };
  const m = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = inside(x, y) ? 1 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x]);
  // distance from the edge (0 = outline)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      let d = 9;
      for (let r = 1; r <= 4 && d === 9; r++)
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.abs(i) + Math.abs(j) <= r && !at(x + i, y + j)) { d = r - 1; }
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const lit = -dx - dy; // top-left light
      let fill;
      if (d === 0) fill = INK;
      else if (d === 1) fill = lit > 4 ? col.ring[3] : lit < -6 ? col.ring[1] : col.ring[2];
      else if (d === 2) fill = lit < -8 ? col.ring[1] : col.ring[2];
      else if (d === 3) fill = col.ring[0];
      else fill = dy < -7 && dx < 2 ? '#ffffff' : col.fill;
      c.fillStyle = fill;
      c.fillRect(x, y, 1, 1);
    }
  // drop shadow under the tail
  c.fillStyle = 'rgba(42,26,20,.35)';
  c.fillRect(13, 32, 4, 1);
  if (glyph && hasSprite(glyph)) {
    const g = spriteCanvas(glyph, 1);
    c.drawImage(g, Math.round(cx - g.width / 2), Math.round(cy - g.height / 2) + 0, g.width, g.height);
  } else {
    // fallback: a big "!"
    c.fillStyle = INK; c.fillRect(13, 5, 4, 11); c.fillRect(13, 18, 4, 4);
    c.fillStyle = col.ring[2]; c.fillRect(14, 6, 2, 9); c.fillRect(14, 19, 2, 2);
  }
  return cv;
}

function arrowCanvas(kind) {
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const c = cv.getContext('2d');
  const col = KIND_COL[kind] || KIND_COL.bear;
  const rows = [
    '....kk..........',
    '....kak.........',
    '....kaak........',
    '....kbaak.......',
    'kkkkkbbaak......',
    'kaaaabbbaak.....',
    'kbbbbbbbbaak....',
    'kbbbbbbbbbbak...',
    'kbbbbbbbbbbck...',
    'kccccbbbbbck....',
    'kkkkkcbbbck.....',
    '....kcbbck......',
    '....kcbck.......',
    '....kcck........',
    '....kkk.........',
    '................',
  ];
  const pal = { k: INK, a: col.ring[3], b: col.ring[2], c: col.ring[1] };
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const p = pal[r[x]]; if (p) { c.fillStyle = p; c.fillRect(x, y, 1, 1); } } });
  return cv;
}

function wordCanvas(text, { fill = '#fff4d0', shade = '#ffb84a', ink = '#5a1e10' } = {}) {
  const { w, h } = comicWordSize(text);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  paintComicWord(cv.getContext('2d'), 0, 0, text, { fill, shade, ink });
  return cv;
}

const WORD_COLORS = {
  red: { fill: '#ffe0d0', shade: '#ff4a3a', ink: '#4a0a0a' },
  gold: { fill: '#fffbd0', shade: '#ffc020', ink: '#5a3a00' },
  green: { fill: '#f0ffd8', shade: '#6cc04a', ink: '#1a3a10' },
  blue: { fill: '#e8fbff', shade: '#5ac0ff', ink: '#10304a' },
  pink: { fill: '#ffe3f0', shade: '#ff6aa8', ink: '#5a1030' },
  orange: { fill: '#fff4d0', shade: '#ffb84a', ink: '#5a1e10' },
  white: { fill: '#ffffff', shade: '#c8d0e0', ink: '#1a2030' },
};

// ---------------------------------------------------------------- the overlay
export class FeastUI {
  constructor(game, feast) {
    this.game = game;
    this.feast = feast;
    this.icons = new Map(); // inst/highlight -> { el, arrow, ... }
    this.words = [];
    this.coinEls = [];
    this.card = null;
    this.mini = null;
    this.root = document.createElement('div');
    this.root.className = 'fe-root hidden';
    this.root.innerHTML = `
      <div class="fe-strip f-wood">
        <span class="fe-chip fe-time">${ico('clock', 2)}<b class="v">5:00</b><i class="ap">PM</i></span>
        <span class="fe-chip fe-bears">${ico('bear_happy', 2)}<b class="v">0</b><i>left</i></span>
        <span class="fe-chip fe-coins">${ico('coin', 2)}<b class="v">+0</b></span>
      </div>
      <div class="fe-ticker f-parchment hidden"></div>
      <div class="fe-follow hidden"></div>
      <div class="fe-hint f-parchment hidden"></div>
      <div class="fe-skip hidden">Tap to skip</div>
      <div class="fe-ctrl">
        <button class="fe-btn fe-auto f-wood" title="Auto-cam: let the camera director film the feast (C)">${ico('camera', 2)}<span>Auto-cam</span><i class="led"></i></button>
        <button class="fe-btn fe-ff f-wood" title="Fast-forward x3 (F)">${ico('fastforward', 2)}<span>x3</span><i class="led"></i></button>
      </div>
      <div class="fe-icons"></div>
      <div class="fe-fly"></div>`;
    (document.getElementById('ui') || document.body).appendChild(this.root);
    const $ = (s) => this.root.querySelector(s);
    this.$ = { strip: $('.fe-strip'), time: $('.fe-time .v'), ap: $('.fe-time .ap'), bears: $('.fe-bears .v'), coins: $('.fe-coins .v'), coinIco: $('.fe-coins img'),
      ticker: $('.fe-ticker'), follow: $('.fe-follow'), hint: $('.fe-hint'), skip: $('.fe-skip'), auto: $('.fe-auto'), ff: $('.fe-ff'), icons: $('.fe-icons'), fly: $('.fe-fly') };
    const stop = (e) => { e.stopPropagation(); };
    for (const b of [this.$.auto, this.$.ff]) { b.addEventListener('pointerdown', stop); }
    this.$.auto.addEventListener('click', (e) => { e.stopPropagation(); this.click(); this.setAutoCam(!this.feast.st.autoCam); });
    this.$.ff.addEventListener('click', (e) => { e.stopPropagation(); this.click(); this.setFast(!this.game.cine?.fast); });
    this.$.follow.addEventListener('click', (e) => { e.stopPropagation(); this.feast.unfollow(); });
    this.$.skip.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.game.cine?.skipIntro?.(); });
    this.coins0 = 0;
    this.lastStrip = '';
  }

  click() { this.game.audio.play('feast_click', { volume: 0.4 }); }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    if (on) {
      this.coins0 = this.game.state.coins;
      this.night = 0;
      this.$.skip.classList.remove('hidden');
      this.syncButtons();
      this.updateStrip(true);
    } else {
      for (const k of [...this.icons.keys()]) this.removeIcon(k);
      this.closeCard();
      this.endMini();
      this.setFollow(null);
      this.$.hint.classList.add('hidden');
      this.$.ticker.classList.add('hidden');
    }
  }

  onHandOver() { this.$.skip.classList.add('hidden'); this.syncButtons(); }

  syncButtons() {
    this.$.auto.classList.toggle('on', !!this.feast.st.autoCam);
    this.$.ff.classList.toggle('on', !!this.game.cine?.fast);
  }

  setAutoCam(on) {
    this.game.cine?.setAutoCam?.(on);
    this.feast.st.autoCam = !!on;
    this.syncButtons();
    if (on) this.ticker('Auto-cam on. Touch the camera to take over.', 'info');
  }

  setFast(on) {
    if (on && this.feast.focusInst) on = false;
    this.game.cine?.toggleFast?.(!!on);
    this.syncButtons();
  }

  setFollow(b) {
    const el = this.$.follow;
    if (!b) { el.classList.add('hidden'); return; }
    el.innerHTML = `${ico('eye', 2)}<span>Following <b>${esc(b.name)}</b> <i>${esc(b.def.name)}</i></span>${ico('cross', 1, 'x')}`;
    el.classList.remove('hidden');
  }

  hint(text, dur = 5) {
    const el = this.$.hint;
    el.textContent = text;
    el.classList.remove('hidden', 'out');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 400); }, dur * 1000);
  }

  ticker(text, mood = 'info') {
    const el = this.$.ticker;
    el.innerHTML = `${ico(mood === 'warn' || mood === 'no' ? 'warning' : 'fox_smug', 1)}<span>${esc(String(text).replace(/<[^>]+>/g, ''))}</span>`;
    el.classList.remove('hidden', 'out');
    el.classList.toggle('warn', mood === 'warn' || mood === 'no');
    void el.offsetWidth;
    el.classList.add('pop');
    clearTimeout(this._tickT);
    this._tickT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 350); }, Math.min(6000, 2200 + text.length * 45));
  }

  coinTarget() {
    const r = this.$.coinIco?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ------------------------------------------------------------ strip
  updateStrip(force = false) {
    const game = this.game, st = game.state;
    const h = st.hour, hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
    const t = `${hh % 12 === 0 ? 12 : hh % 12}:${String(Math.floor(mm / 5) * 5).padStart(2, '0')}`;
    let left = 0;
    for (const b of game.bears.list) if (!b.lunch && b.state !== 'commuteUp' && b.goal?.kind !== 'leave' && b.state !== 'walkDirect') left++;
    const coins = st.coins - this.coins0;
    const key = `${t}|${left}|${coins}`;
    if (key === this.lastStrip && !force) return;
    this.lastStrip = key;
    this.$.time.textContent = t;
    this.$.ap.textContent = hh >= 12 ? 'PM' : 'AM';
    this.$.bears.textContent = String(left);
    this.$.coins.textContent = `${coins >= 0 ? '+' : ''}${coins}`;
    this.$.coins.parentElement.classList.toggle('neg', coins < 0);
  }

  update(dt) {
    this.updateStrip();
    if (this.mini) this.tickMini(dt);
  }

  // ------------------------------------------------------------ event icons
  addIcon(inst) {
    if (this.icons.has(inst)) return;
    const kind = inst.highlight ? 'highlight' : inst.kind;
    const el = document.createElement('div');
    el.className = `fe-ico k-${kind}${inst.highlight ? ' hl' : ''}`;
    el.innerHTML = `<div class="fe-ico-pop"><div class="fe-ico-wob"><i class="fe-ring"></i><i class="fe-ring r2"></i></div></div>`;
    const badge = badgeCanvas(inst.def.icon, kind);
    badge.className = 'fe-badge';
    el.querySelector('.fe-ico-wob').appendChild(badge);
    let pips = null;
    if (!inst.highlight) {
      pips = document.createElement('div');
      pips.className = 'fe-pips';
      pips.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
      el.querySelector('.fe-ico-wob').appendChild(pips);
    }
    const arrow = document.createElement('div');
    arrow.className = `fe-arrow k-${kind} hidden`;
    const ac = arrowCanvas(kind); ac.className = 'fe-arr';
    const mini = badgeCanvas(inst.def.icon, kind); mini.className = 'fe-arr-badge';
    arrow.append(ac, mini);
    const go = (e) => { e.preventDefault(); e.stopPropagation(); this.onIconClick(inst); };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    arrow.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', go);
    arrow.addEventListener('click', go);
    this.$.icons.append(el, arrow);
    this.icons.set(inst, { el, arrow, pips, nPips: 6, sx: -999, sy: -999 });
  }

  onIconClick(inst) {
    if (inst.highlight) { this.feast.peek(inst); return; }
    if (this.feast.focusInst || this.game.inputLocked) return;
    this.feast.focus(inst);
  }

  removeIcon(inst) {
    const h = this.icons.get(inst);
    if (!h) return;
    this.icons.delete(inst);
    h.arrow.remove();
    if (h.leaving) return;
    h.leaving = true;
    h.el.classList.add('bye');
    setTimeout(() => h.el.remove(), 420);
  }

  burstIcon(inst) {
    const h = this.icons.get(inst);
    if (!h) return;
    h.el.classList.add('burst');
    h.arrow.classList.add('hidden');
    h.leaving = true;
    this.icons.delete(inst);
    h.arrow.remove();
    setTimeout(() => h.el.remove(), 450);
  }

  fizzleIcon(inst) {
    const h = this.icons.get(inst);
    if (!h) return;
    h.el.classList.add('fizzle');
    h.leaving = true;
    this.icons.delete(inst);
    h.arrow.remove();
    setTimeout(() => h.el.remove(), 700);
  }

  iconPoint(inst) {
    const a = inst.actor;
    if (inst.ctx) return inst.ctx.at(a, inst.def.iconDy ?? 0.55, _v);
    if (isBear(a)) return _v.set(a.x, a.y + 2.25 * a.def.scale + 0.55, a.z);
    return _v.set(a.x, (a.y || 0) + 1.5, a.z);
  }

  render() {
    const game = this.game;
    const W = window.innerWidth, H = window.innerHeight;
    const focus = !!this.feast.focusInst;
    const intro = !this.feast.free;
    const M = 46;
    for (const [inst, h] of this.icons) {
      if (h.leaving) continue;
      const p = game.rig.worldToScreen(this.iconPoint(inst), game.renderer);
      const on = p.x > M * 0.5 && p.x < W - M * 0.5 && p.y > M && p.y < H - M * 0.4;
      const hide = intro || (focus && inst !== this.feast.focusInst);
      h.el.classList.toggle('dim', focus);
      h.el.classList.toggle('hidden', hide || !on);
      if (on && !hide) {
        const x = Math.round(p.x), y = Math.round(p.y);
        if (x !== h.sx || y !== h.sy) { h.el.style.transform = `translate(${x}px, ${y}px)`; h.sx = x; h.sy = y; }
      }
      // off screen: an arrow at the edge pointing at it
      const showArrow = !on && !hide;
      h.arrow.classList.toggle('hidden', !showArrow);
      if (showArrow) {
        const cx = W / 2, cy = H / 2;
        let dx = p.x - cx, dy = p.y - cy;
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const ex = W / 2 - 40, ey = H / 2 - 54;
        const k = Math.min(Math.abs(ex / (dx || 1e-6)), Math.abs(ey / (dy || 1e-6)));
        const ax = Math.round(cx + dx * k), ay = Math.round(cy + dy * k);
        h.arrow.style.transform = `translate(${ax}px, ${ay}px)`;
        const ang = Math.atan2(dy, dx);
        h.arrow.firstChild.style.transform = `translate(-50%, -50%) rotate(${ang}rad) translateX(26px)`;
      }
      // countdown pips
      if (h.pips && inst.ttl) {
        const n = Math.max(0, Math.ceil(6 * (1 - inst.t / inst.ttl)));
        if (n !== h.nPips) {
          h.nPips = n;
          [...h.pips.children].forEach((e, i) => e.classList.toggle('off', i >= n));
          h.el.classList.toggle('hurry', n <= 2);
          h.arrow.classList.toggle('hurry', n <= 2);
          if (n <= 2 && n > 0 && !focus) this.game.audio.play('feast_tick', { volume: 0.25 });
        }
      }
    }
    this.renderWords();
    if (this.$.skip && !intro) this.$.skip.classList.add('hidden');
  }

  // ------------------------------------------------------------ comic words
  word(text, p, { color = 'orange', size = 3, life = 1.2 } = {}) {
    const cv = wordCanvas(String(text).toUpperCase(), WORD_COLORS[color] || WORD_COLORS.orange);
    cv.className = 'fe-word';
    cv.style.width = `${cv.width * size}px`;
    cv.style.height = `${cv.height * size}px`;
    cv.style.setProperty('--rot', `${(Math.random() - 0.5) * 16}deg`);
    const el = document.createElement('div');
    el.className = 'fe-word-w';
    el.appendChild(cv);
    this.$.fly.appendChild(el);
    this.words.push({ el, x: p.x, y: p.y, z: p.z, t: 0, life });
  }

  renderWords() {
    const game = this.game;
    const dt = 1 / 60;
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      w.t += dt;
      _v.set(w.x, w.y, w.z);
      const p = game.rig.worldToScreen(_v, game.renderer);
      w.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - w.t * 26)}px)`;
      if (w.t > w.life && !w.out) { w.out = true; w.el.classList.add('out'); }
      if (w.t > w.life + 0.4) { w.el.remove(); this.words.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------ flying coins
  flyCoinsOut(p, n) {
    const t = this.coinTarget();
    if (!t) return;
    const s = this.game.rig.worldToScreen(_v.copy(p), this.game.renderer);
    this.flyCoins(t, s, n, false);
  }

  flyCoinsIn(p, n) {
    const t = this.coinTarget();
    if (!t) return;
    const s = this.game.rig.worldToScreen(_v.copy(p), this.game.renderer);
    this.flyCoins(s, t, n, true);
  }

  flyCoins(a, b, n, inward) {
    const url = spriteURL('coin', 2);
    const k = Math.min(10, 3 + Math.floor(n / 6));
    for (let i = 0; i < k; i++) {
      const el = document.createElement('img');
      el.src = url;
      el.className = 'fe-coin px';
      this.$.fly.appendChild(el);
      const ang = Math.random() * Math.PI * 2, r = 16 + Math.random() * 30;
      const mx = (inward ? a.x : b.x) + Math.cos(ang) * r, my = (inward ? a.y : b.y) + Math.sin(ang) * r - 26;
      const anim = el.animate([
        { transform: `translate(${a.x}px, ${a.y}px) scale(.7)`, opacity: 1 },
        { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: inward ? 0.35 : 0.6 },
        { transform: `translate(${b.x}px, ${b.y}px) scale(.8)`, opacity: inward ? 0.9 : 0 },
      ], { duration: 620 + i * 50 + Math.random() * 120, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      anim.onfinish = () => { el.remove(); if (i % 3 === 0) this.game.audio.play('coin', { volume: 0.16, pitch: (inward ? 1 : 0.8) + i * 0.05 }); };
    }
    if (inward) { const c = this.$.coins.parentElement; c.classList.remove('bop'); void c.offsetWidth; c.classList.add('bop'); }
  }

  // ------------------------------------------------------------ the choice card
  cardOpen() { return !!this.card; }

  showCard(inst, choices) {
    this.closeCard();
    const def = inst.def, ctx = inst.ctx;
    const a = inst.actor;
    const who = isBear(a) ? `${a.name} · ${a.def.name}` : a?.def?.name || a?.name || '';
    let text = '';
    try { text = typeof def.text === 'function' ? def.text(ctx) : def.text || ''; } catch { text = ''; }
    const el = document.createElement('div');
    el.className = `fe-card k-${inst.kind}`;
    const tone = { good: 'gold', bad: 'red', neutral: 'green' };
    el.innerHTML = `
      <div class="fe-card-in">
        <div class="fe-card-head f-wood"><span class="fe-card-ico f-slot_brass"></span><div class="fe-card-t"><b>${esc(def.name)}</b><i>${esc(who)}</i></div></div>
        <div class="fe-card-body f-parchment">
          ${ico('pushpin', 2, 'fe-pin')}
          ${text ? `<p class="fe-card-txt">${esc(text)}</p>` : ''}
          <div class="fe-choices n${choices.length}"></div>
        </div>
      </div>`;
    const g = badgeCanvas(def.icon, inst.kind); g.className = 'fe-card-badge';
    el.querySelector('.fe-card-ico').appendChild(g);
    const row = el.querySelector('.fe-choices');
    const coins = this.game.state.coins;
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const t = c.tone || (i === 0 ? 'good' : i === choices.length - 1 ? 'bad' : 'neutral');
      const cost = c.cost || {};
      const broke = cost.coins > 0 && cost.coins > coins;
      b.className = `fe-choice f-button_${tone[t] || 'green'} t-${t}${broke ? ' broke' : ''}`;
      b.dataset.id = c.id;
      const bits = [];
      if (cost.coins) bits.push(`<span class="c-coin">${ico('coin', 1)}-${cost.coins}</span>`);
      if (cost.gain) bits.push(`<span class="c-gain">${ico('coin', 1)}+${cost.gain}</span>`);
      if (cost.rating) bits.push(`<span class="c-star ${cost.rating < 0 ? 'neg' : ''}">${ico(cost.rating < 0 ? 'star_empty' : 'star', 1)}${cost.rating > 0 ? '+' : ''}${cost.rating}</span>`);
      if (cost.fish) bits.push(`<span class="c-fish">${ico('fish', 1)}-${cost.fish}</span>`);
      if (cost.text) bits.push(`<span class="c-txt">${esc(cost.text)}</span>`);
      if (broke) bits.push('<span class="c-broke">not enough coins</span>');
      b.innerHTML = `<span class="fe-key">${i + 1}</span><b>${esc(c.label)}</b>${c.hint ? `<i class="fe-hint2">${esc(c.hint)}</i>` : ''}${bits.length ? `<span class="fe-cost">${bits.join('')}</span>` : ''}`;
      b.disabled = broke;
      b.style.setProperty('--d', `${0.18 + i * 0.07}s`);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('pointerenter', () => this.game.audio.play('hover', { volume: 0.25 }));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.pickChoice(c.id); });
      row.appendChild(b);
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(el);
    this.game.audio.play('paper', { volume: 0.4 });
    return new Promise((resolve) => { this.card = { el, inst, choices, resolve, picked: false }; });
  }

  pickIndex(i) { const c = this.card?.choices[i]; if (c) this.pickChoice(c.id); }

  pickChoice(id) {
    const card = this.card;
    if (!card || card.picked) return false;
    const c = card.choices.find((x) => x.id === id);
    if (!c) return false;
    const btn = card.el.querySelector(`.fe-choice[data-id="${CSS.escape(id)}"]`);
    if (btn?.disabled) { this.game.audio.play('error', { volume: 0.4 }); btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); return false; }
    card.picked = true;
    btn?.classList.add('picked');
    // a rubber stamp slams onto the card, then it slides away
    const st = document.createElement('div');
    st.className = 'fe-stamp';
    st.innerHTML = ico(c.tone === 'bad' ? 'stamp_closed' : c.cost?.coins ? 'stamp_paid' : 'stamp_approved', 3);
    card.el.querySelector('.fe-card-in').appendChild(st);
    this.game.audio.play('stamp', { volume: 0.5 });
    this.game.audio.play('feast_click', { volume: 0.4 });
    setTimeout(() => { card.el.classList.add('out'); setTimeout(() => card.el.remove(), 400); }, 520);
    this.card = null;
    card.resolve(id);
    return true;
  }

  closeCard() {
    const card = this.card;
    if (!card) return;
    this.card = null;
    card.el.remove();
    card.resolve(null);
  }

  // ------------------------------------------------------------ timing mini-game
  // a needle swings across a bar; tap when it is in the green: resolves 0..1 (quality) or -1 (missed)
  timing({ label = 'TAP!', speed = 1.3, zone = 0.22, tries = 1 } = {}) {
    this.endMini();
    const el = document.createElement('div');
    el.className = 'fe-mini';
    const z0 = 0.5 - zone / 2 + (Math.random() - 0.5) * 0.4;
    el.innerHTML = `<div class="fe-mini-box f-wood"><b class="fe-mini-l">${esc(label)}</b><div class="fe-mini-bar"><i class="z" style="left:${(z0 * 100).toFixed(1)}%;width:${(zone * 100).toFixed(1)}%"></i><i class="zz" style="left:${((z0 + zone * 0.35) * 100).toFixed(1)}%;width:${(zone * 30).toFixed(1)}%"></i><i class="n"></i></div><span class="fe-mini-s">Tap anywhere / Space</span></div>`;
    this.root.appendChild(el);
    const needle = el.querySelector('.n');
    return new Promise((resolve) => {
      const m = this.mini = { el, needle, t: Math.random() * 2, speed, z0, zone, resolve, done: false, tries };
      const hit = (e) => {
        e?.preventDefault?.(); e?.stopPropagation?.();
        if (m.done) return;
        const x = m.x;
        const inZone = x >= m.z0 && x <= m.z0 + m.zone;
        const q = inZone ? 1 - Math.abs(x - (m.z0 + m.zone / 2)) / (m.zone / 2) * 0.5 : -1;
        el.classList.add(inZone ? 'hit' : 'miss');
        this.game.audio.play(inZone ? 'feast_good' : 'error', { volume: 0.4 });
        m.done = true;
        setTimeout(() => { this.endMini(); resolve(q); }, 380);
      };
      m.hit = hit;
      el.addEventListener('pointerdown', hit);
      m.key = (e) => { if (e.key === ' ' || e.key === 'Enter') hit(e); };
      window.addEventListener('keydown', m.key, true);
      m.timeout = setTimeout(() => { if (!m.done) { m.done = true; el.classList.add('miss'); setTimeout(() => { this.endMini(); resolve(-1); }, 300); } }, 7000);
    });
  }

  tickMini(dt) {
    const m = this.mini;
    if (!m || m.done) return;
    m.t += dt * m.speed;
    m.x = 0.5 - Math.cos(m.t * Math.PI) * 0.5;
    m.needle.style.left = `${(m.x * 100).toFixed(1)}%`;
  }

  endMini() {
    const m = this.mini;
    if (!m) return;
    this.mini = null;
    clearTimeout(m.timeout);
    window.removeEventListener('keydown', m.key, true);
    m.el.remove();
    if (!m.done) { m.done = true; m.resolve(-1); }
  }
}
