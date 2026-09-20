// Reads REAL signals about the visitor's own browser session with this
// page — no mocked numbers. Everything here is data the browser already
// exposes to same-origin JS via the Navigation Timing, Resource Timing and
// Network Information APIs; nothing is sent anywhere.

export interface LiveSessionData {
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  requestCount: number;
  transferKb: number | null;
  slowestResource: { name: string; durationMs: number } | null;
  connectionType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  cpuCores: number | null;
  viewport: { w: number; h: number };
  hostname: string;
  protocol: string;
}

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

function getConnection(): NetworkInformationLike | null {
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function shortenResourceName(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] || u.hostname;
  } catch {
    return url;
  }
}

export function captureLiveSession(): LiveSessionData {
  const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  const nav = navEntries[0];
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const connection = getConnection();

  let transferBytes = 0;
  let sawTransfer = false;
  let slowest: { name: string; durationMs: number } | null = null;

  for (const r of resources) {
    if (typeof r.transferSize === "number" && r.transferSize > 0) {
      transferBytes += r.transferSize;
      sawTransfer = true;
    }
    if (!slowest || r.duration > slowest.durationMs) {
      slowest = { name: shortenResourceName(r.name), durationMs: Math.round(r.duration) };
    }
  }

  return {
    ttfbMs: nav ? Math.max(0, Math.round(nav.responseStart - nav.requestStart)) : null,
    domContentLoadedMs: nav ? Math.max(0, Math.round(nav.domContentLoadedEventEnd - nav.startTime)) : null,
    loadMs: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd - nav.startTime) : null,
    requestCount: resources.length + (nav ? 1 : 0),
    transferKb: sawTransfer ? Math.round((transferBytes / 1024) * 10) / 10 : null,
    slowestResource: slowest,
    connectionType: connection?.effectiveType ?? null,
    downlinkMbps: connection?.downlink ?? null,
    rttMs: connection?.rtt ?? null,
    cpuCores: navigator.hardwareConcurrency ?? null,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    hostname: window.location.hostname || "this device",
    protocol: window.location.protocol.replace(":", "").toUpperCase(),
  };
}
