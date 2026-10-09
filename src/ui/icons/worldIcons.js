// [v26 world] Expedition icons (20x20, the same pixel kit as forestIcons.js):
//   xp_compass   the Deepwood Expedition section
//   xp_bridge    Rope Bridge          xp_hooks   Bramble Hooks
//   xp_saw       Crosscut Saw         xp_rope    Climbing Ropes
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

const ICONS = {
  // a brass compass, needle pointing south (down into the deep woods)
  xp_compass: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10.5, 8.4, 8.4, 'B');
    g.ellipse(10, 10.5, 6.6, 6.6, 'F');
    g.poly([[10, 4.6], [11.6, 10.5], [8.4, 10.5]], 'N');
    g.poly([[10, 16.6], [11.6, 10.5], [8.4, 10.5]], 'S');
    g.set(10, 10, 'k').set(10, 11, 'k');
    g.rect(9, 0, 3, 2, 'B');
    g.set(6, 6, 'h').set(5, 7, 'h');
    return { g, key: { B: 'brass.R@b', F: 'parch.r@f', N: 'red.R@n', S: 'navy.R@s', k: 'ink:1', h: '#ffffff' } };
  },
  // a sagging rope bridge over blue water
  xp_bridge: () => {
    const g = new Grid(20, 20);
    g.rect(0, 14, 20, 6, 'W');
    for (let x = 1; x < 20; x += 3) g.set(x, 16, 'w');
    for (let x = 1; x <= 18; x++) { const y = 9 + Math.round(Math.sin((x / 19) * Math.PI) * 2); g.set(x, y, 'P'); g.set(x, y + 1, 'p'); if (x % 2) g.set(x, y - 4 + 0, 'R'); }
    g.rect(1, 3, 2, 10, 'T').rect(17, 3, 2, 10, 'T');
    g.line(2, 4, 9, 6, 'R').line(9, 6, 17, 4, 'R');
    return { g, key: { W: 'water.r@w', w: 'sky:5', P: 'wood.R@p', p: 'dwood:1', R: 'straw:3', T: 'dwood.R@t' } };
  },
  // a long hooked pole for pulling brambles apart, thorny canes behind
  xp_hooks: () => {
    const g = new Grid(20, 20);
    g.line(2, 18, 6, 4, 'C').line(7, 18, 12, 6, 'C').line(13, 18, 17, 7, 'C');
    for (const [x, y] of [[4, 11], [5, 7], [9, 12], [10, 9], [15, 12], [16, 9]]) g.set(x + 1, y, 'c');
    g.line(3, 18, 15, 3, 'H');
    g.line(15, 3, 18, 3, 'S').line(18, 3, 18, 6, 'S').set(17, 7, 'S');
    return { g, key: { C: 'plum.x@c', c: 'rose:3', H: 'wood.R@h', S: 'steel.R@s' } };
  },
  // a two-man crosscut saw
  xp_saw: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 8], [18, 8], [17, 12], [3, 12]], 'B');
    for (let x = 3; x < 18; x += 2) g.set(x, 13, 'b');
    g.rect(0, 6, 3, 6, 'H').rect(17, 6, 3, 6, 'H');
    g.line(4, 9, 15, 9, 'h');
    return { g, key: { B: 'steel.R@b', b: 'iron:2', H: 'wood.R@h', h: '#ffffff' } };
  },
  // a coil of climbing rope with a steel piton
  xp_rope: () => {
    const g = new Grid(20, 20);
    g.ellipse(9, 11, 7, 6.4, 'R');
    g.ellipse(9, 11, 3.6, 3, '.');
    for (let y = 6; y < 17; y += 2) for (let x = 3; x < 16; x += 3) if (g.get(x, y) === 'R') g.set(x, y, 'r');
    g.line(15, 3, 18, 15, 'S').rect(14, 2, 3, 2, 'S');
    return { g, key: { R: 'straw.R@r', r: 'syrup:3', S: 'steel.R@s' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
