"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { buildDendrites } from "@/lib/pulse/neuron";
import { buildAxon, targetSomaPosition, DEVICE_SOMA, NETWORK_VIEW } from "@/lib/pulse/network";
import { useNetworkPulses, type PacketEvent } from "@/lib/pulse/useNetworkPulses";

const DEVICE_DENDRITES = buildDendrites(DEVICE_SOMA.cx, DEVICE_SOMA.cy, DEVICE_SOMA.r, 6, "left", 11);

interface LiveNeuronNetworkProps {
  active: boolean;
}

// The real thing: every request this browser makes becomes an outbound
// pulse, every response an inbound one, traveling along that host's own
// axon. A second connection — whether the page itself talks to a second
// host, or the visitor types one in — gets its own soma and its own axon,
// firing in parallel. This is what "the neuron now runs with two" looks
// like when it's driven by actual browser network events.
export function LiveNeuronNetwork({ active }: LiveNeuronNetworkProps) {
  const { connections, events, connectTo, connectingHost } = useNetworkPulses(active);
  const reducedMotion = usePrefersReducedMotion();
  const [hostInput, setHostInput] = useState("");
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const [activeDots, setActiveDots] = useState<PacketEvent[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const [tickMs, setTickMs] = useState(0);

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
    if (!reducedMotion) {
      setActiveDots((prev) => [...prev, ...fresh]);
    }
  }, [events, reducedMotion]);

  const removeDot = (id: string) => {
    setActiveDots((prev) => prev.filter((d) => d.id !== id));
  };

  const submitConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostInput.trim()) return;
    connectTo(hostInput);
    setHostInput("");
  };

  const recentLog = events.slice(-5).reverse();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative min-h-0">
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

          <g stroke="var(--line-strong)" strokeWidth={1.5} strokeLinecap="round">
            {DEVICE_DENDRITES.map((d, i) => (
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
            y={DEVICE_SOMA.cy + DEVICE_SOMA.r + 22}
            textAnchor="middle"
            className="font-mono"
            fontSize={12}
            letterSpacing={1.2}
            fill="var(--ink-dim)"
          >
            YOUR DEVICE
          </text>

          {connections.map((conn, i) => {
            const target = targetSomaPosition(i, connections.length);
            const axon = buildAxon(target);
            const dendrites = buildDendrites(target.cx, target.cy, target.r, 4, "right", 31 + i * 7);
            const color = conn.variant === "alert" ? "var(--alert)" : "var(--signal)";
            const idle = tickMs > 0 && tickMs - conn.lastActivityMs > 3200;

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
                <g stroke="var(--line-strong)" strokeWidth={2}>
                  {axon.ticks.map((t, ti) => (
                    <line key={ti} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
                  ))}
                </g>
                <g stroke="var(--line-strong)" strokeWidth={1.2} strokeLinecap="round">
                  {dendrites.map((d, di) => (
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
                <text
                  x={target.cx}
                  y={target.cy - target.r - (conn.meta ? 24 : 10)}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={11}
                  fill={conn.variant === "alert" ? "var(--alert)" : "var(--ink-dim)"}
                >
                  {conn.host}
                </text>
                {conn.meta && (
                  <text
                    x={target.cx}
                    y={target.cy - target.r - 10}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize={10}
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
      </div>

      <div className="border-t border-line px-4 md:px-6 py-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between shrink-0">
        <form onSubmit={submitConnect} className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-ink-dim">Connect to</span>
          <input
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            placeholder="google.com"
            data-cursor="Type"
            className="bg-bg-raised border border-line rounded-full px-3 py-1.5 font-mono text-xs text-ink w-32 md:w-36 focus:outline-none focus:border-signal"
          />
          <button
            type="submit"
            data-cursor="Connect"
            className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-signal hover:opacity-80 transition-opacity"
          >
            Connect ↗
          </button>
        </form>

        <div className="font-mono text-[0.6rem] text-ink-dim leading-relaxed md:text-right">
          {recentLog.length === 0 && <div className="opacity-60">listening for packets…</div>}
          {recentLog.map((e) => (
            <div key={e.id} className={e.ok ? "" : "text-alert"}>
              {e.kind === "out" ? "↗" : "↙"} {e.host} · {e.label}
            </div>
          ))}
        </div>
      </div>
    </div>
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
