import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

await page.getByText("Watch it live").click();
await page.waitForTimeout(400);
await page.getByText("Allow & watch").click();
await page.waitForTimeout(1600);
await page.screenshot({ path: "shots/live-single.png" });

// Connect to a real second host.
await page.getByPlaceholder("google.com").fill("google.com");
await page.getByText("Connect ↗").click();
await page.waitForTimeout(1800);
await page.screenshot({ path: "shots/live-two-connections.png" });

// Give the dots a moment to travel, then capture again.
await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/live-two-connections-2.png" });

console.log("console errors:", consoleErrors.length ? consoleErrors : "none");

await browser.close();
