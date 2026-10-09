// [F&S industry] Industry UI: a HUD pill (smog meter, power), the machine cards
// ([v26 power] orders + keep-stocked targets, the beaver on shift, hopper + bench,
// grid power, on/off), the grid card (poles, sources, batteries: openGrid) and the
// Industry ledger (pollution breakdown + effects, power grids, storage use).
// Resources are never listed here: they live in storage buildings (tap one).
// Pure DOM on top of game.ui.showModal (the paper cards); styles injected once.
// Created lazily by src/game/Industry.js once #ui exists.
import { spriteImg, hasSprite } from './sprites.js';
import { openPaper } from './paper.js';
import { RECIPES, POLLUTION_TIERS } from '../data/structuresIndustry.js';
import { RECIPES_FOR, KEEP_DEFAULT } from '../data/structuresIndustry.js'; // [v26 power]
import { STRUCTURES } from '../data/structures.js';

const resMods = import.meta.glob('../game/Resources.js', { eager: true });
const RES_INFO = resMods['../game/Resources.js']?.RES_INFO || {};
const RES_IDS = resMods['../game/Resources.js']?.RES_IDS || Object.keys(RES_INFO);

const CSS = `
.ind-hud { position: absolute; left: calc(162px + var(--safe-l, 0px)); top: calc(22px + var(--safe-t, 0px)); z-index: 12; pointer-events: auto; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 3px 9px 3px 5px; font-family: var(--font2); font-size: 13px;
  color: var(--cream); background: linear-gradient(#5a6070, #3e4452 60%, #2e333e); border: 3px solid #1a1d24; border-radius: 7px;
  box-shadow: inset 0 2px 0 rgba(255,255,255,.18), 0 3px 0 rgba(20,10,4,.35); text-shadow: 1px 1px 0 #111; white-space: nowrap; line-height: 1; }
.ind-hud:hover { filter: brightness(1.1); }
body.cine .ind-hud, body.lab-full .ind-hud { opacity: 0; pointer-events: none; }
.ind-hud img { width: 20px; height: 20px; image-rendering: pixelated; }
.ind-hud .seg { display: inline-flex; align-items: center; gap: 4px; }
.ind-hud .bar { position: relative; width: 58px; height: 10px; background: #1a1d24; border: 2px solid #111; overflow: hidden; }
.ind-hud .bar i { position: absolute; left: 0; top: 0; bottom: 0; transition: width .4s steps(8), background .4s; }
.ind-hud .bar u { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #fff; opacity: .7; }
.ind-hud .tier { font-size: 11px; letter-spacing: .5px; }
.ind-hud .pw.low { color: #ff8a6a; animation: ind-blink 1s steps(2) infinite; }
.ind-hud .strike { color: #ff6a5a; animation: ind-blink .8s steps(2) infinite; }
.ind-hud.smog { box-shadow: inset 0 2px 0 rgba(255,255,255,.18), 0 0 0 2px #c84ad0, 0 3px 0 rgba(20,10,4,.35); }
@keyframes ind-blink { 50% { opacity: .45; } }
.ind-card { font-family: var(--font); color: var(--ink); width: 100%; box-sizing: border-box; }
.ind-card h2 { margin: 0; font-family: var(--font2); }
.ind-card .who { display: flex; gap: 10px; align-items: center; }
.ind-card .ib { width: 52px; height: 52px; display: inline-flex; align-items: center; justify-content: center; flex: none;
  background: radial-gradient(circle at 50% 40%, #6a7080, #3a3e4a); border: 3px solid #23262e; border-radius: 8px; box-shadow: inset 0 0 0 2px #9aa0b2; }
.ind-card .ib img { width: 40px; height: 40px; image-rendering: pixelated; }
.ind-card .st { font-family: var(--font2); font-size: 14px; margin-top: 2px; display: inline-flex; align-items: center; gap: 5px; }
.ind-card .st::before { content: ''; width: 9px; height: 9px; border: 2px solid #2a1a14; border-radius: 50%; background: #9a9a9a; }
.ind-card .st.good::before { background: #6aff6a; } .ind-card .st.bad::before { background: #ff4a3a; } .ind-card .st.idle::before { background: #ffc040; }
.ind-card .st.bad { color: #a02a22; }
.ind-card .sec { margin: 8px 0 0; padding: 6px 8px; background: rgba(255,250,235,.55); border: 2px solid #c9ad78; border-radius: 6px; }
.ind-card .sec > b { display: block; font-family: var(--font2); font-size: 13px; letter-spacing: 1px; color: #7a5c40; margin-bottom: 4px; }
.ind-card .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 15px; }
.ind-card .row + .row { margin-top: 4px; }
.ind-card .grow { flex: 1; }
.ind-card .rc { display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px 1px 3px; border-radius: 999px; background: #fff6dc; border: 2px solid #8a6a44; font-family: var(--font2); font-size: 13px; }
.ind-card .rc img { width: 18px; height: 18px; image-rendering: pixelated; }
.ind-card .rc.no { opacity: .55; border-style: dashed; }
.ind-card .rc .dot { width: 12px; height: 12px; border-radius: 3px; border: 2px solid #2a1a14; }
.ind-card .arrow { font-family: var(--font2); color: #7a5c40; }
.ind-card .recipes { display: grid; gap: 4px; }
.ind-card .rcp { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: 3px 6px; border: 2px solid #c9ad78; border-radius: 6px; background: #fbf0d0; cursor: pointer; font-size: 14px; text-align: left; color: var(--ink); font-family: var(--font); }
.ind-card .rcp:hover { background: #fff6dc; }
.ind-card .rcp.on { border-color: #2f6f4a; background: #d6f5cf; box-shadow: inset 0 0 0 2px #6cc08a; }
.ind-card .rcp .nm { font-family: var(--font2); min-width: 92px; }
.ind-card .rcp .tm { margin-left: auto; font-size: 12px; color: #7a5c40; }
.ind-card .prog { position: relative; height: 12px; background: #3a2a1c; border: 2px solid #2a1a14; border-radius: 3px; overflow: hidden; margin-top: 6px; }
.ind-card .prog i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(#ffd060, #e08a20); }
.ind-card .meter { position: relative; height: 16px; border: 2px solid #2a1a14; border-radius: 3px; overflow: hidden; display: flex; }
.ind-card .meter span { flex: none; height: 100%; opacity: .35; }
.ind-card .meter i { position: absolute; top: -2px; bottom: -2px; width: 4px; background: #2a1a14; box-shadow: 0 0 0 1px #fff; }
.ind-card .meter u { position: absolute; top: 0; bottom: 0; width: 2px; background: repeating-linear-gradient(#fff 0 2px, transparent 2px 4px); }
.ind-card .eff { font-size: 14px; color: #5a3a22; }
.ind-card .eff.bad { color: #a02a22; }
.ind-card .crew { display: grid; gap: 4px; }
.ind-card .crew .row { padding: 2px 4px; border-bottom: 1px dashed #c9ad78; }
.ind-card .tag { font-family: var(--font2); font-size: 11px; padding: 1px 5px; border-radius: 3px; background: #3e4452; color: #fff; }
.ind-card .tag.red { background: #c0302a; }
.ind-card .btns { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
.ind-card .small { font-size: 12px; color: #7a5c40; }
/* [v26 power] orders, keep-stocked pills, queue chips, grid card */
.ind-card .ord { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 3px 5px; border: 2px solid #c9ad78; border-radius: 6px; background: #fbf0d0; font-size: 14px; }
.ind-card .ord + .ord { margin-top: 3px; }
.ind-card .ord.on { border-color: #2f6f4a; background: #d6f5cf; box-shadow: inset 0 0 0 2px #6cc08a; }
.ind-card .ord .nm { font-family: var(--font2); min-width: 86px; }
.ind-card .ord .tm { font-size: 12px; color: #7a5c40; }
.ind-card .ord .end { margin-left: auto; display: inline-flex; gap: 4px; align-items: center; }
.ind-card .keep { font-family: var(--font2); font-size: 12px; padding: 1px 6px; border: 2px solid #8a6a44; border-radius: 4px; background: #fff6dc; color: #5a3a22; cursor: pointer; white-space: nowrap; }
.ind-card .keep.off { opacity: .6; border-style: dashed; }
.ind-card .plus { font-family: var(--font2); font-size: 13px; padding: 1px 7px; border: 2px solid #1f3f2c; border-radius: 4px; background: #6cc08a; color: #fff; text-shadow: 1px 1px 0 #1f3f2c; cursor: pointer; }
.ind-card .plus:hover, .ind-card .keep:hover { filter: brightness(1.1); }
.ind-card .queue { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-top: 5px; }
.ind-card .qchip { display: inline-flex; align-items: center; gap: 2px; padding: 0 5px 0 2px; border: 2px solid #8a6a44; border-radius: 999px; background: #fff6dc; font-family: var(--font2); font-size: 12px; cursor: pointer; }
.ind-card .qchip img { width: 18px; height: 18px; image-rendering: pixelated; }
.ind-card .qchip:hover { background: #ffd8c8; border-color: #a02a22; }
.ind-card .qchip.cur { border-color: #2f6f4a; background: #d6f5cf; }
.ind-card .gridbar { position: relative; height: 14px; border: 2px solid #2a1a14; border-radius: 3px; background: #3a2a1c; overflow: hidden; margin-top: 4px; }
.ind-card .gridbar i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, #ffd23f 0 6px, #e5a320 6px 8px); }
.ind-card .gridbar u { position: absolute; top: 0; bottom: 0; width: 3px; background: #ff4a3a; }
.ind-card .bat { display: inline-flex; gap: 2px; vertical-align: middle; }
.ind-card .bat i { width: 7px; height: 12px; border: 2px solid #2a1a14; background: #3a2a1c; }
.ind-card .bat i.on { background: #6aff6a; }
.ind-card .tag.green { background: #2f6f4a; }
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt1 = (v) => (Math.round((v || 0) * 2) / 2).toString(); // [v26 power] power to the half unit
const img = (name, s = 1) => (hasSprite(name) ? spriteImg(name, s) : '');

export class IndustryUI {
  constructor(ind) {
    this.ind = ind;
    this.game = ind.game;
    this.card = null; // { s | 'ledger', body }
    if (!document.getElementById('ind-css')) {
      const st = document.createElement('style');
      st.id = 'ind-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.hud = null;
  }

  // ------------------------------------------------------------ resource chips
  rc(id, n = null, ok = true) {
    const info = id === 'wood' ? { name: 'Wood', icon: 'logpile', color: '#a8784a' } : RES_INFO[id] || { name: id, color: '#999' };
    const pic = hasSprite(info.icon) ? spriteImg(info.icon, 1) : `<span class="dot" style="background:${info.color}"></span>`;
    return `<span class="rc ${ok ? '' : 'no'}" title="${esc(info.name)}">${pic}${n != null ? n : ''}</span>`;
  }
  bill(b, have = null) {
    return Object.entries(b).map(([id, n]) => this.rc(id, n, have ? have(id, n) : true)).join('');
  }

  // ------------------------------------------------------------ HUD pill
  ensureHud() {
    if (this.hud?.isConnected) return this.hud;
    const host = document.getElementById('hudhost');
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'ind-hud';
    el.title = 'Industry: smog, power and crew';
    el.innerHTML = `<span class="seg">${img('ind_smog', 1)}<span class="bar"><i></i><u></u></span><span class="tier"></span></span><span class="seg pw">${img('ind_power', 1)}<span class="pwv"></span></span><span class="seg cw">${img('ind_worker', 1)}<span class="cwv"></span></span>`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); this.game.audio.play('click', { volume: 0.35 }); this.openLedger(); });
    host.appendChild(el);
    this.hud = el;
    return el;
  }
  hideHud() { if (this.hud) this.hud.style.display = 'none'; }
  update() {
    const el = this.ensureHud();
    const S = this.ind.summary();
    if (el) {
      el.style.display = '';
      // sit just under the stockpile strip (src/ui/MiningUI.js) when it shows
      const strip = document.querySelector('.fsm-strip');
      const hb = (el.offsetParent || el.parentElement)?.getBoundingClientRect();
      if (strip && hb && !strip.classList.contains('hidden') && strip.offsetHeight) {
        const sb = strip.getBoundingClientRect();
        el.style.top = `${Math.round(sb.bottom - hb.top + 5)}px`;
        el.style.left = `${Math.round(sb.left - hb.left)}px`;
      } else { el.style.top = ''; el.style.left = ''; }
      const t = S.tier;
      const bar = el.querySelector('.bar i');
      bar.style.width = `${Math.min(100, S.pol)}%`;
      bar.style.background = t.color;
      el.querySelector('.bar u').style.left = `${Math.min(98, S.target)}%`;
      el.querySelector('.tier').textContent = t.name;
      el.classList.toggle('smog', S.pol >= 45);
      const pw = el.querySelector('.pw');
      const P = this.game.power; // [v26 power] the grid's totals
      const sup = P ? P.supply() : S.power.supply, dem = P ? P.demand() : S.power.demand;
      pw.style.display = dem > 0 || sup > 0 ? '' : 'none';
      el.querySelector('.pwv').textContent = `${fmt1(sup)}/${fmt1(dem)}`;
      pw.classList.toggle('low', dem > 0 && sup + (P?.nets || []).reduce((a, n) => a + (n.give || 0), 0) < dem - 0.01);
      const cw = el.querySelector('.cw');
      cw.style.display = S.workers.length ? '' : 'none';
      const strike = S.workers.some((w) => w.strike);
      el.querySelector('.cwv').innerHTML = strike ? '<span class="strike">STRIKE</span>' : `${S.workers.length}`;
    }
    // live cards
    if (this.card && !this.card.body?.isConnected) this.card = null;
    if (this.card) {
      this.liveT = (this.liveT || 0) + 1;
      if (this.card.s === 'ledger') { if (this.liveT % 4 === 0) this.renderLedger(); }
      else if (this.card.s.removed) this.closeCard();
      else if (this.card.grid) { if (this.liveT % 2 === 0) this.renderGrid(this.card.s); }
      else this.renderMachine(this.card.s, true);
    }
  }

  // ------------------------------------------------------------ machine card
  // a paper card of our own (wider than the default letter)
  openCard(what, render) {
    this.closeCard();
    const game = this.game;
    game.audio.play('page', { volume: 0.35 });
    const p = openPaper({ kind: 'letter', html: '<div class="ind-card"></div>', width: Math.min(500, innerWidth - 24), root: game.ui?.root || document.body,
      onClose: () => { if (this.paper === p) { this.paper = null; this.card = null; } } });
    this.paper = p;
    const root = p.body.querySelector('.ind-card');
    this.card = { s: what, body: root };
    root.addEventListener('click', (e) => this.onAct(e));
    render();
  }
  closeCard() { const p = this.paper; this.paper = null; this.card = null; try { p?.close?.(); } catch { /* already gone */ } }
  openMachine(s) { this.openCard(s, () => this.renderMachine(s)); }
  onAct(e) {
    const b = e.target.closest('[data-act]');
    if (!b || !this.card) return;
    const game = this.game, ind = this.ind;
    const s = this.card.s;
    const a = b.dataset.act;
    game.audio.play('click', { volume: 0.35 });
    if (a === 'ok') { this.closeCard(); return; }
    if (a === 'ledger') { this.openLedger(); return; }
    if (s === 'ledger') { this.renderLedger(); return; }
    if (this.card.grid) { if (a === 'toggle') { const r = ind.rec(s); r.off = !r.off; } this.renderGrid(s); return; }
    const r = ind.rec(s);
    // [v26 power] orders + keep-stocked targets (src/game/industry/Fab.js)
    if (a === 'order') { ind.fab.order(s, b.dataset.r, 1); game.audio.play('tag', { volume: 0.3 }); }
    if (a === 'keep') ind.fab.cycleKeep(r, b.dataset.r);
    if (a === 'cancel') ind.fab.cancel(s, +b.dataset.i);
    if (a === 'assign') { try { game.staff?.assign?.(b.dataset.w, s); } catch (err) { console.warn('assign', err); } }
    if (a === 'grid') { this.openGrid(s); return; }
    if (a === 'toggle') { r.off = !r.off; game.audio.play(r.off ? 'close' : 'ind_power', { volume: 0.35 }); }
    this.renderMachine(s);
  }
  renderMachine(s, live = false) {
    const c = this.card;
    if (!c || c.s !== s) return;
    const ind = this.ind, game = this.game;
    const d = s.def, I = d.ind;
    const r = I.kind === 'belt' ? null : ind.rec(s);
    const st = ind.status(s);
    // live refresh: only the moving bits (a full redraw when the orders / shift change)
    const sig = r ? `${(r.q || []).join(',')}|${JSON.stringify(r.keep || {})}|${ind.fab.workerName(s)}|${r.off}|${!!r.job}` : '';
    if (live && c.body.querySelector('.st') && sig === c.sig) {
      const stEl = c.body.querySelector('.st');
      stEl.className = `st ${st.mood}`; stEl.textContent = st.text;
      const pg = c.body.querySelector('.prog i');
      if (pg) pg.style.width = `${Math.round(Math.min(1, r?.job?.p || 0) * 100)}%`;
      const hop = c.body.querySelector('.hop');
      if (hop) hop.innerHTML = this.hopperHTML(s, r);
      const pw = c.body.querySelector('.pwline');
      if (pw) pw.innerHTML = this.powerLine(s, r);
      return;
    }
    c.sig = sig;
    const icon = hasSprite(d.icon) ? spriteImg(d.icon, 2) : '';
    let html = `<div class="who"><span class="ib">${icon}</span><div><h2>${esc(d.name)}</h2><div class="st ${st.mood}">${esc(st.text)}</div></div></div>
      <div class="small" style="margin-top:4px">${esc(d.desc)}</div>`;
    if (I.kind === 'craft') {
      ind.fab.migrate(r);
      const rec = RECIPES_FOR[I.machine] || [];
      const cur = r.job?.rid || r.cur;
      html += `<div class="sec"><b>ORDERS</b>${rec.map((rid) => {
        const R = RECIPES[rid];
        const k = r.keep?.[rid] ?? KEEP_DEFAULT;
        return `<div class="ord ${cur === rid ? 'on' : ''}"><span class="nm">${esc(R.name)}</span>${this.bill(R.in)}<span class="arrow">&gt;</span>${this.bill(R.out)}<span class="tm">${R.time}s</span><span class="end"><button class="keep ${k ? '' : 'off'}" data-act="keep" data-r="${rid}" title="Keep this many in storage">${k ? `keep ${k}` : 'keep off'}</button><button class="plus" data-act="order" data-r="${rid}" title="Order one">+1</button></span></div>`;
      }).join('')}
        ${r.q?.length ? `<div class="queue"><span class="small">Queue:</span>${r.q.map((rid, i) => `<span class="qchip ${i === 0 && r.job?.rid === rid ? 'cur' : ''}" data-act="cancel" data-i="${i}" title="Tap to cancel">${img(this.resIcon(rid), 1)}${esc(RECIPES[rid]?.name || rid)}</span>`).join('')}</div>` : '<div class="small" style="margin-top:4px">No orders: the beaver keeps each part stocked up to its target.</div>'}
        <div class="prog"><i style="width:${Math.round(Math.min(1, r.job?.p || 0) * 100)}%"></i></div></div>
      <div class="sec"><b>ON THE MACHINE</b><div class="row hop">${this.hopperHTML(s, r)}</div></div>`;
      html += `<div class="sec"><b>BEAVER ON SHIFT</b><div class="row">${this.crewHTML(s)}</div></div>`;
    } else if (I.kind === 'power') {
      html += `<div class="sec"><b>FUEL</b><div class="row small">Burns a lump of coal (${I.burn.coal}s) or a log (${I.burn.wood}s) from the nearest storage, only when its grid runs short.</div>
        <div class="row hop">${this.hopperHTML(s, r)}</div></div>`;
    } else if (I.kind === 'loader') {
      html += `<div class="sec"><b>SUPPLY CHUTE</b><div class="row small">Put a belt next to the chute, pointing away. Run the belt into a Smelter, Machine Shop or Generator: the chute sends exactly what that machine needs from storage.</div><div class="row">Sent: <b>${r.sent || 0}</b></div></div>`;
    } else if (I.kind === 'feeder') {
      html += `<div class="sec"><b>AMMO</b><div class="row small">Fires your selected fish food (or Classic Pellets) at hungry fish within ${I.radius} tiles.</div><div class="row">Scoops fired: <b>${r.fed || 0}</b></div></div>`;
    } else if (I.kind === 'harvester') {
      html += `<div class="sec"><b>HARVEST</b><div class="row small">Picks ripe crops within ${I.radius} tiles into your food store.</div><div class="row">Picked: <b>${r.picked || 0}</b></div></div>`;
    } else if (I.kind === 'hauler') {
      html += `<div class="sec"><b>DRONE</b><div class="row small">Flies loose logs within ${I.radius} tiles to a Wood Garage, and ore sacks into storage.</div><div class="row">Delivered: <b>${r.hauled || 0}</b></div></div>`;
    } else if (I.kind === 'vending') {
      html += `<div class="sec"><b>SNACKS</b><div class="row small">Sells produce from your food store to bears walking by (wanted snacks first). Coins go straight in the till.</div><div class="row">Sold: <b>${r.sold || 0}</b></div></div>`;
    } else if (I.kind === 'scrubber' || I.kind === 'filter') {
      html += `<div class="sec"><b>CLEAN-UP</b><div class="row">-${I.clean} pollution while powered (day and night)</div></div>`;
    }
    html += `<div class="sec"><b>POWER &amp; SMOG</b><div class="row pwline">${this.powerLine(s, r)}</div>${I.pollute ? `<div class="row small">${img('ind_smog', 1)} +${I.pollute} smog while running</div>` : ''}</div>`;
    const toggle = r ? `<button class="btn small ${r.off ? '' : 'red'}" data-act="toggle">${r.off ? 'Switch on' : 'Switch off'}</button>` : '';
    const grid = I.power || I.kind === 'power' ? `<button class="btn small" data-act="grid">${img('pw_bolt', 1)} Grid</button>` : '';
    html += `<div class="btns">${toggle}${grid}<button class="btn small" data-act="ledger">${img('ind_gear', 1)} Industry</button><button class="btn small green" data-act="ok">OK</button></div>`;
    c.body.innerHTML = html;
  }
  resIcon(rid) { const id = Object.keys(RECIPES[rid]?.out || {})[0]; return RES_INFO[id]?.icon || 'ind_gear'; }
  // who runs it: a hired staff beaver (game.staff) or Flint's apprentice
  crewHTML(s) {
    const game = this.game, fab = this.ind.fab;
    const staff = fab.staff();
    const w = fab.workers(s)[0];
    if (w) {
      const sk = w.skills?.fab;
      return `${img('beaver', 1)}<span class="grow"><b>${esc(w.name || 'A beaver')}</b> ${staff ? `<span class="tag">${esc(s.def.jobs?.title || 'Fabricator')}</span>${sk ? ` <span class="small">fab skill ${sk}</span>` : ''}` : '<span class="tag green">apprentice</span> <span class="small">from the Lodge</span>'}</span>`;
    }
    if (!staff) return `${img('beaver', 1)}<span class="grow small">An apprentice beaver is on the way.</span>`;
    let idle = [];
    try { idle = (game.staff.list || []).filter((b) => !b.job && !b.hurt).sort((a, b) => (b.skills?.fab || 0) - (a.skills?.fab || 0)); } catch { idle = []; }
    const best = idle[0];
    return `${img('beaver', 1)}<span class="grow small">Nobody on shift. A beaver with the fab skill fetches, fabricates and carries.</span>${best ? `<button class="btn small gold" data-act="assign" data-w="${esc(best.id)}">Assign ${esc(best.name)}</button>` : ''}`;
  }
  hopperHTML(s, r) {
    if (!r) return '';
    const h = Object.entries(r.h || {}).filter(([, n]) => n > 0).map(([id, n]) => this.rc(id, n)).join('');
    const o = Object.entries(r.o || {}).filter(([, n]) => n > 0).map(([id, n]) => this.rc(id, n)).join('');
    const t = Object.entries(r.t || {}).filter(([, n]) => n > 0).map(([id, n]) => this.rc(id, n)).join('');
    const job = r.job ? `<span class="small">working on ${esc(RECIPES[r.job.rid]?.name)}</span>` : '';
    if (s.def.ind.kind === 'power') return `<span class="small">${r.fuel > 0 ? `${Math.ceil(r.fuel)}s of ${r.fuelId === 'wood' ? 'logs' : 'coal'} left` : 'firebox empty'}</span>${h}`;
    return `${h || '<span class="small">hopper empty</span>'}${t ? `<span class="small">on the way:</span>${t}` : ''}${job}${o ? `<span class="arrow">&gt;</span>${o}<span class="small">on the bench</span>` : ''}`;
  }
  powerLine(s, r) {
    const I = s.def.ind;
    const P = this.game.power;
    if (!P) return `${img('ind_power', 1)} No grid`;
    const info = P.info(s);
    const st = P.status(s);
    if (I.kind === 'power') return `${img('ind_power', 1)} Makes ${I.out} when burning. ${info ? `Grid: ${fmt1(info.supply)} made / ${fmt1(info.demand)} used` : 'Not wired to anything yet'}`;
    if (!I.power) return `${img('ind_power', 1)} Needs no power`;
    if (st === 'nogrid') return `${img('pw_plug', 1)} Uses ${I.power}. <b style="color:#a02a22">Not connected</b>: put it next to a generator or within 4 tiles of a pole`;
    const bat = info.cap ? ` · battery ${Math.round(info.charge)}/${info.cap}` : '';
    const low = st === 'brown' || st === 'dark';
    return `${img('ind_power', 1)} Uses ${I.power}. Grid: <b style="color:${low ? '#a02a22' : 'inherit'}">${fmt1(info.supply)} made / ${fmt1(info.demand)} used</b>${st === 'brown' ? ` (${Math.round(info.ratio * 100)}%)` : st === 'dark' ? ' (dark!)' : ''}${bat}`;
    void r;
  }

  // ------------------------------------------------------------ [v26 power] the grid card (poles, sources, batteries)
  openGrid(s) {
    this.openCard(s, () => this.renderGrid(s));
    if (this.card) this.card.grid = true;
    this.renderGrid(s);
  }
  renderGrid(s) {
    const c = this.card;
    if (!c || c.s !== s) return;
    const P = this.game.power;
    const info = P?.info(s);
    const d = s.def;
    const icon = hasSprite(d.icon) ? spriteImg(d.icon, 2) : '';
    const out = P?.output(s) || 0;
    let what = '';
    const k = d.pw?.kind;
    if (k === 'solar') what = `Sunlight ${Math.round((P.solarK() / 1.1) * 100)}%: making <b>${fmt1(out)}</b> of ${d.pw.out}. Night: nothing.`;
    else if (k === 'wind') what = `Wind ${Math.round(P.windK(s) * 100)}%: making <b>${fmt1(out)}</b>. Day and night.`;
    else if (k === 'water') { const f = P.flowAt(s.x, s.z); what = f ? `Current ${Math.round(f.speed * 100)}%: making <b>${fmt1(out)}</b>. Day and night.` : 'No current here!'; }
    else if (k === 'battery') { const ch = P.charge(s); const n = Math.round((ch / d.pw.cap) * 8); what = `<span class="bat">${Array.from({ length: 8 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span> <b>${Math.round(ch)}</b> / ${d.pw.cap} stored. ${info && info.give > 0.01 ? 'Discharging.' : info && info.supply > info.demand + 0.01 && ch < d.pw.cap - 0.5 ? 'Charging.' : 'Holding.'}`; }
    else if (k === 'pole') what = `Feeds every machine within ${d.pw.reach} tiles, and links to poles up to ${d.pw.link} tiles away.`;
    else if (d.ind?.kind === 'power') what = this.ind.status(s).text;
    else what = this.ind.status(s).text;
    let html = `<div class="who"><span class="ib">${icon}</span><div><h2>${esc(d.name)}</h2><div class="st ${info?.live ? (info.ratio < 0.999 && info.demand > 0 ? 'idle' : 'good') : 'bad'}">${info ? (info.live ? (info.ratio < 0.999 && info.demand > 0 ? `Brownout: ${Math.round(info.ratio * 100)}%` : 'Grid OK') : 'Grid dark') : 'Not connected'}</div></div></div>
      <div class="sec"><b>THIS ONE</b><div class="row">${what}</div></div>`;
    if (info) {
      const max = Math.max(info.supply + info.give, info.demand, 1);
      html += `<div class="sec"><b>GRID #${info.id}</b><div class="row">${img('ind_power', 1)} Making <b>${fmt1(info.supply)}</b> · using <b>${fmt1(info.demand)}</b>${info.cap ? ` · battery <b>${Math.round(info.charge)}</b>/${info.cap}` : ''}</div>
        <div class="gridbar"><i style="width:${Math.round(Math.min(1, (info.supply + info.give) / max) * 100)}%"></i><u style="left:calc(${Math.round(Math.min(1, info.demand / max) * 100)}% - 2px)"></u></div>
        <div class="row small" style="margin-top:4px">${info.sources.map((x) => `${esc(x.s.def.name)} ${fmt1(x.out)}`).join(' · ') || 'No power source: add a generator, solar panel, water wheel or wind turbine.'}</div>
        <div class="row small">${info.users.map((x) => `${esc(x.s.def.name)} ${x.draw ? fmt1(x.draw) : 'idle'}`).join(' · ') || 'No machines on this grid yet.'}</div>
        <div class="row small">${info.poles} pole${info.poles === 1 ? '' : 's'}${info.bats.length ? ` · ${info.bats.length} battery bank${info.bats.length > 1 ? 's' : ''}` : ''}</div></div>`;
    }
    const r = d.ind && d.ind.kind !== 'belt' ? this.ind.rec(s) : null;
    html += `<div class="btns">${r ? `<button class="btn small ${r.off ? '' : 'red'}" data-act="toggle">${r.off ? 'Switch on' : 'Switch off'}</button>` : ''}<button class="btn small" data-act="ledger">${img('ind_gear', 1)} Industry</button><button class="btn small green" data-act="ok">OK</button></div>`;
    c.body.innerHTML = html;
  }

  // ------------------------------------------------------------ the Industry ledger
  openLedger() { this.openCard('ledger', () => this.renderLedger()); }
  renderLedger() {
    const c = this.card;
    if (!c || c.s !== 'ledger') return;
    const ind = this.ind, game = this.game;
    const S = ind.summary();
    const t = S.tier;
    const segs = POLLUTION_TIERS.map((T, i) => { const to = POLLUTION_TIERS[i + 1]?.at ?? 100; return `<span style="width:${to - T.at}%;background:${T.color}"></span>`; }).join('');
    const eff = {
      clean: ['Fresh air. The fish are fine.'],
      hazy: ['Fish breed a bit slower.', 'The pond is turning a little green.'],
      smoggy: ['Fish breed much slower and look sad.', 'The pond is murky.', 'Some bears knock a star off their reviews.'],
      toxic: ['Fish barely breed.', 'The pond looks like soup.', 'Lots of bears knock a star off. Some cough.'],
    }[t.id];
    const machines = ind.list.filter((s) => s.built && s.def.ind.kind !== 'belt' && s.def.ind.kind !== 'tree');
    const counts = {};
    for (const s of machines) counts[s.type] = (counts[s.type] || 0) + 1;
    // [v26 power] grids + storage (no resource counts here: tap a storage building)
    const P = game.power;
    const nets = (P?.nets || []).filter((n) => n.sources.length || n.gens.length || n.bats.length || n.users.length);
    const st = game.storage;
    const depots = st ? st.summary() : [];
    let html = `<div class="who"><span class="ib">${img('ind_gear', 2)}</span><div><h2>Flint &amp; Steel Works</h2><div class="st ${t.id === 'clean' ? 'good' : t.id === 'hazy' ? 'idle' : 'bad'}">Air: ${esc(t.name)} (${Math.round(S.pol)})</div></div></div>
      <div class="sec"><b>POLLUTION</b><div class="meter">${segs}<i style="left:calc(${Math.min(99, S.pol)}% - 2px)"></i><u style="left:${Math.min(99, S.target)}%"></u></div>
        <div class="row small" style="margin-top:4px">${img('ind_smog', 1)} Smoke +${Math.round(S.emit * 1.6)} &nbsp; ${img('ind_scrubber', 1)} Clean-up -${Math.round(S.clean)} (${Math.min(12, S.trees)} trees) &nbsp; heading for ${Math.round(S.target)}</div>
        ${eff.map((e) => `<div class="eff ${t.id === 'smoggy' || t.id === 'toxic' ? 'bad' : ''}">- ${esc(e)}</div>`).join('')}
        <div class="small">Air Scrubbers, Water Filters and trees (pine saplings, willows, maples) pull it down. The air clears a bit every night. Solar, wind and water power make no smoke at all.</div></div>
      <div class="sec"><b>POWER</b>${nets.length ? nets.map((n) => `<div class="row">${img('ind_power', 1)} Grid #${n.id}: <b>${fmt1(n.supply)}</b> made / <b>${fmt1(n.demand)}</b> used${n.cap ? ` · battery ${Math.round(n.charge)}/${n.cap}` : ''}${n.demand > 0 && n.ratio < 0.999 ? ` <span class="tag red">${n.live ? `BROWNOUT ${Math.round(n.ratio * 100)}%` : 'DARK'}</span>` : ''}</div>`).join('') : '<div class="row small">No grid yet. Machines need a generator next to them, or poles.</div>'}
        <div class="row small">${Object.entries(counts).map(([ty, n]) => `${esc(STRUCTURES[ty]?.name || ty)} x${n}`).join(', ') || 'No machines yet.'}</div></div>
      <div class="sec"><b>STORAGE</b>${depots.length ? depots.map((x) => `<div class="row">${img(x.s.def.icon || 'st_crate', 1)} ${esc(x.name)} <span class="grow"></span><b>${x.used}</b>/${x.cap}${x.used >= x.cap ? ' <span class="tag red">FULL</span>' : ''}</div>`).join('') : '<div class="row small">No storage yet. Build an Ore Shed or a Warehouse.</div>'}
        <div class="row small">Tap a storage building to see what's inside.</div></div>
      <div class="btns"><button class="btn small green" data-act="ok">OK</button></div>`;
    c.body.innerHTML = html;
    void game;
  }
}
