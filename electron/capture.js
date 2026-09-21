// Real packet capture: opens the machine's active network adapter through
// WinPcap/Npcap (whichever driver is present) and decodes actual Ethernet /
// IPv4 / TCP frames as they cross the wire. This is the literal thing a
// browser can never show a web page — individual packets, their flags
// (SYN / SYN-ACK / FIN / RST / PSH), and their real byte length.
//
// Degrades gracefully: if `cap` fails to load (no native build tools were
// available, no capture driver, no permission) this module simply reports
// itself unavailable and the app falls back to the systeminformation-based
// connection poll in main.js.

let Cap, decoders, PROTOCOL;
try {
  ({ Cap, decoders } = require("cap"));
  PROTOCOL = decoders.PROTOCOL;
} catch (err) {
  Cap = null;
  console.error("[capture] 'cap' native module unavailable:", err.message);
}

function pickDevice() {
  const devices = Cap.deviceList();
  // Prefer a device with a real, non-loopback, non-link-local IPv4 address —
  // that's the adapter actually carrying traffic to the outside world.
  for (const dev of devices) {
    const addr = (dev.addresses || []).find(
      (a) => a.addr && a.addr.includes(".") && !a.addr.startsWith("127.") && !a.addr.startsWith("169.254.")
    );
    if (addr) return { name: dev.name, description: dev.description, ip: addr.addr };
  }
  return null;
}

function flagsToString(flags) {
  const parts = [];
  if (flags & 0x02) parts.push("SYN");
  if (flags & 0x10) parts.push("ACK");
  if (flags & 0x01) parts.push("FIN");
  if (flags & 0x04) parts.push("RST");
  if (flags & 0x08) parts.push("PSH");
  return parts.length ? parts.join("-") : "DATA";
}

/**
 * Starts live capture. `onPacket` receives:
 *   { srcIp, dstIp, srcPort, dstPort, flags, length, direction, atMs }
 * Returns { ok, device, stop } — call stop() to close the capture handle.
 */
function startCapture(onPacket) {
  if (!Cap) return { ok: false, reason: "cap module not available" };

  const device = pickDevice();
  if (!device) return { ok: false, reason: "no suitable network device found" };

  const c = new Cap();
  const bufSize = 4 * 1024 * 1024;
  const buffer = Buffer.alloc(65535);

  let linkType;
  try {
    linkType = c.open(device.name, "tcp", bufSize, buffer);
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  if (linkType !== "ETHERNET") {
    try {
      c.close();
    } catch {
      /* noop */
    }
    return { ok: false, reason: `unsupported link type: ${linkType}` };
  }

  // Data packets (plain ACKs carrying payload) can arrive hundreds of times
  // a second on one connection — throttle those per remote peer so the UI
  // gets a steady, readable trickle instead of a flood. Control packets
  // (SYN/FIN/RST) are rare and always significant, so they're never dropped.
  const lastDataEmit = new Map();
  const DATA_THROTTLE_MS = 220;

  c.on("packet", () => {
    try {
      const eth = decoders.Ethernet(buffer);
      if (eth.info.type !== PROTOCOL.ETHERNET.IPV4) return;

      const ip = decoders.IPV4(buffer, eth.offset);
      if (ip.info.protocol !== PROTOCOL.IP.TCP) return;

      const tcp = decoders.TCP(buffer, eth.offset + ip.hdrlen);
      const flags = tcp.info.flags;
      const isControl = Boolean(flags & (0x02 | 0x01 | 0x04)); // SYN|FIN|RST

      const outbound = ip.info.srcaddr === device.ip;
      const remoteIp = outbound ? ip.info.dstaddr : ip.info.srcaddr;
      const remotePort = outbound ? tcp.info.dstport : tcp.info.srcport;

      if (!isControl) {
        const now = Date.now();
        const last = lastDataEmit.get(remoteIp) || 0;
        if (now - last < DATA_THROTTLE_MS) return;
        lastDataEmit.set(remoteIp, now);
      }

      onPacket({
        remoteIp,
        remotePort,
        flags: flagsToString(flags),
        length: ip.info.totallen,
        direction: outbound ? "out" : "in",
        atMs: Date.now(),
      });
    } catch {
      // Malformed/truncated frame — skip it, never crash the capture loop.
    }
  });

  return {
    ok: true,
    device,
    stop() {
      try {
        c.close();
      } catch {
        /* noop */
      }
    },
  };
}

module.exports = { startCapture, isAvailable: () => Cap !== null };
