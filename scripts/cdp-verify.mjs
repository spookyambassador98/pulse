// Drives the elevated Electron window via Chrome DevTools Protocol so we
// don't need OS-level input injection (which UIPI blocks for a lower
// integrity process talking to an elevated one).
const CDP_PORT = 9333;

async function getTarget() {
  const res = await fetch(`http://localhost:${CDP_PORT}/json`);
  const list = await res.json();
  return list.find((t) => t.type === "page");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", (e) => reject(e));
  });
}

let msgId = 1;
function send(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    const handler = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id === id) {
        ws.removeEventListener("message", handler);
        resolve(data.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression) {
  const result = await send(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result?.result?.value;
}

async function screenshot(ws, path) {
  const result = await send(ws, "Page.captureScreenshot", { format: "png" });
  const fs = await import("fs");
  fs.writeFileSync(path, Buffer.from(result.data, "base64"));
  console.log("saved screenshot:", path);
}

async function main() {
  const target = await getTarget();
  console.log("target:", target.url);
  const ws = await connect(target.webSocketDebuggerUrl);
  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");

  console.log("isDesktop bridge present:", await evaluate(ws, "!!window.pulseDesktop"));

  // Click the "Watch it live" CTA — find any button/element whose text
  // includes "Watch it live" and click it for real (real DOM dispatchEvent
  // via a synthetic click on the actual element — not OS input, so no
  // hydration/animation-listener path is skipped).
  const clickedCta = await evaluate(
    ws,
    `(() => {
      const all = Array.from(document.querySelectorAll('button, a'));
      const btn = all.find(el => el.textContent.includes('Watch it live'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`
  );
  console.log("clicked CTA:", clickedCta);

  await new Promise((r) => setTimeout(r, 1200));
  await screenshot(ws, "shots/cdp-1-after-cta.png");

  const clickedAllow = await evaluate(
    ws,
    `(() => {
      const all = Array.from(document.querySelectorAll('button'));
      const btn = all.find(el => el.textContent.includes('Allow & watch'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`
  );
  console.log("clicked allow:", clickedAllow);

  await new Promise((r) => setTimeout(r, 3000));
  await screenshot(ws, "shots/cdp-2-live.png");

  const bodyText = await evaluate(ws, "document.body.innerText.slice(0, 2000)");
  console.log("--- body text snapshot ---");
  console.log(bodyText);

  // Trigger a manual connect too, to test the real TCP handshake path.
  const typedAndSubmitted = await evaluate(
    ws,
    `(() => {
      const input = document.querySelector('input[placeholder="google.com"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'cloudflare.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const form = input.closest('form');
      form.requestSubmit();
      return true;
    })()`
  );
  console.log("submitted connect:", typedAndSubmitted);

  await new Promise((r) => setTimeout(r, 3000));
  await screenshot(ws, "shots/cdp-3-after-connect.png");

  const bodyText2 = await evaluate(ws, "document.body.innerText.slice(0, 2000)");
  console.log("--- body text after connect ---");
  console.log(bodyText2);

  ws.close();
}

main().catch((err) => {
  console.error("CDP drive failed:", err);
  process.exit(1);
});
