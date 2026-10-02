// QuestLog: a small paper note pinned under the coin tag (top-left HUD) with
// the 1-3 active quests: icon, title, checkbox steps (ticked with a pen
// stroke), an optional progress bar and the reward line. Tap the header to
// fold it away. Purely presentational: the caller owns the quest state.
//
//   const ql = createQuestLog(root, { icon, sfx, onClick })
//     icon(name, scale) -> '<img>' html     sfx(name, opts)     onClick(questId)
//   ql.set(quests)      quests: [{ id, title, icon, steps: [{ text, done }], reward: string, progress?: [n, max] }]
//                       diffed by id: new quests flutter in, newly done steps get a pen tick,
//                       missing quests fade out. Shows the first 3.
//   ql.complete(id)     "QUEST COMPLETE" stamp + confetti on that quest, then it folds away
//   ql.setVisible(on)   slide the note in / out
//   ql.collapse(on?)    fold / unfold (toggles without an argument)
//   ql.destroy()
//
// The note is position:absolute (left 16px, top 122px: under the coin tag + stars) inside `root`.
import './fonts.css';
import './questlog.css';
import { paperTexture, injectPaperCSS, deco, stamp, PX } from './paper.js';

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const MAX = 3;

// hand-drawn blue ink tick, 10x9 texels, drawn at 2x
let tickURL = null;
function tick() {
  if (tickURL) return tickURL;
  const rows = [
    '.........##',
    '........##.',
    '.......##..',
    '#.....##...',
    '##...##....',
    '.##.##.....',
    '..###......',
    '...#.......',
  ];
  const c = document.createElement('canvas');
  c.width = 11; c.height = rows.length;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch !== '#') return;
    // lighter ink where the pen lifts
    x.fillStyle = (i + j) % 5 === 0 ? '#3f5cb0' : '#2a3f8f';
    x.fillRect(i, j, 1, 1);
  }));
  tickURL = c.toDataURL();
  return tickURL;
}

// chevron glyph
const CHEV = '<svg class="ql-chev" width="14" height="8" viewBox="0 0 7 4" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M0 0h1v1h-1zM1 1h1v1h-1zM2 2h1v1h-1zM3 3h1v1h-1zM4 2h1v1h-1zM5 1h1v1h-1zM6 0h1v1h-1z"/></svg>';

// own copy of a quest so later in-place edits by the caller still diff
const snap = (q) => ({ ...q, steps: (q.steps || []).map((s) => ({ ...s })), progress: Array.isArray(q.progress) ? q.progress.slice() : q.progress });

const CONF = ['#e84a6e', '#ffc830', '#6cc04a', '#3c8ce0', '#a050e0', '#ff8a3a'];

export function createQuestLog(root, o = {}) {
  injectPaperCSS();
  const sfx = (n, x) => { try { o.sfx?.(n, x); } catch { /* optional */ } };
  const icon = (n, s = 1) => { try { return o.icon?.(n, s) || ''; } catch { return ''; } };

  const el = document.createElement('div');
  el.className = 'ql ql-hidden';
  el.innerHTML = `
    <div class="ql-note">
      ${deco('pushpin', { cls: 'ql-pin', px: 1 })}
      <button type="button" class="ql-head" aria-expanded="true">
        <span class="ql-hico">${icon('clipboard', 1)}</span><span class="ql-ht">Quests</span><b class="ql-n">0</b>${CHEV}
      </button>
      <div class="ql-fold"><div class="ql-list"></div></div>
    </div>
    <div class="ql-fx"></div>`;
  const note = el.querySelector('.ql-note'), list = el.querySelector('.ql-list'), head = el.querySelector('.ql-head'), fxl = el.querySelector('.ql-fx');
  root.appendChild(el);

  // paper texture sized to the note
  let tw = 0, th = 0;
  const retex = () => {
    const w = note.offsetWidth, h = note.offsetHeight;
    if (!w || !h || (Math.abs(w - tw) < PX * 2 && Math.abs(h - th) < PX * 4)) return;
    tw = w; th = Math.ceil(h / 24) * 24; // quantise: fewer textures while folding
    note.style.backgroundImage = `url(${paperTexture('cream', w, th, { edge: 0.35, edgeW: 4, seed: 61 })})`;
  };
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(retex); ro.observe(note); }

  const items = new Map(); // id -> { el, q, leaving }
  let visible = true, collapsed = false, destroyed = false;

  function stepsHTML(q) {
    return (q.steps || []).map((s, i) => `
      <li class="ql-step${s.done ? ' ql-done' : ''}" data-i="${i}">
        <span class="ql-box"><img class="ql-tick" src="${tick()}" alt="" draggable="false"></span>
        <span class="ql-txt">${esc(s.text)}<i class="ql-strike"></i></span>
      </li>`).join('');
  }
  function progHTML(q) {
    if (!Array.isArray(q.progress)) return '';
    const [n, m] = q.progress, f = m > 0 ? Math.max(0, Math.min(1, n / m)) : 0;
    return `<div class="ql-prog"><span class="ql-pbar"><i style="width:${(f * 100).toFixed(1)}%"></i></span><b>${n | 0}/${m | 0}</b></div>`;
  }
  function build(q) {
    const d = document.createElement('div');
    d.className = 'ql-q';
    d.dataset.id = q.id;
    d.innerHTML = `
      <div class="ql-qh"><span class="ql-qi">${icon(q.icon || 'star', 1)}</span><b class="ql-qt">${esc(q.title)}</b></div>
      <ul class="ql-steps">${stepsHTML(q)}</ul>
      <div class="ql-pg">${progHTML(q)}</div>
      ${q.reward ? `<div class="ql-rew"><span>Reward</span><b>${esc(q.reward)}</b></div>` : ''}`;
    d.addEventListener('click', () => { sfx('click'); try { o.onClick?.(q.id); } catch (e) { console.error(e); } });
    return d;
  }
  function update(it, q) {
    const d = it.el, old = it.q;
    if (old.title !== q.title) d.querySelector('.ql-qt').textContent = q.title;
    if ((old.icon || '') !== (q.icon || '')) d.querySelector('.ql-qi').innerHTML = icon(q.icon || 'star', 1);
    const os = old.steps || [], ns = q.steps || [];
    if (os.length !== ns.length || os.some((s, i) => s.text !== ns[i].text)) {
      d.querySelector('.ql-steps').innerHTML = stepsHTML(q);
    } else {
      // tick newly finished steps with the pen
      let k = 0;
      ns.forEach((s, i) => {
        const li = d.querySelectorAll('.ql-step')[i];
        if (s.done && !os[i].done) {
          li.classList.add('ql-done', 'ql-pen');
          li.style.setProperty('--pd', `${k * 220}ms`);
          setTimeout(() => sfx('pen', { volume: 0.6 }), k * 220);
          k++;
          setTimeout(() => li.classList.remove('ql-pen'), 900 + k * 220);
        } else if (!s.done && os[i].done) li.classList.remove('ql-done');
      });
    }
    const pg = d.querySelector('.ql-pg');
    const oldBar = pg.querySelector('.ql-pbar i');
    if (Array.isArray(q.progress) && oldBar) {
      const [n, m] = q.progress, f = m > 0 ? Math.max(0, Math.min(1, n / m)) : 0;
      oldBar.style.width = `${(f * 100).toFixed(1)}%`;
      const b = pg.querySelector('b');
      if (b.textContent !== `${n | 0}/${m | 0}`) { b.textContent = `${n | 0}/${m | 0}`; anim(b, [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.6,.5,1)' }); }
    } else pg.innerHTML = progHTML(q);
    const rew = d.querySelector('.ql-rew b');
    if (rew && q.reward !== old.reward) rew.textContent = q.reward || '';
    it.q = snap(q);
  }

  function leave(id, delay = 0) {
    const it = items.get(id);
    if (!it || it.leaving) return;
    it.leaving = true;
    setTimeout(() => {
      if (destroyed) return;
      const d = it.el, h = d.offsetHeight;
      const a = REDUCED() ? null : anim(d, [
        { height: `${h}px`, opacity: 1, transform: 'none' },
        { height: `${h}px`, opacity: 0, transform: 'translateX(-30px) rotate(-6deg)', offset: 0.55 },
        { height: '0px', opacity: 0, transform: 'translateX(-30px) rotate(-6deg)', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px' },
      ], { duration: 520, easing: 'ease-in', fill: 'forwards' });
      const done = () => { d.remove(); if (items.get(id) === it) items.delete(id); count(); };
      if (a) a.onfinish = done; else done();
    }, delay);
  }

  function count() {
    const n = [...items.values()].filter((i) => !i.leaving).length;
    el.querySelector('.ql-n').textContent = n;
    el.classList.toggle('ql-empty', n === 0 && ![...items.values()].length);
  }

  function flutterIn(d, i) {
    if (REDUCED()) return;
    anim(d, [
      { transform: 'translate(-260px, -30px) rotate(-24deg)', opacity: 0 },
      { transform: 'translate(10px, 4px) rotate(5deg)', opacity: 1, offset: 0.5 },
      { transform: 'translate(-4px, -2px) rotate(-3deg)', offset: 0.7 },
      { transform: 'translate(1px, 0) rotate(1.2deg)', offset: 0.86 },
      { transform: 'none' },
    ], { duration: 720, delay: i * 120, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'backwards' });
    setTimeout(() => sfx('paper', { pitch: 1.2 + Math.random() * 0.2, volume: 0.6 }), i * 120);
  }

  const api = {
    el,
    set(quests) {
      if (destroyed) return;
      const qs = (Array.isArray(quests) ? quests : []).filter((q) => q && q.id != null).slice(0, MAX);
      const ids = new Set(qs.map((q) => String(q.id)));
      for (const [id, it] of items) if (!ids.has(id) && !it.leaving) leave(id);
      let fresh = 0;
      qs.forEach((q) => {
        const id = String(q.id);
        const it = items.get(id);
        if (it && !it.leaving) { update(it, q); list.appendChild(it.el); return; }
        if (it && it.leaving) return; // finishing its exit
        const d = build(q);
        list.appendChild(d);
        items.set(id, { el: d, q: snap(q), leaving: false });
        flutterIn(d, fresh++);
      });
      // keep the visual order of the given list (leaving ones stay where they were)
      count();
      requestAnimationFrame(retex);
    },
    complete(id) {
      if (destroyed) return;
      const it = items.get(String(id));
      if (!it || it.leaving || it.done) return;
      it.done = true;
      const d = it.el;
      d.querySelectorAll('.ql-step').forEach((li, k) => {
        if (li.classList.contains('ql-done')) return;
        li.classList.add('ql-done', 'ql-pen');
        li.style.setProperty('--pd', `${k * 120}ms`);
      });
      d.classList.add('ql-complete');
      const s = document.createElement('div');
      s.className = 'ql-stamp';
      s.innerHTML = stamp('Quest complete!', '#2f8a3c', -8, { delay: 120 });
      d.appendChild(s);
      setTimeout(() => sfx('stamp'), 200);
      setTimeout(() => sfx('star_pop', { pitch: 1.1 }), 380);
      if (collapsed) api.collapse(false);
      confetti(d, 32);
      leave(String(id), 1900);
    },
    setVisible(on) {
      visible = !!on;
      el.classList.toggle('ql-off', !visible);
    },
    collapse(on) {
      collapsed = on == null ? !collapsed : !!on;
      el.classList.toggle('ql-col', collapsed);
      head.setAttribute('aria-expanded', String(!collapsed));
    },
    destroy() {
      destroyed = true;
      if (ro) ro.disconnect();
      el.remove();
    },
  };
  head.addEventListener('click', (e) => { e.stopPropagation(); sfx('paper', { pitch: collapsed ? 1.3 : 1.1, volume: 0.5 }); api.collapse(); });

  function confetti(d, n) {
    if (REDUCED()) return;
    const er = el.getBoundingClientRect(), r = d.getBoundingClientRect();
    const ox = r.left - er.left + r.width / 2, oy = r.top - er.top + r.height * 0.4;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'ql-conf';
      const w = Math.random() < 0.5 ? 8 : 4, h = w === 8 ? 4 : 8;
      p.style.cssText = `left:${ox}px;top:${oy}px;width:${w}px;height:${h}px;background:${CONF[i % CONF.length]}`;
      fxl.appendChild(p);
      const a = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.4, v = 70 + Math.random() * 110;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v, rot = (Math.random() * 2 - 1) * 720;
      const kf = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        kf.push({ transform: `translate(${(dx * t).toFixed(1)}px, ${(dy * t + 160 * t * t).toFixed(1)}px) rotate(${(rot * t).toFixed(0)}deg)`, opacity: t > 0.7 ? (1 - t) / 0.3 : 1 });
      }
      const an = anim(p, kf, { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' });
      if (an) an.onfinish = () => p.remove(); else setTimeout(() => p.remove(), 1400);
    }
  }

  // drop in on creation
  requestAnimationFrame(() => el.classList.remove('ql-hidden'));
  count();
  return api;
}
