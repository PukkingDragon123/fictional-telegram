// [F&S mining] Mining UI: the resource strip (HUD), the ore vein card and the
// Bear Mine panel (crew, lunch, machines, ore trade with Flint).
//
//   const ui = new MiningUI(mining)    (made by src/game/Mining.js)
//   ui.update(dt)                      keeps the strip + vein card in step
//   ui.openVein(v)                     small card over a vein: amount, status, Mine it / Stop
//   ui.openMine(tab)                   the Bear Mine panel: 'crew' | 'lunch' | 'machines' | 'trade'
//   ui.close()                         closes whatever is open
// [v26 power] No resource strip any more: ore and parts live in storage buildings
// (tap one: src/ui/StorageUI.js). refreshStrip() is kept as a no-op for old callers.
import './mining.css';
import { spriteImg, hasSprite } from './sprites.js';
import { RES_INFO } from '../game/Resources.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s, 'fsm-px') : '');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const VEIN_NAMES = { stone: 'Stone Seam', coal: 'Coal Seam', copper: 'Copper Vein', iron: 'Iron Vein', gold: 'Gold Vein', crystal: 'Crystal Pocket' };

export class MiningUI {
  constructor(mining) {
    this.m = mining;
    this.game = mining.game;
    this.strip = null;
    this.vein = null; // { v, el }
    this.panel = null; // { el, tab }
    this.stripKey = '';
    this.game.on('res', (e) => this.onRes(e));
    this.onKey = (e) => { if (e.key === 'Escape' && (this.panel || this.vein)) { e.stopPropagation(); this.close(); } };
    window.addEventListener('keydown', this.onKey, true);
  }
  get root() { return this.game.ui?.root || document.body; }
  sfx(n, v = 0.35) { this.game.audio?.play(n, { volume: v }); }

  // ------------------------------------------------------------------ resource strip
  refreshStrip(force = false) {
    const game = this.game;
    if (game.storage) { this.strip?.remove(); this.strip = null; return; } // [v26 power] no HUD strip: storage buildings
    if (!game.ui?.root || !game.res) return;
    const ids = game.res.found();
    const key = ids.join(',');
    if (!this.strip) {
      this.strip = document.createElement('div');
      this.strip.className = 'fsm-strip';
      this.strip.title = 'Ore & parts stockpile';
      this.strip.addEventListener('click', (ev) => { ev.stopPropagation(); if (this.m.quarryOpen()) this.openMine('trade'); });
      this.root.appendChild(this.strip);
    }
    if (force || key !== this.stripKey) {
      this.stripKey = key;
      this.strip.innerHTML = ids.map((id) => `<span class="fsm-chip" data-id="${id}" title="${esc(RES_INFO[id].name)}">${ico(RES_INFO[id].icon, 1)}<b>${fmt(game.res.count(id))}</b></span>`).join('');
    }
    this.strip.classList.toggle('hidden', !ids.length);
  }
  onRes(e) {
    if (!this.strip || !this.stripKey.split(',').includes(e.id)) { this.refreshStrip(); }
    const chip = this.strip?.querySelector(`.fsm-chip[data-id="${e.id}"]`);
    if (chip) {
      chip.querySelector('b').textContent = fmt(e.total);
      chip.classList.remove('bump', 'down');
      void chip.offsetWidth;
      chip.classList.add(e.n > 0 ? 'bump' : 'down');
    }
    if (e.first) this.game.notify?.(this.game.storage ? `New find: <b>${esc(RES_INFO[e.id].name)}</b>! Stored in the ${esc(e.s?.def?.name || 'storage')}: tap it to look inside.` : `New find: <b>${esc(RES_INFO[e.id].name)}</b>! It's in your stockpile (top left).`, 'excited', { dur: 3.5 }); // [v26 power]
    if (this.panel?.tab === 'trade' || this.panel?.tab === 'machines') this.renderPanel();
  }

  // ------------------------------------------------------------------ vein card
  openVein(v) {
    this.closeVein();
    this.closePanel();
    const el = document.createElement('div');
    el.className = 'fsm-card pop';
    el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.root.appendChild(el);
    this.vein = { v, el };
    this.renderVein();
  }
  renderVein() {
    const V = this.vein;
    if (!V) return;
    const m = this.m, v = V.v;
    const left = m.left(v), cap = m.veinCap(v);
    const block = m.veinBlock(v);
    const marked = m.marked(v);
    const working = !!v.assigned;
    const sacks = m.sacksAt(v);
    const status = !m.has('r_mine_pick') ? 'Research <b>Beaver Pickaxes</b> (Flint &amp; Steel) to mine it.'
      : block ? esc(block)
        : marked ? (working ? 'A beaver is hacking away!' : 'Marked: the next free beaver comes up.') : 'Mark it and a beaver will mine it (1 paid job a sack).';
    V.el.innerHTML = `
      <div class="fsm-head">${ico(RES_INFO[v.kind].icon, 2)}<b>${VEIN_NAMES[v.kind]}</b><button class="fsm-x" title="Close">X</button></div>
      <div class="fsm-bar"><i style="width:${Math.round((left / cap) * 100)}%;background:${RES_INFO[v.kind].color}"></i><span>${left} / ${cap} ${esc(RES_INFO[v.kind].name)}</span></div>
      <div class="fsm-body">${status}${sacks ? `<br><span class="fsm-dim">${sacks} sack${sacks > 1 ? 's' : ''} waiting to be hauled</span>` : ''}</div>
      <div class="fsm-btns">${m.has('r_mine_pick') ? `<button class="fsm-b ${marked ? 'stop' : 'go'}" ${!marked && block ? 'disabled' : ''}>${ico('pickaxe', 1)} ${marked ? 'Stop mining' : 'Mine it!'}</button>` : ''}</div>`;
    V.el.querySelector('.fsm-x').onclick = () => this.closeVein();
    const b = V.el.querySelector('.fsm-b');
    if (b) b.onclick = () => { const on = m.toggleMark(v); this.sfx(on ? 'tag' : 'pop_in', 0.4); this.renderVein(); if (on) setTimeout(() => this.closeVein(), 600); };
    V.key = `${left}|${marked}|${working}|${sacks}|${block}`;
  }
  placeVein() {
    const V = this.vein;
    const p = this.m.veinPos(V.v);
    const q = this.m.screen(p.x, p.y + 1.0, p.z);
    const w = V.el.offsetWidth || 260, h = V.el.offsetHeight || 120;
    const x = Math.max(6, Math.min(window.innerWidth - w - 6, q.x - w / 2)), y = Math.max(6, Math.min(window.innerHeight - h - 90, q.y - h - 16));
    V.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (q.visible === false) this.closeVein();
  }
  closeVein() { if (this.vein) { this.vein.el.remove(); this.vein = null; } }

  // ------------------------------------------------------------------ the Bear Mine panel
  openMine(tab = 'crew') {
    this.closeVein();
    if (!this.panel) {
      const wrap = document.createElement('div');
      wrap.className = 'fsm-wrap';
      wrap.innerHTML = '<div class="fsm-panel pop"><div class="fsm-ph"><span class="fsm-pi"></span><h2>The Bear Mine</h2><button class="fsm-x" title="Close">X</button></div><div class="fsm-tabs"></div><div class="fsm-pb"></div></div>';
      wrap.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.target === wrap) this.closePanel(); });
      wrap.querySelector('.fsm-x').onclick = () => { this.closePanel(); this.sfx('close'); };
      this.root.appendChild(wrap);
      this.panel = { el: wrap, tab };
      this.sfx('open');
    }
    this.panel.tab = tab;
    this.renderPanel();
    this.game.emit('mineOpen', tab);
  }
  closePanel() { if (this.panel) { this.panel.el.remove(); this.panel = null; } }
  close() { this.closeVein(); this.closePanel(); }

  renderPanel() {
    const P = this.panel;
    if (!P) return;
    const m = this.m, I = m.mineInfo();
    P.el.querySelector('.fsm-pi').innerHTML = ico('mine', 2);
    const tabs = [['crew', 'hardhat', 'Crew'], ['lunch', 'lunchbox', 'Lunch'], ['machines', 'drill', 'Machines'], ['trade', 'res_gold', 'Sell ore']];
    P.el.querySelector('.fsm-tabs').innerHTML = tabs.map(([id, icon, name]) => `<button class="fsm-tab ${P.tab === id ? 'on' : ''}" data-t="${id}">${ico(icon, 1)}${name}</button>`).join('');
    P.el.querySelectorAll('.fsm-tab').forEach((b) => { b.onclick = () => { this.sfx('page', 0.3); this.openMine(b.dataset.t); }; });
    const body = P.el.querySelector('.fsm-pb');
    let html = '';
    if (P.tab === 'trade') html = this.tradeHtml();
    else if (!I.open) html = `<div class="fsm-locked">${ico('mine', 3)}<p>Flint's Quarry is still in the fog.<br>Research the <b>Mountain Survey</b> in the Lab.</p></div>`;
    else if (!I.unlocked) html = `<div class="fsm-locked">${ico('mine', 3)}<p>Flint says there's a fine seam right behind his shack.<br>Research <b>The Bear Mine</b> (Flint &amp; Steel) to dig it.</p></div>`;
    else if (!I.built && !I.building) html = `<div class="fsm-locked">${ico('mine', 3)}<p>Dig a mine into the quarry wall, then hire worker bears.<br>They dig ore all day. They also eat.</p><button class="fsm-b go big" data-a="build" ${this.game.canAfford(I.buildCost) ? '' : 'disabled'}>${ico('pickaxe', 1)} Dig the mine · ${ico('coin', 1)}${I.buildCost}</button></div>`;
    else if (I.building) html = `<div class="fsm-locked">${ico('hammer', 3)}<p>Digging... the beavers say it's "basically done".</p><div class="fsm-bar big"><i style="width:${Math.round((1 - Math.max(0, I.buildLeft) / I.buildTime) * 100)}%;background:#e8a030"></i><span>${Math.ceil(Math.max(0, I.buildLeft))} s</span></div></div>`;
    else if (P.tab === 'crew') html = this.crewHtml(I);
    else if (P.tab === 'lunch') html = this.lunchHtml(I);
    else html = this.machinesHtml(I);
    body.innerHTML = html + '<div class="fsm-msg"></div>';
    body.querySelectorAll('[data-a]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); this.act(b.dataset.a, b.dataset); }; });
    P.key = this.panelKey(I);
  }
  panelKey(I) {
    return [this.panel?.tab, I.built, I.building && Math.ceil(I.buildLeft), I.workers.map((w) => `${w.name}${Math.round(w.hunger * 20)}${w.strike}${w.trips}`).join(','), I.meals, I.lunchFood, I.dugToday, Object.values(I.machines).map((x) => x.built).join(''), this.game.state.coins >= 0 ? Math.floor(this.game.state.coins / 10) : 0].join('|');
  }
  msg(text, bad = false) {
    const el = this.panel?.el.querySelector('.fsm-msg');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('bad', bad);
  }
  act(a, d) {
    const m = this.m;
    let r = null;
    if (a === 'build') r = m.buildMine();
    else if (a === 'hire') r = m.hire();
    else if (a === 'fire') r = { ok: m.fire(+d.i) };
    else if (a === 'lunch') r = m.lunchRun();
    else if (a === 'machine') r = m.buildMachine(d.id);
    else if (a === 'sell') r = m.sellOre(d.id, d.n === 'all' ? 1e9 : +d.n);
    if (r && !r.ok) { this.sfx('error', 0.35); this.renderPanel(); this.msg(r.msg || 'Can\'t do that.', true); return; }
    this.sfx(a === 'sell' ? 'coins' : 'click', 0.4);
    this.renderPanel();
    if (a === 'lunch' && r?.n) this.msg(`Sent ${r.n} lunch pail${r.n > 1 ? 's' : ''} up the mountain!`);
    if (a === 'sell' && r?.coins) this.msg(`Flint pays ${r.coins} coins. "Pleasure."`);
  }

  crewHtml(I) {
    const rows = I.workers.map((w, i) => {
      const st = w.strike ? '<em class="strike">ON STRIKE</em>' : w.hunger < 0.35 ? '<em class="hungry">Hungry</em>' : '<em class="ok">Digging</em>';
      return `<div class="fsm-row">${ico('bear_construction', 1) || ico('hardhat', 2)}<div class="fsm-rc"><b>${esc(w.name)}</b>${st}<div class="fsm-hun" title="Tummy">${ico('lunchbox', 1)}<div class="fsm-bar sm"><i style="width:${Math.round(w.hunger * 100)}%;background:${w.hunger < 0.35 ? '#e04a3a' : '#7ac04a'}"></i></div></div></div><span class="fsm-dim">${w.trips} loads</span><button class="fsm-b sm" data-a="fire" data-i="${i}" title="Send home">Send home</button></div>`;
    }).join('');
    const room = I.workers.length < I.slots;
    return `<p class="fsm-intro">Worker bears dig ore all day and dump it in the bin. Keep the canteen stocked or they strike.</p>
      ${rows || '<p class="fsm-dim center">Nobody here yet. Hire your first bear!</p>'}
      <div class="fsm-foot"><span>${I.workers.length} / ${I.slots} bunks · dug today: <b>${I.dugToday}</b> · all time: <b>${I.dug}</b></span>
      ${room ? `<button class="fsm-b go" data-a="hire" ${this.game.canAfford(I.hirePrice) ? '' : 'disabled'}>${ico('hardhat', 1)} Hire a bear · ${ico('coin', 1)}${I.hirePrice}</button>` : '<span class="fsm-dim">Bunks full</span>'}</div>`;
  }
  lunchHtml(I) {
    const pails = Array.from({ length: I.mealsCap }, (_, i) => `<span class="fsm-pail ${i < I.meals ? 'on' : ''}"></span>`).join('');
    return `<p class="fsm-intro">One lunch pail per bear per day keeps them happy. Lunch runs take bear food (crops, honey, berries...) from your food bag, then your pantries.</p>
      <div class="fsm-pails">${pails}</div>
      <div class="fsm-foot"><span>${ico('lunchbox', 1)} <b>${I.meals}</b> / ${I.mealsCap} pails · bear food you have: <b>${I.lunchFood}</b>${I.autoLunch ? ' · <em class="ok">Pail Line: auto</em>' : ''}</span>
      <button class="fsm-b go" data-a="lunch" ${I.lunchFood && I.meals < I.mealsCap ? '' : 'disabled'}>${ico('lunchbox', 1)} Lunch run!</button></div>
      ${I.striking ? `<p class="fsm-warn">${I.striking} bear${I.striking > 1 ? 's are' : ' is'} on strike! Send lunch.</p>` : ''}`;
  }
  machinesHtml(I) {
    const game = this.game;
    return '<p class="fsm-intro">Big machines make the mine dig more. Built with coins and ore.</p>' + Object.values(I.machines).map((M) => {
      const bill = Object.entries(M.res).map(([id, n]) => `<span class="${game.res.has(id, n) ? '' : 'miss'}">${ico(RES_INFO[id].icon, 1)}${n}</span>`).join(' ');
      const can = M.unlocked && !M.built && game.canAfford(M.coins) && game.res.hasAll(M.res);
      const right = M.built ? '<em class="ok big">RUNNING</em>' : !M.unlocked ? `<em class="lock">Research ${esc(M.name)}</em>` : `<button class="fsm-b go" data-a="machine" data-id="${M.id}" ${can ? '' : 'disabled'}>Build</button>`;
      return `<div class="fsm-row mach ${M.built ? 'built' : ''}">${ico(M.icon, 2)}<div class="fsm-rc"><b>${esc(M.name)}</b><span>${esc(M.desc)}</span>${M.built ? '' : `<span class="fsm-cost">${ico('coin', 1)}${M.coins} ${bill}</span>`}</div>${right}</div>`;
    }).join('');
  }
  tradeHtml() {
    const game = this.game;
    const ores = Object.entries(RES_INFO).filter(([, R]) => R.kind === 'ore');
    const rows = ores.filter(([id]) => game.res.seen(id)).map(([id, R]) => {
      const n = game.res.count(id);
      return `<div class="fsm-row">${ico(R.icon, 2)}<div class="fsm-rc"><b>${esc(R.name)}</b><span>${ico('coin', 1)}${R.value} each · in storage: <b>${n}</b></span></div><button class="fsm-b sm" data-a="sell" data-id="${id}" data-n="1" ${n ? '' : 'disabled'}>Sell 1</button><button class="fsm-b sm go" data-a="sell" data-id="${id}" data-n="all" ${n ? '' : 'disabled'}>All · ${ico('coin', 1)}${n * R.value}</button></div>`;
    }).join('');
    return `<p class="fsm-intro">Flint buys raw ore. "Fair price." He bites every coin first.</p>${rows || '<p class="fsm-dim center">No ore yet. Mine a vein!</p>'}`;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    this.t = (this.t || 0) + dt;
    if (!this.strip && this.game.ui?.root && this.game.started && !this.game.storage) this.refreshStrip(true); // [v26 power] storage = no strip
    if (this.strip) this.strip.classList.toggle('away', !!(this.game.homes?.active || this.game.lab?.active || this.game.titleMode || this.game.cutscene?.active));
    if (this.vein) {
      this.placeVein();
      const V = this.vein;
      if (V) {
        const v = V.v, m = this.m;
        const key = `${m.left(v)}|${m.marked(v)}|${!!v.assigned}|${m.sacksAt(v)}|${m.veinBlock(v)}`;
        if (key !== V.key) this.renderVein();
      }
    }
    if (this.panel) {
      this.pt = (this.pt || 0) - dt;
      if (this.pt <= 0) { this.pt = 0.5; const k = this.panelKey(this.m.mineInfo()); if (k !== this.panel.key) { const msg = this.panel.el.querySelector('.fsm-msg')?.textContent; this.renderPanel(); if (msg) this.msg(msg); } }
      if (this.game.homes?.active || this.game.cutscene?.active) this.closePanel();
    }
  }
}

