// Turns a remote IP into a human label for the synapse: where the request
// is actually going, not just the address. Reverse-DNS first, then a few
// well-known ranges, then LAN — never invent a brand from a random AWS IP.

const dns = require("dns").promises;

const cache = new Map();
const inflight = new Map();

const EXACT = {
  "1.1.1.1": "Cloudflare",
  "1.0.0.1": "Cloudflare",
  "8.8.8.8": "Google DNS",
  "8.8.4.4": "Google DNS",
  "9.9.9.9": "Quad9",
};

function parts(ip) {
  return ip.split(".").map((n) => Number(n));
}

function isPrivate(ip) {
  const [a, b] = parts(ip);
  if (Number.isNaN(a)) return false;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function privateLabel(ip) {
  const [a, b] = parts(ip);
  if (a === 100 && b >= 64 && b <= 127) return "Tailscale";
  if (a === 169 && b === 254) return "link-local";
  if (a === 127) return "loopback";
  return "LAN";
}

function wellKnown(ip) {
  if (EXACT[ip]) return EXACT[ip];
  const [a, b] = parts(ip);
  if (Number.isNaN(a)) return null;
  if (a === 104 && b >= 16 && b <= 31) return "Cloudflare";
  if (a === 172 && b >= 64 && b <= 71) return "Cloudflare";
  if (a === 162 && b === 159) return "Cloudflare";
  if (a === 188 && b === 114) return "Cloudflare";
  if (a === 142 && (b === 250 || b === 251)) return "Google";
  if (a === 172 && b === 217) return "Google";
  if (a === 216 && b === 58) return "Google";
  if (a === 74 && b === 125) return "Google";
  if (a === 173 && b === 194) return "Google";
  if (a === 13 && b === 107) return "Microsoft";
  if (a === 40 && b === 126) return "Microsoft";
  if ([3, 13, 18, 34, 35, 44, 50, 52, 54, 99].includes(a)) return "AWS";
  return null;
}

function prettifyPtr(ptr) {
  const host = String(ptr).replace(/\.$/, "").toLowerCase();
  if (host.includes("1e100.net") || host.includes("googleusercontent") || host.endsWith(".google.com")) {
    return "Google";
  }
  if (host.includes("cloudflare")) return "Cloudflare";
  if (host.includes("akamai") || host.includes("akamaiedge") || host.includes("akamaitechnologies")) {
    return "Akamai";
  }
  if (host.includes("facebook") || host.includes("fbcdn") || host.includes("meta.com") || host.includes("instagram")) {
    return "Meta";
  }
  if (host.includes("tailscale")) return "Tailscale";
  if (
    host.includes("microsoft") ||
    host.includes("office.com") ||
    host.includes("azure.com") ||
    host.includes("windows.net") ||
    host.includes("live.com")
  ) {
    return "Microsoft";
  }
  if (host.includes("github")) return "GitHub";
  if (host.includes("fastly")) return "Fastly";
  if (host.includes("amazonaws.com") || host.includes("awsglobalaccelerator.com") || host.includes("cloudfront.net")) {
    const first = host.split(".")[0];
    if (first && !/^[0-9a-f]{10,}$/i.test(first)) return first;
    return "AWS";
  }
  return host;
}

function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("dns-timeout")), ms);
  });
}

async function resolvePeer(ip) {
  const known = wellKnown(ip);
  const privateNet = isPrivate(ip);

  try {
    const names = await Promise.race([dns.reverse(ip), timeout(privateNet ? 700 : 2200)]);
    if (names && names[0]) return prettifyPtr(names[0]);
  } catch {
    /* no PTR — fall through */
  }

  if (known) return known;
  if (privateNet) return privateLabel(ip);
  return null;
}

function cachedName(ip) {
  if (!ip) return null;
  if (cache.has(ip)) return cache.get(ip);
  const known = wellKnown(ip);
  if (known) return known;
  if (isPrivate(ip)) return privateLabel(ip);
  return null;
}

function requestLookup(ip) {
  if (!ip || cache.has(ip) || inflight.has(ip)) return;
  const work = resolvePeer(ip)
    .then((name) => {
      cache.set(ip, name);
      inflight.delete(ip);
      return name;
    })
    .catch(() => {
      cache.set(ip, wellKnown(ip) || (isPrivate(ip) ? privateLabel(ip) : null));
      inflight.delete(ip);
    });
  inflight.set(ip, work);
}

module.exports = { cachedName, requestLookup, resolvePeer };
