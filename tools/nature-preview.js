// Preview for src/art/natureArt.js and src/art/terrainArt.js.
// URL flags:
//   ?section=all|scene|sprites|terrain   ?only=name1,name2   ?scale=3 (sprite grid)
//   ?sceneScale=2   ?frame=N (freeze animations)   ?bg=%23rrggbb
import { NATURE_NAMES, NATURE_TEXELS_PER_UNIT, buildNatureAtlas, natureCanvas } from '/src/art/natureArt.js';
import { buildTerrainAtlas } from '/src/art/terrainArt.js';

const q = new URLSearchParams(location.search);
const SCALE = +(q.get('scale') || 3);
const SCENE_SCALE = +(q.get('sceneScale') || 2);
const only = q.get('only') ? q.get('only').split(',').map((s) => s.trim()) : null;
const section = q.get('section') || (only ? 'sprites' : 'all');
const freeze = q.has('frame') ? +q.get('frame') : null;
if (q.get('bg')) document.body.style.background = q.get('bg');

const app = document.getElementById('app');
const t0 = performance.now();
const atlas = buildNatureAtlas();
const t1 = performance.now();
const terrain = buildTerrainAtlas();
const t2 = performance.now();

// --- sanity checks ---------------------------------------------------------
const errs = [];
for (const n of NATURE_NAMES) {
  const fr = atlas.frames[n];
  if (!fr || !fr.length) errs.push('no frames: ' + n);
  else
    fr.forEach((f, i) => {
      if (!f || f.w < 1 || f.h < 1) errs.push(`bad frame ${n}[${i}]`);
      else if (f.x + f.w > atlas.canvas.width || f.y + f.h > atlas.canvas.height) errs.push(`frame out of atlas ${n}[${i}]`);
    });
}
try {
  const c = natureCanvas('__nope__', 3, 2);
  if (!c) errs.push('unknown name returned nothing');
} catch (e) {
  errs.push('unknown name threw: ' + e.message);
}
const pow2 = (v) => (v & (v - 1)) === 0;
if (!pow2(atlas.canvas.width) || !pow2(atlas.canvas.height)) errs.push('atlas not power of two');
if (atlas.canvas.width > 2048 || atlas.canvas.height > 2048) errs.push('atlas too big');
const frameCount = NATURE_NAMES.reduce((a, n) => a + atlas.frames[n].length, 0);

app.innerHTML = `<h1>Nature sprites</h1>
<div class="sub">${NATURE_NAMES.length} sprites / ${frameCount} frames, atlas ${atlas.canvas.width}x${atlas.canvas.height} built in ${(t1 - t0).toFixed(0)} ms;
terrain atlas ${terrain.canvas.width}x${terrain.canvas.height} in ${(t2 - t1).toFixed(0)} ms; ${NATURE_TEXELS_PER_UNIT} texels/unit</div>
<div class="${errs.length ? 'errors' : 'ok'}">${errs.length ? errs.join('\n') : 'all sprites OK'}</div>`;

const anims = [];
const FPS = 12;
const speedOf = (name) =>
  /fly|hover|bee|dragonfly|monarch|butterfly|moth/.test(name) ? 8 : /firefly/.test(name) ? 2 : /hop|run|jump|peck/.test(name) ? 4 : 2;

// --- helpers -----------------------------------------------------------------
function drawFrame(g, name, frame, x, y, s, flipX = false) {
  const fr = atlas.frames[name];
  if (!fr) return;
  const f = fr[((frame % fr.length) + fr.length) % fr.length];
  const dx = Math.round(x - f.ax * s), dy = Math.round(y - f.ay * s);
  if (flipX) {
    g.save();
    g.translate(Math.round(x * 2), 0);
    g.scale(-1, 1);
    g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, Math.round(x - f.ax * s), dy, f.w * s, f.h * s);
    g.restore();
  } else g.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, dx, dy, f.w * s, f.h * s);
}
function tilePattern(g, name, s) {
  const t = terrain.tiles[name];
  const c = document.createElement('canvas');
  c.width = t.w * s;
  c.height = t.h * s;
  const cg = c.getContext('2d');
  cg.imageSmoothingEnabled = false;
  cg.drawImage(terrain.canvas, t.x, t.y, t.w, t.h, 0, 0, c.width, c.height);
  return g.createPattern(c, 'repeat');
}

// --- scene -------------------------------------------------------------------
function buildScene() {
  const S = SCENE_SCALE;
  const W = 640, H = 360; // logical pixels (24 per world unit)
  const h = document.createElement('h2');
  h.textContent = 'forest edge (mock scene)';
  const cv = document.createElement('canvas');
  cv.className = 'scene';
  cv.width = W * S;
  cv.height = H * S;
  cv.style.width = W * S + 'px';
  app.append(h, cv);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  // static props: [name, x, y, flip]
  const props = [];
  const P = (name, x, y, flip = false) => props.push({ name, x, y, flip });
  // back forest row
  const back = [
    ['spruce_1', 42, 112], ['pine_1', 92, 116], ['maple_red', 150, 104], ['spruce_0', 196, 98], ['birch_0', 238, 106],
    ['pine_0', 282, 100], ['maple_orange', 330, 110], ['spruce_2', 376, 96], ['aspen_0', 412, 104], ['birch_1', 452, 112],
    ['maple_scarlet', 505, 106], ['spruce_0', 556, 100], ['spruce_1', 606, 110], ['snag', 474, 96],
    ['spruce_2', 18, 150], ['maple_red', 628, 160],
  ];
  for (const [n, x, y] of back) P(n, x, y);
  // snowy plateau trees (top-left corner)
  P('spruce_snow_1', 30, 44); P('spruce_snow_0', 70, 40);
  // mid ground
  [['bush_0', 118, 140], ['bush_1', 214, 136], ['sumac', 262, 138], ['rose', 318, 142], ['blueberry', 360, 140], ['bush_0', 430, 144],
    ['blueberry_picked', 536, 146], ['sapling', 572, 150], ['fern_0', 172, 150], ['fern_1', 396, 150], ['fern_0', 596, 156],
    ['stump', 470, 160], ['log_0', 84, 176], ['boulder_0', 34, 214], ['mossrock', 556, 196], ['rock_0', 154, 208], ['rock_1', 598, 214],
    ['mushroom_red', 108, 170], ['mushroom_brown', 494, 170], ['tallgrass_0', 12, 250], ['tallgrass_1', 210, 186], ['boulder_1', 604, 290],
    ['log_1', 120, 318], ['rock_2', 560, 338], ['pinecone', 60, 188], ['pinecone', 520, 172],
  ].forEach(([n, x, y]) => P(n, x, y));
  // flowers & ground cover (deterministic scatter)
  const flowers = ['fireweed', 'lupine_purple', 'lupine_blue', 'lupine_pink', 'daisy', 'susan', 'trillium', 'aster', 'dandelion', 'clover'];
  const tufts = ['tuft_0', 'tuft_1', 'tuft_2', 'tuft_3'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const inPond = (x, y) => ((x - 360) / 150) ** 2 + ((y - 262) / 62) ** 2 < 1.25;
  const onTrail = (x, y) => Math.abs(x - (250 - (y - 360) * 0.35 + Math.sin(y / 30) * 18)) < 18;
  for (let i = 0; i < 70; i++) {
    const x = 10 + rnd() * 620, y = 160 + rnd() * 195;
    if (inPond(x, y) || onTrail(x, y)) continue;
    P(i % 3 === 0 ? flowers[Math.floor(rnd() * flowers.length)] : tufts[Math.floor(rnd() * 4)], x, y);
  }
  for (let i = 0; i < 12; i++) {
    const x = 10 + rnd() * 620, y = 170 + rnd() * 185;
    if (inPond(x, y)) continue;
    P(['leaf_red', 'leaf_orange', 'leaf_yellow', 'leaf_brown'][i % 4], x, y);
    if (i % 3 === 0) P('pebble_' + (i % 4), x + 20, y + 6);
  }
  // pond edge plants
  [['cattail_0', 222, 262], ['cattail_1', 236, 280], ['reeds_0', 250, 234], ['wildrice', 498, 250], ['reeds_1', 486, 290], ['cattail_0', 506, 272],
    ['cattail_1', 404, 214], ['reeds_1', 300, 222]].forEach(([n, x, y]) => P(n, x, y));
  P('driftwood', 430, 330);
  // flat water plants (anchored at centre, drawn under everything that stands)
  const flat = [['lilypad_0', 300, 262], ['lilypad_1', 318, 276], ['lilypad_0', 452, 282], ['lilypad_1', 470, 248], ['duckweed', 400, 300], ['duckweed', 276, 290], ['lilypad_0', 420, 244]];
  const lilyFlowers = [['lilyflower_pink', 300, 262], ['lilyflower_white', 452, 281], ['lilyflower_pink', 420, 243]];

  // animated actors: [name, x, y, flip, phase, motion]
  const actors = [
    { name: 'loon_swim', x: 360, y: 270, t: 0, path: (t) => [360 + Math.sin(t * 0.25) * 40, 270 + Math.cos(t * 0.25) * 6] },
    { name: 'mallard_swim', x: 460, y: 300, t: 0, path: (t) => [440 - (t * 6) % 90, 304], flip: true },
    { name: 'goose_swim', x: 280, y: 250, t: 0, path: (t) => [292 + Math.sin(t * 0.2) * 20, 252] },
    { name: 'dragonfly', x: 330, y: 240, t: 0, path: (t) => [330 + Math.sin(t * 1.3) * 30, 226 + Math.sin(t * 2.1) * 8] },
    { name: 'dragonfly', x: 430, y: 250, t: 1, path: (t) => [440 + Math.cos(t * 1.1) * 28, 236 + Math.sin(t * 1.7) * 9], flip: true },
    { name: 'frog_croak', x: 262, y: 286 },
    { name: 'frog_idle', x: 318, y: 278 },
    { name: 'robin_peck', x: 160, y: 262 },
    { name: 'chickadee_idle', x: 36, y: 200 },
    { name: 'bluejay_hop', x: 560, y: 250, path: (t) => [560 - ((t * 10) % 60), 250] , flip: true },
    { name: 'cardinal_idle', x: 214, y: 128 },
    { name: 'grayjay_idle', x: 470, y: 146 },
    { name: 'crow_peck', x: 110, y: 290 },
    { name: 'crow_fly', x: 0, y: 60, path: (t) => [((t * 30) % 760) - 60, 70 + Math.sin(t) * 4] },
    { name: 'goose_fly', x: 0, y: 30, path: (t) => [700 - ((t * 24) % 800), 34], flip: true },
    { name: 'goose_fly', x: 0, y: 30, t: 0.5, path: (t) => [720 - ((t * 24) % 800), 44], flip: true },
    { name: 'squirrel_idle', x: 470, y: 152 },
    { name: 'squirrel_run', x: 0, y: 188, path: (t) => [60 + ((t * 36) % 140), 190] },
    { name: 'monarch', x: 330, y: 150, path: (t) => [330 + Math.sin(t * 0.7) * 26, 128 + Math.sin(t * 1.9) * 8] },
    { name: 'bluebutterfly', x: 200, y: 200, path: (t) => [180 + Math.cos(t * 0.8) * 22, 196 + Math.sin(t * 1.6) * 7] },
    { name: 'bee', x: 360, y: 150, path: (t) => [362 + Math.sin(t * 2.3) * 12, 130 + Math.cos(t * 3.1) * 5] },
    { name: 'bee', x: 330, y: 150, path: (t) => [322 + Math.cos(t * 2.1) * 10, 136 + Math.sin(t * 2.7) * 4] },
    { name: 'hummingbird_hover', x: 320, y: 128, path: (t) => [312 + Math.sin(t * 0.5) * 6, 120 + Math.sin(t * 3) * 2] },
    { name: 'firefly', x: 140, y: 150, t: 0.3, path: (t) => [140 + Math.sin(t * 0.6) * 20, 148 + Math.cos(t * 0.9) * 8] },
    { name: 'firefly', x: 420, y: 160, t: 0.7, path: (t) => [420 + Math.cos(t * 0.5) * 20, 156 + Math.sin(t * 0.8) * 8] },
    { name: 'moth', x: 560, y: 170, path: (t) => [560 + Math.sin(t * 1.2) * 10, 170 + Math.cos(t * 1.9) * 6] },
    { name: 'ladybug', x: 330, y: 320, path: (t) => [330 + ((t * 3) % 20), 320] },
    { name: 'robin_hop', x: 600, y: 330, path: (t) => [620 - ((t * 12) % 80), 332], flip: true },
    { name: 'loon_call', x: 520, y: 270 },
  ];

  const sandP = tilePattern(g, 'sand', S);
  const grassP = tilePattern(g, 'grass', S);
  const autumnP = tilePattern(g, 'grass_autumn', S);
  const forestP = tilePattern(g, 'forest', S);
  const trailP = tilePattern(g, 'trail', S);
  const floorP = tilePattern(g, 'pondfloor', S);
  const snowP = tilePattern(g, 'snow', S);
  const cliffP = tilePattern(g, 'cliff', S);
  const dirtP = tilePattern(g, 'dirt', S);

  const shadow = (x, y, rx, ry) => {
    g.fillStyle = 'rgba(20, 30, 40, 0.28)';
    g.beginPath();
    g.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2);
    g.fill();
  };
  const shadowSize = (name) => {
    if (/^(spruce|pine|birch|aspen|snag)/.test(name)) return [14, 5];
    if (/^maple/.test(name)) return [20, 6];
    if (/^(bush|blueberry|rose|sumac|boulder|mossrock|stump|log)/.test(name)) return [10, 3];
    return null;
  };

  function paintGround() {
    g.fillStyle = grassP;
    g.fillRect(0, 0, cv.width, cv.height);
    // autumn meadow patch
    g.fillStyle = autumnP;
    g.beginPath();
    g.ellipse(560 * S, 330 * S, 120 * S, 50 * S, 0, 0, Math.PI * 2);
    g.fill();
    // forest floor under the back row
    g.fillStyle = forestP;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(cv.width, 0);
    g.lineTo(cv.width, 130 * S);
    for (let x = 640; x >= 0; x -= 20) g.lineTo(x * S, (118 + Math.sin(x / 37) * 10) * S);
    g.closePath();
    g.fill();
    // snowy plateau with a cliff face
    g.fillStyle = cliffP;
    g.fillRect(0, 0, 110 * S, 70 * S);
    g.fillStyle = snowP;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(110 * S, 0);
    g.lineTo(110 * S, 36 * S);
    for (let x = 110; x >= 0; x -= 10) g.lineTo(x * S, (44 + Math.sin(x / 9) * 3) * S);
    g.closePath();
    g.fill();
    // trail
    g.fillStyle = trailP;
    g.beginPath();
    for (let y = 360; y >= 110; y -= 6) {
      const cx = 250 - (y - 360) * 0.35 + Math.sin(y / 30) * 18;
      g.lineTo((cx - 13) * S, y * S);
    }
    for (let y = 110; y <= 360; y += 6) {
      const cx = 250 - (y - 360) * 0.35 + Math.sin(y / 30) * 18;
      g.lineTo((cx + 13) * S, y * S);
    }
    g.closePath();
    g.fill();
    // dirt patch where the pond was dug
    g.fillStyle = dirtP;
    g.beginPath();
    g.ellipse(380 * S, 262 * S, 162 * S, 70 * S, 0, 0, Math.PI * 2);
    g.fill();
    // pond: sand rim, floor, water
    g.fillStyle = sandP;
    g.beginPath();
    g.ellipse(370 * S, 264 * S, 156 * S, 66 * S, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.ellipse(368 * S, 262 * S, 146 * S, 58 * S, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = floorP;
    g.fillRect(0, 0, cv.width, cv.height);
    const grad = g.createRadialGradient(368 * S, 262 * S, 10 * S, 368 * S, 262 * S, 150 * S);
    grad.addColorStop(0, 'rgba(34, 86, 124, 0.78)');
    grad.addColorStop(1, 'rgba(70, 140, 170, 0.5)');
    g.fillStyle = grad;
    g.fillRect(0, 0, cv.width, cv.height);
    g.restore();
    g.strokeStyle = 'rgba(220, 245, 255, 0.55)';
    g.lineWidth = S;
    g.beginPath();
    g.ellipse(368 * S, 262 * S, 146 * S, 58 * S, 0, Math.PI * 1.05, Math.PI * 1.9);
    g.stroke();
  }

  function render(tick) {
    const time = tick / FPS;
    paintGround();
    // ripples
    g.fillStyle = 'rgba(210, 240, 255, 0.35)';
    for (let i = 0; i < 14; i++) {
      const x = 260 + ((i * 53 + tick * 0.6) % 220), y = 225 + ((i * 37) % 70);
      g.fillRect(Math.round(x) * S, Math.round(y) * S, 4 * S, S);
    }
    for (const [n, x, y] of flat) drawFrame(g, n, 0, x * S, y * S, S);
    const items = [...props.map((p) => ({ ...p, kind: 'prop' }))];
    for (const a of actors) {
      const t = time + (a.t || 0) * 3;
      const [x, y] = a.path ? a.path(t) : [a.x, a.y];
      const fr = atlas.frames[a.name];
      const flying = fr && fr[0].ay !== fr[0].h;
      items.push({ name: a.name, x, y: flying ? y + 40 : y, dy: flying ? -40 : 0, flip: a.flip, frame: freeze ?? Math.floor(t * speedOf(a.name)) });
    }
    for (const [n, x, y] of lilyFlowers) items.push({ name: n, x, y: y + 1, dy: -1 });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      const sh = it.kind === 'prop' ? shadowSize(it.name) : null;
      if (sh) shadow(it.x, it.y - 1, sh[0], sh[1]);
      drawFrame(g, it.name, it.frame ?? 0, it.x * S, (it.y + (it.dy || 0)) * S, S, it.flip);
    }
  }
  return render;
}

// --- sprite grid ---------------------------------------------------------
function spriteCell(name) {
  const fr = atlas.frames[name];
  const cell = document.createElement('div');
  cell.className = 'cell';
  const maxW = Math.max(...fr.map((f) => f.w)), maxH = Math.max(...fr.map((f) => f.h));
  const cv = document.createElement('canvas');
  cv.width = maxW * SCALE;
  cv.height = maxH * SCALE;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const grounded = fr[0].ay === fr[0].h;
  const draw = (i) => {
    g.clearRect(0, 0, cv.width, cv.height);
    drawFrame(g, name, i, (maxW / 2) * SCALE, (grounded ? maxH : maxH / 2) * SCALE, SCALE);
  };
  draw(freeze ?? 0);
  if (fr.length > 1 && freeze === null) anims.push({ draw, speed: speedOf(name) });
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.textContent = name;
  const sz = document.createElement('div');
  sz.className = 'sz';
  sz.textContent = `${fr[0].w}x${fr[0].h}${fr.length > 1 ? ' x' + fr.length : ''}`;
  cell.append(cv, lbl, sz);
  return cell;
}
const GROUPS = [
  ['trees', /^(spruce|pine_|birch|maple|aspen|snag|sapling)/],
  ['bushes', /^(bush|blueberry|rose|sumac)/],
  ['ground cover', /^(tuft|tallgrass|clover|fern|mushroom|fireweed|lupine|daisy|susan|trillium|aster|dandelion)/],
  ['rocks & wood', /^(boulder|rock|pebble|mossrock|log|stump|pinecone|leaf|driftwood)/],
  ['water plants', /^(cattail|reeds|lily|duckweed|wildrice)/],
  ['birds', /^(bluejay|cardinal|chickadee|robin|crow|grayjay|goose|loon|mallard|hummingbird)/],
  ['bugs & critters', /./],
];
function addSprites() {
  const names = only || NATURE_NAMES;
  const used = new Set();
  for (const [title, re] of GROUPS) {
    const list = names.filter((n) => !used.has(n) && re.test(n));
    if (!list.length) continue;
    list.forEach((n) => used.add(n));
    const h = document.createElement('h2');
    h.textContent = `${title} (${list.length})`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const n of list) grid.appendChild(spriteCell(n));
    app.append(h, grid);
  }
}

// --- terrain -------------------------------------------------------------------
function addTerrain() {
  const s = +(q.get('tscale') || 2);
  const h = document.createElement('h2');
  h.textContent = `terrain tiles (48x48, each tiled 3x3 at ${s}x)`;
  const wrapEl = document.createElement('div');
  wrapEl.className = 'tiles';
  for (const [name, t] of Object.entries(terrain.tiles)) {
    const box = document.createElement('div');
    const cv = document.createElement('canvas');
    cv.width = t.w * 3 * s;
    cv.height = t.h * 3 * s;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) g.drawImage(terrain.canvas, t.x, t.y, t.w, t.h, i * t.w * s, j * t.h * s, t.w * s, t.h * s);
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = `${name} (avg ${t.avg})`;
    box.append(cv, lbl);
    wrapEl.appendChild(box);
  }
  app.append(h, wrapEl);
}

let renderScene = null;
if (section === 'all' || section === 'scene') renderScene = buildScene();
if (section === 'all' || section === 'sprites') addSprites();
if (section === 'all' || section === 'terrain') addTerrain();

let tick = 0;
if (renderScene) renderScene(freeze ?? 0);
setInterval(() => {
  tick++;
  if (freeze !== null) return;
  if (renderScene) renderScene(tick);
  for (const a of anims) {
    const every = Math.max(1, Math.round(FPS / a.speed));
    if (tick % every === 0) a.draw(Math.floor(tick / every));
  }
}, 1000 / FPS);
window.__natureReady = true;
