"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { SpikeTrain } from "./SpikeTrain";

const BEATS = [
  {
    n: "01",
    label: "DNS LOOKUP",
    stat: "24ms",
    copy: "Your device asks the internet where the site actually lives.",
  },
  {
    n: "02",
    label: "TLS HANDSHAKE",
    stat: "88ms",
    copy: "A private channel is negotiated before a single byte of content moves.",
  },
  {
    n: "03",
    label: "REQUEST SENT",
    stat: "GET /",
    copy: "Headers, cookies, intent — the full ask leaves your device as one beat.",
  },
  {
    n: "04",
    label: "TIME TO FIRST BYTE",
    stat: "312ms",
    copy: "The server thinks. This gap is where most sessions start to limp.",
  },
  {
    n: "05",
    label: "RENDER SETTLES",
    stat: "0.9s",
    copy: "Paint completes. The rhythm either steadies here — or it doesn't.",
  },
];

// 02 TRACE — a pinned horizontal passage. The vertical scroll is converted
// into horizontal motion across an annotated session, beat by beat.
export function TraceSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const ctx = gsap.context(() => {
      const distance = track.scrollWidth - window.innerWidth;
      if (distance <= 0) return;

      const scrubTween = gsap.to(track, {
        x: -distance,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${distance + window.innerHeight * 0.4}`,
          scrub: 0.6,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      gsap.utils.toArray<HTMLElement>(".beat-card").forEach((card) => {
        gsap.fromTo(
          card,
          { opacity: 0.25, y: 24 },
          {
            opacity: 1,
            y: 0,
            ease: "pulse-out",
            scrollTrigger: {
              trigger: card,
              containerAnimation: scrubTween,
              start: "left 70%",
              end: "left 30%",
              scrub: true,
            },
          }
        );
      });
    }, section);

    return () => ctx.revert();
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <section ref={sectionRef} className="relative px-5 md:px-10 py-24">
        <SectionLabel n="02" label="TRACE" />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {BEATS.map((beat) => (
            <BeatCard key={beat.n} {...beat} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <div className="absolute top-10 left-5 md:left-10 z-10">
        <SectionLabel n="02" label="TRACE" />
      </div>
      <div ref={trackRef} className="flex items-center h-screen gap-6 md:gap-10 pl-[8vw] pr-[20vw] w-max">
        {BEATS.map((beat) => (
          <BeatCard key={beat.n} {...beat} wide />
        ))}
      </div>
      <SpikeTrain
        variant="healthy"
        seed={11}
        width={2200}
        height={80}
        color="var(--line-strong)"
        animated={false}
        className="absolute bottom-16 left-0 w-full h-16 opacity-60"
      />
    </section>
  );
}

function SectionLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="panel-index flex items-center gap-3">
      <span>{n}</span>
      <span className="hairline w-10" />
      <span>{label}</span>
    </div>
  );
}

function BeatCard({
  n,
  label,
  stat,
  copy,
  wide,
}: {
  n: string;
  label: string;
  stat: string;
  copy: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`beat-card border border-line rounded-2xl p-6 md:p-8 bg-bg-raised/60 backdrop-blur-sm flex flex-col justify-between ${
        wide ? "w-[78vw] md:w-[32vw] h-[52vh]" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="panel-index">{n}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-signal" />
      </div>
      <div>
        <div className="font-display text-4xl md:text-5xl mb-3">{stat}</div>
        <div className="font-mono text-xs tracking-[0.16em] uppercase text-signal mb-3">
          {label}
        </div>
        <p className="font-mono text-sm text-ink-dim leading-relaxed">{copy}</p>
      </div>
    </div>
  );
}
