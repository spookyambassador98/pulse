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
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timer = setTimeout(() => reject(new Error(method)), 8000);
    const handler = (ev) => {
      const data = JSON.parse(ev.data);
      if (data.id === id) {
        clearTimeout(timer);
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
  console.log("saved", path);
}

async function main() {
  const target = await getTarget();
  const ws = await connect(target.webSocketDebuggerUrl);
  await send(ws, "Page.enable");
  await evaluate(
    ws,
    `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => /Allow/.test(el.textContent));
      if (btn) btn.click();
      return !!btn;
    })()`
  );
  await new Promise((r) => setTimeout(r, 5000));
  await screenshot(ws, "shots/names-live.png");
  const names = await evaluate(
    ws,
    `(() => {
      const rows = Array.from(document.querySelectorAll('td')).map(t => t.innerText.trim()).filter(Boolean);
      return document.body.innerText.split('CONNECTIONS')[1]?.slice(0, 1200);
    })()`
  );
  console.log(names);
  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
