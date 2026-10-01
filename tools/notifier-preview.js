// FoxNotifier preview.
//   (default)               buttons for each mood; a simple B&W pixel bubble follows notifier.anchor()
//   ?manual=1               no rAF: drive with window.step(seconds, dt) (for screenshots)
//   ?anim=climb_up&t=0.6    jump straight to one rig animation at time t (manual)
import { FoxNotifier } from '../src/ui/FoxNotifier.js';
import audio from '../src/audio/audio.js';

const params = new URLSearchParams(location.search);
const manual = params.has('manual') || params.has('anim');
const fox = new FoxNotifier(document.body, { sfx: audio, babble: (v, t, o) => audio.babble(v, t, o), autoUpdate: !manual });
window.fox = fox;

const LINES = [
  ['info', 'Psst. Fish are biting.'],
  ['no', 'Nope! Need beavers first.'],
  ['happy', 'Ooh, a package!'],
  ['warn', 'Bears incoming!'],
  ['excited', 'Five stars! Rich!'],
];

// ---------------------------------------------------------------- bubble (preview only)
const bub = document.getElementById('bubble');
let bubText = '', bubT = 0;
function drawBubble(text) {
  const S = 2; // css px per bubble pixel
  const g0 = bub.getContext('2d');
  g0.font = 'bold 8px monospace';
  const tw = Math.ceil(g0.measureText(text).width);
  const w = tw + 12, h = 17, tail = 6;
  bub.width = w; bub.height = h + tail;
  bub.style.width = w * S + 'px'; bub.style.height = (h + tail) * S + 'px';
  const g = bub.getContext('2d');
  g.imageSmoothingEnabled = false;
  const box = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
  // rounded pixel rectangle: ink outline, white fill
  box(2, 0, w - 4, h, '#111'); box(0, 2, w, h - 4, '#111'); box(1, 1, w - 2, h - 2, '#111');
  box(2, 1, w - 4, h - 2, '#fff'); box(1, 2, w - 2, h - 4, '#fff');
  box(2, h - 2, w - 4, 1, '#fff');
  box(3, h - 1, w - 6, 1, '#111');
  // tail at the bottom right, pointing down-right to the anchor
  const tx = w - 14;
  for (let i = 0; i < tail; i++) { box(tx + i, h - 1 + i, 7 - i, 1, '#fff'); box(tx + i - 1, h - 1 + i, 1, 1, '#111'); box(tx + 7, h - 1 + i, 1, 1, '#111'); }
  box(tx + 6, h + tail - 1, 2, 1, '#111');
  g.fillStyle = '#111'; g.font = 'bold 8px monospace'; g.textBaseline = 'middle';
  g.fillText(text, 6, h / 2 + 0.5);
  bub.dataset.tail = String((tx + 7) * S);
}
function say(text, secs) {
  bubText = text; bubT = secs;
  drawBubble(text);
  bub.style.display = 'block';
  placeBubble();
}
function placeBubble() {
  if (!bubText) return;
  const a = fox.anchor();
  const tail = +bub.dataset.tail || 0;
  const w = parseFloat(bub.style.width), h = parseFloat(bub.style.height);
  let x = a.x - tail;
  x = Math.min(x, window.innerWidth - w - 4);
  bub.style.transform = `translate(${Math.round(x)}px, ${Math.round(a.y - h)}px)`;
}
function bubbleTick(dt) {
  if (!bubText) return;
  bubT -= dt;
  if (bubT <= 0 || !fox.visible || fox.state === 'leaving') { bubText = ''; bub.style.display = 'none'; return; }
  placeBubble();
}

// ---------------------------------------------------------------- buttons
const ui = document.getElementById('ui');
async function run(mood, text) {
  audio.unlock?.();
  await fox.show({ mood, dur: 4 });
  const d = fox.talk(text);
  say(text, d + 1.6);
}
for (const [mood, text] of LINES) {
  const b = document.createElement('button');
  b.textContent = `${mood}: ${text}`;
  b.onclick = () => run(mood, text);
  ui.appendChild(b);
}
const hb = document.createElement('button');
hb.textContent = 'hide';
hb.onclick = () => fox.hide();
ui.appendChild(hb);
const qb = document.createElement('button');
qb.textContent = 'queue x3';
qb.onclick = async () => {
  await run('happy', 'Ooh, a package!');
  setTimeout(() => run('warn', 'Bears incoming!'), 1800);
  setTimeout(() => run('no', 'Nope! Need beavers first.'), 3800);
};
ui.appendChild(qb);

// ---------------------------------------------------------------- loops
if (!manual) {
  let last = performance.now();
  const loop = (now) => { const dt = Math.min(0.1, (now - last) / 1000); last = now; bubbleTick(dt); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
window.step = (secs, dt = 1 / 30) => {
  fox._skipRender = true;
  for (let t = 0; t < secs - 1e-6; t += dt) { fox.update(dt); bubbleTick(dt); }
  fox._skipRender = false;
  fox.update(0);
  placeBubble();
};
window.say = say;
window.run = run;
if (params.has('anim')) {
  fox.show({ mood: 'info', dur: 0 });
  const name = params.get('anim');
  if (name !== 'climb_up') window.step(1.6);
  fox.rig.play(name, { fade: 0, restart: true });
  window.step(+params.get('t') || 0);
}
window.ready = true;
