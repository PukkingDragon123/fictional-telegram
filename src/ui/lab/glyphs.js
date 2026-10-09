// Tiny hand-drawn pixel glyphs for the lab computer (canvas + DOM), one colour each.
const ROWS = {
  check: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  cross: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  lock: ['.###.', '#...#', '#...#', '#####', '##.##', '##.##', '#####'],
  paw: ['.#.#.', '#.#.#', '.....', '.###.', '#####', '.###.'],
  coin: ['.###.', '#.#.#', '#.#.#', '#.#.#', '.###.'],
  clock: ['.###.', '#.#.#', '#.###', '#...#', '.###.'],
  key: ['.##......', '#..#####.', '#..#.#.#.', '.##......'],
  play: ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
  ff: ['#..#...', '##.##..', '#######', '##.##..', '#..#...'],
  rush: ['...##', '..##.', '.####', '####.', '..##.', '.##..', '.#...'],
  up: ['..#..', '.###.', '#####', '..#..', '..#..'],
  down: ['..#..', '..#..', '#####', '.###.', '..#..'],
  arrowl: ['..#', '.##', '###', '.##', '..#'],
  arrowr: ['#..', '##.', '###', '##.', '#..'],
  plus: ['.#.', '###', '.#.'],
  minus: ['###'],
  fit: ['##.##', '#...#', '.....', '#...#', '##.##'],
  x: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  bench: ['#######', '#.....#', '#######', '.#...#.', '.#...#.'],
  dot: ['#'],
};

export const GLYPH_NAMES = Object.keys(ROWS);
const cache = new Map();

/** canvas of glyph `name` in `color` at integer `scale` */
export function glyph(name, color = '#52e47e', scale = 1) {
  const k = name + color + scale;
  let c = cache.get(k);
  if (c) return c;
  const rows = ROWS[name] || ROWS.dot;
  c = document.createElement('canvas');
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  const x = c.getContext('2d', { willReadFrequently: true }); // CPU canvas: toDataURL stays cheap
  x.fillStyle = color;
  rows.forEach((r, y) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') x.fillRect(i * scale, y * scale, scale, scale); });
  cache.set(k, c);
  return c;
}

const urls = new Map();
/** `<img>` html of a glyph for DOM text (class lt-gl) */
export function glyphHTML(name, color = 'currentColor', scale = 2) {
  const col = color === 'currentColor' ? '#52e47e' : color;
  const k = name + col + scale;
  let h = urls.get(k);
  if (!h) {
    const c = glyph(name, col, scale);
    h = `<img class="lt-gl" src="${c.toDataURL()}" width="${c.width}" height="${c.height}" alt="" draggable="false">`;
    urls.set(k, h);
  }
  return h;
}

/** draw a glyph into ctx at device px (x, y) */
export function drawGlyph(ctx, name, color, x, y, scale = 1) {
  const c = glyph(name, color, Math.max(1, Math.round(scale)));
  ctx.drawImage(c, Math.round(x), Math.round(y));
  return c;
}
