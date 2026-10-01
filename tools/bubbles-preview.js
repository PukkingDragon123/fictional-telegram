// Preview for src/ui/Bubbles.js, src/ui/BigClock.js and src/ui/fonts.css
import { Vector3 } from 'three';
import { Bubbles, pixelArrowButton } from '../src/ui/Bubbles.js';
import { BigClock } from '../src/ui/BigClock.js';
import { spriteImg } from '../src/ui/sprites.js';
import audio from '../src/audio/audio.js';

const Q = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const sfx = (n, o) => audio.play(n, o);
const icon = (name, scale) => spriteImg(name, scale);

// ---------------------------------------------------------------- characters
const CH = [
  { spr: 'bear_office', mood: 'normal', text: 'Table for one, please.', voice: 'bear' },
  { spr: 'bear_happy', mood: 'happy', text: 'Yum! {fish} is the best!', emote: 'emo_heart', voice: 'bear' },
  { spr: 'bear_angry', mood: 'angry', text: 'WHERE is my {fish}?!', emote: 'emo_anger', voice: 'bear' },
  { spr: 'bear_boss', mood: 'shout', text: 'Feeding time!', voice: 'ceo' },
  { spr: 'bear_accountant', mood: 'think', text: 'hmm... {coin} or {fish}?' },
  { spr: 'bear_cub', mood: 'excited', text: 'Ooh! *Shiny* {coin}!', emote: 'emo_stareyes', voice: 'cub' },
  { spr: 'bear_intern', mood: 'scared', text: 'is... is that a wolf?', emote: 'emo_sweat', voice: 'cub' },
  { spr: 'bear_janitor', mood: 'whisper', text: 'psst... the fox is cheating', voice: 'bear' },
  { spr: 'fox_smug', mood: 'normal', text: 'Sell the {fish_gold}?', voice: 'fox', choices: [{ label: 'Yes', icon: 'coin', value: 'yes' }, { label: 'No', icon: 'cross', value: 'no' }], item: 'fish_gold' },
  { spr: 'fox', mood: 'happy', text: 'Welcome to my pond!', voice: 'fox', wait: true },
];
const W0 = stage.clientWidth;
CH.forEach((c, i) => {
  const row = i < 5 ? 0 : 1;
  const col = i % 5;
  c.bx = Math.round(((col + 0.5) / 5) * W0);
  c.by = row ? 520 : 290;
  c.ph = i * 1.3;
  c.el = document.createElement('div');
  c.el.className = 'char';
  c.el.innerHTML = spriteImg(c.spr, 4) + '<i class="shadow"></i>';
  stage.appendChild(c.el);
  // anchor object like the game's bears/fox
  c.anchor = { getWorldPos: (out) => out.set(c.x, c.y - 66, 0) };
});
// fake world->CSS projection (world = stage px)
const project = (v) => {
  const r = stage.getBoundingClientRect();
  return { x: r.left + v.x, y: r.top + v.y, visible: v.x > -40 && v.x < r.width + 40 };
};

const bubbles = new Bubbles(stage, { project, sfx, babble: Q.has('mute') ? null : (v, t) => audio.babble(v, t), icon, scale: +(Q.get('scale') || 2) });
window.bubbles = bubbles;

function sayChar(c) {
  const h = bubbles.say(c.anchor, c.text, { mood: c.mood, emote: c.emote, item: c.item, voice: c.voice, choices: c.choices, wait: c.wait, key: c.spr, dur: c.choices || c.wait ? undefined : 3.2 });
  h.done.then((v) => {
    if (v !== undefined) bubbles.say(c.anchor, v === 'yes' ? 'Ka-ching! {coins}' : 'Fine. *Mine*.', { mood: v === 'yes' ? 'excited' : 'normal', key: c.spr, dur: 1.6 });
  });
  return h;
}
function sayAll() {
  CH.forEach((c, i) => setTimeout(() => sayChar(c), Q.has('shot') ? 0 : i * 140));
}

// ---------------------------------------------------------------- controls
const ctl = document.getElementById('ctl');
const btn = (label, fn, host = ctl) => {
  const b = document.createElement('button');
  b.className = 't';
  b.textContent = label;
  b.onclick = () => {
    audio.unlock?.();
    fn();
  };
  host.appendChild(b);
  return b;
};
btn('say all', sayAll);
btn('stack x3', () => {
  const c = CH[1];
  bubbles.say(c.anchor, 'one', { mood: 'normal' });
  setTimeout(() => bubbles.say(c.anchor, 'two {fish}', { mood: 'happy' }), 300);
  setTimeout(() => bubbles.say(c.anchor, 'THREE!', { mood: 'shout' }), 600);
});
btn('vec3 anchor', () => bubbles.say(new Vector3(W0 / 2, 120, 0), 'I am a Vector3 {star}', { mood: 'think', dur: 3 }));
btn('edge clamp', () => bubbles.say(() => ({ x: stage.getBoundingClientRect().left + 10, y: stage.getBoundingClientRect().top + 60 }), 'clamped to the edge of the screen!', { mood: 'scared', dur: 3 }));
btn('clear', () => bubbles.clear());
const run = btn('pause chars', () => {
  moving = !moving;
  run.textContent = moving ? 'pause chars' : 'move chars';
});
let moving = !Q.has('still');
for (const m of ['normal', 'happy', 'angry', 'shout', 'think', 'whisper', 'scared', 'excited']) {
  btn(m, () => bubbles.say(CH[0].anchor, m === 'shout' ? 'Hey you!' : `I feel ${m} {fish}`, { mood: m, key: 'm', emote: m === 'angry' ? 'emo_anger' : undefined }));
}

// ---------------------------------------------------------------- arrows
const arrows = document.getElementById('arrows');
for (const s of [2, 3]) for (const d of ['left', 'right', 'up', 'down']) arrows.appendChild(pixelArrowButton(d, { size: s }));

// ---------------------------------------------------------------- clocks
const SECTIONS = [
  { from: 0, to: 7, kind: 'night' },
  { from: 7, to: 12, kind: 'work' },
  { from: 12, to: 13, kind: 'lunch' },
  { from: 13, to: 17, kind: 'work' },
  { from: 17, to: 20, kind: 'rush' },
  { from: 20, to: 24, kind: 'night' },
];
const clocksEl = document.getElementById('clocks');
const STATIC = [
  ['9:00 calm', { hour: 9.0 }],
  ['12:30 lunch', { hour: 12.5 }],
  ['15:30 pulse', { hour: 15.5 }],
  ['16:30 wobble', { hour: 16.4 }],
  ['16:55 RING', { hour: 16.92 }],
  ['18:00 rush', { hour: 18.2 }],
  ['22:00 night', { hour: 22 }],
  ['paused', { hour: 10.25, paused: true }],
  ['sunday', { hour: 11, weekday: 0 }],
  ['3x speed', { hour: 8.75, speed: 3 }],
];
const clocks = STATIC.map(([l, st]) => {
  const cell = document.createElement('div');
  cell.className = 'cell';
  clocksEl.appendChild(cell);
  const c = new BigClock(cell, { sfx: () => {}, onSpeed: (n) => (st.speed = n) });
  const lab = document.createElement('div');
  lab.className = 'l';
  lab.textContent = l;
  cell.appendChild(lab);
  st.sections = SECTIONS;
  st.weekday ??= 3;
  st.speed ??= 1;
  return { c, st };
});
// live clock
const live = document.getElementById('live');
const liveHost = document.createElement('div');
live.appendChild(liveHost);
const LS = { hour: 16.3, speed: 1, paused: false, weekday: 3, sections: SECTIONS };
let autorun = false;
const liveClock = new BigClock(liveHost, { sfx, onSpeed: (n) => (LS.speed = n) });
const corner = new BigClock(document.getElementById('corner'), { sfx: () => {}, onSpeed: (n) => (LS.speed = n) });
const panel = document.createElement('div');
panel.innerHTML = `<div><input type="range" min="0" max="24" step="0.01" value="${LS.hour}" id="hr"> <span id="hrv"></span></div>
<label><input type="checkbox" id="pz"> paused</label> <label><input type="checkbox" id="sun"> sunday</label> <label><input type="checkbox" id="run"> run</label>
<div style="font-size:16px;line-height:12px;margin-top:6px">click the clock: speed 1x/2x/3x</div>`;
live.appendChild(panel);
const hr = panel.querySelector('#hr'), hrv = panel.querySelector('#hrv');
hr.oninput = () => (LS.hour = +hr.value);
panel.querySelector('#pz').onchange = (e) => (LS.paused = e.target.checked);
panel.querySelector('#sun').onchange = (e) => (LS.weekday = e.target.checked ? 0 : 3);
panel.querySelector('#run').onchange = (e) => (autorun = e.target.checked);

// ---------------------------------------------------------------- fonts
const fonts = document.getElementById('fonts');
const SAMPLE = 'The Bear Must Eat! 0123456789 $ fish & coins?';
fonts.innerHTML = [
  ['ft-title ft-1', 'title m6x11plus 18px (1x)'],
  ['ft-title', 'title m6x11plus 36px (2x)'],
  ['ft-title ft-3', 'title m6x11plus 54px (3x)'],
  ['ft-body ft-1', 'body m5x7 16px (1x)'],
  ['ft-body', 'body m5x7 32px (2x)'],
  ['ft-body ft-3', 'body m5x7 48px (3x)'],
].map(([c, l]) => `<div class="m">${l}</div><div class="${c}">${SAMPLE}</div>`).join('') +
  `<div class="m">accents (body)</div><div class="ft-body">Café crème brûlée, Ça va? Über Ñandú</div>`;

// ---------------------------------------------------------------- loop
let last = performance.now();
let T = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (moving) T += dt;
  for (const c of CH) {
    c.x = c.bx + Math.sin(T * 0.7 + c.ph) * 40;
    c.y = c.by + Math.abs(Math.sin(T * 5 + c.ph)) * -3;
    c.el.style.left = Math.round(c.x) + 'px';
    c.el.style.top = Math.round(c.y) + 'px';
  }
  bubbles.update(dt);
  if (autorun && !LS.paused) LS.hour = (LS.hour + dt * 0.25 * LS.speed) % 24;
  hr.value = LS.hour;
  hrv.textContent = `${String(Math.floor(LS.hour)).padStart(2, '0')}:${String(Math.floor((LS.hour % 1) * 60)).padStart(2, '0')}`;
  liveClock.update(dt, LS);
  corner.update(dt, LS);
  for (const { c, st } of clocks) c.update(dt, st);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setTimeout(sayAll, 300);
window.__ready = true;
