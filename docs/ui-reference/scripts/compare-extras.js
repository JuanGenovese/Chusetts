// Extra checks: mobile sidebar overlay + button variants (primary / secondary / disabled).
const { chromium } = require(process.env.PW_CORE || "playwright-core");
const BASE = process.argv[2] || "http://localhost:3001";
const OUT = process.argv[3] || __dirname + "/../compare";
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await m.goto(BASE + "/mi-turno", { waitUntil: "networkidle" });
  await m.screenshot({ path: `${OUT}/mobile-sidebar-collapsed.png` });
  await m.getByLabel("Abrir barra lateral").click();
  await m.waitForTimeout(300);
  await m.screenshot({ path: `${OUT}/mobile-sidebar-open.png` });
  await m.getByRole("link", { name: /Reportes/ }).click();
  await m.waitForURL("**/reportes");
  await m.screenshot({ path: `${OUT}/mobile-after-nav.png` });
  const d = await (await browser.newContext({ viewport: { width: 700, height: 300 } })).newPage();
  await d.goto(BASE + "/reportes", { waitUntil: "networkidle" });
  await d.evaluate(() => {
    document.querySelector(".block-container").insertAdjacentHTML("beforeend",
      `<div style="display:flex;gap:12px;margin-top:20px">
        <button class="btn btn-primary">Primary</button><button class="btn btn-primary" disabled>Primary off</button>
        <button class="btn btn-secondary">Secondary</button><button class="btn btn-secondary" disabled>Secondary off</button></div>`);
  });
  await d.setViewportSize({ width: 1000, height: 500 });
  await d.screenshot({ path: `${OUT}/buttons.png` });
  await browser.close();
})();
