// Preview for src/ui/Matchmaker.js + src/ui/QuestLog.js with fake data.
// URL: ?mm=empty|pair|no|hybrid|perfect|hungry (opens the matchmaker in that state, default pair)
//      ?mm=0 (no matchmaker)  ?arrange=1 (books the date right away)  ?noctl=1  ?nohud=1
//      ?ql=0 hides the quest log
import { audio } from '../src/audio/audio.js';
import { spriteImg, hasSprite } from '../src/ui/sprites.js';
import { injectPaperCSS } from '../src/ui/paper.js';
import { fishCanvasFor } from '../src/game/fishSprites.js';
import { SPECIES_BY_ID, MORPHS, MUTATIONS, TRAITS } from '../src/data/species.js';
import { openMatchmaker } from '../src/ui/Matchmaker.js';
import { createQuestLog } from '../src/ui/QuestLog.js';

const MODS = import.meta.glob(['../src/ui/Hud.js']);
const Q = new URLSearchParams(location.search);
injectPaperCSS();
const ui = document.getElementById('ui');
const ctl = document.getElementById('ctl');
if (Q.has('noctl')) ctl.classList.add('hide');
window.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* */ } }, { once: true, capture: true });
window.sfxLog = [];
const sfx = (n, o) => { window.sfxLog.push(n); try { audio.play(n, { volume: 0.4, ...(o || {}) }); } catch { /* */ } };
const icon = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');

// ---------------------------------------------------------------- fake fish
const T = (id) => ({ id, name: TRAITS[id].name, icon: TRAITS[id].icon, good: TRAITS[id].good });
const M = (id) => ({ id, name: MORPHS[id].name });
const U = (id) => (id ? { id, name: MUTATIONS[id].name, color: MUTATIONS[id].color } : null);
const SZ = (m) => ({ mult: m, label: m < 0.8 ? 'Small' : m < 1.15 ? 'Medium' : m < 1.5 ? 'Large' : 'Huge' });
let nid = 1;
const F = (name, sp, sex, stars, rarity, morph, mut, size, traits, fed, extra = {}) => ({
  id: `f${nid++}`, name, speciesId: sp, speciesName: SPECIES_BY_ID[sp]?.name || sp, sex, stars, rarity,
  morph: M(morph), mut: U(mut), size: SZ(size), traits: traits.map(T), fed, adult: true, ready: true, why: null,
  art: () => fishCanvasFor(sp, { morph, scale: 1 }), ...extra,
});
const FISH = [
  F('Bubbles', 'goldfish', 'F', 4, 2, 'calico', 'candy', 1.1, ['fertile', 'sparkly'], 0.9),
  F('Marigold', 'goldfish', 'F', 3, 1, 'golden', null, 0.9, ['lucky'], 0.7),
  F('Penny', 'bluegill', 'F', 2, 0, 'normal', null, 1.0, ['shy'], 0.5),
  F('Dot', 'goldfish', 'F', 5, 4, 'rainbow', 'galaxy', 1.3, ['fertile', 'chonky', 'lucky'], 1.0),
  F('Sushi', 'brook', 'F', 3, 2, 'albino', null, 1.2, ['speedy'], 0.2, { ready: false, why: 'Too hungry' }),
  F('Tiny Tina', 'pumpkinseed', 'F', 1, 0, 'normal', 'tiny', 0.6, [], 0.6, { adult: false, ready: false, why: 'Still a fry' }),
  F('Sir Finnegan', 'goldfish', 'M', 4, 3, 'ghost', 'shiny', 1.2, ['hardy', 'glutton'], 0.8),
  F('Captain Gill', 'goldfish', 'M', 3, 1, 'normal', 'hot', 1.0, ['speedy'], 0.95),
  F('Big Earl', 'laketrout', 'M', 3, 2, 'melanistic', 'titan', 1.8, ['chonky'], 0.6),
  F('Rusty', 'perch', 'M', 2, 0, 'normal', null, 0.9, [], 0.4),
  F('Doug', 'goldfish', 'M', 5, 4, 'golden', 'doge', 1.1, ['lucky', 'sparkly', 'fertile'], 0.15, { ready: false, why: 'Too hungry: feed him first' }),
];
const by = Object.fromEntries(FISH.map((f) => [f.id, f]));
const id = (name) => FISH.find((f) => f.name === name).id;

// a plausible fake genetics model (the real one lives in the game)
function predict(a, b) {
  const m = by[a], d = by[b];
  if (!m || !d) return { ok: false, why: 'Pick two fish' };
  const hyb = (m.speciesId === 'brook' && d.speciesId === 'laketrout') || (m.speciesId === 'laketrout' && d.speciesId === 'brook');
  if (m.speciesId !== d.speciesId && !hyb) return { ok: false, why: 'Different species' };
  if (!m.ready) return { ok: false, why: `${m.name}: ${m.why}` };
  if (!d.ready) return { ok: false, why: `${d.name}: ${d.why}` };
  const avg = (m.stars + d.stars) / 2;
  const w = [1, 2, 3, 4, 5].map((s) => Math.exp(-((s - avg - 0.3) ** 2) / 1.1));
  const sum = w.reduce((x, y) => x + y, 0);
  const stars = w.map((x) => x / sum);
  const morphs = [];
  const mp = {};
  for (const p of [m, d]) mp[p.morph.id] = (mp[p.morph.id] || 0) + 0.38;
  mp.normal = (mp.normal || 0) + 0.2;
  let ms = Object.values(mp).reduce((x, y) => x + y, 0);
  for (const [k, v] of Object.entries(mp)) morphs.push({ id: k, name: MORPHS[k].name, p: v / ms * 0.97 });
  morphs.push({ id: 'albino', name: 'Albino', p: 0.03 });
  const muts = [];
  for (const p of [m, d]) if (p.mut) muts.push({ id: p.mut.id, name: p.mut.name, color: p.mut.color, p: 0.22 });
  muts.push({ id: 'frozen', name: 'Frozen', color: MUTATIONS.frozen.color, p: 0.035 });
  const tr = {};
  for (const p of [m, d]) for (const t of p.traits) tr[t.id] = Math.min(0.9, (tr[t.id] || 0) + 0.45);
  const traits = Object.entries(tr).map(([k, p]) => ({ ...T(k), p }));
  const lo = Math.min(m.size.mult, d.size.mult) * 0.85, hi = Math.max(m.size.mult, d.size.mult) * 1.1;
  const perfect = Q.get('mm') === 'perfect' ? 1 : stars[4] * 0.5 + (muts.length > 1 ? 0.1 : 0);
  return {
    ok: true, stars, morphs, muts, traits, perfect,
    size: { min: lo, max: hi, avg: (lo + hi) / 2, label: SZ((lo + hi) / 2).label },
    hybrid: hyb ? { speciesName: 'Splake' } : undefined,
  };
}

// ---------------------------------------------------------------- HUD + quest log
if (!Q.has('nohud')) {
  MODS['../src/ui/Hud.js']?.().then((m) => {
    if (!m?.Hud) return;
    const hud = new m.Hud(ui, { icon, sfx });
    hud.set({ coins: 1240, rating: 3.5, charm: 0 });
    hud.setVisible?.(true);
  }).catch(() => {});
}
let ql = null;
const QUESTS = [
  { id: 'q1', title: 'Find true love', icon: 'heart', steps: [{ text: 'Open the matchmaker', done: true }, { text: 'Pin a mum and a dad', done: false }, { text: 'Book a date', done: false }], reward: '+50 coins' },
  { id: 'q2', title: 'Feed the pond', icon: 'food', steps: [{ text: 'Drop 5 pellets', done: false }], reward: 'Fish flakes', progress: [2, 5] },
];
if (Q.get('ql') !== '0') {
  ql = createQuestLog(ui, { icon, sfx, onClick: (qid) => console.log('quest', qid) });
  ql.set(QUESTS);
  window.__ql = ql;
}

// ---------------------------------------------------------------- matchmaker
let mm = null;
function open(state = 'pair') {
  mm?.close();
  const pre = { pair: ['Bubbles', 'Sir Finnegan'], hybrid: ['Sushi', 'Big Earl'], no: ['Bubbles', 'Big Earl'], hungry: ['Bubbles', 'Doug'], perfect: ['Dot', 'Sir Finnegan'], empty: [] }[state] || [];
  mm = openMatchmaker(ui, {
    fish: FISH,
    preselect: pre[0] ? id(pre[0]) : undefined,
    predict,
    onArrange: (a, b) => (Math.random() < 0.9 || Q.has('arrange') ? { ok: true, msg: `${by[a].name} & ${by[b].name} meet at the lily pad tonight!` } : { ok: false, msg: 'Already on a date' }),
    icon, sfx,
    onClose: () => { mm = null; },
  });
  window.__mm = mm;
  // second fish: click its card like a player would
  if (pre[1]) {
    const f = FISH.find((x) => x.name === pre[1]);
    if (state === 'hybrid') { by[id('Sushi')].ready = true; by[id('Sushi')].why = null; mm.refresh(FISH); }
    setTimeout(() => { mm.el.querySelector(`.mm-ptab[data-sex="${f.sex}"]`)?.click(); setTimeout(() => mm.el.querySelector(`.mm-card[data-id="${f.id}"]`)?.click(), 60); }, 50);
  }
  if (Q.has('arrange')) setTimeout(() => mm.el.querySelector('.mm-go')?.click(), 900);
}
const st = Q.get('mm');
if (st !== '0') open(st || 'pair');

// ---------------------------------------------------------------- controls
const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ctl.appendChild(b); };
for (const s of ['empty', 'pair', 'hybrid', 'no', 'hungry', 'perfect']) btn(`mm: ${s}`, () => open(s));
btn('quest: tick', () => { QUESTS[0].steps[1].done = true; QUESTS[1].progress = [4, 5]; ql?.set(JSON.parse(JSON.stringify(QUESTS))); });
btn('quest: new', () => { QUESTS.push({ id: `q${QUESTS.length + 1}`, title: 'Build a lodge', icon: 'hammer', steps: [{ text: 'Pay the beavers', done: false }, { text: 'Pick a spot', done: false }], reward: 'Beaver hugs' }); ql?.set(JSON.parse(JSON.stringify(QUESTS.slice(-3)))); });
btn('quest: complete', () => { const q = QUESTS.shift(); if (q) ql?.complete(q.id); });
btn('quest: fold', () => ql?.collapse());
btn('quest: hide/show', () => { window.__qv = !window.__qv; ql?.setVisible(!window.__qv); });
