// LabTree: Reynard's research skill tree, shown on the lab computer.
//
// v31 "green phosphor desktop": the lab is a beloved old green-phosphor terminal in an
// olive-enamel case with brass trim (no neon: hard pixel edges, flat bands, dither, hard
// offset shadows; panels and keycaps are 9-slice pixel frames, src/ui/lab/deskArt.js).
// It opens on a DESKTOP: one pixel-art folder per research branch (tinted per branch,
// its icon on a label sticker, a done/total tag, padlocked when the section is still
// encrypted), a beige computer for "All projects" and an in-tray for "Ready". Opening a
// folder plays the zoom-rect "open window" animation and shows just that branch's tree;
// the path bar (C:\LAB\SUNFISH_BASS\) and the back key / Esc / Backspace go back to the
// desktop. "Ready" opens an inbox list of everything you can research right now. During
// the tutorial (or via tree.select(id)) it opens straight into the tree, so the tutorial's
// selectors are on screen at once.
// Inside a folder: the node tree with pipes, zoom/pan, a detail panel with the unlock art,
// names, time, requirements and a big RESEARCH key, the bench bar of running jobs. While
// a job runs the detail panel shows Reynard at his lab computer (a real 3D render of his
// rig, src/ui/lab/workbench.js) above a GREEN LIQUID progress tube (src/ui/lab/tube.js).
//
// Research is FREE but TIMED: picking a node puts it on a lab "bench" and it
// finishes after `time` seconds of game time. Running jobs can be rushed with
// coins; tree sections (= branches) can be locked behind a section key.
//
//   const tree = new LabTree(container, {
//     research, branches,                // data (src/data/research.js)
//     isResearched: (id) => bool,
//     canResearch: (id) => ({ ok, reason }),
//     onResearch: (id) => bool,          // = game.startResearch (or instant game.research)
//     jobs: () => [{ id, k, left, time }],  // running jobs (optional: no jobs => instant research)
//     slots: () => number,               // lab benches (default 1)
//     zoneName: (zid) => 'Dale',         // neighbour that opens a zone
//     isZoneOpen: (zid) => bool,
//     icon: (name, scale) => '<img ...>' or '',
//     fishCanvas?: (species, { frame, scale }) => canvas,
//     preview?: (node, canvas, t) => bool,  // custom showcase drawing
//     sfx?: (name) => void,              // hover click select filter error start done unlock zoom
//                                        // rush rushnow decrypt denied fox foxyay sector open off pop
//     onClose,
//     coins?: () => number,              // shown in the header, buys rushes + section keys
//     speed?: () => number,              // research speed multiplier (readout)
//     rushPrice?: (id, mode) => number,  // mode 'half' (-50% time left) | 'now' (finish)
//     onRush?: (id, mode) => ({ ok, msg }),
//     sections?: { isOpen(b), key(b) => { needs:[{kind,ok,text,id}], coins, ready, canUnlock, demo? }, unlock(b) => ({ ok, msg }) },
//     quiet?: () => bool,                // (kept for callers; nobody talks on the tree now)
//     game?,                             // a Game: supplies coins/speed/rush/sections
//   });
//   tree.refresh(); tree.select(id); tree.destroy();
//
// Stable hooks for the tutorial (src/game/Tutorial.js LAB_SEL): `.lt-node[data-id]`,
// `.lt-go`, `.lt-bench`, `.lt-slotc[data-job]`; body.lt-pc while a tree is on screen.
// While the tutorial runs the tree opens on "All projects" (not the desktop) and the way
// back to the desktop is hidden, so those hooks are always visible and clickable.
// [v26 demo] a demo build marks full-game nodes `d.demoLock` and full-game sections `key.demo`.
//
// The container should be a positioned element with a size; the tree fills it.
import './labtree.css';
import * as SPECIES_DATA from '../data/species.js';
import * as STRUCT_DATA from '../data/structures.js';
import { crispScale } from './uiScale.js';
import { faceImg } from './faces3d.js';
import { Workbench } from './lab/workbench.js';
import { Tube } from './lab/tube.js';
import * as ART from './lab/deskArt.js';

// fish art is optional (import.meta.glob keeps the build working without it)
const OPTIONAL = import.meta.glob('../art/fishArt.js');
let fishMod = null;
function loadFish() {
  if (!fishMod) {
    const k = '../art/fishArt.js';
    fishMod = OPTIONAL[k] ? OPTIONAL[k]().catch(() => null) : Promise.resolve(null);
  }
  return fishMod;
}

// ---------------------------------------------------------------- layout
const NODE = 64; // node slot size (32 art px at 2x)
const COLW = 168; // column pitch
const ROWH = 170; // lane pitch
const NODE_DY = 80; // node centre below the lane top
const LANE_DY = 4; // horizontal pipe lane below the lane top
const PADL = 44;
const PADT = 12;
const PADR = 70;
const PADB = 20;
const WELL = 40; // icon area inside a slot
const MINZ = 0.3;
const MAXZ = 1.8;
const PW = 150; // showcase canvas (shown scaled up)
const PH = 70;

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

// [v31 lab] a branch name as a DOS-ish folder name: "Big & Ancient Fish" -> BIG_ANCIENT_FISH
function dosName(s) {
  const w = String(s || '').toUpperCase().replace(/['\u2019]/g, '').split(/[^A-Z0-9]+/).filter(Boolean);
  return (w.join('_') || 'FOLDER').slice(0, 18);
}

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

// ---------------------------------------------------------------- pixel art
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 32x32 ornate icon slot: rounded metal ring lit from the top left, dark
// bevel, scroll ornaments in the corners, a status gem on top and a dark well.
const SLOT_PALS = {
  gold: { k: '#1c1006', h: '#fff8c8', g: '#ffc936', a: '#d8901a', s: '#a0600e', i: '#3c2406', y: '#ffffff', o: '#5c3206', e: '#5dff8f', E: '#e6ffee', w: '#2a2410', v: '#241e0c' },
  brass: { k: '#150b04', h: '#eec38a', g: '#b87c3a', a: '#8a5528', s: '#5e3719', i: '#241306', y: '#ffe2b4', o: '#3e220c', e: '#7cf29e', E: '#e8fff0', w: '#0c2414', v: '#0a1f11' },
  phos: { k: '#03140a', h: '#d0ffd8', g: '#6fe08e', a: '#3fb866', s: '#1f7d3d', i: '#06200f', y: '#ffffff', o: '#0e4a22', e: '#ffc04a', E: '#fff0c0', w: '#0a2a14', v: '#08240f' },
  iron: { k: '#030604', h: '#66766a', g: '#43504a', a: '#333e38', s: '#222a26', i: '#0a0e0b', y: '#84948a', o: '#141a16', e: '#5a2a18', E: '#8a4a2a', w: '#0e1610', v: '#0b120d' },
  ember: { k: '#080602', h: '#b0a270', g: '#766a44', a: '#5e5636', s: '#3c3622', i: '#0e0c06', y: '#d0c090', o: '#201c0e', e: '#ffb040', E: '#ffe6b0', w: '#16140c', v: '#12100a' },
};
const CORNER = [
  '..kkkkk',
  '.kyyyyH',
  'kyoooyg',
  'kyoyyog',
  'kyoyo..',
  'kyyo...',
  'kVgg...',
];
function slotCanvas(p) {
  const S = 32;
  const cv = makeCanvas(S, S);
  const c = cv.getContext('2d');
  const put = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ex = Math.min(x, S - 1 - x), ey = Math.min(y, S - 1 - y);
      if (ex + ey < 2) continue;
      const d = Math.min(ex, ey);
      const top = y === d && y <= S - 1 - y, left = x === d && x <= S - 1 - x;
      let col;
      if (d === 0 || ex + ey === 2) col = p.k;
      else if (d === 1) col = top || left ? p.h : p.s;
      else if (d === 2) col = p.g;
      else if (d === 3) col = top || left ? p.a : p.g;
      else if (d === 4) col = p.i;
      else col = y % 2 ? p.v : p.w;
      put(x, y, col);
    }
  }
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    CORNER.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        let ch = row[x];
        if (ch === '.') continue;
        if (ch === 'H') ch = fy ? 's' : 'h';
        else if (ch === 'V') ch = fx ? 's' : 'h';
        put(fx ? S - 1 - x : x, fy ? S - 1 - y : y, p[ch]);
      }
    });
  }
  const GEM = ['.kkkk.', 'kEeeek', 'keeeek', '.kkkk.'];
  const gx = S / 2 - 3;
  GEM.forEach((row, y) => { for (let x = 0; x < 6; x++) if (row[x] !== '.') put(gx + x, y, p[row[x]]); });
  const m = S / 2;
  for (const [x, y] of [[m - 1, S - 3], [m, S - 3], [2, m - 1], [2, m], [S - 3, m - 1], [S - 3, m]]) put(x, y, p.o);
  for (const [x, y] of [[m - 1, S - 2], [2, m - 2], [S - 3, m - 2]]) put(x, y, p.y);
  return cv;
}

// the slot frames as data URLs, pre-scaled (nearest) to the device px a 64 css px slot covers,
// so the browser shows them 1:1 at zoom 1 (iPad Safari smooths scaled backgrounds)
let SLOT_URLS = null;
function slotURLs() {
  const u = Math.max(1, Math.round(2 * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)));
  if (SLOT_URLS && SLOT_URLS.u === u) return SLOT_URLS.map;
  const map = {};
  for (const [k, p] of Object.entries(SLOT_PALS)) {
    const src = slotCanvas(p);
    const c = makeCanvas(src.width * u, src.height * u);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0, c.width, c.height);
    map[k] = c.toDataURL();
  }
  SLOT_URLS = { u, map };
  return map;
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
  return `<svg class="${cls}" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
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
const G_CHECK = pixSVG(['......k', '.....kg', 'k...kg.', 'gk.kg..', '.gkg...', '..g....'], { k: '#2a8a3a', g: '#7dffa8' }, 2, 'lt-g');
const G_CROSS = pixSVG(['r...r', '.r.r.', '..r..', '.r.r.', 'r...r'], { r: '#e8774a' }, 2, 'lt-g');
const G_CLOCK = pixSVG(['.kkkk.', 'kwwkwk', 'kwwkwk', 'kwwkkk', 'kwwwwk', '.kkkk.'], { k: '#2b2a24', w: '#fff1c8' }, 2, 'lt-g');
const G_LOCK = pixSVG(['.kkk.', 'k...k', 'k...k', 'kkkkk', 'kgggk', 'kgkgk', 'kgggk', 'kkkkk'], { k: '#1a1410', g: '#ffd23f' }, 2, 'lt-g');
const G_PAW = pixSVG(['.k.k.', 'k.k.k', '.....', '.kkk.', 'kkkkk', '.kkk.'], { k: '#ffb060' }, 2, 'lt-g');
const G_BOLT = pixSVG(['...kk', '..kk.', '.kkkk', 'kkkk.', '..kk.', '.kk..', '.k...'], { k: '#2a1a04' }, 2, 'lt-g');
const G_FF = pixSVG(['k..k...', 'kk.kk..', 'kkkkkk.', 'kkkkkkk', 'kkkkkk.', 'kk.kk..', 'k..k...'], { k: '#2a1600' }, 2, 'lt-g');
const G_COIN = pixSVG(['.kkkk.', 'kyyyyk', 'kyhyyk', 'kyhyyk', 'kyyyyk', '.kkkk.'], { k: '#8a5a00', y: '#ffd23f', h: '#fff6c0' }, 2, 'lt-g lt-coin');
const G_KEY = pixSVG(['.kkk.....', 'k...k....', 'k...kkkkk', 'k...k.k.k', '.kkk.....'], { k: '#7dffa8' }, 2, 'lt-g');
const G_SEAL = pixSVG(['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kgggggrk', 'kgggggrk', 'kggkkgrk', 'kggkkgrk', 'kgggggrk', 'kkkkkkkk'], { k: '#1a1004', g: '#e0a838', r: '#8a5a14' }, 4, 'lt-g lt-sealg');
const G_FIT = pixSVG(['kk.kk', 'k...k', '.....', 'k...k', 'kk.kk'], { k: '#141408' }, 3, 'lt-g');

const G_PLUS = pixSVG(['..k..', '..k..', 'kkkkk', '..k..', '..k..'], { k: '#141408' }, 3, 'lt-g');
const G_MINUS = pixSVG(['.....', '.....', 'kkkkk', '.....', '.....'], { k: '#141408' }, 3, 'lt-g');
const G_X = pixSVG(['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'], { k: '#141408' }, 3, 'lt-g');
// [v31 lab] desktop glyphs: back arrow, a mini folder, a running dot
const G_BACK = pixSVG(['...k...', '..kk...', '.kkkkkk', 'kkkkkkk', '.kkkkkk', '..kk...', '...k...'], { k: '#141408' }, 2, 'lt-g');
const G_KEYD = pixSVG(['.kkk.....', 'k...k....', 'k...kkkkk', 'k...k.k.k', '.kkk.....'], { k: '#2a1600' }, 2, 'lt-g');
const G_FOLD = pixSVG(['kkkk.....', 'kyyyk....', 'kkkkkkkkk', 'kyyyyyyyk', 'kyyyyyyyk', 'kyyyyyyyk', 'kkkkkkkkk'], { k: '#141408', y: '#c9ad5e' }, 2, 'lt-g');

// the terminal's idle chatter (one line at a time in the ticker)
const IDLE_LOG = [
  'scanning pond telemetry... 0 anomalies',
  'coffee levels: CRITICAL',
  'phosphor warmed up. 61 C and cosy',
  'reticulating fish splines...',
  'uplink to e-Buy: stable',
  'beaver labour union: still not recognised',
  'tape drive rewound. whirr',
  'dot-matrix printer: out of paper again',
  'defragmenting the fish database...',
  'world domination plan: 2% complete',
];
let PC_OPEN = 0; // trees on screen: the page body gets .lt-pc (the computer takes over)
const STRIPS = new Map(); // [v31 lab] desktop icon strips as data URLs (per art, per device scale)

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
  sealed: 'Encrypted',
};
const SCRAMBLE = '#$%&@*+=?/<>[]{}01';
function scramble(s, k = 1, seed = 1) {
  const R = rng(seed);
  return String(s).replace(/[^\s]/g, (c) => (R() < k ? SCRAMBLE[Math.floor(R() * SCRAMBLE.length)] : c));
}
// fills missing v18 options from a Game (explicit `game`, or the page's game when the tree runs inside it)
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

export class LabTree {
  static _art = { slotCanvas, SLOT_PALS };

  constructor(container, opts = {}) {
    this.container = container;
    this.o = opts = withGame(opts);
    this._alive = true;
    this._timers = new Set();
    this._off = [];
    this._st = new Map();
    this._iconInfo = new Map();
    this._fishFrames = new Map();
    this._silhouettes = new Map();
    this._ptrs = new Map();
    this._toasts = [];
    this._bursts = [];
    this._jobs = [];
    this._jobSig = '';
    this._lastPoll = 0;
    this._lastDraw = 0;
    this._t0 = now();
    this._fish = null;
    this.filter = null;
    this.loc = null; // [v31 lab] null = the desktop | { k: 'all' | 'ready' | 'b', B }
    this._bounds = null; // camera bounds (world px) of the open folder; null = the whole tree
    this.cam = { x: 0, y: 0, z: 1 };
    this.goal = null;

    this._layout(opts);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    // v19: just the computer: the game HUD steps aside while a tree is on screen
    if (++PC_OPEN === 1) document.body.classList.add('lt-pc');
    this._buildDOM();
    this._buildTree();
    this._buildDesk();
    this._pollJobs(true);
    this.refresh(true);
    this._bind();
    this._resize();
    const first = this._initialNode();
    if (first) this._select(first, { pan: false, sound: false, open: false });
    // [v31 lab] opens on the desktop; the tutorial goes straight to the whole tree (its hooks on screen)
    if (this._tut()) { this._go({ k: 'all' }, { anim: false, sound: false }); this._centerOn(first, true); }
    else this._go(null, { anim: false, sound: false, from: first ? this._deskItem(first.B) : null });
    this._sfx('open');
    this._raf = requestAnimationFrame(this._loop);
    loadFish().then((m) => this._onFish(m));
  }

  // ------------------------------------------------------------ data / layout
  _layout(opts) {
    const branches = (opts.branches || []).slice();
    const byBranch = new Map(branches.map((b) => [b.id, []]));
    (opts.research || []).forEach((d, idx) => { if (d && byBranch.has(d.branch)) byBranch.get(d.branch).push({ d, idx }); });
    this.branches = [];
    this.nodes = [];
    let lane = 0;
    for (const b of branches) {
      const list = byBranch.get(b.id);
      if (!list.length) continue;
      const rows = list.reduce((m, x) => Math.max(m, Math.max(0, x.d.row | 0)), 0) + 1;
      const bi = this.branches.length;
      const B = { b, i: bi, lane0: lane, lanes: rows, nodes: [], color: ART.earthy(b.color || '#8a9a3a'), dos: dosName(b.name || b.id) };
      this.branches.push(B);
      for (const { d, idx } of list) {
        const col = Math.max(0, d.col | 0), ln = lane + Math.max(0, d.row | 0);
        const n = {
          id: d.id, d, idx, B, col, lane: ln, gx: 2 * col + 1, gy: 2 * ln + 1,
          req: (d.req || []).filter(Boolean), time: Number(d.time) || 0, zone: d.zone || null, kids: [],
        };
        B.nodes.push(n);
        this.nodes.push(n);
      }
      lane += rows;
    }
    this.lanes = lane;
    const seen = new Set();
    for (const B of this.branches) { let d = B.dos, k = 2; while (seen.has(d)) d = `${B.dos.slice(0, 15)}_${k++}`; B.dos = d; seen.add(d); }
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    // two nodes in one cell: nudge the later one right
    const taken = new Set();
    for (const n of this.nodes) {
      while (taken.has(`${n.col},${n.lane}`)) n.col++;
      taken.add(`${n.col},${n.lane}`);
      n.gx = 2 * n.col + 1;
    }
    for (const n of this.nodes) for (const r of n.req) this.byId.get(r)?.kids.push(n);
    this.maxCol = this.nodes.reduce((m, n) => Math.max(m, n.col), 0);
    this.GW = 2 * (this.maxCol + 1) + 1;
    this.GH = 2 * Math.max(1, this.lanes) + 1;
    this.W = PADL + (this.maxCol + 1) * COLW + PADR;
    this.H = PADT + Math.max(1, this.lanes) * ROWH + PADB;
    for (const n of this.nodes) { n.x = this._X(n.gx); n.y = this._Y(n.gy); }
    for (const B of this.branches) {
      B.y = PADT + B.lane0 * ROWH;
      B.h = B.lanes * ROWH;
      B.c0 = Math.min(...B.nodes.map((n) => n.col));
      B.c1 = Math.max(...B.nodes.map((n) => n.col));
    }
  }

  _X(gx) { return PADL + (gx * COLW) / 2; }
  _Y(gy) { return PADT + Math.floor(gy / 2) * ROWH + (gy % 2 ? NODE_DY : LANE_DY); }

  // ------------------------------------------------------------ public API
  refresh(initial = false) {
    if (!this._alive) return;
    const changed = [];
    const opened = [];
    for (const B of this.branches) {
      const sealed = this._sealed(B);
      if (sealed !== B.sealed) {
        const was = B.sealed;
        B.sealed = sealed;
        B.band?.classList.toggle('is-sealed', sealed);
        B.tab?.classList.toggle('is-sealed', sealed);
        if (!initial && was && !sealed) opened.push(B);
        else if (B.seal) B.seal.hidden = !sealed;
      }
      if (sealed) this._renderSeal(B);
    }
    for (const n of this.nodes) {
      const st = this._calc(n);
      const prev = this._st.get(n.id);
      if (prev === st) continue;
      this._st.set(n.id, st);
      const el = n.el;
      for (const s of ['done', 'run', 'avail', 'zone', 'locked', 'sealed']) el.classList.toggle(`is-${s}`, st === s);
      el.style.setProperty('--slot', `var(--lt-slot-${st === 'done' ? 'gold' : st === 'avail' ? 'brass' : st === 'run' ? 'phos' : st === 'zone' ? 'ember' : 'iron'})`);
      el.tabIndex = st === 'sealed' ? -1 : el.tabIndex;
      el.setAttribute('aria-label', `${n.d.name}: ${STATE_TEXT[st]}`);
      this._nodeBadge(n, st);
      if (!initial && prev) changed.push([n, prev, st]);
    }
    // pipes
    for (const e of this.edges) {
      const a = this._st.get(e.src.id), b = this._st.get(e.dst.id);
      const s = a === 'sealed' || b === 'sealed' ? 'sealed' : a === 'done' ? (b === 'done' ? 'done' : b === 'run' ? 'run' : 'on') : 'off';
      if (e.s === s) continue;
      const was = e.s;
      e.s = s;
      for (const p of e.els) p.setAttribute('data-s', s);
      if (!initial && (was === 'off' || was === 'sealed') && s !== 'off' && s !== 'sealed') this._surge(e);
    }
    for (const [n, prev, st] of changed) {
      if (st === 'done') this._celebrate(n, prev);
      else if (prev === 'sealed') continue;
      else if ((prev === 'locked' || prev === 'zone') && (st === 'avail' || st === 'zone')) this._fx(n.el, 'is-unlocking', 900);
      else if (st === 'run' && prev !== 'run') { this._fx(n.el, 'is-start', 900); if (n === this.sel) this.wb?.react('start'); }
    }
    for (const B of opened) this._decrypted(B);
    if (this.selSec && !this.selSec.sealed) { const B = this.selSec; this.selSec = null; const pick = B.nodes.find((n) => this._st.get(n.id) === 'avail') || B.nodes[0]; if (pick) this._select(pick, { pan: false, sound: false, open: false }); }
    const done = this.nodes.reduce((a, n) => a + (this._st.get(n.id) === 'done' ? 1 : 0), 0);
    const secs = this.branches.filter((B) => !B.sealed).length;
    const cnt = `<b>${done}</b>/${this.nodes.length}<small>${secs}/${this.branches.length} FOLDERS OPEN</small>`;
    if (cnt !== this._cntHtml) { this._cntHtml = cnt; this.$count.innerHTML = cnt; }
    this.$cbar.style.width = `${this.nodes.length ? (done / this.nodes.length) * 100 : 0}%`;
    this._updateDesk();
    this._pathInfo();
    if (this.loc?.k === 'ready') this._renderInbox();
    const tut = this._tut();
    if (tut !== this._tutOn) { this._tutOn = tut; this.root.classList.toggle('is-tut', tut); }
    if (this.filter) this._applyFilter(false);
    if (this.selSec) { if (initial || this._secSig !== this._keySig(this.selSec)) this._renderDetail(); }
    else if (this.sel && (initial || changed.some(([n]) => n === this.sel || n.kids.includes(this.sel) || this.sel.req.includes(n.id)))) this._renderDetail();
    else if (this.sel) this._renderAct();
  }

  // (opens the node's folder first when it isn't on screen: the desktop / another folder)
  select(id) {
    const n = this.byId.get(id);
    if (n) this._select(n, { pan: true, sound: false, open: true, nav: true });
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
    try { this.wb?.destroy(); } catch { /* ignore */ }
    this.wb = null;
    this._sfx('off');
    this.root.remove();
    if (--PC_OPEN <= 0) { PC_OPEN = 0; document.body.classList.remove('lt-pc'); }
  }

  // ------------------------------------------------------------ helpers
  _sfx(name) { try { this.o.sfx?.(name); } catch { /* ignore */ } }
  _isRes(id) { try { return !!this.o.isResearched?.(id); } catch { return false; } }
  _icon(name, scale = 1) {
    if (!name) return '';
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
  // v18 sections: B = a laid-out branch
  _sealed(B) {
    if (!B || !this.o.sections?.isOpen) return false;
    try { return !this.o.sections.isOpen(B.b.id); } catch { return false; }
  }
  _secKey(B) {
    let k = null;
    try { k = this.o.sections?.key?.(B.b.id) || null; } catch { k = null; }
    return k || { needs: [], coins: 0, ready: true, canUnlock: true };
  }
  _coins() { try { const c = Number(this.o.coins?.()); return Number.isFinite(c) ? c : null; } catch { return null; } }
  _rushOK() { return typeof this.o.onRush === 'function' && typeof this.o.rushPrice === 'function'; }
  _rushPrice(id, mode) { try { const v = Number(this.o.rushPrice(id, mode)); return Number.isFinite(v) ? v : null; } catch { return null; } }
  _slots() {
    try { const s = Number(this.o.slots?.()); return s > 0 ? Math.floor(s) : 1; } catch { return 1; }
  }
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
    if (this._jobIds?.has(n.id)) return 'run';
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
    if (st === 'sealed') return { ok: false, reason: `Decrypt ${n.B.b.name} first` };
    let r = null;
    if (this.o.canResearch) { try { r = this.o.canResearch(n.id); } catch { r = null; } }
    if (!r || typeof r !== 'object') r = { ok: st === 'avail' };
    if (r.ok && this._timed() && this._jobs.length >= this._slots()) r = { ok: false, reason: 'Lab bench busy' };
    if (!r.ok && !r.reason) {
      r = { ok: false, reason: st === 'locked' ? 'Research the prerequisites first' : st === 'zone' ? `Meet ${this._zoneName(n.zone)} first` : 'Not available right now' };
    }
    return r;
  }
  _iconMeta(name) {
    let m = this._iconInfo.get(name);
    if (!m) {
      const html = this._icon(name, 1);
      const w = +(/width="(\d+)"/.exec(html)?.[1] || 0), h = +(/height="(\d+)"/.exec(html)?.[1] || 0);
      const src = /src="([^"]+)"/.exec(html)?.[1];
      m = { ok: !!html, w: w || 12, h: h || 12, img: null, scale: Math.max(1, Math.floor(WELL / Math.max(w || 12, h || 12, 1))) };
      if (src) { m.img = new Image(); m.img.src = src.replace(/&amp;/g, '&'); }
      this._iconInfo.set(name, m);
    }
    return m;
  }
  // icon html scaled to fit `box` css px
  _iconFit(name, box) {
    let m = this._iconMeta(name);
    if (!m.ok) { name = 'flask'; m = this._iconMeta(name); }
    if (!m.ok) return '';
    const s = Math.max(1, Math.floor(box / Math.max(m.w, m.h, 1)));
    return this._icon(name, s);
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
  // the raw art of a node (fish frame canvas or icon image), e.g. for the workbench CRT
  _artSrc(n) {
    if (!n) return null;
    if (n.d.species) { const f = this._fishFrame(n.d.species, 0); if (f) return f; }
    const m = this._iconMeta(n.d.icon);
    return m.ok ? m.img : null;
  }
  _fishImg(species, box) {
    const f = this._fishFrame(species, 0);
    if (!f) return '';
    const k = Math.min(box / f.width, (box * 0.8) / f.height, 3);
    let url = '';
    try { url = f.toDataURL(); } catch { url = ''; }
    if (!url) return '';
    return `<img class="px" src="${url}" width="${Math.round(f.width * k)}" height="${Math.round(f.height * k)}" alt="" draggable="false">`;
  }
  _nodeArt(n, box = WELL) {
    if (n.d.species) { const f = this._fishImg(n.d.species, box); if (f) return f; }
    return this._iconFit(n.d.icon, box);
  }
  _buildArt(id, box) {
    const s = STRUCT_DATA.STRUCTURES?.[id];
    return this._iconFit(s?.icon || id, box) || this._iconFit('hammer', box);
  }

  // ------------------------------------------------------------ DOM
  _buildDOM() {
    const root = document.createElement('div');
    root.className = 'ltree';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Reynard Labs research tree');
    // Reynard's face is a render of his real 3D rig (never 2D art); no WebGL: the pixel logo
    let logo = '';
    try { logo = faceImg({ who: 'fox', expr: 'scheming', frame: 'head', turn: 0.35 }, 44, 44, 'lt-logo3d'); } catch { logo = ''; }
    root.innerHTML = `
      <div class="lt-bezel">
        <div class="lt-screen">
          <header class="lt-head">
            <span class="lt-logo">${logo || FOX_LOGO}</span>
            <div class="lt-titles"><h1><span class="lt-h1t">Reynard Labs</span><span class="lt-ver">FOX-DOS 3.1</span></h1><span class="lt-tag"><span class="lt-prompt">&gt;</span> Research is <b>FREE</b>. Coins buy <b class="y">SPEED</b>.<i class="lt-cur"></i></span></div>
            <div class="lt-coins" title="Your coins"${typeof this.o.coins === 'function' ? '' : ' hidden'}><span class="lt-coins-l">COINS</span><span class="lt-coins-v">${G_COIN}<b>0</b></span></div>
            <div class="lt-count" title="Researched"><span class="lt-count-t"></span><span class="lt-cbar"><i></i></span></div>
            <button class="lt-close" type="button" aria-label="Close research (Esc)"><span class="lt-close-x">${G_X}</span><span>EXIT</span><kbd>ESC</kbd></button>
          </header>
          <div class="lt-path">
            <button class="lt-up" type="button" aria-label="Back to the desktop (Backspace)">${G_BACK}<span>DESKTOP</span></button>
            <div class="lt-addr"><span class="lt-crumb" data-crumb="root" role="button" tabindex="-1">C:\\LAB\\</span><span class="lt-crumb-cur"></span><i class="lt-cur"></i></div>
            <span class="lt-pinfo"></span>
          </div>
          <div class="lt-main">
            <div class="lt-body">
              <div class="lt-view" tabindex="0" aria-label="Research tree. Drag to pan, scroll or pinch to zoom.">
                <div class="lt-world"></div>
                <div class="lt-tabs" aria-hidden="true"></div>
                <div class="lt-zoom">
                  <button type="button" data-z="in" aria-label="Zoom in">${G_PLUS}</button>
                  <button type="button" data-z="out" aria-label="Zoom out">${G_MINUS}</button>
                  <button type="button" data-z="fit" aria-label="Show everything">${G_FIT}</button>
                </div>
                <div class="lt-inbox" hidden></div>
                <div class="lt-tip" aria-hidden="true"></div>
              </div>
              <aside class="lt-det" aria-live="polite">
                <button class="lt-det-x" type="button" aria-label="Close details">${G_X}</button>
                <div class="lt-det-scroll">
                  <div class="lt-hero"><canvas class="lt-hero-cv" width="${PW}" height="${PH}"></canvas><canvas class="lt-wb" aria-label="Reynard at his lab computer"></canvas><span class="lt-hero-st"></span></div>
                  <div class="lt-work" hidden>
                    <div class="lt-tubebox"><canvas class="lt-tube"></canvas><span class="lt-tube-p">0%</span><span class="lt-tube-t"></span></div>
                  </div>
                  <div class="lt-kicker"></div>
                  <h2 class="lt-name"></h2>
                  <p class="lt-desc"></p>
                  <div class="lt-sec lt-sec-unl"><h3 class="lt-h-unl">Unlocks</h3><ul class="lt-unl"></ul></div>
                  <div class="lt-sec lt-sec-time"><h3 class="lt-h-time">Time</h3><div class="lt-time"></div></div>
                  <div class="lt-sec lt-sec-req"><h3 class="lt-h-req">Needs</h3><ul class="lt-reqs"></ul></div>
                  <div class="lt-sec lt-sec-kids"><h3>Leads to</h3><div class="lt-kids"></div></div>
                </div>
                <div class="lt-act">
                  <button class="lt-go" type="button"><span class="lt-go-fill"></span><span class="lt-go-l"></span><span class="lt-go-s"></span></button>
                  <div class="lt-rush" hidden>
                    <button type="button" class="lt-rbtn" data-rush="half"><span class="lt-rbtn-l">${G_BOLT}RUSH <em>-50%</em></span><span class="lt-rbtn-p">${G_COIN}<b></b></span></button>
                    <button type="button" class="lt-rbtn is-now" data-rush="now"><span class="lt-rbtn-l">${G_FF}FINISH NOW</span><span class="lt-rbtn-p">${G_COIN}<b></b></span></button>
                  </div>
                </div>
              </aside>
            </div>
            <div class="lt-desk" role="listbox" aria-label="Research folders">
              <div class="lt-desk-grid"></div>
              <div class="lt-rubber" aria-hidden="true"></div>
            </div>
            <div class="lt-toast" aria-live="polite"></div>
          </div>
          <footer class="lt-bench">
            <span class="lt-bench-l">${this._iconFit('flask', 18)}<span>BENCH<small class="lt-bench-s"></small></span></span>
            <div class="lt-slots"></div>
            <div class="lt-keys"><kbd>DRAG</kbd> pan <kbd>WHEEL</kbd> zoom <kbd>ENTER</kbd> research</div>
          </footer>
          <div class="lt-term" aria-live="off"><span class="lt-term-p">C:\\LAB&gt;</span><span class="lt-term-l"></span><span class="lt-term-r"><i class="lt-led"></i>LAB OK<b class="lt-term-clk">00:00</b></span></div>
          <div class="lt-fx" aria-hidden="true"></div>
          <div class="lt-scan" aria-hidden="true"></div>
        </div>
        <div class="lt-frame" aria-hidden="true"><span class="lt-fled"><i></i><i></i><i></i></span><span class="lt-fname">REYNARD-TEK &middot; PHOSPHOR RESEARCH TERMINAL &middot; MOD 31</span></div>
      </div>`;
    this.container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.view = $('.lt-view');
    this.world = $('.lt-world');
    this.$tabs = $('.lt-tabs');
    this.$tip = $('.lt-tip');
    this.$toast = $('.lt-toast');
    this.$main = $('.lt-main');
    this.$body = $('.lt-body');
    this.$desk = $('.lt-desk');
    this.$deskGrid = $('.lt-desk-grid');
    this.$rubber = $('.lt-rubber');
    this.$up = $('.lt-up');
    this.$crumbCur = $('.lt-crumb-cur');
    this.$pinfo = $('.lt-pinfo');
    this.$inbox = $('.lt-inbox');
    this.$det = $('.lt-det');
    this.$hero = $('.lt-hero');
    this.$heroSt = $('.lt-hero-st');
    this.pcv = $('.lt-hero-cv');
    this.pctx = this.pcv.getContext('2d');
    this.$wb = $('.lt-wb');
    this.$work = $('.lt-work');
    this.$tube = $('.lt-tube');
    this.$tubeP = $('.lt-tube-p');
    this.$tubeT = $('.lt-tube-t');
    this.$kicker = $('.lt-kicker');
    this.$name = $('.lt-name');
    this.$desc = $('.lt-desc');
    this.$unl = $('.lt-unl');
    this.$time = $('.lt-time');
    this.$reqs = $('.lt-reqs');
    this.$kids = $('.lt-kids');
    this.$secKids = $('.lt-sec-kids');
    this.$go = $('.lt-go');
    this.$goL = $('.lt-go-l');
    this.$goS = $('.lt-go-s');
    this.$goFill = $('.lt-go-fill');
    this.$slots = $('.lt-slots');
    this.$count = $('.lt-count-t');
    this.$cbar = $('.lt-cbar i');
    this.$fxl = $('.lt-fx');
    this.$coins = $('.lt-coins');
    this.$coinsV = $('.lt-coins-v b');
    this.$rush = $('.lt-rush');
    this.$rushB = [...root.querySelectorAll('.lt-rush .lt-rbtn')].map((el) => ({ el, mode: el.dataset.rush, p: el.querySelector('.lt-rbtn-p b') }));
    this.$benchS = $('.lt-bench-s');
    this.$hUnl = $('.lt-h-unl');
    this.$hTime = $('.lt-h-time');
    this.$hReq = $('.lt-h-req');
    this.$term = $('.lt-term-l');
    this.$termClk = $('.lt-term-clk');
    this.tube = new Tube(this.$tube, { cssPx: 2, h: 16 });
    const rs = root.style;
    for (const [k, url] of Object.entries(slotURLs())) rs.setProperty(`--lt-slot-${k}`, `url(${url})`);
    // [v31 lab] the pixel frames (border-images) and tiles, at whole device px
    const u = ART.devU(2);
    for (const [k, v] of Object.entries(ART.frames(u))) rs.setProperty(`--f-${k}`, v);
    for (const k of ['dots', 'grid', 'hatch']) rs.setProperty(`--t-${k}`, `url(${ART.urlOf(ART.tile(k), u)})`);
    rs.setProperty('--t-emblem', `url(${ART.urlOf(ART.emblem(), u)})`);
    rs.setProperty('--t-shadow', `url(${ART.urlOf(ART.shadow(), u)})`);
    this._u = u;
    this._log('FOX-DOS 3.1 ready. Welcome back, Doctor Reynard.', 'ok');
    this._idleLog();
  }

  // ------------------------------------------------------------ v19: terminal ticker + glitch
  // one line at the bottom of the screen, typed out; `delay` queues it after the boot text
  _log(text, kind = '', delay = 0) {
    if (!this._alive || !this.$term) return;
    if (delay > 0) { this._later(() => this._log(text, kind), delay); return; }
    const t = String(text || '');
    this._logT = now();
    const el = this.$term;
    el.textContent = t;
    el.className = `lt-term-l${kind ? ` is-${kind}` : ''}`;
    el.style.setProperty('--n', Math.max(1, t.length));
    el.classList.remove('is-type');
    void el.offsetWidth;
    el.classList.add('is-type');
  }

  // ambient chatter while nothing happens (one timer, never per frame)
  _idleLog() {
    this._later(() => {
      if (!this._alive) return;
      if (now() - (this._logT || 0) > 6500) {
        const R = IDLE_LOG;
        this._idleI = ((this._idleI ?? (hashStr(String(this._t0)) % R.length)) + 1) % R.length;
        const run = this._jobs.find((j) => j.n);
        this._log(run && this._idleI % 3 === 0 ? `synthesizing ${run.n.d.name}... ${Math.round((run.k || 0) * 100)}%` : R[this._idleI], 'dim');
      }
      this._idleLog();
    }, 7000);
  }

  _glitch() { /* v30: no screen glitches (cozy) */ }

  _buildTree() {
    const W = this.W, H = this.H;
    this.world.style.width = `${W}px`;
    this.world.style.height = `${H}px`;
    this.edges = routePipes(this.nodes, this.byId, this.GW, this.GH);

    // bands
    let bands = '';
    let tabs = '';
    let seals = '';
    for (const B of this.branches) {
      const c = esc(B.color);
      bands += `<div class="lt-band${B.i % 2 ? ' odd' : ''}" data-b="${B.i}" style="top:${B.y}px;height:${B.h}px;--bc:${c}"><span class="lt-band-id">C:\\LAB\\${esc(B.dos)}</span></div>`;
      // the encrypted seal over a locked section
      let x0 = PADL + B.c0 * COLW + 6, x1 = PADL + (B.c1 + 1) * COLW - 6;
      if (x1 - x0 < 560) { x1 = Math.min(W - 6, x0 + 560); x0 = Math.max(6, x1 - 560); }
      B.sx = x0;
      B.sy = B.y + 12;
      B.sw = x1 - x0;
      B.sh = B.h - 20;
      seals += `<div class="lt-seal${B.lanes < 2 ? ' is-row' : ''}" data-sec="${B.i}" hidden style="left:${B.sx}px;top:${B.sy}px;width:${B.sw}px;height:${B.sh}px;--bc:${c}"></div>`;
      tabs += `<button type="button" class="lt-tab" data-b="${B.i}" style="--bc:${c}" tabindex="-1">${this._iconFit(B.b.icon, 16)}<span>${esc(B.b.name)}</span></button>`;
    }
    this.$tabs.innerHTML = tabs;
    this.branches.forEach((B) => { B.tab = this.$tabs.querySelector(`[data-b="${B.i}"]`); });

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
    let lo = '', lg = '', lc = '', lf = '', lx = '';
    this.edges.forEach((e, i) => {
      const d = P(e.pts);
      e.d = d;
      lo += `<path class="lp-o" data-e="${i}" d="${d}"/>`;
      lg += `<path class="lp-g" data-e="${i}" d="${d}"/>`;
      lc += `<path class="lp-c" data-e="${i}" d="${d}"/>`;
      lf += `<path class="lp-f" data-e="${i}" d="${d}"/>`;
      for (const br of e.bridges) {
        const x = this._X(br.gx), y = this._Y(br.gy), L = 14;
        const bd = br.h ? `M${x - L} ${y}L${x + L} ${y}` : `M${x} ${y - L}L${x} ${y + L}`;
        lx += `<path class="lp-o lp-bo" data-e="${i}" d="${bd}"/><path class="lp-c" data-e="${i}" d="${bd}"/>`;
      }
    });
    const svg = `<svg class="lt-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true">
      <g>${lo}</g><g>${lg}</g><g>${lc}</g><g>${lf}</g><g>${lx}</g></svg>`;

    let nodes = '';
    for (const n of this.nodes) {
      nodes += `<button class="lt-node" type="button" tabindex="-1" data-id="${esc(n.id)}" style="left:${n.x - NODE / 2}px;top:${n.y - NODE / 2}px;--bc:${esc(n.B.color)}">
        <span class="lt-slot"></span><span class="lt-ico"></span>
        <span class="lt-nbar" aria-hidden="true"><i></i></span>
        <span class="lt-badge"></span>
        <span class="lt-pill"></span>
        <span class="lt-nm"><span class="lt-nm-t">${esc(n.d.name)}</span><span class="lt-nm-w"></span></span>
      </button>`;
    }
    this.world.innerHTML = `<div class="lt-bands">${bands}</div>${svg}${nodes}<div class="lt-seals">${seals}</div><div class="lt-ret" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
    for (const B of this.branches) {
      B.band = this.world.querySelector(`.lt-band[data-b="${B.i}"]`);
      B.seal = this.world.querySelector(`.lt-seal[data-sec="${B.i}"]`);
      B.sealed = false;
    }
    this.$ret = this.world.querySelector('.lt-ret');
    for (const n of this.nodes) {
      n.el = this.world.querySelector(`.lt-node[data-id="${CSS.escape(n.id)}"]`);
      n.$ico = n.el.querySelector('.lt-ico');
      n.$nbar = n.el.querySelector('.lt-nbar i');
      n.$badge = n.el.querySelector('.lt-badge');
      n.$pill = n.el.querySelector('.lt-pill');
      n.$why = n.el.querySelector('.lt-nm-w');
      n.$ico.innerHTML = this._nodeArt(n);
    }
    const svgEl = this.world.querySelector('.lt-svg');
    this.edges.forEach((e, i) => { e.els = [...svgEl.querySelectorAll(`[data-e="${i}"]`)]; e.core = svgEl.querySelector(`.lp-c[data-e="${i}"]`); e.s = null; });
  }

  _nodeBadge(n, st) {
    let b = '', pill = '', why = '';
    if (st === 'sealed') { n.$badge.innerHTML = ''; n.$pill.innerHTML = ''; n.$pill.hidden = true; n.$why.textContent = ''; return; }
    if (st === 'done') b = G_CHECK;
    else if (st === 'locked') b = G_LOCK;
    else if (st === 'zone') { b = G_PAW; why = `Meet ${this._zoneName(n.zone)}`; }
    if (st === 'run') {
      const j = this._job(n.id);
      pill = `<b>${fmtClock(j ? j.left : n.time)}</b>`;
    } else if (st !== 'done') {
      pill = this._timed() && n.time ? `${G_CLOCK}<b>${fmtDur(n.time)}</b>` : st === 'avail' ? '<b>FREE</b>' : '';
    }
    n.$badge.innerHTML = b;
    n.$pill.innerHTML = pill;
    n.$pill.hidden = !pill;
    n.$why.textContent = why;
  }

  // ------------------------------------------------------------ [v31 lab] the desktop
  // one icon per place: the computer (all projects), the in-tray (ready), then a folder per branch
  _buildDesk() {
    const items = [
      { id: 'all', k: 'all', name: 'All Projects' },
      { id: 'ready', k: 'ready', name: 'Ready' },
      ...this.branches.map((B) => ({ id: `b${B.i}`, k: 'b', B, name: B.b.name })),
    ];
    let h = '';
    for (const it of items) {
      const b = it.k === 'b';
      h += `<button type="button" class="lt-fd is-${it.k}" data-fd="${it.id}" role="option" aria-selected="false" tabindex="-1"${b ? ` style="--bc:${esc(it.B.color)}"` : ''}>
        <span class="lt-fd-pic"><span class="lt-fd-sh"></span><span class="lt-fd-lift"><span class="lt-fd-art"></span>${b ? `<span class="lt-fd-ico">${this._iconFit(it.B.b.icon, 32)}</span><span class="lt-fd-lock"></span>` : ''}</span><span class="lt-fd-tag"><i class="lt-fd-led"></i><b></b></span></span>
        <span class="lt-fd-name">${esc(it.name)}</span>
      </button>`;
    }
    this.$deskGrid.innerHTML = h;
    this._desk = items;
    this._deskBy = new Map(items.map((it) => [it.id, it]));
    for (const it of items) {
      it.el = this.$deskGrid.querySelector(`[data-fd="${it.id}"]`);
      it.$pic = it.el.querySelector('.lt-fd-pic');
      it.$art = it.el.querySelector('.lt-fd-art');
      it.$ico = it.el.querySelector('.lt-fd-ico');
      it.$lock = it.el.querySelector('.lt-fd-lock');
      it.$tag = it.el.querySelector('.lt-fd-tag b');
      it.f = 0;
      it.ft = 0;
    }
    this._lockUrl = { shut: ART.urlOf(ART.padlock(false), this._u), open: ART.urlOf(ART.padlock(true), this._u) };
  }

  _deskItem(B) { return B ? this._deskBy?.get(`b${B.i}`) || null : null; }
  _deskItemFor(loc) { return !loc ? null : this._deskBy?.get(loc.k === 'b' ? `b${loc.B.i}` : loc.k) || null; }

  // icon strips (data URLs at whole device px), cached per art
  _strip(key, make) {
    const k = `${key}@${this._u}`;
    let u = STRIPS.get(k);
    if (!u) { u = ART.urlOf(make(), this._u); STRIPS.set(k, u); }
    return u;
  }

  // badges, art (open / padlocked / empty tray) and lights for every desktop icon
  _updateDesk() {
    if (!this._desk) return;
    let ready = 0, run = 0, done = 0;
    for (const n of this.nodes) { const s = this._st.get(n.id); if (s === 'avail') ready++; else if (s === 'run') run++; else if (s === 'done') done++; }
    this._counts = { ready, run, done };
    for (const it of this._desk) {
      let art, tag, full = false, rdy = false, sealed = false, key = false, zero = false, busy = false;
      if (it.k === 'all') { art = 'drive'; tag = `${done}/${this.nodes.length}`; rdy = ready > 0; busy = run > 0; full = done === this.nodes.length; }
      else if (it.k === 'ready') { art = ready ? 'tray1' : 'tray0'; tag = String(ready); rdy = ready > 0; zero = !ready; busy = run > 0; }
      else {
        const B = it.B;
        if (B.sealed) { sealed = true; key = !!this._secKey(B).canUnlock; art = 'lock'; tag = String(B.nodes.length); }
        else {
          let d = 0;
          for (const n of B.nodes) { const s = this._st.get(n.id); if (s === 'done') d++; else if (s === 'avail') rdy = true; else if (s === 'run') busy = true; }
          art = 'open'; tag = `${d}/${B.nodes.length}`; full = d === B.nodes.length;
        }
      }
      const sig = [art, tag, full, rdy, key, zero, busy].join('|');
      if (sig === it.sig) continue;
      const artChanged = art !== it.art;
      it.sig = sig;
      it.art = art;
      it.sealed = sealed;
      const el = it.el;
      el.classList.toggle('is-full', full);
      el.classList.toggle('has-ready', rdy);
      el.classList.toggle('is-sealed', sealed);
      el.classList.toggle('has-key', key);
      el.classList.toggle('is-zero', zero);
      el.classList.toggle('is-busy', busy);
      it.$tag.innerHTML = key ? `${G_KEYD}KEY!` : sealed ? `${G_LOCK}${tag}` : full && it.k === 'b' ? `${G_CHECK}${tag}` : tag;
      if (artChanged) {
        const url = it.k === 'all' ? this._strip('drive', ART.driveStrip)
          : it.k === 'ready' ? this._strip(art, () => ART.inboxStrip(art === 'tray1'))
            : this._strip(`f:${it.B.color}:${sealed ? 1 : 0}:${it.B.b.id}`, () => ART.folderStrip(it.B.color, { locked: sealed, seed: it.B.b.id }));
        it.$art.style.backgroundImage = `url(${url})`;
        this._fdFrame(it, sealed ? 0 : it.f);
      }
      if (it.$lock) it.$lock.style.backgroundImage = sealed ? `url(${key ? this._lockUrl.open : this._lockUrl.shut})` : '';
      const lbl = it.k === 'all' ? `All projects: ${tag} researched` : it.k === 'ready' ? `Ready: ${tag} projects` : `${it.name}: ${sealed ? `encrypted, ${tag} projects${key ? ', key ready' : ''}` : `${tag} researched${rdy ? ', projects ready' : ''}`}`;
      el.setAttribute('aria-label', lbl);
    }
  }

  // one frame of an icon strip (0 closed .. 3 wide open); the folder's sticker icon rides on the flap
  _fdFrame(it, f) {
    it.f = f;
    it.$art.style.backgroundPosition = `${-f * ART.FW * 2}px 0`;
    if (it.$ico) {
      const p = ART.folderLabel(f);
      it.$ico.style.transform = `translate(${p.x * 2 - 18}px, ${Math.round(p.y * 2) - 18}px)`;
    }
  }

  // step the strip toward frame `target`, one frame per `ms`
  _fdTo(it, target, ms = 45) {
    if (!it) return;
    it.ft = it.sealed ? 0 : target;
    if (it.tm) return;
    const tick = () => {
      it.tm = null;
      if (!this._alive || it.f === it.ft) return;
      this._fdFrame(it, it.f + Math.sign(it.ft - it.f));
      if (it.f !== it.ft) it.tm = this._later(tick, ms);
    };
    tick();
  }

  _deskSel(it, { focus = false, sound = false } = {}) {
    const prev = this._dsel;
    if (prev && prev !== it) {
      prev.el.classList.remove('is-sel');
      prev.el.setAttribute('aria-selected', 'false');
      prev.el.tabIndex = -1;
      if (!prev.hover) this._fdTo(prev, 0);
    }
    this._dsel = it || null;
    if (it) {
      it.el.classList.add('is-sel');
      it.el.setAttribute('aria-selected', 'true');
      it.el.tabIndex = 0;
      if (!it.hover) this._fdTo(it, 1);
      if (focus) it.el.focus({ preventScroll: true });
      this._deskReveal(it);
      if (sound && prev !== it) this._sfx('select');
    }
  }

  // keep an icon inside the (scrolling) desktop without scrolling anything else
  _deskReveal(it) {
    const d = this.$desk, el = it.el;
    const top = el.offsetTop - 8, bot = el.offsetTop + el.offsetHeight + 8;
    if (top < d.scrollTop) d.scrollTop = top;
    else if (bot > d.scrollTop + d.clientHeight) d.scrollTop = bot - d.clientHeight;
  }

  // spatial arrow keys on the icon grid
  _deskMove(dx, dy) {
    const cur = this._dsel;
    if (!cur) { this._deskSel(this._desk[0], { focus: true, sound: true }); return; }
    const c = cur.el.getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best = null, bs = Infinity;
    for (const it of this._desk) {
      if (it === cur) continue;
      const r = it.el.getBoundingClientRect();
      const ax = (r.left + r.width / 2 - cx) / Math.max(1, c.width), ay = (r.top + r.height / 2 - cy) / Math.max(1, c.height);
      const along = ax * dx + ay * dy;
      if (along <= 0.3) continue;
      const s = along + Math.abs(ax * dy - ay * dx) * 3;
      if (s < bs) { bs = s; best = it; }
    }
    if (best) this._deskSel(best, { focus: this.root.contains(document.activeElement), sound: true });
  }

  // click / Enter on an icon: squash, flap swings wide open, zoom rects out to the window
  _deskOpen(it) {
    if (!it || this._opening) return;
    this._deskSel(it);
    this._go(it.k === 'b' ? { k: 'b', B: it.B } : { k: it.k }, { from: it });
  }

  // [v31 lab] where we are: null = the desktop | { k: 'all' } | { k: 'ready' } | { k: 'b', B }
  _go(loc, { anim = true, sound = true, from = null, then = null } = {}) {
    if (REDUCED) anim = false;
    const was = this.loc;
    if (!loc) { this._toDesk(was, { anim: anim && !!was, sound, from }); return; }
    if (was && was.k === loc.k && was.B === loc.B) { then?.(); return; }
    const it = from || this._deskItemFor(loc);
    if (anim && !was && it) {
      // from the desktop: the icon pops and opens wide, outline rects zoom out to the window
      this._opening = true;
      this._sfx('filter');
      it.el.classList.remove('is-press');
      this._fx(it.el, 'is-open', 420);
      this._fdTo(it, 3, 30);
      const rr = this.root.getBoundingClientRect();
      const a = it.$pic.getBoundingClientRect(), b = this.$main.getBoundingClientRect();
      const dur = this._zoomRects(a, b, rr, 90);
      this._later(() => {
        this._opening = false;
        this._enter(loc, { sound: false, then });
        this._fx(this.$main, 'is-pop', 320);
        this._fdTo(it, it.hover ? 2 : 1, 60);
      }, 90 + dur);
      return;
    }
    if (sound) this._sfx(was ? 'select' : 'filter');
    this._enter(loc, { then });
    if (anim && was) this._fx(this.$main, 'is-swap', 260);
  }

  _setLocClass() {
    const k = this.loc ? this.loc.k : 'desk';
    for (const c of ['desk', 'all', 'ready', 'b']) this.root.classList.toggle(`loc-${c}`, c === k);
  }

  _enter(loc, { then = null } = {}) {
    if (!this._alive) return;
    const was = this.loc;
    this.loc = loc;
    const k = loc.k;
    this.filter = k === 'all' ? null : k === 'ready' ? '@ready' : String(loc.B.i);
    this._bounds = k === 'b' ? this._bandBounds(loc.B) : null;
    this._setLocClass();
    this.$inbox.hidden = k !== 'ready';
    this.$tip.classList.remove('is-on');
    this._applyFilter(false);
    // what the detail panel shows
    if (k === 'b') {
      const B = loc.B;
      if (B.sealed) this._selectSection(B, { pan: false, sound: false, open: false });
      else if (this.selSec || !this.sel || this.sel.B !== B) {
        const pick = B.nodes.find((n) => this._st.get(n.id) === 'run') || B.nodes.find((n) => this._st.get(n.id) === 'avail') || B.nodes.find((n) => this._st.get(n.id) !== 'done') || B.nodes[0];
        if (pick) this._select(pick, { pan: false, sound: false, open: false });
      }
    } else if (k === 'ready') {
      this._renderInbox(true);
      if (this._ibList.length && (this.selSec || !this._ibList.includes(this.sel))) this._select(this._ibList[0], { pan: false, sound: false, open: false });
    } else if (this.selSec && !this.selSec.sealed) this._select(this.selSec.nodes[0], { pan: false, sound: false, open: false });
    this._resize();
    this._frameLoc();
    this._pathTo(loc, true);
    this._pathInfo();
    if (k === 'b') this._log(`cd ${loc.B.dos}${loc.B.sealed ? '   ** ENCRYPTED **' : ''}`, loc.B.sealed ? 'warn' : 'dim');
    else this._log(k === 'ready' ? 'dir INBOX  /ready' : 'dir ALL_PROJECTS', 'dim');
    then?.();
  }

  // back to the desktop; the window zooms back into its icon and the flap swings shut
  _toDesk(was, { anim = false, sound = true, from = null } = {}) {
    this.loc = null;
    this.filter = null;
    this._bounds = null;
    this._setLocClass();
    this.root.classList.remove('is-filtered');
    this.$inbox.hidden = true;
    this.$tip.classList.remove('is-on');
    this._openSheet(false, true);
    this._pathTo(null, !!was);
    this._pathInfo();
    const it = this._deskItemFor(was) || from || this._dsel || this._desk[0];
    const focus = this.root.contains(document.activeElement);
    this._deskSel(it, { focus });
    if (anim && it) {
      const rr = this.root.getBoundingClientRect();
      this._zoomRects(this.$main.getBoundingClientRect(), it.$pic.getBoundingClientRect(), rr, 0);
      if (!it.sealed) { this._fdFrame(it, 3); this._fdTo(it, it.hover ? 2 : 1, 70); }
      this._fx(it.el, 'is-close', 420);
    }
    if (sound && was) this._sfx('click');
    if (was) this._log('cd ..', 'dim');
  }

  // the classic "zoom rects": dotted outlines stepping from one box to another
  _zoomRects(a, b, rr, delay = 0) {
    if (REDUCED || !a || !b || !a.width || !b.width) return 0;
    const N = 7, STEP = 26;
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / N, e = t * t;
      const L = a.left + (b.left - a.left) * e - rr.left, T = a.top + (b.top - a.top) * e - rr.top;
      const W = a.width + (b.width - a.width) * e, H = a.height + (b.height - a.height) * e;
      const el = document.createElement('i');
      el.className = 'lt-zr';
      const ev = (v) => Math.round(v / 2) * 2;
      el.style.cssText = `left:${ev(L)}px;top:${ev(T)}px;width:${ev(W)}px;height:${ev(H)}px;animation-delay:${delay + i * STEP}ms`;
      this.$fxl.appendChild(el);
      this._later(() => el.remove(), delay + i * STEP + 200);
    }
    return N * STEP;
  }

  // world rect a folder window may show: its band (+ the seal while it's encrypted)
  _bandBounds(B) {
    let x0 = Infinity, x1 = -Infinity;
    for (const n of B.nodes) { x0 = Math.min(x0, n.x - COLW / 2 - 10); x1 = Math.max(x1, n.x + COLW / 2 + 10); }
    if (B.sealed || B.sx != null) { x0 = Math.min(x0, B.sx - 10); x1 = Math.max(x1, B.sx + B.sw + 10); }
    return { x0: Math.max(0, x0), x1: Math.min(this.W, x1), y0: B.y, y1: B.y + B.h };
  }

  // the camera when a window opens (instant)
  _frameLoc() {
    const loc = this.loc;
    if (!loc || loc.k === 'ready') return;
    this.goal = null;
    this._vel = null;
    if (loc.k === 'all') { this._centerOn(this.sel || this.selSec?.nodes[0] || this._initialNode(), true); return; }
    const B = loc.B, vw = this.view.clientWidth || 800, vh = this._visibleH() || 500;
    if (B.sealed) { const r = { x0: B.sx - 20, y0: B.sy - 30, x1: B.sx + B.sw + 20, y1: B.sy + B.sh + 30 }; this._fitNow(r, 1); return; }
    const b = this._bounds;
    const fitZ = Math.min((vw - 40) / (b.x1 - b.x0), (vh - 40) / (b.y1 - b.y0));
    const z = clamp(Math.min(fitZ, this._baseZoom()), Math.max(this._minZ(), 0.55), MAXZ);
    if (fitZ >= z - 1e-3 || !this.sel) { this._fitNow(b, z); return; }
    const n = this.sel;
    Object.assign(this.cam, this._clampCam({ z, x: vw / 2 - n.x * z, y: vh / 2 - (n.y + 18) * z }));
    this._applyCam();
  }

  _fitNow(r, maxZ = 1) {
    const vw = this.view.clientWidth || 800, vh = this._visibleH() || 500, pad = 20;
    const z = clamp(Math.min((vw - pad * 2) / (r.x1 - r.x0), (vh - pad * 2) / (r.y1 - r.y0), maxZ), this._minZ(), MAXZ);
    Object.assign(this.cam, this._clampCam({ z, x: vw / 2 - ((r.x0 + r.x1) / 2) * z, y: vh / 2 - ((r.y0 + r.y1) / 2) * z }));
    this._applyCam();
  }

  // the address bar: C:\LAB\ + the open folder, typed out a letter at a time
  _pathTo(loc, type = true) {
    const seg = !loc ? '' : loc.k === 'all' ? 'ALL_PROJECTS\\' : loc.k === 'ready' ? 'INBOX\\' : `${loc.B.dos}\\`;
    if (this._typeT) { clearTimeout(this._typeT); this._timers.delete(this._typeT); this._typeT = null; }
    const el = this.$crumbCur;
    if (!type || REDUCED || !seg) { el.textContent = seg; return; }
    let i = 0;
    const step = () => { this._typeT = null; el.textContent = seg.slice(0, ++i); if (i < seg.length) this._typeT = this._later(step, 18); };
    el.textContent = '';
    step();
  }

  _pathInfo() {
    const loc = this.loc, c = this._counts || { ready: 0, run: 0, done: 0 };
    let h;
    if (!loc) h = `<b>${this.branches.length}</b> folders <i>&middot;</i> <b class="g">${c.ready}</b> ready${c.run ? ` <i>&middot;</i> <b class="g">${c.run}</b> running` : ''}`;
    else if (loc.k === 'all') h = `<b>${c.done}</b>/${this.nodes.length} researched`;
    else if (loc.k === 'ready') h = `<b class="g">${c.ready}</b> ready <i>&middot;</i> <b>${c.run}</b> running`;
    else {
      const B = loc.B;
      if (B.sealed) h = `${G_LOCK}<b class="a">ENCRYPTED</b> <i>&middot;</i> ${B.nodes.length} projects`;
      else {
        let d = 0, r = 0;
        for (const n of B.nodes) { const s = this._st.get(n.id); if (s === 'done') d++; else if (s === 'avail') r++; }
        h = `<b>${d}</b>/${B.nodes.length} done <i>&middot;</i> <b class="g">${r}</b> ready`;
      }
    }
    if (h !== this._pinfoH) { this._pinfoH = h; this.$pinfo.innerHTML = h; }
  }

  // ------------------------------------------------------------ [v31 lab] the Ready inbox
  _renderInbox(force = false) {
    const rank = (n) => (this._st.get(n.id) === 'run' ? 0 : 1);
    const list = this.nodes.filter((n) => { const s = this._st.get(n.id); return s === 'avail' || s === 'run'; });
    list.sort((a, b) => rank(a) - rank(b) || ((a.d.tier ?? 9) - (b.d.tier ?? 9)) || a.time - b.time || a.lane - b.lane || a.col - b.col);
    const sig = list.map((n) => n.id + ':' + this._st.get(n.id)).join('|');
    this._ibList = list;
    if (!force && sig === this._ibSig) { this._inboxSel(); return; }
    this._ibSig = sig;
    if (!list.length) {
      this.$inbox.innerHTML = `<div class="lt-ib-empty"><span class="lt-ib-tray" style="background-image:url(${this._strip('tray0', () => ART.inboxStrip(false))})"></span><b>Inbox empty</b><span>Nothing is ready right now. Let the bench finish, meet the neighbours, or decrypt a folder.</span></div>`;
      this._ibRun = [];
      return;
    }
    let h = `<div class="lt-ib-head"><span>READY TO RESEARCH</span><small>${list.length} ${list.length === 1 ? 'project' : 'projects'}</small></div><ul class="lt-ib-list">`;
    for (const n of list) {
      const st = this._st.get(n.id);
      const j = st === 'run' ? this._job(n.id) : null;
      const right = st === 'run'
        ? `<span class="lt-ib-run"><b class="lt-ib-left">${fmtClock(j ? j.left : n.time)}</b><span class="lt-bar"><i></i></span></span>`
        : this._timed() && n.time ? `${G_CLOCK}<b>${fmtDur(n.time)}</b>` : '<b>FREE</b>';
      h += `<li class="lt-ib-row st-${st}" style="--bc:${esc(n.B.color)}">
        <button type="button" class="lt-ib-it" data-ib="${esc(n.id)}">
          <span class="lt-ib-slot" style="--slot:var(--lt-slot-${st === 'run' ? 'phos' : 'brass'})"><span>${this._nodeArt(n, 32)}</span></span>
          <span class="lt-ib-t"><b>${esc(n.d.name)}</b><small><i class="lt-ib-fold"></i>${esc(n.B.b.name)}${n.d.tier != null ? ` &middot; Tier ${esc(n.d.tier)}` : ''}</small></span>
          <span class="lt-ib-time">${right}</span>
        </button>
        <button type="button" class="lt-ib-open" data-ibopen="${esc(n.id)}" aria-label="Show ${esc(n.d.name)} in its folder" title="Show in its folder">${G_FOLD}</button>
      </li>`;
    }
    this.$inbox.innerHTML = h + '</ul>';
    this._ibRun = [...this.$inbox.querySelectorAll('.lt-ib-row.st-run')].map((row) => {
      const id = row.querySelector('[data-ib]').dataset.ib;
      return { id, t: row.querySelector('.lt-ib-left'), bar: row.querySelector('.lt-bar i') };
    });
    this._inboxSel();
  }

  _inboxSel() {
    if (!this.$inbox || this.$inbox.hidden) return;
    const id = this.sel && !this.selSec ? this.sel.id : null;
    for (const b of this.$inbox.querySelectorAll('[data-ib]')) {
      const on = b.dataset.ib === id;
      if (b.classList.contains('is-sel') === on) continue;
      b.classList.toggle('is-sel', on);
      if (on) {
        const box = this.$inbox, r = b.parentElement;
        if (r.offsetTop < box.scrollTop + 40) box.scrollTop = Math.max(0, r.offsetTop - 40);
        else if (r.offsetTop + r.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = r.offsetTop + r.offsetHeight - box.clientHeight;
      }
    }
  }

  // is node `n` on screen in the current window?
  _onScreen(n) {
    const loc = this.loc;
    if (!loc) return false;
    if (loc.k === 'all') return true;
    if (loc.k === 'ready') return this._matches(n);
    return n.B === loc.B;
  }

  // the old chips' filter values still work: '' / null = all, '@ready', or a branch index
  _setFilter(f) {
    const v = f === '' || f == null ? null : String(f);
    if (v === null) this._go({ k: 'all' });
    else if (v === '@ready') this._go({ k: 'ready' });
    else { const B = this.branches[+v]; if (B) this._go({ k: 'b', B }, { from: this._deskItem(B) }); }
  }

  _matches(n) {
    const f = this.filter;
    if (f === null) return true;
    if (f === '@ready') { const s = this._st.get(n.id); return s === 'avail' || s === 'run'; }
    return String(n.B.i) === String(f);
  }

  // in a folder only its own branch is on the map (the rest is hidden, cables to other folders stay as stubs)
  _applyFilter(move) {
    const fold = this.loc?.k === 'b';
    const list = [];
    for (const n of this.nodes) {
      const m = this._matches(n);
      n.el.classList.toggle('is-dim', !m && !fold);
      n.el.classList.toggle('is-out', !m && fold);
      if (m) list.push(n);
    }
    for (const e of this.edges) {
      const a = this._matches(e.src), b = this._matches(e.dst);
      const out = fold && !a && !b;
      const dim = this.filter !== null && !(a && b) && !out;
      if (e.dim !== dim) { e.dim = dim; for (const p of e.els) p.classList.toggle('is-dim', dim); }
      if (e.out !== out) { e.out = out; for (const p of e.els) p.classList.toggle('is-out', out); }
    }
    for (const B of this.branches) {
      const o = fold && B !== this.loc.B;
      if (B.out !== o) { B.out = o; B.band?.classList.toggle('is-out', o); B.seal?.classList.toggle('is-out', o); }
    }
    this.root.classList.toggle('is-filtered', this.filter !== null);
    if (!move || !list.length) return;
    if (this.loc?.k === 'b') { this._frameLoc(); return; }
    if (!this.sel || !this._matches(this.sel)) {
      const pick = list.find((n) => this._st.get(n.id) === 'avail') || list.find((n) => this._st.get(n.id) === 'run') || list[0];
      this._select(pick, { pan: false, sound: false, open: false });
    }
  }

  // ------------------------------------------------------------ events
  _bind() {
    const view = this.view;
    this._on(this.world, 'click', (e) => {
      if (this._dragJustEnded()) { e.preventDefault(); return; }
      const sealEl = e.target.closest('.lt-seal');
      if (sealEl) {
        const B = this.branches[+sealEl.dataset.sec];
        const g = e.target.closest('[data-goto]');
        if (g) { const n = this.byId.get(g.dataset.goto); if (n) this._select(n, { pan: true, sound: 'select', open: true, nav: true }); return; }
        if (e.target.closest('.lt-decrypt')) { this._selectSection(B, { pan: false, open: false }); this._decrypt(B, e.target.closest('.lt-decrypt')); return; }
        this._selectSection(B, { pan: false, sound: 'select', open: true });
        return;
      }
      const b = e.target.closest('.lt-node');
      if (!b) return;
      const n = this.byId.get(b.dataset.id);
      if (!n) return;
      if (n === this.sel && this._compact && !this._sheetOpen) { this._openSheet(true); return; }
      this._select(n, { pan: true, sound: 'select', open: true });
    });
    this._on(this.world, 'dblclick', (e) => {
      const b = e.target.closest('.lt-node');
      if (b && !this._compact && this.byId.get(b.dataset.id) === this.sel) this._research();
    });
    this._on(this.world, 'pointerover', (e) => {
      if (e.pointerType !== 'mouse' || this._drag?.moved) return;
      const b = e.target.closest('.lt-node');
      if (!b || b === this._hoverEl) return;
      this._hoverEl = b;
      const n = this.byId.get(b.dataset.id);
      if (!n) return;
      this._showTip(n);
      const t = now();
      if (!this._hoverT || t - this._hoverT > 70) { this._hoverT = t; this._sfx('hover'); }
    });
    this._on(this.world, 'pointerout', (e) => {
      const b = e.target.closest('.lt-node');
      if (b && !b.contains(e.relatedTarget)) { this._hoverEl = null; this.$tip.classList.remove('is-on'); }
    });
    // pan / pinch
    this._on(view, 'pointerdown', (e) => this._onDown(e));
    this._on(window, 'pointermove', (e) => this._onMove(e));
    this._on(window, 'pointerup', (e) => this._onUp(e));
    this._on(window, 'pointercancel', (e) => this._onUp(e));
    this._on(view, 'wheel', (e) => this._onWheel(e), { passive: false });
    // stop the game's camera / browser gestures under the tree
    this._on(this.root, 'contextmenu', (e) => e.preventDefault());
    this._on(window, 'keydown', (e) => this._key(e), true);
    // controls
    this._on(this.root.querySelector('.lt-zoom'), 'click', (e) => {
      const z = e.target.closest('[data-z]')?.dataset.z;
      if (!z) return;
      this._sfx('click');
      if (z === 'fit') this._fitAll();
      else this._zoomBy(z === 'in' ? 1.3 : 1 / 1.3);
    });
    this._bindDesk();
    this._on(this.$tabs, 'click', (e) => {
      const t = e.target.closest('.lt-tab');
      if (t) this._setFilter(t.dataset.b);
    });
    this._on(this.$go, 'click', () => this._research());
    this._on(this.$rush, 'click', (e) => {
      const r = e.target.closest('[data-rush]');
      if (r && this.sel) this._rush(this.sel.id, r.dataset.rush, r);
    });
    this._on(this.root.querySelector('.lt-close'), 'click', () => this._close());
    this._on(this.root.querySelector('.lt-det-x'), 'click', () => { this._sfx('click'); this._openSheet(false); });
    this._on(this.$det, 'click', (e) => {
      const j = e.target.closest('[data-goto]');
      if (j) { const n = this.byId.get(j.dataset.goto); if (n) this._select(n, { pan: true, sound: 'select', open: true, nav: true }); }
    });
    this._on(this.$slots, 'click', (e) => {
      const r = e.target.closest('[data-rush]');
      if (r) { this._rush(r.dataset.id, r.dataset.rush, r); return; }
      const s = e.target.closest('[data-goto]');
      if (!s) return;
      const n = this.byId.get(s.dataset.goto);
      if (n) this._select(n, { pan: true, sound: 'select', open: true, nav: true });
    });
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.root);
    } else this._on(window, 'resize', () => this._resize());
  }

  // [v31 lab] desktop icons, the rubber-band marquee, the path bar and the inbox
  _bindDesk() {
    const desk = this.$desk, grid = this.$deskGrid;
    const itemOf = (t) => { const el = t?.closest?.('.lt-fd'); return el ? this._deskBy.get(el.dataset.fd) : null; };
    this._on(grid, 'click', (e) => {
      const it = itemOf(e.target);
      if (!it || this._bandMoved) return;
      this._deskOpen(it);
    });
    this._on(grid, 'pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const it = itemOf(e.target);
      if (!it || it.hover) return;
      it.hover = true;
      if (it.sealed) this._fx(it.el, 'is-rattle', 420);
      else this._fdTo(it, 2);
      const t = now();
      if (!this._hoverT || t - this._hoverT > 70) { this._hoverT = t; this._sfx('hover'); }
    });
    this._on(grid, 'pointerout', (e) => {
      const it = itemOf(e.target);
      if (!it || it.el.contains(e.relatedTarget)) return;
      it.hover = false;
      it.el.classList.remove('is-press');
      if (!this._opening) this._fdTo(it, it === this._dsel ? 1 : 0);
    });
    this._on(desk, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const it = itemOf(e.target);
      this._bandMoved = false;
      if (it) { it.el.classList.add('is-press'); return; }
      if (e.pointerType !== 'mouse') return;
      // empty desktop: a rubber-band selection, like a real desktop
      const r = desk.getBoundingClientRect();
      this._band = { id: e.pointerId, x0: e.clientX - r.left + desk.scrollLeft, y0: e.clientY - r.top + desk.scrollTop };
      for (const x of this._desk) x.el.classList.remove('is-hl');
      this._deskSel(null);
      try { desk.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    this._on(desk, 'pointermove', (e) => {
      const b = this._band;
      if (!b || b.id !== e.pointerId) return;
      const r = desk.getBoundingClientRect();
      const x1 = e.clientX - r.left + desk.scrollLeft, y1 = e.clientY - r.top + desk.scrollTop;
      const L = Math.min(b.x0, x1), T = Math.min(b.y0, y1), W = Math.abs(x1 - b.x0), H = Math.abs(y1 - b.y0);
      if (!this._bandMoved && W + H < 6) return;
      this._bandMoved = true;
      const rb = this.$rubber.style;
      rb.display = 'block';
      rb.transform = `translate(${Math.round(L / 2) * 2}px, ${Math.round(T / 2) * 2}px)`;
      rb.width = `${Math.round(W / 2) * 2}px`;
      rb.height = `${Math.round(H / 2) * 2}px`;
      for (const it of this._desk) {
        const el = it.el, ex = el.offsetLeft + grid.offsetLeft, ey = el.offsetTop + grid.offsetTop;
        const hit = ex < L + W && ex + el.offsetWidth > L && ey < T + H && ey + el.offsetHeight > T;
        el.classList.toggle('is-hl', hit);
      }
    });
    const endBand = (e) => {
      for (const it of this._desk) it.el.classList.remove('is-press');
      const b = this._band;
      if (!b || b.id !== e.pointerId) return;
      this._band = null;
      this.$rubber.style.display = 'none';
      const hl = this._desk.filter((it) => it.el.classList.contains('is-hl'));
      if (hl.length) { this._deskSel(hl[0]); this._sfx('select'); }
      if (this._bandMoved) this._later(() => { this._bandMoved = false; }, 0);
    };
    this._on(desk, 'pointerup', endBand);
    this._on(desk, 'pointercancel', endBand);
    // the path bar: back key and the C:\LAB\ crumb go up to the desktop
    this._on(this.$up, 'click', () => { if (this.loc && !this._tut()) this._go(null); });
    this._on(this.root.querySelector('.lt-crumb'), 'click', () => { if (this.loc && !this._tut()) this._go(null); });
    // the inbox: pick a project (the detail panel shows it), or jump to its folder
    this._on(this.$inbox, 'click', (e) => {
      const o = e.target.closest('[data-ibopen]');
      if (o) { const n = this.byId.get(o.dataset.ibopen); if (n) { this._sfx('click'); this._go({ k: 'b', B: n.B }, { then: () => this._select(n, { pan: true, sound: false, open: true }) }); } return; }
      const b = e.target.closest('[data-ib]');
      const n = b && this.byId.get(b.dataset.ib);
      if (!n) return;
      if (n === this.sel && this._compact && !this._sheetOpen) { this._openSheet(true); return; }
      this._select(n, { pan: false, sound: 'select', open: true });
    });
    this._on(this.$inbox, 'dblclick', (e) => {
      const b = e.target.closest('[data-ib]');
      if (b && !this._compact && this.byId.get(b.dataset.ib) === this.sel) this._research();
    });
  }

  _dragJustEnded() { return this._dragEndT && now() - this._dragEndT < 140; }

  _onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.lt-zoom, .lt-toast, .lt-tab, .lt-decrypt, .lt-inbox')) return;
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._vel = null;
    this.goal = null;
    if (this._ptrs.size === 1) {
      this._drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false, hist: [[e.clientX, e.clientY, now()]] };
    } else if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()];
      const r = this.view.getBoundingClientRect();
      this._pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, cam: { ...this.cam } };
      if (this._drag) this._drag.moved = true;
      this.root.classList.add('is-dragging');
    }
  }

  _onMove(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this._pinch && this._ptrs.size >= 2) {
      const [a, b] = [...this._ptrs.values()];
      const r = this.view.getBoundingClientRect();
      const P = this._pinch;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const z = clamp(P.cam.z * (d / P.d0), this._minZ(), MAXZ);
      const wx = (P.mx - P.cam.x) / P.cam.z, wy = (P.my - P.cam.y) / P.cam.z;
      this.cam.z = z;
      this.cam.x = mx - wx * z;
      this.cam.y = my - wy * z;
      this._applyCam();
      return;
    }
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && dx * dx + dy * dy > 64) {
      d.moved = true;
      this.root.classList.add('is-dragging');
      this.$tip.classList.remove('is-on');
      try { this.view.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (d.moved) {
      this.cam.x = d.cx + dx;
      this.cam.y = d.cy + dy;
      this._applyCam();
      const t = now();
      d.hist.push([e.clientX, e.clientY, t]);
      while (d.hist.length > 2 && t - d.hist[0][2] > 100) d.hist.shift();
    }
  }

  _onUp(e) {
    if (!this._ptrs.has(e.pointerId)) return;
    this._ptrs.delete(e.pointerId);
    if (this._pinch) {
      if (this._ptrs.size < 2) {
        this._pinch = null;
        this._dragEndT = now();
        const rest = [...this._ptrs.entries()][0];
        this._drag = rest ? { id: rest[0], x0: rest[1].x, y0: rest[1].y, cx: this.cam.x, cy: this.cam.y, moved: true, hist: [] } : null;
        if (!rest) this.root.classList.remove('is-dragging');
      }
      return;
    }
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved) {
      this._dragEndT = now();
      const h = d.hist;
      if (h.length >= 2 && !REDUCED) {
        const a = h[0], b = h[h.length - 1], dt = Math.max(1, b[2] - a[2]);
        if (now() - b[2] < 60) {
          const vx = (b[0] - a[0]) / dt, vy = (b[1] - a[1]) / dt;
          if (Math.hypot(vx, vy) > 0.25) this._vel = { x: vx, y: vy };
        }
      }
    }
    this._drag = null;
    this.root.classList.remove('is-dragging');
  }

  _onWheel(e) {
    if (this.loc?.k === 'ready' || e.target.closest?.('.lt-inbox')) return; // the inbox scrolls natively
    e.preventDefault();
    this._vel = null;
    this.goal = null;
    const r = this.view.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    // pinch on trackpads arrives as ctrl+wheel; a mouse wheel has no deltaX
    const zoom = e.ctrlKey || (Math.abs(dx) < 0.5 && (e.deltaMode !== 0 || Math.abs(dy) >= 40 || Number.isInteger(dy) && Math.abs(dy) >= 4 && !e.shiftKey));
    if (zoom) {
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018));
      this._zoomAt(sx, sy, f);
    } else {
      this.cam.x -= e.shiftKey && !dx ? dy : dx;
      this.cam.y -= e.shiftKey && !dx ? 0 : dy;
      this._applyCam();
    }
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
    const vw = this.view.clientWidth, vh = this._visibleH();
    const z = clamp(this.cam.z * f, this._minZ(), MAXZ);
    const wx = (vw / 2 - this.cam.x) / this.cam.z, wy = (vh / 2 - this.cam.y) / this.cam.z;
    this._goTo({ x: vw / 2 - wx * z, y: vh / 2 - wy * z, z });
  }

  _key(e) {
    if (!this._alive || !this.root.isConnected || this.root.offsetParent === null) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key;
    const btn = t && t.tagName === 'BUTTON' && this.root.contains(t) && !t.classList.contains('lt-node') && !t.classList.contains('lt-fd');
    let handled = true;
    if (!this.loc) {
      // [v31 lab] the desktop: arrows walk the icons, Enter opens, Esc leaves the lab
      if (this._opening) handled = k !== 'Escape';
      else if (k === 'ArrowLeft') this._deskMove(-1, 0);
      else if (k === 'ArrowRight') this._deskMove(1, 0);
      else if (k === 'ArrowUp') this._deskMove(0, -1);
      else if (k === 'ArrowDown') this._deskMove(0, 1);
      else if (k === 'Enter' || k === 'NumpadEnter' || k === ' ') {
        if (btn) handled = false;
        else { const it = this._dsel || this._desk[0]; if (it) { this._fx(it.el, 'is-press', 120); this._deskOpen(it); } }
      } else if (k === 'Home') this._deskSel(this._desk[0], { focus: true, sound: true });
      else if (k === 'End') this._deskSel(this._desk[this._desk.length - 1], { focus: true, sound: true });
      else if (k === 'Escape') this._close();
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    const tree = this.loc.k !== 'ready';
    if (k === 'ArrowLeft') { if (tree) this._move(-1, 0); else handled = false; }
    else if (k === 'ArrowRight') { if (tree) this._move(1, 0); else handled = false; }
    else if (k === 'ArrowUp') this._move(0, -1);
    else if (k === 'ArrowDown') this._move(0, 1);
    else if (k === 'Enter' || k === 'NumpadEnter' || k === ' ') {
      if (btn) handled = false;
      else this._research();
    } else if (k === 'Escape') {
      if (this._compact && this._sheetOpen) { this._openSheet(false); this._sfx('click'); } else if (this._tut()) this._close(); else this._go(null);
    } else if (k === 'Backspace') { if (this._tut()) handled = false; else this._go(null); }
    else if (tree && (k === '+' || k === '=')) this._zoomBy(1.3);
    else if (tree && (k === '-' || k === '_')) this._zoomBy(1 / 1.3);
    else if (tree && k === '0') this._fitAll();
    else if (tree && (k === 'f' || k === 'F')) { if (this.sel) this._centerOn(this.sel); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  // [v31 lab] is the tutorial running? (it opens the lab straight into the tree and keeps you there)
  _tut() {
    try { if (this.o.quiet?.()) return true; } catch { /* ignore */ }
    const G = this.o.game || (typeof window !== 'undefined' ? window.__game : null);
    try { return !!(G && G.tutorial?.active && !G.state?.tutorialDone); } catch { return false; }
  }

  _close() {
    this._sfx('click');
    try { this.o.onClose?.(); } catch (err) { console.error(err); }
  }

  // spatial keyboard navigation
  _move(dx, dy) {
    if (this.loc?.k === 'ready') {
      const L = this._ibList || [];
      if (!dy || !L.length) return;
      const i = L.indexOf(this.sel);
      const n = L[i < 0 ? 0 : clamp(i + dy, 0, L.length - 1)];
      if (n && n !== this.sel) this._select(n, { pan: false, sound: 'select', open: false });
      return;
    }
    const cur = this.sel || (this.selSec && this.selSec.nodes[0]);
    if (!cur) { const f = this._initialNode(); if (f) this._select(f, { pan: true, sound: 'select' }); return; }
    let best = null, bs = Infinity;
    for (const n of this.nodes) {
      if (n === cur || n.B.sealed || (this.filter !== null && !this._matches(n))) continue;
      const ax = (n.x - cur.x) / COLW, ay = (n.y - cur.y) / ROWH;
      const along = ax * dx + ay * dy;
      if (along <= 0.01) continue;
      const perp = Math.abs(ax * dy - ay * dx);
      const s = along + perp * 2.2;
      if (s < bs) { bs = s; best = n; }
    }
    if (best) {
      this._select(best, { pan: true, sound: 'select', open: false });
      if (this.root.contains(document.activeElement)) best.el.focus({ preventScroll: true });
    }
  }

  _initialNode() {
    const run = this._jobs.find((j) => j.n)?.n;
    if (run) return run;
    const avail = this.nodes.filter((n) => this._st.get(n.id) === 'avail');
    avail.sort((a, b) => ((a.d.tier ?? 9) - (b.d.tier ?? 9)) || a.time - b.time || a.lane - b.lane || a.col - b.col);
    return avail[0] || this.nodes.find((n) => this._st.get(n.id) === 'zone') || this.nodes.find((n) => this._st.get(n.id) === 'done') || this.nodes[0] || null;
  }

  // ------------------------------------------------------------ camera
  _resize() {
    if (!this._alive) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const compact = w < 700 || (w < 900 && h > w * 1.15);
    if (compact !== this._compact) {
      this._compact = compact;
      this.root.classList.toggle('is-compact', compact);
      if (!compact) this._openSheet(false, true);
    }
    this.root.classList.toggle('is-short', h < 640);
    this.root.classList.toggle('is-tiny', h < 460);
    this._sizeHero();
    if (this._isWorking) this._sizeWork();
    this._clampCam(this.cam);
    this._applyCam();
  }

  // [v31 lab] the showcase canvas at a whole number of device px per art px (never a smeared 2.4x)
  _sizeHero() {
    const w = this.$hero.clientWidth;
    if (!w) return;
    const s = Math.max(1, crispScale((w - 4) / PW, 1, { min: 1, max: 4 }));
    const cw = `${Math.round(PW * s * 100) / 100}px`;
    if (this.pcv.style.width !== cw) { this.pcv.style.width = cw; this.pcv.style.height = `${Math.round(PH * s * 100) / 100}px`; }
  }

  // the world rect the camera may show: the open folder's band, or the whole tree
  _bnd() { return this._bounds || { x0: 0, y0: 0, x1: this.W, y1: this.H }; }

  // zoom-out limit: enough to see the whole tree / folder (but never below 0.1)
  _minZ() {
    const vw = this.view.clientWidth || 800, vh = this.view.clientHeight || 500, b = this._bnd();
    return clamp(Math.min((vw - 60) / (b.x1 - b.x0), (vh - 60) / (b.y1 - b.y0)), 0.1, MINZ);
  }

  _visibleH() {
    const v = this.view;
    if (this._compact && this._sheetOpen) return Math.max(120, v.clientHeight - this.$det.offsetHeight);
    return v.clientHeight;
  }

  _clampCam(c) {
    const vw = this.view.clientWidth || 800, vh = this.view.clientHeight || 500, b = this._bnd();
    const m = Math.min(40, vw * 0.1), mh = Math.min(40, vh * 0.1);
    const ww = (b.x1 - b.x0) * c.z, wh = (b.y1 - b.y0) * c.z;
    // clamp where the bounds' top-left lands on screen
    let sx = c.x + b.x0 * c.z, sy = c.y + b.y0 * c.z;
    sx = ww + 2 * m < vw ? clamp(sx, m, vw - ww - m) : clamp(sx, vw - ww - m, m);
    const sheet = this._compact && this._sheetOpen ? this.$det.offsetHeight : 0;
    sy = wh + 2 * mh < vh - sheet ? clamp(sy, mh, vh - sheet - wh - mh) : clamp(sy, vh - sheet - wh - mh, mh);
    c.x = sx - b.x0 * c.z;
    c.y = sy - b.y0 * c.z;
    return c;
  }

  _applyCam() {
    const c = this._clampCam(this.cam);
    this.world.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    // the dot grid moves with the map (32 css px per tile at zoom 1)
    const hz = 32 * c.z;
    this.view.style.setProperty('--hex-pos', `${c.x.toFixed(1)}px ${c.y.toFixed(1)}px`);
    this.view.style.setProperty('--hex-size', `${hz.toFixed(1)}px ${hz.toFixed(1)}px`);
    this.root.classList.toggle('is-far', c.z < 0.58);
    this.root.classList.toggle('is-vfar', c.z < 0.3);
    this.root.style.setProperty('--lt-z', c.z.toFixed(3));
    // sticky branch tabs (only on the whole-tree view)
    const vh = this.view.clientHeight;
    const x = Math.max(6, (PADL - 34) * c.z + c.x);
    if (this.loc?.k === 'all') for (const B of this.branches) {
      if (!B.tab) continue;
      const top = B.y * c.z + c.y, bot = (B.y + B.h) * c.z + c.y;
      const th = 26;
      const vis = bot > th + 4 && top < vh - 10;
      B.tab.style.display = vis ? '' : 'none';
      if (!vis) continue;
      const y = clamp(top + 2, 2, bot - th - 2);
      B.tab.classList.toggle('is-stuck', y > top + 3);
      B.tab.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    if (this.$tip.classList.contains('is-on') && this._tipNode) this._placeTip(this._tipNode);
  }

  _goTo(g) {
    this.goal = this._clampCam({ ...g });
    this._vel = null;
    if (REDUCED) { Object.assign(this.cam, this.goal); this.goal = null; this._applyCam(); }
  }

  _fitRect(x0, y0, x1, y1, maxZ = 1) {
    const vw = this.view.clientWidth, vh = this._visibleH();
    const pad = 30;
    const z = clamp(Math.min((vw - pad * 2) / (x1 - x0), (vh - pad * 2) / (y1 - y0), maxZ), this._minZ(), MAXZ);
    this._goTo({ z, x: vw / 2 - ((x0 + x1) / 2) * z, y: vh / 2 - ((y0 + y1) / 2) * z });
  }

  _fitAll() { const b = this._bnd(); this._fitRect(b.x0, b.y0, b.x1, b.y1, 1); }

  _baseZoom() {
    const vw = this.view.clientWidth;
    return vw < 520 ? 0.72 : vw < 760 ? 0.85 : 1;
  }

  _centerOn(n, instant = false) {
    if (!n) return;
    const z = instant ? this._baseZoom() : Math.max(this.cam.z, 0.8);
    const vw = this.view.clientWidth, vh = this._visibleH();
    const g = { z, x: vw / 2 - n.x * z, y: vh / 2 - (n.y + 18) * z };
    if (instant) { Object.assign(this.cam, this._clampCam(g)); this._applyCam(); } else this._goTo(g);
  }

  _ensureVisible(n) {
    const c = this.goal || this.cam;
    const vw = this.view.clientWidth, vh = this._visibleH();
    const sx = n.x * c.z + c.x, sy = n.y * c.z + c.y;
    const mx = Math.min(110, vw / 3), my = Math.min(90, vh / 3);
    let x = c.x, y = c.y;
    let z = c.z;
    if (z < 0.6) z = 0.8;
    if (z !== c.z || sx < mx || sx > vw - mx || sy < my || sy > vh - my - 40 * z) {
      if (z !== c.z) { this._centerOn(n); return; }
      if (sx < mx) x += mx - sx; else if (sx > vw - mx) x -= sx - (vw - mx);
      if (sy < my) y += my - sy; else if (sy > vh - my - 40 * z) y -= sy - (vh - my - 40 * z);
      this._goTo({ x, y, z });
    }
  }

  _openSheet(open, silent) {
    if (!this._compact) open = false;
    if (this._sheetOpen === open) return;
    this._sheetOpen = open;
    this.root.classList.toggle('is-sheet', open);
    if (open && !silent) this._later(() => { if (this.sel) this._ensureVisible(this.sel); }, 260);
  }

  // ------------------------------------------------------------ selection / detail
  _select(n, { pan = true, sound = false, open = false, nav = false } = {}) {
    if (!n) return;
    // [v31 lab] not in the open window (or on the desktop): open its folder first
    if (nav && !this._onScreen(n)) {
      this._go({ k: 'b', B: n.B }, { anim: !this._tut(), sound: !!sound, then: () => this._select(n, { pan, sound: false, open }) });
      return;
    }
    if (n.B.sealed) { this._selectSection(n.B, { pan, sound, open }); return; }
    const wasSec = !!this.selSec;
    this.selSec = null;
    this.root.classList.remove('is-secsel');
    if (wasSec) for (const X of this.branches) X.seal?.classList.remove('is-sel');
    const same = n === this.sel && !wasSec;
    if (this.sel?.el) { this.sel.el.classList.remove('is-sel'); this.sel.el.tabIndex = -1; }
    this.sel = n;
    n.el.classList.add('is-sel');
    n.el.tabIndex = 0;
    this.$ret.style.transform = `translate(${n.x - NODE / 2 - 12}px, ${n.y - NODE / 2 - 12}px)`;
    this.$ret.classList.add('is-on');
    if (sound) this._sfx(sound);
    if (open) this._openSheet(true);
    if (!same) {
      this._renderDetail();
      if (!REDUCED) this._fx(this.$det, 'is-swap', 300);
    }
    if (this.loc?.k === 'ready') { pan = false; this._inboxSel(); }
    if (pan) this._ensureVisible(n);
    if (sound && !same) this._log(`type ${n.id.replace(/^r_/, '').toUpperCase()}.RND  [${STATE_TEXT[this._st.get(n.id)] || ''}]`, 'dim');
  }

  // an encrypted section: the detail panel shows its section key
  _selectSection(B, { pan = true, sound = false, open = false } = {}) {
    if (!B) return;
    if (this.loc && this.loc.k !== 'all' && this.loc.B !== B) { this._go({ k: 'b', B }, { anim: !this._tut() }); return; }
    const same = this.selSec === B;
    if (this.sel?.el) { this.sel.el.classList.remove('is-sel'); this.sel.el.tabIndex = -1; }
    this.sel = null;
    this.selSec = B;
    this.root.classList.add('is-secsel');
    this.$ret.classList.remove('is-on');
    for (const X of this.branches) X.seal?.classList.toggle('is-sel', X === B);
    if (sound) this._sfx('sector');
    if (open) this._openSheet(true);
    if (!same) {
      this._renderDetail();
      if (!REDUCED) this._fx(this.$det, 'is-swap', 300);
      if (sound) this._log(`${B.dos}: ACCESS DENIED. needs its section key`, 'err');
    }
    if (pan) this._fitRect(B.sx - 20, B.sy - 30, B.sx + B.sw + 20, B.sy + B.sh + 30, 1);
  }

  _keySig(B) {
    const k = this._secKey(B);
    return JSON.stringify([k.needs?.map((x) => x.ok), k.canUnlock, k.coins, B.sealed]);
  }

  _showTip(n) {
    const st = this._st.get(n.id);
    let line = STATE_TEXT[st];
    if (st === 'run') { const j = this._job(n.id); line = `Researching: ${fmtClock(j?.left ?? 0)} left`; }
    else if (st === 'zone') line = `Meet ${this._zoneName(n.zone)} first`;
    else if (st === 'avail') line = this._timed() && n.time ? `Ready! Free, takes ${fmtDur(n.time)}` : 'Ready! Free';
    else if (st === 'locked') {
      const miss = n.req.map((r) => this.byId.get(r)).filter((p) => p && !this._isRes(p.id));
      line = miss.length ? `Needs ${miss.map((p) => p.d.name).slice(0, 2).join(' + ')}${miss.length > 2 ? '...' : ''}` : 'Locked';
    }
    this.$tip.innerHTML = `<b>${esc(n.d.name)}</b><i class="st-${st}">${esc(line)}</i>`;
    this._tipNode = n;
    this._placeTip(n);
    this.$tip.classList.add('is-on');
  }

  _placeTip(n) {
    const c = this.cam;
    const x = n.x * c.z + c.x, y = (n.y - NODE / 2) * c.z + c.y - 10;
    this.$tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  _unlockItems(d) {
    const out = [];
    for (const b of [].concat(d.build || [])) {
      if (!b) continue;
      const s = STRUCT_DATA.STRUCTURES?.[b];
      out.push({ art: this._buildArt(b, 32), name: s?.name || human(b), kind: 'Build' });
    }
    if (d.species) {
      const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species];
      out.push({ art: this._fishImg(d.species, 40) || this._iconFit('fish', 32), name: sp?.name || human(d.species), kind: 'Fish eggs', fish: true });
    }
    if (d.mods) for (const [k, v] of Object.entries(d.mods)) out.push({ art: this._iconFit(k === 'labSlots' ? 'flask' : 'bolt', 28), name: modLine(k, v), kind: 'Upgrade' });
    if (d.feature) out.push({ art: this._iconFit('gear', 28), name: d.featureName || human(d.feature), kind: 'Feature' });
    return out;
  }

  _renderDetail() {
    if (this.selSec) { this._renderSecDetail(this.selSec); return; }
    const n = this.sel;
    if (!n) return;
    const st = this._st.get(n.id);
    const d = n.d;
    this.$hUnl.textContent = 'Unlocks';
    this.$hTime.textContent = 'Time';
    this.$hReq.textContent = 'Needs';
    this.$det.dataset.state = st;
    this.$det.style.setProperty('--bc', n.B.color);
    this._setWorking(this._working(n));
    this.$kicker.innerHTML = `<span class="lt-bchip">${this._iconFit(n.B.b.icon, 16)}${esc(n.B.b.name)}</span>${d.tier != null ? `<span class="lt-tier">Tier ${esc(d.tier)}</span>` : ''}`;
    this.$name.textContent = d.name || n.id;
    this.$heroSt.textContent = STATE_TEXT[st].toUpperCase();
    this.$heroSt.className = `lt-hero-st st-${st}`;
    let sub = '';
    if (d.species) { const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species]; if (sp?.latin) sub = ` <i class="lt-latin">${esc(sp.latin)}</i>`; }
    this.$desc.innerHTML = esc(d.desc || '') + sub;
    // unlocks
    const items = this._unlockItems(d);
    this.$unl.innerHTML = items.length
      ? items.map((it) => `<li class="${it.fish ? 'is-fish' : ''}"><span class="lt-art">${it.art}</span><span class="lt-unl-t"><b>${esc(it.name)}</b><small>${esc(it.kind)}</small></span></li>`).join('')
      : '<li class="is-none"><span class="lt-unl-t"><b>Know-how</b><small>Opens up the next research</small></span></li>';
    // time
    if (this._timed() && n.time) {
      const sp = this._speed();
      this.$time.innerHTML = `${G_CLOCK}<b>${fmtDur(n.time / sp)}</b><span class="lt-free">FREE</span>${sp !== 1 ? `<span class="lt-spd">x${sp.toFixed(2).replace(/\.?0+$/, '')} SPEED</span>` : ''}<small>${this._rushOK() ? 'in-game time. Running jobs can be RUSHED with coins' : 'in-game time, starts as soon as you click'}</small>`;
    } else this.$time.innerHTML = '<b>Instant</b><span class="lt-free">FREE</span>';
    // requirements
    let reqs = '';
    for (const r of n.req) {
      const p = this.byId.get(r);
      const ok = this._isRes(r);
      const run = this._jobIds.has(r);
      reqs += `<li class="${ok ? 'ok' : 'bad'}"${p ? ` data-goto="${esc(r)}" role="button" tabindex="0"` : ''}>${ok ? G_CHECK : G_CROSS}<span class="lt-art sm">${p ? this._nodeArt(p, 24) : ''}</span><span>${esc(p?.d.name || human(r))}${run ? ' <em>(researching)</em>' : ''}</span></li>`;
    }
    if (n.zone) {
      const ok = this._zoneOpen(n.zone);
      reqs += `<li class="${ok ? 'ok' : 'bad'} is-zone">${ok ? G_CHECK : G_CROSS}<span class="lt-art sm">${G_PAW}</span><span>Meet ${esc(this._zoneName(n.zone))}${ok ? '' : ' <em>(explore the forest)</em>'}</span></li>`;
    }
    if (!reqs) reqs = `<li class="ok">${G_CHECK}<span>Nothing. Go for it!</span></li>`;
    this.$reqs.innerHTML = reqs;
    // children
    if (n.kids.length) {
      this.$secKids.hidden = false;
      this.$kids.innerHTML = n.kids.map((k) => (k.B.sealed
        ? `<button type="button" class="lt-kid st-sealed" data-goto="${esc(k.id)}"><span class="lt-art sm">${G_LOCK}</span>${esc(scramble(k.d.name, 0.65, hashStr(k.id)))}</button>`
        : `<button type="button" class="lt-kid st-${this._st.get(k.id)}" data-goto="${esc(k.id)}"><span class="lt-art sm">${this._nodeArt(k, 22)}</span>${esc(k.d.name)}</button>`)).join('');
    } else this.$secKids.hidden = true;
    this._renderAct();
  }

  _renderSecDetail(B) {
    const k = this._secKey(B);
    this._secSig = this._keySig(B);
    this.$det.dataset.state = 'sealed';
    this.$det.style.setProperty('--bc', B.color);
    this._setWorking(false);
    this.$hUnl.textContent = 'Encrypted contents';
    this.$hTime.textContent = 'Decrypt cost';
    this.$hReq.textContent = 'Section key';
    this.$kicker.innerHTML = `<span class="lt-bchip">${this._iconFit(B.b.icon, 16)}${esc(B.b.name)}</span><span class="lt-tier is-enc">ENCRYPTED</span>`;
    this.$name.textContent = B.b.name;
    this.$heroSt.textContent = 'ENCRYPTED';
    this.$heroSt.className = 'lt-hero-st st-sealed';
    this.$desc.innerHTML = `<b>${B.nodes.length}</b> research projects are sealed in this folder. Use its <b>section key</b> to decrypt it.`;
    let fish = 0, builds = 0, ups = 0, other = 0;
    for (const n of B.nodes) { if (n.d.species) fish++; else if (n.d.build) builds++; else if (n.d.mods) ups++; else other++; }
    const row = (art, num, what) => (num ? `<li><span class="lt-art">${art}</span><span class="lt-unl-t"><b>${num} ${esc(what)}</b><small>${esc(scramble(what.toUpperCase(), 0.6, num * 31 + what.length))}</small></span></li>` : '');
    this.$unl.innerHTML = row(this._iconFit('fish', 30), fish, fish === 1 ? 'fish species' : 'fish species') + row(this._iconFit('hammer', 30), builds, builds === 1 ? 'thing to build' : 'things to build') + row(this._iconFit('bolt', 28) || G_BOLT, ups, ups === 1 ? 'upgrade' : 'upgrades') + row(this._iconFit('gear', 28), other, 'secrets');
    this.$time.innerHTML = k.coins ? `${G_COIN}<b>${k.coins}</b><span>coins, once</span>` : '<b>FREE</b><span class="lt-free">KEY ONLY</span>';
    let reqs = '';
    for (const x of k.needs || []) {
      const go = x.kind === 'node' && this.byId.has(x.id) ? ` data-goto="${esc(x.id)}" role="button" tabindex="0"` : '';
      const art = x.kind === 'node' && this.byId.get(x.id) ? this._nodeArt(this.byId.get(x.id), 24) : x.kind === 'zone' ? G_PAW : G_COIN;
      reqs += `<li class="${x.ok ? 'ok' : 'bad'}"${go}>${x.ok ? G_CHECK : G_CROSS}<span class="lt-art sm">${art}</span><span>${esc(x.text)}</span></li>`;
    }
    this.$reqs.innerHTML = reqs || `<li class="ok">${G_CHECK}<span>No key needed!</span></li>`;
    this.$secKids.hidden = true;
    this._renderAct();
  }

  _speed() { try { const v = Number(this.o.speed?.()); return v > 0 ? v : 1; } catch { return 1; } }

  _renderAct() {
    const b = this.$go;
    if (this.selSec) {
      const B = this.selSec;
      const k = this._secKey(B);
      b.className = 'lt-go is-dec';
      this.$goFill.style.width = '0%';
      this.$rush.hidden = true;
      b.disabled = !k.canUnlock;
      const miss = (k.needs || []).find((x) => x.kind !== 'coins' && !x.ok);
      if (k.canUnlock) {
        b.classList.add('is-go');
        this.$goL.innerHTML = `${G_KEY} DECRYPT SECTION`;
        this.$goS.textContent = k.coins ? `Pay ${k.coins} coins` : 'Free!';
      } else {
        b.classList.add('is-no');
        this.$goL.innerHTML = `${G_LOCK} ENCRYPTED`;
        this.$goS.textContent = miss ? `Key: ${miss.text}` : `Needs ${k.coins} coins`;
      }
      return;
    }
    const n = this.sel;
    if (!n) return;
    const st = this._st.get(n.id);
    b.className = 'lt-go';
    b.hidden = false;
    this.$goFill.style.width = '0%';
    this.$rush.hidden = !(st === 'run' && this._rushOK());
    if (this._working(n)) {
      // Reynard is on it: the green tube (under him, in the hero) says how far; no button
      b.hidden = true;
      b.disabled = true;
      b.classList.add('is-run');
      this._liveAct();
      return;
    }
    if (st === 'done') {
      b.disabled = true;
      b.classList.add('is-done');
      this.$goL.innerHTML = `${G_CHECK} RESEARCHED`;
      this.$goS.textContent = 'Already in your toolbox';
      return;
    }
    if (st === 'run') {
      b.disabled = true;
      b.classList.add('is-run');
      this._liveAct();
      return;
    }
    const chk = this._check(n);
    b.disabled = !chk.ok;
    if (chk.ok) {
      b.classList.add('is-go');
      this.$goL.textContent = 'RESEARCH — FREE';
      this.$goS.textContent = this._timed() && n.time ? `Takes ${fmtDur(n.time)}` : 'Instant!';
      return;
    }
    b.classList.add('is-no');
    const busy = /bench busy/i.test(chk.reason || '');
    if (busy) b.classList.add('is-busy');
    this.$goL.innerHTML = st === 'locked' ? `${G_LOCK} LOCKED` : st === 'zone' ? `${G_PAW} NEEDS A NEIGHBOUR` : busy ? 'BENCH BUSY' : 'RESEARCH';
    this.$goS.textContent = busy ? this._busyText() : String(chk.reason || '');
  }

  _busyText() {
    if (!this._jobs.length) return 'Lab bench busy';
    const j = this._jobs.reduce((a, b) => (b.left < a.left ? b : a));
    return `Free in ${fmtClock(j.left)} (${j.n?.d.name || 'research'})`;
  }

  _liveAct() {
    const n = this.sel;
    if (!n || this.selSec) return;
    const st = this._st.get(n.id);
    if (this._finish && this._finish.id === n.id) {
      if (this.$tubeP.textContent !== 'DONE!') { this.$tubeP.textContent = 'DONE!'; this.$tubeT.textContent = 'research complete'; }
      this._tubeK = 1;
    } else if (st === 'run') {
      const j = this._job(n.id);
      const k = j ? j.k : 0;
      this._tubeK = k;
      const p = `${Math.floor(k * 100)}%`, l = `${fmtClock(j ? j.left : n.time)} left`;
      if (this.$tubeP.textContent !== p) this.$tubeP.textContent = p;
      if (this.$tubeT.textContent !== l) this.$tubeT.textContent = l;
      if (!this.$rush.hidden) this._livePrices(this.$rushB, n.id);
    } else if (this.$go.classList.contains('is-busy')) this.$goS.textContent = this._busyText();
  }

  // v30: "Reynard is working on it" = the selected node is being researched (or just finished)
  _working(n) {
    if (!n) return false;
    if (this._finish && this._finish.id === n.id) return true;
    return this._st.get(n.id) === 'run';
  }

  _setWorking(on) {
    if (on === this._isWorking) return;
    this._isWorking = on;
    this.$det.classList.toggle('is-working', on);
    this.$work.hidden = !on;
    if (on) {
      if (!this.wb && !this._wbFailed) {
        try { this.wb = new Workbench(this.$wb); } catch (err) { console.warn('Workbench', err); this.wb = null; this._wbFailed = true; }
      }
      this.$hero.classList.toggle('has-wb', !!this.wb);
      this._sizeWork();
      this.wb?.react('start');
    } else this.$hero.classList.remove('has-wb');
  }

  _sizeWork() {
    const bw = this.$hero.clientWidth;
    if (this.wb && bw) this.wb.fit(bw - 8, Math.round(Math.min(220, Math.max(120, bw * 0.6))));
    const tw = this.$work.clientWidth;
    if (tw) this.tube.fit(tw);
  }

  // rush buttons: live price + "can't afford" state
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

  // ------------------------------------------------------------ bench bar
  _renderBench() {
    if (!this.$slots) return;
    if (!this._timed()) {
      this.$slots.innerHTML = '<div class="lt-slotc is-info">Research finishes instantly</div>';
      return;
    }
    const slots = Math.max(this._slots(), this._jobs.length);
    if (this.$benchS) {
      const sp = this._speed();
      this.$benchS.textContent = ` ${this._jobs.length}/${this._slots()}${sp !== 1 ? ` x${sp.toFixed(2).replace(/\.?0+$/, '')}` : ''}`;
    }
    const rush = this._rushOK();
    let h = '';
    for (let i = 0; i < slots; i++) {
      const j = this._jobs[i];
      if (j && j.n) {
        h += `<div class="lt-slotc is-job${rush ? ' has-rush' : ''}" data-job="${esc(j.id)}" style="--bc:${esc(j.n.B.color)}">
          <button type="button" class="lt-slotc-main" data-goto="${esc(j.id)}">
            <span class="lt-art">${this._nodeArt(j.n, 30)}</span>
            <span class="lt-slotc-m"><b>${esc(j.n.d.name)}</b><span class="lt-bar"><i></i></span></span>
            <span class="lt-slotc-t">0:00</span>
          </button>
          ${rush ? `<span class="lt-slotc-r"><button type="button" class="lt-mini" data-rush="half" data-id="${esc(j.id)}" title="Rush: -50% time left">${G_BOLT}<b></b></button><button type="button" class="lt-mini is-now" data-rush="now" data-id="${esc(j.id)}" title="Finish now">${G_FF}<b></b></button></span>` : ''}
        </div>`;
      } else if (j) {
        h += `<div class="lt-slotc is-job" data-job="${esc(j.id)}"><span class="lt-slotc-m"><b>${esc(j.id)}</b><span class="lt-bar"><i></i></span></span><span class="lt-slotc-t">0:00</span></div>`;
      } else {
        const pick = this.nodes.find((n) => this._calc(n) === 'avail');
        h += `<button type="button" class="lt-slotc is-empty"${pick ? ` data-goto="${esc(pick.id)}"` : ''}><span class="lt-plus">+</span><span class="lt-slotc-m"><b>Bench free</b><small>${pick ? 'Pick a ready project!' : 'Nothing ready yet'}</small></span></button>`;
      }
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
      s.bar.style.width = `${(j.k * 100).toFixed(1)}%`;
      const txt = fmtClock(j.left);
      if (s.t.textContent !== txt) s.t.textContent = txt;
      if (s.rush.length) this._livePrices(s.rush, s.id);
    }
    for (const r of this._ibRun || []) {
      const j = this._job(r.id);
      if (!j) continue;
      const txt = fmtClock(j.left);
      if (r.t && r.t.textContent !== txt) r.t.textContent = txt;
      if (r.bar) r.bar.style.width = `${(j.k * 100).toFixed(1)}%`;
    }
    for (const j of this._jobs) {
      const n = j.n;
      if (!n?.$nbar) continue;
      const w = `${(j.k * 100).toFixed(1)}%`;
      if (n._nbw !== w) { n._nbw = w; n.$nbar.style.width = w; }
      const txt = fmtClock(j.left);
      if (n._pillT !== txt) { n._pillT = txt; n.$pill.innerHTML = `<b>${txt}</b>`; n.$pill.hidden = false; }
    }
  }

  // ------------------------------------------------------------ research
  _research() {
    if (this.selSec) { this._decrypt(this.selSec, this.$go); return; }
    const n = this.sel;
    if (!n) return;
    const chk = this._check(n);
    if (!chk.ok) {
      this._sfx('error');
      this._fx(this.$go, 'is-shake', 400);
      this._fx(n.el, 'is-shake', 400);
      if (this._st.get(n.id) !== 'done' && this._st.get(n.id) !== 'run') this.$goS.textContent = /bench busy/i.test(chk.reason || '') ? this._busyText() : String(chk.reason || '');
      if (chk.reason) this._log(`ERR: ${chk.reason}`, 'err');
      return;
    }
    let ok = false;
    try { ok = !!this.o.onResearch?.(n.id); } catch (err) { console.error(err); ok = false; }
    if (!this._alive) return;
    if (!ok) {
      this._sfx('error');
      this._fx(this.$go, 'is-shake', 400);
      this.$goS.textContent = 'Could not start that research';
      return;
    }
    this._fx(this.$go, 'is-press', 300);
    this._pollJobs(true);
    const running = this._jobIds.has(n.id);
    if (running) {
      this._sfx('start');
      this._fly(n);
      this._ring(n, 'start');
      this._log(`synthesizing ${n.d.name}... ETA ${fmtDur(this._job(n.id)?.left || n.time)}`, 'run');
    }
    this.refresh();
    this._renderDetail();
  }

  // ------------------------------------------------------------ v18: paid rushes
  _rush(id, mode, src) {
    const n = this.byId.get(id);
    if (!n || !this._rushOK()) return;
    const price = this._rushPrice(id, mode);
    let res = null;
    try { res = this.o.onRush(id, mode); } catch (err) { console.error(err); res = null; }
    if (!this._alive) return;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res || !res.ok) {
      this._sfx('denied');
      if (src) this._fx(src, 'is-shake', 400);
      this._flash(src, res?.msg || 'Not enough coins');
      this._log(`ERR: ${res?.msg || 'insufficient credits'}`, 'err');
      return;
    }
    this._sfx(mode === 'now' ? 'rushnow' : 'rush');
    this._log(mode === 'now' ? `overclock: ${n.d.name} forced to completion` : `turbo injected: ${n.d.name} -50% time`, 'warn');
    this._coinsFly(src, n.$ico, Math.min(14, 4 + Math.round((price || 10) / 15)));
    this._float(n, mode === 'now' ? 'DONE!' : '-50% TIME', mode);
    this._ring(n, 'warp');
    this._fx(n.el, 'is-warp', 800);
    const card = this.$slots.querySelector(`[data-job="${CSS.escape(id)}"]`);
    if (card) this._fx(card, 'is-boost', 700);
    if (this.sel === n) this._fx(this.$go, 'is-boost', 700);
    this._bumpCoins();
    if (this.sel === n) { this.tube?.splash(1.2); this.wb?.react('rush'); }
    this._pollJobs(true);
    this.refresh();
    if (this.sel === n) this._renderDetail();
  }

  // little message that floats up from a button
  _flash(src, msg) {
    if (!msg) return;
    const rr = this.root.getBoundingClientRect();
    const a = (src || this.$go).getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'lt-flash';
    el.textContent = msg;
    el.style.left = `${clamp(a.left + a.width / 2 - rr.left, 90, rr.width - 90)}px`;
    el.style.top = `${a.top - rr.top - 6}px`;
    this.$fxl.appendChild(el);
    this._later(() => el.remove(), 1600);
  }

  // "-50% TIME" / "DONE!" rising from a node (world space)
  _float(n, text, kind) {
    const el = document.createElement('span');
    el.className = `lt-float is-${kind}`;
    el.textContent = text;
    n.el.appendChild(el);
    this._later(() => el.remove(), 1400);
  }

  // coins fly from the wallet in the header to `to` (an element)
  _coinsFly(src, to, count = 6) {
    if (REDUCED || !this.$coins || this.$coins.hidden) return;
    const rr = this.root.getBoundingClientRect();
    const a = this.$coins.getBoundingClientRect();
    let b = to?.getBoundingClientRect?.();
    const vr = this.view.getBoundingClientRect();
    if (!b || !b.width || b.right < vr.left || b.left > vr.right || b.bottom < vr.top || b.top > vr.bottom) b = (src || this.$go).getBoundingClientRect();
    const ax = a.left + a.width * 0.7 - rr.left, ay = a.top + a.height / 2 - rr.top;
    const bx = b.left + b.width / 2 - rr.left, by = b.top + b.height / 2 - rr.top;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'lt-cfly';
      el.innerHTML = G_COIN;
      el.style.left = `${ax}px`;
      el.style.top = `${ay}px`;
      this.$fxl.appendChild(el);
      const jx = (Math.random() - 0.5) * 60, jy = -40 - Math.random() * 60;
      const anim = el.animate([
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(bx - ax) * 0.35 + jx}px), calc(-50% + ${(by - ay) * 0.2 + jy}px)) scale(1.4)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${bx - ax}px), calc(-50% + ${by - ay}px)) scale(.7)`, opacity: 1 },
      ], { duration: 620 + i * 25, delay: i * 45, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'backwards' });
      anim.onfinish = () => el.remove();
      this._later(() => el.remove(), 1400 + i * 50);
    }
  }
  _bumpCoins() { if (this.$coins) this._fx(this.$coins, 'is-spend', 600); }

  // ------------------------------------------------------------ v18: encrypted sections
  _renderSeal(B) {
    const seal = B.seal;
    if (!seal) return;
    const k = this._secKey(B);
    const sig = JSON.stringify([k.needs?.map((x) => [x.ok, x.text]), k.coins, k.canUnlock]);
    if (seal._sig === sig) return;
    const first = seal._sig == null;
    seal._sig = sig;
    const needs = (k.needs || []).map((x) => `<li class="${x.ok ? 'ok' : 'bad'}"${x.kind === 'node' && this.byId.has(x.id) ? ` data-goto="${esc(x.id)}"` : ''}>${x.ok ? G_CHECK : G_CROSS}<span>${esc(x.text)}</span></li>`).join('');
    const body = `<div class="lt-seal-card">
        <div class="lt-seal-top">${G_SEAL}<div class="lt-seal-tt"><span class="lt-seal-k">ENCRYPTED FOLDER</span><span class="lt-seal-n">${esc(B.b.name)}</span><span class="lt-seal-c">${B.nodes.length} PROJECTS LOCKED <i>${esc(scramble('XXXXXXXX', 1, hashStr(B.b.id)))}</i></span></div></div>
        ${needs ? `<ul class="lt-seal-req">${needs}</ul>` : ''}
        <button type="button" class="lt-decrypt${k.canUnlock ? ' is-ready' : ''}">${G_KEY}<span>DECRYPT</span>${k.coins ? `<small>${G_COIN}${k.coins}</small>` : '<small>FREE</small>'}</button>
      </div>`;
    if (first) {
      let ghosts = '';
      for (const n of B.nodes) ghosts += `<i style="left:${Math.round(n.x - B.sx - 28)}px;top:${Math.round(n.y - B.sy - 28)}px;--d:${hashStr(n.id) % 1200}ms"><b>?</b></i>`;
      seal.innerHTML = `<div class="lt-seal-bg"></div><div class="lt-seal-ghosts">${ghosts}</div><div class="lt-seal-body">${body}</div>`;
    } else seal.querySelector('.lt-seal-body').innerHTML = body;
  }

  _decrypt(B, src) {
    if (!B || !B.sealed) return;
    const k = this._secKey(B);
    let res = null;
    try { res = this.o.sections?.unlock?.(B.b.id) ?? null; } catch (err) { console.error(err); res = null; }
    if (!this._alive) return;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res || !res.ok) {
      this._sfx('denied');
      if (src) this._fx(src, 'is-shake', 400);
      this._fx(B.seal, 'is-denied', 600);
      this._flash(src || this.$go, res?.msg || 'Access denied');
      this._log(`ACCESS DENIED: ${B.dos}`, 'err');
      this._glitch();
      return;
    }
    this._sfx('decrypt');
    this._log(`decrypting ${B.dos}... key accepted`, 'warn');
    if (k.coins) { this._coinsFly(src, B.seal.querySelector('.lt-seal-top') || B.seal, Math.min(14, 4 + Math.round(k.coins / 15))); this._bumpCoins(); }
    this.refresh();
  }

  _decrypted(B) {
    const seal = B.seal;
    if (seal) {
      seal.hidden = false;
      const t = seal.querySelector('.lt-seal-k');
      if (t) t.textContent = 'ACCESS GRANTED';
      seal.classList.add('is-decrypt');
      this._later(() => { seal.classList.remove('is-decrypt', 'is-sel'); seal.hidden = true; }, REDUCED ? 10 : 1250);
    }
    B.nodes.forEach((n, i) => {
      n.el.classList.add('is-hide');
      this._later(() => { n.el.classList.remove('is-hide'); this._fx(n.el, 'is-reveal', 900); }, REDUCED ? 0 : 650 + Math.min(i, 14) * 70);
    });
    this._toast({ html: `<div class="lt-toast-c is-sec" style="--bc:${esc(B.color)}"><span class="lt-toast-k">FOLDER DECRYPTED</span><div class="lt-toast-r"><span class="lt-art">${this._iconFit(B.b.icon, 32)}</span><b>${esc(B.b.name)}</b></div><div class="lt-toast-n">${B.nodes.length} new research projects!</div></div>` });
    this._log(`${B.dos} decrypted: ${B.nodes.length} projects`, 'ok', REDUCED ? 0 : 900);
    this._glitch();
    this._fitRect(B.sx - 20, B.sy - 30, B.sx + B.sw + 20, B.sy + B.sh + 30, 1);
  }

  // a copy of the node icon flies down to its bench slot
  _fly(n) {
    if (REDUCED) return;
    const slot = this.$slots.querySelector(`[data-job="${CSS.escape(n.id)}"] .lt-art`) || this.$slots;
    const rr = this.root.getBoundingClientRect();
    const from = (this.loc?.k === 'ready' && this.$inbox.querySelector(`[data-ib="${CSS.escape(n.id)}"] .lt-ib-slot`)) || n.$ico;
    const a = from.getBoundingClientRect(), b = slot.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const el = document.createElement('div');
    el.className = 'lt-fly';
    el.innerHTML = this._nodeArt(n, 40);
    el.style.left = `${a.left + a.width / 2 - rr.left}px`;
    el.style.top = `${a.top + a.height / 2 - rr.top}px`;
    this.$fxl.appendChild(el);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const lift = Math.min(-60, dy * -0.35);
    const anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.2 + lift}px)) scale(1.35)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.9 },
    ], { duration: 650, easing: 'cubic-bezier(.4,0,.6,1)' });
    anim.onfinish = () => {
      el.remove();
      const card = this.$slots.querySelector(`[data-job="${CSS.escape(n.id)}"]`);
      if (card) this._fx(card, 'is-land', 500);
    };
    this._later(() => el.remove(), 900);
  }

  // expanding ring + sparkles on a node
  _ring(n, kind) {
    let sp = n.el.querySelector('.lt-spk');
    if (!sp) { sp = document.createElement('span'); sp.className = 'lt-spk'; n.el.appendChild(sp); }
    const count = kind === 'done' ? 12 : 8;
    let h = `<i class="lt-wave ${kind}"></i>`;
    const R = rng(hashStr(n.id) ^ (now() | 0));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * 360 + R() * 20;
      const dist = (kind === 'done' ? 64 : 48) + R() * 24;
      h += `<b style="--a:${a.toFixed(0)}deg;--d:${dist.toFixed(0)}px;--dl:${(R() * 80).toFixed(0)}ms" class="${kind}"></b>`;
    }
    sp.innerHTML = h;
    this._later(() => { if (sp.isConnected) sp.innerHTML = ''; }, 1100);
  }

  _celebrate(n, prev) {
    if (prev === 'run' && n === this.sel) {
      this._finish = { id: n.id };
      this.tube.splash(1.5);
      this.wb?.react('done');
      this._sfx('foxyay');
      if (!REDUCED) this._tubeBurst();
      this._later(() => { if (this._finish?.id === n.id) { this._finish = null; this._renderDetail(); } }, 2700);
    }
    this._ring(n, 'done');
    this._fx(n.el, 'is-burst', 1100);
    this._sfx('done');
    this._log(`${n.d.name}: research complete. blueprint compiled OK`, 'ok');
    if (prev === 'run' || prev === 'avail') this._toast(n);
    if (n === this.sel && !REDUCED) this._burstHero();
    this._later(() => { if (n.kids.some((k) => this._st.get(k.id) === 'avail')) this._sfx('unlock'); }, 450);
  }

  _toast(n) {
    this._toasts.push(n);
    if (this._toastOn) return;
    const next = () => {
      const m = this._toasts.shift();
      if (!m || !this._alive) { this._toastOn = false; return; }
      this._toastOn = true;
      if (m.html) {
        this.$toast.innerHTML = m.html;
        this.$toast.classList.remove('is-on');
        void this.$toast.offsetWidth;
        this.$toast.classList.add('is-on');
        this._later(() => { this.$toast.classList.remove('is-on'); this._later(next, 320); }, 2600);
        return;
      }
      const items = this._unlockItems(m.d).slice(0, 3);
      const fresh = m.kids.filter((k) => this._st.get(k.id) === 'avail');
      this.$toast.innerHTML = `<div class="lt-toast-c" style="--bc:${esc(m.B.color)}">
        <span class="lt-toast-k">RESEARCH COMPLETE!</span>
        <div class="lt-toast-r"><span class="lt-art">${this._nodeArt(m, 44)}</span><b>${esc(m.d.name)}</b></div>
        ${items.length ? `<div class="lt-toast-u">${items.map((it) => `<span><span class="lt-art sm">${it.art}</span>${esc(it.name)}</span>`).join('')}</div>` : ''}
        ${fresh.length ? `<div class="lt-toast-n">New: ${fresh.slice(0, 3).map((k) => esc(k.d.name)).join(', ')}${fresh.length > 3 ? '...' : ''}</div>` : ''}
      </div>`;
      this.$toast.classList.remove('is-on');
      void this.$toast.offsetWidth;
      this.$toast.classList.add('is-on');
      this._later(() => { this.$toast.classList.remove('is-on'); this._later(next, 320); }, 2800);
    };
    next();
  }

  _burstHero() {
    const R = rng(now() | 0);
    for (let i = 0; i < 30; i++) {
      const a = R() * Math.PI * 2, v = 30 + R() * 70;
      this._bursts.push({ x: PW / 2, y: PH / 2 - 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0, life: 0.6 + R() * 0.6, c: R() < 0.5 ? '#fff7c4' : R() < 0.5 ? '#7dffa8' : '#ffcc3a' });
    }
  }

  _surge(e) {
    const p = e.core;
    if (!p || REDUCED || typeof p.getTotalLength !== 'function') return;
    let L = 0;
    try { L = p.getTotalLength(); } catch { L = 0; }
    if (!L) return;
    p.classList.add('is-surge');
    p.style.strokeDasharray = `${L} ${L}`;
    p.style.strokeDashoffset = `${L}`;
    void p.getBoundingClientRect();
    p.style.transition = 'stroke-dashoffset .8s ease-out';
    p.style.strokeDashoffset = '0';
    this._later(() => { p.classList.remove('is-surge'); p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }, 900);
  }

  _onFish(m) {
    if (!this._alive || !m || typeof m.fishCanvas !== 'function') return;
    if (this.o.fishCanvas) return;
    this._fish = m;
    this._fishFrames.clear();
    for (const n of this.nodes) if (n.d.species) n.$ico.innerHTML = this._nodeArt(n);
    if (this.sel?.d.species) this._renderDetail();
    this._renderBench();
  }

  // ------------------------------------------------------------ loop
  _loop = (t) => {
    if (!this._alive) return;
    this._raf = requestAnimationFrame(this._loop);
    t = t || now();
    const dtms = Math.min(50, t - (this._lastFrame || t));
    this._lastFrame = t;
    // camera
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
      this._vel.x *= f;
      this._vel.y *= f;
      if (Math.hypot(this._vel.x, this._vel.y) < 0.02) this._vel = null;
      this._applyCam();
    }
    // jobs: live progress every frame, full state refresh on change / every 400ms
    const changed = this._pollJobs(false);
    this._liveBench();
    if (changed || t - this._lastPoll > 400) {
      this._lastPoll = t;
      this.refresh();
    }
    this._liveAct();
    // [v31 lab] Reynard at his desk + the green liquid tube (only while a selected job runs)
    if (this._isWorking && this.loc && t - (this._lastWork || 0) >= 33) {
      const dt = clamp((t - (this._lastWork || t)) / 1000, 1 / 60, 0.1);
      this._lastWork = t;
      const n = this.sel;
      const k = this._tubeK ?? 0;
      this.tube.draw((t - this._t0) / 1000, k, { done: !!(n && this._finish?.id === n.id), dt });
      if (this.wb) {
        this.wb.setJob({ title: n?.d.name || '', art: this._artSrc(n), k });
        try { this.wb.update(dt); } catch (err) { console.warn('Workbench', err); this.wb = null; this._wbFailed = true; this.$hero.classList.remove('has-wb'); }
      }
    }
    // wallet
    const coins = this._coins();
    if (coins !== this._lastCoins && this.$coinsV) {
      this.$coinsV.textContent = coins == null ? '-' : Math.floor(coins).toLocaleString('en-US');
      this._lastCoins = coins;
    }
    // v19: terminal uptime clock (text changes once a second)
    const up = Math.floor((t - this._t0) / 1000);
    if (up !== this._up && this.$termClk) { this._up = up; this.$termClk.textContent = fmtClock(up); }
    // Reynard
    // showcase canvas ~30fps
    if (t - this._lastDraw >= 33) {
      const dt = Math.min(0.1, (t - (this._lastDraw || t)) / 1000);
      this._lastDraw = t;
      this._drawHero((t - this._t0) / 1000, dt);
    }
  };

  _drawHero(t, dt) {
    if (this.selSec && this.$hero.offsetParent !== null) { this._drawSealHero(t); return; }
    const n = this.sel;
    if (!n || this.$hero.offsetParent === null) return;
    const cv = this.pcv, ctx = this.pctx;
    const st = this._st.get(n.id);
    let custom = false;
    if (this.o.preview && st !== 'locked' && st !== 'zone') {
      try { custom = !!this.o.preview(n.d, cv, t); } catch { custom = false; }
    }
    if (!custom) {
      if (cv.width !== PW || cv.height !== PH) { cv.width = PW; cv.height = PH; }
      ctx.imageSmoothingEnabled = false;
      const W = cv.width, H = cv.height;
      drawBackdrop(ctx, W, H, t, st);
      const dark = st === 'locked' || st === 'zone';
      if (n.d.species && this._fishFrame(n.d.species, 0)) this._drawFish(ctx, W, H, t, n.d.species, dark);
      else this._drawIcon(ctx, W, H, t, n, dark);
      if (st === 'run') {
        const j = this._job(n.id);
        const k = j ? j.k : 0;
        ctx.fillStyle = '#03100a';
        ctx.fillRect(8, H - 8, W - 16, 4);
        ctx.fillStyle = '#8ef5aa';
        ctx.fillRect(8, H - 8, Math.round((W - 16) * k), 4);
      }
      drawScan(ctx, W, H, t);
      if (!dark) drawSparkles(ctx, W, H, t, hashStr(n.id), st === 'done' ? 7 : 4);
    }
    this._drawBursts(ctx, dt);
  }

  // an encrypted folder: a brass padlock over scrambled phosphor data
  _drawSealHero(t) {
    const cv = this.pcv, ctx = this.pctx;
    if (cv.width !== PW || cv.height !== PH) { cv.width = PW; cv.height = PH; }
    const W = PW, H = PH;
    drawBackdrop(ctx, W, H, t, 'locked');
    const R = rng(Math.floor(t * 3) + 1);
    ctx.font = "8px 'TBME Body', monospace"; // [v18 font]
    ctx.textAlign = 'left';
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#1b5a30' : '#123d21';
      ctx.fillText(scramble('XXXXXXXXXXXXXXXXXXXXXXX', 1, Math.floor(t * 2) * 13 + i), -4 + ((i * 37) % 11), 8 + i * 8);
    }
    const cx = Math.round(W / 2), cy = Math.round(H / 2) + 4 + (Math.floor(t * 2) % 2);
    // padlock: dark outline, steel shackle, brass body with a keyhole
    ctx.fillStyle = '#120c02';
    ctx.fillRect(cx - 9, cy - 21, 18, 4);
    ctx.fillRect(cx - 9, cy - 21, 5, 14);
    ctx.fillRect(cx + 4, cy - 21, 5, 14);
    ctx.fillRect(cx - 13, cy - 9, 26, 21);
    ctx.fillStyle = '#c8d0c0';
    ctx.fillRect(cx - 7, cy - 19, 14, 2);
    ctx.fillRect(cx - 7, cy - 19, 2, 11);
    ctx.fillRect(cx + 5, cy - 19, 2, 11);
    ctx.fillStyle = '#e0a838';
    ctx.fillRect(cx - 11, cy - 7, 22, 17);
    ctx.fillStyle = '#8a5a14';
    ctx.fillRect(cx + 7, cy - 7, 4, 17);
    ctx.fillRect(cx - 11, cy + 8, 22, 2);
    ctx.fillStyle = '#fff0a8';
    ctx.fillRect(cx - 11, cy - 7, 18, 1);
    ctx.fillStyle = '#120c02';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
    ctx.fillRect(cx - 1, cy + 2, 2, 4);
    drawScan(ctx, W, H, t);
    this._drawBursts(ctx, 0.033);
  }

  _silhouette(img, w, h) {
    const k = img.src + w + 'x' + h;
    let c = this._silhouettes.get(k);
    if (!c) {
      c = makeCanvas(w, h);
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(img, 0, 0, w, h);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#05080a';
      x.fillRect(0, 0, w, h);
      this._silhouettes.set(k, c);
    }
    return c;
  }

  _drawIcon(ctx, W, H, t, n, dark) {
    let m = this._iconMeta(n.d.icon);
    if (!m.ok) m = this._iconMeta('flask');
    const img = m.img;
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = Math.max(1, Math.floor(Math.min((H * 0.6) / m.h, (W * 0.5) / m.w)));
    const w = m.w * s, h = m.h * s;
    const bob = dark ? 0 : Math.round(Math.sin(t * 2.2) * 2.5);
    const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2 - 5 + bob);
    const sw = Math.round(w * (0.62 - bob * 0.03));
    ctx.fillStyle = '#020a05';
    ctx.fillRect(Math.round(W / 2 - sw / 2), H - 15, sw, 3);
    if (dark) {
      try { ctx.drawImage(this._silhouette(img, w, h), x, y); } catch { /* ignore */ }
      ctx.fillStyle = '#1f5a34';
      ctx.font = "24px 'TBME Title', monospace"; // [v18 font]
      ctx.textAlign = 'center';
      ctx.fillText('?', W / 2, H / 2 + 4);
    } else ctx.drawImage(img, x, y, w, h);
  }

  _drawFish(ctx, W, H, t, sp, dark) {
    const frame = dark ? 0 : Math.floor(t * 6) % 4;
    const f = this._fishFrame(sp, frame) || this._fishFrame(sp, 0);
    if (!f) return;
    const s = Math.max(1, Math.floor(Math.min((W * 0.46) / f.width, (H * 0.5) / f.height)));
    const w = f.width * s, h = f.height * s;
    const range = dark ? 0 : Math.max(0, (W - w) / 2 - 10);
    const ph = t * 0.75;
    const cx = W / 2 + Math.sin(ph) * range;
    const right = dark || Math.cos(ph) >= 0;
    const y = Math.round(H / 2 - h / 2 - 4 + (dark ? 0 : Math.sin(t * 2.7) * 2));
    const x = Math.round(cx - w / 2);
    ctx.save();
    if (!right) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
    if (dark) {
      const c = makeCanvas(w, h), cx2 = c.getContext('2d');
      cx2.imageSmoothingEnabled = false;
      cx2.drawImage(f, 0, 0, w, h);
      cx2.globalCompositeOperation = 'source-in';
      cx2.fillStyle = '#05080a';
      cx2.fillRect(0, 0, w, h);
      ctx.drawImage(c, x, y);
    } else ctx.drawImage(f, x, y, w, h);
    ctx.restore();
    if (dark) return;
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.6 + i * 0.27) % 1;
      const bx = Math.round(cx + (right ? w / 2 : -w / 2) * 0.8 + Math.sin(t * 3 + i) * 2);
      const by = Math.round(y + h * 0.3 - k * 34);
      if (by < 4) continue;
      ctx.fillStyle = k < 0.5 ? '#c8ffd2' : '#6fcf8e';
      ctx.fillRect(bx, by, i % 2 ? 1 : 2, i % 2 ? 1 : 2);
    }
  }

  _drawBursts(ctx, dt) {
    if (!this._bursts.length) return;
    const keep = [];
    for (const p of this._bursts) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 60 * dt;
      p.vx *= 0.97;
      const k = 1 - p.t / p.life;
      ctx.fillStyle = p.c;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (k > 0.5) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); } else ctx.fillRect(x, y, 1, 1);
      keep.push(p);
    }
    this._bursts = keep;
  }
}

// ---------------------------------------------------------------- showcase drawing
// [v31 lab] a phosphor bench: dark green, a scrolling dot grid, a flat (quantised) pool of
// light in the state's colour and a pulsing ring of dots under the art. No smooth gradients.
const HERO_TINT = { done: '#ffd25a', run: '#8ef5aa', avail: '#7cf29e', zone: '#e8a030', locked: '#5a7a64' };
function drawBackdrop(ctx, W, H, t, st) {
  const tint = HERO_TINT[st] || HERO_TINT.avail;
  const dark = st === 'locked' || st === 'zone';
  ctx.fillStyle = dark ? '#06100a' : '#071a0e';
  ctx.fillRect(0, 0, W, H);
  const off = Math.floor(t * 4) % 8;
  ctx.fillStyle = dark ? '#0c1a10' : '#0f2c19';
  for (let y = off % 4; y < H; y += 4) for (let x = (y >> 2) % 2 ? 2 : 0; x < W; x += 8) ctx.fillRect(x, y, 1, 1);
  // a pool of light: three flat bands, stepped (not a gradient)
  const cx = W / 2, cy = H - 13;
  ctx.fillStyle = tint;
  for (const [rx, ry, a] of [[52, 20, 0.05], [36, 13, 0.07], [22, 8, 0.1]]) {
    ctx.globalAlpha = dark ? a * 0.4 : a;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y - 12), w * 2, 1);
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) {
    const rx = 18 + i * 9, ry = 3 + i * 1.6;
    const pulse = (t * 0.9 + i / 3) % 1;
    ctx.globalAlpha = (dark ? 0.12 : 0.25) + (dark ? 0.15 : 0.5) * (1 - Math.abs(pulse - 0.5) * 2);
    for (let k = 0; k < 48; k++) {
      const ang = (k / 48) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * rx), Math.round(cy + Math.sin(ang) * ry), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawScan(ctx, W, H, t) {
  const y = Math.floor(((t * 34) % (H + 26)) - 12);
  ctx.fillStyle = '#b8ffc8';
  for (let i = 0; i < 4; i++) {
    const yy = y - i * 2;
    if (yy < 0 || yy >= H) continue;
    ctx.globalAlpha = i === 0 ? 0.16 : 0.05;
    ctx.fillRect(0, yy, W, 1);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let yy = 1; yy < H; yy += 2) ctx.fillRect(0, yy, W, 1);
}

function drawSparkles(ctx, W, H, t, seed, count) {
  for (let i = 0; i < count; i++) {
    const cyc = t * 0.8 + i * 0.37;
    const k = Math.floor(cyc);
    const ph = cyc - k;
    const R = rng((seed ^ Math.imul(k + 1, 2654435761) ^ Math.imul(i + 7, 40503)) >>> 0);
    const x = Math.round(W * 0.22 + R() * W * 0.56), y = Math.round(H * 0.12 + R() * H * 0.62);
    if (ph > 0.6) continue;
    const s = ph < 0.2 || ph > 0.45 ? 0 : 1;
    ctx.fillStyle = R() < 0.5 ? '#d0ffd8' : '#ffe890';
    ctx.fillRect(x, y, 1, 1);
    if (s) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
}
