import { Link } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { EmptyState, ErrorState, LinkButton, LoadingScreen } from "../components/ui";
import { IconPlus } from "../components/icons";
import type { GroupSummaryDTO } from "@shared/types";
import { formatWhen } from "../lib/format";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  configuring: { label: "Setting up", tone: "bg-amber-400/15 text-amber-600" },
  swiping: { label: "Swiping", tone: "bg-brand-500/10 text-brand-600" },
  date_matching: { label: "Picking a date", tone: "bg-brand-500/10 text-brand-600" },
  planned: { label: "Planned", tone: "bg-lime-400/25 text-lime-700" },
  archived: { label: "Archived", tone: "bg-navy/10 text-navy-400" },
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
        <h1 className="text-[22px] font-extrabold">Your groups</h1>
        <LinkButton to="/groups/new" className="px-4 py-2 text-sm">
          <IconPlus size={16} /> New group
        </LinkButton>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          emoji="👋"
          title="Nothing planned yet"
          message="Start a group, add your friends, and swipe on what to do together."
          action={<LinkButton to="/groups/new">Create your first group</LinkButton>}
        />
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => {
            const s = STATUS_LABEL[g.status] ?? STATUS_LABEL.configuring!;
            return (
              <li key={g.id}>
                <Link
                  to={`/groups/${g.id}`}
                  className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-pop"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[17px] font-bold leading-tight">{g.name}</h2>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-navy-400">
                    {g.activeMemberCount} member{g.activeMemberCount === 1 ? "" : "s"}
                    {g.matchCount > 0 &&
                      ` · ${g.matchCount} match${g.matchCount === 1 ? "" : "es"}`}
                  </p>

                  {g.progress && g.progress.total > 1 && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy/10">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{
                            width: `${Math.round((g.progress.voted / g.progress.total) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-navy-400">
                        {g.progress.voted} of {g.progress.total} voted on the
                        current card
                      </p>
                    </div>
                  )}

                  {g.status === "swiping" && (!g.progress || g.progress.total <= 1) && (
                    <p className="mt-2 text-xs font-medium text-brand-600">
                      Ready to swipe →
                    </p>
                  )}

                  {g.upcomingPlan && (
                    <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-lime-400/20 px-3 py-2 text-xs font-semibold text-lime-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-lime-600" />
                      {g.upcomingPlan.activity.title} ·{" "}
                      {formatWhen(g.upcomingPlan.startsAt)}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 rounded-2xl border border-dashed border-navy/15 p-4 text-center text-sm text-navy-400">
        Got an invite link? Just open it — it looks like{" "}
        <code className="rounded bg-navy/5 px-1">vibin.be/join/ABC123</code>
      </div>
    </div>
  );
}
