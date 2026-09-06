import { Link } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { EmptyState, ErrorState, LinkButton, LoadingScreen } from "../components/ui";
import type { GroupSummaryDTO } from "@shared/types";
import { formatWhen } from "../lib/format";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  configuring: { label: "Setting up", tone: "bg-tangerine-400/15 text-tangerine-600" },
  swiping: { label: "Swiping", tone: "bg-coral-400/15 text-coral-600" },
  date_matching: { label: "Picking a date", tone: "bg-grape-400/15 text-grape-600" },
  planned: { label: "Planned 🎉", tone: "bg-emerald-400/15 text-emerald-600" },
  archived: { label: "Archived", tone: "bg-ink/10 text-ink-muted" },
};

export function Dashboard() {
  const { data, loading, error, refetch } = usePoll<{ groups: GroupSummaryDTO[] }>(
    "/groups",
    8000,
  );

  if (loading && !data) return <LoadingScreen label="Loading your groups…" />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const groups = data?.groups ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Your groups</h1>
        <LinkButton to="/groups/new" className="px-4 py-2 text-sm">
          + New group
        </LinkButton>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          emoji="👋"
          title="No groups yet"
          message="Create one and share the invite link with your crew."
          action={<LinkButton to="/groups/new">Create a group</LinkButton>}
        />
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const s = STATUS_LABEL[g.status] ?? STATUS_LABEL.configuring!;
            return (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`} className="card block p-4 transition hover:shadow-pop">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold">{g.name}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    {g.activeMemberCount} member{g.activeMemberCount === 1 ? "" : "s"}
                    {g.matchCount > 0 && ` · ${g.matchCount} match${g.matchCount === 1 ? "" : "es"}`}
                    {!g.dateKnown && g.status === "swiping" && " · date TBD"}
                  </p>
                  {g.progress && (
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-mingo-gradient transition-all"
                          style={{
                            width: `${g.progress.total ? (g.progress.voted / g.progress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {g.progress.voted} / {g.progress.total} voted on the current card
                      </p>
                    </div>
                  )}
                  {g.upcomingPlan && (
                    <p className="mt-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-700">
                      Next: {g.upcomingPlan.activity.title} ·{" "}
                      {formatWhen(g.upcomingPlan.startsAt)}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 rounded-2xl border border-dashed border-ink/15 p-4 text-center text-sm text-ink-muted">
        Got an invite link? Just open it — it looks like{" "}
        <code className="rounded bg-ink/5 px-1">mingo.app/join/ABC123</code>
      </div>
    </div>
  );
}
