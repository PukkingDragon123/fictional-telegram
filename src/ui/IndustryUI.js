// [F&S industry] Industry UI: a HUD pill (smog meter, power, crew), the machine
// cards (recipes, hopper, worker bear, power, on/off, Load) and the Industry
// ledger (pollution breakdown + effects, power grid, crew + wages, stockpile).
// Pure DOM on top of game.ui.showModal (the paper cards); styles injected once.
// Created lazily by src/game/Industry.js once #ui exists.
import { spriteImg, hasSprite } from './sprites.js';
import { openPaper } from './paper.js';
import { RECIPES, POLLUTION_TIERS } from '../data/structuresIndustry.js';
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
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
      pw.style.display = S.power.demand > 0 || S.power.gens ? '' : 'none';
      el.querySelector('.pwv').textContent = `${S.power.supply}/${S.power.demand}`;
      pw.classList.toggle('low', S.power.demand > 0 && S.power.ratio < 0.999);
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
    if (s === 'ledger') {
      const w = ind.st.w.find((x) => String(x.id) === b.dataset.w);
      if (a === 'home' && w) w.at = null;
      if (a === 'fire' && w) ind.fire(w);
      if (a === 'pay') ind.payStrike();
      this.renderLedger();
      return;
    }
    const r = ind.rec(s);
    if (a === 'recipe') { r.r = b.dataset.r; r.cur = null; }
    if (a === 'hire') ind.hire(s);
    if (a === 'home') { const w = ind.workerAt(s); if (w) w.at = null; }
    if (a === 'load') { const n = ind.loadFromStock(s); if (!n) game.notify('Nothing to load: the stockpile is out of those.', 'no'); }
    if (a === 'toggle') { r.off = !r.off; game.audio.play(r.off ? 'close' : 'ind_power', { volume: 0.35 }); }
    if (a === 'pay') ind.payStrike();
    this.renderMachine(s);
  }
  renderMachine(s, live = false) {
    const c = this.card;
    if (!c || c.s !== s) return;
    const ind = this.ind, game = this.game;
    const d = s.def, I = d.ind;
    const r = I.kind === 'belt' ? null : ind.rec(s);
    const st = ind.status(s);
    const S = ind.summary();
    // live refresh: only the moving bits
    if (live && c.body.querySelector('.st')) {
      const stEl = c.body.querySelector('.st');
      stEl.className = `st ${st.mood}`; stEl.textContent = st.text;
      const pg = c.body.querySelector('.prog i');
      if (pg) pg.style.width = `${Math.round(Math.min(1, r?.p || 0) * 100)}%`;
      const hop = c.body.querySelector('.hop');
      if (hop) hop.innerHTML = this.hopperHTML(s, r);
      const pw = c.body.querySelector('.pwline');
      if (pw) pw.innerHTML = this.powerLine(s, r, S);
      return;
    }
    const icon = hasSprite(d.icon) ? spriteImg(d.icon, 2) : '';
    let html = `<div class="who"><span class="ib">${icon}</span><div><h2>${esc(d.name)}</h2><div class="st ${st.mood}">${esc(st.text)}</div></div></div>
      <div class="small" style="margin-top:4px">${esc(d.desc)}</div>`;
    if (I.kind === 'craft') {
      const rec = ind.recipesOf(s);
      const have = (id, n) => ind.stock(id) + (r.h[id] || 0) >= n;
      html += `<div class="sec"><b>RECIPE</b><div class="recipes">
        <button class="rcp ${r.r === 'auto' ? 'on' : ''}" data-act="recipe" data-r="auto"><span class="nm">Auto</span><span class="small">makes whatever you're lowest on</span></button>
        ${rec.map((rid) => { const R = RECIPES[rid]; return `<button class="rcp ${r.r === rid ? 'on' : ''}" data-act="recipe" data-r="${rid}"><span class="nm">${esc(R.name)}</span>${this.bill(R.in, have)}<span class="arrow">&gt;</span>${this.bill(R.out)}<span class="tm">${R.time}s</span></button>`; }).join('')}
      </div><div class="prog"><i style="width:${Math.round(Math.min(1, r.p || 0) * 100)}%"></i></div></div>
      <div class="sec"><b>HOPPER</b><div class="row hop">${this.hopperHTML(s, r)}</div></div>`;
      const w = ind.workerAt(s);
      const canHire = !!game.state.research?.includes('r_ind_smelter');
      html += `<div class="sec"><b>WORKER BEAR</b><div class="row">${img('ind_worker', 1)}${w
        ? `<span class="grow"><b>${esc(w.name)}</b> ${w.strike ? '<span class="tag red">ON STRIKE</span>' : '<span class="tag">on shift</span>'} <span class="small">${S.wage} coins / day</span></span>${w.strike ? `<button class="btn small gold" data-act="pay">Pay wages</button>` : ''}<button class="btn small red" data-act="home">Send home</button>`
        : `<span class="grow small">Nobody here. A worker fetches ore from the stockpile and runs it, no power needed.</span>${canHire ? `<button class="btn small gold" data-act="hire">${img('coin', 1)} ${ind.st.w.some((x) => !x.at) ? 'Assign idle bear' : `Hire (${ind.hireCost()})`}</button>` : ''}`}</div></div>`;
    } else if (I.kind === 'power') {
      html += `<div class="sec"><b>FUEL</b><div class="row">${this.rc('coal', ind.stock('coal'))}<span class="small">coal: ${I.burn.coal}s each</span>${this.rc('wood', ind.stock('wood'))}<span class="small">logs: ${I.burn.wood}s each</span></div>
        <div class="row hop">${this.hopperHTML(s, r)}</div></div>`;
    } else if (I.kind === 'loader') {
      html += `<div class="sec"><b>SUPPLY CHUTE</b><div class="row small">Put a belt next to the chute, pointing away. Run the belt into a Smelter, Machine Shop or Generator: the chute sends exactly what that machine needs from your stockpile.</div><div class="row">Sent: <b>${r.sent || 0}</b></div></div>`;
    } else if (I.kind === 'feeder') {
      html += `<div class="sec"><b>AMMO</b><div class="row small">Fires your selected fish food (or Classic Pellets) at hungry fish within ${I.radius} tiles.</div><div class="row">Scoops fired: <b>${r.fed || 0}</b></div></div>`;
    } else if (I.kind === 'harvester') {
      html += `<div class="sec"><b>HARVEST</b><div class="row small">Picks ripe crops within ${I.radius} tiles into your food store.</div><div class="row">Picked: <b>${r.picked || 0}</b></div></div>`;
    } else if (I.kind === 'hauler') {
      html += `<div class="sec"><b>DRONE</b><div class="row small">Flies loose logs within ${I.radius} tiles to a Wood Garage, and ore sacks to an Ore Shed.</div><div class="row">Delivered: <b>${r.hauled || 0}</b></div></div>`;
    } else if (I.kind === 'vending') {
      html += `<div class="sec"><b>SNACKS</b><div class="row small">Sells produce from your food store to bears walking by (wanted snacks first). Coins go straight in the till.</div><div class="row">Sold: <b>${r.sold || 0}</b></div></div>`;
    } else if (I.kind === 'scrubber' || I.kind === 'filter') {
      html += `<div class="sec"><b>CLEAN-UP</b><div class="row">-${I.clean} pollution while powered</div></div>`;
    }
    html += `<div class="sec"><b>POWER &amp; SMOG</b><div class="row pwline">${this.powerLine(s, r, S)}</div>${I.pollute ? `<div class="row small">${img('ind_smog', 1)} +${I.pollute} smog while running</div>` : ''}</div>`;
    const loadBtn = I.kind === 'craft' ? `<button class="btn small" data-act="load">Load from stockpile</button>` : '';
    const toggle = r ? `<button class="btn small ${r.off ? '' : 'red'}" data-act="toggle">${r.off ? 'Switch on' : 'Switch off'}</button>` : '';
    html += `<div class="btns">${loadBtn}${toggle}<button class="btn small" data-act="ledger">${img('ind_gear', 1)} Industry</button><button class="btn small green" data-act="ok">OK</button></div>`;
    c.body.innerHTML = html;
  }
  hopperHTML(s, r) {
    if (!r) return '';
    const h = Object.entries(r.h || {}).filter(([, n]) => n > 0).map(([id, n]) => this.rc(id, n)).join('');
    const o = Object.entries(r.o || {}).filter(([, n]) => n > 0).map(([id, n]) => this.rc(id, n)).join('');
    const job = r.job ? `<span class="small">working on ${esc(RECIPES[r.job]?.name)}</span>` : '';
    if (s.def.ind.kind === 'power') return `<span class="small">${r.fuel > 0 ? `${Math.ceil(r.fuel)}s of ${r.fuelId === 'wood' ? 'logs' : 'coal'} left` : 'firebox empty'}</span>${h}`;
    return `${h || '<span class="small">empty</span>'}${job}${o ? `<span class="arrow">&gt;</span>${o}<span class="small">waiting</span>` : ''}`;
  }
  powerLine(s, r, S) {
    const I = s.def.ind;
    const P = S.power;
    if (I.kind === 'power') return `${img('ind_power', 1)} Makes ${I.out} power. Grid: ${P.supply} made / ${P.demand} needed`;
    if (!I.power) return `${img('ind_power', 1)} Needs no power`;
    const low = P.demand > 0 && P.ratio < 0.999;
    return `${img('ind_power', 1)} Uses ${I.power}. Grid: <b style="color:${low ? '#a02a22' : 'inherit'}">${P.supply} / ${P.demand}</b>${low ? ` (${Math.round(P.ratio * 100)}%)` : ''}`;
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
    const W = S.workers;
    const strike = W.some((w) => w.strike);
    const where = (w) => { if (!w.at) return 'idle'; const s = ind.list.find((m) => `${m.x},${m.z}` === w.at); return s ? s.def.name : 'idle'; };
    const found = this.game.res?.found?.() || RES_IDS.filter((id) => (this.game.res?.count(id) || 0) > 0);
    let html = `<div class="who"><span class="ib">${img('ind_gear', 2)}</span><div><h2>Flint &amp; Steel Works</h2><div class="st ${t.id === 'clean' ? 'good' : t.id === 'hazy' ? 'idle' : 'bad'}">Air: ${esc(t.name)} (${Math.round(S.pol)})</div></div></div>
      <div class="sec"><b>POLLUTION</b><div class="meter">${segs}<i style="left:calc(${Math.min(99, S.pol)}% - 2px)"></i><u style="left:${Math.min(99, S.target)}%"></u></div>
        <div class="row small" style="margin-top:4px">${img('ind_smog', 1)} Smoke +${Math.round(S.emit * 1.6)} &nbsp; ${img('ind_scrubber', 1)} Clean-up -${Math.round(S.clean)} (${Math.min(12, S.trees)} trees) &nbsp; heading for ${Math.round(S.target)}</div>
        ${eff.map((e) => `<div class="eff ${t.id === 'smoggy' || t.id === 'toxic' ? 'bad' : ''}">- ${esc(e)}</div>`).join('')}
        <div class="small">Air Scrubbers, Water Filters and trees (pine saplings, willows, maples) pull it down. The air clears a bit every night.</div></div>
      <div class="sec"><b>POWER</b><div class="row">${img('ind_power', 1)} ${S.power.supply} made / ${S.power.demand} needed${S.power.demand > 0 && S.power.ratio < 0.999 ? ` <span class="tag red">BROWNOUT ${Math.round(S.power.ratio * 100)}%</span>` : ''} <span class="small">(${S.power.gens} generator${S.power.gens === 1 ? '' : 's'})</span></div>
        <div class="row small">${Object.entries(counts).map(([ty, n]) => `${esc(STRUCTURES[ty]?.name || ty)} x${n}`).join(', ') || 'No machines yet.'}</div></div>
      <div class="sec"><b>CREW</b>${W.length ? `<div class="crew">${W.map((w) => `<div class="row">${img('ind_worker', 1)}<span class="grow"><b>${esc(w.name)}</b> <span class="small">${esc(where(w))}</span> ${w.strike ? '<span class="tag red">STRIKE</span>' : ''}</span>${w.at ? `<button class="btn small" data-act="home" data-w="${w.id}">Send home</button>` : ''}<button class="btn small red" data-act="fire" data-w="${w.id}">Let go</button></div>`).join('')}</div>
        <div class="row small" style="margin-top:4px">Wages: ${W.length} x ${S.wage} = <b>${W.length * S.wage}</b> coins every morning. No pay, no work.</div>${strike ? `<div class="btns"><button class="btn small gold" data-act="pay">${img('coin', 1)} Pay back wages (${W.length * S.wage})</button></div>` : ''}`
        : '<div class="row small">No worker bears yet. Tap a Smelter or Machine Shop to hire one.</div>'}</div>
      <div class="sec"><b>STOCKPILE</b><div class="row">${found.map((id) => this.rc(id, this.game.res.count(id))).join('') || '<span class="small">Empty. Mine some ore!</span>'}${this.rc('wood', ind.stock('wood'))}</div></div>
      <div class="btns"><button class="btn small green" data-act="ok">OK</button></div>`;
    c.body.innerHTML = html;
    void game;
  }
}
