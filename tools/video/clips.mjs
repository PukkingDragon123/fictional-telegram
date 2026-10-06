// Records the raw clips for the gig video, frame by frame under virtual time:
//   node tools/video/clips.mjs <name> [<name> ...] [--frames N] [--every K]
// -> tools/video/clips/<name>/fNNNN.jpg + meta.json { fps, frames, anchors[], audio[] }
// Servers: TBME dev server (VIDEO_TB, default http://127.0.0.1:5281) and the
// Deli-very-dead dev server (VIDEO_DV, default http://127.0.0.1:5290).
// Clip definitions live in clipdefs.mjs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { recorder } from './rec.mjs';
import { DEFS } from './clipdefs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVERS = { tb: process.env.VIDEO_TB || 'http://127.0.0.1:5281', dv: process.env.VIDEO_DV || 'http://127.0.0.1:5290' };
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const names = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const FPS = 30;

// in-page: log every sound call of the given audio objects (virtual seconds)
const AUDIO_TAP = `(objs) => {
  window.__clipAudio = window.__clipAudio || [];
  for (const a of objs) {
    if (!a || a.__tapped) continue;
    a.__tapped = true;
    for (const m of ['play', 'babble', 'setMusic']) {
      const f = a[m];
      if (typeof f !== 'function') continue;
      a[m] = function (...args) {
        try { window.__clipAudio.push({ t: performance.now() / 1000, m, args: JSON.parse(JSON.stringify(args.map((x) => (typeof x === 'function' ? null : x)))) }); } catch {}
        return f.apply(this, args);
      };
    }
  }
}`;

const R = await recorder({ w: 1280, h: 720, fps: FPS });
for (const name of names) {
  const D = DEFS[name];
  if (!D) { console.log('no clip', name); continue; }
  const frames = opt('--frames', D.frames);
  const every = opt('--every', 1);
  const dir = path.join(HERE, 'clips', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const page = await R.open(SERVERS[D.server] + D.url, { init: D.init || [], viewport: D.viewport });
  await R.until(page, D.ready, { timeout: 300000 });
  if (D.setup) await page.evaluate(`(${D.setup})()`);
  if (D.warm) await R.pump(page, D.warm);
  if (D.setup2) await page.evaluate(`(${D.setup2})()`);
  if (D.audio) await page.evaluate(`(async () => (${AUDIO_TAP})(await (${D.audio})))()`);
  const start = await page.evaluate(() => { window.__clipAudio = []; return performance.now() / 1000; });
  console.log(name, 'ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const anchors = [];
  for (let i = 0; i < frames; i++) {
    const r = await page.evaluate(`(() => {
      const i = ${i};
      ${D.hook ? `(${D.hook})(i);` : ''}
      window.__vt.step(${1000 / FPS});
      const meta = ${D.meta ? `(${D.meta})()` : 'null'};
      const cap = ${D.capture === 'page' ? 'null' : `(() => { const c = document.querySelector('${D.canvas || 'canvas'}'); return c.toDataURL('image/jpeg', 0.93); })()`};
      return { meta, cap };
    })()`);
    anchors.push(r.meta);
    if (i % every) continue;
    const file = path.join(dir, `f${String(i).padStart(4, '0')}.jpg`);
    if (r.cap) fs.writeFileSync(file, Buffer.from(r.cap.split(',')[1], 'base64'));
    else await R.shot(page, file);
    if (i % 60 === 0) console.log(name, i, '/', frames, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const audio = await page.evaluate((s) => (window.__clipAudio || []).map((e) => ({ ...e, t: +(e.t - s).toFixed(4) })), start);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ fps: FPS, frames, anchors, audio }));
  const errs = await page.evaluate(() => window.__vt.errors.slice(0, 5));
  if (errs.length) console.log(name, 'page errors:', errs);
  await page.context().close();
  console.log(name, 'done', frames, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
}
await R.close();
