// Animated 2D pixel faces for the voxel bears. Each bear owns one tiny
// CanvasTexture (NearestFilter) that is mapped onto three planes of the rig:
// the eye plate on the flat front of the head, the upper muzzle (nose / upper
// lip) and the jaw front (chin), so drawn mouth shapes follow the 3D jaw.
//
// Texel grid: 2 texels per body voxel, so face pixels line up with voxels.
// Canvas layout (32 x 32):
//   eyes  x 0..25  y 0..13   (26 x 14)  head front, voxels x -6.5..6.5, y 22..29
//   upper x 0..13  y 16..21  (14 x 6)   muzzle front, x -3.5..3.5, y 20..23 (nose covers cols 4..9 rows 0..1, 6..7 rows 2..3)
//   lower x 16..25 y 16..19  (10 x 4)   jaw front, x -2.5..2.5, y 18..20
// The canvas is only redrawn (and re-uploaded) when the visible state changes.
import * as THREE from 'three';

export const FACE_W = 32, FACE_H = 32;
export const FACE_REGIONS = {
  eyes: { x: 0, y: 0, w: 26, h: 14 },
  upper: { x: 0, y: 16, w: 14, h: 6 },
  lower: { x: 16, y: 16, w: 10, h: 4 },
  band: { x: 0, y: 23, w: 32, h: 7 }, // armband lettering (bosses with an armband)
};
// where the planes sit on the head, in body voxel coordinates
export const FACE_QUADS = {
  eyes: { x0: -6.5, x1: 6.5, y0: 22, y1: 29, z: 7.5 },
  upper: { x0: -3.5, x1: 3.5, y0: 20, y1: 23, z: 9.5 },
  lower: { x0: -2.5, x1: 2.5, y0: 18, y1: 20, z: 9.5 },
};

export const FACE_EXPRESSIONS = ['neutral', 'happy', 'hungry', 'excited', 'chomp_open', 'chomp_closed', 'yummy', 'love',
  'angry', 'furious', 'sad', 'shocked', 'sleepy', 'disgusted', 'smug', 'cheer', 'roar', 'dizzy', 'content',
  // eating styles (see bearRig eat_* poses)
  'gape', 'stuffed', 'bliss', 'strain', 'dainty', 'slurp', 'aim'];

// jaw: how far the 3D jaw opens (0..1). blink: auto-blink allowed. anim: has animated frames.
export const FACE_INFO = {
  neutral: { jaw: 0, blink: true },
  happy: { jaw: 0.34, blink: true },
  hungry: { jaw: 0.22, blink: true, anim: true },
  excited: { jaw: 0.55, blink: true, anim: true },
  chomp_open: { jaw: 1, blink: false },
  chomp_closed: { jaw: 0, blink: false, anim: true },
  yummy: { jaw: 0.06, blink: false, anim: true },
  love: { jaw: 0.1, blink: false, anim: true },
  angry: { jaw: 0, blink: true },
  furious: { jaw: 0.62, blink: false, anim: true },
  sad: { jaw: 0, blink: true, anim: true },
  shocked: { jaw: 0.75, blink: false },
  sleepy: { jaw: 0, blink: true, anim: true },
  disgusted: { jaw: 0.25, blink: true },
  smug: { jaw: 0, blink: true },
  cheer: { jaw: 0.9, blink: false, anim: true },
  roar: { jaw: 1, blink: false, anim: true },
  dizzy: { jaw: 0.3, blink: false, anim: true },
  content: { jaw: 0, blink: false, anim: true },
  gape: { jaw: 1, blink: false, anim: true }, // jaw unhinged (the rig's maw does the heavy lifting)
  stuffed: { jaw: 0, blink: false, anim: true }, // cheeks bulging, lips pressed shut
  bliss: { jaw: 0.06, blink: false, anim: true }, // eyes closed, slow happy chewing
  strain: { jaw: 0, blink: false, anim: true }, // tug-of-war effort
  dainty: { jaw: 0.04, blink: true }, // fine dining: snooty lids, prim little mouth
  slurp: { jaw: 0.12, blink: false, anim: true }, // lips puckered, cheeks sucked in
  aim: { jaw: 0.9, blink: false, anim: true }, // eyes up on a tossed snack, mouth wide
};
// palette keys that also light up the emissive (glow) map
const GLOW_KEYS = new Set(['Q', 'q', 'X', 'Y']);
const FONT = {
  S: ['###', '#..', '###', '..#', '###'], E: ['###', '#..', '##.', '#..', '###'], C: ['###', '#..', '#..', '#..', '###'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], A: ['.#.', '#.#', '###', '#.#', '#.#'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], O: ['###', '#.#', '#.#', '#.#', '###'], N: ['#.#', '###', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'], P: ['##.', '#.#', '##.', '#..', '#..'], L: ['#..', '#..', '#..', '#..', '###'],
};

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const lum = (c) => (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;
function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// ---------------------------------------------------------------- sprites
// Left-eye sprites; the right eye is drawn mirrored (col c -> 25 - c).
const EYE = {
  open: ['.KKK.', 'KKKKK', 'KKKKK', 'KKKKK', 'KKKKK', '.KKK.'],
  cub: ['.KKKK.', 'KKKKKK', 'KKKKKK', 'KKKKKK', 'KKKKKK', 'KKKKKK', '.KKKK.'],
  blink: ['KKKKK', '.KKK.'],
  cubBlink: ['KKKKKK', '.KKKK.'],
  happy: ['.KKK.', 'KK.KK', 'K...K'],
  happyCub: ['..KK..', '.KKKK.', 'KK..KK', 'K....K'],
  squeeze: ['KK...', '..KK.', '....K', '..KK.', 'KK...'], // ">" (left eye; right mirrors to "<")
  half: ['KKKKK', 'KKKKK', '.KKK.'],
  sleepy: ['BBBBB', 'KKKKK', '.KKK.'],
  narrow: ['KKKK.', 'KKKKK', '.KKK.'],
  shock: ['.WWW.', 'WWWWW', 'WWKWW', 'WWWWW', '.WWW.'],
  shockCub: ['.WWWW.', 'WWWWWW', 'WWKKWW', 'WWKKWW', 'WWWWWW', '.WWWW.'],
  wide: ['.KKK.', 'KKKKK', 'KKKKK', 'KKKKK', 'KKKKK', 'KKKKK', '.KKK.'],
  heart: ['.R.R.', 'RRRRR', 'RRRRR', '.RRR.', '..R..'],
  heartBig: ['RR.RR', 'RRRRR', 'RRRRR', 'RRRRR', '.RRR.', '..R..'],
  furious: ['KKKKK', '.KKK.'],
};

export class BearFace {
  /**
   * @param {object} o
   * @param {number} o.fur fur colour (hex)
   * @param {number} o.furLight muzzle colour (hex)
   * @param {boolean} [o.cub]
   * @param {number} [o.glasses] frame colour
   * @param {number} [o.shades] lens colour
   * @param {number} [o.monocle] ring colour
   * @param {boolean} [o.boss] scary-cute boss variants of angry / furious / roar
   * @param {number} [o.glow] glowing-eye colour (adds an emissive map: this.glowTexture)
   * @param {boolean} [o.scar] scar over the left eye
   * @param {number} [o.halfmoon] half-moon reading glasses frame colour
   * @param {boolean} [o.icy] icy auditor stare
   * @param {number} [o.markings] glowing spirit markings colour (eyes glow too)
   * @param {string} [o.band] armband lettering
   * @param {boolean} [o.goldTooth]
   */
  constructor(o) {
    this.o = o;
    const cv = (this.canvas = document.createElement('canvas'));
    cv.width = FACE_W; cv.height = FACE_H;
    this.ctx = cv.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    const t = (this.texture = new THREE.CanvasTexture(cv));
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    const fur = o.fur, light = o.furLight;
    const dark = lum(fur) < 0.22, white = lum(fur) > 0.8;
    this.pal = {
      K: '#1c1117',
      W: '#ffffff',
      w: '#cfe8ff',
      B: hex(dark ? mixHex(fur, light, 0.6) : white ? 0x9a9aa4 : mixHex(fur, 0x1a1010, 0.62)),
      P: hex(white ? 0xf49aac : 0xf27a94),
      p: hex(white ? 0xfbc4cf : 0xf8a8b8),
      R: '#ff3f6c',
      r: '#b8173e',
      T: '#f45f80',
      t: '#c83a58',
      M: hex(mixHex(light, 0x1a0c0c, 0.74)),
      I: '#5a1422',
      H: '#fffaf0',
      C: '#58c4ff',
      c: '#bdeeff',
      D: '#d8f6ff',
      S: '#fff3a0',
      V: '#ff2a2a',
      F: '#e2403e',
      G: '#8cc05a',
      g: '#6a9a3a',
      L: '#e4f4f8',
      E: hex(o.glasses ?? 0x1a1a1a),
      Z: hex(o.shades ?? 0x121218),
      z: '#6a7a9a',
      O: hex(o.monocle ?? 0xe8c040),
      o: '#fff2b0',
      Q: hex(o.glow ?? 0xff3030),
      q: hex(mixHex(o.glow ?? 0xff3030, 0x000000, 0.35)),
      X: '#fffbe8',
      Y: hex(o.markings ?? 0x5ff8ff),
      J: '#e9a6a0',
      j: '#9a4a4a',
      h: hex(o.halfmoon ?? 0xd8b860),
      N: '#203048',
      // [v18 bear looks] eye colour + eye patch
      A: hex(o.iris ?? 0x1c1117),
      a: hex(o.iris2 ?? o.iris ?? 0x1c1117),
      n: '#241c1e',
    };
    this.cg = o.iris != null ? new Uint8Array(FACE_W * FACE_H) : null; // char grid for the iris pass
    if (o.glow || o.markings) {
      // emissive map: glowing pixels in colour, everything else black
      const g = (this.glowCanvas = document.createElement('canvas'));
      g.width = FACE_W; g.height = FACE_H;
      this.gctx = g.getContext('2d');
      const gt = (this.glowTexture = new THREE.CanvasTexture(g));
      gt.magFilter = THREE.NearestFilter; gt.minFilter = THREE.NearestFilter; gt.generateMipmaps = false; gt.colorSpace = THREE.SRGBColorSpace;
    }
    // spirit bears: the eyes themselves glow
    this.eyeMap = o.markings ? { K: 'Q', W: 'X', w: 'X' } : null;
    this.key = '';
    this.expr = 'neutral';
  }

  px(x, y, c) {
    if (this.eyeMap && y < 14 && this.eyeMap[c]) c = this.eyeMap[c];
    if (this.cg && x >= 0 && y >= 0 && x < FACE_W && y < FACE_H) this.cg[y * FACE_W + x] = c.charCodeAt(0);
    this.ctx.fillStyle = this.pal[c] || c;
    this.ctx.fillRect(x, y, 1, 1);
    if (this.gctx) {
      this.gctx.fillStyle = GLOW_KEYS.has(c) ? this.pal[c] : '#000';
      this.gctx.fillRect(x, y, 1, 1);
    }
  }

  rect(x, y, w, h, c) {
    this.ctx.fillStyle = this.pal[c] || c;
    this.ctx.fillRect(x, y, w, h);
  }

  // Draw a string sprite at (x, y) inside a region; mirror=true flips horizontally.
  spr(rows, x, y, mirror = false, reg = FACE_REGIONS.eyes) {
    const w = rows[0].length;
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < w; i++) {
        const ch = row[mirror ? w - 1 - i : i];
        if (ch === '.' || ch === ' ') continue;
        this.px(reg.x + x + i, reg.y + y + j, ch);
      }
    }
  }

  // Left sprite at column x plus its mirror image for the right eye.
  pair(rows, x, y, mirrorRight = true) {
    const w = rows[0].length;
    this.spr(rows, x, y, false);
    this.spr(rows, 26 - x - w, y, mirrorRight);
  }

  // Region-local pixel helpers (x2 = mirrored pair)
  e(x, y, c) { this.px(x, y, c); }
  e2(x, y, c) { this.px(x, y, c); this.px(25 - x, y, c); }
  u(x, y, c) { this.px(FACE_REGIONS.upper.x + x, FACE_REGIONS.upper.y + y, c); }
  u2(x, y, c) { this.u(x, y, c); this.u(13 - x, y, c); }
  l(x, y, c) { this.px(FACE_REGIONS.lower.x + x, FACE_REGIONS.lower.y + y, c); }
  l2(x, y, c) { this.l(x, y, c); this.l(9 - x, y, c); }

  /** Redraw if needed. s = { expr, blink, frame, lookX, lookY } */
  draw(s) {
    const info = FACE_INFO[s.expr] || FACE_INFO.neutral;
    const blink = s.blink && info.blink;
    const frame = info.anim ? s.frame : 0;
    const key = `${s.expr}|${blink ? 1 : 0}|${frame}|${s.lookX | 0}|${s.lookY | 0}`;
    if (key === this.key) return false;
    this.key = key;
    this.expr = s.expr;
    this.ctx.clearRect(0, 0, FACE_W, FACE_H);
    if (this.gctx) this.gctx.clearRect(0, 0, FACE_W, FACE_H);
    if (this.cg) this.cg.fill(0);
    const st = { blink, frame, lx: s.lookX | 0, ly: s.lookY | 0, cub: !!this.o.cub };
    const fn = (this.o.boss && BOSS_DRAW[s.expr]) || (this.o.icy && ICY_DRAW[s.expr]) || DRAW[s.expr] || DRAW.neutral;
    fn(this, st);
    if (this.cg) this.irisPass();
    this.extras(s.expr, st);
    this.texture.needsUpdate = true;
    if (this.glowTexture) this.glowTexture.needsUpdate = true;
    return true;
  }

  // [v18 bear looks] colour the inside of the open eyes (K pixels fully surrounded by eye pixels)
  irisPass() {
    const cg = this.cg, R = FACE_REGIONS.eyes;
    const K = 75, inEye = (c) => c === K || c === 87 || c === 119 || c === 83; // K W w S
    const hits = [];
    for (let y = R.y + 1; y < R.y + R.h - 1; y++)
      for (let x = R.x + 1; x < R.x + R.w - 1; x++) {
        const i = y * FACE_W + x;
        if (cg[i] !== K) continue;
        if (inEye(cg[i - 1]) && inEye(cg[i + 1]) && inEye(cg[i - FACE_W]) && inEye(cg[i + FACE_W])) hits.push(x, y);
      }
    for (let i = 0; i < hits.length; i += 2) this.px(hits[i], hits[i + 1], hits[i] < 13 ? 'A' : 'a');
  }

  // always-on decorations drawn over every expression
  extras(expr, st) {
    const o = this.o;
    if (o.eyepatch) {
      // [v18 bear looks] pirate eye patch over the left eye (the strap is voxels on the head)
      this.spr(['..KKKKK..', '.KnnnnnK.', 'KnnnnnnnK', 'KnnnnnnnK', 'KnnnnnnnK', 'KnnnnnnnK', '.KnnnnnK.', '..KKKKK..'], 2, 3);
      this.px(1, 3, 'K'); this.px(0, 2, 'K'); this.px(10, 3, 'K'); this.px(11, 2, 'K'); this.px(12, 1, 'K');
    }
    if (o.scar) {
      // diagonal scar through the left brow and cheek (the eye survived)
      for (const [x, y] of [[4, 0], [5, 1], [5, 2], [6, 3], [8, 10], [8, 11], [9, 12], [9, 13]]) this.px(x, y, 'J');
      this.px(4, 2, 'j'); this.px(6, 2, 'j'); this.px(7, 11, 'j'); this.px(9, 11, 'j');
    }
    if (o.markings) {
      // spirit warpaint: forehead diamond, cheek lines
      for (const [x, y] of [[12, 0], [13, 0], [11, 1], [14, 1], [12, 2], [13, 2]]) this.px(x, y, 'Y');
      this.e2(1, 10, 'Y'); this.e2(0, 11, 'Y'); this.e2(2, 11, 'Y'); this.e2(1, 12, 'Y');
      if (st.frame % 8 < 4) this.e2(1, 11, 'X');
    }
    if (o.goldTooth && FACE_INFO[expr]?.jaw > 0.2) this.u(10, 5, 'O');
    if (o.band) {
      const r = FACE_REGIONS.band;
      const text = o.band.toUpperCase();
      const w = text.length * 4 - 1;
      let x = r.x + Math.max(0, Math.floor((r.w - w) / 2));
      for (const ch of text) {
        const g = FONT[ch];
        if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#') this.px(x + i, r.y + 1 + j, 'K');
        x += 4;
      }
    }
  }

  // ---- boss pieces -----------------------------------------------------------
  // thick, angry brows (V) and glowing slit eyes
  bossBrows(raise = 0) {
    this.pair(['BBB.....', 'BBBBBB..', '.BBBBBBB', '...BBBBB'], 1, 2 - raise);
  }

  glowEyes(st, kind = 'slit') {
    if (kind === 'slit') {
      this.pair(['QQ....', 'QQQQ..', 'qQXXQQ', '.qQQQ.'], 3, 6);
    } else {
      // big round furious glare
      this.pair(['.QQQQ.', 'QQXXQQ', 'QXXXXQ', 'QQXXQQ', '.QQQQ.'], 3, 5);
      if (st.frame % 2) { this.e2(2, 7, 'q'); this.e2(9, 7, 'q'); }
    }
  }

  // gritted teeth with long fangs (closed jaw)
  fangGrin() {
    this.u2(1, 4, 'M');
    for (let x = 1; x <= 12; x++) this.u(x, 5, 'H');
    for (const x of [5, 8]) this.u(x, 5, 'M');
    this.u2(3, 4, 'H');
    for (let x = 0; x <= 9; x++) { this.l(x, 0, 'H'); this.l(x, 1, 'M'); }
    for (const x of [3, 6]) this.l(x, 0, 'M');
    this.l2(1, 1, 'H');
  }

  // open roaring mouth: dark maw, big fangs top and bottom
  maw() {
    this.u(6, 3, 'M'); this.u(7, 3, 'M');
    for (let x = 1; x <= 12; x++) { this.u(x, 4, x === 1 || x === 12 ? 'M' : 'I'); this.u(x, 5, 'I'); }
    this.u2(2, 4, 'H'); this.u2(2, 5, 'H'); this.u2(3, 5, 'H');
    for (let x = 4; x <= 9; x++) this.u(x, 5, x === 4 || x === 9 ? 'H' : 'I');
    for (let x = 0; x <= 9; x++) this.l(x, 0, 'I');
    for (let x = 2; x <= 7; x++) this.l(x, 1, 'T');
    this.l(4, 1, 't'); this.l(5, 1, 't');
    this.l2(0, 0, 'M'); this.l2(1, 0, 'H'); this.l2(1, 1, 'H'); this.l2(0, 1, 'M');
    for (let x = 0; x <= 9; x++) this.l(x, 2, 'M');
  }

  drool(st, side = 1) {
    const f = st.frame % 8;
    const x = side > 0 ? 9 : 0;
    this.l(x, 1, 'D');
    if (f >= 1) this.l(x, 2, 'D');
    if (f >= 3) this.l(x, 3, 'c');
    if (f >= 5 && f < 7) this.l(x - side, 3, 'c');
  }

  // ---- eyes ----------------------------------------------------------------
  lensUnder() {
    const o = this.o;
    if (o.halfmoon) this.pair(['.LLLLLLL.', '.LLLLLLL.', '..LLLLL..'], 2, 9);
    if (o.glasses) this.pair(['.LLLLL.', 'LLLLLLL', 'LLLLLLL', 'LLLLLLL', 'LLLLLLL', 'LLLLLLL', '.LLLLL.'], 3, 3);
    if (o.monocle) this.spr(['.LLLLL.', 'LLLLLLL', 'LLLLLLL', 'LLLLLLL', 'LLLLLLL', 'LLLLLLL', '.LLLLL.'], 16, 3);
  }

  // frames / shades on top of whatever the eyes are doing
  eyewear(expr) {
    const o = this.o;
    if (o.glasses) {
      const ring = ['..EEEEE..', '.E.....E.', 'E.......E', 'E.......E', 'E.......E', 'E.......E', 'E.......E', '.E.....E.', '..EEEEE..'];
      this.pair(ring, 2, 2);
      for (let x = 11; x <= 14; x++) this.e(x, 5, 'E');
      this.e2(1, 5, 'E'); this.e2(0, 5, 'E');
      this.e2(4, 4, 'W'); this.e2(5, 3, 'W');
    }
    if (o.shades) {
      if (expr === 'love') {
        this.pair(['RR..RR', 'RRRRRR', 'RRRRRR', '.RRRR.', '..RR..'], 3, 4);
        this.e2(4, 4, 'W');
      } else {
        const tall = expr === 'shocked' || expr === 'chomp_open' || expr === 'excited';
        const lens = tall ? ['ZZZZZZZ', 'ZZZZZZZ', 'ZZZZZZZ', 'ZZZZZZZ', '.ZZZZZ.'] : ['ZZZZZZZ', 'ZZZZZZZ', 'ZZZZZZZ', '.ZZZZZ.'];
        const y = tall ? 4 : 5;
        this.pair(lens, 3, y);
        this.e(4, y + 1, 'W'); this.e(5, y, 'z'); this.e(17, y + 1, 'W'); this.e(18, y, 'z');
        if (expr === 'furious' || expr === 'angry') { this.e(7, y + 2, 'V'); this.e(20, y + 2, 'V'); }
      }
      for (let x = 10; x <= 15; x++) this.e(x, 5, 'Z');
      this.e2(2, 5, 'Z'); this.e2(1, 5, 'Z');
    }
    if (o.halfmoon) {
      // half-moon reading glasses perched low on the snout
      this.pair(['hhhhhhhhh', 'h.......h', '.h.....h.', '..hhhhh..'], 2, 8);
      for (let x = 11; x <= 14; x++) this.e(x, 9, 'h');
      this.e2(1, 8, 'h'); this.e2(0, 8, 'h');
      this.e2(4, 10, 'W');
    }
    if (o.monocle) {
      this.spr(['..OOOOO..', '.O.....O.', 'O.......O', 'O.......O', 'O.......O', 'O.......O', 'O.......O', '.O.....O.', '..OOOOO..'], 15, 2);
      this.e(17, 3, 'o'); this.e(18, 3, 'o');
      this.e(21, 11, 'O'); this.e(22, 12, 'O');
    }
  }

  // ordinary open eyes (adults 5x6, cubs 6x7) with highlights, honouring look offset
  openEyes(st, { sparkle = -1, pupil = false, dy = 0 } = {}) {
    const lx = st.lx, ly = st.ly + dy;
    if (st.cub) {
      const x = 3 + lx, y = 3 + ly, xr = 17 + lx;
      this.spr(EYE.cub, x, y); this.spr(EYE.cub, xr, y, true);
      for (const ex of [x, xr]) {
        this.px(ex + 1, y + 1, 'W'); this.px(ex + 2, y + 1, 'W'); this.px(ex + 1, y + 2, 'W'); this.px(ex + 2, y + 2, 'W');
        this.px(ex + 4, y + 4, 'w');
        if (sparkle >= 0) {
          const a = sparkle % 2 === 0;
          this.px(ex + 4, y + 4, a ? 'S' : 'W');
          if (a) { this.px(ex + 3, y + 1, 'W'); this.px(ex + 1, y + 3, 'W'); this.px(ex + 4, y + 5, 'S'); }
        }
      }
      return;
    }
    const x = 4 + lx, y = 4 + ly, xr = 17 + lx;
    this.spr(EYE.open, x, y); this.spr(EYE.open, xr, y, true);
    for (const ex of [x, xr]) {
      this.px(ex + 1, y + 1, 'W'); this.px(ex + 2, y + 1, 'W'); this.px(ex + 1, y + 2, 'W');
      if (pupil) this.px(ex + 3, y + 4, 'w');
      if (sparkle >= 0) {
        const a = sparkle % 2 === 0;
        this.px(ex + 3, y + 4, a ? 'S' : 'W');
        if (a) { this.px(ex + 2, y + 2, 'W'); this.px(ex + 3, y + 3, 'S'); this.px(ex + 1, y, 'W'); }
        else this.px(ex + 2, y + 3, 'W');
      }
    }
  }

  blinkEyes(st) {
    if (st.cub) this.pair(EYE.cubBlink, 3, 7);
    else this.pair(EYE.blink, 4, 7);
  }

  happyEyes(st) {
    if (st.cub) this.pair(EYE.happyCub, 3, 5);
    else this.pair(EYE.happy, 4, 5);
  }

  blush(big = false) {
    if (big) { this.pair(['.PPP', 'PPPP', '.PP.'], 0, 9); this.e2(1, 9, 'p'); }
    else { this.pair(['PPP', 'PPP'], 1, 10); this.e2(1, 10, 'p'); }
  }

  // ---- mouths --------------------------------------------------------------
  philtrum() { this.u(6, 4, 'M'); this.u(7, 4, 'M'); this.u(6, 5, 'M'); this.u(7, 5, 'M'); }

  wMouth() {
    this.philtrum();
    this.u2(2, 5, 'M');
    this.l2(1, 0, 'M'); this.l2(2, 0, 'M'); this.l2(3, 0, 'M');
  }

  smile() {
    this.philtrum();
    this.u2(1, 4, 'M'); this.u2(2, 5, 'M');
    for (let x = 1; x <= 8; x++) this.l(x, 0, 'M');
    this.l(4, 1, 'T'); this.l(5, 1, 'T');
  }

  openTop({ fangs = true, teeth = false } = {}) {
    // dark top of the mouth right under the nose so an open jaw reads well
    this.u(6, 4, 'M'); this.u(7, 4, 'M');
    for (let x = 2; x <= 11; x++) this.u(x, 5, 'I');
    this.u2(1, 4, 'M'); this.u2(1, 5, 'M');
    if (teeth) for (let x = 2; x <= 11; x++) this.u(x, 5, 'H');
    else if (fangs) { this.u2(3, 5, 'H'); }
  }

  lowerLip({ tongue = true, teeth = false } = {}) {
    for (let x = 1; x <= 8; x++) this.l(x, 0, 'I');
    if (tongue) { for (let x = 2; x <= 7; x++) this.l(x, 0, 'T'); this.l(4, 0, 't'); this.l(5, 0, 't'); }
    if (teeth) { this.l2(1, 0, 'H'); this.l2(2, 0, 'H'); }
    this.l2(0, 0, 'M');
  }

  frown() {
    this.philtrum();
    this.l(4, 0, 'M'); this.l(5, 0, 'M');
    this.l2(3, 0, 'M'); this.l2(2, 1, 'M'); this.l2(1, 2, 'M');
  }
}

// ---------------------------------------------------------------- expressions
const DRAW = {
  neutral(F, st) {
    F.lensUnder();
    if (st.blink) F.blinkEyes(st); else F.openEyes(st);
    if (st.cub) F.blush();
    F.eyewear('neutral');
    F.wMouth();
  },

  happy(F, st) {
    F.lensUnder();
    if (st.blink) F.happyEyes(st); else F.openEyes(st, { pupil: true });
    F.blush(st.cub);
    F.eyewear('happy');
    F.openTop({ fangs: false });
    F.lowerLip({ tongue: true });
  },

  hungry(F, st) {
    F.lensUnder();
    // eyes locked on the food: looking down and in (a little cross-eyed)
    if (st.blink) F.blinkEyes(st);
    else if (st.cub) F.openEyes({ ...st, lx: 0, ly: 1 }, { pupil: true });
    else {
      F.spr(EYE.open, 5, 5); F.spr(EYE.open, 16, 5, true);
      for (const ex of [5, 16]) { F.px(ex + 1, 6, 'W'); F.px(ex + 2, 6, 'W'); F.px(ex + 1, 7, 'W'); }
    }
    // hopeful brows
    F.e2(4, 2, 'B'); F.e2(5, 1, 'B'); F.e2(6, 1, 'B'); F.e2(7, 2, 'B');
    if (st.cub) F.blush();
    F.eyewear('hungry');
    F.openTop({ fangs: true });
    F.lowerLip({ tongue: true });
    F.l(6, 1, 'T'); F.l(6, 2, 'T'); F.l(5, 1, 'T');
    // drool drips from the corner (frames 0..5)
    const f = st.frame % 6;
    F.u(11, 5, 'D');
    F.l(8, 0, 'D');
    if (f >= 1) F.l(8, 1, 'D');
    if (f >= 2) F.l(8, 2, 'D');
    if (f >= 3) F.l(8, 3, 'c');
    if (f === 4) F.l(7, 3, 'c');
  },

  excited(F, st) {
    F.lensUnder();
    if (st.blink) F.happyEyes(st);
    else if (st.cub) F.openEyes(st, { sparkle: st.frame });
    else {
      F.pair(EYE.wide, 4, 3);
      const a = st.frame % 2 === 0;
      for (const ex of [4, 17]) {
        F.px(ex + 1, 4, 'W'); F.px(ex + 2, 4, 'W'); F.px(ex + 1, 5, 'W');
        F.px(ex + 3, 7, a ? 'S' : 'W'); if (a) { F.px(ex + 2, 6, 'W'); F.px(ex + 3, 8, 'S'); }
      }
    }
    F.e2(4, 1, 'B'); F.e2(5, 0, 'B'); F.e2(6, 0, 'B'); F.e2(7, 1, 'B');
    F.blush(true);
    F.eyewear('excited');
    F.openTop({ fangs: true });
    F.lowerLip({ tongue: true });
  },

  chomp_open(F, st) {
    F.lensUnder();
    if (st.cub) F.pair(EYE.cub, 3, 2);
    else F.pair(EYE.wide, 4, 3);
    for (const ex of st.cub ? [3, 17] : [4, 17]) { F.px(ex + 1, st.cub ? 3 : 4, 'W'); F.px(ex + 1, st.cub ? 4 : 5, 'W'); }
    F.e2(3, 1, 'B'); F.e2(4, 0, 'B'); F.e2(5, 0, 'B'); F.e2(6, 0, 'B'); F.e2(7, 1, 'B');
    if (st.cub) F.blush();
    F.eyewear('chomp_open');
    F.openTop({ fangs: true });
    F.u2(4, 5, 'H');
    F.lowerLip({ tongue: true, teeth: true });
  },

  chomp_closed(F, st) {
    F.lensUnder();
    F.pair(EYE.squeeze, 4, 4);
    F.blush(true);
    F.eyewear('chomp_closed');
    // puffed cheeks + munching wavy mouth
    F.philtrum();
    const a = st.frame % 2;
    for (let x = 0; x <= 9; x++) F.l(x, (x + a) % 2, 'M');
    F.u2(0, 4, 'P'); F.u2(0, 5, 'P');
  },

  yummy(F, st) {
    F.lensUnder();
    F.happyEyes(st);
    F.blush(true);
    F.eyewear('yummy');
    F.philtrum();
    // closed smile
    F.u2(1, 4, 'M'); F.u2(2, 5, 'M');
    for (let x = 1; x <= 8; x++) F.l(x, 0, 'M');
    // tongue sweeping across the upper lip (ping-pong)
    const seq = [0, 1, 2, 3, 2, 1];
    const k = seq[st.frame % 6];
    const tx = 2 + k * 2;
    F.u(tx, 5, 'T'); F.u(tx + 1, 5, 'T'); F.u(tx + 2, 5, 'T'); F.u(tx + 1, 4, 'T');
    F.l(tx - 1, 0, 'T'); F.l(tx, 0, 'T');
  },

  love(F, st) {
    F.lensUnder();
    if (!F.o.shades) {
      const beat = st.frame % 4 === 1;
      const h = beat ? EYE.heart : EYE.heartBig;
      F.spr(h, 4, 4); F.spr(h, 17, 4, true);
      F.px(5, 5, beat ? 'R' : 'W'); F.px(18, 5, beat ? 'R' : 'W');
    }
    F.blush(true);
    F.eyewear('love');
    F.smile();
  },

  angry(F, st) {
    F.lensUnder();
    if (st.blink) F.blinkEyes(st);
    else { F.spr(EYE.narrow, 4, 6); F.spr(EYE.narrow, 17, 6, true); F.px(5, 7, 'W'); F.px(18, 7, 'W'); }
    // V brows, thick, slanting down to the middle
    F.pair(['BB.....', 'BBBB...', '..BBBB.', '....BB.'], 2, 1);
    F.eyewear('angry');
    // gritted teeth
    F.u2(1, 4, 'M');
    for (let x = 1; x <= 12; x++) F.u(x, 5, 'H');
    for (const x of [3, 6, 9]) F.u(x + 1, 5, 'M');
    for (let x = 0; x <= 9; x++) F.l(x, 0, 'H');
    for (let x = 0; x <= 9; x++) F.l(x, 1, 'M');
    for (const x of [2, 5, 8]) F.l(x, 0, 'M');
  },

  furious(F, st) {
    // red flush across the face (dithered)
    for (let y = 0; y <= 13; y++)
      for (let x = 0; x <= 25; x++) {
        const edge = x < 3 || x > 22;
        if ((x + y) % 2 === 0 && (y < 3 || (edge && y > 7))) F.px(x, y, 'F');
      }
    F.lensUnder();
    F.spr(EYE.furious, 4, 6); F.spr(EYE.furious, 17, 6, true);
    F.px(5, 6, 'V'); F.px(20, 6, 'V');
    F.pair(['BB.....', 'BBBB...', '.BBBBB.', '...BBB.'], 2, 2);
    // anger vein popping on the forehead
    const big = st.frame % 2 === 0;
    if (big) F.spr(['.V.V.', 'VV.VV', '.....', 'VV.VV', '.V.V.'], 19, 0);
    else F.spr(['V.V', '...', 'V.V'], 20, 1);
    F.eyewear('furious');
    F.openTop({ fangs: true });
    F.u2(4, 5, 'H');
    F.lowerLip({ tongue: false, teeth: true });
  },

  sad(F, st) {
    F.lensUnder();
    if (st.blink) F.blinkEyes(st);
    else {
      F.openEyes(st, { pupil: true, dy: 1 });
      // wobbly wet highlight
      if (!st.cub) { F.px(6, 8, 'w'); F.px(19, 8, 'w'); F.px(7, 9, 'c'); F.px(20, 9, 'c'); }
    }
    // worried brows (inner ends up)
    F.pair(['....BB.', '..BBB..', 'BBB....'], 2, 1);
    F.eyewear('sad');
    // tears streaming down the cheeks
    const f = st.frame % 4;
    F.e2(3, 10, 'C'); F.e2(3, 11, f % 2 ? 'c' : 'C');
    F.e2(2, 12, f < 2 ? 'C' : 'c');
    if (f >= 2) F.e2(2, 13, 'C');
    F.frown();
  },

  shocked(F, st) {
    F.lensUnder();
    if (st.cub) F.pair(EYE.shockCub, 3, 3); else F.pair(EYE.shock, 4, 4);
    F.e2(3, 1, 'B'); F.e2(4, 0, 'B'); F.e2(5, 0, 'B'); F.e2(6, 0, 'B'); F.e2(7, 1, 'B');
    // sweat drop
    F.e(23, 1, 'c'); F.e(23, 2, 'C'); F.e(22, 3, 'C'); F.e(23, 3, 'C'); F.e(24, 3, 'C'); F.e(23, 4, 'C');
    F.eyewear('shocked');
    // "O" mouth
    F.u(6, 4, 'M'); F.u(7, 4, 'M');
    for (let x = 3; x <= 10; x++) F.u(x, 5, 'I');
    F.u2(2, 5, 'M'); F.u2(2, 4, 'M');
    for (let x = 2; x <= 7; x++) F.l(x, 0, 'I');
    F.l2(1, 0, 'M'); F.l2(1, 1, 'M'); for (let x = 2; x <= 7; x++) F.l(x, 1, 'M');
  },

  sleepy(F, st) {
    F.lensUnder();
    if (st.blink) F.blinkEyes(st);
    else { F.spr(EYE.sleepy, 4, 6); F.spr(EYE.sleepy, 17, 6, true); }
    if (st.cub) F.blush();
    F.eyewear('sleepy');
    F.philtrum();
    F.u2(2, 5, 'M');
    F.l2(2, 0, 'M'); F.l2(3, 0, 'M'); F.l(4, 0, 'M'); F.l(5, 0, 'M');
    // snot bubble breathing in and out beside the nose
    const f = st.frame % 10;
    const r = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0][f];
    if (r >= 1) { F.u(10, 2, 'c'); F.u(10, 3, 'c'); F.u(11, 3, 'c'); F.u(11, 2, 'D'); }
    if (r >= 2) { F.u(12, 1, 'c'); F.u(12, 2, 'c'); F.u(11, 1, 'c'); F.u(12, 3, 'c'); F.u(11, 2, 'W'); }
  },

  disgusted(F, st) {
    F.lensUnder();
    // one eye squinting, the other half open & sceptical
    F.spr(['KKKKK', '.KKK.'], 4, 7);
    if (st.blink) F.spr(EYE.blink, 17, 7, true); else { F.spr(EYE.half, 17, 6, true); F.px(18, 6, 'W'); }
    F.spr(['.....BB', '..BBB..', 'BB.....'], 2, 3);
    F.spr(['BBBB...', '....BBB'], 17, 1);
    // queasy green under the eyes
    F.e2(2, 10, 'G'); F.e2(3, 11, 'G'); F.e2(1, 11, 'g'); F.e2(4, 10, 'g');
    F.eyewear('disgusted');
    F.philtrum();
    // "blegh": wavy lip + tongue hanging out
    for (let x = 0; x <= 13; x++) if (x < 6 || x > 7) F.u(x, 5, x % 2 ? 'M' : 'I');
    F.l(3, 0, 'T'); F.l(4, 0, 'T'); F.l(5, 0, 'T'); F.l(4, 1, 'T'); F.l(5, 1, 'T'); F.l(4, 2, 't'); F.l(5, 2, 'T');
  },

  smug(F, st) {
    F.lensUnder();
    if (st.blink) F.blinkEyes(st);
    else {
      // half-lidded, looking to the side
      F.spr(EYE.half, 5, 7); F.spr(EYE.half, 18, 7, true);
      F.rect(5, 7, 5, 1, 'B'); F.rect(18, 7, 5, 1, 'B');
      F.px(7, 8, 'W'); F.px(20, 8, 'W');
    }
    F.spr(['.BBBBB.'], 3, 4); // flat brow
    F.spr(['..BBB..', 'BB...BB'], 16, 1); // raised brow
    F.eyewear('smug');
    F.philtrum();
    // one-sided smirk
    F.u(2, 5, 'M');
    F.l(1, 0, 'M'); F.l(2, 0, 'M'); F.l(3, 0, 'M'); F.l(4, 0, 'M'); F.l(5, 0, 'M');
    F.l(6, 0, 'M'); F.u(10, 5, 'M'); F.u(11, 4, 'M'); F.u(12, 4, 'M');
  },

  cheer(F, st) {
    F.lensUnder();
    F.happyEyes(st);
    F.blush(true);
    F.eyewear('cheer');
    if (st.frame % 2 === 0) { F.e(1, 2, 'S'); F.e(24, 3, 'S'); F.e(0, 3, 'W'); } else { F.e(2, 1, 'W'); F.e(23, 2, 'W'); F.e(25, 1, 'S'); }
    F.openTop({ fangs: false });
    F.lowerLip({ tongue: true });
  },
};

// ---------------------------------------------------------------- new (v3)
DRAW.roar = (F, st) => {
  F.lensUnder();
  F.pair(EYE.furious, 4, 6);
  F.px(6, 7, 'W'); F.px(19, 7, 'W');
  F.pair(['BB.....', 'BBBB...', '.BBBBB.', '...BBB.'], 2, 2);
  F.eyewear('furious');
  F.maw();
  F.drool(st, 1);
};

DRAW.dizzy = (F, st) => {
  F.lensUnder();
  // spinning spiral eyes
  const SP = [['KKKK.', '...K.', '.K.K.', '.KKK.', '.....'], ['.KKKK', '.K...', '.K.K.', '.KKK.', '.....'],
    ['.....', '.KKK.', '.K.K.', '.K...', '.KKKK'], ['.....', '.KKK.', '.K.K.', '...K.', 'KKKK.']];
  const a = SP[st.frame % 4], b = SP[(st.frame + 2) % 4];
  F.spr(a, 4, 5); F.spr(b, 17, 5, true);
  F.eyewear('dizzy');
  // wobbly mouth + sweat
  F.philtrum();
  for (let x = 1; x <= 8; x++) F.l(x, (x + st.frame) % 3 === 0 ? 1 : 0, 'M');
  F.e(23, 2, 'c'); F.e(23, 3, 'C');
  // little stars
  const k = st.frame % 4;
  F.e(1 + k * 2, 0, 'S'); F.e(20 - k * 2, 1, 'S');
};

DRAW.content = (F, st) => {
  F.lensUnder();
  F.happyEyes({ ...st, blink: true });
  F.blush(true);
  F.eyewear('content');
  F.philtrum();
  F.u2(1, 4, 'M'); F.u2(2, 5, 'M');
  for (let x = 1; x <= 8; x++) F.l(x, 0, 'M');
  F.l(4, 1, 'T'); F.l(5, 1, 'T');
  if (st.frame % 16 < 8) { F.e(24, 0, 'W'); F.e(23, 1, 'W'); } // a little contented sparkle
};

// ---------------------------------------------------------------- eating styles (v10)
// Eyes rolled up towards a treat held (or flying) overhead: white rings, tiny pupils at the top.
const EYE_UP = ['.KKK.', 'KWKWK', 'KWKWK', 'KWWWK', 'KWWWK', '.KKK.'];
const EYE_UP_CUB = ['.KKKK.', 'KWKKWK', 'KWKKWK', 'KWWWWK', 'KWWWWK', 'KWWWWK', '.KKKK.'];
function upEyes(F, st) {
  if (st.cub) F.pair(EYE_UP_CUB, 3, 2);
  else F.pair(EYE_UP, 4, 2);
}

DRAW.gape = (F, st) => {
  // the jaw has come off its hinges: eyes popping, brows sky high, drool
  F.lensUnder();
  upEyes(F, st);
  F.e2(3, 1, 'B'); F.e2(4, 0, 'B'); F.e2(5, 0, 'B'); F.e2(6, 0, 'B'); F.e2(7, 1, 'B');
  F.blush(true);
  F.eyewear('shocked');
  F.openTop({ teeth: true });
  F.lowerLip({ tongue: true, teeth: true });
  F.drool(st, 1);
  if (st.frame % 4 < 2) { F.e(0, 1, 'S'); F.e(25, 2, 'W'); } else { F.e(1, 0, 'W'); F.e(24, 1, 'S'); }
};

DRAW.stuffed = (F, st) => {
  // mouth full: eyes squeezed, cheeks ballooned pink, lips pressed into a wobbly line
  F.lensUnder();
  F.pair(EYE.squeeze, 4, 4);
  F.pair(['.PPP', 'PPpP', 'PPPP', '.PP.'], 0, 9);
  F.e2(1, 9, 'p');
  F.eyewear('chomp_closed');
  F.philtrum();
  const a = st.frame % 4 < 2 ? 0 : 1;
  for (let x = 2; x <= 7; x++) F.l(x, (x + a) % 3 === 0 ? 1 : 0, 'M');
  F.u2(0, 4, 'P'); F.u2(0, 5, 'P'); F.u2(1, 5, 'p');
  F.l2(0, 1, 'P');
};

DRAW.bliss = (F, st) => {
  // eyes closed, savouring every bite: slow chewing, sparkles
  F.lensUnder();
  F.happyEyes({ ...st, blink: true });
  F.blush(true);
  F.eyewear('content');
  F.philtrum();
  const f = st.frame % 6;
  if (f < 3) { F.u2(2, 5, 'M'); F.l2(1, 0, 'M'); F.l2(2, 0, 'M'); F.l2(3, 0, 'M'); F.l(4, 1, 'M'); F.l(5, 1, 'M'); }
  else { F.u2(1, 5, 'M'); for (let x = 2; x <= 7; x++) F.l(x, 0, 'M'); F.l(4, 1, 'T'); F.l(5, 1, 'T'); }
  const s = st.frame % 8 < 4;
  F.e(s ? 1 : 2, s ? 2 : 1, 'S'); F.e(s ? 24 : 23, s ? 1 : 3, s ? 'W' : 'S');
};

DRAW.strain = (F, st) => {
  // tug-of-war: eyes screwed shut, gritted teeth, sweat flying
  for (let y = 9; y <= 12; y++) for (let x = 0; x <= 25; x++) if ((x + y) % 2 === 0 && (x < 3 || x > 22)) F.px(x, y, 'F');
  F.lensUnder();
  F.pair(['KKKKK', '.KKK.', 'K...K'], 4, 6);
  F.pair(['BB.....', '.BBB...', '...BBB.'], 2, 2);
  F.eyewear('furious');
  F.u2(1, 4, 'M');
  for (let x = 1; x <= 12; x++) F.u(x, 5, 'H');
  for (const x of [3, 6, 9]) F.u(x + 1, 5, 'M');
  for (let x = 0; x <= 9; x++) { F.l(x, 0, 'H'); F.l(x, 1, 'M'); }
  for (const x of [2, 5, 8]) F.l(x, 0, 'M');
  const f = st.frame % 6;
  F.e(23, f < 3 ? 1 : 2, 'c'); F.e(23, f < 3 ? 2 : 3, 'C'); F.e(24, f < 3 ? 2 : 3, 'C');
  if (f >= 3) { F.e(1, 1, 'c'); F.e(1, 2, 'C'); }
};

DRAW.dainty = (F, st) => {
  // fine dining: snooty half lids, arched brows, a prim little "o"
  F.lensUnder();
  if (st.blink) F.blinkEyes(st);
  else {
    F.spr(EYE.half, 4, 7); F.spr(EYE.half, 17, 7, true);
    F.rect(4, 7, 5, 1, 'B'); F.rect(17, 7, 5, 1, 'B');
    F.px(6, 8, 'W'); F.px(19, 8, 'W');
    F.e2(3, 7, 'K'); F.e2(2, 6, 'K'); // lashes flicked out
  }
  F.pair(['.BBB.', 'B...B'], 4, 3);
  F.blush();
  F.eyewear('smug');
  F.philtrum();
  F.l(4, 0, 'I'); F.l(5, 0, 'I'); F.l2(3, 0, 'M'); F.l(4, 1, 'M'); F.l(5, 1, 'M');
};

DRAW.slurp = (F, st) => {
  // SLUUURP: eyes squeezed, cheeks sucked in, lips pursed into a tight O
  F.lensUnder();
  F.pair(EYE.squeeze, 4, 4);
  F.e2(4, 1, 'B'); F.e2(5, 1, 'B'); F.e2(6, 2, 'B');
  const pull = st.frame % 4 < 2;
  F.e2(pull ? 2 : 1, 9, 'B'); F.e2(2, 10, 'B'); F.e2(pull ? 2 : 3, 11, 'B'); F.e2(3, 12, 'B');
  F.eyewear('chomp_closed');
  F.u(6, 3, 'M'); F.u(7, 3, 'M');
  F.u(5, 4, 'T'); F.u(6, 4, 'T'); F.u(7, 4, 'T'); F.u(8, 4, 'T');
  F.u(5, 5, 'T'); F.u(6, 5, 'I'); F.u(7, 5, 'I'); F.u(8, 5, 'T');
  F.l(3, 0, 'T'); F.l(4, 0, 'I'); F.l(5, 0, 'I'); F.l(6, 0, 'T'); F.l(4, 1, 'T'); F.l(5, 1, 'T');
};

DRAW.aim = (F, st) => {
  // eyes locked on the snack flying overhead, jaws wide, tongue ready
  F.lensUnder();
  upEyes(F, st);
  F.pair(['BBBB...', '...BBB.'], 2, 0);
  F.eyewear('chomp_open');
  F.openTop({ fangs: true });
  F.u2(4, 5, 'H');
  F.lowerLip({ tongue: true, teeth: true });
  if (st.frame % 2) { F.l(4, 1, 'T'); F.l(5, 1, 'T'); } else { F.l(4, 1, 'T'); F.l(5, 1, 'T'); F.l(5, 2, 't'); }
};

// Scary-cute boss variants (fangs, glowing eyes, thick brows, drool)
const BOSS_DRAW = {
  neutral(F, st) {
    (F.o.icy ? ICY_DRAW.neutral : DRAW.neutral)(F, st);
    // stern, heavy brows even when calm (not the serene spirit bear)
    if (!F.o.markings && !F.o.icy) F.pair(['BBBB....', '.BBBBBB.', '....BBB.'], 2, 1);
    if (F.o.goldTooth) { F.l(6, 0, 'O'); F.l(7, 0, 'M'); }
  },
  angry(F, st) {
    F.lensUnder();
    F.glowEyes(st, 'slit');
    F.bossBrows();
    F.eyewear('angry');
    F.fangGrin();
    F.drool(st, 1);
  },
  furious(F, st) {
    for (let y = 0; y <= 13; y++)
      for (let x = 0; x <= 25; x++) if ((x + y) % 2 === 0 && (x < 3 || x > 22) && y > 7) F.px(x, y, 'F');
    F.lensUnder();
    F.glowEyes(st, 'round');
    F.bossBrows(1);
    if (st.frame % 2 === 0) F.spr(['.V.V.', 'VV.VV', '.....', 'VV.VV', '.V.V.'], 20, 0);
    F.eyewear('furious');
    F.maw();
    F.drool(st, 1); F.drool({ frame: st.frame + 4 }, -1);
  },
  roar(F, st) {
    F.lensUnder();
    F.glowEyes(st, 'round');
    F.bossBrows(1);
    F.eyewear('furious');
    F.maw();
    F.drool(st, 1); F.drool({ frame: st.frame + 3 }, -1);
  },
};

// Polar auditor: a cold, half-lidded, unimpressed stare
const ICY_DRAW = {
  neutral(F, st) {
    F.lensUnder();
    if (st.blink) F.blinkEyes(st);
    else {
      F.spr(['BBBBB', 'NNNNN', 'NcNNN', '.NNN.'], 4, 6); F.spr(['BBBBB', 'NNNNN', 'NcNNN', '.NNN.'], 17, 6, true);
      F.px(5, 7, 'w'); F.px(20, 7, 'w');
    }
    F.pair(['BBBBBB', '....BB'], 3, 3);
    F.eyewear('neutral');
    F.philtrum();
    for (let x = 2; x <= 7; x++) F.l(x, 0, 'M');
  },
  smug(F, st) { ICY_DRAW.neutral(F, st); F.e(19, 2, 'B'); F.e(20, 1, 'B'); F.e(21, 1, 'B'); },
};
