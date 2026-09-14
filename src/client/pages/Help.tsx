import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { api, ApiRequestError } from "../lib/api";
import { Button, EmptyState, ErrorState, Field, LoadingScreen } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { IconChevronRight } from "../components/icons";

interface TicketRow {
  id: string;
  subject: string;
  category: string;
  status: "open" | "pending" | "resolved" | "closed";
  createdAt: number;
  updatedAt: number;
}

const STATUS_LABEL: Record<TicketRow["status"], { label: string; tone: string }> = {
  open: { label: "Sent", tone: "bg-brand-500/10 text-brand-600" },
  pending: { label: "We replied", tone: "bg-lime-400/20 text-lime-700" },
  resolved: { label: "Resolved", tone: "bg-navy/10 text-navy-400" },
  closed: { label: "Closed", tone: "bg-navy/10 text-navy-400" },
};

const CATEGORIES = [
  ["account", "My account"],
  ["groups", "Groups & invites"],
  ["swiping", "Swiping & filters"],
  ["activities", "An activity or event"],
  ["bug", "Something's broken"],
  ["other", "Something else"],
] as const;

const FAQ = [
  { q: "How do I join a group?", a: "Paste the invite code or link on your dashboard's \"Join a group\" box, or just open the invite link — vibin.be/join/CODE." },
  { q: "Can I change filters mid-swipe?", a: "Yes, any time. Your existing likes and passes are kept — changing category, radius, budget or date just refreshes what's shown next." },
  { q: "What happens when everyone likes the same activity?", a: "That's a match. The group then votes on a date/time, and once that's set you get a plan with the real booking/website link." },
  { q: "Is VIBIN a dating app?", a: "No — it's for planning group activities with friends. No profiles, no romantic matching." },
];

export function Help() {
  const { data, loading, error, refetch } = usePoll<{ tickets: TicketRow[] }>("/support", 20000);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "other" as string, body: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setAiAnswer(null);
    try {
      const r = await api<{ messages: { authorType: string; body: string }[] }>("/support", {
        method: "POST",
        body: form,
      });
      const ai = r.messages.find((m) => m.authorType === "ai");
      if (ai) setAiAnswer(ai.body);
      setForm({ subject: "", category: "other", body: "" });
      setOpen(false);
      void refetch();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not send that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: "/settings", label: "Settings" }} title="Help & support" />

      {aiAnswer && (
        <div className="card border-lime-200 bg-lime-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-lime-700">VIBIN assistant</p>
          <p className="mt-1.5 text-sm text-navy">{aiAnswer}</p>
        </div>
      )}

      <section>
        <p className="eyebrow mb-2">Common questions</p>
        <div className="card divide-y divide-paper-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-navy marker:hidden">
                {f.q}
                <IconChevronRight
                  size={16}
                  className="shrink-0 text-navy-300 transition-transform duration-200 group-open:rotate-90"
                />
              </summary>
              <p className="mt-1.5 animate-float-up text-sm text-navy-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">Ask us something</p>
          {!open && (
            <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => setOpen(true)}>
              New question
            </Button>
          )}
        </div>

        {open && (
          <form onSubmit={submit} className="card space-y-3 p-4">
            <Field
              label="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              maxLength={160}
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-navy-700">Category</span>
              <select
                className="field"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-navy-700">What's going on?</span>
              <textarea
                className="field min-h-28"
                required
                minLength={5}
                maxLength={4000}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>
            {err && <p className="text-sm font-medium text-danger-600">{err}</p>}
            <div className="flex gap-2">
              <Button type="submit" loading={busy} className="flex-1">
                Send
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <p className="eyebrow mb-2">Your questions</p>
        {loading && !data ? (
          <LoadingScreen label="Loading…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : !data?.tickets.length ? (
          <EmptyState emoji="💬" title="Nothing yet" message="Questions you send land here." />
        ) : (
          <ul className="card divide-y divide-paper-line">
            {data.tickets.map((t) => {
              const s = STATUS_LABEL[t.status];
              return (
                <li key={t.id}>
                  <Link
                    to={`/help/${t.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-navy/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{t.subject}</p>
                      <p className="text-xs text-navy-400">
                        {CATEGORIES.find(([id]) => id === t.category)?.[1] ?? t.category}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}>
                      {s.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
