// Preview harness for src/ui/LabTree.js with a mock game (free + timed research).
// URL flags:
//   ?data=fake|real   fake: ~100 generated nodes in 12 branches (default); real: src/data/research.js
//   &done=none|some|lots|all|id,id   researched preset (default some)
//   &jobs=N           start N running jobs (default 1)   &slots=N  benches (default 1, jobs raise it)
//   &zones=none|some|all  open neighbour zones (default some)
//   &speed=N          game speed (default 1)   &legacy=1  no jobs()/slots(): instant research
//   &sel=id  &filter=<branch index>|@ready  &nodev=1  &custom=1 (custom preview hook)
//   v18: &coins=N (default 400)  &sealed=some|none|all (encrypted sections, default some)  &norush=1  &sec=<branch id> (select a sealed section)
import { spriteImg, hasSprite } from '../src/ui/sprites.js';
import { LabTree } from '../src/ui/LabTree.js';
import { BRANCHES as REAL_BRANCHES, RESEARCH as REAL_RESEARCH, SECTION_KEYS, researchRushPrice } from '../src/data/research.js';
import { STRUCTURES } from '../src/data/structures.js';

const P = new URLSearchParams(location.search);

// ---------------------------------------------------------------- fake data
const ZONES = { tower: 'Professor Hoot', river: 'Dale', willow: 'Grandpa Shellby', patch: 'Beatrice', treehouse: 'Woody', marsh: 'Madame Croak' };
function fakeData() {
  const B = [
    { id: 'starter', name: 'Basics', icon: 'flask', color: '#7dffa8' },
    { id: 'panfish', name: 'Sunfish & Bass', icon: 'fish', color: '#4fb0d8' },
    { id: 'trout', name: 'Trout & Char', icon: 'fish', color: '#58c0a0' },
    { id: 'salmon', name: 'Salmon Run', icon: 'fish', color: '#e0604a' },
    { id: 'breed', name: 'Breeding Lab', icon: 'heart', color: '#f070a0' },
    { id: 'pond', name: 'Pond Life', icon: 'lilypad', color: '#6ac050' },
    { id: 'garden', name: 'Veggie Patch', icon: 'carrot', color: '#f0a040' },
    { id: 'snack', name: 'Snack Bar', icon: 'berry', color: '#e8a030' },
    { id: 'beaver', name: 'Beaver Works', icon: 'beaver', color: '#c88a48' },
    { id: 'wood', name: 'Woodworking', icon: 'hammer', color: '#b07a50' },
    { id: 'gizmo', name: 'Contraptions', icon: 'gear', color: '#a0a8b8' },
    { id: 'decor', name: 'Curb Appeal', icon: 'flower', color: '#f08ac0' },
  ];
  const R = [];
  const add = (branch, col, row, id, name, extra = {}) => R.push({ id, branch, col, row, name, icon: extra.icon || 'flask', req: extra.req || [], time: extra.time ?? 30, desc: extra.desc || `Unlock ${name}. Reynard promises this one is totally safe.`, tier: extra.tier, ...extra });
  const T = (tier) => [10, 30, 90, 240][tier];
  // basics
  add('starter', 0, 0, 'r_basics', 'Lab Notebook', { icon: 'book', time: 8, tier: 0, feature: 'notebook', desc: 'Reynard dusts off his notebook. Every great empire starts with a doodle.' });
  add('starter', 1, 0, 'r_beavers', 'Beaver Lodge', { icon: 'lodge', req: ['r_basics'], time: 12, tier: 0, build: 'lodge', desc: 'Hire beavers! They need a lodge in the water next to the shore.' });
  add('starter', 2, 0, 'r_snackbar', 'Beaver Snack Bar', { icon: 'beaverbar', req: ['r_beavers'], time: 15, tier: 0, build: 'beaverbar' });
  add('starter', 3, 0, 'r_woodgarage', 'Wood Garage', { icon: 'hammer', req: ['r_snackbar'], time: 25, tier: 1, build: 'woodgarage' });
  add('starter', 4, 0, 'r_bench2', 'Second Lab Bench', { icon: 'flask', req: ['r_woodgarage'], time: 240, tier: 3, mods: { labSlots: 1 }, desc: 'Run two experiments at once. Twice the science, twice the explosions.' });
  // fish branches
  const fish = {
    panfish: ['pumpkinseed', 'goldfish', 'perch', 'smallmouth', 'bass', 'crappie', 'rockbass', 'walleye', 'pike'],
    trout: ['brook', 'rainbow', 'laketrout', 'grayling', 'char', 'goldentrout', 'browntrout'],
    salmon: ['whitefish', 'sockeye', 'chinook', 'coho', 'pinksalmon', 'kokanee', 'sturgeon', 'paddlefish'],
  };
  const SP = { pumpkinseed: 'Pumpkinseed', goldfish: 'Pond Goldfish', perch: 'Yellow Perch', smallmouth: 'Smallmouth Bass', bass: 'Largemouth Bass', crappie: 'Black Crappie', rockbass: 'Rock Bass', walleye: 'Walleye', pike: 'Northern Pike', brook: 'Brook Trout', rainbow: 'Rainbow Trout', laketrout: 'Lake Trout', grayling: 'Arctic Grayling', char: 'Arctic Char', goldentrout: 'Golden Trout', browntrout: 'Brown Trout', whitefish: 'Lake Whitefish', sockeye: 'Sockeye Salmon', chinook: 'Chinook Salmon', coho: 'Coho Salmon', pinksalmon: 'Pink Salmon', kokanee: 'Kokanee', sturgeon: 'Lake Sturgeon', paddlefish: 'Paddlefish' };
  for (const [br, list] of Object.entries(fish)) {
    list.forEach((sp, i) => {
      const row = br === 'panfish' && i >= 5 ? 1 : br === 'salmon' && i >= 6 ? 1 : 0;
      const col = row ? i - (br === 'panfish' ? 3 : 4) : i + (br === 'trout' ? 1 : br === 'salmon' ? 2 : 0);
      const prev = i ? `r_${list[i - 1]}` : br === 'panfish' ? 'r_basics' : br === 'trout' ? 'r_perch' : 'r_brook';
      const req = row && i === (br === 'panfish' ? 5 : 6) ? [`r_${list[i - 3]}`] : [prev];
      const zone = br === 'trout' && i >= 3 ? 'tower' : br === 'salmon' && i >= 3 ? 'river' : br === 'salmon' && i >= 6 ? 'willow' : undefined;
      const tier = Math.min(3, Math.floor(i / 2.5) + (br === 'panfish' ? 0 : 1));
      add(br, col, row, `r_${sp}`, `${SP[sp]} Eggs`, { icon: 'fish', species: sp, req, zone, time: T(tier) + i * 7, tier, desc: `Stock ${SP[sp]} eggs in the shop.` });
    });
  }
  // breeding
  const breed = [['r_love1', 'Romance 101', 'heart', { breedMult: 0.3 }], ['r_clutch', 'Big Clutches', 'egg', { clutchBonus: 1 }], ['r_eggslot', 'Incubator Slot', 'egg', { eggSlots: 1 }], ['r_genetics', 'Genetics', 'dna', { traitMult: 1 }], ['r_hybrid', 'Hybrid Vigour', 'dna', { hybridMult: 1 }], ['r_morph', 'Rare Morphs', 'sparkle', { morphMult: 1 }], ['r_golden', 'Golden Touch', 'fish_gold', { goldenMult: 2 }], ['r_love2', 'Speed Dating', 'heart', { breedMult: 0.4 }]];
  breed.forEach(([id, name, icon, mods], i) => add('breed', i + 1, i >= 5 ? 1 : 0, id, name, { icon, mods, req: [i ? breed[i >= 5 ? 3 : i - 1][0] : 'r_goldfish'], time: T(Math.min(3, 1 + (i >> 1))), tier: Math.min(3, 1 + (i >> 1)) }));
  // pond life
  const pond = [['r_duckweed', 'duckweed'], ['r_reeds', 'reeds'], ['r_lilypad', 'lilypad'], ['r_cattail', 'cattail'], ['r_willow', 'willow'], ['r_bughotel', 'bughotel'], ['r_aerator', 'aerator'], ['r_fountain', 'fountain'], ['r_bogpool', 'bogpool']];
  pond.forEach(([id, b], i) => add('pond', i, i >= 6 ? 1 : 0, id, STRUCTURES[b]?.name || b, { icon: STRUCTURES[b]?.icon, build: b, req: [i ? pond[i >= 6 ? 4 : i - 1][0] : 'r_basics'], zone: b === 'willow' ? 'willow' : b === 'bughotel' ? 'tower' : undefined, time: T(Math.min(3, i >> 1)), tier: Math.min(3, i >> 1) }));
  // veggie patch
  const veg = ['carrot', 'lettuce', 'radish', 'peas', 'potato', 'corn', 'sunflower', 'pumpkin', 'tomato', 'cabbage'];
  veg.forEach((b, i) => add('garden', i < 6 ? i : i - 4, i < 6 ? 0 : 1, `r_${b}`, STRUCTURES[b]?.name || b, { icon: b, build: b, req: [i ? (i === 6 ? 'r_radish' : `r_${veg[i - 1]}`) : 'r_basics'], zone: i ? 'patch' : undefined, time: i ? T(Math.min(3, 1 + (i >> 2))) : 10, tier: i ? Math.min(3, 1 + (i >> 2)) : 0 }));
  // snack bar
  const snack = [['r_berries', 'berries'], ['r_beehive', 'beehive'], ['r_mushrooms', 'mushrooms'], ['r_bbq', 'bbq'], ['r_jukebox', 'jukebox'], ['r_neon', 'neonsign'], ['r_cooler', 'beercooler']];
  snack.forEach(([id, b], i) => add('snack', i + 1, 0, id, STRUCTURES[b]?.name || b, { icon: STRUCTURES[b]?.icon, build: b, req: [i ? snack[i - 1][0] : 'r_snackbar'], time: T(Math.min(3, 1 + (i >> 1))), tier: Math.min(3, 1 + (i >> 1)) }));
  // beaver works
  const bev = [['r_dams', ['dam']], ['r_fences', ['fence', 'gate']], ['r_platforms', ['platform']], ['r_beaverbed', ['beaverbed']], ['r_toolbox', ['toolbox', 'gearstation']], ['r_feedsilo', ['feedsilo']]];
  bev.forEach(([id, b], i) => add('beaver', i + 2, 0, id, STRUCTURES[b[0]]?.name || b[0], { icon: STRUCTURES[b[0]]?.icon, build: b, req: [i ? bev[i - 1][0] : 'r_beavers'], zone: i >= 3 ? 'river' : undefined, time: T(Math.min(3, 1 + (i >> 1))), tier: Math.min(3, 1 + (i >> 1)) }));
  // woodworking (needs the treehouse neighbour)
  const wood = ['wd_stool', 'wd_table', 'wd_bench', 'wd_rocker', 'wd_shelf', 'wd_barrel', 'wd_crate', 'wd_planter'];
  wood.forEach((b, i) => add('wood', i < 5 ? i + 4 : i, i < 5 ? 0 : 1, `r_${b}`, `${STRUCTURES[b]?.name || b} Plans`, { icon: STRUCTURES[b]?.icon, build: b, req: [i ? (i === 5 ? 'r_wd_bench' : `r_${wood[i - 1]}`) : 'r_woodgarage'], zone: 'treehouse', time: T(Math.min(3, 1 + (i >> 1))), tier: Math.min(3, 1 + (i >> 1)) }));
  // contraptions
  const giz = [['r_feeder', 'feeder'], ['r_sprinkler', 'sprinkler'], ['r_buglamp', 'buglamp'], ['r_hatchery', 'hatchery'], ['r_lighthouse', 'lighthouse'], ['r_franchise', 'franchise']];
  giz.forEach(([id, b], i) => add('gizmo', i + 2, 0, id, STRUCTURES[b]?.name || b, { icon: STRUCTURES[b]?.icon, build: b, req: [i ? giz[i - 1][0] : 'r_dams'], time: T(Math.min(3, 1 + (i >> 1))) + 30, tier: Math.min(3, 1 + (i >> 1)) }));
  // decor
  const dec = [['r_flowers', 'flowers'], ['r_lantern', 'lantern'], ['r_chair', 'chair'], ['r_gnome', 'gnome'], ['r_arch', 'arch'], ['r_stringlights', 'stringlights'], ['r_birdbath', 'birdbath'], ['r_moose', 'moose'], ['r_floatlantern', 'floatlantern'], ['r_canoe', 'canoe']];
  dec.forEach(([id, b], i) => add('decor', i < 6 ? i : i - 3, i < 6 ? 0 : 1, id, STRUCTURES[b]?.name || b, { icon: STRUCTURES[b]?.icon, build: b, req: [i ? (i === 6 ? 'r_gnome' : dec[i - 1][0]) : 'r_basics'], zone: b === 'birdbath' ? 'tower' : b === 'canoe' ? 'marsh' : undefined, time: T(Math.min(3, i >> 1)) + 5, tier: Math.min(3, i >> 1) }));
  return { B, R };
}

const real = P.get('data') === 'real';
const { B: BRANCHES, R: RESEARCH } = real ? { B: REAL_BRANCHES, R: REAL_RESEARCH } : fakeData();
const BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

// ---------------------------------------------------------------- mock game
const state = { done: new Set(), jobs: [], slots: +(P.get('slots') || 1), speed: +(P.get('speed') || 1), paused: false, zones: new Set(), coins: +(P.get('coins') ?? 400), sections: new Set() };
// v18 sections: the real game's keys, or a made-up set for the fake tree
const FAKE_KEYS = { starter: { start: true }, panfish: { start: true }, garden: { node: 'r_carrot', coins: 40 }, breed: { node: 'r_goldfish', coins: 60 }, trout: { node: 'r_perch', coins: 120 }, salmon: { node: 'r_brook', zone: 'river', coins: 150 }, pond: { coins: 80 } };
const KEYS = real ? SECTION_KEYS : FAKE_KEYS;
const keyOf = (b) => KEYS[b] || { coins: 100 };
function resetSections() {
  state.sections.clear();
  const mode = P.get('sealed') || 'some';
  for (const B of BRANCHES) if (mode === 'none' || (mode === 'some' && keyOf(B.id).start)) state.sections.add(B.id);
  for (const id of state.done) if (BY_ID[id]) state.sections.add(BY_ID[id].branch);
}
const someDone = ['r_basics', 'r_beavers', 'r_snackbar', 'r_pumpkinseed', 'r_goldfish', 'r_perch', 'r_duckweed', 'r_reeds', 'r_carrot', 'r_flowers', 'r_lantern', 'r_berries', 'r_dams', 'r_love1',
  'r_pumpkinseed', 'r_woodgarage'];
const PRESETS = { none: [], some: someDone, lots: [], all: RESEARCH.map((r) => r.id) };
function applyPreset(p) {
  state.done.clear();
  let ids = PRESETS[p] || String(p || '').split(',').filter(Boolean);
  if (p === 'lots') {
    const n = Math.floor(RESEARCH.length * 0.55);
    // a valid prefix: research whatever is available until n are done
    ids = [];
    const d = new Set();
    for (let k = 0; k < 400 && d.size < n; k++) {
      const av = RESEARCH.filter((r) => !d.has(r.id) && (r.req || []).every((q) => d.has(q)));
      if (!av.length) break;
      d.add(av[(k * 7) % av.length].id);
    }
    ids = [...d];
  }
  if (real && p === 'some') ids = RESEARCH.filter((r) => !(r.req || []).length).map((r) => r.id);
  for (const id of ids) if (BY_ID[id]) state.done.add(id);
}
applyPreset(P.get('done') || 'some');
resetSections();
const zp = P.get('zones') || 'some';
if (zp === 'all') Object.keys(ZONES).forEach((z) => state.zones.add(z));
else if (zp === 'some') ['tower', 'patch'].forEach((z) => state.zones.add(z));

const reqsMet = (r) => (r.req || []).every((q) => state.done.has(q));
function canResearch(id) {
  const r = BY_ID[id];
  if (!r) return { ok: false, reason: 'Unknown' };
  if (state.done.has(id)) return { ok: false, reason: 'Already researched' };
  if (state.jobs.some((j) => j.id === id)) return { ok: false, reason: 'Researching...' };
  if (!state.sections.has(r.branch)) return { ok: false, reason: 'Decrypt this section first' };
  if (!reqsMet(r)) return { ok: false, reason: 'Research the prerequisites first' };
  if (r.zone && !state.zones.has(r.zone)) return { ok: false, reason: `Meet ${ZONES[r.zone] || 'a neighbour'} first` };
  if (state.jobs.length >= state.slots) return { ok: false, reason: 'Lab bench busy' };
  return { ok: true };
}
function startResearch(id) {
  if (!canResearch(id).ok) return false;
  const r = BY_ID[id];
  state.jobs.push({ id, t: 0, time: r.time || 10 });
  return true;
}
function sectionKey(b) {
  const k = keyOf(b);
  const needs = [];
  if (k.node) needs.push({ kind: 'node', id: k.node, ok: state.done.has(k.node), text: `Research ${BY_ID[k.node]?.name || k.node}` });
  if (k.zone) needs.push({ kind: 'zone', id: k.zone, ok: state.zones.has(k.zone), text: `Meet ${ZONES[k.zone] || k.zone}` });
  if (k.coins) needs.push({ kind: 'coins', ok: state.coins >= k.coins, text: `Pay ${k.coins} coins`, coins: k.coins });
  const ready = needs.every((n) => n.kind === 'coins' || n.ok);
  return { id: b, open: state.sections.has(b), coins: k.coins || 0, needs, ready, canUnlock: ready && state.coins >= (k.coins || 0) };
}
function unlockSection(b) {
  const k = sectionKey(b);
  if (k.open) return { ok: false, msg: 'Already open' };
  const miss = k.needs.find((n) => n.kind !== 'coins' && !n.ok);
  if (miss) return { ok: false, msg: `Section key: ${miss.text} first` };
  if (state.coins < k.coins) return { ok: false, msg: `Needs ${k.coins} coins` };
  state.coins -= k.coins;
  state.sections.add(b);
  log(`decrypted: ${b} (-${k.coins})`);
  return { ok: true };
}
function jobLeft(j) { return Math.max(0, j.time - j.t) / state.speed; }
function rushPrice(id, mode) {
  const j = state.jobs.find((x) => x.id === id);
  return j ? researchRushPrice(BY_ID[id], jobLeft(j), mode) : null;
}
function rush(id, mode) {
  const j = state.jobs.find((x) => x.id === id);
  if (!j) return { ok: false, msg: 'Not running' };
  const p = rushPrice(id, mode);
  if (state.coins < p) return { ok: false, msg: `Needs ${p} coins` };
  state.coins -= p;
  log(`rush ${mode}: ${id} (-${p})`);
  if (mode === 'now') finish(j); else j.t += (j.time - j.t) / 2;
  return { ok: true };
}
function finish(j) {
  state.jobs = state.jobs.filter((x) => x !== j);
  state.done.add(j.id);
  const r = BY_ID[j.id];
  if (r?.mods?.labSlots) state.slots += r.mods.labSlots;
  log(`done: ${j.id}`);
}
// pre-start jobs
const nJobs = +(P.get('jobs') ?? 1);
if (nJobs > state.slots) state.slots = nJobs;
for (let i = 0; i < nJobs; i++) {
  const av = RESEARCH.filter((r) => canResearch(r.id).ok);
  const r = av[(i * 3 + 1) % Math.max(1, av.length)];
  if (r && startResearch(r.id)) state.jobs[state.jobs.length - 1].t = (r.time || 10) * (0.25 + 0.3 * i);
}
let last = performance.now();
function tick(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (!state.paused) for (const j of state.jobs.slice()) { j.t += dt * state.speed; if (j.t >= j.time) finish(j); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------- sfx
let actx = null, soundOn = false;
const logEl = document.getElementById('log');
const counts = {};
function log(s) { logEl.textContent = (s + '\n' + logEl.textContent).slice(0, 600); }
function blip(name) {
  if (!soundOn) return;
  actx ||= new AudioContext();
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  const spec = { click: [900, 0.03, 'square'], hover: [1400, 0.015, 'square'], select: [1250, 0.05, 'square'], filter: [700, 0.05, 'square'], open: [300, 0.25, 'sawtooth'], error: [140, 0.2, 'square'], start: [440, 0.3, 'triangle'], done: [660, 0.45, 'triangle'], unlock: [990, 0.2, 'sine'] }[name] || [500, 0.05, 'sine'];
  o.type = spec[2];
  o.frequency.setValueAtTime(spec[0], t);
  if (name === 'done' || name === 'start') o.frequency.exponentialRampToValueAtTime(spec[0] * 2, t + spec[1] * 0.8);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + spec[1]);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + spec[1] + 0.02);
}
function sfx(name) {
  counts[name] = (counts[name] || 0) + 1;
  document.getElementById('sfx').textContent = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ');
  blip(name);
}

function customPreview(node, canvas, t) {
  if (!node.build) return false;
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  c.fillStyle = '#06224a';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#cfe8ff';
  const s = 18 + Math.sin(t * 2) * 6;
  c.fillRect(W / 2 - s, H / 2 - 2, s * 2, 4);
  c.fillRect(W / 2 - 2, H / 2 - s, 4, s * 2);
  return true;
}

// ---------------------------------------------------------------- open
let tree = null;
const wrap = document.getElementById('wrap');
const closed = document.getElementById('closed');
const legacy = !!P.get('legacy');
function open() {
  closed.style.display = 'none';
  const opts = {
    research: RESEARCH,
    branches: BRANCHES,
    isResearched: (id) => state.done.has(id),
    canResearch,
    onResearch: legacy ? (id) => { if (!canResearch(id).ok) return false; state.done.add(id); return true; } : startResearch,
    zoneName: (z) => ZONES[z] || z,
    isZoneOpen: (z) => state.zones.has(z),
    icon: (name, scale) => (hasSprite(name) ? spriteImg(name, scale) : ''),
    preview: P.get('custom') ? customPreview : undefined,
    sfx,
    onClose: () => { tree.destroy(); tree = null; closed.style.display = 'flex'; },
    coins: () => state.coins,
    speed: () => state.speed,
    sections: { isOpen: (b) => state.sections.has(b), key: sectionKey, unlock: unlockSection },
  };
  if (!legacy && !P.get('norush')) { opts.rushPrice = rushPrice; opts.onRush = rush; }
  if (!legacy) {
    opts.jobs = () => state.jobs.map((j) => ({ id: j.id, t: j.t, time: j.time, k: Math.min(1, j.t / j.time), left: jobLeft(j) }));
    opts.slots = () => state.slots;
  }
  tree = new LabTree(wrap, opts);
  window.__lt = tree;
  if (P.get('sel')) tree.select(P.get('sel'));
  if (P.get('filter') != null) tree._setFilter(P.get('filter'));
  if (P.get('sec')) { const B = tree.branches.find((x) => x.b.id === P.get('sec')); if (B) tree._selectSection(B, { pan: true }); }
}
open();
window.__state = state;
window.__open = open;
document.getElementById('reopen').onclick = open;

// ---------------------------------------------------------------- dev panel
const dev = document.getElementById('dev');
if (P.get('nodev')) dev.style.display = 'none';
dev.querySelector('.t').onclick = () => dev.classList.toggle('min');
dev.addEventListener('click', (e) => {
  const a = e.target.dataset?.a;
  if (!a) return;
  if (a.startsWith('speed')) state.speed = +a.slice(5);
  if (a === 'finish') for (const j of state.jobs.slice()) finish(j);
  if (a === 'pause') { state.paused = !state.paused; e.target.textContent = state.paused ? 'resume' : 'pause'; }
  if (a === 'slot') state.slots++;
  if (a === 'zones') { const all = Object.keys(ZONES); if (state.zones.size >= all.length) state.zones.clear(); else all.forEach((z) => state.zones.add(z)); }
  if (a === 'reset') { applyPreset('none'); state.jobs = []; resetSections(); }
  if (a === 'all') { applyPreset('all'); state.jobs = []; resetSections(); }
  if (a === 'coins') state.coins += 250;
  if (a === 'broke') state.coins = 0;
  if (a === 'unseal') BRANCHES.forEach((B) => state.sections.add(B.id));
  if (a === 'sound') { soundOn = !soundOn; e.target.textContent = `sound: ${soundOn ? 'on' : 'off'}`; }
  tree?.refresh();
});
