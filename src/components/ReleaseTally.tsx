"use client";

import { useEffect, useState } from "react";

type Tally = {
  total: number;
  current: number;
  site: number | null;
};

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

export function ReleaseTally() {
  const [stats, setStats] = useState<Tally | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/release-tally", { cache: "no-store", signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== "object") return;
        const row = data as Record<string, unknown>;
        if (typeof row.total !== "number") return;
        setStats({
          total: row.total,
          current: typeof row.current === "number" ? row.current : 0,
          site: typeof row.site === "number" ? row.site : null,
        });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (!stats) return null;

  return (
    <aside className="release-tally" aria-label="Installer pulls">
      <span className="release-tally-kicker">Installer pulls</span>
      <span className="release-tally-count">{formatCount(stats.total)}</span>
      <span className="release-tally-meta">
        GitHub assets · this build {formatCount(stats.current)}
        {stats.site != null ? ` · site ${formatCount(stats.site)}` : ""}
      </span>
    </aside>
  );
}
