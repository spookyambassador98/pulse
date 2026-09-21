"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Real per-request network activity, turned into discrete "packet" events —
// one for the request leaving your device, one for the response coming
// back. This is the finest granularity a browser exposes to JS (raw TCP/IP
// packets aren't visible to any web page, by design) — but it's the same
// data the DevTools Network tab is built on, and it's genuinely live.

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
  const idRef = useRef(0);
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

  const upsertConnection = useCallback((host: string, ok: boolean, manual: boolean) => {
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.host === host);
      const now = performance.now();
      if (idx === -1) {
        return [...prev, { host, variant: ok ? "healthy" : "alert", requestCount: 1, lastActivityMs: now, manual }];
      }
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        variant: ok ? next[idx].variant : "alert",
        requestCount: next[idx].requestCount + 1,
        lastActivityMs: now,
        manual: next[idx].manual || manual,
      };
      return next;
    });
  }, []);

  // Seed with whatever this page already loaded, then watch for every new
  // request in real time via PerformanceObserver. `buffered: true` replays
  // already-finished requests through the same callback, so every setState
  // call below happens inside a callback rather than the effect body itself.
  useEffect(() => {
    if (!active) return;

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

  // Lets the visitor point Pulse at any host: a real fetch leaves this
  // browser right now, timed for real, in `no-cors` mode so it works
  // cross-origin without needing to read the response body.
  const connectTo = useCallback(
    (rawHost: string) => {
      const host = normalizeHost(rawHost);
      if (!host) return;

      manualCooldown.current.set(host, performance.now() + 5000);
      setConnectingHost(host);
      upsertConnection(host, true, true);

      const t0 = performance.now();
      pushEvent({ host, kind: "out", ok: true, atMs: t0, label: `GET https://${host}/` });

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

  return { connections, events, connectTo, connectingHost };
}
