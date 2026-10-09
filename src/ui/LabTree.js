// LabTree: Reynard's research computer (v26 remake): a plain green-phosphor
// terminal that opens instantly. No boot screen, no top bar, no glitches.
//
//   left   section list ("jump to"), the lab benches with running jobs, coins, EXIT
//   middle the research map: ONE canvas (src/ui/lab/treeView.js) with the sections
//          as stacked bands, nodes on a grid by requirement depth, orthogonal wires
//          (layout: src/ui/lab/layout.js). Drag / wheel / pinch to pan + zoom.
//   right  details of the selected node (or locked section) + RESEARCH / RUSH / UNLOCK
//   + Reynard himself, a tiny 3D voxel fox in a lab coat hopping between the
//     nodes and talking you through it (src/ui/labFox.js)
// On a phone the side column becomes a bottom dock and the details a bottom sheet.
//
// Research is FREE but TIMED: picking a node puts it on a lab bench; a running job can
// be rushed with coins. Sections (= branches) can be locked behind a section key.
//
//   const tree = new LabTree(container, {
//     research, branches,                // data (src/data/research.js)
//     isResearched: (id) => bool,
//     canResearch: (id) => ({ ok, reason }),
//     onResearch: (id) => bool,          // = game.startResearch (or instant game.research)
//     jobs: () => [{ id, k, left, time }],  // running jobs (optional: no jobs => instant research)
//     slots: () => number,               // lab benches (default 1)
//     zoneName: (zid) => 'Dale',  isZoneOpen: (zid) => bool,
//     fishCanvas?: (species, { frame, scale }) => canvas,
//     sfx?: (name) => void,              // hover click select error start done unlock rush rushnow
//                                        // decrypt denied fox foxyay sector open off hop type
//     onClose,
//     coins?: () => number, speed?: () => number,
//     rushPrice?: (id, mode) => number, onRush?: (id, mode) => ({ ok, msg }),   // mode 'half' | 'now'
//     sections?: { isOpen(b), key(b) => { needs:[{kind,ok,text,id}], coins, ready, canUnlock }, unlock(b) => ({ ok, msg }) },
//     quiet?: () => bool,                // the fox keeps his mouth shut (tutorial talking)
//     game?,                             // a Game: supplies coins/speed/rush/sections
//   });
//   tree.refresh(); tree.select(id); tree.destroy();
//
// Stable hooks for the tutorial (src/game/Tutorial.js LAB_SEL): `.lt-node[data-id]`
// (invisible boxes that track the canvas nodes), `.lt-go`, `.lt-bench`, `.lt-slotc[data-job]`.
import './labtree.css';
import * as SPECIES_DATA from '../data/species.js';
import * as STRUCT_DATA from '../data/structures.js';
import { layoutTree } from './lab/layout.js';
import { TreeView, fmtClock } from './lab/treeView.js';
import { IconBank } from './lab/icons.js';
import { glyphHTML } from './lab/glyphs.js';
import * as Guide from './lab/guide.js';
import { LabFox } from './labFox.js';

export { fmtClock };

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

const MAXZ = 1.8;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();
const human = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export function fmtDur(s) {
  if (Number(s) === Infinity) return '--:--';
  s = Math.max(0, Math.ceil(Number(s) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m < 60) return r ? `${m}m ${String(r).padStart(2, '0')}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const MOD_TEXT = {
  beautyMult: 'beauty from decor', breedMult: 'breeding speed', bugMult: 'bug catches', bugBonus: 'bug per catch',
  capacityMult: 'pond capacity', clutchBonus: 'egg per clutch', eggSlots: 'incubator slot', hatchSpeed: 'hatch speed',
  fishValueMult: 'fish value', foodMult: 'food from snacks', goldenMult: 'golden fish chance', growthMult: 'fish growth speed',
  hybridMult: 'hybrid chance', morphMult: 'rare morph chance', produceMult: 'garden produce', snackMealMult: 'snack meal value',
  traitMult: 'trait chance', labSlots: 'lab bench', beaverBonus: 'beaver per lodge', bagBonus: 'food bag size', researchSpeed: 'research speed',
};
function modLine(k, v) {
  const t = MOD_TEXT[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase();
  const n = Number(v);
  if (!Number.isFinite(n)) return t;
  if (/Mult$|Speed$|^researchSpeed$/.test(k)) return `+${Math.round(n * 100)}% ${t}`;
  return `+${n} ${t}${n > 1 && !/s$/.test(t) && !/(size|chance|speed)$/.test(t) ? 's' : ''}`;
}

const STATE_TEXT = { done: 'RESEARCHED', run: 'RESEARCHING', avail: 'READY', zone: 'NEEDS A NEIGHBOUR', locked: 'LOCKED', sealed: 'SECTION LOCKED' };

// fills missing options from a Game (explicit `game`, or the page's game when the tree runs inside it)
function withGame(opts) {
  let G = opts.game || null;
  if (!G && typeof window !== 'undefined' && opts.jobs && window.__game && typeof window.__game.sectionOpen === 'function') G = window.__game;
  if (!G) return opts;
  const o = { ...opts };
  if (!o.coins) o.coins = () => G.state?.coins ?? 0;
  if (!o.speed && typeof G.researchSpeed === 'function') o.speed = () => G.researchSpeed();
  if (!o.onRush && typeof G.rushResearchPaid === 'function') { o.rushPrice = (id, m) => G.rushResearchPrice(id, m); o.onRush = (id, m) => G.rushResearchPaid(id, m); }
  if (!o.sections && typeof G.sectionOpen === 'function') o.sections = { isOpen: (b) => G.sectionOpen(b), key: (b) => G.sectionKey(b), unlock: (b) => G.unlockSection(b) };
  if (!o.quiet) o.quiet = () => !!(G.tutorial?.active && !G.state?.tutorialDone);
  return o;
}

// one layout per data set (the research data is static once the game has loaded)
let LAYOUT = null;
function layoutFor(branches, research) {
  const sig = branches.map((b) => b.id).join(',') + '|' + research.map((r) => r.id + ':' + r.branch + ':' + (r.req || []).join('+')).join(',');
  if (LAYOUT && LAYOUT.sig === sig) return LAYOUT.L;
  const L = layoutTree(branches, research);
  LAYOUT = { sig, L };
  return L;
}

let PC_OPEN = 0; // trees on screen: the page body gets .lt-pc (the computer takes over)

export class LabTree {
  constructor(container, opts = {}) {
    const t0 = now();
    this.container = container;
    this.o = opts = withGame(opts);
    this._alive = true;
    this._timers = new Set();
    this._off = [];
    this._ptrs = new Map();
    this._jobs = [];
    this._jobIds = new Set();
    this._jobSig = '';
    this._lastPoll = 0;
    this._fx = [];
    this._toastQ = [];
    this.cam = { x: 0, y: 0, z: 1 };
    this.goal = null;
    this.sel = null;
    this.selSec = null;
    this.hover = null;
    this.hoverTag = null;
    this._dirty = true;
    this._frames = 0;

    const branches = (opts.branches || []).filter(Boolean);
    const research = (opts.research || []).filter((d) => d && d.id && branches.some((b) => b.id === d.branch));
    this.L = layoutFor(branches, research);
    this.nodes = this.L.nodes;
    this.sections = this.L.sections;
    this.byId = this.L.byId;
    this.icons = new IconBank({ fishCanvas: opts.fishCanvas || null });

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    if (++PC_OPEN === 1) document.body.classList.add('lt-pc');
    const tm = (this._tm = {});
    let tp = t0;
    const mark = (k) => { const t = now(); tm[k] = +(t - tp).toFixed(1); tp = t; };
    mark('layout');
    this._buildDOM();
    mark('dom');
    this.view3 = new TreeView(this.cv, this.L, this.icons);
    if (!this.L.nodes[0]?.nameLines) this.view3.measure();
    mark('measure');
    this._pollJobs(true);
    this.refresh(true);
    mark('refresh');
    this._bind();
    this._resize();
    mark('resize');
    const first = this._initialNode();
    if (first) this._select(first, { pan: false, sound: false, open: false });
    this._centerOn(first, true);
    mark('select');
    this._draw();
    mark('draw');
    this._sfx('open');
    this.openMs = now() - t0;
    this._raf = requestAnimationFrame(this._loop);
    // the pixel font may still be loading on a cold start: re-fit the names once it's in
    if (document.fonts && !document.fonts.check?.('14px "TBME Title"')) {
      document.fonts.load('14px "TBME Title"').then(() => { if (this._alive) { this.view3.measure(); this._dirty = true; } }).catch(() => {});
    }
    if (!opts.fishCanvas) loadFish().then((m) => { if (this._alive && m?.fishCanvas) { this.icons = new IconBank({ fishCanvas: m.fishCanvas }); this.view3.icons = this.icons; this._renderDetail(); this._renderBench(); this._dirty = true; } });
    // Reynard hops in a moment later (building his voxel rig must not delay the screen)
    // (built on the second frame, see _loop)
    this._t0 = t0;
  }

  // ------------------------------------------------------------ public API
  refresh(initial = false) {
    if (!this._alive) return;
    const changed = [];
    const opened = [];
    for (const S of this.sections) {
      const sealed = this._sealedCalc(S);
      if (sealed !== S.sealed) {
        if (!initial && S.sealed && !sealed) opened.push(S);
        S.sealed = sealed;
        this._dirty = true;
      }
    }
    const sp = this._speed();
    for (const N of this.nodes) {
      const st = this._calc(N);
      const line = this._line(N, st, sp);
      if (line !== N.line) { N.line = line; this._dirty = true; }
      const prev = N.st;
      if (prev === st && !initial) continue;
      N.st = st;
      this._dirty = true;
      if (!initial && prev) changed.push([N, prev, st]);
    }
    for (const [N, prev, st] of changed) {
      if (st === 'done') this._celebrate(N, prev);
      else if (st === 'run' && prev !== 'run') this.fox?.onStart?.(N);
    }
    for (const S of opened) this._decrypted(S);
    if (this.selSec && !this.selSec.sealed) {
      const S = this.selSec;
      this.selSec = null;
      const pick = S.nodes.find((N) => N.st === 'avail') || S.nodes[0];
      if (pick) this._select(pick, { pan: false, sound: false, open: false });
    }
    this._renderSecs();
    if (this.selSec) { if (initial || this._secSig !== this._keySig(this.selSec)) this._renderDetail(); else this._renderAct(); }
    else if (this.sel && (initial || changed.some(([N]) => N === this.sel || N.kids.includes(this.sel) || this.sel.req.includes(N.id)))) this._renderDetail();
    else if (this.sel) this._renderAct();
    if (changed.length || initial) this._renderBench();
  }

  select(id) {
    const N = this.byId.get(id);
    if (N) this._select(N, { pan: true, sound: false, open: true });
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
    try { this.fox?.destroy(); } catch { /* ignore */ }
    this.fox = null;
    this._sfx('off');
    this.root.remove();
    if (--PC_OPEN <= 0) { PC_OPEN = 0; document.body.classList.remove('lt-pc'); }
  }

  // ------------------------------------------------------------ helpers (also used by the fox / guide)
  _sfx(name) { try { this.o.sfx?.(name); } catch { /* ignore */ } }
  _isRes(id) { try { return !!this.o.isResearched?.(id); } catch { return false; } }
  zoneName(z) {
    try { const s = this.o.zoneName?.(z); if (s) return String(s); } catch { /* ignore */ }
    return 'a new neighbour';
  }
  _zoneOpen(z) {
    if (!z) return true;
    if (typeof this.o.isZoneOpen === 'function') { try { return !!this.o.isZoneOpen(z); } catch { return true; } }
    return true;
  }
  _timed() { return typeof this.o.jobs === 'function'; }
  _sealedCalc(S) {
    if (!S || !this.o.sections?.isOpen) return false;
    try { return !this.o.sections.isOpen(S.id); } catch { return false; }
  }
  secKey(S) {
    let k = null;
    try { k = this.o.sections?.key?.(S.id) || null; } catch { k = null; }
    return k || { needs: [], coins: 0, ready: true, canUnlock: true };
  }
  coins() { try { const c = Number(this.o.coins?.()); return Number.isFinite(c) ? c : null; } catch { return null; } }
  _rushOK() { return typeof this.o.onRush === 'function' && typeof this.o.rushPrice === 'function'; }
  rushPrice(id, mode) { if (!this._rushOK()) return null; try { const v = Number(this.o.rushPrice(id, mode)); return Number.isFinite(v) ? v : null; } catch { return null; } }
  slots() { try { const s = Number(this.o.slots?.()); return s > 0 ? Math.floor(s) : 1; } catch { return 1; } }
  _speed() { try { const v = Number(this.o.speed?.()); return v > 0 ? v : 1; } catch { return 1; } }
  quiet() { try { return !!this.o.quiet?.(); } catch { return false; } }
  st(N) { return N?.st || 'locked'; }
  job(N) { return this._jobs.find((j) => j.id === N?.id) || null; }
  time(N) { return (Number(N?.d.time) || 0) / this._speed(); }
  fmt(s) { return fmtDur(s); }
  get jobs() { return this._jobs; }

  _pollJobs(force) {
    let raw = null;
    if (this._timed()) { try { raw = this.o.jobs(); } catch { raw = null; } }
    const list = [];
    if (Array.isArray(raw)) {
      for (const j of raw) {
        if (!j || !j.id) continue;
        const n = this.byId.get(j.id);
        const time = Number(j.time ?? n?.d.time) || 0;
        const t = Number(j.t) || 0;
        const k = clamp(Number(j.k ?? (time ? t / time : 0)) || 0, 0, 1);
        const left = Math.max(0, Number(j.left ?? (time - t)) || 0);
        list.push({ id: j.id, k, left, time, n });
      }
    }
    this._jobs = list;
    this._jobIds = new Set(list.map((j) => j.id));
    const sig = list.map((j) => j.id).join('|') + '#' + this.slots();
    const changed = sig !== this._jobSig;
    this._jobSig = sig;
    if (changed || force) this._renderBench();
    return changed;
  }

  _calc(N) {
    if (this._isRes(N.id)) return 'done';
    if (N.S.sealed) return 'sealed';
    if (this._jobIds?.has(N.id)) return 'run';
    if (!N.req.every((r) => this._isRes(r) || !this.byId.has(r))) return 'locked';
    if (N.d.zone && !this._zoneOpen(N.d.zone)) return 'zone';
    if (!this.o.isZoneOpen && this.o.canResearch) {
      try { const r = this.o.canResearch(N.id); if (r && !r.ok && /^Meet /.test(r.reason || '')) return 'zone'; } catch { /* ignore */ }
    }
    return 'avail';
  }

  // the node's status line on the map
  _line(N, st, sp) {
    if (st === 'done') return 'RESEARCHED';
    if (st === 'sealed') return 'SECTION LOCKED';
    if (st === 'run') return '';
    if (st === 'zone') return `MEET ${this.zoneName(N.d.zone).toUpperCase()}`;
    if (st === 'locked') {
      const miss = N.req.filter((r) => !this._isRes(r) && this.byId.has(r));
      const P = this.byId.get(miss[0]);
      return P ? `NEEDS ${P.d.name.toUpperCase()}${miss.length > 1 ? ` +${miss.length - 1}` : ''}` : 'LOCKED';
    }
    return this._timed() && N.d.time ? `READY  ${fmtDur(N.d.time / sp)}` : 'READY';
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (this._alive) fn(); }, ms);
    this._timers.add(t);
    return t;
  }
  _fxEl(el, cls, ms) {
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
  _check(N) {
    const st = N.st;
    if (st === 'done') return { ok: false, reason: 'Already researched' };
    if (st === 'run') return { ok: false, reason: 'Researching...' };
    if (st === 'sealed') return { ok: false, reason: `Unlock ${N.S.b.name} first` };
    let r = null;
    if (this.o.canResearch) { try { r = this.o.canResearch(N.id); } catch { r = null; } }
    if (!r || typeof r !== 'object') r = { ok: st === 'avail' };
    if (r.ok && this._timed() && this._jobs.length >= this.slots()) r = { ok: false, reason: 'Lab bench busy' };
    if (!r.ok && !r.reason) r = { ok: false, reason: st === 'locked' ? 'Research the prerequisites first' : st === 'zone' ? `Meet ${this.zoneName(N.d.zone)} first` : 'Not available right now' };
    return r;
  }

  /** what a node unlocks: [{ art, name, kind, fish }] */
  unlocks(d, box = 28) {
    const out = [];
    for (const b of [].concat(d.build || [])) {
      if (!b) continue;
      const s = STRUCT_DATA.STRUCTURES?.[b];
      out.push({ art: this.icons.iconHTML(s?.icon || b, box), name: s?.name || human(b), kind: 'Build' });
    }
    if (d.species) {
      const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species];
      out.push({ art: this.icons.nodeHTML({ species: d.species, icon: 'fish' }, box + 8), name: sp?.name || human(d.species), kind: 'Fish eggs', fish: true });
    }
    if (d.mods) for (const [k, v] of Object.entries(d.mods)) out.push({ art: this.icons.iconHTML(k === 'labSlots' ? 'flask' : 'bolt', box - 4), name: modLine(k, v), kind: 'Upgrade' });
    if (d.feature) out.push({ art: this.icons.iconHTML('gear', box - 4), name: d.featureName || human(d.feature), kind: 'Feature' });
    return out;
  }

  // ------------------------------------------------------------ DOM
  _buildDOM() {
    const root = document.createElement('div');
    root.className = 'ltree';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Reynard Labs research terminal');
    const secs = this.sections.map((S) => `<button type="button" class="lt-sec" data-b="${S.i}"><span class="lt-sec-n">${String(S.i + 1).padStart(2, '0')}</span><span class="lt-sec-t">${esc(S.b.name)}</span><span class="lt-sec-c"></span></button>`).join('');
    const anchors = this.nodes.map((N) => `<i class="lt-node" data-id="${esc(N.id)}" style="left:${N.x}px;top:${N.y}px;width:${N.w}px;height:${N.h}px"></i>`).join('');
    root.innerHTML = `
      <div class="lt-side">
        <div class="lt-brand"><b>REYNARD LABS</b><small>research terminal. no touching.</small></div>
        <div class="lt-h">SECTIONS</div>
        <nav class="lt-secs" aria-label="Jump to a section">${secs}</nav>
        <div class="lt-bench" aria-label="Lab benches">
          <div class="lt-h lt-bench-h">BENCHES <span class="lt-bench-s"></span></div>
          <div class="lt-slots"></div>
        </div>
        <div class="lt-foot">
          <span class="lt-coins" title="Your coins">${glyphHTML('coin', '#ffc04a', 2)}<b>0</b></span>
          <button type="button" class="lt-secbtn" aria-label="Sections">SECTIONS</button>
          <button type="button" class="lt-close" aria-label="Close the lab computer (Esc)">EXIT <kbd>ESC</kbd></button>
        </div>
      </div>
      <div class="lt-view" tabindex="0" aria-label="Research map. Drag to pan, scroll or pinch to zoom, tap a project.">
        <canvas class="lt-cv"></canvas>
        <div class="lt-anchors" aria-hidden="true">${anchors}</div>
        <div class="lt-zoom">
          <button type="button" data-z="in" aria-label="Zoom in">${glyphHTML('plus', '#52e47e', 3)}</button>
          <button type="button" data-z="out" aria-label="Zoom out">${glyphHTML('minus', '#52e47e', 3)}</button>
          <button type="button" data-z="fit" aria-label="Zoom out to the whole map">${glyphHTML('fit', '#52e47e', 3)}</button>
        </div>
        <div class="lt-toast" aria-live="polite"></div>
      </div>
      <aside class="lt-det" aria-live="polite">
        <div class="lt-det-top"><span class="lt-det-k"></span><button type="button" class="lt-det-x" aria-label="Close details">${glyphHTML('x', '#52e47e', 2)}</button></div>
        <div class="lt-det-scroll">
          <div class="lt-pv"><canvas width="140" height="52"></canvas><span class="lt-pv-st"></span></div>
          <h2 class="lt-name"></h2>
          <p class="lt-desc"></p>
          <div class="lt-blk lt-blk-unl"><h3 class="lt-h-unl">UNLOCKS</h3><ul class="lt-unl"></ul></div>
          <div class="lt-blk lt-blk-time"><h3 class="lt-h-time">TIME</h3><div class="lt-time"></div></div>
          <div class="lt-blk lt-blk-req"><h3 class="lt-h-req">NEEDS</h3><ul class="lt-reqs"></ul></div>
          <div class="lt-blk lt-blk-kids"><h3>LEADS TO</h3><div class="lt-kids"></div></div>
        </div>
        <div class="lt-act">
          <button type="button" class="lt-go"><span class="lt-go-fill"></span><span class="lt-go-l"></span><span class="lt-go-s"></span></button>
          <div class="lt-rush" hidden>
            <button type="button" class="lt-rbtn" data-rush="half">${glyphHTML('rush', '#ffc04a', 2)}<span>RUSH -50%</span><b></b></button>
            <button type="button" class="lt-rbtn" data-rush="now">${glyphHTML('ff', '#ffc04a', 2)}<span>FINISH NOW</span><b></b></button>
          </div>
        </div>
      </aside>
      <div class="lt-scan" aria-hidden="true"></div>`;
    this.container.appendChild(root);
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.view = $('.lt-view');
    this.cv = $('.lt-cv');
    this.$anchors = $('.lt-anchors');
    this.$secs = $('.lt-secs');
    this.$secEls = [...root.querySelectorAll('.lt-sec')];
    this.$slots = $('.lt-slots');
    this.$benchS = $('.lt-bench-s');
    this.$coins = $('.lt-coins');
    this.$coinsV = $('.lt-coins b');
    this.$toast = $('.lt-toast');
    this.$det = $('.lt-det');
    this.$detK = $('.lt-det-k');
    this.pcv = $('.lt-pv canvas');
    this.pctx = this.pcv.getContext('2d');
    this.$pvSt = $('.lt-pv-st');
    this.$name = $('.lt-name');
    this.$desc = $('.lt-desc');
    this.$unl = $('.lt-unl');
    this.$hUnl = $('.lt-h-unl');
    this.$time = $('.lt-time');
    this.$hTime = $('.lt-h-time');
    this.$reqs = $('.lt-reqs');
    this.$hReq = $('.lt-h-req');
    this.$kids = $('.lt-kids');
    this.$blkKids = $('.lt-blk-kids');
    this.$blkUnl = $('.lt-blk-unl');
    this.$blkTime = $('.lt-blk-time');
    this.$go = $('.lt-go');
    this.$goL = $('.lt-go-l');
    this.$goS = $('.lt-go-s');
    this.$goFill = $('.lt-go-fill');
    this.$rush = $('.lt-rush');
    this.$rushB = [...root.querySelectorAll('.lt-rush .lt-rbtn')].map((el) => ({ el, mode: el.dataset.rush, p: el.querySelector('b') }));
    if (typeof this.o.coins !== 'function') this.$coins.hidden = true;
  }

  // ------------------------------------------------------------ section list
  _secInfo(S) {
    let done = 0, ready = 0;
    for (const N of S.nodes) { if (N.st === 'done') done++; else if (N.st === 'avail') ready++; }
    return { sealed: !!S.sealed, done, ready, total: S.nodes.length, key: S.sealed ? this.secKey(S) : null };
  }

  _renderSecs() {
    for (const S of this.sections) {
      const el = this.$secEls[S.i];
      if (!el) continue;
      const I = this._secInfo(S);
      let c;
      if (I.sealed) c = I.key?.canUnlock ? `<em class="is-key">${glyphHTML('key', '#ffc04a', 2)}</em>` : glyphHTML('lock', '#2b7442', 2);
      else c = `${I.ready ? '<i class="lt-dot"></i>' : ''}${I.done}/${I.total}`;
      if (c !== el._c) { el._c = c; el.querySelector('.lt-sec-c').innerHTML = c; }
      el.classList.toggle('is-sealed', I.sealed);
      el.classList.toggle('is-full', !I.sealed && I.done === I.total);
    }
  }

  // which section is under the middle of the view
  _hereSec() {
    const vh = this.view.clientHeight;
    const wy = (vh * 0.22 - this.cam.y) / this.cam.z;
    let S = this.L.sectionAt(wy);
    if (!S) S = wy < 0 ? this.sections[0] : this.sections[this.sections.length - 1];
    if (S !== this._here) {
      this._here = S;
      for (const el of this.$secEls) el.classList.toggle('is-here', +el.dataset.b === S?.i);
      if (S) {
        const el = this.$secEls[S.i];
        const p = this.$secs;
        if (el && p.scrollHeight > p.clientHeight && !this._compact) {
          const top = el.offsetTop - p.offsetTop;
          if (top < p.scrollTop || top + el.offsetHeight > p.scrollTop + p.clientHeight) p.scrollTop = top - p.clientHeight / 2;
        }
      }
    }
  }

  _jumpSec(S) {
    if (!S) return;
    this._sfx(S.sealed ? 'sector' : 'select');
    this.root.classList.remove('is-secs');
    const vw = this.view.clientWidth, vh = this._visH();
    const fitW = (vw - 40) / Math.max(1, this.L.G.PADL + S.cols * this.L.G.CW);
    const fitH = (vh - 40) / Math.max(1, S.h);
    const z = clamp(Math.min(1, fitW, fitH), Math.max(this._minZ(), 0.45), MAXZ);
    this._goTo({ z, x: 12, y: 16 - S.y0 * z });
    if (S.sealed) this._selectSection(S, { pan: false, sound: false, open: true });
    else {
      const pick = S.nodes.find((N) => N.st === 'run') || S.nodes.find((N) => N.st === 'avail') || S.nodes.find((N) => N.st !== 'done') || S.nodes[0];
      if (pick) this._select(pick, { pan: false, sound: false, open: false });
    }
  }

  // ------------------------------------------------------------ events
  _bind() {
    const view = this.view;
    this._on(view, 'pointerdown', (e) => this._onDown(e));
    this._on(window, 'pointermove', (e) => this._onMove(e));
    this._on(window, 'pointerup', (e) => this._onUp(e));
    this._on(window, 'pointercancel', (e) => this._onUp(e, true));
    this._on(view, 'pointerleave', (e) => { if (e.pointerType === 'mouse' && !this._drag) this._setHover(null, null); });
    this._on(view, 'wheel', (e) => this._onWheel(e), { passive: false });
    this._on(view, 'dblclick', (e) => {
      const N = this._hitAt(e.clientX, e.clientY);
      if (N && N === this.sel && !this._compact) this._research();
    });
    this._on(this.root, 'contextmenu', (e) => e.preventDefault());
    this._on(window, 'keydown', (e) => this._key(e), true);
    this._on(this.root.querySelector('.lt-zoom'), 'click', (e) => {
      const z = e.target.closest('[data-z]')?.dataset.z;
      if (!z) return;
      this._sfx('click');
      if (z === 'fit') this._fitAll();
      else this._zoomBy(z === 'in' ? 1.3 : 1 / 1.3);
    });
    this._on(this.$secs, 'click', (e) => {
      const b = e.target.closest('.lt-sec');
      if (b) this._jumpSec(this.sections[+b.dataset.b]);
    });
    this._on(this.root.querySelector('.lt-secbtn'), 'click', () => { this._sfx('click'); this.root.classList.toggle('is-secs'); });
    this._on(this.$go, 'click', () => this._research());
    this._on(this.$rush, 'click', (e) => {
      const r = e.target.closest('[data-rush]');
      if (r && this.sel) this._rush(this.sel.id, r.dataset.rush, r);
    });
    this._on(this.root.querySelector('.lt-close'), 'click', () => this._close());
    this._on(this.root.querySelector('.lt-det-x'), 'click', () => { this._sfx('click'); if (this._compact) this._openSheet(false); else this._close(); });
    this._on(this.$det, 'click', (e) => {
      const j = e.target.closest('[data-goto]');
      if (j) { const N = this.byId.get(j.dataset.goto); if (N) this._select(N, { pan: true, sound: 'select', open: true }); return; }
      const sc = e.target.closest('[data-sec]');
      if (sc) this._selectSection(this.sections[+sc.dataset.sec], { pan: false, sound: true, open: true });
    });
    this._on(this.$slots, 'click', (e) => {
      const r = e.target.closest('[data-rush]');
      if (r) { this._rush(r.dataset.id, r.dataset.rush, r); return; }
      const s = e.target.closest('[data-goto]');
      if (!s) return;
      const N = this.byId.get(s.dataset.goto);
      if (N) this._select(N, { pan: true, sound: 'select', open: true });
    });
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this.root);
      this._ro.observe(this.view);
    } else this._on(window, 'resize', () => this._resize());
  }

  _viewXY(cx, cy) {
    const r = this._vr || (this._vr = this.view.getBoundingClientRect());
    return [cx - r.left, cy - r.top];
  }
  _toWorld(sx, sy) { return [(sx - this.cam.x) / this.cam.z, (sy - this.cam.y) / this.cam.z]; }
  /** world -> css px inside the view */
  toScreen(wx, wy) { return [wx * this.cam.z + this.cam.x, wy * this.cam.z + this.cam.y]; }

  _hitAt(cx, cy, pad = 4) {
    const [sx, sy] = this._viewXY(cx, cy);
    const [wx, wy] = this._toWorld(sx, sy);
    return this.L.hit(wx, wy, pad / this.cam.z);
  }
  _tagAt(cx, cy) {
    if (this.cam.z < 0.56) return null;
    const [sx, sy] = this._viewXY(cx, cy);
    const [wx, wy] = this._toWorld(sx, sy);
    const S = this.L.sectionAt(wy + 20);
    if (!S) return null;
    for (const N of S.nodes) for (const T of N.tags || []) if (wx >= T.x && wx <= T.x + T.w && wy >= T.y - 2 && wy <= T.y + T.h + 2) return T;
    return null;
  }
  _headAt(cx, cy) {
    const [sx, sy] = this._viewXY(cx, cy);
    const [, wy] = this._toWorld(sx, sy);
    const S = this.L.sectionAt(wy);
    if (!S) return null;
    return wy < S.y0 + this.L.G.HEAD + 6 || S.sealed ? S : null;
  }

  _setHover(N, T) {
    if (N === this.hover && T === this.hoverTag) return;
    this.hover = N;
    this.hoverTag = T;
    this._dirty = true;
    this.view.classList.toggle('is-point', !!(N || T));
    if (N && N.st !== 'sealed') {
      const t = now();
      if (!this._hoverT || t - this._hoverT > 90) { this._hoverT = t; this._sfx('hover'); }
    }
  }

  _onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.lt-zoom, button')) return;
    this._vr = this.view.getBoundingClientRect();
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this._vel = null;
    this.goal = null;
    if (this._ptrs.size === 1) {
      this._drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false, hist: [[e.clientX, e.clientY, now()]], type: e.pointerType };
    } else if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()];
      const [mx, my] = this._viewXY((a.x + b.x) / 2, (a.y + b.y) / 2);
      this._pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx, my, cam: { ...this.cam } };
      if (this._drag) this._drag.moved = true;
    }
  }

  _onMove(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && this.view.contains(e.target) && !e.target.closest('button')) {
        this._vr = this.view.getBoundingClientRect();
        const T = this._tagAt(e.clientX, e.clientY);
        const N = T ? null : this._hitAt(e.clientX, e.clientY, 0);
        this._setHover(N, T);
      }
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (this._pinch && this._ptrs.size >= 2) {
      const [a, b] = [...this._ptrs.values()];
      const P = this._pinch;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const [mx, my] = this._viewXY((a.x + b.x) / 2, (a.y + b.y) / 2);
      const z = clamp(P.cam.z * (d / P.d0), this._minZ(), MAXZ);
      const wx = (P.mx - P.cam.x) / P.cam.z, wy = (P.my - P.cam.y) / P.cam.z;
      this.cam.z = z;
      this.cam.x = mx - wx * z;
      this.cam.y = my - wy * z;
      this._camMoved();
      return;
    }
    const d = this._drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && dx * dx + dy * dy > (d.type === 'mouse' ? 25 : 81)) {
      d.moved = true;
      this.root.classList.add('is-dragging');
      try { this.view.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (d.moved) {
      this.cam.x = d.cx + dx;
      this.cam.y = d.cy + dy;
      this._camMoved();
      const t = now();
      d.hist.push([e.clientX, e.clientY, t]);
      while (d.hist.length > 2 && t - d.hist[0][2] > 100) d.hist.shift();
    }
  }

  _onUp(e, cancel = false) {
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
    this._drag = null;
    this.root.classList.remove('is-dragging');
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
      return;
    }
    if (cancel) return;
    this._tap(e.clientX, e.clientY);
  }

  _tap(cx, cy) {
    if (this.fox?.hitTest?.(cx, cy)) { this.fox.poke(); return; }
    const T = this._tagAt(cx, cy);
    if (T) { const P = this.byId.get(T.id); if (P) { this._select(P, { pan: true, sound: 'select', open: true }); return; } }
    const N = this._hitAt(cx, cy, this._compact ? 10 : 4);
    if (N) {
      if (N === this.sel && this._compact && !this._sheetOpen) { this._openSheet(true); return; }
      this._select(N, { pan: true, sound: 'select', open: true });
      return;
    }
    const S = this._headAt(cx, cy);
    if (S && S.sealed) { this._selectSection(S, { pan: false, sound: true, open: true }); return; }
    if (this._compact && this._sheetOpen) this._openSheet(false);
  }

  _onWheel(e) {
    e.preventDefault();
    this._vel = null;
    this.goal = null;
    this._vr = this.view.getBoundingClientRect();
    const [sx, sy] = this._viewXY(e.clientX, e.clientY);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    // trackpad pinch arrives as ctrl+wheel; a mouse wheel has no deltaX
    const zoom = e.ctrlKey || (Math.abs(dx) < 0.5 && (e.deltaMode !== 0 || Math.abs(dy) >= 40 || (Number.isInteger(dy) && Math.abs(dy) >= 4 && !e.shiftKey)));
    if (zoom) this._zoomAt(sx, sy, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
    else {
      this.cam.x -= e.shiftKey && !dx ? dy : dx;
      this.cam.y -= e.shiftKey && !dx ? 0 : dy;
      this._camMoved();
    }
  }

  _zoomAt(sx, sy, f) {
    const z0 = this.cam.z, z = clamp(z0 * f, this._minZ(), MAXZ);
    if (z === z0) return;
    this.cam.x = sx - (sx - this.cam.x) * (z / z0);
    this.cam.y = sy - (sy - this.cam.y) * (z / z0);
    this.cam.z = z;
    this._camMoved();
  }

  _zoomBy(f) {
    const vw = this.view.clientWidth, vh = this._visH();
    const c = this.goal || this.cam;
    const z = clamp(c.z * f, this._minZ(), MAXZ);
    const wx = (vw / 2 - c.x) / c.z, wy = (vh / 2 - c.y) / c.z;
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
      if (t && t.tagName === 'BUTTON' && this.root.contains(t) && t !== this.$go) handled = false;
      else this._research();
    } else if (k === 'Escape') {
      if (this.root.classList.contains('is-secs')) this.root.classList.remove('is-secs');
      else if (this._compact && this._sheetOpen) { this._openSheet(false); this._sfx('click'); } else this._close();
    } else if (k === '+' || k === '=') this._zoomBy(1.3);
    else if (k === '-' || k === '_') this._zoomBy(1 / 1.3);
    else if (k === '0') this._fitAll();
    else if (k === 'f' || k === 'F') { if (this.sel) this._centerOn(this.sel); }
    else if (k === 'PageDown' || k === 'PageUp') { const i = (this._here?.i ?? 0) + (k === 'PageDown' ? 1 : -1); this._jumpSec(this.sections[clamp(i, 0, this.sections.length - 1)]); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  _close() {
    this._sfx('click');
    try { this.o.onClose?.(); } catch (err) { console.error(err); }
  }

  // spatial keyboard navigation
  _move(dx, dy) {
    const cur = this.sel || this.selSec?.nodes[0];
    if (!cur) { const f = this._initialNode(); if (f) this._select(f, { pan: true, sound: 'select' }); return; }
    const G = this.L.G;
    let best = null, bs = Infinity;
    for (const N of this.nodes) {
      if (N === cur) continue;
      const ax = (N.cx - cur.cx) / G.CW, ay = (N.cy - cur.cy) / G.RH;
      const along = ax * dx + ay * dy;
      if (along <= 0.01) continue;
      const perp = Math.abs(ax * dy - ay * dx);
      const s = along + perp * 2.2;
      if (s < bs) { bs = s; best = N; }
    }
    if (best) this._select(best, { pan: true, sound: 'select', open: false });
  }

  _initialNode() {
    const run = this._jobs.find((j) => j.n)?.n;
    if (run) return run;
    const g = Guide.bestNext(this);
    if (g) return g;
    return this.nodes.find((N) => N.st === 'zone') || this.nodes.find((N) => N.st === 'done') || this.nodes[0] || null;
  }

  // ------------------------------------------------------------ camera
  _resize() {
    if (!this._alive) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const compact = w < 760 || (w < 980 && h > w * 1.1);
    if (compact !== this._compact) {
      this._compact = compact;
      this.root.classList.toggle('is-compact', compact);
      if (!compact) this._openSheet(false, true);
    }
    this.root.classList.toggle('is-short', h < 620);
    const vw = this.view.clientWidth, vh = this.view.clientHeight;
    this._vr = null;
    if (vw && vh) this.view3.setSize(vw, vh, Math.min(3, window.devicePixelRatio || 1));
    this._clampCam(this.cam);
    this._camMoved();
  }

  // zoom-out limit: the whole map width (never below 0.18)
  _minZ() {
    const vw = this.view.clientWidth || 800;
    return clamp((vw - 30) / this.L.W, 0.18, 0.5);
  }

  _visH() {
    const v = this.view;
    if (this._compact && this._sheetOpen) return Math.max(140, v.clientHeight - this.$det.offsetHeight);
    return v.clientHeight;
  }

  _clampCam(c) {
    const vw = this.view.clientWidth || 800, vh = this.view.clientHeight || 500;
    const sheet = this._compact && this._sheetOpen ? this.$det.offsetHeight : 0;
    const m = Math.min(60, vw * 0.2), mh = Math.min(60, vh * 0.2);
    const mt = Math.min(150, vh * 0.3); // room above the first section for the fox's head
    const ww = this.L.W * c.z, wh = this.L.H * c.z;
    c.x = ww + 2 * m < vw ? clamp(c.x, m, vw - ww - m) : clamp(c.x, vw - ww - m, m);
    c.y = wh + mt + mh < vh - sheet ? clamp(c.y, mt, vh - sheet - wh - mh) : clamp(c.y, vh - sheet - wh - mh, mt);
    return c;
  }

  _camMoved() {
    this._clampCam(this.cam);
    const c = this.cam;
    this.$anchors.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
    this._dirty = true;
    this._hereSec();
  }

  _goTo(g) {
    this.goal = this._clampCam({ ...g });
    this._vel = null;
    if (REDUCED) { Object.assign(this.cam, this.goal); this.goal = null; this._camMoved(); }
  }

  _fitAll() {
    const vw = this.view.clientWidth;
    const z = this._minZ();
    const c = this.goal || this.cam;
    const vh = this._visH();
    const wy = (vh / 2 - c.y) / c.z;
    this._goTo({ z, x: (vw - this.L.W * z) / 2, y: vh / 2 - wy * z });
  }

  _baseZoom() {
    const vw = this.view.clientWidth;
    return vw < 520 ? 0.8 : 1;
  }

  _centerOn(N, instant = false) {
    if (!N) return;
    const z = instant ? this._baseZoom() : Math.max(this.cam.z, 0.8);
    const vw = this.view.clientWidth, vh = this._visH();
    // a little left of centre (the fox + his speech line stand to the right); keep the
    // map's left edge (section titles, first column) in view when the node allows it
    let x = vw * 0.45 - N.cx * z;
    if ((N.x + N.w) * z + 20 < vw * 0.8) x = Math.max(x, 12);
    const g = { z, x, y: vh * 0.55 - N.cy * z };
    if (instant) { Object.assign(this.cam, this._clampCam(g)); this._camMoved(); } else this._goTo(g);
  }

  _ensureVisible(N) {
    const c = this.goal || this.cam;
    const vw = this.view.clientWidth, vh = this._visH();
    let z = c.z;
    if (z < 0.6) { this._centerOn(N); return; }
    const sx0 = N.x * z + c.x, sx1 = (N.x + N.w) * z + c.x, sy0 = (N.y - 120) * z + c.y, sy1 = (N.y + N.h) * z + c.y;
    const mx = Math.min(80, vw / 5), my = Math.min(40, vh / 6);
    let x = c.x, y = c.y;
    if (sx0 < mx) x += mx - sx0; else if (sx1 > vw - mx) x -= Math.min(sx0 - mx, sx1 - (vw - mx));
    if (sy0 < my) y += my - sy0; else if (sy1 > vh - my) y -= sy1 - (vh - my);
    if (x !== c.x || y !== c.y) this._goTo({ x, y, z });
  }

  _openSheet(open, silent) {
    if (!this._compact) open = false;
    if (this._sheetOpen === open) return;
    this._sheetOpen = open;
    this.root.classList.toggle('is-sheet', open);
    if (open && !silent) this._later(() => { if (this.sel) this._ensureVisible(this.sel); }, 240);
  }

  // ------------------------------------------------------------ selection / detail
  _select(N, { pan = true, sound = false, open = false } = {}) {
    if (!N) return;
    const wasSec = !!this.selSec;
    this.selSec = null;
    const same = N === this.sel && !wasSec;
    this.sel = N;
    this._dirty = true;
    if (sound) this._sfx(sound === true ? 'select' : sound);
    if (open) this._openSheet(true);
    if (!same) {
      this._renderDetail();
      this._fxEl(this.$det, 'is-swap', 220);
    }
    if (pan) this._ensureVisible(N);
    if (sound || open) this.fox?.onSelect?.(N);
  }

  // a locked section: the detail panel shows its key
  _selectSection(S, { pan = true, sound = false, open = false } = {}) {
    if (!S) return;
    const same = this.selSec === S;
    this.sel = null;
    this.selSec = S;
    this._dirty = true;
    if (sound) this._sfx('sector');
    if (open) this._openSheet(true);
    if (!same) { this._renderDetail(); this._fxEl(this.$det, 'is-swap', 220); }
    if (pan) this._jumpSec(S);
    this.fox?.onSection?.(S);
  }

  _keySig(S) {
    const k = this.secKey(S);
    return JSON.stringify([k.needs?.map((x) => x.ok), k.canUnlock, k.coins, S.sealed]);
  }

  _renderDetail() {
    if (this.selSec) { this._renderSecDetail(this.selSec); return; }
    const N = this.sel;
    if (!N) return;
    const st = N.st;
    const d = N.d;
    this.$det.dataset.state = st;
    this.$detK.textContent = `${String(N.S.i + 1).padStart(2, '0')} ${N.S.b.name}`.toUpperCase() + (d.tier != null ? `  /  TIER ${d.tier}` : '');
    this.$name.textContent = d.name || N.id;
    this.$pvSt.textContent = STATE_TEXT[st] || '';
    this.$pvSt.className = `lt-pv-st st-${st}`;
    let sub = '';
    if (d.species) { const sp = SPECIES_DATA.SPECIES_BY_ID?.[d.species]; if (sp?.latin) sub = ` <i class="lt-latin">${esc(sp.latin)}</i>`; }
    this.$desc.innerHTML = esc(d.desc || '') + sub;
    this.$hUnl.textContent = 'UNLOCKS';
    this.$hTime.textContent = 'TIME';
    this.$hReq.textContent = 'NEEDS';
    this.$blkUnl.hidden = false;
    this.$blkTime.hidden = false;
    const items = this.unlocks(d);
    this.$unl.innerHTML = items.length
      ? items.map((it) => `<li class="${it.fish ? 'is-fish' : ''}"><span class="lt-art">${it.art}</span><span class="lt-unl-t"><b>${esc(it.name)}</b><small>${esc(it.kind)}</small></span></li>`).join('')
      : '<li class="is-none"><span class="lt-unl-t"><b>Know-how</b><small>opens the next projects</small></span></li>';
    if (this._timed() && d.time) {
      const sp = this._speed();
      this.$time.innerHTML = `${glyphHTML('clock', '#52e47e', 2)}<b>${fmtDur(d.time / sp)}</b><span class="lt-free">FREE</span>${sp !== 1 ? `<span class="lt-spd">speed x${sp.toFixed(2).replace(/\.?0+$/, '')}</span>` : ''}`;
    } else this.$time.innerHTML = '<b>Instant</b><span class="lt-free">FREE</span>';
    let reqs = '';
    for (const r of N.req) {
      const P = this.byId.get(r);
      const ok = this._isRes(r);
      const run = this._jobIds.has(r);
      const other = P && P.S !== N.S ? ` <small>(${esc(P.S.b.name)})</small>` : '';
      reqs += `<li class="${ok ? 'ok' : 'bad'}"${P ? ` data-goto="${esc(r)}" role="button" tabindex="0"` : ''}>${glyphHTML(ok ? 'check' : 'cross', ok ? '#52e47e' : '#2b7442', 2)}<span class="lt-art sm">${P ? this.icons.nodeHTML(P.d, 20, ok ? 'on' : 'dim') : ''}</span><span>${esc(P?.d.name || human(r))}${other}${run ? ' <em>(researching)</em>' : ''}</span></li>`;
    }
    if (d.zone) {
      const ok = this._zoneOpen(d.zone);
      reqs += `<li class="${ok ? 'ok' : 'bad'} is-zone">${glyphHTML(ok ? 'check' : 'cross', ok ? '#52e47e' : '#ffc04a', 2)}<span class="lt-art sm">${glyphHTML('paw', ok ? '#52e47e' : '#ffc04a', 2)}</span><span>Meet ${esc(this.zoneName(d.zone))}${ok ? '' : ' <em>(explore the forest)</em>'}</span></li>`;
    }
    if (st === 'sealed') {
      reqs += `<li class="bad" data-sec="${N.S.i}" role="button" tabindex="0">${glyphHTML('lock', '#2b7442', 2)}<span>Unlock the ${esc(N.S.b.name)} section</span></li>`;
    }
    this.$reqs.innerHTML = reqs || `<li class="ok">${glyphHTML('check', '#52e47e', 2)}<span>Nothing. Go for it!</span></li>`;
    const kids = N.kids;
    this.$blkKids.hidden = !kids.length;
    if (kids.length) this.$kids.innerHTML = kids.map((K) => `<button type="button" class="lt-kid st-${K.st}" data-goto="${esc(K.id)}"><span class="lt-art sm">${this.icons.nodeHTML(K.d, 18, K.st === 'done' ? 'done' : K.st === 'avail' || K.st === 'run' ? 'on' : 'dim')}</span>${esc(K.d.name)}</button>`).join('');
    this._pvT = -1;
    this._renderAct();
  }

  _renderSecDetail(S) {
    const k = this.secKey(S);
    this._secSig = this._keySig(S);
    this.$det.dataset.state = 'sealed';
    this.$detK.textContent = `${String(S.i + 1).padStart(2, '0')} ${S.b.name}`.toUpperCase() + '  /  LOCKED';
    this.$name.textContent = S.b.name;
    this.$pvSt.textContent = 'SECTION LOCKED';
    this.$pvSt.className = 'lt-pv-st st-sealed';
    let fish = 0, builds = 0, ups = 0;
    for (const N of S.nodes) { if (N.d.species) fish++; else if (N.d.build) builds++; else if (N.d.mods) ups++; }
    this.$desc.innerHTML = `<b>${S.nodes.length}</b> projects are locked in this section. Use its <b>section key</b> to open it.`;
    this.$hUnl.textContent = 'INSIDE';
    this.$hTime.textContent = 'PRICE';
    this.$hReq.textContent = 'SECTION KEY';
    const row = (icon, num, what) => (num ? `<li><span class="lt-art">${this.icons.iconHTML(icon, 26, 'dim')}</span><span class="lt-unl-t"><b>${num} ${esc(what)}</b></span></li>` : '');
    this.$unl.innerHTML = row('fish', fish, 'fish species') + row('hammer', builds, builds === 1 ? 'thing to build' : 'things to build') + row('bolt', ups, ups === 1 ? 'upgrade' : 'upgrades') || '<li class="is-none"><span class="lt-unl-t"><b>Secrets</b></span></li>';
    this.$time.innerHTML = k.coins ? `${glyphHTML('coin', '#ffc04a', 2)}<b class="lt-amb">${k.coins}</b><span>coins, once</span>` : '<b>FREE</b><span class="lt-free">KEY ONLY</span>';
    let reqs = '';
    for (const x of k.needs || []) {
      const go = x.kind === 'node' && this.byId.has(x.id) ? ` data-goto="${esc(x.id)}" role="button" tabindex="0"` : '';
      const art = x.kind === 'node' && this.byId.get(x.id) ? this.icons.nodeHTML(this.byId.get(x.id).d, 20, x.ok ? 'on' : 'dim') : x.kind === 'zone' ? glyphHTML('paw', x.ok ? '#52e47e' : '#ffc04a', 2) : glyphHTML('coin', '#ffc04a', 2);
      reqs += `<li class="${x.ok ? 'ok' : 'bad'}"${go}>${glyphHTML(x.ok ? 'check' : 'cross', x.ok ? '#52e47e' : '#2b7442', 2)}<span class="lt-art sm">${art}</span><span>${esc(x.text)}</span></li>`;
    }
    this.$reqs.innerHTML = reqs || `<li class="ok">${glyphHTML('check', '#52e47e', 2)}<span>No key needed!</span></li>`;
    this.$blkKids.hidden = true;
    this._pvT = -1;
    this._renderAct();
  }

  _renderAct() {
    const b = this.$go;
    if (this.selSec) {
      const S = this.selSec;
      const k = this.secKey(S);
      b.className = 'lt-go is-dec';
      this.$goFill.style.width = '0%';
      this.$rush.hidden = true;
      b.disabled = !k.canUnlock;
      const miss = (k.needs || []).find((x) => x.kind !== 'coins' && !x.ok);
      if (k.canUnlock) {
        b.classList.add('is-go');
        this.$goL.textContent = 'UNLOCK SECTION';
        this.$goS.textContent = k.coins ? `pay ${k.coins} coins` : 'free!';
      } else {
        b.classList.add('is-no');
        this.$goL.textContent = 'LOCKED';
        this.$goS.textContent = miss ? `key: ${miss.text}` : `needs ${k.coins} coins`;
      }
      return;
    }
    const N = this.sel;
    if (!N) return;
    const st = N.st;
    b.className = 'lt-go';
    this.$goFill.style.width = '0%';
    this.$rush.hidden = !(st === 'run' && this._rushOK());
    if (st === 'done') {
      b.disabled = true;
      b.classList.add('is-done');
      this.$goL.textContent = 'RESEARCHED';
      this.$goS.textContent = 'already in your toolbox';
      return;
    }
    if (st === 'run') {
      b.disabled = true;
      b.classList.add('is-run');
      this._liveAct();
      return;
    }
    if (st === 'sealed') {
      b.disabled = false;
      b.classList.add('is-no', 'is-seal');
      this.$goL.textContent = 'SECTION LOCKED';
      this.$goS.textContent = 'tap to see its key';
      return;
    }
    const chk = this._check(N);
    b.disabled = !chk.ok;
    if (chk.ok) {
      b.classList.add('is-go');
      this.$goL.textContent = 'RESEARCH';
      this.$goS.textContent = this._timed() && N.d.time ? `free, takes ${fmtDur(this.time(N))}` : 'free, instant';
      return;
    }
    b.classList.add('is-no');
    const busy = /bench busy/i.test(chk.reason || '');
    if (busy) b.classList.add('is-busy');
    this.$goL.textContent = busy ? 'BENCH BUSY' : 'NOT YET';
    this.$goS.textContent = busy ? this._busyText() : String(chk.reason || '');
  }

  _busyText() {
    if (!this._jobs.length) return 'lab bench busy';
    const j = this._jobs.reduce((a, b) => (b.left < a.left ? b : a));
    return `free in ${fmtClock(j.left)} (${j.n?.d.name || 'research'})`;
  }

  _liveAct() {
    const N = this.sel;
    if (!N || this.selSec) return;
    if (N.st === 'run') {
      const j = this.job(N);
      const k = j ? j.k : 0;
      const w = `${(k * 100).toFixed(1)}%`;
      if (this.$goFill.style.width !== w) this.$goFill.style.width = w;
      const l = `RESEARCHING ${Math.floor(k * 100)}%`, s = `${fmtClock(j ? j.left : N.d.time)} left`;
      if (this.$goL.textContent !== l) this.$goL.textContent = l;
      if (this.$goS.textContent !== s) this.$goS.textContent = s;
      if (!this.$rush.hidden) this._livePrices(this.$rushB, N.id);
    } else if (this.$go.classList.contains('is-busy')) {
      const s = this._busyText();
      if (this.$goS.textContent !== s) this.$goS.textContent = s;
    }
  }

  // rush buttons: live price + "can't afford"
  _livePrices(list, id) {
    const coins = this.coins();
    for (const r of list) {
      const p = this.rushPrice(id, r.mode);
      const txt = p == null ? '-' : String(p);
      if (r.p.textContent !== txt) r.p.textContent = txt;
      const poor = p == null || (coins != null && coins < p);
      if (r.poor !== poor) { r.poor = poor; r.el.classList.toggle('is-poor', poor); }
    }
  }

  // the preview window: the unlock's art, big, in phosphor green (fish swim)
  _drawPreview(t) {
    const cv = this.pcv, ctx = this.pctx;
    const W = cv.width, H = cv.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#020904';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0a2312';
    for (let x = 4; x < W; x += 8) for (let y = 4; y < H; y += 8) ctx.fillRect(x, y, 1, 1);
    if (this.selSec) {
      const art = this.icons.icon('lock', 'dim');
      if (art) { const s = Math.max(1, Math.floor((H * 0.7) / art.height)); ctx.drawImage(art, Math.round(W / 2 - (art.width * s) / 2), Math.round(H / 2 - (art.height * s) / 2), art.width * s, art.height * s); }
      return;
    }
    const N = this.sel;
    if (!N) return;
    const st = N.st;
    const ramp = st === 'done' ? 'done' : st === 'avail' || st === 'run' ? 'on' : st === 'zone' ? 'mid' : 'dim';
    const live = ramp === 'on' || ramp === 'done';
    if (N.d.species) {
      const f = this.icons.fish(N.d.species, live ? Math.floor(t * 6) % 4 : 0, ramp) || this.icons.fish(N.d.species, 0, ramp);
      if (f) {
        const s = Math.max(1, Math.floor(Math.min((W * 0.5) / f.width, (H * 0.62) / f.height)));
        const w = f.width * s, h = f.height * s;
        const range = live ? Math.max(0, (W - w) / 2 - 8) : 0;
        const ph = t * 0.7;
        const cx = W / 2 + Math.sin(ph) * range;
        const right = !live || Math.cos(ph) >= 0;
        const y = Math.round(H / 2 - h / 2 + (live ? Math.round(Math.sin(t * 2.4)) : 0));
        ctx.save();
        if (!right) { ctx.translate(Math.round(cx + w / 2), 0); ctx.scale(-1, 1); ctx.drawImage(f, 0, y, w, h); } else ctx.drawImage(f, Math.round(cx - w / 2), y, w, h);
        ctx.restore();
        return;
      }
    }
    const art = this.icons.node(N.d, ramp);
    if (art) {
      const s = Math.max(1, Math.floor(Math.min((H * 0.72) / art.height, (W * 0.5) / art.width)));
      const bob = live ? Math.round(Math.sin(t * 2.2)) : 0;
      ctx.drawImage(art, Math.round(W / 2 - (art.width * s) / 2), Math.round(H / 2 - (art.height * s) / 2) + bob, art.width * s, art.height * s);
    }
  }

  // ------------------------------------------------------------ bench
  _renderBench() {
    if (!this.$slots) return;
    if (!this._timed()) { this.$slots.innerHTML = '<div class="lt-slotc is-info">Research finishes instantly</div>'; return; }
    const slots = Math.max(this.slots(), this._jobs.length);
    const sp = this._speed();
    if (this.$benchS) this.$benchS.textContent = `${this._jobs.length}/${this.slots()}${sp !== 1 ? `  x${sp.toFixed(2).replace(/\.?0+$/, '')}` : ''}`;
    const rush = this._rushOK();
    let h = '';
    for (let i = 0; i < slots; i++) {
      const j = this._jobs[i];
      if (j && j.n) {
        h += `<div class="lt-slotc is-job" data-job="${esc(j.id)}">
          <button type="button" class="lt-slotc-main" data-goto="${esc(j.id)}"><span class="lt-art">${this.icons.nodeHTML(j.n.d, 22)}</span><span class="lt-slotc-m"><b>${esc(j.n.d.name)}</b><span class="lt-bar"><i></i></span></span><span class="lt-slotc-t">0:00</span></button>
          ${rush ? `<span class="lt-slotc-r"><button type="button" class="lt-mini" data-rush="half" data-id="${esc(j.id)}" title="Rush: -50% time left">${glyphHTML('rush', '#ffc04a', 2)}<b></b></button><button type="button" class="lt-mini" data-rush="now" data-id="${esc(j.id)}" title="Finish now">${glyphHTML('ff', '#ffc04a', 2)}<b></b></button></span>` : ''}
        </div>`;
      } else if (j) {
        h += `<div class="lt-slotc is-job" data-job="${esc(j.id)}"><span class="lt-slotc-m"><b>${esc(j.id)}</b><span class="lt-bar"><i></i></span></span><span class="lt-slotc-t">0:00</span></div>`;
      } else {
        const pick = Guide.bestNext(this);
        h += `<button type="button" class="lt-slotc is-empty"${pick ? ` data-goto="${esc(pick.id)}"` : ''}><span class="lt-plus">${glyphHTML('plus', '#2b7442', 2)}</span><span class="lt-slotc-m"><b>Bench ${i + 1}: free</b><small>${pick ? `try ${esc(pick.d.name)}` : 'nothing ready yet'}</small></span></button>`;
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
      const j = this._jobs.find((x) => x.id === s.id);
      if (!j) continue;
      const w = `${(j.k * 100).toFixed(1)}%`;
      if (s._w !== w) { s._w = w; s.bar.style.width = w; }
      const txt = fmtClock(j.left);
      if (s.t.textContent !== txt) s.t.textContent = txt;
      if (s.rush.length) this._livePrices(s.rush, s.id);
    }
  }

  // ------------------------------------------------------------ actions
  _research() {
    if (this.selSec) { this._unlockSec(this.selSec, this.$go); return; }
    const N = this.sel;
    if (!N) return;
    if (N.st === 'sealed') { this._selectSection(N.S, { pan: false, sound: true, open: true }); return; }
    const chk = this._check(N);
    if (!chk.ok) {
      this._sfx('error');
      this._fxEl(this.$go, 'is-shake', 380);
      if (N.st !== 'done' && N.st !== 'run') this.$goS.textContent = /bench busy/i.test(chk.reason || '') ? this._busyText() : String(chk.reason || '');
      this.fox?.onDenied?.(N, chk.reason);
      return;
    }
    let ok = false;
    try { ok = !!this.o.onResearch?.(N.id); } catch (err) { console.error(err); ok = false; }
    if (!this._alive) return;
    if (!ok) {
      this._sfx('error');
      this._fxEl(this.$go, 'is-shake', 380);
      this.$goS.textContent = 'could not start that research';
      return;
    }
    this._pollJobs(true);
    if (this._jobIds.has(N.id)) {
      this._sfx('start');
      this._burst(N, 10, ['#8ef5aa', '#52e47e']);
    }
    this.refresh();
    this._renderDetail();
  }

  _rush(id, mode, src) {
    const N = this.byId.get(id);
    if (!N || !this._rushOK()) return;
    let res = null;
    try { res = this.o.onRush(id, mode); } catch (err) { console.error(err); res = null; }
    if (!this._alive) return;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res || !res.ok) {
      this._sfx('denied');
      if (src) this._fxEl(src, 'is-shake', 380);
      this._toast(res?.msg || 'Not enough coins', 'bad');
      this.fox?.onDenied?.(N, res?.msg || 'coins');
      return;
    }
    this._sfx(mode === 'now' ? 'rushnow' : 'rush');
    this._burst(N, 14, ['#ffc04a', '#ffe6a8']);
    this._fxEl(this.$coins, 'is-spend', 500);
    this.fox?.onRush?.(N, mode);
    this._pollJobs(true);
    this.refresh();
    if (this.sel === N) this._renderDetail();
  }

  _unlockSec(S, src) {
    if (!S || !S.sealed) return;
    let res = null;
    try { res = this.o.sections?.unlock?.(S.id) ?? null; } catch (err) { console.error(err); res = null; }
    if (!this._alive) return;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res || !res.ok) {
      this._sfx('denied');
      if (src) this._fxEl(src, 'is-shake', 380);
      this._toast(res?.msg || 'Locked', 'bad');
      this.fox?.onSection?.(S, true);
      return;
    }
    this._sfx('decrypt');
    this._fxEl(this.$coins, 'is-spend', 500);
    this.refresh();
  }

  _decrypted(S) {
    this._toast(`${S.b.name.toUpperCase()} UNLOCKED: ${S.nodes.length} new projects`, 'good');
    for (const N of S.nodes.slice(0, 8)) this._burst(N, 4, ['#52e47e', '#d0ffd8']);
    this.fox?.onUnlock?.(S);
    this._renderSecs();
  }

  _celebrate(N, prev) {
    this._sfx('done');
    this._burst(N, 22, ['#d0ffd8', '#52e47e', '#ffc04a']);
    if (prev === 'run' || prev === 'avail') {
      const u = this.unlocks(N.d).map((x) => x.name);
      this._toast(`DONE: ${N.d.name}${u.length ? `  >  ${u.slice(0, 2).join(', ')}` : ''}`, 'good');
    }
    this.fox?.onDone?.(N);
    this._later(() => { if (N.kids.some((K) => K.st === 'avail')) this._sfx('unlock'); }, 450);
  }

  _burst(N, n, cols) {
    if (REDUCED) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
      this._fx.push({ x: N.x + Math.random() * N.w, y: N.y + Math.random() * N.h, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, t: 0, life: 0.6 + Math.random() * 0.6, c: cols[i % cols.length], s: 2 + (i % 3) });
    }
  }

  _toast(text, kind = '') {
    this._toastQ.push([text, kind]);
    if (this._toastOn) return;
    const next = () => {
      const m = this._toastQ.shift();
      if (!m || !this._alive) { this._toastOn = false; return; }
      this._toastOn = true;
      this.$toast.textContent = '> ' + m[0];
      this.$toast.className = `lt-toast is-on${m[1] ? ' is-' + m[1] : ''}`;
      this._later(() => { this.$toast.classList.remove('is-on'); this._later(next, 200); }, 2600);
    };
    next();
  }

  // ------------------------------------------------------------ loop
  _loop = (t) => {
    if (!this._alive) return;
    this._raf = requestAnimationFrame(this._loop);
    t = t || now();
    const dtms = Math.min(50, t - (this._lastFrame || t));
    this._lastFrame = t;
    const dt = dtms / 1000;
    this.clock = (this.clock || 0) + dt;
    // camera easing / fling
    if (this.goal) {
      const g = this.goal, k = 1 - Math.exp(-dtms / 85);
      this.cam.x += (g.x - this.cam.x) * k;
      this.cam.y += (g.y - this.cam.y) * k;
      this.cam.z += (g.z - this.cam.z) * k;
      if (Math.abs(g.x - this.cam.x) < 0.4 && Math.abs(g.y - this.cam.y) < 0.4 && Math.abs(g.z - this.cam.z) < 0.002) { Object.assign(this.cam, g); this.goal = null; }
      this._camMoved();
    } else if (this._vel && !this._drag) {
      this.cam.x += this._vel.x * dtms;
      this.cam.y += this._vel.y * dtms;
      const f = Math.pow(0.92, dtms / 16);
      this._vel.x *= f;
      this._vel.y *= f;
      if (Math.hypot(this._vel.x, this._vel.y) < 0.02) this._vel = null;
      this._camMoved();
    }
    // jobs: poll every frame (cheap), full state refresh on change / every 400ms
    const changed = this._pollJobs(false);
    if (changed || t - this._lastPoll > 400) { this._lastPoll = t; this.refresh(); }
    // live text ~8x a second
    if (t - (this._lastLive || 0) > 120) {
      this._lastLive = t;
      this._liveBench();
      this._liveAct();
      const coins = this.coins();
      if (coins !== this._lastCoins && this.$coinsV) {
        this.$coinsV.textContent = coins == null ? '-' : Math.floor(coins).toLocaleString('en-US');
        this._lastCoins = coins;
      }
      // a running job on screen: its progress strip + spinner move
      if (this._jobs.length) this._dirty = true;
    }
    // sparks
    if (this._fx.length) {
      for (const p of this._fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.97; }
      this._fx = this._fx.filter((p) => p.t < p.life);
      this._dirty = true;
    }
    if (this._dirty) this._draw();
    // preview window ~12 fps
    if (t - (this._pvLast || 0) > 80 || this._pvT === -1) {
      this._pvLast = t;
      this._pvT = 0;
      if (this.$det.offsetParent !== null) this._drawPreview(this.clock);
    }
    if (!this._foxTried && ++this._frames >= 2) {
      this._foxTried = true;
      const f0 = now();
      try { this.fox = new LabFox(this); } catch (err) { console.warn('LabFox failed', err); this.fox = null; }
      this._tm.fox = +(now() - f0).toFixed(1);
      this._tm.foxAt = +(now() - this._t0).toFixed(1);
    }
    try { this.fox?.update(dt); } catch (err) { console.warn('LabFox', err); try { this.fox?.destroy(); } catch { /* ignore */ } this.fox = null; }
  };

  _draw() {
    this._dirty = false;
    const t0 = now();
    this.view3.draw(this.cam, {
      sel: this.sel, selSec: this.selSec, hover: this.hover, hoverTag: this.hoverTag, t: this.clock || 0, fx: this._fx,
      secInfo: (S) => this._secInfo(S), job: (N) => this.job(N), isDone: (id) => this._isRes(id),
    });
    this.drawMs = now() - t0;
  }
}
