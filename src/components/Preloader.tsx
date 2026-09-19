"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

const SESSION_KEY = "pulse-preloader-seen";

interface PreloaderProps {
  onComplete: () => void;
}

// Counter 000 -> 100, wordmark rises through a mask, then the whole sheet
// drains away behind a liquid SVG edge. Runs once per session, never blocks
// content for more than ~2s, and is fully skipped under reduced motion.
export function Preloader({ onComplete }: PreloaderProps) {
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const wordmarkRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const counter = useRef({ value: 0 });
  const completedRef = useRef(false);

  useEffect(() => {
    const alreadySeen =
      typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1";

    if (reducedMotion || alreadySeen) {
      completedRef.current = true;
      // Imperative DOM hide (not React state) — this is a one-time skip of
      // an overlay that has no other purpose once skipped.
      if (rootRef.current) rootRef.current.style.display = "none";
      onComplete();
      return;
    }

    sessionStorage.setItem(SESSION_KEY, "1");

    const tl = gsap.timeline({
      onComplete: () => {
        completedRef.current = true;
        onComplete();
      },
    });

    tl.to(counter.current, {
      value: 100,
      duration: 0.9,
      ease: "power2.inOut",
      onUpdate: () => {
        if (countRef.current) {
          countRef.current.textContent = String(Math.floor(counter.current.value)).padStart(3, "0");
        }
      },
    })
      .to(countRef.current, { opacity: 0, duration: 0.25 })
      .fromTo(
        wordmarkRef.current,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.55, ease: "pulse-out" },
        "-=0.1"
      )
      .to(
        pathRef.current,
        {
          // Morph the flat bottom edge into a bulging liquid curve, cueing the drain.
          attr: { d: "M0,100 C200,60 600,140 1000,90 L1000,101 L0,101 Z" },
          duration: 0.35,
          ease: "pulse-liquid",
        },
        "-=0.15"
      )
      .to(rootRef.current, {
        yPercent: -100,
        duration: 0.7,
        ease: "pulse-liquid",
      })
      .set(rootRef.current, { display: "none" });

    // Hard safety cap: never let the preloader block content much past ~2s
    // even if a tab is backgrounded mid-timeline.
    const safety = window.setTimeout(() => {
      if (!completedRef.current) {
        tl.progress(1);
      }
    }, 2400);

    return () => {
      window.clearTimeout(safety);
      tl.kill();
    };
  }, [reducedMotion, onComplete]);

  if (reducedMotion) return null;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg"
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-6">
        <span className="font-mono text-xs tracking-[0.3em] text-ink-dim uppercase">
          Establishing signal
        </span>
        <span
          ref={countRef}
          className="font-display text-[14vw] leading-none tabular-nums text-ink"
        >
          000
        </span>
        <span className="overflow-hidden absolute">
          <span
            ref={wordmarkRef}
            className="block font-display text-[14vw] leading-none tracking-tight text-ink translate-y-full"
          >
            PULSE
          </span>
        </span>
      </div>
      <svg
        className="absolute bottom-0 left-0 w-full h-[6vh]"
        viewBox="0 0 1000 101"
        preserveAspectRatio="none"
      >
        <path ref={pathRef} d="M0,100 L1000,100 L1000,101 L0,101 Z" fill="var(--bg)" />
      </svg>
    </div>
  );
}
