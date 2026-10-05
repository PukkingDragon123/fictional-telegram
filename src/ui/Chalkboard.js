// Chalkboard: a tiny pixel-art chalk drawing engine for the classroom
// cutscenes (src/game/Classroom.js). It paints onto a low-res canvas (192x108
// by default) that becomes the 3D board's texture; any 2D canvas works too
// (the lesson title card uses a small one).
//
//   const board = new Chalkboard({ w: 192, h: 108 });
//   await board.draw([
//     { text: 'LOVE & EGGS', x: 96, y: 12, scale: 2, color: 'yellow' },
//     { doodle: 'heart', x: 96, y: 54, scale: 2, id: 'love' },
//     { arrow: [40, 80, 70, 80] }, { circle: 'love' }, { check: [150, 80] },
//   ], { speed: 1 });                      // resolves when the last stroke is down
//   board.highlight('love');               // pulse; { mode: 'circle' | 'underline' | 'box' } draws a mark
//   await board.erase({ animated: true }); // felt eraser swipes, dust clouds, faint ghosts stay
//   board.tipPos();                        // { x, y, u, v, down, tool } chalk tip / eraser centre
//   board.update(dt);                      // advance + repaint; board.version bumps on every repaint
//
// Strokes are revealed progressively, as if drawn by hand: outlines are traced
// pixel by pixel, fills are hatched diagonally, text is written glyph by glyph,
// with chalk dust puffing at the tip. Chalk looks slightly broken and grainy
// (per-pixel grain, skipped specks, faint dust halo). Everything is
// deterministic (seeded) so screenshots are stable.
//
// Coordinates are board pixels (x right, y down). Items are positioned by
// their centre unless noted (`align: 'left'` for text, endpoints for lines).

import { GOOFY_HI, GOOFY_BIG, GOOFY_SMALL, goofyGlyph, goofyMeasure } from './goofyFont.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ------------------------------------------------------------------ palette
// Pastel chalk on a green slate. Index 0 = no ink.
export const CHALK_COLORS = {
  white: '#f3f0e2', yellow: '#f7e07a', pink: '#f6a8c4', blue: '#98cff2',
  green: '#addf8a', orange: '#f6b46c', lilac: '#c8b2f2', red: '#f2867a', dark: '#18281f',
};
const COLOR_IDS = Object.keys(CHALK_COLORS);
const COLOR_RGB = [null, ...COLOR_IDS.map((k) => hexRGB(CHALK_COLORS[k]))];
const cIdx = (c) => {
  if (typeof c === 'number') return c;
  const i = COLOR_IDS.indexOf(c || 'white');
  return i < 0 ? 1 : i + 1;
};
const LETTER_COLOR = { W: 'white', Y: 'yellow', P: 'pink', B: 'blue', G: 'green', O: 'orange', L: 'lilac', R: 'red', K: 'dark' };
const SLATE = ['#1d3027', '#22382d', '#273f32', '#2c4637', '#314c3d', '#375444'].map(hexRGB);

// ------------------------------------------------------------------ fonts
// TBME Goofy, the game font, as chalk bitmaps (src/ui/goofyFont.js):
// "big": 7 px chunky caps; at an even scale >= 2 it switches to the full
// 14 px font ("hi", drawn at half the scale: same size, twice the detail).
// "small": 3x5 caps for labels. The "big" letters hop like the font's.
const FONTS = { big: GOOFY_BIG, small: GOOFY_SMALL, hi: GOOFY_HI };
const glyphOf = goofyGlyph;
/** { F, S }: the font table and pixel scale that `fontName` at `scale` really draws with. */
function fontAt(fontName, scale) {
  const S = Math.max(1, Math.round(scale || 1));
  if ((fontName || 'big') === 'big' && S >= 2 && S % 2 === 0) return { F: FONTS.hi, S: S / 2 };
  return { F: FONTS[fontName] || FONTS.big, S };
}

/** Width in board px of `str` in a font ('big' | 'small') at an integer scale. */
export function measureText(str, scale = 1, fontName = 'big') {
  const { F, S } = fontAt(fontName, scale);
  return goofyMeasure(F, str, S);
}

/** Crisp pixel text on any 2D canvas (posters, name cards). Returns the width drawn. */
export function pixelText(ctx, str, x, y, color = '#fff', { scale = 1, font = 'big', align = 'left' } = {}) {
  const { F, S } = fontAt(font, scale);
  const m = goofyMeasure(F, str, S);
  let cx = Math.round(align === 'center' ? x - m.w / 2 : align === 'right' ? x - m.w : x);
  ctx.fillStyle = color;
  for (const ch of String(str)) {
    const g = glyphOf(F, ch);
    g.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '#') ctx.fillRect(cx + u * S, y + v * S, S, S); });
    cx += (g[0].length + F.sp) * S;
  }
  return m.w;
}

/** The doodle art as rows of palette letters (see the legend below). */
export function doodleRows(name) { return doodleArt(name); }
/** RGB of a chalk colour name. */
export function chalkRGB(name) { return COLOR_RGB[cIdx(name)] || COLOR_RGB[1]; }

// ------------------------------------------------------------------ doodles
// Hand-made chalk pixel art. Uppercase = outline strokes, lowercase = hatched
// fill, in that chalk colour: W/w white, Y/y yellow, P/p pink, B/b blue,
// G/g green, O/o orange, L/l lilac, R/r red. K = dark cut (rubs chalk out,
// pupils and pips), '*' = white accent drawn last (eye shines, sparkles).
// '.' = empty. Most doodles are meant to be drawn at scale 2.
const FISH = [
  '..........WWWW......',
  '........WWbbbbWW....',
  '..W....WbbbbbbbbW...',
  '..WW..WbbbbbbbbbbW..',
  '..WbW.WbbbbbbbbK*bW.',
  '..WbbWbbbbbbbbbKKbbW',
  '..WbbWbbbbbbbbbbbbbW',
  '..WbW.WbbbbbbbbbbWW.',
  '..WW..WbbbbbbbbbbW..',
  '..W....WbbbbbbbbW...',
  '........WWbbbbWW....',
  '..........WWWW......',
];
const SYM_M = ['....BBB', '.....BB', '....B.B', '.BBB...', 'B...B..', 'B...B..', '.BBB...'];
const SYM_F = ['.PPP.', 'P...P', 'P...P', 'P...P', '.PPP.', '..P..', '.PPP.', '..P..'];
const BOW = ['PP.PP', 'PpPpP', 'PP.PP'];
const SPARK = ['.Y.', 'Y*Y', '.Y.'];
const HAND_UP = [
  '...WW....',
  '..WwwW...',
  '..WwwW...',
  '..WwwWWW.',
  '.WWwwWwwWW',
  'WwWwwwwwwW',
  'WwwwwwwwwW',
  'WwwwwwwwW.',
  '.WwwwwwwW.',
  '..WwwwwW..',
  '..WWWWWW..',
];
const DOODLE_ART = {
  fish: FISH,
  fish_m: () => compose([[FISH, 0, 3], [SYM_M, 17, 0]]),
  fish_f: () => compose([[FISH, 0, 3, { b: 'p' }], [BOW, 11, 1], [SYM_F, 19, 0]]),
  fish_star: () => compose([[FISH, 0, 6], [['....Y....', '...YyY...', 'YYYYyYYYY', '.YyyyyyY.', '..YyyyY..', '.YyY.YyY.', '.YY...YY.'], 10, 0]]),
  fish_heart: () => compose([[FISH, 0, 5], [['.PP.PP.', 'PppPppP', 'PpppppP', '.PpppP.', '..PpP..', '...P...'], 14, 0]]),
  fish_rainbow: () => compose([[FISH, 0, 0, { rows: ['r', 'r', 'o', 'o', 'y', 'y', 'g', 'g', 'b', 'b', 'l', 'l'] }]]),
  fish_gold: () => compose([[FISH, 0, 2, { b: 'y' }], [SPARK, 0, 0], [SPARK, 18, 11]]),
  fish_ghost: () => compose([[FISH, 0, 0, { b: '.', W: 'B' }]]),
  fish_dark: () => compose([[FISH, 0, 0, { b: 'k', K: 'W', '*': 'W' }]]),
  fish_calico: () => compose([[FISH, 0, 0, { patch: true }]]),
  fish_albino: () => compose([[FISH, 0, 0, { b: 'w', K: 'P' }]]),
  zombie: () => compose([[FISH, 0, 0, { b: 'g', K: 'k', '*': 'k' }], [['K.K', '.K.', 'K.K'], 15, 3], [['W.W.W', 'WWWWW', 'W.W.W'], 8, 6]]),
  minifish: [
    '.....WWW...',
    'W...WbbbW..',
    'WW.WbbbK*W.',
    'WbWbbbbbbbW',
    'WW.WbbbbWW.',
    'W...WWWW...',
  ],
  tiny: [
    '...WW..',
    'W.WbbW.',
    'WWbbK*W',
    'W.WbbW.',
    '...WW..',
  ],
  titan: [
    '.............WWWWWW.........',
    '..........WWWbbbbbbWWW......',
    '........WWbbbbbbbbbbbbWW....',
    '..W....WbbbbbbbbbbbbbbbbW...',
    '..WW..WbbbbbbbbbbbbbbbbbbW..',
    '..WbW.WbbbbbbbbbbbbbbKK*bbW.',
    '..WbbWbbbbbbbbbbbbbbbKKKbbbW',
    '..WbbWbbbbbbbbbbbbbbbbbbbbbW',
    '..WbbWbbbbbbbbbbbbbbbbbbbWW.',
    '..WbW.WbbbbbbbbbbbbbbbbbbW..',
    '..WW..WbbbbbbbbbbbbbbbbbW...',
    '..W....WWbbbbbbbbbbbbbWW....',
    '.........WWWbbbbbbbWWW......',
    '............WWWWWWW.........',
  ],
  fish_full: [
    '.........WWWW......',
    '.......WWooooWW....',
    '......WoooooooooW..',
    'W....WooooooooKooW.',
    'WW..WooooooooKoKooW',
    'WoW.WoooooooooooooW',
    'WooWooooooooooooWW.',
    'WoW.WoooooooooooooW',
    'WW..WooooyyyyyyoooW',
    'W....WoyyyyyyyyyW..',
    '......WoyyyyyyyoW..',
    '.......WWooooWW....',
    '.........WWWW......',
  ],
  fish_hungry: [
    '.................B..',
    '..W.......WWWWW.BbB.',
    '..WW...WWWbbbbbWWBB.',
    '..WbWWWbWbWbbbbbKWW.',
    '..WbbbbbWbWbbbbbbbbW',
    '..WbWWWbWbWbbbbbbWW.',
    '..WW...WWWbbbbbWWbW.',
    '..W.......WWWWW.....',
  ],
  egg: [
    '...OOO...',
    '.OOyyyOO.',
    '.Oy**yyO.',
    'Oy*yyyyyO',
    'OyyyyyyyO',
    'OyyyyKyyO',
    '.OyyyyyO.',
    '.OOyyyOO.',
    '...OOO...',
  ],
  clutch: () => eggPile([[5, 3], [9.5, 2.6], [14, 3], [3, 7], [7.5, 6.6], [12, 6.8], [16.4, 7]], 19, 10),
  egg_glow: () => compose([[eggPile([[5, 4.5]], 10, 9, 3.2), 3, 2], [SPARK, 0, 0], [SPARK, 13, 1], [SPARK, 1, 9], [SPARK, 13, 9]]),
  heart: [
    '.PP...PP.',
    'PppP.PppP',
    'Pp*pPpppP',
    'PpppppppP',
    '.PpppppP.',
    '..PpppP..',
    '...PpP...',
    '....P....',
  ],
  heart_big: [
    '..PPP.....PPP..',
    '.PpppP...PpppP.',
    'Pp**ppP.PpppppP',
    'Pp*pppppppppppP',
    'PpppppppppppppP',
    '.PpppppppppppP.',
    '..PpppppppppP..',
    '...PpppppppP...',
    '....PpppppP....',
    '.....PpppP.....',
    '......PpP......',
    '.......P.......',
  ],
  bag: [
    '...WWWWWW...',
    '..WwwwwwwW..',
    '..WWWWWWWW..',
    '.WooooooooW.',
    'WooooooooooW',
    'WoYYYYYYYYoW',
    'WoY.BBB..YoW',
    'WoYBbbbB.YoW',
    'WoY.BBB..YoW',
    'WoYYYYYYYYoW',
    'WooooooooooW',
    'WooooooooooW',
    '.WWWWWWWWWW.',
  ],
  pellet: [
    '.OO......OO.',
    'OooO....OooO',
    '.OO..OO..OO.',
    '....OooO....',
    '.....OO.....',
  ],
  seed: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '.....YY.....',
    '....YyyY....',
    '....YyyY....',
    '..OOOYYOOO..',
    '.OoooooooooO',
    'OOOOOOOOOOOO',
  ],
  sprout: [
    '............',
    '............',
    '............',
    '............',
    '............',
    '..GG....GG..',
    '.GggG..GggG.',
    '..GggGGggG..',
    '....GGGG....',
    '.....GG.....',
    '.....GG.....',
    '..OOOGGOOO..',
    '.OoooooooooO',
    'OOOOOOOOOOOO',
  ],
  growing: [
    '......GG....',
    '.....GggG...',
    '..GG..GG....',
    '.GggG.GG.GG.',
    '..GggGGGGggG',
    '....GGGGGGG.',
    '..GG.GG.....',
    '.GggGGG.GG..',
    '..GggGGGggG.',
    '.....GGGG...',
    '.....GG.....',
    '..OOOGGOOO..',
    '.OoooooooooO',
    'OOOOOOOOOOOO',
  ],
  ready: [
    '.Y...PP...Y.',
    '...PPppPP...',
    '...PpYYpP...',
    '...PPppPP...',
    '.GG..PP..GG.',
    'GggG.GG.GggG',
    '.GggGGGGggG.',
    '...GGGGGG...',
    '.GG.GGG.GG..',
    'GggGGGGGggG.',
    '.GG..GG..GG.',
    '..OOOGGOOO..',
    '.OoooooooooO',
    'OOOOOOOOOOOO',
  ],
  carrot: [
    '.G..G..G..',
    '..G.G.G...',
    '...GGG....',
    '..OOOOOO..',
    '..OooooO..',
    '..OOoooO..',
    '...OoooO..',
    '...OooOO..',
    '...OoooO..',
    '....OooO..',
    '....OoO...',
    '....OO....',
    '....O.....',
  ],
  golden_carrot: () => compose([[DOODLE_ART.carrot, 2, 1, { O: 'Y', o: 'y' }], [SPARK, 0, 4], [SPARK, 10, 0], [SPARK, 9, 9]]),
  bush: [
    '....GGGGGG....',
    '..GGggggggGG..',
    '.GggBBggggBBG.',
    'GggBbbBggBbbBG',
    'GgggBBgggGBBgG',
    'GgBBggBBgggggG',
    'GBbbBBbbBgBBgG',
    '.GBBggBBgBbbB.',
    '..GGggggGGBBG.',
    '....GGGGGG....',
    '......OO......',
  ],
  seaweed: [
    '.G.....G.',
    'GgG...GgG',
    '.GgG..GgG',
    '..GgG..Gg',
    '.GgG..GgG',
    'GgG..GgG.',
    'Gg..GgG..',
    'GgG.GgG..',
    '.GgG.GgG.',
    '..GgG.GgG',
    '.GgG..GgG',
    'GgG..GgG.',
    '.GG...GG.',
    'BBBBBBBBB',
  ],
  lilypad: [
    '......PP.PP...',
    '.....PppPppP..',
    '......PYYYP...',
    '..GGGGGGG.GGG.',
    '.GgggggggGgggG',
    'GggggggggggggG',
    '.GgggggggggggG',
    '..GGGGGGGGGGG.',
    'BB...BBB...BBB',
  ],
  cattail: [
    '.L.L............',
    'LlLlL...........',
    '.L.L.....OO.....',
    '........OooO....',
    '........OooO..OO',
    '...OO...OooO.OooO',
    '..OooO..OooO.OooO',
    '..OooO...GG..OooO',
    '..OooO...G....GG.',
    '...GG....G....G..',
    '....G...GG...G...',
    '....G..G.G..G....',
    '.G..GG.G.GGG..G..',
    '..G.G.GG.G...G...',
    'BBBBBBBBBBBBBBBBB',
  ],
  bear: [
    '.OOO.......OOO.',
    'OoooO.....OoooO',
    'OooOOOOOOOOOooO',
    '.OOoooooooooOO.',
    '..OoKoooooKoO..',
    '..OoooooooooO..',
    '.OoooWWWWWoooO.',
    '.OoooWWKWWoooO.',
    '..OoooWWWoooO..',
    '...OOOOOOOOO...',
    '..LLLWWRWWLLL..',
    '.LlllWWRWWlllL.',
    '.LlllWRRRWlllL.',
  ],
  beaver: [
    '....YYYYYYY....',
    '...YyyyyyyyY...',
    '..YYYYYYYYYYY..',
    '.OOoooooooooOO.',
    'OoooKoooooKoooO',
    'OooooooooooooOO',
    '.OoooOOKOOoooO.',
    '.OooOoooooOooO.',
    '..OooooWWoooO..',
    '...OOOOWWOOO...',
    '.....OOOOO.....',
  ],
  sun: [
    '......Y......',
    '..Y...Y...Y..',
    '...Y.....Y...',
    '.....YYY.....',
    '....YyyyY....',
    'YY.YyKyKyY.YY',
    '...YyyyyyY...',
    '....YyKyY....',
    '.....YYY.....',
    '...Y.....Y...',
    '..Y...Y...Y..',
    '......Y......',
  ],
  dna: [
    'B.......P',
    '.B.....P.',
    '..BWWWP..',
    '...B.P...',
    '....L....',
    '...P.B...',
    '..PWWWB..',
    '.P.....B.',
    'P.......B',
    '.P.....B.',
    '..PWWWB..',
    '...P.B...',
    '....L....',
    '...B.P...',
    '..BWWWP..',
    '.B.....P.',
    'B.......P',
  ],
  dice: [
    '.WWWWWWWW.',
    'WwwwwwwwwW',
    'WwKwwwwwwW',
    'WwwwwwwwwW',
    'WwwwwKwwwW',
    'WwwwwwwwwW',
    'WwwwwwwKwW',
    'WwwwwwwwwW',
    '.WWWWWWWW.',
  ],
  magnifier: [
    '...WWWW.....',
    '..WbbbbW....',
    '.Wb**bbbW...',
    '.Wb*bbbbW...',
    '.WbbbbbbW...',
    '.WbbbbbbW...',
    '..WbbbbW....',
    '...WWWWOO...',
    '........OO..',
    '.........OO.',
    '..........OO',
  ],
  question: [
    '..YYYYY..',
    '.YY...YY.',
    'YY.....YY',
    '.......YY',
    '......YY.',
    '....YYY..',
    '....YY...',
    '.........',
    '....YY...',
    '....YY...',
  ],
  bang: ['.YY.', 'YyyY', 'YyyY', 'YyyY', '.YY.', '.YY.', '....', '.YY.', '.YY.'],
  star: [
    '.....Y.....',
    '....YyY....',
    '....YyY....',
    'YYYYYyYYYYY',
    '.YyyyyyyyY.',
    '..YyyyyyY..',
    '..YyyYyyY..',
    '.YyyY.YyyY.',
    '.YYY...YYY.',
  ],
  clover: [
    '.GG...GG.',
    'GggG.GggG',
    'GgggGgggG',
    '.GggGggG.',
    '..GGGGG..',
    '.GggGggG.',
    'GgggGgggG',
    'GggG.GggG',
    '.GG.G.GG.',
    '....G....',
    '.....G...',
  ],
  coin: [
    '..YYYY..',
    '.YyyyyY.',
    'YyyYYyyY',
    'YyYyyyyY',
    'YyyYYyyY',
    'YyyyyYyY',
    'YyyYYyyY',
    '.YyyyyY.',
    '..YYYY..',
  ],
  pearl: [
    '....LLLL....',
    '...Ll**lL...',
    '...Ll*llL...',
    '...LllllL...',
    '.LLLLLLLLLL.',
    'Ll**lLLl**lL',
    'Ll*llLLl*llL',
    'LllllLLllllL',
    '.LLLL..LLLL.',
  ],
  worm: [
    '........PPP.',
    '.......PpppP',
    'PP....PpK*P.',
    'PpP..PpP....',
    '.PpPPpP.....',
    '..PppP......',
  ],
  krill: [
    'O..O.........',
    '.O..OOOOOO...',
    '..OOooooooOO.',
    '.OooooooooK*O',
    '..OOooooooOO.',
    '.O.O.O.O.O...',
  ],
  flakes: [
    '.P....B...',
    'PpP..BbB..',
    '.P..Y..B..',
    '...YyY..G.',
    '.G..Y..GgG',
    'GgG..O..G.',
    '.G..OoO...',
    '.....O....',
  ],
  maple: [
    '.....R.....',
    '....RrR....',
    '.R.RrrrR.R.',
    '.RRrrrrrRR.',
    'RRrrrrrrrRR',
    '.RrrrrrrrR.',
    '..RRrrrRR..',
    '....RrR....',
    '.....R.....',
    '.....R.....',
  ],
  moon: [
    '..YYYY...',
    '.YyyyY...',
    'YyyyY....',
    'YyyY.....',
    'YyyY.....',
    'YyyyY....',
    '.YyyyYY..',
    '..YYYY...',
  ],
  moonberry: [
    '.*...G...*.',
    '.....GG....',
    '...BBBBB...',
    '..BbbbbbB..',
    '.Bb**bbbbB.',
    '.Bb*bbbbbB.',
    '.BbbbbbbbB.',
    '..BbbbbbB..',
    '*..BBBBB..*',
  ],
  bunny: [
    '.WW...WW.',
    'WppW.WppW',
    'WppW.WppW',
    'WppW.WppW',
    '.WWWWWWW.',
    'WwwwwwwwW',
    'WwKwwwKwW',
    'WwwwPwwwW',
    '.WwwwwwW.',
    '..WWWWW..',
  ],
  sprinkler: [
    '.B..B..B..B.',
    'B..B....B..B',
    '..B..BB..B..',
    '.B..B..B..B.',
    '....WWWW....',
    '.....WW.....',
    '.....WW.....',
    '...WWWWWW...',
  ],
  bug: [
    '..W...W..',
    '...W.W...',
    '..RRRRR..',
    '.RrKrKrR.',
    'RrrrKrrrR',
    'RKrrKrrKR',
    'RrrrKrrrR',
    '.RrrKrrR.',
    '..RRRRR..',
  ],
  grinder: [
    'W.......W..',
    '.W.....W...',
    '..WWWWW....',
    '...WwW.....',
    '.WWWWWWW.OO',
    '.WwwwwwW.O.',
    '.WwKKKwWOO.',
    '.WwwwwwW...',
    '.WWWWWWW...',
    '..W...W....',
  ],
  tank: [
    'WWWWWWWWWWWWWWW',
    'WbbbbbbbbbbbbbW',
    'Wbb.bbbbbbbbbbW',
    'Wb.bbbbWWWbbbbW',
    'WbbbbbWbbK*WbbW',
    'WbbbbbbWWWbbbbW',
    'WbbGbbbbbbbbGbW',
    'WbGbbbbbbbbGbbW',
    'WOOOOOOOOOOOOOW',
    'WWWWWWWWWWWWWWW',
  ],
  timer: [
    'WWWWWWW',
    '.WyyyW.',
    '..WyW..',
    '...W...',
    '..W.W..',
    '.WyyyW.',
    'WWWWWWW',
  ],
  crown: ['Y..Y..Y', 'YY.Y.YY', 'YyYyYyY', 'YyyyyyY', 'YYYYYYY'],
  snowflake: [
    '....B....',
    '..B.B.B..',
    '...BBB...',
    'B..BWB..B',
    '.BBWWWBB.',
    'B..BWB..B',
    '...BBB...',
    '..B.B.B..',
    '....B....',
  ],
  flame: [
    '...R....',
    '..RR.R..',
    '..RrRR..',
    '.RrrrR.R',
    '.RrOorRR',
    'RrOyyOrR',
    'RrOyyOrR',
    '.RrOOrR.',
    '..RRRR..',
  ],
  flame2: [
    '..R.....R...',
    '.RR..R..RR..',
    '.RrRRRR.RrR.',
    'RrrOrrR.RrrR',
    'RrOyOrR.RrOR',
    'RrOyOrRRrOyR',
    '.RrOrRrrOyrR',
    '..RRRRRRRRR.',
  ],
  candy: [
    'P.........P',
    'PP..PPP..PP',
    'PpPPpWpPPpP',
    'PP.PpppP.PP',
    'P...PPP...P',
  ],
  sparkle: [
    '....Y....',
    '....Y....',
    '...YyY...',
    '..YyyyY..',
    'YYyy*yyYY',
    '..YyyyY..',
    '...YyY...',
    '....Y....',
    '....Y....',
  ],
  doge: [
    'O.......O',
    'OO.....OO',
    'OoOOOOOoO',
    'OoKoooKoO',
    'OowwwwwoO',
    '.OwwKwwO.',
    '..OOOOO..',
  ],
  galaxy: [
    '...LLLL....',
    '.LL....L.*.',
    'L..BBB..L..',
    'L.B.*.B.L..',
    'L.B..B..L..',
    '.L.BB..L...',
    '..L...L....',
    '*..LLL.....',
  ],
  bowl: [
    'W..........W',
    'WoOoOoOoOoOW',
    'WwwwwwwwwwwW',
    '.WwwwwwwwwW.',
    '..WWWWWWWW..',
  ],
  basket: [
    '..OOOOOOO..',
    '.O.......O.',
    'O..R.G.Y..O',
    'OOOOOOOOOOO',
    'OoOoOoOoOoO',
    '.OoOoOoOoO.',
    '..OOOOOOO..',
  ],
  hand: () => HAND_UP.slice().reverse(), // finger pointing down: "tap!"
  hand_up: HAND_UP,
  sad: ['..WWWWW..', '.W.....W.', 'W.K...K.W', 'W.......W', 'W..WWW..W', '.WW...WW.', '..WWWWW..'],
  happy: ['..YYYYY..', '.Y.....Y.', 'Y.K...K.Y', 'Y.......Y', 'Y.Y...Y.Y', '.Y.YYY.Y.', '..YYYYY..'],
  shop: [
    'PPPPPPPPPPP',
    'PwPwPwPwPwP',
    '.WWWWWWWWW.',
    '.W.......W.',
    '.W.YYY.B.W.',
    '.W.Y.Y.B.W.',
    'WWWWWWWWWWW',
  ],
  flower: ['..P.P..', '.PpPpP.', 'PpPYPpP', '.PpPpP.', '..PGP..', '...G.G.', '..GG...'],
  book: [
    '.BBBBBBBB.',
    'BbbbbbbbbB',
    'BbWWWWWWbB',
    'BbbbbbbbbB',
    'BbWWWWbbbB',
    'BbbbbbbbbB',
    'BBBBBBBBBB',
    'WWWWWWWWWW',
  ],  // ---- builder's guide, bear business, stars & reviews
  tree: [
    '.....G.....',
    '....GgG....',
    '...GgggG...',
    '....GgG....',
    '...GgggG...',
    '..GgggggG..',
    '...GgggG...',
    '..GgggggG..',
    '.GgggggggG.',
    'GGGGGGGGGGG',
    '.....O.....',
    '....OOO....',
  ],
  rock: ['...LLLL...', '..LllllL..', '.Ll*llllL.', 'LllllllllL', 'LLLLLLLLLL'],
  weeds: ['.G..G..G.', '.G.GG.GG.', 'GG.G..G..', '.GG.GGG.G', '..GGG.GGG', 'GGGGGGGGG'],
  logs: () => pileArt([[4, 7], [10, 7], [7, 3]], 14, 10, 2.7),
  hammer: ['WWWWWW..', 'WwwwwWW.', 'WWWWWW..', '..OO....', '..OO....', '..OO....', '..OO....', '..OO....'],
  axe: ['..WWW....', '.WWwWW...', 'WWwwwWO..', '.WWWW.O..', '......O..', '.......O.', '.......O.', '........O'],
  lodge: [
    '......RR......',
    '....RRrrRR....',
    '..RRrrrrrrRR..',
    'RRRRRRRRRRRRRR',
    '.WwwwwwwwwwwW.',
    '.WwBBwwwwBBwW.',
    '.WwBBwwwwBBwW.',
    '.WwwwwOOwwwwW.',
    '.WwwwOooOwwwW.',
    '.WwwwOooOwwwW.',
    '.WWWWWWWWWWWW.',
  ],
  map: [
    'YYYYYYYYYYYYYY',
    'YyyyyYyyyyYyyY',
    'YyGGyYyyBBYyyY',
    'YyGgGYyBbbBYyY',
    'YyyGYyyBbbBYyY',
    'YyyyyY.yBBYRyY',
    'Yy.y.Y.y.yYyRY',
    'YyyyyYyyyyRyRY',
    'YyyyyYyyyyYRyY',
    'YYYYYYYYYYYYYY',
  ],
  plot: [
    '..........WWWWWW',
    '..........WrrrrW',
    '..........WWWWWW',
    '............W...',
    '.GGGGGGGGGGGGGG.',
    'GgggggggggggWgggG',
    'GgOOOOOOOOOOOOgG',
    'GgOooooooooooOgG',
    'GgOooooooooooOgG',
    'GgOOOOOOOOOOOOgG',
    'GggggggggggggggG',
    '.GGGGGGGGGGGGGG.',
  ],
  fence: [
    '.W...W...W...W.',
    'WwW.WwW.WwW.WwW',
    'WWWWWWWWWWWWWWW',
    'WwW.WwW.WwW.WwW',
    'WWWWWWWWWWWWWWW',
    'WwW.WwW.WwW.WwW',
    'GGGGGGGGGGGGGGG',
  ],
  gnome: [
    '....R....',
    '...RrR...',
    '...RrR...',
    '..RrrrR..',
    '.RRRRRRR.',
    '..PKpKP..',
    '.WwPPPwW.',
    '.WwwwwwW.',
    '..WwwwW..',
    '.BbWWWbB.',
    '.BbbbbbB.',
    '.OOO.OOO.',
  ],
  platform: [
    '..G.Y..P..G...',
    '.GgGYy.PpGgG..',
    'OOOOOOOOOOOOOO',
    'OooooooooooooO',
    'OOOOOOOOOOOOOO',
    '.O..O....O..O.',
    '.O..O....O..O.',
    '.O..O....O..O.',
    'BBBBBBBBBBBBBB',
  ],
  gear: ['....W....', '.W.WWW.W.', '..WwwwW..', '.WwwKwwW.', 'WWwKKKwWW', '.WwwKwwW.', '..WwwwW..', '.W.WWW.W.', '....W....'],
  tag: [
    'Y...WWWWWWWW',
    '.Y.WwwwwwwwW',
    '..WwKwRRRwwW',
    '.WwwwwwwwwwW',
    '..WwwwRRwwwW',
    '...WwwwwwwwW',
    '....WWWWWWWW',
  ],
  smash: [
    '..Y...Y...Y..',
    '...Y.YYY.Y...',
    'Y..YYyyyYY..Y',
    '.YYyyRRRyyYY.',
    '..YyRrrrRyY..',
    'YYyRrrrrrRyYY',
    '..YyRrrrRyY..',
    '.YYyyRRRyyYY.',
    'Y..YYyyyYY..Y',
    '...Y.YYY.Y...',
    '..Y...Y...Y..',
  ],
  review: [
    'WWWWWWWWWWWW',
    'WwwwwwwwwwwW',
    'WwKKKKKKwwwW',
    'WwwwwwwwwwwW',
    'WwYwYwYwYwwW',
    'WwwwwwwwwwwW',
    'WwKKKKKwwwwW',
    'WwKKKKKKKwwW',
    'WwKKKKwwwwwW',
    'WwwwwwwwwwwW',
    'WWWWWWWWWWWW',
  ],
  trophy: [
    '.YYYYYYYYY.',
    'YYyyyyyyyYY',
    'Y.Yy**yyY.Y',
    'Y.Yy*yyyY.Y',
    '.YYyyyyyYY.',
    '...YyyyY...',
    '....YyY....',
    '.....Y.....',
    '....YYY....',
    '..OOOOOOO..',
    '..OoooooO..',
    '..OOOOOOO..',
  ],
  office: [
    '.....W......',
    '....WWW.....',
    '.WWWWWWWWWW.',
    '.WwBwBwBwBW.',
    '.WwwwwwwwwW.',
    '.WwBwBwBwBW.',
    '.WwwwwwwwwW.',
    '.WwBwBwBwBW.',
    '.WwwwwwwwwW.',
    '.WwBwBwBwBW.',
    '.WwwwOOwwwW.',
    '.WwwwOOwwwW.',
    'GGGGGGGGGGGG',
  ],
  clock5: ['..WWWWW..', '.W..Y..W.', 'W...Y...W', 'W...Y...W', 'W...W...W', 'W....W..W', 'W.....W.W', '.W.....W.', '..WWWWW..'],
  plate: [
    'W.W.W..........',
    'W.W.W...WWWWW..',
    'WWWWW..WwwwwwW.',
    '..W...WwwBBbwwW',
    '..W...WwwwwwwwW',
    '..W....WwwwwwW.',
    '..W.....WWWWW..',
  ],
  bear_shadow: [
    '..RRR.......RRR..',
    '.RkkkR.....RkkkR.',
    '.RkkkRRRRRRRkkkR.',
    '..RkkkkkkkkkkkR..',
    '..RkkYYkkkYYkkR..',
    '..RkkkYkkkYkkkR..',
    '.RkkkkkkkkkkkkkR.',
    '.RkkkkWkWkWkkkkR.',
    '..RkkkkWkWkkkkR..',
    '...RRkkkkkkkRR...',
    '.RRkkkkkkkkkkkRR.',
    'RkkkkkkkkkkkkkkkR',
    'RkkRkkkkkkkkkRkkR',
    'RkkRkkkkkkkkkRkkR',
    'RRRRRRRRRRRRRRRRR',
  ],
  goose: [
    '...WWW......',
    '..WwKwOO....',
    '..WwwwW.....',
    '...WwW......',
    '...WwW......',
    '..WwwW......',
    '.WwwwwWWWW..',
    'WwwwwwwwwwW.',
    'WwwwwwwwwW..',
    '.WWwwwwWW...',
    '...O..O.....',
  ],
  honey: ['..WWWWW..', '.WwwwwwW.', '..WWWWW..', '.YYYYYYY.', 'YyyyyyyyY', 'YyOOOOOyY', 'YyOyyyOyY', 'YyOOOOOyY', 'YyyyyyyyY', '.YYYYYYY.'],
  mushroom: ['..OOOOO..', '.OoooooO.', 'OoooooooO', 'OOOOOOOOO', '...WwW...', '...WwW...', '..WwwwW..', '..WWWWW..'],
  syrup: ['..WWW..', '..WwW..', '..OOO..', '.OoooO.', 'OoooooO', 'OoRRRoO', 'OoRrRoO', 'OoooooO', 'OoooooO', '.OOOOO.'],
  rice: ['.Y..Y..Y.', 'YyY.Y.YyY', '.Y.YyY.Y.', '.G..Y..G.', '..G.G.G..', '..G.G.G..', '...GGG...', '....G....', '....G....'],
  pantry: [
    'OOOOOOOOOOOO',
    'OooooooooooO',
    'OoYYoGGoRRoO',
    'OOOOOOOOOOOO',
    'OoBBoYYoPPoO',
    'OOOOOOOOOOOO',
    'OooooOOoooooO',
    'OooooOOoooooO',
    'OooYoOOoYoooO',
    'OooooOOoooooO',
    'OOOOOOOOOOOOO',
  ],
  menu: ['.LLLLLLLLL.', 'LlllllllllL', 'LlWWWWWWWlL', 'LlllllllllL', 'LlYlYlYlllL', 'LlllllllllL', 'LlWWWWWlllL', 'LlWWWWWWllL', 'LlllllllllL', '.LLLLLLLLL.'],
  boss: () => compose([[DOODLE_ART.crown, 4, 0], [DOODLE_ART.bear, 0, 4]]),
};

// Overlay several pieces of art into one; per-piece letter remaps
// ({ b: 'p' } recolours the blue fill pink, '.' removes), `rows` gives every
// row its own fill letter (rainbow fish) and `patch` makes calico blotches.
function compose(parts) {
  let W = 0, H = 0;
  for (const [rows, ox, oy] of parts) { W = Math.max(W, ox + Math.max(...rows.map((r) => r.length))); H = Math.max(H, oy + rows.length); }
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const [rows, ox, oy, map = {}] of parts) {
    rows.forEach((row, v) => {
      for (let u = 0; u < row.length; u++) {
        let ch = row[u];
        if (ch === '.') continue;
        if (map.rows && ch === 'b') ch = map.rows[v % map.rows.length];
        else if (map.patch && ch === 'b') ch = hash(Math.floor(u / 3), Math.floor(v / 3), 5) < 0.4 ? 'o' : hash(u >> 2, v >> 2, 9) < 0.3 ? 'k' : 'w';
        else if (map[ch] !== undefined) ch = map[ch];
        if (ch !== '.') g[oy + v][ox + u] = ch;
      }
    });
  }
  return g.map((r) => r.join(''));
}
// a heap of logs: round end-grain rings
function pileArt(centres, W, H, r) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const [cx, cy] of centres) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= 0.8) g[y][x] = 'O';
    else if (d <= r - 0.45) g[y][x] = 'y';
    else if (d <= r + 0.45) g[y][x] = 'O';
  }
  return g.map((row) => row.join(''));
}
// a little heap of round fish eggs
function eggPile(centres, W, H, r = 2.25) {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const [cx, cy] of centres) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r - 0.45) g[y][x] = 'y';
      else if (d <= r + 0.45) g[y][x] = 'O';
    }
    const sx = Math.floor(cx - r * 0.45), sy = Math.floor(cy - r * 0.45);
    if (g[sy]?.[sx] === 'y') g[sy][sx] = '*';
  }
  return g.map((r) => r.join(''));
}
const _art = new Map();
function doodleArt(name) {
  if (_art.has(name)) return _art.get(name);
  let a = DOODLE_ART[name] || DOODLE_ART.question;
  if (typeof a === 'function') a = a();
  _art.set(name, a);
  return a;
}

// Doodle metadata: which fill letter is the "main" colour (re-tintable).
const DOODLE_TINT_OUTLINE = { bag: 'W' }; // doodles whose outline follows the tint too
const DOODLE_MAIN = { fish: 'b', minifish: 'b', titan: 'b', tiny: 'b', fish_star: 'b', fish_heart: 'b', fish_full: 'o', fish_hungry: 'b', fish_m: 'b', fish_f: 'p', bag: 'o', heart: 'p', heart_big: 'p', star: 'y', egg: 'y' };
export const DOODLE_NAMES = Object.keys(DOODLE_ART);
/** Register extra doodles: name -> rows (or a function returning rows). Same letter code as above. Used by the portfolio site (portfolio/doodles.js). */
export function registerDoodles(map) {
  for (const [name, art] of Object.entries(map)) { DOODLE_ART[name] = art; _art.delete(name); }
}

// ------------------------------------------------------------------ stroke ordering
// Greedy nearest-neighbour walk through a set of pixels: produces continuous,
// hand-like strokes (pen lifts when the next pixel is far).
function traceStrokes(pixels) {
  const left = new Map();
  for (const p of pixels) left.set(p[0] + ',' + p[1], p);
  const out = [];
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  while (left.size) {
    // start at the top-left-most remaining pixel
    let start = null;
    for (const p of left.values()) if (!start || p[1] < start[1] || (p[1] === start[1] && p[0] < start[0])) start = p;
    const stroke = [start];
    left.delete(start[0] + ',' + start[1]);
    let cur = start, dir = 0;
    for (;;) {
      let next = null;
      // prefer continuing in the same direction, then gentle turns
      for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
        const d = DIRS[(dir + k + 8) % 8];
        const key = (cur[0] + d[0]) + ',' + (cur[1] + d[1]);
        if (left.has(key)) { next = left.get(key); dir = (dir + k + 8) % 8; break; }
      }
      if (!next) {
        // small gap (<= 2px): keep the pen down
        let best = null, bd = 5;
        for (const p of left.values()) {
          const dd = (p[0] - cur[0]) ** 2 + (p[1] - cur[1]) ** 2;
          if (dd < bd) { bd = dd; best = p; }
        }
        if (!best) break;
        next = best;
      }
      left.delete(next[0] + ',' + next[1]);
      stroke.push(next);
      cur = next;
    }
    out.push(stroke);
  }
  return out;
}

// diagonal zig-zag hatching order for fills
function hatchOrder(pixels) {
  const byDiag = new Map();
  for (const p of pixels) {
    const d = p[0] + p[1];
    if (!byDiag.has(d)) byDiag.set(d, []);
    byDiag.get(d).push(p);
  }
  const keys = [...byDiag.keys()].sort((a, b) => a - b);
  const pts = [];
  keys.forEach((k, i) => {
    const row = byDiag.get(k).sort((a, b) => a[0] - b[0]);
    if (i % 2) row.reverse();
    pts.push(...row);
  });
  return pts;
}

// ------------------------------------------------------------------ primitive geometry
function linePts(x1, y1, x2, y2, wob = 0.6, seed = 1) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.ceil(L * 2));
  const nx = -(y2 - y1) / (L || 1), ny = (x2 - x1) / (L || 1);
  const ph = hash(seed, 3) * 6.28, fr = 1 + hash(seed, 5) * 1.5;
  const pts = [];
  let last = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = Math.sin(t * Math.PI * fr + ph) * wob * Math.sin(t * Math.PI);
    const x = Math.round(lerp(x1, x2, t) + nx * w), y = Math.round(lerp(y1, y2, t) + ny * w);
    const k = x + ',' + y;
    if (k !== last) { pts.push([x, y]); last = k; }
  }
  return pts;
}
function polyPts(verts, closed, wob, seed) {
  const pts = [];
  const n = verts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const seg = linePts(a[0], a[1], b[0], b[1], wob, seed + i * 7);
    if (pts.length) seg.shift();
    pts.push(...seg);
  }
  return pts;
}
function ellipsePts(cx, cy, rx, ry, seed = 1, sweep = 1.08) {
  const pts = [];
  const a0 = -Math.PI * 0.62 + hash(seed, 1) * 0.4;
  const circ = Math.PI * (rx + ry);
  const n = Math.max(12, Math.ceil(circ * 1.6));
  const ph = hash(seed, 2) * 6.28;
  let last = '';
  for (let i = 0; i <= n * sweep; i++) {
    const t = i / n;
    const a = a0 + t * Math.PI * 2;
    const wob = 1 + 0.05 * Math.sin(a * 3 + ph) + (t > 1 ? (t - 1) * 0.6 : 0); // overshoot spirals out a touch
    const x = Math.round(cx + Math.cos(a) * rx * wob), y = Math.round(cy + Math.sin(a) * ry * wob);
    const k = x + ',' + y;
    if (k !== last) { pts.push([x, y]); last = k; }
  }
  return pts;
}
function fillPoly(test, x0, y0, x1, y1) {
  const px = [];
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) if (test(x + 0.5, y + 0.5)) px.push([x, y]);
  return px;
}

// ------------------------------------------------------------------ item compiler
const RATE = { line: 105, text: 125, fill: 430, cut: 220, accent: 60 };

function normalize(it) {
  if (it.type) return it;
  const o = { ...it };
  if (it.text != null) o.type = 'text';
  else if (it.doodle) { o.type = 'doodle'; o.name = it.doodle; }
  else for (const t of ['line', 'arrow', 'circle', 'box', 'check', 'cross', 'underline', 'star', 'heart', 'meter', 'dots']) {
    if (it[t] == null) continue;
    o.type = t;
    const v = it[t];
    if (typeof v === 'string') o.around = v;
    else if (Array.isArray(v)) o.args = v;
    break;
  }
  return o;
}

/**
 * The drawing engine. Construct once per canvas.
 * opts: { w, h, seed, canvas, ghosts (faint old smudges), surface: 'slate' | 'clear' }
 */
export class Chalkboard {
  constructor({ w = 192, h = 108, seed = 7, canvas = null, ghosts = true, surface = 'slate' } = {}) {
    this.w = w; this.h = h; this.seed = seed;
    this.canvas = canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (this.canvas) { this.canvas.width = w; this.canvas.height = h; }
    this.ctx = this.canvas?.getContext('2d') || null;
    this.img = this.ctx ? this.ctx.createImageData(w, h) : { data: new Uint8ClampedArray(w * h * 4) };
    this.inkC = new Uint8Array(w * h);
    this.inkA = new Float32Array(w * h);
    this.inkT = new Float32Array(w * h); // per-pixel tone jitter
    this.owner = new Int32Array(w * h).fill(-1); // item serial that last inked each pixel
    this.grain = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) this.grain[i] = hash(i % w, (i / w) | 0, seed + 11);
    this.base = this._paintSlate(surface);
    this.items = new Map(); // id -> item
    this.serial = 0;
    this.queue = [];
    this.parts = []; // dust specks
    this.fx = []; // highlight pulses
    this.tip = { x: w / 2, y: h / 2, down: false, tool: null, color: 1 };
    this.hurryK = 1;
    this.time = 0;
    this.version = 0;
    this.dirty = true;
    this.rand = rng(seed * 31 + 5);
    this.onSound = null; // (name, { volume, pitch }) => void : 'chalk_down', 'chalk', 'erase', 'tap'
    this._sndT = 0;
    this.showEraser = true;
    this.eraser = null;
    if (ghosts) this._ghosts();
    this._paint();
  }

  // ---------------------------------------------------------------- public API
  get busy() { return this.queue.length > 0; }

  /** Queue items to be drawn by hand. Resolves when they are all down. */
  draw(items, { speed = 1 } = {}) {
    const list = (Array.isArray(items) ? items : [items]).filter(Boolean).map((it) => this._compile(normalize(it)));
    return new Promise((resolve) => {
      if (!list.length) { resolve(); return; }
      this.queue.push({ kind: 'draw', items: list, speed: Math.max(0.05, speed), resolve, i: 0, s: 0, p: 0, acc: 0, pause: 0.05, travel: null, started: false });
    });
  }

  /** Bounding box [x0, y0, x1, y1] (board px) that `items` would cover, without drawing them. */
  measure(items) {
    const serial = this.serial;
    let b = null;
    for (const it of (Array.isArray(items) ? items : [items]).filter(Boolean)) {
      const c = this._compile(normalize(it));
      this.items.delete(c.id);
      if (!c.strokes.length) continue;
      const q = c.bbox;
      b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q.slice();
    }
    this.serial = serial;
    return b;
  }

  /** Wipe the board. animated: an eraser swipes across leaving faint ghosts. */
  erase({ animated = true, speed = 1 } = {}) {
    return new Promise((resolve) => {
      if (!animated) { this.queue.push({ kind: 'clear', resolve }); return; }
      this.queue.push({ kind: 'erase', speed, resolve, path: null, seg: 0, t: 0 });
    });
  }

  /** Make an item pulse (default) or mark it: mode 'circle' | 'underline' | 'box'. */
  highlight(id, { mode = 'pulse', color = 'yellow', dur = 1.4, speed = 1.4 } = {}) {
    const it = this.items.get(id);
    if (!it) return Promise.resolve();
    if (mode === 'circle' || mode === 'box' || mode === 'underline') {
      return this.draw({ type: mode, around: id, color }, { speed });
    }
    return new Promise((resolve) => { this.fx.push({ item: it, t: 0, dur, resolve, color: cIdx(color) }); this.dirty = true; });
  }

  /** Speed up whatever is being drawn (a player click). */
  hurry(k = 6) { this.hurryK = Math.max(this.hurryK, k); }

  /** Complete every queued job instantly. */
  finish() {
    let guard = 0;
    while (this.queue.length && guard++ < 1000) {
      const j = this.queue[0];
      if (j.kind === 'draw') this._stepDraw(j, 1e6);
      else if (j.kind === 'erase') { this._eraseAll(0.1); this._done(j); }
      else this._step(1e6);
    }
    this.dirty = true;
  }

  /** Instant wipe without ghosts (fresh board). */
  clear() {
    this.inkA.fill(0); this.inkC.fill(0); this.owner.fill(-1);
    this.items.clear();
    this.dirty = true;
  }

  /** Current chalk tip / eraser centre. u, v in 0..1 (u right, v down). */
  tipPos(out = {}) {
    const t = this.tip;
    out.x = t.x; out.y = t.y; out.u = t.x / this.w; out.v = t.y / this.h;
    out.down = t.down; out.tool = t.tool; out.color = COLOR_IDS[(t.color || 1) - 1];
    return out;
  }

  /** Bounding box + centre of a drawn (or queued) item, board px. */
  item(id) {
    const it = this.items.get(id);
    if (!it) return null;
    const b = it.bbox;
    return { id, x0: b[0], y0: b[1], x1: b[2], y1: b[3], cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, u: (b[0] + b[2]) / 2 / this.w, v: (b[1] + b[3]) / 2 / this.h, done: it.done };
  }

  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.25);
    this.time += dt;
    this._step(dt);
    this._stepParts(dt);
    this._stepFx(dt);
    if (this.dirty || this.parts.length || this.fx.length || this.tip.down || this.eraser) { this._paint(); this.dirty = false; }
  }

  // ---------------------------------------------------------------- compile
  _compile(it) {
    const strokes = [];
    const col = cIdx(it.color || 'white');
    const S = Math.max(1, Math.round(it.scale || 1));
    const seed = this.seed * 97 + this.serial * 13 + 1;
    const push = (kind, pts, c = col, o = {}) => { if (pts.length) strokes.push({ kind, pts, c, s: o.s || 1, a: o.a ?? (kind === 'fill' ? 0.6 : 1), dust: o.dust ?? (kind !== 'fill'), r: o.r || 1 }); };
    const ref = it.around ? this.items.get(it.around) : null;
    const rb = ref ? ref.bbox : null;
    const A = it.args || [];
    switch (it.type) {
      case 'text': {
        const { F: font, S: TS } = fontAt(it.font, S);
        const str = String(it.text);
        const m = goofyMeasure(font, str, TS);
        const align = it.align || 'center';
        let x = Math.round(align === 'left' ? it.x : align === 'right' ? it.x - m.w : it.x - m.w / 2);
        const y0 = Math.round(it.y - m.h / 2);
        // the full-size font already bounces; it has ~4x the pixels, so it is written faster
        const hi = font === FONTS.hi;
        let gi = 0;
        for (const ch of str) {
          const g = glyphOf(font, ch);
          const gw = g[0].length;
          const bob = hi || it.wobble === false || TS < 2 ? 0 : Math.round((hash(gi, seed, 17) - 0.5) * 1.3);
          const px = [];
          g.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '#') px.push([u, v]); });
          for (const st of traceStrokes(px)) push('text', st.map(([u, v]) => [x + u * TS, y0 + v * TS + bob]), col, { s: TS, r: hi ? 3.5 : 1 });
          x += (gw + font.sp) * TS;
          gi++;
        }
        break;
      }
      case 'doodle': {
        const art = doodleArt(it.name);
        const H = art.length, W = Math.max(...art.map((r) => r.length));
        const ox = Math.round(it.x - (W * S) / 2), oy = Math.round(it.y - (H * S) / 2);
        const tintMain = DOODLE_MAIN[it.name];
        const tint = it.tint ? cIdx(it.tint) : 0;
        const groups = new Map();
        art.forEach((row, v) => {
          for (let u = 0; u < row.length; u++) {
            let ch = row[u];
            if (ch === '.' || ch === ' ') continue;
            const uu = it.flip ? W - 1 - u : u;
            if (!groups.has(ch)) groups.set(ch, []);
            groups.get(ch).push([uu, v]);
          }
        });
        const P = (pts) => pts.map(([u, v]) => [ox + u * S, oy + v * S]);
        const colorOf = (ch) => {
          const up = ch.toUpperCase();
          if (tint && tintMain && up === tintMain.toUpperCase()) return tint;
          if (tint && DOODLE_TINT_OUTLINE[it.name] === ch) return tint;
          if (it.color && up === 'W') return col;
          return cIdx(LETTER_COLOR[up] || 'white');
        };
        // 1) outlines, 2) fills, 3) dark cuts, 4) white accents
        for (const [ch, px] of groups) if (ch >= 'A' && ch <= 'Z' && ch !== 'K') for (const st of traceStrokes(px)) push('line', P(st), colorOf(ch), { s: S });
        for (const [ch, px] of groups) if (ch >= 'a' && ch <= 'z') push('fill', P(hatchOrder(px)), colorOf(ch), { s: S, a: it.fillAlpha ?? 0.62 });
        if (groups.has('K')) push('cut', P(groups.get('K')), 0, { s: S });
        if (groups.has('*')) push('accent', P(groups.get('*')), cIdx('white'), { s: S });
        break;
      }
      case 'line': case 'arrow': {
        const [x1, y1, x2, y2] = A.length ? A : [it.x1, it.y1, it.x2, it.y2];
        push('line', linePts(x1, y1, x2, y2, it.wobble ?? 0.6, seed), col, { s: it.width || 1 });
        if (it.type === 'arrow') {
          const a = Math.atan2(y2 - y1, x2 - x1), L = it.head || 4;
          for (const da of [2.55, -2.55]) push('line', linePts(x2, y2, x2 + Math.cos(a + da) * L, y2 + Math.sin(a + da) * L, 0, seed + 3), col, { s: it.width || 1 });
        }
        break;
      }
      case 'circle': {
        let cx, cy, rx, ry;
        if (rb) { const pad = it.pad ?? 3; cx = (rb[0] + rb[2]) / 2; cy = (rb[1] + rb[3]) / 2; rx = (rb[2] - rb[0]) / 2 + pad + 1; ry = (rb[3] - rb[1]) / 2 + pad; }
        else { [cx, cy, rx, ry] = A.length ? A : [it.x, it.y, it.r, it.r]; ry ??= rx; }
        push('line', ellipsePts(cx, cy, rx, ry, seed), rb ? cIdx(it.color || 'yellow') : col, { s: it.width || 1 });
        break;
      }
      case 'box': {
        let x, y, w, h;
        if (rb) { const pad = it.pad ?? 2; x = rb[0] - pad; y = rb[1] - pad; w = rb[2] - rb[0] + pad * 2; h = rb[3] - rb[1] + pad * 2; }
        else [x, y, w, h] = A.length ? A : [it.x - it.w / 2, it.y - it.h / 2, it.w, it.h];
        const o = 1;
        push('line', polyPts([[x - o, y], [x + w + o, y + 0.4], [x + w, y + h + o], [x - 0.4, y + h], [x, y - o]], false, 0.35, seed), rb ? cIdx(it.color || 'yellow') : col, { s: it.width || 1 });
        break;
      }
      case 'underline': {
        let x1, x2, y;
        if (rb) { x1 = rb[0] - 1; x2 = rb[2] + 1; y = rb[3] + 2 + (it.gap || 0); }
        else [x1, y, x2] = A.length ? A : [it.x1, it.y, it.x2];
        const pts = [];
        const n = Math.max(2, Math.round(x2 - x1));
        let last = '';
        for (let i = 0; i <= n; i++) {
          const x = Math.round(lerp(x1, x2, i / n));
          const yy = Math.round(y + (it.wavy ? Math.sin(i * 0.9) * 0.9 : Math.sin(i * 0.31 + seed) * 0.45));
          const k = x + ',' + yy;
          if (k !== last) { pts.push([x, yy]); last = k; }
        }
        push('line', pts, rb ? cIdx(it.color || 'yellow') : col, { s: it.width || 1 });
        break;
      }
      case 'check': case 'cross': {
        const [x, y, sz = 5] = A.length ? A : [it.x, it.y, it.size];
        const c = it.color ? col : cIdx(it.type === 'check' ? 'green' : 'red');
        if (it.type === 'check') push('line', polyPts([[x - sz, y], [x - sz * 0.35, y + sz * 0.7], [x + sz, y - sz]], false, 0.25, seed), c, { s: it.width || 1 });
        else {
          push('line', linePts(x - sz, y - sz, x + sz, y + sz, 0.3, seed), c, { s: it.width || 1 });
          push('line', linePts(x + sz, y - sz, x - sz, y + sz, 0.3, seed + 5), c, { s: it.width || 1 });
        }
        break;
      }
      case 'star': {
        const [cx, cy, r = 6] = A.length ? A : [it.x, it.y, it.r];
        const verts = [];
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; verts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
        const c = it.color ? col : cIdx('yellow');
        push('line', polyPts(verts, true, 0.2, seed), c, { s: it.width || 1 });
        if (it.fill !== false) push('fill', hatchOrder(fillPoly((x, y) => inPoly(verts, x, y), cx - r, cy - r, cx + r, cy + r)), c);
        break;
      }
      case 'heart': {
        const [cx, cy, r = 6] = A.length ? A : [it.x, it.y, it.r];
        const verts = [];
        for (let i = 0; i < 40; i++) {
          const t = (i / 40) * Math.PI * 2;
          const hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          verts.push([cx + hx / 16 * r, cy + hy / 16 * r]);
        }
        const c = it.color ? col : cIdx('pink');
        push('line', polyPts(verts, true, 0, seed), c, { s: it.width || 1 });
        if (it.fill !== false) push('fill', hatchOrder(fillPoly((x, y) => inPoly(verts, x, y), cx - r, cy - r, cx + r, cy + r)), c);
        break;
      }
      case 'meter': {
        const [x, y, w, h] = A.length ? A : [it.x, it.y, it.w, it.h];
        const v = clamp(it.value ?? 1, 0, 1);
        push('line', polyPts([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y - 0.5]], false, 0.2, seed), cIdx('white'));
        const fw = Math.round((w - 3) * v);
        if (fw > 0) push('fill', hatchOrder(fillPoly(() => true, x + 2, y + 2, x + 1 + fw, y + h - 2)), col, { a: 0.85 });
        break;
      }
      case 'dots': {
        const [x1, y, x2, n = 3] = A.length ? A : [it.x1, it.y, it.x2, it.n];
        for (let i = 0; i < n; i++) push('accent', [[Math.round(lerp(x1, x2, n > 1 ? i / (n - 1) : 0.5)), Math.round(y)]], col);
        break;
      }
      default: break;
    }
    // bounding box over all strokes
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of strokes) for (const [x, y] of st.pts) {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x + st.s - 1 > x1) x1 = x + st.s - 1; if (y + st.s - 1 > y1) y1 = y + st.s - 1;
    }
    if (!strokes.length) { x0 = x1 = it.x || 0; y0 = y1 = it.y || 0; }
    const item = { id: it.id || '_' + this.serial, serial: this.serial++, strokes, bbox: [x0, y0, x1, y1], done: false, alpha: it.alpha ?? 1, delay: it.delay || 0, speed: it.speed || 1, pixels: [] };
    this.items.set(item.id, item);
    return item;
  }

  // ---------------------------------------------------------------- simulation
  _step(dt) {
    let guard = 0;
    while (this.queue.length && dt > 0 && guard++ < 64) {
      const j = this.queue[0];
      if (j.kind === 'draw') dt = this._stepDraw(j, dt);
      else if (j.kind === 'erase') dt = this._stepErase(j, dt);
      else if (j.kind === 'clear') { this.clear(); this._done(j); }
    }
    if (!this.queue.length) { this.hurryK = 1; this.tip.down = false; }
  }

  _done(job) {
    this.queue.shift();
    this.tip.down = false;
    this.dirty = true;
    job.resolve?.();
  }

  // advance one draw job by dt seconds; returns unused time
  _stepDraw(j, dt) {
    let t = dt * this.hurryK;
    const tip = this.tip;
    while (t > 0) {
      const item = j.items[j.i];
      if (!item) { this._done(j); return t / this.hurryK; }
      if (j.pause > 0) {
        const u = Math.min(t, j.pause);
        j.pause -= u; t -= u;
        if (j.travel) {
          const tr = j.travel, k = 1 - j.pause / tr.dur;
          const e = k * k * (3 - 2 * k);
          tip.x = lerp(tr.x0, tr.x1, e); tip.y = lerp(tr.y0, tr.y1, e) - Math.sin(k * Math.PI) * Math.min(3, tr.d * 0.15);
          tip.down = false;
        }
        continue;
      }
      j.travel = null;
      const st = item.strokes[j.s];
      if (!st) { // item finished
        item.done = true;
        j.i++; j.s = 0; j.p = 0; j.acc = 0;
        const nx = j.items[j.i];
        if (nx) this._travelTo(j, nx.strokes[0]?.pts[0], 0.1 + (nx.delay || 0));
        continue;
      }
      if (!j.started) { j.started = true; this._sound('chalk_down', { volume: 0.5 }); }
      tip.down = true; tip.tool = 'chalk'; tip.color = st.c || 1;
      const rate = RATE[st.kind] * (st.r || 1) * j.speed * item.speed;
      const need = (st.pts.length - j.p - j.acc) / rate;
      let n;
      if (t >= need) { n = st.pts.length - j.p; t -= need; j.acc = 0; }
      else { j.acc += t * rate; n = Math.floor(j.acc); j.acc -= n; t = 0; }
      for (let k = 0; k < n; k++) this._stamp(st.pts[j.p + k], st, item);
      j.p += n;
      if (j.p > 0) {
        const p = st.pts[Math.min(j.p, st.pts.length) - 1];
        tip.x = p[0] + st.s / 2; tip.y = p[1] + st.s / 2;
      }
      if (n > 0) {
        this._sndT -= n / rate;
        if (this._sndT <= 0 && st.kind !== 'cut') { this._sndT = 0.11; this._sound('chalk', { volume: st.kind === 'fill' ? 0.25 : 0.42, pitch: 0.9 + this.rand() * 0.3 }); }
      }
      if (j.p >= st.pts.length) {
        j.s++; j.p = 0; j.acc = 0; j.started = false;
        const ns = item.strokes[j.s];
        if (ns) this._travelTo(j, ns.pts[0], 0.02);
      }
    }
    return 0;
  }

  _travelTo(j, pt, extra = 0) {
    const tip = this.tip;
    if (!pt) { j.pause = extra; return; }
    const d = Math.hypot(pt[0] - tip.x, pt[1] - tip.y);
    if (d < 2.5 && extra < 0.05) { j.pause = 0; return; }
    const dur = (extra + Math.min(0.32, 0.03 + d / 520)) / j.speed;
    j.pause = dur;
    j.travel = { x0: tip.x, y0: tip.y, x1: pt[0], y1: pt[1], dur, d };
  }

  _stamp(pt, st, item) {
    const { w, h } = this;
    const s = st.s;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const x = pt[0] + dx, y = pt[1] + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (st.kind === 'cut') { this.inkA[i] *= 0.08; this.owner[i] = item.serial; continue; }
      const g = this.grain[i];
      // chalk skips on the grain of the slate: fills are hatched in diagonal
      // lines, outlines get the odd gap, small text stays crisp
      let a = st.a * item.alpha;
      if (st.kind === 'fill') {
        const onLine = ((x - y) % 3 + 3) % 3 === 0;
        if (g < (onLine ? 0.1 : 0.4)) continue;
        a *= onLine ? 1.3 : 0.5;
      } else if (g < (st.kind === 'text' ? (s > 1 ? 0.07 : 0) : s > 1 ? 0.1 : 0.04)) continue;
      a = Math.min(1, a * (0.8 + 0.3 * g));
      if (a >= this.inkA[i] * 0.8 || this.inkC[i] === 0) this.inkC[i] = st.c;
      this.inkA[i] = Math.max(this.inkA[i], a);
      this.inkT[i] = 0.9 + 0.18 * hash(x, y, item.serial + 3);
      this.owner[i] = item.serial;
      item.pixels.push(i);
    }
    // faint dust halo + a speck now and then
    if (st.dust !== false && this.rand() < 0.28) {
      const x = pt[0] + Math.floor(this.rand() * (s + 2)) - 1, y = pt[1] + Math.floor(this.rand() * (s + 2)) - 1;
      if (x >= 0 && y >= 0 && x < w && y < h) {
        const i = y * w + x;
        if (this.inkA[i] < 0.12) { this.inkC[i] = st.c; this.inkA[i] = 0.08 + this.rand() * 0.08; this.inkT[i] = 1; }
      }
    }
    if (this.rand() < (st.kind === 'fill' ? 0.06 : 0.22)) this._spawnDust(pt[0] + s / 2, pt[1] + s / 2, st.c, 1);
    this.dirty = true;
  }

  _spawnDust(x, y, c, n = 1, big = false) {
    for (let k = 0; k < n; k++) {
      if (this.parts.length > 260) this.parts.shift();
      const a = this.rand() * Math.PI * 2, sp = (big ? 14 : 6) + this.rand() * (big ? 22 : 10);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - (big ? 6 : 3), life: 0, max: (big ? 0.7 : 0.45) + this.rand() * 0.6, c: c || 1, big: big && this.rand() < 0.5 });
    }
  }

  _stepParts(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt;
      if (p.life >= p.max) { P.splice(i, 1); continue; }
      p.vx *= Math.exp(-dt * 3.2); p.vy = p.vy * Math.exp(-dt * 2.2) + 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  _stepFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.dur) { this.fx.splice(i, 1); f.resolve?.(); this.dirty = true; }
      else if (this.rand() < dt * 9) {
        const b = f.item.bbox;
        this._spawnDust(lerp(b[0] - 3, b[2] + 3, this.rand()), lerp(b[1] - 3, b[3] + 3, this.rand()), f.color, 1);
      }
    }
  }

  // ---------------------------------------------------------------- eraser
  _erasePath() {
    // zig-zag bands only over the inked area (felt eraser held sideways)
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let i = 0; i < this.inkA.length; i++) if (this.inkA[i] > 0.15) {
      const x = i % this.w, y = (i / this.w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return [];
    const EH = 16;
    const pts = [];
    const bands = Math.max(1, Math.ceil((y1 - y0 + 1) / (EH - 3)));
    for (let b = 0; b < bands; b++) {
      const y = Math.min(y1 - EH / 2 + 3, y0 + EH / 2 - 2 + b * (EH - 3));
      const ltr = b % 2 === 0;
      pts.push([ltr ? x0 - 4 : x1 + 4, y + (ltr ? -2 : 2)], [ltr ? x1 + 4 : x0 - 4, y + (ltr ? 2 : -2)]);
    }
    return pts;
  }

  _stepErase(j, dt) {
    if (!j.path) {
      j.path = this._erasePath();
      j.seg = 0; j.t = 0;
      if (j.path.length < 2) { this.eraser = null; this._done(j); return dt; }
      this._sound('erase', { volume: 0.5 });
    }
    let t = dt * this.hurryK;
    const speed = 300 * j.speed;
    while (t > 0) {
      const a = j.path[j.seg], b = j.path[j.seg + 1];
      if (!b) {
        this.eraser = null;
        this.tip.down = false;
        this._done(j);
        return t / this.hurryK;
      }
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dur = L / speed;
      const u = Math.min(t, dur - j.t);
      const k0 = j.t / dur;
      j.t += u; t -= u;
      const k1 = j.t / dur;
      // wipe along the swept segment
      const steps = Math.max(1, Math.ceil((k1 - k0) * L / 2));
      for (let s = 1; s <= steps; s++) {
        const k = lerp(k0, k1, s / steps);
        this._wipeAt(lerp(a[0], b[0], k), lerp(a[1], b[1], k), b[0] > a[0] ? 1 : -1);
      }
      const k = j.t / dur;
      const ex = lerp(a[0], b[0], k), ey = lerp(a[1], b[1], k);
      this.eraser = { x: ex, y: ey };
      this.tip.x = ex; this.tip.y = ey; this.tip.down = true; this.tip.tool = 'eraser';
      this._sndT -= u;
      if (this._sndT <= 0) { this._sndT = 0.22; this._sound('erase', { volume: 0.32, pitch: 0.9 + this.rand() * 0.25 }); }
      if (j.t >= dur - 1e-6) { j.seg++; j.t = 0; }
    }
    return 0;
  }

  _wipeAt(cx, cy, dir) {
    const EW = 9, EH = 16;
    const x0 = Math.round(cx - EW / 2), y0 = Math.round(cy - EH / 2);
    for (let y = y0; y < y0 + EH; y++) for (let x = x0; x < x0 + EW; x++) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
      const i = y * this.w + x;
      const a = this.inkA[i];
      if (a <= 0.004) continue;
      // smear a little ink along the swipe, the rest turns to dust
      const nx = x - dir * 2;
      if (a > 0.3 && nx >= 0 && nx < this.w && this.rand() < 0.05) {
        const ni = y * this.w + nx;
        if (this.inkA[ni] < 0.1) { this.inkA[ni] = 0.1; this.inkC[ni] = this.inkC[i]; }
      }
      if (a > 0.25 && this.rand() < 0.02) this._spawnDust(x, y, this.inkC[i], 1, true);
      this.inkA[i] = a > 0.12 ? a * 0.1 : a * 0.6;
      this.owner[i] = -1;
    }
    this.dirty = true;
  }

  _eraseAll(keep = 0.1) {
    for (let i = 0; i < this.inkA.length; i++) this.inkA[i] = this.inkA[i] > 0.12 ? this.inkA[i] * keep : this.inkA[i] * 0.6;
    this.owner.fill(-1);
    this.items.clear();
    this.eraser = null;
  }

  _sound(name, o) { try { this.onSound?.(name, o); } catch { /* ignore */ } }

  // ---------------------------------------------------------------- painting
  _paintSlate(surface) {
    const { w, h } = this;
    const d = new Uint8ClampedArray(w * h * 4);
    if (surface === 'clear') return d;
    const R = rng(this.seed + 3);
    // soft blotches (low-freq value noise) + dither + a vignette near the frame
    const cell = 18, gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const grid = Array.from({ length: gw * gh }, () => R());
    const vn = (x, y) => {
      const fx = x / cell, fy = y / cell, xi = Math.floor(fx), yi = Math.floor(fy);
      const tx = fx - xi, ty = fy - yi, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (i, j) => grid[(j % gh) * gw + (i % gw)];
      return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
    };
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    // horizontal eraser streak bands
    const streaks = Array.from({ length: 6 }, () => ({ y: R() * h, hh: 3 + R() * 6, k: 0.25 + R() * 0.35 }));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 2.6 + (vn(x, y) - 0.5) * 1.6 + (vn(x * 2.3 + 40, y * 2.3) - 0.5) * 0.7;
      for (const s of streaks) { const dd = Math.abs(y - s.y); if (dd < s.hh) v += s.k * (1 - dd / s.hh) * (0.6 + 0.4 * Math.sin(x * 0.05 + s.y)); }
      const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y);
      const edge = Math.min(ex, ey * 1.4);
      if (edge < 6) v -= (6 - edge) * 0.22;
      v += (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9;
      const k = clamp(Math.floor(v), 0, SLATE.length - 1);
      const c = SLATE[k];
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      if (hash(x, y, this.seed + 77) < 0.004) { d[i] += 18; d[i + 1] += 20; d[i + 2] += 16; } // specks
    }
    return d;
  }

  // faint remains of earlier lessons
  _ghosts() {
    const R = rng(this.seed + 9);
    const ghosts = [
      { text: '2+2=4', x: 30 + R() * 30, y: 20 + R() * 20, font: 'big' },
      { text: 'A B C', x: 120 + R() * 40, y: 80 + R() * 15, font: 'big' },
      { doodle: 'sun', x: 160 + R() * 20, y: 22 + R() * 10 },
      { circle: [70 + R() * 50, 70 + R() * 20, 14, 9] },
      { text: 'HOMEWORK', x: 60 + R() * 40, y: 95, font: 'small' },
    ];
    for (const g of ghosts) {
      const it = this._compile(normalize({ ...g, color: R() < 0.3 ? 'yellow' : 'white' }));
      for (const st of it.strokes) for (const p of st.pts) {
        for (let dy = 0; dy < st.s; dy++) for (let dx = 0; dx < st.s; dx++) {
          const x = p[0] + dx + Math.round((R() - 0.5) * 1.4), y = p[1] + dy;
          if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
          const i = y * this.w + x;
          this.inkC[i] = st.c || 1; this.inkA[i] = Math.max(this.inkA[i], 0.05 + R() * 0.06); this.inkT[i] = 1;
        }
      }
      this.items.delete(it.id);
    }
  }

  _paint() {
    const { w, h } = this;
    const d = this.img.data, B = this.base;
    // highlight pulses: brighten their pixels
    let boost = null;
    if (this.fx.length) {
      boost = new Map();
      for (const f of this.fx) {
        const k = 0.5 - 0.5 * Math.cos((f.t / 0.42) * Math.PI * 2);
        const env = Math.min(1, f.t * 6, (f.dur - f.t) * 4);
        const amt = k * env;
        for (const i of f.item.pixels) if (this.owner[i] === f.item.serial) boost.set(i, Math.max(boost.get(i) || 0, amt));
      }
    }
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      let a = this.inkA[i];
      if (a <= 0.003 || !this.inkC[i]) { d[p] = B[p]; d[p + 1] = B[p + 1]; d[p + 2] = B[p + 2]; d[p + 3] = 255; continue; }
      const c = COLOR_RGB[this.inkC[i]] || COLOR_RGB[1];
      let tn = this.inkT[i] || 1;
      if (boost) { const b = boost.get(i); if (b) { a = Math.min(1, a + b * 0.6); tn += b * 0.25; } }
      const r = Math.min(255, c[0] * tn), g = Math.min(255, c[1] * tn), bl = Math.min(255, c[2] * tn);
      d[p] = B[p] + (r - B[p]) * a; d[p + 1] = B[p + 1] + (g - B[p + 1]) * a; d[p + 2] = B[p + 2] + (bl - B[p + 2]) * a; d[p + 3] = 255;
    }
    // dust specks
    for (const pt of this.parts) {
      const k = 1 - pt.life / pt.max;
      const c = COLOR_RGB[pt.c] || COLOR_RGB[1];
      const put = (x, y, a) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const q = (y * w + x) * 4;
        d[q] += (c[0] - d[q]) * a; d[q + 1] += (c[1] - d[q + 1]) * a; d[q + 2] += (c[2] - d[q + 2]) * a;
      };
      put(pt.x, pt.y, 0.75 * k);
      if (pt.big) { put(pt.x + 1, pt.y, 0.4 * k); put(pt.x, pt.y + 1, 0.35 * k); }
    }
    // eraser block: felt + wooden back
    if (this.eraser && this.showEraser) {
      const ex = Math.round(this.eraser.x - 5), ey = Math.round(this.eraser.y - 9);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 11; x++) {
        const X = ex + x, Y = ey + y;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        if ((x === 0 || x === 10) && (y === 0 || y === 17)) continue;
        const q = (Y * w + X) * 4;
        let c;
        if (x === 0 || x === 10 || y === 0 || y === 17) c = [58, 34, 22];
        else if (x <= 3) c = x === 1 ? [216, 212, 200] : [196, 190, 178];
        else c = (y + x) % 5 === 0 ? [122, 74, 42] : x === 4 ? [92, 56, 32] : [150, 92, 52];
        d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2];
      }
    }
    // chalk tip: a bright pinpoint while touching
    if (this.tip.down && this.tip.tool === 'chalk') {
      const x = Math.round(this.tip.x - 0.5), y = Math.round(this.tip.y - 0.5);
      if (x >= 0 && y >= 0 && x < w && y < h) {
        const q = (y * w + x) * 4;
        d[q] = 255; d[q + 1] = 255; d[q + 2] = 250;
      }
    }
    this.ctx?.putImageData(this.img, 0, 0);
    this.version++;
  }
}

function inPoly(v, x, y) {
  let ins = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const xi = v[i][0], yi = v[i][1], xj = v[j][0], yj = v[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** A standalone slate texture (data URL), e.g. for CSS backgrounds. */
const slateCache = new Map();
export function slateURL(w = 96, h = 48, seed = 3) {
  const key = w + 'x' + h + ':' + seed;
  if (slateCache.has(key)) return slateCache.get(key);
  const b = new Chalkboard({ w, h, seed, ghosts: false });
  const url = b.canvas.toDataURL();
  slateCache.set(key, url);
  return url;
}
