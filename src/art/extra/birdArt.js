// Wild birds, hand-built pixel art (side view, facing right).
//
// How it works
//   * Each body type ("rig") is a set of hand-drawn ASCII frames whose letters
//     name feather regions (crown, cheek, wing bar, tail tip ...). Heads are
//     separate stamps (level / bill-down / blink / tilt) composed into every
//     frame, so a head change shows up in all ten frames of the rig.
//   * Rigs: SONG (songbird), FINCH (SONG with body rows/cols cut out: small
//     birds, same head), CROW, MAGPIE / SWALLOW / DOVE (derived rigs with a new
//     tail drawn under the body), OWL, HUM (hummingbird), KING (kingfisher).
//   * A species is a palette: region letter -> colour, an alias to another
//     letter, a pattern ({ c, p, pat }) or null (pixel removed). Optional
//     silhouette pixels (crest, big bill, long bill, long tail ...) are drawn
//     in the rigs with their own letters that default to "off".
//   * shade() turns the region grid into RGBA: 3-4 tone ramps lit from the top
//     left, darker feather edges where the wing overlaps the body, and a 1 px
//     dark outline tinted by the colour it surrounds.
//
// Contract (see natureArt.js): EXTRA_SPRITES[name]() -> [{ w, h, data, ax, ay }]
// with pixels fully opaque or fully transparent.

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
      sh: mix(b, SHADE, L > 0.86 ? 0.22 : L < 0.2 ? 0.34 : 0.27),
      dp: mix(b, DEEP, L < 0.2 ? 0.55 : 0.46),
      ol: mix(b, INK, L < 0.2 ? 0.6 : 0.72),
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
// head   c crown/forehead  n nape/rear crown  o brow  1 eye-ring top  2 eye-ring bottom
//        a lore (eye->bill)  3 eye stripe behind the eye  f cheek  4 malar  j chin/throat
//        m breast band / necklace   e eye   E eye glint
// bill   k upper  h lower  G big-bill extra pixels  g long-bill extra pixels
// crest  q crest  Q tall crest tip
// body   b back  p rump  u breast  s flank  y belly  i undertail
// wing   d shoulder  w coverts  x wing bar  z tertials/secondaries  v primaries
// tail   t tail  r tail tip / outer feathers  L long-tail extension  F fork streamers
// legs   l
const ROLE = {};
for (const k of 'cnoa3f4j125qQm') ROLE[k] = 'head';
for (const k of 'bpusyi') ROLE[k] = 'body';
for (const k of 'dwxXzvVW') ROLE[k] = 'wing';
for (const k of 'trLF') ROLE[k] = 'tail';
for (const k of 'khgG') ROLE[k] = 'bill';
ROLE.e = 'eye'; ROLE.E = 'eye'; ROLE.Y = 'eye'; ROLE.l = 'leg'; ROLE.K = 'leg'; ROLE.B = 'blur'; ROLE.F = 'thin';
const FALLBACK = {
  n: 'c', 5: 'n', o: 'c', 1: 'o', 2: 'f', a: 'f', 3: 'a', 4: 'j', j: 'f', m: 'u', y: 'u', s: 'y', i: 'y', p: 'b',
  d: 'w', x: 'w', X: 'w', z: 'w', r: 't', V: 'v', E: 'e',
  q: null, Q: null, g: null, G: null, L: null, F: null,
  e: '#120a16', l: '#5e5058', k: '#3a3440', K: '#2a2430', Y: '#f4c81e', B: null,
};

function resolve(pal, key, depth = 0) {
  const v = key in pal ? pal[key] : FALLBACK[key];
  if (v === undefined) {
    if (key === 'v') { const w = resolve(pal, 'w', depth + 1); return w && { dark: w }; }
    if (key === 'h') { const k = resolve(pal, 'k', depth + 1); return k && { dark: k }; }
    if (key === 'W') { const v = resolve(pal, 'v', depth + 1); return v && { dark: v }; }
    return null;
  }
  if (v === null) return null;
  if (typeof v === 'string' && v.length === 1) return depth > 10 ? null : resolve(pal, v, depth + 1);
  return v;
}
// patterns are evaluated in template coordinates so they stay put between frames
const PAT = {
  check: (x, y) => (x + y) % 2 === 0,
  bar: (x, y) => y % 2 === 0,
  streak: (x, y) => x % 2 === 0 && y % 3 !== 2,
  spot: (x, y) => y % 2 === 0 && (x + (y % 4 === 0 ? 0 : 2)) % 4 === 0,
  fleck: (x, y) => (x * 7 + y * 13) % 5 === 0,
  chev: (x, y) => (x * 3 + y * 5) % 7 === 0 || (x * 5 + y * 3) % 11 === 0,
  dash: (x, y) => y % 3 === 0 && (x + y) % 3 !== 2,
  scale: (x, y) => y % 2 === 0 && (x + (y % 4 === 0 ? 0 : 1)) % 2 === 0,
};
const patterned = (s) => (s.dark ? patterned(s.dark) : typeof s === 'object' && !Array.isArray(s));
function rampAt(spec, x, y) {
  if (spec.dark) { const r = rampAt(spec.dark, x, y); return r && darker(r); }
  if (typeof spec === 'object' && !Array.isArray(spec)) { const c = PAT[spec.pat](x, y) ? spec.p : spec.c; return c ? rampAt(c, x, y) : null; }
  return ramp(spec);
}

// ---------------------------------------------------------------- grids
class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.k = new Array(w * h).fill(null); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.k[y * this.w + x]; }
  set(x, y, ch) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.k[y * this.w + x] = ch; }
  draw(rows, x0 = 0, y0 = 0, o = {}) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '.' || ch === ' ') return;
      if (o.under && this.get(x0 + i, y0 + j)) return;
      this.set(x0 + i, y0 + j, ch);
    }));
    return this;
  }
}

// region grid -> RGBA with shading + outline. Grid must have a 1px empty border.
// Thin or flat parts (bill, legs, eyes, wing blur, tail streamers) cast no outline.
const NO_OUTLINE = new Set(['bill', 'leg', 'eye', 'blur', 'thin']);
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const NB = [];
for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) NB.push([dx, dy, dx / (dx * dx + dy * dy), dy / (dx * dx + dy * dy)]);
function shade(g, pal, floor = g.h) {
  const { w } = g, h = floor;
  const role = new Array(w * h).fill(null), rp = new Array(w * h).fill(null);
  const memo = new Map(); // letter -> { s, fixed ramp | null } for this palette
  for (let i = 0; i < w * h; i++) {
    const ch = g.k[i];
    if (!ch) continue;
    let e = memo.get(ch);
    if (e === undefined) {
      const s = resolve(pal, ch);
      memo.set(ch, (e = s && { s, fixed: patterned(s) ? null : rampAt(s, 0, 0) }));
    }
    if (!e) continue;
    const R = e.fixed || rampAt(e.s, i % w, (i / w) | 0);
    if (!R) continue;
    role[i] = ROLE[ch] || 'body';
    rp[i] = R;
  }
  // opacity with a 2px empty margin so the 5x5 normal scan needs no bounds checks
  const OW = w + 4, opq = new Uint8Array(OW * (h + 4));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (role[y * w + x] !== null) opq[(y + 2) * OW + x + 2] = 1;
  const op = (x, y) => opq[(y + 2) * OW + x + 2] === 1;
  const out = new Uint8ClampedArray(w * g.h * 4);
  const put = (i, c) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (role[i] === null) continue;
    const R = rp[i], ro = role[i];
    if (NO_OUTLINE.has(ro) && ro !== 'bill') { put(i, R.mid); continue; }
    if (ro === 'bill') { put(i, !op(x, y - 1) && op(x, y + 1) ? R.hi : R.mid); continue; }
    // surface normal from the empty pixels around (5x5, inverse-square weights)
    let nx = 0, ny = 0;
    const o0 = (y + 2) * OW + x + 2;
    for (let k = 0; k < NB.length; k++) if (!opq[o0 + NB[k][0] + NB[k][1] * OW]) { nx += NB[k][2]; ny += NB[k][3]; }
    const m = Math.hypot(nx, ny);
    let t = 'mid';
    if (m > 0.3) {
      const d = -(nx + ny) / (m * Math.SQRT2);
      const up = !op(x, y - 1), lf = !op(x - 1, y), dn = !op(x, y + 1), rt = !op(x + 1, y);
      if (d > 0.25 && (up || lf)) t = 'hi';
      else if (d < -0.25 && (dn || rt)) t = dn && d < -0.6 ? 'dp' : 'sh';
    }
    if (ro === 'wing') {
      const below = op(x, y + 1) ? role[i + w] : null, above = op(x, y - 1) ? role[i - w] : null;
      if (below && below !== 'wing' && below !== 'tail' && below !== 'leg') t = 'dp';
      else if (above && above !== 'wing' && t === 'mid') t = 'hi';
    }
    if (ro === 'body' && op(x, y - 1) && role[i - w] === 'wing' && t !== 'dp') t = 'sh';
    put(i, R[t]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (role[i] !== null) continue;
    const o0 = (y + 2) * OW + x + 2;
    if (!(opq[o0 - OW] | opq[o0 - 1] | opq[o0 + 1] | opq[o0 + OW])) continue;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let k = 0; k < 4; k++) {
      const X = x + N4[k][0], Y = y + N4[k][1];
      if (!op(X, Y)) continue;
      const j = Y * w + X;
      if (NO_OUTLINE.has(role[j])) continue;
      const o = rp[j].ol;
      r += o[0]; gg += o[1]; b += o[2]; n++;
    }
    if (n) put(i, [Math.round(r / n), Math.round(gg / n), Math.round(b / n)]);
  }
  return { w, h: g.h, data: out };
}

// crop a list of same-size frames to their union box; ground frames are then
// padded so the feet (template x = feetX) sit on the anchor ax = w/2.
function finish(frames, feetX) {
  const W = frames[0].w, H = frames[0].h;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const f of frames) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f.data[(y * W + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let padL = 0, padR = 0;
  if (feetX != null) {
    const bw = x1 - x0 + 1, d = bw - 2 * (feetX + 1 - x0);
    if (d > 0) padL = d; else padR = -d;
  }
  const w = x1 - x0 + 1 + padL + padR, h = y1 - y0 + 1;
  return frames.map((f) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) for (let c = 0; c < 4; c++) d[(y * w + x - x0 + padL) * 4 + c] = f.data[((y + y0) * W + x) * 4 + c];
    return { w, h, data: d, ax: w / 2, ay: feetX != null ? h : h / 2 };
  });
}

// ---------------------------------------------------------------- composition
// frame spec: { body: rows, head: [stampName, x, y], under: [[rows, x, y], ...] }
// The head stamp is drawn over the body, "under" stamps (long tails) only fill
// empty pixels. Ground frames of a rig are bottom-aligned (last row = feet).
function extent(rig, f) {
  let w = Math.max(...f.body.map((r) => r.length)), h = f.body.length;
  if (f.head) { const hs = rig.heads[f.head[0]]; w = Math.max(w, f.head[1] + Math.max(...hs.map((r) => r.length))); h = Math.max(h, f.head[2] + hs.length); }
  for (const [r, x, y] of f.under || []) { w = Math.max(w, x + Math.max(...r.map((q) => q.length))); h = Math.max(h, y + r.length); }
  return [w, h];
}
function compose(rig, spec, W, H, ground) {
  const g = new Grid(W + 2, H + 2);
  const oy = ground ? H - spec.body.length : 0;
  g.draw(spec.body, 1, 1 + oy);
  if (spec.head) g.draw(rig.heads[spec.head[0]], spec.head[1] + 1, spec.head[2] + 1 + oy);
  for (const [r, x, y] of spec.under || []) g.draw(r, x + 1, y + 1 + oy, { under: true });
  return g;
}
const GROUND = { idle: ['idle0', 'idle1'], hop: ['hop0', 'hop1'], peck: ['peck0', 'peck1'] };
function buildBird(rig, pal) {
  // everything is lazy: natureArt imports this module eagerly and wraps each
  // sprite builder in try/catch, so a broken rig only costs its own sprites
  let dims = null;
  const ground = () => {
    if (dims) return dims;
    const gf = Object.values(GROUND).flat().map((n) => rig.frames[n]);
    // ground frames are bottom-aligned on their last body row (the feet), so a
    // head may reach that row (a pecking bill) but never go below it
    for (const [n, f] of Object.entries(rig.frames)) if (extent(rig, f)[1] > f.body.length) throw new Error(`birdArt: ${n} reaches below the feet`);
    return (dims = { W: Math.max(...gf.map((f) => extent(rig, f)[0])) + 1, H: Math.max(...gf.map((f) => f.body.length)) });
  };
  const out = {};
  for (const [anim, names] of Object.entries(GROUND)) {
    // floor = H + 1: nothing (not even outline) below the feet row
    out[anim] = () => { const { W, H } = ground(); return finish(names.map((n) => shade(compose(rig, rig.frames[n], W, H, true), pal, H + 1)), rig.feetX); };
  }
  out.fly = () => {
    const FW = Math.max(...rig.fly.map((f) => extent(rig, f)[0])) + 1, FH = Math.max(...rig.fly.map((f) => extent(rig, f)[1])) + 1;
    return finish(rig.fly.map((f) => shade(compose(rig, f, FW, FH, false), pal)), null);
  };
  return out;
}

// ---------------------------------------------------------------- songbird rig
const SONG_HEADS = {
  level: [
    '.QQ.......',
    '.qqq......',
    '.qcccc....',
    '.5co1oc...',
    '5n33eaa...',
    'nnff2aakkg',
    'nnff44jhG.',
    '..ffjjm...',
  ],
  down: [
    '.QQ.......',
    '.qqq......',
    '.qcccc....',
    '.5co1oc...',
    '5n33eaa...',
    'nnff2aakG.',
    'nnff44jhk.',
    '..ffjjm..k',
    '.........g',
  ],
};
const SONG_LEGS = ['.........l.l', '.........l.l', '.........l.ll'];
const SONG_UPPER = [
  '.', '.', '.', '.', '.',
  '........b',
  '......bbb',
  '.....bbbbdd....m',
  '....bbbddddwmmmuu',
];
const SONG = {
  feetX: 11,
  heads: SONG_HEADS,
  frames: {
    idle0: { head: ['level', 9, 0], body: [
      ...SONG_UPPER,
      '...pbwwXXXXwwuuuuu',
      '...pvwwxxxxwwuuuuu',
      '..tvvvwwzzzzwsuuu',
      '.ttr.vvvvzzissyyy',
      'ttr......iissyyy',
      'tr.......l.l',
      'r........l.l',
      '.........l.ll',
    ] },
    idle1: { head: ['level', 9, 0], body: [
      ...SONG_UPPER,
      '...pbwwXXXXwwuuuuu',
      '..tpvwwxxxxwwuuuuu',
      '.ttvvvwwzzzzwsuuu',
      'ttrr.vvvvzzissyyy',
      'trr......iissyyy',
      'rr.......l.l',
      ...SONG_LEGS.slice(1),
    ] },
    hop0: { head: ['level', 9, 0], body: [
      ...SONG_UPPER,
      '..tpbwwXXXXwwuuuuu',
      '.ttpvwwxxxxwwuuuuu',
      'ttrvvvwwzzzzwsuuu',
      'trr..vvvvzzissyyy',
      'rr.......iissyyy',
      '.........l.l',
      '........ll.ll',
    ] },
    hop1: { head: ['level', 9, 0], body: [
      ...SONG_UPPER,
      '...pbwwXXXXwwuuuuu',
      '...pvwwxxxxwwuuuuu',
      '..tvvvwwzzzzwsuuu',
      '.ttr.vvvvzzissyyy',
      'ttr......iissyyy',
      'tr.......l.l',
      'r.......l.l',
      '.......l.l',
      '......ll.l',
    ] },
    peck0: { head: ['down', 12, 3], body: [
      '....................',
      '........bbbb........',
      '.....pbbbbbbb.......',
      '...tppbwbdddd.......',
      'ttttvvwwwXXXdd......',
      '.trr.vvwxxxwwww.....',
      '.....vvwzzxxwwmu....',
      '.......vvzzwwwuuu...',
      '........izzzwuuuuu..',
      '........iissuuuuu...',
      '..........ssyyuu....',
      '...........yyy......',
      ...SONG_LEGS,
    ] },
    peck1: { head: ['down', 12, 6], body: [
      '....................',
      '........bbbb........',
      '.....pbbbbbbb.......',
      '...tppbwbdddd.......',
      'ttttvvwwwXXXdd......',
      '.trr.vvwxxxwwww.....',
      '.....vvwzzxxwwmu....',
      '.......vvzzwwwuuu...',
      '........izzzwuuuuu..',
      '........iissuuuuu...',
      '..........ssyyuu....',
      '...........yyy......',
      ...SONG_LEGS,
    ] },
  },
};
SONG.fly = [
  { head: ['level', 11, 6], body: [
    '.......v.WW.........',
    '.......vvWW.........',
    '......vvvzWW........',
    '......vvzzxWW.......',
    '.....vvzzxxwW.......',
    '.....vzzzxxwdW......',
    '......zzzxwwddW.....',
    '.......zzxwwdd......',
    '........zxwwwd......',
    '......bbbbbbwd......',
    'tt.bbbbbbbbbbb......',
    'ttrrbbbbbbbbbb......',
    'rrrtpiiisssuuu......',
    'r....iissyyyuu......',
    '.........yyy........',
  ] },
  { head: ['level', 11, 6], body: [
    '....................',
    '....................',
    '...WW...............',
    '.vvWWWW.............',
    '.vvvvWWWW...........',
    '..vvvvzzWW..........',
    '...vvzzzxxwW........',
    '....vzzzxxwwd.......',
    '......zzxxwwdd......',
    '......bbbbbwwd......',
    'tt.bbbbbbbbbbb......',
    'ttrrbbbbbbbbbb......',
    'rrrtpiiisssuuu......',
    'r....iissyyyuu......',
    '.........yyy........',
  ] },
  { head: ['level', 11, 7], body: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '......bbbbb.........',
    'tt.bbbbbbbbbb.......',
    'ttrrbbbbwwwwwdd.....',
    'rrrtpiizzxxwwdd.....',
    'r....izzxxwwd.......',
    '....vvzzxww.........',
    '...vvvzz............',
    '..vvvv..............',
    '..vv................',
  ] },
  { head: ['level', 11, 6], body: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '.......WWW..........',
    '......bbbbWW........',
    'tt.bbbbbbbbbbb......',
    'ttrrbbbbbxxwwdd.....',
    'rrrtpiizzxxwwdd.....',
    'r..vvvzzzxwwd.......',
    '.vvvvzzz.yy.........',
    'vvvv................',
  ] },
];

// ---------------------------------------------------------------- crow rig
const CROW_HEADS = {
  level: [
    '....cccc......',
    '..ccccccc.....',
    '.nccccccc.....',
    '.ncccc1Ec.....',
    'nnccccaeaakkk.',
    'nnffffaakkkkkg',
    'nnffffjjhhhh..',
    '.nfffjjjj.....',
    '..ffjjjm......',
  ],
  down: [
    '....cccc......',
    '..ccccccc.....',
    '.nccccccc.....',
    '.ncccc1Ec.....',
    'nnccccaeaak...',
    'nnffffaakkk...',
    'nnffffjjhkkk..',
    '.nfffjjjjhkk..',
    '..ffjjjm..kk..',
    '...........kg.',
  ],
};
const CROW_LEGS = ['..............l..l', '..............l..l', '..............l..l', '.............ll.lll'];
const CROW_UP = [
  '.', '.', '.', '.', '.',
  '.........b',
  '.......bbb',
  '......bbbbb',
  '.....bbbbbbdd',
  '....bbbbbdddddddmmuuu',
];
const CROW_PECK = [
  '.',
  '..........bbbbbb',
  '........bbbbbbbbbb',
  '......ppbbbbbbbbbbb',
  '....ttppbwbddddddd',
  '..tttvvwwwwXXXXXdd',
  'ttttvvvvwwxxxxxwwww',
  '.trr.vvvvwzzzzxwwwmu',
  'r.....vvvvzzzzwwwuuu',
  '.........vvzzzwwuuuuu',
  '..........iizzwuuuuuu',
  '...........iissuuuuu',
  '.............ssyyuu',
  '..............yyy',
  ...CROW_LEGS,
];
const CROW = {
  feetX: 16,
  heads: CROW_HEADS,
  frames: {
    idle0: { head: ['level', 10, 0], body: [
      ...CROW_UP,
      '...pbbwwwwXXXXwwuuuuu',
      '...pwwwwwxxxxxwwuuuuu',
      '..ppvwwwwwzzzzzwwuuuu',
      '..tvvvvwwwzzzzzwsuuuu',
      '.ttvvvvvvzzzzzissyyy',
      '.ttr.vvvvvvzziissyyy',
      'ttrr......vv.iissyy',
      'trr...........l..l',
      'rr............l..l',
      'r.............l..l',
      '.............ll.lll',
    ] },
    idle1: { head: ['level', 10, 0], body: [
      ...CROW_UP,
      '...pbbwwwwXXXXwwuuuuu',
      '..tpwwwwwxxxxxwwuuuuu',
      '.ttpvwwwwwzzzzzwwuuuu',
      '.ttvvvvwwwzzzzzwsuuuu',
      'ttrvvvvvvzzzzzissyyy',
      'trrr.vvvvvvzziissyyy',
      'rrr.......vv.iissyy',
      'r.............l..l',
      ...CROW_LEGS.slice(1),
    ] },
    hop0: { head: ['level', 10, 0], body: [
      ...CROW_UP,
      '..tpbbwwwwXXXXwwuuuuu',
      '.ttpwwwwwxxxxxwwuuuuu',
      '.tppvwwwwwzzzzzwwuuuu',
      'ttrvvvvwwwzzzzzwsuuuu',
      'trrvvvvvvzzzzzissyyy',
      'rrr..vvvvvvzziissyyy',
      'r.........vv.iissyy',
      '..............l..l',
      '.............ll.lll',
    ] },
    hop1: { head: ['level', 10, 0], body: [
      ...CROW_UP,
      '...pbbwwwwXXXXwwuuuuu',
      '...pwwwwwxxxxxwwuuuuu',
      '..ppvwwwwwzzzzzwwuuuu',
      '..tvvvvwwwzzzzzwsuuuu',
      '.ttvvvvvvzzzzzissyyy',
      '.ttr.vvvvvvzziissyyy',
      'ttrr......vv.iissyy',
      'trr...........l..l',
      'rr...........l..l',
      'r...........l..l',
      '...........l..l',
      '..........ll.ll',
    ] },
    peck0: { head: ['down', 16, 4], body: CROW_PECK },
    peck1: { head: ['down', 16, 8], body: CROW_PECK },
  },
  fly: [
    { head: ['level', 16, 8], body: [
      '...........v.v..WW',
      '..........vvvv.WWW',
      '..........vvvvzWWW',
      '.........vvvvzzWWWW',
      '.........vvvzzzxWWW',
      '........vvvzzzxxwWW',
      '........vvzzzxxwwdW',
      '.........zzzxxwwwdd',
      '..........zzxxwwwdd',
      '...........zxxwwwdd',
      '........bbbbbbbbwddd',
      'tt....bbbbbbbbbbbbbb',
      'tttt.bbbbbbbbbbbbbbbb',
      'ttrrtpbbbbbbbbbbbbuuu',
      'trrr.piiisssssuuuuuu',
      'rr.....iiissyyyuuuu',
      '...........yyyyy',
    ] },
    { head: ['level', 16, 8], body: [
      '.', '.',
      '..vv.WWWW',
      '.vvvvWWWWWW',
      '..vvvvvWWWWWW',
      '...vvvvvzzWWWW',
      '....vvvvzzzxxWW',
      '.....vvvzzzxxwwdd',
      '.......vzzzxxwwwdd',
      '.........zzxxwwwdd',
      '........bbbbbbbbwddd',
      'tt....bbbbbbbbbbbbbb',
      'tttt.bbbbbbbbbbbbbbbb',
      'ttrrtpbbbbbbbbbbbbuuu',
      'trrr.piiisssssuuuuuu',
      'rr.....iiissyyyuuuu',
      '...........yyyyy',
    ] },
    { head: ['level', 16, 9], body: [
      '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.',
      '........bbbbbbbbb',
      'tt....bbbbbbbbbbbbbb',
      'tttt.bbbbbbbbbbbbbbbb',
      'ttrrtpbbbbbbbwwwwwdddd',
      'trrr.piiizzzxxxwwwddd',
      'rr.....izzzxxxwwwdd',
      '......vvzzzxxwww',
      '.....vvvzzzxx',
      '....vvvvzzz',
      '...vvvvvz',
      '...vvvv',
      '..vv.v',
    ] },
    { head: ['level', 16, 8], body: [
      '.', '.', '.', '.', '.', '.', '.', '.',
      '..........WWWWW',
      '.........WWWWWWW',
      '........bbbbbbbWWW',
      'tt....bbbbbbbbbbbbbb',
      'tttt.bbbbbbbbbbbbbbbb',
      'ttrrtpbbbbbbxxxwwwwddd',
      'trrrvvvzzzzzxxxwwwdd',
      'rvvvvvzzzzzzyyuuuu',
      'vvvvvvzz..yyyyy',
      'vv.v',
    ] },
  ],
};
// Magpie: crow frames shifted right, crow tail removed, long tail drawn under.
function retail(rig, shift, tails, o = {}) {
  const strip = (f, t) => ({
    ...f,
    body: f.body.map((r) => '.'.repeat(shift) + (o.keep ? r : r.replace(/[tr]/g, '.'))),
    head: f.head && [f.head[0], f.head[1] + shift, f.head[2]],
    under: [...(f.under || []), [t[0], t[1], t[2]]],
  });
  const frames = {};
  for (const [n, f] of Object.entries(rig.frames)) frames[n] = strip(f, tails[n] || tails.ground);
  return { ...rig, heads: o.heads || rig.heads, frames, fly: rig.fly.map((f, i) => strip(f, tails.fly[i] || tails.fly[0])), feetX: rig.feetX + shift };
}
const MAG_TAIL = {
  down: [
    '..........tttt',
    '........ttttt.',
    '.....tttttrr..',
    '..ttttrrrr....',
    'ttrrrr........',
    'rr............',
  ],
  flick: [
    '.........tttt',
    '......tttttt.',
    '...tttttrr...',
    'ttttrrr......',
    'rrr..........',
  ],
  up: [
    'rr...........',
    'ttrr.........',
    '.ttttrr......',
    '....ttttttr..',
    '.......tttttt',
    '..........ttt',
  ],
  fly: [
    'r.............',
    'rrttttttttttt',
    '.rrrrttttttttt',
    '....rrrrttttt',
  ],
};
const MAGPIE = retail(CROW, 9, {
  ground: [MAG_TAIL.down, 0, 12],
  idle1: [MAG_TAIL.flick, 1, 11],
  hop0: [MAG_TAIL.flick, 1, 12],
  peck0: [MAG_TAIL.up, 1, 3],
  peck1: [MAG_TAIL.up, 1, 3],
  fly: [[MAG_TAIL.fly, 0, 11], [MAG_TAIL.fly, 0, 11], [MAG_TAIL.fly, 0, 12], [MAG_TAIL.fly, 0, 11]],
});

// Swallow: songbird frames with the tail replaced by long crossed wingtips and
// forked streamers.
const SW_TAIL = {
  ground: [
    '.........VVv',
    '......VVVVv.',
    '...FVVVVtt..',
    'FFFFVttt....',
    '....FFF.....',
    '.......FF...',
  ],
  flick: [
    '.....FF..VVv',
    '...FFFVVVVv.',
    '....FVVVVtt.',
    '......VVtt..',
    '.....FFF....',
    '........FF..',
  ],
  up: [
    'FF.......',
    '..FFVV...',
    '....VVVt.',
    '..FFFVtt.',
    'FF.......',
  ],
  fly: [
    'FF........',
    '..FFFttt..',
    '....FFttt.',
    '..FFFttt..',
    'FF........',
  ],
};
const SWALLOW = retail(SONG, 4, {
  ground: [SW_TAIL.ground, 0, 10],
  idle1: [SW_TAIL.flick, 0, 9],
  hop0: [SW_TAIL.flick, 0, 8],
  peck0: [SW_TAIL.up, 1, 2],
  peck1: [SW_TAIL.up, 1, 2],
  fly: [[SW_TAIL.fly, 0, 10], [SW_TAIL.fly, 0, 10], [SW_TAIL.fly, 0, 11], [SW_TAIL.fly, 0, 10]],
});

// Dove: songbird body, small head, long pointed tail.
const DOVE_HEADS = {
  level: [
    '.', '.',
    '...ccc....',
    '..ccc1c...',
    '..n3eaa...',
    '..nf2akk..',
    '..nffjj...',
    '...ffjm...',
  ],
  down: [
    '.', '.',
    '...ccc....',
    '..ccc1c...',
    '..n3eaa...',
    '..nf2ak...',
    '..nffjhk..',
    '...ffjm.k.',
  ],
};
const DOVE_TAIL = {
  down: [
    '.........ttt',
    '......ttttt.',
    '...tttttrr..',
    'tttrrrr.....',
    'rr..........',
  ],
  flick: [
    '........ttt',
    '....ttttt..',
    '.ttttrr....',
    'trrr.......',
  ],
  up: [
    'rr.......',
    '.rrttt...',
    '...ttttt.',
    '......ttt',
  ],
  fly: [
    'r..........',
    'rrtttttttt.',
    '.rrrttttttt',
    '...rrtttt..',
  ],
};
const DOVE = retail(SONG, 6, {
  ground: [DOVE_TAIL.down, 0, 11],
  idle1: [DOVE_TAIL.flick, 1, 10],
  hop0: [DOVE_TAIL.flick, 1, 10],
  peck0: [DOVE_TAIL.up, 3, 3],
  peck1: [DOVE_TAIL.up, 3, 3],
  fly: [[DOVE_TAIL.fly, 0, 10], [DOVE_TAIL.fly, 0, 10], [DOVE_TAIL.fly, 0, 11], [DOVE_TAIL.fly, 0, 10]],
}, { heads: DOVE_HEADS });

// ---------------------------------------------------------------- snowy owl
// 3/4 view: round head with both yellow eyes, white plumage with dark flecks,
// feathered feet. idle1 blinks, hop = shuffle, peck = head tilt.
const OWL_FACE = [
  '....ccccc....',
  '..ccccccccc..',
  '.ccccccccccc.',
  'ncccaaocaaacc',
  'nccaYYooaYYoc',
  'nccaYeooaYeoc',
  'ncccoookoooc.',
  'nnccooohooo..',
  '.nnccooooc...',
  '...nnccccc...',
];
const OWL_HEADS = {
  front: OWL_FACE,
  blink: OWL_FACE.map((r, y) => (y === 4 ? r.replace(/Y/g, 'o') : y === 5 ? r.replace(/[Ye]/g, 'a') : r)),
  tiltL: [
    '...ccccc.....',
    '.cccccccccc..',
    'cccccaaccccc.',
    'ncccaYYocaacc',
    'nccaYeooaYYoc',
    'nccooooaYeoc.',
    'ncccooookoc..',
    'nnccoooohoc..',
    '.nnccoooocc..',
    '...nncccc....',
  ],
  tiltR: [
    '.....ccccc...',
    '..cccccccccc.',
    '.cccaacccccc.',
    'nccaaoocaaacc',
    'nccYYoooaYYoc',
    'ncaYeooooYeoc',
    'nccoooookooc.',
    'nnccooooohc..',
    '.nnccooooc...',
    '...nnccccc...',
  ],
};
const OWL_BODY = [
  '.', '.', '.', '.', '.', '.', '.', '.',
  '..nbb.......uu',
  '.nbbbb....uuuuu',
  '.bbbwwww.uuuuuuu',
  'bbwwwwwwwuuuuuuu',
  'bwwwwwwwwwuuuuuuu',
  'bwwwwwwwwwuuuuuuu',
  'bvwwwwwwwwwuuuuuu',
  'tvvwwwwwwwwyyyyyy',
  'tvvvwwwwwwyyyyyy',
  'ttvvvvwwwyyyyyy',
  '.ttvvvvvyyyyyyy',
  '..tt.....yyyyy',
  '........llllll',
  '........KlKlKl',
];
const shiftRows = (rows, dx, from = 0, to = rows.length) => rows.map((r, y) => (y >= from && y < to ? (dx > 0 ? '.'.repeat(dx) + r : r.slice(-dx)) : r));
const OWL = {
  feetX: 11,
  heads: OWL_HEADS,
  frames: {
    idle0: { head: ['front', 3, 0], body: OWL_BODY },
    idle1: { head: ['blink', 3, 0], body: OWL_BODY },
    hop0: { head: ['front', 4, 0], body: [...shiftRows(OWL_BODY.slice(0, 20), 1), '........llll.ll', '........KlKl...'] },
    hop1: { head: ['front', 2, 0], body: [...shiftRows(OWL_BODY.slice(0, 20), -1), '.........ll.llll', '...........KlKlK'] },
    peck0: { head: ['tiltL', 3, 0], body: OWL_BODY },
    peck1: { head: ['tiltR', 3, 0], body: OWL_BODY },
  },
  fly: [
    { head: ['front', 15, 7], body: [
      '......vv.vv..WWW',
      '.....vvvvvvvWWWWW',
      '.....vvvvvvzWWWWWW',
      '....vvvvvvzzzWWWWW',
      '....vvvvvzzzzxWWWW',
      '.....vvvzzzzxxwWWW',
      '.....vvzzzzxxxwwdW',
      '......zzzzzxxwwwdd',
      '.......zzzzxxwwwdd',
      '........zzzxxwwwdd',
      '.........bbbbbbbbbb',
      '...tt..bbbbbbbbbbbbb',
      '.ttttbbbbbbbbbbbbbbbu',
      'ttttbbbbbbbbbbbbbuuuu',
      '.ttt.yyyyyyyyyyyyyyy',
      '.......yyyyyyyyyyy',
    ] },
    { head: ['front', 15, 7], body: [
      '.', '.', '.',
      'vvvv.....WWWW',
      '.vvvvvvvWWWWWWW',
      '..vvvvvvzzWWWWWWW',
      '...vvvvzzzzxxWWWWW',
      '.....vvzzzzxxxwwwdd',
      '.......zzzzxxxwwwwdd',
      '.........zzzxxwwwwdd',
      '.........bbbbbbbbbb',
      '...tt..bbbbbbbbbbbbb',
      '.ttttbbbbbbbbbbbbbbbu',
      'ttttbbbbbbbbbbbbbuuuu',
      '.ttt.yyyyyyyyyyyyyyy',
      '.......yyyyyyyyyyy',
    ] },
    { head: ['front', 15, 8], body: [
      '.', '.', '.', '.', '.', '.', '.', '.', '.', '.', '.',
      '.........bbbbbbbbbb',
      '...tt..bbbbbbbbbbbbb',
      '.ttttbbbbbbbbwwwwwwddd',
      'ttttbbbbbzzzzxxxwwwwdd',
      '.ttt.yyzzzzzxxxwwwdd',
      '.....vvvzzzzxxxwww',
      '....vvvvvzzzzxx',
      '...vvvvvvvzz',
      '...vvvvvvv',
      '....vv.vv',
    ] },
    { head: ['front', 15, 7], body: [
      '.', '.', '.', '.', '.', '.', '.', '.', '.',
      '.........WWWWWWW',
      '.........bbbbbbbbbb',
      '...tt..bbbbbbbbbbbbb',
      '.ttttbbbbbbbbbxxxwwwddd',
      'vvvvvvvzzzzzzxxxwwwdd',
      '.vvvvvvvzzzzyyyyyy',
      '..vvv.vv.yyyyyy',
    ] },
  ],
};

// ---------------------------------------------------------------- hummingbird
const HUM_HEADS = {
  level: [
    '..cc.......',
    '.cccc......',
    'ncc1ca.....',
    'nc3eaakkkkk',
    'nnffjj.....',
    '.njjjj.....',
  ],
  down: [
    '..cc.......',
    '.cccc......',
    'ncc1ca.....',
    'nc3eaak....',
    'nnffjjk....',
    '.njjjj.k...',
    '.......k...',
    '........k..',
  ],
  up: [
    '.........k',
    '..cc....k.',
    '.cccc..k..',
    'ncc1cak...',
    'nc3eaa....',
    'nnffjj....',
    '.njjjj....',
  ],
};
const HUM_PERCH = [
  '.', '.', '.', '.',
  '.....bbn',
  '....bbbbjjj',
  '...bbwwwmuu',
  '...bwwwwuuu',
  '..vvwwwwsuu',
  '.vvvzwwwsyy',
  'vvv.tzwiiy',
  'vv.ttt..l.l',
];
const HUM_PECK = [
  '.', '.',
  'tt',
  '.ttvv',
  '..vvvbbbb',
  '...vwwwbbbn',
  '...wwwwwuuj',
  '....zwwsuuu',
  '.....iisyy',
  '.......l.l',
  '.......l.l',
];
const HUM_BLUR_UP = [
  '..B.B.B',
  '.BBBBBBB',
  '..BBBBBBB',
  '...BBBBBB',
];
const HUM = {
  feetX: 9,
  heads: HUM_HEADS,
  frames: {
    idle0: { head: ['level', 6, 0], body: HUM_PERCH },
    idle1: { head: ['level', 6, 1], body: ['.', ...HUM_PERCH.slice(0, 4), '.....bbn', ...HUM_PERCH.slice(5)] },
    hop0: { head: ['level', 6, 2], body: ['.', '.', ...HUM_BLUR_UP, ...HUM_PERCH.slice(4)], under: [] },
    hop1: { head: ['level', 6, 2], body: ['.', '.', '.', '.', '.', '.', ...HUM_PERCH.slice(4, 8), '.BBvwwwwsuu', 'BBvvzwwwsyy', 'BBv.tzwiiy', '.B.ttt..l.l'] },
    peck0: { head: ['down', 8, 1], body: HUM_PECK },
    peck1: { head: ['down', 8, 3], body: HUM_PECK },
  },
  fly: [
    { head: ['up', 7, 2], body: [
      '.B.B.B.B',
      'BBBBBBBBB',
      '.BBBBBBBBB',
      '..BBBBBBBB',
      '...BBBBBBb',
      '.....BBbbb',
      '......bwwbjj',
      '.....vwwwwuj',
      '....vvzwwsuu',
      '...tt.zwiyy',
      '..ttt..iiy',
      '.ttt',
      'tt',
    ] },
    { head: ['up', 7, 2], body: [
      '.', '.', '.',
      'B.B.B',
      'BBBBBBB',
      'BBBBBBBBbb',
      '.BBBBBBbbbjj',
      '.BBBBBwwwwuj',
      'BBBBvvzwwsuu',
      '...tt.zwiyy',
      '..ttt..iiy',
      '.ttt',
      'tt',
    ] },
    { head: ['up', 7, 2], body: [
      '.', '.', '.', '.', '.',
      '........bb',
      '.......bbbjj',
      '....BBbwwwuj',
      '..BBBBBBwsuu',
      '.BBBBBBBBiyy',
      'BBBBBBBBBy',
      '.BBBBBBBB',
      'B.B.B.B',
    ] },
    { head: ['up', 7, 2], body: [
      '.', '.', '.',
      '..B.B',
      '.BBBBBB.',
      'BBBBBBBBbb',
      '.BBBBBBbbbjj',
      '..BBBvwwwwuj',
      '...BvvzwwsuU',
      '...tt.zwiyy',
      '..ttt..iiy',
      '.ttt',
      'tt',
    ].map((r) => r.replace('U', 'u')) },
  ],
};

// ---------------------------------------------------------------- kingfisher
const KING_HEADS = {
  level: [
    '...Q.QQ.........',
    '..QqqqqQ........',
    '.qqqqcccc.......',
    '..nccccccc......',
    '.nncc1occc......',
    'nnncc3eacckkk...',
    'nnnffaaakkkkkkkk',
    '.nnfffjjhhhhh...',
    '..jjjjjjj.......',
  ],
  down: [
    '...Q.QQ.........',
    '..QqqqqQ........',
    '.qqqqcccc.......',
    '..nccccccc......',
    '.nncc1occc......',
    'nnncc3eacck.....',
    'nnnffaaakkkk....',
    '.nnfffjjhkkkk...',
    '..jjjjjjjhkkk...',
    '..........kkk...',
    '...........kk...',
    '...........kg...',
  ],
};
const KING_BODY = [
  '.', '.', '.', '.', '.', '.', '.', '.',
  '...bbb',
  '...bbbbbmmmmmm',
  '..bbwwwwwmmmuuu',
  '..bwwwwxwwmuuuu',
  '..pwwxwwwwuuuuu',
  '..vvwwwxwwuuuuu',
  '.tvvvzzzwwuuuu',
  'ttvvvzzzzyyyy',
  'tr..vvvzziyyy',
  'r.........l.l',
  '.........ll.ll',
];
const KING = {
  feetX: 11,
  heads: KING_HEADS,
  frames: {
    idle0: { head: ['level', 4, 0], body: KING_BODY },
    idle1: { head: ['level', 4, 0], body: [...KING_BODY.slice(0, 14), '.tvvvzzzwwuuuu', 'ttvvvzzzzyyyy', 'trr.vvvzziyyy', 'rr........l.l', '.........ll.ll'] },
    hop0: { head: ['level', 4, 1], body: ['.', ...KING_BODY.slice(0, 17), '.........ll.ll'] },
    hop1: { head: ['level', 4, 0], body: [...KING_BODY.slice(0, 17), '.........l..l', '........ll.ll'] },
    peck0: { head: ['down', 7, 1], body: [
      '.', '.', '.', '.', '.',
      'r.....bbbbb',
      'trbbbbbbbbbbmm',
      '.tvvwwwwwwmmmuu',
      '..vvwxwwwxwmuuu',
      '...vvzzzwwwuuuu',
      '....vvzzzwiyyyy',
      '..........iyyy',
      '..........l.l',
      '.........ll.ll',
    ] },
    peck1: { head: ['down', 8, 2], body: [
      '.', '.', '.', '.', '.',
      'r.....bbbbb',
      'trbbbbbbbbbbmm',
      '.tvvwwwwwwmmmuu',
      '..vvwxwwwxwmuuu',
      '...vvzzzwwwuuuu',
      '....vvzzzwiyyyy',
      '..........iyyy',
      '..........l.l',
      '.........ll.ll',
    ] },
  },
  fly: [
    { head: ['level', 12, 6], body: [
      '.......v..WW',
      '......vv.WWW',
      '......vvvWWW',
      '.....vvvzxWWW',
      '.....vvzzxwWW',
      '....vvzzxxwdWW',
      '.....zzzxxwwdd',
      '......zzxwwwdd',
      '.......zxwwwd',
      '.....bbbbbbwdd',
      'tt..bbbbbbbbbbb',
      'ttrrbbbbbbbbbbmm',
      'rrrtpiiiyyyyyuuu',
      'r....iiyyyyyuu',
    ] },
    { head: ['level', 12, 6], body: [
      '.', '.', '.',
      '..WW',
      'vvWWWW',
      'vvvvvWWWW',
      '.vvvvvzzWWW',
      '..vvvzzxxwwdd',
      '....zzzxxwwwdd',
      '.....bbbbbbwdd',
      'tt..bbbbbbbbbbb',
      'ttrrbbbbbbbbbbmm',
      'rrrtpiiiyyyyyuuu',
      'r....iiyyyyyuu',
    ] },
    { head: ['level', 12, 7], body: [
      '.', '.', '.', '.', '.', '.', '.', '.', '.', '.',
      '.....bbbbbb',
      'tt..bbbbbbbbbbb',
      'ttrrbbbbwwwwwddmm',
      'rrrtpiizzxxwwdduu',
      'r....izzxxwwdyuu',
      '....vvzzxww',
      '...vvvzz',
      '..vvvv',
      '..vv',
    ] },
    { head: ['level', 12, 6], body: [
      '.', '.', '.', '.', '.', '.', '.', '.',
      '......WWW',
      '.....bbbbWW',
      'tt..bbbbbbbbbbb',
      'ttrrbbbbbxxwwddmm',
      'rvvvvzzzzxxwwduuu',
      'vvvvzzzzyyyyuu',
      'vv',
    ] },
  ],
};

const INK_BLACK = ['#4c5272', '#262433', '#18161f', '#0e0c14', '#08060c'];

// Small birds: the songbird rig with body rows/columns cut out (head stays
// the same size, so they get cuter proportions rather than smaller faces).
function cutRows(rows, delRows, delCols) {
  return rows.filter((_, y) => !delRows.includes(y)).map((r) => [...r].filter((_, x) => !delCols.includes(x)).join(''));
}
function cutFrame(rig, f, c) {
  const head = f.head && rig.heads[f.head[0]];
  const o = { ...f, body: cutRows(f.body, c.rows, c.cols) };
  if (head) o.head = [f.head[0], f.head[1] - c.cols.filter((x) => x < f.head[1]).length, f.head[2] - c.rows.filter((y) => y < f.head[2] + head.length).length];
  return o;
}
function cutRig(rig, cuts) {
  const frames = {};
  for (const [n, f] of Object.entries(rig.frames)) frames[n] = cutFrame(rig, f, cuts[n] || cuts.ground);
  return { ...rig, frames, fly: rig.fly.map((f, i) => cutFrame(rig, f, cuts.fly[i])), feetX: rig.feetX - cuts.ground.cols.filter((x) => x < rig.feetX).length };
}
const FINCH = cutRig(SONG, {
  ground: { rows: [9, 15], cols: [1, 5] },
  hop0: { rows: [9, 14], cols: [1, 5] },
  hop1: { rows: [9, 15], cols: [1, 5] },
  peck0: { rows: [4, 13], cols: [1, 5] },
  peck1: { rows: [4, 13], cols: [1, 5] },
  fly: [{ rows: [3], cols: [1, 5] }, { rows: [4], cols: [1, 5] }, { rows: [16], cols: [1, 5] }, { rows: [], cols: [1, 5] }],
});

// ---------------------------------------------------------------- species
const P = (c, p, pat) => ({ c, p, pat });
const BIRD_DEFS = {
  bluejay: { name: 'Blue Jay', rig: SONG, colors: ['#3f78d8', '#f2f4f8', '#20222e'], pal: {
    q: '#5a90ea', Q: 'q', c: '#4f86e0', o: 'c', 1: 'c', a: '#20222e', 3: 'f', f: '#f2f4f8', j: '#f2f4f8', m: '#20222e',
    u: '#e2e6ee', y: '#f2f4f8', s: '#d4dae4', i: '#f6f8fa', b: '#3f72cc', d: '#5a92e8', w: '#3a6cd0', X: 'w', x: '#f4f6fa',
    z: P('#3462c4', '#1c2a5e', 'bar'), v: '#24449a', t: P('#3a6cd0', '#1c2a5e', 'bar'), r: '#f4f6fa', k: '#22202a', l: '#4a4656' } },
  cardinal: { name: 'Northern Cardinal', rig: SONG, colors: ['#e83a2c', '#2a1418', '#f4823a'], pal: { 1: '#d8dcec',
    q: '#ee4432', Q: 'q', c: '#e83a2c', f: 'c', a: '#2a1418', 2: 'a', 3: 'c', j: '#2a1418', u: '#ee4a36', y: '#d93a2e',
    b: '#c22e28', w: '#b42a2a', z: '#a02428', t: '#a52a2e', k: '#f4823a', G: 'k', h: '#d4602c', l: '#9a6a5a' } },
  chickadee: { name: 'Black-capped Chickadee', rig: FINCH, colors: ['#1c1820', '#f6f4ee', '#8a8f9a'], pal: {
    c: '#1c1820', a: 'c', 3: 'c', f: '#fbfaf4', 2: 'f', j: '#1c1820', 4: 'j', m: '#f6f4ee', u: '#f6f4ee', y: '#efe6d6', s: '#e6c49a', i: 'y',
    b: '#8a8f9a', w: '#767c88', x: '#e6e8ec', z: P('#6a707c', '#e6e8ec', 'bar'), t: '#6a707c', k: '#2a2430', l: '#4e4a58' } },
  robin: { name: 'American Robin', rig: SONG, colors: ['#e2672a', '#34302e', '#f4c030'], pal: {
    c: '#34302e', f: 'c', 1: '#f4f0ea', 2: '#f4f0ea', j: P('#34302e', '#f0ece6', 'streak'), 4: 'j', m: 'u', u: '#e2672a', s: '#d45e28', y: '#e8743a', i: '#f2eee8',
    b: '#6a5e5a', w: '#625650', X: 'w', z: '#564a46', t: '#2e2a2a', k: '#f4c030', h: '#d89a20', l: '#b48a5a' } },
  grayjay: { name: 'Canada Jay', rig: SONG, colors: ['#80848e', '#f4f4f0', '#3e4048'], pal: {
    c: '#f6f6f2', n: '#3e4048', 3: 'n', o: 'c', f: '#f2f2ee', j: '#f2f2ee', m: 'u', u: '#d6d8d8', y: '#e2e2de', s: 'u',
    b: '#7e828c', w: '#6c717c', x: '#a4a8b2', z: P('#7c808a', '#c8ccd2', 'bar'), t: '#6c717c', r: '#c8ccd2', k: '#1e1c24', l: '#3e3a44' } },
  crow: { name: 'American Crow', rig: CROW, colors: ['#262433', '#4c5272', '#18161f'], pal: {
    c: INK_BLACK, f: 'c', j: 'c', u: 'c', y: 'c', b: 'c', w: 'c', v: ['#3e4260', '#1c1a26', '#121018', '#0a080e', '#060408'], t: 'v', e: '#06040a', E: '#9aa0c0', 1: 'c',
    k: '#1a1820', g: 'k', l: '#1e1c24' } },
  goldfinch: { name: 'American Goldfinch', rig: FINCH, colors: ['#ffd42a', '#1e1c22', '#f4f4ec'], pal: {
    c: '#1e1c22', n: '#ffd42a', o: 'c', 1: 'c', 3: 'f', a: 'f', f: '#ffd42a', j: '#ffd42a', u: '#ffd42a', y: '#ffe25a', s: 'y', i: '#f6f4ea',
    b: '#f6c820', p: '#fbe46a', d: '#ffd42a', w: '#1e1c22', X: 'w', x: '#f4f4ec', z: P('#1e1c22', '#f4f4ec', 'bar'), v: '#1a181e', t: '#1e1c22', r: '#f4f4ec',
    k: '#f29a4a', h: '#d47a3a', l: '#c49a7a' } },
  sparrow: { name: 'House Sparrow', rig: FINCH, colors: ['#9a6a3c', '#8c8c94', '#1e1a1c'], pal: { 1: '#d8dcec',
    c: '#8c8c94', n: '#9a5a30', o: 'n', 3: 'n', a: '#1e1a1c', f: '#d8d8d4', 2: 'f', j: '#1e1a1c', 4: 'j', m: '#2a2224', u: '#bcbcb8', y: '#cacac6', s: 'u', i: 'y',
    b: P('#9a6a3c', '#2a2020', 'streak'), p: '#8a7a6a', d: '#a86c3a', w: '#8a5a32', X: '#f2f0e8', x: 'w', z: P('#6e4a30', '#c8a070', 'bar'), t: '#6e5a4a', k: '#2a2428', l: '#c8a08a' } },
  hummingbird: { name: 'Ruby-throated Hummingbird', rig: HUM, colors: ['#3aa04a', '#d81e3a', '#f2f2ee'], pal: {
    c: '#3aa04a', n: 'c', o: 'c', 1: 'c', a: 'c', 3: '#f2f2ee', f: '#3a8a44', j: ['#ff5a6a', '#d81e3a', '#a0142a', '#6a0c1c', '#3a0612'], m: '#f2f2ee', u: '#f2f2ee', s: '#9ab890', y: '#e8ece4', i: 'y',
    b: '#34983e', p: 'b', w: '#4a5a4e', z: '#3a483e', v: '#2e3a32', t: '#2a3a30', r: 't', k: '#1e1c22', l: '#2a2630', B: P('#dfe8f0', null, 'check') } },
  dove: { name: 'Mourning Dove', rig: DOVE, colors: ['#c8aa8c', '#a8aebe', '#2a2228'], pal: {
    c: '#a8aebe', n: '#b8a8a8', 1: 'c', a: '#c8b49c', 3: '#2a2228', f: '#cdb69a', 2: '#9ac4e0', j: '#d8c0a4', m: 'u', u: '#d8b8a0', y: '#e0c8b0', s: '#ccb094', i: '#e8dccc',
    b: '#b09a84', p: '#a8988a', d: '#b8a28a', w: P('#b8a28a', '#2a2228', 'spot'), X: 'w', x: 'w', z: P('#a8927a', '#2a2228', 'spot'), v: '#6a6070',
    t: '#9a8a7c', r: P('#f2eee8', '#2a2228', 'bar'), k: '#2a2228', h: 'k', l: '#e08a8a' } },
  magpie: { name: 'Black-billed Magpie', rig: MAGPIE, colors: ['#1e1c26', '#f6f6f2', '#2a6a7a'], pal: {
    c: INK_BLACK, f: 'c', j: 'c', m: 'c', u: '#f6f6f2', b: 'c', y: '#f6f6f2', s: 'y', i: 'c', p: '#8a8c98',
    d: '#f6f6f2', X: 'd', w: ['#4a7ab0', '#22385e', '#182a48', '#0e1830', '#08101e'], x: 'w', z: 'w', v: ['#5a8ab8', '#1c2c4c', '#141e36', '#0a1020', '#060a14'],
    t: ['#4aa0a0', '#22606e', '#18444e', '#0e2a32', '#081820'], r: ['#5a7ab8', '#283c74', '#1a2a54', '#0e1830', '#08101e'],
    e: '#06040a', E: '#9aa0c0', 1: 'c', k: '#1a1820', g: null, l: '#1e1c24' } },
  woodpecker: { name: 'Downy Woodpecker', rig: SONG, colors: ['#1e1c22', '#f8f8f4', '#e03030'], pal: {
    c: '#1e1c22', n: 'c', 5: '#e8302e', o: '#f8f8f4', 1: 'o', a: '#1e1c22', 3: 'a', f: '#f8f8f4', 2: 'f', 4: '#1e1c22', j: '#f8f8f4', m: 'u', u: '#f4f2ec', y: '#eae8e2', s: 'y',
    b: '#f4f2ec', p: '#1e1c22', d: '#1e1c22', w: P('#1e1c22', '#f8f8f4', 'spot'), X: '#1e1c22', x: '#1e1c22', z: '#1e1c22', v: P('#16141a', '#f0f0ec', 'spot'), t: '#1e1c22', r: '#f2f0ea',
    k: '#4a4652', g: 'k', l: '#5e5a66' } },
  flicker: { name: 'Northern Flicker', rig: SONG, colors: ['#a07a52', '#f0dcc0', '#e02c2c'], pal: {
    c: '#8e8e96', n: 'c', 5: '#e02c2c', o: 'c', 1: 'f', f: '#e8cfa4', a: 'f', 3: 'f', 4: '#1e1a1c', j: '#e8cfa4', m: '#1e1a1c',
    u: P('#f0dcc0', '#2a2224', 'spot'), y: P('#f4e6d0', '#2a2224', 'spot'), s: 'y', i: '#f4ece0',
    b: P('#a07a52', '#5a3e2a', 'dash'), p: '#f4f0e8', d: 'w', w: P('#9a724c', '#4e3624', 'dash'), X: 'w', x: 'w', z: P('#8e6a46', '#4e3624', 'dash'), v: '#d8a838', t: '#26222a', r: 't',
    k: '#3a3640', g: 'k', l: '#6a6070' } },
  waxwing: { name: 'Cedar Waxwing', rig: SONG, colors: ['#b08a62', '#f0d870', '#1e1a1c'], pal: { 1: '#d8dcec',
    q: '#a8825a', Q: 'q', c: '#a8825a', o: '#f4f0e8', a: '#1e1a1c', 3: 'a', f: '#b08a62', 2: 'f', j: '#2a2024', 4: 'f', m: 'u', u: '#b8906a', y: '#ead070', s: '#c8a870', i: '#f4f0e0',
    b: '#8e7a66', p: '#8c8c94', d: '#8a7e7a', w: '#7e7a80', X: 'w', x: 'w', z: P('#6e6a72', '#e03a2a', 'fleck'), v: '#4e4a52', t: '#6e6a72', r: '#f6d830', k: '#2a2428', l: '#3a3440' } },
  blackbird: { name: 'Red-winged Blackbird', rig: SONG, colors: ['#1c1a22', '#e0302a', '#f2d040'], pal: {
    c: ['#3a3c52', '#1c1a22', '#121018', '#0a080e', '#060408'], f: 'c', j: 'c', u: 'c', y: 'c', b: 'c', w: 'c', d: '#e83a2a', X: '#f2d040', x: 'c', z: 'c', v: 'c', t: 'c',
    e: '#06040a', 1: '#9aa0bc', k: '#1c1a22', g: 'k', l: '#2a2630' } },
  oriole: { name: 'Baltimore Oriole', rig: SONG, colors: ['#ff8a1e', '#1a181e', '#f4f0e8'], pal: {
    c: '#1a181e', f: 'c', j: 'c', m: 'c', u: '#ff8a1e', y: '#ffa02a', s: 'u', i: 'y', b: '#1e1c22', p: '#ff9020', d: '#ff8a1e',
    w: '#1e1c22', X: 'w', x: '#f4f0e8', z: P('#1e1c22', '#f4f0e8', 'bar'), t: '#1e1c22', r: '#ff8a1e', e: '#06040a', 1: '#9aa0bc', k: '#5a5a64', g: 'k', l: '#4a4652' } },
  swallow: { name: 'Barn Swallow', rig: SWALLOW, colors: ['#2a4a9a', '#c8502a', '#f0b880'], pal: { 1: '#d8dcec',
    V: 'v', F: '#203878', h: null,
    c: '#2e54a8', n: 'c', o: 'c', f: 'c', a: '#c8502a', 3: 'c', j: '#c8502a', 4: 'j', m: '#2a3a7a', u: '#f0b880', y: '#f4c890', s: 'u', i: 'y',
    b: '#2a4a9a', w: '#26408a', z: '#203878', v: '#1a2a5a', t: '#203878', k: '#1e1c22', l: '#2a2630' } },
  bluebird: { name: 'Eastern Bluebird', rig: SONG, colors: ['#3a7ae0', '#d9743a', '#f4f0ea'], pal: { 1: '#d8dcec',
    c: '#3a7ae0', f: 'c', a: 'c', 3: 'c', j: '#d9743a', 4: 'j', m: 'u', u: '#d9743a', s: '#cc6a34', y: '#f4f0ea', i: 'y',
    b: '#3a72d8', w: '#3a72d8', z: '#2e60c0', v: '#22489a', t: '#3468d0', k: '#2a2430', l: '#3e3a48' } },
  bunting: { name: 'Indigo Bunting', rig: FINCH, colors: ['#2a5ad8', '#3a78f0', '#8a90a0'], pal: { 1: '#d8dcec',
    c: '#3c82ff', f: '#3070f0', j: 'f', u: '#2c64e8', y: '#2856d4', b: '#2a58d8', w: '#1e3ca8', x: 'w', z: '#1a2e88', v: '#121a4a', t: '#16246a',
    k: '#9aa0b0', h: '#6a7080', l: '#3e3a48' } },
  snowbunting: { name: 'Snow Bunting', rig: FINCH, colors: ['#f6f6f2', '#1e1c22', '#e0a870'], pal: {
    c: '#e0a870', n: 'c', o: '#f6f6f2', 1: 'o', a: '#f6f6f2', 3: '#d89a64', f: '#f6f6f2', 2: 'f', j: '#f6f6f2', m: '#ecc49a', u: '#f8f6f0', y: '#fbfaf6', s: 'u',
    b: P('#b08458', '#2a2020', 'streak'), p: '#f6f6f2', d: '#f8f8f4', w: '#f6f6f2', X: 'w', x: 'w', z: '#ecece8', v: '#1e1c22', t: '#1e1c22', r: '#f6f6f2', k: '#f0b040', h: '#c88a30', l: '#1e1c22' } },
  junco: { name: 'Dark-eyed Junco', rig: FINCH, colors: ['#5a5e6a', '#f2f2ee', '#f0b8b0'], pal: { 1: '#d8dcec',
    c: '#545864', f: 'c', j: 'c', m: 'c', u: '#5a5e6a', s: '#f2f2ee', y: '#f2f2ee', i: 'y', b: '#4e525e', w: '#4a4e5a', z: '#42464f', t: '#3e424c', r: '#f2f2ee',
    k: '#f0b8b0', h: '#d89a94', l: '#c8a090' } },
  kingfisher: { name: 'Belted Kingfisher', rig: KING, colors: ['#4a7ab8', '#f6f6f2', '#1e1c22'], pal: {
    q: '#4a7ab8', Q: 'q', c: '#4a7ab8', n: '#4272ae', o: 'c', 1: 'c', 3: 'c', a: '#f6f6f2', f: '#4272ae', j: '#f6f6f2', m: '#4a7ab8', u: '#f6f6f2', y: '#f2f2ee', s: 'y', i: 'y',
    b: '#3e6aa6', p: 'b', w: '#3e6aa6', x: 'w', z: P('#36609a', '#f6f6f2', 'chev'), v: P('#2a4a7e', '#f6f6f2', 'spot'), t: P('#36609a', '#f6f6f2', 'bar'), r: 't',
    k: '#1e1c22', h: '#3a3640', g: 'k', l: '#3a3440' } },
  grosbeak: { name: 'Evening Grosbeak', rig: SONG, colors: ['#ffd830', '#1c1a20', '#5a4a2a'], pal: { 1: '#d8dcec',
    c: '#ffd830', n: '#5a4a2a', o: '#ffd830', a: '#5a4a2a', 3: 'n', f: 'n', j: 'n', 4: 'n', m: '#a8902a', u: '#c8a83a', y: '#ffd830', s: 'y', i: 'y',
    b: '#a8902a', p: '#ffd830', d: '#1c1a20', w: '#1c1a20', X: 'w', x: 'w', z: '#f6f6f2', v: '#141218', t: '#1c1a20',
    k: '#e0e8a0', G: 'k', h: '#c0c878', l: '#b09898' } },
  redpoll: { name: 'Common Redpoll', rig: FINCH, colors: ['#d8203a', '#f0a0a8', '#9a8a78'], pal: {
    c: '#d8203a', n: P('#a09080', '#5a4a3a', 'streak'), o: 'n', 1: 'n', a: '#2a2024', 3: 'f', f: '#d8ccc0', 2: 'f', j: '#2a2024', 4: 'f', m: 'u', u: '#f0a0a8', y: '#f6f2ee',
    s: P('#f6f2ee', '#7a6a5a', 'streak'), i: 'y', b: P('#9a8a78', '#4a3a30', 'streak'), w: '#6e5e50', X: 'w', x: '#f4f0e8', z: P('#5e5044', '#e8e0d4', 'bar'), t: '#5a4a40',
    k: '#f0d060', h: '#c8a840', l: '#4a3a40' } },
  tanager: { name: 'Scarlet Tanager', rig: SONG, colors: ['#e8202a', '#1a1820', '#d8c8a0'], pal: { 1: '#d8dcec',
    c: '#ec2a2c', f: 'c', j: 'c', u: '#ec2a2c', y: '#e02428', b: '#d8202a', p: 'b', d: '#1a1820', w: '#1a1820', X: 'w', z: '#141218', v: '#100e14', t: '#1a1820',
    k: '#d8c8a0', h: '#b8a880', l: '#5a5260' } },
  snowyowl: { name: 'Snowy Owl', rig: OWL, colors: ['#f6f6f2', '#f4c81e', '#3a3440'], pal: {
    c: P('#f8f8f4', '#3a3440', 'chev'), n: 'c', o: '#fbfbf8', a: '#4a4452', Y: '#f4c81e', e: '#120a16', k: '#2a2430', h: '#4a4452',
    b: P('#f4f4f0', '#3a3440', 'chev'), u: P('#fafaf6', '#5a5460', 'chev'), y: '#f8f8f4', w: P('#f2f2ee', '#2e2a36', 'chev'), z: 'w', x: 'w', d: 'w',
    v: P('#e8e8e6', '#2e2a36', 'spot'), t: P('#f0f0ec', '#2e2a36', 'spot'), l: '#fbfbf8', K: '#2a2430', p: 'b', s: 'y', i: 'y' } },
};

// ---------------------------------------------------------------- exports
// EXTRA_SPRITES[`${id}_${anim}`]() -> frames (built on first call, then cached)
//   idle/hop/peck: ground anchor (ax = w/2, ay = h, feet on the bottom row,
//   canvas padded so the feet sit on ax and flipping does not shift the bird)
//   fly: centre anchor (ax = w/2, ay = h/2)
export const BIRD_IDS = Object.keys(BIRD_DEFS);
export const BIRD_ART = {};
export const EXTRA_SPRITES = {};
for (const [id, def] of Object.entries(BIRD_DEFS)) {
  BIRD_ART[id] = { name: def.name, colors: def.colors };
  const b = buildBird(def.rig, def.pal);
  for (const a of ['idle', 'hop', 'peck', 'fly']) {
    let cache = null;
    EXTRA_SPRITES[`${id}_${a}`] = () => (cache ||= b[a]()).map((f) => ({ ...f, data: f.data.slice() }));
  }
}
