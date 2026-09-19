"use client";

import { useEffect, useRef } from "react";
import { buildTracePath } from "@/lib/pulse/trace";
import { ScrollTrigger } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

// Persistent HUD strip: the page's scroll progress drawn as a live ECG line.
// Reading down the page is, quite literally, reading a heartbeat.
export function ProgressStrip() {
  const pathRef = useRef<SVGPathElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const width = 1600;
  const height = 60;

  useEffect(() => {
    if (reducedMotion) return;
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    const trigger = ScrollTrigger.create({
      trigger: document.documentElement,
      start: "top top",
      end: "bottom bottom",
      scrub: 0.3,
      onUpdate: (self) => {
        path.style.strokeDashoffset = `${length - length * self.progress}`;
      },
    });

    return () => trigger.kill();
  }, [reducedMotion]);

  const d = buildTracePath({ width, height, variant: "healthy", seed: 42 });

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 h-10 md:h-12 pointer-events-none border-t border-line bg-bg/70 backdrop-blur-sm">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
        <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} />
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke="var(--signal)"
          strokeWidth={2}
          style={reducedMotion ? undefined : { strokeDasharray: 1, strokeDashoffset: 0 }}
        />
      </svg>
    </div>
  );
}
