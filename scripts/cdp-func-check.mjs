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
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 8000);
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
  console.log("saved:", path);
}

async function main() {
  const target = await getTarget();
  const ws = await connect(target.webSocketDebuggerUrl);
  await send(ws, "Page.enable");

  const report = await evaluate(
    ws,
    `(() => {
      const text = document.body.innerText;
      return {
        desktop: !!window.pulseDesktop,
        hasPulseShell: /Network monitor/i.test(text) || /PERMISSION REQUEST/i.test(text),
        hasLanding: /WATCH IT LIVE/i.test(text),
        hasAllow: Array.from(document.querySelectorAll('button')).some(b => /Allow/.test(b.textContent)),
      };
    })()`
  );
  console.log("boot:", JSON.stringify(report));

  const allow = await evaluate(
    ws,
    `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(el => /Allow/.test(el.textContent));
      if (!btn) return false;
      btn.click();
      return true;
    })()`
  );
  console.log("allow clicked:", allow);

  await new Promise((r) => setTimeout(r, 4500));
  await screenshot(ws, "shots/func-live.png");

  const live = await evaluate(
    ws,
    `(() => {
      const text = document.body.innerText;
      const connHeader = /CONNECTIONS\\s+(\\d+)/i.exec(text);
      return {
        capture: /RAW CAPTURE/i.test(text) || /Connection polling/i.test(text),
        connections: connHeader ? Number(connHeader[1]) : 0,
        hasDevice: /DEVICE/.test(text),
        hasPacketLog: /PACKET LOG/i.test(text),
        hasConnect: /connect_to/i.test(text),
        hasLanding: /WATCH IT LIVE/i.test(text),
        snippet: text.replace(/\\s+/g, ' ').slice(0, 900),
      };
    })()`
  );
  console.log("live:", JSON.stringify(live, null, 2));

  const submitted = await evaluate(
    ws,
    `(() => {
      const input = document.querySelector('input[placeholder="google.com"]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'google.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.closest('form').requestSubmit();
      return true;
    })()`
  );
  console.log("connect google.com:", submitted);

  await new Promise((r) => setTimeout(r, 3500));
  await screenshot(ws, "shots/func-connect.png");

  const after = await evaluate(
    ws,
    `(() => {
      const text = document.body.innerText;
      return {
        google: /google/i.test(text),
        synack: /SYN-ACK/i.test(text),
        packets: /ACK|SYN|FIN|RST/.test(text),
        snippet: text.split('PACKET LOG')[1]?.replace(/\\s+/g, ' ')?.slice(0, 400) || text.slice(-400),
      };
    })()`
  );
  console.log("after connect:", JSON.stringify(after, null, 2));

  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
