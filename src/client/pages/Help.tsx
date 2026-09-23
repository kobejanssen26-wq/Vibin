import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { usePoll } from "../lib/usePoll";
import { api, ApiRequestError } from "../lib/api";
import { Button, EmptyState, ErrorState, Field, LoadingScreen } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { IconChevronRight } from "../components/icons";
import { useLang, type Key } from "../lib/i18n";

interface TicketRow {
  id: string;
  subject: string;
  category: string;
  status: "open" | "pending" | "resolved" | "closed";
  createdAt: number;
  updatedAt: number;
}

const STATUS_TONE: Record<TicketRow["status"], string> = {
  open: "bg-brand-500/10 text-brand-600",
  pending: "bg-lime-400/20 text-lime-700",
  resolved: "bg-navy/10 text-navy-400",
  closed: "bg-navy/10 text-navy-400",
};

const CATEGORY_IDS = ["account", "groups", "swiping", "activities", "bug", "other"] as const;

const FAQ_IDS = ["1", "2", "3", "4"] as const;

export function Help() {
  const { t } = useLang();
  const catLabel = (id: string) =>
    (CATEGORY_IDS as readonly string[]).includes(id) ? t(`help.cat.${id}` as Key) : id;
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
      setErr(e instanceof ApiRequestError ? e.message : t("help.sendError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader back={{ to: "/settings", label: t("help.back") }} title={t("help.title")} />

      {aiAnswer && (
        <div className="card border-lime-200 bg-lime-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-lime-700">{t("help.assistant")}</p>
          <p className="mt-1.5 text-sm text-navy">{aiAnswer}</p>
        </div>
      )}

      <section>
        <p className="eyebrow mb-2">{t("help.common")}</p>
        <div className="card divide-y divide-paper-line">
          {FAQ_IDS.map((n) => (
            <details key={n} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-navy marker:hidden">
                {t(`help.faq.${n}.q` as Key)}
                <IconChevronRight
                  size={16}
                  className="shrink-0 text-navy-300 transition-transform duration-200 group-open:rotate-90"
                />
              </summary>
              <p className="mt-1.5 animate-float-up text-sm text-navy-400">{t(`help.faq.${n}.a` as Key)}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow">{t("help.ask")}</p>
          {!open && (
            <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => setOpen(true)}>
              {t("help.newQuestion")}
            </Button>
          )}
        </div>

        {open && (
          <form onSubmit={submit} className="card space-y-3 p-4">
            <Field
              label={t("help.subject")}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
              maxLength={160}
            />
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-navy-700">{t("help.category")}</span>
              <select
                className="field"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORY_IDS.map((id) => (
                  <option key={id} value={id}>
                    {catLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-navy-700">{t("help.whatsGoingOn")}</span>
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
                {t("help.send")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("confirm.cancel")}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <p className="eyebrow mb-2">{t("help.yourQuestions")}</p>
        {loading && !data ? (
          <LoadingScreen label={t("ui.loading")} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : !data?.tickets.length ? (
          <EmptyState emoji="💬" title={t("help.nothingTitle")} message={t("help.nothingBody")} />
        ) : (
          <ul className="card divide-y divide-paper-line">
            {data.tickets.map((tk) => {
              return (
                <li key={tk.id}>
                  <Link
                    to={`/help/${tk.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-navy/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{tk.subject}</p>
                      <p className="text-xs text-navy-400">
                        {catLabel(tk.category)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[tk.status]}`}>
                      {t(`help.status.${tk.status}` as Key)}
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
