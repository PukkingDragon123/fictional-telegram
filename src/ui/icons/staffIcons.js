// [v26 staff] Beaver staff icons (20x20, the bagArt pixel kit like oreIcons.js):
//   staff st_clip st_tent st_poster st_burrow st_bunk st_cabin st_hurt st_home st_level
//   skills: st_build st_chop st_haul st_serve st_fab st_mine st_care
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

// a beaver face (used by 'staff')
function beaverHead(g, ox = 0, oy = 0) {
  g.ellipse(10 + ox, 10 + oy, 7.6, 6.8, 'F');
  g.ellipse(4 + ox, 4.4 + oy, 2, 2, 'F').ellipse(16 + ox, 4.4 + oy, 2, 2, 'F');
  g.set(4 + ox, 4 + oy, 'p').set(16 + ox, 4 + oy, 'p');
  g.ellipse(10 + ox, 12.6 + oy, 4.4, 3.2, 'M');
  g.set(7 + ox, 9 + oy, 'K').set(13 + ox, 9 + oy, 'K').set(7 + ox, 8 + oy, '*').set(13 + ox, 8 + oy, '*');
  g.rect(9 + ox, 11 + oy, 2, 1, 'K');
  g.rect(9 + ox, 13 + oy, 1, 2, '+').rect(10 + ox, 13 + oy, 1, 2, '+');
  g.set(5 + ox, 11 + oy, 'r').set(15 + ox, 11 + oy, 'r');
}
const FUR = { F: 'wood.r@f', M: 'lwood.r@m', p: 'pink:3', r: 'pink:3' };

const ICONS = {
  staff: () => {
    const g = new Grid(20, 20);
    beaverHead(g, 0, 2);
    g.poly([[3, 4.6], [17, 4.6], [16, 1.4], [4, 1.4]], 'H');
    g.rect(2, 4, 16, 2, 'h');
    return { g, key: { ...FUR, H: 'yellow.r@h', h: 'yellow:2' } };
  },
  st_clip: () => {
    const g = new Grid(20, 20);
    g.rect(3, 3, 14, 16, 'B');
    g.rect(5, 5, 10, 12, 'P');
    g.rect(7, 1, 6, 4, 'C');
    g.line(7, 8, 13, 8, 'k').line(7, 11, 13, 11, 'k').line(7, 14, 11, 14, 'k');
    g.set(6, 8, 'R').set(6, 11, 'R').set(6, 14, 'R');
    return { g, key: { B: 'wood.r@b', P: 'parch.f@p', C: 'brass.r@c', R: '#d9453b' } };
  },
  st_tent: () => {
    const g = new Grid(20, 20);
    g.poly([[10, 1.4], [18.6, 17], [1.4, 17]], 'S');
    for (let x = 2; x < 19; x += 4) g.poly([[10, 1.4], [x + 1.6, 17], [x, 17]], 'R', ['S']);
    g.poly([[10, 7], [13, 17], [7, 17]], 'D');
    g.rect(1, 17, 18, 2, 'W');
    return { g, key: { S: 'cream.r@s', R: 'red.r@r', D: '#3b2414', W: 'wood.f@w' } };
  },
  st_poster: () => {
    const g = new Grid(20, 20);
    g.rect(9, 2, 2, 17, 'W');
    g.rect(3, 3, 14, 11, 'P');
    g.line(5, 5, 14, 5, 'R').line(5, 6, 14, 6, 'R');
    g.ellipse(10, 10.5, 2.6, 2.2, 'F');
    g.set(9, 10, 'K').set(11, 10, 'K');
    g.set(4, 4, 'T').set(15, 4, 'T');
    return { g, key: { W: 'wood.y@w', P: 'parch.f@p', R: '#d9453b', F: 'wood.r@f', T: 'sky:3' } };
  },
  st_burrow: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 15, 9.4, 9, 'D');
    g.ellipse(10, 9, 8, 4, 'G', ['D']);
    g.ellipse(10, 15.5, 3.4, 4, 'O');
    g.set(12, 15, 'Y');
    g.set(4, 7, 'f').set(15, 6, 'q');
    return { g, key: { D: 'wood.r@d', G: 'leaf.r@g', O: 'dwood.r@o', Y: 'gold:4', f: 'pink:4', q: 'yellow:4' } };
  },
  st_bunk: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 9], [10, 3], [19, 9]], 'R');
    g.rect(2, 9, 16, 9, 'L');
    for (let y = 10; y < 18; y += 2) g.line(2, y, 17, y, 'k');
    g.rect(8, 12, 4, 6, 'D');
    g.rect(3, 11, 3, 3, 'Y').rect(14, 11, 3, 3, 'Y');
    return { g, key: { R: 'green.r@r', L: 'lwood.x@l', D: 'dwood:2', Y: 'gold:4' } };
  },
  st_cabin: () => {
    const g = new Grid(20, 20);
    g.rect(14, 2, 3, 7, 'S');
    g.poly([[0.6, 9.4], [10, 2.4], [19.4, 9.4]], 'R');
    g.rect(2, 9, 16, 9, 'L');
    for (let y = 10; y < 18; y += 2) g.line(2, y, 17, y, 'k');
    g.rect(8, 12, 4, 6, 'D');
    g.rect(3, 11, 3, 3, 'Y').rect(14, 11, 3, 3, 'Y');
    g.set(3, 15, 'f').set(5, 15, 'q').set(14, 15, 'f').set(16, 15, 'q');
    return { g, key: { S: 'stone.r@s', R: 'red.r@r', L: 'lwood.x@l', D: 'dwood:2', Y: 'gold:4', f: 'pink:4', q: 'yellow:4' } };
  },
  st_hurt: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 8.6, 8.6, 'W');
    g.rect(8, 4, 4, 12, 'R').rect(4, 8, 12, 4, 'R');
    return { g, key: { W: 'white.r@w', R: 'red.r@r' } };
  },
  st_home: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 10], [10, 2.6], [18, 10]], 'R');
    g.rect(4, 10, 12, 8, 'L');
    g.rect(8, 12, 4, 6, 'D');
    return { g, key: { R: 'red.r@r', L: 'lwood.r@l', D: 'dwood:2' } };
  },
  st_level: () => {
    const g = new Grid(20, 20);
    g.poly([[10, 1], [12.6, 7], [19, 7.4], [14, 11.6], [15.8, 18.6], [10, 15], [4.2, 18.6], [6, 11.6], [1, 7.4], [7.4, 7]], 'Y');
    return { g, key: { Y: 'gold.R@y' } };
  },
  st_build: () => {
    const g = new Grid(20, 20);
    g.line(4, 17, 12, 9, 'W').line(5, 17, 13, 9, 'W').line(4, 16, 12, 8, 'W');
    g.poly([[9, 4], [16, 2], [18.6, 6], [13, 11]], 'M');
    return { g, key: { W: 'wood.y@w', M: 'steel.r@m' } };
  },
  st_chop: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 12, 7, 7, 'T');
    g.ellipse(10, 12, 4.4, 4.4, 'R');
    g.ellipse(10, 12, 2, 2, 'T');
    g.poly([[14, 4], [19, 7], [16, 10]], 'B');
    return { g, key: { T: 'lwood.r@t', R: 'wood:4', B: 'parch.r@b' } };
  },
  st_haul: () => {
    const g = new Grid(20, 20);
    g.rect(3, 6, 14, 12, 'C');
    g.line(3, 6, 16, 17, 'k').line(16, 6, 3, 17, 'k');
    g.rect(3, 6, 14, 2, 'D');
    return { g, key: { C: 'lwood.r@c', D: 'wood:2' } };
  },
  st_serve: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 14, 9, 2.6, 'T');
    g.ellipse(10, 9.4, 5.4, 5, 'D', ['.']);
    g.rect(4, 13, 12, 2, 'T');
    g.rect(9, 3, 2, 2, 'T');
    return { g, key: { T: 'steel.r@t', D: 'steel.R@d' } };
  },
  st_fab: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 8, 8, 'G');
    for (const [x, y] of [[10, 1], [10, 19], [1, 10], [19, 10], [4, 4], [16, 4], [4, 16], [16, 16]]) g.rect(x - 1, y - 1, 2, 2, 'G');
    g.ellipse(10, 10, 3, 3, 'H');
    return { g, key: { G: 'steel.r@g', H: '#3b2414' } };
  },
  st_mine: () => {
    const g = new Grid(20, 20);
    g.line(4, 18, 13, 7, 'W').line(5, 18, 14, 7, 'W');
    g.poly([[3, 6], [10, 2], [18, 4.6], [17, 6.4], [10, 4.6], [4.6, 8]], 'M');
    return { g, key: { W: 'wood.y@w', M: 'steel.r@m' } };
  },
  st_care: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 8.6, 8.6, 'W');
    g.rect(8, 4, 4, 12, 'R').rect(4, 8, 12, 4, 'R');
    g.set(5, 5, '*').set(6, 5, '*');
    return { g, key: { W: 'mint.r@w', R: 'red.r@r' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
