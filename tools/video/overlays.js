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

// ---------------------------------------------------------------- hand-drawn pixel art cards (pixart.js)
import { SCENES as PIX, painter } from './pixart.js';
const SH = (r, c) => { const o = []; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if ((x || y) && Math.abs(x) + Math.abs(y) <= r + 1) o.push(`${x}px ${y}px 0 ${c}`); return o.join(','); };
const TXT = (size, color, out = 3) => `font-family:'TBME Title';font-size:${size}px;line-height:1;color:${color};text-shadow:${SH(out, '#2a1408')},0 ${out + 3}px 0 rgba(40,8,40,.55)`;
function pixCanvas(name, cssW) {
  const S = PIX[name], cv = document.createElement('canvas');
  cv.width = S.w; cv.height = S.h;
  Object.assign(cv.style, { width: cssW + 'px', height: Math.round((cssW * S.h) / S.w) + 'px', imageRendering: 'pixelated', display: 'block' });
  const g = cv.getContext('2d', { willReadFrequently: true }), P = painter(g);
  return { cv, draw: (t) => { g.clearRect(0, 0, S.w, S.h); S.draw(P, t); } };
}
const kraftCard = (w, h, seed) => `background:#c8955a url(${paperTexture('kraft', w, h, { seed, edge: 1 })}) 0 0/100% 100%;image-rendering:pixelated;border:4px solid #2a0f1e;border-radius:6px;box-shadow:0 0 0 4px #fff6e0,0 10px 0 4px rgba(40,8,40,.6);box-sizing:border-box`;

// { scene, x, y, w (css px of the art), title, sub, labels:[{text,x,y,at}], life }
KINDS.pix = (s) => {
  const el = document.createElement('div');
  const art = pixCanvas(s.scene, s.w || 300);
  const pad = 12;
  el.innerHTML = `<div class="pc" style="${kraftCard((s.w || 300) + pad * 2, 100, s.seed || 3)};padding:${pad}px;display:flex;flex-direction:column;align-items:center;gap:10px"></div>`;
  const card = el.firstChild;
  const frame = document.createElement('div');
  Object.assign(frame.style, { position: 'relative', border: '4px solid #2a0f1e', lineHeight: 0 });
  frame.appendChild(art.cv);
  card.appendChild(frame);
  if (s.title) card.insertAdjacentHTML('beforeend', `<div style="${TXT(s.tsize || 31.25, s.tcolor || '#fff6e0')};text-align:center;white-space:nowrap">${s.title}${s.sub ? `<div style="font-size:20.83px;color:#3b2414;text-shadow:none;margin-top:6px">${s.sub}</div>` : ''}</div>`);
  const labels = (s.labels || []).map((L) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:${L.x}%;top:${L.y}%;transform:translate(-50%,-50%) scale(0);${TXT(L.size || 26, L.color || '#fff6e0', 3)};white-space:nowrap`; d.textContent = L.text; frame.appendChild(d); return { d, L, shown: false }; });
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: s.z || 64 });
  if (s.sound !== false) ctx0.sfx(s.sound || 'pop_in', { volume: 0.6, pitch: s.pitch || 1 });
  const o = add(el, s, (t) => {
    art.draw(t);
    const u = ease.back(t / 0.45);
    el.style.transform = `translate(-50%,-50%) scale(${(s.scale || 1) * (0.2 + 0.8 * u)}) rotate(${(s.rot || 0) * u + (1 - u) * -10}deg)`;
    el.style.opacity = String(Math.min(1, t / 0.1) * outA(o, t));
    for (const l of labels) if (t >= (l.L.at || 0)) {
      if (!l.shown) { l.shown = true; if (l.L.sound) ctx0.sfx(l.L.sound, { volume: 0.5 }); }
      l.d.style.transform = `translate(-50%,-50%) scale(${ease.back((t - (l.L.at || 0)) / 0.35)}) rotate(${l.L.rot || 0}deg)`;
    }
    // timed sounds inside the scene
    for (const e of s.sfxAt || []) if (!e.done && t >= e.t) { e.done = true; ctx0.sfx(e.name, { volume: e.v ?? 0.5, pitch: e.p || 1 }); }
  });
};

// big outlined title text that bounces in
KINDS.title = (s) => {
  const el = document.createElement('div');
  el.innerHTML = `<div style="${TXT(s.size || 72, s.color || '#ffd05a', s.out || 5)};white-space:nowrap;text-align:center">${s.text}${s.sub ? `<div style="${TXT(s.subSize || 29, '#fff6e0', 3)};margin-top:8px">${s.sub}</div>` : ''}</div>`;
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: s.z || 66 });
  if (s.sound !== false) ctx0.sfx(s.sound || 'whoosh', { volume: 0.5 });
  const o = add(el, s, (t) => {
    const u = ease.back(t / 0.4);
    el.style.transform = `translate(-50%,-50%) scale(${u}) rotate(${(s.rot ?? -2) + Math.sin(t * 2.2) * 1.2}deg) translateY(${-Math.abs(Math.sin(t * 2.6)) * 4}px)`;
    el.style.opacity = String(outA(o, t));
  });
};

// rotating light rays + darkening behind a section
KINDS.rays = (s) => {
  const el = document.createElement('div');
  const a = s.color || 'rgba(255,220,140,.22)', stops = [];
  for (let i = 0; i < 24; i++) stops.push(`${a} ${i * 15}deg ${i * 15 + 7.5}deg`, `rgba(0,0,0,0) ${i * 15 + 7.5}deg ${(i + 1) * 15}deg`);
  el.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%, ${s.mid || 'rgba(70,30,60,.55)'}, ${s.edge || 'rgba(18,8,24,.92)'})"></div><div class="r" style="position:absolute;left:50%;top:55%;width:2400px;height:2400px;margin:-1200px 0 0 -1200px;background:conic-gradient(${stops.join(',')});border-radius:50%"></div>`;
  Object.assign(el.style, { position: 'absolute', inset: 0, zIndex: s.z || 55, overflow: 'hidden' });
  const r = el.querySelector('.r');
  const o = add(el, s, (t) => { r.style.transform = `rotate(${t * 9}deg)`; el.style.opacity = String(Math.min(1, t / 0.35) * outA(o, t, 0.35)); });
};

// a price tier card: pixel portrait, price, blurb and features ticking in
KINDS.tier = (s) => {
  const W = s.w || 384;
  const el = document.createElement('div');
  const art = pixCanvas(s.scene, 168);
  el.innerHTML = `<div style="${kraftCard(W, 560, s.seed || 5)};width:${W}px;padding:0 0 14px;position:relative">
    <div style="height:54px;background:linear-gradient(180deg,${s.color},${s.dark});border-bottom:4px solid #2a0f1e;border-radius:2px 2px 0 0;display:flex;align-items:center;justify-content:space-between;padding:0 16px">
      <span style="${TXT(41.67, '#fff6e0', 3)}">${s.name}</span><span style="${TXT(20.83, '#fff6e0', 2)}">${s.level}</span></div>
    <div class="row" style="display:flex;align-items:center;gap:12px;padding:12px 14px 0">
      <div class="pt" style="border:4px solid #2a0f1e;line-height:0;flex:none"></div>
      <div><div class="pr" style="${TXT(70, '#ffd05a', 4)}">${s.price}</div><div style="font-family:'TBME Title';font-size:20.83px;color:#3b2414;margin-top:12px">${s.days}</div></div>
    </div>
    <div style="font-family:'TBME Title';font-size:20.83px;line-height:1.15;color:#4a2a18;padding:10px 16px 6px">${s.desc}</div>
    <div class="ft" style="padding:0 16px"></div></div>`;
  el.querySelector('.pt').appendChild(art.cv);
  const ft = el.querySelector('.ft');
  const feats = s.feats.map((f) => {
    const d = document.createElement('div');
    d.style.cssText = "display:flex;align-items:center;gap:10px;font-family:'TBME Title';font-size:24px;color:#2a1408;margin-top:6px;opacity:0";
    d.innerHTML = `<i style="width:22px;height:22px;flex:none;background:#4cc05a;border:3px solid #2a0f1e;border-radius:5px;box-sizing:border-box;color:#fff;font-style:normal;font-size:19px;line-height:15px;text-align:center">✓</i>${f}`;
    ft.appendChild(d);
    return { d, shown: false };
  });
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: 64 });
  ctx0.sfx('whoosh', { volume: 0.45 });
  const o = add(el, s, (t) => {
    art.draw(t);
    const u = ease.out(t / 0.5);
    el.style.transform = `translate(-50%,-50%) translateY(${(1 - u) * 700}px) rotate(${(s.rot || 0) + (1 - u) * 8}deg)`;
    el.style.opacity = String(outA(o, t));
    feats.forEach((f, k) => {
      const at = (s.featAt ?? 0.8) + k * (s.featGap ?? 0.32);
      if (t >= at && !f.shown) { f.shown = true; ctx0.sfx('pop_in', { volume: 0.35, pitch: 1 + k * 0.08 }); }
      if (f.shown) { const v = ease.back((t - at) / 0.3); f.d.style.opacity = String(Math.min(1, (t - at) / 0.1)); f.d.style.transform = `translateX(${(1 - v) * -30}px)`; }
    });
    if (s.stampAt != null && t >= s.stampAt && !s._st) { s._st = true; ctx0.sfx('stamp', { volume: 0.6 }); el.firstChild.insertAdjacentHTML('beforeend', `<div class="stp" style="position:absolute;right:-18px;top:62px;transform:rotate(12deg) scale(2);opacity:0;padding:6px 12px;border:4px solid ${s.stampColor || '#c0392b'};color:${s.stampColor || '#c0392b'};font-family:'TBME Title';font-size:24px;background:rgba(255,246,224,.85)">${s.stamp}</div>`); }
    const stp = el.querySelector('.stp');
    if (stp) { const k = Math.min(1, (t - s.stampAt) / 0.18); stp.style.opacity = '1'; stp.style.transform = `rotate(12deg) scale(${2 - k})`; }
  });
};

// extras: rows of [portrait scene, label, sub, price]
KINDS.rows = (s) => {
  const W = s.w || 560;
  const el = document.createElement('div');
  el.innerHTML = `<div style="${kraftCard(W, 400, s.seed || 7)};width:${W}px;padding-bottom:12px">
    <div style="height:58px;background:linear-gradient(180deg,${s.color},${s.dark});border-bottom:4px solid #2a0f1e;display:flex;align-items:center;justify-content:space-between;padding:0 18px">
      <span style="${TXT(41.67, '#fff6e0', 3)}">${s.title}</span><span style="${TXT(20.83, '#fff6e0', 2)}">${s.tag || ''}</span></div>
    <div class="rs"></div></div>`;
  const rs = el.querySelector('.rs');
  const rows = s.rows.map((r) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:14px;padding:10px 18px 0;opacity:0';
    const a = pixCanvas(r.scene, 84);
    const box = document.createElement('div'); box.style.cssText = 'border:3px solid #2a0f1e;line-height:0;flex:none'; box.appendChild(a.cv);
    d.appendChild(box);
    d.insertAdjacentHTML('beforeend', `<div style="flex:1"><div style="${TXT(33, '#fff6e0', 3)}">${r.label}</div><div style="font-family:'TBME Title';font-size:22px;color:#3b2414;margin-top:8px">${r.sub}</div></div><div style="${TXT(58, '#ffd05a', 4)}">${r.price}</div>`);
    rs.appendChild(d);
    return { d, a, shown: false };
  });
  Object.assign(el.style, { position: 'absolute', left: s.x + 'px', top: s.y + 'px', zIndex: 64 });
  ctx0.sfx('paper', { volume: 0.5 });
  const o = add(el, s, (t) => {
    const u = ease.back(t / 0.45);
    el.style.transform = `translate(-50%,-50%) scale(${0.3 + 0.7 * u}) rotate(${(s.rot || 0)}deg)`;
    el.style.opacity = String(Math.min(1, t / 0.12) * outA(o, t));
    rows.forEach((r, k) => {
      r.a.draw(t);
      const at = 0.5 + k * 0.45;
      if (t >= at && !r.shown) { r.shown = true; ctx0.sfx(s.rowSound || 'coin', { volume: 0.45, pitch: 1 + k * 0.1 }); }
      if (r.shown) { const v = ease.back((t - at) / 0.32); r.d.style.opacity = '1'; r.d.style.transform = `scale(${0.6 + 0.4 * v})`; }
    });
  });
};
