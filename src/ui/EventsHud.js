// [v18 bear events] HUD for the boss days and the blood moon:
//   - a countdown pill under the clock ("Blood moon tomorrow!", "BOSS in 2 days",
//     "BLOOD MOON in 3h 20m") + a "Repair all" button when defenses are damaged
//   - the BOSS bar (hunger, fury timer, phase, favourite food) during a boss fight
//   - the BLOOD MOON bar (wave, hostile bears, night -> dawn progress) during a siege
//   - big title / result cards (boss intro, boss win/loss, siege start, siege result)
// Pure DOM, styles injected once. Created lazily by BearEvents once #ui exists.
import { spriteImg, hasSprite } from './sprites.js';

const CSS = `
.ev-pill { position: absolute; top: 100%; right: 0; margin-top: 4px; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; pointer-events: none; line-height: 1; }
.ev-pill .ev-row { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px 3px 4px; font-family: var(--font2); font-size: 11px; white-space: nowrap;
  color: #fdf4d8; background: #4a2f1d; border: 2px solid #2a1a10; box-shadow: 0 2px 0 rgba(0,0,0,.35); text-shadow: 1px 1px 0 #000; }
.ev-pill .ev-row.moon { background: #5a1418; border-color: #2a0608; }
.ev-pill .ev-row.moon.hot { background: #b0202a; animation: ev-pulse 1s steps(2) infinite; }
.ev-pill .ev-row.boss { background: #3a2a4a; border-color: #1a1024; }
.ev-pill .ev-row.boss.hot { background: #8a3ac0; animation: ev-pulse 1.2s steps(2) infinite; }
.ev-pill .ev-row img { width: 16px; height: 16px; }
.ev-pill button.ev-repair { pointer-events: auto; font-family: var(--font2); font-size: 11px; color: #2a1a10; background: #ffd23f; border: 2px solid #2a1a10; padding: 3px 7px; cursor: pointer; box-shadow: 0 2px 0 #7a5a10; display: inline-flex; gap: 4px; align-items: center; }
.ev-pill button.ev-repair:hover { transform: translateY(-1px); }
@keyframes ev-pulse { 50% { filter: brightness(1.35); } }
.ev-top { position: fixed; left: 50%; transform: translateX(-50%); top: calc(8px + var(--safe-t, 0px)); z-index: 45; display: flex; flex-direction: column; gap: 6px; align-items: center; pointer-events: none; width: min(560px, 92vw); }
.ev-bar { width: 100%; box-sizing: border-box; padding: 6px 10px 7px; background: rgba(26, 12, 14, .88); border: 3px solid #120608; box-shadow: 0 0 0 2px #6a2a2a inset, 0 4px 0 rgba(0,0,0,.4);
  font-family: var(--font2); color: #fdf4d8; text-shadow: 1px 1px 0 #000; }
.ev-bar .ev-head { display: flex; align-items: center; gap: 8px; font-size: 13px; letter-spacing: 1px; }
.ev-bar .ev-head b { font-size: 15px; color: #ffd0a0; }
.ev-bar .ev-head .ev-tag { margin-left: auto; font-size: 11px; padding: 1px 6px; background: #3a2a2a; border: 1px solid #000; }
.ev-bar .ev-tag.p2 { background: #c0302a; animation: ev-pulse .6s steps(2) infinite; }
.ev-bar .ev-tag.p3 { background: #ff5a1a; color: #fff; animation: ev-pulse .35s steps(2) infinite; }
.ev-meter { position: relative; height: 14px; margin-top: 5px; background: #2a1012; border: 2px solid #000; overflow: hidden; }
.ev-meter i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(#ff7a5a, #d02a2a 60%, #9a1a1a); transition: width .25s steps(6); }
.ev-meter i.lag { background: #ffe0a0; transition: width .9s ease-in .25s; }
.ev-meter span { position: absolute; inset: 0; text-align: center; font-size: 10px; line-height: 14px; letter-spacing: 1px; }
.ev-meter.fury { height: 6px; margin-top: 3px; } .ev-meter.fury i { background: linear-gradient(90deg, #ffd23f, #ff8a2a); }
.ev-meter.dawn i { background: linear-gradient(90deg, #6a0a14, #c0303a 70%, #ffb070); }
.ev-sub { display: flex; justify-content: space-between; margin-top: 4px; font-size: 10px; color: #e8c8b0; align-items: center; gap: 6px; }
.ev-sub img { width: 14px; height: 14px; vertical-align: -3px; }
.ev-pop { position: absolute; right: 8px; top: -6px; font-size: 12px; animation: ev-popup 1s ease-out forwards; }
.ev-pop.fav { color: #ff8ad0; } .ev-pop.food { color: #8aff8a; } .ev-pop.def { color: #ffc060; }
@keyframes ev-popup { 0% { opacity: 1; transform: translateY(0) scale(1.4); } 100% { opacity: 0; transform: translateY(-22px) scale(1); } }
.ev-bar.boss { position: relative; }
.ev-bar.shake { animation: ev-shake .4s; }
@keyframes ev-shake { 25% { transform: translateX(-4px); } 50% { transform: translateX(4px); } 75% { transform: translateX(-2px); } }
.ev-card { position: fixed; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 60; text-align: center; pointer-events: none; min-width: min(420px, 90vw); max-width: 92vw;
  padding: 14px 22px 16px; background: rgba(20, 8, 10, .92); border: 4px solid #000; box-shadow: 0 0 0 3px #a0302a inset, 0 8px 0 rgba(0,0,0,.45);
  font-family: var(--font2); color: #fdf4d8; text-shadow: 2px 2px 0 #000; animation: ev-card-in .35s cubic-bezier(.3, 1.6, .5, 1); }
.ev-card.out { animation: ev-card-out .4s ease-in forwards; }
.ev-card.win { box-shadow: 0 0 0 3px #e8b030 inset, 0 8px 0 rgba(0,0,0,.45); background: rgba(30, 22, 8, .93); }
.ev-card.moon { box-shadow: 0 0 0 3px #ff3a3a inset, 0 0 40px rgba(255, 30, 30, .45), 0 8px 0 rgba(0,0,0,.45); }
.ev-card .k1 { font-size: 13px; letter-spacing: 4px; color: #ffb0a0; }
.ev-card .k2 { font-family: var(--font); font-weight: 700; font-size: clamp(30px, 6vw, 52px); color: #ff5a3a; text-shadow: 0 4px 0 #6a1008, 4px 4px 0 #000; margin: 4px 0; line-height: 1.05; }
.ev-card.win .k2 { color: #ffd23f; text-shadow: 0 4px 0 #7a4a08, 4px 4px 0 #000; }
.ev-card .k3 { font-size: 12px; color: #e8d0b8; letter-spacing: 1px; }
.ev-card .k4 { margin-top: 8px; font-size: 12px; color: #fff3a3; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; align-items: center; }
.ev-card .k4 img { vertical-align: -4px; }
@keyframes ev-card-in { 0% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@keyframes ev-card-out { 100% { opacity: 0; transform: translate(-50%, -60%) scale(.9); } }
.ev-wave { position: fixed; left: 50%; top: 30%; transform: translateX(-50%); z-index: 59; font-family: var(--font); font-weight: 700; font-size: clamp(28px, 5vw, 44px); color: #ff4a3a;
  text-shadow: 0 4px 0 #5a0a08, 4px 4px 0 #000; pointer-events: none; animation: cinetitle 2.4s ease-out forwards; letter-spacing: 3px; }
body.blood-moon .cinebars i { background: #1a0204; }
@media (max-width: 640px) { .ev-bar .ev-head { font-size: 11px; } .ev-bar .ev-head b { font-size: 12px; } .ev-pill .ev-row { font-size: 10px; } }
`;

const ico = (n, s = 1) => (hasSprite(n) ? spriteImg(n, s) : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class EventsHud {
  constructor(game, ev) {
    this.game = game;
    this.ev = ev;
    this.t = 0;
    if (!document.getElementById('ev-css')) {
      const st = document.createElement('style');
      st.id = 'ev-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root = document.getElementById('ui') || document.body;
    this.top = document.createElement('div');
    this.top.className = 'ev-top';
    this.root.appendChild(this.top);
    this.pill = null;
    this.bossEl = null;
    this.siegeEl = null;
    this.lastPill = '';
  }

  // ------------------------------------------------------------ countdown pill
  ensurePill() {
    const host = document.getElementById('clockwrap');
    if (!host) return null;
    if (!this.pill || this.pill.parentNode !== host) {
      this.pill = document.createElement('div');
      this.pill.className = 'ev-pill';
      if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(this.pill);
      this.pill.addEventListener('click', (e) => {
        if (e.target.closest('.ev-repair')) { e.stopPropagation(); this.ev.defense.repairAll(); this.lastPill = ''; this.updatePill(); }
      });
      this.lastPill = '';
    }
    return this.pill;
  }

  pillHTML() {
    const game = this.game;
    const st = game.state;
    if (!game.started || st.phase === 'gameover') return '';
    const rows = [];
    const moon = this.ev.moon, boss = this.ev.boss;
    const toFive = () => { const h = Math.max(0, 17 - st.hour); const H = Math.floor(h), M = Math.floor((h - H) * 60); return H ? `${H}h ${String(M).padStart(2, '0')}m` : `${M}m`; };
    const dm = moon.daysUntil(st.day);
    if (dm === 0 && moon.isBloodDay(st.day)) {
      if (st.phase === 'day' && st.hour < 17) rows.push(`<span class="ev-row moon hot">${ico('moon')}BLOOD MOON IN ${toFive()}</span>`);
      else if (st.phase === 'day' || st.phase === 'rush') rows.push(`<span class="ev-row moon hot">${ico('moon')}BLOOD MOON!</span>`);
    } else if (dm === 1) rows.push(`<span class="ev-row moon hot">${ico('moon')}Blood moon TOMORROW!</span>`);
    else if (dm > 1 && dm <= 3) rows.push(`<span class="ev-row moon">${ico('moon')}Blood moon in ${dm} days</span>`);
    const db = boss.daysUntil(st.day);
    const nextPlan = boss.planFor(st.day + db, { force: true });
    if (db === 0 && boss.isBossDay(st.day)) {
      if (st.phase === 'day' && st.hour < 17) rows.push(`<span class="ev-row boss hot">${ico('warning')}BOSS AT 5PM: ${esc(nextPlan?.name || 'BOSS')} ${ico(nextPlan?.favIcon || 'berry')}</span>`);
    } else if (db === 1) rows.push(`<span class="ev-row boss hot">${ico('warning')}BOSS TOMORROW: ${esc(nextPlan?.name || '')} ${ico(nextPlan?.favIcon || 'berry')}</span>`);
    else if (db > 1 && db <= 3) rows.push(`<span class="ev-row boss">${ico('warning')}Boss in ${db} days</span>`);
    if (st.phase === 'day') {
      const dmg = this.ev.defense.damaged();
      if (dmg.length) rows.push(`<button class="ev-repair" title="Repair every damaged defense">${ico('hammer')}Repair ${dmg.length} · ${ico('coin')}${this.ev.defense.repairAllCost()}</button>`);
    }
    return rows.join('');
  }

  updatePill() {
    const p = this.ensurePill();
    if (!p) return;
    const html = this.pillHTML();
    if (html !== this.lastPill) { this.lastPill = html; p.innerHTML = html; }
  }

  // ------------------------------------------------------------ boss bar
  updateBoss() {
    const info = this.ev.boss.barInfo();
    if (!info || !info.arrived) { if (this.bossEl) { this.bossEl.remove(); this.bossEl = null; } return; }
    if (!this.bossEl) {
      const el = document.createElement('div');
      el.className = 'ev-bar boss';
      const P = info.plan;
      el.innerHTML = `<div class="ev-head">${ico('warning', 1)}<b>${esc(P.name)}</b><span>${esc(P.job)}</span><span class="ev-tag">PHASE 1</span></div>
        <div class="ev-meter hunger"><i class="lag"></i><i class="fill"></i><span>HUNGER</span></div>
        <div class="ev-meter fury"><i></i></div>
        <div class="ev-sub"><span>Loves ${ico(P.favIcon)} ${esc(P.favName)} · fish · defenses</span><span class="ev-time"></span></div>`;
      this.top.appendChild(el);
      this.bossEl = el;
      this.bossPh = 0;
    }
    const el = this.bossEl;
    const pct = Math.max(0, Math.min(1, info.hunger)) * 100;
    el.querySelector('.fill').style.width = pct + '%';
    el.querySelector('.lag').style.width = pct + '%';
    el.querySelector('.fury i').style.width = Math.max(0, info.fury) * 100 + '%';
    const b = info.b;
    el.querySelector('.ev-time').textContent = info.done === 'win' ? 'CALMED!' : info.done === 'lose' ? 'STORMED OFF' : `storms off in ${Math.ceil(Math.max(0, b.furyT))}s`;
    if (info.phase !== this.bossPh) {
      this.bossPh = info.phase;
      const tag = el.querySelector('.ev-tag');
      tag.className = 'ev-tag' + (info.phase >= 2 ? ' p' + info.phase : '');
      tag.textContent = info.phase === 1 ? 'PHASE 1' : info.phase === 2 ? 'ENRAGED!' : 'DESPERATE!';
    }
  }

  bossHit(amt, kind) {
    const el = this.bossEl;
    if (!el || amt < 0.05) return;
    const now = performance.now();
    if (now - (this._popT || 0) < 140) return;
    this._popT = now;
    const p = document.createElement('span');
    p.className = 'ev-pop ' + kind;
    p.textContent = '-' + (amt >= 10 ? Math.round(amt) : amt.toFixed(1)) + (kind === 'fav' ? ' ♥' : '');
    el.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }

  bossPhase(ph) {
    const el = this.bossEl;
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    this.wave(ph === 2 ? 'ENRAGED!' : 'DESPERATE!');
  }

  bossCard(P) {
    this.card(`<div class="k1">BOSS · DAY ${P.day}</div><div class="k2">${esc(P.name)}</div><div class="k3">${esc(P.job)}</div>
      <div class="k4"><span>Loves ${ico(P.favIcon, 2)} ${esc(P.favName)}</span><span>Hunger ${P.hungerMax}</span><span>Calm it in ${P.timer}s!</span></div>`, '', 3.6);
  }

  bossResult({ win, plan, coins }) {
    if (win) this.card(`<div class="k1">BOSS DEFEATED</div><div class="k2">${esc(plan.name)} IS FULL!</div><div class="k3">A satisfied boss is a generous boss.</div>
      <div class="k4">${ico('trophy', 2)}<span>Boss trophy!</span>${ico('coin', 2)}<span>+${coins}</span></div>`, 'win', 4.2);
    else this.card(`<div class="k1">BOSS STORMED OFF</div><div class="k2">${esc(plan.name)} IS STILL HUNGRY</div><div class="k3">More fish, more ${esc(plan.favName)}, more defenses next time.</div>
      <div class="k4">${ico('coin', 2)}<span>-${coins} from the till</span></div>`, '', 4.2);
  }

  // ------------------------------------------------------------ blood moon
  updateSiege() {
    const s = this.ev.moon.siege;
    document.body.classList.toggle('blood-moon', !!s || this.ev.moon.k > 0.5);
    if (!s) { if (this.siegeEl) { this.siegeEl.remove(); this.siegeEl = null; } return; }
    if (!this.siegeEl) {
      const el = document.createElement('div');
      el.className = 'ev-bar siege';
      el.innerHTML = `<div class="ev-head">${ico('moon', 1)}<b>BLOOD MOON #${s.n}</b><span class="ev-wv"></span><span class="ev-tag ev-host"></span></div>
        <div class="ev-meter dawn"><i></i><span>SURVIVE TILL DAWN</span></div>
        <div class="ev-sub"><span class="ev-calm"></span><span class="ev-clock"></span></div>`;
      this.top.prepend(el);
      this.siegeEl = el;
    }
    const el = this.siegeEl;
    el.querySelector('.ev-wv').textContent = `wave ${Math.max(1, s.next)}/${s.waves.length}`;
    el.querySelector('.ev-host').textContent = `${s.hostile || 0} hostile`;
    el.querySelector('.dawn i').style.width = Math.min(1, s.t / s.T) * 100 + '%';
    el.querySelector('.ev-calm').textContent = `calmed ${s.calmed}`;
    const h = this.game.state.hour, H = Math.floor(h), M = Math.floor((h - H) * 60);
    el.querySelector('.ev-clock').textContent = `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H >= 12 ? 'PM' : 'AM'}`;
  }

  siegeCard(n, waves) {
    this.card(`<div class="k1">THE SKY TURNS RED</div><div class="k2">BLOOD MOON</div><div class="k3">The bears don't care about food tonight. They want to SMASH.</div>
      <div class="k4">${ico('moon', 2)}<span>${waves} waves</span>${ico('shield', 2)}<span>Defenses only</span><span>Survive till dawn!</span></div>`, 'moon', 4);
  }

  waveBanner(i, n) {
    if (i === 1) return;
    this.wave(i === n ? 'FINAL WAVE!' : `WAVE ${i}`);
  }

  bloodResult({ n, calmed, fishLost, smashed, coins, perfect }) {
    this.card(`<div class="k1">DAWN · BLOOD MOON #${n}</div><div class="k2">${perfect ? 'FLAWLESS!' : 'YOU SURVIVED!'}</div>
      <div class="k3">Calmed ${calmed} bear${calmed === 1 ? '' : 's'} · ${fishLost} fish lost · ${smashed} build${smashed === 1 ? '' : 's'} smashed</div>
      <div class="k4">${ico('coin', 2)}<span>+${coins}</span>${perfect ? `${ico('star', 2)}<span>Perfect defense bonus</span>` : ''}</div>`, 'win', 4.6);
  }

  // ------------------------------------------------------------ helpers
  card(html, cls = '', dur = 3.5) {
    this.cardEl?.remove();
    const el = document.createElement('div');
    el.className = 'ev-card ' + cls;
    el.innerHTML = html;
    this.root.appendChild(el);
    this.cardEl = el;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 420); }, dur * 1000);
  }

  wave(text) {
    const el = document.createElement('div');
    el.className = 'ev-wave';
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.2;
    this.updatePill();
    this.updateBoss();
    this.updateSiege();
  }
}
