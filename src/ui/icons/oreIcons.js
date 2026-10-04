// [F&S mining] Ore, ingot and part icons + mining tool icons (20x20, the same
// pixel kit, ramps and outlines as foodIcons.js / forestIcons.js):
//   res_stone res_coal res_copper res_iron res_gold res_crystal
//   res_ingot_copper res_ingot_iron res_ingot_gold res_gear res_plate res_circuit
//   pickaxe drillhelmet hardhat lunchbox minecart oreshed mine drill excavator
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };
const sparkle = (g, x, y, ch = '*') => g.set(x, y, ch).set(x - 1, y, ch).set(x + 1, y, ch).set(x, y - 1, ch).set(x, y + 1, ch);

// a lumpy rock with ore flecks of `fleck` in it
function oreRock(rock, fleck, glint, seed = 1) {
  const g = new Grid(20, 20);
  g.poly([[2, 15], [3.4, 8.6], [7.6, 4.4], [13, 3.6], [17.4, 7.6], [18.6, 13.6], [16, 18], [5, 18.4]], 'R');
  g.line(8, 10, 12, 13, 'k').line(12, 13, 15, 12, 'k');
  const spots = [[6, 8], [11, 6], [14, 9], [7, 14], [10, 10], [15, 15], [5, 11], [12, 16]];
  spots.forEach(([x, y], i) => {
    if ((i + seed) % 4 === 3) return;
    g.rect(x, y, 2, 2, 'F').set(x, y, 'f');
  });
  return { g, key: { R: rock, F: fleck, f: glint } };
}
// an ingot: a trapezoid bar seen from the front-top
function ingot(mat, hi) {
  const g = new Grid(20, 20);
  g.poly([[4.6, 7], [15.4, 7], [18.6, 15.4], [1.4, 15.4]], 'B');
  g.poly([[4.6, 7], [15.4, 7], [16.4, 9.6], [3.6, 9.6]], 'T');
  g.line(4, 10, 16, 10, 'k');
  g.line(6, 8, 11, 8, 'h');
  // a stacked one behind
  g.poly([[6, 3.4], [14, 3.4], [15.4, 6.6], [4.6, 6.6]], 'C');
  g.line(7, 4, 10, 4, 'h');
  return { g, key: { B: mat + '.y@b', T: mat + '.F@t', C: mat + '.F@c', h: hi } };
}

const ICONS = {
  res_stone: () => {
    const g = new Grid(20, 20);
    g.poly([[1.6, 17], [3, 11], [7, 8.4], [10.4, 10.6], [11, 17.6]], 'A');
    g.poly([[8.6, 17.4], [9.4, 9.8], [13.4, 5.6], [17.6, 8], [18.6, 16.6]], 'B');
    g.line(13, 9, 15, 13, 'k').line(5, 12, 7, 15, 'k');
    return { g, key: { A: 'stone.r@a', B: 'stone.r@b' } };
  },
  res_coal: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 16], [4, 9], [9, 6], [12.4, 9], [11.6, 17.6], [4, 18]], 'A');
    g.poly([[10, 17.6], [11, 8.8], [15, 5.6], [18.4, 10], [17.6, 17]], 'B');
    g.set(6, 9, '*').set(7, 10, 'g').set(14, 8, '*').set(15, 9, 'g').set(13, 13, 'g');
    return { g, key: { A: 'black.R@a', B: 'black.R@b', g: 'slate:4' } };
  },
  res_copper: () => oreRock('stone.r@r', 'copper.R@f', 'copper:5', 0),
  res_iron: () => oreRock('slate.r@r', '~c08a6e.R@f', '~f0c0a8', 1),
  res_gold: () => {
    const g = new Grid(20, 20);
    g.poly([[2.6, 14.6], [5, 8.6], [10, 6.4], [13.6, 9], [12, 15.4], [6, 17.4]], 'G');
    g.ellipse(15, 14, 3.6, 3.2, 'H');
    g.ellipse(13, 5, 2.4, 2.2, 'H');
    sparkle(g, 7, 9);
    g.set(15, 12, '*');
    return { g, key: { G: 'gold.R@g', H: 'gold.R@h' } };
  },
  res_crystal: () => {
    const g = new Grid(20, 20);
    g.poly([[7, 18], [5.6, 8], [8.4, 2.4], [11, 8], [10.4, 18]], 'A');
    g.poly([[10, 18], [11.4, 10], [15.6, 5.6], [16.4, 12], [13.6, 18]], 'B');
    g.poly([[3, 18], [2.4, 13], [4.6, 10.4], [6.6, 14], [6.4, 18]], 'C');
    g.line(8, 4, 8, 16, 'h').line(14, 8, 13, 16, 'h');
    g.rect(2, 18, 14, 1, 'S');
    sparkle(g, 16, 2);
    return { g, key: { A: 'lilac.F@a', B: 'purple.F@b', C: 'lilac.F@c', h: 'lilac:5', S: 'stone:2' } };
  },
  res_ingot_copper: () => ingot('copper', 'copper:5'),
  res_ingot_iron: () => ingot('steel', 'steel:5'),
  res_ingot_gold: () => ingot('gold', 'gold:5'),
  res_gear: () => {
    const g = new Grid(20, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = 10 + Math.cos(a) * 7.4, cy = 10 + Math.sin(a) * 7.4;
      g.ellipse(cx, cy, 1.9, 1.9, 'G');
    }
    g.ellipse(10, 10, 7, 7, 'G');
    g.ellipse(10, 10, 2.6, 2.6, '.');
    g.ellipse(10, 10, 4.4, 4.4, 'g', 'G');
    g.ellipse(10, 10, 2.6, 2.6, '.');
    return { g, key: { G: 'brass.r@g', g: 'brass:2' } };
  },
  res_plate: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 8], [12, 4], [18, 8.6], [8, 13]], 'T');
    g.poly([[2, 8], [8, 13], [8, 15.4], [2, 10.4]], 'L');
    g.poly([[8, 13], [18, 8.6], [18, 11], [8, 15.4]], 'R');
    g.poly([[2, 12], [12, 8], [18, 12.6], [8, 17]], 'T', '.');
    g.set(6, 8, '*').set(7, 8, '*').set(5, 9, 'h');
    g.set(5, 8, 'n').set(14, 8, 'n');
    return { g, key: { T: 'steel.F@t', L: 'steel:1', R: 'steel:2', h: 'steel:5', n: 'iron:3' } };
  },
  res_circuit: () => {
    const g = new Grid(20, 20);
    g.rect(2, 3, 16, 14, 'B');
    g.line(4, 6, 9, 6, 't').line(9, 6, 9, 10, 't').line(4, 13, 14, 13, 't').line(14, 13, 14, 5, 't');
    g.rect(10, 8, 5, 4, 'C');
    for (let i = 0; i < 3; i++) { g.set(11 + i * 1.5, 7, 'p'); g.set(11 + i * 1.5, 12, 'p'); }
    g.set(4, 6, 'L').set(4, 13, 'R').set(16, 15, 'L');
    return { g, key: { B: 'green.f@b', t: 'gold:4', C: 'black.F@c', p: 'steel:4', L: '#ff6060', R: '#7cff9a' } };
  },
  pickaxe: () => {
    const g = new Grid(20, 20);
    g.line(5, 18, 13, 6, 'H').line(6, 18, 14, 6, 'H');
    g.poly([[2, 6.4], [6, 2.6], [11, 1.6], [16.6, 3], [19, 7.6], [16, 6.2], [11, 4.6], [6, 5.6]], 'M');
    g.line(6, 3, 12, 2, 'h');
    return { g, key: { H: 'wood.x@h', M: 'steel.r@m', h: 'steel:5' } };
  },
  drillhelmet: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 14], [3.6, 8], [10, 4.4], [16.4, 8], [18, 14]], 'Y');
    g.rect(1, 14, 18, 3, 'B');
    g.ellipse(10, 9, 2.8, 2.8, 'L');
    g.ellipse(10, 9, 1.4, 1.4, 'l');
    g.poly([[13, 6], [18.6, 1.4], [19.2, 3], [14.6, 8]], 'D');
    g.line(15, 4, 17, 6, 'k');
    return { g, key: { Y: 'yellow.R@y', B: 'yellow:2', L: 'steel.r@l', l: '#fffbd0', D: 'steel.x@d' } };
  },
  hardhat: () => {
    const g = new Grid(20, 20);
    g.poly([[3, 14], [4, 8], [10, 4], [16, 8], [17, 14]], 'Y');
    g.rect(1, 14, 18, 3, 'B');
    g.line(10, 5, 10, 13, 'k');
    g.set(6, 8, 'h').set(7, 7, 'h');
    return { g, key: { Y: 'orange.R@y', B: 'orange:2', h: 'orange:5' } };
  },
  lunchbox: () => {
    const g = new Grid(20, 20);
    g.rect(2, 8, 16, 10, 'B');
    g.rect(2, 8, 16, 3, 'T');
    g.rect(7, 3, 6, 2, 'H').rect(7, 4, 1, 4, 'H').rect(12, 4, 1, 4, 'H');
    g.rect(8, 12, 4, 3, 'L');
    g.line(2, 11, 17, 11, 'k');
    return { g, key: { B: 'red.y@b', T: 'red.F@t', H: 'steel:3', L: 'steel.f@l' } };
  },
  minecart: () => {
    const g = new Grid(20, 20);
    g.poly([[1.4, 6.6], [18.6, 6.6], [16.4, 14.4], [3.6, 14.4]], 'C');
    g.line(2, 9, 17, 9, 'k');
    g.ellipse(4, 6, 2.6, 2, 'O').ellipse(9, 5, 3, 2.4, 'P').ellipse(14, 5.6, 2.8, 2.2, 'O');
    g.ellipse(6, 16, 2.2, 2.2, 'W').ellipse(14, 16, 2.2, 2.2, 'W');
    g.rect(0, 18, 20, 1, 'r');
    return { g, key: { C: 'iron.f@c', O: 'black.R@o', P: 'copper.R@p', W: 'steel.r@w', r: 'wood:2' } };
  },
  oreshed: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 9], [10, 2], [19, 9]], 'R');
    g.rect(3, 9, 14, 9, 'W');
    g.rect(7, 11, 6, 7, 'D');
    g.ellipse(10, 17, 3.4, 1.6, 'O');
    g.set(8, 16, 'g').set(11, 16, 'c');
    return { g, key: { R: 'red.f@r', W: 'lwood.y@w', D: 'dwood.f@d', O: 'stone.r@o', g: 'gold:4', c: 'copper:4' } };
  },
  mine: () => {
    const g = new Grid(20, 20);
    g.poly([[0, 19], [2, 9], [7, 3], [13, 3], [18, 9], [20, 19]], 'M');
    g.poly([[5, 19], [5, 11], [10, 7.4], [15, 11], [15, 19]], 'D');
    g.rect(4, 10, 2, 9, 'P').rect(14, 10, 2, 9, 'P').rect(4, 9, 12, 2, 'P');
    g.rect(6, 18, 8, 1, 'r');
    g.set(10, 13, 'L');
    return { g, key: { M: 'stone.r@m', D: 'black:0', P: 'wood.y@p', r: 'steel:3', L: '#ffd060' } };
  },
  drill: () => {
    const g = new Grid(20, 20);
    g.rect(6, 1, 8, 7, 'B');
    g.rect(8, 8, 4, 2, 'S');
    g.poly([[6.4, 10], [13.6, 10], [10, 19.4]], 'D');
    g.line(7, 12, 12, 11, 'k').line(8, 15, 12, 14, 'k');
    g.rect(7, 3, 6, 2, 'Y');
    return { g, key: { B: 'iron.f@b', S: 'steel:3', D: 'steel.x@d', Y: 'yellow:3' } };
  },
  excavator: () => {
    const g = new Grid(20, 20);
    g.rect(1, 15, 13, 4, 'T');
    g.rect(2, 9, 9, 6, 'Y');
    g.rect(3, 10, 4, 3, 'G');
    g.rect(9, 5, 2, 4, 'C');
    g.line(11, 10, 16, 4, 'A').line(12, 10, 17, 4, 'A');
    g.line(17, 4, 18, 12, 'A');
    g.poly([[15, 11], [19.6, 11], [19, 15.6], [15.6, 15]], 'S');
    g.ellipse(10, 2.6, 2, 1.6, 'm');
    return { g, key: { T: 'iron.x@t', Y: 'yellow.f@y', G: 'glass.F@g', C: 'iron:2', A: 'orange:3', S: 'steel.f@s', m: 'grey:4' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
