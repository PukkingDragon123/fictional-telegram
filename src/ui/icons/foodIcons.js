// Food UI icons (20x20, same palette, shading and outlines as src/ui/sprites.js):
//   bag_<id>      a mini bag for every fish-food bag + Bug Bites
//   produce       carrot lettuce radish peas potato corn sunflower pumpkin
//   specials      golden_carrot giant_pumpkin moonberry royal_jelly truffle
//                 maple_gem pearl_rice rainbow_corn sun_seed  ('clover' is in sprites.js)
//   buildings     bowl pantry beaverbar buggrinder rabbit
//   tools         scoop harvest seed
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js). The
// art kit lives in ../bagArt.js; nothing is drawn until an icon is first used.
import { Grid, render, foodIconPix, FOOD_ICON_NAMES, MASCOTS, bagLook, Pix, rgb, shade } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

// ---------------------------------------------------------------- mini bags
// tiny 7x6 brand emblems (chars: o main fur, w white, K ink, y gold, r red, p pink, g green, b body)
const EMBLEM = {
  fox: [['o.....o', 'oo...oo', 'ooooooo', 'oKoooKo', '.wwKww.', '..www..'], { o: 'fox:3', w: 'white:4', K: '#2a1a14' }],
  trout: [['..ww...', '.wwww..', 'ggggggg', 'pppppKp', 'wwwwwww', '.g...g.'], { w: 'white:4', g: 'olive:3', p: 'pink:3', K: '#2a1a14' }],
  worm: [['.pppp..', 'KKKKKK.', '.KK.KK.', '.pppp..', '.wwww..', '.wwww..'], { p: 'pink:3', K: '#2a1a14', w: 'white:4' }],
  krill: [['.KKKK..', 'KKyKKK.', '..pppp.', 'ppwKpp.', 'pppppp.', 'p.p.p..'], { K: '#2a1a14', y: 'gold:4', p: 'pink:3', w: '#ffffff' }],
  moose: [['y.ttt.y', 'yytttyy', '.bbbbb.', '.bKbKb.', '..bbb..', '.rrrrr.'], { y: 'bone:4', t: 'tan:3', b: 'beaver:3', K: '#2a1a14', r: 'red:3' }],
  sturgeon: [['.y.y.y.', '.yyyyy.', 'ssssss.', 'sKsssss', 'wwwwww.', '.s...s.'], { y: 'gold:4', s: 'slate:3', K: '#2a1a14', w: 'bone:4' }],
  ladybug: [['.wwwww.', '.KKKKK.', '.KwKwK.', 'rrrKrrr', 'rKrrrKr', '.rrrrr.'], { w: 'white:5', K: '#2a1a14', r: 'red:3' }],
};
function miniBag(id) {
  const c = bagLook(id);
  const kraft = id === 'bugbites';
  const g = new Grid(20, 20);
  const body = kraft ? '#c99a62' : c.main;
  const key = {
    B: '~' + body.slice(1) + '.x@bag', S: '~' + shade(rgb(body), -1).map((v) => v.toString(16).padStart(2, '0')).join('') + ':3',
    s: '~' + shade(rgb(body), -2).map((v) => v.toString(16).padStart(2, '0')).join('') + ':3',
    T: '~' + (kraft ? 'fbf3dc' : c.trim.slice(1)) + ':3', A: '~' + (kraft ? 'fbf3dc' : c.accent.slice(1)) + ':3',
  };
  g.rect(4, 2, 12, 3, 'S');
  for (let x = 4; x < 16; x += 2) g.set(x, 2, 's');
  g.poly([[3.4, 4.6], [16.6, 4.6], [17.4, 17], [16, 18.6], [4, 18.6], [2.6, 17]], 'B');
  g.rect(4, 6, 12, 2, 'T');
  g.rect(5, 9, 10, 8, 'A');
  const [rows, ekey] = EMBLEM[MASCOTS[id]] || EMBLEM.fox;
  const map = {};
  let n = 0;
  for (const [ch, spec] of Object.entries(ekey)) { const k = String.fromCharCode(0xe0 + n++); map[ch] = k; key[k] = spec; }
  g.stamp(6, 10, rows, map);
  return { g, key };
}

// ---------------------------------------------------------------- buildings
const BUILDINGS = {
  // Snack Bowl: a glazed bowl heaped with veggies and berries
  bowl: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 9.6, 7.6, 3.2, 'F');
    g.ellipse(6, 8, 2.4, 2.4, 'r').ellipse(9.6, 6.6, 2.6, 2.4, 'o').ellipse(13.6, 7.6, 2.4, 2.2, 'b');
    g.line(9, 4, 8, 2, 'l').line(10, 4, 11, 2, 'l');
    g.poly([[1.6, 10], [18.4, 10], [16, 16.4], [12, 18], [8, 18], [4, 16.4]], 'B');
    g.line(2, 10, 18, 10, 'R');
    g.line(4, 13, 16, 13, 'w');
    return { g, key: { F: 'tan.r@food', r: 'rose.R@r', o: 'orange.R@o', b: 'bberry.R@b', l: 'leaf:4', B: 'sky.x@bowl', R: 'white.y@rim', w: 'white:4' } };
  },
  // Bear Pantry: a cupboard with its doors open, jars and a honey pot inside
  pantry: () => {
    const g = new Grid(20, 20);
    g.poly([[4, 3], [16, 3], [17, 5], [3, 5]], 'R');
    g.rect(4, 5, 12, 13, 'W');
    g.rect(5, 6, 10, 11, 'I');
    g.rect(5, 11, 10, 1, 'S');
    g.rect(6, 8, 2, 3, 'j').rect(9, 9, 2, 2, 'h').rect(12, 8, 2, 3, 'm');
    g.rect(6, 13, 3, 3, 'h').rect(10, 14, 4, 2, 'c');
    g.rect(1, 6, 3, 11, 'D').rect(16, 6, 3, 11, 'E');
    g.set(3, 11, 'y').set(16, 11, 'y');
    g.rect(4, 18, 2, 1, 'W').rect(14, 18, 2, 1, 'W');
    return { g, key: { R: 'dwood.y@roof', W: 'wood.x@frame', I: 'dwood:1', S: 'lwood:4', j: 'rose.R@j', h: 'honey.R@h', m: 'leaf.R@m', c: 'orange.R@c', D: 'lwood.x@dl', E: 'lwood.x@dr', y: 'gold:4' } };
  },
  // Beaver Snack Bar: a striped awning over a log counter, carrot on top
  beaverbar: () => {
    const g = new Grid(20, 20);
    g.rect(3, 6, 2, 11, 'P').rect(15, 6, 2, 11, 'P');
    g.poly([[1, 2.4], [19, 2.4], [18, 6.6], [2, 6.6]], 'A');
    for (let x = 1; x < 19; x++) if (Math.floor((x - 1) / 3) % 2) for (let y = 2; y < 7; y++) if (g.get(x, y) === 'A') g.set(x, y, 'a');
    for (let x = 2; x < 18; x += 3) g.set(x, 7, 'a').set(x + 1, 7, 'A');
    g.rect(2, 12, 16, 5, 'L');
    g.ellipse(2.4, 14.4, 1.4, 2.4, 'e').ellipse(17.6, 14.4, 1.4, 2.4, 'e');
    g.line(4, 14, 15, 14, 'k');
    g.ellipse(7, 10.4, 2.4, 1.6, 'o').line(6, 9, 5, 7, 'l');
    g.ellipse(12.6, 10.6, 2.2, 1.6, 'b');
    return { g, key: { P: 'wood.x@post', A: 'red.y@aw', a: 'white.y@aw', L: 'wood.y@log', e: 'lwood.r@end', o: 'orange.R@c', l: 'leaf:4', b: 'bberry.R@b' } };
  },
  // Bug Grinder 3000: a glowing zapper lamp over a hopper with a crank
  buggrinder: () => {
    const g = new Grid(20, 20);
    g.rect(9, 1, 2, 2, 'M');
    g.rect(6, 3, 8, 6, 'Z');
    for (let x = 6; x < 14; x += 2) g.line(x, 3, x, 8, 'z');
    g.rect(5, 2, 10, 1, 'M').rect(5, 9, 10, 1, 'M');
    g.set(4, 5, 'y').set(15, 6, 'y').set(3, 4, 'y');
    g.poly([[3, 10], [17, 10], [14, 15], [6, 15]], 'H');
    g.rect(6, 15, 8, 3, 'B');
    g.rect(8, 18, 4, 1, 'g');
    g.line(15, 13, 18, 13, 'C').line(18, 13, 18, 16, 'C');
    g.set(18, 16, 'r');
    return { g, key: { M: 'steel.x@cap', Z: 'lilac.R@lamp', z: 'purple:2', y: '#fff4a0', H: 'steel.y@hop', B: 'red.x@base', g: 'leaf.R@bits', C: 'iron:4', r: 'red:3' } };
  },
  // Bunny Hutch: a bunny peeking out, ears up
  rabbit: () => {
    const g = new Grid(20, 20);
    g.ellipse(7, 5, 2.2, 5, 'E').ellipse(13, 5, 2.2, 5, 'F');
    g.ellipse(7, 5.4, 1, 3.4, 'p').ellipse(13, 5.4, 1, 3.4, 'p');
    g.ellipse(10, 13, 7, 5.6, 'H');
    g.ellipse(10, 15.4, 3.4, 2.4, 'M');
    g.stamp(6, 11, ['KK', 'wK']).stamp(12, 11, ['KK', 'Kw']);
    g.stamp(9, 14, ['pp']).set(10, 15, 'k').set(9, 16, 'k').set(11, 16, 'k');
    g.set(4, 15, 'q').set(16, 15, 'q');
    return { g, key: { E: 'furw.r@el', F: 'furw.r@er', p: 'pink:4', H: 'furw.r@head', M: 'white.r@muz', K: '#2a1a14', w: '#ffffff', q: 'pink:3' } };
  },
};

// ---------------------------------------------------------------- tools
const TOOLS = {
  // a steel scoop full of pellets
  scoop: () => {
    const g = new Grid(20, 20);
    g.line(13, 9, 18, 4, 'H').line(14, 9, 18, 5, 'H');
    g.poly([[1.6, 9.4], [14, 9.4], [12.6, 15.6], [3, 15.6]], 'S');
    g.ellipse(7.8, 9.4, 6.2, 1.6, 'R');
    for (const [x, y] of [[4, 8], [6, 7], [8, 8], [10, 7], [12, 8], [7, 6], [9, 6], [5, 9]]) g.set(x, y, 'P').set(x + 1, y, 'p');
    return { g, key: { H: 'wood.x@h', S: 'steel.x@sc', R: 'steel:5', P: 'syrup:3', p: 'syrup:2' } };
  },
  // harvest: a woven basket of produce
  harvest: () => {
    const g = new Grid(20, 20);
    for (let a = 0; a <= 20; a++) { const t = Math.PI * (a / 20); g.set(Math.round(10 - Math.cos(t) * 7), Math.round(9 - Math.sin(t) * 7), 'h'); }
    g.ellipse(6, 9, 2.6, 2.4, 'r').ellipse(10, 8, 2.6, 2.4, 'o').ellipse(14, 9, 2.4, 2.2, 'g');
    g.line(10, 6, 9, 4, 'l');
    g.poly([[1.6, 10], [18.4, 10], [16.4, 18.4], [3.6, 18.4]], 'B');
    for (let y = 11; y < 18; y++) for (let x = 2; x < 18; x++) if (g.get(x, y) === 'B' && (x + (y >> 1) * 2) % 4 === 0) g.set(x, y, 'b');
    g.line(2, 10, 17, 10, 'R');
    return { g, key: { h: 'lwood:2', r: 'red.R@r', o: 'orange.R@o', g: 'lime.R@g', l: 'leaf:4', B: 'straw.y@bk', b: 'straw:2', R: 'straw:5' } };
  },
  // a seed packet with a sprout on the front
  seed: () => {
    const g = new Grid(20, 20);
    g.poly([[4, 2], [16, 2], [16.4, 18], [3.6, 18]], 'P');
    g.rect(4, 2, 12, 2, 'F');
    for (let x = 4; x < 16; x += 2) g.set(x, 2, 'f');
    g.rect(6, 6, 8, 8, 'W');
    g.line(10, 13, 10, 9, 'S').ellipse(8.4, 9, 1.8, 1.2, 'L').ellipse(11.6, 8.4, 1.8, 1.2, 'L');
    g.rect(6, 13, 8, 1, 'd');
    g.rect(6, 15, 8, 1, 'k');
    g.set(17, 16, 'e').set(18, 17, 'e').set(17, 18, 'e');
    return { g, key: { P: 'parch.x@pk', F: 'green.y@flap', f: 'green:2', W: 'sky.f@win', S: 'leaf:2', L: 'leaf.r@l', d: 'cinnamon:2', e: 'tan:3' } };
  },
};

export const UI_ICONS = {};
for (const id of Object.keys(MASCOTS)) UI_ICONS['bag_' + id] = art(() => miniBag(id));
// produce + specials ('clover' already exists in sprites.js and stays)
for (const name of FOOD_ICON_NAMES) if (name !== 'clover') UI_ICONS[name] = () => out(foodIconPix(name) || new Pix(20, 20));
for (const [name, fn] of Object.entries({ ...BUILDINGS, ...TOOLS })) UI_ICONS[name] = art(fn);
