import type { ConnectionInfo, PacketEvent } from "./useNetworkPulses";

// Names only. No subscriber IP, no LAN, no MAC, no user folder.

function row(
  now: number,
  partial: Pick<ConnectionInfo, "host" | "name" | "port" | "process" | "processPath" | "meta" | "href"> & {
    requestCount: number;
  }
): ConnectionInfo {
  return {
    variant: "healthy",
    lastActivityMs: now,
    manual: false,
    ...partial,
  };
}

export function buildDemoConnections(now: number): ConnectionInfo[] {
  return [
    row(now, {
      host: "google.com",
      name: "google.com",
      port: 443,
      process: "chrome.exe",
      processPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      meta: "chrome.exe",
      href: "https://google.com/",
      requestCount: 14,
    }),
    row(now, {
      host: "cloudflare.com",
      name: "Cloudflare",
      port: 443,
      process: "chrome.exe",
      processPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      meta: "chrome.exe",
      href: "https://cloudflare.com/",
      requestCount: 9,
    }),
    row(now, {
      host: "github.com",
      name: "github.com",
      port: 443,
      process: "Code.exe",
      processPath: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
      meta: "Code.exe",
      href: "https://github.com/",
      requestCount: 6,
    }),
    row(now, {
      host: "aws.amazon.com",
      name: "AWS",
      port: 443,
      process: "chrome.exe",
      processPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      meta: "chrome.exe",
      href: "https://aws.amazon.com/",
      requestCount: 5,
    }),
    row(now, {
      host: "spotify.com",
      name: "spotify",
      port: 443,
      process: "Spotify.exe",
      processPath: "C:\\Program Files\\Spotify\\Spotify.exe",
      meta: "Spotify.exe",
      href: "https://spotify.com/",
      requestCount: 11,
    }),
  ];
}

export function buildDemoEvents(now: number): PacketEvent[] {
  return [
    { id: "demo-1", host: "google.com", kind: "out", ok: true, atMs: now - 800, label: "SYN → :443 · chrome.exe" },
    { id: "demo-2", host: "google.com", kind: "in", ok: true, atMs: now - 520, durationMs: 48, label: "SYN-ACK · 48ms" },
    { id: "demo-3", host: "cloudflare.com", kind: "out", ok: true, atMs: now - 400, label: "DATA · 312B · :443" },
    { id: "demo-4", host: "github.com", kind: "in", ok: true, atMs: now - 220, label: "ACK · 40B · :443" },
    { id: "demo-5", host: "spotify.com", kind: "out", ok: true, atMs: now - 80, label: "DATA · 128B · :443" },
  ];
}

export const DEMO_CAPTURE = { active: true, device: "eth0", description: "Ethernet" };
export const DEMO_INSPECT_HOST = "google.com";
