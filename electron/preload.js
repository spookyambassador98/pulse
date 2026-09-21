// Runs in an isolated context with access to Node + the renderer's window.
// Exposes a small, explicit API instead of the raw ipcRenderer — the
// renderer never gets direct Node access (contextIsolation stays on).

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pulseDesktop", {
  isDesktop: true,

  onNetworkSnapshot(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("network-snapshot", handler);
    return () => ipcRenderer.removeListener("network-snapshot", handler);
  },

  onPacket(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("packet", handler);
    return () => ipcRenderer.removeListener("packet", handler);
  },

  onCaptureStatus(callback) {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("capture-status", handler);
    return () => ipcRenderer.removeListener("capture-status", handler);
  },

  // Capture starts once at boot — a listener attached after that already
  // fired is otherwise blind until the (rare) next status change. Pull the
  // current value once on subscribe instead of waiting for a push.
  getCaptureStatus() {
    return ipcRenderer.invoke("get-capture-status");
  },

  connectTo(host) {
    return ipcRenderer.invoke("connect-to", host);
  },

  reverseDns(ip) {
    return ipcRenderer.invoke("reverse-dns", ip);
  },
});
