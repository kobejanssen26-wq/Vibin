import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cc } from "../api";
import { useDebounced, useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Input,
  Loading,
  Pager,
  Panel,
  PageTitle,
  Select,
  StatTile,
  Table,
  Td,
  Th,
  Tr,
  fmtDay,
  fmtNum,
  fmtPct,
} from "../ui";

interface Quality {
  total: number;
  withWebsite: number;
  withBookingOrTicket: number;
  withImage: number;
  withSpecificImage: number;
  withGenericImage: number;
  missingImage: number;
  distinctImages: number;
  withCoords: number;
  withAddress: number;
  withPrice: number;
  withOpeningHours: number;
  withSource: number;
  verifiedRecently: number;
  byStatus: { verified: number; needs_review: number; outdated: number; inactive: number };
  mostReusedImages: { imageUrl: string; n: number }[];
}

interface ImageRow {
  id: string;
  title: string;
  category: string;
  city: string | null;
  imageUrl: string | null;
  imageIsGeneric: number;
  status: string;
  updatedAt: number;
  sharedByCount: number;
}
interface ImageResp {
  rows: ImageRow[];
  total: number;
  page: number;
  pageCount: number;
}

function imageStatus(r: ImageRow): { label: string; tone: "green" | "amber" | "slate" } {
  if (!r.imageUrl) return { label: "— Missing", tone: "slate" };
  if (r.imageIsGeneric) return { label: "⚠ Generic fallback", tone: "amber" };
  return { label: "✓ Specific", tone: "green" };
}

export function DataQuality() {
  const { data: q, loading, error, reload } = useResource<Quality>(
    () => cc<Quality>("/data-quality"),
    "data-quality",
  );

  const [sp, setSp] = useSearchParams();
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const search = useDebounced(qInput, 350);
  const filter = sp.get("filter") ?? "";
  const page = Number(sp.get("page")) || 1;

  const setParam = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        v ? n.set(k, v) : n.delete(k);
        if (k !== "page") n.delete("page");
        return n;
      },
      { replace: true },
    );

  /* --------------------------- street view backfill --------------------------- */
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillErr, setBackfillErr] = useState<string | null>(null);
  const [backfillTotals, setBackfillTotals] = useState({ checked: 0, found: 0, noCoverage: 0 });

  const runBackfill = async () => {
    setBackfillRunning(true);
    setBackfillErr(null);
    setBackfillTotals({ checked: 0, found: 0, noCoverage: 0 });
    try {
      let done = false;
      while (!done) {
        const r = await cc<{ checked: number; found: number; noCoverage: number; done: boolean }>(
          "/images/backfill-streetview",
          { method: "POST", body: { limit: 50 } },
        );
        setBackfillTotals((t) => ({
          checked: t.checked + r.checked,
          found: t.found + r.found,
          noCoverage: t.noCoverage + r.noCoverage,
        }));
        done = r.done;
        if (r.checked === 0) done = true;
      }
      reload();
    } catch (e) {
      setBackfillErr(e instanceof Error ? e.message : "Backfill failed.");
    } finally {
      setBackfillRunning(false);
    }
  };

  const imgQuery = `q=${encodeURIComponent(search)}&filter=${filter}&page=${page}&pageSize=30`;
  const { data: imgData, loading: imgLoading, error: imgError, reload: imgReload } =
    useResource<ImageResp>(() => cc<ImageResp>(`/images/quality?${imgQuery}`), imgQuery);

  if (loading && !q) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!q) return null;

  const pct = (n: number) => (q.total ? n / q.total : null);

  return (
    <>
      <PageTitle title="Data quality" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total activities" value={fmtNum(q.total)} />
        <StatTile label="Verified" value={fmtNum(q.byStatus.verified)} hint={fmtPct(pct(q.byStatus.verified))} />
        <StatTile label="Needs review" value={fmtNum(q.byStatus.needs_review)} hint={fmtPct(pct(q.byStatus.needs_review))} />
        <StatTile label="Verified in last 180d" value={fmtNum(q.verifiedRecently)} hint={fmtPct(pct(q.verifiedRecently))} />
        <StatTile label="Outdated / inactive" value={fmtNum(q.byStatus.outdated + q.byStatus.inactive)} />

        <StatTile label="With website" value={fmtNum(q.withWebsite)} hint={fmtPct(pct(q.withWebsite))} />
        <StatTile label="With booking/ticket link" value={fmtNum(q.withBookingOrTicket)} hint={fmtPct(pct(q.withBookingOrTicket))} />
        <StatTile label="With coordinates" value={fmtNum(q.withCoords)} hint={fmtPct(pct(q.withCoords))} />
        <StatTile label="With address" value={fmtNum(q.withAddress)} hint={fmtPct(pct(q.withAddress))} />
        <StatTile label="With price set" value={fmtNum(q.withPrice)} hint={fmtPct(pct(q.withPrice))} />

        <StatTile label="With opening hours" value={fmtNum(q.withOpeningHours)} hint={fmtPct(pct(q.withOpeningHours))} />
        <StatTile label="With source URL" value={fmtNum(q.withSource)} hint={fmtPct(pct(q.withSource))} />
        <StatTile
          label="Specific image"
          value={fmtNum(q.withSpecificImage)}
          hint={fmtPct(pct(q.withSpecificImage))}
          onClick={() => setParam("filter", "specific")}
        />
        <StatTile
          label="Generic fallback image"
          value={fmtNum(q.withGenericImage)}
          hint={fmtPct(pct(q.withGenericImage))}
          onClick={() => setParam("filter", "generic")}
        />
        <StatTile
          label="Missing image"
          value={fmtNum(q.missingImage)}
          hint={fmtPct(pct(q.missingImage))}
          onClick={() => setParam("filter", "missing")}
        />
      </div>

      <Panel
        className="mt-4"
        title="Why the same photo shows up repeatedly"
        subtitle={`${fmtNum(q.total - q.distinctImages)} activities share one of only ${fmtNum(q.distinctImages)} distinct images used across the catalogue`}
      >
        <p className="mb-3 text-xs text-slate-600">
          Root cause: OpenStreetMap almost never carries a photo for a listing, so an activity
          with no venue-specific photo falls back to a shared category/subcategory stock image —
          intentional, honestly labelled ("Generic fallback" above), and not a bug in the sense of
          showing another activity's actual photo. The fix is closing the gap per-activity below,
          not adding more stock photos.
        </p>
        {q.mostReusedImages.length === 0 ? (
          <p className="text-xs text-slate-400">No image is currently reused.</p>
        ) : (
          <ul className="space-y-1.5 text-[13px]">
            {q.mostReusedImages.map((r) => (
              <li key={r.imageUrl} className="flex items-center gap-2">
                <img src={r.imageUrl} alt="" className="h-8 w-12 rounded object-cover" />
                <span className="truncate text-slate-500">{r.imageUrl}</span>
                <Badge tone="amber">used by {fmtNum(r.n)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        className="mt-4"
        title="Backfill real photos from Google Street View"
        subtitle="For activities that still only have a generic fallback: checks (for free) whether Street View covers that exact address, and if so, uses that as the activity's photo. Never guesses — an address with no coverage keeps its category fallback."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="primary" loading={backfillRunning} onClick={runBackfill}>
            {backfillRunning ? "Checking…" : "Run backfill"}
          </Btn>
          {(backfillTotals.checked > 0 || backfillRunning) && (
            <span className="text-[13px] text-slate-600">
              Checked {fmtNum(backfillTotals.checked)} · found a photo for{" "}
              <strong>{fmtNum(backfillTotals.found)}</strong> · no Street View coverage for{" "}
              {fmtNum(backfillTotals.noCoverage)}
            </span>
          )}
        </div>
        {backfillErr && (
          <p className="mt-2 text-xs font-medium text-rose-600">
            {backfillErr}{" "}
            {backfillErr.includes("GOOGLE_MAPS_API_KEY") &&
              "Set it once with: wrangler secret put GOOGLE_MAPS_API_KEY"}
          </p>
        )}
      </Panel>

      <Panel
        className="mt-4"
        title="Image audit"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="title…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setParam("q", e.target.value);
              }}
              className="w-48"
            />
            <Select value={filter} onChange={(e) => setParam("filter", e.target.value)}>
              <option value="">All images</option>
              <option value="specific">Specific</option>
              <option value="generic">Generic fallback</option>
              <option value="missing">Missing</option>
              <option value="reused">Reused (shared by 2+)</option>
            </Select>
          </div>
        }
        bodyClassName=""
      >
        {imgError && <ErrorNote message={imgError} onRetry={imgReload} />}
        {imgLoading && !imgData && <Loading />}
        {imgData && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Activity</Th>
                  <Th>Image</Th>
                  <Th>Status</Th>
                  <Th>Shared by</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {imgData.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400">No activities match.</Td>
                  </tr>
                )}
                {imgData.rows.map((r) => {
                  const s = imageStatus(r);
                  return (
                    <Tr key={r.id}>
                      <Td>
                        <Link to={`/admin/activities/${r.id}`} className="font-medium text-brand-600 hover:underline">
                          {r.title}
                        </Link>
                        <div className="text-xs text-slate-500">{r.category} · {r.city || "—"}</div>
                      </Td>
                      <Td>
                        {r.imageUrl ? (
                          <img src={r.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
                        ) : (
                          <span className="text-xs text-slate-400">none</span>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </Td>
                      <Td>{r.sharedByCount > 1 ? fmtNum(r.sharedByCount) : "—"}</Td>
                      <Td className="text-xs text-slate-500">{fmtDay(r.updatedAt)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pager
              page={imgData.page}
              pageCount={imgData.pageCount}
              total={imgData.total}
              onPage={(p) => setParam("page", String(p))}
            />
          </>
        )}
      </Panel>
    </>
  );
}
