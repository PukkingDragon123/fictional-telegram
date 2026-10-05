// Tiny pixel-art icons for the portfolio UI (pins, buttons). Each icon is drawn
// with a few shape helpers, gets an automatic 1px ink outline, and is turned
// into a crisp <img> data URL at any integer scale.
const INK = '#2a1a10';
export const PAL = {
  k: INK, y: '#e6a81c', Y: '#ffe27a', o: '#f08a1a', w: '#fdfbf2', W: '#e8e0f4', b: '#4aa0e8', B: '#9ad8ff', d: '#2f6cc0',
  g: '#5cb84c', G: '#a8e07a', r: '#e84a3a', p: '#ff7aa8', l: '#a77ad8', s: '#b8bcc8', S: '#8a90a0', f: '#e8743b', F: '#ffb070', n: '#6b4220',
};

function paint(w, h, fn, outline = true) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  const shape = (inside, c) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) g[y][x] = typeof c === 'function' ? c(x, y) : c; };
  fn({ set, shape, g, w, h });
  if (outline) {
    const out = g.map((r) => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (g[y][x] !== '.') continue;
      if (g[y - 1]?.[x] !== undefined && g[y - 1][x] !== '.' || g[y + 1]?.[x] !== undefined && g[y + 1][x] !== '.' || (g[y][x - 1] ?? '.') !== '.' || (g[y][x + 1] ?? '.') !== '.') out[y][x] = 'k';
    }
    return out.map((r) => r.join(''));
  }
  return g.map((r) => r.join(''));
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

export const ICONS = {
  bell: () => paint(11, 12, ({ shape, set }) => {
    shape(poly([[3, 2], [8, 2], [9, 8], [10.5, 9.5], [0.5, 9.5], [2, 8]]), 'y');
    shape(ell(5.5, 2.5, 2.4, 2), 'y');
    set(4, 4, 'Y'); set(4, 5, 'Y'); set(3, 7, 'Y'); set(4, 3, 'Y');
    shape(ell(5.5, 10.6, 1.4, 1), 'o');
  }),
  sun: () => paint(13, 13, ({ shape, set }) => {
    shape(ell(6.5, 6.5, 3.4, 3.4), 'y');
    set(5, 5, 'Y'); set(6, 5, 'Y'); set(5, 6, 'Y');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; set(6 + Math.cos(a) * 5.2, 6 + Math.sin(a) * 5.2, 'o'); set(6 + Math.cos(a) * 5.9, 6 + Math.sin(a) * 5.9, 'o'); }
  }),
  moon: () => paint(13, 13, ({ shape, set }) => {
    shape((x, y) => ell(6, 6.5, 5, 5)(x, y) && !ell(8.6, 5.2, 4.3, 4.3)(x, y), 'Y');
    set(4, 8, 'y'); set(3, 6, 'y'); set(5, 10, 'y');
    set(10, 9, 'w'); set(11, 3, 'w'); set(12, 7, 'w');
  }),
  fish: () => paint(15, 10, ({ shape, set }) => {
    shape(ell(7, 5, 5, 3.4), 'b');
    shape(poly([[11, 5], [14.5, 1.5], [14.5, 8.5]]), 'd');
    shape(ell(6.5, 6.6, 3.6, 1.6), 'B');
    set(4, 3, 'w'); set(4, 4, 'k');
  }),
  globe: () => paint(13, 13, ({ shape, set }) => {
    shape(ell(6.5, 6.5, 5.6, 5.6), 'b');
    for (const [x, y] of [[4, 3], [5, 3], [3, 4], [4, 4], [5, 4], [4, 5], [8, 5], [9, 5], [8, 6], [9, 6], [10, 6], [8, 7], [6, 9], [7, 9], [7, 10]]) set(x, y, 'g');
    set(3, 2, 'B'); set(4, 2, 'B'); set(2, 3, 'B');
  }),
  fox: () => paint(15, 14, ({ shape, set }) => {
    shape(poly([[1, 0.5], [5.5, 4], [1, 6]]), 'f');
    shape(poly([[14, 0.5], [9.5, 4], [14, 6]]), 'f');
    shape(poly([[1.5, 4], [13.5, 4], [14.5, 8], [7.5, 13.5], [0.5, 8]]), 'f');
    shape(poly([[3, 8], [7.5, 12.8], [12, 8], [7.5, 9.6]]), 'w');
    set(2, 1, 'F'); set(12, 1, 'F');
    set(4, 6, 'k'); set(4, 7, 'k'); set(10, 6, 'k'); set(10, 7, 'k'); set(7, 12, 'k'); set(8, 12, 'k');
  }),
  star: () => paint(11, 11, ({ shape }) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2.3 : 5.2; pts.push([5.5 + Math.cos(a) * r, 5.8 + Math.sin(a) * r]); }
    shape(poly(pts), (x, y) => (x + y < 9 ? 'Y' : 'y'));
  }),
  speaker: () => paint(13, 11, ({ shape, set }) => {
    shape(poly([[0.5, 3.5], [3, 3.5], [6.5, 0.5], [6.5, 10.5], [3, 7.5], [0.5, 7.5]]), 'w');
    for (const [x, y] of [[8, 4], [8, 5], [8, 6], [10, 2], [10, 3], [10, 7], [10, 8], [9, 3], [9, 7]]) set(x, y, 'w');
  }),
  speakerOff: () => paint(13, 11, ({ shape, set }) => {
    shape(poly([[0.5, 3.5], [3, 3.5], [6.5, 0.5], [6.5, 10.5], [3, 7.5], [0.5, 7.5]]), 'W');
    for (const [x, y] of [[8, 3], [9, 4], [10, 5], [11, 6], [11, 3], [10, 4], [8, 6], [9, 7], [8, 7], [11, 7]]) set(x, y, 'r');
  }),
  play: () => paint(9, 11, ({ shape }) => shape(poly([[1, 0.5], [8.5, 5.5], [1, 10.5]]), 'w')),
  close: () => paint(9, 9, ({ set }) => { for (let i = 0; i < 9; i++) { set(i, i, 'w'); set(8 - i, i, 'w'); set(i + 1 < 9 ? i + 1 : i, i, 'w'); set(7 - i, i, 'w'); } }, false),
  expand: () => paint(11, 11, ({ set }) => {
    for (let i = 0; i < 4; i++) { set(i, 0, 'w'); set(0, i, 'w'); set(10 - i, 10, 'w'); set(10, 10 - i, 'w'); set(10 - i, 0, 'w'); set(10, i, 'w'); set(i, 10, 'w'); set(0, 10 - i, 'w'); }
    set(1, 1, 'w'); set(2, 2, 'w'); set(9, 1, 'w'); set(8, 2, 'w'); set(1, 9, 'w'); set(2, 8, 'w'); set(9, 9, 'w'); set(8, 8, 'w');
  }, false),
  mail: () => paint(13, 10, ({ shape, set }) => {
    shape((x, y) => x > 0.2 && x < 12.8 && y > 0.5 && y < 9.5, 'w');
    for (let i = 0; i < 6; i++) { set(1 + i, 1 + i * 0.8, 'S'); set(11 - i, 1 + i * 0.8, 'S'); }
  }),
  chat: () => paint(13, 11, ({ shape, set }) => {
    shape(ell(6.5, 4.4, 6.2, 4), 'w');
    shape(poly([[3, 7], [3, 10.5], [7, 7.5]]), 'w');
    set(4, 4, 'k'); set(6, 4, 'k'); set(8, 4, 'k');
  }),
  gamepad: () => paint(15, 9, ({ shape, set }) => {
    shape(poly([[1.5, 1.5], [4, 0.5], [11, 0.5], [13.5, 1.5], [15, 6], [13.5, 8.5], [11.5, 8.5], [10, 6.5], [5, 6.5], [3.5, 8.5], [1.5, 8.5], [0, 6]]), 'b');
    for (const [x, y] of [[3, 2], [3, 3], [3, 4], [2, 3], [4, 3]]) set(x, y, 'w');
    set(11, 2, 'y'); set(12, 3, 'r'); set(11, 4, 'g'); set(10, 3, 'p'); set(6, 2, 'B'); set(8, 2, 'B');
  }),
  heart: () => paint(11, 10, ({ shape, set }) => {
    shape(ell(3, 3, 3, 2.8), 'r'); shape(ell(8, 3, 3, 2.8), 'r'); shape(poly([[0.2, 4], [10.8, 4], [5.5, 9.8]]), 'r');
    set(2, 2, 'p'); set(3, 2, 'p'); set(2, 3, 'p');
  }),
  frame: () => paint(13, 11, ({ shape, set }) => {
    shape((x, y) => x > 0 && x < 13 && y > 0 && y < 11, 'n');
    shape((x, y) => x > 1.2 && x < 11.8 && y > 1.2 && y < 9.8, 'B');
    shape(poly([[1.5, 9.8], [5, 4.5], [8, 7.5], [9.5, 6], [11.8, 9.8]]), 'g');
    set(9, 3, 'y'); set(10, 3, 'y'); set(9, 4, 'y'); set(10, 4, 'y');
  }),
  brackets: () => paint(13, 9, ({ set }) => {
    for (const [x, y] of [[4, 0], [3, 1], [2, 2], [1, 3], [0, 4], [1, 5], [2, 6], [3, 7], [4, 8]]) set(x, y, 'G');
    for (const [x, y] of [[8, 0], [9, 1], [10, 2], [11, 3], [12, 4], [11, 5], [10, 6], [9, 7], [8, 8]]) set(x, y, 'B');
    for (const [x, y] of [[7, 0], [7, 1], [6, 3], [6, 4], [6, 5], [5, 7], [5, 8]]) set(x, y, 'y');
  }, false),
  tree: () => paint(11, 13, ({ shape, set }) => {
    shape((x, y) => x > 4 && x < 7 && y > 7, 'n');
    shape(ell(5.5, 4.2, 4.6, 3.8), 'g');
    set(3, 3, 'G'); set(4, 3, 'G'); set(4, 2, 'G'); set(7, 5, 'G');
  }),
  bag: () => paint(11, 12, ({ shape, set }) => {
    shape(poly([[1.5, 3], [9.5, 3], [10.5, 11.5], [0.5, 11.5]]), 'o');
    shape(poly([[2.5, 0.5], [8.5, 0.5], [9.5, 3], [1.5, 3]]), 'y');
    set(4, 7, 'w'); set(5, 7, 'w'); set(6, 7, 'w'); set(5, 8, 'w');
  }),
};

const cache = new Map();
/** icon name -> data URL scaled by `scale` (CSS px per art pixel) */
export function iconURL(name, scale = 3) {
  const key = name + ':' + scale;
  if (cache.has(key)) return cache.get(key);
  const rows = ICONS[name]();
  const w = rows[0].length, h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]) { ctx.fillStyle = PAL[ch]; ctx.fillRect(x * scale, y * scale, scale, scale); } }));
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

/** <img> html for an icon */
export function iconImg(name, scale = 3, cls = '') {
  const rows = ICONS[name]();
  return `<img class="pf-px ${cls}" src="${iconURL(name, scale)}" width="${rows[0].length * scale}" height="${rows.length * scale}" alt="" draggable="false">`;
}
