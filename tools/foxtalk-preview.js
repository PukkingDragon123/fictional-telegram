// FoxTalk3D preview: both dialogue styles, a button per expression / FX / outfit.
// Manual stepping for screenshots: window.__step(seconds, dt), window.__seek is the same.
import { createFoxTalk, FOX_TALK_EXPRESSIONS, FOX_TALK_FX, stepFoxTalks } from '../src/ui/FoxTalk3D.js';
import { FOX_OUTFITS } from '../src/entities/foxRig.js';

const LINES = {
  shocked: 'NEW RULE! A fish must be WELL FED!', greedy: 'The rarer the fish, the more coins!', love: 'Today: how fish make babies!',
  angry: 'Who ate my prize koi?!', sleepy: 'Five more minutes...', laugh: 'Ho ho ho! Mwahaha!', confused: 'Wait... where did my monocle go?',
  worried: 'A hungry bear with nothing to eat...', excited: 'Sometimes genes MUTATE!', proud: 'Gold star for you!',
};
const Q = new URLSearchParams(location.search);
const pixelScale = +Q.get('ps') || undefined;
const a = createFoxTalk(document.getElementById('p1'), { outfit: 'teacher', pixelScale });
const b = createFoxTalk(document.getElementById('p2'), { outfit: 'default', pixelScale });
const all = [a, b].filter(Boolean);
if (!all.length) document.getElementById('ui').textContent = 'WebGL unavailable';

function say(expr) {
  const text = LINES[expr] || 'Class! Is your fish happy and healthy?';
  document.getElementById('t1').textContent = text;
  document.getElementById('t2').textContent = text;
  for (const f of all) { f.setExpression(expr); f.talk(text); }
}

const ui = document.getElementById('ui');
const group = (title, items, fn) => {
  const h = document.createElement('h3'); h.textContent = title; ui.appendChild(h);
  for (const it of items) {
    const btn = document.createElement('button');
    btn.textContent = it;
    btn.onclick = () => fn(it);
    ui.appendChild(btn);
  }
};
group('Expressions (sets face + talks)', FOX_TALK_EXPRESSIONS, say);
group('FX', FOX_TALK_FX, (k) => all.forEach((f) => f.fx(k)));
group('Outfit', FOX_OUTFITS, (o) => all.forEach((f) => f.setOutfit(o)));
group('Talk', ['talk', 'stop'], (k) => all.forEach((f) => (k === 'talk' ? f.talk('Hello class! Today we learn about fish!') : f.stopTalk())));

window.__fox = { a, b, say };
window.__step = (sec = 0.5, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) stepFoxTalks(dt, { force: true }); };
window.__seek = window.__step;
