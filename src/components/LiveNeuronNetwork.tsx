"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import {
  buildAxon,
  buildDeviceHairs,
  buildOutwardHairs,
  targetSomaPosition,
  outwardAngle,
  DEVICE_SOMA,
  NETWORK_VIEW,
  RADAR_RINGS,
} from "@/lib/pulse/network";
import { useNetworkPulses, type PacketEvent, type ConnectionInfo } from "@/lib/pulse/useNetworkPulses";

const DEVICE_HAIRS = buildDeviceHairs(28, 11);

interface LiveNeuronNetworkProps {
  active: boolean;
}

// The real thing: every request this browser makes becomes an outbound
// pulse, every response an inbound one, traveling along that host's own
// axon — one soma per host, each firing independently, radiating outward
// from the device the way dendrites actually branch, not fanned to one
// side of a diagram.
export function LiveNeuronNetwork({ active }: LiveNeuronNetworkProps) {
  const { connections, events, connectTo, connectingHost, capture } = useNetworkPulses(active);
  const reducedMotion = usePrefersReducedMotion();
  const [hostInput, setHostInput] = useState("");
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const [activeDots, setActiveDots] = useState<PacketEvent[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const [tickMs, setTickMs] = useState(0);
  const packetCountRef = useRef(0);
  const [packetRate, setPacketRate] = useState(0);

  // A render-safe "now" for idle checks below — performance.now() itself is
  // only ever called inside this interval callback, never during render.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTickMs(performance.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    const fresh = events.filter((e) => !seenIds.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach((e) => seenIds.current.add(e.id));
    packetCountRef.current += fresh.length;
    if (!reducedMotion) {
      setActiveDots((prev) => [...prev, ...fresh]);
    }
  }, [events, reducedMotion]);

  // Rolling packets/sec readout — an instrument number, not decoration.
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

  const recentLog = events.slice(-8).reverse();
  const sortedConnections = useMemo(
    () => [...connections].sort((a, b) => b.lastActivityMs - a.lastActivityMs),
    [connections]
  );

  return (
    <div className="h-full flex flex-col md:flex-row min-h-0">
      {/* ---- radial visualization ------------------------------------- */}
      <div className="flex-1 relative min-h-0 border-b md:border-b-0 md:border-r border-line">
        <svg
          viewBox={`0 0 ${NETWORK_VIEW.width} ${NETWORK_VIEW.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
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

          {/* radar instrument rings + crosshair — a diagnostic readout, not a hero graphic */}
          <g stroke="var(--line)" strokeWidth={1} fill="none">
            {RADAR_RINGS.map((r) => (
              <circle key={r} cx={DEVICE_SOMA.cx} cy={DEVICE_SOMA.cy} r={r} strokeDasharray="2 8" />
            ))}
          </g>
          <g stroke="var(--line)" strokeWidth={1}>
            <line
              x1={DEVICE_SOMA.cx - RADAR_RINGS[RADAR_RINGS.length - 1]}
              y1={DEVICE_SOMA.cy}
              x2={DEVICE_SOMA.cx + RADAR_RINGS[RADAR_RINGS.length - 1]}
              y2={DEVICE_SOMA.cy}
            />
            <line
              x1={DEVICE_SOMA.cx}
              y1={DEVICE_SOMA.cy - RADAR_RINGS[RADAR_RINGS.length - 1]}
              x2={DEVICE_SOMA.cx}
              y2={DEVICE_SOMA.cy + RADAR_RINGS[RADAR_RINGS.length - 1]}
            />
          </g>

          {/* device soma — dendrites radiating in every direction, like the real thing */}
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
          <circle cx={DEVICE_SOMA.cx} cy={DEVICE_SOMA.cy} r={DEVICE_SOMA.r} fill="var(--bg)" stroke="var(--ink)" strokeWidth={2} />
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

          {sortedConnections.map((conn, i) => {
            const target = targetSomaPosition(conn.host, i, sortedConnections.length);
            const axon = buildAxon(target, conn.host);
            const away = outwardAngle(target);
            const hairs = buildOutwardHairs(target, away, 4, conn.host);
            const color = conn.variant === "alert" ? "var(--alert)" : "var(--signal)";
            const idle = tickMs > 0 && tickMs - conn.lastActivityMs > 3200;
            const showIp = conn.ip && conn.ip !== conn.name;

            return (
              <g key={conn.host}>
                <path
                  ref={(el) => {
                    if (el) pathRefs.current.set(conn.host, el);
                  }}
                  d={axon.d}
                  fill="none"
                  stroke="var(--line-strong)"
                  strokeWidth={2}
                />
                <g stroke="var(--line-strong)" strokeWidth={1.4} fill="none">
                  {axon.forks.map((f, fi) => (
                    <path key={fi} d={f.d} />
                  ))}
                </g>
                <g stroke="var(--line-strong)" strokeWidth={2}>
                  {axon.ticks.map((t, ti) => (
                    <line key={ti} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
                  ))}
                </g>
                <g stroke="var(--line-strong)" strokeWidth={1.2} strokeLinecap="round">
                  {hairs.map((d, di) => (
                    <line key={di} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
                  ))}
                </g>
                <circle
                  cx={target.cx}
                  cy={target.cy}
                  r={target.r}
                  fill={color}
                  opacity={idle ? 0.06 : 0.16}
                  filter="url(#live-glow)"
                />
                <circle
                  cx={target.cx}
                  cy={target.cy}
                  r={target.r}
                  fill="var(--bg)"
                  stroke="var(--ink)"
                  strokeWidth={2}
                  opacity={idle ? 0.5 : 1}
                />
                {/* source name above the node */}
                <text
                  x={target.cx}
                  y={target.cy - target.r - (showIp ? 20 : 8)}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={10.5}
                  fontWeight={600}
                  fill={conn.variant === "alert" ? "var(--alert)" : "var(--ink)"}
                >
                  {conn.name}
                </text>
                {/* address below the name, only when it's known and distinct */}
                {showIp && (
                  <text
                    x={target.cx}
                    y={target.cy - target.r - 7}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={9}
                    fill="var(--ink-dim)"
                  >
                    {conn.ip}
                  </text>
                )}
                {conn.meta && (
                  <text
                    x={target.cx}
                    y={target.cy + target.r + 14}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={8.5}
                    fill="var(--signal)"
                  >
                    {conn.meta}
                  </text>
                )}
              </g>
            );
          })}

          {activeDots.map((event) => (
            <PacketDot key={event.id} event={event} pathRefs={pathRefs} onDone={() => removeDot(event.id)} />
          ))}
        </svg>

        {connectingHost && (
          <div className="absolute top-3 right-3 font-mono text-[0.62rem] text-signal uppercase tracking-[0.12em] animate-pulse">
            Connecting to {connectingHost}…
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-col gap-1">
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
            {sortedConnections.length} active · {packetRate} pkt/s
          </div>
        </div>

        {/* command-style input — a tool prompt, not a marketing pill */}
        <form
          onSubmit={submitConnect}
          className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-bg-raised/90 border border-line rounded-md px-3 py-2 backdrop-blur-sm"
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

      {/* ---- connection table + packet log (the "software" panel) ------ */}
      <div className="w-full md:w-72 shrink-0 flex flex-col min-h-0 max-h-[40%] md:max-h-none">
        <div className="px-3 py-2 border-b border-line shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ink-dim flex items-center justify-between">
          <span>Connections</span>
          <span className="text-ink">{sortedConnections.length}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {sortedConnections.length === 0 && (
            <div className="px-3 py-3 font-mono text-[0.62rem] text-ink-dim opacity-60">listening…</div>
          )}
          <table className="w-full text-left">
            <tbody>
              {sortedConnections.map((conn) => (
                <ConnectionRow key={conn.host} conn={conn} tickMs={tickMs} />
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
                {e.kind === "out" ? "↗" : "↙"} {e.host} · {e.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionRow({ conn, tickMs }: { conn: ConnectionInfo; tickMs: number }) {
  const idle = tickMs > 0 && tickMs - conn.lastActivityMs > 3200;
  const showIp = conn.ip && conn.ip !== conn.name;
  return (
    <tr className="border-b border-line/60 align-top">
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
    const path = pathRefs.current.get(event.host);
    const dot = dotRef.current;
    if (!path || !dot) {
      onDone();
      return;
    }

    const duration = Math.min(1.4, Math.max(0.45, (event.durationMs ?? 500) / 1000));
    const tween = gsap.to(dot, {
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

    return () => {
      tween.kill();
    };
    // Runs exactly once per dot instance — it animates itself out then unmounts.
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
