import { Link } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { EmptyState, ErrorState, LinkButton, LoadingScreen } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { IconPlus } from "../components/icons";
import type { GroupSummaryDTO } from "@shared/types";
import { formatWhen } from "../lib/format";

const STATUS: Record<
  string,
  { label: string; tone: string; edge: string }
> = {
  configuring: {
    label: "Setting up",
    tone: "bg-amber-400/15 text-amber-600",
    edge: "bg-amber-400",
  },
  swiping: {
    label: "Swiping",
    tone: "bg-brand-500/10 text-brand-600",
    edge: "bg-brand-500",
  },
  date_matching: {
    label: "Picking a date",
    tone: "bg-brand-500/10 text-brand-600",
    edge: "bg-brand-500",
  },
  planned: {
    label: "Planned",
    tone: "bg-lime-400/25 text-lime-700",
    edge: "bg-lime-400",
  },
  archived: {
    label: "Archived",
    tone: "bg-navy/10 text-navy-400",
    edge: "bg-navy-300",
  },
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
      <PageHeader
        title="Your groups"
        subtitle={
          groups.length
            ? `${groups.length} group${groups.length === 1 ? "" : "s"}`
            : undefined
        }
        action={
          <LinkButton to="/groups/new" className="px-4 py-2 text-sm">
            <IconPlus size={16} /> New group
          </LinkButton>
        }
      />

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
            const s = STATUS[g.status] ?? STATUS.configuring!;
            const pct =
              g.progress && g.progress.total > 1
                ? Math.round((g.progress.voted / g.progress.total) * 100)
                : null;
            return (
              <li key={g.id}>
                <Link
                  to={`/groups/${g.id}`}
                  className="card relative block overflow-hidden p-4 pl-5 transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-brand-300"
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-1 ${s.edge}`}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[17px] font-bold leading-tight tracking-[-0.01em]">
                      {g.name}
                    </h2>
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

                  {pct != null && (
                    <div className="mt-3.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-soft">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-navy-400">
                        {g.progress!.voted} of {g.progress!.total} voted on the
                        current card
                      </p>
                    </div>
                  )}

                  {g.status === "swiping" && pct == null && (
                    <p className="mt-2 text-xs font-semibold text-brand-600">
                      Ready to swipe →
                    </p>
                  )}

                  {g.upcomingPlan && (
                    <p className="mt-3.5 flex items-center gap-2 rounded-xl bg-lime-400/15 px-3 py-2 text-xs font-semibold text-lime-800">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" />
                      <span className="truncate">
                        {g.upcomingPlan.activity.title} ·{" "}
                        {formatWhen(g.upcomingPlan.startsAt)}
                      </span>
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 rounded-2xl border border-dashed border-paper-line px-4 py-4 text-center text-sm text-navy-400">
        Got an invite link? Just open it. They look like{" "}
        <code className="rounded bg-paper-soft px-1.5 py-0.5 font-semibold text-navy-500">
          vibin.be/join/ABC123
        </code>
      </p>
    </div>
  );
}
