// [v32 dive] Loon Lake & diving icons (20x20, the pixel kit of forestIcons.js / worldIcons.js):
//   dv_lake      the section: a loon on the lake at sunrise
//   dv_catch     a wicker creel with a walleye tail      dv_bucket   a tin bucket of perch
//   dv_whiskers  Old Whiskers, the golden catfish        dv_mask     snorkel mask + tube
//   dv_flippers  a pair of yellow flippers               dv_helmet   brass diving helmet
//   dv_tanks     twin air tanks                          dv_pen      a net pen with floats
//   dv_kelp      kelp on a rope                          dv_mussel   an open mussel with a pearl
//   dv_feeder    the bubble feeder bell                  dv_cage     iron predator cage
//   dv_wreck     the sunken barge                        dv_air      an air bubble
//   dv_surface   up arrow out of the water               dv_pearl    a pearl
//   dv_build     a mallet over a post                    dv_coin     a coin stamped with a fish
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

const ICONS = {
  dv_lake: () => {
    const g = new Grid(20, 20);
    g.rect(0, 11, 20, 9, 'W');
    for (const [x, y] of [[2, 13], [3, 13], [11, 15], [12, 15], [13, 15], [6, 17], [7, 17], [16, 17], [17, 17]]) g.set(x, y, 'w');
    g.ellipse(10, 11, 4.4, 4.4, 'S');
    g.rect(0, 11, 20, 1, 'W');
    // the loon: black head, white necklace, chequered back, dagger bill
    g.ellipse(8.5, 9.6, 5, 2.2, 'K');
    g.rect(4, 11, 10, 1, 'W');
    for (let x = 5; x < 12; x += 2) g.set(x, 9, 'c');
    for (let x = 6; x < 12; x += 2) g.set(x, 10, 'c');
    g.ellipse(13.4, 7.2, 1.9, 1.7, 'K');
    g.set(13, 8, 'c').set(14, 8, 'c');
    g.line(15, 7, 18, 7, 'B').set(15, 6, 'B');
    g.set(14, 6, 'r');
    return { g, key: { W: 'water.r@w', w: 'sky:5', S: 'fire.R@s', K: 'black.R@k', c: '#ffffff', B: 'iron:3', r: 'red:3' } };
  },
  dv_catch: () => {
    const g = new Grid(20, 20);
    g.poly([[3, 8], [17, 8], [16, 18], [4, 18]], 'C');
    for (let y = 9; y < 18; y += 2) g.line(4, y, 16, y, 'c');
    for (let x = 5; x < 16; x += 3) g.line(x, 9, x, 17, 'd');
    g.rect(2, 7, 16, 2, 'L');
    g.line(5, 7, 10, 2, 'S').line(10, 2, 15, 7, 'S');
    // a walleye tail and a perch head peeking out
    g.poly([[12, 7], [15, 2], [17, 3], [16, 7]], 'F');
    g.set(15, 3, 'f').set(16, 4, 'f');
    g.ellipse(6.5, 6.4, 2.2, 1.6, 'P');
    g.set(5, 6, 'k');
    return { g, key: { C: 'straw.R@c', c: 'syrup:3', d: 'syrup:2', L: 'wood.R@l', S: 'leather.R@s', F: 'olive.R@f', f: 'yellow:4', P: 'yellow.R@p', k: 'ink:1' } };
  },
  dv_bucket: () => {
    const g = new Grid(20, 20);
    g.poly([[4, 8], [16, 8], [14, 18], [6, 18]], 'T');
    g.rect(4, 8, 13, 2, 'R');
    for (let y = 11; y < 18; y += 3) g.line(5, y, 15, y, 't');
    g.line(4, 8, 10, 2, 'H').line(10, 2, 16, 8, 'H');
    g.ellipse(8, 7, 2.4, 1.6, 'P').ellipse(12.4, 6.8, 2.2, 1.5, 'Q');
    g.set(7, 6, 'k').set(13, 6, 'k');
    g.poly([[9, 6], [11, 3], [12, 5]], 'F');
    return { g, key: { T: 'steel.R@t', R: 'steel:4', t: 'steel:2', H: 'iron:3', P: 'yellow.R@p', Q: 'orange.R@q', F: 'olive.R@f', k: 'ink:1' } };
  },
  dv_whiskers: () => {
    const g = new Grid(20, 20);
    g.ellipse(9.5, 11, 8, 4.2, 'G');
    g.poly([[16, 11], [19, 7], [19, 15]], 'G');
    g.poly([[7, 7], [10, 3], [12, 7]], 'G');
    g.ellipse(9.5, 13.4, 6, 1.6, 'g');
    g.set(4, 9, 'k').set(4, 10, 'k').set(3, 9, 'h');
    // whiskers
    g.line(2, 12, 0, 16, 'b').line(3, 12, 2, 17, 'b').line(2, 11, 0, 9, 'b');
    g.line(2, 12, 4, 12, 'm');
    for (const [x, y] of [[8, 9], [11, 10], [13, 9], [10, 12]]) g.set(x, y, 's');
    return { g, key: { G: 'gold.R@g', g: 'yellow:5', k: 'ink:0', h: '#ffffff', b: 'syrup:1', m: 'red:2', s: 'gold:2' } };
  },
  dv_mask: () => {
    const g = new Grid(20, 20);
    g.ellipse(9, 11, 7.6, 5, 'R');
    g.ellipse(9, 11, 6, 3.6, 'G');
    g.rect(8, 7, 2, 9, 'R');
    g.set(4, 9, 'h').set(5, 8, 'h').set(12, 9, 'h').set(13, 8, 'h');
    // the snorkel: a bent tube up the right side
    g.rect(16, 3, 2, 12, 'T');
    g.rect(15, 14, 3, 2, 'T');
    g.rect(16, 2, 2, 2, 'O');
    for (let y = 5; y < 14; y += 3) g.set(16, y, 't');
    return { g, key: { R: 'black.R@r', G: 'glass.R@g', h: '#ffffff', T: 'yellow.R@t', t: 'orange:3', O: 'red.R@o' } };
  },
  dv_flippers: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 17], [5, 4], [9, 4], [9, 17]], 'Y');
    g.poly([[11, 17], [11, 3], [15, 3], [18, 17]], 'Z');
    g.rect(4, 4, 5, 4, 'B').rect(11, 3, 5, 4, 'C');
    for (let y = 10; y < 17; y += 3) { g.line(3, y, 8, y, 'y'); g.line(12, y, 17, y, 'z'); }
    return { g, key: { Y: 'yellow.R@y', Z: 'yellow.R@z', y: 'gold:2', z: 'gold:2', B: 'black.R@b', C: 'black.R@c' } };
  },
  dv_helmet: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 9, 7.4, 7.2, 'B');
    g.rect(3, 15, 14, 4, 'C');
    g.ellipse(10, 9.4, 3.6, 3.6, 'K');
    g.ellipse(10, 9.4, 2.7, 2.7, 'G');
    g.set(9, 8, 'h').set(8, 9, 'h');
    for (const [x, y] of [[4, 16], [8, 17], [12, 17], [16, 16], [10, 4], [5, 7], [15, 7]]) g.set(x, y, 'b');
    g.ellipse(3.6, 10, 1.2, 1.6, 'K').ellipse(16.4, 10, 1.2, 1.6, 'K');
    return { g, key: { B: 'brass.R@b', C: 'copper.R@c', K: 'iron:2', G: 'glass.R@g', h: '#ffffff', b: 'brass:5' } };
  },
  dv_tanks: () => {
    const g = new Grid(20, 20);
    g.rect(3, 5, 6, 13, 'A').rect(11, 5, 6, 13, 'Z');
    g.ellipse(6, 5, 3, 1.8, 'A').ellipse(14, 5, 3, 1.8, 'Z');
    g.rect(5, 1, 2, 3, 'V').rect(13, 1, 2, 3, 'V');
    g.rect(7, 2, 6, 1, 'H');
    g.rect(2, 10, 16, 2, 'S');
    g.set(4, 7, 'h').set(12, 7, 'h');
    return { g, key: { A: 'steel.R@a', Z: 'steel.R@z', V: 'brass.R@v', H: 'iron:3', S: 'leather.R@s', h: '#ffffff' } };
  },
  dv_pen: () => {
    const g = new Grid(20, 20);
    g.rect(0, 15, 20, 5, 'D');
    g.rect(2, 3, 2, 15, 'P').rect(16, 3, 2, 15, 'P');
    for (let y = 5; y < 16; y += 2) for (let x = 4; x < 16; x++) if ((x + y) % 2 === 0) g.set(x, y, 'n');
    for (let x = 4; x < 16; x += 2) for (let y = 5; y < 16; y++) if ((x + y) % 3 === 0) g.set(x, y, 'n');
    g.line(2, 4, 17, 4, 'R');
    g.ellipse(5.5, 3.8, 1.4, 1.2, 'K').ellipse(10, 3.8, 1.4, 1.2, 'K').ellipse(14.5, 3.8, 1.4, 1.2, 'K');
    g.ellipse(9, 11, 2.6, 1.4, 'F');
    g.set(7, 11, 'k');
    return { g, key: { D: 'sand.r@d', P: 'wood.R@p', n: 'straw:4', R: 'straw:2', K: 'red.R@k', F: 'yellow.R@f', k: 'ink:1' } };
  },
  dv_kelp: () => {
    const g = new Grid(20, 20);
    g.line(1, 5, 19, 5, 'R');
    for (const [x0, len, sway] of [[4, 13, 1], [9, 11, -1], [14, 14, 1]]) {
      for (let k = 0; k < len; k++) {
        const x = x0 + Math.round(Math.sin(k * 0.6) * sway), y = 6 + k;
        g.set(x, y, 'K').set(x + 1, y, 'K');
        if (k % 3 === 1) g.set(x + 2 * Math.sign(sway || 1), y, 'k');
      }
      g.ellipse(x0 + 0.5, 6 + len, 1.6, 1.2, 'B');
    }
    g.rect(0, 3, 2, 5, 'P').rect(18, 3, 2, 5, 'P');
    return { g, key: { R: 'straw.R@r', K: 'olive.R@k', k: 'lime:4', B: 'olive:1', P: 'wood.R@p' } };
  },
  dv_mussel: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 14], [8, 6], [16, 4], [18, 8], [10, 15]], 'M');
    g.poly([[2, 14], [10, 15], [18, 10], [17, 17], [6, 18]], 'N');
    for (let k = 0; k < 4; k++) g.line(4 + k * 3, 13 - k, 9 + k * 2, 7 - k, 'm');
    g.ellipse(10.5, 12.5, 2.6, 2.2, 'P');
    g.set(10, 11, 'h').set(9, 12, 'h');
    return { g, key: { M: 'navy.R@m', N: 'navy.R@n', m: 'purple:3', P: 'white.R@p', h: '#ffffff' } };
  },
  dv_feeder: () => {
    const g = new Grid(20, 20);
    g.poly([[5, 6], [15, 6], [17, 15], [3, 15]], 'B');
    g.ellipse(10, 6, 5, 2, 'B');
    g.rect(2, 15, 16, 2, 'C');
    g.rect(9, 1, 2, 4, 'H');
    g.ellipse(10, 10, 2.2, 2.2, 'G');
    g.set(9, 9, 'h');
    for (const [x, y] of [[4, 18], [8, 19], [13, 18], [16, 19]]) g.set(x, y, 'f');
    for (const [x, y, r] of [[16, 3, 1.4], [18, 1, 0.9], [3, 3, 1]]) g.ellipse(x, y, r, r, 'b');
    return { g, key: { B: 'brass.R@b', C: 'copper.R@c', H: 'iron:3', G: 'glass.R@g', h: '#ffffff', f: 'syrup:3', b: 'sky.R@q' } };
  },
  dv_cage: () => {
    const g = new Grid(20, 20);
    g.rect(2, 3, 16, 2, 'I').rect(2, 16, 16, 2, 'I');
    for (let x = 2; x < 19; x += 3) g.rect(x, 5, 1, 11, 'i');
    g.ellipse(10, 10.5, 5.4, 2, 'F');
    g.poly([[15, 10], [18, 8], [18, 13]], 'F');
    g.set(6, 10, 'k');
    g.line(5, 11, 7, 11, 't');
    for (let x = 4; x < 16; x += 2) g.set(x, 4, 'r');
    return { g, key: { I: 'iron.R@i', i: 'steel:2', F: 'olive.R@f', k: 'ink:0', t: '#ffffff', r: 'syrup:3' } };
  },
  dv_wreck: () => {
    const g = new Grid(20, 20);
    g.rect(0, 16, 20, 4, 'D');
    g.poly([[1, 9], [19, 7], [17, 16], [3, 17]], 'H');
    for (let y = 10; y < 16; y += 2) g.line(2, y + 1, 18, y - 1, 'h');
    g.rect(8, 3, 2, 6, 'M');
    g.line(9, 3, 15, 6, 'R');
    g.ellipse(6, 12, 1.4, 1.4, 'P').ellipse(12, 11, 1.4, 1.4, 'P');
    g.set(6, 12, 'g').set(12, 11, 'g');
    g.set(15, 13, 'm').set(16, 14, 'm').set(4, 15, 'm');
    return { g, key: { D: 'sand.r@d', H: 'dwood.R@h', h: 'wood:2', M: 'wood.R@m', R: 'straw:2', P: 'brass.R@p', g: '#ffe98a', m: 'moss:4' } };
  },
  dv_air: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 7.2, 7.2, 'B');
    g.ellipse(10, 10, 5.6, 5.6, 'b');
    g.set(7, 6, 'h').set(6, 7, 'h').set(8, 5, 'h').set(6, 8, 'h');
    g.set(13, 14, 'w');
    return { g, key: { B: 'sky.R@b', b: 'ice:4', h: '#ffffff', w: '#ffffff' } };
  },
  dv_surface: () => {
    const g = new Grid(20, 20);
    g.rect(0, 12, 20, 8, 'W');
    for (let x = 1; x < 20; x += 4) g.set(x, 12, 'w').set(x + 1, 12, 'w');
    g.poly([[10, 1], [17, 8], [13, 8], [13, 17], [7, 17], [7, 8], [3, 8]], 'A');
    return { g, key: { W: 'water.r@w', w: 'sky:5', A: 'yellow.R@a' } };
  },
  dv_pearl: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10.5, 6.4, 6.2, 'P');
    g.set(7, 7, 'h').set(8, 7, 'h').set(7, 8, 'h');
    g.set(13, 14, 'p');
    return { g, key: { P: 'white.R@p', h: '#ffffff', p: 'lilac:3' } };
  },
  dv_build: () => {
    const g = new Grid(20, 20);
    g.rect(0, 16, 20, 4, 'D');
    g.rect(8, 8, 4, 9, 'P');
    g.line(8, 9, 11, 9, 'p');
    g.line(3, 14, 13, 3, 'H');
    g.rect(11, 1, 6, 5, 'M');
    return { g, key: { D: 'sand.r@d', P: 'wood.R@p', p: 'dwood:3', H: 'lwood.R@h', M: 'iron.R@m' } };
  },
  dv_coin: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 7.6, 7.6, 'G');
    g.ellipse(10, 10, 5.6, 5.6, 'g');
    g.ellipse(9.5, 10, 3.4, 1.8, 'F');
    g.poly([[12.5, 10], [15, 8], [15, 12]], 'F');
    g.set(7, 9, 'k');
    return { g, key: { G: 'gold.R@g', g: 'yellow:4', F: 'gold:1', k: 'gold:0' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
