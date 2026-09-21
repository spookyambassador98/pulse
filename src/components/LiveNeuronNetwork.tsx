"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import {
  buildAxon,
  buildDeviceHairs,
  buildOutwardHairs,
  layoutSomataFromSlots,
  outwardAngle,
  shortHostLabel,
  DEVICE_SOMA,
} from "@/lib/pulse/network";
import { useNetworkPulses, type PacketEvent, type ConnectionInfo } from "@/lib/pulse/useNetworkPulses";
import {
  NEURON_FILTERS,
  countByCategory,
  connectionMatches,
  type NeuronCategory,
} from "@/lib/pulse/categories";
import { destinationOf } from "@/lib/pulse/nodePath";

const DEVICE_HAIRS = buildDeviceHairs(22, 11);
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 3.4;
const ZOOM_STEP = 0.22;
const MAX_LIVE_DOTS = 16;

interface LiveNeuronNetworkProps {
  active: boolean;
  immersive?: boolean;
  onToggleImmersive?: () => void;
}

export function LiveNeuronNetwork({ active, immersive = false, onToggleImmersive }: LiveNeuronNetworkProps) {
  const { connections, events, connectTo, connectingHost, capture, elevated, toggleNode, openDestination, revealPath } =
    useNetworkPulses(active);
  const reducedMotion = usePrefersReducedMotion();
  const [hostInput, setHostInput] = useState("");
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeDots, setActiveDots] = useState<PacketEvent[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const [tickMs, setTickMs] = useState(0);
  const packetCountRef = useRef(0);
  const [packetRate, setPacketRate] = useState(0);
  const [hoverHost, setHoverHost] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [filter, setFilter] = useState<NeuronCategory>("all");
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [nodeBusy, setNodeBusy] = useState(false);
  const [nodeNote, setNodeNote] = useState<string | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const nodeClickRef = useRef<{ host: string; x: number; y: number } | null>(null);

  const selectedConn = useMemo(
    () => connections.find((c) => c.host === selectedHost) ?? null,
    [connections, selectedHost]
  );
  const selectedDest = selectedConn ? destinationOf(selectedConn) : null;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setTickMs(performance.now());
    }, 500);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        setActiveDots([]);
        gsap.ticker.sleep();
      } else {
        gsap.ticker.wake();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (document.hidden) return;
    const fresh = events.filter((e) => !seenIds.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seenIds.current.add(e.id));
    if (seenIds.current.size > 2000) seenIds.current.clear();
    packetCountRef.current += fresh.length;
    if (!reducedMotion) {
      setActiveDots((prev) => {
        const next = [...prev, ...fresh];
        return next.length > MAX_LIVE_DOTS ? next.slice(-MAX_LIVE_DOTS) : next;
      });
    }
  }, [events, reducedMotion]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setPacketRate(packetCountRef.current);
      packetCountRef.current = 0;
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const removeDot = (id: string) => {
    setActiveDots((prev) => prev.filter((d) => d.id !== id));
  };

  const submitConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostInput.trim()) return;
    connectTo(hostInput);
    setHostInput("");
  };

  const categoryCounts = useMemo(() => countByCategory(connections), [connections]);
  const visibleConnections = useMemo(
    () => connections.filter((c) => connectionMatches(c, filter)),
    [connections, filter]
  );
  const visibleHosts = useMemo(() => new Set(visibleConnections.map((c) => c.host)), [visibleConnections]);
  const recentLog = useMemo(
    () => events.filter((e) => visibleHosts.has(e.host)).slice(-8).reverse(),
    [events, visibleHosts]
  );
  const stableConnections = useMemo(
    () => [...visibleConnections].sort((a, b) => a.host.localeCompare(b.host)),
    [visibleConnections]
  );
  const sortedConnections = useMemo(
    () => [...visibleConnections].sort((a, b) => b.lastActivityMs - a.lastActivityMs),
    [visibleConnections]
  );
  const knownHostsRef = useRef<Set<string>>(new Set());
  const [enteringHosts, setEnteringHosts] = useState<Set<string>>(() => new Set());
  const slotByHostRef = useRef(new Map<string, number>());
  const nextSlotRef = useRef(0);

  useEffect(() => {
    const added = connections.map((c) => c.host).filter((h) => !knownHostsRef.current.has(h));
    if (added.length === 0) return;
    added.forEach((h) => knownHostsRef.current.add(h));
    setEnteringHosts(new Set(added));
    const t = window.setTimeout(() => setEnteringHosts(new Set()), 550);
    return () => window.clearTimeout(t);
  }, [connections]);

  const liveHostKey = connections
    .map((c) => c.host)
    .sort()
    .join("|");

  // Assign a permanent polar slot the first time a host appears. Never recycle
  // that slot while the session is open — otherwise a dropped-then-reseen IP
  // jumps to a new seat and the map jitters.
  const [slotVersion, setSlotVersion] = useState(0);
  useEffect(() => {
    let changed = false;
    for (const c of connections) {
      if (!slotByHostRef.current.has(c.host)) {
        slotByHostRef.current.set(c.host, nextSlotRef.current++);
        changed = true;
      }
    }
    if (changed) setSlotVersion((n) => n + 1);
  }, [connections]);

  const layout = useMemo(
    () => layoutSomataFromSlots(new Map(slotByHostRef.current)),
    [liveHostKey, slotVersion]
  );
  const extent = layout.viewExtent;
  const somaLayout = layout.somata;
  const radarRings = layout.rings;

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const mapped = pt.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  }, []);

  const applyZoom = useCallback(
    (next: number, origin?: { x: number; y: number }) => {
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      setZoom((prevZoom) => {
        const factor = clamped / prevZoom;
        if (origin) {
          setPan((prevPan) => ({
            x: origin.x - (origin.x - prevPan.x) * factor,
            y: origin.y - (origin.y - prevPan.y) * factor,
          }));
        }
        return clamped;
      });
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest("[data-synapse]")) return;
    setSelectedHost(null);
    setNodeNote(null);
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    setPanning(true);
  };

  const selectNode = (host: string) => {
    setSelectedHost(host);
    setNodeNote(null);
  };

  const onNodePointerDown = (e: React.PointerEvent, host: string) => {
    e.stopPropagation();
    nodeClickRef.current = { host, x: e.clientX, y: e.clientY };
  };

  const onNodePointerUp = (e: React.PointerEvent, host: string) => {
    const start = nodeClickRef.current;
    nodeClickRef.current = null;
    if (!start || start.host !== host) return;
    const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (dist > 7) return;
    selectNode(host);
  };

  const cutOrRestore = async () => {
    if (!selectedConn) return;
    const ip = selectedConn.ip || selectedConn.host;
    setNodeBusy(true);
    setNodeNote(null);
    const res = await toggleNode(ip, Boolean(selectedConn.blocked));
    setNodeBusy(false);
    if (!res.ok) {
      setNodeNote(
        res.reason === "need-admin" || res.reason === "desktop-only"
          ? "Need administrator — Windows will not drop this IP without it."
          : res.reason || "Could not change the node."
      );
      return;
    }
    setNodeNote(
      selectedConn.blocked
        ? "Restored — route and firewall rule removed."
        : "OS cut — sockets RST, firewall + blackhole on this IP. Device will not talk to it."
    );
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const a = clientToSvg(drag.sx, drag.sy);
    const b = clientToSvg(e.clientX, e.clientY);
    setPan({ x: drag.px + (b.x - a.x), y: drag.py + (b.y - a.y) });
  };

  const endPan = () => {
    dragRef.current = null;
    setPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const origin = clientToSvg(e.clientX, e.clientY);
      const direction = e.deltaY > 0 ? -1 : 1;
      applyZoom(zoom + direction * ZOOM_STEP, origin);
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [applyZoom, clientToSvg, zoom]);

  return (
    <div className="h-full flex flex-col md:flex-row min-h-0">
      <div className="flex-1 relative min-h-0 border-b md:border-b-0 md:border-r border-line overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
          preserveAspectRatio="xMidYMid meet"
          className={`absolute inset-0 w-full h-full neuron-map-stage ${panning ? "is-panning" : ""}`}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerLeave={endPan}
          onDoubleClick={resetView}
        >
          <defs>
            <filter id="live-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <g stroke="var(--line)" strokeWidth={1} fill="none">
              {radarRings.map((r) => (
                <circle key={r} cx={DEVICE_SOMA.cx} cy={DEVICE_SOMA.cy} r={r} strokeDasharray="2 8" />
              ))}
            </g>
            <g stroke="var(--line)" strokeWidth={1}>
              <line
                x1={DEVICE_SOMA.cx - radarRings[radarRings.length - 1]}
                y1={DEVICE_SOMA.cy}
                x2={DEVICE_SOMA.cx + radarRings[radarRings.length - 1]}
                y2={DEVICE_SOMA.cy}
              />
              <line
                x1={DEVICE_SOMA.cx}
                y1={DEVICE_SOMA.cy - radarRings[radarRings.length - 1]}
                x2={DEVICE_SOMA.cx}
                y2={DEVICE_SOMA.cy + radarRings[radarRings.length - 1]}
              />
            </g>

            <g stroke="var(--line-strong)" strokeWidth={1.4} strokeLinecap="round">
              {DEVICE_HAIRS.map((d, i) => (
                <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
              ))}
            </g>
            <circle
              cx={DEVICE_SOMA.cx}
              cy={DEVICE_SOMA.cy}
              r={DEVICE_SOMA.r}
              fill="var(--signal)"
              opacity={0.14}
              filter="url(#live-glow)"
            />
            <circle
              cx={DEVICE_SOMA.cx}
              cy={DEVICE_SOMA.cy}
              r={DEVICE_SOMA.r}
              fill="var(--bg)"
              stroke="var(--ink)"
              strokeWidth={2}
            />
            <text
              x={DEVICE_SOMA.cx}
              y={DEVICE_SOMA.cy + 4}
              textAnchor="middle"
              className="font-mono"
              fontSize={10}
              letterSpacing={1.4}
              fill="var(--ink-dim)"
            >
              DEVICE
            </text>

            {stableConnections.map((conn) => {
              const target = somaLayout.get(conn.host);
              if (!target) return null;
              const axon = buildAxon(target, conn.host);
              const away = outwardAngle(target);
              const hairs = buildOutwardHairs(target, away, 3, conn.host);
              const color = conn.variant === "alert" ? "var(--alert)" : "var(--signal)";
              const idle = tickMs > 0 && tickMs - conn.lastActivityMs > 3200;
              const showIp = conn.ip && conn.ip !== conn.name;
              const focused = hoverHost === conn.host || selectedHost === conn.host;
              const cut = Boolean(conn.blocked);
              const labelR = target.r + 18;
              const lx = target.cx + Math.cos(away) * labelR;
              const ly = target.cy + Math.sin(away) * labelR;
              const anchor = Math.cos(away) >= 0 ? "start" : "end";
              return (
                <g
                  key={conn.host}
                  data-synapse={conn.host}
                  className={`${enteringHosts.has(conn.host) ? "neuron-node-enter" : ""} ${cut ? "neuron-node-cut" : ""}`}
                  style={{ cursor: "pointer", opacity: cut ? 0.42 : 1 }}
                  onPointerEnter={() => setHoverHost(conn.host)}
                  onPointerLeave={() => setHoverHost((h) => (h === conn.host ? null : h))}
                  onPointerDown={(e) => onNodePointerDown(e, conn.host)}
                  onPointerUp={(e) => onNodePointerUp(e, conn.host)}
                >
                  <path
                    ref={(el) => {
                      if (el) pathRefs.current.set(conn.host, el);
                    }}
                    d={axon.d}
                    fill="none"
                    stroke="var(--line-strong)"
                    strokeWidth={focused ? 2.4 : 1.6}
                  />
                  <g stroke="var(--line-strong)" strokeWidth={1.2} fill="none" opacity={0.55}>
                    {axon.forks.map((f, fi) => (
                      <path key={fi} d={f.d} />
                    ))}
                  </g>
                  <g stroke="var(--line-strong)" strokeWidth={1.6} opacity={0.7}>
                    {axon.ticks.map((t, ti) => (
                      <line key={ti} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
                    ))}
                  </g>
                  <g stroke="var(--line-strong)" strokeWidth={1.1} strokeLinecap="round" opacity={0.65}>
                    {hairs.map((d, di) => (
                      <line key={di} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
                    ))}
                  </g>
                  <circle
                    cx={target.cx}
                    cy={target.cy}
                    r={target.r}
                    fill={color}
                    opacity={idle ? 0.05 : 0.14}
                    filter="url(#live-glow)"
                  />
                  <circle
                    cx={target.cx}
                    cy={target.cy}
                    r={target.r}
                    fill="var(--bg)"
                    stroke={focused ? color : "var(--ink)"}
                    strokeWidth={focused ? 2.4 : 1.8}
                    opacity={idle ? 0.55 : 1}
                  />
                  <circle cx={target.cx} cy={target.cy} r={3.5} fill={color} opacity={idle ? 0.4 : 0.9} />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    className="font-mono"
                    fontSize={9}
                    fontWeight={600}
                    fill={conn.variant === "alert" ? "var(--alert)" : "var(--ink)"}
                  >
                    {shortHostLabel(conn.name, 18)}
                  </text>
                  {showIp && (
                    <text
                      x={lx}
                      y={ly + 12}
                      textAnchor={anchor}
                      className="font-mono"
                      fontSize={8}
                      fill="var(--ink-dim)"
                    >
                      {conn.ip}
                    </text>
                  )}
                </g>
              );
            })}

            {activeDots
              .filter((event) => visibleHosts.has(event.host))
              .map((event) => (
                <PacketDot key={event.id} event={event} pathRefs={pathRefs} onDone={() => removeDot(event.id)} />
              ))}
          </g>
        </svg>

        {connectingHost && (
          <div className="absolute top-3 right-16 font-mono text-[0.62rem] text-signal uppercase tracking-[0.12em] animate-pulse">
            Connecting to {connectingHost}…
          </div>
        )}

        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 pointer-events-none max-w-[min(92%,34rem)] pr-16">
          {capture.active ? (
            <div className="font-mono text-[0.6rem] text-signal uppercase tracking-[0.1em] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
              Raw capture · {capture.description || capture.device}
            </div>
          ) : capture.reason ? (
            <div className="font-mono text-[0.6rem] text-ink-dim uppercase tracking-[0.1em] opacity-70">
              Connection polling · {capture.reason}
            </div>
          ) : null}
          <div className="font-mono text-[0.58rem] text-ink-dim uppercase tracking-[0.1em] opacity-70">
            {filter === "all"
              ? `${connections.length} active · ${packetRate} pkt/s`
              : `${visibleConnections.length} / ${connections.length} · ${packetRate} pkt/s`}
          </div>
          <div className="neuron-filter pointer-events-auto" role="tablist" aria-label="Neuron categories">
            {NEURON_FILTERS.map((chip) => {
              const on = filter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={`neuron-filter-chip ${on ? "is-on" : ""}`}
                  onClick={() => setFilter(chip.id)}
                >
                  <span>{chip.label}</span>
                  <span className="neuron-filter-count">{categoryCounts[chip.id]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="absolute top-3 right-3 neuron-hud-stack z-10">
          <button type="button" className="neuron-hud-btn" onClick={() => applyZoom(zoom + ZOOM_STEP)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="neuron-hud-btn" onClick={() => applyZoom(zoom - ZOOM_STEP)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="neuron-hud-btn" onClick={resetView} aria-label="Reset view">
            {Math.round(zoom * 100)}
          </button>
          {onToggleImmersive && (
            <button
              type="button"
              className="neuron-hud-btn"
              onClick={onToggleImmersive}
              aria-label={immersive ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {immersive ? "✕" : "⛶"}
            </button>
          )}
        </div>

        {selectedConn && selectedDest && (
          <div className="neuron-inspect z-20">
            <div className="neuron-inspect-head">
              <span>{selectedConn.blocked ? "Cut" : "Live"}</span>
              <button type="button" className="neuron-inspect-x" onClick={() => setSelectedHost(null)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="neuron-inspect-name">{selectedConn.name}</div>
            {selectedConn.ip && selectedConn.ip !== selectedConn.name && (
              <div className="neuron-inspect-ip">{selectedConn.ip}{selectedConn.port ? `:${selectedConn.port}` : ""}</div>
            )}
            <button
              type="button"
              className="neuron-inspect-link"
              onClick={() => selectedDest.href && openDestination(selectedDest.href)}
            >
              {selectedDest.label}
            </button>
            {selectedConn.processPath ? (
              <button type="button" className="neuron-inspect-link" onClick={() => revealPath(selectedConn.processPath!)}>
                {selectedConn.processPath}
              </button>
            ) : (
              <div className="neuron-inspect-muted">
                {elevated ? "No local path for this node" : "Exe path needs administrator"}
              </div>
            )}
            {selectedConn.meta && <div className="neuron-inspect-meta">{selectedConn.meta}</div>}
            <button
              type="button"
              className={`neuron-switch ${selectedConn.blocked ? "is-off" : "is-on"}`}
              disabled={nodeBusy}
              onClick={cutOrRestore}
            >
              <span className="neuron-switch-knob" />
              <span className="neuron-switch-label">{selectedConn.blocked ? "Off" : "On"}</span>
            </button>
            {nodeNote && <div className="neuron-inspect-note">{nodeNote}</div>}
          </div>
        )}

        <form
          onSubmit={submitConnect}
          className="absolute bottom-3 left-3 right-3 md:right-16 z-20 flex items-center gap-2 bg-bg-raised/90 border border-line rounded-md px-3 py-2 backdrop-blur-sm"
        >
          <span className="font-mono text-[0.62rem] text-signal shrink-0">$</span>
          <span className="font-mono text-[0.62rem] text-ink-dim shrink-0 hidden sm:inline">connect_to</span>
          <input
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            placeholder="google.com"
            data-cursor="Type"
            className="bg-transparent flex-1 min-w-0 font-mono text-xs text-ink focus:outline-none placeholder:text-ink-dim/60"
          />
          <button
            type="submit"
            data-cursor="Connect"
            className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-signal hover:opacity-80 transition-opacity shrink-0"
          >
            ↵ run
          </button>
        </form>
      </div>

      {!immersive && (
        <div className="w-full md:w-72 shrink-0 flex flex-col min-h-0 max-h-[40%] md:max-h-none">
          <div className="px-3 py-2 border-b border-line shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-dim flex items-center justify-between">
            <span>Connections</span>
            <span className="text-ink">{sortedConnections.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {sortedConnections.length === 0 && (
              <div className="px-3 py-3 font-mono text-[0.62rem] text-ink-dim opacity-60">
                {filter === "all" ? "listening…" : "no matches"}
              </div>
            )}
            <table className="w-full text-left">
              <tbody>
                {sortedConnections.map((conn) => (
                  <ConnectionRow
                    key={conn.host}
                    conn={conn}
                    tickMs={tickMs}
                    selected={selectedHost === conn.host}
                    onHover={setHoverHost}
                    onSelect={selectNode}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line shrink-0 max-h-32 md:max-h-40 overflow-y-auto">
            <div className="px-3 py-1.5 font-mono text-[0.58rem] uppercase tracking-[0.1em] text-ink-dim sticky top-0 bg-bg">
              Packet log
            </div>
            <div className="px-3 pb-2 font-mono text-[0.58rem] text-ink-dim leading-relaxed">
              {recentLog.length === 0 && <div className="opacity-60">no packets yet</div>}
              {recentLog.map((e) => (
                <div key={e.id} className={e.ok ? "" : "text-alert"}>
                  {e.kind === "out" ? "↗" : "↙"} {shortHostLabel(e.host, 18)} · {e.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionRow({
  conn,
  tickMs,
  selected,
  onHover,
  onSelect,
}: {
  conn: ConnectionInfo;
  tickMs: number;
  selected: boolean;
  onHover: (host: string | null) => void;
  onSelect: (host: string) => void;
}) {
  const idle = tickMs > 0 && tickMs - conn.lastActivityMs > 3200;
  const showIp = conn.ip && conn.ip !== conn.name;
  return (
    <tr
      className={`border-b border-line/60 align-top cursor-pointer hover:bg-bg-raised/50 ${selected ? "bg-bg-raised" : ""}`}
      onPointerEnter={() => onHover(conn.host)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onSelect(conn.host)}
    >
      <td className="px-3 py-1.5 w-3">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full mt-1 ${
            conn.variant === "alert" ? "bg-alert" : idle ? "bg-ink-dim" : "bg-signal"
          }`}
        />
      </td>
      <td className="px-0 py-1.5 font-mono text-[0.66rem] leading-tight">
        <div className={conn.variant === "alert" ? "text-alert" : "text-ink"}>{conn.name}</div>
        {showIp && <div className="text-ink-dim">{conn.ip}</div>}
        {conn.meta && <div className="text-signal opacity-80">{conn.meta}</div>}
      </td>
      <td className="px-3 py-1.5 font-mono text-[0.6rem] text-ink-dim text-right whitespace-nowrap">
        ×{conn.requestCount}
      </td>
    </tr>
  );
}

function PacketDot({
  event,
  pathRefs,
  onDone,
}: {
  event: PacketEvent;
  pathRefs: RefObject<Map<string, SVGPathElement>>;
  onDone: () => void;
}) {
  const dotRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let killed = false;
    let tween: { kill: () => void } | null = null;
    const startedAt = performance.now();

    const tryStart = () => {
      if (killed) return;
      if (document.hidden) {
        onDone();
        return;
      }
      const path = pathRefs.current.get(event.host);
      const dot = dotRef.current;
      if (!path || !dot) {
        if (performance.now() - startedAt > 1500) {
          onDone();
          return;
        }
        requestAnimationFrame(tryStart);
        return;
      }

      const duration = Math.min(1.4, Math.max(0.45, (event.durationMs ?? 500) / 1000));
      tween = gsap.to(dot, {
        motionPath: {
          path,
          align: path,
          alignOrigin: [0.5, 0.5],
          start: event.kind === "out" ? 0 : 1,
          end: event.kind === "out" ? 1 : 0,
        },
        duration,
        ease: "sine.inOut",
        onComplete: onDone,
      });
    };

    tryStart();
    return () => {
      killed = true;
      tween?.kill();
      onDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <circle
      ref={dotRef}
      r={event.kind === "out" ? 6 : 4.5}
      fill={event.ok ? "var(--signal)" : "var(--alert)"}
      filter="url(#live-glow)"
    />
  );
}
