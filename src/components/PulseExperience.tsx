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
import { MonitorWindow } from "./MonitorWindow";

// Top-level client shell: owns the "is the preloader done" flag that gates
// the hero's entrance, the live-monitor dialog's open state, and wires the
// shared smooth-scroll context around every scrubbed ScrollTrigger scene.
export function PulseExperience() {
  const [ready, setReady] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [monitorKey, setMonitorKey] = useState(0);
  const onPreloaderComplete = useCallback(() => setReady(true), []);
  const openMonitor = useCallback(() => {
    // Bumping the key forces a fresh mount each time, so the dialog always
    // starts back at the consent screen instead of resuming a stale stage.
    setMonitorKey((k) => k + 1);
    setMonitorOpen(true);
  }, []);
  const closeMonitor = useCallback(() => setMonitorOpen(false), []);

  return (
    <SmoothScrollProvider>
      <Preloader onComplete={onPreloaderComplete} />
      <Cursor />
      <Nav />

      <div className="fixed inset-0 z-0 pointer-events-none mesh-grid opacity-[0.35]" />
      <ShaderField className="fixed inset-0 z-0 pointer-events-none opacity-60" />

      <main className="relative z-10 pb-14 md:pb-16">
        <Hero ready={ready} onOpenMonitor={openMonitor} />
        <TraceSection />
        <DiagnosisSection />
        <CompareSection />
        <Footer />
      </main>

      <ProgressStrip />
      <MonitorWindow key={monitorKey} open={monitorOpen} onClose={closeMonitor} />
    </SmoothScrollProvider>
  );
}
