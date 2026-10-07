// Quick look at sandbox shots: a few stills per shot at chosen times, no clip written.
//   node tools/devlog/peek.mjs <shot> <out-dir> [t1 t2 ...] [--skip S] [--w 1080 --h 1920]
import fs from 'fs';
import path from 'path';
import { recorder } from '../video/rec.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [shot, out, ...times] = pos;
const W = +opt('--w', 1080), H = +opt('--h', 1920), skip = opt('--skip', '0');
const url = process.env.VIDEO_TB || 'http://127.0.0.1:5281';
fs.mkdirSync(out, { recursive: true });
const R = await recorder({ w: W, h: H, fps: 30 });
const page = await R.open(`${url}/tools/devlog/sandbox.html?shot=${shot}&skip=${skip}`, { viewport: [W, H] });
const t0 = Date.now();
await R.until(page, () => window.__sb?.ready, { timeout: 120000 });
await page.evaluate(() => window.__sb.play());
console.log('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's');
const ts = (times.length ? times : ['0.1', '2', '4']).map(Number).sort((a, b) => a - b);
let f = 0;
for (const t of ts) {
  const target = Math.round(t * 30);
  const t1 = Date.now();
  const n = target - f;
  // step + read back in one task: the WebGL drawing buffer is only valid until the frame is composited
  const cap = await page.evaluate((n) => { for (let i = 0; i < Math.max(1, n); i++) window.__vt.step(1000 / 30); return document.querySelector('canvas').toDataURL('image/jpeg', 0.9); }, n);
  f = Math.max(f + 1, target);
  const file = path.join(out, `${shot}-${String(t).replace('.', '_')}.jpg`);
  fs.writeFileSync(file, Buffer.from(cap.split(',')[1], 'base64'));
  const meta = await page.evaluate(() => window.__sb.meta());
  console.log(file, ((Date.now() - t1) / 1000).toFixed(1) + 's', JSON.stringify(meta).slice(0, 300));
}
const errs = await page.evaluate(() => window.__vt.errors.slice(0, 5));
if (errs.length) console.log('errors', errs);
await R.close();
