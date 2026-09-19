"use client";

import { useEffect, useRef } from "react";
import { gsap, SplitText } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { MagneticButton } from "./MagneticButton";

// 05 READOUT — closing panel. The wordmark rises from the floor letter by
// letter as the footer scrolls into view, scrubbed to scroll position.
export function Footer() {
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const el = wordmarkRef.current;
    const section = sectionRef.current;
    if (!el || !section) return;

    let split: ReturnType<typeof SplitText.create> | null = null;
    let tween: gsap.core.Tween | null = null;
    let cancelled = false;

    // See KineticHeadline for why this waits on document.fonts.ready.
    document.fonts.ready.then(() => {
      if (cancelled || !el) return;
      split = SplitText.create(el, { type: "chars", mask: "chars" });
      gsap.set(split.chars, { yPercent: 100 });

      tween = gsap.to(split.chars, {
        yPercent: 0,
        stagger: 0.03,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top 90%",
          end: "top 20%",
          scrub: 0.6,
        },
      });
    });

    return () => {
      cancelled = true;
      tween?.kill();
      split?.revert();
    };
  }, [reducedMotion]);

  return (
    <footer ref={sectionRef} className="relative px-5 md:px-10 pt-32 md:pt-48 pb-10">
      <div className="panel-index flex items-center gap-3 mb-10">
        <span>05</span>
        <span className="hairline flex-1" />
        <span>READOUT</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-16 md:mb-24">
        <p className="font-mono text-sm md:text-base text-ink-dim max-w-sm">
          One URL. One live session. Watch it breathe, or watch it flatline —
          either way, you&apos;ll see it before anyone has to tell you.
        </p>
        <MagneticButton
          href="mailto:hello@pulse.dev?subject=Run%20a%20diagnosis"
          variant="solid"
          cursorLabel="Send ↗"
        >
          Run a diagnosis ↗
        </MagneticButton>
      </div>

      <h2
        ref={wordmarkRef}
        className="font-display font-medium leading-[0.98] tracking-tight text-[20vw] select-none"
      >
        PULSE
      </h2>

      <div className="hairline mt-8 mb-6" />
      <div className="flex flex-wrap items-center justify-between gap-4 font-mono text-xs tracking-[0.1em] uppercase text-ink-dim">
        <span>© {new Date().getFullYear()} Pulse — signal, translated.</span>
        <span>Session diagnostics, in real time.</span>
      </div>
    </footer>
  );
}
