"use client";

import { useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";

interface MagneticButtonProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "solid" | "outline";
  cursorLabel?: string;
}

// Magnetic pull toward the pointer + a liquid blob that rises from below on
// hover (goo filter fuses the blob with the pill outline into one droplet).
export function MagneticButton({
  children,
  href,
  onClick,
  variant = "outline",
  cursorLabel = "Open \u2197",
}: MagneticButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const handleMove = (e: React.MouseEvent) => {
    if (reducedMotion) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(btnRef.current, {
      x: x * 0.35,
      y: y * 0.35,
      duration: 0.5,
      ease: "pulse-out",
    });
  };

  const handleLeave = () => {
    gsap.to(btnRef.current, { x: 0, y: 0, duration: 0.6, ease: "pulse-elastic" });
    gsap.to(blobRef.current, { scaleY: 0, duration: 0.4, ease: "pulse-liquid" });
  };

  const handleEnter = () => {
    gsap.to(blobRef.current, { scaleY: 1, duration: 0.5, ease: "pulse-liquid" });
  };

  const Tag = href ? "a" : "button";

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onMouseEnter={handleEnter}
      className="inline-block"
    >
      <Tag
        // @ts-expect-error - polymorphic ref across a/button
        ref={btnRef}
        href={href}
        onClick={onClick}
        data-cursor={cursorLabel}
        className={`goo relative overflow-hidden inline-flex items-center gap-3 rounded-full px-7 py-3.5 font-mono text-xs tracking-[0.16em] uppercase transition-colors duration-300 ${
          variant === "solid"
            ? "bg-signal text-bg"
            : "border border-line-strong text-ink hover:text-bg"
        }`}
      >
        {variant === "outline" && (
          <div
            ref={blobRef}
            className="absolute inset-x-[-20%] bottom-0 h-full bg-signal origin-bottom scale-y-0 -z-0"
            aria-hidden="true"
          />
        )}
        <span className="relative z-10">{children}</span>
      </Tag>
    </div>
  );
}
