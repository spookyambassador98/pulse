const { app, shell } = require("electron");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const RULE_PREFIX = "Pulse-node-";

function blockedStorePath() {
  return path.join(app.getPath("userData"), "blocked-nodes.json");
}

function loadBlocked() {
  try {
    const raw = JSON.parse(fs.readFileSync(blockedStorePath(), "utf8"));
    if (Array.isArray(raw)) return new Set(raw.filter((ip) => typeof ip === "string"));
  } catch {
    /* first run */
  }
  return new Set();
}

function saveBlocked(set) {
  try {
    fs.mkdirSync(path.dirname(blockedStorePath()), { recursive: true });
    fs.writeFileSync(blockedStorePath(), JSON.stringify([...set], null, 2));
  } catch {
    /* userData should be writable */
  }
}

function run(cmd, args, timeoutMs = 12000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: err ? String(err.message || err) : null,
      });
    });
  });
}

function runPs(script, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, stdout, stderr: stderr || "timeout" });
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: String(err) });
    });
  });
}

function ruleName(ip) {
  return `${RULE_PREFIX}${ip}`;
}

function assertIpv4(ip) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

async function killTcpToIp(ip) {
  if (!assertIpv4(ip)) return { ok: false, closed: 0, detail: "bad-ip" };
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Net;
using System.Runtime.InteropServices;
public class PulseIsolate {
  [StructLayout(LayoutKind.Sequential)]
  public struct MIB_TCPROW {
    public uint dwState;
    public uint dwLocalAddr;
    public uint dwLocalPort;
    public uint dwRemoteAddr;
    public uint dwRemotePort;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct MIB_TCPROW_OWNER_PID {
    public uint state;
    public uint localAddr;
    public uint localPort;
    public uint remoteAddr;
    public uint remotePort;
    public uint owningPid;
  }
  [DllImport("iphlpapi.dll", SetLastError=true)]
  static extern uint SetTcpEntry(ref MIB_TCPROW pTcpRow);
  [DllImport("iphlpapi.dll", SetLastError=true)]
  static extern uint GetExtendedTcpTable(IntPtr pTcpTable, ref int dwOutBufLen, bool sort, int ipVersion, int tblClass, uint reserved);
  public static int KillIp(string ip) {
    uint want = BitConverter.ToUInt32(IPAddress.Parse(ip).GetAddressBytes(), 0);
    int len = 0;
    GetExtendedTcpTable(IntPtr.Zero, ref len, true, 2, 5, 0);
    IntPtr ptr = Marshal.AllocHGlobal(len);
    try {
      if (GetExtendedTcpTable(ptr, ref len, true, 2, 5, 0) != 0) return 0;
      int count = Marshal.ReadInt32(ptr);
      IntPtr rowPtr = IntPtr.Add(ptr, 4);
      int size = Marshal.SizeOf(typeof(MIB_TCPROW_OWNER_PID));
      int closed = 0;
      for (int i = 0; i < count; i++) {
        MIB_TCPROW_OWNER_PID row = Marshal.PtrToStructure<MIB_TCPROW_OWNER_PID>(rowPtr);
        if (row.remoteAddr == want) {
          MIB_TCPROW kill = new MIB_TCPROW();
          kill.dwState = 12;
          kill.dwLocalAddr = row.localAddr;
          kill.dwLocalPort = row.localPort;
          kill.dwRemoteAddr = row.remoteAddr;
          kill.dwRemotePort = row.remotePort;
          if (SetTcpEntry(ref kill) == 0) closed++;
        }
        rowPtr = IntPtr.Add(rowPtr, size);
      }
      return closed;
    } finally { Marshal.FreeHGlobal(ptr); }
  }
}
"@
[PulseIsolate]::KillIp('${ip}')
`;
  const result = await runPs(script, 20000);
  const closed = Number.parseInt(String(result.stdout).trim(), 10);
  return { ok: Number.isFinite(closed), closed: Number.isFinite(closed) ? closed : 0, detail: result.stderr };
}

async function blackhole(ip) {
  await run("route", ["delete", ip]);
  return run("route", ["add", ip, "mask", "255.255.255.255", "127.0.0.1", "metric", "1"]);
}

async function unblackhole(ip) {
  return run("route", ["delete", ip]);
}

async function blockIp(ip) {
  if (!assertIpv4(ip)) return { ok: false, stderr: "bad-ip" };
  const name = ruleName(ip);
  await runPs(
    `Get-NetFirewallRule -DisplayName '${name}','${name}-in' -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    12000
  );
  await run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}`]);
  await run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}-in`]);

  const fw = await runPs(
    `
$n='${name}'
New-NetFirewallRule -DisplayName $n -Direction Outbound -Action Block -RemoteAddress ${ip} -Protocol Any -Profile Any -Enabled True -ErrorAction Stop | Out-Null
New-NetFirewallRule -DisplayName ($n+'-in') -Direction Inbound -Action Block -RemoteAddress ${ip} -Protocol Any -Profile Any -Enabled True -ErrorAction Stop | Out-Null
'fw-ok'
`,
    15000
  );
  let fwOk = fw.ok && /fw-ok/.test(fw.stdout);
  if (!fwOk) {
    const out = await run("netsh", [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${name}`,
      "dir=out",
      "action=block",
      "protocol=any",
      `remoteip=${ip}`,
      "enable=yes",
      "profile=any",
    ]);
    const inbound = await run("netsh", [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${name}-in`,
      "dir=in",
      "action=block",
      "protocol=any",
      `remoteip=${ip}`,
      "enable=yes",
      "profile=any",
    ]);
    fwOk = out.ok && inbound.ok;
  }
  const route = await blackhole(ip);
  return { ok: fwOk || route.ok, firewall: fwOk, route: route.ok, stderr: fw.stderr || route.stderr };
}

async function unblockIp(ip) {
  if (!assertIpv4(ip)) return { ok: false };
  const name = ruleName(ip);
  await runPs(
    `Get-NetFirewallRule -DisplayName '${name}','${name}-in' -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    12000
  );
  await run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}`]);
  await run("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}-in`]);
  const route = await unblackhole(ip);
  return { ok: true, route: route.ok };
}

async function isolateIp(ip) {
  const killed = await killTcpToIp(ip);
  const fw = await blockIp(ip);
  await killTcpToIp(ip);
  return {
    ok: Boolean(fw.ok),
    closed: killed.closed,
    firewall: fw.firewall,
    route: fw.route,
    reason: fw.ok ? null : fw.stderr || "need-admin",
  };
}

async function stopServiceByPid(pid) {
  if (!pid) return null;
  const script = `
$svc = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -eq ${Number(pid)} } | Select-Object -First 1
if (-not $svc) { Write-Output 'NONE'; exit 0 }
Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
Write-Output $svc.Name
`;
  const result = await runPs(script, 20000);
  const name = String(result.stdout).trim();
  if (!name || name === "NONE") return null;
  return name;
}

async function startService(name) {
  if (!name) return { ok: false };
  return run("powershell.exe", [
    "-NoProfile",
    "-WindowStyle",
    "Hidden",
    "-Command",
    `Start-Service -Name ${JSON.stringify(name)} -ErrorAction SilentlyContinue`,
  ]);
}

function destinationHref({ name, ip, host, port }) {
  const ident = name && !/^\d{1,3}(\.\d{1,3}){3}$/.test(name) && name.includes(".") ? name : ip || host;
  if (!ident) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ident) && isPrivate(ident)) return `file://///${ident}`;
  if (port === 80 || port === 8080 || port === 8000) return `http://${ident}${port && port !== 80 ? `:${port}` : ""}/`;
  return `https://${ident}/`;
}

function isPrivate(ip) {
  const [a, b] = String(ip)
    .split(".")
    .map(Number);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function revealPath(filePath) {
  if (!filePath) return { ok: false, reason: "no-path" };
  if (!fs.existsSync(filePath)) return { ok: false, reason: "missing" };
  shell.showItemInFolder(filePath);
  return { ok: true };
}

async function openHref(href) {
  if (!href) return { ok: false, reason: "no-href" };
  await shell.openExternal(href);
  return { ok: true };
}

module.exports = {
  loadBlocked,
  saveBlocked,
  killTcpToIp,
  isolateIp,
  blockIp,
  unblockIp,
  stopServiceByPid,
  startService,
  destinationHref,
  revealPath,
  openHref,
  isPrivate,
};
