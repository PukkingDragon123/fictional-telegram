// [v26 turtle] Old Longneck's UI: the slow speech bubble (the game's own pixel
// bubbles, typing at a glacial pace and keeping what he already said), the
// "still talking" pip under Reynard's quest notebook and the transcript scroll.
import { N_WORDS, N_TOKENS, transcript, wordsIn } from './speech.js';
import { LONG_TALK_DAYS } from '../../data/longneck.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------------ slow bubbles
/** The Bubbles record behind a handle (internal; null if the bubble is gone). */
export function bubbleOf(h) {
  const b = h?.el?.querySelector?.('.bb-content')?._bb;
  return b && !b.closing && h.el.isConnected ? b : null;
}
/** Retype a bubble: the first `keep` characters stay up, the rest type in at `cps` characters a second. */
export function slowText(h, text, keep = 0, cps = 2.4) {
  if (!h) return;
  h.setText(text);
  const b = bubbleOf(h);
  if (!b) return;
  const n = Math.max(0, Math.min(keep, b.chars.length));
  for (let i = 0; i < n; i++) b.chars[i].el?.classList.add('on', 'ln-old');
  b.revealed = n; b.shown = n; b.cps = cps; b.typed = n >= b.chars.length;
  b.dur = 1e9; b.__ln = 1;
}
/** Any bubble with this key that someone else opened types at `cps` instead (his lines from other systems). */
export function slowAll(game, key, cps = 6) {
  const L = game.ui?.bubbles?.list;
  if (!L) return;
  for (const b of L) {
    if (b.key !== key || b.__ln || b.closing) continue;
    b.__ln = 1;
    if (b.cps > cps) { b.cps = cps; b.dur = Math.max(b.dur || 0, (b.chars?.length || 0) / cps + 2.2); }
  }
}
/** game.say with a slow typist; resolves after the text is out plus `hold` seconds. */
export function slowSay(game, anchor, text, { cps = 3, hold = 1.2, key = 'npclongneck', size = 'm', mood = 'normal', keepOpen = false } = {}) {
  const h = game.say(anchor, text, { key, size, mood, dur: 1e9 });
  if (!h) return { h: null, done: Promise.resolve(), secs: 0 };
  slowText(h, text, Math.min(1, text.length), cps); // the first character shows at once (no empty bubble)
  const b = bubbleOf(h);
  if (b) b.__ln = 1;
  const secs = text.length / cps + hold;
  const done = new Promise((r) => setTimeout(r, secs * 1000)).then(() => { if (!keepOpen) h.close(); });
  return { h, done, secs };
}

// ------------------------------------------------------------------ styles
let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.dataset.v26 = 'turtle';
  s.textContent = `
.bb-ch.ln-old > span { animation: none !important; }
.lnp { position: absolute; left: 14px; top: calc(228px + env(safe-area-inset-top, 0px)); z-index: 19; width: 168px;
  padding: 5px 7px 6px 34px; background: #f4e8c8; color: #3b2414; border: 2px solid #3b2414; border-radius: 3px;
  box-shadow: 0 3px 0 rgba(30, 16, 8, .45); font-family: var(--font-body, 'TBME Body'); font-size: 13px; line-height: 13px;
  pointer-events: auto; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  transform-origin: 20% 0; animation: lnp-in .45s cubic-bezier(.3, 1.4, .5, 1) both; }
.lnp:hover { animation: lnp-sway .9s ease-in-out; }
.lnp:active { translate: 0 2px; }
@keyframes lnp-in { 0% { transform: translateX(-180px) rotate(-10deg); } 100% { transform: none; } }
@keyframes lnp-sway { 0%, 100% { rotate: 0deg; } 30% { rotate: -3deg; } 65% { rotate: 2deg; } }
.lnp canvas { position: absolute; left: 4px; top: 5px; width: 24px; height: 28px; image-rendering: pixelated; }
.lnp b { font-family: var(--font-title, 'TBME Title'); font-weight: normal; font-size: 13px; }
.lnp .lnp-t { white-space: nowrap; overflow: hidden; }
.lnp .lnp-dots::after { content: ''; animation: lnp-dots 3s steps(1) infinite; }
@keyframes lnp-dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }
.lnp .lnp-bar { position: relative; height: 8px; margin: 4px 0 3px; border: 2px solid #3b2414; background: #d8c8a0; }
.lnp .lnp-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #5a8a3a; }
.lnp .lnp-bar s { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #3b2414; }
.lnp .lnp-n { font-size: 11px; color: #6a4a2a; white-space: nowrap; }
body.feast-cam .lnp, body.lab-mode .lnp, body.pc-mode .lnp, body.lt-pc .lnp, body.home-mode .lnp { display: none; }
.lnt-dim { position: fixed; inset: 0; z-index: 80; background: rgba(20, 12, 8, .55); }
.lnt { position: fixed; z-index: 81; left: 50%; top: 50%; width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 40px);
  transform: translate(-50%, -50%); display: flex; flex-direction: column; color: #3b2414; font-family: var(--font-body, 'TBME Body');
  animation: lnt-in .35s cubic-bezier(.3, 1.3, .5, 1) both; }
@keyframes lnt-in { 0% { transform: translate(-50%, -50%) scaleY(.08); } 100% { transform: translate(-50%, -50%); } }
.lnt-rod { height: 14px; margin: 0 -10px; background: #8a5a30; border: 2px solid #3b2414; border-radius: 7px; box-shadow: inset 0 -4px 0 #6a4224, inset 0 3px 0 #a8743e; flex: none; }
.lnt-paper { background: #f1e3bd; border: 2px solid #3b2414; border-top: 0; border-bottom: 0; padding: 12px 18px 12px; overflow: auto; min-height: 0; }
.lnt h2 { margin: 0; font-family: var(--font-title, 'TBME Title'); font-weight: normal; font-size: 26px; line-height: 28px; text-align: center; color: #3b2414; }
.lnt .lnt-sub { text-align: center; font-size: 13px; color: #7a5a36; margin: 2px 0 10px; }
.lnt .lnt-body p { margin: 0 0 10px; font-size: 15px; line-height: 19px; }
.lnt .lnt-body p .lnt-new { background: #5a8a3a; color: #f1e3bd; padding: 0 2px; }
.lnt .lnt-body .lnt-todo { color: #9a7a52; letter-spacing: 2px; }
.lnt .lnt-btns { display: flex; gap: 8px; justify-content: center; margin-top: 8px; }
.lnt button { font: inherit; font-family: var(--font-title, 'TBME Title'); font-size: 15px; color: #3b2414; background: #e2c88c; border: 2px solid #3b2414;
  border-radius: 3px; padding: 4px 12px 5px; box-shadow: 0 3px 0 #3b2414; cursor: pointer; }
.lnt button:active { translate: 0 2px; box-shadow: 0 1px 0 #3b2414; }
@media (max-width: 600px) { .lnp { top: calc(206px + env(safe-area-inset-top, 0px)); width: 140px; font-size: 12px; } }
`;
  document.head.appendChild(s);
}

// a tiny pixel portrait of the long neck for the pip (12 x 14 art pixels)
const HEAD = [
  '....kkkk....',
  '...kgggGk...',
  '..kgwkgggk..',
  '..kgggggggk.',
  '..kyykggggk.',
  '...kkkgggk..',
  '.....kggk...',
  '.....kgGk...',
  '....kggk....',
  '....kgGk....',
  '...kggk.....',
  '..kssssk....',
  '.kssSssSk...',
  'kssssssssk..',
];
const PAL = { k: '#2a1a12', g: '#a3ad92', G: '#7e8870', w: '#fffaf0', y: '#d8b04a', s: '#5f6a42', S: '#7cc256' };
function drawHead(cv) {
  const x = cv.getContext('2d');
  HEAD.forEach((row, j) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); } }));
}

// ------------------------------------------------------------------ the pip
export class TalkPip {
  constructor(game, { onTap } = {}) {
    this.game = game;
    this.onTap = onTap;
    this.el = null;
    this.key = '';
  }
  ensure() {
    if (this.el) return this.el;
    const root = this.game.ui?.root || document.getElementById('ui');
    if (!root) return null;
    css();
    const el = document.createElement('div');
    el.className = 'lnp';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Old Longneck is still talking. Tap to read what he said so far.');
    el.innerHTML = `<canvas width="12" height="14"></canvas><div class="lnp-t"><b>Old Longneck</b></div><div class="lnp-t">is still talking<span class="lnp-dots"></span></div><div class="lnp-bar"><i></i>${[1, 2].map((k) => `<s style="left:calc(${(100 * k) / LONG_TALK_DAYS}% - 1px)"></s>`).join('')}</div><div class="lnp-n"></div>`;
    drawHead(el.querySelector('canvas'));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); this.game.audio?.play?.('page', { volume: 0.4 }); this.onTap?.(); });
    root.appendChild(el);
    this.el = el;
    return el;
  }
  set(show, { n = 0, day = 1 } = {}) {
    if (!show) { this.hide(); return; }
    const el = this.ensure();
    if (!el) return;
    if (el.style.display === 'none') el.style.display = '';
    const key = `${n}|${day}`;
    if (key === this.key) return;
    this.key = key;
    const w = wordsIn(n);
    el.querySelector('.lnp-bar i').style.width = `${Math.round((100 * n) / N_TOKENS)}%`;
    el.querySelector('.lnp-n').textContent = `word ${w}/${N_WORDS} · day ${day} of ${LONG_TALK_DAYS}`;
  }
  hide() {
    if (!this.el || this.el.style.display === 'none') return;
    this.el.style.display = 'none';
    this.key = '';
  }
  dispose() { this.el?.remove(); this.el = null; }
}

// ------------------------------------------------------------------ the transcript scroll
/** Opens the scroll; returns { close }. n = tokens said, done = finished. */
export function openTranscript(game, { n, day, done, onLook } = {}) {
  css();
  const paras = transcript(n);
  const last = paras.length - 1;
  const body = paras.map((p, i) => {
    if (i !== last || done) return `<p>${esc(p)}</p>`;
    const k = p.lastIndexOf(' ');
    return `<p>${esc(p.slice(0, k + 1))}<span class="lnt-new">${esc(p.slice(k + 1))}</span> <span class="lnt-todo">. . .</span></p>`;
  }).join('') || '<p class="lnt-todo">. . .</p>';
  const sub = done ? `Old Longneck · all ${N_WORDS} words · ${LONG_TALK_DAYS} days` : `Old Longneck · day ${day} of ${LONG_TALK_DAYS} · ${wordsIn(n)} of ${N_WORDS} words`;
  const dim = document.createElement('div');
  dim.className = 'lnt-dim';
  const el = document.createElement('div');
  el.className = 'lnt';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="lnt-rod"></div><div class="lnt-paper"><h2>The Long Talk</h2><div class="lnt-sub">${esc(sub)}</div><div class="lnt-body">${body}</div>
    <div class="lnt-btns">${onLook && !done ? '<button type="button" data-a="look">Go look</button>' : ''}<button type="button" data-a="close">Close</button></div></div><div class="lnt-rod"></div>`;
  document.body.append(dim, el);
  const paper = el.querySelector('.lnt-paper');
  paper.scrollTop = paper.scrollHeight;
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    dim.remove(); el.remove();
    window.removeEventListener('keydown', onKey, true);
    game.audio?.play?.('page', { volume: 0.3 });
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  window.addEventListener('keydown', onKey, true);
  for (const x of [dim, el]) x.addEventListener('pointerdown', (e) => e.stopPropagation());
  dim.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') close();
    else if (a === 'look') { close(); onLook?.(); }
  });
  return { close, el };
}
