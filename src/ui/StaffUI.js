// [v26 staff] The staff UI: everything is paper on a clipboard.
//   openInterview(tent)  resumes with a stapled live 3D photo, traits, skills, wage and what they said; HIRE / PASS
//   openRoster()         the roster clipboard: everyone, their job, home, mood, energy; tap a row -> staff card
//   openStaffCard(rec)   one beaver: job + home pickers, skills + training, level, fire
//   openRescue(rec)      the stretcher crew bill
//   decorateCard(el, s)  the BuildMove tap card: workers / residents + Assign / Upgrade / Interview
import './staff.css';
import { spriteImg, hasSprite } from './sprites.js';
import { paperTile, deco, stamp, injectPaperCSS } from './paper.js';
import { createBeaverPortrait, beaverSnapshot } from '../game/staff/portrait.js';
import { SKILLS, SKILL_INFO, TRAITS, PERSONALITIES, firstName, outfitFor } from '../data/staffGen.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const XP_FOR = (lvl) => Math.round(40 * Math.pow(lvl, 1.35));
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');

export class StaffUI {
  constructor(sys) {
    this.sys = sys;
    this.game = sys.game;
    this.ov = null;
    this.portraits = [];
    injectPaperCSS();
    this.paper = paperTile('parchment');
    this.wood = paperTile('wood');
  }
  get root() { return this.game.ui?.root || document.getElementById('ui') || document.body; }
  sfx(n, o = {}) { this.game.audio.play(n, { volume: 0.35, ...o }); }

  // ------------------------------------------------------------------ the clipboard overlay
  open(kind, title) {
    this.close(true);
    const ov = document.createElement('div');
    ov.className = `st-ov st-k-${kind}`;
    ov.innerHTML = `<div class="st-dim"></div><div class="st-board" style="--wood:url(${this.wood.url});--wsz:${this.wood.w * 3}px ${this.wood.h * 3}px">
      <div class="st-clip"><i></i></div>
      <button class="st-x" data-a="close" title="Close">${ico('cross', 1) || 'X'}</button>
      <div class="st-sheet" style="--paper:url(${this.paper.url});--psz:${this.paper.w * 3}px ${this.paper.h * 3}px">
        <h2 class="st-title">${title}</h2><div class="st-body"></div>
      </div></div>`;
    ov.addEventListener('pointerdown', (e) => e.stopPropagation());
    ov.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    ov.querySelector('.st-dim').addEventListener('click', () => this.close());
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) this.act(b, e); });
    this.root.appendChild(ov);
    this.ov = ov;
    this.kind = kind;
    this.body = ov.querySelector('.st-body');
    this.sfx('page', { pitch: 1.1 });
    if (!this._key) { this._key = (e) => { if (e.key === 'Escape' && this.ov) { e.stopPropagation(); this.close(); } }; window.addEventListener('keydown', this._key, true); }
    return this.body;
  }
  close(silent = false) {
    for (const p of this.portraits) p.dispose();
    this.portraits = [];
    if (this.ov) { const o = this.ov; o.classList.add('bye'); setTimeout(() => o.remove(), 180); if (!silent) this.sfx('close', { volume: 0.25 }); }
    this.ov = null; this.kind = null; this.cur = null;
  }
  portrait(el, profile, o = {}) {
    const p = createBeaverPortrait(el, { profile, ...o });
    if (p) this.portraits.push(p);
    return p;
  }
  act(b) {
    const a = b.dataset.a, sys = this.sys, game = this.game;
    const rec = b.dataset.id ? sys.get(+b.dataset.id) : null;
    this.sfx('click');
    if (a === 'close') return this.close();
    if (a === 'roster') return this.openRoster();
    if (a === 'staff' && rec) return this.openStaffCard(rec);
    if (a === 'interview') return this.openInterview(sys.tents()[0]);
    if (a === 'assigntent') return this.openAssign(this.tent || sys.tents()[0]);
    if (a === 'hire' || a === 'pass') return this.decide(b, a);
    if (a === 'job' && rec) {
      const s = b.dataset.k ? sys.byKey(b.dataset.k) : null;
      if (!sys.assign(rec, s)) game.notify?.(sys.lastReason || 'Can\'t work there', 'no');
      return this.openStaffCard(rec);
    }
    if (a === 'home' && rec) {
      const s = sys.byKey(b.dataset.k);
      if (!sys.setHome(rec, s)) game.notify?.(sys.lastReason || 'No bed there', 'no');
      return this.openStaffCard(rec);
    }
    if (a === 'train' && rec) { sys.train(rec, b.dataset.k); return this.openStaffCard(rec); }
    if (a === 'fire' && rec) { if (b.dataset.sure) { sys.fire(rec); return this.openRoster(); } b.dataset.sure = '1'; b.textContent = 'Really?'; return null; }
    if (a === 'follow' && rec?.agent) { this.close(true); game.ui?.trackEntity?.(rec.agent, { zoom: 0.014, label: rec.name, kind: 'beaver' }); return null; }
    if (a === 'pay' && rec) {
      const r = sys.rescue(rec);
      if (r.ok) { this.close(true); game.ui?.floatTextAt?.(rec.x, (rec.y || 0) + 1, rec.z, `-${r.cost}`, '#ffb0a0'); }
      return null;
    }
    if (a === 'pickjob') { const s = sys.byKey(b.dataset.k); if (rec && s) { if (!sys.assign(rec, s)) game.notify?.(sys.lastReason || 'Full', 'no'); } return this.openAssign(s); }
    if (a === 'pickhome') { const s = sys.byKey(b.dataset.k); if (rec && s) { if (!sys.setHome(rec, s)) game.notify?.(sys.lastReason || 'Full', 'no'); } return this.openAssign(s); }
    if (a === 'unassign' && rec) { const s = sys.byKey(rec.job); sys.assign(rec, null); return this.openAssign(s); }
    return null;
  }

  // ------------------------------------------------------------------ pieces
  pips(n, max = 5, cls = '') { let h = `<span class="st-pips ${cls}">`; for (let i = 1; i <= max; i++) h += `<i class="${i <= n ? 'on' : ''}"></i>`; return h + '</span>'; }
  traitChips(traits) {
    return traits.map((t) => { const T = TRAITS[t]; if (!T) return ''; return `<span class="st-chip ${T.good > 0 ? 'good' : T.good < 0 ? 'bad' : ''}" title="${esc(T.desc)}">${esc(T.name)}</span>`; }).join('');
  }
  skillsHTML(r, { train = false, hi = null } = {}) {
    const sys = this.sys;
    return `<div class="st-skills">${SKILLS.map((k) => {
      const v = r.skills[k] || 1;
      const canT = train && sys.canTrain() && v < 5 && !r.train && !r.hurt;
      return `<div class="st-sk ${hi === k ? 'hi' : ''}">${ico(SKILL_INFO[k].icon, 1)}<b>${SKILL_INFO[k].name}</b>${this.pips(v)}${canT ? `<button class="st-mini" data-a="train" data-id="${r.id}" data-k="${k}" title="A day of training: +1 ${SKILL_INFO[k].name}">+1 ${ico('coin', 1)}${sys.trainCost(r, k)}</button>` : ''}</div>`;
    }).join('')}</div>`;
  }
  bar(v, cls) { return `<span class="st-bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(100, v)))}%"></i></span>`; }
  moodWord(m) { return m >= 80 ? 'Chipper' : m >= 60 ? 'Content' : m >= 40 ? 'Meh' : m >= 22 ? 'Grumpy' : 'Miserable'; }

  // ------------------------------------------------------------------ interviews
  openInterview(tent) {
    const sys = this.sys;
    if (!tent) { this.game.notify?.('Build an Interview Tent first.', 'no'); return; }
    this.open('interview', `${ico('st_clip', 2)} Interviews <small>Interview Tent</small>`);
    this.tent = tent;
    this.renderInterview();
  }
  renderInterview() {
    const sys = this.sys, body = this.body;
    for (const p of this.portraits) p.dispose();
    this.portraits = [];
    const list = sys.cands.waiting();
    const rec = sys.workersAt(this.tent)[0];
    const head = `<p class="st-fox">${ico('fox_smug', 1)}<span>${list.length ? 'Next! Hire the hard workers. Wages are paid every morning, out of MY pocket.' : 'Nobody in line. Help Wanted posters bring more job seekers, and better ones.'}</span></p>
      <div class="st-meta"><span>${ico('st_poster', 1)} Posters: ${Math.min(5, sys.cands.posters())}</span><span>Line: ${list.length}/${sys.cands.capacity()}</span><span>${ico('st_tent', 1)} Recruiter: ${rec ? esc(firstName(rec)) : 'none'}</span><button class="st-mini" data-a="assigntent">${ico('staff', 1)} Assign</button><button class="st-mini" data-a="roster">${ico('staff', 1)} Roster</button></div>`;
    body.innerHTML = `${head}<div class="st-resumes">${list.map((c, i) => this.resumeHTML(c, i)).join('')}</div>`;
    list.forEach((c, i) => {
      const el = body.querySelector(`.st-res[data-i="${i}"] .st-photo .st-pp`);
      const p = el && this.portrait(el, c, { outfit: 'tie', frame: 'bust', anim: 'idle', turn: 0.25 + (i % 2) * 0.12 });
      if (p) {
        setTimeout(() => { if (!p.rig) return; const d = p.talk(c.answer?.a || ''); this.chatter(c, d); }, 500 + i * 900);
        el.closest('.st-res').__p = p;
      }
    });
  }
  resumeHTML(c, i) {
    const P = PERSONALITIES[c.personality] || {};
    const best = SKILLS.reduce((a, k) => ((c.skills[k] || 1) > (c.skills[a] || 1) ? k : a), SKILLS[0]);
    const rot = ((c.seed % 7) - 3) * 0.6;
    return `<div class="st-res" data-i="${i}" style="--r:${rot}deg">
      <div class="st-photo">${deco('staple', { cls: 'st-staple', rot: -12 })}<div class="st-pp"></div></div>
      <div class="st-who"><b>${esc(c.name)}</b><span class="st-pers" title="${esc(P.desc || '')}">${esc(P.name || '')}</span>
        <span class="st-wage">${ico('coin', 1)}${c.wage}<small>/day</small></span></div>
      <div class="st-traits">${this.traitChips(c.traits)}</div>
      ${this.skillsHTML(c, { hi: best })}
      <div class="st-qa"><p class="q">${esc(c.answer?.q || 'Why should I hire you?')}</p><p class="a">"${esc(c.answer?.a || '...')}"</p></div>
      <div class="st-btns"><button class="st-b hire" data-a="hire" data-i="${i}">HIRE</button><button class="st-b pass" data-a="pass" data-i="${i}">PASS</button></div>
    </div>`;
  }
  chatter(c, dur) {
    const v = PERSONALITIES[c.personality]?.voice || 1;
    const n = Math.min(14, Math.round(dur * 5));
    for (let k = 0; k < n; k++) setTimeout(() => { if (this.kind === 'interview') this.game.audio.play('st_blip', { volume: 0.22, voice: v, pitch: v }); }, k * 120 + (k % 3) * 25);
  }
  decide(btn, a) {
    const sys = this.sys;
    const card = btn.closest('.st-res');
    const list = sys.cands.waiting();
    const c = list[+btn.dataset.i];
    if (!c || card.classList.contains('done')) return;
    card.classList.add('done');
    card.insertAdjacentHTML('beforeend', stamp(a === 'hire' ? 'HIRED!' : 'PASS', a === 'hire' ? '#2f8f4a' : '#c0392b', a === 'hire' ? -14 : 10, { cls: 'st-stamp' }));
    const p = card.__p;
    if (a === 'hire') {
      this.sfx('st_hired', { volume: 0.5 });
      p?.play('cheer', { loop: true });
      setTimeout(() => { sys.cands.hire(c); if (this.kind === 'interview') this.renderInterview(); }, 900);
    } else {
      this.sfx('st_pass', { volume: 0.4 });
      p?.mood('sad');
      setTimeout(() => { sys.cands.pass(c); if (this.kind === 'interview') this.renderInterview(); }, 700);
    }
  }

  // ------------------------------------------------------------------ the roster
  openRoster() {
    const sys = this.sys;
    this.open('roster', `${ico('staff', 2)} Staff Roster`);
    const L = sys.list;
    const beds = sys.homes().reduce((n, s) => n + sys.bedsOf(s), 0);
    const wages = L.reduce((n, r) => n + (r.origin === 'hire' ? r.wage : 0), 0);
    const waiting = sys.cands.waiting().length;
    const rows = L.map((r) => {
      const home = sys.byKey(r.home);
      const st = sys.status(r);
      return `<button class="st-row ${r.hurt ? 'hurt' : ''}" data-a="${r.hurt && (r.hurt.state === 'down' || r.hurt.state === 'limp') ? 'staffhurt' : 'staff'}" data-id="${r.id}">
        <span class="st-snap" data-id="${r.id}"></span>
        <span class="st-rn"><b>${esc(r.name)}</b><small>Lv ${r.level} ${esc(PERSONALITIES[r.personality]?.name || '')}</small></span>
        <span class="st-rj"><b>${esc(sys.jobTitle(r))}</b><small>${esc(st)}</small></span>
        <span class="st-rh">${ico('st_home', 1)}${home ? esc(home.def.name) : '<em>no bed!</em>'}</span>
        <span class="st-rm" title="Mood: ${this.moodWord(r.mood)}">${this.bar(r.mood, 'mood')}${this.bar(r.energy, 'energy')}</span>
      </button>`;
    }).join('');
    this.body.innerHTML = `<div class="st-meta"><span>${L.length} beaver${L.length === 1 ? '' : 's'}</span><span>${ico('st_home', 1)} Beds: ${beds}</span><span>${ico('coin', 1)} Wages: ${wages}/day</span>${waiting ? `<button class="st-mini hot" data-a="interview">${ico('st_clip', 1)} ${waiting} waiting</button>` : ''}</div>
      <div class="st-legend"><span><i class="mood"></i>mood</span><span><i class="energy"></i>energy</span></div>
      <div class="st-rows">${rows || '<p class="st-empty">No staff yet. Build a Beaver Lodge, or an Interview Tent and hire some.</p>'}</div>`;
    this.body.querySelectorAll('.st-snap').forEach((el) => {
      const r = sys.get(+el.dataset.id);
      const cv = r && beaverSnapshot(r, { w: 40, h: 40, outfit: sys.outfitOf(r), frame: 'bust' });
      if (cv) { const c2 = cv.cloneNode(); c2.getContext('2d').drawImage(cv, 0, 0); el.appendChild(c2); }
    });
    this.body.querySelectorAll('[data-a="staffhurt"]').forEach((b) => b.addEventListener('click', () => this.openRescue(sys.get(+b.dataset.id))));
  }

  // ------------------------------------------------------------------ one beaver
  openStaffCard(r) {
    const sys = this.sys;
    if (!r) return;
    if (r.hurt && (r.hurt.state === 'down' || r.hurt.state === 'limp')) { this.openRescue(r); return; }
    this.open('card', `${esc(r.name)}`);
    this.cur = r;
    const P = PERSONALITIES[r.personality] || {};
    const home = sys.byKey(r.home);
    const job = sys.byKey(r.job);
    const J = job ? sys.jobsDef(job) : null;
    const jobs = sys.jobBuildings();
    const jobBtns = [`<button class="st-opt ${!r.job ? 'on' : ''}" data-a="job" data-id="${r.id}" data-k="">${ico('beaver', 1)}Crew<small>build, chop, haul</small></button>`]
      .concat(jobs.map((s) => {
        const Jd = sys.jobsDef(s), k = sys.keyOf(s);
        const full = sys.assignedTo(s).filter((o) => o !== r).length >= sys.slotsOf(s);
        return `<button class="st-opt ${r.job === k ? 'on' : ''}" data-a="job" data-id="${r.id}" data-k="${k}" ${full && r.job !== k ? 'disabled' : ''}>${ico(s.def.icon, 1)}${esc(Jd.title || s.def.name)}<small>${esc(s.def.name)} · ${SKILL_INFO[Jd.skill]?.name || ''} ${r.skills[Jd.skill] || 1}</small></button>`;
      })).join('');
    const homeBtns = sys.homes().map((s) => {
      const k = sys.keyOf(s), free = sys.freeBeds(s);
      return `<button class="st-opt ${r.home === k ? 'on' : ''}" data-a="home" data-id="${r.id}" data-k="${k}" ${free <= 0 && r.home !== k ? 'disabled' : ''}>${ico(s.def.icon, 1)}${esc(s.def.name)}<small>${free > 0 ? `${free} bed${free > 1 ? 's' : ''} free` : 'full'} · comfort ${sys.comfortOf(s)}</small></button>`;
    }).join('') || '<p class="st-empty">No homes yet. Build a Beaver Burrow.</p>';
    const xpN = XP_FOR(r.level);
    this.body.innerHTML = `<div class="st-card">
      <div class="st-cl"><div class="st-photo big">${deco('staple', { cls: 'st-staple', rot: -10 })}<div class="st-pp"></div></div>
        <div class="st-tags"><span class="st-pers">${esc(P.name || '')}</span>${this.traitChips(r.traits)}</div>
        <div class="st-stat"><b>${ico('st_level', 1)} Level ${r.level}</b>${this.bar((r.xp / xpN) * 100, 'xp')}</div>
        <div class="st-stat"><b>Mood</b>${this.bar(r.mood, 'mood')}<small>${this.moodWord(r.mood)}</small></div>
        <div class="st-stat"><b>Energy</b>${this.bar(r.energy, 'energy')}</div>
        <div class="st-stat"><b>Wage</b><span>${r.origin === 'hire' ? `${ico('coin', 1)}${r.wage}/day` : 'Paid in snacks'}</span></div>
        <div class="st-stat"><b>Now</b><span>${esc(sys.status(r))}</span></div>
        <div class="st-btns"><button class="st-mini" data-a="follow" data-id="${r.id}">Follow</button>${r.origin === 'hire' ? `<button class="st-mini red" data-a="fire" data-id="${r.id}">Let go</button>` : ''}<button class="st-mini" data-a="roster">Roster</button></div>
      </div>
      <div class="st-cr">
        <h3>Job <small>${J ? `${esc(J.title)} at ${esc(job.def.name)}` : 'the Crew'}</small></h3><div class="st-opts">${jobBtns}</div>
        <h3>Home <small>${home ? esc(home.def.name) : 'sleeping outside!'}</small></h3><div class="st-opts">${homeBtns}</div>
        <h3>Skills ${sys.canTrain() ? '<small>training: coins + a day away</small>' : '<small>research Staff Training to train</small>'}</h3>${this.skillsHTML(r, { train: true, hi: J?.skill })}
      </div></div>`;
    const el = this.body.querySelector('.st-pp');
    const p = this.portrait(el, r, { outfit: sys.outfitOf(r), frame: 'half', anim: r.mood < 30 ? 'tap_foot' : 'idle' });
    if (p && r.mood < 30) p.mood('grumpy');
  }

  // ------------------------------------------------------------------ the rescue bill
  openRescue(r) {
    const sys = this.sys, game = this.game;
    if (!r?.hurt) return;
    const cost = r.hurt.cost || sys.rescueCost(r);
    const can = game.state.coins >= cost;
    const where = sys.firstAids().length ? 'the First-Aid Tent' : sys.byKey(r.home) ? `${firstName(r)}'s bed` : 'a warm blanket';
    this.open('rescue', `${ico('st_hurt', 2)} Beaver Down!`);
    this.body.innerHTML = `<div class="st-rescue">
      <div class="st-photo wide">${deco('staple', { cls: 'st-staple', rot: 8 })}<div class="st-pp"></div></div>
      <p><b>${esc(r.name)}</b> ${r.hurt.cause === 'bear' ? 'got flattened by a bear' : r.hurt.cause === 'overwork' ? 'fainted from overwork' : 'got hurt'}. Seeing stars.</p>
      <div class="st-bill"><span>Stretcher crew</span><span>2 medics</span><span>Ride to ${esc(where)}</span><b>TOTAL ${ico('coin', 2)} ${cost}</b></div>
      <p class="st-small">Paid: back to work tomorrow. Not paid: limps home tonight, very grumpy, and may quit.</p>
      <div class="st-btns"><button class="st-b hire" data-a="pay" data-id="${r.id}" ${can ? '' : 'disabled'}>${can ? `PAY ${cost}` : 'NOT ENOUGH COINS'}</button><button class="st-b pass" data-a="close">LET THEM WALK IT OFF</button></div>
    </div>`;
    const p = this.portrait(this.body.querySelector('.st-pp'), r, { outfit: sys.outfitOf(r), frame: 'full', anim: 'dizzy', turn: 0.9 });
    void p;
  }

  // ------------------------------------------------------------------ pick a beaver for a building
  openAssign(s) {
    const sys = this.sys;
    if (!s) return;
    const J = sys.jobsDef(s), H = sys.homeDef(s);
    const k = sys.keyOf(s);
    this.open('assign', `${ico(s.def.icon, 2)} ${esc(s.def.name)}`);
    let html = '';
    if (J) {
      const team = sys.assignedTo(s), slots = sys.slotsOf(s);
      const cands = sys.list.filter((r) => !r.gone).sort((a, b) => (b.skills[J.skill] || 1) - (a.skills[J.skill] || 1) || b.level - a.level);
      html += `<h3>${esc(J.title)} ${team.length}/${slots} <small>${SKILL_INFO[J.skill]?.name} skill · output x${sys.boost(s).toFixed(2)}${J.required ? ' · needs staff to run' : ''}</small></h3>
        <div class="st-pick">${cands.map((r) => {
          const here = r.job === k;
          return `<button class="st-row small ${here ? 'on' : ''}" data-a="${here ? 'unassign' : 'pickjob'}" data-id="${r.id}" data-k="${k}" ${!here && team.length >= slots ? 'disabled' : ''}>
            <span class="st-rn"><b>${esc(r.name)}</b><small>${here ? 'works here (tap to send to the Crew)' : esc(sys.jobTitle(r))}</small></span>${this.pips(r.skills[J.skill] || 1)}<span class="st-rm">${this.bar(r.mood, 'mood')}</span></button>`;
        }).join('') || '<p class="st-empty">No staff yet.</p>'}</div>`;
    }
    if (H) {
      const res = sys.residents(s), beds = sys.bedsOf(s);
      html += `<h3>Residents ${res.length}/${beds} <small>comfort ${sys.comfortOf(s)}</small></h3>
        <div class="st-pick">${sys.list.filter((r) => !r.gone).map((r) => {
          const here = r.home === k;
          return `<button class="st-row small ${here ? 'on' : ''}" data-a="pickhome" data-id="${r.id}" data-k="${k}" ${!here && res.length >= beds ? 'disabled' : ''}><span class="st-rn"><b>${esc(r.name)}</b><small>${here ? 'lives here' : sys.byKey(r.home)?.def.name || 'no bed!'}</small></span><span class="st-rm">${this.bar(r.mood, 'mood')}</span></button>`;
        }).join('')}</div>`;
    }
    this.body.innerHTML = html;
  }

  // ------------------------------------------------------------------ BuildMove tap card
  decorateCard(el, s, bm) {
    const sys = this.sys;
    const J = sys.jobsDef(s), H = sys.homeDef(s);
    if (!s.built || (!J && !H && s.type !== 'st_tent')) return;
    const box = document.createElement('div');
    box.className = 'st-bm';
    let html = '';
    if (s.type === 'st_tent') {
      const n = sys.cands.waiting().length;
      html += `<button class="st-bmb hot" data-sa="interview">${ico('st_clip', 1)}INTERVIEW${n ? ` <i>${n}</i>` : ''}</button>`;
    }
    if (J) {
      const team = sys.assignedTo(s), slots = sys.slotsOf(s);
      const up = sys.upgradeCost(s, 'slots');
      html += `<div class="st-bml"><b>${esc(J.title)}</b> ${team.map((r) => `<span class="st-chip" data-sa="staff" data-id="${r.id}">${esc(firstName(r))}</span>`).join('') || '<em>nobody</em>'} <small>${team.length}/${slots} · x${sys.boost(s).toFixed(1)}</small></div>
        <div class="st-bmr"><button class="st-bmb" data-sa="assign">${ico('staff', 1)}ASSIGN</button>${up ? `<button class="st-bmb" data-sa="slots" title="One more worker slot">+SLOT ${ico('coin', 1)}${up}</button>` : ''}</div>`;
    }
    if (H) {
      const res = sys.residents(s), beds = sys.bedsOf(s);
      const uc = sys.upgradeCost(s, 'comfort'), ub = sys.upgradeCost(s, 'beds');
      html += `<div class="st-bml"><b>Beds ${res.length}/${beds}</b> ${res.map((r) => `<span class="st-chip" data-sa="staff" data-id="${r.id}">${esc(firstName(r))}</span>`).join('')} <small>comfort ${sys.comfortOf(s)}</small></div>
        <div class="st-bmr"><button class="st-bmb" data-sa="assign">${ico('st_home', 1)}MOVE IN</button>${uc ? `<button class="st-bmb" data-sa="comfort" title="Comfier beds: better mood + energy">COMFY ${ico('coin', 1)}${uc}</button>` : ''}${ub ? `<button class="st-bmb" data-sa="beds" title="One more bed">+BED ${ico('coin', 1)}${ub}</button>` : ''}</div>`;
    }
    box.innerHTML = html;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sa]');
      if (!b) return;
      e.stopPropagation();
      const a = b.dataset.sa;
      this.sfx('click');
      if (a === 'interview') { bm?.closeCard?.(true); this.openInterview(s); }
      else if (a === 'staff') { bm?.closeCard?.(true); this.openStaffCard(sys.get(+b.dataset.id)); }
      else if (a === 'assign') { bm?.closeCard?.(true); this.openAssign(s); }
      else if (sys.upgrade(s, a)) { bm?.renderCard?.('main'); }
    });
    el.appendChild(box);
  }
}
void outfitFor;
