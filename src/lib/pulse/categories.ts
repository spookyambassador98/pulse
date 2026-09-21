import type { ConnectionInfo } from "./useNetworkPulses";

export type NeuronCategory = "all" | "ptr" | "private" | "process" | "google" | "cloudflare" | "aws";

export const NEURON_FILTERS: { id: NeuronCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ptr", label: "PTR" },
  { id: "private", label: "Private" },
  { id: "process", label: "Process" },
  { id: "google", label: "Google" },
  { id: "cloudflare", label: "Cloudflare" },
  { id: "aws", label: "AWS" },
];

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const PRIVATE_LABELS = new Set(["lan", "tailscale", "link-local", "loopback"]);
const BRAND_LABELS = new Set([
  "google",
  "google dns",
  "cloudflare",
  "aws",
  "microsoft",
  "akamai",
  "meta",
  "github",
  "fastly",
]);

function octets(ip?: string): [number, number] | null {
  if (!ip || !IPV4_RE.test(ip)) return null;
  const [a, b] = ip.split(".").map(Number);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return [a, b];
}

function connIp(conn: ConnectionInfo): string | undefined {
  if (conn.ip && IPV4_RE.test(conn.ip)) return conn.ip;
  if (IPV4_RE.test(conn.host)) return conn.host;
  return undefined;
}

function isPrivateIp(ip?: string): boolean {
  const p = octets(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isGoogleIp(ip?: string): boolean {
  const p = octets(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 142 && (b === 250 || b === 251)) return true;
  if (a === 172 && b === 217) return true;
  if (a === 216 && b === 58) return true;
  if (a === 74 && b === 125) return true;
  if (a === 173 && b === 194) return true;
  return false;
}

function isCloudflareIp(ip?: string): boolean {
  const p = octets(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 104 && b >= 16 && b <= 31) return true;
  if (a === 172 && b >= 64 && b <= 71) return true;
  if (a === 162 && b === 159) return true;
  if (a === 188 && b === 114) return true;
  return false;
}

function isAwsIp(ip?: string): boolean {
  const p = octets(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 13 && b === 107) return false;
  return [3, 13, 18, 34, 35, 44, 50, 52, 54, 99].includes(a);
}

export function connectionTags(conn: ConnectionInfo): Set<NeuronCategory> {
  const tags = new Set<NeuronCategory>();
  const ip = connIp(conn);
  const name = conn.name || "";
  const lower = name.toLowerCase();

  if (conn.meta) tags.add("process");
  if (isPrivateIp(ip) || PRIVATE_LABELS.has(lower)) tags.add("private");

  if (/\bgoogle\b/.test(lower) || lower.includes("1e100") || isGoogleIp(ip)) tags.add("google");
  if (lower.includes("cloudflare") || isCloudflareIp(ip)) tags.add("cloudflare");
  if (
    lower === "aws" ||
    lower.startsWith("ec2-") ||
    lower.includes("amazonaws") ||
    lower.includes("cloudfront") ||
    lower.includes("awsglobalaccelerator") ||
    isAwsIp(ip)
  ) {
    tags.add("aws");
  }

  const looksHost = name.includes(".") || /^(ec2-|derp|mx\d)/i.test(name);
  if (looksHost && !IPV4_RE.test(name) && !PRIVATE_LABELS.has(lower) && !BRAND_LABELS.has(lower)) {
    tags.add("ptr");
  }

  return tags;
}

export function connectionMatches(conn: ConnectionInfo, filter: NeuronCategory): boolean {
  if (filter === "all") return true;
  return connectionTags(conn).has(filter);
}

export function countByCategory(connections: ConnectionInfo[]): Record<NeuronCategory, number> {
  const counts: Record<NeuronCategory, number> = {
    all: connections.length,
    ptr: 0,
    private: 0,
    process: 0,
    google: 0,
    cloudflare: 0,
    aws: 0,
  };
  for (const conn of connections) {
    for (const tag of connectionTags(conn)) counts[tag] += 1;
  }
  return counts;
}
