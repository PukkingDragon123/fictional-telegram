// The Food tool's pantry shelf: a little wooden shelf over the toolbar with
// every bag (its own packaging art, slumping as it empties) and every crate of
// produce you own. Tap to pick; the pick hops into the spotlight, a paper
// nameplate says what it is good for, and a big copy of the bag stands at the
// left end with the scoops left.
//
//   const p = new FoodPicker({ root, getItems: () => [{ id, count, locked }], selected,
//                              onSelect(id), onBuy(id), sfx(name, opts), icon(name, scale) });
//   p.show(); p.hide(); p.refresh(); p.setSelected(id); p.pulse(id); p.dispose(); p.el
//
//   harvestPopup({ root, items: [{ id, count, rarity: 0..4, special }], from: { x, y },
//                  to: element | { x, y }, sfx? }) -> Promise
//     produce bursts out at `from` with rarity sparkles, arcs into `to` and
//     counts up; a legendary special gets a golden flash + "SPECIAL FIND!".
import './foodpicker.css';
import { FOOD_ITEMS } from '../data/foods.js';
import { RARITIES } from '../data/species.js';
import { bagCanvas, produceCanvas } from './bagArt.js';
import { spriteImg, spriteCanvas, hasSprite } from './sprites.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isBag = (id) => ['bag', 'made'].includes(FOOD_ITEMS[id]?.kind);
const capOf = (id) => FOOD_ITEMS[id]?.scoops || 30;
const fillOf = (id, n) => Math.max(0, Math.min(1, n / capOf(id)));
const iconName = (id) => (isBag(id) ? 'bag_' + id : FOOD_ITEMS[id]?.icon || id);

// fish effects -> pictogram chips (icon, label)
const FISH_CHIPS = [
  ['fill', 'yum', 'Fills bellies'],
  ['love', 'heart', 'Love: breeding'],
  ['happy', 'sparkle', 'Happy fish'],
  ['grow', 'arrow_up', 'Fry grow fast'],
  ['luck', 'clover', 'Mutation luck'],
];
const SCALE_OF = { fill: 0.35, love: 0.5, happy: 0.2, grow: 30, luck: 0.25 };

// ---------------------------------------------------------------- pixel shelf art
let SHELF_ART = null;
function shelfArt() {
  if (SHELF_ART) return SHELF_ART;
  const mk = (w, h, paint) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    paint((px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); });
    return c.toDataURL();
  };
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const plank = mk(32, 9, (put) => {
    for (let y = 0; y < 9; y++)
      for (let x = 0; x < 32; x++) {
        let c = y === 0 ? '#e0aa6a' : y === 1 ? '#c98f55' : y >= 7 ? (y === 8 ? '#2e1b10' : '#55331a') : '#a86d38';
        if (y >= 2 && y <= 6) {
          const grain = Math.sin(x * 0.4 + y * 1.7) + (rnd() - 0.5) * 0.8;
          if (grain > 0.9) c = '#8b5a2b'; else if (grain < -1.05) c = '#bb7e46';
          if (y === 4 && (x % 13 === 5 || x % 13 === 6)) c = '#6b4220';
        }
        put(x, y, c);
      }
  });
  const bracket = mk(8, 10, (put) => {
    const rows = ['KKKKKKKK', 'KhhhhhhK', 'KhdddddK', 'KhdKKKKK', 'KhdK....', 'KhdK....', 'KhdK....', 'KhK.....', 'KdK.....', '.K......'];
    const pal = { K: '#2a1a14', h: '#9aa0b0', d: '#5e5c6c' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) put(x, y, pal[ch]); }));
  });
  SHELF_ART = { plank, bracket };
  return SHELF_ART;
}

export class FoodPicker {
  constructor(o = {}) {
    this.o = o;
    this.root = o.root || document.body;
    this.sel = o.selected || 'pellets';
    this.filter = 'all';
    this.items = [];
    this.sig = '';
    this.timers = new Set();
    this.counts = {};
    const art = shelfArt();
    const el = (this.el = document.createElement('div'));
    el.className = 'fp ia';
    el.style.setProperty('--fp-plank', `url(${art.plank})`);
    el.style.setProperty('--fp-bracket', `url(${art.bracket})`);
    el.innerHTML = `
      <div class="fp-plate" aria-live="polite"></div>
      <div class="fp-shelf">
        <div class="fp-hero" title="Selected food"><div class="fp-spot"></div><div class="fp-heroart"></div><b class="fp-num">0</b></div>
        <div class="fp-items" role="listbox"></div>
        <div class="fp-filter" role="tablist">
          <button data-f="all" class="on" title="Everything">${this.ico('food', 1)}<i>All</i></button>
          <button data-f="fish" title="Fish food">${this.ico('bag_pellets', 1)}<i>Fish</i></button>
          <button data-f="produce" title="Produce">${this.ico('carrot', 1)}<i>Farm</i></button>
        </div>
        <div class="fp-plank"></div>
      </div>`;
    this.$plate = el.querySelector('.fp-plate');
    this.$hero = el.querySelector('.fp-heroart');
    this.$num = el.querySelector('.fp-num');
    this.$items = el.querySelector('.fp-items');
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(el);
    this.onResize = () => this.anchor();
    addEventListener('resize', this.onResize);
    this.refresh(true);
  }

  // sit right on top of the toolbar, whatever frame / screen size it has
  anchor() {
    const tb = document.getElementById('toolbar');
    if (!tb || !tb.offsetHeight) { this.el.style.bottom = ''; return; }
    const r = tb.getBoundingClientRect(), host = this.root.getBoundingClientRect();
    this.el.style.bottom = Math.max(0, Math.round(host.bottom - r.top - 3)) + 'px';
  }

  ico(name, scale = 2) {
    if (this.o.icon) { const h = this.o.icon(name, scale); if (h) return h; }
    return hasSprite(name) ? spriteImg(name, scale) : '';
  }
  sfx(name, opts) { try { this.o.sfx?.(name, opts); } catch { /* sound is optional */ } }
  later(fn, ms) { const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms); this.timers.add(t); return t; }

  // ------------------------------------------------------------ public API
  show() {
    if (this.shown) return;
    this.shown = true;
    this.anchor();
    this.refresh();
    this.el.classList.remove('fp-out');
    this.el.classList.add('fp-on');
  }
  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.el.classList.remove('fp-on');
    this.el.classList.add('fp-out');
  }
  setSelected(id) {
    if (!FOOD_ITEMS[id] || id === this.sel) return;
    this.sel = id;
    this.refresh(true);
    this.hop(id);
  }
  refresh(force = false) {
    let items = [];
    try { items = (this.o.getItems?.() || []).filter((it) => FOOD_ITEMS[it.id]); } catch (e) { console.warn('FoodPicker items', e); }
    this.items = items;
    for (const it of items) this.counts[it.id] = it.count;
    const sig = this.filter + '|' + this.sel + '|' + items.map((it) => `${it.id}:${Math.floor(it.count)}:${it.locked ? 1 : 0}`).join(',');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.renderItems();
    this.renderHero();
    this.renderPlate();
  }
  // a scoop was thrown: the big bag shakes, a scoop pops out, the number ticks down
  pulse(id) {
    this.refresh();
    if (id !== this.sel) return;
    const frames = isBag(id) ? [0.75, -0.75, 0.5, -0.5, 0.25, 0] : [];
    frames.forEach((sh, i) => this.later(() => this.renderHero(sh), i * 45));
    const hero = this.el.querySelector('.fp-hero');
    hero.classList.remove('fp-throw'); void hero.offsetWidth; hero.classList.add('fp-throw');
    const pop = document.createElement('div');
    pop.className = 'fp-scoop';
    pop.innerHTML = this.ico(isBag(id) ? 'scoop' : iconName(id), 2);
    hero.appendChild(pop);
    this.later(() => pop.remove(), 700);
    this.$num.classList.remove('fp-tick'); void this.$num.offsetWidth; this.$num.classList.add('fp-tick');
  }
  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    removeEventListener('resize', this.onResize);
    this.el.remove();
  }

  // ------------------------------------------------------------ rendering
  visible() {
    const f = this.filter;
    return this.items.filter((it) => f === 'all' || (f === 'fish' ? isBag(it.id) : !isBag(it.id)));
  }
  renderItems() {
    const list = this.visible();
    if (!list.length) {
      this.$items.innerHTML = `<div class="fp-none">${this.ico('harvest', 2)}<span>Nothing here yet</span></div>`;
      return;
    }
    this.$items.innerHTML = '';
    for (const it of list) {
      const f = FOOD_ITEMS[it.id];
      const bag = isBag(it.id);
      const empty = !it.locked && it.count <= 0;
      const b = document.createElement('button');
      b.className = `fp-item ${bag ? 'fp-bag' : 'fp-crate'}${it.id === this.sel ? ' sel' : ''}${empty ? ' empty' : ''}${it.locked ? ' locked' : ''}${f.kind === 'special' ? ' special' : ''}`;
      b.dataset.id = it.id;
      b.title = it.locked ? `${f.name}: not in stock yet` : `${f.name} (${Math.floor(it.count)})`;
      b.setAttribute('role', 'option');
      const art = document.createElement('div');
      art.className = 'fp-art';
      // cached canvases are shared: show a copy
      art.appendChild(copyCanvas(bag ? bagCanvas(it.id, { scale: 1, fill: fillOf(it.id, it.count), ghost: it.locked }) : produceCanvas(it.id, 2)));
      b.appendChild(art);
      if (it.locked) b.insertAdjacentHTML('beforeend', `<span class="fp-lock">${this.ico('lock', 1)}</span><span class="fp-buy fp-cart" data-buy="${it.id}" title="Find it on e-Buy">${this.ico('shop', 1)}</span>`);
      else if (empty) {
        b.insertAdjacentHTML('beforeend', f.kind === 'bag'
          ? `<span class="fp-buy" data-buy="${it.id}" title="Buy more on e-Buy">${this.ico('shop', 1)}<i>Buy</i></span>`
          : f.kind === 'made' ? `<span class="fp-src" title="Made by the Bug Grinder">${this.ico('buggrinder', 1)}</span>` : '');
      } else b.insertAdjacentHTML('beforeend', `<b class="fp-badge">${Math.floor(it.count)}</b>`);
      if (f.kind === 'special') b.insertAdjacentHTML('beforeend', '<i class="fp-glint"></i>');
      this.$items.appendChild(b);
    }
  }
  renderHero(shake = 0) {
    const id = this.sel, n = Math.floor(this.counts[id] ?? 0);
    const bag = isBag(id);
    const cv = bag ? bagCanvas(id, { scale: 2, fill: fillOf(id, n), open: n > 0, shake }) : produceCanvas(id, 3);
    this.$hero.dataset.kind = bag ? 'bag' : 'crate';
    this.$hero.textContent = '';
    this.$hero.appendChild(copyCanvas(cv));
    this.el.querySelector('.fp-hero').classList.toggle('empty', n <= 0);
    if (this.$num.textContent !== String(n)) this.$num.textContent = String(n);
  }
  renderPlate() {
    const id = this.sel, f = FOOD_ITEMS[id];
    if (!f) { this.$plate.innerHTML = ''; return; }
    const chips = [];
    if (f.fish) for (const [k, icon, tip] of FISH_CHIPS) {
      const v = f.fish[k];
      if (!v) continue;
      const pips = Math.max(1, Math.min(3, Math.round((v / SCALE_OF[k]) * 2)));
      chips.push(`<span class="fp-chip" title="${esc(tip)}">${this.ico(icon, 1)}<em>${'•'.repeat(pips)}</em></span>`);
    }
    const who = [];
    if (f.bear) who.push(`<span class="fp-chip fp-who" title="Bears eat it (Snack Bowl / Pantry)">${this.ico('bear', 1)}</span>`);
    if (f.beaver) who.push(`<span class="fp-chip fp-who" title="Beavers work for it (Snack Bar)">${this.ico('beaver', 1)}</span>`);
    const where = [];
    if (f.fish) where.push(`${this.ico('drop', 1)}water`);
    if (f.bear) where.push(`${this.ico('bowl', 1)}Snack Bowl`);
    if (f.beaver) where.push(`${this.ico('beaverbar', 1)}Snack Bar`);
    const hint = where.length === 1 ? `tap the ${where[0]}` : `tap ${where.slice(0, -1).join(', ')} or ${where[where.length - 1]}`;
    const sub = f.brand ? `<span class="fp-brand">${esc(f.brand)}</span>${f.tagline ? ` <q>${esc(f.tagline)}</q>` : ''}` : `<span class="fp-brand">${f.kind === 'special' ? `<b style="color:${RARITIES[f.rarity || 0]?.color}">${esc(RARITIES[f.rarity || 0]?.name || '')}</b> find` : 'Fresh from the farm'}</span>`;
    this.$plate.innerHTML = `
      <div class="fp-tag">
        <b class="fp-name">${esc(f.name)}</b>
        <div class="fp-sub">${sub}</div>
        <div class="fp-chips">${chips.join('')}${who.length ? `<span class="fp-sep"></span>${who.join('')}` : ''}</div>
        <div class="fp-hint">${this.ico('cursor_hand', 1)}<span>${hint}</span></div>
      </div>`;
    this.$plate.classList.remove('fp-flip'); void this.$plate.offsetWidth; this.$plate.classList.add('fp-flip');
  }
  hop(id) {
    const b = this.$items.querySelector(`.fp-item[data-id="${CSS.escape(id)}"]`);
    if (b) { b.classList.remove('fp-hop'); void b.offsetWidth; b.classList.add('fp-hop'); }
    const hero = this.el.querySelector('.fp-hero');
    hero.classList.remove('fp-swap'); void hero.offsetWidth; hero.classList.add('fp-swap');
  }

  onClick(e) {
    const buy = e.target.closest('[data-buy]');
    if (buy) { e.stopPropagation(); this.sfx('click'); this.o.onBuy?.(buy.dataset.buy); return; }
    const fb = e.target.closest('.fp-filter button');
    if (fb) {
      this.filter = fb.dataset.f;
      for (const x of this.el.querySelectorAll('.fp-filter button')) x.classList.toggle('on', x === fb);
      this.sfx('click', { volume: 0.25 });
      this.refresh(true);
      return;
    }
    const it = e.target.closest('.fp-item');
    if (!it) return;
    const id = it.dataset.id;
    const rec = this.items.find((x) => x.id === id);
    if (rec?.locked) { this.sfx('error', { volume: 0.25 }); this.o.onBuy?.(id); return; }
    if (id !== this.sel) {
      this.sel = id;
      this.refresh(true);
      this.hop(id);
      this.sfx(isBag(id) ? 'bag_rustle' : 'crate_drop', { volume: 0.3 });
      this.o.onSelect?.(id);
    } else this.hop(id);
  }
}

// ======================================================================
// HARVEST POPUP
// ======================================================================
function pointOf(t) {
  if (!t) return { x: innerWidth / 2, y: innerHeight - 40 };
  if (typeof t.getBoundingClientRect === 'function') {
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: +t.x || 0, y: +t.y || 0 };
}
const itemCanvas = (id, scale) => {
  const n = iconName(id);
  if (hasSprite(n)) return spriteCanvas(n, scale);
  return produceCanvas(id, scale);
};
function copyCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

export function harvestPopup({ root, items = [], from, to, sfx } = {}) {
  const host = root || document.body;
  const layer = document.createElement('div');
  layer.className = 'fp-harvest';
  host.appendChild(layer);
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  const A = { x: +from?.x || innerWidth / 2, y: +from?.y || innerHeight / 2 };
  const B = pointOf(to);
  const anims = [];
  const legendary = items.find((it) => it.special && (it.rarity ?? FOOD_ITEMS[it.id]?.rarity ?? 0) >= 4);
  let t0 = 0;
  if (legendary) {
    // golden flash + banner, the find hovers big before it joins the others
    const flash = document.createElement('div');
    flash.className = 'fp-flash';
    flash.style.setProperty('--x', A.x + 'px');
    flash.style.setProperty('--y', A.y + 'px');
    layer.appendChild(flash);
    anims.push(flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out', fill: 'forwards' }));
    const ban = document.createElement('div');
    ban.className = 'fp-banner';
    ban.innerHTML = `<b>SPECIAL FIND!</b><span>${esc(FOOD_ITEMS[legendary.id]?.name || '')}</span>`;
    layer.appendChild(ban);
    anims.push(ban.animate([
      { transform: 'translate(-50%, -50%) scale(0) rotate(-12deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.25) rotate(3deg)', opacity: 1, offset: 0.12 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(-2deg)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(-2deg)', opacity: 1, offset: 0.82 },
      { transform: 'translate(-50%, -50%) scale(0.8) rotate(-2deg)', opacity: 0 },
    ], { duration: 2100, fill: 'forwards' }));
    play('harvest_special', { volume: 0.5 });
    t0 = 650;
  }
  items.forEach((it, i) => {
    const f = FOOD_ITEMS[it.id];
    if (!f) return;
    const rar = Math.max(0, Math.min(4, it.rarity ?? f.rarity ?? 0));
    const col = RARITIES[rar] || RARITIES[0];
    const big = it === legendary;
    const delay = t0 + i * 130 + (big ? -300 : 0);
    const wrap = document.createElement('div');
    wrap.className = 'fp-hv' + (big ? ' big' : '');
    wrap.style.setProperty('--rc', col.color);
    wrap.style.setProperty('--rg', col.glow);
    wrap.appendChild(copyCanvas(itemCanvas(it.id, big ? 4 : 2)));
    const cnt = document.createElement('b');
    cnt.className = 'fp-cnt';
    cnt.textContent = '+1';
    wrap.appendChild(cnt);
    layer.appendChild(wrap);
    // burst up and out, hang, then arc into the food button
    const ang = -Math.PI / 2 + (i - (items.length - 1) / 2) * 0.55;
    const P = { x: A.x + Math.cos(ang) * (big ? 0 : 46), y: A.y + Math.sin(ang) * 46 - (big ? 70 : 10) };
    const C = { x: (P.x + B.x) / 2 + (B.x > P.x ? -1 : 1) * 60, y: Math.min(P.y, B.y) - 120 };
    const kf = [{ transform: `translate(${A.x}px, ${A.y}px) translate(-50%, -50%) scale(0)`, opacity: 0, offset: 0 }];
    kf.push({ transform: `translate(${P.x}px, ${P.y}px) translate(-50%, -50%) scale(1.35, 0.8)`, opacity: 1, offset: 0.14 });
    kf.push({ transform: `translate(${P.x}px, ${P.y - 6}px) translate(-50%, -50%) scale(0.9, 1.15)`, opacity: 1, offset: 0.22 });
    kf.push({ transform: `translate(${P.x}px, ${P.y}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.4 });
    for (let k = 1; k <= 10; k++) {
      const t = k / 10, u = 1 - t;
      const x = u * u * P.x + 2 * u * t * C.x + t * t * B.x, y = u * u * P.y + 2 * u * t * C.y + t * t * B.y;
      kf.push({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - t * 0.55}) rotate(${t * 200}deg)`, opacity: k === 10 ? 0 : 1, offset: 0.4 + t * 0.6 });
    }
    const dur = big ? 1900 : 1250;
    const an = wrap.animate(kf, { duration: dur, delay, easing: 'linear', fill: 'both' });
    anims.push(an);
    // the count rolls up while it hangs in the air
    const n = Math.max(1, Math.floor(it.count || 1));
    for (let k = 1; k <= Math.min(n, 12); k++) {
      const v = Math.round((k / Math.min(n, 12)) * n);
      setTimeout(() => { cnt.textContent = '+' + v; }, delay + 150 + k * (300 / Math.min(n, 12)));
    }
    setTimeout(() => play(big ? 'harvest_pop' : 'harvest_pop', { volume: 0.35, pitch: 1 + i * 0.07 + rar * 0.04 }), delay);
    // rarity sparkles
    const ns = 5 + rar * 3 + (big ? 10 : 0);
    for (let k = 0; k < ns; k++) {
      const sp = document.createElement('i');
      sp.className = 'fp-spark' + (k % 3 === 0 ? ' star' : '');
      sp.style.background = k % 2 ? col.color : col.glow;
      layer.appendChild(sp);
      const a = (k / ns) * Math.PI * 2 + i, r = 26 + (k % 4) * 12 + rar * 6 + (big ? 30 : 0);
      anims.push(sp.animate([
        { transform: `translate(${P.x}px, ${P.y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${P.x + Math.cos(a) * r}px, ${P.y + Math.sin(a) * r}px) scale(0.2) rotate(90deg)`, opacity: 0 },
      ], { duration: 520 + (k % 3) * 120, delay: delay + dur * 0.12, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'both' }));
    }
    // the target gulps it
    setTimeout(() => {
      if (to && to.classList) { to.classList.remove('fp-gulp'); void to.offsetWidth; to.classList.add('fp-gulp'); }
    }, delay + dur * 0.98);
  });
  return Promise.all(anims.map((a) => a.finished.catch(() => null))).then(() => { layer.remove(); });
}
