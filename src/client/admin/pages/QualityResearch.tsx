import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminApiError, cc } from "../api";
import { useDebounced, useResource } from "../lib";
import { Badge, Btn, ErrorNote, Input, Loading, Pager, Panel, Select, StatTile, Table, Td, Th, Tr, fmtNum } from "../ui";

const VERDICT_LABEL: Record<string, string> = {
  approved: "Goedgekeurd",
  fix_data: "Gegevens corrigeren",
  manual: "Handmatige controle",
  exclude: "Uitgesloten",
  duplicate: "Dubbel",
  closed: "Niet meer actief",
};
const VERDICT_TONE: Record<string, string> = { approved: "green", fix_data: "amber", manual: "blue", exclude: "red", duplicate: "slate", closed: "slate" };
const EXIST_LABEL: Record<string, string> = { confirmed: "bestaat (bevestigd)", unconfirmed: "niet bevestigd", closed: "gesloten", unknown: "onbekend" };
const METHOD_LABEL: Record<string, string> = { crawl: "website-controle", agent: "webonderzoek", owner: "eigenaar" };
const EV_LABEL: Record<string, string> = { verified: "geverifieerd", likely: "waarschijnlijk", unverified: "niet geverifieerd", conflict: "tegenstrijdig", not_found: "niet gevonden", invalid: "ongeldig" };
const EV_TONE: Record<string, string> = { verified: "green", likely: "blue", unverified: "slate", conflict: "red", not_found: "slate", invalid: "red" };
const SCOPE_LABEL: Record<string, string> = { activity: "alleen deze activiteit", location: "deze locatie", organisation: "hele organisatie" };
const REL_LABEL: Record<string, string> = { same_location: "zelfde locatie", different_locations: "verschillende locaties", unknown: "locatie onbekend" };
const FIELD_LABEL: Record<string, string> = { name: "Naam", address: "Adres", postcode: "Postcode", city: "Gemeente", website: "Website", offering: "Aanbod", price: "Prijs", opening: "Openingstijden", organisation: "Organisatie", existence: "Bestaat nu", website_url: "Website", title: "Naam", provider: "Aanbieder" };

interface Summary {
  active: number;
  unresearched: number;
  verdicts: Record<string, number>;
  methods: Record<string, number>;
  existence: Record<string, number>;
  contactEvidence: Record<string, number>;
  linkStatus: Record<string, number>;
  sharedEmails: number;
  pendingCorrections: number;
}
interface Row {
  id: string;
  title: string;
  city: string | null;
  subcategory: string | null;
  websiteUrl: string | null;
  status: string;
  verdict: string | null;
  existence: string | null;
  suitability: string | null;
  method: string | null;
  note: string | null;
  duplicateOf: string | null;
  emails: number;
  sharedEmail: boolean;
  hasCorrections: boolean;
}
interface ListResp {
  rows: Row[];
  total: number;
  page: number;
  pageCount: number;
}
interface EvItem { field: string; found: string; verified: string; status: string; sourceUrl: string; quote: string; note: string; machineChecked?: boolean }
interface Correction { field: string; from: string; to: string; sourceUrl: string; quote: string; confidence: string; verified?: boolean }
interface Detail {
  activity: { id: string; title: string; provider: string | null; subcategory: string | null; address: string | null; city: string | null; websiteUrl: string | null; status: string; active: number; blurb: string };
  research: { verdict: string; existence: string; suitability: string; method: string; note: string; researchedAt: number; duplicateOf: string | null; evidence: EvItem[]; sources: { url: string; kind: string; checkedAt: string }[]; corrections: Correction[] } | null;
  audit: { outcome: string; rule: string; reason: string; source: string; hidden: number } | null;
  contacts: {
    contactId: string;
    email: string;
    role: string;
    scope: string;
    linkStatus: string;
    linkSource: string;
    linkEvidenceUrl: string | null;
    evidenceStatus: string;
    evidenceUrl: string | null;
    evidenceNote: string | null;
    relation: string | null;
    sharedWith: { id: string; title: string; city: string | null; scope: string; status: string; distanceM: number | null }[];
  }[];
}

const errText = (e: unknown) => (e instanceof AdminApiError || e instanceof Error ? e.message : "Mislukt.");
const when = (s: number | null | undefined) => (s ? new Date(s * 1000).toLocaleDateString("nl-BE") : "—");

export function ResearchTab() {
  const summary = useResource<Summary>(() => cc<Summary>("/quality/research/summary"), "research-summary");
  const [verdict, setVerdict] = useState("");
  const [filter, setFilter] = useState("");
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 350);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const key = `${verdict}|${filter}|${q}|${page}`;
  const list = useResource<ListResp>(
    () => cc<ListResp>(`/quality/research/list?verdict=${verdict}&filter=${filter}&q=${encodeURIComponent(q)}&page=${page}`),
    key,
  );
  const s = summary.data;
  const researched = s ? s.active - s.unresearched : 0;
  const pick = (v: string, f: string) => {
    setVerdict(v);
    setFilter(f);
    setPage(1);
  };
  return (
    <>
      <p className="mb-3 max-w-3xl text-[13px] text-slate-600">
        Per activiteit: wat er al stond, wat via een bron is <b>geverifieerd</b>, wat <b>onzeker</b> blijft en welke <b>correcties</b> worden voorgesteld. Niets wordt samengevoegd: activiteiten,
        locaties en e-mailadressen blijven afzonderlijk zichtbaar.
      </p>
      {summary.error && <ErrorNote message={summary.error} onRetry={summary.reload} />}
      {summary.loading && !s && <Loading />}
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <StatTile label="Actieve activiteiten" value={fmtNum(s.active)} onClick={() => pick("", "")} />
          <StatTile label="Onderzocht" value={`${fmtNum(researched)} (${s.active ? Math.round((researched / s.active) * 100) : 0}%)`} />
          <StatTile label="Niet onderzocht" value={fmtNum(s.unresearched)} onClick={() => pick("", "unresearched")} />
          <StatTile label="Goedgekeurd" value={fmtNum(s.verdicts.approved ?? 0)} onClick={() => pick("approved", "")} />
          <StatTile label="Correctie nodig" value={fmtNum(s.verdicts.fix_data ?? 0)} onClick={() => pick("fix_data", "")} />
          <StatTile label="Handmatig" value={fmtNum(s.verdicts.manual ?? 0)} onClick={() => pick("manual", "")} />
          <StatTile label="Voorgestelde correcties" value={fmtNum(s.pendingCorrections)} onClick={() => pick("", "corrections")} />
          <StatTile label="Gedeelde e-mailadressen" value={fmtNum(s.sharedEmails)} onClick={() => pick("", "shared_email")} />
        </div>
      )}
      {s && (
        <p className="mb-3 text-[12px] text-slate-500">
          Onderzoeksmethode: {Object.entries(s.methods).map(([k, v]) => `${fmtNum(v)} ${METHOD_LABEL[k] ?? k}`).join(" · ") || "—"}. E-mailadressen: {" "}
          {Object.entries(s.contactEvidence).map(([k, v]) => `${fmtNum(v)} ${EV_LABEL[k] ?? k}`).join(" · ") || "—"}.
        </p>
      )}
      <Panel
        title="Activiteiten"
        bodyClassName=""
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={verdict} onChange={(e) => pick(e.target.value, filter)}>
              <option value="">Alle uitkomsten</option>
              {Object.entries(VERDICT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={filter} onChange={(e) => pick(verdict, e.target.value)}>
              <option value="">Alle activiteiten</option>
              <option value="unresearched">Nog niet onderzocht</option>
              <option value="corrections">Correcties voorgesteld</option>
              <option value="shared_email">Deelt e-mailadres</option>
              <option value="no_email">Geen e-mailadres</option>
              <option value="email_problem">E-mailprobleem</option>
              <option value="duplicate">Dubbel</option>
              <option value="agent">Webonderzoek</option>
              <option value="crawl">Website-controle</option>
            </Select>
            <Input placeholder="zoek op naam…" value={qInput} onChange={(e) => { setQInput(e.target.value); setPage(1); }} className="w-48" />
          </div>
        }
      >
        {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && (
          <>
            <Table>
              <thead>
                <tr><Th>Activiteit</Th><Th>Uitkomst</Th><Th>Onderzoek</Th><Th>E-mail</Th><Th /></tr>
              </thead>
              <tbody>
                {list.data.rows.length === 0 && <tr><Td className="py-6 text-center text-slate-400">Niets gevonden.</Td></tr>}
                {list.data.rows.map((r) => (
                  <Tr key={r.id} onClick={() => setOpenId(r.id)}>
                    <Td className="max-w-[260px]">
                      <span className="font-medium text-brand-600">{r.title}</span>
                      <div className="text-[11px] text-slate-400">{r.city ?? "—"} · {r.subcategory ?? "—"}</div>
                    </Td>
                    <Td>
                      {r.verdict ? <Badge tone={(VERDICT_TONE[r.verdict] ?? "slate") as never}>{VERDICT_LABEL[r.verdict]}</Badge> : <Badge tone="slate">niet onderzocht</Badge>}
                      {r.hasCorrections && <div className="mt-0.5"><Badge tone="amber">correctie voorgesteld</Badge></div>}
                    </Td>
                    <Td className="max-w-[320px] text-xs text-slate-600">
                      {r.existence ? <>{EXIST_LABEL[r.existence]} · {METHOD_LABEL[r.method ?? ""] ?? r.method}</> : "—"}
                      {r.note && <div className="truncate text-[11px] text-slate-500" title={r.note}>{r.note}</div>}
                    </Td>
                    <Td className="text-xs">
                      {r.emails}
                      {r.sharedEmail && <div><Badge tone="blue">gedeeld adres</Badge></div>}
                    </Td>
                    <Td><span className="text-xs text-brand-600">Details ›</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
      {openId && <ResearchDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => { list.reload(); summary.reload(); }} />}
    </>
  );
}

function ResearchDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useResource<Detail>(() => cc<Detail>(`/quality/activity/${id}/research`), `research-${id}`);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await fn());
      reload();
      onChanged();
    } catch (e) {
      setNotice(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const r = data?.research;
  const ev = r?.evidence ?? [];
  const verified = ev.filter((e) => e.status === "verified");
  const uncertain = ev.filter((e) => e.status !== "verified");
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside className="h-full w-full max-w-3xl overflow-y-auto bg-slate-50 p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Onderzoek">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900">{data?.activity.title ?? "…"}</h2>
            <Link to={`/admin/activities/${id}`} className="text-xs text-brand-600 hover:underline">Activiteit openen ›</Link>
          </div>
          <Btn variant="ghost" onClick={onClose}>Sluiten ✕</Btn>
        </div>
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {notice && <p className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800">{notice}</p>}
        {data && (
          <div className="space-y-4">
            <Panel title="Reeds aanwezig in de catalogus" bodyClassName="p-3">
              <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[13px]">
                <dt className="text-slate-500">Naam</dt><dd>{data.activity.title}</dd>
                <dt className="text-slate-500">Aanbieder</dt><dd>{data.activity.provider ?? "—"}</dd>
                <dt className="text-slate-500">Adres</dt><dd>{[data.activity.address, data.activity.city].filter(Boolean).join(", ") || "—"}</dd>
                <dt className="text-slate-500">Website</dt>
                <dd>{data.activity.websiteUrl ? <a href={data.activity.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{data.activity.websiteUrl} ↗</a> : "—"}</dd>
                <dt className="text-slate-500">Status</dt><dd>{data.activity.status}{data.activity.active ? "" : " · verborgen"}</dd>
                {data.audit && (<><dt className="text-slate-500">Regel-audit</dt><dd>{VERDICT_LABEL[data.audit.outcome]} · <span className="font-mono text-[11px]">{data.audit.rule}</span> · {data.audit.reason}</dd></>)}
              </dl>
            </Panel>

            {!r && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Nog niet onderzocht: er is nog geen bewijs voor deze activiteit.</p>}

            {r && (
              <Panel title="Onderzoeksresultaat" bodyClassName="p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge tone={(VERDICT_TONE[r.verdict] ?? "slate") as never}>{VERDICT_LABEL[r.verdict]}</Badge>
                  <span>{EXIST_LABEL[r.existence]}</span>
                  <span className="text-slate-400">· {METHOD_LABEL[r.method] ?? r.method} · {when(r.researchedAt)}</span>
                </div>
                {r.note && <p className="text-[13px] text-slate-700">{r.note}</p>}
                {r.duplicateOf && <p className="mt-1 text-[13px]">Mogelijk dubbel van <Link className="text-brand-600 hover:underline" to={`/admin/activities/${r.duplicateOf}`}>{r.duplicateOf}</Link> (niet samengevoegd).</p>}
              </Panel>
            )}

            {verified.length > 0 && (
              <Panel title={`Geverifieerd (${verified.length})`} bodyClassName="p-3">
                <EvidenceList items={verified} />
              </Panel>
            )}
            {uncertain.length > 0 && (
              <Panel title={`Onzeker of niet geverifieerd (${uncertain.length})`} bodyClassName="p-3">
                <EvidenceList items={uncertain} />
              </Panel>
            )}

            {r && r.corrections.length > 0 && (
              <Panel title="Voorgestelde correcties" bodyClassName="p-3">
                <p className="mb-2 text-[12px] text-slate-500">Er wordt niets toegepast zonder jouw klik. De waarde moet nog gelijk zijn aan wat het onderzoek zag.</p>
                <ul className="space-y-2 text-[13px]">
                  {r.corrections.map((c) => (
                    <li key={c.field} className="rounded-md border border-slate-200 bg-white p-2.5">
                      <div className="font-semibold">{FIELD_LABEL[c.field] ?? c.field} <Badge tone={c.verified ? "green" : "amber"}>{c.verified ? "bron bevestigd" : "niet automatisch bevestigd"}</Badge></div>
                      <div className="mt-1 grid grid-cols-[60px_1fr] gap-y-0.5"><span className="text-slate-500">Nu</span><span className="line-through decoration-rose-400">{c.from || "—"}</span><span className="text-slate-500">Wordt</span><span className="font-medium text-emerald-700">{c.to}</span></div>
                      {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">bron ↗</a>}
                      {c.quote && <div className="text-[11px] italic text-slate-500">“{c.quote}”</div>}
                      {["address", "city", "website_url", "title", "provider"].includes(c.field) && (
                        <Btn className="mt-1.5 !px-2 !py-1" disabled={busy} onClick={() => act(async () => {
                          const x = await cc<{ applied: string[]; note: string | null }>(`/quality/activity/${id}/corrections`, { method: "POST", body: { fields: [c.field] } });
                          return `Toegepast: ${x.applied.join(", ")}.${x.note ? ` ${x.note}` : ""}`;
                        })}>Toepassen</Btn>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {r && r.sources.length > 0 && (
              <Panel title={`Gebruikte bronnen (${r.sources.length})`} bodyClassName="p-3">
                <ul className="space-y-0.5 text-[13px]">
                  {r.sources.map((s) => (
                    <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">{s.url} ↗</a> <span className="text-xs text-slate-400">{s.kind} · {s.checkedAt}</span></li>
                  ))}
                </ul>
              </Panel>
            )}

            <Panel title={`E-mailadressen (${data.contacts.length})`} bodyClassName="p-3">
              {data.contacts.length === 0 && <p className="text-[13px] text-slate-500">Geen e-mailadres gekoppeld aan deze activiteit (dat is op zich geen reden om haar uit te sluiten).</p>}
              <div className="space-y-2">
                {data.contacts.map((c) => (
                  <div key={c.contactId} className="rounded-md border border-slate-200 bg-white p-2.5 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{c.email}</span>
                      <Badge tone={(EV_TONE[c.evidenceStatus.toLowerCase()] ?? "slate") as never}>{EV_LABEL[c.evidenceStatus.toLowerCase()] ?? c.evidenceStatus}</Badge>
                      <Badge tone="slate">{SCOPE_LABEL[c.scope] ?? c.scope}</Badge>
                      {c.relation && <Badge tone="blue">gedeeld · {REL_LABEL[c.relation]}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Waarom gekoppeld: {c.linkSource === "domain" ? "zelfde website als de activiteit" : c.linkSource === "page" ? "staat op de pagina van de activiteit" : "handmatig"}.
                      {(c.evidenceUrl || c.linkEvidenceUrl) && <> Bron: <a href={(c.evidenceUrl || c.linkEvidenceUrl)!} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">pagina ↗</a>.</>}
                      {c.evidenceNote && <> {c.evidenceNote}</>}
                    </div>
                    {c.sharedWith.length > 0 && (
                      <div className="mt-1.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                        Dit adres staat ook bij ({c.sharedWith.length}):
                        <ul>
                          {c.sharedWith.map((o) => (
                            <li key={o.id}>• {o.title}{o.city ? ` (${o.city})` : ""}{o.distanceM != null ? ` · ${o.distanceM < 1000 ? `${o.distanceM} m` : `${(o.distanceM / 1000).toFixed(1)} km`} verderop` : ""}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">Dit adres is voor:</span>
                      <Select value={c.scope} onChange={(e) => act(async () => { await cc(`/quality/link/${id}/${c.contactId}`, { method: "POST", body: { scope: e.target.value } }); return "Koppeling aangepast."; })}>
                        {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                      <Btn variant="ghost" className="!px-2 !py-0.5 text-rose-600" disabled={busy} onClick={() => act(async () => { await cc(`/quality/link/${id}/${c.contactId}`, { method: "POST", body: { status: "invalid", note: "Door de eigenaar als onjuist gemarkeerd." } }); return "Koppeling als onjuist gemarkeerd."; })}>Onjuist</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
              <Btn variant="primary" disabled={busy} onClick={() => act(async () => { await cc(`/quality/activity/${id}`, { method: "POST", body: { decision: "approve" } }); return "Goedgekeurd en zichtbaar."; })}>Goedkeuren</Btn>
              <Btn disabled={busy} onClick={() => act(async () => { await cc(`/quality/activity/${id}`, { method: "POST", body: { decision: "manual" } }); return "Voor handmatige controle gemarkeerd."; })}>Handmatige controle</Btn>
              <Btn variant="danger" disabled={busy} onClick={() => window.confirm("Uitsluiten (verbergen, herstelbaar)?") && act(async () => { await cc(`/quality/activity/${id}`, { method: "POST", body: { decision: "exclude" } }); return "Uitgesloten (verborgen, herstelbaar)."; })}>Uitsluiten</Btn>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function EvidenceList({ items }: { items: EvItem[] }) {
  return (
    <ul className="space-y-2 text-[13px]">
      {items.map((e, i) => (
        <li key={`${e.field}-${i}`} className="rounded-md border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{FIELD_LABEL[e.field] ?? e.field}</span>
            <Badge tone={(EV_TONE[e.status] ?? "slate") as never}>{EV_LABEL[e.status] ?? e.status}</Badge>
            {e.machineChecked && <span className="text-[11px] text-emerald-700">citaat op de bron teruggevonden</span>}
          </div>
          <div className="text-slate-700">{e.verified || e.found || "—"}{e.found && e.verified && e.found !== e.verified ? <span className="text-slate-400"> (catalogus: {e.found})</span> : null}</div>
          {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">bron ↗</a>}
          {e.quote && <div className="text-[11px] italic text-slate-500">“{e.quote}”</div>}
          {e.note && <div className="text-[11px] text-slate-500">{e.note}</div>}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ shared e-mail view ------------------------------ */

interface SharedRow {
  contactId: string;
  email: string;
  role: string;
  evidenceStatus: string;
  n: number;
  relation: string;
  activities: { id: string; title: string; city: string | null; address: string | null; websiteUrl: string | null; scope: string; linkStatus: string; evidenceUrl: string | null; verdict: string | null; existence: string | null }[];
}

export function SharedEmailsTab() {
  const [relation, setRelation] = useState("");
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 350);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const key = `${relation}|${q}|${page}`;
  const list = useResource<{ rows: SharedRow[]; total: number; page: number; pageCount: number }>(
    () => cc(`/quality/shared-emails?relation=${relation}&q=${encodeURIComponent(q)}&page=${page}`),
    `shared-${key}`,
  );
  return (
    <>
      <p className="mb-3 max-w-3xl text-[13px] text-slate-600">
        Eén e-mailadres kan bij meerdere activiteiten staan. Dat betekent <b>niet</b> dat het dezelfde activiteit of locatie is: elke activiteit blijft een eigen record. Hieronder zie je per adres
        welke activiteiten eronder vallen en of ze op dezelfde of op verschillende locaties liggen.
      </p>
      <Panel
        title={`Gedeelde e-mailadressen${list.data ? ` (${fmtNum(list.data.total)})` : ""}`}
        bodyClassName=""
        right={
          <div className="flex items-center gap-2">
            <Select value={relation} onChange={(e) => { setRelation(e.target.value); setPage(1); }}>
              <option value="">Alle relaties</option>
              <option value="same_location">Zelfde locatie</option>
              <option value="different_locations">Verschillende locaties</option>
              <option value="unknown">Locatie onbekend</option>
            </Select>
            <Input placeholder="zoek e-mailadres…" value={qInput} onChange={(e) => { setQInput(e.target.value); setPage(1); }} className="w-52" />
          </div>
        }
      >
        {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && (
          <>
            <div className="divide-y divide-slate-100">
              {list.data.rows.length === 0 && <p className="px-3 py-6 text-center text-slate-400">Geen gedeelde adressen gevonden.</p>}
              {list.data.rows.map((r) => (
                <div key={r.contactId} className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-mono font-semibold">{r.email}</span>
                    <Badge tone="blue">{r.n} activiteiten</Badge>
                    <Badge tone={r.relation === "same_location" ? "amber" : "slate"}>{REL_LABEL[r.relation]}</Badge>
                    <Badge tone={(EV_TONE[r.evidenceStatus] ?? "slate") as never}>{EV_LABEL[r.evidenceStatus] ?? r.evidenceStatus}</Badge>
                  </div>
                  <ul className="mt-1.5 space-y-1 text-[13px]">
                    {r.activities.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <button type="button" className="text-left font-medium text-brand-600 hover:underline" onClick={() => setOpenId(a.id)}>{a.title}</button>
                        <span className="text-xs text-slate-400">{[a.address, a.city].filter(Boolean).join(", ") || "adres onbekend"}</span>
                        {a.verdict && <Badge tone={(VERDICT_TONE[a.verdict] ?? "slate") as never}>{VERDICT_LABEL[a.verdict]}</Badge>}
                        <span className="text-[11px] text-slate-500">adres voor: {SCOPE_LABEL[a.scope] ?? a.scope} · {EV_LABEL[a.linkStatus] ?? a.linkStatus}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <Pager page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
      {openId && <ResearchDetail id={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </>
  );
}
