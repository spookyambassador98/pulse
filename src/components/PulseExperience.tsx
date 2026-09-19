"use client";

import { useCallback, useState } from "react";
import { SmoothScrollProvider } from "@/lib/motion/smoothScroll";
import { Preloader } from "./Preloader";
import { Cursor } from "./Cursor";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { TraceSection } from "./TraceSection";
import { DiagnosisSection } from "./DiagnosisSection";
import { CompareSection } from "./CompareSection";
import { Footer } from "./Footer";
import { ProgressStrip } from "./ProgressStrip";
import { ShaderField } from "./ShaderField";

// Top-level client shell: owns the "is the preloader done" flag that gates
// the hero's entrance, and wires the shared smooth-scroll context around
// every scrubbed ScrollTrigger scene below it.
export function PulseExperience() {
  const [ready, setReady] = useState(false);
  const onPreloaderComplete = useCallback(() => setReady(true), []);

  return (
    <SmoothScrollProvider>
      <Preloader onComplete={onPreloaderComplete} />
      <Cursor />
      <Nav />

      <div className="fixed inset-0 z-0 pointer-events-none ecg-grid opacity-[0.35]" />
      <ShaderField className="fixed inset-0 z-0 pointer-events-none opacity-60" />

      <main className="relative z-10 pb-14 md:pb-16">
        <Hero ready={ready} />
        <TraceSection />
        <DiagnosisSection />
        <CompareSection />
        <Footer />
      </main>

      <ProgressStrip />
    </SmoothScrollProvider>
  );
}
