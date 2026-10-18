// Title cards, flashes, fades and letterbox bars for the video director, drawn as
// DOM over the game canvas (the screenshot catches them). Everything is a pure
// function of the shot clock t, so slow frames never change the timing.
//
//   const ov = new Overlay(rootEl);
//   ov.card(['BREED', 'FISH'], { t0: 1, t1: 3, x: 0.5, y: 0.2, size: 104.17, anim: 'slam' });
//   ov.flash(2.0, 0.25, '#fff'); ov.fade(0, 0.6, 1, 0); ov.bars(0, 9, 0.11);
//   ov.update(t);
export const FILL_GOLD = 'linear-gradient(180deg, #fff9c4 0%, #ffe14a 30%, #ffb52e 62%, #ff7a1e 100%)';
export const FILL_HOT = 'linear-gradient(180deg, #ffffff 0%, #fff2a0 22%, #ffc030 50%, #ff7a1a 78%, #e8401a 100%)';
export const FILL_ICE = 'linear-gradient(180deg, #ffffff 0%, #d8f4ff 40%, #7cc8ff 100%)';
export const FILL_WHITE = 'linear-gradient(180deg, #ffffff, #ffe9c0)';
export const FILL_PINK = 'linear-gradient(180deg, #ffffff 0%, #ffd0e0 35%, #ff6a9a 100%)';
export const FILL_GREEN = 'linear-gradient(180deg, #ffffff 0%, #d8ffb0 35%, #5ad85a 100%)';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutBack = (x, s = 1.9) => { x = clamp(x, 0, 1) - 1; return 1 + x * x * ((s + 1) * x + s); };
const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
const easeIn = (x) => clamp(x, 0, 1) ** 3;

function el(tag, css = {}, parent = null, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e.style, css);
  if (parent) parent.appendChild(e);
  return e;
}
// text-shadow ring: every whole-px offset within radius r (chunky pixel outline)
export function ring(r, color, dx = 0, dy = 0) {
  const out = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) out.push(`${x + dx}px ${y + dy}px 0 ${color}`);
  return out.join(',');
}
// layered chunky title text (drop shadow, outer outline, inner outline, gradient fill)
export function bigText(parent, lines, o) {
  const box = el('div', { fontFamily: "'TBME Title', sans-serif", whiteSpace: 'nowrap', lineHeight: '1', fontSize: o.size + 'px', textAlign: o.align || 'center', position: 'relative' }, parent);
  lines.forEach((t, i) => {
    const L = el('div', { position: 'relative', display: 'block', fontSize: (o.sizes?.[i] || o.size) + 'px', marginTop: i ? (o.gap ?? 0) + 'px' : 0, letterSpacing: (o.track ?? 0) + 'px' }, box);
    const R1 = o.outline ?? 4, R2 = R1 + (o.outer || 0);
    const span = (css) => { const s = el('span', { position: 'absolute', left: 0, top: 0, width: '100%', ...css }, L); s.textContent = t; return s; };
    if (o.shadow) span({ color: o.shadow.color, textShadow: ring(R2, o.shadow.color, o.shadow.x, o.shadow.y) + (o.shadow.glow ? ',' + o.shadow.glow : ''), transform: `translate(${o.shadow.x}px, ${o.shadow.y}px)` });
    if (o.outer) span({ color: o.outerColor, textShadow: ring(R2, o.outerColor) });
    span({ color: o.outlineColor || '#2a0f1e', textShadow: ring(R1, o.outlineColor || '#2a0f1e') });
    const f = el('span', { position: 'relative', backgroundImage: o.fill || FILL_GOLD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }, L);
    f.textContent = t;
  });
  return box;
}
// the pink tagline ribbon from the itch art
export function ribbon(parent, text, size = 31.25, o = {}) {
  const tag = el('div', { display: 'inline-block', padding: `${size * 0.22}px ${size * 0.58}px ${size * 0.29}px`, background: o.bg || 'linear-gradient(180deg, #ff4d6d, #d0204a)', border: `${Math.max(2, Math.round(size / 10))}px solid #2a0f1e`, borderRadius: size * 0.32 + 'px', boxShadow: `0 0 0 ${Math.max(2, Math.round(size / 10))}px #fff6e0, 0 ${Math.round(size / 5)}px 0 ${Math.max(2, Math.round(size / 10))}px rgba(40,8,40,.7)` }, parent);
  bigText(tag, [text], { size, outline: Math.max(2, Math.round(size / 10)), outlineColor: '#2a0f1e', fill: o.fill || FILL_WHITE });
  return tag;
}

export class Overlay {
  constructor(root) {
    this.root = root;
    this.items = [];
    this.W = root?.clientWidth || window.innerWidth;
    this.H = root?.clientHeight || window.innerHeight;
  }

  // positioned wrapper at (x, y) in 0..1 screen units, centred on its anchor
  _wrap(o) {
    const w = el('div', { position: 'absolute', left: (o.x ?? 0.5) * 100 + '%', top: (o.y ?? 0.5) * 100 + '%', transform: 'translate(-50%,-50%)', opacity: 0, willChange: 'transform, opacity' }, this.root);
    const inner = el('div', { transformOrigin: '50% 50%' }, w);
    return { w, inner };
  }

  // big title text. anim: 'pop' | 'slam' | 'rise' | 'fade' | 'stamp'
  card(lines, o) {
    const { w, inner } = this._wrap(o);
    const box = bigText(inner, Array.isArray(lines) ? lines : [lines], {
      size: o.size ?? 83.33, sizes: o.sizes, gap: o.gap ?? -6, outline: o.outline ?? 5, outlineColor: o.outlineColor ?? '#3a1408',
      outer: o.outer ?? 4, outerColor: o.outerColor ?? '#fff6e0', fill: o.fill ?? FILL_GOLD, align: o.align,
      shadow: o.shadow === false ? null : (o.shadow || { x: 0, y: Math.round((o.size ?? 83) / 12), color: 'rgba(40,8,40,.75)', glow: '0 0 22px rgba(255,140,60,.55)' }),
    });
    if (o.ribbon) { const r = el('div', { marginTop: (o.ribbonGap ?? 14) + 'px', textAlign: 'center' }, inner); ribbon(r, o.ribbon, o.ribbonSize ?? 31.25, o.ribbonStyle || {}); }
    if (o.sub) { const s = el('div', { marginTop: (o.subGap ?? 10) + 'px', textAlign: 'center' }, inner); bigText(s, [o.sub], { size: o.subSize ?? 31.25, outline: 3, outlineColor: '#2a0f1e', fill: o.subFill || FILL_WHITE, shadow: { x: 0, y: 3, color: 'rgba(30,8,30,.6)' } }); }
    const it = { kind: 'card', w, inner, box, o };
    this.items.push(it);
    return it;
  }

  // small plain text line (credits / captions)
  text(str, o) {
    const { w, inner } = this._wrap(o);
    const d = el('div', { fontFamily: "'TBME Title', sans-serif", fontSize: (o.size ?? 20.83) + 'px', color: o.color || '#fff6e0', whiteSpace: 'pre', textAlign: o.align || 'center', lineHeight: o.lh || '1.25', textShadow: o.outline === false ? 'none' : ring(o.outline ?? 2, o.outlineColor || '#1a0c18') }, inner);
    d.textContent = str;
    const it = { kind: 'card', w, inner, box: d, o: { anim: 'fade', ...o } };
    this.items.push(it);
    return it;
  }

  // any element (already built) on the overlay, faded/popped like a card
  node(node, o) {
    const { w, inner } = this._wrap(o);
    inner.appendChild(node);
    const it = { kind: 'card', w, inner, box: node, o };
    this.items.push(it);
    return it;
  }

  flash(t0, dur = 0.3, color = '#fff', peak = 1) {
    const d = el('div', { position: 'absolute', inset: '0', background: color, opacity: 0 }, this.root);
    this.items.push({ kind: 'flash', d, t0, dur, peak });
  }

  // full-screen colour from opacity a to b over [t0, t1]
  fade(t0, t1, a, b, color = '#000') {
    const d = el('div', { position: 'absolute', inset: '0', background: color, opacity: 0 }, this.root);
    this.items.push({ kind: 'fade', d, t0, t1, a, b });
  }

  // letterbox bars, h = fraction of the screen height each
  bars(t0, t1, h = 0.1, inDur = 0.6) {
    const top = el('div', { position: 'absolute', left: 0, right: 0, top: 0, height: h * 100 + '%', background: '#000', transform: 'translateY(-100%)' }, this.root);
    const bot = el('div', { position: 'absolute', left: 0, right: 0, bottom: 0, height: h * 100 + '%', background: '#000', transform: 'translateY(100%)' }, this.root);
    this.items.push({ kind: 'bars', top, bot, t0, t1, inDur });
  }

  // a custom per-frame function (t) => void
  fn(f) { this.items.push({ kind: 'fn', f }); }

  update(t) {
    for (const it of this.items) {
      if (it.kind === 'flash') {
        const u = (t - it.t0) / it.dur;
        it.d.style.opacity = u < 0 || u > 1 ? 0 : (it.peak * (1 - u) ** 2).toFixed(3);
      } else if (it.kind === 'fade') {
        const u = clamp((t - it.t0) / Math.max(1e-6, it.t1 - it.t0), 0, 1);
        it.d.style.opacity = (t < it.t0 ? it.a : it.a + (it.b - it.a) * u).toFixed(3);
      } else if (it.kind === 'bars') {
        const k = t < it.t0 ? 0 : t < it.t0 + it.inDur ? easeOut((t - it.t0) / it.inDur) : t < it.t1 ? 1 : 1 - easeIn((t - it.t1) / it.inDur);
        it.top.style.transform = `translateY(${(-100 * (1 - k)).toFixed(2)}%)`;
        it.bot.style.transform = `translateY(${(100 * (1 - k)).toFixed(2)}%)`;
      } else if (it.kind === 'fn') it.f(t);
      else this._card(it, t);
    }
  }

  _card(it, t) {
    const o = it.o, t0 = o.t0 ?? 0, t1 = o.t1 ?? 1e9;
    const inD = o.inDur ?? (o.anim === 'fade' ? 0.4 : 0.32), outD = o.outDur ?? 0.22;
    if (t < t0 || t > t1 + outD) { it.w.style.opacity = 0; return; }
    const a = (t - t0) / inD, b = (t - t1) / outD;
    let s = 1, op = 1, rot = o.rot ?? 0, dx = 0, dy = 0, sx = 1, sy = 1;
    const anim = o.anim || 'pop';
    if (anim === 'pop') { s = 0.2 + 0.8 * easeOutBack(a, 2.4); op = clamp(a * 3, 0, 1); }
    else if (anim === 'slam') { s = a < 1 ? 2.6 - 1.6 * easeOut(a) : 1; op = clamp(a * 2.5, 0, 1); if (a >= 1 && a < 2.2) { const k = (2.2 - a) / 1.2; dx = Math.sin(t * 90) * 7 * k; dy = Math.cos(t * 77) * 5 * k; } }
    else if (anim === 'rise') { dy = (1 - easeOut(a)) * 40; op = clamp(a, 0, 1); }
    else if (anim === 'fade') { op = clamp(a, 0, 1); }
    else if (anim === 'stamp') { s = a < 1 ? 1.5 - 0.5 * easeOut(a) : 1; op = clamp(a * 4, 0, 1); rot += (1 - clamp(a, 0, 1)) * -8; }
    else if (anim === 'squash') {
      // pops in from a flat smear, overshoots tall, wobbles to rest (damped spring on the aspect)
      const u = Math.max(0, t - t0), k = 9, w = 26;
      s = u < 0.06 ? 0.35 + (u / 0.06) * 0.75 : 1 + 0.1 * Math.exp(-k * (u - 0.06)) * Math.cos(w * (u - 0.06));
      const q = Math.exp(-k * u) * Math.cos(w * u + 0.3);
      sx = 1 + 0.45 * q; sy = 1 - 0.38 * q;
      op = clamp(u / 0.04, 0, 1);
    }
    if (o.wobble) { rot += Math.sin(t * 5.2) * o.wobble; s *= 1 + Math.abs(Math.sin(t * 5.2)) * 0.015 * o.wobble; }
    if (o.drift) { dy += (t - t0) * (o.drift[1] || 0); dx += (t - t0) * (o.drift[0] || 0); s *= 1 + (t - t0) * (o.zoom || 0); }
    if (b > 0) {
      const ob = o.outAnim || (anim === 'fade' || anim === 'rise' ? 'fade' : 'shrink');
      if (ob === 'fade') op *= 1 - clamp(b, 0, 1);
      else if (ob === 'shrink') { s *= 1 - easeIn(b) * 0.85; op *= 1 - clamp(b * 1.2 - 0.2, 0, 1); }
      else if (ob === 'up') { dy -= easeIn(b) * 600; }
      else if (ob === 'squash') { sx *= 1 + easeIn(b) * 0.6; sy *= 1 - easeIn(b) * 0.95; op *= 1 - clamp(b * 1.3 - 0.3, 0, 1); }
      else if (ob === 'cut') { op = 0; }
    }
    it.w.style.opacity = op.toFixed(3);
    it.inner.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${(s * sx).toFixed(4)}, ${(s * sy).toFixed(4)})`;
  }
}
