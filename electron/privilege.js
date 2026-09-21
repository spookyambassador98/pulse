const { app } = require("electron");
const { execFileSync, spawn } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");

function isAdmin() {
  // `net session` returns 0 only for an elevated token. whoami /groups is
  // too slow (and can timeout) inside Electron, which made every relaunch
  // look like a normal user and kicked the window back to consent.
  try {
    execFileSync("net", ["session"], { stdio: "ignore", windowsHide: true, timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function relaunchElevated() {
  const exe = process.execPath;
  const wd = app.isPackaged ? path.dirname(exe) : PROJECT_ROOT;
  const argList = app.isPackaged
    ? "@('--pulse-handoff')"
    : `@(${psQuote(path.join(PROJECT_ROOT, "electron", "main.js"))}, '--pulse-handoff')`;

  const script = `
    $ErrorActionPreference = 'Stop'
    try {
      Start-Process -FilePath ${psQuote(exe)} -ArgumentList ${argList} -WorkingDirectory ${psQuote(wd)} -Verb RunAs
      exit 0
    } catch {
      exit 1223
    }
  `;

  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
      windowsHide: true,
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

module.exports = { isAdmin, relaunchElevated };
