import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import './ui/style.css';
import { Game } from './game/Game.js';
import { UI } from './ui/UI.js';
import { Input } from './game/Input.js';
import { Ghost } from './game/Ghost.js';
import { Cinematic } from './game/Cinematic.js';
import { LabMode } from './game/LabMode.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
try {
  const px = localStorage.getItem('tbme.px');
  if (px) game.renderer.pixelDensity = +px;
} catch { /* storage unavailable */ }
const ui = new UI(game);
game.ui = ui;
game.input = new Input(game, canvas);
game.ghost = new Ghost(game);
game.cine = new Cinematic(game);
game.lab = new LabMode(game);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  game.renderer.resize(window.innerWidth, window.innerHeight, dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
game.resize = resize;
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---- title screen backdrop: golden hour, a few fish, slow camera drift
let mode = 'title';
game.state.hour = 17.4;
for (let i = 0; i < 10; i++) {
  const p = game.fish.randomWaterPoint();
  if (p) game.fish.spawn(['bluegill', 'perch', 'brook', 'sockeye', 'aurora'][i % 5], p.x, p.z, { adult: true });
}
game.rig.wupp = game.rig.wuppGoal = 0.042;
game.rig.lookAt(68, 34, true);
let titleT = 0;
window.addEventListener('pointerdown', () => { if (mode === 'title') { game.audio.unlock(); game.audio.setMusic('title'); } }, { once: true });

document.body.classList.add('at-title');
const params = new URLSearchParams(location.search);
// cozy title scene (Reynard + the Daisy Beer deer + ducks) and its paper menu
const titleMods = import.meta.glob(['./game/TitleScene.js', './ui/TitleMenu.js'], { eager: true });
const TitleScene = titleMods['./game/TitleScene.js']?.TitleScene;
const showTitleMenu = titleMods['./ui/TitleMenu.js']?.showTitleMenu;
let titleScene = null, titleMenu = null;
if (TitleScene && !params.has('autostart')) {
  try { titleScene = new TitleScene(game); titleScene.start(); game.titleMode = true; } catch (e) { console.warn('TitleScene failed', e); titleScene = null; }
}
const startGame = (choice) => {
  mode = 'play';
  try { titleScene?.stop(); } catch (e) { console.warn(e); }
  titleScene = null;
  game.titleMode = false;
  titleMenu?.close?.();
  titleMenu = null;
  document.body.classList.remove('at-title');
  let loaded = false;
  if (choice === 'continue') loaded = game.load();
  if (!loaded) {
    if (params.has('notut')) game.skipTutorial = true;
    game.newGame();
    game.rig.wuppGoal = 0.04;
    game.rig.lookAt(68.5, 36);
    if (!params.has('notut')) ui.startTutorialIfNew();
    else ui.refreshUnlocks();
  } else {
    if (!game.state.tutorialDone && !game.skipTutorial) game.skipTutorial = true;
    ui.refreshUnlocks();
    setTimeout(() => ui.notify(`Welcome back! Day ${game.state.day}`, 'happy'), 800);
  }
  game.running = true;
};
if (params.has('autostart')) { document.getElementById('title-root').innerHTML = ''; startGame(params.get('autostart') === 'continue' ? 'continue' : 'new'); }
else if (showTitleMenu) {
  try {
    titleMenu = showTitleMenu(document.getElementById('title-root'), {
      hasSave: game.hasSave(), onStart: startGame,
      sfx: (n, o) => game.audio.play(n, { volume: 0.4, ...(o || {}) }),
      icon: (n, sc) => ui.icon(n, sc),
      onSound: (on) => game.audio.setMuted(!on),
      isMuted: () => game.audio.isMuted(),
    });
  } catch (e) { console.warn('TitleMenu failed', e); ui.showTitle(startGame); }
} else ui.showTitle(startGame);

// ---- adaptive quality: if the device struggles, cheapen shadows
const perf = { t: 0, frames: 0, level: 0, checks: 0 };
function adaptQuality(dt) {
  perf.t += dt;
  perf.frames++;
  if (perf.t < 4) return;
  const fps = perf.frames / perf.t;
  perf.t = 0; perf.frames = 0; perf.checks++;
  if (perf.checks < 2 || navigator.webdriver) return; // skip the shader-compile warmup and automated tests
  if (fps < 38 && perf.level === 0) {
    perf.level = 1;
    game.sky.sun.shadow.mapSize.set(1024, 1024);
    game.sky.sun.shadow.map?.dispose();
    game.sky.sun.shadow.map = null;
    game.world.decoGroup.children.forEach((m) => { m.castShadow = false; });
  } else if (fps < 24 && perf.level === 1) {
    perf.level = 2;
    game.renderer.renderer.shadowMap.enabled = false;
    game.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
}

// ---- warm caches while the title screen is up, in small idle chunks, so
// nothing is built for the first time mid-game (bear meshes, sprite images)
Promise.all([import('./entities/bearRig.js'), import('./data/bears.js'), import('./ui/sprites.js')]).then(([bm, bd, sp]) => {
  const jobs = [];
  for (const id of Object.keys(bd.BEAR_TYPES)) jobs.push(() => bm.bearRigGeometry(id, bd.BEAR_TYPES[id]));
  for (const name of Object.keys(sp.SPRITES)) {
    if (name.startsWith('fox_')) continue;
    jobs.push(() => { sp.spriteURL(name, 1); sp.spriteURL(name, 2); });
  }
  for (const e of sp.FOX_EXPRESSIONS) jobs.push(() => { sp.foxPortraitURL(e, 2); sp.foxPortraitURL(e, 3); });
  // 3D-rendered panel icons (fish, buildings, bears)
  import('./data/species.js').then(({ SPECIES }) => { for (const s2 of SPECIES) jobs.push(() => ui.icons.fish(s2)); });
  import('./data/structures.js').then(({ STRUCTURES }) => { for (const t of Object.keys(STRUCTURES)) jobs.push(() => ui.icons.structure(t, game.structures)); });
  for (const id of Object.keys(bd.BEAR_TYPES)) jobs.push(() => ui.icons.bear(id));
  const next = () => {
    const t0 = performance.now();
    while (jobs.length && performance.now() - t0 < 8) jobs.shift()();
    window.__warmLeft = jobs.length;
    if (jobs.length) setTimeout(next, 16);
  };
  setTimeout(next, 300);
});

// ---- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  adaptQuality(dt);
  if (mode === 'title') {
    titleT += dt;
    game.state.phase = 'day';
    if (titleScene) titleScene.update(dt);
    else {
      game.rig.goal.x = 68 + Math.sin(titleT * 0.07) * 5;
      game.rig.goal.z = 34 + Math.cos(titleT * 0.05) * 2;
      game.state.hour = 17.4 + Math.sin(titleT * 0.05) * 0.4;
    }
    if (!titleScene) game.fish.update(dt);
    game.structures.update(dt);
    game.food.update(dt);
    game.fox.update(dt);
    game.ambient.update(dt);
    game.particles.update(dt);
    game.time += dt;
  } else {
    game.update(dt);
    game.input.updateKeys(dt);
    ui.update(dt);
  }
  game.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug handles (handy for testing in the console)
window.__game = game;
import('./data/research.js').then((m) => { window.__data = m; });
window.__step = (sec, dt = 0.05) => {
  for (let t = 0; t < sec; t += dt) { game.update(dt); ui.update(dt); }
  return { hour: +game.state.hour.toFixed(2), phase: game.state.phase, coins: game.state.coins, fish: game.fish.count, bears: game.bears.list.length, rating: +game.state.rating.toFixed(2) };
};
