// Preview for src/ui/Unbox.js. http://127.0.0.1:5198/tools/unbox-preview.html?run=three
// window.__run(name, { reduced }) -> Promise; window.__sfxLog
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import { spriteImg, spriteURL } from '../src/ui/sprites.js';
import { playUnbox } from '../src/ui/Unbox.js';

let AC = null;
const logEl = document.getElementById('log');
window.__sfxLog = [];
const ac = () => { if (!AC) { try { AC = new AudioContext(); } catch { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
function tone(f, d, { type = 'square', v = 0.06, f2 = null, at = 0 } = {}) {
  const c = ac(); if (!c) return; const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, { v = 0.08, f = 1200, q = 1, f2 = null, type = 'bandpass' } = {}) {
  const c = ac(); if (!c) return; const t = c.currentTime;
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * d)), c.sampleRate); const ch = b.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
  const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(c.destination); s.start(t);
}
const SYNTH = {
  click: () => tone(1100, 0.04, { v: 0.03 }),
  whoosh: (p) => noise(0.3, { v: 0.05, f: 500 * p, f2: 2400 * p, q: 0.8 }),
  paper: (p) => noise(0.22, { v: 0.09, f: 1800 * p, f2: 700, q: 0.7 }),
  pop_in: (p) => tone(520 * p, 0.09, { type: 'triangle', v: 0.08, f2: 1040 * p }),
  drop: (p, o) => tone(140 * p, 0.12, { type: 'sine', v: 0.2 * (o.volume ?? 1), f2: 60 }),
  egg_crack: (p) => { noise(0.09, { v: 0.2, f: 2600 * p, q: 2 }); tone(700 * p, 0.05, { v: 0.05 }); },
  buy: () => { tone(880, 0.08, { v: 0.05 }); tone(1320, 0.14, { v: 0.05, at: 0.08 }); },
  coins: () => { [988, 1319, 1568].forEach((f, i) => tone(f, 0.08, { v: 0.04, at: i * 0.06 })); },
  levelup: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'triangle', v: 0.06, at: i * 0.07 })); },
};
function sfx(name, o = {}) {
  window.__sfxLog.push(`${(performance.now() / 1000).toFixed(2)} ${name}${o.pitch ? ` p=${(+o.pitch).toFixed(2)}` : ''}`);
  logEl.textContent = window.__sfxLog.slice(-14).join('\n');
  if (!document.getElementById('snd').checked) return;
  const f = SYNTH[name]; if (f) { try { f(o.pitch || 1, o); } catch { /* ignore */ } }
}

const SETS = {
  one: { label: 'Bird feeder', items: [{ name: 'Bird feeder', iconName: 'feeder', qty: 1, sub: 'Goes to Build ▸ Parcels' }] },
  three: { label: 'Order #1042', items: [
    { name: 'Fish food', iconName: 'food', qty: 3, sub: 'Added to your bag' },
    { name: 'Stone lantern', iconName: 'stonelantern', qty: 1, sub: 'Goes to Build ▸ Parcels' },
    { name: 'Lily pads', iconName: 'lilypad', qty: 6, sub: 'Goes to Build ▸ Parcels' },
  ] },
  rare: { label: 'Mystery bundle', items: [
    { name: 'Glass tank', iconName: 'aerator', qty: 1, rarity: 1, sub: 'Goes to Build ▸ Parcels' },
    { name: 'Golden koi egg', kind: 'egg', qty: 1, rarity: 3, sub: 'Ready to hatch' },
    { name: 'Garden gnome', iconName: 'gnome', qty: 2, rarity: 2, sub: 'Goes to Build ▸ Parcels' },
  ] },
  legend: { label: 'Lighthouse kit (deluxe)', items: [{ name: 'Lighthouse', iconName: 'lighthouse', qty: 1, rarity: 4, sub: 'Goes to Build ▸ Parcels', kind: 'item' }] },
  many: { label: 'Big spring haul for the pond', items: ['bench', 'birdbath', 'pinwheel', 'flag', 'canoe', 'campfire', 'fountain', 'stringlights'].map((n, i) => ({
    name: n[0].toUpperCase() + n.slice(1), image: i === 2 ? spriteURL(n, 4) : null, iconName: n, qty: 1 + (i % 3), rarity: i % 5, sub: 'Goes to Build ▸ Parcels',
  })) },
  egg: { label: 'Hatchery starter', items: [
    { name: 'Perch egg', kind: 'egg', qty: 2, rarity: 0, sub: 'Goes to the egg tray' },
    { name: 'Pike egg', kind: 'egg', qty: 1, rarity: 2, sub: 'Goes to the egg tray' },
    { name: 'Mallard', kind: 'bird', iconName: 'birdhouse', qty: 1, sub: 'Moves into the pond' },
    { name: 'Faster deliveries', kind: 'upgrade', qty: 1, sub: 'Upgrade unlocked' },
  ] },
};
const root = document.getElementById('ceremony-root');
window.__run = (name = 'three', o = {}) => {
  const S = SETS[name] || SETS.three;
  const reduced = o.reduced ?? (document.getElementById('red').checked || undefined);
  return playUnbox(root, S.items, { label: S.label, sfx, icon: (n, s) => spriteImg(n, s), reduced, ...o });
};
document.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => window.__run(b.dataset.run)));
const q = new URLSearchParams(location.search);
if (q.get('run')) window.__run(q.get('run'), { reduced: q.get('reduced') === '1' ? true : undefined, autoAdvance: q.get('auto') === '0' ? false : undefined });
window.__ready = true;
