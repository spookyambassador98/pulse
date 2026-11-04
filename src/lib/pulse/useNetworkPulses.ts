"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buildDemoConnections, buildDemoEvents, DEMO_CAPTURE } from "./demoNetwork";
import { isShotsMode } from "./shotsMode";

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
  /** Stable key: the raw IP in desktop mode, the hostname in browser mode / manual connects. */
  host: string;
  /** Display name — a reverse-DNS hostname, the typed hostname, or (until resolved) the IP itself. */
  name: string;
  /** Numeric address, when it's known and distinct from `name` (so the UI can show both). */
  ip?: string;
  variant: "healthy" | "alert";
  requestCount: number;
  lastActivityMs: number;
  manual: boolean;
  /** e.g. a real owning process name in desktop mode ("chrome.exe"). */
  meta?: string;
  pid?: number | null;
  process?: string;
  processPath?: string;
  port?: number;
  blocked?: boolean;
  href?: string | null;
}

interface DesktopConnection {
  remote: string;
  port: number;
  localAddress?: string | null;
  localPort?: number;
  process: string | null;
  processPath?: string | null;
  pid: number | null;
  protocol: string;
  name?: string | null;
  blocked?: boolean;
  href?: string | null;
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
  onNetworkSnapshot: (cb: (data: { at: number; elevated?: boolean; connections: DesktopConnection[] }) => void) => () => void;
  onPacket: (cb: (data: RawPacket) => void) => () => void;
  onCaptureStatus: (cb: (data: CaptureStatus) => void) => () => void;
  getCaptureStatus: () => Promise<CaptureStatus>;
  connectTo: (
    host: string,
    port?: number
  ) => Promise<{ ok: boolean; ms: number; host: string; port?: number; address?: string; reason?: string }>;
  reverseDns: (ip: string) => Promise<string | null>;
  setFullscreen: (on: boolean) => Promise<{ fullscreen: boolean }>;
  getPrivilege: () => Promise<{ elevated: boolean }>;
  requestElevation: () => Promise<{ elevated: boolean; relaunching?: boolean; reason?: string }>;
  toggleNode: (
    ip: string,
    enabled: boolean
  ) => Promise<{ ok: boolean; blocked?: boolean; reason?: string; service?: string | null; closed?: number }>;
  openDestination: (href: string) => Promise<{ ok: boolean; reason?: string }>;
  revealPath: (filePath: string) => Promise<{ ok: boolean; reason?: string }>;
}

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** First pulse delay so a full table does not SYN in one frame. */
function hostPhaseMs(host: string) {
  return hashStr(host) % 1700;
}

/** Independent keepalive so two processes never share a beat. */
function hostCadenceMs(host: string) {
  return 2200 + (hashStr(`${host}:cadence`) % 4000);
}

function nameRank(n?: string | null) {
  if (!n) return 0;
  if (IPV4_RE.test(n)) return 1;
  if (n === "LAN" || n === "link-local" || n === "loopback") return 2;
  return 3;
}

function pickName(current?: string, incoming?: string | null) {
  if (!incoming) return current;
  if (!current) return incoming;
  return nameRank(incoming) >= nameRank(current) ? incoming : current;
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

/** Accepts "google.com", a full URL, or "host:port"; returns hostname + optional port. */
function parseTarget(input: string): { host: string; port?: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const u = new URL(withProtocol);
    const host = u.hostname.toLowerCase();
    if (!host) return null;
    if (u.port) return { host, port: Number(u.port) };
    if (trimmed.includes("://") && u.protocol === "http:") return { host, port: 80 };
    return { host };
  } catch {
    return null;
  }
}

export function useNetworkPulses(active: boolean) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const connectionsRef = useRef<ConnectionInfo[]>([]);
  const [events, setEvents] = useState<PacketEvent[]>([]);
  const [connectingHost, setConnectingHost] = useState<string | null>(null);
  const [capture, setCapture] = useState<CaptureStatus>({ active: false });
  const [elevated, setElevated] = useState(false);
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
  // Reverse-DNS lookups are fired once per raw IP the desktop capture sees
  // and cached here — otherwise every packet from the same host would
  // trigger another lookup.
  const nameResolveState = useRef<Map<string, "pending" | "done">>(new Map());
  // Manual connect_to uses a hostname; the OS table and packet capture speak
  // IPs. This alias keeps them as one synapse instead of two ghosts.
  const hostByIp = useRef<Map<string, string>>(new Map());
  const fakePulseTimers = useRef(new Map<string, number>());

  const clearFakePulses = useCallback((host?: string) => {
    const map = fakePulseTimers.current;
    if (host) {
      const t = map.get(host);
      if (t) window.clearTimeout(t);
      map.delete(host);
      return;
    }
    for (const t of map.values()) window.clearTimeout(t);
    map.clear();
  }, []);

  const nextId = useCallback(() => `pk-${idRef.current++}`, []);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  const pushEvent = useCallback(
    (evt: Omit<PacketEvent, "id">) => {
      setEvents((prev) => {
        const next = [...prev, { ...evt, id: nextId() }];
        return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
      });
    },
    [nextId]
  );

  // Photographs: canned destinations only. Never the OS table, never this
  // machine's IP, MAC, LAN, or a user folder in a process path.
  useEffect(() => {
    if (!active || !isShotsMode()) return;
    const now = performance.now();
    setElevated(true);
    setCapture(DEMO_CAPTURE);
    captureActiveRef.current = true;
    setConnections(buildDemoConnections(now));
    setEvents(buildDemoEvents(now));
    const id = window.setInterval(() => {
      const t = performance.now();
      setConnections((prev) => prev.map((c) => ({ ...c, lastActivityMs: t })));
      pushEvent({ host: "google.com", kind: "out", ok: true, atMs: t, label: "DATA · 256B · :443" });
      pushEvent({ host: "cloudflare.com", kind: "in", ok: true, atMs: t, label: "ACK · 40B · :443" });
    }, 1200);
    return () => window.clearInterval(id);
  }, [active, pushEvent]);

  const upsertConnection = useCallback(
    (params: {
      host: string;
      ok: boolean;
      manual: boolean;
      meta?: string;
      name?: string;
      ip?: string;
      pid?: number | null;
      process?: string;
      processPath?: string;
      port?: number;
      blocked?: boolean;
      href?: string | null;
      /** False for a connection-table refresh — that is not a packet. */
      touch?: boolean;
    }) => {
      const { host, ok, manual, meta, name, ip, pid, process, processPath, port, blocked, href } = params;
      const touch = params.touch !== false;
      setConnections((prev) => {
        const idx = prev.findIndex((c) => c.host === host);
        const now = performance.now();
        if (idx === -1) {
          return [
            ...prev,
            {
              host,
              name: name ?? host,
              ip,
              variant: blocked || !ok ? "alert" : "healthy",
              requestCount: 1,
              lastActivityMs: now,
              manual,
              meta,
              pid,
              process,
              processPath,
              port,
              blocked,
              href,
            },
          ];
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          variant: blocked ? "alert" : ok ? next[idx].variant : "alert",
          requestCount: touch ? next[idx].requestCount + 1 : next[idx].requestCount,
          lastActivityMs: touch ? now : next[idx].lastActivityMs,
          manual: next[idx].manual || manual,
          meta: meta ?? next[idx].meta,
          name: pickName(next[idx].name, name) ?? next[idx].name,
          ip: ip ?? next[idx].ip,
          pid: pid ?? next[idx].pid,
          process: process ?? next[idx].process,
          processPath: processPath ?? next[idx].processPath,
          port: port ?? next[idx].port,
          blocked: blocked ?? next[idx].blocked,
          href: href ?? next[idx].href,
        };
        return next;
      });
    },
    []
  );

  const patchConnectionName = useCallback((host: string, name: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.host === host || c.ip === host ? { ...c, name: pickName(c.name, name) ?? c.name } : c))
    );
  }, []);

  // Fire a reverse-DNS lookup for a raw IP the first time it's seen, and
  // patch the connection's display name in when (if) it resolves. Silent
  // no-op outside the desktop shell or for names that aren't plain IPs.
  const resolveNameIfNeeded = useCallback(
    (host: string) => {
      if (!IPV4_RE.test(host)) return;
      if (nameResolveState.current.has(host)) return;
      const bridge = getDesktopBridge();
      if (!bridge) return;
      nameResolveState.current.set(host, "pending");
      bridge
        .reverseDns(host)
        .then((name) => {
          nameResolveState.current.set(host, "done");
          if (name) patchConnectionName(host, name);
        })
        .catch(() => {
          nameResolveState.current.set(host, "done");
        });
    },
    [patchConnectionName]
  );

  // Desktop shell: the main process pushes the OS connection table every
  // ~1.2s. That list is real. It is not a packet clock — Chrome and Spotify
  // do not SYN on the same tick. New remotes get a staggered SYN. Quiet
  // sockets stay dim until a real packet, or (without Npcap) a per-host
  // keepalive with its own cadence.
  useEffect(() => {
    if (!active || isShotsMode()) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;

    const lastSeen = new Map<string, number>();
    let cancelled = false;

    const armKeepalive = (host: string, port: number, process: string | null) => {
      if (cancelled || captureActiveRef.current) return;
      if (fakePulseTimers.current.has(host)) return;
      const delay = hostCadenceMs(host) + Math.floor(Math.random() * 320);
      const t = window.setTimeout(() => {
        fakePulseTimers.current.delete(host);
        if (cancelled || captureActiveRef.current) return;
        const still = connectionsRef.current.some((c) => c.host === host && !c.blocked);
        if (!still) return;
        const now = performance.now();
        const inbound = hashStr(`${host}:${Math.floor(now / 700)}`) % 2 === 0;
        pushEvent({
          host,
          kind: inbound ? "in" : "out",
          ok: true,
          atMs: now,
          label: inbound
            ? `ACK · :${port}${process ? ` · ${process}` : ""}`
            : `PSH · :${port}${process ? ` · ${process}` : ""}`,
        });
        upsertConnection({ host, ok: true, manual: false, touch: true });
        armKeepalive(host, port, process);
      }, delay);
      fakePulseTimers.current.set(host, t);
    };

    getDesktopBridge()
      ?.getPrivilege()
      .then((p) => {
        if (p) setElevated(Boolean(p.elevated));
      })
      .catch(() => {});

    const unsubscribe = bridge.onNetworkSnapshot(({ connections: conns, elevated: priv }) => {
      if (typeof priv === "boolean") setElevated(priv);
      const now = performance.now();
      const activeRemotes = new Set(conns.map((c) => c.remote));
      const activeHosts = new Set<string>();

      for (const c of conns) {
        const isNew = !lastSeen.has(c.remote);
        lastSeen.set(c.remote, now);
        const host = hostByIp.current.get(c.remote) || c.remote;
        activeHosts.add(host);
        const meta = c.process ? `${c.process}${c.pid ? ` (${c.pid})` : ""}` : undefined;
        upsertConnection({
          host,
          ok: !c.blocked,
          manual: false,
          meta,
          ip: c.remote,
          name: c.name || undefined,
          pid: c.pid,
          process: c.process || undefined,
          processPath: c.processPath || undefined,
          port: c.port,
          blocked: Boolean(c.blocked),
          href: c.href || undefined,
          touch: false,
        });
        resolveNameIfNeeded(c.remote);
        if (c.blocked || captureActiveRef.current) {
          clearFakePulses(host);
          continue;
        }
        if (isNew) {
          if (fakePulseTimers.current.has(host)) continue;
          const delay = hostPhaseMs(host);
          const t = window.setTimeout(() => {
            fakePulseTimers.current.delete(host);
            if (cancelled || captureActiveRef.current) return;
            if (!connectionsRef.current.some((row) => row.host === host && !row.blocked)) return;
            pushEvent({
              host,
              kind: "out",
              ok: true,
              atMs: performance.now(),
              label: `SYN → :${c.port}${c.process ? ` · ${c.process}` : ""}`,
            });
            upsertConnection({ host, ok: true, manual: false, touch: true });
            armKeepalive(host, c.port, c.process);
          }, delay);
          fakePulseTimers.current.set(host, t);
        } else {
          armKeepalive(host, c.port, c.process);
        }
      }

      for (const ip of [...lastSeen.keys()]) {
        if (!activeRemotes.has(ip)) lastSeen.delete(ip);
      }

      for (const host of [...fakePulseTimers.current.keys()]) {
        if (!activeHosts.has(host)) clearFakePulses(host);
      }

      setConnections((prev) =>
        prev.filter((c) => {
          if (c.blocked) return true;
          if (c.manual) return true;
          if (activeRemotes.has(c.host)) return true;
          if (c.ip && activeRemotes.has(c.ip)) return true;
          return now - c.lastActivityMs < 12000;
        })
      );
    });

    return () => {
      cancelled = true;
      clearFakePulses();
      unsubscribe();
    };
  }, [active, pushEvent, upsertConnection, resolveNameIfNeeded, clearFakePulses]);

  // Real packet capture (WinPcap/Npcap), when the driver + native module
  // are available: individual decoded TCP packets straight off the wire —
  // real flags, real byte length, no polling interval smoothing it over.
  useEffect(() => {
    if (!active || isShotsMode()) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;

    // Capture starts once at app boot, before this effect (and its
    // subscription) exists — pull the current status now instead of only
    // waiting on the next push, which may never come.
    bridge.getCaptureStatus().then((status) => {
      captureActiveRef.current = status.active;
      setCapture(status);
      if (status.active) clearFakePulses();
    });

    const unsubStatus = bridge.onCaptureStatus((status) => {
      captureActiveRef.current = status.active;
      setCapture(status);
      if (status.active) clearFakePulses();
    });

    const unsubPacket = bridge.onPacket((pkt) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const isReset = pkt.flags.includes("RST");
      const host = hostByIp.current.get(pkt.remoteIp) || pkt.remoteIp;
      const blockedNow = connectionsRef.current.some(
        (c) => c.blocked && (c.ip === pkt.remoteIp || c.host === host || c.host === pkt.remoteIp)
      );
      if (blockedNow) return;
      upsertConnection({ host, ok: !isReset, manual: false, ip: pkt.remoteIp });
      resolveNameIfNeeded(pkt.remoteIp);
      pushEvent({
        host,
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
  }, [active, pushEvent, upsertConnection, resolveNameIfNeeded, clearFakePulses]);

  // Browser fallback: seed with whatever this page already loaded, then
  // watch for every new request in real time via PerformanceObserver.
  // `buffered: true` replays already-finished requests through the same
  // callback, so every setState call below happens inside a callback
  // rather than the effect body itself.
  useEffect(() => {
    if (!active || isShotsMode() || getDesktopBridge()) return;

    // The document itself isn't a "resource" entry — seed it via a deferred
    // callback (matching the pattern below) rather than calling setState
    // synchronously in the effect body.
    window.setTimeout(() => {
      upsertConnection({ host: window.location.hostname, ok: true, manual: false });
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

            upsertConnection({ host, ok: true, manual: false });
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
      const target = parseTarget(rawHost);
      if (!target) {
        setConnectingHost(null);
        pushEvent({
          host: rawHost.trim() || "?",
          kind: "out",
          ok: false,
          atMs: performance.now(),
          label: "invalid host",
        });
        return;
      }

      const { host, port } = target;
      if (isShotsMode()) {
        const t0 = performance.now();
        setConnectingHost(host);
        upsertConnection({ host, ok: true, manual: true, name: host });
        pushEvent({ host, kind: "out", ok: true, atMs: t0, label: `SYN → :${port ?? 443}` });
        window.setTimeout(() => {
          pushEvent({ host, kind: "in", ok: true, atMs: performance.now(), durationMs: 42, label: "SYN-ACK · 42ms" });
          setConnectingHost(null);
        }, 400);
        return;
      }
      const bridge = getDesktopBridge();

      manualCooldown.current.set(host, performance.now() + 5000);
      setConnectingHost(host);
      upsertConnection({ host, ok: true, manual: true, name: host });

      const t0 = performance.now();
      const portLabel = port ?? 443;
      pushEvent({
        host,
        kind: "out",
        ok: true,
        atMs: t0,
        label: bridge ? `SYN → :${portLabel}` : `GET https://${host}/`,
      });

      if (bridge) {
        bridge
          .connectTo(host, port)
          .then((res) => {
            const t1 = performance.now();
            if (res.address) {
              const ip = res.address.replace(/^::ffff:/, "");
              hostByIp.current.set(ip, host);
              hostByIp.current.set(res.address, host);
            }
            if (res.ok) {
              pushEvent({
                host,
                kind: "in",
                ok: true,
                atMs: t1,
                durationMs: res.ms,
                label: `SYN-ACK :${res.port ?? portLabel} · ${res.ms}ms`,
              });
              upsertConnection({ host, ok: true, manual: true, name: host, ip: res.address?.replace(/^::ffff:/, "") });
            } else {
              pushEvent({ host, kind: "in", ok: false, atMs: t1, durationMs: res.ms, label: res.reason || "unreachable" });
              upsertConnection({ host, ok: false, manual: true, name: host });
            }
          })
          .finally(() => setConnectingHost(null));
        return;
      }

      const url = port === 80 ? `http://${host}/` : `https://${host}/`;
      fetch(url, {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      })
        .then(() => {
          const t1 = performance.now();
          const durationMs = Math.round(t1 - t0);
          pushEvent({ host, kind: "in", ok: true, atMs: t1, durationMs, label: `${durationMs}ms` });
          upsertConnection({ host, ok: true, manual: true, name: host });
        })
        .catch(() => {
          const t1 = performance.now();
          const durationMs = Math.round(t1 - t0);
          pushEvent({ host, kind: "in", ok: false, atMs: t1, durationMs, label: "blocked / unreachable" });
          upsertConnection({ host, ok: false, manual: true, name: host });
        })
        .finally(() => setConnectingHost(null));
    },
    [pushEvent, upsertConnection]
  );

  const toggleNode = useCallback(async (ip: string, enabled: boolean) => {
    const bridge = getDesktopBridge();
    if (!bridge?.toggleNode) return { ok: false, reason: "desktop-only" };
    const res = await bridge.toggleNode(ip, enabled);
    if (!res.ok) return res;
    setConnections((prev) =>
      prev.map((c) =>
        c.ip === ip || c.host === ip
          ? { ...c, blocked: res.blocked ?? !enabled, variant: enabled ? "healthy" : "alert" }
          : c
      )
    );
    return res;
  }, []);

  const openDestination = useCallback(async (href: string) => {
    const bridge = getDesktopBridge();
    if (bridge?.openDestination) return bridge.openDestination(href);
    window.open(href, "_blank", "noopener,noreferrer");
    return { ok: true };
  }, []);

  const revealPath = useCallback(async (filePath: string) => {
    const bridge = getDesktopBridge();
    if (!bridge?.revealPath) return { ok: false, reason: "desktop-only" };
    return bridge.revealPath(filePath);
  }, []);

  return { connections, events, connectTo, connectingHost, capture, elevated, toggleNode, openDestination, revealPath };
}
