import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const outDir = path.resolve("shots");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function shot(name, { viewport, reducedMotion = false, action } = {}) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (action) await action(page);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  console.log(name, overflow);
  await context.close();
}

await shot("desktop-hero", { viewport: { width: 1440, height: 900 } });
await shot("mobile-hero", { viewport: { width: 390, height: 844 } });
await shot("desktop-reduced-motion", { viewport: { width: 1440, height: 900 }, reducedMotion: true });

await shot("desktop-monitor-consent", {
  viewport: { width: 1440, height: 900 },
  action: async (page) => {
    await page.getByText("Watch it live").click();
    await page.waitForTimeout(500);
  },
});

await shot("desktop-monitor-live", {
  viewport: { width: 1440, height: 900 },
  action: async (page) => {
    await page.getByText("Watch it live").click();
    await page.waitForTimeout(400);
    await page.getByText("Allow & watch").click();
    await page.waitForTimeout(2200);
  },
});

await shot("mobile-diagnosis", {
  viewport: { width: 390, height: 844 },
  action: async (page) => {
    await page.mouse.wheel(0, 2600);
    await page.waitForTimeout(600);
  },
});

await browser.close();
console.log("done");
