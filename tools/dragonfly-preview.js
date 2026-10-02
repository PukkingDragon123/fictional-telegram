// Dragonfly preview: every frame at 8x, plus a looping wing beat.
// window.__seek(t) shows the animated sprite at time t (14 fps, like BugSystem).
import { EXTRA_SPRITES } from '../src/art/extra/bugArt.js';

const SC = 8;
function frameCanvas(f, bg) {
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.data), f.w, f.h), 0, 0);
  const o = document.createElement('canvas');
  o.width = f.w * SC; o.height = f.h * SC;
  const x = o.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, o.width, o.height); }
  x.drawImage(c, 0, 0, o.width, o.height);
  return o;
}
function tile(parent, f, label, bg) {
  const d = document.createElement('div');
  d.className = 'tile';
  d.append(frameCanvas(f, bg), Object.assign(document.createElement('span'), { textContent: label }));
  parent.append(d);
}
const fly = EXTRA_SPRITES.dragonfly();
const rest = EXTRA_SPRITES.dragonfly_rest();
const icon = EXTRA_SPRITES.bugicon_dragonfly();
fly.forEach((f, i) => tile(document.getElementById('fly'), f, `fly ${i}`));
rest.forEach((f, i) => tile(document.getElementById('rest'), f, `rest ${i}`, '#5a8a3a'));
icon.forEach((f) => tile(document.getElementById('rest'), f, 'icon', '#e8dcc0'));
const anim = document.getElementById('anim');
const live = document.createElement('canvas');
anim.append(live);
window.__seek = (t) => {
  const f = fly[Math.floor(t * 14) % fly.length];
  const c = frameCanvas(f);
  live.width = c.width; live.height = c.height;
  live.getContext('2d').drawImage(c, 0, 0);
};
let t0 = performance.now();
const loop = () => { window.__seek((performance.now() - t0) / 1000); requestAnimationFrame(loop); };
loop();
