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
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
  fmtDay,
  fmtNum,
} from "../ui";

interface Row {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  createdAt: number;
  groupCount: number;
  voteCount: number;
  lastActiveAt: number | null;
}
interface Resp {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const statusTone = (s: string) =>
  s === "active" ? "green" : s === "suspended" ? "amber" : "red";

export function Users() {
  const [sp, setSp] = useSearchParams();
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const q = useDebounced(qInput, 350);
  const status = sp.get("status") ?? "";
  const sort = sp.get("sort") ?? "created";
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

  const query = `q=${encodeURIComponent(q)}&status=${status}&sort=${sort}&order=${order}&page=${page}`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/users?${query}`),
    query,
  );

  const th = (key: string, label: string) => (
    <Th className="cursor-pointer select-none" >
      <button
        className="inline-flex items-center gap-1"
        onClick={() => {
          if (sort === key)
            setParam("order", order === "asc" ? "desc" : "asc");
          else {
            setParam("sort", key);
            setParam("order", "desc");
          }
        }}
      >
        {label}
        {sort === key && <span>{order === "asc" ? "▲" : "▼"}</span>}
      </button>
    </Th>
  );

  return (
    <>
      <PageTitle title="Users" />
      <Panel
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="email, id or name…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setParam("q", e.target.value);
              }}
              className="w-56"
            />
            <Select
              value={status}
              onChange={(e) => setParam("status", e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="deleted">Deleted</option>
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
                  {th("email", "User")}
                  <Th>Role</Th>
                  <Th>Status</Th>
                  {th("groups", "Groups")}
                  <Th>Votes</Th>
                  {th("active", "Last active")}
                  {th("created", "Joined")}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400" >
                      No users match.
                    </Td>
                  </tr>
                )}
                {data.rows.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {u.displayName || "—"}
                      </Link>
                      <div className="text-xs text-slate-500">{u.email}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {u.id}
                      </div>
                    </Td>
                    <Td>
                      {u.role !== "user" ? (
                        <Badge tone={u.role === "owner" ? "lime" : "blue"}>
                          {u.role}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">user</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(u.status) as never}>
                        {u.status}
                      </Badge>
                    </Td>
                    <Td>{fmtNum(u.groupCount)}</Td>
                    <Td>{fmtNum(u.voteCount)}</Td>
                    <Td className="text-xs text-slate-500">
                      {u.lastActiveAt ? fmtDate(u.lastActiveAt) : "—"}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {fmtDay(u.createdAt)}
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
