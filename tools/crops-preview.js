// Preview for src/art/extra/cropArt.js: every crop's four stages (seed,
// sprout, growing, ripe) read straight from CROPS[..].stages through the
// nature atlas, the berry bushes alongside for scale, the ready glint
// twinkling over the ripe stage, then a game-scale garden (x1 / x2).
//   ?scale=4  ?t=0.5 (freeze the clock)   window.__seek(t)
import { CROPS, CROP_STAGES } from '/src/data/crops.js';
import { EXTRA_SPRITES as CROP_SPRITES, CROP_ART } from '/src/art/extra/cropArt.js';
import { EXTRA_SPRITES as STAGE_SPRITES, PLANT_STAGES } from '/src/art/extra/plantStages.js';
const EXTRA_SPRITES = { ...CROP_SPRITES, ...STAGE_SPRITES };
import { buildNatureAtlas, natureCanvas } from '/src/art/natureArt.js';

const q = new URLSearchParams(location.search);
const S = +(q.get('scale') || 4);
const errs = [];
const atlas = buildNatureAtlas();
for (const [name, fn] of Object.entries(EXTRA_SPRITES)) {
  const fr = fn();
  if (!atlas.frames[name] || atlas.frames[name].length !== fr.length) errs.push('not in nature atlas: ' + name);
  for (const f of fr) for (let k = 3; k < f.data.length; k += 4) if (f.data[k] && f.data[k] !== 255) { errs.push(name + ' soft alpha'); break; }
}
for (const [id, st4] of Object.entries(PLANT_STAGES)) for (const st of st4) if (!atlas.frames[st]) errs.push(`${id}: stage sprite ${st} missing`);

const app = document.getElementById('app');
app.innerHTML = `<h1>Garden crops</h1><div class="sub">stages ${CROP_STAGES.join(' → ')} · ×${S} · from CROPS[..].stages via the nature atlas (atlas ${atlas.canvas.width}×${atlas.canvas.height}) · berry bushes below for comparison</div>` +
  (errs.length ? `<div class="errors">${errs.join('\n')}</div>` : '<div class="ok">all stage sprites found in the nature atlas</div>');

const glints = [];
const veg = Object.keys(CROP_ART);
const order = Object.keys(PLANT_STAGES);
for (const id of order) {
  const c = { item: CROPS[id]?.item || 'nature', stages: PLANT_STAGES[id] };
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<div class="name"><b>${id}</b><small>${c.item}</small></div>`;
  c.stages.forEach((st, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell' + (st === 'crop_seed_water' || st.startsWith('wildrice') ? ' water' : '');
    const cv = natureCanvas(st, 0, S);
    const f = atlas.frames[st][0];
    const box = document.createElement('canvas');
    box.width = Math.max(cv.width, 30 * S); box.height = cv.height + 10 * S;
    const x = box.getContext('2d');
    x.imageSmoothingEnabled = false;
    const ox = Math.round(box.width / 2 - f.ax * S), oy = box.height - cv.height;
    if (veg.includes(id) || CROPS[id] && !['wildrice', 'mushrooms'].includes(id)) { const bed = natureCanvas('crop_bed', 0, S); x.globalAlpha = 1; x.drawImage(bed, Math.round(box.width / 2 - bed.width / 2), box.height - Math.round(bed.height * 0.35), bed.width, Math.round(bed.height * 0.35)); }
    x.drawImage(cv, ox, oy);
    cell.appendChild(box);
    if (i === 3) glints.push({ box, base: cv, ox, oy, f });
    const l = document.createElement('div');
    l.className = 'lbl';
    l.textContent = `${CROP_STAGES[i]}: ${st} ${f.w}×${f.h}`;
    cell.appendChild(l);
    row.appendChild(cell);
  });
  app.appendChild(row);
}

const h2 = document.createElement('h2');
h2.textContent = 'game scale ×1 / ×2 (ripe beds in a row, seed → ripe for carrots)';
app.appendChild(h2);
const game = document.createElement('div');
game.className = 'game';
const g = document.createElement('canvas');
g.width = 900; g.height = 150;
game.appendChild(g);
app.appendChild(game);

const glintFr = atlas.frames.crop_ready_glint;
function drawGlint(x, cx, cy, t, k, s) {
  const i = Math.floor(t * 8 + k * 3) % 8; // 4 twinkle frames then a pause
  if (i > 3) return;
  const gf = glintFr[i];
  x.drawImage(natureCanvas('crop_ready_glint', i, s), Math.round(cx - gf.ax * s), Math.round(cy - gf.ay * s));
}
function draw(t) {
  glints.forEach((gl, k) => {
    const x = gl.box.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, gl.box.width, gl.box.height);
    x.drawImage(gl.base, gl.ox, gl.oy);
    if (CROP_ART[order[k]]) drawGlint(x, gl.ox + gl.f.ax * S + 7 * S, gl.oy + 4 * S, t, k, S);
  });
  const x = g.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#6a9a40';
  x.fillRect(0, 0, g.width, g.height);
  const rowAt = (names, s, y0) => names.forEach((n, i) => {
    const f = atlas.frames[n][0];
    const gx = 20 + i * 26 * s + 13 * s;
    x.drawImage(natureCanvas(n, 0, s), Math.round(gx - f.ax * s), Math.round(y0 - f.ay * s));
  });
  const ripe = [...veg.map((v) => `crop_${v}_ripe`), 'blueberry', 'strawberry', 'raspberry'];
  rowAt(ripe, 1, 50);
  rowAt([...PLANT_STAGES.carrot, ...PLANT_STAGES.raspberry, ...PLANT_STAGES.flowers.slice(1)], 2, 140);
}
window.__seek = (t) => draw(t);
const frozen = q.has('t') ? +q.get('t') : null;
if (frozen !== null) draw(frozen);
else { const loop = (ms) => { draw(ms / 1000); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
window.__cropsReady = { ok: !errs.length, errs };
