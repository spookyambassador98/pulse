"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Real per-request network activity, turned into discrete "packet" events —
// one for the request leaving your device, one for the response coming
// back.
//
// In the browser this is the finest granularity a web page can see (raw
// TCP/IP packets and other tabs are sandboxed away, by design) — it's the
// same data the DevTools Network tab is built on.
//
// Running inside the Pulse desktop shell (Electron), this same hook
// switches to a strictly deeper data source exposed by the main process via
// `window.pulseDesktop`: the OS's actual connection table (every established
// connection on the machine, with the owning process) and a raw TCP
// handshake for "connect to any host" — no browser sandbox in the way.

export interface PacketEvent {
  id: string;
  host: string;
  kind: "out" | "in";
  ok: boolean;
  atMs: number;
  durationMs?: number;
  label: string;
}

export interface ConnectionInfo {
  host: string;
  variant: "healthy" | "alert";
  requestCount: number;
  lastActivityMs: number;
  manual: boolean;
  /** e.g. a real owning process name in desktop mode ("chrome.exe"). */
  meta?: string;
}

interface DesktopConnection {
  remote: string;
  port: number;
  process: string | null;
  pid: number | null;
  protocol: string;
}

interface RawPacket {
  remoteIp: string;
  remotePort: number;
  flags: string; // "SYN" | "SYN-ACK" | "FIN" | "RST" | "DATA" | ...
  length: number;
  direction: "out" | "in";
  atMs: number;
}

interface CaptureStatus {
  active: boolean;
  device?: string;
  description?: string;
  reason?: string;
}

interface PulseDesktopBridge {
  isDesktop: true;
  onNetworkSnapshot: (cb: (data: { at: number; connections: DesktopConnection[] }) => void) => () => void;
  onPacket: (cb: (data: RawPacket) => void) => () => void;
  onCaptureStatus: (cb: (data: CaptureStatus) => void) => () => void;
  getCaptureStatus: () => Promise<CaptureStatus>;
  connectTo: (host: string) => Promise<{ ok: boolean; ms: number; host: string; reason?: string }>;
  reverseDns: (ip: string) => Promise<string | null>;
}

function getDesktopBridge(): PulseDesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { pulseDesktop?: PulseDesktopBridge }).pulseDesktop;
  return bridge?.isDesktop ? bridge : null;
}

/** True when running inside the Pulse Electron shell rather than a plain browser tab. */
function isPulseDesktop(): boolean {
  return getDesktopBridge() !== null;
}

function subscribeNever() {
  return () => {};
}

function serverSnapshot() {
  return false;
}

/** Render-safe check for the Electron shell — never changes after load, so no subscription is needed. */
export function useIsPulseDesktop(): boolean {
  return useSyncExternalStore(subscribeNever, isPulseDesktop, serverSnapshot);
}

const MAX_EVENTS = 60;
const EVENT_TTL_MS = 6000;

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? `/${last}` : "/";
  } catch {
    return url;
  }
}

/** Accepts "google.com", "www.google.com", or a full URL; returns just the hostname. */
function normalizeHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function useNetworkPulses(active: boolean) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [events, setEvents] = useState<PacketEvent[]>([]);
  const [connectingHost, setConnectingHost] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureStatus>({ active: false });
  const idRef = useRef(0);
  // Once real packet capture comes online, the connection-snapshot effect
  // stops inventing its own "SYN / alive" pulses — the capture stream
  // supplies genuine per-packet events instead. Layout/meta bookkeeping
  // (upsertConnection) still runs either way.
  const captureActiveRef = useRef(false);
  // `connectTo`'s own fetch() also shows up as a "resource" entry through
  // the observer below (fetch calls generate Resource Timing entries
  // regardless of destination). This tracks a short cooldown per host so
  // that duplicate isn't announced a second time.
  const manualCooldown = useRef<Map<string, number>>(new Map());

  const nextId = useCallback(() => `pk-${idRef.current++}`, []);

  const pushEvent = useCallback(
    (evt: Omit<PacketEvent, "id">) => {
      setEvents((prev) => {
        const next = [...prev, { ...evt, id: nextId() }];
        return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
      });
    },
    [nextId]
  );

  const upsertConnection = useCallback((host: string, ok: boolean, manual: boolean, meta?: string) => {
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.host === host);
      const now = performance.now();
      if (idx === -1) {
        return [...prev, { host, variant: ok ? "healthy" : "alert", requestCount: 1, lastActivityMs: now, manual, meta }];
      }
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        variant: ok ? next[idx].variant : "alert",
        requestCount: next[idx].requestCount + 1,
        lastActivityMs: now,
        manual: next[idx].manual || manual,
        meta: meta ?? next[idx].meta,
      };
      return next;
    });
  }, []);

  // Desktop shell: the main process pushes real, system-wide connection
  // snapshots (every established connection on the machine, from any
  // process) every ~1.2s. A remote address that's new since the last
  // snapshot fires an "out" pulse (its SYN); one that's still present
  // fires an "in" pulse (still alive) so the diagram stays visibly live.
  useEffect(() => {
    if (!active) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const lastSeen = new Map<string, number>();

    const unsubscribe = bridge.onNetworkSnapshot(({ connections: conns }) => {
      const now = performance.now();
      for (const c of conns) {
        const key = `${c.remote}:${c.port}`;
        const isNew = !lastSeen.has(key);
        lastSeen.set(key, now);
        const meta = c.process ? `${c.process}${c.pid ? ` (${c.pid})` : ""}` : undefined;

        upsertConnection(c.remote, true, false, meta);
        if (captureActiveRef.current) continue; // real packet events cover this instead

        pushEvent({
          host: c.remote,
          kind: isNew ? "out" : "in",
          ok: true,
          atMs: now,
          label: isNew
            ? `SYN → :${c.port}${c.process ? ` · ${c.process}` : ""}`
            : `${c.protocol.toUpperCase()} alive · :${c.port}`,
        });
      }
    });

    return unsubscribe;
  }, [active, pushEvent, upsertConnection]);

  // Real packet capture (WinPcap/Npcap), when the driver + native module
  // are available: individual decoded TCP packets straight off the wire —
  // real flags, real byte length, no polling interval smoothing it over.
  useEffect(() => {
    if (!active) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;

    // Capture starts once at app boot, before this effect (and its
    // subscription) exists — pull the current status now instead of only
    // waiting on the next push, which may never come.
    bridge.getCaptureStatus().then((status) => {
      captureActiveRef.current = status.active;
      setCapture(status);
    });

    const unsubStatus = bridge.onCaptureStatus((status) => {
      captureActiveRef.current = status.active;
      setCapture(status);
    });

    const unsubPacket = bridge.onPacket((pkt) => {
      const isReset = pkt.flags.includes("RST");
      upsertConnection(pkt.remoteIp, !isReset, false);
      pushEvent({
        host: pkt.remoteIp,
        kind: pkt.direction,
        ok: !isReset,
        atMs: performance.now(),
        label: `${pkt.flags} · ${pkt.length}B · :${pkt.remotePort}`,
      });
    });

    return () => {
      unsubStatus();
      unsubPacket();
    };
  }, [active, pushEvent, upsertConnection]);

  // Browser fallback: seed with whatever this page already loaded, then
  // watch for every new request in real time via PerformanceObserver.
  // `buffered: true` replays already-finished requests through the same
  // callback, so every setState call below happens inside a callback
  // rather than the effect body itself.
  useEffect(() => {
    if (!active || getDesktopBridge()) return;

    // The document itself isn't a "resource" entry — seed it via a deferred
    // callback (matching the pattern below) rather than calling setState
    // synchronously in the effect body.
    window.setTimeout(() => {
      upsertConnection(window.location.hostname, true, false);
    }, 0);

    let observer: PerformanceObserver | undefined;
    if (typeof PerformanceObserver !== "undefined") {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            const host = hostFromUrl(entry.name);
            if (!host) continue;

            const cooldownUntil = manualCooldown.current.get(host);
            if (cooldownUntil && performance.now() < cooldownUntil) continue;

            upsertConnection(host, true, false);
            pushEvent({
              host,
              kind: "out",
              ok: true,
              atMs: performance.now(),
              label: `GET ${shortPath(entry.name)}`,
            });

            // The observer only fires once a resource has already finished,
            // so the "response" pulse is a stylized replay — but its speed
            // is driven by this request's real duration, not a guess.
            const travelMs = Math.min(1400, Math.max(420, entry.duration || 250));
            const durationMs = Math.round(entry.duration);
            window.setTimeout(() => {
              pushEvent({
                host,
                kind: "in",
                ok: true,
                atMs: performance.now(),
                durationMs,
                label: `${durationMs}ms`,
              });
            }, travelMs * 0.55);
          }
        });
        observer.observe({ type: "resource", buffered: true });
      } catch {
        observer = undefined;
      }
    }

    return () => observer?.disconnect();
  }, [active, pushEvent, upsertConnection]);

  // Drop stale events so old dots/log lines don't pile up forever.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const cutoff = performance.now() - EVENT_TTL_MS;
      setEvents((prev) => prev.filter((e) => e.atMs >= cutoff));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // Lets the visitor point Pulse at any host. Desktop mode opens a real raw
  // TCP socket and times the actual three-way handshake (SYN / SYN-ACK /
  // ACK) — the browser fallback times a real `fetch` in `no-cors` mode,
  // which works cross-origin without needing to read the response body.
  const connectTo = useCallback(
    (rawHost: string) => {
      const host = normalizeHost(rawHost);
      if (!host) return;

      const bridge = getDesktopBridge();

      manualCooldown.current.set(host, performance.now() + 5000);
      setConnectingHost(host);
      upsertConnection(host, true, true);

      const t0 = performance.now();
      pushEvent({
        host,
        kind: "out",
        ok: true,
        atMs: t0,
        label: bridge ? "SYN → :443" : `GET https://${host}/`,
      });

      if (bridge) {
        bridge
          .connectTo(host)
          .then((res) => {
            const t1 = performance.now();
            if (res.ok) {
              pushEvent({ host, kind: "in", ok: true, atMs: t1, durationMs: res.ms, label: `SYN-ACK · ${res.ms}ms` });
              upsertConnection(host, true, true);
            } else {
              pushEvent({ host, kind: "in", ok: false, atMs: t1, durationMs: res.ms, label: res.reason || "unreachable" });
              upsertConnection(host, false, true);
            }
          })
          .finally(() => setConnectingHost(null));
        return;
      }

      fetch(`https://${host}/`, {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      })
        .then(() => {
          const t1 = performance.now();
          const durationMs = Math.round(t1 - t0);
          pushEvent({ host, kind: "in", ok: true, atMs: t1, durationMs, label: `${durationMs}ms` });
          upsertConnection(host, true, true);
        })
        .catch(() => {
          const t1 = performance.now();
          const durationMs = Math.round(t1 - t0);
          pushEvent({ host, kind: "in", ok: false, atMs: t1, durationMs, label: "blocked / unreachable" });
          upsertConnection(host, false, true);
        })
        .finally(() => setConnectingHost(null));
    },
    [pushEvent, upsertConnection]
  );

  return { connections, events, connectTo, connectingHost, capture };
}
