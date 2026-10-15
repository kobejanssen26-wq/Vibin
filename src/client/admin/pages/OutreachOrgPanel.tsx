import { useEffect, useState } from "react";
import { AdminApiError, cc } from "../api";
import { useResource } from "../lib";
import { Badge, Btn, ErrorNote, Field, Input, Loading, Select, fmtDate } from "../ui";
import { MSG_LABEL, MSG_TONE, VERIFY_LABEL, VERIFY_TONE } from "./OutreachShared";

interface Detail {
  org: {
    id: string;
    name: string;
    domain: string;
    websiteUrl: string;
    activityCount: number;
    discoveryStatus: string;
    discoveryNote: string | null;
    excluded: boolean;
    excludedReason: string | null;
  };
  activities: { id: string; title: string; city: string | null; websiteUrl: string | null; webStatus: string | null }[];
  contacts: {
    id: string;
    email: string;
    kind: string;
    verification: string;
    sourceType: string;
    sourceUrl: string | null;
    domainMatches: number;
    mxOk: number | null;
    isPrimary: number;
    suppressed: boolean;
    note: string | null;
  }[];
  messages: {
    id: string;
    contactId: string | null;
    toEmail: string;
    subject: string;
    status: string;
    testMode: number;
    approvedAt: number | null;
    sentAt: number | null;
    error: string | null;
    createdAt: number;
  }[];
  events: { id: string; kind: string; body: string; createdAt: number }[];
  warnings: string[];
}
interface Preview {
  id: string;
  status: string;
  testMode: boolean;
  toEmail: string;
  subject: string;
  bodyText: string;
  finalText: string;
  hash: string;
  mode: "test" | "live";
  testInbox: string | null;
  blockers: { code: string; message: string }[];
  canApprove: boolean;
}

const EVENT_LABEL: Record<string, string> = {
  reply: "Antwoord ontvangen",
  note: "Notitie",
  bounce: "Bounce",
  complaint: "Klacht",
  opt_out: "Bezwaar / afmelding",
  excluded: "Uitsluiting",
  contact_edited: "Contact aangepast",
};

function errText(e: unknown): string {
  if (e instanceof AdminApiError) {
    const r = (e.details as { reasons?: { message: string }[]; blockers?: string[] } | undefined);
    const extra = r?.reasons?.map((x) => x.message).join(" ") || r?.blockers?.join(" ");
    return extra && !e.message.includes(extra) ? `${e.message} ${extra}` : e.message;
  }
  return e instanceof Error ? e.message : "Mislukt.";
}

export function OrgPanel({ orgId, onClose, onChanged }: { orgId: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useResource<Detail>(() => cc<Detail>(`/outreach/orgs/${orgId}`), `org-${orgId}`);
  const [msgId, setMsgId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(null);
    try {
      const m = await fn();
      if (m) setNotice(m);
      reload();
      onChanged();
    } catch (e) {
      setNotice(errText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // open the most recent actionable message automatically
  useEffect(() => {
    if (!data || msgId) return;
    const m = data.messages.find((x) => ["draft", "approved", "failed", "queued"].includes(x.status));
    if (m) setMsgId(m.id);
  }, [data, msgId]);

  const [newEmail, setNewEmail] = useState("");
  const [newSource, setNewSource] = useState("");
  const [eventKind, setEventKind] = useState("reply");
  const [eventBody, setEventBody] = useState("");
  const [exclReason, setExclReason] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Aanbieder"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">{data?.org.name ?? "…"}</h2>
            {data && (
              <a
                href={/^https?:/i.test(data.org.websiteUrl) ? data.org.websiteUrl : `https://${data.org.websiteUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:underline"
              >
                {data.org.domain} ↗
              </a>
            )}
          </div>
          <Btn variant="ghost" onClick={onClose}>Sluiten ✕</Btn>
        </div>

        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {notice && <p className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800">{notice}</p>}

        {data && (
          <div className="space-y-4">
            {data.warnings.length > 0 && (
              <ul className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                {data.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
              </ul>
            )}

            <Section title="Activiteiten">
              <ul className="space-y-1 text-[13px]">
                {data.activities.map((a) => (
                  <li key={a.id} className="text-slate-700">
                    {a.title}
                    {a.city ? <span className="text-slate-400"> · {a.city}</span> : null}
                    {a.webStatus && a.webStatus !== "alive" ? <span className="ml-1 text-xs text-amber-600">({a.webStatus})</span> : null}
                  </li>
                ))}
                {data.org.activityCount > data.activities.length && (
                  <li className="text-xs text-slate-400">+{data.org.activityCount - data.activities.length} meer</li>
                )}
              </ul>
            </Section>

            <Section title="Contactadressen">
              {data.contacts.length === 0 && (
                <p className="text-[13px] text-slate-500">
                  Geen adres bekend ({data.org.discoveryNote ?? data.org.discoveryStatus}). Voeg er hieronder één toe met de bron.
                </p>
              )}
              <div className="space-y-2">
                {data.contacts.map((c) => (
                  <div key={c.id} className="rounded-md border border-slate-200 bg-white p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px]">{c.email}</span>
                      {c.isPrimary ? <Badge tone="blue">primair</Badge> : null}
                      {c.suppressed ? <Badge tone="red">op uitsluitingslijst</Badge> : null}
                      {c.mxOk === 0 ? <Badge tone="red">domein ontvangt geen mail</Badge> : null}
                      {!c.domainMatches ? <Badge tone="amber">ander domein dan website</Badge> : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <Select value={c.kind} onChange={(e) => act(async () => { await cc(`/outreach/contacts/${c.id}`, { method: "PUT", body: { kind: e.target.value } }); })}>
                        <option value="generic">Algemeen zakelijk adres</option>
                        <option value="personal">Persoonlijk adres</option>
                        <option value="unknown">Onbekend</option>
                      </Select>
                      <Select
                        value={c.verification}
                        onChange={(e) => act(async () => { await cc(`/outreach/contacts/${c.id}`, { method: "PUT", body: { verification: e.target.value } }); })}
                      >
                        {Object.entries(VERIFY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                      <Badge tone={(VERIFY_TONE[c.verification] ?? "slate") as never}>{VERIFY_LABEL[c.verification]}</Badge>
                      {c.sourceUrl && (
                        <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                          Bron openen ↗
                        </a>
                      )}
                      {!c.isPrimary && (
                        <Btn variant="ghost" className="!px-2 !py-0.5" onClick={() => act(async () => { await cc(`/outreach/contacts/${c.id}`, { method: "PUT", body: { isPrimary: true } }); })}>
                          Primair maken
                        </Btn>
                      )}
                      <Btn
                        variant="ghost"
                        className="!px-2 !py-0.5 text-rose-600"
                        onClick={() => window.confirm(`Adres ${c.email} verwijderen? Concepten voor dit adres worden geannuleerd.`) && act(async () => { await cc(`/outreach/contacts/${c.id}`, { method: "DELETE" }); })}
                      >
                        Verwijderen
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Input placeholder="e-mailadres" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                <Input placeholder="bron-URL (pagina waar je het adres zag)" value={newSource} onChange={(e) => setNewSource(e.target.value)} />
                <Btn
                  disabled={!newEmail || !newSource || busy}
                  onClick={() => act(async () => {
                    await cc(`/outreach/orgs/${orgId}/contacts`, { method: "POST", body: { email: newEmail, sourceUrl: newSource } });
                    setNewEmail("");
                    setNewSource("");
                    return "Adres toegevoegd (ongeverifieerd: controleer de bron en markeer het daarna als gecontroleerd).";
                  })}
                >
                  Toevoegen
                </Btn>
              </div>
            </Section>

            <Section title="E-mail">
              {msgId ? (
                <MessagePreview
                  key={msgId}
                  messageId={msgId}
                  onChanged={() => { reload(); onChanged(); }}
                  onGone={() => setMsgId(null)}
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] text-slate-600">Nog geen concept voor deze aanbieder.</p>
                  <Btn
                    variant="primary"
                    disabled={busy || data.contacts.length === 0 || data.org.excluded}
                    onClick={() => act(async () => {
                      const r = await cc<{ messageId: string }>(`/outreach/orgs/${orgId}/prepare`, { method: "POST", body: {} });
                      setMsgId(r.messageId);
                    })}
                  >
                    Concept voorbereiden
                  </Btn>
                </div>
              )}
            </Section>

            <Section title="Verzendgeschiedenis en antwoorden">
              <ul className="space-y-1.5 text-[13px]">
                {data.messages.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <Badge tone={(MSG_TONE[m.status] ?? "slate") as never}>{MSG_LABEL[m.status]}{m.testMode ? " (test)" : ""}</Badge>
                    <span className="font-mono text-xs">{m.toEmail}</span>
                    <span className="text-xs text-slate-400">{fmtDate(m.sentAt ?? m.createdAt)}</span>
                    {m.error && <span className="text-xs text-rose-600">{m.error}</span>}
                    <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setMsgId(m.id)}>bekijken</button>
                  </li>
                ))}
                {data.events.map((ev) => (
                  <li key={ev.id} className="text-slate-700">
                    <span className="font-semibold">{EVENT_LABEL[ev.kind] ?? ev.kind}</span>{" "}
                    <span className="text-xs text-slate-400">{fmtDate(ev.createdAt)}</span>
                    {ev.body && <div className="whitespace-pre-wrap text-xs text-slate-600">{ev.body}</div>}
                  </li>
                ))}
                {data.messages.length === 0 && data.events.length === 0 && <li className="text-slate-400">Nog niets.</li>}
              </ul>
              <div className="mt-3 grid gap-2 md:grid-cols-[170px_1fr_auto]">
                <Select value={eventKind} onChange={(e) => setEventKind(e.target.value)}>
                  <option value="reply">Antwoord ontvangen</option>
                  <option value="note">Notitie</option>
                  <option value="bounce">Bounce</option>
                  <option value="complaint">Klacht</option>
                  <option value="opt_out">Bezwaar / afmelding</option>
                </Select>
                <Input placeholder="wat is er gezegd / gebeurd?" value={eventBody} onChange={(e) => setEventBody(e.target.value)} />
                <Btn
                  disabled={busy}
                  onClick={() => {
                    if (["bounce", "complaint", "opt_out"].includes(eventKind) &&
                      !window.confirm("Dit zet het adres op de uitsluitingslijst en annuleert openstaande berichten. Doorgaan?")) return;
                    void act(async () => {
                      await cc(`/outreach/events`, { method: "POST", body: { orgId, kind: eventKind, body: eventBody } });
                      setEventBody("");
                      return "Vastgelegd.";
                    });
                  }}
                >
                  Vastleggen
                </Btn>
              </div>
            </Section>

            <Section title="Uitsluiten">
              {data.org.excluded ? (
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge tone="red">uitgesloten</Badge> {data.org.excludedReason}
                  <Btn onClick={() => act(async () => { await cc(`/outreach/orgs/${orgId}/exclude`, { method: "PUT", body: { excluded: false } }); })}>
                    Uitsluiting opheffen
                  </Btn>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input placeholder="reden (optioneel)" value={exclReason} onChange={(e) => setExclReason(e.target.value)} className="w-64" />
                  <Btn
                    variant="danger"
                    disabled={busy}
                    onClick={() => act(async () => {
                      const r = await cc<{ cancelled: number }>(`/outreach/orgs/${orgId}/exclude`, { method: "PUT", body: { excluded: true, reason: exclReason } });
                      return `Uitgesloten. ${r.cancelled} openstaande bericht(en) geannuleerd.`;
                    })}
                  >
                    Uitsluiten van outreach
                  </Btn>
                </div>
              )}
              <div className="mt-2">
                <Btn variant="ghost" disabled={busy || data.org.excluded} onClick={() => act(async () => { await cc(`/outreach/orgs/${orgId}/recheck`, { method: "POST", body: {} }); return "Staat weer in de wachtrij voor een nieuwe controle van de website."; })}>
                  Website opnieuw controleren
                </Btn>
              </div>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function MessagePreview({ messageId, onChanged, onGone }: { messageId: string; onChanged: () => void; onGone: () => void }) {
  const { data, loading, error, reload } = useResource<Preview>(() => cc<Preview>(`/outreach/messages/${messageId}`), `msg-${messageId}`);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setSubject(data.subject);
      setBody(data.bodyText);
    }
  }, [data?.id, data?.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const editable = data.status === "draft" || data.status === "approved";
  const dirty = subject !== data.subject || body !== data.bodyText;
  const sendable = editable && data.canApprove && !dirty;

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(null);
    try {
      const m = await fn();
      if (m) setNotice(m);
      reload();
      onChanged();
    } catch (e) {
      setNotice(errText(e));
      reload();
    } finally {
      setBusy(false);
    }
  };

  const target =
    data.mode === "live"
      ? `ECHT naar ${data.toEmail}`
      : data.testInbox
        ? `TEST: naar ${data.testInbox} (nooit naar ${data.toEmail})`
        : `DRY-RUN: er wordt niets verzonden`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone={(MSG_TONE[data.status] ?? "slate") as never}>{MSG_LABEL[data.status]}</Badge>
        {data.testMode ? <Badge tone="blue">testbericht</Badge> : <Badge tone="red">echt bericht</Badge>}
        <span className="text-slate-600">Aan: <span className="font-mono">{data.toEmail}</span></span>
      </div>

      {data.blockers.length > 0 && (
        <ul className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {data.blockers.map((b) => <li key={b.code + b.message}>⛔ {b.message}</li>)}
        </ul>
      )}

      <Field label="Onderwerp">
        <Input value={subject} disabled={!editable} onChange={(e) => setSubject(e.target.value)} className="w-full" />
      </Field>
      <Field label="Tekst (de afmeldregel en je bedrijfsgegevens worden automatisch toegevoegd)">
        <textarea
          value={body}
          disabled={!editable}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 font-mono text-[12px] text-slate-900 disabled:bg-slate-50"
        />
      </Field>
      <details className="rounded-md border border-slate-200 bg-white p-2.5">
        <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">Volledige e-mail zoals de ontvanger hem krijgt</summary>
        <pre className="mt-2 whitespace-pre-wrap text-[12px] text-slate-700">{data.finalText}</pre>
      </details>

      {notice && <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <Btn
            disabled={busy || !dirty}
            onClick={() => act(async () => {
              await cc(`/outreach/messages/${messageId}`, { method: "PUT", body: { subject, bodyText: body } });
              return "Opgeslagen. Eerdere goedkeuring is ingetrokken; bekijk en keur opnieuw goed.";
            })}
          >
            Wijzigingen opslaan
          </Btn>
        )}
        {editable && data.status === "draft" && (
          <Btn
            disabled={busy || !sendable}
            onClick={() => act(async () => {
              await cc(`/outreach/messages/${messageId}/approve`, { method: "POST", body: { hash: data.hash } });
              return "Goedgekeurd. Er is nog niets verzonden.";
            })}
          >
            Goedkeuren
          </Btn>
        )}
        {data.status === "approved" && (
          <Btn disabled={busy} onClick={() => act(async () => { await cc(`/outreach/messages/${messageId}/unapprove`, { method: "POST", body: {} }); })}>
            Goedkeuring intrekken
          </Btn>
        )}
        {editable && (
          <Btn
            variant="primary"
            disabled={busy || !sendable}
            onClick={() => {
              if (!window.confirm(`Goedkeuren en verzenden?\n\n${target}\nOnderwerp: ${data.subject}`)) return;
              void act(async () => {
                const r = await cc<{ test: boolean; dryRun: boolean }>(`/outreach/messages/${messageId}/send`, { method: "POST", body: { hash: data.hash } });
                return r.dryRun ? "Dry-run voltooid: er is niets verzonden." : r.test ? "Testbericht verzonden naar de testinbox." : "Verzonden.";
              });
            }}
          >
            Goedkeuren en verzenden
          </Btn>
        )}
        {data.status === "failed" && (
          <Btn disabled={busy} onClick={() => act(async () => { await cc(`/outreach/messages/${messageId}/retry`, { method: "POST", body: {} }); return "Klaar voor een nieuwe poging: bekijk en verstuur opnieuw."; })}>
            Opnieuw proberen
          </Btn>
        )}
        {["draft", "approved", "queued", "failed"].includes(data.status) && (
          <Btn variant="ghost" disabled={busy} onClick={() => act(async () => { await cc(`/outreach/messages/${messageId}/cancel`, { method: "POST", body: {} }); onGone(); })}>
            Annuleren
          </Btn>
        )}
      </div>
      <p className="text-[12px] text-slate-500">Verzendmodus: {target}</p>
    </div>
  );
}
