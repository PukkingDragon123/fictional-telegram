// HTML/CSS pixel UI: HUD, toolbar, shop/build/lab/fishdex/review panels,
// modals (title, day report, discovery, game over), fox dialogue, toasts,
// world-anchored bubbles (bear wants, reviews), flying coins.
import * as THREE from 'three';
import { spriteImg, spriteURL, foxPortraitURL } from './sprites.js';
import { Icons3D } from './icons3d.js';
import { SPECIES, SPECIES_BY_ID, HYBRIDS } from '../data/species.js';
import { STRUCTURES, BUILD_CATEGORIES } from '../data/structures.js';
import { RESEARCH, RESEARCH_BY_ID, BRANCHES } from '../data/research.js';
import { BEAR_TYPES, WANT_INFO } from '../data/bears.js';
import { ACHIEVEMENTS } from '../data/achievements.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.floor(n).toLocaleString('en-US'));
const ico = (name, scale = 2, cls = '') => spriteImg(name, scale, cls);
const _v = new THREE.Vector3();

// 12x12 pixel frame templates -> 9-slice border images
const FRAME = [
  '.OOOOOOOOOO.',
  'OBBBBBBBBBBO',
  'OBHHHHHHHHBO',
  'OBHFFFFFFLBO',
  'OBHFFFFFFLBO',
  'OBHFFFFFFLBO',
  'OBHFFFFFFLBO',
  'OBHFFFFFFLBO',
  'OBHFFFFFFLBO',
  'OBLLLLLLLLBO',
  'OBBBBBBBBBBO',
  '.OOOOOOOOOO.',
];
function frameURL(p) {
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const x = c.getContext('2d', { willReadFrequently: true });
  for (let r = 0; r < 12; r++)
    for (let k = 0; k < 12; k++) {
      const ch = FRAME[r][k];
      if (ch === '.') continue;
      x.fillStyle = p[ch];
      x.fillRect(k, r, 1, 1);
    }
  return `url(${c.toDataURL()})`;
}

function makeFrames() {
  const O = '#1a1420';
  const F = {
    panel: { O, B: '#e8f0f4', H: '#2a4254', L: '#0a1218', F: 'rgba(14,24,34,0.94)' },
    card: { O, B: '#7f99ad', H: '#2e4658', L: '#101a22', F: '#1a2c3c' },
    'card-hot': { O, B: '#f4f8fa', H: '#3a566a', L: '#101a22', F: '#223a4e' },
    'card-on': { O, B: '#ffc83a', H: '#4a5a3a', L: '#141a10', F: '#24362a' },
    btn: { O, B: '#dfe8ee', H: '#4a6a82', L: '#16242e', F: '#2c465a' },
    'btn-hot': { O, B: '#ffffff', H: '#5a7e98', L: '#1a2a36', F: '#36566e' },
    'btn-gold': { O, B: '#fff4b0', H: '#ffe27a', L: '#b88018', F: '#ffc83a' },
    'btn-red': { O, B: '#ffd6ce', H: '#ff907e', L: '#8a2218', F: '#d24a3a' },
    'btn-teal': { O, B: '#e6fcff', H: '#9aeefa', L: '#2a8098', F: '#4fc0d8' },
  };
  const root = document.documentElement.style;
  for (const [k, p] of Object.entries(F)) root.setProperty(`--fr-${k}`, frameURL(p));
}

function starsHTML(v, scale = 1) {
  let s = '<span class="stars">';
  for (let i = 1; i <= 5; i++) {
    const n = v >= i - 0.25 ? 'star' : v >= i - 0.75 ? 'star_half' : 'star_empty';
    s += ico(n, scale);
  }
  return s + '</span>';
}

function clockText(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  const ap = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(Math.floor(mm / 5) * 5).padStart(2, '0')} ${ap}`;
}

const TUTORIAL = [
  { expr: 'smug', text: "Welcome to <b>Reynard's All-U-Can-Eat Pond</b>! The suits up at Bear St. Holdings get off work at <b>5 PM</b>... and they are HUNGRY. Heh heh heh." },
  { expr: 'wink', text: 'First, <b>tap the pond</b> to toss some fish food. Well-fed fish fall in love and make MORE fish. More fish, more coins. For me.', wait: true, pulse: 'feed' },
  { expr: 'greedy', text: 'Lovely. Buy more fish in the <b>Fish</b> shop, plant <b>seaweed</b> from <b>Build</b>, and keep the pond full. Bears pay per fish!', pulse: 'shop' },
  { expr: 'worried', text: "Check <b>Tonight's reservations</b>. Some bears want honey, syrup, berries or seaweed too. Leave a bear hungry and it will <b>rampage</b> and post a nasty review. Too many bad reviews and I'm <b>closed</b>!" },
  { expr: 'smug', text: 'Spend coins in my <b>Lab</b> (tap my hut) to unlock new fish, beavers, dams and gadgets. Now go make me rich!', pulse: 'lab' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.overlay = document.getElementById('overlay');
    this.icons = new Icons3D(game.renderer);
    this.panel = null;
    this.panelTab = null;
    this.dispCoins = game.state.coins;
    this.bubbles = new Map();
    this.reviewBubbles = [];
    this.floaters = [];
    this.hud = {};
    this.foxQueue = [];
    this.foxCurrent = null;
    this.lastHUD = {};
    this.tipT = 0;
    makeFrames();
    this.buildDOM();
    game.on('coins', () => { this.popCoins(); this.refreshPanelSoon(); });
    game.on('research', () => this.refreshPanelSoon());
    game.on('tool', (t) => this.onTool(t));
    game.on('dig', () => { if (game.tool.kind === 'dig') this.onTool(game.tool); });
  }

  // ------------------------------------------------------------ DOM
  buildDOM() {
    const r = this.root;
    r.innerHTML = `
      <div class="hud">
        <div class="hud-left">
          <div class="pill coins" id="h-coins" title="Coins">${ico('coin', 2)}<b id="h-coinv">0</b></div>
          <div class="pill" id="h-fish" title="Fish in pond / capacity">${ico('fish', 2)}<b id="h-fishv">0</b><span class="sub" id="h-fishc"></span></div>
          <div class="pill ia" id="h-rating" title="Your rating (tap for reviews)"><span id="h-stars"></span><b id="h-ratingv">3.0</b></div>
        </div>
        <div class="clock ia" id="clock">
          <img class="px cfox" id="c-fox" alt="" width="44" height="44">
          <div class="ct"><b id="c-day">MONDAY</b> · DAY <b id="c-dayn">1</b></div>
          <div class="tm" id="c-time">9:00 AM</div>
          <div class="bar"><i id="c-fill"></i></div>
          <div class="cs"><span id="c-sub">Bears off work in 1:30</span><button class="btn small hidden" id="c-bell" title="Ring the dinner bell: open now (B)">${ico('bell', 1)} Open</button></div>
        </div>
        <div class="hud-right">
          <div class="seg" id="speed">
            <button class="btn" data-s="0" title="Pause (Space)">${ico('pause', 1)}</button>
            <button class="btn" data-s="1">1x</button>
            <button class="btn" data-s="2">2x</button>
            <button class="btn" data-s="3">3x</button>
          </div>
          <button class="icon-btn" id="b-cam" title="Follow the bears (F)">${ico('camera', 2)}</button>
          <button class="icon-btn" id="b-snd" title="Sound">${ico('speaker_on', 2)}</button>
          <button class="icon-btn" id="b-menu" title="Menu">${ico('menu', 2)}</button>
        </div>
      </div>
      <div class="guests" id="guests">
        <div class="gt"><span>TONIGHT'S RESERVATIONS <b id="g-count"></b></span><button class="mini" id="g-tog">-</button></div>
        <div class="gl" id="g-list"></div>
        <div class="note" id="g-note"></div>
      </div>
      <div class="toolhint hidden" id="toolhint"></div>
      <div class="toolbar" id="toolbar">
        <button class="tool active" data-tool="feed" title="Feed fish (1)">${ico('food', 2)}<span>Feed</span><i class="bag"><b id="bag"></b></i></button>
        <button class="tool" data-panel="shop" title="Fish shop (2)">${ico('fish', 2)}<span>Fish</span></button>
        <button class="tool" data-panel="build" title="Build (3)">${ico('hammer', 2)}<span>Build</span></button>
        <button class="tool" data-tool="dig" title="Dig: expand the pond (4)">${ico('shovel', 2)}<span>Dig</span></button>
        <button class="tool" data-tool="remove" title="Remove structures / clear trees (5)">${ico('trash', 2)}<span>Remove</span></button>
        <button class="tool" data-panel="lab" title="Research lab (6)">${ico('flask', 2)}<span>Lab</span></button>
        <button class="tool" data-panel="dex" title="Fishdex (7)">${ico('book', 2)}<span>Fishdex</span></button>
        <button class="tool" data-panel="reviews" title="Reviews (8)">${ico('newspaper', 2)}<span>Reviews</span></button>
      </div>
      <div class="panel hidden" id="panel">
        <div class="panel-head"><h2 id="p-title"></h2><span class="coins-mini">${ico('coin', 1)}<span id="p-coins"></span></span><button class="icon-btn" id="p-close" title="Close (Esc)">${ico('cross', 2)}</button></div>
        <div class="tabs" id="p-tabs"></div>
        <div class="panel-body" id="p-body"></div>
      </div>
      <div class="fox hidden" id="fox"><img class="px" id="fox-face" alt=""><div class="say"><b>Reynard</b><p id="fox-say"></p><button class="btn small gold" id="fox-ok">OK</button></div></div>
      <div class="toasts" id="toasts"></div>
      <div class="tip hidden" id="tip"></div>
      <div class="modal-wrap hidden" id="modal"><div class="modal" id="modal-card"></div></div>
      <div id="title-root"></div>
    `;
    const h = this.hud;
    for (const id of ['c-fox', 'h-coinv', 'h-fishv', 'h-fishc', 'h-stars', 'h-ratingv', 'c-day', 'c-dayn', 'c-time', 'c-fill', 'c-sub', 'c-bell', 'clock', 'bag', 'toolhint', 'guests', 'g-list', 'g-note', 'g-count', 'panel', 'p-title', 'p-tabs', 'p-body', 'p-coins', 'toasts', 'tip', 'modal', 'modal-card', 'fox', 'fox-face', 'fox-say', 'fox-ok', 'h-coins'])
      h[id] = document.getElementById(id);
    // events
    $('#toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('.tool');
      if (!b) return;
      this.click();
      if (b.dataset.tool) {
        const cur = this.game.tool.kind;
        this.closePanel();
        this.game.setTool(cur === b.dataset.tool && cur !== 'feed' ? { kind: 'feed' } : { kind: b.dataset.tool });
      } else if (b.dataset.panel) {
        if (this.panel === b.dataset.panel) this.closePanel();
        else this.openPanel(b.dataset.panel);
      }
    });
    $('#speed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (!b) return;
      this.click();
      const s = +b.dataset.s;
      if (s === 0) this.togglePause();
      else { this.game.state.paused = false; this.game.setSpeed(s); }
      this.renderSpeed();
    });
    $('#b-snd').addEventListener('click', () => {
      const m = this.game.audio.toggleMute();
      $('#b-snd').innerHTML = ico(m ? 'speaker_off' : 'speaker_on', 2);
      this.click();
    });
    $('#b-menu').addEventListener('click', () => { this.click(); this.showMenu(); });
    $('#b-cam').addEventListener('click', () => { this.click(); this.followBear(); });
    $('#h-rating').addEventListener('click', () => { this.click(); this.openPanel('reviews'); });
    h['c-bell'].addEventListener('click', () => this.game.ringBell());
    $('#g-tog').addEventListener('click', () => {
      const g = h.guests;
      g.classList.toggle('collapsed');
      $('#g-tog').textContent = g.classList.contains('collapsed') ? '+' : '-';
    });
    $('#p-close').addEventListener('click', () => { this.closePanel(); this.closeSound(); });
    h['fox-ok'].addEventListener('click', () => { this.click(); this.foxNext(); });
    h.modal.addEventListener('click', (e) => { if (e.target === h.modal && this.modalDismissable) this.closeModal(); });
    if (window.innerWidth < 760) h.guests.classList.add('collapsed');
    $('#g-tog').textContent = h.guests.classList.contains('collapsed') ? '+' : '-';
    $('#b-snd').innerHTML = ico(this.game.audio.isMuted() ? 'speaker_off' : 'speaker_on', 2);
    this.renderSpeed();
  }

  click() { this.game.audio.play('click', { volume: 0.35 }); }
  closeSound() { this.game.audio.play('close', { volume: 0.35 }); }

  renderSpeed() {
    const st = this.game.state;
    for (const b of document.querySelectorAll('#speed [data-s]')) {
      const s = +b.dataset.s;
      b.classList.toggle('on', s === 0 ? st.paused : !st.paused && st.speed === s);
    }
  }

  togglePause() {
    const st = this.game.state;
    st.paused = !st.paused;
    this.renderSpeed();
    this.toast(st.paused ? 'Paused' : 'Resumed');
  }

  hotkey(n) {
    const btns = document.querySelectorAll('#toolbar .tool');
    btns[n - 1]?.click();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const game = this.game;
    const st = game.state;
    const h = this.hud;
    // coins count-up
    const target = st.coins;
    if (Math.abs(this.dispCoins - target) < 0.5) this.dispCoins = target;
    else this.dispCoins += (target - this.dispCoins) * Math.min(1, dt * 8);
    this.setText('h-coinv', fmt(Math.round(this.dispCoins)));
    this.setText('p-coins', fmt(st.coins));
    const pop = game.fish.population(), cap = game.fish.capacity();
    this.setText('h-fishv', `${game.fish.count}`);
    this.setText('h-fishc', `/ ${cap}${pop >= cap ? ' FULL' : ''}`);
    const r = Math.round(st.rating * 10) / 10;
    if (this.lastHUD.rating !== r) {
      this.lastHUD.rating = r;
      h['h-stars'].innerHTML = starsHTML(st.rating, 1);
      h['h-ratingv'].textContent = r.toFixed(1);
      h['h-ratingv'].style.color = r < 1.8 ? 'var(--bad)' : r >= 4 ? 'var(--good)' : '';
    }
    // clock
    this.setText('c-day', game.weekday().toUpperCase());
    this.setText('c-dayn', String(st.day));
    this.setText('c-time', clockText(st.hour));
    let fill = 0, sub = '';
    const clock = h.clock;
    if (st.phase === 'day') {
      fill = (st.hour - 9) / 8;
      const s = Math.max(0, Math.ceil(game.secondsToRush() / Math.max(1, st.speed)));
      sub = game.isDayOff() ? `Sunday: bears' day off (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})` : `Bears off work in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      h['c-bell'].classList.toggle('hidden', game.isDayOff() || !!game.transition);
    } else if (st.phase === 'rush') {
      const left = game.bears.list.filter((b) => !b.lunch && b.state !== 'commuteUp' && b.goal?.kind !== 'leave').length;
      fill = 1;
      sub = `RUSH HOUR! ${left} bear${left === 1 ? '' : 's'} left`;
      h['c-bell'].classList.add('hidden');
    } else {
      fill = 1;
      sub = st.phase === 'night' ? 'Closed for the night' : st.phase === 'morning' ? 'Good morning...' : 'Closing up...';
      h['c-bell'].classList.add('hidden');
    }
    clock.classList.toggle('rush', st.phase === 'rush');
    const fw = `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`;
    if (h['c-fill'].style.width !== fw) h['c-fill'].style.width = fw;
    this.setText('c-sub', sub);
    const bw = `${Math.round((game.foodBag.count / game.foodBag.max) * 100)}%`;
    if (h.bag.style.width !== bw) h.bag.style.width = bw;
    this.updateFoxFace(dt);
    // bubbles & floaters
    this.updateBubbles(dt);
    this.updateFloaters(dt);
    // ghost previews
    this.updateGhost();
    this.tipT -= dt;
    if (this.foxAutoT > 0) { this.foxAutoT -= dt; if (this.foxAutoT <= 0 && this.foxCurrent?.auto) this.foxNext(); }
  }

  // little fox face on the clock reacting to what happens
  foxMood(expr, t = 1.6) {
    this.foxMoodState = { expr, t };
  }

  updateFoxFace(dt) {
    const st = this.game.state;
    let expr = st.phase === 'night' || st.phase === 'morning' ? 'sleepy' : st.phase === 'rush' ? 'greedy' : st.rating < 1.8 ? 'worried' : 'smug';
    const m = this.foxMoodState;
    if (m && m.t > 0) { m.t -= dt; expr = m.expr; }
    if (this.lastFoxExpr !== expr) {
      this.lastFoxExpr = expr;
      this.hud['c-fox'].src = foxPortraitURL(expr, 2);
    }
  }

  setText(id, v) {
    if (this.lastHUD[id] === v) return;
    this.lastHUD[id] = v;
    this.hud[id].textContent = v;
  }

  popCoins() {
    const el = this.hud['h-coins'];
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  // ------------------------------------------------------------ world <-> screen
  screenOf(x, y, z) {
    _v.set(x, y, z);
    return this.game.rig.worldToScreen(_v, this.game.renderer);
  }

  pickBear(sx, sy) {
    let best = null, bd = 34 * 34;
    for (const b of this.game.bears.list) {
      if (!b.visible) continue;
      const p = this.screenOf(b.x, b.y + 1.1 * b.def.scale, b.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  pickFish(sx, sy) {
    let best = null, bd = 22 * 22;
    for (const f of this.game.fish.list) {
      const p = this.screenOf(f.x, f.y, f.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  hover(sx, sy) {
    const tip = this.hud.tip;
    if (this.game.tool.kind !== 'feed' || this.panel) { tip.classList.add('hidden'); return; }
    const b = this.pickBear(sx, sy);
    let html = '';
    if (b) {
      const d = b.def;
      const wants = b.wants.map((w) => ico(WANT_INFO[w.kind].icon, 1, w.done ? 'done' : '')).join('');
      html = `<b>${esc(b.name)}</b> · ${esc(d.name)}<br><span style="color:var(--muted)">${esc(b.dept)}</span><br>Ate ${b.eaten.toFixed(1)} / ${b.appetite} ${wants}${b.prefer ? `<br>Wants: ${esc(SPECIES_BY_ID[b.prefer].name)}` : ''}${b.angry ? '<br><b style="color:var(--bad)">RAMPAGING!</b>' : ''}`;
    } else {
      const f = this.pickFish(sx, sy);
      if (f) {
        html = `<b>${f.golden ? 'Golden ' : ''}${esc(f.sp.name)}</b>${f.adult ? '' : ' (fry)'}<br>Hunger: ${hungerWord(f.hunger)}${f.state === 'court' ? '<br>In love ' + ico('heart', 1) : ''}`;
      }
    }
    if (!html) { tip.classList.add('hidden'); return; }
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = `${Math.min(window.innerWidth - w - 6, sx + 16)}px`;
    tip.style.top = `${Math.max(6, sy - hh - 10)}px`;
  }

  // ------------------------------------------------------------ bubbles
  attachBearBubble(b) {
    const el = document.createElement('div');
    el.className = 'bb';
    el.innerHTML = `<div class="want"></div><div class="hun"><i></i></div><div class="pat"><i></i></div>`;
    el.style.display = 'none';
    this.overlay.appendChild(el);
    b.bubble = el;
    b.bubbleKey = '';
    this.bubbles.set(b.id, b);
  }

  detachBearBubble(b) {
    if (b.bubble) b.bubble.remove();
    b.bubble = null;
    this.bubbles.delete(b.id);
  }

  updateBubbles(dt) {
    for (const b of this.bubbles.values()) {
      const el = b.bubble;
      if (!el) continue;
      const show = b.visible && b.state !== 'commute' && b.state !== 'commuteUp' && b.state !== 'queued' && b.goal?.kind !== 'leave' && b.state !== 'pay';
      if (!show) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (el.style.display === 'none') el.style.display = '';
      const p = this.screenOf(b.x, b.y + 2.35 * b.def.scale + 0.2, b.z);
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      const key = `${b.wants.map((w) => (w.done ? 1 : 0)).join('')}|${b.prefer || ''}|${b.angry ? 1 : 0}`;
      if (key !== b.bubbleKey) {
        b.bubbleKey = key;
        let icons = b.prefer ? `<img class="px" src="${this.icons.fish(SPECIES_BY_ID[b.prefer])}" width="20" height="20" alt="">` : ico('fish', 1);
        for (const w of b.wants) icons += ico(WANT_INFO[w.kind].icon, 1, w.done ? 'done' : '');
        if (b.angry) icons = ico('bear_angry', 1) + ico('bolt', 1);
        el.firstChild.innerHTML = icons;
        el.classList.toggle('angry', b.angry);
      }
      const pw = `${Math.round((b.patience / b.maxPatience) * 100)}%`;
      const pi = el.lastChild.firstChild;
      pi.style.width = pw;
      const k = b.patience / b.maxPatience;
      pi.style.background = k > 0.5 ? 'var(--good)' : k > 0.25 ? '#ffc83a' : 'var(--bad)';
      el.children[1].firstChild.style.width = `${Math.round(Math.min(1, b.eaten / b.appetite) * 100)}%`;
      el.lastChild.style.display = b.angry ? 'none' : '';
    }
    // review bubbles follow their bear for a while
    for (let i = 0; i < this.reviewBubbles.length; i++) {
      const rb = this.reviewBubbles[i];
      rb.t -= dt;
      const b = rb.bear;
      if (b) { rb.x = b.x; rb.y = b.y + 2.6 * b.def.scale + 0.3; rb.z = b.z; }
      const p = this.screenOf(rb.x, rb.y, rb.z);
      // stack bubbles that would overlap an earlier one
      let dy = 0;
      for (let j = 0; j < i; j++) {
        const o = this.reviewBubbles[j];
        if (o.sx === undefined) continue;
        if (Math.abs(o.sx - p.x) < 170 && Math.abs(o.sy - (p.y - dy)) < 38) dy += 40;
      }
      rb.dy = rb.dy === undefined ? dy : rb.dy + (dy - rb.dy) * Math.min(1, dt * 6);
      rb.sx = p.x; rb.sy = p.y - rb.dy;
      rb.el.style.left = `${Math.round(p.x)}px`;
      rb.el.style.top = `${Math.round(p.y - rb.dy)}px`;
      if (rb.t < 0.4 && !rb.gone) { rb.gone = true; rb.el.classList.add('gone'); }
    }
    for (let i = this.reviewBubbles.length - 1; i >= 0; i--) {
      const rb = this.reviewBubbles[i];
      if (rb.t <= 0) { rb.el.remove(); this.reviewBubbles.splice(i, 1); }
    }
  }

  showReviewBubble(b, r) {
    if (r.stars >= 5 && !(this.foxMoodState?.t > 0.5)) this.foxMood('laugh', 1.4);
    if (r.stars <= 1) this.foxMood('angry', 1.6);
    const el = document.createElement('div');
    el.className = 'rb' + (r.stars <= 1 ? ' bad' : '');
    el.innerHTML = `<div class="st">${starsHTML(r.stars, 1)}</div>${esc(r.text)}`;
    this.overlay.appendChild(el);
    this.reviewBubbles.push({ el, bear: b, t: 4.5, x: b.x, y: b.y + 2.6, z: b.z });
    if (this.reviewBubbles.length > 8) { const o = this.reviewBubbles.shift(); o.el.remove(); }
  }

  floatText(b, text, color = '#fff') { this.floatTextAt(b.x, b.y + 2.6 * b.def.scale, b.z, text, color); }

  floatTextAt(x, y, z, text, color = '#fff') {
    const el = document.createElement('div');
    el.className = 'ft';
    el.style.color = color;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floaters.push({ el, x, y, z, t: 0, dur: 1.4 });
  }

  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      const p = this.screenOf(f.x, f.y, f.z);
      const k = f.t / f.dur;
      f.el.style.left = `${Math.round(p.x)}px`;
      f.el.style.top = `${Math.round(p.y - k * 40)}px`;
      f.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      if (k >= 1) { f.el.remove(); this.floaters.splice(i, 1); }
    }
  }

  flyCoins(b, amount) {
    this.foxMood('greedy', 1.8);
    const start = this.screenOf(b.x, b.y + 1.8 * b.def.scale, b.z);
    const target = this.hud['h-coins'].getBoundingClientRect();
    const tx = target.left + 18, ty = target.top + target.height / 2;
    const n = Math.min(12, 3 + Math.floor(amount / 6));
    const url = spriteURL('coin', 2);
    for (let i = 0; i < n; i++) {
      const el = document.createElement('img');
      el.src = url;
      el.className = 'fcoin px';
      this.overlay.appendChild(el);
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 40;
      const mx = start.x + Math.cos(a) * r, my = start.y + Math.sin(a) * r - 30;
      const anim = el.animate([
        { transform: `translate(${start.x}px, ${start.y}px) scale(0.6)`, opacity: 1 },
        { transform: `translate(${mx}px, ${my}px) scale(1.2)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.8)`, opacity: 0.9 },
      ], { duration: 650 + i * 45 + Math.random() * 120, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      anim.onfinish = () => { el.remove(); if (i % 3 === 0) this.game.audio.play('coin', { volume: 0.18, pitch: 1 + i * 0.05 }); this.popCoins(); };
    }
    this.floatTextAt(b.x, b.y + 2.4 * b.def.scale, b.z, `+${fmt(amount)}`, '#ffd23a');
  }

  // ------------------------------------------------------------ toasts, banners
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = text;
    const box = this.hud.toasts;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2400);
  }

  banner(top, main) {
    const el = document.createElement('div');
    el.className = 'banner';
    el.innerHTML = `<div class="b1">${top}</div><div class="b2">${main}</div>`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  // ------------------------------------------------------------ fox dialogue
  foxSay(text, expr = 'smug', opts = {}) {
    this.foxQueue.push({ text, expr, ...opts });
    if (!this.foxCurrent) this.foxNext();
  }

  foxNext() {
    const cur = this.foxCurrent;
    if (cur?.onOk) cur.onOk();
    this.foxCurrent = this.foxQueue.shift() || null;
    const el = this.hud.fox;
    if (!this.foxCurrent) { el.classList.add('hidden'); this.pulse(null); return; }
    const m = this.foxCurrent;
    this.hud['fox-face'].src = foxPortraitURL(m.expr || 'smug', 3);
    this.hud['fox-say'].innerHTML = m.text;
    this.hud['fox-ok'].textContent = m.button || (m.wait ? 'Got it' : 'OK');
    this.hud['fox-ok'].classList.toggle('hidden', !!m.hideOk);
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.pulse(m.pulse || null);
    this.foxAutoT = m.auto ? m.auto : 0;
  }

  pulse(which) {
    for (const b of document.querySelectorAll('#toolbar .tool')) b.classList.toggle('pulse', !!which && (b.dataset.tool === which || b.dataset.panel === which));
  }

  tutorialStep(n) {
    const st = this.game.state;
    const step = TUTORIAL[n];
    if (!step) return;
    const msg = {
      text: step.text, expr: step.expr, pulse: step.pulse, tut: n, wait: !!step.wait,
      onOk: () => { if (!step.wait && st.tutorial === n) this.game.advanceTutorial(); },
    };
    const cur = this.foxCurrent;
    if (cur && cur.tut === n - 1 && cur.wait) {
      // the awaited action just happened: swap straight to the next step
      this.foxCurrent = null;
      this.foxQueue.unshift(msg);
      this.foxNext();
      return;
    }
    this.foxQueue.push(msg);
    if (!this.foxCurrent) this.foxNext();
  }

  // veterans (who already closed or retired a pond) skip the tutorial
  startTutorialIfNew() {
    const lg = this.game.legacy;
    if (lg.best || lg.tails || lg.retired) { this.game.state.tutorial = TUTORIAL.length; return; }
    this.tutorialStep(0);
  }

  tipOnce(key, text, expr = 'smug') {
    const tips = this.game.state.tips;
    if (tips[key]) return;
    tips[key] = 1;
    this.foxSay(text, expr);
  }

  // ------------------------------------------------------------ guests / phases
  onDayStart(wave) {
    this.renderGuests(wave);
    const st = this.game.state;
    if (st.day > 1 && this.game.fish.count < 4 && !this.game.isDayOff())
      this.foxSay('The pond is nearly <b>empty</b>! Buy fish in the <b>Fish</b> shop and feed them so they breed before 5 PM, or the bears will riot.', 'worried', { pulse: 'shop' });
    if (st.day > 1) this.banner(`${this.game.weekday().toUpperCase()} · DAY ${st.day}`, this.game.isDayOff() ? 'Day off!' : 'Rise & shine');
    const types = new Set(wave.bears.map((b) => b.type));
    if (types.has('janitor')) this.tipOnce('janitor', 'A <b>Janitor</b> is coming tonight. Janitors want <b>seaweed salad</b> with their fish. Make sure the pond has plenty of seaweed!', 'wink');
    if (types.has('accountant')) this.tipOnce('accountant', 'An <b>Accountant</b> is booked tonight. They want <b>honey</b>! Research <b>Weeping Willow</b> + <b>Beekeeping</b> in the Lab and put a hive near a willow.', 'worried');
    if (types.has('ceo')) this.tipOnce('ceo', "It's Friday... <b>THE CEO</b> is coming! Huge appetite, huge wallet, and very picky. Have lots of their favourite fish ready. Don't disappoint him.", 'shocked');
    if (types.has('critic')) this.tipOnce('critic', 'A <b>Food Critic</b> from the Bear Street Journal is coming! Their review counts <b>4x</b>. Everything must be perfect.', 'worried');
    if (types.has('lumberjack')) this.tipOnce('lumber', '<b>Lumberjacks</b> love <b>maple syrup</b>. Plant a Sugar Maple (Lab: Sugar Maples).', 'wink');
    if (types.has('tourist') || types.has('cub')) this.tipOnce('berries', 'Tourists and cubs crave <b>blueberries</b>. Plant blueberry bushes (Lab: Wild Blueberries).', 'smug');
    if (this.game.isDayOff()) this.tipOnce('sunday', "Sunday! The bears are at home watching hockey. No customers today: time to breed fish and build. Heh.", 'sleepy');
    if (st.day === 2) this.tipOnce('day2', 'Pro tip: the <b>Lab</b> has fancier fish that bears pay much more for. And <b>Dig</b> makes the pond bigger so more fish fit.', 'greedy');
    if (st.day === 3 && !st.research.includes('r_beavers')) this.tipOnce('beavers', 'Bears keep eating my breeding fish... <b>Hire Beavers</b> (Lab) to build <b>dams</b> and wall off a safe nursery!', 'wink');
  }

  renderGuests(wave) {
    const h = this.hud;
    const lunch = this.game.lunch || [];
    if (!wave || wave.dayOff) {
      h['g-list'].innerHTML = `<div class="gr">${ico('bear_happy', 1)} Nobody! Bears' day off.</div>`;
      h['g-count'].textContent = '';
      h['g-note'].textContent = '';
      return;
    }
    const groups = new Map();
    for (const b of wave.bears) {
      const key = `${b.type}|${b.wants.join(',')}|${b.prefer || ''}`;
      if (!groups.has(key)) groups.set(key, { ...b, n: 0 });
      groups.get(key).n++;
    }
    let html = '';
    let meals = 0;
    for (const b of wave.bears) { const d = BEAR_TYPES[b.type]; meals += (d.appetite[0] + d.appetite[1]) / 2; }
    for (const g of groups.values()) {
      const d = BEAR_TYPES[g.type];
      const wants = g.wants.map((w) => ico(WANT_INFO[w].icon, 1)).join('');
      const pref = g.prefer ? `<img class="px" src="${this.icons.fish(SPECIES_BY_ID[g.prefer])}" width="20" height="20" title="Wants ${esc(SPECIES_BY_ID[g.prefer].name)}" alt="">` : '';
      html += `<div class="gr"><img class="px" src="${this.icons.bear(g.type)}" width="24" height="24" alt=""><span class="n">x${g.n}</span><span>${esc(d.name)}</span><span class="w">${pref}${wants}</span></div>`;
    }
    if (lunch.length) html = `<div class="gr" style="color:var(--muted)">${ico('clock', 1)}<span>12:30 lunch break: ${lunch.length} bear${lunch.length > 1 ? 's' : ''}</span></div>` + html;
    h['g-list'].innerHTML = html;
    h['g-count'].textContent = `(${wave.bears.length})`;
    const notes = [];
    if (wave.bears.some((b) => b.type === 'ceo')) notes.push('The CEO is coming!');
    if (wave.bears.some((b) => b.type === 'critic')) notes.push('A food critic is coming!');
    notes.push(`Need ~${Math.ceil(meals)} fish-meals`);
    h['g-note'].textContent = notes.join(' · ');
  }

  onRushStart(wave) {
    this.banner('5:00 PM · THE WHISTLE BLOWS', 'Bears are off work!');
    this.game.rig.shake = 0.3;
    if (this.game.state.day === 1) {
      this.foxSay('Here they come, running down the mountain! Watch them cannonball in. Tap a bear to see what it wants.', 'greedy', { auto: 7 });
      // a little cutscene: follow the first bear down the trail, then hand the camera back
      const rig = this.game.rig;
      setTimeout(() => {
        const first = this.game.bears.list.find((b) => b.visible);
        if (first && !rig.follow) { rig.follow = first; rig.wuppGoal = Math.max(rig.wuppGoal, 0.06); }
        setTimeout(() => { if (rig.follow === first) rig.follow = null; }, 9000);
      }, 900);
    }
  }

  onRampage(b) {
    this.foxMood('shocked', 2.5);
    this.toast(`${ico('bolt', 1)} ${esc(b.name)} (${esc(b.def.name)}) is RAMPAGING!`, 'bad');
  }

  followBear() {
    const rig = this.game.rig;
    const bears = this.game.bears.list.filter((b) => b.visible);
    if (!bears.length) {
      if (rig.follow) { rig.follow = null; this.toast('Camera free'); return; }
      // nobody around yet: look at the mountain office
      rig.lookAt(30, 14);
      rig.wuppGoal = Math.max(rig.wuppGoal, 0.08);
      this.toast(this.game.state.phase === 'rush' ? 'Here they come!' : 'Bear St. Holdings, up on the mountain');
      return;
    }
    this.followIdx = ((this.followIdx || 0) + 1) % bears.length;
    const b = bears[this.followIdx];
    rig.follow = b;
    this.toast(`Following ${esc(b.name)} (${esc(b.def.name)})`);
  }

  // ------------------------------------------------------------ tools
  onTool(t) {
    for (const b of document.querySelectorAll('#toolbar .tool')) {
      const active = (b.dataset.tool && b.dataset.tool === t.kind) || (t.kind === 'build' && b.dataset.panel === 'build');
      b.classList.toggle('active', !!active);
    }
    const hint = this.hud.toolhint;
    let html = '';
    if (t.kind === 'build') {
      const d = STRUCTURES[t.type];
      html = `${ico(d.icon, 1)} <b>${esc(d.name)}</b> <span class="k">${ico('coin', 1)}${d.cost}</span> ${d.drag ? '· drag to place a line' : '· tap to place'} <span class="k">ESC</span> to stop`;
    } else if (t.kind === 'dig') {
      html = `${ico('shovel', 1)} <b>Dig</b> next to the pond to expand it <span class="k">${ico('coin', 1)}${this.game.digCost()}</span> per tile · drag for a line`;
    } else if (t.kind === 'remove') {
      html = `${ico('trash', 1)} <b>Remove</b>: tap a structure (50% refund) or clear a tree/rock (${ico('coin', 1)}10)`;
    }
    hint.innerHTML = html + (html ? ` <button class="btn small" id="th-x">Done</button>` : '');
    hint.classList.toggle('hidden', !html);
    const x = $('#th-x', hint);
    if (x) x.onclick = () => { this.click(); this.game.setTool({ kind: 'feed' }); };
    if (t.kind !== 'feed') this.hud.tip.classList.add('hidden');
  }

  updateGhost() {
    const game = this.game;
    const ghost = game.ghost;
    if (!ghost) return;
    const t = game.tool;
    if (t.kind === 'feed') { ghost.clear(); return; }
    let tiles = game.ghostLine;
    if (!tiles) {
      const ht = game.input?.currentHoverTile();
      tiles = ht ? [{ x: ht.x, z: ht.z }] : [];
    }
    if (t.kind === 'build') {
      const entries = tiles.map((p) => ({ ...p, ok: game.structures.canPlace(t.type, p.x, p.z).ok }));
      ghost.showTiles(entries);
      ghost.showModels(t.type, entries);
    } else if (t.kind === 'dig') {
      ghost.showTiles(tiles.map((p) => ({ ...p, ok: !game.canDig(p.x, p.z) })));
      ghost.showModels(null, []);
    } else if (t.kind === 'remove') {
      ghost.showTiles(tiles.map((p) => ({ ...p, ok: !!game.structures.structureAtTile(p.x, p.z) || game.grid.deco[p.z * game.grid.w + p.x] >= 0 })));
      ghost.showModels(null, []);
    }
  }

  // ------------------------------------------------------------ panels
  openPanel(name, tab) {
    this.panel = name;
    if (tab) this.panelTab = tab;
    else if (name === 'build' && !this.panelTab) this.panelTab = 'nature';
    this.hud.panel.classList.remove('hidden');
    this.hud.panel.classList.toggle('wide', name === 'lab');
    this.hud.tip.classList.add('hidden');
    for (const b of document.querySelectorAll('#toolbar .tool')) if (b.dataset.panel) b.classList.toggle('active', b.dataset.panel === name);
    this.renderPanel();
    this.game.audio.play('open', { volume: 0.35 });
  }

  closePanel() {
    if (!this.panel) return;
    this.panel = null;
    this.hud.panel.classList.add('hidden');
    for (const b of document.querySelectorAll('#toolbar .tool')) if (b.dataset.panel) b.classList.toggle('active', b.dataset.panel === 'build' && this.game.tool.kind === 'build');
  }

  closeTop() {
    if (!this.hud.modal.classList.contains('hidden') && this.modalDismissable) { this.closeModal(); return true; }
    if (this.panel) { this.closePanel(); this.closeSound(); return true; }
    if (this.game.tool.kind !== 'feed') { this.game.setTool({ kind: 'feed' }); return true; }
    return false;
  }

  refreshPanelSoon() {
    if (!this.panel || this._refreshQueued) return;
    this._refreshQueued = true;
    setTimeout(() => { this._refreshQueued = false; if (this.panel) this.renderPanel(true); }, 120);
  }

  renderPanel(keepScroll = false) {
    const body = this.hud['p-body'];
    const scroll = keepScroll ? [body.scrollTop, body.scrollLeft] : [0, 0];
    const tabs = this.hud['p-tabs'];
    tabs.innerHTML = '';
    switch (this.panel) {
      case 'shop': this.renderShop(); break;
      case 'build': this.renderBuild(); break;
      case 'lab': this.renderLab(); break;
      case 'dex': this.renderDex(); break;
      case 'reviews': this.renderReviews(); break;
    }
    body.scrollTop = scroll[0];
    body.scrollLeft = scroll[1];
  }

  setTitle(iconName, text) {
    this.hud['p-title'].innerHTML = `${ico(iconName, 2)} ${text}`;
  }

  renderShop() {
    const game = this.game;
    this.setTitle('fish', 'Fish Shop');
    const counts = game.fish.countBySpecies();
    const body = this.hud['p-body'];
    let html = `<div class="lab-info">Tap to buy (shift/long-press: x5). New fish are released near the centre of your view${game.fish.population() >= game.fish.capacity() ? ' · <b style="color:var(--bad)">POND FULL: dig to expand!</b>' : ''}.</div><div class="grid">`;
    for (const sp of SPECIES) {
      const unlocked = game.speciesUnlocked(sp.id);
      const hybrid = sp.unlock === 'hybrid';
      if (hybrid && !unlocked) continue;
      const price = game.speciesPrice(sp.id);
      const afford = game.canAfford(price);
      const req = !unlocked && RESEARCH_BY_ID[sp.unlock];
      html += `<div class="card ${unlocked ? 'clickable' : 'locked'}" data-buy="${sp.id}">
        <div class="top"><img class="px" src="${this.icons.fish(sp)}" width="60" height="60" alt=""><div><div class="nm">${esc(sp.name)}</div><div class="lt">${esc(sp.latin)}</div></div></div>
        <div class="ds">${esc(sp.desc)}</div>
        <div class="row"><span class="stat">Meal <b>${sp.meal}</b></span><span class="stat">Value <b>x${sp.value}</b></span><span class="stat">Breeds <b>${sp.breed >= 1.1 ? 'fast' : sp.breed >= 0.8 ? 'ok' : 'slow'}</b></span></div>
        <div class="row">${unlocked ? `<span class="cost ${afford ? '' : 'no'}">${ico('coin', 1)}${price}</span>` : `<span class="req">${ico('lock', 1)} Lab: ${esc(req ? req.name : '?')}</span>`}<span class="own">IN POND: ${counts[sp.id] || 0}</span></div>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-buy]').forEach((el) => {
      let lp = null;
      el.addEventListener('pointerdown', () => { lp = setTimeout(() => { lp = 'done'; this.game.buyFish(el.dataset.buy, 5); }, 550); });
      el.addEventListener('pointerup', () => { if (lp !== 'done') clearTimeout(lp); });
      el.addEventListener('pointerleave', () => { if (lp !== 'done') clearTimeout(lp); });
      el.addEventListener('click', (e) => {
        if (lp === 'done') { lp = null; return; }
        if (!game.speciesUnlocked(el.dataset.buy)) { this.game.audio.play('error', { volume: 0.4 }); return; }
        this.game.buyFish(el.dataset.buy, e.shiftKey ? 5 : 1);
      });
    });
  }

  renderBuild() {
    const game = this.game;
    this.setTitle('hammer', 'Build');
    const tabs = this.hud['p-tabs'];
    tabs.innerHTML = BUILD_CATEGORIES.map((c) => `<button class="btn small ${this.panelTab === c.id ? 'on' : ''}" data-tab="${c.id}">${c.name}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.click(); this.panelTab = b.dataset.tab; this.renderPanel(); }));
    const body = this.hud['p-body'];
    const hasLodge = game.structures.list.some((s) => s.type === 'lodge' && s.built);
    let html = this.panelTab === 'decor' ? `<div class="lab-info">Decor adds <b>charm</b>: a bonus on every bill. Current charm: <b style="color:var(--gold)">+${game.structures.charm()}%</b> (max +30%).</div>` : '';
    html += '<div class="grid">';
    for (const [type, d] of Object.entries(STRUCTURES)) {
      if (d.category !== this.panelTab) continue;
      const unlocked = game.isStructureUnlocked(type);
      const afford = game.canAfford(d.cost);
      const needsLodge = d.builder === 'beaver' && !hasLodge;
      const req = !unlocked && RESEARCH_BY_ID[d.unlock];
      html += `<div class="card ${unlocked ? 'clickable' : 'locked'} ${game.tool.kind === 'build' && game.tool.type === type ? 'sel' : ''}" data-build="${type}">
        <div class="top"><img class="px" src="${this.icons.structure(type, game.structures)}" width="56" height="56" alt=""><div><div class="nm">${esc(d.name)}</div>${d.builder === 'beaver' ? `<div class="lt">${ico('beaver', 1)} beaver-built</div>` : ''}</div></div>
        <div class="ds">${esc(d.desc)}</div>
        <div class="row">${unlocked ? `<span class="cost ${afford ? '' : 'no'}">${ico('coin', 1)}${d.cost}</span>${needsLodge ? `<span class="req">needs a Beaver Lodge</span>` : ''}` : `<span class="req">${ico('lock', 1)} Lab: ${esc(req ? req.name : '?')}</span>`}<span class="own">BUILT: ${game.structures.countBuilt(type)}</span></div>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-build]').forEach((el) => el.addEventListener('click', () => {
      const type = el.dataset.build;
      if (!game.isStructureUnlocked(type)) { this.game.audio.play('error', { volume: 0.4 }); this.toast(`Research it in the Lab first`, 'bad'); return; }
      this.click();
      game.setTool({ kind: 'build', type });
      this.closePanel();
    }));
  }

  renderLab() {
    const game = this.game;
    const st = game.state;
    this.setTitle('flask', "Reynard's Lab");
    const body = this.hud['p-body'];
    let html = `<div class="lab-info">Spend coins to research. Unlocks new fish, buildings and upgrades. (${st.research.length}/${RESEARCH.length} researched)</div><div class="tree" id="tree"><svg id="tree-svg"></svg>`;
    for (const br of BRANCHES) {
      html += `<div class="branch"><h3 style="color:${br.color}">${br.name.toUpperCase()}</h3><div class="bgrid">`;
      const nodes = RESEARCH.filter((r) => r.branch === br.id);
      for (const r of nodes) {
        const done = st.research.includes(r.id);
        const ready = r.req.every((q) => st.research.includes(q));
        const afford = game.canAfford(r.cost);
        const cls = done ? 'done' : !ready ? 'locked' : afford ? 'avail' : 'avail poor';
        html += `<div class="node ${cls}" data-r="${r.id}" style="grid-row:${r.row + 1};grid-column:${r.col + 1}" title="${esc(r.desc)}">
          <div class="nt">${ico(r.icon, 1)}<span>${esc(r.name)}</span></div>
          <div class="nc">${done ? `${ico('check', 1)} DONE` : `${ico('coin', 1)}${fmt(r.cost)}`}</div>
        </div>`;
      }
      html += '</div></div>';
    }
    html += '</div><div class="lab-info" id="lab-desc" style="margin-top:4px;min-height:34px">Tap a node to see what it does.</div>';
    body.innerHTML = html;
    const desc = $('#lab-desc', body);
    body.querySelectorAll('[data-r]').forEach((el) => {
      el.addEventListener('mouseenter', () => { const r = RESEARCH_BY_ID[el.dataset.r]; desc.innerHTML = `<b>${esc(r.name)}</b>: ${esc(r.desc)}${r.req.length ? ` <span class="req">Needs: ${r.req.map((q) => esc(RESEARCH_BY_ID[q].name)).join(', ')}</span>` : ''}`; });
      el.addEventListener('click', () => {
        const r = RESEARCH_BY_ID[el.dataset.r];
        desc.innerHTML = `<b>${esc(r.name)}</b>: ${esc(r.desc)}${r.req.length ? ` <span class="req">Needs: ${r.req.map((q) => esc(RESEARCH_BY_ID[q].name)).join(', ')}</span>` : ''}`;
        if (st.research.includes(r.id)) return;
        if (!r.req.every((q) => st.research.includes(q))) { this.game.audio.play('error', { volume: 0.35 }); return; }
        if (this.game.research(r.id)) {
          this.toast(`${ico('flask', 1)} Researched <b>${esc(r.name)}</b>!`, 'good');
          if (r.build) this.toast(`New build: <b>${esc(STRUCTURES[r.build].name)}</b>`, 'good');
          if (r.species) this.toast(`New fish in the shop: <b>${esc(SPECIES_BY_ID[r.species].name)}</b>`, 'good');
          if (r.id === 'r_beavers') this.tipOnce('lodge', 'Beavers hired! Build a <b>Beaver Lodge</b> in the water next to the shore (Build > Beaver Works). Then place dams and the beavers will build them.', 'greedy');
          if (r.id === 'r_franchise') this.foxSay("FRANCHISE EMPIRE! I'm a legend! You can <b>retire</b> from the menu for permanent golden tails, or keep raking it in.", 'laugh');
        }
      });
    });
    requestAnimationFrame(() => this.drawTreeLines());
  }

  drawTreeLines() {
    const tree = document.getElementById('tree');
    const svg = document.getElementById('tree-svg');
    if (!tree || !svg) return;
    const tb = tree.getBoundingClientRect();
    svg.setAttribute('width', tree.scrollWidth);
    svg.setAttribute('height', tree.scrollHeight);
    let paths = '';
    const st = this.game.state;
    for (const r of RESEARCH) {
      const el = tree.querySelector(`[data-r="${r.id}"]`);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      for (const q of r.req) {
        const pe = tree.querySelector(`[data-r="${q}"]`);
        if (!pe) continue;
        const a = pe.getBoundingClientRect();
        const x1 = a.left + a.width / 2 - tb.left, y1 = a.bottom - tb.top;
        const x2 = b.left + b.width / 2 - tb.left, y2 = b.top - tb.top;
        const my = (y1 + y2) / 2;
        const done = st.research.includes(q);
        paths += `<path d="M${x1} ${y1} V${my} H${x2} V${y2}" fill="none" stroke="${done ? '#ffc83a' : '#3a5468'}" stroke-width="3" />`;
      }
    }
    svg.innerHTML = paths;
  }

  renderDex() {
    const game = this.game;
    const st = game.state;
    this.setTitle('book', 'Fishdex');
    const counts = game.fish.countBySpecies();
    const genetics = st.research.includes('r_genetics');
    const found = SPECIES.filter((s) => st.discovered.includes(s.id)).length;
    let html = `<div class="lab-info">Discovered ${found} / ${SPECIES.length}. Cross-breed different species to discover hybrids${genetics ? '' : ' (research Genetics Lab for recipes)'}.</div><div class="grid dex">`;
    for (const sp of SPECIES) {
      const known = st.discovered.includes(sp.id);
      let hint = '';
      if (sp.parents) {
        const [a, b] = sp.parents;
        hint = genetics || known ? `${esc(SPECIES_BY_ID[a].name)} x ${esc(SPECIES_BY_ID[b].name)}` : '??? x ???';
      }
      html += `<div class="card ${known ? '' : 'unk'}">
        <div class="top"><img class="px" src="${this.icons.fish(sp)}" width="56" height="56" alt=""><div><div class="nm">${known ? esc(sp.name) : '???'}</div><div class="lt">${known ? esc(sp.latin) : sp.parents ? 'Hybrid' : 'Species'}</div></div></div>
        <div class="ds">${known ? esc(sp.desc) : sp.parents ? 'An undiscovered hybrid.' : 'Research it in the Lab.'}</div>
        <div class="row">${hint ? `<span class="req">${ico('heart', 1)} ${hint}</span>` : ''}<span class="own">IN POND: ${counts[sp.id] || 0}</span></div>
      </div>`;
    }
    html += '</div>';
    this.hud['p-body'].innerHTML = html;
  }

  renderReviews() {
    const st = this.game.state;
    this.setTitle('newspaper', 'Reviews');
    const tabs = this.hud['p-tabs'];
    const tab = this.panelTab === 'trophies' ? 'trophies' : 'reviews';
    tabs.innerHTML = `<button class="btn small ${tab === 'reviews' ? 'on' : ''}" data-tab="reviews">${ico('newspaper', 1)} Reviews</button><button class="btn small ${tab === 'trophies' ? 'on' : ''}" data-tab="trophies">${ico('trophy', 1)} Trophies ${st.achievements.length}/${ACHIEVEMENTS.length}</button>`;
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.click(); this.panelTab = b.dataset.tab; this.renderPanel(); }));
    if (tab === 'trophies') {
      let th = '<div class="grid">';
      for (const a of ACHIEVEMENTS) {
        const got = st.achievements.includes(a.id);
        th += `<div class="card ${got ? 'sel' : 'locked'}"><div class="top">${ico(got ? 'trophy' : 'lock', 2)}<div class="nm">${esc(a.name)}</div></div><div class="ds">${esc(a.desc)}</div><div class="row"><span class="cost">${ico('coin', 1)}${a.reward}</span><span class="own">${got ? 'DONE' : ''}</span></div></div>`;
      }
      this.hud['p-body'].innerHTML = th + '</div>';
      return;
    }
    let html = `<div class="news"><div class="mast">THE BEAR STREET JOURNAL<small>RESTAURANT REVIEWS · ${esc(this.game.weekday().toUpperCase())} EDITION</small></div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-bottom:6px">${starsHTML(st.rating, 2)} <b style="font-size:20px;font-family:var(--font2)">${st.rating.toFixed(2)}</b></div>
      <div class="lab-info" style="text-align:center">${st.rating < 1.8 ? '<b style="color:var(--bad)">DANGER: below 1.0 and the pond gets shut down!</b>' : 'Keep your rating above 1.0 or Reynard\'s is shut down.'}</div>`;
    if (!st.reviews.length) html += '<p class="lab-info">No reviews yet. The first customers arrive at 5 PM.</p>';
    for (const r of st.reviews.slice(0, 30)) {
      html += `<div class="rev"><img class="px" src="${this.icons.bear(r.type)}" width="36" height="36" alt=""><div><div class="rt">${starsHTML(r.stars, 1)} ${esc(r.text)}</div><div class="by">${esc(r.name)}, ${esc(r.dept)} · Day ${r.day}${r.weight > 1 ? ` · <b style="color:#ffcf8a">counts x${r.weight}</b>` : ''}</div></div></div>`;
    }
    html += '</div>';
    this.hud['p-body'].innerHTML = html;
  }

  // ------------------------------------------------------------ modals
  showModal(html, { dismissable = true, onBind } = {}) {
    const m = this.hud.modal;
    this.hud.fox.style.visibility = 'hidden';
    this.hud['modal-card'].innerHTML = html;
    m.classList.remove('hidden');
    this.modalDismissable = dismissable;
    if (onBind) onBind(this.hud['modal-card']);
  }

  closeModal() {
    this.hud.fox.style.visibility = '';
    this.hud.modal.classList.add('hidden');
    this.hud['modal-card'].innerHTML = '';
  }

  // In-page yes/no box (native confirm() is unavailable in some embeds)
  confirmBox(text, onYes, { yes = 'Yes', no = 'Cancel' } = {}) {
    const html = `<h2 class="center">Are you sure?</h2><p class="center">${text}</p>
      <div class="btns"><button class="btn red" id="cf-yes">${esc(yes)}</button><button class="btn gold" id="cf-no">${esc(no)}</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#cf-yes', c).onclick = () => { this.click(); this.closeModal(); onYes(); };
        $('#cf-no', c).onclick = () => { this.click(); this.closeModal(); };
      },
    });
  }

  showReport(r) {
    const game = this.game;
    const good = r.rampages === 0 && r.served > 0 && r.happy >= r.served * 0.6;
    const headline = r.dayOff ? 'SUNDAY: BEARS STAY HOME, FOX COUNTS COINS'
      : r.rampages >= 3 ? `CHAOS AT THE POND: ${r.rampages} BEARS RAMPAGE!`
        : r.rampages > 0 ? 'SOME CUSTOMERS LEAVE ANGRY'
          : good ? `FOX'S POND A HIT: "${pickReview(r)}"` : 'A QUIET EVENING AT THE POND';
    const delta = r.ratingDelta;
    const nextDay = game.state.day + 1;
    const nextOff = (nextDay - 1) % 7 === 6;
    const html = `
      <h1>${esc(r.weekday)} · Day ${r.day}</h1>
      <div class="headline">THE BEAR STREET JOURNAL<br>${esc(headline)}</div>
      <div class="kv">
        <span>${ico('coin', 1)} Coins earned</span><b style="color:var(--gold)">+${fmt(r.coins)}</b>
        <span>${ico('bear', 1)} Bears served</span><b>${r.served}</b>
        <span>${ico('bear_happy', 1)} Happy bears (4-5 stars)</span><b>${r.happy}</b>
        <span>${ico('bolt', 1)} Rampages</span><b style="${r.rampages ? 'color:var(--bad)' : ''}">${r.rampages}</b>
        <span>${ico('fish', 1)} Fish eaten / hatched</span><b>${r.eaten} / ${r.hatched}</b>
        <span>${ico('pond', 1)} Fish in pond</span><b>${r.fish} / ${r.capacity}</b>
        <span>${ico('star', 1)} Rating</span><b style="color:${delta >= 0 ? 'var(--good)' : 'var(--bad)'}">${r.rating.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})</b>
      </div>
      ${r.discoveries.length ? `<p class="center">New breeds: ${r.discoveries.map((id) => `<b>${esc(SPECIES_BY_ID[id].name)}</b>`).join(', ')}</p>` : ''}
      ${r.reviews.length ? `<div>${r.reviews.slice(0, 3).map((v) => `<div class="rev"><div><div class="rt">${starsHTML(v.stars, 1)} ${esc(v.text)}</div><div class="by">${esc(v.name)}, ${esc(v.dept)}</div></div></div>`).join('')}</div>` : ''}
      ${r.rating < 1.8 ? '<p class="center" style="color:var(--bad)"><b>Warning: your rating is dangerously low! Below 1.0 and you\'re closed.</b></p>' : ''}
      <div class="btns"><button class="btn gold big" id="m-next">${nextOff ? 'Sleep in (Sunday)' : 'Next day'} ${ico('play', 1)}</button></div>`;
    this.showModal(html, {
      dismissable: false,
      onBind: (c) => { $('#m-next', c).onclick = () => { this.click(); this.closeModal(); game.nextDay(); }; },
    });
  }

  showDiscovery(sp) {
    this.foxMood('laugh', 3);
    const html = `
      <h1 style="color:var(--gold2)">NEW BREED DISCOVERED!</h1>
      <div class="big-icon"><img class="px shine" src="${this.icons.fish(sp)}" width="160" height="160" alt=""></div>
      <h2 class="center">${esc(sp.name)}</h2>
      <p class="center" style="color:var(--muted)"><i>${esc(sp.latin)}</i></p>
      <p class="center">${esc(sp.desc)}</p>
      <div class="kv"><span>Meal size</span><b>${sp.meal}</b><span>Value</span><b>x${sp.value}</b></div>
      ${sp.unlock === 'hybrid' ? `<p class="center">You can now buy it in the Fish shop for ${ico('coin', 1)}${this.game.speciesPrice(sp.id)}.</p>` : ''}
      <div class="btns"><button class="btn gold big" id="m-ok">Heh, lovely!</button></div>`;
    this.showModal(html, { onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); }; } });
    this.banner('NEW BREED', esc(sp.name));
  }

  showGameOver(o) {
    const game = this.game;
    const html = `
      <h1 style="color:${o.retired ? 'var(--gold2)' : 'var(--bad)'}">${o.retired ? 'RETIRED A LEGEND' : 'CLOSED FOR BUSINESS'}</h1>
      <div class="big-icon"><img class="px" src="${foxPortraitURL(o.retired ? 'laugh' : 'shocked', 4)}" width="128" height="128" alt=""></div>
      <div class="headline">THE BEAR STREET JOURNAL<br>${o.retired ? '"FOX SELLS POND EMPIRE, RETIRES ON A PILE OF COINS"' : '"HEALTH INSPECTORS SHUT DOWN FOX\'S POND AFTER STRING OF 0-STAR REVIEWS"'}</div>
      <div class="kv">
        <span>Days in business</span><b>${o.day}</b>
        <span>Coins earned (total)</span><b style="color:var(--gold)">${fmt(o.earned)}</b>
        <span>Bears served</span><b>${o.stats.bearsServed}</b>
        <span>Fish eaten</span><b>${o.stats.fishEaten}</b>
        <span>Rampages</span><b>${o.stats.rampages}</b>
        <span>Golden fox tails</span><b style="color:var(--gold)">${o.tails}${o.gained ? ` (+${o.gained})` : ''}</b>
      </div>
      <p class="center">Each golden tail permanently adds +10% to every bill in future ponds.</p>
      <div class="btns"><button class="btn gold big" id="m-new">Open a new pond</button></div>`;
    this.showModal(html, {
      dismissable: false,
      onBind: (c) => { $('#m-new', c).onclick = () => { this.click(); this.closeModal(); game.newGame(); this.startTutorialIfNew(); }; },
    });
  }

  showBearInfo(b) {
    const d = b.def;
    const wants = b.wants.length ? b.wants.map((w) => `${ico(WANT_INFO[w.kind].icon, 1)} ${WANT_INFO[w.kind].name} ${w.done ? ico('check', 1) : ''}`).join('<br>') : 'Just fish, thanks.';
    const html = `
      <div style="display:flex;gap:10px;align-items:center"><img class="px" src="${this.icons.bear(b.typeId, true)}" width="96" height="96" alt=""><div>
      <h2 style="margin:0">${esc(b.name)}</h2><div style="color:var(--muted)">${esc(d.name)} · ${esc(b.dept)}</div></div></div>
      <div class="kv">
        <span>Appetite</span><b>${b.eaten.toFixed(1)} / ${b.appetite} meals</b>
        <span>Patience</span><b>${Math.ceil(b.patience)}s</b>
        <span>Pays</span><b>x${d.pay}</b>
        ${b.prefer ? `<span>Craving</span><b>${esc(SPECIES_BY_ID[b.prefer].name)}</b>` : ''}
        ${d.reviewWeight > 1 ? `<span>Review weight</span><b style="color:#ffcf8a">x${d.reviewWeight}</b>` : ''}
      </div>
      <p>${wants}</p>
      ${b.angry ? '<p style="color:var(--bad)"><b>RAMPAGING! Keep it away from your stuff!</b></p>' : ''}
      <div class="btns"><button class="btn" id="m-follow">${ico('camera', 1)} Follow</button><button class="btn gold" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-follow', c).onclick = () => { this.click(); this.game.rig.follow = b; this.closeModal(); };
      },
    });
  }

  showStructureInfo(s) {
    const d = s.def;
    let extra = '';
    if (d.food) extra += `<span>${WANT_INFO[d.food.kind] ? WANT_INFO[d.food.kind].name : d.food.kind}</span><b>${Math.floor(s.stock)} / ${d.food.max}</b>`;
    if (d.maxHp < 90 || s.maxHp < 90) extra += `<span>Condition</span><b>${Math.max(0, Math.ceil((s.hp / s.maxHp) * 100))}%</b>`;
    if (!s.built) extra += `<span>Construction</span><b>${Math.floor(s.progress * 100)}%</b>`;
    const html = `
      <div style="display:flex;gap:10px;align-items:center"><img class="px" src="${this.icons.structure(s.type, this.game.structures)}" width="80" height="80" alt=""><div><h2 style="margin:0">${esc(d.name)}</h2><div style="color:var(--muted)">${esc(d.desc)}</div></div></div>
      <div class="kv">${extra}</div>
      <div class="btns">${d.gate ? `<button class="btn teal" id="m-gate">${s.open ? 'Close gate' : 'Open gate'}</button>` : ''}<button class="btn red" id="m-del">${ico('trash', 1)} Remove (+${Math.floor((s.paid || 0) * 0.5)})</button><button class="btn gold" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-del', c).onclick = () => { this.closeModal(); this.game.demolishAt(s.x, s.z); };
        const g = $('#m-gate', c);
        if (g) g.onclick = () => { this.game.structures.toggleGate(s); this.closeModal(); };
      },
    });
  }

  showFishInfo(f) {
    const sp = f.sp;
    const html = `
      <div class="big-icon"><img class="px" src="${this.icons.fish(sp, f.golden)}" width="120" height="120" alt=""></div>
      <h2 class="center">${f.golden ? 'Golden ' : ''}${esc(sp.name)}${f.adult ? '' : ' (fry)'}</h2>
      <div class="kv"><span>Hunger</span><b>${hungerWord(f.hunger)}</b><span>Worth to bears</span><b>${ico('coin', 1)}${Math.round(this.game.fish.coinValue(f) * 5 * this.game.mods.fishValueMult * this.game.mods.payMult)}</b><span>Mood</span><b>${f.state === 'court' ? 'In love' : f.state === 'flee' ? 'Terrified' : f.hunger < 0.5 && f.loveT <= 0 ? 'Looking for love' : 'Chill'}</b></div>
      <div class="btns"><button class="btn gold" id="m-ok">OK</button></div>`;
    this.showModal(html, { onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); }; } });
  }

  showMenu() {
    const game = this.game;
    const v = game.audio.getVolumes();
    const canRetire = game.state.research.includes('r_franchise');
    const html = `
      <h1>Menu</h1>
      <div class="kv">
        <span>Music volume</span><b><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" id="v-music"></b>
        <span>Sound effects</span><b><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" id="v-sfx"></b>
        <span>Ambience</span><b><input type="range" min="0" max="100" value="${Math.round(v.ambience * 100)}" id="v-amb"></b>
        <span>Pixel size</span><b><select id="v-px"><option value="0.7">Chunky</option><option value="1">Normal</option><option value="1.4">Fine</option></select></b>
      </div>
      <div class="btns">
        <button class="btn" id="m-help">${ico('info', 1)} How to play</button>
        <button class="btn" id="m-save">${ico('save', 1)} Save</button>
        ${canRetire ? `<button class="btn gold" id="m-retire">${ico('trophy', 1)} Retire (prestige)</button>` : ''}
        <button class="btn red" id="m-reset">New game</button>
        <button class="btn gold" id="m-ok">Resume</button>
      </div>
      <p class="center" style="color:var(--muted);font-size:12px">Golden tails: ${game.legacy.tails} (+${game.legacy.tails * 10}% coins) · Best: day ${game.legacy.best || 0}</p>`;
    this.showModal(html, {
      onBind: (c) => {
        const setV = () => game.audio.setVolumes({ music: $('#v-music', c).value / 100, sfx: $('#v-sfx', c).value / 100, ambience: $('#v-amb', c).value / 100 });
        for (const id of ['#v-music', '#v-sfx', '#v-amb']) $(id, c).oninput = setV;
        const px = $('#v-px', c);
        px.value = String(game.renderer.pixelDensity);
        px.onchange = () => { game.renderer.pixelDensity = +px.value; game.resize(); try { localStorage.setItem('tbme.px', px.value); } catch { /* ignore */ } };
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-help', c).onclick = () => { this.click(); this.showHelp(); };
        $('#m-save', c).onclick = () => { game.save(); this.toast('Saved!', 'good'); };
        const rt = $('#m-retire', c);
        if (rt) rt.onclick = () => { this.closeModal(); game.retire(); };
        $('#m-reset', c).onclick = () => {
          this.confirmBox('Start a brand new pond? Your current progress will be lost.', () => {
            game.newGame();
            this.startTutorialIfNew();
          }, { yes: 'Start over' });
        };
      },
    });
  }

  showHelp() {
    const html = `
      <h1>How to play</h1>
      <p>${ico('fox', 1)} You are <b>Reynard</b>, a greedy fox who runs a fish-pond buffet in the Canadian wilds.</p>
      <p>${ico('food', 1)} <b>Tap the water</b> to toss food. Fed adult fish fall in love, lay eggs and the fry grow up. Plant <b>seaweed</b> and <b>cattails</b> (bugs!) for extra food.</p>
      <p>${ico('clock', 1)} At <b>5 PM</b> bears get off work, run down the mountain and cannonball into your pond. Each bear eats a few fish, then pays and reviews you.</p>
      <p>${ico('honey', 1)} Some bears also want <b>honey</b> (willow + beehive), <b>maple syrup</b>, <b>blueberries</b> or <b>seaweed</b>, or a specific fish. Check tonight's reservations!</p>
      <p>${ico('bolt', 1)} Hungry bears <b>rampage</b>: they smash your stuff and post 0-star reviews. If your rating drops below <b>1.0</b> you're closed.</p>
      <p>${ico('dam', 1)} Bears will eat <i>every</i> fish they can reach. Hire <b>beavers</b> to build <b>dams</b>, <b>fences</b> and <b>sluice gates</b> to keep a protected breeding nursery. Fish hide under <b>platforms</b> and <b>lily pads</b>.</p>
      <p>${ico('heart', 1)} Cross-breed different species to discover <b>hybrids</b> like the Aurora Salmon or the legendary Maple Leaf Koi.</p>
      <p>${ico('info', 1)} <b>Controls:</b> drag to pan, scroll/pinch to zoom, <b>Q/E</b> rotate, <b>WASD</b> move, <b>1-8</b> tools, <b>Space</b> pause, <b>B</b> open early, <b>Esc</b> cancel.</p>
      <div class="btns"><button class="btn gold" id="m-ok">Let's go</button></div>`;
    this.showModal(html, { onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); }; } });
  }

  showTitle(onStart) {
    const game = this.game;
    const has = game.hasSave();
    const root = document.getElementById('title-root');
    root.innerHTML = `
      <div class="title-wrap" id="title">
        <div class="logo"><div class="l1">THE</div><div class="l2">BEAR MUST EAT</div><div class="l3">A greedy fox's all-u-can-eat fish pond</div></div>
        <div class="title-fox"><img class="px" src="${foxPortraitURL('smug', 4)}" width="128" height="128" alt=""></div>
        <div class="btns">
          ${has ? `<button class="btn gold big" id="t-cont">${ico('play', 1)} Continue</button>` : ''}
          <button class="btn ${has ? '' : 'gold'} big" id="t-new">${has ? 'New pond' : `${ico('play', 1)} Open the pond`}</button>
          <button class="btn" id="t-help">${ico('info', 1)} How to play</button>
        </div>
        ${game.legacy.tails ? `<div class="legacy">${ico('star', 1)} ${game.legacy.tails} golden tail${game.legacy.tails > 1 ? 's' : ''}: +${game.legacy.tails * 10}% coins forever</div>` : ''}
      </div>`;
    const done = (mode) => { game.audio.unlock(); this.click(); root.innerHTML = ''; onStart(mode); };
    const cont = $('#t-cont', root);
    if (cont) cont.onclick = () => done('continue');
    $('#t-new', root).onclick = () => {
      if (!has) { done('new'); return; }
      this.confirmBox('Start a new pond? Your saved game will be replaced.', () => done('new'), { yes: 'New pond' });
    };
    $('#t-help', root).onclick = () => { this.click(); this.showHelp(); };
  }
}

function hungerWord(h) {
  return h < 0.25 ? 'Stuffed' : h < 0.5 ? 'Content' : h < 0.75 ? 'Peckish' : 'Starving!';
}

function pickReview(r) {
  const good = r.reviews.find((v) => v.stars >= 4);
  return good ? good.text.slice(0, 40) : 'Best fish in town';
}
