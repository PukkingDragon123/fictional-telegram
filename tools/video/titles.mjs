// Renders an overlay track (titles.js) to transparent PNGs, one per timeline frame that
// has anything visible: <out>/t00000.png ... + <out>/index.json (list of frame numbers).
//   node tools/video/titles.mjs <track.json> <out-dir> <W>x<H> <frames> [--scale S] [--fps 30]
// track.json = [ ...items ] (see titles.js). Needs the Vite dev server (VIDEO_URL).
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(process.env.PW || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [trackF, out, size, nframes] = args;
const [W, H] = size.split('x').map(Number);
const N = +nframes, fps = +opt('fps', 30), scale = +opt('scale', 1);
const URL0 = process.env.VIDEO_URL || 'http://127.0.0.1:5245';
const items = JSON.parse(fs.readFileSync(trackF, 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[page]', String(e).slice(0, 300)));
await page.goto(URL0 + '/tools/video/titles.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.evaluate(async () => { await document.fonts.load('80px "TBME Title"'); });
const n = await page.evaluate(([it, o]) => window.__setTrack(it, o), [items, { w: W, h: H, scale }]);
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^t\d+\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
const idx = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const any = await page.evaluate((t) => window.__at(t), i / fps);
  if (!any) continue;
  await page.screenshot({ path: path.join(out, `t${String(i).padStart(5, '0')}.png`), omitBackground: true });
  idx.push(i);
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(idx));
console.log(`titles: ${n} items, ${idx.length}/${N} frames with overlay, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await browser.close();
