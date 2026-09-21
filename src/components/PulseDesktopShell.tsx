"use client";

import { useCallback, useEffect, useState } from "react";
import { ConsentGate } from "./ConsentGate";
import { LiveNeuronNetwork } from "./LiveNeuronNetwork";
import { ShaderField } from "./ShaderField";
import { useLiveSession } from "@/lib/pulse/useLiveSession";

type Stage = "consent" | "connecting" | "live";

function desktopBridge() {
  if (typeof window === "undefined") return null;
  return (
    window as unknown as {
      pulseDesktop?: {
        setFullscreen?: (on: boolean) => Promise<{ fullscreen: boolean }>;
        getPrivilege?: () => Promise<{ elevated: boolean }>;
        requestElevation?: () => Promise<{ elevated: boolean; relaunching?: boolean; reason?: string }>;
        consumeWatchIntent?: () => Promise<boolean>;
      };
    }
  ).pulseDesktop;
}

export function PulseDesktopShell() {
  const [stage, setStage] = useState<Stage>("consent");
  const [elapsedDs, setElapsedDs] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [elevating, setElevating] = useState(false);
  const [elevationError, setElevationError] = useState<string | null>(null);
  const { data } = useLiveSession(stage === "live");

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    (async () => {
      const priv = await bridge.getPrivilege?.();
      setElevated(Boolean(priv?.elevated));
      const resume = await bridge.consumeWatchIntent?.();
      if (resume) setStage("connecting");
    })().catch(() => {});
  }, []);

  const startWatching = useCallback(async () => {
    const bridge = desktopBridge();
    setElevationError(null);
    if (bridge?.requestElevation && !elevated) {
      setElevating(true);
      try {
        const res = await bridge.requestElevation();
        if (res.relaunching) {
          setElevationError("Restarting with administrator…");
          return;
        }
        if (res.elevated) setElevated(true);
        if (res.reason === "declined") {
          setElevationError("Continuing without administrator — process paths stay limited.");
        }
      } catch {
        setElevationError("Could not ask Windows for administrator. Continuing limited.");
      }
      setElevating(false);
    }
    setStage("connecting");
  }, [elevated]);

  useEffect(() => {
    if (stage !== "connecting") return;
    const t = window.setTimeout(() => setStage("live"), 900);
    return () => window.clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "live") return;
    const id = window.setInterval(() => setElapsedDs((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [stage]);

  const setFullscreen = useCallback(async (on: boolean) => {
    setImmersive(on);
    const bridge = desktopBridge();
    if (bridge?.setFullscreen) {
      await bridge.setFullscreen(on);
      return;
    }
    try {
      if (on) await document.documentElement.requestFullscreen();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* browser may reject fullscreen without a user gesture; button click is fine */
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [setFullscreen]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      <div className="fixed inset-0 z-0 pointer-events-none mesh-grid opacity-[0.22]" />
      <ShaderField className="fixed inset-0 z-0 pointer-events-none opacity-40" />

      {!immersive && (
        <header className="relative z-10 shrink-0 border-b border-line bg-bg-raised/90 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-7 h-7 rounded-md border border-line-strong bg-bg flex items-center justify-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-signal" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-xs tracking-[0.14em] uppercase text-ink truncate">Pulse</div>
                <div className="font-mono text-[0.58rem] text-ink-dim tracking-[0.08em] uppercase truncate">
                  Network monitor · system-wide
                </div>
              </div>
            </div>

            {stage === "live" && (
              <div className="flex items-center gap-4 font-mono text-[0.62rem] uppercase tracking-[0.1em]">
                <span className="text-signal flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
                  Live · {(elapsedDs / 10).toFixed(1)}s
                </span>
                <span className={elevated ? "text-signal" : "text-ink-dim"}>
                  {elevated ? "Administrator" : "Limited"}
                </span>
                <span className="text-ink-dim hidden sm:inline">
                  TTFB {data?.ttfbMs != null ? `${data.ttfbMs}ms` : "—"}
                </span>
              </div>
            )}
          </div>
        </header>
      )}

      <main className="relative z-10 flex-1 min-h-0">
        {stage === "consent" && (
          <ConsentGate
            hostname="this device"
            desktop
            elevated={elevated}
            elevating={elevating}
            elevationError={elevationError}
            onAllow={startWatching}
            onDeny={() => window.close?.()}
          />
        )}

        {stage === "connecting" && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <span className="w-10 h-10 rounded-full border-2 border-line-strong border-t-signal animate-spin" />
            <span className="font-mono text-xs tracking-[0.2em] text-signal uppercase">
              Reading device connection table…
            </span>
          </div>
        )}

        {stage === "live" && (
          <LiveNeuronNetwork
            active
            immersive={immersive}
            onToggleImmersive={() => setFullscreen(!immersive)}
          />
        )}
      </main>

      {!immersive && (
        <footer className="relative z-10 shrink-0 border-t border-line px-4 py-1.5 font-mono text-[0.58rem] text-ink-dim uppercase tracking-[0.1em] flex justify-between">
          <span>Pulse v0.1.0</span>
          <span className="hidden sm:inline">Local only · nothing leaves this device</span>
        </footer>
      )}
    </div>
  );
}
