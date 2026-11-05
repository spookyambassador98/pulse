import "server-only";
import { headers } from "next/headers";
import { PULSE_GITHUB, PULSE_VERSION } from "@/lib/pulse/download";

export type OwnerDownloadStats = {
  total: number;
  current: number;
  version: string;
  site: number | null;
};

function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  const v4port = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4port) ip = v4port[1];
  return ip;
}

function allowedIps(): string[] {
  const raw = process.env.PULSE_STATS_IPS || process.env.PULSE_STATS_IP || "";
  return raw
    .split(/[,;\s]+/)
    .map(normalizeIp)
    .filter(Boolean);
}

export function clientIpFromHeaders(h: Headers): string {
  // x-vercel-forwarded-for is platform-set. Clients can prepend to
  // x-forwarded-for, so the connecting hop is the last address.
  const vercel = h.get("x-vercel-forwarded-for") || "";
  if (vercel) {
    const parts = vercel.split(",").map((part) => part.trim()).filter(Boolean);
    return normalizeIp(parts[parts.length - 1] || "");
  }
  const real = h.get("x-real-ip") || "";
  if (real && !real.includes(",")) return normalizeIp(real);
  const fwd = h.get("x-forwarded-for") || "";
  const parts = fwd.split(",").map((part) => part.trim()).filter(Boolean);
  return normalizeIp(parts[parts.length - 1] || "");
}

function isLoopback(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0:0:0:0:0:0:0:1" ||
    ip === "localhost"
  );
}

export function isOwnerIp(ip: string): boolean {
  const allow = allowedIps();
  const n = normalizeIp(ip);
  if (n && allow.includes(n)) return true;
  // Local preview only. Production never treats loopback as the desk.
  return process.env.NODE_ENV !== "production" && isLoopback(n);
}

export async function isOwnerRequest(h?: Headers): Promise<boolean> {
  return isOwnerIp(clientIpFromHeaders(h ?? (await headers())));
}

function githubRepo(): { owner: string; repo: string } | null {
  try {
    const url = new URL(PULSE_GITHUB);
    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

type GithubRelease = {
  assets?: { name?: string; download_count?: number }[];
};

let githubCache: { at: number; value: { total: number; current: number } } | null = null;

async function githubInstallerCounts(): Promise<{ total: number; current: number }> {
  if (githubCache && Date.now() - githubCache.at < 60_000) return githubCache.value;

  const repo = githubRepo();
  if (!repo) return { total: 0, current: 0 };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "pulse-site",
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        signal: ctrl.signal,
        cache: "no-store",
      },
    );
    if (!res.ok) return { total: 0, current: 0 };
    const releases = (await res.json()) as GithubRelease[];
    if (!Array.isArray(releases)) return { total: 0, current: 0 };

    const setup = `Pulse-Setup-${PULSE_VERSION}.exe`;
    let total = 0;
    let current = 0;
    for (const release of releases) {
      for (const asset of release.assets || []) {
        const name = asset.name || "";
        if (!/^Pulse-Setup-.*\.exe$/i.test(name)) continue;
        const count = Number(asset.download_count) || 0;
        total += count;
        if (name === setup) current = count;
      }
    }
    const value = { total, current };
    githubCache = { at: Date.now(), value };
    return value;
  } catch {
    return { total: 0, current: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function siteDownloadCount(): Promise<number | null> {
  const secret = process.env.DOWNLOADS_SECRET;
  if (!secret) return null;
  const url =
    process.env.SALONTECH_DOWNLOADS_URL || "https://salontech-mu.vercel.app/api/downloads";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(url, {
      headers: { "x-downloads-secret": secret },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data === "number" && Number.isFinite(data)) return data;
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    for (const key of ["total", "count", "downloads"]) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(row.downloads)) return row.downloads.length;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Count is loaded only after the IP allowlist matches. Never call this from a client file. */
export async function readOwnerDownloadStats(h?: Headers): Promise<OwnerDownloadStats | null> {
  if (!(await isOwnerRequest(h))) return null;
  const [github, site] = await Promise.all([githubInstallerCounts(), siteDownloadCount()]);
  return {
    total: github.total,
    current: github.current,
    version: PULSE_VERSION,
    site,
  };
}
