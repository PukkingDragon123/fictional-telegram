// [v31 kinetic] Bitmap pixel fonts drawn in code, borrowed from Project Zealandia
// (refactored-garbanzo src/ui/pxfont.ts, transpiled; glyph tables unchanged).
//
//  - 'body'   proportional 6px caps, 4px x-height, 2px descenders
//  - 'bold'   the same, one pixel heavier (headings, shouts)
//  - 'tiny'   3x5 caps (stamps, small labels, speaker names)
//  - 'script' a marker hand: an 8px slanted print-script with heavy downstrokes and a little
//             bounce in the baseline (thoughts, captions, narration)
//
// API: pxMeasure / pxWrap for layout, pxDraw onto a PixelBuffer, pxTextBuf / pxTextCanvas for a
// ready sprite (wrapping, alignment, colours per run, 1px outline and drop shadow). Text is drawn
// at art resolution (1 canvas px = 1 art px) with hard pixels only, so it scales by whole pixels.
// Used by the kinetic floating text (src/ui/kinetic/floatText.js).

// ---------------------------------------------------------------- the tiny pixel buffer it draws into
// colours are packed little-endian RGBA (0xAABBGGRR), 0 = empty
const rgba = (r, g, b, a = 255) => ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
export function hex(h, a = 255) {
  const n = typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16);
  return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}
export class PixelBuffer {
  constructor(w, h) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.data = new Uint32Array(this.w * this.h);
    this.bytes = new Uint8ClampedArray(this.data.buffer);
  }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0; }
  clone() { const p = new PixelBuffer(this.w, this.h); p.data.set(this.data); return p; }
  toCanvas(scale = 1) {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(this.bytes), this.w, this.h), 0, 0);
    if (scale === 1) return c;
    const s = document.createElement('canvas');
    s.width = this.w * scale; s.height = this.h * scale;
    const x = s.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(c, 0, 0, s.width, s.height);
    return s;
  }
  toDataURL(scale = 1) { return this.toCanvas(scale).toDataURL(); }
}

function g(def) {
  const i = def.indexOf(":");
  const top = i > 0 ? +def.slice(0, i) : 0;
  const rows = (i > 0 ? def.slice(i + 1) : def).split("|");
  return { w: Math.max(...rows.map((r) => r.length)), top, rows };
}
function table(src) {
  const out = {};
  for (const k of Object.keys(src)) out[k] = g(src[k]);
  return out;
}
const BODY_SRC = {
  A: ".##.|#..#|#..#|####|#..#|#..#",
  B: "###.|#..#|###.|#..#|#..#|###.",
  C: ".###|#...|#...|#...|#...|.###",
  D: "###.|#..#|#..#|#..#|#..#|###.",
  E: "####|#...|###.|#...|#...|####",
  F: "####|#...|###.|#...|#...|#...",
  G: ".###|#...|#...|#.##|#..#|.###",
  H: "#..#|#..#|####|#..#|#..#|#..#",
  I: "###|.#.|.#.|.#.|.#.|###",
  J: "..##|...#|...#|...#|#..#|.##.",
  K: "#..#|#.#.|##..|#.#.|#..#|#..#",
  L: "#...|#...|#...|#...|#...|####",
  M: "#...#|##.##|#.#.#|#...#|#...#|#...#",
  N: "#..#|##.#|#.##|#..#|#..#|#..#",
  O: ".##.|#..#|#..#|#..#|#..#|.##.",
  P: "###.|#..#|#..#|###.|#...|#...",
  Q: ".##.|#..#|#..#|#..#|#.#.|.#.#",
  R: "###.|#..#|#..#|###.|#.#.|#..#",
  S: ".###|#...|.##.|...#|...#|###.",
  T: "#####|..#..|..#..|..#..|..#..|..#..",
  U: "#..#|#..#|#..#|#..#|#..#|.##.",
  V: "#...#|#...#|#...#|.#.#.|.#.#.|..#..",
  W: "#...#|#...#|#...#|#.#.#|##.##|#...#",
  X: "#...#|.#.#.|..#..|..#..|.#.#.|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..",
  Z: "####|...#|..#.|.#..|#...|####",
  a: "2:.###|#..#|#..#|.###",
  b: "#...|#...|###.|#..#|#..#|###.",
  c: "2:.###|#...|#...|.###",
  d: "...#|...#|.###|#..#|#..#|.###",
  e: "2:.##.|####|#...|.###",
  f: ".##|#..|###|#..|#..|#..",
  g: "2:.###|#..#|#..#|.###|...#|.##.",
  h: "#...|#...|###.|#..#|#..#|#..#",
  i: "#|.|#|#|#|#",
  j: ".#|..|.#|.#|.#|.#|.#|#.",
  k: "#..|#..|#.#|##.|#.#|#.#",
  l: "#.|#.|#.|#.|#.|.#",
  m: "2:####.|#.#.#|#.#.#|#.#.#",
  n: "2:###.|#..#|#..#|#..#",
  o: "2:.##.|#..#|#..#|.##.",
  p: "2:###.|#..#|#..#|###.|#...|#...",
  q: "2:.###|#..#|#..#|.###|...#|...#",
  r: "2:#.##|##..|#...|#...",
  s: "2:.###|##..|..##|###.",
  t: "1:.#.|###|.#.|.#.|..#",
  u: "2:#..#|#..#|#..#|.###",
  v: "2:#.#|#.#|#.#|.#.",
  w: "2:#...#|#.#.#|#.#.#|.#.#.",
  x: "2:#..#|.##.|.##.|#..#",
  y: "2:#..#|#..#|#..#|.###|...#|.##.",
  z: "2:####|..#.|.#..|####",
  "\u0131": "2:#|#|#|#",
  "0": ".##.|#..#|#.##|##.#|#..#|.##.",
  "1": ".#.|##.|.#.|.#.|.#.|###",
  "2": ".##.|#..#|...#|..#.|.#..|####",
  "3": "###.|...#|.##.|...#|...#|###.",
  "4": "..##|.#.#|#..#|####|...#|...#",
  "5": "####|#...|###.|...#|...#|###.",
  "6": ".##.|#...|###.|#..#|#..#|.##.",
  "7": "####|...#|..#.|..#.|.#..|.#..",
  "8": ".##.|#..#|.##.|#..#|#..#|.##.",
  "9": ".##.|#..#|#..#|.###|...#|.##.",
  ".": "5:#",
  ",": "5:.#|#.",
  ":": "2:#|.|.|#",
  ";": "2:.#|..|..|.#|#.",
  "!": "#|#|#|#|.|#",
  "?": ".##.|#..#|..#.|.#..|....|.#..",
  "'": "#|#",
  '"': "#.#|#.#",
  "-": "3:###",
  "\u2013": "3:####",
  "\u2014": "3:######",
  "_": "6:####",
  "(": ".#|#.|#.|#.|#.|#.|.#",
  ")": "#.|.#|.#|.#|.#|.#|#.",
  "[": "##|#.|#.|#.|#.|#.|##",
  "]": "##|.#|.#|.#|.#|.#|##",
  "/": "...#|..#.|..#.|.#..|.#..|#...",
  "+": "2:.#.|###|.#.",
  "=": "2:###|...|###",
  "\xD7": "2:#.#|.#.|#.#",
  "*": "1:#.#|.#.|#.#",
  "%": "#..#|...#|..#.|.#..|#...|#..#",
  "&": ".#..|#.#.|.#..|#.##|#..#|.##.",
  "#": "1:.#.#.|#####|.#.#.|#####|.#.#.",
  "\xB0": "###|#.#|###",
  "\xB7": "3:#",
  "\u2022": "2:##|##",
  "\u2026": "5:#.#.#",
  "<": "1:..#|.#.|#..|.#.|..#",
  ">": "1:#..|.#.|..#|.#.|#..",
  "\u2665": "1:.#.#.|#####|#####|.###.|..#..",
  "\u2605": "..#..|..#..|#####|.###.|.#.#.|#...#",
  "\u2713": "1:....#|...#.|#.#..|.#...",
  "\u2192": "1:..#.|####|..#.",
  "\u2190": "1:.#..|####|.#..",
  "\u2191": ".#.|###|.#.|.#.|.#.|.#.",
  "\u2193": ".#.|.#.|.#.|.#.|###|.#.",
  "@": ".###.|#...#|#.###|#.#.#|#.###|#....|.###.",
  "$": ".#.|.##|#..|.#.|..#|##.|.#.",
  "^": ".#.|#.#",
  "~": "2:.#.#|#.#.",
  "\xBD": "#...|#..#|#.#.|.#..|#.##|..#.|..##"
};
const TINY_SRC = {
  A: ".#.|#.#|###|#.#|#.#",
  B: "##.|#.#|##.|#.#|##.",
  C: ".##|#..|#..|#..|.##",
  D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###",
  F: "###|#..|##.|#..|#..",
  G: ".##|#..|#.#|#.#|.##",
  H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###",
  J: "..#|..#|..#|#.#|.#.",
  K: "#.#|#.#|##.|#.#|#.#",
  L: "#..|#..|#..|#..|###",
  M: "#...#|##.##|#.#.#|#...#|#...#",
  N: "#..#|##.#|#.##|#..#|#..#",
  O: ".#.|#.#|#.#|#.#|.#.",
  P: "##.|#.#|##.|#..|#..",
  Q: ".#.|#.#|#.#|##.|.##",
  R: "##.|#.#|##.|#.#|#.#",
  S: ".##|#..|.#.|..#|##.",
  T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###",
  V: "#.#|#.#|#.#|#.#|.#.",
  W: "#...#|#...#|#.#.#|##.##|#...#",
  X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.",
  Z: "###|..#|.#.|#..|###",
  "0": "###|#.#|#.#|#.#|###",
  "1": ".#.|##.|.#.|.#.|###",
  "2": "##.|..#|.#.|#..|###",
  "3": "##.|..#|.#.|..#|##.",
  "4": "#.#|#.#|###|..#|..#",
  "5": "###|#..|##.|..#|##.",
  "6": ".##|#..|##.|#.#|.#.",
  "7": "###|..#|.#.|.#.|.#.",
  "8": ".#.|#.#|.#.|#.#|.#.",
  "9": ".#.|#.#|.##|..#|##.",
  ".": "4:#",
  ",": "4:#|#",
  ":": "1:#|.|#",
  "!": "#|#|#|.|#",
  "?": "##.|..#|.#.|...|.#.",
  "'": "#|#",
  "-": "2:###",
  "+": "1:.#.|###|.#.",
  "/": "..#|..#|.#.|#..|#..",
  "%": "#.#|..#|.#.|#..|#.#",
  "&": ".#.|#.#|.##|#.#|.##",
  "\xB7": "2:#",
  "\xD7": "1:#.#|.#.|#.#",
  "\xB0": "###|#.#|###",
  "\u2665": ".#.#.|#####|#####|.###.|..#..",
  "\u2605": "..#..|#####|.###.|.#.#.|#...#",
  "\u2713": "1:...#|#.#.|.#..",
  "(": ".#|#.|#.|#.|.#",
  ")": "#.|.#|.#|.#|#.",
  "\u2192": "1:..#.|####|..#.",
  "<": "..#|.#.|#..|.#.|..#",
  ">": "#..|.#.|..#|.#.|#..",
  "=": "1:###|...|###",
  "#": ".#.#.|#####|.#.#.|#####|.#.#."
};
const SCRIPT_SRC = {
  a: "3:.##.#|#..##|#...#|#..##|.##.#",
  b: "#...|#...|#...|#.#.|##.#|#..#|#..#|###.",
  c: "3:.###|#...|#...|#...|.###",
  d: "....#|....#|....#|.##.#|#..##|#...#|#..##|.##.#",
  e: "3:.##.|#..#|###.|#...|.###",
  f: "..##|.#..|.#..|####|.#..|.#..|.#..|.#..|.#..|#...",
  g: "3:.##.#|#..##|#...#|#..##|.##.#|....#|#..#.|.##..",
  h: "#...|#...|#...|#.#.|##.#|#..#|#..#|#..#",
  i: "1:#|.|#|#|#|#|#",
  j: "1:..#|...|..#|..#|..#|..#|..#|..#|#.#|.#.",
  k: "#...|#...|#...|#..#|#.#.|##..|#.#.|#..#",
  l: "#.|#.|#.|#.|#.|#.|#.|.#",
  m: "3:#.#..#.|##.##.#|#..#..#|#..#..#|#..#..#",
  n: "3:#.#.|##.#|#..#|#..#|#..#",
  o: "3:.##.|#..#|#..#|#..#|.##.",
  p: "3:#.#.|##.#|#..#|#..#|###.|#...|#...|#...",
  q: "3:.##.#|#..##|#...#|#..##|.##.#|....#|....#|....#",
  r: "3:#.##|##..|#...|#...|#...",
  s: "3:.###|#...|.##.|...#|###.",
  t: "1:.#..|.#..|####|.#..|.#..|.#..|..##",
  u: "3:#..#|#..#|#..#|#.##|.#.#",
  v: "3:#...#|#...#|.#.#.|.#.#.|..#..",
  w: "3:#.....#|#.....#|#..#..#|#..#..#|.##.##.",
  x: "3:#...#|.#.#.|..#..|.#.#.|#...#",
  y: "3:#..#|#..#|#..#|#.##|.#.#|...#|#..#|.##.",
  z: "3:####|...#|..#.|.#..|####",
  "\u0131": "3:#|#|#|#|#",
  A: "..#..|.#.#.|.#.#.|#...#|#####|#...#|#...#|#...#",
  B: "####.|#...#|#...#|####.|#...#|#...#|#...#|####.",
  C: ".###.|#...#|#....|#....|#....|#....|#...#|.###.",
  D: "###..|#..#.|#...#|#...#|#...#|#...#|#..#.|###..",
  E: "#####|#....|#....|####.|#....|#....|#....|#####",
  F: "#####|#....|#....|####.|#....|#....|#....|#....",
  G: ".###.|#...#|#....|#....|#..##|#...#|#...#|.###.",
  H: "#...#|#...#|#...#|#####|#...#|#...#|#...#|#...#",
  I: "###|.#.|.#.|.#.|.#.|.#.|.#.|###",
  J: "..###|....#|....#|....#|....#|#...#|#...#|.###.",
  K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#|#...#",
  L: "#....|#....|#....|#....|#....|#....|#....|#####",
  M: "#.....#|##...##|#.#.#.#|#..#..#|#.....#|#.....#|#.....#|#.....#",
  N: "#...#|##..#|##..#|#.#.#|#.#.#|#..##|#..##|#...#",
  O: ".###.|#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  P: "####.|#...#|#...#|#...#|####.|#....|#....|#....",
  Q: ".###.|#...#|#...#|#...#|#...#|#.#.#|#..#.|.##.#",
  R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#|#...#",
  S: ".###.|#...#|#....|.###.|....#|....#|#...#|.###.",
  T: "#####|..#..|..#..|..#..|..#..|..#..|..#..|..#..",
  U: "#...#|#...#|#...#|#...#|#...#|#...#|#...#|.###.",
  V: "#...#|#...#|#...#|#...#|.#.#.|.#.#.|.#.#.|..#..",
  W: "#.....#|#.....#|#.....#|#..#..#|#..#..#|#.#.#.#|##...##|#.....#",
  X: "#...#|#...#|.#.#.|..#..|..#..|.#.#.|#...#|#...#",
  Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..|..#..",
  Z: "#####|....#|...#.|..#..|.#...|#....|#....|#####",
  "0": ".###.|#...#|#..##|#.#.#|#.#.#|##..#|#...#|.###.",
  "1": "..#..|.##..|#.#..|..#..|..#..|..#..|..#..|#####",
  "2": ".###.|#...#|....#|...#.|..#..|.#...|#....|#####",
  "3": "####.|....#|....#|.###.|....#|....#|....#|####.",
  "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.|...#.",
  "5": "#####|#....|#....|####.|....#|....#|#...#|.###.",
  "6": ".###.|#....|#....|####.|#...#|#...#|#...#|.###.",
  "7": "#####|....#|...#.|...#.|..#..|..#..|.#...|.#...",
  "8": ".###.|#...#|#...#|.###.|#...#|#...#|#...#|.###.",
  "9": ".###.|#...#|#...#|#...#|.####|....#|....#|.###.",
  ".": "7:#",
  ",": "7:#|#",
  "!": "#|#|#|#|#|.|.|#",
  "?": ".###.|#...#|....#|...#.|..#..|.....|.....|..#..",
  "'": "#|#",
  '"': "#.#|#.#",
  "-": "5:###",
  "\u2013": "5:####",
  "\u2014": "5:#####",
  ":": "4:#|.|.|#",
  ";": "4:.#|..|..|.#|#.",
  "\xB7": "5:#",
  "(": "..#|.#.|#..|#..|#..|#..|#..|.#.|..#",
  ")": "#..|.#.|..#|..#|..#|..#|..#|.#.|#..",
  "/": "....#|...#.|...#.|..#..|..#..|.#...|.#...|#....",
  "&": ".##..|#..#.|#..#.|.##..|#.#.#|#..#.|#..##|.##.#",
  "+": "3:..#..|..#..|#####|..#..|..#..",
  "%": "##..#|##.#.|...#.|..#..|.#...|.#.##|#..##",
  "\u2026": "7:#.#.#",
  "\xD7": "4:#.#|.#.|#.#",
  "\u2665": "2:.##.##.|#######|#######|.#####.|..###..|...#...",
  "\u2605": "..#..|..#..|#####|.###.|.#.#.|#...#",
  "\u2192": "4:...#.|#####|...#."
};
const FONTS = {
  body: { cap: 6, desc: 2, lineH: 10, gap: 1, space: 3, glyphs: table(BODY_SRC) },
  bold: { cap: 6, desc: 2, lineH: 10, gap: 1, space: 3, glyphs: table(BODY_SRC), bold: true },
  tiny: { cap: 5, desc: 1, lineH: 7, gap: 1, space: 2, glyphs: table(TINY_SRC), caps: true },
  script: { cap: 8, desc: 3, lineH: 13, gap: 1, space: 4, glyphs: table(SCRIPT_SRC), script: true }
};
const MARKS = {
  \u0101: ["a", "macron"],
  \u0113: ["e", "macron"],
  \u012B: ["\u0131", "macron"],
  \u014D: ["o", "macron"],
  \u016B: ["u", "macron"],
  \u0100: ["A", "macron"],
  \u0112: ["E", "macron"],
  \u012A: ["I", "macron"],
  \u014C: ["O", "macron"],
  \u016A: ["U", "macron"],
  \u00E9: ["e", "acute"],
  \u00E8: ["e", "grave"],
  \u00EA: ["e", "circ"],
  \u00EB: ["e", "uml"],
  \u00E1: ["a", "acute"],
  \u00E0: ["a", "grave"],
  \u00E2: ["a", "circ"],
  \u00E4: ["a", "uml"],
  \u00ED: ["i", "acute"],
  \u00F3: ["o", "acute"],
  \u00F6: ["o", "uml"],
  \u00F4: ["o", "circ"],
  \u00FA: ["u", "acute"],
  \u00FC: ["u", "uml"],
  \u00F1: ["n", "tilde"],
  \u00E7: ["c", "ced"],
  \u00C9: ["E", "acute"],
  \u00D6: ["O", "uml"],
  \u00DC: ["U", "uml"]
};
const ALIAS = { "\u2018": "'", "\u2019": "'", "`": "'", "\u201C": '"', "\u201D": '"', "\u2212": "-", "\u2011": "-", " ": " ", "\xA0": " ", "\uFF5C": "|", "|": "/", "\u2606": "\u2605", "\u2714": "\u2713", "\u2764": "\u2665", "\u2013": "\u2013" };
function glyphOf(f, ch) {
  if (ch === " ") return null;
  const a = ALIAS[ch] ?? ch;
  let c = f.caps ? a.toUpperCase() : a;
  let mark;
  if (!f.glyphs[c] && MARKS[c]) {
    mark = MARKS[c][1];
    c = f.caps ? MARKS[c][0].toUpperCase() : MARKS[c][0];
  }
  let gl = f.glyphs[c];
  if (!gl) gl = f.glyphs[c.toUpperCase()] ?? f.glyphs[c.toLowerCase()];
  if (!gl) gl = f.glyphs["?"];
  return gl ? { gl, mark } : null;
}
const SHEAR = (row, f) => f.script ? Math.floor((f.cap - 1 - row + 2) / 4) : 0;
function adv(f, ch) {
  if (ch === " " || ch === "\xA0") return f.space + f.gap;
  const q = glyphOf(f, ch);
  if (!q) return f.space + f.gap;
  return q.gl.w + f.gap + (f.bold ? 1 : 0) + (f.script ? 1 : 0);
}
function pxMeasure(text, font = "body", spacing = 0) {
  const f = FONTS[font];
  let w = 0;
  for (const ch of text) w += adv(f, ch) + spacing;
  return Math.max(0, w - f.gap - spacing + (f.script ? 2 : 0));
}
const pxLineH = (font = "body") => FONTS[font].lineH;
const pxCap = (font = "body") => FONTS[font].cap;
function pxWrapRuns(runs, maxW, base = "body") {
  const lines = [[]];
  let lineW = 0;
  const push = (r) => {
    const L = lines[lines.length - 1];
    const last = L[L.length - 1];
    if (last && last.color === r.color && (last.font ?? base) === (r.font ?? base)) last.text += r.text;
    else L.push({ ...r });
  };
  for (const r of runs) {
    const font = r.font ?? base;
    const parts = r.text.split(/(\n| )/);
    for (const p of parts) {
      if (p === "") continue;
      if (p === "\n") {
        lines.push([]);
        lineW = 0;
        continue;
      }
      if (p === " ") {
        if (lineW > 0) {
          push({ ...r, text: " " });
          lineW += adv(FONTS[font], " ");
        }
        continue;
      }
      const w = pxMeasure(p, font);
      if (lineW > 0 && lineW + w > maxW) {
        const L = lines[lines.length - 1];
        const last = L[L.length - 1];
        if (last) last.text = last.text.replace(/ +$/, "");
        lines.push([]);
        lineW = 0;
      }
      if (w > maxW && p.length > 1) {
        let cur = "";
        for (const ch of p) {
          if (pxMeasure(cur + ch, font) > maxW && cur) {
            push({ ...r, text: cur });
            lines.push([]);
            lineW = 0;
            cur = "";
          }
          cur += ch;
        }
        if (cur) {
          push({ ...r, text: cur });
          lineW = pxMeasure(cur, font) + FONTS[font].gap;
        }
        continue;
      }
      push({ ...r, text: p });
      lineW += w + FONTS[font].gap;
    }
  }
  return lines.map((L) => L.filter((r) => r.text.length));
}
function pxWrap(text, maxW, font = "body") {
  return pxWrapRuns([{ text }], maxW, font).map((L) => L.map((r) => r.text).join(""));
}
const runsW = (L, base) => {
  let w = 0;
  for (const r of L) w += pxMeasure(r.text, r.font ?? base) + FONTS[r.font ?? base].gap;
  return Math.max(0, w - (L.length ? FONTS[L[L.length - 1].font ?? base].gap : 0));
};
const col = (c, d) => c === void 0 ? d : typeof c === "number" ? c : hex(c);
const hash = (a, b) => {
  let h = a * 374761393 + b * 668265263 | 0;
  h = (h ^ h >>> 13) * 1274126177;
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
};
function pxDraw(b, text, x, y, o = {}) {
  const f = FONTS[o.font ?? "body"];
  const c = col(o.color, hex("#2a2414"));
  let cx = Math.round(x);
  const y0 = Math.round(y);
  let i = 0;
  const seed = o.seed ?? 7;
  for (const ch of text) {
    const q = glyphOf(f, ch);
    if (!q) {
      cx += adv(f, ch) + (o.spacing ?? 0);
      i++;
      continue;
    }
    const { gl, mark } = q;
    const dy = f.script && o.bounce !== false && /[a-z]/.test(ch) && hash(seed + i * 31, ch.charCodeAt(0)) > 0.78 ? -1 : 0;
    const plot = (px, py) => {
      const sx = SHEAR(py, f);
      b.set(cx + px + sx, y0 + py + dy, c);
      if (f.bold) b.set(cx + px + sx + 1, y0 + py + dy, c);
    };
    gl.rows.forEach((row, r) => {
      for (let k = 0; k < row.length; k++) if (row[k] === "#") plot(k, gl.top + r);
    });
    if (mark) {
      const w = gl.w, top = gl.top - (gl.top >= 2 ? 2 : 2);
      const mx = Math.floor(w / 2);
      if (mark === "macron") for (let k = 0; k < w; k++) plot(k, top);
      else if (mark === "acute") {
        plot(mx, top);
        plot(mx + 1, top - 1);
      } else if (mark === "grave") {
        plot(mx, top);
        plot(mx - 1, top - 1);
      } else if (mark === "uml") {
        plot(Math.max(0, mx - 1), top);
        plot(Math.min(w - 1, mx + 1), top);
      } else if (mark === "circ") {
        plot(mx - 1, top);
        plot(mx, top - 1);
        plot(mx + 1, top);
      } else if (mark === "tilde") {
        plot(0, top);
        plot(1, top - 1);
        plot(2, top);
        plot(3, top - 1);
      } else if (mark === "ced") {
        plot(mx, gl.top + gl.rows.length);
      }
    }
    cx += adv(f, ch) + (o.spacing ?? 0);
    i++;
  }
  return cx - Math.round(x);
}
function pxTextBuf(text, o = {}) {
  const base = o.font ?? "body";
  const f = FONTS[base];
  const runs = typeof text === "string" ? [{ text }] : text;
  let lines = o.maxW ? pxWrapRuns(runs, o.maxW - (f.script ? 3 : 0), base) : [runs.map((r) => ({ ...r }))].map((L) => L);
  if (!o.maxW) {
    const all = [[]];
    for (const r of runs) r.text.split("\n").forEach((t, i) => {
      if (i) all.push([]);
      if (t) all[all.length - 1].push({ ...r, text: t });
    });
    lines = all;
  }
  if (o.maxLines && lines.length > o.maxLines) {
    lines = lines.slice(0, o.maxLines);
    const L = lines[lines.length - 1];
    const last = L[L.length - 1];
    if (last) {
      while (last.text.length > 1 && runsW(L, base) + pxMeasure("\u2026", last.font ?? base) > (o.maxW ?? 9999)) last.text = last.text.slice(0, -1);
      last.text = last.text.replace(/[ ,.;:]+$/, "") + "\u2026";
    }
  }
  const lh = o.lineH ?? f.lineH;
  const ring = o.outline ? 1 : 0, sh = o.shadow ? 1 : 0;
  const pad = (o.pad ?? 0) + ring;
  const markTop = 2;
  const sp = o.spacing ?? 0;
  const widths = lines.map((L) => runsW(L, base) + sp * Math.max(0, [...L.map((r) => r.text).join("")].length - 1));
  const W = Math.max(1, Math.max(0, ...widths) + (f.script ? 3 : 0)) + pad * 2 + sh;
  const Hh = Math.max(1, (lines.length - 1) * lh + f.cap + f.desc + markTop) + pad * 2 + sh;
  const ink = new PixelBuffer(W, Hh);
  const ink0 = col(o.color, hex("#2a2414"));
  lines.forEach((L, li) => {
    const lw = widths[li];
    let x = pad + (o.align === "center" ? Math.floor((W - pad * 2 - sh - lw - (f.script ? 3 : 0)) / 2) : o.align === "right" ? W - pad - sh - lw - (f.script ? 3 : 0) : 0);
    const y = pad + markTop + li * lh;
    for (const r of L) {
      x += pxDraw(ink, r.text, x, y, { font: r.font ?? base, color: col(r.color, ink0), seed: li * 97 + x, bounce: o.bounce, spacing: o.spacing });
      x += 0;
    }
  });
  if (f.script) {
    const bl = o.bleed !== void 0 ? col(o.bleed, ink0) : null;
    const src = ink.clone();
    for (let y = 0; y < Hh; y++) for (let x = W - 1; x >= 0; x--) {
      const c = src.get(x, y);
      if (!c) continue;
      if (!src.get(x + 1, y) && !src.get(x + 2, y)) ink.set(x + 1, y, bl ?? c);
    }
  }
  if (!ring && !sh) return ink;
  const out = new PixelBuffer(W, Hh);
  const oc = o.outline ? col(o.outline, 0) : 0, sc = o.shadow ? col(o.shadow, 0) : 0;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (!ink.get(x, y)) continue;
    if (sh) {
      out.set(x + 1, y + 1, sc);
      if (ring) {
        out.set(x + 2, y + 1, sc);
        out.set(x + 1, y + 2, sc);
      }
    }
  }
  if (ring) for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (!ink.get(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) out.set(x + dx, y + dy, oc);
  }
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const c = ink.get(x, y);
    if (c) out.set(x, y, c);
  }
  return out;
}
function pxTextCanvas(text, o = {}) {
  const b = pxTextBuf(text, o);
  const c = document.createElement("canvas");
  c.width = b.w;
  c.height = b.h;
  c.className = "pxt" + (o.cls ? " " + o.cls : "");
  c.getContext("2d", { willReadFrequently: true })?.putImageData(new ImageData(new Uint8ClampedArray(b.bytes), b.w, b.h), 0, 0);
  const k = o.scale ?? 1;
  c.style.width = b.w * k + "px";
  c.style.height = b.h * k + "px";
  c.style.imageRendering = "pixelated";
  return c;
}
function pxTextURL(text, o = {}) {
  const b = pxTextBuf(text, o);
  return b.toDataURL(o.scale ?? 1);
}
function pxRunsFromHTML(html, colors = {}) {
  const out = [];
  const re = /<(\/?)(b|i|br)\s*\/?>/g;
  let last = 0, cur = "base";
  const dec = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const push = (t) => {
    if (t) out.push({ text: dec(t), color: cur === "b" ? colors.b : cur === "i" ? colors.i : colors.base });
  };
  let m;
  while (m = re.exec(html)) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] === "br") out.push({ text: "\n", color: colors.base });
    else cur = m[1] ? "base" : m[2];
  }
  push(html.slice(last));
  return out;
}
export {
  pxCap,
  pxDraw,
  pxLineH,
  pxMeasure,
  pxRunsFromHTML,
  pxTextBuf,
  pxTextCanvas,
  pxTextURL,
  pxWrap,
  pxWrapRuns
};
