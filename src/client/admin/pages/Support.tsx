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
  subject: string;
  category: string;
  priority: string;
  status: string;
  aiResolved: number | null;
  createdAt: number;
  updatedAt: number;
  userId: string;
  userEmail: string;
  messageCount: number;
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
  pending: "blue",
  resolved: "green",
  closed: "slate",
};
const PRIORITY_TONE: Record<string, string> = {
  high: "red",
  normal: "slate",
  low: "slate",
};

export function Support() {
  const [sp, setSp] = useSearchParams();
  const [qInput, setQInput] = useState(sp.get("q") ?? "");
  const q = useDebounced(qInput, 350);
  const status = sp.get("status") ?? "";
  const category = sp.get("category") ?? "";
  const priority = sp.get("priority") ?? "";
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

  const query = `q=${encodeURIComponent(q)}&status=${status}&category=${category}&priority=${priority}&page=${page}&pageSize=25`;
  const { data, loading, error, reload } = useResource<Resp>(
    () => cc<Resp>(`/support/tickets?${query}`),
    query,
  );

  return (
    <>
      <PageTitle title="Support" />
      <Panel
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="subject, email, id…"
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setParam("q", e.target.value);
              }}
              className="w-56"
            />
            <Select value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="pending">We replied</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
            <Select value={category} onChange={(e) => setParam("category", e.target.value)}>
              <option value="">All categories</option>
              <option value="account">Account</option>
              <option value="groups">Groups</option>
              <option value="swiping">Swiping</option>
              <option value="activities">Activities</option>
              <option value="bug">Bug</option>
              <option value="other">Other</option>
            </Select>
            <Select value={priority} onChange={(e) => setParam("priority", e.target.value)}>
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
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
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th>Priority</Th>
                  <Th>Category</Th>
                  <Th>User</Th>
                  <Th>Messages</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-slate-400">No tickets match.</Td>
                  </tr>
                )}
                {data.rows.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <Link to={`/admin/support/${t.id}`} className="font-medium text-brand-600 hover:underline">
                        {t.subject}
                      </Link>
                      {t.aiResolved === 1 && (
                        <span className="ml-1.5 text-[11px] text-emerald-600">✓ AI answered</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={(STATUS_TONE[t.status] ?? "slate") as never}>{t.status}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={(PRIORITY_TONE[t.priority] ?? "slate") as never}>{t.priority}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">{t.category}</Td>
                    <Td className="text-xs text-slate-600">{t.userEmail}</Td>
                    <Td>{fmtNum(t.messageCount)}</Td>
                    <Td className="text-xs text-slate-500">{fmtDay(t.updatedAt)}</Td>
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
