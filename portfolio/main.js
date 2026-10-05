// Pukking's portfolio: boots the game's pixel renderer, builds the classroom
// (PortfolioRoom.js) and adds the page UI around it: title sign, class schedule,
// clickable pins, speech bubble, link tag, media viewer and the "hire me" letter.
//
// Dev helpers: ?chapter=games jumps straight into a chapter, ?idle=1 skips the
// title; window.__pf exposes the room and helpers for the console / tests.
import * as THREE from 'three';
import '../src/ui/fonts.css';
import './portfolio.css';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import audio from '../src/audio/audio.js';
import { showTitleMenu } from '../src/ui/TitleMenu.js';
import { openPaper, paperTexture, injectPaperCSS, setPaperSfx } from '../src/ui/paper.js';
import { registerPortfolioDoodles } from './doodles.js';
import { PortfolioRoom } from './PortfolioRoom.js';
import { iconImg } from './icons.js';
import { showFallback } from './fallback.js';
import { SITE, LINKS, MEDIA, CHAPTERS, CHAPTER_BY_ID, QUIPS, IDLE_BOARD } from './content.js';
import { BOARD } from '../src/entities/classroomScene.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* optional */ } };

const state = { mode: 'loading', done: new Set(), night: false, bubbleT: 0, quip: 0, media: null, idleGag: 8 };
try { for (const id of JSON.parse(localStorage.getItem('pukking.done') || '[]')) state.done.add(id); } catch { /* storage unavailable */ }
const saveDone = () => { try { localStorage.setItem('pukking.done', JSON.stringify([...state.done])); } catch { /* ignore */ } };

let pr = null, game = null, room = null;
let rootEl, bubbleEl;
const paintSound = () => {};

function setMode(m) {
  state.mode = m;
  document.body.classList.remove('pf-title', 'pf-idle', 'pf-chapter', 'pf-loading');
  document.body.classList.add('pf-' + m);
}

// ------------------------------------------------------------------ boot
async function boot() {
  registerPortfolioDoodles();
  setMode('loading');
  const canvas = document.getElementById('game');
  try {
    pr = new PixelRenderer(canvas);
  } catch (e) { console.warn('WebGL unavailable', e); showFallback('no WebGL'); return; }
  game = { renderer: pr, audio, ui: null, state: { paused: false, hour: 10.5, phase: 'day' }, inputLocked: false, overrideScene: null, overrideRig: null };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pr.resize(window.innerWidth, window.innerHeight, dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    room?.refitCamera();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  await nextFrame(); await nextFrame();
  try { await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* ignore */ }

  try {
    room = new PortfolioRoom(game, { media: MEDIA, hooks: { onContact: openContact, onChapterStart: () => {} } });
    room.start();
  } catch (e) { console.warn('Classroom failed to start', e); showFallback('the classroom could not start'); return; }
  resize();

  injectPaperCSS();
  setPaperSfx(sfx);
  buildUI();
  setupKeys();
  const loading = document.getElementById('pf-loading');
  if (loading) { loading.classList.add('out'); setTimeout(() => loading.remove(), 500); }

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    room.update(dt);
    audio.update?.(dt);
    pr.render(room.scene, room.rig);
    tickUI(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  document.body.classList.add('pf-hot-ok');
  const first = params.get('chapter');
  if (first && CHAPTER_BY_ID[first]) { setMode('idle'); startChapter(first); }
  else if (params.get('idle') === '1') { setMode('idle'); drawIdleBoard(); }
  else { drawIdleBoard(); showTitle(); }

  window.__pf = { room, pr, state, startChapter, openContact, setMode, say, CHAPTERS, MEDIA };
}

// ------------------------------------------------------------------ UI (almost none)
let tipEl, hot = null;
function buildUI() {
  rootEl = document.getElementById('pf-root');
  bubbleEl = el('div', 'pf-bubble'); rootEl.appendChild(bubbleEl);
  tipEl = el('div', 'pf-tip'); document.body.appendChild(tipEl);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown, true);
}
const _up = new THREE.Vector3(0, 0.22, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3();

// things you can click: [label, world position, half-size in px (at 720p), action]
function spots() {
  const f = room.fox.root.position, st = room.room.students.list;
  return [
    { tip: 'Pukking', p: _s(f.x, f.y + 0.65, f.z), rx: 70, ry: 90, go: () => startChapter('hello') },
    { tip: 'Chalkboard', p: _s(-0.35, 1.1, -2.8), rx: 300, ry: 160, go: () => startChapter('toolkit') },
    { tip: 'Globe', p: _s(3.45, 1.3, -2.55), rx: 34, ry: 40, go: () => startChapter('games') },
    { tip: 'Bookshelf', p: _s(-3.6, 0.5, -2.5), rx: 90, ry: 70, go: () => startChapter('pixelart') },
    { tip: 'Poster', p: _s(1.42, 1.28, -2.9), rx: 50, ry: 55, go: () => startChapter('mods') },
    { tip: 'Bell', p: _s(3.35, 0.9, -2.25), rx: 30, ry: 30, go: ringBell },
    { tip: 'Window', p: _s(-3.78, 1.7, -2.9), rx: 70, ry: 90, go: toggleNight },
    ...st.map((s) => ({ tip: 'Fish', p: _s(s.world.x, s.world.y, s.world.z), rx: 36, ry: 40, go: waveClass })),
  ];
}
const _s = (x, y, z) => new THREE.Vector3(x, y, z);
function pick(e) {
  if (state.mode !== 'idle' || state.media || document.querySelector('.pp-ov')) return null;
  const W = innerWidth, H = innerHeight, k = Math.max(0.6, Math.min(1.5, H / 720));
  let best = null, bd = 1;
  for (const sp of spots()) {
    _v.copy(sp.p).project(room.rig.camera);
    const dx = e.clientX - (_v.x * 0.5 + 0.5) * W, dy = e.clientY - (-_v.y * 0.5 + 0.5) * H;
    const d = Math.hypot(dx / (sp.rx * k), dy / (sp.ry * k));
    if (d < bd) { bd = d; best = sp; }
  }
  return best;
}
function onMove(e) {
  hot = pick(e);
  document.body.classList.toggle('pf-hot', !!hot);
  tipEl.textContent = hot ? hot.tip : '';
  tipEl.classList.toggle('on', !!hot);
  if (hot) tipEl.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`;
}
function onDown(e) {
  if (e.target.closest?.('.pp-ov, .tm')) return;
  if (state.mode === 'chapter' && room.screen?.on && room.screen.def?.href) {
    const B = BOARD, W = innerWidth, H = innerHeight, c = room.rig.camera;
    const pt = (x, y) => { _v.set(x, y, B.z + 0.12).project(c); return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H]; };
    const [x0, y0] = pt(B.cx - B.w / 2, B.cy + B.h / 2), [x1, y1] = pt(B.cx + B.w / 2, B.cy - B.h / 2);
    if (e.clientX > x0 && e.clientX < x1 && e.clientY > y0 && e.clientY < y1) {
      e.stopImmediatePropagation(); e.preventDefault();
      window.open(room.screen.def.href, '_blank', 'noopener');
    }
    return;
  }
  const h = pick(e);
  if (h) { audio.unlock(); closeBubble(); h.go(); }
}

// ------------------------------------------------------------------ title
function showTitle() {
  setMode('title');
  const menu = showTitleMenu(document.body, {
    hasSave: false, sfx,
    onSound: (on) => { audio.setMuted(!on); paintSound(); },
    isMuted: () => audio.isMuted(),
    onStart: () => enterClass(),
  });
  const t = menu.el;
  const q = (s) => t.querySelector(s);
  q('.tm-l1').textContent = 'PUKKING';
  q('.tm-l2').textContent = 'PORTFOLIO';
  q('.tm-logo').setAttribute('aria-label', 'Pukking Portfolio');
  q('.tm-cap')?.remove();
  const lbl = q('.tm-lbl');
  if (lbl) lbl.textContent = 'Enter class';
  const credit = q('.tm-credit');
  if (credit) credit.innerHTML = 'A cozy 3D portfolio built with JavaScript + Three.js · Font: TBME Goofy, made from Chewy by Font Diner / Sideshow (Apache 2.0)';
}

function enterClass() {
  audio.unlock();
  audio.setMusic(state.night ? 'night' : 'morning');
  setMode('idle');
  if (!state.done.has('hello')) startChapter('hello');
  else sayHi();
}

// ------------------------------------------------------------------ chapters
function drawIdleBoard() {
  const b = room.board;
  b.clear();
  b.draw(IDLE_BOARD, { speed: 2.2 });
}

async function startChapter(id) {
  const script = CHAPTER_BY_ID[id];
  if (!script || state.mode === 'chapter' || !room) return;
  audio.unlock();
  closeBubble();
  hot = null; tipEl.classList.remove('on'); document.body.classList.remove('pf-hot');
  setMode('chapter');
  const res = await room.runChapter(script);
  setMode('idle');
  if (res.completed) { state.done.add(id); saveDone(); say('Click something else.', 'happy'); }
  drawIdleBoard();
  state.idleGag = 6;
}


// ------------------------------------------------------------------ free roam: bubble, pins, gags
function say(text, expr = 'happy', ms = null) {
  if (!room?.fox) return;
  const plainText = String(text).replace(/\*\*/g, '');
  room.fox.setExpression?.(expr, { hold: 3 });
  room.fox.talk?.(plainText);
  try { audio.babble?.('fox', plainText); } catch { /* optional */ }
  bubbleEl.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  bubbleEl.classList.add('on');
  state.bubbleT = ms != null ? ms / 1000 : 2.4 + plainText.length * 0.045;
}
function closeBubble() { state.bubbleT = 0; bubbleEl?.classList.remove('on'); }

function sayHi() {
  const q = QUIPS[state.quip++ % QUIPS.length];
  room._idle(true);
  say(q.say, q.expr);
}
function ringBell() {
  sfx('class_bell', { volume: 0.7 });
  room.room.students.react('bang', { stagger: 0.05 });
  room.fox.play(room._anim('cheer', 'wave'), { loop: false, onDone: () => room._idle() });
  say('Oh, a customer.', 'greedy', 2200);
  setTimeout(() => { if (state.mode === 'idle') openContact(); }, 900);
}
function toggleNight() {
  state.night = !state.night;
  room.room.setNight(state.night);
  audio.setMusic(state.night ? 'night' : 'morning');
  say(state.night ? 'Lights out.' : 'Morning again.', state.night ? 'sleepy' : 'happy', 2200);
}
function waveClass() {
  room.room.students.setSleepy(false);
  room.room.students.react('cheer');
  sfx('class_cheer', { volume: 0.5 });
  say('Class, say hi.', 'happy', 2200);
}

// ------------------------------------------------------------------ per-frame UI
function tickUI(dt) {
  const idle = state.mode === 'idle';
  const cam = room.rig.camera;
  const W = window.innerWidth, H = window.innerHeight;
  if (state.bubbleT > 0) {
    state.bubbleT -= dt;
    room.fox.headTop(_w);
    _v.copy(_w).add(_up).project(cam);
    const x = Math.max(12, Math.min(W - 12, (_v.x * 0.5 + 0.5) * W));
    const y = (-_v.y * 0.5 + 0.5) * H - 54;
    bubbleEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    if (state.bubbleT <= 0) { bubbleEl.classList.remove('on'); if (state.mode === 'idle') room._idle(); }
  }
  // free-roam gags: the fox fidgets and a fish waves now and then
  if (idle && !state.media && !document.querySelector('.pp-ov')) {
    state.idleGag -= dt;
    if (state.idleGag <= 0) {
      state.idleGag = 9 + Math.random() * 8;
      if (!room.foxState.goal && state.bubbleT <= 0) {
        const g = ['wave_hello', 'shrug', 'polish_monocle', 'stretch', 'think'][(Math.random() * 5) | 0];
        room.fox.play(room._anim(g, 'idle'), { loop: false, onDone: () => room._idle() });
        if (Math.random() < 0.6) room.room.students.react(['heart', 'note', 'sparkle', 'star'][(Math.random() * 4) | 0], { who: (Math.random() * 6) | 0 });
      }
    }
  }
}

function closeMedia() {}

// ------------------------------------------------------------------ hire-me letter
function openContact() {
  if (document.querySelector('.pp-ov')) return;
  const c = SITE.contact;
  const btn = (href, icon, label, alt, r) => `<a class="pf-link-btn${alt ? ' alt' : ''}" href="${esc(href)}" target="_blank" rel="noopener" style="--r:${r}deg">${iconImg(icon, 2)}<span>${esc(label)}</span></a>`;
  const links = [btn(c.itch, 'play', 'MY GAMES ON ITCH.IO', false, -1.5)];
  if (c.email) links.push(btn(`mailto:${c.email}`, 'mail', 'EMAIL ME', true, 1.2));
  if (c.discord) links.push(btn(c.discord, 'chat', 'DISCORD', true, -1));
  for (const o of c.other || []) links.push(btn(o.href, 'star', o.label, true, 1));
  const html = `<div class="pf-letter">
    <p>I'm <b>Pukking</b>. I make games in JavaScript and Three.js: pixel art, 2D, 3D and Minecraft mods.</p>
    <ul><li>Art, animation and gameplay</li><li>Custom mechanics and features</li><li>Minecraft mods</li><li>Low prices</li></ul>
    <p>Already have a game? I can add features to it. Bigger additions cost extra.</p>
    <div class="pf-links">${links.join('')}</div>
  </div>`;
  openPaper({ kind: 'mail', title: 'Hire me', html, width: 470, sfx });
}

// ------------------------------------------------------------------ keys
function setupKeys() {
  window.addEventListener('keydown', (e) => {
        if (e.key === 'm' || e.key === 'M') { audio.unlock(); audio.toggleMute(); paintSound(); return; }
  }, true);
}

boot().catch((e) => { console.error(e); showFallback('startup error'); });
