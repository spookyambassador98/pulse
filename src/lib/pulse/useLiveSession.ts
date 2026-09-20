"use client";

import { useEffect, useState } from "react";
import { captureLiveSession, LiveSessionData } from "./liveSession";

interface LiveSessionState {
  data: LiveSessionData | null;
  /** Ticks up in real time as new network requests actually happen on the page. */
  liveRequestCount: number;
}

// Only starts reading browser signals once `active` flips true — that's the
// moment the visitor clicks "Allow" in the consent gate. From then on a
// PerformanceObserver keeps the request counter genuinely live: if the page
// fires another request while the monitor is open, the count moves in
// real time, in front of the visitor.
export function useLiveSession(active: boolean): LiveSessionState {
  const [data, setData] = useState<LiveSessionData | null>(null);
  const [liveRequestCount, setLiveRequestCount] = useState(0);

  useEffect(() => {
    if (!active) return;

    const snapshotTimer = window.setTimeout(() => {
      const snapshot = captureLiveSession();
      setData(snapshot);
      setLiveRequestCount(snapshot.requestCount);
    }, 300);

    let observer: PerformanceObserver | undefined;
    if (typeof PerformanceObserver !== "undefined") {
      try {
        observer = new PerformanceObserver((list) => {
          setLiveRequestCount((n) => n + list.getEntries().length);
        });
        observer.observe({ type: "resource", buffered: false });
      } catch {
        observer = undefined;
      }
    }

    return () => {
      window.clearTimeout(snapshotTimer);
      observer?.disconnect();
    };
  }, [active]);

  return { data, liveRequestCount };
}
