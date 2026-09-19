"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

function subscribeTouch(callback: () => void) {
  const mql = window.matchMedia("(pointer: coarse)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getTouchSnapshot() {
  return window.matchMedia("(pointer: coarse)").matches;
}
function getTouchServerSnapshot() {
  return true;
}

// Physical custom cursor: trails the pointer with inertia, squashes along
// its velocity vector, grows over interactive elements, and can surface a
// contextual label ("View \u2197", "Drag") via data-cursor on any element.
export function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const isTouch = useSyncExternalStore(subscribeTouch, getTouchSnapshot, getTouchServerSnapshot);

  useEffect(() => {
    if (reducedMotion || isTouch) return;
    const dot = dotRef.current;
    const label = labelRef.current;
    if (!dot || !label) return;

    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const target = { ...pos };
    let lastX = pos.x;

    const quickX = gsap.quickTo(dot, "x", { duration: 0.35, ease: "power3.out" });
    const quickY = gsap.quickTo(dot, "y", { duration: 0.35, ease: "power3.out" });
    const quickLX = gsap.quickTo(label, "x", { duration: 0.5, ease: "power3.out" });
    const quickLY = gsap.quickTo(label, "y", { duration: 0.5, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      quickX(e.clientX);
      quickY(e.clientY);
      quickLX(e.clientX + 16);
      quickLY(e.clientY + 16);

      const vx = e.clientX - lastX;
      lastX = e.clientX;
      gsap.to(dot, {
        scaleX: gsap.utils.clamp(0.8, 1.8, 1 + Math.abs(vx) * 0.04),
        scaleY: gsap.utils.clamp(0.6, 1.2, 1 - Math.abs(vx) * 0.02),
        duration: 0.25,
        overwrite: "auto",
      });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target2 = el?.closest<HTMLElement>("[data-cursor]");
      if (target2) {
        gsap.to(dot, { scale: 2.6, duration: 0.3, ease: "pulse-out" });
        gsap.to(label, {
          opacity: 1,
          scale: 1,
          duration: 0.3,
          ease: "pulse-out",
        });
        label.textContent = target2.dataset.cursor ?? "";
      } else {
        gsap.to(dot, { scale: 1, duration: 0.3, ease: "pulse-out" });
        gsap.to(label, { opacity: 0, scale: 0.8, duration: 0.2 });
      }
    };

    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion, isTouch]);

  if (reducedMotion || isTouch) return null;

  return (
    <>
      <div ref={dotRef} className="cursor-dot" />
      <div ref={labelRef} className="cursor-label" />
    </>
  );
}
