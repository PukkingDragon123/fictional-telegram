// Procedural pixel-art effect sprites (drawn once into a small atlas):
// droplets, cartoon blood, splats, hearts, stars, sparkles, coins, dust puffs,
// smoke, a cartoon "fight cloud", leaves, feathers, bubbles, shell bits,
// planks, plus chunky comic words ("CHOMP!", "YUMMY!", "POW!"...) set in the
// game font, TBME Goofy (src/ui/goofyText.js), with a thick ink outline. The
// words are drawn at the font's full 14 px caps, twice the old 7 px font's
// detail; particles size frames by height, so they stay the same size in the world.
//
// [v31 fx] More hand-placed pixel sprites: dandelion seeds and pollen, sun motes,
// a 4-frame water glint, splash rings (drawn on the texel grid, never an arc),
// a water crown, foam flecks, wind-torn mist, maple leaves that flutter, wood
// chips and splinters, rock chips, egg-shell shards, a comic impact burst,
// kicked-up ground dust, embers, spindrift wisps, snow flakes and a blinking
// firefly with a dithered halo. Every frame of one animation shares a size (the
// particles scale frames by height).
import { comicWordSize, paintComicWord } from '../ui/goofyText.js';

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
  love: { text: 'LOVE!', fill: '#ffe3f0', shade: '#ff6aa8', ink: '#5a1030' },
  smooch: { text: 'SMOOCH!', fill: '#ffe8f4', shade: '#ff8ac0', ink: '#5a1030' },
  ready: { text: 'READY!', fill: '#ffe3f0', shade: '#ff6aa8', ink: '#5a1030' },
  harvest: { text: 'HARVEST!', fill: '#f0ffd8', shade: '#6cc04a', ink: '#1a3a10' },
  gulp: { text: 'GULP!', fill: '#fff4d0', shade: '#ffb84a', ink: '#5a1e10' },
  chop: { text: 'CHOP!', fill: '#fff4d0', shade: '#d8a050', ink: '#4a2a10' },
  timber: { text: 'TIMBER!', fill: '#f0ffd8', shade: '#8ac04a', ink: '#2a3a10' },
  sold: { text: 'SOLD!', fill: '#fffbd0', shade: '#ffc020', ink: '#5a3a00' },
  // fish eating (src/game/fishEatFx.js)
  slurp: { text: 'SLURP!', fill: '#e8fbff', shade: '#5ac0ff', ink: '#10304a' },
  nomnom: { text: 'NOM NOM', fill: '#fff4d0', shade: '#ffb84a', ink: '#5a1e10' },
  crunch: { text: 'CRUNCH!', fill: '#fff4d0', shade: '#ff9a4a', ink: '#5a1e10' },
  nibble: { text: 'NIBBLE', fill: '#f0ffd8', shade: '#6cc04a', ink: '#1a3a10' },
  snap: { text: 'SNAP!', fill: '#fffbd0', shade: '#ffd23a', ink: '#6a1a10' },
};

let cache = null;

export function buildFxAtlas() {
  if (cache) return cache;
  const W = 512, H = 512; // the TBME Goofy comic words need the room
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
  draw('glint', ['.a.', 'aba', '.a.'], { a: '#ffffff', b: '#ffffff' }); // (the title scene's glints + motes use this one)
  draw('glow', ['.aaa.', 'abbba', 'abcba', 'abbba', '.aaa.'], { a: '#ffcf7a', b: '#ffe6a8', c: '#ffffff' });
  // [v31 fx] firefly: a dithered halo when it lights up, a dark spark between blinks
  draw('firefly', ['..c..', '.cac.', 'cabac', '.cac.', '..c..'], { a: '#d8ff7a', b: '#ffffe0', c: '#6a9a2a' });
  draw('firefly', ['.c.c.', 'c.a.c', '.aba.', 'c.a.c', '.c.c.'], { a: '#c8ff6a', b: '#ffffd0', c: '#4a7a20' });
  draw('firefly', ['.....', '.....', '..b..', '.....', '.....'], { b: '#a8d860' });
  draw('firefly', ['.....', '..c..', '.cac.', '..c..', '.....'], { a: '#d8ff7a', c: '#6a9a2a' });
  // --- coins (spin frames)
  draw('coin', ['.aab.', 'abbbc', 'abdbc', 'abbbc', '.bcc.'], { a: '#fff6b0', b: '#ffc83a', c: '#c8861a', d: '#fff0a0' }, '#5a3a08');
  draw('coin', ['.ab.', 'abbc', 'abbc', 'abbc', '.bc.'], { a: '#fff6b0', b: '#ffc83a', c: '#c8861a' }, '#5a3a08');
  draw('coin', ['ab', 'bc', 'bc', 'bc', 'bc'], { a: '#fff6b0', b: '#ffc83a', c: '#c8861a' }, '#5a3a08');
  // --- dust / smoke puffs (grow frames)
  // [v31 fx] dust puffs: same frame size, the cloud swells and breaks up (lit top-left, dithered edge)
  const dustPal = { a: '#fbf3dc', b: '#e6d8b4', c: '#c8b48c', d: '#a8946e' };
  draw('dust', ['..aab..', '.abbbc.', 'abbbccc', '.bcccd.', '..cdd..'], dustPal);
  draw('dust', ['.aa.ab.', 'aabbbbc', 'abbbccc', '.bccddc', '..c.dd.'], dustPal);
  draw('dust', ['a..a..a', '.ab.b.c', 'b.bc.cc', '.c.cdc.', 'c..d..d'], dustPal);
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
  // [v31 fx] a maple leaf tumbling: face on, tilted, edge on, tilted back (tinted per tree)
  const leafPal = { a: '#ff9a6a', b: '#e0502e', c: '#a8301c', d: '#6a1c10' };
  draw('leaf', ['..a..', '.aab.', 'aabbc', '.bbc.', '..d..'], leafPal);
  draw('leaf', ['.....', '.aab.', 'abbbc', '..cc.', '...d.'], leafPal);
  draw('leaf', ['.....', '.....', 'abbcd', '.....', '.....'], leafPal);
  draw('leaf', ['.....', '.abb.', 'abbcc', '.dc..', '.....'], leafPal);
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
  // food crumbs / flakes (drawn white, tinted with the food's colour; the outline tints darker)
  const crumbPal = { a: '#ffffff', b: '#e4e4e4', c: '#b4b4b4' };
  draw('crumb', ['ab', 'bc'], crumbPal, '#5a5a5a');
  draw('crumb', ['.a', 'ab', 'bc'], crumbPal, '#5a5a5a');
  draw('crumb', ['aab', '.bc'], crumbPal, '#5a5a5a');
  draw('ring_l', ['..aaa..', '.a...a.', 'a.....a', 'a.....a', 'a.....a', '.a...a.', '..aaa..'], { a: '#ffffff' });
  draw('tagmark', [
    '..c......',
    '.c.aaaaa.',
    'c.abbbbba',
    '.cabwbwba',
    '..abbbbba',
    '...aaaaa.',
  ], { a: '#8a1a1a', b: '#e8402a', c: '#e8e0c8', w: '#ffffff' }, '#3a0a0a');

  // ================================================================ [v31 fx]
  // dandelion seed (pappus umbrella on a stalk), pollen, sun motes
  draw('seed', ['a.a.a', '.aba.', 'a.c.a', '..c..', '..d..'], { a: '#ffffff', b: '#e8e8f0', c: '#c8b890', d: '#7a5a34' });
  draw('seed', ['.a.a.', 'a.b.a', '.aca.', '..c..', '..d..'], { a: '#ffffff', b: '#e8e8f0', c: '#c8b890', d: '#7a5a34' });
  draw('pollen', ['ab', 'bc'], { a: '#fff8b0', b: '#f0d040', c: '#c89a20' });
  draw('mote', ['.....', '.....', '..a..', '.....', '.....'], { a: '#fff4d0' });
  draw('mote', ['.....', '..a..', '.aba.', '..a..', '.....'], { a: '#ffe0a0', b: '#fffbe8' });
  draw('mote', ['..a..', '..b..', 'abcba', '..b..', '..a..'], { a: '#ffcf80', b: '#fff0c0', c: '#ffffff' });
  draw('mote', ['.....', '..a..', '.aba.', '..a..', '.....'], { a: '#ffe0a0', b: '#fffbe8' });
  // water glint (wglint): a pinpoint flares into a 4-point star and dies
  const gl = { a: '#bfe8ff', b: '#ffffff', c: '#ffffff' };
  draw('wglint', ['.......', '.......', '.......', '...b...', '.......', '.......', '.......'], gl);
  draw('wglint', ['.......', '.......', '...a...', '..aba..', '...a...', '.......', '.......'], gl);
  draw('wglint', ['...a...', '...a...', '...b...', 'aabcbaa', '...b...', '...a...', '...a...'], gl);
  draw('wglint', ['.......', '...a...', '...a...', '.aabaa.', '...a...', '...a...', '.......'], gl);
  draw('wglint', ['.......', '.......', '...a...', '..a.a..', '...a...', '.......', '.......'], gl);
  // splash rings (flat on the water), drawn on the texel grid: expanding, thinning, breaking up
  const ringRows = (R, th, gap) => {
    const N = 17, c = 8, rows = [];
    for (let y = 0; y < N; y++) {
      let row = '';
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - c, y - c);
        const on = d >= R - th && d < R + 0.5;
        const broken = gap && ((x * 7 + y * 13) % gap === 0 || Math.atan2(y - c, x - c) * 3.3 % 1 > 0.72);
        row += on && !broken ? (d < R - th + 1 ? 'b' : 'a') : '.';
      }
      rows.push(row);
    }
    return rows;
  };
  const ringPal = { a: '#ffffff', b: '#a8e0ff' };
  draw('splashring', ringRows(2.6, 1.6, 0), ringPal);
  draw('splashring', ringRows(4.4, 1.6, 0), ringPal);
  draw('splashring', ringRows(6.2, 1.2, 5), ringPal);
  draw('splashring', ringRows(7.6, 1.0, 3), ringPal);
  // the water crown of a cannonball: shoots up, bursts into a crown, collapses
  const crownPal = { a: '#ffffff', b: '#c8f0ff', c: '#78c8f0', d: '#3a8ac0' };
  draw('crown', ['...........', '...........', '...........', '...........', '.....a.....', '....aba....', '...abcba...', '..abccdba..', '.abccddcba.'], crownPal);
  draw('crown', ['.a...a...a.', '.ba.aba.ab.', '..b.bcb.b..', '..bbccbbb..', '...bcccb...', '...bcdcb...', '..bccdccb..', '.abccddcba.', 'abccdddccba'], crownPal);
  draw('crown', ['a....a....a', '.....b.....', 'b.a.....a.b', '...a.b.a...', '..b.....b..', '...b.c.b...', '..bc.d.cb..', '.abc.d.cba.', 'abccdddccba'], crownPal);
  draw('crown', ['...........', '.a.......a.', '...........', '....a.a....', '..a.....a..', '....b.b....', '...b.c.b...', '..bc.d.cb..', '.ab.cdc.ba.'], crownPal);
  draw('foam', ['ab.', 'bba'], { a: '#ffffff', b: '#d0f0ff' });
  draw('foam', ['.a', 'ab'], { a: '#ffffff', b: '#d0f0ff' });
  // mist / spray: dithered so the world shows through (no soft alpha)
  const mistPal = { a: '#ffffff', b: '#e6eef6', c: '#c8d6e6' };
  draw('mist', ['......a.a.a.a.....', '...a.a.babab.ba.a.', '.a.babababababab.a', 'a.bab.b.bcb.babab.', '.b.b.b.c.c.c.b.b.a', '..b.c.c.c.c.c.c.b.', '....c...c...c.....'], mistPal);
  draw('mist', ['.....a.a.a........', '..a.ababab.a.a....', 'a.babababa.babab..', '.babab.bcbc.bab.a.', 'a.b.c.c.c.c.b.b.b.', '.b.c.c.c.c.c.c.b..', '...c...c...c...c..'], mistPal);
  draw('spray', ['.a.', 'aba', '.a.'], { a: '#e8f8ff', b: '#ffffff' });
  // wood chips (3 tumble frames) and splinters; rock chips
  const chipPal = { a: '#f0d0a0', b: '#c8985a', c: '#8a5a2e', d: '#5a3a1a' };
  draw('chip', ['abb.', 'bccd'], chipPal);
  draw('chip', ['.ab.', 'abcd', '.cd.'], chipPal);
  draw('chip', ['ab', 'bc', 'cd'], chipPal);
  draw('splinter', ['aabbbc', '.bccd.'], chipPal);
  const rockPal = { a: '#d8d0c8', b: '#a49c94', c: '#6e6660', d: '#3e3836' };
  draw('rockchip', ['.ab', 'abc', 'bcd'], rockPal);
  draw('rockchip', ['ab.', 'bcc', '.cd'], rockPal);
  draw('rockchip', ['.a.', 'abc', 'cdd'], rockPal);
  // egg-shell shards: jagged, speckled, a dark inner edge
  const shellPal = { a: '#fffaf0', b: '#ece2c8', c: '#c8b898', d: '#8a7a5a', e: '#9a8a6a' };
  draw('shard', ['a.a..', 'abab.', 'bebbc', '.cdd.'], shellPal);
  draw('shard', ['.a.a', 'abba', 'bbec', 'cd..'], shellPal);
  draw('shard', ['a...', 'aba.', 'bbea', '.cdc'], shellPal);
  // comic impact burst: star flash, ring of rays, breaking up
  const burstPal = { a: '#ffffff', b: '#fff2a0', c: '#ffc23a', d: '#e8601a', e: '#7a2a10' };
  draw('burst', ['.....e.....', '....eae....', '.e..eae..e.', '..eebbbee..', '..ebbabbe..', 'eeabaaabaee', '..ebbabbe..', '..eebbbee..', '.e..eae..e.', '....eae....', '.....e.....'], burstPal);
  draw('burst', ['e....d....e', '.d...c...d.', '..dc.c.cd..', '...cbbbc...', '.cc.bab.cc.', 'dccbaaabccd', '.cc.bab.cc.', '...cbbbc...', '..dc.c.cd..', '.d...c...d.', 'e....d....e'], burstPal);
  draw('burst', ['d.........d', '...........', '..c.....c..', '.....b.....', '...........', 'c...b.b...c', '...........', '.....b.....', '..c.....c..', '...........', 'd.........d'], burstPal);
  // kicked-up ground dust (a low, wide puff), embers, spindrift, snow flakes
  const kickPal = { a: '#f6ecd0', b: '#dccaa0', c: '#b8a07a' };
  draw('dustk', ['...........', '...........', '....aab....', '..aabbbbc..', '.abbbbccc..'], kickPal);
  draw('dustk', ['...........', '....aa.....', '..aabbba...', '.abbbccbcc.', 'abbcc.cc.c.'], kickPal);
  draw('dustk', ['.....a.....', '..a.a.b.a..', '.a.b.b.c.b.', 'a.b.c.c.c.c', '.c...c...c.'], kickPal);
  draw('ember', ['ab', 'bc'], { a: '#fff4a0', b: '#ffb43a', c: '#e0501a' });
  draw('ember', ['.a', 'b.'], { a: '#ffd060', b: '#ff7a2a' });
  const driftPal = { a: '#ffffff', b: '#e0ecfa', c: '#bccce6' };
  draw('spindrift', ['......a.a..', '..a.abab.a.', 'aababbbcb.a', '.b.bcbc.c..', '...c...c...'], driftPal);
  draw('spindrift', ['.......a...', '...a.a.ba.a', '.aabab.bcb.', 'a.bcb.c.c..', '..c.....c..'], driftPal);
  draw('flake', ['.a.', 'aba', '.a.'], { a: '#e8f4ff', b: '#ffffff' });
  draw('flake', ['a.a', '.b.', 'a.a'], { a: '#e8f4ff', b: '#ffffff' });

  // --- comic words (TBME Goofy, 2 px ink outline + 1 px drop)
  for (const [id, w] of Object.entries(COMIC_WORDS)) {
    const sz = comicWordSize(w.text, { pad: 2, drop: 1 });
    const r = alloc(sz.w, sz.h);
    paintComicWord(ctx, r.x, r.y, w.text, { fill: w.fill, shade: w.shade, ink: w.ink, pad: 2, drop: 1 });
    frames['word_' + id] = [r];
  }
  cache = { canvas: cv, frames };
  return cache;
}
