// [v32 dig] The dig tray: a short excavation minigame. A crate of layered dirt
// (topsoil, sand, clay, hard rock nodules) with a find buried somewhere inside.
//   BRUSH  (hold + scrub)  takes soft dirt off gently. Slow on rock. Never hurts the find.
//   PICK   (click)         breaks anything in a small radius, fast, but a hit right next
//                          to the find can crack it, and a hit ON it always does.
//   LAMP   (Fossil Lamp)   UV: buried bone glows through the dirt while it is on.
// Uncover ~90% of it and it lifts out of the matrix: condition = cracks (0 perfect .. 3+ in
// pieces). The find stays unidentified until Snapp's bench (src/ui/dig/LabBench.js).
// Everything on the canvas is drawn texel by texel at an integer scale.
//
//   openDigGame(game, { find, siteName, has, onDone(result | null) })  result = { find, cracks, cond }
import { findPix } from './findArt.js';
import { FIND_BY_ID, RARITY_COLORS, RARITY_NAMES, condOf } from '../../data/digFinds.js';
import { Grid, render } from '../bagArt.js';
import { spriteImg, hasSprite } from '../sprites.js';
import { injectDigCSS } from './digCss.js';

const AW = 136, AH = 94; // art size (frame included)
const TX = 8, TY = 8, TW = 120, TH = 78; // the tray inside the crate
const CS = 3, CW = TW / CS, CH = TH / CS; // dirt cells
const HP = { soil: 1.0, sand: 0.7, clay: 1.5, rock: 9 };
const MAT = {
  soil: [[96, 70, 46], [82, 58, 38], [112, 84, 56]],
  sand: [[206, 170, 112], [184, 148, 94], [226, 194, 136]],
  clay: [[150, 104, 78], [128, 86, 62], [170, 124, 94]],
  rock: [[128, 124, 132], [104, 100, 110], [156, 152, 158]],
};
const FLOOR = [[58, 40, 28], [48, 32, 22], [70, 50, 34]];
const RAR_HINT = ['Something small in here...', 'Something nice in here...', 'Something RARE in here!', 'Something BIG in here!!', 'Something... glowing?!'];
const hsh = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// little pixel cursors (bagArt grids)
let CURSORS = null;
function cursors() {
  if (CURSORS) return CURSORS;
  const brush = new Grid(11, 11);
  brush.line(10, 0, 5, 5, 'H').line(10, 1, 6, 5, 'H').rect(3, 5, 3, 2, 'F');
  brush.poly([[0, 8], [2, 6], [5, 7], [4, 10], [1, 10]], 'K');
  const pick = new Grid(11, 11);
  pick.line(9, 10, 4, 3, 'H').line(10, 10, 5, 3, 'H');
  pick.poly([[1, 3], [5, 1], [10, 0], [6, 3], [2, 5]], 'S');
  const lamp = new Grid(11, 11);
  lamp.rect(3, 0, 5, 3, 'C').poly([[1, 3], [9, 3], [10, 7], [0, 7]], 'L').rect(4, 7, 3, 4, 'H');
  CURSORS = {
    brush: render(brush, { H: 'wood.R@h', F: 'brass.R', K: 'leather.r' }),
    pick: render(pick, { H: 'wood.R@h', S: 'steel.R@s' }),
    lamp: render(lamp, { C: 'iron.R', L: 'purple.R', H: 'wood.R' }),
  };
  return CURSORS;
}

export function openDigGame(game, opts) { return new DigGame(game, opts); }

class DigGame {
  constructor(game, { find, siteName = 'Dig site', has = () => false, onDone = () => {}, tip = '' }) {
    injectDigCSS();
    this.game = game;
    this.F = FIND_BY_ID[find] || FIND_BY_ID.ammonite;
    this.has = has;
    this.onDone = onDone;
    this.tool = 'brush';
    this.cracks = 0;
    this.parts = [];
    this.crackLines = [];
    this.t = 0;
    this.shake = 0;
    this.done = false;
    this.lift = -1;
    this.ptr = { x: -99, y: -99, down: false, moved: 0, inside: false };
    this.lampOn = false;
    this.exposedOnce = false;
    this.sfxT = 0;
    this.pickCD = 0;
    this.seed = Math.floor(Math.random() * 1e6);
    this.build(siteName, tip);
    this.gen();
    this.wasPaused = game.state.paused;
    game.state.paused = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    game.audio?.play?.('dig_open', { volume: 0.5 });
  }

  // ------------------------------------------------------------------ DOM
  build(siteName, tip) {
    const el = (this.el = document.createElement('div'));
    el.className = 'dg-wrap';
    const R = this.F.r;
    const tool = (id, icon, label, key) => `<button class="dg-tool${id === this.tool ? ' on' : ''}" data-t="${id}">${hasSprite(icon) ? spriteImg(icon, 2, 'dg-ico') : ''}<span>${label}</span><kbd>${key}</kbd></button>`;
    el.innerHTML = `
      <div class="dg-box">
        <div class="dg-head">
          <div class="dg-site"><b>${esc(siteName)}</b><em style="color:${RARITY_COLORS[R]}">${esc(RAR_HINT[R])}</em></div>
          <div class="dg-cond"><canvas class="dg-bones" width="44" height="9"></canvas><span class="dg-cname">Perfect</span></div>
        </div>
        <div class="dg-stage"><canvas class="dg-cv" width="${AW}" height="${AH}"></canvas><div class="dg-tip">${esc(tip || 'Brush near the bone. Pick the hard stuff.')}</div></div>
        <div class="dg-foot">
          <div class="dg-tools">${tool('brush', 'dig_brush', 'Brush', '1')}${tool('pick', 'dig_pick', 'Pick', '2')}${this.has('r_dig_lamp') ? tool('lamp', 'dig_lamp', 'UV Lamp', '3') : ''}</div>
          <div class="dg-tape"><canvas class="dg-tapecv" width="80" height="9"></canvas><span class="dg-pct">0%</span></div>
          <button class="dg-leave">Leave it <kbd>Esc</kbd></button>
        </div>
      </div>`;
    (game0(this.game)).appendChild(el);
    this.cv = el.querySelector('.dg-cv');
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(AW, AH);
    this.bonesCv = el.querySelector('.dg-bones');
    this.tapeCv = el.querySelector('.dg-tapecv');
    this.layout();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    el.querySelectorAll('.dg-tool').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.setTool(b.dataset.t); }));
    el.querySelector('.dg-leave').addEventListener('click', (e) => { e.stopPropagation(); this.close(null); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => { e.stopPropagation(); e.preventDefault(); }, { passive: false });
    const P = (e) => {
      const r = this.cv.getBoundingClientRect();
      this.ptr.x = ((e.clientX - r.left) / r.width) * AW;
      this.ptr.y = ((e.clientY - r.top) / r.height) * AH;
      this.ptr.inside = this.ptr.x >= 0 && this.ptr.y >= 0 && this.ptr.x < AW && this.ptr.y < AH;
    };
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); this.cv.setPointerCapture?.(e.pointerId); P(e); this.ptr.down = true; this.ptr.moved = 0; this.press(); });
    this.cv.addEventListener('pointermove', (e) => { const ox = this.ptr.x, oy = this.ptr.y; P(e); this.ptr.moved += Math.hypot(this.ptr.x - ox, this.ptr.y - oy); });
    this.cv.addEventListener('pointerup', () => { this.ptr.down = false; if (this.tool === 'lamp') this.lampOn = false; });
    this.cv.addEventListener('pointerleave', () => { this.ptr.inside = false; });
    this.onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(null); return; }
      if (e.key === '1') this.setTool('brush');
      if (e.key === '2') this.setTool('pick');
      if (e.key === '3' && this.has('r_dig_lamp')) this.setTool('lamp');
      if (/^[123]$/.test(e.key) || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', this.onKey, true);
  }
  layout() {
    const s = Math.max(2, Math.floor(Math.min((innerWidth - 32) / AW, (innerHeight - 170) / AH)));
    this.scale = s;
    this.cv.style.width = AW * s + 'px';
    this.cv.style.height = AH * s + 'px';
    this.el.style.setProperty('--dgw', AW * s + 'px');
    for (const c of [this.bonesCv, this.tapeCv]) { c.style.width = c.width * Math.max(2, Math.round(s / 2)) + 'px'; c.style.height = c.height * Math.max(2, Math.round(s / 2)) + 'px'; }
  }
  setTool(t) {
    if (this.done) return;
    this.tool = t;
    this.el.querySelectorAll('.dg-tool').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    this.game.audio?.play?.('click', { volume: 0.3, pitch: t === 'pick' ? 0.8 : 1.2 });
  }

  // ------------------------------------------------------------------ the ground
  gen() {
    const F = this.F;
    const s = [1.5, 2, 2.6][F.big] || 2;
    this.fp = findPix(F.id, s);
    const fw = this.fp.w, fh = this.fp.h;
    this.fx = TX + 6 + Math.floor(Math.random() * Math.max(1, TW - fw - 12));
    this.fy = TY + 6 + Math.floor(Math.random() * Math.max(1, TH - fh - 12));
    // fossil coverage per cell
    this.cover = new Uint16Array(CW * CH);
    this.total = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      if (this.fp.d[(y * fw + x) * 4 + 3] < 128) continue;
      const cx = Math.floor((this.fx + x - TX) / CS), cy = Math.floor((this.fy + y - TY) / CS);
      if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) continue;
      this.cover[cy * CW + cx]++;
      this.total++;
    }
    // layers per cell (top = last): topsoil over sand / clay bands, rock nodules
    const sd = this.seed;
    const deep = 1 + F.r * 0.25;
    this.L = [];
    this.prog = new Float32Array(CW * CH);
    for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
      const i = cy * CW + cx;
      const n = vn2(cx * 0.22, cy * 0.22, sd);
      const depth = clamp(Math.round(2 + n * 2.4 * deep), 2, 5);
      const L = [];
      const rocky = vn2(cx * 0.3 + 40, cy * 0.3, sd + 7) > 0.6;
      for (let k = 0; k < depth; k++) {
        let m = k === depth - 1 ? 'soil' : (k + Math.floor(n * 3)) % 2 ? 'sand' : 'clay';
        if (rocky && k > 0 && k < depth - 1) m = 'rock';
        L.push(m);
      }
      // the find sits in a jacket of clay, sometimes with a rock nodule right on it
      if (this.cover[i]) { L[0] = hsh(cx, cy, sd + 3) < 0.22 ? 'rock' : 'clay'; }
      this.L[i] = L;
    }
    // a corner of it already peeks out (where to start)
    let peek = null;
    for (let cy = 0; cy < CH && !peek; cy++) for (let cx = 0; cx < CW && !peek; cx++) if (this.cover[cy * CW + cx] > 2) peek = [cx, cy];
    if (peek) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) { const i = (peek[1] + dy) * CW + peek[0] + dx; if (this.L[i] && this.cover[i]) this.L[i] = []; }
  }
  layersAt(cx, cy) { return cx < 0 || cy < 0 || cx >= CW || cy >= CH ? null : this.L[cy * CW + cx]; }
  exposure() {
    let e = 0;
    for (let i = 0; i < CW * CH; i++) if (this.cover[i] && !this.L[i].length) e += this.cover[i];
    return this.total ? e / this.total : 1;
  }

  // ------------------------------------------------------------------ tools
  press() {
    if (this.done || !this.ptr.inside) return;
    if (this.tool === 'pick') this.strike();
    if (this.tool === 'lamp') { this.lampOn = true; this.game.audio?.play?.('dig_uv', { volume: 0.35 }); }
  }
  cellOf(x, y) { return [Math.floor((x - TX) / CS), Math.floor((y - TY) / CS)]; }
  popLayer(i, cx, cy, kind) {
    const L = this.L[i];
    const m = L.pop();
    this.prog[i] = 0;
    const px = TX + cx * CS + 1, py = TY + cy * CS + 1;
    const c = MAT[m]?.[0] || [120, 100, 80];
    if (kind === 'brush') for (let k = 0; k < 2; k++) this.part(px + Math.random() * 2, py + Math.random() * 2, (Math.random() - 0.5) * 18, -10 - Math.random() * 14, 0.7, c, 'dust');
    else for (let k = 0; k < 3; k++) this.part(px, py, (Math.random() - 0.5) * 70, -30 - Math.random() * 40, 0.6, c, 'chip');
    if (!L.length && this.cover[i]) {
      if (!this.exposedOnce) { this.exposedOnce = true; this.say(this.F.kind === 'amber' ? 'Ooh, something shiny!' : 'Bone! Easy now...'); }
      if (Math.random() < 0.35) this.sparkle(px + 1, py + 1, this.F.kind === 'amber' ? [255, 200, 80] : [255, 248, 220]);
      if (this.sfxT <= 0) { this.game.audio?.play?.('dig_glint', { volume: 0.25, pitch: 0.9 + Math.random() * 0.3 }); this.sfxT = 0.18; }
    }
  }
  brush(dt) {
    const rate = 2.4 * (this.has('r_dig_brush') ? 2 : 1);
    const mv = clamp(this.ptr.moved / 6, 0.35, 1);
    this.ptr.moved = 0;
    const [pcx, pcy] = this.cellOf(this.ptr.x, this.ptr.y);
    let any = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const cx = pcx + dx, cy = pcy + dy;
      const L = this.layersAt(cx, cy);
      if (!L || !L.length) continue;
      const cxw = TX + (cx + 0.5) * CS, cyw = TY + (cy + 0.5) * CS;
      const d = Math.hypot(cxw - this.ptr.x, cyw - this.ptr.y) / CS;
      if (d > 2.3) continue;
      const i = cy * CW + cx;
      this.prog[i] += rate * dt * mv * (1 - d / 2.6);
      any = true;
      if (this.prog[i] >= HP[L[L.length - 1]]) this.popLayer(i, cx, cy, 'brush');
    }
    if (any) {
      if (Math.random() < dt * 14) this.part(this.ptr.x + (Math.random() - 0.5) * 6, this.ptr.y + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 14, -8 - Math.random() * 10, 0.8, [150, 120, 90], 'dust');
      if (this.sfxT <= 0) { this.game.audio?.play?.('dig_brush', { volume: 0.22, pitch: 0.9 + Math.random() * 0.25 }); this.sfxT = 0.16; }
    }
  }
  strike() {
    if (this.pickCD > 0) return;
    this.pickCD = 0.24;
    const [pcx, pcy] = this.cellOf(this.ptr.x, this.ptr.y);
    const fine = this.has('r_dig_pick');
    let crackAt = null, rock = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const centre = !dx && !dy;
      if (!centre && Math.random() < 0.25) continue;
      const cx = pcx + dx, cy = pcy + dy;
      const L = this.layersAt(cx, cy);
      if (!L) continue;
      const i = cy * CW + cx;
      if (!L.length) {
        // nothing left between the pick and the find
        if (this.cover[i] && (centre || Math.random() < 0.5)) crackAt = crackAt || [cx, cy];
        continue;
      }
      if (L[L.length - 1] === 'rock') rock = true;
      this.popLayer(i, cx, cy, 'pick');
      if (!L.length && this.cover[i] && Math.random() < (centre ? (fine ? 0.1 : 0.32) : (fine ? 0.04 : 0.14))) crackAt = crackAt || [cx, cy];
    }
    this.shake = Math.max(this.shake, rock ? 2.4 : 1.6);
    this.game.audio?.play?.(rock ? 'dig_pick' : 'dig_thud', { volume: 0.4, pitch: 0.9 + Math.random() * 0.2 });
    for (let k = 0; k < (rock ? 6 : 3); k++) this.part(this.ptr.x, this.ptr.y, (Math.random() - 0.5) * 90, -40 - Math.random() * 50, 0.7, rock ? [180, 176, 184] : [120, 92, 64], 'chip');
    if (rock) this.sparkle(this.ptr.x, this.ptr.y, [255, 240, 180]);
    if (crackAt) this.crack(crackAt[0], crackAt[1]);
  }
  crack(cx, cy) {
    this.cracks++;
    const x0 = TX + cx * CS + 1 - this.fx, y0 = TY + cy * CS + 1 - this.fy;
    const pts = [[x0, y0]];
    let a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 6 + this.cracks * 2; k++) { a += (Math.random() - 0.5) * 1.4; const p = pts[pts.length - 1]; pts.push([p[0] + Math.cos(a) * 1.6, p[1] + Math.sin(a) * 1.6]); }
    this.crackLines.push(pts);
    this.shake = 4;
    this.flash = 0.35;
    this.game.audio?.play?.('dig_crack', { volume: 0.55 });
    this.say(['CRACK. ...Careful!', 'Oof. That was the bone.', 'Gently! GENTLY!', 'Snapp felt that. Somewhere.'][Math.min(3, this.cracks - 1)], true);
    this.drawBones();
  }

  // ------------------------------------------------------------------ fx
  part(x, y, vx, vy, life, col, kind) { if (this.parts.length < 260) this.parts.push({ x, y, vx, vy, life, max: life, col, kind }); }
  sparkle(x, y, col) { for (let k = 0; k < 4; k++) this.part(x, y, (Math.random() - 0.5) * 40, -20 - Math.random() * 30, 0.5, col, 'spark'); }
  say(text, bad = false) {
    const tip = this.el.querySelector('.dg-tip');
    if (!tip) return;
    tip.textContent = text;
    tip.classList.toggle('bad', bad);
    tip.classList.remove('pop'); void tip.offsetWidth; tip.classList.add('pop');
  }
  drawBones() {
    // the condition meter: four little bones, one cracks per crack
    const c = this.bonesCv.getContext('2d');
    c.clearRect(0, 0, 44, 9);
    const bone = ['.##.....##.', '####...####', '.#########.', '####...####', '.##.....##.'];
    for (let k = 0; k < 4; k++) {
      const broken = k < this.cracks;
      bone.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch !== '#') return;
        const split = broken && (x === 5 || (x === 6 && y % 2));
        c.fillStyle = split ? '#2a1e14' : broken ? '#b89870' : y === 0 || x === 0 ? '#fff8e4' : y >= 3 ? '#cab890' : '#eee2c4';
        c.fillRect(k * 11 + x, y + 2, 1, 1);
      }));
    }
    const C = condOf(this.cracks);
    const n = this.el.querySelector('.dg-cname');
    n.textContent = C.name;
    n.style.color = C.color;
  }
  drawTape(e) {
    // a measuring tape: yellow, black ticks, red fill = exposed
    const c = this.tapeCv.getContext('2d');
    c.fillStyle = '#2a1e14'; c.fillRect(0, 0, 80, 9);
    c.fillStyle = '#f0c832'; c.fillRect(1, 1, 78, 7);
    c.fillStyle = '#d8402a'; c.fillRect(1, 5, Math.round(78 * e), 3);
    c.fillStyle = '#2a1e14';
    for (let x = 4; x < 79; x += 4) c.fillRect(x, 1, 1, x % 20 === 0 ? 4 : 2);
    c.fillStyle = '#fff8c8'; c.fillRect(1, 1, 78, 1);
    this.el.querySelector('.dg-pct').textContent = Math.round(e * 100) + '%';
  }

  // ------------------------------------------------------------------ loop
  frame(now) {
    if (this.closed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.sfxT -= dt; this.pickCD -= dt;
    if (!this.done && this.ptr.down && this.ptr.inside && this.tool === 'brush') this.brush(dt);
    if (this.tool === 'lamp' && !this.ptr.down) this.lampOn = false;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'chip') p.vy += 220 * dt; else { p.vx *= 0.96; p.vy *= 0.95; }
    }
    this.shake = Math.max(0, this.shake - dt * 14);
    this.flash = Math.max(0, (this.flash || 0) - dt);
    const e = this.exposure();
    if (!this.done && e >= 0.9) this.extract();
    if (this.lift >= 0) this.lift += dt;
    this.draw();
    if (!this._lastE || Math.abs(this._lastE - e) > 0.004) { this._lastE = e; this.drawTape(e); }
    if (!this._bonesDrawn) { this._bonesDrawn = true; this.drawBones(); }
    const sh = this.shake;
    this.cv.style.transform = sh > 0.05 ? `translate(${Math.round((Math.random() - 0.5) * sh) * this.scale}px, ${Math.round((Math.random() - 0.5) * sh) * this.scale}px)` : '';
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  draw() {
    const D = this.img.data;
    const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= AW || y >= AH) return; const k = (y * AW + x) * 4; D[k] = r; D[k + 1] = g; D[k + 2] = b; D[k + 3] = 255; };
    const sd = this.seed;
    // the crate (frame): planks, grain, corner nails
    for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
      if (x >= TX && x < TX + TW && y >= TY && y < TY + TH) continue;
      const edge = x === 0 || y === 0 || x === AW - 1 || y === AH - 1 || x === TX - 1 && y >= TY - 1 && y <= TY + TH || x === TX + TW && y >= TY - 1 && y <= TY + TH || y === TY - 1 && x >= TX - 1 && x <= TX + TW || y === TY + TH && x >= TX - 1 && x <= TX + TW;
      if (edge) { put(x, y, 42, 26, 16); continue; }
      const horiz = y < TY || y >= TY + TH;
      const a = horiz ? x : y, b = horiz ? y : x;
      const seam = horiz ? (x % 34 === 0) : (y % 30 === 0);
      const grain = vn2(a * 0.18, b * 0.9, sd + 11);
      let c = grain > 0.62 ? [150, 100, 54] : grain < 0.3 ? [118, 76, 38] : [136, 88, 46];
      if (b === (horiz ? (y < TY ? 1 : TY + TH + 1) : (x < TX ? 1 : TX + TW + 1))) c = [176, 124, 70];
      if (seam) c = [86, 54, 28];
      put(x, y, c[0], c[1], c[2]);
    }
    for (const [nx, ny] of [[3, 3], [AW - 5, 3], [3, AH - 5], [AW - 5, AH - 5], [AW / 2 - 1, 3], [AW / 2 - 1, AH - 5]]) { put(nx, ny, 210, 210, 220); put(nx + 1, ny, 150, 150, 160); put(nx, ny + 1, 150, 150, 160); put(nx + 1, ny + 1, 90, 90, 100); }
    // the tray
    const fp = this.fp, fw = fp.w;
    const lift = this.lift >= 0 ? Math.min(1, this.lift / 0.6) : 0;
    for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
      const i = cy * CW + cx, L = this.L[i], n = L.length;
      const nb = (dx, dy) => { const q = this.layersAt(cx + dx, cy + dy); return q ? q.length : n; };
      const up = nb(0, -1), dn = nb(0, 1), lf = nb(-1, 0), rt = nb(1, 0);
      for (let py = 0; py < CS; py++) for (let px = 0; px < CS; px++) {
        const x = TX + cx * CS + px, y = TY + cy * CS + py;
        let c;
        if (!n) {
          // exposed: the find (unless it is lifting out), or the damp floor
          const fx = x - this.fx, fy = y - this.fy;
          const k = fx >= 0 && fy >= 0 && fx < fw && fy < fp.h ? (fy * fw + fx) * 4 : -1;
          if (k >= 0 && fp.d[k + 3] > 127 && lift === 0) c = [fp.d[k], fp.d[k + 1], fp.d[k + 2]];
          else { const t = FLOOR[hsh(x, y, sd) < 0.15 ? 1 : hsh(x, y, sd + 1) < 0.1 ? 2 : 0]; c = t.slice(); }
          // walls of the pit around it cast a shadow in
          if ((py === 0 && up > 0) || (px === 0 && lf > 0)) c = c.map((v) => v * 0.6);
        } else {
          const m = L[n - 1];
          const h = hsh(x, y, sd + n * 17);
          c = (MAT[m] || MAT.soil)[h < 0.14 ? 1 : h > 0.88 ? 2 : 0].slice();
          if (m === 'rock' && ((x + y * 2) % 7 === 0 || hsh(x >> 1, y >> 1, sd + 5) < 0.08)) c = [88, 84, 94];
          if (m === 'soil' && hsh(x, y, sd + 9) < 0.03) c = [170, 160, 140]; // a pebble
          const depthK = 0.72 + n * 0.08;
          c = c.map((v) => v * depthK);
          // brushed-at cells look scuffed
          if (this.prog[i] > 0.05 && h < this.prog[i] * 0.5) c = c.map((v) => v * 1.12);
          // a step down to a lower neighbour: a lit lip; a higher neighbour: shadow
          if ((py === 0 && up > n) || (px === 0 && lf > n)) c = c.map((v) => v * 0.68);
          if ((py === CS - 1 && dn < n) || (px === CS - 1 && rt < n)) c = c.map((v) => Math.min(255, v * 1.18));
          // a fleck of bone in the dirt right above the find
          if (this.cover[i] && n === 1 && h > 0.965) c = [230, 216, 186];
          // the UV lamp: buried bone glows through
          if (this.lampOn) {
            const fx = x - this.fx, fy = y - this.fy;
            const k = fx >= 0 && fy >= 0 && fx < fw && fy < fp.h ? (fy * fw + fx) * 4 : -1;
            c = [c[0] * 0.45, c[1] * 0.4, c[2] * 0.65];
            if (k >= 0 && fp.d[k + 3] > 127) { const gl = 0.55 + 0.25 * Math.sin(this.t * 6 + (x + y) * 0.3); c = [150 * gl + 40, 120 * gl + 30, 255 * gl]; }
          }
        }
        put(x, y, c[0] | 0, c[1] | 0, c[2] | 0);
      }
    }
    // cracks over the exposed find
    for (const pts of this.crackLines) for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2);
      for (let q = 0; q <= n; q++) {
        const x = Math.round(ax + (bx - ax) * q / n) + this.fx, y = Math.round(ay + (by - ay) * q / n) + this.fy;
        const [cx, cy] = this.cellOf(x, y);
        const L = this.layersAt(cx, cy);
        const fx = x - this.fx, fy = y - this.fy;
        if (!L || L.length || fx < 0 || fy < 0 || fx >= fw || fy >= fp.h || fp.d[(fy * fw + fx) * 4 + 3] < 128 || lift > 0) continue;
        put(x, y, 42, 30, 20);
        put(x + 1, y + 1, 255, 246, 226);
      }
    }
    // lifting out: the find floats up out of the matrix with a shadow and a glow ring
    if (lift > 0) {
      const oy = -Math.round(Math.sin(lift * Math.PI * 0.5) * 6);
      const glowC = this.F.kind === 'amber' ? [255, 210, 110] : [255, 248, 210];
      for (let y = 0; y < fp.h; y++) for (let x = 0; x < fw; x++) {
        const k = (y * fw + x) * 4;
        if (fp.d[k + 3] < 128) continue;
        put(this.fx + x + 2, this.fy + y + 3, 40, 28, 18); // shadow
      }
      for (let y = 0; y < fp.h; y++) for (let x = 0; x < fw; x++) {
        const k = (y * fw + x) * 4;
        if (fp.d[k + 3] < 128) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= fw || yy >= fp.h || fp.d[(yy * fw + xx) * 4 + 3] < 128; });
        if (edge && Math.sin(this.t * 10) > -0.2) { put(this.fx + x, this.fy + y + oy - 1, glowC[0], glowC[1], glowC[2]); }
        put(this.fx + x, this.fy + y + oy, fp.d[k], fp.d[k + 1], fp.d[k + 2]);
      }
      for (const pts of this.crackLines) for (const [x, y] of pts) put(Math.round(x) + this.fx, Math.round(y) + this.fy + oy, 42, 30, 20);
    }
    // particles
    for (const p of this.parts) {
      const a = p.life / p.max;
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.kind === 'spark') { const c = p.col; put(x, y, c[0], c[1], c[2]); if (a > 0.5) { put(x + 1, y, c[0], c[1], c[2]); put(x - 1, y, c[0], c[1], c[2]); put(x, y + 1, c[0], c[1], c[2]); put(x, y - 1, c[0], c[1], c[2]); } continue; }
      if (p.kind === 'dust' && a < 0.4 && (x + y) % 2) continue; // dithered fade
      const c = p.kind === 'dust' ? p.col.map((v) => Math.min(255, v * 1.25)) : p.col;
      put(x, y, c[0], c[1], c[2]);
      if (p.kind === 'chip' && a > 0.5) put(x + 1, y, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
    }
    // the tool under the pointer
    if (this.ptr.inside && !this.done) {
      const cur = cursors()[this.tool];
      const swing = this.tool === 'pick' && this.pickCD > 0.1 ? 2 : 0;
      const wig = this.tool === 'brush' && this.ptr.down ? Math.round(Math.sin(this.t * 30) * 1.5) : 0;
      const ox = Math.round(this.ptr.x) - (this.tool === 'pick' ? 1 : 0) + wig, oy = Math.round(this.ptr.y) - cur.h + 2 + swing;
      for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) { const k = (y * cur.w + x) * 4; if (cur.d[k + 3] > 127) put(ox + x, oy + y, cur.d[k], cur.d[k + 1], cur.d[k + 2]); }
    }
    // a red flash on a crack
    if (this.flash > 0 && Math.floor(this.t * 20) % 2) for (let x = TX; x < TX + TW; x++) { put(x, TY, 220, 40, 40); put(x, TY + TH - 1, 220, 40, 40); }
    this.ctx.putImageData(this.img, 0, 0);
  }

  // ------------------------------------------------------------------ the end
  extract() {
    this.done = true;
    this.lampOn = false;
    // the last bits crumble away
    for (let i = 0; i < CW * CH; i++) if (this.cover[i] && this.L[i].length) { const cx = i % CW, cy = (i / CW) | 0; while (this.L[i].length) this.popLayer(i, cx, cy, 'brush'); }
    setTimeout(() => {
      if (this.closed) return;
      this.lift = 0;
      const R = this.F.r;
      this.game.audio?.play?.(['reveal_common', 'reveal_common', 'reveal_rare', 'reveal_epic', 'reveal_legendary'][R] || 'reveal_rare', { volume: 0.5 });
      for (let k = 0; k < 16; k++) this.sparkle(this.fx + Math.random() * this.fp.w, this.fy + Math.random() * this.fp.h, this.F.kind === 'amber' ? [255, 210, 110] : [255, 250, 220]);
      this.showResult();
    }, 380);
  }
  showResult() {
    const C = condOf(this.cracks), R = this.F.r;
    const card = document.createElement('div');
    card.className = 'dg-result';
    card.innerHTML = `
      <div class="dg-rtag" style="--rc:${RARITY_COLORS[R]}">${esc(RARITY_NAMES[R])} ${this.F.kind === 'amber' ? 'amber' : 'fossil'}</div>
      <div class="dg-rname">Unidentified find</div>
      <div class="dg-rstamp" style="--sc:${C.color}">${esc(C.stamp)}</div>
      <div class="dg-rline">Still crusted in rock. Take it to Snapp's lab bench to clean and identify it.</div>
      <button class="dg-rok">Into the bag <kbd>Space</kbd></button>`;
    this.el.querySelector('.dg-stage').appendChild(card);
    const go = () => this.close({ find: this.F.id, cracks: this.cracks, cond: Math.min(3, this.cracks) });
    card.querySelector('.dg-rok').addEventListener('click', (e) => { e.stopPropagation(); go(); });
    this.onKey2 = (e) => { if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } };
    setTimeout(() => window.addEventListener('keydown', this.onKey2, true), 300);
  }
  close(result) {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    if (this.onKey2) window.removeEventListener('keydown', this.onKey2, true);
    window.removeEventListener('resize', this.onResize);
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 220);
    this.game.state.paused = this.wasPaused;
    if (!result) this.game.audio?.play?.('close', { volume: 0.3 });
    try { this.onDone(result); } catch (e) { console.warn('[dig] done', e); }
  }
}
function game0(game) { return game.ui?.root || document.body; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
