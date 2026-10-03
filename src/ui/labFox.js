// LabFox: Reynard in his lab coat + brass goggles, a tiny procedural pixel
// sprite who lives inside the research tree (src/ui/LabTree.js).
//
// He walks along the circuit pipes between nodes (Dijkstra on the tree's
// half-cell routing grid, pipes are cheap, bare floor costs more, encrypted
// sections are walls), climbs vertical pipes, hops gaps, jumps onto the node
// being researched and works on it (typing on a holo keyboard, pouring
// flasks, scribbling on a clipboard, poking it with a wrench: sparks!),
// celebrates when a job finishes, gets turbo-charged by paid rushes, wanders
// and inspects nodes or naps when the bench is empty, beams himself across
// the tree for long trips, and reacts when you click him.
//
//   const fox = new LabFox(tree);   // tree = a LabTree (uses its grid, nodes, jobs)
//   fox.update(dt); fox.onStart(n); fox.onDone(n); fox.onRush(n, mode);
//   fox.onUnlock(B); fox.onSelect(n); fox.destroy();
//
// Everything is drawn into one 64x56 canvas (2x in world px) every frame.

const AW = 64; // art canvas
const AH = 56;
const AX = 32; // feet anchor inside the art
const AY = 52;
const SCALE = 2; // css px per art px (world space)

const P = {
  o: '#140c16', // outline
  f: '#e0662a', F: '#f38a42', d: '#b54a1e', D: '#8e3814',
  c: '#f8eedc', C: '#d9c2a2',
  k: '#241a22', e: '#f6c7b4',
  s: '#302634', S: '#46394e',
  w: '#f4f6f4', W: '#ffffff', g: '#c6ced6', G: '#98a4b0',
  sky: '#bfe0f4', b: '#7a3ea8', B: '#a46ad0',
  st: '#3a2c3c', r: '#d09a44', R: '#f4cc74', l: '#6ee0f4', L: '#e4fdff',
  badge: '#4ad0e0', pen1: '#e04848', pen2: '#4a6ae0',
  wood: '#b0773e', woodD: '#8a5a2c', paper: '#fbf8ee', ink: '#5a7aa8',
  steel: '#a8b2c2', steelD: '#5c6474', pencil: '#f4c430', mug: '#e05a3a', mugD: '#a83a24',
};

const LINES = {
  work: ['Hmm...', 'Fascinating!', 'Carry the two...', 'More voltage!', 'Almost...', 'SCIENCE!', 'Beep boop.', 'Hold still...', 'Ooh, sparks!'],
  done: ['EUREKA!', 'IT WORKS!', 'Mwahaha!', 'Genius!', 'Ka-ching!'],
  click: ["Don't touch the goggles!", "I'm WORKING here!", 'Hehe, that tickles!', 'Science waits for no fox!', 'Mwahaha!', 'Hi, partner!', 'Coins make it go faster. Heh.'],
  wake: ["Wha-?! I wasn't sleeping!", 'Huh?! Science time!', 'Mmf... five more minutes...'],
  inspect: ['Ooh, shiny...', 'Research this next?', 'Interesting...', 'I want THIS one.', 'Hmm hmm hmm.'],
  idle: ['Bench is empty...', 'Pick something!', '*sip*', 'So much to invent.'],
  start: ['!', 'On it!', 'SCIENCE!', 'Ooh, new project!'],
  rush: ['OVERCLOCK!', 'TURBO!', 'Ka-ching!'],
  unlock: ['ACCESS GRANTED!', 'New section!', 'Decrypted!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---------------------------------------------------------------- painter
class Pen {
  constructor(ctx) { this.c = ctx; }
  r(x, y, w, h, col) { if (w <= 0 || h <= 0) return; this.c.fillStyle = P[col] || col; this.c.fillRect(AX + Math.round(x), AY + Math.round(y), w, h); }
  p(x, y, col) { this.r(x, y, 1, 1, col); }
  line(x0, y0, x1, y1, col, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, guard = 0;
    const o = th >> 1;
    for (;;) {
      this.r(x0 - o, y0 - o, th, th, col);
      if ((x0 === x1 && y0 === y1) || guard++ > 64) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

// ---------------------------------------------------------------- poses
// Every pose returns the body parameters for one frame (facing right, feet at 0,0).
function basePose(t) {
  return {
    by: 0, lf: [0, 0], lb: [0, 0], aF: [3, -9], aB: [-3, -9], hx: 0, hy: 0,
    eyes: (t % 3.7) < 0.12 ? 'shut' : 'open', gog: 'up', mouth: '', tail: Math.sin(t * 1.6) * 0.6, item: null, lie: false,
  };
}
function poseFor(name, t, k = 0, opt = {}) {
  const o = basePose(t);
  switch (name) {
    case 'walk':
    case 'run': {
      const run = name === 'run';
      const c = t * (run ? 15 : 10);
      const s = Math.sin(c);
      const st = run ? 2 : 1.5;
      o.lf = [Math.round(s * st), Math.cos(c) > 0.3 ? 1 : 0];
      o.lb = [Math.round(-s * st), Math.cos(c) < -0.3 ? 1 : 0];
      o.by = Math.abs(s) > 0.75 ? -1 : 0;
      o.aF = [3 - Math.round(s * 2), -9 - (run ? 2 : 0)];
      o.aB = [-3 + Math.round(s * 2), -9 - (run ? 2 : 0)];
      if (run) { o.hx = 1; o.aF = [5, -12 + Math.round(s)]; o.aB = [-1, -12 - Math.round(s)]; }
      o.tail = Math.sin(c * 0.5) * 1.2 + (run ? -1.4 : 0);
      break;
    }
    case 'climb': {
      const c = t * 9;
      const s = Math.sin(c) > 0 ? 1 : 0;
      o.aF = [5, s ? -28 : -25];
      o.aB = [-2, s ? -25 : -28];
      o.lf = [0, s ? 2 : 0];
      o.lb = [0, s ? 0 : 2];
      o.by = s ? -1 : 0;
      o.tail = Math.sin(c) * 1.5;
      o.hy = -1;
      break;
    }
    case 'jump': {
      // k: 0..1 through the hop
      if (k < 0.12 || k > 0.92) { o.by = 2; o.lf = [1, -2]; o.lb = [-1, -2]; o.aF = [4, -8]; o.aB = [-4, -8]; }
      else { o.lf = [1, 2]; o.lb = [-1, 1]; o.aF = [5, -18]; o.aB = [-4, -17]; o.mouth = 'o'; o.tail = -1.6; }
      break;
    }
    case 'type': {
      const f = Math.floor(t * (opt.turbo ? 26 : 13));
      o.gog = 'down';
      o.hx = 1;
      o.aF = [8, -11 + (f % 2)];
      o.aB = [6, -11 + ((f + 1) % 2)];
      o.item = 'kbd';
      o.tail = Math.sin(t * 2.4) * 0.7;
      if (opt.turbo) o.mouth = 'grin';
      break;
    }
    case 'pour': {
      const c = (t % 3) / 3;
      o.gog = 'down';
      o.aF = [9, -17 + (c < 0.5 ? 0 : 1)];
      o.aB = [-2, -10];
      o.item = 'flask';
      o.hx = 1;
      o.hy = 1;
      break;
    }
    case 'scribble': {
      const c = t * 7;
      o.eyes = 'focus';
      o.hy = 1;
      o.aB = [6, -8];
      o.aF = [7 + Math.round(Math.sin(c) * 1.5), -11 + (Math.floor(t * 1.5) % 3)];
      o.item = 'clip';
      break;
    }
    case 'wrench': {
      const c = (t * 2.2) % 1;
      o.gog = 'down';
      o.by = 1;
      o.lf = [1, -1];
      o.lb = [-1, -1];
      const up = c < 0.5;
      o.aF = up ? [6, -14] : [8, -6];
      o.aB = [-3, -8];
      o.item = 'wrench';
      o.wrenchHit = !up && c < 0.62;
      o.hx = 1;
      o.hy = 1;
      break;
    }
    case 'inspect': {
      o.hx = 1;
      o.by = Math.round(Math.sin(t * 1.3) * 0.5);
      o.aF = [8, -16];
      o.aB = [-3, -10];
      o.item = 'mag';
      o.eyes = 'open';
      break;
    }
    case 'coffee': {
      const c = (t % 2.6) / 2.6;
      const sip = c > 0.55 && c < 0.85;
      o.aF = sip ? [7, -19] : [5, -12];
      o.aB = [-3, -9];
      o.item = 'mug';
      o.eyes = sip ? 'shut' : o.eyes;
      break;
    }
    case 'celebrate': {
      const c = t * 8;
      o.by = -Math.round(Math.abs(Math.sin(c)) * 7);
      o.lf = [1, o.by < -3 ? 2 : 0];
      o.lb = [-1, o.by < -3 ? 2 : 0];
      o.aF = [5, -24 - (Math.sin(c * 2) > 0 ? 1 : 0)];
      o.aB = [-4, -23 - (Math.sin(c * 2) > 0 ? 0 : 1)];
      o.eyes = 'happy';
      o.mouth = 'grin';
      o.tail = Math.sin(c * 1.5) * 2;
      break;
    }
    case 'surprise': {
      o.by = k < 0.4 ? -Math.round(Math.sin((k / 0.4) * Math.PI) * 8) : 0;
      o.aF = [6, -21];
      o.aB = [-5, -20];
      o.eyes = 'wide';
      o.mouth = 'o';
      o.tail = -1.8;
      break;
    }
    case 'wave': {
      const c = Math.floor(t * 6) % 2;
      o.aF = [5 + c, -23];
      o.aB = [-3, -9];
      o.eyes = 'happy';
      o.mouth = 'grin';
      break;
    }
    case 'laugh': {
      const c = Math.floor(t * 10) % 2;
      o.by = c;
      o.aF = [4, -13 + c];
      o.aB = [-1, -13 + c];
      o.eyes = 'happy';
      o.mouth = 'grin';
      o.hy = -c;
      break;
    }
    case 'point': {
      o.aF = [9, -15];
      o.aB = [-3, -9];
      o.hx = 1;
      break;
    }
    case 'nap': {
      o.lie = true;
      o.eyes = 'shut';
      o.breath = Math.sin(t * 2) > 0 ? 1 : 0;
      break;
    }
    default: break;
  }
  return o;
}

// ---------------------------------------------------------------- body
function drawTail(pn, o) {
  const W = [1, 2, 2, 3, 3, 3, 3, 3, 2, 1];
  for (let i = 0; i < W.length; i++) {
    const cx = -5 - i * 0.62 + o.tail * i * i * 0.022;
    const cy = -5 - i * 1.05 + o.by * 0.6;
    const hw = W[i];
    const tip = i >= 7;
    pn.r(Math.round(cx - hw), Math.round(cy), hw * 2 + 1, 1, tip ? 'c' : 'f');
    if (!tip) { pn.p(Math.round(cx - hw), Math.round(cy), 'd'); pn.p(Math.round(cx + hw), Math.round(cy), 'F'); }
  }
}
function drawArm(pn, sx, sy, a, col, by) {
  const px = a[0], py = a[1] + by;
  pn.line(sx, sy, px, py, col, 2);
  pn.r(px - 1, py - 1, 2, 2, 's');
}
function drawLeg(pn, x0, l, by) {
  const x = x0 + l[0];
  const top = -5 + Math.min(0, by);
  const bot = -1 - l[1];
  pn.r(x, top, 2, bot - top + 1, 's');
  pn.r(x, bot, 3, 1, 'S');
}
function drawHead(pn, o) {
  const x = o.hx, y = o.hy + o.by;
  // ears
  pn.r(x - 3, y - 26, 3, 1, 'd');
  pn.r(x - 3, y - 27, 3, 1, 'f'); pn.p(x - 2, y - 27, 'e');
  pn.r(x - 3, y - 28, 2, 1, 'f');
  pn.p(x - 3, y - 29, 'k');
  pn.r(x + 2, y - 26, 3, 1, 'f');
  pn.r(x + 2, y - 27, 3, 1, 'f'); pn.p(x + 3, y - 27, 'e');
  pn.r(x + 3, y - 28, 2, 1, 'f');
  pn.p(x + 4, y - 29, 'k');
  // skull
  pn.r(x - 2, y - 25, 7, 1, 'F');
  pn.r(x - 3, y - 24, 9, 6, 'f');
  pn.r(x - 2, y - 18, 7, 1, 'f');
  pn.r(x - 3, y - 24, 1, 6, 'd');
  pn.r(x - 1, y - 24, 4, 1, 'F');
  // cheeks + muzzle
  pn.r(x + 0, y - 20, 5, 2, 'c');
  pn.r(x + 1, y - 18, 4, 1, 'C');
  pn.r(x + 5, y - 21, 3, 1, 'f');
  pn.r(x + 5, y - 20, 4, 2, 'c');
  pn.r(x + 5, y - 18, 2, 1, 'C');
  pn.r(x + 8, y - 21, 2, 2, 'k');
  if (o.mouth === 'grin') { pn.r(x + 5, y - 18, 3, 1, 'k'); pn.p(x + 6, y - 17, '#e05a6a'); }
  else if (o.mouth === 'o') { pn.r(x + 6, y - 18, 2, 2, 'k'); }
  // eyes
  if (o.gog !== 'down') {
    if (o.eyes === 'shut') pn.r(x + 2, y - 22, 3, 1, 'k');
    else if (o.eyes === 'happy') { pn.p(x + 2, y - 22, 'k'); pn.p(x + 3, y - 23, 'k'); pn.p(x + 4, y - 22, 'k'); }
    else if (o.eyes === 'wide') { pn.r(x + 2, y - 24, 3, 3, 'W'); pn.r(x + 3, y - 23, 2, 2, 'k'); }
    else if (o.eyes === 'focus') { pn.r(x + 3, y - 22, 2, 1, 'k'); pn.p(x + 2, y - 23, 'd'); pn.p(x + 3, y - 23, 'd'); }
    else { pn.r(x + 3, y - 23, 2, 2, 'k'); pn.p(x + 4, y - 23, 'W'); }
  }
  // goggles
  if (o.gog === 'down') {
    pn.r(x - 3, y - 23, 6, 1, 'st');
    pn.r(x + 2, y - 25, 4, 1, 'r'); pn.r(x + 2, y - 21, 4, 1, 'r');
    pn.r(x + 1, y - 24, 1, 3, 'r'); pn.r(x + 6, y - 24, 1, 3, 'rd');
    pn.r(x + 2, y - 24, 4, 3, 'l');
    pn.p(x + 2, y - 24, 'L'); pn.p(x + 3, y - 24, 'L');
  } else {
    pn.r(x - 3, y - 25, 3, 1, 'st');
    pn.r(x - 0, y - 28, 4, 1, 'R'); pn.r(x - 0, y - 25, 4, 1, 'r');
    pn.r(x - 1, y - 27, 1, 2, 'r'); pn.r(x + 4, y - 27, 1, 2, 'r');
    pn.r(x + 0, y - 27, 4, 2, 'l');
    pn.p(x + 0, y - 27, 'L');
  }
}
P.rd = '#9a6a28';
function drawBody(pn, o) {
  const by = o.by;
  // coat skirt + torso
  const rows = [[-9, -4, 8], [-8, -5, 10], [-7, -5, 10], [-6, -5, 10], [-5, -6, 12]];
  for (const [y, x, w] of rows) { pn.r(x, y + by, w, 1, 'w'); pn.p(x, y + by, 'g'); pn.p(x + w - 1, y + by, 'g'); }
  pn.r(-6, -5 + by, 12, 1, 'g');
  pn.r(2, -8 + by, 1, 4, 'g'); // the coat opening
  pn.r(-4, -16 + by, 8, 7, 'w');
  pn.r(-4, -16 + by, 1, 7, 'g');
  pn.r(-3, -16 + by, 6, 1, 'W');
  // shirt V + bow tie
  pn.r(1, -15 + by, 2, 2, 'sky');
  pn.r(0, -16 + by, 4, 2, 'b');
  pn.r(1, -16 + by, 2, 1, 'B');
  // pocket with pens, ID badge
  pn.r(1, -12 + by, 3, 2, 'g');
  pn.p(1, -13 + by, 'pen1'); pn.p(2, -13 + by, 'pen2');
  pn.r(-3, -13 + by, 2, 2, 'badge'); pn.p(-3, -13 + by, 'L');
  // buttons
  pn.p(3, -10 + by, 'G'); pn.p(3, -7 + by, 'G');
}
function drawNap(pn, o) {
  const b = o.breath;
  // tail wrapped round the front
  pn.r(-9, -4, 16, 3, 'f');
  pn.r(4, -5, 5, 4, 'f');
  pn.r(7, -4, 4, 3, 'c');
  pn.r(-9, -2, 18, 2, 'd');
  // body: a coat-covered loaf
  pn.r(-8, -10 - b, 12, 7 + b, 'w');
  pn.r(-8, -10 - b, 12, 1, 'W');
  pn.r(-8, -4, 12, 1, 'g');
  pn.r(-3, -8 - b, 2, 2, 'badge');
  // head resting on the tail
  pn.r(2, -11, 8, 6, 'f');
  pn.r(3, -12, 6, 1, 'F');
  pn.r(2, -11, 1, 6, 'd');
  pn.r(6, -8, 5, 3, 'c');
  pn.r(10, -9, 2, 2, 'k');
  pn.r(5, -9, 3, 1, 'k');
  pn.r(3, -14, 2, 2, 'f'); pn.p(3, -15, 'k');
  pn.r(6, -14, 2, 2, 'f'); pn.p(7, -15, 'k');
  // goggles on the forehead
  pn.r(2, -12, 7, 1, 'st');
  pn.r(4, -14, 3, 2, 'l'); pn.p(4, -14, 'L');
}
function drawItem(pn, o, tint, t) {
  const by = o.by;
  const [px, py0] = o.aF;
  const py = py0 + by;
  switch (o.item) {
    case 'flask': {
      // tilted flask over a beaker on the floor
      // round-bottom flask tipped forward: body above the paw, neck pointing down at the beaker
      pn.r(px - 1, py - 5, 4, 4, '#d8f4ff');
      pn.r(px, py - 4, 3, 3, tint);
      pn.p(px, py - 5, '#ffffff');
      pn.r(px + 3, py - 2, 1, 1, '#d8f4ff');
      pn.r(px + 3, py - 1, 1, 1, '#d8f4ff');
      // beaker
      pn.r(10, -7, 1, 7, '#cfe6f4'); pn.r(15, -7, 1, 7, '#cfe6f4'); pn.r(10, -1, 6, 1, '#cfe6f4');
      const lvl = 1 + Math.floor((t % 3) / 3 * 4);
      pn.r(11, -1 - lvl, 4, lvl, tint);
      pn.p(11, -1 - lvl, '#ffffff');
      break;
    }
    case 'clip': {
      const [bx, by2] = o.aB;
      const y = by2 + by;
      pn.r(bx - 1, y - 6, 6, 8, 'wood');
      pn.r(bx, y - 5, 4, 6, 'paper');
      pn.r(bx + 1, y - 7, 2, 1, 'steel');
      for (let i = 0; i < 3; i++) pn.r(bx, y - 4 + i * 2, 1 + ((Math.floor(t * 3) + i) % 4), 1, 'ink');
      pn.line(px, py, px + 2, py - 3, 'pencil', 1);
      pn.p(px - 1, py + 1, 'k');
      break;
    }
    case 'wrench': {
      const up = py < -10 + by;
      const ex = px + (up ? 3 : 4), ey = py + (up ? -4 : 2);
      pn.line(px, py, ex, ey, 'steel', 2);
      pn.r(ex - 1, ey - 1, 3, 2, 'steelD');
      pn.p(ex, ey - 1, 'steel');
      break;
    }
    case 'mag': {
      pn.line(px, py, px + 2, py - 2, 'woodD', 1);
      const cx = px + 4, cy = py - 5;
      pn.r(cx - 2, cy - 3, 5, 1, 'r'); pn.r(cx - 2, cy + 3, 5, 1, 'r');
      pn.r(cx - 3, cy - 2, 1, 5, 'r'); pn.r(cx + 3, cy - 2, 1, 5, 'r');
      break;
    }
    case 'mug': {
      pn.r(px - 1, py - 3, 3, 4, 'mug');
      pn.r(px - 1, py - 3, 3, 1, '#6a3a1c');
      pn.p(px + 2, py - 2, 'mugD');
      pn.p(px + 2, py - 1, 'mugD');
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- the fox
export class LabFox {
  constructor(tree) {
    this.tree = tree;
    this.el = document.createElement('div');
    this.el.className = 'lt-fox';
    this.cv = mk(AW, AH);
    this.cv.className = 'lt-fox-cv';
    this.ctx = this.cv.getContext('2d');
    this.hit = document.createElement('button');
    this.hit.type = 'button';
    this.hit.className = 'lt-fox-hit';
    this.hit.tabIndex = -1;
    this.hit.setAttribute('aria-label', 'Reynard the lab fox');
    this.$say = document.createElement('div');
    this.$say.className = 'lt-fox-say';
    this.el.append(this.cv, this.hit, this.$say);
    tree.world.appendChild(this.el);
    this.spr = mk(AW, AH);
    this.sctx = this.spr.getContext('2d');
    this.sil = mk(AW, AH);
    this.lctx = this.sil.getContext('2d');
    this.pen = new Pen(this.sctx);
    this.fpen = new Pen(this.ctx);

    this.t = 0;
    this.x = 0;
    this.y = 0;
    this.face = 1;
    this.on = null; // node he is standing on
    this.cell = null; // grid cell he is standing on (when not on a node)
    this.moves = [];
    this.mv = null;
    this.dest = null;
    this.act = 'idle';
    this.actT = 0;
    this.actDur = 2;
    this.anim = 'stand';
    this.animK = 0;
    this.focus = null;
    this.workT = 0;
    this.idleT = 0;
    this.lineT = 4 + Math.random() * 4;
    this.sayT = 0;
    this.parts = [];
    this.beam = 0;
    this.turboT = 0;
    this.clicks = 0;
    this._grid();
    this._place(this._startNode());
    this.hit.addEventListener('click', this._onClick);
    this._draw();
  }

  destroy() {
    this.hit.removeEventListener('click', this._onClick);
    this.el.remove();
  }

  // ------------------------------------------------------------ grid / paths
  _grid() {
    const T = this.tree;
    this.GW = T.GW;
    this.GH = T.GH;
    this.pipe = new Uint8Array(this.GW * this.GH);
    this.nodeAt = new Map();
    for (const n of T.nodes) this.nodeAt.set(n.gy * this.GW + n.gx, n);
    for (const e of T.edges) {
      const pts = e.pts || [];
      for (let i = 1; i < pts.length - 1; i++) this.pipe[pts[i][1] * this.GW + pts[i][0]] = 1;
    }
  }
  _blockedRows() {
    const T = this.tree;
    const rows = new Uint8Array(this.GH);
    for (const B of T.branches) {
      if (!T._sealed(B)) continue;
      for (let gy = 2 * B.lane0 + 1; gy <= 2 * (B.lane0 + B.lanes) - 1; gy++) rows[gy] = 1;
    }
    return rows;
  }
  _cellPt(k) {
    const T = this.tree;
    const n = this.nodeAt.get(k);
    if (n) return { x: n.x, y: n.y - 29, node: n, k };
    const gx = k % this.GW, gy = (k / this.GW) | 0;
    return { x: T._X(gx), y: T._Y(gy) - (this.pipe[k] ? 3 : 0), node: null, k };
  }
  _curCell() {
    if (this.on) return this.on.gy * this.GW + this.on.gx;
    if (this.cell != null) return this.cell;
    // nearest grid cell to where he stands
    const T = this.tree;
    let best = 0, bd = Infinity;
    for (let gy = 0; gy < this.GH; gy++) {
      const dy = T._Y(gy) - this.y;
      if (Math.abs(dy) > 200) continue;
      for (let gx = 0; gx < this.GW; gx++) {
        const k = gy * this.GW + gx;
        if (this.nodeAt.has(k)) continue;
        const d = Math.hypot(T._X(gx) - this.x, dy);
        if (d < bd) { bd = d; best = k; }
      }
    }
    return best;
  }
  _path(from, to) {
    const GW = this.GW, GH = this.GH, N = GW * GH;
    const T = this.tree;
    const rows = this._blockedRows();
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    dist[from] = 0;
    // small grid (a few thousand cells): a plain O(N^2)-ish scan is too slow, use a bucket-ish heap
    const heap = [[0, from]];
    const push = (d, k) => {
      heap.push([d, k]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= d) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, k] = pop();
      if (done[k]) continue;
      done[k] = 1;
      if (k === to) break;
      const x = k % GW, y = (k / GW) | 0;
      const px = T._X(x), py = T._Y(y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nk = ny * GW + nx;
        if (done[nk]) continue;
        if (nk !== to && this.nodeAt.has(nk)) continue;
        if (nk !== to && rows[ny]) continue;
        const len = Math.hypot(T._X(nx) - px, T._Y(ny) - py);
        const c = len * (this.pipe[nk] && (this.pipe[k] || this.nodeAt.has(k)) ? 1 : 2.2);
        const nd = d + c;
        if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push(nd, nk); }
      }
    }
    if (prev[to] < 0 && from !== to) return null;
    const out = [];
    for (let k = to; k >= 0; k = prev[k]) { out.push(k); if (k === from) break; }
    out.reverse();
    return out[0] === from ? out : null;
  }

  // walk / run / beam to a node
  goTo(n, { run = false } = {}) {
    if (!n || n === this.on) return false;
    if (this.dest === n && (this.mv || this.moves.length)) return true;
    const from = this._curCell();
    const to = n.gy * this.GW + n.gx;
    const cells = this._path(from, to);
    this.moves = [];
    this.mv = null;
    this.dest = n;
    let len = 0;
    if (cells) {
      const pts = cells.map((k) => this._cellPt(k));
      pts[0] = this.on ? pts[0] : { ...pts[0], x: this.x, y: this.y };
      for (let i = 1; i < pts.length; i++) len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
      if (len <= 1300 && !REDUCED) {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          let kind;
          if (a.node || b.node) kind = 'jump';
          else if (this.pipe[a.k] && this.pipe[b.k]) kind = a.y === b.y ? 'walk' : 'climb';
          else kind = 'hop';
          const last = this.moves[this.moves.length - 1];
          if (last && last.kind === kind && ((kind === 'walk' && last.y1 === b.y) || (kind === 'climb' && last.x1 === b.x))) { last.x1 = b.x; last.y1 = b.y; last.k = b.k; continue; }
          this.moves.push({ kind, x0: a.x, y0: a.y, x1: b.x, y1: b.y, k: b.k, node: b.node });
        }
      }
    }
    if (!this.moves.length) {
      // too far (or no way through): beam over
      const tp = this._cellPt(to);
      this.moves.push({ kind: 'beamout', dur: 0.5 }, { kind: 'warp', x1: tp.x, y1: tp.y, k: to, node: n }, { kind: 'beamin', dur: 0.5 });
    }
    for (const m of this.moves) {
      if (m.dur) continue;
      const d = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
      if (m.kind === 'walk') m.dur = d / (run ? 230 : 110);
      else if (m.kind === 'climb') m.dur = d / (run ? 170 : 85);
      else if (m.kind === 'hop') m.dur = 0.22 + d / (run ? 520 : 340);
      else if (m.kind === 'jump') m.dur = 0.42 + d / 900;
      else m.dur = 0.01;
      m.run = run;
    }
    this.on = null;
    this.setAct('travel', 999);
    return true;
  }

  _place(n) {
    if (!n) { this.x = this.tree._X(1); this.y = this.tree._Y(1) - 29; return; }
    this.on = n;
    this.cell = null;
    this.x = n.x;
    this.y = n.y - 29;
  }
  _startNode() {
    const T = this.tree;
    const j = T._jobs.find((q) => q.n && !T._sealed(q.n.B));
    if (j) return j.n;
    const st = (n) => T._st.get(n.id);
    return T.nodes.find((n) => st(n) === 'avail') || T.nodes.find((n) => st(n) === 'done') || T.nodes.find((n) => !T._sealed(n.B)) || null;
  }

  // ------------------------------------------------------------ acts
  setAct(act, dur = 2, anim = null) {
    this.act = act;
    this.actT = 0;
    this.actDur = dur;
    if (anim) this.anim = anim;
  }
  say(text, dur = 2.2) {
    if (!text) return;
    this.$say.textContent = text;
    this.$say.classList.remove('is-on');
    void this.$say.offsetWidth;
    this.$say.classList.add('is-on');
    this.sayT = dur;
  }
  // stop walking: land on the end of the current step (a valid place to stand)
  _interrupt() {
    const m = this.mv;
    if (m && m.x1 != null) {
      this.x = m.x1;
      this.y = m.y1;
      if (m.node) { this.on = m.node; this.cell = null; } else this.cell = m.k;
    } else if (this.dest && this.beam > 0) this._place(this.dest);
    this.mv = null;
    this.moves = [];
    this.beam = 0;
    this.dest = null;
  }
  _busy() { return this.act === 'celebrate' || this.act === 'react' || this.act === 'turbo'; }
  _workAnim(n) {
    const d = n?.d || {};
    const list = d.species ? ['pour', 'type', 'scribble', 'pour'] : d.build ? ['wrench', 'type', 'scribble', 'wrench'] : ['type', 'pour', 'wrench', 'scribble'];
    let a = pick(list);
    if (a === this.anim) a = pick(list);
    return a;
  }

  onStart(n) {
    this.idleT = 0;
    if (this.act === 'nap') { this.setAct('react', 1.1, 'surprise'); this.say(pick(LINES.wake)); }
    else if (!this._busy()) this.say(pick(LINES.start), 1.4);
    if (!this.focus || !this.tree._jobIds?.has(this.focus.id)) this.focus = n;
  }
  onDone(n) {
    this.idleT = 0;
    const near = this.on === n || Math.hypot(n.x - this.x, n.y - 29 - this.y) < 140;
    if (this.act === 'travel' && !near) { this.say(pick(LINES.done), 1.6); return; }
    if (this.act === 'travel') { this._interrupt(); if (this.dest === n || !this.on) this._place(n); }
    this.setAct('celebrate', 1.8, 'celebrate');
    this.say(pick(LINES.done), 2);
    this._confetti(26);
    this.tree._sfx('foxyay');
    if (this.focus === n) this.focus = null;
  }
  onRush(n, mode) {
    this.idleT = 0;
    if (this.on === n && mode !== 'now') {
      this.setAct('turbo', 1.6, 'type');
      this.turboT = 1.6;
      this.say(pick(LINES.rush), 1.5);
      this._sparks(10, 9, -12);
    } else if (mode !== 'now') this.say('Ka-ching!', 1.4);
  }
  onUnlock(B) {
    this.idleT = 0;
    this._interrupt();
    this.setAct('celebrate', 1.9, 'celebrate');
    this.say(pick(LINES.unlock), 2.2);
    this._confetti(30);
    this.unlocked = B;
  }
  onSelect(n) {
    if (this._busy() || this.act === 'nap' || this.mv || this.tree._jobs.length) return;
    if (Math.abs(n.x - this.x) > 4) this.face = n.x > this.x ? 1 : -1;
    if (Math.random() < 0.25 && this.tree._st.get(n.id) === 'avail') this.say('Ooh, that one?', 1.6);
  }
  _onClick = (e) => {
    e.stopPropagation();
    if (this.tree._dragJustEnded?.()) return;
    this.tree._sfx('fox');
    this.idleT = 0;
    this.clicks++;
    if (this.act === 'nap') { this.setAct('react', 1.2, 'surprise'); this.say(pick(LINES.wake), 2.2); return; }
    const r = ['surprise', 'wave', 'laugh', 'surprise'][this.clicks % 4];
    if (this.act === 'travel') { this.say(pick(LINES.click), 1.8); return; }
    this.setAct('react', r === 'laugh' ? 1.3 : 1.1, r);
    this.say(r === 'surprise' && this.clicks < 3 ? '!' : pick(LINES.click), 2);
    if (r === 'laugh') this.tree._sfx('foxyay');
  };

  // ------------------------------------------------------------ brain
  _think(dt) {
    const T = this.tree;
    const jobs = T._jobs.filter((j) => j.n && !T._sealed(j.n.B));
    if (this.act === 'travel') return;
    if (this._busy() && this.actT < this.actDur) return;
    if (jobs.length) {
      this.idleT = 0;
      let target = this.focus && jobs.find((j) => j.n === this.focus) ? this.focus : null;
      if (!target) target = (jobs.find((j) => j.n === this.on) || jobs[0]).n;
      if (jobs.length > 1 && this.on === target && this.workT > 11) {
        const other = jobs.find((j) => j.n !== target);
        if (other) { target = other.n; this.workT = 0; }
      }
      this.focus = target;
      if (this.on === target) {
        if (this.act !== 'work' || this.actT > this.actDur) { this.setAct('work', 4 + Math.random() * 3, this._workAnim(target)); this.face = 1; }
        this.workT += dt;
        this.lineT -= dt;
        if (this.lineT <= 0) { this.lineT = 7 + Math.random() * 6; this.say(pick(LINES.work), 1.8); }
        return;
      }
      this.workT = 0;
      this.goTo(target, { run: true });
      return;
    }
    // bench empty
    this.focus = null;
    if (this.act === 'nap') return;
    if (this.idleT > 32) { this.setAct('nap', 1e9, 'nap'); this.say('Zzz...', 1.5); return; }
    if (this.act === 'work' || this.act === 'turbo' || this.actT >= this.actDur) {
      const r = Math.random();
      if (this.unlocked) {
        const B = this.unlocked;
        this.unlocked = null;
        const n = B.nodes.find((q) => T._st.get(q.id) === 'avail') || B.nodes[0];
        if (n && this.goTo(n)) { this.after = 'inspect'; return; }
      }
      if (r < 0.42) {
        const avail = T.nodes.filter((n) => T._st.get(n.id) === 'avail' && n !== this.on && Math.hypot(n.x - this.x, n.y - this.y) < 700);
        const n = avail.length ? pick(avail) : null;
        if (n && this.goTo(n)) { this.after = 'inspect'; return; }
      }
      if (r < 0.62) { this.setAct('idle', 3.5, 'coffee'); if (Math.random() < 0.4) this.say('*sip*', 1.2); return; }
      if (r < 0.8) {
        const done = T.nodes.filter((n) => T._st.get(n.id) === 'done' && n !== this.on && Math.hypot(n.x - this.x, n.y - this.y) < 600);
        const n = done.length ? pick(done) : null;
        if (n && this.goTo(n)) { this.after = 'idle'; return; }
      }
      if (r < 0.9 && T.sel && T._st.get(T.sel.id) === 'avail') { this.face = T.sel.x >= this.x ? 1 : -1; this.setAct('idle', 1.6, 'point'); this.say(pick(LINES.idle), 1.6); return; }
      this.setAct('idle', 1.5 + Math.random() * 2.5, 'stand');
      if (Math.random() < 0.5) this.face = -this.face;
    }
  }

  _arrive() {
    const last = this.dest;
    this.dest = null;
    if (last) { this.on = last; this.x = last.x; this.y = last.y - 29; this.cell = null; }
    const after = this.after;
    this.after = null;
    if (after === 'inspect') { this.setAct('idle', 3.2, 'inspect'); this.face = 1; if (Math.random() < 0.5) this.say(pick(LINES.inspect), 1.8); }
    else this.setAct('idle', 0.4, 'stand');
  }

  _stepMove(dt) {
    if (!this.mv) {
      this.mv = this.moves.shift() || null;
      if (!this.mv) { this._arrive(); return; }
      this.mv.t = 0;
      if (this.mv.kind === 'beamout' || this.mv.kind === 'beamin') this.tree._sfx('beam');
    }
    const m = this.mv;
    m.t += dt;
    const k = clamp(m.t / m.dur, 0, 1);
    if (m.kind === 'beamout') { this.beam = k; this.anim = 'stand'; }
    else if (m.kind === 'beamin') { this.beam = 1 - k; this.anim = 'stand'; }
    else if (m.kind === 'warp') { this.x = m.x1; this.y = m.y1; this.beam = 1; }
    else {
      const e = m.kind === 'jump' || m.kind === 'hop' ? k : k;
      this.x = m.x0 + (m.x1 - m.x0) * e;
      this.y = m.y0 + (m.y1 - m.y0) * e;
      if (m.x1 !== m.x0) this.face = m.x1 > m.x0 ? 1 : -1;
      if (m.kind === 'jump' || m.kind === 'hop') {
        const h = m.kind === 'jump' ? 22 + Math.abs(m.y1 - m.y0) * 0.15 : 9;
        this.y -= Math.sin(k * Math.PI) * h;
        this.anim = 'jump';
        this.animK = k;
      } else this.anim = m.kind === 'climb' ? 'climb' : m.run ? 'run' : 'walk';
    }
    if (k >= 1) {
      if (m.k != null && !m.node) this.cell = m.k;
      this.mv = null;
      if (!this.moves.length) this._arrive();
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    dt = Math.min(0.1, dt);
    this.t += dt;
    this.actT += dt;
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.$say.classList.remove('is-on'); }
    if (this.turboT > 0) this.turboT -= dt;
    if (this.tree._jobs.length) this.idleT = 0; else this.idleT += dt;
    if (this.act === 'travel') this._stepMove(dt);
    else {
      if (this.on && (this.on.y - 29 !== this.y || this.on.x !== this.x)) { this.x = this.on.x; this.y = this.on.y - 29; }
      if (this.act === 'react' || this.act === 'celebrate') this.animK = clamp(this.actT / this.actDur, 0, 1);
      if (this.act === 'work') this.anim = this.anim === 'stand' ? this._workAnim(this.on) : this.anim;
      if (this.act === 'nap') this.anim = 'nap';
      if (this.act === 'turbo' && this.actT >= this.actDur) this.setAct('work', 3, 'type');
      if ((this.act === 'react' || this.act === 'celebrate') && this.actT >= this.actDur) this.setAct('idle', 0.6, 'stand');
      this._think(dt);
    }
    this._fx(dt);
    // place + draw (skip the canvas work when he is off screen)
    this.el.style.transform = `translate(${Math.round(this.x - AX * SCALE)}px, ${Math.round(this.y - AY * SCALE)}px)`;
    const c = this.tree.cam;
    const vw = this.tree.view.clientWidth, vh = this.tree.view.clientHeight;
    const sx = this.x * c.z + c.x, sy = this.y * c.z + c.y;
    if (sx < -150 || sy < -150 || sx > vw + 150 || sy > vh + 150) return;
    this._draw();
  }

  _fx(dt) {
    const a = this.anim;
    const turbo = this.turboT > 0;
    // emitters
    if (a === 'wrench' && this.act === 'work') {
      const c = (this.t * 2.2) % 1;
      if (c > 0.5 && c < 0.56 && !this._hitOnce) { this._hitOnce = true; this._sparks(8, 12, -2); }
      if (c < 0.5) this._hitOnce = false;
    }
    if ((a === 'type' && this.act !== 'idle') && Math.random() < (turbo ? 0.5 : 0.08)) this._bit();
    if (turbo && Math.random() < 0.35) this._sparks(1, 6 + Math.random() * 6, -12);
    if (a === 'pour' && Math.random() < 0.25) this.parts.push({ x: 12 + Math.random() * 3, y: -4, vx: 0, vy: -10 - Math.random() * 8, t: 0, life: 0.8, col: '#ffffff', kind: 'bub' });
    if (a === 'pour') {
      const c = (this.t % 3) / 3;
      if (c < 0.55 && Math.random() < 0.6) this.parts.push({ x: 12 + Math.random(), y: -16, vx: 1, vy: 30, t: 0, life: 0.5, col: this.on?.B?.color || '#7dffa8', kind: 'drop' });
    }
    if (a === 'coffee' && Math.random() < 0.08) this.parts.push({ x: 4 + Math.random() * 3, y: -16, vx: Math.random() * 4 - 2, vy: -8, t: 0, life: 1.2, col: 'rgba(255,255,255,.7)', kind: 'steam' });
    if (a === 'nap' && Math.random() < dt * 0.9) this.parts.push({ x: 6, y: -16, vx: 5, vy: -9, t: 0, life: 2.2, col: '#d4fbff', kind: 'z' });
    if (a === 'celebrate' && Math.random() < 0.25) this._confetti(1);
    // integrate
    const keep = [];
    for (const p of this.parts) {
      p.t += dt;
      if (p.t >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark' || p.kind === 'conf') p.vy += 90 * dt;
      if (p.kind === 'drop' && p.y > -3) continue;
      keep.push(p);
    }
    this.parts = keep.length > 120 ? keep.slice(-120) : keep;
  }
  _sparks(n, x, y) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 30 + Math.random() * 50;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.3 + Math.random() * 0.35, col: Math.random() < 0.5 ? '#fff6a0' : '#ffd23f', kind: 'spark' });
    }
  }
  _confetti(n) {
    const cols = ['#ff6a5a', '#ffd23f', '#7dffa8', '#5fd0f0', '#f070a0', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 40 + Math.random() * 60;
      this.parts.push({ x: (Math.random() - 0.5) * 8, y: -22, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, t: 0, life: 0.9 + Math.random() * 0.6, col: pick(cols), kind: 'conf' });
    }
  }
  _bit() {
    this.parts.push({ x: 10 + Math.random() * 12, y: -14, vx: 0, vy: -14 - Math.random() * 10, t: 0, life: 1, col: Math.random() < 0.5 ? '#7dffa8' : '#6ee0f4', kind: 'bit' });
  }

  // ------------------------------------------------------------ drawing
  _draw() {
    const ctx = this.ctx, s = this.sctx, pn = this.pen;
    const name = this.act === 'turbo' ? 'type' : this.anim;
    const o = poseFor(name === 'stand' ? 'idle' : name, this.t, this.animK, { turbo: this.turboT > 0 || this.act === 'turbo' });
    const tint = this.on?.B?.color || '#7dffa8';
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.clearRect(0, 0, AW, AH);
    if (this.face < 0) s.setTransform(-1, 0, 0, 1, AW, 0);
    if (o.lie) drawNap(pn, o);
    else {
      drawTail(pn, o);
      drawArm(pn, -2, -15 + o.by, o.aB, 'G', o.by);
      const raised = o.aF[1] < -18;
      if (raised) drawArm(pn, 2, -15 + o.by, o.aF, 'g', o.by);
      drawLeg(pn, -3, o.lb, o.by);
      drawLeg(pn, 1, o.lf, o.by);
      drawBody(pn, o);
      drawHead(pn, o);
      if (o.item === 'clip') drawItem(pn, o, tint, this.t);
      if (!raised) drawArm(pn, 2, -15 + o.by, o.aF, 'g', o.by);
      if (o.item && o.item !== 'clip') drawItem(pn, o, tint, this.t);
    }
    s.setTransform(1, 0, 0, 1, 0, 0);
    // outline pass
    const l = this.lctx;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, AW, AH);
    l.drawImage(this.spr, 0, 0);
    l.globalCompositeOperation = 'source-in';
    l.fillStyle = P.o;
    l.fillRect(0, 0, AW, AH);
    l.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, AW, AH);
    // ground shadow
    if (!o.lie) {
      const lift = this.anim === 'jump' ? 0.5 : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(AX - Math.round(6 * lift), AY + 1, Math.round(12 * lift), 1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ctx.drawImage(this.sil, dx, dy);
    ctx.drawImage(this.spr, 0, 0);
    // holo props + particles (no outline)
    if (this.face < 0) ctx.setTransform(-1, 0, 0, 1, AW, 0);
    const fp = this.fpen;
    if (o.item === 'kbd') this._holo(fp, o);
    if (o.gog === 'down' && !o.lie) {
      ctx.fillStyle = 'rgba(110,224,244,0.28)';
      ctx.fillRect(AX + o.hx + 1, AY + o.hy + o.by - 26, 7, 7);
    }
    if (o.wrenchHit) { ctx.fillStyle = 'rgba(255,240,160,0.8)'; ctx.fillRect(AX + 11, AY - 3, 3, 3); }
    for (const p of this.parts) {
      if (p.kind === 'z') continue;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = p.kind === 'bit' || p.kind === 'steam' ? k : 1;
      ctx.fillStyle = p.col;
      const x = AX + Math.round(p.x), y = AY + Math.round(p.y);
      if (p.kind === 'spark' && k > 0.5) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
      else if (p.kind === 'conf') ctx.fillRect(x, y, (p.t * 10) % 2 < 1 ? 2 : 1, (p.t * 10) % 2 < 1 ? 1 : 2);
      else if (p.kind === 'bub') { ctx.globalAlpha = 0.8 * k; ctx.fillRect(x, y, 1, 1); }
      else ctx.fillRect(x, y, 1, p.kind === 'drop' ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Zzz (never mirrored)
    for (const p of this.parts) {
      if (p.kind !== 'z') continue;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.col;
      const sz = p.t > 1 ? 4 : 3;
      const x = AX + Math.round(p.x * this.face), y = AY + Math.round(p.y);
      ctx.fillRect(x, y, sz, 1); ctx.fillRect(x, y + sz - 1, sz, 1);
      for (let i = 1; i < sz - 1; i++) ctx.fillRect(x + sz - 1 - i, y + i, 1, 1);
    }
    ctx.globalAlpha = 1;
    // teleport beam
    if (this.beam > 0) {
      const b = this.beam;
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(110,224,244,${Math.min(1, b * 1.4)})`;
      ctx.fillRect(0, 0, AW, AH);
      ctx.globalCompositeOperation = 'destination-out';
      const ph = Math.floor(this.t * 30);
      for (let y = 0; y < AH; y++) if (((y + ph) % 4) / 4 < b) ctx.fillRect(0, y, AW, 1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(150,240,255,${0.45 * Math.sin(b * Math.PI)})`;
      ctx.fillRect(AX - 7, 0, 14, AY + 2);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * Math.sin(b * Math.PI)})`;
      ctx.fillRect(AX - 1, 0, 2, AY + 2);
    }
  }

  _holo(fp, o) {
    const ctx = this.ctx;
    const t = this.t;
    const turbo = this.turboT > 0 || this.act === 'turbo';
    // keyboard
    ctx.fillStyle = 'rgba(110,224,244,0.30)';
    ctx.fillRect(AX + 5, AY - 10 + o.by, 12, 3);
    ctx.fillStyle = 'rgba(180,250,255,0.85)';
    ctx.fillRect(AX + 5, AY - 10 + o.by, 12, 1);
    const f = Math.floor(t * (turbo ? 24 : 12));
    for (let i = 0; i < 3; i++) { const kx = (f * 7 + i * 5) % 11; ctx.fillRect(AX + 5 + kx, AY - 9 + o.by, 1, 1); }
    // floating screen
    const sx = AX + 11, sy = AY - 33, w = 15, h = 13;
    ctx.fillStyle = turbo ? 'rgba(255,210,63,0.22)' : 'rgba(95,208,240,0.18)';
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = turbo ? 'rgba(255,230,120,0.9)' : 'rgba(150,240,255,0.85)';
    ctx.fillRect(sx, sy, w, 1); ctx.fillRect(sx, sy + h - 1, w, 1);
    ctx.fillRect(sx, sy, 1, h); ctx.fillRect(sx + w - 1, sy, 1, h);
    const scroll = Math.floor(t * (turbo ? 14 : 5));
    for (let i = 0; i < 4; i++) {
      const len = 3 + ((scroll + i) * 7919 % 9);
      ctx.fillStyle = (scroll + i) % 5 === 0 ? 'rgba(125,255,168,0.95)' : 'rgba(200,250,255,0.75)';
      ctx.fillRect(sx + 2, sy + 2 + i * 2 + 1, Math.min(w - 4, len), 1);
    }
    // projector beam
    ctx.fillStyle = 'rgba(110,224,244,0.10)';
    ctx.fillRect(sx + 3, sy + h, 6, AY - 10 - (sy + h) + o.by);
  }
}
