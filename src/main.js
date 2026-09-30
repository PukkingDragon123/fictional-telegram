import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import './ui/style.css';
import { Game } from './game/Game.js';
import { UI } from './ui/UI.js';
import { Input } from './game/Input.js';
import { Ghost } from './game/Ghost.js';

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
game.rig.wupp = game.rig.wuppGoal = 0.05;
game.rig.lookAt(28, 34, true);
let titleT = 0;
window.addEventListener('pointerdown', () => { if (mode === 'title') { game.audio.unlock(); game.audio.setMusic('title'); } }, { once: true });

document.body.classList.add('at-title');
const params = new URLSearchParams(location.search);
const startGame = (choice) => {
  mode = 'play';
  document.body.classList.remove('at-title');
  let loaded = false;
  if (choice === 'continue') loaded = game.load();
  if (!loaded) {
    game.newGame();
    game.rig.wuppGoal = 0.055;
    game.rig.lookAt(28.5, 36);
    if (!params.has('notut')) setTimeout(() => ui.tutorialStep(0), 600);
  } else {
    ui.toast(`Welcome back! Day ${game.state.day}`, 'good');
  }
  game.running = true;
};
if (params.has('autostart')) { document.getElementById('title-root').innerHTML = ''; startGame(params.get('autostart') === 'continue' ? 'continue' : 'new'); }
else ui.showTitle(startGame);

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

// ---- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  adaptQuality(dt);
  if (mode === 'title') {
    titleT += dt;
    game.rig.goal.x = 28 + Math.sin(titleT * 0.07) * 5;
    game.rig.goal.z = 34 + Math.cos(titleT * 0.05) * 2;
    game.state.phase = 'day';
    game.state.hour = 17.4 + Math.sin(titleT * 0.05) * 0.4;
    game.fish.update(dt);
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
