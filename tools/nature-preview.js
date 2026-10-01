// Preview for src/art/natureArt.js and src/art/terrainArt.js.
// URL flags:
//   ?section=all|scene|sprites|terrain   ?only=name1,name2   ?scale=3 (sprite grid)
//   ?scene=forest|mushroom|swamp|river|willow|garden (one mock scene only)
//   ?sceneScale=2   ?frame=N (freeze animations)   ?bg=%23rrggbb
import { NATURE_NAMES, NATURE_TEXELS_PER_UNIT, buildNatureAtlas, natureCanvas } from '/src/art/natureArt.js';
import { buildTerrainAtlas } from '/src/art/terrainArt.js';

const q = new URLSearchParams(location.search);
const SCALE = +(q.get('scale') || 3);
const SCENE_SCALE = +(q.get('sceneScale') || 2);
const only = q.get('only') ? q.get('only').split(',').map((s) => s.trim()) : null;
const section = q.get('section') || (only ? 'sprites' : 'all');
const freeze = q.has('frame') ? +q.get('frame') : null;
const onlyScene = q.get('scene');
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
if (atlas.canvas.width > 4096 || atlas.canvas.height > 4096) errs.push('atlas too big');
// every sprite the v3 brief asks for must exist
const REQUIRED = `giantshroom_red_0 giantshroom_red_1 giantshroom_brown_0 giantshroom_glow_0 giantshroom_glow_1 shroomcluster_0 shroomcluster_1 shroomcluster_2
glowcap_0 glowcap_1 glowcap_2 mushlog spore cypress_0 cypress_1 deadtree_0 deadtree_1 swampgrass_0 swampgrass_1 swampgrass_2 bogpad_0 bogpad_1
algae_0 algae_1 algae_2 pitcherplant swampreeds_0 swampreeds_1 bubbles_swamp frog_log puddle_0 puddle_1 puddle_2 ripplering rapids_0 rapids_1 rapids_2
steppingstone_0 steppingstone_1 steppingstone_2 riverrock_0 riverrock_1 riverrock_2 driftwood_1 weed_0 weed_1 weed_2 weed_3 plowed_0 stump_1 stump_big
rubble_0 rubble_1 woodpile chips_0 greatwillow raspberry raspberry_picked strawberry strawberry_picked cranberry cranberry_picked saskatoon saskatoon_picked
cloudberry cloudberry_picked elderberry elderberry_picked goldenberry goldenberry_picked build_berrybush_raspberry sugarmaple appletree applertree_bare
flowerbed_0 flowerbed_1 flowerbed_2 flowerbed_3 seaweed_0 seaweed_1 seaweed_2 cattailpatch wildriceplot beehive_tree sapling_1 pumpkinpatch sunflower
heron_idle heron_fish turtle_swim turtle_sun beaver_swim owl_idle owl_blink firefly_big`.split(/\s+/);
for (const n of REQUIRED) if (!atlas.frames[n]) errs.push('missing v3 sprite: ' + n);
const expectFrames = { spore: 3, bubbles_swamp: 3, rapids_0: 3, greatwillow: 2, heron_idle: 2, heron_fish: 3, turtle_swim: 2, turtle_sun: 2, beaver_swim: 2, owl_idle: 2, firefly_big: 2 };
for (const [n, k] of Object.entries(expectFrames)) if (atlas.frames[n] && atlas.frames[n].length !== k) errs.push(`${n}: expected ${k} frames`);
const frameCount = NATURE_NAMES.reduce((a, n) => a + atlas.frames[n].length, 0);

app.innerHTML = `<h1>Nature sprites</h1>
<div class="sub">${NATURE_NAMES.length} sprites / ${frameCount} frames, atlas ${atlas.canvas.width}x${atlas.canvas.height} built in ${(t1 - t0).toFixed(0)} ms;
terrain atlas ${terrain.canvas.width}x${terrain.canvas.height} in ${(t2 - t1).toFixed(0)} ms; ${NATURE_TEXELS_PER_UNIT} texels/unit</div>
<div class="${errs.length ? 'errors' : 'ok'}">${errs.length ? errs.join('\n') : 'all sprites OK'}</div>`;

const anims = [];
const FPS = 12;
const speedOf = (name) =>
  /firefly/.test(name) ? 2 : /fly|hover|bee|dragonfly|monarch|butterfly|moth/.test(name) ? 8 : /hop|run|jump|peck|rapids/.test(name) ? 4 : /greatwillow|seaweed/.test(name) ? 1 : 2;

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

// --- v3 biome scenes ---------------------------------------------------------
// Generic mock scene: a ground painter, static props, flat decals (drawn
// first, anchored at their centre) and animated actors, depth-sorted by y.
const sceneRenders = [];
function makeScene(id, title, W, H, o) {
  if (onlyScene && onlyScene !== id) return;
  const S = SCENE_SCALE;
  const h = document.createElement('h2');
  h.textContent = title;
  const cv = document.createElement('canvas');
  cv.className = 'scene';
  cv.id = 'scene-' + id;
  cv.width = W * S;
  cv.height = H * S;
  cv.style.width = W * S + 'px';
  app.append(h, cv);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const ground = document.createElement('canvas');
  ground.width = cv.width;
  ground.height = cv.height;
  const gg = ground.getContext('2d');
  gg.imageSmoothingEnabled = false;
  o.paint(gg, S, W, H);
  const shadow = (x, y, rx, ry) => {
    g.fillStyle = 'rgba(20, 24, 40, 0.3)';
    g.beginPath();
    g.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2);
    g.fill();
  };
  sceneRenders.push((tick) => {
    const time = tick / FPS;
    g.drawImage(ground, 0, 0);
    if (o.under) o.under(g, S, tick);
    for (const f of o.flats || []) {
      const fr = freeze ?? Math.floor((time + (f[3] || 0)) * (f[4] || 3));
      drawFrame(g, f[0], fr, f[1] * S, f[2] * S, S);
    }
    const items = (o.props || []).map(([name, x, y, flip, sh]) => ({ name, x, y, flip, sh, frame: freeze ?? Math.floor(time * speedOf(name) + x * 0.37) }));
    for (const a of o.actors || []) {
      const t = time + (a.t || 0);
      const [x, y] = a.path ? a.path(t) : [a.x, a.y];
      const fr = atlas.frames[a.name];
      const flying = fr && fr[0].ay !== fr[0].h;
      const name = a.seq ? a.seq(t) : a.name;
      items.push({ name, x, y: flying ? y + 40 : y, dy: flying ? -40 : 0, flip: a.flip, frame: freeze ?? Math.floor(t * (a.fps || speedOf(name))) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.sh) shadow(it.x, it.y - 1, it.sh[0], it.sh[1]);
      drawFrame(g, it.name, it.frame, it.x * S, (it.y + (it.dy || 0)) * S, S, it.flip);
    }
    if (o.over) o.over(g, S, tick);
  });
}
// dithered soft light (preview-only stand-in for in-game emissive light)
function glowSpot(g, S, x, y, r, rgb, a) {
  const grd = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
  grd.addColorStop(0, `rgba(${rgb}, ${a})`);
  grd.addColorStop(1, `rgba(${rgb}, 0)`);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = grd;
  g.fillRect((x - r) * S, (y - r) * S, r * 2 * S, r * 2 * S);
  g.restore();
}
function fillPat(g, pat, f) {
  g.fillStyle = pat;
  g.beginPath();
  f();
  g.fill();
}
function blob(g, S, cx, cy, rx, ry, wob = 0.12, seed = 1) {
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const k = 1 + wob * Math.sin(a * 3 + seed) + wob * 0.6 * Math.sin(a * 5 + seed * 2);
    const x = (cx + Math.cos(a) * rx * k) * S, y = (cy + Math.sin(a) * ry * k) * S;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}
function waterFill(g, S, path, deep = '28, 70, 110', shallow = '70, 140, 170') {
  g.save();
  g.beginPath();
  path();
  g.clip();
  g.fillStyle = `rgb(${deep})`;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  // dithered lighter bands
  g.fillStyle = `rgba(${shallow}, 0.55)`;
  for (let y = 0; y < g.canvas.height / S; y += 2)
    for (let x = (y / 2) % 2; x < g.canvas.width / S; x += 2) if (((x * 7 + y * 13) % 11) < 4) g.fillRect(x * S, y * S, S, S);
  g.restore();
}
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const SH_TREE = [14, 5], SH_BIG = [26, 7], SH_SM = [8, 3];

function buildBiomeScenes() {
  const grassP = tilePattern(document.createElement('canvas').getContext('2d'), 'grass', SCENE_SCALE);
  const forestP = tilePattern(document.createElement('canvas').getContext('2d'), 'forest', SCENE_SCALE);
  const dirtP = tilePattern(document.createElement('canvas').getContext('2d'), 'dirt', SCENE_SCALE);
  const sandP = tilePattern(document.createElement('canvas').getContext('2d'), 'sand', SCENE_SCALE);
  const trailP = tilePattern(document.createElement('canvas').getContext('2d'), 'trail', SCENE_SCALE);
  const floorP = tilePattern(document.createElement('canvas').getContext('2d'), 'pondfloor', SCENE_SCALE);

  // ---- 1. mushroom forest at night -----------------------------------------
  {
    const R = rng(11);
    const props = [
      ['giantshroom_glow_0', 92, 150, false, [16, 5]], ['giantshroom_red_0', 210, 132, false, [24, 6]], ['giantshroom_brown_0', 360, 140, false, [24, 6]],
      ['giantshroom_glow_1', 470, 128, false, [12, 4]], ['giantshroom_red_1', 560, 156, true, [18, 5]], ['giantshroom_glow_1', 300, 196, true, [12, 4]],
      ['giantshroom_glow_0', 610, 250, true, [16, 5]], ['spruce_0', 30, 120, false, SH_TREE], ['spruce_2', 430, 96, false, SH_TREE],
      ['mushlog', 150, 238, false, [18, 4]], ['shroomcluster_0', 266, 260], ['shroomcluster_1', 420, 238], ['shroomcluster_2', 520, 290],
      ['shroomcluster_2', 60, 300], ['fern_0', 330, 236], ['fern_0', 500, 200], ['fern_1', 110, 196], ['mossrock', 470, 300, false, SH_SM],
      ['stump_1', 380, 300, false, SH_SM], ['tuft_0', 240, 300], ['tuft_2', 180, 320], ['mushroom_red', 560, 330], ['mushroom_brown', 30, 340],
    ];
    for (let i = 0; i < 26; i++) props.push(['glowcap_' + (i % 3), 20 + R() * 600, 170 + R() * 185]);
    const actors = [
      { name: 'owl_idle', x: 156, y: 226, seq: (t) => (t % 6 < 0.5 ? 'owl_blink' : 'owl_idle'), fps: 6 },
      { name: 'firefly_big', path: (t) => [250 + Math.sin(t * 0.5) * 40, 190 + Math.cos(t * 0.7) * 14] },
      { name: 'firefly_big', t: 2, path: (t) => [520 + Math.cos(t * 0.4) * 50, 220 + Math.sin(t * 0.6) * 18] },
      { name: 'firefly', path: (t) => [420 + Math.sin(t * 0.8) * 30, 170 + Math.cos(t) * 10] },
      { name: 'firefly', t: 1, path: (t) => [80 + Math.cos(t * 0.6) * 24, 250 + Math.sin(t * 0.9) * 10] },
      { name: 'moth', path: (t) => [370 + Math.sin(t * 1.1) * 12, 120 + Math.cos(t * 1.7) * 6] },
    ];
    for (let i = 0; i < 9; i++) actors.push({ name: 'spore', t: i * 0.7, fps: 3, path: (t) => [60 + ((i * 71) % 560), 270 - ((t * 9 + i * 30) % 120)] });
    makeScene('mushroom', 'mushroom forest (night mock scene)', 640, 360, {
      paint(g, S, W, H) {
        g.fillStyle = forestP;
        g.fillRect(0, 0, W * S, H * S);
        fillPat(g, grassP, () => blob(g, S, 330, 280, 260, 70, 0.1, 3));
        fillPat(g, forestP, () => blob(g, S, 330, 290, 160, 40, 0.15, 5));
        g.fillStyle = trailP;
        g.beginPath();
        for (let x = 0; x <= W; x += 8) g.lineTo(x * S, (318 + Math.sin(x / 50) * 12) * S);
        for (let x = W; x >= 0; x -= 8) g.lineTo(x * S, (336 + Math.sin(x / 50) * 12) * S);
        g.fill();
        // night tint
        g.fillStyle = 'rgba(24, 26, 74, 0.5)';
        g.fillRect(0, 0, W * S, H * S);
      },
      under(g, S, tick) {
        const k = 0.75 + 0.25 * Math.sin(tick / 9);
        for (const [x, y, r] of [[92, 116, 60], [470, 104, 44], [300, 176, 44], [610, 216, 60]]) glowSpot(g, S, x, y, r, '80, 230, 220', 0.22 * k);
      },
      flats: [],
      props,
      actors,
      over(g, S) {
        // lantern light from the bolete's window
        glowSpot(g, S, 366, 116, 26, '255, 190, 90', 0.25);
      },
    });
  }

  // ---- 2. swamp corner -----------------------------------------------------
  {
    const inBog = (x, y) => ((x - 360) / 230) ** 2 + ((y - 200) / 80) ** 2 < 1;
    const props = [
      ['cypress_0', 80, 140, false, SH_TREE], ['cypress_1', 150, 112, false, SH_TREE], ['deadtree_0', 600, 150, false, SH_TREE], ['cypress_0', 520, 112, true, SH_TREE],
      ['deadtree_1', 250, 100, true, SH_TREE], ['cypress_1', 30, 230, false, SH_TREE], ['deadtree_1', 400, 112, false],
      ['swampgrass_0', 180, 160], ['swampgrass_1', 140, 170], ['swampgrass_2', 300, 128], ['swampgrass_0', 470, 130], ['swampgrass_1', 590, 270],
      ['swampgrass_2', 120, 290], ['swampreeds_0', 186, 232], ['swampreeds_1', 200, 252], ['swampreeds_0', 560, 236], ['swampreeds_1', 548, 214],
      ['pitcherplant', 80, 270], ['pitcherplant', 620, 320], ['cranberry', 160, 312], ['cranberry_picked', 40, 330], ['cattail_0', 330, 136], ['cattail_1', 446, 132],
      ['frog_log', 420, 238], ['riverrock_0', 280, 270, false, SH_SM], ['swampgrass_0', 500, 330], ['tuft_3', 260, 330], ['tuft_3', 380, 320],
    ];
    makeScene('swamp', 'swamp corner (mock scene)', 640, 350, {
      paint(g, S, W, H) {
        g.fillStyle = grassP;
        g.fillRect(0, 0, W * S, H * S);
        g.fillStyle = 'rgba(70, 60, 30, 0.35)';
        g.fillRect(0, 0, W * S, H * S);
        fillPat(g, dirtP, () => blob(g, S, 360, 204, 246, 92, 0.08, 2));
        waterFill(g, S, () => blob(g, S, 360, 200, 230, 80, 0.1, 2), '38, 58, 44', '72, 96, 60');
        g.strokeStyle = 'rgba(200, 220, 180, 0.35)';
        g.lineWidth = S;
        g.beginPath();
        g.ellipse(360 * S, 200 * S, 228 * S, 78 * S, 0, Math.PI * 1.05, Math.PI * 1.9);
        g.stroke();
      },
      flats: [
        ['algae_2', 260, 200], ['algae_0', 480, 180], ['algae_1', 340, 248], ['algae_0', 200, 214], ['algae_1', 520, 220],
        ['bogpad_0', 300, 176], ['bogpad_1', 320, 190], ['bogpad_0', 470, 260], ['bogpad_1', 400, 170], ['bogpad_0', 236, 240],
        ['bubbles_swamp', 380, 206, 0, 2], ['bubbles_swamp', 290, 226, 0.6, 2], ['bubbles_swamp', 500, 196, 1.1, 2], ['lilypad_1', 430, 190],
      ],
      props,
      actors: [
        { name: 'heron_fish', x: 214, y: 196, fps: 2 },
        { name: 'heron_idle', x: 512, y: 168, flip: true },
        { name: 'turtle_swim', path: (t) => [300 + Math.sin(t * 0.2) * 60, 214] },
        { name: 'turtle_sun', x: 440, y: 232 },
        { name: 'dragonfly', path: (t) => [340 + Math.sin(t * 1.2) * 40, 150 + Math.sin(t * 2) * 10] },
        { name: 'frog_croak', x: 300, y: 178 },
        { name: 'mallard_swim', path: (t) => [560 - ((t * 5) % 160), 236], flip: true },
      ],
    });
  }

  // ---- 3. river with rapids & stepping stones ------------------------------
  {
    const riverY = (x) => 170 + Math.sin(x / 90) * 18;
    const props = [
      ['spruce_1', 40, 96, false, SH_TREE], ['birch_0', 110, 90, false, SH_TREE], ['maple_orange', 560, 96, false, SH_TREE], ['pine_1', 620, 110, false, SH_TREE],
      ['riverrock_2', 210, 160, false, SH_SM], ['riverrock_0', 330, 212, false], ['riverrock_1', 470, 186], ['riverrock_0', 600, 214], ['riverrock_1', 140, 140],
      ['driftwood_1', 420, 240], ['driftwood', 90, 236], ['reeds_0', 60, 214], ['reeds_1', 520, 230], ['cattail_0', 600, 250],
      ['weed_0', 200, 290], ['weed_1', 240, 300], ['weed_2', 300, 286], ['weed_3', 270, 320], ['weed_1', 430, 320],
      ['stump_1', 520, 300, false, SH_SM], ['stump_big', 580, 328, false, [14, 4]], ['woodpile', 380, 296, false, [14, 4]], ['rubble_0', 120, 320, false, [12, 3]],
      ['rubble_1', 40, 300], ['tuft_1', 160, 290], ['tuft_0', 460, 290], ['raspberry', 320, 120], ['saskatoon', 420, 116, false, SH_SM], ['tuft_2', 250, 112],
    ];
    makeScene('river', 'river with rapids & stepping stones (mock scene)', 640, 350, {
      paint(g, S, W, H) {
        g.fillStyle = grassP;
        g.fillRect(0, 0, W * S, H * S);
        // sandy banks, river floor, water
        const band = (k) => () => {
          for (let x = -10; x <= W + 10; x += 6) g.lineTo(x * S, (riverY(x) - k) * S);
          for (let x = W + 10; x >= -10; x -= 6) g.lineTo(x * S, (riverY(x) + k + 8) * S);
        };
        fillPat(g, sandP, band(46));
        g.save();
        g.beginPath();
        band(36)();
        g.clip();
        g.fillStyle = floorP;
        g.fillRect(0, 0, W * S, H * S);
        g.fillStyle = 'rgba(40, 100, 140, 0.62)';
        g.fillRect(0, 0, W * S, H * S);
        g.restore();
      },
      under(g, S, tick) {
        // kelp swaying under the surface
        g.save();
        g.globalAlpha = 0.55;
        for (const [n, x, y] of [['seaweed_0', 420, 206], ['seaweed_2', 440, 210], ['seaweed_1', 80, 214], ['seaweed_2', 610, 196]]) drawFrame(g, n, freeze ?? Math.floor(tick / 8 + x), x * S, y * S, S);
        g.restore();
        // current lines
        g.fillStyle = 'rgba(220, 245, 255, 0.4)';
        for (let i = 0; i < 26; i++) {
          const x = (i * 61 + tick * 2) % 700 - 30, y = riverY(x) - 26 + ((i * 37) % 60);
          g.fillRect(Math.round(x) * S, Math.round(y) * S, 5 * S, S);
        }
      },
      flats: [
        ['rapids_2', 240, 186, 0, 6], ['rapids_0', 470, 168, 0.3, 6], ['rapids_1', 560, 160, 0.6, 6], ['rapids_1', 120, 190, 0.2, 6],
        ['steppingstone_0', 340, 150], ['steppingstone_1', 356, 168], ['steppingstone_2', 344, 186], ['steppingstone_0', 362, 204],
        ['ripplering', 410, 150, 0, 4], ['ripplering', 180, 176, 1, 4],
        ['puddle_1', 160, 120], ['puddle_0', 520, 296], ['puddle_2', 90, 270],
        ['plowed_0', 240, 260], ['chips_0', 400, 312], ['chips_0', 560, 290],
      ],
      props,
      actors: [
        { name: 'beaver_swim', path: (t) => [((t * 12) % 760) - 60, riverY((t * 12) % 760 - 60) + 6] },
        { name: 'loon_swim', path: (t) => [640 - ((t * 7) % 700), riverY(640 - ((t * 7) % 700)) - 10], flip: true },
        { name: 'heron_idle', x: 280, y: 214 },
        { name: 'robin_peck', x: 220, y: 270 },
      ],
    });
  }

  // ---- 4. the Great Willow on a hill ---------------------------------------
  {
    const R = rng(5);
    const props = [
      ['greatwillow', 320, 262], ['spruce_0', 40, 170, false, SH_TREE], ['spruce_2', 600, 160, false, SH_TREE], ['birch_1', 560, 210, false, SH_TREE],
      ['maple_red', 80, 260, false, [20, 6]], ['bush_0', 150, 280], ['rose', 500, 286], ['goldenberry', 420, 300], ['strawberry', 210, 292],
      ['cloudberry', 260, 300], ['flowerbed_1', 380, 330], ['sapling_1', 470, 330], ['sunflower', 520, 336], ['mushroom_red', 196, 270],
    ];
    const flowers = ['daisy', 'lupine_purple', 'lupine_pink', 'aster', 'clover', 'fireweed', 'susan'];
    for (let i = 0; i < 40; i++) {
      const x = 20 + R() * 600, y = 240 + R() * 140;
      if (Math.abs(x - 320) < 40 && y < 280) continue;
      props.push([i % 2 ? flowers[i % flowers.length] : 'tuft_' + (i % 3), x, y]);
    }
    makeScene('willow', 'the Great Willow on a hill (dusk mock scene)', 640, 380, {
      paint(g, S, W, H) {
        const sky = g.createLinearGradient(0, 0, 0, 200 * S);
        sky.addColorStop(0, '#2a2a5e');
        sky.addColorStop(0.6, '#c86a6a');
        sky.addColorStop(1, '#f4b070');
        g.fillStyle = sky;
        g.fillRect(0, 0, W * S, H * S);
        fillPat(g, grassP, () => {
          g.moveTo(0, H * S);
          for (let x = 0; x <= W; x += 8) g.lineTo(x * S, (180 + Math.pow((x - 320) / 320, 2) * 90 - Math.cos((x - 320) / 140) * 14) * S);
          g.lineTo(W * S, H * S);
        });
        g.fillStyle = trailP;
        g.beginPath();
        for (let y = H; y >= 262; y -= 6) g.lineTo((320 - 18 - (H - y) * 0.05 + Math.sin(y / 20) * 6) * S, y * S);
        for (let y = 262; y <= H; y += 6) g.lineTo((320 + 18 + (H - y) * 0.05 + Math.sin(y / 20) * 6) * S, y * S);
        g.fill();
        g.fillStyle = 'rgba(80, 40, 90, 0.22)';
        g.fillRect(0, 0, W * S, H * S);
      },
      props,
      actors: [
        { name: 'firefly_big', path: (t) => [200 + Math.sin(t * 0.5) * 30, 230 + Math.cos(t * 0.8) * 12] },
        { name: 'firefly_big', t: 3, path: (t) => [450 + Math.cos(t * 0.4) * 36, 220 + Math.sin(t * 0.7) * 14] },
        { name: 'firefly', path: (t) => [300 + Math.sin(t * 0.7) * 50, 200 + Math.cos(t * 0.9) * 20] },
        { name: 'owl_idle', x: 600, y: 120, seq: (t) => (t % 5 < 0.4 ? 'owl_blink' : 'owl_idle'), fps: 6 },
        { name: 'squirrel_run', path: (t) => [100 + ((t * 30) % 420), 340] },
      ],
      over(g, S, tick) {
        for (const [x, y] of [[250, 120], [282, 104], [350, 110], [402, 96], [222, 92], [324, 94]]) glowSpot(g, S, x, y, 18, '255, 200, 110', 0.18 + 0.04 * Math.sin(tick / 6 + x));
      },
    });
  }

  // ---- 5. homestead garden: buildable plants & berries ---------------------
  {
    const props = [
      ['sugarmaple', 80, 160, false, [22, 6]], ['appletree', 200, 150, false, [20, 6]], ['applertree_bare', 300, 140, false, [20, 6]], ['beehive_tree', 420, 150, false, [20, 6]],
      ['sunflower', 500, 140], ['sunflower', 520, 150], ['sunflower', 540, 142], ['sapling_1', 600, 160],
      ['flowerbed_0', 120, 220], ['flowerbed_1', 170, 226], ['flowerbed_2', 220, 220], ['flowerbed_3', 276, 228], ['pumpkinpatch', 350, 230],
      ['raspberry', 60, 290], ['raspberry_picked', 100, 296], ['strawberry', 150, 300], ['strawberry_picked', 190, 306], ['saskatoon', 240, 296],
      ['saskatoon_picked', 280, 300], ['elderberry', 330, 300], ['elderberry_picked', 370, 306], ['cloudberry', 410, 300], ['cloudberry_picked', 440, 306],
      ['cranberry', 480, 304], ['cranberry_picked', 512, 308], ['goldenberry', 560, 300], ['goldenberry_picked', 600, 306],
      ['blueberry', 30, 330], ['cattailpatch', 470, 236], ['wildriceplot', 560, 236], ['woodpile', 610, 200], ['weed_0', 40, 230], ['weed_2', 420, 330],
    ];
    makeScene('garden', 'homestead garden: buildable plants & berries (mock scene)', 640, 350, {
      paint(g, S, W, H) {
        g.fillStyle = grassP;
        g.fillRect(0, 0, W * S, H * S);
        waterFill(g, S, () => blob(g, S, 520, 230, 80, 22, 0.08, 4));
        g.fillStyle = trailP;
        g.fillRect(0, 248 * S, W * S, 16 * S);
      },
      flats: [['plowed_0', 380, 186], ['lilypad_0', 520, 240], ['ripplering', 500, 226, 0, 3]],
      props,
      actors: [
        { name: 'bee', path: (t) => [430 + Math.sin(t * 2.3) * 14, 100 + Math.cos(t * 3.1) * 6] },
        { name: 'bee', t: 1, path: (t) => [520 + Math.cos(t * 2) * 16, 110 + Math.sin(t * 2.7) * 5] },
        { name: 'monarch', path: (t) => [200 + Math.sin(t * 0.7) * 30, 200 + Math.sin(t * 1.9) * 8] },
        { name: 'robin_hop', path: (t) => [600 - ((t * 10) % 300), 330], flip: true },
      ],
    });
  }
}

// --- sprite grid ---------------------------------------------------------
function spriteCell(name) {
  const fr = atlas.frames[name];
  const cell = document.createElement('div');
  cell.className = 'cell' + (WATERY.test(name) ? ' water' : NIGHT.test(name) ? ' night' : '');
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
const WATERY = /^(bogpad|algae|bubbles|puddle|ripple|rapids|steppingstone|seaweed|turtle_swim|beaver_swim|lilypad|duckweed)/;
const NIGHT = /^(giantshroom_glow|glowcap|spore|owl|firefly)/;
const GROUPS = [
  ['v3 mushroom forest', /^(giantshroom|shroomcluster|glowcap|mushlog|spore$)/],
  ['v3 swamp', /^(cypress|deadtree|swampgrass|bogpad|algae|pitcherplant|swampreeds|bubbles_swamp|frog_log)/],
  ['v3 water & land details', /^(puddle|ripplering|rapids|steppingstone|riverrock|driftwood_1)/],
  ['v3 weeds & plowing', /^(weed_|plowed)/],
  ['v3 demolish leftovers', /^(stump_1|stump_big|rubble|woodpile|chips)/],
  ['v3 the great willow', /^greatwillow/],
  ['v3 berries (full / picked)', /^(raspberry|strawberry|cranberry|saskatoon|cloudberry|elderberry|goldenberry|build_berrybush_)/],
  ['v3 buildable plants', /^(sugarmaple|appletree|applertree|flowerbed|seaweed|cattailpatch|wildriceplot|beehive_tree|sapling_1|pumpkinpatch|sunflower)/],
  ['v3 critters', /^(heron|turtle|beaver|owl|firefly_big)/],
  ['trees', /^(spruce|pine_|birch|maple|aspen|snag|sapling)/],
  ['bushes', /^(bush|blueberry|rose|sumac)/],
  ['ground cover', /^(tuft|tallgrass|clover|fern|mushroom|fireweed|lupine|daisy|susan|trillium|aster|dandelion)/],
  ['rocks & wood', /^(boulder|rock|pebble|mossrock|log|stump|pinecone|leaf|driftwood)/],
  ['water plants', /^(cattail|reeds|lily|duckweed|wildrice)/],
  ['birds', /^(bluejay|cardinal|chickadee|robin|crow|grayjay|goose|loon|mallard|hummingbird)/],
  ['bugs & critters', /./],
];
function addSprites() {
  // aliases share their target's frame array: list them instead of repeating
  const seen = new Map(), aliases = [];
  for (const n of NATURE_NAMES) {
    const f = atlas.frames[n];
    if (seen.has(f)) aliases.push(`${n} = ${seen.get(f)}`);
    else seen.set(f, n);
  }
  const names = (only || NATURE_NAMES).filter((n) => only || seen.get(atlas.frames[n]) === n);
  if (!only && aliases.length) {
    const d = document.createElement('div');
    d.className = 'sub';
    d.textContent = 'aliases (same frames): ' + aliases.join(', ');
    app.append(d);
  }
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
if ((section === 'all' || section === 'scene') && (!onlyScene || onlyScene === 'forest')) renderScene = buildScene();
if (section === 'all' || section === 'scene') buildBiomeScenes();
if (section === 'all' || section === 'sprites') addSprites();
if (section === 'all' || section === 'terrain') addTerrain();

let tick = 0;
if (renderScene) renderScene(freeze ?? 0);
for (const r of sceneRenders) r(freeze ?? 0);
setInterval(() => {
  tick++;
  if (freeze !== null) return;
  if (renderScene) renderScene(tick);
  for (const r of sceneRenders) r(tick);
  for (const a of anims) {
    const every = Math.max(1, Math.round(FPS / a.speed));
    if (tick % every === 0) a.draw(Math.floor(tick / every));
  }
}, 1000 / FPS);
window.__natureReady = true;
