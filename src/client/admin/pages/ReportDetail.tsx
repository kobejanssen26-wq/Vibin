import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import { Badge, Btn, ErrorNote, Loading, Panel, PageTitle, fmtDate } from "../ui";

interface Detail {
  report: {
    id: string;
    targetType: string;
    targetId: string;
    reason: string;
    detail: string;
    status: string;
    notes: string | null;
    createdAt: number;
    resolvedAt: number | null;
  };
  reporter: { id: string; email: string } | null;
  resolver: { id: string; email: string } | null;
  target: Record<string, unknown> | null;
}

const STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;

export function ReportDetail() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(() => cc<Detail>(`/reports/${id}`), id);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (status: string) => {
    setBusy(status);
    try {
      await cc(`/reports/${id}`, { method: "PATCH", body: { status } });
      reload();
    } finally {
      setBusy(null);
    }
  };
  const saveNotes = async () => {
    setBusy("notes");
    try {
      await cc(`/reports/${id}`, { method: "PATCH", body: { notes } });
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle
        title="Report"
        crumbs={
          <Link to="/admin/reports" className="hover:underline">
            ← Reports
          </Link>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <Panel title="Report" bodyClassName="p-4 space-y-3 text-[13px]">
            <Row k="Reason">{data.report.reason}</Row>
            <Row k="Detail">{data.report.detail || "—"}</Row>
            <Row k="Reported by">{data.reporter?.email ?? "—"}</Row>
            <Row k="Target type">{data.report.targetType}</Row>
            <Row k="Target">
              {data.target ? (
                <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
                  {JSON.stringify(data.target, null, 2)}
                </pre>
              ) : (
                <span className="text-slate-400">Not found (may have been deleted) — id: {data.report.targetId}</span>
              )}
            </Row>
            <Row k="Created">{fmtDate(data.report.createdAt)}</Row>
            {data.report.resolvedAt && (
              <Row k="Resolved">
                {fmtDate(data.report.resolvedAt)} by {data.resolver?.email ?? "—"}
              </Row>
            )}
          </Panel>

          <Panel title="Moderation" bodyClassName="p-4 space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-700">Status</p>
              <Badge tone="slate">{data.report.status}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <Btn
                  key={s}
                  variant={s === data.report.status ? "primary" : "neutral"}
                  className="!py-1 !text-xs"
                  loading={busy === s}
                  disabled={s === data.report.status}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </Btn>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-700">Internal notes</p>
              <textarea
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                rows={4}
                defaultValue={data.report.notes ?? ""}
                onChange={(e) => setNotes(e.target.value)}
              />
              <Btn variant="neutral" className="mt-2 !text-xs" loading={busy === "notes"} onClick={saveNotes}>
                Save notes
              </Btn>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500">{k}</p>
      <div className="mt-0.5 text-slate-800">{children}</div>
    </div>
  );
}
