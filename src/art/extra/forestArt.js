// Forest finds for the nature atlas (src/game/Forage.js picks them up) plus
// the tomato and cabbage garden crops.
//
// Pickups (ground anchored: ax = w / 2, ay = h)
//   forage_log_0 / _1          mossy fallen logs (wood)
//   forage_morel               a cluster of honeycomb morels on moss
//   forage_fiddlehead          curled fern crosiers in a papery crown
//   forage_ramps               wild garlic: broad leaves, red stems, white bulbs
//   forage_wildberry / _picked a bramble heavy with berries (and stripped bare)
//   forage_pinecone            a little heap of pinecones on needles
//   forage_resin / forage_stump an old stump weeping amber resin (and without)
// Ruins of old homesteads
//   ruin_floor                 flat, centre anchored: mossy flagstones, gaps
//   ruin_pillar / ruin_wall    a broken column and a crumbled wall stub
//   ruin_chair ruin_table ruin_clock ruin_lamp ruin_cart   the old furniture
// Crops (same tilled mound as cropArt.js, so stages swap in place)
//   crop_tomato_grow / _ripe   staked vines: flowers, then red tomatoes
//   crop_cabbage_grow / _ripe  blue-green heads with veined wrapper leaves
// PLANT_STAGES: tomato / cabbage (read by src/data/crops.js: keep it a plain
// literal and never import crops.js from here, it globs this folder).
// Style: natureArt / cropArt (top-left light, hue-shifted ramps, a 1 px
// outline darkened from the local colour, opaque or transparent pixels only).
// Nothing is drawn at import time; every sprite is built on first use.
import { PLANT_KIT } from './cropArt.js';

const { Px, clamp, mulberry, hash, hx, mix, pals, pick, INK, outline, natOutline, line, ellipse, ball, stamp, blade, leaf, dew, twinkle, toRGBA, mound, ridge, BW } = PLANT_KIT;

// ===========================================================================
// Palettes
// ===========================================================================
const BARK = pals(['#21151a', '#352320', '#4e3429', '#684734', '#835c40', '#9e7650', '#b89064']);
const RINGS = pals(['#6e4628', '#966236', '#bc8448', '#d8a862', '#ecc884', '#f8e4b0']);
const MOSS = pals(['#16301e', '#204424', '#2e5e2c', '#437a34', '#5e963e', '#80b24c', '#a8cc64']);
const FERN = pals(['#12301c', '#1c4a24', '#2a682c', '#408a34', '#5eaa3e', '#86c850', '#b4e278']);
const MOREL = pals(['#2a180e', '#46291a', '#684228', '#8c623c', '#b08a58', '#d2b07a', '#ecd6a4']);
const CREAM = pals(['#7a6450', '#a68e74', '#cbb698', '#e6d6b8', '#f8eedc']);
const RAMP = pals(['#123018', '#1c4a20', '#2a6a28', '#3e8c30', '#5aac3c', '#82c84c', '#b0e270']);
const WINE = pals(['#3a0a20', '#62142e', '#8c2240', '#b23a54', '#d26476']);
const BRAMBLE = pals(['#14281a', '#1e3e22', '#2c5a2a', '#3e7832', '#56963a', '#78b24a', '#a2cc66']);
const BERRY = pals(['#1a0616', '#3a0c26', '#62143a', '#8c2048', '#b8365a', '#e05e78', '#ff9cb0']);
const CONE = pals(['#2a160c', '#4a2a16', '#6e4222', '#946032', '#b8804a', '#d8a66c']);
const NEEDLE = pals(['#3a2a18', '#5a4224', '#7c5c32', '#9c7a44']);
const AMBER = pals(['#4a1c02', '#86400a', '#c06e10', '#e89a1e', '#ffc444', '#ffe68a', '#fffbe0']);
const STONE = pals(['#26232e', '#3c3842', '#57525a', '#757074', '#958e8e', '#b6aeaa', '#d6cec6']);
const VELVET = pals(['#2e0a18', '#4e1224', '#741c34', '#9a2c44', '#bc4858', '#da767c']);
const OAK = pals(['#24140e', '#3a2216', '#563420', '#74482a', '#946038', '#b47c4c', '#d29e68']);
const GREY_OAK = pals(['#2a2622', '#3e3830', '#57503f', '#706650', '#8a7f66', '#a69a80']);
const RUST = pals(['#2e140c', '#4e2212', '#76361a', '#9c5024', '#c07034', '#dc9852']);
const BRASS = pals(['#3a2810', '#62461a', '#8c6a28', '#b8923c', '#dcbc5c', '#f6e094']);
const GLASS = pals(['#2a3c48', '#46606e', '#6a8a96', '#9cbcc4', '#d4ecee']);
const TOMATO = pals(['#3e0808', '#7a1210', '#b8241a', '#e43e26', '#ff6a40', '#ffa678', '#ffe0cc']);
const UNRIPE = pals(['#1e3a14', '#34581c', '#4e7a26', '#6e9a34', '#98bc4c', '#c4dc7a']);
const VINE = pals(['#10281a', '#1a4022', '#285c28', '#3a7a30', '#52983a', '#74b44a', '#a0d06a']);
const CABBAGE = pals(['#12282a', '#1a3e3a', '#245a48', '#357656', '#4e9466', '#74b07a', '#a4cc98', '#d2ecc0']);
const CAB_HEART = pals(['#2c5a3a', '#467a46', '#68984e', '#90b864', '#bcd88a', '#e4f2b8']);
const WOODSTAKE = pals(['#3a2418', '#5a3a26', '#7e5636', '#a07448', '#c49a64']);

const GROUND = (p, f = 0.35) => { for (let x = 0; x < p.w; x++) if (p.on(x, p.h - 1)) p.set(x, p.h - 1, mix(p.get(x, p.h - 1), INK, f)); };
const RGBA = (p) => toRGBA(p, p.w / 2, p.h);
const FLAT = (p) => toRGBA(p, p.w / 2, p.h / 2);

// a flat lit ellipse of moss (patches under the pickups), lumpy rim
function mossPad(p, cx, cy, rx, ry, seed, pal = MOSS) {
  ellipse(p, cx, cy, rx, ry, (x, y, nx, ny) => {
    if (nx * nx + ny * ny > 0.82 && hash(x, y, seed) < 0.45) return null;
    return pick(pal, 0.15 - ny * 0.55 - nx * 0.25 + (hash(x, y, seed + 1) - 0.5) * 0.5);
  });
}

// ===========================================================================
// Fallen logs
// ===========================================================================
// a horizontal log: bark cylinder with furrows, a sawn ring end on the left,
// a splintered end on the right, moss creeping over the top
function fallenLog(W, H, seed, o = {}) {
  const p = new Px(W, H);
  const R = mulberry(seed);
  const r = (H - 3) / 2, cy = 2 + r;
  const ex = 2 + Math.round(r * 0.5), x1 = W - 3;
  for (let x = ex; x <= x1; x++) {
    const taper = x > x1 - 3 ? (x - (x1 - 3)) * 0.6 : 0;
    for (let y = Math.ceil(cy - r + taper); y <= Math.floor(cy + r - taper * 0.3); y++) {
      const ny = (y + 0.5 - cy) / r;
      const furrow = hash(Math.floor(x / 3 + hash(y, 0, seed) * 2.5), y >> 1, seed) < 0.26 ? -0.5 : 0;
      const knot = Math.hypot(x - W * 0.62, y - cy + 1) < 1.3 ? -0.7 : 0;
      p.set(x, y, pick(BARK, 0.25 - ny * 0.85 + furrow + knot + (hash(x, y, seed + 1) - 0.5) * 0.2));
    }
  }
  // snapped right end: jagged splinters, pale wood in the breaks
  for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
    const len = Math.floor(hash(y >> 1, 3, seed) * 3.5) - 1;
    for (let k = -2; k < len; k++) {
      if (k < 0 && hash(y, k + 9, seed) < 0.5) { p.set(x1 + 1 + k, y, pick(RINGS, 0.2 - (y > cy ? 0.6 : 0))); continue; }
      if (k >= 0) p.set(x1 + 1 + k, y, pick(BARK, 0.1 - k * 0.3 - (y > cy ? 0.4 : 0)));
    }
  }
  // sawn end: rings, a dark heart, bark rim
  const ew = Math.max(2.4, r * 0.62);
  ellipse(p, ex, cy, ew, r + 0.3, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > 0.82) return BARK[1];
    const ring = Math.floor(d * 4.4 + hash(x, y, seed) * 0.4) % 2;
    return RINGS[clamp(Math.round(4 - ring * 1.4 - ny * 1.2 - nx * 0.6 - (d < 0.18 ? 2 : 0)), 0, 5)];
  });
  // a crack in the end
  line(p, ex, cy, ex + 1, cy - r * 0.6, RINGS[0]);
  // moss blanket along the top, drooping in places
  for (let x = ex + 2; x < x1 - 1; x++) {
    if (hash(x >> 2, 1, seed) < 0.3) continue;
    const top = Math.ceil(cy - r);
    const d = 1 + Math.floor(hash(x, 2, seed) * 2) + (hash(x >> 1, 5, seed) < 0.25 ? 2 : 0);
    for (let k = -1; k < d; k++) p.set(x, top + k, pick(MOSS, 0.7 - k * 0.45 + (hash(x, k, seed) < 0.25 ? 0.4 : 0)));
  }
  // shelf fungus, a sprig, maybe a branch stub
  if (o.shelf) for (const [sx, sy] of o.shelf) stamp(p, ['.oOO', 'oOWW', '.oo.'], { o: '#a8743a', O: '#d8a456', W: '#f4dca0' }, sx, sy);
  if (o.stub) {
    const [bx, by] = o.stub;
    for (let k = 0; k < 4; k++) { p.set(bx + k, by - k, BARK[4 - (k >> 1)]); p.set(bx + k + 1, by - k, BARK[2]); }
    p.set(bx + 4, by - 4, RINGS[3]);
  }
  for (let i = 0; i < 2; i++) blade(p, Math.round(x1 - 6 - i * 3 - R() * 3), Math.floor(cy + r) + 1, 3 + R() * 3, (R() - 0.5) * 2.4, 0.8, 1, FERN);
  GROUND(p, 0.3);
  natOutline(p, { noBottom: true });
  // glossy dew on the moss
  p.set(ex + 6, Math.ceil(cy - r), 0xe8ffd0);
  return p;
}

// ===========================================================================
// Morels
// ===========================================================================
// a morel: a tall honeycomb cone (pits in a staggered grid) on a pale stem
function morel(p, cx, by, h, w, seed) {
  const stemH = Math.max(3, Math.round(h * 0.36));
  const sw = Math.max(1, Math.round(w * 0.42));
  for (let y = by - stemH; y <= by; y++)
    for (let x = Math.round(cx) - sw; x <= Math.round(cx) + sw - 1; x++) {
      const s = (x + 0.5 - cx) / sw;
      p.set(x, y, pick(CREAM, 0.6 - s * 0.9 - (y === by ? 0.7 : 0) + (y === by - 1 && s > 0 ? -0.3 : 0)));
    }
  const capB = by - stemH, capT = by - h;
  for (let y = capT; y <= capB; y++) {
    const t = (y - capT) / Math.max(1, capB - capT);
    const hw = w * (0.3 + 0.7 * Math.sqrt(t));
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw - 1); x++) {
      const s = (x + 0.5 - cx) / Math.max(1, hw);
      if (Math.abs(s) > 1.02) continue;
      // honeycomb: deep pits in a staggered grid, pale ridges between
      const row = Math.floor((y - capT) / 2);
      const pit = (y - capT) % 2 === 1 && ((x - Math.round(cx) + (row & 1) + 8) % 2 === 0);
      let v = 0.5 - s * 0.9 - t * 0.15 + (hash(x, row, seed) - 0.5) * 0.25;
      if (pit) v = -0.75 - s * 0.2;
      p.set(x, y, pick(MOREL, v));
    }
  }
  p.set(Math.round(cx - 1), capT + 1, MOREL[6]);
  p.set(Math.round(cx), capT - 1, MOREL[3]);
}
function morelCluster() {
  const W = 22, H = 19;
  const p = new Px(W, H);
  mossPad(p, 11, H - 3, 10, 2.6, 61);
  // three morels on their own, so each one keeps its outline
  for (const [x, by, h, w, sd] of [[5, H - 3, 10, 2.4, 1], [17, H - 2, 9, 2.2, 2], [11, H - 2, 15, 3, 3]]) {
    const m = new Px(W, H);
    morel(m, x, by, h, w, sd);
    outline(m);
    p.blit(m);
  }
  // a fallen leaf by the stems
  stamp(p, ['.aa', 'aAb', '.bs'], { a: '#e0782a', A: '#f8a040', b: '#b8561e', s: '#6a3a26' }, 1, H - 4);
  GROUND(p);
  outline(p);
  return p;
}

// ===========================================================================
// Fiddleheads
// ===========================================================================
// one crosier: a stem rising (with a slight lean) into a tight spiral head
function crosier(p, x0, y0, len, lean, dir) {
  const [tx, ty] = blade(p, x0, y0, len, lean, 0, 2, FERN, { bright: 0.15 });
  // the tight coil: a lit knob with a dark spiral groove, hooked over the stem
  const head = ['.hHHh.', 'hHddHh', 'Hdl.dH', 'Hd.ldH', 'hHddHh', '.hhh..'];
  const rows = dir > 0 ? head : head.map((r) => [...r].reverse().join(''));
  stamp(p, rows, { h: FERN[4], H: FERN[6], d: FERN[2], l: FERN[5] }, Math.round(tx) - (dir > 0 ? 1 : 4), Math.round(ty) - 5);
  // brown papery scales on the curl
  p.set(Math.round(tx) + dir * 2, Math.round(ty) - 1, hx('#8a6234'));
  p.set(Math.round(tx), Math.round(ty) - 2, hx('#a07a46'));
}
function fiddleheads() {
  const W = 24, H = 22;
  const p = new Px(W, H);
  const b = H - 3;
  // papery brown crown at the base
  ellipse(p, 12, b + 0.6, 7, 2.4, (x, y, nx, ny) => pick(pals(['#3a2414', '#5a3a1e', '#7c5630', '#a07a46', '#c49c62']), 0.2 - ny * 0.6 + (hash(x, y, 7) - 0.5) * 0.9));
  // two tiny unfurled fronds at the sides
  leaf(p, 5, b, Math.PI + 0.5, 5, 1.4, FERN, { frill: true, bright: 0.1 });
  leaf(p, 19, b, -0.45, 5, 1.4, FERN, { frill: true, bright: 0.15 });
  for (const [x, len, lean, dir] of [[6, 7, -1.4, -1], [18, 8, 1.4, 1], [11, 12, -0.5, 1], [14, 6, 0.4, -1]]) {
    const c = new Px(W, H);
    crosier(c, x, b, len, lean, dir);
    outline(c);
    p.blit(c);
  }
  GROUND(p);
  outline(p);
  return p;
}

// ===========================================================================
// Ramps (wild leeks)
// ===========================================================================
function ramps() {
  const W = 24, H = 18;
  const p = new Px(W, H);
  const b = H - 2;
  mossPad(p, 12, b, 10.5, 2.2, 71, pals(['#3a2a1a', '#54402a', '#6e5636', '#8a7046', '#a68a5a']));
  // broad glossy leaves fanning out of each plant
  const plants = [[6, -1], [12, 1], [18, -1]];
  for (const [x, s] of plants) {
    leaf(p, x, b - 2, -Math.PI / 2 - 0.55 * s - 0.25, 10, 2.6, RAMP, { bright: 0.12, fat: 1.05 });
    leaf(p, x, b - 2, -Math.PI / 2 + 0.6 * s + 0.1, 9, 2.4, RAMP, { bright: 0.2, fat: 1.05 });
  }
  leaf(p, 12, b - 3, -Math.PI / 2, 12, 2.7, RAMP, { bright: 0.28, fat: 1.05 });
  // wine-red stems and white bulbs at the base
  for (const [x] of plants) {
    for (let y = b - 4; y <= b - 1; y++) { p.set(x, y, pick(WINE, 0.4 - (y - b + 4) * 0.25)); p.set(x + 1, y, pick(WINE, -0.4)); }
    stamp(p, ['.WW.', 'WwwC', '.wC.'], { W: '#fffaf0', w: '#e8e0d4', C: '#bcae9c' }, x - 1, b - 1);
  }
  GROUND(p);
  outline(p);
  p.set(9, 6, 0xffffff);
  return p;
}

// ===========================================================================
// Wild berries (a bramble) and the picked bramble
// ===========================================================================
function bramble(full) {
  const W = 26, H = 21;
  const p = new Px(W, H);
  const R = mulberry(81);
  // arching canes
  for (const [x0, lean, len] of [[8, -5, 13], [13, 1, 16], [18, 6, 12]]) blade(p, x0, H - 1, len, lean, lean * 0.3, 1, pals(['#3a1a14', '#5a2a1c', '#7a3a24', '#9a5030']));
  // leaf clumps: lit blobs of serrated leaves
  const clumps = [[7, 11, 5.6, 4.4], [18, 10, 6, 4.6], [12.5, 7, 6.4, 4.8], [12, 14, 7.4, 4]];
  for (const [cx, cy, rx, ry] of clumps) {
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      ball(p, cx + Math.cos(a) * rx * d * 0.7, cy + Math.sin(a) * ry * d * 0.7, 2.4 + R(), 2 + R() * 0.6, BRAMBLE, { bias: 0.05 + (cy - 10) * 0.04, tex: 0.45, seed: i + cx });
    }
  }
  // serration: bright leaf tips around the rim
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (p.on(x, y) && !p.on(x, y - 1) && hash(x, y, 83) < 0.45) p.set(x, y - 1, BRAMBLE[5]);
  if (full) {
    // clusters of drupelet berries: dark purple, ripe red, a few pink
    const spots = [[5, 9], [10, 5], [16, 6], [20, 10], [8, 14], [15, 12], [19, 15], [12, 10]];
    spots.forEach(([x, y], i) => {
      const pal = i % 3 === 1 ? pals(['#4a0a14', '#8a1426', '#c42438', '#ec4a56', '#ff8a8a']) : BERRY;
      stamp(p, ['.ab.', 'abcb', 'bcbd', '.dd.'], { a: pal[pal.length - 1], b: pal[3], c: pal[2], d: pal[1] }, x - 1, y - 1);
    });
    // two white bramble flowers
    for (const [x, y] of [[22, 7], [3, 13]]) stamp(p, ['.w.', 'wyw', '.w.'], { w: '#fff8f4', y: '#f0c840' }, x, y);
  } else {
    // stripped: a few hard green berries and one red one left
    for (const [x, y] of [[9, 7], [17, 11], [12, 13]]) stamp(p, ['ab', 'bc'], { a: '#c4dc7a', b: '#88aa40', c: '#5a7a2a' }, x, y);
    stamp(p, ['ab', 'bc'], { a: '#ff8a8a', b: '#c42438', c: '#8a1426' }, 20, 13);
  }
  GROUND(p);
  outline(p);
  if (full) { p.set(10, 4, 0xffffff); twinkle(p, 23, 3); }
  return p;
}

// ===========================================================================
// Pinecones
// ===========================================================================
// one cone lying on its side: overlapping scales in a diamond pattern
function cone(dir, seed) {
  // one cone lying on its side: rows of chevron scales, lit tips, a stalk
  const p = new Px(13, 8);
  const L = 10, cy = 3.6;
  for (let s = 0; s < L; s++) {
    const t = s / (L - 1);
    const hw = 3.1 * Math.sin(Math.PI * Math.min(1, 0.22 + t * 0.85)) + 0.3;
    const x = dir > 0 ? 1 + s : 11 - s;
    for (let y = Math.floor(cy - hw + 0.5); y <= Math.ceil(cy + hw - 0.5); y++) {
      const ny = (y + 0.5 - cy) / hw;
      if (Math.abs(ny) > 1.05) continue;
      const gap = (s + (y & 1)) % 2 === 0;
      let v = 0.4 - ny * 0.85 + (gap ? -0.75 : 0.15) + (hash(x, y, seed) - 0.5) * 0.2;
      if (!gap && ny < 0) v += 0.3; // lit scale tips
      p.set(x, y, pick(CONE, v));
    }
  }
  p.set(dir > 0 ? 0 : 12, 4, CONE[2]);
  outline(p);
  return p;
}
function pinecones() {
  const W = 22, H = 13;
  const p = new Px(W, H);
  // needle litter
  for (let i = 0; i < 28; i++) {
    const x = 1 + Math.floor(hash(i, 1, 91) * (W - 3)), y = H - 1 - Math.floor(hash(i, 2, 91) * 3);
    const d = hash(i, 3, 91) < 0.5 ? 1 : -1;
    p.set(x, y, pick(NEEDLE, hash(i, 4, 91) * 2 - 1));
    p.set(x + d, y - (hash(i, 5, 91) < 0.5 ? 1 : 0), pick(NEEDLE, hash(i, 6, 91) * 2 - 1));
  }
  p.blit(cone(1, 2), 6, 0);
  p.blit(cone(1, 1), 0, 5);
  p.blit(cone(-1, 3), 9, 5);
  return p;
}

// ===========================================================================
// Old stump, with and without amber resin
// ===========================================================================
function oldStump(resin) {
  const W = 24, H = 22;
  const p = new Px(W, H);
  const cx = 12, rx = 7.4, topY = 7, ry = 3.2;
  // trunk with a root flare and deep bark ridges
  for (let y = topY; y < H; y++) {
    const t = (y - topY) / (H - 1 - topY);
    const w = rx + Math.pow(t, 2.6) * 3.6;
    for (let x = Math.floor(cx - w); x < Math.ceil(cx + w); x++) {
      const s = (x + 0.5 - (cx - w)) / (2 * w);
      const ridge = hash(Math.floor((x - cx) * 0.7 + 20), (y + x) >> 3, 101) < 0.3 ? -0.5 : 0;
      p.set(x, y, pick(BARK, 0.6 - s * 1.35 + ridge - (y > H - 3 ? 0.35 : 0)));
    }
  }
  // roots
  for (const [dx, len] of [[-1, 4], [1, 3]]) {
    const bx = cx + dx * (rx + 2);
    for (let k = 0; k < len; k++) { p.set(bx + dx * k, H - 1 - (k < 2 ? 1 : 0), pick(BARK, dx < 0 ? 0.2 : -0.4)); p.set(bx + dx * k, H - 1, pick(BARK, -0.6)); }
  }
  // the top: rings, a deep crack, a rotten heart
  ellipse(p, cx, topY, rx, ry, (x, y, nx, ny) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > 0.84) return BARK[ny > 0 ? 2 : 5];
    const ring = Math.floor(d * 4 + hash(x, y, 103) * 0.3) % 2;
    return RINGS[clamp(Math.round(4 - ring * 1.3 - nx * 0.7 - ny * 0.5 - (d < 0.25 ? 1.6 : 0)), 0, 5)];
  });
  line(p, cx - 1, topY - 2, cx + 2, topY + 1, RINGS[0]);
  line(p, cx + 2, topY + 1, cx + 2, topY + 5, BARK[0]);
  // moss on the shady side and a toadstool at the foot
  for (let y = topY + 2; y < H - 1; y++) for (let x = Math.ceil(cx + rx - 2); x < cx + rx + 2; x++) if (p.on(x, y) && hash(x, y, 105) < 0.55) p.set(x, y, pick(MOSS, 0.3 - (y - topY) * 0.06));
  stamp(p, ['.rr.', 'rWrr', '.cc.', '.c..'], { r: '#e8402e', W: '#fff6e8', c: '#efe2cc' }, 2, H - 5);
  if (resin) {
    // glossy amber resin oozing from a wound on the lit side, beading below
    const drips = [[6, topY + 3, 6], [8, topY + 4, 4], [10, topY + 2, 8], [4, topY + 5, 3]];
    for (const [x, y, len] of drips) {
      for (let k = 0; k < len; k++) {
        p.set(x, y + k, pick(AMBER, 0.65 - k * 0.12));
        p.set(x + 1, y + k, pick(AMBER, 0.05 - k * 0.12));
      }
      // a fat bead at the tip
      stamp(p, ['ab', 'bc', 'cd'], { a: AMBER[6], b: AMBER[4], c: AMBER[3], d: AMBER[1] }, x, y + len);
    }
    // the wound: dark wet bark edged in amber
    for (let y = topY + 1; y < topY + 4; y++) for (let x = 5; x < 11; x++) if (hash(x, y, 107) < 0.5) p.set(x, y, pick(AMBER, 0.3));
    p.set(10, topY + 2, AMBER[6]);
  }
  GROUND(p);
  natOutline(p, { noBottom: true });
  if (resin) { p.set(10, topY + 10, 0xffffff); twinkle(p, 3, 4); }
  return p;
}

// ===========================================================================
// Ruins: flagstone floor, column, wall
// ===========================================================================
// flat top-down flagstones in an irregular grid (Voronoi slabs), grout,
// cracked and missing stones, moss and grass in the joints
function ruinFloor() {
  const W = 56, H = 44;
  const p = new Px(W, H);
  const R = mulberry(211);
  // big slabs laid in rough courses
  const seeds = [];
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 5; gx++) seeds.push([(gx + 0.2 + R() * 0.6 + (gy & 1) * 0.4) * 11, (gy + 0.25 + R() * 0.5) * 11, R()]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // a rounded-rectangle footprint, crumbling at the edges
      const nx = (x + 0.5 - W / 2) / (W / 2), ny = (y + 0.5 - H / 2) / (H / 2);
      const e = Math.pow(Math.abs(nx), 5) + Math.pow(Math.abs(ny), 5);
      if (e > 0.82 + (hash(x >> 2, y >> 2, 213) - 0.5) * 0.35) continue;
      let d1 = 1e9, d2 = 1e9, best = null;
      for (const s of seeds) {
        const d = (x - s[0]) ** 2 + ((y - s[1]) * 1.25) ** 2;
        if (d < d1) { d2 = d1; d1 = d; best = s; } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      if (best[2] < 0.07) { if (hash(x, y, 214) < 0.5) p.set(x, y, pick(MOSS, (hash(x, y, 216) - 0.5) * 1.2)); continue; } // a lost slab, grass
      if (edge < 1.2) {
        // joints: dark grout, moss creeping along them
        p.set(x, y, hash(x >> 1, y >> 1, 215) < 0.4 ? pick(MOSS, -0.3) : pick(STONE, -0.9));
        continue;
      }
      // the slab: a lit top-left bevel, worn speckle
      const bev = edge < 2.4 ? (y < best[1] - 1 || x < best[0] - 3 ? 0.4 : -0.35) : 0;
      const tone = 0.05 + (best[2] - 0.5) * 0.5 + bev + (hash(x, y, 217) < 0.12 ? -0.3 : 0) + (hash(x, y, 218) < 0.06 ? 0.3 : 0);
      p.set(x, y, pick(STONE, tone));
    }
  // cracks
  for (let k = 0; k < 4; k++) {
    let x = 8 + R() * (W - 16), y = 8 + R() * (H - 16);
    for (let s = 0; s < 7; s++) { if (p.on(Math.floor(x), Math.floor(y))) p.set(Math.floor(x), Math.floor(y), STONE[0]); x += R() * 2 - 0.5; y += R() * 1.6 - 0.8; }
  }
  // moss creeping in from the lower right, clover in the joints
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!p.on(x, y)) continue;
      const m = Math.hypot((x - W * 0.85) / W, (y - H * 0.85) / H);
      if (m < 0.3 && hash(x, y, 219) < 0.8 - m * 2.4) p.set(x, y, pick(MOSS, 0.55 - m * 2 + (hash(x, y, 221) - 0.5) * 0.6));
    }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(6 + R() * (W - 12)), y = Math.floor(5 + R() * (H - 10));
    if (p.on(x, y)) stamp(p, ['.g.', 'gGg', '.g.'], { g: '#5e963e', G: '#a8cc64' }, x - 1, y - 1);
  }
  return p;
}
function ruinPillar() {
  const W = 16, H = 36;
  const p = new Px(W, H);
  // base plinth
  for (let y = H - 5; y < H; y++) for (let x = 1; x < W - 1; x++) p.set(x, y, pick(STONE, (y === H - 5 ? 0.6 : 0.1) - (x - 1) / (W - 2) * 0.9 + (hash(x, y, 231) - 0.5) * 0.25));
  // fluted shaft, snapped off at a jagged angle
  for (let y = 4; y < H - 5; y++) {
    for (let x = 3; x < W - 3; x++) {
      const jag = 4 + Math.round(Math.abs(Math.sin(x * 1.7)) * 2 + (x - 3) * 0.9);
      if (y < jag) continue;
      const s = (x + 0.5 - 3) / (W - 6);
      const flute = (x - 3) % 3 === 1 ? -0.35 : 0;
      p.set(x, y, pick(STONE, 0.75 - s * 1.5 + flute + (hash(x, y, 233) - 0.5) * 0.2));
    }
  }
  // the broken top face catches the light
  for (let x = 3; x < W - 3; x++) {
    const jag = 4 + Math.round(Math.abs(Math.sin(x * 1.7)) * 2 + (x - 3) * 0.9);
    p.set(x, jag, STONE[6]);
  }
  // ivy climbing the shady side, moss at the foot
  let ix = 10, iy = H - 6;
  for (let s = 0; s < 22; s++) {
    p.set(ix, iy, pick(FERN, 0.1));
    if (s % 3 === 0) stamp(p, ['.l', 'lL'], { l: FERN[4], L: FERN[2] }, ix - 1 + (s % 2) * 2, iy - 1);
    iy -= 1; ix += Math.round(Math.sin(s * 0.9));
    ix = clamp(ix, 6, 12);
  }
  for (let x = 1; x < W - 1; x++) if (hash(x, 1, 235) < 0.6) p.set(x, H - 1 - (hash(x, 2, 235) < 0.4 ? 1 : 0), pick(MOSS, 0.3));
  GROUND(p, 0.3);
  natOutline(p, { noBottom: true });
  return p;
}
function ruinWall() {
  const W = 36, H = 22;
  const p = new Px(W, H);
  // stacked fieldstone courses, crumbling down to the right
  const top = (x) => Math.round(3 + (x / W) * 9 + Math.abs(Math.sin(x * 0.9)) * 2 + (x > W - 8 ? (x - (W - 8)) * 1.2 : 0));
  for (let x = 1; x < W - 1; x++)
    for (let y = top(x); y < H; y++) {
      const row = Math.floor(y / 4), off = row % 2 ? 3 : 0;
      const brick = Math.floor((x + off) / 6);
      const mortar = y % 4 === 3 || (x + off) % 6 === 5;
      const tone = (hash(brick, row, 241) - 0.5) * 0.6 + (y % 4 === 0 ? 0.35 : 0) - (x / W) * 0.6;
      p.set(x, y, mortar ? pick(STONE, -0.7) : pick(STONE, 0.3 + tone));
    }
  // a few loose stones fallen at the foot
  for (const [x, y] of [[30, H - 3], [33, H - 2], [26, H - 2]]) stamp(p, ['.ab', 'abc', 'bcc'], { a: STONE[5], b: STONE[3], c: STONE[1] }, x, y - 1);
  // moss along the top, ivy curtains
  for (let x = 1; x < W - 1; x++) {
    const t = top(x);
    if (p.on(x, t) && hash(x, 3, 243) < 0.7) { p.set(x, t, pick(MOSS, 0.6)); if (hash(x, 4, 243) < 0.4) p.set(x, t + 1, pick(MOSS, 0.2)); }
  }
  for (const [x0, len] of [[5, 9], [13, 6], [9, 4]]) for (let k = 0; k < len; k++) { const x = x0 + (k % 3 === 1 ? 1 : 0), y = top(x0) + 1 + k; if (p.on(x, y)) { p.set(x, y, FERN[k % 2 ? 3 : 4]); if (k % 2) p.set(x + 1, y, FERN[2]); } }
  GROUND(p, 0.3);
  natOutline(p, { noBottom: true });
  return p;
}

// ===========================================================================
// Old furniture
// ===========================================================================
// broken armchair: faded velvet, torn seat spilling stuffing, carved oak
// legs (one snapped, so it slumps), moss on the cushion, a toadstool
function ruinChair() {
  const W = 26, H = 28;
  const p = new Px(W, H);
  // back: a tall rounded velvet panel in an oak frame (tilted a little)
  for (let y = 2; y < 17; y++)
    for (let x = 5; x < 21; x++) {
      const nx = (x + 0.5 - 13) / 8, ny = (y - 2) / 15;
      if (y < 6 && nx * nx + ((y - 6) / 4.2) ** 2 > 1) continue;
      const frame = Math.abs(nx) > 0.8 || y < 4;
      const tuft = (x - 7) % 4 === 0 && (y - 5) % 4 === 0;
      p.set(x + (y < 9 ? 1 : 0), y, frame ? pick(OAK, 0.4 - nx * 0.8) : pick(VELVET, 0.45 - nx * 0.6 - ny * 0.4 - (tuft ? 0.8 : 0)));
    }
  // arms
  for (const [x0, s] of [[2, 1], [20, -1]])
    for (let y = 12; y < 20; y++) for (let x = x0; x < x0 + 4; x++) p.set(x, y, y < 14 ? pick(OAK, 0.6 - (x - x0) * 0.2 * s) : pick(VELVET, 0.3 - (x - x0) * 0.25 * s - (y - 14) * 0.1));
  // seat cushion, torn open
  for (let y = 17; y < 21; y++) for (let x = 3; x < 23; x++) p.set(x, y, pick(VELVET, 0.55 - (y - 17) * 0.35 - (x - 3) / 20 * 0.5));
  ellipse(p, 10, 18.5, 3.2, 1.6, (x, y, nx, ny) => pick(CREAM, 0.6 - ny * 0.5 + (hash(x, y, 251) - 0.5) * 0.8));
  p.set(8, 17, CREAM[4]); p.set(12, 17, CREAM[3]);
  // apron and legs: the right front leg snapped, the chair slumps on it
  for (let y = 21; y < 23; y++) for (let x = 3; x < 23; x++) p.set(x, y + (x > 18 ? 1 : 0), pick(OAK, 0.2 - (y - 21) * 0.6 - (x - 3) / 20 * 0.4));
  for (const [x, len] of [[4, 5], [9, 4], [16, 4]]) for (let k = 0; k < len; k++) { p.set(x, 23 + k, pick(OAK, 0.3)); p.set(x + 1, 23 + k, pick(OAK, -0.4)); }
  stamp(p, ['ab', '.b', 'c.'], { a: OAK[5], b: OAK[3], c: RINGS[3] }, 20, 24); // the snapped stub
  // a broken leg lying on the ground
  line(p, 21, H - 1, 25, H - 2, OAK[4]);
  // moss on the seat and the arm, a toadstool growing from the cushion
  for (const [x, y] of [[15, 17], [16, 17], [17, 17], [18, 18], [3, 12], [4, 12], [21, 12]]) p.set(x, y, pick(MOSS, 0.5));
  stamp(p, ['.rr.', 'rWrr', '.c..'], { r: '#e8402e', W: '#fff6e8', c: '#efe2cc' }, 15, 14);
  GROUND(p);
  outline(p);
  p.set(9, 5, mix(VELVET[5], 0xffffff, 0.4));
  return p;
}
// rotten table: planked top with a gap, one leg gone so it tips onto a corner,
// moss and a fern underneath
function ruinTable() {
  const W = 34, H = 24;
  const p = new Px(W, H);
  const drop = (x) => Math.round(Math.max(0, x - 14) * 0.42); // the top tips down to the right
  // a fern under the table
  for (let i = 0; i < 4; i++) leaf(p, 12, H - 2, -Math.PI / 2 + (i - 1.5) * 0.6, 6, 1.4, FERN, { frill: true, bright: 0.1 });
  // back legs, then front legs (the right pair has rotted away)
  for (const [x, y0, tone] of [[8, 9, -0.4], [4, 12, 0.3], [13, 12, 0.3]]) for (let y = y0; y < H; y++) { p.set(x, y, pick(OAK, tone)); p.set(x + 1, y, pick(OAK, tone - 0.6)); }
  // the top: a planked surface seen from above (lit), then its front edge
  for (let x = 2; x < W - 2; x++) {
    const d = drop(x);
    for (let k = 0; k < 6; k++) {
      const y = 6 + k + d;
      const plank = Math.floor((x + (k > 2 ? 3 : 0)) / 8);
      if (x > 22 && x < 27 && k < 3) continue; // a rotten-through hole
      const seam = k === 3 || (x + (k > 2 ? 3 : 0)) % 8 === 7;
      p.set(x, y, pick(OAK, (seam ? -0.3 : 0.6 - k * 0.06) + (hash(plank, k, 261) - 0.5) * 0.35 - (x / W) * 0.3));
    }
    for (let k = 6; k < 9; k++) p.set(x, 6 + k + d, pick(OAK, -0.2 - (k - 6) * 0.35 - (x / W) * 0.3));
    if (hash(x, 1, 265) < 0.3) p.set(x, 6 + d + Math.floor(hash(x, 2, 265) * 4), pick(MOSS, 0.5));
  }
  // the broken leg lying in the grass, a shelf mushroom on the edge
  line(p, 24, H - 1, 31, H - 3, OAK[4]);
  line(p, 24, H - 2, 30, H - 4, OAK[3]);
  stamp(p, ['.oO', 'oOW'], { o: '#a8743a', O: '#d8a456', W: '#f4dca0' }, 16, 13);
  GROUND(p);
  outline(p);
  return p;
}
// old grandfather clock: leaning, dark carved case, cracked face, the glass
// door hanging open, a stopped pendulum, ivy round its feet
function ruinClock() {
  const W = 20, H = 44;
  const p = new Px(W, H);
  const lean = (y) => Math.round((H - y) * 0.09);
  const row = (y, x0, x1, fn) => { for (let x = x0; x < x1; x++) p.set(x + lean(y), y, fn(x, y)); };
  // bonnet with a broken scroll pediment
  for (let y = 2; y < 6; y++) row(y, 4 - (y > 3 ? 1 : 0), 16 + (y > 3 ? 1 : 0), (x) => pick(OAK, 0.6 - (x - 4) / 12 * 1.1 + (y === 2 ? 0.3 : 0)));
  for (const [x, y] of [[5, 1], [6, 0], [13, 1]]) p.set(x + lean(y), y, OAK[5]);
  // hood with the dial
  for (let y = 6; y < 16; y++) row(y, 3, 17, (x) => pick(OAK, 0.3 - (x - 3) / 14 * 1.1));
  for (let y = 7; y < 15; y++)
    for (let x = 5; x < 15; x++) {
      const nx = (x + 0.5 - 10) / 4.6, ny = (y + 0.5 - 11) / 4;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      p.set(x + lean(y), y, d > 0.72 ? BRASS[3 - (ny > 0 ? 1 : 0)] : pick(CREAM, 0.7 - ny * 0.3 - nx * 0.2));
    }
  // hour ticks, stopped hands, a crack through the glass
  for (const [x, y] of [[10, 8], [13, 11], [10, 14], [7, 11]]) p.set(x + lean(y), y, OAK[1]);
  line(p, 10 + lean(11), 11, 10 + lean(9), 9, INK);
  line(p, 10 + lean(11), 11, 12 + lean(12), 12, INK);
  line(p, 6 + lean(8), 8, 13 + lean(14), 14, mix(CREAM[2], INK, 0.3));
  // waist (trunk) with the pendulum door, its glass smashed
  for (let y = 16; y < 36; y++) row(y, 4, 16, (x) => pick(OAK, 0.25 - (x - 4) / 12 * 1.0 + (x === 4 ? 0.35 : 0)));
  for (let y = 18; y < 33; y++) row(y, 6, 14, (x) => pick(OAK, -0.6 - (x - 6) * 0.04));
  for (let y = 18; y < 31; y++) p.set(10 + lean(y), y, BRASS[2]);
  ellipse(p, 10 + lean(31), 31, 2.2, 2, (x, y, nx, ny) => pick(BRASS, 0.6 - nx * 0.6 - ny * 0.5));
  for (const [x, y] of [[6, 19], [7, 20], [12, 24], [13, 23], [7, 30]]) p.set(x + lean(y), y, GLASS[4]);
  // base and feet
  for (let y = 36; y < H - 1; y++) row(y, 3, 17, (x) => pick(OAK, 0.45 - (x - 3) / 14 * 1.2 - (y === 36 ? -0.3 : 0)));
  for (const x of [3, 15]) { p.set(x, H - 1, OAK[2]); p.set(x + 1, H - 1, OAK[1]); }
  // ivy curling round the base, moss on the bonnet
  for (let k = 0; k < 14; k++) {
    const x = 3 + Math.round(k * 0.95), y = H - 2 - Math.round(Math.abs(Math.sin(k * 0.8)) * 4);
    p.set(x + lean(y), y, FERN[k % 2 ? 3 : 5]);
  }
  for (const [x, y] of [[7, 2], [8, 2], [12, 2]]) p.set(x + lean(y), y, MOSS[4]);
  GROUND(p);
  outline(p);
  p.set(8 + lean(9), 9, 0xffffff);
  return p;
}
// rusty lantern knocked over on a mossy stone: iron cage, cracked glass,
// a stub of candle, the ring handle in the air
function ruinLamp() {
  const W = 18, H = 26;
  const p = new Px(W, H);
  // the mossy stone it was left on
  ellipse(p, 9, H - 3, 8, 3, (x, y, nx, ny) => pick(STONE, 0.45 - ny * 0.7 - nx * 0.4 + (hash(x, y, 271) - 0.5) * 0.3));
  for (let x = 2; x < 16; x++) if (hash(x, 1, 273) < 0.5) p.set(x, H - 6 + (hash(x, 2, 273) < 0.5 ? 1 : 0), pick(MOSS, 0.4));
  const lean = (y) => Math.round((H - 5 - y) * 0.12);
  const row = (y, x0, x1, fn) => { for (let x = x0; x < x1; x++) p.set(x + lean(y), y, fn(x)); };
  // ring handle, peaked cap, glass box in an iron cage, base
  for (const [x, y] of [[8, 1], [9, 1], [7, 2], [10, 2], [7, 3], [10, 3]]) p.set(x + lean(y), y, RUST[4]);
  row(4, 7, 11, (x) => pick(RUST, 0.6 - (x - 7) * 0.25));
  row(5, 5, 13, (x) => pick(RUST, 0.5 - (x - 5) * 0.18));
  row(6, 4, 14, (x) => pick(RUST, 0.2 - (x - 4) * 0.14));
  for (let y = 7; y < 16; y++) row(y, 5, 13, (x) => (x === 5 || x === 12 || x === 9) ? pick(RUST, x === 5 ? 0.4 : -0.3) : pick(GLASS, 0.7 - (x - 5) * 0.2 - (y > 12 ? 0.3 : 0)));
  for (let y = 16; y < 19; y++) row(y, 4, 14, (x) => pick(RUST, (y === 16 ? 0.5 : -0.1) - (x - 4) * 0.12));
  // a candle stub with a cold wick, cracks, a missing pane, rust streaks
  for (let y = 12; y < 16; y++) p.set(7 + lean(y), y, CREAM[4]);
  p.set(7 + lean(11), 11, INK);
  for (const [x, y] of [[10, 8], [11, 9], [10, 10], [11, 11]]) p.set(x + lean(y), y, GLASS[0]);
  for (let y = 9; y < 15; y++) p.set(12 + lean(y), y, RUST[1]);
  for (const [x, y] of [[6, 17], [11, 18], [13, 17]]) p.set(x + lean(y), y, RUST[1]);
  GROUND(p);
  outline(p);
  p.set(6 + lean(8), 8, 0xffffff);
  return p;
}
// old hand cart: plank bed with missing boards, one big spoked wheel with a
// broken spoke, long handles resting on the ground, wildflowers in the bed
function ruinCart() {
  const W = 40, H = 28;
  const p = new Px(W, H);
  // handles sloping down to the left
  for (const dy of [0, 2]) line(p, 2, H - 2 - dy, 14, 13 - dy, GREY_OAK[dy ? 2 : 4]);
  // the bed: a box of weathered planks
  for (let y = 8; y < 17; y++)
    for (let x = 11; x < 35; x++) {
      const plank = Math.floor((y - 8) / 3);
      if (plank === 1 && x > 24 && x < 30) continue; // missing board: see inside
      const seam = (y - 8) % 3 === 2;
      p.set(x, y, pick(GREY_OAK, (seam ? -0.5 : 0.35) - (x - 11) / 24 * 0.6 + (hash(x >> 2, plank, 281) - 0.5) * 0.4));
    }
  for (let x = 11; x < 35; x++) p.set(x, 7, pick(GREY_OAK, 0.8 - (x - 11) / 30));
  for (let y = 7; y < 17; y++) { p.set(11, y, GREY_OAK[5]); p.set(34, y, GREY_OAK[1]); }
  // rusty iron straps
  for (const x of [15, 31]) for (let y = 8; y < 17; y++) p.set(x, y, pick(RUST, 0.2 - (y - 8) * 0.08));
  // wildflowers and grass spilling out of the bed
  for (const [x, l, c] of [[14, 6, '#f4d040'], [18, 8, '#ffffff'], [22, 5, '#c86ae0'], [27, 7, '#ff8a6a'], [31, 6, '#ffffff']]) {
    const [tx, ty] = blade(p, x, 8, l, (hash(x, 1, 283) - 0.5) * 3, 0, 1, FERN);
    stamp(p, ['.f.', 'fyf', '.f.'], { f: c, y: c === '#f4d040' ? '#a86a10' : '#f0c840' }, Math.round(tx) - 1, Math.round(ty) - 1);
  }
  // the big wheel, with a broken spoke and a bent rim
  const wx = 25, wy = H - 8, wr = 7;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    const rr = wr + (a > 4.6 && a < 5.0 ? -0.8 : 0);
    const x = Math.floor(wx + Math.cos(a) * rr), y = Math.floor(wy + Math.sin(a) * rr * 0.95);
    p.set(x, y, pick(OAK, 0.4 - Math.cos(a) * 0.5 + Math.sin(a) * 0.4));
    p.set(Math.floor(wx + Math.cos(a) * (rr - 1)), Math.floor(wy + Math.sin(a) * (rr - 1) * 0.95), pick(RUST, 0.1 - Math.sin(a) * 0.3));
  }
  for (let s = 0; s < 8; s++) {
    if (s === 5) continue; // the broken spoke
    const a = (s / 8) * Math.PI * 2 + 0.2;
    line(p, wx, wy, wx + Math.cos(a) * (wr - 1), wy + Math.sin(a) * (wr - 1) * 0.95, OAK[s < 4 ? 4 : 2]);
  }
  line(p, wx, wy, wx + Math.cos(5 / 8 * Math.PI * 2 + 0.2) * 2, wy + Math.sin(5 / 8 * Math.PI * 2 + 0.2) * 2, OAK[3]);
  ellipse(p, wx, wy, 1.6, 1.6, (x, y, nx, ny) => pick(RUST, 0.6 - nx * 0.5 - ny * 0.5));
  // grass growing up through the spokes
  for (let i = 0; i < 6; i++) blade(p, 19 + i * 2.2, H - 1, 3 + hash(i, 2, 285) * 4, (hash(i, 3, 285) - 0.5) * 2, 0.6, 1, FERN);
  GROUND(p);
  outline(p);
  return p;
}

// ===========================================================================
// Crops: tomato vines and cabbages (on cropArt's tilled mound)
// ===========================================================================
// serrated compound leaf: a central rib with lobed leaflets
function tomatoLeaf(p, x, y, ang, len, pal) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let s = 0; s <= len; s++) {
    const px = x + dx * s, py = y + dy * s;
    p.set(Math.round(px), Math.round(py), pick(pal, 0.1));
    if (s % 2 === 1) {
      const w = 1.6 + Math.sin((s / len) * Math.PI) * 1.4;
      ball(p, px - dy * w * 0.8, py + dx * w * 0.8 - 0.6, w * 0.8, w * 0.6, pal, { bias: -0.1, tex: 0.5, seed: s + Math.round(x) });
      ball(p, px + dy * w * 0.8, py - dx * w * 0.8 - 0.6, w * 0.8, w * 0.6, pal, { bias: 0.15, tex: 0.5, seed: s + 9 + Math.round(y) });
    }
  }
}
function tomato(ripe) {
  const H = ripe ? 44 : 34;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const top = ripe ? 3 : 10;
  // two stakes with twine ties
  for (const x of [10, 24]) {
    for (let y = top; y < b + 3; y++) { p.set(x, y, WOODSTAKE[3]); p.set(x + 1, y, WOODSTAKE[1]); }
    p.set(x, top - 1, WOODSTAKE[4]);
  }
  // vines winding up both stakes, leaves all the way
  for (const [sx, ph] of [[10, 0], [24, 1.7]]) {
    let px = sx, py = b + 1;
    for (let s = 0; s <= b - top - 2; s++) {
      const x = sx + Math.sin(s * 0.42 + ph) * 2.2, y = b + 1 - s;
      line(p, px, py, x, y, (X2, Y2) => p.set(X2, Y2, VINE[3]));
      px = x; py = y;
      if (s % 5 === 2) tomatoLeaf(p, x, y, Math.sin(s + ph) > 0 ? -0.35 : Math.PI + 0.35, ripe ? 6 : 5, VINE);
      if (s % 7 === 4) stamp(p, ['p.p', '.y.', 'p.p'], { p: '#fff0a0', y: '#f0c020' }, Math.round(x) - 1, Math.round(y) - 1);
    }
    for (let y = b - 3; y > top + 4; y -= 9) { p.set(sx - 1, y, hx('#e8d8b0')); p.set(sx + 2, y, hx('#e8d8b0')); }
  }
  if (ripe) {
    // trusses of glossy red tomatoes (and a green one or two)
    const fruit = [[7, b - 9, 3.3, 1], [13, b - 14, 3.1, 1], [27, b - 8, 3.4, 1], [21, b - 19, 3, 1], [8, b - 24, 2.8, 1], [26, b - 27, 2.7, 0], [15, b - 29, 2.6, 1], [12, b - 5, 2.6, 0]];
    for (const [x, y, r, red] of fruit) {
      ball(p, x, y, r, r * 0.92, red ? TOMATO : UNRIPE, { bias: -0.05, k: 1.6 });
      p.set(Math.round(x - r * 0.4), Math.round(y - r * 0.4), red ? TOMATO[6] : UNRIPE[5]);
      stamp(p, ['g.g', '.G.'], { g: VINE[4], G: VINE[2] }, Math.round(x) - 1, Math.round(y - r) - 1);
    }
  } else {
    // small green fruit just setting
    for (const [x, y] of [[8, b - 8], [26, b - 11], [14, b - 15]]) ball(p, x, y, 1.8, 1.7, UNRIPE, { bias: 0 });
  }
  outline(p);
  if (ripe) twinkle(p, 30, 12);
  return p;
}
// one cabbage head: wrapper leaves fanned out round a tight veined heart
function cabbageHead(p, cx, cy, r, seed, ripe) {
  const R = mulberry(seed);
  const n = ripe ? 9 : 7;
  for (let i = 0; i < n; i++) {
    const a = Math.PI + 0.15 + (i / (n - 1)) * (Math.PI - 0.3) + (R() - 0.5) * 0.2;
    leaf(p, cx + Math.cos(a) * r * 0.3, cy + 0.6, a, r * 1.35, r * 0.62, CABBAGE, { frill: true, bright: 0.05 });
  }
  // lower leaves spreading on the soil
  leaf(p, cx - 1, cy + 1, Math.PI - 0.1, r * 1.3, r * 0.5, CABBAGE, { frill: true, bright: -0.1 });
  leaf(p, cx + 1, cy + 1, 0.1, r * 1.3, r * 0.5, CABBAGE, { frill: true, bright: -0.05 });
  // the heart
  ball(p, cx, cy - r * 0.15, r * (ripe ? 0.82 : 0.6), r * (ripe ? 0.72 : 0.52), ripe ? CAB_HEART : CABBAGE, { bias: -0.15, k: 1.5 });
  // veins
  const hr = r * (ripe ? 0.82 : 0.6);
  for (const a of [-2.4, -1.6, -0.8]) line(p, cx, cy + hr * 0.4, cx + Math.cos(a) * hr * 0.8, cy - r * 0.15 + Math.sin(a) * hr * 0.7, CAB_HEART[5]);
}
function cabbage(ripe) {
  const H = ripe ? 24 : 19;
  const p = new Px(BW, H);
  mound(p);
  const b = ridge(H);
  const heads = ripe ? [[9, b - 2, 5.4], [25, b - 2, 5.2], [17, b - 4, 6.2]] : [[10, b - 1, 3.6], [24, b - 1, 3.6], [17, b - 2, 4.2]];
  heads.forEach(([x, y, r], i) => cabbageHead(p, x, y, r, 300 + i, ripe));
  if (ripe) for (const [x, y] of [[7, b - 5], [19, b - 8]]) dew(p, x, y);
  // a cabbage white butterfly resting on a ripe head
  if (ripe) stamp(p, ['w.w', 'wkw', '.k.'], { w: '#fbf8f0', k: '#3a3440' }, 22, b - 11);
  outline(p);
  if (ripe) twinkle(p, 4, 6);
  return p;
}

// ===========================================================================
// Registry
// ===========================================================================
const OUT = {};
const once = (fn) => { let c = null; return () => (c ||= fn()).map((f) => ({ ...f, data: f.data.slice() })); };
OUT.forage_log_0 = once(() => [RGBA(fallenLog(44, 15, 3301, { shelf: [[24, 8]] }))]);
OUT.forage_log_1 = once(() => [RGBA(fallenLog(36, 14, 3307, { stub: [20, 4] }))]);
OUT.forage_morel = once(() => [RGBA(morelCluster())]);
OUT.forage_fiddlehead = once(() => [RGBA(fiddleheads())]);
OUT.forage_ramps = once(() => [RGBA(ramps())]);
OUT.forage_wildberry = once(() => [RGBA(bramble(true))]);
OUT.forage_wildberry_picked = once(() => [RGBA(bramble(false))]);
OUT.forage_pinecone = once(() => [RGBA(pinecones())]);
OUT.forage_resin = once(() => [RGBA(oldStump(true))]);
OUT.forage_stump = once(() => [RGBA(oldStump(false))]);
OUT.ruin_floor = once(() => [FLAT(ruinFloor())]);
OUT.ruin_pillar = once(() => [RGBA(ruinPillar())]);
OUT.ruin_wall = once(() => [RGBA(ruinWall())]);
OUT.ruin_chair = once(() => [RGBA(ruinChair())]);
OUT.ruin_table = once(() => [RGBA(ruinTable())]);
OUT.ruin_clock = once(() => [RGBA(ruinClock())]);
OUT.ruin_lamp = once(() => [RGBA(ruinLamp())]);
OUT.ruin_cart = once(() => [RGBA(ruinCart())]);
OUT.crop_tomato_grow = once(() => [RGBA(tomato(false))]);
OUT.crop_tomato_ripe = once(() => [RGBA(tomato(true))]);
OUT.crop_cabbage_grow = once(() => [RGBA(cabbage(false))]);
OUT.crop_cabbage_ripe = once(() => [RGBA(cabbage(true))]);
export const EXTRA_SPRITES = OUT;

export const PLANT_STAGES = {
  tomato: ['crop_seed', 'crop_sprout', 'crop_tomato_grow', 'crop_tomato_ripe'],
  cabbage: ['crop_seed', 'crop_sprout', 'crop_cabbage_grow', 'crop_cabbage_ripe'],
};
// leaf / produce colours for particles and UI (like cropArt's CROP_ART)
export const FOREST_CROP_ART = {
  tomato: { colors: ['#3a7a30', '#e43e26'], grow: 'crop_tomato_grow', ripe: 'crop_tomato_ripe' },
  cabbage: { colors: ['#357656', '#a4cc98'], grow: 'crop_cabbage_grow', ripe: 'crop_cabbage_ripe' },
};
