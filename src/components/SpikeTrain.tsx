"use client";

import { useMemo } from "react";
import { buildSpikeTrain, SpikeVariant } from "@/lib/pulse/spikes";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

interface SpikeTrainProps {
  width?: number;
  height?: number;
  variant?: SpikeVariant;
  seed?: number;
  className?: string;
  color?: string;
  /** Loops a bright scanning sweep across the raster. */
  animated?: boolean;
}

// A firing-rate raster — many discrete spikes over time — rather than a
// continuous cardiograph line. This is the neuron-native way to show "a lot
// of clean signal" vs "misfires and dropped beats."
export function SpikeTrain({
  width = 800,
  height = 100,
  variant = "healthy",
  seed = 7,
  className,
  color = "currentColor",
  animated = true,
}: SpikeTrainProps) {
  const reducedMotion = usePrefersReducedMotion();
  const spikes = useMemo(() => buildSpikeTrain({ width, variant, seed }), [width, variant, seed]);
  const baseline = height * 0.8;
  const maxRise = height * 0.66;

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full block"
        aria-hidden="true"
      >
        <line x1={0} y1={baseline} x2={width} y2={baseline} stroke={color} strokeOpacity={0.14} strokeWidth={1} />
        {spikes.map((s, i) => (
          <line
            key={i}
            x1={s.x}
            x2={s.x}
            y1={baseline}
            y2={baseline - s.height * maxRise}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.5 + s.height * 0.5}
          />
        ))}
      </svg>
      {animated && !reducedMotion && (
        <div
          className="spike-sweep"
          style={{ ["--sweep-color" as string]: color }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
