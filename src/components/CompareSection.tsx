"use client";

import { useRef, useState } from "react";
import { gsap } from "@/lib/motion/gsap";
import { SpikeTrain } from "./SpikeTrain";

type Mode = "demo" | "typical";

const DATA: Record<
  Mode,
  { ttfb: string; total: string; requests: string; rhythm: string; variant: "healthy" | "alert" }
> = {
  demo: { ttfb: "180ms", total: "640ms", requests: "12", rhythm: "FIRING STEADY", variant: "healthy" },
  typical: { ttfb: "890ms", total: "2.4s", requests: "47", rhythm: "MISFIRING", variant: "alert" },
};

// 04 COMPARE — a gooey tab switch (two blobs fused under an SVG blur filter,
// lead fast / tail elastic) flips the trace and stats between two sessions.
export function CompareSection() {
  const [mode, setMode] = useState<Mode>("demo");
  const leadRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const demoBtnRef = useRef<HTMLButtonElement>(null);
  const typicalBtnRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const moveIndicator = (next: Mode) => {
    const btn = next === "demo" ? demoBtnRef.current : typicalBtnRef.current;
    const group = groupRef.current;
    if (!btn || !group) return;
    const groupRect = group.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const x = btnRect.left - groupRect.left;

    gsap.to(leadRef.current, {
      x,
      width: btnRect.width,
      duration: 0.3,
      ease: "power3.out",
    });
    gsap.to(tailRef.current, {
      x,
      width: btnRect.width,
      duration: 0.6,
      ease: "pulse-elastic",
    });
    setMode(next);
  };

  const data = DATA[mode];

  return (
    <section className="relative px-5 md:px-10 py-32 md:py-48">
      <div className="panel-index flex items-center gap-3 mb-10">
        <span>04</span>
        <span className="hairline flex-1" />
        <span>COMPARE</span>
      </div>

      <div
        ref={groupRef}
        className="goo relative inline-flex border border-line rounded-full p-1 mb-14"
      >
        <div ref={tailRef} className="absolute top-1 bottom-1 left-1 rounded-full bg-signal" style={{ width: "50%" }} />
        <div ref={leadRef} className="absolute top-1 bottom-1 left-1 rounded-full bg-signal" style={{ width: "50%" }} />
        <button
          ref={demoBtnRef}
          type="button"
          data-cursor="Switch"
          onClick={() => moveIndicator("demo")}
          className={`relative z-10 px-6 py-2.5 font-mono text-xs tracking-[0.14em] uppercase transition-colors duration-300 ${
            mode === "demo" ? "text-bg" : "text-ink-dim"
          }`}
        >
          This demo
        </button>
        <button
          ref={typicalBtnRef}
          type="button"
          data-cursor="Switch"
          onClick={() => moveIndicator("typical")}
          className={`relative z-10 px-6 py-2.5 font-mono text-xs tracking-[0.14em] uppercase transition-colors duration-300 ${
            mode === "typical" ? "text-bg" : "text-ink-dim"
          }`}
        >
          Typical stack
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-10 md:gap-20 items-end">
        <div className="h-[26vh] md:h-[32vh] relative">
          <SpikeTrain
            key={mode}
            variant={data.variant}
            seed={mode === "demo" ? 3 : 9}
            width={1400}
            height={260}
            color={mode === "demo" ? "var(--signal)" : "var(--alert)"}
            className="w-full h-full"
          />
        </div>

        <div className="grid grid-cols-3 md:grid-cols-1 gap-6 md:gap-4 font-mono">
          <Stat label="TTFB" value={data.ttfb} />
          <Stat label="Total" value={data.total} />
          <Stat label="Requests" value={data.requests} />
        </div>
      </div>

      <div
        className="mt-8 panel-index"
        style={{ color: mode === "demo" ? "var(--signal)" : "var(--alert)" }}
      >
        SIGNAL: {data.rhythm}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs tracking-[0.14em] uppercase text-ink-dim mb-1">{label}</div>
      <div className="font-display text-2xl md:text-3xl">{value}</div>
    </div>
  );
}
