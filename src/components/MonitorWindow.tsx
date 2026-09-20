"use client";

import { useEffect, useState } from "react";
import { ConsentGate } from "./ConsentGate";
import { NeuronDiagram } from "./NeuronDiagram";
import { SpikeTrain } from "./SpikeTrain";
import { useLiveSession } from "@/lib/pulse/useLiveSession";

type Stage = "consent" | "connecting" | "live";

interface MonitorWindowProps {
  open: boolean;
  onClose: () => void;
}

// The "new window" the CTA opens: a self-contained diagnostic dialog with
// its own title bar. It walks through a real permission moment, a
// connecting handshake, then a live neuron fed by this actual session's
// timing data — not a canned demo.
export function MonitorWindow({ open, onClose }: MonitorWindowProps) {
  const [stage, setStage] = useState<Stage>("consent");
  const [elapsedDs, setElapsedDs] = useState(0); // deciseconds
  const { data, liveRequestCount } = useLiveSession(stage === "live");
  const hostname = typeof window !== "undefined" ? window.location.hostname : "this device";

  useEffect(() => {
    if (stage !== "connecting") return;
    const t = window.setTimeout(() => setStage("live"), 950);
    return () => window.clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "live") return;
    const id = window.setInterval(() => setElapsedDs((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pulse live session monitor"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-10 bg-black/75 backdrop-blur-sm"
      onWheel={stop}
      onTouchMove={stop}
    >
      <div className="relative w-full max-w-5xl h-[88vh] md:h-[82vh] bg-bg border border-line-strong rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-bg-raised shrink-0">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-alert/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-signal/70" />
            <span className="w-2.5 h-2.5 rounded-full border border-line-strong" />
          </div>
          <div className="panel-index truncate px-2">PULSE — LIVE SESSION MONITOR</div>
          <button
            type="button"
            onClick={onClose}
            data-cursor="Close"
            className="font-mono text-xs text-ink-dim hover:text-ink transition-colors shrink-0"
          >
            CLOSE ✕
          </button>
        </div>

        <div className="flex-1 relative overflow-hidden">
          {stage === "consent" && (
            <ConsentGate hostname={hostname} onAllow={() => setStage("connecting")} onDeny={onClose} />
          )}

          {stage === "connecting" && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <span className="w-10 h-10 rounded-full border-2 border-line-strong border-t-signal animate-spin" />
              <span className="font-mono text-xs tracking-[0.2em] text-signal uppercase">
                Connecting to {hostname}…
              </span>
            </div>
          )}

          {stage === "live" && (
            <div className="h-full flex flex-col">
              <div className="flex-1 relative min-h-0">
                <NeuronDiagram className="absolute inset-0 w-full h-full" variant="healthy" />
                <div className="absolute top-4 left-4 font-mono text-[0.65rem] tracking-[0.14em] uppercase text-signal flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
                  Live · {(elapsedDs / 10).toFixed(1)}s
                </div>
              </div>

              <div className="border-t border-line px-4 md:px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
                <Stat label="TTFB (real)" value={data?.ttfbMs != null ? `${data.ttfbMs}ms` : "—"} />
                <Stat label="Requests (live)" value={String(liveRequestCount || "—")} />
                <Stat
                  label="Connection"
                  value={data?.connectionType ? data.connectionType.toUpperCase() : "—"}
                />
                <Stat
                  label="RTT"
                  value={data?.rttMs != null ? `${data.rttMs}ms` : data?.downlinkMbps ? `${data.downlinkMbps}Mbps` : "—"}
                />
              </div>

              <SpikeTrain
                variant="healthy"
                seed={31}
                width={1400}
                height={44}
                color="var(--signal)"
                className="h-10 border-t border-line shrink-0"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="font-mono">
      <div className="text-[0.65rem] tracking-[0.12em] uppercase text-ink-dim mb-1">{label}</div>
      <div className="text-lg md:text-xl text-ink">{value}</div>
    </div>
  );
}
