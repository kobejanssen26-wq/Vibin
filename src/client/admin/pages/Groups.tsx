import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cc } from "../api";
import { useDebounced, useResource } from "../lib";
import {
  Badge,
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
} from "../ui";

interface Row {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  creatorId: string;
  creatorName: string | null;
  memberCount: number;
  matchCount: number;
  planCount: number;
}
interface Resp {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const statusTone: Record<string, string> = {
  configuring: "slate",
  swiping: "blue",
  date_matching: "blue",
  planned: "green",
  archived: "slate",
};

export function Groups() {
  const [sp, setSp] = useSearchParams();
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const q = useDebounced(qInput, 350);
  const status = sp.get("status") ?? "";
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

  const query = `q=${encodeURIComponent(q)}&status=${status}&page=${page}`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/groups?${query}`),
    query,
  );

  return (
    <>
      <PageTitle title="Groups" />
      <Panel
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="name or id…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setParam("q", e.target.value);
              }}
              className="w-52"
            />
            <Select
              value={status}
              onChange={(e) => setParam("status", e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="configuring">Configuring</option>
              <option value="swiping">Swiping</option>
              <option value="date_matching">Date matching</option>
              <option value="planned">Planned</option>
              <option value="archived">Archived</option>
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
                  <Th>Group</Th>
                  <Th>Status</Th>
                  <Th>Creator</Th>
                  <Th>Members</Th>
                  <Th>Matches</Th>
                  <Th>Plans</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400" >
                      No groups match.
                    </Td>
                  </tr>
                )}
                {data.rows.map((g) => (
                  <Tr key={g.id}>
                    <Td>
                      <Link
                        to={`/admin/groups/${g.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {g.name}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">
                        {g.id}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={(statusTone[g.status] ?? "slate") as never}>
                        {g.status}
                      </Badge>
                    </Td>
                    <Td>
                      <Link
                        to={`/admin/users/${g.creatorId}`}
                        className="text-brand-600 hover:underline"
                      >
                        {g.creatorName || "—"}
                      </Link>
                    </Td>
                    <Td>{fmtNum(g.memberCount)}</Td>
                    <Td>{fmtNum(g.matchCount)}</Td>
                    <Td>{fmtNum(g.planCount)}</Td>
                    <Td className="text-xs text-slate-500">
                      {fmtDay(g.createdAt)}
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
