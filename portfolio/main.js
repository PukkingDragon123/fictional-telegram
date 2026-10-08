// Pukking's portfolio: boots the game's pixel renderer, opens with the voxel intro
// (VoxelIntro.js: who I am, where I'm from, what I make, my goals), then builds the
// classroom (PortfolioRoom.js) and adds the page UI around it: class schedule, floating
// voxel icons over the clickable things (Icons3D.js), voxel bursts and dust (VoxelFX.js),
// speech bubble, link tag, media viewer and the "hire me" letter.
//
// Dev helpers: ?chapter=games jumps straight into a chapter, ?idle=1 skips the intro,
// ?intro=0 shows the old title sign instead, ?debug=1 shows renderer info;
// window.__pf exposes the room and helpers for the console / tests.
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
import { SITE, LINKS, MEDIA, CHAPTERS, CHAPTER_BY_ID, QUIPS, IDLE_BOARD, INTRO } from './content.js';
import { Transition } from '../src/ui/Transition.js';
import { VoxelIntro } from './VoxelIntro.js';
import { VoxelFX, RAINBOW } from './VoxelFX.js';
import { Icons3D } from './Icons3D.js';
import { ICONS, PAL } from './icons.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* optional */ } };

const state = { mode: 'loading', done: new Set(), night: false, bubbleT: 0, quip: 0, media: null, idleGag: 8 };
try { for (const id of JSON.parse(localStorage.getItem('pukking.done') || '[]')) state.done.add(id); } catch { /* storage unavailable */ }
const saveDone = () => { try { localStorage.setItem('pukking.done', JSON.stringify([...state.done])); } catch { /* ignore */ } };

let pr = null, game = null, room = null, intro = null, fx = null, icons = null, scene = 'class';
let rootEl, pinEls = [], bubbleEl, ctaEl, expandEl, soundBtn, tagsEl, introEl = null;
const trans = new Transition();

// the colours an icon is painted in (its voxel bursts use them)
const iconColors = (name) => {
  const set = new Set();
  try { for (const row of ICONS[name]()) for (const ch of row) if (PAL[ch] && ch !== 'k') set.add(PAL[ch]); } catch { /* unknown icon */ }
  return set.size ? [...set] : RAINBOW;
};

function setMode(m) {
  state.mode = m;
  document.body.classList.remove('pf-title', 'pf-idle', 'pf-chapter', 'pf-loading', 'pf-intro');
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
    room?.refitCamera(); intro?.refit();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  await nextFrame(); await nextFrame();
  try { await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* ignore */ }

  try {
    room = new PortfolioRoom(game, { media: MEDIA, hooks: { onLink: showLink, onContact: openContact, onChapterStart: () => {} } });
    room.start();
    fx = new VoxelFX(room.room.group);
    icons = new Icons3D(room.room.group);
    document.body.classList.add('pf-vox'); // the 3D icons replace the flat pin squares
    intro = new VoxelIntro(game, { steps: INTRO, sfx });
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
    try {
      audio.update?.(dt);
      if (scene === 'intro') { intro.update(dt); pr.render(intro.scene, intro.rig); }
      else { room.update(dt); fx.update(dt); pr.render(room.scene, room.rig); }
      frames++;
    } catch (e) { report(e); }
    try { tickUI(dt); } catch (e) { report(e); }
    if (debug) showDebug();
    requestAnimationFrame(frame); // never stop the loop because of one bad frame
  };
  requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); report(new Error('The browser lost the WebGL context (GPU reset). Reload the page.')); });
  canvas.addEventListener('pointerdown', popFloor);

  const first = params.get('chapter');
  if (first && CHAPTER_BY_ID[first]) { setMode('idle'); startChapter(first); }
  else if (params.get('idle') === '1') { setMode('idle'); drawIdleBoard(); }
  else if (params.get('intro') === '0') { drawIdleBoard(); showTitle(); }
  else { drawIdleBoard(); startIntro(); }
  refreshSchedule();

  window.__pf = { room, pr, state, intro, fx, introGo: (i) => { intro.go(i); paintIntro(); }, finishIntro, startChapter, openContact, openMedia, setMode, say, CHAPTERS, MEDIA, pins: pinEls };
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
    const p = { id, el: b, pos, icon, colors: iconColors(icon) };
    b.addEventListener('click', (e) => {
      e.stopPropagation(); audio.unlock();
      fx.burst(typeof pos === 'function' ? pos(new THREE.Vector3()) : pos, { colors: p.colors, n: 26 });
      sfx('pop_in', { volume: 0.35, pitch: 1.1 + Math.random() * 0.2 });
      onClick();
    });
    pinsHost.appendChild(b);
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

// ------------------------------------------------------------------ voxel intro: introduction + goals
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
function startIntro() {
  state.fogWas = pr.postMat.uniforms.fogOn.value;
  pr.setFogEnabled(false); // the game's fog would grey out the intro's night sky
  state.hazeWas = pr.postMat.uniforms.haze.value;
  pr.postMat.uniforms.haze.value = 0; // and so would the tilt-shift haze at the screen edges
  scene = 'intro';
  setMode('intro');
  intro.start();
  introEl = el('div', 'pf-intro');
  introEl.innerHTML = `<div class="pf-ic"><div class="pf-ic-in"></div>
    <div class="pf-ic-nav"><button type="button" class="pf-ic-back">Back</button><div class="pf-ic-dots"></div><button type="button" class="pf-wood pf-ic-next">Next</button></div></div>
    <button type="button" class="pf-ic-skip">Skip intro</button><div class="pf-ic-hint">click the blocks</div>`;
  document.body.appendChild(introEl);
  const q = (c) => introEl.querySelector(c);
  q('.pf-ic-dots').innerHTML = INTRO.map((_, i) => `<i data-i="${i}"></i>`).join('');
  const first = () => { if (!state.audioOn) { state.audioOn = true; audio.unlock(); audio.setMusic('title'); } };
  q('.pf-ic-next').addEventListener('click', () => { first(); sfx('click'); if (intro.step >= INTRO.length - 1) finishIntro(); else { intro.next(); paintIntro(); } });
  q('.pf-ic-back').addEventListener('click', () => { first(); sfx('click'); intro.prev(); paintIntro(); });
  q('.pf-ic-skip').addEventListener('click', () => { first(); sfx('click'); finishIntro(); });
  q('.pf-ic-dots').addEventListener('click', (e) => { const i = e.target.dataset?.i; if (i != null) { first(); sfx('click'); intro.go(+i); paintIntro(); } });
  introEl.addEventListener('pointerdown', (e) => { if (!e.target.closest('.pf-ic, button')) { first(); intro.poke(); } });
  introEl.addEventListener('pointermove', (e) => intro.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
  window.addEventListener('keydown', introKeys);
  paintIntro();
}
function introKeys(e) {
  if (state.mode !== 'intro' || !introEl) return;
  if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); introEl.querySelector('.pf-ic-next').click(); }
  else if (e.key === 'ArrowLeft') introEl.querySelector('.pf-ic-back').click();
  else if (e.key === 'Escape') introEl.querySelector('.pf-ic-skip').click();
}
function paintIntro() {
  const s = INTRO[intro.step], q = (c) => introEl.querySelector(c);
  const inner = q('.pf-ic-in');
  inner.classList.remove('in'); void inner.offsetWidth; inner.classList.add('in');
  inner.innerHTML = `<div class="pf-ic-kick">${esc(s.kicker || '')}</div><h1>${md(s.title)}</h1>`
    + (s.body ? `<p>${md(s.body)}</p>` : '')
    + (s.list ? `<ul>${s.list.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : '');
  q('.pf-ic-next').textContent = s.cta || (intro.step === 0 ? 'Start the tour' : 'Next');
  q('.pf-ic-back').style.visibility = intro.step > 0 ? 'visible' : 'hidden';
  introEl.querySelectorAll('.pf-ic-dots i').forEach((d, i) => d.classList.toggle('on', i === intro.step));
  introEl.classList.toggle('last', intro.step === INTRO.length - 1);
}
async function finishIntro() {
  if (state.mode !== 'intro') return;
  window.removeEventListener('keydown', introKeys);
  setMode('loading');
  intro.poke(2.2);
  await trans.wipe('blocks', () => {
    introEl?.remove(); introEl = null;
    scene = 'class';
    pr.postMat.uniforms.fogOn.value = state.fogWas ?? 0;
    pr.postMat.uniforms.haze.value = state.hazeWas;
    audio.unlock();
    audio.setMusic(state.night ? 'night' : 'morning');
    setMode('idle');
  });
  // welcome: the fox waves, voxel confetti, and a pointer to the lessons
  room.fox.play(room._anim('wave_hello', 'wave'), { loop: false, onDone: () => room._idle() });
  room.fox.headTop(_w); fx.confetti(_w.add(_up), 50);
  sfx('class_cheer', { volume: 0.4 });
  say(state.done.size ? 'Welcome back! Pick a **lesson** below.' : 'Welcome to class! Pick a **lesson** below, or click around the room.', 'happy', 4200);
}

// click the floor: a little pop of floorboard voxels where you clicked
const _ray = new THREE.Raycaster(), _floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3(), _ndc = new THREE.Vector2();
const FLOOR_COLORS = ['#c98c4e', '#bd8046', '#d29656', '#e6a81c', '#ffe27a'];
function popFloor(e) {
  if (state.mode !== 'idle' || scene !== 'class' || state.media || document.querySelector('.pp-ov')) return;
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, room.rig.camera);
  if (!_ray.ray.intersectPlane(_floor, _hit) || Math.abs(_hit.x) > 4.4 || _hit.z < -2.7 || _hit.z > 2.4) return;
  audio.unlock();
  fx.burst(_hit.setY(0.06), { colors: FLOOR_COLORS, n: 16, speed: 1.1, up: 1.8, size: [1, 2], life: [1.0, 1.6] });
  sfx('pop_in', { volume: 0.25, pitch: 1.3 + Math.random() * 0.3 });
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
  if (res.completed) {
    state.done.add(id); saveDone();
    room.fox.headTop(_w); fx.confetti(_w.add(_up)); // voxel confetti for a finished lesson
  }
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
  p.icon = state.night ? 'moon' : 'sun'; p.colors = iconColors(p.icon);
  icons.mat.emissive.setHex(state.night ? 0x9a8670 : 0x5a4630); // the icons glow a little after dark
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
    const spots = [];
    for (const p of pinEls) {
      const w = typeof p.pos === 'function' ? p.pos(_w) : p.pos;
      spots.push({ icon: p.icon, p: w.clone(), iy: -0.12 });
      _v.copy(w).project(cam);
      const px = Math.max(30, Math.min(W - 30, (_v.x * 0.5 + 0.5) * W));
      const py = Math.max(64, Math.min(H - 64, (-_v.y * 0.5 + 0.5) * H));
      p.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    }
    icons.sync(spots, dt);
  } else icons?.hideAll();
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

// ------------------------------------------------------------------ errors + ?debug=1
const debug = params.get('debug') === '1';
let frames = 0, errBox = null, lastErr = '';
function report(e) {
  const msg = String(e?.stack || e?.message || e).split('\n').slice(0, 4).join('\n');
  if (msg === lastErr) return;
  lastErr = msg;
  console.error(e);
  if (!errBox) { errBox = el('pre', 'pf-err'); document.body.appendChild(errBox); }
  errBox.textContent = 'Something went wrong (screenshot this):\n' + msg;
}
window.addEventListener('error', (ev) => report(ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => report(ev.reason));
function showDebug() {
  if (!errBox) { errBox = el('pre', 'pf-err'); document.body.appendChild(errBox); }
  if (frames % 30) return;
  let gl = '';
  try { const c = pr.renderer.getContext(), x = c.getExtension('WEBGL_debug_renderer_info'); gl = x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); } catch { /* ignore */ }
  errBox.textContent = `debug: scene=${scene} mode=${state.mode} frames=${frames}\nsize=${innerWidth}x${innerHeight} dpr=${devicePixelRatio} low=${pr.lowW}x${pr.lowH}\ngl=${gl}\n${lastErr}`;
}

boot().catch((e) => { console.error(e); report(e); showFallback('startup error'); });
