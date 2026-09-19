"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildTracePath, TraceVariant } from "@/lib/pulse/trace";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

interface PulseTraceProps {
  width?: number;
  height?: number;
  variant?: TraceVariant;
  seed?: number;
  className?: string;
  /** Loops a bright traveling segment along the line. */
  animated?: boolean;
  color?: string;
}

export function PulseTrace({
  width = 800,
  height = 120,
  variant = "healthy",
  seed = 7,
  className,
  animated = true,
  color = "currentColor",
}: PulseTraceProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const d = useMemo(
    () => buildTracePath({ width, height, variant, seed }),
    [width, height, variant, seed]
  );

  useEffect(() => {
    if (reducedMotion || !animated) return;
    const glow = glowRef.current;
    if (!glow) return;
    const length = glow.getTotalLength();
    const segment = length * 0.1;
    glow.style.strokeDasharray = `${segment} ${length - segment}`;

    const tween = gsap.fromTo(
      glow,
      { strokeDashoffset: 0 },
      {
        strokeDashoffset: -length,
        duration: length / 260,
        ease: "none",
        repeat: -1,
      }
    );
    return () => {
      tween.kill();
    };
  }, [reducedMotion, animated, d]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path ref={pathRef} d={d} fill="none" stroke={color} strokeOpacity={0.28} strokeWidth={2} />
      {animated && !reducedMotion && (
        <path
          ref={glowRef}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
