// Preview harness for src/ui/CorpClock.js.
// URL flags: ?hour=16.5 &phase=day &sun=1 &run=1 &min=1 (collapse controls)
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import { spriteImg } from '../src/ui/sprites.js';
import { CorpClock } from '../src/ui/CorpClock.js';

const P = new URLSearchParams(location.search);
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const s = { hour: +(P.get('hour') ?? 10.5), phase: P.get('phase') || 'day', sun: P.get('sun') === '1', run: P.get('run') === '1', logSfx: true };
const $ = (q) => document.querySelector(q);
const log = [];
const say = (t) => { log.unshift(t); log.length = 2; $('#log').textContent = log.join('\n'); };

const clock = new CorpClock($('#hud'), {
  onBell: () => { say('onBell()'); s.phase = 'rush'; s.hour = 17; sync(); },
  sfx: (n, o) => { if (s.logSfx) say(`sfx ${n} ${o ? JSON.stringify(o) : ''}`); },
  icon: (n, sc) => spriteImg(n, sc),
});
window.clock = clock;
if (P.get('min') === '1') $('#ctl').classList.add('min');
$('#ctl .t').onclick = () => $('#ctl').classList.toggle('min');

function autoPhase(h) {
  if (h < 6) return 'night';
  if (h < 9) return 'morning';
  if (h < 17) return 'day';
  if (h < 19) return 'rush';
  if (h < 22) return 'evening';
  return 'night';
}
function sync() {
  $('#hour').value = s.hour;
  const m = Math.round(s.hour * 60);
  $('#hv').textContent = `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
  for (const b of document.querySelectorAll('#phases button')) b.classList.toggle('on', b.dataset.p === s.phase);
  $('#run').textContent = `run: ${s.run ? 'on' : 'off'}`;
  $('#sun').textContent = `sunday: ${s.sun ? 'on' : 'off'}`;
  $('#snd').textContent = `log sfx: ${s.logSfx ? 'on' : 'off'}`;
}
$('#hour').oninput = (e) => { s.hour = +e.target.value; if (s.phase !== 'gameover') s.phase = autoPhase(s.hour); sync(); };
for (const b of document.querySelectorAll('[data-p]')) b.onclick = () => { s.phase = b.dataset.p; sync(); };
for (const b of document.querySelectorAll('[data-h]')) b.onclick = () => { s.hour = +b.dataset.h; s.phase = 'day'; sync(); };
$('#run').onclick = () => { s.run = !s.run; sync(); };
$('#sun').onclick = () => { s.sun = !s.sun; sync(); };
$('#snd').onclick = () => { s.logSfx = !s.logSfx; sync(); };
sync();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (s.run && s.phase !== 'gameover') {
    s.hour += dt * (1 / 60); // 1 game hour per real minute
    if (s.hour >= 24) s.hour -= 24;
    s.phase = autoPhase(s.hour);
    sync();
  }
  clock.update(dt, {
    hour: s.hour, phase: s.phase, day: 3, weekday: s.sun ? 'Sunday' : WEEK[2], dayOff: s.sun,
    secondsToRush: Math.max(0, (17 - s.hour) * 60), lunchStart: 12, lunchEnd: 13, open: 9, close: 17,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
