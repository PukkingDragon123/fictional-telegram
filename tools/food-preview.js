// Preview of the food packaging, icons, produce crates and the Food picker.
//   ?only=bags|mascots|icons|produce|picker|harvest   one section
//   ?ids=pellets,flakes   limit bags / mascots
//   ?s=3                  scale
import * as ART from '../src/ui/bagArt.js';
const { bagCanvas, mascotCanvas, produceCanvas, MASCOTS } = ART;
import { FOOD_ITEMS as FOODS } from '../src/data/foods.js';

const q = new URLSearchParams(location.search);
const only = q.get('only');
const S = +(q.get('s') || 0);
const ids = (q.get('ids') || Object.keys(MASCOTS).join(',')).split(',');
const app = document.getElementById('app');
const sec = (name) => !only || only.split(',').includes(name);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

app.append(h('h1', '', 'The Bear Must Eat: food packaging'));
if (only !== 'picker') app.append(h('p', '', '<a style="color:#ffd23f" href="?only=picker">Open the live Food picker + harvest popup demo</a> (buttons: throw, empty, harvest, legendary, every sound)'));

if (sec('mascots')) {
  app.append(h('h2', '', 'Mascots'));
  const row = h('div', 'sheet');
  for (const id of ids) {
    const c = h('div', 'card');
    const r = h('div', 'row');
    r.append(mascotCanvas(id, S || 6), mascotCanvas(id, 2));
    c.append(r, h('div', 'lbl', `${id} / ${MASCOTS[id]}`));
    row.append(c);
  }
  app.append(row);
}

if (sec('bags') && typeof bagCanvas === 'function') {
  app.append(h('h2', '', 'Bags: full / half / low / empty / open'));
  const row = h('div', 'sheet');
  for (const id of ids) {
    const c = h('div', 'card');
    const r = h('div', 'row');
    for (const o of [{ fill: 1 }, { fill: 0.5 }, { fill: 0.15 }, { fill: 0 }, { fill: 1, open: true }]) r.append(bagCanvas(id, { scale: S || 3, ...o }));
    c.append(r, h('div', 'lbl', id));
    row.append(c);
  }
  app.append(row);
}

if (sec('produce')) {
  app.append(h('h2', '', 'Produce crates + special finds'));
  const row = h('div', 'sheet');
  for (const [id, f] of Object.entries(FOODS)) {
    if (f.kind !== 'produce' && f.kind !== 'special') continue;
    const c = h('div', 'card');
    c.append(produceCanvas(id, S || 3), h('div', 'lbl', id));
    row.append(c);
  }
  app.append(row);
}

if (sec('icons')) {
  const { UI_ICONS } = await import('../src/ui/icons/foodIcons.js');
  const { spriteCanvas } = await import('../src/ui/sprites.js');
  app.append(h('h2', '', 'Food icons (2x and 4x)'));
  const row = h('div', 'sheet');
  for (const name of Object.keys(UI_ICONS)) {
    const c = h('div', 'card');
    const r = h('div', 'row');
    r.append(spriteCanvas(name, 2), spriteCanvas(name, 4));
    c.append(r, h('div', 'lbl', name));
    row.append(c);
  }
  app.append(row);
}

// ---- live picker over a fake toolbar (its own full-screen mode: ?only=picker)
if (only === 'picker') {
  await import('../src/ui/style.css');
  await import('../src/ui/fonts.css');
  const { FoodPicker, harvestPopup } = await import('../src/ui/FoodPicker.js');
  const { spriteImg } = await import('../src/ui/sprites.js');
  const audio = (await import('../src/audio/audio.js')).default;
  document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:linear-gradient(#5aa0c8 0 45%, #6aa84a 45%);';
  app.innerHTML = '';
  const ui = h('div', '');
  ui.id = 'ui';
  document.body.append(ui);
  const tools = ['food', 'hand', 'tag', 'nurture', 'tank', 'shop', 'hammer', 'bang', 'flask', 'book', 'newspaper'];
  ui.insertAdjacentHTML('beforeend', `<div class="toolbar f-wood" id="toolbar">${tools.map((t, i) => `<button class="tool f-slot_gold ${i ? '' : 'active'}" ${i ? '' : 'data-tool="feed"'}>${spriteImg(t, 2)}</button>`).join('')}</div>`);
  const inv = { pellets: 31, flakes: 12, worms: 3, krill: 0, maple: 0, caviar: 0, bugbites: 7, carrot: 5, blueberry: 9, golden_carrot: 1, pumpkin: 2 };
  const locked = new Set(q.get('locked') ? q.get('locked').split(',') : ['maple', 'caviar']);
  const order = ['pellets', 'flakes', 'worms', 'krill', 'maple', 'caviar', 'bugbites'];
  const getItems = () => [
    ...order.map((id) => ({ id, count: inv[id] || 0, locked: locked.has(id) })),
    ...Object.keys(inv).filter((id) => !order.includes(id) && inv[id] > 0).map((id) => ({ id, count: inv[id], locked: false })),
  ];
  const log = h('div', '');
  log.style.cssText = 'position:fixed;left:8px;top:40px;font:14px monospace;color:#fff;text-shadow:1px 1px 0 #000;z-index:99';
  document.body.append(log);
  const picker = new FoodPicker({
    root: ui, getItems, selected: q.get('sel') || 'pellets',
    onSelect: (id) => { log.textContent = 'select ' + id; },
    onBuy: (id) => { log.textContent = 'buy ' + id; inv[id] = FOODS[id].scoops || 20; locked.delete(id); picker.refresh(); },
    sfx: (n, o) => audio.play(n, o),
  });
  picker.show();
  const bar = h('div', '');
  bar.style.cssText = 'position:fixed;left:8px;top:8px;display:flex;gap:6px;z-index:99';
  const btn = (label, fn) => { const b = h('button', '', label); b.style.cssText = 'color:#222;font:12px monospace;padding:2px 4px'; b.onclick = () => { audio.unlock(); fn(); }; bar.append(b); };
  btn('throw', () => { const id = picker.sel; if (inv[id] > 0) { inv[id]--; picker.pulse(id); } else audio.play('bag_empty'); });
  btn('empty all', () => { for (const k of Object.keys(inv)) inv[k] = 0; picker.refresh(); });
  btn('hide/show', () => (picker.shown ? picker.hide() : picker.show()));
  const harvest = (legend) => {
    const items = legend
      ? [{ id: 'carrot', count: 5, rarity: 4 }, { id: 'golden_carrot', count: 1, rarity: 4, special: true }]
      : [{ id: 'carrot', count: 4, rarity: 0 }, { id: 'lettuce', count: 3, rarity: 1 }];
    return harvestPopup({ root: ui, items, from: { x: innerWidth * 0.55, y: innerHeight * 0.35 }, to: document.querySelector('#toolbar .tool'), sfx: (n, o) => audio.play(n, o) })
      .then(() => { for (const it of items) inv[it.id] = (inv[it.id] || 0) + it.count; picker.refresh(); });
  };
  btn('harvest', () => harvest(false));
  btn('legendary', () => harvest(true));
  for (const s of ['bag_rustle', 'scoop', 'bag_empty', 'harvest_pop', 'harvest_special', 'bowl_fill', 'crate_drop', 'grinder', 'zap']) btn('♪' + s, () => audio.play(s));
  document.body.append(bar);
  window.__picker = picker;
  window.__inv = inv;
  window.__harvest = harvest;
  // seek every running animation (CSS + WAAPI) to t ms for deterministic screenshots
  window.__seek = (t) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } };
}
