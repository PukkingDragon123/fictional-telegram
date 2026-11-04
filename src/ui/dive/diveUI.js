// [v32 dive] The HUD while diving: every piece a little pixel-art object.
//   top left   : the SURFACE button (a yellow arrow out of the water) + the gear tag
//   top middle : the air gauge (a row of bubbles that pop as the air runs out) and a brass
//                depth gauge (a dial drawn texel by texel on a canvas, needle and all)
//   right      : Chief Buff's lesson card (pinned paper, steps ticked off with a pen mark)
//   bottom     : the build kit (farm icons, prices, locked ones greyed) when farms are open
//   in world   : status tags over the farms (a pixel progress bar, READY! stamp), the farm card
// No emoji, no smooth gradients: hard pixel borders, 2 px offsets for depth, pixel fonts.
import { spriteImg } from '../sprites.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (n, s = 2) => spriteImg(n, s);

let cssDone = false;
function css() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
body.dive-mode .qn, body.dive-mode .fogtag, body.dive-mode .campad { display: none !important; }
.diveui { position: fixed; inset: 0; z-index: 24; pointer-events: none; font-family: var(--font-title, "TBME Title"), monospace; image-rendering: pixelated; }
.diveui * { box-sizing: border-box; }
.diveui button { font-family: inherit; cursor: pointer; }
.dv-surface { position: absolute; left: calc(12px + var(--safe-l, 0px)); top: calc(12px + var(--safe-t, 0px)); pointer-events: auto;
  display: flex; align-items: center; gap: 6px; padding: 4px 12px 6px 6px; color: #fff6d8; font-size: 20px; letter-spacing: 1px;
  background: #1c4a5c; border: 3px solid #0b1e28; box-shadow: inset 0 3px 0 #3a7a8e, inset 0 -3px 0 #123644, 3px 3px 0 #0b1e28; }
.dv-surface:hover { background: #24596c; transform: translateY(-1px); }
.dv-surface:active { transform: translateY(2px); box-shadow: inset 0 3px 0 #3a7a8e, inset 0 -3px 0 #123644, 1px 1px 0 #0b1e28; }
.dv-surface small { display: block; font-size: 12px; color: #9ad8e8; letter-spacing: 0; margin-top: -3px; }
.dv-gear { position: absolute; left: calc(12px + var(--safe-l, 0px)); top: calc(62px + var(--safe-t, 0px)); display: flex; gap: 4px; align-items: center;
  padding: 2px 8px 3px 4px; color: #ffe9a0; font-size: 14px; background: #0b1e28; border: 2px solid #3a7a8e; }
.dv-gauges { position: absolute; left: 50%; top: calc(8px + var(--safe-t, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; }
.dv-air { display: flex; gap: 2px; align-items: center; padding: 6px 10px 6px 8px; background: #0b1e28; border: 3px solid #3a7a8e; box-shadow: 3px 3px 0 #061218; }
.dv-air b { color: #9ad8e8; font-size: 15px; margin-right: 6px; font-weight: normal; letter-spacing: 1px; }
.dv-air i { display: block; width: 16px; height: 16px; background-size: 16px 16px; image-rendering: pixelated; }
.dv-air.low { animation: dv-flash .5s steps(2) infinite; }
@keyframes dv-flash { 50% { border-color: #e0403a; } }
.dv-depth { display: block; image-rendering: pixelated; }
.dv-lesson { position: absolute; right: calc(14px + var(--safe-r, 0px)); top: calc(70px + var(--safe-t, 0px)); width: 236px; padding: 18px 14px 12px 16px;
  background: #f4ead0; color: #2a1a14; border: 3px solid #2a1a14; box-shadow: 4px 4px 0 rgba(6, 18, 24, .7); transform: rotate(1.2deg); }
.dv-lesson::before { content: ''; position: absolute; left: 50%; top: -9px; width: 14px; height: 14px; margin-left: -7px; background: #d8403a; border: 3px solid #2a1a14; box-shadow: inset 3px 3px 0 #ff8a7a; }
.dv-lesson h4 { margin: 0 0 6px; font-size: 18px; font-weight: normal; color: #1c3a6a; letter-spacing: 1px; }
.dv-lesson h4 span { display: block; font-size: 12px; color: #7a6a52; letter-spacing: 0; }
.dv-lesson ul { list-style: none; margin: 0; padding: 0; font-size: 14px; line-height: 1.25; }
.dv-lesson li { position: relative; padding: 2px 0 4px 22px; }
.dv-lesson li::before { content: ''; position: absolute; left: 0; top: 3px; width: 12px; height: 12px; border: 2px solid #2a1a14; background: #fffaf0; }
.dv-lesson li.ok { color: #7a6a52; text-decoration: line-through; text-decoration-thickness: 2px; }
.dv-lesson li.ok::after { content: ''; position: absolute; left: 3px; top: 0; width: 6px; height: 11px; border-right: 3px solid #2a8a3a; border-bottom: 3px solid #2a8a3a; transform: rotate(40deg); }
.dv-lesson.hidden, .dv-kit.hidden, .dv-card.hidden { display: none; }
.dv-kit { position: absolute; left: 50%; bottom: calc(10px + var(--safe-b, 0px)); transform: translateX(-50%); display: flex; gap: 6px; padding: 6px 8px 8px;
  background: #3a2a1e; border: 3px solid #1a120c; box-shadow: inset 0 3px 0 #5a4232, 3px 3px 0 rgba(6, 18, 24, .7); pointer-events: auto; }
.dv-kit .lbl { writing-mode: vertical-rl; transform: rotate(180deg); color: #e8c890; font-size: 13px; letter-spacing: 2px; margin-right: 2px; }
.dv-kit button { position: relative; width: 62px; padding: 4px 2px 3px; display: flex; flex-direction: column; align-items: center; gap: 1px;
  background: #f4ead0; color: #2a1a14; border: 3px solid #1a120c; box-shadow: inset 0 -3px 0 #d8c8a0; font-size: 12px; line-height: 1; }
.dv-kit button:hover:not(.off) { transform: translateY(-3px); background: #fffaf0; }
.dv-kit button.sel { background: #ffe070; box-shadow: inset 0 -3px 0 #d8a020; transform: translateY(-4px); }
.dv-kit button.off { filter: grayscale(1) brightness(.75); cursor: default; }
.dv-kit button em { font-style: normal; color: #8a5a1a; display: flex; gap: 1px; align-items: center; font-size: 13px; }
.dv-kit button .lk { position: absolute; right: -4px; top: -6px; }
.dv-tip { position: absolute; padding: 3px 8px 4px; background: #fffbea; border: 3px solid #1a1420; box-shadow: 3px 3px 0 #1a1420; font-size: 14px; color: #1a1420; pointer-events: none; white-space: nowrap; transform: translate(-50%, -100%); }
.dv-tip.hidden { display: none; }
.dv-tag { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 1px; pointer-events: none; }
.dv-tag .bar { width: 44px; height: 9px; background: #0b1e28; border: 2px solid #0b1e28; display: flex; gap: 1px; padding: 1px; }
.dv-tag .bar i { flex: 1; background: #24404c; }
.dv-tag .bar i.on { background: #7ad04a; box-shadow: inset 0 -2px 0 #3a8a2a; }
.dv-tag .rdy { padding: 0 5px 2px; font-size: 14px; color: #fff6d8; background: #2a8a3a; border: 2px solid #0b1e28; transform: rotate(-4deg); animation: dv-bob .8s steps(2) infinite; }
.dv-tag .rdy.gold { background: #c8901a; }
@keyframes dv-bob { 50% { transform: rotate(-4deg) translateY(-3px); } }
.dv-card { position: absolute; width: 250px; padding: 12px 12px 10px; pointer-events: auto; transform: translate(-50%, -100%);
  background: #f4ead0; color: #2a1a14; border: 3px solid #2a1a14; box-shadow: 4px 4px 0 rgba(6, 18, 24, .7); font-size: 14px; }
.dv-card h4 { margin: 0 0 2px; font-size: 19px; font-weight: normal; display: flex; align-items: center; gap: 6px; color: #1c3a6a; }
.dv-card p { margin: 2px 0 6px; line-height: 1.25; color: #4a3a2a; }
.dv-card .x { position: absolute; right: 4px; top: 2px; width: 22px; height: 22px; background: #d8403a; color: #fff; border: 2px solid #2a1a14; font-size: 14px; line-height: 14px; padding: 0; }
.dv-card .row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.dv-card .row button, .dv-card .act { display: flex; align-items: center; gap: 4px; padding: 3px 6px 4px; font-size: 13px; color: #2a1a14;
  background: #fffaf0; border: 2px solid #2a1a14; box-shadow: 0 2px 0 #2a1a14; }
.dv-card .row button:hover, .dv-card .act:hover { background: #ffe8a0; transform: translateY(-1px); }
.dv-card .row button:disabled { opacity: .45; cursor: default; transform: none; }
.dv-card .act.go { background: #7ad04a; } .dv-card .act.sell { background: #ffd23a; } .dv-card .act.rm { background: #e8b0a0; margin-left: auto; }
.dv-card .meter { display: flex; gap: 2px; height: 12px; margin: 4px 0; } .dv-card .meter i { flex: 1; background: #d8c8a0; border: 1px solid #a89870; }
.dv-card .meter i.on { background: #4aa0d8; border-color: #1c5a8a; }
.dv-card img.fish { image-rendering: pixelated; }
.dv-float { position: absolute; transform: translate(-50%, -50%); font-size: 20px; color: #fff3a0; pointer-events: none; white-space: nowrap;
  text-shadow: 2px 2px 0 #0b1e28, -2px -2px 0 #0b1e28, 2px -2px 0 #0b1e28, -2px 2px 0 #0b1e28; animation: dv-float 1.8s steps(12) forwards; }
@keyframes dv-float { 0% { opacity: 0; margin-top: 10px; } 12% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; margin-top: -46px; } }
.dv-hint { position: absolute; left: 50%; bottom: calc(96px + var(--safe-b, 0px)); transform: translateX(-50%); padding: 4px 12px 6px; font-size: 16px; color: #e8f8ff;
  background: #0b1e28; border: 3px solid #3a7a8e; box-shadow: 3px 3px 0 #061218; white-space: nowrap; }
.dv-hint.hidden { display: none; }
.dv-hint kbd { display: inline-block; padding: 0 4px; margin: 0 1px; font-family: inherit; color: #0b1e28; background: #e8f8ff; border: 2px solid #9ad8e8; box-shadow: 0 2px 0 #3a7a8e; }
`;
  document.head.appendChild(s);
}

// ------------------------------------------------------------------ the brass depth gauge (a pixel dial)
function drawDial(cv, depth, maxDepth = 12) {
  const S = 34, x = cv.getContext('2d');
  cv.width = S; cv.height = S;
  const P = (px, py, c) => { x.fillStyle = c; x.fillRect(px, py, 1, 1); };
  const cx = 16.5, cy = 16.5;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
    if (d > 16.2) continue;
    if (d > 14.8) P(i, j, '#1a120c');
    else if (d > 13.2) P(i, j, i + j < 30 ? '#f6dc80' : (i + j < 36 ? '#d8a840' : '#8a6420')); // brass bezel, lit top-left
    else if (d > 12.4) P(i, j, '#5a4218');
    else P(i, j, (i + j) % 7 === 0 ? '#f2ead6' : '#faf4e4');
  }
  // ticks every 30 degrees over a 270 degree sweep
  for (let k = 0; k <= 6; k++) {
    const a = (-225 + k * 45) * Math.PI / 180;
    for (let r = 9.5; r <= 11.5; r += 1) P(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r), k >= 5 ? '#d8403a' : '#2a1a14');
  }
  // needle
  const u = Math.max(0, Math.min(1, depth / maxDepth));
  const a = (-225 + u * 270) * Math.PI / 180;
  for (let r = 0; r <= 10; r += 0.5) P(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r), '#c8302a');
  P(16, 16, '#2a1a14'); P(17, 16, '#2a1a14'); P(16, 17, '#2a1a14'); P(17, 17, '#5a4218');
  // the "M" label + a glint on the glass
  for (const [i, j] of [[13, 22], [13, 23], [13, 24], [14, 23], [15, 22], [15, 23], [15, 24]]) P(i + 2, j, '#7a6a52');
  P(9, 9, '#ffffff'); P(10, 8, '#ffffff'); P(8, 10, '#ffffff');
}

export class DiveUI {
  constructor(handlers) {
    css();
    this.h = handlers;
    const el = (this.el = document.createElement('div'));
    el.className = 'diveui';
    el.innerHTML = `
      <button class="dv-surface" data-a="surface">${ico('dv_surface', 2)}<span>SURFACE<small>Esc</small></span></button>
      <div class="dv-gear" data-h="gear"></div>
      <div class="dv-gauges"><div class="dv-air" data-h="air"><b>AIR</b></div><canvas class="dv-depth" data-h="depth"></canvas></div>
      <div class="dv-lesson hidden" data-h="lesson"></div>
      <div class="dv-kit hidden" data-h="kit"></div>
      <div class="dv-hint hidden" data-h="hint"></div>
      <div class="dv-tip hidden" data-h="tip"></div>
      <div class="dv-card hidden" data-h="card"></div>`;
    (document.getElementById('ui') || document.body).appendChild(el);
    this.$ = (k) => el.querySelector(`[data-h="${k}"]`);
    this.tags = new Map();
    el.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .dv-card, .dv-kit')) e.stopPropagation(); });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b || b.classList.contains('off') || b.disabled) return;
      e.stopPropagation();
      this.h.click?.(b.dataset.a, b.dataset);
    });
    el.addEventListener('pointerover', (e) => { const b = e.target.closest('[data-tip]'); if (b) this.tip(b.dataset.tip, b); });
    el.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) this.tip(null); });
    this.depthCv = this.$('depth');
    this.depthCv.style.width = '68px'; this.depthCv.style.height = '68px';
    this._depthK = -1;
    this._airN = -1;
  }

  setGear(G) { this.$('gear').innerHTML = `${ico(G.icon, 1)}${esc(G.name)}`; }
  setAir(k) {
    const N = 10, n = Math.ceil(Math.max(0, Math.min(1, k)) * N);
    const low = k < 0.3;
    if (n === this._airN && low === this._airLow) return;
    this._airN = n; this._airLow = low;
    const A = this.$('air');
    A.classList.toggle('low', low);
    if (!this._bub) {
      // a full bubble and a popped ring, as tiny pixel canvases
      const mk = (rows) => {
        const c = document.createElement('canvas'); c.width = 8; c.height = 8; const x = c.getContext('2d');
        const pal = { k: '#1c5a76', w: '#ffffff', c: '#8ad8ee', b: '#4aa8cc', d: '#3a5a66' };
        rows.forEach((r, j) => { for (let i = 0; i < 8; i++) { const ch = r[i]; if (ch && ch !== '.') { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } } });
        return c.toDataURL();
      };
      this._bub = [mk(['..kkkk..', '.kwwccck', 'kwwcccck', 'kwcccccb', 'kcccccbk', 'kccccbbk', '.kcbbbk.', '..kkkk..']), mk(['........', '..d..d..', '.d....d.', '........', '........', '.d....d.', '..d..d..', '........'])];
    }
    A.innerHTML = '<b>AIR</b>' + Array.from({ length: N }, (_, i) => `<i style="background-image:url(${i < n ? this._bub[0] : this._bub[1]})"></i>`).join('');
  }
  setDepth(m) {
    const k = Math.round(m * 4) / 4;
    if (k === this._depthK) return;
    this._depthK = k;
    drawDial(this.depthCv, k);
    this.depthCv.title = `${k.toFixed(1)} m`;
  }
  setLesson(L) {
    const E = this.$('lesson');
    if (!L) { E.classList.add('hidden'); return; }
    E.classList.remove('hidden');
    E.innerHTML = `<h4>${esc(L.title)}<span>${esc(L.sub || 'Chief Buff\'s orders')}</span></h4><ul>${L.steps.map((s) => `<li class="${s.done ? 'ok' : ''}">${esc(s.text)}</li>`).join('')}</ul>`;
  }
  setKit(items, sel) {
    const K = this.$('kit');
    if (!items?.length) { K.classList.add('hidden'); return; }
    K.classList.remove('hidden');
    K.innerHTML = `<span class="lbl">BUILD</span>` + items.map((it) => `<button data-a="kit" data-type="${it.type}" class="${it.locked ? 'off' : ''} ${sel === it.type ? 'sel' : ''}" data-tip="${esc(it.tip)}">${ico(it.icon, 2)}<span>${esc(it.short)}</span><em>${ico('dv_coin', 1)}${it.cost}</em>${it.locked ? `<span class="lk">${ico('lock', 1)}</span>` : ''}</button>`).join('');
  }
  hint(html) {
    const H = this.$('hint');
    if (!html) { H.classList.add('hidden'); return; }
    H.innerHTML = html;
    H.classList.remove('hidden');
  }
  tip(text, anchor) {
    const T = this.$('tip');
    if (!text) { T.classList.add('hidden'); return; }
    T.textContent = text;
    const r = anchor.getBoundingClientRect();
    T.style.left = `${r.left + r.width / 2}px`; T.style.top = `${r.top - 6}px`;
    T.classList.remove('hidden');
  }
  float(text, x, y, color = '#fff3a0') {
    const d = document.createElement('div');
    d.className = 'dv-float';
    d.textContent = text;
    d.style.left = `${x}px`; d.style.top = `${y}px`; d.style.color = color;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }
  /** farm status tags: list of { id, x, y, visible, k (0..1), ready, label, gold } */
  setTags(list) {
    const seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let e = this.tags.get(t.id);
      if (!e) { e = document.createElement('div'); e.className = 'dv-tag'; this.el.appendChild(e); this.tags.set(t.id, e); e._k = null; }
      e.style.display = t.visible ? '' : 'none';
      if (!t.visible) continue;
      e.style.left = `${Math.round(t.x)}px`; e.style.top = `${Math.round(t.y)}px`;
      const key = t.ready ? 'r' + t.label + (t.gold ? 'g' : '') : t.k == null ? 'n' : 'k' + Math.floor(t.k * 8);
      if (key === e._k) continue;
      e._k = key;
      e.innerHTML = t.ready ? `<span class="rdy ${t.gold ? 'gold' : ''}">${esc(t.label)}</span>` : t.k == null ? '' : `<span class="bar">${Array.from({ length: 8 }, (_, i) => `<i class="${i < Math.floor(t.k * 8) ? 'on' : ''}"></i>`).join('')}</span>`;
    }
    for (const [id, e] of this.tags) if (!seen.has(id)) { e.remove(); this.tags.delete(id); }
  }
  card(html, x, y) {
    const C = this.$('card');
    if (!html) { C.classList.add('hidden'); this.cardOpen = false; return; }
    C.innerHTML = `<button class="x" data-a="cardx">x</button>` + html;
    const w = 250, h = C.offsetHeight || 180;
    C.style.left = `${Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8, x))}px`;
    C.style.top = `${Math.max(h + 70, Math.min(innerHeight - 90, y))}px`;
    C.classList.remove('hidden');
    this.cardOpen = true;
  }
  dispose() { this.el.remove(); }
}
export { ico, esc };
