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

// Connect to several real hosts to see the radial spread with more nodes.
for (const host of ["google.com", "github.com", "cloudflare.com", "wikipedia.org", "vercel.com"]) {
  await page.getByPlaceholder("google.com").fill(host);
  await page.getByText("↵ run").click();
  await page.waitForTimeout(1400);
}
await page.screenshot({ path: "shots/live-radial.png" });

await page.waitForTimeout(1500);
await page.screenshot({ path: "shots/live-radial-2.png" });

console.log("console errors:", consoleErrors.length ? consoleErrors : "none");

await browser.close();
