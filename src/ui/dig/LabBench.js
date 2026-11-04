// [v32 dig] Professor Snapp's lab bench: the panel behind his card, his hut and the
// prep bench in his yard.
//   BENCH       pick a crusted specimen from the crate, scrub the crust off under the
//               lamp (hold and drag), Snapp identifies it (name, age, a grumpy fact,
//               condition stamp), then DISPLAY it, SELL it or KEEP it (vial reagent).
//   COLLECTION  every find (silhouettes for the ones still in the ground), how many you
//               keep, which are on display in his glass case (9 slots). Tap to show / take down.
//   VIAL        1 amber + 3 cleaned fossils -> a Primordial Vial (after the research).
//
//   openLabBench(sys, { tab })  sys = game.digsite (src/game/ext/digsite.js)
import { FIND_BY_ID, FINDS, RARITY_COLORS, RARITY_NAMES, CONDITIONS, findValue, GROUP_NAMES } from '../../data/digFinds.js';
import { SNAPP } from '../../data/digDialogue.js';
import { findPix, crustPix, findURL, silhouettePix, pixURL } from './findArt.js';
import { spriteImg, hasSprite } from '../sprites.js';
import { injectDigCSS } from './digCss.js';

const NT = import.meta.glob('../NpcTalk3D.js', { eager: true })['../NpcTalk3D.js'] || {};
const BW = 112, BH = 76;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s, 'lb-ico') : '');
const hsh = (x, y, s = 0) => { let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

let current = null;
export function openLabBench(sys, opts = {}) {
  current?.close?.();
  current = new LabBench(sys, opts);
  return current;
}
export const labBenchOpen = () => !!current;

class LabBench {
  constructor(sys, { tab = 'bench' } = {}) {
    injectDigCSS();
    this.sys = sys;
    this.game = sys.game;
    this.tab = tab;
    this.sel = null; // uid on the bench
    this.state = 'idle'; // idle | cleaning | done
    const el = (this.el = document.createElement('div'));
    el.className = 'lb-wrap';
    el.innerHTML = `<div class="lb-box">
      <div class="lb-top"><div class="lb-face"></div><h2>Snapp's Lab Bench</h2><div class="lb-tabs"></div><button class="lb-x">✕</button></div>
      <div class="lb-body"></div></div>`;
    (this.game.ui?.root || document.body).appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation());
    el.querySelector('.lb-x').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    this.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } };
    window.addEventListener('keydown', this.onKey, true);
    // a live 3D Snapp in the corner (the neighbours' portrait renderer)
    try { const f = el.querySelector('.lb-face'); f.style.cssText = 'position:relative;overflow:hidden;width:64px;height:64px;flex:none;border:3px solid #2a1a14;background:#c8a46a'; this.face = NT.createNpcTalk?.(f, { npc: 'snapp', frame: 'bust', ps: 2 }) || null; } catch { this.face = null; }
    this.wasPaused = this.game.state.paused;
    this.game.state.paused = true;
    this.game.audio?.play?.('open', { volume: 0.35 });
    this.render();
    this.raf = requestAnimationFrame((t) => this.loop(t));
    this.last = performance.now();
  }
  get S() { return this.sys.S; }
  talk(text) {
    const s = this.el.querySelector('.lb-say');
    if (s) s.textContent = text;
    try { this.face?.talk?.(text); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ views
  render() {
    const tabs = [['bench', 'Bench'], ['collection', 'Collection'], ...(this.sys.has('r_dig_vial') ? [['vial', 'Vial']] : [])];
    const T = this.el.querySelector('.lb-tabs');
    T.innerHTML = tabs.map(([id, n]) => `<button class="lb-tab${id === this.tab ? ' on' : ''}" data-t="${id}">${n}</button>`).join('');
    T.querySelectorAll('.lb-tab').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.t; this.game.audio?.play?.('page', { volume: 0.35 }); this.render(); }));
    const B = this.el.querySelector('.lb-body');
    if (this.tab === 'collection') this.renderCollection(B);
    else if (this.tab === 'vial') this.renderVial(B);
    else this.renderBench(B);
  }

  renderBench(B) {
    const crate = this.sys.crate();
    if (this.sel && !crate.some((it) => it.uid === this.sel) && this.state !== 'done') this.sel = null;
    if (!this.sel && crate.length && this.state !== 'done') this.sel = crate[0].uid;
    const specs = crate.map((it) => {
      const F = FIND_BY_ID[it.id];
      return `<div class="lb-spec${it.uid === this.sel ? ' on' : ''}" data-u="${it.uid}"><img src="${pixURL(crustPix(it.id, it.uid % 97, 1), 2)}" width="36" height="36" alt=""><span><i style="background:${RARITY_COLORS[F.r]}"></i>${esc(it.from || 'Dig site')}</span></div>`;
    }).join('') || '<div class="lb-empty">Empty. Go dig! Tap a flagged mound at a dig site.</div>';
    B.innerHTML = `
      <div class="lb-crate"><h3>The crate (${crate.length})</h3>${specs}</div>
      <div class="lb-mid">
        <div class="lb-say">${esc(crate.length ? pick(SNAPP.bench) : 'Nothing to clean. Bring me rocks. Interesting ones.')}</div>
        <canvas class="lb-cv" width="${BW}" height="${BH}"></canvas>
        <div class="lb-under"></div>
      </div>`;
    B.querySelectorAll('.lb-spec').forEach((d) => d.addEventListener('click', () => { if (this.state === 'cleaning' && this.prog > 0.05) return; this.sel = +d.dataset.u; this.state = 'idle'; this.game.audio?.play?.('click', { volume: 0.3 }); this.render(); }));
    this.cv = B.querySelector('.lb-cv');
    const s = Math.max(2, Math.min(5, Math.floor(Math.min((innerWidth * 0.96 - 220) / BW, (innerHeight * 0.9 - 260) / BH))));
    this.cv.style.width = BW * s + 'px'; this.cv.style.height = BH * s + 'px';
    this.ctx = this.cv.getContext('2d');
    this.img = this.ctx.createImageData(BW, BH);
    this.setupSpecimen();
    const P = (e) => { const r = this.cv.getBoundingClientRect(); this.px = ((e.clientX - r.left) / r.width) * BW; this.py = ((e.clientY - r.top) / r.height) * BH; };
    this.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { this.cv.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ } P(e); this.down = true; });
    this.cv.addEventListener('pointermove', (e) => { P(e); this.moved = (this.moved || 0) + 1; });
    this.cv.addEventListener('pointerup', () => { this.down = false; });
    this.cv.addEventListener('pointerleave', () => { this.px = -99; });
    this.under();
  }
  setupSpecimen() {
    const it = this.sel != null ? this.sys.item(this.sel) : null;
    this.it = it;
    this.parts = [];
    if (!it) { this.fp = null; return; }
    const s = 2;
    this.fp = findPix(it.id, s);
    this.cp = crustPix(it.id, it.uid % 97, s);
    this.ox = Math.floor((BW - this.fp.w) / 2); this.oy = Math.floor((BH - this.fp.h) / 2) + 2;
    const n = this.cp.w * this.cp.h;
    this.crust = new Uint8Array(n);
    this.findN = 0;
    for (let i = 0; i < n; i++) if (this.cp.d[i * 4 + 3] > 127) this.crust[i] = 1;
    for (let i = 0; i < n; i++) if (this.fp.d[i * 4 + 3] > 127) this.findN++;
    this.prog = it.clean ? 1 : 0;
    if (it.clean) this.crust.fill(0);
    this.state = it.clean ? 'done' : 'cleaning';
  }
  under() {
    const U = this.el.querySelector('.lb-under');
    if (!U) return;
    const it = this.it;
    if (!it) { U.innerHTML = ''; return; }
    if (!it.clean) { U.innerHTML = `<div class="lb-note">Hold and scrub the crust off with the brush. Gently.</div>`; return; }
    const F = FIND_BY_ID[it.id], C = CONDITIONS[it.cond] || CONDITIONS[1];
    const val = findValue(it.id, it.cond);
    const room = this.sys.displayRoom();
    U.innerHTML = `
      <div class="lb-card"><img src="${findURL(it.id, 1, 3)}" width="72" height="72" alt="">
        <div><div class="nm">${esc(F.name)} <span style="font-size:13px;color:#fff;background:${RARITY_COLORS[F.r]};border:2px solid #2a1a14;padding:0 5px">${RARITY_NAMES[F.r]}</span>
        <span style="font-family:var(--font-title);font-size:14px;color:${C.color};border:2px solid ${C.color};padding:0 4px;display:inline-block;transform:rotate(-5deg)">${C.stamp}</span></div>
        <div class="er">${esc(F.era)} · ${F.kind === 'amber' ? 'Amber' : esc(GROUP_NAMES[F.group] || 'Fossil')}</div>
        <div class="fc">"${esc(F.fact)}"</div></div></div>
      <div class="lb-btns">
        <button class="lb-b gold" data-a="show" ${room ? '' : 'disabled title="The case is full: take something down in Collection"'}>${ico('dig_museum', 1)} Display</button>
        <button class="lb-b green" data-a="sell">${ico('coin', 1)} Sell ${val}</button>
        <button class="lb-b" data-a="keep">${ico('dig_vial', 1)} Keep${this.sys.has('r_dig_vial') ? ' (for vials)' : ''}</button>
      </div>`;
    U.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.a)));
  }
  act(a) {
    const it = this.it;
    if (!it) return;
    if (a === 'show') { if (this.sys.display(it.uid)) this.talk(pick(SNAPP.shown)); }
    else if (a === 'sell') { const c = this.sys.sell(it.uid); if (c) this.talk(pick(SNAPP.sold)); }
    else this.talk('Into the drawer. I label everything. EVERYTHING.');
    this.sel = null; this.state = 'idle';
    setTimeout(() => { if (!this.closed && this.tab === 'bench') { const say = this.el.querySelector('.lb-say')?.textContent; this.render(); if (say) this.talk(say); } }, 50);
  }
  finishClean() {
    const it = this.it;
    if (!it || it.clean) return;
    this.sys.clean(it.uid);
    this.state = 'done';
    const F = FIND_BY_ID[it.id];
    this.game.audio?.play?.(['reveal_common', 'reveal_common', 'reveal_rare', 'reveal_epic', 'reveal_legendary'][F.r] || 'reveal_rare', { volume: 0.45 });
    for (let k = 0; k < 20; k++) this.parts.push({ x: this.ox + Math.random() * this.fp.w, y: this.oy + Math.random() * this.fp.h, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.7, max: 0.7, col: F.kind === 'amber' ? [255, 210, 110] : [255, 248, 220], spark: true });
    this.talk(`${F.name}! ${F.fact}`);
    try { this.face?.play?.(F.r >= 2 ? 'happy' : 'loupe'); } catch { /* ignore */ }
    this.under();
  }

  renderCollection(B) {
    const S = this.S;
    const shownN = this.sys.displayed().length;
    const groups = {};
    for (const F of FINDS) (groups[F.group] ||= []).push(F);
    const cell = (F) => {
      const got = S.found?.[F.id] || 0;
      const kept = this.sys.kept(F.id).length, shown = this.sys.displayed().filter((x) => x.id === F.id).length;
      if (!got) return `<div class="lb-cell unk"><img src="${pixURL(silhouettePix(F.id, 1), 2)}" width="48" height="48" alt=""><span>???</span></div>`;
      return `<div class="lb-cell${shown ? ' shown' : ''}" data-id="${F.id}" title="${esc(F.era)}"><img src="${findURL(F.id, 1, 2)}" width="48" height="48" alt=""><span style="color:${RARITY_COLORS[F.r]};text-shadow:1px 1px 0 #2a1a14">${esc(F.name)}</span><span>${shown ? 'On display' : kept ? `${kept} kept · tap to show` : 'Found'}</span>${got > 1 ? `<b>x${got}</b>` : ''}</div>`;
    };
    const tickets = this.sys.has('r_dig_museum') ? `Museum open: about ${this.sys.ticketCoins()} coins of tickets each morning.` : 'Research the Museum Wing and the display sells tickets every morning.';
    B.innerHTML = `<div class="lb-mid" style="align-items:stretch">
      <div class="lb-say">On display: ${shownN}/9. ${esc(tickets)}</div>
      ${Object.entries(groups).map(([g, list]) => `<div style="font-family:var(--font-title);font-size:15px;color:#6a3a14;margin-top:4px">${esc(GROUP_NAMES[g] || g)}</div><div class="lb-grid">${list.map(cell).join('')}</div>`).join('')}
    </div>`;
    B.querySelectorAll('.lb-cell[data-id]').forEach((c) => c.addEventListener('click', () => {
      const id = c.dataset.id;
      const shown = this.sys.displayed().find((x) => x.id === id);
      if (shown) { this.sys.undisplay(shown.uid); this.game.audio?.play?.('drop', { volume: 0.35 }); }
      else { const k = this.sys.kept(id)[0]; if (k && this.sys.display(k.uid)) this.game.audio?.play?.('place', { volume: 0.35 }); }
      this.render();
    }));
  }

  renderVial(B) {
    const R = this.sys.vialPlan();
    const slot = (it, kind) => `<div class="lb-slot${it ? ' ok' : ''}">${it ? `<img src="${findURL(it.id, 1, 2)}" width="48" height="48" alt="">` : `<span style="font-size:12px;font-family:var(--font-title);color:#8a6a44">${kind}</span>`}</div>`;
    B.innerHTML = `<div class="lb-mid"><div class="lb-say">${esc(pick(SNAPP.vial))}</div>
      <div class="lb-vial">
        <div class="lb-slots">${slot(R.amber, 'amber')}<span>+</span>${R.fossils.map((f) => slot(f, 'fossil')).join('')}${[0, 1, 2].slice(R.fossils.length).map(() => slot(null, 'fossil')).join('')}<span>=</span><div class="lb-slot ok">${ico('dig_vial', 3)}</div></div>
        <div class="lb-note">One amber and three cleaned fossils from the drawer (not the ones on display). You have <b>${this.sys.vials()}</b> vial${this.sys.vials() === 1 ? '' : 's'}.<br>To use one: tap an adult fish in your pond, then the green <b>Vial</b> button.</div>
        <button class="lb-b gold" data-a="brew" ${R.ok ? '' : 'disabled'}>${ico('dig_vial', 1)} Brew a Primordial Vial</button>
      </div></div>`;
    B.querySelector('[data-a="brew"]').addEventListener('click', () => {
      if (!this.sys.brew()) return;
      this.talk('Shaken. Not... no. Gently stirred. It is ALIVE. Well. It is a liquid.');
      setTimeout(() => !this.closed && this.render(), 900);
    });
  }

  // ------------------------------------------------------------------ the cleaning canvas
  loop(now) {
    if (this.closed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t = (this.t || 0) + dt;
    if (this.tab === 'bench' && this.cv?.isConnected) {
      if (this.state === 'cleaning' && this.down && this.fp) this.scrub(dt); else { this.lastSx = null; this.lastSy = null; }
      this.draw();
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  scrub(dt) {
    const cp = this.cp, W = cp.w;
    // scrub along the whole stroke since the last frame (fast strokes don't skip)
    const x1 = this.px - this.ox, y1 = this.py - this.oy;
    const x0 = this.lastSx ?? x1, y0 = this.lastSy ?? y1;
    this.lastSx = x1; this.lastSy = y1;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    const r = 5.5;
    let rem = 0;
    for (let q = 1; q <= steps; q++) {
      const cx = x0 + (x1 - x0) * (q / steps), cy = y0 + (y1 - y0) * (q / steps);
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= cp.h) continue;
        const i = y * W + x;
        if (!this.crust[i]) continue;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1 || Math.random() > (dt * 16 / steps + 0.04) * (1.25 - d)) continue;
        this.crust[i] = 0; rem++;
        if (Math.random() < 0.2) this.parts.push({ x: this.ox + x, y: this.oy + y, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, life: 0.6, max: 0.6, col: [cp.d[i * 4], cp.d[i * 4 + 1], cp.d[i * 4 + 2]] });
      }
    }
    if (rem && (this.sfxT = (this.sfxT || 0) - dt) <= 0) { this.game.audio?.play?.('dig_brush', { volume: 0.2, pitch: 1.1 + Math.random() * 0.2 }); this.sfxT = 0.15; }
    // progress = how much of the find is free of crust
    let covered = 0;
    for (let i = 0; i < this.crust.length; i++) if (this.crust[i] && this.fp.d[i * 4 + 3] > 127) covered++;
    this.prog = 1 - covered / Math.max(1, this.findN);
    if (this.prog > 0.86) { for (let i = 0; i < this.crust.length; i++) if (this.crust[i]) { this.crust[i] = 0; if (Math.random() < 0.12) this.parts.push({ x: this.ox + (i % W), y: this.oy + ((i / W) | 0), vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.7, max: 0.7, col: [140, 130, 120] }); } this.finishClean(); }
  }
  draw() {
    const D = this.img.data;
    const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= BW || y >= BH) return; const k = (y * BW + x) * 4; D[k] = r; D[k + 1] = g; D[k + 2] = b; D[k + 3] = 255; };
    // bench top: planks + a green cutting mat with a grid, a pool of lamp light (dithered)
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const plank = Math.floor(y / 12);
      const g = hsh(Math.floor(x / 5), y, plank);
      let c = (y % 12 === 0) ? [86, 54, 28] : g > 0.7 ? [150, 100, 56] : [134, 88, 46];
      const mat = x > 14 && x < BW - 14 && y > 8 && y < BH - 6;
      if (mat) c = ((x - 15) % 8 === 0 || (y - 9) % 8 === 0) ? [70, 120, 84] : [58, 104, 72];
      if (mat && (x === 15 || x === BW - 15 || y === 9 || y === BH - 7)) c = [40, 72, 50];
      const d = Math.hypot(x - BW / 2, (y - BH / 2) * 1.3) / 44;
      const bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
      if (d < 1 && bay > d * 0.9 + 0.1) c = c.map((v) => Math.min(255, v * 1.16 + 6));
      put(x, y, c[0], c[1], c[2]);
    }
    // tools lying on the bench
    for (let k = 0; k < 14; k++) { put(4 + k, 14 + Math.floor(k / 5), 168, 116, 62); put(4 + k, 15 + Math.floor(k / 5), 120, 80, 40); }
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) put(18 + k, 17 + j, 48, 36, 28);
    for (let k = 0; k < 10; k++) { put(BW - 12 + Math.floor(k / 4), 50 + k, 150, 156, 168); put(BW - 11 + Math.floor(k / 4), 50 + k, 110, 116, 130); }
    if (this.fp) {
      const fp = this.fp, cp = this.cp, W = fp.w;
      // shadow, find, crust over it
      for (let y = 0; y < fp.h; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (this.crust[i] || fp.d[i * 4 + 3] > 127) put(this.ox + x + 2, this.oy + y + 2, 40, 64, 46); }
      for (let y = 0; y < fp.h; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.crust[i]) put(this.ox + x, this.oy + y, cp.d[i * 4], cp.d[i * 4 + 1], cp.d[i * 4 + 2]);
        else if (fp.d[i * 4 + 3] > 127) {
          let r = fp.d[i * 4], g = fp.d[i * 4 + 1], b = fp.d[i * 4 + 2];
          if (this.state === 'done' && Math.sin(this.t * 3 + (x + y) * 0.25) > 0.96) { r = 255; g = 252; b = 230; } // a polish glint
          put(this.ox + x, this.oy + y, r, g, b);
        }
      }
      // the condition: cracks painted where the dig hurt it
      const cr = this.it?.cond || 0;
      for (let k = 0; k < cr && this.state === 'done'; k++) {
        let x = this.ox + Math.floor(W * (0.3 + 0.2 * k)), y = this.oy + Math.floor(fp.h * 0.4);
        for (let q = 0; q < 7; q++) { const i = (y - this.oy) * W + (x - this.ox); if (i >= 0 && i < W * fp.h && fp.d[i * 4 + 3] > 127) { put(x, y, 42, 30, 20); put(x + 1, y + 1, 255, 246, 226); } x += hsh(k, q, 3) < 0.5 ? 1 : 0; y += 1; }
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.vy += p.spark ? 0 : 3;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      const c = p.col;
      put(Math.round(p.x), Math.round(p.y), c[0], c[1], c[2]);
      if (p.spark && p.life / p.max > 0.5) { put(Math.round(p.x) + 1, Math.round(p.y), c[0], c[1], c[2]); put(Math.round(p.x), Math.round(p.y) + 1, c[0], c[1], c[2]); }
    }
    // the brush under the pointer
    if (this.px > 0 && this.state === 'cleaning') {
      const ox = Math.round(this.px) + (this.down ? Math.round(Math.sin(this.t * 32) * 1.5) : 0), oy = Math.round(this.py);
      for (let k = 0; k < 8; k++) { put(ox + 2 + k, oy - 3 - k, 168, 116, 62); put(ox + 3 + k, oy - 3 - k, 120, 80, 40); }
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) put(ox + dx, oy + dy, 58, 42, 28);
      put(ox + 2, oy - 2, 224, 180, 74); put(ox + 3, oy - 2, 224, 180, 74);
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    try { this.face?.dispose?.(); } catch { /* ignore */ }
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 200);
    this.game.state.paused = this.wasPaused;
    this.game.audio?.play?.('close', { volume: 0.3 });
    if (current === this) current = null;
    this.sys.onBenchClosed?.();
  }
}
