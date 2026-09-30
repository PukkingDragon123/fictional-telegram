import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium, devices } = require('playwright');
const [stepsArg, url = 'http://localhost:5173/'] = process.argv.slice(2);
const steps = JSON.parse(fs.existsSync(stepsArg) ? fs.readFileSync(stepsArg, 'utf8') : stepsArg);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(9000);
for (const s of steps) {
  try {
    if (s.click) await page.click(s.click, { timeout: 8000, force: true });
    if (s.tap) await page.touchscreen.tap(s.tap[0], s.tap[1]);
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.eval) { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval:', JSON.stringify(r)); }
    if (s.shot) await page.screenshot({ path: `tools/shots/${s.shot}.png` });
  } catch (e) { logs.push(`[step error] ${JSON.stringify(s)}: ${e.message.split('\n')[0]}`); }
}
console.log(logs.filter((l) => !l.includes('ERR_CERT') && !l.includes('404')).join('\n'));
await browser.close();
