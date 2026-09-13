import { Link, useSearchParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import { Badge, ErrorNote, Loading, Pager, Panel, PageTitle, Select, Table, Td, Th, Tr, fmtDay } from "../ui";

interface Row {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  reporterEmail: string | null;
  createdAt: number;
}
interface Resp {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const STATUS_TONE: Record<string, string> = {
  open: "amber",
  reviewing: "blue",
  resolved: "green",
  dismissed: "slate",
};

export function Reports() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") ?? "";
  const targetType = sp.get("targetType") ?? "";
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

  const query = `status=${status}&targetType=${targetType}&page=${page}&pageSize=25`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/reports?${query}`),
    query,
  );

  return (
    <>
      <PageTitle title="Reports" />
      <Panel
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="reviewing">Under review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </Select>
            <Select value={targetType} onChange={(e) => setParam("targetType", e.target.value)}>
              <option value="">All types</option>
              <option value="activity">Activity</option>
              <option value="group">Group</option>
              <option value="member">Member</option>
              <option value="message">Message</option>
            </Select>
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
                  <Th>Reported</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th>Reporter</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400">No reports match.</Td>
                  </tr>
                )}
                {data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link to={`/admin/reports/${r.id}`} className="font-medium text-brand-600 hover:underline">
                        {r.targetType} · {r.targetId.slice(0, 12)}
                      </Link>
                    </Td>
                    <Td className="text-xs text-slate-600">{r.reason}</Td>
                    <Td>
                      <Badge tone={(STATUS_TONE[r.status] ?? "slate") as never}>{r.status}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">{r.reporterEmail ?? "—"}</Td>
                    <Td className="text-xs text-slate-500">{fmtDay(r.createdAt)}</Td>
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
