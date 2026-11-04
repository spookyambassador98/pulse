const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "docs", "screenshots");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function redactIdentity(win) {
  await win.webContents.executeJavaScript(`(() => {
    const allow = new Set([
      "127.0.0.1",
      "0.0.0.0",
      "8.8.8.8",
      "1.1.1.1",
      "9.9.9.9",
      "1.0.0.1",
      "8.8.4.4",
    ]);
    const ipv4 = /\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b/g;
    const ipv6 = /\\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}\\b/gi;
    const mac = /\\b[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}\\b/g;
    const users = /(?:[A-Za-z]:)?\\\\Users\\\\[^\\\\\\s]+/gi;
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        let t = node.nodeValue || "";
        t = t.replace(mac, "••:••:••:••:••:••");
        t = t.replace(users, "\\\\Users\\\\…");
        t = t.replace(ipv6, "2001:db8::");
        t = t.replace(ipv4, (m) => (allow.has(m) ? m : "×.×.×.×"));
        node.nodeValue = t;
      }
      for (const child of node.childNodes) walk(child);
    };
    walk(document.body);
    return true;
  })()`);
}

async function saveShot(win, name) {
  fs.mkdirSync(DIR, { recursive: true });
  await redactIdentity(win);
  const img = await win.webContents.capturePage();
  const dest = path.join(DIR, name);
  fs.writeFileSync(dest, img.toPNG());
  return dest;
}

function clickButtonByText(win, pattern) {
  const source = `(() => {
    const re = ${pattern};
    const btn = [...document.querySelectorAll("button")].find((el) => re.test((el.textContent || "").trim()));
    if (!btn) return false;
    btn.click();
    return true;
  })()`;
  return win.webContents.executeJavaScript(source);
}

async function waitFor(win, source, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await win.webContents.executeJavaScript(source);
    if (ok) return true;
    await delay(250);
  }
  return false;
}

async function runShots(win) {
  await waitFor(
    win,
    `!![...document.querySelectorAll("button")].find((el) => /start watching/i.test(el.textContent || ""))`,
    12000
  );
  await delay(400);
  await saveShot(win, "consent.png");

  const started = await clickButtonByText(win, "/start watching/i");
  if (!started) throw new Error("Start watching button was not on screen");

  const live = await waitFor(win, `!!document.querySelector('[data-synapse="google.com"]')`, 12000);
  if (!live) throw new Error("Demo map did not appear");
  await delay(800);
  await saveShot(win, "monitor.png");

  await win.webContents.executeJavaScript(`(() => {
    const node = document.querySelector('[data-synapse="google.com"]');
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const x = rect.left + Math.min(rect.width / 2, 8);
    const y = rect.top + Math.min(rect.height / 2, 8);
    node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y }));
    return true;
  })()`);
  await waitFor(win, `!!document.querySelector(".neuron-inspect")`, 4000);
  await delay(400);
  await saveShot(win, "inspect.png");

  const update = await clickButtonByText(win, "/check for updates/i");
  if (!update) throw new Error("Check for updates button was not on screen");
  await waitFor(
    win,
    `/is current|update failed|no windows installer/i.test(document.querySelector(".pulse-update-note")?.textContent || "")`,
    15000
  );
  await delay(500);
  await saveShot(win, "update.png");
}

module.exports = { runShots };
