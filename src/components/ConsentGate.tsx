"use client";

interface ConsentGateProps {
  hostname: string;
  onAllow: () => void;
  onDeny: () => void;
  desktop?: boolean;
}

// Dramatized as a permission prompt because that's exactly what it is: the
// visitor's click is the only thing that starts reading their session.
// In the browser, nothing here requests a real OS permission — Navigation/
// Resource Timing and Network Information are same-origin data the page
// already has. In the desktop shell it's more literal: the click is what
// starts the main process's real connection-table poll.
export function ConsentGate({ hostname, onAllow, onDeny, desktop }: ConsentGateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 md:px-10">
      <div className="relative w-16 h-16 mb-7">
        <span className="absolute inset-0 rounded-full border border-line-strong" />
        <span className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-signal animate-pulse" />
      </div>

      <div className="panel-index mb-4">{desktop ? "DESKTOP PERMISSION REQUEST" : "PERMISSION REQUEST"}</div>

      <h3 className="font-display text-2xl md:text-4xl leading-tight max-w-lg mb-4">
        {desktop ? (
          <>Allow Pulse to monitor <span className="text-signal">real network activity</span> on this device?</>
        ) : (
          <>
            Allow Pulse to monitor this session with <span className="text-signal">{hostname}</span>?
          </>
        )}
      </h3>

      <p className="font-mono text-xs md:text-sm text-ink-dim max-w-sm mb-9 leading-relaxed">
        {desktop ? (
          <>
            Pulse reads your OS&apos;s own connection table — every established connection on this
            machine, with the owning process. No packet-capture driver, no admin rights, nothing
            sent anywhere.
          </>
        ) : (
          <>
            Pulse reads your browser&apos;s own timing and connection signals for this tab — real
            numbers, nothing sent anywhere. The neuron you&apos;re about to see is this session,
            live.
          </>
        )}
      </p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onAllow}
          data-cursor="Allow ↗"
          className="rounded-full bg-signal text-bg px-7 py-3 font-mono text-xs tracking-[0.14em] uppercase hover:opacity-90 transition-opacity"
        >
          Allow &amp; watch ↗
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
