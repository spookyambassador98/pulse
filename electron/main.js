// Electron main process. Wraps the exact same Next.js app the website
// runs, but adds what a browser tab structurally cannot see: real,
// system-wide active network connections (every process on this machine,
// not just this window) and a raw TCP handshake for the "connect to any
// host" feature — no packet-capture driver, no admin elevation required.

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const dns = require("dns").promises;
const { spawn } = require("child_process");

let si;
try {
  si = require("systeminformation");
} catch {
  si = null;
}

const PORT = 4823;
const PROJECT_ROOT = path.join(__dirname, "..");

let win = null;
let nextProcess = null;
let pollTimer = null;

function waitForServer(url, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out waiting for the Next.js server to come up."));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

function startNextServer() {
  const nextBin = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
  // Electron's own binary can act as a plain Node runtime for spawned
  // scripts when ELECTRON_RUN_AS_NODE=1 is set — avoids depending on a
  // separate system Node install to run `next start`.
  nextProcess = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#06070a",
    title: "Pulse — Desktop Monitor",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await waitForServer(`http://localhost:${PORT}`);
  await win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(async () => {
  startNextServer();
  try {
    await createWindow();
    startNetworkMonitor();
  } catch (err) {
    console.error("Failed to start Pulse desktop shell:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopNetworkMonitor();
  nextProcess?.kill();
  app.quit();
});

// ---- real, system-wide network monitor ---------------------------------
// systeminformation.networkConnections() reads the OS's own connection
// table (the same data `netstat` shows) — every established TCP/UDP
// connection on the machine, with the owning process name and PID. No
// driver, no elevation.

function startNetworkMonitor() {
  poll();
  pollTimer = setInterval(poll, 1200);
}

function stopNetworkMonitor() {
  if (pollTimer) clearInterval(pollTimer);
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address.startsWith("127.");
}

async function poll() {
  if (!si || !win || win.isDestroyed()) return;
  try {
    const conns = await si.networkConnections();
    const active = conns
      .filter(
        (c) =>
          c.peerAddress &&
          c.peerAddress !== "0.0.0.0" &&
          c.peerAddress !== "*" &&
          c.peerAddress !== "::" &&
          c.state === "ESTABLISHED" &&
          // Loopback traffic (this dev server talking to itself, etc.) is
          // real but not interesting — it drowns out actual outbound
          // connections in the diagram.
          !isLoopback(c.peerAddress)
      )
      .map((c) => ({
        remote: c.peerAddress,
        port: c.peerPort,
        process: c.process || null,
        pid: c.pid || null,
        protocol: c.protocol || "tcp",
      }))
      // Cap the fan-out so the diagram stays readable; keep the most
      // recently-relevant looking entries (systeminformation already
      // orders by however the OS reports them, which tends to be recent).
      .slice(0, 14);
    win.webContents.send("network-snapshot", { at: Date.now(), connections: active });
  } catch (err) {
    console.error("network poll failed:", err);
  }
}

// ---- real TCP handshake for the "Connect to" box -----------------------
// A raw socket connect: the promise resolves on the socket's 'connect'
// event, which only fires after the real SYN / SYN-ACK / ACK exchange
// completes. This is the actual three-way handshake, timed live.

ipcMain.handle("connect-to", (_evt, host) => {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    const socket = net.connect({ host, port: 443, timeout: 6000 });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* noop */
      }
      resolve(result);
    };

    socket.once("connect", () => finish({ ok: true, ms: Date.now() - t0, host }));
    socket.once("timeout", () => finish({ ok: false, ms: Date.now() - t0, host, reason: "timeout" }));
    socket.once("error", (err) => finish({ ok: false, ms: Date.now() - t0, host, reason: err.code || err.message }));
  });
});

ipcMain.handle("reverse-dns", async (_evt, ip) => {
  try {
    const names = await dns.reverse(ip);
    return names[0] || null;
  } catch {
    return null;
  }
});
