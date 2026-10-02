// Preview for src/art/extra/landAnimalArt.js: every land animal and tame
// bunny, each animation playing at its LAND_ANIMAL_ART fps (x4 by default),
// then the whole cast at game scale (x1) wandering on grass.
//   ?scale=4  ?only=cottontail,skunk  ?t=1.25 (freeze the clock, seconds)
// window.__seek(t) redraws every animation at time t (for screenshots).
import { EXTRA_SPRITES, LAND_ANIMAL_ART } from '/src/art/extra/landAnimalArt.js';
import { LAND_ANIMALS, TAME_BUNNIES } from '/src/data/landAnimals.js';
import { buildNatureAtlas } from '/src/art/natureArt.js';

const q = new URLSearchParams(location.search);
const S = +(q.get('scale') || 4);
const only = q.get('only') ? q.get('only').split(',') : null;
const ANIMS = ['idle', 'move', 'eat', 'look'];
const ids = [...LAND_ANIMALS.map((a) => a.id), ...TAME_BUNNIES.map((b) => 'bunny_' + b.id)].filter((id) => !only || only.includes(id));

// sanity: every animal in the data has art, frames match the metadata, the
// nature atlas holds every sprite, pixels are opaque or transparent
const errs = [];
let atlas = null;
try { atlas = buildNatureAtlas(); } catch (e) { errs.push('atlas: ' + e.message); }
const FR = {};
for (const id of ids) {
  const art = LAND_ANIMAL_ART[id];
  if (!art) { errs.push('no LAND_ANIMAL_ART for ' + id); continue; }
  for (const a of ANIMS) {
    const name = `${id}_${a}`;
    let fr = null;
    try { fr = EXTRA_SPRITES[name]?.(); } catch (e) { errs.push(name + ' threw ' + e.message); }
    if (!fr) { errs.push('missing ' + name); continue; }
    FR[name] = fr;
    if (fr.length !== art.anims[a]) errs.push(`${name}: ${fr.length} frames, metadata says ${art.anims[a]}`);
    for (const f of fr) {
      if (f.w !== fr[0].w || f.h !== fr[0].h) errs.push(name + ' frame size differs');
      for (let k = 3; k < f.data.length; k += 4) if (f.data[k] && f.data[k] !== 255) { errs.push(name + ' soft alpha'); break; }
    }
    if (atlas && atlas.frames[name]?.length !== fr.length) errs.push('not in nature atlas: ' + name);
  }
}

const app = document.getElementById('app');
app.innerHTML = `<h1>Land animals</h1><div class="sub">${ids.length} animals · ${ids.length * 4} sprites · ×${S} · each animation at its in-game fps · magenta tick = anchor</div>` +
  (errs.length ? `<div class="errors">${errs.join('\n')}</div>` : '<div class="ok">all sprites OK and registered in the nature atlas</div>');

function bitmap(f) {
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), 0, 0);
  return c;
}
const BM = new Map();
const bm = (f) => { let c = BM.get(f); if (!c) BM.set(f, (c = bitmap(f))); return c; };
const players = [];
for (const id of ids) {
  const art = LAND_ANIMAL_ART[id];
  if (!art) continue;
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="name"><b>${art.name}</b><small>${id} · ${art.gait}</small><div>${art.colors.map((c) => `<span class="sw" style="background:${c}"></span>`).join('')}</div></div>`;
  for (const a of ANIMS) {
    const fr = FR[`${id}_${a}`];
    if (!fr) continue;
    const cell = document.createElement('div');
    cell.className = 'cell';
    const cv = document.createElement('canvas');
    cv.width = fr[0].w * S; cv.height = (fr[0].h + 2) * S;
    cell.appendChild(cv);
    const l = document.createElement('div');
    l.className = 'lbl';
    l.textContent = `${a} ${fr.length}f @${art.fps[a]}fps ${fr[0].w}×${fr[0].h}`;
    cell.appendChild(l);
    row.appendChild(cell);
    players.push({ cv, fr, fps: art.fps[a] });
  }
  app.appendChild(row);
}

// game scale: the cast at x1 (and a x2 copy) on a grass strip
const h2 = document.createElement('h2');
h2.textContent = 'game scale ×1 / ×2';
app.appendChild(h2);
const game = document.createElement('div');
game.className = 'game';
const g1 = document.createElement('canvas'), g2 = document.createElement('canvas');
g1.width = 1100; g1.height = 60; g2.width = 1100; g2.height = 110;
g1.style.width = '1100px'; g2.style.width = '1100px';
game.append(g1, g2);
app.appendChild(game);

function drawGame(cv, s, t) {
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#6a9a40';
  x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#5e8c38';
  for (let i = 0; i < cv.width; i += 7) x.fillRect(i, (i * 13) % cv.height, 2, 1);
  let px = 10;
  const step = cv.width / ids.length;
  ids.forEach((id, k) => {
    const art = LAND_ANIMAL_ART[id];
    if (!art) return;
    const a = ANIMS[(Math.floor(t / 3) + k) % 4];
    const fr = FR[`${id}_${a}`];
    const f = fr[Math.floor(t * art.fps[a]) % fr.length];
    const gx = Math.round(px + step / 2), gy = cv.height - 8;
    x.drawImage(bm(f), Math.round(gx - f.ax * s), Math.round(gy - f.ay * s), f.w * s, f.h * s);
    px += step;
  });
}
function draw(t) {
  for (const p of players) {
    const f = p.fr[Math.floor(t * p.fps) % p.fr.length];
    const x = p.cv.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, p.cv.width, p.cv.height);
    x.drawImage(bm(f), 0, 0, f.w * S, f.h * S);
    x.fillStyle = '#ff00ff';
    x.fillRect(Math.round(f.ax * S) - 1, f.h * S + 2, 2, S);
  }
  drawGame(g1, 1, t);
  drawGame(g2, 2, t);
}
window.__seek = (t) => draw(t);
const frozen = q.has('t') ? +q.get('t') : null;
if (frozen !== null) draw(frozen);
else {
  const loop = (ms) => { draw(ms / 1000); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
window.__animalsReady = { ok: !errs.length, errs };
