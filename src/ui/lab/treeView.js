// Canvas renderer for the lab computer's research tree (src/ui/LabTree.js).
// One 2D canvas, redrawn only when something changed: section bands, orthogonal
// wires (axis-aligned fillRects, so every line is a crisp device pixel), node
// boxes with phosphor-green icons, names and a status line. Off-screen bands /
// wires / nodes are skipped; text and icons drop out when zoomed far out.
import { drawGlyph } from './glyphs.js';

export const COL = {
  bg: '#020904',
  bandA: '#020904',
  bandB: '#03100a',
  rule: '#0d3019',
  hatch: '#06190d',
  head: '#52e47e',
  headDim: '#2b7442',
  wireOff: '#123d21',
  wireOn: '#3fc46a',
  wireRun: '#8ef5aa',
  // node: [fill, border, name, status]
  done: ['#082a14', '#2f9a52', '#b2f7c2', '#47c86f'],
  avail: ['#03140a', '#52e47e', '#d0ffd8', '#52e47e'],
  run: ['#03140a', '#8ef5aa', '#d0ffd8', '#8ef5aa'],
  zone: ['#020e07', '#24693a', '#4ea468', '#2b7442'],
  locked: ['#020a05', '#123d21', '#2b6a40', '#1f5532'],
  sealed: ['#020805', '#0c2a17', '#1d4a2c', '#174a2b'],
  hi: '#d0ffd8',
  amber: '#ffc04a',
  sel: '#d0ffd8',
};
const RAMP_OF = { done: 'done', avail: 'on', run: 'on', zone: 'mid', locked: 'dim', sealed: 'dim' };
export const FONT = '"TBME Title", "TBME Body", monospace';
const SPIN = ['|', '/', '-', '\\'];

export class TreeView {
  constructor(canvas, L, icons) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.L = L;
    this.icons = icons;
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.measured = false;
    this._hatch = null;
  }

  setSize(w, h, dpr) {
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
  }

  // name fitting + port tag boxes (world units). Needs the pixel font: call again once it loads.
  measure() {
    const ctx = this.ctx;
    const G = this.L.G;
    const room = G.NW - 52;
    const wOf = (t, px) => { ctx.font = `${px}px ${FONT}`; return ctx.measureText(t).width; };
    for (const N of this.L.nodes) {
      const name = String(N.d.name || N.id);
      N.nameSize = 0;
      for (const px of [15, 14, 13]) if (wOf(name, px) <= room) { N.nameSize = px; N.nameLines = [name]; break; }
      if (!N.nameSize) {
        // two lines at 12px, broken at the space that balances them best
        const words = name.split(' ');
        let best = null;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
          const m = Math.max(wOf(a, 12), wOf(b, 12));
          if (!best || m < best.m) best = { a, b, m };
        }
        if (best && best.m <= room) { N.nameSize = 12; N.nameLines = [best.a, best.b]; } else {
          let t = name;
          while (t.length > 3 && wOf(t + '..', 12) > room) t = t.slice(0, -1);
          N.nameSize = 12;
          N.nameLines = [t + '..'];
        }
      }
      // ports: prerequisites from other sections, a tag above the box
      N.tags = [];
      let x = N.x;
      for (const q of N.ext) {
        const P = this.L.byId.get(q);
        const label = '< ' + (P ? P.d.name : q);
        const w = wOf(label, 11) + 8;
        N.tags.push({ id: q, label, x, y: N.y - 15, w, h: 13 });
        x += w + 6;
      }
    }
    this.measured = true;
    this._fits = null;
  }

  // a status line that fits the box (11px world font), cached per text
  _fit(text) {
    if (!text) return '';
    const c = (this._fits ||= new Map());
    let f = c.get(text);
    if (f !== undefined) return f;
    const ctx = this.ctx;
    ctx.font = `11px ${FONT}`;
    const room = this.L.G.NW - 58;
    f = text;
    if (ctx.measureText(f).width > room) {
      while (f.length > 4 && ctx.measureText(f + '..').width > room) f = f.slice(0, -1);
      f = f.trimEnd() + '..';
    }
    c.set(text, f);
    return f;
  }

  hatch() {
    if (this._hatch) return this._hatch;
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const x = c.getContext('2d');
    x.fillStyle = COL.hatch;
    for (let i = 0; i < 8; i++) x.fillRect(i, 7 - i, 1, 1);
    this._hatch = this.ctx.createPattern(c, 'repeat');
    return this._hatch;
  }

  /**
   * @param {{x:number,y:number,z:number}} cam  screen = world * z + (x, y), css px
   * @param {object} S  state: { sel, selSec, hover, hoverTag, t, secInfo(S), job(N), fx: [] }
   */
  draw(cam, S) {
    const ctx = this.ctx, L = this.L, G = L.G;
    const D = this.dpr, z = cam.z, k = z * D;
    const ox = cam.x * D, oy = cam.y * D;
    const X = (wx) => Math.round(wx * k + ox), Y = (wy) => Math.round(wy * k + oy);
    const VW = this.cv.width, VH = this.cv.height;
    const wx0 = -cam.x / z, wy0 = -cam.y / z, wx1 = wx0 + this.w / z, wy1 = wy0 + this.h / z;
    const lw = Math.max(1, Math.round(1.5 * k)); // wire / border width in device px
    const showText = z >= 0.56;
    const showIcons = z >= 0.3;
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.imageSmoothingEnabled = false;

    // ---- section bands
    const bands = [];
    for (const Sec of L.sections) {
      if (Sec.y1 < wy0 || Sec.y0 > wy1) continue;
      bands.push(Sec);
      const y0 = Y(Sec.y0), y1 = Y(Sec.y1);
      const info = S.secInfo(Sec);
      ctx.fillStyle = Sec.i % 2 ? COL.bandB : COL.bandA;
      ctx.fillRect(0, y0, VW, y1 - y0);
      if (info.sealed) {
        const p = this.hatch();
        try { p.setTransform?.(new DOMMatrix([1, 0, 0, 1, ox % 8, oy % 8])); } catch { /* ignore */ }
        ctx.fillStyle = p;
        ctx.fillRect(0, y0, VW, y1 - y0);
      }
      ctx.fillStyle = COL.rule;
      ctx.fillRect(0, y0, VW, Math.max(1, Math.round(D)));
    }

    // ---- wires (dim first, lit on top)
    const lit = [];
    ctx.fillStyle = COL.wireOff;
    for (const E of L.edges) {
      const a = E.a, b = E.b;
      if (Math.max(a.y, b.y) + G.NH < wy0 - 20 || Math.min(a.y, b.y) > wy1 + 20) continue;
      if (a.x > wx1 || b.x + b.w < wx0) continue;
      const sa = a.st, sb = b.st;
      if (sa === 'done' && sb !== 'sealed') { lit.push(E); continue; }
      this._wire(E.pts, X, Y, lw);
    }
    for (const E of lit) {
      ctx.fillStyle = E.b.st === 'run' ? COL.wireRun : COL.wireOn;
      this._wire(E.pts, X, Y, lw);
    }

    // ---- nodes
    const pad = Math.max(1, Math.round(4 * k));
    const t = S.t || 0;
    const groups = new Map(); // font px -> [[text, x, y, color]]
    const push = (px, txt, x, y, c) => { let g = groups.get(px); if (!g) groups.set(px, (g = [])); g.push(txt, x, y, c); };
    for (const Sec of bands) {
      for (const N of Sec.nodes) {
        if (N.x > wx1 || N.x + N.w < wx0 || N.y > wy1 || N.y + N.h < wy0 - 16) continue;
        const st = N.st || 'locked';
        const pal = COL[st] || COL.locked;
        const x0 = X(N.x), y0 = Y(N.y), x1 = X(N.x + N.w), y1 = Y(N.y + N.h);
        const w = x1 - x0, h = y1 - y0;
        const sel = S.sel === N, hov = S.hover === N;
        ctx.fillStyle = pal[0];
        ctx.fillRect(x0, y0, w, h);
        const bw = st === 'avail' || st === 'run' || sel ? Math.max(1, Math.round(2 * k)) : Math.max(1, Math.round(1.25 * k));
        ctx.fillStyle = sel ? COL.sel : hov ? COL.hi : pal[1];
        ctx.fillRect(x0, y0, w, bw); ctx.fillRect(x0, y1 - bw, w, bw);
        ctx.fillRect(x0, y0, bw, h); ctx.fillRect(x1 - bw, y0, bw, h);
        if (sel) {
          // corner brackets just outside the box
          const g = Math.max(2, Math.round(5 * k)), L2 = Math.max(4, Math.round(12 * k)), th = Math.max(1, Math.round(2 * k));
          ctx.fillStyle = COL.sel;
          for (const [cx, cy, sx, sy] of [[x0 - g, y0 - g, 1, 1], [x1 + g, y0 - g, -1, 1], [x0 - g, y1 + g, 1, -1], [x1 + g, y1 + g, -1, -1]]) {
            ctx.fillRect(sx > 0 ? cx : cx - L2, sy > 0 ? cy : cy - th, L2, th);
            ctx.fillRect(sx > 0 ? cx : cx - th, sy > 0 ? cy : cy - L2, th, L2);
          }
        }
        // running: progress fill along the bottom
        if (st === 'run') {
          const j = S.job(N);
          const kk = j ? j.k : 0;
          const bh = Math.max(2, Math.round(4 * k));
          ctx.fillStyle = '#0d3a1c';
          ctx.fillRect(x0 + bw, y1 - bw - bh, w - 2 * bw, bh);
          ctx.fillStyle = COL.wireRun;
          ctx.fillRect(x0 + bw, y1 - bw - bh, Math.round((w - 2 * bw) * kk), bh);
        }
        // icon well
        if (showIcons) {
          const art = N.st === 'sealed' ? this.icons.icon('lock', 'dim') : this.icons.node(N.d, RAMP_OF[st] || 'dim');
          if (art) {
            const box = 34 * k;
            const s = Math.max(1, Math.floor(box / Math.max(art.width, art.height)));
            const iw = art.width * s, ih = art.height * s;
            const cx = x0 + Math.round(25 * k), cy = y0 + Math.round(h / 2);
            ctx.drawImage(art, Math.round(cx - iw / 2), Math.round(cy - ih / 2), iw, ih);
          }
        }
        if (showText && N.nameSize) {
          const tx = x0 + Math.round(50 * k);
          const lines = N.nameLines;
          const px = Math.round(N.nameSize * k);
          const nameC = sel || hov ? COL.hi : pal[2];
          if (lines.length === 2) {
            push(px, lines[0], tx, y0 + Math.round(15 * k), nameC);
            push(px, lines[1], tx, y0 + Math.round(27 * k), nameC);
          } else push(px, lines[0], tx, y0 + Math.round(20 * k), nameC);
          // status line
          let s = this._fit(N.line || '');
          if (st === 'run') { const j = S.job(N); s = `${SPIN[Math.floor(t * 6) % 4]} ${fmtClock(j ? j.left : 0)}`; }
          const sy = y0 + Math.round((lines.length === 2 ? 39 : 37) * k) - (st === 'run' ? Math.round(3 * k) : 0);
          push(Math.round(11 * k), s, tx, sy, st === 'zone' ? COL.amber : pal[3]);
          // state glyph, right end
          const gs = Math.max(1, Math.round(1.6 * k));
          const gy = y0 + pad;
          if (st === 'done') drawGlyph(ctx, 'check', pal[3], x1 - pad - 7 * gs, gy, gs);
          else if (st === 'locked' || st === 'sealed') drawGlyph(ctx, 'lock', pal[2], x1 - pad - 5 * gs, gy, gs);
          else if (st === 'zone') drawGlyph(ctx, 'paw', COL.amber, x1 - pad - 5 * gs, gy, gs);
          // ports (prerequisites in other sections)
          if (N.tags) {
            for (const T of N.tags) {
              const tx0 = X(T.x), ty0 = Y(T.y);
              const on = S.isDone(T.id);
              const hv = S.hoverTag === T;
              ctx.fillStyle = hv ? '#0d3a1c' : COL.bg;
              ctx.fillRect(tx0, ty0, Math.round(T.w * k), Math.round(T.h * k));
              push(Math.round(11 * k), T.label, tx0 + Math.round(4 * k), ty0 + Math.round(10 * k), hv ? COL.hi : on ? COL.done[3] : COL.locked[2]);
            }
          }
        } else if (!showText && st === 'run') {
          // nothing extra: the progress strip is drawn above
        }
      }
    }
    // text, grouped by size (one font switch per size)
    for (const [px, g] of groups) {
      if (px < 5) continue;
      ctx.font = `${px}px ${FONT}`;
      for (let i = 0; i < g.length; i += 4) { ctx.fillStyle = g[i + 3]; ctx.fillText(g[i], g[i + 1], g[i + 2]); }
    }

    // ---- section headers (on top of everything in the band)
    for (const Sec of bands) {
      const info = S.secInfo(Sec);
      const y0 = Y(Sec.y0);
      const fpx = Math.max(13 * D, Math.round(20 * k));
      ctx.font = `${fpx}px ${FONT}`;
      const num = String(Sec.i + 1).padStart(2, '0');
      const x = Math.max(X(G.PADL), Math.round(10 * D)); // the title sticks to the left edge
      const by = y0 + Math.max(Math.round(fpx * 1.05), Math.round(29 * k));
      const sel = S.selSec === Sec;
      const title = `${num} ${String(Sec.b.name || Sec.id).toUpperCase()}`;
      const tw = ctx.measureText(title).width;
      if (sel) { ctx.fillStyle = COL.head; ctx.fillRect(x - 4 * D, by - fpx + 1, tw + 8 * D, fpx + 4 * D); }
      ctx.fillStyle = sel ? COL.bg : info.sealed ? COL.headDim : COL.head;
      ctx.fillText(title, x, by);
      // counter / key
      const spx = Math.max(11 * D, Math.round(13 * k));
      ctx.font = `${spx}px ${FONT}`;
      let tx = x + tw + 14 * D;
      if (info.sealed) {
        const key = info.key || {};
        const parts = [];
        for (const n of key.needs || []) parts.push([n.ok ? 'check' : 'cross', n.text.replace(/^Research /, '').replace(/^Pay /, ''), n.ok]);
        ctx.fillStyle = key.canUnlock ? COL.amber : COL.headDim;
        const lab = key.canUnlock ? 'LOCKED - KEY READY' : 'LOCKED  KEY:';
        ctx.fillText(lab, tx, by);
        tx += ctx.measureText(lab).width + 10 * D;
        if (!key.canUnlock && z > 0.35) {
          for (const [g, txt, ok] of parts) {
            const gs = Math.max(1, Math.round(spx / 7));
            const c = ok ? COL.done[3] : COL.locked[2];
            drawGlyph(ctx, g, c, tx, by - spx * 0.7, gs);
            tx += 9 * gs;
            ctx.fillStyle = c;
            ctx.fillText(txt, tx, by);
            tx += ctx.measureText(txt).width + 12 * D;
          }
        }
      } else {
        ctx.fillStyle = COL.headDim;
        const cnt = `${info.done}/${info.total}`;
        ctx.fillText(cnt, tx, by);
        tx += ctx.measureText(cnt).width + 8 * D;
        // a little block meter
        const n = Math.min(info.total, 20), bw = Math.max(2, Math.round(5 * Math.min(1, k + 0.3))), gap = Math.max(1, Math.round(D));
        const filled = info.total ? Math.round((info.done / info.total) * n) : 0;
        for (let i = 0; i < n; i++) { ctx.fillStyle = i < filled ? COL.done[1] : COL.rule; ctx.fillRect(tx + i * (bw + gap), by - Math.round(spx * 0.62), bw, Math.round(spx * 0.62)); }
        if (info.ready) { tx += n * (bw + gap) + 10 * D; ctx.fillStyle = COL.avail[1]; ctx.fillText(`${info.ready} READY`, tx, by); }
      }
    }

    // ---- confetti / sparks (world space)
    if (S.fx && S.fx.length) {
      for (const p of S.fx) {
        const a = 1 - p.t / p.life;
        if (a <= 0) continue;
        ctx.fillStyle = p.c;
        const s = Math.max(1, Math.round((p.s || 3) * k));
        ctx.fillRect(X(p.x), Y(p.y), s, s);
      }
    }
  }

  _wire(pts, X, Y, lw) {
    const ctx = this.ctx;
    const h = lw >> 1;
    for (let i = 1; i < pts.length; i++) {
      const ax = X(pts[i - 1][0]), ay = Y(pts[i - 1][1]), bx = X(pts[i][0]), by = Y(pts[i][1]);
      if (ay === by) ctx.fillRect(Math.min(ax, bx) - h, ay - h, Math.abs(bx - ax) + lw, lw);
      else ctx.fillRect(ax - h, Math.min(ay, by) - h, lw, Math.abs(by - ay) + lw);
    }
  }
}

export function fmtClock(s) {
  if (Number(s) === Infinity) return '--:--';
  s = Math.max(0, Math.ceil(Number(s) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
