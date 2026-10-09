// [v26 power] The storage slot panel: tap a storage building (Ore Shed, Warehouse,
// Parts Rack, Coal Bunker, Supply Pile, the mine's ore bin) and a little pixel shelf
// pops up over it, like the food bar: a cubby per item with its count, a fill meter
// and a FULL stamp. This is the only place you see your ore and parts.
//
//   const ui = new StorageUI(storage)   (made lazily by src/game/ext/storage.js)
//   ui.open(s)  ui.close()  ui.update(dt)
import './storage.css';
import { spriteImg, hasSprite } from './sprites.js';
import { RES_INFO, RES_IDS } from '../game/Resources.js';
import * as THREE from 'three';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
const _v = new THREE.Vector3();

// what each thing is good for (one short line, shown when you tap a cubby)
const USE = {
  stone: 'Builds sheds and bunkers. Smelts into glass.',
  coal: 'Fuel for the Smelter and the Steam Generator.',
  copper: 'Smelt it into copper ingots.',
  iron: 'Smelt it into iron ingots.',
  gold: 'Smelt it into gold ingots. Shiny.',
  crystal: 'Goes into circuits. Hums a little.',
  ingot_copper: 'Wire and steel plates at the Machine Shop.',
  ingot_iron: 'Gears and steel plates at the Machine Shop.',
  ingot_gold: 'Circuits at the Circuit Fab.',
  glass: 'Solar cells at the Circuit Fab.',
  gear: 'Motors, machines, water wheels.',
  plate: 'Every machine wants some.',
  wire: 'Circuits, motors, solar cells, poles.',
  circuit: 'The brains of the automation machines.',
  motor: 'Wind turbines. Goes vrrrm.',
  solar_cell: 'Two of them make a Solar Panel.',
};

// a pixel plank texture for the shelf
let ART = null;
function art() {
  if (ART) return ART;
  const mk = (w, h, paint) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    paint((px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); });
    return c.toDataURL();
  };
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const plank = mk(32, 9, (put) => {
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 32; x++) {
        let c = y === 0 ? '#e0aa6a' : y === 1 ? '#c98f55' : y >= 7 ? (y === 8 ? '#2e1b10' : '#55331a') : '#a86d38';
        if (y >= 2 && y <= 6) {
          const g = Math.sin(x * 0.4 + y * 1.7) + (rnd() - 0.5) * 0.8;
          if (g > 0.9) c = '#8b5a2b'; else if (g < -1.05) c = '#bb7e46';
          if (y === 4 && (x % 11 === 3 || x % 11 === 4)) c = '#6b4220';
        }
        put(x, y, c);
      }
  });
  // the back board: dark vertical boards with nail heads
  const back = mk(16, 16, (put) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        let c = x % 8 === 0 ? '#2a1a10' : (x % 8 === 1 ? '#5e3a1c' : '#4a2e16');
        const g = Math.sin(y * 0.9 + x * 2.1) + (rnd() - 0.5) * 0.6;
        if (x % 8 > 1 && g > 1.1) c = '#3e2612';
        if ((x % 8 === 4) && (y === 2 || y === 13)) c = '#8a8f9c';
        put(x, y, c);
      }
  });
  ART = { plank, back };
  return ART;
}

export class StorageUI {
  constructor(storage) {
    this.st = storage;
    this.game = storage.game;
    this.s = null;
    this.el = null;
    this.sel = null;
    this.sig = '';
    this.t = 0;
    this.onKey = (e) => { if (e.key === 'Escape' && this.s) { e.stopPropagation(); this.close(); } };
    this.onDown = (e) => { if (this.el && this.s && !this.el.contains(e.target)) this.close(); };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('pointerdown', this.onDown, true);
  }
  get root() { return this.game.ui?.root || document.body; }

  open(s) {
    this.close();
    const A = art();
    const el = document.createElement('div');
    el.className = 'stp pop';
    el.style.setProperty('--stp-plank', `url(${A.plank})`);
    el.style.setProperty('--stp-back', `url(${A.back})`);
    el.innerHTML = `<div class="stp-sign"><span class="stp-ico"></span><b class="stp-name"></b><span class="stp-fill"></span><button class="stp-x" title="Close" aria-label="Close">x</button></div>
      <div class="stp-shelf"><div class="stp-slots" role="list"></div><div class="stp-plank"></div></div>
      <div class="stp-meter"><i></i></div>
      <div class="stp-info"></div><div class="stp-tail"></div>`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this.onClick(e));
    this.root.appendChild(el);
    this.el = el;
    this.s = s;
    this.sel = null;
    this.sig = '';
    this.render();
    this.place();
  }
  close() {
    if (!this.el) return;
    const el = this.el;
    this.el = null; this.s = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 160);
  }
  onClick(e) {
    if (e.target.closest('.stp-x')) { this.game.audio?.play('close', { volume: 0.3 }); this.close(); return; }
    const b = e.target.closest('.stp-slot[data-id]');
    if (!b) return;
    this.sel = this.sel === b.dataset.id ? null : b.dataset.id;
    this.game.audio?.play('click', { volume: 0.3, pitch: 1.2 });
    this.render(true);
  }

  render(force = false) {
    const s = this.s, el = this.el;
    if (!s || !el) return;
    const st = this.st;
    const c = st.contents(s);
    const used = st.used(s), cap = st.cap(s);
    const ids = RES_IDS.filter((id) => (c[id] || 0) > 0);
    for (const id of Object.keys(c)) if (!ids.includes(id) && c[id] > 0) ids.push(id);
    const sig = `${ids.map((id) => `${id}:${c[id]}`).join(',')}|${cap}|${this.sel}`;
    if (!force && sig === this.sig) return;
    const prev = this.counts || {};
    this.sig = sig;
    this.counts = { ...c };
    const full = used >= cap;
    el.classList.toggle('full', full);
    el.querySelector('.stp-ico').innerHTML = ico(s.def.icon, 2) || ico('st_crate', 2);
    el.querySelector('.stp-name').textContent = s.def.name;
    el.querySelector('.stp-fill').innerHTML = full ? '<em>FULL</em>' : `${used}<i>/${cap}</i>`;
    const slots = ids.map((id) => {
      const R = RES_INFO[id] || { name: id };
      const bump = prev[id] != null && prev[id] !== c[id] ? (c[id] > prev[id] ? 'up' : 'down') : '';
      return `<button class="stp-slot ${bump} ${this.sel === id ? 'sel' : ''}" data-id="${id}" role="listitem" title="${esc(R.name)}">${ico(R.icon, 2)}<b class="stp-n">${c[id]}</b></button>`;
    });
    // a few empty cubbies so it reads as a shelf with room left
    const empty = Math.max(full ? 0 : 1, Math.min(6, 4 - ids.length)) ;
    for (let i = 0; i < empty; i++) slots.push('<span class="stp-slot empty"></span>');
    el.querySelector('.stp-slots').innerHTML = slots.join('') || '<span class="stp-none">Empty</span>';
    const k = Math.min(1, used / Math.max(1, cap));
    const m = el.querySelector('.stp-meter i');
    m.style.width = `${Math.round(k * 100)}%`;
    m.className = k >= 1 ? 'red' : k > 0.8 ? 'gold' : '';
    const info = el.querySelector('.stp-info');
    const acc = (s.def.depot.accepts || ['*']);
    if (this.sel && RES_INFO[this.sel]) info.innerHTML = `<b>${esc(RES_INFO[this.sel].name)}</b> ${esc(USE[this.sel] || '')}`;
    else if (!ids.length) info.textContent = acc.includes('*') ? 'Empty. Holds anything.' : acc.includes('coal') && acc.length === 1 ? 'Empty. Coal only.' : acc.includes('ore') ? 'Empty. Ore only: the beavers bring the sacks.' : 'Empty. Ingots and parts only.';
    else if (full) info.textContent = st.isPile(s) ? 'Build a Warehouse: the beavers clear the pile first.' : 'Full! Machines that fill it will wait. Build more storage.';
    else info.textContent = st.isPile(s) ? 'Beavers take from the pile first.' : 'Tap a cubby to see what it is for.';
  }

  place() {
    const s = this.s, el = this.el;
    if (!s || !el) return;
    const game = this.game;
    const c = this.st.center(s);
    const q = game.rig.worldToScreen(_v.set(c.x, this.st.topY(s) + 0.2, c.z), game.renderer);
    const host = this.root.getBoundingClientRect();
    const w = el.offsetWidth || 260, h = el.offsetHeight || 140;
    const W = host.width || innerWidth, H = host.height || innerHeight;
    const x = Math.max(6, Math.min(W - w - 6, q.x - host.left - w / 2));
    const y = Math.max(6, Math.min(H - h - 96, q.y - host.top - h - 12));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const tail = el.querySelector('.stp-tail');
    if (tail) tail.style.left = `${Math.round(Math.max(14, Math.min(w - 14, q.x - host.left - x)))}px`;
    if (q.visible === false) this.close();
  }

  update(dt) {
    if (!this.s) return;
    const s = this.s;
    if (s.removed || (!s.site && !this.st.isDepot(s)) || this.game.homes?.active || this.game.lab?.active || this.game.cutscene?.active || document.body.classList.contains('feast-cam')) { this.close(); return; }
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.25; this.render(); }
    this.place();
  }
}
