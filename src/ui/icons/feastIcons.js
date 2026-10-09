// [v26 feast] Glyphs for the feast event pop-ups and cards (20x20, the food-icon
// kit from ../bagArt.js: ramps, top-left shading, tinted outlines).
//   fe_karen fe_bone fe_golden fe_critic fe_cake fe_phone fe_eagle fe_sleep fe_selfie
//   fe_sneeze fe_mud fe_wrench fe_fire fe_jukebox fe_coffee fe_raccoon fe_bee fe_ring
//   fe_clipboard fe_arm fe_tear fe_cold fe_boss fe_rampage fe_dash fe_slap fe_berries
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };
const N = () => new Grid(20, 20);

const ICONS = {
  // Karen: blond bob, big shades, a stern little mouth
  fe_karen: () => {
    const g = N();
    g.ellipse(10, 10.5, 8.6, 8.4, 'H');
    g.ellipse(10, 11.5, 6.2, 6.4, 'F');
    g.rect(3, 15, 3, 4, 'H').rect(14, 15, 3, 4, 'H');
    g.rect(4, 4, 12, 3, 'H');
    g.set(13, 7, 'H').set(14, 7, 'H').set(12, 7, 'H');
    g.rect(4, 9, 5, 3, 'S').rect(11, 9, 5, 3, 'S').rect(9, 10, 2, 1, 'S');
    g.set(5, 9, '*').set(12, 9, '*');
    g.rect(8, 15, 4, 1, 'K');
    g.set(7, 14, 'K').set(12, 14, 'K');
    return { g, key: { H: 'yellow.r@h', F: 'bear.r@f', S: '#16121a', K: '#3a1a14' } };
  },
  // a fish bone stuck crosswise + a sweat drop
  fe_bone: () => {
    const g = N();
    g.line(3, 15, 15, 5, 'B');
    for (let i = 0; i < 4; i++) { const x = 6 + i * 2.4, y = 12.6 - i * 2; g.line(x - 1.6, y - 2.2, x + 1.6, y + 2.2, 'B'); }
    g.poly([[13, 3.2], [18, 2.6], [17.4, 7.8]], 'S');
    g.set(16, 4, 'K');
    g.poly([[1.2, 13.8], [4.4, 15.2], [2.6, 18.6]], 'B');
    g.ellipse(4.5, 4.6, 1.8, 2.6, 'D').set(4, 2, 'D');
    return { g, key: { B: 'bone.r@b', S: 'bone.f@s', K: '#2a1a14', D: 'sky.r@d' } };
  },
  fe_golden: () => {
    const g = N();
    g.ellipse(9.5, 10.5, 7.6, 4.8, 'G');
    g.poly([[2.6, 10.5], [0.4, 6], [0.4, 15]], 'T');
    g.poly([[7, 6.4], [11, 3.6], [12.5, 6.6]], 'T');
    g.set(14, 9, 'K').set(14, 8, '*');
    g.line(6, 8, 6, 13, 'k');
    g.set(17, 3, '*').set(18, 4, 'Y').set(16, 4, 'Y').set(17, 5, 'Y').set(17, 2, 'Y');
    return { g, key: { G: 'gold.R@g', T: 'honey.r@t', K: '#2a1a14', Y: 'yellow:5' } };
  },
  // the incognito critic: a monocle on a chain + a fat moustache
  fe_critic: () => {
    const g = N();
    g.ellipse(11.5, 7.5, 5.2, 5.2, 'M');
    g.ellipse(11.5, 7.5, 3.6, 3.6, 'L');
    g.set(10, 6, '*').set(11, 5, '*');
    g.line(15, 12, 17, 18, 'C');
    g.poly([[2, 15], [6, 12.6], [10, 14.2], [14, 12.6], [18, 15], [15, 17.4], [10, 15.6], [5, 17.4]], 'S');
    return { g, key: { M: 'gold.R@m', L: 'glass.r@l', C: 'gold:2', S: 'dkbear.r@s' } };
  },
  fe_cake: () => {
    const g = N();
    g.rect(2, 11, 16, 7, 'P');
    g.rect(2, 11, 16, 2, 'W');
    for (const x of [4, 8, 12, 16]) g.set(x, 13, 'W');
    g.rect(5, 6, 10, 5, 'P');
    g.rect(5, 6, 10, 2, 'W');
    g.set(7, 8, 'W').set(12, 8, 'W');
    g.rect(9, 2, 2, 4, 'C');
    g.set(9, 0, 'F').set(10, 1, 'F').set(9, 1, 'Y');
    g.set(5, 15, 'R').set(10, 15, 'R').set(15, 15, 'R');
    return { g, key: { P: 'pink.r@p', W: 'white.f@w', C: 'sky.r', F: 'fire:4', Y: 'yellow:5', R: 'red.r' } };
  },
  // a phone sinking: water line + bubbles
  fe_phone: () => {
    const g = N();
    g.rect(0, 11, 20, 9, 'W');
    g.rect(0, 11, 20, 1, 'w');
    g.poly([[6, 5], [12, 3], [15, 15], [9, 17]], 'P');
    g.poly([[7.4, 6], [11.4, 4.7], [13.6, 14], [9.6, 15.3]], 'S');
    g.ellipse(4, 6, 1.4, 1.4, 'b').ellipse(3, 2.6, 1, 1, 'b').ellipse(16.5, 7, 1.2, 1.2, 'b');
    return { g, key: { W: 'water.r@w', w: 'sky:5', P: 'ink.r@p', S: 'sky.R@s', b: 'ice:4' } };
  },
  // an eagle swooping with a fish
  fe_eagle: () => {
    const g = N();
    g.poly([[0.5, 5], [7, 8], [10, 7], [13, 8], [19.5, 5], [15, 10.5], [10, 12], [5, 10.5]], 'W');
    g.ellipse(10, 9.5, 2.6, 2.4, 'H');
    g.poly([[10, 10], [12, 11], [10, 12.4]], 'Y');
    g.set(9, 9, 'K');
    g.ellipse(10, 15.8, 4, 1.8, 'F');
    g.poly([[6.4, 15.8], [4.4, 14], [4.4, 17.6]], 'F');
    g.set(12, 15, 'K');
    g.line(9, 12, 9, 14, 'Y').line(11, 12, 11, 14, 'Y');
    return { g, key: { W: 'dkbear.x@w', H: 'white.r@h', Y: 'yellow.f', K: '#2a1a14', F: 'sky.r@f' } };
  },
  // asleep: a drooping eyelid face + Zz
  fe_sleep: () => {
    const g = N();
    g.ellipse(8.5, 12, 7.6, 7, 'F');
    g.ellipse(3, 6, 2.2, 2.2, 'F').ellipse(14, 6, 2.2, 2.2, 'F');
    g.ellipse(8.5, 14.6, 3.4, 2.4, 'M');
    g.line(4, 11, 7, 11, 'K').line(10, 11, 13, 11, 'K');
    g.set(8, 14, 'K').set(9, 14, 'K');
    g.rect(13, 1, 5, 1, 'Z').set(16, 2, 'Z').set(15, 3, 'Z').set(14, 4, 'Z').rect(13, 5, 5, 1, 'Z');
    g.set(18, 7, 'Z').set(19, 7, 'Z').set(18, 8, 'Z').set(18, 9, 'Z').set(19, 9, 'Z');
    return { g, key: { F: 'bear.r@f', M: 'tan.r@m', K: '#2a1a14', Z: 'sky:4' } };
  },
  // a phone on a stick with a heart + a "live" dot
  fe_selfie: () => {
    const g = N();
    g.line(4, 19, 10, 9, 'S');
    g.rect(8, 1, 9, 12, 'P');
    g.rect(9, 2, 7, 10, 'L');
    g.set(11, 5, 'H').set(13, 5, 'H').set(10, 6, 'H').set(11, 6, 'H').set(12, 6, 'H').set(13, 6, 'H').set(14, 6, 'H').set(11, 7, 'H').set(12, 7, 'H').set(13, 7, 'H').set(12, 8, 'H');
    g.ellipse(4, 4, 2.2, 2.2, 'R');
    return { g, key: { S: 'steel.r', P: 'ink.r@p', L: 'sky.R@l', H: 'pink:4', R: 'red.r@r' } };
  },
  // pollen: a flower puffing yellow dust at a nose
  fe_sneeze: () => {
    const g = N();
    for (const [x, y] of [[5, 10], [9, 10], [7, 8], [7, 12]]) g.ellipse(x, y, 2.4, 2.4, 'P');
    g.ellipse(7, 10, 1.6, 1.6, 'C');
    g.line(7, 13, 7, 19, 'G').set(8, 16, 'G').set(9, 15, 'G');
    for (const [x, y] of [[12, 6], [14, 4], [16, 7], [13, 9], [17, 3], [15, 10], [18, 9], [11, 3]]) g.set(x, y, 'Y');
    return { g, key: { P: 'pink.r@p', C: 'yellow.r', G: 'leaf.r', Y: 'yellow:4' } };
  },
  // stuck in the mud: a puddle, a paw reaching out, bubbles
  fe_mud: () => {
    const g = N();
    g.ellipse(10, 15, 9.6, 4.6, 'M');
    g.ellipse(10, 14, 6, 2, 'm');
    g.rect(8, 5, 4, 9, 'A');
    g.ellipse(10, 4.6, 3, 2.4, 'A');
    g.set(8, 2, 'A').set(10, 1, 'A').set(12, 2, 'A');
    g.ellipse(4, 12, 1.2, 1.2, 'b').ellipse(16, 13, 1, 1, 'b');
    return { g, key: { M: 'leather.r@m', m: 'leather:2', A: 'bear.r@a', b: 'tan:4' } };
  },
  fe_wrench: () => {
    const g = N();
    g.ellipse(13, 13, 5.6, 5.6, 'G');
    g.ellipse(13, 13, 2.2, 2.2, '.');
    for (const [x, y] of [[13, 6], [13, 20], [6, 13], [19, 13], [8, 8], [18, 8], [8, 18], [18, 18]]) g.ellipse(x, y, 1.6, 1.6, 'G');
    g.line(2, 17, 11, 6, 'W').line(3, 17, 12, 6, 'W');
    g.ellipse(12.5, 4.5, 3, 3, 'W');
    g.set(13, 3, '.').set(14, 4, '.').set(13, 4, '.');
    return { g, key: { G: 'brass.r@g', W: 'steel.R@w' } };
  },
  fe_fire: () => {
    const g = N();
    g.poly([[10, 0.5], [16, 8], [17, 14], [13.5, 19], [6.5, 19], [3, 14], [4, 9], [7, 11], [7.4, 5]], 'F');
    g.poly([[10, 7], [13.6, 12], [12.6, 17.6], [7.4, 17.6], [6.4, 13], [8.4, 14]], 'O');
    g.ellipse(10, 15.6, 2, 2.4, 'Y');
    return { g, key: { F: 'red.r@f', O: 'fire.r@o', Y: 'yellow:5' } };
  },
  // a music note with a crack through it
  fe_jukebox: () => {
    const g = N();
    g.rect(11, 2, 2, 12, 'N');
    g.rect(11, 2, 6, 2, 'N').rect(15, 2, 2, 10, 'N');
    g.ellipse(9, 14.5, 3.6, 2.8, 'N').ellipse(13.5, 12.6, 3, 2.4, 'N');
    g.line(4, 4, 8, 9, 'Z').line(8, 9, 6, 11, 'Z').line(6, 11, 10, 17, 'Z');
    return { g, key: { N: 'purple.R@n', Z: 'yellow:4' } };
  },
  // a coffee cup with steam (a tired beaver wants a break)
  fe_coffee: () => {
    const g = N();
    g.rect(3, 8, 11, 10, 'C');
    g.rect(3, 8, 11, 2, 'c');
    g.ellipse(15.5, 12.5, 2.8, 3, 'C');
    g.ellipse(15.5, 12.5, 1.2, 1.4, '.');
    g.rect(2, 18, 13, 1, 'S');
    g.line(6, 6, 7, 3, 'W').line(7, 3, 6, 1, 'W').line(10, 6, 11, 3, 'W').line(11, 3, 10, 1, 'W');
    return { g, key: { C: 'white.r@c', c: 'syrup:2', S: 'stone.r', W: 'glass:4' } };
  },
  fe_raccoon: () => {
    const g = N();
    g.ellipse(10, 11, 8, 7, 'F');
    g.poly([[2.5, 7], [4, 1.5], [7.5, 5]], 'F').poly([[17.5, 7], [16, 1.5], [12.5, 5]], 'F');
    g.rect(2, 9, 16, 4, 'M');
    g.ellipse(6.5, 10.5, 1.4, 1.2, '*').ellipse(13.5, 10.5, 1.4, 1.2, '*');
    g.set(6, 11, 'K').set(14, 11, 'K');
    g.ellipse(10, 15.4, 3.6, 2.4, 'W');
    g.set(9, 14, 'K').set(10, 14, 'K');
    return { g, key: { F: 'steel.r@f', M: 'black.r@m', W: 'white.r', K: '#16121a' } };
  },
  fe_bee: () => {
    const g = N();
    g.ellipse(6.5, 6, 3.4, 3, 'W').ellipse(12.5, 5.6, 3.4, 3, 'W');
    g.ellipse(10, 12, 7, 5.2, 'Y');
    for (const x of [7, 11, 15]) g.rect(x, 7, 2, 10, 'B');
    g.ellipse(3.6, 12, 2.6, 2.6, 'B');
    g.set(3, 11, '*');
    g.poly([[16.4, 11], [19.6, 12], [16.4, 13]], 'B');
    return { g, key: { W: 'glass.r@w', Y: 'yellow.R@y', B: 'black.r' } };
  },
  fe_ring: () => {
    const g = N();
    g.ellipse(10, 13, 6.4, 6, 'G');
    g.ellipse(10, 13, 4.2, 3.8, '.');
    g.poly([[10, 1], [14, 4.6], [10, 9], [6, 4.6]], 'D');
    g.line(7.4, 4.6, 12.6, 4.6, 'd');
    g.set(9, 3, '*').set(17, 2, 'Y').set(18, 3, 'Y').set(17, 4, 'Y').set(16, 3, 'Y');
    return { g, key: { G: 'gold.R@g', D: 'ice.R@d', d: 'glass:2', Y: 'yellow:5' } };
  },
  fe_clipboard: () => {
    const g = N();
    g.rect(3, 2, 14, 17, 'B');
    g.rect(5, 4, 10, 13, 'P');
    g.rect(7, 1, 6, 3, 'C');
    for (const y of [7, 10, 13]) g.rect(9, y, 5, 1, 'L');
    g.set(6, 7, 'V').set(7, 8, 'V').set(8, 6, 'V');
    g.set(6, 13, 'X').set(8, 13, 'X').set(7, 14, 'X').set(6, 15, 'X').set(8, 15, 'X');
    return { g, key: { B: 'wood.r@b', P: 'white.f@p', C: 'steel.R', L: 'slate:3', V: 'leaf:2', X: 'red:2' } };
  },
  // a flexed arm
  fe_arm: () => {
    const g = N();
    g.poly([[2, 19], [2, 12], [6, 8.4], [10, 9.6], [12.6, 6], [11, 3], [13, 1], [17, 3.4], [17.4, 8], [14, 13], [9, 15], [6, 19]], 'A');
    g.ellipse(9, 11.4, 3.4, 2.6, 'a');
    g.line(15, 2, 16, 4, 'k');
    return { g, key: { A: 'bear.r@a', a: 'tan.r' } };
  },
  // a crying cub: big wet eyes + a tear
  fe_tear: () => {
    const g = N();
    g.ellipse(10, 11.5, 8, 7.4, 'F');
    g.ellipse(4, 4.6, 2.2, 2.2, 'F').ellipse(16, 4.6, 2.2, 2.2, 'F');
    g.ellipse(10, 15, 3.2, 2.2, 'M');
    g.ellipse(6.5, 10.5, 1.8, 2, 'E').ellipse(13.5, 10.5, 1.8, 2, 'E');
    g.set(6, 9, '*').set(13, 9, '*');
    g.rect(9, 15, 2, 1, 'K');
    g.ellipse(4.6, 15.6, 1.4, 2.2, 'T');
    g.set(4, 13, 'T');
    return { g, key: { F: 'cub.r@f', M: 'tan.r', E: '#16121a', K: '#3a1a14', T: 'sky.R@t' } };
  },
  fe_cold: () => {
    const g = N();
    g.line(10, 1, 10, 19, 'S').line(2, 5.4, 18, 14.6, 'S').line(2, 14.6, 18, 5.4, 'S');
    for (const [x, y, a, b] of [[10, 4, 2, 2], [10, 16, 2, -2]]) { g.line(x, y, x - a, y - b, 'S'); g.line(x, y, x + a, y - b, 'S'); }
    g.ellipse(10, 10, 2.2, 2.2, 'I');
    return { g, key: { S: 'ice.R@s', I: 'white.r' } };
  },
  fe_boss: () => {
    const g = N();
    g.poly([[2, 16], [2, 6], [6.4, 10], [10, 3], [13.6, 10], [18, 6], [18, 16]], 'G');
    g.rect(2, 15, 16, 3, 'g');
    g.ellipse(10, 12, 1.6, 1.6, 'R').ellipse(5.4, 13, 1.2, 1.2, 'B').ellipse(14.6, 13, 1.2, 1.2, 'B');
    return { g, key: { G: 'gold.R@g', g: 'honey.r', R: 'red.R', B: 'sky.R' } };
  },
  // the cartoon anger cross-vein
  fe_rampage: () => {
    const g = N();
    for (const [x0, y0, sx, sy] of [[2, 2, 1, 1], [18, 2, -1, 1], [2, 18, 1, -1], [18, 18, -1, -1]]) {
      g.poly([[x0, y0 + sy * 5], [x0 + sx * 2, y0 + sy * 5], [x0 + sx * 5, y0 + sy * 2], [x0 + sx * 5, y0], [x0 + sx * 7, y0], [x0 + sx * 7, y0 + sy * 3], [x0 + sx * 3, y0 + sy * 7], [x0, y0 + sy * 7]], 'R');
    }
    return { g, key: { R: 'red.R@r' } };
  },
  // dine & dash: a coin running away on little legs
  fe_dash: () => {
    const g = N();
    g.ellipse(11, 8.5, 6, 6, 'C');
    g.ellipse(11, 8.5, 3.4, 3.4, 'c');
    g.line(9, 14, 7, 18, 'L').line(13, 14, 15, 17, 'L').line(15, 17, 17, 17, 'L').line(7, 18, 5, 18, 'L');
    g.line(1, 6, 4, 6, 'M').line(0, 9, 3, 9, 'M').line(1, 12, 4, 12, 'M');
    return { g, key: { C: 'gold.R@c', c: 'gold:2', L: 'ink:1', M: 'stone:4' } };
  },
  // a fish slapping (fish + impact lines)
  fe_slap: () => {
    const g = N();
    g.ellipse(9, 11, 6.4, 3.6, 'F');
    g.poly([[3, 11], [0.4, 7.4], [0.4, 14.6]], 'F');
    g.set(13, 10, 'K');
    g.line(16, 3, 18, 1, 'Y').line(17, 7, 19.6, 6, 'Y').line(13, 3, 13, 0, 'Y').line(17, 14, 19.4, 16, 'Y');
    return { g, key: { F: 'sky.r@f', K: '#2a1a14', Y: 'yellow:4' } };
  },
  // a bowl of rotten berries
  fe_berries: () => {
    const g = N();
    g.poly([[1.5, 10], [18.5, 10], [16, 17.5], [4, 17.5]], 'W');
    for (const [x, y, c] of [[5, 8, 'R'], [8, 7, 'G'], [11, 8, 'R'], [14, 7.6, 'R'], [7, 5, 'R'], [11, 4.8, 'G'], [9.4, 2.6, 'M']]) g.ellipse(x, y, 2, 2, c);
    g.line(15, 1, 16, 2, 'S').line(17, 3, 16, 4, 'S').line(3, 1, 4, 2, 'S').line(5, 3, 4, 4, 'S');
    return { g, key: { W: 'wood.r@w', R: 'cinnamon.r@r', G: 'olive.r@g', M: 'lime:4', S: 'lime:3' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
