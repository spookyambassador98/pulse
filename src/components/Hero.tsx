"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { KineticHeadline } from "./KineticHeadline";
import { PulseTrace } from "./PulseTrace";
import { MagneticButton } from "./MagneticButton";

interface HeroProps {
  ready: boolean;
}

// 01 SIGNAL — the diagnostic monitor's main screen. On scroll it "pours"
// into the page: scales down, blurs, and its two lines drift apart before
// section 02 pins in underneath.
export function Hero({ ready }: HeroProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const stage = stageRef.current;
    const section = sectionRef.current;
    if (!stage || !section) return;

    const ctx = gsap.context(() => {
      gsap.to(stage, {
        scale: 0.86,
        filter: "blur(6px)",
        opacity: 0.4,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom top",
          scrub: 0.5,
        },
      });
    }, section);

    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <section ref={sectionRef} className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
      <div ref={stageRef} className="flex-1 flex flex-col justify-center px-5 md:px-10 pt-28 pb-10">
        <div className="panel-index mb-6 flex items-center gap-3">
          <span>01</span>
          <span className="hairline flex-1" />
          <span>SIGNAL</span>
        </div>

        <KineticHeadline
          as="h1"
          trigger="load"
          delay={ready ? 0 : 0.15}
          className="font-display font-medium leading-[1.05] tracking-tight text-[13vw] md:text-[9vw]"
        >
          YOUR DEVICE
        </KineticHeadline>
        <KineticHeadline
          as="h1"
          trigger="load"
          delay={ready ? 0.12 : 0.27}
          className="font-display font-medium leading-[1.05] tracking-tight text-[13vw] md:text-[9vw] text-right md:pr-[6vw]"
        >
          <span className="font-accent italic font-normal text-signal">their</span> server
        </KineticHeadline>

        <p className="font-mono text-sm md:text-base text-ink-dim max-w-md mt-8">
          Pulse translates raw traffic between the two into a heartbeat you
          read at a glance — steady when it&apos;s healthy, erratic the
          moment it isn&apos;t.
        </p>

        <div className="mt-10">
          <MagneticButton variant="solid" cursorLabel="Watch ↗">
            Watch it diagnose ↗
          </MagneticButton>
        </div>
      </div>

      <div className="relative h-[16vh] md:h-[20vh] border-t border-line">
        <PulseTrace
          variant="healthy"
          seed={3}
          width={1600}
          height={220}
          color="var(--signal)"
          className="w-full h-full"
        />
      </div>
    </section>
  );
}
