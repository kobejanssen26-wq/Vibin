import { Link } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { EmptyState, ErrorState, LinkButton, LoadingScreen } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { JoinGroupBox } from "../components/JoinGroupBox";
import { Reveal } from "../components/Reveal";
import { IconPlus } from "../components/icons";
import type { GroupSummaryDTO } from "@shared/types";
import { formatWhen } from "../lib/format";
import { useLang } from "../lib/i18n";

const STATUS_TONE: Record<string, { tone: string; edge: string }> = {
  configuring: { tone: "bg-amber-400/15 text-amber-600", edge: "bg-amber-400" },
  swiping: { tone: "bg-brand-500/10 text-brand-600", edge: "bg-brand-500" },
  date_matching: { tone: "bg-brand-500/10 text-brand-600", edge: "bg-brand-500" },
  planned: { tone: "bg-lime-400/25 text-lime-700", edge: "bg-lime-400" },
  archived: { tone: "bg-navy/10 text-navy-400", edge: "bg-navy-300" },
};

export function Dashboard() {
  const { t } = useLang();
  const { data, loading, error, refetch } = usePoll<{ groups: GroupSummaryDTO[] }>(
    "/groups",
    8000,
  );

  if (loading && !data) return <LoadingScreen label={t("dashboard.loading")} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  const groups = data?.groups ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t("dashboard.title")}
        subtitle={
          groups.length
            ? t(groups.length === 1 ? "dashboard.groupsOne" : "dashboard.groupsOther", { n: groups.length })
            : undefined
        }
        action={
          <LinkButton to="/groups/new" className="px-4 py-2 text-sm">
            <IconPlus size={16} /> {t("dashboard.newGroup")}
          </LinkButton>
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          emoji="👋"
          title={t("dashboard.emptyTitle")}
          message={t("dashboard.emptyMessage")}
          action={<LinkButton to="/groups/new">{t("dashboard.createFirst")}</LinkButton>}
        />
      ) : (
        <ul className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0 lg:grid-cols-3">
          {groups.map((g, i) => {
            const s = STATUS_TONE[g.status] ?? STATUS_TONE.configuring!;
            const statusLabel = t(`dashboard.status.${g.status}` as never);
            const pct =
              g.progress && g.progress.total > 1
                ? Math.round((g.progress.voted / g.progress.total) * 100)
                : null;
            return (
              <Reveal as="li" key={g.id} delay={Math.min(i, 6) * 60}>
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
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-navy-400">
                    {t(g.activeMemberCount === 1 ? "dashboard.memberOne" : "dashboard.memberOther", { n: g.activeMemberCount })}
                    {g.matchCount > 0 &&
                      t(g.matchCount === 1 ? "dashboard.matchOne" : "dashboard.matchOther", { n: g.matchCount })}
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
                        {t("dashboard.votedOfTotal", { voted: g.progress!.voted, total: g.progress!.total })}
                      </p>
                    </div>
                  )}

                  {g.status === "swiping" && pct == null && (
                    <p className="mt-2 text-xs font-semibold text-brand-600">
                      {t("dashboard.readyToSwipe")}
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
              </Reveal>
            );
          })}
        </ul>
      )}

      <div className="mt-8">
        <JoinGroupBox />
      </div>
    </div>
  );
}
