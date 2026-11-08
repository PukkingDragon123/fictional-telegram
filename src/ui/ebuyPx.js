// e-Buy's own little pixel icon set (so the shop never depends on sprites that
// might not exist). Each icon is [rows, palette]; px(name, scale) returns a
// crisp inline <svg>. Strings are built once and cached.
const INK = '#2a1a14';
export const PX = {
  // [v33 kit] the back / forward arrows, hand-shaded (rim light, a shade under the shaft, a glint)
  arrow: [['....aa.....', '...awa.....', '..awbaaaaaa', '.awbbwwwwwa', 'abbbbbbbbba', '.acbbbbbbca', '..acbaaaaaa', '...aca.....', '....aa.....'], { a: INK, b: '#fff4dc', c: '#dcc496', w: '#ffffff' }, true],
  arrowR: [['.....aa....', '.....awa...', 'aaaaaawba..', 'awwwwwbbwa.', 'abbbbbbbbba', 'acbbbbbbca.', 'aaaaaabca..', '.....aca...', '.....aa....'], { a: INK, b: '#fff4dc', c: '#dcc496', w: '#ffffff' }, true],
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
  // [v33 kit] finer shop icons (shown at 2 css px per art px): departments (16x16), cart, orders, search, the courier
  d_eggs: [['................', '...kkkkk........', '.kkbbbbbkk...kk.', 'kbllbbbbbbk.kbbk', 'kbwkbbbbbbbkkbk.', 'kbkkbbbbbbbbbbk.', 'kyybbbbbbbbkkbbk', '.kyyyyyyykk..kk.', '..kkkkkkk.kkk...', '.........keeek..', '........keweeek.', '........kweesek.', '........keeeeek.', '........keseeek.', '.........keeek..', '..........kkk...'], { k: INK, b: '#4a8ad8', l: '#8ac4f0', w: '#ffffff', y: '#f0d070', e: '#fff1d6', s: '#c89a64' }],
  d_food: [['................', '......kkkk......', '.....kttttk.....', '......kkkk......', '....kkkkkkkk....', '...kppppppppk...', '...kpPPPPPPpk...', '..kppppppppppk..', '..kpppkkkkpppk..', '..kppkoooookpk..', '..kpkowooooopk..', '..kppkoooookpk..', '..kpppkkkkpppk..', '..kppppppppppk..', '..kPPPPPPPPPPk..', '...kkkkkkkkkk...'], { k: INK, p: '#ecd096', P: '#c8a060', t: '#d9453b', o: '#ff9a30', w: '#ffffff' }],
  d_farm: [['................', '......kkkk......', '.....kggggk.....', '....kggwkgk.....', '....kggkkgkoo...', '....kggggkooook.', '.....kgggkkkkk..', '..kk..kwwk......', '.kwwkkwwwwkkk...', 'kwwwwwwwwwwwwk..', 'kwwlwwwwwwwwwk..', 'kwwllwwwwwwwk...', '.kwwlllwwwwk....', '..kkkwwwwkk.....', 'bbbbkkkkkbbbbbbb', '.BB.bbb..BB..bb.'], { k: INK, g: '#3a8a4a', w: '#f6efe0', l: '#c8bca8', o: '#ffa030', b: '#4a9ad8', B: '#8ac8f0' }],
  d_plants: [['................', '....kkkkkkk.....', '..kkgglggggkk...', '.kgggggggrrggk..', '.kglggrrgrRrgk..', 'kggggrRrggrrggk.', 'kgrrggrrgglgggk.', 'kgrRrggggggrrgk.', '.kgrrgglgggrRgk.', '..kggggggggggk..', '...kkkkkkkkkk...', '...kttttttttk...', '....kTTTTTTk....', '....kttttttk....', '....kTTTTTTk....', '.....kkkkkk.....'], { k: INK, g: '#5aa04a', l: '#8ad06a', r: '#4a5ad8', R: '#a8b8ff', t: '#d0683e', T: '#a04a2a' }],
  d_decor: [['.......kk.......', '......krrk......', '......krrk......', '.....krRrrk.....', '.....kRrrrk.....', '....krrrrrrk....', '...kkkkkkkkkk...', '....kffffffk....', '....kfkffkfk....', '...kwwfPPfwwk...', '...kwwwwwwwwk...', '..kbbkwwwwkbbk..', '..kbbbkwwkbbbk..', '...kbbbbbbbbk...', '...kkkkkkkkkk...', '..kssk....kssk..'], { k: INK, r: '#d9453b', R: '#ff7a6a', f: '#f2c8a0', P: '#e88a7a', w: '#ffffff', b: '#3a7ae0', s: '#7a4a2a' }],
  d_restaurant: [['................', '.......kk.......', '......kyyk......', '....kkkkkkkk....', '...kwwwwwwllk...', '..kwHwwwwwwwlk..', '..kwwwwwwwwwlk..', '.kkkkkkkkkkkkkk.', 'krrwwrrwwrrwwrrk', 'kwwrrwwrrwwrrwwk', 'krrwwrrwwrrwwrrk', '.kkkkkkkkkkkkkk.', '...kd......dk...', '...kd......dk...', '...kd......dk...', '...kk......kk...'], { k: INK, w: '#eceef4', H: '#ffffff', l: '#a8acc0', y: '#ffd23f', r: '#d9453b', d: '#8a5a30' }],
  d_gear: [['................', '.kk.kk......kk..', 'kggkggk....kddk.', 'kgk.kgk...kddk..', '.kgggk...kddk...', '..kgggk.kddk....', '...kgggkddk.....', '....kgkddk......', '...kkkkddgk.....', '..kssskkkggk....', '.ksslssk.kggk...', 'ksslsssk..kggk..', 'kslsssk....kggk.', 'ksssskk.....kgk.', '.kkkk........k..', '................'], { k: INK, g: '#b8c0c8', d: '#a0683a', s: '#98a4b0', l: '#eef4fa' }],
  d_tag: [['................', '................', '...kkkkkkkk.....', '..kyyyyyyyyk....', '.kyykyyyyyyyk...', '.kykwkyyyyyyyk..', '.kyykyyyyyyyyyk.', '.kyyyyyyyyyyyk..', '.kyyyyyyyyyyk...', '..kyyyyyyyyk....', '...kkkkkkkk.....', '................', '................', '................', '................', '................'], { k: INK, y: '#ffd23f', w: '#fff' }],
  cart16: [['k...............', 'kk..............', '.kk.............', '.kkkkkkkkkkkkkkk', '.kywyywyywyywyyk', '..kyyyyyyyyyyyyk', '..kywyywyywyywk.', '..kyyyyyyyyyyyk.', '...kYYYYYYYYYYk.', '...kkkkkkkkkkkk.', '...k.........k..', '..kkkkkkkkkkkkk.', '..kgk......kgk..', '...k........k...'], { k: '#2a1a14', y: '#ffd23f', w: '#fff2a0', Y: '#e09a16', g: '#b8b0a0' }],
  box16: [['..kkkkkkkkkkkk..', '.kBBBBBttBBBBBk.', 'kbbbbbbttbbbbbbk', 'kkkkkkkttkkkkkkk', 'kccwwwwttwwwccdk', 'kcwkkkkttkkkwcdk', 'kcwrwkkttkkkwcdk', 'kcwwwwwttwwwwcdk', 'kcwkkkkttkkwwcdk', 'kccwwwwttwwwccdk', 'kccccccttcccccdk', 'kCCCCCCttCCCCCdk', 'kkkkkkkkkkkkkkkk'], { k: '#2a1a14', b: '#e2b070', B: '#f0c890', t: '#d9453b', c: '#c88a4c', C: '#b07a40', d: '#a86a34', w: '#fff4dc', r: '#f0505a' }],
  mag14: [['...kkkkk......', '..kbbbbbk.....', '.kbwwbbbbk....', 'kbwwbbbbbbk...', 'kbwbbbbbbbk...', 'kbbbbbbbbBk...', 'kbbbbbbbbBk...', '.kbbbbbbBk....', '..kBBBBBkk....', '...kkkkkhhk...', '.........hhk..', '..........hhk.', '...........hhk', '............k.'], { k: '#2a1a14', b: '#bfe8ff', B: '#8ac4f0', w: '#ffffff', h: '#8a5a30' }],
  moosec: [['k.k.k........k.k.k', 'kakak........kakak', 'kaaakk......kkaaak', '.kaaaak....kaaaak.', '..kkaaakkkkaaakk..', '....kccccccccck...', '...kcCCwCCCCCCck..', '...kkkkkkkkkkkkk..', '...kffffffffffk...', '..kffkwffffkwffk..', '..kffkkffffkkffk..', '..kffffffffffffk..', '...kffffffffffk...', '....kfnnnnnnfk....', '....knnknnknnk....', '.....knnnnnnk.....', '.....kssssssk.....', '......kkkkkk......'], { k: '#2a1a14', a: '#d8a060', c: '#3a7ae0', C: '#5a9af0', w: '#ffffff', f: '#8a5a34', n: '#c08a5a', s: '#f0505a' }],
  // shipping tiers, gift wrap, the club card
  rocket: [['....a....', '...aba...', '..abcba..', '..abbba..', '..abdba..', '..abbba..', '.aabbbaa.', 'aeaaaaaea', '..f.f.f..', '...f.f...'], { a: INK, b: '#e8e8f0', c: '#3a7ae0', d: '#f0505a', e: '#f0505a', f: '#ffa030' }],
  gift: [['..a...a..', '.aba.aba.', '..aaaaa..', 'aaaaaaaaa', 'abbbcbbba', 'aaaaaaaaa', '.abbcbba.', '.abbcbba.', '.abbcbba.', '.aaaaaaa.'], { a: INK, b: '#ff6aa8', c: '#ffd23f' }],
  stamp: [['.aaaaa.', 'abbbbba', 'abcbcba', 'abbbbba', 'abcccba', 'abbbbba', '.aaaaa.'], { a: '#b02a32', b: '#f0505a', c: '#fff4dc' }],
  ticket: [['aaaaaaaaaa', 'abbbbbbbba', '.abcbcbcba', 'abbbbbbbba', '.abcbcbcba', 'abbbbbbbba', 'aaaaaaaaaa'], { a: INK, b: '#ffd23f', c: '#e09a16' }],
};

// [v33 kit] polish: a flat-filled icon gets form shading inside its ink outline - a rim light where the
// fill meets the outline on top (and a lighter step on the left), a shade step along the bottom, and one
// white glint in the top-left of its biggest fill. Hand-shaded icons (the 16 px set, the sparkles, anything
// with a third entry `true`) and outline-only glyphs are left exactly as drawn.
const HAND = /^(d_|cart16|box16|mag14|moosec|spark|rainbow|planet|shiny|candy|doge|skull|titan|snow|flame|blueflame|bigx|antler|coinp|dot|tiny|plus)/;
const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumH = (h) => { const [r, g, b] = hexRGB(h); return 0.3 * r + 0.59 * g + 0.11 * b; };
const mixH = (h, to, t) => { const a = hexRGB(h), b = hexRGB(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function polished(name, rows, pal, hand) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const col = (x, y) => (y < 0 || y >= h || x < 0 || x >= w ? null : pal[rows[y][x]] || null);
  const grid = rows.map((row, y) => [...row.padEnd(w, '.')].map((_, x) => col(x, y)));
  if (hand || HAND.test(name) || w < 6 || h < 5) return grid;
  const inkish = (c) => !c || lumH(c) < 70;
  const fills = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = col(x, y); if (c && !inkish(c) && lumH(c) < 246) fills.set(c, (fills.get(c) || 0) + 1); }
  if (!fills.size || ![...rows.join('')].some((ch) => pal[ch] && inkish(pal[ch]))) return grid; // outline-only glyph, or no outline
  const big = [...fills.entries()].sort((a, b) => b[1] - a[1])[0];
  let glint = big[1] >= 10 ? null : false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = col(x, y);
    if (!c || inkish(c) || lumH(c) >= 246) continue;
    const up = inkish(col(x, y - 1)), dn = inkish(col(x, y + 1)), lf = inkish(col(x - 1, y)), rt = inkish(col(x + 1, y));
    if (up && !dn) grid[y][x] = mixH(c, '#ffffff', 0.38);
    else if (dn && !up) grid[y][x] = mixH(c, '#2a1a14', 0.2);
    else if (lf && !rt) grid[y][x] = mixH(c, '#ffffff', 0.2);
    else if (rt && !lf) grid[y][x] = mixH(c, '#2a1a14', 0.1);
    if (glint === null && c === big[0] && up && lf && !inkish(col(x + 1, y + 1))) glint = [x + 1, y + 1];
  }
  if (glint) grid[glint[1]][glint[0]] = '#ffffff';
  return grid;
}
const cache = new Map();
export function px(name, s = 3, cls = '') {
  const k = name + '|' + s + '|' + cls;
  let out = cache.get(k);
  if (out) return out;
  const [rows, pal, hand] = PX[name] || PX.dot;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const grid = polished(name, rows, pal, hand);
  let r = '';
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!c) { x++; continue; }
      let n = 1;
      while (row[x + n] === c) n++;
      r += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
      x += n;
    }
  });
  out = `<svg class="eb-px ${cls}" viewBox="0 0 ${w} ${h}" width="${w * s}" height="${h * s}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  cache.set(k, out);
  return out;
}
