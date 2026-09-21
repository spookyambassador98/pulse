import type { ConnectionInfo } from "./useNetworkPulses";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isPrivateIp(ip?: string) {
  if (!ip || !IPV4_RE.test(ip)) return false;
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function destinationOf(conn: ConnectionInfo): {
  kind: "url" | "share" | "addr";
  href: string | null;
  label: string;
} {
  const ip = conn.ip && IPV4_RE.test(conn.ip) ? conn.ip : IPV4_RE.test(conn.host) ? conn.host : undefined;
  const named = conn.name && !IPV4_RE.test(conn.name) && conn.name.includes(".") ? conn.name : null;
  const ident = named || ip || conn.host;
  const port = conn.port;

  if (ip && isPrivateIp(ip)) {
    return { kind: "share", href: `file://///${ip}`, label: `\\\\${ip}` };
  }

  if (port === 80 || port === 8080 || port === 8000 || port === 3000) {
    const hostport = port === 80 ? ident : `${ident}:${port}`;
    return { kind: "url", href: `http://${hostport}/`, label: `http://${hostport}` };
  }

  if (!port || port === 443 || port === 8443) {
    return { kind: "url", href: `https://${ident}/`, label: `https://${ident}` };
  }

  return { kind: "addr", href: `https://${ident}/`, label: `${ident}:${port}` };
}
