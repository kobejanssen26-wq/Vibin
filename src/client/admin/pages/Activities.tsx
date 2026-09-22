import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cc } from "../api";
import { useDebounced, useResource } from "../lib";
import { ImportCsv } from "../components/ImportCsv";
import {
  ActivityForm,
  activityFormToBody,
  EMPTY_ACTIVITY_FORM,
  type ActivityFormValues,
} from "../components/ActivityForm";
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
  Table,
  Td,
  Th,
  Tr,
  fmtDay,
  fmtNum,
  fmtPct,
} from "../ui";

const CATS = [
  "sport", "adventure", "food_drinks", "nightlife", "creative", "relaxation",
  "culture", "nature", "gaming", "entertainment", "learning", "other",
];

interface Metric {
  swipes: number;
  likes: number;
  passes: number;
  views: number;
  matches: number;
  plans: number;
  bookingClicks: number;
  likeRate: number | null;
}
interface Row {
  id: string;
  title: string;
  category: string;
  city: string | null;
  status: string;
  active: number;
  provider: string | null;
  lastVerifiedAt: number | null;
  metrics: Metric;
}
interface Resp {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const statusTone: Record<string, string> = {
  verified: "green",
  needs_review: "amber",
  outdated: "red",
  inactive: "slate",
};

export function Activities() {
  const [sp, setSp] = useSearchParams();
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const q = useDebounced(qInput, 350);
  const status = sp.get("status") ?? "";
  const category = sp.get("category") ?? "";
  const gap = sp.get("gap") ?? "";
  const sort = sp.get("sort") ?? "updated";
  const order = sp.get("order") ?? "desc";
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

  const query = `q=${encodeURIComponent(q)}&status=${status}&category=${category}&gap=${gap}&sort=${sort}&order=${order}&page=${page}`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/activities?${query}`),
    query,
  );

  const [verifying, setVerifying] = useState<string | null>(null);
  const verify = async (id: string) => {
    setVerifying(id);
    try {
      await cc(`/activities/${id}/verify`, { method: "POST" });
      reload();
    } finally {
      setVerifying(null);
    }
  };

  /* -------------------------------- create -------------------------------- */
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [form, setForm] = useState<ActivityFormValues>(EMPTY_ACTIVITY_FORM);

  const createActivity = async () => {
    setCreateBusy(true);
    setCreateErr(null);
    try {
      await cc("/activities", { method: "POST", body: activityFormToBody(form) });
      setForm(EMPTY_ACTIVITY_FORM);
      setCreateOpen(false);
      reload();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create activity.");
    } finally {
      setCreateBusy(false);
    }
  };

  const sortBtn = (key: string, label: string) => (
    <button
      className="inline-flex items-center gap-1"
      onClick={() => {
        if (sort === key) setParam("order", order === "asc" ? "desc" : "asc");
        else {
          setParam("sort", key);
          setParam("order", "desc");
        }
      }}
    >
      {label}
      {sort === key && <span>{order === "asc" ? "▲" : "▼"}</span>}
    </button>
  );

  return (
    <>
      <PageTitle
        title="Activities"
        right={
          <Btn variant="primary" onClick={() => setCreateOpen((v) => !v)}>
            + Activity
          </Btn>
        }
      />

      {createOpen && (
        <div className="mb-4">
          <ActivityForm
            value={form}
            onChange={setForm}
            onSubmit={createActivity}
            onCancel={() => setCreateOpen(false)}
            submitLabel="Create activity"
            busy={createBusy}
            error={createErr}
          />
        </div>
      )}

      <div className="mb-4">
        <ImportCsv onImported={reload} />
      </div>

      <Panel
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="title or id…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setParam("q", e.target.value);
              }}
              className="w-48"
            />
            <Select value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value="verified">Verified</option>
              <option value="needs_review">Needs review</option>
              <option value="outdated">Outdated</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select
              value={category}
              onChange={(e) => setParam("category", e.target.value)}
            >
              <option value="">All categories</option>
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={gap} onChange={(e) => setParam("gap", e.target.value)}>
              <option value="">Any data</option>
              <option value="description">Missing description</option>
              <option value="photo">Stock photo only</option>
              <option value="hours">Missing opening hours</option>
              <option value="price">No exact price</option>
              <option value="website">No website</option>
              <option value="dead_link">Dead / parked website</option>
            </Select>
            <a
              href="/api/admin/cc/activities/export.csv"
              className="rounded border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-600 hover:bg-slate-50"
            >
              Export CSV
            </a>
          </div>
        }
        bodyClassName=""
      >
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {data && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{sortBtn("title", "Activity")}</Th>
                  <Th>{sortBtn("status", "Status")}</Th>
                  <Th>{sortBtn("views", "Views")}</Th>
                  <Th>{sortBtn("likes", "Likes")}</Th>
                  <Th>{sortBtn("passes", "Passes")}</Th>
                  <Th>{sortBtn("likeRate", "Like rate")}</Th>
                  <Th>{sortBtn("matches", "Matches")}</Th>
                  <Th>{sortBtn("plans", "Plans")}</Th>
                  <Th>{sortBtn("bookingClicks", "Booking clicks")}</Th>
                  <Th>Verified</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400">
                      No activities match.
                    </Td>
                  </tr>
                )}
                {data.rows.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Link
                        to={`/admin/activities/${a.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {a.title}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {a.category} · {a.city || "—"} · {a.provider || "—"}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={(statusTone[a.status] ?? "slate") as never}>
                        {a.status}
                      </Badge>
                    </Td>
                    <Td>{fmtNum(a.metrics.views)}</Td>
                    <Td>{fmtNum(a.metrics.likes)}</Td>
                    <Td>{fmtNum(a.metrics.passes)}</Td>
                    <Td>{fmtPct(a.metrics.likeRate)}</Td>
                    <Td>{fmtNum(a.metrics.matches)}</Td>
                    <Td>{fmtNum(a.metrics.plans)}</Td>
                    <Td>{fmtNum(a.metrics.bookingClicks)}</Td>
                    <Td className="text-xs text-slate-500">
                      {a.lastVerifiedAt ? fmtDay(a.lastVerifiedAt) : "—"}
                    </Td>
                    <Td>
                      {a.status !== "verified" && (
                        <Btn
                          variant="ghost"
                          className="!py-1 !text-xs"
                          loading={verifying === a.id}
                          onClick={() => verify(a.id)}
                        >
                          ✓ Verify
                        </Btn>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              onPage={(p) => setParam("page", String(p))}
            />
          </>
        )}
      </Panel>
    </>
  );
}
