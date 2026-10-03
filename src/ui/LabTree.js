// LabTree: Reynard's research skill tree, shown on the lab computer.
//
// Research is FREE but TIMED: picking a node puts it on a lab "bench" and it
// finishes after `time` seconds of game time. The tree is a pan/zoom canvas of
// branches (one coloured band per branch, nodes laid out by `col` / `row`),
// joined by pipes routed around other nodes. A detail panel shows what a node
// unlocks (art + names), its time and its requirements (with ✓ / ✗), and a big
// "RESEARCH — FREE" button. The bench bar at the bottom shows running jobs.
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
//     onClose,
//   });
//   tree.refresh(); tree.select(id); tree.destroy();
//
// The container should be a positioned element with a size; the tree fills it.
import './labtree.css';
import * as SPECIES_DATA from '../data/species.js';
import * as STRUCT_DATA from '../data/structures.js';

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
  s = Math.max(0, Math.ceil(Number(s) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m ${String(r).padStart(2, '0')}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export function fmtClock(s) {
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
  brass: { k: '#150b04', h: '#eec38a', g: '#b87c3a', a: '#8a5528', s: '#5e3719', i: '#241306', y: '#ffe2b4', o: '#3e220c', e: '#7dffa8', E: '#e8fff0', w: '#14262a', v: '#102024' },
  teal: { k: '#03141a', h: '#d0f8ff', g: '#5fd0f0', a: '#2c9cc8', s: '#1a6688', i: '#06222c', y: '#ffffff', o: '#0c3a4a', e: '#ffe14a', E: '#fffbd0', w: '#0a2a34', v: '#08222c' },
  iron: { k: '#040405', h: '#6e737d', g: '#454953', a: '#33363e', s: '#22242a', i: '#0a0b0d', y: '#8a8f99', o: '#141519', e: '#5a2020', E: '#8a3a3a', w: '#14181c', v: '#101418' },
  ember: { k: '#070405', h: '#8a7a6a', g: '#5a4a40', a: '#463a32', s: '#2c2420', i: '#0c0908', y: '#a89a88', o: '#1a1410', e: '#ff9a3a', E: '#ffe0b0', w: '#1a1612', v: '#15120f' },
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
const G_CROSS = pixSVG(['r...r', '.r.r.', '..r..', '.r.r.', 'r...r'], { r: '#ff6a5a' }, 2, 'lt-g');
const G_CLOCK = pixSVG(['.kkkk.', 'kwwkwk', 'kwwkwk', 'kwwkkk', 'kwwwwk', '.kkkk.'], { k: '#2b2a24', w: '#fff1c8' }, 2, 'lt-g');
const G_LOCK = pixSVG(['.kkk.', 'k...k', 'k...k', 'kkkkk', 'kgggk', 'kgkgk', 'kgggk', 'kkkkk'], { k: '#1a1410', g: '#ffd23f' }, 2, 'lt-g');
const G_PAW = pixSVG(['.k.k.', 'k.k.k', '.....', '.kkk.', 'kkkkk', '.kkk.'], { k: '#ffb060' }, 2, 'lt-g');
const G_FIT = pixSVG(['kk.kk', 'k...k', '.....', 'k...k', 'kk.kk'], { k: '#f4ecd2' }, 3, 'lt-g');

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
};

export class LabTree {
  static _art = { slotCanvas, SLOT_PALS };

  constructor(container, opts = {}) {
    this.container = container;
    this.o = opts;
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
    this.cam = { x: 0, y: 0, z: 1 };
    this.goal = null;

    this._layout(opts);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this._buildDOM();
    this._buildTree();
    this._buildChips();
    this._pollJobs(true);
    this.refresh(true);
    this._bind();
    this._resize();
    const first = this._initialNode();
    if (first) this._select(first, { pan: false, sound: false, open: false });
    this._centerOn(first, true);
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
      const B = { b, i: bi, lane0: lane, lanes: rows, nodes: [], color: b.color || '#7dffa8' };
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
    for (const n of this.nodes) {
      const st = this._calc(n);
      const prev = this._st.get(n.id);
      if (prev === st) continue;
      this._st.set(n.id, st);
      const el = n.el;
      for (const s of ['done', 'run', 'avail', 'zone', 'locked']) el.classList.toggle(`is-${s}`, st === s);
      el.style.setProperty('--slot', `var(--lt-slot-${st === 'done' ? 'gold' : st === 'avail' ? 'brass' : st === 'run' ? 'teal' : st === 'zone' ? 'ember' : 'iron'})`);
      el.setAttribute('aria-label', `${n.d.name}: ${STATE_TEXT[st]}`);
      this._nodeBadge(n, st);
      if (!initial && prev) changed.push([n, prev, st]);
    }
    // pipes
    for (const e of this.edges) {
      const a = this._st.get(e.src.id), b = this._st.get(e.dst.id);
      const s = a === 'done' ? (b === 'done' ? 'done' : b === 'run' ? 'run' : 'on') : 'off';
      if (e.s === s) continue;
      const was = e.s;
      e.s = s;
      for (const p of e.els) p.setAttribute('data-s', s);
      if (!initial && was === 'off' && s !== 'off') this._surge(e);
    }
    for (const [n, prev, st] of changed) {
      if (st === 'done') this._celebrate(n, prev);
      else if ((prev === 'locked' || prev === 'zone') && (st === 'avail' || st === 'zone')) this._fx(n.el, 'is-unlocking', 900);
      else if (st === 'run' && prev !== 'run') this._fx(n.el, 'is-start', 900);
    }
    const done = this.nodes.reduce((a, n) => a + (this._st.get(n.id) === 'done' ? 1 : 0), 0);
    this.$count.innerHTML = `<b>${done}</b>/${this.nodes.length}`;
    this.$cbar.style.width = `${this.nodes.length ? (done / this.nodes.length) * 100 : 0}%`;
    this._updateChips();
    if (this.filter) this._applyFilter(false);
    if (this.sel && (initial || changed.some(([n]) => n === this.sel || n.kids.includes(this.sel) || this.sel.req.includes(n.id)))) this._renderDetail();
    else if (this.sel) this._renderAct();
  }

  select(id) {
    const n = this.byId.get(id);
    if (n) this._select(n, { pan: true, sound: false, open: true });
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
    this.root.remove();
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
    root.innerHTML = `
      <div class="lt-bezel">
        <div class="lt-screen">
          <header class="lt-head">
            ${FOX_LOGO}
            <div class="lt-titles"><h1>Reynard Labs</h1><span class="lt-tag">Research is <b>FREE</b>. It just takes time!</span></div>
            <div class="lt-count" title="Researched"><span class="lt-count-t"></span><span class="lt-cbar"><i></i></span></div>
            <button class="lt-close" type="button" aria-label="Close research (Esc)"><span>EXIT</span><kbd>ESC</kbd></button>
          </header>
          <nav class="lt-chips" aria-label="Branches"></nav>
          <div class="lt-body">
            <div class="lt-view" tabindex="0" aria-label="Research tree. Drag to pan, scroll or pinch to zoom.">
              <div class="lt-world"></div>
              <div class="lt-tabs" aria-hidden="true"></div>
              <div class="lt-zoom">
                <button type="button" data-z="in" aria-label="Zoom in">+</button>
                <button type="button" data-z="out" aria-label="Zoom out">−</button>
                <button type="button" data-z="fit" aria-label="Show everything">${G_FIT}</button>
              </div>
              <div class="lt-tip" aria-hidden="true"></div>
              <div class="lt-toast" aria-live="polite"></div>
            </div>
            <aside class="lt-det" aria-live="polite">
              <button class="lt-det-x" type="button" aria-label="Close details">×</button>
              <div class="lt-det-scroll">
                <div class="lt-hero"><canvas width="${PW}" height="${PH}"></canvas><span class="lt-hero-st"></span></div>
                <div class="lt-kicker"></div>
                <h2 class="lt-name"></h2>
                <p class="lt-desc"></p>
                <div class="lt-sec lt-sec-unl"><h3>Unlocks</h3><ul class="lt-unl"></ul></div>
                <div class="lt-sec lt-sec-time"><h3>Time</h3><div class="lt-time"></div></div>
                <div class="lt-sec lt-sec-req"><h3>Needs</h3><ul class="lt-reqs"></ul></div>
                <div class="lt-sec lt-sec-kids"><h3>Leads to</h3><div class="lt-kids"></div></div>
              </div>
              <div class="lt-act">
                <button class="lt-go" type="button"><span class="lt-go-fill"></span><span class="lt-go-l"></span><span class="lt-go-s"></span></button>
              </div>
            </aside>
          </div>
          <footer class="lt-bench">
            <span class="lt-bench-l">${this._iconFit('flask', 18)}<span>BENCH</span></span>
            <div class="lt-slots"></div>
            <div class="lt-keys"><kbd>DRAG</kbd> pan <kbd>WHEEL</kbd> zoom <kbd>ENTER</kbd> research</div>
          </footer>
          <div class="lt-fx" aria-hidden="true"></div>
        </div>
      </div>`;
    this.container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.view = $('.lt-view');
    this.world = $('.lt-world');
    this.$tabs = $('.lt-tabs');
    this.$tip = $('.lt-tip');
    this.$toast = $('.lt-toast');
    this.$chips = $('.lt-chips');
    this.$det = $('.lt-det');
    this.$hero = $('.lt-hero');
    this.$heroSt = $('.lt-hero-st');
    this.pcv = $('.lt-hero canvas');
    this.pctx = this.pcv.getContext('2d');
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
    const rs = root.style;
    for (const [k, p] of Object.entries(SLOT_PALS)) rs.setProperty(`--lt-slot-${k}`, `url(${slotCanvas(p).toDataURL()})`);
    if (!REDUCED) this._fx(root, 'is-boot', 700);
  }

  _buildTree() {
    const W = this.W, H = this.H;
    this.world.style.width = `${W}px`;
    this.world.style.height = `${H}px`;
    this.edges = routePipes(this.nodes, this.byId, this.GW, this.GH);

    // bands
    let bands = '';
    let tabs = '';
    for (const B of this.branches) {
      const c = esc(B.color);
      bands += `<div class="lt-band${B.i % 2 ? ' odd' : ''}" data-b="${B.i}" style="top:${B.y}px;height:${B.h}px;--bc:${c}"></div>`;
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
    let lo = '', lc = '', lf = '', lx = '';
    this.edges.forEach((e, i) => {
      const d = P(e.pts);
      e.d = d;
      lo += `<path class="lp-o" data-e="${i}" d="${d}"/>`;
      lc += `<path class="lp-c" data-e="${i}" d="${d}"/>`;
      lf += `<path class="lp-f" data-e="${i}" d="${d}"/>`;
      for (const br of e.bridges) {
        const x = this._X(br.gx), y = this._Y(br.gy), L = 14;
        const bd = br.h ? `M${x - L} ${y}L${x + L} ${y}` : `M${x} ${y - L}L${x} ${y + L}`;
        lx += `<path class="lp-o lp-bo" data-e="${i}" d="${bd}"/><path class="lp-c" data-e="${i}" d="${bd}"/>`;
      }
    });
    const svg = `<svg class="lt-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <g>${lo}</g><g>${lc}</g><g>${lf}</g><g>${lx}</g></svg>`;

    let nodes = '';
    for (const n of this.nodes) {
      nodes += `<button class="lt-node" type="button" tabindex="-1" data-id="${esc(n.id)}" style="left:${n.x - NODE / 2}px;top:${n.y - NODE / 2}px;--bc:${esc(n.B.color)}">
        <span class="lt-slot"></span><span class="lt-ico"></span>
        <svg class="lt-ring" viewBox="-50 -50 100 100" aria-hidden="true"><circle class="bg" r="45"/><circle class="fg" r="45" pathLength="100"/></svg>
        <span class="lt-badge"></span>
        <span class="lt-pill"></span>
        <span class="lt-nm"><span class="lt-nm-t">${esc(n.d.name)}</span><span class="lt-nm-w"></span></span>
      </button>`;
    }
    this.world.innerHTML = `<div class="lt-bands">${bands}</div>${svg}${nodes}<div class="lt-ret" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`;
    this.$ret = this.world.querySelector('.lt-ret');
    for (const n of this.nodes) {
      n.el = this.world.querySelector(`.lt-node[data-id="${CSS.escape(n.id)}"]`);
      n.$ico = n.el.querySelector('.lt-ico');
      n.$ring = n.el.querySelector('.lt-ring .fg');
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

  _buildChips() {
    let h = `<button type="button" class="lt-chip is-on" data-f="">All</button>`;
    h += `<button type="button" class="lt-chip lt-chip-ready" data-f="@ready"><i class="lt-dot"></i>Ready <b class="lt-chip-n"></b></button>`;
    for (const B of this.branches) {
      h += `<button type="button" class="lt-chip" data-f="${B.i}" style="--bc:${esc(B.color)}">${this._iconFit(B.b.icon, 18)}<span>${esc(B.b.name)}</span><b class="lt-chip-n"></b></button>`;
    }
    this.$chips.innerHTML = h;
    this.$chipEls = [...this.$chips.querySelectorAll('.lt-chip')];
  }

  _updateChips() {
    if (!this.$chipEls) return;
    let ready = 0;
    for (const n of this.nodes) if (this._st.get(n.id) === 'avail') ready++;
    for (const c of this.$chipEls) {
      const f = c.dataset.f;
      const nEl = c.querySelector('.lt-chip-n');
      if (!nEl) continue;
      if (f === '@ready') { nEl.textContent = String(ready); c.classList.toggle('is-zero', !ready); continue; }
      const B = this.branches[+f];
      if (!B) continue;
      const d = B.nodes.reduce((a, n) => a + (this._st.get(n.id) === 'done' ? 1 : 0), 0);
      const av = B.nodes.some((n) => this._st.get(n.id) === 'avail');
      nEl.textContent = `${d}/${B.nodes.length}`;
      c.classList.toggle('has-ready', av);
      c.classList.toggle('is-full', d === B.nodes.length);
    }
  }

  _setFilter(f) {
    const v = f === '' || f == null ? null : f;
    if (v === this.filter && v !== null) { this._setFilter(null); return; }
    this.filter = v;
    for (const c of this.$chipEls) c.classList.toggle('is-on', (c.dataset.f || null) === (v === null ? null : String(v)));
    this._sfx('filter');
    this._applyFilter(true);
  }

  _matches(n) {
    const f = this.filter;
    if (f === null) return true;
    if (f === '@ready') { const s = this._st.get(n.id); return s === 'avail' || s === 'run'; }
    return String(n.B.i) === String(f);
  }

  _applyFilter(move) {
    const list = [];
    for (const n of this.nodes) {
      const m = this._matches(n);
      n.el.classList.toggle('is-dim', !m);
      if (m) list.push(n);
    }
    for (const e of this.edges) {
      const dim = this.filter !== null && !(this._matches(e.src) && this._matches(e.dst));
      if (e.dim !== dim) { e.dim = dim; for (const p of e.els) p.classList.toggle('is-dim', dim); }
    }
    for (const B of this.branches) B.tab?.classList.toggle('is-dim', this.filter !== null && !B.nodes.some((n) => this._matches(n)));
    this.root.classList.toggle('is-filtered', this.filter !== null);
    if (!move) return;
    if (this.filter === null) { this._fitAll(); return; }
    if (!list.length) return;
    const x0 = Math.min(...list.map((n) => n.x)) - COLW / 2, x1 = Math.max(...list.map((n) => n.x)) + COLW / 2;
    const y0 = Math.min(...list.map((n) => n.y)) - NODE_DY, y1 = Math.max(...list.map((n) => n.y)) + ROWH - NODE_DY;
    this._fitRect(x0, y0, x1, y1, 1.1);
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
    this._on(this.$chips, 'click', (e) => {
      const c = e.target.closest('.lt-chip');
      if (c) this._setFilter(c.dataset.f);
    });
    this._on(this.$tabs, 'click', (e) => {
      const t = e.target.closest('.lt-tab');
      if (t) this._setFilter(t.dataset.b);
    });
    this._on(this.$go, 'click', () => this._research());
    this._on(this.root.querySelector('.lt-close'), 'click', () => this._close());
    this._on(this.root.querySelector('.lt-det-x'), 'click', () => { this._sfx('click'); this._openSheet(false); });
    this._on(this.$det, 'click', (e) => {
      const j = e.target.closest('[data-goto]');
      if (j) { const n = this.byId.get(j.dataset.goto); if (n) this._select(n, { pan: true, sound: 'select', open: true }); }
    });
    this._on(this.$slots, 'click', (e) => {
      const s = e.target.closest('[data-goto]');
      if (!s) return;
      const n = this.byId.get(s.dataset.goto);
      if (n) this._select(n, { pan: true, sound: 'select', open: true });
    });
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.root);
    } else this._on(window, 'resize', () => this._resize());
  }

  _dragJustEnded() { return this._dragEndT && now() - this._dragEndT < 140; }

  _onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.lt-zoom, .lt-toast, .lt-tab')) return;
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
    let handled = true;
    if (k === 'ArrowLeft') this._move(-1, 0);
    else if (k === 'ArrowRight') this._move(1, 0);
    else if (k === 'ArrowUp') this._move(0, -1);
    else if (k === 'ArrowDown') this._move(0, 1);
    else if (k === 'Enter' || k === 'NumpadEnter' || k === ' ') {
      if (t && t.tagName === 'BUTTON' && !t.classList.contains('lt-node') && this.root.contains(t)) handled = false;
      else this._research();
    } else if (k === 'Escape') {
      if (this._compact && this._sheetOpen) { this._openSheet(false); this._sfx('click'); } else this._close();
    } else if (k === '+' || k === '=') this._zoomBy(1.3);
    else if (k === '-' || k === '_') this._zoomBy(1 / 1.3);
    else if (k === '0') this._fitAll();
    else if (k === 'f' || k === 'F') { if (this.sel) this._centerOn(this.sel); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  _close() {
    this._sfx('click');
    try { this.o.onClose?.(); } catch (err) { console.error(err); }
  }

  // spatial keyboard navigation
  _move(dx, dy) {
    const cur = this.sel;
    if (!cur) { const f = this._initialNode(); if (f) this._select(f, { pan: true, sound: 'select' }); return; }
    let best = null, bs = Infinity;
    for (const n of this.nodes) {
      if (n === cur || (this.filter !== null && !this._matches(n))) continue;
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
    this.root.classList.toggle('is-short', h < 600);
    this.root.classList.toggle('is-tiny', h < 460);
    this._clampCam(this.cam);
    this._applyCam();
  }

  // zoom-out limit: enough to see the whole tree (but never below 0.1)
  _minZ() {
    const vw = this.view.clientWidth || 800, vh = this.view.clientHeight || 500;
    return clamp(Math.min((vw - 60) / this.W, (vh - 60) / this.H), 0.1, MINZ);
  }

  _visibleH() {
    const v = this.view;
    if (this._compact && this._sheetOpen) return Math.max(120, v.clientHeight - this.$det.offsetHeight);
    return v.clientHeight;
  }

  _clampCam(c) {
    const vw = this.view.clientWidth || 800, vh = this.view.clientHeight || 500;
    const m = Math.min(40, vw * 0.1), mh = Math.min(40, vh * 0.1);
    const ww = this.W * c.z, wh = this.H * c.z;
    c.x = ww + 2 * m < vw ? clamp(c.x, m, vw - ww - m) : clamp(c.x, vw - ww - m, m);
    const sheet = this._compact && this._sheetOpen ? this.$det.offsetHeight : 0;
    c.y = wh + 2 * mh < vh - sheet ? clamp(c.y, mh, vh - sheet - wh - mh) : clamp(c.y, vh - sheet - wh - mh, mh);
    if (ww + 2 * m < vw && c.x > vw - ww - m) c.x = vw - ww - m;
    return c;
  }

  _applyCam() {
    const c = this._clampCam(this.cam);
    this.world.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    this.root.classList.toggle('is-far', c.z < 0.58);
    this.root.classList.toggle('is-vfar', c.z < 0.3);
    this.root.style.setProperty('--lt-z', c.z.toFixed(3));
    // sticky branch tabs
    const vh = this.view.clientHeight;
    const x = Math.max(6, (PADL - 34) * c.z + c.x);
    for (const B of this.branches) {
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

  _fitAll() { this._fitRect(0, 0, this.W, this.H, 1); }

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
  _select(n, { pan = true, sound = false, open = false } = {}) {
    if (!n) return;
    const same = n === this.sel;
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
    if (pan) this._ensureVisible(n);
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
    const n = this.sel;
    if (!n) return;
    const st = this._st.get(n.id);
    const d = n.d;
    this.$det.dataset.state = st;
    this.$det.style.setProperty('--bc', n.B.color);
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
      this.$time.innerHTML = `${G_CLOCK}<b>${fmtDur(n.time)}</b><span class="lt-free">FREE</span><small>in-game time, starts as soon as you click</small>`;
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
      this.$kids.innerHTML = n.kids.map((k) => `<button type="button" class="lt-kid st-${this._st.get(k.id)}" data-goto="${esc(k.id)}"><span class="lt-art sm">${this._nodeArt(k, 22)}</span>${esc(k.d.name)}</button>`).join('');
    } else this.$secKids.hidden = true;
    this._renderAct();
  }

  _renderAct() {
    const n = this.sel;
    if (!n) return;
    const st = this._st.get(n.id);
    const b = this.$go;
    b.className = 'lt-go';
    this.$goFill.style.width = '0%';
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
    if (!n) return;
    const st = this._st.get(n.id);
    if (st === 'run') {
      const j = this._job(n.id);
      const k = j ? j.k : 0;
      this.$goFill.style.width = `${(k * 100).toFixed(1)}%`;
      this.$goL.textContent = `RESEARCHING... ${Math.floor(k * 100)}%`;
      this.$goS.textContent = `${fmtClock(j ? j.left : n.time)} left`;
    } else if (this.$go.classList.contains('is-busy')) this.$goS.textContent = this._busyText();
  }

  // ------------------------------------------------------------ bench bar
  _renderBench() {
    if (!this.$slots) return;
    if (!this._timed()) {
      this.$slots.innerHTML = '<div class="lt-slotc is-info">Research finishes instantly</div>';
      return;
    }
    const slots = Math.max(this._slots(), this._jobs.length);
    let h = '';
    for (let i = 0; i < slots; i++) {
      const j = this._jobs[i];
      if (j && j.n) {
        h += `<button type="button" class="lt-slotc is-job" data-goto="${esc(j.id)}" data-job="${esc(j.id)}" style="--bc:${esc(j.n.B.color)}">
          <span class="lt-art">${this._nodeArt(j.n, 30)}</span>
          <span class="lt-slotc-m"><b>${esc(j.n.d.name)}</b><span class="lt-bar"><i></i></span></span>
          <span class="lt-slotc-t">0:00</span></button>`;
      } else if (j) {
        h += `<div class="lt-slotc is-job" data-job="${esc(j.id)}"><span class="lt-slotc-m"><b>${esc(j.id)}</b><span class="lt-bar"><i></i></span></span><span class="lt-slotc-t">0:00</span></div>`;
      } else {
        const pick = this.nodes.find((n) => this._calc(n) === 'avail');
        h += `<button type="button" class="lt-slotc is-empty"${pick ? ` data-goto="${esc(pick.id)}"` : ''}><span class="lt-plus">+</span><span class="lt-slotc-m"><b>Bench free</b><small>${pick ? 'Pick a glowing node!' : 'Nothing ready yet'}</small></span></button>`;
      }
    }
    this.$slots.innerHTML = h;
    this._jobEls = [...this.$slots.querySelectorAll('[data-job]')].map((el) => ({ el, id: el.dataset.job, bar: el.querySelector('.lt-bar i'), t: el.querySelector('.lt-slotc-t') }));
    this._liveBench();
  }

  _liveBench() {
    for (const s of this._jobEls || []) {
      const j = this._job(s.id);
      if (!j) continue;
      s.bar.style.width = `${(j.k * 100).toFixed(1)}%`;
      const txt = fmtClock(j.left);
      if (s.t.textContent !== txt) s.t.textContent = txt;
    }
    for (const j of this._jobs) {
      const n = j.n;
      if (!n?.$ring) continue;
      n.$ring.style.strokeDashoffset = String(100 - j.k * 100);
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
      if (this._st.get(n.id) !== 'done' && this._st.get(n.id) !== 'run') this.$goS.textContent = /bench busy/i.test(chk.reason || '') ? this._busyText() : String(chk.reason || '');
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
    }
    this.refresh();
    this._renderDetail();
  }

  // a copy of the node icon flies down to its bench slot
  _fly(n) {
    if (REDUCED) return;
    const slot = this.$slots.querySelector(`[data-job="${CSS.escape(n.id)}"] .lt-art`) || this.$slots;
    const rr = this.root.getBoundingClientRect();
    const a = n.$ico.getBoundingClientRect(), b = slot.getBoundingClientRect();
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
    this._ring(n, 'done');
    this._fx(n.el, 'is-burst', 1100);
    this._sfx('done');
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
    // showcase canvas ~30fps
    if (t - this._lastDraw >= 33) {
      const dt = Math.min(0.1, (t - (this._lastDraw || t)) / 1000);
      this._lastDraw = t;
      this._drawHero((t - this._t0) / 1000, dt);
    }
  };

  _drawHero(t, dt) {
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
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(8, H - 8, W - 16, 4);
        ctx.fillStyle = '#5fd0f0';
        ctx.fillRect(8, H - 8, Math.round((W - 16) * k), 4);
      }
      drawScan(ctx, W, H, t);
      if (!dark) drawSparkles(ctx, W, H, t, hashStr(n.id), st === 'done' ? 7 : 4);
    }
    this._drawBursts(ctx, dt);
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
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(Math.round(W / 2 - sw / 2), H - 15, sw, 3);
    if (dark) {
      try { ctx.drawImage(this._silhouette(img, w, h), x, y); } catch { /* ignore */ }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = 'bold 24px monospace';
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
      ctx.fillStyle = `rgba(190,240,255,${0.7 * (1 - k)})`;
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
const HERO_TINT = { done: [255, 214, 90], run: [95, 208, 240], avail: [125, 255, 168], zone: [255, 154, 58], locked: [140, 150, 170] };
function drawBackdrop(ctx, W, H, t, st) {
  const [r, g, b] = HERO_TINT[st] || HERO_TINT.avail;
  const dark = st === 'locked' || st === 'zone';
  ctx.fillStyle = dark ? '#0b0f12' : '#0a1a1e';
  ctx.fillRect(0, 0, W, H);
  const off = Math.floor(t * 4) % 8;
  ctx.fillStyle = dark ? '#141a1e' : '#12303a';
  for (let x = -off; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
  for (let y = off; y < H; y += 8) ctx.fillRect(0, y, W, 1);
  const gr = ctx.createRadialGradient(W / 2, H / 2 - 4, 2, W / 2, H / 2, H * 0.8);
  gr.addColorStop(0, `rgba(${r},${g},${b},${dark ? 0.08 : 0.24})`);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H - 13;
  for (let i = 0; i < 3; i++) {
    const rx = 18 + i * 9, ry = 3 + i * 1.6;
    const pulse = (t * 0.9 + i / 3) % 1;
    const a = (dark ? 0.08 : 0.18) + (dark ? 0.15 : 0.5) * (1 - Math.abs(pulse - 0.5) * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
    for (let k = 0; k < 64; k++) {
      const ang = (k / 64) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * rx), Math.round(cy + Math.sin(ang) * ry), 1, 1);
    }
  }
}

function drawScan(ctx, W, H, t) {
  const y = Math.floor(((t * 34) % (H + 26)) - 12);
  for (let i = 0; i < 8; i++) {
    const yy = y - i;
    if (yy < 0 || yy >= H) continue;
    ctx.fillStyle = `rgba(200,240,255,${i === 0 ? 0.3 : 0.08 * (1 - i / 8)})`;
    ctx.fillRect(0, yy, W, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
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
    ctx.fillStyle = R() < 0.5 ? '#eafff0' : '#ffe890';
    ctx.fillRect(x, y, 1, 1);
    if (s) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
  }
}
