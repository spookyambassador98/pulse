// Drives the desktop shell via CDP — consent → live, screenshot.
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
      if (id === data.id) {
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
  console.log("saved:", path);
}

async function main() {
  const target = await getTarget();
  const ws = await connect(target.webSocketDebuggerUrl);
  await send(ws, "Page.enable");

  console.log("desktop:", await evaluate(ws, "!!window.pulseDesktop"));

  const allow = await evaluate(
    ws,
    `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Allow'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`
  );
  console.log("allow clicked:", allow);

  await new Promise((r) => setTimeout(r, 4000));
  await screenshot(ws, "shots/desktop-live.png");

  await new Promise((r) => setTimeout(r, 3000));
  await screenshot(ws, "shots/desktop-live-2.png");

  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
