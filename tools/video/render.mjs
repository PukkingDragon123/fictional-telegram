// Deterministic frame capture of one staged shot of the real game.
//
//   npx vite --port 5245 --host 127.0.0.1          (dev server, another shell)
//   node tools/video/render.mjs <module> <shot> [--out DIR] [--every N] [--from F] [--to F]
//        [--query '?autostart=new&notut=1'] [--size 1280x720] [--params '{"k":1}'] [--q 94]
//
// Opens the game in headless Chromium (SwiftShader WebGL), runs the shot's setup from
// tools/video/<module>.js (via director.js), then starts the virtual clock (vclock.js) and,
// for every frame: director.frame(i) -> clock.tick(1/30 s) (timers, rAF = game.update +
// game.render, CSS animations) -> screenshot. Frames go to DIR/f00000.jpg..., the audio log
// (every game SFX / babble / external cue with its time) to DIR/audio.json.
// --every N captures only every Nth frame (quick previews; the GPU work of skipped frames is skipped).
// Env: VIDEO_URL (default http://127.0.0.1:5245), CHROME, PW (playwright module dir).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [mod, shot] = pos;
if (!mod || !shot) { console.log('usage: render.mjs <module> <shot> [--out DIR] [--every N]'); process.exit(1); }
const URL0 = process.env.VIDEO_URL || 'http://127.0.0.1:5245';
const OUT = path.resolve(opt('out', path.join(HERE, '../../promo/video/frames', shot)));
const every = +opt('every', 1), from = +opt('from', 0), to = opt('to', null);
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const query = opt('query', '?autostart=new&notut=1');
const params = JSON.parse(opt('params', '{}'));
const quality = +opt('q', 94);

const require = createRequire(process.env.PW || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const VITE_STUB = `
export function updateStyle(id, css) { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; }
export function removeStyle(id) { document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove(); }
export function createHotContext() { return { accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;

const t00 = Date.now();
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.setDefaultTimeout(600000);
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: VITE_STUB }));
await page.addInitScript({ path: path.join(HERE, 'vclock.js') });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE ' + String(e.stack || e).slice(0, 600)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || t.startsWith('[dir]')) errs.push(m.type() + ' ' + t.slice(0, 400)); });

await page.goto(URL0 + '/' + query, { waitUntil: 'domcontentloaded', timeout: 240000 });
if (query.includes('autostart')) await page.waitForFunction(() => window.__game && window.__game.started, null, { timeout: 300000 });
else await page.waitForFunction(() => window.__title && window.__title.active, null, { timeout: 300000 });
await page.waitForTimeout(2500); // shader warm-up, sprite caches
const info = await page.evaluate(async ([m, s, p]) => { const D = await import('/tools/video/director.js'); return D.setup(m, s, p); }, [mod, shot, params]);
const N = Math.min(info.frames, to != null ? +to : 1e9);
console.log(`[${shot}] setup done in ${((Date.now() - t00) / 1000).toFixed(1)}s, ${N} frames (dur ${info.dur}s)`);
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^f\d+\.(jpg|png)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
await page.evaluate(async () => { const D = await import('/tools/video/director.js'); window.__vclock.start(); D.start(); });
const cdp = await page.context().newCDPSession(page);
const t0 = Date.now();
let shots = 0;
for (let i = 0; i < N; i++) {
  const cap = i >= from && (i - from) % every === 0;
  await page.evaluate(async ([i, cap]) => { const D = window.__dir; window.__dirMod ||= await import('/tools/video/director.js'); D.skipRender = !cap; window.__dirMod.frame(i); await window.__vclock.tick(1000 / 30); }, [i, cap]);
  if (!cap) continue;
  const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true });
  fs.writeFileSync(path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(r.data, 'base64'));
  shots++;
  if (shots % 30 === 0) console.log(`[${shot}] frame ${i}/${N}  ${((Date.now() - t0) / shots / 1000).toFixed(2)} s/frame`);
}
const log = await page.evaluate(async () => { const D = await import('/tools/video/director.js'); return { ...D.log(), vclockErrors: window.__vclock.errors.slice(0, 20) }; });
log.frames = N; log.fps = 30; log.size = [W, H]; log.every = every; log.errors = errs.slice(0, 40);
fs.writeFileSync(path.join(OUT, 'audio.json'), JSON.stringify(log, null, 1));
console.log(`[${shot}] done: ${shots} frames in ${((Date.now() - t00) / 1000).toFixed(0)}s; ${log.audio.length} audio events; errors ${errs.length}`);
for (const e of errs.slice(0, 8)) console.log('  ', e);
await browser.close();
