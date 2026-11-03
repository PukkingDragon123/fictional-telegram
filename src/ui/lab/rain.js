// [v31 lab] The lab computer's background: a faint pixel "code rain" of hex digits
// (src/ui/LabTree.js). A 3x5 bitmap font drawn at 2 css px per art px onto one canvas,
// whole device px, ~12 fps, cheap (a few hundred drawImage calls). Kept very dim so the
// desktop and the research tree stay readable; a dithered veil dims it further under
// the tree. With reduced motion it is drawn once and stays still.
//
//   const rain = new Rain(canvas);  rain.fit(cssW, cssH);  rain.draw(seconds);
const GLYPHS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'], A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'], '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '#': ['#.#', '###', '#.#', '###', '#.#'], ':': ['...', '.#.', '...', '.#.', '...'],
};
const KEYS = Object.keys(GLYPHS);
// head -> tail, dark green on near-black: never brighter than a dim line of the UI
const SHADES = ['#1f6e3a', '#124a26', '#0d3519', '#0a2714', '#071c0e'];
const CW = 4, CH = 7; // cell (art px)
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hash(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 2654435761) ^ Math.imul(b + 0x7f4a7c15, 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export class Rain {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.u = 2;
    this.cols = 0;
    this.rows = 0;
    this.atlas = null;
    this.last = -1;
    this.drawnStill = false;
  }

  // glyph atlas: one row per shade, at u device px per art px
  _atlas(u) {
    const c = document.createElement('canvas');
    c.width = KEYS.length * CW * u;
    c.height = SHADES.length * CH * u;
    const x = c.getContext('2d');
    SHADES.forEach((col, s) => {
      x.fillStyle = col;
      KEYS.forEach((k, i) => {
        GLYPHS[k].forEach((row, y) => { for (let j = 0; j < 3; j++) if (row[j] === '#') x.fillRect((i * CW + j) * u, (s * CH + y) * u, u, u); });
      });
    });
    return c;
  }

  fit(cssW, cssH) {
    const r = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    const u = Math.max(1, Math.round(2 * r));
    const w = Math.max(1, Math.round((cssW * u) / 2)), h = Math.max(1, Math.round((cssH * u) / 2));
    if (w === this.cv.width && h === this.cv.height && u === this.u) return;
    this.cv.width = w;
    this.cv.height = h;
    this.cv.style.width = `${(w * 2) / u}px`;
    this.cv.style.height = `${(h * 2) / u}px`;
    if (u !== this.u || !this.atlas) this.atlas = this._atlas(u);
    this.u = u;
    this.cols = Math.ceil(w / (CW * u));
    this.rows = Math.ceil(h / (CH * u));
    this.last = -1;
    this.drawnStill = false;
  }

  draw(t) {
    if (!this.atlas || !this.cols) return;
    if (REDUCED) { if (this.drawnStill) return; this.drawnStill = true; t = 7.3; }
    const tick = Math.floor(t * 12);
    if (tick === this.last) return;
    this.last = tick;
    const { ctx, u, cols, rows } = this;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const cw = CW * u, ch = CH * u;
    for (let c = 0; c < cols; c++) {
      const r0 = hash(c, 1);
      if (r0 > 0.27) continue; // about a quarter of the columns carry a stream
      const len = 5 + Math.floor(hash(c, 2) * 9);
      const speed = 0.35 + hash(c, 3) * 0.9; // cells per tick / 12
      const span = rows + len + 6;
      const head = Math.floor((tick * speed * 0.5 + hash(c, 4) * span) % span);
      for (let k = 0; k < len; k++) {
        const row = head - k;
        if (row < 0 || row >= rows) continue;
        const s = k === 0 ? 0 : Math.min(SHADES.length - 1, 1 + Math.floor((k / len) * (SHADES.length - 1)));
        const flick = Math.floor(tick / (6 + ((c + row) % 5)));
        const g = Math.floor(hash(c * 131 + row, flick) * KEYS.length);
        ctx.drawImage(this.atlas, g * cw, s * ch, cw, ch, c * cw, row * ch, cw, ch);
      }
    }
  }
}
