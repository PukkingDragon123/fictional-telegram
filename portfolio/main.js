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

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* optional */ } };

const state = { mode: 'loading', done: new Set(), night: false, bubbleT: 0, quip: 0, media: null, idleGag: 8 };
try { for (const id of JSON.parse(localStorage.getItem('pukking.done') || '[]')) state.done.add(id); } catch { /* storage unavailable */ }
const saveDone = () => { try { localStorage.setItem('pukking.done', JSON.stringify([...state.done])); } catch { /* ignore */ } };

let pr = null, game = null, room = null;
let rootEl, pinEls = [], bubbleEl, ctaEl, expandEl, soundBtn, tagsEl;

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
    room = new PortfolioRoom(game, { media: MEDIA, hooks: { onLink: showLink, onContact: openContact, onChapterStart: () => {} } });
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

  const first = params.get('chapter');
  if (first && CHAPTER_BY_ID[first]) { setMode('idle'); startChapter(first); }
  else if (params.get('idle') === '1') { setMode('idle'); drawIdleBoard(); }
  else { drawIdleBoard(); showTitle(); }
  refreshSchedule();

  window.__pf = { room, pr, state, startChapter, openContact, openMedia, setMode, say, CHAPTERS, MEDIA, pins: pinEls };
}

// ------------------------------------------------------------------ UI
function buildUI() {
  rootEl = document.getElementById('pf-root');

  // HUD: badge (idle), end-lesson (lesson), sound
  const hud = el('div', 'pf-hud');
  hud.innerHTML = `
    <button class="pf-wood pf-end" type="button" aria-label="End lesson">${iconImg('close', 2)}<span>END LESSON</span></button>
    <a class="pf-wood pf-badge" href="${esc(SITE.contact.itch)}" target="_blank" rel="noopener" title="Pukking on itch.io">${iconImg('fox', 3)}<span><b>PUKKING</b><i>${esc(SITE.tagline)}</i></span></a>
    <button class="pf-wood pf-sound" type="button" aria-label="Toggle sound"></button>`;
  rootEl.appendChild(hud);
  hud.querySelector('.pf-end').addEventListener('click', () => { sfx('click'); room.skip(); });
  soundBtn = hud.querySelector('.pf-sound');
  soundBtn.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); paintSound(); sfx('click'); });
  paintSound();

  // class schedule
  const sched = el('div', 'pf-schedule', '<div class="pf-sched-label">CLASS SCHEDULE</div><div class="pf-tags"></div>');
  tagsEl = sched.querySelector('.pf-tags');
  CHAPTERS.forEach((c, i) => {
    const b = el('button', 'pf-tag');
    b.type = 'button'; b.dataset.id = c.id;
    b.style.setProperty('--r', `${(i % 2 ? 1 : -1) * (0.8 + ((i * 0.37) % 1.3))}deg`);
    b.style.backgroundImage = `url(${paperTexture('kraft', 142, 70, { seed: 5 + i * 7, edge: 1 })})`;
    b.innerHTML = `<span class="n">LESSON ${c.number}</span><b>${esc(c.short)}</b><i>${esc(c.blurb)}</i><span class="star">${iconImg('star', 2)}</span>`;
    b.setAttribute('aria-label', `Lesson ${c.number}: ${c.title}`);
    b.addEventListener('click', () => { sfx('click'); startChapter(c.id); });
    b.addEventListener('pointerenter', () => sfx('hover', { volume: 0.4 }));
    tagsEl.appendChild(b);
  });
  rootEl.appendChild(sched);

  // pins: the clickable things in the room
  const pinsHost = el('div', 'pf-pins');
  const mk = (id, icon, label, pos, onClick) => {
    const b = el('button', 'pf-pin');
    b.type = 'button'; b.dataset.pin = id;
    b.setAttribute('aria-label', label);
    b.innerHTML = `<span>${iconImg(icon, 3)}</span><i class="lbl">${esc(label)}</i>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); onClick(); });
    pinsHost.appendChild(b);
    const p = { id, el: b, pos, icon };
    pinEls.push(p);
    return p;
  };
  mk('fox', 'fox', 'SAY HI', (out) => room.fox.headTop(out).add(_foxPin), sayHi);
  mk('bell', 'bell', 'RING THE BELL', new THREE.Vector3(3.5, 0.98, -2.2), ringBell);
  mk('window', 'sun', 'CHANGE THE TIME', new THREE.Vector3(-3.78, 1.9, -2.8), toggleNight);
  mk('bowls', 'fish', 'WAVE AT THE CLASS', (out) => out.copy(room.room.students.list[1].world).add(_up2), waveClass);
  mk('globe', 'globe', 'GAMES ON ITCH.IO', new THREE.Vector3(3.8, 1.58, -2.55), () => window.open(LINKS.itch, '_blank', 'noopener'));
  rootEl.appendChild(pinsHost);

  bubbleEl = el('div', 'pf-bubble');
  rootEl.appendChild(bubbleEl);

  const actions = el('div', 'pf-actions');
  ctaEl = el('a', 'pf-cta');
  ctaEl.target = '_blank'; ctaEl.rel = 'noopener';
  expandEl = el('button', 'pf-wood pf-expand', `${iconImg('expand', 2)}<span>WATCH BIGGER</span>`);
  expandEl.type = 'button';
  expandEl.setAttribute('aria-label', 'Watch bigger');
  expandEl.addEventListener('click', () => { sfx('click'); if (room.screen?.def) openMedia(room.screen.def); });
  actions.append(ctaEl, expandEl);
  rootEl.appendChild(actions);
}
const _foxPin = new THREE.Vector3(-0.55, 0.3, 0.1), _up = new THREE.Vector3(0, 0.22, 0), _up2 = new THREE.Vector3(0, 0.55, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3();

function paintSound() {
  const off = audio.isMuted();
  soundBtn.innerHTML = iconImg(off ? 'speakerOff' : 'speaker', 3);
  soundBtn.setAttribute('aria-pressed', String(!off));
}

function refreshSchedule() {
  let next = null;
  for (const c of CHAPTERS) if (!state.done.has(c.id)) { next = c.id; break; }
  for (const b of tagsEl.children) {
    b.classList.toggle('done', state.done.has(b.dataset.id));
    b.classList.toggle('next', b.dataset.id === next && state.done.size > 0);
  }
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
  const pill = el('div', 'pf-pill', esc(SITE.pill));
  q('.tm-sign').after(pill);
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
  setMode('chapter');
  const res = await room.runChapter(script);
  setMode('idle');
  if (res.completed) { state.done.add(id); saveDone(); }
  refreshSchedule();
  drawIdleBoard();
  state.idleGag = 6;
}

function showLink(l) {
  if (!l) { ctaEl.classList.remove('on'); return; }
  ctaEl.href = l.href;
  ctaEl.innerHTML = `${iconImg('play', 2)}<span>${esc(l.label)}</span>`;
  ctaEl.classList.remove('on'); void ctaEl.offsetWidth; ctaEl.classList.add('on');
  sfx('class_pop', { volume: 0.3, pitch: 1.4 });
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
  say('Commission?! I mean... **hello!** Let me find my pen.', 'greedy', 2200);
  setTimeout(() => { if (state.mode === 'idle') openContact(); }, 900);
}
function toggleNight() {
  state.night = !state.night;
  room.room.setNight(state.night);
  audio.setMusic(state.night ? 'night' : 'morning');
  const p = pinEls.find((x) => x.id === 'window');
  p.el.querySelector('span').innerHTML = iconImg(state.night ? 'moon' : 'sun', 3);
  say(state.night ? 'Lights out! Very cozy.' : 'Rise and shine!', state.night ? 'sleepy' : 'happy', 2200);
}
function waveClass() {
  room.room.students.setSleepy(false);
  room.room.students.react('cheer');
  sfx('class_cheer', { volume: 0.5 });
  say('Class, say hi to our visitor!', 'happy', 2200);
}

// ------------------------------------------------------------------ per-frame UI
function tickUI(dt) {
  const idle = state.mode === 'idle';
  const cam = room.rig.camera;
  const W = window.innerWidth, H = window.innerHeight;
  if (idle) {
    for (const p of pinEls) {
      const w = typeof p.pos === 'function' ? p.pos(_w) : p.pos;
      _v.copy(w).project(cam);
      const px = Math.max(30, Math.min(W - 30, (_v.x * 0.5 + 0.5) * W));
      const py = Math.max(64, Math.min(H - 64, (-_v.y * 0.5 + 0.5) * H));
      p.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    }
  }
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
  const showExpand = state.mode === 'chapter' && room.screen?.on && room.screen.k > 0.9;
  if (showExpand !== expandEl.classList.contains('on')) expandEl.classList.toggle('on', showExpand);
}

// ------------------------------------------------------------------ media viewer
function openMedia(def) {
  if (state.media || !def) return;
  const wrap = el('div', 'pf-media');
  const view = def.type === 'video'
    ? `<video controls autoplay muted loop playsinline poster="${esc(def.poster || '')}">${def.sources.map(([s, t]) => `<source src="${esc(s)}" type="${esc(t)}">`).join('')}</video>`
    : `<img src="${esc(def.src)}" alt="${esc(def.caption || '')}" class="${def.bg === 'auto' ? 'pix' : ''}">`;
  wrap.innerHTML = `<div class="pf-media-box" role="dialog" aria-modal="true" aria-label="${esc(def.caption || 'Media')}">
    <button class="pf-wood pf-media-x" type="button" aria-label="Close">${iconImg('close', 2)}</button>
    <div class="pf-media-view">${view}</div>
    <div class="pf-media-bar"><h3>${esc(def.caption || '')}<i>${esc(def.sub || '')}</i></h3>${def.href ? `<a class="pf-link-btn" href="${esc(def.href)}" target="_blank" rel="noopener">${iconImg('play', 2)}<span>PLAY ON ITCH.IO</span></a>` : ''}</div>
  </div>`;
  document.body.appendChild(wrap);
  state.media = wrap;
  sfx('class_whoosh', { volume: 0.4 });
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) closeMedia(); });
  wrap.querySelector('.pf-media-x').addEventListener('click', closeMedia);
  const v = wrap.querySelector('video');
  if (v) { const p = v.play(); if (p?.catch) p.catch(() => {}); }
}
function closeMedia() {
  if (!state.media) return;
  state.media.remove();
  state.media = null;
}

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
    <p>Hi, I'm <b>Pukking</b>, a professional game developer specializing in <b>JavaScript &amp; Three.js</b>. I build polished, unique games with pixel art, cozy vibes, 2D/3D experiences and Minecraft mods.</p>
    <ul><li>Polished art, animations &amp; gameplay</li><li>Custom mechanics, features &amp; Minecraft mods</li><li>Affordable pricing</li></ul>
    <p>I can expand your game with additional features and custom systems depending on your needs. Larger additions may cost extra.</p>
    <div class="pf-links">${links.join('')}</div>
  </div>`;
  openPaper({ kind: 'mail', title: "Let's work together!", html, width: 470, sfx });
}

// ------------------------------------------------------------------ keys
function setupKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.media) { e.preventDefault(); e.stopImmediatePropagation(); closeMedia(); return; }
    if (state.media) return;
    if (e.key === 'm' || e.key === 'M') { audio.unlock(); audio.toggleMute(); paintSound(); return; }
    if (state.mode === 'idle' && !document.querySelector('.pp-ov') && /^[1-9]$/.test(e.key)) {
      const c = CHAPTERS[+e.key - 1];
      if (c) startChapter(c.id);
    }
  }, true);
}

boot().catch((e) => { console.error(e); showFallback('startup error'); });
