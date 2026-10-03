// Preview for the ceremony screens (src/ui/EggHatch.js, FinanceSheet.js).
// Open http://127.0.0.1:5173/tools/ceremony-preview.html
// URL: ?run=egg:4 | eggs | ledger:good | ledger:bad   (auto-start)
// Console / Playwright: window.__run(name) -> Promise, window.__sfxLog
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import { spriteImg } from '../src/ui/sprites.js';
import { SPECIES_BY_ID, RARITIES, MORPHS, TRAITS } from '../src/data/species.js';
import { playEggHatch, placeholderFishCanvas } from '../src/ui/EggHatch.js';
import { showFinanceSheet } from '../src/ui/FinanceSheet.js';

// the real fish art when it exists, else a placeholder drawn from species colours
const FISH_ART = import.meta.glob('../src/art/fishArt.js', { eager: true })['../src/art/fishArt.js'];
const fishCanvas = FISH_ART && typeof FISH_ART.fishCanvas === 'function' ? FISH_ART.fishCanvas : placeholderFishCanvas;

// ------------------------------------------------------------------ tiny synth for sfx
let AC = null;
const logEl = document.getElementById('log');
const sndBox = document.getElementById('snd');
window.__sfxLog = [];
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
window.addEventListener('pointerdown', ac, { once: true, capture: true });
function tone(f, d, { type = 'square', v = 0.06, f2 = null, at = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, { v = 0.08, f = 1200, q = 1, at = 0, type = 'bandpass', f2 = null } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * d)), c.sampleRate);
  const ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(c.destination); s.start(t);
}
const arp = (notes, step, o) => notes.forEach((n, i) => tone(n, o.d || 0.18, { ...o, at: i * step }));
const SYNTH = {
  click: () => tone(1100, 0.04, { v: 0.03 }),
  whoosh: (p) => noise(0.35, { v: 0.05, f: 500 * p, f2: 2400 * p, q: 0.8 }),
  egg_wobble: (p, o) => tone(170 * p, 0.12, { type: 'triangle', v: 0.08 * (o.volume ?? 1), f2: 120 * p }),
  egg_crack: (p) => { noise(0.09, { v: 0.2, f: 2600 * p, q: 2 }); tone(700 * p, 0.05, { v: 0.05 }); },
  egg_burst: () => { noise(0.5, { v: 0.25, f: 900, f2: 200, type: 'lowpass' }); tone(90, 0.4, { type: 'sine', v: 0.2, f2: 40 }); },
  reveal_common: () => arp([523, 659, 784], 0.07, { type: 'triangle', v: 0.06 }),
  reveal_rare: () => arp([523, 659, 784, 1047], 0.07, { type: 'triangle', v: 0.07 }),
  reveal_epic: () => arp([440, 554, 659, 880, 1109], 0.07, { type: 'square', v: 0.04 }),
  reveal_legendary: () => { arp([392, 523, 659, 784, 1047, 1319], 0.08, { type: 'square', v: 0.045, d: 0.3 }); tone(196, 1.2, { type: 'triangle', v: 0.08, at: 0.4 }); },
  star_pop: (p) => tone(880 * p, 0.09, { type: 'triangle', v: 0.07, f2: 1320 * p }),
  chip: (p) => tone(1400 * p, 0.035, { v: 0.03 }),
  pen: (p) => noise(0.05, { v: 0.05, f: 4200 * p, q: 3 }),
  paper: () => noise(0.25, { v: 0.08, f: 1800, f2: 700, q: 0.7 }),
  stamp: () => { tone(110, 0.18, { type: 'sine', v: 0.25, f2: 50 }); noise(0.12, { v: 0.2, f: 600, type: 'lowpass' }); },
  sticker: (p) => { noise(0.08, { v: 0.1, f: 3000 * p, f2: 900, q: 1 }); tone(600 * p, 0.05, { type: 'sine', v: 0.05, f2: 300 }); },
  grade_good: () => arp([523, 659, 784, 1047], 0.09, { type: 'triangle', v: 0.07, d: 0.25 }),
  grade_bad: () => arp([392, 370, 349, 262], 0.16, { type: 'sawtooth', v: 0.03, d: 0.3 }),
  sunrise: () => { [262, 330, 392, 523].forEach((f, i) => tone(f, 2.2, { type: 'sine', v: 0.04, at: i * 0.15 })); },
  coin: (p) => { tone(988 * p, 0.06, { v: 0.04 }); tone(1319 * p, 0.12, { v: 0.04, at: 0.06 }); },
};
function sfx(name, o = {}) {
  const line = `${(performance.now() / 1000).toFixed(2)} ${name}${o.pitch ? ` p=${(+o.pitch).toFixed(2)}` : ''}`;
  window.__sfxLog.push(line);
  logEl.textContent = window.__sfxLog.slice(-18).join('\n');
  if (!sndBox.checked) return;
  const f = SYNTH[name];
  if (f) { try { f(o.pitch || 1, o); } catch { /* ignore */ } }
}

// ------------------------------------------------------------------ sample data
const trait = (id) => ({ id, ...TRAITS[id] });
const morph = (id) => ({ id, name: MORPHS[id].name });
const sp = (id) => ({ speciesId: id, speciesName: SPECIES_BY_ID[id].name, latin: SPECIES_BY_ID[id].latin });
const EGGS = [
  { rarity: 0, ...sp('bluegill'), morph: morph('normal'), sex: 'M', size: { label: 'S', mult: 0.85 }, traits: [], stars: 1, isNewSpecies: false, isNewMorph: false, value: 12 },
  { rarity: 1, ...sp('perch'), morph: morph('normal'), sex: 'F', size: { label: 'M', mult: 1 }, traits: [trait('fertile')], stars: 2, isNewSpecies: false, isNewMorph: false, value: 34 },
  { rarity: 2, ...sp('rainbow'), morph: morph('albino'), sex: 'M', size: { label: 'L', mult: 1.2 }, traits: [trait('speedy'), trait('glutton')], stars: 3, isNewSpecies: false, isNewMorph: true, value: 186 },
  { rarity: 3, ...sp('grayling'), morph: morph('ghost'), sex: 'F', size: { label: 'L', mult: 1.25 }, traits: [trait('sparkly'), trait('shy')], stars: 4, isNewSpecies: true, isNewMorph: false, value: 640 },
  { rarity: 4, ...sp('mapleKoi'), morph: morph('golden'), sex: 'F', size: { label: 'XL', mult: 1.5 }, traits: [trait('lucky'), trait('chonky'), trait('hardy')], stars: 5, isNewSpecies: true, isNewMorph: true, value: 5200 },
];

const REPORTS = {
  good: {
    day: 4, weekday: 'Thursday',
    lines: [
      { label: 'Fish dinners (14 bears)', amount: 1240, icon: 'fish', kind: 'income' },
      { label: 'Tips from happy suits', amount: 318, icon: 'briefcase', kind: 'income' },
      { label: 'Honey & syrup sides', amount: 96, icon: 'honey', kind: 'income' },
      { label: 'Fish food', amount: -84, icon: 'food', kind: 'expense' },
      { label: 'Beaver wages', amount: -120, icon: 'beaver', kind: 'expense' },
      { label: 'Grayling egg', amount: -220, icon: 'egg', kind: 'expense' },
      { label: 'Monocle polish (essential)', amount: 0, icon: 'eye', kind: 'note' },
    ],
    net: 1230, served: 14, happy: 13, rampages: 0, fishEaten: 23, fishBorn: 11, avgStars: 4.6, ratingBefore: 3.9, ratingAfter: 4.3, grade: 'A+',
    stickers: [{ id: 'sticker_star', caption: 'Record profit!' }, { id: 'sticker_paw', caption: 'No rampages!' }, { id: 'sticker_fish', caption: 'New species!' }],
    comment: 'Heh heh. The suits practically threw their wallets at me.',
  },
  bad: {
    day: 9, weekday: 'Tuesday',
    lines: [
      { label: 'Fish dinners (12 bears)', amount: 210, icon: 'fish', kind: 'income' },
      { label: 'Refunds to angry bears', amount: -150, icon: 'bear_angry', kind: 'expense' },
      { label: 'Rampage damage', amount: -380, icon: 'hammer', kind: 'expense' },
      { label: 'Dam repairs', amount: -220, icon: 'dam', kind: 'expense' },
      { label: 'Fish food', amount: -60, icon: 'food', kind: 'expense' },
      { label: 'Patio chair (eaten?!)', amount: 0, icon: 'warning', kind: 'note' },
    ],
    net: -600, served: 12, happy: 2, rampages: 6, fishEaten: 9, fishBorn: 1, avgStars: 1.4, ratingBefore: 2.6, ratingAfter: 1.9, grade: 'F',
    stickers: [{ id: 'sticker_coffee', caption: 'Need coffee...' }, { id: 'sticker_bear', caption: '6 rampages!' }],
    comment: 'Those brutes ate my profits AND my patio chairs. Tomorrow: more fish, fewer excuses.',
  },
  mid: {
    day: 6, weekday: 'Saturday',
    lines: [
      { label: 'Fish dinners (9 bears)', amount: 640, icon: 'fish', kind: 'income' },
      { label: 'Blueberry sides', amount: 42, icon: 'berry', kind: 'income' },
      { label: 'Fish food', amount: -70, icon: 'food', kind: 'expense' },
      { label: 'Fence repairs', amount: -95, icon: 'fence', kind: 'expense' },
    ],
    net: 517, served: 9, happy: 6, rampages: 1, fishEaten: 14, fishBorn: 5, avgStars: 3.6, ratingBefore: 3.5, ratingAfter: 3.6, grade: 'B',
    stickers: [{ id: 'sticker_thumb', caption: 'Not bad!' }],
    comment: 'One brute flipped a picnic table. Still, a profit is a profit.',
  },
};

// ------------------------------------------------------------------ runner
const root = document.getElementById('ui');
const status = document.getElementById('status');
const opts = () => ({
  fishCanvas,
  icon: (name, scale) => spriteImg(name, scale),
  sfx,
  rarities: RARITIES,
  autoAdvance: document.getElementById('auto').checked ? 1 : false,
});
let busy = false;
async function run(name) {
  if (busy) return 'busy';
  busy = true;
  window.__busy = true;
  const t0 = performance.now();
  status.textContent = `running ${name}…`;
  const [kind, arg] = String(name).split(':');
  try {
    if (kind === 'egg') await playEggHatch(root, [EGGS[+arg || 0]], opts());
    else if (kind === 'eggs') await playEggHatch(root, EGGS, opts());
    else if (kind === 'ledger') await showFinanceSheet(root, REPORTS[arg] || REPORTS.good, opts());
  } catch (e) {
    console.error(e);
  }
  busy = false;
  window.__busy = false;
  const dt = ((performance.now() - t0) / 1000).toFixed(1);
  status.textContent = `${name} resolved after ${dt}s · leftover overlays: ${root.childElementCount}`;
  return `resolved ${dt}s`;
}
window.__run = (name) => run(name);
window.__data = { EGGS, REPORTS };
document.getElementById('panel').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-run]');
  if (b) run(b.dataset.run);
});
const q = new URLSearchParams(location.search);
if (q.get('run')) setTimeout(() => run(q.get('run')), 300);
status.textContent = FISH_ART ? 'fish art: src/art/fishArt.js' : 'fish art: placeholder (src/art/fishArt.js not found)';
