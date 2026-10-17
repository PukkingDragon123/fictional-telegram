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
