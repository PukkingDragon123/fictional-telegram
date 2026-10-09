import './ui/fonts.css'; // TBME Goofy, the game font (everything uses it)
import './ui/style.css';
import audio from './game/audioProxy.js';
import { PixelRenderer } from './core/pixelRenderer.js';

// Startup (v26): no loading screen. index.html paints the title's first frame
// inline before any module loads; this file starts the live title right away on
// the shared renderer (src/game/title/TitleWorld.js, its menu src/ui/TitleMenu.js)
// and builds the game in the background once the intro has settled. The game is
// handed the same PixelRenderer (one WebGL context, shaders compiled once).
//   ?autostart=new | continue   straight into the game (tests), &notut=1 skips the tutorial
//   ?title=pond                 the old pond diorama (src/game/TitleScene.js; tools/promo needs it)
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const autostart = params.has('autostart') ? (params.get('autostart') === 'continue' ? 'continue' : 'new') : null;
const pondTitle = !autostart && params.get('title') === 'pond';
const SAVE_KEY = 'tbme.save.v3';

const renderer = new PixelRenderer(canvas);
try {
  const px = localStorage.getItem('tbme.px');
  if (px) renderer.pixelDensity = +px;
} catch { /* storage unavailable */ }

let game = null, ui = null, titleWorld = null, titleScene = null, titleMenu = null;
let mode = autostart ? 'boot' : pondTitle ? 'boot' : 'title';

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  titleWorld?.resize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// a frame for the browser to breathe between the big build steps
const breathe = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---- the game, built while the title runs
let gameP = null;
function bootGame() {
  if (gameP) return gameP;
  gameP = (async () => {
    const [{ Game }, { UI }, { Input }, { Ghost }, { Cinematic }, { LabMode }, nature] = await Promise.all([
      import('./game/Game.js'), import('./ui/UI.js'), import('./game/Input.js'), import('./game/Ghost.js'),
      import('./game/Cinematic.js'), import('./game/LabMode.js'), import('./art/natureArt.js'),
    ]);
    if (!autostart) { await breathe(); nature.buildNatureAtlas(); await breathe(); } // the world's sprites, in their own task
    game = new Game(canvas, { renderer });
    game.titleMode = !autostart;
    game.resize = resize;
    window.__game = game;
    if (!autostart) await breathe();
    ui = new UI(game);
    game.ui = ui;
    game.input = new Input(game, canvas);
    game.ghost = new Ghost(game);
    game.cine = new Cinematic(game);
    game.lab = new LabMode(game);
    import('./data/research.js').then((m) => { window.__data = m; });
    warmCaches();
    if (titleWorld) titleWorld.gameReady = true;
    return game;
  })();
  gameP.catch((e) => console.error('game boot failed', e));
  return gameP;
}

function startGame(choice) {
  mode = 'play';
  try { titleWorld?.stop(); } catch (e) { console.warn(e); }
  try { titleScene?.stop(); } catch (e) { console.warn(e); }
  titleWorld = null; titleScene = null;
  game.titleMode = false;
  titleMenu?.close?.();
  titleMenu = null;
  document.body.classList.remove('at-title');
  document.getElementById('tbme-paint')?.remove();
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
}

// pixel-block iris over the title; the game (ready or getting ready) starts behind it
let starting = false;
async function irisToGame(choice) {
  if (starting) return;
  starting = true;
  const { Transition } = await import('./ui/Transition.js');
  const T = ui?.trans || new Transition();
  let covered = false, ready = false, t1 = null;
  const inDur = 0.55, outDur = 0.7;
  const run = {
    draw: (ctx, W, H, t) => {
      let cover = Math.min(1, t / inDur);
      if (cover >= 1) covered = true;
      if (ready) { t1 ??= t; cover = 1 - (t - t1) / outDur; }
      T.blocks(ctx, W, H, 'iris', Math.max(0, cover) * 1.15, '#1a1420');
      if (ready && cover <= 0) run.done = true;
    },
  };
  T.start(run);
  await bootGame();
  while (!covered) await breathe();
  try { startGame(choice); } catch (e) { console.error(e); }
  await breathe();
  ready = true;
  setTimeout(() => { run.done = true; }, (outDur + 0.6) * 1000);
}

function saveInfo() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const m = /"day":(\d+)/.exec(raw.slice(0, 6000));
    return { day: m ? +m[1] : null };
  } catch { return null; }
}

function menuOpts(onStart) {
  const save = saveInfo();
  return {
    hasSave: !!save, saveDay: save?.day ?? null, onStart,
    sfx: (n, o) => audio.play(n, { volume: 0.4, ...(o || {}) }),
    onSound: (on) => { audio.unlock(); audio.setMuted(!on); },
    isMuted: () => audio.isMuted(),
  };
}

window.addEventListener('pointerdown', () => { if (mode === 'title' || mode === 'pond') { audio.unlock(); audio.setMusic('title'); } }, { once: true });

if (autostart) {
  bootGame().then(() => startGame(autostart));
} else if (pondTitle) {
  // the old pond diorama inside the game world (tools/promo/stage.js poses it)
  document.body.classList.add('at-title');
  document.getElementById('tbme-paint')?.remove();
  bootGame().then(async () => {
    const [{ TitleScene }, { showTitleMenu }] = await Promise.all([import('./game/TitleScene.js'), import('./ui/TitleMenu.js')]);
    game.state.hour = 17.4;
    for (let i = 0; i < 10; i++) {
      const p = game.fish.randomWaterPoint();
      if (p) game.fish.spawn(['bluegill', 'perch', 'brook', 'sockeye', 'aurora'][i % 5], p.x, p.z, { adult: true });
    }
    titleScene = new TitleScene(game);
    titleScene.start();
    mode = 'pond';
    titleMenu = showTitleMenu(document.body, menuOpts((c) => ui.wipeTransition('iris', () => startGame(c), { inDur: 0.55, hold: 0.25, outDur: 0.7 })));
  });
} else {
  document.body.classList.add('at-title');
  import('./ui/TitleMenu.js').then(({ showTitleMenu }) => {
    if (mode !== 'title') return;
    titleMenu = showTitleMenu(document.body, menuOpts((c) => irisToGame(c)));
  }).catch((e) => console.warn('TitleMenu failed', e));
  import('./game/title/TitleWorld.js').then(({ TitleWorld }) => {
    if (mode !== 'title') return;
    titleWorld = new TitleWorld(renderer, { paint: window.__tbmePaint, audio });
    titleWorld.onCalm = () => setTimeout(() => bootGame(), 60);
    titleWorld.start();
    if (game) titleWorld.gameReady = true;
  }).catch((e) => { console.warn('TitleWorld failed', e); bootGame(); });
  // whatever happens, the game gets built
  setTimeout(() => bootGame(), 9000);
}

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
function warmCaches() {
  Promise.all([import('./entities/bearRig.js'), import('./data/bears.js'), import('./ui/sprites.js')]).then(([bm, bd, sp]) => {
    const jobs = [];
    for (const id of Object.keys(bd.BEAR_TYPES)) jobs.push(() => bm.bearRigGeometry(id, bd.BEAR_TYPES[id]));
    for (const name of Object.keys(sp.SPRITES)) {
      if (name.startsWith('fox_')) continue;
      jobs.push(() => { sp.spriteURL(name, 1); sp.spriteURL(name, 2); });
    }
    for (const e of sp.FOX_EXPRESSIONS) jobs.push(() => { sp.foxPortraitURL(e, 2); sp.foxPortraitURL(e, 3); });
    import('./data/species.js').then(({ SPECIES }) => { for (const s2 of SPECIES) jobs.push(() => ui.icons.fish(s2)); });
    import('./data/structures.js').then(({ STRUCTURES }) => { for (const t of Object.keys(STRUCTURES)) jobs.push(() => ui.icons.structure(t, game.structures)); });
    for (const id of Object.keys(bd.BEAR_TYPES)) jobs.push(() => ui.icons.bear(id));
    const next = () => {
      if (mode === 'play' && !game?.running) return setTimeout(next, 200);
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < 6) jobs.shift()();
      window.__warmLeft = jobs.length;
      if (jobs.length) setTimeout(next, 24);
    };
    setTimeout(next, 600);
  });
}

// ---- main loop
let last = performance.now();
function frame(now) {
  // rAF stamps the frame start, which can be earlier than `last` after a long synchronous load
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  if (mode === 'play') {
    adaptQuality(dt);
    game.update(dt);
    game.input.updateKeys(dt);
    ui.update(dt);
    game.render(dt);
  } else if (mode === 'title') {
    if (titleWorld) { titleWorld.update(dt); titleWorld.render(); }
  } else if (mode === 'pond' && titleScene) {
    game.state.phase = 'day';
    titleScene.update(dt);
    game.structures.update(dt);
    game.food.update(dt);
    game.fox.update(dt);
    game.ambient.update(dt);
    game.particles.update(dt);
    game.time += dt;
    game.render(dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug handles (handy for testing in the console)
window.__step = (sec, dt = 0.05) => {
  for (let t = 0; t < sec; t += dt) { game.update(dt); ui.update(dt); }
  return { hour: +game.state.hour.toFixed(2), phase: game.state.phase, coins: game.state.coins, fish: game.fish.count, bears: game.bears.list.length, rating: +game.state.rating.toFixed(2) };
};
