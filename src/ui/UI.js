// HTML/CSS pixel UI (cozy parchment / wood / green-ribbon theme):
// HUD plaques, the corporate clock, egg tray, toolbar, panels (egg shop,
// build, fishdex, reviews), modals, fox dialogue, toasts, comic speech
// bubbles above bears, cinematic letterbox, night overlay, and hooks for the
// big components (egg hatching, daily ledger, morning summary, lab tree).
import { OFFICE, MEADOW } from '../world/worldgen.js';
const MEADOW_C = { x: (MEADOW.x0 + MEADOW.x1) / 2, z: (MEADOW.z0 + MEADOW.z1) / 2 - 2 };
import * as THREE from 'three';
import { spriteImg, spriteURL, foxPortraitURL, hasSprite } from './sprites.js';
import { createFoxTalk } from './FoxTalk3D.js';
import { openFishScope } from './FishScope.js';
import { Icons3D } from './icons3d.js';
import { fishIconURL, fishCanvasFor } from '../game/fishSprites.js';
import { SPECIES, SPECIES_BY_ID, RARITIES, MORPHS, MORPH_IDS, TRAITS } from '../data/species.js';
import { STRUCTURES, BUILD_CATEGORIES, CHARM_CAP } from '../data/structures.js';
import { RESEARCH, RESEARCH_BY_ID, BRANCHES, UNLOCKS_BUILD, UNLOCKS_SPECIES } from '../data/research.js';
import { ZONE_INFO } from '../data/zones.js';
import { WANT_INFO } from '../data/bears.js';
import { describeLook } from '../entities/bearLook.js'; // [v18 bear looks]
import { ACHIEVEMENTS } from '../data/achievements.js';
import { FOOD_ITEMS, STORAGE, foodUses } from '../data/foods.js';
import { CROPS, STAGE_NAMES, CROP_STAGES } from '../data/crops.js';
import { LAND_BY_ID } from '../data/landAnimals.js';
import { sizeLabel, hatchCard as hatchCardFor, rollGenes as rollGenesFor } from '../game/genes.js';

// optional components (built by separate modules; the UI degrades gracefully)
const comp = import.meta.glob(['./CorpClock.js', './EggHatch.js', './FinanceSheet.js', './LabTree.js', './frames.js', './Hud.js', './FoxNotifier.js', './paper.js', './EBuy.js', './Bubbles.js', './BigClock.js', './DeliveryTracker.js', './VillagerCard.js', './ZoneBanner.js', './Unbox.js', './bagArt.js', './FoodPicker.js', './Encyclopedia.js', './RestaurantMenu.js', './TeacherOverlay.js', './Matchmaker.js', './QuestLog.js'], { eager: true });
import.meta.glob(['./fonts.css', './foodpicker.css', './encyclopedia.css', './restaurantmenu.css', './teacher.css', './classroom.css'], { eager: true });
import { Blueprint } from './Blueprint.js';
import { natureCanvas } from '../art/natureArt.js';
import { BREEDS, KIND_INFO } from '../data/livestock.js';
import { BUG_BY_ID, BUG_FARMS, EFFECTS, BUG_RARITY } from '../data/bugs.js';
import { Transition } from './Transition.js';
import { injectPaperCSS, openPaper, setPaperSfx } from './paper.js';
import { Tutorial } from '../game/Tutorial.js';
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
  { expr: 'greedy', text: 'Buy more fish on <b>e-Buy</b>. Eggs incubate in your <b>egg tray</b>; tap a ready egg to hatch it. Rare eggs hide rare genes!', pulse: 'shop' },
  { expr: 'worried', text: 'Bears eat EVERY fish they can reach. Use the <b>Tag</b> tool on a precious fish: tagged fish are "DO NOT EAT". Plant <b>blueberries</b> too: bears love a side dish!', pulse: 'tag' },
  { expr: 'smug', text: 'Coins buy research in my secret <b>Lab</b> (tap my hut). New fish, beavers, dams, gadgets... Now go make me rich!', pulse: 'lab' },
];

// toolbar: each tool only appears once it's unlocked (game.isOpen(feature))
const TOOLS = [
  { tool: 'feed', icon: 'food', label: 'Food', key: 1, title: 'Food: pick a bag or a harvest, then tap the water / a bowl', feature: 'feed' },
  { tool: 'hand', icon: 'hand', label: 'Carry', key: 2, title: 'Carry a fish', feature: 'hand' },
  { tool: 'tag', icon: 'tag', label: 'Tag', key: 3, title: 'DO NOT EAT tag', feature: 'tag' },
  { tool: 'nurture', icon: 'nurture', label: 'Pet', key: 4, title: 'Pet a fish', feature: 'pet' },
  { panel: 'ebuy', icon: 'shop', label: 'e-Buy', key: 5, title: 'e-Buy', feature: 'ebuy' },
  { panel: 'build', icon: 'hammer', label: 'Build', key: 6, title: 'Build menu', feature: 'build' },
  { tool: 'clear', icon: 'bang', label: 'Destroy', key: 0, title: 'Destroy: drag a box over trees, rocks & weeds for the beavers', feature: 'clear' },
  { panel: 'lab', icon: 'flask', label: 'Lab', key: 7, title: 'Lab', feature: 'lab' },
  { panel: 'match', icon: 'heart', label: 'Match', key: 0, title: 'Matchmaker: pick the parents, breed the perfect fish', feature: 'match' },
  { panel: 'dex', icon: 'book', label: 'Encyclopedia', key: 8, title: 'Encyclopedia', feature: 'dex' },
  { panel: 'reviews', icon: 'trophy', label: 'Restaurant', key: 9, title: 'Chez Reynard: rating, reviews & trophies', feature: 'reviews' },
];
const stripTags = (t) => String(t).replace(/<[^>]+>/g, '');

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
    this.initV3();
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
        <div class="hud-left" id="hudhost">
          <div class="plaque coins f-plaque fallback-hud" id="h-coins" title="Coins">${ico('coin', 2)}<b id="h-coinv">0</b></div>
        </div>
        <div class="bigclock-host" id="clockwrap"></div>
        <div class="hud-right">
          <button class="menubtn" id="b-menu" title="Menu">${ico('menu', 2)}</button>
        </div>
      </div>
      <div class="toolhint hidden f-tooltip" id="toolhint"></div>
      <div class="toolbar f-wood" id="toolbar">
        ${TOOLS.map((t) => `<button class="tool f-slot_gold ${t.tool === 'feed' ? 'active' : ''}" data-feature="${t.feature}" ${t.tool ? `data-tool="${t.tool}"` : `data-panel="${t.panel}"`} title="${esc(t.title)}${t.key ? ` (${t.key})` : ''}">${ico(t.icon, 2)}${t.tool === 'feed' ? '<i class="bag"><b id="bag"></b></i>' : ''}${t.tool === 'tag' ? '<em class="cnt" id="tagcnt"></em>' : ''}</button>`).join('')}
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
    for (const id of ['h-coinv', 'clockwrap', 'hudhost', 'bag', 'tagcnt', 'toolhint', 'panel', 'p-title', 'p-tabs', 'p-body', 'p-coins', 'toasts', 'tip', 'modal', 'modal-card', 'fox', 'fox-face', 'fox-say', 'fox-ok', 'h-coins', 'cineui', 'cinetitle', 'nightui', 'ceremony-root'])
      h[id] = document.getElementById(id);
    $('#toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('.tool');
      if (!b || this.game.inputLocked) return;
      const only = this.game.tutorialOnly;
      if (only && b.dataset.feature !== only) {
        b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
        this.game.audio.play('error', { volume: 0.3 });
        this.notify('Not yet! Follow the teacher!', 'no');
        return;
      }
      this.click();
      if (b.dataset.tool) {
        const cur = this.game.tool.kind;
        this.closePanel();
        this.game.setTool(cur === b.dataset.tool && cur !== 'feed' ? { kind: 'feed' } : { kind: b.dataset.tool });
      } else if (b.dataset.panel) {
        if (b.dataset.panel === 'lab') { if (this.panel === 'lab') this.closePanel(); else this.openLab(); return; }
        if (b.dataset.panel === 'match') { if (this.matchCard) this.closeMatchmaker(); else this.openMatchmaker(); return; }
        if (this.panel === b.dataset.panel) this.closePanel();
        else this.openPanel(b.dataset.panel);
      }
    });
    $('#b-menu').addEventListener('click', () => { this.click(); this.showMenu(); });
    $('#p-close').addEventListener('click', () => { this.closePanel(); this.closeSound(); });
    h['fox-ok'].addEventListener('click', () => { this.click(); this.foxNext(); });
    h.modal.addEventListener('click', (e) => { if (e.target === h.modal && this.modalDismissable) this.closeModal(); });
    const ff = $('#ffbtn');
    const setFF = (v) => { this.game.cine?.toggleFast(v); ff.classList.toggle('on', v); };
    ff.addEventListener('pointerdown', (e) => { e.preventDefault(); setFF(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ff.addEventListener(ev, () => setFF(false));
    $('#nightskip').addEventListener('click', () => { this.click(); this.game.hurryNight(); });
    h.nightui.addEventListener('click', (e) => { if (e.target === h.nightui) this.game.hurryNight(); });
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

  renderSpeed() { /* speed lives on the big clock now */ }

  togglePause() {
    const st = this.game.state;
    st.paused = !st.paused;
  }

  hotkey(n) {
    const t = TOOLS.find((x) => x.key === n);
    if (!t || !this.game.isOpen(t.feature)) return;
    const sel = t.tool ? `[data-tool="${t.tool}"]` : `[data-panel="${t.panel}"]`;
    document.querySelector(`#toolbar ${sel}`)?.click();
  }

  // ------------------------------------------------------------ v3 components
  initV3() {
    const game = this.game;
    try { this.trans = new Transition(); } catch (e) { console.warn('transition', e); }
    try { injectPaperCSS(); setPaperSfx((n, o) => game.audio.play(n, { volume: 0.4, ...(o || {}) })); } catch (e) { console.warn('paper', e); }
    const sfx = (n, o) => game.audio.play(n, { volume: 0.35, ...(o || {}) });
    const icon = (n, sc = 2) => (hasSprite(n) ? ico(n, sc) : '');
    const B = C('Bubbles');
    if (B?.Bubbles) {
      try {
        this.bubbles = new B.Bubbles(this.root, {
          project: (v) => {
            const rig = game.overrideRig || game.rig;
            return rig.worldToScreen(v, game.renderer);
          },
          sfx, icon,
          babble: (voice, text) => game.audio.babble?.(voice === 'moose' || voice === 'beaver' ? 'cub' : voice === 'deer' ? 'fox' : voice, text, { volume: 0.3 }) || 0,
        });
      } catch (e) { console.warn('Bubbles failed', e); }
    }
    const FN = C('FoxNotifier');
    if (FN?.FoxNotifier) {
      try { this.notifier = new FN.FoxNotifier(document.body, { sfx, babble: (t) => game.audio.babble?.('fox', t, { volume: 0.3 }) }); } catch (e) { console.warn('FoxNotifier failed', e); }
      if (this.notifier) this.notifier.holdWhile = () => this.foxTalking();
    }
    const H = C('Hud');
    if (H?.Hud) {
      try {
        this.hudHost = this.hud.hudhost;
        this.hudHost.querySelector('.fallback-hud')?.remove();
        this.hudc = new H.Hud(this.hudHost, { icon, sfx });
      } catch (e) { console.warn('Hud failed', e); this.hudc = null; }
    }
    const BC = C('BigClock');
    if (BC?.BigClock) {
      try { this.clock = new BC.BigClock(this.hud.clockwrap, { onSpeed: (n) => { game.state.paused = false; game.setSpeed(n); }, sfx, icon }); } catch (e) { console.warn('BigClock failed', e); }
    }
    this.blueprint = new Blueprint(this);
    this.pointers = [];
    this.buildCamPad();
    game.on('unlock', () => this.refreshUnlocks());
    game.on('inventory', () => this.blueprint.render());
    game.on('cleared', () => this.blueprint.open && this.blueprint.tab === 'clear' && this.blueprint.render());
    game.on('delivered', (o) => this.onDelivered(o));
    game.on('beavers', () => this.blueprint.render());
    this.refreshUnlocks();
  }

  icon(name, sc = 2) { return hasSprite(name) ? ico(name, sc) : ''; }

  // ------------------------------------------------------------ creature cam
  // the nearest creature under the pointer: bears, beavers, the moose, fish, pond birds
  pickCreature(sx, sy) {
    const game = this.game;
    const cands = [];
    for (const b of game.bears.list) if (b.visible) cands.push({ kind: 'bear', ent: b, y: b.y + 1.1 * b.def.scale, label: b.def.boss ? b.def.name : b.name, zoom: b.def.boss ? 0.03 : 0.02 });
    for (const b of game.beavers.list) cands.push({ kind: 'beaver', ent: b, y: b.y + 0.3, label: 'Beaver', zoom: 0.014 });
    const a = game.delivery.active;
    if (a) cands.push({ kind: 'moose', ent: a, y: a.y + 1, label: 'Moose Express', zoom: 0.022 });
    for (const b of game.ambient?.birds || []) if (b.state !== 'away' && b.state !== 'out') cands.push({ kind: 'songbird', ent: b, y: game.grid.groundAt(b.x, b.z) + b.y + 0.25, label: b.sp, zoom: 0.012 });
    for (const b of game.livestock?.list || []) cands.push({ kind: 'livestock', ent: b, y: b.y + 0.45, label: b.name, zoom: 0.016 });
    for (const a of game.landAnimals?.all() || []) cands.push({ kind: 'land', ent: a, y: a.y + 0.3, label: a.tame ? a.name : LAND_BY_ID[a.sp.id]?.name || 'Critter', zoom: 0.014 });
    for (const v of game.villagers?.list || []) if (v.rig?.root.visible) cands.push({ kind: 'npc', ent: v, y: v.y + 0.9, label: v.name, zoom: 0.02 });
    for (const f of game.fish.list) if (!f.held) cands.push({ kind: 'fish', ent: f, y: f.y, label: f.name || f.sp.name, zoom: 0.013 });
    for (const l of game.ambient.loons || []) if (l.placed && !l.dive) cands.push({ kind: 'bird', ent: l, y: 0, label: l.kind === 'loon' ? 'Loon' : 'Mallard', zoom: 0.014 });
    let best = null, bd = Infinity;
    for (const c of cands) {
      const p = this.screenOf(c.ent.x, c.y, c.ent.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      const r = c.kind === 'fish' || c.kind === 'bird' ? 14 : c.kind === 'songbird' || c.kind === 'land' ? 18 : c.kind === 'beaver' || c.kind === 'livestock' ? 22 : c.kind === 'npc' ? 40 : 34; // small things need a precise tap (feeding stays easy)
      if (d < r * r && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // lock the camera onto something that moves; any manual pan frees it
  trackEntity(ent, { zoom = 0.02, label = '', kind = '' } = {}) {
    const game = this.game;
    const rig = game.rig;
    this.tracking = { ent, label, kind };
    rig.follow = { get x() { return ent.x; }, get z() { return ent.z; } };
    rig.wuppGoal = Math.max(rig.minWupp, Math.min(rig.maxWupp, zoom));
    this.flashTransition?.('zoom');
    if (!this.trackChip) {
      const c = document.createElement('div');
      c.className = 'trackchip';
      c.addEventListener('click', () => this.stopTracking());
      this.root.appendChild(c);
      this.trackChip = c;
    }
    this.trackChip.innerHTML = `${hasSprite('camera') ? ico('camera', 2) : ''}<b>${esc(label)}</b><i>✕</i>`;
    this.trackChip.classList.add('on');
    game.audio.play('click', { volume: 0.35, pitch: 1.3 });
  }

  stopTracking() {
    if (!this.tracking) return;
    if (this.game.rig.follow && !this.game.rig.follow.isBear) this.game.rig.follow = null;
    this.tracking = null;
    this.trackChip?.classList.remove('on');
  }

  updateTracking() {
    const t = this.tracking;
    if (!t) return;
    const rig = this.game.rig;
    const gone = (t.kind === 'bear' && !t.ent.visible) || (t.kind === 'moose' && this.game.delivery.active !== t.ent) || (t.kind === 'fish' && t.ent.dead) || !rig.follow;
    if (gone) { if (rig.follow) rig.follow = null; this.tracking = null; this.trackChip?.classList.remove('on'); }
  }

  // on-screen camera pad: zoom in/out, pan (hold to keep moving), recenter
  buildCamPad() {
    const game = this.game;
    const pad = document.createElement('div');
    pad.className = 'campad';
    const b = (cls, icon, title) => `<button class="cp ${cls}" title="${title}">${hasSprite(icon) ? ico(icon, 2) : ''}</button>`;
    pad.innerHTML = `<div class="cp-zoom">${b('zin', 'zoom_in', 'Zoom in (Z / wheel)')}${b('zout', 'zoom_out', 'Zoom out (X / wheel)')}</div>
      <div class="cp-pan">${b('up', 'arrow_up', 'Pan (WASD)')}${b('left', 'arrow_left', 'Pan')}${b('home', 'home', 'Back to the pond')}${b('right', 'arrow_right', 'Pan')}${b('down', 'arrow_down', 'Pan')}</div>`;
    this.root.appendChild(pad);
    const act = {
      zin: () => game.rig.zoom(0.94), zout: () => game.rig.zoom(1.065),
      up: () => game.rig.panRelative(0.5 * game.rig.wupp / 0.04, 0), down: () => game.rig.panRelative(-0.5 * game.rig.wupp / 0.04, 0),
      left: () => game.rig.panRelative(0, -0.5 * game.rig.wupp / 0.04), right: () => game.rig.panRelative(0, 0.5 * game.rig.wupp / 0.04),
      home: () => { game.rig.lookAt(MEADOW_C.x, MEADOW_C.z); game.rig.wuppGoal = 0.04; },
    };
    for (const btn of pad.querySelectorAll('.cp')) {
      const k = [...btn.classList].find((c) => act[c]);
      let iv = null;
      const stop = () => { clearInterval(iv); iv = null; };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (game.inputLocked) return;
        this.click();
        act[k]();
        if (k !== 'home') iv = setInterval(act[k], 33);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
    }
    this.campad = pad;
  }

  // a click anywhere advances a bubble that's waiting for one
  comp(name) { return C(name); }

  bubbleWaiting() {
    if (this.game.tutorial?.teacher?.waiting) return true;
    const B = this.bubbles;
    if (!B?.busy) return false;
    return (B.list || []).some((b) => b.wait && !b.closing && !b.choices);
  }

  advanceBubble() {
    const B = this.bubbles;
    if (!B?.busy) return false;
    const w = (B.list || []).filter((b) => b.wait && !b.closing && !b.choices);
    if (!w.length) return false;
    B._advance(w[w.length - 1]);
    return true;
  }

  arrowButton(dir = 'left') {
    const B = C('Bubbles');
    if (B?.pixelArrowButton) return B.pixelArrowButton(dir, { size: 2 });
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = dir === 'left' ? '◀' : '▶';
    return b;
  }

  // comic bubble above anything in the world (or a screen point)
  say(anchor, text, opts = {}) {
    if (this.bubbles) return this.bubbles.say(anchor, text, opts);
    this.toastRaw(esc(text));
    return { done: Promise.resolve(), close() {}, setText() {} };
  }

  // is the corner fox's speech bubble still up?
  foxTalking() { return !!this.bubbles?.list?.some((b) => b.key === 'notify' && !b.closing); }

  // Reynard climbs into the corner and tells you something
  notify(text, mood = 'info', { dur } = {}) {
    text = stripTags(text);
    const now = performance.now();
    if (this.lastNote && this.lastNote.text === text && now - this.lastNote.t < 2500) return null;
    this.lastNote = { text, t: now };
    const d = dur || Math.min(6, 2.2 + text.length * 0.05);
    const n = this.notifier;
    // in the lab Reynard is right there on screen: a toast, not the corner fox over the tree
    if (n && this.bubbles && !document.body.classList.contains('lab-mode') && this.panel !== 'lab') {
      n.show({ mood, dur: d + 0.6 }).then?.(() => {});
      n.talk?.(text);
      const bm = mood === 'no' ? 'angry' : mood === 'warn' ? 'scared' : mood === 'happy' || mood === 'excited' ? 'excited' : 'normal';
      return this.bubbles.say(() => n.anchor(), text, { voice: 'fox', mood: bm, dur: d, key: 'notify', size: 's' });
    }
    this.toastRaw(esc(text), mood === 'no' || mood === 'warn' ? 'bad' : '');
    return null;
  }

  // show/hide HUD pieces and tools as the game unlocks them
  refreshUnlocks() {
    const game = this.game;
    for (const b of document.querySelectorAll('#toolbar .tool')) {
      const on = game.isOpen(b.dataset.feature);
      if (on && b.classList.contains('locked')) { b.classList.add('tool-new'); setTimeout(() => b.classList.remove('tool-new'), 900); }
      b.classList.toggle('locked', !on);
    }
    const anyTool = [...document.querySelectorAll('#toolbar .tool')].some((b) => !b.classList.contains('locked'));
    document.getElementById('toolbar')?.classList.toggle('empty', !anyTool);
    this.hud.hudhost?.classList.toggle('locked', !game.isOpen('coins'));
    this.hud.clockwrap?.classList.toggle('locked', !game.isOpen('clock'));
    this.campad?.classList.toggle('locked', !game.isOpen('ebuy'));
    this.clock?.setVisible?.(game.isOpen('clock'));
    this.hudc?.setVisible?.(game.isOpen('coins'), 'coins');
    this.hudc?.setVisible?.(game.isOpen('rating'), 'rating');
  }

  onUnlock(feature, quiet) {
    this.refreshUnlocks();
    if (quiet) return;
    this.game.audio.play('pop_in', { volume: 0.5 });
    const el = feature === 'clock' ? this.hud.clockwrap : feature === 'coins' ? this.hud.hudhost : document.querySelector(`#toolbar [data-feature="${feature}"]`);
    if (el) { el.classList.remove('unlock-pop'); void el.offsetWidth; el.classList.add('unlock-pop'); }
  }

  // pixel transitions: quick flash for camera snaps, full wipe for scene changes
  flashTransition(kind = 'zoom', opts) { try { this.trans?.flash(kind, opts); } catch { /* ignore */ } }
  wipeTransition(kind = 'blocks', mid, opts) {
    if (!this.trans) { mid?.(); return Promise.resolve(); }
    return this.trans.wipe(kind, mid, opts);
  }

  // a bouncing pixel pointer at a tool / the clock / a css selector; returns a remover
  pointAt(target, { cls = '' } = {}) {
    let el = null;
    if (target instanceof Element) el = target;
    else if (target.startsWith('sel:')) el = document.querySelector(target.slice(4));
    else if (target.startsWith('tool:')) {
      const k = target.slice(5);
      el = document.querySelector(`#toolbar [data-panel="${k}"], #toolbar [data-tool="${k}"]`);
    } else if (target === 'clock') el = this.hud.clockwrap;
    if (!el) return () => {};
    const p = document.createElement('div');
    p.className = `pointer-hand ${cls}`;
    p.innerHTML = hasSprite('cursor_hand') ? ico('cursor_hand', 3) : '<b>▼</b>';
    document.body.appendChild(p);
    const sel = typeof target === 'string' && target.startsWith('sel:') ? target.slice(4) : null;
    const place = () => {
      if (sel && !el.isConnected) {
        const n = document.querySelector(sel);
        if (n) { el.classList.remove('pulse'); el = n; el.classList.add('pulse'); }
      }
      const r = el.getBoundingClientRect();
      const up = r.top > window.innerHeight / 2;
      p.classList.toggle('down', up);
      p.style.left = `${r.left + r.width / 2}px`;
      p.style.top = up ? `${r.top - 6}px` : `${r.bottom + 6}px`;
    };
    let raf = 0, alive = true;
    const loop = () => { if (!alive) return; place(); raf = requestAnimationFrame(loop); };
    loop();
    el.classList.add('pulse');
    const rm = () => { alive = false; cancelAnimationFrame(raf); p.remove(); el.classList.remove('pulse'); };
    this.pointers.push(rm);
    return rm;
  }

  onDelivered(o) {
    const game = this.game;
    const eggs = o.items.filter((it) => it.kind === 'egg').length;
    const items = o.items.filter((it) => it.kind === 'item');
    if (eggs) this.notify(eggs > 1 ? `${eggs} eggs! I'll carry them to the pond.` : 'An egg! I\'ll take it to the pond.', 'happy');
    else if (items.length) {
      const d = STRUCTURES[items[0].type];
      this.notify(`${d ? d.name : 'Package'}! It's in Build ▸ Parcels.`, 'excited');
    }
    this.blueprint.render();
  }

  // a bought egg hatched: brag above the spot
  onFishHatched(f, rarity) {
    const mu = f.g.mut ? ` ${f.g.mut === 'doublehot' ? 'DOUBLE HOT' : f.g.mut.toUpperCase()}` : '';
    const morph = f.g.morph !== 'normal' ? ` ${MORPHS[f.g.morph].name}` : '';
    const label = `${['', '', 'Rare!', 'EPIC!', 'LEGENDARY!!'][rarity]}${mu}${morph} ${f.sp.name}`.trim();
    const mood = rarity >= 3 ? 'shout' : rarity >= 2 || mu ? 'excited' : 'happy';
    this.say({ getWorldPos: (v) => v.set(f.x, 0.9, f.z) }, label, { mood, dur: 3.2, size: rarity >= 3 ? 'l' : 'm', key: 'hatch' + f.id });
  }

  onLandmark(L, perk) {
    this.notify(`${L.name}! ${perk?.line || ''}`, 'excited', { dur: 6 });
    this.game.rig.lookAt(L.x + L.w / 2, L.z + L.d / 2);
  }

  openEBuy(focus = null) {
    const game = this.game;
    focus = focus || this.ebuyFocus || null;
    const E = C('EBuy');
    if (!E?.openEBuy || this.ebuy) return;
    const host = document.createElement('div');
    host.className = 'ebuy-host';
    this.root.appendChild(host);
    const listings = () => game.ebuyListings().map((l) => ({ ...l, image: this.listingImage(l) }));
    this.ebuy = E.openEBuy(host, {
      listings: listings(), coins: game.state.coins, focus,
      icon: (n, sc) => (hasSprite(n) ? ico(n, sc) : ''),
      sfx: (n) => game.audio.play(n, { volume: 0.35 }),
      onBuy: (l, qty) => {
        const ok = game.ebuyBuy(l, qty);
        setTimeout(() => this.ebuy?.refresh({ coins: game.state.coins, listings: listings() }), 50);
        // order placed: show the receipt for a moment, then back to the pond
        if (ok) { clearTimeout(this.ebuyExitT); this.ebuyExitT = setTimeout(() => this.closeEBuy(), 2600); }
        return ok;
      },
      onClose: () => this.closeEBuy(),
    });
    this.ebuyHost = host;
    document.body.classList.add('ebuy-open');
    game.audio.play('crt_on', { volume: 0.35 });
    this.flashTransition('iris', { dur: 0.36, color: '#1a1420', peak: 0.6 });
    // tutorial: once the listing is open, the hand points right at Buy It Now
    if (focus && game.tutorialOnly) {
      clearTimeout(this.ebuyPtrT);
      this.ebuyPtrT = setTimeout(() => {
        if (this.ebuy && host.querySelector('.eb-buy')) this.ebuyPtr = this.pointAt('sel:.ebuy-host .eb-buy', { cls: 'ebuy-ptr' });
      }, 900);
    }
  }

  closeEBuy() {
    clearTimeout(this.ebuyExitT);
    clearTimeout(this.ebuyPtrT);
    this.ebuyPtr?.(); this.ebuyPtr = null;
    document.body.classList.remove('ebuy-open');
    if (this.ebuy) this.game.audio.play('crt_off', { volume: 0.3 });
    this.ebuy?.close?.();
    this.ebuy = null;
    this.ebuyHost?.remove();
    this.ebuyHost = null;
  }

  listingImage(l) {
    const key = l.kind === 'egg' || l.kind === 'fish' ? `fish:${l.species}:${l.genes?.morph || 'normal'}` : l.kind === 'bird' ? `bird:${l.breed}` : l.kind === 'food' ? `food:${l.foodId}` : `st:${l.type}`;
    (this._limg ||= new Map());
    if (this._limg.has(key)) return this._limg.get(key);
    let img = null;
    try {
      if (l.kind === 'egg' || l.kind === 'fish') img = fishCanvasFor(l.species, { morph: l.genes?.morph || 'normal', scale: 3 });
      else if (l.kind === 'food') {
        const BA = C('bagArt');
        const F = FOOD_ITEMS[l.foodId];
        if (F?.kind === 'bag' && BA?.bagCanvas) img = BA.bagCanvas(l.foodId, { scale: 2 }).toDataURL();
        else if (BA?.produceCanvas) img = BA.produceCanvas(l.foodId, 3).toDataURL();
        else if (hasSprite(F?.icon || 'food')) img = spriteURL(F?.icon || 'food', 4);
      }
      else if (l.kind === 'bird') {
        const goose = BREEDS[l.breed]?.kind === 'goose';
        img = natureCanvas(goose ? 'goose_swim' : 'mallard_swim', 0, 5).toDataURL();
      } else {
        const html = this.blueprint.icon(l.type);
        const m = html.match(/src="([^"]+)"/);
        img = m ? m[1] : null;
      }
    } catch { img = null; }
    this._limg.set(key, img);
    return img;
  }

  clockSections() {
    const g = this.game;
    if (g.isDayOff()) return [{ from: 0, to: 24, kind: 'off' }];
    const bears = !(g.wave && g.wave.buildDay);
    const out = [{ from: 21, to: 9, kind: 'night' }, { from: 9, to: 12, kind: 'work' }];
    out.push({ from: 12, to: 13, kind: g.lunch?.length ? 'lunch' : 'work' });
    out.push({ from: 13, to: 17, kind: 'work' });
    out.push({ from: 17, to: 21, kind: bears ? 'rush' : 'off' });
    return out;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.contract?.place?.();
    const game = this.game;
    const st = game.state;
    const h = this.hud;
    const target = st.coins;
    if (Math.abs(this.dispCoins - target) < 0.5) this.dispCoins = target;
    else this.dispCoins += (target - this.dispCoins) * Math.min(1, dt * 8);
    if (this.hudc) this.hudc.set({ coins: Math.round(st.coins), rating: game.isOpen('rating') ? st.rating : null, charm: game.charmPct() });
    else this.setText('h-coinv', fmt(Math.round(this.dispCoins)));
    // while the corner fox talks, he and his bubble sit above any open panel
    const talk = this.foxTalking();
    if (talk !== this._fnTalk) { this._fnTalk = talk; document.body.classList.toggle('fn-talk', talk); }
    const labp = this.panel === 'lab';
    if (labp !== this._labp) { this._labp = labp; document.body.classList.toggle('lab-panel', labp); }
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) {
      this.hudT = 0.5;
      this.setText('tagcnt', `${game.tagLimit() - game.tagsUsed()}`);
      Tutorial.progress(game);
      this.syncFoodPicker();
      if (this.contract && game.tool.kind !== 'clear') this.closeContract?.();
      // the quest note steps aside for cutscenes, the lab and the classroom
      // the corner fox steps aside while the big quest notebook is open
      document.body.classList.toggle('qn-open', !!this.questLog?.isOpen || !!game.workshop?.view);
      this.questLog?.setVisible?.(!game.cutscene?.active && !game.lab?.active && !game.classroom?.active && !game.bedtime?.active && !game.tutorial?.active && !this.matchCard && st.phase !== 'night');
    }
    if (this.clock) {
      try { this.clock.update(dt, { hour: st.hour, phase: st.phase, day: st.day, weekday: game.weekday(), speed: st.speed, paused: st.paused, sections: this.clockSections() }); } catch { /* ignore */ }
    }
    const sel = game.foodStore.selected;
    const bw = `${Math.round(Math.min(1, game.foodStore.count(sel) / (FOOD_ITEMS[sel]?.scoops || 12)) * 100)}%`;
    if (h.bag && h.bag.style.width !== bw) h.bag.style.width = bw;
    this.updateSays(dt);
    this.bubbles?.update(dt);
    this.notifier?.update?.(dt);
    this.blueprint.update(dt);
    this.updateFloaters(dt);
    this.updateTracking();
    this.updateEggTags();
    this.updateGhost();
    this.updateDeliveryTracker(dt);
    this.updateNestTags();
    this.updateParcelTags();
    this.updateCropTags();
    const night = st.phase === 'night' && !game.cutscene?.active && !game.bedtime?.active && !game.overnight?.simulated;
    if (night !== this.lastNight) { this.lastNight = night; h.nightui.classList.toggle('hidden', !night); }
    this.tipT -= dt;
  }

  // the Moose Express tags under the coins: packing -> on the road -> delivered, with a countdown
  updateDeliveryTracker(dt) {
    const game = this.game;
    this.trackerT = (this.trackerT || 0) - dt;
    if (this.trackerT > 0) return;
    this.trackerT = 0.25;
    const DT = C('DeliveryTracker');
    if (!DT?.DeliveryTracker || !game.isOpen('ebuy')) return;
    if (!this.dtracker) {
      try {
        this.dtracker = new DT.DeliveryTracker(this.root, {
          icon: (n, sc) => (hasSprite(n) ? ico(n, sc) : ''),
          sfx: (n, o) => game.audio.play(n, { volume: 0.3, ...(o || {}) }),
          onClick: (id) => this.onTrackerClick(id),
        });
      } catch (e) { console.warn('DeliveryTracker', e); this.dtracker = null; return; }
    }
    try { this.dtracker.update(game.delivery.tracker()); } catch (e) { console.warn(e); }
  }

  onTrackerClick(id) {
    const game = this.game;
    const a = game.delivery.active;
    if (a && a.orders.some((o) => o.id === id)) { this.trackEntity(a, { label: 'Moose Express', kind: 'moose', zoom: 0.024 }); return; }
    const o = game.delivery.queue.find((q) => q.id === id);
    if (o) {
      const eta = game.delivery.tracker().find((t) => t.id === id)?.eta ?? -1;
      this.notify(eta < 0 ? 'Packed! Moose rides at sunrise.' : `Still packing! ~${Math.ceil(eta)}s`, 'happy');
      return;
    }
    const d = game.delivery.dropPoint;
    game.rig.lookAt(d.x, d.z);
  }

  updateClock() {}

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
      if (!e) { html += `<div class="eslot empty f-slot_gold" title="Buy eggs on e-Buy">${ico('egg', 2, 'ghost')}</div>`; continue; }
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

  // pond eggs: a little paper tag above each bought egg with its timer
  updateEggTags() {
    const game = this.game;
    const eggs = game.fish.eggs;
    (this.eggTags ||= new Map());
    for (const [e, el] of this.eggTags) if (!eggs.includes(e)) { el.remove(); this.eggTags.delete(e); }
    for (const e of eggs) {
      let el = this.eggTags.get(e);
      if (!el) {
        el = document.createElement('div');
        el.className = 'eggtag';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.tapPondEgg(e); });
        this.overlay.appendChild(el);
        this.eggTags.set(e, el);
      }
      const p = e.tank ? this.screenOf(e.tank.x + 0.5, (game.structures.baseY?.(e.tank) || 0) + 1.15, e.tank.z + 0.5) : this.screenOf(e.x, 0.45, e.z);
      el.style.display = p.visible === false || game.lab?.active ? 'none' : '';
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      // stages: laid (waiting for dad) -> fertilizing -> incubating timer -> TAP!
      const mm = (t) => `${Math.floor(t / 60)}:${String(Math.ceil(t) % 60).padStart(2, '0')}`;
      const stage = e.ready ? 'ready' : e.stage === 'laid' ? (e.fertP > 0 ? 'fert' : 'laid') : 'inc';
      const txt = stage === 'ready' ? 'TAP!' : stage === 'laid' ? 'Laid ♡' : stage === 'fert' ? `Fertilizing ${Math.round((e.fertP / 6) * 100)}%` : mm(e.t);
      if (el.dataset.t !== txt) {
        el.dataset.t = txt;
        el.innerHTML = `${hasSprite('egg') ? ico('egg', 1) : ''}<b>${txt}</b>${e.count > 1 ? `<i>×${e.count}</i>` : ''}`;
        el.classList.toggle('ready', stage === 'ready');
        el.classList.toggle('laid', stage === 'laid' || stage === 'fert');
        const best = Math.max(...(e.genes || [{ stars: 1 }]).map((g) => g?.stars || 1));
        el.style.setProperty('--rc', RARITIES[e.rarity ?? Math.max(0, Math.min(4, best - 1))].color);
      }
    }
  }

  pickPondEgg(sx, sy) {
    let best = null, bd = 26 * 26;
    for (const e of this.game.fish.eggs) {
      if (e.tank) continue;
      const p = this.screenOf(e.x, e.y, e.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // tap a pond egg: not ready -> how long; ready -> the hatch ceremony, then the fish swims out
  tapPondEgg(e) {
    const game = this.game;
    if (this.busy || game.inputLocked) return;
    if (!e.ready) {
      this.click();
      const line = e.stage === 'laid' ? (e.fertP > 0 ? 'Dad is fertilizing them...' : 'Waiting for dad to fertilize!') : `${Math.ceil(e.t)}s more!`;
      this.say({ getWorldPos: (v) => (e.tank ? v.set(e.tank.x + 0.5, 1.3, e.tank.z + 0.5) : v.set(e.x, 0.5, e.z)) }, line, { dur: 1.6, key: 'eggt', size: 's' });
      return;
    }
    const sp = SPECIES_BY_ID[e.species];
    const st = game.state;
    const genes = (e.genes || []).filter(Boolean).slice(0, Math.max(1, e.count || 1));
    // one card per fish that will come out (old saves may be missing some genes)
    while (genes.length < Math.max(1, e.count || 1)) genes.push(rollGenesFor(e.species, game.mods));
    const cards = genes.map((g) => hatchCardFor(e.species, g, { isNewSpecies: !st.discovered.includes(e.species), isNewMorph: g.morph !== 'normal' && !st.morphsSeen.includes(`${e.species}:${g.morph}`), value: Math.round(sp.meal * sp.value * 7) }));
    e.genes = genes;
    const card = cards[0];
    this.busy++;
    const EH = C('EggHatch');
    const finish = () => {
      this.busy = Math.max(0, this.busy - 1);
      const born = game.fish.hatchNow(e);
      if (e.tank) game.tanks?.adopt(born, e.tank);
      if (born[0]) { game.rig.lookAt(born[0].x, born[0].z); if (!born[0].tank) game.particles.splash(born[0].x, born[0].z, 10, 0.8); }
      game.emit('eggHatched', born[0] || null);
    };
    if (EH?.playEggHatch) {
      const wasPaused = st.paused;
      st.paused = true;
      EH.playEggHatch(this.hud['ceremony-root'], cards.length ? cards : [card], { fishCanvas: (id, o) => fishCanvasFor(id, o || {}), icon: (n, sc) => ico(n, sc), sfx: (n, o) => game.audio.play(n, { volume: 0.5, ...(o || {}) }), rarities: RARITIES })
        .catch(() => {}).finally(() => { st.paused = wasPaused; finish(); });
    } else finish();
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
    if (this.bubbles) { this.bubbles.clear((x) => x.key === 'bear' + b.id); this.says.delete(b.id); return; }
    const s = this.says.get(b.id);
    if (s) { s.el.remove(); this.says.delete(b.id); }
  }

  bearAnchor(b) {
    return { getWorldPos: (v) => (b.visible ? v.set(b.x, b.y + 2.25 * b.def.scale + 0.25, b.z) : v.set(0, -999, 0)) };
  }

  bearSay(b, { text = null, emote = null, item = null, dur = 2.2 } = {}) {
    if (!this.bubbles) return;
    const mood = emote === 'emo_anger' || b.angry ? 'angry' : emote === 'emo_sweat' ? 'scared' : emote === 'emo_heart' || emote === 'emo_drool' ? 'happy' : b.def.boss ? 'shout' : 'normal';
    const voice = text ? (b.def.boss ? 'ceo' : b.def.scale < 0.7 ? 'cub' : 'bear') : null;
    const h = this.bubbles.say(this.bearAnchor(b), text || '', { emote: hasSprite(emote) ? emote : null, item: hasSprite(item) ? item : null, dur: dur + (text ? text.length * 0.03 : 0), voice, mood, key: 'bear' + b.id, size: text ? 's' : 's' });
    this.says.set(b.id, { t: dur, h });
  }

  updateSays(dt) {
    for (const [id, s] of this.says) { s.t -= dt; if (s.t <= -1) this.says.delete(id); }
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
    let tx, ty;
    if (this.hudc?.coinTarget) ({ x: tx, y: ty } = this.hudc.coinTarget());
    else { const target = (this.hud['h-coins'] || this.hud.hudhost).getBoundingClientRect(); tx = target.left + 18; ty = target.top + target.height / 2; }
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
  // old-style toasts now come from Reynard in the corner
  toast(text, kind = '') {
    if (this.notifier && this.bubbles) { this.notify(text, kind === 'bad' ? 'no' : kind === 'gold' ? 'excited' : 'info'); return; }
    this.toastRaw(text, kind);
  }

  toastRaw(text, kind = '') {
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
    const mood = ['worried', 'shocked', 'angry'].includes(expr) ? 'warn' : ['laugh', 'greedy', 'excited'].includes(expr) ? 'excited' : 'info';
    this.notify(text, mood, { dur: Math.min(7, 2.5 + stripTags(text).length * 0.045) });
  }

  foxBubble(text) {
    const f = this.game.fox;
    this.say({ getWorldPos: (v) => v.set(f.x, f.y + 1.75, f.z) }, text, { voice: 'fox', dur: 2.2, key: 'fox' });
  }

  foxNext() {
    const cur = this.foxCurrent;
    if (cur?.onOk) cur.onOk();
    this.foxCurrent = this.foxQueue.shift() || null;
    const el = this.hud.fox;
    if (!this.foxCurrent) { el.classList.add('hidden'); this.pulse(null); return; }
    const m = this.foxCurrent;
    this.hud['fox-face'].src = foxPortraitURL(m.expr || 'smug', 3);
    const ft = this._foxTalk3D();
    this.hud['fox-say'].innerHTML = m.text;
    this.hud['fox-ok'].textContent = m.button || (m.wait ? 'Got it' : 'OK');
    this.hud['fox-ok'].classList.toggle('hidden', !!m.hideOk);
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.pulse(m.pulse || null);
    this.foxAutoT = m.auto ? m.auto : 0;
    const plain = m.text.replace(/<[^>]+>/g, '');
    this.game.audio.babble?.('fox', plain.slice(0, 90), { volume: 0.3 });
    if (ft) { ft.setOutfit(this.game.fox?.rig?.outfit || 'default'); ft.setExpression(m.expr || 'smug'); ft.talk(plain.slice(0, 90)); }
  }

  // live 3D talking bust in place of the pixel portrait (kept as the fallback without WebGL)
  _foxTalk3D() {
    const img = this.hud['fox-face'];
    if (this._ftk === undefined) {
      const host = (this._ftkHost = document.createElement('div'));
      host.className = 'fox-3d';
      Object.assign(host.style, { flex: '0 0 auto', filter: 'drop-shadow(0 3px 0 rgba(0,0,0,.4))', pointerEvents: 'none' });
      img.before(host);
      this._ftk = createFoxTalk(host, { outfit: this.game.fox?.rig?.outfit || 'default', game: this.game });
      if (this._ftk) img.style.display = 'none';
      else host.remove();
    }
    if (this._ftk) {
      // same box as the <img> (96px, 72px on phones), read from the stylesheet
      const px = (parseFloat(getComputedStyle(img).width) || 96) + 'px';
      if (this._ftkHost.style.width !== px) Object.assign(this._ftkHost.style, { width: px, height: px });
    }
    return this._ftk;
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
    const game = this.game;
    if (game.state.tutorialDone || game.skipTutorial) { this.refreshUnlocks(); return; }
    game.tutorial = new Tutorial(game);
    game.tutorial.run().catch((e) => { console.warn('tutorial failed', e); game.skipTutorial = true; game.tutorialHold = false; this.refreshUnlocks(); });
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
    try {
      const sub = this.game.bearEvents?.dayCardSub() || (this.game.isDayOff() ? 'Sunday · no bears' : st.day === 1 ? 'Build day' : (this.game.wave?.bears?.some((b) => b.boss) ? 'BOSS BEAR!' : `${this.game.wave?.bears?.length || 0} bears booked`)); // [v18 bear events] boss / blood moon day card
      if (!this.game.tutorialOnly && (st.tutorialDone || this.game.skipTutorial || st.day > 1)) this.trans?.dayCard(`Day ${st.day}`, sub);
    } catch { /* ignore */ }
    if (st.day > 1 && this.game.fish.count < 3 && !this.game.isDayOff()) this.foxSay('Pond\'s empty! Buy eggs on e-Buy!', 'worried');
    if (this.game.isDayOff() && !this.game.bearEvents?.moon.isBloodDay(st.day)) this.tipOnce('sunday', // [v18 bear events] (blood-moon Sundays aren't quiet)
      'Sunday! No bears today.', 'sleepy');
    if (st.day === 2) this.tipOnce('day2', 'Bears come at 5 today! Berries = fewer fish eaten.', 'greedy');
    if (st.day === 2) setTimeout(() => this.tipOnce('ducks', 'Ducks & geese on e-Buy ▸ Farm! They lay eggs and eat bugs.', 'excited'), 9000);
    if (st.day === 4) this.tipOnce('beauty', 'Pretty pond = more bears. Decorate!', 'smug');
  }

  onRushStart() {
    this.closePanel();
    this.closeModal();
    this.blueprint?.exit();
    this.closeEBuy();
  }

  onRampage(b) {
    this.foxMood('shocked', 2.5);
    this.notify(`${b.def.boss ? b.def.name : b.name} is RAMPAGING!`, 'warn');
  }

  onBedtime() {}

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
      rig.lookAt(OFFICE.x, 14);
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
    } else if (t.kind === 'clear') {
      html = ''; // the beaver tool speaks for itself (red marks + construction tape)
    } else if (t.kind === 'land') {
      html = `${ico('map', 1)} <b>Land</b>: tap a <b>FOR SALE</b> plot next to yours to buy it`;
    } else if (t.kind === 'remove') {
      html = `${ico('trash', 1)} <b>Remove</b>: tap a build for move · store · sell, hold to drag it, or clear a tree/rock (${ico('coin', 1)}10)`; // [v19 buildings]
    } else if (t.kind === 'hand') {
      html = `${ico('hand', 1)} <b>Carry</b>: drag a fish anywhere in the pond`;
    } else if (t.kind === 'tag') {
      html = `${ico('tag', 1)} <b>DO NOT EAT</b>: tap a fish to tag it. Bears won't touch tagged fish. <span class="k">${g.tagLimit() - g.tagsUsed()} / ${g.tagLimit()} left</span>`;
    } else if (t.kind === 'nurture') {
      html = `${ico('nurture', 1)} <b>Pet</b>: tap or hold a fish. Petted fish grow faster and breed sooner`;
    }
    if (this.blueprint?.open || t.kind === 'hand' || t.kind === 'nurture' || t.kind === 'tag') html = '';
    hint.innerHTML = html + (html ? ' <button class="btn small green" id="th-x">✕</button>' : '');
    hint.classList.toggle('hidden', !html);
    const x = $('#th-x', hint);
    if (x) x.onclick = () => { this.click(); this.game.setTool({ kind: 'feed' }); };
    if (!['feed', 'hand', 'tag', 'nurture'].includes(t.kind)) this.hud.tip.classList.add('hidden');
    this.syncFoodPicker();
    this.game.land?.showOverlay(t.kind === 'land');
    if (t.kind === 'land') { const r = this.game.rig; r.wuppGoal = Math.max(r.wuppGoal, 0.05); }
  }

  // ------------------------------------------------------------ food
  // the food shelf over the toolbar while the Food tool is active
  syncFoodPicker() {
    const game = this.game;
    const only = game.tutorialOnly;
    const show = game.tool.kind === 'feed' && game.isOpen('feed') && !game.inputLocked && !this.blueprint?.open && !this.ebuy && !game.lab?.active
      && !this.book?.isOpen && !this.menu?.isOpen && this.panel !== 'lab' && (!only || only === 'feed');
    if (this.foodPicker && show === this.pickerShown) { if (show && this.foodPicker.selectedId !== game.foodStore.selected) { this.foodPicker.setSelected?.(game.foodStore.selected); this.foodPicker.selectedId = game.foodStore.selected; } return; }
    this.pickerShown = show;
    const FP = C('FoodPicker')?.FoodPicker;
    if (!FP) return;
    if (!this.foodPicker && show) {
      try {
        this.foodPicker = new FP({
          root: this.root,
          getItems: () => game.foodStore.items(),
          selected: game.foodStore.selected,
          onSelect: (id) => { game.foodStore.select(id); game.emit('foodPicked', id); },
          onBuy: (id) => this.buyFood(id),
          sfx: (n, o) => game.audio.play(n, { volume: 0.4, ...(o || {}) }),
          icon: (n, sc) => (hasSprite(n) ? ico(n, sc) : ''),
        });
      } catch (e) { console.warn('FoodPicker failed', e); this.foodPicker = null; return; }
    }
    if (!this.foodPicker) return;
    if (show) { this.foodPicker.setSelected?.(game.foodStore.selected); this.foodPicker.refresh?.(); this.foodPicker.show(); }
    else this.foodPicker.hide();
  }

  // buy a land plot (after a little paper deed)
  confirmLand(I) {
    const game = this.game;
    const can = game.state.coins >= I.price;
    const html = `
      <h2 class="center">${ico('map', 2)} Land for sale</h2>
      <p class="center">An ${I.n}-tile plot next to your land.${I.forest ? ` <b>${I.forest}</b> tiles of trees: send the beavers!` : ''}</p>
      <div class="kv"><span>Price</span><b>${ico('coin', 1)}${I.price}</b><span>You have</span><b>${ico('coin', 1)}${Math.floor(game.state.coins)}</b></div>
      <div class="btns"><button class="btn ${can ? 'green' : ''}" id="m-buy" ${can ? '' : 'disabled'}>${ico('coin', 1)} Buy it!</button><button class="btn" id="m-no">Not now</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-no', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-buy', c).onclick = () => { this.closeModal(); game.land.buy(I.px, I.pz); };
      },
    });
  }

  // e-Buy straight to that bag (or the food aisle)
  buyFood(id) {
    const F = FOOD_ITEMS[id];
    this.ebuyFocus = F?.kind === 'bag' ? 'food_' + id : null;
    this.closePanel();
    if (!this.ebuy) this.openEBuy(F?.kind === 'bag' ? 'food_' + id : null);
    this.ebuyFocus = null;
  }

  onFoodEmpty(id) {
    const F = FOOD_ITEMS[id];
    this.game.notify(F?.kind === 'bag' ? `${F.name} bag is empty! Buy more on e-Buy (or wait for a free refill).` : `Out of ${F?.name || 'that'}!`, 'no');
    this.foodPicker?.refresh?.();
  }

  // a harvest (or grinder / delivery) lands in the food bag: juicy popup
  onHarvest(s, items) {
    const game = this.game;
    const y = game.structures.baseY(s) + 0.6;
    const q = this.screenOf(s.x + 0.5, y, s.z + 0.5);
    const FP = C('FoodPicker');
    const to = document.querySelector('#toolbar .tool[data-tool="feed"]') || null;
    if (FP?.harvestPopup) {
      try { FP.harvestPopup({ root: this.root, items, from: { x: q.x, y: q.y }, to, sfx: (n, o) => game.audio.play(n, { volume: 0.5, ...(o || {}) }) }); } catch (e) { console.warn('harvestPopup', e); }
    } else {
      for (const it of items) this.floatTextAt(s.x + 0.5, y + 0.5, s.z + 0.5, `+${it.count} ${FOOD_ITEMS[it.id]?.name || it.id}`, RARITIES[it.rarity || 0]?.glow || '#fff3a0');
    }
    if (!FP?.harvestPopup && items.some((it) => it.special)) {
      const sp = items.find((it) => it.special);
      this.notify(`SPECIAL FIND! ${FOOD_ITEMS[sp.id]?.name}!`, 'happy');
    }
    this.foodPicker?.refresh?.();
  }

  // ripe plants show their batch: produce icon, count, rarity (tap to harvest)
  updateCropTags() {
    const game = this.game;
    const list = game.harvest.ripeList();
    (this.cropTags ||= new Map());
    for (const [s, el] of this.cropTags) if (!list.includes(s)) { el.remove(); this.cropTags.delete(s); }
    const hide = game.lab?.active || game.cine?.active || game.overrideScene;
    for (const s of list) {
      const b = s.crop.batch;
      if (!b) continue;
      let el = this.cropTags.get(s);
      const key = `${b.r}:${b.n}:${b.special || ''}`;
      if (!el) {
        el = document.createElement('div');
        el.className = 'eggtag ready croptag';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.game.harvest.harvest(s); });
        this.overlay.appendChild(el);
        this.cropTags.set(s, el);
      }
      if (el.dataset.k !== key) {
        el.dataset.k = key;
        const C2 = CROPS[s.type];
        const F = FOOD_ITEMS[C2.item];
        const rar = RARITIES[b.r];
        el.style.setProperty('--rar', rar.color);
        el.style.setProperty('--glow', rar.glow);
        el.classList.toggle('rare', b.r >= 2);
        el.innerHTML = `${hasSprite(F?.icon) ? ico(F.icon, 1) : ''}<b>×${b.n}</b>${b.special ? `<i class="sp">${hasSprite(FOOD_ITEMS[b.special]?.icon) ? ico(FOOD_ITEMS[b.special].icon, 1) : '★'}</i>` : ''}`;
        el.title = `${rar.name} batch: ${b.n} ${F?.name || ''}${b.special ? ' + ' + FOOD_ITEMS[b.special].name : ''} (tap to harvest)`;
      }
      const q = this.screenOf(s.x + 0.5, game.structures.baseY(s) + 0.95, s.z + 0.5);
      el.style.display = q.visible === false || hide ? 'none' : '';
      el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
    }
  }

  showCropCard(s) {
    const game = this.game;
    const C2 = CROPS[s.type];
    const F = FOOD_ITEMS[C2.item];
    const c = s.crop || { stage: 0 };
    const stage = CROP_STAGES[c.stage];
    const left = Math.ceil(game.harvest.secondsLeft(s));
    const pct = Math.round(game.harvest.progress(s) * 100);
    const boost = game.harvest.boosts.get(s.id) || 1;
    const sp = C2.special && FOOD_ITEMS[C2.special];
    const stages = CROP_STAGES.map((k, i) => `<span class="chip ${i === c.stage ? 'good' : i < c.stage ? '' : 'dim'}">${i < c.stage ? '✓ ' : ''}${STAGE_NAMES[k]}</span>`).join(C2.noSeed ? '' : '<b>›</b>');
    const html = `
      <h2 class="center">${hasSprite(s.def.icon) ? ico(s.def.icon, 2) : ''} ${esc(s.def.name)}</h2>
      <div class="chips center">${C2.noSeed ? `<span class="chip ${c.stage === 3 ? 'good' : ''}">${c.stage === 3 ? 'Ready!' : 'Filling up'}</span>` : stages}</div>
      <div class="growbar"><i style="width:${pct}%"></i></div>
      <div class="kv"><span>Status</span><b>${stage === 'ripe' ? 'Ready to harvest!' : `${STAGE_NAMES[stage]} · ready in ${left}s`}</b><span>Gives</span><b>${hasSprite(F.icon) ? ico(F.icon, 1) : ''} ${C2.yield[0]}-${C2.yield[1]} ${esc(F.name)}</b>${sp ? `<span>Lucky find</span><b>${hasSprite(sp.icon) ? ico(sp.icon, 1) : '★'} ${esc(sp.name)}</b>` : ''}<span>Growth speed</span><b>${boost > 1.01 ? `+${Math.round((boost - 1) * 100)}%` : 'normal'}</b></div>
      <p class="center small">Sprinklers, bunnies & compost nearby grow plants faster. Rare batches give more!</p>
      <div class="btns"><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, { onBind: (cc) => { $('#m-ok', cc).onclick = () => { this.click(); this.closeModal(); }; } });
  }

  showStorageCard(s) {
    const game = this.game;
    const S = STORAGE[s.type];
    const store = game.foodStore;
    const n = store.stored(s);
    const forBeaver = S.for === 'beaver';
    const contents = Object.entries(s.store || {}).filter(([, v]) => v >= 1).map(([id, v]) => `<span class="chip">${hasSprite(FOOD_ITEMS[id]?.icon) ? ico(FOOD_ITEMS[id].icon, 1) : ''} ${esc(FOOD_ITEMS[id]?.name || id)} ×${v}</span>`).join('') || '<span class="chip dim">Empty</span>';
    const options = Object.entries(game.foodStore.inv).filter(([id, v]) => v >= 1 && (forBeaver ? FOOD_ITEMS[id]?.beaver : FOOD_ITEMS[id]?.bear)).map(([id, v]) => `<button class="btn small" data-fill="${id}">${hasSprite(FOOD_ITEMS[id]?.icon) ? ico(FOOD_ITEMS[id].icon, 1) : ''} ${esc(FOOD_ITEMS[id].name)} <b>×${Math.floor(v)}</b></button>`).join('');
    const html = `
      <h2 class="center">${hasSprite(s.def.icon) ? ico(s.def.icon, 2) : ''} ${esc(s.def.name)}</h2>
      <p class="center small">${n} / ${S.cap} servings${forBeaver ? ` · crew pay left: <b>${game.beavers.credit}</b> job${game.beavers.credit === 1 ? '' : 's'}` : ''}</p>
      <div class="chips center">${contents}</div>
      <p class="center small">${forBeaver ? 'Beavers only work when PAID. Each serving pays a few jobs (carrots 2, corn 3, golden carrot 12!).' : 'Bears grab a side dish here. Wanted snacks make them tip!'}</p>
      ${options ? `<div class="chips center fillopts">${options}</div>` : `<p class="center small"><b>${forBeaver ? 'No beaver food! Harvest your garden or buy a veggie crate.' : 'No produce! Harvest your garden first.'}</b></p>`}
      <div class="btns"><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (cc) => {
        $('#m-ok', cc).onclick = () => { this.click(); this.closeModal(); };
        cc.querySelectorAll('[data-fill]').forEach((b) => b.addEventListener('click', () => { store.fillStorage(s, b.dataset.fill); this.closeModal(); this.showStorageCard(s); }));
      },
    });
  }

  showHutchCard(s) {
    const game = this.game;
    const bun = game.landAnimals.bunniesOf(s);
    const list = bun.map((b) => `<span class="chip">${this.natImg(`${b.art}_idle`, 2) || ico('rabbit', 1)} ${esc(b.name)}${b.age < 60 ? ' (baby)' : ''}</span>`).join('') || '<span class="chip dim">Nobody home yet</span>';
    const html = `
      <h2 class="center">${hasSprite('rabbit') ? ico('rabbit', 2) : ''} ${esc(s.def.name)}</h2>
      <div class="chips center">${list}</div>
      <p class="center small">${bun.length}/4 bunnies. They fertilize crops within 3 tiles (+40% growth, luckier batches) and have babies while there's room.</p>
      <div class="btns"><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, { onBind: (cc) => { $('#m-ok', cc).onclick = () => { this.click(); this.closeModal(); }; } });
  }

  updateGhost() {
    const game = this.game;
    const ghost = game.ghost;
    if (!ghost) return;
    const t = game.tool;
    if (game.buildMove?.moving) return; // [v19 buildings] the move ghost is drawn by BuildMove
    if (!['build', 'dig', 'remove', 'clear'].includes(t.kind)) { ghost.clear(); return; }
    let tiles = game.ghostLine;
    if (!tiles) {
      const ht = game.input?.currentHoverTile();
      tiles = ht ? [{ x: ht.x, z: ht.z }] : [];
    }
    if (t.kind === 'build') {
      const entries = tiles.map((p) => ({ ...p, ok: game.structures.canPlace(t.type, p.x, p.z).ok }));
      ghost.showTiles(entries);
      ghost.showModels(t.type, entries);
      if (tiles[0]) game.bugs?.previewRing(t.type, tiles[tiles.length - 1].x, tiles[tiles.length - 1].z);
    } else if (t.kind === 'clear') {
      const B = game.beavers;
      ghost.showTiles(tiles.map((p) => ({ ...p, ok: B.canClear(p.x, p.z).ok || B.clears.has(p.z * game.grid.w + p.x) })));
      ghost.showModels(null, []);
    } else if (t.kind === 'dig') {
      ghost.showTiles(tiles.map((p) => ({ ...p, ok: !game.canDig(p.x, p.z) })));
      ghost.showModels(null, []);
    } else if (t.kind === 'land') {
      html = `${ico('map', 1)} <b>Land</b>: tap a <b>FOR SALE</b> plot next to yours to buy it`;
    } else if (t.kind === 'remove') {
      ghost.showTiles(tiles.map((p) => ({ ...p, ok: !!game.structures.structureAtTile(p.x, p.z) || game.grid.deco[p.z * game.grid.w + p.x] >= 0 })));
      ghost.showModels(null, []);
    }
  }

  endLabPause() {
    if (!this.labPaused) return;
    this.game.state.paused = this.labPaused.was;
    this.labPaused = null;
    this.hud.panel.classList.remove('full');
    document.body.classList.remove('lab-full');
  }

  // ------------------------------------------------------------ lab
  // the toolbar opens the research tree right here; tapping the hut still walks you into the lab
  openLab({ house = false } = {}) {
    const game = this.game;
    if (game.inputLocked) return;
    this.closePanel();
    if (house && game.lab?.open) { game.lab.open(); return; }
    this.labFallback = true;
    this.openPanel('lab');
    this.labFallback = false;
    game.emit('labOpen');
  }

  // ------------------------------------------------------------ panels
  openPanel(name, tab) {
    if (name === 'lab' && this.game.lab?.open && !this.labFallback) { this.openLab({ house: true }); return; }
    if (name === 'dex' && this.openBook(tab)) return;
    if (name === 'reviews' && this.openMenu(tab)) return;
    if (name === 'ebuy' || name === 'shop') { if (this.ebuy) this.closeEBuy(); else { this.closePanel(); this.openEBuy(); } return; }
    if (name === 'build') { if (this.blueprint.open) this.blueprint.exit(); else { this.closePanel(); this.closeEBuy(); this.blueprint.enter(tab); } return; }
    if (this.panel === 'lab' && name !== 'lab') this.endLabPause();
    this.panel = name;
    if (tab) this.panelTab = tab;
    else if (name === 'build' && !BUILD_CATEGORIES.some((c) => c.id === this.panelTab)) this.panelTab = 'nature';
    this.hud.panel.classList.remove('hidden');
    this.hud.panel.classList.toggle('wide', name === 'lab' || name === 'dex');
    // the lab takes over the whole screen and the clock stops while you think
    this.hud.panel.classList.toggle('full', name === 'lab');
    if (name === 'lab' && !this.labPaused) {
      this.labPaused = { was: this.game.state.paused };
      this.game.state.paused = true;
      document.body.classList.add('lab-full');
    }
    this.hud.tip.classList.add('hidden');
    for (const b of document.querySelectorAll('#toolbar .tool')) if (b.dataset.panel) b.classList.toggle('active', b.dataset.panel === name);
    this.renderPanel();
    this.game.audio.play('open', { volume: 0.35 });
  }

  // the Encyclopedia: a grand leather-bound book (falls back to the old card grid)
  openBook(entry) {
    const E = C('Encyclopedia')?.Encyclopedia;
    if (!E) return false;
    try {
      this.closePanel(); this.closeEBuy();
      // the clock stops while you read
      if (!this.book) this.book = new E({ game: this.game, root: this.root, onOpen: () => { this.bookPause = this.game.state.paused; this.game.state.paused = true; }, onClose: () => { this.game.state.paused = !!this.bookPause; this.closeSound(); } });
      if (this.book.isOpen) { this.book.close(); return true; }
      const o = typeof entry === 'object' && entry ? entry : entry ? { chapter: entry } : {};
      this.book.open(o);
      return true;
    } catch (e) { console.warn('Encyclopedia failed', e); return false; }
  }

  // Chez Reynard: the luxury restaurant menu (rating, reviews, trophy cabinet)
  openMenu(section) {
    const M = C('RestaurantMenu')?.RestaurantMenu;
    if (!M) return false;
    try {
      this.closePanel(); this.closeEBuy();
      if (!this.menu) this.menu = new M({ game: this.game, root: this.root, onClose: () => this.closeSound() });
      if (this.menu.isOpen) { this.menu.close(); return true; }
      this.menu.open({ section: section === 'trophies' ? 'trophies' : section || 'rating' });
      return true;
    } catch (e) { console.warn('RestaurantMenu failed', e); return false; }
  }

  closePanel() {
    if (this.panel === 'lab') this.endLabPause();
    if (!this.panel) return;
    this.panel = null;
    this.labFallback = false;
    this.labTree?.destroy?.();
    this.labTree = null;
    this.hud.panel.classList.add('hidden');
    for (const b of document.querySelectorAll('#toolbar .tool')) if (b.dataset.panel) b.classList.toggle('active', b.dataset.panel === 'build' && this.game.tool.kind === 'build');
  }

  closeTop() {
    if (this.game.lab?.active) { this.game.lab.exit?.(); return true; }
    if (this.book?.isOpen) { this.book.close(); return true; }
    if (this.menu?.isOpen) return this.menu.back();
    if (this.ebuy) { this.closeEBuy(); return true; }
    if (this.blueprint?.open) { this.blueprint.exit(); return true; }
    if ((this.paperModal || !this.hud.modal.classList.contains('hidden')) && this.modalDismissable) { this.closeModal(); return true; }
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
    this.setTitle('shop', 'e-Buy');
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
        <div class="row">${unlocked ? `<span class="cost ${afford ? '' : 'no'}">${ico('coin', 1)}${price}</span>` : `<span class="req">${ico('lock', 1)} ${esc(game.speciesLock?.(sp.id)?.reason || (req ? 'Research in the Lab: ' + req.name : game.lockReason(sp.unlock) || '?'))}</span>`}<span class="own">IN POND: ${counts[sp.id] || 0}</span></div>
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
      if (d.category !== this.panelTab || d.retired) continue;
      const unlocked = game.isStructureUnlocked(type);
      const afford = game.canAfford(d.cost);
      const needsLodge = d.builder === 'beaver' && !hasLodge;
      const req = !unlocked && RESEARCH_BY_ID[UNLOCKS_BUILD[type] || d.unlock];
      html += `<div class="card ${unlocked ? 'clickable' : 'locked'} ${game.tool.kind === 'build' && game.tool.type === type ? 'sel' : ''}" data-build="${type}">
        <div class="top"><span class="iconbox f-slot_gold ${unlocked ? '' : 'sil'}">${ico(d.icon, 2)}</span><div><div class="nm">${unlocked ? esc(d.name) : '???'}</div>${d.builder === 'beaver' ? `<div class="lt">${ico('beaver', 1)} beaver-built</div>` : d.beauty ? `<div class="lt">${ico('beauty', 1)} +${d.beauty} beauty</div>` : ''}</div></div>
        <div class="ds">${unlocked ? esc(d.desc) : 'Classified. Research it in the Lab.'}</div>
        <div class="row">${unlocked ? `<span class="cost ${afford ? '' : 'no'}">${ico('coin', 1)}${d.cost}</span>${needsLodge ? '<span class="req">needs a Beaver Lodge</span>' : ''}` : `<span class="req">${ico('lock', 1)} ${esc(game.structureLock?.(type)?.reason || (req ? 'Research in the Lab: ' + req.name : game.lockReason(d.unlock) || '?'))}</span>`}<span class="own">BUILT: ${game.structures.countBuilt(type)}</span></div>
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
      return `<div class="card ${done ? 'sel' : ok ? 'clickable' : 'locked'}" data-r="${r.id}"><div class="top">${ico(ok || done ? r.icon : 'lock', 2)}<div class="nm">${ok || done ? esc(r.name) : '???'}</div></div><div class="ds">${ok || done ? esc(r.desc) : ''}</div><div class="row"><span class="cost">${ico('clock', 1)}${r.time}s</span></div></div>`;
    }).join('')}</div>`;
    body.querySelectorAll('[data-r]').forEach((el) => el.addEventListener('click', () => { const c = game.canResearch(el.dataset.r); if (!c.ok) { this.toast(c.reason, 'bad'); return; } if (game.startResearch(el.dataset.r)) { this.toast(`${ico('flask', 1)} Researching <b>${esc(RESEARCH_BY_ID[el.dataset.r].name)}</b>...`, 'good'); this.renderPanel(true); } }));
  }

  makeLabTree(host, onClose) {
    const game = this.game;
    const LT = C('LabTree')?.LabTree;
    if (!LT) return null;
    // [v19 lab screen] same computer as the 3D lab (sections, rushes, sci-fi sfx): LabMode builds it
    if (game.lab?.makeTree) { try { const t = game.lab.makeTree(host, () => onClose?.()); if (t) return t; } catch (e) { console.warn('lab tree', e); } }
    try {
      return new LT(host, {
        game,
        research: RESEARCH, branches: BRANCHES,
        isResearched: (id) => game.state.research.includes(id),
        coins: () => game.state.coins,
        canResearch: (id) => game.canResearch(id),
        // v17: research is free and takes time: this starts a job on a bench
        onResearch: (id) => game.startResearch(id),
        jobs: () => game.researchJobs(),
        slots: () => game.labSlots(),
        zoneName: (zid) => ZONE_INFO[zid]?.npcName || zid,
        isZoneOpen: (zid) => game.zoneOpen(zid),
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
    // (game.finishResearch already announces "Research done: ...")
    for (const b of [].concat(r.build || [])) if (STRUCTURES[b]) this.toast(`New build: <b>${esc(STRUCTURES[b].name)}</b>`, 'good');
    if (r.species) this.toast(`New eggs in the shop: <b>${esc(SPECIES_BY_ID[r.species].name)}</b>`, 'good');
    if (r.id === 'r_beavers') this.tipOnce('lodge', 'Beavers hired! Build a <b>Beaver Lodge</b> in the water next to the shore (Build > Beaver Works). Then place dams and the beavers will build them.', 'greedy');
    if (r.id === 'r_franchise') this.foxSay("FRANCHISE EMPIRE! I'm a legend! You can <b>retire</b> from the menu for permanent golden tails, or keep raking it in.", 'laugh');
  }

  renderDex() {
    const game = this.game;
    const st = game.state;
    this.setTitle('book', 'Encyclopedia');
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
  // every popup is a real piece of paper (letter, note, mail, book...)
  showModal(html, { dismissable = true, onBind, cls = '', kind = null } = {}) {
    if (this.paperModal) { const old = this.paperModal; this.paperModal = null; old.close?.(); }
    const k = kind || (cls.includes('gameover') ? 'notebook' : cls.includes('menu') ? 'book' : 'letter');
    let p;
    try {
      p = openPaper({ kind: k, html, dismissable, root: this.root, onClose: () => { if (this.paperModal === p) this.paperModal = null; } });
    } catch (e) {
      console.warn('paper modal', e);
      const m = this.hud.modal, card = this.hud['modal-card'];
      card.className = `modal f-parchment ${cls}`;
      card.innerHTML = html;
      m.classList.remove('hidden');
      this.modalDismissable = dismissable;
      onBind?.(card);
      return;
    }
    this.paperModal = p;
    this.modalDismissable = dismissable;
    p.el.classList.add(...cls.split(' ').filter(Boolean));
    onBind?.(p.body);
  }

  closeModal() {
    if (this.paperModal) { const p = this.paperModal; this.paperModal = null; p.close?.(); return; }
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
    this.flashTransition('rain', { dur: 0.6, color: '#1a1420', peak: 0.7 });
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

  showDiscovery(sp, f = null) {
    this.foxMood('laugh', 3);
    const html = `
      <h1 class="gold">NEW SPECIES DISCOVERED!</h1>
      <div class="big-icon">${fishImg(sp.id, { morph: f?.g?.morph || 'normal', scale: 5, cls: 'shine' })}</div>
      <h2 class="center">${esc(sp.name)}</h2>
      <p class="center mut"><i>${esc(sp.latin)}</i></p>
      <p class="center">${esc(sp.desc)}</p>
      <div class="kv"><span>Meal size</span><b>${sp.meal}</b><span>Value</span><b>x${sp.value}</b></div>
      ${sp.unlock === 'hybrid' ? `<p class="center">Its eggs are now on e-Buy for ${ico('coin', 1)}${this.game.speciesPrice(sp.id)}.</p>` : ''}
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
      <div class="who"><img class="px" src="${this.icons.bear(b.typeId, true, d)}" width="96" height="96" alt=""><div>
      <h2>${esc(b.name)}</h2><div class="mut">${esc(d.name)}${d.variantName ? ` (${esc(d.variantName)})` : ''} · ${esc(b.dept)}</div>${b.look ? `<div class="mut">${esc(describeLook(b.look))}</div>` : ''}</div></div>
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
      <div class="btns">${d.gate ? `<button class="btn" id="m-gate">${s.open ? 'Close gate' : 'Open gate'}</button>` : ''}<button class="btn red" id="m-del">${ico('coin', 1)} Sell (+${this.game.buildMove ? this.game.buildMove.refund(s) : Math.floor((s.paid || 0) * 0.5)})</button><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-del', c).onclick = () => { this.closeModal(); this.game.buildMove ? this.game.buildMove.openCard(s, { sell: true }) : this.game.demolishAt(s.x, s.z); }; // [v19 buildings] never a one-tap delete: sell asks first
        const g = $('#m-gate', c);
        if (g) g.onclick = () => { this.game.tapStructure(s); this.closeModal(); };
      },
    });
  }

  showFishInfo(f) {
    if (openFishScope(this.game, f)) return; // Professor Reynard's Fish Scope (old card below is the fallback)
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
      <div class="fedmeter${f.fed >= 0.9 ? ' full' : ''}" title="Well fed: a full meter means ready to breed">${'<i class="h on"></i>'.repeat((f.fed >= 0.9 ? 4 : Math.floor((f.fed || 0) * 4)))}${'<i class="h"></i>'.repeat(4 - (f.fed >= 0.9 ? 4 : Math.floor((f.fed || 0) * 4)))}<b>${!f.adult ? 'Too young to breed' : f.fed >= 0.9 ? (f.loveT > 0 ? 'Well fed! Resting...' : 'Well fed: ready for love!') : 'Feed me to fall in love'}</b></div>
      <div class="kv"><span>Hunger</span><b>${hungerWord(f.hunger)}</b><span>Worth to bears</span><b>${ico('coin', 1)}${worth}</b><span>Mood</span><b>${f.state === 'court' ? 'In love' : f.state === 'flee' ? 'Terrified' : f.love > 0.2 ? 'Nurtured' : f.fed >= 0.9 && f.loveT <= 0 ? 'Looking for love' : 'Chill'}</b>${f.luck > 0.01 ? `<span>Mutation luck</span><b>+${Math.round(f.luck * 100)}%</b>` : ''}</div>
      <div class="btns"><button class="btn ${f.tagged ? '' : 'red'}" id="m-tag">${ico('tag', 1)} ${f.tagged ? 'Remove tag' : 'Tag DO NOT EAT'}</button><button class="btn" id="m-pet">${ico('nurture', 1)} Pet</button><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-tag', c).onclick = () => { game.tagFish(f); this.closeModal(); };
        $('#m-pet', c).onclick = () => { game.nurtureFish(f); };
      },
    });
  }

  // little pixel pictures for cards (nature-atlas sprites)
  natImg(name, scale = 3, frame = 0) {
    try {
      const c = natureCanvas(name, frame, scale);
      if (c && c.width > scale * 2) return `<img class="px" src="${c.toDataURL()}" alt="">`;
    } catch { /* ignore */ }
    return '';
  }
  bugImg(id, scale = 3) { return this.natImg(`bugicon_${id}`, scale) || this.natImg(`bug_${id}`, scale + 1) || ico('bug', scale); }

  effectChips(aura, scale = 1) {
    return Object.entries(aura || {}).filter(([, v]) => v > 0.005).map(([k, v]) => {
      const E = EFFECTS[k];
      return `<span class="chip fx" style="--fx:${E.color}">${hasSprite(E.icon) ? ico(E.icon, scale) : ''} +${Math.round(v * 100)}% ${esc(E.name)}</span>`;
    }).join('');
  }

  showLivestockInfo(b) {
    const game = this.game;
    const B = BREEDS[b.breed], K = KIND_INFO[b.kind];
    const adult = b.age >= 1;
    const pic = this.natImg(b.kind === 'goose' ? 'goose_swim' : 'mallard_swim', 5) || ico('egg', 4);
    const boosts = Object.keys(b.boost || {}).map((k) => `<span class="chip fx" style="--fx:${EFFECTS[k].color}">${ico(EFFECTS[k].icon, 1)} ${esc(EFFECTS[k].name)} ${Math.ceil(b.boost[k])}s</span>`).join('');
    const aura = game.bugs ? { ...game.bugs.auraAt(b.x, b.z) } : {};
    const hunger = b.hunger < 0.3 ? 'Full' : b.hunger < 0.6 ? 'Peckish' : b.hunger < 0.85 ? 'Hungry!' : 'STARVING (needs bugs!)';
    const html = `
      <div class="big-icon">${pic}</div>
      <h2 class="center">${esc(b.name)} the ${esc(B.name)}${adult ? '' : ` ${K.baby.toLowerCase()}`}</h2>
      <div class="chips center"><span class="chip ${b.sex === 'm' ? 'm' : 'f'}">${b.sex === 'm' ? (b.kind === 'goose' ? '♂ Gander' : '♂ Drake') : '♀ Hen'}</span><span class="chip">Size ${Math.round(b.size * 100)}%</span>${b.golden ? '<span class="chip shimmer">Golden blood</span>' : ''}</div>
      <div class="kv"><span>Hunger</span><b>${hunger}</b>${adult ? '' : `<span>Grown up</span><b>${Math.floor(b.age * 100)}%</b>`}<span>Mood</span><b>${b.happy > 0.7 ? 'Delighted' : b.happy > 0.4 ? 'Content' : 'Grumpy'}</b><span>Home</span><b>${b.nest ? esc(b.nest.def.name) : 'No nest!'}</b></div>
      ${boosts ? `<div class="chips center">${boosts}</div>` : ''}
      ${Object.values(aura).some((v) => v > 0.005) ? `<p class="center small">Bug farm boosts here:</p><div class="chips center">${this.effectChips(aura)}</div>` : '<p class="center small">Eats bugs! Build bug farms nearby.</p>'}
      <div class="btns"><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, { onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); }; } });
  }

  showTankCard(s) {
    const game = this.game;
    const T = game.tanks;
    const fish = T.fishIn(s);
    const eggs = game.fish.eggs.filter((e) => e.tank === s);
    const rows = fish.map((f) => `<div class="tankrow"><span class="fishbox">${fishImg(f.sp.id, { morph: f.g.morph, scale: 1 })}</span><b>${esc(f.name || f.sp.name)}</b><span class="chip ${f.g.sex === 'M' ? 'm' : 'f'}">${f.g.sex === 'M' ? '♂' : '♀'}</span>${f.adult ? '' : '<span class="chip">fry</span>'}${f.dateT > 0 ? '<span class="chip fx" style="--fx:#ff7ab0">on a date ♡</span>' : f.state === 'fertilize' ? '<span class="chip fx" style="--fx:#6cd04a">fertilizing</span>' : ''}<button class="btn" data-out="${f.id}">To pond</button></div>`).join('') || '<p class="center small">Empty! Use the Tank tool (or carry a fish here with the hand).</p>';
    const eggLine = eggs.length ? `<div class="chips center">${eggs.map((e) => `<span class="chip ${e.ready ? 'shimmer' : ''}">${ico('egg', 1)} ${e.ready ? 'Ready: tap!' : e.stage === 'laid' ? 'Laid, being fertilized' : Math.ceil(e.t) + 's'}</span>`).join('')}</div>` : '';
    const html = `
      <h2 class="center">${ico('tank', 2)} ${esc(s.def.name)}</h2>
      <p class="center small">${fish.length}/${s.def.tank.cap} fish · safe from bears · fed for you · tank mates breed with each other only</p>
      <div class="tanklist">${rows}</div>
      ${eggLine}
      <div class="btns">${eggs.some((e) => e.ready) ? `<button class="btn gold" id="m-hatch">${ico('egg', 1)} Hatch eggs</button>` : ''}<button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        c.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => {
          const f = fish.find((x) => String(x.id) === b.dataset.out);
          if (f) T.release(f);
          this.click();
          this.showTankCard(s);
        }));
        const h = $('#m-hatch', c);
        if (h) h.onclick = () => { this.closeModal(); const e = eggs.find((x) => x.ready); if (e) this.tapPondEgg(e); };
      },
    });
  }

  showNestCard(s) {
    const game = this.game;
    const L = game.livestock;
    const eggs = s.eggs || [];
    const res = L.residents(s);
    const value = eggs.reduce((a, e) => a + L.eggValue(e), 0);
    const eggList = eggs.map((e) => `<span class="chip ${e.golden ? 'shimmer' : ''}">${ico('egg', 1)} ${e.golden ? 'GOLDEN ' : ''}${esc(BREEDS[e.breed].name)} ${e.fertile ? `hatches ${Math.max(0, Math.ceil(e.t))}s` : '(no drake: sell it)'}</span>`).join('') || '<span class="chip">No eggs yet</span>';
    const html = `
      <h2 class="center">${esc(s.def.name)}</h2>
      <p class="center small">${res.length}/${s.def.nest.cap} living here${res.length ? ': ' + res.map((b) => esc(b.name)).join(', ') : ''}</p>
      <div class="chips center">${eggList}</div>
      <p class="center small">Leave eggs to hatch babies, or sell them now.</p>
      <div class="btns"><button class="btn ${eggs.length ? 'gold' : ''}" id="m-sell" ${eggs.length ? '' : 'disabled'}>${ico('coin', 1)} Collect & sell (${value})</button><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, {
      onBind: (c) => {
        $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); };
        $('#m-sell', c).onclick = () => { if (L.collect(s)) { this.closeModal(); } };
      },
    });
  }

  showFarmCard(s) {
    const game = this.game;
    const info = game.bugs.farmInfo(s);
    if (!info) return;
    const d = info.def;
    const kinds = info.kinds.map((b) => `<span class="chip bugc" title="${esc(b.desc)}">${this.bugImg(b.id, 2)} ${esc(b.name)}${b.night ? ' ' + ico('moon', 1) : ''}</span>`).join('');
    const html = `
      <h2 class="center">${esc(s.def.name)}</h2>
      <p class="center small">${info.alive}/${d.max} bugs living here${d.night ? ' (they come out at night)' : ''}</p>
      <div class="chips center">${kinds}</div>
      <p class="center small">While it has bugs, everything in the circle gets:</p>
      <div class="chips center">${this.effectChips(d.aura) || '<span class="chip">Food for ducks & geese</span>'}</div>
      <div class="btns"><button class="btn green" id="m-ok">OK</button></div>`;
    this.showModal(html, { onBind: (c) => { $('#m-ok', c).onclick = () => { this.click(); this.closeModal(); }; } });
  }

  // delivered parcels wait on the ground with a TAP! tag
  updateParcelTags() {
    const game = this.game;
    const list = game.delivery.waiting();
    (this.parcelTags ||= new Map());
    for (const [p, el] of this.parcelTags) if (!list.includes(p)) { el.remove(); this.parcelTags.delete(p); }
    for (const p of list) {
      let el = this.parcelTags.get(p);
      if (!el) {
        el = document.createElement('div');
        el.className = 'eggtag ready parceltag';
        el.innerHTML = `${hasSprite('mailbox') ? ico('mailbox', 1) : ''}<b>TAP!</b>`;
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.unboxParcel(p); });
        this.overlay.appendChild(el);
        this.parcelTags.set(p, el);
      }
      const q = this.screenOf(p.x, p.y + 0.75, p.z);
      el.style.display = q.visible === false || game.lab?.active ? 'none' : '';
      el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
    }
  }

  pickParcel(sx, sy) {
    let best = null, bd = 34 * 34;
    for (const p of this.game.delivery.waiting()) {
      const q = this.screenOf(p.x, p.y + 0.2, p.z);
      const d = (q.x - sx) ** 2 + (q.y - sy) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // what's in the box, for the unboxing ceremony
  unboxItems(order) {
    const out = [];
    const add = (key, mk) => { const o = out.find((x) => x.key === key); if (o) o.qty++; else out.push({ key, qty: 1, ...mk() }); };
    for (const it of order.items) {
      if (it.kind === 'egg') {
        add('egg:' + it.species, () => {
          const sp = SPECIES_BY_ID[it.species];
          let image = null;
          try { image = fishCanvasFor(it.species, { morph: it.genes?.morph || 'normal', scale: 3 }); } catch { /* ignore */ }
          return { name: `${sp?.name || 'Fish'} egg`, image, iconName: 'egg', rarity: Math.max(0, Math.min(4, (it.genes?.stars || 1) - 1)), sub: 'Reynard carries it to the pond', kind: 'egg' };
        });
      } else if (it.kind === 'bird') {
        add('bird:' + it.breed, () => ({ name: BREEDS[it.breed]?.name || 'Bird', image: this.listingImage({ kind: 'bird', breed: it.breed }), iconName: 'egg', sub: 'Waddles out to find a nest', kind: 'bird' }));
      } else if (it.kind === 'upgrade') {
        add('upg' + it.level, () => ({ name: `Beaver tools Lv${it.level}`, image: null, iconName: 'hammer', sub: 'Your beavers can clear more!', kind: 'upgrade', rarity: 3 }));
      } else if (it.kind === 'fish') {
        add('fish:' + it.species + it.genes?.sex, () => {
          const sp = SPECIES_BY_ID[it.species];
          let image = null;
          try { image = fishCanvasFor(it.species, { morph: it.genes?.morph || 'normal', scale: 3 }); } catch { /* ignore */ }
          return { name: `${sp?.name || 'Fish'} ${it.genes?.sex === 'F' ? '♀' : '♂'}`, image, iconName: 'fish', sub: 'Reynard carries the bag to the pond', kind: 'egg', rarity: 0 };
        });
      } else if (it.kind === 'food') {
        const F = FOOD_ITEMS[it.id];
        out.push({ key: 'food:' + it.id, qty: it.n || 1, name: F?.name || 'Food', image: this.listingImage({ kind: 'food', foodId: it.id }), iconName: F?.icon || 'food', sub: 'Goes in your Food bag', kind: 'item' });
      } else {
        const d = STRUCTURES[it.type];
        const o = out.find((x) => x.key === 'st:' + it.type);
        if (o) { o.qty += it.qty || 1; continue; }
        out.push({ key: 'st:' + it.type, qty: it.qty || 1, name: d?.name || 'Parcel', image: this.listingImage({ kind: 'item', type: it.type }), iconName: d?.icon || 'mailbox', sub: 'Goes to Build ▸ Parcels', kind: 'item' });
      }
    }
    return out;
  }

  unboxParcel(p) {
    const game = this.game;
    if (!p || p.opened || this.unboxing) return;
    const U = C('Unbox');
    const done = () => { this.unboxing = false; game.delivery.unbox(p); };
    if (!U?.playUnbox) { game.particles.confetti(p.x, p.y + 0.4, p.z, 18); done(); return; }
    this.unboxing = true;
    const st = game.state;
    const wasPaused = st.paused;
    st.paused = true;
    U.playUnbox(this.hud['ceremony-root'] || this.root, this.unboxItems(p.order), {
      icon: (n, sc) => (hasSprite(n) ? ico(n, sc) : ''),
      sfx: (n, o) => game.audio.play(n, { volume: 0.45, ...(o || {}) }),
      label: p.order.label,
    }).catch(() => {}).finally(() => { st.paused = wasPaused; done(); });
  }

  // ------------------------------------------------------------ beaver contract (Destroy box)
  // the crew is paid right there for the chunk you boxed: coins or food
  beaverContract({ tiles, x, z, keep = false }) {
    const game = this.game;
    const B = game.beavers;
    const n = tiles.length;
    if (!n) { if (keep) this.closeContract?.(true, true); return; } // [v19 buildings] keep: swap the card, don't cancel its tiles
    this.closeContract?.(true, keep);
    const need = Math.max(0, n - Math.floor(B.credit));
    if (!need) { this.floatTextAt?.(x, 1.4, z, `Paid! ${n} jobs`, '#c8ff9a'); return; }
    // during the tutorial the first contract is on the house
    if (game.tutorial?.active) { B.credit = B.credit + need; this.floatTextAt?.(x, 1.6, z, 'First job\'s free!', '#c8ff9a'); game.emit('beaverContract', { n, need: 0 }); return; }
    const PRICE = 4;
    const coins = need * PRICE;
    // food that beavers accept, best payers first
    const foods = Object.keys(game.foodStore.inv || {}).filter((id) => game.foodStore.count(id) > 0 && FOOD_ITEMS[id]?.beaver?.jobs)
      .sort((a, b) => FOOD_ITEMS[b].beaver.jobs - FOOD_ITEMS[a].beaver.jobs);
    let cover = 0;
    const plan = [];
    for (const id of foods) {
      const per = FOOD_ITEMS[id].beaver.jobs;
      const k = Math.min(game.foodStore.count(id), Math.ceil((need - cover) / per));
      if (k > 0) { plan.push([id, k]); cover += k * per; }
      if (cover >= need) break;
    }
    const foodOk = cover >= need;
    const el = document.createElement('div');
    el.className = 'bcontract';
    el.innerHTML = `<div class="bc-head">${ico('beaver', 2)}<b>Beaver contract</b></div>
      <div class="bc-body">${n} tile${n > 1 ? 's' : ''} to clear${n - need ? ` · ${n - need} already paid` : ''}</div>
      <div class="bc-btns">
        <button class="bc-coin" ${game.canAfford(coins) ? '' : 'disabled'}>${ico('coin', 1)} Pay ${coins}</button>
        ${foodOk ? `<button class="bc-food">${plan.map(([id, k]) => `${ico(FOOD_ITEMS[id].icon || 'food', 1)}×${k}`).join(' ')} Pay</button>` : ''}
        <button class="bc-no">✕</button>
      </div>`;
    (this.overlay || document.body).appendChild(el);
    const place = () => { const q = this.screenOf(x, 1.2, z); el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`; };
    place();
    this.contract = { el, place, tiles };
    const done = (paid) => {
      this.contract = null;
      el.classList.add('bye');
      setTimeout(() => el.remove(), 250);
      if (!paid) { for (const i of tiles) B.cancelClear(i % game.grid.w, (i / game.grid.w) | 0); game.audio.play('paper', { volume: 0.3, pitch: 0.8 }); return; }
      B.credit = B.credit + need;
      game.audio.play('coins', { volume: 0.45 });
      game.particles.coins?.(x, 1, z, 6);
      this.floatTextAt?.(x, 1.6, z, 'Deal! Beavers on it!', '#c8ff9a');
      game.emit('beaverContract', { n, need });
    };
    this.closeContract = (silent, keep) => { if (this.contract?.el === el) { if (keep) { this.contract = null; el.remove(); } else done(false); } }; // [v19 buildings] keep
    el.querySelector('.bc-coin').addEventListener('click', (e) => { e.stopPropagation(); if (!game.spend(coins, 'beavers')) { game.audio.play('error', { volume: 0.4 }); return; } done(true); });
    el.querySelector('.bc-food')?.addEventListener('click', (e) => { e.stopPropagation(); for (const [id, k] of plan) game.foodStore.take(id, k); done(true); });
    el.querySelector('.bc-no').addEventListener('click', (e) => { e.stopPropagation(); done(false); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    game.audio.play('page', { volume: 0.4 });
  }

  // ------------------------------------------------------------ Matchmaker (arranged breeding)
  openMatchmaker(preselect = null) {
    const game = this.game;
    const MM = C('Matchmaker');
    const M = game.matchmaking;
    if (!MM?.openMatchmaker || !M) { game.notify('The Matchmaker is out to lunch.', 'no'); return; }
    this.closePanel();
    this.closeMatchmaker();
    const wasPaused = game.state.paused;
    game.state.paused = true;
    this.matchCard = MM.openMatchmaker(this.root, {
      fish: M.cards(),
      preselect,
      predict: (a, b) => M.predict(a, b),
      onArrange: (a, b) => { const r = M.arrange(a, b); setTimeout(() => this.matchCard?.refresh?.(M.cards()), 300); return r; },
      icon: (n, sc) => (hasSprite(n) ? ico(n, sc) : ''),
      sfx: (n, o) => game.audio.play(n, { volume: 0.45, ...(o || {}) }),
      onClose: () => { this.matchCard = null; game.state.paused = wasPaused; },
    });
    game.emit('matchOpen');
  }

  // a picture of a build (for the workshop plans): 3D render as an <img>-able canvas
  structureArt(type) {
    try {
      const url = this.icons?.structure(type, this.game.structures);
      if (!url) return null;
      const img = new Image();
      img.src = url;
      img.className = 'px';
      return img;
    } catch { return null; }
  }

  closeMatchmaker() { const c = this.matchCard; this.matchCard = null; c?.close?.(); }

  // the pinned quest note under the coin counter
  ensureQuestLog() {
    if (this.questLog) return this.questLog;
    const QL = C('QuestLog');
    if (!QL?.createQuestLog) return null;
    this.questLog = QL.createQuestLog(this.root, {
      icon: (n, sc) => (hasSprite(n) ? ico(n, sc) : ''),
      sfx: (n, o) => this.game.audio.play(n, { volume: 0.4, ...(o || {}) }),
      // tap a quest in the notebook: close it and show where to go
      onClick: (id) => { this.questLog?.close?.(); setTimeout(() => this.game.quests?.hintById?.(id), 450); },
    });
    return this.questLog;
  }

  // paper tags over nests: egg count + next hatch
  updateNestTags() {
    const game = this.game;
    const nests = game.livestock ? game.livestock.nests().filter((s) => (s.eggs || []).length) : [];
    (this.nestTags ||= new Map());
    for (const [s, el] of this.nestTags) if (!nests.includes(s)) { el.remove(); this.nestTags.delete(s); }
    for (const s of nests) {
      let el = this.nestTags.get(s);
      if (!el) {
        el = document.createElement('div');
        el.className = 'eggtag nesttag';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.showNestCard(s); });
        this.overlay.appendChild(el);
        this.nestTags.set(s, el);
      }
      const p = this.screenOf(s.x + 0.5, game.grid.groundAt(s.x + 0.5, s.z + 0.5) + 0.7, s.z + 0.5);
      el.style.display = p.visible === false || game.lab?.active ? 'none' : '';
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
      const eggs = s.eggs;
      const next = eggs.filter((e) => e.fertile).reduce((a, e) => Math.min(a, e.t), Infinity);
      const gold = eggs.some((e) => e.golden);
      const txt = `${eggs.length}${Number.isFinite(next) ? ' · ' + Math.floor(next / 60) + ':' + String(Math.ceil(next) % 60).padStart(2, '0') : ''}`;
      if (el.dataset.t !== txt) {
        el.dataset.t = txt;
        el.innerHTML = `${hasSprite('egg') ? ico('egg', 1) : ''}<b>${txt}</b>`;
        el.classList.toggle('ready', gold);
      }
    }
  }

  showMenu() {
    const game = this.game;
    const v = game.audio.getVolumes();
    const canRetire = game.state.research.includes('r_franchise') || game.structures.countBuilt('franchise') > 0;
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
      <p>${ico('egg', 1)} Buy <b>eggs</b> on e-Buy. They hatch in your egg tray with random <b>genes</b>: size, colour morphs, traits and stars.</p>
      <p>${ico('alarm', 1)} At <b>5 PM</b> the bears get off work and cannonball into your pond. They eat fish and side dishes, pay, and leave a review.</p>
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
