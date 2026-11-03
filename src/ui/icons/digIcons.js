// [v32 dig] THE DIG icons (20x20, the same pixel kit as worldIcons.js), registered
// through the UI_ICONS hook (sprites.js globs ./icons/*.js):
//   dig_trowel  the section       dig_survey  Survey the Bluff    dig_brush  Camel-hair Brushes
//   dig_amber   Amber Studies     dig_map     Survey Maps         dig_lamp   Fossil Lamp
//   dig_pick    Precision Pick    dig_museum  Museum Wing         dig_vial   Primordial Vial
//   dig_deep    Deep Strata       dig_dna     Ancient Bloodlines  dig_fang   prehistoric fish
//   find_<id>   every find (src/ui/dig/findArt.js, 24x24)
import { Grid, render } from '../bagArt.js';
import { FINDS } from '../../data/digFinds.js';
import { findPix } from '../dig/findArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

const ICONS = {
  // a pointed archaeologist's trowel stuck in a little mound
  dig_trowel: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 19], [5, 14], [9, 13], [15, 14], [19, 19]], 'D');
    g.poly([[6, 11], [12, 2], [15, 6], [9, 13]], 'B');
    g.line(12, 3, 9, 12, 'b');
    g.rect(8, 12, 2, 2, 'F').line(4, 15, 7, 12, 'H').line(3, 16, 6, 13, 'H');
    g.set(13, 5, 'h');
    for (const [x, y] of [[4, 17], [11, 16], [16, 17], [8, 18]]) g.set(x, y, 'p');
    return { g, key: { D: '~6a4a2e.r@d', B: 'steel.R@b', b: 'steel:2', F: 'brass.R', H: 'wood.R@h', h: '#ffffff', p: 'stone:4' } };
  },
  // a bluff with stripes and a magnifier over a bone
  dig_survey: () => {
    const g = new Grid(20, 20);
    g.poly([[0, 19], [0, 6], [6, 4], [13, 6], [19, 4], [19, 19]], 'S');
    const C = ['A', 'B', 'C', 'D'];
    for (let y = 6; y < 20; y++) for (let x = 0; x < 20; x++) if (g.get(x, y) === 'S') g.set(x, y, C[Math.floor((y + x * 0.15) / 3.6) % 4]);
    g.line(3, 13, 8, 12, 'W').line(3, 14, 8, 13, 'W');
    g.ellipse(12.5, 10.5, 4.4, 4.4, 'G'); g.ellipse(12.5, 10.5, 2.9, 2.9, 'L');
    g.line(15, 14, 18, 18, 'H').line(16, 14, 19, 17, 'H');
    g.set(11, 9, 'h');
    return { g, key: { A: 'sand.x@s', B: '~c8883a.x@s', C: 'stone.x@s', D: 'red.x@s', W: 'bone:5!', G: 'brass.R@g', L: 'glass.R', H: 'wood.R', h: '#ffffff' } };
  },
  // a camel-hair brush sweeping dust off a bone
  dig_brush: () => {
    const g = new Grid(20, 20);
    g.line(2, 16, 17, 15, 'O').line(2, 17, 17, 16, 'O');
    g.ellipse(2.5, 16.5, 1.8, 1.8, 'O'); g.ellipse(17, 15.5, 1.8, 1.8, 'O');
    g.line(15, 2, 8, 9, 'H').line(16, 3, 9, 10, 'H');
    g.rect(6, 9, 3, 3, 'F');
    g.poly([[4, 11], [7, 10], [9, 13], [6, 16], [3, 14]], 'K');
    for (const [x, y] of [[10, 12], [12, 11], [11, 9], [13, 13]]) g.set(x, y, 'p');
    return { g, key: { O: 'bone.r@o', H: 'wood.R@h', F: 'brass.R', K: 'leather.r@k', p: 'sand:4!' } };
  },
  // a lump of amber with a little mosquito in it
  dig_amber: () => {
    const g = new Grid(20, 20);
    g.poly([[3, 9], [7, 3], [13, 2], [18, 7], [17, 14], [11, 18], [5, 16], [2, 12]], 'A');
    g.ellipse(11, 11, 4, 3.4, 'D', ['A']);
    g.line(8, 10, 12, 10, 'k').line(9, 10, 8, 13, 'k').line(11, 10, 12, 13, 'k').line(10, 10, 8, 7, 'k').line(10, 10, 12, 7, 'k');
    g.set(6, 6, 'h').set(7, 5, 'h').set(15, 14, 'w');
    return { g, key: { A: 'honey.R@a', D: 'syrup.R@a', k: '#3a1a08', h: '#fffbe0', w: '#ffe9a8' } };
  },
  // Snapp's map: a coffee-stained parchment with a dashed trail and a red X
  dig_map: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 4], [7, 2], [13, 4], [19, 2], [19, 17], [13, 19], [7, 17], [1, 19]], 'P');
    g.line(7, 2, 7, 17, 'f').line(13, 4, 13, 19, 'f');
    for (let k = 0; k < 7; k++) g.set(3 + k * 2, 14 - Math.round(Math.sin(k) * 3), 'T');
    g.line(14, 7, 17, 10, 'R').line(17, 7, 14, 10, 'R');
    g.ellipse(5, 7, 2.4, 2, 'c', ['P', 'f']);
    return { g, key: { P: 'parch.r@p', f: 'parch:1', T: 'leather:2!', R: 'red.R', c: 'syrup:4' } };
  },
  // a UV lamp: a purple glow over a hidden bone
  dig_lamp: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 19], [1, 12], [19, 12], [19, 19]], 'S');
    g.line(4, 16, 13, 15, 'U').line(4, 17, 13, 16, 'U').set(14, 15, 'U').set(3, 16, 'U');
    g.poly([[6, 2], [14, 2], [16, 6], [4, 6]], 'C');
    g.poly([[4, 6], [16, 6], [18, 10], [2, 10]], 'L');
    g.line(9, 0, 11, 0, 'C');
    g.where('S', 'V', (x, y) => y < 15 && x > 2 && x < 17);
    return { g, key: { S: '~6a4a2e.r@s', V: 'purple:2', U: 'lilac:5!', C: 'iron.R', L: 'purple.R' } };
  },
  // a fine pick, the tip glinting
  dig_pick: () => {
    const g = new Grid(20, 20);
    g.line(4, 18, 13, 6, 'H').line(5, 18, 14, 6, 'H');
    g.poly([[7, 3], [13, 4], [19, 9], [13, 6], [8, 6], [3, 8]], 'S');
    g.set(18, 8, 'h').set(19, 9, 'h');
    return { g, key: { H: 'wood.R@h', S: 'steel.R@s', h: '#ffffff' } };
  },
  // a little museum front with columns
  dig_museum: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 7], [10, 1], [19, 7]], 'R');
    g.rect(1, 7, 19, 2, 'B').rect(1, 17, 19, 2, 'B');
    for (const x of [2, 7, 12, 17]) g.rect(x, 9, 2, 8, 'C');
    g.ellipse(10, 4.6, 1.6, 1.3, 'G');
    return { g, key: { R: 'stone.R@r', B: 'stone.x@b', C: 'white.x@c', G: 'gold.R' } };
  },
  // the Primordial Vial: amber-green swirl, a cork, a bone tag
  dig_vial: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 13, 6, 6, 'G'); g.rect(8, 3, 4, 6, 'G');
    g.rect(8, 1, 4, 2, 'C');
    g.ellipse(10, 14, 4.4, 4, 'L', ['G']);
    g.line(7, 13, 12, 16, 'A').line(8, 11, 13, 14, 'A').set(9, 15, 'y').set(12, 12, 'y');
    g.set(7, 10, 'h').set(7, 11, 'h');
    g.line(12, 4, 16, 7, 'k').rect(15, 7, 3, 2, 'T');
    return { g, key: { G: 'glass.R@g', L: 'lime.R@l', A: 'honey:4!', y: '#fffbe0', C: 'leather.R', h: '#ffffff', T: 'bone.r', k: 'leather:1' } };
  },
  // deep strata: layers going down, a glinting gem at the bottom
  dig_deep: () => {
    const g = new Grid(20, 20);
    const C = ['A', 'B', 'C', 'D', 'E'];
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) g.set(x, y, C[Math.min(4, Math.floor((y + Math.sin(x * 0.5) * 1.2) / 4))]);
    g.poly([[7, 13], [13, 13], [10, 19]], 'R');
    g.line(10, 1, 10, 11, 'v').line(9, 9, 10, 11, 'v').line(11, 9, 10, 11, 'v');
    return { g, key: { A: 'sand.x@a', B: '~c8883a.x@b', C: 'stone.x@c', D: 'slate.x@d', E: 'navy.x@e', R: 'red.R', v: '#fffbe0' } };
  },
  // ancient bloodlines: a fish skeleton turning into a fish
  dig_dna: () => {
    const g = new Grid(20, 20);
    g.ellipse(12, 10, 6.5, 4.5, 'F');
    g.poly([[5, 10], [1, 6], [1, 14]], 'F');
    g.where('F', 'B', (x) => x < 10);
    for (let x = 4; x < 10; x += 2) g.set(x, 7, 'k').set(x, 13, 'k').line(x, 7, x, 13, 'b');
    g.line(2, 10, 17, 10, 'b');
    g.set(15, 9, 'k');
    g.poly([[14, 12], [16, 15], [17, 12]], 'W');
    return { g, key: { F: 'teal.R@f', B: 'bone.r@f', b: 'bone:2', W: '#fffdf4', k: '#1a1a20' } };
  },
  // a fang (prehistoric fish chip)
  dig_fang: () => {
    const g = new Grid(20, 20);
    g.poly([[6, 2], [14, 2], [12, 9], [10, 19], [8, 9]], 'A');
    g.rect(5, 1, 10, 3, 'R');
    g.line(9, 5, 10, 15, 'h');
    return { g, key: { A: 'bone.x@a', R: 'red.R', h: '#fffdf4' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
for (const F of FINDS) UI_ICONS['find_' + F.id] = () => out(findPix(F.id, 1));
