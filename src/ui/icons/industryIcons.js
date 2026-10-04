// [F&S industry] Industry icons (20x20, the same pixel kit, ramps and outlines as
// foodIcons.js / oreIcons.js):
//   ind_gear (Build tab)  ind_smelter ind_shop ind_generator ind_belt ind_loader
//   ind_feeder2 ind_harvester ind_hauler ind_vending ind_scrubber ind_filter
//   ind_sapling ind_worker ind_power ind_smog ind_strike
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

// a toothed gear centred at (cx, cy)
function cog(g, cx, cy, r, teeth, ch, hole = 'h') {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const tooth = Math.floor(((a + Math.PI) / (2 * Math.PI)) * teeth * 2) % 2 === 0;
      if (d <= r - 1.4 || (tooth && d <= r)) g.set(x, y, ch);
    }
  if (hole) g.ellipse(cx, cy, Math.max(1, r * 0.3), Math.max(1, r * 0.3), hole);
  return g;
}
function bolt(g, x, y, ch) {
  g.poly([[x + 3, y], [x, y + 6], [x + 3, y + 6], [x + 1, y + 11], [x + 6, y + 4], [x + 3, y + 4], [x + 5, y]], ch);
  return g;
}

const ICONS = {
  ind_gear: () => {
    const g = cog(new Grid(20, 20), 10, 10, 8.6, 8, 'G');
    return { g, key: { G: 'brass.R@g', h: '#2a1a14' } };
  },
  ind_smelter: () => {
    const g = new Grid(20, 20);
    g.rect(2, 8, 13, 10, 'B');
    g.rect(4, 4, 4, 5, 'C').rect(3, 3, 6, 1, 'I');
    g.ellipse(8.5, 15, 3.2, 3.4, 'F');
    g.rect(5, 15, 7, 3, 'F');
    g.rect(7, 14, 3, 3, 'Y');
    g.rect(15, 13, 4, 5, 'M');
    g.line(15, 13, 18, 13, 'h');
    g.set(5, 1, 's').set(6, 0, 's').set(4, 0, 's');
    return { g, key: { B: 'red.f@b', C: 'red.x@c', I: 'iron.s@i', F: 'fire.R@f', Y: 'fire:5', M: 'copper.F@m', h: 'copper:5', s: 'grey:4' } };
  },
  ind_shop: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 9], [6, 4], [6, 9], [11, 4], [11, 9], [16, 4], [19, 9]], 'R');
    g.rect(2, 9, 16, 9, 'W');
    g.rect(5, 12, 10, 6, 'D');
    cog(g, 10, 14.4, 3.6, 6, 'G', 'D');
    return { g, key: { R: 'navy.x@r', W: 'steel.y@w', D: 'ink:2', G: 'brass.R@g' } };
  },
  ind_generator: () => {
    const g = new Grid(20, 20);
    g.rect(1, 9, 12, 7, 'B');
    g.ellipse(13, 12.5, 2.5, 3.6, 'E');
    g.rect(3, 3, 3, 6, 'S').rect(2, 2, 5, 1, 'I');
    cog(g, 15, 13, 4.4, 5, 'W', 'k');
    g.rect(1, 16, 14, 2, 'K');
    g.set(4, 12, 'F').set(5, 12, 'F').set(4, 13, 'F').set(5, 13, 'f');
    return { g, key: { B: 'red.y@b', E: 'red:2', S: 'iron.x@s', I: 'iron:4', W: 'steel.R@w', K: 'stone.f@k', F: 'fire:4', f: 'fire:2' } };
  },
  ind_belt: () => {
    const g = new Grid(20, 20);
    g.rect(1, 9, 18, 5, 'R');
    g.ellipse(3, 11.5, 2.4, 2.4, 'W').ellipse(17, 11.5, 2.4, 2.4, 'W');
    for (let x = 5; x <= 15; x += 3) g.set(x, 9, 'h').set(x, 13, 'h');
    g.rect(7, 4, 6, 4, 'O');
    g.rect(2, 15, 2, 4, 'L').rect(16, 15, 2, 4, 'L');
    g.poly([[13, 5], [17, 2], [17, 8]], 'Y');
    return { g, key: { R: 'black.x@r', W: 'steel.R@w', h: 'grey:3', O: 'copper.R@o', L: 'iron.s@l', Y: 'yellow.f@y' } };
  },
  ind_loader: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 2], [18, 2], [12, 10], [8, 10]], 'H');
    g.rect(8, 10, 4, 4, 'S');
    g.rect(2, 15, 16, 3, 'R');
    g.rect(4, 3, 3, 2, 'O').rect(9, 3, 3, 2, 'C').rect(13, 3, 2, 2, 'O');
    g.poly([[10, 13], [7, 10.5], [13, 10.5]], 'Y');
    return { g, key: { H: 'steel.y@h', S: 'iron.x@s', R: 'black.x@r', O: 'copper.R@o', C: 'black.R@c', Y: 'yellow.f@y' } };
  },
  ind_feeder2: () => {
    const g = new Grid(20, 20);
    g.rect(5, 9, 9, 9, 'S');
    g.ellipse(9.5, 8.5, 4.5, 2, 'T');
    g.rect(7, 4, 6, 4, 'R');
    g.rect(12, 5, 7, 2, 'B');
    g.ellipse(9.5, 13, 2, 2, 'P');
    g.set(18, 3, 'p').set(17, 2, 'p').set(19, 1, 'p');
    return { g, key: { S: 'steel.x@s', T: 'steel:4', R: 'red.R@r', B: 'iron.x@b', P: 'honey.R@p', p: 'honey:4' } };
  },
  ind_harvester: () => {
    const g = new Grid(20, 20);
    g.rect(3, 16, 10, 3, 'B');
    g.line(7, 15, 7, 7, 'A').line(8, 15, 8, 7, 'A');
    g.line(8, 7, 15, 5, 'A').line(8, 8, 15, 6, 'A');
    g.line(15, 6, 15, 10, 'C').line(17, 6, 17, 10, 'C');
    g.ellipse(16, 13, 2.2, 2.2, 'V');
    g.set(16, 10, 'L').set(17, 10, 'L');
    return { g, key: { B: 'iron.f@b', A: 'green.x@a', C: 'steel:4', V: 'orange.R@v', L: 'leaf:4' } };
  },
  ind_hauler: () => {
    const g = new Grid(20, 20);
    g.rect(6, 6, 8, 4, 'Y');
    g.line(2, 4, 6, 7, 'I').line(18, 4, 14, 7, 'I');
    g.rect(0, 3, 5, 1, 'P').rect(15, 3, 5, 1, 'P');
    g.line(10, 10, 10, 12, 'I');
    g.rect(5, 12, 10, 5, 'L');
    g.ellipse(5.5, 14.5, 1.6, 2.4, 'E').ellipse(14.5, 14.5, 1.6, 2.4, 'E');
    return { g, key: { Y: 'yellow.R@y', I: 'iron.s@i', P: 'grey:2', L: 'wood.x@l', E: 'lwood:4' } };
  },
  ind_vending: () => {
    const g = new Grid(20, 20);
    g.rect(4, 1, 12, 18, 'R');
    g.rect(5, 4, 7, 11, 'G');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.set(6 + c * 2, 5 + r * 3, ['O', 'L', 'Y'][(r + c) % 3]).set(6 + c * 2, 6 + r * 3, ['O', 'L', 'Y'][(r + c) % 3]);
    g.rect(13, 5, 2, 6, 'K');
    g.rect(5, 16, 7, 2, 'K');
    g.rect(5, 2, 10, 1, 'W');
    return { g, key: { R: 'red.y@r', G: 'glass.F@g', O: 'orange:4', L: 'lime:4', Y: 'yellow:4', K: 'ink:2', W: 'cream:5' } };
  },
  ind_scrubber: () => {
    const g = new Grid(20, 20);
    g.rect(3, 2, 14, 17, 'W');
    g.ellipse(10, 10, 5.6, 5.6, 'D');
    g.poly([[10, 10], [6, 6], [9, 5]], 'B').poly([[10, 10], [14, 6], [15, 9]], 'B').poly([[10, 10], [14, 14], [11, 15]], 'B').poly([[10, 10], [6, 14], [5, 11]], 'B');
    g.set(10, 10, 'k');
    g.rect(3, 17, 14, 2, 'G');
    return { g, key: { W: 'white.y@w', D: 'black:2', B: 'mint.R@b', G: 'green.x@g' } };
  },
  ind_filter: () => {
    const g = new Grid(20, 20);
    g.rect(0, 14, 20, 6, 'A');
    g.rect(2, 12, 16, 2, 'P');
    g.rect(4, 3, 7, 9, 'T');
    g.rect(12, 7, 4, 5, 'S');
    g.line(16, 9, 18, 9, 'S');
    g.set(18, 11, 'b').set(19, 13, 'b').set(17, 12, 'b');
    return { g, key: { A: 'water.x@a', P: 'lwood.y@p', T: 'blue.R@t', S: 'steel.x@s', b: 'ice:5' } };
  },
  ind_sapling: () => {
    const g = new Grid(20, 20);
    g.poly([[10, 1], [15, 8], [12, 8], [16.6, 13], [3.4, 13], [8, 8], [5, 8]], 'T');
    g.rect(9, 13, 2, 4, 'W');
    g.rect(5, 17, 10, 2, 'D');
    return { g, key: { T: 'leaf.r@t', W: 'wood.x@w', D: 'cinnamon.f@d' } };
  },
  ind_worker: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 11, 6, 6, 'F');
    g.ellipse(5, 6, 2, 2, 'F').ellipse(15, 6, 2, 2, 'F');
    g.ellipse(10, 13.6, 3, 2.4, 'M');
    g.set(10, 12, 'K').set(7, 10, 'K').set(12, 10, 'K');
    g.poly([[3, 7], [5, 3], [15, 3], [17, 7]], 'H');
    g.rect(2, 7, 16, 1, 'h');
    g.rect(5, 17, 10, 3, 'V');
    g.line(7, 17, 7, 19, 'y').line(12, 17, 12, 19, 'y');
    return { g, key: { F: 'bear.r@f', M: 'tan.r@m', K: '#2a1a14', H: 'yellow.R@h', h: 'honey:2', V: 'orange.x@v', y: 'yellow:5' } };
  },
  ind_power: () => {
    const g = bolt(new Grid(20, 20), 6, 2, 'Y');
    g.ellipse(10, 17.5, 6, 1.4, 's');
    return { g, key: { Y: 'yellow.R@y', s: 'grey:3' } };
  },
  ind_smog: () => {
    const g = new Grid(20, 20);
    g.ellipse(7, 9, 5, 4, 'A').ellipse(13, 8, 5.6, 4.6, 'A').ellipse(10, 12, 7, 3.6, 'B');
    g.rect(6, 15, 2, 4, 'C').rect(12, 15, 2, 4, 'C');
    g.set(8, 9, 'K').set(12, 9, 'K').line(9, 12, 11, 11, 'K');
    return { g, key: { A: 'grey.r@a', B: 'stone.r@b', C: 'iron.s@c', K: '#2a1a14' } };
  },
  ind_strike: () => {
    const g = new Grid(20, 20);
    g.rect(2, 2, 16, 10, 'S');
    g.line(5, 5, 15, 5, 'K').line(5, 8, 12, 8, 'K');
    g.rect(9, 12, 2, 7, 'W');
    return { g, key: { S: 'parch.f@s', K: 'red:2', W: 'wood.x@w' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
