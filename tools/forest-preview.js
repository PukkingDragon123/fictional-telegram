// Preview for src/art/extra/forestArt.js (forest pickups, ruins, tomato and
// cabbage crops) and src/ui/icons/forestIcons.js, next to natureArt
// references, plus a game-scale forest floor scene.  ?scale=4
import { EXTRA_SPRITES, PLANT_STAGES } from '/src/art/extra/forestArt.js';
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
for (const [id, st] of Object.entries(PLANT_STAGES)) for (const s of st) if (!atlas.frames[s]) errs.push(`${id}: stage ${s} missing`);

const app = document.getElementById('app');
app.innerHTML = `<h1>Forest finds</h1><div class="sub">×${S} · atlas ${atlas.canvas.width}×${atlas.canvas.height}</div>` +
  (errs.length ? `<div class="errors">${errs.join('\n')}</div>` : '<div class="ok">all sprites in the nature atlas, hard alpha</div>');

function cellOf(name, sc = S, cls = 'floor') {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const wrap = document.createElement('div');
  wrap.className = cls;
  const cv = natureCanvas(name, 0, sc);
  wrap.appendChild(cv);
  cell.appendChild(wrap);
  const f = atlas.frames[name]?.[0];
  const l = document.createElement('div');
  l.className = 'lbl';
  l.textContent = `${name} ${f ? f.w + '×' + f.h : '?'}`;
  cell.appendChild(l);
  return cell;
}
function section(title, names, sc = S) {
  const h = document.createElement('h2');
  h.textContent = title;
  app.appendChild(h);
  const row = document.createElement('div');
  row.className = 'row';
  for (const n of names) row.appendChild(cellOf(n, sc));
  app.appendChild(row);
}
section('pickups', ['forage_log_0', 'forage_log_1', 'forage_morel', 'forage_fiddlehead', 'forage_ramps', 'forage_wildberry', 'forage_wildberry_picked', 'forage_pinecone', 'forage_resin', 'forage_stump']);
section('natureArt references', ['log_0', 'stump', 'pinecone', 'mushroom_red', 'mushroom_brown', 'fern_0', 'blueberry', 'bush_0', 'mossrock']);
section('ruins', ['ruin_floor', 'ruin_pillar', 'ruin_wall', 'ruin_chair', 'ruin_table', 'ruin_clock', 'ruin_lamp', 'ruin_cart']);
section('crops (tomato, cabbage, carrot ref)', ['crop_seed', 'crop_sprout', 'crop_tomato_grow', 'crop_tomato_ripe', 'crop_cabbage_grow', 'crop_cabbage_ripe', 'crop_carrot_ripe', 'crop_lettuce_ripe']);

// icons
const icoMods = import.meta.glob('/src/ui/icons/forestIcons.js', { eager: true });
const ICONS = Object.values(icoMods)[0]?.UI_ICONS || {};
{
  const h = document.createElement('h2');
  h.textContent = 'UI icons ×3 (forestIcons.js)';
  app.appendChild(h);
  const row = document.createElement('div');
  row.className = 'row icons';
  for (const [name, fn] of Object.entries(ICONS)) {
    const r = fn();
    const c = document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.d || r.data), r.w, r.h), 0, 0);
    const big = document.createElement('canvas');
    big.width = r.w * 3; big.height = r.h * 3;
    const x = big.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, big.width, big.height);
    const cell = document.createElement('div'); cell.className = 'cell';
    cell.appendChild(big);
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = name; cell.appendChild(l);
    row.appendChild(cell);
  }
  app.appendChild(row);
}

// game-scale scene: forest floor with trees, a ruin and the pickups (×2)
{
  const h = document.createElement('h2');
  h.textContent = 'game scale ×2: a glade edge';
  app.appendChild(h);
  const K = 2, W = 24 * 14, H = 24 * 7;
  const cv = document.createElement('canvas');
  cv.width = W * K; cv.height = H * K;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#5a7a34'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#4a5a2a'; x.fillRect(0, 0, cv.width * 0.4, cv.height);
  const put = (name, gx, gy, flat) => {
    const f = atlas.frames[name]?.[0];
    if (!f) return;
    const c = natureCanvas(name, 0, K);
    x.drawImage(c, Math.round(gx * 24 * K - f.ax * K), Math.round(gy * 24 * K - (flat ? f.ay : f.ay) * K));
  };
  put('ruin_floor', 9, 3.2, true);
  const items = [
    ['spruce_0', 1, 2.2], ['pine_0', 3, 1.6], ['fern_0', 2.2, 3.4], ['forage_log_0', 2, 5.2], ['forage_resin', 4.4, 4.2],
    ['forage_morel', 1.2, 6.4], ['forage_pinecone', 3.6, 6.6], ['ruin_pillar', 8, 2.6], ['ruin_wall', 10.4, 2.5], ['ruin_chair', 9.2, 3.8],
    ['forage_fiddlehead', 6.2, 5.4], ['forage_ramps', 7.6, 6.4], ['forage_wildberry', 12, 5.6], ['daisy', 11, 6.6], ['lupine_purple', 13.2, 3.4], ['birch_0', 13, 2.2], ['forage_log_1', 6, 3],
  ].sort((a, b) => a[2] - b[2]);
  for (const [n, gx, gy] of items) put(n, gx, gy);
  app.appendChild(cv);
}
window.__ready = true;
