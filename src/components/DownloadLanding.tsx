import { PULSE_GITHUB, PULSE_NPCAP, PULSE_SETUP_NAME, PULSE_SHA256, PULSE_VERSION } from "@/lib/pulse/download";

const TRACES = [
  "M 96 240 C 220 240 260 88 420 92 S 560 140 640 128",
  "M 96 240 C 210 240 250 168 400 176 S 540 200 640 208",
  "M 96 240 C 240 240 280 240 400 240 S 520 240 640 240",
  "M 96 240 C 210 240 250 312 400 304 S 540 280 640 272",
  "M 96 240 C 220 240 260 392 420 388 S 560 340 640 352",
];

const PADS = [
  { x: 640, y: 128, label: "PTR" },
  { x: 640, y: 208, label: "LAN" },
  { x: 640, y: 240, label: "TLS" },
  { x: 640, y: 272, label: "CDN" },
  { x: 640, y: 352, label: "ASN" },
];

function EtchedBoard() {
  return (
    <svg className="release-board" viewBox="0 0 720 480" role="img" aria-label="Etched traces from this machine to the network">
      <rect className="release-board-plate" x="16" y="16" width="688" height="448" rx="2" />
      <path className="release-board-score" d="M 16 56 H 704" />
      <text className="release-board-mark" x="36" y="44">
        DEVICE SIDE
      </text>
      <text className="release-board-mark" x="684" y="44" textAnchor="end">
        NETWORK SIDE
      </text>

      {TRACES.map((d) => (
        <path key={d} className="release-trace" d={d} />
      ))}

      <g className="release-soma">
        <rect x="48" y="196" width="88" height="88" rx="2" />
        <rect x="62" y="210" width="60" height="60" rx="1" />
        <text x="92" y="304" textAnchor="middle">
          YOU
        </text>
      </g>

      {PADS.map((pad) => (
        <g key={pad.label} className="release-pad" transform={`translate(${pad.x} ${pad.y})`}>
          <rect x="-14" y="-14" width="28" height="28" rx="1" />
          <text x="22" y="4">
            {pad.label}
          </text>
        </g>
      ))}

      {TRACES.map((d, i) => (
        <rect
          key={`pkt-${i}`}
          className="release-pkt"
          width="7"
          height="3"
          rx="0.4"
          style={{
            offsetPath: `path('${d}')`,
            animationDelay: `${i * 0.42}s`,
          }}
        />
      ))}
    </svg>
  );
}

export function DownloadLanding() {
  return (
    <div className="release-root">
      <header className="release-top">
        <span className="release-brand">Pulse</span>
        <span className="release-top-meta">Windows · {PULSE_VERSION} · free</span>
      </header>

      <main>
        <section className="release-hero">
          <div className="release-copy">
            <p className="release-kicker">Instrument, not a dashboard</p>
            <h1 className="release-title">Pulse</h1>
            <p className="release-lead">
              Your machine, drawn as a nervous system. Real TCP. Destinations as
              somata. Click a node and you can cut it at the OS — not a grey
              toggle in a UI.
            </p>
            <a className="release-plate" href="/download">
              <span className="release-plate-kicker">Windows 10 / 11</span>
              <span className="release-plate-name">Get the installer</span>
              <span className="release-plate-file">{PULSE_SETUP_NAME}</span>
            </a>
            <p className="release-fine">
              Free. ~236 MB. No account. Npcap for live impulses. Administrator
              only if you want process paths and the cut switch.
            </p>
            <p className="release-hash">SHA-256 {PULSE_SHA256}</p>
          </div>
          <EtchedBoard />
        </section>

        <section className="release-facts" aria-label="What you get">
          <article>
            <h2>Wire</h2>
            <p>
              Packets come off Npcap. The connection table comes from Windows.
              Names from reverse DNS and well-known ranges. The browser cannot
              see this. That is why it is an app.
            </p>
          </article>
          <article>
            <h2>Cut</h2>
            <p>
              Off is a firewall rule, a blackhole route, and a TCP reset — then
              a loop that keeps the socket dead. If the switch is On, traffic
              is still talking. If it is Off, the OS is holding it.
            </p>
          </article>
          <article>
            <h2>Stay</h2>
            <p>
              Leave the window, come back. The map does not pile up a backlog
              of impulses and lock. The instrument keeps the last live state
              and continues.
            </p>
          </article>
        </section>

        <section className="release-windows">
          <h2>Windows will ask. That is expected.</h2>
          <ol>
            <li>
              <strong>SmartScreen.</strong> The installer is not code-signed.
              You will likely see “Windows protected your PC”. Open More info,
              then Run anyway. That is an unknown-publisher warning, not a
              malware verdict. Reputation builds after real downloads.
            </li>
            <li>
              <strong>Npcap.</strong> Without it, the map can list connections
              and stay quiet on impulses. Install Npcap, then Start watching.{" "}
              <a href={PULSE_NPCAP}>npcap.com</a>
            </li>
            <li>
              <strong>Administrator.</strong> Start watching can prompt UAC so
              Pulse can read process paths and cut a destination. Decline and
              the map still runs, limited. Pulse does not install a driver.
            </li>
            <li>
              <strong>Antivirus.</strong> Some suites flag packet capture and
              firewall edits. The source is on GitHub. Pulse does not hide a
              window or send your traffic off-machine.
            </li>
          </ol>
        </section>
      </main>

      <footer className="release-foot">
        <a href={PULSE_GITHUB}>Source on GitHub</a>
        <span>© {new Date().getFullYear()} Pulse</span>
      </footer>
    </div>
  );
}
