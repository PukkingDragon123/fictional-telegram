// [v26 staff] The staff UI: everything is paper on a clipboard.
// [v33 paper] ...and now it IS a clipboard: a physical pixel-art clipboard (src/ui/physical/
// Clipboard.js) with a stack of sheets you flip with a stepped page-lift and curl. The staff
// binder holds a roster sheet, a JOB SHEET per job site, a BUNK LIST per home and a sheet per
// beaver; sticky tabs down the side, pencil handwriting, pencil ticks, stamps, a coffee ring.
// Assign a job by ticking a box: the pencil on the board really draws the tick (and rubs it
// out to send a beaver back to the crew).
//   openInterview(tent)  resumes: one sheet per job seeker, a live 3D photo, traits, skills, wage
//                        and what they said; HIRE / PASS are rubber stamps
//   openRoster()         the binder on the roster sheet: everyone, their job, home, mood, energy
//   openStaffCard(rec)   the binder on one beaver's sheet: job + home boxes, skills + training, fire
//   openAssign(s)        the binder on a building's job sheet (or bunk list)
//   openRescue(rec)      the stretcher crew bill
//   decorateCard(el, s)  the BuildMove tap card: workers / residents + Assign / Upgrade / Interview
import './staff.css';
import { spriteImg, hasSprite } from './sprites.js';
import { Clipboard } from './physical/Clipboard.js';
import { paintHighlight } from './physical/clipArt.js';
import { createBeaverPortrait, beaverSnapshot } from '../game/staff/portrait.js';
import { SKILLS, SKILL_INFO, TRAITS, PERSONALITIES, firstName, outfitFor } from '../data/staffGen.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const XP_FOR = (lvl) => Math.round(40 * Math.pow(lvl, 1.35));
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
const INK_BLUE = '#2b3d8f'; // Reynard's notebook ink
const RED_PENCIL = '#c0392b';
const short = (t, n = 8) => String(t || '').replace(/^(the|beaver|cozy)\s+/i, '').split(/\s+/)[0].slice(0, n);
let HILITE = null;

export class StaffUI {
  constructor(sys) {
    this.sys = sys;
    this.game = sys.game;
    this.cb = null;
    this.kind = null;
    this.tent = null;
  }
  get root() { return this.game.ui?.root || document.getElementById('ui') || document.body; }
  get ov() { return this.cb?.el || null; }
  sfx(n, o = {}) { this.game.audio.play(n, { volume: 0.35, ...o }); }

  // ------------------------------------------------------------------ the clipboard
  board(kind, pages, id, o = {}) {
    if (this.cb?.isOpen && this.kind === kind) {
      this.cb.setPages(pages);
      this.cb.show(id);
      return this.cb;
    }
    this.close(true);
    if (!HILITE) HILITE = paintHighlight(8, 8).url();
    const cb = new Clipboard({
      root: this.root,
      label: o.label,
      tabs: o.tabs,
      w: o.w,
      h: o.h,
      seed: 5,
      sfx: (n, x) => this.sfx(n, x),
      onClick: (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { e.stopPropagation(); this.act(b, e); } },
      onDispose: (el) => { for (const p of el.__ports || []) { try { p.dispose(); } catch { /* gone */ } } el.__ports = null; },
      onClose: () => { if (this.cb === cb) { this.cb = null; this.kind = null; } },
      onFlip: (pg) => pg?.onShow?.(),
    });
    cb.o.cls = 'sf-k-' + kind;
    this.cb = cb;
    this.kind = kind;
    cb.setPages(pages);
    cb.open(id);
    cb.el?.style.setProperty('--hl', `url(${HILITE})`);
    return cb;
  }
  close(silent = false) {
    const cb = this.cb;
    this.cb = null;
    this.kind = null;
    if (cb?.isOpen) { cb.close(silent); if (!silent) this.sfx('close', { volume: 0.25 }); }
  }
  /** Rebuild the page list and redraw the sheet in front (after a change). */
  rebuild() {
    if (!this.cb?.isOpen) return;
    const pages = this.kind === 'staff' ? this.staffPages() : this.kind === 'interview' ? this.interviewPages() : null;
    if (pages) this.cb.setPages(pages);
    this.cb.refresh();
  }
  portrait(el, profile, o = {}) {
    const p = createBeaverPortrait(el, { profile, ps: this.cb?.P || 2, ...o });
    if (p) { const pg = el.closest('.pc-page'); if (pg) (pg.__ports ||= []).push(p); }
    return p;
  }

  // ------------------------------------------------------------------ actions
  async act(b) {
    const a = b.dataset.a, sys = this.sys, game = this.game;
    const rec = b.dataset.id ? sys.get(+b.dataset.id) : null;
    const cb = this.cb;
    if (cb?.busy) return null;
    if (a !== 'job' && a !== 'home' && a !== 'pickjob' && a !== 'pickhome' && a !== 'unassign') this.sfx('click');
    if (a === 'close') return this.close();
    if (a === 'roster') return this.openRoster();
    if (a === 'staff' && rec) return this.openStaffCard(rec);
    if (a === 'staffhurt' && rec) return this.openRescue(rec);
    if (a === 'interview') return this.openInterview(sys.tents()[0]);
    if (a === 'assigntent') return this.openAssign(this.tent || sys.tents()[0]);
    if (a === 'hire' || a === 'pass') return this.decide(b, a);
    if ((a === 'job' || a === 'pickjob') && rec) {
      const s = b.dataset.k ? sys.byKey(b.dataset.k) : null;
      const k = s ? sys.keyOf(s) : null;
      if ((rec.job || null) === k) return this.shake(b);
      if (s && sys.assignedTo(s).filter((o) => o !== rec).length >= sys.slotsOf(s)) { game.notify?.('All slots are taken', 'no'); return this.shake(b); }
      await cb?.tick(b.querySelector('.pc-box'));
      if (!sys.assign(rec, s)) game.notify?.(sys.lastReason || 'Can\'t work there', 'no');
      else this.sfx('pen', { volume: 0.2, pitch: 1.3 });
      return this.rebuild();
    }
    if (a === 'unassign' && rec) {
      await cb?.erase(b.querySelector('.pc-box'));
      sys.assign(rec, null);
      return this.rebuild();
    }
    if ((a === 'home' || a === 'pickhome') && rec) {
      const s = sys.byKey(b.dataset.k);
      if (!s) return null;
      if (rec.home === sys.keyOf(s)) return this.shake(b);
      if (sys.freeBeds(s) <= 0) { game.notify?.('No bed there', 'no'); return this.shake(b); }
      await cb?.tick(b.querySelector('.pc-box'));
      if (!sys.setHome(rec, s)) game.notify?.(sys.lastReason || 'No bed there', 'no');
      return this.rebuild();
    }
    if (a === 'train' && rec) { if (sys.train(rec, b.dataset.k)) this.sfx('stamp', { volume: 0.4 }); return this.rebuild(); }
    if (a === 'fire' && rec) {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.innerHTML = 'Really?'; b.classList.add('hot'); return null; }
      const pg = b.closest('.pc-page');
      const st = cb?.stamp('LET GO', '#b8282c', { rot: -12, thunk: true });
      if (st && pg) { st.classList.add('sf-bigstamp'); pg.appendChild(st); }
      this.sfx('stamp', { volume: 0.6 });
      if (cb) cb.busy = true;
      setTimeout(() => {
        if (cb) cb.busy = false;
        sys.fire(rec);
        if (this.cb === cb && cb?.isOpen) cb.turnTo(this.staffPages(), 'roster');
      }, 650);
      return null;
    }
    if (a === 'follow' && rec?.agent) { this.close(true); game.ui?.trackEntity?.(rec.agent, { zoom: 0.014, label: rec.name, kind: 'beaver' }); return null; }
    if (a === 'pay' && rec) {
      const r = sys.rescue(rec);
      if (r.ok) {
        const st = cb?.stamp('PAID', '#2f8f4a', { rot: -10, thunk: true });
        const pg = b.closest('.pc-page');
        if (st && pg) { st.classList.add('sf-bigstamp'); pg.appendChild(st); }
        this.sfx('stamp', { volume: 0.6 });
        setTimeout(() => this.close(true), 520);
        game.ui?.floatTextAt?.(rec.x, (rec.y || 0) + 1, rec.z, `-${r.cost}`, '#ffb0a0');
      }
      return null;
    }
    return null;
  }
  shake(el) {
    el.classList.remove('sf-no');
    void el.offsetWidth;
    el.classList.add('sf-no');
    this.sfx('error', { volume: 0.2 });
  }

  // ------------------------------------------------------------------ pieces
  pips(n, max = 5, hi = false) { return this.cb.pips(n, max, { hi }); }
  traitChips(traits) {
    return traits.map((t) => { const T = TRAITS[t]; if (!T) return ''; return `<span class="sf-chip ${T.good > 0 ? 'good' : T.good < 0 ? 'bad' : ''}" title="${esc(T.desc)}">${esc(T.name)}</span>`; }).join('');
  }
  moodWord(m) { return m >= 80 ? 'Chipper' : m >= 60 ? 'Content' : m >= 40 ? 'Meh' : m >= 22 ? 'Grumpy' : 'Miserable'; }
  // a polaroid with a live portrait; the caption strip gets a pencil name
  polaroid(cls = '') {
    return `<div class="sf-pola ${cls}"><div class="sf-pola-ph"><div class="sf-pp"></div></div><div class="sf-pola-cap"></div><i class="sf-tape"></i></div>`;
  }
  dress(root) {
    const cb = this.cb;
    // tape strips and other painted bits, placed after render
    root.querySelectorAll('i.sf-tape').forEach((t, i) => t.replaceWith(Object.assign(cb.tape({ w: 26, seed: 3 + i }), { className: 'pc-px pc-tape sf-tape' })));
  }
  /** a labelled form line: printed label + pencil value */
  field(label, value, o = {}) {
    const d = document.createElement('div');
    d.className = 'sf-field' + (o.cls ? ' ' + o.cls : '');
    d.appendChild(this.cb.print(label, { cls: 'sf-lbl' }));
    if (o.icon) d.insertAdjacentHTML('beforeend', ico(o.icon, 1));
    if (value instanceof Node) d.appendChild(value);
    else d.appendChild(this.cb.hand(value, { color: o.color }));
    return d;
  }
  skillsBlock(r, { train = false, hi = null } = {}) {
    const sys = this.sys, cb = this.cb;
    const box = document.createElement('div');
    box.className = 'sf-skills';
    for (const k of SKILLS) {
      const v = r.skills[k] || 1;
      const canT = train && sys.canTrain() && v < 5 && !r.train && !r.hurt;
      const row = document.createElement('div');
      row.className = 'sf-sk' + (hi === k ? ' hi' : '');
      row.innerHTML = `${ico(SKILL_INFO[k].icon, 1)}<b>${SKILL_INFO[k].name}</b>`;
      row.appendChild(cb.pips(v, 5, { hi: hi === k }));
      if (canT) row.insertAdjacentHTML('beforeend', `<button class="sf-ticket" data-a="train" data-id="${r.id}" data-k="${k}" title="A day of training: +1 ${SKILL_INFO[k].name}">+1 ${ico('coin', 1)}${sys.trainCost(r, k)}</button>`);
      box.appendChild(row);
    }
    return box;
  }

  // ------------------------------------------------------------------ the staff binder
  staffPages() {
    const sys = this.sys, pages = [];
    const L = sys.list.filter((r) => !r.gone);
    const per = 7, nR = Math.max(1, Math.ceil(L.length / per));
    for (let k = 0; k < nR; k++) {
      pages.push({ id: k ? `roster${k}` : 'roster', tab: nR > 1 ? `ROSTER ${k + 1}` : 'ROSTER', title: 'Staff Roster', color: 'yellow', sectionStart: k === 0, seed: 11 + k,
        coffee: k === 0 ? { x: 300, y: -10, seed: 4 } : null, render: (el) => this.renderRoster(el, L.slice(k * per, (k + 1) * per), k, nR) });
    }
    const seen = {};
    const tab = (t) => { const s = short(t).toUpperCase(); seen[s] = (seen[s] || 0) + 1; return seen[s] > 1 ? `${s.slice(0, 6)} ${seen[s]}` : s; };
    sys.jobBuildings().forEach((s, i) => {
      const J = sys.jobsDef(s);
      pages.push({ id: 'job:' + sys.keyOf(s), tab: tab(J.title || s.def.name), title: `Job sheet: ${J.title || s.def.name}`, color: 'orange', sectionStart: i === 0, paper: 'cream', seed: 30 + i,
        render: (el) => this.renderJobSheet(el, s) });
    });
    sys.homes().forEach((s, i) => {
      pages.push({ id: 'bed:' + sys.keyOf(s), tab: tab(s.def.name), title: `Bunk list: ${s.def.name}`, color: 'green', sectionStart: i === 0, seed: 50 + i,
        coffee: i === 1 ? { x: 8, y: 150, seed: 9, r: 15 } : null, render: (el) => this.renderBedSheet(el, s) });
    });
    L.forEach((r, i) => {
      pages.push({ id: 'b:' + r.id, tab: firstName(r).slice(0, 8), title: r.name, color: r.hurt ? 'red' : ['blue', 'teal', 'violet', 'pink'][i % 4], sectionStart: i === 0, seed: 70 + r.id,
        coffee: r.id % 5 === 2 ? { x: 250, y: 190, seed: r.id, r: 14 } : null, render: (el) => this.renderBeaver(el, r) });
    });
    return pages;
  }

  openRoster() { this.board('staff', this.staffPages(), 'roster', { label: 'Staff binder' }); }
  openStaffCard(r) {
    if (!r) return;
    if (r.hurt && (r.hurt.state === 'down' || r.hurt.state === 'limp')) { this.openRescue(r); return; }
    this.board('staff', this.staffPages(), 'b:' + r.id, { label: 'Staff binder' });
  }
  openAssign(s) {
    const sys = this.sys;
    if (!s) return;
    const k = sys.keyOf(s);
    const id = sys.jobsDef(s) ? 'job:' + k : sys.homeDef(s) ? 'bed:' + k : 'roster';
    this.board('staff', this.staffPages(), id, { label: 'Staff binder' });
  }

  // the roster sheet
  renderRoster(el, L, k, nR) {
    const sys = this.sys, cb = this.cb;
    const all = sys.list.filter((r) => !r.gone);
    const beds = sys.homes().reduce((n, s) => n + sys.bedsOf(s), 0);
    const wages = all.reduce((n, r) => n + (r.origin === 'hire' ? r.wage : 0), 0);
    const waiting = sys.cands.waiting().length;
    el.innerHTML = `<div class="sf-head"><div class="sf-hl"></div><div class="sf-hr"></div></div>
      <div class="sf-meta"></div><div class="sf-cols sf-rcols"><span></span><span>Name</span><span>Job</span><span>Home</span><span>Mood / energy</span></div><div class="sf-rows"></div>`;
    const hl = el.querySelector('.sf-hl'), hr = el.querySelector('.sf-hr');
    hl.appendChild(cb.title(nR > 1 ? `Staff Roster ${k + 1}/${nR}` : 'Staff Roster'));
    hl.appendChild(cb.print('Beaver Works Co. · form 7B · tap a name to open their sheet', { cls: 'sf-sub', size: 's' }));
    hr.appendChild(cb.stamp(`DAY ${this.game.state.day || 1}`, '#3a64b0', { rot: 6, frame: 'single', seed: 3 }));
    const meta = el.querySelector('.sf-meta');
    meta.append(this.field('Beavers', String(all.length)), this.field('Beds', String(beds), { icon: 'st_home' }), this.field('Wages', `${wages}/day`, { icon: 'coin' }));
    if (waiting) {
      const note = cb.sticky(`${ico('st_clip', 1)} <b>${waiting} job seeker${waiting > 1 ? 's' : ''}</b><br>waiting at the tent!`, { button: true, w: 92, h: 26, seed: 7, cls: 'sf-wait' });
      note.dataset.a = 'interview';
      meta.appendChild(note);
    }
    const rows = el.querySelector('.sf-rows');
    if (!L.length) rows.appendChild(cb.hand('No staff yet. Build a Beaver Lodge, or an Interview Tent and hire some.', { maxW: 300, color: INK_BLUE }));
    for (const r of L) {
      const home = sys.byKey(r.home);
      const hurt = r.hurt && (r.hurt.state === 'down' || r.hurt.state === 'limp');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-row' + (r.hurt ? ' hurt' : '');
      b.dataset.a = hurt ? 'staffhurt' : 'staff';
      b.dataset.id = r.id;
      b.title = `${r.name}: open their sheet`;
      b.innerHTML = '<span class="sf-snap"></span><span class="sf-c sf-cn"></span><span class="sf-c sf-cj"></span><span class="sf-c sf-ch"></span><span class="sf-c sf-cm"></span>';
      const snap = b.querySelector('.sf-snap');
      const cv = beaverSnapshot(r, { w: 40, h: 40, outfit: sys.outfitOf(r), frame: 'bust' });
      if (cv) { const c2 = cv.cloneNode(); c2.getContext('2d').drawImage(cv, 0, 0); snap.appendChild(c2); }
      const cn = b.querySelector('.sf-cn');
      cn.append(cb.hand(r.name), cb.print(`Lv ${r.level} · ${PERSONALITIES[r.personality]?.name || ''}`, { size: 's', cls: 'sf-dim' }));
      const cj = b.querySelector('.sf-cj');
      cj.append(cb.hand(sys.jobTitle(r)), cb.print(sys.status(r), { size: 's', cls: 'sf-dim' }));
      const ch = b.querySelector('.sf-ch');
      ch.insertAdjacentHTML('beforeend', ico('st_home', 1));
      ch.appendChild(home ? cb.hand(home.def.name) : cb.hand('no bed!', { color: RED_PENCIL }));
      const cm = b.querySelector('.sf-cm');
      cm.append(cb.gauge(r.mood, 'red', { w: 40, seed: r.id }), cb.gauge(r.energy, 'green', { w: 40, seed: r.id + 9 }));
      if (r.hurt) { const st = cb.stamp('HURT', '#b8282c', { rot: -10, frame: 'single', seed: r.id }); st.classList.add('sf-rowstamp'); b.appendChild(st); }
      rows.appendChild(b);
    }
    if (k === nR - 1) {
      const n = cb.hand('Wages are paid every morning, out of MY pocket. -R', { color: INK_BLUE, maxW: 300 });
      n.classList.add('sf-foot');
      el.appendChild(n);
    }
  }

  // one job site
  renderJobSheet(el, s) {
    const sys = this.sys, cb = this.cb;
    const J = sys.jobsDef(s), k = sys.keyOf(s);
    const team = sys.assignedTo(s), slots = sys.slotsOf(s);
    el.innerHTML = `<div class="sf-head"><div class="sf-hl"></div><div class="sf-hr"></div></div><div class="sf-form"></div>
      <div class="sf-cols sf-jcols"><span>On job</span><span>Name</span><span>Doing now</span><span>${esc(SKILL_INFO[J.skill]?.name || 'Skill')}</span><span>Mood</span></div><div class="sf-rows sf-pick"></div>`;
    el.querySelector('.sf-hl').append(cb.title('Job Sheet'), cb.print(`${s.def.name} · ${J.title || 'Worker'}`, { cls: 'sf-sub', size: 's' }));
    const open = !J.required || team.length > 0;
    el.querySelector('.sf-hr').appendChild(cb.stamp(open ? 'OPEN' : 'CLOSED', open ? '#2f8f4a' : '#b8282c', { rot: open ? -7 : 8, seed: 9 }));
    const form = el.querySelector('.sf-form');
    const slotBoxes = document.createElement('span');
    slotBoxes.className = 'sf-slots';
    for (let i = 0; i < slots; i++) slotBoxes.appendChild(cb.tickBox(i < team.length));
    slotBoxes.appendChild(cb.hand(`${team.length}/${slots}`));
    form.append(
      this.field('Site', s.def.name, { icon: s.def.icon }),
      this.field('Position', J.title || 'Worker'),
      this.field('Slots', slotBoxes),
      this.field('Skill', SKILL_INFO[J.skill]?.name || '', { icon: SKILL_INFO[J.skill]?.icon }),
      this.field('Output', `x${sys.boost(s).toFixed(2)}`),
    );
    if (J.required) form.appendChild(this.field('Note', 'needs staff to run!', { color: RED_PENCIL }));
    const rows = el.querySelector('.sf-rows');
    const cands = sys.list.filter((r) => !r.gone).sort((a, b) => (b.job === k) - (a.job === k) || (b.skills[J.skill] || 1) - (a.skills[J.skill] || 1) || b.level - a.level);
    if (!cands.length) rows.appendChild(cb.hand('No staff yet.', { color: INK_BLUE }));
    for (const r of cands) {
      const here = r.job === k, full = !here && team.length >= slots;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-row sf-tickrow' + (here ? ' on' : '') + (full ? ' full' : '');
      b.dataset.a = here ? 'unassign' : 'pickjob';
      b.dataset.id = r.id;
      b.dataset.k = k;
      b.title = here ? `${r.name} works here: erase to send them back to the Crew` : full ? 'All slots are taken' : `Put ${r.name} on this job`;
      b.appendChild(cb.tickBox(here, { cross: full, dim: full }));
      const n = document.createElement('span'); n.className = 'sf-c'; n.appendChild(cb.hand(r.name));
      const now = document.createElement('span'); now.className = 'sf-c'; now.appendChild(cb.print(here ? 'works here' : sys.jobTitle(r), { size: 's', cls: 'sf-dim' }));
      const sk = document.createElement('span'); sk.className = 'sf-c'; sk.appendChild(cb.pips(r.skills[J.skill] || 1));
      const md = document.createElement('span'); md.className = 'sf-c'; md.appendChild(cb.gauge(r.mood, 'red', { w: 34, seed: r.id }));
      b.append(n, now, sk, md);
      rows.appendChild(b);
    }
    const f = cb.print('Tick a box to put a beaver on this job. Rub it out to send them back to the crew.', { size: 's', cls: 'sf-foot sf-dim' });
    el.appendChild(f);
  }

  // one home
  renderBedSheet(el, s) {
    const sys = this.sys, cb = this.cb;
    const k = sys.keyOf(s);
    const res = sys.residents(s), beds = sys.bedsOf(s);
    el.innerHTML = `<div class="sf-head"><div class="sf-hl"></div><div class="sf-hr"></div></div><div class="sf-form"></div>
      <div class="sf-cols sf-bcols"><span>Lives here</span><span>Name</span><span>Sleeps at</span><span>Mood</span></div><div class="sf-rows sf-pick sf-b"></div>`;
    el.querySelector('.sf-hl').append(cb.title('Bunk List'), cb.print(`${s.def.name} · lights out at dusk`, { cls: 'sf-sub', size: 's' }));
    el.querySelector('.sf-hr').appendChild(cb.stamp(res.length >= beds ? 'FULL' : 'VACANCY', res.length >= beds ? '#b8282c' : '#2f8f4a', { rot: 7, seed: 13 }));
    const bedBoxes = document.createElement('span');
    bedBoxes.className = 'sf-slots';
    for (let i = 0; i < beds; i++) bedBoxes.appendChild(cb.tickBox(i < res.length));
    bedBoxes.appendChild(cb.hand(`${res.length}/${beds}`));
    el.querySelector('.sf-form').append(this.field('Lodging', s.def.name, { icon: s.def.icon }), this.field('Beds', bedBoxes), this.field('Comfort', String(sys.comfortOf(s))));
    const rows = el.querySelector('.sf-rows');
    for (const r of sys.list.filter((o) => !o.gone).sort((a, b) => (b.home === k) - (a.home === k))) {
      const here = r.home === k, full = !here && res.length >= beds;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-row sf-tickrow' + (here ? ' on' : '') + (full ? ' full' : '');
      b.dataset.a = 'pickhome';
      b.dataset.id = r.id;
      b.dataset.k = k;
      b.title = here ? `${r.name} lives here` : full ? 'No free bed' : `Move ${r.name} in`;
      b.appendChild(cb.tickBox(here, { cross: full, dim: full }));
      const n = document.createElement('span'); n.className = 'sf-c'; n.appendChild(cb.hand(r.name));
      const h = document.createElement('span'); h.className = 'sf-c';
      const hm = sys.byKey(r.home);
      h.appendChild(here ? cb.print('lives here', { size: 's', cls: 'sf-dim' }) : hm ? cb.print(hm.def.name, { size: 's', cls: 'sf-dim' }) : cb.hand('no bed!', { color: RED_PENCIL }));
      const md = document.createElement('span'); md.className = 'sf-c'; md.appendChild(cb.gauge(r.mood, 'red', { w: 34, seed: r.id }));
      b.append(n, h, md);
      rows.appendChild(b);
    }
    el.appendChild(cb.print('Tick a box to move a beaver in. Comfier homes: happier, better-rested beavers.', { size: 's', cls: 'sf-foot sf-dim' }));
  }

  // one beaver
  renderBeaver(el, r) {
    const sys = this.sys, cb = this.cb;
    const P = PERSONALITIES[r.personality] || {};
    const home = sys.byKey(r.home), job = sys.byKey(r.job);
    const J = job ? sys.jobsDef(job) : null;
    const xpN = XP_FOR(r.level);
    el.innerHTML = `<div class="sf-card"><div class="sf-cl">${this.polaroid('big')}<div class="sf-pers"></div><div class="sf-tags">${this.traitChips(r.traits)}</div><div class="sf-stats"></div><div class="sf-btns"></div></div>
      <div class="sf-cr"><div class="sf-sec sf-sjob"></div><div class="sf-opts sf-ojob"></div><div class="sf-sec sf-shome"></div><div class="sf-opts sf-ohome"></div><div class="sf-sec sf-sskill"></div></div></div>`;
    this.dress(el);
    el.querySelector('.sf-pola-cap').appendChild(cb.hand(r.name, { maxW: 150 }));
    if (P.name) { const st = cb.stamp(P.name.toUpperCase(), '#7a3aa0', { rot: -7, frame: 'single', seed: r.id }); el.querySelector('.sf-pers').appendChild(st); }
    const stats = el.querySelector('.sf-stats');
    const lv = document.createElement('span'); lv.className = 'sf-pair'; lv.append(cb.hand(`Lv ${r.level}`), cb.gauge((r.xp / xpN) * 100, 'gold', { w: 44, seed: r.id + 3 }));
    const md = document.createElement('span'); md.className = 'sf-pair'; md.append(cb.gauge(r.mood, 'red', { w: 44, seed: r.id }), cb.hand(this.moodWord(r.mood)));
    stats.append(
      this.field('Level', lv),
      this.field('Mood', md),
      this.field('Energy', cb.gauge(r.energy, 'green', { w: 44, seed: r.id + 9 })),
      this.field('Wage', r.origin === 'hire' ? `${r.wage}/day` : 'paid in snacks', { icon: r.origin === 'hire' ? 'coin' : null }),
      this.field('Now', sys.status(r)),
    );
    el.querySelector('.sf-btns').innerHTML = `<button class="sf-btn" data-a="follow" data-id="${r.id}">${ico('eye', 1)}Follow</button>${r.origin === 'hire' ? `<button class="sf-btn red" data-a="fire" data-id="${r.id}">Let go</button>` : ''}<button class="sf-btn" data-a="roster">${ico('staff', 1)}Roster</button>`;
    // job boxes
    const sj = el.querySelector('.sf-sjob');
    sj.append(cb.print('Job', { size: 'l' }), cb.hand(J ? `${J.title} at ${job.def.name}` : 'the Crew', { color: INK_BLUE }));
    const oj = el.querySelector('.sf-ojob');
    const opt = (on, a, k, icon, label, sub, full) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sf-opt' + (on ? ' on' : '') + (full ? ' full' : '');
      b.dataset.a = a; b.dataset.id = r.id; b.dataset.k = k;
      b.appendChild(cb.tickBox(on, { cross: full, dim: full }));
      b.insertAdjacentHTML('beforeend', `${ico(icon, 1)}<span class="sf-ot"><b>${esc(label)}</b><small>${esc(sub)}</small></span>`);
      if (full) b.title = 'Full';
      return b;
    };
    oj.appendChild(opt(!r.job, 'job', '', 'beaver', 'Crew', 'build, chop, haul', false));
    for (const s of sys.jobBuildings()) {
      const Jd = sys.jobsDef(s), k = sys.keyOf(s);
      const full = sys.assignedTo(s).filter((o) => o !== r).length >= sys.slotsOf(s) && r.job !== k;
      oj.appendChild(opt(r.job === k, 'job', k, s.def.icon, Jd.title || s.def.name, `${s.def.name} · ${SKILL_INFO[Jd.skill]?.name || ''} ${r.skills[Jd.skill] || 1}`, full));
    }
    const sh = el.querySelector('.sf-shome');
    sh.append(cb.print('Home', { size: 'l' }), home ? cb.hand(home.def.name, { color: INK_BLUE }) : cb.hand('sleeping outside!', { color: RED_PENCIL }));
    const oh = el.querySelector('.sf-ohome');
    const homes = sys.homes();
    if (!homes.length) oh.appendChild(cb.hand('No homes yet. Build a Beaver Burrow.', { color: INK_BLUE }));
    for (const s of homes) {
      const k = sys.keyOf(s), free = sys.freeBeds(s);
      oh.appendChild(opt(r.home === k, 'home', k, s.def.icon, s.def.name, `${free > 0 ? `${free} bed${free > 1 ? 's' : ''} free` : 'full'} · comfort ${sys.comfortOf(s)}`, free <= 0 && r.home !== k));
    }
    const ss = el.querySelector('.sf-sskill');
    ss.append(cb.print('Skills', { size: 'l' }), cb.print(sys.canTrain() ? 'training: coins + a day away' : 'research Staff Training to train', { size: 's', cls: 'sf-dim' }));
    ss.after(this.skillsBlock(r, { train: true, hi: J?.skill }));
    const p = this.portrait(el.querySelector('.sf-pp'), r, { outfit: sys.outfitOf(r), frame: 'half', anim: r.mood < 30 ? 'tap_foot' : 'idle' });
    if (p && r.mood < 30) p.mood('grumpy');
  }

  // ------------------------------------------------------------------ interviews
  interviewPages() {
    const sys = this.sys, list = sys.cands.waiting();
    if (!list.length) return [{ id: 'none', tab: 'LINE', color: 'pink', seed: 90, render: (el) => this.renderNoOne(el) }];
    return list.map((c, i) => ({ id: 'c:' + (c.seed ?? i), tab: firstName(c).slice(0, 8), title: c.name, color: ['pink', 'yellow', 'teal', 'violet'][i % 4], seed: 91 + i, cand: c,
      coffee: i === 1 ? { x: 290, y: 150, seed: 5, r: 14 } : null, render: (el) => this.renderResume(el, c, i, list.length), onShow: () => this.greet(c) }));
  }
  openInterview(tent) {
    const sys = this.sys;
    if (!tent) { this.game.notify?.('Build an Interview Tent first.', 'no'); return; }
    this.tent = tent;
    const pages = this.interviewPages();
    this.board('interview', pages, pages[0].id, { label: 'Interviews' });
    void sys;
    const c = pages[0].cand;
    if (c) setTimeout(() => this.greet(c), 520);
  }
  renderInterview() { this.rebuild(); }
  headStrip(el) {
    const sys = this.sys, cb = this.cb;
    const list = sys.cands.waiting();
    const rec = sys.workersAt(this.tent)[0];
    const h = document.createElement('div');
    h.className = 'sf-istrip';
    h.innerHTML = `<span class="sf-fox">${ico('fox_smug', 1)}</span>`;
    h.appendChild(cb.hand(list.length ? 'Next! Hire the hard workers. Wages are paid every morning, out of MY pocket.' : 'Nobody in line. Help Wanted posters bring more job seekers, and better ones.', { color: INK_BLUE, maxW: 250 }));
    const m = document.createElement('div');
    m.className = 'sf-imeta';
    m.innerHTML = `<span>${ico('st_poster', 1)} Posters ${Math.min(5, sys.cands.posters())}</span><span>Line ${list.length}/${sys.cands.capacity()}</span><span>${ico('st_tent', 1)} Recruiter: ${rec ? esc(firstName(rec)) : 'none'}</span>
      <button class="sf-btn" data-a="assigntent">${ico('staff', 1)}Assign</button><button class="sf-btn" data-a="roster">${ico('staff', 1)}Roster</button>`;
    h.appendChild(m);
    el.appendChild(h);
  }
  renderNoOne(el) {
    const cb = this.cb;
    el.appendChild(cb.title('Interviews'));
    this.headStrip(el);
    const n = cb.sticky(`<b>Help Wanted!</b><br>Pin posters on the trees: more job seekers come, and better ones. A Recruiter at the tent helps too.`, { w: 130, h: 44, seed: 12, cls: 'sf-tip' });
    el.appendChild(n);
  }
  renderResume(el, c, i, n) {
    const cb = this.cb;
    const P = PERSONALITIES[c.personality] || {};
    const best = SKILLS.reduce((a, k) => ((c.skills[k] || 1) > (c.skills[a] || 1) ? k : a), SKILLS[0]);
    this.headStrip(el);
    const card = document.createElement('div');
    card.className = 'sf-res';
    card.dataset.i = i;
    card.innerHTML = `<div class="sf-cl">${this.polaroid('mid')}<div class="sf-pers"></div></div><div class="sf-cr"><div class="sf-rh"></div><div class="sf-tags">${this.traitChips(c.traits)}</div><div class="sf-rsk"></div><div class="sf-qa"></div>
      <div class="sf-decide"><button class="sf-stampbtn hire" data-a="hire" data-i="${i}"><span>HIRE</span></button><button class="sf-stampbtn pass" data-a="pass" data-i="${i}"><span>PASS</span></button></div></div>`;
    el.appendChild(card);
    this.dress(card);
    card.querySelector('.sf-pola-cap').appendChild(cb.hand(c.name, { maxW: 130 }));
    if (P.name) card.querySelector('.sf-pers').appendChild(cb.stamp(P.name.toUpperCase(), '#7a3aa0', { rot: -7, frame: 'single', seed: c.seed || i }));
    const rh = card.querySelector('.sf-rh');
    rh.append(cb.title(`Resume ${i + 1}/${n}`), this.field('Asks', `${c.wage}/day`, { icon: 'coin' }));
    card.querySelector('.sf-rsk').appendChild(this.skillsBlock(c, { hi: best }));
    const qa = card.querySelector('.sf-qa');
    qa.append(cb.print(c.answer?.q || 'Why should I hire you?', { cls: 'sf-q' }), cb.hand(`"${c.answer?.a || '...'}"`, { color: INK_BLUE, maxW: 230 }));
    const pp = card.querySelector('.sf-pp');
    const p = this.portrait(pp, c, { outfit: 'tie', frame: 'bust', anim: 'idle', turn: 0.25 + (i % 2) * 0.12 });
    if (p) card.__p = p;
  }
  greet(c) {
    if (this.kind !== 'interview' || !this.cb?.isOpen) return;
    const card = this.cb.pageEl?.querySelector('.sf-res');
    const p = card?.__p;
    if (!p?.rig) return;
    const d = p.talk(c.answer?.a || '');
    this.chatter(c, d);
  }
  chatter(c, dur) {
    const v = PERSONALITIES[c.personality]?.voice || 1;
    const n = Math.min(14, Math.round(dur * 5));
    for (let k = 0; k < n; k++) setTimeout(() => { if (this.kind === 'interview') this.game.audio.play('st_blip', { volume: 0.22, voice: v, pitch: v }); }, k * 120 + (k % 3) * 25);
  }
  decide(btn, a) {
    const sys = this.sys, cb = this.cb;
    const card = btn.closest('.sf-res');
    const list = sys.cands.waiting();
    const c = list[+btn.dataset.i];
    if (!c || !card || card.classList.contains('done')) return;
    card.classList.add('done');
    const st = cb.stamp(a === 'hire' ? 'HIRED!' : 'PASS', a === 'hire' ? '#2f8f4a' : '#c0392b', { rot: a === 'hire' ? -14 : 10, thunk: true, seed: a.length });
    st.classList.add('sf-bigstamp');
    card.closest('.pc-page')?.appendChild(st);
    const p = card.__p;
    const next = () => {
      if (this.kind !== 'interview' || this.cb !== cb || !cb.isOpen) return;
      const pages = this.interviewPages();
      cb.turnTo(pages, pages[0].id);
      if (pages[0].cand) setTimeout(() => this.greet(pages[0].cand), 560);
    };
    cb.busy = true;
    if (a === 'hire') {
      this.sfx('st_hired', { volume: 0.5 });
      p?.play('cheer', { loop: true });
      setTimeout(() => { cb.busy = false; sys.cands.hire(c); next(); }, 900);
    } else {
      this.sfx('st_pass', { volume: 0.4 });
      p?.mood('sad');
      setTimeout(() => { cb.busy = false; sys.cands.pass(c); next(); }, 700);
    }
  }

  // ------------------------------------------------------------------ the rescue bill
  openRescue(r) {
    const sys = this.sys, game = this.game;
    if (!r?.hurt) return;
    const cost = r.hurt.cost || sys.rescueCost(r);
    const can = game.state.coins >= cost;
    const where = sys.firstAids().length ? 'the First-Aid Tent' : sys.byKey(r.home) ? `${firstName(r)}'s bed` : 'a warm blanket';
    const page = { id: 'rescue', tab: '', seed: 120, render: (el) => {
      const cb = this.cb;
      el.innerHTML = `<div class="sf-rescue"><div class="sf-rtop"></div>${this.polaroid('wide')}<div class="sf-cause"></div><div class="sf-bill"></div><div class="sf-small"></div>
        <div class="sf-decide"><button class="sf-btn green big" data-a="pay" data-id="${r.id}" ${can ? '' : 'disabled'}>${can ? `PAY ${ico('coin', 1)}${cost}` : 'NOT ENOUGH COINS'}</button><button class="sf-btn red big" data-a="close">LET THEM WALK IT OFF</button></div></div>`;
      this.dress(el);
      el.querySelector('.sf-rtop').append(cb.title('Beaver Down!', { color: '#b8282c', line: '#b8282c' }));
      el.querySelector('.sf-pola-cap').appendChild(cb.hand(r.name, { maxW: 180 }));
      el.querySelector('.sf-cause').appendChild(cb.hand(`${firstName(r)} ${r.hurt.cause === 'bear' ? 'got flattened by a bear' : r.hurt.cause === 'overwork' ? 'fainted from overwork' : 'got hurt'}. Seeing stars.`, { maxW: 300, align: 'center' }));
      const bill = el.querySelector('.sf-bill');
      bill.innerHTML = `<span>Stretcher crew</span><span>2 medics</span><span>Ride to ${esc(where)}</span><b>TOTAL ${ico('coin', 1)}</b>`;
      bill.querySelector('b').appendChild(cb.hand(String(cost), { color: RED_PENCIL }));
      el.querySelector('.sf-small').appendChild(cb.print('Paid: back to work tomorrow. Not paid: limps home tonight, very grumpy, and may quit.', { size: 's', cls: 'sf-dim' }));
      this.portrait(el.querySelector('.sf-pp'), r, { outfit: sys.outfitOf(r), frame: 'full', anim: 'dizzy', turn: 0.9 });
    } };
    this.board('rescue', [page], 'rescue', { label: 'Rescue bill', tabs: false, w: 520, h: 600 });
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
