// TeacherOverlay preview: a fake game UI (HUD, wooden toolbar, an e-Buy panel)
// and Professor Reynard giving a little lesson over it.
//   (default)          live: buttons for the full lesson and single moves
//   ?manual=1          no rAF loop: drive with window.__run(seconds) / __step(seconds) (screenshots)
//   ?scene=<name>      jump to a scene (see SCENES); with ?manual=1 it is stepped deterministically
//   ?shots=1           hide the controls
//   ?w=420             (with Playwright) any viewport works: phones too
import { TeacherOverlay } from '../src/ui/TeacherOverlay.js';
import audio from '../src/audio/audio.js';
import { spriteImg } from '../src/ui/sprites.js';
import { frameStyle } from '../src/ui/frames.js';
import { fishIconURL } from '../src/game/fishSprites.js';
import '../src/ui/fonts.css';

const params = new URLSearchParams(location.search);
const manual = params.has('manual');
if (params.has('shots')) document.body.classList.add('shots');
const $ = (s) => document.querySelector(s);
const logEl = $('#log');
const log = (s) => { logEl.textContent = s; };

// ---------------------------------------------------------------- fake game UI
const fs = (el, name) => { try { el.style.cssText += ';' + frameStyle(name, 2); } catch (e) { /* frames optional */ } };
const TOOLS = [['feed', 'food', 'tool'], ['hand', 'hand', 'tool'], ['tag', 'tag', 'tool'], ['nurture', 'nurture', 'tool'], ['ebuy', 'shop', 'panel'], ['build', 'hammer', 'panel'], ['lab', 'flask', 'panel'], ['dex', 'book', 'panel'], ['reviews', 'newspaper', 'panel']];
const tb = $('#toolbar');
fs(tb, 'wood');
for (const [k, icon, kind] of TOOLS) {
  const b = document.createElement('button');
  b.className = 'tool';
  b.dataset[kind] = k;
  fs(b, 'slot_gold');
  b.innerHTML = spriteImg(icon, 2);
  b.onclick = () => { log('clicked ' + k); b.classList.add('clicked'); setTimeout(() => b.classList.remove('clicked'), 200); };
  tb.appendChild(b);
}
fs($('#panel'), 'parchment');
fs($('#panelhead'), 'ribbon_green');
fs($('#coins'), 'plaque');
fs($('#buy'), 'button_green');
$('#coinico').innerHTML = spriteImg('coin', 2);
$('#menu').innerHTML = spriteImg('menu', 2);
try { $('#fishimg').innerHTML = `<img src="${fishIconURL('bluegill', { scale: 3 })}" style="image-rendering:pixelated">`; } catch (e) { /* optional */ }
$('#buy').onclick = () => log('bought!');
try { $('#egg').innerHTML = spriteImg('egg', 2); } catch (e) { /* optional */ }

// ---------------------------------------------------------------- the teacher
const t = new TeacherOverlay({ audio, autoUpdate: !manual });
window.t = t;

// an egg drifting in the "world" (a live target)
const egg = { x: 0, y: 0 };
let eggT = 0;
function moveEgg(dt) {
  eggT += dt;
  egg.x = innerWidth * 0.3 + Math.sin(eggT * 0.6) * 60;
  egg.y = innerHeight * 0.5 + Math.cos(eggT * 0.45) * 26;
  const e = $('#egg');
  e.style.left = egg.x - 17 + 'px';
  e.style.top = egg.y - 17 + 'px';
}
moveEgg(0);
const eggTarget = () => ({ x: egg.x, y: egg.y });

// stepping that lets promise chains run between steps (manual mode)
const tick = () => new Promise((r) => setTimeout(r, 0));
async function run(secs, dt = 1 / 30) {
  if (!manual) { await new Promise((r) => setTimeout(r, secs * 1000)); return; }
  const n = Math.round(secs / dt);
  for (let i = 0; i < n; i++) {
    t._skipRender = true;
    moveEgg(dt);
    t.update(dt);
    t._skipRender = false;
    await tick();
  }
  t.update(0);
}
// run until a promise resolves (or max seconds)
async function until(p, max = 12, dt = 1 / 30) {
  if (!manual) { await p; return; }
  let done = false;
  p.then(() => { done = true; });
  for (let i = 0; i < max / dt && !done; i++) {
    t._skipRender = true;
    moveEgg(dt);
    t.update(dt);
    t._skipRender = false;
    await tick();
  }
  t.update(0);
}
window.__run = run;
window.__until = until;
window.__step = (s, dt) => { t.step(s, dt); };
if (!manual) {
  let last = performance.now();
  const loop = (now) => { moveEgg(Math.min(0.1, (now - last) / 1000)); last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- lesson + scenes
async function lesson() {
  audio.unlock?.();
  await t.show();
  await t.goTo('tool:ebuy');
  t.circle('tool:ebuy');
  await t.say('This is <b>e-Buy</b>. Everything is for sale!', { wait: false, dur: 3.2 });
  await t.goTo('#buy');
  t.underline('#buy');
  await t.say('Tap <b>Buy It Now</b>. Two fish, please!', { wait: true, mood: 'happy' });
  t.tick('#buy');
  await t.goTo('#coins');
  t.circle('#coins');
  await t.say('Coins! Spend them wisely… on ME.', { wait: false, dur: 3, mood: 'smug' });
  t.arrow('#coins', 'tool:build');
  await t.goTo('tool:build');
  t.star('tool:build');
  await t.say('Then <b>build</b> a lodge for the beavers.', { wait: false, dur: 3 });
  await t.goTo(eggTarget);
  t.circle(eggTarget, { color: 'pink', pad: 6 });
  await t.say('An egg! Tap it when it wobbles.', { wait: false, dur: 3.4, mood: 'excited' });
  t.doodle('heart', eggTarget, { dy: -46 });
  await t.goTo('tool:tag');
  t.cross('tool:tag');
  await t.say('Tagged fish are <b>DO NOT EAT</b>.', { wait: false, dur: 3, mood: 'shout' });
  const stop = t.pulse('tool:lab');
  await t.goTo('tool:lab');
  await t.say('Class dismissed!', { wait: false, dur: 2, mood: 'happy' });
  stop();
  await t.hide();
}

const go = (target, o) => until(t.goTo(target, o));
const SCENES = {
  // he runs in from the left edge
  async run() { t.show({ from: 'left', greet: false }); await run(0.42); },
  // standing on the toolbar, pointing down at e-Buy
  async top() { await go('tool:ebuy'); await run(1.2); },
  // chalk circle mid-draw
  async circle() { await go('tool:ebuy'); await run(0.1); t.circle('tool:ebuy'); await run(0.32); },
  async circled() { await go('tool:ebuy'); t.circle('tool:ebuy'); await run(1.4); },
  // arrow from the Buy button to the build tool
  async arrow() { await go('#buy'); t.underline('#buy'); t.arrow('#buy', 'tool:build', { delay: 0.4 }); await run(1.6); },
  // speech bubble with the tap-to-continue arrow
  async bubble() { await go('tool:build'); t.say('Tap <b>Build</b>, then place the lodge in the water!', { wait: true }); await run(2.6); },
  // the coins plaque at the top: he stands below it and points up
  async hud() { await go('#coins'); t.circle('#coins'); t.say('Coins! Spend them wisely… on ME.', { wait: false, dur: 9, mood: 'smug' }); await run(2.2); },
  // following the drifting egg
  async egg() { await go(eggTarget); t.circle(eggTarget, { color: 'pink', pad: 6 }); t.doodle('heart', eggTarget, { dy: -46 }); await run(2.4); },
  // every doodle + marks
  async doodles() {
    await go('tool:lab');
    const W = innerWidth, H = innerHeight;
    const names = ['heart', 'fish', 'egg', 'sparkle', 'exclamation', 'question'];
    names.forEach((n, i) => t.doodle(n, { x: W * 0.18 + i * 64, y: H * 0.26 }, { delay: i * 0.1, now: true }));
    t.tick('tool:feed', { now: true }); t.cross('tool:tag', { now: true }); t.star('tool:build', { now: true }); t.underline('#buy', { now: true });
    t.pulse('tool:dex');
    await run(2.2);
  },
  // the eraser smudge
  async clear() { await go('tool:ebuy'); t.circle('tool:ebuy'); t.underline('#buy', { now: true }); await run(1); t.clearChalk(); await run(0.32); },
  // bows and runs off
  async bye() { await go('tool:ebuy'); await run(0.3); t.hide(); await run(1.0); },
  async lesson() { await until(lesson(), 120); },
};
window.SCENES = SCENES;
window.scene = async (name) => { await SCENES[name]?.(); window.sceneDone = name; };

// ---------------------------------------------------------------- controls
const ctl = $('#ctl');
const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { audio.unlock?.(); fn(); }; ctl.appendChild(b); };
btn('▶ full lesson', () => lesson());
btn('show', () => t.show());
btn('hide', () => t.hide());
for (const k of ['feed', 'ebuy', 'build', 'lab', 'reviews']) btn('goTo tool:' + k, () => t.goTo('tool:' + k));
btn('goTo coins (HUD)', () => t.goTo('#coins'));
btn('goTo Buy button', () => t.goTo('#buy'));
btn('goTo egg (moving)', () => t.goTo(eggTarget));
btn('circle target', () => t.circle(t._aimT || 'tool:ebuy'));
btn('underline Buy', () => t.underline('#buy'));
btn('arrow Buy → build', () => t.arrow('#buy', 'tool:build'));
btn('tick / cross / star', () => { t.tick('tool:feed'); t.cross('tool:tag'); t.star('tool:build'); });
btn('doodles', () => ['heart', 'fish', 'egg', 'sparkle', 'exclamation', 'question'].forEach((n, i) => t.doodle(n, { x: 200 + i * 64, y: 220 }, { delay: i * 0.25 })));
btn('pulse lab', () => t.pulse('tool:lab', { times: 4 }));
btn('say (wait)', () => t.say('Tap anywhere to <b>continue</b>!', { wait: true }));
btn('say shout', () => t.say('BEARS AT FIVE!', { wait: false, dur: 2.5, mood: 'shout' }));
btn('clear chalk', () => t.clearChalk());

window.ready = true;
const sc = params.get('scene');
if (sc) window.scene(sc);
