// Procedural pixel-art effect sprites (drawn once into a small atlas):
// droplets, cartoon blood, splats, hearts, stars, sparkles, coins, dust puffs,
// smoke, a cartoon "fight cloud", leaves, feathers, bubbles, shell bits,
// planks, plus chunky comic words ("CHOMP!", "YUMMY!", "POW!"...) set in a
// tiny built-in 5x7 pixel font with a thick outline.

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#....', '#....', '#####'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#..#.', '#...#', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '...#.', '..#..', '..#..', '.....', '..#..'],
  '$': ['.#.', '###', '#..', '###', '..#', '###', '.#.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
};

export const COMIC_WORDS = {
  chomp: { text: 'CHOMP!', fill: '#fff4d0', shade: '#ffb84a', ink: '#5a1e10' },
  munch: { text: 'MUNCH', fill: '#fff4d0', shade: '#ff9a4a', ink: '#5a1e10' },
  yum: { text: 'YUMMY!', fill: '#ffe3f0', shade: '#ff6aa8', ink: '#5a1030' },
  nom: { text: 'NOM', fill: '#fff4d0', shade: '#ffb84a', ink: '#5a1e10' },
  burp: { text: 'BURP!', fill: '#e8ffd0', shade: '#8ad84a', ink: '#1e4a10' },
  pow: { text: 'POW!', fill: '#fffbd0', shade: '#ffd23a', ink: '#6a1a10' },
  bonk: { text: 'BONK!', fill: '#fffbd0', shade: '#ff8a3a', ink: '#6a1a10' },
  bam: { text: 'BAM!', fill: '#fffbd0', shade: '#ff5a3a', ink: '#6a1a10' },
  splash: { text: 'SPLASH!', fill: '#e8fbff', shade: '#5ac0ff', ink: '#10304a' },
  smash: { text: 'SMASH!', fill: '#ffe0d0', shade: '#ff4a3a', ink: '#4a0a0a' },
  wow: { text: 'WOW!', fill: '#fffbd0', shade: '#ffd23a', ink: '#4a2a10' },
  rawr: { text: 'RAWR!', fill: '#ffe0d0', shade: '#ff4a3a', ink: '#4a0a0a' },
  built: { text: 'DONE!', fill: '#f0ffd8', shade: '#6cc04a', ink: '#1a3a10' },
  gold: { text: 'GOLD!', fill: '#fffbd0', shade: '#ffc020', ink: '#5a3a00' },
  zzz: { text: 'ZZZ', fill: '#e8f0ff', shade: '#9ab4ff', ink: '#1a2450' },
};

let cache = null;

export function buildFxAtlas() {
  if (cache) return cache;
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const frames = {};
  let cx = 1, cy = 1, rowH = 0;
  const alloc = (w, h) => {
    if (cx + w + 1 > W) { cx = 1; cy += rowH + 1; rowH = 0; }
    const r = { x: cx, y: cy, w, h };
    cx += w + 1;
    rowH = Math.max(rowH, h);
    return r;
  };
  // draw from string rows: palette chars -> colours, auto outline with `ol`
  const draw = (name, rows, pal, ol = null) => {
    const h = rows.length, w = rows[0].length;
    const pad = ol ? 1 : 0;
    const r = alloc(w + pad * 2, h + pad * 2);
    if (ol) {
      ctx.fillStyle = ol;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] !== '.') ctx.fillRect(r.x + x, r.y + y, 3, 3);
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        ctx.fillStyle = pal[ch] || '#ff00ff';
        ctx.fillRect(r.x + pad + x, r.y + pad + y, 1, 1);
      }
    (frames[name] ||= []).push(r);
    return r;
  };

  // --- droplets
  draw('drop', ['.a.', 'aab', 'bbb', '.b.'], { a: '#ffffff', b: '#8fd8ff' });
  draw('drop_s', ['ab', 'bb'], { a: '#ffffff', b: '#a8e4ff' });
  draw('blood', ['.a.', 'aab', 'bbc', '.c.'], { a: '#ff7a7a', b: '#e0242e', c: '#9a0c1c' });
  draw('blood_s', ['ab', 'bc'], { a: '#ff5a5a', b: '#d0182a', c: '#8a0a18' });
  draw('chunk', ['aab', 'abc', 'bcc'], { a: '#ffb0a8', b: '#f06a6a', c: '#b02a3a' }, '#5a1020');
  // --- splats (flat decals)
  draw('splat', [
    '....a.....a..',
    '..aabba..ab..',
    '.abbbbbaab...',
    'aabbccbbbba..',
    '.abbcccbbbaa.',
    '..abbccbbba..',
    '.a.abbbbba...',
    '....aa.aab...',
  ], { a: '#e0303a', b: '#c01a2a', c: '#8a0c1c' });
  draw('splat_s', ['.aa.a', 'abba.', 'abcba', '.aba.'], { a: '#e0303a', b: '#c01a2a', c: '#8a0c1c' });
  draw('splat_water', [
    '...aaa....',
    '.aabbbaa..',
    'aabbbbbbaa',
    '.abbbbbba.',
    '..aabbaa..',
  ], { a: '#d86a78', b: '#c04a5a' });
  // --- hearts, stars, sparkles
  draw('heart', ['.ab.ab.', 'abbbbbb', 'bbbbbbb', '.bbbbc.', '..bbc..', '...c...'], { a: '#ffd0e0', b: '#ff5a8a', c: '#d02a5a' }, '#5a1030');
  draw('heart_s', ['ab.b', 'bbbb', '.bc.'], { a: '#ffd0e0', b: '#ff5a8a', c: '#d02a5a' }, '#5a1030');
  draw('star', ['...a...', '..aab..', 'aaabbbb', '.abbbc.', '.bbcbc.', 'bc...cb'], { a: '#fff8c0', b: '#ffd23a', c: '#e09a1a' }, '#6a3a10');
  draw('sparkle', ['..a..', '..b..', 'abcba', '..b..', '..a..'], { a: '#fff2a0', b: '#fffbe0', c: '#ffffff' });
  draw('sparkle', ['.....', '..b..', '.bcb.', '..b..', '.....'], { a: '#fff2a0', b: '#fffbe0', c: '#ffffff' });
  draw('glint', ['.a.', 'aba', '.a.'], { a: '#ffffff', b: '#ffffff' });
  draw('glow', ['.aaa.', 'abbba', 'abcba', 'abbba', '.aaa.'], { a: '#ffcf7a', b: '#ffe6a8', c: '#ffffff' });
  draw('firefly', ['.a.', 'aba', '.a.'], { a: '#c8ff6a', b: '#ffffd0' });
  // --- coins (spin frames)
  draw('coin', ['.aab.', 'abbbc', 'abdbc', 'abbbc', '.bcc.'], { a: '#fff6b0', b: '#ffc83a', c: '#c8861a', d: '#fff0a0' }, '#5a3a08');
  draw('coin', ['.ab.', 'abbc', 'abbc', 'abbc', '.bc.'], { a: '#fff6b0', b: '#ffc83a', c: '#c8861a' }, '#5a3a08');
  draw('coin', ['ab', 'bc', 'bc', 'bc', 'bc'], { a: '#fff6b0', b: '#ffc83a', c: '#c8861a' }, '#5a3a08');
  // --- dust / smoke puffs (grow frames)
  draw('dust', ['.aa.', 'abba', '.bb.'], { a: '#f4ead0', b: '#d8c8a0' });
  draw('dust', ['.aaa.', 'aabba', 'abbbb', '.bbb.'], { a: '#f4ead0', b: '#d8c8a0' });
  draw('dust', ['..aaa..', '.aabbaa', 'aabbbba', 'abbbbbb', '.bbbbb.'], { a: '#f4ead0', b: '#d8c8a0' });
  draw('smoke', ['..aaa...', '.aabbaa.', 'aabbbbba', 'abbbbbbb', '.bbbbbb.', '..bbbb..'], { a: '#e8e4e0', b: '#b8b2ae' });
  // --- cartoon fight cloud (2 frames) with a hammer and planks poking out
  const cloudPal = { a: '#ffffff', b: '#e8e4f0', c: '#c8c0d8', h: '#8a8a94', w: '#b07a44', d: '#7a4e2a' };
  draw('cloud', [
    '......aaa...hh.........',
    '..aa.abbba.hhh...aa....',
    '.abba.abbbbhh.aaabbaa..',
    'abbbbaabbbbbaabbbbbbba.',
    'abbbbbbbbbbbbbbbbbbbbba',
    '.abbbbbbbcbbbbbbbbbbbba',
    'wwabbbbbcccbbbbbcbbbba.',
    'dwabbbbbbcbbbbbcccbbbba',
    '.abbbbbbbbbbbbbbcbbbba.',
    '..abbbccbbbbbbbbbbbba..',
    '...abbbbbbbaabbbbbba...',
    '....aabba....aabbaa....',
  ], cloudPal, '#3a3050');
  draw('cloud', [
    '.......aaa........ww...',
    '..aaa.abbba..aa..wd....',
    '.abbba.abbbaabba.......',
    'abbbbbabbbbbbbbbaaa....',
    'abbbbbbbbbbbbbbbbbba...',
    'abbbbcbbbbbbbbbbbbbbba.',
    '.abbcccbbbbbbcbbbbbbba.',
    'abbbbcbbbbbbcccbbbbba..',
    'abbbbbbbbbbbbcbbbbbbbahh',
    '.abbbbbbbbccbbbbbbbba.hh',
    '..aabbbbbbbbbbbbaaa.....',
    '....aaabba..aabba.......',
  ], cloudPal, '#3a3050');
  // --- leaves / feathers / petals / bubbles / shells / planks / snow
  draw('leaf', ['ab.', 'bbc', '.cc'], { a: '#ff7a4a', b: '#e0402a', c: '#a0281a' });
  draw('leaf', ['.ab', 'abc', 'cc.'], { a: '#ff7a4a', b: '#e0402a', c: '#a0281a' });
  draw('feather', ['...a', '..ab', '.ab.', 'ab..', 'b...'], { a: '#ffffff', b: '#c8c8d0' });
  draw('petal', ['ab', 'bc'], { a: '#ffe0f0', b: '#ff9ac8', c: '#e070a8' });
  draw('bubble', ['.a.', 'a.b', '.b.'], { a: '#ffffff', b: '#a8e4ff' });
  draw('bubble_l', ['.aa.', 'a..b', 'a..b', '.bb.'], { a: '#ffffff', b: '#a8e4ff' });
  draw('shell', ['ab', 'bb'], { a: '#fffaf0', b: '#e8dcc0' }, '#7a6a50');
  draw('plank', ['aaab', 'bbbc'], { a: '#d8a868', b: '#b07a44', c: '#7a4e2a' });
  draw('nail', ['a', 'b'], { a: '#e0e0e8', b: '#8a8a94' });
  draw('snow', ['.a.', 'aba', '.a.'], { a: '#e8f4ff', b: '#ffffff' });
  draw('music', ['..aab', '..a.b', '..a.b', 'aaa.b', 'aaabb'], { a: '#ffffff', b: '#c8f0ff' }, '#2a3050');
  draw('zzz', ['aaaa', '..ab', '.ab.', 'aaaa'], { a: '#e0e8ff', b: '#b0c0ff' }, '#2a3060');
  draw('anger', ['a.b.a', '.a.a.', 'b...b', '.a.a.', 'a.b.a'], { a: '#ff3a2a', b: '#ff8a6a' }, '#5a0a0a');
  draw('sweat', ['.a.', 'aab', 'bbb', '.b.'], { a: '#ffffff', b: '#7ac8ff' }, '#1a3a5a');
  draw('question', ['.aaa.', 'a...a', '...a.', '..a..', '.....', '..a..'], { a: '#ffffff' }, '#2a2050');
  draw('bang', ['aa', 'aa', 'aa', 'aa', '..', 'aa'], { a: '#ffe060' }, '#6a1a10');
  draw('honey', ['.aab.', 'abbbc', 'abbbc', '.bcc.'], { a: '#ffe08a', b: '#f0a020', c: '#b86a10' }, '#5a3008');
  draw('fish', ['.ab..a', 'abbbbb', '.bc..c'], { a: '#c8ecff', b: '#5ab0ff', c: '#2a70c0' }, '#10304a');
  draw('dollar', ['.a.', 'aaa', 'a..', 'aaa', '..a', 'aaa', '.a.'], { a: '#8aff7a' }, '#1a4a10');
  draw('ring', ['.aaa.', 'a...a', 'a...a', 'a...a', '.aaa.'], { a: '#ffffff' });
  draw('tagmark', [
    '..c......',
    '.c.aaaaa.',
    'c.abbbbba',
    '.cabwbwba',
    '..abbbbba',
    '...aaaaa.',
  ], { a: '#8a1a1a', b: '#e8402a', c: '#e8e0c8', w: '#ffffff' }, '#3a0a0a');

  // --- comic words
  for (const [id, w] of Object.entries(COMIC_WORDS)) {
    const glyphs = [...w.text].map((ch) => FONT[ch] || FONT[' ']);
    const gw = glyphs.reduce((s, g) => s + g[0].length + 1, -1);
    const gh = 7;
    const r = alloc(gw + 4, gh + 4);
    // thick ink outline
    ctx.fillStyle = w.ink;
    let x0 = r.x + 2;
    for (const g of glyphs) {
      for (let y = 0; y < gh; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === '#') ctx.fillRect(x0 + x - 1, r.y + 2 + y - 1, 3, 4);
      x0 += g[0].length + 1;
    }
    x0 = r.x + 2;
    for (const g of glyphs) {
      for (let y = 0; y < gh; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === '#') {
        ctx.fillStyle = y < 3 ? w.fill : w.shade;
        ctx.fillRect(x0 + x, r.y + 2 + y, 1, 1);
      }
      x0 += g[0].length + 1;
    }
    frames['word_' + id] = [r];
  }
  cache = { canvas: cv, frames };
  return cache;
}
