import { createRequire } from 'module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404') && !m.text().includes('CERT')) errs.push(m.text()); });
await page.goto('http://localhost:5173/?autostart=new&notut=1');
await page.waitForTimeout(8000);
const screenOf = (x, z, y = 0) => page.evaluate(([x, y, z]) => { const g = __game; const v = new (g.rig.camera.position.constructor)(x, y, z); const p = g.rig.worldToScreen(v, g.renderer); return [p.x, p.y]; }, [x, y, z]);
const st = () => page.evaluate(() => ({ coins: __game.state.coins, fish: __game.fish.count, weed: __game.structures.countBuilt('seaweed'), water: __game.grid.countWater(), res: __game.state.research.length, tool: __game.tool.kind }));
const log = [];
log.push(['start', await st()]);
// 1) buy a bluegill via the shop panel
await page.click('[data-panel="shop"]', { force: true });
await page.waitForTimeout(1500);
await page.click('[data-buy="bluegill"]', { force: true });
await page.waitForTimeout(800);
log.push(['bought', await st()]);
await page.click('#p-close', { force: true });
// 2) build seaweed: open build, pick seaweed, click a water tile
await page.click('[data-panel="build"]', { force: true });
await page.waitForTimeout(1500);
await page.click('[data-build="seaweed"]', { force: true });
await page.waitForTimeout(500);
const wt = await page.evaluate(() => { const g = __game; for (let z = 30; z < 38; z++) for (let x = 22; x < 34; x++) if (g.structures.canPlace('seaweed', x, z).ok) return [x, z]; return null; });
const [sx, sy] = await screenOf(wt[0] + 0.5, wt[1] + 0.5, -0.1);
await page.mouse.click(sx, sy);
await page.waitForTimeout(800);
log.push(['seaweed@' + wt, await st()]);
await page.keyboard.press('Escape');
// 3) dig a tile next to the pond
await page.click('[data-tool="dig"]', { force: true });
await page.waitForTimeout(300);
const dt = await page.evaluate(() => { const g = __game; for (let z = 28; z < 40; z++) for (let x = 20; x < 36; x++) if (!g.canDig(x, z)) return [x, z]; return null; });
const [dx, dy] = await screenOf(dt[0] + 0.5, dt[1] + 0.5, 0);
await page.mouse.click(dx, dy);
await page.waitForTimeout(800);
log.push(['dig@' + dt, await st()]);
await page.keyboard.press('Escape');
// 4) research perch via the lab panel
await page.click('[data-panel="lab"]', { force: true });
await page.waitForTimeout(2000);
await page.click('[data-r="r_perch"]', { force: true });
await page.waitForTimeout(800);
log.push(['research', await st()]);
await page.screenshot({ path: 'tools/shots/ui1.png' });
await page.click('#p-close', { force: true });
// 5) feed by clicking water
const [fx, fy] = await screenOf(27.5, 33.5, -0.1);
await page.mouse.click(fx, fy);
await page.waitForTimeout(500);
log.push(['feed', await page.evaluate(() => __game.foodBag.count)]);
// 6) menu open/close + speed buttons
await page.click('#b-menu', { force: true });
await page.waitForTimeout(800);
await page.click('#m-ok', { force: true });
await page.click('[data-s="3"]', { force: true });
log.push(['speed', await page.evaluate(() => __game.state.speed)]);
console.log(JSON.stringify(log));
console.log('errors:', errs.slice(0, 10).join('\n'));
await browser.close();
