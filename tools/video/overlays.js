// Overlay bits for the gig video, all built from the game's own UI kit:
//   sign     the title screen's wooden sign on ropes (TitleMenu), with our own two lines
//   polaroid a photo on kraft paper with washi tape (paper.js), dropped onto the screen
//   tag      a kraft paper price/name tag that pops in (paper.js texture + TBME font)
//   label    a strip of washi tape with a caption, slapped onto a corner
//   stamp    a rubber stamp (paper.js stamp) slammed down
// fire(spec) adds one; update(dt) animates them (driven by the director's frame loop).
import { stamp, tape, paperTexture, injectPaperCSS } from '../../src/ui/paper.js';
import { showTitleMenu } from '../../src/ui/TitleMenu.js';

const live = [];
let ctx0 = null;
export function bind(ctx) { ctx0 = ctx; injectPaperCSS(); }
export function update(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const o = live[i];
    o.t += dt;
    try { o.tick?.(o.t, dt); } catch (e) { console.error(e); }
    if (o.life != null && o.t >= o.life) { o.el.remove(); live.splice(i, 1); }
  }
}
export function clear() { for (const o of live) o.el.remove(); live.length = 0; }
export function fire(spec) { const f = KINDS[spec.kind]; if (f) f(spec); }

const KINDS = {};
function add(el, spec, tick) {
  (spec.parent || ctx0.ui).appendChild(el);
  const o = { el, t: 0, life: spec.life, tick, spec };
  live.push(o);
  return o;
}
const ease = {
  back: (u) => { const c = 1.9; u = Math.min(1, Math.max(0, u)) - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
  out: (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3),
};
// fade the last `f` seconds of a life
const outA = (o, t, f = 0.25) => (o.life != null && t > o.life - f ? Math.max(0, (o.life - t) / f) : 1);

// ---------------------------------------------------------------- the wooden title sign
let sign = null;
KINDS.sign = (s) => {
  KINDS.unsign();
  const m = showTitleMenu(ctx0.ui, { sfx: ctx0.sfx, onStart: () => {} });
  const q = (k) => m.el.querySelector(k);
  q('.tm-l1').textContent = s.l1;
  q('.tm-l2').textContent = s.l2;
  for (const k of ['.tm-btns', '.tm-sound', '.tm-credit', '.tm-cap']) q(k)?.remove();
  m.el.querySelectorAll('button').forEach((b) => b.remove());
  m.el.style.zIndex = 66;
  const col = q('.tm-col');
  if (s.x != null) Object.assign(col.style, { left: s.x + 'px' });
  if (s.width) { col.style.width = s.width + 'px'; q('.tm-board').style.width = s.width - 12 + 'px'; }
  if (s.scale) Object.assign(col.style, { transform: `scale(${s.scale})`, transformOrigin: '50% 0' });
  sign = m;
  ctx0.sfx('paper', { volume: 0.5 });
};
KINDS.unsign = () => { if (sign) { try { sign.close(); } catch { sign.el.remove(); } sign = null; } };

// ---------------------------------------------------------------- polaroid photo
KINDS.polaroid = (s) => {
  const w = s.w || 380, h = s.h || 250;
  const el = document.createElement('div');
  const paper = paperTexture('kraft', w + 28, h + 74, { seed: s.seed || 5, edge: 2 });
  el.innerHTML = `<div style="position:relative;width:${w + 28}px;height:${h + 74}px;background:#f3e7cf url(${paper}) 0 0/100% 100%;image-rendering:pixelated;border:3px solid #3b2414;box-shadow:6px 9px 0 rgba(30,10,20,.45);box-sizing:border-box">
    <div style="position:absolute;left:11px;top:11px;width:${w}px;height:${h}px;background:#222 url(${s.src}) ${s.pos || '50% 50%'}/${s.size || 'cover'} no-repeat;border:3px solid #3b2414;box-sizing:border-box"></div>
    <div class="txt" style="position:absolute;left:0;right:0;bottom:12px;text-align:center;font-family:'TBME Title';font-size:31.25px;color:#3b2414;line-height:1">${s.caption || ''}</div>
    <div style="position:absolute;left:50%;top:-22px;transform:translateX(-50%)">${tape(s.tape || 'pink', s.rot ? -s.rot : 3)}</div>
  </div>`;
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: 62, transformOrigin: '50% 0' });
  ctx0.sfx('paper', { volume: 0.5 });
  add(el, s, (t) => {
    const u = ease.back(t / 0.5), drop = (1 - ease.out(t / 0.45)) * -520 * (s.from === 'below' ? -1 : 1);
    el.style.transform = `translate(-50%, ${drop}px) rotate(${(s.rot || 0) + (1 - u) * 14}deg) scale(${0.85 + 0.15 * u})`;
    el.style.opacity = String(outA(live.find((o) => o.el === el), t));
  });
};

// ---------------------------------------------------------------- kraft paper tag (prices, names)
KINDS.tag = (s) => {
  const el = document.createElement('div');
  const w = s.w || 200, h = s.h || 92;
  const kraft = paperTexture('kraft', w, h, { seed: s.seed || 9, edge: 1 });
  el.innerHTML = `<div style="position:relative;width:${w}px;height:${h}px;background:#c8955a url(${kraft}) 0 0/100% 100%;image-rendering:pixelated;border:3px solid #3b2414;box-shadow:0 6px 0 #3b2414,6px 12px 0 rgba(40,14,30,.35);box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'TBME Title';line-height:1">
    <i style="position:absolute;left:12px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:#3b2414;box-shadow:0 0 0 3px #e8c48a"></i>
    <b style="font-weight:normal;font-size:${s.big || 52}px;color:${s.color || '#ffd05a'};text-shadow:0 -3px 0 #3b1a0c,3px 0 0 #3b1a0c,-3px 0 0 #3b1a0c,0 3px 0 #3b1a0c,3px 3px 0 #3b1a0c,-3px 3px 0 #3b1a0c,0 6px 0 #3b1a0c">${s.text}</b>
    ${s.sub ? `<span style="font-size:20.83px;color:#3b2414;margin-top:6px">${s.sub}</span>` : ''}
  </div>`;
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: 64 });
  ctx0.sfx(s.sound || 'pop_in', { volume: 0.55, pitch: s.pitch || 1 });
  const o = add(el, s, (t) => {
    const u = ease.back(t / 0.38);
    const sway = Math.sin(t * 2.4 + (s.seed || 0)) * 3;
    el.style.transform = `translate(-50%,-50%) scale(${u}) rotate(${(s.rot || 0) + sway * Math.min(1, t)}deg)`;
    el.style.opacity = String(outA(o, t));
  });
};

// ---------------------------------------------------------------- washi tape label
KINDS.label = (s) => {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:relative;padding:10px 22px 12px;background:${s.bg || '#fff6e0'};border:3px solid #3b2414;box-shadow:5px 7px 0 rgba(30,10,20,.45);font-family:'TBME Title';font-size:${s.size || 31.25}px;line-height:1;color:#3b2414;white-space:nowrap">
    ${s.text}${s.sub ? `<div style="font-size:20.83px;margin-top:6px;color:#7a4a26">${s.sub}</div>` : ''}
    <div style="position:absolute;left:-26px;top:-16px">${tape(s.tape || 'yellow', -24)}</div>
  </div>`;
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: 63 });
  ctx0.sfx('paper', { volume: 0.45 });
  const o = add(el, s, (t) => {
    const u = ease.back(t / 0.42);
    el.style.transform = `translateX(${(1 - u) * -60}px) rotate(${(s.rot ?? -3) + (1 - u) * -8}deg)`;
    el.style.opacity = String(Math.min(1, t / 0.12) * outA(o, t));
  });
};

// ---------------------------------------------------------------- rubber stamp
KINDS.stamp = (s) => {
  const el = document.createElement('div');
  el.innerHTML = stamp(s.text, s.color || '#c0392b', s.rot ?? -8);
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: 65, fontSize: (s.size || 40) + 'px' });
  ctx0.sfx('stamp', { volume: 0.6 });
  const o = add(el, s, (t) => {
    const k = Math.min(1, t / 0.16);
    const sc = t < 0.16 ? 2.4 - 1.4 * k * k : 1 + Math.sin(Math.min(1, (t - 0.16) / 0.22) * Math.PI) * 0.07;
    el.style.transform = `translate(-50%,-50%) scale(${sc * (s.scale || 1)})`;
    el.style.opacity = String(outA(o, t));
  });
};
