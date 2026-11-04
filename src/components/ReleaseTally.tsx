import { readOwnerDownloadStats } from "@/lib/pulse/ownerStats";

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

export async function ReleaseTally() {
  const stats = await readOwnerDownloadStats();
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
