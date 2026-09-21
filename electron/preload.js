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

  connectTo(host) {
    return ipcRenderer.invoke("connect-to", host);
  },

  reverseDns(ip) {
    return ipcRenderer.invoke("reverse-dns", ip);
  },
});
