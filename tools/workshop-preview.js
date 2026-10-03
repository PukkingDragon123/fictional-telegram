// Preview harness for src/ui/Workshop.js: fake wood / forage / plans / jobs and
// a tiny fake game (onCraft / onCollect) with real-time countdowns.
// URL flags: ?w=800&h=600 (fixed size box) &jobs=0..3 &wood=40 &open=<recipeId> &nodev=1
//            &art=sheet (show every built-in picture) &fast=1 (crafts take ~12s) &say=text
import audio from '../src/audio/audio.js';
import { spriteImg, hasSprite } from '../src/ui/sprites.js';
import { openWorkshop, workshopArt, WORKSHOP_ART_IDS } from '../src/ui/Workshop.js';

const P = new URLSearchParams(location.search);
const wrap = document.getElementById('wrap');
const logEl = document.getElementById('log');
const log = (s) => { logEl.textContent = (s + '\n' + logEl.textContent).slice(0, 2000); };
if (P.get('nodev')) document.getElementById('dev').style.display = 'none';
function setSize(w, h) {
  if (!w) { document.body.classList.remove('sized'); wrap.style.width = wrap.style.height = ''; return; }
  document.body.classList.add('sized');
  wrap.style.width = `${w}px`; wrap.style.height = `${h}px`;
}
if (P.get('w')) setSize(+P.get('w'), +P.get('h') || 600);

// ---------------------------------------------------------------- time (skippable)
let skew = 0;
const now = () => Date.now() + skew;
window.__skip = (sec) => { skew += sec * 1000; ws?.refresh(data()); };

// ---------------------------------------------------------------- fake game state
const G = {
  wood: +(P.get('wood') ?? 46),
  fast: !!P.get('fast'),
  mats: {
    fiddlehead: { name: 'Fiddlehead', icon: 'fiddlehead', have: 4 },
    ramps: { name: 'Wild Ramps', icon: 'ramps', have: 2 },
    morel: { name: 'Morel', icon: 'morel', have: 1 },
    wildberry: { name: 'Wild Berries', icon: 'wildberry', have: 7 },
    pinecone: { name: 'Pinecone', icon: 'pinecone', have: 12 },
    resin: { name: 'Resin', icon: 'resin', have: 3 },
  },
  ruins: { ruin_chair: 1, ruin_clock: 1, ruin_lamp: 0 },
  recipes: [
    { id: 'wd_stool', kind: 'craft', name: 'Log Stool', icon: 'chair', desc: 'A stump with legs. Bears love a sit.', cost: { wood: 4 }, time: 120 },
    { id: 'wd_table', kind: 'craft', name: 'Plank Table', icon: 'picnic', desc: 'Sturdy. Holds a LOT of fish.', cost: { wood: 10, pinecone: 2 }, time: 480 },
    { id: 'wd_bench', kind: 'craft', name: 'Bear Bench', icon: 'bench', desc: 'Built for big bottoms.', cost: { wood: 14, resin: 1 }, time: 900 },
    { id: 'wd_rocker', kind: 'craft', name: 'Rocking Chair', icon: 'chair', desc: 'Creak... creak... bliss.', cost: { wood: 18, resin: 2, pinecone: 4 }, time: 1500 },
    { id: 'wd_shelf', kind: 'craft', name: 'Pine Shelf', icon: 'book', desc: 'For jars, books and trophies.', cost: { wood: 12, pinecone: 3 }, time: 600 },
    { id: 'wd_barrel', kind: 'craft', name: 'Barrel', icon: 'honey', desc: 'Hoops and staves. Smells of pine.', cost: { wood: 16, resin: 2 }, time: 1200 },
    { id: 'wd_planter', kind: 'craft', name: 'Planter Box', icon: 'flower', desc: 'Grow a little garden anywhere.', cost: { wood: 8, fiddlehead: 2, ramps: 1 }, time: 420 },
    { id: 'wd_birdhouse', kind: 'craft', name: 'Birdhouse Tower', icon: 'birdhouse', desc: 'Two floors for tiny tenants.', cost: { wood: 9, wildberry: 3 }, time: 720, locked: 'Reach 3 hearts with Chip' },
    { id: 'an_chair', kind: 'repair', name: 'Antique Armchair', ruin: 'ruin_chair', ruinName: 'Broken Armchair', icon: 'chair', desc: 'Velvet, gold, a bit of history.', cost: { wood: 12, resin: 2, ruin_chair: 1 }, time: 1800 },
    { id: 'an_clock', kind: 'repair', name: 'Grandfather Clock', ruin: 'ruin_clock', ruinName: 'Old Grandfather Clock', icon: 'clock', desc: 'Tick... tock... it lives again!', cost: { wood: 20, resin: 3, ruin_clock: 1 }, time: 3600 },
    { id: 'an_lamp', kind: 'repair', name: 'Brass Lantern', ruin: 'ruin_lamp', ruinName: 'Rusty Lantern', icon: 'lantern', desc: 'Polished brass, warm glow.', cost: { wood: 6, resin: 4, ruin_lamp: 1 }, time: 1200 },
  ],
  jobs: [],
  nextId: 1,
};
const t0 = Date.now();
const JOBS = [
  { recipeId: 'wd_rocker', start: t0 - 11 * 60e3, end: t0 + 14 * 60e3 + 20e3 },
  { recipeId: 'wd_barrel', start: t0 - 22 * 60e3, end: t0 - 2 * 60e3 },
  { recipeId: 'an_chair', start: t0 - 30 * 60e3 + 25e3, end: t0 + 25e3 },
];
for (const j of JOBS.slice(0, +(P.get('jobs') ?? 3))) G.jobs.push({ id: G.nextId++, ...j });

const recipeName = (id) => G.recipes.find((r) => r.id === id)?.name || id;
function have(k) {
  if (k === 'wood') return G.wood;
  if (k.startsWith('ruin_')) return G.ruins[k] || 0;
  return G.mats[k]?.have || 0;
}
function take(k, n) {
  if (k === 'wood') G.wood -= n;
  else if (k.startsWith('ruin_')) G.ruins[k] -= n;
  else G.mats[k].have -= n;
}
function recipes() {
  return G.recipes.map((r) => (r.kind === 'repair' ? { ...r, locked: have(r.ruin) > 0 ? null : `Find a ${r.ruinName} in the forest ruins` } : { ...r }));
}
function data() {
  const t = now();
  return {
    wood: G.wood,
    materials: Object.fromEntries(Object.entries(G.mats).map(([k, v]) => [k, { ...v }])),
    recipes: recipes(),
    jobs: G.jobs.map((j) => ({ ...j, name: recipeName(j.recipeId), done: t >= j.end })),
  };
}
function craft(id) {
  const r = recipes().find((x) => x.id === id);
  if (!r) return { ok: false, msg: 'Unknown plan' };
  if (r.locked) return { ok: false, msg: r.locked };
  if (G.jobs.length >= 3) return { ok: false, msg: 'All my benches are busy! Collect something first.' };
  for (const [k, n] of Object.entries(r.cost)) if (have(k) < n) return { ok: false, msg: `Need ${n} ${k === 'wood' ? 'wood' : G.mats[k]?.name || k} (have ${have(k)})` };
  for (const [k, n] of Object.entries(r.cost)) take(k, n);
  const t = now();
  G.jobs.push({ id: G.nextId++, recipeId: id, start: t, end: t + (G.fast ? 12 : r.time) * 1000 });
  log(`craft ${id}`);
  return { ok: true, msg: r.kind === 'repair' ? 'Repair started!' : 'On the bench!' };
}
function collect(jid) {
  const j = G.jobs.find((x) => x.id === jid);
  if (!j) return { ok: false, msg: 'Gone?' };
  if (now() < j.end) return { ok: false, msg: 'Still working on it!' };
  G.jobs = G.jobs.filter((x) => x !== j);
  log(`collect ${j.recipeId}`);
  return { ok: true, msg: `${recipeName(j.recipeId)} is ready! Place it from Build > Woodwork.` };
}

// ---------------------------------------------------------------- sound
let soundOn = false;
const SFX_MAP = { knock: 'tock' };
function sfx(name, o) {
  if (!soundOn) return;
  audio.play(SFX_MAP[name] || name, { volume: 0.45, ...(o || {}) });
}

// ---------------------------------------------------------------- open
let ws = null;
function open() {
  document.getElementById('closed').style.display = 'none';
  ws = openWorkshop(wrap, {
    ...data(),
    slots: 3,
    chat: ['Tok-tok! What are we building?', 'Wood comes from fallen logs and chopped trees.', 'Good things take time. Come back later!', 'Found a broken antique? I can fix it!'],
    art: () => null,
    icon: (n, s) => (hasSprite(n) ? spriteImg(n, s) : ''),
    sfx,
    now,
    onCraft: (id) => { const r = craft(id); ws?.refresh(data()); return r; },
    onCollect: (jid) => { const r = collect(jid); ws?.refresh(data()); return r; },
    onTalk: (text) => { if (soundOn) audio.babble('cub', text, { pitch: 1.3, volume: 0.5 }); },
    onClose: () => { ws = null; log('onClose'); document.getElementById('closed').style.display = 'flex'; },
  });
  window.__ws = ws;
  if (P.get('open')) setTimeout(() => ws?.openPlan(P.get('open')), +(P.get('openAt') || 1400));
  if (P.get('say')) setTimeout(() => ws?.say(P.get('say')), 1500);
}
document.getElementById('reopen').onclick = open;
if (P.get('art') === 'sheet') artSheet(); else open();
// the game would refresh once a second; do the same here
setInterval(() => { ws?.refresh(data()); document.getElementById('wv').textContent = G.wood; }, 1000);

// ---------------------------------------------------------------- dev panel
document.querySelector('#dev .t').onclick = () => document.getElementById('dev').classList.toggle('min');
document.getElementById('dev').addEventListener('click', (e) => {
  const a = e.target.dataset?.a;
  if (!a) return;
  if (a === 'w+') G.wood += 20;
  if (a === 'w-') G.wood = Math.max(0, G.wood - 20);
  if (a === 'mats') for (const m of Object.values(G.mats)) m.have += 3;
  if (a === 'skip') window.__skip(60);
  if (a === 'skip10') window.__skip(600);
  if (a === 'fast') { G.fast = !G.fast; e.target.textContent = `fast crafts: ${G.fast ? 'on' : 'off'}`; }
  if (a === 's800') setSize(800, 600);
  if (a === 's1024') setSize(1024, 768);
  if (a === 's1280') setSize(1280, 720);
  if (a === 'sfull') setSize(0, 0);
  if (a === 'sound') { soundOn = !soundOn; audio.unlock?.(); e.target.textContent = `sound: ${soundOn ? 'on' : 'off'}`; }
  if (a === 'unlock') { G.ruins.ruin_lamp = 1; G.recipes.forEach((r) => { if (r.kind === 'craft') r.locked = null; }); }
  if (a === 'close') { ws?.close(); ws = null; document.getElementById('closed').style.display = 'flex'; }
  ws?.refresh(data());
});

// ---------------------------------------------------------------- art sheet (every built-in picture at 4x)
function artSheet() {
  document.body.style.background = '#3a2a1e';
  wrap.style.cssText = 'position:fixed;inset:0;display:flex;flex-wrap:wrap;gap:10px;padding:10px;align-content:flex-start;overflow:auto;';
  const sc = +(P.get('scale') || 4);
  for (const id of WORKSHOP_ART_IDS) {
    const c = workshopArt(id);
    const box = document.createElement('div');
    box.style.cssText = 'background:#c8a070;padding:4px;font:12px monospace;color:#2a1a14;text-align:center';
    const img = document.createElement('canvas');
    img.width = c.width; img.height = c.height;
    img.getContext('2d').drawImage(c, 0, 0);
    img.style.cssText = `width:${c.width * sc}px;height:${c.height * sc}px;image-rendering:pixelated;display:block`;
    box.append(img, id);
    wrap.appendChild(box);
  }
}
