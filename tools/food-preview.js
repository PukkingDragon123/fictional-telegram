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
