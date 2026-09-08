import { cc } from "../api";
import { RangePicker, useRange, useResource } from "../lib";
import {
  Badge,
  ErrorNote,
  Loading,
  Panel,
  PageTitle,
  StatTile,
  fmtNum,
  fmtPct,
} from "../ui";

interface Metric {
  value: number;
  delta: number | null;
}
interface Overview {
  range: { from: number; to: number; label: string };
  users: {
    total: number;
    newInRange: Metric;
    activeInRange: Metric;
  };
  groups: { total: number; active: number; newInRange: Metric };
  swipes: {
    total: number;
    likes: number;
    passes: number;
    superlikes: number;
    likeRate: number | null;
    delta: number | null;
  };
  matches: { activity: number; date: number; plans: number };
  activities: {
    active: number;
    needsReview: number;
    outdated: number;
    inactive: number;
  };
  system: { name: string; status: string; detail: string }[];
  attention: { level: "info" | "warn" | "crit"; text: string; href?: string }[];
}

const statusTone = (s: string) =>
  s === "operational"
    ? "green"
    : s === "degraded"
      ? "amber"
      : s === "down"
        ? "red"
        : "slate";

export function Dashboard() {
  const { query } = useRange();
  const { data, loading, error, reload } = useResource<Overview>(
    () => cc<Overview>(`/overview?${query}`),
    query,
  );

  return (
    <>
      <PageTitle title="Dashboard" right={<RangePicker />} />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <div className="space-y-4">
          {data.attention.length > 0 && (
            <Panel title="Needs attention" bodyClassName="divide-y divide-slate-100">
              {data.attention.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] first:pt-3 last:pb-3"
                >
                  <Badge
                    tone={
                      a.level === "crit"
                        ? "red"
                        : a.level === "warn"
                          ? "amber"
                          : "blue"
                    }
                  >
                    {a.level}
                  </Badge>
                  <span className="text-slate-700">{a.text}</span>
                  {a.href && (
                    <a
                      href={a.href}
                      className="ml-auto text-xs font-semibold text-brand-600"
                    >
                      View →
                    </a>
                  )}
                </div>
              ))}
            </Panel>
          )}

          <Section label="Users">
            <StatTile
              label="Total"
              value={fmtNum(data.users.total)}
              href="/admin/users"
            />
            <StatTile
              label={`New · ${data.range.label}`}
              value={fmtNum(data.users.newInRange.value)}
              delta={data.users.newInRange.delta}
            />
            <StatTile
              label={`Active · ${data.range.label}`}
              value={fmtNum(data.users.activeInRange.value)}
              delta={data.users.activeInRange.delta}
              hint="distinct users with any tracked event"
            />
          </Section>

          <Section label="Groups">
            <StatTile
              label="Total"
              value={fmtNum(data.groups.total)}
              href="/admin/groups"
            />
            <StatTile label="Active" value={fmtNum(data.groups.active)} />
            <StatTile
              label={`New · ${data.range.label}`}
              value={fmtNum(data.groups.newInRange.value)}
              delta={data.groups.newInRange.delta}
            />
          </Section>

          <Section label={`Swipes · ${data.range.label}`}>
            <StatTile
              label="Total"
              value={fmtNum(data.swipes.total)}
              delta={data.swipes.delta}
            />
            <StatTile label="Likes" value={fmtNum(data.swipes.likes)} />
            <StatTile label="Passes" value={fmtNum(data.swipes.passes)} />
            <StatTile
              label="Like rate"
              value={fmtPct(data.swipes.likeRate)}
              hint={`${fmtNum(data.swipes.superlikes)} superlikes`}
            />
          </Section>

          <Section label={`Matches · ${data.range.label}`}>
            <StatTile
              label="Activity matches"
              value={fmtNum(data.matches.activity)}
            />
            <StatTile label="Date matches" value={fmtNum(data.matches.date)} />
            <StatTile
              label="Plans"
              value={fmtNum(data.matches.plans)}
              href="/admin/groups?status=planned"
            />
          </Section>

          <Section label="Activity catalogue">
            <StatTile
              label="Active"
              value={fmtNum(data.activities.active)}
              href="/admin/activities"
            />
            <StatTile
              label="Needs review"
              value={fmtNum(data.activities.needsReview)}
              href="/admin/activities?status=needs_review"
            />
            <StatTile
              label="Outdated"
              value={fmtNum(data.activities.outdated)}
              href="/admin/activities?status=outdated"
            />
            <StatTile
              label="Inactive"
              value={fmtNum(data.activities.inactive)}
              href="/admin/activities?status=inactive"
            />
          </Section>

          <Panel title="System">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.system.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <span className="text-slate-700">{s.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{s.detail}</span>
                    <Badge tone={statusTone(s.status) as never}>{s.status}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </div>
  );
}
