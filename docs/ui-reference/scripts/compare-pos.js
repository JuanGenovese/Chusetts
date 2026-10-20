// Screenshots the Next "Nueva venta" page in the same states/viewports as the Streamlit reference (cajero-pos-*).
// Usage: node compare-pos.js <baseUrl> <outDir> <user> <password>   (needs playwright-core + Chrome; local stack only)
const { chromium } = require(process.env.PW_CORE || "playwright-core");
const BASE = process.argv[2] || "http://localhost:3100";
const OUT = process.argv[3] || __dirname + "/../compare";
const USER = process.argv[4] || "cajero";
const PASS = process.argv[5] || "cajero-local-1234";
const VP = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

async function full(page, name, vp) {
  const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(h, vp.height), 5000) });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.setViewportSize(vp);
  console.log("shot", name);
}
const nav = async (page, path) => { await page.goto(BASE + path, { waitUntil: "networkidle" }); await page.waitForTimeout(600); };
const add = async (page, name, times = 1) => {
  for (let i = 0; i < times; i++) {
    await page.locator(".product-card", { hasText: name }).locator("xpath=following-sibling::button[1]").click();
    await page.waitForTimeout(150);
  }
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  for (const [vpName, vp] of Object.entries(VP)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.getByLabel("Usuario").fill(USER);
    await page.locator("input[name=password]").fill(PASS);
    await page.getByRole("button", { name: /Ingresar/ }).click();
    await page.waitForURL(BASE + "/", { timeout: 20000 });
    // Start every viewport from a closed register so the "sin turno" state is captured too.
    await nav(page, "/mi-turno");
    if (await page.getByRole("button", { name: "Cerrar caja y generar backup" }).count()) {
      await page.getByRole("button", { name: "Cerrar caja y generar backup" }).click();
      await page.getByText(/Caja cerrada\. Diferencia/).waitFor();
    }
    await nav(page, "/nueva-venta");
    const blocked = await page.getByText("Necesitás abrir tu turno").count();
    if (blocked) {
      await full(page, `cajero-pos-sinturno-${vpName}`, vp);
      await nav(page, "/mi-turno");
      await page.getByLabel("Efectivo inicial").fill("5000");
      await page.getByRole("button", { name: "Abrir caja" }).click();
      await page.getByText("Caja abierta. Ya podés registrar ventas.").waitFor();
      await nav(page, "/nueva-venta");
    }
    await full(page, `cajero-pos-carritovacio-${vpName}`, vp);
    await add(page, "Agua mineral");
    await add(page, "Pinta IPA", vpName === "desktop" ? 2 : 1);
    await full(page, `cajero-pos-carrito-${vpName}`, vp);
    await page.getByLabel("Medio de pago").selectOption({ label: "Nave" });
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await page.getByText(/Venta confirmada\. Ticket:/).waitFor();
    await page.waitForTimeout(500);
    await full(page, `cajero-pos-ventaconfirmada-${vpName}`, vp);
    await ctx.close();
  }
  await browser.close();
})();
