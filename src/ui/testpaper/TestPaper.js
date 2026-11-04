// [v32 class] The end-of-class TEST PAPER: a real exam sheet, painted pixel by pixel. Lined paper
// with punch holes, a coffee ring, a doodle in the margin, a printed header and a Name line already
// written in pencil. The player answers with a pencil (it follows the pointer and scribbles every
// mark), hands it in, and Professor Reynard grades it live with a red pen: ticks, crosses, a short
// note with the right answer next to every miss, the score, a slammed letter-grade stamp and a gold
// star sticker for an A.
//
//   const tp = new TestPaper({ host, questions, meta: { title, classNo, name, day }, sfx, say });
//   const r = await tp.run();   // { score, total, pct, grade, skipped }
//   tp.update(dt) every frame (the classroom drives it, so x3 works); tp.key(e) -> handled?; tp.abort()
//
// Question types (lesson `test:` arrays, src/game/lessonsCombined.js / src/game/lessons/classes.js):
//   { type: 'choice', q, opts: [...], a: index, why }        fill in the bubble
//   { type: 'tf', q, items: [[statement, true|false], ...], why: [...] }
//   { type: 'label', q, art: 'fish' | 'dam', slots: ['gills', 'fin', 'tail'] }   drag the words onto the diagram
//   { type: 'match', q, pairs: [[left, right], ...] }         draw a line from each left to its right
//   { type: 'order', q, steps: [...in the right order] }      number the steps 1, 2, 3...
// Tap / click works everywhere (tap a word, then its box; tap a dot, then its partner); drag works
// too. Keyboard: arrows / Tab move, Enter / Space mark, Esc skips the test. Wrong answers never
// block anything: the class just goes on.
import './testpaper.css';
import { canvas, hash, textCanvas, goofyCanvas, tools, starSticker, gradeStamp, doodleCanvas, signButton } from './art.js';
import { pxWrap, pxMeasure } from '../kinetic/pxfont.js';
import { dpr } from '../uiScale.js';

const PW = 300; // paper width (art px)
const LM = 28; // red margin line
const CX0 = 34, CX1 = 290; // content columns
const ROW = 12; // ruled line pitch
const R0 = 62; // first ruled line under the header (row 0 holds the instructions)
const MG = 20; // canvas margin around the paper (tools hang over the edge)
const INK = '#2c2a36', INK_L = '#5a5866', PAPER = '#f7f1df';
const GR = ['#3c3c48', '#545462', '#46464f']; // graphite
const RED = ['#d0262e', '#e0383a', '#b81c24'];
const ROWY = (r) => R0 + r * ROW; // a ruled line's y; text rows sit on it

export const GRADES = ['A+', 'A', 'B', 'C', 'D', 'F'];
export function gradeFor(pct) { return pct >= 0.999 ? 'A+' : pct >= 0.85 ? 'A' : pct >= 0.7 ? 'B' : pct >= 0.55 ? 'C' : pct >= 0.4 ? 'D' : 'F'; }

// ------------------------------------------------------------------ pixel paths
function linePx(x0, y0, x1, y1, { wob = 0, seed = 1, sag = 0 } = {}) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const out = [];
  let lk = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = Math.sin(t * Math.PI) * sag;
    const w = wob ? (hash(i >> 2, seed, 3) - 0.5) * wob : 0;
    const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + s + w);
    const k = x + ',' + y;
    if (k !== lk) { out.push([x, y]); lk = k; }
  }
  return out;
}
const thick = (px) => px.flatMap(([x, y]) => [[x, y], [x + 1, y]]);
function ringPx(cx, cy, rx, ry, seed = 1) {
  // a hand-drawn loop: starts top-right, goes round once and overshoots a little
  const out = []; let lk = '';
  const n = Math.round((rx + ry) * 4);
  for (let i = 0; i <= n * 1.12; i++) {
    const a = -0.6 + (i / n) * Math.PI * 2;
    const k = 1 + (i / n) * 0.08 + (hash(i >> 3, seed, 1) - 0.5) * 0.08;
    const x = Math.round(cx + Math.cos(a) * rx * k), y = Math.round(cy + Math.sin(a) * ry * k);
    const kk = x + ',' + y;
    if (kk !== lk) { out.push([x, y]); lk = kk; }
  }
  return out;
}
function bubbleFillPx(cx, cy, seed = 1) {
  // a scribbled fill: zig-zags across the 5x5 inside, a stray pixel or two out of the lines
  const out = [];
  for (let pass = 0; pass < 2; pass++) for (let y = -2; y <= 2; y++) {
    const xs = [-2, -1, 0, 1, 2];
    if ((y + pass) % 2) xs.reverse();
    for (const x of xs) if (x * x + y * y <= 5) out.push([cx + x, cy + y]);
  }
  if (hash(cx, cy, seed) < 0.6) out.push([cx + 3, cy - 2]);
  if (hash(cy, cx, seed) < 0.4) out.push([cx - 2, cy + 3]);
  return out;
}
/** text -> pixels in writing order (left to right, each column top to bottom) */
function textPx(text, font, x, y) {
  const t = textCanvas(text, font, '#000');
  const d = t.buf.data, out = [];
  for (let xx = 0; xx < t.w; xx++) for (let yy = 0; yy < t.h; yy++) if (d[yy * t.w + xx]) out.push([x + xx, y + yy]);
  return { px: out, w: t.w, h: t.h };
}
function tickPx(x, y, s = 1) {
  return thick([...linePx(x, y, x + 3 * s, y + 3 * s), ...linePx(x + 3 * s, y + 3 * s, x + 9 * s, y - 5 * s, { sag: -0.6 })]);
}
function crossPx(x, y, s = 1) {
  return thick([...linePx(x, y - 3 * s, x + 7 * s, y + 4 * s, { wob: 0.8, seed: x }), ...linePx(x + 7 * s, y - 4 * s, x, y + 4 * s, { wob: 0.8, seed: y })]);
}

// ------------------------------------------------------------------ printed diagrams (label questions)
const DIAGRAMS = {
  fish: {
    w: 118, h: 54,
    paint(P, ox, oy) {
      // a textbook bluegill in printer's ink: body outline, scales hatch, gill cover arc, fins with rays
      const cx = ox + 58, cy = oy + 30, rx = 34, ry = 17;
      const inBody = (x, y) => { const dx = (x - cx) / rx, dy = (y - cy) / (ry * (1 - Math.max(0, (cx - x) / rx) * 0.35)); return dx * dx + dy * dy <= 1; };
      for (let y = oy; y < oy + 54; y++) for (let x = ox + 18; x < ox + 96; x++) {
        if (!inBody(x, y)) continue;
        const edge = !inBody(x + 1, y) || !inBody(x - 1, y) || !inBody(x, y + 1) || !inBody(x, y - 1);
        if (edge) P(x, y, INK);
        else if ((x + y * 2) % 7 === 0 && (y - cy) > -ry + 4 && x < cx + 18) P(x, y, '#9a98a4'); // scales
        else if (y > cy + 8 && (x + y) % 3 === 0) P(x, y, '#c8c4cc'); // belly shading (dithered)
      }
      // tail: a fork
      for (let i = 0; i <= 14; i++) { P(ox + 26 - i, cy - Math.round(i * 0.9) - 1, INK); P(ox + 26 - i, cy + Math.round(i * 0.9) + 1, INK); }
      for (let y = -13; y <= 13; y++) { const x = ox + 12 + Math.round(Math.abs(y) * 0.25); P(x, cy + y, INK); }
      for (let k = 0; k < 4; k++) for (let i = 0; i < 10; i++) P(ox + 24 - i, cy - 3 - k * 3 + Math.round(i * 0.1), '#8a8894');
      // dorsal fin: a long spiny ridge with rays
      for (let x = ox + 34; x <= ox + 76; x++) { const h = 6 + Math.round(Math.sin((x - ox - 34) / 42 * Math.PI) * 4); const top = cy - ry + 1 - h + Math.round((x - cx) * (x - cx) / 160); P(x, top, INK); if ((x - ox) % 4 === 0) for (let k = 1; k < h; k++) P(x, top + k, '#8a8894'); }
      // pectoral fin + pelvic fin
      for (let i = 0; i < 9; i++) { P(cx + 12 - i, cy + 2 + Math.round(i * 0.6), INK); P(cx + 12 - i, cy + 6 + Math.round(i * 0.2), INK); }
      for (let i = 0; i < 7; i++) P(cx - 2 - i, cy + ry - 1 + Math.round(i * 0.5), INK);
      // gill cover arc + the dark "ear" flap
      for (let y = -11; y <= 12; y++) P(cx + 18 - Math.round((y * y) / 26), cy + y, INK);
      for (let y = -3; y <= 0; y++) for (let x = 0; x < 3; x++) P(cx + 17 - x, cy + y - 4, INK);
      // eye + mouth
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 1], [0, -1], [1, 2]]) P(cx + 26 + dx, cy - 6 + dy, INK);
      P(cx + 26, cy - 6, '#ffffff');
      P(cx + 34, cy + 1, INK); P(cx + 33, cy + 2, INK); P(cx + 32, cy + 2, INK);
    },
    // box: where the word box sits (top-left), pt: what the leader line points at
    slots: {
      gills: { box: [76, 0], pt: [76, 22] }, fin: { box: [32, 0], pt: [48, 9] }, tail: { box: [0, 44], pt: [14, 38] },
      eye: { box: [84, 44], pt: [84, 25] }, mouth: { box: [84, 44], pt: [91, 32] }, bladder: { box: [40, 44], pt: [55, 28] },
    },
  },
  dam: {
    w: 118, h: 54,
    paint(P, ox, oy) {
      // side view: a high pond on the left held back by a stick-and-mud dam, a low stream on the right
      const ground = (x) => (x < 40 ? 44 : x < 62 ? 44 + Math.round((x - 40) * 0.1) : 48);
      for (let x = 0; x < 118; x++) { const g = ground(x); P(ox + x, oy + g, INK); for (let y = g + 1; y < 54; y++) if ((x + y) % 4 === 0) P(ox + x, oy + y, '#a8a4b0'); }
      // pond water (dithered) with a wavy surface
      for (let x = 2; x < 52; x++) { const s = 22 + (x % 6 < 3 ? 0 : 1); P(ox + x, oy + s, INK); for (let y = s + 2; y < ground(x); y++) if ((x + y) % 3 === 0) P(ox + x, oy + y, '#8a9ac0'); }
      // the dam: stacked logs (circles end-on) and sticks
      for (const [lx, ly] of [[54, 42], [60, 42], [57, 37], [63, 37], [59, 32], [56, 27], [62, 27], [58, 22]]) for (const [dx, dy] of [[0, -2], [1, -2], [2, -1], [2, 0], [2, 1], [1, 2], [0, 2], [-1, 1], [-1, 0], [-1, -1], [0, 0]]) P(ox + lx + dx, oy + ly + dy, dx === 0 && dy === 0 ? '#6a6874' : INK);
      for (let i = 0; i < 12; i++) P(ox + 52 + i, oy + 19 + Math.round(i * 0.3), INK);
      // stream on the right: low water
      for (let x = 70; x < 116; x++) { P(ox + x, oy + 44 + (x % 5 < 2 ? 0 : 1), INK); for (let y = 46; y < 48; y++) if ((x + y) % 3 === 0) P(ox + x, oy + y, '#8a9ac0'); }
      // cattails at the pond edge, a lily pad
      for (const cx of [6, 12]) { for (let y = 8; y < 22; y++) P(ox + cx, oy + y, INK); for (let y = 8; y < 13; y++) P(ox + cx + 1, oy + y, INK); }
      for (let x = 26; x < 34; x++) P(ox + x, oy + 21, INK);
      // a little beaver silhouette on top of the dam
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, -1], [1, -1], [2, -1], [3, -1], [3, -2], [4, -2], [4, -1], [-1, 1], [-2, 1], [-3, 2]]) P(ox + 62 + dx, oy + 17 + dy, INK);
    },
    slots: { pond: { box: [14, 0], pt: [28, 30] }, dam: { box: [50, 0], pt: [58, 22] }, stream: { box: [78, 26], pt: [92, 45] }, wetland: { box: [0, 30], pt: [9, 18] } },
  },
};
const WORDS = { gills: 'GILLS', fin: 'FIN', tail: 'TAIL', eye: 'EYE', mouth: 'MOUTH', bladder: 'BLADDER', pond: 'POND', dam: 'DAM', stream: 'STREAM', wetland: 'WETLAND' };

// a deterministic shuffle that never leaves everything in place
function scramble(n, seed) {
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash(i, seed, 5) * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  if (n > 1 && idx.every((v, i) => v === i)) idx.push(idx.shift());
  if (n > 2 && idx.filter((v, i) => v === i).length > 1) idx.reverse();
  return idx;
}

// ================================================================== the sheet
export class TestPaper {
  constructor({ host, questions, meta = {}, sfx, say } = {}) {
    this.host = host || document.body;
    this.meta = meta;
    this.sfx = sfx || (() => {});
    this.say = say || (() => {});
    this.qs = (questions || []).filter(Boolean).map((q, i) => this._norm(q, i));
    this.marks = new Map(); // key -> { px, col[], drawn }
    this.smudges = [];
    this.waits = [];
    this.focus = 0; this.held = null; this.hover = null;
    this.phase = 'in'; this.t = 0; this.slide = 0;
    this.tool = { kind: 'pencil', x: PW - 40, y: 40, vis: 0, goal: null, writing: null };
    this.ptr = null;
    this._layout();
    this._paintBase();
    this._buildDom();
    this.dirty = true;
    this._preWrite();
  }

  // ---------------------------------------------------------------- data
  _norm(q, i) {
    const o = { ...q, i, type: q.type || (q.items ? 'tf' : q.pairs ? 'match' : q.steps ? 'order' : q.slots ? 'label' : 'choice') };
    if (o.type === 'choice') { o.opts = [...(q.opts || [])]; o.ans = null; o.pts = 1; }
    if (o.type === 'tf') { o.items = (q.items || []).map((it) => (Array.isArray(it) ? { s: it[0], a: !!it[1] } : it)); o.ans = o.items.map(() => null); o.pts = o.items.length; }
    if (o.type === 'label') { o.art = DIAGRAMS[q.art] ? q.art : 'fish'; o.slots = [...(q.slots || ['gills', 'fin', 'tail'])]; o.words = o.slots.map((k) => (q.words?.[k]) || WORDS[k] || k.toUpperCase()); o.bank = scramble(o.slots.length, 31 + i); o.ans = o.slots.map(() => null); o.pts = o.slots.length; }
    if (o.type === 'match') { o.pairs = (q.pairs || []).map((p) => [...p]); o.right = scramble(o.pairs.length, 17 + i); o.ans = o.pairs.map(() => null); o.pts = o.pairs.length; }
    if (o.type === 'order') { o.steps = [...(q.steps || [])]; o.shown = scramble(o.steps.length, 7 + i); o.ans = []; o.pts = 1; }
    return o;
  }

  // ---------------------------------------------------------------- layout (art px, paper space)
  _layout() {
    const T = []; // targets
    let row = 1;
    const W = CX1 - CX0;
    for (const q of this.qs) {
      q.row0 = row;
      const promptW = W - 14;
      const lines = pxWrap(String(q.q || ''), promptW, 'body');
      q.lines = lines;
      q.promptRows = lines.length;
      row += lines.length;
      if (q.type === 'choice') {
        const ws = q.opts.map((t) => 12 + pxMeasure(String(t), 'body'));
        const inline = ws.reduce((a, b) => a + b + 12, 0) <= W - 14;
        q.optPos = [];
        let x = CX0 + 14;
        q.opts.forEach((t, k) => {
          if (!inline && k) { row++; x = CX0 + 14; }
          const y = ROWY(row) - 4;
          q.optPos.push({ x, y, w: ws[k] });
          T.push({ q, kind: 'bubble', k, r: [x - 2, y - 6, ws[k] + 4, 12], cx: x + 3, cy: y - 1 });
          x += ws[k] + 12;
        });
        row++;
      } else if (q.type === 'tf') {
        q.itemPos = [];
        q.items.forEach((it, k) => {
          const L = pxWrap(it.s, W - 70, 'body');
          const y = ROWY(row) - 4;
          q.itemPos.push({ y, lines: L, row });
          for (const [v, bx] of [[true, CX1 - 40], [false, CX1 - 18]]) T.push({ q, kind: 'tf', k, v, r: [bx - 9, y - 7, 18, 13], cx: bx, cy: y - 1 });
          row += L.length;
        });
      } else if (q.type === 'label') {
        const D = DIAGRAMS[q.art];
        const top = ROWY(row) - 6;
        q.diag = { x: CX0 + 10, y: top + 4 };
        q.slotPos = q.slots.map((k) => {
          const s = D.slots[k] || D.slots[Object.keys(D.slots)[0]];
          return { x: q.diag.x + s.box[0], y: q.diag.y + s.box[1], w: 38, h: 11, pt: [q.diag.x + s.pt[0], q.diag.y + s.pt[1]] };
        });
        q.slotPos.forEach((p, k) => T.push({ q, kind: 'slot', k, r: [p.x - 2, p.y - 2, p.w + 4, p.h + 4], cx: p.x + p.w / 2, cy: p.y + p.h / 2 }));
        q.bankPos = q.bank.map((wi, j) => ({ wi, x: q.diag.x + D.w + 30, y: top + 6 + j * 15, w: pxMeasure(q.words[wi], 'bold') + 14, h: 12 }));
        q.bankPos.forEach((b) => T.push({ q, kind: 'tag', k: b.wi, r: [b.x - 2, b.y - 2, b.w + 4, b.h + 4], cx: b.x + b.w / 2, cy: b.y + b.h / 2, drag: true }));
        row += Math.max(Math.ceil((D.h + 4) / ROW), q.bank.length + 1);
      } else if (q.type === 'match') {
        const lw = Math.max(...q.pairs.map((p) => pxMeasure(p[0], 'body')));
        const rx = Math.max(CX0 + 14 + lw + 40, CX0 + 120);
        q.mPos = { lx: CX0 + 14, ldot: CX0 + 14 + lw + 6, rdot: rx, rx: rx + 6 };
        q.pairs.forEach((p, k) => {
          const y = ROWY(row + k) - 4;
          T.push({ q, kind: 'ml', k, r: [CX0 + 10, y - 7, lw + 14, 12], cx: q.mPos.ldot, cy: y - 1, drag: true });
          const rk = q.right[k];
          T.push({ q, kind: 'mr', k: rk, r: [rx - 5, y - 7, pxMeasure(q.pairs[rk][1], 'body') + 14, 12], cx: rx, cy: y - 1 });
        });
        q.mRow = row;
        row += q.pairs.length;
      } else if (q.type === 'order') {
        const ws = q.shown.map((si) => pxMeasure(String(q.steps[si]), 'body') + 18);
        q.oPos = [];
        let x = CX0 + 14;
        q.shown.forEach((si, j) => {
          if (x + ws[j] > CX1 && j) { row += 2; x = CX0 + 14; }
          const y = ROWY(row) + 1;
          q.oPos.push({ si, x, y, w: ws[j] });
          T.push({ q, kind: 'card', k: si, r: [x - 1, y - 9, ws[j] + 2, 15], cx: x + ws[j] / 2, cy: y - 2 });
          x += ws[j] + 10;
        });
        row += 2;
      }
      q.row1 = row;
      row += 1; // a blank line between questions
    }
    row -= 1;
    this.rows = row;
    this.PH = ROWY(row) + 22;
    this.CW = PW + MG * 2; this.CH = this.PH + MG * 2;
    this.targets = T;
    this.qs.forEach((q, i) => { q.num = i + 1; });
  }

  // ---------------------------------------------------------------- the printed paper
  _paintBase() {
    const PH = this.PH;
    const c = canvas(this.CW, this.CH), x = c.getContext('2d');
    const P = (px, py, col) => { x.fillStyle = col; x.fillRect(MG + px, MG + py, 1, 1); };
    const R = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(MG + px, MG + py, w, h); };
    this._P = P;
    // drop shadow (solid, offset), the sheet, fibres
    R(4, 5, PW, PH, 'rgba(20,12,8,0.42)');
    R(0, 0, PW, PH, PAPER);
    for (let yy = 0; yy < PH; yy++) for (let xx = 0; xx < PW; xx++) {
      const h = hash(xx, yy, 77);
      if (h < 0.035) P(xx, yy, '#efe6cf'); else if (h > 0.985) P(xx, yy, '#fffbf0');
      if (hash(xx >> 3, yy >> 2, 5) > 0.93 && hash(xx, yy, 6) < 0.5) P(xx, yy, '#f2eacf'); // faint fibre streaks
    }
    // edges: a slightly darker rim and a soft (dithered) shade along the bottom
    R(0, 0, PW, 1, '#e6dcc0'); R(0, 0, 1, PH, '#e6dcc0'); R(PW - 1, 0, 1, PH, '#cfc2a0'); R(0, PH - 1, PW, 1, '#cfc2a0');
    for (let xx = 0; xx < PW; xx++) for (let k = 2; k < 6; k++) if ((xx + k) % (k) === 0) P(xx, PH - k, '#ece2c8');
    // dog-eared top-right corner
    for (let k = 0; k < 10; k++) for (let j = 0; j <= k; j++) { P(PW - 10 + k, j, j === k ? '#b8a880' : '#e8dcb8'); }
    for (let k = 0; k < 10; k++) for (let j = k + 1; j < 10; j++) x.clearRect(MG + PW - 10 + j, MG + k, 1, 1);
    for (let k = 0; k < 10; k++) P(PW - 10 + k, k, '#a8987a');
    // ruled lines + the red margin
    for (let r = 0; r <= this.rows + 1; r++) { const y = ROWY(r); if (y > PH - 14) break; for (let xx = 2; xx < PW - 2; xx++) if (hash(xx, r, 4) > 0.04) P(xx, y, hash(xx >> 4, r, 2) > 0.9 ? '#b8d0ea' : '#a8c4e4'); }
    for (let yy = 0; yy < PH; yy++) { P(LM, yy, '#ec9a9a'); if (yy % 2 === 0 || hash(yy, 1, 3) > 0.3) P(LM + 2, yy, '#f2b4b0'); }
    // punch holes (see-through) with a torn-fibre rim
    this.holes = [Math.round(PH * 0.17), Math.round(PH * 0.5), Math.round(PH * 0.83)];
    for (const hy of this.holes) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = dx * dx + dy * dy;
        if (d <= 12) x.clearRect(MG + 13 + dx, MG + hy + dy, 1, 1);
        else if (d <= 18) P(13 + dx, hy + dy, dy < 0 ? '#c8b890' : '#e2d6b8');
      }
    }
    // a coffee ring (dithered, half-dried) in the bottom-right
    const ccx = PW - 54, ccy = PH - 40;
    for (let a = 0; a < 360; a++) {
      if (a > 290 && a < 330) continue; // the gap where the mug lifted
      const rad = a * Math.PI / 180;
      for (const rr of [15, 16]) {
        const px = Math.round(ccx + Math.cos(rad) * rr), py = Math.round(ccy + Math.sin(rad) * rr * 0.92);
        const k = hash(px, py, 8);
        if (k < 0.75) P(px, py, rr === 16 ? (k < 0.3 ? '#c8a070' : '#d8b688') : '#e4cca4');
      }
    }
    for (let k = 0; k < 40; k++) { const a = hash(k, 2, 9) * Math.PI * 2, rr = hash(k, 3, 9) * 13; const px = Math.round(ccx + Math.cos(a) * rr), py = Math.round(ccy + Math.sin(a) * rr); if (hash(px, py, 1) < 0.5) P(px, py, '#efdcbc'); }
    for (const [dx, dy] of [[17, 4], [18, 5], [18, 6], [19, 7]]) P(ccx + dx, ccy + dy, '#d0a878'); // a drip
    // a doodle in the bottom-left margin (a bored student's pencil)
    const dname = this.meta.doodle || ['fishHat', 'bear', 'sun'][(this.meta.classNo || 1) % 3];
    x.drawImage(doodleCanvas(dname), MG + 4 + 4, MG + PH - 28);
    // ---- the printed header
    const T = (str, px, py, font = 'body', col = INK) => { const t = textCanvas(str, font, col); x.drawImage(t.c, MG + px, MG + py); return t.w; };
    const crest = [ // a tiny school crest: a fish in a ring
      '..KKKKK..', '.K.....K.', 'K..KK.K.K', 'K.KKKKK.K', 'K..KK.K.K', '.K.....K.', '..KKKKK..'];
    crest.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch === 'K') P(CX0 + xx, 8 + yy, INK); }));
    const hd = goofyCanvas('POND SCHOOL', INK);
    x.drawImage(hd.c, MG + CX0 + 13, MG + 7);
    T('·', CX0 + 15 + hd.w, 6, 'bold');
    const t2 = goofyCanvas('TEST', '#b81c24');
    x.drawImage(t2.c, MG + CX0 + 22 + hd.w, MG + 7);
    const title = `Class ${this.meta.classNo || 1}: ${this.meta.title || 'Pond Life'}`;
    T(title, CX0, 21, 'bold');
    // score box (Reynard fills it in)
    const sx = PW - 82, sy = 8;
    T('SCORE', sx + 1, sy - 3, 'tiny', INK_L);
    for (let xx = sx; xx < sx + 44; xx++) { P(xx, sy + 6, INK); P(xx, sy + 22, INK); }
    for (let yy = sy + 6; yy <= sy + 22; yy++) { P(sx, yy, INK); P(sx + 43, yy, INK); }
    this.scoreBox = { x: sx, y: sy + 6, w: 44, h: 17 };
    T(`/${this.total()}`, sx + 26, sy + 9, 'bold', INK_L);
    // Name / Date lines (filled in pencil by _preWrite)
    T('Name:', CX0, 33);
    for (let xx = CX0 + 28; xx < CX0 + 120; xx++) P(xx, 43, INK_L);
    T('Date:', CX0 + 130, 33);
    for (let xx = CX0 + 158; xx < CX0 + 214; xx++) P(xx, 43, INK_L);
    // a heavy printed rule under the header
    for (let xx = 4; xx < PW - 4; xx++) { P(xx, 48, INK); if (xx % 2 === 0) P(xx, 50, INK_L); }
    T('Answer every question. Pencil only. No eating the paper.', CX0, ROWY(0) - 7, 'tiny', INK_L);
    // ---- the questions
    for (const q of this.qs) {
      const y0 = ROWY(q.row0) - 9;
      T(`${q.num}.`, CX0, y0, 'bold');
      q.lines.forEach((L, k) => T(L, CX0 + 14, ROWY(q.row0 + k) - 9));
      const pts = `(${q.pts} pt${q.pts > 1 ? 's' : ''})`;
      const lastW = pxMeasure(q.lines[q.lines.length - 1] || '', 'body');
      if (CX0 + 14 + lastW + 8 + pxMeasure(pts, 'tiny') < CX1) T(pts, CX1 - pxMeasure(pts, 'tiny'), ROWY(q.row0 + q.lines.length - 1) - 7, 'tiny', INK_L);
      if (q.type === 'choice') q.opts.forEach((o, k) => { const p = q.optPos[k]; this._bubble(x, p.x + 3, p.y - 1, 'ABCDEFG'[k]); T(String(o), p.x + 10, p.y - 5); });
      if (q.type === 'tf') q.items.forEach((it, k) => {
        const p = q.itemPos[k];
        T(`${'abcdef'[k]})`, CX0 + 14, p.y - 5, 'body', INK_L);
        p.lines.forEach((L, j) => T(L, CX0 + 26, ROWY(p.row + j) - 9));
        this._bubble(x, CX1 - 40, p.y - 1, 'T'); this._bubble(x, CX1 - 18, p.y - 1, 'F');
      });
      if (q.type === 'label') {
        const D = DIAGRAMS[q.art];
        // the diagram sits on a white card pasted over the lines
        R(q.diag.x - 3, q.diag.y - 3, D.w + 6, D.h + 6, '#fcfaf2');
        for (let xx = q.diag.x - 3; xx < q.diag.x + D.w + 3; xx++) { P(xx, q.diag.y - 3, '#d8d0b8'); P(xx, q.diag.y + D.h + 2, '#c8bea0'); }
        D.paint((px, py, col) => P(px, py, col), q.diag.x, q.diag.y);
        q.slotPos.forEach((s) => {
          // leader line (dotted) + an empty dashed box
          const L = linePx(s.x + s.w / 2, s.y + (s.pt[1] > s.y ? s.h : 0), s.pt[0], s.pt[1]);
          L.forEach(([px, py], k) => { if (k % 2 === 0) P(px, py, INK_L); });
          P(s.pt[0], s.pt[1], INK); P(s.pt[0] + 1, s.pt[1], INK);
          for (let xx = s.x; xx < s.x + s.w; xx++) if (xx % 3 !== 2) { P(xx, s.y, INK_L); P(xx, s.y + s.h, INK_L); }
          for (let yy = s.y; yy <= s.y + s.h; yy++) if (yy % 3 !== 2) { P(s.x, yy, INK_L); P(s.x + s.w - 1, yy, INK_L); }
          R(s.x + 1, s.y + 1, s.w - 2, s.h - 1, '#fffdf6');
        });
        T('WORD BANK', q.bankPos[0].x, q.bankPos[0].y - 9 + 2, 'tiny', INK_L);
      }
      if (q.type === 'match') q.pairs.forEach((p, k) => {
        const y = ROWY(q.mRow + k) - 4;
        T(p[0], q.mPos.lx, y - 5);
        this._dot(x, q.mPos.ldot, y - 1);
        const rk = q.right[k];
        this._dot(x, q.mPos.rdot, y - 1);
        T(q.pairs[rk][1], q.mPos.rx, y - 5);
      });
      if (q.type === 'order') q.oPos.forEach((o) => {
        // a printed card: number box on the left, the step text
        for (let xx = o.x; xx < o.x + o.w; xx++) { P(xx, o.y - 9, INK); P(xx, o.y + 4, INK); }
        for (let yy = o.y - 9; yy <= o.y + 4; yy++) { P(o.x, yy, INK); P(o.x + o.w - 1, yy, INK); P(o.x + 11, yy, INK_L); }
        R(o.x + 1, o.y - 8, o.w - 2, 12, '#fffdf6');
        R(o.x + 1, o.y - 8, 10, 12, '#f4eedc');
        T(String(q.steps[o.si]), o.x + 15, o.y - 8);
      });
    }
    this.base = c;
    this.ink = canvas(this.CW, this.CH);
    this.out = canvas(this.CW, this.CH);
  }
  _bubble(x, cx, cy, letter) {
    const pts = [[-1, -3], [0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2]];
    x.fillStyle = INK;
    for (const [dx, dy] of pts) x.fillRect(MG + cx + dx, MG + cy + dy, 1, 1);
    x.fillStyle = '#fffdf6'; x.fillRect(MG + cx - 2, MG + cy - 2, 5, 5); x.fillRect(MG + cx - 1, MG + cy - 3 + 1, 3, 5);
    const t = textCanvas(letter, 'tiny', '#9a98a6');
    x.drawImage(t.c, MG + cx - 1, MG + cy - 4);
  }
  _dot(x, cx, cy) { x.fillStyle = INK; x.fillRect(MG + cx - 1, MG + cy - 1, 3, 3); x.fillStyle = '#fffdf6'; x.fillRect(MG + cx, MG + cy, 1, 1); }
  total() { return this.qs.reduce((s, q) => s + q.pts, 0); }

  // ---------------------------------------------------------------- DOM
  _buildDom() {
    const L = document.createElement('div');
    L.className = 'tp-layer';
    L.innerHTML = `<div class="tp-dim"></div><div class="tp-scroll"><div class="tp-sheet"></div></div><div class="tp-btns"></div><div class="tp-live" aria-live="polite"></div>`;
    this.el = L;
    this.scroll = L.querySelector('.tp-scroll');
    this.sheet = L.querySelector('.tp-sheet');
    this.view = canvas(this.CW, this.CH);
    this.view.className = 'tp-paper';
    this.view.setAttribute('role', 'application');
    this.view.setAttribute('aria-label', 'Test paper');
    this.sheet.appendChild(this.view);
    const btns = L.querySelector('.tp-btns');
    const mk = (cls, label, opts) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tp-btn ' + cls; b.setAttribute('aria-label', label);
      const art = signButton(label, opts);
      b.style.backgroundImage = `url(${art.toDataURL()})`;
      b.dataset.w = art.width; b.dataset.h = art.height;
      btns.appendChild(b);
      return b;
    };
    this.bHand = mk('tp-hand', 'HAND IN', { accent: '#f2c230' });
    this.bSkip = mk('tp-skipt', 'SKIP TEST', { kind: 'paper', accent: '#d0262e' });
    this.bNext = mk('tp-next', 'NEXT', { accent: '#8ad46a' });
    this.bNext.classList.add('hidden');
    this.bHand.addEventListener('click', (e) => { e.stopPropagation(); this._handIn(); });
    this.bSkip.addEventListener('click', (e) => { e.stopPropagation(); this._skip(); });
    this.bNext.addEventListener('click', (e) => { e.stopPropagation(); this._next(); });
    for (const b of [this.bHand, this.bSkip, this.bNext]) b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.classList.remove('boop'); void b.offsetWidth; b.classList.add('boop'); });
    // pointer on the paper
    const v = this.view;
    v.addEventListener('pointerdown', (e) => this._pdown(e));
    v.addEventListener('pointermove', (e) => this._pmove(e));
    v.addEventListener('pointerup', (e) => this._pup(e));
    v.addEventListener('pointercancel', () => { this.drag = null; this.dirty = true; });
    v.addEventListener('pointerleave', () => { if (!this.drag) { this.ptr = null; this.hover = null; this.dirty = true; } });
    L.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.phase === 'done' && e.target !== this.bNext) this._next(); });
    this.host.appendChild(L);
    this._resize = () => this._fit();
    window.addEventListener('resize', this._resize);
    this._fit();
  }
  _fit() {
    const r = dpr();
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
    // whole device pixels per art pixel; at least 2 css px so the 6 px print stays readable
    const byW = Math.floor(((vw - 24) * r) / this.CW), byH = Math.floor(((vh - 8) * r) / this.CH);
    let n = Math.max(1, Math.min(byW, Math.max(byH, Math.ceil(2 * r))));
    if (n / r > 3) n = Math.floor(3 * r);
    this.s = n / r;
    this.view.style.width = `${this.CW * this.s}px`;
    this.view.style.height = `${this.CH * this.s}px`;
    const side = vw >= this.CW * this.s + 2 * (70 * this.s);
    this.el.classList.toggle('tp-side', side);
    this.el.style.setProperty('--tps', `${this.s}px`);
    this.el.style.setProperty('--tpw', `${this.CW * this.s}px`);
    for (const b of [this.bHand, this.bSkip, this.bNext]) { b.style.width = `${b.dataset.w * this.s}px`; b.style.height = `${b.dataset.h * this.s}px`; }
    const tall = this.CH * this.s > vh;
    this.el.classList.toggle('tp-tall', tall);
    this.dirty = true;
  }

  // ---------------------------------------------------------------- run
  run() {
    this.sfx('paper', { volume: 0.6 });
    this.sfx('class_whoosh', { volume: 0.3, pitch: 0.8 });
    return new Promise((res) => { this._res = res; });
  }
  abort() {
    if (this._done) return;
    this._finish({ skipped: true });
  }
  _finish(r) {
    if (this._done) return;
    this._done = true;
    for (const w of this.waits.splice(0)) w.rej?.('abort');
    this.destroy();
    this._res?.(r);
  }
  destroy() {
    window.removeEventListener('resize', this._resize);
    this.el?.remove();
  }
  _skip() {
    if (this.phase !== 'answer' && this.phase !== 'in') return;
    this.sfx('class_whoosh', { volume: 0.35, pitch: 1.2 });
    this.phase = 'out'; this.slide = 0; this._outRes = { skipped: true, testSkipped: true };
  }
  _next() {
    if (this.phase !== 'done') return;
    this.sfx('paper', { volume: 0.5, pitch: 1.2 });
    this.phase = 'out'; this.slide = 0; this._outRes = this.result;
  }

  // ---------------------------------------------------------------- marks
  /** add / replace a mark; animate it with the current tool */
  _mark(key, px, { tool = 'pencil', instant = false, cols = GR } = {}) {
    const old = this.marks.get(key);
    if (old) this._erase(key);
    const col = px.map(([xx, yy]) => cols[Math.floor(hash(xx, yy, 2) * cols.length)]);
    const m = { px, col, drawn: instant ? px.length : 0, tool };
    this.marks.set(key, m);
    if (!instant) {
      // one stroke at a time: finish the one in progress
      if (this.tool.writing && this.tool.writing !== m) this.tool.writing.drawn = this.tool.writing.px.length;
      this.tool.writing = m; this.tool.kind = tool; this.tool.vis = 1;
    }
    this.inkDirty = true; this.dirty = true;
    return new Promise((res, rej) => { if (instant) res(); else { m.res = res; this.waits.push({ rej }); } });
  }
  _erase(key) {
    const m = this.marks.get(key);
    if (!m) return;
    this.marks.delete(key);
    // the rubber leaves a faint grey smudge where the mark was
    for (let i = 0; i < m.px.length; i += 2) { const [xx, yy] = m.px[i]; if (hash(xx, yy, 5) < 0.45) this.smudges.push([xx + (hash(yy, xx, 1) < 0.5 ? 1 : 0), yy]); }
    if (this.smudges.length > 1600) this.smudges.splice(0, this.smudges.length - 1600);
    this.inkDirty = true; this.dirty = true;
    this.sfx('page', { volume: 0.15, pitch: 1.6 });
  }
  _preWrite() {
    const name = this.meta.name || 'Partner';
    this._mark('name', textPx(name, 'script', CX0 + 32, 30).px, { instant: true });
    this._mark('date', textPx(`Day ${this.meta.day || 1}`, 'script', CX0 + 162, 30).px, { instant: true });
  }

  // ---------------------------------------------------------------- answering
  _activate(tg) {
    if (!tg || this.phase !== 'answer') return;
    const q = tg.q;
    const pen = (key, px) => { this.sfx('pen', { volume: 0.28, pitch: 1.3 + Math.random() * 0.3 }); return this._mark(key, px); };
    if (tg.kind === 'bubble') {
      if (q.ans === tg.k) return;
      q.ans = tg.k;
      pen(`q${q.i}`, bubbleFillPx(tg.cx, tg.cy, q.i + tg.k));
    } else if (tg.kind === 'tf') {
      if (q.ans[tg.k] === tg.v) return;
      q.ans[tg.k] = tg.v;
      pen(`q${q.i}:${tg.k}`, bubbleFillPx(tg.cx, tg.cy, tg.k));
    } else if (tg.kind === 'tag') {
      // pick a word up (tap) or put it back
      if (this.held?.q === q && this.held.kind === 'tag' && this.held.k === tg.k) { this.held = null; this.dirty = true; return; }
      const slot = q.ans.indexOf(tg.k);
      if (slot >= 0) { q.ans[slot] = null; this._erase(`q${q.i}:s${slot}`); }
      this.held = { q, kind: 'tag', k: tg.k };
      this.sfx('paper', { volume: 0.18, pitch: 1.8 });
    } else if (tg.kind === 'slot') {
      if (this.held?.q === q && this.held.kind === 'tag') { this._place(q, tg.k, this.held.k); this.held = null; }
      else if (q.ans[tg.k] != null) { q.ans[tg.k] = null; this._erase(`q${q.i}:s${tg.k}`); }
    } else if (tg.kind === 'ml') {
      if (this.held?.q === q && this.held.kind === 'ml' && this.held.k === tg.k) { this.held = null; this.dirty = true; return; }
      this.held = { q, kind: 'ml', k: tg.k };
      this.sfx('pen', { volume: 0.12, pitch: 2 });
    } else if (tg.kind === 'mr') {
      if (this.held?.q === q && this.held.kind === 'ml') { this._connect(q, this.held.k, tg.k); this.held = null; }
      else { const l = q.ans.indexOf(tg.k); if (l >= 0) { q.ans[l] = null; this._erase(`q${q.i}:m${l}`); } }
    } else if (tg.kind === 'card') {
      const at = q.ans.indexOf(tg.k);
      if (at >= 0) { for (const si of q.ans.splice(at)) this._erase(`q${q.i}:o${si}`); }
      else {
        q.ans.push(tg.k);
        const o = q.oPos.find((p) => p.si === tg.k);
        pen(`q${q.i}:o${tg.k}`, textPx(String(q.ans.length), 'script', o.x + 2, o.y - 10).px);
      }
    }
    this.dirty = true;
    this._updateHand();
  }
  _place(q, slot, wi) {
    const prev = q.ans.indexOf(wi);
    if (prev >= 0 && prev !== slot) { q.ans[prev] = null; this._erase(`q${q.i}:s${prev}`); }
    if (q.ans[slot] != null) this._erase(`q${q.i}:s${slot}`);
    q.ans[slot] = wi;
    const s = q.slotPos[slot];
    const t = textPx(q.words[wi], 'script', 0, 0);
    this.sfx('pen', { volume: 0.28, pitch: 1.2 });
    this._mark(`q${q.i}:s${slot}`, t.px.map(([xx, yy]) => [xx + s.x + Math.max(2, Math.round((s.w - t.w) / 2)), yy + s.y - 3]));
  }
  _connect(q, l, r) {
    const prev = q.ans.indexOf(r);
    if (prev >= 0) { q.ans[prev] = null; this._erase(`q${q.i}:m${prev}`); }
    q.ans[l] = r;
    const ly = ROWY(q.mRow + l) - 5, ry = ROWY(q.mRow + q.right.indexOf(r)) - 5;
    this.sfx('pen', { volume: 0.3, pitch: 1.1 });
    this._mark(`q${q.i}:m${l}`, linePx(q.mPos.ldot + 2, ly, q.mPos.rdot - 2, ry, { wob: 1.1, seed: l * 7 + r, sag: 1.5 }));
  }
  answered() {
    return this.qs.every((q) => (q.type === 'choice' ? q.ans != null : q.type === 'order' ? q.ans.length === q.steps.length : q.ans.every((a) => a != null)));
  }
  _updateHand() { this.bHand.classList.toggle('ready', this.answered()); }

  // ---------------------------------------------------------------- pointer
  _art(e) {
    const r = this.view.getBoundingClientRect();
    return [(e.clientX - r.left) / this.s - MG, (e.clientY - r.top) / this.s - MG];
  }
  _hit(x, y) {
    let best = null, bd = 1e9;
    for (const t of this.targets) {
      const [rx, ry, rw, rh] = t.r;
      if (x < rx - 2 || y < ry - 2 || x > rx + rw + 2 || y > ry + rh + 2) continue;
      const d = Math.hypot(x - t.cx, y - t.cy);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  _pdown(e) {
    if (this.phase !== 'answer') return;
    e.preventDefault(); e.stopPropagation();
    const [x, y] = this._art(e);
    this.ptr = [x, y];
    const t = this._hit(x, y);
    this.press = { t, x, y, id: e.pointerId };
    if (t?.drag) { this.drag = { t, x, y, moved: false }; try { this.view.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    this.dirty = true;
  }
  _pmove(e) {
    const [x, y] = this._art(e);
    this.ptr = [x, y];
    if (this.drag && Math.hypot(x - this.drag.x, y - this.drag.y) > 3) this.drag.moved = true;
    const h = this._hit(x, y);
    if (h !== this.hover) { this.hover = h; this.view.style.cursor = h ? 'none' : 'none'; }
    if (h) this.focus = this.targets.indexOf(h);
    this.dirty = true;
  }
  _pup(e) {
    if (this.phase !== 'answer') return;
    const [x, y] = this._art(e);
    const d = this.drag; this.drag = null;
    const t = this._hit(x, y);
    if (d && d.moved) {
      // a drag: word onto a box / a line from dot to dot
      if (d.t.kind === 'tag' && t?.kind === 'slot' && t.q === d.t.q) { const q = t.q; const prevSlot = q.ans.indexOf(d.t.k); if (prevSlot >= 0 && prevSlot !== t.k) { q.ans[prevSlot] = null; this._erase(`q${q.i}:s${prevSlot}`); } this._place(q, t.k, d.t.k); this.held = null; this._updateHand(); }
      else if (d.t.kind === 'ml' && t?.kind === 'mr' && t.q === d.t.q) { this._connect(t.q, d.t.k, t.k); this.held = null; this._updateHand(); }
      this.dirty = true;
      return;
    }
    if (this.press && t && t === this.press.t) this._activate(t);
    else if (!t && this.held) { this.held = null; this.dirty = true; }
    this.press = null;
  }

  // ---------------------------------------------------------------- keyboard
  key(e) {
    const k = e.key;
    if (this.phase === 'grade') { if (k === ' ' || k === 'Enter') { this.hurry = true; return true; } if (k === 'Escape') return false; return true; }
    if (this.phase === 'done') { if (k === ' ' || k === 'Enter' || k === 'ArrowRight') { this._next(); return true; } return k !== 'Escape'; }
    if (this.phase !== 'answer') return k !== 'Escape';
    const T = this.targets;
    const n = T.length + 2; // + HAND IN, SKIP TEST
    if (k === 'Tab') { this.focus = (this.focus + (e.shiftKey ? n - 1 : 1)) % n; this._showFocus(); return true; }
    if (k.startsWith('Arrow')) { this._moveFocus(k); this._showFocus(); return true; }
    if (k === 'Enter' || k === ' ') {
      if (this.focus === T.length) this._handIn();
      else if (this.focus === T.length + 1) this._skip();
      else this._activate(T[this.focus]);
      return true;
    }
    if (k === 'Escape') { if (this.held) { this.held = null; this.dirty = true; } else this._skip(); return true; }
    if (/^[1-9]$/.test(k)) { // number keys pick an option of the focused question
      const q = T[this.focus]?.q;
      const list = T.filter((t) => t.q === q && (t.kind === 'bubble' || t.kind === 'card' || t.kind === 'tag' || t.kind === 'ml'));
      const t = list[+k - 1];
      if (t) { this.focus = T.indexOf(t); this._activate(t); this._showFocus(); }
      return true;
    }
    return false;
  }
  _moveFocus(k) {
    const T = this.targets;
    if (this.focus >= T.length) { this.focus = k === 'ArrowUp' || k === 'ArrowLeft' ? T.length - 1 : 0; return; }
    const c = T[this.focus];
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    let best = -1, bd = 1e9;
    T.forEach((t, i) => {
      if (i === this.focus) return;
      const dx = t.cx - c.cx, dy = t.cy - c.cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 1) return;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const sc = along + across * 2.5;
      if (sc < bd) { bd = sc; best = i; }
    });
    if (best >= 0) this.focus = best;
    else if (k === 'ArrowDown' || k === 'ArrowRight') this.focus = T.length; // on to HAND IN
  }
  _showFocus() {
    this.kbd = true; this.dirty = true;
    this.bHand.classList.toggle('focus', this.focus === this.targets.length);
    this.bSkip.classList.toggle('focus', this.focus === this.targets.length + 1);
    const t = this.targets[this.focus];
    if (t && this.el.classList.contains('tp-tall')) {
      const y = (t.cy + MG) * this.s, sc = this.scroll, h = sc.clientHeight;
      if (y - sc.scrollTop < h * 0.25 || y - sc.scrollTop > h * 0.75) sc.scrollTop = Math.max(0, y - h * 0.5);
    }
    if (t) { const tl = this.el.querySelector('.tp-live'); if (tl) tl.textContent = this._describe(t); }
  }
  _describe(t) {
    const q = t.q;
    if (t.kind === 'bubble') return `Question ${q.num}, option ${'ABCDEFG'[t.k]}: ${q.opts[t.k]}`;
    if (t.kind === 'tf') return `Question ${q.num}: ${q.items[t.k].s} ${t.v ? 'True' : 'False'}`;
    if (t.kind === 'tag') return `Word: ${q.words[t.k]}`;
    if (t.kind === 'slot') return `Label box ${t.k + 1}`;
    if (t.kind === 'ml') return `Match: ${q.pairs[t.k][0]}`;
    if (t.kind === 'mr') return `with: ${q.pairs[t.k][1]}`;
    if (t.kind === 'card') return `Step: ${q.steps[t.k]}`;
    return '';
  }

  // ---------------------------------------------------------------- hand in + grading
  _handIn() {
    if (this.phase !== 'answer') return;
    if (!this.answered() && !this._warned) {
      // one nudge, then it goes in as it is
      this._warned = true;
      this.say('Some blanks there. Hand it in anyway? Click again.', 'think');
      this.bHand.classList.add('nudge'); setTimeout(() => this.bHand.classList.remove('nudge'), 500);
      return;
    }
    this.phase = 'grade'; this.held = null; this.drag = null;
    this.bHand.classList.add('hidden'); this.bSkip.classList.add('hidden');
    this.sfx('paper', { volume: 0.55, pitch: 0.9 });
    this._grade().catch(() => {});
  }
  _wait(sec) { return new Promise((res, rej) => { this.waits.push({ t: sec, res, rej }); }); }
  _penTo(x, y, dur = 0.18) {
    const tl = this.tool;
    tl.kind = 'pen'; tl.vis = 1;
    tl.from = [tl.x, tl.y]; tl.goal = [x, y]; tl.gt = 0; tl.gd = dur;
    return this._wait(dur);
  }
  async _grade() {
    const comment = (q, k) => {
      const w = q.why;
      if (Array.isArray(w)) return w[k] ?? null;
      return w ?? null;
    };
    let score = 0;
    const red = (key, px) => { this.sfx('pen', { volume: 0.32, pitch: 0.9 + Math.random() * 0.25 }); return this._mark(key, px, { tool: 'pen', cols: RED }); };
    const verdict = async (x, y, ok, key) => {
      await this._penTo(x + 2, y, 0.14);
      await red(key, ok ? tickPx(x, y) : crossPx(x, y));
    };
    const note = async (text, x, y, key) => {
      if (!text) return;
      const maxX = PW - 6;
      let t = textPx(text, 'script', x, y);
      if (x + t.w > maxX) t = textPx(text, 'script', Math.max(CX0, maxX - t.w), y);
      await this._penTo(t.px[0]?.[0] ?? x, y + 4, 0.16);
      await red(key, t.px);
    };
    this.say(['Let\'s see what we have here...', 'Red pen time.', 'Hmm hm hm...'][Math.floor(Math.random() * 3)], 'think');
    await this._wait(0.6);
    for (const q of this.qs) {
      const y0 = ROWY(q.row0) - 4;
      if (q.type === 'choice') {
        const ok = q.ans === q.a;
        if (ok) score++;
        await verdict(4, y0, ok, `g${q.i}`);
        if (!ok) {
          const p = q.optPos[q.a];
          await this._penTo(p.x + 3, p.y - 1, 0.14);
          await red(`g${q.i}:c`, ringPx(p.x + 3, p.y - 1, 6, 5, q.i));
          const lineEnd = CX0 + 14 + pxMeasure(q.lines[q.lines.length - 1], 'body');
          const txt = comment(q, 0) || String(q.opts[q.a]);
          const yN = ROWY(q.row0 + q.lines.length - 1) - 12;
          await note(txt, Math.max(lineEnd + 8, CX1 - 120), yN, `g${q.i}:n`);
        }
      } else if (q.type === 'tf') {
        let all = true;
        for (let k = 0; k < q.items.length; k++) {
          const it = q.items[k], ok = q.ans[k] === it.a;
          if (ok) score++; else all = false;
          const y = q.itemPos[k].y;
          await verdict(CX1 - 10, y - 1, ok, `g${q.i}:${k}`);
          if (!ok) {
            const bx = it.a ? CX1 - 40 : CX1 - 18;
            await red(`g${q.i}:${k}:c`, ringPx(bx, y - 1, 6, 5, k));
            const why = comment(q, k);
            if (why) await note(why, CX0 + 26 + pxMeasure(q.itemPos[k].lines[0], 'body') + 6, y - 9, `g${q.i}:${k}:n`);
          }
        }
        await verdict(4, y0, all, `g${q.i}`);
      } else if (q.type === 'label') {
        let all = true;
        for (let k = 0; k < q.slots.length; k++) {
          const ok = q.ans[k] === k, s = q.slotPos[k];
          if (ok) score++; else all = false;
          await verdict(s.x + s.w + 2, s.y + 4, ok, `g${q.i}:${k}`);
          if (!ok) await note(q.words[k], s.x + 2, s.y + 10, `g${q.i}:${k}:n`);
        }
        await verdict(4, y0, all, `g${q.i}`);
      } else if (q.type === 'match') {
        let all = true;
        for (let k = 0; k < q.pairs.length; k++) {
          const ok = q.ans[k] === k;
          if (ok) score++; else all = false;
          const y = ROWY(q.mRow + k) - 5;
          const rx = q.mPos.rx + pxMeasure(q.pairs[q.right[k]][1], 'body') + 6;
          await verdict(Math.min(CX1 - 10, rx), y, ok, `g${q.i}:${k}`);
          if (!ok) {
            const ry = ROWY(q.mRow + q.right.indexOf(k)) - 5;
            const L = linePx(q.mPos.ldot + 2, y, q.mPos.rdot - 2, ry, { sag: -2 });
            await red(`g${q.i}:${k}:l`, L.filter((_, j) => j % 4 < 2)); // a dashed red line: the right partner
          }
        }
        await verdict(4, y0, all, `g${q.i}`);
      } else if (q.type === 'order') {
        const ok = q.ans.length === q.steps.length && q.ans.every((si, j) => si === j);
        if (ok) score++;
        await verdict(4, y0, ok, `g${q.i}`);
        if (!ok) {
          for (const o of q.oPos) await red(`g${q.i}:o${o.si}`, textPx(String(o.si + 1), 'tiny', o.x + o.w - 6, o.y - 8).px);
          await note(comment(q, 0) || q.steps.join(' > '), CX0 + 14, ROWY(q.row1 - 1) + 3, `g${q.i}:n`);
        }
      }
      await this._wait(0.12);
    }
    const total = this.total();
    const pct = total ? score / total : 1;
    const grade = gradeFor(pct);
    this.result = { score, total, pct, grade };
    // the score, circled
    const sb = this.scoreBox;
    const st = textPx(String(score), 'script', sb.x + 6, sb.y - 2);
    await this._penTo(sb.x + 8, sb.y + 6, 0.25);
    await red('score', st.px);
    await red('score:c', ringPx(sb.x + 21, sb.y + 8, 21, 10, 5));
    await this._wait(0.25);
    // the stamp
    this.tool.goal = [PW + 30, -20]; this.tool.from = [this.tool.x, this.tool.y]; this.tool.gt = 0; this.tool.gd = 0.3;
    this.stampArt = gradeStamp(grade, { rot: -0.22 });
    this.stamp = { t: 0, x: PW - 118, y: 4 };
    this.say(grade === 'A+' ? 'A PLUS!' : grade === 'A' ? 'An A!' : grade === 'F' ? 'Oh dear.' : `${grade}.`, grade.startsWith('A') ? 'excited' : grade === 'F' ? 'sad' : 'happy');
    await this._wait(0.42);
    this.sfx('stamp', { volume: 0.75 }); this.sfx('class_stamp', { volume: 0.55 });
    this.shake = 0.35;
    await this._wait(0.5);
    if (grade.startsWith('A')) {
      this.sticker = { t: 0, x: PW - 140, y: 30, art: starSticker(12) };
      this.sfx('sticker', { volume: 0.6 }); this.sfx('class_star', { volume: 0.5 });
      await this._wait(0.55);
    }
    this.sfx(grade.startsWith('A') || grade === 'B' ? 'grade_good' : 'grade_bad', { volume: 0.5 });
    this.phase = 'done';
    this.tool.vis = 0;
    this.bNext.classList.remove('hidden');
    this.bNext.classList.add('focus');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (this._done) return;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    const sp = this.hurry ? 4 : 1;
    this.t += dt;
    // waits
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; if (w.t == null) continue; w.t -= dt * sp; if (w.t <= 0) { this.waits.splice(i, 1); w.res(); } }
    // slide in / out (whole device px)
    if (this.phase === 'in') { this.slide += dt / 0.55; if (this.slide >= 1) { this.slide = 1; this.phase = 'answer'; } this.dirty = true; }
    if (this.phase === 'out') { this.slide += dt / 0.45; this.dirty = true; if (this.slide >= 1) { this._finish(this._outRes || { skipped: true }); return; } }
    // the tool: writing / moving / following the pointer
    const tl = this.tool;
    if (tl.writing) {
      const m = tl.writing;
      const rate = (m.tool === 'pen' ? 150 : 110) * sp;
      m.acc = (m.acc || 0) + dt * rate;
      const n = Math.floor(m.acc); m.acc -= n;
      m.drawn = Math.min(m.px.length, m.drawn + n);
      const p = m.px[Math.max(0, m.drawn - 1)];
      if (p) { tl.x = p[0]; tl.y = p[1]; }
      this.inkDirty = true;
      if (m.drawn >= m.px.length) { tl.writing = null; m.res?.(); m.res = null; }
    } else if (tl.goal) {
      tl.gt += dt * sp;
      const k = Math.min(1, tl.gt / tl.gd), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      tl.x = tl.from[0] + (tl.goal[0] - tl.from[0]) * e; tl.y = tl.from[1] + (tl.goal[1] - tl.from[1]) * e;
      if (k >= 1) tl.goal = null;
    } else if (this.phase === 'answer') {
      const tg = this.ptr && !this.kbd ? this.ptr : (this.targets[this.focus] ? [this.targets[this.focus].cx + 4, this.targets[this.focus].cy - 4] : null);
      if (tg) { tl.x += (tg[0] - tl.x) * Math.min(1, dt * (this.ptr && !this.kbd ? 30 : 12)); tl.y += (tg[1] - tl.y) * Math.min(1, dt * (this.ptr && !this.kbd ? 30 : 12)); tl.vis = 1; tl.kind = 'pencil'; }
    }
    if (this.ptr && this.kbd && this._lastPtr !== this.ptr) { this.kbd = false; }
    this._lastPtr = this.ptr;
    if (this.stamp) this.stamp.t += dt * sp;
    if (this.sticker) this.sticker.t += dt * sp;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this.dirty = true;
    this._draw();
  }

  // ---------------------------------------------------------------- paint
  _draw() {
    if (!this.dirty) return;
    this.dirty = false;
    const s = this.s, r = dpr();
    // sheet position: slide up from below (in), away to the right (out), stamp shake
    let ty = 0, tx = 0, rot = 0;
    if (this.phase === 'in') { const k = 1 - this.slide; ty = k * k * (window.innerHeight || 720) * 0.9; rot = -k * 4; }
    if (this.phase === 'out') { const k = this.slide; tx = k * k * (window.innerWidth || 1280) * 0.9; rot = k * 6; ty = -k * 40; }
    if (this.shake > 0) { ty += Math.round(Math.sin(this.t * 90) * this.shake * 6); tx += Math.round(Math.cos(this.t * 70) * this.shake * 3); }
    const snap = (v) => Math.round(v * r) / r;
    this.sheet.style.transform = `translate(${snap(tx)}px, ${snap(ty)}px)${rot ? ` rotate(${rot.toFixed(2)}deg)` : ''}`;
    // ink layer
    if (this.inkDirty) {
      this.inkDirty = false;
      const x = this.ink.getContext('2d');
      x.clearRect(0, 0, this.CW, this.CH);
      x.fillStyle = '#ddd6c4';
      for (const [px, py] of this.smudges) x.fillRect(MG + px, MG + py, 1, 1);
      for (const m of this.marks.values()) for (let i = 0; i < m.drawn; i++) { x.fillStyle = m.col[i]; x.fillRect(MG + m.px[i][0], MG + m.px[i][1], 1, 1); }
    }
    const o = this.out.getContext('2d');
    o.clearRect(0, 0, this.CW, this.CH);
    o.drawImage(this.base, 0, 0);
    o.drawImage(this.ink, 0, 0);
    // placed words hide their bank tags; the held one lifts
    for (const q of this.qs) if (q.type === 'label') q.bankPos.forEach((b) => this._drawTag(o, q, b));
    // hover / focus / held highlights (marching ants, pencil-grey)
    const ants = (rr, col = '#2a6ad8') => {
      const [x0, y0, w, h] = rr.map(Math.round);
      o.fillStyle = col;
      const ph = Math.floor(this.t * 8);
      for (let xx = 0; xx < w; xx++) { if ((xx + ph) % 4 < 2) o.fillRect(MG + x0 + xx, MG + y0, 1, 1); if ((xx - ph + 64) % 4 < 2) o.fillRect(MG + x0 + xx, MG + y0 + h, 1, 1); }
      for (let yy = 0; yy < h; yy++) { if ((yy - ph + 64) % 4 < 2) o.fillRect(MG + x0, MG + y0 + yy, 1, 1); if ((yy + ph) % 4 < 2) o.fillRect(MG + x0 + w, MG + y0 + yy, 1, 1); }
    };
    if (this.phase === 'answer') {
      const ft = this.targets[this.focus];
      if (this.kbd && ft) ants(ft.r);
      else if (this.hover) ants(this.hover.r, '#7a8aa8');
      if (this.held) {
        const ht = this.targets.find((t) => t.q === this.held.q && t.kind === this.held.kind && t.k === this.held.k);
        if (ht) ants(ht.r, '#d0262e');
        // valid drop spots blink
        if (Math.floor(this.t * 3) % 2 === 0) for (const t of this.targets) if (t.q === this.held.q && (t.kind === (this.held.kind === 'tag' ? 'slot' : 'mr'))) ants(t.r, '#8aa86a');
      }
      // dragging a line from a dot: a rubber band in pencil
      const d = this.drag;
      if (d && d.moved && d.t.kind === 'ml' && this.ptr) { o.fillStyle = GR[1]; for (const [px, py] of linePx(d.t.cx, d.t.cy, this.ptr[0], this.ptr[1])) o.fillRect(MG + px, MG + py, 1, 1); }
      if (d && d.moved && d.t.kind === 'tag' && this.ptr) {
        const q = d.t.q, b = q.bankPos.find((p) => p.wi === d.t.k);
        this._drawTag(o, q, b, [Math.round(this.ptr[0] - b.w / 2), Math.round(this.ptr[1] - b.h / 2)], true);
      }
    }
    // the stamp (slams down: big -> small), then it stays inked on the paper
    if (this.stamp) {
      const a = this.stampArt, k = Math.min(1, this.stamp.t / 0.42);
      const sc = k < 1 ? 1 + (1 - k) * (1 - k) * 2.2 : 1;
      const w = Math.round(a.width * sc), h = Math.round(a.height * sc);
      const cx = this.stamp.x + a.width / 2, cy = this.stamp.y + a.height / 2;
      o.imageSmoothingEnabled = false;
      if (k >= 1) o.drawImage(a, MG + Math.round(cx - a.width / 2), MG + Math.round(cy - a.height / 2));
      else { o.globalAlpha = 0.25 + k * 0.75; o.drawImage(a, MG + Math.round(cx - w / 2), MG + Math.round(cy - h / 2), w, h); o.globalAlpha = 1; }
    }
    if (this.sticker) {
      const a = this.sticker.art, k = Math.min(1, this.sticker.t / 0.35);
      const sc = k < 1 ? (k < 0.6 ? k / 0.6 * 1.3 : 1.3 - (k - 0.6) / 0.4 * 0.3) : 1;
      const w = Math.max(1, Math.round(a.width * sc)), h = Math.max(1, Math.round(a.height * sc));
      o.imageSmoothingEnabled = false;
      o.drawImage(a, MG + Math.round(this.sticker.x + a.width / 2 - w / 2), MG + Math.round(this.sticker.y + a.height / 2 - h / 2), w, h);
      if (k >= 1 && Math.floor(this.t * 4) % 3 === 0) { o.fillStyle = '#ffffff'; o.fillRect(MG + this.sticker.x + 5, MG + this.sticker.y + 7, 1, 1); o.fillRect(MG + this.sticker.x + a.width - 4, MG + this.sticker.y + 4, 1, 1); }
    }
    // the tool (tip = bottom-left of the sprite)
    const tl = this.tool;
    if (tl.vis > 0 && (this.phase === 'answer' || this.phase === 'grade')) {
      const img = tools()[tl.kind === 'pen' ? 'pen' : 'pencil'];
      const lift = tl.writing ? 0 : 2;
      o.drawImage(img, MG + Math.round(tl.x) + lift, MG + Math.round(tl.y) - img.height + 1 - lift);
    }
    const v = this.view.getContext('2d');
    v.clearRect(0, 0, this.CW, this.CH);
    v.drawImage(this.out, 0, 0);
    void s;
  }
  _drawTag(o, q, b, at = null, lifted = false) {
    const placed = q.ans.includes(b.wi);
    const held = this.held?.q === q && this.held.kind === 'tag' && this.held.k === b.wi;
    const dragging = this.drag?.moved && this.drag.t.kind === 'tag' && this.drag.t.q === q && this.drag.t.k === b.wi;
    if (!at && dragging) { this._tagShape(o, b.x, b.y, b.w, b.h, q.words[b.wi], 'ghost'); return; }
    const [x, y] = at || [b.x, b.y - (held ? 2 : 0)];
    this._tagShape(o, x, y, b.w, b.h, q.words[b.wi], placed && !at ? 'used' : lifted || held ? 'lift' : 'tag');
  }
  _tagShape(o, x, y, w, h, word, mode) {
    const R = (px, py, ww, hh, col) => { o.fillStyle = col; o.fillRect(MG + px, MG + py, ww, hh); };
    if (mode === 'ghost') { for (let xx = 0; xx < w; xx++) if (xx % 2 === 0) { R(x + xx, y, 1, 1, '#b8b0a0'); R(x + xx, y + h, 1, 1, '#b8b0a0'); } return; }
    if (mode === 'lift') R(x + 2, y + 3, w, h, 'rgba(30,20,10,0.35)');
    R(x, y, w, h + 1, '#3a2a1a');
    R(x + 1, y + 1, w - 2, h - 1, mode === 'used' ? '#e6dfcc' : '#fff6d0');
    R(x + 1, y + h - 1, w - 2, 1, mode === 'used' ? '#d8d0bc' : '#e8d8a0');
    R(x + 3, y + 4, 2, 2, '#3a2a1a');
    const t = textCanvas(word, 'bold', mode === 'used' ? '#a8a296' : '#2c2a36');
    o.drawImage(t.c, MG + x + 8, MG + y + Math.round((h - t.h) / 2) + 1);
    if (mode === 'used') R(x + 6, y + Math.round(h / 2), w - 9, 1, '#9a948a'); // crossed off the bank
  }
}
