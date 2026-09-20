"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { KineticHeadline } from "./KineticHeadline";
import { NeuronDiagram } from "./NeuronDiagram";
import { MagneticButton } from "./MagneticButton";

interface HeroProps {
  ready: boolean;
  onOpenMonitor: () => void;
}

// 01 SIGNAL — the diagnostic monitor's main screen. On scroll it "pours"
// into the page: scales down, blurs, and its two lines drift apart before
// section 02 pins in underneath.
export function Hero({ ready, onOpenMonitor }: HeroProps) {
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
          Your device is a neuron. Their server is another. Pulse watches the
          axon between them — a steady firing rate when it&apos;s healthy,
          misfires the moment it isn&apos;t.
        </p>

        <div className="mt-10">
          <MagneticButton variant="solid" cursorLabel="Watch ↗" onClick={onOpenMonitor}>
            Watch it live ↗
          </MagneticButton>
        </div>
      </div>

      <div className="relative h-[30vh] md:h-[34vh] border-t border-line">
        <NeuronDiagram variant="healthy" className="w-full h-full" />
      </div>
    </section>
  );
}
