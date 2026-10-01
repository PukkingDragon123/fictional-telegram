// Title screen preview: builds the real Game + UI like src/main.js, then runs
// TitleScene + TitleMenu. See title-preview.html for URL flags.
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/silkscreen/latin-400.css';
import '../src/ui/style.css';
import { Game } from '../src/game/Game.js';
import { UI } from '../src/ui/UI.js';
import { TitleScene } from '../src/game/TitleScene.js';
import { showTitleMenu } from '../src/ui/TitleMenu.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const game = new Game(canvas);
const ui = new UI(game);
game.ui = ui;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  game.renderer.resize(window.innerWidth, window.innerHeight, dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}
window.addEventListener('resize', resize);
resize();

for (let i = 0; i < 10; i++) {
  const p = game.fish.randomWaterPoint();
  if (p) game.fish.spawn(['bluegill', 'perch', 'brook', 'sockeye', 'aurora'][i % 5], p.x, p.z, { adult: true });
}

const title = new TitleScene(game);
title.start();
document.body.classList.add('at-title');

let menu = null;
if (params.get('menu') !== '0') {
  menu = showTitleMenu(document.getElementById('title-root') || document.body, {
    hasSave: params.has('save') || game.hasSave(),
    onStart: (choice) => {
      console.log('start', choice);
      title.stop();
      document.body.classList.remove('at-title');
      game.newGame();
      game.running = true;
      mode = 'play';
    },
    sfx: (name, o) => game.audio.play(name, o),
    onSound: (on) => { game.audio.unlock(); game.audio.setMuted(!on); },
    isMuted: () => game.audio.isMuted(),
  });
}

let mode = 'title';
function tick(dt) {
  if (mode === 'title') {
    title.update(dt);
    // (fish are hidden while the title is up; skip their sim so no "discovered" popups fire)
    game.structures.update(dt);
    game.food.update(dt);
    game.fox.update(dt);
    game.ambient.update(dt);
    game.particles.update(dt);
    game.time += dt;
  } else {
    game.update(dt);
    ui.update(dt);
  }
}
window.__adv = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) { tick(dt); game.rig.update(dt, game.renderer); } return { T: +title.T.toFixed(2), gag: title.gag?.phase || null, fox: title.foxSt?.mode }; };
window.__render = () => game.render(1 / 30);
window.__title = title;
window.__game = game;
window.__menu = menu;
if (params.has('t')) window.__adv(+params.get('t'));

if (!params.has('manual')) {
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick(dt);
    game.render(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} else {
  game.render(1 / 30); game.render(1 / 30);
}
