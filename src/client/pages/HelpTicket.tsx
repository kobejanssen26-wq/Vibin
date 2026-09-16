import { FormEvent, useState } from "react";
import { useParams } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { api, ApiRequestError } from "../lib/api";
import { Button, ErrorState, LoadingScreen } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { relativeTime } from "../lib/format";

interface TicketMessage {
  id: string;
  authorType: "user" | "ai" | "admin" | "system";
  body: string;
  createdAt: number;
}
interface TicketDetail {
  ticket: { id: string; subject: string; status: "open" | "pending" | "resolved" | "closed" };
  messages: TicketMessage[];
}

const AUTHOR_LABEL: Record<TicketMessage["authorType"], string> = {
  user: "You",
  ai: "VIBIN assistant",
  admin: "VIBIN support",
  system: "System",
};

export function HelpTicket() {
  const { id = "" } = useParams();
  const { data, loading, error, refetch } = usePoll<TicketDetail>(`/support/${id}`, 8000);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/support/${id}/messages`, { method: "POST", body: { body } });
      setText("");
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <LoadingScreen />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  if (!data) return null;

  const closed = data.ticket.status === "closed";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <PageHeader back={{ to: "/help", label: "Help" }} title={data.ticket.subject} />

      <div className="space-y-3">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.authorType === "user" ? "flex-row-reverse" : ""}`}
          >
            <div className={`max-w-[85%] ${m.authorType === "user" ? "items-end text-right" : ""} flex flex-col`}>
              <p className="mb-0.5 px-1 text-xs font-semibold text-navy-400">
                {AUTHOR_LABEL[m.authorType]}
              </p>
              <p
                className={`inline-block whitespace-pre-wrap px-3.5 py-2 text-sm leading-relaxed ${
                  m.authorType === "user"
                    ? "rounded-2xl rounded-br-md bg-brand-500 text-white"
                    : "rounded-2xl rounded-bl-md border border-paper-line bg-paper-card text-navy"
                }`}
              >
                {m.body}
              </p>
              <p className="mt-1 px-1 text-[10px] text-navy-300">{relativeTime(m.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      {closed ? (
        <p className="rounded-xl bg-paper-soft px-4 py-3 text-center text-sm text-navy-400">
          This conversation is closed.
        </p>
      ) : (
        <form onSubmit={send} className="flex items-center gap-2 border-t border-paper-line pt-3">
          <input
            className="field flex-1"
            placeholder="Reply…"
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" loading={busy} disabled={!text.trim()}>
            Send
          </Button>
        </form>
      )}
      {err && <p className="text-sm font-medium text-danger-600">{err}</p>}
    </div>
  );
}
