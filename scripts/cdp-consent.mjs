const res = await fetch("http://127.0.0.1:9333/json");
const list = await res.json();
const target = list.find((t) => t.type === "page") || list[0];
if (!target) throw new Error("no page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.addEventListener("open", r);
  ws.addEventListener("error", j);
});
let id = 1;
function send(method, params = {}) {
  return new Promise((resolve) => {
    const myId = id++;
    const handler = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id === myId) {
        ws.removeEventListener("message", handler);
        resolve(d);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
await send("Page.enable");
const ev = await send("Runtime.evaluate", {
  returnByValue: true,
  expression:
    "({ desktop: !!window.pulseDesktop, text: document.body.innerText.slice(0, 1200), buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()) })",
});
console.log(JSON.stringify(ev.result.result.value, null, 2));
const shot = await send("Page.captureScreenshot", { format: "png" });
const fs = await import("fs");
fs.mkdirSync("shots", { recursive: true });
fs.writeFileSync("shots/desktop-consent.png", Buffer.from(shot.result.data, "base64"));
console.log("saved shots/desktop-consent.png");
ws.close();
