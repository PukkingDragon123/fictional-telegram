// Extra chalk doodles for the portfolio chapters, registered into the game's
// Chalkboard (src/ui/Chalkboard.js). Same letter code as the game's own doodles:
// UPPERCASE = outline strokes, lowercase = hatched fill, K = dark cut, * = white
// accent, in W/Y/P/B/G/O/L/R chalk colours. They are generated with a few tiny
// painting helpers so shapes stay symmetric and easy to tweak.
import { registerDoodles } from '../src/ui/Chalkboard.js';

function canvas(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const api = {
    w, h, g,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; return api; },
    rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) api.set(x, y, c); return api; },
    line(x0, y0, x1, y1, c) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) api.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
      return api;
    },
    /** fill `inside(x, y)` with the lowercase `fill` letter and trace its border with `edge` (omit for no outline) */
    shape(inside, edge, fill) {
      const ins = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => inside(x + 0.5, y + 0.5)));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!ins[y][x]) continue;
        const border = !ins[y - 1]?.[x] || !ins[y + 1]?.[x] || !ins[y][x - 1] || !ins[y][x + 1];
        if (border && edge) api.set(x, y, edge);
        else if (fill) api.set(x, y, fill);
      }
      return api;
    },
    rows() { return g.map((r) => r.join('')); },
  };
  return api;
}
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const poly = (pts) => (x, y) => {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
const box = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 + 1 && y >= y0 && y <= y1 + 1;

const DOODLES = {
  // Reynard / Pukking: top hat, big ears, monocle
  fox: () => {
    const c = canvas(17, 17);
    c.shape(poly([[1, 1], [6, 6], [1, 8]]), 'O', 'o');
    c.shape(poly([[16, 1], [11, 6], [16, 8]]), 'O', 'o');
    c.shape(poly([[1.5, 6], [15.5, 6], [17, 11], [8.5, 17], [0, 11]]), 'O', 'o');
    c.shape(poly([[3, 11], [8.5, 15.5], [14, 11], [8.5, 12.5]]), null, 'w');
    c.rect(6, 0, 10, 3, 'l').rect(5, 0, 5, 4, 'L').rect(11, 0, 11, 4, 'L').rect(5, 0, 11, 0, 'L');
    c.rect(5, 3, 11, 3, 'Y').rect(3, 5, 13, 5, 'L');
    c.rect(4, 8, 4, 9, 'K').rect(12, 8, 12, 9, 'K').set(8, 14, 'K').set(9, 14, 'K').set(8, 13, 'K');
    c.set(5, 8, '*');
    c.shape(ell(12.5, 8.8, 2.4, 2.4), 'Y', null);
    c.set(12, 8, 'K').set(12, 9, 'K').set(13, 8, '*');
    return c.rows();
  },
  // a pixel-art fox sprite, meant to be drawn BIG (scale 3-4) to show a sprite being born
  pxfox: () => [
    '.OO........OO.',
    '.OPO......OPO.',
    '.OPOOOOOOOOPO.',
    '.OOOOOOOOOOOO.',
    'OOOKOOOOOOKOOO',
    'OOOKOOOOOOKOOO',
    'OWWOOOOOOOOWWO',
    'OWWWOOOOOOWWWO',
    '.OWWWWKKWWWWO.',
    '..OWWWWWWWWO..',
    '...OWWWWWWO...',
    '....OOOOOO....',
  ],
  // a little plane flying right (Thailand -> Canada)
  plane: () => {
    const c = canvas(19, 9);
    c.shape(poly([[1, 0], [4.5, 3.2], [1.5, 3.2]]), 'R', 'r');
    c.shape(poly([[1, 3], [15, 3], [18.5, 4.8], [15, 6.6], [2, 6.6]]), 'W', 'w');
    c.shape(poly([[7, 5.6], [11.5, 5.6], [8, 9]]), 'B', 'b');
    for (const x of [6, 8, 10, 12, 14]) c.set(x, 4, 'B');
    c.set(16, 4, '*');
    return c.rows();
  },
  // a Thai temple: tiered red-and-orange roofs with gold trim and a gold spire
  temple: () => {
    const c = canvas(17, 17);
    c.line(8, 0, 8, 3, 'Y').set(7, 2, 'Y').set(9, 2, 'Y');
    c.shape(poly([[4.5, 7], [12.5, 7], [10.5, 3.5], [6.5, 3.5]]), 'R', 'r');
    c.shape(poly([[1, 11], [16, 11], [13, 7], [4, 7]]), 'O', 'o');
    c.set(0, 10, 'Y').set(16, 10, 'Y').set(3, 6, 'Y').set(13, 6, 'Y');
    c.shape(box(3, 11, 13, 16), 'W', 'w');
    c.rect(7, 13, 9, 16, 'K');
    c.rect(4, 13, 5, 14, 'Y').rect(11, 13, 12, 14, 'Y');
    c.set(8, 5, '*');
    return c.rows();
  },
  // isometric cube = three.js
  cube: () => {
    const c = canvas(15, 17);
    c.shape(poly([[7.5, 0], [15, 4.5], [7.5, 9], [0, 4.5]]), null, 'y');
    c.shape(poly([[0, 4.5], [7.5, 9], [7.5, 17], [0, 12.5]]), null, 'b');
    c.shape(poly([[7.5, 9], [15, 4.5], [15, 12.5], [7.5, 17]]), null, 'l');
    c.line(7, 0, 14, 4, 'W').line(14, 4, 7, 8, 'W').line(7, 8, 0, 4, 'W').line(0, 4, 7, 0, 'W');
    c.line(0, 4, 0, 12, 'W').line(14, 4, 14, 12, 'W').line(0, 12, 7, 16, 'W').line(14, 12, 7, 16, 'W');
    c.line(7, 8, 7, 16, 'W');
    c.set(7, 3, '*').set(8, 4, '*');
    return c.rows();
  },
  // </> = JavaScript
  brackets: () => {
    const c = canvas(17, 11);
    c.line(5, 1, 1, 5, 'G').line(1, 5, 5, 9, 'G');
    c.line(11, 1, 15, 5, 'B').line(15, 5, 11, 9, 'B');
    c.line(10, 0, 7, 10, 'Y');
    return c.rows();
  },
  // a gamepad (the game's own doodle set has no controller)
  controller: () => {
    const c = canvas(17, 12);
    c.shape(poly([[1.5, 3], [4, 1.5], [13, 1.5], [15.5, 3], [17, 8.5], [15, 11], [12.2, 10.6], [10.4, 8], [6.6, 8], [4.8, 10.6], [2, 11], [0, 8.5]]), 'B', 'b');
    c.rect(3, 4, 3, 7, 'W').rect(2, 5, 4, 5, 'W');
    c.set(13, 4, 'Y').set(14, 5, 'R').set(13, 6, 'G').set(12, 5, 'P');
    c.set(7, 4, 'W').set(9, 4, 'W');
    c.set(6, 2, '*');
    return c.rows();
  },
  // artist's palette
  palette: () => {
    const c = canvas(17, 13);
    c.shape(ell(8.5, 6.5, 8.5, 6.2), 'O', 'o');
    c.shape(ell(12.5, 9.4, 1.8, 1.5), 'K', null);
    c.rect(12, 9, 13, 9, 'K');
    c.rect(3, 4, 4, 5, 'R').rect(6, 2, 7, 3, 'Y').rect(10, 2, 11, 3, 'B').rect(13, 4, 14, 5, 'G').rect(3, 8, 4, 9, 'P');
    c.set(3, 4, '*');
    return c.rows();
  },
  // grass block (minecraft)
  block: () => {
    const c = canvas(15, 17);
    c.shape(poly([[7.5, 0], [15, 4.5], [7.5, 9], [0, 4.5]]), null, 'g');
    c.shape(poly([[0, 4.5], [7.5, 9], [7.5, 17], [0, 12.5]]), null, 'o');
    c.shape(poly([[7.5, 9], [15, 4.5], [15, 12.5], [7.5, 17]]), null, 'o');
    // grass fringe over the dirt
    for (let x = 0; x < 7; x++) c.rect(x, 4 + Math.floor((x + 1) / 2), x, 6 + Math.floor((x + 1) / 2) + (x % 2), 'g');
    for (let x = 8; x < 15; x++) c.rect(x, 8 - Math.floor((x - 7) / 2), x, 9 - Math.floor((x - 7) / 2) + 2 + (x % 2), 'g');
    c.line(7, 0, 14, 4, 'G').line(14, 4, 7, 8, 'G').line(7, 8, 0, 4, 'G').line(0, 4, 7, 0, 'G');
    c.line(0, 4, 0, 12, 'O').line(14, 4, 14, 12, 'O').line(0, 12, 7, 16, 'O').line(14, 12, 7, 16, 'O').line(7, 8, 7, 16, 'O');
    for (const [x, y] of [[3, 10], [5, 13], [10, 12], [12, 9], [9, 14]]) c.set(x, y, 'K');
    return c.rows();
  },
  pickaxe: () => {
    const c = canvas(12, 12);
    c.line(1, 11, 8, 4, 'O').line(2, 11, 9, 4, 'O');
    for (const [a, b] of [[[2, 3], [4, 1]], [[4, 1], [7, 0]], [[7, 0], [10, 1]], [[10, 1], [11, 4]], [[11, 4], [11, 7]]]) c.line(a[0], a[1], b[0], b[1], 'W');
    for (const [a, b] of [[[3, 4], [5, 2]], [[5, 2], [7, 2]], [[7, 2], [9, 3]], [[9, 3], [10, 5]], [[10, 5], [10, 7]]]) c.line(a[0], a[1], b[0], b[1], 'W');
    c.set(4, 1, '*');
    return c.rows();
  },
  // the star of Mudkip's Garden: a mud-blue critter with orange cheek fins and a head fin
  mudkip: () => {
    const c = canvas(19, 16);
    c.shape(poly([[6, 7], [8.5, 1.4], [10.4, 2.2], [13, 7]]), 'B', 'b');
    c.shape(ell(9.5, 10, 7, 5), 'B', 'b');
    c.shape(poly([[7.5, 6.4], [9, 3.4], [11.2, 6.4]]), null, 'b');
    c.shape(poly([[3.5, 9], [0, 9], [1.5, 11], [0, 13], [4, 12]]), 'O', 'o');
    c.shape(poly([[15.5, 9], [19, 9], [17.5, 11], [19, 13], [15, 12]]), 'O', 'o');
    c.shape(ell(9.5, 12.6, 3.6, 2.2), null, 'w');
    c.rect(6, 8, 6, 9, 'K').rect(13, 8, 13, 9, 'K').set(6, 8, '*').set(13, 8, '*');
    c.line(8, 12, 11, 12, 'K').set(7, 11, 'K').set(12, 11, 'K');
    return c.rows();
  },
  // floating island (custom dimension)
  island: () => {
    const c = canvas(19, 17);
    c.line(9, 6, 9, 2, 'O').line(10, 6, 10, 2, 'O');
    c.shape(ell(9.5, 2.4, 3.2, 2.4), 'G', 'g');
    c.shape(ell(9.5, 8.2, 9.4, 2.6), 'G', 'g');
    c.shape(poly([[0.3, 8.5], [18.7, 8.5], [14.5, 12.5], [11.5, 17], [7.5, 17], [4.5, 12.5]]), 'L', 'l');
    c.shape(ell(9.5, 8.2, 9.4, 2.6), null, 'g');
    c.line(1, 9, 18, 9, 'G');
    c.set(16, 1, '*').set(2, 5, '*').set(5, 3, '*');
    return c.rows();
  },
  // a cave-crawler: bone plates + glowing cyan eyes (custom mob)
  crawler: () => {
    const c = canvas(21, 11);
    for (let i = 0; i < 4; i++) {
      const x = 2.6 + i * 3.8;
      c.line(x - 1, 8, x - 2.2, 10, 'W').line(x + 1, 8, x + 2.2, 10, 'W');
      c.shape(ell(x, 5, 1.8, 3), 'W', 'w');
    }
    c.shape(ell(17.8, 5, 2.9, 3.2), 'W', 'w');
    c.rect(16, 4, 16, 5, 'B').rect(19, 4, 19, 5, 'B').set(16, 4, '*').set(19, 4, '*');
    c.line(16, 2, 15, 0, 'B').line(19, 2, 20, 0, 'B');
    c.line(17, 8, 16, 10, 'W').line(19, 8, 20, 10, 'W');
    return c.rows();
  },
  // sunset shore: a crab
  crab: () => {
    const c = canvas(17, 11);
    c.shape(ell(8.5, 6.5, 5.5, 3.2), 'R', 'r');
    c.shape(ell(2.2, 2.8, 2.2, 2.2), 'R', 'r');
    c.shape(ell(14.8, 2.8, 2.2, 2.2), 'R', 'r');
    c.line(4, 5, 3, 4, 'R').line(13, 5, 14, 4, 'R');
    for (let i = 0; i < 3; i++) { c.line(4 + i, 9, 2 + i * 0.6 - 1, 10, 'R'); c.line(13 - i, 9, 15 - i * 0.6 + 1, 10, 'R'); }
    c.line(7, 3, 6, 1, 'R').line(10, 3, 11, 1, 'R').set(6, 0, 'K').set(11, 0, 'K').set(6, 1, 'K').set(11, 1, 'K');
    c.line(7, 7, 10, 7, 'K');
    return c.rows();
  },
  mail: () => {
    const c = canvas(15, 11);
    c.shape(box(0, 0, 14, 10), 'W', 'w');
    c.line(0, 0, 7, 6, 'Y').line(14, 0, 7, 6, 'Y');
    c.line(0, 10, 5, 5, 'W').line(14, 10, 9, 5, 'W');
    c.set(7, 2, '*');
    return c.rows();
  },
  chat: () => {
    const c = canvas(15, 12);
    c.shape(ell(7.5, 4.8, 7.4, 4.6), 'W', 'w');
    c.shape(poly([[3, 8], [3, 12], [8, 9]]), 'W', 'w');
    c.set(4, 5, 'K').set(7, 5, 'K').set(10, 5, 'K');
    return c.rows();
  },
  note: () => {
    const c = canvas(9, 11);
    c.shape(ell(2.5, 8.5, 2.5, 2), 'L', 'l');
    c.shape(ell(7, 7.5, 2.2, 1.8), 'L', 'l');
    c.line(4, 8, 4, 1, 'L').line(8, 7, 8, 0, 'L').line(4, 1, 8, 0, 'L').line(4, 2, 8, 1, 'L');
    return c.rows();
  },
  // little waves
  waves: () => {
    const c = canvas(15, 6);
    for (let i = 0; i < 15; i++) { c.set(i, 1 + Math.round(Math.sin(i * 0.9)), 'B'); c.set(i, 4 + Math.round(Math.sin(i * 0.9 + 1.4)), 'B'); }
    return c.rows();
  },
};

export function registerPortfolioDoodles() { registerDoodles(DOODLES); }
export const PORTFOLIO_DOODLES = DOODLES;
