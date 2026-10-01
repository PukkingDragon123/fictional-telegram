// Preview for src/ui/paper.js, src/ui/FinanceSheet.js, src/ui/Hud.js
// URL: ?open=<kind> | ?report=good|bad | ?hud=1
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import { audio } from '../src/audio/audio.js';
import { spriteImg } from '../src/ui/sprites.js';
import {
  injectPaperCSS, openPaper, paperTexture, PAPER_KINDS, deco, DECO_NAMES, stamp, sticker, tape, paperclip, handwriting, setPaperSfx,
} from '../src/ui/paper.js';

const FS = import.meta.glob('../src/ui/FinanceSheet.js')['../src/ui/FinanceSheet.js'];
const HUD = import.meta.glob('../src/ui/Hud.js')['../src/ui/Hud.js'];

window.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* */ } }, { once: true, capture: true });
const sfx = (n, o) => { try { audio.play(n, { volume: 0.5, ...(o || {}) }); } catch { /* */ } };
const icon = (n, s) => spriteImg(n, s);
setPaperSfx(sfx);
injectPaperCSS();
const $ = (id) => document.getElementById(id);

// ---- tiles
$('tiles').innerHTML = PAPER_KINDS.map((k) => `<div class="sw"><div class="paper paper--${k}"></div><small>${k}</small></div>`).join('')
  + '<div class="sw"><div class="paper paper--parchment paper--torn"></div><small>parchment + torn</small></div>'
  + '<div class="sw"><div class="paper paper--receipt paper--zig"></div><small>receipt + zig</small></div>';

// ---- sized
const S = [
  ['parchment', 220, 280, { edge: 0.65, deckle: 1, creases: [0.34, 0.67], stains: 1, dogear: 8 }],
  ['notebook', 220, 280, { rules: 8, ruleTop: 16, margin: 18, holes: 6, stains: 1 }],
  ['book', 360, 240, { spine: 1, edge: 0.4 }],
  ['sticky', 160, 160, { sticky: 1 }],
  ['receipt', 140, 260, { torn: 'tb' }],
  ['kraft', 240, 150, { edge: 0.4, creases: [0.5] }],
  ['leather', 180, 240, {}],
  ['postcard', 260, 170, { edge: 0.3, dogear: 6 }],
];
$('sized').innerHTML = S.map(([k, w, h, o]) => `<img src="${paperTexture(k, w, h, o)}" width="${w}" height="${h}" title="${k}">`).join('');

// ---- props
$('props').innerHTML = DECO_NAMES.map((n) => deco(n)).join('')
  + deco('postage', { variant: 'blue' }) + deco('postage', { variant: 'green' }) + deco('seal', { color: 'gold' }) + deco('seal', { color: 'green', letter: 'B' }) + deco('mug', { color: 'red' })
  + ['pink', 'mint', 'yellow', 'blue', 'red'].map((v) => tape(v, 0)).join('');

// ---- helpers
$('helpers').innerHTML = `
  <div class="card paper paper--notebook">${handwriting('Dear bears, dinner at 5!', { delay: 300 })}<br>${handwriting('Fish: 1,240', { delay: 1600, color: '#237a34' })}</div>
  <div class="card paper paper--postcard">${stamp('PAID', '#c0392b', -10)} ${stamp('APPROVED', '#2d8a3c', 6, { delay: 400 })}</div>
  <div class="card paper paper--cork">${sticker(icon('sticker_star', 3))} ${sticker(icon('sticker_heart', 3), 8, { delay: 300 })} ${sticker(icon('fish', 3), -6, { delay: 600 })}
    ${deco('pushpin', { x: 8, y: 4 })}</div>
  <div class="card paper paper--kraft">${paperclip(-12, { pos: { x: 10, y: -16 } })}${tape('mint', -6, { pos: { right: 10, y: -8 } })}<b>Clip &amp; tape</b></div>`;

// ---- modals
const LOREM = {
  letter: `<p>Dear partner,</p><p>The bears from <b>Bear St. Holdings</b> arrive at 5. Keep the pond full and the prices high.</p><p style="text-align:right">${handwriting('— R.', { delay: 900 })}</p>`,
  mail: `<p>${icon('fish', 2)} New species spotted upstream!</p><p>${handwriting('Come quick. Bring nets.', { delay: 2600 })}</p>`,
  note: `${handwriting('Feed fish', { delay: 700 })}<br>${handwriting('Fix dam!!', { delay: 1300 })}<br>${handwriting('Buy monocle wax', { delay: 1900 })}`,
  receipt: `<div style="display:flex;justify-content:space-between">${icon('fish', 1)} <span>x14</span><b>1,240</b></div><div style="display:flex;justify-content:space-between">${icon('honey', 1)} <span>x6</span><b>96</b></div><div style="display:flex;justify-content:space-between;border-top:3px dashed #c4c2bb;margin-top:6px;padding-top:4px"><b>TOTAL</b><b>1,336</b></div>`,
  notebook: `<div>${icon('egg', 1)} Grayling egg — 220</div><div>${icon('food', 1)} Fish food — 84</div><div>${icon('hammer', 1)} Dam repair — 120</div><div>${handwriting('Note: bears love trout', { delay: 800 })}</div>`,
  postcard: `<p>Greetings from <b>Moose Lake</b>!</p><p>${handwriting('Wish you were here. The fish are huge.', { delay: 900 })}</p>`,
  book: `<p>${icon('fish', 2)} <b>Rainbow Trout</b></p><p>A cheerful fish that loves cold water and shiny lures. Bears pay double for them on Fridays.</p><p>${icon('star', 1)}${icon('star', 1)}${icon('star', 1)}</p><p>${icon('fish_gold', 2)} <b>Golden Koi</b></p><p>Rare. Very rare. Reynard keeps one in a vault.</p><p>${icon('egg', 2)} Hatches in 2 days.</p>`,
};
const TITLES = { letter: 'Dear Partner', mail: 'You got mail!', note: 'To do', receipt: 'RECEIPT', notebook: 'Expenses', postcard: 'Moose Lake', book: 'Fishdex' };
function open(kind) {
  return openPaper({
    kind, title: TITLES[kind], html: LOREM[kind],
    actions: kind === 'note' ? [] : [{ label: 'OK', icon: 'check', primary: true }, ...(kind === 'letter' ? [{ label: 'Later', icon: 'clock' }] : [])],
  });
}
window.__open = open;
$('modals').innerHTML = Object.keys(TITLES).map((k) => `<button data-k="${k}">${k}</button>`).join('');
$('modals').onclick = (e) => { const b = e.target.closest('button'); if (b) open(b.dataset.k); };

// ---- reports
const REPORTS = {
  good: {
    day: 4, weekday: 'Thursday',
    lines: [
      { label: 'Fish dinners billed', amount: 1240, icon: 'fish', kind: 'income' },
      { label: 'Tips from happy bears', amount: 318, icon: 'coins', kind: 'income' },
      { label: 'Snack bar (berries, honey...)', amount: 96, icon: 'berry', kind: 'income' },
      { label: 'Fish eggs bought', amount: -220, icon: 'egg', kind: 'expense' },
      { label: 'Construction', amount: -120, icon: 'hammer', kind: 'expense' },
    ],
    net: 1314, served: 14, happy: 13, rampages: 0, fishEaten: 23, fishBorn: 11, avgStars: 4.6, ratingBefore: 3.9, ratingAfter: 4.3, grade: 'A+',
    stickers: [{ id: 'sticker_crown', caption: 'Record profit!' }, { id: 'sticker_paw', caption: 'No rampages!' }, { id: 'sticker_heart', caption: '13 happy bears' }, { id: 'sticker_wow', caption: 'Top marks!' }],
    comment: 'Mwahaha! The bears LOVE me!',
  },
  bad: {
    day: 9, weekday: 'Tuesday',
    lines: [
      { label: 'Fish dinners billed', amount: 210, icon: 'fish', kind: 'income' },
      { label: 'Fish eggs bought', amount: -380, icon: 'egg', kind: 'expense' },
      { label: 'Construction', amount: -220, icon: 'hammer', kind: 'expense' },
      { label: 'Research & development', amount: -150, icon: 'flask', kind: 'expense' },
      { label: 'Digging the pond', amount: -60, icon: 'shovel', kind: 'expense' },
      { label: 'Land clearing', amount: -40, icon: 'trash', kind: 'expense' },
    ],
    net: -640, served: 12, happy: 2, rampages: 6, fishEaten: 9, fishBorn: 1, avgStars: 1.4, ratingBefore: 2.6, ratingAfter: 1.9, grade: 'F',
    stickers: [],
    comment: 'DISASTER! Where were the fish?!',
  },
  quiet: {
    day: 2, weekday: 'Sunday', dayOff: true, lines: [{ label: 'A quiet day at the pond', amount: 0, icon: 'fish', kind: 'note' }],
    net: 0, served: 0, happy: 0, rampages: 0, fishEaten: 0, fishBorn: 2, avgStars: 0, ratingBefore: 3, ratingAfter: 3, grade: 'C',
    stickers: [{ id: 'sticker_coffee', caption: 'Day off!' }], comment: 'Mediocre. I hate mediocre.',
  },
};
window.__reports = REPORTS;
let ceremonyRoot = document.createElement('div');
document.body.appendChild(ceremonyRoot);
async function report(k) {
  if (!FS) { alert('no FinanceSheet'); return; }
  const m = await FS();
  window.__busy = true;
  await m.showFinanceSheet(ceremonyRoot, REPORTS[k], { icon, sfx });
  window.__busy = false;
}
window.__report = report;
$('reports').innerHTML = Object.keys(REPORTS).map((k) => `<button data-k="${k}">${k}</button>`).join('');
$('reports').onclick = (e) => { const b = e.target.closest('button'); if (b) report(b.dataset.k); };

// ---- hud
let hud = null, st = { coins: 120, rating: 3, charm: 0 };
(async () => {
  if (!HUD) return;
  const { Hud } = await HUD();
  hud = new Hud($('hudbox'), { icon, sfx });
  hud.set(st);
  hud.setVisible(true);
  window.__hud = hud;
})();
const hb = [
  ['+25 coins', () => { st.coins += 25; hud.set(st); hud.flash('coins'); }],
  ['+1,000', () => { st.coins += 1000; hud.set(st); hud.flash('coins'); }],
  ['−80', () => { st.coins = Math.max(0, st.coins - 80); hud.set(st); }],
  ['rating +.5', () => { st.rating = Math.min(5, st.rating + 0.5); hud.set(st); hud.flash('rating'); }],
  ['rating −.5', () => { st.rating = Math.max(0, st.rating - 0.5); hud.set(st); hud.flash('rating'); }],
  ['charm +7', () => { st.charm += 7; hud.set(st); hud.flash('charm'); }],
  ['charm 0', () => { st.charm = 0; hud.set(st); }],
  ['hide/show', () => { hud._v = !hud._v; hud.setVisible(hud._v); }],
];
$('hudbtns').innerHTML = hb.map(([l], i) => `<button data-i="${i}">${l}</button>`).join('');
$('hudbtns').onclick = (e) => { const b = e.target.closest('button'); if (b && hud) hb[b.dataset.i][1](); };

const q = new URLSearchParams(location.search);
if (q.get('open')) setTimeout(() => open(q.get('open')), 300);
if (q.get('report')) setTimeout(() => report(q.get('report')), 300);
