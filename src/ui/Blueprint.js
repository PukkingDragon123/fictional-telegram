// Blueprint build mode. The world washes into cyanotype blues with a chalk
// tile grid, and a blueprint sheet slides up from the bottom. Its tabs hold
// your parcels (inventory), clear-land (axe), plants, restaurant, beaver
// works, pond, decor, dig and remove. Things you haven't unlocked yet simply
// aren't on the sheet. A pixel arrow (top-left) leaves the mode.
import { STRUCTURES } from '../data/structures.js';
import { natureCanvas } from '../art/natureArt.js';
import { spriteImg, hasSprite } from './sprites.js';
import './blueprint.css';

const TABS = [
  { id: 'inv', icon: 'box', name: 'Parcels' },
  { id: 'clear', icon: 'axe', name: 'Clear land', feature: 'clear' },
  { id: 'food', icon: 'berry', name: 'Plants' },
  { id: 'restaurant', icon: 'table', name: 'Restaurant', beaver: true },
  { id: 'beaver', icon: 'beaver', name: 'Beaver works', beaver: true },
  { id: 'nature', icon: 'seaweed', name: 'Pond' },
  { id: 'decor', icon: 'gnome', name: 'Decor' },
  { id: 'contraption', icon: 'gear', name: 'Gadgets' },
  { id: 'dig', icon: 'shovel', name: 'Dig pond' },
  { id: 'remove', icon: 'trash', name: 'Remove' },
];

const iconCache = new Map();

export class Blueprint {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.open = false;
    this.tab = 'inv';
    this.el = null;
    this.k = 0;
  }

  // icon for a structure: 2D plant sprite > pixel icon > 3D render
  icon(type) {
    if (iconCache.has(type)) return iconCache.get(type);
    const d = STRUCTURES[type];
    let html = '';
    if (d.sprite) {
      for (const n of d.sprite) {
        const cv = natureCanvas(n, 0, 2);
        if (cv && cv.width > 4) { html = `<img class="px" src="${cv.toDataURL()}" alt="">`; break; }
      }
    }
    if (!html) {
      try {
        const url = this.ui.icons?.structure(type, this.game.structures);
        if (url) html = `<img class="px" src="${url}" alt="">`;
      } catch { /* ignore */ }
    }
    if (!html && hasSprite(d.icon)) html = spriteImg(d.icon, 2);
    iconCache.set(type, html);
    return html;
  }

  tico(name, s = 2) { return hasSprite(name) ? spriteImg(name, s) : `<b>${name[0].toUpperCase()}</b>`; }

  hasBeavers() { return this.game.beavers.count() > 0; }

  enter(tab = null) {
    const game = this.game;
    if (this.open) return;
    this.open = true;
    if (tab) this.tab = tab;
    else if (!Object.keys(game.state.inventory || {}).length) this.tab = this.hasBeavers() && game.isOpen('clear') ? 'clear' : 'food';
    game.audio.play('paper', { volume: 0.5 });
    game.audio.play('whoosh', { volume: 0.25, pitch: 1.4 });
    document.body.classList.add('blueprint');
    this.savedPitch = game.rig.pitch;
    game.rig.pitchGoal = (58 * Math.PI) / 180;
    this.build();
    this.render();
  }

  exit() {
    const game = this.game;
    if (!this.open) return;
    this.open = false;
    game.audio.play('close', { volume: 0.4 });
    document.body.classList.remove('blueprint');
    game.rig.pitchGoal = this.savedPitch ?? (44 * Math.PI) / 180;
    game.setTool({ kind: 'feed' });
    this.el?.classList.add('out');
    const el = this.el;
    setTimeout(() => el?.remove(), 350);
    this.el = null;
  }

  build() {
    const root = document.getElementById('ui');
    const el = document.createElement('div');
    el.className = 'bp';
    el.innerHTML = `
      <div class="bp-back"></div>
      <div class="bp-stamp">BLUEPRINT</div>
      <div class="bp-sheet">
        <div class="bp-tabs"></div>
        <div class="bp-items"></div>
      </div>
      <div class="bp-tip"></div>`;
    root.appendChild(el);
    this.el = el;
    const back = this.ui.arrowButton ? this.ui.arrowButton('left') : Object.assign(document.createElement('button'), { textContent: '◀' });
    back.addEventListener('click', () => this.exit());
    el.querySelector('.bp-back').appendChild(back);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  visibleTabs() {
    const game = this.game;
    return TABS.filter((t) => {
      if (t.feature && !game.isOpen(t.feature)) return false;
      if (t.id === 'inv') return true;
      if (t.id === 'clear') return this.hasBeavers();
      if (t.id === 'dig' || t.id === 'remove') return game.isOpen('clear');
      return this.itemsFor(t.id).length > 0;
    });
  }

  itemsFor(tab) {
    const game = this.game;
    if (tab === 'inv') return Object.entries(game.state.inventory || {}).filter(([, n]) => n > 0).map(([type, n]) => ({ type, n, free: true }));
    return Object.entries(STRUCTURES)
      .filter(([type, d]) => d.category === tab && game.isStructureUnlocked(type) && type !== 'lodge')
      .map(([type]) => ({ type }));
  }

  render() {
    if (!this.el) return;
    const game = this.game;
    const tabs = this.visibleTabs();
    if (!tabs.some((t) => t.id === this.tab)) this.tab = tabs[0]?.id || 'inv';
    const te = this.el.querySelector('.bp-tabs');
    te.innerHTML = tabs.map((t) => `<button class="bp-tab ${t.id === this.tab ? 'on' : ''}" data-tab="${t.id}" title="${t.name}">${this.tico(t.icon, 2)}${t.id === 'inv' && this.itemsFor('inv').length ? `<i class="bp-badge">${this.itemsFor('inv').reduce((a, b) => a + b.n, 0)}</i>` : ''}</button>`).join('');
    te.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { game.audio.play('page', { volume: 0.35 }); this.tab = b.dataset.tab; this.render(); this.selectTabTool(); }));
    const box = this.el.querySelector('.bp-items');
    const tool = game.tool;
    if (this.tab === 'clear' || this.tab === 'dig' || this.tab === 'remove') {
      const info = { clear: ['axe', 'Drag over trees, rocks & weeds'], dig: ['shovel', `Drag to dig  ${this.tico('coin', 1)}${game.digCost()}`], remove: ['trash', 'Tap a build to remove'] }[this.tab];
      box.innerHTML = `<div class="bp-mode">${this.tico(info[0], 3)}<span>${info[1]}</span>${this.tab === 'clear' ? `<span class="bp-sub">${this.tico('beaver', 1)} ×${game.beavers.count()} &nbsp; ${this.tico('berry', 1)} = pay</span>` : ''}</div>`;
      this.selectTabTool();
      return;
    }
    const items = this.itemsFor(this.tab);
    if (!items.length) {
      box.innerHTML = `<div class="bp-mode">${this.tico('box', 3)}<span>Empty! Shop on e-Buy</span></div>`;
      return;
    }
    const beaverless = !this.hasBeavers();
    box.innerHTML = items.map(({ type, n, free }) => {
      const d = STRUCTURES[type];
      const needB = d.builder === 'beaver' && beaverless && !free;
      const sel = tool.kind === 'build' && tool.type === type && !!tool.free === !!free;
      const cost = free ? `<i class="bp-n">×${n}</i>` : `<i class="bp-cost ${game.canAfford(d.cost) ? '' : 'no'}">${this.tico('coin', 1)}${d.cost}</i>`;
      return `<button class="bp-item ${sel ? 'sel' : ''} ${needB ? 'need' : ''}" data-type="${type}" data-free="${free ? 1 : 0}" data-name="${d.name}">
        <span class="bp-ico">${this.icon(type)}</span>${cost}${needB ? `<i class="bp-lock">${this.tico('beaver', 1)}</i>` : ''}${d.builder === 'beaver' && !free ? '<i class="bp-bv"></i>' : ''}
      </button>`;
    }).join('');
    box.querySelectorAll('.bp-item').forEach((b) => {
      b.addEventListener('click', () => {
        const type = b.dataset.type, free = b.dataset.free === '1';
        if (b.classList.contains('need')) { game.notify('Need beavers first!', 'no'); game.audio.play('error', { volume: 0.4 }); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        game.audio.play('click', { volume: 0.35 });
        game.setTool({ kind: 'build', type, free });
        this.render();
      });
      b.addEventListener('pointerenter', () => this.showTip(b));
      b.addEventListener('pointerleave', () => this.showTip(null));
    });
  }

  selectTabTool() {
    const g = this.game;
    if (this.tab === 'clear') g.setTool({ kind: 'clear' });
    else if (this.tab === 'dig') g.setTool({ kind: 'dig' });
    else if (this.tab === 'remove') g.setTool({ kind: 'remove' });
    else if (['clear', 'dig', 'remove'].includes(g.tool.kind)) g.setTool({ kind: 'feed' });
  }

  showTip(b) {
    const tip = this.el?.querySelector('.bp-tip');
    if (!tip) return;
    if (!b) { tip.classList.remove('on'); return; }
    const r = b.getBoundingClientRect();
    tip.textContent = b.dataset.name;
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${r.top - 6}px`;
    tip.classList.add('on');
  }

  update(dt) {
    const game = this.game;
    const target = this.open ? 1 : 0;
    this.k += (target - this.k) * Math.min(1, dt * 5);
    if (Math.abs(this.k - target) < 0.002) this.k = target;
    game.renderer.setBlueprint?.(this.k);
    if (game.world.uniforms.uBlueprint) game.world.uniforms.uBlueprint.value = this.k;
  }
}
