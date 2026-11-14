// LabTree: Reynard's research computer.
//
// [v33 lab4] "a real desktop in a 3D scene": the Lab opens with the camera pushing in on
// Reynard's lab room (the game's own voxel scene, rendered live by the game's renderer:
// src/ui/lab/stage3d.js) behind a carved walnut monitor. The screen is a DESKTOP: one big
// framed plaque per research topic (badges: ready / running / all done / key ready) over the
// live room, and a walnut taskbar with the lab bench (jobs + rush), coins and "N/233".
// Locked topics are apps to INSTALL with their section key ("new app installed!").
// Each topic opens as an app window with its own wood; behind it the real place: the Dive's
// underwater lake for fish topics (the topic's researched fish swim in it, react to the
// cursor, splash in when researched), the lab room, or the topic's spot in the game world.
// Projects are big tiles (brass portholes with an animated pond for fish, carved frames
// otherwise) on a tree with brass pipes. The card on the right opens with a live inset (the
// selected thing in action: the fish in the lake, the real building model, the crop growing)
// and the real numbers (species data for fish), time, unlocks and a big RESEARCH button.
// The chrome is high-res pixel art painted once (src/ui/lab/wood.js); only the open app's
// tiles are in the DOM; 3D renders are capped and run only while on show.
//
// Research is FREE but TIMED: picking a node puts it on a lab "bench" and it finishes after
// `time` seconds of game time. Running jobs can be rushed with coins; topics (= branches)
// can be locked behind a section key.
//
//   const tree = new LabTree(container, {
//     research, branches,                // data (src/data/research.js)
//     isResearched: (id) => bool,
//     canResearch: (id) => ({ ok, reason }),
//     onResearch: (id) => bool,          // = game.startResearch (or instant game.research)
//     jobs: () => [{ id, k, left, time }],  // running jobs (optional: no jobs => instant research)
//     slots: () => number,               // lab benches (default 1)
//     zoneName: (zid) => 'Dale', isZoneOpen: (zid) => bool,
//     icon: (name, scale) => '<img ...>' or '',
//     fishCanvas?: (species, { frame, scale }) => canvas,
//     sfx?: (name) => void,              // hover click select error start done unlock rush rushnow decrypt denied foxyay sector open off
//     onClose, coins?, speed?, rushPrice?, onRush?, sections?: { isOpen(b), key(b), unlock(b) }, quiet?, game?,
//   });
//   tree.refresh(); tree.select(id) (opens the project's app first); tree.destroy();
//
// Stable hooks for the tutorial (src/game/Tutorial.js LAB_SEL): `.lt-node[data-id]` (tiles of
// the open app), `.lt-go`, `.lt-bench`, `.lt-slotc[data-job]`; body.lt-pc while a tree is on screen.
//
// The container should be a positioned element with a size; the computer fills it.
import './labtree.css';
import * as SPECIES_DATA from '../data/species.js';
import * as STRUCT_DATA from '../data/structures.js';
import { dpr } from './uiScale.js';
import { Tube } from './lab/tube.js';
import * as WD from './lab/wood.js';
import { Stage3D } from './lab/stage3d.js';
import { FishTank, glyph } from './lab/fishtank.js';
import { Preview } from './lab/preview.js';
import { stagesFor } from '../data/crops.js';
import { FACE3D } from './faceHook.js';
import { spriteCanvas, hasSprite } from './sprites.js';
import { frameURL } from './frames.js';

// project tiles (38 art px at 2x) on a grid; the pipe router works in half cells
const TILE = 96;
const COLW = 164;
const ROWH = 150;
const NODE_DY = 62;
const LANE_DY = 2;
const PADL = 34;
const PADT = 16;
const PADR = 34;
const PADB = 26;
const MINZ = 0.45;
const MAXZ = 1.6;

const OPTIONAL = import.meta.glob('../art/fishArt.js');
let fishMod = null;
function loadFish() {
  if (!fishMod) {
    const k = '../art/fishArt.js';
    fishMod = OPTIONAL[k] ? OPTIONAL[k]().catch(() => null) : Promise.resolve(null);
  }
  return fishMod;
}

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();

export function fmtDur(s) {
  if (Number(s) === Infinity) return '--:--';
  s = Math.max(0, Math.ceil(Number(s) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m ${String(r).padStart(2, '0')}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export function fmtClock(s) {
  if (Number(s) === Infinity) return '--:--';
  s = Math.max(0, Math.ceil(Number(s) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const MOD_TEXT = {
  beautyMult: 'beauty from decor', breedMult: 'breeding speed', bugMult: 'bug catches', bugBonus: 'bug per catch',
  capacityMult: 'pond capacity', clutchBonus: 'egg per clutch', eggSlots: 'incubator slot', hatchSpeed: 'hatch speed',
  fishValueMult: 'fish value', foodMult: 'food from snacks', goldenMult: 'golden fish chance', growthMult: 'fish growth speed',
  hybridMult: 'hybrid chance', morphMult: 'rare morph chance', produceMult: 'garden produce', snackMealMult: 'snack meal value',
  traitMult: 'trait chance', labSlots: 'lab bench', beaverBonus: 'beaver per lodge', bagBonus: 'food bag size',
};
function modLine(k, v) {
  const t = MOD_TEXT[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase();
  const n = Number(v);
  if (!Number.isFinite(n)) return t;
  if (/Mult$|Speed$/.test(k)) return `+${Math.round(n * 100)}% ${t}`;
  return `+${n} ${t}${n > 1 && !/s$/.test(t) && !/(size|chance|speed)$/.test(t) ? 's' : ''}`;
}
const human = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function pixSVG(rows, pal, scale = 2, cls = '') {
  const w = rows[0].length, h = rows.length;
  let r = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`;
    }
  });
  // [v33 lab] one <img> per glyph (an inline SVG put a <rect> per pixel in the DOM: ~10k nodes)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${r}</svg>`;
  return `<img class="${cls}" width="${w * scale}" height="${h * scale}" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="" aria-hidden="true" draggable="false">`;
}
const FOX_LOGO = pixSVG([
  'o.........o',
  'oo.......oo',
  'oOo.....oOo',
  'oOOoooooOOo',
  'oooooooooo.',
  'oo.kook.ooo',
  'oooooooooo.',
  '.oowwwwwoo.',
  '..owwkwwo..',
  '...owwwo...',
  '....ooo....',
], { o: '#ff9a3a', O: '#7a3a12', k: '#1a0c04', w: '#fff1d6' }, 3, 'lt-logo');

// tiny glyphs drawn here so they never depend on the sprite sheet
const G_CHECK = pixSVG(['......k', '.....kg', 'k...kg.', 'gk.kg..', '.gkg...', '..g....'], { k: '#1d6a32', g: '#ffffff' }, 2, 'lt-g');
const G_CROSS = pixSVG(['r...r', '.r.r.', '..r..', '.r.r.', 'r...r'], { r: '#ff6a5a' }, 2, 'lt-g');
const G_CLOCK = pixSVG(['.kkkk.', 'kwwkwk', 'kwwkwk', 'kwwkkk', 'kwwwwk', '.kkkk.'], { k: '#2b2a24', w: '#fff1c8' }, 2, 'lt-g');
const G_LOCK = pixSVG(['.kkk.', 'k...k', 'k...k', 'kkkkk', 'kgggk', 'kgkgk', 'kgggk', 'kkkkk'], { k: '#1a1410', g: '#ffd23f' }, 2, 'lt-g');
const G_PAW = pixSVG(['.k.k.', 'k.k.k', '.....', '.kkk.', 'kkkkk', '.kkk.'], { k: '#ffb060' }, 2, 'lt-g');
const G_BOLT = pixSVG(['...kk', '..kk.', '.kkkk', 'kkkk.', '..kk.', '.kk..', '.k...'], { k: '#ffe14a' }, 2, 'lt-g');
const G_FF = pixSVG(['k..k...', 'kk.kk..', 'kkkkkk.', 'kkkkkkk', 'kkkkkk.', 'kk.kk..', 'k..k...'], { k: '#ffffff' }, 2, 'lt-g');
const G_COIN = pixSVG(['.kkkk.', 'kyyyyk', 'kyhyyk', 'kyhyyk', 'kyyyyk', '.kkkk.'], { k: '#8a5a00', y: '#ffd23f', h: '#fff6c0' }, 2, 'lt-g lt-coin');
const G_KEY = pixSVG(['.kkk.....', 'kyyyk....', 'kyhykkkkk', 'kyyykykyk', '.kkk.k.k.'], { k: '#5a3200', y: '#ffd23f', h: '#fff6c0' }, 2, 'lt-g');
// [v33 lab] the section padlock: a chunky brass lock with a keyhole (was a cyan "encryption" seal)
const G_SEAL = pixSVG([
  '...kkkkk...',
  '..kSSSSSk..',
  '.kSk...kSk.',
  '.kSk...kSk.',
  '.kSk...kSk.',
  'kkkkkkkkkkk',
  'kHyyyyyyyak',
  'kyyyykyyyak',
  'kyyykkkyyak',
  'kyyyykyyyak',
  'kyyyykyyyak',
  'kaaaaaaaaak',
  'kkkkkkkkkkk',
], { k: '#3a2208', S: '#b9c2cc', H: '#fff6c0', y: '#f2b632', a: '#b87414' }, 4, 'lt-g lt-sealg');
const G_FIT = pixSVG(['kk.kk', 'k...k', '.....', 'k...k', 'kk.kk'], { k: '#4a2e18' }, 3, 'lt-g');

const G_PLUS = pixSVG(['..k..', '..k..', 'kkkkk', '..k..', '..k..'], { k: '#4a2e18' }, 3, 'lt-g');
const G_MINUS = pixSVG(['.....', '.....', 'kkkkk', '.....', '.....'], { k: '#4a2e18' }, 3, 'lt-g');
const G_X = pixSVG(['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'], { k: '#ffffff' }, 3, 'lt-g');
const G_POWER = pixSVG(['...k...', '.k.k.k.', 'k..k..k', 'k..k..k', 'k.....k', '.k...k.', '..kkk..'], { k: '#ffffff' }, 3, 'lt-g');
const G_STAR = pixSVG(['...k...', '..kyk..', 'kkkyykk', 'kyyyyyk', '.kyyyk.', '.kykyk.', 'kk...kk'], { k: '#7a4a00', y: '#ffd23f' }, 2, 'lt-g');
const CONFETTI = (() => {
  const R = rng(7);
  const cols = ['#ff5a7a', '#ffd23f', '#5ccf6e', '#5fb8ff', '#b07bff', '#ff9a3a'];
  let h = '<span class="lt-conf" aria-hidden="true">';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + R() * 0.3;
    const d = 90 + R() * 120;
    h += `<i style="--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d * 0.6 - 30)}px;--c:${cols[i % cols.length]};--r:${Math.round(R() * 540 - 270)}deg;--dl:${Math.round(R() * 120)}ms"></i>`;
  }
  return h + '</span>';
})();
const FISH_URLS = new Map();
let PC_OPEN = 0; // trees on screen: the page body gets .lt-pc (the computer takes over)
// ---------------------------------------------------------------- pipe router
// Orthogonal routing on a half-cell grid: node (col,lane) sits at (2col+1,
// 2lane+1); even coordinates are the lanes between columns / rows. Pipes may
// share cells only with pipes of the same source (a trunk that splits) or the
// same target (inputs that merge). Anything else may only be crossed straight
// at a right angle (drawn as a little bridge).
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const OPP = [1, 0, 3, 2];
const TURN = 1.6;
const CROSS = 3.5;
const JOIN = 0.5;
const NEWCELL = 0.25;

class MinHeap {
  constructor() { this.k = []; this.v = []; this.top = 0; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const rv = v[0];
    this.top = k[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; mk = k[r]; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return rv;
  }
}

function routePipes(nodes, byId, GW, GH) {
  const key = (x, y) => y * GW + x;
  const nodeCell = new Set(nodes.map((n) => key(n.gx, n.gy)));
  const nodeAt = new Map(nodes.map((n) => [key(n.gx, n.gy), n]));
  const teeOK = (k, common) => {
    const x = k % GW, y = (k / GW) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = nodeAt.get(key(nx, ny));
      if (n && n !== common) return false;
    }
    return true;
  };
  const occ = new Map();
  const edges = [];
  for (const n of nodes) for (const r of n.req) { const p = byId.get(r); if (p && p !== n) edges.push({ src: p, dst: n, pts: null, bridges: [] }); }
  const rank = (e) => {
    const dr = Math.abs(e.src.lane - e.dst.lane), dc = Math.abs(e.src.col - e.dst.col);
    if (dr === 0 && dc === 1) return 0;
    if (dc === 0 && dr === 1) return 1;
    return 2 + dr + dc * 0.9;
  };
  edges.sort((a, b) => rank(a) - rank(b));
  const shares = (list, e) => !!list && list.some((o) => o.e.src === e.src || o.e.dst === e.dst);
  const passCost = (k, din, dout, e) => {
    const list = occ.get(k);
    if (!list) return 0;
    let c = 0;
    for (const o of list) {
      const common = o.e.src === e.src ? e.src : o.e.dst === e.dst ? e.dst : null;
      if (common) {
        if (o.din === din && o.dout === dout) continue;
        if (!teeOK(k, common)) return -1;
        c += JOIN;
        continue;
      }
      if (din === dout && o.din === o.dout && (din < 2) !== (o.din < 2)) c += CROSS;
      else return -1;
    }
    return c;
  };
  const N = GW * GH * 5;
  const dist = new Float64Array(N);
  const prev = new Int32Array(N);
  for (const e of edges) {
    const sx = e.src.gx, sy = e.src.gy, tx = e.dst.gx, ty = e.dst.gy;
    dist.fill(Infinity);
    prev.fill(-1);
    const heap = new MinHeap();
    const s0 = key(sx, sy) * 5 + 4;
    dist[s0] = 0;
    heap.push(0, s0);
    let found = -1;
    let guard = 0;
    while (heap.size && guard++ < 400000) {
      const s = heap.pop();
      const d = heap.top;
      if (d > dist[s]) continue;
      const k = (s / 5) | 0, din = s - k * 5, x = k % GW, y = (k / GW) | 0;
      if (x === tx && y === ty) { found = s; break; }
      const atStart = x === sx && y === sy;
      for (let dir = 0; dir < 4; dir++) {
        if (din !== 4 && dir === OPP[din]) continue;
        const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nk = key(nx, ny);
        const isT = nx === tx && ny === ty;
        if (!isT && nodeCell.has(nk)) continue;
        let c = 1;
        if (atStart) {
          if (dir === 1) c += 3;
          else if (dir === 3) c += 0.6;
        } else {
          if (dir !== din) c += TURN;
          const pc = passCost(k, din, dir, e);
          if (pc < 0) continue;
          c += pc;
        }
        if (isT) {
          if (dir === 1) c += 3;
          else if (dir === 3) c += 1.2;
        } else if (!shares(occ.get(nk), e)) c += NEWCELL;
        const ns = nk * 5 + dir, nd = d + c;
        if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = s; heap.push(nd, ns); }
      }
    }
    const pts = [];
    if (found >= 0) {
      for (let s = found; s >= 0; s = prev[s]) { const k = (s / 5) | 0; pts.push([k % GW, (k / GW) | 0]); }
      pts.reverse();
      const dirOf = (a, b) => (b[0] > a[0] ? 0 : b[0] < a[0] ? 1 : b[1] > a[1] ? 2 : 3);
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i], k = key(p[0], p[1]);
        const din = dirOf(pts[i - 1], p), dout = dirOf(p, pts[i + 1]);
        let list = occ.get(k);
        if (!list) occ.set(k, (list = []));
        for (const o of list) if (o.e.src !== e.src && o.e.dst !== e.dst) e.bridges.push({ gx: p[0], gy: p[1], h: din < 2 });
        list.push({ e, din, dout });
      }
    } else {
      pts.push([sx, sy], [sx + (tx > sx ? 1 : -1), sy], [sx + (tx > sx ? 1 : -1), ty], [tx, ty]);
    }
    e.pts = pts;
  }
  return edges;
}

// ---------------------------------------------------------------- component
const STATE_TEXT = {
  done: 'Researched',
  run: 'Researching...',
  avail: 'Ready to research',
  zone: 'Needs a neighbour',
  locked: 'Locked',
  sealed: 'Locked section',
};
function withGame(opts) {
  let G = opts.game || null;
  if (!G && typeof window !== 'undefined' && opts.jobs && window.__game && typeof window.__game.sectionOpen === 'function') G = window.__game;
  if (!G) return opts;
  const o = { ...opts };
  if (!o.coins) o.coins = () => G.state?.coins ?? 0;
  if (!o.speed && typeof G.researchSpeed === 'function') o.speed = () => G.researchSpeed();
  if (!o.onRush && typeof G.rushResearchPaid === 'function') { o.rushPrice = (id, m) => G.rushResearchPrice(id, m); o.onRush = (id, m) => G.rushResearchPaid(id, m); }
  if (!o.sections && typeof G.sectionOpen === 'function') o.sections = { isOpen: (b) => G.sectionOpen(b), key: (b) => G.sectionKey(b), unlock: (b) => G.unlockSection(b) };
  return o;
}


// ---------------------------------------------------------------- component
// fills missing options from a Game (explicit `game`, or the page's game when the tree runs inside it)
const SHORT = { lab: "Reynard's Lab", panfish: 'Sunfish', trout: 'Trout', salmon: 'Salmon', biggame: 'Big Fish', breed: 'Breeding', pond: 'Pond & Bugs', garden: 'Garden', snack: 'Snack Bar', beaver: 'Beavers', gizmo: 'Gadgets', decor: 'Curb Appeal', diner: 'Bear Diner', woodwork: 'Woodwork', defense: 'Defense', industry: 'Flint & Steel', dig: 'The Dig', dive: 'Loon Lake', resort: 'Resort', weather: 'Weather', expedition: 'Expedition' };
const shortName = (b) => SHORT[b.id] || String(b.name || b.id).split(' & ')[0];
const FACE_OK = new Set(); // face icons already rendered once (cheap from now on)
// topic -> theme (window wood, tile shape) and the emblem on its desktop plaque
const THEME_OF = {
  lab: 'lab', panfish: 'tank', trout: 'tank', salmon: 'tank', biggame: 'tank', breed: 'tank', dive: 'tank',
  pond: 'pond', garden: 'garden', snack: 'diner', diner: 'diner', beaver: 'workshop', woodwork: 'workshop', gizmo: 'workshop',
  decor: 'meadow', defense: 'fort', industry: 'quarry', dig: 'dig', resort: 'spa', weather: 'sky', expedition: 'forest',
};
const RAMP_OF = { lab: 'WALNUT', tank: 'CEDAR', quarry: 'ASH', fort: 'WALNUT', dig: 'OAK', workshop: 'OAK', diner: 'CEDAR', spa: 'ASH', sky: 'ASH' };
const EMBLEM_FISH = { panfish: 'bluegill', trout: 'brook', salmon: 'chinook', biggame: 'sturgeon' };
const EMBLEM_ALT = { beaver: 'wood' }; // face icons are 3D renders: the plaque gets a 2D emblem
const rampFor = (theme) => WD[RAMP_OF[theme] || 'OAK'];
// the fish card's stat icons
const K = '#1a0e06';
const GL = {
  meal: glyph(['k.k.k..', 'k.k.k..', 'kkkkk..', '.kkk...', '..k....', '..k....', '..k....'], { k: '#6a4a2a' }, 1),
  heart: glyph(['.kk.kk.', 'kRRkRRk', 'kRWRRRk', 'kRRRRRk', '.kRRRk.', '..kRk..', '...k...'], { k: K, R: '#e2475a', W: '#ffc8d0' }, 1),
  grow: glyph(['...g...', '.gg.gg.', '.gGgGg.', '..ggg..', '...g...', '...k...', '.kkkkk.'], { g: '#2a8a44', G: '#4fcf6a', k: '#7a4a20' }, 1),
  size: glyph(['kkkkkkkk', 'kyky.yky', 'kyyyyyyk', 'kkkkkkkk'], { k: K, y: '#ecc458' }, 1),
  gem: glyph(['.kkkkk.', 'kbBbbBk', 'kbbbbbk', '.kbbbk.', '..kbk..', '...k...'], { k: K, b: '#4aa8f0', B: '#c8e8ff' }, 1),
  star: glyph(['...k...', '..kyk..', 'kkkyykk', 'kyyyyyk', '.kyyyk.', '.kykyk.', 'kk...kk'], { k: '#5e3c0a', y: '#ffd23f' }, 1),
  nostar: glyph(['...k...', '..k.k..', 'kkk..kk', 'k.....k', '.k...k.', '.k.k.k.', 'kk...kk'], { k: '#a88a5a' }, 1),
  cross: glyph(['kk...kk', '.kk.kk.', '..kkk..', '.kk.kk.', 'kk...kk'], { k: '#9a6ae0' }, 1),
};

export class LabTree {
  constructor(container, opts = {}) {
    const t0 = now();
    this.container = container;
    this.o = opts = withGame(opts);
    this._alive = true;
    this._timers = new Set();
    this._off = [];
    this._st = new Map();
    this._iconInfo = new Map();
    this._fishFrames = new Map();
    this._ptrs = new Map();
    this._toasts = [];
    this._jobs = [];
    this._jobIds = new Set();
    this._jobSig = '';
    this._lastPoll = 0;
    this._t0 = now();
    this._fish = null;
    this.app = null; // the open topic (a laid-out branch) or null = the desktop
    this.sel = null;
    this.cam = { x: 0, y: 0, z: 1 };
    this.goal = null;
    this._layout(opts);
    const G = opts.game || (typeof window !== 'undefined' ? window.__game : null);
    this.stage = G?.renderer ? new Stage3D(G) : null;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (++PC_OPEN === 1) document.body.classList.add('lt-pc');
    document.body.classList.toggle('lt-3d', !!this.stage?.ok); // the panel goes see-through: the 3D shows behind
    this._buildDOM();
    this._pollJobs(true);
    this.refresh(true);
    this._bind();
    this._resize();
    this._intro();
    this._sfx('open');
    this._raf = requestAnimationFrame(this._loop);
    loadFish().then((m) => this._onFish(m));
    this.openMs = now() - t0;
  }

  // ------------------------------------------------------------ data / layout
  _layout(opts) {
    const branches = (opts.branches || []).slice();
    const byBranch = new Map(branches.map((b) => [b.id, []]));
    (opts.research || []).forEach((d, idx) => { if (d && byBranch.has(d.branch)) byBranch.get(d.branch).push({ d, idx }); });
    this.branches = [];
    this.nodes = [];
    for (const b of branches) {
      const list = byBranch.get(b.id);
      if (!list.length) continue;
      const theme = THEME_OF[b.id] || 'lab';
      const B = { b, i: this.branches.length, nodes: [], color: b.color || '#7dc070', theme, tank: theme === 'tank', short: shortName(b) };
      this.branches.push(B);
      const taken = new Set();
      for (const { d, idx } of list) {
        let col = Math.max(0, d.col | 0);
        const row = Math.max(0, d.row | 0);
        while (taken.has(`${col},${row}`)) col++;
        taken.add(`${col},${row}`);
        const n = { id: d.id, d, idx, B, col, row, req: (d.req || []).filter(Boolean), time: Number(d.time) || 0, zone: d.zone || null, kids: [] };
        B.nodes.push(n);
        this.nodes.push(n);
      }
      B.cols = B.nodes.reduce((m, n) => Math.max(m, n.col), 0) + 1;
      B.rows = B.nodes.reduce((m, n) => Math.max(m, n.row), 0) + 1;
      B.W = PADL + B.cols * COLW + PADR;
      B.H = PADT + B.rows * ROWH + PADB;
      for (const n of B.nodes) {
        n.gx = 2 * n.col + 1;
        n.gy = 2 * n.row + 1;
        n.x = this._X(n.gx);
        n.y = this._Y(n.gy);
      }
    }
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    for (const n of this.nodes) for (const r of n.req) this.byId.get(r)?.kids.push(n);
  }
  _X(gx) { return PADL + (gx * COLW) / 2; }
  _Y(gy) { return PADT + Math.floor(gy / 2) * ROWH + (gy % 2 ? NODE_DY : LANE_DY); }

  // ------------------------------------------------------------ public API
  refresh(initial = false) {
    if (!this._alive) return;
    this._keyCache = new Map(); // one sectionKey() per section per refresh
    try { this._refresh(initial); } finally { this._keyCache = null; }
  }

  _refresh(initial) {
    const changed = [];
    const opened = [];
    for (const B of this.branches) {
      const sealed = this._sealed(B);
      if (sealed !== B.sealed) {
        const was = B.sealed;
        B.sealed = sealed;
        if (!initial && was && !sealed) opened.push(B);
      }
    }
    for (const n of this.nodes) {
      const st = this._calc(n);
      const prev = this._st.get(n.id);
      if (prev === st) continue;
      this._st.set(n.id, st);
      if (n.el) this._paintNode(n, st);
      if (!initial && prev) changed.push([n, prev, st]);
    }
    if (this.app) this._paintPipes(initial);
    for (const [n, prev, st] of changed) {
      if (st === 'done') this._celebrate(n, prev);
      else if (prev === 'sealed') continue;
      else if (n.el && (prev === 'locked' || prev === 'zone') && st === 'avail') this._fx(n.el, 'is-unlocking', 900);
      else if (n.el && st === 'run' && prev !== 'run') this._fx(n.el, 'is-start', 900);
    }
    for (const B of opened) { const wait = B._instAt ? Math.max(0, 950 - (now() - B._instAt)) : 0; B._instAt = 0; if (wait) this._later(() => this._installed(B), wait); else this._installed(B); }
    // the taskbar: researched count
    const done = this.nodes.reduce((a, n) => a + (this._st.get(n.id) === 'done' ? 1 : 0), 0);
    if (done !== this._done) {
      this._done = done;
      this.$count.innerHTML = `<b>${done}</b>/${this.nodes.length}`;
      this.$cbar.style.transform = `scaleX(${(this.nodes.length ? done / this.nodes.length : 0).toFixed(3)})`;
    }
    this._updateDesk();
    if (this.app) {
      const B = this.app;
      const d = B.nodes.reduce((a, n) => a + (this._st.get(n.id) === 'done' ? 1 : 0), 0);
      const t = `${d}/${B.nodes.length}`;
      if (this.$winN && this.$winN.textContent !== t) this.$winN.textContent = t;
      if (this.app.tank) this._tankFish();
      if (this.sel && (initial || changed.some(([n]) => n === this.sel || n.kids.includes(this.sel) || this.sel.req.includes(n.id)))) this._renderCard();
      else if (this.sel) this._renderAct();
    }
    if (this.inst && !this.inst.B.sealed) { if (!this.inst.el.classList.contains('is-installing')) this._closeInstaller(true); }
    else if (this.inst) this._renderInstaller();
  }

  // the tutorial (and the bench) point at a project: open its app first
  select(id) {
    const n = this.byId.get(id);
    if (!n) return;
    if (n.B.sealed) { this._openInstaller(n.B); return; }
    if (this.app !== n.B) this._openApp(n.B, { instant: true, pick: n });
    else this._select(n, { pan: true, sound: false });
  }

  destroy() {
    if (!this._alive) return;
    this._alive = false;
    cancelAnimationFrame(this._raf);
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    for (const off of this._off) off();
    this._off = [];
    this._ro?.disconnect();
    try { this.stage?.dispose(); } catch { /* ignore */ }
    this._sfx('off');
    this.root.remove();
    if (--PC_OPEN <= 0) { PC_OPEN = 0; document.body.classList.remove('lt-pc', 'lt-3d'); }
  }

  // ------------------------------------------------------------ helpers
  _sfx(name) { try { this.o.sfx?.(name); } catch { /* ignore */ } }
  _isRes(id) { try { return !!this.o.isResearched?.(id); } catch { return false; } }
  _icon(name, scale = 1) {
    if (!name) return '';
    // [v33 lab4] a character face icon is a 3D render (a WebGL warm-up the first time):
    // a placeholder now, the render a moment after the screen is up
    if (!FACE_OK.has(name) && FACE3D.test?.(name)) { this._faceLater(); return `<i class="lt-face" data-n="${esc(name)}" data-s="${scale}" style="width:${16 * scale}px;height:${16 * scale}px"></i>`; }
    try { return this.o.icon ? String(this.o.icon(name, scale) || '') : ''; } catch { return ''; }
  }
  _zoneName(z) {
    try { const s = this.o.zoneName?.(z); if (s) return String(s); } catch { /* ignore */ }
    return 'a new neighbour';
  }
  _zoneOpen(z) {
    if (!z) return true;
    if (typeof this.o.isZoneOpen === 'function') { try { return !!this.o.isZoneOpen(z); } catch { return true; } }
    return true;
  }
  _timed() { return typeof this.o.jobs === 'function'; }
  _sealed(B) {
    if (!B || !this.o.sections?.isOpen) return false;
    try { return !this.o.sections.isOpen(B.b.id); } catch { return false; }
  }
  _secKey(B) {
    const c = this._keyCache?.get(B);
    if (c) return c;
    let k = null;
    try { k = this.o.sections?.key?.(B.b.id) || null; } catch { k = null; }
    k = k || { needs: [], coins: 0, ready: true, canUnlock: true };
    this._keyCache?.set(B, k);
    return k;
  }
  _coins() { try { const c = Number(this.o.coins?.()); return Number.isFinite(c) ? c : null; } catch { return null; } }
  _rushOK() { return typeof this.o.onRush === 'function' && typeof this.o.rushPrice === 'function'; }
  _rushPrice(id, mode) { try { const v = Number(this.o.rushPrice(id, mode)); return Number.isFinite(v) ? v : null; } catch { return null; } }
  _speed() { try { const v = Number(this.o.speed?.()); return v > 0 ? v : 1; } catch { return 1; } }
  _slots() { try { const s = Number(this.o.slots?.()); return s > 0 ? Math.floor(s) : 1; } catch { return 1; } }
  _pollJobs(force) {
    let raw = null;
    if (this._timed()) { try { raw = this.o.jobs(); } catch { raw = null; } }
    const list = [];
    if (Array.isArray(raw)) {
      for (const j of raw) {
        if (!j || !j.id) continue;
        const n = this.byId.get(j.id);
        const time = Number(j.time ?? n?.time) || 0;
        const t = Number(j.t) || 0;
        const k = clamp(Number(j.k ?? (time ? t / time : 0)) || 0, 0, 1);
        const left = Math.max(0, Number(j.left ?? (time - t)) || 0);
        list.push({ id: j.id, k, left, time, n });
      }
    }
    this._jobs = list;
    this._jobIds = new Set(list.map((j) => j.id));
    const sig = list.map((j) => j.id).join('|') + '#' + this._slots();
    const changed = sig !== this._jobSig;
    this._jobSig = sig;
    if (changed || force) this._renderBench();
    return changed;
  }
  _job(id) { return this._jobs.find((j) => j.id === id) || null; }
  _calc(n) {
    if (this._isRes(n.id)) return 'done';
    if (n.B.sealed) return 'sealed';
    if (this._jobIds.has(n.id)) return 'run';
    if (!n.req.every((r) => this._isRes(r) || !this.byId.has(r))) return 'locked';
    if (n.zone && !this._zoneOpen(n.zone)) return 'zone';
    if (!this.o.isZoneOpen && this.o.canResearch) {
      try { const r = this.o.canResearch(n.id); if (r && !r.ok && /^Meet /.test(r.reason || '')) return 'zone'; } catch { /* ignore */ }
    }
    return 'avail';
  }
  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (this._alive) fn(); }, ms);
    this._timers.add(t);
    return t;
  }
  _fx(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    this._later(() => el.classList.remove(cls), ms);
  }
  _on(target, type, fn, opt) {
    target.addEventListener(type, fn, opt);
    this._off.push(() => target.removeEventListener(type, fn, opt));
  }
  _check(n) {
    const st = this._st.get(n.id);
    if (st === 'done') return { ok: false, reason: 'Already researched' };
    if (st === 'run') return { ok: false, reason: 'Researching...' };
    if (st === 'sealed') return { ok: false, reason: `Unlock ${n.B.b.name} first` };
    let r = null;
    if (this.o.canResearch) { try { r = this.o.canResearch(n.id); } catch { r = null; } }
    if (!r || typeof r !== 'object') r = { ok: st === 'avail' };
    if (r.ok && this._timed() && this._jobs.length >= this._slots()) r = { ok: false, reason: 'Lab bench busy' };
    if (!r.ok && !r.reason) r = { ok: false, reason: st === 'locked' ? 'Research the ones before it first' : st === 'zone' ? `Meet ${this._zoneName(n.zone)} first` : 'Not available right now' };
    return r;
  }
  _faceLater() {
    if (this._faceT) return;
    this._faceT = this._later(() => {
      this._faceT = 0;
      const els = [...this.root.querySelectorAll('.lt-face')];
      for (const el of els) FACE_OK.add(el.dataset.n);
      for (const el of els) if (el.isConnected) el.outerHTML = this._icon(el.dataset.n, +el.dataset.s || 1);
    }, 600);
  }
  _iconMeta(name) {
    let m = this._iconInfo.get(name);
    if (!m && FACE3D.test?.(name)) { m = { ok: !!this.o.icon, w: 16, h: 16 }; this._iconInfo.set(name, m); } // (never render a face just to read its size)
    if (!m) {
      const html = this._icon(name, 1);
      const w = +(/width="(\d+)"/.exec(html)?.[1] || 0), h = +(/height="(\d+)"/.exec(html)?.[1] || 0);
      m = { ok: !!html, w: w || 12, h: h || 12 };
      this._iconInfo.set(name, m);
    }
    return m;
  }
  // a game icon at the biggest whole scale that fits `box` css px
  _iconFit(name, box) {
    let m = this._iconMeta(name);
    if (!m.ok) { name = 'flask'; m = this._iconMeta(name); }
    if (!m.ok) return '';
    return this._icon(name, Math.max(1, Math.floor(box / Math.max(m.w, m.h, 1))));
  }
  _fishFrame(species, frame) {
    const k = species + '#' + frame;
    if (this._fishFrames.has(k)) return this._fishFrames.get(k);
    let c = null;
    const fn = this.o.fishCanvas || (this._fish && this._fish.fishCanvas);
    if (typeof fn !== 'function') return null;
    try {
      c = fn(species, { frame, scale: 1 });
      if (c && !c.getContext && c.canvas) c = c.canvas;
      if (!c || !c.width || !c.getContext) c = null;
    } catch { c = null; }
    this._fishFrames.set(k, c);
    return c;
  }
  _fishImg(species, box) {
    const f = this._fishFrame(species, 0);
    if (!f) return '';
    const k = Math.max(1, Math.floor(Math.min(box / f.width, (box * 0.85) / f.height)));
    let url = FISH_URLS.get(species) || '';
    if (!url) { try { url = f.toDataURL(); } catch { url = ''; } if (url) FISH_URLS.set(species, url); }
    if (!url) return '';
    return `<img class="px lt-fishimg" src="${url}" width="${f.width * k}" height="${f.height * k}" alt="" draggable="false">`;
  }
  _nodeArt(n, box) {
    if (n.d.species) { const f = this._fishImg(n.d.species, box); if (f) return f; }
    return this._iconFit(n.d.icon, box);
  }
  _buildArt(id, box) {
    const s = STRUCT_DATA.STRUCTURES?.[id];
    return this._iconFit(s?.icon || id, box) || this._iconFit('hammer', box);
  }
  _unlockItems(d) {
    const out = [];
    for (const b of [].concat(d.build || [])) {
      if (!b) continue;
      const s = STRUCT_DATA.STRUCTURES?.[b];
      out.push({ art: this._buildArt(b, 30), name: s?.name || human(b), kind: 'Build' });
    }
    if (d.species) {
      const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species];
      out.push({ art: this._fishImg(d.species, 36) || this._iconFit('fish', 30), name: sp?.name || human(d.species), kind: 'Fish', fish: true });
    }
    if (d.mods) for (const [k, v] of Object.entries(d.mods)) out.push({ art: this._iconFit(k === 'labSlots' ? 'flask' : 'bolt', 28), name: modLine(k, v), kind: 'Upgrade' });
    if (d.feature) out.push({ art: this._iconFit('gear', 28), name: d.featureName || human(d.feature), kind: 'New' });
    return out;
  }

  // ------------------------------------------------------------ DOM
  _buildDOM() {
    const root = document.createElement('div');
    root.className = `ltree${this.stage?.ok ? ' has-3d' : ''}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', "Reynard's research computer");
    root.innerHTML = `
      <div class="lt-mon">
        <canvas class="lt-bez" aria-hidden="true"></canvas>
        <div class="lt-scr">
          <div class="lt-deskarea">
            <div class="lt-desk" role="list" aria-label="Research apps"></div>
            <div class="lt-wins"></div>
            <div class="lt-toast" aria-live="polite"></div>
            <div class="lt-tip" aria-hidden="true"></div>
          </div>
          <footer class="lt-task">
            <canvas class="lt-task-bg" aria-hidden="true"></canvas>
            <button class="lt-home" type="button" aria-label="Desktop">${FOX_LOGO}</button>
            <div class="lt-bench"><span class="lt-bench-l" title="Lab bench">${this._iconFit('flask', 16)}<small class="lt-bench-s"></small></span><div class="lt-slots"></div></div>
            <div class="lt-tray">
              <span class="lt-coins" title="Your coins"${typeof this.o.coins === 'function' ? '' : ' hidden'}>${G_COIN}<b>0</b></span>
              <span class="lt-count" title="Researched"><span class="lt-count-t"></span><span class="lt-cbar"><i></i></span></span>
              <button class="lt-close" type="button" aria-label="Turn off the computer (Esc)">${G_POWER}</button>
            </div>
          </footer>
          <div class="lt-fx" aria-hidden="true"></div>
        </div>
        <span class="lt-plate" aria-hidden="true">REYNARD LABS</span><i class="lt-led" aria-hidden="true"></i>
      </div>`;
    this.container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.$mon = $('.lt-mon');
    this.$bez = $('.lt-bez');
    this.$scr = $('.lt-scr');
    this.$area = $('.lt-deskarea');
    this.$desk = $('.lt-desk');
    this.$wins = $('.lt-wins');
    this.$toast = $('.lt-toast');
    this.$tip = $('.lt-tip');
    this.$fxl = $('.lt-fx');
    this.$task = $('.lt-task');
    this.$taskBg = $('.lt-task-bg');
    this.$slots = $('.lt-slots');
    this.$benchS = $('.lt-bench-s');
    this.$coins = $('.lt-coins');
    this.$coinsV = $('.lt-coins b');
    this.$count = $('.lt-count-t');
    this.$cbar = $('.lt-cbar i');
    this._buildDesk();
    if (this.stage?.ok) { try { this.stage.desk(); } catch (e) { console.warn('lab 3d', e); this.stage.ok = false; } }
  }

  // ------------------------------------------------------------ the opening: the camera pushes in on the room
  _intro() {
    if (REDUCED) return;
    this.stage?.pushIn();
    this.$scr.animate([{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(.9)', opacity: 0, offset: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.3,1.05)' });
    this.$bez.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1 }], { duration: 600 });
  }

  // paint a cached chrome canvas into an element's <canvas> at 1 art px per css px (whole steps)
  _paintCv(cv, src) {
    if (!cv || !src) return;
    const k = this._k || 1;
    if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; }
    cv.style.width = `${src.width * k}px`;
    cv.style.height = `${src.height * k}px`;
    const x = cv.getContext('2d');
    x.clearRect(0, 0, cv.width, cv.height);
    x.drawImage(src, 0, 0);
  }

  // the emblem for a topic's plaque: the game's icon (or a fish sprite), as a canvas
  _emblem(B, box) {
    const fish = EMBLEM_FISH[B.b.id];
    let src = null;
    if (fish) src = this._fishFrame(fish, 0);
    if (!src) {
      let name = EMBLEM_ALT[B.b.id] || B.b.icon;
      if (FACE3D.test?.(name) || !hasSprite(name)) name = hasSprite('flask') ? 'flask' : name;
      try { src = hasSprite(name) ? spriteCanvas(name, 1) : null; } catch { src = null; }
    }
    if (!src) return null;
    const k = Math.max(1, Math.floor(box / Math.max(src.width, src.height)));
    const c = WD.canvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    c._k = k;
    return c;
  }

  // ------------------------------------------------------------ the desktop
  _buildDesk() {
    let h = '';
    for (const B of this.branches) {
      const ic = this._iconMeta(B.b.icon).ok ? B.b.icon : 'flask';
      B.iconName = ic;
      h += `<button type="button" class="lt-app" role="listitem" data-b="${B.i}" style="--bc:${esc(B.color)}" aria-label="${esc(B.b.name)}">
        <span class="lt-app-ic"><canvas class="lt-app-cv"></canvas><span class="lt-app-lock">${G_LOCK}</span></span>
        <span class="lt-app-badge"></span><span class="lt-app-nm">${esc(B.short)}</span></button>`;
    }
    this.$desk.innerHTML = h;
    for (const B of this.branches) {
      B.app = this.$desk.querySelector(`.lt-app[data-b="${B.i}"]`);
      B.$cv = B.app.querySelector('.lt-app-cv');
      B.$badge = B.app.querySelector('.lt-app-badge');
    }
  }

  // plaque size: the biggest that lets the grid fit the desk
  _layoutDesk() {
    const w = this.$area.clientWidth, h = this.$area.clientHeight;
    if (!w || !h) return;
    const n = this.branches.length, k = this._k || 1;
    let S = 56;
    for (const s of [136, 128, 120, 112, 104, 96, 88, 80, 72, 64, 56]) {
      const cw = (s + 30) * k, ch = (s + 26) * k;
      const cols = Math.max(1, Math.floor((w - 24) / cw)), rows = Math.ceil(n / cols);
      if (rows * ch <= h - 20 && cols * cw <= w) { S = s; break; }
    }
    if (S === this._plS && k === this._plK) return;
    this._plS = S; this._plK = k;
    this.$desk.style.setProperty('--ic', `${S * k}px`);
    this.$desk.style.setProperty('--cw', `${(S + 30) * k}px`);
    this.$desk.style.setProperty('--ch', `${(S + 26) * k}px`);
    this._updateDesk(true);
  }

  _updateDesk(force) {
    const S = this._plS || 96;
    for (const B of this.branches) {
      if (!B.app) continue;
      const locked = !!B.sealed;
      const sig = `${locked}|${S}`;
      if (force || B._sig !== sig) {
        B._sig = sig;
        if (!B._em || B._emS !== S) { B._em = this._emblem(B, Math.round(S * 0.52)); B._emS = S; }
        this._paintCv(B.$cv, WD.plaque(S, B.color, B._em, { seed: B.i * 7 + 3, locked, ramp: WD.OAK }));
        B.app.classList.toggle('is-locked', locked);
      }
      let ready = 0, run = 0, done = 0;
      for (const n of B.nodes) { const st = this._st.get(n.id); if (st === 'avail') ready++; else if (st === 'run') run++; else if (st === 'done') done++; }
      const key = locked && this._secKey(B).canUnlock;
      const bs = locked ? (key ? 'key' : '') : run ? 'run' : ready ? `n${ready}` : done === B.nodes.length ? 'full' : '';
      if (bs !== B._bs) {
        B._bs = bs;
        B.$badge.className = `lt-app-badge${bs ? ` is-${bs.replace(/\d+/, '')}` : ''}`;
        B.$badge.innerHTML = bs === 'key' ? G_KEY : bs === 'run' ? this._iconFit('flask', 14) : bs === 'full' ? G_STAR : bs ? String(ready) : '';
        B.app.classList.toggle('has-key', bs === 'key');
      }
    }
  }

  // ------------------------------------------------------------ an app window
  _openApp(B, { instant = false, pick = null, from = null } = {}) {
    if (!B) return;
    if (B.sealed) { this._openInstaller(B, from); return; }
    if (this.app === B) { if (pick) this._select(pick, { pan: true }); return; }
    this._closeApp(true);
    this._closeInstaller(true);
    this.app = B;
    B.newApp = false;
    B.app?.classList.remove('is-new');
    const win = document.createElement('section');
    win.className = `lt-win th-${B.theme}${B.tank ? ' is-tank' : ''}`;
    win.setAttribute('aria-label', B.b.name);
    win.style.cssText = `--bc:${B.color}`;
    win.innerHTML = `
      <canvas class="lt-win-bg" aria-hidden="true"></canvas>
      <header class="lt-wt"><span class="lt-wt-ic">${this._iconFit(B.iconName, 20)}</span><b class="lt-wt-t">${esc(B.b.name)}</b><span class="lt-wt-n"></span><button type="button" class="lt-wx" aria-label="Close app">${G_X}</button></header>
      <div class="lt-wb">
        <div class="lt-view" tabindex="0" aria-label="${esc(B.b.name)} projects">
          <div class="lt-world"></div>
          <div class="lt-zoom"><button type="button" data-z="in" aria-label="Zoom in">${G_PLUS}</button><button type="button" data-z="out" aria-label="Zoom out">${G_MINUS}</button></div>
        </div>
        <aside class="lt-card" aria-live="polite"></aside>
      </div>`;
    this.$wins.appendChild(win);
    this.$win = win;
    this.$winN = win.querySelector('.lt-wt-n');
    this.view = win.querySelector('.lt-view');
    this.world = win.querySelector('.lt-world');
    this.$winBg = win.querySelector('.lt-win-bg');
    this.$card = win.querySelector('.lt-card');
    this._buildCard();
    this._buildApp(B);
    this.root.classList.add('is-app');
    if (this.stage?.ok) { try { this.stage.app(B.b.id, this._tankList(B)); } catch (e) { console.warn('lab 3d', e); } }
    this._sizeApp(true);
    const first = pick || this._firstNode(B);
    this.sel = null;
    if (first) this._select(first, { pan: false, sound: false });
    this._fitApp(true);
    if (first && pick) this._ensureVisible(first, true);
    this.refresh();
    this._sfx('select');
    // zoom out of the icon
    if (!instant && !REDUCED) {
      const a = (from || B.app)?.getBoundingClientRect(), b = win.getBoundingClientRect();
      if (a?.width && b.width) {
        const sx = a.width / b.width, sy = a.height / b.height;
        const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
        win.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
      }
    }
  }

  _closeApp(silent) {
    if (!this.app) return;
    const B = this.app, win = this.$win;
    for (const n of B.nodes) { n.el = null; }
    this.app = null;
    this.sel = null;
    this.edges = [];
    if (this.stage?.ok) { try { this.stage.setInset(null); this.stage.desk(); this.stage.setView(this._rectOf(this.$area)); } catch { /* ignore */ } }
    this.root.classList.remove('is-app');
    this.$tip.classList.remove('is-on');
    this.view = this.world = this.$winBg = this.$card = this.$win = this.$winN = null;
    this.$go = null;
    if (silent || REDUCED) { win.remove(); return; }
    this._sfx('click');
    const a = B.app?.getBoundingClientRect(), b = win.getBoundingClientRect();
    const sx = a?.width ? a.width / b.width : 0.2, sy = a?.height ? a.height / b.height : 0.2;
    const dx = a ? a.left + a.width / 2 - (b.left + b.width / 2) : 0, dy = a ? a.top + a.height / 2 - (b.top + b.height / 2) : 0;
    win.style.pointerEvents = 'none';
    const an = win.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 }], { duration: 220, easing: 'cubic-bezier(.5,0,.8,.4)' });
    an.onfinish = () => win.remove();
    this._later(() => win.remove(), 400);
    if (B.app) { this._fx(B.app, 'is-land', 500); try { B.app.focus({ preventScroll: true }); } catch { /* ignore */ } }
  }

  _firstNode(B) {
    const run = this._jobs.find((j) => j.n && j.n.B === B)?.n;
    if (run) return run;
    const by = (st) => B.nodes.filter((n) => this._st.get(n.id) === st).sort((a, b) => a.time - b.time || a.row - b.row || a.col - b.col);
    return by('avail')[0] || by('zone')[0] || by('locked')[0] || by('done')[0] || B.nodes[0] || null;
  }

  // the project tiles + glass pipes of one topic (only this topic is in the DOM)
  _buildApp(B) {
    const sub = new Map(B.nodes.map((n) => [n.id, n]));
    this.edges = routePipes(B.nodes, sub, 2 * B.cols + 1, 2 * B.rows + 1);
    const P = (pts) => {
      const px = pts.map(([gx, gy]) => [this._X(gx), this._Y(gy)]);
      const out = [px[0]];
      for (let i = 1; i < px.length - 1; i++) {
        const a = out[out.length - 1], b = px[i], c = px[i + 1];
        if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue;
        out.push(b);
      }
      out.push(px[px.length - 1]);
      return out.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
    };
    let lo = '', lc = '', lf = '';
    this.edges.forEach((e, i) => {
      const d = P(e.pts);
      lo += `<path class="lp-o" data-e="${i}" d="${d}"/>`;
      lc += `<path class="lp-c" data-e="${i}" d="${d}"/>`;
      lf += `<path class="lp-f" data-e="${i}" d="${d}"/>`;
    });
    let tiles = '';
    for (const n of B.nodes) {
      tiles += `<button class="lt-node" type="button" tabindex="-1" data-id="${esc(n.id)}" style="left:${n.x - TILE / 2}px;top:${n.y - TILE / 2}px" aria-label="${esc(n.d.name)}">
        <canvas class="lt-tile" width="${TILE}" height="${TILE + 3}"></canvas><span class="lt-ico" style="--d:${-(n.idx % 5) * 0.3}s">${this._nodeArt(n, B.tank ? 66 : 54)}</span>
        <span class="lt-nbar" aria-hidden="true"><i></i></span><span class="lt-badge"></span><span class="lt-pill"></span>
        <span class="lt-nm">${esc(n.d.name)}</span></button>`;
    }
    this.world.style.width = `${B.W}px`;
    this.world.style.height = `${B.H}px`;
    this.world.innerHTML = `<svg class="lt-svg" width="${B.W}" height="${B.H}" viewBox="0 0 ${B.W} ${B.H}" aria-hidden="true"><g>${lo}</g><g>${lc}</g><g>${lf}</g></svg>${tiles}<div class="lt-ret" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
    const svg = this.world.querySelector('.lt-svg');
    this.edges.forEach((e, i) => { e.els = [...svg.querySelectorAll(`[data-e="${i}"]`)]; e.s = null; });
    this.$ret = this.world.querySelector('.lt-ret');
    for (const n of B.nodes) {
      n.el = this.world.querySelector(`.lt-node[data-id="${CSS.escape(n.id)}"]`);
      n.$tile = n.el.querySelector('.lt-tile');
      n.$nbar = n.el.querySelector('.lt-nbar i');
      n.$badge = n.el.querySelector('.lt-badge');
      n.$pill = n.el.querySelector('.lt-pill');
      n._nbw = n._pillT = null;
      this._paintNode(n, this._st.get(n.id));
    }
    this._paintPipes(true);
  }

  _paintNode(n, st) {
    const el = n.el;
    if (!el) return;
    for (const s of ['done', 'run', 'avail', 'zone', 'locked']) el.classList.toggle(`is-${s}`, st === s);
    n._tst = st;
    this._drawTile(n, 0);
    el.setAttribute('aria-label', `${n.d.name}: ${STATE_TEXT[st] || ''}`);
    let b = '', pill = '';
    if (st === 'done') b = G_CHECK;
    else if (st === 'locked') b = G_LOCK;
    else if (st === 'zone') b = G_PAW;
    if (st === 'run') { const j = this._job(n.id); pill = `<b>${fmtClock(j ? j.left : n.time)}</b>`; }
    else if (st === 'avail') pill = this._timed() && n.time ? `${G_CLOCK}<b>${fmtDur(n.time / this._speed())}</b>` : '<b>FREE</b>';
    n.$badge.innerHTML = b;
    n.$pill.innerHTML = pill;
    n.$pill.hidden = !pill;
    n._pillT = null;
  }

  // a tile's canvas: carved frame, or (fish topics) the animated pond under a brass porthole
  _drawTile(n, f) {
    const st = n._tst, tx = n.$tile.getContext('2d');
    tx.clearRect(0, 0, n.$tile.width, n.$tile.height);
    if (n.B.tank) {
      const murky = st === 'locked' || st === 'zone' || st === 'sealed';
      tx.drawImage(WD.portWater(TILE, murky ? 'murky' : 'pond', murky ? 0 : f), 0, 0);
      tx.drawImage(WD.tile(TILE, 'port', st, { seed: n.B.i + 2 }), 0, 0);
      if (st === 'avail') tx.drawImage(WD.portSpark(TILE, f), 0, 0);
    } else tx.drawImage(WD.tile(TILE, 'frame', st, { ramp: rampFor(n.B.theme), seed: n.B.i + 2 }), 0, 0);
  }

  // the pond in each porthole steps along at ~6 fps (frames are cached)
  _animTiles(t) {
    const B = this.app;
    if (!B?.tank || t - (this._tileT || 0) < 160) return;
    this._tileT = t;
    const step = Math.floor(t / 160);
    for (const n of B.nodes) {
      if (!n.el || n._tst === 'locked' || n._tst === 'zone') continue;
      this._drawTile(n, (step + n.idx * 2) % WD.PORT_FRAMES);
    }
  }

  _paintPipes(initial) {
    for (const e of this.edges || []) {
      const a = this._st.get(e.src.id), b = this._st.get(e.dst.id);
      const s = a === 'done' ? (b === 'done' ? 'done' : b === 'run' ? 'run' : 'on') : 'off';
      if (e.s === s) continue;
      const was = e.s;
      e.s = s;
      for (const p of e.els) p.setAttribute('data-s', s);
      if (!initial && was === 'off' && s !== 'off') this._surge(e);
    }
  }

  // ------------------------------------------------------------ the installer (a locked topic)
  _openInstaller(B, from) {
    this._closeInstaller(true);
    const box = document.createElement('section');
    box.className = 'lt-inst';
    box.style.setProperty('--bc', B.color);
    box.innerHTML = `<header class="lt-wt"><span class="lt-wt-ic">${G_KEY}</span><b class="lt-wt-t">Install app</b><button type="button" class="lt-wx" aria-label="Close">${G_X}</button></header>
      <div class="lt-inst-b"></div>`;
    this.$wins.appendChild(box);
    this.inst = { B, el: box, body: box.querySelector('.lt-inst-b'), sig: '' };
    this._renderInstaller();
    this._sfx('sector');
    if (!REDUCED) {
      const a = (from || B.app)?.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (a?.width && b.width) box.animate([{ transform: `translate(${a.left + a.width / 2 - b.left - b.width / 2}px, ${a.top + a.height / 2 - b.top - b.height / 2}px) scale(.2)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    }
  }

  _renderInstaller() {
    const I = this.inst;
    if (!I) return;
    const B = I.B, k = this._secKey(B);
    const sig = JSON.stringify([k.needs?.map((x) => [x.ok, x.text]), k.coins, k.canUnlock]);
    if (sig === I.sig) return;
    I.sig = sig;
    let fish = 0, builds = 0, ups = 0;
    for (const n of B.nodes) { if (n.d.species) fish++; else if (n.d.build) builds++; else if (n.d.mods) ups++; }
    const inside = [[this._iconFit('fish', 22), fish], [this._iconFit('hammer', 22), builds], [this._iconFit('bolt', 22) || G_BOLT, ups]].filter((r) => r[1]).map(([a, c]) => `<span>${a}<b>${c}</b></span>`).join('');
    const needs = (k.needs || []).map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${x.ok ? G_CHECK : G_CROSS}<span>${esc(x.text)}</span></li>`).join('');
    I.body.innerHTML = `
      <div class="lt-inst-top"><canvas class="lt-inst-ic"></canvas>
        <div><b class="lt-inst-n">${esc(B.b.name)}</b><span class="lt-inst-c">${B.nodes.length} projects ${inside}</span></div></div>
      ${needs ? `<ul class="lt-inst-req">${needs}</ul>` : ''}
      <div class="lt-inst-bar"><i></i></div>
      <button type="button" class="lt-unlock${k.canUnlock ? ' is-ready' : ''}"${k.canUnlock ? '' : ' aria-disabled="true"'}>${k.canUnlock ? `${G_KEY}<span>INSTALL</span>` : `${G_LOCK}<span>LOCKED</span>`}${k.coins ? `<small>${G_COIN}${k.coins}</small>` : '<small>FREE</small>'}</button>`;
    const ic = I.body.querySelector('.lt-inst-ic');
    if (ic) { if (!B._em) B._em = this._emblem(B, 40); this._paintCv(ic, WD.plaque(72, B.color, B._em, { seed: B.i * 7 + 3, locked: true })); }
  }

  _closeInstaller(silent) {
    const I = this.inst;
    if (!I) return;
    this.inst = null;
    if (silent || REDUCED) { I.el.remove(); return; }
    const an = I.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { duration: 160, easing: 'ease-in' });
    an.onfinish = () => I.el.remove();
    this._later(() => I.el.remove(), 300);
  }

  _unlockSection(B, src) {
    if (!B || !B.sealed) return;
    const k = this._secKey(B);
    let res = null;
    try { res = this.o.sections?.unlock?.(B.b.id) ?? null; } catch (err) { console.error(err); res = null; }
    if (!this._alive) return;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res || !res.ok) {
      this._sfx('denied');
      if (src) this._fx(src, 'is-shake', 400);
      this._flash(src, res?.msg || 'Still locked');
      return;
    }
    this._sfx('decrypt');
    if (k.coins) { this._coinsFly(B.app, Math.min(14, 4 + Math.round(k.coins / 15))); this._bumpCoins(); }
    // the installer's bar fills, then the app pops onto the desktop
    if (this.inst?.B === B) this.inst.el.classList.add('is-installing');
    B._instAt = REDUCED ? 0 : now();
    this.refresh();
  }

  _installed(B) {
    this._closeInstaller(false);
    B.newApp = true;
    const el = B.app;
    if (el) {
      el.classList.add('is-new');
      this._fx(el, 'is-install', 1200);
      this._spark(el, 14);
    }
    this._toast({ html: `<div class="lt-toast-c is-sec" style="--bc:${esc(B.color)}">${CONFETTI}<span class="lt-toast-k">${G_STAR}NEW APP INSTALLED!${G_STAR}</span><div class="lt-toast-r"><span class="lt-art">${this._iconFit(B.iconName, 28)}</span><b>${esc(B.b.name)}</b></div><div class="lt-toast-n">${B.nodes.length} new projects to research</div></div>` });
  }

  // ------------------------------------------------------------ events
  _bind() {
    this._on(this.$desk, 'click', (e) => {
      const a = e.target.closest('.lt-app');
      if (!a) return;
      const B = this.branches[+a.dataset.b];
      this._fx(a, 'is-press', 200);
      this._openApp(B, { from: a });
    });
    this._on(this.$desk, 'pointerover', (e) => { const a = e.target.closest('.lt-app'); if (a && a !== this._hovApp) { this._hovApp = a; this._sfx('hover'); } });
    this._on(this.$wins, 'click', (e) => {
      if (e.target.closest('.lt-wx')) { if (e.target.closest('.lt-inst')) { this._sfx('click'); this._closeInstaller(); } else this._closeApp(); return; }
      const u = e.target.closest('.lt-unlock');
      if (u && this.inst) { if (u.classList.contains('is-ready')) this._unlockSection(this.inst.B, u); else { this._sfx('denied'); this._fx(u, 'is-shake', 400); } return; }
      if (e.target.closest('.lt-go')) { this._research(); return; }
      const r = e.target.closest('[data-rush]');
      if (r && this.sel) { this._rush(this.sel.id, r.dataset.rush, r); return; }
      const z = e.target.closest('[data-z]');
      if (z) { this._sfx('click'); this._zoomBy(z.dataset.z === 'in' ? 1.25 : 1 / 1.25); return; }
      const g = e.target.closest('[data-goto]');
      if (g) { const n = this.byId.get(g.dataset.goto); if (n) { if (n.B === this.app) this._select(n, { pan: true, sound: 'select' }); else this.select(n.id); } return; }
      const b = e.target.closest('.lt-node');
      if (!b || this._dragJustEnded()) return;
      const n = this.byId.get(b.dataset.id);
      if (!n) return;
      if (n === this.sel && this._compact && !this._sheet) { this._openSheet(true); return; }
      this._select(n, { pan: true, sound: 'select' });
      if (this._compact) this._openSheet(true);
    });
    this._on(this.$wins, 'dblclick', (e) => { const b = e.target.closest('.lt-node'); if (b && this.byId.get(b.dataset.id) === this.sel) this._research(); });
    this._on(this.$wins, 'pointerover', (e) => {
      if (e.pointerType !== 'mouse' || this._drag?.moved) return;
      const b = e.target.closest('.lt-node');
      if (!b || b === this._hoverEl) return;
      this._hoverEl = b;
      const n = this.byId.get(b.dataset.id);
      if (n) { this._showTip(n); this._sfx('hover'); }
    });
    this._on(this.$wins, 'pointerout', (e) => { const b = e.target.closest('.lt-node'); if (b && !b.contains(e.relatedTarget)) { this._hoverEl = null; this.$tip.classList.remove('is-on'); } });
    this._on(this.$wins, 'pointerdown', (e) => { if (e.target.closest('.lt-view') && !e.target.closest('.lt-zoom')) this._onDown(e); });
    this._on(window, 'pointermove', (e) => { this._onMove(e); this.stage?.pointer(e.clientX, e.clientY); });
    this._on(this.$area, 'pointerleave', () => { this.stage?.leave(); this.$desk.style.transform = ''; });
    this._on(this.$area, 'pointermove', (e) => {
      if (this.app) return;
      const r = this.$area.getBoundingClientRect();
      const dx = Math.round(((e.clientX - r.left) / r.width - 0.5) * -6), dy = Math.round(((e.clientY - r.top) / r.height - 0.5) * -4);
      const tr = `translate(${dx}px, ${dy}px)`;
      if (tr !== this._deskTr) { this._deskTr = tr; this.$desk.style.transform = tr; }
    });
    this._on(this.$area, 'click', (e) => { if (this.stage && !e.target.closest('.lt-node, .lt-app, .lt-card, .lt-wt, .lt-inst, button')) this.stage.click(e.clientX, e.clientY); });
    this._on(window, 'pointerup', (e) => this._onUp(e));
    this._on(window, 'pointercancel', (e) => this._onUp(e));
    this._on(this.$wins, 'wheel', (e) => { if (e.target.closest('.lt-view')) this._onWheel(e); }, { passive: false });
    this._on(this.root, 'contextmenu', (e) => e.preventDefault());
    this._on(window, 'keydown', (e) => this._key(e), true);
    this._on(this.$slots, 'click', (e) => {
      const r = e.target.closest('[data-rush]');
      if (r) { this._rush(r.dataset.id, r.dataset.rush, r); return; }
      const s = e.target.closest('[data-goto]');
      if (s) { this._sfx('select'); this.select(s.dataset.goto); }
    });
    this._on(this.root.querySelector('.lt-home'), 'click', () => { this._sfx('click'); this._closeInstaller(); this._closeApp(); });
    this._on(this.root.querySelector('.lt-close'), 'click', () => this._close());
    if (typeof ResizeObserver === 'function') { this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this.root); }
    else this._on(window, 'resize', () => this._resize());
  }

  _dragJustEnded() { return this._dragEndT && now() - this._dragEndT < 140; }

  _onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._vel = null;
    this.goal = null;
    if (this._ptrs.size === 1) this._drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false, hist: [[e.clientX, e.clientY, now()]] };
    else if (this._ptrs.size === 2 && this.view) {
      const [a, b] = [...this._ptrs.values()];
      const r = this.view.getBoundingClientRect();
      this._pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, cam: { ...this.cam } };
      if (this._drag) this._drag.moved = true;
    }
  }

  _onMove(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p || !this.view) return;
    p.x = e.clientX; p.y = e.clientY;
    if (this._pinch && this._ptrs.size >= 2) {
      const [a, b] = [...this._ptrs.values()];
      const r = this.view.getBoundingClientRect(), P = this._pinch;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const z = clamp(P.cam.z * (d / P.d0), this._minZ(), MAXZ);
      const wx = (P.mx - P.cam.x) / P.cam.z, wy = (P.my - P.cam.y) / P.cam.z;
      this.cam.z = z; this.cam.x = mx - wx * z; this.cam.y = my - wy * z;
      this._applyCam();
      return;
    }
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && dx * dx + dy * dy > 64) { d.moved = true; this.$win?.classList.add('is-dragging'); this.$tip.classList.remove('is-on'); }
    if (d.moved) {
      this.cam.x = d.cx + dx; this.cam.y = d.cy + dy;
      this._applyCam();
      const t = now();
      d.hist.push([e.clientX, e.clientY, t]);
      while (d.hist.length > 2 && t - d.hist[0][2] > 100) d.hist.shift();
    }
  }

  _onUp(e) {
    if (!this._ptrs.has(e.pointerId)) return;
    this._ptrs.delete(e.pointerId);
    if (this._pinch) { if (this._ptrs.size < 2) { this._pinch = null; this._dragEndT = now(); this._drag = null; } return; }
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      this._dragEndT = now();
      const h = d.hist;
      if (h.length >= 2 && !REDUCED) {
        const a = h[0], b = h[h.length - 1], dt = Math.max(1, b[2] - a[2]);
        if (now() - b[2] < 60) { const vx = (b[0] - a[0]) / dt, vy = (b[1] - a[1]) / dt; if (Math.hypot(vx, vy) > 0.25) this._vel = { x: vx, y: vy }; }
      }
    }
    this._drag = null;
    this.$win?.classList.remove('is-dragging');
  }

  _onWheel(e) {
    e.preventDefault();
    if (!this.view) return;
    this._vel = null; this.goal = null;
    const r = this.view.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    const zoom = e.ctrlKey || (Math.abs(dx) < 0.5 && (e.deltaMode !== 0 || Math.abs(dy) >= 40));
    if (zoom) this._zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
    else { this.cam.x -= e.shiftKey && !dx ? dy : dx; this.cam.y -= e.shiftKey && !dx ? 0 : dy; this._applyCam(); }
  }

  _key(e) {
    if (!this._alive || !this.root.isConnected || this.root.offsetParent === null) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key;
    const enter = k === 'Enter' || k === 'NumpadEnter' || k === ' ';
    if (enter && this._modalWaiting()) return; // a tutorial line / speech bubble waits for this key
    const btn = t && t.tagName === 'BUTTON' && this.root.contains(t) && !t.classList.contains('lt-node');
    let handled = true;
    if (k === 'Escape') {
      if (this.inst) { this._sfx('click'); this._closeInstaller(); }
      else if (this._compact && this._sheet) { this._openSheet(false); }
      else if (this.app && !this._tut()) this._closeApp();
      else this._close();
    } else if (!this.app) {
      if (enter) handled = false; // a focused app icon clicks itself
      else if (k.startsWith('Arrow')) this._deskMove(k);
      else handled = false;
    } else if (k === 'ArrowLeft') this._move(-1, 0);
    else if (k === 'ArrowRight') this._move(1, 0);
    else if (k === 'ArrowUp') this._move(0, -1);
    else if (k === 'ArrowDown') this._move(0, 1);
    else if (enter) { if (btn) handled = false; else if (this._canGo()) this._research(); }
    else if (k === 'Backspace' && !this._tut()) this._closeApp();
    else if (k === '+' || k === '=') this._zoomBy(1.25);
    else if (k === '-' || k === '_') this._zoomBy(1 / 1.25);
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  _deskMove(k) {
    const apps = this.branches.map((B) => B.app).filter(Boolean);
    let i = apps.indexOf(document.activeElement);
    if (i < 0) { apps[0]?.focus(); return; }
    const cols = Math.max(1, Math.round(this.$desk.clientWidth / (apps[0].offsetWidth || 100)));
    i += k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols : cols;
    apps[clamp(i, 0, apps.length - 1)]?.focus();
    this._sfx('hover');
  }

  // something modal waits for a key (the tutorial teacher's line, a speech bubble, a catch layer)
  _modalWaiting() {
    const G = this.o.game || (typeof window !== 'undefined' ? window.__game : null);
    try {
      if (G?.tutorial?.teacher?.waiting) return true;
      if (G?.ui?.bubbleWaiting?.()) return true;
    } catch { /* ignore */ }
    for (const el of document.querySelectorAll('.tt-catch, .tutorial, .tch-wait')) {
      if (el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') return true;
    }
    return false;
  }
  _canGo() {
    const n = this.sel;
    if (!n || !this.$go || this.$go.hidden || this.$go.disabled) return false;
    return !!this._check(n).ok;
  }
  _tut() {
    try { if (this.o.quiet?.()) return true; } catch { /* ignore */ }
    const G = this.o.game || (typeof window !== 'undefined' ? window.__game : null);
    try { return !!(G && G.tutorial?.active && !G.state?.tutorialDone); } catch { return false; }
  }
  _close() {
    this._sfx('click');
    try { this.o.onClose?.(); } catch (err) { console.error(err); }
  }

  _move(dx, dy) {
    const cur = this.sel;
    if (!cur || !this.app) return;
    let best = null, bs = Infinity;
    for (const n of this.app.nodes) {
      if (n === cur) continue;
      const ax = (n.x - cur.x) / COLW, ay = (n.y - cur.y) / ROWH;
      const along = ax * dx + ay * dy;
      if (along <= 0.01) continue;
      const s = along + Math.abs(ax * dy - ay * dx) * 2.2;
      if (s < bs) { bs = s; best = n; }
    }
    if (best) { this._select(best, { pan: true, sound: 'select' }); if (this.root.contains(document.activeElement)) best.el.focus({ preventScroll: true }); }
  }

  // ------------------------------------------------------------ sizes + camera (inside an app)
  _resize() {
    if (!this._alive) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (!w || !h) return;
    const compact = w < 700 || (w < 900 && h > w * 1.15);
    if (compact !== this._compact) { this._compact = compact; this.root.classList.toggle('is-compact', compact); if (!compact) this._openSheet(false); }
    this.root.classList.toggle('is-short', h < 640);
    this.root.classList.toggle('is-tiny', h < 460);
    // 1 art px per css px; bigger screens step up by whole pixels
    this._k = Math.max(1, Math.floor(Math.min(w / 1280, h / 720) + 0.02));
    this.root.style.setProperty('--k', this._k);
    const T = (h < 460 ? 8 : 16) * this._k;
    this.root.style.setProperty('--bz', `${T}px`);
    if (w !== this._mw || h !== this._mh) {
      this._mw = w; this._mh = h;
      const k = this._k;
      this._paintCv(this.$bez, WD.frame(Math.ceil(w / k), Math.ceil(h / k), { t: T / k, ramp: WD.WALNUT, seed: 21 }));
    }
    const tw = this.$task.clientWidth, th = this.$task.clientHeight;
    if (tw && th) this._paintCv(this.$taskBg, WD.plank(Math.ceil(tw / this._k), Math.ceil(th / this._k), { ramp: WD.WALNUT, seed: 5, grooveIn: 3 }));
    this._layoutDesk();
    if (this.app) this._sizeApp();
    else this.stage?.setView(this._rectOf(this.$area));
  }

  _rectOf(el) { const r = el?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; }

  _sizeApp(force) {
    const v = this.view, win = this.$win;
    if (!v || !win) return;
    const w = v.clientWidth, h = v.clientHeight;
    if (!w || !h) return;
    const ww = win.clientWidth, wh = win.clientHeight;
    if (force || ww !== this._winW || wh !== this._winH) {
      this._winW = ww; this._winH = wh;
      const k = this._k || 1;
      const top = this.$win.querySelector('.lt-wt').offsetHeight + 4;
      this._paintCv(this.$winBg, WD.frame(Math.ceil(ww / k), Math.ceil(wh / k), { t: 7, top: Math.round(top / k), ramp: rampFor(this.app.theme), seed: this.app.i * 5 + 1, plates: true }));
      const cw = this.$card.clientWidth, ch = this.$card.clientHeight;
      if (cw && ch) {
        this._paintCv(this.$cardBg, WD.paper(Math.ceil(cw / k), Math.ceil(ch / k), this.app.i + 3));
        if (this.stage?.ok) { // a window in the paper for the 3D inset
          const cr = this.$card.getBoundingClientRect(), ar = this.$cardArt.getBoundingClientRect();
          this.$cardBg.getContext('2d').clearRect(Math.round((ar.left - cr.left + 4) / k), Math.round((ar.top - cr.top + 4) / k), Math.round((ar.width - 8) / k), Math.round((ar.height - 8) / k));
        }
      }
    }
    this.stage?.setView(this._rectOf(v));
    if (!force && w === this._vw && h === this._vh) return;
    this._vw = w; this._vh = h;
    this._sizeTube();
    if (this.$cardTank) this._sizeFishTank();
    if (!force) this._fitApp(true);
  }

  // the space the tiles may use: fish tanks keep the top band as open water
  _room() {
    const vw = this.view?.clientWidth || 600, vh = this.view?.clientHeight || 400;
    const top = this.app?.tank ? Math.round(vh * (vh < 320 ? 0.1 : 0.22)) : 0;
    const sheet = this._compact && this._sheet ? (this.$card?.offsetHeight || 0) : 0;
    return { x0: 0, y0: top, x1: vw, y1: vh - sheet };
  }
  _minZ() {
    const B = this.app, r = this._room();
    if (!B) return MINZ;
    return clamp(Math.min((r.x1 - r.x0 - 20) / B.W, (r.y1 - r.y0 - 10) / B.H), 0.3, MINZ);
  }
  _clampCam(c) {
    const B = this.app, r = this._room();
    if (!B) return c;
    const ww = B.W * c.z, wh = B.H * c.z, rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    c.x = ww <= rw ? r.x0 + (rw - ww) / 2 : clamp(c.x, r.x1 - ww - 20, r.x0 + 20);
    c.y = wh <= rh ? r.y0 + (rh - wh) / 2 : clamp(c.y, r.y1 - wh - 10, r.y0 + 10);
    return c;
  }
  _applyCam() {
    if (!this.world) return;
    const c = this._clampCam(this.cam);
    this.world.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px) scale(${c.z})`;
    if (this.$tip.classList.contains('is-on') && this._tipNode) this._placeTip(this._tipNode);
  }
  _goTo(g) {
    this.goal = this._clampCam({ ...g });
    this._vel = null;
    if (REDUCED) { Object.assign(this.cam, this.goal); this.goal = null; this._applyCam(); }
  }
  _fitApp(instant) {
    const B = this.app;
    if (!B || !this.view) return;
    const r = this._room();
    const z = clamp(Math.min((r.x1 - r.x0 - 20) / B.W, (r.y1 - r.y0 - 6) / B.H, 1.15), this._minZ(), MAXZ);
    const g = { z, x: r.x0 + (r.x1 - r.x0 - B.W * z) / 2, y: r.y0 + (r.y1 - r.y0 - B.H * z) / 2 };
    if (instant) { Object.assign(this.cam, this._clampCam(g)); this.goal = null; this._applyCam(); } else this._goTo(g);
  }
  _zoomAt(sx, sy, f) {
    const z0 = this.cam.z, z = clamp(z0 * f, this._minZ(), MAXZ);
    if (z === z0) return;
    this.cam.x = sx - (sx - this.cam.x) * (z / z0);
    this.cam.y = sy - (sy - this.cam.y) * (z / z0);
    this.cam.z = z;
    this._applyCam();
  }
  _zoomBy(f) {
    if (!this.view) return;
    const vw = this.view.clientWidth, vh = this.view.clientHeight;
    const z = clamp(this.cam.z * f, this._minZ(), MAXZ);
    const wx = (vw / 2 - this.cam.x) / this.cam.z, wy = (vh / 2 - this.cam.y) / this.cam.z;
    this._goTo({ x: vw / 2 - wx * z, y: vh / 2 - wy * z, z });
  }
  _ensureVisible(n, instant) {
    if (!this.view) return;
    const c = this.goal || this.cam, r = this._room();
    const sx = n.x * c.z + c.x, sy = n.y * c.z + c.y;
    const mx = Math.min(90, (r.x1 - r.x0) / 3), my = Math.min(70, (r.y1 - r.y0) / 3);
    let { x, y } = c;
    if (sx < r.x0 + mx) x += r.x0 + mx - sx; else if (sx > r.x1 - mx) x -= sx - (r.x1 - mx);
    if (sy < r.y0 + my) y += r.y0 + my - sy; else if (sy > r.y1 - my) y -= sy - (r.y1 - my);
    if (x === c.x && y === c.y) return;
    if (instant) { this.cam.x = x; this.cam.y = y; this._applyCam(); } else this._goTo({ x, y, z: c.z });
  }
  _openSheet(open) {
    if (!this._compact) open = false;
    if (this._sheet === open) return;
    this._sheet = open;
    this.root.classList.toggle('is-sheet', open);
    if (open) this._later(() => { if (this.sel) this._ensureVisible(this.sel); }, 260);
  }

  // ------------------------------------------------------------ selection + the project card
  _select(n, { pan = true, sound = false } = {}) {
    if (!n || !n.el) return;
    const same = n === this.sel;
    if (this.sel?.el) { this.sel.el.classList.remove('is-sel'); this.sel.el.tabIndex = -1; }
    this.sel = n;
    n.el.classList.add('is-sel');
    n.el.tabIndex = 0;
    this.$ret.style.transform = `translate(${n.x - TILE / 2 - 10}px, ${n.y - TILE / 2 - 10}px)`;
    this.$ret.classList.add('is-on');
    if (sound) this._sfx(sound);
    if (!same) { this._renderCard(); if (!REDUCED) this._fx(this.$card, 'is-swap', 260); }
    if (this.stage?.ok) {
      if (n.B.tank) this.stage.focusSpecies(n.d.species || null);
      else this.stage.lean((n.x) / n.B.W, n.y / n.B.H);
    }
    if (pan) this._ensureVisible(n);
  }

  _buildCard() {
    this.$card.innerHTML = `
      <canvas class="lt-card-bg" aria-hidden="true"></canvas>
      <button class="lt-card-x" type="button" aria-label="Close card">${G_X}</button>
      <div class="lt-card-art" style="${this._brassFrame()}"><canvas class="lt-card-tank" hidden></canvas><canvas class="lt-card-prev" hidden></canvas><span class="lt-card-st"></span><span class="lt-card-g"></span></div>
      <div class="lt-card-s">
        <h2 class="lt-card-nm"></h2>
        <div class="lt-card-sp"></div>
        <div class="lt-card-meta"></div>
        <div class="lt-card-stats"></div>
        <ul class="lt-card-unl"></ul>
        <ul class="lt-card-req"></ul>
        <p class="lt-card-desc"></p>
        <div class="lt-card-kids"></div>
      </div>
      <div class="lt-act">
        <div class="lt-work" hidden><div class="lt-tubebox"><canvas class="lt-tube"></canvas><span class="lt-tube-p">0%</span><span class="lt-tube-t"></span></div></div>
        <button class="lt-go" type="button"><span class="lt-go-l"></span><span class="lt-go-s"></span></button>
        <div class="lt-rush" hidden>
          <button type="button" class="lt-rbtn" data-rush="half"><span class="lt-rbtn-l">${G_BOLT}-50%</span><span class="lt-rbtn-p">${G_COIN}<b></b></span></button>
          <button type="button" class="lt-rbtn is-now" data-rush="now"><span class="lt-rbtn-l">${G_FF}NOW</span><span class="lt-rbtn-p">${G_COIN}<b></b></span></button>
        </div>
      </div>`;
    const $ = (s) => this.$card.querySelector(s);
    this.$cardBg = $('.lt-card-bg');
    this.$cardArt = $('.lt-card-art');
    this.$cardSt = $('.lt-card-st');
    this.$cardG = $('.lt-card-g');
    this.$cardTank = $('.lt-card-tank');
    this.$cardSp = $('.lt-card-sp');
    this.$cardStats = $('.lt-card-stats');
    this.ftank = new FishTank(this.$cardTank, (sp, f) => this._fishFrame(sp, f));
    this.$cardPrev = $('.lt-card-prev');
    const G = this.o.game || (typeof window !== 'undefined' ? window.__game : null);
    this.prev = new Preview(this.$cardPrev, G, (name, sc) => {
      if (!name || FACE3D.test?.(name) || !hasSprite(name)) name = 'flask';
      try { return hasSprite(name) ? spriteCanvas(name, sc) : null; } catch { return null; }
    });
    this.$cardNm = $('.lt-card-nm');
    this.$cardMeta = $('.lt-card-meta');
    this.$cardUnl = $('.lt-card-unl');
    this.$cardReq = $('.lt-card-req');
    this.$cardDesc = $('.lt-card-desc');
    this.$cardKids = $('.lt-card-kids');
    this.$work = $('.lt-work');
    this.$tube = $('.lt-tube');
    this.$tubeP = $('.lt-tube-p');
    this.$tubeT = $('.lt-tube-t');
    this.$go = $('.lt-go');
    this.$goL = $('.lt-go-l');
    this.$goS = $('.lt-go-s');
    this.$rush = $('.lt-rush');
    this.$rushB = [...this.$card.querySelectorAll('.lt-rbtn')].map((el) => ({ el, mode: el.dataset.rush, p: el.querySelector('.lt-rbtn-p b') }));
    this.tube = new Tube(this.$tube, { cssPx: 2, h: 12 });
    this._sizedTube = 0;
    this._on(this.$card.querySelector('.lt-card-x'), 'click', () => { this._sfx('click'); this._openSheet(false); });
  }

  _sizeTube() {
    const w = this.$work?.clientWidth;
    if (w && w !== this._sizedTube) { this._sizedTube = w; this.tube.fit(w - 12); }
  }

  _renderCard() {
    const n = this.sel;
    if (!n || !this.$card) return;
    const st = this._st.get(n.id), d = n.d;
    this.$card.dataset.state = st;
    this.$cardSt.textContent = st === 'avail' ? 'READY' : st === 'run' ? 'RESEARCHING' : st === 'done' ? 'DONE' : st === 'zone' ? 'NEEDS A FRIEND' : 'LOCKED';
    this.$cardSt.className = `lt-card-st st-${st}`;
    const dark = st === 'locked' || st === 'zone';
    const fish = !!(d.species && this._fishFrame(d.species, 0));
    this.$cardArt.classList.toggle('is-fish', fish);
    this.$cardArt.classList.add('is-live');
    this.$cardG.hidden = true;
    const in3d = !!this.stage?.ok;
    this.$cardArt.classList.toggle('is-3d', in3d);
    if (in3d) {
      this.$cardTank.hidden = true;
      this.$cardPrev.hidden = true;
      this.stage.setInset(d.species ? { kind: 'fish', sp: d.species, dark } : this._previewSpec(d));
      this.stage.setInsetRect(this._insetRect());
    } else {
      this.$cardTank.hidden = !fish;
      this.$cardPrev.hidden = fish;
      this._sizeFishTank();
      if (fish) this.ftank.set(d.species, { dark });
      else this.prev.show(this._previewSpec(d), dark);
    }
    this.$cardArt.classList.toggle('is-dark', dark);
    this.$cardNm.textContent = d.name || n.id;
    this._renderSpecies(n, st);
    const sp = this._speed();
    this.$cardMeta.innerHTML = (this._timed() && n.time ? `<span class="lt-chip-t">${G_CLOCK}<b>${fmtDur(n.time / sp)}</b></span>` : '') + '<span class="lt-chip-f">FREE</span>' + (sp !== 1 ? `<span class="lt-chip-s">x${sp.toFixed(2).replace(/\.?0+$/, '')}</span>` : '');
    const items = this._unlockItems(d).filter((it) => !(fish && it.fish));
    this.$cardUnl.hidden = fish && !items.length;
    this.$cardUnl.innerHTML = items.length ? items.map((it) => `<li class="${it.fish ? 'is-fish' : ''}"><span class="lt-art">${it.art}</span><span class="lt-unl-t"><b>${esc(it.name)}</b><small>${esc(it.kind)}</small></span></li>`).join('') : '<li class="is-none"><span class="lt-unl-t"><b>Know-how</b><small>opens the next research</small></span></li>';
    let reqs = '';
    if (st === 'locked' || st === 'zone') {
      for (const r of n.req) {
        const p = this.byId.get(r), ok = this._isRes(r);
        if (ok) continue;
        reqs += `<li class="bad"${p ? ` data-goto="${esc(r)}" role="button"` : ''}>${G_CROSS}<span class="lt-art sm">${p ? this._nodeArt(p, 22) : ''}</span><span>${esc(p?.d.name || human(r))}${p && p.B !== n.B ? ` <em>(${esc(p.B.short)})</em>` : ''}</span></li>`;
      }
      if (n.zone && !this._zoneOpen(n.zone)) reqs += `<li class="bad">${G_CROSS}<span class="lt-art sm">${G_PAW}</span><span>Meet ${esc(this._zoneName(n.zone))}</span></li>`;
    }
    this.$cardReq.innerHTML = reqs;
    this.$cardReq.hidden = !reqs;
    this.$cardDesc.innerHTML = esc(d.desc || '');
    const kids = n.kids.filter((k) => k.B === n.B);
    this.$cardKids.innerHTML = kids.length ? `<span class="lt-kids-l">Next</span>${kids.map((k) => `<button type="button" class="lt-kid st-${this._st.get(k.id)}" data-goto="${esc(k.id)}" title="${esc(k.d.name)}">${this._nodeArt(k, 24)}</button>`).join('')}` : '';
    this._renderAct();
  }

  // [v33 lab4] the fish card: species, Latin name, rarity stars and the real game numbers
  _renderSpecies(n, st) {
    const sp = n.d.species ? SPECIES_DATA.SPECIES_BY_ID?.[n.d.species] : null;
    this.$cardSp.hidden = !sp;
    this.$cardStats.hidden = !sp;
    if (!sp) { this.$cardSp.innerHTML = ''; this.$cardStats.innerHTML = ''; return; }
    const tier = Math.max(0, Math.min(4, sp.tier | 0));
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i <= tier ? GL.star : GL.nostar;
    const RAR = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
    this.$cardSp.innerHTML = `<i class="lt-latin">${esc(sp.latin || '')}</i><span class="lt-stars" title="${RAR[tier]}">${stars}<small>${RAR[tier]}</small></span>`;
    const x = (v) => `x${Number(v).toFixed(2).replace(/\.?0+$/, '')}`;
    const cell = (ic, val, lab, tip) => `<span class="lt-stat" title="${esc(tip)}">${ic}<b>${esc(val)}</b><small>${esc(lab)}</small></span>`;
    let h = '';
    if (sp.price != null) h += cell(G_COIN, String(sp.price), 'eggs', 'Egg price in the shop');
    if (sp.meal != null) h += cell(GL.meal, x(sp.meal), 'meal', 'How filling a bear finds it');
    if (sp.value != null) h += cell(GL.gem, x(sp.value), 'value', 'What bears pay for it');
    if (sp.size != null) h += cell(GL.size, `${Math.round(sp.size * 100)}%`, 'size', 'Adult size');
    if (sp.breed != null) h += cell(GL.heart, x(sp.breed), 'breeds', 'Breeding speed');
    if (sp.growth != null) h += cell(GL.grow, x(sp.growth), 'grows', 'Growth speed');
    if (Array.isArray(sp.parents) && sp.parents.length) {
      const P = sp.parents.map((q) => SPECIES_DATA.SPECIES_BY_ID?.[q]?.name || human(q));
      h += `<span class="lt-stat is-wide" title="A hybrid">${GL.cross}<b>${esc(P.join(' x '))}</b><small>cross</small></span>`;
    }
    this.$cardStats.innerHTML = h;
  }

  // the game's own brass slot frame (src/ui/frames.js) round the card's window, no fill (the 3D shows through)
  _brassFrame() {
    let u = '';
    try { u = frameURL('slot_brass', 1); } catch { u = ''; }
    return u ? `border:8px solid transparent;border-image:url(${u}) 8 / 8px / 0 stretch;image-rendering:pixelated` : '';
  }

  // the card window's rect on screen (inside the brass), for the 3D inset
  _insetRect() {
    const a = this.$cardArt;
    if (!a || !a.isConnected) return null;
    if (this._compact && !this._sheet) return null;
    const r = a.getBoundingClientRect();
    return { x: r.left + 8, y: r.top + 8, w: r.width - 16, h: r.height - 16 };
  }

  _sizeFishTank() {
    const w = this.$cardArt.clientWidth, h = this.$cardArt.clientHeight;
    if (w && h) { this.ftank.fit(w, h); this.prev?.fit(w, h); }
  }

  // [v33 lab4] what the card's preview shows: a crop growing, a building on its island, or the icon
  _previewSpec(d) {
    const builds = [].concat(d.build || []).filter(Boolean);
    const b0 = builds[0], S = b0 ? STRUCT_DATA.STRUCTURES?.[b0] : null;
    if (b0 && (S?.crop || stagesFor(b0))) return { kind: 'crop', id: b0 };
    if (S) return { kind: 'build', id: b0, icon: S.icon || d.icon };
    return { kind: 'icon', name: d.icon };
  }

  _working(n) { return !!n && ((this._finish && this._finish.id === n.id) || this._st.get(n.id) === 'run'); }

  _renderAct() {
    const n = this.sel, b = this.$go;
    if (!n || !b) return;
    const st = this._st.get(n.id);
    const work = this._working(n);
    if (work !== this._isWorking) { this._isWorking = work; this.$work.hidden = !work; if (work) this._later(() => this._sizeTube(), 0); }
    this.$rush.hidden = !(st === 'run' && this._rushOK());
    b.className = 'lt-go';
    b.hidden = work;
    if (work) { b.disabled = true; this._liveAct(); return; }
    if (st === 'done') { b.disabled = true; b.classList.add('is-done'); this.$goL.innerHTML = `${G_CHECK} RESEARCHED`; this.$goS.textContent = ''; return; }
    const chk = this._check(n);
    b.disabled = !chk.ok;
    if (chk.ok) { b.classList.add('is-go'); this.$goL.textContent = 'RESEARCH'; this.$goS.textContent = this._timed() && n.time ? `free, ${fmtDur(n.time / this._speed())}` : 'instant'; return; }
    b.classList.add('is-no');
    const busy = /bench busy/i.test(chk.reason || '');
    if (busy) b.classList.add('is-busy');
    this.$goL.innerHTML = st === 'locked' ? `${G_LOCK} LOCKED` : st === 'zone' ? `${G_PAW} NEEDS A FRIEND` : busy ? 'BENCH BUSY' : 'RESEARCH';
    this.$goS.textContent = busy ? this._busyText() : String(chk.reason || '');
  }

  _busyText() {
    if (!this._jobs.length) return 'Lab bench busy';
    const j = this._jobs.reduce((a, b) => (b.left < a.left ? b : a));
    return `free in ${fmtClock(j.left)}`;
  }

  _liveAct() {
    const n = this.sel;
    if (!n || !this.$go) return;
    const st = this._st.get(n.id);
    if (this._finish && this._finish.id === n.id) {
      if (this.$tubeP.textContent !== 'DONE!') { this.$tubeP.textContent = 'DONE!'; this.$tubeT.textContent = ''; }
      this._tubeK = 1;
    } else if (st === 'run') {
      const j = this._job(n.id);
      const k = j ? j.k : 0;
      this._tubeK = k;
      const p = `${Math.floor(k * 100)}%`, l = `${fmtClock(j ? j.left : n.time)}`;
      if (this.$tubeP.textContent !== p) this.$tubeP.textContent = p;
      if (this.$tubeT.textContent !== l) this.$tubeT.textContent = l;
      if (!this.$rush.hidden) this._livePrices(this.$rushB, n.id);
    } else if (this.$go.classList.contains('is-busy')) { const t = this._busyText(); if (this.$goS.textContent !== t) this.$goS.textContent = t; }
  }

  _livePrices(list, id) {
    const coins = this._coins();
    for (const r of list) {
      const p = this._rushPrice(id, r.mode);
      const txt = p == null ? '-' : String(p);
      if (r.p.textContent !== txt) r.p.textContent = txt;
      const poor = p == null || (coins != null && coins < p);
      if (r.poor !== poor) { r.poor = poor; r.el.classList.toggle('is-poor', poor); }
    }
  }

  _showTip(n) {
    const st = this._st.get(n.id);
    let line = STATE_TEXT[st] || '';
    if (st === 'run') line = `${fmtClock(this._job(n.id)?.left ?? 0)} left`;
    else if (st === 'zone') line = `Meet ${this._zoneName(n.zone)}`;
    else if (st === 'avail') line = this._timed() && n.time ? `Ready! ${fmtDur(n.time / this._speed())}` : 'Ready!';
    const items = st === 'locked' ? [] : this._unlockItems(n.d).slice(0, 4);
    const unl = items.length ? `<span class="lt-tip-u">${items.map((it) => `<span class="lt-art sm">${it.art}</span>`).join('')}</span>` : '';
    this.$tip.innerHTML = `<b>${esc(n.d.name)}</b><i class="st-${st}">${esc(line)}</i>${unl}`;
    this._tipNode = n;
    this._placeTip(n);
    this.$tip.classList.add('is-on');
  }
  _placeTip(n) {
    if (!n.el) return;
    const a = this.$area.getBoundingClientRect(), r = n.el.getBoundingClientRect();
    this.$tip.style.transform = `translate(${Math.round(r.left + r.width / 2 - a.left)}px, ${Math.round(r.top - a.top - 6)}px)`;
  }

  // ------------------------------------------------------------ the taskbar bench
  _renderBench() {
    if (!this.$slots) return;
    if (!this._timed()) { this.$slots.innerHTML = ''; return; }
    const slots = Math.max(this._slots(), this._jobs.length);
    if (this.$benchS) this.$benchS.textContent = `${this._jobs.length}/${this._slots()}`;
    const rush = this._rushOK();
    let h = '';
    for (let i = 0; i < slots; i++) {
      const j = this._jobs[i];
      if (j && j.n) {
        h += `<div class="lt-slotc is-job" data-job="${esc(j.id)}" style="--bc:${esc(j.n.B.color)}">
          <button type="button" class="lt-slotc-main" data-goto="${esc(j.id)}" title="${esc(j.n.d.name)}"><span class="lt-art">${this._nodeArt(j.n, 26)}</span><span class="lt-bar"><i></i></span><span class="lt-slotc-t">0:00</span></button>
          ${rush ? `<button type="button" class="lt-mini" data-rush="half" data-id="${esc(j.id)}" title="Rush: -50% time">${G_BOLT}<b></b></button><button type="button" class="lt-mini is-now" data-rush="now" data-id="${esc(j.id)}" title="Finish now">${G_FF}<b></b></button>` : ''}
        </div>`;
      } else if (j) h += `<div class="lt-slotc is-job" data-job="${esc(j.id)}"><span class="lt-bar"><i></i></span><span class="lt-slotc-t">0:00</span></div>`;
      else h += '<div class="lt-slotc is-empty" title="A free lab bench: start a research!"><span class="lt-plus">+</span></div>';
    }
    this.$slots.innerHTML = h;
    this._jobEls = [...this.$slots.querySelectorAll('[data-job]')].map((el) => ({
      el, id: el.dataset.job, bar: el.querySelector('.lt-bar i'), t: el.querySelector('.lt-slotc-t'),
      rush: [...el.querySelectorAll('[data-rush]')].map((b) => ({ el: b, mode: b.dataset.rush, p: b.querySelector('b') })),
    }));
    this._liveBench();
  }

  _liveBench() {
    for (const s of this._jobEls || []) {
      const j = this._job(s.id);
      if (!j) continue;
      const w = `scaleX(${j.k.toFixed(3)})`;
      if (s._w !== w) { s._w = w; s.bar.style.transform = w; }
      const txt = fmtClock(j.left);
      if (s.t.textContent !== txt) s.t.textContent = txt;
      if (s.rush.length) this._livePrices(s.rush, s.id);
    }
    for (const j of this._jobs) {
      const n = j.n;
      if (!n?.el) continue;
      const w = `scaleX(${j.k.toFixed(3)})`;
      if (n._nbw !== w) { n._nbw = w; n.$nbar.style.transform = w; }
      const txt = fmtClock(j.left);
      if (n._pillT !== txt) { n._pillT = txt; n.$pill.innerHTML = `<b>${txt}</b>`; n.$pill.hidden = false; }
    }
  }

  // ------------------------------------------------------------ research
  _research() {
    const n = this.sel;
    if (!n) return;
    const chk = this._check(n);
    if (!chk.ok) {
      this._sfx('error');
      this._fx(this.$go, 'is-shake', 400);
      this._fx(n.el, 'is-shake', 400);
      return;
    }
    let ok = false;
    try { ok = !!this.o.onResearch?.(n.id); } catch (err) { console.error(err); ok = false; }
    if (!this._alive) return;
    if (!ok) { this._sfx('error'); this._fx(this.$go, 'is-shake', 400); this.$goS.textContent = 'Could not start that research'; return; }
    this._fx(this.$go, 'is-press', 300);
    this._pollJobs(true);
    if (this._jobIds.has(n.id)) {
      this._sfx('start');
      this._fly(n);
      this._ring(n, 'start');
      this._float(n, 'STARTED!', 'start');
    }
    this.refresh();
    this._renderCard();
  }

  _rush(id, mode, src) {
    const n = this.byId.get(id);
    if (!n || !this._rushOK()) return;
    const price = this._rushPrice(id, mode);
    let res = null;
    try { res = this.o.onRush(id, mode); } catch (err) { console.error(err); res = null; }
    if (!this._alive) return;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res || !res.ok) { this._sfx('denied'); if (src) this._fx(src, 'is-shake', 400); this._flash(src, res?.msg || 'Not enough coins'); return; }
    this._sfx(mode === 'now' ? 'rushnow' : 'rush');
    this._coinsFly(n.el || src, Math.min(14, 4 + Math.round((price || 10) / 15)));
    if (n.el) { this._float(n, mode === 'now' ? 'DONE!' : '-50% TIME', mode); this._ring(n, 'warp'); this._fx(n.el, 'is-warp', 800); }
    const card = this.$slots.querySelector(`[data-job="${CSS.escape(id)}"]`);
    if (card) this._fx(card, 'is-boost', 700);
    this._bumpCoins();
    if (this.sel === n) this.tube?.splash(1.2);
    this._pollJobs(true);
    this.refresh();
    if (this.sel === n) this._renderCard();
  }

  _flash(src, msg) {
    if (!msg) return;
    const rr = this.$scr.getBoundingClientRect();
    const a = (src || this.$go || this.$scr).getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'lt-flash';
    el.textContent = msg;
    el.style.left = `${clamp(a.left + a.width / 2 - rr.left, 90, rr.width - 90)}px`;
    el.style.top = `${Math.max(30, a.top - rr.top - 6)}px`;
    this.$fxl.appendChild(el);
    this._later(() => el.remove(), 1600);
  }
  _float(n, text, kind) {
    if (!n.el) return;
    const el = document.createElement('span');
    el.className = `lt-float is-${kind}`;
    el.textContent = text;
    n.el.appendChild(el);
    this._later(() => el.remove(), 1400);
  }
  _coinsFly(to, count = 6) {
    if (REDUCED || !this.$coins || this.$coins.hidden) return;
    const rr = this.$scr.getBoundingClientRect(), a = this.$coins.getBoundingClientRect();
    const b = to?.getBoundingClientRect?.() || a;
    const ax = a.left + a.width * 0.3 - rr.left, ay = a.top + a.height / 2 - rr.top;
    const bx = b.left + b.width / 2 - rr.left, by = b.top + b.height / 2 - rr.top;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'lt-cfly';
      el.innerHTML = G_COIN;
      el.style.left = `${ax}px`; el.style.top = `${ay}px`;
      this.$fxl.appendChild(el);
      const jx = (Math.random() - 0.5) * 60, jy = -40 - Math.random() * 60;
      const an = el.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(bx - ax) * 0.35 + jx}px), calc(-50% + ${(by - ay) * 0.2 + jy}px)) scale(1.4)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${bx - ax}px), calc(-50% + ${by - ay}px)) scale(.7)`, opacity: 1 },
      ], { duration: 620 + i * 25, delay: i * 45, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'backwards' });
      an.onfinish = () => el.remove();
      this._later(() => el.remove(), 1400 + i * 50);
    }
  }
  _bumpCoins() { if (this.$coins) this._fx(this.$coins, 'is-spend', 600); }

  // the project's icon flies down into its bench slot on the taskbar
  _fly(n) {
    if (REDUCED || !n.el) return;
    const slot = this.$slots.querySelector(`[data-job="${CSS.escape(n.id)}"] .lt-art`) || this.$slots;
    const rr = this.$scr.getBoundingClientRect();
    const a = n.el.querySelector('.lt-ico').getBoundingClientRect(), b = slot.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const el = document.createElement('div');
    el.className = 'lt-flyart';
    el.innerHTML = this._nodeArt(n, 44);
    el.style.left = `${a.left + a.width / 2 - rr.left}px`;
    el.style.top = `${a.top + a.height / 2 - rr.top}px`;
    this.$fxl.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const an = el.animate([
      { transform: 'translate(-50%,-50%) scale(1)' },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.2 + Math.min(-60, dy * -0.35)}px)) scale(1.35)`, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)` },
    ], { duration: 650, easing: 'cubic-bezier(.4,0,.6,1)' });
    an.onfinish = () => { el.remove(); const card = this.$slots.querySelector(`[data-job="${CSS.escape(n.id)}"]`); if (card) this._fx(card, 'is-land', 500); };
    this._later(() => el.remove(), 900);
  }

  _ring(n, kind) {
    if (!n.el) return;
    let sp = n.el.querySelector('.lt-spk');
    if (!sp) { sp = document.createElement('span'); sp.className = 'lt-spk'; n.el.appendChild(sp); }
    const count = kind === 'done' ? 14 : 8;
    let h = `<i class="lt-wave ${kind}"></i>`;
    const R = rng(hashStr(n.id) ^ (now() | 0));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360 + R() * 20, dist = (kind === 'done' ? 70 : 50) + R() * 24;
      h += `<b style="--a:${a.toFixed(0)}deg;--d:${dist.toFixed(0)}px;--dl:${(R() * 80).toFixed(0)}ms" class="${kind}"></b>`;
    }
    sp.innerHTML = h;
    this._later(() => { if (sp.isConnected) sp.innerHTML = ''; }, 1100);
  }

  // pixel sparks around any element (screen fx layer)
  _spark(el, count) {
    if (REDUCED || !el) return;
    const rr = this.$scr.getBoundingClientRect(), r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - rr.left, cy = r.top + r.height / 2 - rr.top;
    const cols = ['#ff5a7a', '#ffd23f', '#5ccf6e', '#5fb8ff', '#b07bff'];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('i');
      s.className = 'lt-sp';
      const a = (i / count) * Math.PI * 2, d = 50 + Math.random() * 40;
      s.style.cssText = `left:${cx}px;top:${cy}px;--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px;--c:${cols[i % cols.length]}`;
      this.$fxl.appendChild(s);
      this._later(() => s.remove(), 900);
    }
  }

  _celebrate(n, prev) {
    if (n.el) {
      if (prev === 'run' && n === this.sel) {
        this._finish = { id: n.id };
        this.tube?.splash(1.5);
        this._sfx('foxyay');
        this._later(() => { if (this._finish?.id === n.id) { this._finish = null; this._renderCard(); } }, 2400);
      }
      this._ring(n, 'done');
      this._fx(n.el, 'is-burst', 1100);
      if (this.stage?.ok && n.B.tank && n.d.species) { this.stage.setFish(this._tankList(n.B)); this.stage.splash(n.d.species); }
    } else if (n.B.app) { this._fx(n.B.app, 'is-ping', 900); this._spark(n.B.app, 10); }
    this._sfx('done');
    if (prev === 'run' || prev === 'avail') this._toast(n);
    this._later(() => { if (n.kids.some((k) => this._st.get(k.id) === 'avail')) this._sfx('unlock'); }, 450);
  }

  _toast(n) {
    this._toasts.push(n);
    if (this._toastOn) return;
    const next = () => {
      const m = this._toasts.shift();
      if (!m || !this._alive) { this._toastOn = false; return; }
      this._toastOn = true;
      let html = m.html;
      if (!html) {
        const items = this._unlockItems(m.d).slice(0, 3);
        const fresh = m.kids.filter((k) => this._st.get(k.id) === 'avail');
        html = `<div class="lt-toast-c" style="--bc:${esc(m.B.color)}">${CONFETTI}
          <span class="lt-toast-k">${G_STAR}RESEARCH DONE!${G_STAR}</span>
          <div class="lt-toast-r"><span class="lt-art">${this._nodeArt(m, 44)}</span><b>${esc(m.d.name)}</b></div>
          ${items.length ? `<div class="lt-toast-u">${items.map((it) => `<span><span class="lt-art sm">${it.art}</span>${esc(it.name)}</span>`).join('')}</div>` : ''}
          ${fresh.length ? `<div class="lt-toast-n">Next up: ${fresh.slice(0, 3).map((k) => esc(k.d.name)).join(', ')}${fresh.length > 3 ? '...' : ''}</div>` : ''}
        </div>`;
      }
      this.$toast.innerHTML = html;
      this.$toast.classList.remove('is-on');
      void this.$toast.offsetWidth;
      this.$toast.classList.add('is-on');
      this._later(() => { this.$toast.classList.remove('is-on'); this._later(next, 320); }, 2800);
    };
    next();
  }

  _surge(e) {
    const p = e.els?.[1];
    if (!p || REDUCED || typeof p.getTotalLength !== 'function') return;
    let L = 0;
    try { L = p.getTotalLength(); } catch { L = 0; }
    if (!L) return;
    p.style.strokeDasharray = `${L} ${L}`;
    p.style.strokeDashoffset = `${L}`;
    void p.getBoundingClientRect();
    p.style.transition = 'stroke-dashoffset .8s steps(10)';
    p.style.strokeDashoffset = '0';
    this._later(() => { p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }, 900);
  }

  // the fish of a tank: every researched species of this topic swims
  _tankList(B) { return B.nodes.filter((n) => n.d.species && this._st.get(n.id) === 'done').map((n) => n.d.species); }
  _tankFish() { if (this.app?.tank && this.stage?.ok) this.stage.setFish(this._tankList(this.app)); }

  _onFish(m) {
    if (!this._alive || !m || typeof m.fishCanvas !== 'function' || this.o.fishCanvas) return;
    this._fish = m;
    this._fishFrames.clear();
    FISH_URLS.clear();
    if (this.app) { const B = this.app; this._closeApp(true); this._openApp(B, { instant: true }); }
    this._renderBench();
  }

  // ------------------------------------------------------------ loop
  _loop = (t) => {
    if (!this._alive) return;
    this._raf = requestAnimationFrame(this._loop);
    t = t || now();
    const dtms = Math.min(50, t - (this._lastFrame || t));
    this._lastFrame = t;
    if (this.goal) {
      const g = this.goal, k = 1 - Math.exp(-dtms / 90);
      this.cam.x += (g.x - this.cam.x) * k;
      this.cam.y += (g.y - this.cam.y) * k;
      this.cam.z += (g.z - this.cam.z) * k;
      if (Math.abs(g.x - this.cam.x) < 0.5 && Math.abs(g.y - this.cam.y) < 0.5 && Math.abs(g.z - this.cam.z) < 0.002) { Object.assign(this.cam, g); this.goal = null; }
      this._applyCam();
    } else if (this._vel && !this._drag) {
      this.cam.x += this._vel.x * dtms;
      this.cam.y += this._vel.y * dtms;
      const f = Math.pow(0.93, dtms / 16);
      this._vel.x *= f; this._vel.y *= f;
      if (Math.hypot(this._vel.x, this._vel.y) < 0.02) this._vel = null;
      this._applyCam();
    }
    const changed = this._pollJobs(false);
    this._liveBench();
    if (changed || t - this._lastPoll > 400) { this._lastPoll = t; this.refresh(); }
    if (this.app) this._liveAct();
    const coins = this._coins();
    if (coins !== this._lastCoins && this.$coinsV) { this.$coinsV.textContent = coins == null ? '-' : Math.floor(coins).toLocaleString('en-US'); this._lastCoins = coins; }
    if (document.hidden) return;
    // the tube under a running project (~20 fps)
    if (this._isWorking && this.tube && t - (this._lastTube || 0) >= 50) {
      const dt = clamp((t - (this._lastTube || t)) / 1000, 1 / 60, 0.1);
      this._lastTube = t;
      this.tube.draw((t - this._t0) / 1000, this._tubeK ?? 0, { done: !!(this.sel && this._finish?.id === this.sel.id), dt });
    }
    if (this.app) {
      this._animTiles(t);
      if (this.stage?.inset) this.stage.setInsetRect(this._insetRect());
      // the card's fish tank (~12 fps, only while a fish card is up)
      if (this.$cardTank && t - (this._ftT || 0) >= 66) {
        const dt = clamp((t - (this._ftT || t)) / 1000, 1 / 60, 0.12);
        this._ftT = t;
        if (!this.$cardTank.hidden) this.ftank.draw((t - this._t0) / 1000, dt);
        else if (!this.$cardPrev.hidden) { try { this.prev.draw((t - this._t0) / 1000, dt); } catch (e) { console.warn('lab preview', e); this.$cardPrev.hidden = true; } }
      }
    }
    // the 3D behind the screen (it caps its own rate, and only renders what is on show)
    if (this.stage?.ok && this.root.offsetParent !== null) this.stage.tick(dtms / 1000, t / 1000);
  };
}
