// Preview for src/art/extra/bugArt.js: every bug, icon and bug farm, every
// frame side by side (x6 by default) plus an animated copy, a dusk panel for
// the glowing ones and farm vignettes at game-ish scale.
// URL flags: ?scale=6  ?only=bug_ladybug,farm_compost  ?section=bugs|icons|farms|dusk|scenes  ?frame=N (freeze)
import { EXTRA_SPRITES, BUG_ART } from '/src/art/extra/bugArt.js';
import { buildNatureAtlas } from '/src/art/natureArt.js';

const q = new URLSearchParams(location.search);
const SCALE = +(q.get('scale') || 6);
const only = q.get('only') ? q.get('only').split(',').map((s) => s.trim()) : null;
const section = q.get('section') || 'all';
const freeze = q.has('frame') ? +q.get('frame') : null;
const want = (s) => section === 'all' || section === s;

const app = document.getElementById('app');
const t0 = performance.now();
const ALL = {};
const errs = [];
for (const [name, fn] of Object.entries(EXTRA_SPRITES)) {
  try {
    ALL[name] = fn();
  } catch (e) {
    errs.push(`${name} threw: ${e.message}`);
  }
}
const t1 = performance.now();
// sanity checks: frame data, anchors, opaque-only alpha, shared frame size
for (const [name, fr] of Object.entries(ALL)) {
  if (!fr.length) errs.push('no frames: ' + name);
  fr.forEach((f, i) => {
    if (!(f.w > 0 && f.h > 0) || f.data.length !== f.w * f.h * 4) errs.push(`${name}[${i}] bad data`);
    if (!Number.isFinite(f.ax) || !Number.isFinite(f.ay)) errs.push(`${name}[${i}] bad anchor`);
    if (f.w !== fr[0].w || f.h !== fr[0].h) errs.push(`${name}[${i}] size differs`);
    for (let k = 3; k < f.data.length; k += 4) if (f.data[k] !== 0 && f.data[k] !== 255) { errs.push(`${name}[${i}] soft alpha`); break; }
  });
}
// every name must have made it into the shared nature atlas
const atlas = buildNatureAtlas();
for (const name of Object.keys(EXTRA_SPRITES)) if (!atlas.frames[name] || !atlas.frames[name].length) errs.push('not in nature atlas: ' + name);
const ids = Object.keys(BUG_ART);
for (const id of ids) for (const pre of ['bug_', 'bugicon_']) if (!ALL[pre + id]) errs.push('missing ' + pre + id);
const nFrames = Object.values(ALL).reduce((a, f) => a + f.length, 0);

app.innerHTML = `<h1>Bug sprites</h1>
<div class="sub">${Object.keys(ALL).length} sprites / ${nFrames} frames built in ${(t1 - t0).toFixed(0)} ms; ${ids.length} bugs; nature atlas ${atlas.canvas.width}x${atlas.canvas.height}; magenta cross = anchor</div>
<div class="${errs.length ? 'errors' : 'ok'}">${errs.length ? errs.join('\n') : 'all sprites OK'}</div>`;

// --- helpers -----------------------------------------------------------------
function frameCanvas(f) {
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const g = c.getContext('2d');
  g.putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), 0, 0);
  return c;
}
const CACHE = new Map();
const src = (name, i) => {
  const k = name + '|' + i;
  if (!CACHE.has(k)) CACHE.set(k, frameCanvas(ALL[name][i]));
  return CACHE.get(k);
};
function scaled(name, i, s, anchor = true) {
  const f = ALL[name][i];
  const c = document.createElement('canvas');
  c.width = f.w * s;
  c.height = f.h * s;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src(name, i), 0, 0, c.width, c.height);
  if (anchor) {
    g.fillStyle = '#ff00ff';
    const x = Math.round(f.ax * s), y = Math.round(f.ay * s);
    g.fillRect(x - 3, y - 1, 7, 1);
    g.fillRect(x - 1, y - 3, 1, 7);
  }
  return c;
}
const anims = [];
const FPS = (name) => (/^bug_/.test(name) ? (['firefly', 'mayfly', 'dragonfly', 'damselfly', 'junebug', 'mosquito', 'bumblebee', 'monarch', 'lunamoth'].includes(name.slice(4)) ? 10 : 5) : 2);
function cell(name, dusk = false) {
  const fr = ALL[name];
  const d = document.createElement('div');
  d.className = 'cell' + (dusk ? ' dusk' : '');
  const row = document.createElement('div');
  row.className = 'frames';
  fr.forEach((_, i) => row.appendChild(scaled(name, i, SCALE)));
  if (fr.length > 1) {
    const a = document.createElement('canvas');
    a.className = 'anim';
    a.width = fr[0].w * SCALE;
    a.height = fr[0].h * SCALE;
    anims.push({ c: a, name, fps: FPS(name) });
    row.appendChild(a);
  }
  d.appendChild(row);
  const id = name.replace(/^(bug|bugicon|farm)_/, '');
  const label = BUG_ART[id] ? BUG_ART[id].name : id;
  const f = fr[0];
  d.insertAdjacentHTML('beforeend', `<div class="lbl">${name}</div><div class="sz">${label} - ${f.w}x${f.h} x${fr.length} - ${f.ay === f.h ? 'ground' : 'centre'}</div>`);
  return d;
}
function sectionGrid(title, names, dusk = false) {
  names = names.filter((n) => !only || only.includes(n));
  if (!names.length) return;
  app.insertAdjacentHTML('beforeend', `<h2>${title} (${names.length})</h2>`);
  const g = document.createElement('div');
  g.className = 'grid';
  for (const n of names) g.appendChild(cell(n, dusk));
  app.appendChild(g);
}
const names = Object.keys(ALL);
if (want('bugs')) sectionGrid('Bugs - in world', names.filter((n) => n.startsWith('bug_')));
if (want('icons')) sectionGrid('Bug icons - UI', names.filter((n) => n.startsWith('bugicon_')));
if (want('farms')) sectionGrid('Bug farms', names.filter((n) => n.startsWith('farm_')));
if (want('dusk')) sectionGrid('At dusk (glowing bugs)', ['bug_firefly', 'bug_lunamoth', 'bugicon_firefly', 'bugicon_lunamoth', 'farm_glowmeadow'], true);

// --- farm vignettes: each farm with the bugs it grows, at x3 ------------------
const FARM_BUGS = {
  tallgrass: ['cricket', 'grasshopper', 'katydid'],
  compost: ['earthworm', 'mealworm', 'grub'],
  bogpool: ['mayfly', 'mosquito', 'damselfly', 'waterstrider'],
  rottinglog: ['stagbeetle', 'junebug', 'pillbug', 'rhinobeetle'],
  glowmeadow: ['firefly', 'lunamoth'],
  butterflybush: ['monarch', 'bumblebee', 'ladybug'],
};
const scenes = [];
if (want('scenes') && !only) {
  app.insertAdjacentHTML('beforeend', '<h2>Farms with their bugs (x3, 1 tile = 72px)</h2>');
  const S = 3, TILE = 24 * S;
  const c = document.createElement('canvas');
  c.className = 'scene';
  c.width = Object.keys(FARM_BUGS).length * TILE * 2.4 + TILE * 0.4;
  c.height = TILE * 2.6;
  app.appendChild(c);
  scenes.push({ c, S, TILE });
}
function drawScenes(T) {
  for (const { c, S, TILE } of scenes) {
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#5f8a3a';
    g.fillRect(0, 0, c.width, c.height);
    // tile grid
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = 0; x < c.width; x += TILE) g.fillRect(x, 0, 1, c.height);
    for (let y = 0; y < c.height; y += TILE) g.fillRect(0, y, c.width, 1);
    Object.entries(FARM_BUGS).forEach(([farm, bugs], k) => {
      const ox = TILE * 0.4 + k * TILE * 2.4, base = TILE * 1.7;
      const fname = 'farm_' + farm;
      if (!ALL[fname]) return;
      const fi = freeze ?? Math.floor(T * 1.5);
      const put = (name, x, y, i, flip = false) => {
        const fr = ALL[name];
        if (!fr) return;
        const f = fr[((i % fr.length) + fr.length) % fr.length];
        const idx = ((i % fr.length) + fr.length) % fr.length;
        g.save();
        g.translate(Math.round(x), 0);
        if (flip) g.scale(-1, 1);
        g.drawImage(src(name, idx), Math.round(-f.ax * S), Math.round(y - f.ay * S), f.w * S, f.h * S);
        g.restore();
      };
      put(fname, ox + TILE, base, fi);
      bugs.forEach((b, j) => {
        const name = 'bug_' + b;
        const fly = ALL[name] && ALL[name][0].ay !== ALL[name][0].h;
        const a = T * 0.6 + j * 2.1 + k;
        const x = ox + TILE + Math.cos(a) * TILE * 0.9;
        const y = fly ? base - TILE * 0.9 + Math.sin(a * 1.7) * TILE * 0.25 : base + TILE * 0.35 + (j % 2) * TILE * 0.18;
        const n = ALL[name] ? ALL[name].length : 1;
        // walkers only cycle their walk frames here (see the report on special frames)
        const walk = b === 'pillbug' || b === 'cricket' || b === 'grasshopper' ? 2 : n;
        put(name, x, y, freeze ?? Math.floor(T * (fly ? 10 : 5) + j) % walk, Math.sin(a) > 0);
      });
      g.fillStyle = '#f6f1df';
      g.font = '12px ui-monospace, monospace';
      g.fillText(farm, ox + 4, c.height - 6);
    });
  }
}

function tick(now) {
  const T = now / 1000;
  for (const a of anims) {
    const fr = ALL[a.name];
    const i = freeze ?? Math.floor(T * a.fps) % fr.length;
    const g = a.c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, a.c.width, a.c.height);
    g.drawImage(src(a.name, i % fr.length), 0, 0, a.c.width, a.c.height);
  }
  drawScenes(T);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
