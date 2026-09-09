import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Loading,
  Panel,
  PageTitle,
  StatTile,
  fmtDate,
  fmtNum,
  fmtPct,
} from "../ui";

const STATUS_TONE: Record<string, string> = {
  verified: "green",
  needs_review: "amber",
  outdated: "red",
  inactive: "slate",
};
const statusTone = (s: string | undefined) => STATUS_TONE[s ?? ""] ?? "slate";

interface Detail {
  activity: Record<string, unknown>;
  metrics: {
    swipes: number;
    likes: number;
    passes: number;
    superlikes: number;
    views: number;
    matches: number;
    plans: number;
    bookingClicks: number;
    pooled: number;
    likeRate: number | null;
    matchRate: number | null;
    planConversion: number | null;
  };
  provider: Record<string, unknown> | null;
  matchedGroups: { id: string; name: string; status: string }[];
  quality: { score: number; checks: { k: string; ok: boolean }[] };
}

export function ActivityDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(
    () => cc<Detail>(`/activities/${id}`),
    id,
  );

  const a = data?.activity as Record<string, unknown> | undefined;
  const status = a?.status as string | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setActErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };
  const setStatus = (s: string) =>
    act(s, () => cc(`/activities/${id}`, { method: "PUT", body: { status: s } }));

  return (
    <>
      <PageTitle
        title={(a?.title as string) || "Activity"}
        crumbs={
          <Link to="/admin/activities" className="hover:underline">
            ← Activities
          </Link>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && a && (
        <div className="space-y-4">
          <Panel
            title="Review"
            subtitle="Confirm this against the operator before it counts as verified"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-slate-500">Current:</span>
              <Badge tone={(statusTone(status) ?? "slate") as never}>
                {status}
              </Badge>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <Btn
                variant="primary"
                loading={busy === "verify"}
                disabled={status === "verified"}
                onClick={() =>
                  act("verify", () =>
                    cc(`/activities/${id}/verify`, { method: "POST" }),
                  )
                }
              >
                Mark verified
              </Btn>
              <Btn
                variant="neutral"
                loading={busy === "needs_review"}
                disabled={status === "needs_review"}
                onClick={() => setStatus("needs_review")}
              >
                Needs review
              </Btn>
              <Btn
                variant="neutral"
                loading={busy === "outdated"}
                disabled={status === "outdated"}
                onClick={() => setStatus("outdated")}
              >
                Mark outdated
              </Btn>
              <Btn
                variant="danger"
                loading={busy === "archive"}
                onClick={() =>
                  act("archive", () =>
                    cc(`/activities/${id}`, { method: "DELETE" }),
                  )
                }
              >
                Archive
              </Btn>
            </div>
            {actErr && (
              <p className="mt-2 text-xs text-rose-600">{actErr}</p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              “Mark verified” also stamps the verification date. Archived
              activities leave the swipe deck immediately.
            </p>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <Panel title="Details">
              <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                <Row k="ID">
                  <code className="font-mono text-xs">{a.id as string}</code>
                </Row>
                <Row k="Status">
                  <Badge tone={statusTone(a.status as string) as never}>
                    {a.status as string}
                  </Badge>
                </Row>
                <Row k="Category">{a.category_id as string}</Row>
                <Row k="Subcategory">{(a.subcategory as string) || "—"}</Row>
                <Row k="Provider">
                  {data.provider ? (
                    <Link
                      to={`/admin/providers/${data.provider.id as string}`}
                      className="text-brand-600 hover:underline"
                    >
                      {(a.provider as string) || (data.provider.name as string)}
                    </Link>
                  ) : (
                    (a.provider as string) || "—"
                  )}
                </Row>
                <Row k="City">{(a.city as string) || "—"}</Row>
                <Row k="Address">{(a.address as string) || "—"}</Row>
                <Row k="Coordinates">
                  {a.lat != null && a.lng != null
                    ? `${((a.lat as number) / 1e6).toFixed(4)}, ${((a.lng as number) / 1e6).toFixed(4)}`
                    : "—"}
                </Row>
                <Row k="Price">
                  {a.price_type === "free"
                    ? "free"
                    : a.price_cents != null
                      ? `€${((a.price_cents as number) / 100).toFixed(2)} · ${a.price_type}`
                      : `— · ${a.price_type}`}
                </Row>
                <Row k="Duration">
                  {a.duration_min ? `${a.duration_min} min` : "—"}
                </Row>
                <Row k="Website">
                  <Ext href={a.website_url as string} />
                </Row>
                <Row k="Booking">
                  <Ext href={(a.booking_url || a.ticket_url) as string} />
                </Row>
                <Row k="Image">
                  <Ext href={a.image_url as string} />
                  {a.image_source ? ` (${a.image_source as string})` : ""}
                </Row>
                <Row k="Source">
                  <Ext href={a.source_url as string} />{" "}
                  {(a.source as string) || ""}
                </Row>
                <Row k="Last verified">
                  {a.last_verified_at ? fmtDate(a.last_verified_at as number) : "never"}
                </Row>
                <Row k="Created">{fmtDate(a.created_at as number)}</Row>
              </dl>
              <p className="mt-3 border-t border-slate-100 pt-3 text-[13px] text-slate-600">
                {(a.description as string) || "—"}
              </p>
            </Panel>

            <Panel title="Quality score" subtitle="Internal completeness — not shown to users">
              <div className="mb-3 text-3xl font-bold text-slate-900">
                {data.quality.score}
                <span className="text-base font-normal text-slate-400">/100</span>
              </div>
              <ul className="space-y-1 text-[13px]">
                {data.quality.checks.map((ch) => (
                  <li key={ch.k} className="flex items-center gap-2">
                    <span className={ch.ok ? "text-emerald-600" : "text-slate-300"}>
                      {ch.ok ? "✓" : "○"}
                    </span>
                    <span className={ch.ok ? "text-slate-700" : "text-slate-400"}>
                      {ch.k}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="User interest (all time)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Impressions (pooled)" value={fmtNum(data.metrics.pooled)} />
              <StatTile label="Views" value={fmtNum(data.metrics.views)} />
              <StatTile label="Likes" value={fmtNum(data.metrics.likes + data.metrics.superlikes)} />
              <StatTile label="Passes" value={fmtNum(data.metrics.passes)} />
              <StatTile label="Like rate" value={fmtPct(data.metrics.likeRate)} />
              <StatTile label="Matches" value={fmtNum(data.metrics.matches)} />
              <StatTile label="Match rate" value={fmtPct(data.metrics.matchRate)} hint="of groups that saw it" />
              <StatTile label="Plans" value={fmtNum(data.metrics.plans)} />
              <StatTile label="Plan conversion" value={fmtPct(data.metrics.planConversion)} hint="plans ÷ matches" />
              <StatTile label="Booking clicks" value={fmtNum(data.metrics.bookingClicks)} />
            </div>
          </Panel>

          {data.matchedGroups.length > 0 && (
            <Panel title="Recently matched by">
              <div className="flex flex-wrap gap-2">
                {data.matchedGroups.map((g) => (
                  <Link
                    key={g.id}
                    to={`/admin/groups/${g.id}`}
                    className="rounded border border-slate-200 px-2 py-1 text-[13px] text-brand-600 hover:bg-slate-50"
                  >
                    {g.name} · {g.status}
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-800">{children}</dd>
    </div>
  );
}
function Ext({ href }: { href?: string }) {
  if (!href) return <span className="text-slate-400">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all text-brand-600 hover:underline"
    >
      {href.replace(/^https?:\/\//, "").slice(0, 40)}
    </a>
  );
}
