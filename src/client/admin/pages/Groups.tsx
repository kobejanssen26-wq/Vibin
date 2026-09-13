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

const STATUS_TONE: Record<string, string> = {
  configuring: "amber",
  swiping: "blue",
  date_matching: "blue",
  planned: "lime",
  archived: "slate",
};

export function Groups() {
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
    () => cc<Resp>(`/groups?${query}`),
    query,
  );

  /* ------------------------------ selection ------------------------------ */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setConfirmBulk(false);
  }, [query]);

  const rows = data?.rows ?? [];
  const selectableRows = rows.filter((r) => r.status !== "archived");
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      if (allSelected) {
        const n = new Set(s);
        selectableRows.forEach((r) => n.delete(r.id));
        return n;
      }
      return new Set([...s, ...selectableRows.map((r) => r.id)]);
    });

  const archive = async (id: string) => {
    setBusyId(id);
    try {
      await cc(`/groups/${id}`, { method: "DELETE" });
      setNote("Group archived.");
      reload();
    } finally {
      setBusyId(null);
    }
  };
  const restore = async (id: string) => {
    setBusyId(id);
    try {
      await cc(`/groups/${id}/restore`, { method: "POST" });
      setNote("Group restored.");
      reload();
    } finally {
      setBusyId(null);
    }
  };
  const bulkArchive = async () => {
    setBulkBusy(true);
    try {
      const r = await cc<{ archived: number; skipped: number }>("/groups/bulk-archive", {
        method: "POST",
        body: { ids: [...selected] },
      });
      setNote(
        `Archived ${r.archived} group${r.archived === 1 ? "" : "s"}` +
          (r.skipped ? `, skipped ${r.skipped} (already archived).` : "."),
      );
      setSelected(new Set());
      setConfirmBulk(false);
      reload();
    } finally {
      setBulkBusy(false);
    }
  };

  /* -------------------------------- create -------------------------------- */
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", creatorEmail: "", memberEmails: "" });

  const createGroup = async () => {
    setCreateBusy(true);
    setCreateErr(null);
    try {
      await cc("/groups", {
        method: "POST",
        body: {
          name: form.name.trim(),
          creatorEmail: form.creatorEmail.trim(),
          memberEmails: form.memberEmails
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setNote(`Group "${form.name.trim()}" created.`);
      setForm({ name: "", creatorEmail: "", memberEmails: "" });
      setCreateOpen(false);
      reload();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create group.");
    } finally {
      setCreateBusy(false);
    }
  };

  const th = (key: string, label: string) => (
    <Th className="cursor-pointer select-none">
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
    </Th>
  );

  return (
    <>
      <PageTitle
        title="Groups"
        right={
          <Btn variant="primary" onClick={() => setCreateOpen((v) => !v)}>
            + New group
          </Btn>
        }
      />
      {note && (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
          {note}
        </p>
      )}

      {createOpen && (
        <Panel bodyClassName="p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Create group</h3>
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Group name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Friday crew"
                />
              </Field>
            </div>
            <Field label="Creator email">
              <Input
                type="email"
                value={form.creatorEmail}
                onChange={(e) => setForm({ ...form, creatorEmail: e.target.value })}
                placeholder="creator@example.com"
              />
            </Field>
            <Field label="Other members (comma-separated emails, optional)">
              <Input
                value={form.memberEmails}
                onChange={(e) => setForm({ ...form, memberEmails: e.target.value })}
                placeholder="a@example.com, b@example.com"
              />
            </Field>
          </div>
          {createErr && <p className="mt-2 text-xs font-medium text-rose-600">{createErr}</p>}
          <div className="mt-3 flex gap-2">
            <Btn
              variant="primary"
              loading={createBusy}
              disabled={!form.name.trim() || !form.creatorEmail.trim()}
              onClick={createGroup}
            >
              Create group
            </Btn>
            <Btn variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Btn>
          </div>
        </Panel>
      )}

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
              className="w-56"
            />
            <Select value={status} onChange={(e) => setParam("status", e.target.value)}>
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

        {selected.size > 0 && (
          <div className="border-b border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-medium text-slate-700">{selected.size} selected</span>
              <Btn variant="ghost" className="!py-1 !text-xs" onClick={() => setSelected(new Set())}>
                Clear
              </Btn>
              <Btn variant="danger" className="!py-1" onClick={() => setConfirmBulk((v) => !v)}>
                Archive selected…
              </Btn>
            </div>
            {confirmBulk && (
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                <p className="text-[13px] text-rose-800">
                  Archive <strong>{selected.size}</strong> group{selected.size === 1 ? "" : "s"}?
                  Members, votes, matches and plans are kept — archived groups just stop showing as
                  active. This can be undone per-group afterwards.
                </p>
                <div className="mt-2 flex gap-2">
                  <Btn variant="ghost" onClick={() => setConfirmBulk(false)}>
                    Cancel
                  </Btn>
                  <Btn variant="danger" loading={bulkBusy} onClick={bulkArchive}>
                    Archive {selected.size}
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
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all on page"
                    />
                  </Th>
                  {th("name", "Group")}
                  <Th>Status</Th>
                  <Th>Creator</Th>
                  {th("members", "Members")}
                  <Th>Matches</Th>
                  <Th>Plans</Th>
                  {th("created", "Created")}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400">No groups match.</Td>
                  </tr>
                )}
                {rows.map((g) => (
                  <Tr key={g.id}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={selected.has(g.id)}
                        disabled={g.status === "archived"}
                        onChange={() => toggle(g.id)}
                        aria-label={`Select ${g.name}`}
                      />
                    </Td>
                    <Td>
                      <Link to={`/admin/groups/${g.id}`} className="font-medium text-brand-600 hover:underline">
                        {g.name}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">{g.id}</div>
                    </Td>
                    <Td>
                      <Badge tone={(STATUS_TONE[g.status] ?? "slate") as never}>{g.status}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">{g.creatorName || "—"}</Td>
                    <Td>{fmtNum(g.memberCount)}</Td>
                    <Td>{fmtNum(g.matchCount)}</Td>
                    <Td>{fmtNum(g.planCount)}</Td>
                    <Td className="text-xs text-slate-500">{fmtDay(g.createdAt)}</Td>
                    <Td>
                      {g.status === "archived" ? (
                        <Btn
                          variant="ghost"
                          className="!py-1 !text-xs"
                          loading={busyId === g.id}
                          onClick={() => restore(g.id)}
                        >
                          Restore
                        </Btn>
                      ) : (
                        <Btn
                          variant="ghost"
                          className="!py-1 !text-xs"
                          loading={busyId === g.id}
                          onClick={() => archive(g.id)}
                        >
                          Archive
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
