import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cc } from "../api";
import { useDebounced, useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Field,
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

  const query = `q=${encodeURIComponent(q)}&status=${status}&sort=${sort}&order=${order}&page=${page}&pageSize=50`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/users?${query}`),
    query,
  );

  /* ------------------------------ selection ------------------------------ */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  // clear selection whenever the result set changes
  useEffect(() => {
    setSelected(new Set());
    setBulkOpen(false);
  }, [query]);

  const selectableRows = (data?.rows ?? []).filter((r) => r.role !== "owner");
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allOnPageSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      if (allOnPageSelected) {
        const n = new Set(s);
        selectableRows.forEach((r) => n.delete(r.id));
        return n;
      }
      return new Set([...s, ...selectableRows.map((r) => r.id)]);
    });

  const runBulkDelete = async () => {
    setBulkBusy(true);
    setBulkErr(null);
    try {
      const r = await cc<{ deleted: number; skipped: number }>(
        "/users/bulk-delete",
        { method: "POST", body: { ids: [...selected], password: pw } },
      );
      setBulkNote(
        `Deleted ${r.deleted} account${r.deleted === 1 ? "" : "s"}` +
          (r.skipped ? `, skipped ${r.skipped}.` : "."),
      );
      setSelected(new Set());
      setBulkOpen(false);
      setPw("");
      reload();
    } catch (e) {
      setBulkErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const th = (key: string, label: string) => (
    <Th className="cursor-pointer select-none">
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
      {bulkNote && (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          {bulkNote}
        </p>
      )}
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

        {selected.size > 0 && (
          <div className="border-b border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-medium text-slate-700">
                {selected.size} selected
              </span>
              <Btn
                variant="ghost"
                className="!py-1 !text-xs"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Btn>
              <Btn
                variant="danger"
                className="!py-1"
                onClick={() => setBulkOpen((v) => !v)}
              >
                Delete selected…
              </Btn>
            </div>
            {bulkOpen && (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                <p className="text-[13px] text-rose-800">
                  Permanently delete <strong>{selected.size}</strong> account
                  {selected.size === 1 ? "" : "s"} — including their memberships,
                  votes, and any groups they created (with those groups' matches,
                  plans and messages). The owner account is always skipped.
                  Analytics and audit history are kept. This cannot be undone.
                </p>
                <div className="mt-2 max-w-xs">
                  <Field label="Confirm with your password">
                    <Input
                      type="password"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      className="w-full"
                    />
                  </Field>
                </div>
                {bulkErr && (
                  <p className="mt-2 text-xs text-rose-600">{bulkErr}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Btn
                    variant="ghost"
                    onClick={() => {
                      setBulkOpen(false);
                      setPw("");
                      setBulkErr(null);
                    }}
                  >
                    Cancel
                  </Btn>
                  <Btn
                    variant="danger"
                    loading={bulkBusy}
                    disabled={!pw}
                    onClick={runBulkDelete}
                  >
                    Delete {selected.size} permanently
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {data && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      aria-label="Select all on page"
                    />
                  </Th>
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
                    <Td className="py-6 text-center text-slate-400">
                      No users match.
                    </Td>
                  </tr>
                )}
                {data.rows.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        disabled={u.role === "owner"}
                        onChange={() => toggle(u.id)}
                        aria-label={`Select ${u.email}`}
                      />
                    </Td>
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
