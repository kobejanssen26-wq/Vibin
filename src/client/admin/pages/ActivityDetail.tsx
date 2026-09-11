import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Field,
  Input,
  Loading,
  Panel,
  PageTitle,
  Select,
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
    websiteClicks: number;
    outboundClicks: number;
    expanded: number;
    shares: number;
    calendarAdds: number;
    pooled: number;
    likeRate: number | null;
    matchRate: number | null;
    planConversion: number | null;
    viewToClickRate: number | null;
    likeToClickRate: number | null;
    matchToClickRate: number | null;
  };
  provider: Record<string, unknown> | null;
  matchedGroups: { id: string; name: string; status: string }[];
  quality: { score: number; checks: { k: string; ok: boolean }[] };
}

const MONETIZATION_LABEL: Record<string, string> = {
  none: "None",
  outbound_tracking: "Outbound tracking only (no deal)",
  affiliate: "Affiliate",
  direct_partner: "Direct partner",
  booking_partner: "Booking partner",
};
const MONETIZATION_TONE: Record<string, string> = {
  none: "slate",
  outbound_tracking: "blue",
  affiliate: "green",
  direct_partner: "green",
  booking_partner: "green",
};

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
              <StatTile label="Expanded" value={fmtNum(data.metrics.expanded)} hint="tapped for more info" />
              <StatTile label="Shares" value={fmtNum(data.metrics.shares)} />
              <StatTile label="Calendar adds" value={fmtNum(data.metrics.calendarAdds)} />
            </div>
          </Panel>

          <Panel
            title="Outbound clicks"
            subtitle="A click means VIBIN sent someone to the destination — never proof of a booking or sale (§15/§44)"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatTile label="Website clicks" value={fmtNum(data.metrics.websiteClicks)} />
              <StatTile label="Booking/ticket clicks" value={fmtNum(data.metrics.bookingClicks)} />
              <StatTile label="Total outbound clicks" value={fmtNum(data.metrics.outboundClicks)} />
              <StatTile label="View → click" value={fmtPct(data.metrics.viewToClickRate)} />
              <StatTile label="Like → click" value={fmtPct(data.metrics.likeToClickRate)} />
              <StatTile label="Match → click" value={fmtPct(data.metrics.matchToClickRate)} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Confirmed bookings, revenue and commission are only shown once a
              real affiliate/partner integration reports them back — VIBIN
              never estimates them from clicks alone.
            </p>
          </Panel>

          <MonetizationPanel id={id} activity={a} onSaved={reload} />

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

/**
 * Monetization (§4/§17/§46) — what VIBIN can honestly say about this outbound
 * link, edited only when a real, contractually-agreed deal exists. Nothing
 * here is ever set automatically from a guess; every field defaults to
 * "none" and stays that way until an owner enters an actual agreement.
 */
function MonetizationPanel({
  id,
  activity: a,
  onSaved,
}: {
  id: string;
  activity: Record<string, unknown>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    monetizationType: (a.monetization_type as string) || "none",
    affiliateUrl: (a.affiliate_url as string) || "",
    affiliateNetwork: (a.affiliate_network as string) || "",
    affiliatePartnerId: (a.affiliate_partner_id as string) || "",
    commissionType: (a.commission_type as string) || "none",
    commissionRate: a.commission_rate != null ? String(a.commission_rate) : "",
    commissionCurrency: (a.commission_currency as string) || "",
    commissionStatus: (a.commission_status as string) || "none",
  }));
  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await cc(`/activities/${id}`, {
        method: "PUT",
        body: {
          monetizationType: form.monetizationType,
          affiliateUrl: form.affiliateUrl.trim() || null,
          affiliateNetwork: form.affiliateNetwork.trim() || null,
          affiliatePartnerId: form.affiliatePartnerId.trim() || null,
          commissionType: form.commissionType,
          commissionRate: form.commissionRate.trim() ? Number(form.commissionRate) : null,
          commissionCurrency: form.commissionCurrency.trim() || null,
          commissionStatus: form.commissionStatus,
        },
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const type = (a.monetization_type as string) || "none";

  return (
    <Panel
      title="Monetization"
      right={
        <Btn variant="ghost" className="!py-1 !text-xs" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </Btn>
      }
    >
      {!editing ? (
        <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          <Row k="Type">
            <Badge tone={(MONETIZATION_TONE[type] ?? "slate") as never}>
              {MONETIZATION_LABEL[type] ?? type}
            </Badge>
          </Row>
          <Row k="Commission">
            {(a.commission_type as string) === "none" || !a.commission_type
              ? "None"
              : `${a.commission_rate ?? "—"}${a.commission_type === "percentage" ? "%" : ` ${a.commission_currency ?? ""}`} (${a.commission_status})`}
          </Row>
          <Row k="Affiliate URL">
            <Ext href={a.affiliate_url as string} />
          </Row>
          <Row k="Affiliate network">{(a.affiliate_network as string) || "—"}</Row>
        </dl>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monetization type">
            <Select
              value={form.monetizationType}
              onChange={(e) => set("monetizationType", e.target.value)}
            >
              {Object.entries(MONETIZATION_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Commission type">
            <Select
              value={form.commissionType}
              onChange={(e) => set("commissionType", e.target.value)}
            >
              <option value="none">None</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </Select>
          </Field>
          <Field
            label="Commission rate"
            hint={form.commissionType === "percentage" ? "e.g. 8 for 8%" : "amount per booking"}
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.commissionRate}
              onChange={(e) => set("commissionRate", e.target.value)}
              disabled={form.commissionType === "none"}
            />
          </Field>
          <Field label="Commission currency">
            <Input
              maxLength={3}
              placeholder="EUR"
              value={form.commissionCurrency}
              onChange={(e) => set("commissionCurrency", e.target.value.toUpperCase())}
              disabled={form.commissionType !== "fixed"}
            />
          </Field>
          <Field label="Commission status">
            <Select
              value={form.commissionStatus}
              onChange={(e) => set("commissionStatus", e.target.value)}
            >
              <option value="none">None</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </Select>
          </Field>
          <Field label="Affiliate network">
            <Input
              value={form.affiliateNetwork}
              onChange={(e) => set("affiliateNetwork", e.target.value)}
            />
          </Field>
          <Field label="Affiliate partner ID">
            <Input
              value={form.affiliatePartnerId}
              onChange={(e) => set("affiliatePartnerId", e.target.value)}
            />
          </Field>
          <Field label="Affiliate URL" hint="the partner's actual tracking link">
            <Input
              value={form.affiliateUrl}
              onChange={(e) => set("affiliateUrl", e.target.value)}
            />
          </Field>
          <div className="col-span-2 flex items-center gap-3">
            <Btn loading={saving} onClick={save}>
              Save
            </Btn>
            {err && <span className="text-xs text-rose-600">{err}</span>}
          </div>
        </div>
      )}
    </Panel>
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
