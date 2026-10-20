// Screenshots the Next "Mi turno" page in the same states/viewports as the Streamlit reference.
// Usage: node compare-turno.js <baseUrl> <outDir> [prefix]   (needs playwright-core + a Chrome binary)
const { chromium } = require(process.env.PW_CORE || "playwright-core");
const BASE = process.argv[2] || "http://localhost:3001";
const OUT = process.argv[3] || __dirname + "/../compare";
const PREFIX = process.argv[4] || "admin";
const VP = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

async function full(page, name, vp) {
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  const target = Math.min(Math.max(h, vp.height), 5000);
  await page.setViewportSize({ width: vp.width, height: target });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.setViewportSize(vp);
  console.log("shot", name);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  for (const [vpName, vp] of Object.entries(VP)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    const go = async () => { await page.goto(BASE + "/mi-turno", { waitUntil: "networkidle" }); await page.waitForTimeout(600); };
    await go();
    await full(page, `${PREFIX}-turno-cerrada-${vpName}`, vp);
    if (vpName === "desktop") {
      await page.getByLabel("Efectivo inicial").focus();
      await page.screenshot({ path: `${OUT}/${PREFIX}-turno-cerrada-inputfocus-${vpName}.png` });
    }
    await page.getByLabel("Efectivo inicial").fill("5000");
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await page.getByText("Caja abierta. Ya podés registrar ventas.").waitFor();
    await page.waitForTimeout(500);
    await full(page, `${PREFIX}-turno-abierta-flash-${vpName}`, vp);
    await go();
    await full(page, `${PREFIX}-turno-abierta-${vpName}`, vp);
    await page.getByLabel("Efectivo contado físicamente").fill("4800");
    await page.getByRole("button", { name: "Cerrar caja y generar backup" }).click();
    await page.getByText(/Caja cerrada\. Diferencia/).waitFor();
    await page.waitForTimeout(500);
    await full(page, `${PREFIX}-turno-cerrada-flash-historial-${vpName}`, vp);
    await ctx.close();
  }
  await browser.close();
})();
