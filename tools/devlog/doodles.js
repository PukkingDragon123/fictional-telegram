// Notebook doodles for the devlog: wobbly hand-drawn SVG built from a few primitives, drawn
// stroke by stroke (stroke-dashoffset) with handwritten labels revealed left to right.
// Every wobble comes from a seeded generator, so a page looks the same in every frame.
import { mulberry32 } from '../../src/core/rng.js';

const NS = 'http://www.w3.org/2000/svg';
let rnd = mulberry32(5);
const j = (a) => (rnd() - 0.5) * 2 * a;

// smooth path through points (Catmull-Rom -> cubic Bezier)
function smooth(pts, closed = false) {
  const n = pts.length;
  if (n < 2) return '';
  const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
// a hand-drawn ellipse: wobbly radius, starts anywhere, overshoots a little
function ellipse(cx, cy, rx, ry, { wob = 0.04, over = 0.12, rot = 0, n = 22 } = {}) {
  const a0 = rnd() * Math.PI * 2, pts = [];
  const k = 1 + over;
  for (let i = 0; i <= n * k; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const w = 1 + j(wob) + (i / n) * 0.03;
    const x = Math.cos(a) * rx * w, y = Math.sin(a) * ry * w;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return smooth(pts);
}
function line(x1, y1, x2, y2, { bow = 0.04, wob = 1.5 } = {}) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const b = j(bow) * L, pts = [];
  for (let i = 0; i <= 4; i++) {
    const u = i / 4, s = Math.sin(u * Math.PI) * b;
    pts.push([x1 + dx * u + nx * s + (i % 4 ? j(wob) : 0), y1 + dy * u + ny * s + (i % 4 ? j(wob) : 0)]);
  }
  return smooth(pts);
}
function poly(pts, { wob = 1.6, closed = false } = {}) {
  return smooth(pts.map(([x, y]) => [x + j(wob), y + j(wob)]), closed);
}
// curved arrow with a two-stroke head
function arrow(x1, y1, x2, y2, { bend = 0.25, head = 26 } = {}) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const mx = (x1 + x2) / 2 + nx * L * bend, my = (y1 + y2) / 2 + ny * L * bend;
  const body = smooth([[x1, y1], [(x1 + mx) / 2 + j(2), (y1 + my) / 2 + j(2)], [mx, my], [(mx + x2) / 2 + j(2), (my + y2) / 2 + j(2)], [x2, y2]]);
  const ang = Math.atan2(y2 - (my + y2) / 2, x2 - (mx + x2) / 2);
  const h1 = [x2 - Math.cos(ang - 0.5) * head, y2 - Math.sin(ang - 0.5) * head];
  const h2 = [x2 - Math.cos(ang + 0.5) * head, y2 - Math.sin(ang + 0.5) * head];
  return [body, `M${h1[0].toFixed(1)},${h1[1].toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${h2[0].toFixed(1)},${h2[1].toFixed(1)}`];
}
const zig = (x, y, w, n = 5, h = 10) => poly(Array.from({ length: n * 2 + 1 }, (_, i) => [x + (w * i) / (n * 2), y + (i % 2 ? -h : h) * 0.5]), { wob: 1 });

// ------------------------------------------------------------------ pages
// each item: { d, w (stroke width), c (color), t (relative draw time) } | { text, x, y, size, rot, c }
const INK = '#2a2622', RED = '#d8343f', BLUE = '#2f5fb3';
function bear(x, y, s = 1) {
  const S = (v) => v * s;
  return [
    { d: ellipse(x, y, S(78), S(70)) },
    { d: ellipse(x - S(62), y - S(58), S(24), S(22)) },
    { d: ellipse(x + S(62), y - S(58), S(24), S(22)) },
    { d: ellipse(x, y + S(20), S(30), S(22)) },
    { d: ellipse(x, y + S(10), S(9), S(6), { over: 0.4 }), w: 7 },
    { d: ellipse(x - S(30), y - S(14), S(5), S(6), { over: 0.6 }), w: 9 },
    { d: ellipse(x + S(30), y - S(14), S(5), S(6), { over: 0.6 }), w: 9 },
    { d: poly([[x - S(58), y + S(58)], [x - S(84), y + S(150)], [x - S(76), y + S(230)], [x + S(76), y + S(230)], [x + S(84), y + S(150)], [x + S(58), y + S(58)]]) },
    { d: poly([[x - S(14), y + S(66)], [x, y + S(84)], [x + S(14), y + S(66)], [x - S(14), y + S(66)]]), c: RED },
    { d: poly([[x, y + S(84)], [x - S(16), y + S(170)], [x, y + S(192)], [x + S(16), y + S(170)], [x, y + S(84)]]), c: RED },
    { d: poly([[x - S(92), y + S(250)], [x - S(60), y + S(232)], [x - S(40), y + S(252)]]) },
    { d: poly([[x + S(40), y + S(252)], [x + S(60), y + S(232)], [x + S(92), y + S(250)]]) },
  ];
}
function fish(x, y, s = 1, flip = 1) {
  return [
    { d: ellipse(x, y, 34 * s, 20 * s, { over: 0.05 }), w: 6 },
    { d: poly([[x - 32 * s * flip, y], [x - 58 * s * flip, y - 18 * s], [x - 56 * s * flip, y + 18 * s], [x - 32 * s * flip, y]]), w: 6 },
    { d: ellipse(x + 16 * s * flip, y - 4 * s, 3, 3, { over: 0.8 }), w: 7 },
  ];
}
function foxHead(x, y, s = 1, { hat = true, mono = true } = {}) {
  const S = (v) => v * s, it = [];
  it.push({ d: poly([[x - S(110), y - S(10)], [x - S(96), y - S(150)], [x - S(40), y - S(80)], [x + S(40), y - S(80)], [x + S(96), y - S(150)], [x + S(110), y - S(10)], [x + S(60), y + S(70)], [x, y + S(96)], [x - S(60), y + S(70)], [x - S(110), y - S(10)]], { wob: 2 }) });
  it.push({ d: poly([[x - S(84), y - S(40)], [x - S(84), y - S(116)], [x - S(52), y - S(70)]]), w: 5 });
  it.push({ d: poly([[x + S(84), y - S(40)], [x + S(84), y - S(116)], [x + S(52), y - S(70)]]), w: 5 });
  it.push({ d: poly([[x - S(60), y + S(30)], [x - S(20), y + S(50)], [x, y + S(40)], [x + S(20), y + S(50)], [x + S(60), y + S(30)]]), w: 5 });
  it.push({ d: ellipse(x, y + S(36), S(12), S(8), { over: 0.5 }), w: 9 });
  it.push({ d: poly([[x - S(52), y - S(12)], [x - S(36), y - S(22)], [x - S(20), y - S(12)]]), w: 7 });
  it.push({ d: ellipse(x + S(38), y - S(14), S(7), S(9), { over: 0.6 }), w: 9 });
  if (mono) {
    it.push({ d: ellipse(x + S(38), y - S(14), S(26), S(26)), c: '#b8860b', w: 7 });
    it.push({ d: poly([[x + S(60), y], [x + S(80), y + S(60)], [x + S(64), y + S(120)], [x + S(84), y + S(170)]]), c: '#b8860b', w: 4 });
  }
  if (hat) {
    it.push({ d: poly([[x - S(110), y - S(118)], [x - S(20), y - S(142)], [x + S(110), y - S(124)]]) });
    it.push({ d: poly([[x - S(64), y - S(128)], [x - S(70), y - S(270)], [x + S(60), y - S(274)], [x + S(66), y - S(132)]]) });
    it.push({ d: poly([[x - S(66), y - S(160)], [x + S(64), y - S(164)]]), c: RED, w: 12 });
  }
  return it;
}

export const PAGES = {
  // day 1: the idea, on a notebook page
  idea: () => {
    rnd = mulberry32(11);
    return [
      { text: 'THE BEAR MUST EAT??', x: 140, y: 120, size: 80, rot: -2 },
      { d: zig(140, 150, 560, 9, 10), c: RED, w: 5 },
      ...bear(260, 420, 0.95),
      { text: 'office bear', x: 150, y: 720, size: 56, c: BLUE },
      { text: '(wears a tie)', x: 160, y: 772, size: 46, c: BLUE },
      { d: ellipse(650, 820, 190, 110, { wob: 0.05 }), w: 7, c: BLUE },
      ...fish(600, 800, 0.9), ...fish(720, 850, 0.8, -1), ...fish(660, 880, 0.6),
      { d: zig(500, 950, 90, 3, 12), w: 4, c: BLUE }, { d: zig(690, 960, 80, 3, 12), w: 4, c: BLUE },
      { text: 'your pond', x: 560, y: 1010, size: 52, c: BLUE },
      ...arrow(380, 470, 600, 690, { bend: -0.3 }).map((d) => ({ d, c: RED, w: 7 })),
      { text: '5 PM!!', x: 560, y: 470, size: 74, c: RED, rot: 8 },
      ...foxHead(240, 1010, 0.45),
      { text: 'u (a fox)', x: 330, y: 1040, size: 50 },
      { text: 'eat fish = $$$', x: 520, y: 1110, size: 56, c: '#2f8f4a', rot: -3 },
    ];
  },
  // day 4: Reynard concept sketch
  fox: () => {
    rnd = mulberry32(23);
    return [
      { text: 'main character', x: 130, y: 120, size: 84, rot: -2 },
      { d: zig(130, 150, 470, 8, 10), c: RED, w: 5 },
      ...foxHead(450, 640, 1.25),
      ...arrow(780, 520, 560, 640, { bend: 0.25 }).map((d) => ({ d, c: RED, w: 6 })),
      { text: 'monocle', x: 720, y: 470, size: 56, c: RED },
      { text: '= rich', x: 740, y: 520, size: 50, c: RED },
      ...arrow(200, 320, 330, 400, { bend: -0.25 }).map((d) => ({ d, c: BLUE, w: 6 })),
      { text: 'top hat', x: 110, y: 290, size: 54, c: BLUE },
      { text: 'reynard', x: 300, y: 920, size: 96, rot: -3 },
      { text: 'greedy... but cute?', x: 260, y: 1010, size: 58, c: BLUE },
      { text: 'owns the pond. charges bears $$', x: 150, y: 1080, size: 46 },
    ];
  },
};

// build the page into an <svg>; returns { svg, update(u) } where u in 0..1 is drawing progress
export function buildPage(name, { w = 900, h = 1150 } = {}) {
  const items = PAGES[name]();
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  const parts = [];
  let total = 0;
  for (const it of items) {
    if (it.text) {
      const t = document.createElementNS(NS, 'text');
      t.textContent = it.text;
      t.setAttribute('x', it.x);
      t.setAttribute('y', it.y);
      t.setAttribute('font-size', it.size);
      t.setAttribute('fill', it.c || INK);
      t.setAttribute('font-family', 'Caveat');
      t.setAttribute('font-weight', '700');
      if (it.rot) t.setAttribute('transform', `rotate(${it.rot} ${it.x} ${it.y})`);
      const clip = document.createElementNS(NS, 'clipPath');
      const id = 'c' + Math.random().toString(36).slice(2);
      clip.setAttribute('id', id);
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', it.x - 10); r.setAttribute('y', it.y - it.size * 1.2);
      r.setAttribute('height', it.size * 1.8); r.setAttribute('width', 0);
      clip.appendChild(r);
      svg.appendChild(clip);
      t.setAttribute('clip-path', `url(#${id})`);
      svg.appendChild(t);
      const len = it.text.length * it.size * 0.42;
      const dur = 0.25 + it.text.length * 0.035;
      parts.push({ kind: 'text', el: t, rect: r, len, dur, t0: total });
      total += dur + 0.05;
    } else {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', it.d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', it.c || INK);
      p.setAttribute('stroke-width', it.w || 6);
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('pathLength', '1');
      p.setAttribute('stroke-dasharray', '1 1');
      p.setAttribute('stroke-dashoffset', '1');
      svg.appendChild(p);
      const dur = 0.12 + Math.min(0.35, (it.d.length / 900) * 0.3);
      parts.push({ kind: 'path', el: p, dur, t0: total });
      total += dur + 0.02;
    }
  }
  return {
    svg, total,
    // real text widths, once the page is in the document and the fonts are in
    measure() { for (const q of parts) if (q.kind === 'text') q.len = q.el.getComputedTextLength() * 1.04 + 16; },
    // s = seconds of drawing
    update(s) {
      for (const q of parts) {
        const u = Math.max(0, Math.min(1, (s - q.t0) / q.dur));
        if (q.kind === 'path') q.el.setAttribute('stroke-dashoffset', String(1 - u));
        else q.rect.setAttribute('width', String(q.len * u + 10 * (u > 0)));
      }
    },
    // when did each stroke start (for pen sounds)
    starts: () => parts.map((q) => q.t0),
  };
}
