// Pixel-art UI sprites for "The Bear Must Eat".
//
// Every sprite is plain data: an array of equal-length strings (one char per
// pixel) plus a palette map char -> '#rrggbb'. '.' is transparent.
//
// Most sprites are authored "fill only" and get a 1px outline (k) added
// automatically around their silhouette (4-neighbourhood), so every icon has
// the same crisp outline. Explicit 'k' pixels can still be drawn for inner
// lines; a 1px transparent gap inside a shape also turns into an outline line.
//
// Nothing here touches the DOM until a render function is first called.

// ---------------------------------------------------------------------------
// Shared palette (sprites may override single chars)
// ---------------------------------------------------------------------------
const PAL = {
  k: '#1a1420', // outline (near-black plum)
  K: '#3a3046', // soft black (black fur tips, hat shading)
  1: '#29253a', // ink
  2: '#45425a', // charcoal
  3: '#666884', // slate
  4: '#8f93ad', // grey
  5: '#bcc0d2', // silver
  6: '#e4e6ef', // pale
  w: '#ffffff', // white
  c: '#f8ecd2', // cream
  C: '#dcc39c', // cream shade
  r: '#dc4136', // red
  R: '#982a34', // dark red
  p: '#ff8d72', // salmon highlight
  o: '#e0662a', // fox orange
  O: '#b84a1e', // fox orange shade
  q: '#f28a3c', // orange light
  Q: '#ffbe78', // peach
  y: '#ffd23f', // gold
  Y: '#fff3a3', // pale gold
  a: '#e59a1f', // amber
  A: '#a5631b', // bronze
  g: '#3e9446', // green
  G: '#245a38', // dark green
  f: '#94d15a', // light green
  F: '#173c2c', // pine shadow
  b: '#3c88d8', // blue
  B: '#28519c', // dark blue
  l: '#88d3f6', // light blue
  L: '#d5f4ff', // ice
  t: '#30ad9c', // teal
  T: '#1c6a72', // dark teal
  u: '#84e6d0', // aqua
  n: '#2f4079', // navy
  N: '#1f2851', // dark navy
  j: '#4e68ae', // navy light
  m: '#9c6639', // brown
  M: '#663f26', // dark brown
  h: '#c99259', // light brown
  H: '#ecc68d', // tan
  v: '#7359cc', // violet
  V: '#45358b', // dark violet
  s: '#aa9cf2', // lilac
  i: '#f6a3b6', // pink
  I: '#c45c80', // dark pink
  x: '#5c3a82', // plum
  X: '#3b2557', // dark plum
  z: '#8763b3', // light plum
};

const DEFS = {};
// def(name, rows, { pal: {overrides}, ol: 4 | 0 })
function def(name, rows, opt = {}) {
  DEFS[name] = { rows, pal: opt.pal || null, ol: opt.ol === undefined ? 4 : opt.ol };
}

// Overlay patches onto rows. A patch is [x, y, rows]; in patch rows '.' keeps
// the underlying pixel and '_' erases it.
function patch(rows, patches) {
  const g = rows.map((r) => r.split(''));
  for (const [px, py, pr] of patches) {
    pr.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        const x = px + i, y = py + j;
        if (ch === '.' || y < 0 || y >= g.length || x < 0 || x >= g[0].length) continue;
        g[y][x] = ch === '_' ? '.' : ch;
      }
    });
  }
  return g.map((r) => r.join(''));
}

// Replace chars (e.g. recolour a shared template).
function recolor(rows, map) {
  return rows.map((r) => r.replace(/./g, (ch) => (ch in map ? map[ch] : ch)));
}

// Mirror horizontally.
function flipX(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}

// ===========================================================================
// ICONS
// ===========================================================================

// --- money & ratings -------------------------------------------------------
def('coin', [
  '............',
  '....YYyy....',
  '..YYyyyyya..',
  '..Yyyaayya..',
  '.Yyyyaayyya.',
  '.Yyyyaayyya.',
  '.yyyyaayyaa.',
  '.yyyyaayyaA.',
  '..yyyaayaA..',
  '..ayyyyaAA..',
  '....aAAA....',
  '............',
]);

def('coins', [
  '................',
  '................',
  '....YYYYY.......',
  '..yYYYYYYYa.....',
  '..Yyyyyyyya.....',
  '..aaaaaaaaA.....',
  '..Yyyyyyyya.....',
  '..aaaaaaaak.....',
  '..YyyyyyykYYy...',
  '..aaaaaakYYyya..',
  '..YyyyykYyyayya.',
  '..aaaaakyyyayaa.',
  '..YyyyykyyyayaA.',
  '...aaaaakaaaAA..',
  '..........AAA...',
  '................',
]);

const STAR = [
  '............',
  '.....Yy.....',
  '.....Yy.....',
  '....YYya....',
  '.YYYYYyyyya.',
  '..yYYyyyya..',
  '...yYyyya...',
  '...yyyyaa...',
  '..yya..yaa..',
  '..ya....aA..',
  '.aa......AA.',
  '............',
];
def('star', STAR);
def('star_empty', recolor(STAR, { Y: '3', y: '2', a: '2', A: '1' }));
def('star_half', STAR.map((r) => r.slice(0, 6) + recolor([r.slice(6)], { Y: '3', y: '2', a: '2', A: '1' })[0]));

const HEART = [
  '............',
  '............',
  '..ppr..rrr..',
  '.pwprrrrrrR.',
  '.prrrrrrrrR.',
  '.rrrrrrrrRR.',
  '..rrrrrrRR..',
  '...rrrrRR...',
  '....rrRR....',
  '.....RR.....',
  '............',
  '............',
];
def('heart', HEART);
def('heart_broken', patch(HEART, [[4, 2, [
  '_..',
  '.k.',
  'k..',
  '.k.',
  'k..',
  '.k.',
  'k..',
]]]));

// --- pond life & resources --------------------------------------------------
const FISH = [
  '................',
  '................',
  '................',
  '........lll.....',
  '......BBBBBBB...',
  '.B...Bbbbbbbbb..',
  '.Bb.Bbbbbbbwkbb.',
  '..bbbbbbbbBbbbb.',
  '..bbllllllBlllk.',
  '.Bb.lLLLLLlLLll.',
  '.B...lLLLLLLll..',
  '......lllllll...',
  '.......ll.......',
  '................',
  '................',
  '................',
];
def('fish', FISH);
def('fish_gold', patch(recolor(FISH, { B: 'A', b: 'a', l: 'y', L: 'Y' }), [
  [6, 5, ['.YY']], [12, 0, ['.Y.', 'YwY', '.Y.']], [2, 11, ['w']],
]));

def('egg', [
  '............',
  '.......Qqq..',
  '......kQqqo.',
  '...QQqqkqqo.',
  '..QwQqqqkoo.',
  '.QQqqqqqok..',
  '.Qqqqqqqo...',
  '.qqqOkqoo...',
  '.qqqOOqoo...',
  '..oqqqoO....',
  '...oOOO.....',
  '............',
]);

def('honey', [
  '................',
  '................',
  '.....hhhhhh.....',
  '....mmmmmmmm....',
  '....MyMMMMMM....',
  '...aYyyyyyyya...',
  '..aYyyyyyyyyyA..',
  '..aYcccccccCyA..',
  '..aYcccaacccyA..',
  '..aYccaccaccyA..',
  '..aYcccaacccyA..',
  '..aYcccccccCyA..',
  '..aYyyyyyyyyyA..',
  '..aayyyyyyyyAA..',
  '...AAAAAAAAAA...',
  '................',
]);

def('syrup', [
  '................',
  '.....pprR.......',
  '.....RRRR.......',
  '.....yaaA.aaA...',
  '....yaaaaAa.A...',
  '...yaaaaaaaaA...',
  '..yaaaaaaaaaAA..',
  '..yccccrcccCAA..',
  '..yccrcrcrcCAA..',
  '..yccrrrrrcCAA..',
  '..ycccrrrccCAA..',
  '..yccccrcccCAA..',
  '..yaaaaaaaaaAA..',
  '..aaaaaaaaaAAA..',
  '...AAAAAAAAAA...',
  '................',
]);

def('berry', [
  '............',
  '..fg..ssvv..',
  '.fgGGsvvvvV.',
  '..gG.kvvvvV.',
  '...ssskvvVV.',
  '..swVvvkVVV.',
  '.svvvvvVkV..',
  '.vvvvvVV....',
  '.vvvvVVV....',
  '..vvVVV.....',
  '...VVV......',
  '............',
], { pal: { v: '#4f60d2', V: '#2c3078', s: '#9cacf6' } });

def('seaweed', [
  '................',
  '........f.......',
  '.......fg.......',
  '.......fg.......',
  '...fg...fg......',
  '..fg.....fg.f...',
  '..fg.....fg.fg..',
  '...fg...fg.fg...',
  '....fg.fg..fg...',
  '....fg.fg...fg..',
  '...fg...fg..fg..',
  '...fg....fgfg...',
  '....fg..fgfg....',
  '.....gG.gGgG....',
  '.....GG.GGGG....',
  '................',
]);

def('bug', [
  '................',
  '......uuuu......',
  '......uttu......',
  '.llllllTtllllll.',
  '..LLLLLtTLLLLL..',
  '.......tT.......',
  '..lllllTtlllll..',
  '...LLLLtTLLLL...',
  '.......bB.......',
  '.......tT.......',
  '.......bB.......',
  '.......tT.......',
  '.......bB.......',
  '.......tT.......',
  '.......TT.......',
  '................',
]);

def('flower', [
  '................',
  '......sss.......',
  '..ss..sss..ss...',
  '...ss.sss.ss....',
  '.sss.syyys.vvv..',
  '.sssssyyavvvvv..',
  '.sss.vyaav.vvv..',
  '...ss.vvv.vv....',
  '..ss..vvv..vv...',
  '......vvv.......',
  '.......g........',
  '.....ffg........',
  '.......gff......',
  '.......g........',
  '.......G........',
  '................',
]);

// --- time --------------------------------------------------------------------
def('clock', [
  '............',
  '....yyyy....',
  '..yyccccaa..',
  '..ywckccca..',
  '.ywcckcccca.',
  '.yccckkkcca.',
  '.ycccccccCa.',
  '.acccccccCA.',
  '..acccccCA..',
  '..aaCCCCAA..',
  '....AAAA....',
  '............',
]);

def('calendar', [
  '............',
  '...5....5...',
  '.rr5rrrr5rr.',
  '.prrrrrrrrR.',
  '.RRRRRRRRRR.',
  '.wwwwwwwww6.',
  '.w4w4w4w4w6.',
  '.wwwwwwwww6.',
  '.w4w4wrw4w6.',
  '.wwwwwwwww6.',
  '.6666666666.',
  '............',
]);

def('hourglass', [
  '............',
  '.hhhhhhhhhm.',
  '..LLLLLLlL..',
  '..LyyyyyyL..',
  '...LyyyyL...',
  '....LyaL....',
  '.....ya.....',
  '....LalL....',
  '...LLalLL...',
  '..LLyyyyLL..',
  '.hhhhhhhhhm.',
  '............',
]);

// --- tools -------------------------------------------------------------------
def('hammer', [
  '................',
  '................',
  '........55......',
  '.......5554.....',
  '........5544....',
  '.........5443...',
  '.........h4433..',
  '........hm.433..',
  '.......hm...3...',
  '......hm........',
  '.....hm.........',
  '....hm..........',
  '...hm...........',
  '..hm............',
  '.MM.............',
  '................',
]);

def('flask', [
  '................',
  '.......L..LL....',
  '................',
  '.....LLLLLL.....',
  '......LwLL......',
  '......LwLL......',
  '......LwLL......',
  '.....LwLLLL.....',
  '....LwLLLLlL....',
  '....ffffffff....',
  '...gfgggggggg...',
  '...gfgLgggggG...',
  '..ggggggggLgGG..',
  '..GGGGGGGGGGGG..',
  '................',
  '................',
]);

def('shovel', [
  '................',
  '...........hhhm.',
  '...........h..m.',
  '...........mhmM.',
  '...........hm...',
  '..........hm....',
  '.........hm.....',
  '........hm......',
  '....5..hm.......',
  '...5543m........',
  '..55543.........',
  '..655443........',
  '..554433........',
  '..54433.........',
  '..3.............',
  '................',
]);

def('trash', [
  '................',
  '......5555......',
  '..665555555554..',
  '..444444444443..',
  '................',
  '...5534434433...',
  '...5534434433...',
  '...5534434433...',
  '...5534434433...',
  '...5534434433...',
  '...5534434433...',
  '...5534434433...',
  '....53443443....',
  '....33333333....',
  '................',
  '................',
]);

def('hand', [
  '................',
  '.....ww6........',
  '.....ww6........',
  '.....ww6........',
  '.....ww6.w6.....',
  '.....ww6.w6.w6..',
  '.....ww6.w6.w6..',
  '.ww6.ww6.w6.w6..',
  '.wwwwwwwwwwwww..',
  '..wwwwwwwwwww6..',
  '..wwwwwwwwww66..',
  '...wwwwwwwww6...',
  '....66666666....',
  '....cccccccc....',
  '....CCCCCCCC....',
  '................',
]);

def('food', [
  '................',
  '....hHHHHHHh....',
  '....mmmmmmmm....',
  '...HHHHHHHHHh...',
  '...HHHHHHHHHh...',
  '...H6666666Hh...',
  '...HwwbbwbwHh...',
  '...HwbbbbbwHh...',
  '...HwwbbwbwHh...',
  '...H6666666Hh...',
  '...HHHHHHHHHh...',
  '...HHHHHHHHHh...',
  '...hHHHHHHHhh...',
  '...hhhhhhhhhh.m.',
  '.............mh.',
  '................',
]);

// --- critters ----------------------------------------------------------------
def('beaver', [
  '................',
  '................',
  '...MM......MM...',
  '..MhmmmmmmmmmM..',
  '..hmmmmmmmmmmm..',
  '.hmmkmmmmmmkmmM.',
  '.hmmmmmmmmmmmmM.',
  '.mmmmHHHHHHmmmM.',
  '.mmmHHH11HHHmmM.',
  '.mmmHHHHHHHHmmM.',
  '..mmHHHwwHHHmM..',
  '..mmmHHwwHHmmM..',
  '...mmmHwwHmmM...',
  '....MMMMMMMM....',
  '................',
  '................',
]);

const BEAR = [
  '................',
  '................',
  '...mm......mm...',
  '..mMMm....mMMm..',
  '..mMmmmmmmmmMm..',
  '.hmmmmmmmmmmmmm.',
  '.hmmmmmmmmmmmmM.',
  '.mmmmkmmmmkmmmM.',
  '.mmmmmHHHHmmmmM.',
  '.mmmmHH11HHmmmM.',
  '.mmmmHHMMHHmmmM.',
  '..mmmmHHHHmmmM..',
  '...MmmmmmmmmM...',
  '.....MMMMMM.....',
  '................',
  '................',
];
def('bear', BEAR);
def('bear_angry', patch(BEAR, [[4, 5, ['k......k']], [5, 6, ['kk..kk']], [5, 10, ['HkwwkH', '.kkkk.']], [12, 0, ['r.r', '.r.', 'r.r']]]));
def('bear_happy', patch(BEAR, [[4, 6, ['.k....k.', 'k.k..k.k']], [3, 9, ['p........p']], [6, 10, ['kIIk', 'kiik', '.kk.']]]));

// --- outfits -----------------------------------------------------------------
def('briefcase', [
  '................',
  '................',
  '......mmmm......',
  '.....m....m.....',
  '.....m....m.....',
  '.hhhhhhhhhhhhhm.',
  '.hmmmmmmmmmmmmM.',
  '.hmmmmmmmmmmmmM.',
  '.MMMyMMMMMMyMMM.',
  '.hmmyammmmyammM.',
  '.hmmmmmmmmmmmmM.',
  '.hmmmmmmmmmmmmM.',
  '.hmmmmmmmmmmmmM.',
  '.MMMMMMMMMMMMMM.',
  '................',
  '................',
]);

def('necktie', [
  '................',
  '................',
  '......prrR......',
  '......rrRR......',
  '.......rR.......',
  '......prrR......',
  '......pRRr......',
  '.....prrRRR.....',
  '.....prrrrR.....',
  '.....pRRrrR.....',
  '.....prRRrR.....',
  '.....prrRRR.....',
  '......prrR......',
  '.......rR.......',
  '................',
  '................',
]);

def('tophat', [
  '................',
  '................',
  '................',
  '....33222222....',
  '....32222221....',
  '....32222221....',
  '....32222221....',
  '....32222221....',
  '....yYyyyyya....',
  '.3..aaaaaaaA..1.',
  '.32222222222221.',
  '..111111111111..',
  '................',
  '................',
  '................',
  '................',
]);

// --- interface ---------------------------------------------------------------
def('gear', [
  '................',
  '......5544......',
  '..55..5544..43..',
  '..555555444443..',
  '...5555444443...',
  '...5554444433...',
  '.555554..444433.',
  '.55554....44433.',
  '.55554....44433.',
  '.555544..444333.',
  '...5444444433...',
  '..544444443333..',
  '..44..4433..33..',
  '......4333......',
  '................',
  '................',
]);

def('book', [
  '................',
  '.Tuuuuuuuuuut...',
  '.Tuttttttttttc..',
  '.Tuttttttttttc..',
  '.Tuttttttttttc..',
  '.Tuttttttttttc..',
  '.Tutytyyyttttc..',
  '.Tutyyyyyytttc..',
  '.Tutytyyyttttc..',
  '.Tuttttttttttc..',
  '.Tuttttttttttc..',
  '.Tuttttttttttc..',
  '.Tuttttttttttc..',
  '.TTTTTTTTTTTTc..',
  '..cccccccccccC..',
  '................',
]);

const SPEAKER = [
  '............',
  '............',
  '.....6..w...',
  '....66...w..',
  '.44566.w..w.',
  '.44565..w.w.',
  '.44565..w.w.',
  '.44566.w..w.',
  '....66...w..',
  '.....6..w...',
  '............',
  '............',
];
def('speaker_on', SPEAKER);
def('speaker_off', patch(SPEAKER, [[7, 2, ['_.__', '__._', 'r..r', '.rr.', '.rr.', 'r..r', '__._', '_.__']]]));

def('music', [
  '............',
  '.....wwwwww.',
  '.....wwwwww.',
  '.....w....w.',
  '.....w....w.',
  '.....w....w.',
  '...www..www.',
  '..wwww.wwww.',
  '..www6.www6.',
  '...66...66..',
  '............',
  '............',
]);

def('play', [
  '............',
  '............',
  '...ww.......',
  '...wwww.....',
  '...wwwwww...',
  '...wwwwwww..',
  '...wwwwww6..',
  '...wwww66...',
  '...w666.....',
  '...66.......',
  '............',
  '............',
]);

def('pause', [
  '............',
  '............',
  '...ww..ww...',
  '...ww..ww...',
  '...ww..ww...',
  '...ww..ww...',
  '...ww..ww...',
  '...ww..ww...',
  '...ww..ww...',
  '...66..66...',
  '............',
  '............',
]);

def('fast', [
  '............',
  '............',
  '..w....w....',
  '..ww...ww...',
  '..www..www..',
  '..wwww.wwww.',
  '..ww6..ww6..',
  '..w6...w6...',
  '..6....6....',
  '............',
  '............',
  '............',
]);

def('faster', [
  '............',
  '............',
  '............',
  '.w..w..w....',
  '.ww.ww.ww...',
  '.wwwwwwwww..',
  '.66.66.66...',
  '.6..6..6....',
  '............',
  '............',
  '............',
  '............',
]);

def('bell', [
  '............',
  '.....Yy.....',
  '....YYya....',
  '...yYyyya...',
  '...yYyyya...',
  '...yYyyaa...',
  '..yYyyyyaa..',
  '..yyyyyyaa..',
  '.aaaaaaaaaA.',
  '.....AA.....',
  '............',
  '............',
]);

def('lock', [
  '............',
  '....5554....',
  '...5....4...',
  '...5....3...',
  '..YyyyyyyA..',
  '..Yyyyyyya..',
  '..YyykkyyA..',
  '..YyykkyyA..',
  '..yyyyyyaA..',
  '..aaaaaaAA..',
  '............',
  '............',
]);

def('check', [
  '............',
  '............',
  '.........ff.',
  '........fff.',
  '.......fffg.',
  '.ff...fffg..',
  '.fff.fffg...',
  '..fffffg....',
  '...fffg.....',
  '....fg......',
  '............',
  '............',
]);

def('cross', [
  '............',
  '............',
  '..pr....pr..',
  '..prr..prr..',
  '...prrrrr...',
  '....rrrr....',
  '....rrrR....',
  '...rrrrRR...',
  '..rrR..rRR..',
  '..RR....RR..',
  '............',
  '............',
]);

const ARROW = [
  '............',
  '.....ff.....',
  '....fffg....',
  '...ffffgg...',
  '..fffffggg..',
  '....ffgg....',
  '....ffgg....',
  '....ffgg....',
  '....ffgg....',
  '....ggGG....',
  '............',
  '............',
];
def('arrow_up', ARROW);
def('arrow_down', recolor(ARROW.slice().reverse(), { f: 'p', g: 'r', G: 'R' }));

def('plus', [
  '............',
  '............',
  '.....fg.....',
  '.....fg.....',
  '.....fg.....',
  '..fffffffg..',
  '..gggggggG..',
  '.....gG.....',
  '.....gG.....',
  '.....gG.....',
  '............',
  '............',
]);

def('minus', [
  '............',
  '............',
  '............',
  '............',
  '............',
  '..pppppppr..',
  '..rrrrrrrR..',
  '............',
  '............',
  '............',
  '............',
  '............',
]);

def('sparkle', [
  '............',
  '.....y...Y..',
  '.....Y..YwY.',
  '.....Y...Y..',
  '....YwY.....',
  '.yYYwwwYYy..',
  '....YwY.....',
  '.....Y......',
  '.....Y......',
  '.....y......',
  '............',
  '............',
]);

def('bolt', [
  '............',
  '......YYyy..',
  '.....YYya...',
  '....YYya....',
  '...Yyyyyyya.',
  '......yya...',
  '.....yya....',
  '....yya.....',
  '...ya.......',
  '..a.........',
  '............',
  '............',
]);

// --- pond building -------------------------------------------------------------
def('dam', [
  '................',
  '...M......M.....',
  '..bMbbbbbbMbbb..',
  '.bbllbbbbbllbbb.',
  '.HHhhhhhhhhhhhm.',
  '.HmmmmmmmmmmmmM.',
  '.hMMMMMMMMMMMMM.',
  '.hhhhhhhhhhhhHH.',
  '.mmmmmmmmmmmmmH.',
  '.MMMMMMMMMMMMMh.',
  '.HHhhhhhhhhhhhm.',
  '.HmmmmmmmmmmmmM.',
  '.hMMMMMMMMMMMMM.',
  '..MMMMMMMMMMMM..',
  '................',
  '................',
]);

def('fence', [
  '................',
  '.......hm.......',
  '..hm..hmmM......',
  '.hmmM.hmmM..hm..',
  '.hmmM.hmmM.hmmM.',
  '.hmmM.hmmM.hmmM.',
  '.CCCC.CCCC.CCCC.',
  '.hmmM.hmmM.hmmM.',
  '.hmmM.hmmM.hmmM.',
  '.hhhhhhhhhhhhhh.',
  '.MMMMMMMMMMMMMM.',
  '.hmmM.hmmM.hmmM.',
  '.hmmM.hmmM.hmmM.',
  '.hmmM.hmmM.hmmM.',
  '.MMMM.MMMM.MMMM.',
  '................',
]);

def('platform', [
  '................',
  '................',
  '................',
  '.hhhhhhhhhhhhhh.',
  '.hmhhhhmhhhhmhh.',
  '.mmmmmmmmmmmmmm.',
  '.MMMMMMMMMMMMMM.',
  '..mM...mM...mM..',
  '..mM...mM...mM..',
  '..mM...mM...mM..',
  '.lmMlllmMlllmMl.',
  '.bBBbbbBBbbbBBb.',
  '.bbbbbbbbbbbbbb.',
  '..BBBBBBBBBBBB..',
  '................',
  '................',
]);

def('gate', [
  '................',
  '.....445544.....',
  '.mmmmmm55mmmmmm.',
  '.MMMMMM44MMMMMM.',
  '.hm....44....hM.',
  '.hm.hhhhhhhh.hM.',
  '.hm.mmmmmmmm.hM.',
  '.hm.hhhhhhhh.hM.',
  '.hm.mmmmmmmm.hM.',
  '.hm.hhhhhhhh.hM.',
  '.hm.MMMMMMMM.hM.',
  '.hmLLLLLLLLLLhM.',
  '.hmbllbbllbblhM.',
  '.hmbbbbbbbbbbhM.',
  '.MMbbbbbbbbbbMM.',
  '................',
]);

def('feeder', [
  '................',
  '.....hmhhmh.....',
  '..655555555554..',
  '..544444444443..',
  '...544www4443...',
  '....54wkw443....',
  '.....4www43.....',
  '......5443......',
  '.......43.......',
  '.......43.......',
  '................',
  '......h..m......',
  '........h.......',
  '.....m....h.....',
  '................',
  '................',
]);

def('aerator', [
  '................',
  '.........LLL....',
  '........LwLLl...',
  '........LLLLl...',
  '....LL..LLLll...',
  '...LwLl..Lll....',
  '...LLll.........',
  '....ll....L.....',
  '.........wLl....',
  '.....LL...l.....',
  '.....Ll.........',
  '................',
  '....45555554....',
  '...4535353534...',
  '....33333333....',
  '................',
]);

def('bughotel', [
  '................',
  '.......RR.......',
  '......RrrR......',
  '.....RrhhrR.....',
  '....RrhkkhrR....',
  '...RrhhhhhhrR...',
  '..RRRRRRRRRRRR..',
  '..mHkHHkHHkHHm..',
  '..mCCCCCCCCCCm..',
  '..mmmmmmmmmmmm..',
  '..mhyhyhyhyhym..',
  '..myhyhyhyhyhm..',
  '..mmmmmmmmmmmm..',
  '..mMhhMhhMhhMm..',
  '..MMMMMMMMMMMM..',
  '................',
]);

// --- nature ------------------------------------------------------------------
def('lilypad', [
  '................',
  '................',
  '................',
  '.....w..........',
  '....iwi.........',
  '...iiyii........',
  '....IiIffgg.....',
  '...ffggggggGg...',
  '..fggggggggggG..',
  '.fggggggggggggG.',
  '.fgggggg.ggggGG.',
  '..gggggggg.gGG..',
  '...gggggGGG..G..',
  '.....GGGGGG.....',
  '................',
  '................',
]);

def('cattail', [
  '................',
  '.....f..........',
  '.....g....f.....',
  '....hmM...g.....',
  '....mmM..hmM....',
  '....mmM..mmM....',
  '....mmM..mmM....',
  '....MMM..mmM....',
  '.....g...MMM....',
  '.f...g....g.....',
  '.fg..g....g..f..',
  '..fg.g...g..fg..',
  '...fgg...g.fg...',
  '....gg..gg.g....',
  '.....G..GGG.....',
  '................',
]);

def('willow', [
  '................',
  '.....ffffff.....',
  '...fffYffffff...',
  '..ffYfffyfffgf..',
  '.ffffffffffffgg.',
  '.fgfffyffffgfgg.',
  '.fgf.fgmgfg.fgg.',
  '.fg.fg.mm.gf.fg.',
  '.fy.fg.mm.gy.fg.',
  '.f..fg.mm.gf..g.',
  '.f...y.mm.g...g.',
  '.....g.mm.g.....',
  '.......mm.......',
  '......MmmM......',
  '................',
  '................',
]);

def('hive', [
  '................',
  '............LL..',
  '......YYyy..yky.',
  '....YYyyyyya....',
  '...aaaaaaaaAA...',
  '...YYyyyyyyya...',
  '..YYyyyyyyyyya..',
  '..aaaaaaaaaaAA..',
  '..Yyyyyyyyyyya..',
  '..Yyyyyyyyyyya..',
  '..aaaaaaaaaaAA..',
  '..Yyyyykkyyyya..',
  '..Yyyyykkyyyya..',
  '..AAAAAAAAAAAA..',
  '................',
  '................',
]);

def('maple', [
  '................',
  '.......p........',
  '......prr.......',
  '..p...prr...r...',
  '..pp.pprrr.rR...',
  '...pprrrrrrRR...',
  '.p..prrrrrrR..R.',
  '.pp.prrrRrrR.RR.',
  '..prrrrrRrrrRR..',
  '...rrrrRRRrRR...',
  '....r.RRR.R.....',
  '.......R........',
  '.......R........',
  '.......R........',
  '................',
  '................',
]);

def('tree', [
  '................',
  '.......fg.......',
  '......fggG......',
  '.....ffggGG.....',
  '....GfgggGGG....',
  '.....fgggGG.....',
  '....ffggggGG....',
  '...GfggggggGG...',
  '....fggggggG....',
  '...ffgggggggG...',
  '..fgggggggggGG..',
  '.FGGGGGGGGGGGGF.',
  '.......Mm.......',
  '.......Mm.......',
  '................',
  '................',
]);

def('lodge', [
  '................',
  '................',
  '....h......m....',
  '.....h..h.m.....',
  '......mhmm......',
  '....mhmMhmhm....',
  '...mhMmhmMhmM...',
  '...hmMhmmhMmh...',
  '..mhmMhmhMmhmM..',
  '..MhmhMmhmhMhM..',
  '..MMmMMhMMmMMM..',
  '.lbMMMMMMMMMMbl.',
  '.bbllbbbbbbllbb.',
  '..BbbbbllbbbbB..',
  '................',
  '................',
]);

// --- camera & menus --------------------------------------------------------------
def('camera', [
  '................',
  '................',
  '................',
  '....3333........',
  '....4333...rr...',
  '.44444444444443.',
  '.43333333333ww3.',
  '.43333555533332.',
  '.43335BLBB53332.',
  '.43335BbbB53332.',
  '.43335BbbB53332.',
  '.43335BBBB53332.',
  '.43333555533332.',
  '.22222222222222.',
  '................',
  '................',
]);

const ROTATE = [
  '................',
  '..........w.....',
  '..........ww....',
  '......wwwwwww...',
  '....wwwwwwwww...',
  '...www....ww....',
  '...ww.....w.....',
  '..ww............',
  '..ww........66..',
  '..ww........66..',
  '..w6........66..',
  '...66......66...',
  '...666....666...',
  '....66666666....',
  '......6666......',
  '................',
];
def('rotate_right', ROTATE);
def('rotate_left', flipX(ROTATE));

const ZOOM = [
  '................',
  '....5555........',
  '..55555544......',
  '..55wLLL44......',
  '.55LwLLLL44.....',
  '.55LLLLLL43.....',
  '.54LLLLLL43.....',
  '.54LLLLLL43.....',
  '..44LLLl43......',
  '..44444433......',
  '....3333.hmM....',
  '..........hmM...',
  '...........hmM..',
  '............hmM.',
  '.............MM.',
  '................',
];
def('zoom_in', patch(ZOOM, [[4, 4, ['.22.', '2222', '2222', '.22.']]]));
def('zoom_out', patch(ZOOM, [[4, 5, ['2222', '2222']]]));

def('menu', [
  '............',
  '............',
  '.wwwwwwwwww.',
  '.6666666666.',
  '............',
  '.wwwwwwwwww.',
  '.6666666666.',
  '............',
  '.wwwwwwwwww.',
  '.6666666666.',
  '............',
  '............',
]);

def('trophy', [
  '................',
  '...YYYyyyyyya...',
  '.yyYYyyyyyyyaaa.',
  '.y.Yyyyyyyyya.a.',
  '.y.Yyyyyyyyya.a.',
  '..yyYyyyyyyaaa..',
  '.....Yyyyya.....',
  '......yyaa......',
  '.......ya.......',
  '.......ya.......',
  '.....Yyyyaa.....',
  '....mmmmmmmm....',
  '....mhhhhhhm....',
  '....MMMMMMMM....',
  '................',
  '................',
]);

def('save', [
  '................',
  '.bbb5555555bbb..',
  '.bbb5555335bbbb.',
  '.bbb5555335bbbb.',
  '.bbb5555335bbbb.',
  '.bbb4444444bbbb.',
  '.bbbbbbbbbbbbbB.',
  '.bbwwwwwwwwwwbB.',
  '.bbw55555555wbB.',
  '.bbwwwwwwwwwwbB.',
  '.bbw55555555wbB.',
  '.bbwwwwwwwwwwbB.',
  '.bbwwwwwwwwwwbB.',
  '.BBBBBBBBBBBBBB.',
  '................',
  '................',
]);

def('home', [
  '................',
  '...........43...',
  '......pprr.43...',
  '.....pprrrR43...',
  '....pprrrrRR....',
  '...pprrrrrrRR...',
  '..pprrrrrrrrRR..',
  '.RRRRRRRRRRRRRR.',
  '..hhhhhhhhhhhh..',
  '..hhMMMMhyYyhm..',
  '..mmM11MmyyymM..',
  '..hhM11MhaaahM..',
  '..mmM1yMmmmmmM..',
  '..hhM11MhhhhhM..',
  '..MMMMMMMMMMMM..',
  '................',
]);

def('warning', [
  '............',
  '.....yy.....',
  '....yYyy....',
  '....ykky....',
  '...yykkyy...',
  '...yykkya...',
  '..yyykkyya..',
  '..yyyyyyya..',
  '.yyyykkyyya.',
  '.aaaaaaaaaA.',
  '............',
  '............',
]);

def('info', [
  '............',
  '....lbbb....',
  '..lbbbbbbB..',
  '..lbbwwbbB..',
  '.lbbbbbbbbB.',
  '.lbbbwwbbbB.',
  '.bbbbwwbbbB.',
  '.bbbbwwbbBB.',
  '..bbbwwbBB..',
  '..BbbbbBBB..',
  '....BBBB....',
  '............',
]);

def('newspaper', [
  '................',
  '................',
  '.cccccccccccccC.',
  '.c1111111111ccC.',
  '.c1111111111ccC.',
  '.cccccccccccccC.',
  '.c33333c44444cC.',
  '.c33333cccccccC.',
  '.c33333c44444cC.',
  '.c33333cccccccC.',
  '.cccccccccccccC.',
  '.c44444444444cC.',
  '.cccccccccccccC.',
  '.c4444444ccccCC.',
  '.CCCCCCCCCCCCCC.',
  '................',
]);

def('chart', [
  '................',
  '.c..............',
  '.c..........ya..',
  '.c..........ya..',
  '.c..........ya..',
  '.c.......fg.ya..',
  '.c.......fg.ya..',
  '.c.......fg.ya..',
  '.c....tT.fg.ya..',
  '.c....tT.fg.ya..',
  '.c.bB.tT.fg.ya..',
  '.c.bB.tT.fg.ya..',
  '.c.bB.tT.fg.ya..',
  '.c.bB.tT.fg.ya..',
  '.cccccccccccccc.',
  '................',
]);

def('pond', [
  '................',
  '................',
  '...lbbbbbbbbb...',
  '..lbbbbbbbbbbB..',
  '.lbbLLLbbbbbbbB.',
  '.bbbbbbbbLLbbbB.',
  '.bbbbbbbbbbbbBB.',
  '.bbLLbbbbbbbbbB.',
  '.bbbbbbbLLLbbBB.',
  '.bbbbbbbbbbbbBB.',
  '.bbbbLLbbbbbbBB.',
  '.bbbbbbbbbbBBBB.',
  '..bbbbbbbbBBBB..',
  '...BBBBBBBBBB...',
  '................',
  '................',
]);

def('eye', [
  '............',
  '............',
  '............',
  '....6666....',
  '..66tttt66..',
  '.wwwtwktwww.',
  '.wwwtkkTwww.',
  '..wwTTTTww..',
  '....wwww....',
  '............',
  '............',
  '............',
]);

// ===========================================================================
// REYNARD THE FOX
// ===========================================================================
const FOX_PAL = { K: '#46384d', 1: '#241f30', 2: '#3d3850', 3: '#5c5774', D: '#8a3416' };
const FOX_BASE = [
    '................................',
    '..............332221............',
    '.....K........322221............',
    '....KKK......322221...K.........',
    '....KKKK.....Yyyyya..KKK........',
    '...KOiIo.....aaaaAA.ooIK........',
    '...OoiiIo.33222222.oooiO........',
    '...Oociioo.1111111111.ooO.......',
    '...OoccooqOOOOOOOOOOOOqooO......',
    '...OocoqqqqqQQqqqqqqqqqooO......',
    '...OoqqqqaYaaqqqqqqqqqqoO.......',
    '...OoqqqaLqqqaqqqqqqqQQqo.......',
    '...OoqqqakkkkaqqqkkkqqqQQo......',
    '...OooqqayykyaqqqykyqqqqqQo.....',
    '...Ooooqayykyaoooykyqqqqqqo3K...',
    '...OoooooaaaaooooookcccooooKKK..',
    '..cOooooyoooooooooookcccccccC...',
    '.cccooooaooooooooooookkkkkkc....',
    '..CcccoyOoooooooooOOOkwwwwk.....',
    '.cCccccacccccccccccccckwkk......',
    '...CCccycccccccccccccCCCC.......',
    '.....CCaCccccccccCCCC...........',
    '.....xxxxyccprrRRrrRcxxxx.......',
    '....zxxxxXacrR.RR.rRXxxxxx......',
    '...zzxxxxxXycccccccXxxxxxxx.....',
    '..zzxxxxxxxXacccccXxxxxxxxxx....',
    '.zzxxxxxxxxxXycccXxxxxxxxxxxx...',
    '.zxxxxxxxxxxxXaccXxxxxxxxxxxxx..',
    '.zxxxxxxxxxxxxXcXxxxxxxxxxxxxxx.',
    '.zxxxxxxxxxxxxxXyxxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxxXxxxxxxxxxxxxxxx.',
    '.xxxxxxxxxxxxxxXxyxxxxxxxxxxxxx.',
];

const FOX_PATCHES = {
  // half-lidded eyes, low brow over the monocle, the other brow cocked
  smug: [
    [9, 9, ['DDDD']], [9, 13, ['yyky']], [9, 14, ['OOOO']],
    [17, 13, ['yky']], [17, 14, ['ooo']], [17, 10, ['kkk']], [16, 11, ['k...k']],
  ],
  // coin eyes, brows up, big drooling grin, a glint of gold
  greedy: [
    [9, 11, ['wYYy', 'Yyay', 'yyaa', 'yaAa']],
    [16, 10, ['.kkk.', 'kYyak', 'kyyak', 'kyaak', '.kkk.']],
    [9, 8, ['kkkk']], [17, 8, ['kkk']],
    [19, 15, ['k........', '.kkkkkkkc', '.kwwwwwwk', '..kIIIIk.', '.Lki.iIk.'.replace('.i.', 'iiI'), '.lCkkkk..', '.L.......']],
    [25, 6, ['.Y.', 'YwY', '.Y.']],
  ],
  // hat pops up, ears flatten, wide eyes with pin pupils, little O mouth
  shocked: [
    [1, 2, ['...._....', '...___...', 'KKK____..', 'KKOoiIo..', '.KOoiiIo.']],
    [19, 3, ['..._....', '..___KKK', '.ooiIoKK', 'oooiiOK.']],
    [10, 0, ['....332221..', '....322221..', '...322221_..', '...Yyyyya...', '...aaaaAA...', '33222222_...', '_1111111111k', '.__________.']],
    [9, 11, ['wyyy', 'yyky', 'yyyy', 'ayya']],
    [17, 10, ['kkk', 'wyy', 'yky', 'yyy', 'aya']],
    [9, 8, ['kkkk']], [17, 8, ['kkk']],
    [19, 15, ['o........', '.c.......', '..ckkkcc.', '..kIIIkC.', '...kkkc..']],
  ],
  // happy squeezed eyes, tear of joy, open laughing mouth
  laugh: [
    [9, 12, ['qkkq', 'kqqk', 'qqqq']],
    [17, 12, ['qkq', 'kqk', 'qqq']], [20, 13, ['L', 'l']],
    [19, 16, ['.kkkkkkkc', '.kwwwwwkc', '..kIIIkC.', '..kiiIk..', '...kkk...']],
  ],
  // monocle eye cocked open, the other winks; gleam on the fang
  wink: [
    [9, 8, ['.kk.', 'k..k']], [9, 13, ['yyky']], [9, 14, ['OOOO']],
    [17, 11, ['Dqq', 'qkk', 'kqq', 'qqq']],
    [27, 8, ['.w.', 'wYw', '.w.']],
  ],
  // furrowed V brows, glare, gritted teeth, anger mark
  angry: [
    [8, 9, ['kkk']], [11, 10, ['kk']], [16, 10, ['kk']], [18, 9, ['kkk']],
    [9, 12, ['kkkk', 'ykky', 'OOOO']], [17, 12, ['kkk', 'kky', 'ooo']],
    [19, 15, ['o........', '.ckkkkkkC', '.kwkwkwkc', 'OOkkkkkk.', '...cccc..']],
    [25, 1, ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.']],
  ],
  // brows pinched up, sweat drop, wobbly mouth
  worried: [
    [9, 9, ['kk']], [11, 8, ['kk']], [16, 8, ['kk']], [18, 9, ['kkk']],
    [9, 11, ['kkkk', 'yyyy', 'kkyy', 'yyyy']], [17, 11, ['kkk', 'yyy', 'kky', 'yyy']],
    [19, 15, ['o........', '.c.......', '..kckckcc', 'OOokckcC.', '...cccc..']],
    [26, 8, ['.L', 'Ll', 'lb']],
  ],
  // eyes shut, relaxed mouth, floating z's
  sleepy: [
    [9, 9, ['DDDD']], [9, 12, ['qqqq', 'kkkk', 'qqqq']],
    [17, 11, ['DDD', 'qqq', 'kkk', 'qqq']],
    [19, 15, ['o........', '.k.......', '..kkkkkc.', '...ccccC.', '...cccc..']],
    [27, 0, ['LLLL', '..L.', '.L..', 'LLLL']], [26, 5, ['LLLLL', '...L.', '..L..', '.L...', 'LLLLL']],
  ],
};
for (const [e, p] of Object.entries(FOX_PATCHES)) def('fox_' + e, patch(FOX_BASE, p), { pal: FOX_PAL });

// ===========================================================================
// BUILD
// ===========================================================================
function autoOutline(rows, ch = 'k') {
  const h = rows.length, w = rows[0].length;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '.' && rows[y][x] !== ch;
  const out = [];
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) s += ch;
      else s += c;
    }
    out.push(s);
  }
  return out;
}

function build(d) {
  let rows = d.rows.slice();
  if (d.ol) rows = autoOutline(rows);
  const full = d.pal ? { ...PAL, ...d.pal } : PAL;
  const pal = {};
  for (const r of rows) for (const ch of r) if (ch !== '.' && !(ch in pal)) pal[ch] = full[ch];
  return { w: rows[0].length, h: rows.length, rows, pal };
}

export const SPRITES = {};
for (const name of Object.keys(DEFS)) SPRITES[name] = build(DEFS[name]);

export const FOX_EXPRESSIONS = ['smug', 'greedy', 'shocked', 'laugh', 'wink', 'angry', 'worried', 'sleepy'];

// Placeholder for unknown names: a little '?' box.
const PLACEHOLDER = build({
  ol: 0,
  pal: { m: '#d14fb4' },
  rows: [
    'kkkkkkkkkk',
    'kmmmmmmmmk',
    'kmmwwwwmmk',
    'kmww..wwmk',
    'kmmmm.wwmk',
    'kmmmwwwmmk',
    'kmmmwwmmmk',
    'kmmmmmmmmk',
    'kmmmwwmmmk',
    'kkkkkkkkkk',
  ],
});

export function hasSprite(name) {
  return Object.prototype.hasOwnProperty.call(SPRITES, name);
}

function getSprite(name) {
  return hasSprite(name) ? SPRITES[name] : PLACEHOLDER;
}

// ===========================================================================
// RENDER (lazy, cached)
// ===========================================================================
const canvasCache = new Map();
const urlCache = new Map();

function normScale(scale) {
  const s = Math.floor(Number(scale));
  return s >= 1 ? s : 1;
}

export function spriteCanvas(name, scale = 1) {
  scale = normScale(scale);
  const key = name + '@' + scale;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const s = getSprite(name);
  const cv = document.createElement('canvas');
  cv.width = s.w * scale;
  cv.height = s.h * scale;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y];
    let x = 0;
    while (x < s.w) {
      const ch = row[x];
      let x2 = x + 1;
      while (x2 < s.w && row[x2] === ch) x2++;
      if (ch !== '.') {
        ctx.fillStyle = s.pal[ch] || '#ff00ff';
        ctx.fillRect(x * scale, y * scale, (x2 - x) * scale, scale);
      }
      x = x2;
    }
  }
  canvasCache.set(key, cv);
  return cv;
}

export function spriteURL(name, scale = 1) {
  scale = normScale(scale);
  const key = name + '@' + scale;
  let url = urlCache.get(key);
  if (!url) {
    url = spriteCanvas(name, scale).toDataURL('image/png');
    urlCache.set(key, url);
  }
  return url;
}

export function spriteImg(name, scale = 2, cls = '') {
  scale = normScale(scale);
  const s = getSprite(name);
  const klass = cls ? `px ${cls}` : 'px';
  return `<img class="${klass}" src="${spriteURL(name, scale)}" width="${s.w * scale}" height="${s.h * scale}" alt="" draggable="false" style="image-rendering:pixelated">`;
}

export function foxPortraitURL(expr = 'smug', scale = 4) {
  const e = FOX_EXPRESSIONS.includes(expr) ? expr : 'smug';
  return spriteURL('fox_' + e, scale);
}
