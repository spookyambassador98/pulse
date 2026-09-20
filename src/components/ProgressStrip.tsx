"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildSpikeTrain } from "@/lib/pulse/spikes";
import { ScrollTrigger } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

// Persistent HUD strip: scroll progress drawn as a live firing-rate raster.
// Reading down the page lights up spikes left to right, one neuron firing
// per scroll-tick.
export function ProgressStrip() {
  const revealRef = useRef<SVGGElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const width = 1600;
  const height = 60;
  const baseline = height * 0.8;
  const maxRise = height * 0.6;

  const spikes = useMemo(
    () => buildSpikeTrain({ width, variant: "healthy", seed: 42, density: 5 }),
    []
  );

  useEffect(() => {
    if (reducedMotion) return;
    const reveal = revealRef.current;
    if (!reveal) return;

    const trigger = ScrollTrigger.create({
      trigger: document.documentElement,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.3,
      onUpdate: (self) => {
        reveal.style.clipPath = `inset(0 ${(1 - self.progress) * 100}% 0 0)`;
      },
    });

    return () => trigger.kill();
  }, [reducedMotion]);

  const ticks = (color: string) => (
    <>
      <line x1={0} y1={baseline} x2={width} y2={baseline} stroke={color} strokeOpacity={0.3} strokeWidth={1} />
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
        />
      ))}
    </>
  );

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 h-10 md:h-12 pointer-events-none border-t border-line bg-bg/70 backdrop-blur-sm">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
        <g>{ticks("var(--line-strong)")}</g>
        <g ref={revealRef} style={reducedMotion ? undefined : { clipPath: "inset(0 100% 0 0)" }}>
          {ticks("var(--signal)")}
        </g>
      </svg>
    </div>
  );
}
