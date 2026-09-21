"use client";

import { PulseDesktopShell } from "./PulseDesktopShell";
import { DownloadLanding } from "./DownloadLanding";
import { useIsPulseDesktop } from "@/lib/pulse/useNetworkPulses";

export function PulseExperience() {
  const isDesktop = useIsPulseDesktop();
  if (isDesktop) {
    return <PulseDesktopShell />;
  }
  return <DownloadLanding />;
}
