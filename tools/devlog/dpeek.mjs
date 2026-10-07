// Stills from a devlog day at chosen times (runs the director up to each one):
//   node tools/devlog/dpeek.mjs day01 <out-dir> 1.0 5.2 9.0 ...
import fs from 'fs';
import path from 'path';
import { recorder } from '../video/rec.mjs';

const [day, out, ...times] = process.argv.slice(2);
const url = process.env.VIDEO_TB || 'http://127.0.0.1:5281';
fs.mkdirSync(out, { recursive: true });
const R = await recorder({ w: 1080, h: 1920, fps: 30 });
const page = await R.open(`${url}/tools/devlog/director.html?day=${day}`, { viewport: [1080, 1920] });
await R.until(page, () => window.__ready === true && window.__dir);
const want = new Set(times.map((t) => Math.round(+t * 30)));
const last = Math.max(...want);
for (let i = 0; i <= last; i++) {
  await page.evaluate((i) => window.__dir.frame(i), i);
  if (want.has(i)) { const f = path.join(out, `${day}-${String(i).padStart(4, '0')}.jpg`); await R.shot(page, f); console.log(f); }
}
const errs = await page.evaluate(() => window.__vt.errors.slice(0, 5));
if (errs.length) console.log('errors', errs);
await R.close();
