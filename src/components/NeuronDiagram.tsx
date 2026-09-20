"use client";

import { useEffect, useId, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { buildDendrites, buildMyelinTicks, sampleCubicBezier } from "@/lib/pulse/neuron";

interface NeuronDiagramProps {
  className?: string;
  variant?: "healthy" | "alert";
  labelLeft?: string;
  labelRight?: string;
}

// Fixed geometry — none of it depends on props/state, so it's computed once
// at module scope rather than re-derived (or memoized with churny deps) on
// every render.
const DEVICE_SOMA = { cx: 150, cy: 210, r: 44 };
const SITE_SOMA = { cx: 830, cy: 200, r: 42 };
const SATELLITE_1 = { cx: 878, cy: 158, r: 23 };
const SATELLITE_2 = { cx: 886, cy: 240, r: 19 };

const AXON_P0 = { x: DEVICE_SOMA.cx + DEVICE_SOMA.r, y: DEVICE_SOMA.cy };
const AXON_C1 = { x: 400, y: 130 };
const AXON_C2 = { x: 600, y: 275 };
const AXON_P3 = { x: SITE_SOMA.cx - SITE_SOMA.r, y: SITE_SOMA.cy };
const AXON_D = `M${AXON_P0.x},${AXON_P0.y} C${AXON_C1.x},${AXON_C1.y} ${AXON_C2.x},${AXON_C2.y} ${AXON_P3.x},${AXON_P3.y}`;

const DEVICE_DENDRITES = buildDendrites(DEVICE_SOMA.cx, DEVICE_SOMA.cy, DEVICE_SOMA.r, 6, "left", 11);
const SITE_DENDRITES = buildDendrites(SITE_SOMA.cx, SITE_SOMA.cy, SITE_SOMA.r, 5, "right", 23);
const MYELIN_TICKS = buildMyelinTicks(sampleCubicBezier(AXON_P0, AXON_C1, AXON_C2, AXON_P3, 16), 9);

// The core visual metaphor: your device is one neuron, the target site is a
// small ganglion of neurons. An axon carries the request out as a traveling
// action potential; a second pulse carries the response back. This replaces
// the earlier cardiograph motif — Pulse reads a *nervous system*, not a
// heartbeat.
export function NeuronDiagram({
  className,
  variant = "healthy",
  labelLeft = "YOUR DEVICE",
  labelRight = "THEIR SERVER",
}: NeuronDiagramProps) {
  const id = useId().replace(/:/g, "");
  const pathRef = useRef<SVGPathElement>(null);
  const outboundRef = useRef<SVGCircleElement>(null);
  const returnRef = useRef<SVGCircleElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const deviceSoma = DEVICE_SOMA;
  const siteSoma = SITE_SOMA;
  const satellite1 = SATELLITE_1;
  const satellite2 = SATELLITE_2;
  const axonD = AXON_D;
  const deviceDendrites = DEVICE_DENDRITES;
  const siteDendrites = SITE_DENDRITES;
  const myelinTicks = MYELIN_TICKS;

  useEffect(() => {
    if (reducedMotion) return;
    const path = pathRef.current;
    const outbound = outboundRef.current;
    const ret = returnRef.current;
    if (!path || !outbound) return;

    const isAlert = variant === "alert";

    const outTween = gsap.to(outbound, {
      motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
      duration: isAlert ? 1.5 : 1.9,
      repeat: -1,
      repeatDelay: isAlert ? 0.15 : 0.5,
      ease: isAlert ? "power1.in" : "sine.inOut",
    });

    let retTween: gsap.core.Tween | undefined;
    if (ret) {
      retTween = gsap.to(ret, {
        motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: 1, end: 0 },
        duration: isAlert ? 1.7 : 1.6,
        repeat: -1,
        delay: 0.85,
        repeatDelay: isAlert ? 0.6 : 0.55,
        ease: "sine.inOut",
      });
    }

    return () => {
      outTween.kill();
      retTween?.kill();
    };
  }, [reducedMotion, variant]);

  const strokeColor = variant === "alert" ? "var(--alert)" : "var(--signal)";

  return (
    <svg
      viewBox="0 0 1000 400"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* dendrites */}
      <g stroke="var(--line-strong)" strokeWidth={1.5} strokeLinecap="round">
        {deviceDendrites.map((d, i) => (
          <line key={`dd-${i}`} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
        ))}
        {siteDendrites.map((d, i) => (
          <line key={`sd-${i}`} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
        ))}
        <line x1={siteSoma.cx + 20} y1={siteSoma.cy - 20} x2={satellite1.cx - 12} y2={satellite1.cy + 8} />
        <line x1={siteSoma.cx + 18} y1={siteSoma.cy + 22} x2={satellite2.cx - 10} y2={satellite2.cy - 6} />
      </g>

      {/* axon with myelin ticks */}
      <path ref={pathRef} d={axonD} fill="none" stroke="var(--line-strong)" strokeWidth={2} />
      <g stroke="var(--line-strong)" strokeWidth={2}>
        {myelinTicks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
        ))}
      </g>

      {/* site ganglion (satellite somas) */}
      <g filter={`url(#${id}-glow)`}>
        <circle cx={satellite1.cx} cy={satellite1.cy} r={satellite1.r} fill={strokeColor} opacity={0.1} />
        <circle cx={satellite2.cx} cy={satellite2.cy} r={satellite2.r} fill={strokeColor} opacity={0.1} />
        <circle cx={siteSoma.cx} cy={siteSoma.cy} r={siteSoma.r} fill={strokeColor} opacity={0.14} />
      </g>
      <circle cx={satellite1.cx} cy={satellite1.cy} r={satellite1.r} fill="var(--bg)" stroke="var(--ink)" strokeWidth={1.5} />
      <circle cx={satellite2.cx} cy={satellite2.cy} r={satellite2.r} fill="var(--bg)" stroke="var(--ink)" strokeWidth={1.5} />
      <circle cx={siteSoma.cx} cy={siteSoma.cy} r={siteSoma.r} fill="var(--bg)" stroke="var(--ink)" strokeWidth={2} />

      {/* device soma */}
      <circle
        cx={deviceSoma.cx}
        cy={deviceSoma.cy}
        r={deviceSoma.r}
        fill={strokeColor}
        opacity={0.14}
        filter={`url(#${id}-glow)`}
      />
      <circle cx={deviceSoma.cx} cy={deviceSoma.cy} r={deviceSoma.r} fill="var(--bg)" stroke="var(--ink)" strokeWidth={2} />

      {/* traveling action potentials */}
      {!reducedMotion && (
        <>
          <circle ref={outboundRef} r={7} fill={strokeColor} filter={`url(#${id}-glow)`} />
          <circle ref={returnRef} r={5} fill="var(--ink)" opacity={0.85} filter={`url(#${id}-glow)`} />
        </>
      )}

      {/* labels */}
      <text
        x={deviceSoma.cx}
        y={deviceSoma.cy + deviceSoma.r + 26}
        textAnchor="middle"
        className="font-mono"
        fontSize={13}
        letterSpacing={1.5}
        fill="var(--ink-dim)"
      >
        {labelLeft}
      </text>
      <text
        x={siteSoma.cx + 10}
        y={siteSoma.cy + siteSoma.r + 26}
        textAnchor="middle"
        className="font-mono"
        fontSize={13}
        letterSpacing={1.5}
        fill="var(--ink-dim)"
      >
        {labelRight}
      </text>
    </svg>
  );
}
