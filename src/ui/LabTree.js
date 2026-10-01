// LabTree: Reynard's research skill tree, shown on the lab computer.
//
// A green-phosphor CRT terminal ("REYNARD LABS // R&D TERMINAL") showing the
// research tree like a classic skill tree: one named branch per row, ornate
// brass icon slots joined by pipes (straight within a row, elbows between
// rows; routed around other nodes), locked nodes behind chains + padlocks,
// a detail panel with an animated preview, and a satisfying
// "SYNTHESIZING... APPROVED" research sequence.
//
//   const tree = new LabTree(container, { research, branches, isResearched, coins, canResearch,
//                                         onResearch, icon, preview?, sfx?, onClose })
//   tree.refresh(); tree.select(id); tree.destroy();
//
// The container should be a positioned element with a size (e.g. a fixed
// full-screen overlay); the tree fills it.
import './labtree.css';
import * as SPECIES_DATA from '../data/species.js';
import * as STRUCT_DATA from '../data/structures.js';

// Optional art modules drawn elsewhere. import.meta.glob keeps the build
// working while they don't exist (an empty object then).
const OPTIONAL = { ...import.meta.glob('./frames.js'), ...import.meta.glob('../art/fishArt.js') };
let optMods = null;
function loadOptional() {
  if (!optMods) {
    const get = (k) => (OPTIONAL[k] ? OPTIONAL[k]().catch(() => null) : Promise.resolve(null));
    optMods = Promise.all([get('./frames.js'), get('../art/fishArt.js')]).then(([frames, fish]) => ({ frames, fish }));
  }
  return optMods;
}

// ---------------------------------------------------------------- layout
const NODE = 56; // node slot size in CSS px (28 art px at 2x)
const COLW = 84; // column pitch
const ROWH = 88; // row pitch
const GUTTER = 128; // left margin for the branch labels
const PADT = 22;
const PADR = 34;
const PADB = 30;
const HX = COLW / 2;
const HY = ROWH / 2;
const WELL = 36; // icon area inside a slot
const PW = 144; // preview canvas resolution (shown at 2x)
const PH = 90;
const SYNTH_MS = 720;

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.floor(Number(n) || 0).toLocaleString('en-US');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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

// 28x28 ornate icon slot: rounded 3px metal ring lit from the top left, dark
// bevel, scroll ornaments in the corners, a status gem on top and a tiny CRT
// "well" with scanlines.
const SLOT_PALS = {
  gold: { k: '#1c1006', h: '#fff8c8', g: '#ffc936', a: '#d8901a', s: '#a0600e', i: '#3c2406', y: '#ffffff', o: '#5c3206', e: '#5dff8f', E: '#e6ffee', w: '#0e3019', v: '#0b2715' },
  brass: { k: '#150b04', h: '#eec38a', g: '#b87c3a', a: '#8a5528', s: '#5e3719', i: '#241306', y: '#ffe2b4', o: '#3e220c', e: '#ffae2a', E: '#fff0c0', w: '#061a0d', v: '#04140a' },
  iron: { k: '#040405', h: '#62666f', g: '#3c3f47', a: '#2c2e35', s: '#1e1f24', i: '#0a0b0d', y: '#80858f', o: '#121317', e: '#3a1414', E: '#6a2a2a', w: '#111a14', v: '#0d1510' },
};
// 7x7 scroll ornament for the top-left corner ('.' keeps the ring). H/V mark
// top/left-facing highlights, which become shadows when mirrored.
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
  const S = 28;
  const cv = makeCanvas(S, S);
  const c = cv.getContext('2d');
  const put = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ex = Math.min(x, S - 1 - x), ey = Math.min(y, S - 1 - y);
      if (ex + ey < 2) continue; // rounded corner
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
  // status gem on the top edge, rivets on the others
  const GEM = ['.kkkk.', 'kEeeek', 'keeeek', '.kkkk.'];
  GEM.forEach((row, y) => { for (let x = 0; x < 6; x++) if (row[x] !== '.') put(11 + x, y, p[row[x]]); });
  for (const [x, y] of [[13, 25], [14, 25], [2, 13], [2, 14], [25, 13], [25, 14]]) put(x, y, p.o);
  for (const [x, y] of [[13, 26], [2, 12], [25, 12]]) put(x, y, p.y);
  return cv;
}

// Two steel chains crossing in an X over a 28x28 slot.
function chainsCanvas() {
  const S = 28;
  const cv = makeCanvas(S, S);
  const c = cv.getContext('2d');
  const COL = { K: '#0c0b10', L: '#f0f3fa', M: '#aeb4c8', D: '#666c82', S: 'rgba(0,0,0,0.55)' };
  const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < S && y < S) { c.fillStyle = col; c.fillRect(x, y, 1, 1); } };
  // face-on link (a diagonal ring with a hole) and edge-on link (a short bar),
  // authored for the "\" diagonal; "/" is the mirror image
  const RING = ['.KK...', 'KLLK..', 'KL.MK.', '.KM.DK', '..KDDK', '...KK.'];
  const BAR = ['KK..', 'KLK.', '.KMK', '..KK'];
  const stamp = (pat, ox, oy, flip, shadow) => {
    pat.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        const x = flip ? S - 1 - (ox + i) : ox + i;
        if (shadow) put(x + (flip ? -1 : 1), oy + j + 1, COL.S);
        else put(x, oy + j, COL[ch]);
      }
    });
  };
  for (const flip of [false, true]) {
    for (const shadow of [true, false]) {
      for (let t = -2; t < S; t += 8) {
        stamp(RING, t, t, flip, shadow);
        stamp(BAR, t + 5, t + 5, flip, shadow);
      }
    }
  }
  return cv;
}

// Small inline pixel SVG (for glyphs the sprite sheet doesn't have).
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
  'g.........g',
  'gg.......gg',
  'gGg.....gGg',
  'gGGgggggGGg',
  'gggggggggg.',
  'gg.kggk.ggg',
  'gggggggggg.',
  '.ggwwwwwgg.',
  '..gwwkwwg..',
  '...gwwwg...',
  '....ggg....',
], { g: '#7dffa8', G: '#2a9a55', k: '#021006', w: '#c8ffd8' }, 2, 'ltree-logo');

const QMARK = ['.xxx.', 'x...x', '....x', '...x.', '..x..', '.....', '..x..'];

// ---------------------------------------------------------------- pipe router
// Orthogonal routing on a half-cell grid: node (col,row) sits at (2col+1,
// 2row+1); even coordinates are the lanes between columns / rows. Pipes may
// share cells only with pipes of the same source (a trunk that splits) or the
// same target (inputs that merge), and may only split/merge where the tee
// can't be mistaken for another node's pipe. Anything else may only be
// crossed straight at a right angle (drawn as a little bridge).
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // right, left, down, up
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

function routePipes(nodes, byId, GW, GH, blocked) {
  const key = (x, y) => y * GW + x;
  const nodeCell = new Set(nodes.map((n) => key(n.gx, n.gy)));
  const nodeAt = new Map(nodes.map((n) => [key(n.gx, n.gy), n]));
  // a tee at cell k is readable if no node other than `common` touches it
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
    const dr = Math.abs(e.src.row - e.dst.row), dc = Math.abs(e.src.col - e.dst.col);
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
        if (o.din === din && o.dout === dout) continue; // running together
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
    while (heap.size) {
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
        if (!isT && (nodeCell.has(nk) || (blocked.has(nk) && blocked.get(nk) !== e.dst))) continue;
        let c = 1;
        if (atStart) {
          if (dir === 1) c += 3; // leaving a node to the left looks backwards
          else if (dir === 3) c += 0.6;
        } else {
          if (dir !== din) c += TURN;
          const pc = passCost(k, din, dir, e);
          if (pc < 0) continue;
          c += pc;
        }
        if (isT) {
          if (dir === 1) c += 3; // entering from the right
          else if (dir === 3) c += 1.2; // entering from below
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
      pts.push([sx, sy], [sx, ty], [tx, ty]);
    }
    e.pts = pts;
  }
  return edges;
}

// ---------------------------------------------------------------- component
export class LabTree {
  // pixel-art generators, exposed for tools/labtree-preview.html (?art=1)
  static _art = { slotCanvas, chainsCanvas, SLOT_PALS };

  constructor(container, opts = {}) {
    this.container = container;
    this.o = opts;
    this._alive = true;
    this._timers = new Set();
    this._off = [];
    this._typers = new Map();
    this._iconInfo = new Map();
    this._fishFrames = new Map();
    this._st = new Map();
    this._poor = new Map();
    this._edgeState = new Map();
    this._busy = null;
    this._stamp = null;
    this._bursts = [];
    this._t0 = performance.now();
    this._lastDraw = 0;
    this._lastPoll = 0;
    this._fish = null;
    this._frames = null;

    const branches = (opts.branches || []).slice();
    this.branches = branches;
    const rowOf = new Map(branches.map((b, i) => [b.id, i]));
    this.nodes = [];
    (opts.research || []).forEach((d, idx) => {
      if (!rowOf.has(d.branch)) return;
      const row = rowOf.get(d.branch), col = Math.max(0, d.col | 0);
      this.nodes.push({ id: d.id, d, idx, row, col, gx: 2 * col + 1, gy: 2 * row + 1, req: (d.req || []).slice(), cost: +d.cost || 0 });
    });
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.rows = branches.map((_, r) => this.nodes.filter((n) => n.row === r).sort((a, b) => a.col - b.col));
    this.maxCol = this.nodes.reduce((m, n) => Math.max(m, n.col), 0);
    this.GW = 2 * (this.maxCol + 1) + 1;
    this.GH = 2 * branches.length + 1;
    this.W = GUTTER + (this.GW - 1) * HX + PADR;
    this.H = PADT + (this.GH - 1) * HY + PADB;
    for (const n of this.nodes) { n.x = this._X(n.gx); n.y = this._Y(n.gy); }

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this._buildDOM();
    this._buildTree();
    this.refresh(true);
    this._bind();
    this._resize();
    const first = this._initialNode();
    if (first) this._select(first, { scroll: false, sound: false, open: false, type: false });
    requestAnimationFrame(() => { if (this._alive && this.sel) this._center(this.sel); });
    this._typeHeader();
    this._sfx('open');
    this._raf = requestAnimationFrame(this._loop);
    loadOptional().then((m) => this._onOptional(m));
  }

  // ------------------------------------------------------------ public API
  refresh(initial = false) {
    if (!this._alive) return;
    const coins = this._coins();
    let selChanged = false, selRevealed = false;
    const wasDone = [];
    for (const n of this.nodes) {
      const st = this._calc(n);
      const poor = st === 'avail' && coins < n.cost;
      const prev = this._st.get(n.id);
      if (prev === st && this._poor.get(n.id) === poor) continue;
      this._st.set(n.id, st);
      this._poor.set(n.id, poor);
      const el = n.el;
      el.classList.toggle('is-done', st === 'done');
      el.classList.toggle('is-avail', st === 'avail');
      el.classList.toggle('is-locked', st === 'locked');
      el.classList.toggle('is-poor', poor);
      el.setAttribute('aria-label', st === 'locked' ? 'Locked research' : `${n.d.name}${st === 'done' ? ' (researched)' : ''}`);
      this._applySlotFrame(n);
      if (!initial && prev) {
        if (prev === 'locked' && st !== 'locked') this._fx(el, 'is-unlocking', 900);
        if (prev !== 'done' && st === 'done') wasDone.push(n);
        if (n === this.sel) { selChanged = true; if (prev === 'locked') selRevealed = true; }
      }
    }
    // pipes
    for (const e of this.edges) {
      const s = this._st.get(e.src.id) === 'done' ? (this._st.get(e.dst.id) === 'done' ? 'done' : 'on') : 'off';
      if (this._edgeState.get(e) === s) continue;
      const was = this._edgeState.get(e);
      this._edgeState.set(e, s);
      for (const p of e.els) p.setAttribute('data-s', s);
      if (!initial && was === 'off' && s !== 'off') this._surge(e);
    }
    for (const f of this.fittings) {
      let s = 'off';
      for (const e of f.edges) { const es = this._edgeState.get(e); if (es === 'done') { s = 'done'; break; } if (es === 'on') s = 'on'; }
      if (f.s !== s) { f.s = s; f.el.setAttribute('data-s', s); }
    }
    for (const n of wasDone) this._burstNode(n);
    // bottom bar
    this._targetCoins = coins;
    if (initial) { this._dispCoins = coins; this.$funds.textContent = fmt(coins); }
    const done = this.nodes.reduce((a, n) => a + (this._st.get(n.id) === 'done' ? 1 : 0), 0);
    this.$count.textContent = `${done} / ${this.nodes.length}`;
    this.$countBar.style.width = `${this.nodes.length ? (done / this.nodes.length) * 100 : 0}%`;
    // detail panel
    if (this.sel) {
      if (selRevealed) this._renderDetail(true);
      else if (selChanged) this._renderDetail(false);
      else this._renderMeta();
    }
    this._lastCoins = coins;
  }

  select(id) {
    const n = this.byId.get(id);
    if (n) this._select(n, { scroll: true, sound: false, open: true, type: true });
  }

  destroy() {
    if (!this._alive) return;
    this._alive = false;
    cancelAnimationFrame(this._raf);
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    for (const j of this._typers.values()) j.dead = true;
    this._typers.clear();
    for (const off of this._off) off();
    this._off = [];
    this._ro?.disconnect();
    this.root.remove();
  }

  // ------------------------------------------------------------ helpers
  _X(gx) { return GUTTER + gx * HX; }
  _Y(gy) { return PADT + gy * HY; }
  _sfx(name) { try { this.o.sfx?.(name); } catch { /* ignore */ } }
  _coins() { try { return Number(this.o.coins?.()) || 0; } catch { return 0; } }
  _isRes(id) { try { return !!this.o.isResearched?.(id); } catch { return false; } }
  _icon(name, scale) { try { return this.o.icon ? String(this.o.icon(name, scale) || '') : ''; } catch { return ''; } }
  _calc(n) {
    if (this._isRes(n.id)) return 'done';
    return n.req.every((r) => this._isRes(r)) ? 'avail' : 'locked';
  }
  _revealed(n) { return this._st.get(n.id) !== 'locked'; }
  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (this._alive) fn(); }, ms);
    this._timers.add(t);
    return t;
  }
  _fx(el, cls, ms) {
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
    let r = null;
    if (this.o.canResearch) { try { r = this.o.canResearch(n.id); } catch { r = null; } }
    if (!r || typeof r !== 'object') {
      if (st === 'locked') r = { ok: false, reason: 'Research the prerequisites first' };
      else if (this._coins() < n.cost) r = { ok: false };
      else r = { ok: true };
    }
    if (!r.ok && !r.reason) {
      if (st === 'locked') r = { ok: false, reason: 'Research the prerequisites first' };
      else if (this._coins() < n.cost) r = { ok: false, reason: `Need ${fmt(n.cost - this._coins())} more coins` };
      else r = { ok: false, reason: 'Not available right now' };
    }
    return r;
  }
  _iconMeta(name) {
    let m = this._iconInfo.get(name);
    if (!m) {
      const html = this._icon(name, 1);
      const w = +(/width="(\d+)"/.exec(html)?.[1] || 12), h = +(/height="(\d+)"/.exec(html)?.[1] || 12);
      const src = /src="([^"]+)"/.exec(html)?.[1];
      m = { w, h, img: null, scale: Math.max(1, Math.floor(WELL / Math.max(w, h, 1))) };
      if (src) { m.img = new Image(); m.img.src = src.replace(/&amp;/g, '&'); }
      this._iconInfo.set(name, m);
    }
    return m;
  }
  _nodeIconHTML(n) {
    const sp = n.d.species;
    const f = sp && this._fishFrame(sp, 0);
    if (f) {
      const s = f.width >= 20 ? Math.min(WELL / f.width, 30 / f.height) : Math.max(1, Math.floor(Math.min(WELL / f.width, 30 / f.height)));
      const w = Math.round(f.width * s), h = Math.round(f.height * s);
      let url = '';
      try { url = f.toDataURL(); } catch { url = ''; }
      if (url) return `<img class="px" src="${url}" width="${w}" height="${h}" alt="" draggable="false" style="image-rendering:pixelated">`;
    }
    const m = this._iconMeta(n.d.icon);
    return this._icon(n.d.icon, m.scale);
  }
  _fishFrame(species, frame) {
    const F = this._fish;
    if (!F || typeof F.fishCanvas !== 'function') return null;
    const k = species + '#' + frame;
    if (this._fishFrames.has(k)) return this._fishFrames.get(k);
    let c = null;
    try {
      c = F.fishCanvas(species, { frame, scale: 1 });
      if (c && !c.getContext && c.canvas) c = c.canvas;
      if (!c || !c.width || !c.getContext) c = null;
    } catch { c = null; }
    this._fishFrames.set(k, c);
    return c;
  }

  // ------------------------------------------------------------ DOM
  _buildDOM() {
    const root = document.createElement('div');
    root.className = 'ltree';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Reynard Labs research terminal');
    root.innerHTML = `
      <div class="ltree-bezel">
        <div class="ltree-screen is-boot">
          <header class="ltree-head">
            <span class="ltree-logo-wrap">${FOX_LOGO}</span>
            <span class="ltree-title"><span class="ltree-title-t"></span><i class="ltree-cursor"></i></span>
            <span class="ltree-headr"><span class="ltree-rec"></span>USER: DR. REYNARD <b>·</b> CLEARANCE: EVIL</span>
          </header>
          <div class="ltree-body">
            <div class="ltree-view" tabindex="-1">
              <div class="ltree-sizer"><div class="ltree-world"></div></div>
            </div>
            <aside class="ltree-det" aria-live="polite">
              <div class="ltree-grab" aria-hidden="true"></div>
              <div class="ltree-det-head"><span class="ltree-file"></span><span class="ltree-branch"></span><button class="ltree-x" type="button" aria-label="Close details">×</button></div>
              <div class="ltree-prev">
                <canvas width="${PW}" height="${PH}"></canvas>
                <div class="ltree-prev-ov">
                  <i class="ltree-br tl"></i><i class="ltree-br tr"></i><i class="ltree-br bl"></i><i class="ltree-br br"></i>
                  <span class="ltree-ptag tl"></span><span class="ltree-ptag tr"></span><span class="ltree-ptag bl"></span>
                  <span class="ltree-classified">CLASSIFIED</span>
                  <span class="ltree-stamp"></span>
                </div>
              </div>
              <div class="ltree-info">
                <h3 class="ltree-name"></h3>
                <div class="ltree-sub"></div>
                <p class="ltree-desc"></p>
                <div class="ltree-unl"></div>
                <div class="ltree-meta">
                  <div class="ltree-cost"></div>
                  <div class="ltree-reqs"></div>
                </div>
              </div>
              <div class="ltree-act">
                <button class="ltree-go" type="button"><span class="ltree-go-l"></span><span class="ltree-prog"><i></i></span></button>
                <div class="ltree-why"></div>
              </div>
            </aside>
          </div>
          <footer class="ltree-bar">
            <div class="ltree-field ltree-fundsf"><span class="ltree-fl">FUNDS</span>${this._icon('coin', 1)}<b class="ltree-funds">0</b></div>
            <div class="ltree-field ltree-countf"><span class="ltree-fl">RESEARCHED</span><b class="ltree-count">0 / 0</b><span class="ltree-cbar"><i></i></span></div>
            <div class="ltree-keys"><kbd>←↑↓→</kbd> SELECT <kbd>ENTER</kbd> RESEARCH <kbd>ESC</kbd> EXIT</div>
            <button class="ltree-exit" type="button">EXIT</button>
          </footer>
          <div class="ltree-fx" aria-hidden="true"></div>
        </div>
        <div class="ltree-chin" aria-hidden="true"><span class="ltree-brand">REYNARD LABS</span><span class="ltree-model">MODEL 666 · EVIL-TRON</span><span class="ltree-led"></span></div>
      </div>`;
    this.container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.$screen = $('.ltree-screen');
    this.$title = $('.ltree-title-t');
    this.$body = $('.ltree-body');
    this.view = $('.ltree-view');
    this.sizer = $('.ltree-sizer');
    this.world = $('.ltree-world');
    this.$det = $('.ltree-det');
    this.$file = $('.ltree-file');
    this.$branch = $('.ltree-branch');
    this.$prev = $('.ltree-prev');
    this.pcv = $('.ltree-prev canvas');
    this.pctx = this.pcv.getContext('2d');
    this.pctx.imageSmoothingEnabled = false;
    this.$ptl = $('.ltree-ptag.tl');
    this.$ptr = $('.ltree-ptag.tr');
    this.$pbl = $('.ltree-ptag.bl');
    this.$stamp = $('.ltree-stamp');
    this.$name = $('.ltree-name');
    this.$sub = $('.ltree-sub');
    this.$desc = $('.ltree-desc');
    this.$unl = $('.ltree-unl');
    this.$cost = $('.ltree-cost');
    this.$reqs = $('.ltree-reqs');
    this.$go = $('.ltree-go');
    this.$goL = $('.ltree-go-l');
    this.$why = $('.ltree-why');
    this.$funds = $('.ltree-funds');
    this.$count = $('.ltree-count');
    this.$countBar = $('.ltree-cbar i');
    // pixel-art assets as CSS variables
    const rs = root.style;
    for (const [k, p] of Object.entries(SLOT_PALS)) rs.setProperty(`--ltree-slot-${k}`, `url(${slotCanvas(p).toDataURL()})`);
    rs.setProperty('--ltree-chains', `url(${chainsCanvas().toDataURL()})`);
    this._later(() => this.$screen.classList.remove('is-boot'), 600);
  }

  _buildTree() {
    const W = this.W, H = this.H;
    this.world.style.width = `${W}px`;
    this.world.style.height = `${H}px`;
    // label cells block the router (except for pipes into that row's first
    // node, which may come in from the left; the label then slides left)
    const blocked = new Map();
    const labels = [];
    this.branches.forEach((b, r) => {
      const row = this.rows[r];
      if (!row.length) return;
      const c0 = row[0].col;
      const right = this._X(2 * c0 + 1) - NODE / 2 - 10;
      const w = 22 + String(b.name).length * 6.2;
      labels.push({ b, r, c0, right, y: this._Y(2 * r + 1) });
      const g0 = Math.max(0, Math.ceil((right - w - 8 - GUTTER) / HX)), g1 = 2 * c0;
      for (let gx = g0; gx <= g1; gx++) blocked.set((2 * r + 1) * this.GW + gx, row[0]);
    });
    this.edges = routePipes(this.nodes, this.byId, this.GW, this.GH, blocked);
    const used = new Set();
    for (const e of this.edges) for (const [gx, gy] of e.pts) used.add(gy * this.GW + gx);
    for (const L of labels) {
      const gy = 2 * L.r + 1;
      let gx = 2 * L.c0;
      while (gx >= 0 && used.has(gy * this.GW + gx)) gx--;
      if (gx < 2 * L.c0) L.right = Math.min(L.right, this._X(gx + 1) - 18);
    }

    // --- emblem watermark + pipes (SVG)
    const cx = Math.round(W / 2 + 20), cy = Math.round(H / 2);
    let emb = '';
    for (const [r, w, dash] of [[330, 3, ''], [300, 1, '2 6'], [250, 6, ''], [200, 1, '1 5'], [150, 2, '']]) {
      emb += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r0 = 262, r1 = i % 2 ? 282 : 292;
      emb += `<line x1="${Math.round(cx + Math.cos(a) * r0)}" y1="${Math.round(cy + Math.sin(a) * r0)}" x2="${Math.round(cx + Math.cos(a) * r1)}" y2="${Math.round(cy + Math.sin(a) * r1)}" stroke-width="4"/>`;
    }
    // fox head silhouette
    const s = 9;
    const fox = [[-10, -9], [-6, -2], [6, -2], [10, -9], [11, 2], [7, 8], [2, 12], [0, 14], [-2, 12], [-7, 8], [-11, 2]];
    emb += `<polygon class="ltree-emb-fox" points="${fox.map(([x, y]) => `${cx + x * s},${cy + y * s - 30}`).join(' ')}"/>`;

    const P = (pts, dx = 0, dy = 0) => {
      const px = pts.map(([gx, gy]) => [this._X(gx) + dx, this._Y(gy) + dy]);
      const out = [px[0]];
      for (let i = 1; i < px.length - 1; i++) {
        const a = out[out.length - 1], b = px[i], c = px[i + 1];
        if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue;
        out.push(b);
      }
      out.push(px[px.length - 1]);
      return { d: out.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(''), corners: out.slice(1, -1) };
    };
    const layers = { o: '', b: '', s: '', h: '', f: '', g: '', c: '', x: '' };
    const fitMap = new Map();
    this.edges.forEach((e, i) => {
      const main = P(e.pts);
      const sh = P(e.pts, 2, 2), hi = P(e.pts, -2, -2);
      e.d = main.d;
      layers.o += `<path class="lp-o" data-e="${i}" d="${main.d}"/>`;
      layers.b += `<path class="lp-b" data-e="${i}" d="${main.d}"/>`;
      layers.s += `<path class="lp-s" data-e="${i}" d="${sh.d}"/>`;
      layers.h += `<path class="lp-h" data-e="${i}" d="${hi.d}"/>`;
      layers.g += `<path class="lp-g" data-e="${i}" d="${main.d}"/>`;
      layers.c += `<path class="lp-c" data-e="${i}" d="${main.d}"/>`;
      for (const [x, y] of main.corners) {
        const k = `${x},${y}`;
        if (!fitMap.has(k)) fitMap.set(k, { x, y, edges: [] });
        fitMap.get(k).edges.push(e);
      }
      for (const br of e.bridges) {
        const x = this._X(br.gx), y = this._Y(br.gy), L = 12;
        const d = br.h ? `M${x - L} ${y}L${x + L} ${y}` : `M${x} ${y - L}L${x} ${y + L}`;
        const dh = br.h ? `M${x - L} ${y - 2}L${x + L} ${y - 2}` : `M${x - 2} ${y - L}L${x - 2} ${y + L}`;
        const ds = br.h ? `M${x - L} ${y + 2}L${x + L} ${y + 2}` : `M${x + 2} ${y - L}L${x + 2} ${y + L}`;
        layers.x += `<path class="lp-o lp-bo" data-e="${i}" d="${d}"/><path class="lp-b" data-e="${i}" d="${d}"/><path class="lp-s" data-e="${i}" d="${ds}"/><path class="lp-h" data-e="${i}" d="${dh}"/><path class="lp-g" data-e="${i}" d="${d}"/><path class="lp-c lp-solid" data-e="${i}" d="${d}"/>`;
      }
    });
    this.fittings = [...fitMap.values()];
    this.fittings.forEach((f, i) => {
      layers.f += `<g class="lp-fit" data-f="${i}" transform="translate(${f.x} ${f.y})"><rect class="k" x="-8" y="-8" width="16" height="16"/><rect class="m" x="-6" y="-6" width="12" height="12"/><rect class="l" x="-6" y="-6" width="12" height="2"/><rect class="l" x="-6" y="-6" width="2" height="12"/><rect class="d" x="-6" y="4" width="12" height="2"/><rect class="d" x="4" y="-6" width="2" height="12"/></g>`;
    });
    const svg = `<svg class="ltree-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <g class="ltree-emb">${emb}</g>
      <g class="lp-L lp-Lo">${layers.o}</g><g class="lp-L">${layers.b}</g><g class="lp-L">${layers.s}</g><g class="lp-L">${layers.h}</g>
      <g class="lp-L">${layers.f}</g><g class="lp-L">${layers.g}</g><g class="lp-L">${layers.c}</g><g class="lp-L">${layers.x}</g>
    </svg>`;

    // --- labels
    let lab = '';
    for (const L of labels) {
      lab += `<div class="ltree-lab" style="right:${W - L.right}px;top:${L.y}px;--bc:${esc(L.b.color || '#7dffa8')}"><span class="ltree-lab-i">${this._icon(L.b.icon, 1)}</span><span class="ltree-lab-t">${esc(String(L.b.name).toUpperCase())}</span></div>`;
    }

    // --- nodes
    let nodes = '';
    for (const n of this.nodes) {
      nodes += `<button class="ltree-node" type="button" data-id="${esc(n.id)}" style="left:${n.x - NODE / 2}px;top:${n.y - NODE / 2}px">
        <span class="ltree-fr"></span><span class="ltree-ico"></span><span class="ltree-chain"></span>
        <span class="ltree-lock">${this._icon('lock', 2)}</span><span class="ltree-chk">${this._icon('check', 1)}</span>
        <span class="ltree-chip">${this._icon('coin', 1)}<b>${fmt(n.cost)}</b></span>
      </button>`;
    }
    this.world.innerHTML = `${svg}<div class="ltree-labs">${lab}</div>${nodes}
      <div class="ltree-ret" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="ltree-tip" aria-hidden="true"></div>`;
    this.$ret = this.world.querySelector('.ltree-ret');
    this.$tip = this.world.querySelector('.ltree-tip');
    for (const n of this.nodes) {
      n.el = this.world.querySelector(`.ltree-node[data-id="${CSS.escape(n.id)}"]`);
      n.$ico = n.el.querySelector('.ltree-ico');
      n.$fr = n.el.querySelector('.ltree-fr');
      n.$chip = n.el.querySelector('.ltree-chip');
      n.$ico.innerHTML = this._nodeIconHTML(n);
    }
    const svgEl = this.world.querySelector('.ltree-svg');
    this.edges.forEach((e, i) => { e.els = [...svgEl.querySelectorAll(`[data-e="${i}"]`)]; e.core = svgEl.querySelector(`.lp-c[data-e="${i}"]`); });
    this.fittings.forEach((f, i) => { f.el = svgEl.querySelector(`[data-f="${i}"]`); f.s = null; });
  }

  // ------------------------------------------------------------ events
  _bind() {
    const view = this.view;
    // node clicks / hover (delegated)
    this._on(this.world, 'click', (e) => {
      const b = e.target.closest('.ltree-node');
      if (this._dragJustEnded()) { e.preventDefault(); return; }
      if (!b) { if (this._compact) this._openSheet(false); return; }
      const n = this.byId.get(b.dataset.id);
      if (!n) return;
      this._sfx('click');
      if (n === this.sel && this._compact && !this._sheetOpen) { this._openSheet(true); return; }
      this._select(n, { scroll: true, sound: false, open: true, type: true });
    });
    this._on(this.world, 'dblclick', (e) => {
      const b = e.target.closest('.ltree-node');
      if (b && !this._compact) { const n = this.byId.get(b.dataset.id); if (n === this.sel) this._research(); }
    });
    this._on(this.world, 'pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.ltree-node');
      if (!b || b === this._hoverEl) return;
      this._hoverEl = b;
      const n = this.byId.get(b.dataset.id);
      if (!n) return;
      this._showTip(n);
      const now = performance.now();
      if (!this._hoverT || now - this._hoverT > 60) { this._hoverT = now; this._sfx('hover'); }
    });
    this._on(this.world, 'pointerout', (e) => {
      const b = e.target.closest('.ltree-node');
      if (b && !b.contains(e.relatedTarget)) { this._hoverEl = null; this.$tip.classList.remove('is-on'); }
    });
    // drag to pan (mouse / pen; touch uses native scrolling with momentum)
    this._on(view, 'pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop, moved: false };
    });
    this._on(window, 'pointermove', (e) => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && dx * dx + dy * dy > 36) {
        d.moved = true;
        this.root.classList.add('is-dragging');
        this.$tip.classList.remove('is-on');
        try { view.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      if (d.moved) { view.scrollLeft = d.sl - dx; view.scrollTop = d.st - dy; }
    });
    const end = (e) => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      if (d.moved) this._dragEndT = performance.now();
      this._drag = null;
      this.root.classList.remove('is-dragging');
    };
    this._on(window, 'pointerup', end);
    this._on(window, 'pointercancel', end);
    // keyboard (capture so the game's camera keys don't also fire)
    this._on(window, 'keydown', (e) => this._key(e), true);
    // buttons
    this._on(this.$go, 'click', () => this._research());
    this._on(this.root.querySelector('.ltree-exit'), 'click', () => this._close());
    this._on(this.root.querySelector('.ltree-x'), 'click', () => { this._sfx('click'); this._openSheet(false); });
    this._on(this.$desc, 'click', () => this._typers.get('desc')?.finish());
    this._on(this.root.querySelector('.ltree-grab'), 'click', () => this._openSheet(false));
    // size
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.root);
    } else this._on(window, 'resize', () => this._resize());
  }

  _dragJustEnded() { return this._dragEndT && performance.now() - this._dragEndT < 80; }

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
    else if (k === 'Enter' || k === 'NumpadEnter') {
      if (t && t.tagName === 'BUTTON' && !t.classList.contains('ltree-node') && this.root.contains(t)) handled = false;
      else this._research();
    } else if (k === 'Escape') {
      if (this._compact && this._sheetOpen) this._openSheet(false);
      else this._close();
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  _close() {
    this._sfx('click');
    try { this.o.onClose?.(); } catch (err) { console.error(err); }
  }

  _move(dx, dy) {
    const cur = this.sel;
    if (!cur) { const f = this._initialNode(); if (f) this._select(f, { scroll: true, sound: 'beep', open: false, type: true }); return; }
    let cand = null;
    if (dx) {
      const row = this.rows[cur.row];
      cand = dx > 0 ? row.find((n) => n.col > cur.col) : [...row].reverse().find((n) => n.col < cur.col);
    } else {
      for (let r = cur.row + dy; r >= 0 && r < this.rows.length; r += dy) {
        const row = this.rows[r];
        if (!row.length) continue;
        let bd = Infinity;
        for (const n of row) { const d = Math.abs(n.col - cur.col) + (n.col > cur.col ? 0.1 : 0); if (d < bd) { bd = d; cand = n; } }
        break;
      }
    }
    if (cand) {
      this._select(cand, { scroll: true, sound: 'beep', open: false, type: true });
      if (this.root.contains(document.activeElement)) cand.el.focus({ preventScroll: true });
    }
  }

  _initialNode() {
    const avail = this.nodes.filter((n) => this._st.get(n.id) === 'avail');
    avail.sort((a, b) => (this._poor.get(a.id) - this._poor.get(b.id)) || a.cost - b.cost || a.row - b.row);
    return avail[0] || this.nodes.find((n) => this._st.get(n.id) === 'done') || this.nodes[0] || null;
  }

  // ------------------------------------------------------------ layout
  _resize() {
    if (!this._alive) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const compact = w < 720 || (w < 900 && h > w * 1.1);
    if (compact !== this._compact) {
      this._compact = compact;
      this.root.classList.toggle('is-compact', compact);
      if (!compact) this._openSheet(false, true);
    }
    const short = h < 520;
    this.root.classList.toggle('is-short', short);
    // integer pixel scale for the preview
    let k;
    if (compact) k = w >= 600 && !short ? 2 : 1;
    else k = short ? 1 : Math.max(1, Math.min(2, Math.floor(((this.$det.clientWidth || 336) - 28) / PW)));
    const wpx = PW * k, hpx = PH * k;
    this.pcv.style.width = `${wpx}px`;
    this.pcv.style.height = `${hpx}px`;
    this.$prev.classList.toggle('is-small', k === 1);
    // gentle zoom on big screens so the tree fills the view
    const vw = this.view.clientWidth;
    const z = vw > this.W * 1.5 + 40 && this.view.clientHeight > 700 ? 1.5 : 1;
    if (z !== this._zoom) {
      this._zoom = z;
      this.world.style.transform = z === 1 ? '' : `scale(${z})`;
      this.sizer.style.width = `${this.W * z}px`;
      this.sizer.style.height = `${this.H * z}px`;
    }
  }

  _center(n) {
    const v = this.view, z = this._zoom || 1;
    v.scrollLeft = n.x * z - v.clientWidth / 2;
    v.scrollTop = n.y * z - this._visibleH() / 2;
  }

  _visibleH() {
    const v = this.view;
    if (this._compact && this._sheetOpen) return Math.max(120, v.clientHeight - this.$det.offsetHeight);
    return v.clientHeight;
  }

  _scrollTo(n) {
    const v = this.view, z = this._zoom || 1;
    const x = n.x * z, y = n.y * z, m = 66 * z;
    const vw = v.clientWidth, vh = this._visibleH();
    let sl = v.scrollLeft, st = v.scrollTop;
    if (x - m < sl) sl = x - m;
    else if (x + m > sl + vw) sl = x + m - vw;
    if (y - m < st) st = y - m;
    else if (y + m > st + vh) st = y + m - vh;
    if (sl !== v.scrollLeft || st !== v.scrollTop) v.scrollTo({ left: sl, top: st, behavior: REDUCED ? 'auto' : 'smooth' });
  }

  _openSheet(open, silent) {
    if (!this._compact) open = false;
    if (this._sheetOpen === open) return;
    this._sheetOpen = open;
    this.root.classList.toggle('is-sheet', open);
    if (open && !silent) this._later(() => { if (this.sel) this._scrollTo(this.sel); }, 240);
  }

  // ------------------------------------------------------------ selection / detail
  _select(n, { scroll = true, sound = false, open = false, type = true } = {}) {
    const same = n === this.sel;
    if (this.sel && this.sel.el) this.sel.el.classList.remove('is-sel');
    this.sel = n;
    n.el.classList.add('is-sel');
    this.$ret.style.transform = `translate(${n.x - NODE / 2 - 10}px, ${n.y - NODE / 2 - 10}px)`;
    this.$ret.classList.add('is-on');
    if (sound) this._sfx(sound);
    if (open) this._openSheet(true);
    if (!same) {
      this._stamp = null;
      this.$stamp.className = 'ltree-stamp';
      this.pcv.width = PW;
      this.pcv.height = PH;
      this.pctx.imageSmoothingEnabled = false;
      this._lockedDrawn = null;
      this._renderDetail(type);
    }
    if (scroll) this._scrollTo(n);
  }

  _showTip(n) {
    const st = this._st.get(n.id);
    const name = st === 'locked' ? '???' : n.d.name;
    const line = st === 'done' ? '<i class="ok">RESEARCHED</i>' : st === 'locked' ? '<i class="bad">LOCKED</i>' : `<i class="${this._poor.get(n.id) ? 'bad' : 'gold'}">${this._icon('coin', 1)} ${fmt(n.cost)}</i>`;
    this.$tip.innerHTML = `<b>${esc(name)}</b>${line}`;
    this.$tip.style.left = `${n.x}px`;
    this.$tip.style.top = `${n.y - NODE / 2 - 8}px`;
    this.$tip.classList.add('is-on');
  }

  _renderDetail(animate) {
    const n = this.sel;
    if (!n) return;
    const st = this._st.get(n.id);
    const rev = st !== 'locked';
    const d = n.d;
    const br = this.branches[n.row];
    this.$file.textContent = `FILE R-${String(n.idx + 1).padStart(3, '0')}`;
    this.$branch.textContent = String(br?.name || '').toUpperCase();
    this.$det.dataset.state = st;
    const kind = d.species ? 'SPECIMEN' : d.build ? 'BLUEPRINT' : 'UPGRADE';
    this.$ptl.textContent = rev ? `${kind} R-${String(n.idx + 1).padStart(3, '0')}` : 'FILE SEALED';
    this.$ptr.innerHTML = rev ? '<i class="ltree-dot"></i>LIVE' : '';
    const name = rev ? d.name : '???';
    let sub = '';
    if (rev && d.species) {
      const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species];
      sub = sp?.latin ? `<i>${esc(sp.latin)}</i>` : '';
    }
    this.$sub.innerHTML = sub;
    const desc = rev ? String(d.desc || '') : 'This research file is classified. Research every prerequisite to decrypt it.';
    if (animate && !REDUCED) {
      this._type(this.$name, name, 90, 'name', false);
      this._type(this.$desc, desc, 240, 'desc', true);
    } else {
      this._typers.get('name')?.finish();
      this._typers.get('desc')?.finish();
      this.$name.textContent = name;
      this.$desc.textContent = desc;
    }
    // unlock chips
    let unl = '';
    if (rev) {
      if (d.species) {
        const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species];
        unl += `<span class="ltree-u">${this._icon('fish', 1)}NEW FISH<b>${esc(sp?.name || d.species)}</b></span>`;
      }
      if (d.build) {
        const names = [].concat(d.build).map((b) => STRUCT_DATA.STRUCTURES?.[b]?.name || b);
        unl += `<span class="ltree-u">${this._icon('hammer', 1)}NEW BUILD<b>${esc(names.join(', '))}</b></span>`;
      }
      if (d.mods) unl += `<span class="ltree-u">${this._icon('bolt', 1)}UPGRADE<b>PERMANENT</b></span>`;
    }
    this.$unl.innerHTML = unl;
    this._renderMeta();
  }

  _renderMeta() {
    const n = this.sel;
    if (!n) return;
    const st = this._st.get(n.id);
    const coins = this._coins();
    const poor = st !== 'done' && coins < n.cost;
    this.$cost.innerHTML = st === 'done'
      ? `<span class="ltree-ml">STATUS</span><b class="ok">${this._icon('check', 1)} RESEARCHED</b>`
      : `<span class="ltree-ml">COST</span><b class="${poor ? 'bad' : 'gold'}">${this._icon('coin', 1)} ${fmt(n.cost)}</b>${poor ? `<span class="ltree-short">NEED ${fmt(n.cost - coins)} MORE</span>` : ''}`;
    let reqs = '';
    if (n.req.length) {
      reqs = '<span class="ltree-ml">REQUIRES</span>';
      for (const r of n.req) {
        const p = this.byId.get(r);
        const ok = this._isRes(r);
        const nm = p ? (this._revealed(p) ? p.d.name : '???') : r;
        reqs += `<span class="ltree-rq ${ok ? 'ok' : 'bad'}">${this._icon(ok ? 'check' : 'cross', 1)}${esc(nm)}</span>`;
      }
    } else reqs = '<span class="ltree-ml">REQUIRES</span><span class="ltree-rq ok">NOTHING. GO!</span>';
    this.$reqs.innerHTML = reqs;
    this.$pbl.textContent = st === 'done' ? 'STATUS: RESEARCHED' : st === 'locked' ? 'STATUS: CLASSIFIED' : poor ? 'STATUS: NEED FUNDS' : 'STATUS: READY';
    this._renderButton();
  }

  _renderButton() {
    const n = this.sel;
    if (!n) return;
    const busy = this._busy && this._busy.id === n.id;
    const st = this._st.get(n.id);
    const b = this.$go;
    b.classList.toggle('is-busy', !!busy);
    b.classList.toggle('is-done', st === 'done' && !busy);
    if (busy) {
      b.disabled = true;
      this.$goL.textContent = this._busy.label;
      this.$why.textContent = '';
      return;
    }
    if (st === 'done') {
      b.disabled = true;
      this.$goL.innerHTML = `${this._icon('check', 1)} RESEARCHED`;
      this.$why.textContent = '';
      return;
    }
    const chk = this._check(n);
    b.disabled = !chk.ok;
    b.classList.toggle('is-no', !chk.ok);
    this.$goL.innerHTML = chk.ok
      ? `RESEARCH <span class="ltree-go-c">${this._icon('coin', 1)}${fmt(n.cost)}</span>`
      : st === 'locked' ? `${this._icon('lock', 1)} LOCKED` : 'RESEARCH';
    this.$why.textContent = chk.ok ? '' : String(chk.reason || '');
  }

  _type(el, text, cps, key, cursor) {
    this._typers.get(key)?.finish();
    const job = { dead: false };
    let i = 0, lastSfx = 0;
    const t0 = performance.now();
    job.finish = () => {
      if (job.dead) return;
      job.dead = true;
      el.textContent = text;
      el.classList.remove('is-typing');
      if (this._typers.get(key) === job) this._typers.delete(key);
    };
    this._typers.set(key, job);
    el.textContent = '';
    if (cursor) el.classList.add('is-typing');
    const step = () => {
      if (job.dead || !this._alive) return;
      const now = performance.now();
      const k = Math.min(text.length, Math.floor(((now - t0) / 1000) * cps) + 1);
      if (k !== i) {
        i = k;
        el.textContent = text.slice(0, i);
        if (now - lastSfx > 90 && key !== 'name') { lastSfx = now; this._sfx('type'); }
      }
      if (i >= text.length) job.finish();
      else requestAnimationFrame(step);
    };
    step();
  }

  _typeHeader() {
    const text = 'REYNARD LABS™ // R&D TERMINAL v6.6';
    if (REDUCED) { this.$title.textContent = text; return; }
    this._later(() => this._type(this.$title, text, 42, 'head', false), 260);
  }

  // ------------------------------------------------------------ research sequence
  _research() {
    const n = this.sel;
    if (!n || this._busy) return;
    const chk = this._check(n);
    if (!chk.ok) {
      this._sfx('error');
      this._fx(this.$go, 'is-shake', 400);
      this._fx(n.el, 'is-shake', 400);
      if (chk.reason) this.$why.textContent = String(chk.reason);
      return;
    }
    this._sfx('click');
    const labels = ['SYNTHESIZING', 'SYNTHESIZING.', 'SYNTHESIZING..', 'SYNTHESIZING...'];
    this._busy = { id: n.id, label: labels[0] };
    this._renderButton();
    this.$go.style.setProperty('--ltree-synth', `${SYNTH_MS}ms`);
    this._fx(n.el, 'is-synth', SYNTH_MS + 200);
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      this._later(() => {
        if (!this._busy) return;
        this._busy.label = labels[i];
        if (this.sel && this.sel.id === n.id) this.$goL.textContent = labels[i];
        this._sfx('beep');
      }, (SYNTH_MS / steps) * i);
    }
    this._later(() => {
      const again = this._check(n);
      if (!again.ok) { this._denied(n, again.reason); return; }
      this._showStamp(n, 'approved');
      this._sfx('stamp');
      this._later(() => {
        let ok = false;
        try { ok = !!this.o.onResearch?.(n.id); } catch (err) { console.error(err); ok = false; }
        if (!this._alive) return;
        this._busy = null;
        if (!ok) { this._denied(n, null); return; }
        this._sfx('research');
        this.refresh();
        if (this.sel === n) this._renderMeta();
      }, 260);
    }, SYNTH_MS);
  }

  _denied(n, reason) {
    this._busy = null;
    this._showStamp(n, 'denied');
    this._sfx('error');
    this.refresh();
    if (this.sel === n) {
      this._renderMeta();
      if (reason) this.$why.textContent = String(reason);
    }
  }

  _showStamp(n, kind) {
    if (this.sel !== n) return;
    this._stamp = { id: n.id, kind, t: performance.now() };
    this.$stamp.textContent = kind === 'approved' ? 'APPROVED' : 'DENIED';
    this.$stamp.className = 'ltree-stamp';
    void this.$stamp.offsetWidth;
    this.$stamp.className = `ltree-stamp is-on is-${kind}`;
    this._fx(this.$prev, 'is-thump', 300);
    if (kind === 'approved') {
      // sparkle burst on the preview canvas
      const R = rng(hashStr(n.id) ^ (performance.now() | 0));
      for (let i = 0; i < 26; i++) {
        const a = R() * Math.PI * 2, v = 30 + R() * 70;
        this._bursts.push({ x: PW / 2, y: PH / 2 - 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, t: 0, life: 0.6 + R() * 0.6, c: R() < 0.5 ? '#fff7c4' : R() < 0.5 ? '#7dffa8' : '#ffcc3a' });
      }
    }
  }

  _burstNode(n) {
    this._fx(n.el, 'is-burst', 1000);
    let sp = n.el.querySelector('.ltree-spk');
    if (!sp) { sp = document.createElement('span'); sp.className = 'ltree-spk'; n.el.appendChild(sp); }
    let h = '';
    for (let i = 0; i < 8; i++) h += `<i style="--a:${i * 45 + 20}deg">${this._icon('sparkle', 1)}</i>`;
    sp.innerHTML = h;
    this._later(() => { sp.innerHTML = ''; }, 1000);
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
    p.style.transition = 'stroke-dashoffset .7s ease-out';
    p.style.strokeDashoffset = '0';
    this._later(() => { p.classList.remove('is-surge'); p.style.transition = ''; p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }, 800);
  }

  // ------------------------------------------------------------ optional art
  _onOptional(m) {
    if (!this._alive || !m) return;
    if (m.fish && typeof m.fish.fishCanvas === 'function') {
      this._fish = m.fish;
      this._fishFrames.clear();
      for (const n of this.nodes) if (n.d.species) n.$ico.innerHTML = this._nodeIconHTML(n);
    }
    if (m.frames) {
      this._frames = m.frames;
      try { m.frames.injectFrameCSS?.(); } catch { /* ignore */ }
      const has = (name) => {
        const el = document.createElement('div');
        el.className = `f-${name}`;
        el.style.cssText = 'position:absolute;visibility:hidden;width:40px;height:40px';
        this.root.appendChild(el);
        const cs = getComputedStyle(el);
        const ok = (cs.borderImageSource && cs.borderImageSource !== 'none') || (cs.backgroundImage && cs.backgroundImage !== 'none');
        el.remove();
        return ok;
      };
      this._fr = {
        slots: has('slot_gold') && has('slot_brass') && has('slot_locked'),
        chip: has('chip'),
        btn: has('button_green'),
      };
      this.root.classList.toggle('ltree--fslots', this._fr.slots);
      this.root.classList.toggle('ltree--fchip', this._fr.chip);
      this.root.classList.toggle('ltree--fbtn', this._fr.btn);
      if (this._fr.chip) for (const n of this.nodes) n.$chip.classList.add('f-chip');
      if (this._fr.btn) this.$go.classList.add('f-button_green');
      for (const n of this.nodes) this._applySlotFrame(n);
    }
  }

  _applySlotFrame(n) {
    if (!this._fr?.slots || !n.$fr) return;
    const st = this._st.get(n.id);
    const name = st === 'done' ? 'slot_gold' : st === 'avail' ? 'slot_brass' : 'slot_locked';
    n.$fr.className = `ltree-fr f-${name}`;
  }

  // ------------------------------------------------------------ render loop
  _loop = (now) => {
    if (!this._alive) return;
    this._raf = requestAnimationFrame(this._loop);
    now = now || performance.now();
    const dt = Math.min(0.1, (now - (this._lastDraw || now)) / 1000);
    if (now - this._lastDraw < 30) return;
    this._lastDraw = now;
    const t = (now - this._t0) / 1000;
    // funds counter
    if (this._dispCoins !== this._targetCoins) {
      const d = this._targetCoins - this._dispCoins;
      this._dispCoins = Math.abs(d) < 1 ? this._targetCoins : this._dispCoins + d * Math.min(1, dt * 9);
      this.$funds.textContent = fmt(Math.round(this._dispCoins));
    }
    // coins may change without a refresh() call (e.g. bears paying): keep chips honest
    if (now - this._lastPoll > 500) {
      this._lastPoll = now;
      if (this._coins() !== this._lastCoins && !this._busy) this.refresh();
    }
    this._drawPreview(t, dt);
  };

  _drawPreview(t, dt) {
    const n = this.sel;
    if (!n) return;
    const cv = this.pcv, ctx = this.pctx;
    const st = this._st.get(n.id);
    if (st === 'locked') {
      if (this._lockedDrawn !== n.id) { this._lockedDrawn = n.id; drawClassified(ctx, cv.width, cv.height, n.id); }
      this.$prev.dataset.mode = 'locked';
      return;
    }
    this._lockedDrawn = null;
    this.$prev.dataset.mode = st;
    let custom = false;
    if (this.o.preview) {
      try { custom = !!this.o.preview(n.d, cv, t); } catch (err) { custom = false; }
    }
    if (!custom) {
      if (cv.width !== PW || cv.height !== PH) { cv.width = PW; cv.height = PH; }
      ctx.imageSmoothingEnabled = false;
      const W = cv.width, H = cv.height;
      drawBackdrop(ctx, W, H, t, st === 'done');
      const sp = n.d.species;
      const f0 = sp && this._fishFrame(sp, 0);
      if (f0) this._drawFish(ctx, W, H, t, sp);
      else this._drawIcon(ctx, W, H, t, n);
      drawScan(ctx, W, H, t);
      drawSparkles(ctx, W, H, t, hashStr(n.id), st === 'done' ? 7 : 4);
    }
    this._drawBursts(ctx, dt);
  }

  _drawIcon(ctx, W, H, t, n) {
    const m = this._iconMeta(n.d.icon);
    const img = m.img;
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = Math.max(1, Math.floor(Math.min((H * 0.56) / m.h, (W * 0.5) / m.w)));
    const w = m.w * s, h = m.h * s;
    const bob = Math.round(Math.sin(t * 2.2) * 2.5);
    const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2 - 5 + bob);
    // shadow on the pedestal
    const sw = Math.round(w * (0.62 - bob * 0.03));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(Math.round(W / 2 - sw / 2), H - 17, sw, 3);
    ctx.fillRect(Math.round(W / 2 - sw / 2) + 2, H - 18, sw - 4, 5);
    ctx.drawImage(img, x, y, w, h);
  }

  _drawFish(ctx, W, H, t, sp) {
    const frame = Math.floor(t * 6) % 4;
    const f = this._fishFrame(sp, frame) || this._fishFrame(sp, 0);
    if (!f) return;
    const s = Math.max(1, Math.floor(Math.min((W * 0.46) / f.width, (H * 0.42) / f.height)));
    const w = f.width * s, h = f.height * s;
    const range = Math.max(0, (W - w) / 2 - 10);
    const ph = t * 0.75;
    const cx = W / 2 + Math.sin(ph) * range;
    const right = Math.cos(ph) >= 0;
    const y = Math.round(H / 2 - h / 2 - 4 + Math.sin(t * 2.7) * 2);
    const x = Math.round(cx - w / 2);
    ctx.save();
    if (!right) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(f, x, y, w, h);
    ctx.restore();
    // bubbles
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.6 + i * 0.27) % 1;
      const bx = Math.round(cx + (right ? w / 2 : -w / 2) * 0.8 + Math.sin(t * 3 + i) * 2);
      const by = Math.round(y + h * 0.3 - k * 34);
      if (by < 4) continue;
      ctx.fillStyle = `rgba(160,255,200,${0.7 * (1 - k)})`;
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

// ---------------------------------------------------------------- preview drawing
function drawBackdrop(ctx, W, H, t, done) {
  ctx.fillStyle = '#021208';
  ctx.fillRect(0, 0, W, H);
  // graph-paper grid drifting slowly
  const off = Math.floor(t * 4) % 8;
  ctx.fillStyle = '#06261a';
  for (let x = -off; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
  for (let y = off; y < H; y += 8) ctx.fillRect(0, y, W, 1);
  // center glow
  const g = ctx.createRadialGradient(W / 2, H / 2 - 4, 2, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, done ? 'rgba(255,214,90,0.22)' : 'rgba(70,255,150,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // holo pedestal: pixel ellipses with a travelling pulse
  const cx = W / 2, cy = H - 14;
  for (let r = 0; r < 3; r++) {
    const rx = 18 + r * 9, ry = 3 + r * 1.6;
    const pulse = (t * 0.9 + r / 3) % 1;
    const a = 0.18 + 0.5 * (1 - Math.abs(pulse - 0.5) * 2);
    ctx.fillStyle = done ? `rgba(255,214,90,${a})` : `rgba(90,255,160,${a})`;
    for (let i = 0; i < 64; i++) {
      const ang = (i / 64) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * rx), Math.round(cy + Math.sin(ang) * ry), 1, 1);
    }
  }
  // rising holo beam
  ctx.fillStyle = done ? 'rgba(255,214,90,0.05)' : 'rgba(90,255,160,0.05)';
  ctx.fillRect(cx - 22, 8, 44, cy - 8);
}

function drawScan(ctx, W, H, t) {
  // sweeping scan line with a soft trail
  const y = Math.floor(((t * 34) % (H + 26)) - 12);
  for (let i = 0; i < 10; i++) {
    const yy = y - i;
    if (yy < 0 || yy >= H) continue;
    ctx.fillStyle = `rgba(120,255,180,${i === 0 ? 0.55 : 0.16 * (1 - i / 10)})`;
    ctx.fillRect(0, yy, W, 1);
  }
  // CRT rows
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
    ctx.fillStyle = R() < 0.5 ? '#eafff0' : '#ffe890';
    ctx.fillRect(x, y, 1, 1);
    if (s) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1); }
  }
}

function drawClassified(ctx, W, H, id) {
  ctx.fillStyle = '#080303';
  ctx.fillRect(0, 0, W, H);
  const R = rng(hashStr(id));
  for (let i = 0; i < W * H * 0.08; i++) {
    const x = Math.floor(R() * W), y = Math.floor(R() * H), v = R();
    ctx.fillStyle = v < 0.7 ? '#150707' : v < 0.95 ? '#210b0b' : '#3a1414';
    ctx.fillRect(x, y, 1, 1);
  }
  // hazard bands
  for (const y0 of [0, H - 7]) {
    ctx.fillStyle = '#120404';
    ctx.fillRect(0, y0, W, 7);
    ctx.fillStyle = '#3a0e0a';
    for (let x = -8; x < W + 8; x += 8) for (let j = 0; j < 7; j++) ctx.fillRect(x + j, y0 + j, 4, 1);
  }
  // big "?"
  const s = 7, gw = 5 * s, gh = 7 * s;
  const ox = Math.round((W - gw) / 2), oy = Math.round((H - gh) / 2);
  const glyph = (dx, dy, col) => {
    ctx.fillStyle = col;
    QMARK.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === 'x') ctx.fillRect(ox + i * s + dx, oy + j * s + dy, s, s); });
  };
  glyph(2, 2, '#000000');
  glyph(0, 0, '#4a1414');
  ctx.fillStyle = '#6e2020';
  QMARK.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === 'x') { ctx.fillRect(ox + i * s, oy + j * s, s, 1); ctx.fillRect(ox + i * s, oy + j * s, 1, s); } });
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let yy = 1; yy < H; yy += 2) ctx.fillRect(0, yy, W, 1);
}
