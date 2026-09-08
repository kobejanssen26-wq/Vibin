import { useSearchParams } from "react-router-dom";
import { cc } from "../api";
import { RangePicker, useResource } from "../lib";
import {
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
  fmtDate,
} from "../ui";

interface Row {
  id: string;
  actorType: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  createdAt: number;
}
interface Resp {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function AuditLog() {
  const [sp, setSp] = useSearchParams();
  const action = sp.get("action") ?? "";
  const actor = sp.get("actor") ?? "";
  const page = Number(sp.get("page")) || 1;

  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p);
        v ? n.set(k, v) : n.delete(k);
        if (k !== "page") n.delete("page");
        return n;
      },
      { replace: true },
    );

  const actions = useResource<{ actions: string[] }>(
    () => cc<{ actions: string[] }>("/audit/actions"),
    "audit-actions",
  );

  const range = sp.get("range") ?? "30d";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const rangeQuery =
    range === "custom" && from && to
      ? `range=custom&from=${from}&to=${to}`
      : `range=${range}`;
  const query = `${rangeQuery}&action=${encodeURIComponent(action)}&actor=${encodeURIComponent(actor)}&page=${page}`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/audit?${query}`),
    query,
  );

  return (
    <>
      <PageTitle title="Audit log" right={<RangePicker />} />
      <Panel
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="actor id or email…"
              value={actor}
              onChange={(e) => set("actor", e.target.value)}
              className="w-48"
            />
            <Select value={action} onChange={(e) => set("action", e.target.value)}>
              <option value="">All actions</option>
              {actions.data?.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
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
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Target</Th>
                  <Th>Meta</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400">
                      No audit entries in range.
                    </Td>
                  </tr>
                )}
                {data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap text-xs text-slate-500">
                      {fmtDate(r.createdAt)}
                    </Td>
                    <Td className="text-xs">
                      {r.actorEmail || r.actorId || r.actorType}
                    </Td>
                    <Td mono>{r.action}</Td>
                    <Td className="text-xs">
                      {r.targetType ? (
                        <>
                          {r.targetType}
                          <span className="text-slate-400"> · </span>
                          <span className="font-mono">{r.targetId}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="max-w-xs">
                      {Object.keys(r.meta).length ? (
                        <code className="block truncate text-[11px] text-slate-500">
                          {JSON.stringify(r.meta)}
                        </code>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-xs text-slate-400">{r.ip || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              onPage={(p) => set("page", String(p))}
            />
          </>
        )}
      </Panel>
    </>
  );
}
