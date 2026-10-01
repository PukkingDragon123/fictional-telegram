// Preview harness for src/ui/LabTree.js with a mock game.
// URL flags: ?coins=350 &done=none|some|lots|all|id,id &sel=r_id &custom=1 (custom preview hook)
//            &nodev=1 (hide dev panel) &open=1 (open the detail sheet on phones)
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import { RESEARCH, RESEARCH_BY_ID, BRANCHES } from '../src/data/research.js';
import { spriteImg } from '../src/ui/sprites.js';
import { LabTree } from '../src/ui/LabTree.js';

const P = new URLSearchParams(location.search);
const state = { coins: +(P.get('coins') ?? 350), done: new Set() };

const PRESETS = {
  none: [],
  some: ['r_pumpkinseed', 'r_goldfish', 'r_perch', 'r_food1', 'r_love1', 'r_duckweed', 'r_flowers', 'r_berries', 'r_price1', 'r_shovel', 'r_bag', 'r_beavers', 'r_dams', 'r_decor1'],
};
PRESETS.lots = [...PRESETS.some, 'r_smallmouth', 'r_bass', 'r_brook', 'r_rainbow', 'r_whitefish', 'r_growth', 'r_clutch', 'r_eggslot', 'r_genetics',
  'r_lilypad', 'r_bughotel', 'r_willow', 'r_bees', 'r_fences', 'r_platforms', 'r_feeder', 'r_garden', 'r_lights', 'r_chairs', 'r_tipjar', 'r_tags', 'r_walleye', 'r_laketrout'];
PRESETS.all = RESEARCH.map((r) => r.id);
function applyPreset(p) {
  state.done.clear();
  const ids = PRESETS[p] || String(p || '').split(',').filter(Boolean);
  for (const id of ids) if (RESEARCH_BY_ID[id]) state.done.add(id);
}
applyPreset(P.get('done') || 'some');

// --- sfx: log + optional tiny synth
let actx = null, soundOn = false;
const logEl = document.getElementById('log');
const counts = {};
function blip(name) {
  if (!soundOn) return;
  actx ||= new AudioContext();
  const t = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  const spec = { click: [900, 0.03, 'square'], hover: [1400, 0.015, 'square'], open: [300, 0.25, 'sawtooth'], error: [140, 0.2, 'square'], research: [660, 0.4, 'triangle'],
    type: [2200, 0.01, 'square'], beep: [1250, 0.06, 'square'], stamp: [90, 0.12, 'square'] }[name] || [500, 0.05, 'sine'];
  o.type = spec[2];
  o.frequency.setValueAtTime(spec[0], t);
  if (name === 'research') o.frequency.exponentialRampToValueAtTime(1320, t + 0.3);
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + spec[1]);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + spec[1] + 0.02);
}
function sfx(name) {
  counts[name] = (counts[name] || 0) + 1;
  logEl.textContent = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('\n');
  blip(name);
}

// optional custom preview (tests the hook): builds get a spinning blueprint
function customPreview(node, canvas, t) {
  if (!node.build) return false;
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  c.fillStyle = '#06224a';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#1a4a8a';
  for (let x = 0; x < W; x += 6) c.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 6) c.fillRect(0, y, W, 1);
  c.fillStyle = '#cfe8ff';
  const s = 18 + Math.sin(t * 2) * 6;
  c.fillRect(W / 2 - s, H / 2 - 2, s * 2, 4);
  c.fillRect(W / 2 - 2, H / 2 - s, 4, s * 2);
  return true;
}

let tree = null;
const wrap = document.getElementById('wrap');
const closed = document.getElementById('closed');

// ?art=1 : pixel-art sheet (slot frames + chains) at 8x
if (P.get('art')) {
  const { slotCanvas, chainsCanvas, SLOT_PALS } = LabTree._art;
  const Z = +(P.get('z') || 8);
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#06140b;display:flex;flex-wrap:wrap;gap:24px;padding:20px;align-content:flex-start;z-index:200';
  const big = (cv) => { const i = new Image(); i.src = cv.toDataURL(); i.width = cv.width * Z; i.height = cv.height * Z; i.style.imageRendering = 'pixelated'; return i; };
  const cell = (label, ...layers) => {
    const d = document.createElement('div');
    d.style.cssText = `position:relative;width:${28 * Z}px;height:${28 * Z + 18}px;color:#7dffa8;font:12px monospace`;
    layers.forEach((cv) => { const i = big(cv); i.style.position = 'absolute'; i.style.left = '0'; i.style.top = '0'; d.appendChild(i); });
    const t = document.createElement('div'); t.textContent = label; t.style.cssText = `position:absolute;top:${28 * Z + 2}px`; d.appendChild(t);
    sheet.appendChild(d);
  };
  for (const [k, p] of Object.entries(SLOT_PALS)) cell(k, slotCanvas(p));
  cell('iron + chains', slotCanvas(SLOT_PALS.iron), chainsCanvas());
  cell('chains', chainsCanvas());
  document.body.appendChild(sheet);
}

function open() {
  closed.style.display = 'none';
  tree = new LabTree(wrap, {
    research: RESEARCH,
    branches: BRANCHES,
    isResearched: (id) => state.done.has(id),
    coins: () => state.coins,
    canResearch: (id) => {
      const r = RESEARCH_BY_ID[id];
      if (!r) return { ok: false, reason: 'Unknown research' };
      if (state.done.has(id)) return { ok: false, reason: 'Already researched' };
      if (!r.req.every((q) => state.done.has(q))) return { ok: false, reason: 'Research the prerequisites first' };
      if (state.coins < r.cost) return { ok: false, reason: `Need ${r.cost - state.coins} more coins` };
      return { ok: true };
    },
    onResearch: (id) => {
      const r = RESEARCH_BY_ID[id];
      if (!r || state.done.has(id) || state.coins < r.cost || !r.req.every((q) => state.done.has(q))) return false;
      state.coins -= r.cost;
      state.done.add(id);
      return true;
    },
    icon: (name, scale) => spriteImg(name, scale),
    preview: P.get('custom') ? customPreview : undefined,
    sfx,
    onClose: () => { tree.destroy(); tree = null; closed.style.display = 'flex'; },
  });
  window.__lt = tree;
  if (P.get('sel')) tree.select(P.get('sel'));
  if (!P.get('open') && P.get('sel')) { /* select() opens the sheet on phones; keep it */ }
}
open();
window.__state = state;
window.__open = open;
// scripted actions for screenshots: ?act=research|keys:ArrowRight.ArrowDown|unlock &at=ms (relative to page load)
const act = P.get('act');
if (act) {
  setTimeout(() => {
    if (act === 'research') document.querySelector('.ltree-go')?.click();
    else if (act.startsWith('keys:')) for (const k of act.slice(5).split('.')) window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    else if (act === 'unlock') { state.done.add('r_growth'); tree.refresh(); }
  }, +(P.get('at') || 1500));
}
document.getElementById('reopen').onclick = open;

// --- dev panel
const dev = document.getElementById('dev');
if (P.get('nodev')) dev.style.display = 'none';
dev.querySelector('.t').onclick = () => dev.classList.toggle('min');
dev.addEventListener('click', (e) => {
  const a = e.target.dataset?.a;
  if (!a) return;
  if (a === 'coins+') state.coins += 500;
  if (a === 'coins-') state.coins = Math.max(0, state.coins - 500);
  if (a === 'coins0') state.coins = 0;
  if (a === 'reset') applyPreset('none');
  if (a === 'all') applyPreset('all');
  if (a === 'rnd') {
    const av = RESEARCH.filter((r) => !state.done.has(r.id) && r.req.every((q) => state.done.has(q)));
    if (av.length) state.done.add(av[(Math.random() * av.length) | 0].id);
  }
  if (a === 'sound') { soundOn = !soundOn; e.target.textContent = `sound: ${soundOn ? 'on' : 'off'}`; }
  if (a === 'sel') tree?.select('r_sturgeon');
  tree?.refresh();
});
