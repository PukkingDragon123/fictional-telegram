// Preview for src/ui/Encyclopedia.js with a fake game.
// URL: ?state=new|mid|full  ?open=1 (auto open)  ?chapter=fish&entry=bluegill  ?noctl=1  ?seen=1 (no NEW ribbons)
//      ?no3d=1 (skip the 3D livestock renders)
// window.__book is the Encyclopedia; __book._pose({ open: .5 }) / ({ flip: .4, dir: 1 }); __book.advance(ms) steps time.
import * as THREE from 'three';
import { audio } from '../src/audio/audio.js';
import { Encyclopedia } from '../src/ui/Encyclopedia.js';
import { buildEncyclopedia, commitDexSeen } from '../src/ui/encyclopediaData.js';
import { Icons3D } from '../src/ui/icons3d.js';
import { SPECIES, MORPH_IDS } from '../src/data/species.js';
import { WILD_BIRDS } from '../src/data/birds.js';
import { BUGS } from '../src/data/bugs.js';
import { LAND_ANIMALS } from '../src/data/landAnimals.js';
import { FOOD_ITEMS } from '../src/data/foods.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { STRUCTURES } from '../src/data/structures.js';

const Q = new URLSearchParams(location.search);
const mode = Q.get('state') || 'mid';
window.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* */ } }, { once: true, capture: true });

function fakeGame() {
  const frac = mode === 'full' ? 1 : mode === 'new' ? 0 : 0.45;
  const take = (arr, f = frac) => arr.filter((x, i) => (i === 0 && f > 0) || (i * 0.618034) % 1 < f);
  const disc = mode === 'new' ? ['bluegill'] : take(SPECIES.map((s) => s.id));
  const morphs = [];
  for (const id of disc) for (const m of MORPH_IDS) if (m !== 'normal' && (id.length + m.length) % (mode === 'full' ? 1 : 4) === 0) morphs.push(`${id}:${m}`);
  const state = {
    day: 6, coins: 500, discovered: disc, morphsSeen: morphs,
    birdsSpotted: take(WILD_BIRDS.map((b) => b.id)),
    landSpotted: take(LAND_ANIMALS.map((a) => a.id)),
    foodSeen: take(Object.keys(FOOD_ITEMS)), food: { pellets: 20, carrot: 3 },
    zones: mode === 'new' ? [] : mode === 'full' ? ['tower', 'river', 'willow', 'swamp', 'mush'] : ['tower', 'swamp'],
    villagers: { hoot: { hearts: 3, met: true }, granny: { hearts: 1, met: true } },
    achievements: take(ACHIEVEMENTS.map((a) => a.id), mode === 'full' ? 1 : 0.4),
    research: mode === 'new' ? [] : ['r_genetics'],
    mutationsSeen: mode === 'new' ? [] : mode === 'full' ? ['bluegill:tiny', 'bass:titan', 'goldfish:doge', 'perch:frozen', 'pike:hot', 'brook:candy', 'char:shiny', 'walleye:zombie', 'sockeye:doublehot', 'aurora:galaxy'] : ['bass:titan', 'perch:frozen', 'goldfish:candy'],
  };
  const fishList = disc.slice(0, 12).map((id, i) => ({ sp: { id }, g: { morph: 'normal', mut: i === 2 ? 'hot' : null } }));
  const built = mode === 'new' ? ['seaweed', 'cattail'] : mode === 'full' ? null : ['seaweed', 'cattail', 'berries', 'flowers', 'carrot', 'lettuce', 'tallgrass', 'lilypad', 'pumpkin'];
  const game = {
    state,
    fish: { list: fishList, countBySpecies: () => Object.fromEntries(disc.map((id, i) => [id, (i * 3) % 7])) },
    bugs: { seen: new Set(take(BUGS.map((b) => b.id))) },
    livestock: { list: mode === 'new' ? [] : mode === 'full' ? ['mallard', 'pekin', 'wood', 'canada', 'snow'].map((breed) => ({ breed })) : [{ breed: 'mallard' }, { breed: 'canada' }] },
    landAnimals: { tame: mode === 'full' ? [{ breed: 'lop' }, { breed: 'dutch' }, { breed: 'lionhead' }] : [{ breed: 'lop' }] },
    structures: { list: built ? built.map((type) => ({ type, built: true })) : [] },
    ui: null,
  };
  if (mode === 'full') game.structures.list = Object.keys(STRUCTURES).map((type) => ({ type, built: true }));
  if (!Q.has('no3d')) {
    try {
      const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
      r.outputColorSpace = THREE.SRGBColorSpace;
      game.ui = { icons: new Icons3D({ renderer: r }) };
    } catch (e) { console.warn('no webgl for icons', e); }
  }
  return game;
}

const game = fakeGame();
window.__game = game;
if (Q.has('seen')) commitDexSeen(game, buildEncyclopedia(game));
else if (mode !== 'new') {
  // pretend the book was opened before: some entries already seen, the rest are NEW
  const b = buildEncyclopedia(game);
  const seen = {};
  for (const c of b.chapters) seen[c.id] = c.entries.filter((e, i) => e.known && i % 3 !== 1).map((e) => e.id);
  seen._morphs = game.state.morphsSeen.slice(0, 4);
  game.state.dexSeen = seen;
}
const book = new Encyclopedia({ game, root: document.getElementById('ui'), sfx: (n, o) => { window.__sfx = (window.__sfx || []).concat(n); try { audio.play(n, { volume: 0.5, ...o }); } catch { /* */ } } });
window.__book = book;

const ctl = document.getElementById('ctl');
if (Q.has('noctl')) ctl.classList.add('hide');
const btn = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; ctl.appendChild(b); };
btn('Open', () => book.open());
btn('Open @ fish/bluegill', () => book.open({ chapter: 'fish', entry: 'bluegill' }));
btn('Open @ trophies', () => book.open({ chapter: 'trophies' }));
btn('Close', () => book.close());
for (const s of ['new', 'mid', 'full']) btn(`state=${s}`, () => { location.search = `?state=${s}&open=1`; });
if (Q.has('open')) book.open({ chapter: Q.get('chapter'), entry: Q.get('entry'), instant: Q.has('instant') });
