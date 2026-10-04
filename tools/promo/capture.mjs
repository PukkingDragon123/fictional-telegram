// Promo art for itch.io: renders the real game scene, then composites the typography.
//
//   npx vite --port 5281 --host 127.0.0.1            (dev server, in another shell)
//   node tools/promo/capture.mjs [render|composite|all] [thumb|banner|all]
//
// render    : opens the game's title screen, hands it to tools/promo/stage.js with a preset
//             from presets.js, screenshots the canvas -> tools/promo/renders/<kind>.png
//             (+ <kind>-<actor>.png silhouette masks for the outline / glow cut-outs)
// composite : tools/promo/promo.html?kind=<kind> lays text, arrow, bursts over the render
//             -> promo/itch-thumbnail-630x500.png + -1260x1000.png, promo/itch-banner-960x240.png + -1920x480.png
// Env: PROMO_URL (default http://127.0.0.1:5281), CHROME (chromium path), PW (playwright module dir).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const URL0 = process.env.PROMO_URL || 'http://127.0.0.1:5281';
const OUT = path.join(ROOT, 'promo');
const REN = path.join(HERE, 'renders');
const { PRESETS } = await import(pathToFileURL(path.join(HERE, 'presets.js')).href);

const require = createRequire(process.env.PW || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// keep Vite's HMR client from reloading the page mid-shot
const VITE_STUB = `
export function updateStyle(id, css) { let s = document.querySelector('style[data-vite-dev-id="' + id + '"]'); if (!s) { s = document.createElement('style'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); } s.textContent = css; }
export function removeStyle(id) { document.querySelector('style[data-vite-dev-id="' + id + '"]')?.remove(); }
export function createHotContext() { return { accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, decline() {}, data: {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;
async function newPage(w, h, dsf = 1) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: VITE_STUB }));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
  return page;
}

async function render(kind) {
  const P = PRESETS[kind];
  const [w, h] = P.viewport;
  const page = await newPage(w, h);
  await page.goto(`${URL0}/?px=${P.px ?? 1}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__title && window.__title.active, null, { timeout: 120000 });
  await page.waitForTimeout(6000); // shader warm-up
  await page.evaluate(async ([k, o]) => { const S = await import('/tools/promo/stage.js'); await S.setup(k, o); }, [kind, P.opts]);
  await page.waitForTimeout(P.settle ?? 3000);
  await page.evaluate(async () => { const S = await import('/tools/promo/stage.js'); S.splash(1); });
  await page.waitForTimeout(P.splashWait ?? 500);
  fs.mkdirSync(REN, { recursive: true });
  await page.screenshot({ path: path.join(REN, `${kind}.png`) });
  for (const m of P.masks || []) {
    const url = await page.evaluate(async (n) => { const S = await import('/tools/promo/stage.js'); return S.mask(Array.isArray(n) ? n : [n]); }, m);
    fs.writeFileSync(path.join(REN, `${kind}-${[].concat(m).join('+')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await page.close();
  console.log('rendered', kind);
}

const SIZES = { thumb: { css: [630, 500], files: ['itch-thumbnail-630x500.png', 'itch-thumbnail-1260x1000.png'] },
  banner: { css: [960, 240], files: ['itch-banner-960x240.png', 'itch-banner-1920x480.png'] } };
async function composite(kind) {
  const Z = SIZES[kind];
  fs.mkdirSync(OUT, { recursive: true });
  for (const [i, dsf] of [[0, 1], [1, 2]]) {
    const page = await newPage(Z.css[0], Z.css[1], dsf);
    await page.goto(`${URL0}/tools/promo/promo.html?kind=${kind}&t=${Date.now()}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    await page.screenshot({ path: path.join(OUT, Z.files[i]), clip: { x: 0, y: 0, width: Z.css[0], height: Z.css[1] }, timeout: 300000 });
    await page.close();
    console.log('wrote', path.join(OUT, Z.files[i]));
  }
}

const [what = 'all', which = 'all'] = process.argv.slice(2);
const kinds = which === 'all' ? ['thumb', 'banner'] : [which];
for (const k of kinds) {
  if (!PRESETS[k]) { console.log('no preset', k); continue; }
  if (what === 'render' || what === 'all') await render(k);
  if (what === 'composite' || what === 'all') await composite(k);
}
await browser.close();
