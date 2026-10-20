const { chromium } = require('../pw/node_modules/playwright-core');
const OUT = __dirname + '/shots/';
const BASE = 'http://localhost:8502';
async function launch() {
  return chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
}
async function ctx(browser, vp, dark) {
  const v = vp === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  return browser.newContext({ viewport: v, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light', isMobile: false });
}
async function settle(page, ms=1200) {
  await page.waitForTimeout(ms);
  try { await page.waitForFunction(() => !document.querySelector('[data-testid="stStatusWidget"]') , null, {timeout: 8000}); } catch(e){}
  await page.waitForTimeout(400);
}
async function login(page, u, p) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByLabel('Usuario').fill(u);
  await page.getByLabel('Contraseña').fill(p);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForSelector('section[data-testid="stSidebar"]', { timeout: 20000 }).catch(()=>{});
  await settle(page, 2000);
}
async function shot(page, name, full=true) {
  if (full) {
    const vp = page.viewportSize();
    const h = await page.evaluate(() => { const m = document.querySelector('[data-testid="stMain"]') || document.documentElement; const sc = m.scrollHeight; const s = document.querySelector('section[data-testid="stSidebar"]'); return Math.max(sc, 0); });
    const target = Math.min(Math.max(h, vp.height), 5000);
    if (target > vp.height) { await page.setViewportSize({ width: vp.width, height: target }); await page.waitForTimeout(500); }
    await page.screenshot({ path: OUT + name + '.png' });
    if (target > vp.height) { await page.setViewportSize(vp); await page.waitForTimeout(300); }
  } else await page.screenshot({ path: OUT + name + '.png' });
  console.log('shot', name);
}
async function nav(page, label) {
  // sidebar button
  const sb = page.locator('section[data-testid="stSidebar"]');
  await sb.getByRole('button', { name: new RegExp('[●○] ' + label + '$') }).click();
  await settle(page, 1800);
}
module.exports = { launch, ctx, settle, login, shot, nav, BASE, OUT };
module.exports.go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await settle(page, 2000); };
module.exports.btn = (page, name, opts={}) => page.getByRole('button', { name, ...opts });
