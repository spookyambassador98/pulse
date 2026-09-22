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

  if (isDesktop) return <PulseDesktopShell />;
  if (phase === "wait") return <div className="min-h-screen bg-bg" />;
  if (phase === "gate") return <CompanyGate onUnlock={() => setPhase("app")} />;
  return (
    <>
      <VisitTracker />
      <DownloadLanding />
    </>
  );
}
