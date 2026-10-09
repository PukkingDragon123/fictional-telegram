// [v26 resort] Bear Resort icons (20x20, the bagArt.js pixel kit: ramps, top-left
// shading, tinted outlines), registered through the UI_ICONS hook (sprites.js
// globs ./icons/*.js):
//   rs_tab (Build tab)  rs_tub rs_ticket rs_restroom rs_bench rs_infoboard rs_umbrella
//   rs_icecream rs_souvenir rs_photo rs_campfire rs_firstaid rs_towel rs_lockers
//   rs_sauna rs_spa rs_massage rs_path rs_boardwalk rs_erase
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key, opt } = fn(); return out(render(g, key, opt)); };

// little rising steam curl (3 px wide), top at (x, y)
function steam(g, x, y, ch = 's') {
  g.stamp(x, y, ['.s.', 's..', '.s.', '..s', '.s.'], { s: ch });
  return g;
}

const ICONS = {
  // Resort tab: a bubbling tub with a striped towel over the rim
  rs_tab: () => {
    const g = new Grid(20, 20);
    steam(g, 5, 1); steam(g, 12, 0);
    g.ellipse(10, 11, 8.6, 2.6, 'W');
    g.rect(2, 11, 17, 6, 'T');
    g.ellipse(10, 16.6, 8.4, 1.8, 'T');
    for (let x = 3; x < 18; x += 3) g.line(x, 12, x, 17, 'b');
    g.ellipse(10, 10.6, 7, 1.6, 'w');
    g.set(6, 10, 'o').set(12, 9, 'o').set(14, 10, 'o');
    g.rect(13, 10, 3, 6, 'R').rect(13, 12, 3, 1, 'r').rect(13, 14, 3, 1, 'r');
    return { g, key: { s: 'white:4!', W: 'water.R@wr', w: 'sky:4', o: '#ffffff', T: 'lwood.y@tub', b: 'wood:1', R: 'red.y@tw', r: 'white.y@tw' } };
  },
  // a bear soaking up to its chin, steam rising
  rs_tub: () => {
    const g = new Grid(20, 20);
    steam(g, 3, 0); steam(g, 15, 1);
    g.ellipse(7, 4.6, 1.8, 1.8, 'E').ellipse(13, 4.6, 1.8, 1.8, 'E');
    g.ellipse(10, 8, 4.6, 3.8, 'H');
    g.ellipse(10, 9.6, 2.2, 1.6, 'M');
    g.set(8, 7, 'K').set(12, 7, 'K').set(10, 9, 'K');
    g.ellipse(10, 12, 9, 2.4, 'W');
    g.ellipse(10, 11.8, 7.6, 1.4, 'w');
    g.rect(1, 12, 18, 5, 'T');
    g.ellipse(10, 17, 8.8, 1.6, 'T');
    for (let x = 3; x < 18; x += 3) g.line(x, 13, x, 17, 'b');
    g.set(4, 11, 'o').set(15, 12, 'o');
    return { g, key: { s: 'white:4!', E: 'bear.r@ear', H: 'bear.r@head', M: 'tan.r@muz', K: '#2a1a14', W: 'water.R@wr', w: 'sky:4', o: '#ffffff', T: 'lwood.y@tub', b: 'wood:1' } };
  },
  // an admit-one ticket stub with a star and a punched hole
  rs_ticket: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 5], [18, 3], [18.6, 15], [2.6, 17]], 'T');
    for (const [x, y] of [[2, 8], [2, 12], [18, 6], [18, 11]]) g.set(x, y, '.');
    g.line(13, 4, 14, 15, 'p');
    g.stamp(5, 7, ['..y..', '.yyy.', 'yyyyy', '.y.y.'], { y: 'Y' });
    g.rect(5, 12, 6, 1, 'k').rect(5, 14, 4, 1, 'k');
    g.ellipse(16, 10, 1, 1, '.');
    return { g, key: { T: 'orange.f@tk', p: 'orange:1', Y: 'yellow.R@st', k: 'orange:1' } };
  },
  // Bear Necessities: a little outhouse with a moon on the door
  rs_restroom: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 6], [10, 1], [18, 6]], 'R');
    g.rect(4, 6, 12, 12, 'W');
    g.rect(6, 7, 8, 11, 'D');
    g.stamp(8, 8, ['.mm', 'm..', 'm..', '.mm'], { m: 'm' });
    g.set(13, 13, 'k');
    g.rect(3, 18, 14, 1, 'g');
    return { g, key: { R: 'red.y@roof', W: 'wood.x@wall', D: 'lwood.x@door', m: '#2a1a14', k: 'gold:4', g: 'leaf:3' } };
  },
  // a green park bench, cast-iron legs
  rs_bench: () => {
    const g = new Grid(20, 20);
    g.rect(2, 5, 16, 2, 'S').rect(2, 8, 16, 2, 'S');
    g.rect(1, 11, 18, 2, 'B');
    g.rect(3, 13, 2, 5, 'L').rect(15, 13, 2, 5, 'L');
    g.rect(3, 4, 2, 9, 'L').rect(15, 4, 2, 9, 'L');
    g.line(2, 17, 5, 17, 'L').line(14, 17, 17, 17, 'L');
    return { g, key: { S: 'green.x@bk', B: 'green.y@seat', L: 'iron.x@leg' } };
  },
  // a resort map on two posts: dotted path to a red X
  rs_infoboard: () => {
    const g = new Grid(20, 20);
    g.rect(4, 12, 2, 7, 'P').rect(14, 12, 2, 7, 'P');
    g.rect(1, 2, 18, 12, 'F');
    g.rect(2, 3, 16, 10, 'M');
    g.ellipse(7, 9, 3, 2.2, 'w');
    for (const [x, y] of [[4, 5], [6, 5], [8, 6], [10, 7], [12, 8]]) g.set(x, y, 'k');
    g.stamp(13, 8, ['x.x', '.x.', 'x.x'], { x: 'X' });
    return { g, key: { P: 'wood.x@post', F: 'dwood.f@fr', M: 'parch.f@map', w: 'water:4', k: 'dwood:2', X: 'red:3' } };
  },
  // a striped parasol over a deck chair
  rs_umbrella: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 8], [10, 1], [19, 8]], 'A');
    for (let y = 1; y <= 8; y++) for (let x = 1; x < 19; x++) if (g.get(x, y) === 'A' && Math.floor((x - 1 + y * 0.2) / 3) % 2) g.set(x, y, 'a');
    g.line(10, 8, 10, 18, 'P');
    g.poly([[3, 12], [8, 12], [14, 16], [12, 17], [7, 14], [3, 14]], 'C');
    g.line(4, 14, 3, 18, 'L').line(12, 17, 13, 18, 'L');
    return { g, key: { A: 'red.y@um', a: 'white.y@um', P: 'steel:3', C: 'sky.x@ch', L: 'lwood:2' } };
  },
  // two scoops (strawberry + mint) on a waffle cone, a cherry on top
  rs_icecream: () => {
    const g = new Grid(20, 20);
    g.poly([[5, 10], [15, 10], [10, 19]], 'C');
    for (let y = 11; y < 18; y++) for (let x = 5; x < 16; x++) if (g.get(x, y) === 'C' && (x + y) % 3 === 0) g.set(x, y, 'c');
    g.ellipse(10, 9, 5.2, 2.8, 'G');
    g.ellipse(10, 5.4, 4.2, 3, 'P');
    g.set(6, 11, 'G').set(13, 11, 'G').set(9, 11, 'G');
    g.ellipse(10, 1.8, 1.3, 1.3, 'R');
    return { g, key: { C: 'straw.y@cone', c: 'straw:2', G: 'mint.R@mint', P: 'pink.R@straw', R: 'red.R@ch' } };
  },
  // a felt pennant with a fish on it
  rs_souvenir: () => {
    const g = new Grid(20, 20);
    g.rect(2, 2, 2, 17, 'S');
    g.poly([[4, 3], [19, 8.5], [4, 14]], 'F');
    g.rect(4, 3, 1, 11, 'f');
    g.stamp(7, 7, ['.ww..w', 'wwwwww', '.ww..w'], { w: 'w' });
    g.set(8, 7, 'K');
    return { g, key: { S: 'lwood.x@st', F: 'navy.y@pen', f: 'white:4', w: 'yellow:4', K: '#2a1a14' } };
  },
  // a photo strip of grinning frames, a flash spark
  rs_photo: () => {
    const g = new Grid(20, 20);
    g.rect(5, 1, 9, 18, 'W');
    for (let i = 0; i < 4; i++) {
      g.rect(6, 2 + i * 4, 7, 3, 'p');
      g.ellipse(9.5, 3.6 + i * 4, 1.8, 1.4, 'B');
      g.set(9, 3 + i * 4, 'K').set(10, 3 + i * 4, 'K');
    }
    g.stamp(14, 1, ['..y..', '..y..', 'yyyyy', '..y..', '..y..'], { y: 'Y' });
    return { g, key: { W: 'white.f@strip', p: 'sky:4', B: 'bear.r@b', K: '#2a1a14', Y: '#fff4a0' } };
  },
  // crossed logs, flames, a marshmallow on a stick
  rs_campfire: () => {
    const g = new Grid(20, 20);
    g.poly([[10, 3], [14, 10], [12, 14], [8, 14], [6, 10]], 'F');
    g.poly([[10, 7], [12, 11], [11, 14], [9, 14], [8, 11]], 'f');
    g.line(2, 17, 17, 13, 'L').line(2, 16, 17, 12, 'L');
    g.line(3, 13, 18, 17, 'l').line(3, 12, 18, 16, 'l');
    for (const x of [1, 4, 15, 18]) g.set(x, 18, 'S');
    g.line(19, 2, 13, 8, 'k');
    g.ellipse(13.4, 7.4, 1.6, 1.4, 'M');
    return { g, key: { F: 'fire.R@fl', f: 'fire:5', L: 'wood.x@l1', l: 'lwood.x@l2', S: 'stone:3', k: 'lwood:3', M: 'cream:4' } };
  },
  // white tent with a red cross
  rs_firstaid: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 18], [10, 2], [19, 18]], 'T');
    g.poly([[7, 18], [10, 10], [13, 18]], 'D');
    g.rect(8, 5, 4, 2, 'R').rect(9, 4, 2, 4, 'R');
    g.line(10, 1, 10, 3, 'P');
    return { g, key: { T: 'white.y@tent', D: 'slate:2', R: 'red:3', P: 'wood:3' } };
  },
  // a stack of folded striped towels
  rs_towel: () => {
    const g = new Grid(20, 20);
    const stack = [['B', 'b'], ['R', 'r'], ['Y', 'y']];
    stack.forEach(([a, b], i) => {
      const y = 13 - i * 5;
      g.rect(3 + i, y, 14 - i, 5, a);
      g.rect(3 + i, y + 2, 14 - i, 1, b);
      g.ellipse(17 - i * 0.2, y + 2.5, 1.4, 2.5, a);
    });
    return { g, key: { B: 'sky.y@t1', b: 'white:4', R: 'pink.y@t2', r: 'white:4', Y: 'yellow.y@t3', y: 'white:4' } };
  },
  // a striped beach hut with a peaked roof
  rs_lockers: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 7], [10, 1], [18, 7]], 'R');
    g.rect(4, 7, 12, 11, 'W');
    for (let x = 4; x < 16; x++) if (Math.floor((x - 4) / 2) % 2) for (let y = 7; y < 18; y++) g.set(x, y, 'w');
    g.rect(8, 10, 4, 8, 'D');
    g.set(11, 14, 'k');
    g.rect(3, 18, 14, 1, 'S');
    return { g, key: { R: 'navy.y@roof', W: 'sky.x@wall', w: 'white.x@wall', D: 'lwood.x@door', k: 'gold:4', S: 'sand:3' } };
  },
  // sauna bucket with ladle and a big puff of steam
  rs_sauna: () => {
    const g = new Grid(20, 20);
    g.ellipse(6, 4, 3.4, 2.6, 's').ellipse(11, 3, 3.6, 2.8, 's').ellipse(15, 5, 2.8, 2.2, 's');
    g.poly([[3, 10], [15, 10], [14, 18], [4, 18]], 'B');
    g.rect(3, 12, 12, 1, 'h').rect(4, 16, 10, 1, 'h');
    g.ellipse(9, 10, 6, 1.4, 'W');
    g.line(12, 10, 18, 6, 'L').line(13, 10, 18, 7, 'L');
    return { g, key: { s: 'white.r@st!', B: 'lwood.x@bk', h: 'iron:4', W: 'water:4', L: 'wood.x@ld' } };
  },
  // a bear face with cucumber slices on its eyes
  rs_spa: () => {
    const g = new Grid(20, 20);
    g.ellipse(4.6, 4.6, 2.4, 2.4, 'E').ellipse(15.4, 4.6, 2.4, 2.4, 'E');
    g.ellipse(10, 11, 8, 7.4, 'H');
    g.rect(2, 3, 16, 3, 'T');
    g.ellipse(10, 14.6, 3.6, 2.6, 'M');
    g.set(10, 13, 'K').set(9, 16, 'K').set(10, 16, 'K').set(11, 16, 'K');
    for (const cx of [6.4, 13.6]) { g.ellipse(cx, 9.6, 2.6, 2.6, 'C'); g.ellipse(cx, 9.6, 1.6, 1.6, 'c'); }
    return { g, key: { E: 'bear.r@ear', H: 'bear.r@head', T: 'white.y@tw', M: 'tan.r@muz', K: '#2a1a14', C: 'green:3', c: 'lime:4' } };
  },
  // a padded massage chair buzzing away
  rs_massage: () => {
    const g = new Grid(20, 20);
    g.rect(6, 2, 8, 10, 'B');
    g.rect(4, 11, 12, 4, 'S');
    g.rect(3, 9, 3, 6, 'A').rect(14, 9, 3, 6, 'A');
    g.rect(6, 15, 8, 3, 'F');
    g.line(1, 3, 2, 5, 'v').line(1, 7, 2, 9, 'v').line(18, 3, 17, 5, 'v').line(18, 7, 17, 9, 'v');
    return { g, key: { B: 'red.R@back', S: 'red.y@seat', A: 'iron.x@arm', F: 'iron.y@base', v: 'yellow:4' } };
  },
  // a winding dirt path through grass
  rs_path: () => {
    const g = new Grid(20, 20);
    g.rect(0, 0, 20, 20, 'G');
    g.poly([[6, 0], [11, 0], [9, 6], [13, 11], [12, 20], [6, 20], [7, 12], [4, 6]], 'P');
    for (const [x, y] of [[8, 3], [10, 9], [8, 14], [10, 17], [7, 8]]) g.set(x, y, 'p');
    for (const [x, y] of [[2, 3], [15, 5], [16, 15], [3, 16]]) g.set(x, y, 'f');
    return { g, key: { G: 'leaf.f@gr', P: 'sand.f@p', p: 'stone:3', f: 'yellow:4' }, opt: { ol: false } };
  },
  // plank boardwalk on posts over water
  rs_boardwalk: () => {
    const g = new Grid(20, 20);
    g.rect(0, 10, 20, 10, 'W');
    for (const [x, y] of [[2, 15], [12, 17], [16, 13]]) g.set(x, y, 'w').set(x + 1, y, 'w');
    g.rect(1, 6, 18, 5, 'D');
    for (let x = 1; x < 19; x += 3) g.line(x, 6, x, 10, 'd');
    g.rect(3, 11, 2, 5, 'P').rect(15, 11, 2, 5, 'P');
    return { g, key: { W: 'water.f@w', w: 'sky:4', D: 'lwood.y@deck', d: 'wood:1', P: 'wood.x@post' } };
  },
  // a pink eraser block (the Path tool's "remove" swatch)
  rs_erase: () => {
    const g = new Grid(20, 20);
    g.poly([[3, 11], [11, 3], [17, 9], [9, 17]], 'E');
    g.poly([[9, 17], [17, 9], [17, 11], [9, 19]], 'e');
    g.poly([[3, 11], [9, 17], [9, 19], [3, 13]], 'B');
    g.line(6, 8, 13, 15, 'b');
    return { g, key: { E: 'pink.F@er', e: 'pink:2', B: 'sky.y@sl', b: 'sky:2' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
