import { useEffect, useState } from "react";
import { AdminApiError, cc } from "../api";
import { useResource } from "../lib";
import { Badge, Btn, ErrorNote, Field, Input, Loading, Pager, Panel, Select, Table, Td, Th, Tr, fmtDate, fmtNum } from "../ui";

function errText(e: unknown): string {
  if (e instanceof AdminApiError) {
    const d = e.details as { blockers?: string[]; reasons?: { message: string }[] } | undefined;
    const extra = d?.blockers?.join(" ") || d?.reasons?.map((r) => r.message).join(" ");
    return extra ? `${e.message} ${extra}` : e.message;
  }
  return e instanceof Error ? e.message : "Mislukt.";
}

/* ------------------------------- campaign -------------------------------- */

interface CampaignPreview {
  mode: "test" | "live";
  approvedTotal: number;
  checked: number;
  ready: number;
  skippedCount: number;
  skipped: { id: string; toEmail: string; org: string | null; reasons: { code: string; message: string }[] }[];
  sample: { id: string; toEmail: string; org: string | null }[];
  warnings: string[];
  pace: { perRun: number; everyMinutes: number; dailyCap: number; perDay: number };
  estimatedDays: number;
}
interface CampaignRow {
  id: string;
  name: string;
  status: string;
  testMode: boolean;
  total: number;
  sent: number;
  pending: number;
  failed: number;
  cancelled: number;
  createdAt: number;
}

export function OutreachCampaign({ onChanged }: { onChanged: () => void }) {
  const preview = useResource<CampaignPreview>(() => cc<CampaignPreview>("/outreach/campaign/preview"), "camp-preview");
  const list = useResource<{ rows: CampaignRow[] }>(() => cc<{ rows: CampaignRow[] }>("/outreach/campaigns"), "camp-list");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setNotice(null);
    try {
      const m = await fn();
      if (m) setNotice(m);
      preview.reload();
      list.reload();
      onChanged();
    } catch (e) {
      setNotice(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const p = preview.data;
  return (
    <div className="space-y-4">
      <Panel
        title="Gecontroleerde lanceringscampagne"
        subtitle="Alleen berichten die je afzonderlijk hebt goedgekeurd en die nog niet verzonden zijn, komen in de wachtrij. Elk bericht wordt vlak voor verzending opnieuw gecontroleerd."
        right={<Btn onClick={() => preview.reload()}>Vernieuwen</Btn>}
      >
        {preview.error && <ErrorNote message={preview.error} onRetry={preview.reload} />}
        {preview.loading && !p && <Loading />}
        {p && (
          <div className="space-y-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={p.mode === "live" ? "red" : "blue"}>{p.mode === "live" ? "LIVE" : "TESTMODUS"}</Badge>
              <span>
                <b>{fmtNum(p.approvedTotal)}</b> goedgekeurd · <b>{fmtNum(p.ready)}</b> klaar · <b>{fmtNum(p.skippedCount)}</b> overgeslagen
              </span>
              <span className="text-slate-500">
                Tempo: {p.pace.perRun} per {p.pace.everyMinutes} min, max {p.pace.dailyCap} per dag
                {p.estimatedDays > 0 ? ` (± ${p.estimatedDays} dag${p.estimatedDays === 1 ? "" : "en"})` : ""}
              </span>
            </div>
            {p.warnings.length > 0 && (
              <ul className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                {p.warnings.map((w) => <li key={w}>⚠ {w}</li>)}
              </ul>
            )}
            {p.skipped.length > 0 && (
              <details open>
                <summary className="cursor-pointer font-semibold text-slate-700">Overgeslagen ({p.skippedCount})</summary>
                <ul className="mt-1 space-y-1">
                  {p.skipped.map((s) => (
                    <li key={s.id} className="text-slate-600">
                      <span className="font-mono text-xs">{s.toEmail}</span> {s.org ? `(${s.org})` : ""}:{" "}
                      <span className="text-rose-600">{s.reasons.map((r) => r.message).join(" ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details>
              <summary className="cursor-pointer font-semibold text-slate-700">Ontvangers die verzonden worden ({p.ready})</summary>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                {p.sample.map((s) => <li key={s.id}><span className="font-mono">{s.toEmail}</span> {s.org ? `· ${s.org}` : ""}</li>)}
                {p.ready > p.sample.length && <li className="text-slate-400">… en {p.ready - p.sample.length} meer</li>}
              </ul>
            </details>
            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <Field label="Naam van de campagne">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bv. Lancering Vlaanderen — golf 1" className="w-72" />
              </Field>
              <Btn
                variant="primary"
                disabled={busy || p.approvedTotal === 0 || name.trim().length < 2}
                onClick={() => {
                  const live = p.mode === "live";
                  const msg = `${live ? "ECHTE" : "TEST-"}campagne starten?\n\n${p.approvedTotal} goedgekeurd, ${p.skippedCount} worden overgeslagen.\nTempo: ${p.pace.perRun} per ${p.pace.everyMinutes} min, max ${p.pace.dailyCap} per dag.`;
                  if (!window.confirm(msg)) return;
                  void act(async () => {
                    await cc("/outreach/campaign/start", { method: "POST", body: { name: name.trim(), expectedCount: p.approvedTotal } });
                    setName("");
                    return "Campagne gestart. Berichten worden gedoseerd verzonden.";
                  });
                }}
              >
                Campagne starten
              </Btn>
            </div>
          </div>
        )}
        {notice && <p className="mt-2 text-[13px] text-slate-800">{notice}</p>}
      </Panel>

      <Panel title="Campagnes" bodyClassName="">
        {list.loading && !list.data && <Loading />}
        {list.data && (
          <Table>
            <thead>
              <tr><Th>Naam</Th><Th>Status</Th><Th>Verzonden</Th><Th>In wachtrij</Th><Th>Fout</Th><Th>Gestart</Th><Th /></tr>
            </thead>
            <tbody>
              {list.data.rows.length === 0 && <tr><Td className="py-6 text-center text-slate-400">Nog geen campagnes.</Td></tr>}
              {list.data.rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.name} {r.testMode && <Badge tone="blue">test</Badge>}</Td>
                  <Td><Badge tone={r.status === "running" ? "lime" : r.status === "done" ? "green" : "slate"}>{r.status}</Badge></Td>
                  <Td>{r.sent} / {r.total}</Td>
                  <Td>{r.pending}</Td>
                  <Td>{r.failed}</Td>
                  <Td className="text-xs text-slate-500">{fmtDate(r.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {r.status === "running" && <Btn className="!px-2 !py-1" disabled={busy} onClick={() => act(async () => { await cc(`/outreach/campaigns/${r.id}/run-now`, { method: "POST", body: {} }); return "Batch verwerkt."; })}>Nu verwerken</Btn>}
                      {r.status === "running" && <Btn className="!px-2 !py-1" disabled={busy} onClick={() => act(async () => { await cc(`/outreach/campaigns/${r.id}/pause`, { method: "POST", body: {} }); })}>Pauzeren</Btn>}
                      {r.status === "paused" && <Btn className="!px-2 !py-1" disabled={busy} onClick={() => act(async () => { await cc(`/outreach/campaigns/${r.id}/resume`, { method: "POST", body: {} }); })}>Hervatten</Btn>}
                      {(r.status === "running" || r.status === "paused") && (
                        <Btn variant="danger" className="!px-2 !py-1" disabled={busy} onClick={() => window.confirm("Campagne annuleren? Wat nog in de wachtrij staat wordt geannuleerd.") && act(async () => { await cc(`/outreach/campaigns/${r.id}/cancel`, { method: "POST", body: {} }); })}>Annuleren</Btn>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

/* ----------------------------- suppressions ------------------------------ */

interface SuppRow { id: string; kind: string; value: string; reason: string; note: string | null; createdAt: number }
const REASON_LABEL: Record<string, string> = { opt_out: "Afmelding / bezwaar", bounce: "Bounce", complaint: "Klacht", manual: "Handmatig", legal: "Juridisch" };

export function OutreachSuppressions() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useResource<{ rows: SuppRow[]; total: number; page: number; pageCount: number }>(
    () => cc(`/outreach/suppressions?q=${encodeURIComponent(q)}&page=${page}`),
    `supp-${q}-${page}`,
  );
  const [kind, setKind] = useState("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("manual");
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Panel title="Toevoegen aan de uitsluitingslijst" subtitle="Adressen of domeinen op deze lijst krijgen nooit een bericht. Afmeldingen en klachten kunnen niet worden verwijderd.">
        <div className="flex flex-wrap items-end gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="email">E-mailadres</option>
            <option value="domain">Heel domein</option>
          </Select>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "email" ? "info@voorbeeld.be" : "voorbeeld.be"} className="w-64" />
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Btn
            variant="primary"
            disabled={value.trim().length < 3}
            onClick={async () => {
              try {
                const r = await cc<{ cancelled: number }>("/outreach/suppressions", { method: "POST", body: { kind, value, reason } });
                setValue("");
                setNotice(`Toegevoegd. ${r.cancelled} openstaand(e) bericht(en) geannuleerd.`);
                reload();
              } catch (e) {
                setNotice(errText(e));
              }
            }}
          >
            Toevoegen
          </Btn>
        </div>
        {notice && <p className="mt-2 text-[13px] text-slate-800">{notice}</p>}
      </Panel>

      <Panel
        title="Uitsluitingslijst"
        bodyClassName=""
        right={<Input placeholder="zoeken…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-52" />}
      >
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {data && (
          <>
            <Table>
              <thead><tr><Th>Waarde</Th><Th>Soort</Th><Th>Reden</Th><Th>Notitie</Th><Th>Sinds</Th><Th /></tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><Td className="py-6 text-center text-slate-400">De lijst is leeg.</Td></tr>}
                {data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td mono>{r.value}</Td>
                    <Td>{r.kind === "email" ? "adres" : "domein"}</Td>
                    <Td><Badge tone={r.reason === "opt_out" || r.reason === "complaint" ? "red" : "slate"}>{REASON_LABEL[r.reason] ?? r.reason}</Badge></Td>
                    <Td className="text-xs text-slate-500">{r.note ?? ""}</Td>
                    <Td className="text-xs text-slate-500">{fmtDate(r.createdAt)}</Td>
                    <Td>
                      {r.reason !== "opt_out" && r.reason !== "complaint" && (
                        <Btn
                          variant="ghost"
                          className="!px-2 !py-1"
                          onClick={async () => {
                            if (!window.confirm(`${r.value} van de lijst verwijderen?`)) return;
                            try { await cc(`/outreach/suppressions/${r.id}`, { method: "DELETE" }); reload(); } catch (e) { setNotice(errText(e)); }
                          }}
                        >
                          Verwijderen
                        </Btn>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------- settings -------------------------------- */

interface Config {
  mode: "test" | "live";
  testInbox: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  contactAddress: string;
  websiteUrl: string;
  senderIdentity: string;
  subject: string;
  body: string;
  bodyMulti: string;
  legalReview: { status: "not_reviewed" | "approved"; reviewedAt: number | null; note: string };
  dailyCap: number;
  perRun: number;
  autoDiscovery: boolean;
  discoveryPerRun: number;
}
interface ConfigResp {
  config: Config;
  readiness: { ready: boolean; blockers: string[] };
  runtime: { appEnv: string; hasProviderKey: boolean; hasSigningKey: boolean; realDeliveryPossible: boolean };
}

export function OutreachSettings({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useResource<ConfigResp>(() => cc<ConfigResp>("/outreach/config"), "outreach-config");
  const [form, setForm] = useState<Config | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [legalNote, setLegalNote] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setForm(data.config);
  }, [data]);

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  if (!data || !form) return null;
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setForm({ ...form, [k]: v });
  const live = data.config.mode === "live";

  const save = async (patch: Partial<Config>, okMsg: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await cc("/outreach/config", { method: "PUT", body: patch });
      setNotice(okMsg);
      reload();
      onChanged();
    } catch (e) {
      setNotice(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800">{notice}</p>}

      <Panel title="Verzendmodus" subtitle="Echte verzending staat standaard uit. In ontwikkel- en testomgevingen wordt nooit een externe e-mailprovider aangesproken.">
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={live ? "red" : "blue"}>{live ? "LIVE" : "TESTMODUS"}</Badge>
            <span>Omgeving: <b>{data.runtime.appEnv}</b></span>
            <span>E-mailprovider-sleutel: <b>{data.runtime.hasProviderKey ? "aanwezig" : "ontbreekt"}</b></span>
            <span>Sleutel voor afmeldlinks: <b>{data.runtime.hasSigningKey ? "aanwezig" : "ontbreekt"}</b></span>
          </div>
          {!data.readiness.ready && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <p className="font-semibold">Voordat echte verzending kan:</p>
              <ul className="ml-4 list-disc">{data.readiness.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!live ? (
              <Btn
                variant="danger"
                disabled={busy || !data.readiness.ready}
                onClick={() => window.confirm("Overschakelen naar ECHTE verzending? Goedgekeurde berichten kunnen daarna echt worden verzonden. Eerder voorbereide testberichten moeten opnieuw worden voorbereid.") &&
                  save({ mode: "live" }, "Echte verzending is ingeschakeld.")}
              >
                Echte verzending inschakelen
              </Btn>
            ) : (
              <Btn disabled={busy} onClick={() => save({ mode: "test" }, "Terug in testmodus.")}>Terug naar testmodus</Btn>
            )}
            <Btn
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("Alle testberichten en testcampagnes wissen? Echte berichten blijven ongemoeid.")) return;
                try {
                  const r = await cc<{ removed: number }>("/outreach/test-reset", { method: "POST", body: {} });
                  setNotice(`${r.removed} testbericht(en) gewist.`);
                  onChanged();
                } catch (e) {
                  setNotice(errText(e));
                }
              }}
            >
              Testberichten wissen
            </Btn>
          </div>
        </div>
      </Panel>

      <Panel title="Testmail" subtitle="Stuurt één gewone testmail vanaf het ingestelde afzenderadres naar het adres dat je hier typt — zo controleer je dat versturen werkt.">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="jouw@adres.be" className="w-64" />
          <Btn
            variant="primary"
            disabled={busy || !testTo.includes("@")}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await cc<{ from: string; mock: boolean }>("/outreach/test-email", { method: "POST", body: { to: testTo } });
                setNotice(r.mock ? `Testomgeving: er is niets echt verzonden (mock).` : `Testmail verzonden vanaf ${r.from} naar ${testTo}. Controleer je inbox (en spam).`);
              } catch (e) {
                setNotice(errText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Testmail sturen
          </Btn>
        </div>
      </Panel>

      <Panel title="Juridische controle" subtitle="LEGAL REVIEW REQUIRED — deze tool geeft geen juridisch advies en is niet juridisch goedgekeurd tot jij dat hier vastlegt.">
        <div className="space-y-2 text-[13px]">
          {data.config.legalReview.status === "approved" ? (
            <>
              <p>
                <Badge tone="green">bevestigd</Badge> op {fmtDate(data.config.legalReview.reviewedAt)} — {data.config.legalReview.note}
              </p>
              <Btn
                disabled={busy}
                onClick={async () => {
                  try {
                    await cc("/outreach/legal-review", { method: "POST", body: { approved: false, note: "ingetrokken" } });
                    setNotice("Bevestiging ingetrokken; echte verzending staat weer uit.");
                    reload();
                    onChanged();
                  } catch (e) { setNotice(errText(e)); }
                }}
              >
                Bevestiging intrekken
              </Btn>
            </>
          ) : (
            <>
              <p className="text-slate-600">
                Documenteer hier wie de regels voor direct marketing per e-mail (Belgisch Wetboek van economisch recht, e-Privacyrichtlijn, AVG) heeft
                beoordeeld voor dit type ontvangers (algemene zakelijke adressen van organisaties) en op welke basis.
              </p>
              <Input value={legalNote} onChange={(e) => setLegalNote(e.target.value)} placeholder="Wie, wanneer en op welke basis is dit beoordeeld?" className="w-full" />
              <Btn
                disabled={busy || legalNote.trim().length < 10}
                onClick={async () => {
                  try {
                    await cc("/outreach/legal-review", { method: "POST", body: { approved: true, note: legalNote } });
                    setLegalNote("");
                    setNotice("Juridische controle vastgelegd.");
                    reload();
                    onChanged();
                  } catch (e) { setNotice(errText(e)); }
                }}
              >
                Juridische controle bevestigen
              </Btn>
            </>
          )}
        </div>
      </Panel>

      <Panel title="Afzender en contactgegevens" subtitle="Nodig voor echte verzending. Er worden geen waarden verzonnen: laat leeg wat je niet weet.">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Naam afzender"><Input className="w-full" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} /></Field>
          <Field label="Afzenderadres" hint="Adres op een gevalideerd verzenddomein (bij voorkeur een apart subdomein voor outreach)."><Input className="w-full" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} /></Field>
          <Field label="Reply-to"><Input className="w-full" value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} /></Field>
          <Field label="Officieel contactadres van VIBIN" hint="Komt onderaan de mail."><Input className="w-full" value={form.contactAddress} onChange={(e) => set("contactAddress", e.target.value)} /></Field>
          <Field label="Officiële website" hint="https://…"><Input className="w-full" value={form.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} /></Field>
          <Field label="Testinbox" hint="Testberichten gaan uitsluitend hierheen. Leeg = dry-run (er wordt niets verzonden)."><Input className="w-full" value={form.testInbox} onChange={(e) => set("testInbox", e.target.value)} /></Field>
          <div className="md:col-span-2">
            <Field label="Identiteit van de afzender" hint="Bedrijfsnaam, adres en ondernemingsnummer zoals ze onderaan elke mail komen. Verplicht voor echte verzending.">
              <textarea
                value={form.senderIdentity}
                onChange={(e) => set("senderIdentity", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[13px]"
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Tekst van de kennismakingsmail" subtitle="{{provider}}, {{website}} en {{contact}} worden ingevuld; {{activity}} (één activiteit) of {{activities}} (lijst) noemt de activiteiten. De afmeldregel en je identiteit worden altijd onderaan toegevoegd.">
        <div className="space-y-3">
          <Field label="Onderwerp"><Input className="w-full" value={form.subject} onChange={(e) => set("subject", e.target.value)} /></Field>
          <Field label="Tekst bij één activiteit ({{activity}})">
            <textarea
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={16}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 font-mono text-[12px]"
            />
          </Field>
          <Field label="Tekst bij meerdere activiteiten ({{activities}})">
            <textarea
              value={form.bodyMulti}
              onChange={(e) => set("bodyMulti", e.target.value)}
              rows={16}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 font-mono text-[12px]"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Tempo en limieten">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Berichten per run (30 min)"><Input type="number" min={1} max={50} className="w-full" value={form.perRun} onChange={(e) => set("perRun", Number(e.target.value))} /></Field>
          <Field label="Daglimiet echte berichten"><Input type="number" min={1} max={500} className="w-full" value={form.dailyCap} onChange={(e) => set("dailyCap", Number(e.target.value))} /></Field>
          <Field label="Websites per run controleren"><Input type="number" min={1} max={25} className="w-full" value={form.discoveryPerRun} onChange={(e) => set("discoveryPerRun", Number(e.target.value))} /></Field>
          <label className="mt-6 flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={form.autoDiscovery} onChange={(e) => set("autoDiscovery", e.target.checked)} />
            Automatisch websites controleren
          </label>
        </div>
      </Panel>

      <div>
        <Btn
          variant="primary"
          disabled={busy}
          onClick={() =>
            save(
              {
                testInbox: form.testInbox,
                fromName: form.fromName,
                fromEmail: form.fromEmail,
                replyTo: form.replyTo,
                contactAddress: form.contactAddress,
                websiteUrl: form.websiteUrl,
                senderIdentity: form.senderIdentity,
                subject: form.subject,
                body: form.body,
                bodyMulti: form.bodyMulti,
                dailyCap: form.dailyCap,
                perRun: form.perRun,
                autoDiscovery: form.autoDiscovery,
                discoveryPerRun: form.discoveryPerRun,
              },
              "Instellingen opgeslagen.",
            )
          }
        >
          Instellingen opslaan
        </Btn>
      </div>
    </div>
  );
}

/* ----------------------------- import / export --------------------------- */

interface ImportPreview {
  total: number;
  willAdd: number;
  counts: Record<string, number>;
  sample: { line: number; domain: string; email: string; result: string; message: string }[];
  preview: { line: number; domain: string; email: string; sourceUrl: string }[];
}

export function OutreachImport({ onChanged }: { onChanged: () => void }) {
  const [csv, setCsv] = useState("");
  const [prev, setPrev] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <Panel title="Exporteren" subtitle="Alle aanbieders met hun primaire adres, bron, verificatie en verzendstatus.">
        <a
          href="/api/admin/cc/outreach/export.csv"
          className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          CSV downloaden
        </a>
      </Panel>
      <Panel
        title="Contactadressen importeren"
        subtitle="Kolommen: domain (of website), email, source_url — optioneel kind (generic/personal/unknown) en note. Bestaande gegevens worden nooit overschreven; geïmporteerde adressen starten als ‘ongeverifieerd’."
      >
        <div className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCsv(await f.text());
                setPrev(null);
              }
            }}
          />
          <textarea
            value={csv}
            onChange={(e) => { setCsv(e.target.value); setPrev(null); }}
            rows={6}
            placeholder={"domain,email,source_url\nvoorbeeld.be,info@voorbeeld.be,https://voorbeeld.be/contact"}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 font-mono text-[12px]"
          />
          <div className="flex gap-2">
            <Btn
              disabled={busy || csv.trim().length < 10}
              onClick={async () => {
                setBusy(true);
                setNotice(null);
                try {
                  setPrev(await cc<ImportPreview>("/outreach/import/preview", { method: "POST", body: { csv } }));
                } catch (e) {
                  setNotice(errText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Voorvertoning
            </Btn>
            {prev && prev.willAdd > 0 && (
              <Btn
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`${prev.willAdd} adres(sen) toevoegen? Er wordt niets overschreven.`)) return;
                  setBusy(true);
                  try {
                    const r = await cc<{ added: number }>("/outreach/import/confirm", { method: "POST", body: { csv, expectedNew: prev.willAdd } });
                    setNotice(`${r.added} adres(sen) toegevoegd.`);
                    setPrev(null);
                    setCsv("");
                    onChanged();
                  } catch (e) {
                    setNotice(errText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {prev.willAdd} toevoegen
              </Btn>
            )}
          </div>
          {notice && <p className="text-[13px] text-slate-800">{notice}</p>}
          {prev && (
            <div className="space-y-2 text-[13px]">
              <p>
                {prev.total} rijen: <b>{prev.willAdd}</b> nieuw
                {Object.entries(prev.counts).filter(([k]) => k !== "new").map(([k, v]) => `, ${v} ${k}`).join("")}
              </p>
              {prev.sample.length > 0 && (
                <ul className="space-y-0.5 text-xs text-slate-600">
                  {prev.sample.map((s) => (
                    <li key={s.line}>regel {s.line}: <span className="font-mono">{s.email || s.domain}</span> — {s.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
