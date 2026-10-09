// [v26 power] Power grid, storage and parts-chain icons (20x20, same pixel kit,
// ramps and outlines as oreIcons.js / industryIcons.js):
//   pw_bolt pw_plug pw_pole pw_solar pw_water pw_wind pw_battery
//   st_crate st_full st_warehouse st_partsrack st_coalbunker st_pile
//   ind_circuitfab ind_assembly res_glass res_wire res_motor res_solar_cell
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

function bolt(g, x, y, ch) {
  g.poly([[x + 6, y], [x + 1, y + 9], [x + 5, y + 9], [x + 3, y + 16], [x + 10, y + 6], [x + 6, y + 6], [x + 9, y]], ch);
  return g;
}
// a toothed gear
function cog(g, cx, cy, r, teeth, ch, hole = 'h') {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const tooth = Math.floor(((a + Math.PI) / (2 * Math.PI)) * teeth * 2) % 2 === 0;
      if (d <= r - 1.2 || (tooth && d <= r)) g.set(x, y, ch);
    }
  if (hole) g.ellipse(cx, cy, Math.max(1, r * 0.32), Math.max(1, r * 0.32), hole);
  return g;
}
// a little wooden crate
function crate(g, x, y, w, h, ch = 'W', band = 'B') {
  g.rect(x, y, w, h, ch);
  g.line(x, y, x + w - 1, y, band).line(x, y + h - 1, x + w - 1, y + h - 1, band);
  g.line(x, y, x, y + h - 1, band).line(x + w - 1, y, x + w - 1, y + h - 1, band);
  g.line(x + 1, y + 1, x + w - 2, y + h - 2, band);
  return g;
}

const ICONS = {
  pw_bolt: () => {
    const g = bolt(new Grid(20, 20), 4, 2, 'Y');
    g.set(10, 4, 'h').set(9, 5, 'h');
    return { g, key: { Y: 'yellow.R@y', h: 'yellow:5' } };
  },
  pw_plug: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 9.4, 9.4, 'R');
    g.ellipse(10, 10, 7.6, 7.6, 'r');
    // a plug: body + two prongs + cord
    g.rect(6, 7, 8, 6, 'W');
    g.rect(7, 4, 2, 3, 'P').rect(11, 4, 2, 3, 'P');
    g.rect(9, 13, 2, 4, 'C');
    g.line(7, 9, 12, 9, 'k');
    return { g, key: { R: 'red.f@ring', r: 'red.R@field', W: 'white.R@plug', P: 'steel:4', C: 'ink:2' } };
  },
  pw_pole: () => {
    const g = new Grid(20, 20);
    g.rect(9, 3, 3, 16, 'P');
    g.rect(3, 5, 15, 2, 'A');
    g.rect(3, 3, 2, 2, 'I').rect(9, 1, 3, 2, 'I').rect(16, 3, 2, 2, 'I');
    g.line(0, 5, 3, 4, 'k').line(17, 4, 19, 6, 'k');
    g.set(10, 9, 'L').set(11, 9, 'L');
    g.rect(7, 18, 7, 1, 'S');
    return { g, key: { P: 'wood.x@p', A: 'lwood.y@a', I: 'mint.R@i', L: 'yellow:5', S: 'moss:3' } };
  },
  pw_solar: () => {
    const g = new Grid(20, 20);
    g.poly([[2, 11], [7, 3], [18, 3], [14, 11]], 'F');
    g.poly([[3, 10], [7.6, 4], [16.8, 4], [13.4, 10]], 'C');
    for (let i = 0; i < 3; i++) g.line(6 + i * 3.3, 4, 4.5 + i * 3.3, 10, 'k');
    g.line(5, 7, 15, 7, 'k');
    g.rect(9, 11, 2, 6, 'S').rect(6, 17, 8, 2, 'B');
    g.set(15, 5, '*').set(14, 6, '+');
    return { g, key: { F: 'steel.y@f', C: 'blue.F@cell', S: 'steel:2', B: 'stone.y@b' } };
  },
  pw_water: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 9, 7.6, 7.6, 'W');
    g.ellipse(10, 9, 5.4, 5.4, '.');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.line(10, 9, Math.round(10 + Math.cos(a) * 6.5), Math.round(9 + Math.sin(a) * 6.5), 'S'); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; g.rect(Math.round(10 + Math.cos(a) * 8.2) - 1, Math.round(9 + Math.sin(a) * 8.2) - 1, 2, 2, 'P'); }
    g.ellipse(10, 9, 1.6, 1.6, 'H');
    g.rect(0, 15, 20, 5, 'A');
    g.line(1, 16, 6, 16, 'w').line(11, 17, 17, 17, 'w');
    return { g, key: { W: 'wood.r@w', S: 'lwood:2', P: 'lwood.y@p', H: 'iron:3', A: 'water.y@a', w: 'water:5' } };
  },
  pw_wind: () => {
    const g = new Grid(20, 20);
    g.poly([[9, 7], [11, 7], [12, 19], [8, 19]], 'T');
    g.poly([[9, 6], [11, 5], [12, 0], [10, 0]], 'B');
    g.poly([[11, 7], [12, 9], [18, 13], [18, 11]], 'B');
    g.poly([[9, 7], [8, 9], [2, 12], [2, 10]], 'B');
    g.ellipse(10, 7, 1.8, 1.8, 'H');
    return { g, key: { T: 'white.x@t', B: 'white.R@b', H: 'red.R@h' } };
  },
  pw_battery: () => {
    const g = new Grid(20, 20);
    g.rect(2, 6, 16, 12, 'C');
    g.rect(4, 4, 3, 2, 'T').rect(13, 4, 3, 2, 'T');
    for (let i = 0; i < 4; i++) g.rect(4 + i * 3.4, 9, 2, 6, i < 3 ? 'G' : 'g');
    g.set(5, 3, 'p').set(14, 3, 'm');
    return { g, key: { C: 'steel.f@c', T: 'iron:4', G: '#6aff6a', g: 'iron:2', p: 'red:4', m: 'ink:3' } };
  },
  st_crate: () => {
    const g = crate(new Grid(20, 20), 2, 4, 16, 14);
    return { g, key: { W: 'lwood.f@w', B: 'wood.x@b' } };
  },
  st_full: () => {
    const g = new Grid(20, 20);
    crate(g, 2, 8, 16, 11);
    // stuff poking out of the top
    g.ellipse(6, 7, 3, 2.6, 'O');
    g.rect(10, 3, 5, 5, 'P');
    g.ellipse(15, 6, 2.4, 2.4, 'C');
    g.ellipse(10, 15, 3.6, 3, 'R');
    g.rect(9, 13, 2, 4, 'w').rect(9, 18, 2, 1, 'w');
    return { g, key: { W: 'lwood.f@w', B: 'wood.x@b', O: 'stone.R@o', P: 'steel.F@p', C: 'copper.R@c', R: 'red.R@x', w: '#ffffff' } };
  },
  st_warehouse: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 9], [10, 2], [19, 9]], 'R');
    g.rect(2, 9, 16, 9, 'W');
    g.rect(6, 11, 8, 7, 'D');
    g.line(6, 11, 13, 17, 'L').line(13, 11, 6, 17, 'L');
    g.rect(8, 5, 4, 2, 'S');
    return { g, key: { R: 'red.x@r', W: 'lwood.y@w', D: 'wood.f@d', L: 'lwood:4', S: 'parch:4' } };
  },
  st_partsrack: () => {
    const g = new Grid(20, 20);
    g.rect(2, 2, 2, 17, 'F').rect(16, 2, 2, 17, 'F');
    for (const y of [6, 11, 16]) g.rect(2, y, 16, 2, 'S');
    g.rect(5, 3, 4, 3, 'A').rect(10, 4, 5, 2, 'P');
    cog(g, 8, 9, 2.6, 5, 'G', 'k');
    g.rect(11, 8, 4, 3, 'C');
    g.rect(5, 13, 4, 3, 'A').rect(10, 13, 5, 3, 'I');
    return { g, key: { F: 'steel.x@f', S: 'steel.y@s', A: 'copper.F@a', P: 'steel.F@p', G: 'brass.R@g', C: 'teal.f@c', I: 'iron.F@i' } };
  },
  st_coalbunker: () => {
    const g = new Grid(20, 20);
    g.rect(1, 9, 18, 10, 'B');
    g.ellipse(10, 9, 7.6, 4.4, 'C');
    g.rect(2, 9, 16, 2, 'C');
    g.set(6, 7, 'g').set(12, 6, 'g').set(14, 8, 'g');
    g.line(1, 13, 18, 13, 'k');
    g.rect(7, 15, 6, 2, 'P');
    return { g, key: { B: 'stone.f@b', C: 'black.R@c', g: 'slate:4', P: 'yellow:3' } };
  },
  st_pile: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 18], [3, 9], [9, 5], [15, 7], [19, 18]], 'T');
    g.line(9, 5, 7, 18, 'k').line(15, 7, 14, 18, 'k');
    crate(g, 12, 12, 7, 7);
    g.ellipse(4, 16, 3, 2.6, 'S');
    return { g, key: { T: 'olive.r@t', W: 'lwood.f@w', B: 'wood.x@b', S: 'straw.R@s' } };
  },
  ind_circuitfab: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 8], [10, 3], [19, 8]], 'R');
    g.rect(2, 8, 16, 10, 'W');
    g.rect(5, 10, 10, 7, 'B');
    g.line(6, 12, 9, 12, 't').line(9, 12, 9, 15, 't').line(11, 11, 11, 15, 't').line(11, 15, 14, 15, 't');
    g.rect(12, 11, 2, 2, 'C');
    g.set(6, 15, 'L');
    return { g, key: { R: 'teal.x@r', W: 'white.y@w', B: 'green.f@b', t: 'gold:4', C: 'black:2', L: '#ff6060' } };
  },
  ind_assembly: () => {
    const g = new Grid(20, 20);
    g.rect(1, 10, 18, 3, 'T');
    g.rect(2, 13, 2, 6, 'L').rect(16, 13, 2, 6, 'L');
    g.rect(3, 6, 5, 4, 'V').rect(4, 4, 3, 2, 'v');
    g.ellipse(13, 7, 3.4, 2.8, 'M');
    g.rect(16, 6, 3, 2, 'S');
    g.set(12, 6, 'h');
    return { g, key: { T: 'wood.y@t', L: 'wood:2', V: 'steel.F@v', v: 'iron:3', M: 'blue.R@m', S: 'steel:4', h: 'blue:5' } };
  },
  res_glass: () => {
    const g = new Grid(20, 20);
    g.poly([[3, 15], [7, 3], [17, 5], [13, 17]], 'G');
    g.line(7, 6, 6, 9, '*').line(8, 5, 9, 5, '*').line(12, 13, 14, 9, 'w');
    return { g, key: { G: 'glass.F@g', w: 'glass:5' } };
  },
  res_wire: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10, 8, 8, 'S');
    g.ellipse(10, 10, 6.2, 6.2, 'W');
    g.where('W', 'w', (x, y) => y % 2 === 1 && y > 4 && y < 16);
    g.ellipse(10, 10, 2.2, 2.2, 'S');
    g.ellipse(10, 10, 1, 1, '.');
    g.line(16, 12, 19, 17, 'W');
    return { g, key: { S: 'lwood.r@s', W: 'copper.R@w', w: 'copper:2' } };
  },
  res_motor: () => {
    const g = new Grid(20, 20);
    g.rect(3, 5, 11, 11, 'M');
    for (let x = 4; x < 13; x += 2) g.line(x, 6, x, 14, 'k');
    g.rect(14, 8, 2, 5, 'E').rect(16, 10, 4, 1, 'S');
    g.rect(2, 16, 13, 2, 'B');
    g.rect(5, 3, 5, 2, 'T');
    return { g, key: { M: 'blue.x@m', E: 'steel.F@e', S: 'steel:5', B: 'iron:3', T: 'copper:3' } };
  },
  res_solar_cell: () => {
    const g = new Grid(20, 20);
    g.rect(2, 3, 16, 14, 'C');
    for (let x = 6; x < 18; x += 4) g.line(x, 3, x, 16, 'L');
    for (let y = 7; y < 17; y += 4) g.line(2, y, 17, y, 'L');
    g.set(4, 5, '*').set(5, 4, '+');
    return { g, key: { C: 'navy.F@c', L: 'steel:4' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
