// Preview for src/art/extra/birdArt.js (wild birds).
//   ?scale=6          pixel scale of the sheet (default 6)
//   ?only=robin,crow  limit to some bird ids
//   ?live=0           no animated column (static sheet, for screenshots)
//   ?bg=%23rrggbb     background colour
// Every bird gets one row: idle0 idle1 hop0 hop1 peck0 peck1 fly0..fly3, ground
// frames standing on a shared baseline, then the four animations playing at
// the rates Ambient.js uses (idle 1.5 fps, hop 2 frames, peck 5 fps, fly 12 fps).
import { BIRD_IDS, BIRD_ART, EXTRA_SPRITES } from '/src/art/extra/birdArt.js';
import { buildNatureAtlas } from '/src/art/natureArt.js';

const q = new URLSearchParams(location.search);
const S = +(q.get('scale') || 6);
const only = q.get('only') ? q.get('only').split(',').map((s) => s.trim()) : null;
const live = q.get('live') !== '0';
if (q.get('bg')) document.body.style.background = q.get('bg');
const ANIMS = ['idle', 'hop', 'peck', 'fly'];
const FPS = { idle: 1.5, hop: 4, peck: 5, fly: 12 };

const app = document.getElementById('app');
const ids = BIRD_IDS.filter((id) => !only || only.includes(id));

// --- sanity: the game's nature atlas must contain every sprite we export ----
const errs = [];
let atlas = null;
try { atlas = buildNatureAtlas(); } catch (e) { errs.push('atlas: ' + e.message); }
for (const id of BIRD_IDS) for (const a of ANIMS) {
  const name = `${id}_${a}`, fr = EXTRA_SPRITES[name]?.();
  if (!fr) { errs.push('missing ' + name); continue; }
  const af = atlas?.frames[name];
  if (atlas && (!af || af.length !== fr.length || af[0].w !== fr[0].w || af[0].h !== fr[0].h)) errs.push('not in nature atlas as built: ' + name);
}
const head = document.createElement('div');
head.innerHTML = `<h1>Wild birds</h1><div class="sub">${BIRD_IDS.length} species · ×${S} · ground frames on a shared baseline (feet on the anchor), fly frames centred` +
  (atlas ? ` · nature atlas ${atlas.canvas.width}×${atlas.canvas.height}` : '') + '</div>' +
  (errs.length ? `<div class="errors">${errs.join('\n')}</div>` : '<div class="ok">all sprites registered in the nature atlas</div>');
app.appendChild(head);

function toCanvas(f, scale) {
  const c = document.createElement('canvas');
  c.width = f.w * scale; c.height = f.h * scale;
  const t = document.createElement('canvas');
  t.width = f.w; t.height = f.h;
  t.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), 0, 0);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(t, 0, 0, c.width, c.height);
  return c;
}

const players = [];
for (const id of ids) {
  const art = BIRD_ART[id];
  const row = document.createElement('div');
  row.className = 'row';
  const nm = document.createElement('div');
  nm.className = 'name';
  nm.innerHTML = `<b>${art.name}</b><small>${id}</small><div>${art.colors.map((c) => `<span class="sw" style="background:${c}"></span>`).join('')}</div>`;
  row.appendChild(nm);
  const frames = Object.fromEntries(ANIMS.map((a) => [a, EXTRA_SPRITES[`${id}_${a}`]()]));
  const gh = Math.max(...['idle', 'hop', 'peck'].map((a) => frames[a][0].h));
  const fh = frames.fly[0].h;
  for (const a of ANIMS) frames[a].forEach((f, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const cv = toCanvas(f, S);
    // ground frames share a baseline; fly frames sit centred on the row
    cv.style.marginTop = `${(a === 'fly' ? (Math.max(gh, fh) - f.h) / 2 : gh - f.h) * S}px`;
    cell.appendChild(cv);
    const l = document.createElement('div');
    l.className = 'lbl';
    l.textContent = `${a}${i} ${f.w}×${f.h}`;
    cell.appendChild(l);
    row.appendChild(cell);
  });
  if (live) {
    const box = document.createElement('div');
    box.className = 'cell live';
    const cv = document.createElement('canvas');
    const W = Math.max(...ANIMS.map((a) => frames[a][0].w)), H = Math.max(gh, fh);
    cv.width = (W * 4 + 12) * S / 2; cv.height = H * S / 2;
    box.appendChild(cv);
    const l = document.createElement('div');
    l.className = 'lbl';
    l.textContent = 'live ×' + S / 2;
    box.appendChild(l);
    row.appendChild(box);
    players.push({ cv, frames, W, H });
  }
  app.appendChild(row);
}

// live column: each animation at its in-game rate, drawn at half scale
const cache = new Map();
const tc = (f) => { let c = cache.get(f); if (!c) cache.set(f, (c = toCanvas(f, 1))); return c; };
function tick(t) {
  const s = S / 2;
  for (const p of players) {
    const x = p.cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, p.cv.width, p.cv.height);
    ANIMS.forEach((a, k) => {
      const fr = p.frames[a], f = fr[Math.floor((t / 1000) * FPS[a]) % fr.length];
      const ox = k * (p.W + 4) * s + ((p.W - f.w) / 2) * s;
      const oy = a === 'fly' ? ((p.H - f.h) / 2) * s : (p.H - f.h) * s;
      x.drawImage(tc(f), ox, oy, f.w * s, f.h * s);
    });
  }
  requestAnimationFrame(tick);
}
if (players.length) requestAnimationFrame(tick);
window.__birdsReady = { ok: !errs.length, errs };
