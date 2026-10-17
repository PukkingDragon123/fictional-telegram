// [v26 demo] The demo build: `npm run build:demo` (vite --mode demo, one file in
// dist-demo/). Everything demo-only hangs off DEMO, which Vite turns into a
// constant false in every other build, so the full game carries none of it
// (Rollup drops the dead branches and the modules only they import).
//
// What the demo is: the whole first-day tutorial and days 1-5 (bears from day 2,
// the first feasts and feast events). Research stops at the first sections
// (DEMO_SECTIONS); the rest of the tree, Flint & Steel (industry), the Deepwood
// Expedition and Old Longneck behind the falls show a "Full game" lock. When the
// day-5 ledger is closed the end screen plays (src/demo/EndScreen.js).
//
//   src/game/ext/demo.js   game.demo (the gate: locks, day limit, end screen)
//   src/demo/titleRibbon.js the DEMO ribbon on the title sign
//   demoBoot()             main.js calls it first thing (demo build only)
export const DEMO = import.meta.env.MODE === 'demo';

// where "Get the full game" goes. Placeholder: put the store page here.
export const DEMO_STORE_URL = 'https://example.com/the-bear-must-eat';

// the last day you can play; the end screen comes when its evening ledger closes
export const DEMO_LAST_DAY = 5;

// research sections open in the demo (src/data/research.js BRANCHES ids). Every
// other section (Trout & Char, Salmon Run, Big & Ancient Fish, Gadgets, Curb Appeal,
// Bear Diner, Woodworking, Bear Resort, Weather Gear, Flint & Steel, Deepwood
// Expedition, and any section added later) is "Full game".
export const DEMO_SECTIONS = ['lab', 'panfish', 'breed', 'garden', 'snack', 'beaver', 'pond', 'defense'];

// single nodes inside open sections that lead into full-game content
// (r_mine_survey finds Flint's Quarry = the industry story)
export const DEMO_LOCKED_NODES = ['r_mine_survey'];

// ---- saves: the demo keeps its own. Every 'tbme.*' key the game reads or writes
// (the save, save slots, golden tails, ...) lives under 'tbme.demo.*' instead, so
// a demo run never touches (or sees) a full-game save. Device settings stay shared.
const SHARED_KEYS = /^tbme\.(px|muted|volumes|titleStill|settings\.v\d+)$/;
const DEMO_NS = 'tbme.demo.';
const scoped = (k) => typeof k === 'string' && k.startsWith('tbme.') && !k.startsWith(DEMO_NS) && !SHARED_KEYS.test(k);

function scopeStorage() {
  let ls = null;
  try { ls = window.localStorage; } catch { return; }
  const P = typeof Storage !== 'undefined' ? Storage.prototype : null;
  if (!ls || !P || P.__tbmeDemo) return;
  const get = P.getItem, set = P.setItem, del = P.removeItem, key = P.key;
  const wrap = (fn, map) => function (k, ...rest) { return fn.call(this, this === ls ? map(k) : k, ...rest); };
  const toRaw = (k) => (scoped(k) ? DEMO_NS + k.slice(5) : k);
  P.getItem = wrap(get, toRaw);
  P.setItem = wrap(set, toRaw);
  P.removeItem = wrap(del, toRaw);
  // listing keys: demo keys read as plain 'tbme.*', the full game's own keys are hidden under another name
  P.key = function (i) {
    const raw = key.call(this, i);
    if (this !== ls || typeof raw !== 'string') return raw;
    if (raw.startsWith(DEMO_NS)) return 'tbme.' + raw.slice(DEMO_NS.length);
    return scoped(raw) ? 'tbme-full.' + raw.slice(5) : raw;
  };
  Object.defineProperty(P, '__tbmeDemo', { value: { get, set, del, key } });
}

// wipe the demo's own saves (the end screen's PLAY AGAIN)
export function clearDemoSaves() {
  try {
    const ls = window.localStorage, raw = Storage.prototype.__tbmeDemo;
    const n = ls.length, keys = [];
    for (let i = 0; i < n; i++) { const k = raw ? raw.key.call(ls, i) : ls.key(i); if (k && k.startsWith(DEMO_NS)) keys.push(k); }
    for (const k of keys) (raw ? raw.del : Storage.prototype.removeItem).call(ls, k);
  } catch { /* storage unavailable */ }
}

// main.js, first thing (demo build only)
export function demoBoot() {
  if (!DEMO) return;
  scopeStorage();
  document.documentElement.classList.add('tbme-demo');
  import('./titleRibbon.js').then((m) => m.watchTitle()).catch((e) => console.warn('[demo] ribbon', e));
}
