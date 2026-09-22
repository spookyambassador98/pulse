"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { attachVisitTracker, sendVisit } from "@/lib/visitBeacon";

export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => attachVisitTracker(), []);

  useEffect(() => {
    sendVisit([
      {
        type: "page",
        path: pathname || "/",
        detail: document.title.slice(0, 80),
      },
    ]);
  }, [pathname]);

  return null;
}
