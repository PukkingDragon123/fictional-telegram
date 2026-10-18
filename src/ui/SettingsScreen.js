// [v26 menu] The settings page: a whole screen. A plank wall, a SETTINGS board on
// ropes, wooden tabs down the side and a sheet of parchment nailed up with the
// knobs on it: brass sliders, tin switches, stamped choices. Every knob drives the
// real thing through src/ui/settings.js (saved in localStorage, applied at boot).
// Opened from the title signpost and from the in-game menu (UI.showMenu).
//
//   const s = openSettings({ sfx, onClose, inGame });
//   s.close();
import './settings.css';
import settings from './settings.js';
import { SLOTS, slotKey, deleteSlot, anySave } from '../game/saveSlots.js';
import { cv, scaleEl, wood, arrowPlank, board, FONTS } from './titleArt.js';
import { paperTile } from './paper.js';
import { upgradeSliders } from './pxSlider.js'; // [v27 knobs] pixel sliders

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wallTile() {
  // vertical boards, dark, with nail pairs
  const c = cv(48, 64), g = c.getContext('2d');
  g.save(); g.translate(48, 0); g.rotate(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    wood(g, 0, i * 12, 64, 12, 40 + i * 9, { base: [92, 56, 36], dark: [66, 40, 26], light: [118, 76, 48] });
    g.fillStyle = '#1e0f08'; g.fillRect(0, i * 12 + 11, 64, 1);
  }
  g.restore();
  g.fillStyle = '#b8bcc6';
  for (let i = 0; i < 4; i++) { g.fillRect(i * 12 + 5, 6, 1, 1); g.fillRect(i * 12 + 5, 38, 1, 1); }
  return c;
}
function tabTile() {
  const c = cv(32, 12), g = c.getContext('2d');
  wood(g, 0, 0, 32, 12, 61, { base: [168, 104, 58], dark: [122, 72, 38], light: [206, 146, 88] });
  return c;
}
const TABS = [
  { id: 'sound', name: 'Sound' },
  { id: 'picture', name: 'Picture' },
  { id: 'camera', name: 'Camera' },
  { id: 'game', name: 'Game' },
  { id: 'controls', name: 'Controls' },
  { id: 'credits', name: 'Credits' },
];
const NOTES = {
  sound: 'Music UP, please. I paid that band in fish.',
  picture: 'Chunky pixels hide the dust. Fine pixels show my good side.',
  camera: 'Drag the world around. It is mine, after all.',
  game: 'Reset the tutorials and I will explain EVERYTHING again. Gladly.',
  controls: 'Or just click things until money comes out.',
  credits: 'Produced, directed and owned by Reynard. Mostly.',
};
const CONTROLS = [
  ['Drag', 'Pan the camera'], ['Scroll / Pinch', 'Zoom'], ['Z  X  +  -', 'Zoom in / out'], ['Q  E', 'Turn the view'],
  ['W  A  S  D', 'Move the camera'], ['Shift', 'Move faster'], ['1 - 9', 'Pick a tool'], ['Space', 'Pause'],
  ['B', 'Ring the bell (open early)'], ['F', 'Follow a bear'], ['Esc', 'Cancel / close'], ['Tap', 'Toss food, pick things'],
];

const slider = (k, label, { min = 0, max = 100, step = 1, unit = '%' } = {}) => ({ type: 'range', k, label, min, max, step, unit });
const toggle = (k, label, on = 'On', off = 'Off', invert = false) => ({ type: 'toggle', k, label, on, off, invert });
const choice = (k, label, opts) => ({ type: 'choice', k, label, opts });
const PAGES = {
  sound: [slider('music', 'Music'), slider('sfx', 'Sound effects'), slider('ambience', 'Ambience'), toggle('muted', 'Sound', 'On', 'Off', true)],
  picture: [
    toggle('fullscreen', 'Fullscreen'),
    choice('pixel', 'Pixel size', [[0.7, 'Chunky'], [1, 'Normal'], [1.4, 'Fine']]),
    toggle('shadows', 'Shadows'), toggle('glow', 'Glow'),
    choice('particles', 'Particles', [[1, 'Lots'], [0.5, 'Some'], [0.25, 'Few']]),
  ],
  camera: [
    slider('panSpeed', 'Pan speed', { min: 50, max: 200, step: 10 }),
    toggle('invertDrag', 'Invert drag'),
    toggle('rotButtons', 'Turn buttons', 'Show', 'Hide'),
  ],
  game: [
    choice('textSpeed', 'Text speed', [[0.6, 'Slow'], [1, 'Normal'], [1.8, 'Fast'], [50, 'Instant']]),
    toggle('reduceMotion', 'Reduce motion'),
    { type: 'lang', label: 'Language' },
    { type: 'action', id: 'tutorials', label: 'Tutorials', btn: 'Reset' },
    { type: 'action', id: 'wipe', label: 'All saves', btn: 'Delete', red: true, title: true },
  ],
};
// sliders show 0..100 for volumes (stored 0..1) and 50..200 for the pan speed (stored 0.5..2)
const toUI = (k, v) => Math.round(+v * 100);
const fromUI = (k, v) => +v / 100;

export function openSettings({ sfx, onClose, inGame = false } = {}) {
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  // in game: the pond waits while you fiddle with knobs
  const g = inGame ? settings.game : null;
  const wasPaused = !!g?.state?.paused;
  if (g?.state) g.state.paused = true;
  const el = document.createElement('div');
  el.className = 'stg';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Settings');
  if (inGame) el.classList.add('stg--game');
  const u = window.innerWidth < 560 || window.innerHeight < 520 ? 2 : 3;
  el.style.setProperty('--u', `${u}px`);
  el.style.setProperty('--wall', `url(${wallTile().toDataURL()})`);
  el.style.setProperty('--tab', `url(${tabTile().toDataURL()})`);
  const parch = paperTile('cream');
  el.style.setProperty('--parch', `url(${parch.url})`);
  el.style.setProperty('--parch-w', `${parch.w}`);
  el.innerHTML = `
    <button class="stg-back" aria-label="Back"></button>
    <div class="stg-head"><i class="stg-rope stg-rope--l"></i><i class="stg-rope stg-rope--r"></i></div>
    <div class="stg-body">
      <nav class="stg-tabs" role="tablist">${TABS.map((t, i) => `<button class="stg-tab" role="tab" data-t="${t.id}" style="--i:${i}">${t.name}</button>`).join('')}</nav>
      <section class="stg-sheet"><i class="stg-nail stg-nail--a"></i><i class="stg-nail stg-nail--b"></i><div class="stg-pages"></div><p class="stg-note"></p></section>
    </div>`;
  el.querySelector('.stg-back').appendChild(scaleEl(arrowPlank('BACK', null, { dir: -1, minW: 44, seed: 5 }), u));
  el.querySelector('.stg-head').appendChild(scaleEl(board(['SETTINGS'], { font: FONTS.hi, pad: 10, seed: 14 }), u));
  const pages = el.querySelector('.stg-pages');

  // ---- build the pages
  const rowHTML = (r) => {
    if (r.type === 'range') {
      return `<label class="stg-row"><span class="stg-lab">${esc(r.label)}</span><span class="stg-ctl"><input class="stg-range" type="range" data-k="${r.k}" min="${r.min}" max="${r.max}" step="${r.step}"><b class="stg-val"></b></span></label>`;
    }
    if (r.type === 'toggle') {
      return `<div class="stg-row"><span class="stg-lab">${esc(r.label)}</span><span class="stg-ctl"><button class="stg-tog" role="switch" data-k="${r.k}" data-on="${esc(r.on)}" data-off="${esc(r.off)}" ${r.invert ? 'data-inv="1"' : ''} aria-label="${esc(r.label)}"><i class="stg-knob"></i><span></span></button></span></div>`;
    }
    if (r.type === 'choice') {
      return `<div class="stg-row"><span class="stg-lab">${esc(r.label)}</span><span class="stg-ctl"><span class="stg-seg" role="radiogroup" aria-label="${esc(r.label)}" data-k="${r.k}">${r.opts.map(([v, n]) => `<button role="radio" data-v="${v}">${esc(n)}</button>`).join('')}</span></span></div>`;
    }
    if (r.type === 'lang') return '<div class="stg-row" hidden><span class="stg-lab">Language</span><span class="stg-ctl">English</span></div>';
    if (r.type === 'action') {
      if (r.title && inGame) return `<div class="stg-row"><span class="stg-lab">${esc(r.label)}</span><span class="stg-ctl stg-small">From the title screen</span></div>`;
      return `<div class="stg-row"><span class="stg-lab">${esc(r.label)}</span><span class="stg-ctl"><button class="stg-act${r.red ? ' is-red' : ''}" data-a="${r.id}">${esc(r.btn)}</button><em class="stg-done"></em></span></div>`;
    }
    return '';
  };
  for (const t of TABS) {
    const pg = document.createElement('div');
    pg.className = 'stg-page';
    pg.dataset.t = t.id;
    pg.setAttribute('role', 'tabpanel');
    if (PAGES[t.id]) pg.innerHTML = PAGES[t.id].map(rowHTML).join('');
    else if (t.id === 'controls') {
      pg.innerHTML = `<div class="stg-keys">${CONTROLS.map(([k, a]) => `<span class="stg-key">${k.split('  ').map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</span><span class="stg-what">${esc(a)}</span>`).join('')}</div>`;
    } else if (t.id === 'credits') {
      pg.innerHTML = `
        <div class="stg-cred">
          <h3>The Bear Must Eat</h3>
          <p>Every model, sprite and sound is made by code: no bought art, no recordings.</p>
          <h4>Font</h4>
          <p>TBME Goofy, made from <b>Chewy</b> by Font Diner / Sideshow (Apache 2.0).</p>
          <h4>Music &amp; sound</h4>
          <p>Original tunes and every sound effect are synthesized live in your browser by the game's own Web Audio engine.</p>
          <h4>Built with</h4>
          <p>three.js (MIT) and Vite (MIT).</p>
        </div>`;
    }
    pages.appendChild(pg);
  }
  document.body.appendChild(el);
  try { upgradeSliders(el, { texel: u, sfx: false }); } catch (e) { console.warn('pxSlider', e); } // [v27 knobs] (tick sounds: the input handler below)

  // ---- bind the knobs
  const refresh = () => {
    for (const inp of el.querySelectorAll('.stg-range')) {
      const v = toUI(inp.dataset.k, settings.get(inp.dataset.k));
      if (document.activeElement !== inp) inp.value = v;
      paintRange(inp);
    }
    for (const b of el.querySelectorAll('.stg-tog')) {
      let on = !!settings.get(b.dataset.k);
      if (b.dataset.inv) on = !on;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-on', on);
      b.querySelector('span').textContent = on ? b.dataset.on : b.dataset.off;
    }
    for (const seg of el.querySelectorAll('.stg-seg')) {
      const cur = +settings.get(seg.dataset.k);
      let best = null, bd = Infinity;
      for (const b of seg.children) { const d = Math.abs(+b.dataset.v - cur); if (d < bd) { bd = d; best = b; } }
      for (const b of seg.children) { b.setAttribute('aria-checked', String(b === best)); b.classList.toggle('is-on', b === best); }
    }
  };
  const paintRange = (inp) => {
    const p = (inp.value - inp.min) / (inp.max - inp.min);
    inp.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    inp.nextElementSibling.textContent = `${inp.value}%`;
  };
  let tickV = null;
  for (const inp of el.querySelectorAll('.stg-range')) {
    inp.addEventListener('input', () => {
      settings.set(inp.dataset.k, fromUI(inp.dataset.k, inp.value));
      paintRange(inp);
      const step = Math.round(inp.value / 10);
      if (step !== tickV) { tickV = step; play('set_tick', { pitch: 0.8 + (inp.value - inp.min) / (inp.max - inp.min) * 0.5 }); }
    });
    inp.addEventListener('change', () => { if (inp.dataset.k === 'sfx') play('coin', { volume: 0.5 }); });
  }
  for (const b of el.querySelectorAll('.stg-tog')) {
    b.addEventListener('click', () => {
      let on = !settings.get(b.dataset.k);
      settings.set(b.dataset.k, on);
      play('set_tick'); play('click', { delay: 0.04 });
      b.classList.remove('is-flip'); void b.offsetWidth; b.classList.add('is-flip');
      if (b.dataset.k === 'fullscreen') setTimeout(refresh, 300);
      refresh();
    });
  }
  for (const seg of el.querySelectorAll('.stg-seg')) {
    for (const b of seg.children) {
      b.addEventListener('click', () => {
        settings.set(seg.dataset.k, +b.dataset.v);
        play('stamp'); play('click', { delay: 0.03 });
        b.classList.remove('is-stamp'); void b.offsetWidth; b.classList.add('is-stamp');
        refresh();
      });
    }
  }
  const done = (btn, msg) => { const em = btn.nextElementSibling; em.textContent = msg; em.classList.remove('is-pop'); void em.offsetWidth; em.classList.add('is-pop'); };
  for (const b of el.querySelectorAll('.stg-act')) {
    let armed = 0;
    b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'tutorials') {
        const keys = []; for (let n = 1; n <= SLOTS; n++) keys.push(slotKey(n));
        settings.resetTutorials(keys);
        play('paper');
        done(b, 'Done! Every lesson is back.');
        return;
      }
      if (a === 'wipe') {
        if (!anySave()) { play('error'); done(b, 'No saves to delete.'); return; }
        if (!armed) {
          armed = 1;
          play('warning', { volume: 0.4 });
          b.textContent = 'Sure? Tap again';
          b.classList.add('is-armed');
          setTimeout(() => { if (armed === 1) { armed = 0; b.textContent = 'Delete'; b.classList.remove('is-armed'); } }, 3200);
          return;
        }
        armed = 2;
        for (let n = 1; n <= SLOTS; n++) deleteSlot(n);
        play('box_kick');
        b.textContent = 'Delete'; b.classList.remove('is-armed');
        done(b, 'All three boxes are empty.');
        armed = 0;
      }
    });
  }
  const offChange = settings.onChange(() => refresh());
  const onFs = () => refresh();
  document.addEventListener('fullscreenchange', onFs);
  refresh();

  // ---- tabs
  const note = el.querySelector('.stg-note');
  let cur = null;
  const show = (id, quiet = false) => {
    if (id === cur) return;
    cur = id;
    for (const b of el.querySelectorAll('.stg-tab')) { const on = b.dataset.t === id; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); }
    for (const p of el.querySelectorAll('.stg-page')) p.classList.toggle('is-on', p.dataset.t === id);
    note.textContent = NOTES[id] || '';
    note.classList.remove('is-in'); void note.offsetWidth; note.classList.add('is-in');
    const sheet = el.querySelector('.stg-sheet');
    sheet.classList.remove('is-flip'); void sheet.offsetWidth; sheet.classList.add('is-flip');
    if (!quiet) play('menu_page', { volume: 0.7 });
  };
  for (const b of el.querySelectorAll('.stg-tab')) {
    b.addEventListener('click', () => show(b.dataset.t));
    b.addEventListener('pointerenter', () => play('hover', { volume: 0.4 }));
  }
  show('sound', true);

  // ---- close
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    offChange();
    document.removeEventListener('fullscreenchange', onFs);
    el.classList.add('stg--out');
    play('close', { volume: 0.5 });
    if (g?.state && !wasPaused) g.state.paused = false;
    setTimeout(() => { el.remove(); onClose?.(); }, 380);
  };
  el.querySelector('.stg-back').addEventListener('click', close);
  el.querySelector('.stg-back').addEventListener('pointerenter', () => play('hover', { volume: 0.5 }));
  // keys stay on this page (no camera turning behind it); Esc / Backspace go back
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (!e.target.classList?.contains('stg-tab')) return;
      const list = [...el.querySelectorAll('.stg-tab')];
      const i = list.indexOf(e.target);
      const n = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
      n.focus(); show(n.dataset.t);
    }
  });
  play('open', { volume: 0.5 });
  requestAnimationFrame(() => { el.classList.add('stg--in'); el.querySelector('.stg-tab.is-on')?.focus({ preventScroll: true }); });
  return { el, close, show };
}
