// Screenshots the Next "/" screens in the same states/viewports as the Streamlit reference shots.
// Usage: node compare-home.js <baseUrl> <outDir> <admin|cashier> [states,comma,separated]
// (needs playwright-core + Chrome; the server's DEV_USER_ROLE must match the role argument)
const { chromium } = require(process.env.PW_CORE || "playwright-core");
const BASE = process.argv[2] || "http://localhost:3001";
const OUT = process.argv[3] || __dirname + "/../compare";
const ROLE = process.argv[4] || "admin";
const ONLY = process.argv[5] ? process.argv[5].split(",") : null;
const VP = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

async function full(page, name, vp) {
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  const target = Math.min(Math.max(h, vp.height), 5000);
  await page.setViewportSize({ width: vp.width, height: target });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.setViewportSize(vp);
  console.log("shot", name);
}
const snap = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };
const want = (state) => !ONLY || ONLY.includes(state);

async function admin(browser) {
  for (const [vpName, vp] of Object.entries(VP)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    const go = async () => { await page.goto(BASE + "/", { waitUntil: "networkidle" }); await page.waitForTimeout(700); };
    await go();
    if (want("inicio")) { await full(page, `admin-inicio-${vpName}`, vp); await snap(page, `admin-inicio-top-${vpName}`); }
    if (want("tabs")) {
      await page.getByRole("tab", { name: "Mes actual" }).click();
      await full(page, `admin-inicio-tab-mes-${vpName}`, vp);
      await page.getByRole("tab", { name: "Stock" }).click();
      await full(page, `admin-inicio-tab-stock-${vpName}`, vp);
      await go();
    }
    if (want("hover")) {
      await page.getByRole("button", { name: "Cerrar caja" }).hover();
      await snap(page, `admin-inicio-hover-quickaction-${vpName}`);
      await page.mouse.move(0, 0);
    }
    const open = async (label) => { await page.getByRole("button", { name: label, exact: true }).click(); await page.getByRole("dialog").first().waitFor(); await page.waitForTimeout(300); };
    const close = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(300); };
    if (want("gasto")) {
      await open("Cargar gasto");
      await snap(page, `admin-dialog-gasto-${vpName}`);
      await page.getByRole("button", { name: "Guardar" }).click();
      await page.getByText("La descripción es obligatoria.").waitFor();
      await snap(page, `admin-dialog-gasto-error-${vpName}`);
      await close();
    }
    if (want("compra")) { await open("Cargar compra"); await snap(page, `admin-dialog-compra-${vpName}`); await close(); }
    if (want("producto")) {
      await open("Cargar producto");
      await snap(page, `admin-dialog-producto-${vpName}`);
      await page.getByRole("radio", { name: "Insumo" }).click();
      await snap(page, `admin-dialog-producto-insumo-${vpName}`);
      await close();
    }
    await ctx.close();
  }
  if (want("dark")) {
    const ctx = await browser.newContext({ viewport: VP.desktop, deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await full(page, "admin-inicio-dark-desktop", VP.desktop);
    await ctx.close();
  }
}

async function cashier(browser) {
  for (const [vpName, vp] of Object.entries(VP)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await full(page, `cajero-home-${process.env.CASHIER_STATE || "conventas"}-${vpName}`, vp);
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  await (ROLE === "admin" ? admin(browser) : cashier(browser));
  await browser.close();
})();
