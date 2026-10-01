// HTML/CSS pixel UI (cozy parchment / wood / green-ribbon theme):
// HUD plaques, the corporate clock, egg tray, toolbar, panels (egg shop,
// build, fishdex, reviews), modals, fox dialogue, toasts, comic speech
// bubbles above bears, cinematic letterbox, night overlay, and hooks for the
// big components (egg hatching, daily ledger, morning summary, lab tree).
import * as THREE from 'three';
import { spriteImg, spriteURL, foxPortraitURL, hasSprite } from './sprites.js';
import { Icons3D } from './icons3d.js';
import { fishIconURL, fishCanvasFor } from '../game/fishSprites.js';
import { SPECIES, SPECIES_BY_ID, RARITIES, MORPHS, MORPH_IDS, TRAITS } from '../data/species.js';
import { STRUCTURES, BUILD_CATEGORIES, CHARM_CAP } from '../data/structures.js';
import { RESEARCH, RESEARCH_BY_ID, BRANCHES, UNLOCKS_BUILD, UNLOCKS_SPECIES } from '../data/research.js';
import { WANT_INFO } from '../data/bears.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { sizeLabel } from '../game/genes.js';

// optional components (built by separate modules; the UI degrades gracefully)
const comp = import.meta.glob(['./CorpClock.js', './EggHatch.js', './FinanceSheet.js', './Overnight.js', './LabTree.js', './frames.js'], { eager: true });
const C = (name) => comp[`./${name}.js`] || null;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.floor(n).toLocaleString('en-US'));
const ico = (name, scale = 2, cls = '') => spriteImg(name, scale, cls);
const _v = new THREE.Vector3();

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

function fishImg(id, { morph = 'normal', scale = 2, cls = '', fry = false } = {}) {
  return `<img class="px fishimg ${cls}" src="${fishIconURL(id, { morph, scale, fry })}" alt="" draggable="false">`;
}

const TUTORIAL = [
  { expr: 'smug', text: "Welcome to <b>Reynard's All-U-Can-Eat Pond</b>! The suits at Bear St. Holdings get off work at <b>5 PM</b>... and they are HUNGRY. Heh heh heh." },
  { expr: 'wink', text: 'Meet <b>Bonnie & Clyde</b>, our breeding pair. <b>Tap the pond</b> to toss them some food. Well-fed fish fall in love and make MORE fish.', wait: true, pulse: 'feed' },
  { expr: 'greedy', text: 'Buy more fish in the <b>Egg shop</b>. Eggs incubate in your <b>egg tray</b>; tap a ready egg to hatch it. Rare eggs hide rare genes!', pulse: 'shop' },
  { expr: 'worried', text: 'Bears eat EVERY fish they can reach. Use the <b>Tag</b> tool on a precious fish: tagged fish are "DO NOT EAT". Plant <b>blueberries</b> too: bears love a side dish!', pulse: 'tag' },
  { expr: 'smug', text: 'Coins buy research in my secret <b>Lab</b> (tap my hut). New fish, beavers, dams, gadgets... Now go make me rich!', pulse: 'lab' },
];

const TOOLS = [
  { tool: 'feed', icon: 'food', label: 'Feed', key: 1, title: 'Feed fish' },
  { tool: 'hand', icon: 'hand', label: 'Carry', key: 2, title: 'Pick up a fish and carry it somewhere else' },
  { tool: 'tag', icon: 'tag', label: 'Tag', key: 3, title: 'Tag a fish DO NOT EAT' },
  { tool: 'nurture', icon: 'nurture', label: 'Pet', key: 4, title: 'Pet a fish: faster growth and better genes' },
  { panel: 'shop', icon: 'shop', label: 'Eggs', key: 5, title: 'Egg shop' },
  { panel: 'build', icon: 'hammer', label: 'Build', key: 6, title: 'Build' },
  { tool: 'dig', icon: 'shovel', label: 'Dig', key: 7, title: 'Dig: expand the pond' },
  { tool: 'remove', icon: 'trash', label: 'Remove', key: 8, title: 'Remove structures / clear trees' },
  { panel: 'lab', icon: 'flask', label: 'Lab', key: 9, title: "Reynard's secret lab" },
  { panel: 'dex', icon: 'book', label: 'Fishdex', title: 'Fishdex' },
  { panel: 'reviews', icon: 'newspaper', label: 'Reviews', title: 'Reviews' },
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
    this.says = new Map(); // bear id -> speech bubble
    this.reviewBubbles = [];
    this.floaters = [];
    this.hud = {};
    this.foxQueue = [];
    this.foxCurrent = null;
    this.lastHUD = {};
    this.tipT = 0;
    this.busy = 0; // a ceremony / sheet is on screen
    this.applyFrames();
    this.buildDOM();
    game.on('coins', () => { this.popCoins(); this.refreshPanelSoon(); });
    game.on('research', () => this.refreshPanelSoon());
    game.on('tool', (t) => this.onTool(t));
    game.on('dig', () => { if (game.tool.kind === 'dig') this.onTool(game.tool); });
  }

  // 9-slice pixel frames from src/ui/frames.js replace the CSS fallback look
  applyFrames() {
    const F = C('frames');
    if (!F?.frameStyle || !F.FRAMES) return;
    try { F.injectFrameCSS?.(); } catch { /* optional */ }
    const map = [
      ['.panel, .modal, .fox .say, .clock, .toast', 'parchment'],
      ['.panel-head', 'ribbon_green'],
      ['.toolbar, .eggtray', 'wood'],
      ['.plaque', 'plaque'],
      ['.tip, .toolhint', 'tooltip'],
      ['.tool, .eslot, .iconbox', 'slot_gold'],
      ['.tool.active, .eslot.ready', 'slot_gold_active'],
      ['.btn, .rbtn', 'button_green'],
      ['.btn:hover, .rbtn:hover', 'button_green_hover'],
      ['.btn:active, .rbtn:active', 'button_green_down'],
      ['.btn.red', 'button_red'],
      ['.btn.gold, .rbtn.on', 'button_gold'],
      ['.tab', 'tab'],
      ['.tab.on', 'tab_active'],
      ['.chip', 'chip'],
      ['.sb', 'bubble_bw'],
    ];
    let css = '';
    for (const [sel, name] of map) {
      const fr = F.FRAMES[name];
      if (!fr) continue;
      let decl = '';
      try { decl = F.frameStyle(name, 2); } catch { continue; }
      if (!decl) continue;
      const sels = sel.split(',').map((x) => `html body ${x.trim()}`).join(', ');
      css += `${sels} { ${decl}; ${fr.fill ? 'background: none;' : ''} box-shadow: none; border-radius: 0; }\n`;
    }
    const st = document.createElement('style');
    st.id = 'tbme-frame-map';
    st.textContent = css;
    document.head.appendChild(st);
    document.body.classList.add('framed');
  }

  // ------------------------------------------------------------ DOM
  buildDOM() {
    const r = this.root;
    r.innerHTML = `
      <div class="hud">
        <div class="hud-left">
          <div class="plaque coins f-plaque" id="h-coins" title="Coins">${ico('coin', 2)}<b id="h-coinv">0</b></div>
          <div class="plaque f-plaque" id="h-fish" title="Fish in pond / capacity">${ico('fish', 2)}<b id="h-fishv">0</b><span class="sub" id="h-fishc"></span></div>
          <div class="plaque ia f-plaque" id="h-rating" title="Your rating (tap for reviews)"><span id="h-stars"></span><b id="h-ratingv">3.0</b></div>
          <div class="plaque f-plaque" id="h-beauty" title="Beauty: prettier ponds attract more bears and bigger bills">${ico('beauty', 2)}<b id="h-beautyv">0</b><span class="sub" id="h-beautyc"></span></div>
        </div>
        <div class="clockwrap" id="clockwrap"></div>
        <div class="hud-right">
          <div class="seg" id="speed">
            <button class="rbtn" data-s="0" title="Pause (Space)">${ico('pause', 1)}</button>
            <button class="rbtn" data-s="1">1x</button>
            <button class="rbtn" data-s="2">2x</button>
            <button class="rbtn" data-s="3">3x</button>
          </div>
          <button class="rbtn big" id="b-cam" title="Follow the bears (F)">${ico('camera', 2)}</button>
          <button class="rbtn big" id="b-snd" title="Sound">${ico('speaker_on', 2)}</button>
          <button class="rbtn big" id="b-menu" title="Menu">${ico('menu', 2)}</button>
        </div>
      </div>
      <div class="eggtray f-wood" id="eggtray"></div>
      <div class="toolhint hidden f-tooltip" id="toolhint"></div>
      <div class="toolbar f-wood" id="toolbar">
        ${TOOLS.map((t) => `<button class="tool f-slot_gold ${t.tool === 'feed' ? 'active' : ''}" ${t.tool ? `data-tool="${t.tool}"` : `data-panel="${t.panel}"`} title="${esc(t.title)}${t.key ? ` (${t.key})` : ''}">${ico(t.icon, 2)}<span>${t.label}</span>${t.tool === 'feed' ? '<i class="bag"><b id="bag"></b></i>' : ''}${t.tool === 'tag' ? '<em class="cnt" id="tagcnt"></em>' : ''}</button>`).join('')}
      </div>
      <div class="panel hidden f-parchment" id="panel">
        <div class="panel-head f-ribbon_green"><h2 id="p-title"></h2><span class="coins-mini">${ico('coin', 1)}<span id="p-coins"></span></span><button class="xbtn" id="p-close" title="Close (Esc)">${ico('cross', 1)}</button></div>
        <div class="tabs" id="p-tabs"></div>
        <div class="panel-body" id="p-body"></div>
      </div>
      <div class="fox hidden" id="fox"><img class="px" id="fox-face" alt=""><div class="say f-parchment"><b>Reynard</b><p id="fox-say"></p><button class="btn small green f-button_green" id="fox-ok">OK</button></div></div>
      <div class="toasts" id="toasts"></div>
      <div class="tip hidden f-tooltip" id="tip"></div>
      <div class="cinebars"><i class="t"></i><i class="b"></i></div>
      <div class="cineui hidden" id="cineui"><div class="cinetitle" id="cinetitle"></div><button class="ffbtn" id="ffbtn">${ico('fastforward', 2)}<span>Hold to fast-forward</span></button></div>
      <div class="nightui hidden" id="nightui"><div class="zz">${ico('moon', 3)}<b>Zzz...</b><span>Reynard is asleep. The pond keeps growing.</span><button class="btn small" id="nightskip">Skip ${ico('fastforward', 1)}</button></div></div>
      <div class="modal-wrap hidden" id="modal"><div class="modal f-parchment" id="modal-card"></div></div>
      <div id="ceremony-root"></div>
      <div id="title-root"></div>
    `;
    const h = this.hud;
    for (const id of ['h-coinv', 'h-fishv', 'h-fishc', 'h-stars', 'h-ratingv', 'h-beautyv', 'h-beautyc', 'clockwrap', 'bag', 'tagcnt', 'toolhint', 'eggtray', 'panel', 'p-title', 'p-tabs', 'p-body', 'p-coins', 'toasts', 'tip', 'modal', 'modal-card', 'fox', 'fox-face', 'fox-say', 'fox-ok', 'h-coins', 'cineui', 'cinetitle', 'nightui', 'ceremony-root'])
      h[id] = document.getElementById(id);
    this.buildClock();
    $('#toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('.tool');
      if (!b || this.game.inputLocked) return;
      this.click();
      if (b.dataset.tool) {
        const cur = this.game.tool.kind;
        this.closePanel();
        this.game.setTool(cur === b.dataset.tool && cur !== 'feed' ? { kind: 'feed' } : { kind: b.dataset.tool });
      } else if (b.dataset.panel) {
        if (b.dataset.panel === 'lab') { this.openLab(); return; }
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
    $('#p-close').addEventListener('click', () => { this.closePanel(); this.closeSound(); });
    h['fox-ok'].addEventListener('click', () => { this.click(); this.foxNext(); });
    h.modal.addEventListener('click', (e) => { if (e.target === h.modal && this.modalDismissable) this.closeModal(); });
    h.eggtray.addEventListener('click', (e) => {
      const slot = e.target.closest('[data-egg]');
      if (slot) this.tapEgg(+slot.dataset.egg);
      else if (e.target.closest('.eslot.empty')) { this.click(); this.openPanel('shop'); }
    });
    const ff = $('#ffbtn');
    const setFF = (v) => { this.game.cine?.toggleFast(v); ff.classList.toggle('on', v); };
    ff.addEventListener('pointerdown', (e) => { e.preventDefault(); setFF(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ff.addEventListener(ev, () => setFF(false));
    $('#nightskip').addEventListener('click', () => { this.click(); this.game.hurryNight(); });
    h.nightui.addEventListener('click', (e) => { if (e.target === h.nightui) this.game.hurryNight(); });
    $('#b-snd').innerHTML = ico(this.game.audio.isMuted() ? 'speaker_off' : 'speaker_on', 2);
    this.renderSpeed();
  }

  buildClock() {
    const wrap = this.hud.clockwrap;
    const CC = C('CorpClock')?.CorpClock;
    if (CC) {
      try {
        this.corp = new CC(wrap, {
          onBell: () => this.game.ringBell(),
          sfx: (n, o) => this.game.audio.play(n, { volume: 0.3, ...(o || {}) }),
          icon: (n, s) => ico(n, s),
        });
        return;
      } catch (e) { console.warn('CorpClock failed', e); this.corp = null; }
    }
    wrap.innerHTML = `<div class="clock f-parchment"><div class="ct"><b id="c-day">MONDAY</b> · DAY <b id="c-dayn">1</b></div><div class="tm" id="c-time">9:00 AM</div><div class="bar"><i id="c-fill"></i></div><div class="cs"><span id="c-sub"></span><button class="btn small green" id="c-bell">${ico('bell', 1)} Open</button></div></div>`;
    for (const id of ['c-day', 'c-dayn', 'c-time', 'c-fill', 'c-sub', 'c-bell']) this.hud[id] = document.getElementById(id);
    this.hud['c-bell'].addEventListener('click', () => this.game.ringBell());
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
    const t = TOOLS.find((x) => x.key === n);
    if (!t) return;
    const sel = t.tool ? `[data-tool="${t.tool}"]` : `[data-panel="${t.panel}"]`;
    document.querySelector(`#toolbar ${sel}`)?.click();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const game = this.game;
    const st = game.state;
    const h = this.hud;
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
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) {
      this.hudT = 0.5;
      this.setText('h-beautyv', `${game.beauty()}`);
      this.setText('h-beautyc', `+${game.charmPct()}%`);
      this.setText('tagcnt', `${game.tagLimit() - game.tagsUsed()}`);
      this.renderEggTray();
    }
    this.updateClock(dt);
    const bw = `${Math.round((game.foodBag.count / game.foodBag.max) * 100)}%`;
    if (h.bag.style.width !== bw) h.bag.style.width = bw;
    this.updateSays(dt);
    this.updateFloaters(dt);
    this.updateGhost();
    this.updateEggTimers();
    const night = st.phase === 'night';
    if (night !== this.lastNight) { this.lastNight = night; h.nightui.classList.toggle('hidden', !night); }
    this.tipT -= dt;
    if (this.foxAutoT > 0) { this.foxAutoT -= dt; if (this.foxAutoT <= 0 && this.foxCurrent?.auto) this.foxNext(); }
  }

  updateClock(dt) {
    const game = this.game;
    const st = game.state;
    if (this.corp) {
      try {
        this.corp.update(dt, { hour: st.hour, phase: st.phase, day: st.day, weekday: game.weekday(), dayOff: game.isDayOff(), secondsToRush: game.secondsToRush() / Math.max(1, st.speed), lunchStart: 12, lunchEnd: 13, open: 9, close: 17 });
      } catch { /* ignore */ }
      return;
    }
    const h = this.hud;
    this.setText('c-day', game.weekday().toUpperCase());
    this.setText('c-dayn', String(st.day));
    this.setText('c-time', clockText(st.hour));
    let fill = 1, sub = '';
    if (st.phase === 'day') {
      fill = (st.hour - 9) / 8;
      const s = Math.max(0, Math.ceil(game.secondsToRush() / Math.max(1, st.speed)));
      sub = game.isDayOff() ? 'Sunday: office closed' : st.hour >= 12 && st.hour < 13 ? 'LUNCH BREAK' : `OFF WORK IN ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      h['c-bell'].classList.toggle('hidden', game.isDayOff() || !!game.transition);
    } else {
      sub = st.phase === 'rush' ? 'FEEDING TIME!' : st.phase === 'night' ? 'Closed for the night' : 'Closed';
      h['c-bell'].classList.add('hidden');
    }
    h['c-fill'].style.width = `${Math.round(Math.min(1, Math.max(0, fill)) * 100)}%`;
    this.setText('c-sub', sub);
  }

  foxMood(expr, t = 1.6) { this.foxMoodState = { expr, t }; }

  setText(id, v) {
    if (this.lastHUD[id] === v) return;
    this.lastHUD[id] = v;
    const el = this.hud[id];
    if (el) el.textContent = v;
  }

  popCoins() {
    const el = this.hud['h-coins'];
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  // ------------------------------------------------------------ egg tray
  renderEggTray() {
    const game = this.game;
    const tray = game.state.eggTray;
    const slots = game.eggSlots();
    const key = `${slots}|${tray.map((e) => `${e.uid}:${e.rarity}:${e.t <= 0 ? 1 : 0}`).join(',')}`;
    if (key === this.lastTrayKey) return;
    this.lastTrayKey = key;
    let html = `<div class="et-title">EGG TRAY</div><div class="et-slots">`;
    for (let i = 0; i < slots; i++) {
      const e = tray[i];
      if (!e) { html += `<div class="eslot empty f-slot_gold" title="Buy eggs in the Egg shop">${ico('egg', 2, 'ghost')}</div>`; continue; }
      const rar = RARITIES[e.rarity];
      const ready = e.t <= 0;
      const eggName = `egg_${rar.id}_${ready ? 1 : 0}`;
      html += `<div class="eslot f-slot_gold ${ready ? 'ready' : ''} r${e.rarity}" data-egg="${e.uid}" title="${esc(rar.name)} egg${e.mystery ? ' (mystery)' : ''}">
        ${hasSprite(eggName) ? ico(eggName, 2, 'egg') : ico('egg', 2, 'egg')}
        <span class="etime" data-t="${e.uid}">${ready ? 'TAP!' : ''}</span></div>`;
    }
    html += '</div>';
    this.hud.eggtray.innerHTML = html;
    this.updateEggTimers(true);
  }

  updateEggTimers(force = false) {
    this.eggTimerT = (this.eggTimerT || 0) - 1 / 60;
    if (!force && this.eggTimerT > 0) return;
    this.eggTimerT = 0.25;
    for (const e of this.game.state.eggTray) {
      const el = this.hud.eggtray.querySelector(`[data-t="${e.uid}"]`);
      if (!el) continue;
      const s = Math.ceil(e.t);
      const txt = e.t <= 0 ? 'TAP!' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (el.textContent !== txt) el.textContent = txt;
    }
  }

  onEggBought() { this.lastTrayKey = null; this.renderEggTray(); this.hud.eggtray.classList.remove('bump'); void this.hud.eggtray.offsetWidth; this.hud.eggtray.classList.add('bump'); }
  onEggReady() {
    this.lastTrayKey = null;
    this.renderEggTray();
    if (!this.game.state.tips.eggready) { this.game.state.tips.eggready = 1; this.toast(`${ico('egg', 1)} An egg is ready to hatch! Tap it in the egg tray.`, 'gold'); }
  }

  // Tap an egg: hatch every ready egg in one ceremony
  tapEgg(uid) {
    const game = this.game;
    if (this.busy || game.inputLocked) return;
    const e = game.state.eggTray.find((x) => x.uid === uid);
    if (!e) return;
    if (e.t > 0) {
      this.click();
      this.toast(`This ${RARITIES[e.rarity].name.toLowerCase()} egg needs ${Math.ceil(e.t)}s more. Keep it warm!`);
      return;
    }
    const ready = game.state.eggTray.filter((x) => x.t <= 0);
    const opened = ready.map((x) => ({ uid: x.uid, ...game.openEgg(x.uid) })).filter((o) => o.card);
    if (!opened.length) return;
    this.busy++;
    this.closePanel();
    const finish = () => {
      for (const o of opened) game.releaseEgg(o.uid);
      this.busy--;
      this.lastTrayKey = null;
      this.renderEggTray();
    };
    const EH = C('EggHatch');
    const opts = {
      fishCanvas: (id, o) => fishCanvasFor(id, o || {}),
      icon: (n, s) => ico(n, s),
      sfx: (n, o) => game.audio.play(n, { volume: 0.5, ...(o || {}) }),
      rarities: RARITIES,
    };
    if (EH?.playEggHatch) {
      const wasPaused = game.state.paused;
      game.state.paused = true;
      EH.playEggHatch(this.hud['ceremony-root'], opened.map((o) => o.card), opts).catch(() => {}).finally(() => { game.state.paused = wasPaused; finish(); });
    } else {
      this.simpleHatch(opened.map((o) => o.card), finish);
    }
  }

  simpleHatch(cards, done) {
    const c = cards[0];
    const html = `<h1 style="color:${RARITIES[c.rarity].color}">${esc(RARITIES[c.rarity].name.toUpperCase())} EGG HATCHED!</h1>
      <div class="big-icon">${fishImg(c.speciesId, { morph: c.morph.id, scale: 5, cls: 'shine' })}</div>
      <h2 class="center">${esc(c.speciesName)}</h2>
      <p class="center">${c.sex === 'M' ? '♂' : '♀'} · Size ${c.size.label} · ${esc(c.morph.name)} · ${'★'.repeat(c.stars)}</p>
      <p class="center">${c.traits.map((t) => esc(t.name)).join(', ') || 'No special traits'}</p>
      ${cards.length > 1 ? `<p class="center">+${cards.length - 1} more</p>` : ''}
      <div class="btns"><button class="btn green big" id="m-ok">Into the pond!</button></div>`;
    this.showModal(html, { dismissable: false, onBind: (el) => { $('#m-ok', el).onclick = () => { this.click(); this.closeModal(); done(); }; } });
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

  pickFish(sx, sy, r = 22) {
    let best = null, bd = r * r;
    for (const f of this.game.fish.list) {
      if (f.held) continue;
      const p = this.screenOf(f.x, f.y, f.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  hover(sx, sy) {
    const tip = this.hud.tip;
    const k = this.game.tool.kind;
    if (!['feed', 'hand', 'tag', 'nurture'].includes(k) || this.panel || this.game.inputLocked) { tip.classList.add('hidden'); return; }
    const b = k === 'feed' ? this.pickBear(sx, sy) : null;
    let html = '';
    if (b) {
      const d = b.def;
      const wants = b.wants.map((w) => ico(WANT_INFO[w.kind]?.icon || 'food', 1, w.done ? 'done' : '')).join('');
      html = `<b>${esc(b.name)}</b> · ${esc(d.name)}<br><span class="mut">${esc(b.dept)}</span><br>Ate ${b.eaten.toFixed(1)} / ${b.appetite} ${wants}${b.angry ? '<br><b class="bad">RAMPAGING!</b>' : ''}`;
    } else {
      const f = this.pickFish(sx, sy, 28);
      if (f) {
        const m = f.g.morph !== 'normal' ? `${esc(MORPHS[f.g.morph].name)} ` : '';
        html = `<b>${f.name ? esc(f.name) + ' · ' : ''}${m}${esc(f.sp.name)}</b> ${f.g.sex === 'M' ? '♂' : '♀'}${f.adult ? '' : ' (fry)'}<br>${'★'.repeat(f.g.stars)} · Size ${sizeLabel(f.g.size)}${f.g.traits.length ? ' · ' + f.g.traits.map((t) => esc(TRAITS[t].name)).join(', ') : ''}<br>Hunger: ${hungerWord(f.hunger)}${f.tagged ? ' · <b class="bad">DO NOT EAT</b>' : ''}${f.love > 0.2 ? ' · Nurtured ' + ico('heart', 1) : ''}`;
      }
    }
    if (!html) { tip.classList.add('hidden'); return; }
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = `${Math.min(window.innerWidth - w - 6, sx + 16)}px`;
    tip.style.top = `${Math.max(6, sy - hh - 10)}px`;
  }

  // ------------------------------------------------------------ comic speech bubbles (bears)
  attachBearBubble() { /* bubbles are created on demand by bearSay */ }
  detachBearBubble(b) {
    const s = this.says.get(b.id);
    if (s) { s.el.remove(); this.says.delete(b.id); }
  }

  bearSay(b, { text = null, emote = null, item = null, dur = 2.2 } = {}) {
    let s = this.says.get(b.id);
    if (!s) {
      const el = document.createElement('div');
      el.className = 'sb';
      this.overlay.appendChild(el);
      s = { el, bear: b, t: 0 };
      this.says.set(b.id, s);
    }
    let html = '';
    if (emote && hasSprite(emote)) html += `<span class="emo">${ico(emote, 2)}</span>`;
    else if (emote) html += `<span class="emo txt">${emote === 'emo_anger' ? '#!' : emote === 'emo_question' ? '?' : '!'}</span>`;
    if (item) html += `<span class="item">${ico(item, 2)}</span>`;
    if (text) html += '<span class="tx"></span>';
    s.el.innerHTML = html;
    s.el.classList.remove('out', 'pop');
    void s.el.offsetWidth;
    s.el.classList.add('pop');
    s.el.classList.toggle('angry', emote === 'emo_anger');
    s.t = dur + (text ? text.length * 0.03 : 0);
    s.text = text || '';
    s.shown = 0;
    s.typeT = 0;
    s.span = text ? s.el.querySelector('.tx') : null;
    if (text) this.game.audio.babble?.(b.def.boss ? 'ceo' : b.def.scale < 0.7 ? 'cub' : 'bear', text, { volume: 0.25 });
  }

  updateSays(dt) {
    for (const [id, s] of this.says) {
      const b = s.bear;
      s.t -= dt;
      if (s.span && s.shown < s.text.length) {
        s.typeT += dt * 40;
        const n = Math.min(s.text.length, Math.floor(s.typeT));
        if (n !== s.shown) { s.shown = n; s.span.textContent = s.text.slice(0, n); }
      }
      if (!b.visible || s.t <= 0) {
        if (!s.el.classList.contains('out')) { s.el.classList.add('out'); s.dieT = 0.25; }
        s.dieT -= dt;
        if (s.dieT <= 0) { s.el.remove(); this.says.delete(id); }
        continue;
      }
      const p = this.screenOf(b.x, b.y + 2.25 * b.def.scale + 0.25, b.z);
      if (!p.visible) { s.el.style.display = 'none'; continue; }
      s.el.style.display = '';
      s.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    }
    // idle status bubbles: cravings, impatience
    this.statusT = (this.statusT || 0) - dt;
    if (this.statusT <= 0) {
      this.statusT = 1.1;
      for (const b of this.game.bears.list) {
        if (!b.visible || this.says.has(b.id) || b.state === 'commute' || b.state === 'commuteUp' || b.goal?.kind === 'leave') continue;
        if (Math.random() > 0.2) continue;
        const k = b.patience / b.maxPatience;
        if (b.angry) this.bearSay(b, { emote: 'emo_anger', dur: 1.4 });
        else if (k < 0.3) this.bearSay(b, { text: Math.random() < 0.5 ? 'Hurry up!' : 'I\'m starving!', emote: 'emo_sweat', dur: 1.8 });
        else if (b.state === 'hunt') this.bearSay(b, { emote: 'emo_fish', dur: 1.2 });
        else {
          const w = b.wants.find((x) => !x.done);
          if (w) this.bearSay(b, { emote: 'emo_think', item: WANT_INFO[w.kind]?.icon, dur: 1.8 });
          else if (b.eaten < b.appetite) this.bearSay(b, { emote: 'emo_hungry', dur: 1.4 });
        }
      }
    }
    for (let i = 0; i < this.reviewBubbles.length; i++) {
      const rb = this.reviewBubbles[i];
      rb.t -= dt;
      const b = rb.bear;
      if (b) { rb.x = b.x; rb.y = b.y + 2.6 * b.def.scale + 0.3; rb.z = b.z; }
      const p = this.screenOf(rb.x, rb.y, rb.z);
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
    if (r.stars >= 5) this.foxMood('laugh', 1.4);
    if (r.stars <= 1) this.foxMood('angry', 1.6);
    this.detachBearBubble(b);
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
    el.className = `toast f-parchment ${kind}`;
    el.innerHTML = text;
    const box = this.hud.toasts;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
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

  foxBubble(text) { this.toast(`${ico('fox', 1)} <i>${esc(text)}</i>`); }

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
    const plain = m.text.replace(/<[^>]+>/g, '');
    this.game.audio.babble?.('fox', plain.slice(0, 90), { volume: 0.3 });
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
      this.foxCurrent = null;
      this.foxQueue.unshift(msg);
      this.foxNext();
      return;
    }
    this.foxQueue.push(msg);
    if (!this.foxCurrent) this.foxNext();
  }

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

  // ------------------------------------------------------------ phases
  onDayStart() {
    const st = this.game.state;
    if (st.day > 1 && this.game.fish.count < 3 && !this.game.isDayOff())
      this.foxSay('The pond is nearly <b>empty</b>! Buy <b>eggs</b> in the Egg shop and feed your fish so they breed before 5 PM, or the bears will riot.', 'worried', { pulse: 'shop' });
    if (this.game.isDayOff()) this.tipOnce('sunday', 'Sunday! The bears are at home watching hockey. No customers today: time to breed fish and build. Heh.', 'sleepy');
    if (st.day === 2) this.tipOnce('day2', 'Pro tip: <b>blueberry bushes</b> (Build > Bear Snacks) feed the bears too, so they eat fewer fish. Plant them on a platform and rampagers can\'t smash them!', 'greedy');
    if (st.day === 3 && !st.research.includes('r_beavers')) this.tipOnce('beavers', 'Bears keep eating my breeding fish... <b>Hire Beavers</b> in the Lab to build <b>dams</b> and wall off a safe nursery!', 'wink');
    if (st.day === 4) this.tipOnce('beauty', '<b>Decor</b> makes the pond beautiful. Beauty attracts more customers and bigger bills. Mwahaha.', 'smug');
  }

  onRushStart() {
    this.closePanel();
    this.closeModal();
    this.foxQueue.length = 0;
    if (this.foxCurrent) { this.foxCurrent = null; this.hud.fox.classList.add('hidden'); }
  }

  onRampage(b) {
    this.foxMood('shocked', 2.5);
    this.toast(`${ico('bolt', 1)} ${esc(b.name)} (${esc(b.def.name)}) is RAMPAGING!`, 'bad');
  }

  onBedtime() {
    this.toast(`${ico('moon', 1)} Reynard heads home to bed...`);
  }

  setCinematic(on) {
    document.body.classList.toggle('cine', on);
    this.hud.cineui.classList.toggle('hidden', !on);
    this.hud.tip.classList.add('hidden');
    if (on) this.game.setTool({ kind: 'feed' });
  }

  cineTitle(top, main) {
    const el = this.hud.cinetitle;
    el.innerHTML = `<div class="c1">${esc(top)}</div><div class="c2">${esc(main)}</div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  followBear() {
    const rig = this.game.rig;
    const bears = this.game.bears.list.filter((b) => b.visible);
    if (!bears.length) {
      if (rig.follow) { rig.follow = null; this.toast('Camera free'); return; }
      rig.lookAt(30, 14);
      rig.wuppGoal = Math.max(rig.wuppGoal, 0.07);
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
    const g = this.game;
    let html = '';
    if (t.kind === 'build') {
      const d = STRUCTURES[t.type];
      html = `${ico(d.icon, 1)} <b>${esc(d.name)}</b> <span class="k">${ico('coin', 1)}${d.cost}</span> ${d.drag ? '· drag to place a line' : '· tap to place'}`;
    } else if (t.kind === 'dig') {
      html = `${ico('shovel', 1)} <b>Dig</b> next to the pond to expand it <span class="k">${ico('coin', 1)}${g.digCost()}</span> per tile · drag for a line`;
    } else if (t.kind === 'remove') {
      html = `${ico('trash', 1)} <b>Remove</b>: tap a structure (50% refund) or clear a tree/rock (${ico('coin', 1)}10)`;
    } else if (t.kind === 'hand') {
      html = `${ico('hand', 1)} <b>Carry</b>: press on a fish and drag it anywhere in the pond (great for moving fish into a nursery)`;
    } else if (t.kind === 'tag') {
      html = `${ico('tag', 1)} <b>DO NOT EAT</b>: tap a fish to tag it. Bears won't touch tagged fish. <span class="k">${g.tagLimit() - g.tagsUsed()} / ${g.tagLimit()} left</span>`;
    } else if (t.kind === 'nurture') {
      html = `${ico('nurture', 1)} <b>Pet</b>: tap or hold a fish. Nurtured fish grow faster, breed sooner and pass on better genes`;
    }
    hint.innerHTML = html + (html ? ' <button class="btn small green" id="th-x">Done</button>' : '');
    hint.classList.toggle('hidden', !html);
    const x = $('#th-x', hint);
    if (x) x.onclick = () => { this.click(); this.game.setTool({ kind: 'feed' }); };
    if (!['feed', 'hand', 'tag', 'nurture'].includes(t.kind)) this.hud.tip.classList.add('hidden');
  }

  updateGhost() {
    const game = this.game;
    const ghost = game.ghost;
    if (!ghost) return;
    const t = game.tool;
    if (!['build', 'dig', 'remove'].includes(t.kind)) { ghost.clear(); return; }
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

  // ------------------------------------------------------------ lab
  openLab() {
    const game = this.game;
    if (game.inputLocked) return;
    this.closePanel();
    if (game.lab?.open) { game.lab.open(); return; }
    this.labFallback = true;
    this.openPanel('lab');
  }

  // ------------------------------------------------------------ panels
  openPanel(name, tab) {
    if (name === 'lab' && this.game.lab?.open && !this.labFallback) { this.openLab(); return; }
    this.panel = name;
    if (tab) this.panelTab = tab;
    else if (name === 'build' && !BUILD_CATEGORIES.some((c) => c.id === this.panelTab)) this.panelTab = 'nature';
    this.hud.panel.classList.remove('hidden');
    this.hud.panel.classList.toggle('wide', name === 'lab' || name === 'dex');
    this.hud.tip.classList.add('hidden');
    for (const b of document.querySelectorAll('#toolbar .tool')) if (b.dataset.panel) b.classList.toggle('active', b.dataset.panel === name);
    this.renderPanel();
    this.game.audio.play('open', { volume: 0.35 });
  }

  closePanel() {
    if (!this.panel) return;
    this.panel = null;
    this.labFallback = false;
    this.labTree?.destroy?.();
    this.labTree = null;
    this.hud.panel.classList.add('hidden');
    for (const b of document.querySelectorAll('#toolbar .tool')) if (b.dataset.panel) b.classList.toggle('active', b.dataset.panel === 'build' && this.game.tool.kind === 'build');
  }

  closeTop() {
    if (this.game.lab?.active) { this.game.lab.close(); return true; }
    if (!this.hud.modal.classList.contains('hidden') && this.modalDismissable) { this.closeModal(); return true; }
    if (this.panel) { this.closePanel(); this.closeSound(); return true; }
    if (this.game.tool.kind !== 'feed') { this.game.setTool({ kind: 'feed' }); return true; }
    return false;
  }

  refreshPanelSoon() {
    if (this.labTree) { try { this.labTree.refresh(); } catch { /* ignore */ } }
    this.game.lab?.refresh?.();
    if (!this.panel || this._refreshQueued || this.panel === 'lab') return;
    this._refreshQueued = true;
    setTimeout(() => { this._refreshQueued = false; if (this.panel) this.renderPanel(true); }, 120);
  }

  renderPanel(keepScroll = false) {
    const body = this.hud['p-body'];
    const scroll = keepScroll ? [body.scrollTop, body.scrollLeft] : [0, 0];
    this.hud['p-tabs'].innerHTML = '';
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
    this.hud['p-title'].innerHTML = `${ico(iconName, 2)} <span>${text}</span>`;
  }

  renderShop() {
    const game = this.game;
    this.setTitle('shop', 'Egg Shop');
    const counts = game.fish.countBySpecies();
    const tray = game.state.eggTray.length, slots = game.eggSlots();
    const body = this.hud['p-body'];
    const full = tray >= slots;
    let html = `<div class="info">Eggs incubate in your <b>egg tray</b> (${tray}/${slots} slots), then hatch with a surprise: <b>sex</b>, <b>size</b>, rare <b>colour morphs</b> and <b>traits</b>!${full ? ' <b class="bad">Tray full: hatch an egg first.</b>' : ''}${game.fish.population() >= game.fish.capacity() ? ' <b class="bad">POND FULL: dig to expand!</b>' : ''}</div><div class="grid">`;
    const mp = game.mysteryPrice();
    html += `<div class="card clickable mystery" data-mystery="1">
      <div class="top"><span class="iconbox f-slot_gold">${ico(hasSprite('egg_epic_0') ? 'egg_epic_0' : 'egg', 2)}</span><div><div class="nm">Mystery Egg</div><div class="lt">Any fish you've unlocked</div></div></div>
      <div class="ds">A speckled surprise from Reynard's "supplier". Much better odds of rare genes!</div>
      <div class="row"><span class="cost ${game.canAfford(mp) ? '' : 'no'}">${ico('coin', 1)}${mp}</span><span class="own">LUCK x1.8</span></div></div>`;
    for (const sp of SPECIES) {
      const unlocked = game.speciesUnlocked(sp.id);
      const hybrid = sp.unlock === 'hybrid';
      if (hybrid && !unlocked) continue;
      const price = game.speciesPrice(sp.id);
      const afford = game.canAfford(price);
      const req = !unlocked && RESEARCH_BY_ID[UNLOCKS_SPECIES[sp.id] || sp.unlock];
      const rar = RARITIES[sp.tier || 0];
      html += `<div class="card ${unlocked ? 'clickable' : 'locked'}" data-buy="${sp.id}" style="--rar:${rar.color}">
        <div class="top"><span class="fishbox ${unlocked ? '' : 'sil'}">${fishImg(sp.id, { scale: 2 })}</span><div><div class="nm">${unlocked ? esc(sp.name) : '???'}</div><div class="lt">${unlocked ? esc(sp.latin) : 'Unknown species'}</div></div></div>
        <div class="ds">${unlocked ? esc(sp.desc) : 'Research it in the Lab to stock its eggs.'}</div>
        <div class="row"><span class="stat">Meal <b>${sp.meal}</b></span><span class="stat">Value <b>x${sp.value}</b></span><span class="rtag" style="background:${rar.color}">${rar.name}</span></div>
        <div class="row">${unlocked ? `<span class="cost ${afford ? '' : 'no'}">${ico('coin', 1)}${price}</span>` : `<span class="req">${ico('lock', 1)} Lab: ${esc(req ? req.name : '?')}</span>`}<span class="own">IN POND: ${counts[sp.id] || 0}</span></div>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-buy]').forEach((el) => el.addEventListener('click', () => {
      if (!game.speciesUnlocked(el.dataset.buy)) { this.game.audio.play('error', { volume: 0.4 }); return; }
      if (game.buyEgg(el.dataset.buy)) this.refreshPanelSoon();
    }));
    body.querySelector('[data-mystery]')?.addEventListener('click', () => { if (game.buyEgg(null, { mystery: true })) this.refreshPanelSoon(); });
  }

  renderBuild() {
    const game = this.game;
    this.setTitle('hammer', 'Build');
    const tabs = this.hud['p-tabs'];
    tabs.innerHTML = BUILD_CATEGORIES.map((c) => `<button class="tab ${this.panelTab === c.id ? 'on' : ''}" data-tab="${c.id}">${c.name}</button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.click(); this.panelTab = b.dataset.tab; this.renderPanel(); }));
    const body = this.hud['p-body'];
    const hasLodge = game.structures.list.some((s) => s.type === 'lodge' && s.built);
    let html = this.panelTab === 'decor' ? `<div class="info">${ico('beauty', 1)} Beauty <b>${game.beauty()}</b>: bills <b>+${game.charmPct()}%</b> (max +${CHARM_CAP}%) and more bears come to dinner.</div>` : '';
    if (this.panelTab === 'food') html += `<div class="info">${ico('berry', 1)} Every bear enjoys side dishes: each serving fills them up, so fewer fish get eaten!</div>`;
    html += '<div class="grid">';
    for (const [type, d] of Object.entries(STRUCTURES)) {
      if (d.category !== this.panelTab) continue;
      const unlocked = game.isStructureUnlocked(type);
      const afford = game.canAfford(d.cost);
      const needsLodge = d.builder === 'beaver' && !hasLodge;
      const req = !unlocked && RESEARCH_BY_ID[UNLOCKS_BUILD[type] || d.unlock];
      html += `<div class="card ${unlocked ? 'clickable' : 'locked'} ${game.tool.kind === 'build' && game.tool.type === type ? 'sel' : ''}" data-build="${type}">
        <div class="top"><span class="iconbox f-slot_gold ${unlocked ? '' : 'sil'}">${ico(d.icon, 2)}</span><div><div class="nm">${unlocked ? esc(d.name) : '???'}</div>${d.builder === 'beaver' ? `<div class="lt">${ico('beaver', 1)} beaver-built</div>` : d.beauty ? `<div class="lt">${ico('beauty', 1)} +${d.beauty} beauty</div>` : ''}</div></div>
        <div class="ds">${unlocked ? esc(d.desc) : 'Classified. Research it in the Lab.'}</div>
        <div class="row">${unlocked ? `<span class="cost ${afford ? '' : 'no'}">${ico('coin', 1)}${d.cost}</span>${needsLodge ? '<span class="req">needs a Beaver Lodge</span>' : ''}` : `<span class="req">${ico('lock', 1)} Lab: ${esc(req ? req.name : '?')}</span>`}<span class="own">BUILT: ${game.structures.countBuilt(type)}</span></div>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-build]').forEach((el) => el.addEventListener('click', () => {
      const type = el.dataset.build;
      if (!game.isStructureUnlocked(type)) { this.game.audio.play('error', { volume: 0.4 }); this.toast('Research it in the Lab first', 'bad'); return; }
      this.click();
      game.setTool({ kind: 'build', type });
      this.closePanel();
    }));
  }

  // fallback / embedded lab tree
  renderLab() {
    const game = this.game;
    this.setTitle('flask', "Reynard's Lab");
    const body = this.hud['p-body'];
    if (C('LabTree')?.LabTree) {
      body.innerHTML = '<div class="labhost"></div>';
      this.labTree = this.makeLabTree(body.firstChild, () => this.closePanel());
      if (this.labTree) return;
    }
    body.innerHTML = `<div class="info">Research: ${game.state.research.length}/${RESEARCH.length}</div><div class="grid">${RESEARCH.map((r) => {
      const done = game.state.research.includes(r.id);
      const ok = r.req.every((q) => game.state.research.includes(q));
      return `<div class="card ${done ? 'sel' : ok ? 'clickable' : 'locked'}" data-r="${r.id}"><div class="top">${ico(ok || done ? r.icon : 'lock', 2)}<div class="nm">${ok || done ? esc(r.name) : '???'}</div></div><div class="ds">${ok || done ? esc(r.desc) : ''}</div><div class="row"><span class="cost">${ico('coin', 1)}${r.cost}</span></div></div>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-r]').forEach((el) => el.addEventListener('click', () => { if (game.research(el.dataset.r)) { this.onResearched(RESEARCH_BY_ID[el.dataset.r]); this.renderPanel(true); } }));
  }

  makeLabTree(host, onClose) {
    const game = this.game;
    const LT = C('LabTree')?.LabTree;
    if (!LT) return null;
    try {
      return new LT(host, {
        research: RESEARCH, branches: BRANCHES,
        isResearched: (id) => game.state.research.includes(id),
        coins: () => game.state.coins,
        canResearch: (id) => game.canResearch(id),
        onResearch: (id) => { const ok = game.research(id); if (ok) this.onResearched(RESEARCH_BY_ID[id]); return ok; },
        icon: (n, s) => ico(n, s),
        preview: (node, cv, t) => this.labPreview(node, cv, t),
        sfx: (n) => game.audio.play(n === 'type' ? 'typing' : n, { volume: n === 'type' ? 0.15 : 0.4 }),
        onClose: () => onClose?.(),
      });
    } catch (e) { console.warn('LabTree failed', e); return null; }
  }

  // animated unlock previews for the lab computer (species: the fish swimming)
  labPreview(node, cv, t) {
    if (!node.species) return false;
    const ctx = cv.getContext('2d');
    const fc = fishCanvasFor(node.species, { frame: Math.floor(t * 6) % 4, scale: 1 });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const s = Math.max(1, Math.floor(Math.min((cv.width * 0.7) / fc.width, (cv.height * 0.55) / fc.height)));
    const w = fc.width * s, hgt = fc.height * s;
    const dir = Math.cos(t * 0.9);
    const x = cv.width / 2 - w / 2 + Math.sin(t * 0.9) * cv.width * 0.12;
    const y = cv.height / 2 - hgt / 2 + Math.sin(t * 2.1) * 3;
    ctx.save();
    if (dir < 0) { ctx.translate(Math.round(x + w), Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(fc, 0, 0, w, hgt); }
    else ctx.drawImage(fc, Math.round(x), Math.round(y), w, hgt);
    ctx.restore();
    ctx.fillStyle = 'rgba(180,255,210,0.7)';
    for (let i = 0; i < 7; i++) {
      const bx = (i * 37 + t * 14) % cv.width, by = cv.height - ((t * 26 + i * 23) % cv.height);
      ctx.fillRect(Math.round(bx), Math.round(by), 2, 2);
    }
    return true;
  }

  onResearched(r) {
    if (!r) return;
    this.toast(`${ico('flask', 1)} Researched <b>${esc(r.name)}</b>!`, 'good');
    for (const b of [].concat(r.build || [])) if (STRUCTURES[b]) this.toast(`New build: <b>${esc(STRUCTURES[b].name)}</b>`, 'good');
    if (r.species) this.toast(`New eggs in the shop: <b>${esc(SPECIES_BY_ID[r.species].name)}</b>`, 'good');
    if (r.id === 'r_beavers') this.tipOnce('lodge', 'Beavers hired! Build a <b>Beaver Lodge</b> in the water next to the shore (Build > Beaver Works). Then place dams and the beavers will build them.', 'greedy');
    if (r.id === 'r_franchise') this.foxSay("FRANCHISE EMPIRE! I'm a legend! You can <b>retire</b> from the menu for permanent golden tails, or keep raking it in.", 'laugh');
  }

  renderDex() {
    const game = this.game;
    const st = game.state;
    this.setTitle('book', 'Fishdex');
    const counts = game.fish.countBySpecies();
    const genetics = st.research.includes('r_genetics');
    const found = SPECIES.filter((s) => st.discovered.includes(s.id)).length;
    const morphsFound = (st.morphsSeen || []).length;
    let html = `<div class="info">Discovered ${found} / ${SPECIES.length} species · ${morphsFound} rare morphs. Cross-breed a ♂ and ♀ of different species to discover hybrids${genetics ? '' : ' (research the Genetics Lab for recipes)'}.</div><div class="grid dex">`;
    for (const sp of SPECIES) {
      const known = st.discovered.includes(sp.id);
      let hint = '';
      if (sp.parents) {
        const [a, b] = sp.parents;
        hint = genetics || known ? `${esc(SPECIES_BY_ID[a].name)} × ${esc(SPECIES_BY_ID[b].name)}` : '??? × ???';
      }
      const rar = RARITIES[sp.tier || 0];
      const morphs = MORPH_IDS.filter((m) => m !== 'normal').map((m) => {
        const seen = (st.morphsSeen || []).includes(`${sp.id}:${m}`);
        return `<span class="mchip ${seen ? '' : 'sil'}" title="${seen ? esc(MORPHS[m].name) : '???'}">${fishImg(sp.id, { morph: m, scale: 1 })}</span>`;
      }).join('');
      html += `<div class="card ${known ? '' : 'unk'}" style="--rar:${rar.color}">
        <div class="top"><span class="fishbox ${known ? '' : 'sil'}">${fishImg(sp.id, { scale: 2 })}</span><div><div class="nm">${known ? esc(sp.name) : '???'}</div><div class="lt">${known ? esc(sp.latin) : sp.parents ? 'Hybrid' : 'Species'}</div></div></div>
        <div class="ds">${known ? esc(sp.desc) : sp.parents ? 'An undiscovered hybrid.' : 'Research it in the Lab.'}</div>
        ${known ? `<div class="morphs">${morphs}</div>` : ''}
        <div class="row">${hint ? `<span class="req">${ico('heart', 1)} ${hint}</span>` : `<span class="rtag" style="background:${rar.color}">${rar.name}</span>`}<span class="own">IN POND: ${counts[sp.id] || 0}</span></div>
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
    tabs.innerHTML = `<button class="tab ${tab === 'reviews' ? 'on' : ''}" data-tab="reviews">${ico('newspaper', 1)} Reviews</button><button class="tab ${tab === 'trophies' ? 'on' : ''}" data-tab="trophies">${ico('trophy', 1)} Trophies ${st.achievements.length}/${ACHIEVEMENTS.length}</button>`;
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
      <div class="ratingrow">${starsHTML(st.rating, 2)} <b>${st.rating.toFixed(2)}</b></div>
      <div class="info center">${st.rating < 1.8 ? '<b class="bad">DANGER: below 1.0 and the pond gets shut down!</b>' : 'Keep your rating above 1.0 or Reynard\'s is shut down.'}</div>`;
    if (!st.reviews.length) html += '<p class="info">No reviews yet. The first customers arrive at 5 PM.</p>';
    for (const r of st.reviews.slice(0, 30)) {
      html += `<div class="rev"><img class="px" src="${this.icons.bear(r.type)}" width="36" height="36" alt=""><div><div class="rt">${starsHTML(r.stars, 1)} ${esc(r.text)}</div><div class="by">${esc(r.name)}, ${esc(r.dept)} · Day ${r.day}${r.weight > 1 ? ` · <b class="warn">counts x${r.weight}</b>` : ''}</div></div></div>`;
    }
    html += '</div>';
    this.hud['p-body'].innerHTML = html;
  }

  // ------------------------------------------------------------ modals
  showModal(html, { dismissable = true, onBind, cls = '' } = {}) {
    const m = this.hud.modal;
    this.hud.fox.style.visibility = 'hidden';
    const card = this.hud['modal-card'];
    card.className = `modal f-parchment ${cls}`;
    card.innerHTML = html;
    m.classList.remove('hidden');
    this.modalDismissable = dismissable;
    if (onBind) onBind(card);
  }

  closeModal() {
    this.hud.fox.style.visibility = '';
    this.hud.modal.classList.add('hidden');
    this.hud['modal-card'].innerHTML = '';
  }

  confirmBox(text, onYes, { yes = 'Yes', no = 'Cancel' } = {}) {
    const html = `<h2 class="center">Are you sure?</h2><p class="center">${text}</p>
      <div class="btns"><button class="btn red" id="cf-yes">${esc(yes)}</button><button class="btn green" id="cf-no">${esc(no)}</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#cf-yes', c).onclick = () => { this.click(); this.closeModal(); onYes(); };
        $('#cf-no', c).onclick = () => { this.click(); this.closeModal(); };
      },
    });
  }

  // end-of-day ledger
  showReport(r, done) {
    const game = this.game;
    const FS = C('FinanceSheet');
    const finish = () => { this.busy = Math.max(0, this.busy - 1); done?.(); };
    this.busy++;
    this.closePanel();
    if (FS?.showFinanceSheet) {
      FS.showFinanceSheet(this.hud['ceremony-root'], r, {
        icon: (n, s) => ico(n, s),
        sfx: (n, o) => game.audio.play(n, { volume: 0.5, ...(o || {}) }),
      }).catch(() => {}).finally(finish);
      return;
    }
    const html = `
      <h1>${esc(r.weekday)} · Day ${r.day}</h1>
      <div class="kv">
        ${r.lines.map((l) => `<span>${ico(l.icon, 1)} ${esc(l.label)}</span><b class="${l.amount >= 0 ? 'good' : 'bad'}">${l.amount >= 0 ? '+' : ''}${fmt(l.amount)}</b>`).join('')}
        <span>Net</span><b>${r.net >= 0 ? '+' : ''}${fmt(r.net)}</b>
        <span>Grade</span><b>${esc(r.grade)}</b>
      </div>
      <p class="center">${esc(r.comment)}</p>
      <div class="btns"><button class="btn green big" id="m-next">Good night ${ico('moon', 1)}</button></div>`;
    this.showModal(html, { dismissable: false, onBind: (c) => { $('#m-next', c).onclick = () => { this.click(); this.closeModal(); finish(); }; } });
  }

  // morning summary
  showOvernight(data, done) {
    const game = this.game;
    const OV = C('Overnight');
    const finish = () => { this.busy = Math.max(0, this.busy - 1); done?.(); };
    this.busy++;
    if (OV?.showOvernight) {
      OV.showOvernight(this.hud['ceremony-root'], data, {
        fishCanvas: (id, o) => fishCanvasFor(id, o || {}),
        icon: (n, s) => ico(n, s),
        sfx: (n, o) => game.audio.play(n, { volume: 0.45, ...(o || {}) }),
      }).catch(() => {}).finally(finish);
      return;
    }
    const html = `<h1>Good morning! · Day ${data.day}</h1>
      <p class="center">${esc(data.quote)}</p>
      <div class="kv">${data.produced.map((p) => `<span>${ico(p.icon, 1)} ${esc(p.label)}</span><b>+${p.amount}</b>`).join('')}<span>${ico('egg', 1)} Hatched overnight</span><b>${data.hatched.length}</b><span>${ico('fish', 1)} Fry grew up</span><b>${data.grew}</b></div>
      <div class="btns"><button class="btn green big" id="m-ok">Start the day ${ico('sun', 1)}</button></div>`;
    this.showModal(html, { dismissable: false, onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); finish(); }; } });
  }

  showDiscovery(sp, f = null) {
    this.foxMood('laugh', 3);
    const html = `
      <h1 class="gold">NEW SPECIES DISCOVERED!</h1>
      <div class="big-icon">${fishImg(sp.id, { morph: f?.g?.morph || 'normal', scale: 5, cls: 'shine' })}</div>
      <h2 class="center">${esc(sp.name)}</h2>
      <p class="center mut"><i>${esc(sp.latin)}</i></p>
      <p class="center">${esc(sp.desc)}</p>
      <div class="kv"><span>Meal size</span><b>${sp.meal}</b><span>Value</span><b>x${sp.value}</b></div>
      ${sp.unlock === 'hybrid' ? `<p class="center">Its eggs are now in the Egg shop for ${ico('coin', 1)}${this.game.speciesPrice(sp.id)}.</p>` : ''}
      <div class="btns"><button class="btn green big" id="m-ok">Heh, lovely!</button></div>`;
    this.showModal(html, { onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); }; } });
    this.banner('NEW BREED', esc(sp.name));
  }

  showGameOver(o) {
    const game = this.game;
    const html = `
      <h1 class="${o.retired ? 'gold' : 'bad'}">${o.retired ? 'RETIRED A LEGEND' : 'CLOSED FOR BUSINESS'}</h1>
      <div class="big-icon"><img class="px" src="${foxPortraitURL(o.retired ? 'laugh' : 'shocked', 4)}" width="128" height="128" alt=""></div>
      <div class="headline">THE BEAR STREET JOURNAL<br>${o.retired ? '"FOX SELLS POND EMPIRE, RETIRES ON A PILE OF COINS"' : '"HEALTH INSPECTORS SHUT DOWN FOX\'S POND AFTER STRING OF 0-STAR REVIEWS"'}</div>
      <div class="kv">
        <span>Days in business</span><b>${o.day}</b>
        <span>Coins earned (total)</span><b class="gold">${fmt(o.earned)}</b>
        <span>Bears served</span><b>${o.stats.bearsServed}</b>
        <span>Fish eaten</span><b>${o.stats.fishEaten}</b>
        <span>Rampages</span><b>${o.stats.rampages}</b>
        <span>Golden fox tails</span><b class="gold">${o.tails}${o.gained ? ` (+${o.gained})` : ''}</b>
      </div>
      <p class="center">Each golden tail permanently adds +10% to every bill in future ponds.</p>
      <div class="btns"><button class="btn green big" id="m-new">Open a new pond</button></div>`;
    this.showModal(html, {
      dismissable: false,
      onBind: (c) => { $('#m-new', c).onclick = () => { this.click(); this.closeModal(); game.newGame(); this.startTutorialIfNew(); }; },
    });
  }

  showBearInfo(b) {
    const d = b.def;
    const wants = b.wants.length ? b.wants.map((w) => `${ico(WANT_INFO[w.kind]?.icon || 'food', 1)} ${WANT_INFO[w.kind]?.name || w.kind} ${w.done ? ico('check', 1) : ''}`).join('<br>') : 'Fish, and maybe a side of berries.';
    const html = `
      <div class="who"><img class="px" src="${this.icons.bear(b.typeId, true)}" width="96" height="96" alt=""><div>
      <h2>${esc(b.name)}</h2><div class="mut">${esc(d.name)} · ${esc(b.dept)}</div></div></div>
      <div class="kv">
        <span>Appetite</span><b>${b.eaten.toFixed(1)} / ${b.appetite} meals</b>
        <span>Patience</span><b>${Math.ceil(b.patience)}s</b>
        <span>Pays</span><b>x${d.pay}</b>
        ${b.prefer ? `<span>Craving</span><b>${esc(SPECIES_BY_ID[b.prefer].name)}</b>` : ''}
        ${d.reviewWeight > 1 ? `<span>Review weight</span><b class="warn">x${d.reviewWeight}</b>` : ''}
      </div>
      <p>${wants}</p>
      ${b.angry ? '<p class="bad"><b>RAMPAGING! Keep it away from your stuff!</b></p>' : ''}
      <div class="btns"><button class="btn" id="m-follow">${ico('camera', 1)} Follow</button><button class="btn green" id="m-ok">OK</button></div>`;
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
    if (d.beauty) extra += `<span>Beauty</span><b>+${d.beauty}</b>`;
    if (d.maxHp < 90 || s.maxHp < 90) extra += `<span>Condition</span><b>${Math.max(0, Math.ceil((s.hp / s.maxHp) * 100))}%</b>`;
    if (!s.built) extra += `<span>Construction</span><b>${Math.floor(s.progress * 100)}%</b>`;
    const html = `
      <div class="who"><span class="iconbox f-slot_gold">${ico(d.icon, 3)}</span><div><h2>${esc(d.name)}</h2><div class="mut">${esc(d.desc)}</div></div></div>
      <div class="kv">${extra}</div>
      <div class="btns">${d.gate ? `<button class="btn" id="m-gate">${s.open ? 'Close gate' : 'Open gate'}</button>` : ''}<button class="btn red" id="m-del">${ico('trash', 1)} Remove (+${Math.floor((s.paid || 0) * 0.5)})</button><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-del', c).onclick = () => { this.closeModal(); this.game.demolishAt(s.x, s.z); };
        const g = $('#m-gate', c);
        if (g) g.onclick = () => { this.game.tapStructure(s); this.closeModal(); };
      },
    });
  }

  showFishInfo(f) {
    const game = this.game;
    const sp = f.sp;
    const g = f.g;
    const rar = RARITIES[Math.max(0, Math.min(4, g.stars - 1))];
    const worth = Math.round(game.fish.coinValue(f) * 7 * game.mods.fishValueMult * game.mods.payMult);
    const chips = [
      `<span class="chip ${g.sex === 'M' ? 'm' : 'f'}">${g.sex === 'M' ? '♂ Male' : '♀ Female'}</span>`,
      `<span class="chip">Size ${sizeLabel(g.size)}</span>`,
      g.morph !== 'normal' ? `<span class="chip shimmer">${esc(MORPHS[g.morph].name)}</span>` : '',
      ...g.traits.map((t) => `<span class="chip ${TRAITS[t].good ? 'good' : 'bad'}" title="${esc(TRAITS[t].desc)}">${esc(TRAITS[t].name)}</span>`),
    ].join('');
    const html = `
      <div class="big-icon">${fishImg(sp.id, { morph: g.morph, scale: 5 })}</div>
      <h2 class="center">${f.name ? `${esc(f.name)} the ` : ''}${esc(sp.name)}${f.adult ? '' : ' (fry)'}</h2>
      <div class="center"><span class="rtag" style="background:${rar.color}">${rar.name}</span> ${'★'.repeat(g.stars)}${'☆'.repeat(5 - g.stars)}</div>
      <div class="chips center">${chips}</div>
      <div class="kv"><span>Hunger</span><b>${hungerWord(f.hunger)}</b><span>Worth to bears</span><b>${ico('coin', 1)}${worth}</b><span>Mood</span><b>${f.state === 'court' ? 'In love' : f.state === 'flee' ? 'Terrified' : f.love > 0.2 ? 'Nurtured' : f.hunger < 0.5 && f.loveT <= 0 ? 'Looking for love' : 'Chill'}</b></div>
      <div class="btns"><button class="btn ${f.tagged ? '' : 'red'}" id="m-tag">${ico('tag', 1)} ${f.tagged ? 'Remove tag' : 'Tag DO NOT EAT'}</button><button class="btn" id="m-pet">${ico('nurture', 1)} Pet</button><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-tag', c).onclick = () => { game.tagFish(f); this.closeModal(); };
        $('#m-pet', c).onclick = () => { game.nurtureFish(f); };
      },
    });
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
        <button class="btn green" id="m-ok">Resume</button>
      </div>
      <p class="center mut small">Golden tails: ${game.legacy.tails} (+${game.legacy.tails * 10}% coins) · Best: day ${game.legacy.best || 0}</p>`;
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
      <p>${ico('food', 1)} <b>Tap the water</b> to toss food. Fed adult fish (a ♂ and a ♀) fall in love, lay eggs and the fry grow up.</p>
      <p>${ico('egg', 1)} Buy <b>eggs</b> in the Egg shop. They hatch in your egg tray with random <b>genes</b>: size, rare colour morphs, traits and a star rating.</p>
      <p>${ico('alarm', 1)} At <b>5 PM</b> the bears get off work, run down the mountain and cannonball into your pond for a feast you can only watch. They eat fish and side dishes (berries, honey, wild rice...), pay and review you.</p>
      <p>${ico('tag', 1)} <b>Tag</b> precious fish "DO NOT EAT", <b>carry</b> fish into safe nurseries, and <b>pet</b> fish for better genes.</p>
      <p>${ico('bolt', 1)} Hungry bears <b>rampage</b>: they smash your stuff and post 0-star reviews. Below a <b>1.0</b> rating you're closed.</p>
      <p>${ico('dam', 1)} Hire <b>beavers</b> (Lab) to build <b>dams</b>, <b>fences</b>, gates and <b>platforms</b>. Fish hide under platforms and lily pads.</p>
      <p>${ico('beauty', 1)} <b>Decor</b> adds beauty: more customers and bigger bills.</p>
      <p>${ico('info', 1)} <b>Controls:</b> drag to pan, scroll/pinch to zoom, <b>Q/E</b> rotate, <b>WASD</b> move, <b>1-9</b> tools, <b>Space</b> pause, <b>B</b> open early, <b>Esc</b> cancel.</p>
      <div class="btns"><button class="btn green" id="m-ok">Let's go</button></div>`;
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
          ${has ? `<button class="btn green big" id="t-cont">${ico('play', 1)} Continue</button>` : ''}
          <button class="btn ${has ? '' : 'green'} big" id="t-new">${has ? 'New pond' : `${ico('play', 1)} Open the pond`}</button>
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

export { esc, fmt, ico, starsHTML, fishImg };
