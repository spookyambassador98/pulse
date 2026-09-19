"use client";

import { useEffect, useRef } from "react";
import { gsap, SplitText } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

interface KineticHeadlineProps {
  as?: "h1" | "h2" | "h3";
  className?: string;
  children: React.ReactNode;
  /** Delay before the reveal starts, in seconds (e.g. wait for preloader). */
  delay?: number;
  trigger?: "load" | "scroll";
}

// Masked per-line reveal. Server renders the plain text (readable if JS
// fails / SEO-safe); SplitText only runs client-side to animate it in.
export function KineticHeadline({
  as = "h2",
  className,
  children,
  delay = 0,
  trigger = "scroll",
}: KineticHeadlineProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion) return;

    let split: ReturnType<typeof SplitText.create> | null = null;
    let anim: gsap.core.Tween | null = null;
    let cancelled = false;

    // SplitText measures line boxes using whatever font is active at that
    // instant. If it runs before the webfont swaps in, the mask wrapper
    // bakes in the fallback font's (shorter) line height and clips the
    // real font's ascenders/caps once it loads. Wait for fonts first.
    document.fonts.ready.then(() => {
      if (cancelled || !ref.current) return;
      split = SplitText.create(ref.current, {
        type: "lines",
        mask: "lines",
        linesClass: "kinetic-line",
      });

      gsap.set(split.lines, { yPercent: 110 });

      anim = gsap.to(split.lines, {
        yPercent: 0,
        duration: 1.1,
        stagger: 0.09,
        ease: "pulse-out",
        delay,
        ...(trigger === "scroll"
          ? {
              scrollTrigger: {
                trigger: ref.current,
                start: "top 85%",
              },
            }
          : {}),
      });
    });

    return () => {
      cancelled = true;
      anim?.kill();
      split?.revert();
    };
  }, [reducedMotion, delay, trigger]);

  const Tag = as;
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
