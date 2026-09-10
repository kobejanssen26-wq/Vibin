import { useState } from "react";
import { cc } from "../api";
import { useDebounced, useResource } from "../lib";
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
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
} from "../ui";
import {
  EVENT_KIND_META,
  EVENT_STATUSES,
  ACTIVITY_CATEGORIES,
} from "@shared/constants";

interface EventRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  verificationStatus: string;
  city: string | null;
  venueName: string | null;
  startsAt: number;
  source: string;
  url: string | null;
  priceType: string;
}
interface SourceRow {
  id: string;
  name: string;
  kind: string;
  enabled: number;
  trust: string;
  syncEveryMin: number;
  lastRunAt: number | null;
  lastResult: string | null;
  eventCount: number;
}
interface CoverageRow {
  name: string;
  activities: number;
  events: number;
  gap: string;
}
interface Coverage {
  radiusKm: number;
  places: number;
  critical: number;
  thin: number;
  rows: CoverageRow[];
}

const vTone: Record<string, string> = {
  verified: "green",
  needs_review: "amber",
  unverified: "slate",
  archived: "red",
};
const sTone: Record<string, string> = {
  upcoming: "blue",
  live: "green",
  completed: "slate",
  cancelled: "red",
  postponed: "amber",
  sold_out: "amber",
  unknown: "slate",
};

export function Events() {
  return (
    <div className="space-y-4">
      <PageTitle title="Live events" />
      <CoveragePanel />
      <SourcesPanel />
      <EventsPanel />
    </div>
  );
}

/* ----------------------------- coverage ----------------------------- */
function CoveragePanel() {
  const { data, loading, error, reload } = useResource<Coverage>(
    () => cc<Coverage>("/events-coverage?radiusKm=15&limit=12"),
    "coverage",
  );
  return (
    <Panel title="Geographic coverage (within 15 km)">
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="space-y-3">
          <div className="flex gap-6 text-sm">
            <span>
              <b className="text-red-600">{data.critical}</b> towns with{" "}
              <b>0</b> activities
            </span>
            <span>
              <b className="text-amber-600">{data.thin}</b> towns with{" "}
              <b>&lt;3</b>
            </span>
            <span className="text-slate-500">
              {data.places} localities scored
            </span>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Locality</Th>
                <Th>Activities ≤15 km</Th>
                <Th>Events ≤15 km</Th>
                <Th>Gap</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Tr key={r.name}>
                  <Td className="capitalize">{r.name}</Td>
                  <Td>{r.activities}</Td>
                  <Td>{r.events}</Td>
                  <Td>
                    <Badge
                      tone={
                        (r.gap === "critical"
                          ? "red"
                          : r.gap === "thin"
                            ? "amber"
                            : "green") as never
                      }
                    >
                      {r.gap}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------ sources ----------------------------- */
function SourcesPanel() {
  const { data, loading, error, reload } = useResource<{ sources: SourceRow[] }>(
    () => cc<{ sources: SourceRow[] }>("/event-sources"),
    "sources",
  );
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (s: SourceRow) => {
    setBusy(s.id);
    try {
      await cc(`/event-sources/${s.id}`, {
        method: "PATCH",
        body: { enabled: s.enabled !== 1 },
      });
      reload();
    } finally {
      setBusy(null);
    }
  };
  const run = async (s: SourceRow) => {
    setBusy(s.id);
    try {
      await cc(`/event-sources/${s.id}/run`, { method: "POST" });
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Ingestion sources">
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>Kind</Th>
              <Th>Events</Th>
              <Th>Last run</Th>
              <Th>Result</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.trust} · every {Math.round(s.syncEveryMin / 60)} h
                  </div>
                </Td>
                <Td>{s.kind}</Td>
                <Td>{s.eventCount}</Td>
                <Td className="text-xs text-slate-500">
                  {s.lastRunAt ? fmtDate(s.lastRunAt) : "—"}
                </Td>
                <Td className="max-w-[16rem] truncate text-xs text-slate-500">
                  {s.lastResult
                    ? (JSON.parse(s.lastResult).message ?? "—")
                    : "—"}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Btn
                      variant="ghost"
                      className="!py-1 !text-xs"
                      loading={busy === s.id}
                      onClick={() => toggle(s)}
                    >
                      {s.enabled === 1 ? "Disable" : "Enable"}
                    </Btn>
                    {s.kind !== "manual" && (
                      <Btn
                        variant="ghost"
                        className="!py-1 !text-xs"
                        loading={busy === s.id}
                        onClick={() => run(s)}
                      >
                        Run now
                      </Btn>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-2 text-xs text-slate-500">
        API-based feeds (sports, ticketing, council calendars) stay disabled
        until an operator adds credentials — see{" "}
        <code>src/worker/events/sources</code>. <code>.ics</code> / RSS feeds
        work with just a URL in the source config.
      </p>
    </Panel>
  );
}

/* ------------------------------- events ----------------------------- */
function EventsPanel() {
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 350);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [verification, setVerification] = useState("");
  const [adding, setAdding] = useState(false);

  const query = `q=${encodeURIComponent(q)}&kind=${kind}&status=${status}&verification=${verification}`;
  const { data, loading, error, reload } = useResource<{ events: EventRow[] }>(
    () => cc<{ events: EventRow[] }>(`/events?${query}`),
    query,
  );

  const [busy, setBusy] = useState<string | null>(null);
  const act = async (id: string, path: string, method = "POST") => {
    setBusy(id);
    try {
      await cc(`/events/${id}${path}`, { method });
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Events"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="title / venue…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="w-44"
          />
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {EVENT_KIND_META.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
          >
            <option value="">Any verification</option>
            <option value="verified">verified</option>
            <option value="needs_review">needs_review</option>
            <option value="unverified">unverified</option>
            <option value="archived">archived</option>
          </Select>
          <Btn variant="ghost" className="!py-1 !text-xs" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "+ Manual event"}
          </Btn>
        </div>
      }
    >
      {adding && <AddEventForm onDone={() => { setAdding(false); reload(); }} />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <Table>
          <thead>
            <tr>
              <Th>Event</Th>
              <Th>When</Th>
              <Th>Kind</Th>
              <Th>Status</Th>
              <Th>Verify</Th>
              <Th>Source</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-slate-400">
                  No events. Add one manually or enable a feed above.
                </Td>
              </tr>
            )}
            {data.events.map((e) => (
              <Tr key={e.id}>
                <Td>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-slate-500">
                    {[e.venueName, e.city].filter(Boolean).join(" · ") || "—"}
                  </div>
                </Td>
                <Td className="text-xs">{fmtDate(e.startsAt)}</Td>
                <Td>{e.kind}</Td>
                <Td>
                  <Badge tone={(sTone[e.status] ?? "slate") as never}>
                    {e.status}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={(vTone[e.verificationStatus] ?? "slate") as never}>
                    {e.verificationStatus}
                  </Badge>
                </Td>
                <Td className="text-xs text-slate-500">{e.source}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {e.verificationStatus !== "verified" && (
                      <Btn
                        variant="ghost"
                        className="!py-0.5 !text-xs"
                        loading={busy === e.id}
                        onClick={() => act(e.id, "/verify")}
                      >
                        ✓
                      </Btn>
                    )}
                    {e.verificationStatus !== "archived" ? (
                      <Btn
                        variant="ghost"
                        className="!py-0.5 !text-xs"
                        loading={busy === e.id}
                        onClick={() => act(e.id, "/archive")}
                      >
                        Archive
                      </Btn>
                    ) : (
                      <Btn
                        variant="ghost"
                        className="!py-0.5 !text-xs"
                        loading={busy === e.id}
                        onClick={() => act(e.id, "/unarchive")}
                      >
                        Restore
                      </Btn>
                    )}
                    <Btn
                      variant="ghost"
                      className="!py-0.5 !text-xs !text-red-600"
                      loading={busy === e.id}
                      onClick={() => act(e.id, "", "DELETE")}
                    >
                      Delete
                    </Btn>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

function AddEventForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({
    title: "",
    kind: "other",
    categoryId: "",
    city: "",
    venueName: "",
    startsAt: "",
    url: "",
    priceType: "unknown",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setErr(null);
    const startsAt = Math.floor(new Date(f.startsAt).getTime() / 1000);
    if (!f.title.trim() || !Number.isFinite(startsAt)) {
      setErr("Title and a valid start date/time are required.");
      return;
    }
    setSaving(true);
    try {
      await cc("/events", {
        method: "POST",
        body: {
          title: f.title.trim(),
          kind: f.kind,
          categoryId: f.categoryId || null,
          city: f.city.trim() || null,
          venueName: f.venueName.trim() || null,
          startsAt,
          url: f.url.trim() || null,
          priceType: f.priceType,
          verificationStatus: "verified",
        },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <Field label="Title">
        <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Starts at">
        <Input
          type="datetime-local"
          value={f.startsAt}
          onChange={(e) => set("startsAt", e.target.value)}
        />
      </Field>
      <Field label="Kind">
        <Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          {EVENT_KIND_META.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Category (optional)">
        <Select
          value={f.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
        >
          <option value="">—</option>
          {ACTIVITY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="City">
        <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
      </Field>
      <Field label="Venue">
        <Input
          value={f.venueName}
          onChange={(e) => set("venueName", e.target.value)}
        />
      </Field>
      <Field label="Event URL">
        <Input value={f.url} onChange={(e) => set("url", e.target.value)} />
      </Field>
      <Field label="Price">
        <Select
          value={f.priceType}
          onChange={(e) => set("priceType", e.target.value)}
        >
          <option value="unknown">unknown</option>
          <option value="free">free</option>
          <option value="paid">paid</option>
          <option value="varies">varies</option>
        </Select>
      </Field>
      <div className="col-span-2 flex items-center gap-3">
        <Btn loading={saving} onClick={submit}>
          Save event
        </Btn>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}
