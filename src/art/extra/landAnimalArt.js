// Land animals (rabbits, hares, rodents and friends), hand-built pixel art,
// side view facing RIGHT. See src/data/landAnimals.js.
//
// How it works
//   * Every body type ("rig") is a set of small ASCII stamps (body poses,
//     heads, ears, tails, legs) whose letters name fur regions (back, haunch,
//     belly, cheek, muzzle, inner ear ...). Frames are compositions of stamps
//     with per-frame offsets, so one head drawing shows up in every frame.
//   * A species is a rig + variant options + a palette: region letter ->
//     colour, an alias to another letter, a pattern ({ c, p, pat }) or null.
//   * shade() turns the region grid into RGBA. Each stamp region (head,
//     haunch, ear, leg ...) gets its own rounded normal from its silhouette
//     (parts drawn in front count as solid, parts behind as empty), giving
//     3-4 tone ramps lit from the top left, a crease where a front part casts
//     its shadow on the part behind, and a 1 px outline tinted by the colour
//     it surrounds.
//
// Contract (see natureArt.js): EXTRA_SPRITES[name]() -> [{ w, h, data, ax, ay }]
// with pixels fully opaque or fully transparent. Every sprite is ground
// anchored: ay = h (feet on the bottom row), ax = w / 2 sits on the body's
// centre in every animation, so switching animations or flipping the sprite
// to face left does not shift the animal.

// ---------------------------------------------------------------- colour
const hx = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const WARM = [255, 246, 214], SHADE = [46, 34, 88], DEEP = [26, 18, 50], INK = [16, 10, 26];

const RAMPS = new Map();
function ramp(spec) {
  const key = Array.isArray(spec) ? spec.join() : spec;
  let r = RAMPS.get(key);
  if (r) return r;
  if (Array.isArray(spec)) {
    const [hi, mid, sh, dp, ol] = spec.map(hx);
    r = { hi, mid, sh, dp: dp || mix(sh, DEEP, 0.45), ol: ol || mix(mid, INK, 0.7) };
  } else {
    const b = hx(spec), L = lum(b);
    r = {
      hi: L > 0.86 ? mix(b, [255, 255, 255], 0.7) : L < 0.2 ? mix(b, [130, 140, 186], 0.24) : mix(b, WARM, 0.3),
      mid: b,
      sh: mix(b, SHADE, L > 0.86 ? 0.2 : L < 0.2 ? 0.34 : 0.26),
      dp: mix(b, DEEP, L > 0.86 ? 0.36 : L < 0.2 ? 0.55 : 0.46),
      ol: mix(b, INK, L > 0.86 ? 0.66 : L < 0.2 ? 0.6 : 0.72),
    };
  }
  RAMPS.set(key, r);
  return r;
}
const DARKER = new WeakMap();
function darker(r) {
  let d = DARKER.get(r);
  if (!d) DARKER.set(r, (d = { hi: r.mid, mid: r.sh, sh: r.dp, dp: mix(r.dp, INK, 0.4), ol: r.ol }));
  return d;
}

// ---------------------------------------------------------------- regions
// fur    b back / rump  u shoulder / front body  s flank  h haunch (own round
//        mass)  y belly  j chest / chin  w white marking  x dark stripe
//        z light stripe  M mane (lionhead ruff, face fluff)
// head   c crown  f cheek  m muzzle  a eye ring  Z blaze  B blush  K stuffed cheek
//        n nose  e eye  E eye glint
// ears   o outer  O rim / dark tip  i inner  p far ear
// tail   t tail  r tail tip / underside  v scaly tail
// legs   l front leg  k hind leg / foot  g far legs (behind the body)
// other  q quills  Q quill tips  G gliding membrane  d toes / claws
//        W whiskers  T teeth  L thin tail (1 px, no outline)  1 2 3 food
const ROLE = {};
for (const k of 'busyjwxzM') ROLE[k] = 'body';
ROLE.h = 'haunch';
for (const k of 'cfmaBKZ') ROLE[k] = 'head';
ROLE.n = 'nose'; ROLE.e = 'eye'; ROLE.E = 'eye';
for (const k of 'oOip') ROLE[k] = 'ear';
for (const k of 'trv') ROLE[k] = 'tail';
for (const k of 'lkg') ROLE[k] = 'leg';
for (const k of 'dWTL') ROLE[k] = 'thin';
ROLE.q = 'quill'; ROLE.Q = 'quill'; ROLE.G = 'glide';
for (const k of '123') ROLE[k] = 'food';
// normal groups: eyes and noses belong to the head, inner ears to the ear
const GROUP = { body: 0, haunch: 1, head: 2, nose: 2, eye: 2, ear: 3, tail: 4, leg: 5, quill: 0, glide: 6, food: 7, thin: -1 };
// depth inside one stamp (stamps drawn later are in front of earlier ones)
const LZ = { g: -3, p: -2, t: -1, r: -1, v: -1, h: 3, l: 4, k: 2, M: -1, c: 1, f: 1, m: 1, a: 1, B: 1, K: 1, Z: 1, n: 1, e: 1, E: 1, o: 0.5, O: 0.5, i: 0.5 };
const FALLBACK = {
  u: 'b', s: 'b', h: 'b', y: 'b', j: 'y', w: 'y', x: { dark: 'b' }, z: 'y', M: 'c',
  c: 'b', f: 'c', m: 'f', a: 'f', B: 'f', K: 'f', Z: 'c', n: '#e88a9a', e: '#140c16', E: '#ffffff',
  o: 'c', O: 'o', i: '#f0a8b0', p: { dark: 'o' },
  t: 'b', r: 't', v: '#8a7a80', l: 'b', k: 'l', g: { dark: 'l' },
  q: '#5a4a44', Q: '#f2ead8', G: 'b', d: '#3a2a2a', W: '#f4ecdc', T: '#fff8e8', L: '#c89a94',
  1: '#6cbc48', 2: { dark: '1' }, 3: '#b8e878',
};

function resolve(pal, key, depth = 0) {
  const v = key in pal ? pal[key] : FALLBACK[key];
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.length === 1) return depth > 12 ? null : resolve(pal, v, depth + 1);
  if (v.dark && typeof v.dark === 'string' && v.dark.length === 1) { const r = resolve(pal, v.dark, depth + 1); return r && { dark: r }; }
  return v;
}
// patterns are evaluated in stamp coordinates so they stick to the part
const PAT = {
  check: (x, y) => (x + y) % 2 === 0,
  fleck: (x, y) => (x * 7 + y * 13) % 9 === 0,
  tick: (x, y) => (x * 5 + y * 3) % 7 === 0 && y % 2 === 0,
  bar: (x, y) => y % 2 === 0,
  ring: (x) => x % 2 === 0,
  scale: (x, y) => (x + y * 2) % 3 === 0,
  quill: (x, y) => (((x - 2 * y) % 5) + 5) % 5 === 0,
};
const patterned = (s) => (s.dark ? patterned(s.dark) : typeof s === 'object' && !Array.isArray(s));
function rampAt(spec, x, y) {
  if (spec.dark) { const r = rampAt(spec.dark, x, y); return r && darker(r); }
  if (typeof spec === 'object' && !Array.isArray(spec)) { const c = PAT[spec.pat](x, y) ? spec.p : spec.c; return c ? rampAt(c, x, y) : null; }
  return ramp(spec);
}

// ---------------------------------------------------------------- stamps
// A stamp is an array of strings; '.' and ' ' are transparent.
function stampBox(rows) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.' || ch === ' ') return;
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
  }));
  return { x0, y0, x1, y1 };
}

// stamp edits, so squash / stretch / blink frames reuse one drawing
const widthOf = (rows) => Math.max(...rows.map((r) => r.length));
const padded = (rows) => { const w = widthOf(rows); return rows.map((r) => r.padEnd(w, '.')); };
const dupRow = (rows, k, n = 1) => { const r = padded(rows); return [...r.slice(0, k + 1), ...Array(n).fill(r[k]), ...r.slice(k + 1)]; };
const delRow = (rows, ...ks) => rows.filter((_, j) => !ks.includes(j));
const dupCol = (rows, k, n = 1) => padded(rows).map((r) => r.slice(0, k + 1) + r[k].repeat(n) + r.slice(k + 1));
const delCol = (rows, ...ks) => padded(rows).map((r) => [...r].filter((_, i) => !ks.includes(i)).join(''));
const swap = (rows, map) => rows.map((r) => [...r].map((ch) => (ch in map ? map[ch] : ch)).join(''));
// overlay `sub` with its top-left at (x, y): '.' keeps the pixel, ' ' clears it
function patch(rows, x, y, sub) {
  const out = padded(rows).map((r) => [...r]);
  sub.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    const Y = y + j, X = x + i;
    while (out.length <= Y) out.push([]);
    while (out[Y].length <= X) out[Y].push('.');
    out[Y][X] = ch === ' ' ? '.' : ch;
  }));
  return padded(out.map((r) => r.join('')));
}
// remove every pixel whose letter is in `letters`
const strip = (rows, letters) => rows.map((r) => [...r].map((ch) => (letters.includes(ch) ? '.' : ch)).join(''));
// draw `sub` at (x, y) only where `rows` is empty (behind the picture)
function under(rows, x, y, sub) {
  const out = padded(rows).map((r) => [...r]);
  let w = out[0].length;
  sub.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.' || ch === ' ') return;
    const Y = y + j, X = x + i;
    while (out.length <= Y) out.push(Array(w).fill('.'));
    if (X >= w) { for (const row of out) while (row.length <= X) row.push('.'); w = X + 1; }
    if (Y >= 0 && X >= 0 && out[Y][X] === '.') out[Y][X] = ch;
  }));
  return padded(out.map((r) => r.join('')));
}
// closed eye: the upper eye row becomes fur, the lower one a lash line
function blink(rows, fur = 'c') {
  const eyeRows = rows.map((r, j) => (/[eE]/.test(r) ? j : -1)).filter((j) => j >= 0);
  if (!eyeRows.length) return rows;
  const top = eyeRows[0], bot = eyeRows[eyeRows.length - 1];
  return rows.map((r, j) => (j === bot ? r.replace(/E/g, 'e') : j >= top && j < bot ? r.replace(/[eE]/g, fur) : r));
}
// move every pixel of letter `ch` by (dx, dy); the hole is filled with `fill`
function nudge(rows, ch, dx, dy, fill) {
  const src = padded(rows), out = src.map((r) => [...r]);
  src.forEach((r, j) => [...r].forEach((c, i) => { if (c === ch) out[j][i] = fill; }));
  src.forEach((r, j) => [...r].forEach((c, i) => { if (c === ch && out[j + dy] && out[j + dy][i + dx] !== undefined) out[j + dy][i + dx] = ch; }));
  return out.map((r) => r.join(''));
}

// frame spec: [[stampName, x, y, { under, flip }], ...] in rig coordinates
// (ground row = rig.ground). Later stamps are drawn in front; `under` stamps
// only fill empty pixels and count as behind everything.
function composeAnim(rig, specs) {
  let X0 = 1e9, Y0 = 1e9, X1 = -1e9;
  for (const spec of specs) for (const [n, x, y] of spec) {
    const st = rig.stamps[n];
    if (!st) throw new Error('landAnimalArt: no stamp ' + n);
    const b = stampBox(st);
    if (b.x1 < 0) continue;
    X0 = Math.min(X0, x + b.x0); X1 = Math.max(X1, x + b.x1); Y0 = Math.min(Y0, y + b.y0);
    if (y + b.y1 > rig.ground) throw new Error(`landAnimalArt: ${n} reaches below the ground`);
  }
  // 1 px border for the outline (none below the ground row)
  const ox = 1 - X0, oy = 1 - Y0;
  const W = X1 - X0 + 3, H = rig.ground - Y0 + 2;
  const grids = specs.map((spec) => {
    const cells = new Array(W * H).fill(null);
    spec.forEach(([n, x, y, o = {}], si) => {
      const rows = rig.stamps[n];
      const sw = widthOf(rows);
      rows.forEach((r, j) => {
        for (let i = 0; i < sw; i++) {
          const ch = r[o.flip ? sw - 1 - i : i];
          if (ch === undefined || ch === '.' || ch === ' ') continue;
          const X = x + i + ox, Y = y + j + oy;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const k = Y * W + X;
          if (o.under && cells[k]) continue;
          cells[k] = { ch, si: o.under ? -1 - si : si, sx: i, sy: j };
        }
      });
    });
    return cells;
  });
  return { grids, W, H, ax: rig.ax + ox };
}

// ---------------------------------------------------------------- shading
const NO_OUTLINE = new Set(['eye', 'thin']);
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const NB = [];
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) NB.push([dx, dy, dx / (dx * dx + dy * dy), dy / (dx * dx + dy * dy)]);
const STEP = { hi: 'mid', mid: 'sh', sh: 'dp', dp: 'dp' };

function shade(cells, W, H, pal) {
  const N = W * H;
  const rp = new Array(N).fill(null), role = new Array(N).fill(null);
  const grp = new Int32Array(N).fill(-1), z = new Float32Array(N);
  const memo = new Map();
  for (let i = 0; i < N; i++) {
    const c = cells[i];
    if (!c) continue;
    let e = memo.get(c.ch);
    if (e === undefined) {
      const s = resolve(pal, c.ch);
      memo.set(c.ch, (e = s && { s, fixed: patterned(s) ? null : rampAt(s, 0, 0) }));
    }
    if (!e) continue;
    const R = e.fixed || rampAt(e.s, c.sx, c.sy);
    if (!R) continue;
    rp[i] = R;
    const ro = ROLE[c.ch] || 'body';
    role[i] = ro;
    grp[i] = GROUP[ro] < 0 ? -1 : (c.si + 64) * 16 + GROUP[ro];
    z[i] = c.si * 10 + (LZ[c.ch] || 0);
  }
  const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && rp[y * W + x] !== null;
  // is (x, y) solid as seen from pixel i: same group, or a part in front of it
  const solid = (i, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const j = y * W + x;
    if (rp[j] === null || grp[j] < 0) return false;
    return grp[j] === grp[i] || z[j] > z[i];
  };
  const out = new Uint8ClampedArray(N * 4);
  const put = (i, c) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (rp[i] === null) continue;
    const R = rp[i], ro = role[i];
    if (ro === 'eye' || ro === 'thin') { put(i, R.mid); continue; }
    let nx = 0, ny = 0;
    for (let k = 0; k < NB.length; k++) if (!solid(i, x + NB[k][0], y + NB[k][1])) { nx += NB[k][2]; ny += NB[k][3]; }
    const m = Math.hypot(nx, ny);
    let t = 'mid';
    const up = !solid(i, x, y - 1), lf = !solid(i, x - 1, y), dn = !solid(i, x, y + 1), rt = !solid(i, x + 1, y);
    if (m > 0.3) {
      const d = -(nx + ny) / (m * Math.SQRT2);
      if (d > 0.25 && (up || lf)) t = 'hi';
      else if (d < -0.25 && (dn || rt)) t = dn && d < -0.6 ? 'dp' : 'sh';
    }
    // a part in front casts a soft shadow on this one (below / right of it)
    const front = (X, Y) => { if (!op(X, Y)) return false; const j = Y * W + X; return grp[j] >= 0 && grp[j] !== grp[i] && z[j] > z[i] && role[j] !== 'eye'; };
    if (front(x, y - 1) || front(x - 1, y)) t = STEP[t];
    if (ro === 'nose') t = up ? 'hi' : 'mid';
    put(i, R[t]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (rp[i] !== null) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let k = 0; k < 4; k++) {
      const X = x + N4[k][0], Y = y + N4[k][1];
      if (!op(X, Y)) continue;
      const j = Y * W + X;
      if (NO_OUTLINE.has(role[j])) continue;
      const o = rp[j].ol;
      r += o[0]; g += o[1]; b += o[2]; n++;
    }
    if (n) put(i, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  }
  return out;
}

// crop every frame of an animation to their union box (the bottom row stays
// the ground) and pad left/right so the rig anchor sits at ax = w / 2
function finish(datas, W, H, ax) {
  let x0 = W, y0 = H, x1 = -1;
  for (const d of datas) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
  const left = ax - x0, right = x1 + 1 - ax;
  const half = Math.ceil(Math.max(left, right));
  const w = half * 2, h = H - 1 - y0; // drop the empty outline row under the ground
  const sx = Math.round(ax - half);
  return datas.map((d) => {
    const o = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x + sx, Y = y + y0;
      if (X < 0 || X >= W) continue;
      for (let c = 0; c < 4; c++) o[(y * w + x) * 4 + c] = d[(Y * W + X) * 4 + c];
    }
    return { w, h, data: o, ax: w / 2, ay: h };
  });
}

// anchor x: mean x of the body + head pixels over the animation, so every
// animation of a species is centred on the same spot (no jump on switching
// animations or flipping); tails, ears and food don't pull it around
const MASS = new Set(['body', 'haunch', 'head', 'nose', 'eye', 'quill', 'leg']);
function buildAnim(rig, specs, pal) {
  const { grids, W, H } = composeAnim(rig, specs);
  let sx = 0, n = 0;
  for (const g of grids) g.forEach((c, i) => { if (c && MASS.has(ROLE[c.ch] || 'body') && resolve(pal, c.ch)) { sx += (i % W) + 0.5; n++; } });
  return finish(grids.map((g) => shade(g, W, H, pal)), W, H, Math.round(sx / n));
}

// ================================================================ rigs
// ---------------------------------------------------------------- rabbit
// Cottontail-sized rabbit (18 x 16); the tame bunnies are variants of it.
// Rig coordinates: ground row 14, the sitting body spans x 0..13. Body
// stamps mark the front half (shoulders / collar) with 'u' and the rear
// with 'b' so the Dutch rabbit can wear its tuxedo; the face has a blaze
// ('Z', crown colour unless the palette says otherwise).
const RB = {};
RB.tail = [
  '.tt.',
  'tttt',
  'rttt',
  '.rr.',
];
RB.sit = [
  '....bbbuuu....',
  '..bbbbbuuuu...',
  '.bbhhhbuuuuu..',
  '.bhhhhhbuuujj.',
  '.bhhhhhhuujjjj',
  '.bhhhhhhuuyjl.',
  '.bhhhhhhuyyll.',
  '..hhhhhhyyyll.',
  '..kkkkkkkk.ll.',
];
RB.sitIn = dupRow(RB.sit, 2);
RB.crouch = [
  '....bbbbuuu....',
  '..bbbhhhbuuuu..',
  '.bbhhhhhhuuuujj',
  '.bhhhhhhhuuujjj',
  '.bhhhhhhhuuyjl.',
  '.bhhhhhhhuyyll.',
  '..hhhhhhhyyyll.',
  '.kkkkkkkkkk.ll.',
];
RB.launch = [
  '..........uuu...',
  '........buuuuu..',
  '......bbbuuuuu..',
  '....bbbbbbuuuuj.',
  '...bbhhhhbuuujjj',
  '..bbhhhhhhuuujjl',
  '..bhhhhhhhhuyjll',
  '..bhhhhhhhhyy.ll',
  '...hhhhhhhyy....',
  '..kkkhhhhy......',
  'kkkk............',
];
RB.air = [
  '...........uu.....',
  '.......bbbbuuuu...',
  '....bbbbbbbuuuuu..',
  '..bbbhhhhbbuuuuuj.',
  '.bbhhhhhhhbuuuujjl',
  '..hhhhhhhhhuuyy.ll',
  '.kkhhhhhhhyy....l.',
  'kkk...............',
];
RB.land = [
  '.bbbb...........',
  'bbbbbbb.........',
  'bhhhbbbbuu......',
  'bhhhhhbbuuuu....',
  'bhhhhhhbuuuuu...',
  '.hhhhhhbuuuuuj..',
  '.kkhhhhbuuuujjj.',
  'kk..hhhbuyyjjl..',
  '.......yy...ll..',
  '............ll..',
  '............ll..',
  '...........lll..',
];
RB.squash = [
  '.....bbbbuu.....',
  '...bbbhhhbuuuu..',
  '.bbbhhhhhhuuuujj',
  '.bhhhhhhhhuuujjj',
  '.bhhhhhhhhuuyjl.',
  '..hhhhhhhhyyyll.',
  '.kkkkkkkkkkk.ll.',
];
RB.stand = [
  '.....uu.....',
  '....uuuu....',
  '...buuuuj...',
  '...bbuuujj..',
  '..bbbbuujj..',
  '..bbbbbujll.',
  '.bbbbbbuyyl.',
  '.bhhhhbuyy..',
  '.hhhhhhhyy..',
  '.hhhhhhhyy..',
  '..hhhhhhyl..',
  '.kkkkkkkkkl.',
];
RB.clover = [
  '.3...',
  '3121.',
  '.112.',
  '..2..',
  '..2..',
];
RB.cloverBit = [
  '.....',
  '..21.',
  '.112.',
  '..2..',
  '..2..',
];
RB.head = [
  '...cZ...',
  '.ccaaZZ.',
  'ccaEeZc.',
  'ccceeZmn',
  '.cffffmm',
  '..fffjj.',
];
RB.headSniff = nudge(RB.head, 'n', 0, -1, 'm');
RB.headBlink = blink(RB.head);
RB.headMunch = patch(RB.head, 2, 4, ['fffffmm', '.ffffj']);
// upright ears (drawn behind the head)
RB.ears = [
  '.oo...',
  'oiiop.',
  'oiiopp',
  '.oiopp',
  '.ooio.',
  '..o...',
];
RB.earsTwitch = [
  'oo....',
  'oiiop.',
  'oiiopp',
  '.oiopp',
  '.ooio.',
  '..o...',
];
RB.earsBack = [
  'ooo.....',
  'oiiooppp',
  '.ooiiopp',
  '...oooo.',
];
RB.earsUp = [
  '.oo.pp',
  'oiiopp',
  'oiiop.',
  'oiiop.',
  '.oio..',
  '.oio..',
  '..o...',
];
RB.earsUpTwitch = [
  'oo..pp',
  'oiiopp',
  'oiiop.',
  'oiiop.',
  '.oio..',
  '.oio..',
  '..o...',
];
// lionhead: short ears with the same base, plus a fluffy ruff behind the face
RB.shortEars = ['......', '......', '.oo...', 'oiiop.', '.ooio.', '..o...'];
RB.shortEarsTwitch = ['......', '......', 'oo....', 'oiiop.', '.ooio.', '..o...'];
RB.shortEarsBack = ['........', '..oo....', '.oiiopp.', '...oooo.'];
RB.shortEarsUp = ['......', '......', '.oo.p.', 'oiiopp', '.oio..', '.oio..', '..o...'];
RB.shortEarsUpTwitch = ['......', '......', 'oo..p.', 'oiiopp', '.oio..', '.oio..', '..o...'];
RB.mane = [
  '..M.MM.....',
  '.MMMMMMM...',
  'MMMMMMMMM..',
  '.MMMMMMMMM.',
  'MMMMMMMMMM.',
  '.MMMMMMMMM.',
  'MMMMMMMMMMM',
  '.MMMMMMMMM.',
  'M.MMMMMMM..',
  '...M.M.M...',
];
// lop: ears hang down the side of the head (drawn in front of it)
RB.lopEars = [
  '.ooO',
  'oooO',
  'oooO',
  'oooO',
  'oooO',
  'oooO',
  '.ooO',
  '.oO.',
  '..O.',
];
RB.lopEarsSwing = [
  '.ooO',
  'oooO',
  'oooO',
  'oooO',
  '.oooO',
  '.oooO',
  '..ooO',
  '..oO.',
  '...O.',
];
RB.lopEarsFly = [
  '.oooO..',
  'ooooooO',
  '.oooOO.',
  '..oO...',
];
RB.lopEarsPerk = [
  '.oooO',
  'oooO.',
  'oooO.',
  'oooO.',
  'oooO.',
  '.ooO.',
  '.oO..',
  '..O..',
];
const LOP_MAP = { ears: 'lopEars', earsTwitch: 'lopEarsSwing', earsBack: 'lopEarsFly', earsUp: 'lopEarsPerk', earsUpTwitch: 'lopEarsSwing' };
const SHORT_MAP = { ears: 'shortEars', earsTwitch: 'shortEarsTwitch', earsBack: 'shortEarsBack', earsUp: 'shortEarsUp', earsUpTwitch: 'shortEarsUpTwitch' };

// frame table: tail [x, y], body / ears / head [stamp, x, y], food [stamp, x, y]
const RABBIT_FRAMES = {
  idle: [
    { tail: [-1, 8], body: ['sit', 0, 6], ears: ['ears', 6, 0], head: ['head', 8, 4] },
    { tail: [-1, 7], body: ['sitIn', 0, 5], ears: ['ears', 6, -1], head: ['head', 8, 3] },
    { tail: [-1, 8], body: ['sit', 0, 6], ears: ['earsTwitch', 6, 0], head: ['headSniff', 8, 4] },
    { tail: [-1, 7], body: ['sitIn', 0, 5], ears: ['ears', 6, -1], head: ['headBlink', 8, 3] },
  ],
  move: [
    { tail: [-1, 9], body: ['crouch', 0, 7], ears: ['ears', 7, 1], head: ['head', 9, 5] },
    { tail: [0, 7], body: ['launch', 0, 4], ears: ['ears', 8, -2], head: ['head', 10, 1] },
    { tail: [-1, 6], body: ['air', 0, 4], ears: ['earsBack', 6, 1], head: ['head', 12, 2] },
    { tail: [-2, 4], body: ['land', 0, 3], ears: ['ears', 8, -1], head: ['head', 10, 3] },
    { tail: [-1, 9], body: ['squash', 0, 8], ears: ['ears', 7, 2], head: ['head', 9, 6] },
  ],
  eat: [
    { tail: [-1, 8], body: ['sit', 0, 6], ears: ['earsBack', 5, 5], head: ['head', 9, 7], food: ['clover', 14, 10] },
    { tail: [-1, 8], body: ['sit', 0, 6], ears: ['earsBack', 5, 5], head: ['headMunch', 9, 7], food: ['cloverBit', 14, 10] },
    { tail: [-1, 8], body: ['sit', 0, 6], ears: ['earsBack', 5, 4], head: ['head', 9, 6], food: ['cloverBit', 14, 10] },
    { tail: [-1, 8], body: ['sit', 0, 6], ears: ['earsBack', 5, 4], head: ['headMunch', 9, 6], food: ['cloverBit', 14, 10] },
  ],
  look: [
    { tail: [-1, 10], body: ['stand', 0, 3], ears: ['earsUp', 4, -7], head: ['head', 5, -2] },
    { tail: [-1, 10], body: ['stand', 0, 3], ears: ['earsUpTwitch', 4, -7], head: ['headSniff', 5, -2] },
  ],
};
// v.ears: 'up' (default) | 'lop' | 'short'; v.mane: ruff behind the face
function rabbitAnims(table, v = {}) {
  const out = {};
  for (const [a, frames] of Object.entries(table)) {
    out[a] = frames.map((f) => {
      const [hs, hx0, hy0] = f.head;
      const spec = [['tail', ...f.tail], f.body];
      let front = null;
      if (v.ears === 'lop') front = [LOP_MAP[f.ears[0]], hx0 - 1, hy0 - 1];
      else if (v.ears === 'short') spec.push([SHORT_MAP[f.ears[0]], f.ears[1], f.ears[2]]);
      else spec.push(f.ears);
      if (v.mane) spec.push(['mane', hx0 - 2, hy0 - 2]);
      spec.push(f.head);
      if (front) spec.push(front);
      if (f.food) spec.push(f.food);
      return spec;
    });
  }
  return out;
}
const RABBIT = { ground: 14, ax: 7, stamps: RB };

// Re-proportion a whole rig: duplicate the rig columns `cols` and rows `rows`
// (rig coordinates; the ground row stays put, everything above an inserted
// row moves up) in every stamp placement, so a hare is a longer, leggier
// rabbit with the same poses. Stamps in `keep` (heads, ears, food) only move.
function stretchRig(rig, anims, o) {
  const stamps = { ...rig.stamps };
  const cols = [...(o.cols || [])].sort((a, b) => a - b), rows = [...(o.rows || [])].sort((a, b) => a - b);
  const keep = new Set(o.keep || []);
  let uid = 0;
  const out = {};
  for (const [a, frames] of Object.entries(anims)) {
    out[a] = frames.map((spec) => spec.map(([n, x, y, opt]) => {
      let r = padded(stamps[n]);
      const w = widthOf(r), h = r.length, k = keep.has(n);
      let nx = x, ny = y, dc = 0, dr = 0;
      for (const c of cols) {
        if (c < x) nx++;
        else if (!k && c < x + w) { r = dupCol(r, c - x + dc); dc++; }
      }
      // rows bottom-up: an inserted row lifts everything above it
      for (const q of [...rows].reverse()) {
        if (q > y + h - 1) ny--;
        else if (!k && q >= y) { r = dupRow(r, q - y); ny--; dr++; }
      }
      if (!dc && !dr) return [n, nx, ny, opt];
      const id = `${n}~${uid++}`;
      stamps[id] = r;
      return [id, nx, ny, opt];
    }));
  }
  return { rig: { ...rig, stamps, ax: rig.ax + cols.filter((c) => c < rig.ax).length }, anims: out };
}
// swap / shift stamps of a frame table (hare heads and ears)
function remapAnims(anims, map) {
  const out = {};
  for (const [a, frames] of Object.entries(anims)) out[a] = frames.map((spec) => spec.map(([n, x, y, opt]) => (map[n] ? [map[n][0], x + map[n][1], y + map[n][2], opt] : [n, x, y, opt])));
  return out;
}

// ---------------------------------------------------------------- hares
// Snowshoe hare and jackrabbit: the rabbit stretched (longer body, longer
// legs) with a longer face, big dark-tipped ears and big hind feet.
RB.hareHead = [
  '...ccZ...',
  '.ccaaZZZ.',
  'ccaEeZZc.',
  'ccceeZZmn',
  '.cfffffmm',
  '..ffffjj.',
];
RB.hareHeadSniff = nudge(RB.hareHead, 'n', 0, -1, 'm');
RB.hareHeadBlink = blink(RB.hareHead);
RB.hareHeadMunch = patch(RB.hareHead, 2, 4, ['ffffffmm', '.fffffj']);
RB.hareEars = [
  '.OO....',
  'OOOO...',
  'ooio...',
  'ooio...',
  'ooiop..',
  '.oiopp.',
  '.oiopp.',
  '.ooio..',
  '..o....',
];
RB.hareEarsTwitch = [
  'OO.....',
  'OOOO...',
  'ooio...',
  'ooio...',
  'ooiop..',
  '.oiopp.',
  '.oiopp.',
  '.ooio..',
  '..o....',
];
RB.hareEarsBack = [
  'OOOoo......',
  'OOoiooOpp..',
  '.oooiiioppp',
  '...oooooop.',
];
RB.hareEarsUp = [
  '.OO.OO',
  'OOOOpp',
  'ooio.p',
  'ooiopp',
  'ooiop.',
  'ooiop.',
  '.oio..',
  '.oio..',
  '.oio..',
  '..o...',
];
RB.hareEarsUpTwitch = [
  'OO..OO',
  'OOOOpp',
  'ooio.p',
  'ooiopp',
  'ooiop.',
  'ooiop.',
  '.oio..',
  '.oio..',
  '.oio..',
  '..o...',
];
// jackrabbit: enormous ears
RB.jackEars = [
  '.OO.....',
  'OOOO....',
  'OOOO....',
  'ooio....',
  'ooio.pp.',
  'ooiop.p.',
  'ooiopp..',
  '.oiopp..',
  '.oiopp..',
  '.oiop...',
  '.ooio...',
  '..o.....',
];
RB.jackEarsTwitch = [
  'OO......',
  'OOOO....',
  'OOOO....',
  'ooio..p.',
  'ooio.pp.',
  'ooiop.p.',
  'ooiopp..',
  '.oiopp..',
  '.oiopp..',
  '.oiop...',
  '.ooio...',
  '..o.....',
];
RB.jackEarsBack = [
  'OOOOooo.......',
  'OOOoiioooOpp..',
  '.oooooiiioppp.',
  '....ooooooopp.',
];
RB.jackEarsUp = [
  '.OO.OO',
  'OOOOOO',
  'OOOOpO',
  'ooio.p',
  'ooiopp',
  'ooiop.',
  'ooiop.',
  'ooiop.',
  '.oio..',
  '.oio..',
  '.oio..',
  '.oio..',
  '..o...',
];
RB.jackEarsUpTwitch = patch(RB.jackEarsUp, 0, 0, ['OO..OO', 'OOOOOO']);
const HARE_MAP = {
  head: ['hareHead', 0, 0], headSniff: ['hareHeadSniff', 0, 0], headBlink: ['hareHeadBlink', 0, 0], headMunch: ['hareHeadMunch', 0, 0],
  ears: ['hareEars', 0, -3], earsTwitch: ['hareEarsTwitch', 0, -3], earsBack: ['hareEarsBack', -3, 0], earsUp: ['hareEarsUp', 0, -3], earsUpTwitch: ['hareEarsUpTwitch', 0, -3],
};
const JACK_MAP = {
  ...HARE_MAP,
  ears: ['jackEars', 0, -6], earsTwitch: ['jackEarsTwitch', 0, -6], earsBack: ['jackEarsBack', -6, 0], earsUp: ['jackEarsUp', 0, -6], earsUpTwitch: ['jackEarsUpTwitch', 0, -6],
};
const HARE_KEEP = ['tail', 'clover', 'cloverBit', ...Object.values(JACK_MAP).map((m) => m[0])];
const HARE = stretchRig(RABBIT, remapAnims(rabbitAnims(RABBIT_FRAMES), HARE_MAP), { cols: [4, 8], rows: [12], keep: HARE_KEEP });
const JACK = stretchRig(RABBIT, remapAnims(rabbitAnims(RABBIT_FRAMES), JACK_MAP), { cols: [3, 6, 9], rows: [11, 13], keep: HARE_KEEP });


// ---------------------------------------------------------------- picture rigs
// Small animals are drawn as whole pictures per pose (one stamp per frame,
// region letters still give every part its own shading); small variations
// (tail flick, blink, munch) are patches of a base picture.
function pictureRig(ground, ax, anims) {
  const stamps = {}, out = {};
  for (const [a, frames] of Object.entries(anims)) {
    out[a] = frames.map((f, i) => {
      // a bare picture stands on the ground (its last row is the ground row)
      const parts = Array.isArray(f[0]) ? f : [[f, 0, ground - f.length + 1]];
      return parts.map(([rows, x, y], k) => {
        const id = `${a}${i}_${k}`;
        stamps[id] = rows;
        return [id, x, y];
      });
    });
  }
  return { rig: { ground, ax, stamps }, anims: out };
}

// ---------------------------------------------------------------- red squirrel
// 16 x 14: a big curled tail with a hollow, tufted ear, white eye ring and
// belly. Ground row 13.
const SQ_SIT = [
  '...rrrr.........',
  '..rttttrr.......',
  '.rtttttttr......',
  '.rttrrrttr..O...',
  'rttr...rr..oO...',
  'rttr......oocc..',
  'rtttr....cccccc.',
  '.rttr...ccceEccm',
  '.rtttr..ccaeecmn',
  '..rtttrbbccaffm.',
  '..rtttrbbjjjjj..',
  '...rttbbhhbyjl..',
  '...rtbhhhhbyll..',
  '....kkkkkkkkll..',
];
const SQ_FLICK = patch(SQ_SIT, 0, 0, [
  '..rrrr..........',
  '.rttttrr........',
  'rtttttttr.......',
  'rttrrrrttr..O...',
  'rttr...rtr.oO...',
  'rttr....r.......',
]);
const SQ_TWITCH = patch(SQ_SIT, 11, 3, [
  'O ',
  'Oo',
  '..',
  '..',
  '....n',
  '....m',
]);
const SQ_RUN = [
  [
    '..........................',
    '...rrr..............O.....',
    '.rrtttrr...........oO.....',
    'rtttttttrr........oocc....',
    'rtttrrrtttrr.....cccccc...',
    '.rrr...rrtttr..bbcceEccm..',
    '.........rttbbbbbcaeecmn..',
    '..........bbhhhhbbaffm....',
    '..........bhhhhhbbyjj.....',
    '...........hhhkkllyyl.....',
    '............kk...l..l.....',
  ],
  [
    '..........................',
    '......................O...',
    'rrrr.................oO...',
    'rtttrrrr............oocc..',
    '.rrttttttrr........cccccc.',
    '...rrrrrtttrbbbbbbcceEccm.',
    '........rrbbbbbbbbbcaeecmn',
    '.........kbhhhhhbbbbaffm..',
    '........kk.hhhhh...yjjll..',
    '.......kk.............ll..',
    '..........................',
  ],
  [
    '.....................O....',
    '..rr................oO....',
    '.rttrr.............oocc...',
    'rtttttrr.........cccccc...',
    'rrrrtttttrrbbbbbbcceEccm..',
    '.....rrrrbbbbbbbbbcaeecmn.',
    '.......kkbhhhhhhbbbaffm...',
    '......kk..hhhhhh..yjjll...',
    '.....................l....',
    '..........................',
    '..........................',
  ],
  [
    '..........................',
    '..rrrr..............O.....',
    '.rttttrr...........oO.....',
    'rttrrtttrr........oocc....',
    'rtr..rrtttr......cccccc...',
    '.r.....rrttbbbbbbcceEccm..',
    '.........rbbbbbbbbcaeecmn.',
    '.........bhhhhhhbbbaffm...',
    '.........bhhhhhbbbyjjj....',
    '..........kkhhh..ylll.....',
    '..........kk......ll......',
  ],
];
const SQ_EAT = [
  '...rrrr...........',
  '..rttttrr.........',
  '.rtttttttr..O.....',
  '.rttrrrttr.oO.....',
  'rttr...rr.oocc....',
  'rttr.....cccccc...',
  'rtttr...ccceEcc...',
  '.rttr...ccaeeccm..',
  '.rtttr..cccaffmn22',
  '..rtttrbbcfffll131',
  '..rtttrbbjjjjll11.',
  '...rttbbhhbyjj....',
  '...rtbhhhhbyyy....',
  '....kkkkkkkkyl....',
];
const SQ_EAT2 = patch(SQ_EAT, 9, 8, [
  'ccKffmn..',
  'cfKKfll22',
  'jjjjjll31',
  '.......11',
]);
const SQ_LOOK = [
  '..rrr...........',
  '.rtttrr.....O...',
  'rtttttrr...oO...',
  'rttrrttr..oocc..',
  'rtr..rtr.cccccc.',
  'rtr...r.ccceEccm',
  'rttr....ccaeecmn',
  '.rtr...bccaffmm.',
  '.rttr..bbjjjjj..',
  '..rttr.bbujjl...',
  '..rttr.bbbyjl...',
  '...rttbhhbyy....',
  '...rtbhhhhbyy...',
  '....rbhhhhbyl...',
  '....kkkkkkkkl...',
];
const SQ_LOOK2 = patch(SQ_LOOK, 11, 1, [
  'O ',
  'Oo',
  '..',
  '..',
  '....n',
  '....m',
]);
const REDSQUIRREL = pictureRig(13, 8, {
  idle: [SQ_SIT, SQ_FLICK, SQ_TWITCH, SQ_SIT],
  move: SQ_RUN.map((r, i) => [[delCol(r, ...[[12, 15], [11, 14, 17], [10, 13, 16], [11, 14]][i]), -4, 13 - r.length + 1]]),
  eat: [SQ_EAT, SQ_EAT2, SQ_EAT, SQ_EAT2],
  look: [SQ_LOOK, SQ_LOOK2],
});

// ---------------------------------------------------------------- chipmunk
// 13 x 10: stripes along the back (x dark / z light), face stripes, a
// half-bushy tail held up, cheek pouches that puff up while eating.
const CH_SIT = [
  '.tt.....oO....',
  'rttr...oocc...',
  'rtttr.cccccc..',
  '.rttr.cceEccc.',
  '..rttcczeeccmn',
  '...bbbbczzffm.',
  '..bxxxxbbcjj..',
  '..bzzzzzbbjj..',
  '..bxxxxxbyjl..',
  '..hhhhhhbyyl..',
  '...kkkkkkkll..',
];
const CH_FLICK = patch(CH_SIT, 0, 0, [
  'rr............',
  'rttr..........',
  '.rttr.........',
  '.rtttr........',
  '..rttr........',
]);
const CH_TWITCH = patch(CH_SIT, 8, 0, ['O ', 'Ooc', '...', '...', '.....m', '.....n']);
const CH_BLINK = blink(CH_SIT);
const CH_RUN = [
  '.tt.............',
  'rttr......oO....',
  '.rttr....oocc...',
  '..rttr..cccccc..',
  '...rttbbcceEccc.',
  '....bbbbczeeccmn',
  '...bxxxxxbczffm.',
  '...bzzzzzzbjj...',
  '...bxxxxxxbyy...',
  '...hhhhhhhbyy...',
];
const CH_LEGS_OUT = ['.kk.......ll.', 'kk.........ll'];
const CH_LEGS_IN = ['....kk..ll...', '....kk..ll...'];
const CH_EAT = [
  '........oO.....',
  '.tt....oocc....',
  'rttr..cccccc...',
  'rtttr.cceEccc..',
  '.rttr.czeecccmn',
  '..rttbcczzffm12',
  '...bbbbbcfll31.',
  '..bxxxbbjjll...',
  '..bzzzzbjjj....',
  '..bxxxxbyyy....',
  '..hhhhhbyyy....',
  '...kkkkkkyl....',
];
const CH_EAT2 = patch(CH_EAT, 6, 4, ['cKeecccmn', 'cKKKffm..', '.KKfll.12', '......l31']);
const CH_LOOK = [
  '.......oO....',
  '......oocc...',
  '.tt..cccccc..',
  'rttr.cceEccc.',
  'rtttrczeecccm',
  '.rttbcczzffmn',
  '..rtbbbbcjj..',
  '...bxbbjjl...',
  '...bzbbjjl...',
  '...bxbbyy....',
  '..hhhhbyy....',
  '..hhhhhby....',
  '...kkkkkkl...',
];
const CH_LOOK2 = patch(CH_LOOK, 7, 0, ['O ', 'Ooc', '...', '...', '.....n', '.....m']);
const CHIPMUNK = pictureRig(10, 6, {
  idle: [CH_SIT, CH_FLICK, CH_TWITCH, CH_BLINK],
  move: [
    [[CH_RUN, 0, -1], [CH_LEGS_OUT, 1, 9]],
    [[CH_RUN, 0, -2], [CH_LEGS_IN, 1, 8], [CH_LEGS_IN, 1, 9]],
    [[CH_RUN, 0, -1], [CH_LEGS_OUT, 1, 9]],
    [[CH_RUN, 0, 0], [['....kk..ll...'], 1, 10]],
  ],
  eat: [CH_EAT, CH_EAT2, CH_EAT, CH_EAT2],
  look: [CH_LOOK, CH_LOOK2],
});

// ---------------------------------------------------------------- flying squirrel
// The red squirrel's poses with a flat, feathered tail, huge night eyes and
// the gliding membrane showing as a pale-edged flap along the flank.
const FS_TAIL_SIT = [
  '.rrr.......',
  'rtttrr.....',
  'rttttttr...',
  '.rrtttttt..',
  '...rrttttt.',
  '......rrtt.',
];
const fsEyes = (rows) => rows.map((r, j) => {
  // grow every 2x2 eye one row down (2 x 3 eye)
  const above = rows[j - 1] || '';
  return [...r].map((ch, i) => (/[eE]/.test(above[i]) && /[eE]/.test(rows[j - 2]?.[i] || '') === false && !/[eE]/.test(ch) && 'cfaZ'.includes(ch) ? 'e' : ch)).join('');
});
function flyer(pic, tail, tx, ty, membrane) {
  let r = fsEyes(strip(pic, 'tr'));
  r = under(r, tx, ty, tail);
  if (membrane) r = patch(r, membrane[0], membrane[1], membrane[2]);
  return r;
}
const FS_SIT = flyer(SQ_SIT, FS_TAIL_SIT, -4, 8, [6, 11, ['...G', 'GGGG']]);
const FS_FLICK = flyer(SQ_SIT, ['..rr.......', '.rttrr.....', 'rtttttr....', 'rrttttttr..', '...rrttttt.', '......rrtt.'], -4, 7, [6, 11, ['...G', 'GGGG']]);
const FS_TWITCH = flyer(SQ_TWITCH, FS_TAIL_SIT, -4, 8, [6, 11, ['...G', 'GGGG']]);
const FS_BLINK = blink(FS_SIT);
const FS_RUN_TAIL = ['rrrr.....', 'rttttrrr.', '.rrtttttt', '...rrrrtt'];
const FS_RUN = SQ_RUN.map((r, i) => {
  const pic = delCol(r, ...[[12, 15], [11, 14, 17], [10, 13, 16], [11, 14]][i]);
  const ty = [3, 2, 3, 3][i], gy = [8, 7, 6, 8][i], gx = [9, 9, 8, 10][i];
  return flyer(pic, FS_RUN_TAIL, [2, 0, 0, 1][i], ty, [gx, gy, [['GGGGG', 'GGGGGG', 'GGGG', 'GGGG'][i]]]);
});
const FS_EAT = flyer(SQ_EAT, FS_TAIL_SIT, -4, 8, null);
const FS_EAT2 = flyer(SQ_EAT2, FS_TAIL_SIT, -4, 8, null);
const FS_LOOK = flyer(SQ_LOOK, FS_TAIL_SIT, -4, 9, null);
const FS_LOOK2 = flyer(SQ_LOOK2, FS_TAIL_SIT, -4, 9, null);
const FLYINGSQUIRREL = pictureRig(13, 8, {
  idle: [[[FS_SIT, -4, 0]], [[FS_FLICK, -4, 0]], [[FS_TWITCH, -4, 0]], [[FS_BLINK, -4, 0]]],
  move: FS_RUN.map((r) => [[r, -4, 13 - r.length + 1]]),
  eat: [[[FS_EAT, -4, 0]], [[FS_EAT2, -4, 0]], [[FS_EAT, -4, 0]], [[FS_EAT2, -4, 0]]],
  look: [[[FS_LOOK, -4, -1]], [[FS_LOOK2, -4, -1]]],
});

// ---------------------------------------------------------------- mice & co
// Tiny critters share one recipe: a sitting picture (idle: sniff, ear flick,
// blink), a running body over alternating leg stamps (scurry with a bob), a
// sit-up eating picture (munch) and a standing / head-up picture (look).
const sniff = (rows) => nudge(rows, 'n', 0, -1, 'm');
// flick the topmost row (ear tip / tail tip) one pixel back
function flickTop(rows) {
  const j = rows.findIndex((r) => /[^. ]/.test(r));
  const out = padded(rows);
  out[j] = out[j].slice(1) + '.';
  return out;
}
const munch = (rows) => nudge(nudge(sniff(rows), '1', 0, 1, '.'), '3', 0, 1, '.');
function critterAnims(o) {
  const run = (dy, legs, ly) => [[o.run, 0, o.runY + dy], [legs, o.legX, o.runY + ly]];
  return {
    idle: [o.sit, sniff(o.sit), flickTop(o.sit), blink(o.sit)],
    move: [run(0, o.legsOut, o.legY), run(-1, o.legsIn, o.legY - 1), run(0, o.legsOut2 || o.legsOut, o.legY), run(0, o.legsIn, o.legY)],
    eat: [o.eat, munch(o.eat), o.eat, munch(o.eat)],
    look: [o.look, flickTop(sniff(o.look))],
  };
}
const MO = {
  sit: [
    '..........oo....',
    '.........oiio...',
    '.........oiioc..',
    '......bbbbooccc.',
    '.....bbhhbcceEc.',
    '....bhhhhhcceecm',
    '...Lbhhhhhbcffmn',
    'LLL..kkkhbyyjll.',
  ],
  run: [
    '...........oo...',
    '..........oiio..',
    '..........oiioc.',
    '.......bbbbooccc',
    '.....bbhhhbcceEc',
    'LLL.bhhhhhhcceecm',
    '...Lbhhhhhhbcffmn',
    '.....hhhhhbyyjj..',
  ],
  runY: -1, legX: 3, legY: 7,
  legsOut: ['..kk.......ll'],
  legsOut2: ['.kk.......ll.'],
  legsIn: ['....kk..ll...'],
  eat: [
    '.......oo....',
    '......oiio...',
    '......oiioc..',
    '.....bbooccc.',
    '....bbhcceEc.',
    '....bhhcceecm',
    '...bhhhbcffmn',
    '...bhhhbyll12',
    '..Lhhhhbyyl31',
    'LL.kkkkyyl...',
  ],
  look: [
    '.....oo...',
    '....oiio..',
    '....oiioc.',
    '....bbccc.',
    '...bbceEc.',
    '...bbceecm',
    '...bbbcffn',
    '..bbbbyjl.',
    '..bhhbyyl.',
    '.Lhhhbyy..',
    'L.hhhhyy..',
    'L.kkkkyl..',
  ],
};
const VO = {
  sit: [
    '....bbbbcc....',
    '..bbbbbooccc..',
    '.bbhhhbbcceEc.',
    'bbhhhhhbcceecm',
    'bhhhhhhbcffmmn',
    'tbhhhhhhbyyjj.',
    '.kkkkkk.yll...',
  ],
  run: [
    '.....bbbbcc....',
    '...bbbbbooccc..',
    '..bbhhhbbcceEc.',
    '.bbhhhhhbcceecm',
    'tbhhhhhhbcffmmn',
    '.bhhhhhhhbyyjj.',
  ],
  runY: 0, legX: 1, legY: 6,
  legsOut: ['kk.........ll'],
  legsOut2: ['.kk.......ll.'],
  legsIn: ['...kk...ll...'],
  eat: [
    '....bbbcc.....',
    '...bbbooccc...',
    '..bbhbbcceEc..',
    '.bbhhhbcceecm.',
    'bbhhhhhbcffmn.',
    'bhhhhhhbyll12.',
    'thhhhhhbyyl31.',
    '.kkkkkk.yy....',
  ],
  look: [
    '...bbcc....',
    '..bbooccc..',
    '..bbcceEc..',
    '.bbbcceecm.',
    '.bbbbcffmn.',
    '.bhhhbyjj..',
    'bhhhhbyyl..',
    'thhhhhbyl..',
    '.kkkkkky...',
  ],
};
const LE = {
  sit: [
    '....MMMMMM.....',
    '..MMbbbbbcMM...',
    '.Mbbbbbbbocccc.',
    'Mbbhhhbbbcceecc',
    'Mbhhhhhbccceecm',
    'Mbhhhhhhbcfffmn',
    '.Mhhhhhhhbyyjj.',
    '..kkkkkkk.yll..',
  ],
  run: [
    '.....MMMMMM.....',
    '...MMbbbbbcMM...',
    '..Mbbbbbbbocccc.',
    '.Mbbhhhbbbcceecc',
    'MMbhhhhhbccceecm',
    'Mbhhhhhhhbcfffmn',
    '.Mhhhhhhhhbyyjj.',
  ],
  runY: 0, legX: 2, legY: 7,
  legsOut: ['kk.........ll'],
  legsOut2: ['.kk.......ll.'],
  legsIn: ['...kk...ll...'],
  eat: [
    '...MMMMMM.....',
    '.MMbbbbbcMM...',
    'Mbbbbbbocccc..',
    'Mbbhhbbcceecc.',
    'Mbhhhhbccceecm',
    'Mbhhhhhbcfffmn',
    'Mbhhhhhbyll12.',
    '.Mhhhhhbyyl31.',
    '..kkkkkk.yy...',
  ],
  look: [
    '..MMMMM....',
    '.MbbbbcMM..',
    'Mbbbbocccc.',
    'Mbbbbcceecc',
    'Mbbbbcceecm',
    'Mbhhhbcffmn',
    'Mbhhhbyyjj.',
    'Mhhhhhbyyl.',
    '.Mhhhhhbyl.',
    '..kkkkkkk..',
  ],
};
const PI = {
  sit: [
    '.......OO.....',
    '......OooO....',
    '......OioO....',
    '...bbbbOoccc..',
    '..bbbbbbcccc..',
    '.bbhhhbcceEcc.',
    'bbhhhhhbceecm.',
    'bhhhhhhbcffmn.',
    '.kkkkkkkbyjl..',
  ],
  run: [
    '........OO.....',
    '.......OooO....',
    '.......OioO....',
    '....bbbbOoccc..',
    '..bbbbbbbcccc..',
    '.bbhhhbbcceEcc.',
    'bbhhhhhhbceecm.',
    'bhhhhhhhbcffmn.',
  ],
  runY: 0, legX: 1, legY: 8,
  legsOut: ['kk.........ll'],
  legsOut2: ['.kk.......ll.'],
  legsIn: ['...kk...ll...'],
  eat: [
    '.....OO......',
    '....OooO.....',
    '....OioO.....',
    '..bbbOoccc...',
    '.bbbbbcccc...',
    'bbhhhbceEcc..',
    'bhhhhbceeccm.',
    'bhhhhhbcffmn.',
    'bhhhhhbyl1...',
    'bhhhhhbyl13..',
    '.kkkkkkby2...',
  ],
  look: [
    '....OO.....',
    '...OooO....',
    '...OioO....',
    '...bOoccc..',
    '..bbbcccc..',
    '..bbcceEcc.',
    '.bbbcceecm.',
    '.bbbbcffmn.',
    '.bhhbbyjl..',
    'bhhhhbyyl..',
    'bhhhhhbyl..',
    '.kkkkkkby..',
  ],
};
const MICE = pictureRig(7, 8, critterAnims(MO));
const VOLES = pictureRig(6, 7, critterAnims(VO));
for (const k of ['sit', 'run', 'eat', 'look']) {
  const j = LE[k].findIndex((r) => r.includes('ee'));
  LE[k] = LE[k].map((r, i) => (i === j ? r.replace('ee', 'eE') : r));
}
const LEMS = pictureRig(7, 7, critterAnims(LE));
const PIKAS = pictureRig(8, 7, critterAnims(PI));

// ---------------------------------------------------------------- waddlers
// Groundhog, muskrat, porcupine and skunk: heavy bodies on short legs that
// rock from side to side (the waddle bob), same recipe as the tiny critters.
const GH = {
  sit: [
    '...........oo......',
    '.......bbbbocccc...',
    '.....bbbbbbcccccc..',
    '...bbbbbbbbccceEcc.',
    '..bbhhhhbbbccceecmm',
    '.bbhhhhhhbbcccffmmn',
    'tbhhhhhhhbbbcfffjj.',
    'tbhhhhhhhhbbbyyjj..',
    'tbhhhhhhhhbbyyyll..',
    '.bhhhhhhhbbyyyyll..',
    '..kkkkkk....lll....',
  ],
  runY: 0, legX: 1, legY: 10,
  legsOut: ['kkk.........lll'],
  legsOut2: ['..kkk.....lll..'],
  legsIn: ['.kkk.......lll.'],
  eat: [
    '.....oo........',
    '....oocccc.....',
    '...bccccccc....',
    '..bbccceEcccm..',
    '..bbccceeccmmn.',
    '.bbbbcffffmmj..',
    '.bbbbbjjjjll1..',
    '.bhhbbjjjjll31.',
    'bbhhhbbyyyy.11.',
    'bhhhhhbyyyy....',
    'bhhhhhbyyyy....',
    'tbhhhhhbyyy....',
    'tbhhhhhhbyy....',
    '.kkkkkkkkll....',
  ],
  look: [
    '....oo.......',
    '...oocccc....',
    '..bccccccc...',
    '..bcceEcccm..',
    '..bcceeccmmn.',
    '.bbbcfffmmj..',
    '.bbbbbjjjj...',
    '.bbbbbjjll...',
    '.bbbbbyyjl...',
    '.bhhbbyyy....',
    'bbhhhbyyyy...',
    'bhhhhhbyyy...',
    'bhhhhhbyyy...',
    'bhhhhhhbyy...',
    'tbhhhhhbyy...',
    '.kkkkkkkkll..',
  ],
};
GH.run = GH.sit.slice(0, 10);
const MU = {
  sit: [
    '.............bbbbcc.....',
    '...........bbbbbbocccc..',
    '.........bbbbbbbbcceEcc.',
    '.......bbhhhhhbbbcceeccm',
    '......bhhhhhhhhbbcffmmmn',
    '....vvbhhhhhhhhbbbyyjj..',
    '.vvv..bhhhhhhhbyyyyj....',
    'v.......kkk....ll.......',
  ],
  runY: 0, legX: 6, legY: 7,
  legsOut: ['.kkk.......ll'],
  legsOut2: ['..kk.....ll..'],
  legsIn: ['..kkk....ll..'],
  eat: [
    '......bbcc......',
    '.....bbbocccc...',
    '....bbbbcceEc...',
    '....bbbbcceecm..',
    '...bbbbbcfffmn..',
    '...bhhbbjjjll1..',
    '..bhhhhbjjjll1..',
    '..bhhhhhbyyy.1..',
    '.vbhhhhhbyyy.1..',
    'vv.kkkkkkkll....',
  ],
  look: [
    '.......bbcc......',
    '......bbbocccc...',
    '.....bbbbcceEc...',
    '.....bbbbcceecm..',
    '....bbbbbcfffmn..',
    '....bhhbbjjjj....',
    '...bhhhhbjjjl....',
    '...bhhhhhbyyl....',
    '.vvbhhhhhbyyy....',
    'v...kkkkkkkll....',
  ],
};
MU.run = MU.sit.slice(0, 7).map((r) => r.replace(/^\.vvv/, '.vv.'));
MU.run.push('v.......................');
const PO = {
  sit: [
    '.........Q..Q.............',
    '......Q..qQ.qQ.Q..........',
    '....Q.qQqqqqqqqqqQ........',
    '...QqqqqqqqqqqqqqqqQ......',
    '..Qqqqqqqqqqqqqqqqqqq.....',
    '..qqqqqqqqqqqqqqqqqqqcc...',
    '.Qqqqqqqqqqqqqqqqqqcccccc.',
    '.qqqqqqqqqqqqqqqqqcaeEccm.',
    'Qqqqqqqqqqqqqqqqqqcceecmmn',
    '.qqqqqqqqqqqqqqqqqbcfffmm.',
    '.qqqqqqqqqqqqqqqqbbbffjj..',
    '..bbbbbbbbbbbbbbbbbbjj....',
    '...bbbbbbbbbbbbbbbbb......',
    '....kkk.......lll.........',
  ],
  runY: 0, legX: 3, legY: 13,
  legsOut: ['kkk.........lll'],
  legsOut2: ['..kkk.....lll..'],
  legsIn: ['.kkk.......lll.'],
  eat: [
    '.........Q..Q.............',
    '......Q..qQ.qQ.Q..........',
    '....Q.qQqqqqqqqqqQ........',
    '...QqqqqqqqqqqqqqqqQ......',
    '..Qqqqqqqqqqqqqqqqqqq.....',
    '..qqqqqqqqqqqqqqqqqqqq....',
    '.Qqqqqqqqqqqqqqqqqqqqcc...',
    '.qqqqqqqqqqqqqqqqqqcccccc.',
    'Qqqqqqqqqqqqqqqqqqqcaeccc.',
    '.qqqqqqqqqqqqqqqqqqcceecmm',
    '.qqqqqqqqqqqqqqqqqbbcfffmn',
    '..bbbbbbbbbbbbbbbbbbbffjj1',
    '...bbbbbbbbbbbbbbbbbb.1131',
    '....kkk.......lll....1111.',
  ],
  look: [
    '...Q..Q..Q..Q.............',
    '....Q.qQ.qQ.qQ.Q..........',
    '..Q.qQqQqqqqqqqqQ.........',
    '...QqqqqqqqqqqqqqqQ.......',
    '.QqqqqqqqqqqqqqqqqqQ......',
    '..qqqqqqqqqqqqqqqqqqqcc...',
    'QqqqqqqqqqqqqqqqqqqcccccE.',
    '.qqqqqqqqqqqqqqqqqcaeEccmm',
    'Qqqqqqqqqqqqqqqqqqcceeccmn',
    '.qqqqqqqqqqqqqqqqqbcfffmm.',
    '.qqqqqqqqqqqqqqqqbbbffjj..',
    '..bbbbbbbbbbbbbbbbbbjj....',
    '...bbbbbbbbbbbbbbbbb......',
    '....kkk.......lll.........',
  ],
};
PO.look[6] = PO.look[6].replace('E.', 'c.');
PO.run = PO.sit.slice(0, 13);
const SK = {
  sit: [
    '..rrr.................',
    '.rtttr................',
    'rttwttr...............',
    'rtwwttr...............',
    'rtwtrtr...............',
    '.rr.rttr..............',
    '....rtwr.wwwww........',
    '.....rtwwwwwwwwZZ.....',
    '.....rbwwbbbbbbccZc...',
    '......bbbbbbbbbbcceEc.',
    '.....bbhhhbbbbbbcceecm',
    '.....bhhhhhbbbbbbcfffn',
    '......hhhhhbbbbbbbfjj.',
    '.......kkk.....ll.....',
  ],
  runY: 0, legX: 5, legY: 13,
  legsOut: ['kkk........ll'],
  legsOut2: ['.kkk......ll.'],
  legsIn: ['..kkk....ll..'],
  eat: [
    '..rrr.................',
    '.rtttr................',
    'rttwttr...............',
    'rtwwttr...............',
    'rtwtrtr...............',
    '.rr.rttr..............',
    '....rtwr.wwww.........',
    '.....rtwwwwwwwww......',
    '.....rbwwbbbbbbbbZ....',
    '......bbbbbbbbbbbccZ..',
    '.....bbhhhbbbbbbcceEc.',
    '.....bhhhhhbbbbbcceecm',
    '......hhhhhbbbbbbcffmn',
    '.......kkk.....llfj.12',
  ],
  look: [
    '...rr.................',
    '..rttr................',
    '.rtwwtr...............',
    '.rtwwtr...............',
    '.rtwwtr...............',
    '.rtwwtr...............',
    '..rtwwr..wwwww........',
    '..rtwwrwwwwwwwwZZ.....',
    '...rtwbwwbbbbbbccZc...',
    '...rtbbbbbbbbbbbcceEc.',
    '....rbbhhhbbbbbbcceecm',
    '.....bhhhhhbbbbbbcfffn',
    '......hhhhhbbbbbbbfjj.',
    '.......kkk.....ll.....',
  ],
};
SK.run = SK.sit.slice(0, 13);
const GROUNDHOG = pictureRig(10, 9, critterAnims(GH));
const MUSKRAT = pictureRig(7, 13, critterAnims(MU));
const PORCUPINE = pictureRig(13, 12, critterAnims(PO));
const SKUNK = pictureRig(13, 12, critterAnims(SK));

// ================================================================ species
const P = (c, p, pat) => ({ c, p, pat });
// warm light-fur ramps (the automatic ramp turns creams grey-lilac)
const CREAM = ['#fbf2e2', '#eadbc2', '#c8b090', '#9a8266'];
const SNOW = ['#ffffff', '#f2eee8', '#d2ccc6', '#a49ea0'];
const DEFS = {
  cottontail: { rig: RABBIT, anims: rabbitAnims(RABBIT_FRAMES), name: 'Eastern Cottontail', colors: ['#9a7656', '#f4efe6'], pal: {
    b: '#94704e', u: 'b', h: '#9c7a58', y: CREAM, j: ['#f4e8d4', '#e0ceb2', '#bea686', '#927a62'], c: '#9a7656', f: '#a8845e', m: ['#f2e6d2', '#dccab0', '#b89e80', '#8e765e'],
    o: '#8e6c4c', O: '#4a3a30', t: SNOW, r: ['#f4f0ea', '#dcd6ce', '#b8b0a8', '#8a8288'], l: '#a07e5c', k: '#a07e5c', n: '#e8909a' } },
  snowshoe: { rig: HARE.rig, anims: HARE.anims, name: 'Snowshoe Hare', colors: ['#8a6a4a', '#f4f0ea'], pal: {
    b: '#86664a', h: '#8e6e50', u: 'b', y: CREAM, j: ['#f0e4d0', '#d8c6aa', '#b49c80', '#8a745c'], c: '#8a6a4c', a: '#c8b090', f: '#987856', m: ['#f2e6d2', '#dccab0', '#b89e80', '#8e765e'],
    o: '#7e6048', O: '#2e2428', t: ['#e8dccc', '#b49a7c', '#8e7458', '#6a5440'], r: SNOW, l: '#9a7a58', k: SNOW, n: '#d88a94' } },
  jackrabbit: { rig: JACK.rig, anims: JACK.anims, name: 'White-tailed Jackrabbit', colors: ['#a8987e', '#f6f2ea'], pal: {
    b: '#a49276', h: '#ac9a7e', u: 'b', y: CREAM, j: ['#f2e8d8', '#dccdb4', '#b8a68a', '#8e7c62'], c: '#a89678', a: '#d8ccb4', f: '#b4a284', m: ['#f4ead8', '#ddceb4', '#b8a488', '#8e7a60'],
    o: '#9c8a70', O: '#1e1a20', t: SNOW, r: SNOW, l: '#b0a084', k: '#b8a88c', n: '#d88a94' } },
  chipmunk: { rig: CHIPMUNK.rig, anims: CHIPMUNK.anims, name: 'Eastern Chipmunk', colors: ['#b8743c', '#2a2024'], pal: {
    b: '#a8744a', h: '#c8783a', u: 'b', y: CREAM, j: CREAM, x: '#3a2a26', z: '#f2e6cc', c: '#b07a4a', a: 'z', f: '#c08a58', m: '#d8a878', o: '#9a6a42', O: '#4a3226',
    t: '#9a6a44', r: '#5a3e2e', l: '#b07848', k: '#a87040', n: '#4a2a2a', K: '#c89466', 1: '#e8c070', 2: '#a07838', 3: '#fff0b0' } },
  redsquirrel: { rig: REDSQUIRREL.rig, anims: REDSQUIRREL.anims, name: 'Red Squirrel', colors: ['#c4622c', '#f6efe2'], pal: {
    b: '#c0602c', h: '#c86a32', u: 'b', y: CREAM, j: CREAM, c: '#c4662e', a: CREAM, f: '#cc7036', m: '#e09a68', o: '#b85a28', O: '#5a2a1a',
    t: '#b8582a', r: '#d88a4a', l: '#c46a34', k: '#b85e2c', n: '#5a3030', 1: '#a8743a', 2: '#6a4424', 3: '#d8a868' } },
  flyingsquirrel: { rig: FLYINGSQUIRREL.rig, anims: FLYINGSQUIRREL.anims, name: 'Northern Flying Squirrel', colors: ['#9a8270', '#f4ece4'], pal: {
    b: '#9a8270', h: '#a28a76', u: 'b', y: CREAM, j: CREAM, c: '#9e8672', a: '#d8c8b8', f: '#a89080', m: '#c8b4a0', o: '#8e7666', O: '#5a4a44',
    t: '#8a7262', r: '#b8a090', l: '#a08a78', k: '#9a8270', n: '#e090a8', G: ['#f4e8e0', '#dcc8bc', '#b49e94', '#8a7670'], e: '#0a0610',
    1: '#a8743a', 2: '#6a4424', 3: '#d8a868' } },
  deermouse: { rig: MICE.rig, anims: MICE.anims, name: 'Deer Mouse', colors: ['#a07450', '#f6f2ec'], pal: {
    b: '#9c7050', h: '#a47858', y: SNOW, j: SNOW, c: '#a87a56', f: '#b48660', m: '#d8b090', o: '#c09080', i: '#f0a8b0', l: SNOW, k: SNOW, n: '#f08a9a', L: '#d0a8a0', e: '#0a0610' } },
  vole: { rig: VOLES.rig, anims: VOLES.anims, name: 'Meadow Vole', colors: ['#7a5e48', '#c8b8a4'], pal: {
    b: '#7a5e48', h: '#826650', y: '#c8b8a4', j: 'y', c: '#7e624c', f: '#8a6e56', m: '#a08670', o: '#6a5040', t: '#6a5444', l: '#8a7462', k: 'l', n: '#5a3a3a' } },
  lemming: { rig: LEMS.rig, anims: LEMS.anims, name: 'Brown Lemming', colors: ['#b08050', '#5a4030'], pal: {
    b: '#a87a4c', h: '#b08454', y: '#e0c8a0', j: 'y', c: '#9c8470', f: '#a88a6c', m: '#c4a888', e: '#0a0610', o: '#5a4434', M: ['#d8b88a', '#b8926a', '#94704e', '#6a5038'], l: '#8a6a50', k: 'l', n: '#4a3030' } },
  pika: { rig: PIKAS.rig, anims: PIKAS.anims, name: 'American Pika', colors: ['#9a8a74', '#e8dcc8'], pal: {
    b: '#988872', h: '#a08e78', y: '#e8dcc8', j: 'y', c: '#9c8c76', f: '#a89880', m: '#c4b49c', o: '#8a7a66', i: '#e8d8c8', O: '#f4ece0', l: '#a89884', k: 'l', n: '#4a3a3a' } },
  groundhog: { rig: GROUNDHOG.rig, anims: GROUNDHOG.anims, name: 'Groundhog', colors: ['#8a6440', '#c8a07a'], pal: {
    b: '#86623e', h: '#8e6a44', y: '#b89068', j: '#c8a47c', c: '#7e5c3c', f: '#a07c58', m: '#c8a888', o: '#6a4c34', t: '#4e3a2c', l: '#3e2e26', k: 'l', n: '#2a1a1a',
    1: '#6cbc48', 2: '#3e7a34', 3: '#b8e878' } },
  muskrat: { rig: MUSKRAT.rig, anims: MUSKRAT.anims, name: 'Muskrat', colors: ['#6a4a34', '#3a3438'], pal: {
    b: '#6a4a34', h: '#72523a', y: '#a88a6a', j: 'y', c: '#6e4e38', f: '#7e5e44', m: '#9a7a5c', o: '#5a3e2c', v: P('#4a4248', '#6a6268', 'scale'), l: '#3e2e28', k: 'l', n: '#2a1a1a',
    1: '#7cb848', 2: '#4a7a30', 3: '#c8e888' } },
  porcupine: { rig: PORCUPINE.rig, anims: PORCUPINE.anims, name: 'North American Porcupine', colors: ['#4a3a34', '#f2ead8'], pal: {
    q: P('#4a3a34', '#8a7864', 'quill'), Q: ['#fffaf0', '#efe4cc', '#c8b898', '#9a8a70'], b: '#3e302c', c: '#5a463c', a: '#8a7464', f: '#665044', m: '#7a6458', j: '#6a5448',
    l: '#2a2024', k: 'l', n: '#1e1418', 1: '#6cbc48', 2: '#3e7a34', 3: '#b8e878' } },
  skunk: { rig: SKUNK.rig, anims: SKUNK.anims, name: 'Striped Skunk', colors: ['#24202a', '#f6f4f0'], pal: {
    b: ['#4a4658', '#24202a', '#18141e', '#0e0a12', '#08060c'], h: 'b', y: 'b', j: 'b', c: 'b', f: 'b', m: '#3a3640', w: SNOW, Z: SNOW, t: 'b', r: SNOW,
    l: '#18141c', k: 'l', n: '#3a2a30', e: '#060408', 1: '#5a4a30', 2: '#8a7048', 3: '#d8c070' } },
  bunny_lop: { rig: RABBIT, anims: rabbitAnims(RABBIT_FRAMES, { ears: 'lop' }), name: 'Holland Lop', colors: ['#e0a466', '#fbefdc'], pal: {
    b: '#e0a466', h: '#e6ae72', y: CREAM, j: CREAM, c: '#e2a868', a: 'c', f: '#ebb880', m: CREAM, o: '#c98448', O: '#a8642e', i: '#f2b0a8',
    t: CREAM, r: 't', l: '#eab47a', k: 'l', n: '#e8909a' } },
  bunny_dutch: { rig: RABBIT, anims: rabbitAnims(RABBIT_FRAMES), name: 'Dutch Rabbit', colors: ['#3a3640', '#f6f4f0'], pal: {
    b: '#3e3a46', h: '#433e4a', u: SNOW, y: SNOW, j: SNOW, c: '#3e3a46', a: 'c', Z: SNOW, f: '#3e3a46', m: SNOW, o: '#3a3642', i: '#e8a0aa',
    t: '#3e3a46', r: SNOW, l: SNOW, k: SNOW, e: '#0a060c', n: '#f0a0aa' } },
  bunny_lionhead: { rig: RABBIT, anims: rabbitAnims(RABBIT_FRAMES, { ears: 'short', mane: true }), name: 'Lionhead', colors: ['#e8c48e', '#fff4e0'], pal: {
    b: '#dcaa6c', h: '#e2b274', y: CREAM, j: CREAM, c: '#dcaa6c', a: 'c', f: '#e6b87a', m: CREAM, o: '#cf9c5e', M: ['#fffaf0', '#f6e6cc', '#dcc49e', '#b09070'],
    t: CREAM, r: 't', l: '#ecc894', k: 'l', n: '#e8909a' } },
};

// ---------------------------------------------------------------- exports
// EXTRA_SPRITES[`${id}_${anim}`]() -> frames (built on first call, cached),
// anims idle / move / eat / look; tame bunnies are `bunny_${breed}_${anim}`.
// LAND_ANIMAL_ART[spriteId] = { name, colors, gait, anims: { anim: frames },
//   fps: { anim: frames per second }, air: [airborne move frames] }
//   gait 'hop': move is one hop (crouch, launch, leap, land, squash); slide
//   the animal forward only on the `air` frames for a proper bounce.
//   'scurry' / 'waddle': a leg cycle, slide at a steady speed.
//   idle loops (breath, sniff, ear flick, blink), eat loops (munch), look
//   is 2 alert frames to ping-pong slowly.
const GAIT = { cottontail: 'hop', snowshoe: 'hop', jackrabbit: 'hop', bunny_lop: 'hop', bunny_dutch: 'hop', bunny_lionhead: 'hop',
  groundhog: 'waddle', muskrat: 'waddle', porcupine: 'waddle', skunk: 'waddle' };
const FPS = {
  hop: { idle: 3, move: 10, eat: 5, look: 1.5 },
  scurry: { idle: 4, move: 12, eat: 6, look: 2 },
  waddle: { idle: 2.5, move: 6, eat: 4, look: 1.5 },
};
export const LAND_ANIMAL_ART = {};
export const EXTRA_SPRITES = {};
for (const [id, def] of Object.entries(DEFS)) {
  const anims = {};
  for (const [a, specs] of Object.entries(def.anims)) {
    anims[a] = specs.length;
    let cache = null;
    EXTRA_SPRITES[`${id}_${a}`] = () => (cache ||= buildAnim(def.rig, specs, def.pal)).map((f) => ({ ...f, data: f.data.slice() }));
  }
  const gait = GAIT[id] || 'scurry';
  LAND_ANIMAL_ART[id] = { name: def.name, colors: def.colors, gait, anims, fps: { ...FPS[gait] }, air: gait === 'hop' ? [1, 2, 3] : [] };
}
