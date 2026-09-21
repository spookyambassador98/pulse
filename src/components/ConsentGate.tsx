"use client";

interface ConsentGateProps {
  hostname: string;
  onAllow: () => void;
  onDeny: () => void;
  desktop?: boolean;
  elevated?: boolean;
  elevating?: boolean;
  elevationError?: string | null;
}

export function ConsentGate({
  hostname,
  onAllow,
  onDeny,
  desktop,
  elevated,
  elevating,
  elevationError,
}: ConsentGateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 md:px-10">
      <div className="relative w-16 h-16 mb-7">
        <span className="absolute inset-0 rounded-full border border-line-strong" />
        <span className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-signal animate-pulse" />
      </div>

      <div className="panel-index mb-4">{desktop ? "DESKTOP PERMISSION REQUEST" : "PERMISSION REQUEST"}</div>

      <h3 className="font-display text-2xl md:text-4xl leading-tight max-w-lg mb-4">
        {desktop ? (
          <>
            Allow Pulse to monitor <span className="text-signal">real network activity</span> on this device?
          </>
        ) : (
          <>
            Allow Pulse to monitor this session with <span className="text-signal">{hostname}</span>?
          </>
        )}
      </h3>

      <p className="font-mono text-xs md:text-sm text-ink-dim max-w-md mb-9 leading-relaxed">
        {desktop ? (
          elevated ? (
            <>
              Administrator is already on. Process names, exe paths, and the ability to cut a
              connection will be visible. Nothing leaves this device.
            </>
          ) : (
            <>
              Start watching asks Windows for administrator rights. That is how Pulse sees every
              process, the path on disk, and can actually drop a socket — not just draw it. Local
              only.
            </>
          )
        ) : (
          <>
            Pulse reads your browser&apos;s own timing and connection signals for this tab — real
            numbers, nothing sent anywhere. The neuron you&apos;re about to see is this session,
            live.
          </>
        )}
      </p>

      {elevationError && (
        <p className="font-mono text-[0.7rem] text-alert max-w-sm mb-6">{elevationError}</p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onAllow}
          disabled={elevating}
          data-cursor="Watch"
          className="rounded-full bg-signal text-bg px-7 py-3 font-mono text-xs tracking-[0.14em] uppercase hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {elevating ? "Asking Windows…" : desktop ? "Start watching ↗" : "Allow & watch ↗"}
        </button>
        <button
          type="button"
          onClick={onDeny}
          data-cursor="Close"
          className="font-mono text-xs tracking-[0.14em] uppercase text-ink-dim hover:text-ink transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
