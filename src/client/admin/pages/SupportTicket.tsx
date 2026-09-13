import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cc } from "../api";
import { useResource } from "../lib";
import { Badge, Btn, ErrorNote, Loading, Panel, PageTitle, Select, fmtDate } from "../ui";

interface Message {
  id: string;
  authorType: "user" | "ai" | "admin" | "system";
  authorEmail: string | null;
  body: string;
  internal: number;
  createdAt: number;
}
interface Detail {
  ticket: {
    id: string;
    subject: string;
    category: string;
    priority: string;
    status: string;
    aiResolved: number | null;
    createdAt: number;
  };
  user: { id: string; email: string } | null;
  messages: Message[];
}

const AUTHOR_LABEL: Record<Message["authorType"], string> = {
  user: "User",
  ai: "AI",
  admin: "Admin",
  system: "System",
};

export function SupportTicket() {
  const { id = "" } = useParams();
  const { data, loading, error, reload } = useResource<Detail>(
    () => cc<Detail>(`/support/tickets/${id}`),
    id,
  );

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await cc(`/support/tickets/${id}/reply`, {
        method: "POST",
        body: { body: reply.trim(), internal },
      });
      setReply("");
      setInternal(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setBusy(false);
    }
  };

  const update = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await cc(`/support/tickets/${id}`, { method: "PATCH", body: patch });
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle
        title={data?.ticket.subject ?? "Ticket"}
        crumbs={
          <Link to="/admin/support" className="hover:underline">
            ← Support
          </Link>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <Panel title="Conversation" bodyClassName="p-4">
            <div className="space-y-3">
              {data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg border p-3 text-[13px] ${
                    m.internal
                      ? "border-amber-200 bg-amber-50"
                      : m.authorType === "user"
                        ? "border-slate-200 bg-white"
                        : "border-brand-200 bg-brand-50/40"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold">
                      {AUTHOR_LABEL[m.authorType]}
                      {m.authorEmail ? ` · ${m.authorEmail}` : ""}
                      {m.internal ? " · internal note" : ""}
                    </span>
                    <span>{fmtDate(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-slate-800">{m.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3">
              <textarea
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                rows={3}
                placeholder={internal ? "Internal note (not sent to the user)…" : "Reply to the user…"}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                  />
                  Internal note only
                </label>
                <Btn variant="primary" loading={busy} disabled={!reply.trim()} onClick={send}>
                  {internal ? "Add note" : "Send reply"}
                </Btn>
              </div>
              {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
            </div>
          </Panel>

          <Panel title="Details" bodyClassName="p-4 space-y-3">
            <Field label="Status">
              <Select
                value={data.ticket.status}
                onChange={(e) => update({ status: e.target.value })}
              >
                <option value="open">Open</option>
                <option value="pending">We replied</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={data.ticket.priority}
                onChange={(e) => update({ priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </Field>
            <div className="pt-1 text-[13px] text-slate-600">
              <p>
                <span className="text-slate-400">Category:</span> {data.ticket.category}
              </p>
              <p>
                <span className="text-slate-400">From:</span>{" "}
                {data.user ? (
                  <Link to={`/admin/users/${data.user.id}`} className="text-brand-600 hover:underline">
                    {data.user.email}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
              <p>
                <span className="text-slate-400">Opened:</span> {fmtDate(data.ticket.createdAt)}
              </p>
              {data.ticket.aiResolved != null && (
                <p className="mt-1">
                  <Badge tone={data.ticket.aiResolved ? "green" : "amber"}>
                    {data.ticket.aiResolved ? "AI was confident" : "AI escalated this"}
                  </Badge>
                </p>
              )}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
