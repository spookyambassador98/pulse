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

  getCaptureStatus() {
    return ipcRenderer.invoke("get-capture-status");
  },

  setFullscreen(on) {
    return ipcRenderer.invoke("set-fullscreen", on);
  },

  connectTo(host, port) {
    return ipcRenderer.invoke("connect-to", host, port);
  },

  reverseDns(ip) {
    return ipcRenderer.invoke("reverse-dns", ip);
  },

  getPrivilege() {
    return ipcRenderer.invoke("get-privilege");
  },

  requestElevation() {
    return ipcRenderer.invoke("request-elevation");
  },

  consumeWatchIntent() {
    return ipcRenderer.invoke("consume-watch-intent");
  },

  toggleNode(ip, enabled) {
    return ipcRenderer.invoke("toggle-node", ip, enabled);
  },

  openDestination(href) {
    return ipcRenderer.invoke("open-destination", href);
  },

  revealPath(filePath) {
    return ipcRenderer.invoke("reveal-path", filePath);
  },
});
