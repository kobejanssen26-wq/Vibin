import { useState } from "react";
import { cc } from "../api";
import { useDebounced, useResource } from "../lib";
import {
  Badge,
  Btn,
  ErrorNote,
  Input,
  Loading,
  Pager,
  PageTitle,
  Panel,
  Select,
  StatTile,
  Table,
  Td,
  Th,
  Tr,
  fmtDate,
  fmtNum,
} from "../ui";
import { OrgPanel } from "./OutreachOrgPanel";
import { MSG_LABEL, MSG_TONE, VERIFY_LABEL, VERIFY_TONE } from "./OutreachShared";
import { OutreachCampaign, OutreachImport, OutreachSent, OutreachSettings, OutreachSuppressions } from "./OutreachTabs";

export interface OrgRow {
  id: string;
  name: string;
  domain: string;
  websiteUrl: string;
  activityCount: number;
  discoveryStatus: string;
  discoveryNote: string | null;
  excluded: boolean;
  excludedReason: string | null;
  reviewFlag: string | null;
  groupConfidence: "unchecked" | "high" | "medium" | "low";
  groupConfirmed: boolean;
  includedCount: number;
  contactId: string | null;
  email: string | null;
  kind: string | null;
  verification: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  contactCount: number;
  messageId: string | null;
  messageStatus: string | null;
  messageTest: boolean;
  activities: string | null;
  lastAction: number | null;
}
interface ListResp {
  rows: OrgRow[];
  total: number;
  page: number;
  pageCount: number;
}
interface Summary {
  orgs: number;
  discovery: Record<string, number>;
  messages: Record<string, number>;
  usableContacts: number;
  sentLive: number;
  sentLast24h: number;
  suppressions: number;
  runningCampaigns: number;
}
interface ConfigResp {
  config: { mode: "test" | "live" };
  readiness: { ready: boolean; blockers: string[] };
}

const KIND_LABEL: Record<string, string> = { generic: "algemeen", personal: "persoonlijk", unknown: "onbekend" };
const DISC_LABEL: Record<string, string> = {
  pending: "Nog te controleren",
  found: "Adres gevonden",
  none: "Geen adres op site",
  error: "Site niet bereikbaar",
  skipped: "Overgeslagen",
};

type Tab = "orgs" | "sent" | "campaign" | "suppress" | "settings" | "import";

export function Outreach() {
  const [tab, setTab] = useState<Tab>("orgs");
  const summary = useResource<Summary>(() => cc<Summary>("/outreach/summary"), "outreach-summary");
  const config = useResource<ConfigResp>(() => cc<ConfigResp>("/outreach/config"), "outreach-config-top");
  const live = config.data?.config.mode === "live";

  const tabs: [Tab, string][] = [
    ["orgs", "Aanbieders"],
    ["sent", "Verzonden"],
    ["campaign", "Campagne"],
    ["suppress", "Uitsluitingen"],
    ["settings", "Instellingen"],
    ["import", "Import / export"],
  ];

  return (
    <>
      <PageTitle
        title="Outreach"
        right={
          <Badge tone={live ? "red" : "blue"}>
            {live ? "LIVE — echte verzending aan" : "TESTMODUS — er gaat niets naar echte ontvangers"}
          </Badge>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Aanbieders" value={fmtNum(summary.data?.orgs ?? 0)} hint={`${fmtNum(summary.data?.discovery.pending ?? 0)} nog te controleren`} />
        <StatTile label="Adres gevonden" value={fmtNum(summary.data?.discovery.found ?? 0)} />
        <StatTile label="Bruikbaar" value={fmtNum(summary.data?.usableContacts ?? 0)} hint="algemeen + gecontroleerd" />
        <StatTile
          label="Concept / goedgekeurd"
          value={`${fmtNum(summary.data?.messages.draft ?? 0)} / ${fmtNum((summary.data?.messages.approved ?? 0) + (summary.data?.messages.queued ?? 0))}`}
        />
        <StatTile label="Echt verzonden" value={fmtNum(summary.data?.sentLive ?? 0)} hint={`${fmtNum(summary.data?.sentLast24h ?? 0)} laatste 24 u`} />
      </div>

      <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${
              tab === k ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orgs" && <OrgsTab onChanged={() => summary.reload()} />}
      {tab === "sent" && <OutreachSent />}
      {tab === "campaign" && <OutreachCampaign onChanged={() => summary.reload()} />}
      {tab === "suppress" && <OutreachSuppressions />}
      {tab === "settings" && <OutreachSettings onChanged={() => { config.reload(); summary.reload(); }} />}
      {tab === "import" && <OutreachImport onChanged={() => summary.reload()} />}
    </>
  );
}

function OrgsTab({ onChanged }: { onChanged: () => void }) {
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 350);
  const [verification, setVerification] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [group, setGroup] = useState("");
  const [ready, setReady] = useState(false);
  const [discovery, setDiscovery] = useState("");
  const [excluded, setExcluded] = useState("hide");
  const [uncontacted, setUncontacted] = useState(false);
  const [usable, setUsable] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = `q=${encodeURIComponent(q)}&verification=${verification}&emailStatus=${emailStatus}&group=${group}&ready=${ready ? 1 : 0}&discovery=${discovery}&excluded=${excluded}&uncontacted=${uncontacted ? 1 : 0}&usable=${usable ? 1 : 0}&page=${page}&pageSize=25`;
  const { data, loading, error, reload } = useResource<ListResp>(() => cc<ListResp>(`/outreach/orgs?${query}`), query);

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setNotice(null);
    try {
      setNotice(await fn());
      reload();
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Mislukt.");
    } finally {
      setBusy(null);
    }
  };
  const setF = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /** Preview (rebuilds the drafts) → one confirmation → approve + queue + first batch. */
  const sendFlow = async (orgIds: string[], extra = "") => {
    const p = await cc<{
      mode: "test" | "live"; from: { name: string; email: string }; testInbox: string | null; ready: number; fingerprint: string;
      recipients: { toEmail: string; org: string; activities: string[] }[];
      blocked: { org: string; toEmail: string | null; reasons: string[] }[];
      sampleSubject: string | null; sampleText: string | null;
      pace: { perRun: number; everyMinutes: number; dailyCap: number };
    }>("/outreach/send-selected/preview", { method: "POST", body: { orgIds } });
    const blockedTxt = p.blocked.length
      ? `\n\nNiet verzonden (${p.blocked.length}):\n` + p.blocked.slice(0, 8).map((b) => `• ${b.org}: ${b.reasons[0]}`).join("\n") + (p.blocked.length > 8 ? `\n… en ${p.blocked.length - 8} meer` : "")
      : "";
    if (p.ready === 0) return `Niets om te verzenden.${blockedTxt}`;
    const list = p.recipients.slice(0, 12).map((r) => `• ${r.org} → ${r.toEmail}${r.activities.length ? ` (${r.activities.length} act.)` : ""}`).join("\n");
    const where = p.mode === "live" ? "ECHT verzenden" : `TEST: gaat naar ${p.testInbox ?? "niemand (dry-run)"}`;
    const msg = `${where}\nVan: ${p.from.name} <${p.from.email}>\n\n${p.ready} mails:\n${list}${p.ready > 12 ? `\n… en ${p.ready - 12} meer` : ""}${blockedTxt}\n\nOnderwerp: ${p.sampleSubject}\n\nTempo: ${p.pace.perRun} per ${p.pace.everyMinutes} min, max ${p.pace.dailyCap} per dag.\n\nVerzenden starten?${extra}`;
    if (!window.confirm(msg)) return "Niet verzonden.";
    const r = await cc<{ queued: number; sent: number; failed: unknown[] }>("/outreach/send-selected", {
      method: "POST",
      body: { orgIds, fingerprint: p.fingerprint, expectedCount: p.ready },
    });
    setSelected(new Set());
    return `${r.sent} nu verzonden, ${r.queued - r.sent} volgen op tempo${r.failed.length ? `, ${r.failed.length} geweigerd` : ""}. Zie het tabblad Verzonden.`;

  };

  return (
    <>
      <Panel
        bodyClassName="p-3"
        className="mb-3"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              loading={busy === "sync"}
              onClick={() =>
                run("sync", async () => {
                  const r = await cc<{ orgs: number; added: number }>("/outreach/sync", { method: "POST", body: {} });
                  return `${r.added} nieuwe aanbieders toegevoegd (totaal ${r.orgs}).`;
                })
              }
            >
              Aanbieders bijwerken
            </Btn>
            <Btn
              variant="primary"
              loading={busy === "next"}
              onClick={() =>
                run("next", async () => {
                  const r = await cc<{ orgIds: string[]; total: number }>("/outreach/ready-orgs?limit=15");
                  if (!r.orgIds.length) return "Geen aanbieders die klaar zijn om te sturen. De adressen worden automatisch verder gezocht.";
                  return sendFlow(r.orgIds, `\n\n(Er zijn ${r.total} aanbieders klaar; dit zijn de beste ${r.orgIds.length}.)`);
                })
              }
            >
              Verstuur naar de volgende 15 klare
            </Btn>
            <Btn
              variant="primary"
              loading={busy === "bulk"}
              onClick={() =>
                run("bulk", async () => {
                  const p = await cc<{
                    mode: string; ready: number; fingerprint: string; more: boolean; blockedCount: number;
                    sample: { toEmail: string; org: string | null; subject: string; activities: number }[];
                    sampleText: string | null;
                  }>("/outreach/bulk-approve/preview");
                  if (p.ready === 0) return `Geen concepten om goed te keuren (${p.blockedCount} geblokkeerd).`;
                  const lines = p.sample.map((x) => `• ${x.org ?? x.toEmail} → ${x.toEmail} (${x.activities} activiteit${x.activities === 1 ? "" : "en"})`).join("\n");
                  const msg = `${p.mode === "live" ? "ECHT" : "TEST"}: ${p.ready} concepten goedkeuren?\n\n${lines}${p.ready > p.sample.length ? `\n… en ${p.ready - p.sample.length} meer` : ""}\n\nVoorbeeldtekst:\n${(p.sampleText ?? "").slice(0, 600)}…\n\n${p.blockedCount} geblokkeerde concepten blijven liggen.${p.more ? "\nEr zijn er meer dan 300: doe dit daarna nog een keer." : ""}\nGoedkeuren verzendt niets; daarna start je de campagne.`;
                  if (!window.confirm(msg)) return "Niet goedgekeurd.";
                  const r = await cc<{ approved: number; failedCount: number }>("/outreach/bulk-approve", {
                    method: "POST",
                    body: { fingerprint: p.fingerprint, expectedCount: p.ready },
                  });
                  return `${r.approved} goedgekeurd${r.failedCount ? `, ${r.failedCount} mislukt (open ze om te zien waarom)` : ""}. Start nu de campagne om te verzenden.`;
                })
              }
            >
              Alle klare concepten goedkeuren
            </Btn>
            <Btn
              loading={busy === "discover"}
              onClick={() =>
                run("discover", async () => {
                  const r = await cc<{ checked: number; found: number }>("/outreach/discover", { method: "POST", body: { limit: 8 } });
                  return `${r.checked} websites gecontroleerd, bij ${r.found} een adres gevonden.`;
                })
              }
            >
              Zoek contactgegevens (8)
            </Btn>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="activiteit, aanbieder, e-mailadres…"
            value={qInput}
            onChange={(e) => { setQInput(e.target.value); setPage(1); }}
            className="w-64"
          />
          <Select value={verification} onChange={(e) => setF(setVerification)(e.target.value)}>
            <option value="">Alle verificaties</option>
            <option value="checked">Gecontroleerd</option>
            <option value="uncertain">Onzeker</option>
            <option value="unverified">Ongeverifieerd</option>
            <option value="none">Geen adres</option>
          </Select>
          <Select value={emailStatus} onChange={(e) => setF(setEmailStatus)(e.target.value)}>
            <option value="">Alle e-mailstatussen</option>
            <option value="not_prepared">Nog niet voorbereid</option>
            <option value="ready_for_review">Klaar voor controle</option>
            <option value="approved">Goedgekeurd</option>
            <option value="sent">Verzonden</option>
            <option value="error">Fout</option>
          </Select>
          <Select value={group} onChange={(e) => setF(setGroup)(e.target.value)} title="Groepering van activiteiten">
            <option value="">Alle groeperingen</option>
            <option value="needs_confirm">Te bevestigen (onzeker)</option>
            <option value="multi">Meerdere activiteiten</option>
            <option value="low">Onzeker</option>
            <option value="medium">Waarschijnlijk zeker</option>
            <option value="high">Zeker</option>
          </Select>
          <Select value={discovery} onChange={(e) => setF(setDiscovery)(e.target.value)}>
            <option value="">Alle ontdekkingsstatussen</option>
            {Object.entries(DISC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={excluded} onChange={(e) => setF(setExcluded)(e.target.value)}>
            <option value="hide">Uitgesloten verbergen</option>
            <option value="only">Alleen uitgesloten</option>
            <option value="all">Alles tonen</option>
          </Select>
          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <input type="checkbox" checked={ready} onChange={(e) => setF(setReady)(e.target.checked)} />
            Klaar om te sturen
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-700">
            <input type="checkbox" checked={uncontacted} onChange={(e) => setF(setUncontacted)(e.target.checked)} />
            Nog niet gecontacteerd
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-700">
            <input type="checkbox" checked={usable} onChange={(e) => setF(setUsable)(e.target.checked)} />
            Alleen bruikbaar
          </label>
        </div>
        {notice && <p className="mt-2 text-[13px] text-slate-700">{notice}</p>}
        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-[13px]">
            <span className="font-semibold">{selected.size} geselecteerd.</span>
            <span className="text-slate-500">Voorbereiden maakt alleen concepten; er wordt niets verzonden.</span>
            <Btn
              variant="primary"
              loading={busy === "prepare"}
              onClick={() =>
                run("prepare", async () => {
                  const r = await cc<{ created: number; updated: number; skipped: unknown[] }>("/outreach/prepare-bulk", {
                    method: "POST",
                    body: { orgIds: [...selected].slice(0, 100) },
                  });
                  setSelected(new Set());
                  return `Concepten: ${r.created} nieuw, ${r.updated} bijgewerkt, ${r.skipped.length} overgeslagen.`;
                })
              }
            >
              Concepten voorbereiden
            </Btn>
            <Btn
              variant="primary"
              loading={busy === "sendsel"}
              onClick={() =>
                run("sendsel", async () => sendFlow([...selected].slice(0, 15)))
              }
            >
              Verstuur naar geselecteerde
            </Btn>
            <Btn variant="ghost" onClick={() => setSelected(new Set())}>Selectie wissen</Btn>
          </div>
        )}
      </Panel>

      <Panel bodyClassName="">
        {error && <ErrorNote message={error} onRetry={reload} />}
        {loading && !data && <Loading />}
        {data && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th />
                  <Th>Activiteit</Th>
                  <Th>Aanbieder</Th>
                  <Th>Groep</Th>
                  <Th>Website</Th>
                  <Th>E-mailadres</Th>
                  <Th>Bron</Th>
                  <Th>Verificatie</Th>
                  <Th>E-mailstatus</Th>
                  <Th>Laatste actie</Th>
                  <Th>Acties</Th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <Td className="py-8 text-center text-slate-400">
                      Geen aanbieders. Klik eerst op “Aanbieders bijwerken”, daarna op “Zoek contactgegevens”.
                    </Td>
                  </tr>
                )}
                {data.rows.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <input type="checkbox" aria-label={`Selecteer ${o.name}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                    </Td>
                    <Td className="max-w-[220px] text-xs text-slate-600">
                      <div className="truncate" title={o.activities ?? ""}>{o.activities ?? "—"}</div>
                      {o.activityCount > 3 && <div className="text-[11px] text-slate-400">+{o.activityCount - 3} meer</div>}
                    </Td>
                    <Td>
                      <button type="button" className="text-left font-medium text-brand-600 hover:underline" onClick={() => setOpenId(o.id)}>
                        {o.name}
                      </button>
                      {o.excluded && <div className="text-[11px] text-rose-600">uitgesloten: {o.excludedReason}</div>}
                      {o.reviewFlag && <div className="text-[11px] text-amber-600">controleer: {({ many_names_one_domain: "veel namen, één domein", public_body: "overheids-, erfgoed- of bibliotheeksite", multiple_addresses: "meerdere adressen" } as Record<string, string>)[o.reviewFlag] ?? o.reviewFlag}</div>}
                    </Td>
                    <Td className="text-xs">
                      {o.activityCount > 1 ? (
                        <>
                          <Badge tone={(({ high: "green", medium: "blue", low: "amber", unchecked: "slate" } as Record<string, string>)[o.groupConfidence] ?? "slate") as never}>
                            {({ high: "zeker", medium: "waarschijnlijk", low: "onzeker", unchecked: "?" } as Record<string, string>)[o.groupConfidence]}
                          </Badge>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            {o.includedCount}/{o.activityCount} in mail{o.groupConfirmed ? " · bevestigd" : ""}
                          </div>
                        </>
                      ) : <span className="text-slate-400">1 activiteit</span>}
                    </Td>
                    <Td className="text-xs">
                      <a href={/^https?:/i.test(o.websiteUrl) ? o.websiteUrl : `https://${o.websiteUrl}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                        {o.domain}
                      </a>
                    </Td>
                    <Td className="text-xs">
                      {o.email ? (
                        <>
                          <div className="font-mono">{o.email}</div>
                          <div className="text-[11px] text-slate-400">{KIND_LABEL[o.kind ?? "unknown"]}{o.contactCount > 1 ? ` · +${o.contactCount - 1}` : ""}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">{DISC_LABEL[o.discoveryStatus] ?? o.discoveryStatus}</span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {o.sourceUrl ? (
                        <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                          {o.sourceType === "manual" ? "handmatig" : o.sourceType === "csv" ? "csv" : "website"} ↗
                        </a>
                      ) : "—"}
                    </Td>
                    <Td>
                      {o.verification ? (
                        <Badge tone={(VERIFY_TONE[o.verification] ?? "slate") as never}>{VERIFY_LABEL[o.verification]}</Badge>
                      ) : "—"}
                    </Td>
                    <Td>
                      {o.messageStatus ? (
                        <Badge tone={(MSG_TONE[o.messageStatus] ?? "slate") as never}>
                          {MSG_LABEL[o.messageStatus]}{o.messageTest ? " (test)" : ""}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Nog niet voorbereid</span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500">{fmtDate(o.lastAction)}</Td>
                    <Td>
                      <Btn variant="neutral" className="!px-2 !py-1" onClick={() => setOpenId(o.id)}>Bekijken</Btn>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      {openId && (
        <OrgPanel
          orgId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => { reload(); onChanged(); }}
        />
      )}
    </>
  );
}

