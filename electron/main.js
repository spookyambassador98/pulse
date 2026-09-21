// Electron main process. Wraps the exact same Next.js app the website
// runs, but adds what a browser tab structurally cannot see: real,
// system-wide active network connections (every process on this machine,
// not just this window) and a raw TCP handshake for the "connect to any
// host" feature — no packet-capture driver, no admin elevation required.

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const dns = require("dns").promises;
const fs = require("fs");

// Elevated (Run as Administrator) launches don't have a visible console —
// log crashes to a file so they're diagnosable after the fact. A packaged
// install lives under Program Files, which a normal user can't write to —
// userData (%APPDATA%/Pulse) is always writable regardless of install mode.
const CRASH_LOG = app.isPackaged
  ? path.join(app.getPath("userData"), "crash.log")
  : path.join(__dirname, "..", "crash.log");
function logLine(msg) {
  try {
    fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* noop */
  }
}
process.on("uncaughtException", (err) => logLine(`uncaughtException: ${err.stack || err}`));
process.on("unhandledRejection", (err) => logLine(`unhandledRejection: ${err}`));
logLine("=== main.js starting ===");

let si;
try {
  si = require("systeminformation");
} catch {
  si = null;
}

const { startCapture, isAvailable: captureAvailable } = require("./capture");
const { cachedName, requestLookup, resolvePeer } = require("./peerNames");
const { isAdmin, relaunchElevated } = require("./privilege");
const netControl = require("./netControl");
let activeCapture = null;
// Capture starts once at boot, before the renderer has opened the monitor
// (and therefore before it's subscribed to the "capture-status" push). Cache
// the last status so a late subscriber can pull it instead of missing the
// one-shot event entirely.
let lastCaptureStatus = { active: false, reason: "not started yet" };

const PORT = 4823;
const PROJECT_ROOT = path.join(__dirname, "..");

// Dev runs (`npm run electron`) read the Next.js build straight out of the
// project. A packaged install has no dev source tree — electron-builder
// copies the whole app (electron/, .next/, public/, node_modules/) into
// resources/app instead (see package.json's "build" -> "files").
const APP_ROOT = app.isPackaged ? path.join(process.resourcesPath, "app") : PROJECT_ROOT;
const ICON_PATH = path.join(APP_ROOT, "resources", "icon.ico");

app.setName("Pulse");
app.setAppUserModelId("com.pulse.desktop");
Menu.setApplicationMenu(null);
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-background-timer-throttling");

const HANDOFF = process.argv.includes("--pulse-handoff");
let win = null;
let pollTimer = null;
let httpServer = null;
let blockedNodes = new Set();
const blockedMeta = new Map();
let lastRows = [];
let processCache = { at: 0, byPid: new Map() };
const elevated = isAdmin();
logLine(`privilege: ${elevated ? "administrator" : "user"}`);

function attachInstanceHandlers() {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

function bootWhenReady() {
  app.whenReady().then(async () => {
    logLine("app ready, starting next server");
    blockedNodes = netControl.loadBlocked();
    if (elevated) {
      for (const ip of blockedNodes) {
        netControl.blockIp(ip).catch(() => {});
      }
    }
    try {
      await startNextServer();
      await createWindow();
      logLine("window created");
      startNetworkMonitor();
      logLine("network monitor started");
      startPacketCapture();
      logLine("packet capture start attempted");
    } catch (err) {
      logLine(`startup failure: ${err.stack || err}`);
      console.error("Failed to start Pulse desktop shell:", err);
      app.quit();
    }
  });
}

function takeLockAndBoot() {
  const gotLock = app.requestSingleInstanceLock();
  logLine(`single-instance lock: ${gotLock}`);
  if (!gotLock) {
    app.quit();
    return;
  }
  attachInstanceHandlers();
  bootWhenReady();
}

if (HANDOFF) {
  logLine("elevation handoff — waiting for previous instance to release lock");
  setTimeout(takeLockAndBoot, 900);
} else {
  takeLockAndBoot();
}

// Next.js is run in-process (its official programmatic/custom-server API)
// instead of spawned as a child process. A spawned child would re-run this
// same packaged .exe as "node" — but the .exe's manifest requires admin
// (needed for raw packet capture), and Windows refuses ordinary
// CreateProcess launches of an elevation-required binary with
// ERROR_ELEVATION_REQUIRED even when the parent is already elevated. Running
// in-process sidesteps that entirely: one process, no re-launch.
async function startNextServer() {
  logLine(`starting in-process Next.js server from ${APP_ROOT}`);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const next = require("next");
  const nextApp = next({ dev: false, dir: APP_ROOT, hostname: "127.0.0.1", port: PORT });
  await nextApp.prepare();
  const handler = nextApp.getRequestHandler();
  httpServer = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(PORT, "127.0.0.1", () => resolve());
  });
  logLine("next server listening");
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#06070a",
    title: "Pulse",
    icon: ICON_PATH,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("focus", () => {
    poll();
  });
  await win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.on("window-all-closed", () => {
  stopNetworkMonitor();
  activeCapture?.stop();
  httpServer?.close();
  app.quit();
});

// ---- real packet capture (WinPcap/Npcap) -------------------------------
// Individual decoded TCP packets, straight off the wire — the literal
// thing the browser version can only ever approximate.

let pktBurst = 0;
let pktBurstAt = 0;

function rendererIsHot() {
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) return false;
  return true;
}

function sendPacket(pkt) {
  if (!rendererIsHot()) return;
  if (blockedNodes.has(pkt.remoteIp)) return;
  const now = Date.now();
  if (now - pktBurstAt >= 1000) {
    pktBurstAt = now;
    pktBurst = 0;
  }
  if (pktBurst++ > 36) return;
  win.webContents.send("packet", pkt);
}

function startPacketCapture() {
  if (!win || win.isDestroyed()) return;

  if (!captureAvailable()) {
    logLine("capture unavailable: native module did not load");
    lastCaptureStatus = { active: false, reason: "native module unavailable" };
    win.webContents.send("capture-status", lastCaptureStatus);
    return;
  }

  let result;
  try {
    result = startCapture((pkt) => {
      sendPacket(pkt);
    });
  } catch (err) {
    logLine(`startCapture threw: ${err.stack || err}`);
    lastCaptureStatus = { active: false, reason: String(err.message || err) };
    win.webContents.send("capture-status", lastCaptureStatus);
    return;
  }

  if (!result.ok) {
    logLine(`capture failed to start: ${result.reason}`);
    console.warn("[capture] failed to start:", result.reason);
    lastCaptureStatus = { active: false, reason: result.reason };
    win.webContents.send("capture-status", lastCaptureStatus);
    return;
  }

  logLine(`capture started on device: ${result.device.name} (${result.device.description})`);
  activeCapture = result;
  lastCaptureStatus = {
    active: true,
    device: result.device.name,
    description: result.device.description,
  };
  win.webContents.send("capture-status", lastCaptureStatus);
}

// ---- real, system-wide network monitor ---------------------------------
// systeminformation.networkConnections() reads the OS's own connection
// table (the same data `netstat` shows). Administrator rights unlock the
// owning process name, the exe path, and the ability to cut a socket.

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

async function refreshProcessCache() {
  if (!si) return;
  if (Date.now() - processCache.at < 4000) return;
  try {
    const procs = await si.processes();
    const byPid = new Map();
    for (const p of procs.list || []) {
      byPid.set(Number(p.pid), {
        name: p.name || null,
        path: p.path || p.command || null,
      });
    }
    processCache = { at: Date.now(), byPid };
  } catch {
    /* keep last cache */
  }
}

function enrichRow(c) {
  const pid = c.pid ? Number(c.pid) : null;
  const proc = pid ? processCache.byPid.get(pid) : null;
  requestLookup(c.peerAddress);
  const remote = String(c.peerAddress).replace(/^::ffff:/, "");
  return {
    remote,
    port: Number(c.peerPort) || 0,
    localAddress: c.localAddress ? String(c.localAddress).replace(/^::ffff:/, "") : null,
    localPort: Number(c.localPort) || 0,
    process: c.process || proc?.name || null,
    processPath: proc?.path || null,
    pid,
    protocol: c.protocol || "tcp",
    name: cachedName(remote),
    blocked: blockedNodes.has(remote),
    href: null,
  };
}

async function poll() {
  if (!si || !win || win.isDestroyed()) return;
  try {
    await refreshProcessCache();
    const conns = await si.networkConnections();
    const active = conns
      .filter(
        (c) =>
          c.peerAddress &&
          c.peerAddress !== "0.0.0.0" &&
          c.peerAddress !== "*" &&
          c.peerAddress !== "::" &&
          c.state === "ESTABLISHED" &&
          !isLoopback(c.peerAddress)
      )
      .map(enrichRow);

    lastRows = active;

    const byRemote = new Map();
    for (const row of active) {
      const prev = byRemote.get(row.remote);
      if (!prev) {
        byRemote.set(row.remote, { ...row, href: netControl.destinationHref(row) });
        continue;
      }
      if (!prev.processPath && row.processPath) prev.processPath = row.processPath;
      if (!prev.process && row.process) prev.process = row.process;
    }

    for (const ip of blockedNodes) {
      if (byRemote.has(ip)) continue;
      const meta = blockedMeta.get(ip) || {};
      byRemote.set(ip, {
        remote: ip,
        port: meta.port || 0,
        localAddress: null,
        localPort: 0,
        process: meta.process || null,
        processPath: meta.processPath || null,
        pid: meta.pid || null,
        protocol: "tcp",
        name: meta.name || cachedName(ip),
        blocked: true,
        href: netControl.destinationHref({ name: meta.name, ip, host: ip, port: meta.port }),
      });
    }

    const snapshot = [...byRemote.values()].slice(0, 40);
    if (!rendererIsHot()) return;
    win.webContents.send("network-snapshot", {
      at: Date.now(),
      elevated,
      connections: snapshot,
    });
  } catch (err) {
    console.error("network poll failed:", err);
  }
}

// ---- real TCP handshake for the "Connect to" box -----------------------
// A raw socket connect: the promise resolves on the socket's 'connect'
// event, which only fires after the real SYN / SYN-ACK / ACK exchange
// completes. This is the actual three-way handshake, timed live.

function tryTcpConnect(host, port, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let settled = false;
    const socket = net.connect({ host, port, timeout: timeoutMs });

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

    socket.once("connect", () => {
      const raw = socket.remoteAddress || undefined;
      const address = raw ? raw.replace(/^::ffff:/, "") : undefined;
      finish({ ok: true, ms: Date.now() - t0, host, port, address });
    });
    socket.once("timeout", () => finish({ ok: false, ms: Date.now() - t0, host, port, reason: "timeout" }));
    socket.once("error", (err) =>
      finish({ ok: false, ms: Date.now() - t0, host, port, reason: err.code || err.message })
    );
  });
}

// Real TCP handshake. Prefer 443, then 80, unless the user specified a port.
ipcMain.handle("connect-to", async (_evt, host, port) => {
  const ports = Number(port) > 0 ? [Number(port)] : [443, 80];
  let last = { ok: false, ms: 0, host, reason: "unreachable" };
  for (const p of ports) {
    last = await tryTcpConnect(host, p);
    if (last.ok) return last;
  }
  return last;
});

ipcMain.handle("get-capture-status", () => lastCaptureStatus);

ipcMain.handle("set-fullscreen", (_evt, on) => {
  if (!win || win.isDestroyed()) return { fullscreen: false };
  win.setFullScreen(Boolean(on));
  return { fullscreen: win.isFullScreen() };
});

ipcMain.handle("reverse-dns", async (_evt, ip) => {
  if (!ip) return null;
  requestLookup(ip);
  const cached = cachedName(ip);
  if (cached) return cached;
  try {
    return await resolvePeer(ip);
  } catch {
    return null;
  }
});

ipcMain.handle("get-privilege", () => ({ elevated }));

ipcMain.handle("request-elevation", async () => {
  if (elevated) return { elevated: true };
  logLine("elevation requested from Start watching");
  try {
    fs.writeFileSync(path.join(app.getPath("userData"), "watch-intent"), "1");
  } catch {
    /* still try to elevate */
  }
  const ok = await relaunchElevated();
  if (!ok) {
    logLine("elevation declined or failed");
    try {
      fs.unlinkSync(path.join(app.getPath("userData"), "watch-intent"));
    } catch {
      /* noop */
    }
    return { elevated: false, reason: "declined" };
  }
  try {
    app.releaseSingleInstanceLock();
  } catch {
    /* older electron */
  }
  setTimeout(() => app.quit(), 250);
  return { elevated: false, relaunching: true };
});

ipcMain.handle("consume-watch-intent", () => {
  const intent = path.join(app.getPath("userData"), "watch-intent");
  try {
    if (!fs.existsSync(intent)) return false;
    fs.unlinkSync(intent);
    return true;
  } catch {
    return false;
  }
});

const killLoops = new Map();

function stopKillLoop(ip) {
  const t = killLoops.get(ip);
  if (t) clearInterval(t);
  killLoops.delete(ip);
}

function startKillLoop(ip) {
  stopKillLoop(ip);
  let n = 0;
  const t = setInterval(() => {
    n += 1;
    if (!blockedNodes.has(ip) || n > 12) {
      stopKillLoop(ip);
      return;
    }
    netControl.killTcpToIp(ip).catch(() => {});
  }, 180);
  killLoops.set(ip, t);
}

ipcMain.handle("toggle-node", async (_evt, ip, enabled) => {
  const remote = String(ip || "").replace(/^::ffff:/, "");
  if (!remote) return { ok: false, reason: "no-ip" };

  if (enabled) {
    stopKillLoop(remote);
    blockedNodes.delete(remote);
    const meta = blockedMeta.get(remote);
    const fw = await netControl.unblockIp(remote);
    if (meta?.serviceName) await netControl.startService(meta.serviceName);
    netControl.saveBlocked(blockedNodes);
    logLine(`node enabled: ${remote}`);
    return { ok: true, blocked: false };
  }

  if (!elevated) {
    return { ok: false, reason: "need-admin" };
  }

  const sample = lastRows.find((r) => r.remote === remote) || blockedMeta.get(remote) || {};
  const isolated = await netControl.isolateIp(remote);
  let serviceName = sample.serviceName || null;
  const procName = sample.process || "";
  if (sample.pid && !/^svchost/i.test(procName) && !/^System$/i.test(procName) && !/^Idle$/i.test(procName)) {
    serviceName = (await netControl.stopServiceByPid(sample.pid)) || serviceName;
  }
  blockedNodes.add(remote);
  blockedMeta.set(remote, {
    name: sample.name,
    port: sample.port,
    process: sample.process,
    processPath: sample.processPath,
    pid: sample.pid,
    serviceName,
  });
  netControl.saveBlocked(blockedNodes);
  startKillLoop(remote);
  logLine(
    `node cut: ${remote} tcp=${isolated.closed} fw=${isolated.firewall} route=${isolated.route} svc=${serviceName || "-"}`
  );
  return {
    ok: isolated.ok,
    blocked: isolated.ok,
    closed: isolated.closed,
    firewall: isolated.firewall,
    route: isolated.route,
    service: serviceName,
    reason: isolated.ok ? null : isolated.reason || "need-admin",
  };
});

ipcMain.handle("open-destination", async (_evt, href) => netControl.openHref(href));

ipcMain.handle("reveal-path", async (_evt, filePath) => netControl.revealPath(filePath));
