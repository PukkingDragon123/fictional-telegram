// e-Buy's own little pixel icon set (so the shop never depends on sprites that
// might not exist). Each icon is [rows, palette]; px(name, scale) returns a
// crisp inline <svg>. Strings are built once and cached.
const INK = '#2a1a14';
export const PX = {
  arrow: [['...a....', '..aa....', '.aaaaaaa', 'aabbbbba', '.aaaaaaa', '..aa....', '...a....'], { a: INK, b: '#fff4dc' }],
  arrowR: [['....a...', '....aa..', 'aaaaaaa.', 'abbbbbaa', 'aaaaaaa.', '....aa..', '....a...'], { a: INK, b: '#fff4dc' }],
  reload: [['..aaaa.', '.a....a', 'a....aaa', 'a.....a.', 'a.......', '.a....a.', '..aaaa..'], { a: INK }],
  x: [['aa...aa', 'aaa.aaa', '.aaaaa.', '..aaa..', '.aaaaa.', 'aaa.aaa', 'aa...aa'], { a: INK }],
  bigx: [['.aa.....aa.', 'abba...abba', 'abbba.abbba', '.abbbabbba.', '..abbbbba..', '...abbba...', '..abbbbba..', '.abbbabbba.', 'abbba.abbba', 'abba...abba', '.aa.....aa.'], { a: '#5a0e14', b: '#ff3b3b' }],
  flame: [['...a...', '..aa...', '..aba..', '.abba.a', '.abbbaa', 'abbcbba', 'abccbba', 'abcccba', '.abcba.'], { a: '#d9453b', b: '#ffa030', c: '#ffe478' }],
  blueflame: [['...a...', '..aa...', '..aba..', '.abba.a', '.abbbaa', 'abbcbba', 'abccbba', 'abcccba', '.abcba.'], { a: '#3a6ae0', b: '#7ad0ff', c: '#ffffff' }],
  snow: [['...a...', '.a.a.a.', '..aaa..', 'aaabaaa', '..aaa..', '.a.a.a.', '...a...'], { a: '#e8f8ff', b: '#7ad0ff' }],
  spark: [['...a...', '...a...', '..aba..', 'aabbbaa', '..aba..', '...a...', '...a...'], { a: '#fff6b0', b: '#ffffff' }],
  sparkY: [['...a...', '...a...', '..aba..', 'aabbbaa', '..aba..', '...a...', '...a...'], { a: '#ffb020', b: '#fff2a0' }],
  sparkP: [['..a..', '..a..', 'aabaa', '..a..', '..a..'], { a: '#c9a0ff', b: '#ffffff' }],
  candy: [['a..bbb..a', 'aabcbcbaa', 'aabbcbbaa', 'a..bbb..a'], { a: '#ff7ab0', b: '#ff4f8f', c: '#fff' }],
  titan: [['...a...', '..aba..', '.abbba.', 'abbbbba', '..aba..', '..aba..', '..aaa..'], { a: INK, b: '#ffd23f' }],
  doge: [['.a.....a.', 'aba...aba', 'abbaaabba', 'abbbbbbba', 'abkbbbkba', 'abbwwwbba', '.abwkwba.', '..aaaaa..'], { a: '#6a3a10', b: '#f0a838', w: '#fff4dc', k: INK }],
  skull: [['.aaaaa.', 'abbbbba', 'abkbkba', 'abbbbba', '.abkba.', '..aaa..'], { a: '#1f3f2c', b: '#9ee07a', k: '#1f3f2c' }],
  planet: [['...aaa...', '..abbba..', 'cabbbbbac', '.ccbbbcc.', '..accca..', '...aaa...'], { a: '#3a1a6a', b: '#a070ff', c: '#ffd2ff' }],
  rainbow: [['..rrrrr..', '.rooooor.', 'royyyyyor', 'oyg...gyo', 'yg.....gy'], { r: '#ff4a4a', o: '#ffa030', y: '#ffe040', g: '#5ad06a' }],
  shiny: [['...a...', '..aba..', '.abcba.', 'abcccba', '.abcba.', '..aba..', '...a...'], { a: '#c08010', b: '#ffd23f', c: '#fffbe0' }],
  tiny: [['.a.aa', 'aaaaa', '.a.aa'], { a: INK }],
  dot: [['aa', 'aa'], { a: '#ffffff' }],
  cart: [['aa.........', '.a.........', '.aaaaaaaaaa', '.abbbbbbbba', '.abbbbbbba.', '..abbbbbba.', '..aaaaaaaa.', '...a....a..', '..aaa..aaa.'], { a: INK, b: '#ffd23f' }],
  cartW: [['aa.........', '.a.........', '.aaaaaaaaaa', '.abbbbbbbba', '.abbbbbbba.', '..abbbbbba.', '..aaaaaaaa.', '...a....a..', '..aaa..aaa.'], { a: INK, b: '#fffaf0' }],
  antler: [['k.k.k....', 'kbkbk.k..', 'kbbbbkbk.', '.kbbbbbbk', '..kkbbkk.', '....kbk..', '....kk...'], { k: INK, b: '#d8a060' }],
  lockpad: [['..aaa..', '.a...a.', '.a...a.', 'aaaaaaa', 'abbbbba', 'abbabba', 'abbabba', 'aaaaaaa'], { a: INK, b: '#b8b0a0' }],
  bike: [['..........aa...', '.....aaaaaa....', '....a....a.....', '.aaa.a..a.aaa..', 'a...a.aa.a...a.', 'a.a.a....a.a.a.', 'a...a....a...a.', '.aaa......aaa..'], { a: INK }],
  eye: [['..aaa..', '.abbba.', 'abbkbba', '.abbba.', '..aaa..'], { a: INK, b: '#fff', k: INK }],
  clock: [['.aaaaa.', 'abbbbba', 'abbabba', 'abbaaba', 'abbbbba', '.aaaaa.'], { a: INK, b: '#fff4dc' }],
  box: [['.aaaaaa.', 'abbbbbba', 'aaaaaaaa', 'acccccca', 'accddcca', 'acccccca', 'aaaaaaaa'], { a: INK, b: '#e2b070', c: '#c88a4c', d: '#fff4dc' }],
  mag: [['.aaa...', 'abbba..', 'abbba..', 'abbba..', '.aaaa..', '....aa.', '.....aa'], { a: INK, b: '#bfe8ff' }],
  sprout: [['...aa..', '..abba.', 'aa.ab..', 'abba...', '.aaa...', '..a....', '..a....'], { a: '#1f5236', b: '#7cbe46' }], // [v26 seasons]
  starbm: [['...a...', '..aba..', 'aabbbaa', '.abbba.', '.ab.ba.', 'aa...aa'], { a: INK, b: '#ffd23f' }],
  plus: [['.aa.', 'aaaa', 'aaaa', '.aa.'], { a: INK }],
  // [v26 ebuy] new bits for the cart, filters and checkout
  trash: [['..aaa..', 'aaaaaaa', '.abbba.', '.ababa.', '.ababa.', '.ababa.', '.abbba.', '.aaaaa.'], { a: INK, b: '#d8d0c0' }],
  check: [['......aa', '.....aa.', 'a...aa..', 'aa.aa...', '.aaa....', '..a.....'], { a: INK }],
  checkW: [['......aa', '.....aa.', 'a...aa..', 'aa.aa...', '.aaa....', '..a.....'], { a: '#ffffff' }],
  chev: [['aa...aa', '.aa.aa.', '..aaa..', '...a...'], { a: INK }],
  sort: [['..a.....', '.aaa....', 'aaaaa...', '..a..a..', '..a..a..', '...aaaaa', '....aaa.', '.....a..'], { a: INK }],
  pin: [['.aaaaa.', 'abbbbba', 'abbkbba', 'abbbbba', '.abbba.', '..aba..', '...a...'], { a: INK, b: '#f0505a', k: '#fff4dc' }],
  van: [['aaaaaaaaa.....', 'abbbbbbba.....', 'abbbbbbbaaaa..', 'abbbbbbbaccaa.', 'abbbbbbbacccaa', 'abbbbbbbaaaaaa', 'aaaaaaaaaaaaaa', '..aka....aka..', '...a......a...'], { a: INK, b: '#ffd23f', c: '#bfe8ff', k: '#9a948a' }],
  coinp: [['.aaaa.', 'abbbba', 'abccba', 'abccba', 'abbbba', '.aaaa.'], { a: '#7a4a12', b: '#ffd23f', c: '#fff2a0' }],
  heart: [['.aa.aa.', 'abbabba', 'abbbbba', '.abbba.', '..aba..', '...a...'], { a: INK, b: '#f0505a' }],

  // [v30 ebuy] department icons (16x16) and a few small ones
  d_eggs: [['................', '...kkkkk........', '.kkbbbbbkk...kk.', 'kbllbbbbbbk.kbbk', 'kbwkbbbbbbbkkbk.', 'kbkkbbbbbbbbbbk.', 'kyybbbbbbbbkkbbk', '.kyyyyyyykk..kk.', '..kkkkkkk.kkk...', '.........keeek..', '........keweeek.', '........kweesek.', '........keeeeek.', '........keseeek.', '.........keeek..', '..........kkk...'], { k: INK, b: '#4a8ad8', l: '#8ac4f0', w: '#ffffff', y: '#f0d070', e: '#fff1d6', s: '#c89a64' }],
  d_food: [['................', '......kkkk......', '.....kttttk.....', '......kkkk......', '....kkkkkkkk....', '...kppppppppk...', '...kpPPPPPPpk...', '..kppppppppppk..', '..kpppkkkkpppk..', '..kppkoooookpk..', '..kpkowooooopk..', '..kppkoooookpk..', '..kpppkkkkpppk..', '..kppppppppppk..', '..kPPPPPPPPPPk..', '...kkkkkkkkkk...'], { k: INK, p: '#ecd096', P: '#c8a060', t: '#d9453b', o: '#ff9a30', w: '#ffffff' }],
  d_farm: [['................', '......kkkk......', '.....kggggk.....', '....kggwkgk.....', '....kggkkgkoo...', '....kggggkooook.', '.....kgggkkkkk..', '..kk..kwwk......', '.kwwkkwwwwkkk...', 'kwwwwwwwwwwwwk..', 'kwwlwwwwwwwwwk..', 'kwwllwwwwwwwk...', '.kwwlllwwwwk....', '..kkkwwwwkk.....', 'bbbbkkkkkbbbbbbb', '.BB.bbb..BB..bb.'], { k: INK, g: '#3a8a4a', w: '#f6efe0', l: '#c8bca8', o: '#ffa030', b: '#4a9ad8', B: '#8ac8f0' }],
  d_plants: [['................', '....kkkkkkk.....', '..kkgglggggkk...', '.kgggggggrrggk..', '.kglggrrgrRrgk..', 'kggggrRrggrrggk.', 'kgrrggrrgglgggk.', 'kgrRrggggggrrgk.', '.kgrrgglgggrRgk.', '..kggggggggggk..', '...kkkkkkkkkk...', '...kttttttttk...', '....kTTTTTTk....', '....kttttttk....', '....kTTTTTTk....', '.....kkkkkk.....'], { k: INK, g: '#5aa04a', l: '#8ad06a', r: '#4a5ad8', R: '#a8b8ff', t: '#d0683e', T: '#a04a2a' }],
  d_decor: [['.......kk.......', '......krrk......', '......krrk......', '.....krRrrk.....', '.....kRrrrk.....', '....krrrrrrk....', '...kkkkkkkkkk...', '....kffffffk....', '....kfkffkfk....', '...kwwfPPfwwk...', '...kwwwwwwwwk...', '..kbbkwwwwkbbk..', '..kbbbkwwkbbbk..', '...kbbbbbbbbk...', '...kkkkkkkkkk...', '..kssk....kssk..'], { k: INK, r: '#d9453b', R: '#ff7a6a', f: '#f2c8a0', P: '#e88a7a', w: '#ffffff', b: '#3a7ae0', s: '#7a4a2a' }],
  d_restaurant: [['................', '.......kk.......', '......kyyk......', '....kkkkkkkk....', '...kwwwwwwllk...', '..kwHwwwwwwwlk..', '..kwwwwwwwwwlk..', '.kkkkkkkkkkkkkk.', 'krrwwrrwwrrwwrrk', 'kwwrrwwrrwwrrwwk', 'krrwwrrwwrrwwrrk', '.kkkkkkkkkkkkkk.', '...kd......dk...', '...kd......dk...', '...kd......dk...', '...kk......kk...'], { k: INK, w: '#eceef4', H: '#ffffff', l: '#a8acc0', y: '#ffd23f', r: '#d9453b', d: '#8a5a30' }],
  d_gear: [['................', '.kk.kk......kk..', 'kggkggk....kddk.', 'kgk.kgk...kddk..', '.kgggk...kddk...', '..kgggk.kddk....', '...kgggkddk.....', '....kgkddk......', '...kkkkddgk.....', '..kssskkkggk....', '.ksslssk.kggk...', 'ksslsssk..kggk..', 'kslsssk....kggk.', 'ksssskk.....kgk.', '.kkkk........k..', '................'], { k: INK, g: '#b8c0c8', d: '#a0683a', s: '#98a4b0', l: '#eef4fa' }],
  d_tag: [['................', '................', '...kkkkkkkk.....', '..kyyyyyyyyk....', '.kyykyyyyyyyk...', '.kykwkyyyyyyyk..', '.kyykyyyyyyyyyk.', '.kyyyyyyyyyyyk..', '.kyyyyyyyyyyk...', '..kyyyyyyyyk....', '...kkkkkkkk.....', '................', '................', '................', '................', '................'], { k: INK, y: '#ffd23f', w: '#fff' }],
  flask: [['.aaa.', '.aba.', '.aba.', 'abbba', 'acgca', 'aggga', 'aaaaa'], { a: INK, b: '#e8f4ff', c: '#9ee07a', g: '#5ac04a' }],
  map: [['aaaaaaa', 'abcbcba', 'acbcbca', 'abcbrba', 'acbrrca', 'abcbcba', 'aaaaaaa'], { a: INK, b: '#f3e2b0', c: '#d8c290', r: '#d9453b' }],
  beav: [['.a...a.', 'abaaaba', 'abbbbba', 'abkbkba', 'abbbbba', '.abwba.', '..aaa..'], { a: INK, b: '#a0683a', k: INK, w: '#fff' }],
  minus: [['aaaaaaa', 'aaaaaaa'], { a: INK }],
  plusb: [['..aaa..', '..aaa..', 'aaaaaaa', 'aaaaaaa', 'aaaaaaa', '..aaa..', '..aaa..'], { a: INK }],
  gem: [['.aaa.', 'abbca', 'abcca', '.aca.', '..a..'], { a: INK, b: '#ffffff', c: '#888' }],
  back: [['....aa..', '...aba..', '..abba..', '.abbbaaa', 'abbbbbba', '.abbbaaa', '..abba..', '...aba..', '....aa..'], { a: INK, b: '#fff4dc' }],
  cartP: [['aa..........', '.a..........', '.aaaaaaaaaa.', '.abbbbbbbba.', '.abbbbbbbba.', '..abbbbbba..', '..aaaaaaaa..', '...a....a...', '..aaa..aaa..'], { a: INK, b: '#fffaf0' }],
  ring: [['..aaa..', '.a...a.', 'a.....a', 'a.....a', 'a.....a', '.a...a.', '..aaa..'], { a: INK }],
};

const cache = new Map();
export function px(name, s = 3, cls = '') {
  const k = name + '|' + s + '|' + cls;
  let out = cache.get(k);
  if (out) return out;
  const [rows, pal] = PX[name] || PX.dot;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let r = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = pal[row[x]];
      if (!c) { x++; continue; }
      let n = 1;
      while (row[x + n] === row[x]) n++;
      r += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
      x += n;
    }
  });
  out = `<svg class="eb-px ${cls}" viewBox="0 0 ${w} ${h}" width="${w * s}" height="${h * s}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  cache.set(k, out);
  return out;
}
