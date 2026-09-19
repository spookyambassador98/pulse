"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/motion/gsap";
import { usePrefersReducedMotion } from "@/lib/motion/usePrefersReducedMotion";
import { KineticHeadline } from "./KineticHeadline";
import { PulseTrace } from "./PulseTrace";

const SYMPTOMS = [
  { left: "14%", label: "CORS blocked", detail: "Preflight rejected — origin never got a foot in the door." },
  { left: "42%", label: "Session expired", detail: "Cookie stale. The next request restarts the whole handshake." },
  { left: "68%", label: "500 from origin", detail: "The server flatlines. Everything downstream stalls with it." },
];

// 03 DIAGNOSIS — a healthy trace dissolves into an arrhythmia as you scroll,
// with failure annotations surfacing exactly where the rhythm breaks.
export function DiagnosisSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;
    const section = sectionRef.current;
    const alert = alertRef.current;
    if (!section || !alert) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        alert,
        { clipPath: "inset(0 100% 0 0)" },
        {
          clipPath: "inset(0 0% 0 0)",
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top 70%",
            end: "bottom 40%",
            scrub: 0.6,
          },
        }
      );

      gsap.utils.toArray<HTMLElement>(".symptom-chip-desktop").forEach((chip, i) => {
        gsap.fromTo(
          chip,
          { opacity: 0, y: 14, scale: 0.9 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            ease: "pulse-out",
            scrollTrigger: {
              trigger: section,
              start: `top+=${i * 15}% 60%`,
              end: `top+=${i * 15 + 20}% 60%`,
              scrub: 0.6,
            },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>(".symptom-chip-mobile").forEach((chip) => {
        gsap.fromTo(
          chip,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            ease: "pulse-out",
            scrollTrigger: {
              trigger: chip,
              start: "top 88%",
            },
          }
        );
      });
    }, section);

    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <section ref={sectionRef} className="relative px-5 md:px-10 py-32 md:py-48">
      <div className="panel-index flex items-center gap-3 mb-10">
        <span>03</span>
        <span className="hairline flex-1" />
        <span>DIAGNOSIS</span>
      </div>

      <KineticHeadline
        as="h2"
        className="font-display font-medium leading-[1.05] tracking-tight text-[9vw] md:text-[5.5vw] max-w-4xl"
      >
        Healthy signal, until it isn&apos;t.
      </KineticHeadline>

      <div className="relative mt-16 md:mt-24 h-[36vh] md:h-[42vh]">
        <PulseTrace
          variant="healthy"
          seed={5}
          width={1600}
          height={300}
          color="var(--signal)"
          className="absolute inset-0 w-full h-full opacity-70"
        />
        <div ref={alertRef} className="absolute inset-0 w-full h-full">
          <PulseTrace
            variant="alert"
            seed={9}
            width={1600}
            height={300}
            color="var(--alert)"
            className="w-full h-full"
          />
        </div>

        {/* Desktop/tablet: chips float over the trace at the exact x where the
           rhythm breaks. Absolute positioning only makes sense once there's
           enough width for a 200px chip not to run off the viewport. */}
        {SYMPTOMS.map((s) => (
          <div
            key={s.label}
            className="symptom-chip-desktop hidden md:block absolute top-0 -translate-y-full pb-4"
            style={{ left: s.left }}
          >
            <SymptomCard {...s} />
          </div>
        ))}
      </div>

      {/* Mobile: same three annotations as a simple stacked list underneath
         the trace — no absolute math, no risk of horizontal overflow. */}
      <div className="md:hidden mt-8 flex flex-col gap-3">
        {SYMPTOMS.map((s) => (
          <div key={s.label} className="symptom-chip-mobile">
            <SymptomCard {...s} />
          </div>
        ))}
      </div>
    </section>
  );
}

function SymptomCard({ label, detail }: { left: string; label: string; detail: string }) {
  return (
    <div className="border border-alert/40 bg-bg-raised/90 backdrop-blur-sm rounded-xl px-4 py-3 max-w-[200px] md:max-w-[200px]">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-alert mb-1">{label}</div>
      <div className="font-mono text-[0.7rem] text-ink-dim leading-relaxed">{detail}</div>
    </div>
  );
}
