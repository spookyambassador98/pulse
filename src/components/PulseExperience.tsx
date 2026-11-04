"use client";

import { useEffect, useState } from "react";
import { PulseDesktopShell } from "./PulseDesktopShell";
import { DownloadLanding } from "./DownloadLanding";
import { CompanyGate } from "./CompanyGate";
import { VisitTracker } from "./VisitTracker";
import { useIsPulseDesktop } from "@/lib/pulse/useNetworkPulses";
import { isGateOpen } from "@/lib/visitBeacon";

export function PulseExperience() {
  const isDesktop = useIsPulseDesktop();
  const [phase, setPhase] = useState<"wait" | "gate" | "app">("wait");

  useEffect(() => {
    if (isDesktop) {
      setPhase("app");
      return;
    }
    setPhase(isGateOpen() ? "app" : "gate");
  }, [isDesktop]);

  // First paint matches the server (blank wait). Branching on isDesktop
  // before mount hydrates the Electron window into an empty screen.
  if (phase === "wait") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-signal animate-pulse" aria-hidden="true" />
      </div>
    );
  }
  if (isDesktop) return <PulseDesktopShell />;
  if (phase === "gate") return <CompanyGate onUnlock={() => setPhase("app")} />;
  return (
    <>
      <VisitTracker />
      <DownloadLanding />
    </>
  );
}
